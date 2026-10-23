import type { Cell } from '../types';
import type { MapDef } from '../board';

// Covil dos Orcs — Círculo Exterior (Livro de Campanha p.14-15). Mapa 9x6.
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2      4B    |    7B    |    8B
//   r3-5      5B    |    1A    |    3A
const C = (c: number, r: number): Cell => ({ c, r });

export const COVIL_DOS_ORCS: MapDef = {
  id: 'covil-dos-orcs',
  name: 'Covil dos Orcs',
  circle: 'Círculo Exterior',
  difficulty: 'dificil',
  level: '1',
  cols: 9,
  rows: 6,
  boards: [
    { code: '4B', c: 0, r: 0 }, { code: '7B', c: 3, r: 0 }, { code: '8B', c: 6, r: 0 },
    { code: '5B', c: 0, r: 3 }, { code: '1A', c: 3, r: 3 }, { code: '3A', c: 6, r: 3 },
  ],

  pillars: [C(0, 3), C(0, 4), C(0, 5), C(8, 3), C(8, 5), C(3, 5), C(5, 5)],
  rooms: [C(2, 0), C(3, 0), C(4, 0), C(5, 0), C(4, 1), C(6, 0), C(2, 2), C(6, 2), C(2, 3), C(3, 3), C(5, 3), C(6, 3)],

  walls: [
    [C(1, 0), C(2, 0)], [C(2, 0), C(2, 1)],
    [C(3, 0), C(3, 1)], [C(5, 0), C(5, 1)], [C(3, 1), C(4, 1)], [C(4, 1), C(5, 1)],
    [C(6, 0), C(7, 0)], [C(6, 0), C(6, 1)],
    [C(0, 0), C(1, 0)], [C(0, 1), C(0, 2)],
    [C(7, 0), C(8, 0)], [C(8, 1), C(8, 2)],
    [C(1, 2), C(2, 2)], [C(2, 1), C(2, 2)], [C(2, 2), C(3, 2)],
    [C(3, 2), C(3, 3)], [C(3, 3), C(4, 3)], [C(3, 3), C(3, 4)],
    [C(2, 3), C(2, 4)],
    [C(5, 2), C(6, 2)], [C(6, 1), C(6, 2)], [C(6, 2), C(7, 2)],
    [C(5, 2), C(5, 3)], [C(4, 3), C(5, 3)], [C(5, 3), C(5, 4)],
    [C(6, 3), C(6, 4)],
    [C(1, 4), C(1, 5)],
    [C(7, 4), C(7, 5)],
  ],

  doors: [
    { a: C(2, 0), b: C(3, 0), open: false },
    { a: C(5, 0), b: C(6, 0), open: false },
    { a: C(0, 1), b: C(1, 1), open: false },
    { a: C(7, 1), b: C(8, 1), open: false },
    { a: C(2, 2), b: C(2, 3), open: false },
    { a: C(6, 2), b: C(6, 3), open: false },
    { a: C(2, 4), b: C(2, 5), open: false },
    { a: C(6, 4), b: C(6, 5), open: false },
    { a: C(1, 3), b: C(2, 3), open: false, small: true },
    { a: C(2, 3), b: C(3, 3), open: false, small: true },
    { a: C(5, 3), b: C(6, 3), open: false, small: true },
    { a: C(6, 3), b: C(7, 3), open: false, small: true },
    { a: C(4, 1), b: C(4, 2), open: true },
  ],

  portals: [
    { cell: C(2, 1), color: 'turquesa' }, { cell: C(6, 1), color: 'turquesa' },
    { cell: C(3, 4), color: 'turquesa' }, { cell: C(5, 4), color: 'turquesa' },
  ],

  startAreas: [
    [C(6, 5), C(7, 5)], // Jogador 1
    [C(0, 0), C(0, 1)], // Jogador 2
    [C(8, 0), C(8, 1)], // Jogador 3
    [C(1, 5), C(2, 5)], // Jogador 4
  ],

  entryMarkers: [C(4, 0), C(2, 3), C(6, 3)],

  exploration: [
    C(3, 0), C(5, 0), C(3, 1), C(5, 1), C(1, 2), C(3, 2),
    C(5, 2), C(7, 2), C(4, 3), C(1, 4), C(4, 4), C(7, 4),
  ],

  // As 4 Pedras de Sangue (marcadores de Missão)
  missionMarkers: [
    { cell: C(2, 2), color: 'azul' }, { cell: C(6, 2), color: 'verde' },
    { cell: C(3, 3), color: 'vermelho' }, { cell: C(5, 3), color: 'laranja' },
  ],

  monsters: [
    { type: 'capitao_orc', cell: C(2, 0) }, { type: 'capitao_orc', cell: C(6, 0) },
    { type: 'goblin', cell: C(3, 1) }, { type: 'goblin', cell: C(3, 1) },
    { type: 'goblin', cell: C(5, 1) }, { type: 'goblin', cell: C(5, 1) },
    { type: 'goblin', cell: C(4, 4) }, { type: 'goblin', cell: C(4, 4) },
    { type: 'orc', cell: C(1, 3) }, { type: 'orc', cell: C(1, 3) }, { type: 'orc', cell: C(2, 3) },
    { type: 'orc', cell: C(6, 3) }, { type: 'orc', cell: C(7, 3) }, { type: 'orc', cell: C(7, 3) },
    { type: 'feral_martelador', cell: C(2, 2) }, { type: 'feral_martelador', cell: C(6, 2) },
    { type: 'feral_lanceiro', cell: C(3, 3) }, { type: 'feral_lanceiro', cell: C(5, 3) },
  ],

  missions: {
    pve: [
      { id: 'pedra', name: 'Destruir Uma Pedra', kind: 'pve', text: 'Entre num Espaço com uma Pedra de Sangue (marcador de Missão) sem Inimigos para destruí-la. Cada jogador destrói só uma. Dá o Título "Destruidor da Pedra Sangrenta".', rule: 'collect_any', title: 'destruidor_pedra' },
      { id: 'capitao', name: 'Matar o Capitão Orc', kind: 'pve', text: 'Mate um Capitão Orc. Dá uma carta de Recompensa (Maldição dos Peles-Verdes). Máximo de 2 jogadores.', rule: 'kill_type', types: ['capitao_orc'], reward: true, maxCompletions: 2 },
    ],
    rewards: ['maldicao_peles_verdes', 'maldicao_peles_verdes'],
  },
  boxOnDeath: ['capitao_orc'],

  notes: [
    'As Áreas Iniciais deste cenário têm só 2 Espaços.',
    'Os Capitães Orcs voltam para a caixa quando morrem.',
    'Título "Destruidor da Pedra Sangrenta": no Pátio da Universidade, os Orcs e Goblins enfrentam você com a carta de um nível abaixo.',
  ],
};
