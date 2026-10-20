import { getSettings, onSettings, saveSettings } from '../ui/settings';

// Controle rápido de som: botão para silenciar tudo e volume da música (menu inicial e barra da partida).
export function soundWidget(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sndw';
  el.innerHTML = `<button class="sndw-mute" title="Ligar/desligar todos os sons"></button>
    <label class="sndw-vol" title="Volume da música"><span>🎵</span><input type="range" min="0" max="100" step="5"/></label>`;
  const btn = el.querySelector('button') as HTMLButtonElement;
  const rng = el.querySelector('input') as HTMLInputElement;
  const paint = () => {
    const st = getSettings();
    btn.textContent = st.muted ? '🔇' : '🔊';
    btn.classList.toggle('off', st.muted);
    rng.value = String(Math.round((st.music ? st.musicVolume : 0) * 100));
    rng.disabled = st.muted;
  };
  btn.onclick = e => { e.stopPropagation(); saveSettings({ ...getSettings(), muted: !getSettings().muted }); };
  rng.oninput = () => { const v = Number(rng.value) / 100; saveSettings({ ...getSettings(), musicVolume: v, music: v > 0 }); };
  rng.onpointerdown = e => e.stopPropagation();
  paint();
  onSettings(paint);
  return el;
}
