import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { BTG_MAPS } from '../../../src/engine/maps/beyondTheGrave';
import { SimpleAI } from '../../../src/ai/ai';
import { applyAction } from '../../../src/engine/actions';
import { ALL_HEROES, distributeStartingGear } from '../../../src/engine/data';

// Diagnóstico da IA nos mapas Clássicos: de onde vêm os Ferimentos (Vingança, Alerta, Heróis),
// quanto ela briga com Heróis antes de ter uma Missão do mapa e em que turno sai a 1ª Missão PvE.
// sh tools/tests/run-engine.sh diag 20   (P={...} muda os pesos da IA)
const N = Number(process.argv[2] ?? 10);
const btgIds = new Set(BTG_MAPS.map(m => m.id));
const maps = Object.values(MAPS).filter(m => process.env.MAP ? m.id === process.env.MAP : !btgIds.has(m.id) && m.pvp !== false);
const G = Game.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
let reason = '';
const origMA = G.monsterAttack;
G.monsterAttack = function (this: Game, m: unknown, h: unknown, r: unknown) { const old = reason; reason = r as string; try { return origMA.call(this, m, h, r); } finally { reason = old; } };
const wounds: Record<string, number> = {};
const origDH = G.damageHero;
G.damageHero = function (this: Game, h: unknown, n: unknown, src: { kind: string }) {
  const u = h as { alive: boolean; cell: unknown };
  if (u.alive && u.cell) { const k = src.kind === 'monster' ? 'mon:' + (reason || 'outro') : src.kind; wounds[k] = (wounds[k] ?? 0) + (n as number); }
  return origDH.call(this, h, n, src);
};
const monAtk: Record<string, number> = {}, monVeng: Record<string, number> = {}, monHp: Record<string, number> = {};
let alertMoves = 0, alertDmg = 0, moves = 0;
let aggrSum = 0, aggrN = 0, aggrHi = 0;
let games = 0, turns = 0, pveTurnSum = 0, pveN = 0, noPve = 0;
const atk = { heroPre: 0, heroPost: 0, monPre: 0, monPost: 0 };
const winBy: Record<string, number> = {};
const perMap: Record<string, { n: number; t: number; pveT: number; pveN: number; no: number; hero: number; mon: number; done: Record<string, number> }> = {};
let seed = Number(process.env.SEED ?? 5000);
for (let r = 0; r < N; r++) for (const map of maps) {
  const s0 = seed++;
  let x = s0;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const pool = ALL_HEROES.slice().sort(() => rnd() - 0.5);
  const nP = map.startAreas.length >= 3 && rnd() < 0.4 ? 3 : 2;
  const guilds = (['azul', 'vermelho', 'verde'] as const).slice(0, nP);
  const players = guilds.map((gid, i) => { const heroes = pool.slice(i * 3, i * 3 + 3); return { guild: gid, controller: 'ai' as const, heroes, cards: distributeStartingGear(heroes) }; });
  const g = Game.create(map, { seed: s0, players, allHeroes: true });
  g.drain();
  const ais: Record<string, SimpleAI> = {};
  const firstPve: Record<string, number> = {};
  const pveDone = (id: string) => g.guild(id as never).missions.some(mid => g.s.missions.find(m => m.id === mid)?.kind === 'pve');
  for (let step = 0; step < 4000 && !g.s.winner; step++) {
    if (g.s.pending) { g.autoResolvePending(); continue; }
    const cur = g.currentGuild().id;
    const ai = (ais[cur] ??= new SimpleAI(process.env.LVL === 'normal' ? 'normal' : 'hard', rnd, JSON.parse(process.env.P ?? '{}')));
    const a = ai.next(g);
    if (a.type === 'activate') { const ag = (ai as unknown as { aggr: number }).aggr; aggrSum += ag; aggrN++; if (ag >= 0.5) aggrHi++; }
    if (a.type === 'attack') {
      const t = g.unit(a.targetId);
      const post = pveDone(cur);
      if (t.kind === 'hero') atk[post ? 'heroPost' : 'heroPre']++; else atk[post ? 'monPost' : 'monPre']++;
      if (!post) { const pm = (perMap[map.id] ??= { n: 0, t: 0, pveT: 0, pveN: 0, no: 0, hero: 0, mon: 0, done: {} }); if (t.kind === 'hero') pm.hero++; else pm.mon++; }
    }
    const tgt = a.type === 'attack' ? g.unit(a.targetId) : null;
    const tgtMission = tgt?.kind === 'monster' && g.s.missions.some(mi => (mi.rule === 'kill_type' || mi.rule === 'summon') && mi.types?.includes(tgt.defId.replace(/\d+$/, '')));
    const hpBefore = tgt ? g.maxHp(tgt) - tgt.wounds : 0;
    const w0 = { ...wounds };
    const act = a.type === 'move' ? { type: 'move' as const, cell: a.cell, openDoors: true } : a;
    if (!applyAction(g, cur, act as never)) applyAction(g, cur, { type: 'end' });
    g.drain();
    if (tgt?.kind === 'monster') {
      const killed = !tgt.alive;
      const k = tgtMission ? 'alvo' : killed ? 'matou' : 'nao_matou';
      monAtk[k] = (monAtk[k] ?? 0) + 1;
      monVeng[k] = (monVeng[k] ?? 0) + ((wounds['mon:vinganca'] ?? 0) - (w0['mon:vinganca'] ?? 0));
      if (!killed && !tgtMission && hpBefore) monHp[hpBefore] = (monHp[hpBefore] ?? 0) + 1;
    }
    if (a.type === 'move') { const d = (wounds['mon:alerta'] ?? 0) - (w0['mon:alerta'] ?? 0); if (d) { alertMoves++; alertDmg += d; } moves++; }
    for (const gs of g.guilds()) if (firstPve[gs.id] === undefined && pveDone(gs.id)) firstPve[gs.id] = g.s.turn;
  }
  if (!g.s.winner) continue;
  games++; turns += g.s.turn;
  const pm = (perMap[map.id] ??= { n: 0, t: 0, pveT: 0, pveN: 0, no: 0, hero: 0, mon: 0, done: {} });
  pm.n++; pm.t += g.s.turn;
  for (const [mid, gs] of Object.entries(g.s.missionDone)) pm.done[mid] = (pm.done[mid] ?? 0) + (gs as string[]).length;
  for (const gs of g.guilds()) { if (firstPve[gs.id] !== undefined) { pm.pveT += firstPve[gs.id]; pm.pveN++; } else pm.no++; }
  for (const gs of g.guilds()) { if (firstPve[gs.id] !== undefined) { pveTurnSum += firstPve[gs.id]; pveN++; } else noPve++; }
  const w = g.guild(g.s.winner as never);
  const k = w.missions.map(mid => g.s.missions.find(m => m.id === mid)?.kind).sort().join('+');
  winBy[k] = (winBy[k] ?? 0) + 1;
}
const tot = Object.values(wounds).reduce((a, b) => a + b, 0);
console.log('partidas', games, 'turnos médios', (turns / games).toFixed(1));
console.log('Ferimentos por partida:', Object.entries(wounds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / games).toFixed(1)} (${(v / tot * 100).toFixed(0)}%)`).join(', '));
console.log('ataques por partida: Herói antes da PvE', (atk.heroPre / games).toFixed(1), '| Monstro antes', (atk.monPre / games).toFixed(1), '| Herói depois', (atk.heroPost / games).toFixed(1), '| Monstro depois', (atk.monPost / games).toFixed(1));
console.log('1ª Missão PvE: turno médio', (pveTurnSum / Math.max(1, pveN)).toFixed(1), '| Guildas sem nenhuma', noPve, 'de', noPve + pveN);
console.log('aggr médio nas ativações', (aggrSum / aggrN).toFixed(2), '| ativações com aggr >= 0.5:', (aggrHi / aggrN * 100).toFixed(0) + '%');
console.log('ataques em Monstro (n / Vingança):', Object.keys(monAtk).map(k => `${k} ${monAtk[k]} / ${monVeng[k]}`).join(', '), '| Vida restante dos que não morreram:', JSON.stringify(monHp));
console.log('movimentos', moves, 'com Alerta', alertMoves, 'dano', alertDmg);
console.log('vencedores por tipo de Missão:', JSON.stringify(winBy));
for (const [k, v] of Object.entries(perMap)) console.log(k.slice(0, 24).padEnd(24), 'turnos', (v.t / v.n).toFixed(0).padStart(3), '| 1ª PvE', (v.pveT / Math.max(1, v.pveN)).toFixed(0).padStart(3), 'sem', `${v.no}/${v.no + v.pveN}`.padStart(5), '| ataques antes (Herói/Monstro)', (v.hero / v.n).toFixed(1), '/', (v.mon / v.n).toFixed(1), '|', Object.entries(v.done).map(([m, c]) => `${m}:${c}`).join(' '));
