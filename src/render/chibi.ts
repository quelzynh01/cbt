// Arte dos personagens no estilo chibi/anime das cartas de Arcadia Quest.
// Desenho vetorial detalhado (degradês, contorno, olhos de anime) renderizado UMA vez em cache (sprite),
// depois só é carimbado no mapa. Para trocar por arte própria, coloque PNGs em public/sprites/<id>.png
// (pés no centro da base da imagem) — eles substituem o desenho automaticamente.

import { PORTRAITS } from './portraitList';

type C = CanvasRenderingContext2D;
type P = [number, number];

const OUT = '#2b1a12';

// ---------------------------------------------------------------------------
// utilidades de cor e forma
// ---------------------------------------------------------------------------
function mix(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r); g = f(g); b = f(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function lg(ctx: C, x0: number, y0: number, x1: number, y1: number, c: string, light = 0.28, dark = -0.25) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, mix(c, light));
  g.addColorStop(0.55, c);
  g.addColorStop(1, mix(c, dark));
  return g;
}

function fs(ctx: C, fill: string | CanvasGradient, lw = 2.6) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUT;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function poly(ctx: C, pts: P[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Curva suave fechada passando perto dos pontos (bom para cabelo, capas, barbas). */
function smooth(ctx: C, pts: P[]) {
  const n = pts.length;
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ctx.beginPath();
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], m = mid(p, pts[(i + 1) % n]);
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  ctx.closePath();
}

function ell(ctx: C, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function capsule(ctx: C, x0: number, y0: number, x1: number, y1: number, r: number, fill: string | CanvasGradient, lw = 2.4) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.arc(x0, y0, r, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
  fs(ctx, fill, lw);
}

function strand(ctx: C, pts: P[], color: string, w = 1.6) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const m: P = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  const l = pts[pts.length - 1];
  ctx.lineTo(l[0], l[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// partes do corpo
// ---------------------------------------------------------------------------
interface Art {
  skin: string;
  eye: string;
  expr: 'shout' | 'angry' | 'calm' | 'masked' | 'grim' | 'grin';
  head?: { rx: number; ry: number; y: number };
  body?: number; // largura relativa
  ears?: 'human' | 'elf' | 'goblin';
  pants: string;
  boots: string;
  sleeve?: string; // cor do braço (undefined = pele)
  back?: (ctx: C, a: Art) => void;
  hairBack?: (ctx: C, a: Art) => void;
  torso: (ctx: C, a: Art) => void;
  hairFront: (ctx: C, a: Art) => void;
  faceExtra?: (ctx: C, a: Art) => void;
  hand?: (ctx: C, a: Art) => void; // arma/objeto na mão da frente
  backHand?: (ctx: C, a: Art) => void;
  short?: boolean; // anão / goblin
}

const H = (a: Art) => a.head ?? { rx: 28, ry: 26, y: -76 };

function legs(ctx: C, a: Art) {
  const w = a.body ?? 1;
  const top = a.short ? -22 : -28;
  for (const sx of [-7 * w, 7 * w]) {
    ctx.beginPath();
    ctx.roundRect(sx - 6 * w, top, 12 * w, -top - 6, 5);
    fs(ctx, lg(ctx, sx - 6, 0, sx + 6, 0, a.pants), 2.4);
    // bota
    ctx.beginPath();
    ctx.roundRect(sx - 7.5 * w + (sx > 0 ? 1.5 : -1.5), -12, 15 * w, 12, [5, 5, 4, 4]);
    fs(ctx, lg(ctx, 0, -12, 0, 0, a.boots, 0.3, -0.3), 2.4);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ell(ctx, sx - 2, -8, 3, 1.6); ctx.fill();
  }
}

function torsoBase(ctx: C, a: Art, color: string, h = 30) {
  const w = a.body ?? 1;
  const top = a.short ? -48 : -54;
  ctx.beginPath();
  ctx.moveTo(-17 * w, top + 2);
  ctx.quadraticCurveTo(0, top - 5, 17 * w, top + 2);
  ctx.quadraticCurveTo(19 * w, top + h * 0.6, 14 * w, top + h);
  ctx.lineTo(-14 * w, top + h);
  ctx.quadraticCurveTo(-19 * w, top + h * 0.6, -17 * w, top + 2);
  ctx.closePath();
  fs(ctx, lg(ctx, -16 * w, top, 16 * w, top + h, color), 2.6);
}

function arm(ctx: C, a: Art, side: 1 | -1) {
  const w = a.body ?? 1;
  const top = a.short ? -45 : -50;
  const sx = 18 * w * side, hx = 22 * w * side + (side > 0 ? 3 : -2), hy = top + 22;
  const col = a.sleeve ?? a.skin;
  capsule(ctx, sx, top, hx, hy - 3, 5.8 * w, lg(ctx, sx - 6, top, sx + 6, hy, col), 2.4);
  ell(ctx, hx, hy, 5.6 * w, 5.2 * w);
  fs(ctx, lg(ctx, hx - 5, hy - 5, hx + 5, hy + 5, a.skin, 0.2, -0.2), 2.2);
}

function eye(ctx: C, x: number, y: number, a: Art, outer: 1 | -1) {
  const angry = a.expr === 'angry' || a.expr === 'shout' || a.expr === 'grim' || a.expr === 'grin';
  const ry = a.expr === 'shout' ? 6.6 : angry ? 7 : 8.2;
  // esclera
  ell(ctx, x, y, 6.8, ry);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // íris com degradê
  ctx.save();
  ell(ctx, x, y, 6.8, ry);
  ctx.clip();
  const ig = ctx.createLinearGradient(0, y - ry, 0, y + ry);
  ig.addColorStop(0, mix(a.eye, -0.55));
  ig.addColorStop(0.5, a.eye);
  ig.addColorStop(1, mix(a.eye, 0.45));
  ell(ctx, x + outer * 0.6, y + 0.8, 5, ry * 0.85);
  ctx.fillStyle = ig;
  ctx.fill();
  ell(ctx, x + outer * 0.6, y + 1, 2.4, ry * 0.45);
  ctx.fillStyle = '#140c08';
  ctx.fill();
  ctx.restore();
  // brilhos
  ell(ctx, x + outer * 2.2 - 0.5, y - ry * 0.35, 2.2, 2.4); ctx.fillStyle = '#ffffff'; ctx.fill();
  ell(ctx, x - outer * 1.8, y + ry * 0.45, 1.1, 1.1); ctx.fill();
  // pálpebra superior grossa + cílio
  ctx.beginPath();
  if (angry) {
    ctx.moveTo(x - outer * 7.5, y - ry + 1.5);
    ctx.quadraticCurveTo(x, y - ry - 2.5 + outer * 0, x + outer * 7.5, y - ry - 1.5);
  } else {
    ctx.moveTo(x - outer * 7.2, y - ry * 0.5);
    ctx.quadraticCurveTo(x, y - ry - 3, x + outer * 7.6, y - ry * 0.4);
  }
  ctx.lineTo(x + outer * 10, y - ry - (angry ? 2 : 0));
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ell(ctx, x, y, 6.8, ry);
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function head(ctx: C, a: Art) {
  const h = H(a);
  // orelhas
  for (const s of [-1, 1] as const) {
    if (a.ears === 'elf' || a.ears === 'goblin') {
      const len = a.ears === 'goblin' ? 22 : 14;
      ctx.beginPath();
      ctx.moveTo(s * (h.rx - 4), h.y - 6);
      ctx.quadraticCurveTo(s * (h.rx + len), h.y - 14 - len * 0.4, s * (h.rx + len + 2), h.y - 18 - len * 0.2);
      ctx.quadraticCurveTo(s * (h.rx + 4), h.y + 2, s * (h.rx - 3), h.y + 6);
      ctx.closePath();
      fs(ctx, lg(ctx, 0, h.y - 20, 0, h.y + 6, a.skin, 0.15, -0.2), 2.2);
      ctx.beginPath(); ctx.moveTo(s * (h.rx + 2), h.y - 4); ctx.lineTo(s * (h.rx + len * 0.7), h.y - 12 - len * 0.3);
      ctx.strokeStyle = mix(a.skin, -0.3); ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ell(ctx, s * (h.rx - 1), h.y + 3, 5, 6.5);
      fs(ctx, mix(a.skin, -0.05), 2.2);
    }
  }
  // rosto
  const g = ctx.createRadialGradient(-h.rx * 0.35, h.y - h.ry * 0.5, 3, 0, h.y, h.rx * 1.25);
  g.addColorStop(0, mix(a.skin, 0.28));
  g.addColorStop(0.55, a.skin);
  g.addColorStop(1, mix(a.skin, -0.22));
  ctx.beginPath();
  ctx.moveTo(-h.rx, h.y - 4);
  ctx.bezierCurveTo(-h.rx, h.y - h.ry * 1.45, h.rx, h.y - h.ry * 1.45, h.rx, h.y - 4);
  ctx.bezierCurveTo(h.rx, h.y + h.ry * 0.7, h.rx * 0.45, h.y + h.ry * 1.02, 0, h.y + h.ry * 1.02);
  ctx.bezierCurveTo(-h.rx * 0.45, h.y + h.ry * 1.02, -h.rx, h.y + h.ry * 0.7, -h.rx, h.y - 4);
  ctx.closePath();
  fs(ctx, g, 2.8);
  // bochechas
  ctx.fillStyle = 'rgba(255,110,110,0.28)';
  ell(ctx, -h.rx * 0.55, h.y + 9, 5.5, 3); ctx.fill();
  ell(ctx, h.rx * 0.55, h.y + 9, 5.5, 3); ctx.fill();
  if (a.expr !== 'masked') {
    // nariz
    ctx.beginPath(); ctx.moveTo(1.5, h.y + 6); ctx.quadraticCurveTo(3.5, h.y + 9, 1, h.y + 10);
    ctx.strokeStyle = mix(a.skin, -0.35); ctx.lineWidth = 1.6; ctx.stroke();
  }
  const ex = h.rx * 0.39, ey = h.y + 1;
  eye(ctx, -ex, ey, a, -1);
  eye(ctx, ex, ey, a, 1);
  // sobrancelhas
  ctx.strokeStyle = OUT;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  if (a.expr === 'calm') {
    ctx.moveTo(-ex - 7, ey - 13); ctx.quadraticCurveTo(-ex, ey - 16, -ex + 6, ey - 13);
    ctx.moveTo(ex + 7, ey - 13); ctx.quadraticCurveTo(ex, ey - 16, ex - 6, ey - 13);
  } else {
    ctx.moveTo(-ex - 8, ey - 15); ctx.lineTo(-ex + 6, ey - 9);
    ctx.moveTo(ex + 8, ey - 15); ctx.lineTo(ex - 6, ey - 9);
  }
  ctx.stroke();
  // boca
  const my = h.y + 15;
  if (a.expr === 'shout') {
    ctx.beginPath();
    ctx.moveTo(-6, my - 2); ctx.quadraticCurveTo(0, my - 4, 7, my - 2);
    ctx.quadraticCurveTo(7, my + 8, 0.5, my + 9);
    ctx.quadraticCurveTo(-6, my + 8, -6, my - 2);
    ctx.closePath();
    fs(ctx, '#7a1f22', 2.2);
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-7, my - 4, 15, 3.4);
    ctx.fillStyle = '#e86a7a'; ell(ctx, 1, my + 8, 5, 3.4); ctx.fill();
    ctx.restore();
  } else if (a.expr === 'angry' || a.expr === 'grin') {
    ctx.beginPath();
    ctx.roundRect(-6, my - 1, 13, 5.5, 2);
    fs(ctx, '#ffffff', 2);
    ctx.beginPath(); ctx.moveTo(-6, my + 1.8); ctx.lineTo(7, my + 1.8); ctx.moveTo(-1.5, my - 1); ctx.lineTo(-1.5, my + 4.5); ctx.moveTo(3, my - 1); ctx.lineTo(3, my + 4.5);
    ctx.lineWidth = 1; ctx.stroke();
  } else if (a.expr === 'grim') {
    ctx.beginPath(); ctx.moveTo(-8, my + 3); ctx.quadraticCurveTo(0, my - 2, 9, my + 3);
    ctx.lineWidth = 2.6; ctx.stroke();
  } else if (a.expr === 'calm') {
    ctx.beginPath(); ctx.moveTo(-4, my); ctx.quadraticCurveTo(1, my + 4, 6, my);
    ctx.lineWidth = 2.2; ctx.stroke();
  }
}

function drawFigure(ctx: C, a: Art) {
  ctx.lineJoin = 'round';
  a.back?.(ctx, a);
  a.hairBack?.(ctx, a);
  a.backHand?.(ctx, a);
  legs(ctx, a);
  arm(ctx, a, -1);
  a.torso(ctx, a);
  head(ctx, a);
  a.faceExtra?.(ctx, a);
  a.hairFront(ctx, a);
  arm(ctx, a, 1);
  a.hand?.(ctx, a);
}

// ---------------------------------------------------------------------------
// armas e acessórios
// ---------------------------------------------------------------------------
function blade(ctx: C, x0: number, y0: number, x1: number, y1: number, w: number, steel = '#dfe6ee') {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
  ctx.beginPath();
  ctx.moveTo(x0 + nx, y0 + ny);
  ctx.lineTo(x1 - Math.cos(a) * w * 2.2 + nx, y1 - Math.sin(a) * w * 2.2 + ny);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a) * w * 2.2 - nx, y1 - Math.sin(a) * w * 2.2 - ny);
  ctx.lineTo(x0 - nx, y0 - ny);
  ctx.closePath();
  const g = ctx.createLinearGradient(x0 + nx, y0 + ny, x0 - nx, y0 - ny);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, steel); g.addColorStop(1, mix(steel, -0.35));
  fs(ctx, g, 2.2);
}

function sword(ctx: C, hx: number, hy: number, angle: number, len: number, hilt = '#c9302c', steel = '#dfe6ee') {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const gx = hx + dx * 6, gy = hy + dy * 6;
  blade(ctx, gx, gy, gx + dx * len, gy + dy * len, len > 50 ? 5.5 : 3.6, steel);
  // guarda
  capsule(ctx, gx - dy * 9, gy + dx * 9, gx + dy * 9, gy - dx * 9, 2.4, '#d9a93a', 2);
  // cabo
  capsule(ctx, hx - dx * 7, hy - dy * 7, gx, gy, 2.6, hilt, 2);
  ell(ctx, hx - dx * 9, hy - dy * 9, 3.4, 3.4); fs(ctx, '#d9a93a', 2);
}

function axe(ctx: C, hx: number, hy: number, angle: number, len: number, double = true) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  capsule(ctx, hx - dx * 10, hy - dy * 10, hx + dx * len, hy + dy * len, 2.8, lg(ctx, hx, hy, hx + 6, hy + 6, '#8a5a2b'), 2.2);
  const tx = hx + dx * (len - 6), ty = hy + dy * (len - 6);
  const px = -dy, py = dx;
  for (const s of double ? [1, -1] : [1]) {
    ctx.beginPath();
    ctx.moveTo(tx + dx * 7, ty + dy * 7);
    ctx.quadraticCurveTo(tx + px * s * 20 + dx * 14, ty + py * s * 20 + dy * 14, tx + px * s * 22 + dx * 2, ty + py * s * 22 + dy * 2);
    ctx.quadraticCurveTo(tx + px * s * 20 - dx * 12, ty + py * s * 20 - dy * 12, tx - dx * 7, ty - dy * 7);
    ctx.closePath();
    const g = ctx.createLinearGradient(tx, ty, tx + px * s * 22, ty + py * s * 22);
    g.addColorStop(0, '#8d97a3'); g.addColorStop(0.6, '#dfe6ee'); g.addColorStop(1, '#ffffff');
    fs(ctx, g, 2.2);
  }
}

