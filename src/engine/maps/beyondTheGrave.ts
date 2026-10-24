import type { Cell } from '../types';
import type { MapDef } from '../board';

// Beyond the Grave — os 9 cenários do Livro de Campanha (ref/regras-beyond-the-grave.pdf, p.10-27).
// Posições lidas das imagens dos mapas (grade de 3x3 Espaços por tabuleiro). Os Monstros são os do livro:
// SK Esqueleto · AZ Zumbi Arremessador · SZ Zumbi Retalhador · GH Fantasma · NC Necromante · IV Ivan ·
// FR Frank · DS Dr. Spider · DK Rei Pavoroso.
const C = (c: number, r: number): Cell => ({ c, r });
const many = (type: string, ...cells: Cell[]) => cells.map(cell => ({ type, cell }));
const kill = (id: string, name: string, type: string, extra: Partial<MapDef['missions']['pve'][number]> = {}) =>
  ({ id, name, kind: 'pve' as const, text: `Mate ${name.replace(/^Matar /, '')}.`, rule: 'kill_type' as const, types: [type], ...extra });

// ------------------------------------------------------------------ Círculo Exterior
export const QUARTEL_ASSOMBRADO: MapDef = {
  id: 'quartel-assombrado', name: 'Quartel Assombrado', circle: 'Círculo Exterior', difficulty: 'facil', level: '1',
  cols: 9, rows: 6,
  boards: [{ code: '2A', c: 0, r: 0 }, { code: '3A', c: 3, r: 0 }, { code: '10B', c: 6, r: 0 }, { code: '6A', c: 0, r: 3 }, { code: '1A', c: 3, r: 3 }, { code: '12A', c: 6, r: 3 }],
  pillars: [C(8, 4), C(8, 5), C(3, 5), C(5, 5), C(3, 0), C(4, 0), C(5, 0), C(8, 0), C(8, 1)], rooms: [C(6, 5), C(7, 5), C(2, 5), C(1, 5), C(0, 5), C(0, 4), C(0, 2), C(0, 1), C(0, 0), C(1, 0), C(2, 0), C(6, 0), C(7, 0)],
  // paredes revisadas pelas bordas de pedra do mapa do livro: salas das Áreas Iniciais fechadas dos lados,
  // salas dos cantos (marcador de Missão) só pelo portal, salas desbotadas fechadas
  walls: [
    // em cima
    ...[1, 2, 3, 4, 5, 6, 7, 8].map(c => [C(c, 0), C(c, 1)] as [Cell, Cell]),
    [C(2, 0), C(3, 0)], [C(5, 0), C(6, 0)], 
    [C(0, 1), C(1, 1)], [C(0, 2), C(1, 2)], [C(0, 2), C(0, 3)],
    // embaixo (espelhado)
    ...[1, 2, 3, 4, 5, 6, 7, 8].map(c => [C(c, 4), C(c, 5)] as [Cell, Cell]),
    [C(2, 5), C(3, 5)], [C(5, 5), C(6, 5)], 
    [C(0, 3), C(0, 4)], [C(0, 4), C(1, 4)], 
    // salas das Áreas Iniciais (portas em cima e embaixo)
    [C(1, 2), C(2, 2)], [C(1, 3), C(2, 3)], [C(3, 2), C(4, 2)], [C(3, 3), C(4, 3)], [C(3, 1), C(3, 2)], [C(3, 3), C(3, 4)],
    [C(4, 2), C(5, 2)], [C(4, 3), C(5, 3)], [C(5, 1), C(5, 2)], [C(5, 3), C(5, 4)],
    // revisão dos mapas
    [C(6, 3), C(7, 3)], [C(6, 2), C(7, 2)],
  ],
  doors: [
    { a: C(2, 1), b: C(2, 2), open: false }, { a: C(6, 1), b: C(6, 2), open: false },
    { a: C(2, 3), b: C(2, 4), open: false }, { a: C(6, 3), b: C(6, 4), open: false },
    { a: C(2, 2), b: C(3, 2), open: true, small: true }, { a: C(2, 3), b: C(3, 3), open: true, small: true },
    { a: C(5, 2), b: C(6, 2), open: true, small: true }, { a: C(5, 3), b: C(6, 3), open: true, small: true },
  ],
  portals: [C(1, 0), C(7, 0), C(4, 1), C(4, 4), C(1, 5), C(7, 5)].map(cell => ({ cell, color: 'turquesa' })),
  startAreas: [[C(2, 2), C(3, 2)], [C(5, 3), C(6, 3)], [C(2, 3), C(3, 3)], [C(5, 2), C(6, 2)]],
  entryMarkers: [C(2, 0), C(6, 0), C(2, 5), C(6, 5)],
  exploration: [C(1, 2), C(4, 2), C(4, 2), C(7, 2), C(1, 3), C(4, 3), C(4, 3), C(7, 3)],
  missionMarkers: [{ cell: C(2, 0), color: 'laranja' }, { cell: C(6, 0), color: 'verde' }, { cell: C(2, 5), color: 'vermelho' }, { cell: C(6, 5), color: 'azul' }],
  tombstones: [C(1, 0), C(7, 0), C(2, 1), C(6, 1), C(2, 4), C(6, 4), C(1, 5), C(7, 5)],
  monsters: [
    ...many('esqueleto', C(2, 0), C(6, 0), C(4, 1), C(4, 4), C(2, 5), C(6, 5)),
    ...many('zumbi_retalhador', C(4, 1), C(4, 4)),
    ...many('zumbi_arremessador', C(1, 2), C(7, 2), C(1, 3), C(7, 3)),
  ],
  missions: {
    pve: [
      { id: 'alojamentos', name: 'Investigar os Alojamentos', kind: 'pve', text: 'Tenha um Herói na Área Inicial de outra Guilda sem Inimigos em nenhum Espaço dela. Dá o Título "Orador dos Mortos".', rule: 'enemy_start', title: 'orador_mortos' },
      { id: 'arsenal', name: 'Proteger o Arsenal', kind: 'pve', text: 'Pegue 1 marcador de Missão (sem Inimigos no Espaço). Os 2 primeiros ganham uma Recompensa (Espinha Dorsal).', rule: 'collect_any', reward: true },
    ],
    rewards: ['espinha_dorsal', 'espinha_dorsal'],
  },
  notes: ['Cartas de Lápide: gaste 1 PM no Espaço para revelar (o efeito acontece na hora).', 'Recomendado para começar a campanha.'],
};

