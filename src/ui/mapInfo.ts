import type { MapDef } from '../engine/board';
import { key } from '../engine/board';
import { CARDS, GUILDS, MONSTERS } from '../engine/data';
import { MAPS, difficultyBadge } from '../engine/maps';
import { MAP_LORE } from '../engine/maps/lore';
import { itemCard } from './cardview';

// Ficha do cenário: ilustração (3x4) à esquerda, textos do Livro de Campanha à direita e a disposição dos tabuleiros embaixo.
// Usada na Biblioteca e, em versão compacta, no balão que abre ao passar o mouse sobre um mapa nas telas de escolha.

export function mapArtUrl(id: string) { return `${import.meta.env.BASE_URL}maps/${id}.webp`; }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Destaca os nomes entre aspas ("Senhor das Águias"). */
const rich = (s: string) => esc(s).replace(/"([^"]+)"/g, '<q>$1</q>');

function missionsHtml(m: MapDef): string {
  const lore = MAP_LORE[m.id];
  const list = lore?.pve.length
    ? lore.pve.map(x => ({ name: x.name, text: x.text || (m.missions.pve.find(p => p.name === x.name)?.text ?? ''), gives: x.gives }))
    : m.missions.pve.map(x => ({ name: x.name, text: x.text, gives: x.title ? 'Dá Título' : x.reward ? 'Dá uma carta de Recompensa' : '' }));
  return list.map(x => `<li><b>${esc(x.name)}</b>${x.gives ? `<span class="ms-tag ${x.gives.includes('Título') ? 'tt' : 'rw'}">${x.gives.includes('Título') ? '🏅 Título' : '🃏 Recompensa'}</span>` : ''}${x.text ? `<span>${rich(x.text)}</span>` : ''}</li>`).join('');
}

function pvpHtml(m: MapDef): string {
  if (m.pvp === false) return '<span class="muted">Nenhuma neste cenário.</span>';
  return `<div class="ms-pvp">${(['azul', 'vermelho', 'verde', 'laranja'] as const).map(g => `<span style="--gc:${GUILDS[g].color}">⚔ Matar ${GUILDS[g].name.split(' (')[0].replace('Guilda ', '')}</span>`).join('')}</div>
    <small class="muted">Mate 1 Herói Inimigo da Guilda indicada.</small>`;
}

function rewardHtml(m: MapDef): string {
  const lore = MAP_LORE[m.id];
  const id = m.missions.rewards[0];
  if (!id && !lore?.reward) return '';
  const name = lore?.reward || `${CARDS[id].name} (x${m.missions.rewards.length})`;
  // a própria carta (quando o item existe no jogo); senão, só o nome e o texto
  const card = id && CARDS[id] ? `<div class="ms-rwcard">${itemCard(id)}</div>` : '';
  return `<div class="ms-sec"><h4>Carta de Recompensa</h4><div class="ms-reward">🃏 <b>${esc(name)}</b>${!card && id && CARDS[id]?.text ? `<span>${esc(CARDS[id].text)}</span>` : ''}</div>${card}</div>`;
}

function linksHtml(m: MapDef): string {
  const lore = MAP_LORE[m.id];
  if (!lore || (!lore.benefitsFrom.length && !lore.benefits.length)) return '';
  const chips = (xs: string[]) => xs.map(x => `<span class="ms-chip">${esc(x)}</span>`).join('');
  return `<div class="ms-links">
    ${lore.benefitsFrom.length ? `<div><small>Beneficia-se de</small>${chips(lore.benefitsFrom)}</div>` : ''}
    ${lore.benefits.length ? `<div><small>Beneficia</small>${chips(lore.benefits)}</div>` : ''}</div>`;
}

function titleHtml(m: MapDef): string {
  const t = MAP_LORE[m.id]?.title;
  if (!t) return '';
  const none = /não dá nenhum Título/.test(t);
  return `<div class="ms-title ${none ? 'none' : ''}"><h4>🏅 Título</h4><p>${rich(t)}</p></div>`;
}

