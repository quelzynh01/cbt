import { CARDS, CURSES, curseDeck, upgradeDeck } from '../engine/cards';
import { aiBans, afterBans, drawBanPool, validBans } from '../engine/heroBan';
import { mapTitlesOf } from '../engine/board';
import { TITLES } from '../engine/titles';
import { GUILDS, HEROES, distributeStartingGear, heroPool, levelForScenario, setGuildNames, starterError, teamName, type HeroSet } from '../engine/data';
import type { Game } from '../engine/game';
import { MAPS, campaignList, type Edition } from '../engine/maps';
import type { GameState, GuildId } from '../engine/types';
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
  /** Tela das Maldições: quantos Heróis já viraram as cartas e quantas cartas do atual estão viradas. */
  curseStep?: number;
  curseFlipped?: number;
  /** Já mostrou as Maldições (e o resumo). */
  curseDone?: boolean;
  /** Depois da compra: mostra o que cada Guilda comprou e descartou. */
  buySummary?: boolean;
  /** Registro das compras de cada Guilda (a lista `bought` esvazia quando as cartas entram nos Heróis). */
  purchased?: Partial<Record<GuildId, string[]>>;
  /** Cartas que a Guilda tirou do inventário para dar lugar às novas (IA). */
  dropped?: Partial<Record<GuildId, string[]>>;
}

/** Preparação da campanha: escolha de Heróis em rodadas, votação do mapa e equipamento inicial. */
export interface Setup {
  step: 'ban' | 'draft' | 'vote' | 'equip';
  /** "Permitir Todos os Heróis": os 20 Heróis sorteados para o banimento e quem cada Guilda baniu. */
  banPool?: string[];
  bans?: Partial<Record<GuildId, string[]>>;
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
  /** Configurações da partida: na Fase de Melhorias cada um pega 1 carta por rodada (6 rodadas) em vez de 2 (3 rodadas). */
  pickOne?: boolean;
  /** Mapa já escolhido para o próximo cenário (fica salvo: sair e voltar não muda). */
  next?: string;
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
  /** Limite de dados (Configurações da partida): no máximo 8 dados de ataque e 6 de defesa por rolagem. Sem isso, ilimitado. */
  diceCap?: boolean;
  /** Configurações da partida (antigo): "Permitir Todos os Heróis". */
  allHeroes?: boolean;
  /** Configurações da partida: Heróis do recrutamento (Apenas Core, Core + Beyond the Grave ou Todos). */
  heroSet?: HeroSet;
  /** Edição da campanha: CBT Clássico ou Beyond the Grave. */
  edition?: Edition;
  /** Cenário em andamento (salvo automaticamente): dá para sair e continuar depois de onde parou. */
  match?: { mapId: string; state: GameState; savedAt: number };
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
export function newCampaign(opponents: number, name?: string, aiLevel: AILevel = 'normal', diceCap = true, pickOne = true, heroSet: HeroSet | boolean = 'core', edition: Edition = 'classic'): CampaignState {
  const hs: HeroSet = heroSet === true ? 'all' : heroSet === false ? 'core' : heroSet;
  const ids: GuildId[] = ['azul', 'vermelho', 'verde', 'laranja'];
  const c: CampaignState = { version: 1, guilds: [], played: [], chooser: 'azul', phase: 'setup', seed: (Date.now() ^ (Math.random() * 1e9)) | 0, elapsed: 0, aiLevel, diceCap, ...(pickOne ? { pickOne } : {}), ...(hs !== 'core' ? { heroSet: hs } : {}), ...(edition !== 'classic' ? { edition } : {}) };
  for (let i = 0; i <= opponents; i++) c.guilds.push({ id: ids[i], controller: i === 0 ? 'human' : 'ai', heroes: [], inventory: {}, saved: 0, titles: [], curses: {}, ...(i === 0 && name?.trim() ? { name: name.trim().slice(0, 20) } : {}) });
  useCampaignNames(c);
  // Recrutamento de Heróis (p.7): cada jogador recebe uma mão, escolhe 1 e passa o resto para a esquerda.
  // "Permitir Todos os Heróis": antes, o banimento (20 sorteados, cada um bane 2)
  if (hs === 'all') { c.setup = { step: 'ban', round: 0, hands: {}, banPool: drawBanPool(() => rnd(c)), bans: {} }; return c; }
  dealHeroes(c, shuffled(c, heroPool(hs)));
  return c;
}

/** Recrutamento: distribui as mãos de Heróis (4 cartas com até 3 jogadores, 3 com 4). */
function dealHeroes(c: CampaignState, pool: string[]) {
  const size = c.guilds.length <= 3 ? 4 : 3;
  c.setup = { ...c.setup, step: 'draft', round: 0, hands: Object.fromEntries(c.guilds.map(g => [g.id, pool.splice(0, size)])) };
}

/** Banimento: o jogador bane 2 Heróis da pool; as IAs banem ao mesmo tempo. Depois, o recrutamento normal. */
export function banHeroes(c: CampaignState, ids: string[]): boolean {
  const st = c.setup!;
  if (st.step !== 'ban' || !st.banPool || !validBans(st.banPool, ids)) return false;
  st.bans = {};
  for (const g of c.guilds) st.bans[g.id] = g.controller === 'human' ? ids.slice() : aiBans(st.banPool, () => rnd(c), [ids, ...Object.values(st.bans)].flat() as string[]);
  dealHeroes(c, afterBans(st.banPool, Object.values(st.bans) as string[][], () => rnd(c)));
  return true;
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
  const se = starterError(all, c.edition);
  if (se) errs.push(se);
  if (errs.length) return errs;
  me.inventory = inv;
  for (const g of c.guilds) if (g.controller === 'ai') g.inventory = distributeStartingGear(g.heroes, c.edition);
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
  return campaignList(c.edition).filter(s => s.circle === circle && s.map && !c.played.some(p => p.mapId === s.map!.id)).map(s => s.map!.id);
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
    diceCap: !!c.diceCap,
    level: scenarioLevel(c),
    titles: Object.fromEntries(c.guilds.map(g => [g.id, g.titles.slice()])),
    players: order.map(g => ({ guild: g.id, controller: g.controller, heroes: g.heroes, cards: g.inventory, curses: g.curses, name: g.name })),
  };
}

