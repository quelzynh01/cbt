import { CARDS, HEROES } from '../engine/data';
import { drawFace } from '../render/chibi';
import { ITEM_LEVEL, itemCard, paintCardArt } from './cardview';

// Editor de inventário da Guilda (equipamento inicial e Fase de Melhorias):
// cada Herói mostra seus espaços; clicar num espaço vazio ou numa carta abre a lista das suas cartas para escolher.

/** Onde está cada carta: um Herói, 'pool' (sem Herói ainda) ou 'descartar'. */
export interface InvItem { id: string; to: string }

export interface InvOptions {
  heroes: string[];
  color: string;
  /** Espaços do Herói com estas cartas (máx. 4 + espaços Mágicos do Tomo; Maldição pode ocupar 1). */
  slots: (hero: string, cards: string[]) => { used: number; max: number; magicExtra: number };
  /** Maldição do Herói (texto curto), se houver. */
  curse?: (hero: string) => string | null;
  /** Pode descartar cartas (Fase de Melhorias). */
  discard: boolean;
  /** Só leitura (já confirmou). */
  ready?: boolean;
  /** Modo Teste: qualquer carta do jogo pode ser equipada (escolhida por nível na janela do espaço). */
  catalog?: boolean;
  /** Bolsa de cada Herói (marcadores de Exploração: poções, baús…): arrastar de um Herói para outro. */
  bags?: {
    toks: BagTok[];
    /** O Herói pode receber marcadores (ex.: morto não pode). */
    canHold: (hero: string) => boolean;
    move: (tokId: string, hero: string) => void;
  };
}

/** Marcador numa bolsa: `locked` não se move (marcador de Missão). */
export interface BagTok { id: string; to: string; img: string | null; name: string; locked?: boolean }

/** Marcador escolhido com um toque (o próximo toque numa bolsa move ele para lá). */
let selTok: string | null = null;
const BAG_SLOTS = 4;

/** Nível aberto no catálogo do Modo Teste. */
let catLevel = 'I';
const CAT_LEVELS: [string, string][] = [['I', 'Iniciais'], ['1', 'Nível 1'], ['2', 'Nível 2'], ['3', 'Nível 3'], ['4', 'Nível 4'], ['5', 'Nível 5'], ['R', 'Recompensas']];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Erros extras do editor (cartas ainda sem Herói). */
export function poolErrors(items: InvItem[], discard: boolean): string[] {
  const left = items.filter(x => x.to === 'pool');
  if (!left.length) return [];
  return [`Ainda sem Herói: ${left.map(x => CARDS[x.id]?.name ?? x.id).join(', ')} — clique num espaço para equipar${discard ? ' ou descarte' : ''}.`];
}

export function invEditorHtml(items: InvItem[], o: InvOptions): string {
  const heroCols = o.heroes.map(h => {
    const mine = items.map((x, i) => ({ ...x, i })).filter(x => x.to === h);
    const sl = o.slots(h, mine.map(x => x.id));
    const total = Math.max(sl.max + sl.magicExtra, mine.length);
    const curse = o.curse?.(h);
    const slots: string[] = mine.map(x => `<button class="inv-slot full" data-slot="${h}" data-item="${x.i}" title="Trocar ou tirar esta carta" ${o.ready ? 'disabled' : ''}>${itemCard(x.id)}</button>`);
    for (let k = mine.length; k < total; k++) slots.push(`<button class="inv-slot empty ${k >= sl.max ? 'magic' : ''}" data-slot="${h}" ${o.ready ? 'disabled' : ''}><span>＋</span><small>${k >= sl.max ? 'Espaço Mágico' : 'Espaço vazio'}</small></button>`);
    return `<div class="inv-hero ${sl.used > sl.max ? 'over' : ''}" data-hero="${h}" style="--gc:${o.color}">
      <div class="inv-hh"><canvas width="56" height="56" data-iface="${h}"></canvas><div><b>${HEROES[h].name}</b><small>${HEROES[h].title}</small></div>
        <span class="inv-count ${sl.used > sl.max ? 'bad' : ''}">${sl.used}/${sl.max}${sl.magicExtra ? ` +${sl.magicExtra}✨` : ''}</span></div>
      <div class="inv-ab" title="${esc(HEROES[h].abilityText)}"><b>${esc(HEROES[h].abilityName)}</b> — ${esc(HEROES[h].abilityText)}</div>
      ${curse ? `<div class="inv-curse">☠ ${esc(curse)}</div>` : ''}
      <div class="inv-slots">${slots.join('')}</div>${o.bags ? bagHtml(h, o) : ''}</div>`;
  }).join('');
  const pool = items.map((x, i) => ({ ...x, i })).filter(x => x.to === 'pool');
  const disc = items.map((x, i) => ({ ...x, i })).filter(x => x.to === 'descartar');
  return `<div class="inv-ed">
    <div class="inv-heroes">${heroCols}</div>
    ${pool.length ? `<div class="inv-pool" data-pool="pool"><h4>🎒 Cartas sem Herói <small>— clique para equipar${o.discard ? ' ou descartar' : ''}</small></h4><div class="inv-row">${pool.map(x => `<button class="inv-slot full" data-item="${x.i}" ${o.ready ? 'disabled' : ''}>${itemCard(x.id)}</button>`).join('')}</div></div>` : ''}
    ${disc.length ? `<div class="inv-pool disc"><h4>🗑 Descartadas <small>— clique para recuperar</small></h4><div class="inv-row">${disc.map(x => `<button class="inv-slot full disc" data-item="${x.i}" ${o.ready ? 'disabled' : ''}>${itemCard(x.id)}</button>`).join('')}</div></div>` : ''}
  </div>`;
}

