import { entryPlaque } from './dice';
import { getSettings } from '../ui/settings';
import { play, playOnce, type Sfx } from '../audio/sfx';
import { CARDS } from '../engine/cards';
import { CARD_ART } from '../ui/cardArt';
import { drawTokenImage, tokenImage, tokenImageId } from './tokens';
import { key, sameCell, type LosBlock } from '../engine/board';
import { GUILDS, MONSTERS, teamName } from '../engine/data';
import type { Game } from '../engine/game';
import type { Cell, GameEvent, Token } from '../engine/types';
import {
  drawBush, drawChestToken, drawCrates, drawGem, drawManhole, drawMushroom, drawPortal, drawTree, star,
} from './art';
import { charScale as baseScale, drawCharacter, type Dir } from './chibi';
import { CLIFF, TH, TW, diamondPath, g2s, hash, isoBox, s2g, shade, type Pt } from './iso';
/** Personagens maiores para acompanhar os Espaços grandes. */
const charScale = (id: string) => baseScale(id) * 1.35;

export interface Highlights {
  move: Map<string, number>; // Espaços alcançáveis -> custo em PM
  path: Cell[];
  attackUnits: Set<string>;
  hoverCell: Cell | null;
  hoverUnit: string | null;
  doorIcons: string[];
  /** Portas que dá para clicar sem mostrar o ícone (Monstro da Vingança). */
  doorClick?: string[];
  /** Portas desenhadas ao contrário (prévia: o Monstro vai abrir/fechar). */
  doorFlip?: string[];
  activeUnit: string | null;
  /** `aim`: prévia do Shift (marca o Espaço de onde se mira e o ponto que bloqueia). */
  los: { from: Cell; to: Cell; ok: boolean; aim?: boolean; block?: LosBlock | null } | null;
  moveColor?: 'blue' | 'purple' | 'green';
  attackCells?: Set<string>;
}

interface UnitView {
  id: string;
  kind: 'hero' | 'monster';
  defId: string;
  guild: string | null;
  num: number;
  cell: Cell | null;
  wounds: number;
  maxHp: number;
  alive: boolean;
  stunned: boolean;
  pos: { gx: number; gy: number };
  tween: { fx: number; fy: number; t0: number; dur: number; portal: boolean } | null;
  alpha: number;
  fade: { from: number; to: number; t0: number; dur: number } | null;
  hurtT0: number;
  /** depth: profundidade do Espaço do alvo (durante a investida o boneco é desenhado na frente das portas/paredes do caminho). */
  lunge: { dx: number; dy: number; t0: number; dur: number; depth?: number } | null;
  /** Fender: gira com a espada (golpe em volta). */
  spin?: { t0: number; dur: number } | null;
  flip: boolean;
  dir: Dir;
  /** Itens da bolsa mostrados girando (só entram quando a animação de pegar acontece). */
  bag: Token[];
}

interface Floater { text: string; color: string; x: number; y: number; t0: number; dur: number; size: number }
interface Projectile { from: Pt; to: Pt; t0: number; dur: number; kind: 'arrow' | 'orb' | 'stone' | 'blade'; arc: number }

export interface RendererHooks {
  /** Retornar true segura a fila de animações até release() (ex.: tela de batalha). */
  onEvent(e: GameEvent): boolean | void;
  onIdle(): void;
}

/** Posições (dentro do Espaço) dos marcadores/itens no chão: fundo do Espaço, longe dos personagens. */
const TOKEN_SLOTS: [number, number][] = [[0.22, 0.22], [0.42, 0.14], [0.14, 0.42], [0.6, 0.12], [0.12, 0.6], [0.34, 0.32]];
const WALL_H = 30;
function gemColor(c?: string): string { return GUILDS[c as keyof typeof GUILDS]?.color ?? '#e0b43a'; }
function hexRgb(h: string): string { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; }
const DIE_ICON: Record<string, string> = { crit: '✷', melee: '⚔', ranged: '➶', shield: '⛨', blank: '–' };

/** Eventos que fazem parte do resultado de um ataque (aparecem logo no impacto, antes da pausa). */
const HIT_RESULT = new Set<GameEvent['t']>(['damage', 'death', 'stun', 'heal', 'coins', 'log', 'cemetery', 'drop', 'reward']);

const DUR: Partial<Record<GameEvent['t'], number>> = {
  move: 280, door: 220, attack: 1500, damage: 480, heal: 420, death: 520, stun: 200, pickup: 650, drop: 200,
  spawn: 420, respawn: 420, spawnRoll: 0, tomb: 2600, notice: 1600, mission: 1500, reaction: 520, turn: 950, rest: 700, card: 800, coins: 0, log: 0, gameover: 0,
};

