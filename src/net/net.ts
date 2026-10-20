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
}

export interface Lobby {
  code: string; seats: Seat[]; started: boolean; mapId?: string;
  /** Preparação (recrutamento, votação, equipamento). Cada jogador recebe a sua versão, com as cartas dos outros escondidas. */
  setup?: OnlineSetup;
}

/** Jogadas da preparação. */
export type SetupMsg = { t: 'draft'; hero: string } | { t: 'vote'; map: string } | { t: 'equip'; inv: Record<string, string[]> };

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
  | { t: 'view'; guild?: GuildId; c: [number, number, number]; m: [number, number] | null; sel?: string | null };

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
    this.lobby = { code: '', started: false, mapId: loadMapId(), seats: [{ clientId: this.me, name, heroes, guild: 'azul', ai: false, connected: true, host: true }] };
    this.open();
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
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('connection', conn => this.accept(conn));
  }

  private accept(conn: DataConnection) {
    let cid: string | null = null;
    conn.on('data', raw => {
      const m = raw as Msg;
      if (m.t === 'hello') {
        cid = m.clientId;
        let seat = this.lobby.seats.find(s => s.clientId === m.clientId);
        if (!seat) {
          if (this.lobby.started || this.lobby.setup) { conn.send({ t: 'kicked', reason: 'A partida já começou.' } satisfies Msg); setTimeout(() => conn.close(), 300); return; }
          const free = GUILD_SEATS.find(g => !this.lobby.seats.some(s => s.guild === g));
          if (!free) { conn.send({ t: 'kicked', reason: 'A sala está cheia (4 jogadores).' } satisfies Msg); setTimeout(() => conn.close(), 300); return; }
          seat = { clientId: m.clientId, name: m.name || 'Jogador', heroes: m.heroes, guild: free, ai: false, connected: true };
          this.lobby.seats.push(seat);
          this.chatAll('Sistema', `${seat.name} entrou na sala.`);
        } else {
          seat.connected = true;
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
      } else if ((m.t === 'draft' || m.t === 'vote' || m.t === 'equip') && this.lobby.setup && !this.lobby.started) {
        this.onSetupMsg(seat.guild, m);
      } else if (m.t === 'action') {
        const why = this.onRemoteAction(seat.guild, m.action);
        if (why) conn.send({ t: 'reject', reason: why } satisfies Msg);
      } else if (m.t === 'chat') {
        this.chatAll(seat.name, m.text.slice(0, 200), colorOf(seat.guild));
      } else if (m.t === 'view' && this.lobby.started) {
        const out: Msg = { t: 'view', guild: seat.guild, c: m.c, m: m.m, sel: m.sel };
        for (const [id, c] of this.conns) if (id !== cid && c.open) c.send(out);
        this.ev.view?.(seat.guild, m.c, m.m, m.sel);
      }
    });
    conn.on('close', () => {
      if (!cid || this.conns.get(cid) !== conn) return;
      this.conns.delete(cid);
      const seat = this.lobby.seats.find(s => s.clientId === cid);
      if (!seat) return;
      if (!this.lobby.started && !this.lobby.setup) this.lobby.seats = this.lobby.seats.filter(s => s !== seat);
      else seat.connected = false;
      this.chatAll('Sistema', `${seat.name} desconectou.`);
      this.pushLobby();
      this.onSeatsChanged();
    });
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

  close() { try { this.broadcast({ t: 'kicked', reason: 'O anfitrião encerrou a sala.' }); } catch { /* */ } setTimeout(() => this.peer?.destroy(), 300); }
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
    this.peer = new Peer({ config: iceConfig(), debug: 1 });
    this.peer.on('open', () => this.connect());
    this.peer.on('error', err => {
      const type = (err as { type?: string }).type;
      if (type === 'peer-unavailable') this.ev.status('Sala não encontrada. Confira o código (o anfitrião precisa estar com o jogo aberto).', 'error');
      else this.ev.status(`Erro de conexão (${type ?? err.message}).`, 'error');
    });
    this.peer.on('disconnected', () => { if (!this.closed && !this.peer.destroyed) this.peer.reconnect(); });
  }

  private connect() {
    if (this.closed) return;
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
    this.conn = conn;
    conn.on('open', () => {
      this.retries = 0;
      this.ev.status('Conectado à sala!', 'ok');
      conn.send({ t: 'hello', clientId: this.me, name: this.name, heroes: this.heroes } satisfies Msg);
    });
    conn.on('data', raw => {
      const m = raw as Msg;
      switch (m.t) {
        case 'lobby': this.lobby = m.lobby; this.ev.lobby(m.lobby); break;
        case 'start': this.lobby = m.lobby; this.ev.start(m.state, m.lobby); break;
        case 'update': this.ev.update(m.events, m.state); break;
        case 'reject': this.ev.reject(m.reason); break;
        case 'chat': this.ev.chat(m.from, m.text, m.color); break;
        case 'view': if (m.guild) this.ev.view?.(m.guild, m.c, m.m, m.sel); break;
        case 'kicked': this.closed = true; this.ev.status(m.reason, 'error'); this.peer.destroy(); break;
      }
    });
    conn.on('close', () => {
      if (this.closed) return;
      this.ev.status('Conexão perdida — tentando reconectar…', 'warn');
      if (this.retries++ < 20) setTimeout(() => this.connect(), 2500);
      else this.ev.status('Não foi possível reconectar.', 'error');
    });
  }

  private send(m: Msg) { if (this.conn?.open) this.conn.send(m); }
  sendAction(a: Action) { this.send({ t: 'action', action: a }); }
  sendSetup(m: SetupMsg) { this.send(m); }
  sendView(c: [number, number, number], m: [number, number] | null, sel?: string | null) { this.send({ t: 'view', c, m, sel }); }
  setMine(p: { heroes?: string[]; name?: string; guild?: GuildId; team?: string }) {
    if (p.heroes) this.heroes = p.heroes;
    if (p.name) this.name = p.name;
    this.send({ t: 'pick', ...p });
  }
  chat(text: string) { this.send({ t: 'chat', from: this.name, text }); }
  close() { this.closed = true; this.peer.destroy(); }
}

export type Session = HostSession | ClientSession;

function colorOf(g: GuildId) {
  return ({ azul: '#8fc3ff', vermelho: '#ff9d8c', verde: '#9be3a4', laranja: '#ffcb85' } as Record<GuildId, string>)[g];
}
