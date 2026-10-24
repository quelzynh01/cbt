import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Empurrão (Rajada de Vento / Tiro Explosivo) não usa portal: o alvo não sai do outro lado do teletransporte
// (parar em cima do Espaço do portal pode: é um Espaço comum).
let ok = true;
for (const id of Object.keys(MAPS)) {
  const map = MAPS[id];
  if (!map.portals?.length) continue;
  const g = Game.create(map, { seed: 3, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'] },
    { guild: 'vermelho', controller: 'human', heroes: ['johan', 'kanga', 'diva'] }] });
  for (const m of Object.values(g.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
  g.s.deploying = [];
  const [grom, ...restA] = g.heroesOf('azul');
  const [t, ...restV] = g.heroesOf('vermelho');
  for (const u of [...restA, ...restV]) u.cell = null;
  for (const p of map.portals) {
    // o alvo ao lado do portal, quem empurra do outro lado
    const nb = g.board.neighbors(p.cell).filter(c => g.board.playable(c) && g.board.isClose(p.cell, c));
    if (nb.length < 2) continue;
    t.cell = { ...nb[0] }; grom.cell = { ...nb[1] };
    let cells: { c: number; r: number }[] = [];
    g.choiceHook = req => { cells = req.cells ?? []; return -1; };
    (g as unknown as { pushAway: (a: unknown, b: unknown, n: number) => void }).pushAway(t, grom, 3);
    const far = cells.filter(c => Math.max(Math.abs(c.c - nb[0].c), Math.abs(c.r - nb[0].r)) > 3);
    if (far.length) { ok = false; console.log(id, 'portal', p.cell, 'saiu do outro lado:', far); }
  }
}
console.log(ok ? 'EMPURRÃO SEM PORTAL OK' : 'FALHOU');
