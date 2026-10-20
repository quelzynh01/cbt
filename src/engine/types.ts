// Tipos centrais do motor de regras (puro, sem DOM) — pronto para rodar no servidor no modo online.

export interface Cell { c: number; r: number }

export type GuildId = 'azul' | 'vermelho' | 'verde' | 'laranja';
export type AttackType = 'melee' | 'ranged';
export type DieFace = 'crit' | 'melee' | 'ranged' | 'shield' | 'blank';

export type { CardDef } from './cards';

export interface CardInst { uid: string; defId: string; exhausted: boolean; uses: number }

export type HeroAbility =
  | 'furia' | 'dominio_magia' | 'oportunista' | 'furtivo' | 'espinhos'
  | 'duro_na_queda' | 'maestria_arco' | 'bencao' | 'arremesso' | 'autossacrificio'
  | 'apunhalar' | 'magia_perfurante';

export interface HeroDef {
  id: string;
  name: string;
  /** Nome na edição em inglês (referência das cartas). */
  nameEn: string;
  /** false = habilidade ainda não implementada (texto incompleto). */
  implemented?: boolean;
  defense: number;
  hp: number;
  ability: HeroAbility;
  abilityName: string;
  abilityText: string;
  title: string;
}

export type MonsterCategory = 'Lacaio Menor' | 'Lacaio Maior' | 'Vilão Menor' | 'Vilão Maior';

export interface MonsterDef {
  id: string;
  name: string;
  abbr: string;
  category: MonsterCategory;
  level: string;
  hp: number;
  exterm: number;
  defense: number;
  reward: number;
  move: number;
  attackType: AttackType;
  dice: number;
  attackName: string;
  rerolls: number;
  /** Ataque atinge todos os Heróis Perto (Troll). */
  hitsAll?: boolean;
  abilities?: string[];
  abilityText?: string;
}

export type TokenType = 'cura' | 'revigorante' | 'turno' | 'bau' | 'armadilha' | 'missao';

export interface Token {
  id: string;
  type: TokenType;
  value?: number;
  /** Cor do marcador de Missão (id de Guilda). */
  color?: string;
  faceUp: boolean;
}

export interface Unit {
  id: string;
  kind: 'hero' | 'monster';
  defId: string;
  guild: GuildId | null;
  cell: Cell | null;
  wounds: number;
  alive: boolean;
  stunned: boolean;
  cards: CardInst[];
  tokens: Token[];
  deaths: number;
  num: number;
  /** Vilões: Guildas que tentaram ferir este Monstro (todas recebem a recompensa). */
  hitBy?: GuildId[];
  /** Maldição Mortal (campanha). */
  curse?: string;
}

export interface Door { id: string; a: Cell; b: Cell; open: boolean; small?: boolean; locked?: boolean }

export interface Activation {
  heroId: string;
  mp: number;
  moved: boolean;
  moveLocked: boolean;
  attacked: boolean;
}

export interface MissionDef {
  id: string;
  name: string;
  kind: 'pve' | 'pvp';
  text: string;
  targetGuild?: GuildId;
  maxCompletions?: number;
  /** Como a Missão é cumprida. */
  rule?: 'collect_any' | 'collect_own' | 'kill_count' | 'kill_type' | 'carry' | 'step_on' | 'escort' | 'arena' | 'summon';
  /** escort: para onde levar o marcador (Espaços ou a própria Área Inicial). */
  escortTo?: Cell[] | 'own_area';
  /** summon: Monstro (id base) invocado ao pisar no marcador. */
  summon?: string;
  /** step_on: cores dos marcadores que contam. */
  colors?: string[];
  /** Título da campanha dado por esta Missão. */
  title?: string;
  titleFirstOnly?: boolean;
  /** Fechar o Portão: remove 1 Entrada de Monstro. */
  removeEntry?: boolean;
  count?: number;
  /** Tipos (id base) de Monstro para 'kill_type'. */
  types?: string[];
  /** Dá uma carta de Recompensa. */
  reward?: boolean;
}

export interface GuildState {
  id: GuildId;
  name: string;
  color: string;
  controller: 'human' | 'ai';
  coins: number;
  missions: string[];
  startArea: number;
  monsterKills: number;
  heroIds: string[];
  /** Nome escolhido pelo jogador para o time (opcional). */
  label?: string;
  /** Templo: Guilda já juntou moedas suficientes para atravessar a barreira mágica. */
  barrierOpen?: boolean;
}

/** Rerrolagem numa rolagem: faces antes, índices rolados de novo e se o jogador escolheu (diálogo). */
export interface RerollInfo { before: DieFace[]; idx: number[]; asked: boolean }

