import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Vapor (Wisp): Furtividade 1 vez por turno, perguntando "Esquivar?" antes do Alerta
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const setup = () => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 4, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['vapor', 'grom', 'maya'] }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  const v = g.heroesOf('azul').find(h => h.defId === 'vapor')!;
  const m = Object.values(g.s.units).find(u => u.kind === 'monster' && u.alive && g.monsterCanAttack(u, v, u.cell!) !== undefined)!;
  // Vapor no Espaço do Monstro; destino: um Espaço livre a 1-2 passos
  v.cell = { ...m.cell! };
  g.activate(v.id);
  g.s.activation!.mp = 6;
  const dest = [...g.reachable(v, 2, v.cell!, false)].map(([, n]) => n).find(n => n.canEnd && n.prev !== null && !g.monstersCloseTo(n.cell).length)!;
  return { g, v, m, dest };
};
const alerts = (g: Game) => g.drain().filter(e => e.t === 'reaction' && (e as { kind: string }).kind === 'alerta').length;
{
  const { g, v, m, dest } = setup();
  let asked = '';
  g.choiceHook = r => { if (r.source === 'Furtividade') { asked = r.yes ?? ''; return 0; } return 'auto'; };
  g.drain();
  g.moveTo(dest.cell, false);
  check(asked.includes('Esquivar') && alerts(g) === 0 && (g.s.stealthUsed ?? []).includes(v.id), `perguntou "${asked}", esquivou: sem Alerta`);
  // de novo no mesmo turno: já usou -> Alerta acontece, sem perguntar
  if (v.alive && v.cell) {
    v.cell = { ...m.cell! };
    asked = '';
    g.s.activation!.mp = 6; g.s.activation!.moveLocked = false;
    g.moveTo(dest.cell, false);
    check(!asked && alerts(g) > 0, 'segunda vez no mesmo turno: Alerta normal (sem pergunta)');
  }
}
{
  const { g, v, dest } = setup();
  g.choiceHook = r => r.source === 'Furtividade' ? -1 : 'auto';
  g.drain();
  g.moveTo(dest.cell, false);
  check(alerts(g) > 0 && !(g.s.stealthUsed ?? []).includes(v.id), 'não esquivou: recebe o Alerta e guarda a Furtividade');
}
{
  const { g, v, dest } = setup();
  g.drain();
  g.moveTo(dest.cell, false);
  check(alerts(g) === 0 && (g.s.stealthUsed ?? []).includes(v.id), 'IA (sem pergunta): esquiva');
  g.endTurn?.();
}
console.log(ok ? 'FURTIVIDADE 1X POR TURNO OK' : 'FALHOU');
