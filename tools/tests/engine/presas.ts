import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { MONSTERS } from '../../../src/engine/data';

// Descanso: ressuscitar é opcional. Lorde Presas (nível 6): a Vida chega a zero, mas na Vingança cada ✷ cura 2 — e ele sobrevive.
// Lorde Presas: um só ataque; quem controla escolhe quais Heróis Perto do alvo também são atingidos.
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
const mk = (map = 'distrito-dos-martelos') => {
  const g = Game.create(MAPS[map], { seed: 11, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'] },
    { guild: 'vermelho', controller: 'human', heroes: ['johan', 'kanga', 'diva'] }] });
  for (const m of Object.values(g.s.units)) if (m.kind === 'monster') { m.alive = false; m.cell = null; }
  g.s.deploying = [];
  return g;
};
{
  const g = mk();
  const [grom, maya, zazu] = g.heroesOf('azul');
  grom.alive = false; grom.cell = null; maya.alive = false; maya.cell = null;
  const cell = g.resurrectCells(maya)[0];
  check(g.rest({ resurrect: { [maya.id]: cell }, stayDead: [grom.id] }), 'Descansar ressuscitando só a Maya');
  check(maya.alive && !grom.alive && zazu.alive, 'Maya voltou, Grom continua morto');
}
{
  const g = mk();
  const [grom] = g.heroesOf('azul');
  grom.alive = false; grom.cell = null;
  check(g.rest({}), 'Descanso sem escolher nada (IA / antigo) ressuscita como antes');
  check(grom.alive, 'Grom voltou');
}
{
  // Vingança do Lorde Presas 6: Vida a zero, rola ✷ e se cura
  const g = mk();
  const [grom] = g.heroesOf('azul');
  const lp = Object.values(g.s.units).find(u => u.kind === 'monster')!;
  lp.defId = 'lorde_presas6'; lp.alive = true; lp.cell = { c: 4, r: 4 }; grom.cell = { c: 4, r: 5 };
  lp.wounds = MONSTERS.lorde_presas6.hp; // Vida a zero
  // força ✷ no ataque dele
  const roll = (g as unknown as { rollRerolls: (...a: unknown[]) => { faces: string[]; successes: number; crits: number } });
  const orig = roll.rollRerolls.bind(g);
  roll.rollRerolls = (...a: unknown[]) => { const r = orig(...a); return a[4] === lp ? { ...r, faces: ['crit', 'crit', 'blank', 'blank', 'blank'], successes: 2, crits: 2 } : r; };
  (g as unknown as { monsterAttack: (m: unknown, h: unknown, r: string) => void }).monsterAttack(lp, grom, 'vinganca');
  check(lp.wounds < MONSTERS.lorde_presas6.hp, `curou na Vingança (Ferimentos ${lp.wounds}/${MONSTERS.lorde_presas6.hp})`);
  (g as unknown as { finishAttack: (d: string[], h: unknown) => void }).finishAttack([lp.id], grom);
  check(lp.alive, 'Lorde Presas sobrevive (se curou antes de morrer)');
}
{
  // sem cura, morre no fim do combate como antes
  const g = mk();
  const [grom] = g.heroesOf('azul');
  const orc = Object.values(g.s.units).find(u => u.kind === 'monster')!;
  orc.alive = true; orc.cell = { c: 4, r: 4 }; orc.wounds = MONSTERS[orc.defId].hp;
  (g as unknown as { finishAttack: (d: string[], h: unknown) => void }).finishAttack([orc.id], grom);
  check(!orc.alive, 'Monstro com a Vida a zero (sem cura) morre no fim do combate');
}
{
  // um só ataque: quem controla escolhe quais Heróis Perto do alvo são atingidos
  const g = mk();
  const [grom, maya, zazu] = g.heroesOf('azul');
  const [johan] = g.heroesOf('vermelho');
  const lp = Object.values(g.s.units).find(u => u.kind === 'monster')!;
  lp.defId = 'lorde_presas6'; lp.alive = true; lp.cell = { c: 4, r: 2 };
  grom.cell = { c: 4, r: 4 }; maya.cell = { c: 4, r: 4 }; zazu.cell = { c: 4, r: 5 }; johan.cell = { c: 3, r: 4 };
  let asked: string[] = [];
  g.choiceHook = req => { if (req.choice === 'multi') { asked = req.units ?? []; return 1 << asked.indexOf(zazu.id); } return 'auto'; };
  (g as unknown as { monsterAttack: (m: unknown, h: unknown, r: string) => void }).monsterAttack(lp, grom, 'alerta');
  const atk = g.drain().filter(e => e.t === 'attack') as Extract<ReturnType<Game['drain']>[number], { t: 'attack' }>[];
  check(asked.length >= 2, `perguntou quem mais é atingido (${asked.length} Heróis Perto do alvo)`);
  check(atk.length === 1, 'um só ataque (uma rolagem)');
  check(atk[0]?.targets.map(t => t.id).join(',') === [grom.id, zazu.id].join(','), 'atingiu o alvo e só quem foi escolhido (Zazu)');
}
console.log(ok ? 'DESCANSO E LORDE PRESAS OK' : 'FALHOU');
