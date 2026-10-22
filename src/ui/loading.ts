// Tela de carregamento: conta os arquivos esperados e os já carregados.
let total = 0;
let done = 0;
let el: HTMLElement | null = null;

export const loader = {
  expect(n: number) { total += n; paint(); },
  tick() { done++; paint(); },
};

function paint() {
  if (!el) return;
  const p = total ? Math.min(1, done / total) : 0;
  (el.querySelector('.ld-bar i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
  (el.querySelector('.ld-txt') as HTMLElement).textContent = `Carregando… ${done}/${total}`;
}

export function showLoading() {
  el = document.createElement('div');
  el.id = 'loading';
  el.innerHTML = `<div class="ld-box"><div class="menu-logo">CBT</div><h2>Champions Battle Tactics</h2>
    <div class="ld-bar"><i></i></div><div class="ld-txt">Carregando…</div></div>`;
  document.body.append(el);
  paint();
}

export function hideLoading() {
  if (!el) return;
  const e = el;
  el = null;
  e.classList.add('out');
  setTimeout(() => e.remove(), 450);
}