const listSec = (title: string, xs: string[], open = false) => xs.length
  ? `<details class="ms-more" ${open ? 'open' : ''}><summary>${title}</summary><ul>${xs.map(x => `<li>${rich(x)}</li>`).join('')}</ul></details>` : '';

/** Componentes e Monstros do mapa (resumo). */
function componentsHtml(m: MapDef): string {
  const types = new Map<string, number>();
  for (const x of m.monsters) types.set(x.type, (types.get(x.type) ?? 0) + 1);
  const closed = m.doors.filter(d => !d.open).length, open = m.doors.length - closed;
  const marks = m.missionMarkers.length + (m.missionMarkersByArea?.length ?? 0) + (m.hiddenMissions?.length ?? 0);
  const stat = (n: number, label: string) => n ? `<span><b>${n}</b> ${label}</span>` : '';
  return `<div class="ms-comp">
      ${stat(m.boards.length, 'tabuleiros')}${stat(closed, 'portas fechadas')}${stat(open, 'abertas')}${stat(m.portals.length, 'portais')}
      ${stat(m.exploration.length, 'Exploração')}${stat(m.entryMarkers.length, 'Entradas de Monstro')}${stat(marks, 'marcadores de Missão')}</div>
    <div class="ms-mons">${[...types].map(([t, n]) => `<span class="ms-mon" style="--mc:${monColor(t)}"><i>${MONSTERS[t].abbr}</i>${n}× ${MONSTERS[t].name}</span>`).join('')}</div>`;
}

const LEGEND = `<div class="ms-legend">
  <span><i class="sw street"></i>Rua</span><span><i class="sw room"></i>Sala</span><span><i class="sw block"></i>Bloqueado</span><span><i class="sw start"></i>Área Inicial</span>
  <span><i class="ln wall"></i>Parede</span><span><i class="ln door"></i>Porta fechada</span><span><i class="ln open"></i>Porta aberta</span><span><i class="ln lock"></i>Trancada</span>
  <span><i class="ic" style="background:#2fb3b8">◎</i>Portal</span><span><i class="ic" style="background:#6a3fa0">?</i>Exploração</span><span><i class="ic" style="background:#d9a92c">⚑</i>Entrada de Monstro</span><span><i class="ic" style="background:#e0b43a">★</i>Missão</span>
</div>`;

/** Ficha completa (Biblioteca). */
export function mapSheet(m: MapDef): string {
  const lore = MAP_LORE[m.id];
  return `<div class="msheet">
    <div class="ms-top">
      <div class="ms-art"><img src="${mapArtUrl(m.id)}" alt="" loading="lazy"/>
        <div class="ms-cap"><b>${m.name}</b>${difficultyBadge(m)}<small>${m.circle} · Monstros Nível ${m.level ?? '1'}</small></div></div>
      <div class="ms-text">
        ${linksHtml(m)}
        ${titleHtml(m)}
        <div class="ms-sec"><h4>Missões contra o Jogo</h4><ul class="ms-miss">${missionsHtml(m)}</ul></div>
        <div class="ms-sec"><h4>Missões contra Jogador</h4>${pvpHtml(m)}</div>
        ${rewardHtml(m)}
        <div class="ms-sec"><h4>Para vencer</h4><span>${m.missionsToWin ? `${m.missionsToWin} Missão` : '2 Missões (2 jogadores) ou 3 Missões com pelo menos 1 contra o Jogo (3-4 jogadores).'}</span></div>
        ${listSec('Preparação Especial', lore?.setup ?? [])}
        ${listSec('Regras Especiais', lore?.rules ?? [], !lore)}
        ${listSec('Vantagens do Título', lore?.advantages ?? [])}
        ${listSec('Neste jogo', m.notes ?? [], !lore)}
      </div>
    </div>
    <div class="ms-layout"><h4>Disposição do mapa</h4>
      <div class="ms-board">${miniCanvas(m, 760)}</div>
      ${LEGEND}${componentsHtml(m)}
    </div>
  </div>`;
}

