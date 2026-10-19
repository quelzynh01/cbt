import type { Cell } from '../types';
import type { MapDef } from '../board';

// O Viveiro das Águias — Círculo Exterior (Livro de Campanha p.10-11). Mapa 9x6.
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2      7A    |    3B    |    8B
//   r3-5      5A    |    6B    |    9A
const C = (c: number, r: number): Cell => ({ c, r });

export const VIVEIRO_DAS_AGUIAS: MapDef = {
  id: 'viveiro-das-aguias',
  name: 'O Viveiro das Águias',
  circle: 'Círculo Exterior',
  level: '1',
  cols: 9,
  rows: 6,
  boards: [
    { code: '7A', c: 0, r: 0 }, { code: '3B', c: 3, r: 0 }, { code: '8B', c: 6, r: 0 },
    { code: '5A', c: 0, r: 3 }, { code: '6B', c: 3, r: 3 }, { code: '9A', c: 6, r: 3 },
  ],

  // fonte com as luzes coloridas no canto (decoração)
  pillars: [C(8, 4), C(8, 5)],
  rooms: [C(0, 0), C(6, 0), C(5, 2), C(7, 2), C(3, 3), C(3, 5)],

  walls: [
    // Áreas Iniciais
    [C(2, 0), C(1, 0)], [C(3, 0), C(4, 0)], [C(3, 0), C(3, 1)],
    [C(0, 2), C(0, 1)], [C(0, 3), C(1, 3)], [C(0, 3), C(0, 4)],
    [C(8, 2), C(8, 1)], [C(8, 2), C(7, 2)],
    [C(5, 5), C(4, 5)], [C(5, 5), C(5, 4)], [C(6, 5), C(7, 5)],
    // sala com os marcadores Laranja e Azul
    [C(3, 3), C(2, 3)], [C(3, 3), C(4, 3)], [C(3, 3), C(3, 4)],
    // sala com os marcadores Verde e Vermelho
    [C(5, 2), C(4, 2)], [C(5, 2), C(6, 2)], [C(5, 2), C(5, 1)],
  ],

  doors: [
    // Portas fechadas x6
    { a: C(2, 0), b: C(2, 1), open: false },
    { a: C(0, 2), b: C(1, 2), open: false },
    { a: C(3, 2), b: C(3, 3), open: false },
    { a: C(5, 2), b: C(5, 3), open: false },
    { a: C(7, 3), b: C(8, 3), open: false },
    { a: C(6, 4), b: C(6, 5), open: false },
    // Portas pequenas abertas x4 (dentro das Áreas Iniciais)
    { a: C(2, 0), b: C(3, 0), open: true, small: true },
    { a: C(0, 2), b: C(0, 3), open: true, small: true },
    { a: C(8, 2), b: C(8, 3), open: true, small: true },
    { a: C(5, 5), b: C(6, 5), open: true, small: true },
  ],

  portals: [
    // portais azuis: destino das Águias resgatadas
    { cell: C(1, 1), color: 'turquesa' }, { cell: C(7, 4), color: 'turquesa' },
    { cell: C(8, 0), color: 'magenta' }, { cell: C(6, 1), color: 'magenta' },
    { cell: C(2, 4), color: 'magenta' }, { cell: C(0, 5), color: 'magenta' },
  ],

  startAreas: [
    [C(2, 0), C(3, 0)],
    [C(5, 5), C(6, 5)],
    [C(0, 2), C(0, 3)],
    [C(8, 2), C(8, 3)],
  ],

  entryMarkers: [C(2, 2), C(4, 2), C(4, 3), C(6, 3)],

  exploration: [
    C(4, 0), C(8, 0), C(1, 1), C(5, 1), C(4, 2), C(6, 2),
    C(2, 3), C(4, 3), C(3, 4), C(7, 4), C(0, 5), C(4, 5),
  ],

  missionMarkers: [
    { cell: C(5, 2), color: 'verde' }, { cell: C(5, 2), color: 'vermelho' },
    { cell: C(3, 3), color: 'laranja' }, { cell: C(3, 3), color: 'azul' },
  ],

  monsters: [
    // Saqueador Orc x4
    { type: 'orc', cell: C(4, 0) }, { type: 'orc', cell: C(1, 1) }, { type: 'orc', cell: C(7, 4) }, { type: 'orc', cell: C(4, 5) },
    // Arqueiro Goblin x6
    { type: 'goblin', cell: C(5, 1) }, { type: 'goblin', cell: C(4, 2) }, { type: 'goblin', cell: C(5, 2) },
    { type: 'goblin', cell: C(3, 3) }, { type: 'goblin', cell: C(4, 3) }, { type: 'goblin', cell: C(3, 4) },
    // Capitão Orc x2
    { type: 'capitao_orc', cell: C(6, 1) }, { type: 'capitao_orc', cell: C(2, 4) },
    // Feral Martelador x2
    { type: 'feral_martelador', cell: C(8, 0) }, { type: 'feral_martelador', cell: C(0, 5) },
    // Feral Lanceiro x2
    { type: 'feral_lanceiro', cell: C(3, 2) }, { type: 'feral_lanceiro', cell: C(5, 3) },
  ],

  missions: {
    pve: [
      { id: 'aguias', name: 'Resgatar as Águias', kind: 'pve', text: 'Pegue 1 marcador de Missão (uma Águia) e leve-o até um portal azul, sem Inimigos no Espaço. Cada Guilda carrega só 1 por vez. Dá o Título "Senhor das Águias".', rule: 'escort', escortTo: [C(1, 1), C(7, 4)], title: 'senhor_aguias' },
      { id: 'martelador', name: 'Matar o Feral Martelador', kind: 'pve', text: 'Mate um Feral Martelador (ele volta para a caixa). Dá uma carta de Recompensa (Lança do Feral). Máximo de 2 jogadores.', rule: 'kill_type', types: ['feral_martelador'], reward: true, maxCompletions: 2 },
    ],
    rewards: ['lanca_feral', 'lanca_feral'],
  },
  boxOnDeath: ['feral_martelador'],
  notes: [
    'Águias: leve um marcador de Missão até um portal AZUL (sem Inimigos no Espaço). Cada Guilda carrega só 1 por vez.',
    'O Título "Senhor das Águias" libera os portais vermelhos no Pátio da Universidade e no Distrito Sempressombrio.',
  ],
};