function cape(ctx: C, color: string, pts: P[]) {
  smooth(ctx, pts);
  fs(ctx, lg(ctx, -40, -60, 30, 0, color, 0.15, -0.35), 2.6);
}

// ---------------------------------------------------------------------------
// HERÓIS
// ---------------------------------------------------------------------------
const ARTS: Record<string, Art> = {
  grom: {
    skin: '#eaa77d', eye: '#5a8fd0', expr: 'shout', pants: '#6b4a2c', boots: '#4a2f1b',
    hairBack: (ctx) => {
      smooth(ctx, [[-28, -96], [-40, -72], [-44, -46], [-34, -28], [-18, -36], [0, -30], [18, -36], [36, -28], [46, -50], [40, -80], [24, -102], [0, -108], [-18, -104]]);
      fs(ctx, lg(ctx, 0, -108, 0, -28, '#b2482a', 0.18, -0.35));
      strand(ctx, [[-34, -70], [-38, -50], [-30, -36]], mix('#b2482a', 0.35), 2);
      strand(ctx, [[34, -72], [40, -52], [32, -36]], mix('#b2482a', 0.35), 2);
    },
    backHand: (ctx) => sword(ctx, -22, -32, -2.05, 62, '#6b3a1a', '#d8dfe7'),
    torso: (ctx, a) => {
      torsoBase(ctx, a, a.skin);
      // músculos
      ctx.strokeStyle = mix(a.skin, -0.3); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-10, -46); ctx.quadraticCurveTo(-4, -40, 0, -44); ctx.quadraticCurveTo(4, -40, 10, -46);
      ctx.moveTo(0, -42); ctx.lineTo(0, -32); ctx.stroke();
      // alça de couro
      ctx.beginPath(); ctx.moveTo(-16, -52); ctx.lineTo(14, -27); ctx.lineTo(9, -26); ctx.lineTo(-17, -47); ctx.closePath(); fs(ctx, '#7a4a26', 2);
      // cinto + tanga de pele
      ctx.beginPath(); ctx.roundRect(-15, -29, 30, 7, 3); fs(ctx, '#5a3218', 2.2);
      ctx.beginPath(); ctx.roundRect(-4, -29.5, 8, 8, 2); fs(ctx, '#e0b84a', 2);
      poly(ctx, [[-14, -22], [14, -22], [12, -12], [8, -16], [4, -10], [0, -15], [-4, -10], [-8, -15], [-12, -11]]);
      fs(ctx, lg(ctx, 0, -22, 0, -10, '#a07040'), 2);
    },
    faceExtra: () => {},
    hairFront: (ctx) => {
      poly(ctx, [[-31, -72], [-30, -94], [-16, -106], [6, -108], [24, -100], [32, -84], [31, -66], [25, -78], [18, -84], [13, -77], [7, -87], [1, -79], [-6, -88], [-12, -79], [-19, -88], [-25, -76]]);
      fs(ctx, lg(ctx, 0, -108, 0, -70, '#b2482a', 0.22, -0.3));
      strand(ctx, [[-14, -100], [-4, -104], [10, -102]], mix('#b2482a', 0.45), 2);
      // faixa azul
      ctx.beginPath(); ctx.moveTo(-30, -86); ctx.quadraticCurveTo(0, -96, 30, -88); ctx.lineTo(30, -81); ctx.quadraticCurveTo(0, -89, -30, -79); ctx.closePath();
      fs(ctx, lg(ctx, 0, -96, 0, -79, '#2f6fd0'), 2.2);
      poly(ctx, [[-29, -84], [-42, -78], [-38, -72], [-28, -79]]); fs(ctx, '#2f6fd0', 2);
    },
    hand: (ctx) => axe(ctx, 26, -26, -1.25, 46, true),
  },

  maya: {
    skin: '#f7d8c2', eye: '#21a5c9', expr: 'shout', pants: '#1c5f78', boots: '#2b3e66', sleeve: '#2aa3a8',
    back: (ctx) => cape(ctx, '#1c6f86', [[-14, -54], [-36, -40], [-46, -12], [-30, -4], [-8, -14], [6, -30], [12, -50]]),
    hairBack: (ctx) => {
      smooth(ctx, [[-28, -96], [-36, -70], [-32, -42], [-14, -30], [10, -26], [40, -32], [60, -46], [54, -66], [36, -96], [10, -110], [-14, -106]]);
      fs(ctx, lg(ctx, 0, -110, 40, -26, '#f5cf55', 0.3, -0.25));
      strand(ctx, [[20, -90], [42, -64], [52, -44]], mix('#f5cf55', 0.45), 2.2);
      strand(ctx, [[-26, -80], [-30, -56], [-20, -38]], mix('#f5cf55', 0.4), 2);
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#2aa3a8');
      // armadura prateada no peito
      ctx.beginPath(); ctx.moveTo(-14, -50); ctx.quadraticCurveTo(0, -56, 14, -50); ctx.lineTo(11, -38); ctx.quadraticCurveTo(0, -34, -11, -38); ctx.closePath();
      fs(ctx, lg(ctx, -12, -54, 12, -36, '#c9d6e2', 0.4), 2.2);
      ctx.beginPath(); ctx.roundRect(-14, -30, 28, 6, 3); fs(ctx, '#d9a93a', 2);
      // saia
      poly(ctx, [[-15, -25], [15, -25], [19, -12], [-19, -12]]); fs(ctx, lg(ctx, 0, -25, 0, -12, '#1c6f86'), 2.2);
    },
    hairFront: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(-31, -66); ctx.quadraticCurveTo(-36, -100, -4, -108); ctx.quadraticCurveTo(28, -110, 32, -78);
      ctx.quadraticCurveTo(26, -84, 18, -84); ctx.quadraticCurveTo(10, -90, -2, -80); ctx.quadraticCurveTo(-14, -86, -18, -80);
      ctx.quadraticCurveTo(-26, -76, -26, -54); ctx.quadraticCurveTo(-30, -56, -31, -66); ctx.closePath();
      fs(ctx, lg(ctx, 0, -108, 0, -60, '#f5cf55', 0.35, -0.2));
      strand(ctx, [[-18, -100], [0, -106], [18, -100]], '#fff3c4', 2.4);
      // tiara azul com joia
      ctx.beginPath(); ctx.moveTo(-28, -88); ctx.quadraticCurveTo(0, -100, 28, -90); ctx.lineWidth = 4.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 2.6; ctx.strokeStyle = '#2f6fd0'; ctx.stroke();
      ell(ctx, 0, -96, 3.6, 4.2); fs(ctx, '#9fe8ff', 2);
    },
    hand: (ctx) => {
      // orbe de gelo na mão
      const g = ctx.createRadialGradient(30, -36, 1, 30, -36, 15);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.45, 'rgba(140,230,255,0.75)'); g.addColorStop(1, 'rgba(80,190,255,0)');
      ctx.fillStyle = g; ell(ctx, 30, -36, 15, 15); ctx.fill();
      ell(ctx, 30, -36, 6, 6); fs(ctx, '#c9f4ff', 1.8);
    },
  },

  zazu: {
    skin: '#b97a4c', eye: '#4a2e1a', expr: 'shout', pants: '#a8521a', boots: '#3b2616', sleeve: '#e2832b',
    hairBack: (ctx) => {
      // rabo de cavalo espetado
      poly(ctx, [[-4, -100], [-22, -118], [-14, -114], [-24, -128], [-6, -116], [-6, -128], [4, -112], [10, -104]]);
      fs(ctx, lg(ctx, 0, -128, 0, -100, '#2b1d16', 0.3));
    },
    backHand: (ctx) => {},
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#e2832b');
      // decote em V (pele)
      poly(ctx, [[-8, -53], [8, -53], [0, -40]]); fs(ctx, a.skin, 2);
      // faixa vermelha
      ctx.beginPath(); ctx.roundRect(-15, -31, 30, 7, 3); fs(ctx, '#c9302c', 2.2);
      poly(ctx, [[8, -28], [16, -14], [10, -15], [5, -26]]); fs(ctx, '#c9302c', 2);
      poly(ctx, [[-15, -25], [15, -25], [17, -14], [-17, -14]]); fs(ctx, lg(ctx, 0, -25, 0, -14, '#e2832b'), 2.2);
    },
    hairFront: (ctx) => {
      poly(ctx, [[-29, -76], [-30, -92], [-18, -104], [0, -108], [18, -104], [29, -92], [29, -74], [22, -86], [14, -80], [8, -90], [0, -82], [-8, -90], [-14, -80], [-22, -88]]);
      fs(ctx, lg(ctx, 0, -108, 0, -74, '#2b1d16', 0.35));
      ctx.beginPath(); ctx.roundRect(-7, -108, 14, 7, 3); fs(ctx, '#c9302c', 2);
    },
    hand: (ctx) => {
      // estilingue
      capsule(ctx, 27, -24, 30, -44, 2.6, '#9a6a37', 2);
      ctx.beginPath(); ctx.moveTo(30, -44); ctx.lineTo(23, -56); ctx.moveTo(30, -44); ctx.lineTo(38, -55);
      ctx.lineWidth = 5.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#9a6a37'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(23, -56); ctx.quadraticCurveTo(30, -46, 38, -55); ctx.strokeStyle = '#efe0c0'; ctx.lineWidth = 1.6; ctx.stroke();
    },
  },

  vapor: {
    skin: '#f2d6bd', eye: '#a8611e', expr: 'masked', pants: '#2c2c36', boots: '#1d1d24', sleeve: '#33333f',
    back: (ctx) => cape(ctx, '#4b2f72', [[-12, -56], [-40, -48], [-58, -22], [-44, -2], [-16, -10], [4, -26], [14, -52]]),
    hairBack: (ctx) => {
      poly(ctx, [[-26, -96], [-46, -100], [-34, -88], [-50, -80], [-32, -74], [-40, -60], [-24, -66], [0, -60], [30, -66]]);
      fs(ctx, lg(ctx, -40, -100, 0, -60, '#e9eef6', 0.3, -0.3));
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#3a3a48');
      // placas de armadura
      ctx.beginPath(); ctx.moveTo(-14, -50); ctx.quadraticCurveTo(0, -54, 14, -50); ctx.lineTo(12, -40); ctx.quadraticCurveTo(0, -37, -12, -40); ctx.closePath();
      fs(ctx, lg(ctx, -12, -54, 12, -38, '#5b5b6e', 0.3), 2);
      ctx.beginPath(); ctx.roundRect(-15, -30, 30, 6, 3); fs(ctx, '#7a2e8f', 2);
      ell(ctx, -18, -50, 7, 5.5); fs(ctx, lg(ctx, -24, -55, -12, -45, '#5b5b6e', 0.35), 2);
      ell(ctx, 18, -50, 7, 5.5); fs(ctx, lg(ctx, 12, -55, 24, -45, '#5b5b6e', 0.35), 2);
    },
    faceExtra: (ctx) => {
      // máscara cobrindo nariz e boca
      ctx.beginPath(); ctx.moveTo(-26, -70); ctx.quadraticCurveTo(0, -64, 26, -70);
      ctx.quadraticCurveTo(26, -56, 12, -50); ctx.quadraticCurveTo(0, -48, -12, -50); ctx.quadraticCurveTo(-26, -56, -26, -70); ctx.closePath();
      fs(ctx, lg(ctx, 0, -70, 0, -48, '#30303c', 0.25), 2.4);
      strand(ctx, [[-14, -62], [0, -59], [14, -62]], '#4a4a5a', 1.4);
    },
    hairFront: (ctx) => {
      poly(ctx, [[-31, -74], [-36, -96], [-24, -100], [-28, -116], [-10, -106], [-4, -124], [8, -108], [22, -118], [24, -102], [40, -104], [32, -90], [44, -82], [30, -78], [31, -66], [22, -80], [14, -76], [10, -88], [2, -78], [-6, -88], [-12, -78], [-18, -88], [-24, -76]]);
      fs(ctx, lg(ctx, 0, -124, 0, -70, '#f2f5fa', 0.2, -0.32));
      strand(ctx, [[-16, -104], [-4, -110], [10, -104]], '#ffffff', 2);
    },
    hand: (ctx) => blade(ctx, 26, -24, 40, -50, 3.2),
  },

  espetado: {
    skin: '#eba37e', eye: '#4f7a2a', expr: 'angry', short: true, body: 1.15, pants: '#5a3a22', boots: '#3a2414', sleeve: '#6b4428',
    head: { rx: 30, ry: 25, y: -68 },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#6b4428', 28);
      ctx.beginPath(); ctx.roundRect(-17, -26, 34, 7, 3); fs(ctx, '#3a2414', 2.2);
      ctx.beginPath(); ctx.roundRect(-5, -27, 10, 9, 2); fs(ctx, '#c9c9c9', 2);
      ell(ctx, -20, -44, 8, 6); fs(ctx, lg(ctx, -26, -50, -14, -38, '#9aa4ae', 0.35), 2);
      ell(ctx, 20, -44, 8, 6); fs(ctx, lg(ctx, 14, -50, 26, -38, '#9aa4ae', 0.35), 2);
    },
    faceExtra: (ctx) => {
      // barba enorme e trançada
      smooth(ctx, [[-28, -70], [-30, -52], [-20, -36], [-10, -24], [0, -18], [10, -24], [20, -36], [30, -52], [28, -70], [16, -58], [0, -56], [-16, -58]]);
      fs(ctx, lg(ctx, 0, -70, 0, -18, '#e0621f', 0.25, -0.3));
      for (const x of [-10, 0, 10]) strand(ctx, [[x, -54], [x + 2, -40], [x, -28]], mix('#e0621f', 0.35), 1.8);
      capsule(ctx, -6, -24, -6, -14, 3, '#e0621f', 2); capsule(ctx, 6, -24, 6, -14, 3, '#e0621f', 2);
      // bigode
      ctx.beginPath(); ctx.moveTo(-14, -58); ctx.quadraticCurveTo(0, -64, 14, -58); ctx.quadraticCurveTo(0, -55, -14, -58);
      fs(ctx, mix('#e0621f', -0.1), 2);
    },
    hairFront: (ctx) => {
      // moicano espetado
      poly(ctx, [[-10, -88], [-16, -104], [-8, -100], [-10, -120], [-2, -106], [2, -128], [6, -106], [14, -118], [12, -100], [20, -102], [12, -88]]);
      fs(ctx, lg(ctx, 0, -128, 0, -88, '#ea6a22', 0.3, -0.25));
      strand(ctx, [[0, -92], [2, -112]], '#ffb070', 1.6);
    },
    hand: (ctx) => axe(ctx, 30, -22, -1.4, 58, false),
  },

  diva: {
    skin: '#f6d4bd', eye: '#2f7ad0', expr: 'angry', pants: '#9a2a22', boots: '#5a1a14', sleeve: '#c8352a',
    back: (ctx) => cape(ctx, '#e893ae', [[-12, -54], [-36, -44], [-48, -14], [-32, -2], [-8, -12], [6, -30], [14, -52]]),
    hairBack: (ctx) => {
      smooth(ctx, [[-30, -94], [-42, -70], [-40, -46], [-26, -38], [0, -42], [26, -38], [40, -46], [42, -70], [30, -96], [0, -110]]);
      fs(ctx, lg(ctx, 0, -110, 0, -38, '#f6cf4a', 0.3, -0.25));
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#c8352a');
      ctx.beginPath(); ctx.moveTo(-14, -51); ctx.quadraticCurveTo(0, -56, 14, -51); ctx.lineTo(12, -36); ctx.quadraticCurveTo(0, -31, -12, -36); ctx.closePath();
      fs(ctx, lg(ctx, -12, -55, 12, -33, '#e2483a', 0.35), 2.2);
      strand(ctx, [[-12, -50], [0, -54], [12, -50]], '#f2c94c', 2);
      ell(ctx, -19, -50, 8, 6.5); fs(ctx, lg(ctx, -26, -56, -12, -44, '#e2483a', 0.35), 2);
      ell(ctx, 19, -50, 8, 6.5); fs(ctx, lg(ctx, 12, -56, 26, -44, '#e2483a', 0.35), 2);
      poly(ctx, [[-15, -27], [15, -27], [17, -14], [-17, -14]]); fs(ctx, lg(ctx, 0, -27, 0, -14, '#c8352a'), 2.2);
    },
    hairFront: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(-32, -64); ctx.quadraticCurveTo(-38, -104, -2, -110); ctx.quadraticCurveTo(34, -110, 34, -72);
      ctx.quadraticCurveTo(30, -82, 22, -84); ctx.quadraticCurveTo(14, -94, 4, -84); ctx.quadraticCurveTo(-6, -94, -14, -84);
      ctx.quadraticCurveTo(-24, -84, -26, -66); ctx.closePath();
      fs(ctx, lg(ctx, 0, -110, 0, -64, '#f6cf4a', 0.35, -0.2));
      strand(ctx, [[-18, -100], [0, -106], [16, -100]], '#fff3c4', 2.2);
      // cachos laterais
      smooth(ctx, [[-34, -70], [-38, -54], [-30, -44], [-26, -56], [-28, -70]]); fs(ctx, '#f6cf4a', 2);
      smooth(ctx, [[34, -70], [38, -54], [30, -44], [26, -56], [28, -70]]); fs(ctx, '#f6cf4a', 2);
    },
    hand: (ctx) => sword(ctx, 26, -26, -0.75, 44, '#c8352a'),
  },

  casacaverde: {
    skin: '#f4d2b2', eye: '#2a8ad0', expr: 'shout', ears: 'elf', pants: '#5a4026', boots: '#3a2a18', sleeve: '#4f8a2e',
    hairBack: (ctx) => {
      smooth(ctx, [[-28, -96], [-36, -70], [-34, -36], [-20, -24], [0, -30], [20, -24], [34, -36], [36, -70], [28, -96], [0, -110]]);
      fs(ctx, lg(ctx, 0, -110, 0, -24, '#f2d06a', 0.3, -0.25));
    },
    backHand: (ctx) => {
      // arco grande nas costas/mão de trás
      ctx.beginPath(); ctx.arc(-14, -50, 40, Math.PI * 0.6, Math.PI * 1.4);
      ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 4.2; ctx.strokeStyle = '#a0662e'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-26, -88); ctx.lineTo(-26, -12); ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = 1.4; ctx.stroke();
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#4f8a2e');
      ctx.beginPath(); ctx.moveTo(-16, -52); ctx.lineTo(14, -27); ctx.lineTo(9, -26); ctx.lineTo(-17, -47); ctx.closePath(); fs(ctx, '#7a5230', 2);
      ctx.beginPath(); ctx.roundRect(-15, -30, 30, 6, 3); fs(ctx, '#7a5230', 2);
      poly(ctx, [[-15, -25], [15, -25], [18, -13], [6, -16], [0, -12], [-6, -16], [-18, -13]]); fs(ctx, lg(ctx, 0, -25, 0, -12, '#4f8a2e'), 2.2);
    },
    hairFront: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(-30, -60); ctx.quadraticCurveTo(-36, -104, 0, -110); ctx.quadraticCurveTo(36, -104, 30, -60);
      ctx.quadraticCurveTo(26, -80, 10, -86); ctx.quadraticCurveTo(2, -90, 0, -96); ctx.quadraticCurveTo(-2, -90, -10, -86);
      ctx.quadraticCurveTo(-26, -80, -30, -60); ctx.closePath();
      fs(ctx, lg(ctx, 0, -110, 0, -60, '#f2d06a', 0.35, -0.2));
      strand(ctx, [[-8, -104], [-18, -96], [-24, -80]], '#fff3c4', 2); strand(ctx, [[8, -104], [18, -96], [24, -80]], '#fff3c4', 2);
    },
    hand: (ctx) => {
      // flecha na mão
      ctx.beginPath(); ctx.moveTo(18, -24); ctx.lineTo(44, -50); ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = 2; ctx.stroke();
      poly(ctx, [[44, -50], [42, -42], [50, -56], [36, -48]]); fs(ctx, '#c9d2dc', 1.6);
      poly(ctx, [[18, -24], [12, -26], [16, -18]]); fs(ctx, '#e5392c', 1.4);
    },
  },

  hobsbawm: {
    skin: '#e8b48c', eye: '#5a3a1a', expr: 'shout', pants: '#2a2530', boots: '#1d1820', sleeve: '#2f2a36',
    back: (ctx) => cape(ctx, '#2a2530', [[-12, -54], [-30, -40], [-36, -10], [-22, -2], [0, -6], [22, -2], [34, -12], [26, -44], [12, -54]]),
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#2f2a36', 34);
      poly(ctx, [[-8, -53], [8, -53], [7, -24], [-7, -24]]); fs(ctx, lg(ctx, 0, -53, 0, -24, '#b8352a', 0.3), 2);
      poly(ctx, [[-10, -54], [0, -46], [10, -54], [6, -58], [-6, -58]]); fs(ctx, '#f2ece0', 2);
      for (const y of [-46, -38, -30]) { ell(ctx, 0, y, 1.6, 1.6); ctx.fillStyle = '#e0b43a'; ctx.fill(); }
    },
    hairFront: (ctx) => {
      // careca na frente, tufos laterais e costeletas
      smooth(ctx, [[-32, -78], [-34, -92], [-26, -100], [-22, -88], [-26, -62], [-30, -60]]); fs(ctx, lg(ctx, -30, -100, -24, -60, '#6b3e22', 0.3), 2.2);
      smooth(ctx, [[32, -78], [34, -92], [26, -100], [22, -88], [26, -62], [30, -60]]); fs(ctx, lg(ctx, 24, -100, 30, -60, '#6b3e22', 0.3), 2.2);
      strand(ctx, [[-14, -98], [0, -102], [14, -98]], '#6b3e22', 2.4);
      // óculos pequenos
      ctx.beginPath(); ctx.arc(-11, -75, 6, 0, Math.PI * 2); ctx.arc(11, -75, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#c9a43a'; ctx.lineWidth = 1.6; ctx.stroke();
    },
    hand: (ctx) => {
      // livro roxo
      ctx.save(); ctx.translate(32, -38); ctx.rotate(-0.35);
      ctx.beginPath(); ctx.roundRect(-11, -14, 22, 26, 3); fs(ctx, lg(ctx, -11, -14, 11, 12, '#6a3fa0', 0.3), 2.2);
      ctx.fillStyle = '#e0b43a'; ctx.fillRect(-1.5, -9, 3, 16); ctx.fillRect(-6, -4, 12, 3);
      ctx.restore();
    },
  },

  johan: {
    skin: '#f2caa6', eye: '#2f86d0', expr: 'grin', pants: '#3e5a86', boots: '#2b2f3a', sleeve: '#aeb9c6',
    backHand: (ctx) => sword(ctx, -20, -34, -2.2, 78, '#2f4a86', '#e6edf4'),
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#aeb9c6');
      ctx.beginPath(); ctx.moveTo(-14, -51); ctx.quadraticCurveTo(0, -56, 14, -51); ctx.lineTo(12, -37); ctx.quadraticCurveTo(0, -33, -12, -37); ctx.closePath();
      fs(ctx, lg(ctx, -12, -55, 12, -33, '#d9e2ea', 0.4), 2.2);
      ell(ctx, -19, -50, 8.5, 6.5); fs(ctx, lg(ctx, -26, -56, -12, -44, '#d9e2ea', 0.4), 2);
      ell(ctx, 19, -50, 8.5, 6.5); fs(ctx, lg(ctx, 12, -56, 26, -44, '#d9e2ea', 0.4), 2);
      poly(ctx, [[-15, -28], [15, -28], [17, -14], [-17, -14]]); fs(ctx, lg(ctx, 0, -28, 0, -14, '#3e5a86'), 2.2);
    },
    hairFront: (ctx) => {
      poly(ctx, [[-30, -74], [-36, -92], [-24, -96], [-26, -110], [-10, -102], [-2, -118], [8, -104], [22, -112], [22, -98], [36, -96], [30, -84], [30, -70], [22, -82], [14, -78], [8, -90], [0, -80], [-8, -90], [-14, -80], [-22, -88]]);
      fs(ctx, lg(ctx, 0, -118, 0, -70, '#f2c75a', 0.3, -0.25));
      strand(ctx, [[-14, -100], [0, -106], [14, -100]], '#fff3c4', 2);
    },
    hand: () => {},
  },

  kanga: {
    skin: '#9c6a46', eye: '#d08a2a', expr: 'angry', pants: '#5a4022', boots: '#3a2814', sleeve: undefined,
    hairBack: (ctx) => {
      for (let i = 0; i < 9; i++) {
        const x = -34 + i * 8.5;
        capsule(ctx, x * 0.8, -96 + Math.abs(x) * 0.2, x * 1.1, -40 + (i % 3) * 6, 4, lg(ctx, x - 4, -96, x + 4, -40, '#5a3a22', 0.25), 2);
      }
      // penas
      poly(ctx, [[-30, -96], [-46, -118], [-36, -116], [-26, -98]]); fs(ctx, '#e5392c', 1.8);
      poly(ctx, [[-26, -100], [-34, -126], [-24, -120], [-20, -100]]); fs(ctx, '#f0c043', 1.8);
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#6a8a3a');
      poly(ctx, [[-15, -54], [15, -54], [12, -40], [-12, -40]]); fs(ctx, lg(ctx, 0, -54, 0, -40, '#8a5a32'), 2);
      for (let i = -2; i <= 2; i++) { ell(ctx, i * 5, -42 + Math.abs(i) * -1.5, 1.8, 3.4); fs(ctx, '#f2ece0', 1.2); }
      ctx.beginPath(); ctx.roundRect(-15, -30, 30, 6, 3); fs(ctx, '#7a4a26', 2);
      poly(ctx, [[-15, -25], [15, -25], [16, -12], [8, -16], [0, -11], [-8, -16], [-16, -12]]); fs(ctx, lg(ctx, 0, -25, 0, -12, '#8a5a32'), 2.2);
    },
    hairFront: (ctx) => {
      poly(ctx, [[-30, -72], [-32, -94], [-18, -106], [2, -110], [22, -104], [32, -90], [30, -70], [22, -84], [12, -80], [4, -90], [-6, -82], [-14, -90], [-22, -80]]);
      fs(ctx, lg(ctx, 0, -110, 0, -72, '#5a3a22', 0.3));
      // pintura tribal
      ctx.strokeStyle = '#f2ece0'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-20, -68); ctx.lineTo(-14, -66); ctx.moveTo(20, -68); ctx.lineTo(14, -66); ctx.stroke();
    },
    hand: (ctx) => {
      capsule(ctx, 26, 4, 34, -96, 2.6, lg(ctx, 26, 0, 32, 0, '#8a5a2b'), 2);
      poly(ctx, [[34, -96], [28, -100], [35, -120], [41, -99]]); fs(ctx, lg(ctx, 28, -120, 41, -96, '#cfd6de', 0.4), 2);
      poly(ctx, [[33, -90], [26, -84], [31, -80]]); fs(ctx, '#e5392c', 1.4);
    },
  },

  escarlate: {
    skin: '#f6d6c2', eye: '#2fa86a', expr: 'grin', pants: '#2a2630', boots: '#1d1a22', sleeve: '#2f2a36',
    back: (ctx) => cape(ctx, '#26222c', [[-12, -56], [-38, -46], [-50, -16], [-34, -2], [-10, -12], [6, -30], [14, -54]]),
    hairBack: (ctx) => {
      smooth(ctx, [[-30, -96], [-42, -70], [-46, -40], [-34, -20], [-16, -28], [0, -34], [18, -28], [36, -20], [46, -42], [40, -76], [26, -100], [0, -110]]);
      fs(ctx, lg(ctx, 0, -110, 0, -20, '#d8306a', 0.3, -0.3));
      strand(ctx, [[-34, -70], [-40, -46], [-32, -28]], '#ff7aa8', 2);
      strand(ctx, [[34, -70], [42, -46], [34, -26]], '#ff7aa8', 2);
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#2f2a36');
      ctx.beginPath(); ctx.moveTo(-16, -52); ctx.lineTo(14, -27); ctx.lineTo(9, -26); ctx.lineTo(-17, -47); ctx.closePath(); fs(ctx, '#5a3a22', 2);
      ctx.beginPath(); ctx.roundRect(-15, -30, 30, 6, 3); fs(ctx, '#5a3a22', 2);
      ctx.beginPath(); ctx.roundRect(-4, -30.5, 8, 7, 2); fs(ctx, '#d9a93a', 1.8);
    },
    faceExtra: (ctx) => {
      // lenço preto no pescoço
      ctx.beginPath(); ctx.moveTo(-20, -56); ctx.quadraticCurveTo(0, -46, 20, -56); ctx.lineTo(16, -48); ctx.quadraticCurveTo(0, -40, -16, -48); ctx.closePath();
      fs(ctx, lg(ctx, 0, -56, 0, -42, '#2a2630', 0.25), 2.2);
    },
    hairFront: (ctx) => {
      poly(ctx, [[-32, -66], [-34, -96], [-18, -110], [4, -112], [24, -104], [34, -86], [33, -64], [26, -78], [20, -72], [16, -86], [8, -76], [2, -90], [-6, -78], [-12, -90], [-20, -78], [-26, -88]]);
      fs(ctx, lg(ctx, 0, -112, 0, -64, '#e0367a', 0.35, -0.25));
      strand(ctx, [[-16, -104], [0, -108], [16, -102]], '#ffb0cc', 2.2);
    },
    hand: (ctx) => blade(ctx, 24, -24, 46, -38, 3.2),
  },

  seth: {
    skin: '#c9d8a8', eye: '#d82a2a', expr: 'grin', pants: '#2a2032', boots: '#1d1622', sleeve: '#8a2a3a',
    back: (ctx) => cape(ctx, '#5a2a6a', [[-14, -58], [-34, -44], [-42, -12], [-26, -2], [0, -6], [24, -2], [36, -14], [28, -46], [14, -58]]),
    hairBack: (ctx) => {
      smooth(ctx, [[-30, -96], [-44, -74], [-46, -46], [-36, -30], [-20, -38], [0, -36], [20, -38], [36, -30], [46, -48], [42, -78], [26, -100], [0, -110]]);
      fs(ctx, lg(ctx, 0, -110, 0, -30, '#5a3426', 0.25, -0.3));
      strand(ctx, [[-36, -74], [-42, -52], [-34, -36]], '#8a5a3a', 2);
      strand(ctx, [[38, -76], [44, -54], [36, -36]], '#8a5a3a', 2);
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#8a2a3a', 32);
      poly(ctx, [[-6, -54], [6, -54], [5, -24], [-5, -24]]); fs(ctx, lg(ctx, 0, -54, 0, -24, '#2a2032', 0.3), 2);
      for (const y of [-46, -38, -30]) { ell(ctx, 0, y, 1.8, 1.8); ctx.fillStyle = '#e0b43a'; ctx.fill(); }
      // gola alta
      poly(ctx, [[-18, -54], [-24, -70], [-12, -58]]); fs(ctx, '#5a2a6a', 2);
      poly(ctx, [[18, -54], [24, -70], [12, -58]]); fs(ctx, '#5a2a6a', 2);
    },
    hairFront: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(-32, -62); ctx.quadraticCurveTo(-38, -104, -2, -112); ctx.quadraticCurveTo(34, -112, 34, -66);
      ctx.quadraticCurveTo(28, -84, 16, -86); ctx.quadraticCurveTo(6, -96, -4, -84); ctx.quadraticCurveTo(-16, -92, -22, -82);
      ctx.quadraticCurveTo(-28, -76, -32, -62); ctx.closePath();
      fs(ctx, lg(ctx, 0, -112, 0, -62, '#5a3426', 0.3, -0.25));
      strand(ctx, [[-14, -104], [2, -108], [16, -102]], '#a06a4a', 2.2);
    },
    hand: (ctx) => {
      // varinha com fogo verde
      capsule(ctx, 24, -24, 40, -62, 2.2, lg(ctx, 24, -24, 40, -62, '#3a2a1a', 0.3), 2);
      const g = ctx.createRadialGradient(42, -68, 1, 42, -68, 16);
      g.addColorStop(0, 'rgba(220,255,200,0.95)'); g.addColorStop(0.4, 'rgba(90,230,90,0.8)'); g.addColorStop(1, 'rgba(40,200,60,0)');
      ctx.fillStyle = g; ell(ctx, 42, -68, 16, 16); ctx.fill();
      ctx.beginPath(); ctx.moveTo(40, -62); ctx.quadraticCurveTo(52, -78, 44, -92); ctx.quadraticCurveTo(38, -80, 40, -62);
      ctx.fillStyle = 'rgba(110,240,110,0.85)'; ctx.fill();
    },
  },

  feral_martelador: {
    skin: '#9a7048', eye: '#f2c033', expr: 'grim', ears: 'goblin', body: 1.3, pants: '#4a3420', boots: '#2e2014',
    head: { rx: 30, ry: 26, y: -78 },
    hairBack: (ctx) => {
      poly(ctx, [[-30, -96], [-44, -84], [-36, -78], [-48, -66], [-34, -62], [-40, -48], [-24, -52], [0, -48], [24, -52], [40, -48], [34, -62], [48, -66], [36, -78], [44, -84], [30, -96]]);
      fs(ctx, lg(ctx, 0, -100, 0, -48, '#5a3a22', 0.25));
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, a.skin);
      poly(ctx, [[-20, -40], [20, -40], [18, -24], [-18, -24]]); fs(ctx, lg(ctx, 0, -40, 0, -24, '#6b4a2b'), 2.2);
      ctx.beginPath(); ctx.moveTo(-18, -52); ctx.lineTo(16, -28); ctx.lineTo(11, -26); ctx.lineTo(-19, -47); ctx.closePath(); fs(ctx, '#3a2a1a', 2);
      for (const x of [-10, 0, 10]) { poly(ctx, [[x - 3, -24], [x, -16], [x + 3, -24]]); fs(ctx, '#efe8d6', 1.4); }
    },
    faceExtra: (ctx) => {
      ell(ctx, 0, -66, 12, 8); fs(ctx, lg(ctx, 0, -74, 0, -58, '#c8a07a', 0.2), 2);
      ell(ctx, 0, -70, 4, 2.6); fs(ctx, '#2a1a12', 1);
      for (const x of [-6, 6]) { poly(ctx, [[x - 2.4, -60], [x, -54], [x + 2.4, -60]]); fs(ctx, '#fff6e0', 1.2); }
    },
    hairFront: (ctx) => {
      poly(ctx, [[-22, -100], [-14, -114], [-6, -102], [2, -116], [8, -102], [18, -112], [22, -98], [0, -92]]);
      fs(ctx, lg(ctx, 0, -116, 0, -92, '#5a3a22', 0.3));
    },
    hand: (ctx) => {
      capsule(ctx, 26, -10, 34, -78, 3, lg(ctx, 26, -10, 34, -78, '#7a4a26'), 2.2);
      ctx.beginPath(); ctx.roundRect(20, -98, 30, 22, 4); fs(ctx, lg(ctx, 20, -98, 50, -76, '#8d97a3', 0.4), 2.4);
      ctx.fillStyle = '#5a6068'; ctx.fillRect(22, -90, 26, 3);
    },
  },

  feral_lanceiro: {
    skin: '#b08458', eye: '#f2c033', expr: 'grim', ears: 'goblin', body: 1.2, pants: '#5a3a22', boots: '#2e2014',
    head: { rx: 28, ry: 25, y: -76 },
    hairBack: (ctx) => {
      poly(ctx, [[-28, -94], [-40, -80], [-32, -74], [-42, -60], [-26, -60], [0, -52], [26, -60], [42, -60], [32, -74], [40, -80], [28, -94]]);
      fs(ctx, lg(ctx, 0, -98, 0, -52, '#7a4a2a', 0.25));
    },
    backHand: (ctx) => {
      capsule(ctx, -24, 0, -30, -110, 2.4, lg(ctx, -24, 0, -30, -110, '#8a5a2b'), 2);
      poly(ctx, [[-30, -110], [-36, -112], [-30, -132], [-24, -112]]); fs(ctx, lg(ctx, -36, -132, -24, -110, '#cfd6de', 0.4), 2);
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, a.skin);
      poly(ctx, [[-18, -42], [18, -42], [16, -24], [-16, -24]]); fs(ctx, lg(ctx, 0, -42, 0, -24, '#8a2a22'), 2.2);
      ctx.beginPath(); ctx.roundRect(-17, -27, 34, 6, 3); fs(ctx, '#3a2a1a', 2);
    },
    faceExtra: (ctx) => {
      ell(ctx, 0, -64, 11, 7); fs(ctx, lg(ctx, 0, -72, 0, -56, '#d8b08a', 0.2), 2);
      ell(ctx, 0, -68, 3.6, 2.4); fs(ctx, '#2a1a12', 1);
    },
    hairFront: (ctx) => {
      poly(ctx, [[-20, -98], [-10, -110], [-2, -98], [6, -112], [12, -98], [22, -106], [22, -94], [0, -90]]);
      fs(ctx, lg(ctx, 0, -112, 0, -90, '#7a4a2a', 0.3));
    },
    hand: (ctx) => {
      capsule(ctx, 26, 4, 38, -104, 2.4, lg(ctx, 26, 0, 38, 0, '#8a5a2b'), 2);
      poly(ctx, [[38, -104], [32, -106], [40, -128], [45, -104]]); fs(ctx, lg(ctx, 32, -128, 45, -104, '#cfd6de', 0.4), 2);
    },
  },

  irma_dor: {
    skin: '#f2dcd2', eye: '#d42a2a', expr: 'grim', pants: '#3a1218', boots: '#1d0a0e', sleeve: '#7a1a2a',
    back: (ctx) => cape(ctx, '#5a0f1e', [[-14, -60], [-38, -46], [-46, -14], [-30, -2], [0, -8], [30, -2], [44, -14], [36, -46], [14, -60]]),
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#7a1a2a', 36);
      poly(ctx, [[-6, -54], [6, -54], [4, -20], [-4, -20]]); fs(ctx, lg(ctx, 0, -54, 0, -20, '#f2ece0', 0.2), 2);
      ctx.fillStyle = '#d9a93a'; ctx.fillRect(-1.5, -48, 3, 14); ctx.fillRect(-5, -44, 10, 3);
    },
    hairFront: (ctx) => {
      ctx.beginPath(); ctx.moveTo(-34, -40); ctx.quadraticCurveTo(-40, -112, 0, -112); ctx.quadraticCurveTo(40, -112, 34, -40);
      ctx.quadraticCurveTo(28, -60, 24, -76); ctx.quadraticCurveTo(0, -98, -24, -76); ctx.quadraticCurveTo(-28, -60, -34, -40); ctx.closePath();
      fs(ctx, lg(ctx, 0, -112, 0, -40, '#5a0f1e', 0.25));
      ctx.beginPath(); ctx.moveTo(-25, -78); ctx.quadraticCurveTo(0, -96, 25, -78); ctx.lineWidth = 4; ctx.strokeStyle = '#f2ece0'; ctx.stroke();
    },
    hand: (ctx) => blade(ctx, 24, -24, 48, -44, 3.6, '#e8c8c8'),
  },

  irma_prazer: {
    skin: '#f6dcd6', eye: '#e04a9a', expr: 'grin', pants: '#5a1a4a', boots: '#2a0a22', sleeve: '#c8448a',
    back: (ctx) => cape(ctx, '#8a1f6a', [[-14, -60], [-38, -46], [-46, -14], [-30, -2], [0, -8], [30, -2], [44, -14], [36, -46], [14, -60]]),
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#c8448a', 36);
      poly(ctx, [[-6, -54], [6, -54], [4, -20], [-4, -20]]); fs(ctx, lg(ctx, 0, -54, 0, -20, '#f2ece0', 0.2), 2);
      ell(ctx, 0, -40, 4, 4); fs(ctx, '#ff6ab0', 1.6);
    },
    hairFront: (ctx) => {
      ctx.beginPath(); ctx.moveTo(-34, -40); ctx.quadraticCurveTo(-40, -112, 0, -112); ctx.quadraticCurveTo(40, -112, 34, -40);
      ctx.quadraticCurveTo(28, -60, 24, -76); ctx.quadraticCurveTo(0, -98, -24, -76); ctx.quadraticCurveTo(-28, -60, -34, -40); ctx.closePath();
      fs(ctx, lg(ctx, 0, -112, 0, -40, '#8a1f6a', 0.3));
      ctx.beginPath(); ctx.moveTo(-25, -78); ctx.quadraticCurveTo(0, -96, 25, -78); ctx.lineWidth = 4; ctx.strokeStyle = '#ffd0ea'; ctx.stroke();
    },
    hand: (ctx) => {
      const g = ctx.createRadialGradient(32, -38, 1, 32, -38, 16);
      g.addColorStop(0, 'rgba(255,230,245,0.95)'); g.addColorStop(0.45, 'rgba(255,110,190,0.8)'); g.addColorStop(1, 'rgba(255,80,170,0)');
      ctx.fillStyle = g; ell(ctx, 32, -38, 16, 16); ctx.fill();
      ell(ctx, 32, -38, 6, 6); fs(ctx, '#ffb0dc', 1.6);
    },
  },

  troll: {
    skin: '#6a9a8a', eye: '#f2c033', expr: 'grim', body: 1.6, pants: '#5a4a2a', boots: '#3a2e1a', head: { rx: 34, ry: 28, y: -80 },
    torso: (ctx, a) => {
      torsoBase(ctx, a, a.skin, 34);
      ctx.strokeStyle = mix(a.skin, -0.3); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, -46); ctx.quadraticCurveTo(-4, -38, 0, -44); ctx.quadraticCurveTo(4, -38, 14, -46); ctx.stroke();
      poly(ctx, [[-24, -26], [24, -26], [22, -12], [-22, -12]]); fs(ctx, lg(ctx, 0, -26, 0, -12, '#7a5a32'), 2.2);
      ctx.fillStyle = '#9a2a2a'; ctx.fillRect(-23, -22, 46, 3);
    },
    faceExtra: (ctx) => {
      ell(ctx, 0, -68, 9, 7); fs(ctx, mix('#6a9a8a', -0.1), 2);
      for (const x of [-9, 9]) { poly(ctx, [[x - 3, -60], [x, -72], [x + 3, -60]]); fs(ctx, '#fff6e0', 1.4); }
    },
    hairFront: (ctx) => {
      poly(ctx, [[-14, -104], [-8, -116], [-2, -106], [4, -118], [10, -106], [16, -114], [18, -102], [0, -100]]);
      fs(ctx, lg(ctx, 0, -118, 0, -100, '#3a4a3a', 0.3));
    },
    hand: (ctx) => {
      capsule(ctx, 30, -14, 42, -78, 5, lg(ctx, 30, -14, 42, -78, '#e8dcc0', 0.2), 2.4);
      ell(ctx, 43, -82, 9, 9); fs(ctx, '#e8dcc0', 2.2); ell(ctx, 37, -86, 8, 8); fs(ctx, '#e8dcc0', 2.2);
    },
  },

  minotauro: {
    skin: '#8a5a32', eye: '#d42a2a', expr: 'grim', body: 1.5, pants: '#3a2a1a', boots: '#2a1e12', head: { rx: 30, ry: 28, y: -82 },
    hairBack: (ctx) => {
      for (const sd of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sd * 20, -100); ctx.quadraticCurveTo(sd * 52, -104, sd * 50, -132); ctx.quadraticCurveTo(sd * 40, -110, sd * 14, -92); ctx.closePath();
        fs(ctx, lg(ctx, 0, -132, 0, -92, '#efe2c4', 0.2), 2.4);
      }
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, a.skin, 34);
      poly(ctx, [[-22, -26], [22, -26], [20, -12], [-20, -12]]); fs(ctx, lg(ctx, 0, -26, 0, -12, '#4a2e1a'), 2.2);
      ell(ctx, -24, -52, 11, 8); fs(ctx, lg(ctx, -34, -60, -14, -44, '#9aa4ae', 0.35), 2.2);
    },
    faceExtra: (ctx) => {
      ell(ctx, 0, -66, 16, 11); fs(ctx, lg(ctx, 0, -76, 0, -56, '#b08060', 0.2), 2.2);
      ell(ctx, -6, -66, 2.6, 2); fs(ctx, '#2a1a12', 1); ell(ctx, 6, -66, 2.6, 2); fs(ctx, '#2a1a12', 1);
      ctx.beginPath(); ctx.arc(0, -58, 6, 0.2, Math.PI - 0.2); ctx.strokeStyle = '#d9a93a'; ctx.lineWidth = 2.6; ctx.stroke();
    },
    hairFront: (ctx) => { poly(ctx, [[-12, -104], [0, -112], [12, -104], [0, -98]]); fs(ctx, '#4a2e1a', 2); },
    hand: (ctx) => axe(ctx, 32, -22, -1.3, 70, true),
  },

  lorde_presas: {
    skin: '#e8ddd6', eye: '#e02020', expr: 'grin', body: 1.15, pants: '#1a1420', boots: '#0e0a12', sleeve: '#2a1a2e',
    back: (ctx) => {
      cape(ctx, '#8a0f1e', [[-16, -62], [-50, -50], [-62, -10], [-40, 2], [0, -6], [40, 2], [62, -10], [50, -50], [16, -62]]);
      poly(ctx, [[-22, -56], [-40, -100], [-18, -78]]); fs(ctx, '#5a0a14', 2.2);
      poly(ctx, [[22, -56], [40, -100], [18, -78]]); fs(ctx, '#5a0a14', 2.2);
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#2a1a2e', 34);
      poly(ctx, [[-8, -56], [8, -56], [0, -40]]); fs(ctx, '#f2ece0', 1.8);
      ell(ctx, 0, -38, 4, 4); fs(ctx, '#e02020', 1.6);
      ctx.beginPath(); ctx.roundRect(-16, -28, 32, 6, 3); fs(ctx, '#d9a93a', 2);
    },
    faceExtra: (ctx) => {
      for (const x of [-4, 4]) { poly(ctx, [[x - 1.6, -61], [x, -55], [x + 1.6, -61]]); fs(ctx, '#ffffff', 1); }
    },
    hairFront: (ctx) => {
      ctx.beginPath(); ctx.moveTo(-31, -70); ctx.quadraticCurveTo(-36, -110, 0, -112); ctx.quadraticCurveTo(36, -110, 31, -70);
      ctx.quadraticCurveTo(26, -90, 12, -92); ctx.lineTo(0, -80); ctx.lineTo(-12, -92); ctx.quadraticCurveTo(-26, -90, -31, -70); ctx.closePath();
      fs(ctx, lg(ctx, 0, -112, 0, -70, '#1a1420', 0.35));
      strand(ctx, [[-16, -104], [0, -108], [16, -104]], '#5a4a6a', 2);
    },
    hand: (ctx) => sword(ctx, 26, -26, -0.9, 60, '#8a0f1e', '#e6edf4'),
  },

  // -------------------------------------------------------------------------
  // MONSTROS
  // -------------------------------------------------------------------------
  orc: {
    skin: '#6aa236', eye: '#d42a1f', expr: 'grim', body: 1.35, pants: '#5a3a22', boots: '#3a2414', head: { rx: 31, ry: 27, y: -78 },
    backHand: (ctx) => axe(ctx, -28, -26, -1.95, 46, true),
    torso: (ctx, a) => {
      torsoBase(ctx, a, a.skin);
      poly(ctx, [[-20, -40], [20, -40], [18, -26], [-18, -26]]); fs(ctx, lg(ctx, 0, -40, 0, -26, '#b8322a'), 2.2);
      ell(ctx, -24, -50, 11, 8); fs(ctx, lg(ctx, -34, -58, -14, -42, '#c8382c', 0.3), 2.4);
      ell(ctx, 24, -50, 11, 8); fs(ctx, lg(ctx, 14, -58, 34, -42, '#c8382c', 0.3), 2.4);
      for (const x of [-26, 22]) { poly(ctx, [[x, -56], [x + 2, -66], [x + 5, -56]]); fs(ctx, '#efe8d6', 1.6); }
      ctx.beginPath(); ctx.roundRect(-20, -28, 40, 7, 3); fs(ctx, '#3a2414', 2.2);
      for (const x of [-10, 0, 10]) { ell(ctx, x, -20, 4, 3.6); fs(ctx, '#f2ece0', 1.6); }
    },
    faceExtra: (ctx) => {
      for (const x of [-7, 7]) { poly(ctx, [[x - 2.6, -60], [x, -70], [x + 2.6, -60]]); fs(ctx, '#fff6e0', 1.4); }
    },
    hairFront: (ctx) => {
      ell(ctx, 0, -106, 7, 5); fs(ctx, '#24201c', 2);
      ctx.beginPath(); ctx.moveTo(4, -108); ctx.quadraticCurveTo(28, -128, 40, -104); ctx.quadraticCurveTo(26, -112, 4, -102); ctx.closePath(); fs(ctx, lg(ctx, 0, -128, 40, -102, '#24201c', 0.35), 2);
      ctx.fillStyle = '#d9d0bd'; ctx.fillRect(-4, -104, 8, 4);
    },
    hand: (ctx) => axe(ctx, 30, -26, -1.1, 46, true),
  },

  goblin: {
    skin: '#8cbf3f', eye: '#d42a1f', expr: 'grim', ears: 'goblin', short: true, body: 0.9, pants: '#463019', boots: '#2e1f10', sleeve: '#6b4a2b',
    head: { rx: 26, ry: 23, y: -66 },
    backHand: (ctx) => {
      ctx.beginPath(); ctx.arc(-6, -44, 30, Math.PI * 0.62, Math.PI * 1.38);
      ctx.lineWidth = 6.5; ctx.strokeStyle = OUT; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = '#8a5a2b'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-16, -72); ctx.lineTo(-16, -16); ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = 1.2; ctx.stroke();
    },
    torso: (ctx, a) => {
      torsoBase(ctx, a, '#6b4a2b', 26);
      ctx.beginPath(); ctx.roundRect(-13, -26, 26, 5, 2); fs(ctx, '#b0322a', 2);
    },
    hairFront: (ctx) => {
      // capuz
      ctx.beginPath();
      ctx.moveTo(-28, -60); ctx.quadraticCurveTo(-32, -98, 0, -100); ctx.quadraticCurveTo(32, -98, 28, -60);
      ctx.quadraticCurveTo(22, -80, 0, -82); ctx.quadraticCurveTo(-22, -80, -28, -60); ctx.closePath();
      fs(ctx, lg(ctx, 0, -100, 0, -60, '#6b4a2b', 0.25));
    },
    hand: (ctx) => { ctx.beginPath(); ctx.moveTo(18, -22); ctx.lineTo(36, -36); ctx.strokeStyle = OUT; ctx.lineWidth = 3.6; ctx.stroke(); ctx.strokeStyle = '#c9a46a'; ctx.lineWidth = 1.8; ctx.stroke(); },
  },
};