export interface EntryMarker { cell: Cell; pair: [DieFace, DieFace] }

export type DiceMode = 'normal' | 'max' | 'zero';

/** Decisão pendente do jogador que controla os Monstros (o jogador à direita do ativo). */
export interface PendingVengeance {
  kind: 'vinganca';
  monsterId: string;
  heroId: string;
  dying: string[];
  controller: GuildId;
}

export interface GameState {
  rng: number;
  mapId: string;
  doors: Door[];
  units: Record<string, Unit>;
  guildOrder: GuildId[];
  guilds: Partial<Record<GuildId, GuildState>>;
  current: number;
  activation: Activation | null;
  extraTurn: boolean;
  floor: Record<string, Token[]>;
  entryBoard: string[];
  entryMarkers: EntryMarker[];
  missions: MissionDef[];
  missionDone: Record<string, GuildId[]>;
  rewardDeck: string[];
  missionsToWin: number;
  winner: GuildId | null;
  turn: number;
  pending?: PendingVengeance | null;
  /** Tempo de jogo da partida (ms). */
  elapsed?: number;
  /** Nível dos Monstros desta partida. */
  level?: string;
  /** Títulos de campanha por Guilda. */
  titles?: Partial<Record<GuildId, string[]>>;
  /** Campos de minas das Bombas. */
  mines?: { cell: Cell; guild: GuildId; dice: number }[];
  /** Heróis já ativados neste turno (para a Bênção de Hobsbawm). */
  activatedThisTurn?: string[];
  /** Bênção de Hobsbawm disponível: pode ativar outro Aliado em Linha de Visão. */
  blessing?: { heroId: string } | null;
  /** Posicionamento inicial: Guildas que ainda estão escolhendo onde seus Heróis começam. */
  deploying?: GuildId[] | null;
  /** Arena do Sol Brilhante: marcadores de Guilda colocados nos marcadores de Missão (chaves dos Espaços). */
  arena?: Partial<Record<GuildId, string[]>>;
  /** Esconderijo do Troll já saqueado. */
  hideoutTaken?: boolean;
  debug: { attackDice: DiceMode; defenseDice: DiceMode; revealTokens: boolean; heroesImmortal: boolean; freeMode?: boolean };
}

export type GameEvent =
  | { t: 'move'; id: string; from: Cell; to: Cell; portal?: boolean }
  | { t: 'door'; doorId: string; open: boolean; by: string }
  | {
      t: 'attack';
      attackerId: string;
      reason: 'heroi' | 'alerta' | 'vinganca' | 'armadilha';
      cardName: string;
      attackType: AttackType;
      dice: DieFace[];
      hits: number;
      crits: number;
      targets: { id: string; defense: DieFace[]; blocks: number; wounds: number; stunnedNoDefense: boolean; rr?: RerollInfo }[];
      notes: string[];
      /** Rerrolagem do ataque: faces antes e quais dados foram rolados de novo. */
      rr?: RerollInfo;
    }
  | { t: 'damage'; id: string; amount: number; wounds: number; maxHp: number }
  | { t: 'heal'; id: string; amount: number; wounds: number }
  | { t: 'death'; id: string; exterminated?: boolean }
  | { t: 'stun'; id: string; on: boolean }
  /** hidden: o marcador estava virado para baixo (é revelado ao pegar). */
  | { t: 'pickup'; heroId: string; token: Token; hidden?: boolean }
  /** Herói usou um marcador (poção). */
  | { t: 'useToken'; heroId: string; token: Token }
  /** Habilidade Natural ativada (Furtividade do Vapor, Vingança do Espetado…). */
  | { t: 'skill'; id: string; skill: string; name: string }
  | { t: 'drop'; cell: Cell; tokens: Token[] }
  | { t: 'spawn'; id: string; cell: Cell }
  | { t: 'cemetery'; id: string; count: number; full: boolean }
  | { t: 'spawnStart'; ids: string[] }
  | { t: 'spawnRoll'; id: string; faces: DieFace[]; cell: Cell | null; reason: string }
  | { t: 'respawn'; id: string; cell: Cell }
  | { t: 'coins'; guild: GuildId; amount: number; reason: string }
  | { t: 'mission'; guild: GuildId; missionId: string; name: string; first: boolean }
  | { t: 'reaction'; monsterId: string; kind: 'alerta' | 'vinganca' }
  | { t: 'turn'; guild: GuildId; turn: number }
  | { t: 'rest'; guild: GuildId }
  | { t: 'card'; heroId: string; cardName: string }
  | { t: 'gameover'; winner: GuildId; summary: { guild: GuildId; coins: number; missions: number }[] }
  | { t: 'log'; text: string };
