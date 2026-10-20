import { key, sameCell } from '../engine/board';
import { CARDS, HEROES, MONSTERS } from '../engine/data';
import type { Game, RestOptions } from '../engine/game';
import type { CardInst, Cell, GuildId, MissionDef, Token, Unit } from '../engine/types';

// IA das Guildas. Decide uma ação por vez (o controlador anima entre elas).
// Dois níveis:
//  - NORMAL: heurística direta, com um pouco de acaso nas escolhas (dá para vencer aprendendo o jogo).
//  - DIFÍCIL: sem acaso, lê as ameaças dos Heróis inimigos, usa poções na hora certa, caça quem carrega
//    marcadores de Missão, evita Armadilhas mortais e escolhe melhor onde ressuscitar.

export type AILevel = 'normal' | 'hard';

export type AIAction =
  | { type: 'activate'; heroId: string }
  | { type: 'move'; cell: Cell }
  | { type: 'attack'; cardUid: string; targetId: string; boosts?: string[]; sacrifice?: boolean }
  | { type: 'token'; tokenId: string }
  | { type: 'rest'; opts?: RestOptions }
  | { type: 'end' };

interface Plan { heroId: string; value: number; steps: AIAction[] }

// acertos esperados por dado (dados de 6 faces: 3 espadas, 2 arcos, 1 crítico que explode)
const ATK_EXP = (t: string) => (t === 'melee' ? 0.8 : 0.6);
const DEF_EXP = 0.4;
// ---- probabilidades exatas dos dados (usadas pela IA Difícil)
const MAXS = 16;
const distCache = new Map<string, number[]>();
/** Distribuição de sucessos de n dados que explodem no crítico (p = chance de sucesso simples, c = crítico). */
function successDist(n: number, p: number, c: number): number[] {
  const k = `${n}|${p}|${c}`;
  const hit = distCache.get(k);
  if (hit) return hit;
  const m = 1 - p - c;
  const one = Array.from({ length: MAXS }, (_, x) => x === 0 ? m : Math.pow(c, x - 1) * p + Math.pow(c, x) * m);
  let d = [1, ...Array(MAXS - 1).fill(0)];
  for (let i = 0; i < n; i++) {
    const nd = Array(MAXS).fill(0);
    for (let a = 0; a < MAXS; a++) if (d[a]) for (let b = 0; a + b < MAXS; b++) nd[a + b] += d[a] * one[b];
    d = nd;
  }
  distCache.set(k, d);
  return d;
}
/** Chance de matar e Ferimentos esperados (limitados à Vida restante). */
export function exactAttack(dice: number, type: string, defDice: number, rem: number): { killP: number; exp: number } {
  const A = successDist(Math.max(0, Math.round(dice)), type === 'melee' ? 3 / 6 : 2 / 6, 1 / 6);
  const B = successDist(Math.max(0, defDice), 1 / 6, 1 / 6);
  let killP = 0, exp = 0;
  for (let a = 0; a < MAXS; a++) for (let b = 0; b < MAXS; b++) {
    const pr = A[a] * B[b];
    if (!pr) continue;
    const w = Math.max(0, a - b);
    exp += pr * Math.min(w, rem);
    if (w >= rem) killP += pr;
  }
  return { killP, exp };
}

const near = (g: Game, c: Cell) => [c, ...g.board.neighbors(c).filter(n => g.board.isClose(c, n))];

export class SimpleAI {
  private queue: AIAction[] = [];
  private usedToken = false;
  /** Turnos seguidos sem progresso (moedas, Missões, Monstros). Quanto mais, mais agressiva a IA fica. */
  private idle = 0;
  private lastScore = -1;
  /** 0 = cautelosa … 1 = tudo ou nada (evita partidas travadas). */
  private aggr = 0;

  constructor(readonly level: AILevel = 'normal', private rnd: () => number = Math.random) {}

  private get hard() { return this.level === 'hard'; }
  /** Acaso do nível Normal (o Difícil sempre escolhe o melhor). */
  private noise(scale = 1) { return this.hard ? 0 : (this.rnd() - 0.5) * 1.4 * scale; }