// ------------------------------------------------------------------ fim de cenário
export function recordResult(c: CampaignState, game: Game) {
  const s = game.s;
  const res: ScenarioResult = { mapId: s.mapId, winner: s.winner!, ms: s.elapsed ?? 0, guilds: [] };
  delete c.match; // o cenário acabou: não há mais partida salva
  c.elapsed = (c.elapsed ?? 0) + (s.elapsed ?? 0);
  for (const cg of c.guilds) {
    const gs = game.guild(cg.id);
    const heroes = game.heroesOf(cg.id);
    const deathsByHero = Object.fromEntries(heroes.map(h => [h.defId, h.deaths]));
    // cartas ao fim do cenário (inclui Recompensas ganhas)
    const before = Object.values(cg.inventory).flat();
    // a carta que ficou debaixo de uma Maldição volta para o inventário
    cg.inventory = Object.fromEntries(heroes.map(h => [h.defId, [...h.cards, ...(h.covered ? [h.covered] : [])].map(x => x.defId)]));
    // cartas sem Herói (Recompensa com o inventário cheio): vão para o primeiro Herói e são organizadas na Fase de Melhorias
    const spare = (game.s.spare?.[cg.id] ?? []).map(x => x.defId);
    if (spare.length && heroes[0]) cg.inventory[heroes[0].defId] = [...(cg.inventory[heroes[0].defId] ?? []), ...spare];
    const after = Object.values(cg.inventory).flat();
    const reward = after.some(id => CARDS[id]?.level === 'R' && after.filter(x => x === id).length > before.filter(x => x === id).length);
    const newTitles = (s.titles?.[cg.id] ?? []).filter(t => !cg.titles.includes(t));
    cg.titles.push(...newTitles);
    res.guilds.push({ id: cg.id, coins: gs.coins + cg.saved, deaths: heroes.reduce((a, h) => a + h.deaths, 0), missions: gs.missions.length, reward, title: newTitles.length > 0, deathsByHero });
  }
  c.played.push(res);
  c.chooser = res.winner;
  c.next = undefined;
  if (c.played.length >= 6) { c.phase = 'done'; return; }
  startUpgrade(c, res);
}

// ------------------------------------------------------------------ Fase de Melhorias (p.24)
function startUpgrade(c: CampaignState, res: ScenarioResult) {
  const level = Math.min(5, c.played.length);
  const up: Upgrade = { level, step: 'draft', round: 0, hands: {}, picked: {}, coins: {}, bought: {}, cursesDrawn: [] };
  // Maldições Mortais: devolve as antigas, cada Herói compra 1 por marcador de Morte e fica com a de maior valor
  // (na ordem dos jogadores; as cartas que o Herói não ficou voltam para o baralho, que é embaralhado de novo)
  for (const g of c.guilds) g.curses = {};
  let deck = shuffled(c, curseDeck());
  const order = c.guilds.map(g => g.id);
  const byOrder = res.guilds.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const rg of byOrder) for (const [hero, deaths] of Object.entries(rg.deathsByHero)) {
    if (!deaths) continue;
    const drawn = deck.splice(0, Math.min(deaths, deck.length));
    if (!drawn.length) continue;
    const kept = drawn.slice().sort((a, b) => CURSES[b].value - CURSES[a].value)[0];
    if (kept !== 'sem_maldicao') guildOf(c, rg.id).curses[hero] = kept;
    up.cursesDrawn.push({ guild: rg.id, hero, drawn, kept });
    const back = drawn.slice();
    back.splice(back.indexOf(kept), 1);
    deck = shuffled(c, [...deck, ...back]);
  }
  up.curseStep = 0;
  up.curseFlipped = 0;
  up.curseDone = !up.cursesDrawn.length;
  // moedas do cenário + moeda guardada
  for (const rg of res.guilds) up.coins[rg.id] = rg.coins;
  for (const g of c.guilds) g.saved = 0;
  // 6 cartas para cada jogador
  const ud = shuffled(c, upgradeDeck(level, c.edition));
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

