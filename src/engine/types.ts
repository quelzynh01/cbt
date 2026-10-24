// Tipos centrais do motor de regras (puro, sem DOM) — pronto para rodar no servidor no modo online.

export interface Cell { c: number; r: number }

export type GuildId = 'azul' | 'vermelho' | 'verde' | 'laranja';
export type AttackType = 'melee' | 'ranged';
export type DieFace = 'crit' | 'melee' | 'ranged' | 'shield' | 'blank';

export type { CardDef } from './cards';

export interface CardInst { uid: string; defId: string; exhausted: boolean; uses: number; /** Escudo armado para a próxima Defesa. */ armed?: boolean }

export type HeroAbility =
  | 'furia' | 'dominio_magia' | 'oportunista' | 'furtivo' | 'espinhos'
  | 'duro_na_queda' | 'maestria_arco' | 'bencao' | 'arremesso' | 'autossacrificio'
  | 'apunhalar' | 'magia_perfurante'
  // Heróis extras
  // Beyond the Grave
  | 'nao_no_rosto' | 'brigao'
  | 'cheiro_sangue' | 'zas_tras' | 'bate_corre' | 'ataque_mental' | 'olhar_petrificante' | 'feitico_tenaz' | 'suga_mente' | 'cobica' | 'teleporte' | 'ritual_sangue' | 'chamado' | 'lamina_sugadora' | 'trapaceiro' | 'macaco_ve' | 'mestre_espadachim' | 'aura_mistica' | 'hora_lanche' | 'tiro_explosivo' | 'presenca' | 'doces_travessuras' | 'feitico_pressa' | 'feitico_trapaceiro' | 'frenesi' | 'paria' | 'feitico_banshee' | 'ataque_cardiaco' | 'mente_brilhante' | 'sorte_apostador' | 'cacador' | 'resistencia_panda' | 'relampago' | 'efeito_borboleta' | 'contagem_corpos' | 'encantado' | 'lobo_solitario' | 'briga' | 'garras' | 'devorar' | 'arremesso_selvagem' | 'implacavel' | 'acrobata';

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
  /** Herói extra (fora da caixa básica). */
  extra?: boolean;
  /** Herói da expansão Beyond the Grave. */
  btg?: boolean;
  /** Força do Herói (0-10, ref/wiki/rating-heroes.csv). */
  rating?: number;
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
  /** Carta de Melhoria debaixo de uma Maldição que ocupa espaço (p.24): indisponível até a Maldição sair (Poção de Cura). */
  covered?: CardInst;
  /** Herói exaustado por uma carta (Escudos, Escudo das Almas): não pode ser ativado até a Guilda Descansar. */
  spent?: boolean;
  /** Olhar Petrificante (Elysia): marcadores que tiram 1 Ponto de Movimento cada (Descansar remove). */
  petrified?: number;
  /** Banido: está no Tabuleiro de Entrada (fora do tabuleiro, mas vivo, com Ferimentos e marcadores). */
  banished?: boolean;
}

export interface Door { id: string; a: Cell; b: Cell; open: boolean; small?: boolean; locked?: boolean }

export interface Activation {
  heroId: string;
  mp: number;
  moved: boolean;
  moveLocked: boolean;
  attacked: boolean;
  /** Cartas ativáveis já usadas nesta ativação. */
  used?: string[];
  /** Botas usadas aos poucos nesta ativação: passos que ainda sobram (por carta). */
  bootLeft?: Record<string, number>;
  /** Algo já aconteceu nesta ativação (ex.: as Botas moveram um Aliado): não dá mais para trocar de Herói nem Descansar. */
  committed?: boolean;
  /** Ativação só para o Movimento (Mente Brilhante): não pode atacar. */
  moveOnly?: boolean;
  /** Habilidade de "uma vez por ativação" já usada (Relâmpago). */
  powerUsed?: boolean;
  /** Fúria dos Mortos (Lápide): dados a mais no próximo ataque. */
  bonusDice?: number;
}