export const ABATEDOURO: MapDef = {
  id: 'abatedouro', name: 'Abatedouro', circle: 'Círculo Exterior', difficulty: 'medio', level: '1',
  cols: 6, rows: 12,
  boards: [{ code: '12B', c: 0, r: 0 }, { code: '6A', c: 0, r: 3 }, { code: '9B', c: 3, r: 3 }, { code: '8A', c: 0, r: 6 }, { code: '2B', c: 3, r: 6 }, { code: '11B', c: 0, r: 9 }],
  pillars: [C(0, 2), C(0, 9)], rooms: [C(3, 6), C(4, 6), C(5, 6), C(2, 3), C(0, 5), C(0, 4), C(1, 5), C(2, 5), C(3, 5), C(4, 5), C(5, 5), C(2, 6), C(1, 6), C(0, 6), C(0, 7), C(2, 8)],
  // paredes revisadas pelas bordas de pedra do mapa do livro (metade de baixo = espelho da de cima)
  walls: [
    [C(2, 0), C(2, 1)], [C(2, 2), C(2, 3)], [C(1, 2), C(2, 2)], 
    [C(0, 3), C(0, 4)], [C(0, 4), C(1, 4)], [C(2, 4), C(2, 5)],
    [C(2, 3), C(3, 3)], [C(4, 3), C(5, 3)], [C(3, 3), C(3, 4)], [C(3, 4), C(3, 5)], [C(4, 4), C(4, 5)], [C(5, 4), C(5, 5)], [C(2, 5), C(3, 5)],
    // sala do Ivan: só pela porta de cima
    [C(3, 5), C(3, 6)], [C(5, 5), C(5, 6)], [C(2, 6), C(3, 6)], [C(3, 6), C(3, 7)], [C(4, 6), C(4, 7)], [C(5, 6), C(5, 7)],
    [C(2, 10), C(2, 11)], [C(2, 8), C(2, 9)], [C(1, 9), C(2, 9)], 
    [C(0, 7), C(0, 8)], [C(0, 7), C(1, 7)], [C(2, 6), C(2, 7)],
    [C(2, 8), C(3, 8)], [C(3, 7), C(3, 8)], [C(5, 7), C(5, 8)],
  ],
  doors: [
    { a: C(1, 1), b: C(2, 1), open: false }, { a: C(1, 10), b: C(2, 10), open: false }, { a: C(1, 4), b: C(1, 5), open: false },
    { a: C(1, 6), b: C(1, 7), open: false }, { a: C(4, 5), b: C(4, 6), open: false },
    { a: C(4, 7), b: C(4, 8), open: false }, { a: C(4, 3), b: C(4, 4), open: false }, { a: C(2, 7), b: C(2, 8), open: false }, { a: C(2, 3), b: C(2, 4), open: false },
    { a: C(1, 3), b: C(2, 3), open: false, small: true }, { a: C(1, 8), b: C(2, 8), open: false, small: true },
    { a: C(0, 5), b: C(0, 6), open: true }, { a: C(1, 5), b: C(1, 6), open: true },
  ],
  portals: [...[C(1, 0), C(5, 4), C(5, 7), C(1, 11)].map(cell => ({ cell, color: 'turquesa' })), ...[C(2, 3), C(3, 5), C(5, 5), C(2, 8)].map(cell => ({ cell, color: 'magenta' }))],
  startAreas: [[C(2, 9), C(2, 10)], [C(3, 3), C(4, 3)], [C(2, 1), C(2, 2)], [C(3, 8), C(4, 8), C(5, 8)]],
  entryMarkers: [C(0, 5), C(3, 5), C(5, 5), C(0, 6)],
  exploration: [C(1, 2), C(3, 4), C(0, 5), C(3, 5), C(5, 5), C(0, 6), C(3, 7), C(1, 9)],
  missionMarkers: [{ cell: C(0, 4), color: 'verde' }, { cell: C(0, 4), color: 'vermelho' }, { cell: C(0, 7), color: 'azul' }, { cell: C(0, 7), color: 'laranja' }],
  tombstones: [C(1, 0), C(1, 3), C(2, 4), C(5, 4), C(2, 7), C(5, 7), C(1, 8), C(1, 11)],
  monsters: [
    ...many('esqueleto', C(1, 3), C(2, 3), C(2, 4), C(2, 7), C(1, 8), C(2, 8)),
    ...many('zumbi_retalhador', C(1, 5), C(1, 6)), ...many('necromante', C(1, 5), C(1, 6)),
    ...many('zumbi_arremessador', C(2, 5), C(4, 5), C(4, 5), C(2, 6)),
    ...many('fantasma', C(0, 4), C(0, 7)), ...many('ivan', C(4, 6)),
  ],
  missions: {
    pve: [
      kill('ivan', 'Matar Ivan', 'ivan', { text: 'Mate Ivan. Dá o Título "Mente Mestra".', title: 'mente_mestra' }),
      { id: 'reservas', name: 'Destruir as Reservas', kind: 'pve', text: 'Ataque uma Reserva de Comida (marcador de Missão) como se fosse um personagem: se rolar algum ✷, ela é destruída. Uma por Guilda; os 2 primeiros ganham uma Recompensa (Corrente Flamejante).', rule: 'destroy', reward: true },
    ],
    rewards: ['corrente_flamejante', 'corrente_flamejante'],
  },
  noBanish: ['ivan'],
  notes: ['As Reservas de Comida são atacadas como personagens: um ✷ no ataque as destrói.', 'Ivan não pode ser banido.'],
};

export const CRIPTAS: MapDef = {
  id: 'criptas', name: 'Criptas', circle: 'Círculo Exterior', difficulty: 'medio', level: '1',
  cols: 9, rows: 9,
  boards: [{ code: '12B', c: 0, r: 0 }, { code: '7B', c: 3, r: 0 }, { code: '11B', c: 6, r: 0 }, { code: '2B', c: 0, r: 3 }, { code: '10A', c: 3, r: 3 }, { code: '9B', c: 6, r: 3 }, { code: '4B', c: 0, r: 6 }, { code: '5B', c: 6, r: 6 }],
  pillars: [C(8, 7), C(8, 8), C(6, 8), C(0, 8), C(2, 8)], rooms: [C(2, 3), C(2, 5), C(6, 3), C(6, 5), C(6, 6), C(7, 6), C(2, 4), C(6, 4), C(2, 6), C(1, 6), C(2, 2), C(6, 2)],
  // paredes revisadas pelas bordas de pedra do mapa do livro
  walls: [
    [C(1, 0), C(1, 1)], [C(2, 0), C(2, 1)], [C(2, 0), C(3, 0)], [C(6, 0), C(6, 1)], [C(7, 0), C(7, 1)], [C(5, 0), C(6, 0)],
    [C(0, 4), C(1, 4)], [C(0, 5), C(1, 5)], [C(0, 5), C(0, 6)], [C(0, 2), C(0, 3)],
    [C(7, 4), C(8, 4)], [C(8, 4), C(8, 5)], [C(8, 2), C(8, 3)],
    // cripta dos Fantasmas (4,1)-(4,2): fechada
    [C(3, 1), C(4, 1)], [C(4, 1), C(5, 1)], [C(4, 0), C(4, 1)],
    // salas "!" e vizinhas (esquerda)
    [C(1, 2), C(2, 2)], [C(1, 3), C(2, 3)], [C(2, 3), C(3, 3)], [C(2, 2), C(2, 3)], [C(1, 4), C(2, 4)], 
    [C(1, 5), C(2, 5)], [C(2, 5), C(3, 5)], [C(2, 5), C(2, 6)],
    // (direita)
    [C(6, 2), C(7, 2)], [C(5, 3), C(6, 3)], [C(6, 3), C(7, 3)], [C(6, 2), C(6, 3)], [C(6, 4), C(7, 4)],
    [C(5, 5), C(6, 5)], [C(6, 5), C(7, 5)], [C(6, 5), C(6, 6)],
    // embaixo: Necromantes só pelos portais magenta; cantos desbotados fechados
    [C(1, 5), C(1, 6)], [C(1, 6), C(1, 7)], [C(0, 6), C(1, 6)], [C(2, 6), C(2, 7)], 
    [C(6, 6), C(6, 7)], [C(7, 5), C(7, 6)], [C(7, 6), C(7, 7)], [C(7, 6), C(8, 6)],
    // revisão dos mapas
    [C(2, 1), C(2, 2)], [C(6, 1), C(6, 2)],
  ],
  doors: [
    { a: C(0, 0), b: C(1, 0), open: false }, { a: C(7, 0), b: C(8, 0), open: false }, { a: C(0, 3), b: C(1, 3), open: false },
    { a: C(7, 3), b: C(8, 3), open: false }, { a: C(2, 4), b: C(3, 4), open: false }, { a: C(5, 4), b: C(6, 4), open: false },
    { a: C(3, 1), b: C(3, 2), open: false, small: true }, { a: C(5, 1), b: C(5, 2), open: false, small: true },
    { a: C(3, 2), b: C(3, 3), open: false, small: true }, { a: C(5, 2), b: C(5, 3), open: false, small: true },
    { a: C(2, 2), b: C(3, 2), open: true }, { a: C(5, 2), b: C(6, 2), open: true },
  ],
  portals: [...[C(0, 2), C(8, 2)].map(cell => ({ cell, color: 'turquesa' })), ...[C(4, 5), C(2, 6), C(6, 6)].map(cell => ({ cell, color: 'magenta' }))],
  startAreas: [[C(8, 3), C(8, 4)], [C(1, 0), C(2, 0)], [C(6, 0), C(7, 0)], [C(0, 3), C(0, 4), C(0, 5)]],
  entryMarkers: [C(2, 3), C(2, 5), C(4, 4), C(6, 3), C(6, 5)],
  exploration: [C(3, 0), C(5, 0), C(4, 1), C(0, 2), C(8, 2), C(4, 3), C(3, 5), C(5, 5)],
  missionMarkers: [],
  startWithToken: true,
  tombstones: [C(1, 1), C(7, 1), C(2, 2), C(3, 2), C(5, 2), C(6, 2), C(3, 4), C(5, 4)],
  labels: [{ cells: [C(2, 3), C(2, 5), C(6, 3), C(6, 5)], text: '!' }],
  monsters: [
    ...many('zumbi_arremessador', C(2, 1), C(6, 1), C(0, 2), C(8, 2)), ...many('fantasma', C(4, 1), C(4, 2), C(4, 5)),
    ...many('esqueleto', C(3, 3), C(5, 3), C(2, 4), C(6, 4)), ...many('zumbi_retalhador', C(2, 4), C(6, 4)), ...many('necromante', C(2, 6), C(6, 6)),
  ],
  entryStart: ['fantasma', 'esqueleto', 'esqueleto'],
  missions: {
    pve: [
      { id: 'purificar', name: 'Purificar as Criptas', kind: 'pve', text: 'Leve o marcador da sua Guilda (começa com um Herói) até um Espaço "!" sem Inimigos. Dá o Título "Purificador".', rule: 'escort', ownOnly: true, colors: ['azul', 'vermelho', 'verde', 'laranja'], escortTo: [C(2, 3), C(2, 5), C(6, 3), C(6, 5)], title: 'purificador' },
      kill('necromante', 'Matar um Necromante', 'necromante', { text: 'Mate um Necromante (volta para a caixa). Dá uma Recompensa (Pedra da Alma). Máximo de 2 Guildas.', reward: true, maxCompletions: 2 }),
    ],
    rewards: ['pedra_alma', 'pedra_alma'],
  },
  boxOnDeath: ['necromante'], noBanish: ['necromante'],
  notes: ['Cada Guilda começa com o seu marcador de Missão num Herói; ninguém pega o marcador de outra Guilda.', 'O cenário começa com 1 Fantasma e 2 Esqueletos no Tabuleiro de Entrada.'],
};