/** Bolsa do Herói: os marcadores e espaços vazios (sempre pelo menos 4). */
function bagHtml(h: string, o: InvOptions): string {
  const b = o.bags!;
  const mine = b.toks.filter(t => t.to === h);
  const hold = b.canHold(h);
  const empty = Math.max(0, BAG_SLOTS - mine.length);
  return `<div class="inv-bag ${hold ? '' : 'off'}" data-bag="${h}">
    <div class="inv-bagh">🎒 Bolsa ${hold ? '' : '<small>(não pode receber agora)</small>'}</div>
    <div class="inv-toks">${mine.map(t => `<button class="inv-tok ${t.locked ? 'locked' : ''} ${selTok === t.id ? 'sel' : ''}" data-tok="${t.id}" title="${esc(t.name)}${t.locked ? ' (não se move)' : ''}">${t.img ? `<img src="${t.img}" alt="" draggable="false"/>` : `<span>${esc(t.name)}</span>`}</button>`).join('')}${'<span class="inv-tok empty"></span>'.repeat(empty)}</div>
  </div>`;
}

/** Liga os cliques do editor. `rerender` redesenha a tela depois de cada mudança. */
export function bindInvEditor(root: ParentNode, items: InvItem[], o: InvOptions, rerender: () => void) {
  paintCardArt(root);
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-iface]').forEach(cv => drawFace(cv, cv.dataset.iface!, o.color));
  if (o.ready) return;
  let dragged = false;
  root.querySelectorAll<HTMLElement>('.inv-slot').forEach(b => {
    b.onclick = () => {
      if (dragged) { dragged = false; return; } // soltou depois de arrastar: não abre a janela
      const hero = b.dataset.slot ?? null;
      const item = b.dataset.item !== undefined ? Number(b.dataset.item) : null;
      openPicker(items, o, hero, item, rerender);
    };
  });
  if (o.bags) bindBags(root, o, rerender);
  // arrastar uma carta: soltar em outra carta troca as duas de lugar; num espaço vazio ou no Herói, ela vai para ele
  root.querySelectorAll<HTMLElement>('.inv-slot.full[data-item]').forEach(b => {
    b.onpointerdown = e => {
      if (e.button !== 0) return;
      const from = Number(b.dataset.item);
      const x0 = e.clientX, y0 = e.clientY;
      let ghost: HTMLElement | null = null;
      let over: HTMLElement | null = null;
      const target = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        return el?.closest<HTMLElement>('.inv-slot, .inv-hero, [data-pool]') ?? null;
      };
      const move = (ev: PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
          ghost = b.cloneNode(true) as HTMLElement;
          ghost.classList.add('inv-ghost');
          document.body.append(ghost);
          b.classList.add('inv-dragging');
        }
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
        const t = target(ev.clientX, ev.clientY);
        if (t !== over) { over?.classList.remove('inv-over'); over = t && t !== b ? t : null; over?.classList.add('inv-over'); }
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!ghost) return;
        ghost.remove();
        b.classList.remove('inv-dragging');
        over?.classList.remove('inv-over');
        dragged = true;
        setTimeout(() => { dragged = false; }, 0);
        const t = target(ev.clientX, ev.clientY);
        if (!t || t === b) return;
        const cur = items[from];
        if (t.dataset.item !== undefined) {
          // troca as duas cartas de lugar
          const other = items[Number(t.dataset.item)];
          if (other === cur) return;
          const was = cur.to;
          cur.to = other.to;
          other.to = was;
        } else if (t.dataset.slot) cur.to = t.dataset.slot;
        else if (t.dataset.hero) cur.to = t.dataset.hero;
        else if (t.dataset.pool) cur.to = 'pool';
        else return;
        rerender();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  });
}

