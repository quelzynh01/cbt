import { g2s, isoBox, shade } from './iso';

// Arte procedural em Canvas no estilo chibi/cartoon (Dofus / Arcadia Quest).
// Tudo vetorial para ficar nítido em qualquer zoom; trocável por sprites no futuro.

type Ctx = CanvasRenderingContext2D;

export interface Look {
  skin: string;
  hair: string;
  hairStyle: 'barbarian' | 'blonde' | 'monk' | 'orc' | 'goblin' | 'ninja';
  outfit: string;
  outfit2: string;
  accent: string;
  weapon: 'axe' | 'staff' | 'sling' | 'axes' | 'bow' | 'daggers';
  scale: number;
  ears?: boolean;
  tusks?: boolean;
  brow: 'angry' | 'cute' | 'mean';
}

export const LOOKS: Record<string, Look> = {
  grom: { skin: '#e8a776', hair: '#9b3b1e', hairStyle: 'barbarian', outfit: '#7a4a26', outfit2: '#5a3218', accent: '#2f5fb0', weapon: 'axe', scale: 1.3, brow: 'angry' },
  maya: { skin: '#f6d2b8', hair: '#f4cf57', hairStyle: 'blonde', outfit: '#2aa3a8', outfit2: '#1c6f86', accent: '#9fe8ff', weapon: 'staff', scale: 1.2, brow: 'cute' },
  vapor: { skin: '#eac7a4', hair: '#26223a', hairStyle: 'ninja', outfit: '#3f3a63', outfit2: '#29263f', accent: '#c9302c', weapon: 'daggers', scale: 1.2, brow: 'angry' },
  zazu: { skin: '#b57446', hair: '#2b1d16', hairStyle: 'monk', outfit: '#e2832b', outfit2: '#a8521a', accent: '#c9302c', weapon: 'sling', scale: 1.22, brow: 'angry' },
  orc: { skin: '#6aa236', hair: '#24201c', hairStyle: 'orc', outfit: '#b8322a', outfit2: '#6e4024', accent: '#d9d0bd', weapon: 'axes', scale: 1.45, tusks: true, brow: 'mean' },
  goblin: { skin: '#8cbf3f', hair: '#3a2a1e', hairStyle: 'goblin', outfit: '#6b4a2b', outfit2: '#463019', accent: '#b0322a', weapon: 'bow', scale: 1.05, ears: true, brow: 'mean' },
};

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const OUT = '#2a1a12';

