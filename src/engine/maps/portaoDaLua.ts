import type { Cell } from '../types';
import type { MapDef } from '../board';

// O Portão da Lua — Círculo Exterior (Livro de Campanha p.8-9).
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2            |    5A    |
//   r3-5      8A    |    1A    |    2A
//   r6-8      9A    |    7B    |    6A
const C = (c: number, r: number): Cell => ({ c, r });

export const PORTAO_DA_LUA: MapDef = {
  id: 'portao-da-lua',
  name: 'O Portão da Lua',
  circle: 'Círculo Exterior',
  difficulty: 'medio',
  level: '1',
  cols: 9,
  rows: 9,
  boards: [
    { code: '5A', c: 3, r: 0 },
    { code: '8A', c: 0, r: 3 }, { code: '1A', c: 3, r: 3 }, { code: '2A', c: 6, r: 3 },
    { code: '9A', c: 0, r: 6 }, { code: '7B', c: 3, r: 6 }, { code: '6A', c: 6, r: 6 },
  ],

  pillars: [C(0, 4), C(8, 4), C(8, 5), C(3, 5), C(5, 5), C(7, 8)],
  rooms: [C(3, 0), C(5, 0), C(3, 3), C(5, 3), C(2, 5), C(6, 5), C(2, 6), C(6, 6), C(4, 7), C(3, 8), C(4, 8), C(5, 8)],

  walls: [
    [C(3, 0), C(4, 0)], [C(4, 0), C(5, 0)],
    [C(2, 3), C(2, 4)], [C(2, 3), C(3, 3)],
    [C(3, 2), C(3, 3)], [C(3, 3), C(3, 4)],
    [C(5, 2), C(5, 3)], [C(5, 3), C(5, 4)], [C(5, 3), C(6, 3)],
    [C(6, 3), C(6, 4)],
    [C(1, 5), C(2, 5)], [C(2, 5), C(2, 6)],
    [C(2, 6), C(3, 6)], [C(2, 6), C(2, 7)],
    [C(6, 5), C(7, 5)], [C(6, 5), C(6, 6)],
    [C(5, 6), C(6, 6)], [C(6, 6), C(6, 7)],
    [C(4, 6), C(4, 7)],
    [C(0, 5), C(0, 6)], [C(0, 6), C(1, 6)], [C(0, 8), C(1, 8)],
    [C(7, 6), C(8, 6)],
    // revisão dos mapas
    [C(3, 7), C(3, 8)], [C(5, 7), C(5, 8)], [C(5, 8), C(6, 8)], [C(2, 8), C(3, 8)],
  ],

  doors: [
    { a: C(3, 0), b: C(3, 1), open: false },
    { a: C(5, 0), b: C(5, 1), open: false },
    { a: C(3, 3), b: C(4, 3), open: false },
    { a: C(4, 3), b: C(5, 3), open: false },
    { a: C(1, 3), b: C(1, 4), open: false },
    { a: C(7, 3), b: C(7, 4), open: false },
    { a: C(0, 7), b: C(1, 7), open: false },
    { a: C(7, 7), b: C(8, 7), open: false },
    { a: C(2, 4), b: C(2, 5), open: true },
    { a: C(6, 4), b: C(6, 5), open: true },
    { a: C(1, 6), b: C(2, 6), open: true },
    { a: C(6, 6), b: C(7, 6), open: true },
    { a: C(3, 7), b: C(4, 7), open: true },
    { a: C(4, 7), b: C(5, 7), open: true },
  ],

  portals: [
    { cell: C(2, 4), color: 'turquesa' }, { cell: C(6, 4), color: 'turquesa' },
    { cell: C(2, 7), color: 'turquesa' }, { cell: C(6, 7), color: 'turquesa' },
    { cell: C(4, 2), color: 'rosa' }, { cell: C(4, 7), color: 'rosa' },
  ],

  startAreas: [
    [C(0, 6), C(0, 7), C(0, 8)], // Jogador 1
    [C(8, 6), C(8, 7), C(8, 8)], // Jogador 2
    [C(0, 3), C(1, 3), C(2, 3)], // Jogador 3
    [C(6, 3), C(7, 3), C(8, 3)], // Jogador 4
  ],

  entryMarkers: [C(3, 1), C(4, 1), C(5, 1), C(4, 4), C(4, 6)],

  exploration: [
    C(3, 1), C(5, 1), C(4, 4), C(4, 4), C(1, 5), C(4, 5),
    C(7, 5), C(1, 6), C(4, 6), C(7, 6), C(4, 7), C(4, 7),
  ],

  // Marcadores do Portão: ficam no tabuleiro (pisar neles fecha parte do Portão)
  missionMarkers: [{ cell: C(3, 3), color: 'vermelho' }, { cell: C(5, 3), color: 'verde' }],

  monsters: [
    { type: 'capitao_orc', cell: C(3, 0) }, { type: 'capitao_orc', cell: C(5, 0) },
    { type: 'goblin', cell: C(4, 1) }, { type: 'goblin', cell: C(3, 4) }, { type: 'goblin', cell: C(5, 4) },
    { type: 'goblin', cell: C(4, 6) }, { type: 'goblin', cell: C(3, 7) }, { type: 'goblin', cell: C(5, 7) },
    { type: 'orc', cell: C(4, 4) }, { type: 'orc', cell: C(2, 5) }, { type: 'orc', cell: C(6, 5) },
    { type: 'orc', cell: C(2, 6) }, { type: 'orc', cell: C(6, 6) }, { type: 'orc', cell: C(4, 7) },
    { type: 'feral_martelador', cell: C(3, 3) }, { type: 'feral_martelador', cell: C(5, 3) },
  ],

  missions: {
    pve: [
      { id: 'portao', name: 'Fechar o Portão', kind: 'pve', text: 'Pise no marcador de Missão Vermelho ou Verde (sem Inimigos no Espaço) para fechar o portão: remove 1 Entrada de Monstro. Dá o Título "Guardião do Portão" (vantagem na campanha) só ao primeiro: os outros podem completar a Missão, mas sem o Título.', rule: 'step_on', colors: ['vermelho', 'verde'], removeEntry: true, title: 'guardiao_portao', titleFirstOnly: true },
      { id: 'capitao', name: 'Matar o Capitão Orc', kind: 'pve', text: 'Mate um Capitão Orc. Dá uma carta de Recompensa (Espada do Capitão). Máximo de 2 jogadores.', rule: 'kill_type', types: ['capitao_orc'], reward: true, maxCompletions: 2 },
    ],
    rewards: ['espada_capitao', 'espada_capitao'],
  },
  boxOnDeath: ['capitao_orc'],

  notes: [
    'Os marcadores do Portão não saem do tabuleiro: cada Guilda pode pisar uma vez e remove a Entrada de Monstro mais perto da sua Área Inicial.',
    'Os Capitães Orcs voltam para a caixa quando morrem.',
    'Título "Guardião do Portão" (primeiro a fechar): vale no Distrito do Alquimista.',
  ],
};
