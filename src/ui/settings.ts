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
  /** Sons ligados. */
  sound: boolean;
  /** Volume dos sons (0 a 1). */
  volume: number;
  /** Sinalização de ajuda: Espaços azuis (andar) e vermelhos (atacar) no tabuleiro. */
  hints: boolean;
  /** Volume geral (controle rápido do topo): multiplica a música e os efeitos. */
  master: number;
  /** Música ligada e volume da música. */
  music: boolean;
  musicVolume: number;
  /** Silencia tudo (efeitos e música). */
  muted: boolean;
  /** Pedir confirmação antes de um movimento que provoca Reação de Alerta. */
  alertConfirm: boolean;
  /** Avisar ao encerrar o turno se ainda há o que fazer (ativar, mover, atacar…). */
  endConfirm: boolean;
  /** Qualidade do desenho do mapa: alta (mais pixels, mais nítido) ou normal (mais leve). */
  gfx: 'high' | 'normal';
}

const KEY = 'cbt.settings';
const DEFAULT: Settings = { battle: 'never', speed: 1, clock: true, reroll: 'choose', view: 'free', ai: 'normal', sound: true, volume: 0.7, master: 1, hints: true, music: true, musicVolume: 0.12, muted: false, alertConfirm: true, endConfirm: true, gfx: 'high' };

export function getSettings(): Settings {
  // a tela 2D de batalha saiu: o combate é sempre o painel de dados do centro (o mesmo para todos na partida)
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}'), battle: 'never' }; } catch { return { ...DEFAULT, battle: 'never' }; }
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