function drawWeapon(ctx: Ctx, L: Look, side: 'back' | 'front', t: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (L.weapon === 'axe' && side === 'front') {
    ctx.translate(15, -26);
    ctx.rotate(-0.5 + Math.sin(t * 2) * 0.05);
    ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -30); ctx.stroke();
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.quadraticCurveTo(16, -36, 15, -18); ctx.quadraticCurveTo(10, -16, 0, -20); ctx.closePath();
    ctx.fillStyle = '#d7dde3'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.quadraticCurveTo(-12, -34, -11, -20); ctx.quadraticCurveTo(-7, -19, 0, -21); ctx.closePath();
    ctx.fillStyle = '#b9c2cb'; ctx.fill(); ctx.stroke();
  }
  if (L.weapon === 'staff' && side === 'front') {
    ctx.translate(14, -18);
    ctx.rotate(0.12);
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -40); ctx.stroke();
    ctx.strokeStyle = '#7b5bb0'; ctx.lineWidth = 3; ctx.stroke();
    const glow = 0.6 + Math.sin(t * 4) * 0.25;
    const grd = ctx.createRadialGradient(0, -46, 1, 0, -46, 16);
    grd.addColorStop(0, `rgba(220,250,255,${glow})`); grd.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, -46, 16, 0, Math.PI * 2); ctx.fill();
    ellipse(ctx, 0, -46, 6.5, 7.5, '#9fe8ff', OUT, 2);
    ellipse(ctx, -2, -48, 2, 2.5, '#ffffff');
  }
  if (L.weapon === 'sling' && side === 'front') {
    ctx.translate(15, -22);
    ctx.rotate(-0.3);
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -8); ctx.moveTo(0, -8); ctx.lineTo(-6, -16); ctx.moveTo(0, -8); ctx.lineTo(6, -16); ctx.stroke();
    ctx.strokeStyle = '#9a6a37'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#e8d7b0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, -16); ctx.quadraticCurveTo(0, -6 + Math.sin(t * 3) * 2, 6, -16); ctx.stroke();
  }
  if (L.weapon === 'axes') {
    const drawAxe = (x: number, rot: number, light: string) => {
      ctx.save(); ctx.translate(x, -26); ctx.rotate(rot);
      ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -24); ctx.stroke();
      ctx.strokeStyle = '#6b4424'; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.quadraticCurveTo(18, -30, 17, -10); ctx.quadraticCurveTo(10, -12, 0, -14); ctx.closePath();
      ctx.fillStyle = light; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    };
    if (side === 'back') drawAxe(-17, -2.6 + Math.sin(t * 2) * 0.06, '#aab3bb');
    else drawAxe(18, -0.45 + Math.sin(t * 2 + 1) * 0.06, '#d7dde3');
  }
  if (L.weapon === 'daggers') {
    const dagger = (x: number, y: number, rot: number) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = '#5a3a1a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
      ctx.fillRect(-1.8, 0, 3.6, 8); ctx.strokeRect(-1.8, 0, 3.6, 8);
      ctx.fillStyle = '#c9a43a'; ctx.fillRect(-5, -1.5, 10, 3);
      ctx.beginPath(); ctx.moveTo(-2.6, -1.5); ctx.lineTo(0, -19); ctx.lineTo(2.6, -1.5); ctx.closePath();
      ctx.fillStyle = '#e3e9ef'; ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    if (side === 'front') dagger(15, -16, 0.5 + Math.sin(t * 2.2) * 0.06);
    else dagger(-16, -18, -2.4 + Math.sin(t * 2.2 + 1) * 0.06);
  }
  if (L.weapon === 'bow' && side === 'back') {
    ctx.translate(-14, -30);
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(8, 0, 20, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#efe6cf'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(-8, 12); ctx.stroke();
  }
  ctx.restore();
}