/** Escala de cada personagem no mapa (altura relativa). */
const CHAR_SCALE: Record<string, number> = {
  grom: 1.3, maya: 1.2, zazu: 1.22, vapor: 1.2, espetado: 1.18, diva: 1.22, casacaverde: 1.2,
  hobsbawm: 1.2, johan: 1.22, kanga: 1.2, escarlate: 1.2, seth: 1.2, orc: 1.45, goblin: 1.08,
  feral_martelador: 1.4, feral_lanceiro: 1.35, irma_dor: 1.25, irma_prazer: 1.25, troll: 1.85, minotauro: 1.8, lorde_presas: 1.5,
};
/** Personagens com sprite PNG: o tamanho de cada um (Orc, Ferais, Troll, Minotauro…) já vem no PNG (tools/build_sprites.py). */
export function charScale(id: string) { id = artId(id); return hasSprite(id) ? 1.2 : CHAR_SCALE[id] ?? 1.2; }
/** 'orc4' -> 'orc' (o número é o nível do Monstro). */
export function artId(id: string) { const b = id.replace(/\d+$/, ''); return b === 'capitao_orc' && !images.has('capitao_orc_se') ? 'orc' : b; }

// ---------------------------------------------------------------------------
// Sprites: PNGs em public/sprites/<id>_<dir>.png (listados em manifest.json) ou desenho procedural.
// Direções isométricas: se ↘ (frente-direita), sw ↙ (frente-esquerda), nw ↖ (costas-esquerda), ne ↗ (costas-direita).
// ---------------------------------------------------------------------------
export type Dir = 'se' | 'sw' | 'nw' | 'ne';
const SW = 200, SH = 180, FX = 100, FY = 168, RES = 2.5;
/** Unidades do mapa por pixel dos PNGs: o CORPO de um Herói comum tem 400 px (tools/build_sprites.py), então todos
 *  ficam na mesma proporção — armas e braços levantados não encolhem ninguém, e o Orc continua maior que o Goblin. */