/** Bolsas: arrastar um marcador para a bolsa (ou o quadro) de outro Herói; ou tocar no marcador e depois na bolsa. */
function bindBags(root: ParentNode, o: InvOptions, rerender: () => void) {
  const b = o.bags!;
  const dest = (x: number, y: number) => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-bag], .inv-hero');
    const h = el?.dataset.bag ?? el?.dataset.hero;
    return h && b.canHold(h) ? h : null;
  };
  root.querySelectorAll<HTMLElement>('[data-bag]').forEach(bag => {
    bag.onclick = () => {
      if (!selTok || !b.canHold(bag.dataset.bag!)) return;
      const id = selTok;
      selTok = null;
      b.move(id, bag.dataset.bag!);
      rerender();
    };
  });
  root.querySelectorAll<HTMLElement>('.inv-tok[data-tok]').forEach(t => {
    const id = t.dataset.tok!;
    if (t.classList.contains('locked')) return;
    t.onpointerdown = e => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const x0 = e.clientX, y0 = e.clientY;
      let ghost: HTMLElement | null = null;
      let over: HTMLElement | null = null;
      const move = (ev: PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          ghost = t.cloneNode(true) as HTMLElement;
          ghost.classList.add('inv-tokghost');
          document.body.append(ghost);
          t.classList.add('inv-dragging');
        }
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
        const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-bag]') ?? null;
        if (el !== over) { over?.classList.remove('inv-over'); over = el && b.canHold(el.dataset.bag!) ? el : null; over?.classList.add('inv-over'); }
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        over?.classList.remove('inv-over');
        if (!ghost) {
          // toque: escolhe o marcador (o próximo toque numa bolsa move ele)
          selTok = selTok === id ? null : id;
          rerender();
          return;
        }
        ghost.remove();
        t.classList.remove('inv-dragging');
        const h = dest(ev.clientX, ev.clientY);
        selTok = null;
        if (h) b.move(id, h);
        rerender();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    t.onclick = e => e.stopPropagation();
  });
}

