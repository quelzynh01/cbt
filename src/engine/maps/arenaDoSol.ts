import type { Cell } from '../types';
import type { MapDef } from '../board';

// Arena do Sol Brilhante — Círculo Exterior (Livro de Campanha p.6-7). Mapa em cruz.
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2            |    6B    |
//   r3-5      8B    |    1A    |    4B
//   r6-8            |    3A    |
//
// As 4 Áreas Iniciais ficam nos cantos do tabuleiro central (3 Espaços em L, ligados por portas abertas).
const C = (c: number, r: number): Cell => ({ c, r });

export const ARENA_DO_SOL: MapDef = {
  id: 'arena-do-sol-brilhante',
  name: 'Arena do Sol Brilhante',
  circle: 'Círculo Exterior',
  difficulty: 'facil',
  level: '1',
  cols: 9,
  rows: 9,
  boards: [
    { code: '6B', c: 3, r: 0 },
    { code: '8B', c: 0, r: 3 },
    { code: '1A', c: 3, r: 3 },
    { code: '4B', c: 6, r: 3 },
    { code: '3A', c: 3, r: 6 },
  ],

  pillars: [],
  rooms: [C(5, 0), C(0, 4), C(8, 4), C(3, 8), C(4, 8), C(5, 8)],

  walls: [
    // Áreas Iniciais (salas laranja)
    [C(3, 2), C(4, 2)], [C(2, 3), C(2, 4)], [C(3, 3), C(4, 3)], [C(3, 3), C(3, 4)],
    [C(5, 2), C(4, 2)], [C(5, 3), C(4, 3)], [C(5, 3), C(5, 4)], [C(6, 3), C(6, 4)],
    [C(2, 5), C(2, 4)], [C(3, 5), C(3, 4)], [C(3, 5), C(4, 5)], [C(3, 6), C(4, 6)],
    [C(5, 5), C(5, 4)], [C(6, 5), C(6, 4)], [C(5, 5), C(4, 5)], [C(5, 6), C(4, 6)],
    // salas das pontas
    [C(5, 0), C(5, 1)],
    [C(0, 4), C(0, 3)], [C(0, 4), C(0, 5)],
    [C(8, 4), C(8, 3)], [C(8, 4), C(8, 5)],
    [C(3, 8), C(3, 7)], [C(5, 8), C(5, 7)],
  ],

  doors: [
    // Portas fechadas x8
    { a: C(3, 1), b: C(3, 2), open: false },
    { a: C(5, 1), b: C(5, 2), open: false },
    { a: C(1, 3), b: C(2, 3), open: false },
    { a: C(6, 3), b: C(7, 3), open: false },
    { a: C(1, 5), b: C(2, 5), open: false },
    { a: C(6, 5), b: C(7, 5), open: false },
    { a: C(3, 6), b: C(3, 7), open: false },
    { a: C(5, 6), b: C(5, 7), open: false },
    // Portas abertas x8
    { a: C(4, 0), b: C(5, 0), open: true },
    { a: C(2, 3), b: C(3, 3), open: true },
    { a: C(5, 3), b: C(6, 3), open: true },
    { a: C(0, 4), b: C(1, 4), open: true },
    { a: C(7, 4), b: C(8, 4), open: true },
    { a: C(2, 5), b: C(3, 5), open: true },
    { a: C(5, 5), b: C(6, 5), open: true },
    { a: C(4, 7), b: C(4, 8), open: true },
    // Portas pequenas abertas x4
    { a: C(3, 2), b: C(3, 3), open: true, small: true },
    { a: C(5, 2), b: C(5, 3), open: true, small: true },
    { a: C(3, 5), b: C(3, 6), open: true, small: true },
    { a: C(5, 5), b: C(5, 6), open: true, small: true },
  ],

  portals: [
    { cell: C(4, 0), color: 'turquesa' }, { cell: C(0, 4), color: 'turquesa' }, { cell: C(2, 4), color: 'turquesa' },
    { cell: C(6, 4), color: 'turquesa' }, { cell: C(8, 4), color: 'turquesa' }, { cell: C(4, 8), color: 'turquesa' },
  ],

  startAreas: [
    [C(3, 2), C(2, 3), C(3, 3)],
    [C(5, 5), C(6, 5), C(5, 6)],
    [C(5, 2), C(5, 3), C(6, 3)],
    [C(2, 5), C(3, 5), C(3, 6)],
  ],

  entryMarkers: [C(5, 0), C(0, 5), C(8, 5), C(3, 8)],

  exploration: [
    C(5, 0), C(4, 2), C(4, 3), C(4, 3), C(3, 4), C(5, 4),
    C(4, 5), C(4, 5), C(0, 5), C(8, 5), C(4, 6), C(3, 8),
  ],

  missionMarkers: [
    { cell: C(5, 0), color: 'laranja' },
    { cell: C(0, 5), color: 'azul' },
    { cell: C(8, 5), color: 'vermelho' },
    { cell: C(3, 8), color: 'verde' },
  ],

  monsters: [
    // Saqueador Orc x8
    { type: 'orc', cell: C(5, 0) }, { type: 'orc', cell: C(4, 1) }, { type: 'orc', cell: C(3, 4) }, { type: 'orc', cell: C(5, 4) },
    { type: 'orc', cell: C(0, 5) }, { type: 'orc', cell: C(8, 5) }, { type: 'orc', cell: C(4, 7) }, { type: 'orc', cell: C(3, 8) },
    // Arqueiro Goblin x6
    { type: 'goblin', cell: C(4, 3) }, { type: 'goblin', cell: C(3, 4) }, { type: 'goblin', cell: C(2, 4) },
    { type: 'goblin', cell: C(5, 4) }, { type: 'goblin', cell: C(6, 4) }, { type: 'goblin', cell: C(4, 5) },
    // Urratouro (carta do Minotauro)
    { type: 'minotauro', cell: C(4, 4) },
  ],

  missions: {
    pve: [
      { id: 'rei_arena', name: 'Rei da Arena', kind: 'pve', text: 'Termine a ativação de um Herói num marcador de Missão sem Inimigos: coloque 1 marcador da sua Guilda. Complete com 5 marcadores ou 1 em cada um dos 4. Os 2 primeiros ganham uma Recompensa (Escudo das Almas).', rule: 'arena', reward: true },
      { id: 'minotauro', name: 'Matar o Minotauro', kind: 'pve', text: 'Mate Urratouro, o Minotauro.', rule: 'kill_type', types: ['minotauro'] },
    ],
    rewards: ['escudo_almas', 'escudo_almas'],
  },
  boxOnDeath: ['minotauro'],
  notes: [
    'Os marcadores de Missão nunca saem do tabuleiro: terminar a ativação em cima de um (sem Inimigos) marca a sua Guilda nele.',
    'Urratouro usa a carta do Minotauro. Este cenário não dá Título.',
  ],
};