const PX_UNITS = 140 / 400;
/** Linha dos pés e topo do corpo (fração da altura do PNG), por id_dir. */
const meta = new Map<string, { feet: number; top: number; face?: number[] }>();

interface Spr { cv: HTMLCanvasElement; w: number; h: number; fx: number; fy: number; head: [number, number, number, number] }
const cache = new Map<string, Spr>();
const images = new Map<string, HTMLImageElement>(); // chave: id_dir
let artVersion = 0;
export function getArtVersion() { return artVersion; }

/** Carrega os PNGs listados em public/sprites/manifest.json (chame uma vez no início). */
export async function preloadArt(onEach?: () => void, expect?: (n: number) => void): Promise<void> {
  expect?.(PORTRAITS.length);
  const faces = Promise.all(PORTRAITS.map(id => new Promise<void>(resolve => {
    const img = new Image();
    img.onload = () => { portraits.set(id, img); onEach?.(); resolve(); };
    img.onerror = () => { onEach?.(); resolve(); };
    img.src = `${import.meta.env.BASE_URL}portraits/${id}.webp`;
  })));
  await loadSprites();
  await faces;
  artVersion++;
}

/** Retratos (quadradinhos) dos personagens: public/portraits/<id>.webp (tools/build_portraits.py). */
const portraits = new Map<string, HTMLImageElement>();

