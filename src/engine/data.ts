import type { DieFace, GuildId, HeroAbility, HeroDef, MonsterDef, TokenType } from './types';
import { EXTRA_HEROES } from './extraHeroes';
import { HERO_RATING } from './ratings';

// ---------------------------------------------------------------------------
// Heróis (Livro de Regras p.8 — cartas de Grom, Maya e Zazu)
// ---------------------------------------------------------------------------
export const HEROES: Record<string, HeroDef> = {
  grom: {
    id: 'grom', name: 'Grom', nameEn: 'Grom', title: 'Bárbaro',
    defense: 1, hp: 5, ability: 'furia', abilityName: 'Fúria de Combate',
    abilityText: 'Role +1 dado em todas as rolagens enquanto estiver ferido.',
  },
  maya: {
    id: 'maya', name: 'Maya', nameEn: 'Maya', title: 'Maga do Gelo',
    defense: 1, hp: 5, ability: 'dominio_magia', abilityName: 'Domínio da Magia',
    abilityText: 'Pode exaustar cada carta de ataque Mágica duas vezes (usa 2 vezes antes de exaustar).',
  },
  zazu: {
    id: 'zazu', name: 'Zazu', nameEn: 'Zazu', title: 'Monge Furioso',
    defense: 2, hp: 4, ability: 'oportunista', abilityName: 'Oportunista',
    abilityText: 'Não exausta a carta de ataque ao atacar um alvo flanqueado (alvo com pelo menos 1 outro Inimigo Perto dele).',
  },
  vapor: {
    id: 'vapor', name: 'Vapor', nameEn: 'Wisp', title: 'Ladrão Silencioso',
    defense: 2, hp: 3, ability: 'furtivo', abilityName: 'Furtividade',
    abilityText: 'Ao se mover, não aciona Reação de Alerta.',
  },
  espetado: {
    id: 'espetado', name: 'Espetado', nameEn: 'Spike', title: 'Barbadragão Anão',
    defense: 2, hp: 3, ability: 'espinhos', abilityName: 'Vingança',
    abilityText: 'Cada ✷ (crítico) na sua rolagem de Defesa causa 1 Ferimento no atacante.',
  },
  diva: {
    id: 'diva', name: 'Diva', nameEn: 'Diva', title: 'Cavaleira',
    defense: 4, hp: 4, ability: 'duro_na_queda', abilityName: 'Duro na Queda',
    abilityText: '"Força imparável, conheça o objeto imóvel." (sem efeito especial — sua força é a Defesa 4)',
  },
  casacaverde: {
    id: 'casacaverde', name: 'Casacaverde', nameEn: 'Greensleeves', title: 'Arqueiro Élfico',
    defense: 2, hp: 4, ability: 'maestria_arco', abilityName: 'Maestria com Arco',
    abilityText: 'Ao atacar com uma carta de ataque de Arco, cada ✷ (crítico) causa 1 acerto adicional.',
  },
  hobsbawm: {
    id: 'hobsbawm', name: 'Hobsbawm', nameEn: 'Hobsbawm', title: 'Professor Arcano',
    defense: 2, hp: 4, ability: 'bencao', abilityName: 'Bênção',
    abilityText: 'Se usar uma carta de ataque Mágica e não fizer seu Movimento, você pode ativar outro Aliado em Linha de Visão.',
  },
  johan: {
    id: 'johan', name: 'Jøhan', nameEn: 'Jøhan', title: 'Cavaleiro Errante',
    defense: 3, hp: 3, ability: 'arremesso', abilityName: 'Arremesso de Lâmina',
    abilityText: 'Pode usar cartas de ataque de Espada como ataques a Distância (ainda precisa de ícones ⚔ Próximo para acertar).',
  },
  kanga: {
    id: 'kanga', name: 'Kanga', nameEn: 'Kanga', title: 'Saqueadora Elfa',
    defense: 2, hp: 4, ability: 'autossacrificio', abilityName: 'Autossacrifício',
    abilityText: 'Pode sofrer 1 Ferimento em vez de exaustar uma carta.',
  },
  escarlate: {
    id: 'escarlate', name: 'Escarlate', nameEn: 'Scarlet', title: 'Ladra Mestra',
    defense: 3, hp: 3, ability: 'apunhalar', abilityName: 'Apunhalar',
    abilityText: 'Rola +1 dado ao atacar um alvo flanqueado (alvo com pelo menos 1 outro Inimigo Perto dele).',
  },
  seth: {
    id: 'seth', name: 'Seth', nameEn: 'Seth', title: 'Mago Mercador',
    defense: 2, hp: 3, ability: 'magia_perfurante', abilityName: 'Magia Perfurante',
    abilityText: 'Ao atacar com uma carta de ataque Mágica, o alvo não rola dados de Defesa.',
  },
};