  next(g: Game): AIAction {
    if (!g.s.activation) {
      this.queue = [];
      this.usedToken = false;
      const plan = this.plan(g);
      if (!plan) return { type: 'rest', opts: this.restOptions(g, g.currentGuild().id) };
      this.queue = plan.steps.slice();
      return { type: 'activate', heroId: plan.heroId };
    }
    const h = g.activeHero();
    // poções logo no começo da ativação
    if (h && !this.usedToken && !g.s.activation.moved && !g.s.activation.attacked) {
      const tok = this.tokenToUse(g, h);
      if (tok) { this.usedToken = true; return { type: 'token', tokenId: tok.id }; }
    }
    const a = this.queue.shift();
    if (!a) {
      // Bênção de Hobsbawm: ataque Mágico sem Movimento -> ativa outro Aliado em Linha de Visão
      if (g.s.blessing || g.s.warCry) {
        let best: Plan | null = null;
        for (const ally of g.heroesOf(g.currentGuild().id)) {
          if (!g.canBless(ally.id)) continue;
          const p = this.planHero(g, ally, this.goalDistances(g, ally.guild!, ally));
          if (p && p.value > 0.5 && (!best || p.value > best.value)) best = p;
        }
        if (best) { this.queue = best.steps.slice(); this.usedToken = false; return { type: 'activate', heroId: best.heroId }; }
      }
      return { type: 'end' };
    }
    if (a.type === 'move' && !g.canMove()) return this.next(g);
    if (a.type === 'attack') {
      const t = g.unit(a.targetId);
      const card = h?.cards.find(c => c.uid === a.cardUid);
      if (!h || !card || card.exhausted || !t.alive || !g.canCardHit(h, card, h.cell!, t)) return this.next(g);
    }
    return a;
  }

  // ------------------------------------------------------------------ poções
  private tokenToUse(g: Game, h: Unit): Token | null {
    if (h.curse === 'aquafobia') return null;
    const hp = g.maxHp(h) - h.wounds;
    const attackCards = h.cards.filter(c => g.isAttackCard(c));
    const exhausted = attackCards.filter(c => c.exhausted).length;
    for (const t of h.tokens) {
      if (t.type === 'cura' && h.wounds > 0 && (this.hard ? h.wounds >= 2 || hp <= 2 : hp <= 1)) return t;
      if (t.type === 'revigorante' && attackCards.length && (this.hard ? exhausted >= Math.min(2, attackCards.length) : exhausted === attackCards.length)) return t;
      if (t.type === 'turno' && !g.s.extraTurn && (this.hard ? hp >= 2 : true)) return t;
    }
    return null;
  }

  // ------------------------------------------------------------------ plano do turno
  private plan(g: Game): Plan | null {
    const guild = g.currentGuild();
    const heroes = g.heroesOf(guild.id);
    // progresso da Guilda: se ficar parada, arrisca mais
    const villainHits = g.units().filter(u => u.kind === 'monster' && MONSTERS[u.defId].category.startsWith('Vilão')).reduce((s, u) => s + u.wounds, 0);
    // moedas só contam enquanto a barreira do Templo está fechada (brigar à toa entre Guildas não é progresso)
    const coinsMatter = !!g.map.barrier && !guild.barrierOpen;
    const carried = heroes.reduce((n, h) => n + h.tokens.filter(t => t.type === 'missao').length, 0);
    const score = (coinsMatter ? g.wealth(guild.id) : 0) + carried * 2 + guild.missions.length * 5 + (g.s.missions.some(m => m.rule === 'kill_count' && !guild.missions.includes(m.id)) ? guild.monsterKills : 0) + villainHits + (g.s.arena?.[guild.id]?.length ?? 0) * 2;
    if (score > this.lastScore) { this.idle = 0; this.lastScore = score; } else this.idle++;
    this.aggr = Math.min(1, Math.max(0, (this.idle - (this.hard ? 3 : 5)) / 6));
    const dead = heroes.filter(h => !h.alive).length;
    let best: Plan | null = null;
    for (const h of heroes) {
      if (!h.alive || !h.cell || h.spent) continue;
      const p = this.planHero(g, h, this.goalDistances(g, guild.id, h));
      if (p) p.value += this.noise();
      if (p && (!best || p.value > best.value)) best = p;
    }
    const usableAttack = heroes.some(h => h.alive && h.cards.some(c => !c.exhausted && g.isAttackCard(c)));
    const exhaustedCount = heroes.reduce((s, h) => s + h.cards.filter(c => c.exhausted).length, 0);
    if (!best) return null;
    // Descansar: ressuscita os mortos e restaura as cartas
    const restBias = (this.hard ? 0.5 : 0) - this.aggr;
    if (dead > 0 && best.value < 2.5 + restBias + dead * (this.hard ? 0.8 : 0)) return null;
    if (!usableAttack && best.value < 2 + restBias) return null;
    if (exhaustedCount >= 3 && best.value < 1 + restBias) return null;
    if ((exhaustedCount > 0 || dead > 0) && best.value <= 0) return null;
    return best;
  }

