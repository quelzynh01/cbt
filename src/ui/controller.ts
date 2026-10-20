import { SimpleAI, type AILevel } from '../ai/ai';
import { actingGuild, applyAction, type Action } from '../engine/actions';
import type { GameState } from '../engine/types';
import type { ClientSession, HostSession, Lobby, Session, SessionEvents } from '../net/net';
import { key, sameCell } from '../engine/board';
import { CARDS, GUILDS, HEROES, MONSTERS } from '../engine/data';
import { type TestConfig, loadTestConfig } from './testConfig';
import { Game } from '../engine/game';
import { getMap } from '../engine/maps';
import type { Cell, DiceMode, GameEvent, GuildId } from '../engine/types';
import { Renderer } from '../render/renderer';
import { BattlePanel } from './battle';
import { Hud, daTime, guildShort, toggleView } from './hud';
import { fmtTime, getSettings, onSettings } from './settings';
import { CURSES } from '../engine/cards';
import { TOKEN_INFO } from '../engine/data';
import { NeedDecision, type RestOptions } from '../engine/game';
import { itemColor } from './cardview';
import { play } from '../audio/sfx';

/** Liga motor + renderer + HUD + IA + rede. Modos: local (teste), anfitrião e cliente (online). */
export class Controller {
  game!: Game;
  readonly renderer: Renderer;
  readonly hud: Hud;
  readonly battle: BattlePanel;
  private ais: Partial<Record<GuildId, SimpleAI>> = {};
  private aiTimer = 0;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  private mouse = { x: 0, y: 0 };
  private onExit: () => void;
  private testPanel!: HTMLElement;
  // Histórico do Modo Teste: retratos do estado antes de cada jogada humana
  private history: { label: string; state: string }[] = [];
  private turnStart: { key: string; state: string; histLen: number } | null = null;
  private keepDice = false;
  private vDest: Cell | null = null; // destino escolhido para o Monstro na Vingança
  // ---- online
  mode: 'local' | 'host' | 'client' = 'local';
  myGuild: GuildId | null = null;
  net: Session | null = null;
  lobby: Lobby | null = null;
  private waitingNet = false;
  private onlinePanel!: HTMLElement;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, onExit: () => void) {
    this.renderer = new Renderer(canvas);
    this.hud = new Hud(hudRoot);
    this.onExit = onExit;
    this.battle = new BattlePanel(hudRoot, {
      game: () => this.game,
      speed: () => this.renderer.speed,
      viewWounds: id => this.renderer.viewWounds(id),
      isHuman: u => !!u.guild && this.isMine(u.guild),
    });
    this.renderer.hooks = {
      onEvent: e => {
        this.followEvent(e);
        // Tela de batalha: segura a fila de animações até o jogador clicar em Continuar
        const humanInvolved = this.game.guilds().some(g => this.isMine(g.id));
        const bm = getSettings().battle;
        const minePart = e.t === 'attack' && [e.attackerId, ...e.targets.map(t => t.id)].some(id => { const u = this.game.unit(id); return u.kind === 'hero' && this.isMine(u.guild!); });
        const showBattle = e.t === 'attack' && (bm === 'never' ? false : bm === 'mine' ? minePart : (humanInvolved || this.renderer.speed < 4));
        this.hud.onEvent(e, showBattle);
        if (showBattle && e.t === 'attack') {
          this.battle.playAttack(e, () => this.renderer.release());
          return true;
        }
        // animações no centro da tela: o jogo espera elas acabarem
        if (e.t === 'attack') {
          // primeiro a rolagem (ataque e defesa) no centro da tela; com o resultado, a investida / o projétil
          this.hud.centerDice(e, () => {
            const ms = this.renderer.animateAttack(e);
            setTimeout(() => this.renderer.release(), ms + 80);
          });
          return true;
        }
        if (e.t === 'pickup') {
          // todos os marcadores do mesmo Espaço aparecem juntos
          const all = [e, ...this.renderer.takePickups(e.heroId)];
          this.hud.flipTokens(e.heroId, all.map(x => ({ token: x.token, hidden: !!x.hidden })), () => this.renderer.release());
          return true;
        }
        if (e.t === 'useToken') { this.hud.showUsed(e.heroId, e.token, () => this.renderer.release()); return true; }
        if (e.t === 'spawnRoll') {
          this.hud.spawnRoll(e, () => this.renderer.release());
          return true;
        }
        if (e.t === 'gameover') setTimeout(() => this.showGameOver(), 900);
        if (e.t === 'turn') {
          this.hud.refresh();
          // hotseat: leva a câmera até os heróis de quem vai jogar
          const humans = this.game.guilds().filter(g => this.isMine(g.id));
          if ((humans.length > 1 || this.mode !== 'local') && this.isMine(e.guild)) {
            const gs = this.game.guild(e.guild);
            const cells = this.game.heroesOf(gs.id).filter(h => h.alive && h.cell).map(h => h.cell!);
            if (cells.length) this.renderer.focus(cells, this.renderer.cam.zoom);
          }
        }
        return false;
      },
      onIdle: () => this.onIdle(),
    };
    this.bindInput(canvas);
    this.buildTestPanel(hudRoot);
    this.buildOnlinePanel(hudRoot);
    let last = performance.now();
    const loop = (t: number) => {
      this.tickClock(t - last);
      this.tickPan(t - last);
      this.tickView(t);
      last = t;
      this.renderer.frame(t);
      requestAnimationFrame(loop);
    };
    onSettings(() => { this.applySettings(); if (this.game) this.refresh(); });
    requestAnimationFrame(loop);
  }

  private bindHud() {
    this.installHook();
    this.deciding = false;
    this.hud.isMine = g => this.isMine(g);
    this.hud.nameOf = g => this.lobby?.seats.find(x => x.guild === g)?.name ?? null;
    this.hud.bind(this.game, {
      activate: id => this.doActivate(id),
      selectCard: uid => { this.hud.selectedCard = uid; this.refresh(); },
      useToken: id => this.act({ type: 'token', tokenId: id }),
      endTurn: () => this.act({ type: 'end' }),
      rest: () => this.openRest(),
      inspect: id => { this.hud.inspected = id; this.refresh(); },
      mission: id => this.showMission(id),
      menu: () => this.openMenu(),
    });
  }

  /** Partida de um cenário da campanha. */
  private campaignEnd: ((g: Game) => void) | null = null;
  /** Nível da IA na campanha (fora dela vale a Configuração). */
  private campaignAI: AILevel | null = null;
  private aiFor(g: GuildId): SimpleAI { return (this.ais[g] ??= new SimpleAI(this.campaignEnd && this.campaignAI ? this.campaignAI : getSettings().ai)); }

  startCampaign(mapId: string, opts: Omit<Parameters<typeof Game.create>[1], 'seed'>, onEnd: (g: Game) => void, info: { baseMs: number; onExit: () => void; aiLevel?: AILevel }) {
    this.campaignAI = info.aiLevel ?? null;
    this.leaveOnline(false);
    this.mode = 'local';
    this.campaignEnd = onEnd;
    this.campaignBase = info.baseMs;
    this.campaignExit = info.onExit;
    this.campaignRestart = () => this.startCampaign(mapId, opts, onEnd, info);
    this.closeRestSilently();
    this.setTestUI(false);
    this.onlinePanel.classList.add('hidden');
    this.hud.setModeBadge('CAMPANHA');
    this.stopped = false;
    this.game = Game.create(getMap(mapId), { ...opts, deploy: true });
    this.ais = {};
    this.bindHud();
    this.applySettings();
    this.renderer.setGame(this.game);
    this.history = [];
    this.turnStart = null;
    this.renderer.enqueue(this.game.drain());
    this.hud.log(`${this.game.map.name} — Monstros Nível ${this.game.s.level}. ${guildShort(this.game.s.guildOrder[0])} começa.`);
    document.getElementById('gameover')?.remove();
    this.deploySel = null;
    this.deployFocused = null;
    this.focusStart();
    this.onIdle();
  }

  /** Configuração do último Modo Teste (para "Nova partida" e "Jogar novamente"). */
  private testCfg: TestConfig = loadTestConfig();
  startTest(seed?: number, cfg: TestConfig = this.testCfg) {
    this.leaveOnline(false);
    this.mode = 'local';
    this.stopped = false;
    this.testCfg = cfg;
    this.campaignEnd = null;
    this.deploySel = null;
    this.deployFocused = null;
    this.hud.panel('deploybox', null);
    this.closeRestSilently();
    this.setTestUI(true);
    this.onlinePanel.classList.add('hidden');
    this.hud.setModeBadge('MODO TESTE');
    const debug = this.game?.s.debug;
    // Modo Teste: o Time 1 fica na Área Inicial 1 e joga primeiro; os outros recebem Heróis diferentes, sorteados.
    this.game = Game.create(getMap(cfg.mapId), {
      seed,
      players: cfg.teams.map((t, i) => ({ guild: t.guild, controller: t.controller, name: t.name, heroes: i === 0 ? cfg.heroes : undefined, cards: i === 0 ? cfg.cards : undefined })),
      fixedOrder: true,
      deploy: true,
    });
    if (debug) this.game.s.debug = { ...debug };
    this.ais = {};
    this.bindHud();
    this.renderer.setGame(this.game);
    this.history = [];
    this.turnStart = null;
    this.focusStart();
    this.renderer.enqueue(this.game.drain());
    this.hud.log(`Nova partida — seed ${this.game.s.rng}. ${guildShort(this.game.s.guildOrder[0])} começa.`);
    this.updateTestPanel();
    document.getElementById('gameover')?.remove();
    this.onIdle();
  }

  // ------------------------------------------------------------------
  /** A Guilda é controlada por quem está neste computador? */
  isMine(g: GuildId): boolean {
    if (!this.game) return false;
    if (this.mode === 'local') return this.game.guild(g).controller === 'human';
    return g === this.myGuild && this.game.guild(g).controller === 'human';
  }

  private isHumanTurn() {
    return !!this.game && !this.stopped && !this.game.s.winner && !this.waitingNet && !this.game.s.pending && !this.deploying && !this.deciding && this.isMine(this.game.currentGuild().id);
  }

  // ------------------------------------------------------------------
  // Decisões do jogador no meio de uma jogada (Rerrolagem): a jogada é feita; se precisar de uma escolha,
  // é desfeita, o jogador escolhe e ela é refeita com a escolha (o RNG é determinístico, os dados são os mesmos).
  // ------------------------------------------------------------------
  private decisionQueue: number[][] = [];
  private deciding = false;
  private autoDecide = false;

  private installHook() {
    this.game.rerollHook = req => {
      const u = this.game.unit(req.heroId);
      if (this.autoDecide || this.mode === 'client' || !u.guild || !this.isMine(u.guild) || getSettings().reroll === 'auto') return 'auto';
      if (this.decisionQueue.length) return this.decisionQueue.shift()!;
      throw new NeedDecision(req);
    };
  }

  /** Roda `fn`; se precisar de decisão, pergunta e repete. `done` é chamado (talvez depois) com o resultado. */
  private withDecisions(fn: () => boolean, done: (ok: boolean) => void) {
    const snap = JSON.stringify(this.game.s);
    const decided: number[][] = [];
    const attempt = () => {
      this.decisionQueue = decided.slice();
      try {
        const ok = fn();
        this.deciding = false;
        done(ok);
      } catch (e) {
        if (!(e instanceof NeedDecision)) throw e;
        this.game.s = JSON.parse(snap);
        this.game.drain();
        this.deciding = true;
        this.clearHighlights();
        this.hud.tooltip(null);
        this.hud.setHint('Escolha os dados para rerrolar');
        this.battle.askReroll(e.req).then(idx => { decided.push(idx); attempt(); });
      }
    };
    attempt();
  }

  /** Executa uma jogada: local, como anfitrião (aplica e transmite) ou como cliente (envia ao anfitrião). */
  private act(a: Action, label = 'jogada'): boolean {
    if (!this.game || this.renderer.busy || this.battle.mode === 'prepare' || this.waitingNet) return false;
    if (this.mode === 'client') {
      this.waitingNet = true;
      this.clearHighlights();
      this.hud.setHint('Enviando jogada…');
      (this.net as ClientSession).sendAction(a);
      return true;
    }
    if (this.deciding) return false;
    const snap = this.mode === 'local' ? JSON.stringify(this.game.s) : '';
    const guild = (a.type === 'place' || a.type === 'ready') ? this.myDeployGuild() : actingGuild(this.game);
    if (!guild) return false;
    let result: boolean | null = null;
    this.withDecisions(() => applyAction(this.game, guild, a), ok => {
      result = ok;
      if (ok && this.mode === 'local') {
        this.history.push({ label, state: snap });
        if (this.history.length > 60) this.history.shift();
      }
      const ev = this.game.drain();
      if (this.mode === 'host' && (ok || ev.length)) (this.net as HostSession).update(ev, this.game.s);
      if (!ok && !ev.length) { this.refresh(); return; }
      this.autoUninspect();
      this.clearHighlights();
      this.renderer.enqueue(ev);
      this.hud.refresh();
      if (!ev.length) this.refresh();
    });
    return result ?? true;
  }

  private doActivate(id: string) {
    if (!this.isHumanTurn() || this.renderer.busy) return;
    const a = this.game.s.activation;
    if (a?.heroId === id) { this.hud.inspected = this.freeView() ? id : null; this.refresh(); return; }
    this.hud.selectedCard = null;
    this.hud.inspected = this.freeView() ? id : null;
    if (!this.act({ type: 'activate', heroId: id }) && this.mode !== 'client') {
      this.hud.toast(this.game.s.blessing ? 'Bênção: escolha um Aliado em Linha de Visão de Hobsbawm que ainda não foi ativado.' : 'Só é possível trocar de Herói antes de mover ou atacar.', '#c0392b');
    }
  }

  private onIdle() {
    // retrato do início do turno humano (para "Voltar ao início do turno")
    const fresh = !this.game.s.activation || (!this.game.s.activation.moved && !this.game.s.activation.attacked && this.game.s.activation.mp >= 3);
    if (this.stopped) return;
    if (this.deploying) {
      // Guildas da IA (ou que viraram IA) não posicionam: ficam prontas na hora
      const ai = this.mode !== 'client' ? this.game.s.deploying!.find(g => this.game.guild(g).controller === 'ai') : null;
      if (ai) {
        for (const p of this.aiFor(ai).deployPlan(this.game, ai)) applyAction(this.game, ai, { type: 'place', heroId: p.heroId, cell: p.cell });
        applyAction(this.game, ai, { type: 'ready' });
        this.pushLocal(this.game.drain());
        return;
      }
      this.refresh();
      return;
    }
    if (this.game.currentGuild().controller === 'human' && !this.game.s.winner && !this.game.s.pending && fresh) {
      const k = `${this.game.s.turn}-${this.game.s.current}`;
      if (this.turnStart?.key !== k) this.turnStart = { key: k, state: JSON.stringify(this.game.s), histLen: this.history.length };
    }
    this.hud.syncCemetery();
    this.refresh();
    if (!this.game || this.game.s.winner || this.mode === 'client') return;
    const pend = this.game.s.pending;
    if (this.deciding) return;
    if (pend && this.game.guild(pend.controller).controller === 'ai') {
      this.withDecisions(() => this.game.autoResolvePending(), () => this.pushLocal(this.game.drain()));
      return;
    }
    if (this.game.currentGuild().controller === 'ai') {
      clearTimeout(this.aiTimer);
      this.aiTimer = window.setTimeout(() => this.aiStep(), 420 / this.renderer.speed);
    }
  }

  private aiStep() {
    if (this.stopped || this.renderer.busy || this.game.s.winner || this.game.s.pending || this.deploying || this.deciding) return;
    const gs = this.game.currentGuild();
    if (gs.controller !== 'ai') return;
    const ai = this.aiFor(gs.id);
    const a = ai.next(this.game);
    const action: Action = a.type === 'move' ? { type: 'move', cell: a.cell, openDoors: true } : a;
    this.withDecisions(() => {
      if (!applyAction(this.game, gs.id, action)) applyAction(this.game, gs.id, { type: 'end' });
      return true;
    }, () => {
      const ev = this.game.drain();
      this.pushLocal(ev);
      if (!ev.length) this.onIdle(); // ativação sem animação (ex.: escolher Herói)
    });
  }

  /** Anima eventos gerados aqui e, se for anfitrião, transmite para todos. */
  private pushLocal(ev: GameEvent[]) {
    if (this.mode === 'host') (this.net as HostSession).update(ev, this.game.s);
    this.renderer.enqueue(ev);
    this.hud.refresh();
  }

  // ------------------------------------------------------------------
  // ONLINE
  // ------------------------------------------------------------------
  startOnline(state: GameState, lobby: Lobby, session: Session) {
    this.leaveOnline(false);
    this.net = session;
    this.lobby = lobby;
    this.mode = session.isHost ? 'host' : 'client';
    this.myGuild = lobby.seats.find(s => s.clientId === session.me)?.guild ?? null;
    this.waitingNet = false;
    this.stopped = false;
    this.game = new Game(getMap(state.mapId), state);
    this.ais = {};
    this.history = [];
    this.turnStart = null;
    this.battle.close();
    this.deploySel = null;
    this.deployFocused = null;
    this.hud.panel('deploybox', null);
    this.closeRestSilently();
    this.bindHud();
    this.applySettings();
    this.renderer.setGame(this.game);
    document.getElementById('gameover')?.remove();
    this.setTestUI(false);
    this.onlinePanel.classList.remove('hidden');
    this.hud.setModeBadge(session.isHost ? 'ONLINE · ANFITRIÃO' : 'ONLINE');
    session.ev = this.sessionEvents();
    if (session.isHost) {
      const host = session as HostSession;
      host.getState = () => this.game.s;
      host.onRemoteAction = (g, a) => this.handleRemote(g, a);
      host.onSeatsChanged = () => this.updateOnlinePanel();
    }
    if (this.myGuild) {
      const gs = this.game.guild(this.myGuild);
      this.renderer.focus(this.game.map.startAreas[gs.startArea]);
    }
    this.hud.log(`Partida online — você é a ${this.myGuild ? guildShort(this.myGuild) : 'plateia'}. ${guildShort(this.game.currentGuild().id)} começa.`);
    if (this.game.s.deploying?.length) this.hud.banner('Posicionamento', this.game.currentGuild().color, 'Coloquem os Heróis na Área Inicial');
    else this.hud.banner(`Vez ${daTime(this.game.currentGuild().id)}`, this.game.currentGuild().color, this.isMine(this.game.currentGuild().id) ? 'Sua vez!' : 'Partida online');
    this.updateOnlinePanel();
    this.renderer.reset();
  }

  /** Eventos da sessão durante a partida. */
  private sessionEvents(): SessionEvents {
    return {
      status: (text, kind) => { this.hud.toast(text, kind === 'error' ? '#c0392b' : kind === 'warn' ? '#e0b43a' : '#3fa34d'); this.addChat('Sistema', text); },
      lobby: l => { this.lobby = l; this.syncControllers(); this.updateOnlinePanel(); },
      start: (state, l) => this.startOnline(state, l, this.net!),
      update: (events, state) => this.receive(events, state),
      reject: reason => {
        this.waitingNet = false;
        if (this.battle.mode === 'play' && !this.renderer.busy) this.battle.close();
        this.hud.toast(reason, '#c0392b');
        this.refresh();
      },
      chat: (from, text, color) => this.addChat(from, text, color),
      view: (guild, c, m, sel) => this.onRemoteView(guild, c, m, sel),
    };
  }

  // ------------------------------------------------------------------
  // VISÃO DOS JOGADORES: a câmera segue quem está jogando
  // ------------------------------------------------------------------
  private viewSent = { t: 0, key: '' };

  /** Online: quem está jogando envia a câmera e o mouse para os outros (~8 vezes por segundo). */
  private tickView(t: number) {
    if (this.mode === 'local' || !this.net || !this.game || this.stopped || t - this.viewSent.t < 120) return;
    const cur = this.game.s.deploying?.length ? this.myGuild : this.game.currentGuild().id;
    if (!cur || !this.isMine(cur)) return;
    const c = this.renderer.viewCenter(), w = this.renderer.screenToWorld(this.mouse.x, this.mouse.y);
    const cam: [number, number, number] = [Math.round(c.x), Math.round(c.y), Math.round(this.renderer.cam.zoom * 1000) / 1000];
    const m: [number, number] = [Math.round(w.x), Math.round(w.y)];
    const sel = this.hud.inspected ?? this.game.s.activation?.heroId ?? null;
    const k = `${cam}|${m}|${sel}`;
    if (k === this.viewSent.key) return;
    this.viewSent = { t, key: k };
    (this.net as HostSession | ClientSession).sendView(cam, m, sel);
  }

  private onRemoteView(guild: GuildId, c: [number, number, number], m: [number, number] | null, sel?: string | null) {
    if (!this.game || this.stopped || guild === this.myGuild) return;
    if (m) this.renderer.pointers.set(guild, { x: m[0], y: m[1], name: this.hud.nameOf(guild) ?? guildShort(guild), color: this.game.guild(guild).color, t: performance.now() });
    if (getSettings().view === 'players' && !this.game.s.deploying?.length && guild === this.game.currentGuild().id && !this.isMine(guild)) {
      this.renderer.glideTo(c[0], c[1], c[2]);
      const want = sel && this.game.s.units[sel] && sel !== this.game.s.activation?.heroId ? sel : null;
      if (want !== this.hud.inspected) { this.hud.inspected = want; this.hud.refresh(); }
    }
  }

  /** Visão dos jogadores: acompanha as jogadas da IA (e de quem joga), mostrando onde ela "clicou". */
  private followEvent(e: GameEvent) {
    if (!this.game || this.stopped || getSettings().view !== 'players' || this.game.s.deploying?.length) return;
    const cur = this.game.currentGuild();
    if (e.t === 'turn') {
      if (this.isMine(e.guild)) return;
      this.hud.inspected = null; // a ficha mostra o Herói de quem joga
      const cells = this.game.heroesOf(e.guild).filter(h => h.alive && h.cell).map(h => h.cell!);
      this.renderer.glideCells(cells);
      return;
    }
    // vez de um jogador neste computador, ou jogador online (a câmera dele chega pela rede)
    if (this.isMine(cur.id) || (this.mode !== 'local' && cur.controller === 'human')) return;
    let cells: Cell[] = [];
    let aim: Cell | null = null;
    if (e.t === 'move') { cells = [e.to]; aim = e.to; }
    else if (e.t === 'attack') {
      const a = this.game.unit(e.attackerId);
      const ts = e.targets.map(x => this.game.unit(x.id).cell).filter((c): c is Cell => !!c);
      cells = [...(a?.cell ? [a.cell] : []), ...ts];
      if (e.reason === 'heroi') aim = ts[0] ?? null;
    }
    else if (e.t === 'respawn' || e.t === 'spawn') cells = [e.cell];
    if (!cells.length) return;
    this.renderer.glideCells(cells);
    if (aim) {
      const p = this.renderer.cellWorld(aim);
      this.renderer.pointers.set(cur.id, { x: p.x, y: p.y - 20, name: cur.controller === 'ai' ? `IA · ${guildShort(cur.id)}` : this.hud.nameOf(cur.id) ?? guildShort(cur.id), color: cur.color, t: performance.now() });
    }
  }

  /** Cliente: estado novo vindo do anfitrião. */
  private receive(events: GameEvent[], state: GameState) {
    this.waitingNet = false;
    this.game.s = state;
    if (events.length) {
      this.autoUninspect();
      this.clearHighlights();
      this.renderer.enqueue(events);
    }
    this.hud.refresh();
    if (!events.length && !this.renderer.busy) this.refresh();
  }

  /** Anfitrião: jogada de um jogador remoto. */
  private handleRemote(guild: GuildId, a: Action): string | null {
    if (this.game.guild(guild).controller !== 'human') return 'A IA está controlando sua Guilda.';
    this.autoDecide = true;
    let ok = false;
    try { ok = applyAction(this.game, guild, a); } finally { this.autoDecide = false; }
    const ev = this.game.drain();
    if (ok || ev.length) {
      (this.net as HostSession).update(ev, this.game.s);
      this.autoUninspect();
      this.renderer.enqueue(ev);
      this.hud.refresh();
      if (!ev.length && !this.renderer.busy) this.refresh();
    }
    if (ok) return null;
    if (a.type === 'activate') return 'Só é possível trocar de Herói antes de mover ou atacar.';
    return 'Jogada inválida.';
  }

  /** Vagas marcadas como IA no lobby viram IA no jogo (anfitrião). */
  private syncControllers() {
    if (this.mode !== 'host' || !this.lobby || !this.game) return;
    let changed = false;
    for (const seat of this.lobby.seats) {
      const gs = this.game.s.guilds[seat.guild];
      if (!gs) continue;
      const want = seat.ai ? 'ai' : 'human';
      if (gs.controller !== want) { gs.controller = want; changed = true; }
    }
    if (changed) { this.pushLocal([]); this.onIdle(); }
  }

  leaveOnline(close = true) {
    if (close) this.net?.close();
    this.net = null;
    this.lobby = null;
    this.myGuild = null;
    this.waitingNet = false;
    if (this.mode !== 'local') this.mode = 'local';
  }

  private buildOnlinePanel(root: HTMLElement) {
    const p = document.createElement('div');
    p.id = 'onlinepanel';
    p.className = 'panel hidden';
    p.innerHTML = `<div class="panel-h" id="op-toggle">🌐 Online <small id="op-code"></small></div>
      <div class="op-body"><div id="op-seats"></div>
      <div id="op-chat"></div>
      <form id="op-form"><input id="op-msg" maxlength="200" placeholder="Mensagem…" autocomplete="off"/><button>➤</button></form>
      <button id="op-leave" class="op-leave">Sair da partida</button></div>`;
    (root.querySelector('#sidepanels') ?? root).append(p);
    this.onlinePanel = p;
    (p.querySelector('#op-toggle') as HTMLElement).onclick = () => p.classList.toggle('collapsed');
    (p.querySelector('#op-form') as HTMLFormElement).onsubmit = e => {
      e.preventDefault();
      const inp = p.querySelector('#op-msg') as HTMLInputElement;
      const t = inp.value.trim();
      if (t) this.net?.chat(t);
      inp.value = '';
    };
    (p.querySelector('#op-leave') as HTMLElement).onclick = () => {
      if (!confirm(this.mode === 'host' ? 'Você é o anfitrião: sair encerra a partida para todos. Sair?' : 'Sair da partida?')) return;
      this.leaveOnline();
      this.onExit();
    };
  }

  private updateOnlinePanel() {
    const p = this.onlinePanel;
    if (!p || !this.lobby || this.mode === 'local') return;
    (p.querySelector('#op-code') as HTMLElement).textContent = `sala ${this.lobby.code}`;
    const host = this.mode === 'host';
    (p.querySelector('#op-seats') as HTMLElement).innerHTML = this.lobby.seats.map(s => `
      <div class="op-seat"><span class="dot" style="background:${GUILDS[s.guild].color}"></span>
        <b>${s.ai ? 'IA' : s.name}</b>${s.clientId === this.net?.me ? ' <i>(você)</i>' : ''}${s.host ? ' 👑' : ''}
        <span class="op-st ${s.ai ? 'ai' : s.connected ? 'on' : 'off'}">${s.ai ? 'IA' : s.connected ? 'online' : 'desconectado'}</span>
        ${host && !s.host && (s.ai ? s.name !== 'IA' : true) ? `<button data-ai="${s.guild}" data-v="${s.ai ? 0 : 1}">${s.ai ? 'Devolver' : 'IA assume'}</button>` : ''}
      </div>`).join('');
    p.querySelectorAll<HTMLElement>('[data-ai]').forEach(b => {
      b.onclick = () => (this.net as HostSession).setSeatAI(b.dataset.ai as GuildId, b.dataset.v === '1');
    });
  }

  private addChat(from: string, text: string, color?: string) {
    const box = this.onlinePanel?.querySelector('#op-chat');
    if (!box) return;
    const el = document.createElement('div');
    el.innerHTML = `<b style="color:${color ?? '#d7b8ff'}"></b> `;
    (el.firstChild as HTMLElement).textContent = `${from}:`;
    el.append(document.createTextNode(text));
    box.append(el);
    while (box.children.length > 60) box.firstChild!.remove();
    box.scrollTop = box.scrollHeight;
  }

  // ------------------------------------------------------------------
  // Destaques (azul = movimento, vermelho = alvos)
  // ------------------------------------------------------------------
  private clearHighlights() {
    const hl = this.renderer.hl;
    hl.move = new Map();
    hl.path = [];
    hl.attackUnits = new Set();
    hl.doorIcons = [];
    hl.los = null;
  }

  refresh() {
    if (!this.game) return;
    this.hud.refresh();
    this.clearHighlights();
    const hl = this.renderer.hl;
    const a = this.game.s.activation;
    hl.activeUnit = a?.heroId ?? null;
    hl.moveColor = 'blue';
    hl.attackCells = new Set();
    if (this.deploying) { this.paintDeploy(); return; }
    if (this.deployPanel) { this.deployPanel = false; this.deployFocused = null; this.hud.panel('deploybox', null); }
    if (this.restDraft) { if (this.isHumanTurn() && !this.renderer.busy) { this.paintRest(); return; } this.closeRestSilently(); }
    const pend = this.game.s.pending;
    // Vingança de um Monstro que já saiu do tabuleiro: nada a decidir
    if (pend && !this.renderer.busy && (!this.game.unit(pend.monsterId).cell || !this.game.unit(pend.heroId).alive) && this.isMine(pend.controller)) {
      this.act({ type: 'vengeance', dest: null, attack: false });
      return;
    }
    if (pend && !this.renderer.busy && this.isMine(pend.controller)) {
      this.showMonsterControl();
      return;
    }
    this.hud.monsterPanel(null);
    if (pend && !this.renderer.busy) {
      this.hud.setHint(`Aguardando ${this.hud.nameOf(pend.controller) ?? guildShort(pend.controller)} decidir a Reação de Vingança…`);
      return;
    }
    if (!this.isHumanTurn() || this.renderer.busy || !a) {
      this.hud.setHint(this.isHumanTurn() ? 'Clique em um Herói seu para ativá-lo · <b>R</b> Descansar' : '');
      return;
    }
    const h = this.game.unit(a.heroId);
    if (this.game.canMove()) {
      for (const n of this.game.reachable(h, a.mp).values()) if (n.canEnd && n.prev !== null) hl.move.set(key(n.cell), n.mp);
      hl.doorIcons = this.game.doorsAdjacentToActive();
    }
    if (!a.attacked) for (const c of h.cards) if (!c.exhausted) for (const t of this.game.attackTargets(h, c)) hl.attackUnits.add(t.id);
    const parts: string[] = [];
    if (hl.move.size) parts.push('<span class="k blue">■</span> clique para mover');
    if (hl.attackUnits.size) parts.push('<span class="k red">■</span> clique no inimigo para abrir a <b>Batalha</b>');
    if (hl.doorIcons.length) parts.push('🔑 clique na porta para abrir/fechar (1 PM)');
    if (a.moved && !a.attacked && !a.moveLocked) parts.push('<i>atacar agora encerra o Movimento</i>');
    if (this.game.s.blessing) parts.push('✨ <b>Bênção</b>: clique em um Aliado em Linha de Visão de Hobsbawm para ativá-lo');
    parts.push('<b>Espaço</b> encerra o turno');
    this.hud.setHint(parts.join(' · '));
    this.updateHover();
  }

  private updateHover() {
    const hl = this.renderer.hl;
    const { x, y } = this.mouse;
    const unitId = this.renderer.pickUnit(x, y);
    const cell = this.renderer.pickCell(x, y);
    hl.hoverUnit = unitId;
    hl.hoverCell = cell && this.game.board.playable(cell) ? cell : null;
    hl.path = [];
    hl.los = null;
    const a = this.game.s.activation;
    if (this.isHumanTurn() && a && !this.renderer.busy) {
      const h = this.game.unit(a.heroId);
      if (cell && hl.move.has(key(cell)) && !(unitId && hl.attackUnits.has(unitId))) {
        const nodes = this.game.reachable(h, a.mp);
        hl.path = this.game.pathTo(nodes, cell).map(n => n.cell);
      }
      const card = h.cards.find(c => c.uid === this.hud.selectedCard);
      if (unitId && card && CARDS[card.defId].attackType === 'ranged' && h.cell) {
        const t = this.game.unit(unitId);
        if (this.game.isEnemy(h, t) && t.cell) hl.los = { from: h.cell, to: t.cell, ok: hl.attackUnits.has(unitId) };
      }
    }
    // tooltip
    if (unitId) {
      const u = this.game.unit(unitId);
      const max = this.game.maxHp(u);
      let html: string;
      if (u.kind === 'monster') {
        const md = MONSTERS[u.defId];
        html = `<b>${md.name}</b><br/>❤ ${max - u.wounds}/${max} · ☠ Ext ${md.exterm} · ⛨ ${md.defense}<br/>${md.attackType === 'melee' ? '⚔' : '➶'} ${md.dice} dados · 👣 ${md.move} · 🪙 ${md.reward}${u.stunned ? '<br/>✷ Atordoado' : ''}`;
      } else {
        html = `<b style="color:${GUILDS[u.guild!].light}">${HEROES[u.defId].name}</b> (${guildShort(u.guild!)})<br/>❤ ${max - u.wounds}/${max} · ⛨ ${this.game.defenseDice(u)}${u.stunned ? '<br/>✷ Atordoado' : ''}`;
      }
      if (hl.attackUnits.has(unitId)) html += '<br/><span style="color:#ff9b7a">Clique para atacar</span>';
      this.hud.tooltip(html, x, y);
    } else this.hud.tooltip(null);
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------
  private bindInput(canvas: HTMLCanvasElement) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      this.drag = { x: e.clientX, y: e.clientY, cx: this.renderer.cam.x, cy: this.renderer.cam.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      this.mouse = { x: e.clientX, y: e.clientY };
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
        if (this.drag.moved) {
          this.renderer.camGoal = null;
          this.renderer.cam.x = this.drag.cx + dx;
          this.renderer.cam.y = this.drag.cy + dy;
          canvas.style.cursor = 'grabbing';
        }
      }
      if (this.game) this.updateHover();
    });
    canvas.addEventListener('pointerup', e => {
      const d = this.drag;
      this.drag = null;
      canvas.style.cursor = '';
      if (d && !d.moved && e.button === 0) this.click(e.clientX, e.clientY);
      if (d && !d.moved && e.button === 2) { this.hud.inspected = null; this.refresh(); }
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.renderer.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    window.addEventListener('keyup', e => { this.panKeys.delete(e.code); });
    window.addEventListener('blur', () => this.panKeys.clear());
    window.addEventListener('keydown', e => {
      if (!this.game || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (document.getElementById('hud')?.classList.contains('hidden')) return;
      if (this.menuOpen && e.code !== 'Escape') return;
      if (this.battle.isAsking) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.battle.confirmAsk(); } return; }
      if (this.battle.isOpen) {
        if (e.code === 'Escape') this.battle.cancel();
        else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.battle.pressButton(); }
        return;
      }
      if (PAN_KEYS.includes(e.code) && !e.ctrlKey && !e.metaKey) { this.panKeys.add(e.code); return; }
      if (e.code === 'KeyB') { const id = this.hud.inspected ?? this.game.s.activation?.heroId; if (id && this.game.unit(id).kind === 'hero') { if (this.hud.bagIsOpen) this.hud.closeBag(); else this.hud.showBag(id); } return; }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (this.isHumanTurn() && !this.restDraft) this.act({ type: 'end' }); }
      else if (e.code === 'KeyR') { if (this.isHumanTurn()) this.openRest(); }
      else if (e.code === 'KeyG') { this.renderer.showGrid = !this.renderer.showGrid; this.updateTestPanel(); }
      else if (e.code === 'KeyC') this.renderer.fit();
      else if (e.code === 'KeyV') toggleView();
      else if (e.code === 'KeyF') this.focusActive();
      else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (this.mode === 'local' && !this.campaignEnd) this.undo(); }
      else if ((e.code === 'F2' || e.code === 'KeyT') && this.mode === 'local' && !this.campaignEnd) { e.preventDefault(); this.toggleTestPanel(); }
      else if (e.code === 'Escape') {
        if (this.menuOpen) { document.getElementById('gamemenu')!.classList.add('hidden'); this.menuOpen = false; }
        else if (this.restDraft) this.closeRest();
        else if (this.hud.inspected) { this.hud.inspected = null; this.refresh(); }
        else this.openMenu();
      }
      else if (/^Digit[1-4]$/.test(e.code)) {
        const h = this.game.activeHero();
        const c = h?.cards[Number(e.code.slice(5)) - 1];
        if (c && !c.exhausted) { this.hud.selectedCard = c.uid; this.refresh(); }
      }
    });
  }

  // ------------------------------------------------------------------
  /** Teclas W/A/S/D seguradas: a câmera anda enquanto estiverem pressionadas. */
  private panKeys = new Set<string>();
  private tickPan(dt: number) {
    if (!this.panKeys.size || dt <= 0 || dt > 200) return;
    const v = 0.9 * dt; // pixels por ms
    const c = this.renderer.cam;
    this.renderer.camGoal = null;
    if (this.panKeys.has('KeyW') || this.panKeys.has('ArrowUp')) c.y += v;
    if (this.panKeys.has('KeyS') || this.panKeys.has('ArrowDown')) c.y -= v;
    if (this.panKeys.has('KeyA') || this.panKeys.has('ArrowLeft')) c.x += v;
    if (this.panKeys.has('KeyD') || this.panKeys.has('ArrowRight')) c.x -= v;
  }

  /** Reação de Vingança controlada por você (jogador à direita do ativo). */
  private showMonsterControl() {
    const g = this.game;
    const p = g.s.pending!;
    const opts = g.vengeanceOptions()!;
    const m = g.unit(p.monsterId), h = g.unit(p.heroId);
    const md = MONSTERS[m.defId];
    const hl = this.renderer.hl;
    hl.moveColor = 'purple';
    hl.activeUnit = m.id;
    hl.attackUnits = new Set([h.id]);
    for (const [k, n] of opts.reach) if (n.canEnd) hl.move.set(k, n.mp);
    hl.attackCells = opts.attackFrom;
    const dest = this.vDest && opts.reach.get(key(this.vDest))?.canEnd ? this.vDest : m.cell!;
    hl.path = sameCell(dest, m.cell) ? [] : g.pathTo(opts.reach, dest).map(n => n.cell);
    const canHit = opts.attackFrom.has(key(dest));
    const ctlName = g.guild(p.controller).name;
    const el = this.hud.monsterPanel(`
      <div class="panel-h">☠ Reação de Vingança — você controla o ${md.name}</div>
      <div class="mc-body">
        <p>${g.name(h)} atacou o ${md.name}. Pela regra, quem controla o Monstro é o <b>jogador à direita</b> do jogador ativo: <b>${ctlName}</b>.</p>
        <p>O Monstro pode se mover até <b>${md.move}</b> Espaço${md.move > 1 ? 's' : ''} e depois atacar <b>${g.name(h)}</b> (${md.attackType === 'melee' ? '⚔ Próximo' : '➶ Distância'}, ${md.dice} dados). Mover e atacar são opcionais.</p>
        <p class="mc-legend"><span class="pu">■</span> clique para escolher onde o Monstro termina · <span class="rd">◇</span> de lá ele consegue atacar · destino atual: <b>${sameCell(dest, m.cell) ? 'ficar parado' : `(${dest.c},${dest.r})`}</b></p>
        <div class="mc-btns">
          <button class="primary" id="mc-atk" ${canHit ? '' : 'disabled'}>⚔ ${sameCell(dest, m.cell) ? 'Atacar' : 'Mover e Atacar'} ${HEROES[h.defId].name}</button>
          <button id="mc-noatk">${sameCell(dest, m.cell) ? 'Não atacar' : 'Só mover (não atacar)'}</button>
          ${sameCell(dest, m.cell) ? '' : '<button id="mc-reset">Ficar parado</button>'}
        </div>
      </div>`);
    const go = (attack: boolean) => {
      const d = dest;
      this.vDest = null;
      this.hud.monsterPanel(null);
      this.act({ type: 'vengeance', dest: sameCell(d, m.cell) ? null : d, attack }, 'vingança');
    };
    (el.querySelector('#mc-atk') as HTMLElement).onclick = () => go(true);
    (el.querySelector('#mc-noatk') as HTMLElement).onclick = () => go(false);
    const rs = el.querySelector('#mc-reset') as HTMLElement | null;
    if (rs) rs.onclick = () => { this.vDest = null; this.refresh(); };
    this.hud.setHint('Você controla o Monstro: escolha um Espaço roxo e confirme no painel');
  }

  private openBattle(heroId: string, targetId: string) {
    this.hud.tooltip(null);
    this.battle.openPrepare(heroId, targetId, this.hud.selectedCard, (cardUid, sacrifice, boosts) => {
      this.hud.selectedCard = cardUid;
      // sem tela de confronto: fecha a janela da arma antes do ataque (a luta aparece só no mapa)
      if (getSettings().battle === 'never') this.battle.close();
      const ok = this.act({ type: 'attack', cardUid, targetId, sacrifice, boosts });
      if (!ok) this.battle.close();
    }, () => this.refresh());
  }

  private click(x: number, y: number) {
    if (!this.game || this.battle.isOpen || this.menuOpen) return;
    if (this.deploying) { this.deployClick(x, y); return; }
    if (this.restDraft) { this.restClick(x, y); return; }
    const pend = this.game.s.pending;
    if (pend) {
      const cell = this.renderer.pickCell(x, y);
      if (cell && this.renderer.hl.move.has(key(cell)) && this.isMine(pend.controller)) { this.vDest = cell; this.refresh(); }
      return;
    }
    const door = this.renderer.pickDoorIcon(x, y);
    if (door && this.isHumanTurn()) { this.act({ type: 'door', doorId: door }); return; }
    let unitId = this.renderer.pickUnit(x, y);
    const cell = this.renderer.pickCell(x, y);
    const hl = this.renderer.hl;
    const a = this.game.s.activation;
    // Sprite na frente de um Espaço azul: o Espaço tem prioridade se o personagem não estiver nele.
    if (unitId && cell && hl.move.has(key(cell)) && !sameCell(this.game.unit(unitId).cell, cell) && !hl.attackUnits.has(unitId)) unitId = null;
    if (this.isHumanTurn() && !this.renderer.busy) {
      // atacar
      const target = unitId && hl.attackUnits.has(unitId) ? unitId : cell ? this.game.unitsAt(cell).find(u => hl.attackUnits.has(u.id))?.id : undefined;
      if (a && target && !(cell && hl.move.has(key(cell)) && !unitId)) {
        this.openBattle(a.heroId, target);
        return;
      }
      // ativar herói próprio
      if (unitId) {
        const u = this.game.unit(unitId);
        if (u.kind === 'hero' && u.guild === this.game.currentGuild().id && u.id !== a?.heroId && (!a || (!a.moved && !a.attacked) || this.game.canBless(u.id))) {
          this.doActivate(unitId);
          return;
        }
      }
      // mover
      if (a && cell && hl.move.has(key(cell))) { this.act({ type: 'move', cell }); return; }
    }
    if (unitId) { this.hud.inspected = unitId === this.game.s.activation?.heroId && !this.freeView() ? null : unitId; this.refresh(); }
  }

  /** Visão livre: a ficha mostra sempre o último personagem clicado. */
  private freeView() { return getSettings().view !== 'players'; }
  /** Depois de uma jogada: só na visão dos jogadores a ficha volta para o personagem ativo. */
  private autoUninspect() { if (!this.freeView()) this.hud.inspected = null; }

  // ------------------------------------------------------------------
  // POSICIONAMENTO INICIAL (p.12): cada Herói em qualquer Espaço da Área Inicial, máx. 2 por Espaço
  // ------------------------------------------------------------------
  /** Herói escolhido no posicionamento (só na tela de quem está posicionando). */
  private deploySel: string | null = null;
  private deployFocused: GuildId | null = null;
  private get deploying() { return !!this.game?.s.deploying?.length; }

  /** Guilda deste computador que ainda precisa posicionar (hotseat: uma de cada vez). */
  private myDeployGuild(): GuildId | null {
    return this.game?.s.deploying?.find(g => this.isMine(g)) ?? null;
  }

  private deployPanel = false;
  private paintDeploy() {
    this.deployPanel = true;
    const gid = this.myDeployGuild();
    const pending = this.game.s.deploying ?? [];
    if (!gid) {
      // já posicionou: espera os outros
      this.hud.panel('deploybox', `
        <div class="panel-h">⏳ Posicionamento</div>
        <div class="rb-body"><p>Aguardando os outros jogadores posicionarem os Heróis:</p>
          <div class="dp-wait">${pending.map(g => `<span><span class="dot" style="background:${this.game.guild(g).color}"></span>${this.hud.nameOf(g) ?? guildShort(g)}</span>`).join('')}</div>
          <p class="muted">A partida começa quando o último jogador terminar.</p></div>`);
      this.hud.setHint('Aguardando o posicionamento dos outros jogadores…');
      return;
    }
    const g = this.game.guild(gid);
    const area = this.game.map.startAreas[g.startArea];
    const heroes = this.game.heroesOf(g.id);
    // hotseat: ao passar para a próxima Guilda, a câmera vai até a Área Inicial dela
    if (this.deployFocused !== gid) { this.deployFocused = gid; this.renderer.focus(area); }
    if (!this.deploySel || !heroes.some(h => h.id === this.deploySel)) this.deploySel = heroes[0].id;
    const hl = this.renderer.hl;
    hl.moveColor = 'green';
    for (const c of area) hl.move.set(key(c), 0);
    hl.activeUnit = this.deploySel;
    const others = pending.filter(x => x !== gid);
    const el = this.hud.panel('deploybox', `
      <div class="panel-h">📍 Posicione seus Heróis — ${g.name}</div>
      <div class="rb-body">
        <p>Escolha um Herói e clique num Espaço verde da sua Área Inicial (no máximo 2 personagens por Espaço). Você também pode clicar no Herói no mapa.</p>
        <div class="dp-heroes">${heroes.map(h => `<button class="${this.deploySel === h.id ? 'on' : ''}" data-dp="${h.id}">${h.num}. ${HEROES[h.defId].name} <small>(${h.cell!.c},${h.cell!.r})</small></button>`).join('')}</div>
        ${others.length ? `<p class="muted">Também posicionando: ${others.map(x => this.hud.nameOf(x) ?? guildShort(x)).join(', ')}.</p>` : ''}
        <div class="rb-btns"><button class="primary" id="dp-ok">✔ Pronto</button></div>
      </div>`);
    el.querySelectorAll<HTMLElement>('[data-dp]').forEach(b => { b.onclick = () => { this.deploySel = b.dataset.dp!; this.refresh(); }; });
    (el.querySelector('#dp-ok') as HTMLElement).onclick = () => { this.deploySel = null; this.act({ type: 'ready' }); };
    this.renderer.hl.activeUnit = this.deploySel;
    this.hud.setHint('Posicionamento: escolha o Herói e o Espaço da Área Inicial');
  }

  private deployClick(x: number, y: number) {
    const gid = this.myDeployGuild();
    if (!gid) return;
    const unitId = this.renderer.pickUnit(x, y);
    const cell = this.renderer.pickCell(x, y);
    const mine = this.game.heroesOf(gid).map(h => h.id);
    const sel = this.deploySel;
    if (unitId && mine.includes(unitId) && !(cell && this.renderer.hl.move.has(key(cell)) && sel && !sameCell(this.game.unit(unitId).cell, cell))) { this.deploySel = unitId; this.refresh(); return; }
    if (!cell || !sel || !this.renderer.hl.move.has(key(cell))) return;
    if (this.game.unitsAt(cell).filter(u => u.id !== sel).length >= 2) { this.hud.toast('Máximo de 2 personagens por Espaço.', '#c0392b'); return; }
    const next = mine.find(id => mine.indexOf(id) > mine.indexOf(sel));
    if (this.act({ type: 'place', heroId: sel, cell }) && next) this.deploySel = next;
  }

  /** Começo da partida (ou fim do posicionamento): focar a Área de quem joga. */
  private focusStart() {
    const mine = this.game.guilds().filter(g => this.isMine(g.id));
    const gid = this.myDeployGuild() ?? (mine.find(g => g.id === this.game.currentGuild().id) ?? mine[0])?.id;
    if (gid) this.renderer.focus(this.game.map.startAreas[this.game.guild(gid).startArea]);
  }

  // ------------------------------------------------------------------
  // DESCANSO (p.18): restaurar, reorganizar cartas e marcadores, ressuscitar
  // ------------------------------------------------------------------
  private restDraft: { cards: Record<string, string>; tokens: Record<string, string>; res: Record<string, Cell>; picking: string | null } | null = null;

  private openRest() {
    if (!this.isHumanTurn() || this.renderer.busy) return;
    const a = this.game.s.activation;
    if (a && (a.moved || a.attacked || a.mp < 3)) { this.hud.toast('Só é possível Descansar antes de mover ou atacar.', '#c0392b'); return; }
    const g = this.game.currentGuild();
    const heroes = this.game.heroesOf(g.id);
    const res: Record<string, Cell> = {};
    for (const h of heroes) if (!h.alive) {
      const area = this.game.map.startAreas[g.startArea];
      const cells = this.game.resurrectCells(h).filter(c => Object.values(res).filter(x => sameCell(x, c)).length + this.game.unitsAt(c).length < 2);
      const c = cells.find(x => area.some(y => sameCell(x, y))) ?? cells[0];
      if (c) res[h.id] = c;
    }
    this.restDraft = {
      cards: Object.fromEntries(heroes.flatMap(h => h.cards.map(c => [c.uid, h.id]))),
      tokens: Object.fromEntries(heroes.flatMap(h => h.tokens.filter(t => t.type !== 'missao').map(t => [t.id, h.id]))),
      res, picking: null,
    };
    this.refresh();
  }

  private restOptions(): RestOptions {
    const d = this.restDraft!;
    const heroes = this.game.heroesOf(this.game.currentGuild().id);
    const by = (m: Record<string, string>) => Object.fromEntries(heroes.map(h => [h.id, Object.keys(m).filter(k => m[k] === h.id)]));
    return { cards: by(d.cards), tokens: by(d.tokens), resurrect: d.res };
  }

  private paintRest() {
    const d = this.restDraft!;
    const g = this.game.currentGuild();
    const heroes = this.game.heroesOf(g.id);
    const opts = this.restOptions();
    const err = this.game.validateRest(g.id, opts);
    const hl = this.renderer.hl;
    if (d.picking) {
      hl.moveColor = 'green';
      for (const c of this.game.resurrectCells(this.game.unit(d.picking))) hl.move.set(key(c), 0);
    }
    hl.path = Object.values(d.res);
    const pool = heroes.flatMap(h => h.cards);
    const tokPool = heroes.flatMap(h => h.tokens);
    const sel = (cur: string, aliveOnly: boolean, attr: string) => `<select ${attr}>${heroes.filter(h => !aliveOnly || h.alive).map(h => `<option value="${h.id}" ${cur === h.id ? 'selected' : ''}>${HEROES[h.defId].name}</option>`).join('')}</select>`;
    const cols = heroes.map(h => {
      const cards = (opts.cards![h.id] ?? []).map(uid => pool.find(c => c.uid === uid)!);
      const sl = this.game.slotsUsed(h, cards);
      return `<div class="rb-col"><h4>${h.num}. ${HEROES[h.defId].name} <span class="${sl.used > sl.max ? 'bad' : ''}">${sl.used}/${sl.max}</span></h4>
        ${!h.alive ? `<div class="rb-dead">☠ Morto — ressuscita em <b>${d.res[h.id] ? `(${d.res[h.id].c},${d.res[h.id].r})` : '—'}</b> <button data-pick="${h.id}" class="${d.picking === h.id ? 'on' : ''}">${d.picking === h.id ? 'clique no mapa…' : 'Escolher no mapa'}</button></div>` : ''}
        ${h.curse ? `<div class="cp-curse">☠ ${CURSES[h.curse]?.name}</div>` : ''}
        ${cards.map(c => { const cd = CARDS[c.defId]; return `<div class="rb-item" style="border-left:5px solid ${itemColor(c.defId)}" title="${cd.text}"><span>${cd.name}</span>${sel(d.cards[c.uid], false, `data-card="${c.uid}"`)}</div>`; }).join('') || '<i class="muted">sem cartas</i>'}
        ${h.tokens.filter(t => t.type === 'missao').map(t => `<div class="rb-item"><span>★ Marcador de Missão</span><small class="muted">não move</small></div>`).join('')}
        ${Object.keys(d.tokens).filter(id => d.tokens[id] === h.id).map(id => { const t = tokPool.find(x => x.id === id)!; return `<div class="rb-item"><span>${TOKEN_INFO[t.type].name}${t.type === 'bau' ? ` (${t.value})` : ''}</span>${sel(h.id, true, `data-tok="${id}"`)}</div>`; }).join('')}
      </div>`;
    }).join('');
    if (d.picking) {
      const h = this.game.unit(d.picking);
      const el = this.hud.panel('restbox', `<div class="panel-h">💤 Ressuscitar ${HEROES[h.defId].name}: clique num Espaço verde <button id="rb-back">Voltar</button></div>`);
      (el.querySelector('#rb-back') as HTMLElement).onclick = () => { d.picking = null; this.refresh(); };
      this.hud.setHint('Clique num Espaço verde (Área Inicial ou Perto de um Aliado) para ressuscitar o Herói');
      return;
    }
    const el = this.hud.panel('restbox', `
      <div class="panel-h">💤 Descansar a Guilda</div>
      <div class="rb-body">
        <p>Todas as cartas serão restauradas e os Heróis Atordoados se recuperam. Você pode <b>reorganizar as cartas</b> e os marcadores de Exploração entre os Heróis (marcadores de Missão e Maldições não se movem). Heróis mortos ressuscitam na <b>Área Inicial</b> ou <b>Perto de um Aliado</b> que já está no tabuleiro.</p>
        <div class="rb-cols">${cols}</div>
        ${err ? `<div class="rb-err">${err}</div>` : ''}
        <div class="rb-btns"><button id="rb-cancel">Cancelar</button><button class="primary" id="rb-ok" ${err ? 'disabled' : ''}>💤 Descansar</button></div>
      </div>`);
    el.querySelectorAll<HTMLSelectElement>('[data-card]').forEach(s => { s.onchange = () => { d.cards[s.dataset.card!] = s.value; this.refresh(); }; });
    el.querySelectorAll<HTMLSelectElement>('[data-tok]').forEach(s => { s.onchange = () => { d.tokens[s.dataset.tok!] = s.value; this.refresh(); }; });
    el.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => { b.onclick = () => {
      d.picking = b.dataset.pick!;
      this.renderer.fitCells(this.game.resurrectCells(this.game.unit(d.picking)));
      this.refresh();
    }; });
    (el.querySelector('#rb-cancel') as HTMLElement).onclick = () => this.closeRest();
    (el.querySelector('#rb-ok') as HTMLElement).onclick = () => {
      const o = this.restOptions();
      this.closeRest();
      this.act({ type: 'rest', opts: o }, 'descanso');
    };
    this.hud.setHint(d.picking ? 'Clique num Espaço verde para ressuscitar o Herói' : 'Descanso: reorganize e confirme');
  }

  private closeRest() {
    this.restDraft = null;
    this.hud.panel('restbox', null);
    this.refresh();
  }

  private restClick(x: number, y: number) {
    const d = this.restDraft!;
    const cell = this.renderer.pickCell(x, y);
    if (!d.picking || !cell || !this.renderer.hl.move.has(key(cell))) return;
    const others = Object.entries(d.res).filter(([id, c]) => id !== d.picking && sameCell(c, cell)).length;
    if (this.game.unitsAt(cell).length + others >= 2) { this.hud.toast('Máximo de 2 personagens por Espaço.', '#c0392b'); return; }
    d.res[d.picking] = cell;
    d.picking = null;
    this.refresh();
  }

  // ------------------------------------------------------------------
  // MISSÕES: mostrar objetivos no mapa
  // ------------------------------------------------------------------
  private showMission(id: string) {
    play('scan');
    const g = this.game;
    const m = g.s.missions.find(x => x.id === id);
    if (!m) return;
    const cells: Cell[] = [];
    const base = (u: { defId: string }) => u.defId.replace(/\d+$/, '');
    if (m.rule === 'collect_any' || m.rule === 'collect_own' || m.rule === 'carry' || m.rule === 'step_on') {
      for (const [k, toks] of Object.entries(g.s.floor)) if (toks.some(t => t.type === 'missao' && (t.faceUp || g.s.debug.revealTokens))) { const [c, r] = k.split(',').map(Number); cells.push({ c, r }); }
      for (const u of g.onBoard()) if (u.tokens.some(t => t.type === 'missao')) cells.push(u.cell!);
      if (m.rule === 'carry' && !cells.length) this.hud.toast('Os outros Tomos estão escondidos entre os marcadores de Exploração.', '#a983d8');
    } else if (m.rule === 'kill_type') {
      for (const u of g.monstersOnBoard()) if (m.types?.includes(base(u))) cells.push(u.cell!);
    } else if (m.rule === 'kill_count') {
      for (const u of g.monstersOnBoard()) cells.push(u.cell!);
    } else if (m.kind === 'pvp' && m.targetGuild) {
      for (const u of g.heroesOf(m.targetGuild)) if (u.alive && u.cell) cells.push(u.cell);
    }
    if (!cells.length) { this.hud.toast(`${m.name}: nenhum objetivo visível no mapa agora.`, '#c0392b'); return; }
    this.renderer.flashCells(cells);
    this.hud.toast(`${m.name}: ${cells.length} Espaço${cells.length > 1 ? 's' : ''} destacado${cells.length > 1 ? 's' : ''}`, '#e0b43a');
  }

  // ------------------------------------------------------------------
  // MENU DA PARTIDA
  // ------------------------------------------------------------------
  /** Abre a Biblioteca / Configurações por cima da partida (definido em main.ts). */
  openLibrary: () => void = () => {};
  openSettings: () => void = () => {};
  private campaignRestart: (() => void) | null = null;
  private campaignExit: (() => void) | null = null;
  menuOpen = false;
  /** Partida encerrada (voltou ao menu): nada mais roda em segundo plano. */
  private stopped = false;

  /** Sai da partida: para a IA, o cronômetro e as animações. */
  stop() {
    this.stopped = true;
    clearTimeout(this.aiTimer);
    this.battle.close();
    this.hud.panel('deploybox', null);
    this.closeRestSilently();
    this.renderer.reset();
  }

  private canRestart() { return this.mode !== 'client'; }

  openMenu() {
    const el = document.getElementById('gamemenu')!;
    this.menuOpen = true;
    const host = this.canRestart();
    const where = this.campaignEnd ? 'Campanha' : this.mode === 'local' ? 'Modo Teste' : 'Online';
    el.innerHTML = `<div class="gm-box"><h3>☰ ${where}</h3>
      <button id="gm-continue" class="primary">▶ Continuar</button>
      <button id="gm-restart" ${host ? '' : 'disabled'}>🔄 Reiniciar partida <small>${host ? '' : '(só o anfitrião)'}</small></button>
      <button id="gm-turn" ${host && this.turnStart ? '' : 'disabled'}>⏮ Reiniciar turno <small>${host ? '' : '(só o anfitrião)'}</small></button>
      <button id="gm-lib">📚 Biblioteca</button>
      <button id="gm-set">⚙️ Configurações</button>
      <button id="gm-exit">🚪 Sair da partida</button></div>`;
    el.classList.remove('hidden');
    const close = () => { el.classList.add('hidden'); this.menuOpen = false; };
    (el.querySelector('#gm-continue') as HTMLElement).onclick = close;
    el.onclick = e => { if (e.target === el) close(); };
    (el.querySelector('#gm-restart') as HTMLElement).onclick = () => {
      if (!confirm('Reiniciar a partida desde o começo?')) return;
      close();
      this.restartMatch();
    };
    (el.querySelector('#gm-turn') as HTMLElement).onclick = () => { close(); this.restartTurn(); };
    (el.querySelector('#gm-lib') as HTMLElement).onclick = () => { close(); this.openLibrary(); };
    (el.querySelector('#gm-set') as HTMLElement).onclick = () => { close(); this.openSettings(); };
    (el.querySelector('#gm-exit') as HTMLElement).onclick = () => {
      const msg = this.campaignEnd ? 'Sair do cenário? O progresso desta partida será perdido (a campanha continua salva).'
        : this.mode === 'host' ? 'Você é o anfitrião: sair encerra a partida para todos. Sair?' : 'Sair da partida?';
      if (!confirm(msg)) return;
      close();
      this.battle.close();
      this.stop();
      if (this.campaignEnd) { this.campaignEnd = null; this.campaignExit?.(); return; }
      this.leaveOnline();
      this.onExit();
    };
  }

  private restartMatch() {
    this.battle.close();
    this.closeRestSilently();
    clearTimeout(this.aiTimer);
    if (this.campaignEnd) { this.campaignRestart?.(); return; }
    if (this.mode === 'host') { this.restartOnline(); return; }
    this.startTest();
  }

  private restartTurn() {
    if (!this.turnStart) return;
    this.closeRestSilently();
    this.undoTurn();
    if (this.mode === 'host') (this.net as HostSession).startGame(this.game.s);
  }

  private closeRestSilently() { this.restDraft = null; this.hud.panel('restbox', null); }

  /** Anfitrião: nova partida com a mesma sala. */
  private restartOnline() {
    const host = this.net as HostSession;
    const l = host.lobby;
    const game = Game.create(getMap(l.mapId), { players: l.seats.map(s => ({ guild: s.guild, controller: s.ai ? 'ai' as const : 'human' as const, heroes: s.heroes, name: s.team })), deploy: true });
    game.drain();
    host.startGame(game.s);
    this.startOnline(game.s, l, host);
  }

  // ------------------------------------------------------------------
  // CRONÔMETRO
  // ------------------------------------------------------------------
  private campaignBase = 0;
  private clockShown = '';
  private tickClock(dt: number) {
    const g = this.game;
    if (!g) return;
    const visible = !document.getElementById('hud')?.classList.contains('hidden') && !document.hidden;
    if (visible && !this.stopped && !g.s.deploying?.length && !g.s.winner && !this.menuOpen && dt > 0 && dt < 1000) g.s.elapsed = (g.s.elapsed ?? 0) + dt;
    if (!getSettings().clock) { if (this.clockShown) { this.clockShown = ''; this.hud.setClock(''); } return; }
    const html = `<span title="Tempo da partida">⏱ <b>${fmtTime(g.s.elapsed ?? 0)}</b></span>${this.campaignEnd ? `<span title="Tempo total da campanha">🏰 <b>${fmtTime(this.campaignBase + (g.s.elapsed ?? 0))}</b></span>` : ''}`;
    if (html !== this.clockShown) { this.clockShown = html; this.hud.setClock(html); }
  }

  /** Aplica as Configurações (velocidade). */
  applySettings() {
    const st = getSettings();
    if (this.mode !== 'local' || this.campaignEnd) { this.renderer.speed = st.speed; this.hud.speed = st.speed; }
  }

  // ------------------------------------------------------------------
  // Painel do MODO TESTE
  // ------------------------------------------------------------------
  private buildTestPanel(root: HTMLElement) {
    const p = document.createElement('div');
    p.id = 'testpanel';
    p.className = 'panel collapsed';
    p.innerHTML = `
      <div class="panel-h" id="tp-toggle">🧪 Modo Teste <small>(T)</small></div>
      <div class="tp-body">
        <div id="tp-ctl"></div>
        <label>Velocidade <select id="tp-speed"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="4">4x</option></select></label>
        <label>Dados de ataque <select id="tp-atk"><option value="normal">Normais</option><option value="max">Sempre acertam</option><option value="zero">Sempre erram</option></select></label>
        <label>Defesa dos heróis <select id="tp-def"><option value="normal">Normal</option><option value="max">Sempre bloqueia</option><option value="zero">Nunca bloqueia</option></select></label>
        <label class="chk free"><input type="checkbox" id="tp-free"/> <b>🆓 Modo Livre</b> — jogadas ilimitadas</label>
        <div class="tp-note">PM e ataques infinitos, cartas não exaustam, troca de Herói a qualquer momento e a vez não passa para o adversário.</div>
        <label class="chk"><input type="checkbox" id="tp-immortal"/> Heróis imortais (ficam com 1 PV)</label>
        <label class="chk"><input type="checkbox" id="tp-reveal"/> Revelar marcadores de Exploração</label>
        <label class="chk"><input type="checkbox" id="tp-grid"/> Coordenadas + Entradas de Monstro (G)</label>
        <div class="tp-btns">
          <button id="tp-heal">Curar Guilda da vez</button>
          <button id="tp-restore">Restaurar cartas</button>
          <button id="tp-mp">Restaurar PM / Ataque</button>
          <button id="tp-kill">Matar monstro inspecionado</button>
          <button id="tp-spawn">Forçar Entrada de Monstros</button>
          <button id="tp-center">Mapa inteiro (C)</button>
        </div>
        <div class="tp-sec">Repetir jogada</div>
        <div class="tp-btns">
          <button id="tp-undo">↶ Desfazer jogada (Ctrl+Z)</button>
          <button id="tp-turn">⏮ Início do turno</button>
        </div>
        <label class="chk"><input type="checkbox" id="tp-keepdice"/> Repetir com os mesmos dados</label>
        <div class="tp-btns">
        </div>
        <label>Seed <input id="tp-seed" type="text"/></label>
        <div class="tp-btns">
          <button id="tp-new">Nova partida</button>
          <button id="tp-replay">Repetir seed</button>
          <button id="tp-menu">Menu</button>
        </div>
      </div>`;
    root.append(p);
    this.testPanel = p;
    const btn = root.querySelector('#testbtn') as HTMLElement;
    btn.onclick = () => this.toggleTestPanel();
    const $ = <T extends HTMLElement>(id: string) => p.querySelector(`#${id}`) as T;
    $('tp-toggle').onclick = () => p.classList.toggle('collapsed');
    const setCtl = (g: GuildId, v: string) => {
      const gs = this.game.s.guilds[g];
      if (gs) gs.controller = v as 'human' | 'ai';
      this.hud.refresh();
      this.onIdle();
    };
    $('tp-ctl').onchange = e => { const sel = e.target as HTMLSelectElement; if (sel.dataset.g) setCtl(sel.dataset.g as GuildId, sel.value); };
    $<HTMLSelectElement>('tp-speed').onchange = e => {
      const v = Number((e.target as HTMLSelectElement).value);
      this.renderer.speed = v;
      this.hud.speed = v;
    };
    $<HTMLSelectElement>('tp-atk').onchange = e => { this.game.s.debug.attackDice = (e.target as HTMLSelectElement).value as DiceMode; };
    $<HTMLSelectElement>('tp-def').onchange = e => { this.game.s.debug.defenseDice = (e.target as HTMLSelectElement).value as DiceMode; };
    $<HTMLInputElement>('tp-free').onchange = e => {
      const on = (e.target as HTMLInputElement).checked;
      this.game.setFreeMode(on);
      this.hud.toast(on ? '🆓 Modo Livre ligado: jogue quantas vezes quiser' : 'Modo Livre desligado: regras normais', '#a983d8');
      this.refresh();
    };
    $<HTMLInputElement>('tp-immortal').onchange = e => { this.game.s.debug.heroesImmortal = (e.target as HTMLInputElement).checked; };
    $<HTMLInputElement>('tp-reveal').onchange = e => { this.game.s.debug.revealTokens = (e.target as HTMLInputElement).checked; };
    $<HTMLInputElement>('tp-grid').onchange = e => { this.renderer.showGrid = (e.target as HTMLInputElement).checked; };
    const mutate = (fn: () => void) => { if (this.renderer.busy) return; fn(); this.renderer.sync(); this.refresh(); };
    $('tp-heal').onclick = () => mutate(() => { for (const h of this.game.heroesOf(this.game.currentGuild().id)) { h.wounds = 0; h.stunned = false; } });
    $('tp-restore').onclick = () => mutate(() => { for (const h of this.game.heroesOf(this.game.currentGuild().id)) for (const c of h.cards) { c.exhausted = false; c.uses = 0; } });
    $('tp-mp').onclick = () => mutate(() => { const a = this.game.s.activation; if (a) { a.mp = 3; a.moveLocked = false; a.attacked = false; a.moved = false; } });
    $('tp-kill').onclick = () => mutate(() => {
      const id = this.hud.inspected;
      const u = id ? this.game.unit(id) : null;
      if (u?.kind === 'monster' && u.alive) { u.alive = false; u.cell = null; if (this.game.s.entryBoard.length < 5) this.game.s.entryBoard.push(u.id); this.hud.inspected = null; }
      else this.hud.toast('Inspecione um monstro (clique nele) primeiro.', '#c0392b');
    });
    $('tp-spawn').onclick = () => {
      if (this.renderer.busy) return;
      const dead = this.game.units().filter(u => u.kind === 'monster' && !u.alive && !this.game.s.entryBoard.includes(u.id));
      for (const u of dead) if (this.game.s.entryBoard.length < 5) this.game.s.entryBoard.push(u.id);
      if (!this.game.s.entryBoard.length) { this.hud.toast('Tabuleiro de Entrada vazio.', '#c0392b'); return; }
      this.game.spawnMonsters();
      this.renderer.enqueue(this.game.drain());
    };
    $('tp-center').onclick = () => this.renderer.fit();
    $('tp-undo').onclick = () => this.undo();
    $('tp-turn').onclick = () => this.undoTurn();
    $<HTMLInputElement>('tp-keepdice').onchange = e => { this.keepDice = (e.target as HTMLInputElement).checked; };
    $('tp-new').onclick = () => this.startTest();
    $('tp-replay').onclick = () => {
      const v = Number($<HTMLInputElement>('tp-seed').value);
      this.startTest(Number.isFinite(v) ? v | 0 : undefined);
    };
    $('tp-menu').onclick = () => { this.stop(); this.onExit(); };
  }

  /** Modo Teste: botão 🧪 na barra de cima abre/fecha o menu de opções. */
  private setTestUI(on: boolean) {
    this.testPanel.classList.toggle('hidden', !on);
    if (!on) this.testPanel.classList.add('collapsed');
    const btn = document.getElementById('testbtn');
    btn?.classList.toggle('hidden', !on);
    btn?.classList.toggle('on', on && !this.testPanel.classList.contains('collapsed'));
  }
  private toggleTestPanel() {
    const open = this.testPanel.classList.toggle('collapsed') === false;
    document.getElementById('testbtn')?.classList.toggle('on', open);
  }

  private focusActive() {
    const h = this.game.activeHero() ?? this.game.heroesOf(this.game.currentGuild().id).find(x => x.alive);
    if (h?.cell) this.renderer.focus([h.cell], this.renderer.cam.zoom);
  }

  /** Volta ao estado salvo. Mantém controladores e opções de teste atuais. */
  private restore(state: string, msg: string) {
    clearTimeout(this.aiTimer);
    this.battle.close();
    const debug = this.game.s.debug;
    const controllers = Object.fromEntries(this.game.guilds().map(g => [g.id, g.controller]));
    const s = JSON.parse(state) as typeof this.game.s;
    s.debug = debug;
    for (const g of Object.values(s.guilds)) if (g && controllers[g.id]) g.controller = controllers[g.id] as 'human' | 'ai';
    if (!this.keepDice) s.rng = (Math.random() * 2 ** 31) | 0; // nova sorte nos dados
    this.game.s = s;
    this.game.drain();
    this.deciding = false;
    this.ais = {};
    document.getElementById('gameover')?.remove();
    this.hud.inspected = null;
    this.hud.selectedCard = null;
    this.renderer.reset();
    this.hud.syncCemetery();
    this.hud.toast(msg, '#a983d8');
    this.hud.log(msg, '#d7b8ff');
  }

  undo() {
    const h = this.history.pop();
    if (!h) { this.hud.toast('Nada para desfazer.', '#c0392b'); return; }
    this.restore(h.state, `↶ Jogada desfeita${this.keepDice ? ' (mesmos dados)' : ' (dados novos)'}`);
  }

  undoTurn() {
    if (!this.turnStart) { this.hud.toast('Nenhum início de turno salvo.', '#c0392b'); return; }
    this.history.length = Math.min(this.history.length, this.turnStart.histLen); // descarta jogadas do turno
    this.restore(this.turnStart.state, '⏮ Voltou ao início do turno');
  }

  private initialSeed = 0;
  private updateTestPanel() {
    const p = this.testPanel;
    const g = this.game;
    if (!g) return;
    (p.querySelector('#tp-ctl') as HTMLElement).innerHTML = g.s.guildOrder.map(id => {
      const gs = g.guild(id);
      return `<label><span class="dot" style="background:${gs.color}"></span> ${guildShort(id)} <select data-g="${id}"><option value="human" ${gs.controller === 'human' ? 'selected' : ''}>Você</option><option value="ai" ${gs.controller === 'ai' ? 'selected' : ''}>IA</option></select></label>`;
    }).join('');
    (p.querySelector('#tp-atk') as HTMLSelectElement).value = g.s.debug.attackDice;
    (p.querySelector('#tp-def') as HTMLSelectElement).value = g.s.debug.defenseDice;
    (p.querySelector('#tp-immortal') as HTMLInputElement).checked = g.s.debug.heroesImmortal;
    (p.querySelector('#tp-free') as HTMLInputElement).checked = !!g.s.debug.freeMode;
    (p.querySelector('#tp-reveal') as HTMLInputElement).checked = g.s.debug.revealTokens;
    (p.querySelector('#tp-grid') as HTMLInputElement).checked = this.renderer.showGrid;
    if (!this.initialSeed || this.initialSeed !== g.s.rng) {
      this.initialSeed = g.s.rng;
      (p.querySelector('#tp-seed') as HTMLInputElement).value = String(g.s.rng);
    }
  }

  private showGameOver() {
    const g = this.game;
    if (!g.s.winner) return;
    const el = document.createElement('div');
    el.id = 'gameover';
    const rows = g.guilds().slice().sort((a, b) => b.coins - a.coins).map(gs => `
      <tr><td><span class="dot" style="background:${gs.color}"></span> ${gs.name}</td><td>${gs.missions.length}</td><td>${gs.monsterKills}</td>
      <td>${g.heroesOf(gs.id).reduce((s, h) => s + h.deaths, 0)}</td><td><b>${gs.coins}</b></td></tr>`).join('');
    const w = g.guild(g.s.winner);
    el.innerHTML = `<div class="go-box">
      <div class="go-title" style="color:${GUILDS[w.id].light}">Vitória da ${guildShort(w.id)}!</div>
      <div class="go-sub">${this.isMine(w.id) ? `Parabéns! Sua Guilda venceu em ${g.map.name}.` : `${this.hud.nameOf(w.id) ?? 'A Guilda adversária'} cumpriu as Missões primeiro.`}</div>
      <table><tr><th>Guilda</th><th>Missões</th><th>Monstros</th><th>Mortes</th><th>Moedas*</th></tr>${rows}</table>
      <div class="go-note">* Inclui 1 moeda por Missão cumprida e o valor dos Baús de Tesouro.</div>
      <div class="go-btns">${this.campaignEnd ? '<button id="go-camp" class="primary">Continuar campanha ▶</button>' : this.mode === 'local' ? '<button id="go-again" class="primary">Jogar novamente</button><button id="go-menu">Menu</button>' : '<button id="go-menu">Menu</button>'}</div></div>`;
    document.body.append(el);
    const again = el.querySelector('#go-again') as HTMLElement | null;
    if (again) again.onclick = () => { el.remove(); this.startTest(); };
    const menu = el.querySelector('#go-menu') as HTMLElement | null;
    if (menu) menu.onclick = () => { el.remove(); this.stop(); this.leaveOnline(); this.onExit(); };
    const camp = el.querySelector('#go-camp') as HTMLElement | null;
    if (camp) camp.onclick = () => { el.remove(); const end = this.campaignEnd; this.campaignEnd = null; this.stop(); end?.(this.game); };
  }
}

export { sameCell };
export type { Cell };

const PAN_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
