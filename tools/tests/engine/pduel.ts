import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { BTG_MAPS } from '../../../src/engine/maps/beyondTheGrave';
import { SimpleAI } from '../../../src/ai/ai';
import { applyAction } from '../../../src/engine/actions';
import { ALL_HEROES, distributeStartingGear } from '../../../src/engine/data';

// IA comum A x B (pesos diferentes): partidas espelhadas nos mapas Clássicos. PA/PB={params}; N rodadas por mapa; MAP=id; SEED=n; PL=jogadores (2-4)
const N = Number(process.argv[2] ?? 4);
const PA = JSON.parse(process.env.PA ?? '{}'), PB = JSON.parse(process.env.PB ?? '{}');
const PL = Number(process.env.PL ?? 2);
const btg = new Set(BTG_MAPS.map(m => m.id));
const maps = Object.values(MAPS).filter(m => !btg.has(m.id) && (!process.env.MAP || m.id === process.env.MAP));
const wins = { A: 0, B: 0 }; let games = 0, draws = 0;
let seed = Number(process.env.SEED ?? 11000);
for (let r = 0; r < N; r++) for (const map of maps) {
  const s0 = seed++;
  // 2 jogadores: espelhado (A com cada Guilda); 3-4: A numa Guilda, B nas outras, girando a posição de A
  const seats = PL === 2 ? [0, 1] : Array.from({ length: PL }, (_, i) => i);
  for (const aSeat of seats) {
    let x = s0;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const pool = ALL_HEROES.slice().sort(() => rnd() - 0.5);
    const players = (['azul', 'vermelho', 'verde', 'laranja'] as const).slice(0, PL).map((gid, i) => { const heroes = pool.slice(i * 3, i * 3 + 3); return { guild: gid, controller: 'ai' as const, heroes, cards: distributeStartingGear(heroes) }; });
    const g = Game.create(map, { seed: s0, players });
    g.drain();
    const who: Record<string, 'A' | 'B'> = Object.fromEntries(players.map((p, i) => [p.guild, i === aSeat ? 'A' : 'B']));
    const ais: Record<string, SimpleAI> = Object.fromEntries(players.map(p => [p.guild, new SimpleAI('hard', rnd, who[p.guild] === 'A' ? PA : PB)]));
    for (let step = 0; step < 4000 && !g.s.winner; step++) {
      if (g.s.pending) { g.autoResolvePending(); continue; }
      const cur = g.currentGuild().id;
      const a = ais[cur].next(g) as { type: string };
      const act = a.type === 'move' ? { ...a, openDoors: true } : a;
      if (!applyAction(g, cur, act as never)) applyAction(g, cur, { type: 'end' });
      g.drain();
    }
    games++;
    if (g.s.winner) wins[who[g.s.winner]]++; else draws++;
  }
}
// com 3-4 jogadores, A ganharia 1/PL das partidas se fosse igual a B
const fair = 1 / PL;
console.log(`DUELO ${games} partidas, ${draws} sem vencedor: A ${wins.A} (${(wins.A / Math.max(1, games - draws) * 100).toFixed(1)}%, igual seria ${(fair * 100).toFixed(0)}%) x B ${wins.B}`);
