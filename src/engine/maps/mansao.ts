import type { Cell } from '../types';
import type { MapDef } from '../board';

// A Mansão — Círculo Exterior (Livro de Campanha p.12-13). Mapa 9x6.
//
//          c0 c1 c2 | c3 c4 c5 | c6 c7 c8
//   r0-2      8B    |    2B    |    4B
//   r3-5      6A    |    7B    |    5B
//
// No centro, o salão de Schmetterling (o Troll) e o depósito com os 4 nobres (marcadores de Missão).
const C = (c: number, r: number): Cell => ({ c, r });

export const MANSAO: MapDef = {
  id: 'mansao',
  name: 'A Mansão',
  circle: 'Círculo Exterior',
  difficulty: 'dificil',
  level: '1',
  cols: 9,
  rows: 6,
  boards: [
    { code: '8B', c: 0, r: 0 }, { code: '2B', c: 3, r: 0 }, { code: '4B', c: 6, r: 0 },
    { code: '6A', c: 0, r: 3 }, { code: '7B', c: 3, r: 3 }, { code: '5B', c: 6, r: 3 },
  ],

  // sala de jantar (mesa comprida)
  pillars: [C(0, 4), C(0, 5), C(8, 5)],
  rooms: [C(3, 0), C(4, 0), C(5, 0), C(0, 2), C(2, 2), C(3, 2), C(4, 2), C(5, 2), C(6, 2), C(8, 2), C(2, 3), C(3, 3), C(4, 3), C(5, 3), C(6, 3), C(4, 4), C(8, 3), C(8, 4)],

  walls: [
    // Áreas Iniciais
    [C(0, 0), C(0, 1)], [C(1, 0), C(1, 1)],
    [C(7, 0), C(7, 1)], [C(8, 0), C(8, 1)],
    [C(1, 5), C(1, 4)], [C(2, 5), C(3, 5)],
    [C(6, 5), C(5, 5)], [C(7, 5), C(7, 4)], [C(7, 5), C(8, 5)],
    // sala de cima (portais turquesa e magenta): fechada, só se entra pelos portais
    [C(2, 0), C(3, 0)], [C(5, 0), C(6, 0)], [C(3, 0), C(3, 1)], [C(4, 0), C(4, 1)], [C(5, 0), C(5, 1)],
    // salão do meio (linha 2)
    [C(0, 2), C(0, 1)], [C(0, 2), C(0, 3)],
    // os Espaços dos Saqueadores (1,2) e (7,2) são abertos em cima: só as portas dos lados
    [C(2, 2), C(2, 1)], [C(3, 2), C(3, 1)], [C(4, 2), C(4, 1)], [C(5, 2), C(5, 1)], [C(6, 2), C(6, 1)],
    [C(3, 2), C(3, 3)], [C(5, 2), C(5, 3)],
    [C(8, 2), C(8, 1)], [C(8, 2), C(8, 3)],
    // salas dos Capitães e o depósito dos nobres (linha 3)
    [C(2, 3), C(1, 3)], [C(2, 3), C(2, 4)], [C(2, 3), C(3, 3)],
    [C(3, 3), C(3, 4)], [C(5, 3), C(5, 4)], [C(5, 3), C(6, 3)],
    [C(6, 3), C(7, 3)], [C(6, 3), C(6, 4)],
    // corredor do tapete vermelho (nicho do portal rosa: fechado embaixo, só se entra pelo depósito ou pelo portal)
    [C(4, 4), C(3, 4)], [C(4, 4), C(5, 4)], [C(4, 4), C(4, 5)],
  ],

  doors: [
    // Portas fechadas x9
    { a: C(1, 0), b: C(2, 0), open: false },
    { a: C(6, 0), b: C(7, 0), open: false },
    { a: C(0, 2), b: C(1, 2), open: false },
    { a: C(2, 2), b: C(2, 3), open: false },
    { a: C(4, 2), b: C(4, 3), open: false },
    { a: C(6, 2), b: C(6, 3), open: false },
    { a: C(7, 2), b: C(8, 2), open: false },
    { a: C(2, 4), b: C(2, 5), open: false },
    { a: C(6, 4), b: C(6, 5), open: false },
    // Portas pequenas fechadas x4
    { a: C(1, 2), b: C(2, 2), open: false, small: true },
    { a: C(2, 2), b: C(3, 2), open: false, small: true },
    { a: C(5, 2), b: C(6, 2), open: false, small: true },
    { a: C(6, 2), b: C(7, 2), open: false, small: true },
  ],

  portals: [
    { cell: C(3, 0), color: 'turquesa' }, { cell: C(0, 2), color: 'turquesa' }, { cell: C(8, 2), color: 'turquesa' },
    { cell: C(5, 0), color: 'magenta' }, { cell: C(4, 4), color: 'magenta' },
  ],

  startAreas: [
    [C(1, 5), C(2, 5)],
    [C(6, 5), C(7, 5)],
    [C(7, 0), C(8, 0)],
    [C(0, 0), C(1, 0)],
  ],

  entryMarkers: [C(5, 0), C(3, 3), C(4, 3), C(5, 3)],

  exploration: [
    C(4, 1), C(4, 1), C(3, 2), C(4, 2), C(5, 2), C(2, 3),
    C(2, 3), C(4, 3), C(6, 3), C(6, 3), C(4, 5), C(4, 5),
  ],

  missionMarkers: [
    { cell: C(3, 3), color: 'laranja' }, { cell: C(3, 3), color: 'verde' },
    { cell: C(5, 3), color: 'azul' }, { cell: C(5, 3), color: 'vermelho' },
  ],

  monsters: [
    // Saqueador Orc x5
    { type: 'orc', cell: C(5, 0) }, { type: 'orc', cell: C(5, 0) }, { type: 'orc', cell: C(1, 2) }, { type: 'orc', cell: C(7, 2) }, { type: 'orc', cell: C(4, 3) },
    // Arqueiro Goblin x4
    { type: 'goblin', cell: C(4, 1) }, { type: 'goblin', cell: C(3, 3) }, { type: 'goblin', cell: C(5, 3) }, { type: 'goblin', cell: C(4, 5) },
    // Capitão Orc x2
    { type: 'capitao_orc', cell: C(2, 3) }, { type: 'capitao_orc', cell: C(6, 3) },
    // Feral Martelador x2
    { type: 'feral_martelador', cell: C(2, 2) }, { type: 'feral_martelador', cell: C(6, 2) },
    // Schmetterling (carta do Troll)
    { type: 'troll', cell: C(4, 2) },
  ],

  missions: {
    pve: [
      { id: 'troll', name: 'Matar o Troll', kind: 'pve', text: 'Mate Schmetterling, o Troll Chefe de Cozinha. Dá o Título "Caçador de Trolls".', rule: 'kill_type', types: ['troll'], title: 'cacador_trolls' },
      { id: 'nobres', name: 'Salvar os Nobres', kind: 'pve', text: 'Recupere 1 marcador de Missão (um nobre). Cada jogador recupera só 1; os 2 primeiros ganham uma Recompensa (Coração de Anjos).', rule: 'collect_any', reward: true },
    ],
    rewards: ['coracao_anjos', 'coracao_anjos'],
  },
  boxOnDeath: ['troll'],
  notes: [
    'Schmetterling usa a carta do Troll. Quem matá-lo vira "Caçador de Trolls": abre os Esconderijos do Troll no Distrito do Alquimista e na Praça da Aurora Vermelha.',
  ],
};
