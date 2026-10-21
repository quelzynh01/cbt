import { getSettings, onSettings } from '../ui/settings';

// Música de fundo em loop: musica-menu (menus) e musica-game (durante a partida). Arquivos em public/sounds.
// Os navegadores só deixam tocar som depois do primeiro clique/tecla: a música começa nesse momento.

type Track = 'menu' | 'partida';
const FILES: Record<Track, string> = { menu: 'musica-menu', partida: 'musica-game' };
const players = new Map<Track, HTMLAudioElement>();
let current: Track | null = null;
let unlocked = false;

function player(t: Track): HTMLAudioElement {
  let a = players.get(t);
  if (!a) {
    a = new Audio(`${import.meta.env.BASE_URL}sounds/${FILES[t]}.mp3`);
    a.loop = true;
    a.preload = 'auto';
    a.addEventListener('error', () => { /* arquivo ainda não colocado: sem música */ });
    players.set(t, a);
  }
  return a;
}

function apply() {
  const st = getSettings();
  for (const [t, a] of players) {
    a.volume = Math.max(0, Math.min(1, st.musicVolume * (st.master ?? 1)));
    const want = t === current && !st.muted && st.music && st.musicVolume > 0 && (st.master ?? 1) > 0 && unlocked;
    if (want && a.paused) a.play().catch(() => { /* bloqueado ou sem arquivo */ });
    if (!want && !a.paused) a.pause();
  }
}

/** Troca a música (null = silêncio). A nova começa do início. */
export function setMusic(t: Track | null) {
  if (t === current) return;
  if (current) { const old = players.get(current); if (old) { old.pause(); old.currentTime = 0; } }
  current = t;
  if (t) player(t);
  apply();
}

/** Chame uma vez: libera o áudio no primeiro clique/tecla e acompanha as Configurações. */
export function initMusic() {
  const unlock = () => { unlocked = true; apply(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  onSettings(apply);
}
