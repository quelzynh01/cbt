import { Board, key, sameCell, type MapDef } from './board';
import {
  ALL_HEROES, ATTACK_DIE, CARDS, DEFENSE_DIE, ENTRY_PAIRS, EXPLORATION_BAG, GUILDS, HEROES, HERO_ORDER, MONSTERS, TOKEN_INFO, distributeStartingGear, levelSuffix, lowerSuffix,
} from './data';
import { nextRandom, randInt, shuffle } from './rng';
import { CURSES, type CardFx } from './cards';
import { TITLES } from './titles';
import type {
  MonsterDef, RerollInfo,
  Activation, AttackType, CardDef, CardInst, Cell, DiceMode, DieFace, GameEvent, GameState, GuildId, GuildState, MissionDef, Token, Unit,
} from './types';

export interface PathNode {
  cell: Cell;
  mp: number; // pontos de Movimento gastos até aqui
  cost: number; // mp + pequena penalidade por Reações de Alerta (desempate)
  prev: string | null;
  door?: string; // porta aberta ao entrar neste nó
  portal?: boolean;
  canEnd: boolean;
}

export interface RollResult { faces: DieFace[]; successes: number; crits: number; rerolled?: number; rr?: RerollInfo }

/** Pedido de Rerrolagem para o jogador que controla o Herói. */
export interface RerollRequest { heroId: string; kind: 'attack' | 'defense'; faces: DieFace[]; success: DieFace; rerolls: number;
  /** Defesa: quem atacou e os dados do ataque (mostrados antes). */
  vs?: { id: string; faces: DieFace[]; hits: number; type: string } }

/** Lançado quando o jogador precisa decidir (a jogada é desfeita e repetida com a decisão). */
export class NeedDecision extends Error {
  req: RerollRequest;
  constructor(req: RerollRequest) { super('decisão necessária'); this.req = req; }
}

type DamageSource = { kind: 'hero' | 'monster' | 'trap'; id?: string };

export interface NewGameOptions {
  seed?: number;
  players: { guild: GuildId; controller: 'human' | 'ai'; heroes?: string[]; cards?: Record<string, string[]>; curses?: Record<string, string>; name?: string }[];
  /** Nível dos Monstros ('1', '2-3', '4-5', '6'). Padrão: o do mapa. */
  level?: string;
  /** Títulos já conquistados na campanha. */
  titles?: Partial<Record<GuildId, string[]>>;
  /** true: jogadores na ordem dada (1º = Área Inicial 1 e começa jogando). Usado no Modo Teste. */
  fixedOrder?: boolean;
  /** true: as Guildas humanas posicionam os Heróis na Área Inicial antes do 1º turno. */
  deploy?: boolean;
}

const FREE_MP = 99;

/** Id base de um Monstro (sem o nível): 'orc4' -> 'orc'. */
export const baseId = (id: string) => id.replace(/\d+$/, '');

/** Opções do Descanso: cartas (uids) e marcadores (ids) por Herói, e onde cada morto ressuscita. */
export interface RestOptions {
  cards?: Record<string, string[]>;
  tokens?: Record<string, string[]>;
  resurrect?: Record<string, Cell>;
}

export class Game {
  readonly map: MapDef;
  readonly board: Board;
  s: GameState;
  private out: GameEvent[] = [];
  /** Quem decide a Rerrolagem dos Heróis: índices dos dados a rerrolar ou 'auto' (todos os que falharam). */
  rerollHook: ((req: RerollRequest) => number[] | 'auto') | null = null;
  /** Ataque sendo resolvido (para mostrar os dados do atacante na Rerrolagem da Defesa). */
  private curAttack: RerollRequest['vs'] | null = null;

  constructor(map: MapDef, state: GameState) {
    this.map = map;
    this.s = state;
    this.board = new Board(map, () => this.s.doors);
  }

  // =========================================================================
  // Preparação do cenário (p.10-12)
  // =========================================================================
  static create(map: MapDef, opts: NewGameOptions): Game {
    const seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0;
    const s: GameState = {
      rng: seed,
      mapId: map.id,
      doors: map.doors.map((d, i) => ({ id: `d${i}`, a: d.a, b: d.b, open: d.open, small: d.small, locked: d.locked })),
      units: {},
      guildOrder: [],
      guilds: {},
      current: 0,
      activation: null,
      extraTurn: false,
      floor: {},
      entryBoard: [],
      entryMarkers: [],
      missions: [],
      missionDone: {},
      rewardDeck: map.missions.rewards.slice(),
      missionsToWin: map.missionsToWin ?? (opts.players.length <= 2 ? 2 : 3),
      mines: [],
      winner: null,
      turn: 1,
      pending: null,
      debug: { attackDice: 'normal', defenseDice: 'normal', revealTokens: false, heroesImmortal: false, freeMode: false },
    };
    const g = new Game(map, s);
    const suffix = levelSuffix(opts.level ?? map.level);
    s.level = opts.level ?? map.level ?? '1';
    s.titles = JSON.parse(JSON.stringify(opts.titles ?? {}));
    for (let i = 0; i < 4; i++) nextRandom(s); // aquece o RNG (seeds próximas não ficam correlacionadas)

    // Áreas iniciais sorteadas. Com 2 jogadores usam-se apenas as Áreas 1 e 2.
    const areas = opts.fixedOrder ? opts.players.map((_, i) => i) : shuffle(s, opts.players.map((_, i) => i));
    // Jogador inicial sorteado; a ordem segue o sentido horário das áreas.
    const players = opts.players.map((p, i) => ({ ...p, area: areas[i] })).sort((a, b) => a.area - b.area);
    const first = opts.fixedOrder ? 0 : randInt(s, players.length);
    s.guildOrder = players.map((_, i) => players[(first + i) % players.length].guild);

    // Cada Herói só pode estar em uma Guilda: quem não trouxe Heróis (IA) recebe os que sobraram.
    const taken = new Set<string>();
    for (const p of players) if (p.heroes) {
      const uniq = p.heroes.filter(h => HEROES[h] && !taken.has(h)).slice(0, 3);
      uniq.forEach(h => taken.add(h));
      p.heroes = uniq.length === 3 ? uniq : undefined;
    }
    for (const p of players) if (!p.heroes) {
      const free = shuffle(s, ALL_HEROES.filter(h => !taken.has(h)));
      const pick = [...HERO_ORDER.filter(h => !taken.has(h)), ...free.filter(h => !HERO_ORDER.includes(h))].slice(0, 3);
      pick.forEach(h => taken.add(h));
      p.heroes = pick;
    }

    let num = 1;
    let uid = 0;
    for (const p of players) {
      const meta = GUILDS[p.guild];
      const label = p.name?.trim().slice(0, 20) || undefined;
      const gs: GuildState = {
        id: p.guild, name: label ?? meta.name, color: meta.color, controller: p.controller,
        coins: 0, missions: [], startArea: p.area, monsterKills: 0, heroIds: [], ...(label ? { label } : {}),
      };
      const area = map.startAreas[p.area];
      const roster = p.heroes!;
      const gear = distributeStartingGear(roster);
      roster.forEach((hid, i) => {
        const id = `${p.guild}-${hid}`;
        const cards: CardInst[] = (p.cards?.[hid] ?? gear[hid]).filter(defId => CARDS[defId]).map(defId => ({ uid: `c${uid++}`, defId, exhausted: false, uses: 0 }));
        s.units[id] = {
          id, kind: 'hero', defId: hid, guild: p.guild, cell: { ...area[i % area.length] },
          wounds: 0, alive: true, stunned: false, cards, tokens: [], deaths: 0, num: num++,
          curse: p.curses?.[hid] && p.curses[hid] !== 'sem_maldicao' ? p.curses[hid] : undefined,
        };
        gs.heroIds.push(id);
      });
      s.guilds[p.guild] = gs;
    }

    map.monsters.forEach((m, i) => {
      const id = `m${i + 1}`;
      s.units[id] = {
        id, kind: 'monster', defId: baseId(m.type) + suffix, guild: null, cell: { ...m.cell },
        wounds: 0, alive: true, stunned: false, cards: [], tokens: [], deaths: 0, num: 0,
      };
    });
    // Monstros que só entram por regras do cenário (Sombra do Lorde Presas, Irmã escondida…)
    (map.reserve ?? []).forEach((type, i) => {
      const id = `r${i + 1}`;
      s.units[id] = {
        id, kind: 'monster', defId: baseId(type) + suffix, guild: null, cell: null,
        wounds: 0, alive: false, stunned: false, cards: [], tokens: [], deaths: 0, num: 0,
      };
    });
    // Título "Líder Rebelde" (Praça da Aurora Vermelha): a Resistência mata 2 Orcs perto da Área Inicial
    if (map.rebelTitle) for (const p of players) {
      if (!s.titles?.[p.guild]?.includes(map.rebelTitle)) continue;
      const a = map.startAreas[p.area][0];
      const d = (c: Cell) => Math.abs(c.c - a.c) + Math.abs(c.r - a.r);
      const orcs = Object.values(s.units).filter(u => u.kind === 'monster' && u.alive && u.cell && ['orc', 'capitao_orc'].includes(baseId(u.defId)))
        .sort((x, y) => d(x.cell!) - d(y.cell!)).slice(0, 2);
      for (const o of orcs) { o.alive = false; o.cell = null; }
      if (orcs.length) g.log(`Líder Rebelde: a Resistência eliminou ${orcs.length} Orcs perto da Área Inicial da ${GUILDS[p.guild].name}.`);
    }

    // Marcadores de Exploração: 14 embaralhados, 12 sorteados, face para baixo.
    // (Pátio da Universidade: marcadores de Missão escondidos entre os de Exploração)
    const hidden = map.hiddenMissions ?? [];
    const bag = shuffle(s, [
      ...shuffle(s, EXPLORATION_BAG).slice(0, map.exploration.length - hidden.length).map(t => ({ ...t, color: undefined as string | undefined })),
      ...hidden.map(color => ({ type: 'missao' as const, value: undefined, color })),
    ]);
    map.exploration.forEach((cell, i) => {
      const t = bag[i];
      g.addFloor(cell, { id: `x${i}`, type: t.type, value: t.value, color: t.color, faceUp: false });
    });
    map.missionMarkers.forEach((mm, i) => g.addFloor(mm.cell, { id: `mm${i}`, type: 'missao', color: mm.color, faceUp: true }));
    // marcador da cor de cada Guilda na ponta oposta à sua Área Inicial
    if (map.missionMarkersByArea) for (const p of players) {
      const cell = map.missionMarkersByArea[p.area];
      if (cell) g.addFloor(cell, { id: `mg-${p.guild}`, type: 'missao', color: p.guild, faceUp: true });
    }

    // Marcadores de Entrada de Monstro: 5 embaralhados, 4 usados.
    const pairs = shuffle(s, ENTRY_PAIRS);
    s.entryMarkers = map.entryMarkers.map((cell, i) => ({ cell, pair: pairs[i] }));

    // Missões: contra o Jogo + "Matar <cor>" para cada Guilda em jogo.
    s.missions = map.missions.pve.map(m => ({ ...m }));
    if (map.pvp !== false) for (const p of players) {
      s.missions.push({
        id: `matar_${p.guild}`, name: `Matar ${s.guilds[p.guild]!.label ?? GUILDS[p.guild].name.split(' (')[0].replace('Guilda ', '')}`,
        kind: 'pvp', targetGuild: p.guild, text: `Mate 1 Herói Inimigo ${s.guilds[p.guild]!.label ? `do time ${s.guilds[p.guild]!.label}` : `da ${GUILDS[p.guild].name.split(' (')[0]}`}.`,
      });
    }
    for (const m of s.missions) s.missionDone[m.id] = [];
    // todas as Guildas posicionam (a IA posiciona sozinha na hora: 2 Heróis no Espaço da porta)
    const deployers = opts.deploy ? s.guildOrder.slice() : [];
    if (deployers.length) s.deploying = deployers;
    else g.emit({ t: 'turn', guild: s.guildOrder[0], turn: 1 });
    return g;
  }

