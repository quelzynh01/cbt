import { play } from '../audio/sfx';

// Janela de confirmação no estilo do jogo (no lugar do confirm() do navegador).
// Funciona em qualquer tela: partida, menu, campanha e sala online.

export interface ConfirmOptions {
  /** Ícone grande no topo (emoji). */
  icon?: string;
  title: string;
  /** Texto (pode ter HTML simples). */
  body?: string;
  yes?: string;
  no?: string;
  /** Ação que perde algo (sair, abandonar): o botão de confirmar fica vermelho. */
  danger?: boolean;
}

export function gameConfirm(o: ConfirmOptions): Promise<boolean> {
  document.getElementById('gamedialog')?.remove();
  const el = document.createElement('div');
  el.id = 'gamedialog';
  el.innerHTML = `<div class="gd-box ${o.danger ? 'danger' : ''}" role="dialog" aria-modal="true">
      ${o.icon ? `<div class="gd-icon">${o.icon}</div>` : ''}
      <div class="gd-title">${o.title}</div>
      ${o.body ? `<div class="gd-body">${o.body}</div>` : ''}
      <div class="gd-btns"><button class="gd-no">${o.no ?? 'Cancelar'}</button><button class="primary gd-yes">${o.yes ?? 'Confirmar'}</button></div>
    </div>`;
  document.body.append(el);
  play('scan');
  return new Promise(res => {
    const end = (v: boolean) => { window.removeEventListener('keydown', key, true); el.classList.add('out'); setTimeout(() => el.remove(), 150); res(v); };
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); end(true); }
      else if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(false); }
      else e.stopImmediatePropagation(); // com a janela aberta, os atalhos do jogo não valem
    };
    window.addEventListener('keydown', key, true);
    el.onpointerdown = e => { if (e.target === el) end(false); };
    (el.querySelector('.gd-yes') as HTMLElement).onclick = () => end(true);
    (el.querySelector('.gd-no') as HTMLElement).onclick = () => end(false);
    (el.querySelector(o.danger ? '.gd-no' : '.gd-yes') as HTMLElement).focus();
  });
}