/** Cartão de mapa para as telas de escolha (ilustração + nome); a lupa abre a ficha. */
export function mapChoiceCard(m: MapDef, opts: { cls?: string; attrs?: string; level?: string; sub?: string; titles?: { name: string; color: string; title: string }[] } = {}): string {
  return `<div class="cp-vote mv ${opts.cls ?? ''}" ${opts.attrs ?? ''} data-peek="${m.id}">
    <div class="mv-art"><img src="${mapArtUrl(m.id)}" alt="" loading="lazy"/></div>
    <div class="mv-cap"><b>${m.name}</b>${difficultyBadge(m, opts.level)}<small>${opts.sub ?? m.circle}</small>
      ${opts.titles?.length ? `<div class="mv-titles">${opts.titles.map(t => `<span style="--gc:${t.color}" title="${t.title}: vantagem neste mapa">🏅 <b>${t.name}</b> · ${t.title}</span>`).join('')}</div>` : ''}</div></div>`;
}

/** Canvas da disposição com a proporção do mapa (9x6, 9x9...). */
export function miniCanvas(m: MapDef, w: number, attrs = '') {
  return `<canvas data-mini="${m.id}" width="${w}" height="${Math.round(w * (m.rows + 0.4) / (m.cols + 0.4))}" ${attrs}></canvas>`;
}

/** Desenha as disposições (canvas[data-mini]) dentro de `root`. */
export function paintMapSheets(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-mini]').forEach(cv => { const m = MAPS[cv.dataset.mini!]; if (m) drawMinimap(cv, m); });
}

let pop: HTMLDivElement | null = null;
/** Põe uma lupa (🔍) em cada elemento com `data-peek="<mapId>"` dentro de `root`; ela abre a ficha do mapa na tela. */
export function attachMapPeek(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-peek]').forEach(el => {
    if (el.querySelector(':scope > .mv-zoom')) return;
    const b = document.createElement('button');
    b.className = 'mv-zoom';
    b.title = 'Ver a ficha do mapa';
    b.textContent = '🔍';
    b.onclick = e => { e.stopPropagation(); e.preventDefault(); openMapSheet(el.dataset.peek!); };
    el.append(b);
  });
}
/** Ficha completa do mapa numa janela sobre a tela. */
export function openMapSheet(id: string) {
  const m = MAPS[id];
  if (!m) return;
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'mappeek';
    document.body.append(pop);
    pop.onclick = e => { if (e.target === pop) closeMapPeek(); };
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && pop && !pop.classList.contains('hidden')) { e.stopPropagation(); closeMapPeek(); } }, true);
  }
  pop.innerHTML = `<div class="mp-win"><button class="mp-x" title="Fechar (Esc)">✕</button>${mapSheet(m)}</div>`;
  (pop.querySelector('.mp-x') as HTMLElement).onclick = closeMapPeek;
  paintMapSheets(pop);
  pop.classList.remove('hidden');
}
/** Fecha a ficha (ao trocar de tela). */
export function closeMapPeek() { pop?.classList.add('hidden'); }

function monColor(type: string): string {
  const md = MONSTERS[type];
  return md.category.startsWith('Vilão') ? (md.category === 'Vilão Maior' ? '#3a4ab0' : '#b0306a') : md.category === 'Lacaio Maior' ? '#e06a1c' : md.attackType === 'ranged' ? '#4f9a2a' : '#c8382c';
}

const START_COLORS = ['#e8a33a', '#e8a33a', '#e8a33a', '#e8a33a'];