type Entry = string[] | { dirs: string[]; ext?: string; lazy?: boolean; feet?: Record<string, number>; top?: Record<string, number>; face?: Record<string, number[]> };
let manifest: Record<string, Entry> = {};
const lazyLoading = new Map<string, Promise<void>>();

/** Carrega a arte (sprites das 4 direções e, se faltar, o retrato) dos personagens que ainda não foram carregados.
 *  Nada de sprite é carregado no início: cada personagem só vem quando entra numa partida ou aparece numa carta. */
export function ensureArt(ids: string[], onEach?: () => void, expect?: (n: number) => void): Promise<void> {
  const jobs: Promise<void>[] = [];
  const fresh: Promise<void>[] = [];
  for (const id of new Set(ids.map(artId))) {
    const e = manifest[id];
    if (!e) continue;
    let p = lazyLoading.get(id);
    if (!p) {
      // só de frente (esquerda e direita): as poses de costas não são usadas nem carregadas
      const all = Array.isArray(e) ? e : e.dirs;
      const front = all.filter(d => d === 'se' || d === 'sw');
      const dirs = front.length ? front : all;
      const face = !portraits.has(id) && !Array.isArray(e) && !!e.lazy;
      expect?.(dirs.length + (face ? 1 : 0));
      p = Promise.all([
        ...dirs.map(d => new Promise<void>(resolve => {
          if (!Array.isArray(e)) meta.set(`${id}_${d}`, { feet: e.feet?.[d] ?? 1, top: e.top?.[d] ?? 0, face: e.face?.[d] });
          const img = new Image();
          img.onload = () => { images.set(`${id}_${d}`, img); onEach?.(); resolve(); };
          img.onerror = () => { onEach?.(); resolve(); };
          img.src = `${import.meta.env.BASE_URL}sprites/${id}_${d}.${Array.isArray(e) ? 'png' : e.ext ?? 'png'}`;
        })),
        ...(face ? [new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => { portraits.set(id, img); onEach?.(); resolve(); };
          img.onerror = () => { onEach?.(); resolve(); };
          img.src = `${import.meta.env.BASE_URL}portraits/${id}.webp`;
        })] : []),
      ]).then(() => undefined);
      lazyLoading.set(id, p);
      fresh.push(p);
    }
    jobs.push(p);
  }
  if (fresh.length) Promise.all(fresh).then(() => { cache.clear(); artVersion++; });
  return Promise.all(jobs).then(() => undefined);
}

