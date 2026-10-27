import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Vapor (Wisp): Furtividade 1 vez por turno — a cada Reação de Alerta pergunta se esquiva DESTA (até usar)
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const base = () => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 4, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['vapor', 'grom', 'maya'] }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  (g as unknown as { maxHp: (u: unknown) => number }).maxHp = () => 99; // não morre no meio do teste
  const v = g.heroesOf('azul').find(h => h.defId === 'vapor')!;
  const mons = Object.values(g.s.units).filter(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object'));
  for (const m of mons) m.cell = null; // tira todos; cada caso coloca os seus
  return { g, v, mons };
};
const free = (g: Game, c: { c: number; r: number }) => g.board.playable(c) && !g.board.isPillar(c) && !g.unitsAt(c).length;
const reacted = (g: Game) => g.drain().filter(e => e.t === 'reaction' && (e as { kind: string }).kind === 'alerta').map(e => (e as { monsterId: string }).monsterId);
/** n Monstros no mesmo Espaço/Perto do Vapor; destino longe deles. */
const sameStep = (n: number) => {
  const { g, v, mons } = base();
  const spot = g.board.allCells().find(c => free(g, c) && g.board.neighbors(c).filter(x => g.board.isClose(c, x) && free(g, x)).length >= 3)!;
  const nb = g.board.neighbors(spot).filter(x => g.board.isClose(spot, x) && free(g, x));
  const ms = mons.slice(0, n);
  ms.forEach((m, i) => { m.cell = { ...(i === 0 ? spot : nb[i - 1]) }; m.alive = true; });
  v.cell = { ...spot };
  g.activate(v.id); g.s.activation!.mp = 1;
  // 1 passo só: cada Monstro Perto reage uma vez (ao sair do Espaço)
  const dest = [...g.reachable(v, 1, v.cell!, false)].map(([, x]) => x).find(x => x.canEnd && x.prev !== null)!;
  return { g, v, ms, dest };
};
{
  const { g, v, dest } = sameStep(1);
  let asked = '';
  g.choiceHook = r => { if (r.source === 'Furtividade') { asked = r.yes ?? ''; return 0; } return 'auto'; };
  g.drain(); g.moveTo(dest.cell, false);
  check(asked.includes('Esquivar') && reacted(g).length === 0 && (g.s.stealthUsed ?? []).includes(v.id), '1 Reação: perguntou e esquivou');
}
{
  // 3 Reações no mesmo passo: não esquiva da 1ª, esquiva da 2ª -> só a 1ª e a 3ª acontecem; não pergunta mais depois
  const { g, v, ms, dest } = sameStep(3);
  const asks: string[] = [];
  g.choiceHook = r => { if (r.source === 'Furtividade') { asks.push(r.text ?? ''); return asks.length === 2 ? 0 : -1; } return 'auto'; };
  g.drain(); g.moveTo(dest.cell, false);
  const got = reacted(g);
  check(asks.length === 2 && got.length === 2 && (g.s.stealthUsed ?? []).includes(v.id) && new Set(got).size === 2, `3 Reações: perguntou em cada uma até usar (${asks.length}x); vieram ${got.length} de ${ms.length}`);
}
{
  const { g, v, dest } = sameStep(2);
  let asks = 0;
  g.choiceHook = r => { if (r.source === 'Furtividade') { asks++; return -1; } return 'auto'; };
  g.drain(); g.moveTo(dest.cell, false);
  check(asks === 2 && reacted(g).length === 2 && !(g.s.stealthUsed ?? []).includes(v.id), 'nunca esquivou: perguntou nas 2 e as 2 aconteceram (guarda a Furtividade)');
}
{
  // o mesmo Monstro reage 2 vezes no caminho (A -> B (Monstro) -> C): pergunta nas duas
  const { g, v, mons } = base();
  let plan: { A: { c: number; r: number }; B: { c: number; r: number }; C: { c: number; r: number } } | null = null;
  for (const A of g.board.allCells().filter(c => free(g, c))) {
    for (const B of g.board.neighbors(A).filter(x => g.board.isClose(A, x) && free(g, x))) {
      const C = g.board.neighbors(B).find(x => g.board.isClose(B, x) && free(g, x) && !(x.c === A.c && x.r === A.r));
      if (C) { plan = { A, B, C }; break; }
    }
    if (plan) break;
  }
  const m = mons[0]; m.cell = { ...plan!.B }; m.alive = true;
  v.cell = { ...plan!.A };
  g.activate(v.id); g.s.activation!.mp = 2;
  let asks = 0;
  g.choiceHook = r => { if (r.source === 'Furtividade') { asks++; return asks === 2 ? 0 : -1; } return 'auto'; };
  g.drain(); g.moveTo(plan!.C, false);
  const got = reacted(g);
  check(asks === 2 && got.length === 1 && (g.s.stealthUsed ?? []).includes(v.id), `mesmo Monstro 2 vezes no caminho: perguntou nas 2 (${asks}x); não esquivou a 1ª, esquivou a 2ª (vieram ${got.length})`);
}
{
  // IA (sem pergunta): esquiva da primeira Reação; a segunda vez no turno não esquiva
  const { g, v, ms, dest } = sameStep(2);
  g.drain(); g.moveTo(dest.cell, false);
  const first = reacted(g).length;
  v.cell = { ...ms[0].cell! }; g.s.activation!.mp = 1; g.s.activation!.moveLocked = false;
  g.moveTo(dest.cell, false);
  const second = reacted(g).length;
  check(first === 1 && second === 2 && (g.s.stealthUsed ?? []).includes(v.id), `IA: esquivou da 1ª de 2 (${first} veio); depois sem esquiva (${second})`);
}
{
  // Parar aqui: no 1º aviso não sai do lugar (o movimento nem conta); no meio do caminho fica onde está, com o que já tomou
  const mkPath = () => {
    const { g, v, mons } = base();
    let plan: { A: { c: number; r: number }; B: { c: number; r: number }; C: { c: number; r: number } } | null = null;
    for (const A of g.board.allCells().filter(c => free(g, c) && !g.board.portalAt(c))) {
      for (const B of g.board.neighbors(A).filter(x => g.board.isClose(A, x) && free(g, x) && !g.board.portalAt(x))) {
        const C = g.board.neighbors(B).find(x => g.board.isClose(B, x) && free(g, x) && !g.board.portalAt(x) && !(x.c === A.c && x.r === A.r));
        if (C) { plan = { A, B, C }; break; }
      }
      if (plan) break;
    }
    const m = mons[0]; m.cell = { ...plan!.B }; m.alive = true;
    v.cell = { ...plan!.A };
    g.activate(v.id); g.s.activation!.mp = 2;
    return { g, v, plan: plan! };
  };
  {
    const { g, v, plan } = mkPath();
    g.choiceHook = r => r.source === 'Furtividade' ? 1 : 'auto';
    g.drain(); g.moveTo(plan.C, false);
    const got = reacted(g);
    check(v.cell!.c === plan.A.c && v.cell!.r === plan.A.r && got.length === 0 && !g.s.activation!.moved && g.s.activation!.mp === 2 && !(g.s.stealthUsed ?? []).includes(v.id),
      'parar no 1º aviso: não saiu do lugar, sem Reação, movimento não conta');
  }
  {
    const { g, v, plan } = mkPath();
    let asks = 0;
    g.choiceHook = r => { if (r.source === 'Furtividade') { asks++; return asks === 1 ? -1 : 1; } return 'auto'; };
    g.drain(); g.moveTo(plan.C, false);
    const got = reacted(g);
    check(v.cell!.c === plan.B.c && v.cell!.r === plan.B.r && got.length === 1 && g.s.activation!.mp === 1 && !(g.s.stealthUsed ?? []).includes(v.id),
      `não esquivou a 1ª (tomou), parou na 2ª: ficou no meio do caminho com a Reação que já tomou (${got.length})`);
  }
}
console.log(ok ? 'FURTIVIDADE 1X POR TURNO OK' : 'FALHOU');
