import Peer, { type DataConnection } from 'peerjs';
import type { Action } from '../engine/actions';
import type { GameEvent, GameState, GuildId } from '../engine/types';
import { loadMapId } from '../engine/maps';
import { type OnlineSetup, redact } from './onlineSetup';

// Modo online peer-to-peer: o navegador de quem cria a sala é o "servidor" (anfitrião).
// Ele roda o motor de regras, valida as jogadas e envia eventos + estado para todos.
// Os outros jogadores só enviam jogadas (Action). Sinalização: servidor público gratuito do PeerJS.

export const GUILD_SEATS: GuildId[] = ['azul', 'vermelho', 'verde', 'laranja'];
const PREFIX = 'cbt-sala-';

export interface Seat {
  clientId: string;
  name: string;
  heroes: string[];
  guild: GuildId;
  ai: boolean; // vaga controlada pela IA
  /** Nome do time escolhido pelo jogador (opcional). */
  team?: string;
  connected: boolean;
  host?: boolean;
  /** A IA assumiu porque o jogador caiu: quando ele voltar, a vaga volta para ele. */
  autoAI?: boolean;
  /** Quando caiu (ms) — a IA só assume depois de um tempo, para dar chance de reconectar. */
  lostAt?: number;
}

export interface Lobby {
  code: string; seats: Seat[]; started: boolean; mapId?: string;
  /** Preparação (recrutamento, votação, equipamento). Cada jogador recebe a sua versão, com as cartas dos outros escondidas. */
  setup?: OnlineSetup;
  /** Campanha online em andamento (6 cenários). */
  campaign?: boolean;
  /** Mostrar a roleta de quem começa (partida avulsa ou 1º cenário da campanha). */
  roulette?: boolean;
  /** Número do cenário (para a roleta não repetir ao reconectar). */
  scenario?: number;
}

/** Jogadas da preparação. */
export type SetupMsg = { t: 'ban'; ids: string[] } | { t: 'draft'; hero: string } | { t: 'vote'; map: string } | { t: 'equip'; inv: Record<string, string[]> }
  | { t: 'upPick'; ids: string[] } | { t: 'upBuy'; ids: string[] } | { t: 'upArr'; inv: Record<string, string[]> } | { t: 'pickmap'; map: string } | { t: 'curseFlip' } | { t: 'upOk' };
const SETUP_MSGS = ['ban', 'draft', 'vote', 'equip', 'upPick', 'upBuy', 'upArr', 'pickmap', 'curseFlip', 'upOk'];

export type Msg =
  | { t: 'hello'; clientId: string; name: string; heroes: string[] }
  | { t: 'pick'; heroes?: string[]; name?: string; guild?: GuildId; team?: string }
  | { t: 'lobby'; lobby: Lobby }
  | { t: 'start'; state: GameState; lobby: Lobby }
  | { t: 'action'; action: Action }
  | { t: 'update'; events: GameEvent[]; state: GameState }
  | { t: 'reject'; reason: string }
  | { t: 'chat'; from: string; text: string; color?: string }
  | { t: 'kicked'; reason: string }
  | SetupMsg
  | { t: 'view'; guild?: GuildId; c: [number, number, number]; m: [number, number] | null; sel?: string | null }
  /** Marcação no tabuleiro (Ctrl + clique): todos veem a seta na cor de quem marcou. */
  | { t: 'ping'; guild?: GuildId; cell: { c: number; r: number } }
  /** Batimento: mostra que a conexão continua viva (anfitrião <-> jogadores). */
  | { t: 'hb' }
  /** Votação para voltar o turno: jogador -> anfitrião (abrir ou votar). */
  | { t: 'undoVote'; open?: boolean; yes?: boolean }
  /** Votação para voltar o turno: anfitrião -> todos (situação atual; null = encerrada). */
  | { t: 'undoPoll'; poll: UndoPoll | null; result?: string };

