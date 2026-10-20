import type { Cell } from '../types';
import type { MapDef } from '../board';

// Distrito do Alquimista — Círculo Interior (Livro de Campanha p.16-17).
// Tabuleiros em anel ao redor de um buraco central:
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2      5B    |    7A    |    8A
//   r3-5      3A    |  (vazio) |    2B
//   r6-8      6A    |    9B    |    4B
const C = (c: number, r: number): Cell => ({ c, r });

export const DISTRITO_DO_ALQUIMISTA: MapDef = {
  id: 'distrito-do-alquimista',
  name: 'Distrito do Alquimista',
  circle: 'Círculo Interior',
  difficulty: 'facil',
  level: '4-5',
  cols: 9,
  rows: 9,
  boards: [
    { code: '5B', c: 0, r: 0 },
    { code: '7A', c: 3, r: 0 },
    { code: '8A', c: 6, r: 0 },
    { code: '3A', c: 0, r: 3 },
    { code: '2B', c: 6, r: 3 },
    { code: '6A', c: 0, r: 6 },
    { code: '9B', c: 3, r: 6 },
    { code: '4B', c: 6, r: 6 },
  ],

  // (1,0)-(2,0): Esconderijo do Troll — a porta trancada só abre para o "Caçador de Trolls" (A Mansão).
  pillars: [C(2, 2), C(0, 3), C(6, 2), C(2, 6), C(6, 6), C(6, 8)],

  rooms: [
    C(0, 1), C(0, 2), C(5, 0), C(7, 0), C(8, 0), C(8, 1), C(8, 2), C(8, 3), C(8, 4), C(8, 5),
    C(0, 5), C(0, 7), C(0, 8), C(1, 8), C(2, 8), C(4, 8), C(5, 8), C(8, 7), C(8, 8),
  ],

  walls: [
    // Esconderijo do Troll
    [C(0, 0), C(1, 0)], [C(1, 0), C(1, 1)], [C(2, 0), C(2, 1)],
    // Áreas Iniciais (cada uma sai por uma porta)
    [C(1, 3), C(2, 3)], [C(1, 5), C(2, 5)],
    [C(3, 1), C(3, 2)], [C(5, 1), C(5, 2)],
    [C(6, 3), C(7, 3)], [C(6, 5), C(7, 5)],
    [C(3, 6), C(3, 7)], [C(5, 6), C(5, 7)],
    // salas
    [C(0, 1), C(1, 1)],
    [C(5, 0), C(5, 1)], [C(5, 0), C(6, 0)],
    [C(6, 0), C(7, 0)], [C(7, 1), C(8, 1)], [C(7, 2), C(8, 2)], [C(8, 2), C(8, 3)],
    [C(7, 3), C(8, 3)], [C(7, 5), C(8, 5)], [C(8, 5), C(8, 6)],
    [C(0, 5), C(1, 5)], [C(0, 5), C(0, 6)],
    [C(0, 6), C(0, 7)], [C(0, 7), C(1, 7)], [C(2, 7), C(2, 8)], [C(2, 8), C(3, 8)],
    [C(3, 8), C(4, 8)], [C(5, 7), C(5, 8)],
    [C(7, 7), C(8, 7)], [C(8, 6), C(8, 7)],
  ],

  doors: [
    { a: C(2, 0), b: C(3, 0), open: false, locked: true },
    { a: C(4, 0), b: C(5, 0), open: false },
    { a: C(4, 1), b: C(4, 2), open: false },
    { a: C(7, 0), b: C(7, 1), open: false },
    { a: C(0, 4), b: C(0, 5), open: false },
    { a: C(1, 4), b: C(2, 4), open: false },
    { a: C(6, 4), b: C(7, 4), open: false },
    { a: C(7, 4), b: C(8, 4), open: false },
    { a: C(4, 6), b: C(4, 7), open: false },
    { a: C(4, 7), b: C(4, 8), open: false },
    { a: C(1, 7), b: C(1, 8), open: false },
  ],

  portals: [
    { cell: C(1, 1), color: 'turquesa' },
    { cell: C(7, 1), color: 'turquesa' },
    { cell: C(1, 7), color: 'turquesa' },
    { cell: C(7, 7), color: 'turquesa' },
  ],

  startAreas: [
    [C(2, 3), C(2, 4), C(2, 5)], // Jogador 1 (esquerda)
    [C(6, 3), C(6, 4), C(6, 5)], // Jogador 2 (direita)
    [C(3, 6), C(4, 6), C(5, 6)], // Jogador 3 (baixo)
    [C(3, 2), C(4, 2), C(5, 2)], // Jogador 4 (cima)
  ],

  entryMarkers: [C(4, 1), C(1, 4), C(7, 4), C(4, 7)],

  exploration: [
    C(1, 1), C(2, 1), C(1, 2), C(6, 1), C(7, 1), C(7, 2),
    C(1, 6), C(1, 7), C(2, 7), C(7, 6), C(6, 7), C(7, 7),
  ],

  missionMarkers: [],
  // Bomba da cor da Guilda na ponta extrema oposta à sua Área Inicial
  missionMarkersByArea: [C(8, 5), C(0, 5), C(5, 0), C(5, 8)],

  monsters: [
    { type: 'orc', cell: C(2, 1) }, { type: 'orc', cell: C(1, 2) },
    { type: 'orc', cell: C(6, 1) }, { type: 'orc', cell: C(7, 2) },
    { type: 'orc', cell: C(1, 6) }, { type: 'orc', cell: C(2, 7) },
    { type: 'orc', cell: C(7, 6) }, { type: 'orc', cell: C(6, 7) },
    { type: 'goblin', cell: C(5, 0) }, { type: 'goblin', cell: C(0, 5) },
    { type: 'goblin', cell: C(8, 5) }, { type: 'goblin', cell: C(5, 8) },
    { type: 'feral_lanceiro', cell: C(7, 0) }, { type: 'feral_martelador', cell: C(7, 0) },
    { type: 'feral_lanceiro', cell: C(1, 8) }, { type: 'feral_martelador', cell: C(1, 8) },
    { type: 'irma_prazer', cell: C(8, 1) },
    { type: 'irma_dor', cell: C(0, 7) },
  ],

  missions: {
    pve: [
      { id: 'bomba', name: 'Recuperar a Bomba', kind: 'pve', text: 'Recupere o marcador de Missão da cor da sua Guilda (do outro lado do mapa).', rule: 'collect_own', title: 'protetor_fogo' },
      { id: 'irma', name: 'Matar uma Irmã', kind: 'pve', text: 'Mate a Irmã da Dor ou a Irmã do Prazer. Dá uma carta de Recompensa (Bomba). Máximo de 2 jogadores.', rule: 'kill_type', types: ['irma_dor', 'irma_prazer'], reward: true, maxCompletions: 2 },
    ],
    rewards: ['bomba', 'bomba'],
  },

  boxOnDeath: ['irma_dor', 'irma_prazer'],
  gateGuardTitle: 'guardiao_portao',
  labels: [{ cells: [C(1, 0), C(2, 0)], text: 'ESCONDERIJO DO TROLL' }],
  lockTitle: 'cacador_trolls',
  hideout: { cells: [C(1, 0), C(2, 0)], cards: ['saco_ossos'] },
  notes: [
    'Cada Guilda precisa recuperar a Bomba da SUA cor, colocada na ponta oposta à sua Área Inicial.',
    'As Irmãs voltam para a caixa quando morrem (no máximo 2 jogadores completam "Matar uma Irmã").',
    'Título "Protetor do Fogo" para quem recupera a sua Bomba (vale no Templo). Com o Título "Guardião do Portão", os Monstros do Cemitério não voltam ao tabuleiro.',
    'Esconderijo do Troll: a porta trancada só abre para quem tem o Título "Caçador de Trolls" (A Mansão); dentro há o Saco de Ossos.',
  ],
};
