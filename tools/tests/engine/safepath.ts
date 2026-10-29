import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { SimpleAI } from '../../../src/ai/ai';
import { applyAction } from '../../../src/engine/actions';
import { ALL_HEROES, distributeStartingGear } from '../../../src/engine/data';
import { key } from '../../../src/engine/board';

// Caminho seguro (IA): nunca mais Reações de Alerta que o caminho normal, e mesmos destinos alcançáveis.
const map = MAPS[process.env.MAP ?? 'portao-da-lua'];
let fewer = 0, same = 0, worse = 0, lost = 0, pos = 0;
const alertsOf = (g: Game, path: { cell: any; portal?: boolean }[], from: any) => { let n = 0, cur = from; for (const st of path) { if (!st.portal) n += g.monstersCloseTo(cur).length; cur = st.cell; } return n; };
for (let s = 0; s < 30; s++) {
  let x = 100 + s; const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const pool = ALL_HEROES.slice().sort(() => rnd() - 0.5);
  const players = (['azul', 'vermelho'] as const).map((gid, i) => { const heroes = pool.slice(i * 3, i * 3 + 3); return { guild: gid, controller: 'ai' as const, heroes, cards: distributeStartingGear(heroes) }; });
  const g = Game.create(map, { seed: 100 + s, players }); g.drain();
  const ais: Record<string, SimpleAI> = { azul: new SimpleAI('hard', rnd), vermelho: new SimpleAI('hard', rnd) };
  for (let step = 0; step < 300 && !g.s.winner; step++) {
    if (g.s.pending) { g.autoResolvePending(); continue; }
    if (step % 7 === 0) for (const h of g.heroesOf(g.currentGuild().id)) {
      if (!h.alive || !h.cell) continue;
      pos++;
      const a = g.reachable(h, 5, h.cell, true), b = g.reachable(h, 5, h.cell, true, false, true);
      for (const [k, n] of a) {
        if (!n.canEnd || n.prev === null) continue;
        const m = b.get(k);
        if (!m || !m.canEnd) { lost++; continue; }
        const da = alertsOf(g, g.pathTo(a, n.cell), h.cell), db = alertsOf(g, g.pathTo(b, n.cell), h.cell);
        if (db < da) fewer++; else if (db === da) same++; else worse++;
        if (key(g.pathTo(b, n.cell).at(-1)!.cell) !== k) throw new Error('caminho seguro não termina no destino');
      }
    }
    const cur = g.currentGuild().id; const act = ais[cur].next(g) as any;
    if (!applyAction(g, cur, act.type === 'move' ? { ...act, openDoors: true } : act)) applyAction(g, cur, { type: 'end' });
    g.drain();
  }
}
console.log(`${pos} posições: destinos com menos Reações ${fewer}, iguais ${same}, piores ${worse}, perdidos ${lost}`);
console.log(worse || lost ? 'CAMINHO SEGURO COM ERRO' : 'CAMINHO SEGURO OK');