/** Espada (lâmina para +x, cabo na origem): Fender girando e Arremesso de Lâmina. */
function drawSword(ctx: CanvasRenderingContext2D, s: number) {
  ctx.save();
  ctx.scale(s, s);
  ctx.strokeStyle = '#2a2a36'; ctx.lineWidth = 1.4 / s * 1.6; ctx.lineJoin = 'round';
  // cabo e pomo
  ctx.fillStyle = '#6b3d1c'; ctx.fillRect(-2, -2.5, 10, 5); ctx.strokeRect(-2, -2.5, 10, 5);
  ctx.fillStyle = '#d9a72c'; ctx.beginPath(); ctx.arc(-3, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // guarda
  ctx.fillStyle = '#d9a72c'; ctx.fillRect(8, -9, 4.5, 18); ctx.strokeRect(8, -9, 4.5, 18);
  // lâmina com brilho
  ctx.fillStyle = '#e6ebf5'; ctx.beginPath(); ctx.moveTo(12.5, -4); ctx.lineTo(40, -3); ctx.lineTo(48, 0); ctx.lineTo(40, 3); ctx.lineTo(12.5, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(42, -0.6); ctx.stroke();
  ctx.restore();
}

/** O que a animação do golpe precisa saber (evento de ataque ou 'strike'). */
type Strike = Pick<Extract<GameEvent, { t: 'strike' }>, 'attackerId' | 'cardName' | 'attackType' | 'targets' | 'cleave' | 'thrown' | 'sfx'>;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  game!: Game;
  cam = { x: 0, y: 0, zoom: 1 };
  /** Destino da câmera (visão dos jogadores): a câmera desliza até ele. */
  camGoal: { x: number; y: number; zoom: number } | null = null;
  /** Mouse dos outros jogadores (coordenadas do mundo). */
  pointers = new Map<string, { x: number; y: number; name: string; color: string; t: number }>();
  private lastFrame = 0;
  speed = 1;
  showGrid = false;
  /** Prévia do Descanso: Heróis mortos quase transparentes onde vão ressuscitar. */
  ghosts: { defId: string; cell: Cell }[] = [];
  /** Escolhendo onde ressuscitar: o Herói (defId) aparece transparente no Espaço verde sob o mouse. */
  ghostPick: string | null = null;
  hl: Highlights = { move: new Map(), path: [], attackUnits: new Set(), hoverCell: null, hoverUnit: null, doorIcons: [], activeUnit: null, los: null };
  hooks: RendererHooks = { onEvent: () => {}, onIdle: () => {} };

  private units = new Map<string, UnitView>();
  private doors = new Map<string, boolean>();
  private floor: Record<string, Token[]> = {};
  private queue: GameEvent[] = [];
  private current: { e: GameEvent; end: number; also?: GameEvent[] } | null = null;
  private floaters: Floater[] = [];
  /** Entradas de Monstro sorteadas recentemente: chave do Espaço -> instante. */
  private spawnFlash = new Map<string, { t0: number; ok: boolean }>();
  private projectiles: Projectile[] = [];
  private ground: HTMLCanvasElement | null = null;
  private groundOrigin = { x: 0, y: 0, scale: 1.5 };
  private doorIconPos = new Map<string, Pt>();
  private dpr = 1;
  private t = 0;
  private decor: { gx: number; gy: number; kind: 'tree' | 'bush' | 'mush' | 'mushB'; s: number; seed: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------------------------------------------------------------------
  setGame(game: Game) {
    this.game = game;
    this.units.clear(); // personagens da partida anterior não podem continuar no mapa
    this.spawnFlash.clear();
    this.queue = [];
    this.pickupsAlong = [];
    this.current = null;
    this.floaters = [];
    this.projectiles = [];
    this.buildDecor();
    this.buildGround();
    this.sync();
    this.fit();
  }

  get busy() { return !!this.current || this.queue.length > 0 || this.t < this.waitUntil; }

  /** Pausa depois do resultado de um ataque (dano, morte…): só antes do próximo lance, não antes do dano. */
  private hitPause = 0;
  private waitUntil = 0;
  pauseAfterHit(ms: number) { this.hitPause = ms; }
  /** Quando o golpe/projétil do último animateAttack encosta no alvo (ms a partir do início). */
  lastImpact = 0;

  /** Próximo ataque deste personagem na fila (antes de mudar o turno): quem ele vai atacar. */
  upcomingTargets(attackerId: string): string[] {
    for (const q of this.queue) {
      if (q.t === 'turn') break;
      if (q.t === 'attack' && q.attackerId === attackerId) return q.targets.map(t => t.id);
    }
    return [];
  }

  /** Personagens que vão ser atacados: mira vermelha pulsando em volta e "ALVO!" em cima (some sozinha). */
  private targets = new Map<string, number>();
  markTarget(id: string): boolean {
    const t0 = this.targets.get(id);
    const fresh = t0 === undefined || this.t - t0 > 3500;
    this.targets.set(id, this.t);
    return fresh;
  }

  /** Libera um evento segurado pela tela de batalha. */
  release() {
    if (this.current && this.current.end === Infinity) this.current.end = this.t;
  }

  /** Ferimentos que estão sendo mostrados agora (antes de aplicar o dano animado). */
  viewWounds(id: string): number { return this.units.get(id)?.wounds ?? 0; }
  /** O personagem como está na tela agora (Vida, vivo, Atordoado): o HUD usa isto para não adiantar o resultado. */
  viewUnit(id: string): { wounds: number; alive: boolean; stunned: boolean } | null {
    const v = this.units.get(id);
    return v ? { wounds: v.wounds, alive: v.alive, stunned: !!v.stunned } : null;
  }

  /** Descarta animações pendentes e ressincroniza com o estado (usado ao Desfazer). */
  reset() {
    this.queue = [];
    this.pickupsAlong = [];
    this.current = null;
    this.hitPause = 0;
    this.waitUntil = 0;
    this.floaters = [];
    this.projectiles = [];
    this.sync();
    this.idleSent = false;
  }

  enqueue(events: GameEvent[]) {
    this.queue.push(...events);
  }

  resize() {
    // nunca abaixo da resolução da tela (zoom do navegador < 100% deixava o mapa borrado);
    // qualidade alta: desenha com mais pixels (até 2x) para ficar nítido
    const dev = Math.max(1, window.devicePixelRatio || 1);
    this.dpr = Math.min(2.5, getSettings().gfx === 'normal' ? Math.min(dev, 2) : Math.max(dev, 1.5));
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  /** Área livre do tabuleiro (sem as barras de botões do celular): --safe-top/bottom/left/right no CSS. */
  view(): { w: number; h: number; cx: number; cy: number } {
    const st = getComputedStyle(document.documentElement);
    const v = (k: string) => parseFloat(st.getPropertyValue(k)) || 0;
    const t = v('--safe-top'), b = v('--safe-bottom'), l = v('--safe-left'), r = v('--safe-right');
    const W = window.innerWidth, H = window.innerHeight;
    const w = Math.max(120, W - l - r), h = Math.max(120, H - t - b);
    return { w, h, cx: l + w / 2, cy: t + h / 2 };
  }

  /** Ponto do mundo no centro da área livre. */
  viewCenter(): Pt { const v = this.view(); return this.screenToWorld(v.cx, v.cy); }

  /** Desliza a câmera até deixar o ponto do mundo (wx, wy) no centro da tela. */
  glideTo(wx: number, wy: number, zoom = this.cam.zoom) {
    const v = this.view();
    this.camGoal = { zoom, x: v.cx - wx * zoom, y: v.cy - wy * zoom };
  }

  /** Desliza a câmera até os Espaços (sem mudar o zoom). */
  glideCells(cells: Cell[], zoom = this.cam.zoom) {
    if (!cells.length) return;
    const pts = cells.map(c => g2s(c.c + 0.5, c.r + 0.5));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    this.glideTo(cx, cy - 40, zoom);
  }

  /** Posição no mundo do centro de um Espaço. */
  cellWorld(c: Cell): Pt { return g2s(c.c + 0.5, c.r + 0.5); }

  /** Mostra o mapa inteiro. */
  fit() {
    this.camGoal = null;
    const v = this.view();
    const small = v.w < 700;
    const tl = g2s(0, 9), tr = g2s(9, 0), top = g2s(0, 0), bot = g2s(9, 9);
    const mapW = tr.x - tl.x + (small ? 20 : 120), mapH = bot.y - top.y + (small ? 120 : 220);
    this.cam.zoom = Math.max(0.15, Math.min(1.25, Math.min((v.w - (small ? 12 : 120)) / mapW, (v.h - (small ? 20 : 150)) / mapH)));
    const cx = (tl.x + tr.x) / 2, cy = (top.y + bot.y) / 2 - 20;
    this.cam.x = v.cx - cx * this.cam.zoom;
    this.cam.y = v.cy - cy * this.cam.zoom;
  }

  flash: { cells: Cell[]; dest: Cell[]; t0: number } | null = null;
  /** Marcações dos jogadores (Ctrl + clique): Espaço piscando e seta na cor da Guilda. */
  pings: { cell: Cell; color: string; name: string; t0: number }[] = [];
  addPing(cell: Cell, color: string, name: string) {
    this.pings = [...this.pings.filter(p => this.t - p.t0 < 3500 && !(p.cell.c === cell.c && p.cell.r === cell.r)), { cell, color, name, t0: this.t }];
  }
  /** Pisca os Espaços (dourado = objetivo, verde = destino) e enquadra a câmera para mostrá-los. */
  flashCells(cells: Cell[], dest: Cell[] = []) {
    this.flash = { cells, dest, t0: this.t };
    this.fitCells([...cells, ...dest]);
  }
  private static FLASH_MS = 6500;

  /** Enquadra a câmera para mostrar todos os Espaços. */
  fitCells(cells: Cell[]) {
    if (!cells.length) return;
    const pts = cells.flatMap(c => [g2s(c.c, c.r), g2s(c.c + 1, c.r + 1), g2s(c.c + 1, c.r), g2s(c.c, c.r + 1)]);
    const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
    const y0 = Math.min(...pts.map(p => p.y)) - 120, y1 = Math.max(...pts.map(p => p.y));
    const v = this.view();
    const padX = v.w < 700 ? 30 : 640, padY = v.w < 700 ? 60 : 260;
    const z = Math.max(0.15, Math.min(this.cam.zoom, (v.w - padX) / Math.max(1, x1 - x0), (v.h - padY) / Math.max(1, y1 - y0)));
    this.cam.zoom = z;
    this.cam.x = v.cx - ((x0 + x1) / 2) * z;
    this.cam.y = v.cy + 20 - ((y0 + y1) / 2) * z;
  }

  /** Aproxima a câmera de um conjunto de Espaços (ex.: Área Inicial do jogador). */
  focus(cells: Cell[], zoom = 0.6) {
    this.camGoal = null;
    const v = this.view();
    const pts = cells.map(c => g2s(c.c + 0.5, c.r + 0.5));
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    this.cam.zoom = zoom;
    this.cam.x = v.cx - cx * zoom;
    this.cam.y = v.cy - (cy - 40) * zoom;
  }

  zoomAt(sx: number, sy: number, factor: number) {
    this.camGoal = null;
    const nz = Math.max(0.15, Math.min(1.6, this.cam.zoom * factor));
    const wx = (sx - this.cam.x) / this.cam.zoom, wy = (sy - this.cam.y) / this.cam.zoom;
    this.cam.zoom = nz;
    this.cam.x = sx - wx * nz;
    this.cam.y = sy - wy * nz;
  }

  // ---------------------------------------------------------------------
  // Picking
  // ---------------------------------------------------------------------
  /** Herói sendo arrastado no posicionamento: segue o ponteiro (posição na tela). */
  dragUnit: { id: string; x: number; y: number } | null = null;

  screenToWorld(sx: number, sy: number): Pt { return { x: (sx - this.cam.x) / this.cam.zoom, y: (sy - this.cam.y) / this.cam.zoom }; }

  pickCell(sx: number, sy: number): Cell | null {
    const w = this.screenToWorld(sx, sy);
    const g = s2g(w.x, w.y);
    const c = { c: Math.floor(g.gx), r: Math.floor(g.gy) };
    return this.game.board.exist(c) ? c : null;
  }

  pickUnit(sx: number, sy: number): string | null {
    const w = this.screenToWorld(sx, sy);
    let best: { id: string; d: number } | null = null;
    for (const u of this.units.values()) {
      if (!u.alive || !u.cell) continue;
      const p = g2s(u.pos.gx, u.pos.gy);
      const s = unitScale(u.defId);
      // a área de toque cobre o boneco desenhado inteiro (cabeça incluída), senão tocar na cabeça acerta o Espaço de trás
      if (w.x > p.x - 26 * s && w.x < p.x + 26 * s && w.y > p.y - 96 * s && w.y < p.y + 8) {
        // o mais próximo do centro do corpo vence (personagens no mesmo Espaço se sobrepõem)
        const d = Math.hypot((w.x - p.x) * 1.4, w.y - (p.y - 32 * s));
        if (!best || d < best.d) best = { id: u.id, d };
      }
    }
    return best?.id ?? null;
  }

  /** Ícone da chave ou a própria porta (só portas ao lado do Herói ativo). */
  pickDoorIcon(sx: number, sy: number): string | null {
    const w = this.screenToWorld(sx, sy);
    for (const [id, p] of this.doorIconPos) if (Math.hypot(w.x - p.x, w.y - p.y) < 24) return id;
    for (const id of [...this.hl.doorIcons, ...(this.hl.doorClick ?? [])]) {
      const d = this.game.s.doors.find(x => x.id === id)!;
      const m = g2s((d.a.c + d.b.c + 1) / 2, (d.a.r + d.b.r + 1) / 2, 22);
      if (Math.abs(w.x - m.x) < 46 && Math.abs(w.y - m.y) < 34) return id;
    }
    return null;
  }

  cellScreenPos(c: Cell): Pt {
    const p = g2s(c.c + 0.5, c.r + 0.5);
    return { x: p.x * this.cam.zoom + this.cam.x, y: p.y * this.cam.zoom + this.cam.y };
  }

  unitScreenPos(id: string): Pt | null {
    const u = this.units.get(id);
    if (!u || !u.cell) return null;
    const p = g2s(u.pos.gx, u.pos.gy);
    return { x: p.x * this.cam.zoom + this.cam.x, y: p.y * this.cam.zoom + this.cam.y };
  }

  // ---------------------------------------------------------------------
  // Modelo de visualização (atualizado pelos eventos)
  // ---------------------------------------------------------------------
  sync() {
    const g = this.game;
    for (const id of [...this.units.keys()]) if (!g.s.units[id]) this.units.delete(id);
    for (const u of g.units()) {
      const v = this.units.get(u.id);
      const nv: UnitView = {
        id: u.id, kind: u.kind, defId: u.defId, guild: u.guild, num: u.num,
        cell: u.alive && u.cell ? { ...u.cell } : null, wounds: u.wounds, maxHp: g.maxHp(u), alive: u.alive && !!u.cell,
        stunned: u.stunned, pos: v?.pos ?? { gx: 0, gy: 0 }, tween: null, alpha: 1, fade: null, bag: u.tokens.slice(),
        hurtT0: v?.hurtT0 ?? -9, lunge: null, flip: v?.flip ?? false, dir: v?.dir ?? this.centerDir(u.cell),
      };
      this.units.set(u.id, nv);
    }
    this.doors.clear();
    for (const d of g.s.doors) this.doors.set(d.id, d.open);
    this.floor = {};
    for (const [k, toks] of Object.entries(g.s.floor)) this.floor[k] = toks.map(t => ({ ...t }));
    this.hideoutGone = !!g.s.hideoutTaken;
    this.layoutUnits(true);
  }

  /** Direção de quem olha para o meio do tabuleiro a partir de `c`. */
  centerDir(c: Cell | null): Dir {
    if (!c || !this.game) return 'se';
    const m = this.game.map;
    const a = g2s(m.cols / 2, m.rows / 2), b = g2s(c.c + 0.5, c.r + 0.5);
    return dirFromScreen(a.x - b.x, a.y - b.y);
  }

  /** Tipo do projétil/som pelo ataque: Mágica = orbe, Arco = flecha, Espada arremessada = lâmina, Arremesso = pedra. */
  private attackKind(e: Strike, attacker: string): Projectile['kind'] {
    const base = attacker.replace(/\d+$/, '');
    if (['irma_prazer', 'lorde_presas'].includes(base)) return 'orb';
    if (['goblin', 'feral_lanceiro'].includes(base)) return 'arrow';
    const d = Object.values(CARDS).find(c => c.name === e.cardName);
    if (d?.magic) return 'orb';
    if (d?.group === 'Arco') return 'arrow';
    if (d?.group === 'Espada' || d?.group === 'Lança') return 'blade';
    return 'stone';
  }

  private slotPositions(): Map<string, { gx: number; gy: number }> {
    const byCell = new Map<string, UnitView[]>();
    for (const u of this.units.values()) if (u.alive && u.cell) {
      const k = key(u.cell);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k)!.push(u);
    }
    const out = new Map<string, { gx: number; gy: number }>();
    for (const list of byCell.values()) {
      list.sort((a, b) => a.id.localeCompare(b.id));
      const hasMission = (this.floor[key(list[0].cell!)] ?? []).some(t => this.openMission(t));
      list.forEach((u, i) => {
        const cx = u.cell!.c + 0.5, cy = u.cell!.r + 0.5;
        // marcador de Missão ocupa um lugar: o personagem sozinho fica no outro
        // Monstro Enorme (Rei Pavoroso): ocupa o Espaço inteiro, fica no meio
        if (list.length === 1 && MONSTERS[u.defId]?.abilities?.includes('huge')) { out.set(u.id, { gx: cx + 0.05, gy: cy + 0.05 }); return; }
        if (hasMission && list.length === 1) { out.set(u.id, { gx: cx + 0.17 + 0.1, gy: cy - 0.17 + 0.1 }); return; }
        // personagens na metade da frente do Espaço; o fundo fica para itens/marcadores
        if (list.length === 1) out.set(u.id, { gx: cx + 0.08, gy: cy + 0.08 });
        else {
          const d = i === 0 ? -0.17 : 0.17;
          out.set(u.id, { gx: cx + d + 0.1, gy: cy - d + 0.1 });
        }
      });
    }
    return out;
  }

  /** Lugar do marcador de Missão no Espaço (o oposto ao do personagem sozinho). */
  /** Onde fica cada coisa do chão dentro do Espaço, para não ficarem uma em cima da outra
   *  (portal, bueiro e placa da Entrada de Monstros, Lápide, marcador de Missão). */
  private spots(c: Cell): { portal: [number, number]; manhole: [number, number]; plaque: [number, number]; tomb: [number, number] } {
    const same = (x: Cell) => x.c === c.c && x.r === c.r;
    const portal = this.game.map.portals.some(p => same(p.cell));
    const entry = this.game.s.entryMarkers.some(m => same(m.cell));
    const mission = (this.floor[key(c)] ?? []).some(t => this.openMission(t));
    return {
      // o portal fica sempre no meio do Espaço; o resto vai para os cantos
      portal: [0.5, 0.5],
      manhole: portal ? [0.2, 0.2] : [0.62, 0.3],
      plaque: mission ? [0.78, 0.7] : portal ? [0.24, 0.76] : [0.3, 0.62],
      tomb: portal && entry ? [0.8, 0.22] : portal || entry ? [0.22, 0.22] : [0.78, 0.28],
    };
  }

  /** Marcador de Missão à vista (os escondidos entre os de Exploração ficam virados, como "?"). */
  private openMission(t: Token) { return t.type === 'missao' && (t.faceUp || !!this.game.s.debug.revealTokens); }

  private missionSlot(c: number, r: number) {
    return { gx: c + 0.5 - 0.17 + 0.1, gy: r + 0.5 + 0.17 + 0.1 };
  }

  private layoutUnits(snap: boolean) {
    const slots = this.slotPositions();
    for (const u of this.units.values()) {
      const s = slots.get(u.id);
      if (!s) continue;
      if (snap) { u.pos = { ...s }; continue; }
      if (u.tween) {
        const k = Math.min(1, (this.t - u.tween.t0) / u.tween.dur);
        if (u.tween.portal) {
          u.pos = k < 0.5 ? { gx: u.tween.fx, gy: u.tween.fy } : { ...s };
          u.alpha = Math.abs(1 - k * 2);
        } else {
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          u.pos = { gx: u.tween.fx + (s.gx - u.tween.fx) * e, gy: u.tween.fy + (s.gy - u.tween.fy) * e };
        }
        if (k >= 1) { u.tween = null; u.alpha = 1; }
      } else {
        // acomoda suavemente quando outro personagem entra/sai do Espaço
        u.pos.gx += (s.gx - u.pos.gx) * 0.25;
        u.pos.gy += (s.gy - u.pos.gy) * 0.25;
      }
    }
  }

  private floatAt(id: string, text: string, color: string, size = 22, dy = 0) {
    const u = this.units.get(id);
    if (!u) return;
    const p = g2s(u.pos.gx, u.pos.gy);
    this.floaters.push({ text, color, x: p.x, y: p.y - 78 + dy, t0: this.t, dur: 1100 / this.speed, size });
  }

  private startEvent(e: GameEvent): number {
    const now = this.t;
    let dur = (DUR[e.t] ?? 0) / this.speed;
    if (this.hooks.onEvent(e)) dur = Infinity;
    switch (e.t) {
      case 'move': {
        const u = this.units.get(e.id)!;
        u.tween = { fx: u.pos.gx, fy: u.pos.gy, t0: now, dur: (e.portal ? 520 : 280) / this.speed, portal: !!e.portal };
        const dx = g2s(e.to.c, e.to.r).x - g2s(e.from.c, e.from.r).x;
        if (dx !== 0) u.flip = dx < 0;
        // posicionamento inicial: todos olham para o meio do tabuleiro; no jogo, para onde estão indo
        if (this.game.s.deploying?.length) u.dir = this.centerDir(e.to);
        else if (!e.portal) { u.dir = dirFromStep(e.to.c - e.from.c, e.to.r - e.from.r); if (e.push) playOnce('rajada-de-vento', 1500); else play('foot-step', 0.6); }
        u.cell = { ...e.to };
        if (e.portal) { dur = 520 / this.speed; play('teletransport', 0.8); }
        break;
      }
      case 'door': this.doors.set(e.doorId, e.open); break;
      case 'attack': {
        if (!e.spread) this.addTrail(e.attackerId, e.targets.map(x => x.id), e);
        // os personagens só viram um para o outro na hora do golpe (animateAttack), não durante a rolagem
        break; // a investida / o projétil vêm depois da rolagem (animateAttack)
      }
      case 'strike': {
        // golpe depois da escolha do dano espalhado: vira para o alvo principal e anima contra todos
        const a = this.units.get(e.attackerId), t = this.units.get(e.targets[0]?.id);
        if (a && t && a !== t) { const pa = g2s(a.pos.gx, a.pos.gy), pt = g2s(t.pos.gx, t.pos.gy); a.flip = pt.x < pa.x; a.dir = dirFromScreen(pt.x - pa.x, pt.y - pa.y); }
        // o dano aparece no impacto (a volta da investida continua enquanto isso)
        this.animateAttack(e);
        dur = this.lastImpact + 30 / this.speed;
        break;
      }
      case 'damage': {
        const u = this.units.get(e.id)!;
        u.wounds = e.wounds;
        u.hurtT0 = now;
        this.floatAt(e.id, `-${e.amount}`, '#ff5a3c', 36);
        break;
      }
      case 'heal': {
        const u = this.units.get(e.id)!;
        u.wounds = e.wounds;
        this.floatAt(e.id, `+${e.amount}`, '#6cff7a', 32);
        break;
      }
      default: this.startEvent2(e, now); break;
    }
    return dur;
  }

  /** Animação do ataque (investida ou projétil). Retorna quanto tempo leva (ms). */
  animateAttack(e: Strike): number {
    const now = this.t;
    const a = this.units.get(e.attackerId);
    const t = this.units.get(e.targets[0]?.id);
    this.lastImpact = 0;
    if (!a || !t) return 0;
    const pa = g2s(a.pos.gx, a.pos.gy), pt = g2s(t.pos.gx, t.pos.gy);
    // agora sim: o atacante vira para o alvo e o alvo para o atacante
    if (a !== t) {
      a.flip = pt.x < pa.x;
      a.dir = dirFromScreen(pt.x - pa.x, pt.y - pa.y);
      if (t.kind === 'hero' || t.kind === 'monster') t.dir = dirFromScreen(pa.x - pt.x, pa.y - pt.y);
    }
    {
      {
        const kind = this.attackKind(e, a.defId);
        const sp = this.speed;
        // o tipo da animação vem da carta usada (Próximo = investida, Distância = projétil), mesmo no mesmo Espaço
        if (e.sfx) setTimeout(() => play(e.sfx as Sfx), (e.attackType === 'melee' && !e.thrown ? 450 : 380) / sp);
        if (e.cleave && !e.thrown) {
          // Fender: gira no lugar com a espada, atingindo quem está em volta
          a.spin = { t0: now + 100 / sp, dur: 700 / sp };
          setTimeout(() => play('cleave'), 200 / sp);
          this.lastImpact = 420 / sp;
          return 820 / sp;
        }
        if (e.attackType === 'melee' && !e.thrown) {
          // investida: corre até encostar no inimigo e volta
          let dx = pt.x - pa.x, dy = pt.y - pa.y;
          const d = Math.hypot(dx, dy);
          if (d < 8) { dx = (pt.x < pa.x ? -1 : 1) * 26; dy = 0; } else { const k = Math.min(0.72, Math.max(0.35, (d - 34) / d)); dx *= k; dy *= k; }
          a.lunge = { dx, dy, t0: now + 150 / sp, dur: 620 / sp, depth: Math.floor(t.pos.gx) + Math.floor(t.pos.gy) };
          // som de cada Monstro (Orcs) ou da arma
          const base = a.defId.replace(/\d+$/, '');
          setTimeout(() => play(base === 'orc' || base === 'capitao_orc' ? 'orc-sound' : 'atack-sword'), 330 / sp);
        } else {
          for (const tg of e.targets) {
            const tv = this.units.get(tg.id)!;
            const p2 = g2s(tv.pos.gx, tv.pos.gy);
            const from = { x: pa.x, y: pa.y - 40 }, to = { x: p2.x, y: p2.y - 36 };
            // mesmo Espaço (ou colados): afasta as pontas para o tiro aparecer num arco
            if (Math.hypot(to.x - from.x, to.y - from.y) < 40) { const s = to.x >= from.x ? 1 : -1; from.x -= 30 * s; to.x += 30 * s; }
            const dist = Math.hypot(to.x - from.x, to.y - from.y);
            // Jøhan arremessa a Espada: voa girando, quase reta
            this.projectiles.push({ from, to, t0: now + 250 / sp, dur: Math.min(900, 380 + dist * 0.35) / sp, kind: e.thrown ? 'blade' : kind, arc: e.thrown ? Math.max(20, Math.min(70, dist * 0.15)) : Math.max(50, Math.min(220, dist * 0.5)) });
          }
          const base = a.defId.replace(/\d+$/, '');
          setTimeout(() => play(e.thrown ? 'atack-sword' : base === 'goblin' ? 'archer-sound' : kind === 'orb' ? 'atack-magic' : 'atack-bow'), 230 / sp);
        }
        // investida: encosta no alvo em 150 + 35% de 620 ms
        if (e.attackType === 'melee' && !e.thrown) { this.lastImpact = 370 / sp; return 820 / sp; }
        const far = e.targets.map(tg => { const tv = this.units.get(tg.id)!; const p2 = g2s(tv.pos.gx, tv.pos.gy); return Math.hypot(p2.x - pa.x, p2.y - pa.y); });
        const total = (250 + Math.min(900, 380 + Math.max(...far) * 0.35)) / sp;
        this.lastImpact = total;
        return total;
      }
    }
  }

  private startEvent2(e: GameEvent, now: number) {
    switch (e.t) {
      case 'damage': {
        const u = this.units.get(e.id)!;
        u.wounds = e.wounds;
        u.hurtT0 = now;
        this.floatAt(e.id, `-${e.amount}`, '#ff5a3c', 36);
        break;
      }
      case 'heal': {
        const u = this.units.get(e.id)!;
        u.wounds = e.wounds;
        this.floatAt(e.id, `+${e.amount}`, '#6cff7a', 32);
        break;
      }
      case 'death': {
        const u = this.units.get(e.id)!;
        u.fade = { from: 1, to: 0, t0: now, dur: 480 / this.speed };
        if (e.exterminated) this.floatAt(e.id, 'EXTERMINADO!', '#ffd34d', 26, -18);
        if (e.banish) this.floatAt(e.id, 'BANIDO!', '#b892ff', 26, -18);
        break;
      }
      case 'stun': {
        const u = this.units.get(e.id)!;
        u.stunned = e.on;
        if (e.on) { this.floatAt(e.id, 'ATORDOADO!', '#ffe14d', 26, -18); play('stun', 0.8); }
        break;
      }
      case 'reward': {
        if (e.source === 'Esconderijo do Troll') this.hideoutGone = true;
        break;
      }
      case 'pickup': {
        // o marcador só entra na bolsa (e na cabeça do Herói) quando a animação de virar acabar (finishEvent)
        const u = this.units.get(e.heroId);
        for (const k of Object.keys(this.floor)) {
          this.floor[k] = this.floor[k].filter(t => t.id !== e.token.id);
          if (!this.floor[k].length) delete this.floor[k];
        }
        if (u) this.floatAt(e.heroId, tokenLabel(e.token), e.token.type === 'armadilha' ? '#ff8a5c' : '#e6c8ff', 16, -18);
        break;
      }
      case 'drop': {
        const k = key(e.cell);
        this.floor[k] = [...(this.floor[k] ?? []), ...e.tokens.map(t => ({ ...t }))];
        break;
      }
      case 'spawn':
      case 'respawn': {
        const u = this.units.get(e.id)!;
        u.cell = { ...e.cell };
        u.alive = true;
        // quem volta do Tabuleiro de Entrada (banido) mantém os Ferimentos
        u.wounds = e.t === 'spawn' ? this.game?.unit(e.id)?.wounds ?? 0 : 0;
        u.stunned = false;
        u.fade = { from: 0, to: 1, t0: now, dur: 400 / this.speed };
        u.dir = this.centerDir(e.cell);
        u.alpha = 0;
        const s = this.slotPositions().get(u.id);
        if (s) u.pos = { ...s };
        break;
      }
      case 'spawnRoll': {
        const em = this.game.s.entryMarkers.find(m => m.pair.every(f => e.faces.includes(f)) && e.faces.every(f => m.pair.includes(f)));
        if (em) this.spawnFlash.set(key(em.cell), { t0: now, ok: !!e.cell });
        break;
      }
      case 'reaction': {
        this.floatAt(e.monsterId, e.kind === 'alerta' ? 'Alerta!' : 'Vingança!', e.kind === 'alerta' ? '#ffd34d' : '#ff6b6b', 24, -14);
        break;
      }
      default:
        break;
    }
  }

  /** Marcadores pegos pelo mesmo Herói logo em seguida (mesmo Espaço): saem da fila juntos para aparecerem de uma vez. */
  takePickups(heroId: string): Extract<GameEvent, { t: 'pickup' }>[] {
    const out: Extract<GameEvent, { t: 'pickup' }>[] = [];
    const rest: GameEvent[] = [];
    let i = 0;
    for (; i < this.queue.length; i++) {
      const q = this.queue[i];
      if (q.t === 'move' || q.t === 'attack' || q.t === 'turn' || q.t === 'death') break;
      if (q.t === 'pickup' && q.heroId === heroId) {
        out.push(q);
        this.pickupsAlong.push(q);
        for (const k of Object.keys(this.floor)) {
          this.floor[k] = this.floor[k].filter(t => t.id !== q.token.id);
          if (!this.floor[k].length) delete this.floor[k];
        }
      } else rest.push(q);
    }
    this.queue = [...rest, ...this.queue.slice(i)];
    return out;
  }

  /** Marcadores que saíram da fila junto com um 'pickup' (takePickups): entram na bolsa quando ele terminar. */
  private pickupsAlong: Extract<GameEvent, { t: 'pickup' }>[] = [];

  private finishEvent(e: GameEvent) {
    if (e.t === 'pickup') {
      for (const p of [e, ...this.pickupsAlong]) {
        const u = this.units.get(p.heroId);
        if (u && !u.bag.some(t => t.id === p.token.id)) u.bag.push({ ...p.token });
      }
      this.pickupsAlong = [];
    }
    if (e.t === 'death') {
      const u = this.units.get(e.id)!;
      u.alive = false;
      u.cell = null;
      u.fade = null;
      u.alpha = 1;
    }
  }

  private pump() {
    while (true) {
      if (this.current) {
        if (this.t < this.current.end) return;
        this.finishEvent(this.current.e);
        for (const x of this.current.also ?? []) this.finishEvent(x);
        this.current = null;
      }
      if (this.t < this.waitUntil) return;
      // o resultado do ataque já apareceu: agora sim a pausa, antes do próximo lance
      if (this.hitPause && (!this.queue.length || !HIT_RESULT.has(this.queue[0].t))) {
        if (this.queue.length) this.waitUntil = this.t + this.hitPause;
        this.hitPause = 0;
        if (this.queue.length) return;
      }
      const e = this.queue.shift();
      if (!e) {
        if (!this.idleSent) {
          this.idleSent = true;
          this.sync2();
          this.hooks.onIdle();
        }
        return;
      }
      this.idleSent = false;
      let d = this.startEvent(e);
      // mortes (e danos) em seguida acontecem juntas: quem cai no mesmo ataque (ex.: Fender) morre ao mesmo tempo
      const also: GameEvent[] = [];
      if (d > 0 && (e.t === 'death' || e.t === 'damage')) {
        const along = new Set<string>([e.t, 'coins', 'log', 'cemetery', 'heal']);
        while (this.queue.length && along.has(this.queue[0].t) && d !== Infinity) {
          const q = this.queue.shift()!;
          d = Math.max(d, this.startEvent(q));
          also.push(q);
        }
      }
      if (d > 0) {
        this.current = { e, end: this.t + d, also };
        return;
      }
      this.finishEvent(e);
    }
  }
  private idleSent = true;

  /** Ressincroniza com o estado real ao fim da fila (sem quebrar animações em curso). */
  /** O item do Esconderijo (ex.: Machado de Schmetterling) já saiu do chão na tela. */
  private hideoutGone = false;
  private hideoutImg: HTMLImageElement | null = null;

  private sync2() {
    const g = this.game;
    for (const u of g.units()) {
      const v = this.units.get(u.id);
      if (!v) continue;
      v.alive = u.alive && !!u.cell;
      v.cell = v.alive ? { ...u.cell! } : null;
      v.wounds = u.wounds;
      v.bag = u.tokens.slice();
      v.maxHp = g.maxHp(u);
      v.stunned = u.stunned;
      if (!v.alive) { v.fade = null; v.alpha = 1; }
    }
    for (const d of g.s.doors) this.doors.set(d.id, d.open);
    this.floor = {};
    for (const [k, toks] of Object.entries(g.s.floor)) this.floor[k] = toks.map(t => ({ ...t }));
    this.hideoutGone = !!g.s.hideoutTaken;
  }

  // ---------------------------------------------------------------------
  // Desenho
  // ---------------------------------------------------------------------
  frame(now: number) {
    const dt = Math.min(100, now - (this.lastFrame || now));
    this.lastFrame = now;
    if (this.camGoal) {
      const g = this.camGoal, k = 1 - Math.exp(-dt / 160);
      this.cam.x += (g.x - this.cam.x) * k;
      this.cam.y += (g.y - this.cam.y) * k;
      this.cam.zoom += (g.zoom - this.cam.zoom) * k;
      if (Math.abs(g.x - this.cam.x) + Math.abs(g.y - this.cam.y) < 0.5 && Math.abs(g.zoom - this.cam.zoom) < 0.001) this.camGoal = null;
    }
    this.t = now;
    this.pump();
    this.layoutUnits(false);
    for (const u of this.units.values()) {
      if (u.fade) {
        const k = Math.min(1, (now - u.fade.t0) / u.fade.dur);
        u.alpha = u.fade.from + (u.fade.to - u.fade.from) * k;
        if (k >= 1 && u.fade.to === 1) u.fade = null;
      }
    }
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // fundo (floresta escura ao redor, como no Dofus)
    const bg = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#5f8f2a');
    bg.addColorStop(0.6, '#3c6420');
    bg.addColorStop(1, '#1d3512');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.setTransform(this.dpr * this.cam.zoom, 0, 0, this.dpr * this.cam.zoom, this.dpr * this.cam.x, this.dpr * this.cam.y);
    if (this.ground) {
      const o = this.groundOrigin;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.ground, o.x, o.y, this.ground.width / o.scale, this.ground.height / o.scale);
    }
    this.drawGroundOverlays();
    this.drawTrails();
    this.drawSprites();
    this.drawMissionBadges();
    this.drawDragged();
    this.drawFlashArrows();
    this.drawPings();
    this.drawAim();
    this.drawFx();
    this.drawPointers();
    // luz quente + vinheta (atmosfera do Dofus)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const warm = ctx.createLinearGradient(0, 0, W, H);
    warm.addColorStop(0, 'rgba(255,230,170,0.10)');
    warm.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, H);
    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(10,20,5,0)');
    vig.addColorStop(1, 'rgba(10,20,5,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  /** Marcações: anel pulsando no Espaço e seta pulando, na cor de quem marcou (3,5 s). */
  /** Prévia do Shift: a linha de mira e o X no que bloqueia, por cima das paredes e dos bonecos. */
  private drawAim() {
    const los = this.hl.los;
    if (!los?.aim) return;
    const ctx = this.ctx;
    const a = g2s(los.from.c + 0.5, los.from.r + 0.5), b = g2s(los.to.c + 0.5, los.to.r + 0.5);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([10, 7]);
    ctx.strokeStyle = los.ok ? '#7dff8c' : '#ff5a4a'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    // o que bloqueia: um X vermelho na borda/quina/Espaço
    const k = los.block;
    if (k) {
      // na parede/porta/quina o X fica na altura do muro
      const p = k.kind === 'cell' || k.kind === 'off' ? g2s(k.a.c + 0.5, k.a.r + 0.5)
        : g2s((k.a.c + k.b.c) / 2 + 0.5, (k.a.r + k.b.r) / 2 + 0.5, 20);
      const s = 11;
      ctx.lineCap = 'round';
      for (const [w, col] of [[8, 'rgba(0,0,0,0.6)'], [4.5, '#ff4a3d']] as const) {
        ctx.strokeStyle = col; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(p.x - s, p.y - s); ctx.lineTo(p.x + s, p.y + s); ctx.moveTo(p.x + s, p.y - s); ctx.lineTo(p.x - s, p.y + s); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.restore();
  }

  private drawPings() {
    if (!this.pings.length) return;
    const ctx = this.ctx;
    this.pings = this.pings.filter(p => this.t - p.t0 < 3500);
    for (const p of this.pings) {
      const k = (this.t - p.t0) / 1000;
      const fade = Math.min(1, Math.max(0, (3.5 - k) / 0.6));
      const pulse = 0.5 + 0.5 * Math.sin(k * 10);
      ctx.save();
      ctx.globalAlpha = fade;
      // anéis expandindo no chão
      for (let i = 0; i < 2; i++) {
        const s = ((k * 1.2 + i * 0.5) % 1);
        diamondPath(ctx, p.cell.c + 0.5 - 0.5 * (0.4 + s * 0.6), p.cell.r + 0.5 - 0.5 * (0.4 + s * 0.6), 0.4 + s * 0.6, 0.4 + s * 0.6);
        ctx.strokeStyle = p.color; ctx.globalAlpha = fade * (1 - s); ctx.lineWidth = 8; ctx.stroke();
      }
      ctx.globalAlpha = fade;
      diamondPath(ctx, p.cell.c + 0.04, p.cell.r + 0.04, 0.92, 0.92);
      ctx.fillStyle = p.color; ctx.globalAlpha = fade * (0.25 + pulse * 0.25); ctx.fill();
      ctx.globalAlpha = fade; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
      // seta pulando com o nome
      const c = g2s(p.cell.c + 0.5, p.cell.r + 0.5);
      const y = c.y - 170 - Math.abs(Math.sin(k * 6)) * 30;
      ctx.translate(c.x, y);
      ctx.beginPath();
      ctx.moveTo(-24, -34); ctx.lineTo(24, -34); ctx.lineTo(24, 0); ctx.lineTo(44, 0); ctx.lineTo(0, 46); ctx.lineTo(-44, 0); ctx.lineTo(-24, 0); ctx.closePath();
      ctx.fillStyle = p.color; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.font = '800 26px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(p.name, 0, -42);
      ctx.fillStyle = '#fff'; ctx.fillText(p.name, 0, -42);
      ctx.restore();
    }
  }

  /** Setas pulando acima dos Espaços destacados de uma Missão. */
  private drawFlashArrows() {
    const f = this.flash;
    if (!f || this.t - f.t0 >= Renderer.FLASH_MS) return;
    const ctx = this.ctx;
    const k = (this.t - f.t0) / 1000;
    const fade = Math.min(1, Math.max(0, (Renderer.FLASH_MS / 1000 - k) / 0.8));
    const arrow = (c: Cell, col: string) => {
      const p = g2s(c.c + 0.5, c.r + 0.5);
      const y = p.y - 150 - Math.abs(Math.sin(k * 5 + c.c)) * 26;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, y);
      ctx.beginPath();
      ctx.moveTo(-22, -30); ctx.lineTo(22, -30); ctx.lineTo(22, 0); ctx.lineTo(40, 0); ctx.lineTo(0, 40); ctx.lineTo(-40, 0); ctx.lineTo(-22, 0); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#2a1606'; ctx.stroke();
      ctx.restore();
    };
    for (const c of f.dest) arrow(c, '#3fd37a');
    for (const c of f.cells) arrow(c, '#ffc531');
  }

  /** Setas do mouse dos outros jogadores, com o nome. */
  private drawPointers() {
    const ctx = this.ctx;
    for (const [k, p] of this.pointers) {
      const age = this.t - p.t;
      if (age > 6000) { this.pointers.delete(k); continue; }
      ctx.save();
      ctx.globalAlpha = age < 4000 ? 1 : 1 - (age - 4000) / 2000;
      ctx.translate(p.x, p.y);
      ctx.scale(1 / this.cam.zoom, 1 / this.cam.zoom);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.lineTo(6, 17); ctx.lineTo(10, 26); ctx.lineTo(14, 24); ctx.lineTo(10, 15); ctx.lineTo(17, 15); ctx.closePath();
      ctx.fillStyle = p.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.stroke(); ctx.fill();
      ctx.font = 'bold 13px "Baloo 2", sans-serif';
      const w = ctx.measureText(p.name).width + 12;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.roundRect(14, 26, w, 20, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(p.name, 20, 36.5);
      ctx.restore();
    }
  }

  /** Rastros de ataque: linha na cor de quem atacou, do atacante até cada alvo (some aos poucos). */
  private trails: { from: Cell; to: Cell[]; color: string; t0: number; ev?: GameEvent }[] = [];
  private addTrail(attackerId: string, targetIds: string[], ev?: GameEvent) {
    const a = this.units.get(attackerId);
    const to = targetIds.map(id => this.units.get(id)?.cell).filter((c): c is Cell => !!c);
    if (!a?.cell || !to.length) return;
    const color = a.guild ? GUILDS[a.guild as keyof typeof GUILDS].color : '#b04ad8';
    this.trails.push({ from: { ...a.cell }, to: to.map(c => ({ ...c })), color, t0: this.t, ev });
  }
  private drawTrails() {
    const ctx = this.ctx;
    const LIFE = 7000;
    // enquanto o ataque ainda está acontecendo (dados rolando), o tempo do rastro não corre
    for (const tr of this.trails) if (tr.ev && this.current?.e === tr.ev) tr.t0 = this.t;
    this.trails = this.trails.filter(tr => this.t - tr.t0 < LIFE);
    for (const tr of this.trails) {
      const age = this.t - tr.t0;
      const fade = age < 5000 ? 1 : 1 - (age - 5000) / 2000;
      const a = g2s(tr.from.c + 0.5, tr.from.r + 0.5);
      for (const c of tr.to) {
        const b = g2s(c.c + 0.5, c.r + 0.5);
        const same = tr.from.c === c.c && tr.from.r === c.r;
        ctx.save();
        ctx.globalAlpha = fade;
        // marca no chão do atacante e do alvo
        for (const [cell, r] of [[tr.from, 0.22], [c, 0.36]] as [Cell, number][]) {
          diamondPath(ctx, cell.c + 0.5 - r, cell.r + 0.5 - r, r * 2, r * 2);
          ctx.fillStyle = tr.color + '55'; ctx.fill();
          ctx.lineWidth = 5; ctx.strokeStyle = tr.color; ctx.stroke();
        }
        if (!same) {
          // arco com setas andando do atacante até o alvo
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.25;
          ctx.lineCap = 'round';
          ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
          ctx.lineWidth = 7; ctx.strokeStyle = tr.color; ctx.setLineDash([26, 16]); ctx.lineDashOffset = -age / 25;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
          ctx.setLineDash([]);
          // ponta da seta no alvo
          const ang = Math.atan2(b.y - my, b.x - mx);
          ctx.translate(b.x, b.y); ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-26, -15); ctx.lineTo(-26, 15); ctx.closePath();
          ctx.fillStyle = tr.color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  /** Monstros que a Lápide pode ativar agora (piscam e ficam marcados no chão). */
  private puppetIds(): Set<string> {
    const p = this.game?.s.puppet;
    if (!p) return new Set();
    return new Set(p.monsterId ? [p.monsterId] : this.game.puppetCandidates(p.cat).map(m => m.id));
  }

  /** Lápide (Beyond the Grave) em pé no Espaço: desenhada junto com os personagens, na ordem de profundidade
   *  (assim fica na frente da parede de trás do Espaço, e atrás das paredes da frente). */
  private drawTomb(tb: { cell: Cell }) {
    const ctx = this.ctx;
    const tt = this.t / 1000;
    const [tx, ty] = this.spots(tb.cell).tomb;
    const p = g2s(tb.cell.c + tx, tb.cell.r + ty);
    const a = this.game.s.activation;
    const h = a ? this.game.unit(a.heroId) : null;
    const glow = !!h?.cell && h.cell.c === tb.cell.c && h.cell.r === tb.cell.r && this.game.canRevealTomb();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 2, 38, 12, 0, 0, Math.PI * 2); ctx.fill();
    const img = tokenImage('lapide');
    if (img) {
      // imagem da Lápide (public/tokens/lapide.webp), em pé com a base no chão
      const H = 84;
      if (glow) { ctx.shadowColor = `rgba(184,146,255,${0.6 + 0.4 * Math.sin(tt * 5)})`; ctx.shadowBlur = 22; }
      ctx.drawImage(img, -H / 2, -H + 6, H, H);
    } else {
      const grd = ctx.createLinearGradient(-22, -60, 22, 0);
      grd.addColorStop(0, '#c9d1d6'); grd.addColorStop(1, '#7d878e');
      ctx.fillStyle = grd;
      ctx.strokeStyle = '#3c454c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-22, 2); ctx.lineTo(-22, -40); ctx.arc(0, -40, 22, Math.PI, 0); ctx.lineTo(22, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (glow) {
        ctx.strokeStyle = `rgba(184,146,255,${0.55 + 0.45 * Math.sin(tt * 5)})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-26, 4); ctx.lineTo(-26, -42); ctx.arc(0, -42, 26, Math.PI, 0); ctx.lineTo(26, 4); ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawGroundOverlays() {
    const ctx = this.ctx;
    const tt = this.t / 1000;
    // Lápide ativando um Monstro: marca roxa pulsando no chão dos que podem ser escolhidos
    for (const id of this.puppetIds()) {
      const u = this.units.get(id);
      if (!u?.cell) continue;
      const pulse = 0.5 + 0.5 * Math.sin(tt * 6);
      diamondPath(ctx, u.cell.c + 0.06, u.cell.r + 0.06, 0.88, 0.88);
      ctx.fillStyle = `rgba(184,146,255,${0.18 + pulse * 0.22})`; ctx.fill();
      ctx.strokeStyle = `rgba(214,190,255,${0.6 + pulse * 0.4})`; ctx.lineWidth = 5; ctx.setLineDash([14, 8]); ctx.stroke(); ctx.setLineDash([]);
    }
    // Entradas de Monstro: placa no chão com os 2 símbolos de dado que fazem o Monstro surgir ali
    for (const em of this.game.s.entryMarkers) {
      const k = key(em.cell);
      const fl = this.spawnFlash.get(k);
      const age = fl ? (this.t - fl.t0) / 1000 : 99;
      if (fl && age > 6) this.spawnFlash.delete(k);
      const glow = age < 6 ? 0.5 + 0.5 * Math.sin(age * 9) : 0;
      // borda do Espaço em roxo
      diamondPath(ctx, em.cell.c + 0.03, em.cell.r + 0.03, 0.94, 0.94);
      ctx.strokeStyle = glow ? `rgba(${fl!.ok ? '255,90,60' : '200,160,255'},${0.6 + glow * 0.4})` : 'rgba(150,80,200,0.55)';
      ctx.lineWidth = glow ? 7 : 3.5;
      ctx.setLineDash(glow ? [] : [12, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      // placa com os símbolos
      const [px, py] = this.spots(em.cell).plaque;
      const p = g2s(em.cell.c + px, em.cell.r + py);
      ctx.save();
      ctx.translate(p.x, p.y);
      const sc = 1 + glow * 0.15;
      ctx.scale(sc, sc);
      const plaque = entryPlaque(em.pair);
      if (plaque) {
        // placa de pedra deitada no chão (como no tabuleiro)
        if (glow) { ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 18; }
        ctx.save(); ctx.scale(1, 0.62); ctx.rotate(-0.6);
        const H = 112, W = H * plaque.width / plaque.height;
        ctx.drawImage(plaque, -W / 2, -H / 2, W, H);
        ctx.restore();
        ctx.shadowBlur = 0;
      } else {
      ctx.fillStyle = 'rgba(45,25,60,0.88)';
      ctx.strokeStyle = glow ? '#ffd34d' : '#b98ae0';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(-42, -19, 84, 38, 10); ctx.fill(); ctx.stroke();
      em.pair.forEach((f, i) => {
        const x = -20 + i * 40;
        ctx.fillStyle = '#1e1e22'; ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x - 14, -14, 28, 28, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = f === 'crit' ? '#ffcf2e' : '#ffffff';
        ctx.font = '900 19px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(DIE_ICON[f], x, 1);
      });
      }
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      if (glow) {
        const q = g2s(em.cell.c + 0.5, em.cell.r + 0.5);
        ctx.font = '900 20px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#1b0f08';
        const txt = fl!.ok ? 'Monstro surgiu aqui!' : 'Entrada ocupada';
        ctx.strokeText(txt, q.x, q.y - 70); ctx.fillStyle = fl!.ok ? '#ff9b7a' : '#d7b8ff'; ctx.fillText(txt, q.x, q.y - 70);
      }
      }
    // Marcadores de Missão: Espaço destacado no chão (visível mesmo com Monstro em cima)
    for (const [k, toks] of Object.entries(this.floor)) {
      const mt = toks.find(t => this.openMission(t));
      if (!mt) continue;
      const [c, r] = k.split(',').map(Number);
      const col = hexRgb(gemColor(mt.color));
      const pulse = 0.5 + 0.5 * Math.sin(tt * 3);
      diamondPath(ctx, c + 0.04, r + 0.04, 0.92, 0.92);
      ctx.fillStyle = `rgba(${col},${0.18 + pulse * 0.12})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.95)`;
      ctx.lineWidth = 5;
      ctx.stroke();
      diamondPath(ctx, c + 0.12, r + 0.12, 0.76, 0.76);
      ctx.strokeStyle = 'rgba(255,240,180,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
      }
    // portais
    for (const p of this.game.map.portals) {
      const [sx, sy] = this.spots(p.cell).portal;
      const c = g2s(p.cell.c + sx, p.cell.r + sy);
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1.9, 1.9);
      if (p.color === 'magenta' || p.color === 'rosa') ctx.filter = 'hue-rotate(150deg) saturate(1.4)';
      drawPortal(ctx, 0, 0, tt);
      ctx.restore();
      // portal que só quem tem o Título usa (ex.: portais vermelhos e o "Senhor das Águias"): aviso em cima
      const pt = this.game.map.portalTitle;
      if (pt && pt.color === p.color) {
        const who = this.game.guilds().filter(x => this.game.hasTitle(x.id, pt.title));
        const txt = who.length ? `Só ${who.map(x => teamName(x.id)).join(' e ')} pode usar` : 'Ninguém pode usar';
        ctx.save();
        ctx.font = '800 15px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(`🔒 ${txt}`).width + 18, y = c.y - 46;
        ctx.fillStyle = 'rgba(30,12,30,0.82)'; ctx.beginPath(); ctx.roundRect(c.x - w / 2, y - 12, w, 24, 12); ctx.fill();
        ctx.strokeStyle = who.length ? GUILDS[who[0].id].color : '#c0306a'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillText(`🔒 ${txt}`, c.x, y + 1);
        ctx.restore();
      }
      }
    // minas das Bombas
    for (const mn of this.game.s.mines ?? []) {
      const q = g2s(mn.cell.c + 0.7, mn.cell.r + 0.72);
      const col = GUILDS[mn.guild].color;
      const art = mn.card ? cardIcon(mn.card) : null;
      if (art) {
        // a arte da carta (a própria bomba) deitada no chão, com uma aura na cor da Guilda
        ctx.save(); ctx.translate(q.x, q.y);
        const pulse = 0.5 + 0.5 * Math.sin(tt * 3 + mn.cell.c + mn.cell.r);
        const rgb = hexRgb(col);
        ctx.save(); ctx.scale(1, 0.5);
        const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 48);
        glow.addColorStop(0, `rgba(${rgb},${0.75 + 0.2 * pulse})`); glow.addColorStop(0.6, `rgba(${rgb},0.35)`); glow.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = `rgba(${rgb},${0.6 + 0.4 * pulse})`; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        // do tamanho de um Herói
        const h = 84, w = h * art.width / art.height;
        ctx.shadowColor = col; ctx.shadowBlur = 8 + pulse * 6;
        ctx.drawImage(art, -w / 2, -h + 4, w, h);
        ctx.restore();
        continue;
      }
      ctx.save(); ctx.translate(q.x, q.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 4, 16, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a2a2a'; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -8, 12, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -18); ctx.quadraticCurveTo(12, -26, 16, -22); ctx.stroke();
      const fl = 0.5 + 0.5 * Math.sin(tt * 10 + mn.cell.c);
      ctx.fillStyle = `rgba(255,${160 + fl * 80},40,${0.7 + fl * 0.3})`; ctx.beginPath(); ctx.arc(16, -22, 3 + fl * 2, 0, 7); ctx.fill();
      ctx.restore();
      }
    // destaques de movimento (azul Dofus)
    // objetivos de Missão piscando
    if (this.flash && this.t - this.flash.t0 < Renderer.FLASH_MS) {
      const k = (this.t - this.flash.t0) / 1000;
      const fade = Math.min(1, Math.max(0, (Renderer.FLASH_MS / 1000 - k) / 0.8));
      const a = (0.5 + 0.5 * Math.sin(k * 8)) * fade;
      const paint = (cells: Cell[], fill: string, line: string) => {
        for (const c of cells) {
          diamondPath(ctx, c.c + 0.03, c.r + 0.03, 0.94, 0.94);
          ctx.fillStyle = `rgba(${fill},${(0.3 + a * 0.4) * fade})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(20,10,0,${0.55 * fade})`;
          ctx.lineWidth = 12;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${line},${(0.65 + a * 0.35) * fade})`;
          ctx.lineWidth = 7;
          ctx.stroke();
        }
      };
      paint(this.flash.dest, '60,220,110', '170,255,190');
      paint(this.flash.cells, '255,170,0', '255,236,120');
      }
    const purple = this.hl.moveColor === 'purple', green = this.hl.moveColor === 'green';
    // Configurações: sem a sinalização de ajuda, não pinta os Espaços azuis (andar) nem os vermelhos (atacar) da jogada normal
    const hints = getSettings().hints !== false;
    for (const [k] of hints || purple || green ? this.hl.move : []) {
      const [c, r] = k.split(',').map(Number);
      diamondPath(ctx, c + 0.05, r + 0.05, 0.9, 0.9);
      ctx.fillStyle = green ? 'rgba(60,190,90,0.45)' : purple ? 'rgba(150,70,210,0.42)' : 'rgba(40,120,230,0.42)';
      ctx.fill();
      ctx.strokeStyle = green ? 'rgba(170,255,180,0.9)' : purple ? 'rgba(220,170,255,0.85)' : 'rgba(160,210,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      }
    for (const k of hints || purple ? this.hl.attackCells ?? [] : []) {
      const [c, r] = k.split(',').map(Number);
      diamondPath(ctx, c + 0.12, r + 0.12, 0.76, 0.76);
      ctx.setLineDash([14, 8]);
      ctx.strokeStyle = 'rgba(255,90,60,0.95)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.setLineDash([]);
      }
    for (const [i, c] of this.hl.path.entries()) {
      diamondPath(ctx, c.c + 0.12, c.r + 0.12, 0.76, 0.76);
      ctx.fillStyle = i === this.hl.path.length - 1 ? 'rgba(120,200,255,0.75)' : 'rgba(90,170,255,0.55)';
      ctx.fill();
      }
    if (this.hl.path.length) {
      const last = this.hl.path[this.hl.path.length - 1];
      const cost = this.hl.move.get(key(last));
      if (cost !== undefined) {
        const p = g2s(last.c + 0.5, last.r + 0.5);
        ctx.font = 'bold 15px "Baloo 2", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = '#0d2a52'; ctx.strokeText(`${cost} PM`, p.x, p.y + 5);
        ctx.fillStyle = '#ffffff'; ctx.fillText(`${cost} PM`, p.x, p.y + 5);
      }
      }
    // alvos de ataque (vermelho)
    for (const id of hints || purple ? this.hl.attackUnits : []) {
      const u = this.units.get(id);
      if (!u?.cell) continue;
      diamondPath(ctx, u.cell.c + 0.05, u.cell.r + 0.05, 0.9, 0.9);
      ctx.fillStyle = 'rgba(232,80,40,0.45)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,120,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      }
    if (this.hl.hoverCell) {
      const c = this.hl.hoverCell;
      diamondPath(ctx, c.c, c.r, 1, 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      }
    if (this.hl.los) {
      const a = g2s(this.hl.los.from.c + 0.5, this.hl.los.from.r + 0.5), b = g2s(this.hl.los.to.c + 0.5, this.hl.los.to.r + 0.5);
      if (!this.hl.los.aim) {
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = this.hl.los.ok ? 'rgba(120,255,140,0.95)' : 'rgba(255,80,80,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // o Espaço de onde se mira
        const f = this.hl.los.from;
        diamondPath(ctx, f.c, f.r, 1, 1);
        ctx.fillStyle = 'rgba(255,214,90,0.22)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,90,0.95)'; ctx.lineWidth = 3; ctx.stroke();
      }
      }
    if (this.showGrid) {
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      for (const c of this.game.board.allCells()) {
        const p = g2s(c.c + 0.5, c.r + 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillText(`${c.c},${c.r}`, p.x, p.y + 22);
      }
      const em = this.game.s.entryMarkers;
      for (const m of em) {
        const p = g2s(m.cell.c + 0.28, m.cell.r + 0.8);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(m.pair.map(faceShort).join('+'), p.x, p.y - 14);
      }
      }
  }

  private drawSprites() {
    const ctx = this.ctx;
    const tt = this.t / 1000;
    const g = this.game;
    // Ordenação por Espaço: chave = profundidade do Espaço * 4 + camada.
    // Camadas: 0 = paredes/portas da borda de trás do Espaço, 1 = itens no chão, 2 = personagens/blocos.
    // Assim um item ou personagem nunca é desenhado "debaixo" da parede de trás do próprio Espaço.
    const K = (cellDepth: number, layer: number, frac = 0) => cellDepth * 4 + layer + Math.max(0, Math.min(0.95, frac));
    type Spr = { d: number; draw: () => void };
    const list: Spr[] = [];

    // quem está em cada Espaço (para deixar paredes da frente semitransparentes)
    const occupied = new Set<string>();
    for (const u of this.units.values()) if (u.alive && u.cell) occupied.add(key(u.cell));
    const hl = this.hl;
    if (hl.hoverCell) occupied.add(key(hl.hoverCell));
    for (const c of hl.path) occupied.add(key(c));
    const behind = (a: Cell) => occupied.has(key(a));

    for (const d of this.decor) {
      const cd = Math.floor(d.gx) + Math.floor(d.gy);
      list.push({
        d: K(cd, 2, (d.gx + d.gy - cd) / 2),
        draw: () => {
          const p = g2s(d.gx, d.gy, -CLIFF);
          const sc = d.s * 2.1;
          if (d.kind === 'tree') drawTree(ctx, p.x, p.y, sc);
          else if (d.kind === 'bush') drawBush(ctx, p.x, p.y, sc, '#5f9e2e', d.seed);
          else drawMushroom(ctx, p.x, p.y, sc, d.kind === 'mush' ? '#d8452f' : '#e07b2a');
        },
      });
    }

    // prévia de onde os Heróis mortos vão ressuscitar (Descanso)
    const hov = this.hl.hoverCell;
    const pickGhost = this.ghostPick && hov && this.hl.move.has(key(hov)) ? [{ defId: this.ghostPick, cell: hov }] : [];
    for (const gh of [...this.ghosts, ...pickGhost]) {
      // no lugar livre do Espaço (se já tem alguém, fica do outro lado)
      const busy = this.game.unitsAt(gh.cell).length > 0;
      const gx = gh.cell.c + (busy ? 0.43 : 0.58), gy = gh.cell.r + (busy ? 0.77 : 0.58);
      list.push({ d: K(gh.cell.c + gh.cell.r, 2, 0.5), draw: () => {
        const p = g2s(gx, gy);
        ctx.save(); ctx.translate(p.x, p.y);
        drawCharacter(ctx, gh.defId, { dir: 'se', flip: false, t: this.t / 1000, hurt: 0, alpha: 0.45, stunned: false, lunge: 0, scale: unitScale(gh.defId) * 0.66 });
        ctx.restore();
      } });
    }

    // Lápides: em pé, na camada dos itens do Espaço (na frente da parede de trás)
    for (const tb of g.s.tombs ?? []) {
      const [tx, ty] = this.spots(tb.cell).tomb;
      list.push({ d: K(tb.cell.c + tb.cell.r, 1.4, (tx + ty) / 2), draw: () => this.drawTomb(tb) });
    }

    // Espaços bloqueados (plataformas com decoração)
    g.map.pillars.forEach(c => {
      list.push({
        d: K(c.c + c.r, 2),
        draw: () => {
          ctx.save();
          // Espaço bloqueado: plataforma cinza meio transparente (o piso aparece por baixo); as paredes em volta vêm abaixo
          ctx.globalAlpha = 0.5;
          isoBox(ctx, c.c + 0.02, c.r + 0.02, c.c + 0.98, c.r + 0.98, 0, 30, '#c9c6c0', '#a8a49c', '#8f8b84', 'rgba(60,55,50,0.8)');
          // "X" fino e tracejado em cima: ninguém passa por aqui
          {
            ctx.globalAlpha = 0.7;
            // ligando os meios dos lados do losango: na tela fica um "X"
            const i0 = 0.1, i1 = 0.9;
            const p1 = g2s(c.c + 0.5, c.r + i0, 30), p2 = g2s(c.c + 0.5, c.r + i1, 30), p3 = g2s(c.c + i0, c.r + 0.5, 30), p4 = g2s(c.c + i1, c.r + 0.5, 30);
            ctx.strokeStyle = 'rgba(70,64,58,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
        },
      });
    });

    // paredes: pertencem ao Espaço da frente (maior c+r)
    // paredes do mapa + paredes em volta dos Espaços bloqueados (onde não há porta)
    const wallEdges = new Map<string, [Cell, Cell]>();
    const ek = (a: Cell, b: Cell) => [key(a), key(b)].sort().join('|');
    for (const [a, b] of g.map.walls) if (g.board.exist(a) && g.board.exist(b) && (g.board.playable(a) || g.board.playable(b))) wallEdges.set(ek(a, b), [a, b]);
    const doorAt = new Set(g.s.doors.map(d => ek(d.a, d.b)));
    for (const p of g.map.pillars) {
      for (const n of [{ c: p.c + 1, r: p.r }, { c: p.c - 1, r: p.r }, { c: p.c, r: p.r + 1 }, { c: p.c, r: p.r - 1 }]) {
        if (g.board.playable(n) && !doorAt.has(ek(p, n))) wallEdges.set(ek(p, n), [p, n]);
      }
    }
    for (const [a, b] of wallEdges.values()) {
      const [back, front] = a.c + a.r < b.c + b.r ? [a, b] : [b, a];
      const box = edgeBox(a, b, 0.03);
      const fade = behind(back);
      list.push({ d: K(front.c + front.r, 0), draw: () => { ctx.save(); if (fade) ctx.globalAlpha = 0.45; drawWall(ctx, box); ctx.restore(); } });
    }

    // portas
    this.doorIconPos.clear();
    for (const d of g.s.doors) {
      const open = (this.doors.get(d.id) ?? d.open) !== !!this.hl.doorFlip?.includes(d.id);
      const [back, front] = d.a.c + d.a.r < d.b.c + d.b.r ? [d.a, d.b] : [d.b, d.a];
      const box = edgeBox(d.a, d.b, 0.025);
      const fade = behind(back);
      list.push({ d: K(front.c + front.r, 0, 0.01), draw: () => { ctx.save(); if (fade && !open) ctx.globalAlpha = 0.5; drawDoor(ctx, box, open, !!d.small, !!d.locked); ctx.restore(); } });
      if (this.hl.doorIcons.includes(d.id)) {
        const p = g2s(box.mx, box.my, 90);
        this.doorIconPos.set(d.id, p);
        list.push({ d: 1e9, draw: () => drawDoorIcon(ctx, p, open, tt) });
      }
    }

    // item do Esconderijo (ex.: Machado de Schmetterling): a carta fica no chão até alguém entrar e pegar
    const hd = this.game.map.hideout;
    const hid = hd?.cards.find(id => CARDS[id]);
    if (hd && hid && !this.hideoutGone) {
      const art = CARD_ART[hid];
      if (art && !this.hideoutImg) { this.hideoutImg = new Image(); this.hideoutImg.src = `${import.meta.env.BASE_URL}cards/${art.img}.webp`; }
      for (const cell of hd.cells.slice(0, 1)) {
        // só o ícone do item, deitado no centro do Espaço, como parte do cenário (com uma sombra no chão)
        list.push({
          d: K(cell.c + cell.r, 1, 0),
          draw: () => {
            const p = g2s(cell.c + 0.5, cell.r + 0.5);
            const S = 117;
            ctx.save(); ctx.translate(p.x, p.y);
            ctx.fillStyle = 'rgba(0,0,0,.28)';
            ctx.beginPath(); ctx.ellipse(0, 4, S * 0.42, S * 0.18, 0, 0, Math.PI * 2); ctx.fill();
            const img = this.hideoutImg;
            if (img?.complete && img.naturalWidth) { ctx.scale(1, 0.62); ctx.rotate(-0.5); ctx.drawImage(img, -S / 2, -S / 2, S, S); }
            else { ctx.font = '40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🪓', 0, 12); }
            ctx.restore();
          },
        });
      }
    }

    // itens/marcadores no chão (fundo do Espaço)
    for (const [k, toks] of Object.entries(this.floor)) {
      const [c, r] = k.split(',').map(Number);
      // marcador de Missão escondido entre os de Exploração (virado) aparece como os outros: "?"
      toks.filter(t => this.openMission(t)).forEach(t => {
        // deitado no chão, num dos dois lugares do Espaço (como um personagem); dá para subir em cima
        const s0 = this.missionSlot(c, r);
        list.push({
          d: K(c + r, 1.5, (s0.gx + s0.gy - c - r) / 2),
          draw: () => {
            const p = g2s(s0.gx, s0.gy);
            ctx.save(); ctx.translate(p.x, p.y);
            if (!drawTokenImage(ctx, t, false, 128, 0, true)) { ctx.scale(1.9, 1.9); drawGem(ctx, 0, 0, tt, gemColor(t.color)); }
            ctx.restore();
            ctx.font = '900 14px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
            ctx.lineWidth = 4; ctx.strokeStyle = '#1b0f08';
            ctx.strokeText('★ MISSÃO', p.x, p.y + 40); ctx.fillStyle = '#ffe9a8'; ctx.fillText('★ MISSÃO', p.x, p.y + 40);
          },
        });
      });
      toks.filter(t => !this.openMission(t)).forEach((t, i) => {
        const [ox, oy] = TOKEN_SLOTS[(i + 1) % TOKEN_SLOTS.length];
        const gx = c + ox, gy = r + oy;
        list.push({
          d: K(c + r, 1, (ox + oy) / 2),
          draw: () => {
            const p = g2s(gx, gy);
            ctx.save(); ctx.translate(p.x, p.y);
            const up = t.faceUp || g.s.debug.revealTokens;
            if (!drawTokenImage(ctx, t, !up, 66)) {
              ctx.scale(1.35, 1.35);
              if (t.type === 'missao') drawGem(ctx, 0, 0, tt + i, gemColor(t.color));
              else drawChestToken(ctx, 0, 0, tt + c + r, up ? tokenShort(t) : '?');
            }
            ctx.restore();
          },
        });
      });
    }

    // personagens
    for (const u of this.units.values()) {
      if (!u.alive || !u.cell) continue;
      const cx = Math.floor(u.pos.gx), cy = Math.floor(u.pos.gy);
      // investida / giro do Fender: o boneco sai do próprio Espaço — fica na frente das portas e paredes até o alvo
      const busy = (u.lunge && this.t < u.lunge.t0 + u.lunge.dur) || (u.spin && this.t < u.spin.t0 + u.spin.dur);
      const depth = busy ? Math.max(cx + cy, u.lunge?.depth ?? 0) + 1 : cx + cy;
      list.push({ d: busy ? K(depth, 3.5) : K(cx + cy, 2, (u.pos.gx + u.pos.gy - cx - cy) / 2), draw: () => this.drawUnit(u, tt) });
    }

    for (const lb of g.map.labels ?? []) {
      const cx = lb.cells.reduce((a, c) => a + c.c + 0.5, 0) / lb.cells.length, cy = lb.cells.reduce((a, c) => a + c.r + 0.5, 0) / lb.cells.length;
      list.push({ d: 1e7, draw: () => {
        const q = g2s(cx, cy, 60);
        ctx.font = '900 24px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = '#2a1040'; ctx.strokeText(lb.text, q.x, q.y);
        ctx.fillStyle = '#e6c8ff'; ctx.fillText(lb.text, q.x, q.y);
        ctx.font = '800 15px "Baloo 2", sans-serif'; ctx.lineWidth = 4;
        ctx.strokeText('fechado', q.x, q.y + 22); ctx.fillStyle = '#ffd9a8'; ctx.fillText('fechado', q.x, q.y + 22);
      } });
    }
    list.sort((a, b) => a.d - b.d);
    for (const sp of list) sp.draw();
  }

  private drawUnit(u: UnitView, tt: number) {
    const ctx = this.ctx;
    const p = g2s(u.pos.gx, u.pos.gy);
    const L = { scale: unitScale(u.defId) };
    const active = this.hl.activeUnit === u.id;
    const hover = this.hl.hoverUnit === u.id;
    const target = this.hl.attackUnits.has(u.id);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = u.alpha;
    // Herói ativado: aura dourada no chão (anel girando + brilho) para todos verem quem está jogando
    // Monstro controlado por um jogador (Vingança ou Lápide): a mesma aura e a seta, em roxo
    const s0 = this.game?.s;
    const controlled = u.alive && !!s0 && (s0.pending?.monsterId === u.id || s0.puppet?.monsterId === u.id);
    const activated = u.alive && (s0?.activation?.heroId === u.id || controlled);
    const gcol = controlled ? '#aa46eb' : u.guild ? GUILDS[u.guild as keyof typeof GUILDS].color : '#ffd65a';
    const gc = hexRgb(gcol);
    if (activated) {
      ctx.save();
      ctx.scale(1, 0.5);
      const R = 46 * L.scale;
      const glow = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.4);
      glow.addColorStop(0, `rgba(${gc},${0.65 + 0.2 * Math.sin(tt * 4)})`); glow.addColorStop(0.7, `rgba(${gc},0.35)`); glow.addColorStop(1, `rgba(${gc},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 8; ctx.strokeStyle = shade(gcol, 0.25); ctx.shadowColor = gcol; ctx.shadowBlur = 12; ctx.setLineDash([22, 12]); ctx.lineDashOffset = -tt * 40;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // contorno branco por fora: aparece mesmo em cima de um tapete da mesma cor
      ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(0, 0, R + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // Maldição Mortal: névoa roxa no chão e caveirinhas girando em volta
    const cursed = u.alive && u.kind === 'hero' && !!this.game?.s.units[u.id]?.curse;
    if (cursed) {
      ctx.save();
      ctx.scale(1, 0.5);
      const R = 40 * L.scale;
      const mist = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.3);
      mist.addColorStop(0, `rgba(170,70,235,${0.6 + 0.15 * Math.sin(tt * 2.2)})`); mist.addColorStop(0.6, 'rgba(140,50,210,0.35)'); mist.addColorStop(1, 'rgba(120,40,180,0)');
      ctx.fillStyle = mist; ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // anel da Guilda (círculo de time do Dofus)
    const ringColor = u.guild ? GUILDS[u.guild as keyof typeof GUILDS].color : '#7a2b8f';
    ctx.save();
    ctx.scale(1, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, 22 * L.scale, 0, Math.PI * 2);
    ctx.lineWidth = active ? 5 + Math.sin(tt * 6) * 1.5 : 3.5;
    ctx.strokeStyle = ringColor;
    ctx.stroke();
    if (active || hover || target) {
      ctx.fillStyle = target ? 'rgba(255,90,60,0.25)' : 'rgba(255,255,255,0.18)';
      ctx.fill();
    }
    ctx.restore();

    let lx = 0, ly = 0;
    if (u.lunge) {
      const k = (this.t - u.lunge.t0) / u.lunge.dur;
      // vai rápido (35%), fica encostado (20%) e volta
      const f = k < 0 ? 0 : k < 0.35 ? 1 - Math.pow(1 - k / 0.35, 3) : k < 0.55 ? 1 : k < 1 ? 1 - (k - 0.55) / 0.45 : 0;
      lx = u.lunge.dx * f; ly = u.lunge.dy * f;
      if (k > 1) u.lunge = null;
    }
    ctx.translate(lx, ly);
    // arrastando este Herói: no lugar dele fica só um "fantasma"
    if (this.dragUnit?.id === u.id) ctx.globalAlpha = 0.3;
    const hurt = Math.max(0, 1 - (this.t - u.hurtT0) / (350 / this.speed));
    const idleT = tt + (u.num || u.id.length) * 0.37;
    // Fender: o Herói gira (vira para as 4 direções) e um arco de corte dá a volta nele
    let dir = u.dir, flip = u.flip;
    let spinFx: (() => void) | null = null, spinFront = false;
    if (u.spin) {
      const k = (this.t - u.spin.t0) / u.spin.dur;
      if (k > 1) u.spin = null;
      else if (k >= 0) {
        // uma volta só: vira para as 4 direções e a espada dá a volta em torno dele
        const turn: [Dir, boolean][] = [['se', false], ['sw', false], ['nw', false], ['ne', false]];
        [dir, flip] = turn[Math.min(3, Math.floor(k * 4))];
        const ease = 1 - Math.pow(1 - k, 2);
        const a0 = Math.PI * 0.5 + ease * Math.PI * 2; // começa na frente e gira 360°
        const R = 58 * L.scale;
        const fade = k < 0.85 ? 1 : (1 - k) / 0.15;
        spinFx = () => {
        ctx.save();
        ctx.translate(0, -26 * L.scale);
        // rastro do corte (atrás da espada), num círculo achatado no chão
        ctx.save();
        ctx.scale(1, 0.5);
        ctx.lineCap = 'round';
        const trail = Math.min(ease * Math.PI * 2, Math.PI * 1.4);
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, R - i * 3, a0 - trail * (1 - i * 0.12), a0);
          ctx.strokeStyle = `rgba(235,245,255,${fade * (0.75 - i * 0.11)})`;
          ctx.lineWidth = 10 - i * 1.4;
          ctx.stroke();
        }
        ctx.restore();
        // a espada girando: cabo perto do Herói, ponta para fora
        const sx = Math.cos(a0) * R * 0.55, sy = Math.sin(a0) * R * 0.5 * 0.55;
        ctx.translate(sx, sy);
        ctx.rotate(Math.atan2(Math.sin(a0) * 0.5, Math.cos(a0)));
        ctx.globalAlpha = fade;
        drawSword(ctx, 1.5 * L.scale);
        ctx.restore();
        };
        // atrás do Herói na metade de cima do círculo; na frente na metade de baixo
        spinFront = Math.sin(a0) > 0;
        if (!spinFront) { spinFx(); spinFx = null; }
      }
    }
    // Lápide: os Monstros que dá para ativar piscam (claro/normal)
    const blink = this.puppetIds().has(u.id);
    // Sombra do Lorde Presas: em preto e branco
    const isShadow = !!this.game?.s.units[u.id]?.shadow;
    const fx = [isShadow ? 'grayscale(1) contrast(1.15) brightness(0.9)' : '', blink ? `brightness(${1.25 + 0.45 * Math.sin(tt * 7)}) drop-shadow(0 0 8px rgba(184,146,255,0.95))` : ''].filter(Boolean).join(' ');
    if (fx) ctx.filter = fx;
    drawCharacter(ctx, u.defId, { dir, flip, t: idleT, hurt, alpha: 1, stunned: u.stunned, lunge: 0, scale: L.scale * 0.66 });
    if (fx) ctx.filter = 'none';
    if (spinFx && spinFront) spinFx();
    if (u.stunned) this.drawStun(ctx, -78 * L.scale - 6, tt);
    // em volta do corpo, girando: 1 caveirinha roxa (Maldição) e, pequenos, os itens que o Herói carrega na bolsa
    const bag = u.alive && u.kind === 'hero' ? u.bag : [];
    const orbit: (Token | null)[] = [...(cursed ? [null] : []), ...bag.slice(0, 6)];
    if (orbit.length) {
      ctx.save();
      ctx.font = `900 ${Math.round(20 * L.scale)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      orbit.forEach((it, k) => {
        const a = tt * 1.1 + k * (Math.PI * 2 / orbit.length);
        const x = Math.cos(a) * 34 * L.scale, y = -42 * L.scale + Math.sin(a) * 10 * L.scale - Math.sin(tt * 2 + k) * 6;
        ctx.globalAlpha = 0.65 + 0.35 * (Math.sin(a) + 1) / 2;
        if (!it) {
          ctx.shadowColor = '#d58bff'; ctx.shadowBlur = 10;
          ctx.lineWidth = 3; ctx.strokeStyle = '#2a0838'; ctx.strokeText('☠', x, y);
          ctx.fillStyle = '#d9a3ff'; ctx.fillText('☠', x, y);
          ctx.shadowBlur = 0;
          return;
        }
        const img = tokenImage(tokenImageId(it));
        if (!img) return;
        const sz = 18 * L.scale;
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
        ctx.drawImage(img, x - sz / 2, y - sz / 2, sz, sz);
        ctx.shadowBlur = 0;
      });
      ctx.restore();
    }
    // Herói ativado: seta dourada pulando em cima da cabeça
    if (activated) {
      const y = -78 * L.scale - 44 - Math.abs(Math.sin(tt * 4)) * 10;
      ctx.save();
      ctx.translate(0, y);
      ctx.beginPath(); ctx.moveTo(-20, -18); ctx.lineTo(20, -18); ctx.lineTo(0, 8); ctx.closePath();
      ctx.fillStyle = gcol; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
    }
    // alvo de um ataque inimigo: mira vermelha no chão e aviso em cima
    const tg = this.targets.get(u.id);
    if (tg !== undefined) {
      const age = (this.t - tg) / 1000;
      if (age > 4) this.targets.delete(u.id);
      else {
        const fade = Math.min(1, (4 - age) / 0.6);
        const pulse = 0.5 + 0.5 * Math.sin(age * 9);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.scale(1, 0.5);
        ctx.strokeStyle = `rgba(255,${50 + pulse * 60},40,0.95)`; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(0, 0, 70 + pulse * 10, 0, Math.PI * 2); ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + age * 1.5;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 55, Math.sin(a) * 55); ctx.lineTo(Math.cos(a) * 95, Math.sin(a) * 95); ctx.stroke();
        }
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = fade;
        const y = -78 * L.scale - 34 - pulse * 6;
        ctx.font = '900 22px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = '#2a0505'; ctx.strokeText('⚠ ALVO!', 0, y);
        ctx.fillStyle = '#ff5a3c'; ctx.fillText('⚠ ALVO!', 0, y);
        ctx.restore();
      }
    }

    // barra de vida + número
    const top = -78 * L.scale - 16;
    // barra maior, dividida em gomos (1 por ponto de Vida, como no Dota)
    const bw = Math.min(110, Math.max(54, u.maxHp * 12));
    const bh = 9;
    const frac = Math.max(0, (u.maxHp - u.wounds) / u.maxHp);
    ctx.fillStyle = 'rgba(20,10,5,0.8)';
    roundRect(ctx, -bw / 2 - 2, top - 3, bw + 4, bh + 4, 4); ctx.fill();
    ctx.fillStyle = 'rgba(70,20,15,0.9)';
    roundRect(ctx, -bw / 2, top - 1, bw, bh, 3); ctx.fill();
    if (frac > 0) {
      const g = ctx.createLinearGradient(0, top - 1, 0, top - 1 + bh);
      const col = frac > 0.5 ? ['#8df06e', '#3fa22e'] : frac > 0.25 ? ['#ffe06a', '#d39a14'] : ['#ff7a5c', '#c0261a'];
      g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
      ctx.fillStyle = g;
      roundRect(ctx, -bw / 2, top - 1, bw * frac, bh, 3); ctx.fill();
    }
    if (u.maxHp > 1 && u.maxHp <= 20) {
      ctx.fillStyle = 'rgba(15,8,4,0.9)';
      for (let i = 1; i < u.maxHp; i++) ctx.fillRect(-bw / 2 + (bw * i) / u.maxHp - 1, top - 1, 2, bh);
    }
    ctx.font = 'bold 12px "Baloo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#1b0f08';
    const label = u.kind === 'hero' ? `${u.maxHp - u.wounds}/${u.maxHp}` : `${MONSTERS[u.defId].abbr} ${u.maxHp - u.wounds}/${u.maxHp}`;
    ctx.strokeText(label, 0, top - 7);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 0, top - 7);
    if (u.kind === 'hero') {
      ctx.fillStyle = ringColor;
      ctx.beginPath(); ctx.arc(-bw / 2 - 9, top + 2, 8, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1b0f08'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(String(u.num), -bw / 2 - 9, top + 6);
    }
    // marcador de Missão carregado (escolta, Tomos…): grande, em cima da cabeça, com brilho
    // o que já apareceu na tela (a bolsa animada), não o estado do jogo: sem spoiler antes do marcador virar
    const carried = u.kind === 'hero' ? u.bag.filter(t => t.type === 'missao') : [];
    carried.forEach((t, i) => {
      const img = tokenImage(tokenImageId(t));
      const S = 84;
      const x = (i - (carried.length - 1) / 2) * (S + 6), y = top - 64 + Math.sin(tt * 3 + i) * 4;
      const glow = ctx.createRadialGradient(x, y, 4, x, y, S * 0.85);
      glow.addColorStop(0, `rgba(${hexRgb(gemColor(t.color))},0.75)`); glow.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, S * 0.85, 0, Math.PI * 2); ctx.fill();
      if (img) ctx.drawImage(img, x - S / 2, y - S / 2, S, S);
      else { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(x, y, S / 3, 0, Math.PI * 2); ctx.fill(); }
    });
    if (carried.length) {
      ctx.font = '900 20px "Baloo 2", sans-serif'; ctx.lineWidth = 5; ctx.strokeStyle = '#1b0f08'; ctx.textAlign = 'center';
      ctx.strokeText('★ MISSÃO', 0, top - 112); ctx.fillStyle = '#ffe9a8'; ctx.fillText('★ MISSÃO', 0, top - 112);
    }
    if (active && !(u.alive && this.game?.s.activation?.heroId === u.id)) {
      const ay = top - 22 + Math.sin(tt * 5) * 3;
      ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#5a3c00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, ay - 8); ctx.lineTo(8, ay - 8); ctx.lineTo(0, ay + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  /** Atordoado: halo de estrelas grande em cima da cabeça e a placa "ATORDOADO · sem Defesa" (todos veem de longe). */
  private drawStun(ctx: CanvasRenderingContext2D, top: number, tt: number) {
    const cy = top - 26;
    // halo (anel tonto) com brilho
    ctx.save();
    ctx.shadowColor = 'rgba(255,225,77,0.9)'; ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(255,225,77,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, cy, 34, 11, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // estrelas girando (as de trás menores e mais apagadas)
    for (let i = 0; i < 5; i++) {
      const ang = tt * 3.2 + (i * Math.PI * 2) / 5;
      const front = Math.sin(ang) > 0;
      ctx.globalAlpha = front ? 1 : 0.55;
      star(ctx, Math.cos(ang) * 34, cy + Math.sin(ang) * 11, front ? 11 : 8, '#ffe14d');
    }
    ctx.globalAlpha = 1;
    // placa
    const label = 'ATORDOADO · sem Defesa';
    ctx.font = '900 14px "Baloo 2", sans-serif';
    const w = ctx.measureText(label).width + 18, y = cy - 30;
    ctx.fillStyle = 'rgba(70,40,0,0.88)'; ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-w / 2, y - 12, w, 22, 11); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffe14d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, y); ctx.textBaseline = 'alphabetic';
  }

  /** O Herói arrastado desenhado no ponteiro (por cima de tudo, levemente inclinado, como uma carta sendo segurada). */
  private drawDragged() {
    const d = this.dragUnit;
    const u = d ? this.units.get(d.id) : null;
    if (!d || !u) return;
    const ctx = this.ctx;
    const w = this.screenToWorld(d.x, d.y);
    const sc = unitScale(u.defId) * 0.66 * 1.12;
    ctx.save();
    // sombra no chão debaixo do ponteiro
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(w.x, w.y + 34, 26, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(w.x, w.y + 30);
    ctx.rotate(-0.06);
    drawCharacter(ctx, u.defId, { dir: u.dir, flip: u.flip, t: this.t / 1000, hurt: 0, alpha: 1, stunned: false, lunge: 0, scale: sc });
    ctx.restore();
  }

  /** Arena (ficar no marcador de Missão): o contador de cada Guilda flutua em cima do Espaço, por cima de tudo, para todos verem. */
  private drawMissionBadges() {
    const arena = this.game.s.arena;
    if (!arena) return;
    const ctx = this.ctx;
    const total = this.game.map.missionMarkers.length;
    for (const [k, toks] of Object.entries(this.floor)) {
      if (!toks.some(t => this.openMission(t))) continue;
      const [c, r] = k.split(',').map(Number);
      const marks = this.game.s.guildOrder.map(gid => ({ gid, n: (arena[gid] ?? []).filter(x => x === k).length })).filter(m => m.n);
      if (!marks.length) continue;
      const base = g2s(c + 0.5, r + 0.5);
      const R = 34, gap = 10, w = marks.length * (R * 2 + gap) - gap;
      const y = base.y - 285;
      // haste até o chão do Espaço
      ctx.strokeStyle = 'rgba(255,240,180,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(base.x, y + R); ctx.lineTo(base.x, base.y - 10); ctx.stroke(); ctx.setLineDash([]);
      // placa de fundo
      ctx.fillStyle = 'rgba(20,12,6,0.85)'; ctx.strokeStyle = '#f0c243'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(base.x - w / 2 - 14, y - R - 32, w + 28, R * 2 + 56, 16); ctx.fill(); ctx.stroke();
      ctx.font = '900 18px "Baloo 2", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a8';
      ctx.fillText('🏆 ARENA', base.x, y - R - 10);
      marks.forEach((m, i) => {
        const x = base.x - w / 2 + R + i * (R * 2 + gap);
        const list = arena[m.gid] ?? [];
        ctx.fillStyle = GUILDS[m.gid as keyof typeof GUILDS].color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y + 4, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '900 32px "Baloo 2", sans-serif'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)';
        ctx.strokeText(`×${m.n}`, x, y + 5); ctx.fillText(`×${m.n}`, x, y + 5);
        ctx.textBaseline = 'alphabetic';
        // total da Guilda (5 marcações ou 1 em cada marcador)
        ctx.font = '800 14px "Baloo 2", sans-serif'; ctx.fillStyle = '#ffe9a8';
        ctx.fillText(`${list.length}/5 · ${new Set(list).size}/${total}`, x, y + R + 20);
      });
    }
  }

  private drawFx() {
    const ctx = this.ctx;
    // projéteis
    this.projectiles = this.projectiles.filter(p => this.t - p.t0 < p.dur);
    for (const p of this.projectiles) {
      const k = (this.t - p.t0) / p.dur;
      if (k < 0) continue;
      const at = (q: number) => ({ x: p.from.x + (p.to.x - p.from.x) * q, y: p.from.y + (p.to.y - p.from.y) * q - Math.sin(q * Math.PI) * p.arc });
      const { x, y } = at(k);
      // rastro
      const col = p.kind === 'orb' ? '150,220,255' : p.kind === 'blade' ? '230,235,255' : p.kind === 'arrow' ? '255,236,170' : '220,220,220';
      const N = 14;
      for (let i = 0; i < N; i++) {
        const q0 = Math.max(0, k - 0.3 + (0.3 * i) / N), q1 = Math.max(0, k - 0.3 + (0.3 * (i + 1)) / N);
        const a0 = at(q0), a1 = at(q1);
        ctx.strokeStyle = `rgba(${col},${(i / N) * 0.75})`;
        ctx.lineWidth = 1 + (i / N) * (p.kind === 'orb' ? 9 : 5);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke();
      }
      const nxt = at(Math.min(1, k + 0.02));
      ctx.save();
      ctx.translate(x, y);
      if (p.kind === 'orb') {
        const grd = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
        grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.4, '#9fe8ff'); grd.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === 'arrow' || p.kind === 'blade') {
        ctx.rotate(Math.atan2(nxt.y - y, nxt.x - x));
        if (p.kind === 'blade') {
          // espada arremessada girando (Jøhan): do tamanho de uma espada de verdade
          ctx.rotate(this.t / 45);
          ctx.translate(-12, 0);
          drawSword(ctx, 2.1);
          ctx.restore(); continue;
        }
        ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(8, -4); ctx.lineTo(8, 4); ctx.fill();
      } else {
        ctx.fillStyle = '#8d8d8d'; ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    // textos flutuantes
    this.floaters = this.floaters.filter(f => this.t - f.t0 < f.dur);
    for (const f of this.floaters) {
      const k = (this.t - f.t0) / f.dur;
      ctx.save();
      ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      ctx.font = `900 ${f.size}px "Baloo 2", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1b0f08';
      const y = f.y - k * 34;
      ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, y);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------
  // Cenário estático (cache)
  // ---------------------------------------------------------------------
  private buildDecor() {
    // sem árvores, arbustos e cogumelos em volta do mapa
    this.decor = [];
  }

  private buildGround() {
    const g = this.game;
    const scale = 0.68;
    const minG = -2, maxG = 11;
    const left = g2s(minG, maxG).x - 40, right = g2s(maxG, minG).x + 40;
    const top = g2s(minG, minG).y - 40, bottom = g2s(maxG, maxG).y + CLIFF + 60;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((right - left) * scale);
    cv.height = Math.ceil((bottom - top) * scale);
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
    this.groundOrigin = { x: left, y: top, scale };

    // gramado inferior (checker verde do Dofus)
    for (let gy = minG; gy < maxG; gy++) for (let gx = minG; gx < maxG; gx++) {
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const x = gx + sx / 2, y = gy + sy / 2;
        const checker = (Math.floor(x * 2) + Math.floor(y * 2)) % 2 === 0;
        const n = hash(Math.floor(x * 2), Math.floor(y * 2), 3);
        const base = checker ? '#86b73a' : '#7aab33';
        const p0 = g2s(x, y, -CLIFF);
        ctx.fillStyle = shade(base, (n - 0.5) * 0.12);
        diamondPath(ctx, x, y, 0.5, 0.5, -CLIFF);
        ctx.fill();
        if (n > 0.86) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.beginPath(); ctx.arc(p0.x, p0.y + TH / 4, 2, 0, 7); ctx.fill();
        }
      }
    }

    const cells = g.board.allCells();
    // bordas do platô (terra)
    for (const c of cells) {
      const below = { c: c.c, r: c.r + 1 }, right = { c: c.c + 1, r: c.r };
      if (!g.board.exist(below)) cliffFace(ctx, c.c, c.r + 1, c.c + 1, c.r + 1, c.c * 7 + c.r);
      if (!g.board.exist(right)) cliffFace(ctx, c.c + 1, c.r, c.c + 1, c.r + 1, c.c * 3 + c.r * 5);
    }

    // piso com a arte do tabuleiro do livro (Beyond the Grave): a imagem cobre a grade inteira
    const art = g.map.floorArt ? floorImage(g.map.id, () => { if (this.game === g) this.buildGround(); }) : null;
    if (art) {
      ctx.save();
      ctx.beginPath();
      for (const c of cells) { const q = [g2s(c.c, c.r), g2s(c.c + 1, c.r), g2s(c.c + 1, c.r + 1), g2s(c.c, c.r + 1)]; ctx.moveTo(q[0].x, q[0].y); for (const x of q.slice(1)) ctx.lineTo(x.x, x.y); ctx.closePath(); }
      ctx.clip();
      const px = art.width / g.map.cols; // pixels da imagem por Espaço
      ctx.transform(TW / 2 / px, TH / 2 / px, -TW / 2 / px, TH / 2 / px, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(art, 0, 0);
      ctx.restore();
    }

    // piso dos Espaços: calçamento de pedras (ruas), assoalho (salas) e tapete (Áreas Iniciais)
    const startGuild = new Map<number, string>();
    for (const gs of g.guilds()) startGuild.set(gs.startArea, gs.color);
    const STONES = ['#efe3c8', '#e9d6b6', '#f2dccb', '#ecdcaf', '#e0d3be', '#f4ead6', '#ebd2c4', '#e6dcc4', '#f0e2bc'];
    for (const c of cells) {
      const area = g.board.startArea(c);
      const room = g.board.isRoom(c);
      ctx.save();
      if (art) ctx.globalAlpha = 0; // o piso já veio da arte: só o tapete, o contorno e o ponto central
      diamondPath(ctx, c.c, c.r, 1, 1);
      ctx.clip();
      if (g.board.isPillar(c)) {
        // Espaço bloqueado: chão liso (sem pedras), a plataforma cinza vai por cima
        diamondPath(ctx, c.c, c.r, 1, 1);
        ctx.fillStyle = '#9d968a';
        ctx.fill();
      } else if (room || area !== undefined) {
        // assoalho de tábuas
        const base = area !== undefined ? '#d08a40' : '#c08a52';
        diamondPath(ctx, c.c, c.r, 1, 1);
        ctx.fillStyle = shade(base, -0.25);
        ctx.fill();
        const N = 7;
        for (let k = 0; k < N; k++) {
          const y0 = c.r + k / N, y1 = c.r + (k + 1) / N;
          const cut = 0.25 + hash(c.c, c.r, k) * 0.5;
          for (const [x0, x1] of [[c.c, c.c + cut], [c.c + cut, c.c + 1]]) {
            const col = shade(base, (hash(Math.round(x0 * 10), k, c.r) - 0.5) * 0.18);
            const pts = [g2s(x0 + 0.004, y0 + 0.006), g2s(x1 - 0.004, y0 + 0.006), g2s(x1 - 0.004, y1 - 0.006), g2s(x0 + 0.004, y1 - 0.006)];
            const gr = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[3].x, pts[3].y);
            gr.addColorStop(0, shade(col, 0.12)); gr.addColorStop(1, shade(col, -0.08));
            ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const q of pts.slice(1)) ctx.lineTo(q.x, q.y); ctx.closePath();
            ctx.fillStyle = gr; ctx.fill();
            // veios da madeira
            ctx.strokeStyle = 'rgba(90,50,20,0.22)'; ctx.lineWidth = 1.2;
            for (let v = 0; v < 2; v++) {
              const yy = y0 + (y1 - y0) * (0.3 + v * 0.4);
              const a = g2s(x0 + 0.03, yy), b = g2s(x1 - 0.03, yy + 0.01);
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 2, b.x, b.y); ctx.stroke();
            }
            // pregos
            ctx.fillStyle = 'rgba(60,40,25,0.6)';
            for (const xx of [x0 + 0.03, x1 - 0.03]) { const q = g2s(xx, (y0 + y1) / 2); ctx.beginPath(); ctx.arc(q.x, q.y, 1.8, 0, 7); ctx.fill(); }
          }
        }
      } else {
        // argamassa + pedras irregulares
        diamondPath(ctx, c.c, c.r, 1, 1);
        ctx.fillStyle = '#b4a283';
        ctx.fill();
        const N = 5;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const seed = c.c * 97 + c.r * 31 + j * 7 + i;
          const cx = c.c + (i + 0.5 + (hash(seed, 1) - 0.5) * 0.35) / N;
          const cy = c.r + (j + 0.5 + (hash(seed, 2) - 0.5) * 0.35) / N;
          const rr = 0.5 / N * (0.82 + hash(seed, 3) * 0.2);
          const pts = [];
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2 + hash(seed, 4) * 0.5;
            const rad = rr * (0.8 + hash(seed, k + 5) * 0.3);
            pts.push(g2s(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad));
          }
          const col = STONES[Math.floor(hash(seed, 9) * STONES.length)];
          ctx.beginPath();
          const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          let m0 = mid(pts[7], pts[0]);
          ctx.moveTo(m0.x, m0.y);
          for (let k = 0; k < 8; k++) { const m = mid(pts[k], pts[(k + 1) % 8]); ctx.quadraticCurveTo(pts[k].x, pts[k].y, m.x, m.y); }
          ctx.closePath();
          const ctr = g2s(cx, cy);
          const gr = ctx.createLinearGradient(ctr.x, ctr.y - 16, ctr.x, ctr.y + 16);
          gr.addColorStop(0, shade(col, 0.18)); gr.addColorStop(1, shade(col, -0.12));
          ctx.fillStyle = gr; ctx.fill();
          ctx.strokeStyle = 'rgba(95,72,45,0.55)'; ctx.lineWidth = 1.4; ctx.stroke();
          m0 = mid(pts[4], pts[5]);
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(pts[5].x, pts[5].y); ctx.quadraticCurveTo(pts[6].x, pts[6].y, pts[7].x, pts[7].y); ctx.stroke();
        }
        // tufos de grama/musgo
        for (let k = 0; k < 3; k++) {
          if (hash(c.c, c.r, 40 + k) < 0.55) continue;
          const q = g2s(c.c + 0.1 + hash(c.c, k, 3) * 0.8, c.r + 0.1 + hash(c.r, k, 5) * 0.8);
          ctx.strokeStyle = '#5f9e2e'; ctx.lineWidth = 2; ctx.lineCap = 'round';
          for (let t = -2; t <= 2; t++) { ctx.beginPath(); ctx.moveTo(q.x + t * 2.5, q.y); ctx.lineTo(q.x + t * 4, q.y - 8 - (2 - Math.abs(t)) * 3); ctx.stroke(); }
        }
      }
      ctx.restore();
      // tapete da Guilda na Área Inicial
      if (area !== undefined && startGuild.has(area)) {
        const col = startGuild.get(area)!;
        diamondPath(ctx, c.c + 0.1, c.r + 0.1, 0.8, 0.8);
        ctx.fillStyle = col + 'aa'; ctx.fill();
        ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 4; ctx.stroke();
        diamondPath(ctx, c.c + 0.16, c.r + 0.16, 0.68, 0.68);
        ctx.strokeStyle = '#f2d06a'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 6]); ctx.stroke(); ctx.setLineDash([]);
      }
      // contorno do Espaço + ponto central (regra do tabuleiro)
      diamondPath(ctx, c.c, c.r, 1, 1);
      ctx.strokeStyle = 'rgba(70,45,20,0.55)';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      if (!g.board.isPillar(c)) {
        const m = g2s(c.c + 0.5, c.r + 0.5);
        ctx.fillStyle = 'rgba(70,45,20,0.35)';
        ctx.beginPath(); ctx.ellipse(m.x, m.y, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
    }

    // sombra de contato no chão junto às paredes, portas e blocos
    const ao = (cell: Cell, other: Cell) => {
      if (!g.board.playable(cell)) return;
      const vertical = cell.r === other.r;
      const X = Math.max(cell.c, other.c), Y = Math.max(cell.r, other.r);
      const dir = vertical ? Math.sign(cell.c - other.c) : Math.sign(cell.r - other.r);
      const d = 0.14 * dir;
      const e0 = vertical ? g2s(X, cell.r) : g2s(cell.c, Y), e1 = vertical ? g2s(X, cell.r + 1) : g2s(cell.c + 1, Y);
      const o0 = vertical ? g2s(X + d, cell.r) : g2s(cell.c, Y + d), o1 = vertical ? g2s(X + d, cell.r + 1) : g2s(cell.c + 1, Y + d);
      const gr = ctx.createLinearGradient((e0.x + e1.x) / 2, (e0.y + e1.y) / 2, (o0.x + o1.x) / 2, (o0.y + o1.y) / 2);
      gr.addColorStop(0, 'rgba(40,25,10,0.38)'); gr.addColorStop(1, 'rgba(40,25,10,0)');
      ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(o1.x, o1.y); ctx.lineTo(o0.x, o0.y); ctx.closePath();
      ctx.fillStyle = gr; ctx.fill();
    };
    for (const [a, b] of g.map.walls) { ao(a, b); ao(b, a); }
    for (const d of g.map.doors) { ao(d.a, d.b); ao(d.b, d.a); }
    for (const pc of g.map.pillars) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ao({ c: pc.c + dc, r: pc.r + dr }, pc);

    // rótulos das Áreas Iniciais (escritos no chão)
    g.map.startAreas.forEach((cells2, i) => {
      const xs = cells2.map(c => c.c), ys = cells2.map(c => c.r);
      const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
      const horizontal = Math.max(...xs) > Math.min(...xs);
      ctx.save();
      const o = g2s(cx, cy);
      // eixos da grade em espaço de tela
      ctx.transform(TW / 2 / 100, TH / 2 / 100, -TW / 2 / 100, TH / 2 / 100, o.x, o.y);
      if (!horizontal) ctx.rotate(-Math.PI / 2);
      ctx.font = '900 30px "Baloo 2", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,240,220,0.55)';
      ctx.fillText(`ÁREA INICIAL J${i + 1}`, 0, 10);
      ctx.restore();
    });

    // Marcadores de Entrada de Monstro (bueiros)
    for (const em of g.s.entryMarkers) {
      const [mx, my] = this.spots(em.cell).manhole;
      const p = g2s(em.cell.c + mx, em.cell.r + my);
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1.6, 1.6);
      drawManhole(ctx, 0, 0);
      ctx.restore();
    }
    this.ground = cv;
  }
}

// -----------------------------------------------------------------------------
/** Arte de uma carta (public/cards) — para desenhar no mapa (ex.: a Bomba no chão). */
const cardIcons = new Map<string, HTMLImageElement>();
function cardIcon(cardId: string): HTMLImageElement | null {
  const a = CARD_ART[cardId];
  if (!a) return null;
  let img = cardIcons.get(a.img);
  if (!img) { img = new Image(); img.src = `${import.meta.env.BASE_URL}cards/${a.img}.webp`; cardIcons.set(a.img, img); }
  return img.complete && img.naturalWidth ? img : null;
}

/** Imagens de piso dos mapas (carregam na primeira vez; `ready` redesenha o chão quando chegar). */
const floors = new Map<string, HTMLImageElement>();
function floorImage(id: string, ready: () => void): HTMLImageElement | null {
  let img = floors.get(id);
  if (!img) {
    img = new Image();
    img.onload = ready;
    img.src = `${import.meta.env.BASE_URL}floors/${id}.webp`;
    floors.set(id, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Tamanho do boneco: Monstros Enormes (ocupam o Espaço inteiro, como 2 personagens) são bem maiores. */
function unitScale(defId: string): number {
  return charScale(defId) * (MONSTERS[defId]?.abilities?.includes('huge') ? 1.6 : 1);
}

/** Direção isométrica de um passo na grade: +c ↘, +r ↙, -c ↖, -r ↗. */
function dirFromStep(dc: number, dr: number): Dir {
  if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? 'se' : 'nw';
  return dr >= 0 ? 'sw' : 'ne';
}
/** Direção a partir de um vetor na tela. */
function dirFromScreen(dx: number, dy: number): Dir {
  if (dy >= 0) return dx >= 0 ? 'se' : 'sw';
  return dx >= 0 ? 'ne' : 'nw';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (w <= 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface EdgeBox { x0: number; y0: number; x1: number; y1: number; mx: number; my: number; vertical: boolean }

/** Caixa sobre a borda entre dois Espaços ortogonais. vertical = borda paralela ao eixo y da grade. */
function edgeBox(a: Cell, b: Cell, half: number): EdgeBox {
  if (a.r === b.r) {
    const x = Math.max(a.c, b.c);
    return { x0: x - half, x1: x + half, y0: a.r, y1: a.r + 1, mx: x, my: a.r + 0.5, vertical: true };
  }
  const y = Math.max(a.r, b.r);
  return { x0: a.c, x1: a.c + 1, y0: y - half, y1: y + half, mx: a.c + 0.5, my: y, vertical: false };
}

function drawWall(ctx: CanvasRenderingContext2D, b: EdgeBox) {
  isoBox(ctx, b.x0, b.y0, b.x1, b.y1, 0, WALL_H, '#e0d6bd', '#b8aa8a', '#9d9073', 'rgba(50,35,20,0.6)');
  // blocos de pedra na face comprida visível
  const A = b.vertical ? [b.x1, b.y0] : [b.x0, b.y1];
  const B = b.vertical ? [b.x1, b.y1] : [b.x1, b.y1];
  const P = (u: number, z: number) => g2s(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, z);
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const z0 = (WALL_H * r) / rows, z1 = (WALL_H * (r + 1)) / rows;
    const off = r % 2 ? 0.1 : 0;
    const joints = [0, 0.2 + off, 0.4 + off, 0.6 + off, 0.8 + off, 1].map(v => Math.min(1, v));
    for (let k = 0; k < joints.length - 1; k++) {
      const u0 = joints[k], u1 = joints[k + 1];
      if (u1 - u0 < 0.02) continue;
      const q = [P(u0, z0 + 0.6), P(u1, z0 + 0.6), P(u1, z1 - 0.6), P(u0, z1 - 0.6)];
      ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (const t of q.slice(1)) ctx.lineTo(t.x, t.y); ctx.closePath();
      const n = hash(Math.round(A[0] * 13 + u0 * 50), Math.round(A[1] * 17 + r), 3);
      ctx.fillStyle = n > 0.5 ? `rgba(255,255,255,${(n - 0.5) * 0.22})` : `rgba(0,0,0,${(0.5 - n) * 0.16})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,55,38,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  // acabamento no topo: pedra da mesma cor da parede
  const ex = 0.015;
  isoBox(ctx, b.x0 - ex, b.y0 - (b.vertical ? 0 : ex), b.x1 + ex, b.y1 + (b.vertical ? 0 : ex), WALL_H, 6, '#ece4ce', '#c2b597', '#a69a7c', 'rgba(50,35,20,0.6)');
}

function drawDoor(ctx: CanvasRenderingContext2D, b: EdgeBox, open: boolean, small: boolean, locked = false) {
  const wood: [string, string, string] = locked ? ['#8a5ac8', '#6a3fa0', '#4f2c7a'] : ['#a8703b', '#87562a', '#6d421e'];
  const post = 0.045;
  const ends = b.vertical
    ? [[b.mx, b.y0 + post], [b.mx, b.y1 - post]]
    : [[b.x0 + post, b.my], [b.x1 - post, b.my]];
  const h = small ? 44 : 54;
  const drawPost = (px: number, py: number) => isoBox(ctx, px - post, py - post, px + post, py + post, 0, h + 6, '#cfc4a8', '#9e9277', '#857a62', 'rgba(50,35,20,0.6)');
  drawPost(ends[0][0], ends[0][1]);
  if (!open) {
    const t = 0.028;
    if (b.vertical) isoBox(ctx, b.mx - t, b.y0 + post * 2, b.mx + t, b.y1 - post * 2, 0, h, ...wood, 'rgba(40,20,5,0.7)');
    else isoBox(ctx, b.x0 + post * 2, b.my - t, b.x1 - post * 2, b.my + t, 0, h, ...wood, 'rgba(40,20,5,0.7)');
    ctx.strokeStyle = '#3d3d3d';
    ctx.lineWidth = 3;
    for (const z of [12, h - 12]) {
      const p = b.vertical ? g2s(b.mx + t, b.y0 + post * 2, z) : g2s(b.x0 + post * 2, b.my + t, z);
      const q = b.vertical ? g2s(b.mx + t, b.y1 - post * 2, z) : g2s(b.x1 - post * 2, b.my + t, z);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    // tábuas verticais
    ctx.strokeStyle = 'rgba(60,30,10,0.45)'; ctx.lineWidth = 1.5;
    for (let k = 1; k < 5; k++) {
      const f = k / 5;
      const p = b.vertical ? g2s(b.mx + t, b.y0 + post * 2 + (b.y1 - b.y0 - post * 4) * f, 0) : g2s(b.x0 + post * 2 + (b.x1 - b.x0 - post * 4) * f, b.my + t, 0);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h); ctx.stroke();
    }
    const kp = b.vertical ? g2s(b.mx + t, b.my, h / 2) : g2s(b.mx, b.my + t, h / 2);
    ctx.fillStyle = '#e0b43a'; ctx.beginPath(); ctx.arc(kp.x, kp.y, 4, 0, 7); ctx.fill();
  } else {
    // porta aberta: soleira de madeira no chão, passagem livre
    const t = 0.06;
    if (b.vertical) isoBox(ctx, b.mx - t, b.y0 + post * 2, b.mx + t, b.y1 - post * 2, 0, 3, '#c79a5e', '#8a6237', '#6e4a26');
    else isoBox(ctx, b.x0 + post * 2, b.my - t, b.x1 - post * 2, b.my + t, 0, 3, '#c79a5e', '#8a6237', '#6e4a26');
  }
  drawPost(ends[1][0], ends[1][1]);
}

function drawDoorIcon(ctx: CanvasRenderingContext2D, p: Pt, open: boolean, t: number) {
  const s = 1 + Math.sin(t * 5) * 0.06;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);
  ctx.scale(1.3, 1.3);
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = open ? '#3f8f3a' : '#c47a1c'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#2a1a0a'; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '900 13px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  const lbl = open ? 'fechar (1 PM)' : 'abrir (1 PM)';
  ctx.lineWidth = 3; ctx.strokeStyle = '#2a1a0a'; ctx.strokeText(lbl, 0, -19);
  ctx.fillText(lbl, 0, -19);
  // ícone de chave
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(-4, 0, 4, 0, Math.PI * 2); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.moveTo(6, 0); ctx.lineTo(6, 4); ctx.stroke();
  ctx.restore();
}

function cliffFace(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number) {
  const a = g2s(x0, y0), b = g2s(x1, y1);
  const grd = ctx.createLinearGradient(0, a.y, 0, a.y + CLIFF);
  const vertical = x0 === x1;
  grd.addColorStop(0, vertical ? '#8a5a2e' : '#9b6735');
  grd.addColorStop(1, vertical ? '#5a3a1c' : '#6b4524');
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y + CLIFF); ctx.lineTo(a.x, a.y + CLIFF); ctx.closePath();
  ctx.fillStyle = grd; ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,5,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
  // pedras e raízes
  for (let k = 0; k < 4; k++) {
    const t = 0.12 + hash(seed, k, 1) * 0.76;
    const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t + 12 + hash(seed, k, 2) * (CLIFF - 22);
    ctx.fillStyle = 'rgba(60,35,15,0.45)';
    ctx.beginPath(); ctx.ellipse(px, py, 6 + hash(k, seed, 3) * 6, 3 + hash(k, seed, 5) * 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  // borda de grama
  ctx.strokeStyle = '#6aa832'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y + 2); ctx.lineTo(b.x, b.y + 2); ctx.stroke();
  ctx.strokeStyle = '#4f8a26'; ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const t = (k + 0.5) / 6;
    const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t + 3;
    ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.quadraticCurveTo(px, py + 8 + hash(seed, k, 9) * 6, px + 3, py); ctx.stroke();
  }
}

export function faceShort(f: string) {
  return ({ crit: '★', melee: '⚔', ranged: '🏹', shield: '🛡', blank: '·' } as Record<string, string>)[f] ?? f;
}

export function tokenLabel(t: Token): string {
  switch (t.type) {
    case 'cura': return 'Poção de Cura!';
    case 'revigorante': return 'Poção Revigorante!';
    case 'turno': return 'Turno Adicional!';
    case 'bau': return `Baú (${t.value ?? 1} moeda${(t.value ?? 1) > 1 ? 's' : ''})!`;
    case 'armadilha': return 'Armadilha!';
    case 'missao': return 'Armas Perdidas!';
  }
}

function tokenShort(t: Token): string {
  switch (t.type) {
    case 'cura': return '♥';
    case 'revigorante': return '↻';
    case 'turno': return '+T';
    case 'bau': return `$${t.value ?? 1}`;
    case 'armadilha': return '!';
    default: return '?';
  }
}

export { star };
