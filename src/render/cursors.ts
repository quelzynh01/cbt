// Cursores do mouse no tabuleiro (SVG desenhados aqui, 32x32): luva, espada, arco, botas, chave e mão de arrastar.

const svg = (body: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`)}`;
const OUT = 'stroke="#2a1606" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"';

const ARROW = svg(`<path d="M3 2 L3 24 L9 19 L13 28 L17 26 L13 17 L21 17 Z" fill="#f3d27a" ${OUT}/><path d="M5 6 L5 19 L9 16" fill="none" stroke="#fff6d8" stroke-width="1.2"/>`);
const SWORD = svg(`<path d="M3 3 L8 3 L22 17 L17 22 L3 8 Z" fill="#e8eef5" ${OUT}/><path d="M5 5 L19 19" stroke="#9fb0c2" stroke-width="1.2"/>
  <path d="M16 23 L23 16 L26 19 L19 26 Z" fill="#c9962e" ${OUT}/><path d="M21 24 L24 21 L29 26 L26 29 Z" fill="#7a4a22" ${OUT}/>`);
const BOW = svg(`<path d="M6 3 C22 5 27 10 29 26" fill="none" stroke="#2a1606" stroke-width="4.5" stroke-linecap="round"/><path d="M6 3 C22 5 27 10 29 26" fill="none" stroke="#a8692c" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M6 3 L29 26" stroke="#f3ecd8" stroke-width="1"/><path d="M2 2 L20 20" stroke="#2a1606" stroke-width="3.2" stroke-linecap="round"/><path d="M2 2 L20 20" stroke="#e8eef5" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M2 2 L8 3.5 L3.5 8 Z" fill="#cfd8e2" ${OUT}/><path d="M17 21 L21 17 M19 23 L23 19" stroke="#d8432f" stroke-width="2"/>`);
const BOOTS = svg(`<path d="M5 4 L13 4 L13 16 L20 18 Q24 19 24 23 L24 25 L5 25 Z" fill="#8a5a2b" ${OUT}/><path d="M5 21 L24 21" stroke="#2a1606" stroke-width="1.4"/>
  <path d="M5 4 L13 4 L13 8 L5 8 Z" fill="#c9962e" ${OUT}/><circle cx="27" cy="7" r="3" fill="#5ab0ff" ${OUT}/>`);
const KEY = svg(`<circle cx="9" cy="9" r="6" fill="#f0c243" ${OUT}/><circle cx="9" cy="9" r="2.3" fill="#2a1606"/><path d="M13 13 L27 27 M20 20 L23 17 M24 24 L27 21" stroke="#2a1606" stroke-width="4.4" stroke-linecap="round"/>
  <path d="M13 13 L27 27 M20 20 L23 17 M24 24 L27 21" stroke="#f0c243" stroke-width="2.4" stroke-linecap="round"/>`);
const HAND = (closed: boolean) => svg(closed
  ? `<path d="M8 12 Q8 9 11 9 L22 9 Q25 9 25 13 L25 20 Q25 27 18 27 L14 27 Q8 27 8 21 Z" fill="#f2c8a0" ${OUT}/><path d="M12 9 L12 13 M16 9 L16 13 M20 9 L20 13" stroke="#2a1606" stroke-width="1.3"/>`
  : `<path d="M9 14 L9 6 Q9 4 11 4 Q13 4 13 6 L13 12 L13 4 Q13 2 15 2 Q17 2 17 4 L17 12 L17 5 Q17 3 19 3 Q21 3 21 5 L21 13 L21 8 Q21 6 23 6 Q25 6 25 8 L25 20 Q25 28 17 28 L15 28 Q10 28 7 22 L4 16 Q3 13 6 13 Q8 13 9 16 Z" fill="#f2c8a0" ${OUT}/>`);
const POINT = svg(`<path d="M11 3 Q11 1 13 1 Q15 1 15 3 L15 13 L22 14 Q26 15 26 19 L25 26 Q24 30 19 30 L14 30 Q10 30 8 26 L5 19 Q4 16 7 16 Q9 16 11 19 Z" fill="#f2c8a0" ${OUT}/>
  <path d="M15 13 L15 18 M19 14 L19 18 M23 15 L23 19" stroke="#2a1606" stroke-width="1.2"/>`);

export type CursorKind = 'default' | 'melee' | 'ranged' | 'move' | 'door' | 'grab' | 'grabbing' | 'pointer';
const CSS: Record<CursorKind, string> = {
  default: `url("${ARROW}") 3 2, default`,
  pointer: `url("${POINT}") 13 1, pointer`,
  melee: `url("${SWORD}") 3 3, crosshair`,
  ranged: `url("${BOW}") 2 2, crosshair`,
  move: `url("${BOOTS}") 14 25, pointer`,
  door: `url("${KEY}") 9 9, pointer`,
  grab: `url("${HAND(false)}") 16 16, grab`,
  grabbing: `url("${HAND(true)}") 16 16, grabbing`,
};

let current: CursorKind | null = null;
/** Troca o cursor do canvas (só mexe no estilo quando muda). */
export function setCursor(el: HTMLElement, kind: CursorKind) {
  if (current === kind && el.style.cursor) return;
  current = kind;
  el.style.cursor = CSS[kind];
}
/** Cursor padrão do jogo para o resto da interface (painéis, menus). */
export const DEFAULT_CURSOR = CSS.default;
export const POINTER_CURSOR = CSS.pointer;
