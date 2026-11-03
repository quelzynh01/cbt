import { CARDS } from '../engine/cards';
import { CARD_ART } from '../ui/cardArt';

// Animações dos ataques dos Heróis: magias (o desenho da carta em movimento) e a arma de verdade na mão (a arte da carta).
type Ctx = CanvasRenderingContext2D;
export interface Pt { x: number; y: number }

/** Efeito solto no mapa. `ms`: tempo desde o começo, já na velocidade 1 (o renderer desconta a velocidade do jogo). */
export interface Fx { t0: number; ms: number; tag?: string; draw(ctx: Ctx, ms: number, tt: number): void }

export type Spell = 'laser' | 'drain' | 'wind' | 'skulls' | 'meteors';
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Número pseudoaleatório fixo por índice (o efeito não treme de um quadro para o outro). */
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 11.7) * 43758.5453; return x - Math.floor(x); };

export function spellOf(cardName: string): Spell | null {
  const id = Object.values(CARDS).find(c => c.name === cardName)?.id ?? '';
  if (id.startsWith('raio_nova')) return 'laser';
  if (id.startsWith('drenar_vida')) return 'drain';
  if (id.startsWith('rajada_vento')) return 'wind';
  if (/^odio\d?$/.test(id)) return 'skulls';
  if (id.startsWith('incinerar')) return 'meteors';
  return null;
}

/** Quantos elementos a magia mostra: os acertos, no máximo os dados da carta (errou: 1, que é a tentativa). */
export function spellCount(cardName: string, hits: number | undefined): number {
  const dice = Object.values(CARDS).find(c => c.name === cardName)?.dice ?? 3;
  return Math.max(1, Math.min(dice, hits ?? dice));
}

/** Raio Nova: rajadas de laser, uma por elemento. Golpe no último. */
export function laserFx(from: Pt, tos: Pt[], n: number): { fx: Omit<Fx, 't0'>; hit: number } {
  const gap = 170, life = 320, start = 130;
  return { hit: start + (n - 1) * gap + 70, fx: { ms: start + (n - 1) * gap + life, draw(ctx, ms, tt) {
    // energia juntando na mão
    const charge = clamp(ms / start) * clamp((start + (n - 1) * gap + 120 - ms) / 120);
    glow(ctx, from, 16 + 10 * charge, `rgba(255,120,235,${0.8 * charge})`);
    for (let i = 0; i < n; i++) {
      const k = (ms - start - i * gap) / life;
      if (k < 0 || k >= 1) continue;
      const w = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      for (const to of tos) {
        const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1;
        const off = n > 1 ? (i - (n - 1) / 2) * 9 : 0;
        const a = { x: from.x - (dy / d) * off * 0.4, y: from.y + (dx / d) * off * 0.4 }, b = { x: to.x - (dy / d) * off, y: to.y + (dx / d) * off };
        beam(ctx, a, b, 20 * w, `rgba(214,40,190,${0.55 * w})`, '#ff4fd8');
        beam(ctx, a, b, 11 * w, `rgba(255,150,225,${0.9 * w})`);
        beam(ctx, a, b, 4.5 * w, `rgba(255,250,190,${w})`);
        glow(ctx, b, 20 * w + 3 * Math.sin(tt * 40), `rgba(255,235,160,${w})`);
      }
    }
  } } };
}

function beam(ctx: Ctx, a: Pt, b: Pt, w: number, col: string, shadow?: string) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, w);
  if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = 18; }
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
}

