import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Die Booten (2 passos) usada aos poucos: 1 passo, depois outro; o 3º não dá.
const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 3, fixedOrder: true, players: [
  { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['die_booten'] } },
  { guild: 'vermelho', controller: 'ai' }] });
for (const m of Object.values(g.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
g.s.deploying = [];
const [grom, maya] = g.heroesOf('azul');
grom.cell = { c: 4, r: 4 }; maya.cell = { c: 4, r: 3 };
g.activate(maya.id);
const boot = grom.cards.find(c => c.defId === 'die_booten')!;
const step = () => { const cells = g.bootCells(grom, boot); const to = cells.find(c => Math.abs(c.c - grom.cell!.c) + Math.abs(c.r - grom.cell!.r) === 1); return to ? g.useCard(grom.id, boot.uid, undefined, to) : false; };
const a = step(), b = step(), c = step();
console.log('1º passo', a, '| 2º passo', b, '| 3º passo (não pode)', c);
console.log(a && b && !c ? 'BOTAS OK' : 'FALHOU');
