import type { Cell, Door, MissionDef } from './types';

export interface MapDef {
  id: string;
  name: string;
  circle: string;
  cols: number;
  rows: number;
  boards: { code: string; c: number; r: number }[];
  pillars: Cell[];
  rooms: Cell[];
  walls: [Cell, Cell][];
  doors: { a: Cell; b: Cell; open: boolean; small?: boolean; locked?: boolean }[];
  portals: { cell: Cell; color: string }[];
  startAreas: Cell[][];
  entryMarkers: Cell[];
  exploration: Cell[];
  missionMarkers: { cell: Cell; color: string }[];
  /** Marcador de Missão da cor de cada Guilda, por Área Inicial (índice 0 = Jogador 1). */
  missionMarkersByArea?: Cell[];
  monsters: { type: string; cell: Cell }[];
  missions: { pve: MissionDef[]; rewards: string[] };
  /** Dificuldade do cenário (Livro de Campanha). */
  difficulty?: 'facil' | 'medio' | 'dificil' | 'muito';
  /** Nível dos Monstros (1, 4-5, 6...). */
  level?: string;
  /** Missões necessárias para vencer (padrão: 2 com 2 jogadores, 3 com 3-4). */
  missionsToWin?: number;
  /** false = sem Missões contra Jogador. */
  pvp?: boolean;
  /** true = sem Entrada de Monstros (Monstros mortos voltam para a caixa). */
  noEntry?: boolean;
  /** Barreira mágica (Templo): portas trancadas e portais desta cor só para quem juntou `coins` moedas. */
  barrier?: { coins: number; portalColor: string };
  /** Armadilhas matam e Baús ferem (Templo). */
  deadlyTokens?: boolean;
  /** Áreas especiais com nome escrito no tabuleiro. */
  labels?: { cells: Cell[]; text: string }[];
  /** Texto de regras especiais (galeria de mapas). */
  notes?: string[];
  /** Monstros (id base) que voltam para a caixa ao morrer (ex.: Capitão Orc). */
  boxOnDeath?: string[];
  /** Cores de marcadores de Missão escondidos entre os de Exploração. */
  hiddenMissions?: string[];
  /** Títulos de campanha que mudam regras deste cenário. */
  weakOrcsTitle?: string;
  gateGuardTitle?: string;
  fireProtectTitle?: string;
  /** Portas trancadas que só abrem para quem tem este Título (Esconderijo do Troll). */
  lockTitle?: string;
  /** Portais desta cor só para quem tem o Título (portais vermelhos: "Senhor das Águias"). */
  portalTitle?: { color: string; title: string };
  /** Esconderijo do Troll: quem entra (com o Título) ganha uma destas cartas. */
  hideout?: { cells: Cell[]; cards: string[] };
  /** Monstros fora do tabuleiro no início (invocados por regras do cenário). */
  reserve?: string[];
  /** Monstros que começam no Tabuleiro de Entrada (Beyond the Grave). */
  entryStart?: string[];
  /** Monstros (id base) que ignoram o Banimento neste cenário. */
  noBanish?: string[];
  /** Piso com a arte do tabuleiro do livro (public/floors/<id>.webp, tools/build_floors.py). */
  floorArt?: boolean;
  /** Espaços das cartas de Lápide (Beyond the Grave). */
  tombstones?: Cell[];
  /** Emboscada por cor: o marcador escondido desta cor vira este Monstro (O Cemitério). */
  ambushBy?: Record<string, string>;
  /** Moinho das Almas: a porta fica aberta enquanto um Herói da Guilda da Área Inicial `area` está em `token`. */
  tokenDoors?: { area: number; token: Cell; door: number }[];
  /** Os Heróis começam com o marcador de Missão da cor da Guilda (Criptas). */
  startWithToken?: boolean;
  /** Títulos de Beyond the Grave que valem neste cenário. */
  speakerTitle?: string;
  /** Título "Mente Mestra": as Reações que a Guilda provoca atacam outro Herói Perto do Monstro. */
  mastermindTitle?: string;
  /** Cores de marcadores de Missão que começam virados (e embaralhados entre si) — O Cemitério. */
  hiddenMarkers?: string[];
  alchemistTitle?: string;
  masterDeathTitle?: string;
  /** Marcadores de Missão escondidos destas cores viram uma emboscada deste Monstro. */
  ambush?: { colors: string[]; monster: string };
  /** Título "Líder Rebelde": a Resistência mata 2 Orcs perto da Área Inicial de quem o tem. */
  rebelTitle?: string;
}