/** Votação "voltar o turno" (online): passa com a maioria dos jogadores (sim > metade). */
export interface UndoPoll { by: string; voters: { id: string; name: string }[]; yes: string[]; no: string[]; ends: number }
const POLL_MS = 30000;

/** A cada quantos ms o anfitrião manda o batimento; sem notícia por DEAD_MS, a conexão é dada como morta e refeita. */
const HB_MS = 4000;
const DEAD_MS = 16000;

export function clientId(): string {
  try {
    let id = localStorage.getItem('cbt.clientId');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('cbt.clientId', id); }
    return id;
  } catch { return Math.random().toString(36).slice(2); }
}

export function savedName(): string {
  try { return localStorage.getItem('cbt.name') || ''; } catch { return ''; }
}
export function saveName(n: string) { try { localStorage.setItem('cbt.name', n); } catch { /* ignora */ } }

function iceConfig(): RTCConfiguration {
  const servers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  // TURN opcional (redes que bloqueiam conexão direta). Configure no Vercel: VITE_TURN_URLS, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL
  const env = import.meta.env;
  if (env.VITE_TURN_URLS) servers.push({ urls: String(env.VITE_TURN_URLS).split(','), username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  return { iceServers: servers };
}

function newCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export interface SessionEvents {
  status(text: string, kind?: 'ok' | 'warn' | 'error'): void;
  lobby(l: Lobby): void;
  start(state: GameState, lobby: Lobby): void;
  update(events: GameEvent[], state: GameState): void;
  reject(reason: string): void;
  chat(from: string, text: string, color?: string): void;
  /** Câmera (centro x, y e zoom) e mouse (mundo) do jogador da vez. */
  view?(guild: GuildId, c: [number, number, number], m: [number, number] | null, sel?: string | null): void;
  /** Alguém marcou um Espaço (Ctrl + clique). */
  ping?(guild: GuildId, cell: { c: number; r: number }): void;
  /** Votação para voltar o turno mudou (null = encerrada; `result` = como terminou). */
  undoPoll?(poll: UndoPoll | null, result?: string): void;
}

// ---------------------------------------------------------------------------
// Tela acesa durante o online: o celular não dorme (e não derruba a conexão) enquanto há sala aberta.
// ---------------------------------------------------------------------------
type WakeSentinel = { release(): Promise<void> };
let wakeUsers = 0;
let wakeLock: WakeSentinel | null = null;
async function grabWake() {
  if (!wakeUsers || document.hidden || wakeLock) return;
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeSentinel & { addEventListener(e: string, f: () => void): void }> } };
    const w = await nav.wakeLock?.request('screen');
    if (!w) return;
    wakeLock = w;
    w.addEventListener('release', () => { wakeLock = null; });
  } catch { /* sem suporte ou recusado */ }
}
document.addEventListener('visibilitychange', () => { void grabWake(); });
function keepAwake(on: boolean) {
  wakeUsers = Math.max(0, wakeUsers + (on ? 1 : -1));
  if (wakeUsers) void grabWake();
  else if (wakeLock) { void wakeLock.release(); wakeLock = null; }
}

// ---------------------------------------------------------------------------
// ANFITRIÃO
// ---------------------------------------------------------------------------
export class HostSession {
  readonly isHost = true;
  peer!: Peer;
  lobby: Lobby;
  readonly me: string = clientId();
  private conns = new Map<string, DataConnection>(); // clientId -> conexão
  ev: SessionEvents;
  /** Chamado quando um jogador remoto envia uma jogada. Retorna motivo da recusa ou null. */
  onRemoteAction: (guild: GuildId, a: Action) => string | null = () => 'sem partida';
  /** Estado atual da partida (para quem reconectar). */
  getState: () => GameState | null = () => null;
  onSeatsChanged: () => void = () => {};
  /** Jogada da preparação vinda de um jogador remoto (ou do próprio anfitrião). */
  onSetupMsg: (guild: GuildId, m: SetupMsg) => void = () => {};