  private planHero(g: Game, h: Unit, goals: Map<string, number>): Plan | null {
    const nodes = g.reachable(h, 3, h.cell!, true);
    const hp = g.maxHp(h) - h.wounds;
    let best: Plan | null = null;
    const consider = (value: number, steps: AIAction[]) => {
      if (!best || value > best.value) best = { heroId: h.id, value, steps };
    };
    const startCell = h.cell!;
    const startPos = this.positionValue(g, h, startCell, goals);

    for (const n of nodes.values()) {
      if (!n.canEnd) continue;
      const path = g.pathTo(nodes, n.cell);
      let risk = 0;
      let gain = 0;
      let cur = startCell;
      for (const st of path) {
        if (!st.portal && HEROES[h.defId].ability !== 'furtivo') risk += this.alertRisk(g, h, cur);
        gain += this.pickupValue(g, h, st.cell);
        cur = st.cell;
      }
      const pos = this.positionValue(g, h, n.cell, goals);
      const finish = this.endBonus(g, h, n.cell);
      const moveSteps: AIAction[] = sameCell(n.cell, startCell) ? [] : [{ type: 'move', cell: n.cell }];
      const riskPenalty = (risk >= hp ? risk * 4 + 6 : risk * (this.hard ? 1.4 : 1.2)) * (1 - 0.5 * this.aggr);
      const threat = this.hard ? this.heroThreat(g, h, n.cell, hp - Math.min(risk, hp - 0.5)) : 0;
      // Mover e depois atacar
      const atk = this.bestAttack(g, h, n.cell);
      if (atk) consider(gain + atk.value + pos * 0.3 + finish - riskPenalty - threat, [...moveSteps, this.attackStep(g, h, atk)]);
      consider(gain + pos - startPos + finish - riskPenalty - threat + (moveSteps.length ? 0 : -0.2), moveSteps);
    }
    // Atacar primeiro e depois mover
    const atk0 = this.bestAttack(g, h, startCell);
    if (atk0) {
      let bestMove: { v: number; cell: Cell | null } = { v: this.endBonus(g, h, startCell), cell: null };
      for (const n of nodes.values()) {
        if (!n.canEnd || sameCell(n.cell, startCell)) continue;
        const pos = this.positionValue(g, h, n.cell, goals) - startPos;
        let gain = 0;
        for (const st of g.pathTo(nodes, n.cell)) gain += this.pickupValue(g, h, st.cell);
        const v = pos * 0.5 + gain + this.endBonus(g, h, n.cell) - this.alertRisk(g, h, startCell) * 1.5 - (this.hard ? this.heroThreat(g, h, n.cell, hp) : 0);
        if (v > bestMove.v) bestMove = { v, cell: n.cell };
      }
      const steps: AIAction[] = [this.attackStep(g, h, atk0)];
      if (bestMove.cell) steps.push({ type: 'move', cell: bestMove.cell });
      consider(atk0.value + bestMove.v, steps);
      // Hobsbawm: atacar com Mágica e ficar parado dá a Bênção (ativa mais um Aliado no mesmo turno)
      if (g.ab(h) === 'bencao' && CARDS[atk0.card.defId].magic && !g.s.activation?.moved) {
        const allies = g.heroesOf(h.guild!).filter(x => x.id !== h.id && x.alive && x.cell && !(g.s.activatedThisTurn ?? []).includes(x.id) && g.hasLOS(h, startCell, x.cell));
        if (allies.length) consider(atk0.value + this.endBonus(g, h, startCell) + (this.hard ? 3 : 2), [this.attackStep(g, h, atk0)]);
      }
    }
    return best;
  }