export interface MissionDef {
  id: string;
  name: string;
  kind: 'pve' | 'pvp';
  text: string;
  targetGuild?: GuildId;
  maxCompletions?: number;
  /** Como a Missão é cumprida. */
  rule?: 'collect_any' | 'collect_own' | 'kill_count' | 'kill_type' | 'carry' | 'step_on' | 'escort' | 'arena' | 'summon'
    /** Beyond the Grave: estar na Área Inicial de outra Guilda sem Inimigos nela; destruir um objeto (Reservas de Comida). */
    | 'enemy_start' | 'destroy';
  /** escort: só a Guilda da cor do marcador pode pegá-lo (e matar quem carrega não rouba). */
  ownOnly?: boolean;
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
  /** Turno adicional (Poção): o Herói que usou a poção — ele NÃO joga o turno adicional; joga outro Herói. */
  extraHero?: string | null;
  /** Estamos num turno adicional (não dá para Descansar). */
  extraTurnOn?: boolean;
  floor: Record<string, Token[]>;
  entryBoard: string[];
  entryMarkers: EntryMarker[];
  missions: MissionDef[];
  missionDone: Record<string, GuildId[]>;
  /** Quem cumpriu cada Missão: o Herói e, nas de matar, o Herói morto (ids de personagem). */
  missionBy?: Record<string, Partial<Record<GuildId, { hero?: string; victim?: string }>>>;
  rewardDeck: string[];
  /** Baralho de Maldições Mortais da partida (Confronto Final: Maldição a cada morte). */
  curseDeck?: string[];
  missionsToWin: number;
  winner: GuildId | null;
  turn: number;
  pending?: PendingVengeance | null;
  /** Cartas sem Herói da Guilda (Recompensa recebida com o inventário cheio): equipadas no próximo Descanso. */
  spare?: Partial<Record<GuildId, CardInst[]>>;
  /** Lápide "ativar um Monstro" esperando o jogador (humano): escolhe o Monstro e o move/ataca como um Herói. */
  puppet?: { by: string; guild: GuildId; cat: string; source: string; monsterId: string | null } | null;
  /** Tempo de jogo da partida (ms). */
  elapsed?: number;
  /** Nível dos Monstros desta partida. */
  level?: string;
  /** Títulos de campanha por Guilda. */
  titles?: Partial<Record<GuildId, string[]>>;
  /** Campos de minas das Bombas. */
  /** card: a carta que criou o campo de minas (a arte aparece no chão). */
  mines?: { cell: Cell; guild: GuildId; dice: number; card?: string }[];
  /** Heróis já ativados neste turno (para a Bênção de Hobsbawm). */
  activatedThisTurn?: string[];
  /** Último Herói ativado de cada Guilda (a câmera volta nele quando a vez é sua). */
  lastHero?: Partial<Record<GuildId, string>>;
  /** Bênção de Hobsbawm disponível: pode ativar outro Aliado em Linha de Visão. */
  blessing?: { heroId: string } | null;
  /** Guilda que já cumpriu as Missões para vencer: a partida termina quando este turno acabar. */
  winnerPending?: GuildId | null;
  /** Limite de dados: no máximo 8 dados de ataque e 6 de defesa por rolagem (críticos e rerrolagens inclusos). Sem isso (padrão), ilimitado. */
  diceCap?: boolean;
  /** Posicionamento inicial: Guildas que ainda estão escolhendo onde seus Heróis começam. */
  deploying?: GuildId[] | null;
  /** Arena do Sol Brilhante: marcadores de Guilda colocados nos marcadores de Missão (chaves dos Espaços). */
  arena?: Partial<Record<GuildId, string[]>>;
  /** Esconderijo do Troll já saqueado. */
  hideoutTaken?: boolean;
  /** Grito de Guerra: a Guilda pode ativar outro Herói neste turno. */
  warCry?: GuildId | null;
  /** O Herói ativo morreu com Grito de Guerra / Bênção ainda valendo: a próxima ativação do turno é a extra. */
  extraOnly?: boolean;
  /** Cartas ativáveis já usadas neste turno (Manto do Deslocamento). */
  turnUsed?: string[];
  /** Heróis Inimigos mortos por cada Herói neste cenário (Contagem de Corpos). */
  heroKills?: Record<string, number>;
  /** Mente Brilhante: a Guilda pode ativar outro Herói só para o Movimento. */
  brightMind?: GuildId | null;
  /** Macaco Vê, Macaco Faz: Habilidade copiada até o fim do turno. */
  copied?: { heroId: string; ability: HeroAbility } | null;
  /** Garras de Gatinho: Inimigos que já sofreram o Ferimento neste turno. */
  clawed?: string[];
  /** Doces ou Travessuras: já usada neste turno. */
  beggarUsed?: boolean;
  /** Cartas de Lápide viradas no tabuleiro (Beyond the Grave). */
  tombs?: { id: string; cell: Cell; card: string }[];
  /** Mortalha: Heróis com +2 dados de Defesa até o próximo turno da Guilda deles. */
  shroud?: string[];
  debug: { attackDice: DiceMode; defenseDice: DiceMode; revealTokens: boolean; heroesImmortal: boolean; freeMode?: boolean };
}