export const PONTE_DOS_CONDENADOS: MapDef = {
  id: 'ponte-dos-condenados', name: 'Ponte dos Condenados', circle: 'Círculo Exterior', difficulty: 'dificil', level: '1',
  cols: 9, rows: 9,
  boards: [{ code: '10B', c: 0, r: 0 }, { code: '3A', c: 3, r: 0 }, { code: '12A', c: 6, r: 0 }, { code: '2B', c: 3, r: 3 }, { code: '9A', c: 0, r: 6 }, { code: '1A', c: 3, r: 6 }, { code: '7A', c: 6, r: 6 }],
  pillars: [C(3, 2), C(5, 2), C(3, 6), C(5, 6), C(0, 1), C(0, 2), C(8, 1), C(8, 2)], rooms: [C(4, 4), C(2, 0), C(3, 0), C(4, 0), C(5, 0), C(6, 0), C(2, 8), C(3, 8), C(4, 8), C(5, 8), C(6, 8)],
  walls: [
    [C(2, 1), C(2, 2)], [C(0, 2), C(1, 2)], [C(6, 1), C(6, 2)], [C(7, 2), C(8, 2)], 
    [C(0, 6), C(0, 7)], [C(2, 6), C(2, 7)], [C(6, 6), C(6, 7)], [C(8, 6), C(8, 7)], 
    [C(4, 4), C(5, 4)],
    // revisadas pelas bordas de pedra do livro: das Áreas Iniciais só se chega ao centro pelos portais;
    // salas dos Fantasmas ligadas só à sala da Noiva; salas desbotadas fechadas
    [C(0, 0), C(0, 1)], [C(0, 1), C(1, 1)], [C(0, 1), C(0, 2)], [C(1, 0), C(2, 0)], [C(2, 0), C(2, 1)],
    [C(2, 7), C(2, 8)], [C(1, 8), C(2, 8)],
    [C(6, 0), C(6, 1)], [C(6, 0), C(7, 0)], [C(7, 1), C(8, 1)], [C(8, 0), C(8, 1)], [C(8, 1), C(8, 2)],
    [C(4, 3), C(5, 3)], [C(4, 5), C(5, 5)], 
    [C(6, 7), C(6, 8)], [C(6, 8), C(7, 8)],
    // revisão dos mapas
    [C(3, 3), C(4, 3)], [C(3, 5), C(4, 5)],
  ],
  doors: [
    { a: C(1, 1), b: C(1, 2), open: false }, { a: C(7, 1), b: C(7, 2), open: false }, { a: C(1, 6), b: C(1, 7), open: false },
    { a: C(7, 6), b: C(7, 7), open: false }, { a: C(3, 4), b: C(4, 4), open: false },
    { a: C(2, 0), b: C(3, 0), open: true }, { a: C(3, 0), b: C(3, 1), open: true }, { a: C(5, 0), b: C(6, 0), open: true }, { a: C(5, 0), b: C(5, 1), open: true },
    { a: C(2, 8), b: C(3, 8), open: true }, { a: C(3, 7), b: C(3, 8), open: true }, { a: C(5, 7), b: C(5, 8), open: true }, { a: C(5, 8), b: C(6, 8), open: true },
    { a: C(3, 0), b: C(4, 0), open: true, small: true }, { a: C(4, 0), b: C(5, 0), open: true, small: true },
    // revisão dos mapas
    { a: C(4, 0), b: C(4, 1), open: true },
    { a: C(3, 8), b: C(4, 8), open: true },
    { a: C(4, 8), b: C(5, 8), open: true },
  ],
  portals: [C(1, 0), C(7, 0), C(1, 8), C(7, 8)].map(cell => ({ cell, color: 'turquesa' })),
  startAreas: [[C(6, 6), C(7, 6), C(8, 6)], [C(1, 2), C(2, 2)], [C(6, 2), C(7, 2)], [C(0, 6), C(1, 6), C(2, 6)]],
  entryMarkers: [C(1, 0), C(7, 0), C(1, 8), C(7, 8)],
  exploration: [C(3, 0), C(5, 0), C(2, 1), C(6, 1), C(2, 7), C(6, 7), C(3, 8), C(5, 8)],
  missionMarkers: [],
  // a Noiva de cada Guilda fica do outro lado do mapa (P1 em cima à esquerda, P4 em cima à direita, P3 e P2 embaixo)
  missionMarkersByArea: [C(3, 0), C(5, 8), C(3, 8), C(5, 0)],
  tombstones: [C(4, 0), C(2, 1), C(6, 1), C(4, 3), C(4, 5), C(2, 7), C(6, 7), C(4, 8)],
  monsters: [
    ...many('zumbi_arremessador', C(1, 0), C(7, 0), C(1, 8), C(7, 8)), ...many('fantasma', C(2, 0), C(6, 0), C(2, 8), C(6, 8)),
    ...many('esqueleto', C(3, 0), C(5, 0), C(4, 1), C(4, 7), C(3, 8), C(5, 8)), ...many('necromante', C(4, 1), C(4, 7)),
    ...many('zumbi_retalhador', C(4, 2), C(4, 6)), ...many('frank', C(3, 4)),
  ],
  missions: {
    pve: [
      { id: 'noiva', name: 'A Noiva do Frank', kind: 'pve', text: 'Pegue o marcador da sua Guilda (do outro lado do mapa) e leve-o até a sua Área Inicial, sem Inimigos no Espaço. O primeiro ganha o Título "Casamenteiro".', rule: 'escort', ownOnly: true, colors: ['azul', 'vermelho', 'verde', 'laranja'], escortTo: 'own_area', title: 'casamenteiro', titleFirstOnly: true },
      kill('frank', 'Matar Frank', 'frank', { text: 'Mate Frank. Dá uma Recompensa (Arreio de Força).', reward: true }),
    ],
    rewards: ['arreio_poder'],
  },
  noBanish: ['frank'],
  notes: ['Frank chora na ponte e não pode ser banido.'],
};

