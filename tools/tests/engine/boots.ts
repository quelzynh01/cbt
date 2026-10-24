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

// Bota aos poucos e depois outra jogada (Poção de Cura do Herói ativado): o resto da Bota não vale mais
{
  const { applyAction } = await import('../../../src/engine/actions');
  const g2 = Game.create(MAPS['distrito-dos-martelos'], { seed: 3, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['vapor', 'diva', 'zazu'], cards: { diva: ['die_booten'] } },
    { guild: 'vermelho', controller: 'ai' }] });
  for (const m of Object.values(g2.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
  g2.s.deploying = [];
  const [vapor, diva] = g2.heroesOf('azul');
  vapor.cell = { c: 4, r: 3 }; diva.cell = { c: 4, r: 4 };
  vapor.wounds = 1;
  vapor.tokens.push({ id: 'pc1', type: 'cura' } as never);
  applyAction(g2, 'azul', { type: 'activate', heroId: vapor.id });
  const b2 = diva.cards.find(c => c.defId === 'die_booten')!;
  const step2 = () => { const cells = g2.bootCells(diva, b2); const to = cells.find(c => Math.abs(c.c - diva.cell!.c) + Math.abs(c.r - diva.cell!.r) === 1); return to ? applyAction(g2, 'azul', { type: 'card', heroId: diva.id, cardUid: b2.uid, cell: to }) : false; };
  const s1 = step2();
  const cure = applyAction(g2, 'azul', { type: 'token', tokenId: 'pc1' });
  const s2 = step2();
  console.log('Bota 1 passo', s1, '| Poção de Cura', cure, '| 2º passo depois da Poção (não pode)', s2);
  console.log(s1 && cure && !s2 ? 'BOTAS + POÇÃO OK' : 'FALHOU');
}
