import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { applyAction } from '../../../src/engine/actions';
const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 5, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'] }, { guild: 'vermelho', controller: 'human', heroes: ['vapor', 'seth', 'diva'] }] });
g.drain();
// porta fechada: monstro de um lado, Herói do outro
const d = g.s.doors.find(x => !x.open && !x.locked)!;
const m = g.units().find(u => u.kind === 'monster' && u.alive)!;
for (const u of g.units()) if (u.kind === 'monster' && u !== m) { u.alive = false; u.cell = null; }
const h = g.heroesOf('azul')[0];
for (const u of g.units()) if (u.kind === 'hero' && u !== h) { u.alive = false; u.cell = null; }
m.cell = { ...d.a }; h.cell = { ...d.b };
g.s.pending = { monsterId: m.id, heroId: h.id, controller: 'vermelho', dying: [] } as never;
console.log('portas perto:', g.vengeanceDoors(), 'porta', d.id);
const before = g.vengeanceOptions([]); const after = g.vengeanceOptions([d.id]);
console.log('ataca do lugar sem abrir?', before!.attackFrom.has(`${m.cell.c},${m.cell.r}`), '| abrindo?', after!.attackFrom.has(`${m.cell.c},${m.cell.r}`), '| porta continua fechada (simulação)?', !d.open);
const ok = applyAction(g, 'vermelho', { type: 'vengeance', dest: null, attack: true, doors: [d.id] });
console.log('aplicou', ok, 'porta aberta', d.open, 'eventos', g.drain().map(e => e.t).join(','));