export const O_CEMITERIO: MapDef = {
  id: 'o-cemiterio', name: 'O Cemitério', circle: 'Círculo Exterior', difficulty: 'dificil', level: '1',
  cols: 9, rows: 9,
  boards: [{ code: '2A', c: 0, r: 0 }, { code: '9A', c: 3, r: 0 }, { code: '7A', c: 0, r: 3 }, { code: '10A', c: 3, r: 3 }, { code: '11B', c: 6, r: 3 }, { code: '12B', c: 3, r: 6 }, { code: '5B', c: 6, r: 6 }],
  pillars: [C(2, 2), C(8, 8), C(6, 6)], rooms: [C(4, 4), C(2, 0), C(1, 0), C(0, 0), C(0, 1), C(0, 2), C(5, 2), C(2, 5), C(3, 6), C(6, 3), C(6, 8), C(7, 8), C(8, 6), C(8, 7)],
  // paredes revisadas pelas bordas de pedra do livro (o mapa é simétrico girando 180°)
  walls: [
    [C(3, 0), C(3, 1)], [C(5, 0), C(5, 1)], [C(0, 3), C(1, 3)], [C(0, 5), C(1, 5)], [C(7, 3), C(8, 3)], [C(8, 4), C(8, 5)],
    [C(3, 7), C(3, 8)], [C(4, 8), C(5, 8)],
    // sala rosa (saída pelas portas verdes) e o canto desbotado
    [C(0, 2), C(0, 3)], [C(2, 0), C(2, 1)], [C(2, 0), C(3, 0)], [C(0, 2), C(1, 2)], [C(2, 1), C(2, 2)], [C(1, 2), C(2, 2)], [C(2, 2), C(3, 2)], [C(2, 2), C(2, 3)],
    [C(8, 6), C(8, 5)], [C(6, 8), C(6, 7)], [C(5, 8), C(6, 8)], [C(7, 6), C(8, 6)], [C(6, 6), C(6, 7)], [C(6, 6), C(7, 6)], [C(5, 6), C(6, 6)], [C(6, 5), C(6, 6)],
    // salas dos marcadores de Morte (só pela porta)
    [C(1, 5), C(2, 5)], [C(2, 4), C(2, 5)], [C(3, 6), C(4, 6)], [C(3, 6), C(3, 7)],
    [C(4, 2), C(5, 2)], [C(5, 1), C(5, 2)], [C(6, 3), C(7, 3)], [C(6, 3), C(6, 4)],
  ],
  doors: [
    { a: C(4, 0), b: C(4, 1), open: false }, { a: C(0, 4), b: C(1, 4), open: false }, { a: C(7, 4), b: C(8, 4), open: false },
    { a: C(5, 2), b: C(5, 3), open: false }, { a: C(3, 5), b: C(3, 6), open: false }, { a: C(4, 7), b: C(4, 8), open: false },
    { a: C(5, 3), b: C(6, 3), open: false, small: true }, { a: C(2, 5), b: C(3, 5), open: false, small: true },
    { a: C(1, 0), b: C(1, 1), open: true }, { a: C(7, 7), b: C(7, 8), open: true },
    { a: C(0, 1), b: C(1, 1), open: true, small: true }, { a: C(7, 7), b: C(8, 7), open: true, small: true },
  ],
  portals: [C(1, 1), C(5, 1), C(7, 3), C(1, 5), C(3, 7), C(7, 7)].map(cell => ({ cell, color: 'turquesa' })),
  startAreas: [[C(8, 3), C(8, 4)], [C(0, 3), C(0, 4), C(0, 5)], [C(3, 8), C(4, 8)], [C(3, 0), C(4, 0), C(5, 0)]],
  entryMarkers: [C(4, 3), C(3, 4), C(5, 4), C(4, 4), C(4, 5)],
  exploration: [C(2, 1), C(5, 1), C(5, 3), C(7, 3), C(1, 5), C(3, 5), C(3, 7), C(7, 7)],
  // marcadores de Missão virados (Vermelho = Dr. Spider; os outros = Fantasma) e os 4 marcadores de Morte
  missionMarkers: [
    { cell: C(2, 0), color: 'vermelho' }, { cell: C(0, 2), color: 'azul' }, { cell: C(8, 6), color: 'verde' }, { cell: C(6, 8), color: 'laranja' },
    { cell: C(5, 2), color: 'morte' }, { cell: C(6, 3), color: 'morte' }, { cell: C(2, 5), color: 'morte' }, { cell: C(3, 6), color: 'morte' },
  ],
  hiddenMarkers: ['vermelho', 'azul', 'verde', 'laranja'],
  ambushBy: { vermelho: 'dr_spider', azul: 'fantasma', verde: 'fantasma', laranja: 'fantasma' },
  reserve: ['dr_spider', 'fantasma', 'fantasma', 'fantasma'],
  tombstones: [C(2, 1), C(1, 2), C(4, 2), C(2, 4), C(6, 4), C(4, 6), C(7, 6), C(6, 7)],
  labels: [{ cells: [C(4, 4)], text: 'RITUAL' }],
  monsters: [
    ...many('zumbi_arremessador', C(2, 1), C(1, 1), C(7, 7), C(7, 7)),
    ...many('esqueleto', C(3, 2), C(2, 3), C(5, 3), C(3, 5), C(6, 5), C(5, 6)), ...many('necromante', C(4, 4), C(4, 4)),
  ],
  entryStart: ['fantasma', 'zumbi_retalhador', 'zumbi_retalhador'],
  missions: {
    pve: [
      { id: 'ritual', name: 'Parar o Ritual', kind: 'pve', text: 'Pegue um marcador de Morte e leve-o até o Espaço central do Cemitério, sem Inimigos nele. O primeiro ganha o Título "Coveiro".', rule: 'escort', colors: ['morte'], escortTo: [C(4, 4)], title: 'coveiro', titleFirstOnly: true },
      kill('spider', 'Matar o Dr. Spider', 'dr_spider', { text: 'Mate o Dr. Spider (ele aparece no marcador Vermelho). Dá uma Recompensa (Escudo de Lápide).', reward: true }),
    ],
    rewards: ['escudo_lapide'],
  },
  noBanish: ['dr_spider'],
  notes: ['Os 4 marcadores de Missão estão virados: o Vermelho é o Dr. Spider; os outros são Fantasmas que atacam quem os encontra.', 'O cenário começa com 1 Fantasma e 2 Zumbis Retalhadores no Tabuleiro de Entrada.'],
};

