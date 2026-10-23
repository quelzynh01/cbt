import type { Cell } from '../types';
import type { MapDef } from '../board';

// O Templo do Amanhecer Crepuscular — Confronto Final (Livro de Campanha p.24-25).
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2      6A    |    8B    |    2B
//   r3-5      4A    |    5A    |    1B   <- Templo (barreira mágica)
//   r6-8      9A    |    3A    |    7A
const C = (c: number, r: number): Cell => ({ c, r });

export const TEMPLO_DO_AMANHECER: MapDef = {
  id: 'templo-do-amanhecer-crepuscular',
  name: 'O Templo do Amanhecer Crepuscular',
  circle: 'Confronto Final',
  difficulty: 'muito',
  level: '6',
  cols: 9,
  rows: 9,
  boards: [
    { code: '6A', c: 0, r: 0 }, { code: '8B', c: 3, r: 0 }, { code: '2B', c: 6, r: 0 },
    { code: '4A', c: 0, r: 3 }, { code: '5A', c: 3, r: 3 }, { code: '1B', c: 6, r: 3 },
    { code: '9A', c: 0, r: 6 }, { code: '3A', c: 3, r: 6 }, { code: '7A', c: 6, r: 6 },
  ],

  pillars: [C(2, 0), C(6, 0), C(7, 0), C(8, 0), C(3, 2), C(5, 2), C(1, 4), C(3, 6), C(5, 6), C(2, 8), C(3, 8), C(4, 8), C(5, 8), C(6, 8)],

  rooms: [C(6, 3), C(7, 3), C(8, 3), C(6, 4), C(7, 4), C(8, 4), C(6, 5), C(7, 5), C(8, 5), C(5, 3), C(5, 4), C(5, 5)],

  walls: [
    // Área Inicial J1
    [C(0, 2), C(0, 3)], [C(1, 2), C(1, 3)], [C(2, 2), C(2, 3)], [C(2, 1), C(2, 2)],
    // Área Inicial J3
    [C(6, 1), C(6, 2)], [C(8, 1), C(8, 2)], [C(6, 2), C(6, 3)], [C(7, 2), C(7, 3)], [C(8, 2), C(8, 3)],
    // Área Inicial J4
    [C(0, 5), C(0, 6)], [C(1, 5), C(1, 6)], [C(2, 5), C(2, 6)], [C(0, 6), C(0, 7)], [C(2, 6), C(2, 7)],
    // Área Inicial J2
    [C(6, 5), C(6, 6)], [C(7, 5), C(7, 6)], [C(8, 5), C(8, 6)], [C(6, 6), C(6, 7)], [C(8, 6), C(8, 7)],
    // Templo e nicho da entrada
    [C(5, 3), C(6, 3)], [C(5, 5), C(6, 5)], [C(4, 4), C(5, 4)],
    // revisão dos mapas
    [C(0, 1), C(1, 1)], [C(0, 0), C(0, 1)], [C(3, 0), C(3, 1)], [C(4, 0), C(4, 1)], [C(4, 0), C(5, 0)],
  ],

  doors: [
    { a: C(1, 1), b: C(1, 2), open: false },
    { a: C(7, 1), b: C(7, 2), open: false },
    { a: C(1, 6), b: C(1, 7), open: false },
    { a: C(7, 6), b: C(7, 7), open: false },
    { a: C(5, 3), b: C(5, 4), open: true, small: true },
    { a: C(5, 4), b: C(5, 5), open: true, small: true },
    // Porta da frente do Templo: trancada (barreira mágica)
    { a: C(5, 4), b: C(6, 4), open: false, locked: true },
  ],

  portals: [
    { cell: C(2, 1), color: 'turquesa' }, { cell: C(6, 1), color: 'turquesa' },
    { cell: C(2, 7), color: 'turquesa' }, { cell: C(6, 7), color: 'turquesa' },
    { cell: C(1, 3), color: 'magenta' }, { cell: C(1, 5), color: 'magenta' },
    { cell: C(6, 3), color: 'magenta' }, { cell: C(6, 5), color: 'magenta' },
  ],

  startAreas: [
    [C(0, 2), C(1, 2), C(2, 2)], // Jogador 1
    [C(6, 6), C(7, 6), C(8, 6)], // Jogador 2
    [C(6, 2), C(7, 2), C(8, 2)], // Jogador 3
    [C(0, 6), C(1, 6), C(2, 6)], // Jogador 4
  ],

  entryMarkers: [],
  noEntry: true,

  exploration: [
    C(1, 0), C(3, 1), C(5, 1), C(8, 1), C(3, 3), C(5, 3),
    C(3, 5), C(5, 5), C(0, 7), C(3, 7), C(5, 7), C(8, 7),
  ],

  missionMarkers: [],

  monsters: [
    { type: 'orc', cell: C(1, 0) }, { type: 'orc', cell: C(2, 1) }, { type: 'orc', cell: C(6, 1) }, { type: 'orc', cell: C(8, 1) },
    { type: 'orc', cell: C(0, 7) }, { type: 'orc', cell: C(2, 7) }, { type: 'orc', cell: C(6, 7) }, { type: 'orc', cell: C(8, 7) },
    { type: 'goblin', cell: C(2, 1) }, { type: 'goblin', cell: C(6, 1) }, { type: 'goblin', cell: C(2, 7) }, { type: 'goblin', cell: C(6, 7) },
    { type: 'goblin', cell: C(5, 4) }, { type: 'goblin', cell: C(5, 4) },
    { type: 'feral_lanceiro', cell: C(1, 3) }, { type: 'feral_lanceiro', cell: C(1, 5) },
    { type: 'feral_martelador', cell: C(4, 3) }, { type: 'feral_martelador', cell: C(4, 5) },
    { type: 'irma_dor', cell: C(8, 3) }, { type: 'irma_prazer', cell: C(8, 3) },
    { type: 'irma_prazer', cell: C(8, 5) }, { type: 'irma_dor', cell: C(8, 5) },
    { type: 'troll', cell: C(7, 4) }, { type: 'minotauro', cell: C(7, 4) },
    { type: 'lorde_presas', cell: C(8, 4) },
  ],

  missions: {
    pve: [
      { id: 'presas', name: 'Matar o Lorde Presas', kind: 'pve', text: 'Mate o Lorde Presas. Quem conseguir vence a partida e a campanha!', rule: 'kill_type', types: ['lorde_presas'] },
    ],
    rewards: [],
  },
  missionsToWin: 1,
  pvp: false,
  barrier: { coins: 6, portalColor: 'magenta' },
  rebelTitle: 'lider_rebelde',
  deadlyTokens: true,
  fireProtectTitle: 'protetor_fogo',

  notes: [
    'Barreira mágica: a porta do Templo é trancada e os portais magenta não funcionam. A Guilda que juntar 6 moedas (inclui Baús) pode passar pela porta e usar os portais — para sempre.',
    'Armadilhas matam o Herói na hora. Baús causam Ferimentos iguais ao seu valor quando revelados.',
    'Sem Entrada de Monstros: quem morre sai da partida.',
    'Única Missão: matar o Lorde Presas termina a partida.',
  ],
};