// Beyond the Grave (ref/wiki/btg-heroes.csv)
HEROES.chaz = {
  id: 'chaz', name: 'Chaz', nameEn: 'Chaz', title: 'Irmão Negro', btg: true,
  defense: 2, hp: 4, ability: 'nao_no_rosto', abilityName: 'No Rosto Não!',
  abilityText: 'Rola +2 dados nos ataques Próximos enquanto não estiver ferido.',
};
HEROES.darryn = {
  id: 'darryn', name: 'Darryn', nameEn: 'Darryn', title: 'Irmão Negro', btg: true,
  defense: 2, hp: 4, ability: 'brigao', abilityName: 'Brigão',
  abilityText: 'Rola +1 dado nos ataques contra alvos sem Ferimentos.',
};
/** Heróis da expansão Beyond the Grave. */
export const BTG_HEROES = ['chaz', 'darryn'];

/** Ordem da galeria de personagens (Core Heroes). */
export const ALL_HEROES = ['grom', 'maya', 'zazu', 'vapor', 'espetado', 'diva', 'casacaverde', 'hobsbawm', 'johan', 'kanga', 'escarlate', 'seth'];
export const CORE_HEROES = ALL_HEROES;

// ---------------------------------------------------------------------------
// Heróis extras (ref/wiki/extra-heroes.csv): id 'x_<nome>'. Jogáveis com "Permitir Todos os Heróis".
// ---------------------------------------------------------------------------
const EXTRA_ABILITY: Record<string, HeroAbility> = {
  black_newt: 'cheiro_sangue',
  bob: 'zas_tras',
  bowie: 'bate_corre',
  chooloo: 'ataque_mental',
  elysia: 'olhar_petrificante',
  frowny_faceless: 'feitico_tenaz',
  hitch: 'suga_mente',
  king_of_thieves: 'cobica',
  koba: 'teleporte',
  lilith: 'ritual_sangue',
  lord_fang: 'chamado',
  lydia: 'lamina_sugadora',
  monkey_king: 'trapaceiro',
  monkey_queen: 'macaco_ve',
  montoya: 'mestre_espadachim',
  morgan: 'aura_mistica',
  pigsy: 'hora_lanche',
  pluck: 'tiro_explosivo',
  prince_aaron: 'presenca',
  queen_of_beggars: 'doces_travessuras',
  serious_faceless: 'feitico_pressa',
  smiley_faceless: 'feitico_trapaceiro',
  sonja: 'frenesi',
  sting: 'paria',
  surprised_faceless: 'feitico_banshee',
  the_heartless: 'ataque_cardiaco',
  the_nameless: 'mente_brilhante',
  tomrick: 'sorte_apostador',
  viktor: 'cacador',
  aeric: 'resistencia_panda',
  brenna: 'relampago',
  farfalla: 'efeito_borboleta',
  haldor: 'contagem_corpos',
  hassan: 'encantado',
  leeroy: 'lobo_solitario',
  mchammer: 'briga',
  mittens: 'garras',
  nibbles: 'devorar',
  tiaret: 'arremesso_selvagem',
  yun: 'implacavel',
  zahra: 'acrobata',
};
for (const x of EXTRA_HEROES) {
  const id = `x_${x.id}`;
  HEROES[id] = {
    id, name: x.name, nameEn: x.name, title: 'Herói Extra', extra: true,
    defense: x.def, hp: x.hp, ability: EXTRA_ABILITY[x.id], abilityName: x.ability, abilityText: x.text,
  };
}
export const EXTRA_HERO_IDS = EXTRA_HEROES.map(x => `x_${x.id}`);
/** Heróis do recrutamento (Configurações da partida): Apenas Core, Core + Beyond the Grave ou Todos. */
export type HeroSet = 'core' | 'btg' | 'all';
export const HERO_SETS: [HeroSet, string][] = [['core', '⭐ Apenas Core Heroes'], ['btg', '💀 Core + Beyond the Grave'], ['all', '🌟 Permitir Todos os Heróis']];
export const heroSetName = (s: HeroSet) => ({ core: 'Apenas Core Heroes', btg: 'Core + Beyond the Grave', all: 'Todos os Heróis' })[s];
/** Conjunto salvo (aceita o antigo "Permitir Todos os Heróis"). */
export const heroSetOf = (o: { heroSet?: HeroSet; allHeroes?: boolean }): HeroSet => o.heroSet ?? (o.allHeroes ? 'all' : 'core');
export function heroPool(set: HeroSet | boolean = 'core'): string[] {
  const s = set === true ? 'all' : set === false ? 'core' : set;
  return s === 'all' ? [...ALL_HEROES, ...BTG_HEROES, ...EXTRA_HERO_IDS] : s === 'btg' ? [...ALL_HEROES, ...BTG_HEROES] : ALL_HEROES.slice();
}
// rating de cada Herói (ref/wiki/rating-heroes.csv)
for (const [id, r] of Object.entries(HERO_RATING)) if (HEROES[id]) HEROES[id].rating = r;

