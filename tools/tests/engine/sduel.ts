import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { BTG_MAPS } from '../../../src/engine/maps/beyondTheGrave';
import { SimpleAI } from '../../../src/ai/ai';
import { SearchAI, SEARCH_OPTS, EVAL_W } from '../../../src/ai/search';
import { applyAction } from '../../../src/engine/actions';
import { ALL_HEROES, distributeStartingGear } from '../../../src/engine/data';

// IA com busca x IA comum: partidas espelhadas (mesma seed e Heróis, trocando quem joga com cada Guilda).
// N rodadas por mapa; MS=tempo de busca (ms); W={pesos da avaliação}; O={opções da busca}; MAP=id; SEED=n; V=1 detalha
const N = Number(process.argv[2] ?? 1);
const btg = new Set(BTG_MAPS.map(m => m.id));
const maps = Object.values(MAPS).filter(m => !btg.has(m.id) && (!process.env.MAP || m.id === process.env.MAP));
const opts = { ...SEARCH_OPTS, timeMs: Number(process.env.MS ?? 300), ...JSON.parse(process.env.O ?? '{}'), w: { ...EVAL_W, ...JSON.parse(process.env.W ?? '{}') } };
const st = { busca: { wins: 0, missions: 0, deaths: 0 }, comum: { wins: 0, missions: 0, deaths: 0 } };
let games = 0, draws = 0, searches = 0, samples = 0, changed = 0, ms = 0;
let seed = Number(process.env.SEED ?? 7000);
const t0 = Date.now();
for (let r = 0; r < N; r++) for (const map of maps) {
  const s0 = seed++;
  const res: string[] = [];
  for (const flip of [false, true]) {
    let x = s0;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const pool = ALL_HEROES.slice().sort(() => rnd() - 0.5);
    const guilds = ['azul', 'vermelho'] as const;
    const players = guilds.map((gid, i) => { const heroes = pool.slice(i * 3, i * 3 + 3); return { guild: gid, controller: 'ai' as const, heroes, cards: distributeStartingGear(heroes) }; });
    const g = Game.create(map, { seed: s0, players });
    g.drain();
    const who: Record<string, 'busca' | 'comum'> = { azul: flip ? 'comum' : 'busca', vermelho: flip ? 'busca' : 'comum' };
    const mk = (k: 'busca' | 'comum') => (k === 'busca' ? new SearchAI(opts, {}, rnd) : new SimpleAI('hard', rnd));
    const ais: Record<string, SimpleAI> = { azul: mk(who.azul), vermelho: mk(who.vermelho) };
    for (const d of g.s.deploying ?? []) { for (const p of ais[d].deployPlan(g, d)) applyAction(g, d, { type: 'place', heroId: p.heroId, cell: p.cell }); applyAction(g, d, { type: 'ready' }); }
    g.drain();
    for (let step = 0; step < 4000 && !g.s.winner; step++) {
      if (g.s.pending) { g.autoResolvePending(); continue; }
      const cur = g.currentGuild().id;
      const ai = ais[cur];
      const t1 = Date.now();
      const a = ai.next(g) as { type: string };
      if (ai instanceof SearchAI && ai.last) {
        searches++; samples += ai.last.samples; ms += Date.now() - t1;
        if (process.env.V) console.log(g.s.turn, JSON.stringify(ai.last.scores.map(s => `${s.label} ${s.mean.toFixed(1)}/${s.n}`)));
        ai.last = null;
      }
      const act = a.type === 'move' ? { ...a, openDoors: true } : a;
      if (!applyAction(g, cur, act as never)) applyAction(g, cur, { type: 'end' });
      for (const e of g.drain()) {
        if (e.t === 'death') { const u = g.unit(e.id); if (u.kind === 'hero') st[who[u.guild!]].deaths++; }
        if (e.t === 'mission') st[who[e.guild]].missions++;
      }
    }
    games++;
    if (g.s.winner) { st[who[g.s.winner]].wins++; res.push(who[g.s.winner]); } else { draws++; res.push('-'); }
  }
  console.log(`${map.id} seed ${s0}: ${res.join(' / ')}  (parcial: busca ${st.busca.wins} x ${st.comum.wins} comum)`);
}
console.log(`${games} partidas, ${draws} sem vencedor, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`buscas: ${searches}, ${(samples / Math.max(1, searches)).toFixed(0)} simulações e ${(ms / Math.max(1, searches)).toFixed(0)} ms por busca`);
for (const k of ['busca', 'comum'] as const) console.log(k.padEnd(6), JSON.stringify(st[k]));
console.log(`IA com busca venceu ${(st.busca.wins / Math.max(1, games - draws) * 100).toFixed(0)}% das partidas decididas`);
