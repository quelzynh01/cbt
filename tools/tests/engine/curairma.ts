import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { MONSTERS } from '../../../src/engine/data';

// Irmã do Prazer / Lorde Presas: cada ✷ cura 2 logo depois do ataque, ANTES do dano de retribuição (Espetado / Amuleto);
// a conta usa o dano inteiro (o que passou da Vida também) e só sobrevive com pelo menos 1 de Vida
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
type G = { roll: (...a: unknown[]) => { faces: string[]; successes: number; crits: number }; monsterAttack: (m: unknown, h: unknown, r: string) => void; finishAttack: (d: string[], h: unknown) => void };
const run = (overkill: number, defCrits: number) => {
  const g = Game.create(MAPS['patio-da-universidade'], { seed: 2, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['espetado', 'maya', 'zazu'] }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  const esp = g.heroesOf('azul')[0];
  const sis = Object.values(g.s.units).find(u => u.kind === 'monster' && u.defId.startsWith('irma_prazer'))!;
  sis.alive = true; sis.cell = { ...esp.cell! };
  const hp = MONSTERS[sis.defId].hp;
  sis.wounds = hp + overkill; // já "morrendo" (Vingança antes de morrer)
  g.choiceHook = () => 'auto'; g.rerollHook = () => 'auto';
  const gg = g as unknown as G;
  // ataque da Irmã: 1 ✷ (cura 2) + 1 acerto; Defesa do Espetado: defCrits ✷ (cada um fere a Irmã)
  gg.roll = (...a: unknown[]) => a[2] !== 'shield' ? { faces: ['crit', 'ranged', 'blank'], successes: 2, crits: 1 } : { faces: [...Array(defCrits).fill('crit'), 'blank'], successes: defCrits, crits: defCrits };
  g.drain();
  gg.monsterAttack(sis, esp, 'vinganca');
  const evs = g.drain().filter(e => e.t === 'heal' || e.t === 'damage' || e.t === 'death').map(e => e.t + (e.t === 'damage' ? ':' + (e as { id: string }).id : ''));
  gg.finishAttack([sis.id], esp);
  return { alive: sis.alive, life: hp - sis.wounds, evs, hp };
};
const a = run(0, 0);
check(a.alive && a.life === 2, `Vida 0 (${a.hp} de dano em ${a.hp}): cura 2 -> fica com ${a.life} de Vida e sobrevive`);
const b = run(2, 0);
check(!b.alive, `Vida -2 (passou 2 da Vida): cura 2 -> 0 de Vida -> morre`);
const c = run(0, 1);
check(c.alive && c.life === 1 && c.evs.indexOf('heal') >= 0 && c.evs.indexOf('heal') < c.evs.findIndex(e => e.startsWith('damage:') && !e.includes('azul')), `cura antes da Vingança do Espetado: Vida 0 -> cura 2 -> 1 ✷ do Espetado -> ${c.life} de Vida, viva (ordem: ${c.evs.join(', ')})`);
const d = run(1, 1);
check(!d.alive, 'Vida -1: cura 2 (Vida 1) e depois 1 do Espetado -> 0 -> morre');
console.log(ok ? 'CURA DAS IRMÃS OK' : 'FALHOU');