  // =========================================================================
  // Utilidades
  // =========================================================================
  emit(e: GameEvent) { this.out.push(e); }
  /** Retorna e limpa os eventos gerados desde a última chamada. */
  drain(): GameEvent[] {
    const e = this.out;
    this.out = [];
    return e;
  }
  /** Devolve eventos para a fila de saída (usado ao pular eventos já animados). */
  requeue(evs: GameEvent[]) { this.out = [...evs, ...this.out]; }
  log(text: string) { this.emit({ t: 'log', text }); }

  unit(id: string): Unit { return this.s.units[id]; }
  units(): Unit[] { return Object.values(this.s.units); }
  onBoard(): Unit[] { return this.units().filter(u => u.alive && u.cell); }
  unitsAt(c: Cell): Unit[] { return this.onBoard().filter(u => sameCell(u.cell, c)); }
  monstersOnBoard(): Unit[] { return this.onBoard().filter(u => u.kind === 'monster'); }
  guild(id: GuildId): GuildState { return this.s.guilds[id]!; }
  guilds(): GuildState[] { return this.s.guildOrder.map(g => this.guild(g)); }
  currentGuild(): GuildState { return this.guild(this.s.guildOrder[this.s.current]); }
  heroesOf(g: GuildId): Unit[] { return this.guild(g).heroIds.map(id => this.unit(id)); }
  cardDef(c: CardInst): CardDef { return CARDS[c.defId]; }
  name(u: Unit): string {
    if (u.kind === 'hero') return `${HEROES[u.defId].name} (${GUILDS[u.guild!].name.split(' (')[0].replace('Guilda ', '')})`;
    return MONSTERS[u.defId].name;
  }
  floorAt(c: Cell): Token[] { return this.s.floor[key(c)] ?? []; }
  private addFloor(c: Cell, t: Token) { (this.s.floor[key(c)] ??= []).push(t); }

  isEnemy(a: Unit, b: Unit): boolean {
    if (a.id === b.id) return false;
    if (a.kind === 'monster' && b.kind === 'monster') return false;
    if (a.kind === 'hero' && b.kind === 'hero') return a.guild !== b.guild;
    return true;
  }

  /** Livre / Ocupado (2 personagens, algum Aliado) / Bloqueado (2 Inimigos) para quem se move. */
  status(mover: Unit, c: Cell): 'free' | 'occupied' | 'blocked' {
    const others = this.unitsAt(c).filter(u => u.id !== mover.id);
    if (others.length < 2) return 'free';
    return others.every(o => this.isEnemy(mover, o)) ? 'blocked' : 'occupied';
  }

  cellBlocksFor(attacker: Unit) {
    return (c: Cell) => this.board.isPillar(c) || this.status(attacker, c) === 'blocked';
  }

  hasLOS(attacker: Unit, from: Cell, to: Cell): boolean {
    return this.board.hasLOS(from, to, this.cellBlocksFor(attacker));
  }

  monstersCloseTo(c: Cell): Unit[] {
    return this.monstersOnBoard().filter(m => this.board.isClose(m.cell!, c));
  }

  // =========================================================================
  // Cartas, habilidades e Maldições dos Heróis
  // =========================================================================
  /** Habilidade Natural (Amnésia anula). */
  ab(h: Unit): string | null {
    if (h.kind !== 'hero' || h.curse === 'amnesia') return null;
    return HEROES[h.defId].ability;
  }

  /** Soma de um efeito numérico das cartas Permanentes (e de todas as cartas para bônus de status). */
  private permFx<K extends keyof CardFx>(h: Unit, k: K): CardFx[K][] {
    return h.cards.map(c => this.cardDef(c)).filter(d => d.kind === 'permanent' && d.fx[k] !== undefined).map(d => d.fx[k]);
  }
  hasPerm(h: Unit, k: keyof CardFx): boolean { return this.permFx(h, k).length > 0; }

  /** Conjunto de Rerrolagem do Herói (p.27): soma das cartas, exaustadas ou não. */
  rerollsOf(h: Unit): number {
    if (h.kind !== 'hero') return MONSTERS[h.defId].rerolls;
    return h.cards.reduce((s, c) => s + (this.cardDef(c).rerolls ?? 0), 0);
  }

  isOrcLike(u: Unit): boolean { return u.kind === 'monster' && ['orc', 'goblin', 'capitao_orc'].includes(baseId(u.defId)); }

  /** Carta de Monstro usada contra um Herói (Título "Destruidor da Pedra Sangrenta": Orcs um nível abaixo). */
  monDef(m: Unit, vs?: Unit | null): MonsterDef {
    const md = MONSTERS[m.defId];
    if (vs?.kind === 'hero' && this.isOrcLike(m) && this.map.weakOrcsTitle && this.hasTitle(vs.guild!, this.map.weakOrcsTitle)) {
      const suf = m.defId.slice(baseId(m.defId).length);
      return MONSTERS[baseId(m.defId) + lowerSuffix(suf)] ?? md;
    }
    return md;
  }

  hasTitle(g: GuildId, t: string): boolean { return !!this.s.titles?.[g]?.includes(t); }

  isAttackCard(c: CardInst): boolean { return this.cardDef(c).kind === 'attack'; }

  /** Ampliações disponíveis para esta carta de Ataque. */
  boostsFor(h: Unit, card: CardInst): CardInst[] {
    const def = this.cardDef(card);
    return h.cards.filter(c => {
      const d = this.cardDef(c);
      if (d.kind !== 'boost' || c.exhausted) return false;
      const f = d.fx.boostFor ?? 'any';
      if (f === 'bow') return def.group === 'Arco';
      if (f === 'magic') return !!def.magic;
      if (f === 'melee_nonmagic') return def.attackType === 'melee' && !def.magic;
      return true;
    });
  }

  /** Cartas Permanentes com custo opcional (Grrrr!) que podem ser usadas neste ataque. */
  optionalPerms(h: Unit): CardInst[] {
    return h.cards.filter(c => { const d = this.cardDef(c); return d.kind === 'permanent' && !!d.fx.grrr && h.wounds + d.fx.grrr < this.maxHp(h); });
  }

  maxHp(u: Unit): number {
    if (u.kind === 'monster') return MONSTERS[u.defId].hp;
    const curse = u.curse ? CURSES[u.curse]?.hp ?? 0 : 0;
    return Math.max(1, HEROES[u.defId].hp + u.cards.reduce((s, c) => s + (this.cardDef(c).hpBonus ?? 0), 0) + curse);
  }

  defenseDice(u: Unit, attacker?: Unit | null): number {
    if (u.stunned) return 0;
    if (u.kind === 'monster') return this.monDef(u, attacker).defense;
    let d = HEROES[u.defId].defense + u.cards.reduce((s, c) => s + (this.cardDef(c).defBonus ?? 0), 0);
    if (this.ab(u) === 'furia' && u.wounds > 0) d += 1;
    if (this.hasPerm(u, 'lastStand')) d += u.wounds;
    if (this.hasPerm(u, 'moonShield')) d *= 2;
    return d;
  }

  /** Alvo Encurralado (Zazu): pelo menos 1 outro Inimigo do alvo Perto dele. */
  isCornered(target: Unit, attacker: Unit): boolean {
    if (!target.cell) return false;
    return this.onBoard().some(u => u.id !== attacker.id && u.id !== target.id && this.isEnemy(target, u) && this.board.isClose(u.cell!, target.cell!));
  }

  canAttackFrom(attacker: Unit, from: Cell, type: AttackType, target: Unit): boolean {
    if (!target.alive || !target.cell || !this.isEnemy(attacker, target)) return false;
    if (type === 'melee') return this.board.isClose(from, target.cell);
    return this.hasLOS(attacker, from, target.cell);
  }

  /** A carta alcança o alvo? (Jøhan: Espada a Distância; Golpe Astral: Inimigo Perto de um Aliado.) */
  canCardHit(hero: Unit, card: CardInst, from: Cell, target: Unit): boolean {
    const def = this.cardDef(card);
    if (def.kind !== 'attack' || !def.attackType) return false;
    if (def.fx.astral) {
      if (!target.alive || !target.cell || !this.isEnemy(hero, target)) return false;
      return this.onBoard().some(a => a.kind === 'hero' && a.guild === hero.guild && this.board.isClose(a.cell!, target.cell!));
    }
    if (this.canAttackFrom(hero, from, def.attackType, target)) return true;
    return hero.kind === 'hero' && this.ab(hero) === 'arremesso' && def.group === 'Espada'
      && this.canAttackFrom(hero, from, 'ranged', target);
  }

  attackTargets(hero: Unit, card: CardInst, from: Cell = hero.cell!): Unit[] {
    return this.onBoard().filter(t => this.canCardHit(hero, card, from, t));
  }

  /** Bônus de dados de ataque que valem contra qualquer alvo (Fúria, amuletos, Livro dos Mortos). */
  attackBonus(h: Unit): { n: number; notes: string[] } {
    if (h.kind !== 'hero') return { n: 0, notes: [] };
    let n = 0;
    const notes: string[] = [];
    if (this.ab(h) === 'furia' && h.wounds > 0) { n++; notes.push('Fúria de Combate +1'); }
    for (const r of this.permFx(h, 'rawr')) { n += r ?? 0; notes.push(`Amuleto Rawr! +${r}`); }
    if (this.hasPerm(h, 'bookDead')) {
      const deaths = this.heroesOf(h.guild!).reduce((s, x) => s + x.deaths, 0);
      if (deaths) { n += deaths; notes.push(`Livro dos Mortos +${deaths}`); }
    }
    return { n, notes };
  }

  /** Dados de ataque que o Herói rolaria com esta carta contra este alvo (com todos os bônus). */
  attackDicePreview(h: Unit, card: CardInst, target: Unit, boosts: string[] = []): { dice: number; notes: string[] } {
    const def = this.cardDef(card);
    const notes: string[] = [];
    let n = def.dice;
    const ab = this.ab(h);
    if (ab === 'furia' && h.wounds > 0) { n++; notes.push('Fúria de Combate +1'); }
    if (ab === 'oportunista' && this.isCornered(target, h)) notes.push('Oportunista: a carta não será exaustada');
    if (ab === 'apunhalar' && this.isCornered(target, h)) { n++; notes.push('Apunhalar +1 (alvo flanqueado)'); }
    if (ab === 'magia_perfurante' && def.magic) notes.push('Magia Perfurante: alvo sem Defesa');
    if (ab === 'maestria_arco' && def.group === 'Arco') notes.push('Maestria com Arco: cada ✷ = +1 acerto');
    if (ab === 'arremesso' && def.group === 'Espada' && h.cell && target.cell && !this.board.isClose(h.cell, target.cell)) notes.push('Arremesso de Lâmina (a Distância)');
    const fx = def.fx;
    if (fx.vsOrcs && this.isOrcLike(target)) { n += fx.vsOrcs; notes.push(`+${fx.vsOrcs} contra Orcs/Goblins`); }
    if (fx.vsHeroes && target.kind === 'hero') { n += fx.vsHeroes; notes.push(`+${fx.vsHeroes} contra Herói`); }
    if (fx.vsExhausted && target.kind === 'hero' && target.cards.some(c => c.exhausted)) { n += fx.vsExhausted; notes.push(`+${fx.vsExhausted} (alvo com carta exaustada)`); }
    if (fx.steady && !this.s.activation?.moved) { n += fx.steady; notes.push(`+${fx.steady} (sem Movimento)`); }
    for (const r of this.permFx(h, 'rawr')) { n += r ?? 0; notes.push(`Amuleto Rawr! +${r}`); }
    if (this.hasPerm(h, 'bookDead')) {
      const deaths = this.heroesOf(h.guild!).reduce((s, x) => s + x.deaths, 0);
      if (deaths) { n += deaths; notes.push(`Livro dos Mortos +${deaths}`); }
    }
    for (const uid of boosts) {
      const c = h.cards.find(x => x.uid === uid);
      if (!c) continue;
      const d = this.cardDef(c);
      if (d.fx.boostDice) { n += d.fx.boostDice; notes.push(`${d.name} +${d.fx.boostDice}`); }
      if (d.fx.rage && h.wounds) { n += h.wounds; notes.push(`${d.name} +${h.wounds}`); }
      if (d.fx.grrr) { n += d.fx.grrr; notes.push(`${d.name} +${d.fx.grrr}`); }
    }
    return { dice: n, notes };
  }

