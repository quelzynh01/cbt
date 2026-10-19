import type { Cell } from '../types';
import type { MapDef } from '../board';

// Distrito Sempressombrio — Círculo Interior (Livro de Campanha p.22-23). Mapa 9x9.
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2      4B    |    2A    |    6A
//   r3-5      5B    |    9B    |    1A
//   r6-8      3A    |    7B    |    8B
//
// Os 4 marcadores de Missão ficam escondidos entre os 8 de Exploração: Vermelho e Verde são a Realeza Miserável;
// Azul e Laranja viram uma Irmã do Prazer que ataca quem os encontrou.
const C = (c: number, r: number): Cell => ({ c, r });

export const SEMPRESSOMBRIO: MapDef = {
  id: 'distrito-sempressombrio',
  name: 'Distrito Sempressombrio',
  circle: 'Círculo Interior',
  level: '4-5',
  cols: 9,
  rows: 9,
  boards: [
    { code: '4B', c: 0, r: 0 }, { code: '2A', c: 3, r: 0 }, { code: '6A', c: 6, r: 0 },
    { code: '5B', c: 0, r: 3 }, { code: '9B', c: 3, r: 3 }, { code: '1A', c: 6, r: 3 },
    { code: '3A', c: 0, r: 6 }, { code: '7B', c: 3, r: 6 }, { code: '8B', c: 6, r: 6 },
  ],

  // Esconderijo do Troll (impresso no tabuleiro, sem porta neste cenário) e a sala de jantar
  pillars: [C(0, 5), C(8, 0), C(8, 1)],
  rooms: [C(0, 0), C(3, 1), C(5, 0), C(0, 3), C(1, 3), C(2, 3), C(2, 4), C(2, 5), C(3, 4), C(3, 5), C(5, 3), C(5, 4), C(5, 5), C(8, 3), C(8, 5), C(3, 8), C(4, 8), C(5, 8), C(4, 7)],

  walls: [
    // Áreas Iniciais
    [C(0, 2), C(0, 1)], [C(1, 2), C(2, 2)], [C(0, 2), C(0, 3)], [C(1, 2), C(1, 3)],
    [C(6, 0), C(5, 0)], [C(6, 0), C(6, 1)], [C(7, 0), C(8, 0)],
    [C(6, 6), C(5, 6)], [C(6, 6), C(6, 5)], [C(7, 6), C(7, 5)], [C(7, 6), C(8, 6)], [C(6, 6), C(6, 7)],
    [C(0, 7), C(0, 6)], [C(0, 8), C(1, 8)],
    // salas
    [C(3, 1), C(4, 1)], [C(3, 1), C(3, 2)],
    [C(5, 0), C(4, 0)],
    [C(1, 3), C(1, 4)],
    [C(2, 3), C(3, 3)], [C(2, 3), C(2, 2)],
    [C(2, 4), C(1, 4)], [C(2, 5), C(3, 5)], [C(2, 5), C(2, 6)],
    [C(3, 4), C(4, 4)], [C(3, 4), C(3, 3)], [C(3, 5), C(3, 6)],
    [C(5, 3), C(5, 2)], [C(5, 3), C(6, 3)], [C(5, 4), C(4, 4)], [C(5, 5), C(4, 5)], [C(5, 5), C(6, 5)],
    [C(8, 3), C(7, 3)], [C(8, 3), C(8, 2)],
    [C(8, 5), C(7, 5)],
    [C(4, 7), C(3, 7)], [C(4, 7), C(5, 7)],
    [C(3, 8), C(2, 8)], [C(5, 8), C(6, 8)],
  ],

  doors: [
    // Portas fechadas x6
    { a: C(1, 1), b: C(1, 2), open: false },
    { a: C(7, 0), b: C(7, 1), open: false },
    { a: C(7, 6), b: C(7, 7), open: false },
    { a: C(0, 7), b: C(1, 7), open: false },
    { a: C(5, 5), b: C(5, 6), open: false },
    { a: C(5, 4), b: C(6, 4), open: false },
    // Porta pequena fechada x1 e aberta x1
    { a: C(2, 4), b: C(3, 4), open: false, small: true },
    { a: C(1, 3), b: C(2, 3), open: true, small: true },
    // Portas abertas x12
    { a: C(2, 1), b: C(3, 1), open: true },
    { a: C(5, 0), b: C(5, 1), open: true },
    { a: C(4, 3), b: C(5, 3), open: true },
    { a: C(0, 3), b: C(0, 4), open: true },
    { a: C(2, 3), b: C(2, 4), open: true },
    { a: C(8, 3), b: C(8, 4), open: true },
    { a: C(1, 5), b: C(2, 5), open: true },
    { a: C(3, 5), b: C(4, 5), open: true },
    { a: C(8, 4), b: C(8, 5), open: true },
    { a: C(8, 5), b: C(8, 6), open: true },
    { a: C(3, 7), b: C(3, 8), open: true },
    { a: C(5, 7), b: C(5, 8), open: true },
  ],

  portals: [
    { cell: C(2, 2), color: 'turquesa' }, { cell: C(7, 3), color: 'turquesa' },
    { cell: C(1, 5), color: 'turquesa' }, { cell: C(5, 7), color: 'turquesa' },
    // portais vermelhos: só para o "Senhor das Águias"
    { cell: C(2, 1), color: 'magenta' }, { cell: C(6, 1), color: 'magenta' },
    { cell: C(2, 7), color: 'magenta' }, { cell: C(8, 7), color: 'magenta' },
  ],
  portalTitle: { color: 'magenta', title: 'senhor_aguias' },

  startAreas: [
    [C(0, 2), C(1, 2)],
    [C(6, 6), C(7, 6)],
    [C(0, 7), C(0, 8)],
    [C(6, 0), C(7, 0)],
  ],

  entryMarkers: [C(1, 0), C(7, 2), C(4, 4), C(1, 6), C(7, 8)],

  // 8 marcadores de Exploração + os 4 de Missão escondidos
  exploration: [
    C(4, 0), C(0, 3), C(2, 3), C(8, 3), C(1, 4), C(3, 4),
    C(4, 3), C(5, 4), C(7, 4), C(4, 5), C(5, 6), C(4, 8),
  ],
  hiddenMissions: ['vermelho', 'verde', 'azul', 'laranja'],
  missionMarkers: [],
  ambush: { colors: ['azul', 'laranja'], monster: 'irma_prazer' },

  monsters: [
    // Saqueador Orc x8
    { type: 'orc', cell: C(4, 0) }, { type: 'orc', cell: C(3, 1) }, { type: 'orc', cell: C(5, 1) }, { type: 'orc', cell: C(0, 3) },
    { type: 'orc', cell: C(8, 3) }, { type: 'orc', cell: C(8, 6) }, { type: 'orc', cell: C(3, 7) }, { type: 'orc', cell: C(4, 8) },
    // Arqueiro Goblin x2
    { type: 'goblin', cell: C(3, 4) }, { type: 'goblin', cell: C(5, 4) },
    // Feral Lanceiro x2 e Feral Martelador x2
    { type: 'feral_lanceiro', cell: C(1, 4) }, { type: 'feral_lanceiro', cell: C(7, 4) },
    { type: 'feral_martelador', cell: C(2, 3) }, { type: 'feral_martelador', cell: C(5, 6) },
    // Minotauro, Troll, Irmã da Dor x2 e a Alma do Lorde Presas
    { type: 'minotauro', cell: C(4, 3) }, { type: 'troll', cell: C(4, 5) },
    { type: 'irma_dor', cell: C(4, 3) }, { type: 'irma_dor', cell: C(4, 5) },
    { type: 'lorde_presas', cell: C(4, 4) },
  ],
  // Irmãs do Prazer escondidas nos marcadores Azul e Laranja
  reserve: ['irma_prazer', 'irma_prazer'],

  missions: {
    pve: [
      { id: 'lorde_alma', name: 'Matar o Lorde Presas', kind: 'pve', text: 'Mate a Alma do Lorde Presas. Dá o Título "Forjador de Almas".', rule: 'kill_type', types: ['lorde_presas'], title: 'forjador_almas' },
      { id: 'realeza', name: 'Salvar a Realeza Miserável', kind: 'pve', text: 'Encontre o marcador Vermelho ou Verde (escondidos entre os de Exploração) e leve-o até a sua Área Inicial, sem Inimigos no Espaço. Recompensa: Manto do Assassino. Máximo de 2 jogadores.', rule: 'escort', colors: ['vermelho', 'verde'], escortTo: 'own_area', reward: true, maxCompletions: 2 },
    ],
    rewards: ['manto_assassino', 'manto_assassino'],
  },
  boxOnDeath: ['lorde_presas', 'irma_prazer', 'irma_dor', 'minotauro', 'troll'],
  gateGuardTitle: 'guardiao_portao',
  labels: [{ cells: [C(0, 5)], text: 'ESCONDERIJO' }],
  notes: [
    'Os marcadores de Missão estão escondidos: Vermelho/Verde = Realeza (leve até a sua Área Inicial); Azul/Laranja = emboscada de uma Irmã do Prazer.',
    'Portais vermelhos só para quem tem o Título "Senhor das Águias" (O Viveiro das Águias).',
  ],
};
