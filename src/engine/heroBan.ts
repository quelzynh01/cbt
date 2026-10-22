// Banimento de Heróis ("Permitir Todos os Heróis"): antes do recrutamento o jogo sorteia 20 Heróis e mostra para
// todos; cada jogador bane 2 (escondido até todos banirem). Os que sobram (12 com 4 jogadores) são embaralhados e
// o recrutamento segue normal.
import { HEROES, heroPool } from './data';

export const BAN_POOL = 20;
export const BANS_EACH = 2;

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/** Os 20 Heróis sorteados para o banimento. */
export function drawBanPool(rnd: () => number): string[] {
  return shuffle(heroPool('all'), rnd).slice(0, BAN_POOL);
}

/** IA: bane os 2 mais fortes (rating), com um pouco de sorte; evita os que outra Guilda já baniu. */
export function aiBans(pool: string[], rnd: () => number, taken: string[] = []): string[] {
  return pool.filter(h => !taken.includes(h)).map(h => ({ h, v: (HEROES[h].rating ?? 6) + rnd() * 1.5 })).sort((a, b) => b.v - a.v).slice(0, BANS_EACH).map(x => x.h);
}

/** Banimento válido: 2 Heróis diferentes da pool. */
export function validBans(pool: string[], ids: string[]): boolean {
  return ids.length === BANS_EACH && new Set(ids).size === BANS_EACH && ids.every(h => pool.includes(h));
}

/** Heróis que sobram depois dos banimentos (embaralhados). Quem foi banido por 2 jogadores sai uma vez só. */
export function afterBans(pool: string[], bans: string[][], rnd: () => number): string[] {
  const out = new Set(bans.flat());
  return shuffle(pool.filter(h => !out.has(h)), rnd);
}