  /** Ação de ataque; Kanga usa o Autossacrifício (1 Ferimento em vez de exaustar) quando tem Vida sobrando. */
  private attackStep(g: Game, h: Unit, atk: { card: CardInst; target: Unit; boosts: string[] }): AIAction {
    const hp = g.maxHp(h) - h.wounds;
    const sacrifice = g.canSacrifice(h) && hp >= (this.hard ? 3 : 4) && !CARDS[atk.card.defId].fx.drain;
    return { type: 'attack', cardUid: atk.card.uid, targetId: atk.target.id, boosts: atk.boosts, ...(sacrifice ? { sacrifice: true } : {}) };
  }

  /** Bônus por terminar a ativação neste Espaço (Arena, entrega da escolta). */
  private endBonus(g: Game, h: Unit, c: Cell): number {
    const enemyHere = g.unitsAt(c).some(u => u.id !== h.id && g.isEnemy(h, u));
    if (enemyHere) return 0;
    let v = 0;
    const arena = g.s.missions.find(m => m.rule === 'arena');
    if (arena && !this.done(g, h.guild!, arena) && (g.s.floor[key(c)] ?? []).some(t => t.type === 'missao')) {
      const mine = g.s.arena?.[h.guild!] ?? [];
      const total = g.map.missionMarkers.length;
      const fresh = !mine.includes(key(c));
      const willComplete = mine.length + 1 >= 5 || (fresh && new Set(mine).size + 1 >= total);
      v += willComplete ? 14 : fresh ? 6 : 3.5;
    }
    // carregando uma escolta: chegar ao destino completa a Missão
    const esc = h.tokens.find(t => t.type === 'missao' && g.tokenMission(t)?.rule === 'escort');
    if (esc) {
      const m = g.tokenMission(esc)!;
      if (g.escortTargets(m, h.guild!).some(x => sameCell(x, c))) v += 16;
    }
    return v;
  }

  private done(g: Game, guild: GuildId, m: MissionDef) {
    const d = g.s.missionDone[m.id] ?? [];
    return d.includes(guild) || (!!m.maxCompletions && d.length >= m.maxCompletions);
  }

  /** Difícil: perigo de ser atacado por Heróis inimigos no próximo turno, se ficar em `c`. */
  private heroThreat(g: Game, h: Unit, c: Cell, hpLeft: number): number {
    let worst = 0;
    for (const e of g.onBoard()) {
      if (e.kind !== 'hero' || !g.isEnemy(h, e)) continue;
      const d = Math.abs(e.cell!.c - c.c) + Math.abs(e.cell!.r - c.r);
      if (d > 5) continue;
      let dice = 0;
      for (const card of e.cards) {
        const def = CARDS[card.defId];
        if (def.kind !== 'attack' || card.exhausted) continue;
        if (def.attackType === 'melee' && d > 4) continue;
        dice = Math.max(dice, def.dice * ATK_EXP(def.attackType!));
      }
      worst += Math.max(0, dice - g.defenseDice(h) * DEF_EXP);
    }
    if (!worst) return 0;
    const carrying = h.tokens.some(t => t.type === 'missao') ? 1.5 : 1;
    return worst >= hpLeft ? 3 * carrying : worst * 0.25 * carrying;
  }

  /** Ampliações que a IA usa: as que não ferem, ou as que ferem se tiver Vida sobrando. */
  private pickBoosts(g: Game, h: Unit, card: CardInst): string[] {
    const hp = g.maxHp(h) - h.wounds;
    let cost = 0;
    const out: string[] = [];
    for (const c of [...g.boostsFor(h, card), ...g.optionalPerms(h)]) {
      const d = CARDS[c.defId];
      const w = (d.fx.selfWound ?? 0) + (d.kind === 'permanent' ? d.fx.grrr ?? 0 : 0);
      if (d.fx.rage && h.wounds === 0) continue;
      if (w && hp - cost - w < 3) continue;
      cost += w;
      out.push(c.uid);
    }
    return out;
  }

