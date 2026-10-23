import { key } from '../engine/board';
import type { MapDef } from '../engine/board';
import { BTG_MAP_IDS, MAPS } from '../engine/maps';
import type { Cell } from '../engine/types';
import { drawMinimap } from './mapInfo';

// Revisão das paredes dos mapas (abre com /#paredes): clique entre dois Espaços para pôr/tirar parede.
// As alterações ficam salvas no navegador e saem num texto para copiar e mandar de volta.

const STORE = 'cbt.wallEdits';
interface Edits { [mapId: string]: { add: string[]; remove: string[]; block?: string[]; unblock?: string[]; reviewed?: boolean; note?: string } }

const edgeKey = (a: Cell, b: Cell) => [key(a), key(b)].sort().join('|');
const toCells = (k: string): [Cell, Cell] => k.split('|').map(s => { const [c, r] = s.split(',').map(Number); return { c, r }; }) as [Cell, Cell];

function load(): Edits { try { return JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { return {}; } }
function save(e: Edits) { try { localStorage.setItem(STORE, JSON.stringify(e)); } catch { /* sem armazenamento */ } }

/** Espaços bloqueados (verdes) com as alterações aplicadas. */
function pillarsOf(m: MapDef, e: Edits): Set<string> {
  const set = new Set(m.pillars.map(key));
  const ed = e[m.id];
  if (ed) { for (const k of ed.unblock ?? []) set.delete(k); for (const k of ed.block ?? []) set.add(k); }
  return set;
}
const cellOf = (k: string): Cell => { const [c, r] = k.split(',').map(Number); return { c, r }; };
const nChanges = (ed?: Edits[string]) => ed ? ed.add.length + ed.remove.length + (ed.block?.length ?? 0) + (ed.unblock?.length ?? 0) : 0;

/** Paredes do mapa com as alterações aplicadas. */
function wallsOf(m: MapDef, e: Edits): Set<string> {
  const set = new Set(m.walls.map(([a, b]) => edgeKey(a, b)));
  const ed = e[m.id];
  if (ed) { for (const k of ed.remove) set.delete(k); for (const k of ed.add) set.add(k); }
  return set;
}

export function openWallEditor() {
  const ids = Object.keys(MAPS).sort((a, b) => Number(BTG_MAP_IDS.has(a)) - Number(BTG_MAP_IDS.has(b)));
  let cur = ids[0];
  let edits = load();
  let hover: string | null = null;
  let hoverCell: string | null = null;
  const el = document.createElement('div');
  el.id = 'walleditor';
  document.body.append(el);

  const exportText = () => {
    const out: Record<string, unknown> = {};
    for (const id of ids) {
      const ed = edits[id];
      if (!ed || (!nChanges(ed) && !ed.reviewed && !ed.note)) continue;
      const fmt = (k: string) => toCells(k).map(c => `(${c.c},${c.r})`).join('-');
      const cel = (k: string) => `(${k})`;
      out[id] = { revisado: !!ed.reviewed, adicionar: ed.add.map(fmt), remover: ed.remove.map(fmt),
        ...(ed.block?.length ? { bloquear: ed.block.map(cel) } : {}), ...(ed.unblock?.length ? { desbloquear: ed.unblock.map(cel) } : {}), ...(ed.note ? { obs: ed.note } : {}) };
    }
    return `PAREDES ${JSON.stringify(out, null, 1)}`;
  };

  const geom = (cv: HTMLCanvasElement, m: MapDef) => {
    // mesma conta do drawMinimap
    const W = cv.width, H = cv.height;
    const pad = Math.round(Math.min(W, H) * 0.03);
    const S = Math.floor(Math.min((W - pad * 2) / m.cols, (H - pad * 2) / m.rows));
    return { S, ox: Math.round((W - S * m.cols) / 2), oy: Math.round((H - S * m.rows) / 2) };
  };

  const draw = () => {
    const m = MAPS[cur];
    const cv = el.querySelector('#we-cv') as HTMLCanvasElement;
    const walls = wallsOf(m, edits);
    drawMinimap(cv, { ...m, walls: [...walls].map(toCells), pillars: [...pillarsOf(m, edits)].map(cellOf) });
    const ctx = cv.getContext('2d')!;
    const { S, ox, oy } = geom(cv, m);
    // Espaços bloqueados alterados: verde = bloqueado agora, rosa = desbloqueado; amarelo = sob o mouse
    const box = (k: string, color: string, dash: boolean) => {
      const c = cellOf(k);
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, S * 0.06); if (dash) ctx.setLineDash([6, 5]);
      ctx.strokeRect(ox + c.c * S + 4, oy + c.r * S + 4, S - 8, S - 8); ctx.restore();
    };
    for (const k of edits[cur]?.block ?? []) box(k, '#36e07a', false);
    for (const k of edits[cur]?.unblock ?? []) box(k, '#ff5cf0', true);
    if (hoverCell && !hover) box(hoverCell, 'rgba(255,230,90,.9)', false);
    const line = (k: string, color: string, w: number) => {
      const [a, b] = toCells(k);
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath();
      if (a.r === b.r) { const x = ox + Math.max(a.c, b.c) * S; ctx.moveTo(x, oy + a.r * S + 3); ctx.lineTo(x, oy + (a.r + 1) * S - 3); }
      else { const y = oy + Math.max(a.r, b.r) * S; ctx.moveTo(ox + a.c * S + 3, y); ctx.lineTo(ox + (a.c + 1) * S - 3, y); }
      ctx.stroke();
    };
    // alterações: verde = parede nova, rosa tracejado = parede tirada
    const ed = edits[cur];
    for (const k of ed?.add ?? []) line(k, '#36e07a', Math.max(4, S * 0.09));
    ctx.setLineDash([6, 5]);
    for (const k of ed?.remove ?? []) line(k, '#ff5cf0', Math.max(3, S * 0.07));
    ctx.setLineDash([]);
    if (hover) line(hover, 'rgba(255,230,90,.9)', Math.max(6, S * 0.12));
    // coordenadas
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `${Math.max(10, S * 0.16)}px sans-serif`; ctx.textAlign = 'center';
    for (let c = 0; c < m.cols; c++) ctx.fillText(String(c), ox + (c + 0.5) * S, oy - 4);
    ctx.textAlign = 'right';
    for (let r = 0; r < m.rows; r++) ctx.fillText(String(r), ox - 4, oy + (r + 0.55) * S);
  };

  /** Borda entre dois Espaços mais perto do ponteiro (ou null). */
  const pickEdge = (cv: HTMLCanvasElement, ev: MouseEvent): string | null => {
    const m = MAPS[cur];
    const rect = cv.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * cv.width / rect.width, y = (ev.clientY - rect.top) * cv.height / rect.height;
    const { S, ox, oy } = geom(cv, m);
    const fx = (x - ox) / S, fy = (y - oy) / S;
    const dx = Math.abs(fx - Math.round(fx)), dy = Math.abs(fy - Math.round(fy));
    if (Math.min(dx, dy) > 0.22) return null; // meio do Espaço: ver pickCell
    let a: Cell, b: Cell;
    if (dx < dy) { const c = Math.round(fx), r = Math.floor(fy); a = { c: c - 1, r }; b = { c, r }; }
    else { const r = Math.round(fy), c = Math.floor(fx); a = { c, r: r - 1 }; b = { c, r }; }
    const inside = (p: Cell) => p.c >= 0 && p.r >= 0 && p.c < m.cols && p.r < m.rows;
    if (!inside(a) || !inside(b)) return null;
    return edgeKey(a, b);
  };

  /** Espaço sob o ponteiro, se estiver no meio dele (longe das bordas). */
  const pickCell = (cv: HTMLCanvasElement, ev: MouseEvent): string | null => {
    const m = MAPS[cur];
    const rect = cv.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * cv.width / rect.width, y = (ev.clientY - rect.top) * cv.height / rect.height;
    const { S, ox, oy } = geom(cv, m);
    const fx = (x - ox) / S, fy = (y - oy) / S;
    const c = Math.floor(fx), r = Math.floor(fy);
    if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) return null;
    if (!m.boards.some(b => c >= b.c && c < b.c + 3 && r >= b.r && r < b.r + 3)) return null;
    const dx = Math.abs(fx - Math.round(fx)), dy = Math.abs(fy - Math.round(fy));
    return Math.min(dx, dy) > 0.22 ? `${c},${r}` : null;
  };

  const render = () => {
    const m = MAPS[cur];
    const ed = edits[cur];
    const done = ids.filter(id => edits[id]?.reviewed).length;
    el.innerHTML = `<div class="we-box">
      <div class="we-head"><h2>🧱 Revisão das paredes</h2>
        <select id="we-map">${ids.map(id => `<option value="${id}" ${id === cur ? 'selected' : ''}>${edits[id]?.reviewed ? '✅' : '⬜'} ${BTG_MAP_IDS.has(id) ? '💀 ' : ''}${MAPS[id].name}${nChanges(edits[id]) ? ` (${nChanges(edits[id])} alt.)` : ''}</option>`).join('')}</select>
        <span class="we-prog">${done}/${ids.length} revisados</span>
        <button id="we-close">✕ Fechar</button></div>
      <p class="we-help">Clique <b>entre dois Espaços</b> para pôr ou tirar uma parede · clique <b>no meio de um Espaço</b> para bloquear/desbloquear (verde listrado = ninguém entra; funciona como parede). <span style="color:#36e07a">Verde</span> = parede nova · <span style="color:#ff5cf0">rosa tracejado</span> = parede tirada · barras vermelhas/verdes = portas (não mudam). Quando terminar um mapa, marque <b>Revisado</b>. Compare com o mapa do Livro de Campanha. No fim, copie o texto e me mande.</p>
      <div class="we-main">
        <div class="we-edit"><canvas id="we-cv" width="${m.cols * 110 + 50}" height="${m.rows * 110 + 50}"></canvas></div>
      </div>
      <div class="we-row">
        <label><input type="checkbox" id="we-rev" ${ed?.reviewed ? 'checked' : ''}/> ✅ Revisado</label>
        <input id="we-note" placeholder="Observação deste mapa (opcional)" value="${(ed?.note ?? '').replace(/"/g, '&quot;')}"/>
        <button id="we-undo" ${nChanges(ed) ? '' : 'disabled'}>↩ Desfazer alterações deste mapa</button>
        <button id="we-prev">◀ Anterior</button><button id="we-next">Próximo ▶</button>
      </div>
      <div class="we-out"><textarea id="we-text" readonly>${exportText()}</textarea>
        <button class="primary" id="we-copy">📋 Copiar para mandar</button></div>
    </div>`;
    const cv = el.querySelector('#we-cv') as HTMLCanvasElement;
    draw();
    const ensure = () => (edits[cur] ??= { add: [], remove: [] });
    cv.onmousemove = ev => {
      const h = pickEdge(cv, ev), hc = h ? null : pickCell(cv, ev);
      if (h !== hover || hc !== hoverCell) { hover = h; hoverCell = hc; draw(); }
      cv.style.cursor = h || hc ? 'pointer' : 'default';
    };
    cv.onmouseleave = () => { hover = null; hoverCell = null; draw(); };
    cv.onclick = ev => {
      const k = pickEdge(cv, ev);
      if (!k) {
        // meio do Espaço: bloquear / desbloquear
        const c = pickCell(cv, ev);
        if (!c) return;
        const e = ensure();
        e.block ??= []; e.unblock ??= [];
        const orig = m.pillars.some(p => key(p) === c);
        if (pillarsOf(m, edits).has(c)) { if (orig) e.unblock.push(c); else e.block = e.block.filter(x => x !== c); }
        else { if (orig) e.unblock = e.unblock.filter(x => x !== c); else e.block.push(c); }
        save(edits); render();
        return;
      }
      const e = ensure();
      const orig = m.walls.some(([a, b]) => edgeKey(a, b) === k);
      const has = wallsOf(m, edits).has(k);
      if (has) { if (orig) e.remove.push(k); else e.add = e.add.filter(x => x !== k); }
      else { if (orig) e.remove = e.remove.filter(x => x !== k); else e.add.push(k); }
      save(edits); render();
    };
    (el.querySelector('#we-map') as HTMLSelectElement).onchange = ev => { cur = (ev.target as HTMLSelectElement).value; hover = null; render(); };
    (el.querySelector('#we-rev') as HTMLInputElement).onchange = ev => { ensure().reviewed = (ev.target as HTMLInputElement).checked; save(edits); render(); };
    (el.querySelector('#we-note') as HTMLInputElement).onchange = ev => { ensure().note = (ev.target as HTMLInputElement).value.trim(); save(edits); render(); };
    (el.querySelector('#we-undo') as HTMLElement).onclick = () => { if (edits[cur]) { edits[cur].add = []; edits[cur].remove = []; edits[cur].block = []; edits[cur].unblock = []; } save(edits); render(); };
    const step = (d: number) => { cur = ids[(ids.indexOf(cur) + d + ids.length) % ids.length]; hover = null; render(); };
    (el.querySelector('#we-prev') as HTMLElement).onclick = () => step(-1);
    (el.querySelector('#we-next') as HTMLElement).onclick = () => step(1);
    (el.querySelector('#we-copy') as HTMLElement).onclick = () => {
      const t = el.querySelector('#we-text') as HTMLTextAreaElement;
      navigator.clipboard?.writeText(t.value).then(() => { (el.querySelector('#we-copy') as HTMLElement).textContent = '✔ Copiado!'; }, () => { t.select(); });
    };
    (el.querySelector('#we-close') as HTMLElement).onclick = () => { el.remove(); if (location.hash === '#paredes') history.replaceState(null, '', location.pathname + location.search); };
  };
  edits = load();
  render();
}