function glow(ctx: Ctx, p: Pt, r: number, col: string) {
  if (r <= 0) return;
  ctx.save();
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Drenar Vida: fios roxos prendem o alvo e as gotas de vida vão até quem atacou, que brilha ao receber. */
export function drainFx(from: Pt, to: Pt, n: number): { fx: Omit<Fx, 't0'>; hit: number } {
  const start = 260, gap = 130, fly = 560;
  const ms = start + (n - 1) * gap + fly + 220;
  const dx = from.x - to.x, dy = from.y - to.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  const at = (k: number, wave: number) => { const s = Math.sin(k * Math.PI); return { x: lerp(to.x, from.x, k) + nx * wave * s, y: lerp(to.y, from.y, k) + ny * wave * s - s * 26 }; };
  return { hit: start, fx: { ms, draw(ctx, t, tt) {
    const a = clamp(t / 200) * clamp((ms - t) / 260);
    // fios de energia
    ctx.save();
    ctx.lineCap = 'round'; ctx.shadowColor = '#b14dff'; ctx.shadowBlur = 14;
    for (let f = 0; f < 3; f++) {
      ctx.strokeStyle = f === 1 ? `rgba(120,235,255,${0.75 * a})` : `rgba(190,90,255,${0.8 * a})`;
      ctx.lineWidth = f === 1 ? 2.5 : 4;
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const k = i / 20, p = at(k, Math.sin(k * 9 + tt * 11 + f * 2) * 16 + (f - 1) * 15);
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.restore();
    // o alvo perdendo vida
    glow(ctx, to, 46, `rgba(190,60,255,${0.5 * a})`);
    // as gotas de vida
    let got = 0;
    for (let i = 0; i < n; i++) {
      const k = (t - start - i * gap) / fly;
      if (k >= 1) got = Math.max(got, 1 - (k - 1) * 3);
      if (k < 0 || k >= 1) continue;
      const e = k * k * (3 - 2 * k);
      for (let j = 4; j >= 0; j--) {
        const p = at(Math.max(0, e - j * 0.035), (i % 2 ? -1 : 1) * 30);
        ctx.fillStyle = j ? `rgba(255,70,110,${0.28 * (1 - j / 5)})` : '#ff5d7e';
        ctx.beginPath(); ctx.arc(p.x, p.y, 14 - j * 1.5, 0, Math.PI * 2); ctx.fill();
      }
      const p = at(e, (i % 2 ? -1 : 1) * 30);
      ctx.save(); ctx.shadowColor = '#ff3355'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffd7df';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    // quem atacou recebendo
    if (got > 0) glow(ctx, from, 44 + 22 * got, `rgba(120,255,170,${0.65 * got})`);
  } } };
}

/** Rajada de Vento: o ar corre até o alvo e vira um tornado; os destroços giram em volta dele. */
export function windFx(from: Pt, foot: Pt, n: number): { fx: Omit<Fx, 't0'>; hit: number } {
  const ms = 1250, born = 260;
  return { hit: 620, fx: { ms, draw(ctx, t, tt) {
    // correntes de ar
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const k = (t - i * 45) / 420;
      if (k < 0 || k > 1) continue;
      const wob = (rnd(i) - 0.5) * 60;
      const head = clamp(k * 1.3), tail = clamp(k * 1.3 - 0.45);
      const P = (q: number) => ({ x: lerp(from.x, foot.x, q), y: lerp(from.y, foot.y - 50, q) + wob * Math.sin(q * Math.PI) });
      ctx.strokeStyle = `rgba(225,250,235,${0.8 * (1 - k)})`; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let q = 0; q <= 8; q++) { const p = P(lerp(tail, head, q / 8)); if (q) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
      ctx.stroke();
    }
    ctx.restore();
    const k = (t - born) / (ms - born);
    if (k < 0) return;
    const a = clamp(k / 0.18) * clamp((1 - k) / 0.25);
    const H = 235, rise = clamp(k / 0.3);
    // o funil: anéis cada vez mais largos, de baixo para cima
    ctx.save();
    ctx.translate(foot.x, foot.y);
    const rings = 11;
    for (let i = 0; i < rings; i++) {
      const q = i / (rings - 1);
      const y = -q * H * rise, r = 14 + q * q * 104;
      const sway = Math.sin(tt * 7 + q * 4) * 10 * q;
      ctx.strokeStyle = `rgba(${i % 2 ? '206,236,216' : '150,196,170'},${(0.75 - q * 0.25) * a})`;
      ctx.lineWidth = 10 - q * 4;
      const spin = tt * 15 + i;
      ctx.beginPath(); ctx.ellipse(sway, y, r, r * 0.3, 0, spin, spin + Math.PI * 1.6); ctx.stroke();
    }
    // destroços: um por elemento, mais a poeira no chão
    for (let i = 0; i < n + 3; i++) {
      const q = (rnd(i) + k * 0.8) % 1, ang = tt * 12 + i * 2.3;
      const r = 20 + q * q * 104;
      const x = Math.cos(ang) * r, y = -q * H * rise + Math.sin(ang) * r * 0.3;
      ctx.globalAlpha = a;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang * 2);
      ctx.fillStyle = i < n ? '#3d4a40' : '#a9b39b';
      if (i < n) { ctx.fillRect(-9, -2, 18, 4); ctx.fillRect(-3, -6, 4, 12); } else ctx.fillRect(-3, -3, 6, 6);
      ctx.restore();
    }
    ctx.restore();
  } } };
}

/** Ódio: uma caveira em chamas por elemento surge em volta de quem atacou e voa até o alvo. */
export function skullsFx(from: Pt, to: Pt, n: number): { fx: Omit<Fx, 't0'>; hit: number } {
  const gap = 140, wait = 380, fly = 520, ms = wait + (n - 1) * gap + fly + 120;
  const home = (i: number) => { const ang = -Math.PI / 2 + (i - (n - 1) / 2) * 0.8; return { x: from.x + Math.cos(ang) * 62, y: from.y - 20 + Math.sin(ang) * 54 }; };
  return { hit: wait + (n - 1) * gap + fly - 20, fx: { ms, draw(ctx, t, tt) {
    for (let i = 0; i < n; i++) {
      const h = home(i), born = i * 50, go = wait + i * gap;
      if (t < born) continue;
      const k = clamp((t - go) / fly);
      if (t > go + fly) { glow(ctx, to, 54 * (1 - clamp((t - go - fly) / 160)), 'rgba(255,90,60,0.8)'); continue; }
      const e = k * k;
      const pos = (q: number) => ({ x: lerp(h.x, to.x, q), y: lerp(h.y, to.y, q) - Math.sin(q * Math.PI) * 50 + Math.sin(tt * 9 + i) * 3 * (1 - q) });
      const p = pos(e);
      // rastro de fogo roxo
      for (let j = 6; j >= 1; j--) {
        const q = pos(Math.max(0, e - j * 0.04));
        ctx.fillStyle = `rgba(${j < 3 ? '255,150,60' : '170,70,230'},${0.32 * (1 - j / 7) * (k > 0 ? 1 : 0.4)})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, 25 - j * 2, 0, Math.PI * 2); ctx.fill();
      }
      drawSkull(ctx, p.x, p.y, clamp((t - born) / 200), to.x < h.x);
    }
  } } };
}

function drawSkull(ctx: Ctx, x: number, y: number, a: number, left: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(left ? -1.7 : 1.7, 1.7);
  ctx.globalAlpha *= a;
  ctx.shadowColor = '#ff5a2a'; ctx.shadowBlur = 16;
  ctx.fillStyle = '#ee6a5c'; ctx.strokeStyle = '#6a1420'; ctx.lineWidth = 2;
  // cabeça e mandíbula
  ctx.beginPath(); ctx.arc(0, -3, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-8, 6, 16, 11, 3); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  // olhos e nariz
  ctx.fillStyle = '#2b0a14';
  ctx.beginPath(); ctx.ellipse(-4, -3, 5, 6, 0, 0, Math.PI * 2); ctx.ellipse(8, -3, 4.5, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(0, 7); ctx.lineTo(4, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe14d';
  ctx.beginPath(); ctx.arc(-3, -3, 2, 0, Math.PI * 2); ctx.arc(8, -3, 1.8, 0, Math.PI * 2); ctx.fill();
  // dentes
  ctx.strokeStyle = '#2b0a14'; ctx.lineWidth = 1.4;
  ctx.beginPath(); for (const d of [-3, 1, 5]) { ctx.moveTo(d, 10); ctx.lineTo(d, 16); } ctx.stroke();
  ctx.restore();
}

/** Incinerar: uma bola de fogo por elemento cai do céu, em diagonal, nos alvos (revezando entre eles). */
export function meteorsFx(tos: Pt[], n: number): { fx: Omit<Fx, 't0'>; hit: number } {
  const gap = 150, fall = 420, boom = 340, count = Math.max(n, tos.length);
  const ms = 100 + (count - 1) * gap + fall + boom;
  return { hit: 100 + (count - 1) * gap + fall, fx: { ms, draw(ctx, t, tt) {
    // o céu escurece um pouco em volta dos alvos
    const dim = clamp(t / 200) * clamp((ms - t) / 240);
    for (const to of tos) glow(ctx, { x: to.x, y: to.y - 30 }, 170, `rgba(120,20,0,${0.34 * dim})`);
    for (let i = 0; i < count; i++) {
      const to = tos[i % tos.length];
      const land = { x: to.x + (rnd(i) - 0.5) * 44, y: to.y + (rnd(i + 9) - 0.5) * 20 };
      const go = 100 + i * gap, k = (t - go) / fall;
      if (k < 0) continue;
      if (k >= 1) { burst(ctx, land, (t - go - fall) / boom, tt + i); continue; }
      const e = k * k;
      const sky = { x: land.x + 250, y: land.y - 470 };
      const p = { x: lerp(sky.x, land.x, e), y: lerp(sky.y, land.y, e) };
      const ang = Math.atan2(sky.y - land.y, sky.x - land.x);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, 230, 0);
      g.addColorStop(0, 'rgba(255,225,120,0.95)'); g.addColorStop(0.3, 'rgba(255,120,20,0.8)'); g.addColorStop(1, 'rgba(180,20,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.quadraticCurveTo(90, -16, 230, 0); ctx.quadraticCurveTo(90, 16, 0, 24); ctx.arc(0, 0, 24, Math.PI / 2, -Math.PI / 2); ctx.fill();
      ctx.restore();
      ctx.save(); ctx.shadowColor = '#ff7a1a'; ctx.shadowBlur = 24; ctx.fillStyle = '#fff2b0';
      ctx.beginPath(); ctx.arc(p.x, p.y, 19, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  } } };
}

function burst(ctx: Ctx, p: Pt, k: number, seed: number) {
  if (k >= 1) return;
  const a = 1 - k;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.save(); ctx.scale(1, 0.5);
  ctx.strokeStyle = `rgba(255,170,60,${a})`; ctx.lineWidth = 7 * a + 1;
  ctx.beginPath(); ctx.arc(0, 0, 18 + 62 * k, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  glow(ctx, { x: 0, y: -14 }, 58 * (1 - k * 0.4), `rgba(255,190,70,${a})`);
  for (let i = 0; i < 7; i++) {
    const ang = -Math.PI * (rnd(i + Math.floor(seed)) * 0.9 + 0.05), r = 66 * k * (0.5 + rnd(i) * 0.6);
    ctx.fillStyle = `rgba(255,${120 + i * 15},40,${a})`;
    ctx.beginPath(); ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r * 0.8 - 8, 4 * a + 1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---- arma na mão: a arte da carta (fundo transparente)

interface Art { img: HTMLImageElement; grip: [number, number]; head: [number, number]; forward?: number }
export interface Held { art: Art; t0: number; dur: number; ranged: boolean; aim: number }

const images = new Map<string, HTMLImageElement>();
function image(name: string) {
  let im = images.get(name);
  if (!im) { im = new Image(); im.src = `${import.meta.env.BASE_URL}cards/${name}.webp`; images.set(name, im); }
  return im;
}
const BOWS: Record<string, number> = { arco_crescente: -135, tiro_certeiro: -135, espinho: 180 };

function artFor(id: string, group: string): Art | null {
  // sem arte recortada (a Foice tem fundo): usa uma da mesma família
  const fallback = group === 'Machado' ? 'sangradora' : group === 'Martelo' ? 'esmaga_orcs' : group === 'Arco' ? 'arco_crescente' : 'espada_enferrujada';
  const a = CARD_ART[id];
  const img = image(a?.kind === 'icon' ? a.img : fallback);
  if (group === 'Machado' || group === 'Martelo') return { img, grip: [0.06, 0.93], head: [0.92, 0.1] };
  if (group === 'Espada' || group === 'Exótica') return { img, grip: [0.9, 0.08], head: [0.03, 0.96] };
  if (group === 'Lança') return { img, grip: [0.78, 0.2], head: [0.02, 0.97] };
  if (group === 'Arco') return { img, grip: [0.5, 0.5], head: [0.5, 0.5], forward: BOWS[id] ?? -45 };
  return null;
}

/** Preparar a arma da carta. `null` = não é arma (magia, bomba…). */
export function heldWeapon(cardName: string, t0: number, dur: number, aim: number): Held | null {
  const d = Object.values(CARDS).find(c => c.name === cardName);
  const art = d && !d.magic ? artFor(d.id, d.group) : null;
  return art ? { art, t0, dur, ranged: d!.attackType === 'ranged', aim } : null;
}

export function preloadWeapons() {
  for (const d of Object.values(CARDS)) {
    if (d.attackType && !d.magic) artFor(d.id, d.group);
    else if (d.kind !== 'attack' && CARD_ART[d.id]) image(CARD_ART[d.id].img);
  }
}

/** Item em ação: a arte da carta surge em cima do Herói, com um brilho, e sobe sumindo. */
export function itemFx(card: string, slot: number, where: () => Pt | null): Omit<Fx, 't0'> {
  const ms = 1150, art = CARD_ART[card], img = art ? image(art.img) : null, name = CARDS[card]?.name ?? '';
  return { ms, draw(ctx, t) {
    const p = where();
    if (!p) return;
    const pop = clamp(t / 140), a = clamp((ms - t) / 280);
    const s = pop < 1 ? pop * (1.25 - 0.25 * pop) : 1;
    const R = 40;
    const x = p.x + (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * (R * 2 + 10), y = p.y - 178 - clamp(t / ms) * 22;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(x, y); ctx.scale(s, s);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, R + 16);
    g.addColorStop(0, 'rgba(255,236,170,0.75)'); g.addColorStop(0.65, 'rgba(255,200,90,0.3)'); g.addColorStop(1, 'rgba(255,190,70,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R + 16, 0, Math.PI * 2); ctx.fill();
    if (img?.complete && img.naturalWidth) {
      const k = Math.min((R * 2) / img.naturalWidth, (R * 2) / img.naturalHeight);
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      if (art.kind === 'fill') {
        // ilustração com fundo: num círculo
        const c = Math.max((R * 2) / img.naturalWidth, (R * 2) / img.naturalHeight);
        ctx.save();
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, (-img.naturalWidth * c) / 2, (-img.naturalHeight * c) / 2, img.naturalWidth * c, img.naturalHeight * c);
        ctx.restore();
        ctx.strokeStyle = '#f0c243'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.shadowBlur = 0;
      }
    }
    ctx.font = '800 15px "Baloo 2", sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(30,18,8,0.9)'; ctx.strokeText(name, 0, R + 18);
    ctx.fillStyle = '#ffe9a8'; ctx.fillText(name, 0, R + 18);
    ctx.restore();
  } };
}

/** Duração da explosão de quando a Fúria acende (ms). */
export const FURY_BURST = 1100;
type Rgb = [number, number, number];
const rgbOf = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** k > 0 clareia, k < 0 escurece. */
const shade = (c: Rgb, k: number): Rgb => c.map(v => Math.round(k >= 0 ? lerp(v, 255, k) : lerp(v, 0, -k))) as Rgb;
const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Coração do bárbaro: duas batidas fortes e uma pausa (0 a 1). */
export function furyBeat(tt: number): number {
  const p = tt % 1.15;
  return Math.max(Math.exp(-(((p - 0.06) / 0.07) ** 2)), 0.7 * Math.exp(-(((p - 0.3) / 0.08) ** 2)));
}

/** 0 a 1: força da explosão, `ms` depois de a Fúria acender. */
const furyFlare = (ms: number) => (ms < 0 || ms >= FURY_BURST ? 0 : ms < 120 ? ms / 120 : 1 - (ms - 120) / (FURY_BURST - 120));

/** O corpo do bárbaro em Fúria: fica maior e pulsa com o coração; treme quando a Fúria acende. */
export function furyBody(tt: number, ms: number): { scale: number; x: number; y: number; glow: string } {
  const b = furyBeat(tt), f = furyFlare(ms);
  const shake = f * 4;
  return {
    scale: 1.1 + 0.03 * b + 0.12 * f,
    x: Math.sin(tt * 71) * shake, y: Math.cos(tt * 57) * shake * 0.6,
    glow: `saturate(1.35) contrast(1.08) brightness(${(1.02 + 0.1 * b + 0.25 * f).toFixed(2)})`,
  };
}

/** Lasca de rocha arrancada do chão pela Fúria (cada uma com o seu formato). */
function rockChip(ctx: Ctx, x: number, y: number, r: number, rot: number, edge: Rgb, seed: number) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd(seed + i) * 0.7, q = r * (0.6 + 0.6 * rnd(seed + i + 7));
    if (i) ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q * 0.75); else ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q * 0.75);
  }
  ctx.closePath();
  ctx.fillStyle = '#3f352e'; ctx.fill();
  ctx.strokeStyle = rgba(edge, 0.8); ctx.lineWidth = Math.max(0.8, r * 0.16); ctx.stroke();
  ctx.restore();
}

/**
 * Fúria de Combate: brilho na cor da Guilda em volta do corpo, pedras flutuando e fagulhas subindo (nada desenhado no chão).
 * `ms`: tempo desde que a Fúria acendeu (explosão com rugido nos primeiros instantes).
 */
export function drawFuryAura(ctx: Ctx, sc: number, tt: number, color: string, front: boolean, ms: number) {
  const base = rgbOf(color), hot = shade(base, 0.72), deep = shade(base, -0.45), white: Rgb = [255, 250, 225];
  const b = furyBeat(tt), f = furyFlare(ms);
  ctx.save();
  if (!front) {
    // pedras arrancadas do chão, tremendo dos dois lados do corpo; na explosão, voam para fora
    for (let i = 0; i < 6; i++) {
      const k = (tt * 0.24 + rnd(i + 50)) % 1, side = i % 2 ? 1 : -1, out = 1 + 1.1 * f;
      const x = (side * (50 + 28 * rnd(i)) * out + Math.sin(tt * 37 + i) * 0.7) * sc, y = (-4 - k * (64 + 40 * rnd(i + 3)) - 26 * f) * sc;
      ctx.globalAlpha = Math.min(1, 3 * Math.sin(k * Math.PI));
      rockChip(ctx, x, y, (2.8 + 3 * rnd(i + 8)) * sc, tt * (0.8 + rnd(i)) + i, hot, i * 13);
    }
    ctx.globalAlpha = 1;
    // brilho em volta do corpo
    ctx.save();
    ctx.translate(0, -66 * sc); ctx.scale(0.72, 1);
    glow(ctx, { x: 0, y: 0 }, (100 + 12 * b + 34 * f) * sc, rgba(base, 0.42));
    ctx.restore();
  } else {
    // fagulhas riscando para cima, pelos lados
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const k = (tt * (0.5 + rnd(i) * 0.6) + rnd(i + 40)) % 1;
      const x = ((i % 2 ? 1 : -1) * (34 + 34 * rnd(i + 60)) + Math.sin(tt * 5 + i) * 5) * sc, y = (4 - k * (120 + 50 * rnd(i + 80))) * sc, len = (3 + 4 * rnd(i + 5)) * sc;
      ctx.strokeStyle = rgba(i % 4 ? hot : white, 0.9 * Math.sin(k * Math.PI));
      ctx.lineWidth = (1 + rnd(i + 15)) * sc;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
    }
  }
  // clarão da explosão
  if (front && f > 0) glow(ctx, { x: 0, y: -50 * sc }, 130 * sc, rgba(white, 0.35 * f));
  ctx.restore();
}

/** Duração das correntes do Seth (ms). */
export const CHAIN_PULL = 1700;
/** Quanto o alvo já afundou (0 a 1), aos trancos: as correntes prendem, puxam, ele resiste, puxam de vez. */
const pullDepth = (k: number) => k < 0.26 ? 0 : k < 0.5 ? 0.3 * clamp((k - 0.26) / 0.12) : k < 0.62 ? 0.3 : lerp(0.3, 1, clamp((k - 0.62) / 0.3) ** 2);

/** Quantos pixels (já em escala) o corpo desce e o tremor enquanto as correntes puxam. */
export function chainSink(k: number, sc: number, tt: number): { y: number; x: number } {
  return { y: pullDepth(k) * 190 * sc, x: k < 0.92 && k > 0.2 ? Math.sin(tt * 63) * 2.2 * sc : 0 };
}

/** Recorte do corpo: só aparece acima do chão e dentro do buraco. */
export function chainClip(ctx: Ctx, sc: number) {
  ctx.beginPath();
  ctx.rect(-400 * sc, -600 * sc, 800 * sc, 600 * sc);
  ctx.ellipse(0, 0, 60 * sc, 24 * sc, 0, 0, Math.PI * 2);
  ctx.clip();
}

/** Uma corrente esticada, elo por elo. */
function chain(ctx: Ctx, a: Pt, b: Pt, sc: number, c: Rgb) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), step = 9 * sc, n = Math.floor(d / step);
  if (!n) return;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.translate(a.x, a.y); ctx.rotate(ang);
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.ellipse(i * step, 0, 6.5 * sc, (i % 2 ? 1.9 : 4) * sc, 0, 0, Math.PI * 2);
    ctx.lineWidth = 3.4 * sc; ctx.strokeStyle = rgba(shade(c, -0.8), 1); ctx.stroke();
    ctx.lineWidth = 1.7 * sc; ctx.strokeStyle = rgba(shade(c, i % 2 ? 0.55 : 0.2), 1); ctx.stroke();
  }
  ctx.restore();
}

/** Seth matou com magia: um buraco se abre embaixo do alvo e correntes o prendem e puxam para baixo. */
export function drawChainPull(ctx: Ctx, sc: number, tt: number, k: number, front: boolean, color: string) {
  const c = rgbOf(color);
  const open = clamp(k / 0.14) * clamp((1 - k) / 0.1);
  const sink = pullDepth(k) * 190 * sc, shoot = clamp((k - 0.06) / 0.2);
  if (!front) {
    ctx.save();
    ctx.scale(1, 0.4);
    const R = 60 * sc * open;
    if (R > 1) {
      const g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      g.addColorStop(0, '#040306'); g.addColorStop(0.72, rgba(shade(c, -0.82), 1)); g.addColorStop(0.92, rgba(c, 0.95)); g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // cada corrente sai da borda do buraco e prende um ponto do corpo, que desce junto
  const ends: [number, number, number, boolean][] = [[-0.5, -30, -82, false], [3.6, 28, -86, false], [2.5, -26, -44, true], [0.6, 26, -50, true]];
  for (const [ang, ex, ey, inFront] of ends) {
    if (inFront !== front) continue;
    const a = { x: Math.cos(ang) * 54 * sc, y: Math.sin(ang) * 21 * sc };
    const b = { x: ex * sc, y: ey * sc + sink };
    if (b.y > a.y) continue; // já desceu para dentro do buraco
    chain(ctx, a, { x: lerp(a.x, b.x, shoot), y: lerp(a.y, b.y, shoot) }, sc, c);
  }
  // volta da corrente em torno da cintura
  const waist = -56 * sc + sink;
  if (front && shoot >= 1 && waist < 0) {
    ctx.save();
    ctx.translate(Math.sin(tt * 63) * 2.2 * sc, 0);
    ctx.lineCap = 'butt';
    ctx.setLineDash([9 * sc, 3 * sc]);
    ctx.strokeStyle = rgba(shade(c, -0.8), 1); ctx.lineWidth = 7 * sc;
    ctx.beginPath(); ctx.ellipse(0, waist, 33 * sc, 12 * sc, 0, 0, Math.PI); ctx.stroke();
    ctx.strokeStyle = rgba(shade(c, 0.55), 1); ctx.lineWidth = 3.4 * sc;
    ctx.beginPath(); ctx.ellipse(0, waist, 33 * sc, 12 * sc, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }
}

export type UnitMark = 'spear' | 'dagger' | 'book';
/** Marca pequena flutuando ao lado da unidade: Oportunista (lança), Apunhalar (adaga), Bênção (livro). */
export function drawUnitMark(ctx: Ctx, mark: UnitMark, sc: number, tt: number, color: string) {
  const bob = Math.sin(tt * 3.2) * 3 * sc;
  ctx.save();
  ctx.translate(40 * sc, -66 * sc + bob);
  ctx.scale(sc, sc);
  const c = rgbOf(color), rim = rgba(shade(c, 0.25), 1), dark = rgba(shade(c, -0.25), 1);
  ctx.shadowColor = rim; ctx.shadowBlur = 9;
  ctx.fillStyle = 'rgba(28,18,12,0.9)'; ctx.strokeStyle = rim; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineJoin = 'round';
  if (mark === 'book') {
    // livro aberto
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(-5, -9, -11, -7); ctx.lineTo(-11, 7); ctx.quadraticCurveTo(-5, 5, 0, 9); ctx.quadraticCurveTo(5, 5, 11, 7); ctx.lineTo(11, -7); ctx.quadraticCurveTo(5, -9, 0, -5); ctx.fill();
    ctx.fillStyle = '#f6edd8';
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(-5, -8, -9, -6); ctx.lineTo(-9, 5); ctx.quadraticCurveTo(-5, 3, 0, 7); ctx.quadraticCurveTo(5, 3, 9, 5); ctx.lineTo(9, -6); ctx.quadraticCurveTo(5, -8, 0, -4); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 7);
    for (const y of [-2, 1]) { ctx.moveTo(-7, y); ctx.lineTo(-2.5, y + 1); ctx.moveTo(7, y); ctx.lineTo(2.5, y + 1); }
    ctx.stroke();
  } else {
    // ponta para baixo: aponta para o alvo
    ctx.rotate(Math.PI * 0.8);
    if (mark === 'spear') {
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 11); ctx.lineTo(0, -4); ctx.stroke();
      ctx.fillStyle = '#e8edf4';
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(4, -4); ctx.lineTo(0, -2); ctx.lineTo(-4, -4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-2.2, -2, 4.4, 2.4);
    } else {
      ctx.fillStyle = '#e8edf4';
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(3.4, 2); ctx.lineTo(-3.4, 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#9aa4b2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 2); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-6, 2, 12, 2.4);
      ctx.fillStyle = '#4a2f1b'; ctx.fillRect(-1.8, 4.4, 3.6, 6.2);
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 11, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** Grito de Guerra: ondas de som saem da boca do Herói e um vento leve corre em volta dele. */
export function warCryFx(p: Pt): Omit<Fx, 't0'> {
  const ms = 1100, mouth = { x: p.x, y: p.y - 66 };
  return { ms, draw(ctx, t) {
    // ondas do grito
    ctx.save();
    ctx.translate(mouth.x, mouth.y); ctx.scale(1, 0.72);
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,190,90,0.9)'; ctx.shadowBlur = 10;
    for (let i = 0; i < 4; i++) {
      const k = (t - i * 130) / 620;
      if (k < 0 || k > 1) continue;
      const r = 26 + k * 150;
      ctx.strokeStyle = `rgba(255,232,180,${0.85 * (1 - k)})`; ctx.lineWidth = 9 * (1 - k) + 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // vento rente ao chão, girando para fora
    ctx.save();
    ctx.translate(p.x, p.y); ctx.scale(1, 0.46);
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const k = (t - 60 - rnd(i) * 320) / 620;
      if (k < 0 || k > 1) continue;
      const a0 = (i / 10) * Math.PI * 2 + k * 1.2, r = 34 + k * (90 + rnd(i + 5) * 60);
      ctx.strokeStyle = `rgba(232,246,236,${0.75 * (1 - k)})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a0 + 0.8); ctx.stroke();
    }
    ctx.restore();
  } };
}

/** Desenha a arma com o cabo na origem e a ponta para +x. */
export function drawAlong(ctx: Ctx, art: Art, len: number) {
  const im = art.img;
  if (!im.complete || !im.naturalWidth) return false;
  const w = im.naturalWidth, h = im.naturalHeight;
  const gx = art.grip[0] * w, gy = art.grip[1] * h, hx = art.head[0] * w, hy = art.head[1] * h;
  const k = len / Math.hypot(hx - gx, hy - gy);
  ctx.save();
  ctx.rotate(-Math.atan2(hy - gy, hx - gx));
  ctx.scale(k, k);
  ctx.drawImage(im, -gx, -gy);
  ctx.restore();
  return true;
}

/** A arma na mão do Herói (coordenadas do boneco). `flip`: virado para a esquerda. */
export function drawHeld(ctx: Ctx, h: Held, t: number, flip: boolean, scale: number) {
  const k = (t - h.t0) / h.dur;
  if (k < 0 || k > 1) return;
  const a = clamp(k / 0.1) * clamp((1 - k) / 0.14);
  ctx.save();
  ctx.globalAlpha *= a;
  if (h.ranged) {
    // aponta para o alvo, na frente do corpo
    const im = h.art.img;
    if (im.complete && im.naturalWidth) {
      const size = 104 * scale, c = Math.cos(h.aim), s = Math.sin(h.aim);
      ctx.translate(c * 24 * scale, -34 * scale + s * 12 * scale);
      ctx.rotate(h.aim);
      if (c < 0) ctx.scale(1, -1);
      ctx.rotate(-((h.art.forward ?? -45) * Math.PI) / 180);
      const w = size, hh = size * (im.naturalHeight / im.naturalWidth);
      ctx.drawImage(im, -w / 2, -hh / 2, w, hh);
    }
    ctx.restore();
    return;
  }
  // golpe: levanta, desce rápido até o alvo e termina embaixo
  const up = -2.3, down = 0.75;
  const f = k < 0.3 ? up * clamp(k / 0.2) - 0.2 * (1 - clamp(k / 0.2)) : k < 0.45 ? lerp(up, down, ((k - 0.3) / 0.15) ** 2) : down;
  if (flip) ctx.scale(-1, 1);
  ctx.translate(12 * scale, -40 * scale);
  // rastro do golpe
  if (k >= 0.3 && k < 0.62) {
    const fade = 1 - clamp((k - 0.45) / 0.17);
    ctx.save();
    ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(255,255,255,${0.75 * fade})`; ctx.lineWidth = 8 * scale;
    ctx.shadowColor = 'rgba(255,220,150,0.9)'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(0, 0, 88 * scale, Math.max(up, f - 1.5), f); ctx.stroke();
    ctx.restore();
  }
  ctx.rotate(f);
  drawAlong(ctx, h.art, 104 * scale);
  ctx.restore();
}