  constructor(name: string, heroes: string[], ev: SessionEvents) {
    this.ev = ev;
    this.lobby = { code: '', started: false, mapId: loadMapId(), seats: [{ clientId: this.me, name, team: name.trim().slice(0, 20) || undefined, heroes, guild: 'azul', ai: false, connected: true, host: true }] };
    this.open();
    keepAwake(true);
  }

  private open(tries = 0) {
    const code = newCode();
    this.ev.status('Criando sala…');
    const peer = new Peer(PREFIX + code, { config: iceConfig(), debug: 1 });
    this.peer = peer;
    peer.on('open', () => {
      this.lobby.code = code;
      this.ev.status('Sala criada! Envie o código para seus amigos.', 'ok');
      this.ev.lobby(this.lobby);
    });
    peer.on('error', err => {
      const type = (err as { type?: string }).type;
      if (type === 'unavailable-id' && tries < 5) { peer.destroy(); this.open(tries + 1); return; }
      this.ev.status(`Erro de conexão (${type ?? err.message}).`, 'error');
    });
    // perdeu o servidor de sinalização (ex.: rede trocou): tenta de novo até voltar, senão ninguém consegue reconectar
    peer.on('disconnected', () => this.resignal(peer));
    peer.on('connection', conn => this.accept(conn));
    clearInterval(this.hbTimer);
    this.hbTimer = window.setInterval(() => this.heartbeat(), HB_MS);
  }

  private hbTimer = 0;
  /** Última mensagem recebida de cada jogador. */
  private seen = new Map<string, number>();
  private heartbeat() {
    const now = Date.now();
    for (const [id, c] of [...this.conns]) {
      if (c.open) { try { c.send({ t: 'hb' } satisfies Msg); } catch { /* fecha abaixo */ } }
      // jogador mudo há muito tempo (celular dormiu, rede caiu sem avisar): fecha para ele poder voltar limpo
      if (now - (this.seen.get(id) ?? now) > DEAD_MS || !c.open) { this.seen.delete(id); try { c.close(); } catch { /* */ } this.dropped(id, c); }
    }
    if (this.peer.disconnected && !this.peer.destroyed) this.resignal(this.peer);
  }
  private resignal(peer: Peer) {
    if (peer.destroyed || !peer.disconnected) return;
    try { peer.reconnect(); } catch { /* tenta no próximo batimento */ }
  }

