import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Praça da Aurora Vermelha: pisar no marcador Vermelho/Verde tira o marcador da partida e rola 2 dados contra as Entradas;
// Entrada livre -> a Sombra do Lorde Presas surge nela (em preto e branco); senão fica fora do tabuleiro (pode tentar no outro marcador).
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
const mk = () => {
  const g = Game.create(MAPS['praca-da-aurora-vermelha'], { seed: 9, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'] }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = [];
  return g;
};
const step = (g: Game, color: string, faces: string[]) => {
  const [grom] = g.heroesOf('azul');
  const k = Object.keys(g.s.floor).find(k => g.s.floor[k].some(t => t.type === 'missao' && t.color === color))!;
  const [c, r] = k.split(',').map(Number);
  for (const u of g.unitsAt({ c, r })) if (u.kind === 'monster') { u.alive = false; u.cell = null; }
  const gg = g as unknown as { roll: (...a: unknown[]) => { faces: string[] }; pickup: (h: unknown) => void };
  const orig = gg.roll.bind(g);
  gg.roll = (...a: unknown[]) => (a[0] === 2 ? { ...orig(...a), faces } : orig(...a));
  grom.cell = { c, r };
  gg.pickup(grom);
  gg.roll = orig;
  return { k, ev: g.drain().find(e => e.t === 'summonRoll') as { cell: unknown; faces: string[] } | undefined };
};
{
  const g = mk();
  const em = g.s.entryMarkers[0];
  for (const u of g.unitsAt(em.cell)) { u.alive = false; u.cell = null; }
  const { k, ev } = step(g, 'vermelho', em.pair.slice());
  const lp = Object.values(g.s.units).find(u => u.kind === 'monster' && u.defId.startsWith('lorde_presas'))!;
  check(!!ev && !!ev.cell, 'mostrou a rolagem (summonRoll) com a Entrada');
  check(lp.alive && lp.cell?.c === em.cell.c && lp.cell?.r === em.cell.r, `a Sombra surgiu na Entrada (${em.cell.c},${em.cell.r})`);
  check(!!lp.shadow && g.name(lp).startsWith('Sombra do'), `marcada como Sombra (preto e branco): "${g.name(lp)}"`);
  check(!(g.s.floor[k] ?? []).some(t => t.type === 'missao' && t.color === 'vermelho'), 'o marcador Vermelho saiu da partida');
}
{
  const g = mk();
  // dados que não indicam nenhuma Entrada (dois em branco não formam par de Entrada)
  const pairs = g.s.entryMarkers.map(e => e.pair.slice().sort().join(','));
  const none = [['blank', 'blank'], ['crit', 'crit'], ['melee', 'melee'], ['ranged', 'ranged']].find(f => !pairs.includes(f.slice().sort().join(',')))!;
  const { ev } = step(g, 'verde', none);
  const lp = Object.values(g.s.units).find(u => u.kind === 'monster' && u.defId.startsWith('lorde_presas'))!;
  check(!!ev && ev.cell === null, 'rolagem sem Entrada: avisa que não entra');
  check(!lp.alive, 'a Sombra fica fora do tabuleiro');
}
console.log(ok ? 'SOMBRA DO LORDE PRESAS OK' : 'FALHOU');
