import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { HEROES, distributeStartingGear, starterError } from '../../../src/engine/data';
import { upgradeDeck } from '../../../src/engine/cards';
import type { Cell, Unit } from '../../../src/engine/types';

// Testes dirigidos de Beyond the Grave.
const out: Record<string, string> = {};
const fails: string[] = [];
const check = (n: string, ok: boolean, info?: unknown) => { out[n] = ok ? 'ok' : `FALHOU ${JSON.stringify(info ?? '')}`; if (!ok) fails.push(n); };
const mk = (mapId: string, a = ['grom', 'maya', 'zazu'], b = ['vapor', 'seth', 'diva']) => {
  const g = Game.create(MAPS[mapId], { seed: 3, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: a }, { guild: 'vermelho', controller: 'ai', heroes: b }] });
  if (g.s.deploying) for (const id of [...g.s.deploying]) g.deployDone(id);
  g.drain();
  return g;
};
const H = (g: Game, gid: string, id: string) => g.unit(`${gid}-${id}`);
const clear = (g: Game) => { for (const u of g.units()) { if (u.kind === 'monster') { u.alive = false; u.cell = null; } } };
const mon = (g: Game, type: string) => g.units().find(u => u.kind === 'monster' && u.defId.startsWith(type))!;

// Chaz / Darryn
{
  const g = mk('quartel-assombrado', ['chaz', 'darryn', 'grom']);
  const ch = H(g, 'azul', 'chaz'), da = H(g, 'azul', 'darryn'), v = H(g, 'vermelho', 'vapor');
  ch.cards = [{ uid: 'k1', defId: 'espada_enferrujada', exhausted: false, uses: 0 }];
  da.cards = [{ uid: 'k2', defId: 'espada_enferrujada', exhausted: false, uses: 0 }];
  const base = g.cardDef(ch.cards[0]).dice;
  check('Chaz: +2 sem Ferimentos', g.attackDicePreview(ch, ch.cards[0], v).dice === base + 2, g.attackDicePreview(ch, ch.cards[0], v));
  ch.wounds = 1;
  check('Chaz: sem bônus ferido', g.attackDicePreview(ch, ch.cards[0], v).dice === base);
  check('Darryn: +1 contra alvo sem Ferimentos', g.attackDicePreview(da, da.cards[0], v).dice === base + 1);
  v.wounds = 1;
  check('Darryn: sem bônus contra ferido', g.attackDicePreview(da, da.cards[0], v).dice === base);
  check('Rating no Herói', HEROES.chaz.rating === 6.5 && HEROES.seth.rating === 9.5 && HEROES.vapor.rating === 9.5, [HEROES.chaz.rating, HEROES.seth.rating, HEROES.vapor.rating]);
}
// Rei Pavoroso: Enorme bloqueia e empurra
{
  const g = mk('santuario-negro');
  const dk = mon(g, 'rei_pavoroso');
  const c = dk.cell!;
  const v = H(g, 'vermelho', 'vapor');
  check('Enorme: Espaço cheio', g.cellLoad(c) === 2);
  check('Enorme: Inimigo bloqueado', g.status(v, c) === 'blocked', g.status(v, c));
}
// Fantasma: Perto através da parede
{
  const g = mk('criptas');
  const gh = mon(g, 'fantasma');
  const a: Cell = { c: 3, r: 2 }, b: Cell = { c: 4, r: 2 }; // há parede entre (3,2) e (4,2)
  check('Fantasma: Perto mesmo com parede', g.closeFor(gh, b, a) && !g.board.isClose(b, a));
}
// Lápide: revelar gasta 1 PM e o efeito acontece
{
  const g = mk('quartel-assombrado');
  clear(g);
  const h = H(g, 'azul', 'grom');
  const t = g.s.tombs![0];
  h.cell = { ...t.cell };
  g.activate(h.id);
  const mp = g.s.activation!.mp;
  const coins = g.guild('azul').coins;
  const ok = g.revealTomb();
  check('Lápide: revela (1 PM)', ok && g.s.activation!.mp <= mp - 1 + 2 && !g.tombAt(t.cell), [ok, mp, g.s.activation?.mp]);
  void coins;
}
// Banimento: Herói vai para o Tabuleiro de Entrada e volta com os Ferimentos
{
  const g = mk('quartel-assombrado');
  const h = H(g, 'azul', 'grom');
  h.wounds = 2;
  const ok = g.banish(h);
  check('Banimento: no Tabuleiro de Entrada', ok && !h.cell && h.alive && g.s.entryBoard.includes(h.id));
  g.s.activation = null; g.s.activatedThisTurn = [];
  g.rest({});
  check('Banimento: Descansar traz de volta com Ferimentos', !!h.cell && h.wounds === 2 && !g.s.entryBoard.includes(h.id), [h.cell, h.wounds]);
}
// Quartel: Investigar os Alojamentos
{
  const g = mk('quartel-assombrado');
  clear(g);
  const h = H(g, 'azul', 'grom');
  const area = g.map.startAreas[g.guild('vermelho').startArea];
  for (const u of g.heroesOf('vermelho')) u.cell = null, u.alive = false;
  h.cell = { ...area[0] };
  g.activate(h.id);
  check('Quartel: alojamentos', g.guild('azul').missions.includes('alojamentos'), g.guild('azul').missions);
}
// Abatedouro: Reserva destruída com ✷
{
  const g = mk('abatedouro');
  const h = H(g, 'azul', 'grom');
  const rc = g.units().find(u => u.defId.startsWith('reserva'))!;
  for (const u of g.units()) if (u.kind === 'monster' && u !== rc) { u.alive = false; u.cell = null; }
  h.cell = { ...rc.cell! };
  h.cards = [{ uid: 'k9', defId: 'espada_enferrujada', exhausted: false, uses: 0 }];
  g.activate(h.id);
  const roll0 = g.roll.bind(g);
  g.roll = ((n: number, die: never, s: never, mode: never, ex?: boolean) => { const r = roll0(n, die, s, mode, ex); r.faces[0] = 'crit'; r.crits = Math.max(1, r.crits); return r; }) as typeof g.roll;
  const ok = g.attack('k9', rc.id);
  check('Abatedouro: Reserva destruída', ok && !rc.alive && g.guild('azul').missions.includes('reservas'), [ok, rc.alive, g.guild('azul').missions]);
}
// Criptas: começa com o marcador e entrega no "!"
{
  const g = mk('criptas');
  clear(g);
  const h = g.heroesOf('azul').find(x => x.tokens.some(t => t.type === 'missao'))!;
  check('Criptas: começa com o marcador', !!h);
  h.cell = { c: 2, r: 3 };
  g.activate(h.id);
  check('Criptas: purificar', g.guild('azul').missions.includes('purificar'), g.guild('azul').missions);
}
// Moinho: porta abre com o Herói no marcador
{
  const g = mk('moinho-das-almas');
  clear(g);
  const td = g.map.tokenDoors!.find(x => x.area === g.guild('azul').startArea)!;
  const h = H(g, 'azul', 'grom');
  h.cell = { ...td.token };
  g.activate(h.id);
  check('Moinho: porta abre', g.s.doors[td.door].open && !g.s.doors[td.door].locked);
}
// Foice e baralhos de Beyond the Grave
{
  check('Foice: 5 das 6 iniciais', starterError(['foice', 'adaga_aparadora', 'estilingue', 'drenar_vida', 'raio_nova'], 'btg') === null);
  check('Foice: precisa descartar 1', starterError(['foice', 'espada_enferrujada', 'adaga_aparadora', 'estilingue', 'drenar_vida', 'raio_nova'], 'btg') !== null);
  check('Clássico: sem Foice', starterError(['foice', 'adaga_aparadora', 'estilingue', 'drenar_vida', 'raio_nova']) !== null);
  const ai = distributeStartingGear(['grom', 'maya', 'zazu'], 'btg');
  check('IA: 5 cartas com a Foice', Object.values(ai).flat().length === 5 && Object.values(ai).flat().includes('foice'), ai);
  check('Baralho Nv1 BTG: 6 a menos', upgradeDeck(1).length - upgradeDeck(1, 'btg').length === 6);
}
// Lápide que ativa um Monstro (jogador humano): escolhe, move e ataca
{
  const g = mk('quartel-assombrado');
  const h = H(g, 'azul', 'grom');
  const t = g.s.tombs![0];
  t.card = 't1';
  h.cell = { ...t.cell };
  g.activate(h.id);
  g.revealTomb();
  const p = g.s.puppet;
  check('Lápide: espera o jogador escolher', !!p && p.cat === 'Lacaio Menor' && !g.canAct(), p);
  const m = g.puppetCandidates('Lacaio Menor')[0];
  check('Lápide: escolhe o Monstro', g.puppetPick(m.id));
  const o = g.puppetOptions()!;
  let done = false;
  for (const [k, ids] of o.targets) if (ids.length) { const [c, r] = k.split(',').map(Number); done = g.puppetAct({ c, r }, ids[0]); break; }
  if (!done) done = g.puppetSkip();
  check('Lápide: Monstro age e o turno segue', done && !g.s.puppet && g.canAct());
  // sem Monstro do tipo: aviso e nada a escolher
  const g2 = mk('quartel-assombrado');
  for (const x of g2.puppetCandidates('Vilão Menor')) { x.alive = false; x.cell = null; }
  const h2 = H(g2, 'azul', 'grom'); const t2 = g2.s.tombs![0]; t2.card = 't3'; h2.cell = { ...t2.cell };
  g2.activate(h2.id); g2.drain(); g2.revealTomb();
  check('Lápide: sem Monstro → aviso', !g2.s.puppet && g2.drain().some(e => e.t === 'notice'));
}
console.log(out);
console.log(fails.length ? `FALHAS: ${fails.join(', ')}` : 'TUDO OK');
void ({} as Unit);
