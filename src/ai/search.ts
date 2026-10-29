import { Game } from '../engine/game';
import { applyAction } from '../engine/actions';
import { nextRandom } from '../engine/rng';
import type { GameState, GuildId, Token } from '../engine/types';
import { SimpleAI, type AIAction, type AIParams, type Plan } from './ai';

// Busca por simulação (Monte Carlo): antes de escolher qual Herói ativar, a IA copia a partida e testa os melhores
// planos da IA comum. Para cada plano, joga o resto do turno e a resposta de todos os adversários várias vezes
// (dados sorteados, a IA comum jogando por todos) e fica com o plano que deixou a Guilda em melhor situação na média.
// Não trapaceia: nas cópias os dados vêm de outra semente e os marcadores virados para baixo são embaralhados.

export interface SearchOpts {
  /** Tempo máximo de busca por escolha de ativação (ms). */
  timeMs: number;
  /** Simulações mínimas por plano antes de descartar os piores. */
  minSamples: number;
  /** Planos candidatos por Herói / no total. */
  perHero: number;
  total: number;
  /** Pesos da avaliação do tabuleiro. */
  w: EvalWeights;
}

export interface EvalWeights {
  win: number; mission: number; nearWin: number; token: number; hp: number; alive: number; exhausted: number;
  coin: number; kill: number; pos: number; next: number; prior: number;
  /** Cada Ferimento que a Guilda causa num Monstro-alvo de Missão (Troll, Irmãs, Minotauro...) durante a simulação. */
  boss: number;
  /** Peso da nota que a IA comum deu ao plano (objetivos de longo prazo que a simulação curta não vê). */
  plan: number;
}

export const EVAL_W: EvalWeights = { win: 400, mission: 40, nearWin: 12, token: 9, hp: 1.2, alive: 5, exhausted: 0.6, coin: 0.35, kill: 2, pos: 0.25, next: 0.3, prior: 0.15, boss: 3, plan: 0.5 };

export const SEARCH_OPTS: SearchOpts = { timeMs: 1500, minSamples: 6, perHero: 3, total: 7, w: EVAL_W };

/** Cópia da partida para simular, sem informação escondida: outra semente para os dados e os marcadores virados
 *  (e o baralho de Recompensas) embaralhados entre si. */
export function determinize(g: Game, seed: number): Game {
  const s: GameState = JSON.parse(JSON.stringify(g.s));
  const rs = { rng: seed | 0 };
  for (let i = 0; i < 4; i++) nextRandom(rs);
  s.rng = Math.floor(nextRandom(rs) * 2 ** 31);
  const shuffleIn = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(nextRandom(rs) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } };
  // marcadores virados: troca o conteúdo entre os do mesmo grupo (exploração x Missão escondida), mantendo os lugares
  const groups = new Map<string, Token[]>();
  for (const toks of Object.values(s.floor)) for (const t of toks) {
    if (t.faceUp) continue;
    const k = t.id.replace(/\d+.*$/, '');
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  for (const list of groups.values()) {
    const contents = list.map(t => ({ type: t.type, value: t.value, color: t.color }));
    shuffleIn(contents);
    list.forEach((t, i) => { t.type = contents[i].type; t.value = contents[i].value; t.color = contents[i].color; });
  }
  shuffleIn(s.rewardDeck);
  return new Game(g.map, s);
}

/** Situação de uma Guilda (quanto maior, melhor). */
function guildScore(g: Game, gid: GuildId, w: EvalWeights, judge: SimpleAI): number {
  const gs = g.guild(gid);
  if (g.s.winner === gid) return w.win;
  let v = gs.missions.length * w.mission;
  if (gs.missions.length >= g.s.missionsToWin - 1 && g.s.missionsToWin > 1) v += w.nearWin;
  const killMission = g.s.missions.some(m => m.rule === 'kill_count' && !gs.missions.includes(m.id));
  if (killMission) v += gs.monsterKills * w.kill;
  v += g.wealth(gid) * w.coin;
  for (const h of g.heroesOf(gid)) {
    v -= h.cards.filter(c => c.exhausted).length * w.exhausted;
    v += h.tokens.filter(t => t.type === 'missao' && g.missionTokenWanted(gid, t)).length * w.token;
    if (!h.alive || !h.cell) continue;
    v += w.alive + (g.maxHp(h) - h.wounds) * w.hp;
    v += judge.positionOf(g, h) * w.pos;
  }
  return v;
}

