import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { key } from '../../../src/engine/board';
import type { Cell, Unit } from '../../../src/engine/types';

// Testes dirigidos das habilidades dos Heróis extras.
const map = MAPS['distrito-dos-martelos'] ?? Object.values(MAPS)[0];
const out: Record<string, unknown> = {};
const fails: string[] = [];
const check = (name: string, ok: boolean, info?: unknown) => { out[name] = ok ? 'ok' : `FALHOU ${JSON.stringify(info ?? '')}`; if (!ok) fails.push(name); };

function mk(a: string[], b: string[], cardsA?: Record<string, string[]>, cardsB?: Record<string, string[]>) {
  const g = Game.create(map, { seed: 7, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: a, cards: cardsA }, { guild: 'vermelho', controller: 'ai', heroes: b, cards: cardsB }] });
  // tira os Monstros do caminho
  for (const m of g.monstersOnBoard()) { m.alive = false; m.cell = null; }
  g.drain();
  return g;
}
// um Espaço livre longe das paredes e um vizinho Perto
const cells: Cell[] = [];
{
  const g = mk(['grom', 'maya', 'zazu'], ['vapor', 'seth', 'diva']);
  for (let c = 0; c < map.cols * 3; c++) for (let r = 0; r < map.rows * 3; r++) {
    const x = { c, r };
    if (!g.board.playable(x)) continue;
    const nb = g.board.neighbors(x).filter(n => g.board.isClose(x, n));
    if (nb.length >= 3) cells.push(x);
  }
}
const A = cells[Math.floor(cells.length / 2)];
const put = (g: Game, u: Unit, c: Cell) => { u.cell = { ...c }; };
const closeTo = (g: Game, c: Cell) => g.board.neighbors(c).filter(n => g.board.isClose(c, n));
const far = (g: Game, c: Cell, los = false) => cells.find(x => Math.abs(x.c - c.c) + Math.abs(x.r - c.r) >= 3 && (!los || g.board.hasLOS(c, x, () => false)))!;
const H = (g: Game, gid: string, id: string) => g.unit(`${gid}-${id}`);

