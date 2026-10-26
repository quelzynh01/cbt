import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Escudo das Almas: a qualquer hora do seu turno, ressuscita um Aliado como no Descanso (Área Inicial ou Perto de um Aliado; o jogador escolhe).
// Botas: o movimento delas não pega itens nem marcadores do chão.
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
const mk = (cards: Record<string, string[]>) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 4, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards }, { guild: 'vermelho', controller: 'ai' }] });
  for (const m of Object.values(g.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
  g.s.deploying = [];
  return g;
};
{
  const g = mk({ grom: ['escudo_almas'] });
  const [grom, maya, zazu] = g.heroesOf('azul');
  grom.cell = { c: 4, r: 4 };
  const area = g.map.startAreas[g.guild('azul').startArea];
  zazu.cell = g.board.playableCells().find(c => Math.abs(c.c - 4) + Math.abs(c.r - 4) >= 4 && !area.some(x => Math.abs(x.c - c.c) + Math.abs(x.r - c.r) < 3) && !g.unitsAt(c).length)!;
  maya.alive = false; maya.cell = null;
  const sh = grom.cards.find(c => c.defId === 'escudo_almas')!;
  check(!g.s.activation && !!g.activatable(grom, sh)?.ok, 'dá para usar antes de ativar um Herói (a qualquer hora do turno)');
  const cells = g.resurrectCells(maya);
  const nearZazu = cells.find(c => g.board.isClose(c, zazu.cell!) && !g.board.isClose(c, grom.cell!));
  check(!!nearZazu, `pode ressuscitar Perto de outro Aliado (não só do dono do Escudo): ${cells.length} Espaços`);
  check(g.useCard(grom.id, sh.uid, maya.id, nearZazu), 'usou o Escudo escolhendo o Espaço');
  check(maya.alive && maya.cell?.c === nearZazu!.c && maya.cell?.r === nearZazu!.r && grom.spent === true, `Maya voltou no Espaço escolhido (${nearZazu!.c},${nearZazu!.r}) e Grom ficou exausto`);
}
{
  const g = mk({ grom: ['escudo_almas'] });
  const [grom, maya] = g.heroesOf('azul');
  grom.cell = { c: 4, r: 4 };
  maya.alive = false; maya.cell = null;
  g.activate(grom.id);
  const a = g.s.activation!; a.attacked = true; a.moved = true;
  const sh = grom.cards.find(c => c.defId === 'escudo_almas')!;
  check(!!g.activatable(grom, sh)?.ok, 'também depois de o Herói do Escudo agir (andou e atacou)');
}
{
  const g = mk({ grom: ['die_booten'] });
  const [grom, maya] = g.heroesOf('azul');
  grom.cell = { c: 4, r: 4 }; maya.cell = { c: 4, r: 3 };
  g.activate(maya.id);
  const boot = grom.cards.find(c => c.defId === 'die_booten')!;
  const to = g.bootCells(grom, boot).find(c => Math.abs(c.c - 4) + Math.abs(c.r - 4) === 1)!;
  g.s.floor[`${to.c},${to.r}`] = [{ id: 'px', type: 'cura' } as never];
  check(g.useCard(grom.id, boot.uid, undefined, to), 'Bota: andou 1 Espaço');
  check(!grom.tokens.some(t => t.id === 'px') && (g.s.floor[`${to.c},${to.r}`] ?? []).some(t => t.id === 'px'), 'Bota: NÃO pegou o marcador do chão (ficou lá)');
}
console.log(ok ? 'ESCUDO DAS ALMAS E BOTAS OK' : 'FALHOU');
