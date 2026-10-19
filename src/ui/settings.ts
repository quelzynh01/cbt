// Configurações do jogador (guardadas no navegador).
export interface Settings {
  /** Tela de confronto 2D: sempre, só quando envolve seus Heróis, ou nunca (combate rápido). */
  battle: 'always' | 'mine' | 'never';
  /** Velocidade das animações. */
  speed: number;
  /** Mostrar o cronômetro da partida e da campanha. */
  clock: boolean;
  /** Rerrolagem: escolher os dados ou automática (todos os que falharam). */
  reroll: 'choose' | 'auto';
  /** Câmera: livre (você controla) ou visão dos jogadores (segue quem está jogando). */
  view: 'free' | 'players';
  /** Dificuldade da IA. */
  ai: 'normal' | 'hard';
}

const KEY = 'cbt.settings';
const DEFAULT: Settings = { battle: 'always', speed: 1, clock: true, reroll: 'choose', view: 'free', ai: 'normal' };

export function getSettings(): Settings {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULT }; }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento */ }
  for (const fn of listeners) fn(s);
}

const listeners: ((s: Settings) => void)[] = [];
export function onSettings(fn: (s: Settings) => void) { listeners.push(fn); }

/** mm:ss ou h:mm:ss */
export function fmtTime(ms: number): string {
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