  private bestAttack(g: Game, h: Unit, from: Cell): { card: CardInst; target: Unit; value: number; boosts: string[] } | null {
    let best: { card: CardInst; target: Unit; value: number; boosts: string[] } | null = null;
    const saved = h.cell;
    h.cell = from;
    const guild = g.guild(h.guild!);
    const barrierClosed = !!g.map.barrier && !g.passesBarrier(h);
    try {
      for (const card of h.cards) {
        if (card.exhausted) continue;
        const def = CARDS[card.defId];
        if (def.kind !== 'attack') continue;
        const boosts = this.pickBoosts(g, h, card);
        for (const t of g.attackTargets(h, card, from)) {
          let dice = g.attackDicePreview(h, card, t, boosts).dice;
          if (g.ab(h) === 'maestria_arco' && def.group === 'Arco') dice += 0.2;
          if (def.fx.critExtra) dice += def.fx.critExtra * 0.2;
          const pierce = g.ab(h) === 'magia_perfurante' && def.magic;
          const rem = g.maxHp(t) - t.wounds;
          let exp = Math.max(0, dice * ATK_EXP(def.attackType!) - (pierce ? 0 : g.defenseDice(t, h) * DEF_EXP));
          let killP = Math.max(0, Math.min(1, (exp - rem + 1.2) / 2));
          if (this.hard) ({ killP, exp } = exactAttack(dice, def.attackType!, pierce ? 0 : g.defenseDice(t, h), rem));
          let killBonus = 0;
          let retaliation = 0;
          let progress = 0;
          if (t.kind === 'monster') {
            const md = MONSTERS[t.defId];
            const base = t.defId.replace(/\d+$/, '');
            const wantKills = g.s.missions.some(mi => mi.rule === 'kill_count' && !guild.missions.includes(mi.id));
            const wantType = g.s.missions.some(mi => (mi.rule === 'kill_type' || mi.rule === 'summon') && mi.types?.includes(base) && !this.done(g, guild.id, mi));
            // Templo: moedas abrem a barreira mágica
            const coinNeed = barrierClosed ? 1.5 : 1;
            killBonus = md.reward * 1.5 * coinNeed + (wantKills ? 1.5 + guild.monsterKills : 0) + (wantType ? 8 : 0);
            // Vilões: quem fere também ganha a recompensa
            if (md.category.startsWith('Vilão')) killBonus += Math.min(exp, rem) * 0.4;
            // Monstro em cima de um marcador de Missão que a Guilda quer: matá-lo libera o caminho
            if (g.floorAt(t.cell!).some(x => x.type === 'missao' && (g.missionTokenWanted(guild.id, x) || g.tokenMission(x)?.rule === 'arena'))) killBonus += 4;
            // ferir o Monstro-alvo da Missão já é progresso (Lorde Presas tem muita Vida)
            if (wantType) progress = Math.min(exp, rem) * (rem > 6 ? 2.2 : 1.2);
            if (exp < md.exterm) retaliation += Math.max(0, md.dice * ATK_EXP(md.attackType) - g.defenseDice(h) * DEF_EXP) * 0.8;
          } else {
            const pvp = `matar_${t.guild}`;
            const pvpOpen = g.s.missions.some(m => m.id === pvp) && !guild.missions.includes(pvp);
            killBonus = (g.map.pvp === false ? 1 : 2) + (pvpOpen ? 5 : 0);
            // quem carrega marcador de Missão: matá-lo atrapalha o adversário (e rouba o marcador)
            if (this.hard && t.tokens.some(x => x.type === 'missao')) killBonus += 4;
          }
          const targetsCloseMonster = t.kind === 'monster' && g.board.isClose(t.cell!, from);
          if (!targetsCloseMonster) retaliation += this.alertRisk(g, h, from);
          const hp = g.maxHp(h) - h.wounds;
          const deathRisk = retaliation >= hp ? 5 * (1 - 0.6 * this.aggr) : 0;
          retaliation *= 1 - 0.5 * this.aggr;
          killBonus *= 1 + this.aggr;
          // sem Missões contra Jogador (Templo): brigar com Heróis só vale para abrir caminho
          const dmgWeight = t.kind === 'hero' && g.map.pvp === false ? 0.3 : 1;
          const value = Math.min(exp, rem) * (1 + this.aggr) * dmgWeight + progress + killP * killBonus - retaliation - deathRisk + (def.fx.drain ? Math.min(exp, h.wounds) * 0.6 : 0);
          if (!best || value > best.value) best = { card, target: t, value, boosts };
        }
      }
    } finally {
      h.cell = saved;
    }
    return best;
  }