function drawHair(ctx: Ctx, L: Look, hy: number, r: number, layer: 'back' | 'front', t: number) {
  ctx.fillStyle = L.hair;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  if (L.hairStyle === 'barbarian') {
    if (layer === 'back') {
      ctx.beginPath();
      ctx.moveTo(-r - 2, hy - 4);
      ctx.quadraticCurveTo(-r - 10, hy + 22, -r + 2, hy + 30 + Math.sin(t * 3) * 1.5);
      ctx.lineTo(r - 2, hy + 30);
      ctx.quadraticCurveTo(r + 10, hy + 18, r + 2, hy - 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-r - 1, hy + 2);
      ctx.quadraticCurveTo(-r + 2, hy - r - 6, 2, hy - r - 4);
      ctx.quadraticCurveTo(r + 4, hy - r - 2, r + 1, hy + 2);
      ctx.quadraticCurveTo(r - 4, hy - 8, 4, hy - 10);
      ctx.quadraticCurveTo(-6, hy - 6, -r - 1, hy + 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = L.accent; // faixa na testa
      ctx.beginPath(); ctx.ellipse(0, hy - 7, r - 1, 3.2, 0, Math.PI, 0); ctx.lineTo(r - 1, hy - 4); ctx.ellipse(0, hy - 4, r - 1, 3.2, 0, 0, Math.PI, true); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } else if (L.hairStyle === 'blonde') {
    if (layer === 'back') {
      ctx.beginPath();
      ctx.moveTo(-r - 3, hy - 2);
      ctx.quadraticCurveTo(-r - 8, hy + 26, -r + 6 + Math.sin(t * 2.5) * 2, hy + 36);
      ctx.lineTo(r - 2, hy + 34);
      ctx.quadraticCurveTo(r + 8, hy + 18, r + 3, hy - 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-r - 2, hy + 6);
      ctx.quadraticCurveTo(-r - 2, hy - r - 6, 0, hy - r - 5);
      ctx.quadraticCurveTo(r + 3, hy - r - 5, r + 2, hy + 6);
      ctx.quadraticCurveTo(r - 2, hy - 6, 8, hy - 9);
      ctx.quadraticCurveTo(2, hy - 3, -4, hy - 10);
      ctx.quadraticCurveTo(-r + 2, hy - 6, -r - 2, hy + 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ellipse(ctx, -5, hy - r + 1, 4, 2, shade(L.hair, 0.4));
      // tiara
      ctx.fillStyle = '#9fe8ff'; ctx.beginPath(); ctx.arc(0, hy - r + 3, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else if (L.hairStyle === 'monk') {
    if (layer === 'front') {
      ctx.beginPath();
      ctx.moveTo(-r, hy - 2);
      ctx.quadraticCurveTo(-r + 1, hy - r - 2, 0, hy - r - 2);
      ctx.quadraticCurveTo(r - 1, hy - r - 2, r, hy - 2);
      ctx.quadraticCurveTo(4, hy - 10, -r, hy - 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // coque
      ellipse(ctx, 2, hy - r - 6, 6, 5, L.hair, OUT);
      ctx.strokeStyle = L.accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-3, hy - r - 2); ctx.lineTo(7, hy - r - 2); ctx.stroke();
    }
  } else if (L.hairStyle === 'orc') {
    if (layer === 'front') {
      ellipse(ctx, 0, hy - r - 3, 5, 4, L.hair, OUT);
      ctx.beginPath(); ctx.moveTo(2, hy - r - 5);
      ctx.quadraticCurveTo(18, hy - r - 18 + Math.sin(t * 3) * 2, 26, hy - r - 4);
      ctx.quadraticCurveTo(16, hy - r - 10, 2, hy - r - 1);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = L.accent; ctx.fillRect(-3, hy - r - 2, 6, 3);
    }
  } else if (L.hairStyle === 'ninja') {
    if (layer === 'back') {
      // pontas do cachecol voando
      ctx.fillStyle = L.accent;
      const w = Math.sin(t * 4) * 3;
      ctx.beginPath(); ctx.moveTo(-6, hy + 12); ctx.quadraticCurveTo(-22, hy + 14 + w, -30, hy + 8 + w); ctx.lineTo(-27, hy + 16 + w); ctx.quadraticCurveTo(-18, hy + 20, -4, hy + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      // capuz
      ctx.fillStyle = L.outfit;
      ctx.beginPath();
      ctx.moveTo(-r - 2, hy + 6);
      ctx.quadraticCurveTo(-r - 3, hy - r - 5, 0, hy - r - 6);
      ctx.quadraticCurveTo(r + 3, hy - r - 5, r + 2, hy + 6);
      ctx.quadraticCurveTo(r - 3, hy - 6, 0, hy - 7);
      ctx.quadraticCurveTo(-r + 3, hy - 6, -r - 2, hy + 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // máscara cobrindo a boca
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, hy, r, r * 0.95, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = L.outfit2; ctx.fillRect(-r, hy + 4, r * 2, r);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-r + 1, hy + 4); ctx.lineTo(r - 1, hy + 4); ctx.stroke();
      // cachecol vermelho
      ctx.fillStyle = L.accent; ctx.beginPath(); ctx.ellipse(0, hy + r - 2, r - 3, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  } else if (L.hairStyle === 'goblin') {
    if (layer === 'front') {
      // capuz
      ctx.fillStyle = L.outfit;
      ctx.beginPath();
      ctx.moveTo(-r - 2, hy + 4);
      ctx.quadraticCurveTo(-r - 2, hy - r - 4, 0, hy - r - 6);
      ctx.quadraticCurveTo(r + 2, hy - r - 4, r + 2, hy + 4);
      ctx.quadraticCurveTo(r - 4, hy - 8, 0, hy - 9);
      ctx.quadraticCurveTo(-r + 4, hy - 8, -r - 2, hy + 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
}

export interface DrawOpts {
  flip: boolean;
  t: number;
  hurt: number; // 0..1 flash vermelho
  alpha: number;
  stunned: boolean;
  lunge: number; // deslocamento de ataque (px)
  selected?: boolean;
}

/** Personagem chibi com os pés em (0,0). */
export function drawChibi(ctx: Ctx, L: Look, o: DrawOpts) {
  ctx.save();
  ctx.globalAlpha *= o.alpha;
  const bob = Math.sin(o.t * 3.2) * 1.4;
  ctx.scale(L.scale, L.scale);
  // sombra
  ellipse(ctx, 0, 0, 17, 6.5, 'rgba(0,0,0,0.28)');
  ctx.translate(o.lunge, 0);
  if (o.flip) ctx.scale(-1, 1);
  if (o.stunned) ctx.rotate(-0.22);
  const big = L.hairStyle === 'orc';
  const r = big ? 17 : L.hairStyle === 'goblin' ? 15 : 16;
  const hy = -44 + bob - (big ? 4 : 0);

  drawWeapon(ctx, L, 'back', o.t);
  drawHair(ctx, L, hy, r, 'back', o.t);

  // pernas
  ctx.lineWidth = 2; ctx.strokeStyle = OUT;
  for (const sx of [-6, 6]) {
    rrect(ctx, sx - 4, -14, 8, 12, 3);
    ctx.fillStyle = L.outfit2; ctx.fill(); ctx.stroke();
    ellipse(ctx, sx + (sx > 0 ? 1 : -1), -2, 5.5, 3.5, '#3b2616', OUT, 1.6);
  }
  // corpo
  const bw = big ? 30 : 24;
  rrect(ctx, -bw / 2, -32 + bob * 0.5, bw, 22, 9);
  ctx.fillStyle = L.hairStyle === 'barbarian' ? L.skin : L.outfit; ctx.fill(); ctx.stroke();
  if (L.hairStyle === 'barbarian') {
    // tanga + cinto
    rrect(ctx, -bw / 2, -18, bw, 7, 3); ctx.fillStyle = L.outfit; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0b84a'; ctx.fillRect(-3, -17, 6, 5);
  } else if (L.hairStyle === 'blonde') {
    ctx.fillStyle = L.outfit2; ctx.beginPath(); ctx.moveTo(-bw / 2, -26); ctx.quadraticCurveTo(-bw / 2 - 8, -4, -bw / 2 + 2, -4); ctx.lineTo(-bw / 2 + 4, -26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2e6c9'; ctx.fillRect(-4, -28 + bob * 0.5, 8, 14);
  } else if (L.hairStyle === 'monk') {
    ctx.strokeStyle = L.outfit2; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-6, -30); ctx.lineTo(4, -14); ctx.stroke();
    ctx.fillStyle = L.accent; ctx.fillRect(-bw / 2 + 1, -18, bw - 2, 4);
  } else if (L.hairStyle === 'orc') {
    // ombreiras
    ellipse(ctx, -bw / 2, -28 + bob * 0.5, 8, 6, L.outfit, OUT);
    ellipse(ctx, bw / 2, -28 + bob * 0.5, 8, 6, L.outfit, OUT);
    ctx.fillStyle = L.accent; ctx.beginPath(); ctx.arc(-bw / 2, -31, 2, 0, 7); ctx.arc(bw / 2, -31, 2, 0, 7); ctx.fill();
    ctx.fillStyle = L.outfit2; ctx.fillRect(-bw / 2 + 2, -18, bw - 4, 5);
    // caveirinhas
    for (const sx of [-6, 0, 6]) ellipse(ctx, sx, -14, 2.6, 2.3, '#efe8d6', OUT, 1);
  } else if (L.hairStyle === 'ninja') {
    ctx.strokeStyle = L.outfit2; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-bw / 2 + 2, -28); ctx.lineTo(bw / 2 - 2, -16); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.fillStyle = '#2a1a12'; ctx.fillRect(-bw / 2 + 1, -18, bw - 2, 4);
    ctx.fillStyle = '#c9a43a'; ctx.fillRect(-2, -18, 4, 4);
  } else if (L.hairStyle === 'goblin') {
    ctx.fillStyle = L.accent; ctx.fillRect(-bw / 2 + 2, -20, bw - 4, 3);
  }
  // braços
  const armC = L.hairStyle === 'blonde' || L.hairStyle === 'goblin' || L.hairStyle === 'ninja' ? L.outfit : L.skin;
  ellipse(ctx, -bw / 2 - 2, -22 + bob * 0.5, 4.5, 7, armC, OUT);
  ellipse(ctx, bw / 2 + 2, -22 + bob * 0.5, 4.5, 7, armC, OUT);
  ellipse(ctx, -bw / 2 - 2, -16 + bob * 0.5, 3.5, 3.5, L.skin, OUT, 1.5);

  // cabeça
  if (L.ears) {
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * (r - 3), hy - 2); ctx.lineTo(s * (r + 14), hy - 10); ctx.lineTo(s * (r - 1), hy + 6); ctx.closePath();
      ctx.fillStyle = L.skin; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  ellipse(ctx, 0, hy, r, r * 0.95, L.skin, OUT, 2.2);
  ellipse(ctx, -r * 0.45, hy + 5, 3.5, 2, 'rgba(255,120,120,0.35)');
  ellipse(ctx, r * 0.45, hy + 5, 3.5, 2, 'rgba(255,120,120,0.35)');
  // olhos
  const ey = hy + 1;
  const eyeR = L.brow === 'cute' ? 4.2 : 3.6;
  for (const sx of [-6, 6]) {
    if (o.stunned) {
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(sx - 3, ey - 3); ctx.lineTo(sx + 3, ey + 3); ctx.moveTo(sx + 3, ey - 3); ctx.lineTo(sx - 3, ey + 3); ctx.stroke();
      continue;
    }
    ellipse(ctx, sx, ey, eyeR, eyeR + 1, '#ffffff', OUT, 1.4);
    ellipse(ctx, sx + 1, ey + 0.5, eyeR * 0.6, eyeR * 0.75, L.brow === 'mean' ? '#c41f1f' : L.hairStyle === 'blonde' ? '#1aa0b8' : '#3a2516');
    ellipse(ctx, sx + 2, ey - 1, 1.1, 1.1, '#ffffff');
  }
  // sobrancelhas
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  if (L.brow !== 'cute') {
    ctx.beginPath(); ctx.moveTo(-10, ey - 7); ctx.lineTo(-3, ey - 4); ctx.moveTo(10, ey - 7); ctx.lineTo(3, ey - 4); ctx.stroke();
  }
  // boca
  ctx.lineWidth = 1.8;
  if (L.brow === 'cute') { ctx.beginPath(); ctx.arc(0, ey + 7, 3, 0.2, Math.PI - 0.2); ctx.stroke(); }
  else {
    ctx.beginPath(); ctx.moveTo(-5, ey + 9); ctx.quadraticCurveTo(0, ey + 6, 5, ey + 9); ctx.stroke();
    if (L.tusks) {
      ctx.fillStyle = '#fff6e0';
      for (const sx of [-4, 4]) { ctx.beginPath(); ctx.moveTo(sx - 1.6, ey + 9); ctx.lineTo(sx, ey + 3); ctx.lineTo(sx + 1.6, ey + 9); ctx.fill(); ctx.lineWidth = 1; ctx.stroke(); }
    }
  }
  drawHair(ctx, L, hy, r, 'front', o.t);
  drawWeapon(ctx, L, 'front', o.t);

  if (o.hurt > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,40,40,${o.hurt * 0.6})`;
    ctx.fillRect(-40, -90, 80, 95);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  if (o.stunned) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const a = o.t * 3 + (i * Math.PI * 2) / 3;
      star(ctx, Math.cos(a) * 14, -76 * L.scale + Math.sin(a) * 4, 4, '#ffe14d');
    }
    ctx.restore();
  }
}

export function star(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#6b4a00';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Retrato (rosto) para a timeline / ficha. */
export function drawPortrait(canvas: HTMLCanvasElement, lookId: string, bg: string) {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const grd = ctx.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, shade(bg, 0.25));
  grd.addColorStop(1, shade(bg, -0.35));
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  const L = LOOKS[lookId];
  const sc = (w / 64) * (L.hairStyle === 'orc' ? 1.25 : 1.55) / L.scale;
  ctx.translate(w / 2, h * (L.hairStyle === 'orc' ? 1.32 : 1.36));
  ctx.scale(sc, sc);
  drawChibi(ctx, L, { flip: false, t: 0.3, hurt: 0, alpha: 1, stunned: false, lunge: 0 });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Props / objetos do cenário
// ---------------------------------------------------------------------------

export function drawMushroom(ctx: Ctx, x: number, y: number, s: number, cap = '#d8452f') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ellipse(ctx, 0, 0, 14, 5, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = '#f3e7cf'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  rrect(ctx, -6, -26, 12, 26, 5); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -26, 22, 16, 0, Math.PI, 0); ctx.quadraticCurveTo(0, -18, -22, -26); ctx.closePath();
  ctx.fillStyle = cap; ctx.fill(); ctx.stroke();
  for (const [px, py, pr] of [[-10, -32, 4], [4, -36, 3.5], [12, -28, 3], [-2, -27, 2.5]] as const) ellipse(ctx, px, py, pr, pr * 0.8, '#fff7ea');
  ctx.restore();
}

export function drawBush(ctx: Ctx, x: number, y: number, s: number, c = '#5f9e2e', seed = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ellipse(ctx, 0, 2, 26, 9, 'rgba(0,0,0,0.25)');
  const blobs = [[-14, -10, 13], [12, -11, 14], [0, -20, 16], [-4, -6, 14], [8, -4, 12]];
  for (const [bx, by, br] of blobs) ellipse(ctx, bx, by, br, br * 0.85, shade(c, -0.15), OUT, 2);
  for (const [bx, by, br] of blobs) ellipse(ctx, bx - 2, by - 3, br * 0.7, br * 0.55, c);
  for (const [bx, by, br] of blobs) ellipse(ctx, bx - 4, by - 6, br * 0.3, br * 0.22, shade(c, 0.35));
  if (seed % 2) for (const [fx, fy] of [[-8, -18], [10, -16], [2, -8]]) { ellipse(ctx, fx, fy, 2.4, 2.4, '#fff4f4'); ellipse(ctx, fx, fy, 1, 1, '#f2c033'); }
  ctx.restore();
}

export function drawTree(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ellipse(ctx, 0, 2, 34, 12, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = '#7a4f2a'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-6, -30, -3, -50); ctx.lineTo(5, -50); ctx.quadraticCurveTo(6, -24, 10, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  const blobs = [[-22, -60, 22], [20, -62, 22], [0, -80, 26], [-8, -52, 18], [12, -50, 18]];
  for (const [bx, by, br] of blobs) ellipse(ctx, bx, by, br, br * 0.85, '#4d8a26', OUT, 2);
  for (const [bx, by, br] of blobs) ellipse(ctx, bx - 3, by - 4, br * 0.7, br * 0.55, '#78b83a');
  for (const [bx, by, br] of blobs) ellipse(ctx, bx - 6, by - 8, br * 0.3, br * 0.22, '#b5e06a');
  ctx.restore();
}

export function drawCrates(ctx: Ctx, gx: number, gy: number, z: number) {
  isoBox(ctx, gx - 0.22, gy - 0.18, gx + 0.08, gy + 0.12, z, 24, '#c99a5b', '#9a6c35', '#7d5426', OUT);
  isoBox(ctx, gx + 0.06, gy + 0.02, gx + 0.3, gy + 0.26, z, 18, '#d4a766', '#a7773d', '#875d2c', OUT);
  // barril
  const p = g2s(gx - 0.18, gy + 0.22, z);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = '#8a5a2b'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  rrect(ctx, -9, -24, 18, 24, 6); ctx.fill(); ctx.stroke();
  ellipse(ctx, 0, -24, 9, 3.5, '#b07a3f', OUT, 1.5);
  ctx.strokeStyle = '#3c3c3c'; ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.moveTo(-9, -17); ctx.lineTo(9, -17); ctx.stroke();
  ctx.restore();
}

export function drawChestToken(ctx: Ctx, x: number, y: number, t: number, label?: string) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2.5) * 1.2);
  ellipse(ctx, 0, 2, 13, 5, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = '#6a3fa0'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  rrect(ctx, -11, -14, 22, 14, 3); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-11, -14); ctx.quadraticCurveTo(0, -24, 11, -14); ctx.closePath(); ctx.fillStyle = '#8556c4'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f0c043'; ctx.fillRect(-2, -15, 4, 6);
  ctx.font = 'bold 15px "Baloo 2", sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = '#2a0f45';
  const txt = label ?? '?';
  ctx.strokeText(txt, 0, -26); ctx.fillStyle = '#f8e7ff'; ctx.fillText(txt, 0, -26);
  ctx.restore();
}

export function drawGem(ctx: Ctx, x: number, y: number, t: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 0, 0, 14, 6, 'rgba(0,0,0,0.3)');
  // pedestal
  ctx.fillStyle = '#b8b0a0'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  rrect(ctx, -9, -10, 18, 10, 3); ctx.fill(); ctx.stroke();
  const fy = -26 + Math.sin(t * 2) * 3;
  const glow = ctx.createRadialGradient(0, fy, 2, 0, fy, 26);
  glow.addColorStop(0, color + 'cc'); glow.addColorStop(1, color + '00');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, fy, 26, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, fy - 12); ctx.lineTo(8, fy); ctx.lineTo(0, fy + 12); ctx.lineTo(-8, fy); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = OUT; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, fy - 12); ctx.lineTo(-3, fy); ctx.lineTo(0, fy + 12); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
  ctx.restore();
}

export function drawPortal(ctx: Ctx, cx: number, cy: number, t: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.5);
  const grd = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
  grd.addColorStop(0, 'rgba(210,255,250,0.95)');
  grd.addColorStop(0.5, 'rgba(70,200,200,0.7)');
  grd.addColorStop(1, 'rgba(30,120,160,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = ['#e6fffb', '#7fe0d6', '#2f9fb8'][i];
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 3; a += 0.15) {
      const rr = 4 + a * 3.6 + i * 3;
      const ang = a + t * 2.2 + i * 2.1;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawManhole(ctx: Ctx, cx: number, cy: number, label?: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.5);
  ellipse(ctx, 0, 0, 28, 28, '#5d5547', OUT, 3);
  ellipse(ctx, 0, 0, 22, 22, '#7a705f', '#4a4237', 2);
  ctx.strokeStyle = '#4a4237'; ctx.lineWidth = 3;
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-18, i * 7); ctx.lineTo(18, i * 7); ctx.stroke(); }
  ctx.strokeStyle = '#e0b43a'; ctx.lineWidth = 3; ellipse(ctx, 0, 0, 30, 30, 'rgba(0,0,0,0)', '#d9a92c', 3);
  ctx.restore();
  if (label) {
    ctx.font = 'bold 11px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(label, cx, cy + 4); ctx.fillStyle = '#ffe9a8'; ctx.fillText(label, cx, cy + 4);
  }
}
