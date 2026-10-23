import { key } from '../engine/board';
import type { MapDef } from '../engine/board';
import { BTG_MAP_IDS, MAPS } from '../engine/maps';
import type { Cell } from '../engine/types';
import { drawMinimap } from './mapInfo';

// Revisão dos mapas (abre com /#paredes): escolha uma ferramenta (parede, Espaço bloqueado, deck de madeira, portas, borracha)
// e clique no mapa. As alterações ficam salvas no navegador e saem num texto para copiar e mandar de volta
// (aplicado com tools/apply_map_review.py).

const STORE = 'cbt.wallEdits';
type DoorType = 'fechada' | 'aberta' | 'pequena' | 'trancada';
interface MapEdits {
  add: string[]; remove: string[];
  block?: string[]; unblock?: string[];
  wood?: string[]; unwood?: string[];
  /** porta por borda: tipo novo ou 'none' (tirar) */
  doors?: Record<string, DoorType | 'none'>;
  /** Áreas Iniciais alteradas: índice (0-3) -> lista completa de Espaços */
  areas?: Record<string, string[]>;
  entryAdd?: string[]; entryRemove?: string[];
  reviewed?: boolean; note?: string;
}
type Edits = Record<string, MapEdits>;

type Tool = 'wall' | 'block' | 'wood' | 'area' | 'entry' | DoorType | 'erase';
const TOOLS: { id: Tool; icon: string; name: string; on: 'edge' | 'cell' | 'both' }[] = [
  { id: 'wall', icon: '🧱', name: 'Parede', on: 'edge' },
  { id: 'block', icon: '🌿', name: 'Espaço bloqueado', on: 'cell' },
  { id: 'wood', icon: '🪵', name: 'Deck de madeira', on: 'cell' },
  { id: 'area', icon: '🏁', name: 'Área Inicial', on: 'cell' },
  { id: 'entry', icon: '⚑', name: 'Entrada de Monstro', on: 'cell' },
  { id: 'fechada', icon: '🚪', name: 'Porta fechada', on: 'edge' },
  { id: 'aberta', icon: '🔓', name: 'Porta aberta', on: 'edge' },
  { id: 'pequena', icon: '🔸', name: 'Porta pequena (aberta)', on: 'edge' },
  { id: 'trancada', icon: '🔒', name: 'Porta trancada', on: 'edge' },
  { id: 'erase', icon: '🧽', name: 'Borracha', on: 'both' },
];

const edgeKey = (a: Cell, b: Cell) => [key(a), key(b)].sort().join('|');
const toCells = (k: string): [Cell, Cell] => k.split('|').map(s => { const [c, r] = s.split(',').map(Number); return { c, r }; }) as [Cell, Cell];
const cellOf = (k: string): Cell => { const [c, r] = k.split(',').map(Number); return { c, r }; };
const doorType = (d: MapDef['doors'][number]): DoorType => d.locked ? 'trancada' : d.small ? 'pequena' : d.open ? 'aberta' : 'fechada';

