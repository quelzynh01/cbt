import { getSettings, onSettings, saveSettings } from '../ui/settings';

// Controle rápido de som: botão para silenciar tudo e o volume geral (música e efeitos juntos) — menu inicial e barra da partida.
// O volume de cada um (música / efeitos) fica nas Configurações.
export function soundWidget(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sndw';
  el.innerHTML = `<button class="sndw-mute" title="Ligar/desligar todos os sons"></button>
    <label class="sndw-vol" title="Volume geral (música e efeitos)"><span>🔉</span><input type="range" min="0" max="100" step="5"/></label>`;
  const btn = el.querySelector('button') as HTMLButtonElement;
  const rng = el.querySelector('input') as HTMLInputElement;
  const paint = () => {
    const st = getSettings();
    btn.textContent = st.muted ? '🔇' : '🔊';
    btn.classList.toggle('off', st.muted);
    rng.value = String(Math.round((st.master ?? 1) * 100));
    rng.disabled = st.muted;
  };
  btn.onclick = e => { e.stopPropagation(); saveSettings({ ...getSettings(), muted: !getSettings().muted }); };
  rng.oninput = () => { saveSettings({ ...getSettings(), master: Number(rng.value) / 100 }); };
  rng.onpointerdown = e => e.stopPropagation();
  paint();
  onSettings(paint);
  return el;
}
