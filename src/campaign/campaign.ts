import { CARDS, CURSES, curseDeck, upgradeDeck } from '../engine/cards';
import { ALL_HEROES, HEROES, distributeStartingGear, levelForScenario, setGuildNames, teamName } from '../engine/data';
import type { Game } from '../engine/game';
import { CAMPAIGN, MAPS } from '../engine/maps';
import type { GuildId } from '../engine/types';
import { cardFit, pickHero, type AILevel } from '../ai/ai';

// Modo Campanha (Livro de Regras p.9 e p.24-29): 6 cenários — 3 do Círculo Exterior, 2 do Círculo Interior e o
// Confronto Final. Entre os cenários: Maldições Mortais, Fase de Melhorias (draft de cartas e compra) e Títulos.

export const CIRCLES = ['Círculo Exterior', 'Círculo Interior', 'Confronto Final'] as const;
export const CIRCLE_NEED: Record<string, number> = { 'Círculo Exterior': 3, 'Círculo Interior': 2, 'Confronto Final': 1 };
const MAX_CARDS = 12;
const STORE = 'cbt.campaign';

export interface CGuild {
  id: GuildId;
  controller: 'human' | 'ai';
  heroes: string[];
  /** Cartas no inventário de cada Herói (ids de carta). */
  inventory: Record<string, string[]>;
  /** Moeda guardada para a próxima Fase de Melhorias (máx. 1). */
  saved: number;
  titles: string[];
  /** Maldição Mortal de cada Herói (id). */
  curses: Record<string, string>;
  /** Nome do time escolhido pelo jogador (opcional). */
  name?: string;
}

export interface ScenarioResult {
  mapId: string;
  winner: GuildId;
  ms?: number;
  guilds: { id: GuildId; coins: number; deaths: number; missions: number; reward: boolean; title: boolean; deathsByHero: Record<string, number> }[];
}

export interface Upgrade {
  level: number;
  step: 'draft' | 'buy' | 'arrange';
  round: number; // rodada do draft (0..2)
  hands: Partial<Record<GuildId, string[]>>;
  picked: Partial<Record<GuildId, string[]>>;
  coins: Partial<Record<GuildId, number>>;
  /** Cartas compradas ainda sem Herói. */
  bought: Partial<Record<GuildId, string[]>>;
  cursesDrawn: { guild: GuildId; hero: string; drawn: string[]; kept: string }[];
}

/** Preparação da campanha: escolha de Heróis em rodadas, votação do mapa e equipamento inicial. */
export interface Setup {
  step: 'draft' | 'vote' | 'equip';
  round: number;
  hands: Partial<Record<GuildId, string[]>>;
  votes?: Partial<Record<GuildId, string>>;
  map?: string;
  tie?: string[];
}

export const STARTER_CARDS = ['espada_enferrujada', 'adaga_aparadora', 'estilingue', 'drenar_vida', 'raio_nova'];

export interface CampaignState {
  version: 1;
  setup?: Setup;
  /** Mapa escolhido na votação (1º cenário). */
  voted?: string;
  /** Tempo total jogado (ms). */
  elapsed?: number;
  guilds: CGuild[];
  played: ScenarioResult[];
  chooser: GuildId;
  phase: 'setup' | 'choose' | 'upgrade' | 'done';
  upgrade?: Upgrade;
  seed: number;
  /** Dificuldade das Guildas da IA. */
  aiLevel?: AILevel;
  /** Dados ilimitados (sem a opção, no máximo 8 dados de ataque e 6 de defesa por rolagem). */
  unlimitedDice?: boolean;
}

// ------------------------------------------------------------------ persistência
export function loadCampaign(): CampaignState | null {
  try { const v = JSON.parse(localStorage.getItem(STORE) ?? 'null'); return v?.version === 1 ? v : null; } catch { return null; }
}
export function saveCampaign(c: CampaignState | null) {
  try { if (c) localStorage.setItem(STORE, JSON.stringify(c)); else localStorage.removeItem(STORE); } catch { /* sem armazenamento */ }
}