function load(): Edits { try { return JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { return {}; } }
function save(e: Edits) { try { localStorage.setItem(STORE, JSON.stringify(e)); } catch { /* sem armazenamento */ } }

/** Tira as alterações que o mapa já tem (ex.: uma revisão que já foi aplicada no jogo). */
function prune(e: Edits): Edits {
  for (const [id, ed] of Object.entries(e)) {
    const m = MAPS[id];
    if (!m) continue;
    const walls = new Set(m.walls.map(([a, b]) => edgeKey(a, b)));
    const pil = new Set(m.pillars.map(key)), rooms = new Set(m.rooms.map(key));
    const doors = new Map(m.doors.map(d => [edgeKey(d.a, d.b), doorType(d)]));
    ed.add = (ed.add ?? []).filter(k => !walls.has(k));
    ed.remove = (ed.remove ?? []).filter(k => walls.has(k));
    ed.block = (ed.block ?? []).filter(k => !pil.has(k));
    ed.unblock = (ed.unblock ?? []).filter(k => pil.has(k));
    ed.wood = (ed.wood ?? []).filter(k => !rooms.has(k));
    ed.unwood = (ed.unwood ?? []).filter(k => rooms.has(k));
    for (const [k, t] of Object.entries(ed.doors ?? {})) if ((doors.get(k) ?? 'none') === t) delete ed.doors![k];
    for (const [i, l] of Object.entries(ed.areas ?? {})) if (sameList(l, (m.startAreas[+i] ?? []).map(key))) delete ed.areas![i];
    const ent = new Set(m.entryMarkers.map(key));
    ed.entryAdd = (ed.entryAdd ?? []).filter(k => !ent.has(k));
    ed.entryRemove = (ed.entryRemove ?? []).filter(k => ent.has(k));
  }
  return e;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

/** O mapa com as alterações aplicadas. */
function edited(m: MapDef, ed?: MapEdits): MapDef {
  if (!ed) return m;
  const walls = new Set(m.walls.map(([a, b]) => edgeKey(a, b)));
  for (const k of ed.remove) walls.delete(k);
  for (const k of ed.add) walls.add(k);
  const pil = new Set(m.pillars.map(key));
  for (const k of ed.unblock ?? []) pil.delete(k);
  for (const k of ed.block ?? []) pil.add(k);
  const rooms = new Set(m.rooms.map(key));
  for (const k of ed.unwood ?? []) rooms.delete(k);
  for (const k of ed.wood ?? []) rooms.add(k);
  const doors = new Map(m.doors.map(d => [edgeKey(d.a, d.b), d]));
  for (const [k, t] of Object.entries(ed.doors ?? {})) {
    if (t === 'none') { doors.delete(k); continue; }
    const [a, b] = toCells(k);
    doors.set(k, { a, b, open: t === 'aberta' || t === 'pequena', ...(t === 'pequena' ? { small: true } : {}), ...(t === 'trancada' ? { locked: true } : {}) });
  }
  const startAreas = [0, 1, 2, 3].map(i => ed.areas?.[i] ? ed.areas[i].map(cellOf) : m.startAreas[i] ?? []).filter((l, i) => l.length || i < m.startAreas.length);
  const ent = new Set(m.entryMarkers.map(key));
  for (const k of ed.entryRemove ?? []) ent.delete(k);
  for (const k of ed.entryAdd ?? []) ent.add(k);
  return { ...m, walls: [...walls].map(toCells), pillars: [...pil].map(cellOf), rooms: [...rooms].map(cellOf), doors: [...doors.values()], startAreas, entryMarkers: [...ent].map(cellOf) };
}

const count = (ed?: MapEdits) => ed ? ed.add.length + ed.remove.length + (ed.block?.length ?? 0) + (ed.unblock?.length ?? 0)
  + (ed.wood?.length ?? 0) + (ed.unwood?.length ?? 0) + Object.keys(ed.doors ?? {}).length
  + Object.keys(ed.areas ?? {}).length + (ed.entryAdd?.length ?? 0) + (ed.entryRemove?.length ?? 0) : 0;

/** Liga/desliga `k` (`orig` = o mapa original já tem; `want` = como deve ficar). */
function toggleIn(onList: string[], offList: string[], k: string, orig: boolean, want: boolean) {
  const rm = (l: string[]) => { const i = l.indexOf(k); if (i >= 0) l.splice(i, 1); };
  rm(onList); rm(offList);
  if (want && !orig) onList.push(k);
  if (!want && orig) offList.push(k);
}

export function openWallEditor() {
  const ids = Object.keys(MAPS).sort((a, b) => Number(BTG_MAP_IDS.has(a)) - Number(BTG_MAP_IDS.has(b)));
  let cur = ids[0];
  let tool: Tool = 'wall';
  let area = 0; // Área Inicial escolhida (0-3)
  const edits = prune(load());
  save(edits);
  let hoverEdge: string | null = null, hoverCell: string | null = null;
  const el = document.createElement('div');
  el.id = 'walleditor';
  document.body.append(el);

  const exportText = () => {
    const out: Record<string, unknown> = {};
    const pair = (k: string) => toCells(k).map(c => `(${c.c},${c.r})`).join('-');
    const cel = (k: string) => `(${k})`;
    for (const id of ids) {
      const ed = edits[id];
      if (!ed || (!count(ed) && !ed.reviewed && !ed.note)) continue;
      const orig = new Map(MAPS[id].doors.map(d => [edgeKey(d.a, d.b), d]));
      const dEntries = Object.entries(ed.doors ?? {});
      const novas = dEntries.filter(([, t]) => t !== 'none').map(([k, t]) => ({ entre: pair(k), tipo: t }));
      const tirar = dEntries.filter(([k]) => orig.has(k)).map(([k]) => pair(k)); // tirada ou trocada de tipo
      out[id] = {
        revisado: !!ed.reviewed, adicionar: ed.add.map(pair), remover: ed.remove.map(pair),
        ...(ed.block?.length ? { bloquear: ed.block.map(cel) } : {}), ...(ed.unblock?.length ? { desbloquear: ed.unblock.map(cel) } : {}),
        ...(ed.wood?.length ? { madeira: ed.wood.map(cel) } : {}), ...(ed.unwood?.length ? { tirar_madeira: ed.unwood.map(cel) } : {}),
        ...(tirar.length ? { tirar_portas: tirar } : {}), ...(novas.length ? { portas: novas } : {}),
        ...(Object.keys(ed.areas ?? {}).length ? { areas_iniciais: Object.fromEntries(Object.entries(ed.areas!).map(([i, l]) => [String(+i + 1), l.map(cel)])) } : {}),
        ...(ed.entryAdd?.length ? { entradas: ed.entryAdd.map(cel) } : {}), ...(ed.entryRemove?.length ? { tirar_entradas: ed.entryRemove.map(cel) } : {}),
        ...(ed.note ? { obs: ed.note } : {}),
      };
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
  const exists = (m: MapDef, c: Cell) => m.boards.some(b => c.c >= b.c && c.c < b.c + 3 && c.r >= b.r && c.r < b.r + 3);

  /** Borda ou Espaço sob o ponteiro, conforme a ferramenta. */
  const pick = (cv: HTMLCanvasElement, ev: MouseEvent): { edge: string | null; cell: string | null } => {
    const m = MAPS[cur];
    const rect = cv.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * cv.width / rect.width, y = (ev.clientY - rect.top) * cv.height / rect.height;
    const { S, ox, oy } = geom(cv, m);
    const fx = (x - ox) / S, fy = (y - oy) / S;
    const on = TOOLS.find(t => t.id === tool)!.on;
    const dx = Math.abs(fx - Math.round(fx)), dy = Math.abs(fy - Math.round(fy));
    const near = Math.min(dx, dy);
    let edge: string | null = null, cell: string | null = null;
    if (on === 'edge' || (on === 'both' && near < 0.22)) {
      let a: Cell, b: Cell;
      if (dx < dy) { const c = Math.round(fx), r = Math.floor(fy); a = { c: c - 1, r }; b = { c, r }; }
      else { const r = Math.round(fy), c = Math.floor(fx); a = { c, r: r - 1 }; b = { c, r }; }
      if (near < 0.35 && exists(m, a) && exists(m, b)) edge = edgeKey(a, b);
    } else {
      const c = { c: Math.floor(fx), r: Math.floor(fy) };
      if (exists(m, c)) cell = key(c);
    }
    return { edge, cell };
  };

  const draw = () => {
    const m = MAPS[cur];
    const ed = edits[cur];
    const cv = el.querySelector('#we-cv') as HTMLCanvasElement;
    drawMinimap(cv, edited(m, ed));
    const ctx = cv.getContext('2d')!;
    const { S, ox, oy } = geom(cv, m);
    const line = (k: string, color: string, w: number, dash = false) => {
      const [a, b] = toCells(k);
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; if (dash) ctx.setLineDash([6, 5]);
      ctx.beginPath();
      if (a.r === b.r) { const x = ox + Math.max(a.c, b.c) * S; ctx.moveTo(x, oy + a.r * S + 3); ctx.lineTo(x, oy + (a.r + 1) * S - 3); }
      else { const y = oy + Math.max(a.r, b.r) * S; ctx.moveTo(ox + a.c * S + 3, y); ctx.lineTo(ox + (a.c + 1) * S - 3, y); }
      ctx.stroke(); ctx.restore();
    };
    const box = (k: string, color: string, dash = false) => {
      const c = cellOf(k);
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(3, S * 0.06); if (dash) ctx.setLineDash([6, 5]);
      ctx.strokeRect(ox + c.c * S + 4, oy + c.r * S + 4, S - 8, S - 8); ctx.restore();
    };
    // alterações: verde = novo · rosa tracejado = tirado · azul = porta nova/trocada
    for (const k of ed?.add ?? []) line(k, '#36e07a', Math.max(4, S * 0.09));
    for (const k of ed?.remove ?? []) line(k, '#ff5cf0', Math.max(3, S * 0.07), true);
    for (const k of [...(ed?.block ?? []), ...(ed?.wood ?? [])]) box(k, '#36e07a');
    for (const k of [...(ed?.unblock ?? []), ...(ed?.unwood ?? [])]) box(k, '#ff5cf0', true);
    for (const [k, t] of Object.entries(ed?.doors ?? {})) line(k, t === 'none' ? '#ff5cf0' : '#4db8ff', Math.max(3, S * 0.05), t === 'none');
    if (hoverEdge) line(hoverEdge, 'rgba(255,230,90,.9)', Math.max(6, S * 0.12));
    if (hoverCell) box(hoverCell, 'rgba(255,230,90,.9)');
    // coordenadas
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `${Math.max(10, S * 0.16)}px sans-serif`; ctx.textAlign = 'center';
    for (let c = 0; c < m.cols; c++) ctx.fillText(String(c), ox + (c + 0.5) * S, oy - 4);
    ctx.textAlign = 'right';
    for (let r = 0; r < m.rows; r++) ctx.fillText(String(r), ox - 4, oy + (r + 0.55) * S);
  };

  /** Aplica a ferramenta numa borda ou num Espaço. */
  const use = (edge: string | null, cell: string | null) => {
    const m = MAPS[cur];
    const ed = (edits[cur] ??= { add: [], remove: [] });
    ed.block ??= []; ed.unblock ??= []; ed.wood ??= []; ed.unwood ??= []; ed.doors ??= {}; ed.areas ??= {}; ed.entryAdd ??= []; ed.entryRemove ??= [];
    /** Áreas Iniciais: põe/tira o Espaço da área `idx` (null = tira de todas) */
    const setArea = (c: string, idx: number | null) => {
      const lists = [0, 1, 2, 3].map(i => now.startAreas[i]?.map(key) ?? []);
      const was = lists.findIndex(l => l.includes(c));
      for (const l of lists) { const j = l.indexOf(c); if (j >= 0) l.splice(j, 1); }
      if (idx !== null && was !== idx) lists[idx].push(c);
      lists.forEach((l, i) => { const orig = (m.startAreas[i] ?? []).map(key); if (sameList(l, orig)) delete ed.areas![i]; else ed.areas![i] = l; });
    };
    const now = edited(m, ed);
    const origDoors = new Map(m.doors.map(d => [edgeKey(d.a, d.b), doorType(d)]));
    const setDoor = (k: string, t: DoorType | 'none') => { if ((origDoors.get(k) ?? 'none') === t) delete ed.doors![k]; else ed.doors![k] = t; };
    const doorNow = (k: string) => { const d = now.doors.find(x => edgeKey(x.a, x.b) === k); return d ? doorType(d) : null; };
    if (edge) {
      const wallOrig = m.walls.some(([a, b]) => edgeKey(a, b) === edge);
      const wallNow = now.walls.some(([a, b]) => edgeKey(a, b) === edge);
      if (tool === 'wall') toggleIn(ed.add, ed.remove, edge, wallOrig, !wallNow);
      else if (tool === 'erase') { toggleIn(ed.add, ed.remove, edge, wallOrig, false); if (doorNow(edge)) setDoor(edge, 'none'); }
      else if (tool === 'fechada' || tool === 'aberta' || tool === 'pequena' || tool === 'trancada') setDoor(edge, doorNow(edge) === tool ? 'none' : tool); // mesma porta de novo = tira
    } else if (cell) {
      const pilOrig = m.pillars.some(p => key(p) === cell), pilNow = now.pillars.some(p => key(p) === cell);
      const roomOrig = m.rooms.some(p => key(p) === cell), roomNow = now.rooms.some(p => key(p) === cell);
      if (tool === 'block') toggleIn(ed.block, ed.unblock, cell, pilOrig, !pilNow);
      else if (tool === 'wood') toggleIn(ed.wood, ed.unwood, cell, roomOrig, !roomNow);
      else if (tool === 'area') setArea(cell, area);
      else if (tool === 'entry') { const eo = m.entryMarkers.some(p => key(p) === cell), en = now.entryMarkers.some(p => key(p) === cell); toggleIn(ed.entryAdd, ed.entryRemove, cell, eo, !en); }
      else if (tool === 'erase') {
        toggleIn(ed.block, ed.unblock, cell, pilOrig, false); toggleIn(ed.wood, ed.unwood, cell, roomOrig, false);
        setArea(cell, null);
        toggleIn(ed.entryAdd, ed.entryRemove, cell, m.entryMarkers.some(p => key(p) === cell), false);
      }
    }
    save(edits);
    render();
  };

  const render = () => {
    const m = MAPS[cur];
    const ed = edits[cur];
    const done = ids.filter(id => edits[id]?.reviewed).length;
    el.innerHTML = `<div class="we-box">
      <div class="we-head"><h2>🧱 Revisão dos mapas</h2>
        <select id="we-map">${ids.map(id => `<option value="${id}" ${id === cur ? 'selected' : ''}>${edits[id]?.reviewed ? '✅' : '⬜'} ${BTG_MAP_IDS.has(id) ? '💀 ' : ''}${MAPS[id].name}${count(edits[id]) ? ` (${count(edits[id])} alt.)` : ''}</option>`).join('')}</select>
        <span class="we-prog">${done}/${ids.length} revisados</span>
        <button id="we-close">✕ Fechar</button></div>
      <div class="we-tools">${TOOLS.map(t => `<button class="we-tool ${t.id === tool ? 'on' : ''}" data-tool="${t.id}" title="${t.name}"><span>${t.icon}</span>${t.name}</button>`).join('')}
        ${tool === 'area' ? `<span class="we-areas">Jogador: ${[0, 1, 2, 3].map(i => `<button class="${i === area ? 'on' : ''}" data-area="${i}">${i + 1}</button>`).join('')}</span>` : ''}</div>
      <p class="we-help">${tool === 'area' ? `Clique <b>num Espaço</b> para pôr/tirar da Área Inicial do <b>Jogador ${area + 1}</b> (é onde os Heróis começam e ressuscitam)` : tool === 'entry' ? 'Clique <b>num Espaço</b> para pôr/tirar uma Entrada de Monstro (⚑, onde os Monstros voltam)' : tool === 'block' || tool === 'wood' ? 'Clique <b>num Espaço</b>' : tool === 'erase' ? 'Clique <b>numa borda</b> (tira parede/porta) ou <b>no meio de um Espaço</b> (tira bloqueio/deck)' : 'Clique <b>entre dois Espaços</b>'}${tool === 'erase' ? '.' : ' — clicar de novo no mesmo lugar desfaz.'}
        Marcas: <span style="color:#36e07a">verde</span> = novo · <span style="color:#ff5cf0">rosa tracejado</span> = tirado · <span style="color:#4db8ff">azul</span> = porta nova/trocada.
        Espaço bloqueado (verde listrado) funciona como parede. Compare com o Livro de Campanha e, no fim, copie o texto e me mande.</p>
      <div class="we-main"><div class="we-edit"><canvas id="we-cv" width="${m.cols * 110 + 50}" height="${m.rows * 110 + 50}"></canvas></div></div>
      <div class="we-row">
        <label><input type="checkbox" id="we-rev" ${ed?.reviewed ? 'checked' : ''}/> ✅ Revisado</label>
        <input id="we-note" placeholder="Observação deste mapa (opcional)" value="${(ed?.note ?? '').replace(/"/g, '&quot;')}"/>
        <button id="we-undo" ${count(ed) ? '' : 'disabled'}>↩ Desfazer alterações deste mapa</button>
        <button id="we-prev">◀ Anterior</button><button id="we-next">Próximo ▶</button>
      </div>
      <div class="we-out"><textarea id="we-text" readonly>${exportText()}</textarea>
        <button class="primary" id="we-copy">📋 Copiar para mandar</button></div>
    </div>`;
    const cv = el.querySelector('#we-cv') as HTMLCanvasElement;
    draw();
    cv.onmousemove = ev => {
      const p = pick(cv, ev);
      if (p.edge !== hoverEdge || p.cell !== hoverCell) { hoverEdge = p.edge; hoverCell = p.cell; draw(); }
      cv.style.cursor = p.edge || p.cell ? 'pointer' : 'default';
    };
    cv.onmouseleave = () => { hoverEdge = hoverCell = null; draw(); };
    cv.onclick = ev => { const p = pick(cv, ev); if (p.edge || p.cell) use(p.edge, p.cell); };
    el.querySelectorAll<HTMLElement>('[data-tool]').forEach(b => { b.onclick = () => { tool = b.dataset.tool as Tool; render(); }; });
    el.querySelectorAll<HTMLElement>('[data-area]').forEach(b => { b.onclick = () => { area = Number(b.dataset.area); render(); }; });
    const ensure = () => (edits[cur] ??= { add: [], remove: [] });
    (el.querySelector('#we-map') as HTMLSelectElement).onchange = ev => { cur = (ev.target as HTMLSelectElement).value; hoverEdge = hoverCell = null; render(); };
    (el.querySelector('#we-rev') as HTMLInputElement).onchange = ev => { ensure().reviewed = (ev.target as HTMLInputElement).checked; save(edits); render(); };
    (el.querySelector('#we-note') as HTMLInputElement).onchange = ev => { ensure().note = (ev.target as HTMLInputElement).value.trim(); save(edits); render(); };
    (el.querySelector('#we-undo') as HTMLElement).onclick = () => {
      const e = edits[cur];
      if (e) { e.add = []; e.remove = []; e.block = []; e.unblock = []; e.wood = []; e.unwood = []; e.doors = {}; e.areas = {}; e.entryAdd = []; e.entryRemove = []; }
      save(edits); render();
    };
    const step = (d: number) => { cur = ids[(ids.indexOf(cur) + d + ids.length) % ids.length]; hoverEdge = hoverCell = null; render(); };
    (el.querySelector('#we-prev') as HTMLElement).onclick = () => step(-1);
    (el.querySelector('#we-next') as HTMLElement).onclick = () => step(1);
    (el.querySelector('#we-copy') as HTMLElement).onclick = () => {
      const t = el.querySelector('#we-text') as HTMLTextAreaElement;
      navigator.clipboard?.writeText(t.value).then(() => { (el.querySelector('#we-copy') as HTMLElement).textContent = '✔ Copiado!'; }, () => { t.select(); });
    };
    (el.querySelector('#we-close') as HTMLElement).onclick = () => { el.remove(); if (location.hash === '#paredes') history.replaceState(null, '', location.pathname + location.search); };
  };
  render();
}