/** Janela de escolha: as cartas disponíveis para este espaço (e as opções para a carta clicada). */
function openPicker(items: InvItem[], o: InvOptions, hero: string | null, itemIdx: number | null, rerender: () => void) {
  let el = document.getElementById('invpick');
  if (!el) { el = document.createElement('div'); el.id = 'invpick'; document.body.append(el); }
  const close = () => { el!.classList.add('hidden'); el!.innerHTML = ''; window.removeEventListener('keydown', key, true); };
  const key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopImmediatePropagation(); close(); } };
  window.addEventListener('keydown', key, true);
  const cur = itemIdx !== null ? items[itemIdx] : null;
  const where = (to: string) => to === 'pool' ? 'sem Herói' : to === 'descartar' ? 'descartada' : `com ${HEROES[to]?.name ?? to}`;
  let title: string, body: string;
  if (hero) {
    // espaço de um Herói: escolher qual carta vai nele
    const cands = items.map((x, i) => ({ ...x, i })).filter(x => x.i !== itemIdx && x.to !== hero && (o.discard || x.to !== 'descartar'));
    cands.sort((a, b) => (a.to === 'pool' ? 0 : a.to === 'descartar' ? 2 : 1) - (b.to === 'pool' ? 0 : b.to === 'descartar' ? 2 : 1));
    title = `${cur ? 'Trocar' : 'Equipar'} — <b>${HEROES[hero].name}</b>`;
    body = `${cur ? `<div class="ip-cur"><span>No espaço:</span> <b>${CARDS[cur.id]?.name}</b>
        <button data-act="pool">↩ Tirar do Herói</button>${o.discard ? '<button data-act="descartar">🗑 Descartar</button>' : ''}</div>` : ''}
      ${cands.length ? `<p class="muted">Escolha uma carta${cur ? ' para trocar (a atual vai para onde a escolhida estava)' : ''}:</p>
      <div class="ip-grid">${cands.map(x => `<button class="ip-card" data-pick="${x.i}">${itemCard(x.id)}<span class="ip-where ${x.to === 'pool' ? 'free' : ''}">${where(x.to)}</span></button>`).join('')}</div>`
        : o.catalog ? '' : '<p class="muted">Nenhuma outra carta disponível.</p>'}
      ${o.catalog ? `<h4 class="ip-cat-h">📚 Todas as cartas</h4>
      <div class="lib-filter ip-lv">${CAT_LEVELS.map(([v, n]) => `<button data-lv="${v}" class="${catLevel === v ? 'primary' : ''}">${ITEM_LEVEL[v] ? `<span class="lvdot" style="background:${ITEM_LEVEL[v].color}"></span>` : ''}${n}</button>`).join('')}</div>
      <div class="ip-grid">${Object.values(CARDS).filter(c => c.level === catLevel).map(c => `<button class="ip-card" data-new="${c.id}">${itemCard(c.id)}</button>`).join('')}</div>` : ''}`;
  } else {
    // carta sem Herói (ou descartada): escolher o Herói
    title = `<b>${CARDS[cur!.id]?.name}</b> — equipar em qual Herói?`;
    body = `<div class="ip-card-big">${itemCard(cur!.id)}</div>
      <div class="ip-heroes">${o.heroes.map(h => { const n = items.filter(x => x.to === h).map(x => x.id); const sl = o.slots(h, [...n, cur!.id]); const full = sl.used > sl.max; return `<button data-hero="${h}" ${full ? 'class="full"' : ''}>${HEROES[h].name}<small>${full ? 'sem espaço' : `${sl.used}/${sl.max}`}</small></button>`; }).join('')}
      ${o.discard && cur!.to !== 'descartar' ? '<button data-act="descartar">🗑 Descartar</button>' : ''}${cur!.to === 'descartar' ? '<button data-act="pool">↩ Recuperar (sem Herói)</button>' : ''}</div>`;
  }
  el.innerHTML = `<div class="ip-box"><div class="ip-head"><span>${title}</span><button class="ip-x" title="Fechar (Esc)">✕</button></div>${body}</div>`;
  el.classList.remove('hidden');
  paintCardArt(el);
  el.onclick = e => { if (e.target === el) close(); };
  (el.querySelector('.ip-x') as HTMLElement).onclick = close;
  const done = () => { close(); rerender(); };
  el.querySelectorAll<HTMLElement>('[data-act]').forEach(b => { b.onclick = () => { if (cur) cur.to = b.dataset.act!; done(); }; });
  el.querySelectorAll<HTMLElement>('[data-hero]').forEach(b => { b.onclick = () => { if (cur) cur.to = b.dataset.hero!; done(); }; });
  // catálogo (Modo Teste): a carta escolhida entra no espaço (a que estava sai)
  el.querySelectorAll<HTMLElement>('[data-new]').forEach(b => {
    b.onclick = () => {
      if (cur) cur.id = b.dataset.new!;
      else items.push({ id: b.dataset.new!, to: hero! });
      done();
    };
  });
  el.querySelectorAll<HTMLElement>('[data-lv]').forEach(b => { b.onclick = () => { catLevel = b.dataset.lv!; openPicker(items, o, hero, itemIdx, rerender); }; });
  el.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => {
    b.onclick = () => {
      const pick = items[Number(b.dataset.pick)];
      const from = pick.to;
      pick.to = hero!;
      // a carta que estava no espaço vai para onde a escolhida estava (troca)
      if (cur) cur.to = from === 'descartar' ? 'pool' : from;
      done();
    };
  });
}
