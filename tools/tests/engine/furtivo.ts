import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Vapor (Wisp): Furtividade 1 vez por turno, esquiva de UMA Reação de Alerta — com mais de uma, o jogador escolhe qual
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const setup = (nMon: number) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 4, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['vapor', 'grom', 'maya'] }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  const v = g.heroesOf('azul').find(h => h.defId === 'vapor')!;
  v.wounds = 0; (g as unknown as { maxHp: (u: unknown) => number }).maxHp = () => 99; // não morre no meio do teste
  const mons = Object.values(g.s.units).filter(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object')).slice(0, nMon);
  // um Espaço livre com vizinhos livres; os Monstros ficam Perto dele, o Vapor no meio
  const cells = g.board.allCells().filter(c => g.board.playable(c) && !g.board.isPillar(c) && !g.unitsAt(c).length);
  const spot = cells.find(c => g.board.neighbors(c).filter(n => g.board.isClose(c, n) && !g.unitsAt(n).length).length >= 3)!;
  const nb = g.board.neighbors(spot).filter(n => g.board.isClose(spot, n) && !g.unitsAt(n).length);
  mons.forEach((m, i) => { m.cell = { ...(i === 0 ? spot : nb[i - 1]) }; });
  v.cell = { ...spot };
  g.activate(v.id);
  g.s.activation!.mp = 6;
  const dest = [...g.reachable(v, 6, v.cell!, false)].map(([, n]) => n).find(n => n.canEnd && n.prev !== null && !g.monstersCloseTo(n.cell).length && !mons.some(m => g.board.isClose(m.cell!, n.cell)))!;
  return { g, v, mons, dest };
};
const alerts = (g: Game) => g.drain().filter(e => e.t === 'reaction' && (e as { kind: string }).kind === 'alerta').map(e => (e as { monsterId: string }).monsterId);
{
  const { g, v, mons, dest } = setup(1);
  let asked = '';
  g.choiceHook = r => { if (r.source === 'Furtividade') { asked = r.choice + ':' + (r.yes ?? ''); return 0; } return 'auto'; };
  g.drain(); g.moveTo(dest.cell, false);
  check(asked.startsWith('confirm') && alerts(g).length === 0 && (g.s.stealthUsed ?? []).includes(v.id), `1 Monstro: perguntou "${asked}" e esquivou (${mons.length})`);
}
{
  const { g, v, mons, dest } = setup(3);
  let units: string[] = [];
  g.choiceHook = r => { if (r.source === 'Furtividade') { units = r.units ?? []; return 1; } return 'auto'; };
  g.drain(); g.moveTo(dest.cell, false);
  const got = alerts(g);
  const near = mons.filter(m => units.includes(m.id)).length;
  check(r3(units, got, near, v, g), `${units.length} Monstros: escolheu esquivar de 1; Monstros que reagiram: ${new Set(got).size} (sem ${units[1]})`);
}
function r3(units: string[], got: string[], near: number, v: { id: string }, g: Game) { const u = new Set(got); return units.length >= 2 && near === units.length && u.size === units.length - 1 && !u.has(units[1]) && (g.s.stealthUsed ?? []).includes(v.id); }
{
  const { g, v, dest } = setup(2);
  g.choiceHook = r => r.source === 'Furtividade' ? -1 : 'auto';
  g.drain(); g.moveTo(dest.cell, false);
  check(new Set(alerts(g)).size === 2 && !(g.s.stealthUsed ?? []).includes(v.id), 'não esquivou: os 2 Monstros reagem e guarda a Furtividade');
}
{
  // IA (sem pergunta): esquiva de 1 (a mais forte); a segunda vez no turno não esquiva
  const { g, v, mons, dest } = setup(2);
  g.drain(); g.moveTo(dest.cell, false);
  const first = alerts(g).length;
  if (v.alive && v.cell) {
    v.cell = { ...mons[0].cell! };
    g.s.activation!.mp = 6; g.s.activation!.moveLocked = false;
    g.moveTo(dest.cell, false);
  }
  const second = alerts(g).length;
  check(first === 1 && second >= 1 && (g.s.stealthUsed ?? []).includes(v.id), `IA: esquivou de 1 de 2 (${first} Reação); 2ª vez no turno sem esquiva (${second})`);
}
console.log(ok ? 'FURTIVIDADE 1X POR TURNO OK' : 'FALHOU');
