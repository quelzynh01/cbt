import { ALL_HEROES, HEROES, distributeStartingGear } from '../engine/data';
import { MAPS } from '../engine/maps';
import type { Game } from '../engine/game';
import { CARDS } from '../engine/cards';
import {
  type CampaignState, aiChoice, arrangeGuild, availableScenarios, cardValue, closeUpgrade, draftPickAll, finishBuy, recordResult, validateInventory,
} from '../campaign/campaign';
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
  /** Partida única ou campanha (6 cenários com Fase de Melhorias entre eles). */
  mode: 'single' | 'campaign';
  /** Dados ilimitados (sem a opção, no máximo 8 dados de ataque e 6 de defesa por rolagem). */
  unlimitedDice: boolean;
  step: 'draft' | 'vote' | 'equip' | 'done' | 'upgrade-draft' | 'upgrade-buy' | 'upgrade-arrange' | 'choose' | 'final';
  /** Campanha online (estado completo, como no modo campanha). */
  camp?: CampaignState;
  /** Fase de Melhorias: escolhas de cada Guilda humana nesta etapa (null = ainda escolhendo). */
  upPick: Partial<Record<GuildId, string[] | null>>;
  upBuy: Partial<Record<GuildId, string[] | null>>;
  upArr: Partial<Record<GuildId, Record<string, string[]> | null>>;
  /** Próximo cenário escolhido pelo vencedor. */
  nextMap?: string;
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

