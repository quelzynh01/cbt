import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Raio Nova: com ✷ sempre pergunta (mesmo com um só Inimigo Perto do alvo); "Ninguém" não atinge o outro.
// Rei da Arena: 5 no MESMO marcador ou 1 em cada um dos 4; 5 espalhados em 3 lugares não completa.
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };

const nova = (answer: number) => {
  for (let seed = 1; seed < 400; seed++) {
    const g = Game.create(MAPS['distrito-dos-martelos'], { seed, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['maya', 'grom', 'zazu'], cards: { maya: ['raio_nova'] } }, { guild: 'vermelho', controller: 'ai' }] });
    g.s.deploying = null;
    const maya = g.heroesOf('azul')[0];
    const mons = Object.values(g.s.units).filter(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object'));
    for (const m of mons) m.cell = null;
    const spot = g.board.allCells().find(c => g.board.playable(c) && !g.board.isPillar(c) && !g.unitsAt(c).length && g.board.neighbors(c).some(n => g.board.isClose(c, n) && g.board.playable(n) && !g.unitsAt(n).length))!;
    const nb = g.board.neighbors(spot).find(n => g.board.isClose(spot, n) && g.board.playable(n) && !g.unitsAt(n).length)!;
    const [t1, t2] = mons; t1.cell = { ...spot }; t2.cell = { ...nb };
    maya.cell = { ...spot };
    g.activate(maya.id);
    let asked: string[] | null = null;
    g.choiceHook = r => { if (r.source === 'Raio Nova') { asked = r.units ?? []; return answer; } return r.choice === 'confirm' ? -1 : 'auto'; };
    g.rerollHook = () => 'auto';
    const card = maya.cards.find(c => c.defId === 'raio_nova')!;
    g.drain();
    g.attack(card.uid, t1.id);
    // só os ataques da Maya: a Vingança do Monstro também vem como 'attack'
    const attacks = (g.drain().filter(e => e.t === 'attack') as unknown as { attackerId: string; crits: number; targets: { id: string }[] }[]).filter(e => e.attackerId === maya.id);
    if (!attacks.some(e => e.crits > 0)) continue; // sem ✷ não há pergunta: tenta outra semente
    return { asked: asked as string[] | null, hitT2: attacks.some(e => e.targets.some(t => t.id === t2.id)) };
  }
  throw new Error('nenhuma semente rolou ✷');
};
const yes = nova(0), no = nova(-1);
check(yes.asked?.length === 1 && yes.hitT2, 'um só Inimigo Perto do alvo: perguntou e, escolhendo, atingiu');
check(!!no.asked && !no.hitT2, 'um só Inimigo Perto do alvo: perguntou e, "Ninguém", não atingiu');

// Rei da Arena
const arena = (cells: number[]) => {
  const map = MAPS['arena-do-sol-brilhante'];
  const g = Game.create(map, { seed: 3, fixedOrder: true, players: [{ guild: 'azul', controller: 'human' }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  const h = g.heroesOf('azul')[0];
  for (const u of Object.values(g.s.units)) if (u.kind === 'monster') u.cell = null;
  const mark = (g as unknown as { arenaMark(u: unknown): void }).arenaMark.bind(g);
  for (const i of cells) { h.cell = { ...map.missionMarkers[i].cell }; mark(h); }
  return (g.s.missionDone['rei_arena'] ?? []).includes('azul');
};
check(!arena([0, 0, 1, 1, 2]), '5 marcadores em 3 lugares: NÃO completa');
check(!arena([0, 1, 2]), '3 lugares: NÃO completa');
check(arena([0, 1, 2, 3]), '1 em cada um dos 4: completa');
check(arena([0, 0, 0, 0, 0]), '5 no mesmo marcador: completa');
check(!arena([0, 0, 0, 0]), '4 no mesmo marcador: NÃO completa');
console.log(ok ? 'RAIO NOVA E ARENA OK' : 'FALHOU');