  /** Dano esperado das Reações de Alerta ao sair de `c`. */
  private alertRisk(g: Game, h: Unit, c: Cell): number {
    let r = 0;
    for (const m of g.monstersCloseTo(c)) {
      const md = MONSTERS[m.defId];
      r += Math.max(0.15, md.dice * ATK_EXP(md.attackType) - g.defenseDice(h) * DEF_EXP);
    }
    return r;
  }

  private pickupValue(g: Game, h: Unit, c: Cell): number {
    const toks = g.floorAt(c);
    if (!toks.length) return 0;
    if (g.unitsAt(c).some(u => g.isEnemy(h, u))) return 0;
    const deadly = g.map.deadlyTokens && !(g.map.fireProtectTitle && g.hasTitle(h.guild!, g.map.fireProtectTitle));
    let v = 0;
    for (const t of toks) {
      if (t.type === 'missao') {
        if (!g.missionTokenWanted(h.guild!, t)) continue;
        const m = g.tokenMission(t);
        if (m?.rule === 'summon') { v += g.maxHp(h) - h.wounds >= 3 ? 5 : 1; continue; }
        v += 9;
      } else if (!t.faceUp && deadly) v -= this.hard ? 8 : 2; // Templo: Armadilha mata
      else v += 1.3;
    }
    return v;
  }

  /** Quanto mais perto de objetivos, melhor. */
  private positionValue(g: Game, h: Unit, c: Cell, goals: Map<string, number>): number {
    const d = goals.get(key(c));
    const hp = g.maxHp(h) - h.wounds;
    let v = d === undefined ? -6 : -d * 0.45;
    const danger = this.alertRisk(g, h, c);
    if (danger >= hp) v -= this.hard ? 3 : 2;
    return v;
  }

