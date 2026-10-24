import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { CURSES } from '../../../src/engine/cards';

// Confronto Final (Templo): a cada morte o Herói compra 1 Maldição e fica com a de maior valor; a que ocupa espaço cobre a carta escolhida.
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
  // força a ordem do baralho: Amnésia (4), depois Aquafobia (1, menor), depois Atordoado (7, maior)
  g.s.curseDeck = ['amnesia', 'aquafobia', 'atordoado', ...g.s.curseDeck!.filter(c => !['amnesia', 'aquafobia', 'atordoado'].includes(c))];
  const e1 = kill(g, grom.id);
  check(e1?.card === 'amnesia' && grom.curse === 'amnesia', '1ª morte: comprou Amnésia e ficou com ela');
  const e2 = kill(g, grom.id);
  check(e2?.card === 'aquafobia' && grom.curse === 'amnesia' && g.s.curseDeck!.includes('aquafobia'), '2ª morte: Aquafobia vale menos — continua com Amnésia (a comprada volta ao baralho)');
  g.s.curseDeck = ['atordoado', ...g.s.curseDeck!.filter(c => c !== 'atordoado')]; // o baralho é embaralhado quando uma carta volta
  const e3 = kill(g, grom.id);
  check(e3?.card === 'atordoado' && grom.curse === 'atordoado' && g.s.curseDeck!.includes('amnesia'), '3ª morte: Atordoado vale mais — troca (Amnésia volta ao baralho)');
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
