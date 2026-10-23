import type { Cell } from '../types';
import type { MapDef } from '../board';

// Distrito dos Martelos — Círculo Exterior (Livro de Campanha p.4-5).
// Grade 9x9 de Espaços: cada tabuleiro físico = 3x3 Espaços.
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2            |    8A    |    4B
//   r3-5      7A    |    3B    |    6A
//   r6-8      2A    |    9A    |
//
// Coordenadas (c, r): c = coluna (esq→dir), r = linha (cima→baixo), como no mapa impresso.
const C = (c: number, r: number): Cell => ({ c, r });

export const DISTRITO_DOS_MARTELOS: MapDef = {
  id: 'distrito-dos-martelos',
  name: 'Distrito dos Martelos',
  circle: 'Círculo Exterior',
  difficulty: 'facil',
  level: '1',
  notes: ['Só 2 jogadores podem completar "Encontrar as Armas Perdidas" (2 cartas Quebra-Crânio).'],
  cols: 9,
  rows: 9,
  boards: [
    { code: '8A', c: 3, r: 0 },
    { code: '4B', c: 6, r: 0 },
    { code: '7A', c: 0, r: 3 },
    { code: '3B', c: 3, r: 3 },
    { code: '6A', c: 6, r: 3 },
    { code: '2A', c: 0, r: 6 },
    { code: '9A', c: 3, r: 6 },
  ],

  // Espaços sem ponto central (salas fechadas/decoração) — bloqueiam Movimento e Linha de Visão.
  pillars: [C(6, 0), C(6, 2), C(7, 5), C(2, 6)],

  // Espaços internos (apenas visual: piso de madeira).
  rooms: [C(5, 2), C(8, 1), C(8, 2), C(6, 3), C(3, 3), C(5, 5), C(2, 5), C(3, 6), C(0, 6), C(0, 7), C(0, 8), C(1, 8), C(2, 8)],

  // Paredes (bordas cinzas texturizadas). Bordas com Espaço bloqueado ou fora do tabuleiro já são paredes.
  walls: [
    // Área inicial J1 / 8A
    [C(5, 0), C(5, 1)],
    [C(5, 1), C(5, 2)], [C(4, 2), C(5, 2)], [C(3, 2), C(3, 3)],
    // 4B
    [C(8, 0), C(8, 1)], [C(7, 2), C(8, 2)], [C(8, 2), C(8, 3)],
    // 3B
    [C(2, 3), C(3, 3)], [C(5, 5), C(6, 5)], [C(5, 5), C(5, 6)],
    // 7A / Área inicial J3
    [C(0, 3), C(1, 3)], [C(0, 5), C(1, 5)], [C(0, 5), C(0, 6)], [C(2, 4), C(2, 5)], [C(1, 5), C(2, 5)],
    // 6A / Área inicial J4
    [C(7, 3), C(8, 3)], [C(6, 3), C(7, 3)], [C(6, 3), C(6, 4)],
    // 2A
    [C(0, 6), C(1, 6)], [C(1, 7), C(1, 8)], [C(2, 7), C(2, 8)], [C(2, 8), C(3, 8)],
    // 9A / Área inicial J2
    [C(3, 6), C(4, 6)], [C(3, 6), C(3, 7)], [C(3, 7), C(3, 8)], [C(5, 7), C(5, 8)],
    // revisão dos mapas
    [C(3, 1), C(4, 1)], [C(3, 1), C(3, 2)],
  ],

  doors: [
    // Portas fechadas x8
    { a: C(4, 0), b: C(4, 1), open: false },
    { a: C(0, 4), b: C(1, 4), open: false },
    { a: C(7, 4), b: C(8, 4), open: false },
    { a: C(4, 7), b: C(4, 8), open: false },
    { a: C(5, 2), b: C(5, 3), open: false },
    { a: C(5, 3), b: C(6, 3), open: false },
    { a: C(2, 5), b: C(3, 5), open: false },
    { a: C(3, 5), b: C(3, 6), open: false },
    // Portas pequenas fechadas x4
    { a: C(3, 3), b: C(4, 3), open: false, small: true },
    { a: C(3, 3), b: C(3, 4), open: false, small: true },
    { a: C(5, 4), b: C(5, 5), open: false, small: true },
    { a: C(4, 5), b: C(5, 5), open: false, small: true },
    // Portas abertas x2
    { a: C(7, 1), b: C(8, 1), open: true },
    { a: C(0, 7), b: C(1, 7), open: true },
  ],

  portals: [
    { cell: C(5, 1), color: 'turquesa' },
    { cell: C(7, 3), color: 'turquesa' },
    { cell: C(1, 5), color: 'turquesa' },
    { cell: C(3, 7), color: 'turquesa' },
  ],

  // Áreas Iniciais dos Jogadores 1..4
  startAreas: [
    [C(3, 0), C(4, 0), C(5, 0)],
    [C(3, 8), C(4, 8), C(5, 8)],
    [C(0, 3), C(0, 4), C(0, 5)],
    [C(8, 3), C(8, 4), C(8, 5)],
  ],

  entryMarkers: [C(8, 2), C(5, 3), C(3, 5), C(0, 6)],

  exploration: [
    C(5, 1), C(7, 1), C(8, 1), C(4, 3), C(3, 4), C(5, 4),
    C(7, 3), C(1, 5), C(4, 5), C(3, 7), C(0, 7), C(1, 7),
  ],

  missionMarkers: [
    { cell: C(3, 3), color: 'vermelho' },
    { cell: C(5, 5), color: 'azul' },
  ],

  monsters: [
    // Saqueador Orc x8
    { type: 'orc', cell: C(4, 1) },
    { type: 'orc', cell: C(8, 2) },
    { type: 'orc', cell: C(3, 3) },
    { type: 'orc', cell: C(2, 4) },
    { type: 'orc', cell: C(6, 4) },
    { type: 'orc', cell: C(5, 5) },
    { type: 'orc', cell: C(1, 6) },
    { type: 'orc', cell: C(4, 6) },
    // Arqueiro Goblin x6
    { type: 'goblin', cell: C(5, 2) },
    { type: 'goblin', cell: C(8, 2) },
    { type: 'goblin', cell: C(6, 3) },
    { type: 'goblin', cell: C(2, 5) },
    { type: 'goblin', cell: C(3, 6) },
    { type: 'goblin', cell: C(0, 6) },
  ],

  missions: {
    pve: [
      { id: 'armas', name: 'Encontrar as Armas Perdidas', kind: 'pve', text: 'Recupere 1 marcador de Missão (vermelho ou azul). Dá uma carta de Recompensa (Quebra-Crânio). Máximo de 2 jogadores.', maxCompletions: 2, rule: 'collect_any', reward: true },
      { id: 'monstros3', name: 'Matar 3 Monstros', kind: 'pve', text: 'Mate 3 Monstros (Orcs ou Goblins).', rule: 'kill_count', count: 3 },
    ],
    rewards: ['quebra_cranio', 'quebra_cranio'],
  },
};