  private accept(conn: DataConnection) {
    let cid: string | null = null;
    conn.on('data', raw => {
      const m = raw as Msg;
      if (cid) this.seen.set(cid, Date.now());
      if (m.t === 'hb') return;
      if (m.t === 'hello') {
        this.seen.set(m.clientId, Date.now());
        cid = m.clientId;
        let seat = this.lobby.seats.find(s => s.clientId === m.clientId);
        if (!seat) {
          if (this.lobby.started || this.lobby.setup) { conn.send({ t: 'kicked', reason: 'A partida já começou.' } satisfies Msg); setTimeout(() => conn.close(), 300); return; }
          const free = GUILD_SEATS.find(g => !this.lobby.seats.some(s => s.guild === g));
          if (!free) { conn.send({ t: 'kicked', reason: 'A sala está cheia (4 jogadores).' } satisfies Msg); setTimeout(() => conn.close(), 300); return; }
          seat = { clientId: m.clientId, name: m.name || 'Jogador', team: (m.name || 'Jogador').trim().slice(0, 20), heroes: m.heroes, guild: free, ai: false, connected: true };
          this.lobby.seats.push(seat);
          this.chatAll('Sistema', `${seat.name} entrou na sala.`);
        } else {
          seat.connected = true;
          seat.lostAt = undefined;
          // a IA tinha assumido só porque ele caiu: devolve a vaga
          if (seat.autoAI) { seat.ai = false; seat.autoAI = false; }
          this.chatAll('Sistema', `${seat.name} ${this.lobby.started ? 'voltou para a partida' : 'reconectou'}.`);
        }
        const old = this.conns.get(m.clientId);
        this.conns.set(m.clientId, conn);
        if (old && old !== conn) old.close();
        this.pushLobby();
        const st = this.getState();
        if (this.lobby.started && st) conn.send({ t: 'start', state: st, lobby: this.lobby } satisfies Msg);
        this.onSeatsChanged();
        return;
      }
      if (!cid) return;
      const seat = this.lobby.seats.find(s => s.clientId === cid);
      if (!seat) return;
      if (m.t === 'pick' && !this.lobby.started) {
        if (m.heroes) seat.heroes = m.heroes;
        if (m.name) seat.name = m.name;
        if (m.guild && !this.lobby.seats.some(s => s.guild === m.guild)) seat.guild = m.guild;
        if (m.team !== undefined) seat.team = m.team.trim().slice(0, 20) || undefined;
        this.pushLobby();
      } else if (SETUP_MSGS.includes(m.t) && this.lobby.setup && !this.lobby.started) {
        this.onSetupMsg(seat.guild, m as SetupMsg);
      } else if (m.t === 'action') {
        const why = this.onRemoteAction(seat.guild, m.action);
        if (why) conn.send({ t: 'reject', reason: why } satisfies Msg);
      } else if (m.t === 'chat') {
        this.chatAll(seat.name, m.text.slice(0, 200), colorOf(seat.guild));
      } else if (m.t === 'undoVote' && this.lobby.started) {
        if (m.open) this.openUndoVote(cid); else this.castUndo(cid, !!m.yes);
      } else if (m.t === 'ping' && this.lobby.started) {
        const out: Msg = { t: 'ping', guild: seat.guild, cell: m.cell };
        for (const [id, c] of this.conns) if (id !== cid && c.open) c.send(out);
        this.ev.ping?.(seat.guild, m.cell);
      } else if (m.t === 'view' && this.lobby.started) {
        const out: Msg = { t: 'view', guild: seat.guild, c: m.c, m: m.m, sel: m.sel };
        for (const [id, c] of this.conns) if (id !== cid && c.open) c.send(out);
        this.ev.view?.(seat.guild, m.c, m.m, m.sel);
      }
    });
    conn.on('close', () => { if (cid) this.dropped(cid, conn); });
    conn.on('error', () => { if (cid) this.dropped(cid, conn); });
  }

  /** A conexão de um jogador caiu: a vaga fica esperando ele voltar (na partida ou na mesa). */
  private dropped(cid: string, conn: DataConnection) {
    if (this.conns.get(cid) !== conn) return;
    this.conns.delete(cid);
    const seat = this.lobby.seats.find(s => s.clientId === cid);
    if (!seat) return;
    if (!this.lobby.started && !this.lobby.setup) this.lobby.seats = this.lobby.seats.filter(s => s !== seat);
    else { seat.connected = false; seat.lostAt = Date.now(); }
    this.chatAll('Sistema', `${seat.name} desconectou — esperando voltar…`);
    this.pushLobby();
    this.onSeatsChanged();
  }

  send(to: string, m: Msg) { const c = this.conns.get(to); if (c?.open) c.send(m); }
  broadcast(m: Msg) { for (const c of this.conns.values()) if (c.open) c.send(m); }
  /** Sala para um jogador: na preparação, as cartas e escolhas dos outros vão escondidas. */
  lobbyFor(guild: GuildId | null): Lobby {
    return this.lobby.setup ? { ...this.lobby, setup: redact(this.lobby.setup, guild) } : this.lobby;
  }
  pushLobby() {
    for (const [cid, c] of this.conns) {
      if (!c.open) continue;
      const seat = this.lobby.seats.find(s => s.clientId === cid);
      c.send({ t: 'lobby', lobby: this.lobbyFor(seat?.guild ?? null) } satisfies Msg);
    }
    this.ev.lobby(this.lobbyFor(this.lobby.seats[0].guild));
  }