export const HERO_ORDER = ['grom', 'maya', 'zazu'];
/** Guilda padrão do jogador no Modo Teste (o 1º é selecionado ao começar). */
export const TEST_HUMAN_HEROES = ['vapor', 'grom', 'maya'];

export { CARDS } from './cards';

// Distribuição inicial do exemplo do livro (p.8): Grom: Espada; Maya: Drenar Vida + Raio Nova; Zazu: Adaga + Estilingue.
export const STARTING_GEAR: Record<string, string[]> = {
  grom: ['espada_enferrujada'],
  maya: ['drenar_vida', 'raio_nova'],
  zazu: ['adaga_aparadora', 'estilingue'],
  vapor: ['adaga_aparadora', 'estilingue'],
  espetado: ['espada_enferrujada', 'adaga_aparadora'],
  diva: ['espada_enferrujada', 'adaga_aparadora'],
  casacaverde: ['estilingue'],
  hobsbawm: ['raio_nova', 'drenar_vida'],
  johan: ['espada_enferrujada', 'adaga_aparadora'],
  kanga: ['estilingue', 'adaga_aparadora'],
  escarlate: ['adaga_aparadora', 'espada_enferrujada'],
  seth: ['raio_nova', 'drenar_vida'],
};

/** Distribui as 5 cartas do baralho Inicial entre os 3 Heróis da Guilda (cada carta uma única vez). */
/** Cartas iniciais: as 5 da caixa; em Beyond the Grave também a Foice (a Guilda fica com 5 e descarta 1). */
export const STARTER_DECK = ['espada_enferrujada', 'adaga_aparadora', 'estilingue', 'drenar_vida', 'raio_nova'];
export function starterCards(edition?: string): string[] { return edition === 'btg' ? [...STARTER_DECK, 'foice'] : STARTER_DECK.slice(); }
/** Erro da escolha das cartas iniciais (todas as 5; em Beyond the Grave, 5 das 6), ou null. */
export function starterError(cards: string[], edition?: string): string | null {
  const pool = starterCards(edition);
  const left = pool.slice();
  for (const c of cards) { const i = left.indexOf(c); if (i < 0) return 'Carta inicial inválida.'; left.splice(i, 1); }
  if (cards.length !== 5) return edition === 'btg' ? 'Equipe 5 das 6 cartas iniciais e descarte 1.' : 'Distribua as 5 cartas iniciais.';
  return null;
}
/** Beyond the Grave (IA): a carta inicial descartada — a que nenhum Herói prefere (a Espada Enferrujada, se der). */
function starterDiscard(heroes: string[]): string {
  const wanted = new Set(heroes.flatMap(h => STARTING_GEAR[h] ?? []));
  return ['espada_enferrujada', 'adaga_aparadora', 'estilingue', 'raio_nova', 'drenar_vida'].find(c => !wanted.has(c)) ?? 'espada_enferrujada';
}

