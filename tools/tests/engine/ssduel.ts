import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { BTG_MAPS } from '../../../src/engine/maps/beyondTheGrave';
import { SearchAI, SEARCH_OPTS, EVAL_W } from '../../../src/ai/search';
import { applyAction } from '../../../src/engine/actions';
import { ALL_HEROES, distributeStartingGear } from '../../../src/engine/data';

// Busca A x busca B (opções diferentes): partidas espelhadas nos mapas Clássicos.
// N rodadas por mapa; OA/OB={opções da busca, ex. {"timeMs":1200,"maxSamples":96}}; MAP=id; SEED=n
const N = Number(process.argv[2] ?? 1);
const btg = new Set(BTG_MAPS.map(m => m.id));
const maps = Object.values(MAPS).filter(m => !btg.has(m.id) && (!process.env.MAP || m.id === process.env.MAP));
const mk = (o: string | undefined) => ({ ...SEARCH_OPTS, timeMs: 300, ...JSON.parse(o ?? '{}'), w: { ...EVAL_W } });
const OA = mk(process.env.OA), OB = mk(process.env.OB);
const wins = { A: 0, B: 0 }; let games = 0, draws = 0;
const sam = { A: 0, B: 0 }, cnt = { A: 0, B: 0 };
let seed = Number(process.env.SEED ?? 30000);
for (let r = 0; r < N; r++) for (const map of maps) {
  const s0 = seed++;
  for (const flip of [false, true]) {
    let x = s0;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const pool = ALL_HEROES.slice().sort(() => rnd() - 0.5);
    const players = (['azul', 'vermelho'] as const).map((gid, i) => { const heroes = pool.slice(i * 3, i * 3 + 3); return { guild: gid, controller: 'ai' as const, heroes, cards: distributeStartingGear(heroes) }; });
    const g = Game.create(map, { seed: s0, players });
    g.drain();
    const who: Record<string, 'A' | 'B'> = { azul: flip ? 'B' : 'A', vermelho: flip ? 'A' : 'B' };
    const ais: Record<string, SearchAI> = { azul: new SearchAI(who.azul === 'A' ? OA : OB, {}, rnd), vermelho: new SearchAI(who.vermelho === 'A' ? OA : OB, {}, rnd) };
    for (const d of g.s.deploying ?? []) { for (const p of ais[d].deployPlan(g, d)) applyAction(g, d, { type: 'place', heroId: p.heroId, cell: p.cell }); applyAction(g, d, { type: 'ready' }); }
    g.drain();
    for (let step = 0; step < 4000 && !g.s.winner; step++) {
      if (g.s.pending) { g.autoResolvePending(); continue; }
      const cur = g.currentGuild().id;
      const a = ais[cur].next(g) as { type: string };
      if (ais[cur].last) { sam[who[cur]] += ais[cur].last!.samples; cnt[who[cur]]++; ais[cur].last = null; }
      if (!applyAction(g, cur, (a.type === 'move' ? { ...a, openDoors: true } : a) as never)) applyAction(g, cur, { type: 'end' });
      g.drain();
    }
    games++;
    if (g.s.winner) wins[who[g.s.winner]]++; else draws++;
  }
}
console.log(`simulações por busca: A ${(sam.A / Math.max(1, cnt.A)).toFixed(0)}, B ${(sam.B / Math.max(1, cnt.B)).toFixed(0)}`);
console.log(`DUELO ${games} partidas, ${draws} sem vencedor: A ${wins.A} (${(wins.A / Math.max(1, games - draws) * 100).toFixed(1)}%, igual seria 50%) x B ${wins.B}`);