  /** Mapa de distâncias até os objetivos da Guilda (Missões, marcadores, Monstros-alvo). `hero`: objetivos de quem carrega escolta. */
  goalDistances(g: Game, guildId: GuildId, hero?: Unit): Map<string, number> {
    const dist = new Map<string, number>();
    const q: { c: Cell; d: number }[] = [];
    const push = (c: Cell, d: number) => {
      const k = key(c);
      if (dist.has(k) && dist.get(k)! <= d) return;
      dist.set(k, d);
      q.push({ c, d });
    };
    const someone = hero ?? g.heroesOf(guildId).find(x => x.alive) ?? g.heroesOf(guildId)[0];

    // carregando escolta: só o destino importa
    const esc = hero?.tokens.find(t => t.type === 'missao' && g.tokenMission(t)?.rule === 'escort');
    if (esc) {
      for (const c of g.escortTargets(g.tokenMission(esc)!, guildId)) push(c, -10);
    } else {
      for (const [k, toks] of Object.entries(g.s.floor)) {
        const [c, r] = k.split(',').map(Number);
        for (const t of toks) {
          if (t.type === 'missao') {
            const m = g.tokenMission(t);
            if (m?.rule === 'arena') {
              if (this.done(g, guildId, m)) continue;
              push({ c, r }, (g.s.arena?.[guildId] ?? []).includes(k) ? -1 : -4);
              continue;
            }
            if (!g.missionTokenWanted(guildId, t)) continue;
            if (m?.rule === 'summon') {
              const on = g.onBoard().some(u => u.kind === 'monster' && m.types?.includes(u.defId.replace(/\d+$/, '')));
              if (!on && !this.done(g, guildId, m)) push({ c, r }, -2);
              continue;
            }
            push({ c, r }, -3);
            continue;
          }
          const deadly = g.map.deadlyTokens && !(g.map.fireProtectTitle && g.hasTitle(guildId, g.map.fireProtectTitle));
          if (deadly && !t.faceUp) continue;
          push({ c, r }, 0);
        }
      }
      // Esconderijo do Troll (só quem tem o Título)
      if (g.map.hideout && g.map.lockTitle && !g.s.hideoutTaken && g.hasTitle(guildId, g.map.lockTitle)) for (const c of g.map.hideout.cells) push(c, -3);
      // Monstros-alvo de Missão puxam a Guilda com força
      const collectPending = g.s.missions.some(mi => ['collect_any', 'collect_own', 'escort', 'arena'].includes(mi.rule ?? '') && !this.done(g, guildId, mi));
      const pull = collectPending ? -1 : -6;
      const targets = new Set(g.s.missions.filter(mi => (mi.rule === 'kill_type' || mi.rule === 'summon') && !this.done(g, guildId, mi)).flatMap(mi => mi.types ?? []));
      const barrierClosed = !!g.map.barrier && !!someone && !g.passesBarrier(someone);
      for (const u of g.onBoard()) {
        if (u.kind === 'monster' && targets.has(u.defId.replace(/\d+$/, '')) && !barrierClosed) for (const n of near(g, u.cell!)) push(n, pull);
        // Templo com a barreira fechada: Monstros = moedas
        if (u.kind === 'monster') for (const n of near(g, u.cell!)) push(n, barrierClosed ? -1.5 : 0.5);
        if (u.kind === 'hero' && u.guild !== guildId) {
          const weak = g.maxHp(u) - u.wounds <= 2 || u.tokens.some(t => t.type === 'missao');
          for (const n of near(g, u.cell!)) push(n, this.hard && weak ? -1 : 0.3);
        }
      }
    }
    // espalha pelo mapa, respeitando portas trancadas e portais restritos
    const locked = (a: Cell, b: Cell) => { const d = g.board.doorBetween(a, b); return !!d?.locked && !(someone && g.passesBarrier(someone)); };
    const portalOk = (color: string) => {
      if (g.map.portalTitle?.color === color && !g.hasTitle(guildId, g.map.portalTitle.title)) return false;
      if (g.map.barrier?.portalColor === color && !(someone && g.passesBarrier(someone))) return false;
      return true;
    };
    while (q.length) {
      q.sort((a, b) => a.d - b.d);
      const { c, d } = q.shift()!;
      if (dist.get(key(c))! < d) continue;
      for (const n of g.board.neighbors(c)) {
        const e = g.board.edge(c, n);
        if (e === 'wall' || (e === 'door' && locked(c, n))) continue;
        push(n, d + (e === 'door' ? 2 : 1));
      }
      const pc = g.board.portalAt(c);
      if (pc && portalOk(pc)) for (const p of g.board.portalCells(pc)) push(p, d + 1);
    }
    return dist;
  }

  // ------------------------------------------------------------------ posicionamento e ressurreição
  /** Espaços da Área Inicial em ordem: o "da porta" (mais perto dos objetivos) primeiro. */
  private doorOrder(g: Game, guild: GuildId): Cell[] {
    const goals = this.goalDistances(g, guild);
    const area = g.map.startAreas[g.guild(guild).startArea];
    return area.slice().sort((a, b) => (goals.get(key(a)) ?? 99) - (goals.get(key(b)) ?? 99));
  }

  /** Posicionamento inicial: 2 Heróis no Espaço da porta (saem primeiro), o 3º no seguinte. */
  deployPlan(g: Game, guild: GuildId): { heroId: string; cell: Cell }[] {
    const cells = this.doorOrder(g, guild);
    const heroes = g.heroesOf(guild).slice().sort((a, b) => (g.maxHp(b) + g.defenseDice(b)) - (g.maxHp(a) + g.defenseDice(a)));
    const plan = heroes.map((h, i) => ({ heroId: h.id, cell: cells[Math.min(cells.length - 1, i < 2 ? 0 : 1)] }));
    // quem sai do Espaço da porta se move antes (senão a porta pode estar cheia)
    return plan.sort((a, b) => Number(sameCell(a.cell, cells[0])) - Number(sameCell(b.cell, cells[0])));
  }

