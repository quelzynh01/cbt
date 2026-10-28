import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Pilão: se o alvo leva Ferimento, ele e todos os Inimigos Perto dele ficam Atordoados — também quando o alvo morre no golpe
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const run = (kill: boolean, dice: 'max' | 'zero' | 'normal', seed = 5) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['pilao'] } }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  g.s.debug.attackDice = dice;
  const grom = g.heroesOf('azul')[0];
  const mons = Object.values(g.s.units).filter(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object'));
  for (const m of mons) m.cell = null;
  const spot = g.board.allCells().find(c => g.board.playable(c) && !g.board.isPillar(c) && !g.unitsAt(c).length && g.board.neighbors(c).some(n => g.board.isClose(c, n) && g.board.playable(n) && !g.unitsAt(n).length))!;
  const nb = g.board.neighbors(spot).find(n => g.board.isClose(spot, n) && g.board.playable(n) && !g.unitsAt(n).length)!;
  // alvo e um Monstro no mesmo Espaço; outro Monstro no Espaço ao lado (Perto do alvo)
  // alvo: o Monstro com mais Vida (para sobreviver ferido no caso sem matar)
  mons.sort((a, b) => g.monDef(b, grom).hp - g.monDef(a, grom).hp);
  const [t1, same, side] = mons;
  t1.cell = { ...spot }; same.cell = { ...spot }; side.cell = { ...nb };
  if (kill) t1.wounds = g.monDef(t1, grom).hp - 1; else t1.wounds = 0;
  grom.cell = { ...nb };
  g.activate(grom.id);
  g.choiceHook = r => (r.choice === 'confirm' ? -1 : 'auto');
  g.rerollHook = () => 'auto';
  const card = grom.cards.find(c => c.defId === 'pilao')!;
  g.attack(card.uid, t1.id);
  g.drain();
  return { t1, same, side };
};
{
  const { t1, same, side } = run(true, 'max');
  check(!t1.alive || !t1.cell, 'o alvo morreu com o golpe');
  check(!!same.stunned, 'o Inimigo no mesmo Espaço do alvo ficou Atordoado');
  check(!!side.stunned, 'o Inimigo Perto do alvo (Espaço ao lado) ficou Atordoado');
}
{
  // dados normais: procura uma rolagem em que o alvo fica ferido e vivo
  let r = run(false, 'normal', 1);
  for (let s = 2; s < 300 && !(r.t1.alive && r.t1.cell && r.t1.wounds > 0); s++) r = run(false, 'normal', s);
  const { t1, same, side } = r;
  check(t1.alive && !!t1.stunned && !!same.stunned && !!side.stunned, 'alvo ferido e vivo: ele e os Inimigos Perto ficam Atordoados');
}
{
  const { t1, same, side } = run(false, 'zero');
  check(!t1.stunned && !same.stunned && !side.stunned, 'sem Ferimento no alvo: ninguém fica Atordoado');
}
console.log(ok ? 'PILÃO ATORDOA OK' : 'FALHOU');
