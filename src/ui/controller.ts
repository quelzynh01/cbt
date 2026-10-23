import { SimpleAI, type AILevel } from '../ai/ai';
import { gameConfirm } from './dialog';
import { bindInvEditor, invEditorHtml, type BagTok, type InvItem, type InvOptions } from './inventoryEditor';
import { tokenImageId, tokenUrl } from '../render/tokens';
import { loadGame } from './mapLoading';
import { showRoulette } from './roulette';
import { actingGuild, applyAction, type Action } from '../engine/actions';
import type { GameState } from '../engine/types';
import { diceSync } from './diceSync';
import type { ClientSession, HostSession, Lobby, Session, SessionEvents, UndoPoll } from '../net/net';
import { key, parseKey, sameCell } from '../engine/board';
import { setCursor } from '../render/cursors';
import { CARDS, GUILDS, HEROES, MONSTERS } from '../engine/data';
import { type TestConfig, loadTestConfig } from './testConfig';
import { Game } from '../engine/game';
import { getMap } from '../engine/maps';
import type { Cell, DiceMode, GameEvent, GuildId, Token } from '../engine/types';
import { Renderer } from '../render/renderer';
import { BattlePanel } from './battle';
import { Hud, daTime, guildShort, toggleView } from './hud';
import { fmtTime, getSettings, onSettings } from './settings';
import { CURSES } from '../engine/cards';
import { TOKEN_INFO } from '../engine/data';
import { NeedDecision, type ChoiceRequest, type DecisionRequest, type RestOptions } from '../engine/game';

/** Decisão automática (jogador desconectou, demorou ou deixou a Rerrolagem automática). */
const AUTO_PICK = -999;
import { itemCard, itemColor, medal, paintCardArt } from './cardview';
import { play } from '../audio/sfx';