// ------------------------------------------------------------------ Círculo Interior
export const SANTUARIO_NEGRO: MapDef = {
  id: 'santuario-negro', name: 'Santuário Negro', circle: 'Círculo Interior', difficulty: 'facil', level: '2-3',
  cols: 9, rows: 9,
  boards: [0, 3, 6].flatMap((r, i) => [0, 3, 6].map((c, j) => ({ code: [['6A', '1A', '12A'], ['9A', '4A', '7A'], ['2A', '3A', '5B']][i][j], c, r }))),
  pillars: [C(0, 1), C(0, 2), C(8, 0), C(7, 0), C(5, 0), C(3, 0), C(2, 3), C(6, 3), C(4, 4), C(3, 6), C(2, 6), C(5, 6), C(6, 6), C(8, 6), C(8, 7), C(8, 8), C(5, 8), C(4, 8), C(3, 8), C(2, 8), C(1, 8)], rooms: [C(2, 2), C(6, 2), C(0, 3), C(0, 4), C(0, 5), C(8, 3), C(8, 4), C(8, 5), C(3, 2), C(5, 2)],
  walls: [
    [C(0, 0), C(0, 1)], [C(7, 2), C(8, 2)], [C(0, 6), C(1, 6)], [C(0, 8), C(1, 8)], [C(6, 7), C(6, 8)], [C(5, 8), C(6, 8)],
    [C(2, 1), C(2, 2)], [C(2, 2), C(2, 3)], [C(1, 2), C(2, 2)], [C(6, 1), C(6, 2)], [C(6, 2), C(6, 3)], [C(6, 2), C(7, 2)],
    [C(3, 1), C(3, 2)], [C(5, 1), C(5, 2)],
    [C(0, 3), C(1, 3)], [C(0, 5), C(1, 5)], [C(0, 2), C(0, 3)], [C(0, 5), C(0, 6)],
    [C(7, 3), C(8, 3)], [C(7, 5), C(8, 5)], [C(8, 2), C(8, 3)], [C(8, 5), C(8, 6)],
    // revisadas pelas bordas de pedra do livro: espaços desbotados fechados, poço do centro fechado
    [C(1, 0), C(2, 0)], [C(0, 1), C(1, 1)], [C(0, 2), C(1, 2)], [C(2, 0), C(3, 0)], [C(3, 0), C(3, 1)], [C(3, 0), C(4, 0)], [C(3, 2), C(4, 2)],
    [C(1, 3), C(2, 3)], [C(2, 3), C(3, 3)], [C(2, 3), C(2, 4)],
    [C(3, 4), C(4, 4)], [C(4, 3), C(4, 4)], [C(4, 4), C(4, 5)], [C(4, 4), C(5, 4)],
    [C(2, 5), C(2, 6)], [C(1, 6), C(2, 6)], [C(2, 6), C(2, 7)], [C(3, 5), C(3, 6)], [C(3, 6), C(3, 7)], [C(3, 6), C(4, 6)],
    [C(1, 7), C(1, 8)], [C(2, 7), C(2, 8)], [C(3, 7), C(3, 8)], [C(4, 7), C(4, 8)], [C(5, 7), C(5, 8)],
    [C(4, 0), C(5, 0)], [C(5, 0), C(6, 0)], [C(5, 0), C(5, 1)], [C(6, 0), C(7, 0)], [C(7, 0), C(7, 1)], [C(8, 0), C(8, 1)], [C(4, 2), C(5, 2)],
    [C(5, 3), C(6, 3)], [C(6, 3), C(7, 3)], [C(6, 3), C(6, 4)],
    [C(4, 6), C(5, 6)], [C(5, 5), C(5, 6)], [C(5, 6), C(5, 7)], [C(6, 5), C(6, 6)], [C(6, 6), C(7, 6)], [C(6, 6), C(6, 7)],
    [C(7, 6), C(8, 6)], [C(7, 7), C(8, 7)], [C(8, 7), C(8, 8)], [C(7, 8), C(8, 8)],
  ],
  doors: [
    { a: C(1, 0), b: C(1, 1), open: false }, { a: C(7, 1), b: C(8, 1), open: false }, { a: C(2, 2), b: C(3, 2), open: false },
    { a: C(5, 2), b: C(6, 2), open: false }, { a: C(0, 4), b: C(1, 4), open: false }, { a: C(7, 4), b: C(8, 4), open: false },
    { a: C(0, 7), b: C(1, 7), open: false }, { a: C(7, 7), b: C(7, 8), open: false },
    { a: C(3, 2), b: C(3, 3), open: true, small: true }, { a: C(5, 2), b: C(5, 3), open: true, small: true },
  ],
  portals: [...[C(2, 1), C(6, 1), C(2, 7), C(6, 7)].map(cell => ({ cell, color: 'turquesa' })), ...[C(2, 4), C(6, 4)].map(cell => ({ cell, color: 'magenta' }))],
  startAreas: [[C(0, 6), C(0, 7), C(0, 8)], [C(0, 0), C(1, 0)], [C(6, 8), C(7, 8)], [C(8, 1), C(8, 2)]],
  entryMarkers: [C(2, 0), C(4, 0), C(6, 0), C(2, 4), C(6, 4)],
  exploration: [C(1, 2), C(7, 2), C(4, 3), C(3, 4), C(5, 4), C(4, 5), C(1, 6), C(7, 6)],
  missionMarkers: [{ cell: C(0, 3), color: 'verde' }, { cell: C(8, 3), color: 'azul' }, { cell: C(0, 5), color: 'laranja' }, { cell: C(8, 5), color: 'vermelho' }],
  tombstones: [C(3, 1), C(5, 1), C(1, 3), C(7, 3), C(1, 5), C(7, 5), C(3, 7), C(5, 7)],
  labels: [{ cells: [C(2, 0), C(4, 0), C(6, 0)], text: 'SAÍDA' }],
  monsters: [
    ...many('zumbi_retalhador', C(4, 1), C(4, 7)), ...many('zumbi_arremessador', C(4, 1), C(1, 4), C(7, 4), C(4, 7)),
    ...many('esqueleto', C(1, 2), C(7, 2), C(0, 4), C(8, 4), C(1, 6), C(7, 6)), ...many('fantasma', C(0, 3), C(8, 3), C(0, 5), C(8, 5)),
    ...many('necromante', C(1, 4), C(7, 4)), ...many('ivan', C(2, 2)), ...many('frank', C(6, 2)), ...many('rei_pavoroso', C(4, 3)),
  ],
  missions: {
    pve: [
      { id: 'milicia', name: 'Resgatar a Milícia', kind: 'pve', text: 'Pegue um membro da Milícia (marcador de Missão) e leve-o até uma das 3 Saídas, sem Inimigos no Espaço. Dá o Título "Capitão da Milícia".', rule: 'escort', colors: ['azul', 'vermelho', 'verde', 'laranja'], escortTo: [C(2, 0), C(4, 0), C(6, 0)], title: 'capitao_milicia' },
      kill('frank', 'Matar Frank', 'frank', { text: 'Mate Frank. Dá uma Recompensa (Água Benta).', reward: true }),
      kill('ivan', 'Matar Ivan', 'ivan', { text: 'Mate Ivan. Dá uma Recompensa (Água Benta).', reward: true }),
    ],
    rewards: ['agua_benta', 'agua_benta'],
  },
  noBanish: ['frank', 'ivan'],
  speakerTitle: 'orador_mortos',
  notes: ['O Rei Pavoroso inspeciona os recrutas: ele é Enorme (ocupa o Espaço inteiro) e empurra quem estiver no caminho.', 'Título "Orador dos Mortos": +1 Rerrolagem por personagem no Tabuleiro de Entrada.'],
};