/** Avaliação do ponto de vista de `me`: a própria situação menos a dos adversários (o mais forte pesa mais). */
export function evaluate(g: Game, me: GuildId, w: EvalWeights, judge: SimpleAI): number {
  if (g.s.winner) return g.s.winner === me ? w.win : -w.win;
  const mine = guildScore(g, me, w, judge);
  const others = g.s.guildOrder.filter(x => x !== me).map(x => guildScore(g, x, w, judge));
  if (!others.length) return mine;
  const max = Math.max(...others), avg = others.reduce((a, b) => a + b, 0) / others.length;
  return mine - 0.6 * max - 0.4 * avg;
}

/** Monstro `defId` é alvo de uma Missão "Matar" que a Guilda ainda não cumpriu? */
function wanted(g: Game, gid: GuildId, defId: string): boolean {
  const base = defId.replace(/\d+$/, '');
  return g.s.missions.some(m => (m.rule === 'kill_type' || m.rule === 'summon') && m.types?.includes(base)
    && !(g.s.missionDone[m.id] ?? []).includes(gid) && !(m.maxCompletions && (g.s.missionDone[m.id] ?? []).length >= m.maxCompletions));
}

/** Joga numa cópia: o plano `plan` (null = Descansar) para `me` e depois todos os outros até a vez de `me` voltar. */
function rollout(g0: Game, me: GuildId, plan: Plan | null, seed: number, params: Partial<AIParams>, mem: ReturnType<SimpleAI['memory']>, w: EvalWeights): number {
  const g = determinize(g0, seed);
  let x = (seed * 2654435761) >>> 0;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const ais: Partial<Record<GuildId, SimpleAI>> = {};
  const aiOf = (gid: GuildId) => (ais[gid] ??= new SimpleAI('hard', rnd, params));
  const mine = aiOf(me);
  mine.setMemory(mem);
  mine.force(plan);
  const bossDmg: Partial<Record<GuildId, number>> = {};
  let left = false;
  for (let step = 0; step < 600 && !g.s.winner; step++) {
    if (g.s.pending) { g.autoResolvePending(); continue; }
    const cur = g.currentGuild().id;
    if (cur !== me) left = true;
    else if (left && !g.s.activation) break; // voltou para mim: avalia
    const a = aiOf(cur).next(g) as AIAction;
    const act = a.type === 'move' ? { ...a, openDoors: true } : a;
    if (!applyAction(g, cur, act as never)) applyAction(g, cur, { type: 'end' });
    for (const e of g.drain()) {
      if (e.t !== 'attack' || e.reason !== 'heroi') continue;
      const by = g.unit(e.attackerId).guild;
      if (!by) continue;
      for (const t of e.targets) if (t.wounds && wanted(g, by, g.unit(t.id).defId)) bossDmg[by] = (bossDmg[by] ?? 0) + t.wounds;
    }
  }
  const judge = new SimpleAI('hard', rnd, params);
  let v = evaluate(g, me, w, judge);
  // dano nos Monstros-alvo de Missão: progresso de quem bateu (a avaliação do tabuleiro não vê quem vai matar)
  const otherDmg = Object.entries(bossDmg).filter(([k]) => k !== me).map(([, n]) => n);
  v += ((bossDmg[me] ?? 0) - (otherDmg.length ? Math.max(...otherDmg) : 0)) * w.boss;
  // o que dá para fazer na próxima vez (ataque pronto, marcador ao alcance...)
  if (!g.s.winner && w.next && g.currentGuild().id === me && !g.s.activation) {
    const nxt = judge.planCandidates(g, 1, 1).chosen;
    if (nxt) v += Math.max(-5, Math.min(15, nxt.value)) * w.next;
  }
  return v;
}