// Zahra: entrar num Espaço com Herói não custa PM
{
  const g = mk(['x_zahra', 'grom', 'maya'], ['vapor', 'seth', 'diva']);
  const z = H(g, 'azul', 'x_zahra'), gr = H(g, 'azul', 'grom');
  put(g, z, A); const n1 = closeTo(g, A)[0]; put(g, gr, n1);
  for (const u of g.onBoard()) if (u !== z && u !== gr) u.cell = null;
  const cost = g.reachable(z, 3).get(key(n1))?.mp;
  check('Zahra: entrar no Espaço do Aliado custa 0', cost === 0, cost);
}
// Aeric: +2 Defesa contra a Distância
{
  const g = mk(['x_aeric', 'grom', 'maya'], ['vapor', 'seth', 'diva']);
  const a = H(g, 'azul', 'x_aeric');
  check('Aeric: +2 contra a Distância', g.defenseDice(a, null, 'ranged') === g.defenseDice(a, null, 'melee') + 2, [g.defenseDice(a, null, 'ranged'), g.defenseDice(a, null, 'melee')]);
}
// Morgan: +1 Defesa e +1 Vida por Mágica
{
  const g = mk(['x_morgan', 'grom', 'maya'], ['vapor', 'seth', 'diva'], { x_morgan: ['raio_nova', 'drenar_vida'], grom: [], maya: [] });
  const m = H(g, 'azul', 'x_morgan');
  check('Morgan: 2 Mágicas = Def 3, Vida 3', g.defenseDice(m) === 3 && g.maxHp(m) === 3, [g.defenseDice(m), g.maxHp(m)]);
}
// Smiley: +1 Rerrolagem
{
  const g = mk(['x_smiley_faceless', 'grom', 'maya'], ['vapor', 'seth', 'diva'], { x_smiley_faceless: [], grom: [], maya: [] });
  check('Smiley: Rerrolagem 1', g.rerollsOf(H(g, 'azul', 'x_smiley_faceless')) === 1);
}
// Prince Aaron: Inimigo Perto dele -2 de Defesa contra os Aliados
{
  const g = mk(['x_prince_aaron', 'grom', 'maya'], ['diva', 'seth', 'vapor']);
  const p = H(g, 'azul', 'x_prince_aaron'), gr = H(g, 'azul', 'grom'), d = H(g, 'vermelho', 'diva');
  put(g, d, A); put(g, p, closeTo(g, A)[0]); put(g, gr, closeTo(g, A)[1]);
  const base = g.defenseDice(d), vs = g.defenseDice(d, gr);
  check('Prince Aaron: −2 de Defesa', vs === Math.max(0, base - 2), [base, vs]);
}
// Elysia: marcadores tiram PM; Descansar remove
{
  const g = mk(['grom', 'maya', 'zazu'], ['x_elysia', 'seth', 'vapor']);
  const gr = H(g, 'azul', 'grom');
  gr.petrified = 2;
  g.activate(gr.id);
  check('Olhar Petrificante: 1 PM', g.s.activation?.mp === 1, g.s.activation?.mp);
  check('Olhar Petrificante: ativação "nova" com 1 PM', g.activationFresh());
  g.s.activation = null;
  g.s.activatedThisTurn = [];
  g.rest({});
  check('Olhar Petrificante: Descansar remove', !gr.petrified);
}
// Black Newt / King of Thieves / Sting / Leeroy: dados
{
  const g = mk(['x_black_newt', 'x_king_of_thieves', 'x_sting'], ['grom', 'seth', 'vapor'], { x_black_newt: ['espada_enferrujada'], x_king_of_thieves: ['espada_enferrujada'], x_sting: ['espada_enferrujada'] });
  const bn = H(g, 'azul', 'x_black_newt'), kt = H(g, 'azul', 'x_king_of_thieves'), gr = H(g, 'vermelho', 'grom');
  const c = (u: Unit) => u.cards[0];
  const d0 = g.attackDicePreview(bn, c(bn), gr).dice;
  gr.wounds = 1;
  check('Black Newt: +1 contra ferido', g.attackDicePreview(bn, c(bn), gr).dice === d0 + 1);
  gr.tokens.push({ id: 't', type: 'cura', faceUp: true });
  check('King of Thieves: +2 com marcador', g.attackDicePreview(kt, c(kt), gr).dice === g.attackDicePreview(kt, c(kt), H(g, 'vermelho', 'seth')).dice + 2);
}
// Hitch: usa a carta de quem divide o Espaço sem exaustar
{
  const g = mk(['x_hitch', 'grom', 'maya'], ['vapor', 'seth', 'diva'], { x_hitch: [], grom: ['espada_enferrujada'], maya: [] });
  const hi = H(g, 'azul', 'x_hitch'), gr = H(g, 'azul', 'grom'), v = H(g, 'vermelho', 'vapor');
  for (const u of g.onBoard()) u.cell = null;
  put(g, hi, A); put(g, gr, A); put(g, v, closeTo(g, A)[0]);
  g.activate(hi.id);
  const card = gr.cards[0];
  const ok = g.attack(card.uid, v.id);
  check('Hitch: ataca com a carta do Grom', ok);
  check('Hitch: a carta do Grom não exausta', !card.exhausted);
}
// Viktor: matou -> pode atacar de novo
{
  const g = mk(['x_viktor', 'grom', 'maya'], ['vapor', 'seth', 'diva'], { x_viktor: ['espada_enferrujada', 'adaga_aparadora'], grom: [], maya: [] });
  const vk = H(g, 'azul', 'x_viktor'), v = H(g, 'vermelho', 'vapor');
  for (const u of g.onBoard()) u.cell = null;
  put(g, vk, A); put(g, v, closeTo(g, A)[0]);
  g.s.debug.attackDice = 'max';
  g.activate(vk.id);
  g.attack(vk.cards[0].uid, v.id);
  check('Viktor: matou e pode atacar de novo', !v.alive && g.s.activation?.attacked === false, [v.alive, g.s.activation?.attacked]);
}
// Pigsy: Descansar cura tudo
{
  const g = mk(['x_pigsy', 'grom', 'maya'], ['vapor', 'seth', 'diva']);
  const p = H(g, 'azul', 'x_pigsy');
  p.wounds = 2;
  g.rest({});
  check('Pigsy: Descanso cura', p.wounds === 0, p.wounds);
}
// Brenna: Relâmpago
{
  const g = mk(['x_brenna', 'grom', 'maya'], ['vapor', 'seth', 'diva']);
  const b = H(g, 'azul', 'x_brenna'), v = H(g, 'vermelho', 'vapor'), s = H(g, 'vermelho', 'seth');
  for (const u of g.onBoard()) u.cell = null;
  put(g, b, A); put(g, v, closeTo(g, A)[0]); put(g, s, closeTo(g, A)[1]);
  g.activate(b.id);
  const ok = g.usePower(b.id);
  check('Brenna: Relâmpago fere todos Perto', ok && b.wounds === 1 && v.wounds === 1 && s.wounds === 1, [ok, b.wounds, v.wounds, s.wounds]);
  check('Brenna: 1 vez por ativação', !g.heroPower(b)!.ok);
  check('Brenna: não troca mais de Herói', !g.activate(H(g, 'azul', 'grom').id));
}
// Chooloo: Atordoar em LdV, exausta o Herói
{
  const g = mk(['x_chooloo', 'grom', 'maya'], ['vapor', 'seth', 'diva']);
  const ch = H(g, 'azul', 'x_chooloo'), v = H(g, 'vermelho', 'vapor');
  for (const u of g.onBoard()) u.cell = null;
  put(g, ch, A); put(g, v, closeTo(g, A)[0]);
  g.activate(ch.id);
  const ok = g.usePower(ch.id, v.id);
  check('Chooloo: Atordoa', ok && v.stunned && !!ch.spent, [ok, v.stunned, ch.spent]);
}
// Koba: Teleporte perto de um Aliado
{
  const g = mk(['x_koba', 'grom', 'maya'], ['vapor', 'seth', 'diva']);
  const k = H(g, 'azul', 'x_koba'), gr = H(g, 'azul', 'grom');
  for (const u of g.onBoard()) u.cell = null;
  const F = far(g, A);
  put(g, k, A); put(g, gr, F);
  g.activate(k.id);
  const cells2 = g.powerCells(k);
  const ok = g.usePower(k.id, undefined, cells2[0]);
  check('Koba: Teleporte', ok && g.board.isClose(k.cell!, gr.cell!) || (ok && k.cell!.c === gr.cell!.c && k.cell!.r === gr.cell!.r), [ok, k.cell, gr.cell]);
}
// Lord Fang: puxa um Herói em LdV
{
  const g = mk(['x_lord_fang', 'grom', 'maya'], ['vapor', 'seth', 'diva']);
  const f = H(g, 'azul', 'x_lord_fang'), v = H(g, 'vermelho', 'vapor');
  for (const u of g.onBoard()) u.cell = null;
  put(g, f, A); put(g, v, far(g, A, true));
  g.activate(f.id);
  const ts = g.powerTargets(f).map(u => u.id);
  const cs = g.powerCells(f, v.id);
  const ok = ts.includes(v.id) && g.usePower(f.id, v.id, cs[0]);
  check('Lord Fang: Chamado', !!ok && g.board.isClose(v.cell!, f.cell!) || (!!ok && v.cell!.c === f.cell!.c && v.cell!.r === f.cell!.r), [ts, cs.length, v.cell]);
}
// Monkey Queen: copia a Habilidade
{
  const g = mk(['x_monkey_queen', 'grom', 'maya'], ['vapor', 'seth', 'diva']);
  const mq = H(g, 'azul', 'x_monkey_queen'), gr = H(g, 'azul', 'grom');
  for (const u of g.onBoard()) u.cell = null;
  put(g, mq, A); put(g, gr, closeTo(g, A)[0]);
  g.activate(mq.id);
  const ok = g.usePower(mq.id, gr.id);
  check('Monkey Queen: copia Fúria', ok && g.ab(mq) === 'furia', g.ab(mq));
  g.endTurn();
  check('Monkey Queen: volta no fim do turno', g.ab(mq) === 'macaco_ve');
}
// The Nameless: Mente Brilhante -> outro Aliado só se move
{
  const g = mk(['x_the_nameless', 'grom', 'maya'], ['vapor', 'seth', 'diva'], { x_the_nameless: ['raio_nova'], grom: [], maya: [] });
  const n = H(g, 'azul', 'x_the_nameless'), gr = H(g, 'azul', 'grom'), v = H(g, 'vermelho', 'vapor');
  for (const u of g.onBoard()) u.cell = null;
  put(g, n, A); put(g, v, closeTo(g, A)[0]); put(g, gr, far(g, A));
  g.s.debug.attackDice = 'max';
  g.activate(n.id);
  // força um ✷ no ataque Mágico
  const roll0 = g.roll.bind(g);
  g.roll = ((k: number, die: never, succ: never, mode: never, ex?: boolean) => { const r = roll0(k, die, succ, mode, ex); if (succ === 'ranged' && r.faces[0] !== 'crit') { r.faces[0] = 'crit'; r.crits++; } return r; }) as typeof g.roll;
  g.attack(n.cards[0].uid, v.id);
  g.roll = roll0;
  const can = g.blessKind(gr.id);
  const act = g.activate(gr.id);
  check('Nameless: ativa outro só para mover', can === 'mind' && act && !!g.s.activation?.moveOnly && g.s.activation.attacked, [can, act, g.s.activation]);
}
// Mittens: quem sai de Perto sofre 1
{
  const g = mk(['grom', 'maya', 'zazu'], ['x_mittens', 'seth', 'vapor']);
  const gr = H(g, 'azul', 'grom'), mt = H(g, 'vermelho', 'x_mittens');
  for (const u of g.onBoard()) u.cell = null;
  put(g, gr, A); put(g, mt, closeTo(g, A)[0]);
  g.activate(gr.id);
  const dest = [...g.reachable(gr, 3).values()].find(nd => nd.canEnd && nd.prev !== null && !g.board.isClose(nd.cell, mt.cell!) && nd.cell.c !== mt.cell!.c + 99)!;
  g.moveTo(dest.cell);
  check('Mittens: 1 Ferimento ao sair de Perto', gr.wounds === 1, gr.wounds);
}
console.log(out);
console.log(fails.length ? `FALHAS: ${fails.join(', ')}` : 'TUDO OK');