export const MOINHO_DAS_ALMAS: MapDef = {
  id: 'moinho-das-almas', name: 'Moinho das Almas', circle: 'Círculo Interior', difficulty: 'medio', level: '2-3',
  cols: 12, rows: 12,
  boards: [{ code: '7A', c: 3, r: 0 }, { code: '1A', c: 3, r: 3 }, { code: '4B', c: 6, r: 3 }, { code: '11B', c: 9, r: 3 }, { code: '10B', c: 0, r: 6 }, { code: '3A', c: 3, r: 6 }, { code: '8B', c: 6, r: 6 }, { code: '6A', c: 6, r: 9 }],
  pillars: [C(5, 3), C(3, 3), C(8, 3), C(7, 3), C(8, 5), C(3, 5), C(3, 6), C(0, 7), C(0, 8), C(6, 8), C(7, 11)], rooms: [C(5, 2), C(9, 5), C(2, 6), C(6, 9), C(3, 8), C(4, 8), C(5, 8), C(8, 6), C(8, 7)],
  walls: [
    [C(3, 0), C(4, 0)], [C(3, 2), C(4, 2)], [C(3, 2), C(3, 3)], [C(9, 3), C(9, 4)], [C(2, 7), C(2, 8)], [C(7, 9), C(8, 9)], [C(7, 11), C(8, 11)],
    [C(4, 2), C(5, 2)], [C(5, 2), C(5, 3)], [C(9, 4), C(9, 5)], [C(8, 5), C(9, 5)], [C(2, 6), C(3, 6)], [C(2, 6), C(2, 7)], [C(6, 8), C(6, 9)], [C(6, 9), C(7, 9)],
    // revisadas pelas bordas de pedra do livro: espaços desbotados fechados; as 4 Noivas do Moinho em salas separadas
    // (cada uma pela sua porta aberta); a sala do Rei Pavoroso (3,8)-(5,8) só pelos portais magenta
    [C(3, 3), C(4, 3)], [C(3, 3), C(3, 4)], [C(4, 3), C(5, 3)], [C(5, 3), C(5, 4)], [C(5, 3), C(6, 3)], [C(3, 4), C(3, 5)], [C(3, 5), C(4, 5)], [C(3, 5), C(3, 6)], 
    [C(8, 8), C(8, 9)], [C(6, 8), C(7, 8)], [C(6, 7), C(6, 8)], [C(5, 8), C(6, 8)], [C(6, 7), C(7, 7)], [C(7, 7), C(8, 7)], [C(6, 6), C(7, 6)],
    [C(6, 11), C(7, 11)], [C(7, 10), C(7, 11)],
    [C(8, 3), C(9, 3)], [C(10, 3), C(11, 3)], [C(6, 3), C(7, 3)], [C(7, 3), C(7, 4)], [C(8, 3), C(8, 4)], [C(7, 5), C(8, 5)], [C(8, 4), C(8, 5)], [C(8, 5), C(8, 6)],
    [C(5, 5), C(6, 5)], [C(5, 5), C(5, 6)], [C(6, 5), C(6, 6)], [C(5, 6), C(6, 6)], [C(4, 5), C(5, 5)], [C(6, 4), C(6, 5)], [C(5, 6), C(5, 7)],
    [C(0, 8), C(1, 8)], [C(2, 8), C(3, 8)], [C(0, 6), C(0, 7)], [C(0, 7), C(1, 7)], [C(0, 7), C(0, 8)], [C(3, 6), C(4, 6)], [C(3, 6), C(3, 7)],
    [C(3, 7), C(3, 8)], [C(4, 7), C(4, 8)], [C(5, 7), C(5, 8)],
    // revisão dos mapas
    [C(7, 6), C(8, 6)], [C(8, 7), C(8, 8)],
  ],
  doors: [
    { a: C(5, 1), b: C(5, 2), open: false }, { a: C(9, 5), b: C(10, 5), open: false }, { a: C(1, 6), b: C(2, 6), open: false }, { a: C(6, 9), b: C(6, 10), open: false },
    { a: C(3, 1), b: C(4, 1), open: false }, { a: C(10, 3), b: C(10, 4), open: false }, { a: C(1, 7), b: C(1, 8), open: false }, { a: C(7, 10), b: C(8, 10), open: false },
    { a: C(5, 4), b: C(5, 5), open: true }, { a: C(6, 5), b: C(7, 5), open: true }, { a: C(4, 6), b: C(5, 6), open: true }, { a: C(6, 6), b: C(6, 7), open: true },
  ],
  // as portas dos Esqueletos ficam abertas só enquanto um Herói da Guilda está no marcador dela
  tokenDoors: [{ area: 0, token: C(6, 5), door: 0 }, { area: 1, token: C(5, 6), door: 2 }, { area: 2, token: C(6, 6), door: 3 }, { area: 3, token: C(5, 5), door: 1 }],
  portals: [...[C(4, 2), C(9, 4), C(8, 6), C(2, 7), C(7, 9)].map(cell => ({ cell, color: 'turquesa' })), ...[C(8, 7), C(3, 8), C(5, 8)].map(cell => ({ cell, color: 'magenta' }))],
  startAreas: [[C(1, 8), C(2, 8)], [C(9, 3), C(10, 3)], [C(3, 0), C(3, 1), C(3, 2)], [C(8, 9), C(8, 10), C(8, 11)]],
  entryMarkers: [C(6, 4), C(4, 5), C(7, 6), C(5, 7)],
  exploration: [C(5, 1), C(5, 4), C(7, 5), C(10, 5), C(1, 6), C(4, 6), C(6, 7), C(6, 10)],
  missionMarkers: [],
  tombstones: [C(4, 3), C(6, 4), C(8, 4), C(4, 5), C(7, 6), C(3, 7), C(5, 7), C(7, 8)],
  labels: [{ cells: [C(5, 5), C(6, 5), C(5, 6), C(6, 6)], text: 'MOINHO' }],
  monsters: [
    ...many('esqueleto', C(5, 2), C(9, 5), C(2, 6), C(6, 9)), ...many('zumbi_arremessador', C(4, 3), C(8, 4), C(3, 7), C(7, 8)),
    ...many('fantasma', C(5, 4), C(7, 5), C(4, 6), C(6, 7)), ...many('zumbi_retalhador', C(8, 7)), ...many('rei_pavoroso', C(4, 8)),
  ],
  entryStart: ['necromante', 'necromante', 'zumbi_retalhador'],
  missions: {
    pve: [
      kill('rei', 'Matar o Rei Pavoroso', 'rei_pavoroso', { text: 'Mate o Rei Pavoroso. Dá o Título "Mestre da Morte".', title: 'mestre_morte' }),
      kill('esqueleto', 'Matar um Esqueleto', 'esqueleto', { text: 'Mate um Esqueleto (volta para a caixa). Dá uma Recompensa (Elmo de Crânio). Um por Guilda.', reward: true }),
    ],
    rewards: ['elmo_cranio', 'elmo_cranio'],
  },
  boxOnDeath: ['esqueleto'], noBanish: ['rei_pavoroso', 'esqueleto'],
  speakerTitle: 'orador_mortos', mastermindTitle: 'mente_mestra',
  notes: ['As portas dos Esqueletos só abrem enquanto um Herói da Guilda está no marcador dela, no Moinho (centro).', 'O cenário começa com 2 Necromantes e 1 Zumbi Retalhador no Tabuleiro de Entrada.'],
};

