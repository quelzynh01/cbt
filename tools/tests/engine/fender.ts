import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Fender: sempre pergunta (mesmo com um só Inimigo Perto) — o jogador decide se usa
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const run = (answer: number) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 5, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['espada_enferrujada', 'fender'] } }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  const grom = g.heroesOf('azul')[0];
  const mons = Object.values(g.s.units).filter(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object'));
  for (const m of mons) m.cell = null;
  const spot = g.board.allCells().find(c => g.board.playable(c) && !g.board.isPillar(c) && !g.unitsAt(c).length && g.board.neighbors(c).some(n => g.board.isClose(c, n) && g.board.playable(n) && !g.unitsAt(n).length))!;
  const nb = g.board.neighbors(spot).find(n => g.board.isClose(spot, n) && g.board.playable(n) && !g.unitsAt(n).length)!;
  const [t1, t2] = mons; t1.cell = { ...spot }; t2.cell = { ...nb };
  grom.cell = { ...spot };
  g.activate(grom.id);
  let asked: { units: string[] } | null = null;
  g.choiceHook = r => { if (r.source === 'Fender') { asked = { units: r.units ?? [] }; return answer; } return r.choice === 'confirm' ? -1 : 'auto'; };
  g.rerollHook = () => 'auto';
  const card = grom.cards.find(c => c.defId === 'espada_enferrujada')!;
  g.drain();
  g.attack(card.uid, t1.id);
  const attacks = g.drain().filter(e => e.t === 'attack') as { targets: { id: string }[] }[];
  const hitT2 = attacks.some(e => e.targets.some(t => t.id === t2.id));
  return { asked: asked as { units: string[] } | null, hitT2, t2: t2.id };
};
const yes = run(0), no = run(-1);
check(!!yes.asked && yes.asked.units.length === 1 && yes.hitT2, 'um só Inimigo Perto: perguntou e, escolhendo, o Fender atingiu');
check(!!no.asked && !no.hitT2, 'um só Inimigo Perto: perguntou e, "Não usar o Fender", não atingiu');
console.log(ok ? 'FENDER SEMPRE PERGUNTA OK' : 'FALHOU');
