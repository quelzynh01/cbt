import { Board, key, parseKey, sameCell, type MapDef, type LosBlock, mapTitlesOf } from './board';
import {
  heroPool, ATTACK_DIE, CARDS, DEFENSE_DIE, ENTRY_PAIRS, EXPLORATION_BAG, GUILDS, HEROES, HERO_ORDER, MONSTERS, TOKEN_INFO, distributeStartingGear, levelSuffix, lowerSuffix, bossAura, SISTER_ENTRANCE, DUO_ENTRANCE } from './data';
import { nextRandom, randInt, shuffle } from './rng';
import { CURSES, curseDeck, type CardFx } from './cards';
import { TITLES } from './titles';
import { TOMB, TOMBSTONES } from './tombstones';
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

export interface RollResult { faces: DieFace[]; successes: number; crits: number; rerolled?: number; rr?: RerollInfo; /** ✷ da Defesa que ficaram sem rolar o dado extra (já tinha bloqueado tudo) */ held?: number; /** sem acertos: a Defesa não foi rolada */ noHits?: boolean; /** dados rolados de verdade (sem os extras de ✷) */ base?: number }

/** Pedido de Rerrolagem para o jogador que controla o Herói. */
export interface RerollRequest { heroId: string; kind: 'attack' | 'defense'; faces: DieFace[]; success: DieFace; rerolls: number;
  /** Guilda que decide (a do Herói; para um Monstro, quem controla os Monstros). */
  guild?: GuildId;
  /** Ataque de Monstro (Reação): o Herói atacado. */
  target?: string;
  /** Dados rolados de verdade (os demais são extras de ✷). */
  base?: number;
  /** Rodada da Rerrolagem: 1 = primeira escolha; 2+ = ainda sobrou Rerrolagem depois da anterior. */
  round?: number;
  /** Ataque: carta usada, tipo e dados rolados (antes dos extras de ✷). */
  card?: { name: string; type: string; dice: number };
  /** Defesa: quem atacou e os dados do ataque (mostrados antes). */
  vs?: { id: string; faces: DieFace[]; hits: number; type: string; base?: number };
  /** Defesa que já bloqueou todos os acertos: Manter é o padrão (rolar os ✷ extras / Rerrolar só se quiser). */
  covered?: boolean;
  /** ✷ que ainda não rolaram o dado extra (responda com HELD_PICK para rolar). */
  held?: number;
  /** O ataque não acertou: rolar a Defesa mesmo assim? (HELD_PICK = rolar; [] = manter) */
  noHits?: boolean;
  /** Escudo de Cavaleiro (depois do ataque: obrigar a rolar de novo) ou do Rei (antes da Defesa: +bonus dados). HELD_PICK = usar. */
  shield?: 'knight' | 'king';
  bonus?: number;
  /** Ataque com vários alvos: Defesas deste mesmo ataque que já foram resolvidas (mostradas antes, uma por vez). */
  done?: { id: string; faces: DieFace[]; blocks: number; noHits?: boolean }[] }

/** Escolha do jogador no meio de um ataque: para onde empurrar (Rajada de Vento) ou quem mais atingir (Raio Nova, Fender).
 *  A resposta é o índice em `cells`/`units`, ou −1 para não fazer nada. */
export interface ChoiceRequest {
  /** confirm: pergunta sim (0) ou não (−1). loot: qual marcador pegar de quem você matou (índice em `tokens`).
   *  reward: inventário cheio — trocar uma carta do Herói (índice em `cards`), dar a um Aliado (cards.length + índice em `units`)
   *  ou guardar sem Herói (−1). */
  choice: 'push' | 'extra' | 'confirm' | 'loot' | 'reward' | 'cover' | 'multi';
  /** Recompensa: a carta nova e as cartas do Herói (defIds). */
  newCard?: string;
  cards?: string[];
  /** Saque: os marcadores que dá para pegar. */
  tokens?: Token[];
  /** Texto da pergunta (confirm) ou explicação da escolha. */
  text?: string;
  /** Pergunta Sim/Não: o texto dos botões (padrão: Sim / Não). */
  yes?: string;
  no?: string;
  /** o botão "Não" (Manter) é o principal */
  keep?: boolean;
  guild: GuildId;
  heroId: string;
  /** Carta/efeito que pede a escolha. */
  source: string;
  /** Empurrão: quem é empurrado e os Espaços possíveis. */
  targetId?: string;
  cells?: Cell[];
  /** Alvo adicional: os Inimigos possíveis e os dados do ataque. */
  units?: string[];
  faces?: DieFace[];
}
export type DecisionRequest = RerollRequest | ChoiceRequest;

/** Lançado quando o jogador precisa decidir (a jogada é desfeita e repetida com a decisão). */
export class NeedDecision extends Error {
  req: DecisionRequest;
  constructor(req: DecisionRequest) { super('decisão necessária'); this.req = req; }
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
  /** Limite de dados (Configurações da partida): no máximo 8 dados de ataque e 6 de defesa por rolagem. Sem isso, ilimitado. */
  diceCap?: boolean;
  /** Quem não trouxe Heróis (IA) sorteia também entre os Heróis extras. */
  allHeroes?: boolean;
}

const FREE_MP = 99;

/** Id base de um Monstro (sem o nível): 'orc4' -> 'orc'. */
/** Resposta da Rerrolagem: rolar os dados extras dos ✷ guardados (Defesa que já tinha bloqueado tudo). */
export const HELD_PICK = -2;
export const baseId = (id: string) => id.replace(/\d+$/, '');

/** Opções do Descanso: cartas (uids) e marcadores (ids) por Herói, e onde cada morto ressuscita. */
export interface RestOptions {
  cards?: Record<string, string[]>;
  tokens?: Record<string, string[]>;
  resurrect?: Record<string, Cell>;
  /** Heróis mortos que o jogador escolheu NÃO ressuscitar neste Descanso (continuam mortos). */
  stayDead?: string[];
}

