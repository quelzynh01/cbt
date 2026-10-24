import type { Cell } from '../types';
import type { MapDef } from '../board';

// Praça da Aurora Vermelha — Círculo Interior (Livro de Campanha p.18-19). Mapa 9x9.
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2      9A    |    1A    |    7A
//   r3-5      3A    |    4A    |    2B
//   r6-8      6A    |    8B    |    5B
//
// No centro, a estátua do rei. Os dois Espaços laranja com "!" são o destino da Resistência.
const C = (c: number, r: number): Cell => ({ c, r });

export const PRACA_AURORA: MapDef = {
  id: 'praca-da-aurora-vermelha',
  name: 'Praça da Aurora Vermelha',
  circle: 'Círculo Interior',
  difficulty: 'medio',
  level: '4-5',
  cols: 9,
  rows: 9,
  boards: [
    { code: '9A', c: 0, r: 0 }, { code: '1A', c: 3, r: 0 }, { code: '7A', c: 6, r: 0 },
    { code: '3A', c: 0, r: 3 }, { code: '4A', c: 3, r: 3 }, { code: '2B', c: 6, r: 3 },
    { code: '6A', c: 0, r: 6 }, { code: '8B', c: 3, r: 6 }, { code: '5B', c: 6, r: 6 },
  ],

  // estátua do rei (centro) e a sala de jantar
  pillars: [C(4, 4), C(0, 7), C(0, 8), C(5, 0), C(3, 0), C(0, 3), C(8, 6), C(8, 7), C(8, 8), C(0, 0), C(8, 0)],
  rooms: [C(0, 0), C(8, 0), C(2, 2), C(3, 2), C(5, 2), C(6, 2), C(0, 3), C(8, 3), C(2, 4), C(6, 4), C(0, 5), C(2, 6), C(3, 6), C(5, 6), C(6, 6), C(2, 5), C(2, 3), C(6, 5), C(6, 3), C(8, 5), C(8, 4)],

  walls: [
    // Áreas Iniciais
    [C(1, 0), C(0, 0)], [C(2, 0), C(3, 0)], [C(2, 0), C(2, 1)],
    [C(6, 0), C(5, 0)], [C(7, 0), C(8, 0)], [C(6, 0), C(6, 1)],
    [C(1, 8), C(0, 8)], [C(2, 8), C(3, 8)], [C(2, 8), C(2, 7)],
    [C(6, 8), C(5, 8)], [C(7, 8), C(8, 8)], [C(6, 8), C(6, 7)],
    // salas de cima
    [C(2, 2), C(2, 1)], [C(3, 2), C(3, 1)], [C(2, 2), C(2, 3)], [C(3, 2), C(4, 2)],
    [C(5, 2), C(5, 1)], [C(6, 2), C(6, 1)], [C(5, 2), C(4, 2)], [C(6, 2), C(6, 3)],
    // salas de baixo
    [C(2, 6), C(2, 5)], [C(2, 6), C(2, 7)], [C(3, 6), C(3, 7)], [C(3, 6), C(4, 6)],
    [C(5, 6), C(4, 6)], [C(5, 6), C(5, 7)], [C(6, 6), C(6, 5)], [C(6, 6), C(6, 7)],
    // destinos da Resistência ("!")
    // sala do marcador Verde
    // Esconderijo do Troll
    [C(0, 5), C(1, 5)], [C(0, 5), C(0, 6)],
    // revisão dos mapas
    [C(7, 5), C(8, 5)], [C(7, 3), C(8, 3)], [C(8, 2), C(8, 3)], [C(1, 3), C(2, 3)], [C(0, 0), C(0, 1)], [C(8, 0), C(8, 1)], [C(1, 5), C(2, 5)], [C(2, 5), C(3, 5)], [C(5, 5), C(6, 5)], [C(2, 4), C(3, 4)], [C(2, 3), C(3, 3)], [C(5, 3), C(6, 3)], [C(5, 4), C(6, 4)], [C(6, 3), C(7, 3)], [C(6, 5), C(7, 5)],
  ],

  doors: [
    // Portas fechadas x6
    { a: C(1, 0), b: C(1, 1), open: false },
    { a: C(7, 0), b: C(7, 1), open: false },
    { a: C(1, 7), b: C(1, 8), open: false },
    { a: C(7, 7), b: C(7, 8), open: false },
    { a: C(1, 4), b: C(2, 4), open: false },
    { a: C(6, 4), b: C(7, 4), open: false },
    // Porta trancada x1: Esconderijo do Troll (só para o "Caçador de Trolls")
    { a: C(0, 4), b: C(0, 5), open: false, locked: true },
    // Portas pequenas abertas x4
    { a: C(3, 2), b: C(3, 3), open: true, small: true },
    { a: C(5, 2), b: C(5, 3), open: true, small: true },
    { a: C(3, 5), b: C(3, 6), open: true, small: true },
    { a: C(5, 5), b: C(5, 6), open: true, small: true },
    // Portas abertas x9
    { a: C(1, 2), b: C(2, 2), open: true },
    { a: C(2, 2), b: C(3, 2), open: true },
    { a: C(5, 2), b: C(6, 2), open: true },
    { a: C(6, 2), b: C(7, 2), open: true },
    { a: C(1, 6), b: C(2, 6), open: true },
    { a: C(2, 6), b: C(3, 6), open: true },
    { a: C(5, 6), b: C(6, 6), open: true },
    { a: C(6, 6), b: C(7, 6), open: true },
    { a: C(7, 4), b: C(8, 4), open: true },
  ],

  portals: [
    { cell: C(4, 1), color: 'turquesa' }, { cell: C(1, 2), color: 'turquesa' }, { cell: C(7, 2), color: 'turquesa' },
    { cell: C(1, 6), color: 'turquesa' }, { cell: C(7, 6), color: 'turquesa' }, { cell: C(4, 7), color: 'turquesa' },
  ],

  startAreas: [
    [C(1, 0), C(2, 0)],
    [C(6, 8), C(7, 8)],
    [C(6, 0), C(7, 0)],
    [C(1, 8), C(2, 8)],
  ],

  entryMarkers: [C(1, 2), C(7, 2), C(1, 6), C(7, 6)],

  exploration: [
    C(3, 1), C(5, 1), C(4, 2), C(1, 3), C(4, 3), C(7, 3),
    C(1, 5), C(4, 5), C(7, 5), C(4, 6), C(3, 7), C(5, 7),
  ],

  missionMarkers: [
    { cell: C(0, 4), color: 'vermelho' }, { cell: C(8, 4), color: 'verde' },
    { cell: C(3, 4), color: 'laranja' }, { cell: C(5, 4), color: 'azul' },
  ],

  monsters: [
    // Saqueador Orc
    { type: 'orc', cell: C(4, 1) }, { type: 'orc', cell: C(1, 3) }, { type: 'orc', cell: C(7, 3) },
    { type: 'orc', cell: C(1, 5) }, { type: 'orc', cell: C(7, 5) }, { type: 'orc', cell: C(4, 7) },
    // Arqueiro Goblin
    { type: 'goblin', cell: C(4, 1) }, { type: 'goblin', cell: C(1, 3) }, { type: 'goblin', cell: C(7, 3) },
    { type: 'goblin', cell: C(1, 5) }, { type: 'goblin', cell: C(7, 5) }, { type: 'goblin', cell: C(4, 7) },
    // Feral Lanceiro x2
    { type: 'feral_lanceiro', cell: C(4, 3) }, { type: 'feral_lanceiro', cell: C(4, 5) },
    // Irmã do Prazer x2 e Irmã da Dor x2 (guardas da execução)
    { type: 'irma_prazer', cell: C(3, 4) }, { type: 'irma_prazer', cell: C(5, 4) },
    { type: 'irma_dor', cell: C(2, 4) }, { type: 'irma_dor', cell: C(6, 4) },
  ],
  // a Sombra do Lorde Presas só entra quando alguém pisa nos marcadores Vermelho ou Verde
  reserve: ['lorde_presas'],

  missions: {
    pve: [
      { id: 'resistencia', name: 'Ajudar a Resistência', kind: 'pve', text: 'Pegue o marcador Laranja ou Azul (um líder da Resistência) e leve-o a um Espaço "!" sem Inimigos. Dá o Título "Líder Rebelde".', rule: 'escort', colors: ['laranja', 'azul'], escortTo: [C(2, 4), C(6, 4)], title: 'lider_rebelde' },
      { id: 'lorde', name: 'Matar o Lorde Presas', kind: 'pve', text: 'Pise no marcador Vermelho ou Verde para tentar invocar a Sombra do Lorde Presas numa Entrada de Monstro; quem matá-la ganha a Recompensa (Coroa de Sangue).', rule: 'summon', colors: ['vermelho', 'verde'], summon: 'lorde_presas', types: ['lorde_presas'], reward: true },
    ],
    rewards: ['coroa_sangue'],
  },
  boxOnDeath: ['lorde_presas', 'irma_prazer', 'irma_dor'],
  lockTitle: 'cacador_trolls',
  hideout: { cells: [C(0, 5)], cards: ['machado_schmetterling'] },
  weakOrcsTitle: 'destruidor_pedra',
  labels: [{ cells: [C(0, 5)], text: 'ESCONDERIJO' }, { cells: [C(2, 4)], text: '!' }, { cells: [C(6, 4)], text: '!' }],
  notes: [
    'Resistência: leve o marcador Laranja ou Azul até um Espaço "!" (laranja, ao lado da estátua).',
    'Pisar no marcador Vermelho ou Verde rola 2 dados contra as Entradas de Monstro: se sair uma livre, a Sombra do Lorde Presas aparece nela.',
    'Esconderijo do Troll: a porta só abre para quem tem o Título "Caçador de Trolls" (A Mansão); dentro há o Machado de Schmetterling.',
  ],
};