/** Só o manifesto: os sprites vêm depois, sob demanda (ensureArt). */
async function loadSprites(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}sprites/manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return;
    manifest = (await res.json()) as Record<string, Entry>;
  } catch { /* sem manifesto: só arte procedural */ }
}

export function hasArt(id: string) { return artId(id) in ARTS; }
export function hasSprite(id: string) { id = artId(id); return ['se', 'sw', 'nw', 'ne'].some(d => images.has(`${id}_${d}`)); }

/** Imagem para a direção pedida (com espelhamento quando só existe a direção oposta). */
function pickImage(id: string, dir: Dir): { img: HTMLImageElement; mirror: boolean; key: string } | null {
  const direct = images.get(`${id}_${dir}`);
  if (direct) return { img: direct, mirror: false, key: `${id}_${dir}` };
  const opposite: Record<Dir, Dir> = { se: 'sw', sw: 'se', nw: 'ne', ne: 'nw' };
  const o = images.get(`${id}_${opposite[dir]}`);
  if (o) return { img: o, mirror: true, key: `${id}_${opposite[dir]}` };
  const any = images.get(`${id}_se`) ?? images.get(`${id}_sw`);
  return any ? { img: any, mirror: dir === 'sw' || dir === 'nw', key: images.has(`${id}_se`) ? `${id}_se` : `${id}_sw` } : null;
}

