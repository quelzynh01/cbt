import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { DEFENSE_DIE } from '../../../src/engine/data';

// ✷ que vale mais (Minotauro, armas como a Sangradora): os acertos que o defensor vê (e o painel da Rerrolagem) já contam o extra
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
type G = { roll: (...a: unknown[]) => { faces: string[]; successes: number; crits: number; held?: number }; monsterAttack: (m: unknown, h: unknown, r: string) => void; curAttack: { hits: number } | null };
const mk = (cards: Record<string, string[]> = {}) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 8, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards }, { guild: 'vermelho', controller: 'human', heroes: ['diva', 'seth', 'kanga'] }] });
  g.s.deploying = [];
  return g;
};
// a primeira rolagem de ataque sai com 2 ✷ e 1 acerto simples
const rig = (g: Game) => {
  const gg = g as unknown as G;
  const orig = gg.roll.bind(g);
  let first = true;
  gg.roll = (...a: unknown[]) => {
    if (first && a[1] !== DEFENSE_DIE) { first = false; const n = a[0] as number; const faces = ['crit', 'crit', 'melee', ...Array(Math.max(0, n - 3)).fill('blank')]; return { faces, successes: 3, crits: 2 }; }
    return orig(...a);
  };
  return gg;
};
{
  // Herói com a Sangradora (cada ✷ = +1 acerto): 3 + 2 = 5 acertos
  const g = mk({ grom: ['sangradora'] });
  const grom = g.heroesOf('azul')[0], diva = g.heroesOf('vermelho')[0];
  for (const m of Object.values(g.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
  diva.cell = { ...grom.cell! };
  const gg = rig(g);
  let seen = -1;
  g.rerollHook = r => { if (r.kind === 'defense' && r.vs) seen = r.vs.hits; return 'auto'; };
  g.activate(grom.id);
  const card = grom.cards.find(c => c.defId === 'sangradora')!;
  g.attack(card.uid, diva.id);
  const e = g.drain().find(x => x.t === 'attack') as { hits: number } | undefined;
  check(e?.hits === 5, `ataque com 2 ✷ e 1 acerto: ${e?.hits} acertos (esperado 5)`);
  check(gg.curAttack?.hits === 5 && (seen === -1 || seen === 5), `quem defende vê ${gg.curAttack?.hits} acertos (pedido da Defesa: ${seen})`);
}
{
  // painel da Rerrolagem do atacante: recebe o acerto a mais por ✷
  const g = mk({ grom: ['sangradora'] });
  const grom = g.heroesOf('azul')[0], diva = g.heroesOf('vermelho')[0];
  for (const m of Object.values(g.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
  diva.cell = { ...grom.cell! };
  grom.cards.push({ uid: 'rr1', defId: 'escudo_cavaleiro' } as never);
  (g as unknown as { rerollsOf: () => number }).rerollsOf = () => 1;
  let plus: number | undefined;
  g.rerollHook = r => { if (r.kind === 'attack') plus = r.card?.critPlus; return []; };
  g.activate(grom.id);
  g.attack(grom.cards.find(c => c.defId === 'sangradora')!.uid, diva.id);
  check(plus === 1, `Rerrolagem do ataque: o painel recebe +${plus} acerto por ✷`);
}
{
  // Minotauro: cada ✷ = +1 acerto
  const g = Game.create(MAPS['arena-do-sol-brilhante'], { seed: 8, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'] }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = [];
  const grom = g.heroesOf('azul')[0];
  const mino = Object.values(g.s.units).find(u => u.kind === 'monster' && u.defId.startsWith('minotauro'))!;
  mino.alive = true; mino.cell = { ...grom.cell! };
  const gg = rig(g);
  let seen = -1;
  g.rerollHook = r => { if (r.kind === 'defense' && r.vs) seen = r.vs.hits; return 'auto'; };
  gg.monsterAttack(mino, grom, 'alerta');
  const e = g.drain().find(x => x.t === 'attack') as { hits: number } | undefined;
  check(e?.hits === 5 && gg.curAttack?.hits === 5 && (seen === -1 || seen === 5), `Minotauro com 2 ✷: ${e?.hits} acertos; o defensor vê ${gg.curAttack?.hits} (pedido: ${seen})`);
}
console.log(ok ? 'CRÍTICO EXTRA OK' : 'FALHOU');
