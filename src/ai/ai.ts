import { key, parseKey, sameCell } from '../engine/board';
import { CARDS, HEROES, MONSTERS } from '../engine/data';
import type { Game, RestOptions } from '../engine/game';
import type { CardInst, Cell, GuildId, MissionDef, Token, Unit } from '../engine/types';

// IA das Guildas. Decide uma ação por vez (o controlador anima entre elas).
// Dois níveis:
//  - NORMAL: heurística direta, com um pouco de acaso nas escolhas (dá para vencer aprendendo o jogo).
//  - DIFÍCIL: sem acaso, lê as ameaças dos Heróis inimigos, usa poções na hora certa, caça quem carrega
//    marcadores de Missão, evita Armadilhas mortais e escolhe melhor onde ressuscitar.

export type AILevel = 'normal' | 'hard';

/** Pesos da IA. Os valores padrão vêm de simulações (IA x IA em todos os mapas): menos rodadas por partida
 *  sem deixar a IA mais fraca no confronto direto. */
export interface AIParams {
  /** Matar um Herói de Guilda cuja Missão "Matar" já foi cumprida: bônus máximo da morte. */
  pvpDoneKill: number;
  /** ... e peso do dano nele. */
  pvpDoneDmg: number;
  /** Heróis dessa Guilda continuam atraindo a IA como objetivo? */
  pvpDoneAttract: boolean;
  /** Peso da distância até os objetivos. */
  posW: number;
  /** Valor de pegar um marcador de Missão. */
  missionTok: number;
  /** Turnos sem progresso a mais antes de ficar agressiva. */
  idleStart: number;
  /** Bônus por matar um Monstro que guarda (está Perto de) um marcador de Missão desejado. */
  guardKill: number;
  /** Peso da chance de um marcador virado ser uma Missão escondida. */
  hiddenW: number;
  /** Atrapalhar Missões dos adversários (ficar no Espaço do objetivo, derrubar quem está quase cumprindo). */
  denyW: number;
  /** Só atrapalha quem está a 1 Missão de vencer. */
  denyUrgentOnly: boolean;
  /** Peso do dano de Reação de Alerta no caminho (Difícil / Normal). */
  riskW: number;
  /** Peso do Alerta que vai sofrer no próximo turno por terminar colado em Monstros. */
  stayW: number;
  /** Bônus da Missão contra Jogador enquanto a Guilda ainda não tem Missão do mapa. */
  pvpNeedPve: number;
  /** Alianças temporárias: peso contra quem está ganhando / quem está atrás. */
  leaderHi: number;
  leaderLo: number;
}
export const AI_PARAMS: AIParams = { pvpDoneKill: 1, pvpDoneDmg: 0.7, pvpDoneAttract: false, posW: 0.6, missionTok: 9, idleStart: 0, guardKill: 2, hiddenW: 3, denyW: 1, denyUrgentOnly: false,
  riskW: 2.6, stayW: 0.8, pvpNeedPve: 3, leaderHi: 1.4, leaderLo: 0.6 };