/** Disposição dos tabuleiros: ruas, salas, paredes, portas, portais, marcadores e Monstros. */
export function drawMinimap(cv: HTMLCanvasElement, m: MapDef) {
  const ctx = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const pad = Math.round(Math.min(W, H) * 0.03);
  const S = Math.floor(Math.min((W - pad * 2) / m.cols, (H - pad * 2) / m.rows));
  const ox = Math.round((W - S * m.cols) / 2), oy = Math.round((H - S * m.rows) / 2);
  const X = (c: number) => ox + c * S, Y = (r: number) => oy + r * S;
  ctx.clearRect(0, 0, W, H);
  const exists = new Set<string>();
  for (const b of m.boards) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) exists.add(key({ c: b.c + c, r: b.r + r }));
  const pillars = new Set(m.pillars.map(key));
  const rooms = new Set(m.rooms.map(key));
  const start = new Map<string, number>();
  m.startAreas.forEach((cells, i) => cells.forEach(c => start.set(key(c), i)));

  // sombra dos tabuleiros
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = S * 0.25; ctx.shadowOffsetY = S * 0.06;
  ctx.fillStyle = '#3a2a1a';
  for (const b of m.boards) ctx.fillRect(X(b.c), Y(b.r), S * 3, S * 3);
  ctx.restore();

  // Espaços
  for (const k of exists) {
    const [c, r] = k.split(',').map(Number);
    const x = X(c), y = Y(r);
    let g: CanvasGradient;
    if (pillars.has(k)) {
      ctx.fillStyle = '#466b2a'; ctx.fillRect(x, y, S, S);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, S, S); ctx.clip();
      ctx.strokeStyle = 'rgba(20,40,10,.45)'; ctx.lineWidth = S * 0.06;
      for (let i = -S; i < S * 2; i += S / 5) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i - S, y + S); ctx.stroke(); }
      ctx.restore();
      continue;
    }
    if (start.has(k)) { g = ctx.createLinearGradient(x, y, x, y + S); g.addColorStop(0, '#f3c46a'); g.addColorStop(1, START_COLORS[start.get(k)!]); }
    else if (rooms.has(k)) { g = ctx.createLinearGradient(x, y, x, y + S); g.addColorStop(0, '#c48d58'); g.addColorStop(1, '#a87342'); }
    else { g = ctx.createLinearGradient(x, y, x, y + S); g.addColorStop(0, '#f1e4c4'); g.addColorStop(1, '#ddcaa0'); }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, S, S);
    // tábuas nas salas, pedras na rua
    ctx.strokeStyle = rooms.has(k) && !start.has(k) ? 'rgba(90,50,20,.25)' : 'rgba(120,95,60,.18)';
    ctx.lineWidth = 1;
    if (rooms.has(k) && !start.has(k)) for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + i * S / 4); ctx.lineTo(x + S, y + i * S / 4); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(80,55,25,.28)';
    ctx.strokeRect(x + 0.5, y + 0.5, S - 1, S - 1);
  }
  // contorno de cada tabuleiro (3x3)
  ctx.strokeStyle = 'rgba(45,28,14,.85)'; ctx.lineWidth = Math.max(2, S * 0.03);
  for (const b of m.boards) ctx.strokeRect(X(b.c), Y(b.r), S * 3, S * 3);

  // Áreas Iniciais
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  m.startAreas.forEach((cells, i) => {
    const cx = cells.reduce((s, c) => s + c.c + 0.5, 0) / cells.length, cy = cells.reduce((s, c) => s + c.r + 0.5, 0) / cells.length;
    const x = ox + cx * S, y = oy + cy * S, rr = S * 0.2;
    ctx.fillStyle = '#5a3410'; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffe2a0'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ffe9b8'; ctx.font = `800 ${Math.round(S * 0.2)}px "Baloo 2", sans-serif`;
    ctx.fillText(`J${i + 1}`, x, y + 1);
  });
  for (const lb of m.labels ?? []) {
    const cx = lb.cells.reduce((a, c) => a + c.c + 0.5, 0) / lb.cells.length, cy = lb.cells.reduce((a, c) => a + c.r + 0.5, 0) / lb.cells.length;
    ctx.fillStyle = 'rgba(60,30,90,.85)'; for (const c of lb.cells) ctx.fillRect(X(c.c) + 3, Y(c.r) + 3, S - 6, S - 6);
    ctx.fillStyle = '#f4e6ff'; ctx.font = `800 ${Math.round(S * 0.13)}px "Baloo 2", sans-serif`; ctx.fillText(lb.text, ox + cx * S, oy + cy * S);
  }

  // paredes e portas
  const edge = (a: { c: number; r: number }, b: { c: number; r: number }) => {
    if (a.r === b.r) { const x = X(Math.max(a.c, b.c)); return [x, Y(a.r), x, Y(a.r + 1)]; }
    const y = Y(Math.max(a.r, b.r)); return [X(a.c), y, X(a.c + 1), y];
  };
  ctx.lineCap = 'round';
  for (const [a, b] of m.walls) {
    const [x0, y0, x1, y1] = edge(a, b);
    ctx.strokeStyle = '#2b1d12'; ctx.lineWidth = Math.max(4, S * 0.09);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#7d6a55'; ctx.lineWidth = Math.max(2, S * 0.04); ctx.stroke();
  }
  for (const d of m.doors) {
    const [x0, y0, x1, y1] = edge(d.a, d.b);
    const f = d.small ? 0.3 : 0.16;
    const ix = (x1 - x0) * f, iy = (y1 - y0) * f;
    const color = d.locked ? '#8a4ad0' : d.open ? '#4fb35d' : '#c8432f';
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#1e140c'; ctx.lineWidth = Math.max(7, S * 0.14);
    ctx.beginPath(); ctx.moveTo(x0 + ix, y0 + iy); ctx.lineTo(x1 - ix, y1 - iy); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(5, S * 0.1); ctx.stroke();
    if (!d.open) { ctx.strokeStyle = 'rgba(255,230,190,.55)'; ctx.lineWidth = Math.max(1.5, S * 0.025); ctx.stroke(); }
    ctx.lineCap = 'round';
  }

  // marcadores
  const icon = (c: { c: number; r: number }, dx: number, dy: number, color: string, txt: string, sq = false) => {
    const x = X(c.c) + (0.5 + dx) * S, y = Y(c.r) + (0.5 + dy) * S, rr = S * 0.155;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    ctx.beginPath();
    if (sq) ctx.roundRect(x - rr * 1.15, y - rr, rr * 2.3, rr * 2, rr * 0.45); else ctx.arc(x, y, rr, 0, 7);
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(S * (sq ? 0.13 : 0.15))}px "Baloo 2", sans-serif`; ctx.fillText(txt, x, y + 1);
  };
  for (const p of m.portals) icon(p.cell, 0.26, -0.26, p.color === 'magenta' ? '#c03a9a' : '#2fb3b8', '◎');
  for (const e of m.entryMarkers) icon(e, -0.27, 0.27, '#d9a92c', '⚑');
  for (const x of m.exploration) icon(x, -0.26, -0.26, '#6a3fa0', '?');
  const stars = new Map<string, number>();
  const star = (c: { c: number; r: number }, color: string) => { const n = stars.get(key(c)) ?? 0; stars.set(key(c), n + 1); icon(c, -0.04 + n * 0.25, -0.27 + (n > 1 ? 0.25 : 0), color, '★'); };
  m.missionMarkers.forEach(mm => star(mm.cell, GUILDS[mm.color as keyof typeof GUILDS]?.color ?? '#e0b43a'));
  for (const c of m.missionMarkersByArea ?? []) star(c, '#e0b43a');
  const seen = new Map<string, number>();
  for (const mo of m.monsters) {
    const k = key(mo.cell);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    icon(mo.cell, -0.02 + (n % 2) * 0.3, 0.06 + Math.floor(n / 2) * 0.22, monColor(mo.type), MONSTERS[mo.type].abbr, true);
  }
}