export type GameEvent =
  /** push: empurrado pela Rajada de Vento. */
  | { t: 'move'; id: string; from: Cell; to: Cell; portal?: boolean; push?: boolean }
  | { t: 'door'; doorId: string; open: boolean; by: string }
  | {
      t: 'attack';
      attackerId: string;
      reason: 'heroi' | 'alerta' | 'vinganca' | 'armadilha' | 'lapide';
      cardName: string;
      attackType: AttackType;
      /** Dados de ataque da carta (com bônus), antes dos dados extras de ✷. */
      baseDice?: number;
      dice: DieFace[];
      hits: number;
      crits: number;
      targets: { id: string; defense: DieFace[]; blocks: number; wounds: number; stunnedNoDefense: boolean; rr?: RerollInfo }[];
      notes: string[];
      /** Rerrolagem do ataque: faces antes e quais dados foram rolados de novo. */
      rr?: RerollInfo;
      /** Fender: o ataque atingiu Inimigos adicionais Perto do Herói. */
      cleave?: boolean;
      /** Dano espalhado (Raio Nova, Fender): mesmos dados do ataque anterior, só a Defesa do alvo adicional. */
      spread?: boolean;
      /** Som da habilidade (ex.: 'hobsbawn', 'bow-critico'). */
      sfx?: string;
      /** Arremesso de Lâmina (Jøhan): a Espada é arremessada a Distância. */
      thrown?: boolean;
      /** Ataque de Monstro: a Guilda que controla os Monstros (rola os dados dele). */
      ctl?: GuildId;
      /** Só a rolagem: a animação no mapa vem depois, num evento 'strike' (dano espalhado escolhido antes). */
      noAnim?: boolean;
    }
  /** Animação do golpe no mapa (investida, giro do Fender ou projétil) contra todos os alvos de uma vez. */
  | { t: 'strike'; attackerId: string; cardName: string; attackType: AttackType; targets: { id: string }[]; cleave?: boolean; thrown?: boolean; sfx?: string }
  | { t: 'damage'; id: string; amount: number; wounds: number; maxHp: number }
  | { t: 'heal'; id: string; amount: number; wounds: number }
  | { t: 'death'; id: string; exterminated?: boolean; /** foi para o Tabuleiro de Entrada (Banimento) */ banish?: boolean }
  | { t: 'stun'; id: string; on: boolean }
  /** hidden: o marcador estava virado para baixo (é revelado ao pegar). */
  | { t: 'pickup'; heroId: string; token: Token; hidden?: boolean }
  /** Herói usou um marcador (poção). */
  | { t: 'useToken'; heroId: string; token: Token }
  /** Guilda cumpriu as Missões para vencer (a partida acaba no fim do turno). */
  | { t: 'victory'; guild: GuildId }
  /** Título de campanha conquistado. */
  | { t: 'title'; guild: GuildId; title: string; name: string }
  /** Carta de Recompensa recebida (mostrada para todos). */
  /** Confronto Final: o Herói que morreu comprou uma Maldição; `kept` é a que ficou com ele. */
  | { t: 'curseDraw'; heroId: string; card: string; old?: string; kept: string }
  | { t: 'reward'; heroId: string; cardId: string; /** ficou com as cartas sem Herói (inventário cheio) */ spare?: boolean }
  /** Habilidade Natural ativada (Furtividade do Vapor, Vingança do Espetado…). */
  | { t: 'skill'; id: string; skill: string; name: string }
  /** Aviso na tela de todos (ex.: a Lápide não tem Monstro para ativar). */
  | { t: 'notice'; text: string; color?: string }
  /** Lápide revelada (Beyond the Grave): o texto aparece na tela de todos. */
  | { t: 'tomb'; heroId: string; name: string; text: string; good: boolean }
  | { t: 'drop'; cell: Cell; tokens: Token[] }
  | { t: 'spawn'; id: string; cell: Cell }
  | { t: 'cemetery'; id: string; count: number; full: boolean }
  | { t: 'spawnStart'; ids: string[] }
  /** target: a Entrada de Monstro que os dados indicaram (mesmo ocupada, para a câmera mostrar). */
  | { t: 'spawnRoll'; id: string; faces: DieFace[]; cell: Cell | null; reason: string; target?: Cell }
  | { t: 'respawn'; id: string; cell: Cell }
  | { t: 'coins'; guild: GuildId; amount: number; reason: string }
  | { t: 'mission'; guild: GuildId; missionId: string; name: string; first: boolean; how?: string }
  | { t: 'reaction'; monsterId: string; kind: 'alerta' | 'vinganca' }
  | { t: 'turn'; guild: GuildId; turn: number }
  | { t: 'rest'; guild: GuildId }
  | { t: 'card'; heroId: string; cardName: string }
  | { t: 'gameover'; winner: GuildId; summary: { guild: GuildId; coins: number; missions: number }[] }
  | { t: 'log'; text: string };