  /** Descanso: onde cada morto ressuscita — sempre até 2 no Espaço da porta; o Difícil também usa Aliados à frente. */
  restOptions(g: Game, guild: GuildId): RestOptions | undefined {
    const dead = g.heroesOf(guild).filter(h => !h.alive);
    if (!dead.length) return undefined;
    const goals = this.goalDistances(g, guild);
    const load = new Map<string, number>();
    const count = (c: Cell) => g.unitsAt(c).length + (load.get(key(c)) ?? 0);
    const door = this.doorOrder(g, guild);
    const out: Record<string, Cell> = {};
    for (const h of dead) {
      const cands = g.resurrectCells(h).filter(c => count(c) < 2);
      if (!cands.length) continue;
      let pick: Cell | undefined;
      if (this.hard) {
        const score = (c: Cell) => -(goals.get(key(c)) ?? 20) - this.alertRisk(g, h, c) * 1.5 - (door.some(x => sameCell(x, c)) ? 0 : 0.5);
        pick = cands.slice().sort((a, b) => score(b) - score(a))[0];
      } else pick = door.find(c => count(c) < 2 && cands.some(x => sameCell(x, c))) ?? cands[0];
      out[h.id] = { ...pick };
      load.set(key(pick), (load.get(key(pick)) ?? 0) + 1);
    }
    return { resurrect: out };
  }
}

// ------------------------------------------------------------------ escolhas fora da partida (campanha)

/** Força de cada Herói para a IA (habilidade + atributos). */
export const HERO_TIER: Record<string, number> = {
  maya: 9, seth: 8.5, diva: 8.5, grom: 8, casacaverde: 8, hobsbawm: 7.5,
  escarlate: 7.5, zazu: 7, johan: 7, vapor: 7, espetado: 6.5, kanga: 6.5,
};
const RANGED = new Set(['maya', 'seth', 'casacaverde', 'hobsbawm', 'johan']);
const TANK = new Set(['diva', 'grom', 'espetado', 'johan', 'escarlate']);

/** Escolha de Herói no recrutamento: força + equilíbrio da Guilda (alcance e resistência). */
export function pickHero(hand: string[], have: string[], level: AILevel, rnd: () => number): string {
  const score = (h: string) => {
    let s = (HERO_TIER[h] ?? 6) + (HEROES[h].implemented === false ? -3 : 0);
    if (!have.some(x => RANGED.has(x)) && RANGED.has(h)) s += level === 'hard' ? 1.5 : 0.8;
    if (!have.some(x => TANK.has(x)) && TANK.has(h)) s += level === 'hard' ? 1.2 : 0.6;
    if (have.filter(x => RANGED.has(x)).length >= 2 && RANGED.has(h)) s -= 1;
    return s + (rnd() - 0.5) * (level === 'hard' ? 0.4 : 2.5);
  };
  return hand.slice().sort((a, b) => score(b) - score(a))[0];
}

/** Quanto a carta combina com o Herói (Mágica com magos, Arco com o arqueiro, Espada com Jøhan…). */
export function cardFit(hero: string, id: string): number {
  const d = CARDS[id];
  const ab = HEROES[hero]?.ability;
  if (!d) return 0;
  if (d.magic) return ab === 'dominio_magia' || ab === 'magia_perfurante' ? 2.2 : ab === 'bencao' ? 1.8 : 0.6;
  if (d.group === 'Arco') return ab === 'maestria_arco' ? 2.2 : 0.7;
  if (d.group === 'Espada') return ab === 'arremesso' ? 2 : 1;
  if (d.kind === 'attack' && d.attackType === 'melee') return ab === 'furia' || ab === 'apunhalar' || ab === 'oportunista' ? 1.4 : 1;
  if (d.defBonus || d.hpBonus) return HEROES[hero].defense <= 2 ? 1.3 : 1;
  return 1;
}
