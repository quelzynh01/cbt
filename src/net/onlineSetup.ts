import { ALL_HEROES, HEROES, distributeStartingGear } from '../engine/data';
import { MAPS } from '../engine/maps';
import type { GuildId } from '../engine/types';
import { pickHero, type AILevel } from '../ai/ai';

// Preparação da partida online, igual à da campanha (rodada pelo anfitrião):
//  1. Recrutamento: cada jogador recebe uma mão de Heróis, escolhe 1 (escondido) e passa o resto para a esquerda.
//     A rodada só acaba quando TODOS escolheram. 3 rodadas.
//  2. Votação do mapa (votos escondidos até todos votarem; empate = sorteio).
//  3. Equipamento: cada um distribui as 5 cartas iniciais entre seus 3 Heróis.
//  4. A partida começa (com o posicionamento na Área Inicial).
// Cada jogador só recebe as SUAS cartas; as dos outros chegam como '?' (cartas de cabeça para baixo).

export const STARTER = ['espada_enferrujada', 'adaga_aparadora', 'estilingue', 'drenar_vida', 'raio_nova'];
export const HIDDEN = '?';

export interface SeatInfo { guild: GuildId; ai: boolean }

export interface OnlineSetup {
  step: 'draft' | 'vote' | 'equip' | 'done';
  round: number;
  order: GuildId[];
  hands: Partial<Record<GuildId, string[]>>;
  /** Escolha desta rodada (escondida dos outros até todos escolherem). */
  choice: Partial<Record<GuildId, string | null>>;
  /** Heróis recrutados (escondidos dos outros até o fim do recrutamento). */
  picks: Partial<Record<GuildId, string[]>>;
  votes: Partial<Record<GuildId, string | null>>;
  map?: string;
  tie?: string[];
  equip: Partial<Record<GuildId, Record<string, string[]> | null>>;
  /** Aviso curto do que acabou de acontecer (ex.: "todos escolheram"). */
  news?: string;
  /** Contador que muda a cada passo (a tela sabe quando animar). */
  tick: number;
  aiLevel: AILevel;
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

export function newSetup(seats: SeatInfo[], aiLevel: AILevel, rnd: () => number = Math.random): OnlineSetup {
  const order = seats.map(s => s.guild);
  const size = order.length <= 3 ? 4 : 3;
  const pool = shuffle(ALL_HEROES, rnd);
  const st: OnlineSetup = {
    step: 'draft', round: 0, order, hands: {}, choice: {}, picks: {}, votes: {}, equip: {}, tick: 0, aiLevel,
  };
  for (const g of order) { st.hands[g] = pool.splice(0, size); st.choice[g] = null; st.picks[g] = []; }
  return st;
}

/** Um jogador escolhe 1 Herói da mão (pode trocar até todos escolherem). */
export function chooseHero(st: OnlineSetup, g: GuildId, hero: string): boolean {
  if (st.step !== 'draft' || !st.hands[g]?.includes(hero)) return false;
  st.choice[g] = hero;
  return true;
}

export function voteMap(st: OnlineSetup, g: GuildId, map: string): boolean {
  if (st.step !== 'vote' || !MAPS[map]) return false;
  st.votes[g] = map;
  return true;
}

/** Valida a distribuição das 5 cartas iniciais. Retorna os erros. */
export function equipErrors(st: OnlineSetup, g: GuildId, inv: Record<string, string[]>): string[] {
  const heroes = st.picks[g] ?? [];
  const errs: string[] = [];
  const all = Object.values(inv).flat().slice().sort();
  if (Object.keys(inv).some(h => !heroes.includes(h))) errs.push('Herói inválido.');
  if (JSON.stringify(all) !== JSON.stringify(STARTER.slice().sort())) errs.push('Distribua as 5 cartas iniciais.');
  for (const h of heroes) if ((inv[h] ?? []).length > 4) errs.push(`${HEROES[h].name}: no máximo 4 cartas.`);
  return errs;
}

export function setEquip(st: OnlineSetup, g: GuildId, inv: Record<string, string[]>): boolean {
  if (st.step !== 'equip' || equipErrors(st, g, inv).length) return false;
  st.equip[g] = inv;
  return true;
}

/** IAs agem e, quando todos terminaram o passo, avança. Retorna true se algo mudou. */
export function advance(st: OnlineSetup, seats: SeatInfo[], rnd: () => number = Math.random): boolean {
  let changed = false;
  const isAI = (g: GuildId) => seats.find(s => s.guild === g)?.ai ?? true;
  const all = st.order;
  if (st.step === 'draft') {
    for (const g of all) if (isAI(g) && !st.choice[g]) { st.choice[g] = pickHero(st.hands[g]!, st.picks[g]!, st.aiLevel, rnd); changed = true; }
    if (all.every(g => st.choice[g])) {
      for (const g of all) {
        const h = st.choice[g]!;
        st.hands[g] = st.hands[g]!.filter(x => x !== h);
        st.picks[g]!.push(h);
        st.choice[g] = null;
      }
      // as mãos passam para a esquerda
      const prev = Object.fromEntries(all.map(g => [g, st.hands[g]!]));
      all.forEach((g, i) => { st.hands[all[(i + 1) % all.length]] = prev[g]; });
      st.round++;
      st.tick++;
      if (st.round >= 3) {
        st.step = 'vote';
        st.hands = {};
        st.news = 'Recrutamento concluído! Agora votem no mapa.';
        for (const g of all) st.votes[g] = null;
      } else st.news = `Rodada ${st.round} concluída: todos escolheram. As cartas restantes passaram para a esquerda.`;
      changed = true;
    }
  }
  if (st.step === 'vote') {
    const maps = Object.keys(MAPS);
    for (const g of all) if (isAI(g) && !st.votes[g]) {
      // IA prefere os mapas do Círculo Exterior (cenários mais curtos)
      const outer = maps.filter(m => MAPS[m].circle === 'Círculo Exterior');
      const list = rnd() < 0.7 && outer.length ? outer : maps;
      st.votes[g] = list[Math.floor(rnd() * list.length)];
      changed = true;
    }
    if (all.every(g => st.votes[g])) {
      const count = new Map<string, number>();
      for (const g of all) count.set(st.votes[g]!, (count.get(st.votes[g]!) ?? 0) + 1);
      const max = Math.max(...count.values());
      const top = [...count].filter(([, n]) => n === max).map(([m]) => m);
      st.tie = top.length > 1 ? top : undefined;
      st.map = top[Math.floor(rnd() * top.length)];
      st.step = 'equip';
      st.tick++;
      st.news = `Mapa escolhido: ${MAPS[st.map].name}${st.tie ? ' (empate — sorteado)' : ''}. Distribuam as cartas iniciais.`;
      for (const g of all) st.equip[g] = null;
      changed = true;
    }
  }
  if (st.step === 'equip') {
    for (const g of all) if (isAI(g) && !st.equip[g]) { st.equip[g] = distributeStartingGear(st.picks[g]!); changed = true; }
    if (all.every(g => st.equip[g])) { st.step = 'done'; st.tick++; st.news = 'Todos prontos! A partida vai começar.'; changed = true; }
  }
  return changed;
}

/** Cópia do estado para um jogador: as cartas e escolhas dos outros ficam escondidas. */
export function redact(st: OnlineSetup, me: GuildId | null): OnlineSetup {
  const r: OnlineSetup = JSON.parse(JSON.stringify(st));
  for (const g of r.order) {
    if (g === me) continue;
    if (r.hands[g]) r.hands[g] = r.hands[g]!.map(() => HIDDEN);
    if (r.choice[g]) r.choice[g] = HIDDEN;
    // Heróis recrutados ficam secretos até o fim do recrutamento
    if (r.step === 'draft') r.picks[g] = r.picks[g]!.map(() => HIDDEN);
    if (r.step === 'vote' && r.votes[g]) r.votes[g] = HIDDEN;
    if (r.equip[g]) r.equip[g] = {};
  }
  return r;
}
