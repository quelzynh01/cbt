import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { key } from '../../../src/engine/board';

// Templo, Grom: todos os Espaços de saída e todos os destinos; aviso x Reações de verdade (Monstros no lugar inicial e espalhados)
let bad = 0, checked = 0, withAlert = 0;
const map = MAPS['templo-do-amanhecer-crepuscular'];
for (let seed = 1; seed <= 4; seed++) {
  const g0 = Game.create(map, { seed, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'] }, { guild: 'vermelho', controller: 'ai' }] });
  g0.s.deploying = null;
  if (seed > 1) {
    // espalha os Monstros
    const cells = g0.board.allCells().filter(c => g0.board.playable(c) && !g0.board.isPillar(c));
    for (const m of g0.units().filter(u => u.kind === 'monster' && u.alive && u.cell)) m.cell = { ...cells[(m.id.length * 7 + seed * 13 + Number(m.id.replace(/\D/g, '')) * 5) % cells.length] };
  }
  const snap = JSON.stringify(g0.s);
  const grom = g0.heroesOf('azul')[0];
  for (const start of g0.board.allCells().filter(c => g0.board.playable(c) && !g0.board.isPillar(c))) {
    const g = new Game(map, JSON.parse(snap));
    const h = g.unit(grom.id);
    if (g.unitsAt(start).filter(u => u.id !== h.id).length >= 2) continue;
    h.cell = { ...start };
    if (!g.activate(h.id) || !g.s.activation) continue;
    const base = JSON.stringify(g.s);
    for (const [k, n] of g.reachable(h, g.s.activation.mp, h.cell!, false)) {
      if (!n.canEnd || n.prev === null) continue;
      const t = new Game(map, JSON.parse(base));
      const prev = t.alertPreview(n.cell, false).map(u => u.id);
      t.drain();
      t.moveTo(n.cell, false);
      const evs = t.drain();
      const real = evs.filter(e => e.t === 'attack').map(e => (e as { attackerId: string }).attackerId);
      const other = evs.filter(e => e.t === 'attack' && (e as { reason: string }).reason !== 'alerta');
      if (other.length && bad < 8) console.log('OUTRO ATAQUE', (other[0] as { reason: string }).reason);
      checked++;
      if (real.length) withAlert++;
      const missing = real.filter(id => !prev.includes(id));
      if (missing.length) { bad++; if (bad <= 8) console.log('SEM AVISO', seed, key(start), '->', k, 'aviso', prev.map(id => t.unit(id).defId), 'real', real.map(id => t.unit(id).defId)); }
    }
  }
}
console.log({ checked, withAlert, bad });
console.log(bad === 0 ? 'AVISO DE ALERTA (TEMPLO) OK' : 'FALHOU');