/** Cartas escolhidas por rodada na Fase de Melhorias (2, ou 1 com a regra "pegar 1") e quantas rodadas (sempre 6 cartas no fim). */
export const picksPerRound = (c: CampaignState) => c.pickOne ? 1 : 2;
export const draftRounds = (c: CampaignState) => 6 / picksPerRound(c);

export function aiDraftPicks(c: CampaignState) {
  const up = c.upgrade!;
  for (const g of c.guilds) if (g.controller === 'ai') {
    const hand = up.hands[g.id]!;
    const score = Object.fromEntries(hand.map(id => [id, guildCardValue(c, g, id)]));
    const best = hand.slice().sort((a, b) => score[b] - score[a]).slice(0, picksPerRound(c));
    for (const id of best) hand.splice(hand.indexOf(id), 1);
    up.picked[g.id]!.push(...best);
  }
}

/** Campanha só de IAs (testes): roda a Fase de Melhorias inteira automaticamente. */
export function autoUpgrade(c: CampaignState) {
  const up = c.upgrade;
  if (!up) return;
  const order = c.guilds.map(g => g.id);
  while (up.round < draftRounds(c)) {
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
  if (up.round >= draftRounds(c)) {
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
  (up.purchased ??= {})[g.id] = ok.slice();
  up.coins[g.id] = coins;
  g.saved = Math.min(1, coins);
}

// ------------------------------------------------------------------ inventário
export function heroSlots(c: CampaignState, g: CGuild, hero: string, cards = g.inventory[hero] ?? []): { used: number; max: number; magicExtra: number } {
  const curse = g.curses[hero] ? CURSES[g.curses[hero]] : null;
  const magicExtra = cards.reduce((s, id) => s + (CARDS[id]?.fx.magicSlots ?? 0), 0);
  const magic = cards.filter(id => CARDS[id]?.magic && CARDS[id]?.kind === 'attack').length;
  // Maldição que ocupa espaço não tira carta: se o Herói tiver 4, a última fica debaixo dela no próximo cenário (p.24)
  void curse;
  const used = cards.length - Math.min(magic, magicExtra);
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
        if (validateInventory(c, g, { ...inv, [h]: next }).length === 0) { inv[h] = next; ((up.dropped ??= {})[g.id] ??= []).push(worst); break; }
      }
    }
  }
  // ainda inválido (ex.: Maldição ocupou um espaço): descarta as piores
  for (const h of g.heroes) while (inv[h].length && validateInventory(c, g, inv).some(e => e.startsWith(HEROES[h].name))) {
    const worst = inv[h].slice().sort((a, b) => cardValue(a) - cardValue(b))[0];
    inv[h] = inv[h].filter(x => x !== worst);
    ((up.dropped ??= {})[g.id] ??= []).push(worst);
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

/** Mapa do próximo cenário, se já está decidido: votação (1º), escolha salva ou a escolha da IA (que fica salva). */
export function nextScenario(c: CampaignState): string | null {
  const av = availableScenarios(c);
  if (c.next && av.includes(c.next)) return c.next;
  if (!c.played.length && c.voted && av.includes(c.voted)) return (c.next = c.voted);
  if (guildOf(c, c.chooser).controller === 'ai') { const p = aiChoice(c); if (p) c.next = p; return p; }
  return null;
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
  if (up.round >= draftRounds(c)) {
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

/** Quem tem Título com vantagem neste mapa (para mostrar na escolha do cenário). */
export function titleHolders(c: CampaignState, mapId: string, name: (g: GuildId) => string): { name: string; color: string; title: string }[] {
  const map = MAPS[mapId];
  if (!map) return [];
  const here = mapTitlesOf(map);
  return c.guilds.flatMap(g => g.titles.filter(t => here.includes(t)).map(t => ({ name: name(g.id), color: GUILDS[g.id].color, title: TITLES[t] ?? t })));
}
