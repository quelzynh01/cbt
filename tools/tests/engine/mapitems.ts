import { MAPS } from '../../../src/engine/maps';
import { key } from '../../../src/engine/board';
import type { Cell } from '../../../src/engine/types';

// Confere se há algo (Monstro, marcador, portal, Área Inicial…) em cima de um Espaço bloqueado.
let bad = 0;
for (const m of Object.values(MAPS)) {
  const pil = new Set(m.pillars.map(key));
  const check = (what: string, cs: Cell[]) => { for (const c of cs) if (pil.has(key(c))) { bad++; console.log(`${m.id}: ${what} em (${c.c},${c.r}) bloqueado`); } };
  check('Monstro', m.monsters.map(x => x.cell));
  check('Exploração', m.exploration);
  check('Missão', m.missionMarkers.map(x => x.cell));
  check('Portal', m.portals.map(x => x.cell));
  check('Entrada', m.entryMarkers);
  check('Área Inicial', m.startAreas.flat());
  check('Porta', m.doors.flatMap(d => [d.a, d.b]));
}
console.log(bad ? `${bad} PROBLEMA(S)` : 'NADA EM CIMA DE ESPAÇO BLOQUEADO');