  // ---------------------------------------------------------------- votação para voltar o turno
  private poll: UndoPoll | null = null;
  private pollTimer = 0;
  /** O anfitrião faz a volta quando a votação passa (o controlador liga isto). Retorna false se não há turno para voltar. */
  onUndoPassed: () => boolean = () => false;
  /** Jogadores que votam: as vagas humanas conectadas (a IA não vota). */
  private voters() { return this.lobby.seats.filter(s => !s.ai && (s.connected || s.clientId === this.me)).map(s => ({ id: s.clientId, name: s.name })); }
  private pushPoll(result?: string) {
    this.broadcast({ t: 'undoPoll', poll: this.poll, result });
    this.ev.undoPoll?.(this.poll, result);
  }
  /** Abre a votação (quem abre já vota sim). */
  openUndoVote(cid: string) {
    if (this.poll) return;
    const voters = this.voters();
    const who = voters.find(v => v.id === cid);
    if (!who) return;
    this.poll = { by: who.name, voters, yes: [cid], no: [], ends: Date.now() + POLL_MS };
    this.chatAll('Sistema', `🗳️ ${who.name} abriu uma votação para voltar o turno.`);
    clearTimeout(this.pollTimer);
    this.pollTimer = window.setTimeout(() => this.closePoll(false, 'tempo esgotado'), POLL_MS);
    this.checkPoll();
  }
  castUndo(cid: string, yes: boolean) {
    const p = this.poll;
    if (!p || !p.voters.some(v => v.id === cid)) return;
    p.yes = p.yes.filter(x => x !== cid); p.no = p.no.filter(x => x !== cid);
    (yes ? p.yes : p.no).push(cid);
    this.checkPoll();
  }
  private checkPoll() {
    const p = this.poll!;
    const n = p.voters.length;
    if (p.yes.length * 2 > n) return this.closePoll(true);
    if (p.no.length * 2 >= n || p.yes.length + p.no.length >= n) return this.closePoll(false, 'a maioria não aprovou');
    this.pushPoll();
  }
  private closePoll(ok: boolean, why = '') {
    if (!this.poll) return;
    clearTimeout(this.pollTimer);
    const p = this.poll;
    this.poll = null;
    const done = ok && this.onUndoPassed();
    const result = done ? `✅ Votação aprovada (${p.yes.length}/${p.voters.length}): o turno voltou ao começo.`
      : ok ? '⚠️ Votação aprovada, mas não há turno para voltar.' : `❌ Votação recusada (${why}). A partida continua.`;
    this.chatAll('Sistema', result);
    this.pushPoll(result);
  }

  chatAll(from: string, text: string, color?: string) {
    this.broadcast({ t: 'chat', from, text, color });
    this.ev.chat(from, text, color);
  }
  chat(text: string) { this.chatAll(this.lobby.seats[0].name, text.slice(0, 200), colorOf(this.lobby.seats[0].guild)); }

  setMine(p: { heroes?: string[]; name?: string; guild?: GuildId; team?: string }) {
    const me = this.lobby.seats[0];
    if (p.team !== undefined) me.team = p.team.trim().slice(0, 20) || undefined;
    if (p.heroes) me.heroes = p.heroes;
    if (p.name) me.name = p.name;
    if (p.guild && !this.lobby.seats.some(s => s.guild === p.guild)) me.guild = p.guild;
    this.pushLobby();
  }

  setMap(id: string) {
    if (this.lobby.started) return;
    this.lobby.mapId = id;
    this.pushLobby();
  }

  addAI() {
    const free = GUILD_SEATS.find(g => !this.lobby.seats.some(s => s.guild === g));
    if (!free || this.lobby.started) return;
    this.lobby.seats.push({ clientId: `ia-${free}`, name: 'IA', heroes: [], guild: free, ai: true, connected: true });
    this.pushLobby();
  }

  removeSeat(clientId: string) {
    if (this.lobby.started || clientId === this.me) return;
    const c = this.conns.get(clientId);
    if (c) { c.send({ t: 'kicked', reason: 'Você foi removido da sala.' } satisfies Msg); setTimeout(() => c.close(), 300); this.conns.delete(clientId); }
    this.lobby.seats = this.lobby.seats.filter(s => s.clientId !== clientId);
    this.pushLobby();
  }

