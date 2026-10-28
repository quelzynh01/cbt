import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { CURSES } from '../../../src/engine/cards';

// Confronto Final (Templo): a N-ésima morte do Herói compra N Maldições e ele fica com a de maior valor (entre elas e a dele); a que ocupa espaço cobre a carta escolhida.
// Grito de Guerra: o Herói ativo morre, mas a Guilda ainda pode ativar outro — o turno não acaba.
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
const mk = () => {
  const g = Game.create(MAPS['templo-do-amanhecer-crepuscular'], { seed: 7, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['espada_enferrujada', 'adaga_aparadora', 'estilingue', 'raio_nova'] } },
    { guild: 'vermelho', controller: 'ai' }] });
  for (const m of Object.values(g.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
  g.s.deploying = [];
  return g;
};
const kill = (g: Game, id: string) => { const h = g.unit(id); if (!h.cell) h.cell = { c: 4, r: 8 }; h.alive = true; h.wounds = 0; g.damageHero(h, 99, { kind: 'trap' }); return g.drain().find(e => e.t === 'curseDraw') as Extract<ReturnType<Game['drain']>[number], { t: 'curseDraw' }> | undefined; };

{
  const g = mk();
  const grom = g.heroesOf('azul')[0];
  check(!!g.s.curseDeck?.length, `baralho de Maldições criado (${g.s.curseDeck?.length} cartas)`);
  const val = (c: string) => CURSES[c].value ?? 0;
  const top = (c: string[]) => { g.s.curseDeck = [...c, ...g.s.curseDeck!.filter(x => !c.includes(x))]; };
  // 1ª morte: compra 1 (Amnésia) e fica com ela
  top(['amnesia']);
  const e1 = kill(g, grom.id);
  check(e1?.card === 'amnesia' && !e1.drawn && grom.curse === 'amnesia', '1ª morte: comprou 1 (Amnésia) e ficou com ela');
  // 2ª morte: compra 2, as duas menores que Amnésia — continua com ela
  const low = Object.keys(CURSES).filter(c => c !== 'amnesia' && val(c) < val('amnesia') && g.s.curseDeck!.includes(c)).slice(0, 2);
  top(low);
  const n2 = g.s.curseDeck!.length;
  const e2 = kill(g, grom.id);
  check(e2?.drawn?.length === 2 && low.every(c => e2.drawn!.includes(c)) && grom.curse === 'amnesia', `2ª morte: comprou 2 (${e2?.drawn?.join(', ')}) — valem menos, continua com Amnésia`);
  check(low.every(c => g.s.curseDeck!.includes(c)) && g.s.curseDeck!.length === n2, 'as 2 compradas voltaram ao baralho');
  // 3ª morte: compra 3, com Atordoado (a maior) no meio — troca e as outras (e a Amnésia) voltam
  const two = Object.keys(CURSES).filter(c => c !== 'atordoado' && val(c) < val('atordoado') && g.s.curseDeck!.includes(c)).slice(0, 2);
  top([two[0], 'atordoado', two[1]]);
  const n3 = g.s.curseDeck!.length;
  const e3 = kill(g, grom.id);
  check(e3?.drawn?.length === 3 && e3.card === 'atordoado' && grom.curse === 'atordoado', `3ª morte: comprou 3 (${e3?.drawn?.join(', ')}) — fica com a maior, Atordoado`);
  check(g.s.curseDeck!.includes('amnesia') && two.every(c => g.s.curseDeck!.includes(c)) && !g.s.curseDeck!.includes('atordoado') && g.s.curseDeck!.length === n3, 'Amnésia e as outras 2 voltaram ao baralho');
  // outro Herói: a contagem é de cada um (1ª morte dele compra 1)
  const maya = g.heroesOf('azul')[1];
  const e4 = kill(g, maya.id);
  check(!!e4 && !e4.drawn, 'a contagem é por Herói: a 1ª morte da Maya compra só 1');
}
{
  // Maldição que ocupa espaço com 4 cartas: o dono escolhe qual fica coberta
  const g = mk();
  const grom = g.heroesOf('azul')[0];
  g.s.curseDeck = ['sangramento_grave', ...g.s.curseDeck!.filter(c => c !== 'sangramento_grave')];
  let asked: string[] = [];
  g.choiceHook = req => { if (req.choice === 'cover') { asked = req.cards ?? []; return 2; } return 'auto'; };
  kill(g, grom.id);
  check(asked.length === 4, `perguntou qual carta cobrir (${asked.join(', ')})`);
  check(grom.curse === 'sangramento_grave' && grom.covered?.defId === 'estilingue' && grom.cards.length === 3, 'Sangramento Grave cobre a carta escolhida (Estilingue)');
  check(!!CURSES[grom.curse!].slot, 'é uma Maldição que ocupa espaço');
}
{
  // Grito de Guerra: o ativo morre, a Guilda ainda ativa outro Herói
  const g = mk();
  const [grom, maya] = g.heroesOf('azul');
  grom.cell = { c: 4, r: 8 }; maya.cell = { c: 3, r: 8 };
  g.activate(grom.id); g.drain();
  g.s.activation!.attacked = true;
  g.s.warCry = 'azul';
  g.damageHero(grom, 99, { kind: 'trap' });
  (g as unknown as { checkActiveDeath: () => void }).checkActiveDeath();
  check(g.currentGuild().id === 'azul', 'com Grito de Guerra o turno NÃO passa quando o Herói ativo morre');
  check(g.activate(maya.id) && g.s.activation?.heroId === maya.id, 'e dá para ativar a Maya');
}
{
  const g = mk();
  const [grom] = g.heroesOf('azul');
  grom.cell = { c: 4, r: 8 };
  g.activate(grom.id); g.drain();
  g.s.activation!.attacked = true;
  g.damageHero(grom, 99, { kind: 'trap' });
  (g as unknown as { checkActiveDeath: () => void }).checkActiveDeath();
  check(g.currentGuild().id !== 'azul', 'sem Grito de Guerra o turno passa quando o Herói ativo morre (como antes)');
}
console.log(ok ? 'MALDIÇÃO NA MORTE E GRITO DE GUERRA OK' : 'FALHOU');