export interface SearchResult { plan: Plan | null; tried: number; samples: number; scores: { label: string; mean: number; n: number }[] }

/** Escolhe a ativação da Guilda atual. `ai` é a IA de verdade dessa Guilda (a memória dela é atualizada como no `plan()`). */
export function searchTurn(g: Game, ai: SimpleAI, opts: SearchOpts = SEARCH_OPTS, params: Partial<AIParams> = {}): SearchResult {
  const me = g.currentGuild().id;
  const { chosen, cands } = ai.planCandidates(g, opts.perHero, opts.total);
  const options: (Plan | null)[] = cands.slice();
  if (g.canRest()) options.push(null);
  if (chosen && !options.some(p => p && p.heroId === chosen.heroId && JSON.stringify(p.steps) === JSON.stringify(chosen.steps))) options.unshift(chosen);
  if (options.length <= 1) return { plan: options[0] ?? chosen, tried: options.length, samples: 0, scores: [] };
  const mem = ai.memory();
  // Descansar: a IA comum descansou = vale tanto quanto o melhor plano; senão, um pouco menos
  const restValue = chosen ? Math.min(2, cands[0]?.value ?? 0) : cands[0]?.value ?? 0;
  const isChosen = (p: Plan | null) => p === chosen || (!!p && !!chosen && p.heroId === chosen.heroId && JSON.stringify(p.steps) === JSON.stringify(chosen.steps));
  const stats = options.map(p => ({ p, sum: 0, n: 0, prior: isChosen(p) ? 1 : 0, pv: Math.max(-10, Math.min(30, p ? p.value : restValue)) }));
  // média das simulações + a nota da IA comum (o plano que ela escolheria leva uma pequena vantagem: desempata o ruído)
  const mean = (s: typeof stats[number]) => (s.n ? s.sum / s.n : -Infinity) + s.prior * opts.w.prior * Math.sqrt(opts.w.win) + s.pv * opts.w.plan;
  let alive = stats.slice();
  const t0 = Date.now();
  const seedBase = (g.s.rng ^ 0x5bd1e995) >>> 0;
  let j = 0, total = 0;
  // rodadas: todos os vivos recebem as mesmas sementes (comparação justa); depois de minSamples, corta a metade pior
  while (alive.length > 1) {
    for (let r = 0; r < 2; r++, j++) {
      for (const st of alive) { st.sum += rollout(g, me, st.p, seedBase + j * 7919, params, mem, opts.w); st.n++; total++; }
      if (Date.now() - t0 > opts.timeMs) break;
    }
    if (Date.now() - t0 > opts.timeMs) break;
    if (alive[0].n >= opts.minSamples) {
      alive.sort((a, b) => mean(b) - mean(a));
      alive = alive.slice(0, Math.max(2, Math.ceil(alive.length / 2)));
      if (alive.length === 2 && alive[0].n >= opts.minSamples * 4) break;
    }
  }
  // entre os que sobraram, a melhor média
  const best = alive.reduce((a, b) => (mean(b) > mean(a) ? b : a));
  return {
    plan: best.p, tried: options.length, samples: total,
    scores: stats.map(s => ({ label: s.p ? `${s.p.heroId}:${s.p.steps.map(x => x.type).join('+')}` : 'descansar', mean: s.n ? s.sum / s.n : NaN, n: s.n })),
  };
}

/** IA com busca: igual à comum, mas a escolha de cada ativação passa pela simulação. */
export class SearchAI extends SimpleAI {
  constructor(private opts: SearchOpts = SEARCH_OPTS, private simParams: Partial<AIParams> = {}, rnd: () => number = Math.random) {
    super('hard', rnd, simParams);
  }
  last: SearchResult | null = null;
  next(g: Game): AIAction {
    if (!g.s.puppet && !g.s.activation && !g.s.pending && !g.s.winner) {
      this.last = searchTurn(g, this, this.opts, this.simParams);
      this.force(this.last.plan);
    }
    return super.next(g);
  }
}