export type AIAction =
  | { type: 'activate'; heroId: string }
  | { type: 'move'; cell: Cell }
  /** Abrir uma porta ao lado (sem atravessar): revela quem está do outro lado para atacar. */
  | { type: 'door'; doorId: string }
  | { type: 'attack'; cardUid: string; targetId: string; boosts?: string[]; sacrifice?: boolean }
  | { type: 'token'; tokenId: string }
  /** Habilidade do Herói usada como ação (Heróis extras). */
  | { type: 'power'; heroId: string; target?: string; cell?: Cell }
  | { type: 'tomb' }
  /** Lápide que ativa um Monstro (quando a IA joga por um humano): escolhe, move e ataca. */
  | { type: 'puppetPick'; monsterId: string }
  | { type: 'puppet'; dest: Cell | null; targetId: string | null }
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
  /** Já usou uma poção no fim desta ativação (uma por vez; volta aqui depois). */
  private endTokens = 0;
  /** Herói que já atacou nesta ativação (Caçador pode atacar de novo). */
  private attackedHero: string | null = null;
  /** Turnos seguidos sem progresso (moedas, Missões, Monstros). Quanto mais, mais agressiva a IA fica. */
  private idle = 0;
  private lastScore = -1;
  /** 0 = cautelosa … 1 = tudo ou nada (evita partidas travadas). */
  private aggr = 0;

  /** Pesos da IA (ajustados por simulação: tools/sim — ver AI_PARAMS). */
  readonly p: AIParams;
  constructor(readonly level: AILevel = 'normal', private rnd: () => number = Math.random, params: Partial<AIParams> = {}) {
    this.p = { ...AI_PARAMS, ...params };
  }

  private get hard() { return this.level === 'hard'; }
  /** Acaso do nível Normal (o Difícil sempre escolhe o melhor). */
  private noise(scale = 1) { return this.hard ? 0 : (this.rnd() - 0.5) * 1.4 * scale; }

  next(g: Game): AIAction {
    if (g.s.puppet) return this.puppet(g);
    if (!g.s.activation) {
      this.queue = [];
      this.usedToken = false;
      this.endTokens = 0;
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
    // habilidades dos Heróis extras (Relâmpago, Ataque Mental) antes do que foi planejado
    if (h) { const pw = this.powerToUse(g, h); if (pw) return pw; }
    // Lápide no Espaço: revela (a maioria das cartas ajuda), se não for gastar o último PM de um movimento importante
    if (h && g.canRevealTomb() && (g.maxHp(h) - h.wounds >= 2) && (g.s.activation!.mp >= 2 || !this.queue.some(x => x.type === 'move'))) return { type: 'tomb' };
    const a = this.queue.shift();
    if (!a) {
      // Bênção de Hobsbawm / Grito de Guerra / Mente Brilhante -> ativa outro Aliado
      if (g.s.blessing || g.s.warCry || g.s.brightMind) {
        let best: Plan | null = null;
        for (const ally of g.heroesOf(g.currentGuild().id)) {
          if (!g.canBless(ally.id)) continue;
          const p = this.planHero(g, ally, this.goalDistances(g, ally.guild!, ally), g.blessKind(ally.id) === 'mind');
          if (p && p.value > 0.5 && (!best || p.value > best.value)) best = p;
        }
        if (best) { this.queue = best.steps.slice(); this.usedToken = false; return { type: 'activate', heroId: best.heroId }; }
      }
      // fim da ativação: poções que valem agora (ferido -> Cura; cartas gastas -> Revigorante; quase morrendo -> usa antes de perder)
      if (h?.alive && this.endTokens < 3) {
        const tok = this.endTokenToUse(g, h);
        if (tok) { this.endTokens++; return { type: 'token', tokenId: tok.id }; }
      }
      // Caçador (Viktor): matou o alvo e pode atacar de novo — ataca daqui se valer a pena
      const act = g.s.activation;
      if (h?.alive && h.cell && act && !act.attacked && !act.moveOnly && g.ab(h) === 'cacador' && this.attackedHero === h.id) {
        const atk = this.bestAttack(g, h, h.cell);
        if (atk && atk.value > 0.3) return this.attackStep(g, h, atk);
      }
      this.attackedHero = null;
      return { type: 'end' };
    }
    if (a.type === 'move') {
      if (!g.canMove() || !h?.cell) return this.next(g);
      const nd = g.reachable(h, g.s.activation!.mp, h.cell, true).get(key(a.cell));
      if (!nd || !nd.canEnd) return this.next(g);
    }
    if (a.type === 'door') {
      const d = g.s.doors.find(x => x.id === a.doorId);
      if (!d || d.open || !g.doorsAdjacentToActive().includes(a.doorId)) return this.next(g);
    }
    if (a.type === 'attack') {
      const t = g.unit(a.targetId);
      const card = h ? g.findAttackCard(h, a.cardUid) : undefined;
      if (!h || !h.alive || !h.cell || g.s.activation?.attacked || !card || card.exhausted || !t.alive || !t.cell || !g.canCardHit(h, card, h.cell, t)) return this.next(g);
      this.attackedHero = h.id;
    }
    return a;
  }

  /** Habilidades usadas como ação: Relâmpago (Brenna) e Ataque Mental (Chooloo). */
  private powerToUse(g: Game, h: Unit): AIAction | null {
    const info = g.heroPower(h);
    if (!info?.ok) return null;
    const ab = g.ab(h);
    if (ab === 'relampago') {
      const foes = g.onBoard().filter(u => u.id !== h.id && g.isEnemy(h, u) && h.cell && g.board.isClose(u.cell!, h.cell));
      const hpLeft = g.maxHp(h) - h.wounds;
      const finishers = foes.filter(u => g.maxHp(u) - u.wounds <= 1).length;
      if (hpLeft >= 3 && (foes.length >= 2 || finishers)) return { type: 'power', heroId: h.id };
      return null;
    }
    if (ab === 'ataque_mental') {
      // atordoa quem vai atacar (sem Defesa) se ele tiver Defesa boa
      const next = this.queue.find(x => x.type === 'attack') as { targetId: string } | undefined;
      const t = next && g.powerTargets(h).find(u => u.id === next.targetId);
      if (t && g.defenseDice(t, h) >= 2) return { type: 'power', heroId: h.id, target: t.id };
    }
    return null;
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
      if (t.type === 'turno' && !g.s.extraTurn && !g.s.extraTurnOn && (this.hard ? hp >= 2 : true)) return t;
    }
    return null;
  }

  /** Poções no fim da ativação: a Cura quando o Herói está bem ferido (ou vai morrer se ficar assim),
   *  a Revigorante quando gastou as cartas de Ataque (magias), e qualquer uma antes de morrer com ela na bolsa. */
  private endTokenToUse(g: Game, h: Unit): Token | null {
    if (h.curse === 'aquafobia' || !h.cell) return null;
    const max = g.maxHp(h), hp = max - h.wounds;
    const danger = this.heroThreatDmg(g, h, h.cell) + this.alertRisk(g, h, h.cell) * 0.5;
    const dying = danger >= hp;
    const attackCards = h.cards.filter(c => g.isAttackCard(c));
    const exhausted = attackCards.filter(c => c.exhausted).length;
    for (const t of h.tokens) {
      if (t.type === 'cura' && h.wounds > 0 && (h.wounds >= 2 || hp <= 2 || dying)) return t;
      if (t.type === 'revigorante' && exhausted > 0 && (exhausted >= Math.min(2, attackCards.length) || dying || attackCards.some(c => c.exhausted && CARDS[c.defId].magic))) return t;
    }
    return null;
  }

  /** Dano esperado dos Heróis inimigos que alcançam `c` no próximo turno (sem limite de Vida). */
  private heroThreatDmg(g: Game, h: Unit, c: Cell): number {
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
    return worst;
  }

  /** Alianças temporárias: o quanto vale atrapalhar esta Guilda (quem está ganhando vale mais; quem está atrás, menos). */
  private leaderFactor(g: Game, me: GuildId, other: GuildId): number {
    const score = (id: GuildId) => g.guild(id).missions.length * 10 + g.heroesOf(id).reduce((n, u) => n + u.tokens.filter(t => t.type === 'missao').length, 0) * 3 + g.wealth(id) * 0.2;
    const others = g.guilds().filter(x => x.id !== me).map(x => ({ id: x.id, s: score(x.id) }));
    if (others.length < 2) return 1;
    const top = Math.max(...others.map(o => o.s)), low = Math.min(...others.map(o => o.s));
    if (top === low) return 1;
    const s = score(other);
    if (s === top) return g.guild(other).missions.length >= g.s.missionsToWin - 1 ? this.p.leaderHi + 0.4 : this.p.leaderHi; // quem está ganhando
    if (s === low) return this.p.leaderLo; // quem está atrás: deixa em paz
    return 1;
  }

  /** A Guilda ainda precisa de uma Missão do mapa (contra o Jogo): ela vale mais que brigar. */
  private needPve(g: Game, guild: GuildId): boolean {
    const gs = g.guild(guild);
    const pveDone = gs.missions.filter(id => g.s.missions.find(m => m.id === id)?.kind === 'pve').length;
    return pveDone === 0 && g.s.missions.some(m => m.kind === 'pve' && !this.done(g, guild, m));
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
    this.aggr = Math.min(1, Math.max(0, (this.idle - (this.hard ? 3 : 5) - this.p.idleStart) / 6));
    const dead = heroes.filter(h => !h.alive).length;
    let best: Plan | null = null;
    for (const h of heroes) {
      if (!h.alive || !h.cell) continue;
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

  /** `moveOnly`: ativação só para o Movimento (Mente Brilhante). */
  private planHero(g: Game, h: Unit, goals: Map<string, number>, moveOnly = false): Plan | null {
    const mp0 = g.startMp(h);
    const nodes = g.reachable(h, mp0, h.cell!, true);
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
        // Furtividade (Vapor) só esquiva 1 vez por turno
        const stealth = g.ab(h) === 'furtivo' && !(g.s.stealthUsed ?? []).includes(h.id);
        if (!st.portal && !stealth) risk += this.alertRisk(g, h, cur);
        gain += this.pickupValue(g, h, st.cell);
        cur = st.cell;
      }
      const pos = this.positionValue(g, h, n.cell, goals);
      const finish = this.endBonus(g, h, n.cell);
      const moveSteps: AIAction[] = sameCell(n.cell, startCell) ? [] : [{ type: 'move', cell: n.cell }];
      const riskPenalty = (risk >= hp ? risk * 4 + 6 : risk * this.riskW(g) * (this.hard ? 1 : 0.82)) * (1 - 0.75 * this.aggr);
      const threat = this.hard ? this.heroThreat(g, h, n.cell, hp - Math.min(risk, hp - 0.5)) : 0;
      // terminar colado em Monstros: no próximo turno, sair dali provoca Reação de Alerta (a não ser que o alvo morra)
      // partida parada (aggr): a cautela some aos poucos, senão ninguém encara o chefe cercado de Monstros
      const stay = this.stayRisk(g, h, n.cell) * this.stayW(g) * (this.hard ? 1 : 0.7) * (1 - this.aggr);
      // Mover e depois atacar
      const atk = moveOnly ? null : this.bestAttack(g, h, n.cell);
      if (atk) {
        const tgt = atk.target.kind === 'monster' && g.board.isClose(atk.target.cell!, n.cell)
          ? atk.killP * Math.max(0.15, MONSTERS[atk.target.defId].dice * ATK_EXP(MONSTERS[atk.target.defId].attackType) - g.defenseDice(h) * DEF_EXP) * this.stayW(g) * (this.hard ? 1 : 0.7) : 0;
        consider(gain + atk.value + pos * 0.3 + finish - riskPenalty - threat - Math.max(0, stay - tgt), [...moveSteps, this.attackStep(g, h, atk)]);
      }
      consider(gain + pos - startPos + finish - riskPenalty - threat - stay + (moveSteps.length ? 0 : -0.2), moveSteps);
      // Abrir uma porta ao lado e atacar quem está atrás (Monstros numa sala fechada bloqueiam a passagem)
      if (!moveOnly && n.mp < mp0) {
        for (const d of g.s.doors) {
          if (d.open || d.locked || !(sameCell(d.a, n.cell) || sameCell(d.b, n.cell))) continue;
          d.open = true;
          try {
            const atkD = this.bestAttack(g, h, n.cell);
            if (atkD) consider(gain + atkD.value + pos * 0.3 + finish - riskPenalty - threat - 0.3, [...moveSteps, { type: 'door', doorId: d.id }, this.attackStep(g, h, atkD)]);
          } finally { d.open = false; }
        }
      }
    }
    // Atacar primeiro e depois mover
    const atk0 = moveOnly ? null : this.bestAttack(g, h, startCell);
    if (atk0) {
      let bestMove: { v: number; cell: Cell | null } = { v: this.endBonus(g, h, startCell), cell: null };
      for (const n of nodes.values()) {
        if (!n.canEnd || sameCell(n.cell, startCell)) continue;
        const pos = this.positionValue(g, h, n.cell, goals) - startPos;
        let gain = 0;
        for (const st of g.pathTo(nodes, n.cell)) gain += this.pickupValue(g, h, st.cell);
        // o Monstro atacado (se morrer) não faz Reação de Alerta na saída
        const tgtAlert = atk0.target.kind === 'monster' && g.board.isClose(atk0.target.cell!, startCell)
          ? atk0.killP * Math.max(0.15, MONSTERS[atk0.target.defId].dice * ATK_EXP(MONSTERS[atk0.target.defId].attackType) - g.defenseDice(h) * DEF_EXP) : 0;
        const risk0 = Math.max(0, this.alertRisk(g, h, startCell) - tgtAlert);
        const v = pos * 0.5 + gain + this.endBonus(g, h, n.cell) - (risk0 >= hp ? risk0 * 4 + 6 : risk0 * this.riskW(g)) - (this.hard ? this.heroThreat(g, h, n.cell, hp) : 0);
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
    // Autossacrifício (Kanga): 1 Ferimento para não exaustar a carta — só com a Vida quase cheia, sem perigo por perto
    // e quando é a última carta de Ataque pronta (senão só se fere à toa)
    const otherReady = h.cards.filter(c => c.uid !== atk.card.uid && !c.exhausted && g.isAttackCard(c)).length;
    const safe = !h.cell || this.heroThreatDmg(g, h, h.cell) + this.alertRisk(g, h, h.cell) < hp - 1;
    const sacrifice = g.canSacrifice(h) && hp >= Math.max(3, g.maxHp(h) - 1) && otherReady === 0 && safe && !CARDS[atk.card.defId].fx.drain;
    return { type: 'attack', cardUid: atk.card.uid, targetId: atk.target.id, boosts: atk.boosts, ...(sacrifice ? { sacrifice: true } : {}) };
  }

  /** Bônus por terminar a ativação neste Espaço (Arena, entrega da escolta). */
  private endBonus(g: Game, h: Unit, c: Cell): number {
    // ficar no Espaço de um objetivo do adversário impede que ele cumpra a Missão ali ("sem Inimigos no Espaço")
    const deny = this.denyW() * (this.threats(g, h.guild!).cells.get(key(c)) ?? 0);
    const enemyHere = g.unitsAt(c).some(u => u.id !== h.id && g.isEnemy(h, u));
    if (enemyHere) return deny;
    let v = deny;
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

  private bestAttack(g: Game, h: Unit, from: Cell): { card: CardInst; target: Unit; value: number; boosts: string[]; killP: number } | null {
    let best: { card: CardInst; target: Unit; value: number; boosts: string[]; killP: number } | null = null;
    const saved = h.cell;
    h.cell = from;
    const guild = g.guild(h.guild!);
    const barrierClosed = !!g.map.barrier && !g.passesBarrier(h);
    try {
      for (const card of g.usableCards(h)) {
        if (card.exhausted) continue;
        const def = CARDS[card.defId];
        if (def.kind !== 'attack') continue;
        // ampliações: com as que ferem o próprio Herói e sem elas (escolhe a melhor, pagando o Ferimento)
        const allBoosts = this.pickBoosts(g, h, card);
        const woundOf = (ids: string[]) => ids.reduce((s, id) => { const c = h.cards.find(x => x.uid === id); const d = c && CARDS[c.defId]; return s + (d ? (d.fx.selfWound ?? 0) + (d.kind === 'permanent' ? d.fx.grrr ?? 0 : 0) : 0); }, 0);
        const safeBoosts = allBoosts.filter(id => woundOf([id]) === 0);
        const boostSets = woundOf(allBoosts) ? [allBoosts, safeBoosts] : [allBoosts];
        for (const t of g.attackTargets(h, card, from)) for (const boosts of boostSets) {
          const selfCost = woundOf(boosts) * (1.4 + (g.maxHp(h) - h.wounds <= 3 ? 1 : 0));
          let dice = g.attackDicePreview(h, card, t, boosts).dice;
          if (g.ab(h) === 'maestria_arco' && def.group === 'Arco') dice += 0.2;
          if (def.fx.critExtra) dice += def.fx.critExtra * 0.2;
          if (g.ab(h) === 'mestre_espadachim' && def.group === 'Espada' && !h.spent) dice += 2;
          const pierce = g.piercing(h, card);
          const rem = g.maxHp(t) - t.wounds;
          const tdef = g.defenseDice(t, h, def.attackType);
          let exp = Math.max(0, dice * ATK_EXP(def.attackType!) - (pierce ? 0 : tdef * DEF_EXP));
          let killP = Math.max(0, Math.min(1, (exp - rem + 1.2) / 2));
          if (this.hard) ({ killP, exp } = exactAttack(dice, def.attackType!, pierce ? 0 : tdef, rem));
          let killBonus = 0;
          let pvpDone = false;
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
            // ainda sem Missão do mapa: os Monstros dela valem mais (Missão + item/Título)
            if (this.needPve(g, guild.id) && (wantType || wantKills)) killBonus += 4;
            // Vilões: quem fere também ganha a recompensa
            if (md.category.startsWith('Vilão')) killBonus += Math.min(exp, rem) * 0.4;
            // Monstro em cima de um marcador de Missão que a Guilda quer: matá-lo libera o caminho
            if (g.floorAt(t.cell!).some(x => x.type === 'missao' && (g.missionTokenWanted(guild.id, x) || g.tokenMission(x)?.rule === 'arena'))) killBonus += 4;
            // guarda um marcador de Missão (está Perto dele): matá-lo abre o caminho
            else if (this.p.guardKill && near(g, t.cell!).some(c => g.floorAt(c).some(x => x.type === 'missao' && x.faceUp && g.missionTokenWanted(guild.id, x)))) killBonus += this.p.guardKill;
            // ferir o Monstro-alvo da Missão já é progresso (Lorde Presas tem muita Vida)
            if (wantType) progress = Math.min(exp, rem) * (rem > 6 ? 2.2 : 1.2);
            if (exp < md.exterm) retaliation += Math.max(0, md.dice * ATK_EXP(md.attackType) - g.defenseDice(h) * DEF_EXP) * 0.8;
          } else {
            const pvp = `matar_${t.guild}`;
            const pvpOpen = g.s.missions.some(m => m.id === pvp) && !guild.missions.includes(pvp);
            // ainda sem Missão do mapa: brigar vale menos que correr atrás dela
            killBonus = (g.map.pvp === false ? 1 : 2) + (pvpOpen ? (this.needPve(g, guild.id) ? this.p.pvpNeedPve : 5) : 0);
            // alianças temporárias: derrubar quem está ganhando vale mais; quem está atrás, menos
            const lf = this.leaderFactor(g, guild.id, t.guild!);
            killBonus *= lf;
            // quem carrega marcador de Missão: matá-lo atrapalha o adversário (e rouba o marcador)
            const carrier = t.tokens.some(x => x.type === 'missao');
            if (this.hard && carrier) killBonus += 4;
            // Missão contra essa Guilda já cumprida: matar de novo vale pouco
            if (!pvpOpen && !carrier) { pvpDone = true; killBonus = Math.min(killBonus, this.p.pvpDoneKill); }
            // está quase cumprindo uma Missão (Arena, escolta, Tomos, marcador): derrubá-lo atrapalha
            const thr = this.denyW() * (this.threats(g, h.guild!).heroes.get(t.id) ?? 0);
            if (thr) { killBonus += thr; progress += Math.min(exp, rem) * thr * 0.25; }
          }
          const targetsCloseMonster = t.kind === 'monster' && g.board.isClose(t.cell!, from);
          if (!targetsCloseMonster) retaliation += this.alertRisk(g, h, from);
          const hp = g.maxHp(h) - h.wounds;
          const deathRisk = retaliation >= hp ? 5 * (1 - 0.6 * this.aggr) : 0;
          retaliation *= 1 - 0.5 * this.aggr;
          killBonus *= 1 + this.aggr;
          // sem Missões contra Jogador (Templo): brigar com Heróis só vale para abrir caminho
          const dmgWeight = (t.kind === 'hero' && g.map.pvp === false ? 0.3 : 1) * (pvpDone ? this.p.pvpDoneDmg : 1);
          const ab = g.ab(h);
          const selfHeal = def.fx.drain || (ab === 'ritual_sangue' && def.magic) || (ab === 'lamina_sugadora' && ['Espada', 'Machado', 'Lança'].includes(def.group))
            || (ab === 'devorar' && killP > 0.3);
          const lfDmg = t.kind === 'hero' ? this.leaderFactor(g, guild.id, t.guild!) : 1;
          const value = Math.min(exp, rem) * (1 + this.aggr) * dmgWeight * lfDmg + progress + killP * killBonus - retaliation - deathRisk + (selfHeal ? Math.min(exp, h.wounds) * 0.6 : 0) - selfCost;
          if (!best || value > best.value) best = { card, target: t, value, boosts, killP };
        }
      }
    } finally {
      h.cell = saved;
    }
    return best;
  }

  /** Cautela com Reações de Alerta. No Confronto Final (1 Missão decide: matar o chefe cercado de Monstros)
   *  a cautela atrapalha — ninguém encara o chefe e a partida trava —, então fica bem menor. */
  private riskW(g: Game) { return g.s.missionsToWin <= 1 ? Math.min(this.p.riskW, 1.4) : this.p.riskW; }
  private stayW(g: Game) { return g.s.missionsToWin <= 1 ? 0 : this.p.stayW; }

  /** Alerta de terminar em `c` (para o próximo turno): o Monstro-alvo de uma Missão não conta (ficar colado nele é o objetivo)
   *  e, se houver um alvo de Missão ali, os outros pesam menos (ex.: Lorde Presas cercado pelas Irmãs no Templo). */
  private stayRisk(g: Game, h: Unit, c: Cell): number {
    const guild = h.guild!;
    const targets = new Set(g.s.missions.filter(mi => (mi.rule === 'kill_type' || mi.rule === 'summon') && !this.done(g, guild, mi)).flatMap(mi => mi.types ?? []));
    const near = g.monstersCloseTo(c);
    const hasTarget = near.some(m => targets.has(m.defId.replace(/\d+$/, '')));
    let r = 0;
    for (const m of near) {
      if (targets.has(m.defId.replace(/\d+$/, ''))) continue;
      const md = MONSTERS[m.defId];
      r += Math.max(0.15, md.dice * ATK_EXP(md.attackType) - g.defenseDice(h) * DEF_EXP);
    }
    return hasTarget ? r * 0.4 : r;
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
    // Lápide: vale passar por ela para revelar depois
    const tomb = g.tombAt(c) && g.maxHp(h) - h.wounds >= 2 ? 1.6 : 0;
    const toks = g.floorAt(c);
    if (!toks.length) return tomb;
    if (g.unitsAt(c).some(u => g.isEnemy(h, u))) return 0;
    const deadly = g.map.deadlyTokens && !(g.map.fireProtectTitle && g.hasTitle(h.guild!, g.map.fireProtectTitle));
    let v = 0;
    for (const t of toks) {
      if (t.type === 'missao' && t.faceUp) {
        if (!g.missionTokenWanted(h.guild!, t)) continue;
        const m = g.tokenMission(t);
        if (m?.rule === 'summon') { v += g.maxHp(h) - h.wounds >= 3 ? 5 : 1; continue; }
        v += this.p.missionTok + (this.needPve(g, h.guild!) ? 4 : 0);
      } else if (!t.faceUp && deadly) v -= this.hard ? 8 : 2; // Templo: Armadilha mata
      else v += 1.3 + (t.faceUp ? 0 : this.hiddenChance(g) * this.p.missionTok * this.p.hiddenW);
    }
    return v;
  }

  /** Força da defesa: cai quando a Guilda passa muitos turnos sem progresso (duas IAs se bloqueando não travam a partida). */
  private denyW(): number { return this.p.denyW * (this.idle > 10 ? 0.15 : this.idle > 6 ? 0.5 : 1); }

  /** Radar de ameaças: onde e quem dos adversários está perto de cumprir uma Missão.
   *  cells: Espaços onde a presença de um Herói desta Guilda impede a Missão; heroes: quem derrubar.
   *  Vale o dobro contra quem está a 1 Missão da vitória. Calculado uma vez por situação do tabuleiro. */
  private thrCache: { k: string; v: { cells: Map<string, number>; heroes: Map<string, number> } } | null = null;
  /** Lápide: ativa o Monstro que alcança o Herói Inimigo mais ferido e ataca. */
  private puppet(g: Game): AIAction {
    const p = g.s.puppet!;
    const by = g.unit(p.by);
    const foe = (id: string) => g.isEnemy(by, g.unit(id));
    if (!p.monsterId) {
      const mons = g.puppetCandidates(p.cat);
      const best = mons.find(m => g.heroesInReach(m).some(u => foe(u.id))) ?? mons[0];
      return { type: 'puppetPick', monsterId: best.id };
    }
    const o = g.puppetOptions();
    let pick: { cell: string; t: string; score: number } | null = null;
    for (const [k, ids] of o?.targets ?? []) for (const id of ids) {
      if (!foe(id)) continue;
      const u = g.unit(id);
      const score = u.wounds / Math.max(1, g.maxHp(u)) + u.tokens.filter(x => x.type === 'missao').length;
      if (!pick || score > pick.score) pick = { cell: k, t: id, score };
    }
    if (!pick) return { type: 'puppet', dest: null, targetId: null };
    const m = g.unit(p.monsterId);
    const [c, r] = pick.cell.split(',').map(Number);
    return { type: 'puppet', dest: m.cell && m.cell.c === c && m.cell.r === r ? null : { c, r }, targetId: pick.t };
  }

  threats(g: Game, me: GuildId): { cells: Map<string, number>; heroes: Map<string, number> } {
    const k = `${me}|${g.s.turn}|${g.s.current}|${g.onBoard().filter(u => u.kind === 'hero').map(u => `${u.id}${u.cell!.c},${u.cell!.r}${u.tokens.length}`).join(';')}|${Object.keys(g.s.floor).length}|${JSON.stringify(g.s.arena ?? {})}`;
    if (this.thrCache?.k === k) return this.thrCache.v;
    const cells = new Map<string, number>(), heroes = new Map<string, number>();
    const add = (m: Map<string, number>, id: string, v: number) => m.set(id, Math.max(m.get(id) ?? 0, v));
    const dist = (a: Cell, b: Cell) => Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
    for (const eg of g.guilds()) {
      if (eg.id === me) continue;
      // urgente: o adversário está a 1 Missão de vencer (aí vale atrapalhar qualquer Missão dele)
      const close = eg.missions.length >= g.s.missionsToWin - 1 ? 2 : 1;
      const urgent = close === 2;
      if (!urgent && this.p.denyUrgentOnly) continue;
      const foes = g.heroesOf(eg.id).filter(f => f.alive && f.cell);
      const near = (c: Cell, n: number) => foes.filter(f => dist(f.cell!, c) <= n);
      for (const m of g.s.missions) {
        if (m.kind !== 'pve' || this.done(g, eg.id, m)) continue;
        if (m.rule === 'arena') {
          const list = g.s.arena?.[eg.id] ?? [];
          const total = g.map.missionMarkers.length;
          const prog = Math.max(list.length / 5, new Set(list).size / Math.max(1, total));
          for (const mm of g.map.missionMarkers) {
            const nf = near(mm.cell, 3);
            if (!nf.length) continue;
            // Arena no começo não preocupa; perto de completar (ou adversário a 1 Missão da vitória), sim
            if (!urgent && prog < 0.5) continue;
            const fresh = !list.includes(key(mm.cell));
            const v = (2 + prog * 9) * close * (fresh || list.length >= 3 ? 1 : 0.6);
            add(cells, key(mm.cell), v);
            for (const f of nf) if (sameCell(f.cell, mm.cell)) add(heroes, f.id, v);
          }
        } else if (m.rule === 'escort') {
          for (const f of foes) if (f.tokens.some(t => t.type === 'missao' && g.tokenMission(t)?.id === m.id)) {
            const dests = g.escortTargets(m, eg.id).filter(c => dist(f.cell!, c) <= (urgent ? 6 : 3));
            if (!dests.length && !urgent) continue;
            add(heroes, f.id, 6 * close);
            for (const c of dests) add(cells, key(c), 6 * close);
          }
        } else if (m.rule === 'carry') {
          // Tomos: quem já tem 1 está a um passo
          for (const f of foes) { const n = f.tokens.filter(t => t.type === 'missao').length; if (n && (urgent || n + 1 >= (m.count ?? 2))) add(heroes, f.id, (3 + 3 * n) * close); }
        } else if (m.rule === 'collect_any' || m.rule === 'collect_own' || m.rule === 'step_on') {
          for (const [kc, toks] of Object.entries(g.s.floor)) for (const t of toks) {
            if (t.type !== 'missao' || !t.faceUp || g.tokenMission(t)?.id !== m.id || !g.missionTokenWanted(eg.id, t)) continue;
            const c = parseKey(kc);
            const nf = near(c, urgent ? 3 : 2);
            if (!nf.length) continue;
            add(cells, kc, 5 * close);
            for (const f of nf) add(heroes, f.id, 2.5 * close);
          }
        }
      }
    }
    const v = { cells, heroes };
    this.thrCache = { k, v };
    return v;
  }

  /** Chance de um marcador virado ser uma Missão escondida (Pátio da Universidade), contando só o que se vê. */
  private hiddenChance(g: Game): number {
    const hidden = g.map.hiddenMissions?.length ?? 0;
    if (!hidden) return 0;
    const all = Object.values(g.s.floor).flat();
    const down = all.filter(t => !t.faceUp).length;
    const found = all.filter(t => t.type === 'missao' && t.faceUp && g.map.hiddenMissions!.includes(t.color ?? '')).length
      + g.units().reduce((n, u) => n + u.tokens.filter(t => t.type === 'missao' && g.map.hiddenMissions!.includes(t.color ?? '')).length, 0);
    return down ? Math.max(0, hidden - found) / down : 0;
  }

    /** Quanto mais perto de objetivos, melhor. */
  private positionValue(g: Game, h: Unit, c: Cell, goals: Map<string, number>): number {
    const d = goals.get(key(c));
    const hp = g.maxHp(h) - h.wounds;
    let v = d === undefined ? -6 : -d * this.p.posW;
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
          // marcador virado para baixo: a IA não sabe o que é (como um jogador)
          if (t.type === 'missao' && t.faceUp) {
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
            push({ c, r }, this.needPve(g, guildId) ? -5 : -3);
            continue;
          }
          const deadly = g.map.deadlyTokens && !(g.map.fireProtectTitle && g.hasTitle(guildId, g.map.fireProtectTitle));
          if (deadly && !t.faceUp) continue;
          // marcador virado num mapa com Missões escondidas: atrai conforme a chance de ser uma
          push({ c, r }, t.faceUp ? 0 : -3 * this.p.hiddenW * this.hiddenChance(g));
        }
      }
      // atrapalhar: os Espaços onde um adversário está quase cumprindo uma Missão atraem a Guilda
      if (this.p.denyW) for (const [k, v] of this.threats(g, guildId).cells) push(parseKey(k), -Math.min(8, v * this.denyW() * 0.6));
      // Esconderijo do Troll (só quem tem o Título)
      if (g.map.hideout && g.map.lockTitle && !g.s.hideoutTaken && g.hasTitle(guildId, g.map.lockTitle)) for (const c of g.map.hideout.cells) push(c, -3);
      // Monstros-alvo de Missão puxam a Guilda com força
      const collectPending = g.s.missions.some(mi => ['collect_any', 'collect_own', 'escort', 'arena'].includes(mi.rule ?? '') && !this.done(g, guildId, mi));
      const pull = collectPending ? (this.needPve(g, guildId) ? -2.5 : -1) : -6;
      const targets = new Set(g.s.missions.filter(mi => (mi.rule === 'kill_type' || mi.rule === 'summon') && !this.done(g, guildId, mi)).flatMap(mi => mi.types ?? []));
      const barrierClosed = !!g.map.barrier && !!someone && !g.passesBarrier(someone);
      for (const u of g.onBoard()) {
        if (u.kind === 'monster' && targets.has(u.defId.replace(/\d+$/, '')) && !barrierClosed) for (const n of near(g, u.cell!)) push(n, pull);
        // Templo com a barreira fechada: Monstros = moedas
        if (u.kind === 'monster') for (const n of near(g, u.cell!)) push(n, barrierClosed ? -1.5 : 0.5);
        if (u.kind === 'hero' && u.guild !== guildId) {
          const weak = g.maxHp(u) - u.wounds <= 2 || u.tokens.some(t => t.type === 'missao');
          // Missão contra essa Guilda já cumprida: os Heróis dela só atraem se carregam marcador de Missão
          const pvpOpen = g.s.missions.some(m => m.id === `matar_${u.guild}`) && !g.guild(guildId).missions.includes(`matar_${u.guild}`);
          if (!pvpOpen && !u.tokens.some(t => t.type === 'missao') && !this.p.pvpDoneAttract) continue;
          // alianças temporárias: os Heróis de quem está ganhando atraem; os de quem está atrás, não
          const lead = this.leaderFactor(g, guildId, u.guild!);
          for (const n of near(g, u.cell!)) push(n, lead >= 1.4 ? (weak ? -2 : -0.5) : this.hard && weak ? -1 : 0.3);
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
    const tokens = this.restTokens(g, guild);
    if (!dead.length) return tokens ? { tokens } : undefined;
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
    return { resurrect: out, ...(tokens ? { tokens } : {}) };
  }

  /** Descanso: reorganiza os marcadores (não de Missão) — Baús de Tesouro e Revigorante com o Herói mais seguro
   *  (mais Vida, longe dos Inimigos), a Cura com o mais ferido. Assim não se perde nada se alguém morrer. */
  private restTokens(g: Game, guild: GuildId): Record<string, string[]> | undefined {
    const heroes = g.heroesOf(guild);
    const all = heroes.flatMap(h => h.tokens.filter(t => t.type !== 'missao'));
    if (all.length < 1 || heroes.length < 2) return undefined;
    const canHold = heroes.filter(h => h.alive || g.resurrectCells(h).length);
    if (!canHold.length) return undefined;
    // morto ressuscita com a Vida cheia (Descanso); vivo fica com os Ferimentos
    const hpAfter = (h: Unit) => h.alive ? g.maxHp(h) - h.wounds : g.maxHp(h);
    const safety = (h: Unit) => hpAfter(h) + g.defenseDice(h) * 0.5 - (h.alive && h.cell ? this.heroThreatDmg(g, h, h.cell) * 0.7 : 0);
    const safest = canHold.slice().sort((a, b) => safety(b) - safety(a))[0];
    const wounded = canHold.filter(h => h.alive && h.wounds > 0).sort((a, b) => b.wounds - a.wounds)[0];
    const out: Record<string, string[]> = Object.fromEntries(heroes.map(h => [h.id, [] as string[]]));
    for (const t of all) {
      const to = t.type === 'cura' && wounded ? wounded : safest;
      out[to.id].push(t.id);
    }
    // nada mudou: não precisa reorganizar
    const same = heroes.every(h => JSON.stringify(h.tokens.filter(t => t.type !== 'missao').map(t => t.id).sort()) === JSON.stringify(out[h.id].slice().sort()));
    return same ? undefined : out;
  }
}

// ------------------------------------------------------------------ escolhas fora da partida (campanha)

/** Força de cada Herói para a IA (habilidade + atributos). */
export const HERO_TIER: Record<string, number> = {
  maya: 9, seth: 8.5, diva: 8.5, grom: 8, casacaverde: 8, hobsbawm: 7.5,
  escarlate: 7.5, zazu: 7, johan: 7, vapor: 7, espetado: 6.5, kanga: 6.5,
  // Heróis extras
  x_the_heartless: 8, x_surprised_faceless: 7.5, x_lilith: 7.5, x_frowny_faceless: 7.5, x_prince_aaron: 7.5, x_sonja: 7.5,
  x_chooloo: 7, x_the_nameless: 7, x_hassan: 7, x_lydia: 7, x_mittens: 7, x_leeroy: 7, x_aeric: 7, x_smiley_faceless: 7,
  x_serious_faceless: 7, x_tomrick: 7, x_viktor: 7, x_mchammer: 7, x_haldor: 6.5, x_nibbles: 7, x_black_newt: 6.5,
  x_bowie: 7, x_pluck: 6.5, x_elysia: 7, x_brenna: 7, x_yun: 6.5, x_sting: 6.5, x_montoya: 7, x_morgan: 6, x_pigsy: 6.5,
  x_tiaret: 6.5, x_king_of_thieves: 6.5, x_queen_of_beggars: 6, x_zahra: 6, x_koba: 6, x_lord_fang: 6.5, x_monkey_king: 6.5,
  x_monkey_queen: 6, x_hitch: 6, x_farfalla: 6, x_bob: 6,
};
const RANGED = new Set(['maya', 'seth', 'casacaverde', 'hobsbawm', 'johan', 'x_bowie', 'x_pluck', 'x_lilith', 'x_surprised_faceless', 'x_frowny_faceless',
  'x_serious_faceless', 'x_smiley_faceless', 'x_tomrick', 'x_the_nameless', 'x_morgan', 'x_tiaret', 'x_bob', 'x_chooloo']);
const TANK = new Set(['diva', 'grom', 'espetado', 'johan', 'escarlate', 'x_aeric', 'x_haldor', 'x_mchammer', 'x_nibbles', 'x_sting', 'x_montoya', 'x_the_nameless', 'x_tiaret']);

/** Escolha de Herói no recrutamento: força + equilíbrio da Guilda (alcance e resistência). */
export function pickHero(hand: string[], have: string[], level: AILevel, rnd: () => number): string {
  const score = (h: string) => {
    // força: o rating da comunidade (ref/wiki/rating-heroes.csv), ou a estimativa da IA
    let s = (HEROES[h].rating ?? HERO_TIER[h] ?? 6) + (HEROES[h].implemented === false ? -3 : 0);
    if (!have.some(x => RANGED.has(x)) && RANGED.has(h)) s += level === 'hard' ? 1.5 : 0.8;
    if (!have.some(x => TANK.has(x)) && TANK.has(h)) s += level === 'hard' ? 1.2 : 0.6;
    if (have.filter(x => RANGED.has(x)).length >= 2 && RANGED.has(h)) s -= 1;
    return s + (rnd() - 0.5) * (level === 'hard' ? 0.3 : 0.9);
  };
  return hand.slice().sort((a, b) => score(b) - score(a))[0];
}

/** Quanto a carta combina com o Herói (Mágica com magos, Arco com o arqueiro, Espada com Jøhan…). */
export function cardFit(hero: string, id: string): number {
  const d = CARDS[id];
  const ab = HEROES[hero]?.ability;
  if (!d) return 0;
  const MAGIC = ['dominio_magia', 'magia_perfurante', 'ritual_sangue', 'feitico_tenaz', 'feitico_pressa', 'feitico_trapaceiro', 'feitico_banshee', 'mente_brilhante', 'sorte_apostador', 'aura_mistica', 'zas_tras'];
  if (d.magic) return MAGIC.includes(ab ?? '') ? 2.2 : ab === 'bencao' ? 1.8 : 0.6;
  if (d.group === 'Arco') return ab === 'maestria_arco' || ab === 'bate_corre' ? 2.2 : ab === 'tiro_explosivo' ? 1.6 : 0.7;
  if (d.group === 'Espada') return ab === 'arremesso' || ab === 'ataque_cardiaco' || ab === 'mestre_espadachim' ? 2 : ab === 'lamina_sugadora' ? 1.6 : 1;
  if ((d.group === 'Lança' || d.group === 'Arremesso') && ab === 'arremesso_selvagem') return 2;
  if (d.kind === 'attack' && d.attackType === 'ranged') return ab === 'tiro_explosivo' ? 1.6 : 1;
  if (d.kind === 'attack' && d.attackType === 'melee') return ['furia', 'apunhalar', 'oportunista', 'frenesi', 'contagem_corpos', 'briga', 'lamina_sugadora'].includes(ab ?? '') ? 1.4 : 1;
  if (d.defBonus || d.hpBonus) return HEROES[hero].defense <= 2 ? 1.3 : 1;
  return 1;
}