  // =========================================================================
  // Caminhos (Movimento p.14): 1 PM por Espaço, abrir porta ou usar portal.
  // =========================================================================
  /** openDoors: o caminho pode incluir abrir portas (Monstros em Vingança e a IA). O jogador abre portas manualmente. */
  reachable(u: Unit, mp: number, from: Cell = u.cell!, openDoors = u.kind === 'monster'): Map<string, PathNode> {
    const res = new Map<string, PathNode>();
    const start: PathNode = { cell: from, mp: 0, cost: 0, prev: null, canEnd: true };
    res.set(key(from), start);
    const open: PathNode[] = [start];
    const done = new Set<string>();
    const isHero = u.kind === 'hero';
    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const n = open.shift()!;
      const nk = key(n.cell);
      if (done.has(nk)) continue;
      done.add(nk);
      // Penalidade por sair de um Espaço protegido por Monstro (só desempate; não muda o custo em PM).
      const alertPenalty = isHero && this.ab(u) !== 'furtivo' ? this.monstersCloseTo(n.cell).length * 0.01 : 0;
      const relax = (to: Cell, mpCost: number, extra: Partial<PathNode>, penalty: number) => {
        const st = this.status(u, to);
        if (st === 'blocked') return;
        const nmp = n.mp + mpCost;
        if (nmp > mp) return;
        const cost = n.cost + mpCost + penalty;
        const k = key(to);
        const ex = res.get(k);
        if (ex && ex.cost <= cost) return;
        const node: PathNode = { cell: to, mp: nmp, cost, prev: nk, canEnd: st === 'free', ...extra };
        res.set(k, node);
        open.push(node);
      };
      for (const nb of this.board.neighbors(n.cell)) {
        const e = this.board.edge(n.cell, nb);
        if (e === 'open') relax(nb, 1, {}, alertPenalty);
        else if (e === 'door') {
          const d = this.board.doorBetween(n.cell, nb)!;
          if (d.locked) { if (this.passesBarrier(u)) relax(nb, 1, {}, alertPenalty); }
          else if (openDoors) relax(nb, 2, { door: d.id }, alertPenalty);
        }
      }
      const pc = this.board.portalAt(n.cell);
      const portalOk = pc && !(this.map.barrier?.portalColor === pc && !this.passesBarrier(u))
        && !(this.map.portalTitle?.color === pc && !(u.kind === 'hero' && this.hasTitle(u.guild!, this.map.portalTitle.title)));
      if (pc && portalOk) for (const p of this.board.portalCells(pc)) if (!sameCell(p, n.cell)) relax(p, 1, { portal: true }, 0);
    }
    // o próprio Espaço inicial sempre é um final válido
    start.canEnd = true;
    return res;
  }

  pathTo(nodes: Map<string, PathNode>, target: Cell): PathNode[] {
    const out: PathNode[] = [];
    let n = nodes.get(key(target));
    while (n && n.prev !== null) {
      out.unshift(n);
      n = nodes.get(n.prev);
    }
    return out;
  }

  // =========================================================================
  // Dados (p.17): críticos sempre acertam e rolam um dado adicional.
  // =========================================================================
  roll(n: number, die: DieFace[], success: DieFace, mode: DiceMode, explode = true): RollResult {
    const faces: DieFace[] = [];
    let successes = 0, crits = 0, toRoll = n, guard = 0;
    while (toRoll > 0 && guard++ < 40) {
      toRoll--;
      let f: DieFace;
      if (mode === 'max') f = success;
      else if (mode === 'zero') f = 'blank';
      else f = die[randInt(this.s, die.length)];
      faces.push(f);
      if (f === 'crit') {
        successes++;
        crits++;
        if (explode) toRoll++;
      } else if (f === success) successes++;
    }
    return { faces, successes, crits };
  }

  // =========================================================================
  // Ações do jogador
  // =========================================================================
  canAct(): boolean { return !this.s.winner && !this.s.pending && !this.s.deploying?.length; }

  // =========================================================================
  // Posicionamento inicial (p.12): cada Guilda coloca seus Heróis na própria Área Inicial
  // =========================================================================
  /** Coloca um Herói da Guilda num Espaço da sua Área Inicial (máximo 2 personagens por Espaço). */
  placeHero(by: GuildId, heroId: string, cell: Cell): boolean {
    if (!this.s.deploying?.includes(by)) return false;
    const h = this.s.units[heroId];
    if (!h || h.kind !== 'hero' || h.guild !== by || !h.cell) return false;
    const area = this.map.startAreas[this.guild(by).startArea];
    if (!area.some(c => sameCell(c, cell)) || sameCell(h.cell, cell)) return false;
    if (this.unitsAt(cell).filter(u => u.id !== h.id).length >= 2) return false;
    const from = h.cell;
    h.cell = { ...cell };
    this.emit({ t: 'move', id: h.id, from, to: { ...cell } });
    return true;
  }

  /** A Guilda terminou de posicionar. Quando a última termina, a partida começa. */
  deployDone(by: GuildId): boolean {
    if (!this.s.deploying?.includes(by)) return false;
    this.s.deploying = this.s.deploying.filter(g => g !== by);
    this.log(`${this.guild(by).name} posicionou seus Heróis.`);
    if (!this.s.deploying.length) {
      this.s.deploying = null;
      this.emit({ t: 'turn', guild: this.currentGuild().id, turn: this.s.turn });
      // o 1º Herói de quem começa já fica selecionado
      const cur = this.currentGuild();
      if (cur.controller === 'human') { const h = cur.heroIds.find(id => this.unit(id).alive); if (h) this.activate(h); }
    }
    return true;
  }

  /** Quem controla os Monstros agora: o jogador à direita do ativo (o anterior na ordem de turnos). */
  monsterControllerGuild(): GuildId {
    const n = this.s.guildOrder.length;
    return this.s.guildOrder[(this.s.current - 1 + n) % n];
  }

  get freeMode() { return !!this.s.debug.freeMode; }

  /** Modo Livre (teste): PM e ataques ilimitados, pode trocar de Herói a qualquer momento. */
  private applyFree() {
    const a = this.s.activation;
    if (!this.freeMode || !a) return;
    a.mp = FREE_MP;
    a.moved = false;
    a.moveLocked = false;
    a.attacked = false;
  }

  setFreeMode(on: boolean) {
    this.s.debug.freeMode = on;
    if (on) this.applyFree();
    else if (this.s.activation && this.s.activation.mp > 3) this.s.activation.mp = 3;
  }

  activation(): Activation | null { return this.s.activation; }
  activeHero(): Unit | null { return this.s.activation ? this.unit(this.s.activation.heroId) : null; }

  /** Ativar um Herói (p.14). Pode trocar de Herói enquanto nada foi feito. */
  activate(heroId: string): boolean {
    if (!this.canAct()) return false;
    const h = this.unit(heroId);
    if (!h || h.kind !== 'hero' || h.guild !== this.currentGuild().id || !h.alive || !h.cell) return false;
    const a = this.s.activation;
    const done = this.s.activatedThisTurn ?? [];
    if (a && a.heroId !== heroId && !this.freeMode && (a.moved || a.attacked || a.mp < 3)) {
      if (!this.canBless(heroId)) return false;
      this.log(`Bênção de Hobsbawm: ${this.name(h)} é ativado!`);
      this.s.blessing = null;
    } else if (a?.heroId === heroId) return true;
    else if (!this.freeMode && done.includes(heroId) && !(a && !a.moved && !a.attacked)) return false;
    // trocar de uma ativação ainda sem ações não conta como ativação
    const prevFresh = a && a.heroId !== heroId && !a.moved && !a.attacked && a.mp >= 3 ? a.heroId : null;
    this.s.activation = { heroId, mp: 3, moved: false, moveLocked: false, attacked: false };
    this.s.activatedThisTurn = [...done.filter(x => x !== prevFresh && x !== heroId), heroId];
    // ao ser ativado, pega o que ficou no seu Espaço (ex.: o Inimigo que estava ali morreu)
    this.pickup(h);
    this.checkEscort(h);
    this.applyFree();
    return true;
  }

  /** Pode ativar `heroId` pela Bênção? (outro Aliado, não ativado neste turno, em Linha de Visão de Hobsbawm). */
  canBless(heroId: string): boolean {
    const b = this.s.blessing;
    if (!b || this.freeMode) return false;
    const hob = this.unit(b.heroId), ally = this.unit(heroId);
    if (!hob.alive || !hob.cell || !ally.alive || !ally.cell || ally.id === hob.id || ally.guild !== hob.guild) return false;
    if ((this.s.activatedThisTurn ?? []).includes(heroId)) return false;
    return this.hasLOS(hob, hob.cell, ally.cell);
  }

  canMove(): boolean {
    const a = this.s.activation;
    return !!a && !a.moveLocked && a.mp > 0;
  }

  moveTo(target: Cell, openDoors = false): boolean {
    const a = this.s.activation;
    if (!this.canAct() || !a || a.moveLocked) return false;
    const h = this.unit(a.heroId);
    const nodes = this.reachable(h, a.mp, h.cell!, openDoors);
    const node = nodes.get(key(target));
    if (!node || !node.canEnd || node.prev === null) return false;
    const steps = this.pathTo(nodes, target);
    a.moved = true;
    if (this.s.blessing?.heroId === h.id) this.s.blessing = null;
    for (const st of steps) {
      if (!h.alive) break;
      if (st.door) {
        const d = this.s.doors.find(x => x.id === st.door)!;
        d.open = true;
        a.mp -= 1;
        this.emit({ t: 'door', doorId: d.id, open: true, by: h.id });
      }
      const from = h.cell!;
      if (!st.portal) {
        // Reação de Alerta: sair de um Espaço Perto de um Monstro (p.19)
        // Vapor (Passos Silenciosos) não aciona Alerta ao se mover
        const near = this.monstersCloseTo(from);
        const alerters = this.ab(h) === 'furtivo' ? [] : near;
        if (this.ab(h) === 'furtivo' && near.length) this.emit({ t: 'skill', id: h.id, skill: 'furtivo', name: 'Furtividade' });
        for (const m of alerters) {
          if (!h.alive) break;
          this.emit({ t: 'reaction', monsterId: m.id, kind: 'alerta' });
          this.monsterAttack(m, h, 'alerta');
        }
        if (!h.alive) break;
      }
      a.mp -= 1;
      h.cell = { ...st.cell };
      this.emit({ t: 'move', id: h.id, from, to: st.cell, portal: st.portal });
      this.triggerMines(h);
      this.pickup(h);
      this.checkEscort(h);
      this.checkHideout(h);
    }
    if (a.mp < 0) a.mp = 0;
    this.checkActiveDeath();
    this.applyFree();
    return true;
  }

  /** Abrir/fechar uma porta em um dos lados do Espaço do Herói ativo (1 PM). */
  toggleDoor(doorId: string): boolean {
    const a = this.s.activation;
    if (!this.canAct() || !a || a.moveLocked || a.mp < 1) return false;
    const h = this.unit(a.heroId);
    const d = this.s.doors.find(x => x.id === doorId);
    if (!d || d.locked || !h.cell || !(sameCell(d.a, h.cell) || sameCell(d.b, h.cell))) return false;
    d.open = !d.open;
    a.mp -= 1;
    a.moved = true;
    this.emit({ t: 'door', doorId, open: d.open, by: h.id });
    this.applyFree();
    return true;
  }

  doorsAdjacentToActive(): string[] {
    const h = this.activeHero();
    if (!h?.cell || !this.canMove()) return [];
    return this.s.doors.filter(d => sameCell(d.a, h.cell) || sameCell(d.b, h.cell)).map(d => d.id);
  }

  /** Cartas de ataque disponíveis do Herói ativo. */
  usableCards(h: Unit): CardInst[] { return h.cards.filter(c => !c.exhausted && this.isAttackCard(c)); }

  /** Kanga pode sofrer 1 Ferimento em vez de exaustar a carta (se não morrer com isso). */
  canSacrifice(h: Unit): boolean {
    return h.kind === 'hero' && this.ab(h) === 'autossacrificio' && h.wounds + 1 < this.maxHp(h);
  }

  /** Rolagem de um Herói com o Conjunto de Rerrolagem usado automaticamente nos dados que falharam. */
  private heroRoll(h: Unit, n: number, die: DieFace[], success: DieFace, mode: DiceMode, kind: 'attack' | 'defense' = 'attack'): RollResult {
    const rr = this.rerollsOf(h);
    if (mode !== 'normal' || !rr) return this.roll(n, die, success, mode);
    return this.rollRerolls(n, die, success, rr, h, kind);
  }

  /** Rolagem de Defesa de quem é atacado. */
  private defenseRoll(t: Unit, dice: number, attacker: Unit): RollResult {
    if (t.kind === 'hero') {
      const r = this.heroRoll(t, dice, DEFENSE_DIE, 'shield', this.s.debug.defenseDice, 'defense');
      if (this.hasPerm(t, 'dragonHeart') && r.crits) r.successes += r.crits;
      return r;
    }
    return this.rollRerolls(dice, DEFENSE_DIE, 'shield', this.monDef(t, attacker).rerolls);
  }

  /** Ataque (p.15-17) + reações (p.19-21). */
  attack(cardUid: string, targetId: string, secondaryId?: string, sacrifice = false, boostUids: string[] = []): boolean {
    const a = this.s.activation;
    if (!this.canAct() || !a || a.attacked) return false;
    const h = this.unit(a.heroId);
    const card = h.cards.find(c => c.uid === cardUid);
    const target = this.unit(targetId);
    if (!card || card.exhausted || !target || !h.cell) return false;
    const def = this.cardDef(card);
    if (!this.canCardHit(h, card, h.cell, target)) return false;
    // ampliações / permanentes opcionais válidas
    const allowed = new Set([...this.boostsFor(h, card), ...this.optionalPerms(h)].map(c => c.uid));
    const boosts = [...new Set(boostUids)].filter(u => allowed.has(u)).map(u => h.cards.find(c => c.uid === u)!);
    const ab = this.ab(h);

    if (a.moved) a.moveLocked = true; // o Movimento não pode ser retomado depois do Ataque
    a.attacked = true;
    const { dice: n, notes } = this.attackDicePreview(h, card, target, boosts.map(b => b.uid));

    // custos: Sacrifício (Kanga), Ampliações que ferem, Grrrr!
    const sacrificed = sacrifice && this.canSacrifice(h);
    let selfWounds = sacrificed ? 1 : 0;
    for (const b of boosts) { const d = this.cardDef(b); selfWounds += (d.fx.selfWound ?? 0) + (d.kind === 'permanent' ? d.fx.grrr ?? 0 : 0); }
    if (selfWounds) {
      h.wounds = Math.min(this.maxHp(h) - 1, h.wounds + selfWounds);
      this.emit({ t: 'damage', id: h.id, amount: selfWounds, wounds: h.wounds, maxHp: this.maxHp(h) });
      if (sacrificed) this.log(`Autossacrifício: ${this.name(h)} sofre 1 Ferimento e não exausta a carta.`);
    }
    // exaustar a carta (Maya: Mágicas 2x; Zazu: alvo flanqueado; Varinha da Pressa)
    const flanked = ab === 'oportunista' && this.isCornered(target, h);
    const noExhaust = boosts.some(b => this.cardDef(b).fx.noExhaust);
    if (!this.freeMode) {
      for (const b of boosts) if (this.cardDef(b).kind === 'boost') b.exhausted = true;
      if (!flanked && !sacrificed && !noExhaust) {
        card.uses += 1;
        if (!(def.magic && ab === 'dominio_magia' && card.uses < 2)) card.exhausted = true;
      }
    }
    // Bênção (Hobsbawm): ataque Mágico sem ter feito Movimento -> pode ativar outro Aliado em LdV
    this.s.blessing = ab === 'bencao' && def.magic && !a.moved ? { heroId: h.id } : null;

    const fx = def.fx;
    const atk = this.heroRoll(h, n, ATTACK_DIE, def.attackType!, this.s.debug.attackDice);
    this.curAttack = { id: h.id, faces: atk.faces.slice(), hits: atk.successes, type: def.attackType! };
    if (atk.rerolled) notes.push(`↻ ${atk.rerolled} dado${atk.rerolled > 1 ? 's' : ''} rerrolado${atk.rerolled > 1 ? 's' : ''}`);
    if (ab === 'maestria_arco' && def.group === 'Arco' && atk.crits) { atk.successes += atk.crits; notes.push(`Maestria com Arco: +${atk.crits}`); }
    if (fx.critExtra && atk.crits) { atk.successes += atk.crits * fx.critExtra; notes.push(`${def.name}: +${atk.crits * fx.critExtra} acerto(s) por ✷`); }
    if (this.hasPerm(h, 'soulseeker') && def.group === 'Arco' && atk.crits) { atk.successes += atk.crits; notes.push(`Caça-Almas: +${atk.crits}`); }

    // alvos
    const targets: Unit[] = [target];
    const enemiesCloseTo = (c: Cell, except: Unit[]) => this.onBoard().filter(u => !except.includes(u) && this.isEnemy(h, u) && this.board.isClose(u.cell!, c));
    if (fx.extraOnCrit && atk.crits > 0) {
      const extra = enemiesCloseTo(target.cell!, targets);
      const pick = extra.find(u => u.id === secondaryId) ?? extra.sort((p, q) => this.killScore(p) - this.killScore(q))[0];
      if (pick) { targets.push(pick); notes.push(`${def.name} atinge também ${this.name(pick)}`); }
    }
    if (fx.allClose) for (const u of enemiesCloseTo(target.cell!, targets)) { targets.push(u); notes.push(`${def.name} atinge também ${this.name(u)}`); }
    const cleave = this.permFx(h, 'cleave');
    if (cleave.length && (def.group === 'Espada' || def.group === 'Machado')) {
      const extra = enemiesCloseTo(h.cell!, targets);
      const take = cleave.includes('all') ? extra : extra.slice(0, 1);
      for (const u of take) { targets.push(u); notes.push(`Fender: atinge também ${this.name(u)}`); }
    }

    const targetCells = new Map(targets.map(t => [t.id, { ...t.cell! }]));
    const pierce = (ab === 'magia_perfurante' && !!def.magic) || (fx.critNoDefense && atk.crits > 0);
    if (fx.critNoDefense && atk.crits > 0) notes.push(`${def.name}: alvo não rola Defesa`);
    const results = targets.map(t => {
      const dr = this.defenseRoll(t, pierce ? 0 : this.defenseDice(t, h), h);
      const blocks = fx.onlyCritSaves ? dr.faces.filter(f => f === 'crit').length : dr.successes;
      if (fx.onlyCritSaves) dr.successes = blocks;
      return { t, dr, wounds: Math.max(0, atk.successes - blocks) };
    });
    if (fx.onlyCritSaves) notes.push('Só ✷ na Defesa bloqueia');
    this.emit({
      t: 'attack', attackerId: h.id, reason: 'heroi', cardName: def.name, attackType: def.attackType!,
      dice: atk.faces, hits: atk.successes, crits: atk.crits, notes, rr: atk.rr,
      targets: results.map(r => ({ id: r.t.id, defense: r.dr.faces, blocks: r.dr.successes, wounds: r.wounds, stunnedNoDefense: r.t.stunned, rr: r.dr.rr })),
    });

    const dying: Unit[] = [];
    let vengeful: Unit | null = null;
    let dealt = 0;
    const dazeList: Unit[] = [];
    for (const r of results) {
      const t = r.t;
      dealt += r.wounds;
      if (t.kind === 'hero') {
        if (r.wounds > 0) this.damageHero(t, r.wounds, { kind: 'hero', id: h.id });
        if (r.wounds > 0 && fx.daze && t.alive) dazeList.push(t);
        if (fx.hate && atk.crits > 0 && t.alive) { for (const c of t.cards) c.exhausted = true; this.log(`Ódio: todas as cartas de ${this.name(t)} foram exaustadas!`); }
        this.retaliate(t, r.dr, Math.min(atk.successes, r.dr.successes), h);
      } else {
        const md = this.monDef(t, h);
        if (md.category.startsWith('Vilão')) t.hitBy = [...new Set([...(t.hitBy ?? []), h.guild!])];
        if (r.wounds > 0) {
          t.wounds += r.wounds;
          this.emit({ t: 'damage', id: t.id, amount: r.wounds, wounds: t.wounds, maxHp: md.hp });
        }
        if (r.wounds >= md.exterm) {
          this.log(`${md.name} foi EXTERMINADO!`);
          this.monsterDies(t, h, true);
        } else {
          if (t.wounds >= md.hp) dying.push(t);
          else if (fx.daze && r.wounds > 0) dazeList.push(t);
          if (!vengeful) vengeful = t;
        }
      }
    }
    // atordoar (Esmaga-Cara, Enxofre, Pilão, Quebra-Crânio)
    if (dazeList.length && fx.daze) {
      const extra = fx.daze === 'plus1' ? enemiesCloseTo(targetCells.get(target.id)!, targets).slice(0, 1) : fx.daze === 'all' ? enemiesCloseTo(targetCells.get(target.id)!, targets) : [];
      for (const u of [...dazeList, ...extra]) if (u.alive && !u.stunned) this.setStun(u, true);
    }
    if (fx.bomb && atk.successes > 0) {
      const c0 = targetCells.get(target.id)!;
      const cells = [c0, ...this.board.neighbors(c0).filter(nb => this.board.isClose(c0, nb))];
      this.s.mines = [...(this.s.mines ?? []).filter(m => m.guild !== h.guild), ...cells.map(cell => ({ cell, guild: h.guild!, dice: def.dice }))];
      this.log(`Campo de minas da ${this.guild(h.guild!).name} em ${cells.length} Espaços!`);
    }
    // curas
    const heal = (u: Unit, amount: number) => {
      const x = Math.min(amount, u.wounds);
      if (x > 0 && u.alive) { u.wounds -= x; this.emit({ t: 'heal', id: u.id, amount: x, wounds: u.wounds }); }
    };
    if (fx.drain && h.alive) {
      const hits = results[0].wounds;
      heal(h, hits);
      const allies = this.heroesOf(h.guild!).filter(x => x.id !== h.id && x.alive && x.cell && this.board.isClose(x.cell, h.cell!));
      if (fx.drain === 'ally1') { const a1 = allies.sort((p, q) => q.wounds - p.wounds)[0]; if (a1) heal(a1, hits); }
      if (fx.drain === 'allies') for (const x of allies) heal(x, hits);
    }
    if (boosts.some(b => this.cardDef(b).fx.lifesteal) && h.alive) heal(h, dealt);
    // Maldição "Propenso a Acidentes"
    if (h.curse === 'propenso' && dealt === 0 && h.alive) { this.log(`${this.name(h)} é Propenso a Acidentes: sofre 1 Ferimento.`); this.damageHero(h, 1, { kind: 'trap' }); }

    // Reação de Alerta acionada por Ataque: o ataque não teve como alvo um Monstro Perto.
    const targetedCloseMonster = !h.cell || targets.some(t => t.kind === 'monster' && this.board.isClose(targetCells.get(t.id)!, h.cell!));
    if (!targetedCloseMonster && h.alive && !fx.astral) {
      for (const m of this.monstersCloseTo(h.cell!)) {
        if (!h.alive) break;
        if (dying.includes(m)) continue;
        this.emit({ t: 'reaction', monsterId: m.id, kind: 'alerta' });
        this.monsterAttack(m, h, 'alerta');
      }
    }
    // Reação de Vingança (mesmo se o ataque falhar; também para Monstros que vão morrer). Golpe Astral não aciona.
    if (vengeful && vengeful.alive && h.alive && !fx.astral) {
      this.emit({ t: 'reaction', monsterId: vengeful.id, kind: 'vinganca' });
      // Quem controla o Monstro é o jogador à direita do ativo (p.18/20). Se for humano, ele decide.
      const ctl = this.monsterControllerGuild();
      if (this.guild(ctl).controller === 'human' && ctl !== this.currentGuild().id) {
        this.s.pending = { kind: 'vinganca', monsterId: vengeful.id, heroId: h.id, dying: dying.map(d => d.id), controller: ctl };
        this.log(`${this.guild(ctl).name} controla a Vingança de ${MONSTERS[vengeful.defId].name}.`);
        return true;
      }
      this.vengeance(vengeful, h);
    }
    this.finishAttack(dying.map(d => d.id), h);
    return true;
  }

  /** Vingança do Espetado (✷ na Defesa) e Amuleto da Retribuição (acertos cancelados) ferem o atacante. */
  private retaliate(defender: Unit, dr: RollResult, cancelled: number, attacker: Unit) {
    if (defender.kind !== 'hero' || !attacker.alive) return;
    let n = 0;
    const parts: string[] = [];
    if (this.ab(defender) === 'espinhos') { const c = dr.faces.filter(f => f === 'crit').length; if (c) { n += c; parts.push('Vingança do Espetado'); this.emit({ t: 'skill', id: defender.id, skill: 'espinhos', name: 'Vingança' }); } }
    if (this.hasPerm(defender, 'retribution') && cancelled > 0) { n += cancelled; parts.push('Amuleto da Retribuição'); }
    if (!n) return;
    this.log(`${parts.join(' + ')}: ${n} Ferimento${n > 1 ? 's' : ''} em ${this.name(attacker)}!`);
    if (attacker.kind === 'hero') { this.damageHero(attacker, n, { kind: 'hero', id: defender.id }); return; }
    const md = MONSTERS[attacker.defId];
    attacker.wounds += n;
    this.emit({ t: 'damage', id: attacker.id, amount: n, wounds: attacker.wounds, maxHp: md.hp });
    if (attacker.wounds >= md.hp) this.monsterDies(attacker, defender, false);
  }

  private finishAttack(dying: string[], h: Unit) {
    for (const id of dying) {
      const m = this.unit(id);
      if (m.alive) this.monsterDies(m, h, false);
    }
    this.pickupAfterCombat();
    this.checkActiveDeath();
    this.applyFree();
  }

  /** Depois de um combate: Heróis da Guilda da vez cujo Espaço ficou sem Inimigos pegam o que está no chão (p.25). */
  private pickupAfterCombat() {
    if (this.s.winner) return;
    for (const u of this.heroesOf(this.currentGuild().id)) {
      if (!u.alive || !u.cell) continue;
      this.pickup(u);
      this.checkEscort(u);
    }
  }

  /** Opções da Vingança pendente: Espaços alcançáveis pelo Monstro e de onde ele consegue atacar. */
  vengeanceOptions(): { reach: Map<string, PathNode>; attackFrom: Set<string> } | null {
    const p = this.s.pending;
    if (!p) return null;
    const m = this.unit(p.monsterId), h = this.unit(p.heroId);
    const reach = this.reachable(m, MONSTERS[m.defId].move);
    const attackFrom = new Set<string>();
    for (const [k, n] of reach) if (n.canEnd && this.monsterCanAttack(m, h, n.cell)) attackFrom.add(k);
    return { reach, attackFrom };
  }

  /** O controlador dos Monstros decide: mover (opcional) até `dest` e atacar ou não. */
  resolveVengeance(dest: Cell | null, doAttack: boolean): boolean {
    const p = this.s.pending;
    if (!p || this.s.winner) return false;
    const m = this.unit(p.monsterId), h = this.unit(p.heroId);
    if (!m.alive || !m.cell || !h.alive) { doAttack = false; dest = null; }
    if (dest && m.cell && !sameCell(dest, m.cell)) {
      const nodes = this.reachable(m, MONSTERS[m.defId].move);
      const n = nodes.get(key(dest));
      if (!n || !n.canEnd) return false;
      this.walkMonster(m, nodes, dest);
    }
    this.s.pending = null;
    if (doAttack) this.monsterAttack(m, h, 'vinganca');
    else this.log(`${MONSTERS[m.defId].name} não atacou.`);
    this.finishAttack(p.dying, h);
    return true;
  }

  private walkMonster(m: Unit, nodes: Map<string, PathNode>, dest: Cell) {
    for (const st of this.pathTo(nodes, dest)) {
      if (st.door) {
        const d = this.s.doors.find(x => x.id === st.door)!;
        d.open = true;
        this.emit({ t: 'door', doorId: d.id, open: true, by: m.id });
      }
      const from = m.cell!;
      m.cell = { ...st.cell };
      this.emit({ t: 'move', id: m.id, from, to: st.cell, portal: st.portal });
    }
  }

  /** Descansar a Guilda (p.18): restaurar cartas, recuperar atordoados, ressuscitar. Encerra o turno. */
  /** Espaços de inventário de um Herói (4; Tomo da Iluminação dá +2 para Mágicas; algumas Maldições ocupam 1). */
  slotsUsed(h: Unit, cards: CardInst[] = h.cards): { used: number; max: number } {
    const magicExtra = cards.reduce((s, c) => s + (this.cardDef(c).fx.magicSlots ?? 0), 0);
    const magic = cards.filter(c => this.cardDef(c).magic && this.cardDef(c).kind === 'attack').length;
    const curseSlot = h.curse && CURSES[h.curse]?.slot ? 1 : 0;
    return { used: cards.length - Math.min(magic, magicExtra) + curseSlot, max: 4 };
  }

  /** Valida uma reorganização de Descanso. Retorna mensagem de erro ou null. */
  validateRest(g: GuildId, o: RestOptions): string | null {
    const heroes = this.heroesOf(g);
    if (o.cards) {
      const all = heroes.flatMap(h => h.cards.map(c => c.uid)).sort();
      const given = Object.values(o.cards).flat().sort();
      if (JSON.stringify(all) !== JSON.stringify(given)) return 'Cartas inválidas.';
      for (const h of heroes) {
        const cards = (o.cards[h.id] ?? []).map(uid => heroes.flatMap(x => x.cards).find(c => c.uid === uid)!);
        const sl = this.slotsUsed(h, cards);
        if (sl.used > sl.max) return `${HEROES[h.defId].name}: ${sl.used} cartas para ${sl.max} espaços.`;
        if (cards.filter(c => this.cardDef(c).fx.armor).length > 1) return `${HEROES[h.defId].name}: só 1 armadura por Herói.`;
      }
    }
    if (o.tokens) {
      const movable = heroes.flatMap(h => h.tokens.filter(t => t.type !== 'missao').map(t => t.id)).sort();
      const given = Object.values(o.tokens).flat().sort();
      if (JSON.stringify(movable) !== JSON.stringify(given)) return 'Marcadores inválidos (marcadores de Missão não podem ser movidos).';
      for (const h of heroes) if (!h.alive && (o.tokens[h.id] ?? []).length) return 'Herói morto não pode receber marcadores.';
    }
    if (o.resurrect) {
      const count = new Map<string, number>();
      for (const [id, c] of Object.entries(o.resurrect)) {
        const h = this.unit(id);
        if (!h || h.guild !== g || h.alive) return 'Ressurreição inválida.';
        if (!this.resurrectCells(h).some(x => sameCell(x, c))) return `${HEROES[h.defId].name} não pode ressuscitar nesse Espaço.`;
        const k = key(c);
        count.set(k, (count.get(k) ?? 0) + 1);
        if (this.unitsAt(c).length + count.get(k)! > 2) return 'Máximo de 2 personagens por Espaço.';
      }
    }
    return null;
  }

  /** Descansar (p.18): restaura cartas, recupera atordoados, reorganiza itens e marcadores e ressuscita os mortos. */
  rest(o: RestOptions = {}): boolean {
    if (!this.canAct()) return false;
    const a = this.s.activation;
    if (a && (a.moved || a.attacked || a.mp < 3)) return false;
    const g = this.currentGuild();
    if (this.validateRest(g.id, o)) return false;
    const heroes = this.heroesOf(g.id);
    this.s.activation = null;
    this.emit({ t: 'rest', guild: g.id });
    if (o.cards) {
      const pool = heroes.flatMap(h => h.cards);
      for (const h of heroes) h.cards = (o.cards[h.id] ?? []).map(uid => pool.find(c => c.uid === uid)!);
    }
    if (o.tokens) {
      const pool = heroes.flatMap(h => h.tokens.filter(t => t.type !== 'missao'));
      for (const h of heroes) h.tokens = [...h.tokens.filter(t => t.type === 'missao'), ...(o.tokens[h.id] ?? []).map(id => pool.find(t => t.id === id)!)];
    }
    for (const h of heroes) {
      for (const c of h.cards) { c.exhausted = false; c.uses = 0; }
      if (h.alive && h.stunned) this.setStun(h, false);
      if (!h.alive) this.resurrect(h, o.resurrect?.[h.id]);
    }
    this.log(`${g.name} descansou: cartas restauradas.`);
    this.endTurn();
    return true;
  }

  /** Onde um Herói morto pode ressuscitar (p.18): Área Inicial ou Perto de um Aliado que já estava no tabuleiro. */
  resurrectCells(h: Unit): Cell[] {
    const g = this.guild(h.guild!);
    const area = this.map.startAreas[g.startArea];
    const cells: Cell[] = [...area];
    for (const ally of this.heroesOf(g.id)) {
      if (!ally.alive || !ally.cell || ally.id === h.id) continue;
      cells.push(ally.cell, ...this.board.neighbors(ally.cell).filter(n => this.board.isClose(n, ally.cell!)));
    }
    const seen = new Set<string>();
    return cells.filter(c => { const k = key(c); if (seen.has(k)) return false; seen.add(k); return this.board.playable(c) && this.unitsAt(c).length < 2; });
  }

  private resurrect(h: Unit, want?: Cell) {
    const cells = this.resurrectCells(h);
    const area = this.map.startAreas[this.guild(h.guild!).startArea];
    const c = (want && cells.find(x => sameCell(x, want))) ?? cells.find(x => area.some(a => sameCell(a, x))) ?? cells[0];
    if (!c) return;
    h.alive = true;
    h.wounds = 0;
    h.stunned = false;
    h.cell = { ...c };
    this.emit({ t: 'respawn', id: h.id, cell: c });
    this.log(`${this.name(h)} ressuscitou.`);
  }

  useToken(tokenId: string): boolean {
    const a = this.s.activation;
    if (!this.canAct() || !a) return false;
    const h = this.unit(a.heroId);
    const i = h.tokens.findIndex(t => t.id === tokenId);
    if (i < 0) return false;
    const t = h.tokens[i];
    if (h.curse === 'aquafobia' && t.type !== 'bau' && t.type !== 'missao') { this.log(`${this.name(h)} tem Aquafobia e não pode usar Poções.`); return false; }
    const usable = t.type === 'cura' || t.type === 'revigorante' || (t.type === 'turno' && !this.s.extraTurn);
    if (usable) this.emit({ t: 'useToken', heroId: h.id, token: { ...t } }); // mostrado antes do efeito
    if (t.type === 'cura') {
      const amount = h.wounds;
      h.wounds = 0;
      this.emit({ t: 'heal', id: h.id, amount, wounds: 0 });
    } else if (t.type === 'revigorante') {
      for (const c of h.cards) { c.exhausted = false; c.uses = 0; }
      this.log(`${this.name(h)} restaurou todas as suas cartas.`);
    } else if (t.type === 'turno') {
      if (this.s.extraTurn) return false;
      this.s.extraTurn = true;
      this.log(`${this.name(h)} fará um turno adicional ao final deste turno.`);
    } else return false;
    h.tokens.splice(i, 1);
    this.log(`Usou ${TOKEN_INFO[t.type].name}.`);
    return true;
  }

  endTurn(): boolean {
    if (!this.canAct()) return false;
    const a = this.s.activation;
    const prevHero = a ? this.unit(a.heroId) : null;
    if (this.s.missions.some(x => x.rule === 'arena')) {
      const ids = new Set([...(this.s.activatedThisTurn ?? []), ...(prevHero ? [prevHero.id] : [])]);
      for (const id of ids) { const u = this.s.units[id]; if (u) this.arenaMark(u); }
      if (this.s.winner) return true;
    }
    this.s.activation = null;
    // Entrada de Monstros (p.23)
    if (this.s.entryBoard.length >= 5 || this.monstersOnBoard().length === 0) this.spawnMonsters();
    if (this.freeMode) {
      // Modo Livre: a vez não passa para o adversário
      this.emit({ t: 'turn', guild: this.currentGuild().id, turn: this.s.turn });
      return true;
    }
    if (this.s.extraTurn) {
      this.s.extraTurn = false;
      this.log('Turno adicional!');
      this.emit({ t: 'turn', guild: this.currentGuild().id, turn: this.s.turn });
      if (prevHero && prevHero.alive) this.activate(prevHero.id);
      return true;
    }
    this.s.current = (this.s.current + 1) % this.s.guildOrder.length;
    if (this.s.current === 0) this.s.turn++;
    this.s.activatedThisTurn = [];
    this.s.blessing = null;
    this.emit({ t: 'turn', guild: this.currentGuild().id, turn: this.s.turn });
    for (const h of this.heroesOf(this.currentGuild().id)) {
      const g = this.permFx(h, 'genesis').reduce((a: number, b) => a + (b ?? 0), 0);
      const x = Math.min(g, h.wounds);
      if (x > 0 && h.alive) { h.wounds -= x; this.emit({ t: 'heal', id: h.id, amount: x, wounds: h.wounds }); }
    }
    return true;
  }

  // =========================================================================
  // Internos: dano, morte, coleta, monstros
  // =========================================================================
  private killScore(u: Unit) { return this.maxHp(u) - u.wounds; }

  private setStun(u: Unit, on: boolean) {
    u.stunned = on;
    this.emit({ t: 'stun', id: u.id, on });
  }

  private checkActiveDeath() {
    const a = this.s.activation;
    if (a && !this.unit(a.heroId).alive) {
      this.log('O Herói ativo morreu — o turno termina.');
      this.endTurn();
    }
  }

  damageHero(h: Unit, n: number, src: DamageSource) {
    if (!h.alive) return;
    if (this.s.debug.heroesImmortal) n = Math.min(n, this.maxHp(h) - 1 - h.wounds);
    if (n <= 0) return;
    h.wounds += n;
    this.emit({ t: 'damage', id: h.id, amount: n, wounds: h.wounds, maxHp: this.maxHp(h) });
    if (h.wounds >= this.maxHp(h)) this.heroDies(h, src);
    else if (h.curse === 'atordoado' && !h.stunned) this.setStun(h, true);
  }

  private heroDies(h: Unit, src: DamageSource) {
    const cell = h.cell!;
    h.alive = false;
    h.deaths += 1;
    h.stunned = false;
    h.cell = null;
    this.emit({ t: 'death', id: h.id });
    this.log(`${this.name(h)} morreu!`);
    const dropped = h.tokens.splice(0);
    if (src.kind === 'hero' && src.id) {
      const killer = this.unit(src.id);
      const kg = killer.guild!;
      this.gainCoins(kg, 1, 'matou um Herói Inimigo');
      if (dropped.length && killer.alive) {
        const pick = dropped.sort((p, q) => (q.value ?? 1) - (p.value ?? 1))[0];
        dropped.splice(dropped.indexOf(pick), 1);
        pick.faceUp = true;
        killer.tokens.push(pick);
        this.emit({ t: 'pickup', heroId: killer.id, token: pick });
        this.checkCarry(kg, killer);
      }
      if (h.guild !== kg) this.completeMission(kg, `matar_${h.guild}`);
    } else {
      for (const g of this.guilds()) if (g.id !== h.guild) this.gainCoins(g.id, 1, 'um Herói inimigo morreu');
    }
    if (dropped.length) {
      for (const t of dropped) this.addFloor(cell, t);
      this.emit({ t: 'drop', cell, tokens: dropped });
    }
  }

  private monsterDies(m: Unit, killer: Unit, exterminated: boolean) {
    const md = MONSTERS[m.defId];
    m.alive = false;
    m.cell = null;
    this.emit({ t: 'death', id: m.id, exterminated });
    this.log(`${this.name(killer)} matou ${md.name}.`);
    const g = this.guild(killer.guild!);
    if (md.category.startsWith('Vilão')) {
      // Vilões (p.22): todas as Guildas que tentaram feri-lo recebem a recompensa
      for (const gid of new Set([...(m.hitBy ?? []), g.id])) this.gainCoins(gid, md.reward, `ajudou a matar ${md.name}`);
    } else this.gainCoins(g.id, md.reward, `matou ${md.name}`);
    g.monsterKills += 1;
    const base = baseId(m.defId);
    if (this.hasPerm(killer, 'sackBones') && killer.alive && killer.wounds) { const x = Math.min(2, killer.wounds); killer.wounds -= x; this.emit({ t: 'heal', id: killer.id, amount: x, wounds: killer.wounds }); }
    for (const mi of this.s.missions) {
      if (mi.rule === 'kill_count' && g.monsterKills >= (mi.count ?? 3)) this.completeMission(g.id, mi.id, killer);
      if ((mi.rule === 'kill_type' || mi.rule === 'summon') && mi.types?.includes(base)) this.completeMission(g.id, mi.id, killer);
    }
    if (this.map.noEntry || this.map.boxOnDeath?.includes(base)) { if (!this.map.noEntry) this.log(`${md.name} volta para a caixa.`); return; }
    // Lacaios vão para o Tabuleiro de Entrada de Monstro (máx. 5)
    if (md.category.startsWith('Lacaio') && this.s.entryBoard.length < 5) {
      m.wounds = 0;
      m.stunned = false;
      this.s.entryBoard.push(m.id);
      this.emit({ t: 'cemetery', id: m.id, count: this.s.entryBoard.length, full: this.s.entryBoard.length >= 5 });
    } else if (md.category.startsWith('Lacaio')) {
      this.log(`Cemitério cheio: ${md.name} voltou para a caixa.`);
    }
  }

  private gainCoins(g: GuildId, amount: number, reason: string) {
    if (amount <= 0) return;
    this.guild(g).coins += amount;
    this.emit({ t: 'coins', guild: g, amount, reason });
    this.checkBarrier(g);
  }

  /** Moedas + Baús de Tesouro da Guilda. */
  wealth(g: GuildId): number {
    let w = this.guild(g).coins;
    for (const h of this.heroesOf(g)) for (const t of h.tokens) if (t.type === 'bau') w += t.value ?? 1;
    return w;
  }

  private checkBarrier(g: GuildId) {
    const b = this.map.barrier;
    const gs = this.guild(g);
    if (!b || gs.barrierOpen || this.wealth(g) < b.coins) return;
    gs.barrierOpen = true;
    this.log(`${gs.name} juntou ${b.coins} moedas: pode atravessar a barreira mágica do Templo!`);
  }

  /** Templo: só Heróis de Guildas com moedas suficientes passam pela porta trancada e portais da barreira. */
  passesBarrier(u: Unit): boolean {
    if (this.map.lockTitle) return u.kind === 'hero' && this.hasTitle(u.guild!, this.map.lockTitle);
    if (!this.map.barrier) return true;
    if (u.kind !== 'hero') return false;
    return !!this.guild(u.guild!).barrierOpen;
  }

  /** Missão associada aos marcadores de Missão deste cenário. */
  tokenMission(t?: Token) {
    const rules = ['collect_any', 'collect_own', 'carry', 'step_on', 'escort', 'arena', 'summon'];
    return this.s.missions.find(x => x.rule && rules.includes(x.rule) && (!t || !x.colors || x.colors.includes(t.color ?? '')));
  }

  /** Marcador de escolta que a Guilda está carregando (no máximo 1 por vez). */
  escortToken(g: GuildId): { hero: Unit; token: Token } | null {
    for (const h of this.heroesOf(g)) for (const t of h.tokens) if (t.type === 'missao' && this.tokenMission(t)?.rule === 'escort') return { hero: h, token: t };
    return null;
  }

  /** Espaços para onde o marcador de escolta deve ser levado. */
  escortTargets(m: MissionDef, g: GuildId): Cell[] {
    if (m.escortTo === 'own_area') return this.map.startAreas[this.guild(g).startArea];
    return m.escortTo ?? [];
  }

  /** Escolta: Herói com o marcador num Espaço de destino, sem Inimigos nele, completa a Missão. */
  private checkEscort(h: Unit) {
    if (!h.alive || !h.cell) return;
    const i = h.tokens.findIndex(t => t.type === 'missao' && this.tokenMission(t)?.rule === 'escort');
    if (i < 0) return;
    const m = this.tokenMission(h.tokens[i])!;
    if (!this.escortTargets(m, h.guild!).some(c => sameCell(c, h.cell))) return;
    if (this.unitsAt(h.cell).some(u => this.isEnemy(h, u))) return;
    const [t] = h.tokens.splice(i, 1);
    this.log(`${this.name(h)} escoltou o marcador ${t.color ?? ''} até o destino!`);
    this.completeMission(h.guild!, m.id, h);
  }

  /** Arena: ao terminar a ativação num marcador de Missão sem Inimigos, coloca um marcador da Guilda. */
  private arenaMark(h: Unit) {
    const m = this.s.missions.find(x => x.rule === 'arena');
    if (!m || !h.alive || !h.cell || h.kind !== 'hero') return;
    const here = this.s.floor[key(h.cell)] ?? [];
    if (!here.some(t => t.type === 'missao')) return;
    if (this.unitsAt(h.cell).some(u => this.isEnemy(h, u))) return;
    const g = h.guild!;
    const list = ((this.s.arena ??= {})[g] ??= []);
    list.push(key(h.cell));
    const total = this.map.missionMarkers.length;
    this.log(`${this.name(h)} marcou o marcador de Missão em (${h.cell.c},${h.cell.r}) — ${list.length}/5 marcadores, ${new Set(list).size}/${total} diferentes.`);
    if (list.length >= 5 || new Set(list).size >= total) this.completeMission(g, m.id, h);
  }

  /** Pisar no marcador invoca um Monstro numa Entrada de Monstro sorteada (Sombra do Lorde Presas). */
  private summon(m: MissionDef, h: Unit) {
    const type = m.summon ?? 'lorde_presas';
    const mon = this.units().find(u => u.kind === 'monster' && baseId(u.defId) === type && !u.alive && !this.s.entryBoard.includes(u.id));
    if (!mon) { this.log('O Monstro invocado já está em jogo.'); return; }
    const r = this.roll(2, ATTACK_DIE, 'melee', 'normal', false).faces;
    const match = this.s.entryMarkers.find(em => { const p = em.pair.slice(); return r.every(f => { const i = p.indexOf(f); if (i < 0) return false; p.splice(i, 1); return true; }); });
    if (match && this.unitsAt(match.cell).length < 2) {
      mon.alive = true; mon.wounds = 0; mon.stunned = false; mon.cell = { ...match.cell };
      this.log(`${this.name(h)} invocou a Sombra: ${MONSTERS[mon.defId].name} surge em (${match.cell.c},${match.cell.r})!`);
      this.emit({ t: 'spawn', id: mon.id, cell: { ...match.cell } });
    } else this.log(`${this.name(h)} tentou invocar ${MONSTERS[mon.defId].name}, mas os dados não abriram nenhuma Entrada.`);
  }

  /** Emboscada: o marcador escondido vira um Monstro que ataca quem o encontrou. */
  private ambush(h: Unit, cell: Cell) {
    const type = this.map.ambush!.monster;
    const mon = this.units().find(u => u.kind === 'monster' && baseId(u.defId) === type && !u.alive && !this.s.entryBoard.includes(u.id));
    if (!mon) return;
    mon.alive = true; mon.wounds = 0; mon.stunned = false; mon.cell = { ...cell };
    this.log(`Emboscada! O marcador era uma ${MONSTERS[mon.defId].name}!`);
    this.emit({ t: 'spawn', id: mon.id, cell: { ...cell } });
    this.emit({ t: 'reaction', monsterId: mon.id, kind: 'alerta' });
    this.monsterAttack(mon, h, 'alerta');
  }

  /** Esconderijo do Troll: quem tem o Título e entra leva a carta guardada. */
  private checkHideout(h: Unit) {
    const hd = this.map.hideout;
    if (!hd || this.s.hideoutTaken || !h.alive || !h.cell || !hd.cells.some(c => sameCell(c, h.cell))) return;
    const defId = hd.cards.find(id => CARDS[id]);
    if (!defId) return;
    this.s.hideoutTaken = true;
    const holder = h.cards.length < 4 ? h : this.heroesOf(h.guild!).find(x => x.cards.length < 4) ?? h;
    if (holder.cards.length >= 4) holder.cards.shift();
    holder.cards.push({ uid: `hd-${holder.id}`, defId, exhausted: false, uses: 0 });
    this.emit({ t: 'card', heroId: holder.id, cardName: CARDS[defId].name });
    this.log(`${this.name(h)} saqueou o Esconderijo do Troll: ${CARDS[defId].name}!`);
  }

  /** O Herói desta Guilda quer este marcador de Missão? */
  missionTokenWanted(g: GuildId, t: Token): boolean {
    const m = this.tokenMission(t);
    if (!m) return false;
    if (m.rule === 'arena') return false;
    if (m.rule === 'summon') return true;
    if (m.rule === 'escort') {
      const done = this.s.missionDone[m.id] ?? [];
      return !done.includes(g) && !(m.maxCompletions && done.length >= m.maxCompletions) && !this.escortToken(g);
    }
    if (m.rule === 'collect_own' && t.color !== g) return false;
    if (m.rule === 'step_on' && !m.colors?.includes(t.color ?? '')) return false;
    const done = this.s.missionDone[m.id] ?? [];
    if (m.rule === 'carry') return !done.includes(g);
    return !done.includes(g) && !(m.maxCompletions && done.length >= m.maxCompletions);
  }

  /** Missão de carregar N marcadores (Tomos). */
  private checkCarry(g: GuildId, by: Unit) {
    const m = this.s.missions.find(x => x.rule === 'carry');
    if (!m) return;
    const n = this.heroesOf(g).reduce((s, h) => s + h.tokens.filter(t => t.type === 'missao').length, 0);
    if (n >= (m.count ?? 2)) this.completeMission(g, m.id, by);
  }

  /** Minas das Bombas (p.27): Herói Inimigo que entra no Espaço sofre o ataque. */
  private triggerMines(h: Unit) {
    if (!h.alive || !h.cell || !this.s.mines?.length) return;
    const here = this.s.mines.filter(mn => sameCell(mn.cell, h.cell) && mn.guild !== h.guild);
    if (!here.length) return;
    this.s.mines = this.s.mines.filter(mn => !here.includes(mn));
    const owner = here[0].guild;
    const src = this.heroesOf(owner).find(x => x.alive) ?? this.heroesOf(owner)[0];
    const dice = here.reduce((s, mn) => s + mn.dice, 0);
    const atk = this.roll(dice, ATTACK_DIE, 'ranged', 'normal');
    const dr = this.roll(this.defenseDice(h), DEFENSE_DIE, 'shield', this.s.debug.defenseDice);
    const wounds = Math.max(0, atk.successes - dr.successes);
    this.emit({
      t: 'attack', attackerId: src.id, reason: 'armadilha', cardName: 'Bomba (mina)', attackType: 'ranged',
      dice: atk.faces, hits: atk.successes, crits: atk.crits, notes: [`${here.length} mina${here.length > 1 ? 's' : ''} da ${this.guild(owner).name}`],
      targets: [{ id: h.id, defense: dr.faces, blocks: dr.successes, wounds, stunnedNoDefense: h.stunned }],
    });
    if (wounds > 0) this.damageHero(h, wounds, { kind: 'hero', id: src.id });
  }

  /** Rola e usa o Conjunto de Rerrolagem nos dados que falharam (p.27). */
  rollRerolls(n: number, die: DieFace[], success: DieFace, rerolls: number, who?: Unit, kind: 'attack' | 'defense' = 'attack'): RollResult {
    const r = this.roll(n, die, success, 'normal');
    if (!rerolls || !r.faces.some(f => f !== success && f !== 'crit')) return r;
    const choice = who?.kind === 'hero' && this.rerollHook ? this.rerollHook({ heroId: who.id, kind, faces: r.faces.slice(), success, rerolls, vs: kind === 'defense' ? this.curAttack ?? undefined : undefined }) : 'auto';
    if (choice !== 'auto') {
      // o jogador escolheu os dados (cada dado rerrolado que der ✷ rola mais um)
      const idx = [...new Set(choice)].filter(i => i >= 0 && i < r.faces.length && r.faces[i] !== 'crit').slice(0, rerolls);
      const faces = r.faces.slice();
      const extra: DieFace[] = [];
      for (const i of idx) { const nr = this.roll(1, die, success, 'normal'); faces[i] = nr.faces[0]; extra.push(...nr.faces.slice(1)); }
      const all = [...faces, ...extra];
      return { faces: all, successes: all.filter(f => f === success || f === 'crit').length, crits: all.filter(f => f === 'crit').length, rerolled: idx.length,
        rr: { before: r.faces.slice(), idx, asked: true } }; // asked: o jogador já viu os dados no diálogo
    }
    // automática: os dados que falharam são rolados de novo (no mesmo lugar; ✷ extras vão para o fim)
    const before = r.faces.slice();
    const faces = r.faces.slice();
    const extra: DieFace[] = [];
    const idx: number[] = [];
    for (let i = 0; i < faces.length && idx.length < rerolls; i++) {
      if (faces[i] === success || faces[i] === 'crit') continue;
      const nr = this.roll(1, die, success, 'normal');
      faces[i] = nr.faces[0];
      extra.push(...nr.faces.slice(1));
      idx.push(i);
    }
    const all = [...faces, ...extra];
    return { faces: all, successes: all.filter(f => f === success || f === 'crit').length, crits: all.filter(f => f === 'crit').length, rerolled: idx.length,
      rr: idx.length ? { before, idx, asked: false } : undefined };
  }

  /** Pegar marcadores automaticamente se não houver Inimigo no Espaço (p.25). */
  private pickup(h: Unit) {
    if (!h.alive || !h.cell) return;
    const k = key(h.cell);
    const list = this.s.floor[k];
    if (!list?.length) return;
    if (this.unitsAt(h.cell).some(u => this.isEnemy(h, u))) return;
    const keep: Token[] = [];
    for (const t of list.slice()) {
      const wasDown = !t.faceUp;
      if (!h.alive) { keep.push(t); continue; }
      if (t.type === 'missao') {
        if (!t.faceUp && this.map.ambush?.colors.includes(t.color ?? '')) {
          // marcador escondido que é uma emboscada (sai do jogo)
          t.faceUp = true;
          this.ambush(h, h.cell!);
          continue;
        }
        const m = this.tokenMission(t);
        if (!m) { keep.push(t); continue; }
        if (m.rule === 'arena') { keep.push(t); continue; }
        if (m.rule === 'summon') {
          t.faceUp = true;
          this.log(`${this.name(h)} pisou no marcador ${t.color ?? ''}.`);
          this.summon(m, h);
          continue;
        }
        if (m.rule === 'escort') {
          if (!this.missionTokenWanted(h.guild!, t)) { keep.push(t); continue; }
          t.faceUp = true;
          h.tokens.push(t);
          this.emit({ t: 'pickup', heroId: h.id, token: t, hidden: wasDown });
          this.log(`${this.name(h)} pegou o marcador ${t.color ?? ''}: leve-o até o destino.`);
          continue;
        }
        if (m.rule === 'carry') {
          // Tomos: o Herói carrega o marcador (pode ser roubado se morrer)
          t.faceUp = true;
          h.tokens.push(t);
          this.emit({ t: 'pickup', heroId: h.id, token: t, hidden: wasDown });
          this.checkCarry(h.guild!, h);
          continue;
        }
        keep.push(t); // marcadores de 'pisar' ficam no tabuleiro
        if (!this.missionTokenWanted(h.guild!, t)) { if (m.rule !== 'step_on') { /* fica */ } continue; }
        if (m.rule !== 'step_on') keep.pop();
        t.faceUp = true;
        if (m.rule !== 'step_on') this.emit({ t: 'pickup', heroId: h.id, token: t, hidden: wasDown });
        this.completeMission(h.guild!, m.id, h);
        continue;
      }
      const firstReveal = !t.faceUp;
      t.faceUp = true;
      this.emit({ t: 'pickup', heroId: h.id, token: t, hidden: wasDown });
      if (t.type === 'armadilha') {
        if (this.map.deadlyTokens && !(this.map.fireProtectTitle && this.hasTitle(h.guild!, this.map.fireProtectTitle))) {
          this.log(`${this.name(h)} pisou numa Armadilha do Templo — morte instantânea!`);
          this.damageHero(h, this.maxHp(h), { kind: 'trap' });
        } else {
          this.log(`${this.name(h)} caiu numa Armadilha!`);
          this.damageHero(h, 1, { kind: 'trap' });
        }
      } else {
        h.tokens.push(t);
        if (t.type === 'bau') {
          if (this.map.deadlyTokens && firstReveal && !(this.map.fireProtectTitle && this.hasTitle(h.guild!, this.map.fireProtectTitle))) {
            this.log(`O Baú amaldiçoado causa ${t.value ?? 1} Ferimento(s) em ${this.name(h)}!`);
            this.damageHero(h, t.value ?? 1, { kind: 'trap' });
          }
          this.checkBarrier(h.guild!);
        }
      }
    }
    if (keep.length) this.s.floor[k] = keep;
    else delete this.s.floor[k];
  }

  private giveReward(h: Unit) {
    const defId = this.s.rewardDeck.shift();
    if (!defId) return;
    const heroes = [h, ...this.heroesOf(h.guild!).filter(x => x.id !== h.id)];
    const holder = heroes.find(x => x.cards.length < 4) ?? h;
    if (holder.cards.length >= 4) holder.cards.shift();
    holder.cards.push({ uid: `r${this.s.rewardDeck.length}-${holder.id}`, defId, exhausted: false, uses: 0 });
    this.emit({ t: 'card', heroId: holder.id, cardName: CARDS[defId].name });
    this.log(`${this.name(holder)} recebeu a carta ${CARDS[defId].name}!`);
  }

  completeMission(g: GuildId, missionId: string, by?: Unit): boolean {
    const m = this.s.missions.find(x => x.id === missionId);
    if (!m || this.s.winner) return false;
    if (m.kind === 'pvp' && m.targetGuild === g) return false;
    const done = this.s.missionDone[missionId];
    if (done.includes(g)) return false;
    if (m.maxCompletions && done.length >= m.maxCompletions) return false;
    done.push(g);
    const gs = this.guild(g);
    gs.missions.push(missionId);
    const first = done.length === 1;
    this.emit({ t: 'mission', guild: g, missionId, name: m.name, first });
    if (first) this.gainCoins(g, 1, `Primeiro Bônus: ${m.name}`);
    if (m.reward && by) this.giveReward(by);
    if (m.title && (first || !m.titleFirstOnly)) {
      const list = ((this.s.titles ??= {})[g] ??= []);
      if (!list.includes(m.title)) { list.push(m.title); this.log(`${gs.name} recebeu o Título "${TITLES[m.title] ?? m.title}"!`); }
    }
    if (m.removeEntry && this.s.entryMarkers.length) {
      // Fechar o Portão: remove a Entrada de Monstro mais perto da Área Inicial da Guilda
      const area = this.map.startAreas[gs.startArea][1];
      const d = (c: Cell) => Math.abs(c.c - area.c) + Math.abs(c.r - area.r);
      const em = this.s.entryMarkers.slice().sort((p, q) => d(p.cell) - d(q.cell))[0];
      this.s.entryMarkers = this.s.entryMarkers.filter(x => x !== em);
      this.log(`${gs.name} fechou parte do Portão: Entrada de Monstro em (${em.cell.c},${em.cell.r}) removida.`);
    }
    // 3-4 jogadores: precisa de pelo menos uma Missão contra o Jogo (p.23)
    const pve = gs.missions.filter(id => this.s.missions.find(x => x.id === id)?.kind === 'pve').length;
    if (gs.missions.length >= this.s.missionsToWin && (this.s.guildOrder.length <= 2 || pve >= 1)) this.finish(g);
    return true;
  }

  private finish(winner: GuildId) {
    this.s.winner = winner;
    this.s.activation = null;
    const summary = this.guilds().map(g => {
      let coins = g.coins + g.missions.length;
      for (const h of this.heroesOf(g.id)) for (const t of h.tokens) if (t.type === 'bau') coins += t.value ?? 1;
      return { guild: g.id, coins, missions: g.missions.length };
    });
    for (const s of summary) this.guild(s.guild).coins = s.coins;
    this.emit({ t: 'gameover', winner, summary });
  }

  // --- Monstros -----------------------------------------------------------
  monsterCanAttack(m: Unit, h: Unit, from: Cell = m.cell!): boolean {
    return this.canAttackFrom(m, from, MONSTERS[m.defId].attackType, h);
  }

  private monsterAttack(m: Unit, h: Unit, reason: 'alerta' | 'vinganca') {
    if (!m.alive || !h.alive || !this.monsterCanAttack(m, h)) return;
    const md = this.monDef(m, h);
    const ab = md.abilities ?? [];
    const notes: string[] = [];
    let dice = md.dice;
    if (ab.includes('packBonus') && this.monstersOnBoard().some(o => o.id !== m.id && this.board.isClose(o.cell!, m.cell!))) { dice++; notes.push('+1 dado (Perto de outro Monstro)'); }
    if (md !== MONSTERS[m.defId]) notes.push('Destruidor da Pedra Sangrenta: Orc mais fraco');
    const atk = this.rollRerolls(dice, ATTACK_DIE, md.attackType, md.rerolls);
    this.curAttack = { id: m.id, faces: atk.faces.slice(), hits: atk.successes, type: md.attackType };
    if (md.rerolls) notes.push(`Rerrolagem ${md.rerolls}`);
    if (ab.includes('critExtra') && atk.crits) { atk.successes += atk.crits; notes.push(`+${atk.crits} acerto(s) por ✷`); }
    // Troll: atinge todos os Heróis Perto; Lorde Presas: também os Inimigos Perto do alvo
    let targets = [h];
    if (md.hitsAll) targets = [h, ...this.onBoard().filter(u => u.kind === 'hero' && u.id !== h.id && this.board.isClose(m.cell!, u.cell!))];
    if (ab.includes('splash')) targets = [h, ...this.onBoard().filter(u => u.kind === 'hero' && u.id !== h.id && this.board.isClose(h.cell!, u.cell!))];
    if (targets.length > 1) notes.push(md.hitsAll ? 'Atinge todos os Heróis Perto!' : 'Atinge também os Heróis Perto do alvo!');
    if (this.ab(h) === 'furia' && h.wounds > 0 && !h.stunned) notes.push('Fúria de Combate: +1 dado de Defesa');
    const res = targets.map(t => {
      const dr = this.defenseRoll(t, this.defenseDice(t, m), m);
      return { t, dr, wounds: Math.max(0, atk.successes - dr.successes) };
    });
    this.emit({
      t: 'attack', attackerId: m.id, reason, cardName: md.attackName, attackType: md.attackType,
      dice: atk.faces, hits: atk.successes, crits: atk.crits, notes, rr: atk.rr,
      targets: res.map(r => ({ id: r.t.id, defense: r.dr.faces, blocks: r.dr.successes, wounds: r.wounds, stunnedNoDefense: r.t.stunned, rr: r.dr.rr })),
    });
    for (const r of res) {
      if (r.wounds > 0) this.damageHero(r.t, r.wounds, { kind: 'monster', id: m.id });
      if (r.wounds > 0 && ab.includes('daze') && r.t.alive && !r.t.stunned) this.setStun(r.t, true);
      if (ab.includes('critExhaust') && atk.crits && r.t.alive) {
        const ready = r.t.cards.filter(c => !c.exhausted && this.isAttackCard(c)).slice(0, atk.crits);
        for (const c of ready) c.exhausted = true;
        if (ready.length) this.log(`${md.name} exaustou ${ready.length} carta(s) de ${this.name(r.t)}.`);
      }
      this.retaliate(r.t, r.dr, Math.min(atk.successes, r.dr.successes), m);
    }
    if (ab.includes('critHeal') && atk.crits && m.alive && m.wounds) {
      const x = Math.min(m.wounds, atk.crits * 2);
      m.wounds -= x;
      this.emit({ t: 'heal', id: m.id, amount: x, wounds: m.wounds });
    }
  }

  /** Reação de Vingança (p.20): o Monstro pode se mover até seu Movimento e então atacar o atacante. */
  /** Resolve uma Vingança pendente automaticamente (ex.: o jogador que decidiria caiu e a IA assumiu). */
  autoResolvePending(): boolean {
    const p = this.s.pending;
    if (!p || this.s.winner) return false;
    this.s.pending = null;
    const m = this.unit(p.monsterId), h = this.unit(p.heroId);
    if (m.alive && h.alive) this.vengeance(m, h);
    this.finishAttack(p.dying, h);
    return true;
  }

  private vengeance(m: Unit, h: Unit) {
    const md = MONSTERS[m.defId];
    if (!this.monsterCanAttack(m, h)) {
      const nodes = this.reachable(m, md.move);
      let best: PathNode | null = null;
      for (const n of nodes.values()) {
        if (!n.canEnd || n.prev === null) continue;
        if (!this.monsterCanAttack(m, h, n.cell)) continue;
        if (!best || n.cost < best.cost) best = n;
      }
      if (best) this.walkMonster(m, nodes, best.cell);
    }
    this.monsterAttack(m, h, 'vinganca');
  }

  /** Entrada de Monstros (p.23): 2 dados por miniatura, compara com os marcadores. */
  spawnMonsters() {
    if (!this.s.entryBoard.length) return;
    const guard = this.map.gateGuardTitle && this.s.guildOrder.find(g => this.hasTitle(g, this.map.gateGuardTitle!));
    if (guard) {
      this.log(`O Guardião do Portão (${this.guild(guard).name}) manda os Monstros do Cemitério de volta para a caixa.`);
      this.emit({ t: 'spawnStart', ids: this.s.entryBoard.slice() });
      for (const id of this.s.entryBoard) this.emit({ t: 'spawnRoll', id, faces: [], cell: null, reason: 'Guardião do Portão: removido' });
      this.s.entryBoard = [];
      return;
    }
    this.log('Entrada de Monstros!');
    this.emit({ t: 'spawnStart', ids: this.s.entryBoard.slice() });
    for (const id of this.s.entryBoard) {
      const m = this.unit(id);
      const r = this.roll(2, ATTACK_DIE, 'melee', 'normal', false).faces;
      const match = this.s.entryMarkers.find(em => {
        const p = em.pair.slice();
        return r.every(f => {
          const i = p.indexOf(f);
          if (i < 0) return false;
          p.splice(i, 1);
          return true;
        });
      });
      if (match && this.unitsAt(match.cell).length < 2) {
        m.alive = true;
        m.wounds = 0;
        m.cell = { ...match.cell };
        this.emit({ t: 'spawnRoll', id: m.id, faces: r, cell: { ...match.cell }, reason: 'Reviveu na Entrada de Monstro!' });
        this.emit({ t: 'spawn', id: m.id, cell: match.cell });
      } else {
        const reason = match ? 'Entrada ocupada — voltou para a caixa' : 'Nenhuma entrada com esses símbolos — voltou para a caixa';
        this.emit({ t: 'spawnRoll', id: m.id, faces: r, cell: null, reason });
        this.log(`${MONSTERS[m.defId].name}: ${reason}.`);
      }
    }
    this.s.entryBoard = [];
  }
}