function sprite(id: string, dir: Dir, tint: boolean): Spr {
  id = artId(id);
  // os personagens só olham para a esquerda ou a direita (sem pose de costas)
  dir = dir === 'ne' ? 'se' : dir === 'nw' ? 'sw' : dir;
  const k = `${id}|${dir}|${tint}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const pick = pickImage(id, dir);
  let spr: Spr;
  if (pick) {
    const { img, mirror } = pick;
    const mt = meta.get(pick.key);
    // escala fixa por pixel (manifesto novo); manifesto antigo: imagem inteira com 160 unidades
    const h = mt ? img.height * PX_UNITS : 160, w = (img.width / img.height) * h;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * RES);
    cv.height = Math.ceil(h * RES);
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    if (mirror) { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    // caixa da cabeça para retratos: a partir do topo do CORPO (não da ponta de uma arma), centrada na massa do topo
    const full = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let top = 0;
    if (mt) top = Math.round(mt.top * cv.height);
    else findTop: for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 3) {
      if (full[(y * cv.width + x) * 4 + 3] > 128) { top = y; break findTop; }
    }
    const feetPx = (mt?.feet ?? 1) * cv.height;
    const side = (feetPx - top) * 0.46;
    let sx = 0, n = 0;
    for (let y = top; y < top + side * 0.7; y += 2) for (let x = 0; x < cv.width; x += 2) {
      if (full[(y * cv.width + x) * 4 + 3] > 128) { sx += x; n++; }
    }
    let cx = n ? sx / n : cv.width / 2;
    let head: [number, number, number, number] = [cx - side / 2, Math.max(0, top - side * 0.04), side, side];
    // rosto marcado no manifesto (tools/build_sprites.py FACE): centro x/y e lado, em fração do PNG
    const f = mt?.face;
    if (f) {
      const fside = f[2] * cv.height;
      cx = (mirror ? 1 - f[0] : f[0]) * cv.width;
      head = [cx - fside / 2, f[1] * cv.height - fside / 2, fside, fside];
    }
    spr = { cv, w, h, fx: w / 2, fy: (mt?.feet ?? 1) * h, head };
  } else {
    const cv = document.createElement('canvas');
    cv.width = SW * RES;
    cv.height = SH * RES;
    const ctx = cv.getContext('2d')!;
    ctx.scale(RES, RES);
    ctx.translate(FX, FY);
    if (dir === 'sw') ctx.scale(-1, 1);
    drawFigure(ctx, ARTS[id] ?? ARTS.orc);
    const hy = ARTS[id]?.head?.y ?? -76;
    spr = { cv, w: SW, h: SH, fx: FX, fy: FY, head: [(FX - 46) * RES, (FY + hy - 52) * RES, 92 * RES, 92 * RES] };
  }
  if (tint) {
    const ctx = spr.cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,40,30,0.6)';
    ctx.fillRect(0, 0, spr.cv.width, spr.cv.height);
  }
  cache.set(k, spr);
  return spr;
}

export interface CharOpts {
  /** Direção isométrica. Se omitida, usa flip (true = olhando para a esquerda). */
  dir?: Dir;
  flip: boolean;
  t: number;
  hurt: number;
  alpha: number;
  stunned: boolean;
  lunge: number;
  scale: number;
  shadow?: boolean;
}

/** Desenha o personagem com os pés em (0,0). */
export function drawCharacter(ctx: C, id: string, o: CharOpts) {
  const dir: Dir = o.dir ?? (o.flip ? 'sw' : 'se');
  ctx.save();
  ctx.globalAlpha *= o.alpha;
  if (o.shadow !== false) {
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26 * o.scale / 0.66);
    g.addColorStop(0, 'rgba(0,0,0,0.38)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save(); ctx.scale(1, 0.4); ctx.beginPath(); ctx.arc(0, 0, 30 * o.scale / 0.66, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  const breathe = 1 + Math.sin(o.t * 3.2) * 0.014;
  ctx.translate(o.lunge, 0);
  ctx.scale(o.scale, o.scale * breathe);
  if (o.stunned) ctx.rotate(-0.2);
  const s = sprite(id, dir, false);
  ctx.drawImage(s.cv, -s.fx, -s.fy, s.w, s.h);
  if (o.hurt > 0) {
    ctx.globalAlpha *= Math.min(1, o.hurt);
    const t = sprite(id, dir, true);
    ctx.drawImage(t.cv, -t.fx, -t.fy, t.w, t.h);
  }
  ctx.restore();
}

/** Retrato (rosto) em um canvas quadrado. */
export function drawFace(canvas: HTMLCanvasElement, id: string, bg: string) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, mix(bg, 0.3));
  grd.addColorStop(1, mix(bg, -0.4));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  const face = portraits.get(artId(id)) ?? portraits.get(id.replace(/\d+$/, ''));
  if (face) { ctx.drawImage(face, 0, 0, w, h); return; }
  const s = sprite(id, 'se', false);
  const [sx, sy, sw, sh] = s.head;
  ctx.drawImage(s.cv, sx, sy, sw, sh, 0, 0, w, h);
}


const boxes = new WeakMap<HTMLCanvasElement, [number, number, number, number]>();
/** Retângulo (em pixels do canvas do sprite) que contém os pixels visíveis. */
function opaqueBox(s: Spr): [number, number, number, number] {
  const hit = boxes.get(s.cv);
  if (hit) return hit;
  const { width: W, height: H } = s.cv;
  const d = s.cv.getContext('2d')!.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const box: [number, number, number, number] = x1 < 0 ? [0, 0, W, H] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
  boxes.set(s.cv, box);
  return box;
}

/** Corpo inteiro (galeria / cartas / tela de batalha). */
/** Ajuste da figura no cartão: `scale` multiplica o tamanho; `wide` deixa a figura passar da largura (a borda corta a arma). */
const CARD_FIT: Record<string, { scale: number; wide: number }> = {
  goblin: { scale: 0.8, wide: 1 },
  capitao_orc: { scale: 1, wide: 1.45 },
};

export function drawFull(canvas: HTMLCanvasElement, id: string, flip = false, bg?: string) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (bg) {
    const grd = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h / 2, w * 0.7);
    grd.addColorStop(0, mix(bg, 0.35));
    grd.addColorStop(1, mix(bg, -0.35));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.save();
  const s = sprite(id, flip ? 'sw' : 'se', false);
  if (hasSprite(id)) {
    // recorta pela área visível: imagens com muita margem (ex.: orcs) ficariam pequenas
    const [bx, by, bw, bh] = opaqueBox(s);
    // ajuste por figura: o Goblin é baixinho; o Capitão Orc segura a espada aberta (largo) e ficaria pequeno
    const fit = CARD_FIT[id] ?? CARD_FIT[id.replace(/\d+$/, '')] ?? { scale: 1, wide: 1 }; // todos os níveis usam o ajuste da figura
    const k = Math.min((h - 14) / bh, (w - 10) * fit.wide / bw) * fit.scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s.cv, bx, by, bw, bh, (w - bw * k) / 2, h - 6 - bh * k, bw * k, bh * k);
    ctx.restore();
    return;
  }
  ctx.translate(w / 2, h - 10);
  const sc = (h - 16) / 140;
  drawCharacter(ctx, id, { dir: flip ? 'sw' : 'se', flip, t: 0.3, hurt: 0, alpha: 1, stunned: false, lunge: 0, scale: sc });
  ctx.restore();
}

/** Alma do Lorde Presas: espírito azul-claro, meio transparente e brilhando. */
export const SOUL_FILTER = 'grayscale(1) sepia(1) hue-rotate(150deg) saturate(2.6) brightness(1.3) drop-shadow(0 0 10px rgba(120,230,255,0.9))';
