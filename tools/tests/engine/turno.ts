import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Grito de Guerra também ativa quem só andou com as Botas; Poção de Turno Adicional começa na hora (sem Entrada de Monstros);
// a Rerrolagem do ataque do Herói leva o alvo (o painel mostra os dois lutadores).
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
const mk = (cards: Record<string, string[]>) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 4, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = [];
  return g;
};
{
  const g = mk({ grom: ['die_booten'] });
  for (const m of Object.values(g.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
  const [grom, maya] = g.heroesOf('azul');
  grom.cell = { c: 4, r: 4 }; maya.cell = { c: 4, r: 3 };
  g.activate(maya.id);
  const boot = grom.cards.find(c => c.defId === 'die_booten')!;
  const to = g.bootCells(grom, boot).find(c => Math.abs(c.c - 4) + Math.abs(c.r - 4) === 1)!;
  g.useCard(grom.id, boot.uid, undefined, to);
  g.s.activation!.attacked = true;
  check(!g.canBless(grom.id), 'sem Grito de Guerra: quem andou com as Botas não pode ser ativado');
  g.s.warCry = 'azul';
  check(g.canBless(grom.id) && g.activate(grom.id) && g.s.activation?.heroId === grom.id, 'com Grito de Guerra: ativou quem andou com as Botas');
}
{
  const g = mk({});
  const [grom, maya] = g.heroesOf('azul');
  grom.tokens.push({ id: 'tt', type: 'turno' } as never);
  g.activate(grom.id);
  g.s.activation!.moved = true;
  const before = g.s.entryBoard.length;
  const mons = Object.values(g.s.units).filter(u => u.kind === 'monster');
  for (const m of mons.slice(0, 5)) { if (!g.s.entryBoard.includes(m.id)) { m.alive = false; m.cell = null; g.s.entryBoard.push(m.id); } }
  const full = g.s.entryBoard.length;
  void before;
  check(g.useToken('tt'), 'usou a Poção de Turno Adicional');
  check(g.s.extraTurnOn === true && !g.s.activation && g.currentGuild().id === 'azul', 'o turno adicional começou na hora (mesma Guilda, ninguém ativado)');
  check(g.s.entryBoard.length === full, 'a Entrada de Monstros NÃO aconteceu (a vez não passou)');
  check(!g.activate(grom.id), 'o Herói que estava ativo não joga no turno adicional');
  check(g.activate(maya.id), 'ativou outro Herói (Maya)');
}
{
  const g = mk({ grom: ['espada_capitao'] });
  const [grom] = g.heroesOf('azul');
  const m = Object.values(g.s.units).find(u => u.kind === 'monster' && u.alive)!;
  m.cell = { ...grom.cell! };
  let target: string | undefined;
  g.rerollHook = r => { if (r.kind === 'attack') target = r.target; return 'auto'; };
  g.activate(grom.id);
  const c = grom.cards.find(x => x.defId === 'espada_capitao')!;
  g.attack(c.uid, m.id);
  check(target === m.id || target === undefined && g.rerollsOf(grom) === 0, `a Rerrolagem do ataque leva o alvo (${target})`);
}
console.log(ok ? 'TURNO ADICIONAL, BOTAS E GRITO OK' : 'FALHOU');