export const LABORATORIO_SECRETO: MapDef = {
  id: 'laboratorio-secreto', name: 'Laboratório Secreto', circle: 'Círculo Interior', difficulty: 'dificil', level: '2-3',
  cols: 9, rows: 9,
  boards: [0, 3, 6].flatMap((r, i) => [0, 3, 6].map((c, j) => ({ code: [['6A', '2B', '12A'], ['1A', '11A', '3A'], ['8A', '9B', '10B']][i][j], c, r }))),
  pillars: [C(0, 1), C(2, 0), C(5, 0), C(4, 0), C(3, 0), C(6, 0), C(8, 1), C(8, 2), C(2, 3), C(0, 5), C(0, 7), C(2, 8), C(4, 8), C(5, 8), C(6, 8), C(8, 7), C(8, 6), C(6, 5)], rooms: [C(3, 3), C(4, 3), C(5, 3), C(3, 4), C(4, 4), C(5, 4), C(3, 5), C(4, 5), C(5, 5), C(3, 6), C(5, 6), C(8, 3), C(8, 4), C(8, 5), C(0, 3), C(2, 5), C(6, 3)],
  walls: [
    [C(3, 2), C(3, 3)], [C(5, 2), C(5, 3)], [C(2, 3), C(3, 3)], [C(5, 3), C(6, 3)], [C(2, 5), C(3, 5)], [C(5, 5), C(6, 5)], [C(4, 5), C(4, 6)],
    [C(0, 1), C(0, 2)], [C(2, 1), C(2, 2)], [C(2, 2), C(3, 2)], [C(6, 1), C(6, 2)], [C(5, 2), C(6, 2)], [C(7, 2), C(8, 2)],
    [C(0, 6), C(0, 7)], [C(2, 6), C(2, 7)], [C(2, 6), C(3, 6)], [C(6, 6), C(6, 7)], [C(5, 6), C(6, 6)], [C(7, 6), C(8, 6)],
    // revisadas pelas bordas de pedra do livro: Áreas Iniciais e salas dos marcadores fechadas (só pelas portas),
    // salas "!" só pelas portas verdes, espaços desbotados fechados
    [C(0, 2), C(0, 3)], [C(1, 2), C(1, 3)], [C(2, 2), C(2, 3)], [C(6, 2), C(6, 3)], [C(7, 2), C(7, 3)],
    [C(0, 5), C(0, 6)], [C(1, 5), C(1, 6)], [C(2, 5), C(2, 6)], [C(6, 5), C(6, 6)], [C(7, 5), C(7, 6)],
    [C(0, 3), C(0, 4)], [C(2, 4), C(2, 5)], [C(6, 3), C(6, 4)], [C(8, 5), C(8, 6)],
    [C(0, 0), C(0, 1)], [C(0, 1), C(1, 1)], [C(1, 0), C(2, 0)], [C(2, 0), C(2, 1)], [C(3, 0), C(3, 1)], [C(4, 0), C(4, 1)], [C(5, 0), C(5, 1)], [C(6, 0), C(6, 1)], [C(6, 0), C(7, 0)],
    [C(8, 0), C(8, 1)], [C(7, 1), C(8, 1)], [C(8, 1), C(8, 2)],
    [C(1, 3), C(2, 3)], [C(2, 3), C(2, 4)], [C(0, 4), C(0, 5)], [C(0, 5), C(1, 5)],
    [C(7, 3), C(8, 3)], [C(7, 4), C(8, 4)], [C(8, 2), C(8, 3)], [C(6, 4), C(6, 5)], [C(6, 5), C(7, 5)],
    [C(3, 6), C(3, 7)], [C(4, 6), C(4, 7)], [C(5, 6), C(5, 7)],
    [C(0, 7), C(1, 7)], [C(0, 7), C(0, 8)], [C(8, 6), C(8, 7)], [C(7, 7), C(8, 7)], [C(8, 7), C(8, 8)],
    [C(2, 7), C(2, 8)], [C(1, 8), C(2, 8)], [C(3, 8), C(4, 8)], [C(4, 7), C(4, 8)], [C(5, 7), C(5, 8)], [C(6, 7), C(6, 8)], [C(6, 8), C(7, 8)],
    // revisão dos mapas
    [C(4, 1), C(4, 2)], [C(5, 1), C(5, 2)], [C(3, 1), C(3, 2)],
  ],
  doors: [
    { a: C(1, 1), b: C(1, 2), open: false }, { a: C(7, 1), b: C(7, 2), open: false }, { a: C(1, 6), b: C(1, 7), open: false }, { a: C(7, 6), b: C(7, 7), open: false },
    { a: C(4, 2), b: C(4, 3), open: false }, { a: C(0, 3), b: C(1, 3), open: false }, { a: C(6, 3), b: C(7, 3), open: false },
    { a: C(2, 4), b: C(3, 4), open: false }, { a: C(5, 4), b: C(6, 4), open: false }, { a: C(1, 5), b: C(2, 5), open: false }, { a: C(7, 5), b: C(8, 5), open: false },
    { a: C(3, 5), b: C(3, 6), open: true }, { a: C(5, 5), b: C(5, 6), open: true },
  ],
  portals: [C(4, 1), C(1, 3), C(7, 3), C(1, 5), C(7, 5), C(4, 7)].map(cell => ({ cell, color: 'turquesa' })),
  startAreas: [[C(0, 2), C(1, 2), C(2, 2)], [C(6, 6), C(7, 6)], [C(6, 2), C(7, 2)], [C(0, 6), C(1, 6), C(2, 6)]],
  entryMarkers: [C(4, 3), C(1, 4), C(7, 4), C(3, 5), C(5, 5)],
  exploration: [C(3, 1), C(5, 1), C(1, 3), C(7, 3), C(1, 5), C(7, 5), C(3, 7), C(5, 7)],
  missionMarkers: [{ cell: C(0, 3), color: 'vermelho' }, { cell: C(6, 3), color: 'laranja' }, { cell: C(2, 5), color: 'verde' }, { cell: C(8, 5), color: 'azul' }],
  tombstones: [C(1, 0), C(7, 0), C(3, 3), C(5, 3), C(2, 4), C(6, 4), C(1, 8), C(7, 8)],
  labels: [{ cells: [C(3, 6), C(5, 6)], text: '!' }],
  monsters: [
    ...many('esqueleto', C(1, 0), C(7, 0), C(3, 6), C(5, 6), C(1, 8), C(7, 8)), ...many('necromante', C(4, 1), C(4, 7)),
    ...many('zumbi_arremessador', C(4, 1), C(3, 6), C(5, 6), C(4, 7)), ...many('dr_spider', C(4, 2)), ...many('ivan', C(4, 3)),
    ...many('zumbi_retalhador', C(1, 4), C(7, 4)), ...many('fantasma', C(2, 4), C(6, 4), C(4, 5), C(4, 5)),
  ],
  missions: {
    pve: [
      kill('spider', 'Matar o Dr. Spider', 'dr_spider', { text: 'Mate o Dr. Spider. Dá o Título "Alquimista".', title: 'alquimista' }),
      { id: 'soro', name: 'Preparar o Soro', kind: 'pve', text: 'Leve 2 marcadores de Missão juntos até um Espaço "!" sem Inimigos. Dá uma Recompensa (Soro Colossal). Uma vez por Guilda.', rule: 'escort', count: 2, colors: ['azul', 'vermelho', 'verde', 'laranja'], escortTo: [C(3, 6), C(5, 6)], reward: true },
    ],
    rewards: ['soro_colossal', 'soro_colossal'],
  },
  noBanish: ['dr_spider'],
  mastermindTitle: 'mente_mestra',
  notes: ['O laboratório do Dr. Spider: Ivan guarda a porta e 2 Fantasmas vigiam a máquina.', 'Para preparar o Soro, o mesmo Herói carrega 2 marcadores de Missão até um "!".'],
};