export const key = (c: Cell) => `${c.c},${c.r}`;
export const parseKey = (k: string): Cell => {
  const [c, r] = k.split(',').map(Number);
  return { c, r };
};
export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined) => !!a && !!b && a.c === b.c && a.r === b.r;
export const edgeKey = (a: Cell, b: Cell) => {
  const ka = key(a), kb = key(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};
export const DIRS: Cell[] = [{ c: 1, r: 0 }, { c: -1, r: 0 }, { c: 0, r: 1 }, { c: 0, r: -1 }];

/** Geometria estática do mapa + estado das portas (vindo do GameState). */
export class Board {
  readonly map: MapDef;
  readonly cols: number;
  readonly rows: number;
  private exists: boolean[][];
  private pillar: boolean[][];
  private room: boolean[][];
  private walls = new Set<string>();
  private doorByEdge = new Map<string, number>();
  private portalByCell = new Map<string, string>();
  readonly startCellArea = new Map<string, number>();
  private getDoors: () => Door[];

  constructor(map: MapDef, getDoors: () => Door[]) {
    this.map = map;
    this.cols = map.cols;
    this.rows = map.rows;
    this.getDoors = getDoors;
    const grid = () => Array.from({ length: map.rows }, () => Array<boolean>(map.cols).fill(false));
    this.exists = grid();
    this.pillar = grid();
    this.room = grid();
    for (const b of map.boards)
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.exists[b.r + r][b.c + c] = true;
    for (const p of map.pillars) this.pillar[p.r][p.c] = true;
    for (const p of map.rooms) this.room[p.r][p.c] = true;
    for (const [a, b] of map.walls) this.walls.add(edgeKey(a, b));
    map.doors.forEach((d, i) => this.doorByEdge.set(edgeKey(d.a, d.b), i));
    for (const p of map.portals) this.portalByCell.set(key(p.cell), p.color);
    map.startAreas.forEach((cells, i) => cells.forEach(c => this.startCellArea.set(key(c), i)));
  }

  inBounds(c: Cell) { return c.c >= 0 && c.r >= 0 && c.c < this.cols && c.r < this.rows; }
  exist(c: Cell) { return this.inBounds(c) && this.exists[c.r][c.c]; }
  isPillar(c: Cell) { return this.exist(c) && this.pillar[c.r][c.c]; }
  isRoom(c: Cell) { return this.exist(c) && this.room[c.r][c.c]; }
  /** Espaço jogável (existe e tem ponto central). */
  playable(c: Cell) { return this.exist(c) && !this.pillar[c.r][c.c]; }
  isWall(a: Cell, b: Cell) { return this.walls.has(edgeKey(a, b)); }
  portalAt(c: Cell) { return this.portalByCell.get(key(c)); }
  startArea(c: Cell) { return this.startCellArea.get(key(c)); }

  allCells(): Cell[] {
    const out: Cell[] = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.exists[r][c]) out.push({ c, r });
    return out;
  }
  playableCells(): Cell[] { return this.allCells().filter(c => this.playable(c)); }
  portalCells(color?: string): Cell[] {
    return this.map.portals.filter(p => !color || p.color === color).map(p => p.cell);
  }

  doorBetween(a: Cell, b: Cell): Door | undefined {
    const i = this.doorByEdge.get(edgeKey(a, b));
    return i === undefined ? undefined : this.getDoors()[i];
  }

  /** Borda entre dois Espaços ortogonais: 'open' | 'door' (fechada) | 'wall'. */
  edge(a: Cell, b: Cell): 'open' | 'door' | 'wall' {
    if (!this.playable(a) || !this.playable(b)) return 'wall';
    if (Math.abs(a.c - b.c) + Math.abs(a.r - b.r) !== 1) return 'wall';
    const d = this.doorBetween(a, b);
    if (d) return d.open ? 'open' : 'door';
    if (this.isWall(a, b)) return 'wall';
    return 'open';
  }
  edgeOpen(a: Cell, b: Cell) { return this.edge(a, b) === 'open'; }

  neighbors(c: Cell): Cell[] {
    return DIRS.map(d => ({ c: c.c + d.c, r: c.r + d.r })).filter(n => this.playable(n));
  }

  /** "Perto": mesmo Espaço ou ortogonal com borda aberta. */
  isClose(a: Cell, b: Cell): boolean {
    if (sameCell(a, b)) return true;
    if (Math.abs(a.c - b.c) + Math.abs(a.r - b.r) !== 1) return false;
    return this.edgeOpen(a, b);
  }

  /**
   * Linha de Visão (p.16): linha entre centros; bloqueada por paredes, portas fechadas,
   * Espaços bloqueados e áreas fora do tabuleiro. Passar exatamente por uma quina só bloqueia
   * se os dois lados da intersecção estiverem bloqueados.
   * Usa coordenadas dobradas (centros ímpares, bordas pares) para detectar quinas sem erro de ponto flutuante.
   */
  hasLOS(from: Cell, to: Cell, cellBlocks: (c: Cell) => boolean): boolean {
    if (sameCell(from, to)) return true;
    const ax = 2 * from.c + 1, ay = 2 * from.r + 1;
    const bx = 2 * to.c + 1, by = 2 * to.r + 1;
    const dx = bx - ax, dy = by - ay;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    type Ev = { num: number; den: number; x: boolean; y: boolean };
    const evs: Ev[] = [];
    // t = num/den
    if (dx !== 0) for (let X = Math.min(ax, bx) + 1; X < Math.max(ax, bx); X++) if (X % 2 === 0) evs.push({ num: (X - ax) * sx, den: Math.abs(dx), x: true, y: false });
    if (dy !== 0) for (let Y = Math.min(ay, by) + 1; Y < Math.max(ay, by); Y++) if (Y % 2 === 0) evs.push({ num: (Y - ay) * sy, den: Math.abs(dy), x: false, y: true });
    evs.sort((p, q) => p.num * q.den - q.num * p.den);
    // agrupa eventos simultâneos (quinas)
    const groups: { x: boolean; y: boolean }[] = [];
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      const prev = i > 0 ? evs[i - 1] : null;
      if (prev && prev.num * e.den === e.num * prev.den) {
        const g = groups[groups.length - 1];
        g.x = g.x || e.x;
        g.y = g.y || e.y;
      } else groups.push({ x: e.x, y: e.y });
    }
    const passable = (c: Cell) => this.playable(c) && !cellBlocks(c);
    let cur = { ...from };
    for (const g of groups) {
      if (g.x && g.y) {
        const D = { c: cur.c + sx, r: cur.r + sy };
        const B = { c: cur.c + sx, r: cur.r };
        const Cc = { c: cur.c, r: cur.r + sy };
        const viaB = this.edgeOpen(cur, B) && passable(B) && this.edgeOpen(B, D);
        const viaC = this.edgeOpen(cur, Cc) && passable(Cc) && this.edgeOpen(Cc, D);
        if (!viaB && !viaC) return false;
        cur = D;
      } else if (g.x) {
        const n = { c: cur.c + sx, r: cur.r };
        if (!this.edgeOpen(cur, n)) return false;
        cur = n;
      } else {
        const n = { c: cur.c, r: cur.r + sy };
        if (!this.edgeOpen(cur, n)) return false;
        cur = n;
      }
      if (!sameCell(cur, to) && !passable(cur)) return false;
    }
    return true;
  }
}

/** Títulos de campanha que dão vantagem neste mapa (campos *Title e o portal do Título). */
export function mapTitlesOf(map: MapDef): string[] {
  const m = map as unknown as Record<string, unknown>;
  const ids = Object.keys(m).filter(k => k.endsWith('Title') && typeof m[k] === 'string').map(k => m[k] as string);
  if (map.portalTitle) ids.push(map.portalTitle.title);
  return [...new Set(ids)];
}