  /** Passa a vaga para a IA (ou devolve ao jogador). */
  setSeatAI(guild: GuildId, ai: boolean) {
    const s = this.lobby.seats.find(x => x.guild === guild);
    if (!s) return;
    s.ai = ai;
    this.pushLobby();
  }

  startGame(state: GameState) {
    this.lobby.started = true;
    this.broadcast({ t: 'start', state, lobby: this.lobby });
    this.ev.lobby(this.lobby);
  }

  update(events: GameEvent[], state: GameState) {
    this.broadcast({ t: 'update', events, state });
  }

  sendView(c: [number, number, number], m: [number, number] | null, sel?: string | null) {
    this.broadcast({ t: 'view', guild: this.lobby.seats[0].guild, c, m, sel });
  }
  sendPing(cell: { c: number; r: number }) { this.broadcast({ t: 'ping', guild: this.lobby.seats[0].guild, cell }); }

  close() { keepAwake(false); clearInterval(this.hbTimer); try { this.broadcast({ t: 'kicked', reason: 'O anfitrião encerrou a sala.' }); } catch { /* */ } setTimeout(() => this.peer?.destroy(), 300); }
}

// ---------------------------------------------------------------------------
// CLIENTE
// ---------------------------------------------------------------------------
export class ClientSession {
  readonly isHost = false;
  peer: Peer;
  conn: DataConnection | null = null;
  lobby: Lobby | null = null;
  readonly me: string = clientId();
  ev: SessionEvents;
  private name: string;
  private heroes: string[];
  private code: string;
  private closed = false;
  private retries = 0;

  constructor(code: string, name: string, heroes: string[], ev: SessionEvents) {
    this.ev = ev;
    this.name = name;
    this.heroes = heroes;
    this.code = code.trim().toUpperCase();
    this.ev.status('Conectando…');
    this.peer = this.makePeer();
    keepAwake(true);
    // a tela voltou (celular acordou, aba voltou) ou a rede voltou: reconecta na hora
    this.wake = () => { if (!document.hidden && !this.closed && !this.conn?.open) this.retryNow(); };
    document.addEventListener('visibilitychange', this.wake);
    window.addEventListener('online', this.wake);
    this.watch = window.setInterval(() => this.watchdog(), 3000);
  }

  private wake: () => void;
  private watch = 0;
  private retryTimer = 0;
  private lastMsg = Date.now();
  /** Já esteve na sala (numa reconexão, erro não é o fim: continua tentando). */
  private joined = false;