export class Game {
  readonly map: MapDef;
  readonly board: Board;
  s: GameState;
  private out: GameEvent[] = [];
  /** Quem decide o empurrão e os alvos adicionais: índice escolhido, −1 (nenhum) ou 'auto' (a escolha automática). */
  choiceHook: ((req: ChoiceRequest) => number | 'auto') | null = null;
  /** Quem decide a Rerrolagem dos Heróis: índices dos dados a rerrolar ou 'auto' (todos os que falharam). */
  rerollHook: ((req: RerollRequest) => number[] | 'auto') | null = null;
  /** Ataque sendo resolvido (para mostrar os dados do atacante na Rerrolagem da Defesa). */
  private curAttack: RerollRequest['vs'] | null = null;
  private curCard: { name: string; type: string } | null = null;

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
    if (opts.diceCap) s.diceCap = true;
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
      const free = shuffle(s, heroPool(!!opts.allHeroes).filter(h => !taken.has(h)));
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
        // Maldição que ocupa um espaço com o inventário cheio: ela fica no 1º espaço — a 1ª carta fica debaixo dela (indisponível)
        const hu = s.units[id];
        if (hu.curse && CURSES[hu.curse]?.slot && g.slotsUsed(hu).used > g.slotsUsed(hu).max && hu.cards.length) hu.covered = hu.cards.shift();
        gs.heroIds.push(id);
      });
      s.guilds[p.guild] = gs;
    }

    map.monsters.forEach((m, i) => {
      const id = `m${i + 1}`;
      s.units[id] = {
        id, kind: 'monster', defId: baseId(m.type) + suffix, guild: null, cell: { ...m.cell },
        wounds: 0, alive: true, stunned: false, cards: [], tokens: [], deaths: 0, num: 0, ...(m.soul ? { soul: true } : {}),
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
    // marcadores virados (O Cemitério): as cores escondidas são embaralhadas entre os Espaços delas
    const hid = map.hiddenMarkers ?? [];
    const hidColors = shuffle(s, map.missionMarkers.filter(mm => hid.includes(mm.color)).map(mm => mm.color));
    map.missionMarkers.forEach((mm, i) => {
      const hidden = hid.includes(mm.color);
      g.addFloor(mm.cell, { id: `mm${i}`, type: 'missao', color: hidden ? hidColors.shift()! : mm.color, faceUp: !hidden });
    });
    // marcador da cor de cada Guilda na ponta oposta à sua Área Inicial
    if (map.missionMarkersByArea) for (const p of players) {
      const cell = map.missionMarkersByArea[p.area];
      if (cell) g.addFloor(cell, { id: `mg-${p.guild}`, type: 'missao', color: p.guild, faceUp: true });
    }

    // Confronto Final: Maldição a cada morte — o baralho sem as Maldições que os Heróis já têm
    if (map.deathCurse) {
      const deck = curseDeck();
      for (const u of Object.values(s.units)) if (u.kind === 'hero' && u.curse) { const i = deck.indexOf(u.curse); if (i >= 0) deck.splice(i, 1); }
      s.curseDeck = shuffle(s, deck);
    }
    // Lápides (Beyond the Grave): embaralha as 14 e põe uma virada em cada Espaço marcado
    if (map.tombstones?.length) {
      const deck = shuffle(s, TOMBSTONES.map(t => t.id));
      s.tombs = map.tombstones.map((cell, i) => ({ id: `tb${i}`, cell: { ...cell }, card: deck[i % deck.length] }));
    }
    // Monstros que começam no Tabuleiro de Entrada (alguns cenários de Beyond the Grave)
    (map.entryStart ?? []).forEach((type, i) => {
      const id = `e${i + 1}`;
      s.units[id] = { id, kind: 'monster', defId: baseId(type) + suffix, guild: null, cell: null, wounds: 0, alive: false, stunned: false, cards: [], tokens: [], deaths: 0, num: 0 };
      s.entryBoard.push(id);
    });

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
    // Criptas: cada Guilda começa com o seu marcador de Missão num Herói
    if (map.startWithToken) for (const p of players) {
      const h = s.units[`${p.guild}-${p.heroes![0]}`];
      if (h) h.tokens.push({ id: `mo-${p.guild}`, type: 'missao', color: p.guild, faceUp: true });
    }
    // Abatedouro: as Reservas de Comida são objetos atacáveis no lugar dos marcadores
    if (map.missions.pve.some(m => m.rule === 'destroy')) map.missionMarkers.forEach((mm, i) => {
      const id = `rc${i + 1}`;
      s.units[id] = { id, kind: 'monster', defId: 'reserva' + suffix, guild: null, cell: { ...mm.cell }, wounds: 0, alive: true, stunned: false, cards: [], tokens: [], deaths: 0, num: 0 };
      for (const k of Object.keys(s.floor)) { s.floor[k] = s.floor[k].filter(t => t.id !== `mm${i}`); if (!s.floor[k].length) delete s.floor[k]; }
    });
    // Título "Alquimista": começa com Poção de Cura, Revigorante e de Turno Adicional
    if (map.alchemistTitle) for (const p of players) if (s.titles?.[p.guild]?.includes(map.alchemistTitle)) {
      const h = s.units[`${p.guild}-${p.heroes![0]}`];
      if (h) for (const type of ['cura', 'revigorante', 'turno'] as const) h.tokens.push({ id: `al-${p.guild}-${type}`, type, faceUp: true });
    }
    // posição inicial padrão: os 2 Heróis com mais cartas no Espaço da porta, o 3º no Espaço seguinte
    for (const gid of s.guildOrder) g.defaultPlacement(gid);
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
    return u.shadow ? `Sombra do ${MONSTERS[u.defId].name}` : u.soul ? `Alma do ${MONSTERS[u.defId].name}` : MONSTERS[u.defId].name;
  }
  floorAt(c: Cell): Token[] { return this.s.floor[key(c)] ?? []; }
  private addFloor(c: Cell, t: Token) { (this.s.floor[key(c)] ??= []).push(t); }

  isEnemy(a: Unit, b: Unit): boolean {
    if (a.id === b.id) return false;
    if (this.isObject(a) || this.isObject(b)) return false;
    if (a.kind === 'monster' && b.kind === 'monster') return false;
    if (a.kind === 'hero' && b.kind === 'hero') return a.guild !== b.guild;
    return true;
  }

  /** Livre / Ocupado (2 personagens, algum Aliado) / Bloqueado (2 Inimigos) para quem se move. */
  status(mover: Unit, c: Cell): 'free' | 'occupied' | 'blocked' {
    const others = this.unitsAt(c).filter(u => u.id !== mover.id && !this.isObject(u));
    // Empurrão (Rei Pavoroso): nunca é bloqueado por outros personagens
    if (others.length && this.monAbility(mover, 'shove')) return 'free';
    if (this.cellLoad(c, mover) + this.weight(mover) <= 2) return 'free';
    // um Enorme Inimigo bloqueia; um Enorme Aliado enche o Espaço
    if (others.some(o => this.monAbility(o, 'huge'))) return others.some(o => this.monAbility(o, 'huge') && this.isEnemy(mover, o)) ? 'blocked' : 'occupied';
    return others.length >= 2 && others.every(o => this.isEnemy(mover, o)) ? 'blocked' : 'occupied';
  }

  /** Quanto o personagem ocupa no Espaço: Enorme = 2 (o Espaço inteiro). */
  weight(u: Unit): number { return this.monAbility(u, 'huge') ? 2 : this.isObject(u) ? 0 : 1; }
  /** Ocupação do Espaço (máximo 2), sem contar `except`. */
  cellLoad(c: Cell, except?: Unit): number { return this.unitsAt(c).reduce((n, u) => n + (u === except ? 0 : this.weight(u)), 0); }
  /** O Monstro tem esta habilidade (Fantasma, Enorme, Empurrão, Banimento, Erguer os Mortos)? */
  monAbility(u: Unit | null | undefined, a: string): boolean { return !!u && u.kind === 'monster' && !!MONSTERS[u.defId]?.abilities?.includes(a); }

  /** Perto para este personagem: o Fantasma considera Perto todo Espaço ao lado, mesmo com parede (p.7). */
  closeFor(u: Unit, a: Cell, b: Cell): boolean {
    if (this.monAbility(u, 'ghost')) return sameCell(a, b) || (Math.abs(a.c - b.c) + Math.abs(a.r - b.r) === 1 && this.board.playable(b));
    return this.board.isClose(a, b);
  }

  cellBlocksFor(attacker: Unit) {
    return (c: Cell) => this.board.isPillar(c) || this.status(attacker, c) === 'blocked';
  }

  hasLOS(attacker: Unit, from: Cell, to: Cell): boolean {
    return this.board.hasLOS(from, to, this.cellBlocksFor(attacker));
  }

  /** Monstros Perto de `c`. `ghostReach`: conta o Fantasma atrás da parede (sair de perto dele aciona a Reação de Alerta);
   *  false = só quem está Perto do ponto de vista do Herói (atacar outro alvo não aciona o Fantasma atrás da parede). */
  monstersCloseTo(c: Cell | null, ghostReach = true): Unit[] {
    if (!c) return []; // ex.: Herói banido (fora do tabuleiro)
    return this.monstersOnBoard().filter(m => !this.isObject(m) && (ghostReach ? this.closeFor(m, m.cell!, c) : this.board.isClose(m.cell!, c)));
  }

  // =========================================================================
  // Cartas, habilidades e Maldições dos Heróis
  // =========================================================================
  /** Habilidade Natural (Amnésia anula). */
  ab(h: Unit): string | null {
    if (h.kind !== 'hero' || h.curse === 'amnesia') return null;
    const cp = this.s.copied;
    if (cp && cp.heroId === h.id) return cp.ability;
    return HEROES[h.defId].ability;
  }

  /** Cartas de Ataque Mágicas equipadas (Aura Mística). */
  private magicCards(h: Unit): number { return h.cards.filter(c => this.cardDef(c).kind === 'attack' && this.cardDef(c).magic).length; }

  /** Lobo Solitário: nenhum Aliado em Linha de Visão. */
  alone(h: Unit): boolean {
    if (!h.cell || h.kind !== 'hero') return false;
    return !this.heroesOf(h.guild!).some(x => x.id !== h.id && x.alive && x.cell && this.hasLOS(h, h.cell!, x.cell));
  }

  /** Presença Poderosa: o alvo está Perto de um Prince Aaron da Guilda de quem ataca (−2 de Defesa). */
  presenceVs(t: Unit, attacker: Unit): boolean {
    if (attacker.kind !== 'hero' || !t.cell) return false;
    return this.heroesOf(attacker.guild!).some(x => x.alive && x.cell && this.ab(x) === 'presenca' && this.isEnemy(x, t) && this.board.isClose(x.cell, t.cell!));
  }

  /** Movimento que o Herói tem ao ser ativado (Olhar Petrificante tira 1 por marcador). */
  startMp(h: Unit): number { return Math.max(0, 3 - (h.petrified ?? 0)); }

  /** Movimento do Monstro (Olhar Petrificante tira 1 por marcador). */
  monMove(m: Unit): number { return Math.max(0, MONSTERS[m.defId].move - (m.petrified ?? 0)); }

  /** Soma de um efeito numérico das cartas Permanentes (e de todas as cartas para bônus de status). */
  private permFx<K extends keyof CardFx>(h: Unit, k: K): CardFx[K][] {
    return h.cards.map(c => this.cardDef(c)).filter(d => d.kind === 'permanent' && d.fx[k] !== undefined).map(d => d.fx[k]);
  }
  hasPerm(h: Unit, k: keyof CardFx): boolean { return this.permFx(h, k).length > 0; }

  /** Conjunto de Rerrolagem do Herói (p.27): soma das cartas, exaustadas ou não. */
  rerollsOf(h: Unit): number {
    if (h.kind !== 'hero') return MONSTERS[h.defId].rerolls;
    const speaker = this.map.speakerTitle && this.hasTitle(h.guild!, this.map.speakerTitle) ? this.s.entryBoard.length : 0;
    return h.cards.reduce((s, c) => s + (this.cardDef(c).rerolls ?? 0), 0) + (this.ab(h) === 'feitico_trapaceiro' ? 1 : 0) + speaker;
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

  /** Títulos que dão vantagem neste mapa. */
  mapTitles(): string[] { return mapTitlesOf(this.map); }
  /** Títulos da Guilda que valem neste mapa. */
  activeTitles(g: GuildId): string[] { const here = this.mapTitles(); return (this.s.titles?.[g] ?? []).filter(t => here.includes(t)); }

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
    const aura = this.ab(u) === 'aura_mistica' ? this.magicCards(u) : 0;
    return Math.max(1, HEROES[u.defId].hp + u.cards.reduce((s, c) => s + (this.cardDef(c).hpBonus ?? 0), 0) + curse + aura);
  }

  /** `type`: tipo do ataque recebido (Resistência do Panda: +2 contra ataques a Distância). */
  defenseDice(u: Unit, attacker?: Unit | null, type?: AttackType): number {
    if (u.stunned) return 0;
    let d: number;
    if (u.kind === 'monster') d = this.monDef(u, attacker).defense;
    else {
      d = HEROES[u.defId].defense + u.cards.reduce((s, c) => s + (this.cardDef(c).defBonus ?? 0), 0);
      const ab = this.ab(u);
      if (ab === 'furia' && u.wounds > 0) d += 1;
      if (ab === 'aura_mistica') d += this.magicCards(u);
      if (ab === 'lobo_solitario' && this.alone(u)) d += 1;
      if (ab === 'resistencia_panda' && type === 'ranged') d += 2;
      if (this.hasPerm(u, 'lastStand')) d += u.wounds;
      if (this.s.shroud?.includes(u.id)) d += 2;
      if (this.hasPerm(u, 'moonShield')) d *= 2;
    }
    if (attacker && this.presenceVs(u, attacker)) d = Math.max(0, d - 2);
    return d;
  }

  /** De onde vêm os dados de Defesa do Herói (para mostrar na tela de combate): "4 da carta", "+1 Adaga Aparadora"… */
  defenseParts(u: Unit, attacker?: Unit | null, type?: AttackType): string[] {
    if (u.kind !== 'hero' || u.stunned) return [];
    const out = [`${HEROES[u.defId].defense} da carta`];
    for (const c of u.cards) { const b = this.cardDef(c).defBonus ?? 0; if (b) out.push(`${b > 0 ? '+' : ''}${b} ${this.cardDef(c).name}`); }
    const ab = this.ab(u);
    if (ab === 'furia' && u.wounds > 0) out.push('+1 Fúria de Combate');
    if (ab === 'aura_mistica' && this.magicCards(u)) out.push(`+${this.magicCards(u)} Aura Mística`);
    if (ab === 'lobo_solitario' && this.alone(u)) out.push('+1 Lobo Solitário');
    if (ab === 'resistencia_panda' && type === 'ranged') out.push('+2 Resistência do Panda');
    if (this.hasPerm(u, 'lastStand') && u.wounds) out.push(`+${u.wounds} Último Recurso`);
    if (this.s.shroud?.includes(u.id)) out.push('+2 Mortalha');
    if (this.hasPerm(u, 'moonShield')) out.push('×2 Escudo da Lua');
    if (attacker && this.presenceVs(u, attacker)) out.push('−2 Presença');
    if (u.covered && (this.cardDef(u.covered).defBonus ?? 0)) out.push(`(${this.cardDef(u.covered).name} está debaixo da Maldição: não conta)`);
    return out;
  }

  /** Alvo Encurralado (Zazu): pelo menos 1 outro Inimigo do alvo Perto dele. */
  isCornered(target: Unit, attacker: Unit): boolean {
    if (!target.cell) return false;
    return this.onBoard().some(u => u.id !== attacker.id && u.id !== target.id && this.isEnemy(target, u) && this.board.isClose(u.cell!, target.cell!));
  }

  /** Objeto atacável (Reserva de Comida): marcador de Missão no tabuleiro. */
  isObject(u: Unit | null | undefined): boolean { return this.monAbility(u, 'object'); }

  canAttackFrom(attacker: Unit, from: Cell, type: AttackType, target: Unit): boolean {
    if (!target.alive || !target.cell) return false;
    if (this.isObject(target)) {
      // só Heróis atacam, e só quem ainda não destruiu uma
      const m = this.s.missions.find(x => x.rule === 'destroy');
      if (attacker.kind !== 'hero' || !m || (this.s.missionDone[m.id] ?? []).includes(attacker.guild!)) return false;
    } else if (!this.isEnemy(attacker, target)) return false;
    if (type === 'melee') return this.closeFor(attacker, from, target.cell);
    return this.hasLOS(attacker, from, target.cell);
  }

  /** Prévia (Shift + mirar): de `from`, o `attacker` acerta o `target` corpo a corpo e a distância? E o que atrapalha. */
  attackCheck(attacker: Unit, from: Cell, target: Unit): { melee: boolean; ranged: boolean; why: string[]; block: LosBlock | null } {
    const why: string[] = [];
    if (!target.alive || !target.cell) return { melee: false, ranged: false, why: ['Fora do tabuleiro'], block: null };
    if (!this.isObject(target) && !this.isEnemy(attacker, target)) return { melee: false, ranged: false, why: ['É Aliado: não pode ser atacado'], block: null };
    const to = target.cell;
    const melee = this.closeFor(attacker, from, to);
    const blocks = this.cellBlocksFor(attacker);
    const block = this.board.losBlock(from, to, blocks);
    const ranged = !block;
    const at = (c: Cell) => `(${c.c},${c.r})`;
    if (!melee) {
      const d = Math.abs(from.c - to.c) + Math.abs(from.r - to.r);
      const e = d === 1 ? this.board.edge(from, to) : null;
      why.push(e === 'wall' ? 'Corpo a corpo: parede entre os Espaços' : e === 'door' ? 'Corpo a corpo: porta fechada entre os Espaços' : 'Corpo a corpo: não está Perto');
    }
    if (block) {
      const cellWhy = (c: Cell) => this.board.isPillar(c) ? `Espaço bloqueado em ${at(c)}`
        : this.status(attacker, c) === 'blocked' ? `Inimigos bloqueiam o Espaço ${at(c)}` : `Espaço ${at(c)} bloqueia`;
      why.push(`Distância: ${block.kind === 'wall' ? `parede entre ${at(block.a)} e ${at(block.b)}`
        : block.kind === 'door' ? `porta fechada entre ${at(block.a)} e ${at(block.b)}`
        : block.kind === 'corner' ? `quina fechada perto de ${at(block.a)}`
        : block.kind === 'off' ? 'a linha sai do tabuleiro'
        : cellWhy(block.a)}`);
    }
    return { melee, ranged, why, block };
  }

  /** Lança do Feral: o primeiro Espaço na diagonal conta como Perto — só se houver passagem em "L" sem parede/porta fechada. */
  diagonalClose(from: Cell, to: Cell): boolean {
    if (Math.abs(to.c - from.c) !== 1 || Math.abs(to.r - from.r) !== 1 || !this.board.playable(to)) return false;
    const via = [{ c: to.c, r: from.r }, { c: from.c, r: to.r }];
    return via.some(m => this.board.playable(m) && this.board.isClose(from, m) && this.board.isClose(m, to));
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
    if (def.fx.diagonal && target.alive && target.cell && this.isEnemy(hero, target) && this.diagonalClose(from, target.cell)) return true;
    if (hero.kind === 'hero' && this.ab(hero) === 'arremesso_selvagem' && ['Lança', 'Arremesso', 'Exótica'].includes(def.group)
      && this.canAttackFrom(hero, from, 'ranged', target)) return true;
    return hero.kind === 'hero' && this.ab(hero) === 'arremesso' && def.group === 'Espada'
      && this.canAttackFrom(hero, from, 'ranged', target);
  }

  /** Cartas de Ataque que o Herói pode usar: as suas e, com Suga-Mente (Hitch), as não exaustadas de um Herói no mesmo Espaço. */
  attackCardPool(h: Unit): CardInst[] {
    const own = h.cards.filter(c => this.isAttackCard(c));
    if (h.kind !== 'hero' || this.ab(h) !== 'suga_mente' || !h.cell) return own;
    const other = this.unitsAt(h.cell).filter(x => x.kind === 'hero' && x.id !== h.id).flatMap(x => x.cards.filter(c => !c.exhausted && this.isAttackCard(c)));
    return [...own, ...other];
  }
  findAttackCard(h: Unit, uid: string): CardInst | undefined { return this.attackCardPool(h).find(c => c.uid === uid); }
  /** Carta emprestada (Suga-Mente): de quem é. */
  cardOwner(c: CardInst): Unit | undefined { return this.units().find(u => u.cards.includes(c)); }

  /** O alvo não rola Defesa contra esta carta? (Magia Perfurante, Ataque Cardíaco) */
  piercing(h: Unit, card: CardInst): boolean {
    const d = this.cardDef(card), ab = this.ab(h);
    return (ab === 'magia_perfurante' && !!d.magic) || (ab === 'ataque_cardiaco' && d.group === 'Espada');
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
    if (this.ab(h) === 'lobo_solitario' && this.alone(h)) { n++; notes.push('Lobo Solitário +1'); }
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
    // Heróis extras
    const meleeNM = def.attackType === 'melee' && !def.magic;
    if (ab === 'cheiro_sangue' && target.wounds > 0) { n++; notes.push('Cheiro de Sangue +1 (alvo ferido)'); }
    // Beyond the Grave
    if (ab === 'nao_no_rosto' && def.attackType === 'melee' && h.wounds === 0) { n += 2; notes.push('No Rosto Não! +2 (sem Ferimentos)'); }
    if (ab === 'brigao' && target.wounds === 0) { n++; notes.push('Brigão +1 (alvo sem Ferimentos)'); }
    if (ab === 'cobica' && target.kind === 'hero' && target.tokens.some(t => t.type !== 'missao')) { n += 2; notes.push('Cobiça +2 (alvo com marcador)'); }
    if (ab === 'frenesi' && meleeNM && h.cell) { const k = this.enemiesClose(h).length; if (k) { n += k; notes.push(`Frenesi +${k}`); } }
    if (ab === 'paria' && target.kind === 'monster') { n++; notes.push('Pária +1 (Monstro)'); }
    if (ab === 'contagem_corpos' && meleeNM) { const k = this.s.heroKills?.[h.id] ?? 0; if (k) { n += k; notes.push(`Contagem de Corpos +${k}`); } }
    if (ab === 'lobo_solitario' && this.alone(h)) { n++; notes.push('Lobo Solitário +1'); }
    if (ab === 'ataque_cardiaco' && def.group === 'Espada') notes.push('Ataque Cardíaco: alvo sem Defesa');
    if (ab === 'feitico_tenaz' && def.magic && target.wounds > 0) notes.push('Feitiço Tenaz: a carta não será exaustada');
    if (ab === 'mestre_espadachim' && def.group === 'Espada' && !h.spent) notes.push('Mestre Espadachim: pode exaustar o Herói para +2');
    if (ab === 'suga_mente' && !h.cards.includes(card)) notes.push('Suga-Mente: carta emprestada, não é exaustada');
    if (this.presenceVs(target, h)) notes.push('Presença Poderosa: alvo com −2 de Defesa');
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
    const fury = this.s.activation?.heroId === h.id ? this.s.activation.bonusDice ?? 0 : 0;
    if (fury) { n += fury; notes.push(`Fúria dos Mortos +${fury}`); }
    if (this.s.diceCap && n > 8) { notes.push(`Limite de dados: ${n} → 8`); n = 8; }
    return { dice: n, notes };
  }

  // =========================================================================
  // Caminhos (Movimento p.14): 1 PM por Espaço, abrir porta ou usar portal.
  // =========================================================================
  /** openDoors: o caminho pode incluir abrir portas (Monstros em Vingança e a IA). O jogador abre portas manualmente. */
  /** `noPortal`: sem usar portais (movimento das Botas). */
  reachable(u: Unit, mp: number, from: Cell = u.cell!, openDoors = u.kind === 'monster', noPortal = false): Map<string, PathNode> {
    const res = new Map<string, PathNode>();
    const start: PathNode = { cell: from, mp: 0, cost: 0, prev: null, canEnd: true };
    res.set(key(from), start);
    const open: PathNode[] = [start];
    const done = new Set<string>();
    const isHero = u.kind === 'hero';
    const acro = isHero && this.ab(u) === 'acrobata';
    const ghost = this.monAbility(u, 'ghost');
    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const n = open.shift()!;
      const nk = key(n.cell);
      if (done.has(nk)) continue;
      done.add(nk);
      // Penalidade por sair de um Espaço protegido por Monstro (só desempate; não muda o custo em PM).
      const alertPenalty = isHero && this.ab(u) !== 'furtivo' ? this.monstersCloseTo(n.cell).length * 0.01 : 0;
      const relax = (to: Cell, mpCost: number, extra: Partial<PathNode>, penalty: number) => {
        let st = this.status(u, to);
        // o Fantasma passa por Espaços bloqueados (mas não termina neles)
        if (st === 'blocked' && ghost) st = 'occupied';
        if (st === 'blocked') return;
        if (acro && !extra.portal && this.unitsAt(to).some(x => x.kind === 'hero' && x.id !== u.id)) mpCost = Math.max(0, mpCost - 1);
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
        const e = ghost ? 'open' : this.board.edge(n.cell, nb);
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
      if (pc && portalOk && !noPortal) for (const p of this.board.portalCells(pc)) if (!sameCell(p, n.cell)) relax(p, 1, { portal: true }, 0);
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
  /** Máximo de dados numa rolagem: ilimitado; com o "Limite de dados", 8 de ataque e 6 de defesa, contando ✷ e rerrolagens. */
  diceLimit(die: DieFace[]): number { return this.s.diceCap ? (die === DEFENSE_DIE ? 6 : 8) : 40; }

  roll(n: number, die: DieFace[], success: DieFace, mode: DiceMode, explode = true, stopAt = Infinity): RollResult {
    const faces: DieFace[] = [];
    const cap = this.diceLimit(die);
    let successes = 0, crits = 0, toRoll = n, guard = 0, held = 0;
    while (toRoll > 0 && guard++ < cap) {
      toRoll--;
      let f: DieFace;
      if (mode === 'max') f = success;
      else if (mode === 'zero') f = 'blank';
      else f = die[randInt(this.s, die.length)];
      faces.push(f);
      if (f === 'crit') {
        successes++;
        crits++;
        if (explode && successes < stopAt) toRoll++;
        else if (explode) held++;
      } else if (f === success) successes++;
    }
    return { faces, successes, crits, ...(held ? { held } : {}) };
  }

  // =========================================================================
  // Ações do jogador
  // =========================================================================
  canAct(): boolean { return !this.s.winner && !this.s.pending && !this.s.puppet && !this.s.deploying?.length; }

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

  /** Espaços da Área Inicial, do mais perto da saída (porta) ao mais longe. */
  startCellsByExit(guild: GuildId): Cell[] {
    const area = this.map.startAreas[this.guild(guild).startArea];
    const inArea = (c: Cell) => area.some(a => sameCell(a, c));
    const dist = new Map<string, number>();
    // saída direta: porta (0) ou passagem aberta (0.5) para fora da Área Inicial
    const queue: Cell[] = [];
    for (const c of area) {
      let d = Infinity;
      for (const nb of this.board.neighbors(c)) {
        if (inArea(nb) || !this.board.playable(nb)) continue;
        const e = this.board.edge(c, nb);
        if (e === 'door') d = Math.min(d, 0); else if (e === 'open') d = Math.min(d, 0.5);
      }
      if (d < Infinity) { dist.set(key(c), d); queue.push(c); }
    }
    // os outros: quantos passos dentro da Área até um Espaço de saída
    while (queue.length) {
      const c = queue.shift()!;
      for (const nb of this.board.neighbors(c)) {
        if (!inArea(nb) || this.board.edge(c, nb) === 'wall') continue;
        const nd = dist.get(key(c))! + 1;
        if (nd < (dist.get(key(nb)) ?? Infinity)) { dist.set(key(nb), nd); queue.push(nb); }
      }
    }
    return area.slice().sort((a, b) => (dist.get(key(a)) ?? 99) - (dist.get(key(b)) ?? 99));
  }

  /** Começo da partida: os 2 Heróis com mais cartas no Espaço da porta, o 3º no Espaço mais perto dele. */
  defaultPlacement(guild: GuildId) {
    const cells = this.startCellsByExit(guild);
    if (!cells.length) return;
    const heroes = this.heroesOf(guild).filter(h => h.alive).sort((a, b) => b.cards.length - a.cards.length || a.num - b.num);
    heroes.forEach((h, i) => { h.cell = { ...cells[Math.min(cells.length - 1, Math.floor(i / 2))] }; });
  }

  /** Vários Heróis da Guilda de uma vez (troca de lugar, aleatório): tudo ou nada, máx. 2 por Espaço no final. */
  placeHeroes(by: GuildId, moves: { heroId: string; cell: Cell }[]): boolean {
    if (!this.s.deploying?.includes(by) || !moves.length) return false;
    const area = this.map.startAreas[this.guild(by).startArea];
    const final = new Map<string, Cell>();
    for (const m of moves) {
      const h = this.s.units[m.heroId];
      if (!h || h.kind !== 'hero' || h.guild !== by || !h.cell || !area.some(c => sameCell(c, m.cell))) return false;
      final.set(h.id, { ...m.cell });
    }
    const count = new Map<string, number>();
    for (const u of this.onBoard()) { const c = final.get(u.id) ?? u.cell!; count.set(key(c), (count.get(key(c)) ?? 0) + 1); }
    if ([...count.values()].some(n => n > 2)) return false;
    for (const [id, cell] of final) {
      const h = this.s.units[id];
      if (sameCell(h.cell, cell)) continue;
      const from = h.cell!;
      h.cell = { ...cell };
      this.emit({ t: 'move', id, from, to: { ...cell } });
    }
    return true;
  }

  /** Chefes que surgem com animação quando todos terminam de posicionar: Lorde Presas; Minotauro na Arena do Sol Brilhante; os de FIRE_BOSSES (com aura de fogo). */
  isBossEntrance(m: Unit): boolean {
    if (m.kind !== 'monster' || !m.alive || !m.cell) return false;
    return this.isBossType(baseId(m.defId));
  }

  /** Espaços onde os chefes do mapa surgem (marcados no chão com o círculo de invocação). */
  bossSpawnCells(): Cell[] {
    const out: Cell[] = [];
    for (const m of this.map.monsters) if (this.isBossType(baseId(m.type)) && !out.some(c => sameCell(c, m.cell))) out.push({ ...m.cell });
    return out;
  }

  private isBossType(b: string): boolean {
    return b === 'lorde_presas' || (b === 'minotauro' && this.map.id === 'arena-do-sol-brilhante') || !!bossAura(this.map.id, b)
      || (/^irma_/.test(b) && SISTER_ENTRANCE.includes(this.map.id)) || !!DUO_ENTRANCE[this.map.id]?.includes(b);
  }

  /** A Guilda terminou de posicionar. Quando a última termina, a partida começa. */
  deployDone(by: GuildId): boolean {
    if (!this.s.deploying?.includes(by)) return false;
    this.s.deploying = this.s.deploying.filter(g => g !== by);
    this.log(`${this.guild(by).name} posicionou seus Heróis.`);
    if (!this.s.deploying.length) {
      this.s.deploying = null;
      // mapa em que o Lorde Presas já começa no tabuleiro: ele surge agora (animação de entrada para todos)
      // chefes do mesmo tipo surgem juntos (ex.: os 2 Capitães Orc do Portão da Lua)
      const bosses = this.monstersOnBoard().filter(m => this.isBossEntrance(m));
      // as duas Irmãs surgem em sequência; a dupla do mapa (ex.: Troll e Minotauro no Pátio) também
      const group = (m: Unit) => /^irma_/.test(baseId(m.defId)) ? 'irmas' : DUO_ENTRANCE[this.map.id]?.includes(baseId(m.defId)) ? 'dupla' : baseId(m.defId);
      for (const type of [...new Set(bosses.map(group))]) {
        const list = bosses.filter(m => group(m) === type);
        if ((type === 'irmas' || type === 'dupla') && list.length > 1 && randInt(this.s, 2)) list.reverse();
        const [first, ...rest] = list;
        this.emit({ t: 'lordEntrance', id: first.id, cell: { ...first.cell! }, ...(rest.length ? { others: rest.map(m => ({ id: m.id, cell: { ...m.cell! } })) } : {}) });
      }
      // ninguém começa ativado: o jogador escolhe o Herói e clica em "Ativar"
      this.emit({ t: 'turn', guild: this.currentGuild().id, turn: this.s.turn });
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
    // turno adicional: joga outro Herói (não o que usou a poção)
    if (this.s.extraTurnOn && heroId === this.s.extraHero && !this.freeMode) return false;
    if (!this.canAct()) return false;
    const h = this.unit(heroId);
    if (!h || h.kind !== 'hero' || h.guild !== this.currentGuild().id || !h.alive || !h.cell) return false;
    // Herói exausto (por carta/habilidade) continua podendo ser ativado: só não usa de novo o que exaure o Herói até Descansar
    const a = this.s.activation;
    const done = this.s.activatedThisTurn ?? [];
    const extra = !a && !!this.s.extraOnly && !this.freeMode;
    if ((a && a.heroId !== heroId && !this.freeMode && !this.activationFresh()) || extra) {
      const kind = this.blessKind(heroId);
      if (!kind) return false;
      this.s.extraOnly = false;
      if (kind === 'mind') {
        // Mente Brilhante: só para fazer o Movimento
        this.log(`Mente Brilhante: ${this.name(h)} é ativado só para se mover!`);
        this.s.brightMind = null;
        const done2 = this.s.activatedThisTurn ?? [];
        this.s.activation = { heroId, mp: this.startMp(h), moved: false, moveLocked: false, attacked: true, moveOnly: true };
        this.s.activatedThisTurn = [...done2.filter(x => x !== heroId), heroId];
        this.pickup(h);
        this.checkEscort(h);
        this.applyFree();
        return true;
      }
      this.log(kind === 'war' ? `Grito de Guerra: ${this.name(h)} é ativado!` : `Bênção de Hobsbawm: ${this.name(h)} é ativado!`);
      this.s.blessing = null;
      this.s.warCry = null;
      this.s.extraOnly = false;
      this.s.booted = []; this.s.stealthUsed = [];
    } else if (a?.heroId === heroId) return true;
    else if (!this.freeMode && done.includes(heroId) && !this.activationFresh()) return false;
    // trocar de uma ativação ainda sem ações não conta como ativação
    const prevFresh = a && a.heroId !== heroId && this.activationFresh() ? a.heroId : null;
    this.s.activation = { heroId, mp: this.startMp(h), moved: false, moveLocked: false, attacked: false };
    this.s.activatedThisTurn = [...done.filter(x => x !== prevFresh && x !== heroId), heroId];
    if (this.s.booted?.includes(heroId)) this.s.booted = this.s.booted.filter(x => x !== heroId);
    // ao ser ativado, pega o que ficou no seu Espaço (ex.: o Inimigo que estava ali morreu)
    this.pickup(h);
    this.checkEscort(h);
    // a Armadilha do Templo pode matá-lo na hora: o turno termina
    this.checkActiveDeath();
    this.applyFree();
    return true;
  }

  /** A ativação atual ainda não fez nada (dá para trocar de Herói ou Descansar). */
  activationFresh(): boolean {
    const a = this.s.activation;
    return !!a && !a.moved && !a.attacked && a.mp >= this.startMp(this.unit(a.heroId)) && !a.committed;
  }

  /** Dá para Descansar agora? Só se nenhum Herói fez nada neste turno (Bênção/Grito de Guerra, Botas e turno adicional contam). */
  canRest(): boolean {
    if (this.s.extraTurnOn) return false;
    const a = this.s.activation;
    if (a && !this.activationFresh()) return false;
    return (this.s.activatedThisTurn ?? []).filter(id => id !== a?.heroId).length === 0;
  }

  /** Pode ativar `heroId` pela Bênção? (outro Aliado, não ativado neste turno, em Linha de Visão de Hobsbawm). */
  canBless(heroId: string): boolean { return !!this.blessKind(heroId); }

  /** Por qual efeito o Aliado pode ser ativado agora: Grito de Guerra, Bênção ou Mente Brilhante (só Movimento). */
  blessKind(heroId: string): 'war' | 'bless' | 'mind' | null {
    const b = this.s.blessing;
    if (this.freeMode) return null;
    const ally0 = this.unit(heroId);
    if (!ally0 || !ally0.alive || !ally0.cell) return null;
    const done = (this.s.activatedThisTurn ?? []).includes(heroId);
    // Grito de Guerra: qualquer Aliado ainda não ativado neste turno — também quem só andou com as Botas
    if (this.s.warCry && ally0.guild === this.s.warCry && (!done || (this.s.booted ?? []).includes(heroId))) return 'war';
    if (done) return null;
    if (b) {
      const hob = this.unit(b.heroId);
      if (hob.alive && hob.cell && ally0.id !== hob.id && ally0.guild === hob.guild && this.hasLOS(hob, hob.cell, ally0.cell)) return 'bless';
    }
    if (this.s.brightMind && ally0.guild === this.s.brightMind) return 'mind';
    return null;
  }

  canMove(): boolean {
    const a = this.s.activation;
    if (!a || a.moveLocked || a.mp <= 0) return false;
    const h = this.s.units[a.heroId];
    return !!h?.alive && !!h.cell;
  }

  /** Prévia do movimento até `target`: Monstros que fariam Reação de Alerta no caminho (sem mudar nada). */
  alertPreview(target: Cell, openDoors = true): Unit[] {
    const a = this.s.activation;
    if (!a || a.moveLocked) return [];
    const h = this.unit(a.heroId);
    if (!h.cell || (this.ab(h) === 'furtivo' && !(this.s.stealthUsed ?? []).includes(h.id))) return [];
    const nodes = this.reachable(h, a.mp, h.cell, openDoors);
    const node = nodes.get(key(target));
    if (!node || node.prev === null) return [];
    const steps = this.pathTo(nodes, target);
    const start = h.cell;
    const out: Unit[] = [];
    let from = start;
    try {
      for (const st of steps) {
        if (!st.portal) {
          h.cell = from;
          for (const m of this.monstersCloseTo(from)) if (this.monsterCanAttack(m, h)) out.push(m);
        }
        from = st.cell;
      }
    } finally { h.cell = start; }
    return out;
  }

  /** Prévia do ataque: Monstros Perto que farão Reação de Alerta (o alvo não é um Monstro Perto). */
  attackAlertPreview(heroId: string, targetId: string, cardUid: string): Unit[] {
    const h = this.unit(heroId), t = this.unit(targetId);
    const card = h?.cards.find(c => c.uid === cardUid);
    if (!h?.cell || !t || !card || this.cardDef(card).fx.astral) return [];
    if (t.kind === 'monster' && t.cell && this.board.isClose(t.cell, h.cell)) return [];
    return this.monstersCloseTo(h.cell, false).filter(m => m.id !== t.id && this.monsterCanAttack(m, h));
  }

  moveTo(target: Cell, openDoors = false): boolean {
    const a = this.s.activation;
    if (!this.canAct() || !a || a.moveLocked) return false;
    const h = this.unit(a.heroId);
    if (!h.alive || !h.cell) return false; // o Herói ativo morreu (ex.: numa Reação)
    const nodes = this.reachable(h, a.mp, h.cell, openDoors);
    const node = nodes.get(key(target));
    if (!node || !node.canEnd || node.prev === null) return false;
    const steps = this.pathTo(nodes, target);
    a.moved = true;
    if (this.s.blessing?.heroId === h.id) this.s.blessing = null;
    // último Espaço do caminho onde o Herói podia parar (se o Movimento for interrompido num Espaço cheio, volta para ele)
    let lastOk: Cell = { ...h.cell };
    // Furtividade (Vapor): 1 vez por turno, o jogador escolhe esquivar das Reações de Alerta deste movimento
    let stealth: boolean | null = null;
    for (const st of steps) {
      if (!h.alive || !h.cell) break; // morreu ou foi banido no caminho
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
        let alerters = near;
        if (this.ab(h) === 'furtivo' && near.some(m => this.monsterCanAttack(m, h))) {
          if (stealth === null) {
            const free = !(this.s.stealthUsed ?? []).includes(h.id);
            const who = near.filter(m => this.monsterCanAttack(m, h)).map(m => `<b>${this.name(m)}</b>`).join(', ');
            stealth = free && this.confirm(h, 'Furtividade', `<b>${this.name(h)}</b> vai sair de perto de ${who} e receber Reação de Alerta. Usar a Furtividade para esquivar? <small>(1 vez por turno)</small>`, true, undefined,
              { yes: '💨 Esquivar', no: 'Não esquivar (guardar)' });
            if (stealth) this.s.stealthUsed = [...(this.s.stealthUsed ?? []), h.id];
          }
          if (stealth) { alerters = []; this.emit({ t: 'skill', id: h.id, skill: 'furtivo', name: 'Furtividade' }); }
        }
        for (const m of alerters) {
          if (!h.alive || !h.cell) break; // morreu ou foi banido no caminho
          this.emit({ t: 'reaction', monsterId: m.id, kind: 'alerta' });
          this.monsterAttack(m, h, 'alerta');
        }
        if (!h.alive || !h.cell) break; // morreu ou foi banido no caminho
      }
      // algo apareceu no caminho durante uma Reação (ex.: Necromante ergueu um Monstro): o Movimento para aqui
      if (this.status(h, st.cell) === 'blocked' || (st === steps[steps.length - 1] && this.cellLoad(st.cell, h) + this.weight(h) > 2)) break;
      a.mp -= 1;
      const fits = this.cellLoad(st.cell, h) + this.weight(h) <= 2;
      h.cell = { ...st.cell };
      if (fits) lastOk = { ...st.cell };
      this.emit({ t: 'move', id: h.id, from, to: st.cell, portal: st.portal });
      this.bloodCrown(h, from);
      if (!h.alive || !h.cell) break; // morreu ou foi banido no caminho
      this.triggerMines(h);
      this.pickup(h);
      this.checkEscort(h);
      this.checkHideout(h);
    }
    // o Movimento foi interrompido num Espaço de passagem cheio: vai para o Espaço Perto livre mais próximo
    if (h.alive && h.cell && this.cellLoad(h.cell) > 2) {
      // sem Espaço livre Perto: volta para o último Espaço do caminho onde podia parar
      const spot = this.placeCells(h, h.cell)[0] ?? (this.cellLoad(lastOk, h) + this.weight(h) <= 2 ? lastOk : undefined);
      if (spot) this.place(h, spot);
    }
    if (h.alive && h.cell) this.assassinCloak(h);
    if (h.alive && h.cell) this.trickOrTreat(h);
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

  /** Cartas de ataque disponíveis do Herói ativo (Suga-Mente: também as de quem divide o Espaço). */
  usableCards(h: Unit): CardInst[] { return this.attackCardPool(h).filter(c => !c.exhausted); }

  /** Kanga pode sofrer 1 Ferimento em vez de exaustar a carta (se não morrer com isso). */
  canSacrifice(h: Unit): boolean {
    return h.kind === 'hero' && this.ab(h) === 'autossacrificio' && h.wounds + 1 < this.maxHp(h);
  }

  /** Rolagem de um Herói com o Conjunto de Rerrolagem usado automaticamente nos dados que falharam. */
  private heroRoll(h: Unit, n: number, die: DieFace[], success: DieFace, mode: DiceMode, kind: 'attack' | 'defense' = 'attack', rrOver?: number, target?: Unit): RollResult {
    const rr = rrOver ?? this.rerollsOf(h);
    const defHero = die === DEFENSE_DIE && this.defNeed != null && h.kind === 'hero';
    if (mode !== 'normal' || (!rr && !defHero)) return this.roll(n, die, success, mode, true, die === DEFENSE_DIE ? this.defNeed ?? Infinity : Infinity);
    return this.rollRerolls(n, die, success, rr, h, kind, target);
  }

  /** Rolagem de Defesa de quem é atacado. */
  /** Acertos que a Defesa em andamento precisa bloquear (depois disso, não rola mais ✷ nem Rerrolagem). */
  private defNeed: number | null = null;

  /** Rolagem de Defesa: `need` = acertos do ataque (0 = não precisa rolar; já bloqueou tudo = para de rolar). */
  private defenseRoll(t: Unit, dice: number, attacker: Unit, need?: number): RollResult {
    if (need !== undefined && need <= 0 && dice > 0 && !t.stunned) {
      let go = false;
      if (t.kind === 'hero' && t.guild && this.rerollHook) {
        const pick = this.rerollHook({ heroId: t.id, kind: 'defense', faces: [], success: 'shield', rerolls: 0, base: 0, round: 1, guild: t.guild,
          vs: this.curAttack ?? undefined, covered: true, noHits: true, ...(this.curDefsDone.length ? { done: this.curDefsDone.slice() } : {}) });
        go = pick !== 'auto' && pick.includes(HELD_PICK);
      }
      if (!go) { this.curDefsDone.push({ id: t.id, faces: [], blocks: 0, noHits: true }); return { faces: [], successes: 0, crits: 0, noHits: true }; }
      need = undefined;
    }
    this.defNeed = need ?? null;
    this.defWho = t;
    try {
      const r = this.defenseRollInner(t, dice, attacker);
      r.base = this.lastDefDice;
      this.curDefsDone.push({ id: t.id, faces: r.faces.slice(), blocks: r.successes });
      return r;
    } finally { this.defNeed = null; this.defWho = null; }
  }

  private lastDefDice = 0;
  /** Quem está rolando a Defesa agora, e se já escolheu continuar rolando os ✷ depois de bloquear tudo. */
  private defWho: Unit | null = null;
  /** Defesas já resolvidas no ataque em andamento (vários alvos: o painel mostra uma de cada vez). */
  private curDefsDone: { id: string; faces: DieFace[]; blocks: number; noHits?: boolean }[] = [];
  /** Rola os dados extras dos ✷ que ficaram guardados. */
  private rollHeld(r: RollResult, die: DieFace[], success: DieFace): RollResult {
    if (!r.held) return r;
    const more = this.roll(r.held, die, success, 'normal');
    const faces = [...r.faces, ...more.faces].slice(0, this.diceLimit(die));
    return { faces, successes: faces.filter(f => f === success || f === 'crit').length, crits: faces.filter(f => f === 'crit').length };
  }
  private defenseRollInner(t: Unit, dice: number, attacker: Unit): RollResult {
    if (t.kind === 'hero' && !t.stunned) {
      const ks = t.cards.find(c => this.cardDef(c).fx.kingShield);
      const n = ks ? this.cardDef(ks).fx.kingShield! : 0;
      const hits = this.defNeed ?? this.curAttack?.hits ?? 0;
      const vs = this.curAttack ?? { id: attacker.id, faces: [], hits, type: 'melee', base: 0 };
      if (ks && !t.spent && t.alive && dice > 0 && (ks.armed || this.shieldAsk(t, 'king', vs, hits >= this.maxHp(t) - t.wounds && hits > dice, n))) {
        dice += n;
        ks.armed = false;
        t.spent = true;
        this.emit({ t: 'skill', id: t.id, skill: 'escudo_rei', name: `Escudo do Rei +${n}` });
        this.log(`Escudo do Rei: ${this.name(t)} rola +${n} dados de Defesa (o Herói fica exausto).`);
      }
    }
    this.lastDefDice = dice;
    // Encantado (Hassan): quem se defende do ataque dele não usa Rerrolagem
    const charmed = attacker.kind === 'hero' && this.ab(attacker) === 'encantado';
    if (t.kind === 'hero') {
      const r = this.heroRoll(t, dice, DEFENSE_DIE, 'shield', this.s.debug.defenseDice, 'defense', charmed ? 0 : undefined);
      if (this.hasPerm(t, 'dragonHeart') && r.crits) r.successes += r.crits;
      const tab = this.ab(t);
      // Trapaceiro (Monkey King): cada ✷ na Defesa bloqueia mais um
      if (tab === 'trapaceiro' && r.crits) { r.successes += r.crits; this.emit({ t: 'skill', id: t.id, skill: 'trapaceiro', name: 'Trapaceiro' }); }
      // Implacável (Yun): com ✷ na Defesa, restaura uma carta
      if (tab === 'implacavel' && r.crits) {
        const c = t.cards.filter(x => x.exhausted).sort((p, q) => (this.isAttackCard(q) ? 1 : 0) - (this.isAttackCard(p) ? 1 : 0))[0];
        if (c) { c.exhausted = false; c.uses = 0; this.emit({ t: 'skill', id: t.id, skill: 'implacavel', name: 'Implacável' }); this.log(`Implacável: ${this.name(t)} restaura ${this.cardDef(c).name}.`); }
      }
      return r;
    }
    return this.rollRerolls(dice, DEFENSE_DIE, 'shield', charmed ? 0 : this.monDef(t, attacker).rerolls);
  }

  /** Ataque (p.15-17) + reações (p.19-21). */
  attack(cardUid: string, targetId: string, secondaryId?: string, sacrifice = false, boostUids: string[] = []): boolean {
    const a = this.s.activation;
    if (!this.canAct() || !a || a.attacked || a.moveOnly) return false;
    const h = this.unit(a.heroId);
    const card = this.findAttackCard(h, cardUid);
    const borrowed = !!card && !h.cards.includes(card);
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
    let { dice: n, notes } = this.attackDicePreview(h, card, target, boosts.map(b => b.uid));
    notes = notes.filter(x => !x.startsWith('Mestre Espadachim'));
    // Mestre Espadachim (Montoya): exaustar o Herói para +2 dados com Espada
    if (ab === 'mestre_espadachim' && def.group === 'Espada' && !h.spent && !this.freeMode
      && this.confirm(h, 'Mestre Espadachim', `Exaustar <b>${HEROES[h.defId].name}</b> (não pode ser ativado até Descansar) para rolar <b>+2 dados</b> com ${def.name}?`, true)) {
      h.spent = true;
      n += 2;
      if (this.s.diceCap && n > 8) n = 8;
      notes.push('Mestre Espadachim +2');
      this.emit({ t: 'skill', id: h.id, skill: 'mestre_espadachim', name: 'Mestre Espadachim' });
    }
    const targetHurt = target.wounds > 0;
    this.curCard = { name: CARDS[card.defId]?.name ?? '', type: CARDS[card.defId]?.attackType ?? 'melee' };

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
    const tenaz = ab === 'feitico_tenaz' && !!def.magic && targetHurt;
    const noExhaust = boosts.some(b => this.cardDef(b).fx.noExhaust) || borrowed || tenaz;
    if (tenaz) this.emit({ t: 'skill', id: h.id, skill: 'feitico_tenaz', name: 'Feitiço Tenaz' });
    if (!this.freeMode) {
      for (const b of boosts) if (this.cardDef(b).kind === 'boost') b.exhausted = true;
      if (!flanked && !sacrificed && !noExhaust) {
        // Efeito Borboleta (Farfalla): exausta a carta de Ataque de um Herói Perto no lugar da sua
        const swapped = ab === 'efeito_borboleta' ? this.butterfly(h) : false;
        if (!swapped) {
          card.uses += 1;
          if (!(def.magic && ab === 'dominio_magia' && card.uses < 2)) card.exhausted = true;
        }
      }
    }
    // Bênção (Hobsbawm): ataque Mágico sem ter feito Movimento -> pode ativar outro Aliado em LdV
    this.s.blessing = ab === 'bencao' && def.magic && !a.moved ? { heroId: h.id } : null;

    const fx = def.fx;
    // Rerrolagem: Encantado (alvo Hassan) = nenhuma; Feitiço Trapaceiro (Smiley) com Mágica = todas da Guilda
    let rrAtk = this.rerollsOf(h);
    if (ab === 'feitico_trapaceiro' && def.magic) rrAtk = this.heroesOf(h.guild!).filter(x => x.alive).reduce((s, x) => s + this.rerollsOf(x), 0);
    if (this.ab(target) === 'encantado') { rrAtk = 0; notes.push('Encantado: sem Rerrolagem'); }
    a.bonusDice = 0; // Fúria dos Mortos vale só para este ataque
    let atk = this.heroRoll(h, n, ATTACK_DIE, def.attackType!, this.s.debug.attackDice, 'attack', rrAtk, target);
    if (this.knightShield(target, { id: h.id, faces: atk.faces.slice(), hits: atk.successes, type: def.attackType!, base: n })) { atk = this.roll(n, ATTACK_DIE, def.attackType!, 'normal'); notes.push(`Escudo de Cavaleiro: ataque rolado de novo`); }
    // Sorte de Apostador (Tomrick): exaustar o Herói para trocar um dado que falhou por ✷
    const failIdx = atk.faces.findIndex(f => f !== def.attackType && f !== 'crit');
    if (ab === 'sorte_apostador' && def.magic && !h.spent && failIdx >= 0 && !this.freeMode
      && this.confirm(h, 'Sorte de Apostador', `Você rolou ${atk.successes} acerto${atk.successes === 1 ? '' : 's'}. Exaustar <b>${HEROES[h.defId].name}</b> (não pode ser ativado até Descansar) para trocar um dado que falhou por <b>✷</b>?`, atk.successes < 3, atk.faces)) {
      h.spent = true;
      atk.faces[failIdx] = 'crit';
      const more = this.roll(1, ATTACK_DIE, def.attackType!, 'normal');
      atk.faces.push(...more.faces);
      atk.successes += 1 + more.successes;
      atk.crits += 1 + more.crits;
      notes.push('Sorte de Apostador: um dado vira ✷');
      this.emit({ t: 'skill', id: h.id, skill: 'sorte_apostador', name: 'Sorte de Apostador' });
    }
    this.curAttack = { id: h.id, faces: atk.faces.slice(), hits: atk.successes, type: def.attackType!, base: n };
    this.curDefsDone = [];
    if (atk.rerolled) notes.push(`↻ ${atk.rerolled} dado${atk.rerolled > 1 ? 's' : ''} rerrolado${atk.rerolled > 1 ? 's' : ''}`);
    if (ab === 'maestria_arco' && def.group === 'Arco' && atk.crits) { atk.successes += atk.crits; notes.push(`Maestria com Arco: +${atk.crits}`); }
    if (fx.critExtra && atk.crits) { atk.successes += atk.crits * fx.critExtra; notes.push(`${def.name}: +${atk.crits * fx.critExtra} acerto(s) por ✷`); }
    if (this.hasPerm(h, 'soulseeker') && def.group === 'Arco' && atk.crits) { atk.successes += atk.crits; notes.push(`Caça-Almas: +${atk.crits}`); }

    // alvos: o principal e os que não dependem de escolha (Incinerar, Fender II). Os adicionais escolhidos
    // (Raio Nova, Fender) vêm depois que a Defesa do alvo principal aparece, num segundo ataque com os mesmos dados.
    const targets: Unit[] = [target];
    const enemiesCloseTo = (c: Cell, except: Unit[]) => this.onBoard().filter(u => !except.includes(u) && this.isEnemy(h, u) && this.board.isClose(u.cell!, c));
    if (fx.allClose) for (const u of enemiesCloseTo(target.cell!, targets)) { targets.push(u); notes.push(`${def.name} atinge também ${this.name(u)}`); }
    const cleave = this.permFx(h, 'cleave');
    const cleaveOk = cleave.length > 0 && (def.group === 'Espada' || def.group === 'Machado');
    let cleaved = false;
    if (cleaveOk && cleave.includes('all')) for (const u of enemiesCloseTo(h.cell!, targets)) { targets.push(u); notes.push(`Fender: atinge também ${this.name(u)}`); cleaved = true; }

    if (this.isObject(target)) return this.smashObject(h, target, atk, def.name, n, notes);
    const targetCells = new Map(targets.map(t => [t.id, { ...t.cell! }]));
    const pierce = this.piercing(h, card) || (fx.critNoDefense && atk.crits > 0);
    if (fx.critNoDefense && atk.crits > 0) notes.push(`${def.name}: alvo não rola Defesa`);
    const defend = (t: Unit) => {
      const dr = this.defenseRoll(t, pierce ? 0 : this.defenseDice(t, h, def.attackType), h, fx.onlyCritSaves ? undefined : atk.successes);
      const blocks = fx.onlyCritSaves ? dr.faces.filter(f => f === 'crit').length : dr.successes;
      if (fx.onlyCritSaves) dr.successes = blocks;
      return { t, dr, wounds: Math.max(0, atk.successes - blocks) };
    };
    const evTarget = (r: { t: Unit; dr: RollResult; wounds: number }) => ({ id: r.t.id, defense: r.dr.faces, blocks: r.dr.successes, wounds: r.wounds, stunnedNoDefense: r.t.stunned, rr: r.dr.rr, ...(r.dr.noHits ? { noHits: true } : {}), ...(r.dr.base !== undefined ? { base: r.dr.base } : {}) });
    const results = targets.map(defend);
    if (fx.onlyCritSaves) notes.push('Só ✷ na Defesa bloqueia');
    // dano espalhado (Raio Nova, Fender): a escolha do alvo adicional vem antes da animação do golpe
    const spreads: { source: string; from: Cell }[] = [];
    if (fx.extraOnCrit && atk.crits > 0) spreads.push({ source: def.name, from: { ...target.cell! } });
    if (cleaveOk && !cleave.includes('all')) spreads.push({ source: 'Fender', from: { ...h.cell! } });
    const willSpread = spreads.some(sp => enemiesCloseTo(sp.from, targets).length > 0);
    // som da habilidade: Bênção do Hobsbawm, crítico com Arco do Casacaverde
    // Bênção: o som só toca se houver Aliado que ela pode ativar (em Linha de Visão, ainda não ativado)
    const blessOk = !!this.s.blessing && this.heroesOf(h.guild!).some(x => this.canBless(x.id));
    const sfx = blessOk ? 'hobsbawn' : ab === 'maestria_arco' && def.group === 'Arco' && atk.crits ? 'bow-critico' : undefined;
    const thrown = ab === 'arremesso' && def.group === 'Espada' && !this.board.isClose(h.cell!, target.cell!);
    this.emit({
      t: 'attack', attackerId: h.id, reason: 'heroi', cardName: def.name, attackType: def.attackType!, baseDice: n, ...(cleaved ? { cleave: true } : {}), ...(sfx ? { sfx } : {}), ...(thrown ? { thrown: true } : {}), ...(willSpread ? { noAnim: true } : {}),
      dice: atk.faces, hits: atk.successes, crits: atk.crits, notes, rr: atk.rr,
      targets: results.map(evTarget),
    });
    // dano espalhado: quem atacou escolhe o alvo adicional depois de ver o ataque e a Defesa do alvo principal
    let fenderHit = false;
    for (const sp of spreads) {
      const extra = enemiesCloseTo(sp.from, targets);
      if (!extra.length) continue;
      const chosen = this.chooseExtra(h, sp.source, extra, atk.faces);
      const pick = chosen !== undefined ? chosen
        : sp.source === def.name ? extra.find(u => u.id === secondaryId) ?? extra.sort((p, q) => this.killScore(p) - this.killScore(q))[0] : extra[0];
      if (!pick) continue;
      targets.push(pick);
      targetCells.set(pick.id, { ...pick.cell! });
      const r = defend(pick);
      results.push(r);
      this.emit({
        t: 'attack', attackerId: h.id, reason: 'heroi', cardName: sp.source, attackType: def.attackType!, baseDice: n, spread: true, noAnim: true,
        dice: atk.faces, hits: atk.successes, crits: atk.crits, notes: [`${sp.source}: atinge também ${this.name(pick)} (mesmos dados)`],
        targets: [evTarget(r)],
      });
      if (sp.source === 'Fender') fenderHit = true;
    }
    // e só agora o golpe no mapa, em todos os alvos de uma vez (Fender: o Herói gira com a espada)
    if (willSpread) this.emit({
      t: 'strike', attackerId: h.id, cardName: def.name, attackType: def.attackType!, targets: results.map(r => ({ id: r.t.id })),
      ...(cleaved || fenderHit ? { cleave: true } : {}), ...(thrown ? { thrown: true } : {}), ...(sfx ? { sfx } : {}),
    });

    const dying: Unit[] = [];
    let vengeful: Unit | null = null;
    /** Monstros atacados que podem fazer a Vingança (só um faz; quem controla escolhe, p.20). */
    const vengeCands: Unit[] = [];
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
          if (!this.isObject(t)) { vengeCands.push(t); if (!vengeful) vengeful = t; }
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
      this.s.mines = [...(this.s.mines ?? []).filter(m => m.guild !== h.guild), ...cells.map(cell => ({ cell, guild: h.guild!, dice: def.dice, card: def.id }))];
      this.log(`Campo de minas da ${this.guild(h.guild!).name} em ${cells.length} Espaços!`);
    }
    // curas
    const heal = (u: Unit, amount: number) => {
      const x = Math.min(amount, u.wounds);
      if (x > 0 && u.alive) { u.wounds -= x; this.emit({ t: 'heal', id: u.id, amount: x, wounds: u.wounds }); }
    };
    if (fx.drain && h.alive) {
      // cada acerto rolado cura, mesmo que o alvo bloqueie com a Defesa
      const hits = atk.successes;
      heal(h, hits);
      const allies = this.heroesOf(h.guild!).filter(x => x.id !== h.id && x.alive && x.cell && this.board.isClose(x.cell, h.cell!));
      if (fx.drain === 'ally1') { const a1 = allies.sort((p, q) => q.wounds - p.wounds)[0]; if (a1) heal(a1, hits); }
      if (fx.drain === 'allies') for (const x of allies) heal(x, hits);
    }
    if (boosts.some(b => this.cardDef(b).fx.lifesteal) && h.alive) heal(h, dealt);
    // ---- Heróis extras: depois do dano
    const killedMain = !target.alive || dying.includes(target);
    if (h.alive && dealt > 0 && ((ab === 'ritual_sangue' && def.magic) || (ab === 'lamina_sugadora' && ['Espada', 'Machado', 'Lança'].includes(def.group)))) {
      this.emit({ t: 'skill', id: h.id, skill: ab, name: ab === 'ritual_sangue' ? 'Ritual de Sangue' : 'Lâmina Sugadora' });
      heal(h, dealt);
    }
    // Feitiço da Banshee: o ataque Mágico que fere Atordoa
    if (ab === 'feitico_banshee' && def.magic) for (const r of results) if (r.wounds > 0 && r.t.alive && !r.t.stunned && !dying.includes(r.t)) this.setStun(r.t, true);
    // Olhar Petrificante: 1 marcador por ✷ no alvo (não em Vilões)
    if (ab === 'olhar_petrificante' && atk.crits && target.alive && !dying.includes(target) && !(target.kind === 'monster' && MONSTERS[target.defId].category.startsWith('Vilão'))) {
      target.petrified = (target.petrified ?? 0) + atk.crits;
      this.emit({ t: 'skill', id: h.id, skill: 'olhar_petrificante', name: 'Olhar Petrificante' });
      this.log(`Olhar Petrificante: ${this.name(target)} perde ${target.petrified} Ponto${target.petrified > 1 ? 's' : ''} de Movimento até Descansar.`);
    }
    // Briga (McHammer): cada ✷ num ataque Próximo não Mágico fere outro Inimigo Perto
    if (ab === 'briga' && def.attackType === 'melee' && !def.magic && atk.crits && h.alive && h.cell) {
      for (let i = 0; i < atk.crits; i++) {
        const others = this.enemiesClose(h).filter(u => !targets.includes(u) && !dying.includes(u)).sort((p, q) => this.killScore(p) - this.killScore(q));
        if (!others.length) break;
        this.emit({ t: 'skill', id: h.id, skill: 'briga', name: 'Briga' });
        this.log(`Briga: 1 Ferimento em ${this.name(others[0])}.`);
        this.hurt(others[0], 1, h);
      }
    }
    // Tiro Explosivo (Pluck): acertou com ataque a Distância não Mágico -> move os personagens do Espaço do alvo
    if (ab === 'tiro_explosivo' && def.attackType === 'ranged' && !def.magic && results[0].wounds > 0) {
      const c0 = targetCells.get(target.id)!;
      for (const u of this.unitsAt(c0)) if (u.alive && !dying.includes(u)) this.pushAway(u, h, 2, 'Tiro Explosivo');
    }
    // Zás-Trás (Bob): ✷ num ataque Mágico -> um Herói da Guilda vai para Perto do alvo
    if (ab === 'zas_tras' && def.magic && atk.crits && h.alive) this.zasTras(h, targetCells.get(target.id)!);
    // Mente Brilhante: ✷ num ataque Mágico -> outro Aliado pode se mover
    if (ab === 'mente_brilhante' && def.magic && atk.crits && this.heroesOf(h.guild!).some(x => x.id !== h.id && x.alive && x.cell && !(this.s.activatedThisTurn ?? []).includes(x.id))) {
      this.s.brightMind = h.guild;
      this.emit({ t: 'skill', id: h.id, skill: 'mente_brilhante', name: 'Mente Brilhante' });
      this.log(`Mente Brilhante: ${this.guild(h.guild!).name} pode ativar outro Herói só para se mover.`);
    }
    // Trapaceiro (Monkey King): com ✷ na Defesa pode ir para um Espaço Perto
    for (const r of results) if (r.t.kind === 'hero' && r.t.alive && this.ab(r.t) === 'trapaceiro' && r.dr.crits) this.tricksterHop(r.t, h);
    // Bate e Corre (Arco) / Feitiço da Pressa (Mágica): 2 PM extras para usar na hora
    if (h.alive && ((ab === 'bate_corre' && def.group === 'Arco') || (ab === 'feitico_pressa' && def.magic))) {
      a.moveLocked = false;
      a.mp = Math.max(this.freeMode ? FREE_MP : 0, 2);
      this.emit({ t: 'skill', id: h.id, skill: ab, name: ab === 'bate_corre' ? 'Bate e Corre' : 'Feitiço da Pressa' });
      this.log(`${ab === 'bate_corre' ? 'Bate e Corre' : 'Feitiço da Pressa'}: ${this.name(h)} ganha 2 Pontos de Movimento.`);
    }
    // Caçador (Viktor): matou o alvo -> pode usar outra carta de Ataque
    if (ab === 'cacador' && killedMain && h.alive && h.cards.some(c => !c.exhausted && this.isAttackCard(c))) {
      a.attacked = false;
      this.emit({ t: 'skill', id: h.id, skill: 'cacador', name: 'Caçador' });
      this.log(`Caçador: ${this.name(h)} pode atacar de novo.`);
    }
    // Rajada de Vento: empurra o alvo (sem Reação de Alerta)
    if (fx.push && results[0].wounds > 0 && target.alive && target.cell && !dying.includes(target)) this.pushAway(target, h, fx.push);
    // Enxame da Morte: com ✷, Monstros do Cemitério voltam perto dos Inimigos
    if (fx.swarm && atk.crits > 0) this.swarm(h, fx.swarm);
    // Grito de Guerra: com ✷, pode ativar outro Aliado
    if (this.hasPerm(h, 'warCry') && atk.crits > 0 && this.heroesOf(h.guild!).some(x => x.id !== h.id && x.alive && x.cell && !(this.s.activatedThisTurn ?? []).includes(x.id))) {
      this.s.warCry = h.guild;
      this.emit({ t: 'skill', id: h.id, skill: 'grito_guerra', name: 'Grito de Guerra' });
      this.log(`Grito de Guerra: ${this.guild(h.guild!).name} pode ativar outro Herói neste turno.`);
    }
    // Maldição "Propenso a Acidentes"
    if (h.curse === 'propenso' && dealt === 0 && h.alive) { this.log(`${this.name(h)} é Propenso a Acidentes: sofre 1 Ferimento.`); this.damageHero(h, 1, { kind: 'trap' }); }

    // Reação de Alerta acionada por Ataque: o ataque não teve como alvo um Monstro Perto.
    const targetedCloseMonster = !h.cell || targets.some(t => t.kind === 'monster' && this.board.isClose(targetCells.get(t.id)!, h.cell!));
    if (!targetedCloseMonster && h.alive && !fx.astral) {
      for (const m of this.monstersCloseTo(h.cell!, false)) {
        if (!h.alive) break;
        if (dying.includes(m)) continue;
        this.emit({ t: 'reaction', monsterId: m.id, kind: 'alerta' });
        this.monsterAttack(m, h, 'alerta');
      }
    }
    // Vários Monstros atacados (Raio Nova, Fender…): só um faz a Vingança — o jogador que controla os Monstros escolhe qual (p.20)
    const cands = vengeCands.filter(m => m.alive && m.cell);
    if (cands.length > 1 && h.alive && !fx.astral && this.choiceHook) {
      const i = this.choiceHook({ choice: 'extra', guild: this.monsterControllerGuild(), heroId: h.id, source: 'Reação de Vingança', units: cands.map(m => m.id),
        text: `<b>${this.name(h)}</b> atacou ${cands.length} Monstros: só um faz a Reação de Vingança. Escolha qual Monstro você vai controlar.` });
      if (i !== 'auto' && cands[i]) vengeful = cands[i];
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

  /** Ataque a um objeto (Reserva de Comida): se rolar algum ✷, é destruído e cumpre a Missão (sem Defesa, sem Reações). */
  private smashObject(h: Unit, o: Unit, atk: RollResult, card: string, base: number, notes: string[]): boolean {
    const ok = atk.crits > 0;
    notes.push(ok ? '✷: a Reserva foi destruída!' : 'Sem ✷: a Reserva aguenta');
    this.emit({ t: 'attack', attackerId: h.id, reason: 'heroi', cardName: card, attackType: this.curCard?.type === 'ranged' ? 'ranged' : 'melee', baseDice: base,
      dice: atk.faces, hits: atk.successes, crits: atk.crits, notes, rr: atk.rr, targets: [{ id: o.id, defense: [], blocks: 0, wounds: ok ? 1 : 0, stunnedNoDefense: false }] });
    if (ok) {
      o.alive = false;
      o.cell = null;
      this.emit({ t: 'death', id: o.id, exterminated: true });
      const m = this.s.missions.find(x => x.rule === 'destroy');
      if (m) this.completeMission(h.guild!, m.id, h);
    }
    this.finishAttack([], h);
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
      // a Reação de Vingança acontece antes de morrer (p.21): se ele se curou nela (Lorde Presas), sobrevive
      if (m.alive && m.wounds < this.monDef(m, h).hp) { this.log(`${this.name(m)} se curou e continua vivo!`); continue; }
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
  /** Portas (não trancadas) Perto do Monstro da Vingança: ele pode abrir ou fechar (1 ponto de Movimento cada). */
  vengeanceDoors(): string[] {
    const p = this.s.pending;
    if (!p) return [];
    const m = this.unit(p.monsterId);
    if (!m.cell || this.monAbility(m, 'object')) return [];
    return this.s.doors.filter(d => !d.locked && (sameCell(d.a, m.cell) || sameCell(d.b, m.cell))).map(d => d.id);
  }

  /** Para onde o Monstro da Vingança pode ir e de onde ataca — depois de abrir/fechar as portas `doors`. */
  vengeanceOptions(doors: string[] = []): { reach: Map<string, PathNode>; attackFrom: Set<string> } | null {
    const p = this.s.pending;
    if (!p) return null;
    const m = this.unit(p.monsterId), h = this.unit(p.heroId);
    const ok = this.vengeanceDoors();
    const use = doors.filter(id => ok.includes(id)).slice(0, this.monMove(m));
    const toggled = use.map(id => this.s.doors.find(d => d.id === id)!);
    for (const d of toggled) d.open = !d.open; // simula as portas mexidas (e desfaz no fim)
    try {
      const reach = this.reachable(m, this.monMove(m) - use.length);
      const attackFrom = new Set<string>();
      for (const [k, n] of reach) if (n.canEnd && this.monsterCanAttack(m, h, n.cell)) attackFrom.add(k);
      return { reach, attackFrom };
    } finally {
      for (const d of toggled) d.open = !d.open;
    }
  }

  /** O controlador dos Monstros decide: mover (opcional) até `dest` e atacar ou não. */
  resolveVengeance(dest: Cell | null, doAttack: boolean, doors: string[] = []): boolean {
    const p = this.s.pending;
    if (!p || this.s.winner) return false;
    const m = this.unit(p.monsterId), h = this.unit(p.heroId);
    if (!m.alive || !m.cell || !h.alive) { doAttack = false; dest = null; doors = []; }
    // portas Perto do Monstro: abre/fecha antes de mover (1 ponto de Movimento cada)
    const okDoors = this.vengeanceDoors();
    if (doors.some(id => !okDoors.includes(id)) || new Set(doors).size !== doors.length || doors.length > this.monMove(m)) return false;
    for (const id of doors) {
      const d = this.s.doors.find(x => x.id === id)!;
      d.open = !d.open;
      this.emit({ t: 'door', doorId: d.id, open: d.open, by: m.id });
      this.log(`${MONSTERS[m.defId].name} ${d.open ? 'abriu' : 'fechou'} uma porta.`);
    }
    if (dest && m.cell && !sameCell(dest, m.cell)) {
      const nodes = this.reachable(m, this.monMove(m) - doors.length);
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
      if (!this.monAbility(m, 'shove') && this.cellLoad(st.cell, m) + this.weight(m) > 2 && sameCell(st.cell, dest)) break;
      m.cell = { ...st.cell };
      this.emit({ t: 'move', id: m.id, from, to: st.cell, portal: st.portal });
      if (this.monAbility(m, 'shove')) this.shove(m, from);
      this.bloodCrown(m, from);
      if (!m.alive) return;
    }
  }

  /** Empurrão (p.6): quem está no Espaço em que o Monstro entrou vai para um Espaço Perto (sem Reação de Alerta). */
  private shove(m: Unit, vacated: Cell) {
    for (const u of this.unitsAt(m.cell!).filter(x => x.id !== m.id)) {
      const cells = [vacated, ...this.board.neighbors(m.cell!).filter(c => this.board.isClose(m.cell!, c))]
        .filter(c => !sameCell(c, m.cell) && this.board.playable(c) && this.cellLoad(c) + this.weight(u) <= 2);
      // longe de quem empurra, se der (o jogo decide por quem controla os Monstros)
      const cell = cells.sort((a, b) => (sameCell(a, vacated) ? 1 : 0) - (sameCell(b, vacated) ? 1 : 0))[0];
      if (!cell) continue;
      const from = u.cell!;
      u.cell = { ...cell };
      this.emit({ t: 'move', id: u.id, from, to: { ...cell }, push: true });
      this.log(`${this.name(m)} empurra ${this.name(u)}.`);
      if (u.kind === 'hero') { this.triggerMines(u); this.pickup(u); }
    }
  }

  /** Banimento (p.7): o personagem vai para o Tabuleiro de Entrada, vivo, com Ferimentos e marcadores.
   *  Tabuleiro cheio: um Herói volta na hora para a Área Inicial (ou Perto de um Aliado). */
  banish(u: Unit, by?: Unit): boolean {
    if (!u.alive || !u.cell) return false;
    if (u.kind === 'monster' && this.map.noBanish?.includes(baseId(u.defId))) return false;
    const from = { ...u.cell };
    u.stunned = false;
    u.petrified = 0;
    if (this.s.entryBoard.length >= 5) {
      if (u.kind !== 'hero') return false;
      this.emit({ t: 'death', id: u.id, banish: true });
      u.cell = null;
      this.resurrect(u, undefined, true);
      this.log(`${this.name(u)} foi banido, mas o Tabuleiro de Entrada está cheio: volta para a Área Inicial.`);
      return true;
    }
    u.cell = null;
    if (u.kind === 'hero') u.banished = true; else { u.alive = false; u.wounds = u.wounds; }
    this.s.entryBoard.push(u.id);
    this.emit({ t: 'death', id: u.id, banish: true });
    this.emit({ t: 'cemetery', id: u.id, count: this.s.entryBoard.length, full: this.s.entryBoard.length >= 5 });
    this.log(`${this.name(u)} foi banido${by ? ` por ${this.name(by)}` : ''} para o Tabuleiro de Entrada.`);
    void from;
    return true;
  }

  /** Descansar a Guilda (p.18): restaurar cartas, recuperar atordoados, ressuscitar. Encerra o turno. */
  /** Espaços de inventário de um Herói (4; Tomo da Iluminação dá +2 para Mágicas; algumas Maldições ocupam 1). */
  slotsUsed(h: Unit, cards: CardInst[] = h.cards): { used: number; max: number } {
    const magicExtra = cards.reduce((s, c) => s + (this.cardDef(c).fx.magicSlots ?? 0), 0);
    const magic = cards.filter(c => this.cardDef(c).magic && this.cardDef(c).kind === 'attack').length;
    const curseSlot = h.curse && CURSES[h.curse]?.slot ? 1 : 0;
    return { used: cards.length - Math.min(magic, magicExtra) + curseSlot, max: 4 };
  }

  /** Muda a ordem das cartas de um Herói (o jogador arruma; a Maldição que ocupa espaço fica no 1º). */
  reorderCards(guild: GuildId, heroId: string, uids: string[]): boolean {
    const h = this.unit(heroId);
    if (!h || h.guild !== guild || h.kind !== 'hero') return false;
    const cur = h.cards.map(c => c.uid);
    if (uids.length !== cur.length || !uids.every(u => cur.includes(u)) || new Set(uids).size !== uids.length) return false;
    h.cards = uids.map(u => h.cards.find(c => c.uid === u)!);
    return true;
  }

  /** Maldição que ocupa espaço com o inventário cheio: troca a carta que fica debaixo dela (antes de usar a carta). */
  setCurseCover(heroId: string, cardUid: string): boolean {
    const h = this.unit(heroId);
    if (!h || h.guild !== this.currentGuild().id || !h.covered) return false;
    const i = h.cards.findIndex(c => c.uid === cardUid);
    if (i < 0 || h.cards[i].exhausted) return false;
    const [c] = h.cards.splice(i, 1, h.covered);
    h.covered = c;
    this.log(`${this.name(h)}: a Maldição agora cobre ${this.cardDef(c).name}.`);
    return true;
  }

  /** Cabe mais esta carta no inventário do Herói? (Tomo da Iluminação: +2 espaços só para Ataques Mágicos.) */
  hasRoom(h: Unit, defId: string): boolean {
    const s = this.slotsUsed(h, [...h.cards, { uid: '_new', defId, exhausted: false, uses: 0 }]);
    return s.used <= s.max;
  }
  /** Quantos espaços de carta mostrar para o Herói (4 + espaços Mágicos do Tomo). */
  slotCount(h: Unit): number {
    return 4 + h.cards.reduce((s, c) => s + (this.cardDef(c).fx.magicSlots ?? 0), 0);
  }

  // =========================================================================
  // Cartas com efeitos especiais
  // =========================================================================
  private heroesAll(): Unit[] { return Object.values(this.s.units).filter(u => u.kind === 'hero'); }
  private enemiesClose(u: Unit, c: Cell = u.cell!): Unit[] {
    return this.onBoard().filter(x => x.id !== u.id && this.isEnemy(u, x) && this.board.isClose(x.cell!, c));
  }

  /** Ferimentos causados por um efeito de carta (sem rolagem). */
  private hurt(u: Unit, n: number, by: Unit) {
    if (!u.alive || !u.cell || n <= 0) return;
    if (u.kind === 'hero') { this.damageHero(u, n, { kind: by.kind === 'hero' ? 'hero' : 'monster', id: by.id }); return; }
    const md = MONSTERS[u.defId];
    if (by.kind === 'hero' && md.category.startsWith('Vilão')) u.hitBy = [...new Set([...(u.hitBy ?? []), by.guild!])];
    u.wounds += n;
    this.emit({ t: 'damage', id: u.id, amount: n, wounds: u.wounds, maxHp: md.hp });
    if (u.wounds >= md.hp && by.kind === 'hero') this.monsterDies(u, by, false);
  }

  /** Coroa de Sangue: quem sai de um Espaço Perto do Herói com a Coroa sofre 2 Ferimentos. */
  private bloodCrown(mover: Unit, from: Cell) {
    // Garras de Gatinho (Mittens): 1 Ferimento em quem sai de Perto dele (1 por Inimigo por turno)
    for (const x of this.heroesAll()) {
      if (!mover.alive) return;
      if (this.ab(x) !== 'garras' || !x.alive || !x.cell || !this.isEnemy(x, mover) || !this.board.isClose(x.cell, from)) continue;
      if ((this.s.clawed ?? []).includes(mover.id)) continue;
      this.s.clawed = [...(this.s.clawed ?? []), mover.id];
      this.emit({ t: 'skill', id: x.id, skill: 'garras', name: 'Garras de Gatinho' });
      this.log(`Garras de Gatinho: ${this.name(mover)} sofre 1 Ferimento ao sair de perto de ${this.name(x)}.`);
      this.hurt(mover, 1, x);
    }
    for (const x of this.heroesAll()) {
      if (!mover.alive) return;
      const n = this.permFx(x, 'bloodCrown').reduce((s: number, v) => s + (v ?? 0), 0);
      if (!n || !x.alive || !x.cell || !this.isEnemy(x, mover) || !this.board.isClose(x.cell, from)) continue;
      this.emit({ t: 'skill', id: x.id, skill: 'coroa_sangue', name: 'Coroa de Sangue' });
      this.log(`Coroa de Sangue: ${this.name(mover)} sofre ${n} Ferimentos ao sair de perto de ${this.name(x)}.`);
      this.hurt(mover, n, x);
    }
  }

  /** Manto do Assassino: ao terminar um movimento, 1 Ferimento em cada Inimigo Perto. */
  private assassinCloak(h: Unit) {
    if (!h.cell || !this.hasPerm(h, 'assassinCloak')) return;
    const near = this.enemiesClose(h);
    if (!near.length) return;
    this.emit({ t: 'skill', id: h.id, skill: 'manto_assassino', name: 'Manto do Assassino' });
    this.log(`Manto do Assassino: 1 Ferimento em ${near.map(x => this.name(x)).join(', ')}.`);
    for (const x of near) this.hurt(x, 1, h);
  }

  /** Escudo de Cavaleiro armado: o atacante rola de novo (o Herói fica exausto). */
  /** Escudo de Cavaleiro / do Rei: o jogador decide no painel dos dados (o ataque já aparece). IA: `auto`. */
  private shieldAsk(t: Unit, shield: 'knight' | 'king', vs: NonNullable<RerollRequest['vs']>, auto: boolean, bonus = 0): boolean {
    if (!t.guild || !this.rerollHook) return auto;
    const pick = this.rerollHook({ heroId: t.id, kind: 'defense', faces: [], success: 'shield', rerolls: 0, base: 0, round: 1, guild: t.guild,
      vs, shield, ...(bonus ? { bonus } : {}), ...(shield === 'king' && this.curDefsDone.length ? { done: this.curDefsDone.slice() } : {}) });
    return pick === 'auto' ? auto : pick.includes(HELD_PICK);
  }

  private knightShield(t: Unit, vs: NonNullable<RerollRequest['vs']>): boolean {
    const hits = vs.hits;
    if (t.kind !== 'hero' || t.spent || !t.alive || hits <= 0) return false;
    const ks = t.cards.find(c => this.cardDef(c).fx.knightShield);
    if (!ks) return false;
    if (!ks.armed && !this.shieldAsk(t, 'knight', vs, hits >= this.maxHp(t) - t.wounds)) return false;
    ks.armed = false;
    t.spent = true;
    this.emit({ t: 'skill', id: t.id, skill: 'escudo_cavaleiro', name: 'Escudo de Cavaleiro' });
    this.log(`Escudo de Cavaleiro: ${this.name(t)} obriga o atacante a rolar de novo (o Herói fica exausto).`);
    return true;
  }

  /** Alvo adicional escolhido pelo jogador (Raio Nova, Fender). undefined = escolha automática; null = nenhum.
   *  Com um só Inimigo possível não pergunta. */
  private chooseExtra(h: Unit, source: string, extra: Unit[], faces: DieFace[]): Unit | null | undefined {
    if (extra.length < 2 || !h.guild || !this.choiceHook) return undefined;
    const i = this.choiceHook({ choice: 'extra', guild: h.guild, heroId: h.id, source, units: extra.map(u => u.id), faces: faces.slice() });
    return i === 'auto' ? undefined : extra[i] ?? null;
  }

  /** Rajada de Vento: empurra o alvo até N Espaços, para o mais longe possível de quem atacou. */
  private pushAway(t: Unit, by: Unit, n: number, source = 'Rajada de Vento') {
    const start = t.cell!;
    // empurrão não usa portal (teletransporte): nem pára no portal nem atravessa para o outro lado
    const nodes = this.reachable(t, n, start, false, true);
    // quem atacou pode ter morrido na retaliação: a distância conta a partir de onde ele estava (ou do alvo)
    const ref = by.cell ?? start;
    const dist = (c: Cell) => Math.abs(c.c - ref.c) + Math.abs(c.r - ref.r);
    const cells: Cell[] = [];
    for (const [k, nd] of nodes) {
      if (!nd.canEnd || nd.prev === null || nd.portal) continue;
      const c = parseKey(k);
      if (this.cellLoad(c) >= 2) continue;
      cells.push(c);
    }
    if (!cells.length) return;
    // quem atacou escolhe o Espaço (como se movesse o alvo); automático: o mais longe de quem atacou
    const pick = by.guild && this.choiceHook ? this.choiceHook({ choice: 'push', guild: by.guild, heroId: by.id, source, targetId: t.id, cells }) : 'auto';
    let best: Cell | null = null;
    if (pick === 'auto') {
      for (const c of cells) if (!best || dist(c) > dist(best)) best = c;
      if (best && dist(best) <= dist(start)) best = null;
    } else best = cells[pick] ?? null;
    if (!best) return;
    for (const st of this.pathTo(nodes, best)) {
      const from = t.cell!;
      t.cell = { ...st.cell };
      this.emit({ t: 'move', id: t.id, from, to: st.cell, push: true });
    }
    this.log(`${source}: ${this.name(t)} é empurrado.`);
    if (t.kind === 'hero' && t.alive) { this.triggerMines(t); this.pickupAfterCombat(); }
  }

  /** Pergunta sim/não a quem controla o Herói (Mestre Espadachim, Sorte de Apostador…). `auto`: a resposta da IA. */
  private confirm(h: Unit, source: string, text: string, auto: boolean, faces?: DieFace[], labels?: { yes: string; no: string; keep?: boolean }): boolean {
    if (!h.guild || !this.choiceHook) return auto;
    const i = this.choiceHook({ choice: 'confirm', guild: h.guild, heroId: h.id, source, text, ...(faces ? { faces: faces.slice() } : {}), ...(labels ?? {}) });
    return i === 'auto' ? auto : i === 0;
  }

  /** Efeito Borboleta: escolhe um Herói Perto com carta de Ataque pronta e exausta a dele. true = trocou. */
  private butterfly(h: Unit): boolean {
    if (!h.cell) return false;
    const best = (u: Unit) => u.cards.filter(c => !c.exhausted && this.isAttackCard(c)).sort((p, q) => this.cardDef(q).dice - this.cardDef(p).dice)[0];
    const near = this.onBoard().filter(u => u.kind === 'hero' && u.id !== h.id && this.board.isClose(u.cell!, h.cell!) && best(u));
    if (!near.length) return false;
    let pick: Unit | null | undefined;
    const i = this.choiceHook && h.guild ? this.choiceHook({ choice: 'extra', guild: h.guild, heroId: h.id, source: 'Efeito Borboleta', units: near.map(u => u.id),
      text: 'Exaustar a carta de Ataque de qual Herói Perto no lugar da sua?' }) : 'auto';
    if (i === 'auto') pick = near.filter(u => u.guild !== h.guild).sort((p, q) => this.cardDef(best(q)!).dice - this.cardDef(best(p)!).dice)[0] ?? null;
    else pick = near[i] ?? null;
    if (!pick) return false;
    const c = best(pick)!;
    c.exhausted = true;
    this.emit({ t: 'skill', id: h.id, skill: 'efeito_borboleta', name: 'Efeito Borboleta' });
    this.log(`Efeito Borboleta: ${this.cardDef(c).name} de ${this.name(pick)} é exaustada no lugar da carta de ${this.name(h)}.`);
    return true;
  }

  /** Espaços Perto de `c` (e ele mesmo) onde `u` pode ser colocado. */
  private placeCells(u: Unit, c: Cell): Cell[] {
    return [c, ...this.board.neighbors(c).filter(nb => this.board.isClose(c, nb))]
      .filter(x => this.board.playable(x) && !sameCell(x, u.cell) && this.cellLoad(x, u) + this.weight(u) <= 2 && this.status(u, x) !== 'blocked');
  }

  /** Coloca um personagem num Espaço (sem Movimento: não aciona Reações). */
  private place(u: Unit, cell: Cell) {
    const from = u.cell!;
    u.cell = { ...cell };
    this.emit({ t: 'move', id: u.id, from, to: { ...cell }, portal: true });
    if (u.kind === 'hero') { this.triggerMines(u); this.pickup(u); this.checkEscort(u); this.checkHideout(u); }
  }

  /** Zás-Trás (Bob): um Herói da Guilda é colocado Perto do alvo. */
  private zasTras(h: Unit, at: Cell) {
    if (!this.choiceHook || !h.guild) return; // a IA não usa
    const allies = this.heroesOf(h.guild).filter(x => x.alive && x.cell && this.placeCells(x, at).length);
    if (!allies.length) return;
    const i = this.choiceHook({ choice: 'extra', guild: h.guild, heroId: h.id, source: 'Zás-Trás', units: allies.map(u => u.id), text: 'Você rolou ✷: qual Herói da sua Guilda vai para Perto do alvo?' });
    const ally = i === 'auto' ? null : allies[i];
    if (!ally) return;
    const cells = this.placeCells(ally, at);
    const j = this.choiceHook({ choice: 'push', guild: h.guild, heroId: h.id, source: 'Zás-Trás', targetId: ally.id, cells, text: `Escolha onde ${HEROES[ally.defId].name} aparece.` });
    const cell = j === 'auto' ? null : cells[j];
    if (!cell) return;
    this.emit({ t: 'skill', id: h.id, skill: 'zas_tras', name: 'Zás-Trás' });
    this.place(ally, cell);
    this.log(`Zás-Trás: ${this.name(ally)} aparece perto do alvo.`);
  }

  /** Trapaceiro (Monkey King): depois de rolar ✷ na Defesa, pode ir para um Espaço Perto. */
  private tricksterHop(t: Unit, by: Unit) {
    if (!t.cell || this.s.activation?.heroId === t.id) return;
    const cells = this.placeCells(t, t.cell).filter(c => !sameCell(c, t.cell));
    if (!cells.length) return;
    const pick = this.choiceHook && t.guild ? this.choiceHook({ choice: 'push', guild: t.guild, heroId: t.id, source: 'Trapaceiro', targetId: t.id, cells,
      text: `${HEROES[t.defId].name} rolou ✷ na Defesa: pode ir para um Espaço Perto.` }) : 'auto';
    let cell: Cell | null = null;
    if (pick === 'auto') {
      // IA: sai de perto de quem atacou, se der
      if (by.cell && this.board.isClose(by.cell, t.cell)) cell = cells.find(c => !this.board.isClose(by.cell!, c) && !this.monstersCloseTo(c).length) ?? null;
    } else cell = cells[pick] ?? null;
    if (!cell) return;
    this.emit({ t: 'skill', id: t.id, skill: 'trapaceiro', name: 'Trapaceiro' });
    this.place(t, cell);
    this.log(`Trapaceiro: ${this.name(t)} pula para outro Espaço.`);
  }

  /** Doces ou Travessuras (Queen of Beggars): ao terminar o Movimento Perto de um Herói Inimigo, ele dá um marcador ou sofre 1 Ferimento. */
  private trickOrTreat(h: Unit) {
    if (this.ab(h) !== 'doces_travessuras' || this.s.beggarUsed || !h.cell) return;
    const foes = this.enemiesClose(h).filter(u => u.kind === 'hero');
    if (!foes.length) return;
    const give = (u: Unit) => u.tokens.filter(t => t.type !== 'missao').sort((p, q) => (p.value ?? 1) - (q.value ?? 1))[0];
    const victim = foes.find(u => give(u)) ?? foes.sort((p, q) => this.killScore(p) - this.killScore(q))[0];
    this.s.beggarUsed = true;
    this.emit({ t: 'skill', id: h.id, skill: 'doces_travessuras', name: 'Doces ou Travessuras' });
    const tok = give(victim);
    if (tok) {
      victim.tokens.splice(victim.tokens.indexOf(tok), 1);
      tok.faceUp = true;
      h.tokens.push(tok);
      this.emit({ t: 'pickup', heroId: h.id, token: tok });
      this.log(`Doces ou Travessuras: ${this.name(victim)} dá ${TOKEN_INFO[tok.type].name} para ${this.name(h)}.`);
    } else {
      this.log(`Doces ou Travessuras: ${this.name(victim)} não tem marcador e sofre 1 Ferimento.`);
      this.damageHero(victim, 1, { kind: 'hero', id: h.id });
    }
  }

  // =========================================================================
  // Habilidades usadas como ação (Heróis extras): Ataque Mental, Teleporte, Chamado, Macaco Vê, Relâmpago
  // =========================================================================
  heroPower(h: Unit): { label: string; ok: boolean; why?: string; pick?: 'enemy' | 'hero' | 'cell' } | null {
    const ab = this.ab(h);
    if (!h || h.kind !== 'hero' || !['ataque_mental', 'teleporte', 'chamado', 'macaco_ve', 'relampago'].includes(ab ?? '')) return null;
    const a = this.s.activation;
    const active = this.canAct() && h.guild === this.currentGuild().id && a?.heroId === h.id && h.alive && !!h.cell;
    const no = (label: string, why: string) => ({ label, ok: false, why });
    const exhaust = ' (exausta o Herói até Descansar)';
    if (ab === 'ataque_mental') {
      const label = `Atordoar um Inimigo em Linha de Visão${exhaust}`;
      if (!active) return no(label, 'Só durante a ativação deste Herói');
      if (h.spent) return no(label, 'Herói já exausto');
      if (!this.powerTargets(h).length) return no(label, 'Nenhum Inimigo em Linha de Visão');
      return { label, ok: true, pick: 'enemy' };
    }
    if (ab === 'teleporte') {
      const label = `Ir para Perto de um Herói Aliado${exhaust}`;
      if (!active) return no(label, 'Só durante a ativação deste Herói');
      if (h.spent) return no(label, 'Herói já exausto');
      if (!this.powerCells(h).length) return no(label, 'Nenhum Aliado no tabuleiro');
      return { label, ok: true, pick: 'cell' };
    }
    if (ab === 'chamado') {
      const label = `Puxar um Herói em Linha de Visão para Perto${exhaust}`;
      if (!active) return no(label, 'Só durante a ativação deste Herói');
      if (h.spent) return no(label, 'Herói já exausto');
      if (!this.powerTargets(h).length) return no(label, 'Nenhum Herói em Linha de Visão');
      return { label, ok: true, pick: 'hero' };
    }
    if (ab === 'macaco_ve') {
      const label = 'Copiar a Habilidade de um Herói em Linha de Visão (até o fim do turno)';
      if (!active) return no(label, 'Só durante a ativação deste Herói');
      if (!this.powerTargets(h).length) return no(label, 'Nenhum Herói em Linha de Visão');
      return { label, ok: true, pick: 'hero' };
    }
    const label = 'Sofrer 1 Ferimento: 1 Ferimento em todos os Inimigos Perto';
    if (!active) return no(label, 'Só durante a ativação deste Herói');
    if (a!.powerUsed) return no(label, 'Já usado nesta ativação');
    if (h.wounds + 1 >= this.maxHp(h)) return no(label, 'O Herói morreria');
    if (!this.enemiesClose(h).length) return no(label, 'Nenhum Inimigo Perto');
    return { label, ok: true };
  }

  /** Alvos da habilidade: Inimigos (Ataque Mental) ou Heróis (Chamado, Macaco Vê) em Linha de Visão. */
  powerTargets(h: Unit): Unit[] {
    const ab = this.ab(h);
    if (!h.cell) return [];
    const los = (u: Unit) => u.alive && !!u.cell && u.id !== h.id && this.hasLOS(h, h.cell!, u.cell);
    if (ab === 'ataque_mental') return this.onBoard().filter(u => los(u) && this.isEnemy(h, u) && !u.stunned);
    if (ab === 'chamado') return this.onBoard().filter(u => u.kind === 'hero' && los(u) && !this.board.isClose(u.cell!, h.cell!) && this.placeCells(u, h.cell!).length);
    if (ab === 'macaco_ve') return this.onBoard().filter(u => u.kind === 'hero' && los(u) && u.curse !== 'amnesia' && HEROES[u.defId].ability !== 'macaco_ve');
    return [];
  }

  /** Espaços da habilidade: Teleporte (Perto de um Aliado) ou Chamado (Perto de quem chama, para `target`). */
  powerCells(h: Unit, target?: string): Cell[] {
    const ab = this.ab(h);
    if (!h.cell) return [];
    if (ab === 'teleporte') {
      const out: Cell[] = [];
      for (const x of this.heroesOf(h.guild!)) if (x.id !== h.id && x.alive && x.cell) for (const c of this.placeCells(h, x.cell)) if (!out.some(o => sameCell(o, c))) out.push(c);
      return out;
    }
    if (ab === 'chamado' && target) return this.placeCells(this.unit(target), h.cell);
    return [];
  }

  usePower(heroId: string, target?: string, cell?: Cell): boolean {
    const h = this.unit(heroId);
    if (!h || h.guild !== this.currentGuild().id) return false;
    const info = this.heroPower(h);
    if (!info?.ok) return false;
    const a = this.s.activation!;
    const ab = this.ab(h)!;
    const name = HEROES[h.defId].abilityName;
    if (ab === 'ataque_mental') {
      const t = this.powerTargets(h).find(u => u.id === target);
      if (!t) return false;
      h.spent = true;
      a.committed = true;
      this.emit({ t: 'skill', id: h.id, skill: ab, name });
      this.setStun(t, true);
      this.log(`${name}: ${this.name(t)} fica Atordoado.`);
      return true;
    }
    if (ab === 'teleporte') {
      if (!cell || !this.powerCells(h).some(c => sameCell(c, cell))) return false;
      h.spent = true;
      a.committed = true;
      this.emit({ t: 'skill', id: h.id, skill: ab, name });
      this.place(h, cell);
      this.log(`${name}: ${this.name(h)} aparece perto de um Aliado.`);
      this.checkActiveDeath();
      return true;
    }
    if (ab === 'chamado') {
      const t = this.powerTargets(h).find(u => u.id === target);
      if (!t || !cell || !this.powerCells(h, t.id).some(c => sameCell(c, cell))) return false;
      h.spent = true;
      a.committed = true;
      this.emit({ t: 'skill', id: h.id, skill: ab, name });
      this.place(t, cell);
      this.log(`${name}: ${this.name(h)} puxa ${this.name(t)} para perto.`);
      return true;
    }
    if (ab === 'macaco_ve') {
      const t = this.powerTargets(h).find(u => u.id === target);
      if (!t) return false;
      a.committed = true;
      this.s.copied = { heroId: h.id, ability: HEROES[t.defId].ability };
      this.emit({ t: 'skill', id: h.id, skill: ab, name });
      this.log(`${name}: ${this.name(h)} copia ${HEROES[t.defId].abilityName} de ${this.name(t)} até o fim do turno.`);
      return true;
    }
    if (ab === 'relampago') {
      a.powerUsed = true;
      a.committed = true;
      const near = this.enemiesClose(h);
      this.emit({ t: 'skill', id: h.id, skill: ab, name });
      this.damageHero(h, 1, { kind: 'trap' });
      this.log(`${name}: ${this.name(h)} sofre 1 Ferimento e causa 1 em ${near.map(x => this.name(x)).join(', ')}.`);
      for (const x of near) this.hurt(x, 1, h);
      this.checkActiveDeath();
      return true;
    }
    return false;
  }

  /** Enxame da Morte: até N Monstros do Cemitério voltam ao tabuleiro perto de Heróis Inimigos. */
  private swarm(h: Unit, n: number) {
    // só Monstros (Heróis banidos continuam no Tabuleiro de Entrada)
    const ids = this.s.entryBoard.filter(x => this.unit(x).kind === 'monster').slice(0, n);
    this.s.entryBoard = this.s.entryBoard.filter(x => !ids.includes(x));
    if (!ids.length) return;
    const foes = this.onBoard().filter(u => u.kind === 'hero' && u.guild !== h.guild);
    const spots = foes.flatMap(f => [f.cell!, ...this.board.neighbors(f.cell!).filter(c => this.board.isClose(c, f.cell!))]);
    const pool = spots.length ? spots : this.s.entryMarkers.map(e => e.cell);
    this.emit({ t: 'skill', id: h.id, skill: 'enxame', name: 'Enxame da Morte' });
    for (const id of ids) {
      const m = this.unit(id);
      const cell = pool.find(c => this.board.playable(c) && this.cellLoad(c) < 2);
      if (!cell) { this.s.entryBoard.push(id); continue; }
      m.alive = true;
      m.wounds = 0;
      m.cell = { ...cell };
      this.emit({ t: 'spawn', id: m.id, cell });
      this.log(`Enxame da Morte: ${MONSTERS[m.defId].name} volta do Cemitério.`);
    }
  }

  /** Carta ativável (ícone ⚡): o que faz e se pode ser usada agora. */
  activatable(h: Unit, c: CardInst): { label: string; ok: boolean; why?: string; pick?: 'ally' | 'dead' | 'cell'; armed?: boolean; toggle?: boolean } | null {
    const fx = this.cardDef(c).fx;
    const a = this.s.activation;
    const myTurn = this.canAct() && !this.s.pending && h.guild === this.currentGuild().id;
    const usedAct = !!a?.used?.includes(c.uid);
    const fresh = !!a && a.heroId === h.id && !a.moved && !a.attacked && a.mp >= this.startMp(h);
    const no = (label: string, why: string) => ({ label, ok: false, why });
    if (fx.apocalypse) {
      const label = 'Apocalipse: 1 Ferimento em todos os Inimigos Perto';
      if (!myTurn || !fresh) return no(label, 'Só no início da ativação deste Herói');
      if (usedAct) return no(label, 'Já usado nesta ativação');
      if (!this.enemiesClose(h).length) return no(label, 'Nenhum Inimigo Perto');
      return { label, ok: true };
    }
    if (fx.celerity) {
      const label = 'Sofrer 1 Ferimento para restaurar todas as cartas';
      if (!myTurn || a?.heroId !== h.id) return no(label, 'Só com este Herói ativado');
      if (usedAct) return no(label, 'Já usado nesta ativação');
      if (h.wounds + 1 >= this.maxHp(h)) return no(label, 'O Herói morreria');
      if (!h.cards.some(x => x.exhausted)) return no(label, 'Nenhuma carta exaustada');
      return { label, ok: true };
    }
    if (fx.soulShield) {
      const label = 'Exaustar este Herói para ressuscitar um Aliado (na Área Inicial ou Perto de um Aliado)';
      if (!myTurn) return no(label, 'Só no seu turno');
      if (!h.alive || h.spent) return no(label, h.spent ? 'Herói já exausto' : 'Herói morto');
      if (!this.heroesOf(h.guild!).some(x => !x.alive)) return no(label, 'Nenhum Aliado morto');
      // a qualquer hora do seu turno; o Espaço é escolhido como no Descanso
      if (!this.heroesOf(h.guild!).some(x => !x.alive && this.resurrectCells(x).length)) return no(label, 'Sem Espaço livre para ressuscitar');
      return { label, ok: true, pick: 'dead' };
    }
    if (fx.swapAlly) {
      const label = 'Trocar de lugar com um Aliado';
      if (!myTurn) return no(label, 'Só no seu turno');
      if ((this.s.turnUsed ?? []).includes(c.uid)) return no(label, 'Já usado neste turno');
      const started = (this.s.activatedThisTurn ?? []).length > 1 || (a && (a.moved || a.attacked || a.mp < 3));
      if (started) return no(label, 'Só no início do turno');
      if (!h.alive || !h.cell) return no(label, 'Herói fora do tabuleiro');
      if (!this.heroesOf(h.guild!).some(x => x.id !== h.id && x.alive && x.cell)) return no(label, 'Nenhum Aliado no tabuleiro');
      return { label, ok: true, pick: 'ally' };
    }
    if (fx.bootMove) {
      // dá para usar aos poucos (ex.: Die Booten: 1 passo, depois outro)
      const left = a?.bootLeft?.[c.uid];
      const n = left ?? fx.bootMove;
      const label = `Mover este Herói ${n} Espaço${n > 1 ? 's' : ''}${left !== undefined ? ' (o que sobrou)' : ''}`;
      if (!myTurn || !a) return no(label, 'Ative outro Herói primeiro');
      if (a.heroId === h.id) return no(label, 'Funciona quando outro Herói está ativado');
      if (usedAct || left === 0) return no(label, 'Já usado nesta ativação');
      if (left !== undefined) {
        // continuação: vale enquanto o Herói ativado ainda não andou nem atacou
        if (a.moved || a.attacked) return no(label, 'Só logo ao ativar outro Herói');
        if (!h.alive || !h.cell) return no(label, 'Herói fora do tabuleiro');
        return { label, ok: true, pick: 'cell' };
      }
      // "Quando você ativa um Herói diferente": só logo ao ativar, antes de o Herói ativado mover ou atacar
      if (a.moved || a.attacked || a.mp < this.startMp(this.unit(a.heroId)) || a.committed) return no(label, 'Só logo ao ativar outro Herói');
      if (!h.alive || !h.cell) return no(label, 'Herói fora do tabuleiro');
      return { label, ok: true, pick: 'cell' };
    }
    if (fx.kingShield || fx.knightShield) {
      const label = fx.kingShield ? `+${fx.kingShield} dados numa Defesa (exausta o Herói)` : 'Obriga a rolar de novo um ataque contra você (exausta o Herói)';
      return no(label, 'Aparece na tela de combate quando este Herói for atacado');
    }
    return null;
  }

  /** Espaços para onde o Herói das Botas pode ir agora. */
  bootCells(h: Unit, c: CardInst): Cell[] {
    const n = this.s.activation?.bootLeft?.[c.uid] ?? this.cardDef(c).fx.bootMove ?? 0;
    if (!n || !h.cell) return [];
    return [...this.reachable(h, n, h.cell, false, true)].filter(([, nd]) => nd.canEnd && nd.prev !== null).map(([k]) => parseKey(k));
  }

  /** Usa uma carta ativável. `target`: Aliado (troca/ressurreição); `cell`: destino (Botas). */
  useCard(holderId: string, cardUid: string, target?: string, cell?: Cell): boolean {
    const h = this.unit(holderId);
    if (!h || h.kind !== 'hero' || h.guild !== this.currentGuild().id) return false;
    const c = h.cards.find(x => x.uid === cardUid);
    if (!c) return false;
    const info = this.activatable(h, c);
    if (!info?.ok) return false;
    const fx = this.cardDef(c).fx;
    const a = this.s.activation;
    const markAct = () => { if (a) a.used = [...(a.used ?? []), c.uid]; };
    const name = this.cardDef(c).name;
    if (fx.kingShield || fx.knightShield) {
      c.armed = !c.armed;
      this.log(`${name} de ${this.name(h)} ${c.armed ? 'armado' : 'desarmado'}.`);
      return true;
    }
    if (fx.apocalypse) {
      markAct();
      this.emit({ t: 'skill', id: h.id, skill: 'apocalipse', name: 'Apocalipse' });
      const near = this.enemiesClose(h);
      this.log(`Apocalipse: 1 Ferimento em ${near.map(x => this.name(x)).join(', ')}.`);
      for (const x of near) this.hurt(x, 1, h);
      this.checkActiveDeath();
      return true;
    }
    if (fx.celerity) {
      markAct();
      this.emit({ t: 'skill', id: h.id, skill: 'celeridade', name: 'Bastão da Celeridade' });
      this.damageHero(h, 1, { kind: 'trap' });
      for (const x of h.cards) { x.exhausted = false; x.uses = 0; }
      this.log(`Bastão da Celeridade: ${this.name(h)} sofre 1 Ferimento e restaura todas as cartas.`);
      return true;
    }
    if (fx.soulShield) {
      const dead = this.heroesOf(h.guild!).filter(x => !x.alive);
      const who = dead.find(x => x.id === target) ?? dead[0];
      if (!who) return false;
      // como no Descanso: na Área Inicial ou Perto de um Aliado que já está no tabuleiro (o jogador escolhe o Espaço)
      const cells = this.resurrectCells(who);
      if (!cells.length || (cell && !cells.some(x => sameCell(x, cell)))) return false;
      h.spent = true;
      this.emit({ t: 'skill', id: h.id, skill: 'escudo_almas', name: 'Escudo das Almas' });
      this.resurrect(who, cell);
      this.log(`Escudo das Almas: ${this.name(h)} fica exausto (não usa o Escudo de novo até Descansar) e ${this.name(who)} volta à vida.`);
      return true;
    }
    if (fx.swapAlly) {
      const ally = this.unit(target ?? '');
      if (!ally || ally.guild !== h.guild || ally.id === h.id || !ally.alive || !ally.cell || !h.cell) return false;
      this.s.turnUsed = [...(this.s.turnUsed ?? []), c.uid];
      const ca = { ...h.cell }, cb = { ...ally.cell };
      h.cell = cb;
      ally.cell = ca;
      this.emit({ t: 'move', id: h.id, from: ca, to: cb, portal: true });
      this.emit({ t: 'move', id: ally.id, from: cb, to: ca, portal: true });
      this.log(`Manto do Deslocamento: ${this.name(h)} troca de lugar com ${this.name(ally)}.`);
      for (const u of [h, ally]) { this.pickup(u); this.checkEscort(u); }
      this.checkActiveDeath();
      return true;
    }
    if (fx.bootMove) {
      if (!cell || !h.cell) return false;
      // as Botas não passam por portal (teletransporte); dá para usar aos poucos (o que sobra fica para depois)
      const left = a?.bootLeft?.[c.uid] ?? fx.bootMove;
      if (left <= 0) return false;
      const nodes = this.reachable(h, left, h.cell, false, true);
      const nd = nodes.get(key(cell));
      if (!nd || !nd.canEnd || nd.prev === null) return false;
      const rest = Math.max(0, left - Math.ceil(nd.mp));
      if (a) a.bootLeft = { ...(a.bootLeft ?? {}), [c.uid]: rest };
      if (rest === 0) markAct();
      // usou as Botas: não dá mais para trocar de Herói, e o Herói das Botas não pode ser ativado neste turno
      if (this.s.activation) this.s.activation.committed = true;
      if (!(this.s.activatedThisTurn ?? []).includes(h.id)) this.s.activatedThisTurn = [...(this.s.activatedThisTurn ?? []), h.id];
      if (!(this.s.booted ?? []).includes(h.id)) this.s.booted = [...(this.s.booted ?? []), h.id];
      for (const st of this.pathTo(nodes, cell)) {
        if (!h.alive || !h.cell) break;
        const from = h.cell!;
        // o movimento das Botas não aciona Reação de Alerta
        h.cell = { ...st.cell };
        this.emit({ t: 'move', id: h.id, from, to: st.cell, portal: st.portal });
        this.bloodCrown(h, from);
        if (!h.alive) break;
        // o movimento das Botas não pega itens nem marcadores do chão (eles ficam até o Herói ser ativado ou andar)
        this.triggerMines(h);
        this.checkEscort(h);
      }
      if (h.alive) this.assassinCloak(h);
      this.log(`${name}: ${this.name(h)} se move.`);
      return true;
    }
    return false;
  }

  /** Valida uma reorganização de Descanso. Retorna mensagem de erro ou null. */
  validateRest(g: GuildId, o: RestOptions): string | null {
    const heroes = this.heroesOf(g);
    if (o.cards) {
      // a carta debaixo da Maldição também entra na reorganização (depois o jogador escolhe de novo onde a Maldição fica)
      const pool = [...heroes.flatMap(h => [...h.cards, ...(h.covered ? [h.covered] : [])]), ...(this.s.spare?.[g] ?? [])];
      const given = Object.values(o.cards).flat();
      if (new Set(given).size !== given.length || given.some(uid => !pool.some(c => c.uid === uid))) return 'Cartas inválidas.';
      for (const h of heroes) {
        const cards = (o.cards[h.id] ?? []).map(uid => pool.find(c => c.uid === uid)!);
        const sl = this.slotsUsed(h, cards);
        // Maldição que ocupa espaço: ela fica em cima de uma das cartas (que fica indisponível), então cabe +1
        const over = h.curse && CURSES[h.curse]?.slot && cards.length ? 1 : 0;
        if (sl.used > sl.max + over) return `${HEROES[h.defId].name}: ${sl.used - over} cartas para ${sl.max} espaços.`;
        if (cards.filter(c => this.cardDef(c).fx.armor).length > 1) return `${HEROES[h.defId].name}: só 1 armadura por Herói.`;
      }
    }
    if (o.tokens) {
      const movable = heroes.flatMap(h => h.tokens.filter(t => t.type !== 'missao').map(t => t.id)).sort();
      const given = Object.values(o.tokens).flat().sort();
      if (JSON.stringify(movable) !== JSON.stringify(given)) return 'Marcadores inválidos (marcadores de Missão não podem ser movidos).';
      // p.18: os marcadores passam entre quaisquer Heróis — o morto também, porque ressuscita neste mesmo Descanso
      for (const h of heroes) if (!h.alive && (o.tokens[h.id] ?? []).length && !this.resurrectCells(h).length) return 'Este Herói morto não tem onde ressuscitar: não pode receber marcadores.';
      for (const h of heroes) if (!h.alive && (o.tokens[h.id] ?? []).length && o.stayDead?.includes(h.id)) return `${HEROES[h.defId].name} não vai ressuscitar: não pode receber marcadores.`;
    }
    if (o.resurrect) {
      const count = new Map<string, number>();
      for (const [id, c] of Object.entries(o.resurrect)) {
        const h = this.unit(id);
        if (!h || h.guild !== g || h.alive) return 'Ressurreição inválida.';
        if (!this.resurrectCells(h).some(x => sameCell(x, c))) return `${HEROES[h.defId].name} não pode ressuscitar nesse Espaço.`;
        const k = key(c);
        count.set(k, (count.get(k) ?? 0) + 1);
        if (this.cellLoad(c) + count.get(k)! > 2) return 'Máximo de 2 personagens por Espaço.';
      }
    }
    return null;
  }

  /** Descansar (p.18): restaura cartas, recupera atordoados, reorganiza itens e marcadores e ressuscita os mortos. */
  rest(o: RestOptions = {}): boolean {
    if (!this.canAct()) return false;
    if (!this.canRest()) return false;
    const g = this.currentGuild();
    if (this.validateRest(g.id, o)) return false;
    const heroes = this.heroesOf(g.id);
    this.s.activation = null;
    this.emit({ t: 'rest', guild: g.id });
    if (o.cards) {
      const pool = [...heroes.flatMap(h => [...h.cards, ...(h.covered ? [h.covered] : [])]), ...(this.s.spare?.[g.id] ?? [])];
      const before = new Map(heroes.map(h => [h.id, h.covered?.uid]));
      for (const h of heroes) { h.cards = (o.cards[h.id] ?? []).map(uid => pool.find(c => c.uid === uid)!); h.covered = undefined; }
      // Maldição que ocupa espaço com o inventário cheio: ela fica no 1º espaço — a 1ª carta (na ordem que o jogador arrumou) fica debaixo dela
      void before;
      for (const h of heroes) {
        if (!h.curse || !CURSES[h.curse]?.slot) continue;
        const sl = this.slotsUsed(h);
        if (sl.used <= sl.max || !h.cards.length) continue;
        h.covered = h.cards.shift();
      }
      // o que não foi equipado continua com as cartas sem Herói
      const used = new Set(Object.values(o.cards).flat());
      (this.s.spare ??= {})[g.id] = pool.filter(c => !used.has(c.uid));
    }
    if (o.tokens) {
      const pool = heroes.flatMap(h => h.tokens.filter(t => t.type !== 'missao'));
      for (const h of heroes) h.tokens = [...h.tokens.filter(t => t.type === 'missao'), ...(o.tokens[h.id] ?? []).map(id => pool.find(t => t.id === id)!)];
    }
    for (const h of heroes) {
      for (const c of h.cards) { c.exhausted = false; c.uses = 0; }
      if (h.alive && h.stunned) this.setStun(h, false);
      h.spent = false;
      h.petrified = 0;
      if (!h.alive) { if (!o.stayDead?.includes(h.id)) this.resurrect(h, o.resurrect?.[h.id]); else this.log(`${this.name(h)} continua morto (não ressuscitou neste Descanso).`); }
      else if (h.banished) { this.s.entryBoard = this.s.entryBoard.filter(x => x !== h.id); this.resurrect(h, o.resurrect?.[h.id], true); this.log(`${this.name(h)} volta do Tabuleiro de Entrada.`); }
      // Hora do Lanche (Pigsy): cura todos os Ferimentos
      if (h.alive && h.wounds && this.ab(h) === 'hora_lanche') {
        const x = h.wounds;
        h.wounds = 0;
        this.emit({ t: 'skill', id: h.id, skill: 'hora_lanche', name: 'Hora do Lanche' });
        this.emit({ t: 'heal', id: h.id, amount: x, wounds: 0 });
      }
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
    return cells.filter(c => { const k = key(c); if (seen.has(k)) return false; seen.add(k); return this.board.playable(c) && this.cellLoad(c) < 2; });
  }

  private resurrect(h: Unit, want?: Cell, keepWounds = false) {
    const cells = this.resurrectCells(h);
    const area = this.map.startAreas[this.guild(h.guild!).startArea];
    const c = (want && cells.find(x => sameCell(x, want))) ?? cells.find(x => area.some(a => sameCell(a, x))) ?? cells[0];
    if (!c) return;
    h.alive = true;
    h.banished = false;
    if (!keepWounds) h.wounds = 0;
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
    const usable = t.type === 'cura' || t.type === 'revigorante' || (t.type === 'turno' && !this.s.extraTurn && !this.s.extraTurnOn);
    if (usable) this.emit({ t: 'useToken', heroId: h.id, token: { ...t } }); // mostrado antes do efeito
    if (t.type === 'cura') {
      // Poção de Cura (p.25): remove todos os Ferimentos e também a carta de Maldição Mortal
      if (h.curse) {
        this.log(`${this.name(h)} se livrou da Maldição ${CURSES[h.curse]?.name ?? ''}.`);
        h.curse = undefined;
        if (h.covered) { h.cards.push(h.covered); this.log(`${this.cardDef(h.covered).name} volta a ficar disponível.`); h.covered = undefined; }
      }
      const amount = h.wounds;
      h.wounds = 0;
      this.emit({ t: 'heal', id: h.id, amount, wounds: 0 });
    } else if (t.type === 'revigorante') {
      for (const c of h.cards) { c.exhausted = false; c.uses = 0; }
      this.log(`${this.name(h)} restaurou todas as suas cartas.`);
    } else if (t.type === 'turno') {
      if (this.s.extraTurn || this.s.extraTurnOn) return false;
      // começa na hora um turno adicional da mesma Guilda: o Herói ativado não joga nele; ative outro
      // (não passa a vez: a Entrada de Monstros só acontece quando a vez for do próximo jogador)
      this.s.extraTurnOn = true;
      this.s.extraHero = h.id;
      this.s.activation = null;
      this.s.activatedThisTurn = [];
      this.s.booted = []; this.s.stealthUsed = [];
      this.s.blessing = null;
      this.s.warCry = null;
      this.s.extraOnly = false;
      this.s.booted = []; this.s.stealthUsed = [];
      this.s.turnUsed = [];
      this.clearTurnFx();
      h.tokens.splice(i, 1);
      this.log(`Usou ${TOKEN_INFO[t.type].name}: turno adicional! ${this.name(h)} não joga nele — ative outro Herói.`);
      this.emit({ t: 'turn', guild: this.currentGuild().id, turn: this.s.turn });
      return true;
    } else return false;
    h.tokens.splice(i, 1);
    this.log(`Usou ${TOKEN_INFO[t.type].name}.`);
    return true;
  }

  endTurn(): boolean {
    if (!this.canAct()) return false;
    const a = this.s.activation;
    const prevHero = a ? this.unit(a.heroId) : null;
    if (prevHero?.guild) this.s.lastHero = { ...this.s.lastHero, [prevHero.guild]: prevHero.id };
    if (this.s.missions.some(x => x.rule === 'arena')) {
      const ids = new Set([...(this.s.activatedThisTurn ?? []), ...(prevHero ? [prevHero.id] : [])]);
      for (const id of ids) { const u = this.s.units[id]; if (u) this.arenaMark(u); }
    }
    if (this.s.winnerPending) { this.finish(this.s.winnerPending); return true; }
    this.s.activation = null;
    // Entrada de Monstros (p.23)
    if (this.s.entryBoard.length >= 5 || this.monstersOnBoard().length === 0) this.spawnMonsters();
    if (this.freeMode) {
      // Modo Livre: a vez não passa para o adversário
      this.emit({ t: 'turn', guild: this.currentGuild().id, turn: this.s.turn });
      return true;
    }
    if (this.s.extraTurn) {
      // Poção de Turno Adicional: um turno novo para OUTRO Herói da Guilda (o que usou a poção não joga) e sem Descanso
      this.s.extraTurn = false;
      this.s.extraTurnOn = true;
      if (!this.s.extraHero && prevHero) this.s.extraHero = prevHero.id;
      this.s.activatedThisTurn = [];
      this.s.blessing = null;
      this.s.warCry = null;
      this.s.extraOnly = false;
      this.s.booted = []; this.s.stealthUsed = [];
      this.s.turnUsed = [];
      this.clearTurnFx();
      this.log('Turno adicional! Ative outro Herói.');
      this.emit({ t: 'turn', guild: this.currentGuild().id, turn: this.s.turn });
      return true;
    }
    this.s.extraHero = null;
    this.s.extraTurnOn = false;
    this.s.current = (this.s.current + 1) % this.s.guildOrder.length;
    if (this.s.current === 0) this.s.turn++;
    this.s.activatedThisTurn = [];
    this.s.blessing = null;
    this.s.warCry = null;
    this.s.extraOnly = false;
    this.s.booted = []; this.s.stealthUsed = [];
    this.s.turnUsed = [];
    this.clearTurnFx();
    if (this.s.shroud?.length) this.s.shroud = this.s.shroud.filter(id => this.unit(id).guild !== this.currentGuild().id);
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

  // =========================================================================
  // Lápides (Beyond the Grave)
  // =========================================================================
  tombAt(c: Cell | null | undefined) { return c ? this.s.tombs?.find(t => sameCell(t.cell, c)) : undefined; }

  /** O Herói ativo pode revelar a Lápide do seu Espaço? (durante o Movimento, 1 PM) */
  canRevealTomb(): boolean {
    const a = this.s.activation;
    if (!this.canAct() || !a || a.moveLocked || a.mp < 1) return false;
    const h = this.unit(a.heroId);
    return !!h.alive && !!this.tombAt(h.cell);
  }

  /** Revela a Lápide: 1 PM, sem Reação de Alerta; o efeito acontece na hora. */
  revealTomb(): boolean {
    if (!this.canRevealTomb()) return false;
    const a = this.s.activation!;
    const h = this.unit(a.heroId);
    const t = this.tombAt(h.cell)!;
    this.s.tombs = this.s.tombs!.filter(x => x !== t);
    a.mp -= 1;
    a.moved = true;
    a.committed = true;
    const card = TOMB[t.card];
    this.emit({ t: 'tomb', heroId: h.id, name: card.name, text: card.text, good: card.good });
    this.log(`${this.name(h)} revelou a Lápide "${card.name}": ${card.text}`);
    this.tombEffect(h, card.effect, card.name);
    this.checkActiveDeath();
    this.applyFree();
    return true;
  }

  private tombEffect(h: Unit, effect: string, source: string) {
    const a = this.s.activation!;
    const los = (u: Unit) => !!u.cell && !!h.cell && this.hasLOS(h, h.cell, u.cell);
    const pickUnit = (units: Unit[], text: string, auto: (u: Unit) => number): Unit | null => {
      if (!units.length) return null;
      const i = this.choiceHook && h.guild && units.length > 1 ? this.choiceHook({ choice: 'extra', guild: h.guild, heroId: h.id, source, units: units.map(u => u.id), text }) : 'auto';
      if (i === 'auto') return units.slice().sort((p, q) => auto(q) - auto(p))[0];
      return units[i] ?? null;
    };
    switch (effect) {
      case 'tesouro': this.gainCoins(h.guild!, 2, 'Lápide: Tesouro Enterrado'); break;
      case 'pocao': {
        const tok = { id: `tp${Object.keys(this.s.units).length}-${this.s.turn}-${h.tokens.length}`, type: 'cura' as const, faceUp: true };
        h.tokens.push(tok);
        this.emit({ t: 'pickup', heroId: h.id, token: tok });
        break;
      }
      case 'cura': if (h.wounds) { const x = h.wounds; h.wounds = 0; this.emit({ t: 'heal', id: h.id, amount: x, wounds: 0 }); } break;
      case 'restaura': for (const c of h.cards) { c.exhausted = false; c.uses = 0; } break;
      case 'passos': a.mp += 2; a.moveLocked = false; break;
      case 'furia': a.bonusDice = (a.bonusDice ?? 0) + 2; break;
      case 'mortalha': this.s.shroud = [...new Set([...(this.s.shroud ?? []), h.id])]; break;
      case 'maldicao': this.damageHero(h, 1, { kind: 'trap' }); break;
      case 'mao': {
        const id = this.s.entryBoard.find(x => this.unit(x).kind === 'monster');
        if (!id || !h.cell) break;
        const mon = this.unit(id);
        const cell = [h.cell, ...this.board.neighbors(h.cell).filter(c => this.board.isClose(h.cell!, c))].find(c => this.cellLoad(c) + this.weight(mon) <= 2 && !sameCell(c, h.cell));
        if (!cell) break;
        this.s.entryBoard = this.s.entryBoard.filter(x => x !== id);
        mon.alive = true; mon.wounds = 0; mon.cell = { ...cell };
        this.emit({ t: 'spawn', id: mon.id, cell: { ...cell } });
        break;
      }
      case 'exorcismo': {
        const list = this.monstersOnBoard().filter(m => los(m) && !MONSTERS[m.defId].category.startsWith('Vilão') && !this.map.noBanish?.includes(baseId(m.defId)));
        const m = pickUnit(list, 'Exorcismo: qual Monstro vai para o Tabuleiro de Entrada?', u => -Math.abs(u.cell!.c - h.cell!.c) - Math.abs(u.cell!.r - h.cell!.r));
        if (m) this.banish(m, h);
        break;
      }
      case 'banir_heroi': {
        const list = this.onBoard().filter(u => u.kind === 'hero' && this.isEnemy(h, u) && los(u));
        const v = pickUnit(list, 'Portal do Além: qual Herói Inimigo vai para o Tabuleiro de Entrada?', u => u.tokens.filter(t => t.type === 'missao').length * 5 + this.guild(u.guild!).missions.length);
        if (v) this.banish(v, h);
        break;
      }
      case 'ativar_menor': case 'ativar_maior': case 'ativar_vilao': {
        const cat = effect === 'ativar_menor' ? 'Lacaio Menor' : effect === 'ativar_maior' ? 'Lacaio Maior' : 'Vilão Menor';
        const mons = this.puppetCandidates(cat);
        if (!mons.length) {
          this.log(`${source}: não há ${cat} no tabuleiro para ativar.`);
          this.emit({ t: 'notice', text: `🪦 ${source}: nenhum ${cat} para ativar`, color: '#b892ff' });
          break;
        }
        // jogador humano: ativa o Monstro como um Herói (escolhe, move e ataca pelo mapa)
        if (h.guild && this.guild(h.guild).controller === 'human') {
          this.s.puppet = { by: h.id, guild: h.guild, cat, source, monsterId: mons.length === 1 ? mons[0].id : null };
          break;
        }
        // o Monstro pode atacar qualquer Herói (até da própria Guilda): a IA escolhe um Inimigo que ele alcance
        const reach = (m: Unit) => this.heroesInReach(m).filter(x => this.isEnemy(h, x));
        const m = pickUnit(mons, `${source}: qual ${cat} você ativa?`, u => reach(u).length ? 10 - this.killScore(reach(u)[0]) : -99);
        if (!m) break;
        const targets = this.heroesInReach(m);
        if (!targets.length) { this.log(`${this.name(m)} não alcança nenhum Herói.`); break; }
        const foes = targets.filter(x => this.isEnemy(h, x));
        const t = pickUnit(targets, `${source}: ${this.name(m)} ataca quem?`, u => (this.isEnemy(h, u) ? 10 : -10) - this.killScore(u) + (foes.includes(u) ? 0 : 0));
        if (t) this.puppet(m, t);
        break;
      }
    }
  }

  /** Monstros desta categoria que a Lápide pode ativar. */
  puppetCandidates(cat: string): Unit[] {
    return this.monstersOnBoard().filter(m => MONSTERS[m.defId].category === cat && !MONSTERS[m.defId].abilities?.includes('object'));
  }

  /** Lápide: o jogador escolhe qual Monstro ativar. */
  puppetPick(monsterId: string): boolean {
    const p = this.s.puppet;
    if (!p || !this.puppetCandidates(p.cat).some(m => m.id === monsterId)) return false;
    p.monsterId = monsterId;
    return true;
  }

  /** Para onde o Monstro ativado pela Lápide pode ir e quem ele ataca de cada Espaço (qualquer Herói). */
  puppetOptions(): { reach: Map<string, PathNode>; targets: Map<string, string[]> } | null {
    const p = this.s.puppet;
    if (!p?.monsterId) return null;
    const m = this.unit(p.monsterId);
    if (!m.alive || !m.cell) return null;
    const reach = this.reachable(m, this.monMove(m));
    const heroes = this.onBoard().filter(u => u.kind === 'hero');
    const targets = new Map<string, string[]>();
    targets.set(key(m.cell), heroes.filter(u => this.monsterCanAttack(m, u)).map(u => u.id));
    for (const [k, n] of reach) if (n.canEnd) targets.set(k, heroes.filter(u => this.monsterCanAttack(m, u, n.cell)).map(u => u.id));
    return { reach, targets };
  }

  /** Lápide: o Monstro escolhido se move (opcional) e ataca um Herói (opcional). As mortes são crédito do jogo. */
  puppetAct(dest: Cell | null, targetId: string | null): boolean {
    const p = this.s.puppet;
    const o = this.puppetOptions();
    if (!p || !o) return false;
    const m = this.unit(p.monsterId!);
    const at = dest && !sameCell(dest, m.cell) ? dest : m.cell!;
    if (dest && !sameCell(dest, m.cell) && !o.reach.get(key(dest))?.canEnd) return false;
    if (targetId && !(o.targets.get(key(at)) ?? []).includes(targetId)) return false;
    this.s.puppet = null;
    if (!sameCell(at, m.cell)) this.walkMonster(m, o.reach, at);
    const t = targetId ? this.unit(targetId) : null;
    if (t && m.alive && t.alive && this.monsterCanAttack(m, t)) this.monsterAttack(m, t, 'lapide');
    else this.log(`${this.name(m)} ${sameCell(at, dest ?? at) && dest ? 'se moveu e ' : ''}não atacou.`);
    this.checkActiveDeath();
    this.applyFree();
    return true;
  }

  /** Lápide: o jogador desiste de ativar o Monstro. */
  puppetSkip(): boolean {
    if (!this.s.puppet) return false;
    this.log(`${this.s.puppet.source}: nenhum Monstro foi ativado.`);
    this.s.puppet = null;
    return true;
  }

  /** Heróis que o Monstro consegue atacar depois de se mover. */
  heroesInReach(m: Unit): Unit[] {
    if (!m.cell) return [];
    const nodes = this.reachable(m, this.monMove(m));
    return this.onBoard().filter(u => u.kind === 'hero' && [...nodes.values()].some(n => n.canEnd && this.monsterCanAttack(m, u, n.cell)));
  }

  /** Monstro ativado por um jogador (Lápide): move até poder atacar e ataca o alvo. As mortes são crédito do jogo. */
  private puppet(m: Unit, t: Unit) {
    if (!this.monsterCanAttack(m, t)) {
      const nodes = this.reachable(m, this.monMove(m));
      let best: PathNode | null = null;
      for (const n of nodes.values()) if (n.canEnd && n.prev !== null && this.monsterCanAttack(m, t, n.cell) && (!best || n.cost < best.cost)) best = n;
      if (!best) return;
      this.walkMonster(m, nodes, best.cell);
    }
    if (m.alive && t.alive) this.monsterAttack(m, t, 'lapide');
  }

  /** Efeitos que duram até o fim do turno (Heróis extras). */
  private clearTurnFx() {
    this.s.brightMind = null;
    this.s.copied = null;
    this.s.clawed = [];
    this.s.beggarUsed = false;
  }

  /** Devorar (Nibbles): matou um Inimigo -> cura todos os Ferimentos. */
  /** Título "Mestre da Morte" (Mausoléu Profano): cada Inimigo morto revela uma Lápide para quem matou. */
  private masterOfDeath(killer: Unit) {
    const t = this.map.masterDeathTitle;
    if (!t || killer.kind !== 'hero' || !killer.alive || !this.hasTitle(killer.guild!, t) || this.s.activation?.heroId !== killer.id) return;
    const card = TOMBSTONES[randInt(this.s, TOMBSTONES.length)];
    this.log(`Mestre da Morte: ${this.name(killer)} revela "${card.name}".`);
    this.tombEffect(killer, card.effect, card.name);
  }

  private devour(killer: Unit) {
    if (killer.kind !== 'hero' || !killer.alive || !killer.wounds || this.ab(killer) !== 'devorar') return;
    const x = killer.wounds;
    killer.wounds = 0;
    this.emit({ t: 'skill', id: killer.id, skill: 'devorar', name: 'Devorar' });
    this.emit({ t: 'heal', id: killer.id, amount: x, wounds: 0 });
  }

  private setStun(u: Unit, on: boolean) {
    u.stunned = on;
    this.emit({ t: 'stun', id: u.id, on });
  }

  private checkActiveDeath() {
    const a = this.s.activation;
    if (a && (!this.unit(a.heroId).alive || !this.unit(a.heroId).cell)) {
      // Grito de Guerra / Bênção / Mente Brilhante: ainda dá para ativar outro Aliado — o turno continua
      const h = this.unit(a.heroId);
      if (h.guild && this.heroesOf(h.guild).some(x => x.id !== h.id && this.canBless(x.id))) {
        this.log(`${this.name(h)} ${h.alive ? 'foi banido' : 'morreu'} — a Guilda ainda pode ativar outro Herói.`);
        // ninguém fica ativado (o morto não age mais); a próxima ativação usa o Grito de Guerra / a Bênção
        this.s.activation = null;
        this.s.extraOnly = true;
        return;
      }
      this.log(this.unit(a.heroId).alive ? 'O Herói ativo foi banido — o turno termina.' : 'O Herói ativo morreu — o turno termina.');
      this.endTurn();
    }
  }

  damageHero(h: Unit, n: number, src: DamageSource) {
    if (!h.alive || !h.cell) return; // banido (fora do tabuleiro): nada o atinge
    if (this.s.debug.heroesImmortal) n = Math.min(n, this.maxHp(h) - 1 - h.wounds);
    if (n <= 0) return;
    h.wounds += n;
    this.emit({ t: 'damage', id: h.id, amount: n, wounds: h.wounds, maxHp: this.maxHp(h) });
    if (this.hasPerm(h, 'angelHeart')) {
      const healed = this.heroesOf(h.guild!).filter(x => x.id !== h.id && x.alive && x.wounds > 0);
      for (const x of healed) { x.wounds -= 1; this.emit({ t: 'heal', id: x.id, amount: 1, wounds: x.wounds }); }
      if (healed.length) { this.emit({ t: 'skill', id: h.id, skill: 'coracao_anjos', name: 'Coração de Anjos' }); this.log(`Coração de Anjos: ${healed.map(x => this.name(x)).join(', ')} cura${healed.length > 1 ? 'm' : ''} 1 Ferimento.`); }
    }
    if (h.wounds >= this.maxHp(h)) this.heroDies(h, src);
    else if (h.curse === 'atordoado' && !h.stunned) this.setStun(h, true);
  }

  private heroDies(h: Unit, src: DamageSource) {
    const cell = h.cell!;
    h.alive = false;
    h.deaths += 1;
    h.stunned = false;
    h.petrified = 0;
    h.cell = null;
    if (h.banished) { h.banished = false; this.s.entryBoard = this.s.entryBoard.filter(x => x !== h.id); }
    this.emit({ t: 'death', id: h.id });
    this.log(`${this.name(h)} morreu!`);
    const dropped = h.tokens.splice(0);
    if (src.kind === 'hero' && src.id) {
      const killer = this.unit(src.id);
      const kg = killer.guild!;
      this.gainCoins(kg, 1, 'matou um Herói Inimigo');
      if (kg !== h.guild) { (this.s.heroKills ??= {})[killer.id] = (this.s.heroKills[killer.id] ?? 0) + 1; this.devour(killer); this.masterOfDeath(killer); }
      // marcadores de Missão não vão para quem matou: caem no Espaço onde o Herói morreu (só os de Exploração são saqueados)
      const stealable = dropped.filter(t => t.type !== 'missao');
      if (stealable.length && killer.alive) {
        stealable.sort((p, q) => (q.value ?? 1) - (p.value ?? 1));
        // mais de um: quem matou escolhe qual marcador vem (os outros caem no Espaço)
        const i = stealable.length > 1 && this.choiceHook
          ? this.choiceHook({ choice: 'loot', guild: kg, heroId: killer.id, source: 'Saque', tokens: stealable.map(t => ({ ...t, faceUp: true })), text: `${this.name(killer)} matou ${this.name(h)}: escolha 1 marcador para pegar (os outros ficam no Espaço).` })
          : 'auto';
        const pick = i === 'auto' || i < 0 || !stealable[i] ? stealable[0] : stealable[i];
        dropped.splice(dropped.indexOf(pick), 1);
        pick.faceUp = true;
        killer.tokens.push(pick);
        this.emit({ t: 'pickup', heroId: killer.id, token: pick });
        this.checkCarry(kg, killer);
      }
      if (h.guild !== kg) this.completeMission(kg, `matar_${h.guild}`, killer, h);
    } else {
      for (const g of this.guilds()) if (g.id !== h.guild) this.gainCoins(g.id, 1, 'um Herói inimigo morreu');
    }
    if (dropped.length) {
      for (const t of dropped) this.addFloor(cell, t);
      this.emit({ t: 'drop', cell, tokens: dropped });
    }
    if (this.map.deathCurse) this.deathCurse(h);
  }

  /** Confronto Final: o Herói que morreu compra 1 Maldição Mortal. Se valer mais que a dele, troca (a antiga volta ao baralho);
   *  senão continua com a mesma e a comprada volta. Maldição que ocupa espaço com o inventário cheio: o dono escolhe a carta coberta. */
  private deathCurse(h: Unit) {
    const deck = this.s.curseDeck ??= shuffle(this.s, curseDeck());
    const card = deck.shift();
    if (!card) return;
    const old = h.curse;
    const better = (CURSES[card]?.value ?? 0) > (old ? CURSES[old]?.value ?? 0 : 0);
    const back = better ? old : card;
    // a que não ficou volta para o baralho, embaralhado de novo
    if (back) this.s.curseDeck = shuffle(this.s, [...deck, back]);
    if (better) {
      h.curse = card;
      // a antiga ocupava espaço e a nova não: a carta que estava debaixo dela volta
      if (old && CURSES[old]?.slot && !CURSES[card].slot && h.covered) { h.cards.unshift(h.covered); h.covered = undefined; }
      if (CURSES[card].slot && !h.covered) {
        const sl = this.slotsUsed(h);
        if (sl.used > sl.max && h.cards.length) {
          const i = h.guild && this.choiceHook
            ? this.choiceHook({ choice: 'cover', guild: h.guild, heroId: h.id, source: CURSES[card].name, cards: h.cards.map(c => c.defId),
              text: `${this.name(h)} ficou com <b>${CURSES[card].name}</b>, que ocupa um espaço de carta: escolha qual carta fica debaixo da Maldição (indisponível até uma Poção de Cura).` })
            : 'auto';
          const at = i === 'auto' || i < 0 || !h.cards[i] ? 0 : i;
          h.covered = h.cards.splice(at, 1)[0];
        }
      }
    }
    this.emit({ t: 'curseDraw', heroId: h.id, card, ...(old ? { old } : {}), kept: h.curse ?? 'sem_maldicao' });
    this.log(better ? `${this.name(h)} comprou ${CURSES[card].name}: fica com ela${old ? ` (${CURSES[old].name} volta ao baralho)` : ''}.`
      : `${this.name(h)} comprou ${CURSES[card].name}: continua com ${old ? CURSES[old].name : 'nenhuma Maldição'}.`);
  }

  private monsterDies(m: Unit, killer: Unit, exterminated: boolean) {
    const md = MONSTERS[m.defId];
    m.alive = false;
    m.cell = null;
    m.petrified = 0;
    this.emit({ t: 'death', id: m.id, exterminated });
    this.devour(killer);
    this.masterOfDeath(killer);
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
    // (enemy_start e destroy não usam marcadores no chão)
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
    this.checkEnemyStart(h);
    this.updateTokenDoors();
    const i = h.tokens.findIndex(t => t.type === 'missao' && this.tokenMission(t)?.rule === 'escort');
    if (i < 0) return;
    const m = this.tokenMission(h.tokens[i])!;
    if (!this.escortTargets(m, h.guild!).some(c => sameCell(c, h.cell))) return;
    if (this.unitsAt(h.cell).some(u => this.isEnemy(h, u))) return;
    // Laboratório Secreto: precisa levar 2 marcadores juntos
    const need = m.count ?? 1;
    const mine = h.tokens.filter(t => t.type === 'missao' && this.tokenMission(t)?.id === m.id);
    if (mine.length < need) return;
    if ((this.s.missionDone[m.id] ?? []).includes(h.guild!)) return;
    for (const t of mine.slice(0, need)) h.tokens.splice(h.tokens.indexOf(t), 1);
    this.log(`${this.name(h)} levou ${need > 1 ? `${need} marcadores` : `o marcador ${mine[0].color ?? ''}`} até o destino!`);
    this.completeMission(h.guild!, m.id, h);
  }

  /** Quartel Assombrado: um Herói na Área Inicial de outra Guilda, sem Inimigos em nenhum Espaço dela. */
  private checkEnemyStart(h: Unit) {
    const m = this.s.missions.find(x => x.rule === 'enemy_start');
    if (!m || !h.cell || h.kind !== 'hero' || (this.s.missionDone[m.id] ?? []).includes(h.guild!)) return;
    for (const g of this.guilds()) {
      if (g.id === h.guild) continue;
      const area = this.map.startAreas[g.startArea];
      if (!area.some(c => sameCell(c, h.cell))) continue;
      if (area.some(c => this.unitsAt(c).some(u => this.isEnemy(h, u)))) continue;
      this.log(`${this.name(h)} investigou os alojamentos da ${g.name}!`);
      this.completeMission(h.guild!, m.id, h);
      return;
    }
  }

  /** Moinho das Almas: cada porta dos Esqueletos fica aberta só enquanto um Herói da Guilda está no marcador dela. */
  private updateTokenDoors() {
    for (const td of this.map.tokenDoors ?? []) {
      const g = this.s.guildOrder.find(x => this.guild(x).startArea === td.area);
      const d = this.s.doors[td.door];
      if (!d) continue;
      const open = !!g && this.unitsAt(td.token).some(u => u.kind === 'hero' && u.guild === g);
      if (d.open !== open) { d.open = open; this.emit({ t: 'door', doorId: d.id, open, by: this.unitsAt(td.token)[0]?.id ?? this.heroesOf(this.s.guildOrder[0])[0].id }); }
      d.locked = !open;
    }
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
  private summon(m: MissionDef, h: Unit, color?: string) {
    const type = m.summon ?? 'lorde_presas';
    const mon = this.units().find(u => u.kind === 'monster' && baseId(u.defId) === type && !u.alive && !this.s.entryBoard.includes(u.id));
    if (!mon) { this.log('O Monstro invocado já está em jogo.'); return; }
    // o marcador sai da partida e rola 2 dados contra as Entradas de Monstro (só a Sombra pode surgir)
    const r = this.roll(2, ATTACK_DIE, 'melee', 'normal', false).faces;
    const match = this.s.entryMarkers.find(em => { const p = em.pair.slice(); return r.every(f => { const i = p.indexOf(f); if (i < 0) return false; p.splice(i, 1); return true; }); });
    const free = !!match && this.cellLoad(match.cell) + this.weight(mon) <= 2;
    this.emit({ t: 'summonRoll', heroId: h.id, monsterId: mon.id, faces: r.slice(), cell: free ? { ...match!.cell } : null, ...(match && !free ? { target: { ...match.cell } } : {}), ...(color ? { color } : {}) });
    if (free) {
      mon.alive = true; mon.wounds = 0; mon.stunned = false; mon.cell = { ...match!.cell }; mon.shadow = true;
      this.log(`${this.name(h)} invocou a Sombra: ${this.name(mon)} surge na Entrada de Monstro (${match!.cell.c},${match!.cell.r})!`);
      this.emit({ t: 'spawn', id: mon.id, cell: { ...match!.cell } });
      // a Sombra já surgiu: os outros marcadores de invocação saem da partida
      for (const [k, toks] of Object.entries(this.s.floor)) {
        const gone = toks.filter(t => t.type === 'missao' && this.tokenMission(t)?.id === m.id);
        if (!gone.length) continue;
        this.s.floor[k] = toks.filter(t => !gone.includes(t));
        if (!this.s.floor[k].length) delete this.s.floor[k];
        this.emit({ t: 'tokenGone', cell: parseKey(k), ids: gone.map(t => t.id) });
        this.log(`O marcador ${gone.map(t => t.color ?? '').join(' e ')} sai da partida (a Sombra já surgiu).`);
      }
    } else this.log(`${this.name(h)} tentou invocar a Sombra do ${MONSTERS[mon.defId].name}: ${match ? 'a Entrada sorteada está ocupada' : 'os dados não indicam nenhuma Entrada'} — ela fica fora do tabuleiro.`);
  }

  /** Emboscada: o marcador escondido vira um Monstro que ataca quem o encontrou. */
  private ambush(h: Unit, cell: Cell, color?: string) {
    const type = (color && this.map.ambushBy?.[color]) || this.map.ambush!.monster;
    const mon = this.units().find(u => u.kind === 'monster' && baseId(u.defId) === type && !u.alive && !this.s.entryBoard.includes(u.id));
    if (!mon) return;
    // o Monstro aparece no Espaço do Herói; se não couber, no Espaço Perto mais próximo com lugar
    const spot = [cell, ...this.board.neighbors(cell).filter(c => this.board.isClose(cell, c))].find(c => this.cellLoad(c) + this.weight(mon) <= 2);
    if (!spot) return;
    cell = spot;
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
    this.log(`${this.name(h)} saqueou o Esconderijo do Troll: ${CARDS[defId].name}!`);
    // igual à Recompensa: aparece para todos; com o inventário cheio, o jogador escolhe onde a carta fica
    this.giveCard(h, defId, `hd-${h.id}`, 'Esconderijo do Troll');
  }

  /** O Herói desta Guilda quer este marcador de Missão? */
  missionTokenWanted(g: GuildId, t: Token): boolean {
    const m = this.tokenMission(t);
    if (!m) return false;
    if (m.rule === 'arena') return false;
    if (m.rule === 'summon') return true;
    if (m.rule === 'escort') {
      const done = this.s.missionDone[m.id] ?? [];
      if (m.ownOnly && t.color !== g) return false;
      const carrying = this.heroesOf(g).reduce((n, h) => n + h.tokens.filter(x => x.type === 'missao' && this.tokenMission(x)?.id === m.id).length, 0);
      return !done.includes(g) && !(m.maxCompletions && done.length >= m.maxCompletions) && carrying < (m.count ?? 1);
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
      t: 'attack', attackerId: src.id, reason: 'armadilha', cardName: 'Bomba (mina)', attackType: 'ranged', baseDice: dice,
      dice: atk.faces, hits: atk.successes, crits: atk.crits, notes: [`${here.length} mina${here.length > 1 ? 's' : ''} da ${this.guild(owner).name}`],
      targets: [{ id: h.id, defense: dr.faces, blocks: dr.successes, wounds, stunnedNoDefense: h.stunned }],
    });
    if (wounds > 0) this.damageHero(h, wounds, { kind: 'hero', id: src.id });
  }

  /** Rola e usa o Conjunto de Rerrolagem nos dados que falharam (p.27). */
  rollRerolls(n: number, die: DieFace[], success: DieFace, rerolls: number, who?: Unit, kind: 'attack' | 'defense' = 'attack', target?: Unit): RollResult {
    // Defesa: já bloqueou todos os acertos -> o ✷ não rola mais dado extra (o Herói escolhe se quer rolar)
    const need = die === DEFENSE_DIE ? this.defNeed : null;
    let r = this.roll(n, die, success, 'normal', true, need ?? Infinity);
    const covered = need != null && r.successes >= need;
    if (covered && who?.kind !== 'hero') return r;
    const canRr = (fs: DieFace[]) => rerolls > 0 && fs.some(f => f !== 'crit');
    // Monstro: quem decide é o jogador que controla os Monstros agora
    const mon = who?.kind === 'monster';
    const card = mon ? { name: MONSTERS[who!.defId].attackName, type: success, dice: n } : kind === 'attack' && this.curCard ? { ...this.curCard, dice: n } : undefined;
    const ask = (faces: DieFace[], left: number, round: number, more?: { covered: true; held?: number }) => this.rerollHook!({ heroId: who!.id, kind, faces: faces.slice(), success, rerolls: left, base: n, round,
      guild: mon ? this.monsterControllerGuild() : who!.guild ?? undefined, target: target?.id,
      vs: kind === 'defense' ? this.curAttack ?? undefined : undefined, card, ...(more ?? {}),
      ...(kind === 'defense' && this.curDefsDone.length ? { done: this.curDefsDone.slice() } : {}) });
    const first = r.faces.slice();
    let choice: number[] | 'auto';
    let round0 = 1;
    if (covered) {
      // Herói que já bloqueou tudo na primeira rolagem: Manter é o padrão; rolar os ✷ extras / Rerrolar só se quiser (IA mantém)
      if (!who || !this.rerollHook || (!r.held && !canRr(r.faces))) return r;
      choice = ask(r.faces, canRr(r.faces) ? rerolls : 0, 1, { covered: true, ...(r.held ? { held: r.held } : {}) });
      // IA / quem não decide aqui ('auto'): mantém, e os dados rolam normalmente na tela (não foram mostrados ainda)
      if (choice === 'auto') return { ...r, held: undefined };
      if (!choice.length) return { ...r, held: undefined, rr: { before: first, idx: [], asked: true } };
      if (choice.includes(HELD_PICK)) {
        r = this.rollHeld(r, die, success);
        if (!canRr(r.faces)) return { ...r, rr: { before: first, idx: [], asked: true } };
        choice = ask(r.faces, rerolls, round0 = 2);
        if (choice === 'auto') return { ...r, rr: { before: first, idx: [], asked: true } };
      }
    } else {
      // o jogador pode rerrolar também um dado que acertou (tentando ✷); só ✷ não pode
      if (!canRr(r.faces)) return r;
      choice = who && this.rerollHook ? ask(r.faces, rerolls, 1) : 'auto';
    }
    if (choice !== 'auto') {
      // o jogador escolhe os dados; se sobrar Rerrolagem e ainda houver dado que falhou, escolhe de novo
      // (pode rolar o mesmo dado outra vez). Cada dado rerrolado que der ✷ rola mais um.
      let faces = r.faces.slice();
      let left = rerolls;
      let round = round0;
      const used: number[] = [];
      let pick: number[] | 'auto' = choice;
      while (pick !== 'auto') {
        const idx = [...new Set(pick)].filter(i => i >= 0 && i < faces.length && faces[i] !== 'crit').slice(0, left);
        if (!idx.length) break;
        const extra: DieFace[] = [];
        for (const i of idx) { const nr = this.roll(1, die, success, 'normal'); faces[i] = nr.faces[0]; extra.push(...nr.faces.slice(1)); }
        faces = [...faces, ...extra].slice(0, this.diceLimit(die));
        used.push(...idx);
        left -= idx.length;
        if (left <= 0 || !faces.some(f => f !== 'crit')) break;
        pick = ask(faces, left, ++round);
      }
      return { faces, successes: faces.filter(f => f === success || f === 'crit').length, crits: faces.filter(f => f === 'crit').length, rerolled: used.length,
        rr: { before: first, idx: [...new Set(used)], asked: true } }; // asked: o jogador já viu os dados na tela
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
    const all = [...faces, ...extra].slice(0, this.diceLimit(die));
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
        if (!t.faceUp && (this.map.ambush?.colors.includes(t.color ?? '') || this.map.ambushBy?.[t.color ?? ''])) {
          // marcador escondido que é uma emboscada (sai do jogo)
          t.faceUp = true;
          this.ambush(h, h.cell!, t.color);
          continue;
        }
        const m = this.tokenMission(t);
        if (!m) { keep.push(t); continue; }
        if (m.rule === 'arena') { keep.push(t); continue; }
        if (m.rule === 'summon') {
          t.faceUp = true;
          this.log(`${this.name(h)} pisou no marcador ${t.color ?? ''}.`);
          this.summon(m, h, t.color);
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
    this.giveCard(h, defId, `r${this.s.rewardDeck.length}-${h.id}-${this.s.turn}`, 'Recompensa');
  }

  /** O Herói ganha uma carta (Recompensa da Missão, Esconderijo do Troll…): todos veem; com o inventário cheio,
   *  o dono escolhe — trocar por uma carta dele, dar a um Aliado com espaço ou guardar sem Herói (até o Descanso). */
  private giveCard(h: Unit, defId: string, uid: string, source: string) {
    const card: CardInst = { uid, defId, exhausted: false, uses: 0 };
    const spare = (inst: CardInst) => {
      const g = h.guild!;
      ((this.s.spare ??= {})[g] ??= []).push(inst);
      this.log(`${CARDS[inst.defId].name} fica com as cartas sem Herói (equipe no próximo Descanso).`);
    };
    if (this.hasRoom(h, defId)) {
      h.cards.push(card);
    } else {
      // inventário cheio: a carta é de quem pegou — troca por uma carta dele (a outra fica sem Herói) ou a nova fica sem Herói;
      // passar para outro Herói só no Descanso
      const i = this.choiceHook
        ? this.choiceHook({ choice: 'reward', guild: h.guild!, heroId: h.id, source, newCard: defId, cards: h.cards.map(c => c.defId), units: [],
          text: `${this.name(h)} está com o inventário cheio. Troque uma carta dele pela ${CARDS[defId].name} (a outra fica sem Herói) ou guarde a nova sem Herói — outro Herói só pode usá-la depois do Descanso.` })
        : 'auto';
      if (i !== 'auto' && i >= 0 && i < h.cards.length) {
        const [old] = h.cards.splice(i, 1, card);
        spare(old);
      } else spare(card);
    }
    const holder = this.heroesOf(h.guild!).find(x => x.cards.includes(card));
    this.emit({ t: 'reward', heroId: (holder ?? h).id, cardId: defId, ...(holder ? {} : { spare: true }), ...(source !== 'Recompensa' ? { source } : {}) });
    if (holder) this.log(`${this.name(holder)} recebeu a carta ${CARDS[defId].name}!`);
  }

  completeMission(g: GuildId, missionId: string, by?: Unit, victim?: Unit): boolean {
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
    ((this.s.missionBy ??= {})[missionId] ??= {})[g] = { ...(by ? { hero: by.defId } : {}), ...(victim ? { victim: victim.defId } : {}) };
    const how = by && victim ? `${this.name(by)} matou ${this.name(victim)}` : by ? this.name(by) : '';
    this.emit({ t: 'mission', guild: g, missionId, name: m.name, first, ...(how ? { how } : {}) });
    if (first) this.gainCoins(g, 1, `Primeiro Bônus: ${m.name}`);
    if (m.reward && by) this.giveReward(by);
    if (m.title && (first || !m.titleFirstOnly)) {
      const list = ((this.s.titles ??= {})[g] ??= []);
      if (!list.includes(m.title)) { list.push(m.title); this.log(`${gs.name} recebeu o Título "${TITLES[m.title] ?? m.title}"!`); this.emit({ t: 'title', guild: g, title: m.title, name: TITLES[m.title] ?? m.title }); }
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
    if (gs.missions.length >= this.s.missionsToWin && (this.s.guildOrder.length <= 2 || pve >= 1) && !this.s.winnerPending) {
      // a vitória só é anunciada quando o turno atual terminar
      this.s.winnerPending = g;
      this.emit({ t: 'victory', guild: g });
      this.log(`${gs.name} cumpriu as Missões para vencer! A partida termina no fim deste turno.`);
    }
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

  private monsterAttack(m: Unit, h: Unit, reason: 'alerta' | 'vinganca' | 'lapide') {
    if (!m.alive || !h.alive || !this.monsterCanAttack(m, h)) return;
    // Título "Mente Mestra": a Reação provocada por este Herói ataca outro Herói (Inimigo) Perto do Monstro
    const mm = this.map.mastermindTitle;
    if (mm && reason !== 'lapide' && h.kind === 'hero' && this.hasTitle(h.guild!, mm)) {
      const alt = this.onBoard().filter(u => u.kind === 'hero' && u.guild !== h.guild && this.monsterCanAttack(m, u)).sort((p, q) => this.killScore(p) - this.killScore(q))[0];
      if (alt) { this.log(`Mente Mestra: ${this.name(m)} ataca ${this.name(alt)} no lugar de ${this.name(h)}!`); h = alt; }
    }
    const md = this.monDef(m, h);
    const ab = md.abilities ?? [];
    const notes: string[] = [];
    // Erguer os Mortos (Necromante): o primeiro Monstro do Tabuleiro de Entrada volta Perto dele
    if (ab.includes('raise')) this.raiseDead(m);
    let dice = md.dice;
    if (ab.includes('packBonus') && this.monstersOnBoard().some(o => o.id !== m.id && this.board.isClose(o.cell!, m.cell!))) { dice++; notes.push('+1 dado (Perto de outro Monstro)'); }
    if (md !== MONSTERS[m.defId]) notes.push('Destruidor da Pedra Sangrenta: Orc mais fraco');
    const mrr = this.ab(h) === 'encantado' ? 0 : md.rerolls;
    let atk = this.rollRerolls(dice, ATTACK_DIE, md.attackType, mrr, m, 'attack', h);
    if (this.knightShield(h, { id: m.id, faces: atk.faces.slice(), hits: atk.successes, type: md.attackType, base: dice })) { atk = this.rollRerolls(dice, ATTACK_DIE, md.attackType, mrr, m, 'attack', h); notes.push('Escudo de Cavaleiro: ataque rolado de novo'); }
    this.curAttack = { id: m.id, faces: atk.faces.slice(), hits: atk.successes, type: md.attackType, base: dice };
    this.curDefsDone = [];
    if (md.rerolls) notes.push(`Rerrolagem ${md.rerolls}`);
    if (ab.includes('critExtra') && atk.crits) { atk.successes += atk.crits; notes.push(`+${atk.crits} acerto(s) por ✷`); }
    // Troll: atinge todos os Heróis Perto; Lorde Presas: também os Inimigos Perto do alvo
    let targets = [h];
    if (md.hitsAll) targets = [h, ...this.onBoard().filter(u => u.kind === 'hero' && u.id !== h.id && this.board.isClose(m.cell!, u.cell!))];
    if (ab.includes('splash')) {
      // "pode atingir qualquer número de Inimigos Perto do alvo": quem controla a Reação escolhe (os mesmos acertos para todos)
      const near = this.onBoard().filter(u => u.kind === 'hero' && u.id !== h.id && this.board.isClose(h.cell!, u.cell!));
      const ctl = this.monsterControllerGuild();
      let pick = near.filter(u => u.guild !== ctl);
      if (near.length && this.choiceHook) {
        const mask = this.choiceHook({ choice: 'multi', guild: ctl, heroId: m.id, source: md.attackName, units: near.map(u => u.id),
          text: `<b>${md.name}</b> ataca <b>${this.name(h)}</b>. Escolha quais Heróis Perto dele também são atingidos (qualquer número) — um só ataque: cada um rola a Defesa contra os mesmos acertos.` });
        if (mask !== 'auto') pick = near.filter((_, k) => mask > 0 && ((mask >> k) & 1) === 1);
      }
      targets = [h, ...pick];
    }
    if (targets.length > 1) notes.push(md.hitsAll ? 'Atinge todos os Heróis Perto!' : 'Atinge também os Heróis Perto do alvo!');
    if (this.ab(h) === 'furia' && h.wounds > 0 && !h.stunned) notes.push('Fúria de Combate: +1 dado de Defesa');
    const res = targets.map(t => {
      const dr = this.defenseRoll(t, this.defenseDice(t, m, md.attackType), m, atk.successes);
      return { t, dr, wounds: Math.max(0, atk.successes - dr.successes) };
    });
    this.emit({
      t: 'attack', attackerId: m.id, reason, cardName: md.attackName, attackType: md.attackType, baseDice: dice, ctl: this.monsterControllerGuild(),
      dice: atk.faces, hits: atk.successes, crits: atk.crits, notes, rr: atk.rr,
      targets: res.map(r => ({ id: r.t.id, defense: r.dr.faces, blocks: r.dr.successes, wounds: r.wounds, stunnedNoDefense: r.t.stunned, rr: r.dr.rr, ...(r.dr.noHits ? { noHits: true } : {}), ...(r.dr.base !== undefined ? { base: r.dr.base } : {}) })),
    });
    for (const r of res) {
      if (r.wounds > 0) this.damageHero(r.t, r.wounds, { kind: 'monster', id: m.id });
      if (r.wounds > 0 && ab.includes('daze') && r.t.alive && !r.t.stunned) this.setStun(r.t, true);
      if (r.wounds > 0 && ab.includes('banish') && r.t.alive && r.t.cell) this.banish(r.t, m);
      if (ab.includes('critExhaust') && atk.crits && r.t.alive) {
        const ready = r.t.cards.filter(c => !c.exhausted && this.isAttackCard(c)).slice(0, atk.crits);
        for (const c of ready) c.exhausted = true;
        if (ready.length) this.log(`${md.name} exaustou ${ready.length} carta(s) de ${this.name(r.t)}.`);
      }
      this.retaliate(r.t, r.dr, Math.min(atk.successes, r.dr.successes), m);
    }
    if (ab.includes('critHeal') && atk.crits && m.alive && m.wounds) {
      // Ferimentos além da Vida não contam: com a Vida a zero, cada ✷ ainda cura 2
      m.wounds = Math.min(m.wounds, MONSTERS[m.defId].hp);
      const x = Math.min(m.wounds, atk.crits * 2);
      m.wounds -= x;
      this.emit({ t: 'heal', id: m.id, amount: x, wounds: m.wounds });
    }
  }

  /** Erguer os Mortos: o primeiro Monstro do Tabuleiro de Entrada volta num Espaço Perto do Necromante. */
  private raiseDead(nec: Unit) {
    const id = this.s.entryBoard.find(x => this.unit(x).kind === 'monster');
    if (!id || !nec.cell) return;
    const mon = this.unit(id);
    const cell = [nec.cell, ...this.board.neighbors(nec.cell).filter(c => this.board.isClose(nec.cell!, c))].find(c => this.cellLoad(c) + this.weight(mon) <= 2);
    if (!cell) return;
    this.s.entryBoard = this.s.entryBoard.filter(x => x !== id);
    mon.alive = true;
    mon.cell = { ...cell };
    this.emit({ t: 'skill', id: nec.id, skill: 'erguer_mortos', name: 'Erguer os Mortos' });
    this.emit({ t: 'spawn', id: mon.id, cell: { ...cell } });
    this.log(`${this.name(nec)} ergue ${this.name(mon)} do Tabuleiro de Entrada!`);
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
      const nodes = this.reachable(m, this.monMove(m));
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

  /** Herói banido na Entrada de Monstros: vai para a Entrada sorteada se estiver livre; senão, Área Inicial / Perto de Aliado (p.7). */
  private returnBanished(h: Unit, faces: DieFace[]) {
    if (!h.alive || !h.banished) { h.banished = false; return; }
    const match = this.s.entryMarkers.find(em => { const p = em.pair.slice(); return faces.every(f => { const i = p.indexOf(f); if (i < 0) return false; p.splice(i, 1); return true; }); });
    h.banished = false;
    if (match && this.cellLoad(match.cell) < 2 && !this.unitsAt(match.cell).some(u => this.isEnemy(h, u))) {
      h.cell = { ...match.cell };
      this.emit({ t: 'spawnRoll', id: h.id, faces, cell: { ...match.cell }, reason: 'Volta do além na Entrada de Monstro!' });
      this.emit({ t: 'spawn', id: h.id, cell: { ...match.cell } });
    } else {
      this.emit({ t: 'spawnRoll', id: h.id, faces, cell: null, reason: 'Volta para a Área Inicial (com os Ferimentos)' });
      this.resurrect(h, undefined, true);
    }
    this.log(`${this.name(h)} voltou do Tabuleiro de Entrada.`);
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
      if (m.kind === 'hero') { this.returnBanished(m, r); continue; }
      const match = this.s.entryMarkers.find(em => {
        const p = em.pair.slice();
        return r.every(f => {
          const i = p.indexOf(f);
          if (i < 0) return false;
          p.splice(i, 1);
          return true;
        });
      });
      if (match && this.cellLoad(match.cell) < 2) {
        m.alive = true;
        m.wounds = 0;
        m.cell = { ...match.cell };
        this.emit({ t: 'spawnRoll', id: m.id, faces: r, cell: { ...match.cell }, reason: 'Reviveu na Entrada de Monstro!' });
        this.emit({ t: 'spawn', id: m.id, cell: match.cell });
      } else {
        const reason = match ? 'Entrada ocupada — voltou para a caixa' : 'Nenhuma entrada com esses símbolos — voltou para a caixa';
        this.emit({ t: 'spawnRoll', id: m.id, faces: r, cell: null, reason, ...(match ? { target: { ...match.cell } } : {}) });
        this.log(`${MONSTERS[m.defId].name}: ${reason}.`);
      }
    }
    this.s.entryBoard = [];
  }
}