/** Liga motor + renderer + HUD + IA + rede. Modos: local (teste), anfitrião e cliente (online). */
/** Opção do menu do clique (Atacar / Mover). */
interface ClickOpt { kind: 'atk' | 'move'; img?: string; icon?: string; title: string; name: string; info: string; run: () => void }

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
  private vDoors: string[] = []; // portas que o Monstro da Vingança abre/fecha antes de mover
  private pDest: Cell | null = null; // destino do Monstro ativado pela Lápide
  private bootWarned = ''; // ativação em que já avisamos da bota do Aliado
  private pRepick = false; // Lápide: voltou para escolher outro Monstro (só na tela)
  private puppetShown = false; // o quadro da esquerda está mostrando o Monstro da Lápide
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
      isMineGuild: g => this.isMine(g),
      inspect: id => this.hud.showCard(id),
    });
    this.hud.busy = () => this.renderer.busy;
    this.renderer.hooks = {
      onEvent: e => {
        this.followEvent(e);
        this.warnTarget(e);
        // Tela de batalha: segura a fila de animações até o jogador clicar em Continuar
        const humanInvolved = this.game.guilds().some(g => this.isMine(g.id));
        const bm = getSettings().battle;
        const minePart = e.t === 'attack' && ((!!e.ctl && this.isMine(e.ctl)) || [e.attackerId, ...e.targets.map(t => t.id)].some(id => { const u = this.game.unit(id); return u.kind === 'hero' && this.isMine(u.guild!); }));
        const showBattle = e.t === 'attack' && (bm === 'never' ? false : bm === 'mine' ? minePart : (humanInvolved || this.renderer.speed < 4));
        this.hud.onEvent(e, showBattle);
        // se a rolagem já começou na tela de combate do centro (Rerrolagem), continua nela — sem abrir outra tela
        if (showBattle && e.t === 'attack' && (this.battle.hasCarry || !this.hud.hasCarry)) {
          this.battle.playAttack(e, () => this.strikeThen(e, minePart));
          return true;
        }
        // animações no centro da tela: o jogo espera elas acabarem
        if (e.t === 'attack') {
          // primeiro a rolagem (ataque e defesa) no centro da tela; com o resultado, a investida / o projétil
          this.hud.centerDice(e, () => this.strikeThen(e, minePart));
          return true;
        }
        if (e.t === 'pickup') {
          // todos os marcadores do mesmo Espaço aparecem juntos
          const all = [e, ...this.renderer.takePickups(e.heroId)];
          this.hud.flipTokens(e.heroId, all.map(x => ({ token: x.token, hidden: !!x.hidden })), () => this.renderer.release());
          return true;
        }
        if (e.t === 'reward' || e.t === 'title') { this.hud.showAward(e, () => this.renderer.release()); return true; }
        if (e.t === 'useToken') { this.hud.showUsed(e.heroId, e.token, () => this.renderer.release()); return true; }
        if (e.t === 'spawnRoll') {
          // a câmera vai até a Entrada que os dados indicaram (mesmo ocupada); sem Entrada com esses símbolos, mostra todas
          const follow = getSettings().view === 'players';
          this.hud.spawnRoll(e, () => this.renderer.release(), follow ? () => {
            const at = e.cell ?? e.target;
            if (at) this.renderer.glideCells([at]);
            else if (this.game.s.entryMarkers.length) this.renderer.glideCells(this.game.s.entryMarkers.map(m => m.cell));
          } : undefined);
          return true;
        }
        if (e.t === 'gameover') setTimeout(() => this.showGameOver(), 900);
        if (e.t === 'turn') {
          this.hud.refresh();
          // sua vez: já deixa selecionado (com o "▶ Ativar") o último Herói que você ativou — ou o primeiro que pode jogar —
          // e a câmera vai até ele; sem nenhum disponível, a câmera mostra os seus Heróis
          if (this.isMine(e.guild) && !this.game.s.deploying?.length) {
            const g = this.game;
            const ready = (id: string | undefined) => { const u = id ? g.s.units[id] : null; return !!u && u.alive && !!u.cell; };
            const last = g.s.lastHero?.[e.guild];
            const pick = ready(last) ? last! : g.heroesOf(e.guild).find(h => ready(h.id))?.id;
            if (pick && !g.s.activation) {
              this.renderer.glideCells([g.unit(pick).cell!]);
              if (this.renderer.camGoal) this.renderer.camGoal.y += window.innerHeight < 560 ? 70 : 50;
              this.hud.pendingActivate = pick;
              this.hud.inspected = pick;
              this.hud.refresh();
            } else {
              const cells = g.heroesOf(e.guild).filter(h => h.alive && h.cell).map(h => h.cell!);
              if (cells.length) this.renderer.focus(cells, this.renderer.cam.zoom);
            }
          }
        }
        return false;
      },
      onIdle: () => this.onIdle(),
    };
    // nada mais a fazer no turno: o botão "Encerrar Turno" pisca
    this.hud.nothingLeft = () => !!this.game && this.isHumanTurn() && !this.renderer.busy && !this.game.s.pending && !!this.game.s.activation && !this.game.freeMode && this.leftovers().length === 0;
    this.bindInput(canvas);
    // celular: botões de zoom (no lugar da roda do mouse / pinça)
    const zoomBy = (f: number) => { const v = this.renderer.view(); this.renderer.zoomAt(v.cx, v.cy, f); };
    (hudRoot.querySelector('#zoom-in') as HTMLElement).onclick = () => zoomBy(1.25);
    (hudRoot.querySelector('#zoom-out') as HTMLElement).onclick = () => zoomBy(1 / 1.25);
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
      activate: id => this.selectHero(id),
      confirmActivate: id => this.doActivate(id),
      pick: id => {
        const u = this.game.unit(id);
        if (u.cell) {
          this.renderer.glideCells([u.cell]);
          // o Herói fica um pouco abaixo do centro, para não ficar atrás do painel "Ativar"
          if (this.renderer.camGoal) this.renderer.camGoal.y += window.innerHeight < 560 ? 70 : 50;
        }
        this.selectHero(id);
      },
      selectCard: uid => { this.hud.selectedCard = uid; this.refresh(); },
      useToken: id => this.act({ type: 'token', tokenId: id }),
      useCard: (heroId, cardUid) => this.useCard(heroId, cardUid),
      usePower: heroId => this.usePower(heroId),
      revealTomb: () => { if (this.isHumanTurn() && !this.renderer.busy) this.act({ type: 'tomb' }); },
      endTurn: () => this.tryEndTurn(),
      rest: () => this.openRest(),
      cancelAttack: null,
      cover: async id => {
        const g = this.game, h = g.unit(id);
        if (!h.covered || !this.isHumanTurn()) { this.hud.toast('Escolha no seu turno.', '#c0392b'); return; }
        const opts = h.cards.filter(c => !c.exhausted).map(c => ({ id: c.uid, html: `🃏 ${g.cardDef(c).name}` }));
        const pick = await this.hud.choose('☠ Debaixo da Maldição', `Hoje a Maldição cobre <b>${g.cardDef(h.covered).name}</b>. Qual carta fica debaixo dela (indisponível)?`, opts);
        if (pick && this.game === g) this.act({ type: 'cover', heroId: id, cardUid: pick }, 'Maldição');
      },
      inspect: id => {
        this.hud.inspected = id;
        // a câmera vai até o personagem (como quando escolhe um Herói seu)
        const u = id ? this.game.unit(id) : null;
        if (u?.cell) this.renderer.glideCells([u.cell]);
        this.refresh();
      },
      mission: id => this.showMission(id),
      menu: () => this.openMenu(),
    });
  }

  /** Partida de um cenário da campanha. */
  private campaignEnd: ((g: Game) => void) | null = null;
  /** Nível da IA na campanha (fora dela vale a Configuração). */
  private campaignAI: AILevel | null = null;
  private aiFor(g: GuildId): SimpleAI { return (this.ais[g] ??= new SimpleAI(this.campaignEnd && this.campaignAI ? this.campaignAI : getSettings().ai)); }

  /** Salvamento automático da partida (campanha local; anfitrião online): recebe o estado a cada poucos segundos e ao sair. */
  autosave: ((s: GameState, json: string) => void) | null = null;
  private savedJson = '';
  private saveClock = 0;
  /** Grava o estado atual (se mudou) — só quem roda as regras (local ou anfitrião). */
  flushSave() {
    const g = this.game;
    if (!this.autosave || !g || this.mode === 'client') return;
    const json = JSON.stringify(g.s);
    if (json === this.savedJson) return;
    this.savedJson = json;
    this.autosave(g.s, json);
  }

  startCampaign(mapId: string, opts: Omit<Parameters<typeof Game.create>[1], 'seed'>, onEnd: (g: Game) => void, info: { baseMs: number; onExit: () => void; aiLevel?: AILevel; roulette?: boolean; scenario?: number; resume?: GameState; autosave?: (s: GameState, json: string) => void }) {
    this.campaignAI = info.aiLevel ?? null;
    this.campaignScenario = info.scenario ?? 0;
    this.hud.scenarioLabel = this.campaignScenario ? `Cenário ${this.campaignScenario}/6` : '';
    this.leaveOnline(false);
    this.mode = 'local';
    this.campaignEnd = onEnd;
    this.campaignBase = info.baseMs;
    this.campaignExit = info.onExit;
    this.campaignRestart = () => this.startCampaign(mapId, opts, onEnd, { ...info, resume: undefined, roulette: false });
    this.autosave = info.autosave ?? null;
    this.savedJson = '';
    this.closeRestSilently();
    this.setTestUI(false);
    this.onlinePanel.classList.add('hidden');
    this.hud.setModeBadge('CAMPANHA');
    this.stopped = false;
    // partida salva: continua de onde parou
    this.game = info.resume ? new Game(getMap(mapId), info.resume) : Game.create(getMap(mapId), { ...opts, deploy: true });
    this.ais = {};
    this.bindHud();
    this.applySettings();
    this.renderer.setGame(this.game);
    this.loadAssets();
    this.history = [];
    this.turnStart = null;
    this.renderer.enqueue(this.game.drain());
    this.hud.log(info.resume ? `${this.game.map.name} — partida salva: continuando na rodada ${this.game.s.turn}.` : `${this.game.map.name} — Monstros Nível ${this.game.s.level}. ${guildShort(this.game.s.guildOrder[0])} começa.`);
    document.getElementById('gameover')?.remove();
    this.deploySel = null;
    this.deployFocused = null;
    this.focusStart();
    this.onIdle();
    // 1º cenário da campanha: o jogador inicial é sorteado (p.14) — a roleta mostra quem começa
    if (info.roulette && !info.resume) this.rouletteFor(this.game);
    this.announceTitles();
  }

  private rouletteShown = '';

  /** Segurando Alt: a carta do personagem embaixo do mouse (como a lupa), troca ao passar em outro e fecha ao soltar. */
  private altHeld = false;
  private altPeek() {
    if (!this.game || !this.altHeld) return;
    const id = this.renderer.pickUnit(this.mouse.x, this.mouse.y);
    const u = id ? this.game.unit(id) : null;
    if (u && u.alive) this.hud.peekCard(u.id);
    else this.hud.closePeek();
  }

  /** Começo da partida: mostra para todos quem tem Título com vantagem neste mapa (depois do carregamento e da roleta). */
  private advShown = '';
  private announceTitles() {
    const g = this.game;
    if (!g || g.s.turn !== 1 || !g.s.deploying?.length) return;
    const list = g.guilds().map(x => ({ name: this.hud.nameOf(x.id) ?? guildShort(x.id), color: x.color, titles: g.activeTitles(x.id) })).filter(x => x.titles.length);
    if (!list.length) return;
    // online: uma vez por cenário (reconectar não mostra de novo)
    const k = `${this.lobby?.code ?? ''}:${this.lobby?.scenario ?? this.campaignScenario}:${g.s.mapId}`;
    if (this.mode !== 'local') { if (this.advShown === k) return; this.advShown = k; }
    const run = () => {
      if (this.game !== g) return;
      if (this.assetsLoading) { this.afterLoad.push(run); return; }
      if (document.getElementById('roulette') || document.getElementById('maploading')) { setTimeout(run, 400); return; }
      this.hud.showAdvantage(list);
    };
    setTimeout(run, 500);
  }

  /** Carregando a arte da partida (tela do mapa): a IA e a roleta esperam. */
  private assetsLoading = false;
  private afterLoad: (() => void)[] = [];
  private loadAssets() {
    const g = this.game;
    this.assetsLoading = true;
    this.afterLoad = [];
    void loadGame(g).then(() => {
      if (this.game !== g) return;
      this.assetsLoading = false;
      const fns = this.afterLoad;
      this.afterLoad = [];
      for (const f of fns) f();
      this.onIdle();
    });
  }
  /** Roleta com as Guildas (cores e nomes), parando em quem joga primeiro. */
  private rouletteFor(g: Game) {
    if (this.assetsLoading) { this.afterLoad.push(() => this.rouletteFor(g)); return; }
    const gs = g.guilds();
    void showRoulette(gs.map(x => ({ name: this.hud.nameOf(x.id) ?? guildShort(x.id), color: x.color })), Math.max(0, gs.findIndex(x => x.id === g.s.guildOrder[0])));
  }

  /** Configuração do último Modo Teste (para "Nova partida" e "Jogar novamente"). */
  private testCfg: TestConfig = loadTestConfig();
  startTest(seed?: number, cfg: TestConfig = this.testCfg) {
    this.leaveOnline(false);
    this.autosave = null;
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
      players: cfg.teams.map((t, i) => ({ guild: t.guild, controller: t.controller, name: t.name, heroes: i === 0 ? cfg.heroes : undefined, cards: i === 0 ? cfg.cards : undefined, curses: i === 0 ? cfg.curses : undefined })),
      titles: cfg.titles,
      fixedOrder: true,
      deploy: true,
      diceCap: !!cfg.diceCap,
      allHeroes: !!cfg.allHeroes,
    });
    if (debug) this.game.s.debug = { ...debug };
    this.ais = {};
    this.bindHud();
    this.renderer.setGame(this.game);
    this.loadAssets();
    this.history = [];
    this.turnStart = null;
    this.focusStart();
    this.renderer.enqueue(this.game.drain());
    this.hud.log(`Nova partida — seed ${this.game.s.rng}. ${guildShort(this.game.s.guildOrder[0])} começa.`);
    this.updateTestPanel();
    document.getElementById('gameover')?.remove();
    this.onIdle();
    this.announceTitles();
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

  /** Online (anfitrião): a Guilda é de um jogador conectado em outro computador (a decisão vai pela rede). */
  private remoteHuman(gid: GuildId): boolean {
    if (this.mode !== 'host' || this.isMine(gid) || this.game.guild(gid).controller !== 'human') return false;
    const seat = this.lobby?.seats.find(s => s.guild === gid);
    return !!seat && !seat.ai && seat.connected;
  }

  private installHook() {
    // decisões no meio da jogada: de quem joga neste computador (aqui) ou, no anfitrião, dos outros jogadores (pela rede)
    this.game.rerollHook = req => {
      const gid = req.guild ?? this.game.unit(req.heroId).guild;
      if (this.mode === 'client' || !gid) return 'auto';
      const here = this.isMine(gid) && getSettings().reroll !== 'auto';
      if (!here && !this.remoteHuman(gid)) return 'auto';
      if (this.decisionQueue.length) { const d = this.decisionQueue.shift()!; return d[0] === AUTO_PICK ? 'auto' : d; }
      throw new NeedDecision(req);
    };
    // empurrão da Rajada de Vento e alvo adicional (Raio Nova, Fender): quem atacou escolhe
    this.game.choiceHook = req => {
      if (this.mode === 'client' || (!this.isMine(req.guild) && !this.remoteHuman(req.guild))) return 'auto';
      if (this.decisionQueue.length) { const d = this.decisionQueue.shift()!; return d[0] === AUTO_PICK ? 'auto' : d[0] ?? -1; }
      throw new NeedDecision(req);
    };
  }

  /** Escolha no meio do ataque: painel igual ao da Reação + destaques no mapa. */
  private choicePick: { req: ChoiceRequest; resolve: (i: number) => void } | null = null;
  private askChoice(req: ChoiceRequest): Promise<number> {
    return new Promise(res => {
      this.choicePick = { req, resolve: i => { this.choicePick = null; this.hud.monsterPanel(null).classList.remove('over'); this.clearHighlights(); res(i); } };
      this.refresh();
    });
  }

  private paintChoice() {
    const { req, resolve } = this.choicePick!;
    const g = this.game;
    const hl = this.renderer.hl;
    const h = g.unit(req.heroId);
    let html: string;
    if (req.choice === 'confirm') {
      hl.activeUnit = h.id;
      html = `<div class="panel-h">⚡ ${req.source}</div>
        <div class="mc-body">
          <p>${req.text ?? ''}</p>
          ${req.faces ? `<p class="mc-legend">Dados: ${req.faces.map(f => ({ crit: '✷', melee: '⚔', ranged: '➶', shield: '⛨', blank: '–' } as Record<string, string>)[f]).join(' ')}</p>` : ''}
          <div class="mc-btns"><button class="primary" data-i="0">Sim</button><button id="ch-none">Não</button></div>
        </div>`;
      this.hud.setHint(`${req.source}: escolha Sim ou Não`);
    } else if (req.choice === 'reward') {
      hl.activeUnit = h.id;
      const nc = req.newCard!;
      const swaps = (req.cards ?? []).map((id, i) => `<button class="primary" data-i="${i}">🔁 Trocar <b>${CARDS[id]?.name ?? id}</b></button>`).join('');
      const gives = (req.units ?? []).map((id, i) => `<button data-i="${(req.cards ?? []).length + i}">🎁 Dar para ${g.name(g.unit(id))}</button>`).join('');
      html = `<div class="panel-h">🃏 Recompensa: ${CARDS[nc]?.name ?? nc}</div>
        <div class="mc-body">
          <p>${req.text ?? ''}</p>
          <div class="rw-card">${itemCard(nc)}</div>
          <div class="mc-btns">${swaps}${gives}<button id="ch-none">📦 Guardar sem Herói</button></div>
        </div>`;
      this.hud.setHint('Inventário cheio: troque uma carta, dê a um Aliado ou guarde a nova sem Herói');
      const el1 = this.hud.monsterPanel(html);
      paintCardArt(el1);
      el1.querySelectorAll<HTMLElement>('[data-i]').forEach(b => { b.onclick = () => resolve(Number(b.dataset.i)); });
      (el1.querySelector('#ch-none') as HTMLElement).onclick = () => resolve(-1);
      return;
    } else if (req.choice === 'loot') {
      hl.activeUnit = h.id;
      const opts = (req.tokens ?? []).map((t, i) => { const img = tokenImageId(t); return `<button class="primary lt-opt" data-i="${i}">${img ? `<img src="${tokenUrl(img)}"/>` : ''}${TOKEN_INFO[t.type]?.name ?? t.type}${t.type === 'bau' ? ` (${t.value})` : ''}</button>`; }).join('');
      html = `<div class="panel-h">🎒 Saque</div>
        <div class="mc-body">
          <p>${req.text ?? 'Escolha 1 marcador.'}</p>
          <div class="mc-btns lt-btns">${opts}</div>
        </div>`;
      this.hud.setHint('Saque: escolha qual marcador vem para o seu Herói');
      const el0 = this.hud.monsterPanel(html);
      el0.classList.toggle('over', this.battle.isOpen);
      el0.querySelectorAll<HTMLElement>('[data-i]').forEach(b => { b.onclick = () => resolve(Number(b.dataset.i)); });
      return;
    } else if (req.choice === 'push') {
      const t = g.unit(req.targetId!);
      hl.moveColor = 'purple';
      hl.activeUnit = t.id;
      for (const c of req.cells!) hl.move.set(key(c), 0);
      const wind = req.source === 'Rajada de Vento';
      html = `<div class="panel-h">${wind ? '🌪' : '⚡'} ${req.source} — ${req.targetId === req.heroId ? `para onde ${g.name(t)} vai?` : wind || req.source === 'Tiro Explosivo' ? `você empurra ${g.name(t)}` : `onde ${g.name(t)} aparece?`}</div>
        <div class="mc-body">
          <p>${req.text ?? `<b>${g.name(h)}</b> acertou <b>${g.name(t)}</b>. Escolha para onde ele é empurrado (até ${wind ? 3 : 2} Espaços, sem Reação de Alerta), como se você o movesse.`}</p>
          <p class="mc-legend"><span class="pu">■</span> clique num Espaço roxo</p>
          <div class="mc-btns"><button id="ch-none">${wind || req.source === 'Tiro Explosivo' ? 'Não empurrar' : 'Ficar onde está'}</button></div>
        </div>`;
      this.hud.setHint(`${req.source}: clique no Espaço roxo`);
    } else {
      hl.activeUnit = h.id;
      hl.attackUnits = new Set(req.units);
      const opts = req.units!.map((id, i) => { const u = g.unit(id); return `<button class="primary" data-i="${i}"><img class="cf-face" src="${this.hud.portraitOf(u)}"/> ${g.name(u)}</button>`; }).join('');
      html = `<div class="panel-h">✷ ${req.source}${req.text ? '' : ' — escolha quem mais é atingido'}</div>
        <div class="mc-body">
          <p>${req.text ?? `${req.source === 'Fender' ? `<b>${g.name(h)}</b> pode atingir também um Inimigo Perto dele.` : `Você rolou ✷: <b>${req.source}</b> pode atingir também um Inimigo Perto do alvo.`} Escolha qual:`}</p>
          <div class="mc-btns">${opts}<button id="ch-none">Ninguém</button></div>
          ${this.battle.isOpen ? '' : '<p class="mc-legend">ou clique no Inimigo marcado no mapa</p>'}
        </div>`;
      this.hud.setHint(`${req.source}: escolha quem mais é atingido`);
    }
    const el = this.hud.monsterPanel(html);
    el.classList.toggle('over', this.battle.isOpen);
    el.querySelectorAll<HTMLElement>('[data-i]').forEach(b => { b.onclick = () => resolve(Number(b.dataset.i)); });
    (el.querySelector('#ch-none') as HTMLElement).onclick = () => resolve(-1);
  }

  /** Roda `fn`; se precisar de decisão, pergunta e repete. `done` é chamado (talvez depois) com o resultado. */
  private withDecisions(fn: () => boolean, done: (ok: boolean) => void) {
    const snap = JSON.stringify(this.game.s);
    const decided: number[][] = [];
    // eventos que já foram animados antes de uma decisão (ex.: o ataque, antes de a Vingança pedir a sua Defesa)
    let shown = 0;
    const attempt = () => {
      // refaz a jogada do começo (o RNG é o mesmo, então os dados também)
      if (decided.length) this.game.s = JSON.parse(snap);
      this.decisionQueue = decided.slice();
      try {
        const ok = fn();
        this.deciding = false;
        if (shown) { const all = this.game.drain(); this.game.requeue(all.slice(shown)); }
        done(ok);
      } catch (e) {
        if (!(e instanceof NeedDecision)) throw e;
        const evs = this.game.drain();
        const fresh = evs.slice(shown);
        // o estado fica como está (no meio da jogada) enquanto o jogador decide: assim o mapa não "desfaz"
        // o que já foi animado (ex.: o Monstro que andou para a Vingança não volta para trás)
        this.deciding = true;
        this.clearHighlights();
        this.hud.tooltip(null);
        const ask = () => {
          const req = e.req;
          // decisão de outro jogador (online): pergunta pela rede e espera a resposta
          const owner = 'choice' in req ? req.guild : req.guild ?? this.game.unit(req.heroId).guild;
          if (owner && this.remoteHuman(owner)) {
            this.hud.setHint(`Aguardando ${this.hud.nameOf(owner) ?? guildShort(owner)} decidir…`);
            void (this.net as HostSession).askDecision(owner, req).then(pick => { decided.push(pick ?? [AUTO_PICK]); attempt(); });
            return;
          }
          if ('choice' in req) { this.askChoice(req).then(i => { decided.push([i]); attempt(); }); return; }
          this.hud.setHint('Escolha os dados para rerrolar');
          // Rerrolagem na própria tela de batalha (a mesma tela continua com a rolagem); sem tela de batalha, no centro
          (getSettings().battle !== 'never' ? this.battle.decide(req) : this.hud.askDecision(req)).then(idx => { decided.push(idx); attempt(); });
        };
        // o que aconteceu antes desta decisão é mostrado primeiro (na ordem do jogo)
        if (fresh.some(x => x.t !== 'log')) {
          shown = evs.length;
          if (this.mode === 'host') (this.net as HostSession).update(fresh, JSON.parse(JSON.stringify(this.game.s)));
          this.renderer.enqueue(fresh);
          const waitIdle = () => { if (this.renderer.busy) requestAnimationFrame(waitIdle); else ask(); };
          requestAnimationFrame(waitIdle);
        } else ask();
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
    // jogadas guardadas para "Desfazer jogada" (no computador e pelo anfitrião online)
    const snap = JSON.stringify(this.game.s);
    // ataque do seu Herói: dá para cancelar antes de rolar os dados (volta para este estado)
    this.preAttack = a.type === 'attack' ? { snap, histLen: this.history.length } : null;
    this.hud.actions.cancelAttack = this.preAttack ? () => this.cancelAttack() : null;
    const guild = (a.type === 'place' || a.type === 'placeMany' || a.type === 'ready') ? this.myDeployGuild() : actingGuild(this.game);
    if (!guild) return false;
    let result: boolean | null = null;
    this.withDecisions(() => applyAction(this.game, guild, a), ok => {
      result = ok;
      if (ok && this.mode !== 'client') {
        const names: Record<string, string> = { move: 'movimento', attack: 'ataque', activate: 'ativação', door: 'porta', token: 'marcador', card: 'carta', rest: 'descanso', end: 'fim do turno', vengeance: 'Vingança' };
        this.history.push({ label: label === 'jogada' ? names[a.type] ?? label : label, state: snap });
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

  /** Pode ativar este Herói agora? (da vez, vivo, não exausto; troca só antes de agir, ou pela Bênção / Grito de Guerra) */
  private canActivateNow(id: string): boolean {
    const g = this.game;
    const u = g.unit(id);
    const a = g.s.activation;
    if (!this.isHumanTurn() || !u || u.kind !== 'hero' || u.guild !== g.currentGuild().id || !u.alive || !u.cell) return false;
    if (g.s.extraTurnOn && u.id === g.s.extraHero && !g.freeMode) return false; // turno adicional: outro Herói, não quem usou a poção
    if (u.id === a?.heroId) return false;
    if ((g.s.activatedThisTurn ?? []).includes(u.id) && !g.activationFresh()) return g.freeMode;
    return !a || g.activationFresh() || g.canBless(u.id) || g.freeMode;
  }

  /** Clique no seu Herói: só seleciona — o botão "▶ Ativar" confirma. */
  private selectHero(id: string) {
    if (!this.canActivateNow(id)) { this.hud.inspected = id; this.hud.pendingActivate = null; this.refresh(); return; }
    this.hud.pendingActivate = id;
    this.hud.inspected = id;
    play('scan');
    this.refresh();
  }

  private doActivate(id: string) {
    this.hud.pendingActivate = null;
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
    if (this.stopped || this.assetsLoading) return;
    this.hud.syncMissions(); // as animações acabaram: o placar mostra tudo
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
    this.savedJson = '';
    this.net = session;
    this.lobby = lobby;
    this.mode = session.isHost ? 'host' : 'client';
    // votação aprovada: o anfitrião volta o turno para todos
    if (session.isHost) session.onUndoPassed = () => { if (!this.history.length) return false; this.undoMove(); return true; };
    this.myGuild = lobby.seats.find(s => s.clientId === session.me)?.guild ?? null;
    this.waitingNet = false;
    this.stopped = false;
    // estado novo (começo, reconexão ou turno voltado): fecha combate e rolagem que estavam no meio
    this.battle.close();
    this.hud.resetDice();
    this.deciding = false;
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
    this.loadAssets();
    // começo da partida (avulsa ou 1º cenário da campanha): a roleta mostra quem foi sorteado (todos veem a mesma, uma vez só)
    // — depois da tela de carregamento (rouletteFor espera o carregamento acabar)
    const rk = `${lobby.code}:${lobby.scenario ?? 1}:${state.mapId}`;
    if (lobby.roulette && state.turn === 1 && (state.deploying?.length ?? 0) > 0 && this.rouletteShown !== rk) {
      this.rouletteShown = rk;
      this.rouletteFor(this.game);
    }
    document.getElementById('gameover')?.remove();
    this.setTestUI(false);
    this.onlinePanel.classList.remove('hidden');
    // começa minimizado (mostra só o cabeçalho; mensagens novas aparecem num contador)
    this.onlinePanel.classList.add('collapsed');
    this.setUnread(0);
    this.hud.setModeBadge(session.isHost ? 'ONLINE · ANFITRIÃO' : 'ONLINE');
    session.ev = this.sessionEvents();
    diceSync.net = { send: id => (this.net as HostSession | ClientSession | null)?.sendDiceStep(id), remote: g => this.remotePlayer(g), name: g => this.hud.nameOf(g) ?? guildShort(g) };
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
    this.announceTitles();
  }

  /** Eventos da sessão durante a partida. */
  private sessionEvents(): SessionEvents {
    return {
      status: (text, kind) => { this.hud.toast(text, kind === 'error' ? '#c0392b' : kind === 'warn' ? '#e0b43a' : '#3fa34d'); this.addChat('Sistema', text); },
      lobby: l => {
        this.lobby = l;
        // campanha online: o anfitrião voltou para a mesa (Fase de Melhorias)
        if (!l.started && l.setup && this.mode === 'client') { this.stop(); document.getElementById('gameover')?.remove(); this.onLobbyBack(l); return; }
        this.syncControllers(); this.updateOnlinePanel();
      },
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
      ping: (guild, cell) => this.showPing(guild, cell),
      undoPoll: (poll, result) => this.showUndoPoll(poll, result),
      decide: (req, id) => this.decideForHost(req, id),
      diceStep: id => diceSync.receive(id),
    };
  }

  /** Anima o golpe/projétil e solta a fila no impacto (o dano aparece na hora que o golpe chega);
   *  o resto da animação e a pausa para ver o resultado ficam depois do dano. */
  private strikeThen(e: Extract<GameEvent, { t: 'attack' }>, minePart: boolean) {
    const r = this.renderer;
    const ms = e.noAnim ? 0 : r.animateAttack(e);
    const hit = e.noAnim ? 0 : r.lastImpact;
    r.pauseAfterHit(Math.max(0, ms - hit) + 80 + (minePart && !e.noAnim ? 2000 / Math.max(1, r.speed) : 0));
    setTimeout(() => r.release(), hit + 20);
  }

  /** Online (jogador): o anfitrião pede a minha decisão no meio de uma jogada — Rerrolagem ou alvo adicional. */
  private decideForHost(req: DecisionRequest, id: number) {
    const send = (pick: number[] | null) => (this.net as ClientSession).sendDecision(id, pick);
    if (!('choice' in req) && getSettings().reroll === 'auto') { send(null); return; }
    // primeiro termina de mostrar o que já aconteceu (o ataque), depois pergunta
    const go = () => {
      if (this.renderer.busy) { requestAnimationFrame(go); return; }
      this.deciding = true;
      this.clearHighlights();
      const done = (pick: number[] | null) => { this.deciding = false; send(pick); };
      if ('choice' in req) { void this.askChoice(req).then(i => done([i])); return; }
      this.hud.setHint('Escolha os dados para rerrolar');
      void (getSettings().battle !== 'never' ? this.battle.decide(req) : this.hud.askDecision(req)).then(idx => done(idx));
    };
    go();
  }

  // ------------------------------------------------------------------
  // VOTAÇÃO PARA VOLTAR O TURNO (online)
  // ------------------------------------------------------------------
  private poll: UndoPoll | null = null;
  private pollTick = 0;
  private myId() { return this.net?.me ?? ''; }
  private undoVote(open: boolean, yes = true) {
    if (this.mode === 'host') { const h = this.net as HostSession; if (open) h.openUndoVote(h.me); else h.castUndo(h.me, yes); }
    else (this.net as ClientSession | null)?.undoVote(open, yes);
  }
  private showUndoPoll(poll: UndoPoll | null, result?: string) {
    this.poll = poll;
    let el = document.getElementById('undopoll');
    clearInterval(this.pollTick);
    if (result) this.hud.toast(result, result.startsWith('✅') ? '#3fa34d' : '#c0392b');
    if (!poll) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'undopoll'; document.body.append(el); }
    const me = this.myId();
    const mine = poll.yes.includes(me) ? 'sim' : poll.no.includes(me) ? 'não' : null;
    const need = Math.floor(poll.voters.length / 2) + 1;
    const draw = () => {
      const left = Math.max(0, Math.ceil((poll.ends - Date.now()) / 1000));
      el!.innerHTML = `<div class="up-box">
        <div class="up-h">🗳️ Voltar a jogada?</div>
        <p><b>${poll.by}</b> pediu para desfazer a última jogada${this.history.length ? ` (<b>${this.history[this.history.length - 1].label}</b>)` : ''}. Passa com <b>${need}</b> de ${poll.voters.length} votos sim.</p>
        <div class="up-votes">${poll.voters.map(v => `<span class="${poll.yes.includes(v.id) ? 'y' : poll.no.includes(v.id) ? 'n' : ''}">${poll.yes.includes(v.id) ? '✔' : poll.no.includes(v.id) ? '✖' : '…'} ${v.name}</span>`).join('')}</div>
        ${poll.voters.some(v => v.id === me) ? `<div class="up-btns"><button class="primary ${mine === 'sim' ? 'on' : ''}" id="up-yes">👍 Sim</button><button class="${mine === 'não' ? 'on' : ''}" id="up-no">👎 Não</button></div>` : ''}
        <small>${mine ? `Seu voto: <b>${mine}</b> (pode mudar) · ` : ''}encerra em ${left}s</small></div>`;
      const y = el!.querySelector('#up-yes') as HTMLElement | null, n = el!.querySelector('#up-no') as HTMLElement | null;
      if (y) y.onclick = () => this.undoVote(false, true);
      if (n) n.onclick = () => this.undoVote(false, false);
    };
    draw();
    this.pollTick = window.setInterval(draw, 1000);
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

  /** Anfitrião: jogada de um jogador remoto (as decisões no meio dela — Rerrolagem etc. — são pedidas a quem decide). */
  private handleRemote(guild: GuildId, a: Action): string | null {
    if (this.game.guild(guild).controller !== 'human') return 'A IA está controlando sua Guilda.';
    if (this.deciding) return 'Aguarde: uma decisão ainda está sendo tomada.';
    const snap = JSON.stringify(this.game.s);
    let sync: string | null | undefined;
    this.withDecisions(() => applyAction(this.game, guild, a), ok => {
      // jogada de outro jogador também pode ser desfeita pelo anfitrião
      if (ok) { this.history.push({ label: `jogada de ${this.hud.nameOf(guild) ?? guildShort(guild)}`, state: snap }); if (this.history.length > 60) this.history.shift(); }
      const ev = this.game.drain();
      if (ok || ev.length) {
        (this.net as HostSession).update(ev, this.game.s);
        this.autoUninspect();
        this.renderer.enqueue(ev);
        this.hud.refresh();
        if (!ev.length && !this.renderer.busy) this.refresh();
      }
      const why = ok ? null : a.type === 'activate' ? 'Só é possível trocar de Herói antes de mover ou atacar.' : 'Jogada inválida.';
      if (sync === undefined) sync = why; // respondeu na hora
      else if (why) (this.net as HostSession).rejectGuild(guild, why); // respondeu depois de uma decisão
    });
    if (sync === undefined) { sync = null; return null; }
    return sync;
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

  /** Online: a Guilda é de um jogador humano conectado em OUTRO computador (os dados dele esperam o clique dele). */
  private remotePlayer(g: GuildId | null | undefined): boolean {
    if (!g || this.mode === 'local' || !this.game?.s.guilds[g]) return false;
    if (this.mode === 'host') return this.remoteHuman(g);
    if (g === this.myGuild || this.game.guild(g).controller !== 'human') return false;
    const seat = this.lobby?.seats.find(s => s.guild === g);
    return !!seat && !seat.ai && seat.connected;
  }

  leaveOnline(close = true) {
    diceSync.net = null;
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
    p.className = 'panel hidden collapsed';
    p.innerHTML = `<div class="panel-h" id="op-toggle">🌐 Online <small id="op-code"></small><span id="op-unread" class="op-unread hidden"></span><small class="op-arrow">▲</small></div>
      <div class="op-body"><div id="op-seats"></div>
      <div id="op-chat"></div>
      <form id="op-form"><input id="op-msg" maxlength="200" placeholder="Mensagem…" autocomplete="off"/><button>➤</button></form>
      <button id="op-leave" class="op-leave">Sair da partida</button></div>`;
    // canto inferior direito, embaixo de Cemitério / Missões / Registro
    (root.querySelector('#rightside') ?? root).append(p);
    this.onlinePanel = p;
    (p.querySelector('#op-toggle') as HTMLElement).onclick = () => { if (!p.classList.toggle('collapsed')) this.setUnread(0); };
    (p.querySelector('#op-form') as HTMLFormElement).onsubmit = e => {
      e.preventDefault();
      const inp = p.querySelector('#op-msg') as HTMLInputElement;
      const t = inp.value.trim();
      if (t) this.net?.chat(t);
      inp.value = '';
    };
    (p.querySelector('#op-leave') as HTMLElement).onclick = async () => {
      if (!await gameConfirm(this.mode === 'host'
        ? { icon: '🚪', title: 'Encerrar a partida?', body: 'Você é o <b>anfitrião</b>: sair fecha a sala para todos, mas a partida <b>fica salva</b>. Depois é só abrir Online → Partidas salvas → Continuar, e seus amigos entram com o mesmo código e nome.', yes: 'Sair (fica salva)', no: 'Continuar jogando', danger: true }
        : { icon: '🚪', title: 'Sair da partida?', body: 'A IA assume os seus Heróis até o fim.', yes: 'Sair', no: 'Continuar jogando', danger: true })) return;
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
    if (this.onlinePanel.classList.contains('collapsed')) this.setUnread(this.unread + 1);
  }

  /** Mensagens novas no chat enquanto o painel Online está minimizado. */
  private unread = 0;
  private setUnread(n: number) {
    this.unread = n;
    const b = this.onlinePanel?.querySelector('#op-unread') as HTMLElement | null;
    if (!b) return;
    b.textContent = n > 9 ? '9+' : String(n);
    b.classList.toggle('hidden', n === 0);
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
    hl.doorClick = [];
    hl.doorFlip = [];
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
    if (this.choicePick) { this.paintChoice(); return; }
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
    // Lápide: o jogador ativa um Monstro (escolhe, move e ataca pelo mapa)
    const pup = this.game.s.puppet;
    if (pup && !this.renderer.busy && !pend) {
      if (this.isMine(pup.guild)) { this.showPuppetControl(); return; }
      this.hud.monsterPanel(null);
      this.hud.setHint(`🪦 ${this.hud.nameOf(pup.guild) ?? guildShort(pup.guild)} está ativando um Monstro (Lápide)…`);
      return;
    }
    if (!pup) {
      if (this.pDest || this.pRepick || this.puppetShown) { this.hud.inspected = null; this.hud.refresh(); }
      this.pDest = null; this.pRepick = false; this.puppetShown = false;
    } else this.puppetShown = true;
    this.hud.monsterPanel(null);
    if (pend && !this.renderer.busy) {
      this.hud.setHint(`Aguardando ${this.hud.nameOf(pend.controller) ?? guildShort(pend.controller)} decidir a Reação de Vingança…`);
      return;
    }
    if (!this.isHumanTurn() || this.renderer.busy || !a) {
      this.bootMode = null;
      this.hud.setHint(this.isHumanTurn() ? 'Clique em um Herói seu e depois em <b>▶ Ativar</b> · <b>R</b> Descansar' : '');
      return;
    }
    if (this.powerMode) {
      const ph = this.game.unit(this.powerMode.heroId);
      const pinfo = this.game.heroPower(ph);
      if (pinfo?.ok) {
        hl.moveColor = 'green';
        for (const cell of this.game.powerCells(ph, this.powerMode.target)) hl.move.set(key(cell), 1);
        this.hud.setHint(`⚡ <b>${HEROES[ph.defId].abilityName}</b>: clique num Espaço verde · <b>Esc</b> cancela`);
        return;
      }
      this.powerMode = null;
    }
    if (this.bootMode) {
      const bh = this.game.unit(this.bootMode.heroId);
      const bc = bh.cards.find(x => x.uid === this.bootMode!.cardUid);
      if (bc && this.game.activatable(bh, bc)?.ok) {
        hl.moveColor = 'green';
        for (const cell of this.game.bootCells(bh, bc)) hl.move.set(key(cell), 1);
        this.hud.setHint(`👢 <b>${this.game.cardDef(bc).name}</b>: clique num Espaço verde para mover ${this.game.name(bh)} · <b>Esc</b> cancela`);
        return;
      }
      this.bootMode = null;
    }
    const h = this.game.unit(a.heroId);
    if (this.game.canMove()) {
      for (const n of this.game.reachable(h, a.mp).values()) if (n.canEnd && n.prev !== null) hl.move.set(key(n.cell), n.mp);
      hl.doorIcons = this.game.doorsAdjacentToActive();
    }
    if (!a.attacked) for (const c of this.game.usableCards(h)) for (const t of this.game.attackTargets(h, c)) hl.attackUnits.add(t.id);
    const parts: string[] = [];
    if (hl.move.size) parts.push('<span class="k blue">■</span> clique para mover');
    if (hl.attackUnits.size) parts.push('<span class="k red">■</span> clique no inimigo para abrir a <b>Batalha</b>');
    if (hl.doorIcons.length) parts.push('🔑 clique na porta para abrir/fechar (1 PM)');
    if (this.game.canRevealTomb()) parts.push('🪦 <b>Lápide</b> aqui: revele no quadro do Herói (1 PM)');
    if (a.moved && !a.attacked && !a.moveLocked) parts.push('<i>atacar agora encerra o Movimento</i>');
    if (this.game.s.blessing) parts.push('✨ <b>Bênção</b>: clique em um Aliado em Linha de Visão de Hobsbawm para ativá-lo');
    parts.push('<b>Enter</b> encerra o turno · <b>R</b> descansar');
    this.hud.setHint(parts.join(' · '));
    this.updateHover();
  }

  /** Cursor conforme o que está embaixo do mouse: espada/arco (atacar), botas (andar), chave (porta), luva (clicar). */
  private updateCursor(unitId: string | null, cell: Cell | null) {
    const canvas = this.renderer.canvas;
    if (this.drag?.moved) return setCursor(canvas, 'grabbing');
    const hl = this.renderer.hl;
    const a = this.game.s.activation;
    const mine = this.isHumanTurn() && !this.renderer.busy;
    if (mine && this.renderer.pickDoorIcon(this.mouse.x, this.mouse.y)) return setCursor(canvas, 'door');
    const pend = this.game.s.pending;
    if (pend && this.isMine(pend.controller) && !this.renderer.busy && this.renderer.pickDoorIcon(this.mouse.x, this.mouse.y)) return setCursor(canvas, 'door');
    if (mine && a) {
      const target = unitId && hl.attackUnits.has(unitId) ? unitId : cell ? this.game.unitsAt(cell).find(u => hl.attackUnits.has(u.id))?.id : undefined;
      if (target && !(cell && hl.move.has(key(cell)) && !unitId)) {
        const h = this.game.unit(a.heroId);
        const card = this.game.findAttackCard(h, this.hud.selectedCard ?? '') ?? this.game.usableCards(h)[0];
        const ranged = card ? CARDS[card.defId].attackType === 'ranged' : false;
        return setCursor(canvas, ranged ? 'ranged' : 'melee');
      }
      if (cell && hl.move.has(key(cell))) return setCursor(canvas, 'move');
    }
    if (unitId) return setCursor(canvas, 'pointer');
    setCursor(canvas, 'default');
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
      const card = this.game.findAttackCard(h, this.hud.selectedCard ?? '');
      if (unitId && card && CARDS[card.defId].attackType === 'ranged' && h.cell) {
        const t = this.game.unit(unitId);
        if (this.game.isEnemy(h, t) && t.cell) hl.los = { from: h.cell, to: t.cell, ok: hl.attackUnits.has(unitId) };
      }
    }
    this.updateCursor(unitId, cell);
    // tooltip
    if (unitId) {
      const u = this.game.unit(unitId);
      const max = this.game.maxHp(u);
      let html: string;
      if (u.kind === 'monster') {
        const md = MONSTERS[u.defId];
        // medalhões como na carta (Defesa e Rerrolagem só quando tem)
        const def = this.game.defenseDice(u), rr = this.game.rerollsOf(u), hp = Math.max(0, max - u.wounds);
        const meds = [hp > 0 ? medal('hp', hp, `Vida ${hp}/${max}`, 'tipm') : '', Number.isFinite(md.exterm) && md.exterm > 0 ? medal('skull', md.exterm, 'Extermínio', 'tipm') : '',
          def > 0 ? medal('def', def, 'Defesa', 'tipm') : '', rr > 0 ? medal('rr', rr, 'Rerrolagem', 'tipm') : '', medal(md.attackType === 'melee' ? 'melee' : 'ranged', md.dice, 'Dados de ataque', 'tipm'),
          medal('move', md.move, 'Movimento', 'tipm'), medal('coin', md.reward, 'Recompensa', 'tipm')].join('');
        html = `<b>${md.name}</b> <small>${hp}/${max} de Vida</small><div class="tip-meds">${meds}</div>${u.stunned ? '✷ Atordoado' : ''}`;
      } else {
        // medalhões como na carta (Rerrolagem só quando tem)
        const def = this.game.defenseDice(u), rr = this.game.rerollsOf(u), hp = Math.max(0, max - u.wounds);
        const meds = [hp > 0 ? medal('hp', hp, `Vida ${hp}/${max}`, 'tipm') : '', def > 0 ? medal('def', def, 'Defesa', 'tipm') : '', rr > 0 ? medal('rr', rr, 'Rerrolagem', 'tipm') : ''].join('');
        html = `<b style="color:${GUILDS[u.guild!].light}">${HEROES[u.defId].name}</b> (${guildShort(u.guild!)}) <small>${hp}/${max} de Vida</small><div class="tip-meds">${meds}</div>${u.stunned ? '✷ Atordoado' : ''}`;
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
    setCursor(canvas, 'default');
    // pinça (dois dedos): zoom no ponto entre os dedos
    const touches = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { pinch = spread(); if (this.drag) this.drag.moved = true; this.deployDrag = null; return; }
      // posicionamento: segurar um Herói seu e arrastar até o Espaço
      const dg = this.myDeployGuild();
      const grab = dg && e.button === 0 ? this.renderer.pickUnit(e.clientX, e.clientY) : null;
      if (dg && grab && this.game.unit(grab).guild === dg) {
        this.deployDrag = { id: grab, x: e.clientX, y: e.clientY, moved: false };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      this.drag = { x: e.clientX, y: e.clientY, cx: this.renderer.cam.x, cy: this.renderer.cam.y, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    const lift = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; };
    canvas.addEventListener('pointercancel', lift);
    canvas.addEventListener('pointermove', e => {
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch) {
        const d = spread();
        const [a, b] = [...touches.values()];
        if (d > 0) this.renderer.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d;
        return;
      }
      this.mouse = { x: e.clientX, y: e.clientY };
      if (this.deployDrag) {
        const dd = this.deployDrag;
        if (Math.abs(e.clientX - dd.x) + Math.abs(e.clientY - dd.y) > 8) dd.moved = true;
        if (dd.moved) {
          // o Herói segue o ponteiro (como uma carta sendo arrastada)
          this.renderer.dragUnit = { id: dd.id, x: e.clientX, y: e.clientY };
          // mostra o Espaço onde ele vai cair
          const c = this.renderer.pickCell(e.clientX, e.clientY);
          this.deploySel = dd.id;
          this.renderer.hl.activeUnit = dd.id;
          this.renderer.hl.path = c && this.renderer.hl.move.has(key(c)) ? [c] : [];
          setCursor(canvas, 'grabbing');
        }
        return;
      }
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
        if (this.drag.moved) {
          this.renderer.camGoal = null;
          this.renderer.cam.x = this.drag.cx + dx;
          this.renderer.cam.y = this.drag.cy + dy;
          setCursor(canvas, 'grabbing');
        }
      }
      if (this.game) { this.updateHover(); if (e.altKey || this.altHeld) { this.altHeld = true; this.altPeek(); } }
      else if (!this.drag) setCursor(canvas, 'default');
    });
    canvas.addEventListener('pointerup', e => {
      const wasPinch = touches.size === 2 || pinch > 0;
      lift(e);
      if (wasPinch) { this.drag = null; return; }
      if (this.deployDrag) {
        const dd = this.deployDrag;
        this.deployDrag = null;
        this.renderer.dragUnit = null;
        setCursor(canvas, 'default');
        this.renderer.hl.path = [];
        const c = this.renderer.pickCell(e.clientX, e.clientY);
        if (!dd.moved) { this.deploySel = dd.id; this.refresh(); return; }
        if (c && this.renderer.hl.move.has(key(c))) this.deployPlace(dd.id, c);
        else this.refresh();
        return;
      }
      const d = this.drag;
      this.drag = null;
      if (d?.moved) setCursor(canvas, 'default');
      if (d && !d.moved && e.button === 0 && (e.ctrlKey || e.metaKey)) { this.ping(e.clientX, e.clientY); return; }
      if (d && !d.moved && e.button === 0) this.click(e.clientX, e.clientY);
      if (d && !d.moved && e.button === 2) { this.hud.inspected = null; this.refresh(); }
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.renderer.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    window.addEventListener('keyup', e => {
      this.panKeys.delete(e.code);
      // Alt: solta = fecha a carta aberta pelo mouse (e não deixa o navegador ir para o menu)
      if (e.key === 'Alt') { e.preventDefault(); this.altHeld = false; this.hud.closePeek(); }
    });
    window.addEventListener('blur', () => { this.panKeys.clear(); this.altHeld = false; this.hud.closePeek(); });
    window.addEventListener('keydown', e => {
      if (e.key !== 'Alt') return;
      e.preventDefault();
      if (!this.altHeld) { this.altHeld = true; this.altPeek(); }
    });
    window.addEventListener('keydown', e => {
      if (!this.game) return;
      // só campos de texto (chat, nomes) ficam com as teclas; controles de volume e caixas de marcar não travam o WASD
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'TEXTAREA' || tgt.isContentEditable || (tgt.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((tgt as HTMLInputElement).type)))) return;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'BUTTON')) {
        if (PAN_KEYS.includes(e.code)) e.preventDefault(); // as setas não mexem no volume
        if (tgt.tagName !== 'BUTTON' || e.code !== 'Enter') tgt.blur();
      }
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
      // Espaço é só para rolar os dados (nas telas de rolagem); Enter ativa o Herói escolhido ou encerra o turno
      if (e.code === 'Space') e.preventDefault();
      else if (e.code === 'Enter') {
        e.preventDefault();
        if (this.hud.pendingActivate) this.doActivate(this.hud.pendingActivate);
        else if (this.isHumanTurn() && !this.restDraft) this.tryEndTurn();
      }
      else if (e.code === 'KeyR') { if (this.isHumanTurn()) this.openRest(); }
      else if (e.code === 'KeyG') { this.renderer.showGrid = !this.renderer.showGrid; this.updateTestPanel(); }
      else if (e.code === 'KeyC') this.renderer.fit();
      else if (e.code === 'KeyV') toggleView();
      else if (e.code === 'KeyF') this.focusActive();
      else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (this.mode === 'local' && !this.campaignEnd) this.undo(); }
      else if ((e.code === 'F2' || e.code === 'KeyT') && this.mode === 'local' && !this.campaignEnd) { e.preventDefault(); this.toggleTestPanel(); }
      else if (e.code === 'Escape' && this.bootMode) { this.bootMode = null; this.refresh(); }
      else if (e.code === 'Escape' && this.powerMode) { this.powerMode = null; this.refresh(); }
      else if (e.code === 'Escape' && this.hud.pendingActivate) { this.hud.pendingActivate = null; this.hud.inspected = null; this.refresh(); }
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
    const near = g.vengeanceDoors();
    this.vDoors = this.vDoors.filter(id => near.includes(id));
    const opts = g.vengeanceOptions(this.vDoors)!;
    const m = g.unit(p.monsterId), h = g.unit(p.heroId);
    const md = MONSTERS[m.defId];
    // portas Perto do Monstro: clique na própria porta para abrir/fechar (sem ícone); a porta já aparece como vai ficar
    this.renderer.hl.doorClick = near;
    this.renderer.hl.doorFlip = this.vDoors.slice();
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
      const doors = this.vDoors.slice();
      this.vDoors = [];
      this.act({ type: 'vengeance', dest: sameCell(d, m.cell) ? null : d, attack, doors }, 'vingança');
    };
    (el.querySelector('#mc-atk') as HTMLElement).onclick = () => go(true);
    (el.querySelector('#mc-noatk') as HTMLElement).onclick = () => go(false);
    const rs = el.querySelector('#mc-reset') as HTMLElement | null;
    if (rs) rs.onclick = () => { this.vDest = null; this.refresh(); };
    this.hud.setHint('Você controla o Monstro: escolha um Espaço roxo e confirme no painel');
  }

  /** Vingança: marca/desmarca uma porta Perto do Monstro para ele abrir ou fechar antes de mover. */
  private toggleVDoor(id: string) {
    const g = this.game;
    const p = g.s.pending;
    if (!p || !g.vengeanceDoors().includes(id)) return;
    if (this.vDoors.includes(id)) this.vDoors = this.vDoors.filter(x => x !== id);
    else if (this.vDoors.length < g.monMove(g.unit(p.monsterId))) this.vDoors.push(id);
    this.vDest = null;
    this.refresh();
  }

  /** Lápide "ativar um Monstro": 1) clique no Monstro que pisca; 2) Espaço roxo para mover e Herói vermelho para atacar. */
  private showPuppetControl() {
    const g = this.game;
    const p = g.s.puppet!;
    const hl = this.renderer.hl;
    const cands = g.puppetCandidates(p.cat);
    if (!p.monsterId || this.pRepick) {
      hl.attackUnits = new Set();
      // muitos candidatos: só pelo mapa (a lista cobriria o tabuleiro)
      const list = cands.length > 4 ? '' : cands.map(m => `<button class="primary" data-pick="${m.id}"><img class="cf-face" src="${this.hud.portraitOf(m)}"/> ${g.name(m)}</button>`).join('');
      const el = this.hud.monsterPanel(`
        <div class="panel-h">🪦 ${p.source} — ative um ${p.cat}</div>
        <div class="mc-body">
          <p>Escolha qual <b>${p.cat}</b> você ativa: ele se move e/ou ataca <b>qualquer Herói</b>, como se fosse seu (as mortes são do jogo).</p>
          <p class="mc-legend"><span class="pu">■</span> clique num Monstro que está <b>piscando</b> no mapa${list ? ' ou aqui:' : ` (${cands.length} no tabuleiro).`}</p>
          <div class="mc-btns">${list}<button id="pp-skip">Não ativar</button></div>
        </div>`);
      el.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => { b.onclick = () => { this.pRepick = false; this.act({ type: 'puppetPick', monsterId: b.dataset.pick! }, 'Lápide'); }; });
      (el.querySelector('#pp-skip') as HTMLElement).onclick = () => this.act({ type: 'puppetSkip' }, 'Lápide');
      this.hud.setHint(`🪦 <b>${p.source}</b>: clique num ${p.cat} que está piscando`);
      return;
    }
    const m = g.unit(p.monsterId);
    const md = MONSTERS[m.defId];
    // o quadro da esquerda mostra o Monstro que você está controlando
    if (this.hud.inspected !== m.id) { this.hud.inspected = m.id; this.hud.refresh(); }
    const o = g.puppetOptions();
    if (!o) { this.act({ type: 'puppetSkip' }, 'Lápide'); return; }
    hl.moveColor = 'purple';
    hl.activeUnit = m.id;
    for (const [k, n] of o.reach) if (n.canEnd && n.prev !== null) hl.move.set(k, n.mp);
    hl.attackCells = new Set([...o.targets].filter(([, ids]) => ids.length).map(([k]) => k));
    const dest = this.pDest && o.reach.get(key(this.pDest))?.canEnd ? this.pDest : m.cell!;
    hl.path = sameCell(dest, m.cell) ? [] : g.pathTo(o.reach, dest).map(n => n.cell);
    const targets = o.targets.get(key(dest)) ?? [];
    hl.attackUnits = new Set(targets);
    const tl = targets.map(id => { const u = g.unit(id); return `<button class="primary" data-hit="${id}"><img class="cf-face" src="${this.hud.portraitOf(u)}"/> ⚔ ${g.name(u)}</button>`; }).join('');
    const el = this.hud.monsterPanel(`
      <div class="panel-h">🪦 ${p.source} — você controla o ${md.name}</div>
      <div class="mc-body">
        <p>Mova até <b>${md.move}</b> Espaço${md.move > 1 ? 's' : ''} (<span class="pu">■</span> roxo) e/ou ataque <b>qualquer Herói</b> (${md.attackType === 'melee' ? '⚔ Próximo' : '➶ Distância'}, ${md.dice} dados) — clique no Herói em <span class="rd">vermelho</span>.</p>
        <p class="mc-legend">Destino: <b>${sameCell(dest, m.cell) ? 'ficar parado' : `(${dest.c},${dest.r})`}</b> · <span class="rd">◇</span> de lá ele ataca alguém</p>
        <div class="mc-btns">${tl || '<i>Nenhum Herói ao alcance daqui.</i>'}
          ${sameCell(dest, m.cell) ? '' : '<button id="pp-move">Só mover</button><button id="pp-reset">Ficar parado</button>'}
          ${cands.length > 1 ? '<button id="pp-other">Outro Monstro</button>' : ''}<button id="pp-skip">Não ativar</button></div>
      </div>`);
    const go = (targetId: string | null) => {
      const d = dest;
      this.pDest = null;
      this.hud.monsterPanel(null);
      this.act({ type: 'puppet', dest: sameCell(d, m.cell) ? null : d, targetId }, 'Lápide');
    };
    el.querySelectorAll<HTMLElement>('[data-hit]').forEach(b => { b.onclick = () => go(b.dataset.hit!); });
    const mv = el.querySelector('#pp-move') as HTMLElement | null;
    if (mv) mv.onclick = () => go(null);
    const rs = el.querySelector('#pp-reset') as HTMLElement | null;
    if (rs) rs.onclick = () => { this.pDest = null; this.refresh(); };
    const ot = el.querySelector('#pp-other') as HTMLElement | null;
    if (ot) ot.onclick = () => { this.pDest = null; this.pRepick = true; this.refresh(); };
    (el.querySelector('#pp-skip') as HTMLElement).onclick = () => { this.pDest = null; this.act({ type: 'puppetSkip' }, 'Lápide'); };
    this.hud.setHint(`🪦 Você controla o <b>${md.name}</b>: Espaço roxo = mover · Herói vermelho = atacar`);
  }

  /** Um Inimigo vai atacar um Herói seu: mira no alvo, retrato piscando e aviso — já quando ele começa a andar. */
  private warnTarget(e: GameEvent) {
    const g = this.game;
    if (!g) return;
    const attacker = e.t === 'attack' ? e.attackerId : e.t === 'move' ? e.id : e.t === 'reaction' ? e.monsterId : null;
    if (!attacker) return;
    const au = g.unit(attacker);
    if (au.kind === 'hero' && au.guild && this.isMine(au.guild)) return;
    const ids = e.t === 'attack' ? e.targets.map(t => t.id) : this.renderer.upcomingTargets(attacker);
    for (const id of ids) {
      const t = g.unit(id);
      if (t.kind !== 'hero' || !t.guild || !this.isMine(t.guild) || !t.alive) continue;
      if (this.renderer.markTarget(id)) this.hud.alertTarget(id, attacker);
    }
  }

  /** Botas (Das Boot / Die Booten): escolhendo para onde mover o outro Herói. */
  private bootMode: { heroId: string; cardUid: string } | null = null;
  /** Habilidade do Herói (Teleporte, Chamado): escolhendo o Espaço. */
  private powerMode: { heroId: string; target?: string } | null = null;

  /** Habilidade do Herói usada como ação: escolhe o alvo/Espaço e manda a jogada. */
  private async usePower(heroId: string) {
    const g = this.game;
    if (!this.isHumanTurn() || this.renderer.busy) return;
    const h = g.unit(heroId);
    const info = g.heroPower(h);
    if (!info?.ok) { if (info?.why) this.hud.toast(info.why, '#c0392b'); return; }
    const name = HEROES[h.defId].abilityName;
    if (info.pick === 'enemy' || info.pick === 'hero') {
      const copy = g.ab(h) === 'macaco_ve';
      const list = g.powerTargets(h).map(u => ({ id: u.id, html: `<img class="cf-face" src="${this.hud.portraitOf(u)}"/> ${g.name(u)}${copy ? ` — <b>${HEROES[u.defId].abilityName}</b>` : ''}` }));
      const pick = await this.hud.choose(`⚡ ${name}`, info.label, list);
      if (!pick || this.game !== g) return;
      if (g.ab(h) === 'chamado') { this.powerMode = { heroId, target: pick }; this.refresh(); return; }
      this.act({ type: 'power', heroId, target: pick });
      return;
    }
    if (info.pick === 'cell') { this.powerMode = { heroId }; this.refresh(); return; }
    this.act({ type: 'power', heroId });
  }

  /** Carta ativável (⚡): escolhe o alvo quando precisa e manda a jogada. */
  private async useCard(heroId: string, cardUid: string) {
    const g = this.game;
    if (!this.isHumanTurn() || this.renderer.busy) return;
    const h = g.unit(heroId);
    const c = h.cards.find(x => x.uid === cardUid);
    if (!c) return;
    if (!g.s.activation && !g.freeMode) { this.hud.toast('Ative um Herói primeiro (clique nele e em ▶ Ativar).', '#c0392b'); return; }
    const info = g.activatable(h, c);
    if (!info?.ok) { if (info?.why) this.hud.toast(info.why, '#c0392b'); return; }
    const opt = (u: { id: string }) => { const x = g.unit(u.id); return { id: x.id, html: `<img class="cf-face" src="${this.hud.portraitOf(x)}"/> ${g.name(x)}` }; };
    if (info.pick === 'ally') {
      const allies = g.heroesOf(h.guild!).filter(x => x.id !== h.id && x.alive && x.cell);
      const pick = allies.length === 1 ? allies[0].id : await this.hud.choose('🌀 Manto do Deslocamento', `Com qual Aliado <b>${g.name(h)}</b> troca de lugar?`, allies.map(opt));
      if (pick) this.act({ type: 'card', heroId, cardUid, target: pick });
      return;
    }
    if (info.pick === 'dead') {
      const dead = g.heroesOf(h.guild!).filter(x => !x.alive);
      const pick = dead.length === 1 ? dead[0].id : await this.hud.choose('✨ Escudo das Almas', `Qual Aliado volta à vida? <b>${g.name(h)}</b> fica exausto até Descansar.`, dead.map(opt));
      if (pick) this.act({ type: 'card', heroId, cardUid, target: pick });
      return;
    }
    if (info.pick === 'cell') {
      this.bootMode = { heroId, cardUid };
      this.refresh();
      return;
    }
    this.act({ type: 'card', heroId, cardUid });
  }

  /** Ctrl + clique: marca o Espaço na sua cor para todos verem. */
  private ping(x: number, y: number) {
    if (!this.game) return;
    const cell = this.renderer.pickCell(x, y);
    if (!cell || !this.game.board.playable(cell)) return;
    const g = this.game;
    const guild = this.myGuild ?? (this.isMine(g.currentGuild().id) ? g.currentGuild().id : g.guilds().find(x => this.isMine(x.id))?.id) ?? g.currentGuild().id;
    this.showPing(guild, cell);
    if (this.net && this.mode !== 'local') (this.net as HostSession | ClientSession).sendPing(cell);
  }
  private showPing(guild: GuildId, cell: Cell) {
    if (!this.game) return;
    const name = this.hud.nameOf(guild) ?? guildShort(guild);
    this.renderer.addPing(cell, this.game.guild(guild).color, name);
    play('scan');
  }

  /** O que ainda dá para fazer neste turno (aviso antes de encerrar). */
  private leftovers(): string[] {
    const g = this.game;
    const cur = g.currentGuild();
    const a = g.s.activation;
    const out: string[] = [];
    const heroes = g.heroesOf(cur.id);
    if (!a) {
      const can = heroes.filter(h => h.alive && h.cell);
      if (can.length) out.push(`Você ainda <b>não ativou nenhum Herói</b> neste turno (${can.map(h => g.name(h)).join(', ')}). Ative um ou <b>Descanse</b> a Guilda.`);
      return out;
    }
    const h = g.unit(a.heroId);
    if (h.alive && g.canMove() && !g.freeMode) {
      const reach = [...g.reachable(h, a.mp).values()].some(n => n.canEnd && n.prev !== null);
      if (reach) out.push(`<b>${g.name(h)}</b> ainda pode <b>se mover</b> (${a.mp} PM).`);
    }
    if (h.alive && !a.attacked && g.usableCards(h).some(c => g.attackTargets(h, c).length)) out.push(`<b>${g.name(h)}</b> ainda pode <b>atacar</b>.`);
    const extra = heroes.filter(x => x.id !== h.id && g.canBless(x.id));
    if (extra.length) out.push(`Você ainda pode <b>ativar outro Herói</b> (${g.s.warCry === cur.id && !g.s.blessing ? 'Grito de Guerra' : 'Bênção de Hobsbawm'}): ${extra.map(x => g.name(x)).join(', ')}.`);
    for (const x of heroes) for (const c of x.cards) {
      const info = g.activatable(x, c);
      if (info?.ok && !info.toggle) out.push(`Carta <b>⚡ ${g.cardDef(c).name}</b> (${g.name(x)}) ainda pode ser usada.`);
    }
    return out;
  }

  /** Encerrar o turno: se ainda houver o que fazer, avisa e pede confirmação. */
  private async tryEndTurn() {
    if (!this.isHumanTurn() || this.renderer.busy) return;
    const g = this.game;
    const left = getSettings().endConfirm === false ? [] : this.leftovers();
    if (left.length) {
      const ok = await this.hud.confirm('⚠️ Encerrar o turno?', `<ul>${left.map(x => `<li>${x}</li>`).join('')}</ul>`, 'Encerrar mesmo assim', 'Voltar');
      if (!ok || this.game !== g) return;
    }
    this.hud.pendingActivate = null;
    this.act({ type: 'end' });
  }

  /** Movimento: se provocar Reação de Alerta, avisa quem vai atacar e pede confirmação. */
  private async confirmMove(cell: Cell) {
    const g = this.game;
    // bota de um Aliado ainda disponível (só dá para usar antes do Herói ativado se mover): avisa uma vez por ativação
    const act0 = g.s.activation;
    const bootKey = act0 ? `${g.s.turn}:${act0.heroId}` : '';
    if (act0 && this.bootWarned !== bootKey) {
      const boots = g.heroesOf(g.currentGuild().id).flatMap(x => x.cards.filter(c => g.cardDef(c).fx.bootMove && g.activatable(x, c)?.ok).map(c => ({ x, c })));
      if (boots.length) {
        this.bootWarned = bootKey;
        const list = boots.map(b => `<li><b>${g.name(b.x)}</b> — ${g.cardDef(b.c).name} (mover ${g.cardDef(b.c).fx.bootMove} Espaço${(g.cardDef(b.c).fx.bootMove ?? 0) > 1 ? 's' : ''})</li>`).join('');
        const go = await this.hud.confirm('👢 Bota disponível',
          `<p>Você ainda pode usar a bota de um Aliado — depois que <b>${g.name(g.unit(act0.heroId))}</b> andar, não dá mais:</p><ul>${list}</ul>
           <p class="muted">Para usar, clique no ⚡ da carta na ficha do Herói que tem a bota.</p>`, 'Andar mesmo assim', 'Voltar e usar a bota');
        if (!go || this.game !== g) return;
      }
    }
    const alerts = getSettings().alertConfirm === false ? [] : g.alertPreview(cell);
    if (alerts.length) {
      const h = g.unit(g.s.activation!.heroId);
      const rows = alerts.map(m => {
        const md = MONSTERS[m.defId];
        return `<li><b>${md.name}</b> <span class="muted">— ${md.attackType === 'melee' ? '⚔' : '➶'} ${md.dice} dado${md.dice === 1 ? '' : 's'} de ataque</span></li>`;
      }).join('');
      const ok = await this.hud.confirm('⚠️ Reação de Alerta!',
        `<p><b>${g.name(h)}</b> vai sair de um Espaço Perto de Monstro${alerts.length > 1 ? 's' : ''} e vai receber ${alerts.length > 1 ? `<b>${alerts.length} ataques</b>` : '<b>1 ataque</b>'} de Alerta:</p><ul>${rows}</ul>
         <p class="muted">Defesa de ${g.name(h)}: ${g.defenseDice(h)} dado${g.defenseDice(h) === 1 ? '' : 's'} · Vida: ${g.maxHp(h) - h.wounds}/${g.maxHp(h)}</p>`,
        'Mover mesmo assim', 'Cancelar');
      if (!ok || this.game !== g) return;
    }
    this.act({ type: 'move', cell });
  }

  private openBattle(heroId: string, targetId: string) {
    this.hud.tooltip(null);
    this.battle.openPrepare(heroId, targetId, this.hud.selectedCard, async (cardUid, sacrifice, boosts) => {
      this.hud.selectedCard = cardUid;
      // Reação de Alerta por atacar outro alvo estando Perto de Monstros: avisa antes
      const g = this.game;
      const alerts = getSettings().alertConfirm === false ? [] : g.attackAlertPreview(heroId, targetId, cardUid);
      if (alerts.length) {
        const h = g.unit(heroId), t = g.unit(targetId);
        const rows = alerts.map(m => { const md = MONSTERS[m.defId]; return `<li><b>${md.name}</b> <span class="muted">— ${md.attackType === 'melee' ? '⚔' : '➶'} ${md.dice} dado${md.dice === 1 ? '' : 's'} de ataque</span></li>`; }).join('');
        const ok = await this.hud.confirm('⚠️ Reação de Alerta!',
          `<p><b>${g.name(h)}</b> vai atacar <b>${g.name(t)}</b> estando Perto de Monstro${alerts.length > 1 ? 's' : ''} que não ${alerts.length > 1 ? 'são' : 'é'} o alvo — depois do ataque, recebe ${alerts.length > 1 ? `<b>${alerts.length} ataques</b>` : '<b>1 ataque</b>'} de Alerta:</p><ul>${rows}</ul>
           <p class="muted">Defesa de ${g.name(h)}: ${g.defenseDice(h)} dado${g.defenseDice(h) === 1 ? '' : 's'} · Vida: ${g.maxHp(h) - h.wounds}/${g.maxHp(h)}</p>`,
          'Atacar mesmo assim', 'Cancelar');
        if (!ok || this.game !== g) { this.battle.close(); this.refresh(); return; }
      }
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
    if (this.choicePick) {
      const cp = this.choicePick;
      if (cp.req.choice === 'push') {
        const cell = this.renderer.pickCell(x, y);
        const i = cell ? cp.req.cells!.findIndex(c => sameCell(c, cell)) : -1;
        if (i >= 0) cp.resolve(i);
      } else {
        const uid = this.renderer.pickUnit(x, y);
        const i = uid ? cp.req.units!.indexOf(uid) : -1;
        if (i >= 0) cp.resolve(i);
      }
      return;
    }
    const pup = this.game.s.puppet;
    if (pup && !this.game.s.pending) {
      if (!this.isMine(pup.guild) || this.renderer.busy) return;
      const uid = this.renderer.pickUnit(x, y);
      const cell = this.renderer.pickCell(x, y);
      if (!pup.monsterId || this.pRepick) {
        const ids = new Set(this.game.puppetCandidates(pup.cat).map(m => m.id));
        const hit = uid && ids.has(uid) ? uid : cell ? this.game.unitsAt(cell).find(u => ids.has(u.id))?.id : undefined;
        if (hit) { this.pRepick = false; this.act({ type: 'puppetPick', monsterId: hit }, 'Lápide'); }
        return;
      }
      const hl = this.renderer.hl;
      const target = uid && hl.attackUnits.has(uid) ? uid : cell ? this.game.unitsAt(cell).find(u => hl.attackUnits.has(u.id))?.id : undefined;
      if (target) {
        const m = this.game.unit(pup.monsterId);
        const d = this.pDest && !sameCell(this.pDest, m.cell) ? this.pDest : null;
        this.pDest = null;
        this.hud.monsterPanel(null);
        this.act({ type: 'puppet', dest: d, targetId: target }, 'Lápide');
        return;
      }
      if (cell && hl.move.has(key(cell))) { this.pDest = cell; this.refresh(); }
      return;
    }
    const pend = this.game.s.pending;
    if (pend) {
      if (!this.isMine(pend.controller)) return;
      // porta Perto do Monstro: clique nela para abrir/fechar
      const door = this.renderer.pickDoorIcon(x, y);
      if (door) { this.toggleVDoor(door); return; }
      const cell = this.renderer.pickCell(x, y);
      if (cell && this.renderer.hl.move.has(key(cell))) { this.vDest = cell; this.refresh(); }
      return;
    }
    if (this.powerMode) {
      const cell = this.renderer.pickCell(x, y);
      const pm = this.powerMode;
      this.powerMode = null;
      if (cell && this.renderer.hl.move.has(key(cell))) this.act({ type: 'power', heroId: pm.heroId, target: pm.target, cell });
      else this.refresh();
      return;
    }
    if (this.bootMode) {
      const cell = this.renderer.pickCell(x, y);
      const bm = this.bootMode;
      this.bootMode = null;
      if (cell && this.renderer.hl.move.has(key(cell))) this.act({ type: 'card', heroId: bm.heroId, cardUid: bm.cardUid, cell });
      else this.refresh();
      return;
    }
    const door = this.renderer.pickDoorIcon(x, y);
    if (door && this.isHumanTurn()) { this.act({ type: 'door', doorId: door }); return; }
    let unitId = this.renderer.pickUnit(x, y);
    const cell = this.renderer.pickCell(x, y);
    const hl = this.renderer.hl;
    const a = this.game.s.activation;
    // Espaço que dá para andar E inimigo atacável ali (ou o boneco dele embaixo do dedo): pergunta o que fazer
    if (a && this.isHumanTurn() && !this.renderer.busy) {
      const foes = new Set<string>();
      if (unitId && hl.attackUnits.has(unitId)) foes.add(unitId);
      if (cell) for (const u of this.game.unitsAt(cell)) if (hl.attackUnits.has(u.id)) foes.add(u.id);
      const canMove = !!cell && hl.move.has(key(cell)) && !sameCell(cell, this.game.unit(a.heroId).cell);
      // tocar num Aliado que pode ser ativado continua selecionando ele (sem o menu)
      const ally = !!unitId && this.game.unit(unitId).kind === 'hero' && this.canActivateNow(unitId);
      // sempre pergunta quando dá para andar (mesmo que seja a única opção) ou quando há mais de um alvo
      if ((canMove && !(ally && !foes.size)) || foes.size > 1) {
        const g = this.game;
        const opts: ClickOpt[] = [...foes].map(id => {
          const u = g.unit(id);
          const max = g.maxHp(u);
          return { kind: 'atk', img: this.hud.portraitOf(u), title: '⚔ Atacar', name: g.name(u),
            info: `❤ ${max - u.wounds}/${max} · ⛨ ${g.defenseDice(u)}${u.stunned ? ' · ✷ Atordoado' : ''}`, run: () => this.openBattle(a.heroId, id) };
        });
        if (canMove) {
          const mp = hl.move.get(key(cell!)) ?? 0;
          const left = Math.max(0, a.mp - mp);
          opts.push({ kind: 'move', icon: '👣', title: 'Mover para cá', name: `${mp} PM`, info: `sobra${left === 1 ? '' : 'm'} ${left} PM`, run: () => this.confirmMove(cell!) });
        }
        this.clickMenu(x, y, opts);
        return;
      }
    }
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
        if (u.kind === 'hero' && this.canActivateNow(u.id)) {
          this.selectHero(unitId);
          return;
        }
      }
      // mover
      if (a && cell && hl.move.has(key(cell))) { this.confirmMove(cell); return; }
    }
    if (unitId) { this.hud.inspected = unitId; this.refresh(); }
  }

  /** Menu pequeno no ponto do clique (ex.: Atacar ou Mover). Fecha ao escolher, no ✕, tocando fora ou com Esc. */
  private clickMenu(x: number, y: number, opts: ClickOpt[]) {
    let el = document.getElementById('clickmenu');
    if (!el) { el = document.createElement('div'); el.id = 'clickmenu'; document.body.append(el); }
    const box = el;
    box.innerHTML = `<div class="cm-box"><div class="cm-head">O que fazer aqui?</div>
      ${opts.map((o, i) => `<button class="cm-opt ${o.kind}" data-i="${i}">
        ${o.img ? `<img src="${o.img}" alt=""/>` : `<span class="cm-ic">${o.icon ?? ''}</span>`}
        <span class="cm-txt"><b>${o.title}</b><span>${o.name}</span><small>${o.info}</small></span></button>`).join('')}
      <button class="cm-x">Cancelar</button></div>`;
    box.classList.remove('hidden');
    const card = box.firstElementChild as HTMLElement;
    // perto do dedo, sem sair da tela
    const w = card.offsetWidth, h = card.offsetHeight;
    card.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, x - w / 2))}px`;
    card.style.top = `${Math.max(6, Math.min(window.innerHeight - h - 6, y + 14))}px`;
    const close = () => { box.classList.add('hidden'); box.innerHTML = ''; window.removeEventListener('keydown', key, true); };
    const key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopImmediatePropagation(); close(); } };
    window.addEventListener('keydown', key, true);
    box.onpointerdown = e => { if (e.target === box) close(); };
    box.oncontextmenu = e => { e.preventDefault(); close(); };
    box.querySelectorAll<HTMLElement>('[data-i]').forEach(b => { b.onclick = () => { close(); opts[Number(b.dataset.i)].run(); }; });
    (box.querySelector('.cm-x') as HTMLElement).onclick = close;
    play('scan');
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
      // só faltam as IAs (posicionam na hora): não mostra o painel de espera, que piscava por cima do placar
      if (pending.every(x => this.game.guild(x).controller === 'ai')) { this.hud.panel('deploybox', null); this.hud.setHint(''); return; }
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
    const refocus = this.deployFocused !== gid;
    this.deployFocused = gid;
    if (!this.deploySel || !heroes.some(h => h.id === this.deploySel)) this.deploySel = heroes[0].id;
    // a ficha da esquerda mostra o Herói escolhido (status e cartas)
    if (this.hud.inspected !== this.deploySel) { this.hud.inspected = this.deploySel; this.hud.refresh(); }
    const hl = this.renderer.hl;
    hl.moveColor = 'green';
    for (const c of area) hl.move.set(key(c), 0);
    hl.activeUnit = this.deploySel;
    const others = pending.filter(x => x !== gid);
    const el = this.hud.panel('deploybox', `
      <div class="panel-h">📍 Posicione seus Heróis <small>${g.name}</small><span class="dp-short"> · toque ou arraste até um Espaço verde</span></div>
      <div class="rb-body dp-body">
        <div class="dp-row">
          <p class="dp-tip"><b>Arraste</b> os Heróis no mapa até um <b>Espaço verde</b> (ou toque no Herói e depois no Espaço). Soltar sobre um Aliado num Espaço cheio troca os dois de lugar. Máximo 2 por Espaço.</p>
          <div class="dp-btns"><button class="primary" id="dp-ok">✔ Pronto</button></div>
        </div>
        ${others.length ? `<p class="muted">Também posicionando: ${others.map(x => this.hud.nameOf(x) ?? guildShort(x)).join(', ')}.</p>` : ''}
      </div>`);
    // hotseat: ao passar para a próxima Guilda, a câmera vai até a Área Inicial dela — no espaço livre abaixo do painel
    if (refocus) {
      this.renderer.focus(area);
      const r = el.getBoundingClientRect();
      this.renderer.cam.y += (r.bottom - 50) / 2;
    }
    // confirma antes: depois de pronto não dá mais para mudar (o pessoal clicava sem organizar)
    (el.querySelector('#dp-ok') as HTMLElement).onclick = async () => {
      const where = heroes.map(h => `<li><b>${HEROES[h.defId].name}</b> — ${sameCell(h.cell, this.game.startCellsByExit(gid)[0]) ? 'na porta' : 'na Área Inicial'}</li>`).join('');
      if (!await gameConfirm({ icon: '📍', title: 'Terminar o posicionamento?', body: `<ul class="gd-list">${where}</ul>Depois de confirmar não dá para mudar os lugares. Arraste os Heróis no mapa se quiser trocar.`, yes: 'Sim, terminar', no: 'Continuar arrumando' })) return;
      if (this.myDeployGuild() !== gid) return;
      this.deploySel = null; this.hud.inspected = null;
      // fecha o quadro na hora (antes ele ficava por cima do placar até a animação do turno acabar)
      if (this.act({ type: 'ready' })) { this.deployPanel = false; this.deployFocused = null; this.hud.panel('deploybox', null); }
    };
    this.renderer.hl.activeUnit = this.deploySel;
    this.hud.setHint('Posicionamento: escolha o Herói e o Espaço da Área Inicial');
  }

  /** Herói sendo arrastado no posicionamento. */
  private deployDrag: { id: string; x: number; y: number; moved: boolean } | null = null;

  private deployClick(x: number, y: number) {
    const gid = this.myDeployGuild();
    if (!gid) return;
    const unitId = this.renderer.pickUnit(x, y);
    const cell = this.renderer.pickCell(x, y);
    const mine = this.game.heroesOf(gid).map(h => h.id);
    const sel = this.deploySel;
    // tocar num Herói seu (fora de um Espaço verde diferente do dele) = escolher esse Herói
    if (unitId && mine.includes(unitId) && !(cell && this.renderer.hl.move.has(key(cell)) && sel && !sameCell(this.game.unit(unitId).cell, cell))) { this.deploySel = unitId; this.refresh(); return; }
    if (!cell || !sel || !this.renderer.hl.move.has(key(cell))) return;
    this.deployPlace(sel, cell);
  }

  /** Coloca o Herói no Espaço; com o Espaço cheio, troca de lugar com um Aliado que está lá. Depois escolhe o próximo Herói. */
  private deployPlace(heroId: string, cell: Cell) {
    const gid = this.myDeployGuild();
    if (!gid) return;
    const mine = this.game.heroesOf(gid).map(h => h.id);
    const h = this.game.unit(heroId);
    const from = h.cell ? { ...h.cell } : null;
    if (from && sameCell(from, cell)) { this.deploySel = heroId; this.refresh(); return; }
    const others = this.game.unitsAt(cell).filter(u => u.id !== heroId);
    if (others.length >= 2) {
      // Espaço cheio: troca de lugar com um Aliado que está lá (as duas mudanças numa jogada só)
      const ally = others.find(u => mine.includes(u.id));
      if (!ally || !from) { this.hud.toast('Máximo de 2 personagens por Espaço.', '#c0392b'); return; }
      if (!this.act({ type: 'placeMany', moves: [{ heroId, cell }, { heroId: ally.id, cell: from }] })) { this.hud.toast('Não dá para trocar esses dois de lugar.', '#c0392b'); return; }
    } else if (!this.act({ type: 'place', heroId, cell })) return;
    const next = mine.find(id => mine.indexOf(id) > mine.indexOf(heroId));
    this.deploySel = next ?? heroId;
    this.refresh();
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
  private restDraft: { cards: Record<string, string>; tokens: Record<string, string>; res: Record<string, Cell>; picking: string | null;
    /** Heróis mortos cujo lugar de ressurreição o jogador escolheu no mapa. */
    chosen: string[];
    /** Cartas no editor (mesmo da campanha): id da carta, Herói (id do personagem) e a carta no jogo. */
    items: (InvItem & { uid: string })[] } | null = null;

  private openRest() {
    if (!this.isHumanTurn() || this.renderer.busy) return;
    const a = this.game.s.activation;
    if (!this.game.canRest()) { this.hud.toast(this.game.s.extraTurnOn ? 'No turno adicional não dá para Descansar.' : 'Só é possível Descansar se nenhum Herói agiu neste turno.', '#c0392b'); return; }
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
      res, picking: null, chosen: [],
      items: [...heroes.flatMap(h => h.cards.map(c => ({ id: c.defId, to: h.defId, uid: c.uid }))),
        ...(this.game.s.spare?.[g.id] ?? []).map(c => ({ id: c.defId, to: 'pool', uid: c.uid }))],
    };
    for (const c of this.game.s.spare?.[g.id] ?? []) this.restDraft.cards[c.uid] = 'pool';
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
    // o Herói aparece quase transparente onde vai ressuscitar (e sob o mouse enquanto escolhe)
    this.renderer.ghosts = Object.entries(d.res).filter(([id]) => id !== d.picking).map(([id, cell]) => ({ defId: this.game.unit(id).defId, cell }));
    this.renderer.ghostPick = d.picking ? this.game.unit(d.picking).defId : null;
    const tokPool = heroes.flatMap(h => h.tokens);
    const sel = (cur: string, aliveOnly: boolean, attr: string) => `<select ${attr}>${heroes.filter(h => !aliveOnly || h.alive).map(h => `<option value="${h.id}" ${cur === h.id ? 'selected' : ''}>${HEROES[h.defId].name}</option>`).join('')}</select>`;
    // ressuscitar e marcadores de Exploração (por Herói); as cartas ficam no editor (o mesmo da campanha)
    const extras = heroes.map(h => {
      const dead = !h.alive ? `<div class="rb-dead">☠ Morto — ressuscita em <b>${d.res[h.id] ? `(${d.res[h.id].c},${d.res[h.id].r})` : '—'}</b> <button data-pick="${h.id}" class="${d.picking === h.id ? 'on' : ''}">${d.picking === h.id ? 'clique no mapa…' : 'Escolher no mapa'}</button></div>` : '';
      return dead ? `<div class="rb-col"><h4>${h.num}. ${HEROES[h.defId].name}</h4>${dead}</div>` : '';
    }).join('');
    const byDef = (defId: string) => heroes.find(h => h.defId === defId)!;
    // bolsas: marcadores de Exploração trocam de Herói (os de Missão ficam onde estão)
    const tokName = (t: Token) => t.type === 'missao' ? 'Marcador de Missão' : `${TOKEN_INFO[t.type].name}${t.type === 'bau' ? ` (${t.value})` : ''}`;
    const bagToks: BagTok[] = [
      ...heroes.flatMap(h => h.tokens.filter(t => t.type === 'missao').map(t => ({ id: t.id, to: h.defId, img: tokenImageId(t) ? tokenUrl(tokenImageId(t)!) : null, name: tokName(t), locked: true }))),
      ...Object.keys(d.tokens).map(id => { const t = tokPool.find(x => x.id === id)!; const img = tokenImageId(t); return { id, to: this.game.unit(d.tokens[id]).defId, img: img ? tokenUrl(img) : null, name: tokName(t) }; }),
    ];
    const invOpts: InvOptions = {
      bags: {
        toks: bagToks,
        // o morto também recebe: ele ressuscita neste mesmo Descanso (p.18)
        canHold: hd => byDef(hd).alive || this.game.resurrectCells(byDef(hd)).length > 0,
        move: (id, hd) => { if (d.tokens[id] !== undefined) d.tokens[id] = byDef(hd).id; },
      },
      heroes: heroes.map(h => h.defId), color: g.color, discard: false,
      slots: (hd, ids) => {
        const s = this.game.slotsUsed(byDef(hd), ids.map((defId, i) => ({ uid: `_${i}`, defId, exhausted: false, uses: 0 })));
        return { used: s.used, max: s.max, magicExtra: ids.reduce((n, id) => n + (CARDS[id]?.fx.magicSlots ?? 0), 0) };
      },
      curse: hd => { const h = byDef(hd); return h.curse ? `${CURSES[h.curse]?.name}${CURSES[h.curse]?.slot ? ` (ocupa 1 espaço${h.covered ? ` · cobre ${CARDS[h.covered.defId].name}` : ''})` : ''}` : null; },
    };
    // cartas sem Herói podem continuar sem Herói (ficam guardadas até o próximo Descanso)
    const poolErr: string[] = [];
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
        <p>Todas as cartas serão restauradas e os Heróis Atordoados se recuperam. Toque num <b>espaço vazio</b> ou numa <b>carta</b> para trocar as cartas entre os Heróis (marcadores de Missão e Maldições não se movem). Heróis mortos ressuscitam na <b>Área Inicial</b> ou <b>Perto de um Aliado</b> que já está no tabuleiro.</p>
        ${invEditorHtml(d.items, invOpts)}
        ${extras ? `<div class="rb-cols">${extras}</div>` : ''}
        ${err || poolErr.length ? `<div class="rb-err">${[...poolErr, err].filter(Boolean).join('<br/>')}</div>` : ''}
        <div class="rb-btns"><button id="rb-cancel">Cancelar</button><button class="primary" id="rb-ok" ${err || poolErr.length ? 'disabled' : ''}>💤 Descansar</button></div>
      </div>`);
    // o editor muda o Herói de cada carta; o Descanso usa o id do personagem no jogo
    bindInvEditor(el, d.items, invOpts, () => {
      for (const it of d.items) d.cards[it.uid] = it.to === 'pool' ? 'pool' : byDef(it.to).id;
      this.refresh();
    });
    el.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => { b.onclick = () => {
      d.picking = b.dataset.pick!;
      this.renderer.fitCells(this.game.resurrectCells(this.game.unit(d.picking)));
      this.refresh();
    }; });
    (el.querySelector('#rb-cancel') as HTMLElement).onclick = () => this.closeRest();
    (el.querySelector('#rb-ok') as HTMLElement).onclick = async () => {
      // morto sem lugar escolhido: avisa que ele nasce na base (Área Inicial)
      const auto = heroes.filter(h => !h.alive && d.res[h.id] && !d.chosen.includes(h.id));
      if (auto.length && !await gameConfirm({ icon: '💤', title: 'Ressuscitar na base?', body: `Você não escolheu onde ${auto.map(h => `<b>${HEROES[h.defId].name}</b>`).join(' e ')} ${auto.length > 1 ? 'vão' : 'vai'} ressuscitar. Sem escolher, ${auto.length > 1 ? 'nascem' : 'nasce'} na <b>base</b> (Área Inicial da Guilda).`, yes: 'Descansar assim', no: 'Escolher o lugar' })) return;
      if (this.restDraft !== d) return;
      const o = this.restOptions();
      this.closeRest();
      this.act({ type: 'rest', opts: o }, 'descanso');
    };
    this.hud.setHint(d.picking ? 'Clique num Espaço verde para ressuscitar o Herói' : 'Descanso: reorganize e confirme');
  }

  private closeRest() {
    this.restDraft = null;
    this.renderer.ghosts = [];
    this.renderer.ghostPick = null;
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
    if (!d.chosen.includes(d.picking)) d.chosen.push(d.picking);
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
    const dest: Cell[] = [];
    const add = (c: Cell | null | undefined) => { if (c && !cells.some(x => sameCell(x, c))) cells.push(c); };
    const base = (u: { defId: string }) => u.defId.replace(/\d+$/, '');
    const viewer = this.hud.viewerGuild();
    let note = '';
    if (m.rule === 'collect_any' || m.rule === 'collect_own' || m.rule === 'carry' || m.rule === 'step_on' || m.rule === 'escort' || m.rule === 'arena' || m.rule === 'summon') {
      const fits = (t: { type: string; color?: string }) => t.type === 'missao' && (!m.colors?.length || !t.color || m.colors.includes(t.color)) && (m.rule !== 'collect_own' || t.color === viewer);
      for (const [k, toks] of Object.entries(g.s.floor)) if (toks.some(t => fits(t) && (t.faceUp || g.s.debug.revealTokens))) add(parseKey(k));
      for (const u of g.onBoard()) if (u.tokens.some(t => fits(t))) add(u.cell);
      if (m.rule === 'escort') dest.push(...g.escortTargets(m, viewer));
      if (!cells.length && g.map.hiddenMissions?.length) {
        // escondidos entre os marcadores de Exploração: mostra os virados para baixo
        for (const [k, toks] of Object.entries(g.s.floor)) if (toks.some(t => !t.faceUp)) add(parseKey(k));
        note = 'Os marcadores de Missão estão escondidos entre os de Exploração (?)';
      } else if (m.rule === 'carry' && !cells.length) note = 'Os outros Tomos estão escondidos entre os marcadores de Exploração.';
    } else if (m.rule === 'kill_type') {
      for (const u of g.monstersOnBoard()) if (m.types?.includes(base(u))) add(u.cell);
      if (!cells.length) note = `${m.types?.map(t => MONSTERS[t]?.name ?? t).join(' / ')} não está no tabuleiro agora (no Cemitério, na caixa ou ainda não invocado).`;
    } else if (m.rule === 'kill_count') {
      for (const u of g.monstersOnBoard()) add(u.cell);
    } else if (m.kind === 'pvp' && m.targetGuild) {
      for (const u of g.heroesOf(m.targetGuild)) if (u.alive && u.cell) add(u.cell);
    }
    this.hud.showPrize(m);
    if (!cells.length && !dest.length) { this.hud.toast(note || `${m.name}: nenhum objetivo no tabuleiro agora.`, '#c0392b'); return; }
    this.renderer.flashCells(cells, dest);
    const parts = [cells.length ? `${cells.length} objetivo${cells.length > 1 ? 's' : ''} (dourado)` : '', dest.length ? `${dest.length} destino${dest.length > 1 ? 's' : ''} (verde)` : ''].filter(Boolean);
    this.hud.toast(note || `${m.name}: ${parts.join(' · ')}`, '#e0b43a');
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
  /** Campanha online: o anfitrião continua para a Fase de Melhorias (definido pelo lobby). */
  onlineCampaign: ((g: Game) => void) | null = null;
  /** Cliente: o anfitrião voltou para a mesa. */
  onLobbyBack: (l: Lobby) => void = () => {};
  /** Partida encerrada (voltou ao menu): nada mais roda em segundo plano. */
  private stopped = false;

  /** Sai da partida: para a IA, o cronômetro e as animações. */
  stop() {
    if (!this.stopped && !this.deciding) this.flushSave();
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
    const online = this.mode !== 'local';
    const where = this.campaignEnd ? 'Campanha' : this.mode === 'local' ? 'Modo Teste' : 'Online';
    const item = (id: string, icon: string, label: string, sub: string, cls = '', off = false) =>
      `<button id="${id}" class="gm-item ${cls}" ${off ? 'disabled' : ''}><span class="gm-ic">${icon}</span><span class="gm-txt"><b>${label}</b><small>${sub}</small></span></button>`;
    el.innerHTML = `<div class="gm-box">
      <div class="gm-head"><span class="gm-badge">${where}</span><b>${this.game.map.name}</b><small>Rodada ${this.game.s.turn}</small></div>
      ${item('gm-continue', '▶', 'Continuar', 'Voltar para o jogo', 'primary')}
      <div class="gm-grid">
        ${item('gm-undo', '↶', 'Desfazer jogada', host ? (this.history.length ? `Volta: ${this.history[this.history.length - 1].label}` : 'Nenhuma jogada para desfazer') : 'Só o anfitrião', '', !(host && this.history.length))}
        ${online ? item('gm-vote', '🗳️', 'Votar: voltar a jogada', this.poll ? 'Já há uma votação aberta' : 'Todos votam; a maioria decide', '', !!this.poll)
          : item('gm-turn', '⏮', 'Reiniciar turno', 'Volta para o começo deste turno', '', !this.turnStart)}
        ${item('gm-restart', '🔄', 'Reiniciar partida', host ? 'Começa este mapa de novo' : 'Só o anfitrião', '', !host)}
        ${item('gm-lib', '📚', 'Biblioteca', 'Heróis, cartas, regras')}
        ${item('gm-set', '⚙️', 'Configurações', 'Som, tela, velocidade')}
      </div>
      ${item('gm-exit', '🚪', this.campaignEnd ? 'Sair do cenário' : 'Sair da partida', this.campaignEnd ? 'A campanha continua salva' : 'Voltar ao menu inicial', 'danger')}
    </div>`;
    el.classList.remove('hidden');
    const close = () => { el.classList.add('hidden'); this.menuOpen = false; };
    (el.querySelector('#gm-continue') as HTMLElement).onclick = close;
    el.onclick = e => { if (e.target === el) close(); };
    (el.querySelector('#gm-restart') as HTMLElement).onclick = async () => {
      if (!await gameConfirm({ icon: '🔄', title: 'Reiniciar a partida?', body: 'A partida volta para o começo, com o mesmo mapa e os mesmos Heróis.', yes: 'Reiniciar', no: 'Voltar', danger: true })) return;
      close();
      this.restartMatch();
    };
    const gt = el.querySelector('#gm-turn') as HTMLElement | null;
    if (gt) gt.onclick = () => { close(); this.restartTurn(); };
    const gv = el.querySelector('#gm-vote') as HTMLElement | null;
    if (gv) gv.onclick = () => { close(); this.undoVote(true); };
    (el.querySelector('#gm-undo') as HTMLElement).onclick = () => { close(); this.undoMove(); };
    (el.querySelector('#gm-lib') as HTMLElement).onclick = () => { close(); this.openLibrary(); };
    (el.querySelector('#gm-set') as HTMLElement).onclick = () => { close(); this.openSettings(); };
    (el.querySelector('#gm-exit') as HTMLElement).onclick = async () => {
      const body = this.campaignEnd ? 'O progresso <b>deste cenário</b> será perdido. A campanha continua salva e você pode voltar depois.'
        : this.mode === 'host' ? 'Você é o <b>anfitrião</b>: sair encerra a partida para todos os jogadores.' : 'O progresso desta partida será perdido.';
      if (!await gameConfirm({ icon: '🚪', title: this.campaignEnd ? 'Sair do cenário?' : 'Sair da partida?', body, yes: 'Sair', no: 'Continuar jogando', danger: true })) return;
      close();
      this.battle.close();
      this.stop();
      if (this.campaignEnd) { this.campaignEnd = null; this.campaignExit?.(); return; }
      this.leaveOnline();
      this.onExit();
    };
  }

  /** Estado antes do ataque do seu Herói (para "Cancelar ataque" na hora de rolar). */
  private preAttack: { snap: string; histLen: number } | null = null;
  private cancelAttack() {
    const p = this.preAttack;
    if (!p || this.mode === 'client') return;
    this.preAttack = null;
    this.hud.actions.cancelAttack = null;
    this.history.length = Math.min(this.history.length, p.histLen);
    this.restore(p.snap, '✕ Ataque cancelado');
    if (this.mode === 'host') (this.net as HostSession).startGame(this.game.s);
    this.refresh();
  }

  private restartMatch() {
    this.battle.close();
    this.closeRestSilently();
    clearTimeout(this.aiTimer);
    if (this.campaignEnd) { this.campaignRestart?.(); return; }
    if (this.mode === 'host') { this.restartOnline(); return; }
    this.startTest();
  }

  /** Desfazer a última jogada (anfitrião online: todos voltam junto). */
  private undoMove() {
    if (!this.history.length) { this.hud.toast('Nada para desfazer.', '#c0392b'); return; }
    this.closeRestSilently();
    this.undo();
    if (this.mode === 'host') (this.net as HostSession).startGame(this.game.s);
    this.refresh();
  }

  private restartTurn() {
    if (!this.turnStart) return;
    this.closeRestSilently();
    this.undoTurn();
    if (this.mode === 'host') (this.net as HostSession).startGame(this.game.s);
  }

  private closeRestSilently() { this.restDraft = null; this.renderer.ghosts = []; this.renderer.ghostPick = null; this.hud.panel('restbox', null); }

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
  /** Número do cenário na campanha (1 a 6). */
  private campaignScenario = 0;
  private clockShown = '';
  private tickClock(dt: number) {
    const g = this.game;
    if (!g) return;
    const visible = !document.getElementById('hud')?.classList.contains('hidden') && !document.hidden;
    if (visible && !this.stopped && !g.s.deploying?.length && !g.s.winner && !this.menuOpen && dt > 0 && dt < 1000) g.s.elapsed = (g.s.elapsed ?? 0) + dt;
    // linha acima do Placar: cenário da campanha (1/6), rodada e tempo
    const scen = this.campaignEnd ? this.campaignScenario : this.mode !== 'local' && this.lobby?.campaign ? this.lobby.scenario ?? 0 : 0;
    const clock = getSettings().clock;
    const html = `${scen ? `<span title="Cenário da campanha">🗺️ <b>${scen}/6</b></span>` : ''}<span title="Rodada">🔄 Rodada <b>${g.s.turn}</b></span>`
      + (clock ? `<span title="Tempo da partida">⏱ <b>${fmtTime(g.s.elapsed ?? 0)}</b></span>${this.campaignEnd ? `<span title="Tempo total da campanha">🏰 <b>${fmtTime(this.campaignBase + (g.s.elapsed ?? 0))}</b></span>` : ''}` : '');
    if (html !== this.clockShown) { this.clockShown = html; this.hud.setClock(html, fmtTime(g.s.elapsed ?? 0)); }
    // salvamento automático a cada 3 s (fora do meio de uma animação/decisão)
    if (this.autosave && !this.stopped && dt > 0 && (this.saveClock += dt) > 3000 && !this.deciding) { this.saveClock = 0; this.flushSave(); }
  }

  /** Aplica as Configurações (velocidade). */
  applySettings() {
    const st = getSettings();
    this.renderer.resize(); // qualidade do desenho (Configurações > Gráficos)
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
        <label class="chk"><input type="checkbox" id="tp-cap"/> Limite de dados (8 ataque / 6 defesa)</label>
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
    $<HTMLInputElement>('tp-cap').onchange = e => { this.game.s.diceCap = (e.target as HTMLInputElement).checked || undefined; };
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
    this.hud.resetDice();
    const debug = this.game.s.debug;
    const controllers = Object.fromEntries(this.game.guilds().map(g => [g.id, g.controller]));
    const s = JSON.parse(state) as typeof this.game.s;
    s.debug = debug;
    for (const g of Object.values(s.guilds)) if (g && controllers[g.id]) g.controller = controllers[g.id] as 'human' | 'ai';
    if (!this.keepDice) s.rng = (Math.random() * 2 ** 31) | 0; // nova sorte nos dados
    this.game.s = s;
    this.game.drain();
    this.deciding = false;
    if (this.choicePick) { this.choicePick = null; this.hud.monsterPanel(null).classList.remove('over'); }
    this.ais = {};
    document.getElementById('gameover')?.remove();
    this.hud.inspected = null;
    this.hud.selectedCard = null;
    this.renderer.reset();
    this.hud.syncMissions();
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
    (p.querySelector('#tp-cap') as HTMLInputElement).checked = !!g.s.diceCap;
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
    play('end-game');
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
      <div class="go-btns">${this.campaignEnd || (this.mode === 'host' && this.onlineCampaign) ? '<button id="go-camp" class="primary">Continuar campanha ▶</button>' : this.mode === 'client' && this.lobby?.campaign ? '<span class="lb-wait">Aguardando o anfitrião continuar a campanha…</span>' : this.mode === 'local' ? '<button id="go-again" class="primary">Jogar novamente</button><button id="go-menu">Menu</button>' : '<button id="go-menu">Menu</button>'}</div></div>`;
    document.body.append(el);
    const again = el.querySelector('#go-again') as HTMLElement | null;
    if (again) again.onclick = () => { el.remove(); this.startTest(); };
    const menu = el.querySelector('#go-menu') as HTMLElement | null;
    if (menu) menu.onclick = () => { el.remove(); this.stop(); this.leaveOnline(); this.onExit(); };
    const camp = el.querySelector('#go-camp') as HTMLElement | null;
    if (camp) camp.onclick = () => {
      el.remove();
      if (this.mode === 'host' && this.onlineCampaign) { const g = this.game; this.stop(); this.onlineCampaign(g); return; }
      const end = this.campaignEnd; this.campaignEnd = null; this.stop(); end?.(this.game);
    };
  }
}

export { sameCell };
export type { Cell };

const PAN_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