// ------------------------------------------------------------------ RNG simples (estado guardado na campanha)
function rnd(c: CampaignState): number {
  let t = (c.seed = (c.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffled<T>(c: CampaignState, a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd(c) * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

// ------------------------------------------------------------------ criação
export function newCampaign(opponents: number, name?: string, aiLevel: AILevel = 'normal', unlimitedDice = false): CampaignState {
  const ids: GuildId[] = ['azul', 'vermelho', 'verde', 'laranja'];
  const c: CampaignState = { version: 1, guilds: [], played: [], chooser: 'azul', phase: 'setup', seed: (Date.now() ^ (Math.random() * 1e9)) | 0, elapsed: 0, aiLevel, unlimitedDice };
  for (let i = 0; i <= opponents; i++) c.guilds.push({ id: ids[i], controller: i === 0 ? 'human' : 'ai', heroes: [], inventory: {}, saved: 0, titles: [], curses: {}, ...(i === 0 && name?.trim() ? { name: name.trim().slice(0, 20) } : {}) });
  useCampaignNames(c);
  // Recrutamento de Heróis (p.7): cada jogador recebe uma mão, escolhe 1 e passa o resto para a esquerda.
  const size = c.guilds.length <= 3 ? 4 : 3;
  const pool = shuffled(c, ALL_HEROES);
  c.setup = { step: 'draft', round: 0, hands: Object.fromEntries(c.guilds.map(g => [g.id, pool.splice(0, size)])) };
  return c;
}


/** O jogador escolhe 1 Herói da mão; as IAs também; as mãos passam para a esquerda. Após 3 rodadas: votação. */
export function draftHero(c: CampaignState, heroId: string) {
  const st = c.setup!;
  for (const g of c.guilds) {
    const hand = st.hands[g.id]!;
    const pick = g.controller === 'human' ? heroId : pickHero(hand, g.heroes, c.aiLevel ?? 'normal', () => rnd(c));
    const i = hand.indexOf(pick);
    if (i < 0) continue;
    hand.splice(i, 1);
    g.heroes.push(pick);
  }
  const order = c.guilds.map(g => g.id);
  const prev = Object.fromEntries(order.map(id => [id, st.hands[id]!]));
  order.forEach((id, i) => { st.hands[order[(i + 1) % order.length]] = prev[id]; });
  st.round++;
  if (st.round >= 3) { st.step = 'vote'; st.hands = {}; }
}

/** Votação do mapa: cada jogador vota; empate = sorteio. */
export function voteMap(c: CampaignState, mapId: string) {
  const st = c.setup!;
  const av = availableScenarios(c);
  st.votes = {};
  for (const g of c.guilds) {
    if (g.controller === 'human') st.votes[g.id] = mapId;
    else {
      // IA: prefere o cenário recomendado para iniciantes (Distrito dos Martelos)
      const weighted = av.flatMap(id => id === 'distrito-dos-martelos' ? [id, id] : [id]);
      st.votes[g.id] = weighted[Math.floor(rnd(c) * weighted.length)];
    }
  }
  const count = new Map<string, number>();
  for (const v of Object.values(st.votes)) count.set(v!, (count.get(v!) ?? 0) + 1);
  const max = Math.max(...count.values());
  const top = [...count].filter(([, n]) => n === max).map(([id]) => id);
  st.tie = top.length > 1 ? top : undefined;
  st.map = top[Math.floor(rnd(c) * top.length)];
}

/** Equipamento inicial (p.8): as 5 cartas do baralho Inicial distribuídas entre os 3 Heróis. */
export function finishEquip(c: CampaignState, inv: Record<string, string[]>): string[] {
  const me = human(c);
  const errs = validateInventory(c, me, inv);
  const all = Object.values(inv).flat().sort();
  if (JSON.stringify(all) !== JSON.stringify(STARTER_CARDS.slice().sort())) errs.push('Distribua as 5 cartas iniciais.');
  if (errs.length) return errs;
  me.inventory = inv;
  for (const g of c.guilds) if (g.controller === 'ai') g.inventory = distributeStartingGear(g.heroes);
  c.voted = c.setup!.map;
  c.setup = undefined;
  c.phase = 'choose';
  return [];
}

export const guildOf = (c: CampaignState, id: GuildId) => c.guilds.find(g => g.id === id)!;
export const human = (c: CampaignState) => c.guilds.find(g => g.controller === 'human')!;

/** Quantos cenários de cada Círculo já foram jogados. */
export function progress(c: CampaignState): Record<string, number> {
  const out: Record<string, number> = { 'Círculo Exterior': 0, 'Círculo Interior': 0, 'Confronto Final': 0 };
  for (const p of c.played) out[MAPS[p.mapId].circle]++;
  return out;
}

/** Círculo atual (o primeiro ainda incompleto). */
export function currentCircle(c: CampaignState): string | null {
  const pr = progress(c);
  return CIRCLES.find(ci => pr[ci] < CIRCLE_NEED[ci]) ?? null;
}

/** Cenários que podem ser escolhidos agora. */
export function availableScenarios(c: CampaignState): string[] {
  const circle = currentCircle(c);
  if (!circle) return [];
  return CAMPAIGN.filter(s => s.circle === circle && s.map && !c.played.some(p => p.mapId === s.map!.id)).map(s => s.map!.id);
}

export function scenarioNumber(c: CampaignState) { return c.played.length + 1; }
export function scenarioLevel(c: CampaignState) { return levelForScenario(scenarioNumber(c)); }

/** Opções de Game.create para o próximo cenário (o jogador inicial é o à esquerda do último vencedor). */
export function gameOptions(c: CampaignState) {
  const last = c.played[c.played.length - 1]?.winner;
  let order = c.guilds.slice();
  if (last) { const i = order.findIndex(g => g.id === last); order = [...order.slice(i + 1), ...order.slice(0, i + 1)]; }
  else order = shuffled(c, order);
  return {
    fixedOrder: true,
    unlimitedDice: !!c.unlimitedDice,
    level: scenarioLevel(c),
    titles: Object.fromEntries(c.guilds.map(g => [g.id, g.titles.slice()])),
    players: order.map(g => ({ guild: g.id, controller: g.controller, heroes: g.heroes, cards: g.inventory, curses: g.curses, name: g.name })),
  };
}

// ------------------------------------------------------------------ fim de cenário
export function recordResult(c: CampaignState, game: Game) {
  const s = game.s;
  const res: ScenarioResult = { mapId: s.mapId, winner: s.winner!, ms: s.elapsed ?? 0, guilds: [] };
  c.elapsed = (c.elapsed ?? 0) + (s.elapsed ?? 0);
  for (const cg of c.guilds) {
    const gs = game.guild(cg.id);
    const heroes = game.heroesOf(cg.id);
    const deathsByHero = Object.fromEntries(heroes.map(h => [h.defId, h.deaths]));
    // cartas ao fim do cenário (inclui Recompensas ganhas)
    const before = Object.values(cg.inventory).flat();
    cg.inventory = Object.fromEntries(heroes.map(h => [h.defId, h.cards.map(x => x.defId)]));
    const after = Object.values(cg.inventory).flat();
    const reward = after.some(id => CARDS[id]?.level === 'R' && after.filter(x => x === id).length > before.filter(x => x === id).length);
    const newTitles = (s.titles?.[cg.id] ?? []).filter(t => !cg.titles.includes(t));
    cg.titles.push(...newTitles);
    res.guilds.push({ id: cg.id, coins: gs.coins + cg.saved, deaths: heroes.reduce((a, h) => a + h.deaths, 0), missions: gs.missions.length, reward, title: newTitles.length > 0, deathsByHero });
  }
  c.played.push(res);
  c.chooser = res.winner;
  if (c.played.length >= 6) { c.phase = 'done'; return; }
  startUpgrade(c, res);
}

// ------------------------------------------------------------------ Fase de Melhorias (p.24)
function startUpgrade(c: CampaignState, res: ScenarioResult) {
  const level = Math.min(5, c.played.length);
  const up: Upgrade = { level, step: 'draft', round: 0, hands: {}, picked: {}, coins: {}, bought: {}, cursesDrawn: [] };
  // Maldições Mortais: devolve as antigas, cada Herói compra 1 por marcador de Morte e fica com a de maior valor
  for (const g of c.guilds) g.curses = {};
  let deck = shuffled(c, curseDeck());
  for (const rg of res.guilds) for (const [hero, deaths] of Object.entries(rg.deathsByHero)) {
    if (!deaths) continue;
    if (deck.length < deaths) deck = shuffled(c, curseDeck());
    const drawn = deck.splice(0, deaths);
    const kept = drawn.slice().sort((a, b) => CURSES[b].value - CURSES[a].value)[0];
    if (kept !== 'sem_maldicao') guildOf(c, rg.id).curses[hero] = kept;
    up.cursesDrawn.push({ guild: rg.id, hero, drawn, kept });
  }
  // moedas do cenário + moeda guardada
  for (const rg of res.guilds) up.coins[rg.id] = rg.coins;
  for (const g of c.guilds) g.saved = 0;
  // 6 cartas para cada jogador
  const ud = shuffled(c, upgradeDeck(level));
  for (const g of c.guilds) { up.hands[g.id] = ud.splice(0, 6); up.picked[g.id] = []; up.bought[g.id] = []; }
  c.upgrade = up;
  c.phase = 'upgrade';
  // as IAs escolhem logo na primeira rodada
  aiDraftPicks(c);
}

/** Valor de uma carta para a IA (dados, defesa e vida por moeda). */
export function cardValue(id: string): number {
  const d = CARDS[id];
  return d.dice * 1.2 + (d.defBonus ?? 0) * 1.1 + (d.hpBonus ?? 0) * 1.2 + (d.rerolls ?? 0) * 0.6
    + (d.fx.boostDice ?? 0) * 0.9 + (d.fx.critExtra ?? 0) * 0.8 + (d.fx.rawr ?? 0) + (d.fx.genesis ?? 0) * 1.5
    + (d.fx.allClose || d.fx.extraOnCrit ? 1 : 0) + (d.partial ? -1.5 : 0);
}

/** Valor de uma carta para esta Guilda: força × quanto combina com o melhor Herói dela (Difícil) ou só força com acaso (Normal). */
function guildCardValue(c: CampaignState, g: CGuild, id: string): number {
  const hard = c.aiLevel === 'hard';
  const fit = Math.max(1, ...g.heroes.map(h => cardFit(h, id)));
  const coins = c.upgrade?.coins[g.id] ?? 0;
  const afford = CARDS[id].cost <= coins + 1 ? 1 : hard ? 0.6 : 0.9;
  return cardValue(id) * (hard ? fit : 1 + (fit - 1) * 0.4) * afford + (hard ? 0 : (rnd(c) - 0.5) * 2.5);
}

export function aiDraftPicks(c: CampaignState) {
  const up = c.upgrade!;
  for (const g of c.guilds) if (g.controller === 'ai') {
    const hand = up.hands[g.id]!;
    const score = Object.fromEntries(hand.map(id => [id, guildCardValue(c, g, id)]));
    const best = hand.slice().sort((a, b) => score[b] - score[a]).slice(0, 2);
    for (const id of best) hand.splice(hand.indexOf(id), 1);
    up.picked[g.id]!.push(...best);
  }
}

/** Campanha só de IAs (testes): roda a Fase de Melhorias inteira automaticamente. */
export function autoUpgrade(c: CampaignState) {
  const up = c.upgrade;
  if (!up) return;
  const order = c.guilds.map(g => g.id);
  while (up.round < 3) {
    if (up.round > 0) aiDraftPicks(c);
    const prev = Object.fromEntries(order.map(id => [id, up.hands[id]!]));
    order.forEach((id, i) => { up.hands[order[(i + 1) % order.length]] = prev[id]; });
    up.round++;
  }
  for (const g of c.guilds) aiBuy(c, g);
  c.upgrade = undefined;
  c.phase = 'choose';
}

/** O jogador humano escolhe 2 cartas da mão; as mãos passam para a esquerda. */
export function draftPick(c: CampaignState, ids: string[]) {
  const up = c.upgrade!;
  const me = human(c);
  const hand = up.hands[me.id]!;
  for (const id of ids) { const i = hand.indexOf(id); if (i >= 0) { hand.splice(i, 1); up.picked[me.id]!.push(id); } }
  // passa para a esquerda
  const order = c.guilds.map(g => g.id);
  const prev = Object.fromEntries(order.map(id => [id, up.hands[id]!]));
  order.forEach((id, i) => { up.hands[order[(i + 1) % order.length]] = prev[id]; });
  up.round++;
  if (up.round >= 3) {
    up.step = 'buy';
    for (const g of c.guilds) if (g.controller === 'ai') aiBuy(c, g);
  } else aiDraftPicks(c);
}

export function aiBuy(c: CampaignState, g: CGuild) {
  const up = c.upgrade!;
  let coins = up.coins[g.id] ?? 0;
  const picked = up.picked[g.id]!.slice();
  let buy: string[] = [];
  if (c.aiLevel === 'hard') {
    // Difícil: a melhor combinação de até 3 cartas que cabe nas moedas
    const val = (id: string) => cardValue(id) * Math.max(1, ...g.heroes.map(h => cardFit(h, id)));
    let best = -1;
    const n = picked.length;
    for (let mask = 1; mask < 1 << n; mask++) {
      const ids = picked.filter((_, i) => mask & (1 << i));
      if (ids.length > 3) continue;
      const cost = ids.reduce((s, id) => s + CARDS[id].cost, 0);
      if (cost > coins) continue;
      const v = ids.reduce((s, id) => s + val(id), 0) + (coins - cost >= 1 ? 0.3 : 0);
      if (v > best) { best = v; buy = ids; }
    }
  } else {
    const opts = picked.sort((a, b) => cardValue(b) / Math.max(1, CARDS[b].cost) - cardValue(a) / Math.max(1, CARDS[a].cost));
    for (const id of opts) if (buy.length < 3 && CARDS[id].cost <= coins && cardValue(id) > 1) { buy.push(id); coins -= CARDS[id].cost; }
  }
  finishBuy(c, g, buy);
  aiArrange(c, g);
}

/** Compra até 3 cartas; sobra no máximo 1 moeda guardada. */
export function finishBuy(c: CampaignState, g: CGuild, ids: string[]) {
  const up = c.upgrade!;
  let coins = up.coins[g.id] ?? 0;
  const ok: string[] = [];
  for (const id of ids.slice(0, 3)) if (CARDS[id].cost <= coins) { ok.push(id); coins -= CARDS[id].cost; }
  up.bought[g.id] = ok;
  up.coins[g.id] = coins;
  g.saved = Math.min(1, coins);
}

// ------------------------------------------------------------------ inventário
export function heroSlots(c: CampaignState, g: CGuild, hero: string, cards = g.inventory[hero] ?? []): { used: number; max: number; magicExtra: number } {
  const curse = g.curses[hero] ? CURSES[g.curses[hero]] : null;
  const magicExtra = cards.reduce((s, id) => s + (CARDS[id]?.fx.magicSlots ?? 0), 0);
  const magic = cards.filter(id => CARDS[id]?.magic && CARDS[id]?.kind === 'attack').length;
  const used = cards.length - Math.min(magic, magicExtra) + (curse?.slot ? 1 : 0);
  return { used, max: 4, magicExtra };
}

/** Valida uma distribuição de cartas (hero -> cartas). Retorna mensagens de erro. */
export function validateInventory(c: CampaignState, g: CGuild, inv: Record<string, string[]>): string[] {
  const errs: string[] = [];
  const total = Object.values(inv).flat().length;
  if (total > MAX_CARDS) errs.push(`A Guilda pode ter no máximo ${MAX_CARDS} cartas (tem ${total}). Descarte ${total - MAX_CARDS}.`);
  for (const h of g.heroes) {
    const cards = inv[h] ?? [];
    const sl = heroSlots(c, g, h, cards);
    if (sl.used > sl.max) errs.push(`${HEROES[h].name}: ${sl.used} cartas para ${sl.max} espaços.`);
    if (cards.filter(id => CARDS[id]?.fx.armor).length > 1) errs.push(`${HEROES[h].name}: só 1 armadura por Herói.`);
  }
  if (Object.values(inv).flat().filter(id => CARDS[id]?.fx.bomb).length > 1) errs.push('Só 1 carta de Bomba por Guilda.');
  return errs;
}

/** IA: mantém as cartas de cada Herói e encaixa as compradas (troca a pior se faltar espaço). */
function aiArrange(c: CampaignState, g: CGuild) {
  const up = c.upgrade!;
  const inv: Record<string, string[]> = Object.fromEntries(g.heroes.map(h => [h, (g.inventory[h] ?? []).slice()]));
  const fits = (h: string, id: string) => {
    const d = CARDS[id];
    const ab = HEROES[h].ability;
    if (d.magic) return ab === 'dominio_magia' || ab === 'bencao' || ab === 'magia_perfurante' ? 2 : 0;
    if (d.group === 'Arco') return ab === 'maestria_arco' ? 2 : 0.5;
    if (d.group === 'Espada') return ab === 'arremesso' ? 2 : 1;
    return 1;
  };
  for (const id of (up.bought[g.id] ?? []).slice().sort((a, b) => cardValue(b) - cardValue(a))) {
    const heroes = g.heroes.slice().sort((a, b) => fits(b, id) - fits(a, id) || inv[a].length - inv[b].length);
    let placed = false;
    for (const h of heroes) {
      if (validateInventory(c, g, { ...inv, [h]: [...inv[h], id] }).length === 0) { inv[h].push(id); placed = true; break; }
    }
    if (placed) continue;
    // sem espaço: troca a carta de menor valor, se a nova for melhor
    for (const h of heroes) {
      const worst = inv[h].slice().sort((a, b) => cardValue(a) - cardValue(b))[0];
      if (worst && cardValue(worst) < cardValue(id)) {
        const next = inv[h].filter(x => x !== worst).concat(id);
        if (validateInventory(c, g, { ...inv, [h]: next }).length === 0) { inv[h] = next; break; }
      }
    }
  }
  // ainda inválido (ex.: Maldição ocupou um espaço): descarta as piores
  for (const h of g.heroes) while (inv[h].length && validateInventory(c, g, inv).some(e => e.startsWith(HEROES[h].name))) {
    const worst = inv[h].slice().sort((a, b) => cardValue(a) - cardValue(b))[0];
    inv[h] = inv[h].filter(x => x !== worst);
  }
  g.inventory = inv;
  up.bought[g.id] = [];
}

/** Humano confirma a distribuição; termina a Fase de Melhorias. */
export function finishArrange(c: CampaignState, inv: Record<string, string[]>): string[] {
  const g = human(c);
  const errs = validateInventory(c, g, inv);
  if (errs.length) return errs;
  g.inventory = inv;
  c.upgrade!.bought[g.id] = [];
  c.upgrade = undefined;
  c.phase = 'choose';
  return [];
}

/** Próximo cenário escolhido pelo vencedor do anterior (IA escolhe sozinha). */
export function aiChoice(c: CampaignState): string | null {
  const av = availableScenarios(c);
  return av.length ? av[Math.floor(rnd(c) * av.length)] : null;
}

// ------------------------------------------------------------------ fim da campanha (p.29)
export interface Medal { name: string; winners: GuildId[] }
export function medals(c: CampaignState): Medal[] {
  const count = (f: (r: ScenarioResult['guilds'][number], s: ScenarioResult) => boolean) =>
    Object.fromEntries(c.guilds.map(g => [g.id, c.played.filter(s => { const r = s.guilds.find(x => x.id === g.id); return r && f(r, s); }).length]));
  const best = (m: Record<string, number>) => { const max = Math.max(...Object.values(m)); return max > 0 ? Object.keys(m).filter(k => m[k] === max) as GuildId[] : []; };
  const leastDeaths = count((r, s) => r.deaths === Math.min(...s.guilds.map(x => x.deaths)));
  const mostCoins = count((r, s) => r.coins === Math.max(...s.guilds.map(x => x.coins)));
  return [
    { name: 'Vencedor', winners: best(count((r, s) => s.winner === r.id)) },
    { name: 'Menos Mortes', winners: best(leastDeaths) },
    { name: 'Mais Moedas', winners: best(mostCoins) },
    { name: 'Ganhou Recompensa', winners: best(count(r => r.reward)) },
    { name: 'Recebeu Título', winners: best(count(r => r.title)) },
  ];
}

export function victoryRank(n: number): { title: string; text: string } {
  if (n <= 1) return { title: 'Vitória Superficial', text: 'O domínio da sua Guilda é disputado: as brigas continuam pelas ruas de Arcadia.' };
  if (n <= 3) return { title: 'Vitória Decisiva', text: 'Sua Guilda subjugou os adversários; eles respeitam sua posição de Guilda dominante.' };
  return { title: 'Vitória Definitiva', text: 'Os bardos cantam suas proezas: seu governo viverá glorioso na história de Arcadia!' };
}

/** Nome do time na campanha (o escolhido pelo jogador ou "Guilda <cor>"). */
export const guildName = (id: GuildId) => { const n = teamName(id); return n.startsWith('Guilda ') || ['Azul', 'Vermelha', 'Verde', 'Laranja'].includes(n) ? `Guilda ${n.replace('Guilda ', '')}` : n; };
/** Passa a usar os nomes dos times desta campanha. */
export function useCampaignNames(c: CampaignState) { setGuildNames(Object.fromEntries(c.guilds.map(g => [g.id, g.name]))); }

// ------------------------------------------------------------------ campanha online (vários jogadores humanos)

/** Rodada do draft de cartas: cada Guilda humana escolheu 2 cartas (`picks`); as IAs já escolheram. Passa as mãos. */
export function draftPickAll(c: CampaignState, picks: Partial<Record<GuildId, string[]>>) {
  const up = c.upgrade!;
  for (const g of c.guilds) {
    if (g.controller !== 'human') continue;
    const hand = up.hands[g.id]!;
    for (const id of picks[g.id] ?? []) { const i = hand.indexOf(id); if (i >= 0) { hand.splice(i, 1); up.picked[g.id]!.push(id); } }
  }
  const order = c.guilds.map(g => g.id);
  const prev = Object.fromEntries(order.map(id => [id, up.hands[id]!]));
  order.forEach((id, i) => { up.hands[order[(i + 1) % order.length]] = prev[id]; });
  up.round++;
  if (up.round >= 3) {
    up.step = 'buy';
    for (const g of c.guilds) if (g.controller === 'ai') aiBuy(c, g);
  } else aiDraftPicks(c);
}

/** Inventário final de uma Guilda humana (valida). */
export function arrangeGuild(c: CampaignState, g: CGuild, inv: Record<string, string[]>): string[] {
  const errs = validateInventory(c, g, inv);
  if (errs.length) return errs;
  g.inventory = inv;
  c.upgrade!.bought[g.id] = [];
  return [];
}

/** Todas as Guildas terminaram a Fase de Melhorias. */
export function closeUpgrade(c: CampaignState) {
  c.upgrade = undefined;
  c.phase = 'choose';
}
