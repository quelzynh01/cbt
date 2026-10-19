// RNG determinístico (mulberry32) guardado no GameState — essencial para replays e para o modo online.
export interface RngHolder { rng: number }

export function nextRandom(s: RngHolder): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: RngHolder, n: number): number {
  return Math.floor(nextRandom(s) * n);
}

export function shuffle<T>(s: RngHolder, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
