// Projeção isométrica 2:1 (como o Dofus). Cada Espaço do Arcadia Quest = 1 losango grande.
export const TW = 540; // largura do losango de um Espaço (cabe 2 personagens + marcadores + itens caídos)
export const TH = 270; // altura do losango
export const CLIFF = 70; // altura do platô (borda de terra)

export interface Pt { x: number; y: number }

export function g2s(gx: number, gy: number, z = 0): Pt {
  return { x: (gx - gy) * (TW / 2), y: (gx + gy) * (TH / 2) - z };
}

export function s2g(x: number, y: number): { gx: number; gy: number } {
  const a = x / (TW / 2);
  const b = y / (TH / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

export function diamondPath(ctx: CanvasRenderingContext2D, gx: number, gy: number, w = 1, h = 1, z = 0) {
  const p0 = g2s(gx, gy, z), p1 = g2s(gx + w, gy, z), p2 = g2s(gx + w, gy + h, z), p3 = g2s(gx, gy + h, z);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
}

/** Caixa isométrica com base [x0,x1]×[y0,y1] (grade), de z0 até z0+h. */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number, z0: number, h: number,
  top: string | CanvasGradient, sideL: string, sideR: string, stroke?: string,
) {
  const P = (x: number, y: number, z: number) => g2s(x, y, z);
  // face +y (esquerda-baixo)
  let a = P(x0, y1, z0), b = P(x1, y1, z0), c = P(x1, y1, z0 + h), d = P(x0, y1, z0 + h);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  ctx.fillStyle = sideL; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  // face +x (direita-baixo)
  a = P(x1, y0, z0); b = P(x1, y1, z0); c = P(x1, y1, z0 + h); d = P(x1, y0, z0 + h);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  ctx.fillStyle = sideR; ctx.fill();
  if (stroke) ctx.stroke();
  // topo
  diamondPath(ctx, x0, y0, x1 - x0, y1 - y0, z0 + h);
  ctx.fillStyle = top; ctx.fill();
  if (stroke) ctx.stroke();
}

/** Hash determinístico para variações de textura. */
export function hash(a: number, b: number, s = 0): number {
  let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 10000) / 10000;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r); g = f(g); b = f(b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