export function distributeStartingGear(heroes: string[], edition?: string): Record<string, string[]> {
  const all = starterCards(edition);
  if (edition === 'btg') all.splice(all.indexOf(starterDiscard(heroes)), 1);
  const deck = all;
  const out: Record<string, string[]> = Object.fromEntries(heroes.map(h => [h, []]));
  const left: string[] = [];
  for (const card of deck) {
    const h = heroes.find(x => (STARTING_GEAR[x] ?? []).includes(card) && !Object.values(out).some(l => l.includes(card)));
    if (h) out[h].push(card); else left.push(card);
  }
  for (const card of left) {
    const h = heroes.slice().sort((a, b) => out[a].length - out[b].length)[0];
    out[h].push(card);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Monstros por nível (fonte: ref/wiki/monsters.csv). Id = base + sufixo de nível:
// '' = Nível 1, '2' = Nível 2-3, '4' = Nível 4-5, '6' = Nível 6. Ex.: orc, orc2, orc4, orc6.
// ---------------------------------------------------------------------------
export type MonsterAbility = 'daze' | 'packBonus' | 'critExhaust' | 'critHeal' | 'hitsAll' | 'critExtra' | 'splash'
  // Beyond the Grave
  | 'ghost' | 'huge' | 'shove' | 'banish' | 'raise' | 'object';
type MonRow = [hp: number, exterm: number, def: number, reward: number, move: number, rerolls: number, dice: number];
interface MonBase { name: string; abbr: string; category: MonsterDef['category']; attackType: MonsterDef['attackType']; attackName: string; abilities: MonsterAbility[]; abilityText: string; levels: Record<string, MonRow> }

const MON_BASE: Record<string, MonBase> = {
  goblin: { name: 'Arqueiro Goblin', abbr: 'AG', category: 'Lacaio Menor', attackType: 'ranged', attackName: 'Flechada no Joelho', abilities: [], abilityText: '',
    levels: { '': [1, 2, 0, 1, 1, 0, 2], '2': [2, 3, 0, 1, 1, 0, 2], '4': [3, 4, 0, 1, 1, 0, 3], '6': [4, 5, 0, 1, 1, 0, 3] } },
  orc: { name: 'Saqueador Orc', abbr: 'SO', category: 'Lacaio Menor', attackType: 'melee', attackName: 'Talho e Corte', abilities: [], abilityText: '',
    levels: { '': [2, 3, 0, 1, 1, 0, 3], '2': [3, 4, 0, 1, 1, 0, 3], '4': [4, 5, 0, 1, 1, 0, 4], '6': [5, 6, 0, 1, 1, 0, 4] } },
  capitao_orc: { name: 'Capitão Orc', abbr: 'CO', category: 'Lacaio Menor', attackType: 'melee', attackName: 'Talho e Corte', abilities: [], abilityText: '',
    levels: { '': [2, 4, 0, 2, 1, 1, 3], '2': [3, 5, 0, 2, 1, 1, 3], '4': [4, 6, 0, 2, 1, 2, 4], '6': [5, 7, 0, 2, 1, 2, 4] } },
  feral_martelador: { name: 'Feral Martelador', abbr: 'FM', category: 'Lacaio Maior', attackType: 'melee', attackName: 'Hora da Martelada', abilities: ['daze'], abilityText: 'Se causar Ferimento, o alvo fica Atordoado.',
    levels: { '': [3, 5, 0, 2, 1, 0, 4], '2': [4, 6, 0, 2, 1, 0, 4], '4': [5, 7, 0, 2, 1, 0, 5], '6': [7, 7, 0, 2, 1, 0, 5] } },
  feral_lanceiro: { name: 'Feral Lanceiro', abbr: 'FL', category: 'Lacaio Maior', attackType: 'ranged', attackName: 'Arremesso de Dardo', abilities: ['packBonus'], abilityText: 'Rola +1 dado se estiver Perto de outro Monstro.',
    levels: { '': [3, 5, 0, 2, 1, 0, 3], '2': [4, 6, 0, 2, 1, 0, 3], '4': [5, 7, 0, 2, 1, 0, 4], '6': [7, 7, 0, 2, 1, 0, 4] } },
  irma_dor: { name: 'Irmã da Dor', abbr: 'ID', category: 'Lacaio Maior', attackType: 'melee', attackName: 'Lamento da Agonia', abilities: ['critExhaust'], abilityText: 'Cada ✷ no ataque exausta uma carta de Ataque do alvo.',
    levels: { '': [3, 5, 0, 2, 1, 0, 3], '2': [4, 6, 0, 2, 1, 0, 4], '4': [5, 7, 0, 2, 1, 0, 4], '6': [7, 8, 0, 2, 1, 0, 5] } },
  irma_prazer: { name: 'Irmã do Prazer', abbr: 'IP', category: 'Lacaio Maior', attackType: 'ranged', attackName: 'Sifão', abilities: ['critHeal'], abilityText: 'Cada ✷ no ataque cura 2 Ferimentos dela.',
    levels: { '': [3, 5, 0, 2, 1, 0, 3], '2': [4, 6, 0, 2, 1, 0, 4], '4': [5, 7, 0, 2, 1, 0, 4], '6': [7, 8, 0, 2, 1, 0, 5] } },
  troll: { name: 'Troll', abbr: 'TR', category: 'Vilão Menor', attackType: 'melee', attackName: 'Esmagar Cabeças', abilities: ['hitsAll'], abilityText: 'Atinge todos os Heróis Perto.',
    levels: { '': [4, 6, 2, 3, 2, 0, 4], '2': [5, 7, 2, 3, 2, 0, 4], '4': [6, 8, 3, 3, 2, 0, 5], '6': [8, 8, 3, 3, 2, 0, 5] } },
  minotauro: { name: 'Minotauro', abbr: 'MN', category: 'Vilão Menor', attackType: 'melee', attackName: 'Chifrada', abilities: ['critExtra'], abilityText: 'Cada ✷ causa 1 acerto adicional.',
    levels: { '': [5, 6, 1, 3, 2, 0, 4], '2': [6, 7, 1, 3, 2, 0, 4], '4': [7, 9, 2, 3, 2, 0, 5], '6': [8, 9, 2, 3, 2, 0, 5] } },
  lorde_presas: { name: 'Lorde Presas', abbr: 'LP', category: 'Vilão Maior', attackType: 'ranged', attackName: 'Banho de Sangue', abilities: ['splash'], abilityText: 'Também pode atingir qualquer número de Inimigos Perto do alvo.',
    levels: { '': [5, 7, 0, 3, 1, 0, 4], '2': [7, 8, 0, 3, 1, 0, 4], '4': [8, 9, 2, 3, 1, 0, 5], '6': [13, 0, 4, 4, 1, 0, 5] } },
};
// Beyond the Grave (Livro de Campanha p.29-31). As fichas não vêm no livro: valores no padrão dos Monstros da caixa básica.
Object.assign(MON_BASE, {
  esqueleto: { name: 'Esqueleto', abbr: 'ES', category: 'Lacaio Menor', attackType: 'melee', attackName: 'Osso Afiado', abilities: [], abilityText: 'Ossos blindados: tem 1 dado de Defesa.',
    levels: { '': [2, 3, 1, 1, 1, 0, 2], '2': [3, 4, 1, 1, 1, 0, 3], '4': [4, 5, 1, 1, 1, 0, 3], '6': [5, 6, 1, 1, 1, 0, 4] } },
  zumbi_arremessador: { name: 'Zumbi Arremessador', abbr: 'ZA', category: 'Lacaio Menor', attackType: 'ranged', attackName: 'Machado Voador', abilities: [], abilityText: '',
    levels: { '': [2, 3, 0, 1, 1, 0, 2], '2': [3, 4, 0, 1, 1, 0, 3], '4': [4, 5, 0, 1, 1, 0, 3], '6': [5, 6, 0, 1, 1, 0, 4] } },
  zumbi_retalhador: { name: 'Zumbi Retalhador', abbr: 'ZR', category: 'Lacaio Maior', attackType: 'melee', attackName: 'Retalhar', abilities: ['critExtra'], abilityText: 'Cada ✷ causa 1 acerto adicional.',
    levels: { '': [4, 5, 0, 2, 1, 0, 3], '2': [5, 6, 0, 2, 1, 0, 4], '4': [6, 7, 0, 2, 1, 0, 4], '6': [8, 8, 0, 2, 1, 0, 5] } },
  fantasma: { name: 'Fantasma', abbr: 'FA', category: 'Lacaio Maior', attackType: 'melee', attackName: 'Toque Gélido', abilities: ['ghost'],
    abilityText: 'Fantasma: atravessa paredes, portas e Espaços bloqueados; os Espaços ao lado dele contam como Perto mesmo com parede.',
    levels: { '': [3, 5, 0, 2, 1, 0, 3], '2': [4, 6, 0, 2, 1, 0, 3], '4': [5, 7, 0, 2, 1, 0, 4], '6': [6, 8, 0, 2, 1, 0, 5] } },
  necromante: { name: 'Necromante', abbr: 'NE', category: 'Lacaio Maior', attackType: 'ranged', attackName: 'Canto Macabro', abilities: ['raise'],
    abilityText: 'Erguer os Mortos: antes de atacar, traz de volta o primeiro Monstro do Tabuleiro de Entrada para Perto dele.',
    levels: { '': [3, 5, 0, 2, 1, 0, 3], '2': [4, 6, 0, 2, 1, 0, 3], '4': [5, 7, 1, 2, 1, 0, 4], '6': [6, 8, 1, 2, 1, 0, 4] } },
  ivan: { name: 'Ivan', abbr: 'IV', category: 'Vilão Menor', attackType: 'melee', attackName: 'Arranca-Cérebro', abilities: ['critExhaust'], abilityText: 'Cada ✷ no ataque exausta uma carta de Ataque do alvo.',
    levels: { '': [4, 6, 1, 3, 2, 0, 4], '2': [5, 7, 1, 3, 2, 0, 4], '4': [6, 8, 2, 3, 2, 0, 5], '6': [8, 8, 2, 3, 2, 0, 5] } },
  frank: { name: 'Frank', abbr: 'FK', category: 'Vilão Menor', attackType: 'melee', attackName: 'Abraço Esmagador', abilities: ['daze'], abilityText: 'Se causar Ferimento, o alvo fica Atordoado.',
    levels: { '': [6, 7, 1, 3, 1, 0, 4], '2': [7, 8, 1, 3, 1, 0, 5], '4': [8, 9, 2, 3, 1, 0, 5], '6': [9, 9, 2, 3, 1, 0, 6] } },
  dr_spider: { name: 'Dr. Spider', abbr: 'DS', category: 'Vilão Menor', attackType: 'ranged', attackName: 'Experimento Instável', abilities: ['banish'],
    abilityText: 'Banimento: se causar Ferimento, o alvo vai para o Tabuleiro de Entrada (com os Ferimentos e marcadores).',
    levels: { '': [4, 6, 1, 3, 2, 0, 4], '2': [5, 7, 1, 3, 2, 0, 4], '4': [6, 8, 1, 3, 2, 0, 5], '6': [8, 8, 2, 3, 2, 0, 5] } },
  // Reservas de Comida (Abatedouro): marcador atacável como se fosse um personagem; um ✷ o destrói
  reserva: { name: 'Reserva de Comida', abbr: 'RC', category: 'Lacaio Menor', attackType: 'melee', attackName: '—', abilities: ['object'],
    abilityText: 'Marcador de Missão: ataque-o como um personagem; se o ataque rolar algum ✷, ele é destruído. Não reage nem ocupa o Espaço.',
    levels: { '': [99, 0, 0, 0, 0, 0, 0], '2': [99, 0, 0, 0, 0, 0, 0], '4': [99, 0, 0, 0, 0, 0, 0], '6': [99, 0, 0, 0, 0, 0, 0] } },
  rei_pavoroso: { name: 'Rei Pavoroso', abbr: 'RP', category: 'Vilão Maior', attackType: 'melee', attackName: 'Lâmina do Além', abilities: ['huge', 'shove', 'banish'],
    abilityText: 'Enorme: ocupa o Espaço inteiro (bloqueia Inimigos e Linha de Visão). Empurrão: entra em Espaços ocupados e empurra quem está lá. Banimento: quem ele ferir vai para o Tabuleiro de Entrada.',
    levels: { '': [7, 8, 2, 4, 2, 0, 5], '2': [9, 9, 2, 4, 2, 0, 5], '4': [11, 0, 3, 4, 2, 0, 6], '6': [14, 0, 3, 4, 2, 0, 6] } },
} satisfies Record<string, MonBase>);
const LEVEL_LABEL: Record<string, string> = { '': '1', '2': '2-3', '4': '4-5', '6': '6' };

export const MONSTERS: Record<string, MonsterDef> = {};
for (const [base, m] of Object.entries(MON_BASE)) for (const [suf, r] of Object.entries(m.levels)) {
  const abilities: string[] = [...m.abilities];
  const presas6 = base === 'lorde_presas' && suf === '6';
  if (presas6) abilities.push('critHeal');
  MONSTERS[base + suf] = {
    id: base + suf, name: m.name, abbr: m.abbr, category: m.category, level: LEVEL_LABEL[suf],
    hp: r[0], exterm: r[1] || Infinity, defense: r[2], reward: r[3], move: r[4], rerolls: r[5], dice: r[6],
    attackType: m.attackType, attackName: m.attackName, abilities, hitsAll: abilities.includes('hitsAll'),
    abilityText: presas6 ? `${m.abilityText} Cada ✷ cura 2 Ferimentos dele.` : m.abilityText,
  };
}
/** Sufixo de id do nível de Monstro: '1' -> '', '2-3' -> '2', '4-5' -> '4', '6' -> '6'. */
export function levelSuffix(level: string | undefined): string {
  return ({ '1': '', '2-3': '2', '4-5': '4', '6': '6' } as Record<string, string>)[level ?? '1'] ?? '';
}
/** Nível dos Monstros pelo número do cenário na campanha (1º = 1, 2º-3º = 2-3, 4º-5º = 4-5, 6º = 6). */
export function levelForScenario(n: number): string { return n <= 1 ? '1' : n <= 3 ? '2-3' : n <= 5 ? '4-5' : '6'; }
/** Nível um abaixo (Título "Destruidor da Pedra Sangrenta"). */
export function lowerSuffix(suf: string): string { return ({ '6': '4', '4': '2', '2': '', '': '' } as Record<string, string>)[suf]; }

// ---------------------------------------------------------------------------
// Dados. Ajuste as faces aqui se quiser bater 100% com os dados físicos.
// ---------------------------------------------------------------------------
// Ataque (preto): 3 Espadas (Próximo), 2 Arcos (Distância), 1 Crítico. Defesa (branco): 4 vazias, 1 Escudo, 1 Crítico.
export const ATTACK_DIE: DieFace[] = ['crit', 'melee', 'melee', 'melee', 'ranged', 'ranged'];
export const DEFENSE_DIE: DieFace[] = ['crit', 'shield', 'blank', 'blank', 'blank', 'blank'];

// 5 marcadores de Entrada de Monstro (pares de símbolos do dado de ataque).
export const ENTRY_PAIRS: [DieFace, DieFace][] = [
  ['melee', 'melee'],
  ['ranged', 'ranged'],
  ['melee', 'ranged'],
  ['crit', 'melee'],
  ['crit', 'ranged'],
];

// 14 marcadores de Exploração (o cenário sorteia 12).
export const EXPLORATION_BAG: { type: TokenType; value?: number }[] = [
  { type: 'cura' }, { type: 'cura' }, { type: 'cura' },
  { type: 'revigorante' }, { type: 'revigorante' }, { type: 'revigorante' },
  { type: 'turno' }, { type: 'turno' },
  { type: 'bau', value: 1 }, { type: 'bau', value: 1 }, { type: 'bau', value: 2 }, { type: 'bau', value: 3 },
  { type: 'armadilha' }, { type: 'armadilha' },
];

export const TOKEN_INFO: Record<TokenType, { name: string; text: string }> = {
  cura: { name: 'Poção de Cura', text: 'Descarte no seu turno para remover todos os Ferimentos deste Herói.' },
  revigorante: { name: 'Poção Revigorante', text: 'Descarte no seu turno para restaurar todas as cartas deste Herói.' },
  turno: { name: 'Poção de Turno Adicional', text: 'Descarte no fim do turno para fazer um turno adicional completo.' },
  bau: { name: 'Baú de Tesouro', text: 'Ao final do cenário, vale moedas para a Guilda.' },
  armadilha: { name: 'Armadilha', text: 'Causa 1 Ferimento automático e é descartada.' },
  missao: { name: 'Marcador de Missão', text: 'As Armas Perdidas!' },
};

/** Nomes escolhidos pelos jogadores para os times (vazio = nome padrão da cor). */
export const GUILD_NAMES: Partial<Record<GuildId, string>> = {};
export function setGuildNames(names: Partial<Record<GuildId, string | undefined>>) {
  for (const k of Object.keys(GUILD_NAMES) as GuildId[]) delete GUILD_NAMES[k];
  for (const [k, v] of Object.entries(names)) if (v && v.trim()) GUILD_NAMES[k as GuildId] = v.trim();
}
/** Nome curto do time: o escolhido pelo jogador ou a cor (Azul, Vermelha…). */
export function teamName(g: GuildId): string { return GUILD_NAMES[g] ?? GUILDS[g].name.split(' (')[0].replace('Guilda ', ''); }

export const GUILDS: Record<GuildId, { name: string; color: string; dark: string; light: string }> = {
  azul: { name: 'Guilda Azul (Águia)', color: '#2f7fd6', dark: '#1b4f8c', light: '#8fc3ff' },
  vermelho: { name: 'Guilda Vermelha (Raposa)', color: '#d8432f', dark: '#8e2418', light: '#ff9d8c' },
  verde: { name: 'Guilda Verde (Panda)', color: '#3fa34d', dark: '#22632b', light: '#9be3a4' },
  laranja: { name: 'Guilda Laranja (Leão)', color: '#e38a1c', dark: '#965a0d', light: '#ffcb85' },
};