export function newSetup(seats: SeatInfo[], aiLevel: AILevel, rnd: () => number = Math.random, mode: 'single' | 'campaign' = 'single', unlimitedDice = false): OnlineSetup {
  const order = seats.map(s => s.guild);
  const size = order.length <= 3 ? 4 : 3;
  const pool = shuffle(ALL_HEROES, rnd);
  const st: OnlineSetup = {
    step: 'draft', round: 0, order, hands: {}, choice: {}, picks: {}, votes: {}, equip: {}, tick: 0, aiLevel,
    mode, unlimitedDice, upPick: {}, upBuy: {}, upArr: {},
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

/** Mapas que podem ser votados (na campanha, só os do Círculo Exterior). */
export function votableMaps(st: OnlineSetup): string[] {
  return st.mode === 'campaign' ? Object.values(MAPS).filter(m => m.circle === 'Círculo Exterior').map(m => m.id) : Object.keys(MAPS);
}

export function voteMap(st: OnlineSetup, g: GuildId, map: string): boolean {
  if (st.step !== 'vote' || !MAPS[map] || !votableMaps(st).includes(map)) return false;
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
    const maps = votableMaps(st);
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
  if (st.camp && advanceCampaign(st, seats)) changed = true;
  return changed;
}

// ------------------------------------------------------------------ campanha online
/** Cria a campanha com os Heróis recrutados e o equipamento inicial (depois da mesa). */
export function startCampaign(st: OnlineSetup, seats: (SeatInfo & { team?: string })[]) {
  const c: CampaignState = {
    version: 1, guilds: [], played: [], chooser: st.order[0], phase: 'choose', seed: (Date.now() ^ (Math.random() * 1e9)) | 0,
    elapsed: 0, aiLevel: st.aiLevel, unlimitedDice: st.unlimitedDice, voted: st.map,
  };
  for (const g of st.order) {
    const s = seats.find(x => x.guild === g);
    c.guilds.push({ id: g, controller: s?.ai ? 'ai' : 'human', heroes: st.picks[g]!.slice(), inventory: JSON.parse(JSON.stringify(st.equip[g] ?? {})), saved: 0, titles: [], curses: {}, ...(s?.team ? { name: s.team } : {}) });
  }
  st.camp = c;
}

/** Fim de um cenário: registra o resultado e abre a Fase de Melhorias (ou o final). */
export function scenarioOver(st: OnlineSetup, game: Game) {
  const c = st.camp!;
  recordResult(c, game);
  st.tick++;
  if (c.phase === 'done') { st.step = 'final'; st.news = 'Fim da campanha!'; return; }
  st.step = 'upgrade-draft';
  st.nextMap = undefined;
  st.upPick = {}; st.upBuy = {}; st.upArr = {};
  for (const g of c.guilds) if (g.controller === 'human') st.upPick[g.id] = null;
  st.news = `Cenário concluído! Fase de Melhorias (nível ${c.upgrade!.level}).`;
}

export function upgradePick(st: OnlineSetup, g: GuildId, ids: string[]): boolean {
  const up = st.camp?.upgrade;
  if (st.step !== 'upgrade-draft' || !up) return false;
  const hand = up.hands[g] ?? [];
  if (ids.length !== Math.min(2, hand.length) || ids.some(id => !hand.includes(id)) || new Set(ids).size !== ids.length) return false;
  st.upPick[g] = ids;
  return true;
}
export function upgradeBuy(st: OnlineSetup, g: GuildId, ids: string[]): boolean {
  const up = st.camp?.upgrade;
  if (st.step !== 'upgrade-buy' || !up) return false;
  const picked = up.picked[g] ?? [];
  if (ids.length > 3 || ids.some(id => !picked.includes(id))) return false;
  if (ids.reduce((s, id) => s + CARDS[id].cost, 0) > (up.coins[g] ?? 0)) return false;
  st.upBuy[g] = ids;
  return true;
}
export function upgradeArrange(st: OnlineSetup, g: GuildId, inv: Record<string, string[]>): boolean {
  const c = st.camp;
  const cg = c?.guilds.find(x => x.id === g);
  if (st.step !== 'upgrade-arrange' || !c || !cg) return false;
  // só cartas que a Guilda tem (inventário + compradas)
  const have = [...Object.values(cg.inventory).flat(), ...(c.upgrade!.bought[g] ?? [])].sort();
  const want = Object.values(inv).flat().sort();
  const left = have.slice();
  for (const id of want) { const i = left.indexOf(id); if (i < 0) return false; left.splice(i, 1); }
  if (Object.keys(inv).some(h => !cg.heroes.includes(h)) || validateInventory(c, cg, inv).length) return false;
  st.upArr[g] = inv;
  return true;
}
export function pickNextMap(st: OnlineSetup, g: GuildId, map: string): boolean {
  const c = st.camp;
  if (st.step !== 'choose' || !c || c.chooser !== g || !availableScenarios(c).includes(map)) return false;
  st.nextMap = map;
  return true;
}

function advanceCampaign(st: OnlineSetup, seats: SeatInfo[]): boolean {
  const c = st.camp!;
  const up = c.upgrade;
  // vaga que virou IA (jogador caiu) também joga sozinha
  const auto = (g: GuildId) => seats.find(s => s.guild === g)?.ai ?? true;
  const humans = c.guilds.filter(g => g.controller === 'human');
  let changed = false;
  if (st.step === 'upgrade-draft' && up) {
    for (const g of humans) if (auto(g.id) && !st.upPick[g.id]) {
      st.upPick[g.id] = (up.hands[g.id] ?? []).slice().sort((a, b) => cardValue(b) - cardValue(a)).slice(0, 2);
    }
    if (humans.every(g => st.upPick[g.id])) {
      draftPickAll(c, Object.fromEntries(humans.map(g => [g.id, st.upPick[g.id]!])));
      st.tick++;
      for (const g of humans) st.upPick[g.id] = null;
      if (up.step === 'buy') {
        st.step = 'upgrade-buy';
        for (const g of humans) st.upBuy[g.id] = null;
        st.news = 'Escolha de cartas concluída. Hora de comprar!';
      } else st.news = `Rodada ${up.round} concluída: as mãos passaram para a esquerda.`;
      changed = true;
    }
  }
  if (st.step === 'upgrade-buy' && up) {
    for (const g of humans) if (auto(g.id) && !st.upBuy[g.id]) st.upBuy[g.id] = [];
    if (humans.every(g => st.upBuy[g.id])) {
      for (const g of humans) finishBuy(c, g, st.upBuy[g.id]!);
      st.step = 'upgrade-arrange';
      st.tick++;
      for (const g of humans) st.upArr[g.id] = null;
      st.news = 'Compras feitas. Distribuam as cartas entre os Heróis.';
      changed = true;
    }
  }
  if (st.step === 'upgrade-arrange' && up) {
    for (const g of humans) if (auto(g.id) && !st.upArr[g.id]) st.upArr[g.id] = JSON.parse(JSON.stringify(g.inventory));
    if (humans.every(g => st.upArr[g.id])) {
      for (const g of humans) arrangeGuild(c, g, st.upArr[g.id]!);
      closeUpgrade(c);
      st.step = 'choose';
      st.tick++;
      st.news = 'Fase de Melhorias concluída! O vencedor escolhe o próximo cenário.';
      changed = true;
    }
  }
  if (st.step === 'choose') {
    const chooser = c.guilds.find(g => g.id === c.chooser);
    if (!st.nextMap && (!chooser || chooser.controller === 'ai' || auto(chooser.id))) { st.nextMap = aiChoice(c) ?? undefined; changed = true; }
    if (st.nextMap && st.step === 'choose') { st.step = 'done'; st.tick++; st.news = `Próximo cenário: ${MAPS[st.nextMap].name}.`; changed = true; }
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
    if (r.upPick[g]) r.upPick[g] = [HIDDEN];
    if (r.upBuy[g]) r.upBuy[g] = [HIDDEN];
    if (r.upArr[g]) r.upArr[g] = {};
    const up = r.camp?.upgrade;
    if (up) {
      if (up.hands[g]) up.hands[g] = up.hands[g]!.map(() => HIDDEN);
      if (up.picked[g] && r.step === 'upgrade-draft') up.picked[g] = up.picked[g]!.map(() => HIDDEN);
    }
  }
  return r;
}
