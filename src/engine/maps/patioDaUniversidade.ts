import type { Cell } from '../types';
import type { MapDef } from '../board';

// O Pátio da Universidade — Círculo Interior (Livro de Campanha p.20-21).
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2      6A    |    5B    |    9A
//   r3-5      2A    |    4A    |    1A
//   r6-8      3A    |    8A    |    7A
const C = (c: number, r: number): Cell => ({ c, r });

export const PATIO_DA_UNIVERSIDADE: MapDef = {
  id: 'patio-da-universidade',
  name: 'O Pátio da Universidade',
  circle: 'Círculo Interior',
  difficulty: 'medio',
  level: '4-5',
  cols: 9,
  rows: 9,
  boards: [
    { code: '6A', c: 0, r: 0 }, { code: '5B', c: 3, r: 0 }, { code: '9A', c: 6, r: 0 },
    { code: '2A', c: 0, r: 3 }, { code: '4A', c: 3, r: 3 }, { code: '1A', c: 6, r: 3 },
    { code: '3A', c: 0, r: 6 }, { code: '8A', c: 3, r: 6 }, { code: '7A', c: 6, r: 6 },
  ],

  pillars: [C(5, 1), C(5, 2), C(8, 3), C(4, 4), C(6, 5), C(0, 6), C(5, 0), C(0, 1)],
  rooms: [C(2, 0), C(3, 0), C(8, 0), C(3, 2), C(0, 3), C(0, 4), C(0, 5), C(6, 3), C(8, 5), C(2, 5), C(5, 6), C(3, 8), C(4, 8), C(0, 8), C(6, 8), C(3, 7), C(3, 6), C(1, 3), C(2, 3), C(4, 0)],

  walls: [
    // Áreas Iniciais
    [C(2, 1), C(2, 2)], [C(0, 2), C(0, 3)], [C(2, 2), C(3, 2)],
    [C(5, 0), C(6, 0)], [C(6, 2), C(6, 3)], [C(6, 0), C(7, 0)], [C(6, 2), C(7, 2)],
    [C(7, 5), C(7, 6)], [C(8, 5), C(8, 6)], [C(5, 6), C(6, 6)], [C(6, 6), C(6, 7)], [C(8, 6), C(8, 7)],
    [C(1, 6), C(2, 6)], [C(1, 8), C(2, 8)], [C(2, 5), C(2, 6)], [C(2, 8), C(3, 8)],
    // salas
    [C(2, 0), C(2, 1)], [C(3, 0), C(3, 1)], 
    [C(8, 0), C(8, 1)],
    [C(3, 1), C(3, 2)], [C(3, 2), C(4, 2)],
    [C(0, 5), C(1, 5)],
    [C(6, 3), C(7, 3)], [C(6, 3), C(6, 4)],
    [C(7, 5), C(8, 5)],
    [C(1, 5), C(2, 5)], [C(2, 4), C(2, 5)],
    [C(4, 6), C(5, 6)], [C(5, 6), C(5, 7)],
    [C(4, 8), C(5, 8)],
    [C(0, 7), C(0, 8)],
    [C(6, 7), C(6, 8)], [C(5, 8), C(6, 8)],
    // revisão dos mapas
    [C(2, 3), C(2, 4)], [C(1, 3), C(1, 4)], [C(2, 3), C(3, 3)], [C(3, 5), C(3, 6)], [C(3, 6), C(4, 6)], [C(3, 7), C(4, 7)],
    // revisão dos mapas
    [C(2, 0), C(3, 0)],
    // revisão dos mapas
    [C(2, 6), C(3, 6)], [C(2, 7), C(3, 7)], [C(1, 2), C(1, 3)], [C(2, 2), C(2, 3)],
  ],

  doors: [
    { a: C(1, 1), b: C(1, 2), open: false },
    { a: C(6, 1), b: C(7, 1), open: false },
    { a: C(7, 6), b: C(7, 7), open: false },
    { a: C(1, 7), b: C(2, 7), open: false },
    { a: C(4, 0), b: C(4, 1), open: false },
    { a: C(3, 2), b: C(3, 3), open: false },
    { a: C(0, 4), b: C(1, 4), open: false },
    { a: C(8, 4), b: C(8, 5), open: false },
    { a: C(5, 5), b: C(5, 6), open: false },
    { a: C(4, 7), b: C(4, 8), open: false },
    { a: C(1, 0), b: C(2, 0), open: true },
    { a: C(7, 0), b: C(8, 0), open: true },
    { a: C(5, 3), b: C(6, 3), open: true },
    { a: C(2, 5), b: C(3, 5), open: true },
    { a: C(0, 8), b: C(1, 8), open: true },
    { a: C(6, 8), b: C(7, 8), open: true },
  ],

  portals: [
    { cell: C(4, 1), color: 'turquesa' }, { cell: C(1, 4), color: 'turquesa' },
    { cell: C(7, 4), color: 'turquesa' }, { cell: C(4, 7), color: 'turquesa' },
    // portais vermelhos: só para quem tem o Título "Senhor das Águias" (O Viveiro das Águias)
    { cell: C(1, 0), color: 'magenta' }, { cell: C(7, 0), color: 'magenta' },
    { cell: C(1, 8), color: 'magenta' }, { cell: C(7, 8), color: 'magenta' },
  ],
  portalTitle: { color: 'magenta', title: 'senhor_aguias' },

  startAreas: [
    [C(0, 2), C(1, 2), C(2, 2)], // Jogador 1
    [C(6, 6), C(7, 6), C(8, 6)], // Jogador 2
    [C(2, 6), C(2, 7), C(2, 8)], // Jogador 3
    [C(6, 0), C(6, 1), C(6, 2)], // Jogador 4
  ],

  entryMarkers: [C(4, 1), C(1, 4), C(7, 4), C(4, 7)],

  // 8 marcadores de Exploração + Tomos Azul e Laranja, embaralhados e virados para baixo
  exploration: [C(2, 0), C(3, 0), C(8, 0), C(0, 3), C(3, 3), C(5, 5), C(8, 5), C(0, 8), C(3, 8), C(6, 8)],
  hiddenMissions: ['azul', 'laranja'],
  missionMarkers: [{ cell: C(6, 3), color: 'vermelho' }, { cell: C(2, 5), color: 'verde' }],

  monsters: [
    { type: 'orc', cell: C(2, 0) }, { type: 'orc', cell: C(3, 0) }, { type: 'orc', cell: C(8, 0) }, { type: 'orc', cell: C(0, 3) },
    { type: 'orc', cell: C(8, 5) }, { type: 'orc', cell: C(0, 8) }, { type: 'orc', cell: C(3, 8) }, { type: 'orc', cell: C(6, 8) },
    { type: 'goblin', cell: C(3, 1) }, { type: 'goblin', cell: C(3, 3) }, { type: 'goblin', cell: C(7, 3) },
    { type: 'goblin', cell: C(1, 5) }, { type: 'goblin', cell: C(5, 5) }, { type: 'goblin', cell: C(5, 7) },
    { type: 'feral_martelador', cell: C(4, 2) }, { type: 'feral_martelador', cell: C(4, 6) },
    { type: 'feral_lanceiro', cell: C(2, 4) }, { type: 'feral_lanceiro', cell: C(6, 4) },
    { type: 'irma_prazer', cell: C(5, 3) }, { type: 'irma_dor', cell: C(5, 3) },
    { type: 'irma_dor', cell: C(3, 5) }, { type: 'irma_prazer', cell: C(3, 5) },
    { type: 'minotauro', cell: C(3, 2) },
    { type: 'troll', cell: C(5, 6) },
  ],

  missions: {
    pve: [
      { id: 'tomos', name: 'Encontrar os Tomos', kind: 'pve', text: 'Tenha 2 dos 4 Tomos (marcadores de Missão) com os Heróis da sua Guilda. Os Tomos continuam em jogo: matar quem carrega rouba um. Dá o Título "Mestre do Conhecimento" (vantagem na campanha) só ao primeiro: os outros podem completar a Missão, mas sem o Título.', rule: 'carry', count: 2, title: 'mestre_conhecimento', titleFirstOnly: true },
      { id: 'troll', name: 'Matar o Troll', kind: 'pve', text: 'Mate o Troll. Dá uma carta de Recompensa (Tomo da Iluminação).', rule: 'kill_type', types: ['troll'], reward: true },
      { id: 'minotauro', name: 'Matar o Minotauro', kind: 'pve', text: 'Mate o Minotauro. Dá uma carta de Recompensa (Tomo da Iluminação).', rule: 'kill_type', types: ['minotauro'], reward: true },
    ],
    rewards: ['tomo_iluminacao', 'tomo_iluminacao'],
  },
  weakOrcsTitle: 'destruidor_pedra',

  notes: [
    'Os Tomos Azul e Laranja estão escondidos entre os marcadores de Exploração.',
    'Portais vermelhos: só para quem tem o Título "Senhor das Águias" (O Viveiro das Águias).',
    'Com o Título "Destruidor da Pedra Sangrenta", os Orcs e Goblins enfrentam você um nível abaixo.',
  ],
};
