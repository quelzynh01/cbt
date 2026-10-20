import { getSettings } from '../ui/settings';

// Efeitos sonoros (public/sounds). Volume e liga/desliga ficam nas Configurações.

export type Sfx = 'healing' | 'refresh' | 'teletransport' | 'trap' | 'pick-item' | 'scan' | 'skill-wisp' | 'skill-spike'
  | 'dice' | 'atack-sword' | 'atack-bow' | 'atack-magic' | 'stun' | 'foot-step';
const NAMES: Sfx[] = ['healing', 'refresh', 'teletransport', 'trap', 'pick-item', 'scan', 'skill-wisp', 'skill-spike',
  'dice', 'atack-sword', 'atack-bow', 'atack-magic', 'stun', 'foot-step'];
export const SOUND_COUNT = NAMES.length;
const buffers = new Map<Sfx, HTMLAudioElement>();
/** Sons cujo arquivo não existe (ainda não colocado): não tentam tocar. */
const missing = new Set<Sfx>();

export function preloadSounds(onEach?: () => void): Promise<void> {
  return Promise.all(NAMES.map(n => new Promise<void>(res => {
    const a = new Audio();
    let fin = false;
    const done = () => { if (fin) return; fin = true; onEach?.(); res(); };
    a.preload = 'auto';
    a.addEventListener('canplaythrough', () => { buffers.set(n, a); done(); }, { once: true });
    a.addEventListener('error', () => { missing.add(n); done(); }, { once: true });
    setTimeout(done, 4000); // não trava o carregamento se o navegador não pré-carregar áudio
    a.src = `${import.meta.env.BASE_URL}sounds/${n}.mp3`;
    a.load();
  }))).then(() => undefined);
}

/** Toca um efeito (pode sobrepor: cada chamada usa uma cópia). */
export function play(n: Sfx, vol = 1) {
  const st = getSettings();
  if (st.muted || !st.sound || st.volume <= 0 || missing.has(n)) return;
  const base = buffers.get(n);
  const a = base ? (base.cloneNode(true) as HTMLAudioElement) : new Audio(`${import.meta.env.BASE_URL}sounds/${n}.mp3`);
  a.volume = Math.max(0, Math.min(1, st.volume * vol));
  a.play().catch(() => { /* o navegador só deixa tocar depois do primeiro clique */ });
}
