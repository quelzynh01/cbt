import { getSettings } from '../ui/settings';

// Efeitos sonoros (public/sounds). Volume e liga/desliga ficam nas Configurações.

export type Sfx = 'healing' | 'refresh' | 'teletransport' | 'trap' | 'pick-item' | 'scan' | 'skill-wisp' | 'skill-spike'
  | 'dice' | 'atack-sword' | 'atack-bow' | 'atack-magic' | 'stun' | 'foot-step' | 'gold' | 'cleave' | 'rajada-de-vento' | 'hobsbawn' | 'bow-critico'
  | 'archer-sound' | 'orc-sound' | 'mission' | 'end-game'
  | 'lorde-presas-entrada-1' | 'lorde-presas-entrada-2' | 'lorde-presas-entrada-3' | 'lorde-presas-entrada-4'
  | 'atack-sister1' | 'atack-sister2' | 'lol-sister1' | 'lol-sister2' | 'lol-sister3' | 'sister-dor-crit' | 'sister-prazer-crit' | 'atack-lorde-pressas';
const NAMES: Sfx[] = ['healing', 'refresh', 'teletransport', 'trap', 'pick-item', 'scan', 'skill-wisp', 'skill-spike',
  'dice', 'atack-sword', 'atack-bow', 'atack-magic', 'stun', 'foot-step', 'gold', 'cleave', 'rajada-de-vento', 'hobsbawn', 'bow-critico', 'archer-sound', 'orc-sound', 'mission', 'end-game',
  'lorde-presas-entrada-1', 'lorde-presas-entrada-2', 'lorde-presas-entrada-3', 'lorde-presas-entrada-4',
  'atack-sister1', 'atack-sister2', 'lol-sister1', 'lol-sister2', 'lol-sister3', 'sister-dor-crit', 'sister-prazer-crit', 'atack-lorde-pressas'];
/** Sons que não são .mp3. */
const EXT: Partial<Record<Sfx, string>> = { mission: 'wav', 'end-game': 'wav' };
const url = (n: Sfx) => `${import.meta.env.BASE_URL}sounds/${n}.${EXT[n] ?? 'mp3'}`;
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
    a.src = url(n);
    a.load();
  }))).then(() => undefined);
}

const lastPlay = new Map<Sfx, number>();
/** Toca o efeito só uma vez dentro de `ms` (ex.: várias Guildas ganham moedas ao mesmo tempo = um som só). */
export function playOnce(n: Sfx, ms = 700, vol = 1) {
  const now = performance.now();
  if (now - (lastPlay.get(n) ?? -Infinity) < ms) return;
  lastPlay.set(n, now);
  play(n, vol);
}

/** Toca um efeito (pode sobrepor: cada chamada usa uma cópia). */
export function play(n: Sfx, vol = 1) {
  const st = getSettings();
  if (st.muted || !st.sound || st.volume <= 0 || (st.master ?? 1) <= 0 || missing.has(n)) return;
  const base = buffers.get(n);
  const a = base ? (base.cloneNode(true) as HTMLAudioElement) : new Audio(url(n));
  a.volume = Math.max(0, Math.min(1, st.volume * (st.master ?? 1) * vol));
  a.play().catch(() => { /* o navegador só deixa tocar depois do primeiro clique */ });
}

/** Entrada do Lorde Presas: uma das falas, sorteada sem repetir até tocar todas. */
const LORD: Sfx[] = ['lorde-presas-entrada-1', 'lorde-presas-entrada-2', 'lorde-presas-entrada-3', 'lorde-presas-entrada-4'];
let lordBag: Sfx[] = [];
let lordLast: Sfx | null = null;
export function playLordEntrance(vol = 1) {
  if (!lordBag.length) {
    lordBag = LORD.slice().sort(() => Math.random() - 0.5);
    if (lordBag[0] === lordLast) lordBag.push(lordBag.shift()!); // a primeira do novo sorteio não repete a última
  }
  lordLast = lordBag.shift()!;
  play(lordLast, vol);
}

/** Um dos sons da lista, sorteado (não repete o último da mesma lista). */
const lastOf = new Map<string, Sfx>();
export function playRandom(list: Sfx[], vol = 1): Sfx {
  const k = list.join('|');
  const opts = list.length > 1 ? list.filter(x => x !== lastOf.get(k)) : list;
  const pick = opts[Math.floor(Math.random() * opts.length)];
  lastOf.set(k, pick);
  play(pick, vol);
  return pick;
}
/** Irmãs (do Prazer / da Dor): no ataque, o som do golpe e depois a fala de cada uma; ✷ no ataque = risada. */
const SISTER_ATTACK: Sfx[] = ['atack-sister1', 'atack-sister2'];
const SISTER_LOL: Sfx[] = ['lol-sister1', 'lol-sister2', 'lol-sister3'];
/** Duração dos sons de ataque (ms): a fala começa quando o golpe termina. */
const SISTER_ATTACK_MS: Partial<Record<Sfx, number>> = { 'atack-sister1': 2330, 'atack-sister2': 3060 };
export const isSister = (defId: string) => /^irma_(dor|prazer)/.test(defId);
export function playSisterAttack(defId: string) {
  const pick = playRandom(SISTER_ATTACK);
  setTimeout(() => play(defId.startsWith('irma_dor') ? 'sister-dor-crit' : 'sister-prazer-crit'), (SISTER_ATTACK_MS[pick] ?? 2500) + 100);
}
export function playSisterCrit() { playRandom(SISTER_LOL); }