// ------------------------------------------------------------------ Confronto Final
export const MAUSOLEU_PROFANO: MapDef = {
  id: 'mausoleu-profano', name: 'O Mausoléu Profano', circle: 'Confronto Final', difficulty: 'muito', level: '6',
  cols: 9, rows: 12,
  boards: [0, 3, 6, 9].flatMap((r, i) => [0, 3, 6].map((c, j) => ({ code: [['12A', '5A', '6A'], ['3A', '11A', '9B'], ['8B', '10A', '4B'], ['2B', '1B', '7A']][i][j], c, r }))),
  pillars: [C(1, 0), C(3, 2), C(5, 2), C(8, 2), C(0, 5), C(0, 7), C(0, 8), C(0, 9), C(0, 10), C(0, 11), C(8, 11), C(8, 7), C(8, 8), C(6, 8), C(2, 8)], rooms: [...[3, 4, 5].flatMap(c => [3, 4, 5, 9, 10, 11].map(r => C(c, r))), C(2, 6), C(6, 6), C(2, 1), C(2, 2), C(6, 2), C(6, 1), C(6, 0), C(7, 0), C(6, 3), C(6, 4), C(6, 5)],
  walls: [
    [C(2, 3), C(3, 3)], [C(2, 4), C(3, 4)], [C(2, 5), C(3, 5)], [C(5, 3), C(6, 3)], [C(5, 4), C(6, 4)], [C(5, 5), C(6, 5)],
    [C(3, 2), C(3, 3)], [C(5, 2), C(5, 3)], [C(3, 5), C(3, 6)], [C(4, 5), C(4, 6)], [C(5, 5), C(5, 6)],
    [C(3, 8), C(3, 9)], [C(5, 8), C(5, 9)], [C(2, 9), C(3, 9)], [C(2, 10), C(3, 10)], [C(2, 11), C(3, 11)], [C(5, 9), C(6, 9)], [C(5, 10), C(6, 10)], [C(5, 11), C(6, 11)],
    [C(0, 1), C(0, 2)], [C(0, 3), C(0, 4)], [C(0, 2), C(1, 2)], [C(8, 2), C(8, 3)], [C(8, 4), C(8, 5)], [C(7, 4), C(8, 4)],
    [C(2, 8), C(2, 9)], [C(1, 9), C(2, 9)], [C(1, 10), C(2, 10)], [C(6, 8), C(6, 9)], [C(6, 9), C(7, 9)], [C(6, 10), C(7, 10)],
    // revisadas pelas bordas de pedra do livro: corredores dos lados do templo, salas desbotadas fechadas
    [C(1, 3), C(2, 3)], [C(1, 4), C(2, 4)], [C(1, 5), C(2, 5)], [C(6, 3), C(7, 3)], [C(6, 4), C(7, 4)], [C(6, 5), C(7, 5)],
    [C(2, 2), C(3, 2)], [C(3, 1), C(3, 2)], [C(3, 2), C(4, 2)], [C(4, 2), C(5, 2)], [C(5, 1), C(5, 2)], [C(5, 2), C(6, 2)],
    [C(0, 0), C(1, 0)], [C(1, 1), C(2, 1)], [C(2, 0), C(2, 1)], 
    [C(5, 0), C(6, 0)], [C(7, 0), C(8, 0)], [C(7, 0), C(7, 1)], [C(6, 1), C(7, 1)], [C(7, 2), C(8, 2)], [C(8, 1), C(8, 2)],
    [C(0, 4), C(0, 5)], [C(0, 5), C(1, 5)], [C(0, 5), C(0, 6)],
    [C(0, 6), C(0, 7)], [C(0, 7), C(1, 7)], [C(0, 8), C(1, 8)], [C(0, 9), C(1, 9)], [C(0, 10), C(1, 10)], [C(0, 11), C(1, 11)],
    [C(1, 8), C(2, 8)], [C(2, 7), C(2, 8)], [C(2, 8), C(3, 8)],
    [C(5, 8), C(6, 8)], [C(6, 7), C(6, 8)], [C(6, 8), C(7, 8)],
    [C(7, 7), C(8, 7)], [C(7, 8), C(8, 8)], [C(8, 6), C(8, 7)], [C(8, 8), C(8, 9)], [C(7, 11), C(8, 11)], [C(8, 10), C(8, 11)],
    // revisão dos mapas
    [C(6, 2), C(7, 2)], [C(1, 6), C(2, 6)], [C(2, 6), C(2, 7)], [C(6, 6), C(6, 7)], [C(6, 6), C(7, 6)], [C(1, 2), C(2, 2)],
  ],
  doors: [
    { a: C(2, 1), b: C(3, 1), open: false }, { a: C(5, 1), b: C(6, 1), open: false }, { a: C(2, 6), b: C(3, 6), open: false }, { a: C(5, 6), b: C(6, 6), open: false },
    { a: C(2, 5), b: C(2, 6), open: false, small: true }, { a: C(6, 5), b: C(6, 6), open: false, small: true },
    { a: C(0, 3), b: C(1, 3), open: true }, { a: C(7, 3), b: C(8, 3), open: true }, { a: C(2, 2), b: C(2, 3), open: true }, { a: C(4, 2), b: C(4, 3), open: true },
    { a: C(6, 2), b: C(6, 3), open: true }, { a: C(1, 11), b: C(2, 11), open: true }, { a: C(6, 11), b: C(7, 11), open: true },
    { a: C(4, 8), b: C(4, 9), open: false, locked: true },
  ],
  portals: [...[C(1, 5), C(7, 5), C(1, 9), C(7, 9)].map(cell => ({ cell, color: 'turquesa' })), ...[C(2, 4), C(6, 4), C(4, 9)].map(cell => ({ cell, color: 'magenta' }))],
  startAreas: [[C(6, 9), C(6, 10), C(6, 11)], [C(8, 3), C(8, 4)], [C(0, 2), C(0, 3)], [C(2, 9), C(2, 10), C(2, 11)]],
  entryMarkers: [C(2, 3), C(6, 3), C(4, 7)],
  exploration: [C(3, 1), C(5, 1), C(1, 6), C(2, 6), C(6, 6), C(7, 6), C(2, 7), C(6, 7), C(1, 8), C(7, 8)],
  missionMarkers: [],
  tombstones: [C(2, 2), C(6, 2), C(1, 5), C(7, 5), C(3, 7), C(5, 7), C(1, 9), C(7, 9)],
  labels: [{ cells: [C(3, 9), C(4, 9), C(5, 9), C(3, 10), C(4, 10), C(5, 10)], text: 'TEMPLO' }],
  monsters: [
    ...many('dr_spider', C(4, 1)), ...many('zumbi_retalhador', C(2, 2), C(6, 2)), ...many('rei_pavoroso', C(4, 3)),
    ...many('esqueleto', C(1, 4), C(7, 4), C(2, 6), C(6, 6), C(1, 10), C(7, 10)), ...many('ivan', C(2, 5)), ...many('frank', C(6, 5)),
    ...many('fantasma', C(3, 5), C(5, 5), C(4, 8), C(4, 8)), ...many('zumbi_arremessador', C(1, 7), C(1, 7), C(7, 7), C(7, 7)), ...many('necromante', C(3, 7), C(5, 7)),
  ],
  missions: {
    pve: [kill('rei', 'Matar o Rei Pavoroso', 'rei_pavoroso', { text: 'Mate o Rei Pavoroso. Quem conseguir vence a partida e a campanha!' })],
    rewards: [],
  },
  missionsToWin: 1, pvp: false,
  noBanish: ['rei_pavoroso'],
  lockTitle: 'capitao_milicia', alchemistTitle: 'alquimista', masterDeathTitle: 'mestre_morte',
  notes: ['Única Missão: matar o Rei Pavoroso termina a partida (e a campanha).', 'Título "Capitão da Milícia": só você passa pela porta trancada dos fundos do Templo.', 'Título "Alquimista": começa com 3 Poções. Título "Mestre da Morte": cada Inimigo morto revela uma Lápide.'],
};

/** Os 9 cenários de Beyond the Grave, na ordem do Livro de Campanha. */
export const BTG_MAPS: MapDef[] = [QUARTEL_ASSOMBRADO, ABATEDOURO, CRIPTAS, PONTE_DOS_CONDENADOS, O_CEMITERIO, SANTUARIO_NEGRO, MOINHO_DAS_ALMAS, LABORATORIO_SECRETO, MAUSOLEU_PROFANO];