  private makePeer(): Peer {
    const peer = new Peer({ config: iceConfig(), debug: 1 });
    peer.on('open', () => this.connect());
    peer.on('error', err => {
      const type = (err as { type?: string }).type;
      if (this.joined) { this.ev.status('Conexão instável — tentando voltar…', 'warn'); this.scheduleRetry(); return; }
      if (type === 'peer-unavailable') this.ev.status('Sala não encontrada. Confira o código (o anfitrião precisa estar com o jogo aberto).', 'error');
      else this.ev.status(`Erro de conexão (${type ?? err.message}).`, 'error');
    });
    peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) { try { peer.reconnect(); } catch { /* watchdog */ } } });
    return peer;
  }

  /** Sem notícia do anfitrião há muito tempo: a conexão morreu sem avisar — refaz. */
  private watchdog() {
    if (this.closed || !this.joined) return;
    if (this.conn?.open && Date.now() - this.lastMsg > DEAD_MS) { this.ev.status('Conexão parada — reconectando…', 'warn'); try { this.conn.close(); } catch { /* */ } this.retryNow(); }
    else if (!this.conn?.open) this.scheduleRetry();
  }

  private scheduleRetry() {
    if (this.closed || this.retryTimer) return;
    // tenta sempre (sem desistir), cada vez um pouco mais espaçado, até 10 s
    const wait = Math.min(10000, 1500 + this.retries * 1000);
    this.retries++;
    this.retryTimer = window.setTimeout(() => { this.retryTimer = 0; this.retryNow(); }, wait);
  }

  private retryNow() {
    if (this.closed) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = 0;
    // o Peer perdeu o servidor ou foi destruído: cria outro (o clientId continua o mesmo, então a vaga volta)
    if (this.peer.destroyed) { this.peer = this.makePeer(); return; }
    if (this.peer.disconnected) { try { this.peer.reconnect(); } catch { this.peer.destroy(); this.peer = this.makePeer(); } return; }
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    if (this.conn?.open) return;
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
    this.conn = conn;
    conn.on('open', () => {
      this.retries = 0;
      this.lastMsg = Date.now();
      this.ev.status(this.joined ? 'Reconectado!' : 'Conectado à sala!', 'ok');
      this.joined = true;
      conn.send({ t: 'hello', clientId: this.me, name: this.name, heroes: this.heroes } satisfies Msg);
    });
    conn.on('data', raw => {
      const m = raw as Msg;
      this.lastMsg = Date.now();
      if (m.t === 'hb') { if (conn.open) conn.send({ t: 'hb' } satisfies Msg); return; }
      switch (m.t) {
        case 'lobby': this.lobby = m.lobby; this.ev.lobby(m.lobby); break;
        case 'start': this.lobby = m.lobby; this.ev.start(m.state, m.lobby); break;
        case 'update': this.ev.update(m.events, m.state); break;
        case 'reject': this.ev.reject(m.reason); break;
        case 'chat': this.ev.chat(m.from, m.text, m.color); break;
        case 'view': if (m.guild) this.ev.view?.(m.guild, m.c, m.m, m.sel); break;
        case 'ping': if (m.guild) this.ev.ping?.(m.guild, m.cell); break;
        case 'undoPoll': this.ev.undoPoll?.(m.poll, m.result); break;
        case 'kicked': this.shutdown(); this.ev.status(m.reason, 'error'); break;
      }
    });
    conn.on('close', () => {
      if (this.closed || this.conn !== conn) return;
      this.ev.status('Conexão perdida — tentando reconectar…', 'warn');
      this.scheduleRetry();
    });
    conn.on('error', () => { if (!this.closed && this.conn === conn) this.scheduleRetry(); });
  }

  private send(m: Msg) { if (this.conn?.open) this.conn.send(m); }
  sendAction(a: Action) { this.send({ t: 'action', action: a }); }
  sendSetup(m: SetupMsg) { this.send(m); }
  sendView(c: [number, number, number], m: [number, number] | null, sel?: string | null) { this.send({ t: 'view', c, m, sel }); }
  sendPing(cell: { c: number; r: number }) { this.send({ t: 'ping', cell }); }
  setMine(p: { heroes?: string[]; name?: string; guild?: GuildId; team?: string }) {
    if (p.heroes) this.heroes = p.heroes;
    if (p.name) this.name = p.name;
    this.send({ t: 'pick', ...p });
  }
  chat(text: string) { this.send({ t: 'chat', from: this.name, text }); }
  /** Votação para voltar o turno: abrir (open) ou votar. */
  undoVote(open: boolean, yes = true) { this.send(open ? { t: 'undoVote', open: true } : { t: 'undoVote', yes }); }
  close() { this.shutdown(); }
  private shutdown() {
    if (!this.closed) keepAwake(false);
    this.closed = true;
    clearInterval(this.watch);
    clearTimeout(this.retryTimer);
    document.removeEventListener('visibilitychange', this.wake);
    window.removeEventListener('online', this.wake);
    this.peer.destroy();
  }
}

export type Session = HostSession | ClientSession;

function colorOf(g: GuildId) {
  return ({ azul: '#8fc3ff', vermelho: '#ff9d8c', verde: '#9be3a4', laranja: '#ffcb85' } as Record<GuildId, string>)[g];
}
