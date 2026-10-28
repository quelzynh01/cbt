import { play } from '../audio/sfx';
import { BANS_EACH } from '../engine/heroBan';
import { GUILDS, HEROES, HERO_SETS, heroSetName, starterCards, type HeroSet } from '../engine/data';
import { bindUpgradeView, buyHint, campaignFinalHtml, curseLabel, buySummaryHtml, curseRevealHtml, curseSummaryHtml, handFromHtml, miniCards, myHeroesHtml, rankingHtml, resultHtml, upgradeBarHtml, upgradeLayout } from './upgradeViews';
import { draftRounds, picksPerRound, titleHolders, type CampaignState } from '../campaign/campaign';
import { gameConfirm } from './dialog';
import { Game } from '../engine/game';
import { EDITIONS, MAPS, getMap, type Edition } from '../engine/maps';
import type { GameState, GuildId } from '../engine/types';
import { drawFace } from '../render/chibi';
import { ClientSession, HostSession, type Lobby, type Session, type SessionEvents, type SetupMsg, savedName, saveName } from '../net/net';
import {
  HIDDEN, STARTER, type OnlineSetup, advance, allPick, banHeroes, chooseHero, equipErrors, newSetup, pickNextMap, scenarioOver, setEquip, startCampaign,
  upgradeArrange, upgradeBuy, upgradePick, votableMaps, voteMap, curseFlip, curseAuto, upgradeOk,
} from '../net/onlineSetup';
import { CARDS, CURSES } from '../engine/cards';
import { availableScenarios, gameOptions, scenarioLevel, heroSlots, medals, validateInventory, victoryRank } from '../campaign/campaign';
import { heroCard, itemCard, paintCardArt } from './cardview';
import { type MenuPages } from './menu';
import { attachMapPeek, closeMapPeek, mapChoiceCard } from './mapInfo';
import { bindInvEditor, invEditorHtml, poolErrors, type InvItem, type InvOptions } from './inventoryEditor';
import { getSettings, saveSettings } from './settings';
import { listSaves, newSaveId, putSave, removeSave, type OnlineSave } from '../net/onlineSaves';

/** Tela do modo online: criar/entrar numa sala, preparar a partida na "mesa" (como na campanha) e começar. */
export class OnlineLobby {
  private page: HTMLElement;
  private home: HTMLElement;
  private session: Session | null = null;
  private lobby: Lobby | null = null;
  private status = { text: '', kind: '' };
  private chatLog: { from: string; text: string; color?: string }[] = [];
  /** Escolhas locais ainda não enviadas (Herói marcado, distribuição das cartas). */
  private pickHero: string | null = null;
  /** Banimento: Heróis marcados para banir (ainda não enviados). */
  private banSel: string[] = [];
  private equipDraft: InvItem[] | null = null;
  /** Editor de inventário desenhado nesta tela (liga os cliques depois de montar o HTML). */
  private invBind: { items: InvItem[]; opts: InvOptions } | null = null;
  private mode: 'single' | 'campaign' = 'campaign';
  /** Partida salva desta sala (anfitrião): atualizada sozinha na mesa e durante a partida. */
  private saveId: string | null = null;
  /** Partida salva reaberta: o estado do jogo para continuar quando o anfitrião apertar "Continuar". */
  private restoredState: GameState | null = null;
  /** Estado atual da partida (o controlador liga isto no anfitrião). */
  getGameState: () => GameState | null = () => null;
  /** Configurações da partida (padrão: Limite de dados, Pegar 1 carta e Apenas Core Heroes). */
  private diceCap = true;
  private pickOne = true;
  /** Recrutamento: Draft ou All Pick. */
  private pickMode: 'draft' | 'allpick' = 'draft';
  /** All Pick: Heróis marcados (até 3). */
  private apSel: string[] = [];
  private heroSet: HeroSet = 'core';
  /** Campanha online: CBT Clássico ou Beyond the Grave. */
  private edition: Edition = 'classic';
  private lastTick = -1;
  /** Campanha online (anfitrião): a preparação guardada enquanto um cenário é jogado. */
  private stash: OnlineSetup | null = null;
  /** Seleções locais da Fase de Melhorias. */
  private upSel = new Set<number>();
  private arrState: { id: string; to: string }[] | null = null;
  /** Volta da partida para a mesa (esconde o jogo, mostra o menu). */
  onReturn: () => void = () => {};
  onStart: (state: GameState, lobby: Lobby, s: Session) => void = () => {};

  constructor(menu: HTMLElement, _pages: MenuPages) {
    this.home = menu.querySelector('.menu-box') as HTMLElement;
    this.page = document.createElement('div');
    this.page.className = 'menu-page lobby hidden';
    menu.append(this.page);
  }

  private show(html: string) {
    const y = this.page.classList.contains('hidden') ? 0 : this.page.scrollTop;
    this.home.classList.add('hidden');
    this.page.classList.remove('hidden');
    this.page.innerHTML = html;
    this.page.scrollTop = y;
  }

  close() {
    this.page.classList.add('hidden');
    this.home.classList.remove('hidden');
  }

  private leave() {
    this.session?.close();
    this.session = null;
    this.lobby = null;
    this.chatLog = [];
    this.pickHero = null;
    this.equipDraft = null;
    this.close();
  }

  /** Abre a tela inicial do online. `code` pré-preenche "Entrar" (link ?sala=CODE). */
  open(code = '') {
    // a sala da partida que acabou de sair já foi fechada: volta para a entrada (com as partidas salvas)
    if (this.session?.closed) { this.session = null; this.lobby = null; this.chatLog = []; }
    if (this.session && this.lobby) { this.renderRoom(); return; }
    this.show(`
      <div class="mp-head"><button class="mp-back">← Voltar</button><h2>Multiplayer Online</h2></div>
      <div class="lb-entry">
        <label class="lb-field">Seu nome <small>(também é o nome do seu time)</small> <input id="lb-name" maxlength="16" value="${esc(savedName())}" placeholder="Ex.: Raquel"/></label>
        <div class="lb-stack">
          <div class="lb-box"><h3>Criar sala</h3><p>Você será o anfitrião: o jogo roda no seu navegador. Mantenha a aba aberta durante a partida.</p>
            <button class="primary" id="lb-create">👑 Criar sala</button></div>
          <div class="lb-box"><h3>Entrar numa sala</h3><p>Digite o código que o anfitrião enviou.</p>
            <input id="lb-code" maxlength="5" value="${esc(code)}" placeholder="CÓDIGO" class="lb-code-in"/>
            <button class="primary" id="lb-join">🚪 Entrar</button></div>
        </div>
        ${this.savesHtml()}
        <p class="lb-note">Até 4 jogadores, cada um no seu computador. Vagas vazias podem ser preenchidas pela IA.
          Na mesa, como na campanha: cada um recruta seus Heróis escolhendo 1 por rodada e passando o resto, todos votam no mapa e distribuem as cartas iniciais.</p>
        <div class="lb-status" id="lb-status"></div>
      </div>`);
    (this.page.querySelector('.mp-back') as HTMLElement).onclick = () => this.leave();
    const name = () => {
      const v = (this.page.querySelector('#lb-name') as HTMLInputElement).value.trim();
      if (!v) { this.setStatus('Digite seu nome.', 'error'); return null; }
      saveName(v);
      return v;
    };
    (this.page.querySelector('#lb-create') as HTMLElement).onclick = () => {
      const n = name();
      if (!n) return;
      const host = new HostSession(n, [], this.events());
      this.hostHooks(host);
      this.session = host;
      this.saveId = newSaveId();
      this.stash = null;
      this.restoredState = null;
    };
    this.page.querySelectorAll<HTMLElement>('[data-load]').forEach(b => { b.onclick = () => {
      const n = name();
      const sv = listSaves().find(x => x.id === b.dataset.load);
      if (n && sv) this.restore(sv, n);
    }; });
    this.page.querySelectorAll<HTMLElement>('[data-del]').forEach(b => { b.onclick = async () => {
      if (!await gameConfirm({ icon: '🗑', title: 'Apagar a partida salva?', body: 'Não dá para desfazer.', yes: 'Apagar', no: 'Voltar', danger: true })) return;
      removeSave(b.dataset.del!);
      this.open();
    }; });
    (this.page.querySelector('#lb-join') as HTMLElement).onclick = () => {
      const n = name();
      const c = (this.page.querySelector('#lb-code') as HTMLInputElement).value.trim().toUpperCase();
      if (!n) return;
      if (c.length < 5) { this.setStatus('Código inválido.', 'error'); return; }
      this.session = new ClientSession(c, n, [], this.events());
    };
  }

  private hostHooks(host: HostSession) {
    host.onSetupMsg = (g, m) => this.hostSetupMsg(g, m);
    host.onSeatsChanged = () => { if (host.lobby.restored) host.pushLobby(); else if (host.lobby.setup && !host.lobby.started) this.hostAdvance(); };
  }

  // ------------------------------------------------------------------ partidas salvas (anfitrião)
  private savesHtml(): string {
    const all = listSaves();
    if (!all.length) return '';
    const when = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const rows = all.map(sv => {
      const l = sv.lobby;
      const camp = !!(l.campaign || sv.stash?.mode === 'campaign' || l.setup?.mode === 'campaign');
      const where = sv.state ? `${MAPS[sv.state.mapId]?.name ?? sv.state.mapId} · rodada ${sv.state.turn}` : l.setup?.step?.startsWith('upgrade') ? 'Fase de Melhorias' : 'Na mesa (preparação)';
      const who = l.seats.map(s => `<span class="dot" style="background:${GUILDS[s.guild].color}"></span>${esc(s.ai ? 'IA' : s.name)}`).join(' ');
      return `<div class="lb-save"><div><b>${camp ? `🏰 Campanha${l.scenario ? ` · cenário ${l.scenario}/6` : ''}` : '⚔ Partida única'}</b> — ${esc(where)}
          <small>${who} · salvo ${when(sv.savedAt)} · sala ${esc(l.code)}</small></div>
        <button class="primary" data-load="${sv.id}">▶ Continuar</button><button data-del="${sv.id}" title="Apagar">🗑</button></div>`;
    }).join('');
    return `<div class="lb-box lb-saves"><h3>💾 Partidas salvas</h3><p>Você é o anfitrião delas: reabra a sala e seus amigos entram com o mesmo código (ou link) e o mesmo nome.</p>${rows}</div>`;
  }

  /** Anfitrião: grava a partida desta sala (mesa ou partida em andamento). Acabou? Apaga. */
  persist(stateJson?: string) {
    if (!this.session?.isHost || !this.saveId) return;
    const host = this.session as HostSession;
    const l = host.lobby;
    if (l.restored || (!l.setup && !l.started)) return;
    const state: GameState | null = l.started ? (stateJson ? JSON.parse(stateJson) : this.getGameState()) : null;
    const st = l.setup ?? this.stash;
    const over = st?.step === 'final' || (!!state?.winner && st?.mode !== 'campaign');
    if (over) { removeSave(this.saveId); return; }
    // campanha: o cenário acabou, mas a mesa ainda não voltou (a Fase de Melhorias é gravada quando voltar)
    if (state?.winner) return;
    putSave({ id: this.saveId, savedAt: Date.now(), lobby: JSON.parse(JSON.stringify({ ...l, restored: undefined })), stash: this.stash ? JSON.parse(JSON.stringify(this.stash)) : null, state });
  }

  /** Reabre uma partida salva: a sala espera os jogadores voltarem. */
  private restore(sv: OnlineSave, name: string) {
    const l: Lobby = JSON.parse(JSON.stringify(sv.lobby));
    l.started = false;
    l.roulette = false;
    const host = new HostSession(name, [], this.events(), l);
    this.hostHooks(host);
    this.session = host;
    this.saveId = sv.id;
    this.stash = sv.stash;
    this.restoredState = sv.state;
  }

  /** Anfitrião: continua a partida salva (quem não voltou fica desconectado; dá para passar a vaga para a IA). */
  private continueSaved() {
    const host = this.session as HostSession;
    const l = host.lobby;
    l.restored = false;
    for (const s of l.seats) if (!s.connected && !s.ai) s.lostAt = Date.now();
    const state = this.restoredState;
    this.restoredState = null;
    if (state) {
      for (const s of l.seats) { const gs = state.guilds[s.guild]; if (gs) gs.controller = s.ai ? 'ai' : 'human'; }
      host.startGame(state);
      this.close();
      this.onStart(state, l, host);
    } else this.hostAdvance();
  }

  /** Sala de uma partida salva reaberta: quem já voltou e o botão de continuar. */
  private restoredRoom() {
    const l = this.lobby!;
    const host = this.session?.isHost;
    const link = `${location.origin}${location.pathname}?sala=${l.code}`;
    const humans = l.seats.filter(s => !s.ai);
    const back = humans.filter(s => s.connected).length;
    const seats = l.seats.map(s => `<div class="lb-seat" style="--gc:${GUILDS[s.guild].color}">
        <div class="lb-seat-h"><span class="dot" style="background:${GUILDS[s.guild].color}"></span><b>${esc(s.ai ? 'IA' : s.name)}</b>${s.host ? '<span class="tag-host">👑 anfitrião</span>' : ''}</div>
        <div class="lb-seat-g">${s.team ? `<b>${esc(s.team)}</b> · ` : ''}${GUILDS[s.guild].name}</div>
        <div class="lb-seat-hero">${s.ai ? '<i>IA</i>' : s.connected ? '✅ voltou' : '⏳ aguardando…'}
          ${host && !s.host && (!s.ai || s.name !== 'IA') ? `<button data-seatai="${s.guild}" data-v="${s.ai ? 0 : 1}">${s.ai ? 'Devolver ao jogador' : 'IA assume'}</button>` : ''}</div>
      </div>`).join('');
    this.show(`
      <div class="mp-head"><button class="mp-back">← Sair da sala</button><h2>💾 Partida salva</h2></div>
      <div class="lb-room">
        <div class="lb-codebox"><span>Código da sala</span><b>${l.code}</b>
          <button id="lb-copy">📋 Copiar link</button><small>${esc(link)}</small></div>
        <p class="lb-note">Os jogadores entram com este código (ou link) usando <b>o mesmo nome de antes</b> e voltam para a vaga deles.</p>
        <div class="lb-seats">${seats}</div>
        <div class="lb-actions">${host ? `<span class="lb-sum">${back} de ${humans.length} jogadores na sala</span>
          <button class="primary" id="lb-continue">▶ Continuar partida</button>` : '<span class="lb-wait">Aguardando o anfitrião continuar a partida…</span>'}</div>
        <p class="lb-note">Quem não voltar fica desconectado: na partida, o anfitrião pode passar a vaga para a IA, e ela volta para o jogador quando ele entrar.</p>
        ${this.chatHtml()}
        <div class="lb-status ${this.status.kind}" id="lb-status">${esc(this.status.text)}</div>
      </div>`);
    this.bindChat();
    (this.page.querySelector('.mp-back') as HTMLElement).onclick = () => this.leave();
    (this.page.querySelector('#lb-copy') as HTMLElement).onclick = () => {
      navigator.clipboard?.writeText(link).then(() => this.setStatus('Link copiado! Envie para seus amigos.', 'ok'), () => this.setStatus(link));
    };
    this.page.querySelectorAll<HTMLElement>('[data-seatai]').forEach(b => { b.onclick = () => (this.session as HostSession).setSeatAI(b.dataset.seatai as GuildId, b.dataset.v === '1'); });
    const go = this.page.querySelector('#lb-continue') as HTMLElement | null;
    if (go) go.onclick = () => this.continueSaved();
  }

  private events(): SessionEvents {
    return {
      status: (text, kind) => this.setStatus(text, kind),
      lobby: l => { this.lobby = l; if (!l.started) this.renderRoom(); },
      start: (state, l) => { this.lobby = l; this.close(); this.onStart(state, l, this.session!); },
      update: () => {},
      reject: r => this.setStatus(r, 'error'),
      chat: (from, text, color) => { this.chatLog.push({ from, text, color }); if (this.chatLog.length > 50) this.chatLog.shift(); this.renderChat(); },
    };
  }

  private setStatus(text: string, kind = '') {
    this.status = { text, kind };
    const el = this.page.querySelector('#lb-status');
    if (el) { el.textContent = text; el.className = `lb-status ${kind}`; }
    if (kind === 'error' && this.session && !this.lobby) { this.session.close(); this.session = null; }
  }

  private myGuild(): GuildId | null {
    return this.lobby?.seats.find(s => s.clientId === this.session?.me)?.guild ?? null;
  }

  // ------------------------------------------------------------------ sala (antes da preparação)
  private renderRoom() {
    const l = this.lobby!;
    if (l.restored) { this.restoredRoom(); return; }
    if (l.setup) { this.renderTable(); return; }
    const host = this.session?.isHost;
    const me = this.session!.me;
    const link = `${location.origin}${location.pathname}?sala=${l.code}`;
    const slots = [0, 1, 2, 3].map(i => {
      const s = l.seats[i];
      if (!s) return `<div class="lb-seat empty">${host ? '<button class="lb-addai">+ Adicionar IA</button>' : '<span>Vaga livre</span>'}</div>`;
      return `<div class="lb-seat" style="--gc:${GUILDS[s.guild].color}">
        <div class="lb-seat-h"><span class="dot" style="background:${GUILDS[s.guild].color}"></span><b>${esc(s.ai ? 'IA' : s.name)}</b>
          ${s.host ? '<span class="tag-host">👑 anfitrião</span>' : ''}${s.clientId === me ? '<span class="tag-me">você</span>' : ''}
          ${host && !s.host ? `<button class="lb-kick" data-id="${s.clientId}">✕</button>` : ''}</div>
        <div class="lb-seat-g">${s.team ? `<b>${esc(s.team)}</b> · ` : ''}${GUILDS[s.guild].name}</div>
        <div class="lb-seat-hero"><i>${s.ai ? 'a IA recruta na mesa' : 'recruta os Heróis na mesa'}</i></div>
      </div>`;
    }).join('');
    const canStart = l.seats.length >= 2;
    this.show(`
      <div class="mp-head"><button class="mp-back">← Sair da sala</button><h2>Sala online</h2></div>
      <div class="lb-room">
        <div class="lb-codebox"><span>Código da sala</span><b>${l.code}</b>
          <button id="lb-copy">📋 Copiar link</button><small>${esc(link)}</small></div>
        <div class="lb-seats">${slots}</div>
        <div class="lb-actions">
          ${host ? `<span class="lb-sum">${this.mode === 'campaign' ? `🏰 Campanha ${this.edition === 'btg' ? 'Beyond the Grave' : 'CBT Clássico'} (6 cenários)` : '⚔ Partida única'}${this.diceCap ? ' · Limite de dados' : ''}${this.mode === 'campaign' && this.pickOne ? ' · Pegar 1 carta' : ''} · ${heroSetName(this.heroSet)} · ${this.pickMode === 'allpick' ? 'All Pick' : 'Draft'}</span>
            <button id="lb-cfg">⚙️ Configurações da partida</button>
            <button class="primary" id="lb-start" ${canStart ? '' : 'disabled'}>▶ Ir para a mesa</button>` : '<span class="lb-wait">Aguardando o anfitrião levar todos para a mesa…</span>'}
        </div>
        <p class="lb-note">Na mesa: recrutamento dos Heróis (3 rodadas, escolhas escondidas), votação do mapa e distribuição das cartas iniciais. O mapa e os Heróis só são definidos lá.</p>
        ${this.chatHtml()}
        <div class="lb-status ${this.status.kind}" id="lb-status">${esc(this.status.text)}</div>
      </div>`);
    this.bindChat();
    (this.page.querySelector('.mp-back') as HTMLElement).onclick = () => this.leave();
    (this.page.querySelector('#lb-copy') as HTMLElement).onclick = () => {
      navigator.clipboard?.writeText(link).then(() => this.setStatus('Link copiado! Envie para seus amigos.', 'ok'), () => this.setStatus(link));
    };
    this.page.querySelectorAll<HTMLElement>('.lb-addai').forEach(b => { b.onclick = () => (this.session as HostSession).addAI(); });
    this.page.querySelectorAll<HTMLElement>('.lb-kick').forEach(b => { b.onclick = () => (this.session as HostSession).removeSeat(b.dataset.id!); });
    const cfg = this.page.querySelector('#lb-cfg') as HTMLElement | null;
    if (cfg) cfg.onclick = () => this.matchSettings();
    const st = this.page.querySelector('#lb-start') as HTMLElement | null;
    if (st) st.onclick = () => this.startSetup();
  }

  /** Janela "Configurações da partida" (anfitrião): modo, dificuldade da IA e regras. */
  private matchSettings() {
    document.getElementById('matchcfg')?.remove();
    const el = document.createElement('div');
    el.id = 'matchcfg';
    const draw = () => {
      el.innerHTML = `<div class="mc-cfg">
        <div class="gd-title">⚙️ Configurações da partida</div>
        <label class="mcf-row">Modo <select id="mc-mode"><option value="campaign" ${this.mode === 'campaign' ? 'selected' : ''}>🏰 Campanha (6 cenários)</option><option value="single" ${this.mode === 'single' ? 'selected' : ''}>⚔ Partida única</option></select></label>
        ${this.mode === 'campaign' ? `<label class="mcf-row">Campanha <select id="mc-ed">${EDITIONS.map(e => `<option value="${e.id}" ${this.edition === e.id ? 'selected' : ''}>${e.id === 'btg' ? '💀 CBT Beyond the Grave' : '⚔️ CBT Clássico'}</option>`).join('')}</select></label>` : ''}
        <label class="mcf-row">Heróis <select id="mc-heroes">${HERO_SETS.map(([v, n]) => `<option value="${v}" ${this.heroSet === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="mcf-row">Recrutamento <select id="mc-pick"><option value="draft">🃏 Draft — mãos que passam para a esquerda</option><option value="allpick" ${this.pickMode === 'allpick' ? 'selected' : ''}>🌟 All Pick — cada um escolhe 3 de todos os Heróis</option></select></label>
        <label class="set-opt"><input type="checkbox" id="mc-cap" ${this.diceCap ? 'checked' : ''}/> <b>Limite de dados</b> — no máximo 8 dados de ataque e 6 de defesa por rolagem. Sem marcar, ilimitado.</label>
        ${this.mode === 'campaign' ? `<label class="set-opt"><input type="checkbox" id="mc-one" ${this.pickOne ? 'checked' : ''}/> <b>Pegar 1 carta</b> — na Fase de Melhorias cada um pega 1 carta por rodada e passa o resto (em vez de 2).</label>` : ''}
        <div class="gd-btns"><button class="primary" id="mc-ok">✔ Pronto</button></div>
      </div>`;
      (el.querySelector('#mc-mode') as HTMLSelectElement).onchange = e => { this.mode = (e.target as HTMLSelectElement).value as 'single' | 'campaign'; draw(); };
      (el.querySelector('#mc-cap') as HTMLInputElement).onchange = e => { this.diceCap = (e.target as HTMLInputElement).checked; };
      (el.querySelector('#mc-pick') as HTMLSelectElement).onchange = e => { this.pickMode = (e.target as HTMLSelectElement).value as 'draft' | 'allpick'; };
      (el.querySelector('#mc-heroes') as HTMLSelectElement).onchange = e => { this.heroSet = (e.target as HTMLSelectElement).value as HeroSet; };
      const ed = el.querySelector('#mc-ed') as HTMLSelectElement | null;
      // Beyond the Grave: Chaz e Darryn entram junto (dá para mudar em Heróis)
      if (ed) ed.onchange = () => { this.edition = ed.value as Edition; if (this.heroSet !== 'all') this.heroSet = this.edition === 'btg' ? 'btg' : 'core'; draw(); };
      const one = el.querySelector('#mc-one') as HTMLInputElement | null;
      if (one) one.onchange = () => { this.pickOne = one.checked; };
      (el.querySelector('#mc-ok') as HTMLElement).onclick = () => { el.remove(); this.renderRoom(); };
    };
    el.onpointerdown = e => { if (e.target === el) { el.remove(); this.renderRoom(); } };
    draw();
    document.body.append(el);
  }

  // ------------------------------------------------------------------ anfitrião: preparação
  private startSetup() {
    const host = this.session as HostSession;
    const l = host.lobby;
    l.setup = newSetup(l.seats.map(s => ({ guild: s.guild, ai: s.ai })), getSettings().ai, Math.random, this.mode, this.diceCap, this.mode === 'campaign' && this.pickOne, this.heroSet, this.edition, this.pickMode);
    this.hostAdvance();
  }

  /** Jogada da preparação (de qualquer jogador; o anfitrião também passa por aqui). */
  private hostSetupMsg(g: GuildId, m: SetupMsg) {
    const st = (this.session as HostSession).lobby.setup;
    if (!st || (this.session as HostSession).lobby.restored) return;
    if (m.t === 'ban') banHeroes(st, g, m.ids);
    else if (m.t === 'allpick') allPick(st, g, m.ids);
    else if (m.t === 'draft') chooseHero(st, g, m.hero);
    else if (m.t === 'vote') voteMap(st, g, m.map);
    else if (m.t === 'equip') setEquip(st, g, m.inv);
    else if (m.t === 'upPick') upgradePick(st, g, m.ids);
    else if (m.t === 'upBuy') upgradeBuy(st, g, m.ids);
    else if (m.t === 'upArr') upgradeArrange(st, g, m.inv);
    else if (m.t === 'pickmap') pickNextMap(st, g, m.map);
    else if (m.t === 'curseFlip') curseFlip(st, g);
    else if (m.t === 'upOk') upgradeOk(st, g);
    this.hostAdvance();
  }

  private hostAdvance() {
    const host = this.session as HostSession;
    const l = host.lobby;
    const st = l.setup;
    if (!st) return;
    // partida salva reaberta: a mesa espera o anfitrião continuar
    if (l.restored) { host.pushLobby(); return; }
    // quem caiu na preparação (Maldições, compras…) tem um tempo para voltar; depois disso a IA assume a vaga
    // (para a mesa não travar) — e devolve quando ele reconectar
    const GRACE = 90_000;
    clearTimeout(this.graceTimer);
    for (const s of l.seats) if (!s.connected && !s.ai) {
      const left = GRACE - (Date.now() - (s.lostAt ?? 0));
      if (left <= 0) { s.ai = true; s.autoAI = true; }
      else this.graceTimer = window.setTimeout(() => this.hostAdvance(), left + 200);
    }
    advance(st, l.seats.map(s => ({ guild: s.guild, ai: s.ai })));
    host.pushLobby();
    this.persist();
    if (st.step === 'done') setTimeout(() => this.startGame(), 1500);
    // Maldições: a IA vira as cartas dela e, com todas viradas, a mesa passa para o próximo Herói (com tempo para todos verem)
    clearTimeout(this.curseTimer);
    const up = st.camp?.upgrade;
    if (st.step === 'upgrade-curses' && up && (up.curseStep ?? 0) < up.cursesDrawn.length) {
      const cur = up.cursesDrawn[up.curseStep ?? 0];
      const all = (up.curseFlipped ?? 0) >= cur.drawn.length;
      this.curseTimer = window.setTimeout(() => {
        if (curseAuto(st, l.seats.map(x => ({ guild: x.guild, ai: x.ai })))) this.hostAdvance();
      }, all ? 2600 : (up.curseFlipped ? 900 : 1300));
    }
  }
  private curseTimer = 0;
  private graceTimer = 0;

  /** Campanha online (anfitrião): o cenário acabou — volta todos para a mesa na Fase de Melhorias. */
  get isCampaign() { return !!this.stash; }
  afterScenario(game: Game) {
    const host = this.session as HostSession;
    const st = this.stash;
    if (!st) return;
    const l = host.lobby;
    scenarioOver(st, game);
    l.setup = st;
    l.started = false;
    this.resume(l);
    this.hostAdvance();
  }

  /** Volta para a mesa (anfitrião depois do cenário; clientes quando o anfitrião volta). */
  resume(l: Lobby) {
    if (!this.session) return;
    this.lobby = l;
    this.session.ev = this.events();
    if (this.session.isHost) {
      const host = this.session as HostSession;
      host.onSetupMsg = (g, m) => this.hostSetupMsg(g, m);
      host.onSeatsChanged = () => { if (host.lobby.setup && !host.lobby.started) this.hostAdvance(); };
    }
    this.upSel.clear();
    this.arrState = null;
    this.onReturn();
    this.renderRoom();
  }

  /** Envia a minha jogada da preparação. */
  private send(m: SetupMsg) {
    if (this.session?.isHost) this.hostSetupMsg(this.myGuild()!, m);
    else (this.session as ClientSession).sendSetup(m);
  }

  /** Anfitrião: monta as Guildas com os Heróis recrutados e as cartas distribuídas, e começa. */
  private startGame() {
    const host = this.session as HostSession;
    const l = host.lobby;
    const st = l.setup;
    if (!st || st.step !== 'done' || l.started) return;
    let game: Game;
    if (st.mode === 'campaign') {
      if (!st.camp) startCampaign(st, l.seats);
      const c = st.camp!;
      for (const g of c.guilds) g.controller = l.seats.find(s => s.guild === g.id)?.ai ? 'ai' : 'human';
      const map = c.played.length ? st.nextMap! : st.map!;
      const opts = gameOptions(c);
      l.mapId = map;
      game = Game.create(getMap(map), { ...opts, deploy: true });
      this.stash = st;
    } else {
      l.mapId = st.map;
      game = Game.create(getMap(st.map), {
        players: l.seats.map(s => ({
          guild: s.guild, controller: s.ai ? 'ai' as const : 'human' as const, name: s.team,
          heroes: st.picks[s.guild], cards: st.equip[s.guild] ?? undefined,
        })),
        deploy: true, diceCap: st.diceCap,
      });
    }
    game.drain();
    l.campaign = st.mode === 'campaign';
    // placar da campanha visível para todos durante o cenário (menu do Esc)
    l.camp = st.mode === 'campaign' && st.camp ? JSON.parse(JSON.stringify({ ...st.camp, upgrade: undefined })) : undefined;
    // roleta de quem começa: partida avulsa ou 1º cenário da campanha (nos outros começa quem está à esquerda do vencedor)
    l.scenario = st.mode === 'campaign' ? (st.camp?.played.length ?? 0) + 1 : 1;
    l.roulette = st.mode !== 'campaign' || l.scenario === 1;
    l.setup = undefined;
    host.startGame(game.s);
    this.persist(JSON.stringify(game.s));
    this.close();
    this.onStart(game.s, l, host);
  }

  // ------------------------------------------------------------------ a mesa
  private renderTable() {
    const l = this.lobby!;
    const st = l.setup!;
    const me = this.myGuild();
    const name = (g: GuildId) => { const s = l.seats.find(x => x.guild === g); return s ? (s.ai ? 'IA' : s.name) : g; };
    const camp = st.camp;
    const isHumanG = (g: GuildId) => camp ? camp.guilds.find(x => x.id === g)?.controller === 'human' : !l.seats.find(s => s.guild === g)?.ai;
    const done = (g: GuildId) => st.step === 'ban' ? !!st.bans?.[g] : st.step === 'allpick' ? (st.picks[g] ?? []).length === 3 : st.step === 'draft' ? !!st.choice[g] : st.step === 'vote' ? !!st.votes[g] : st.step === 'equip' ? !!st.equip[g]
      : st.step === 'upgrade-draft' ? !isHumanG(g) || !!st.upPick[g] : st.step === 'upgrade-buy' ? !isHumanG(g) || !!st.upBuy[g]
      : st.step === 'upgrade-arrange' ? !isHumanG(g) || !!st.upArr[g] : st.step === 'choose' ? camp?.chooser !== g || !!st.nextMap
      : st.step === 'upgrade-summary' || st.step === 'upgrade-curses' ? !isHumanG(g) || !!st.upOk?.[g] : true;
    const verb = st.step === 'ban' ? ['baniu', 'banindo…'] : st.step === 'draft' || st.step === 'allpick' || st.step === 'upgrade-draft' ? ['escolheu', 'escolhendo…'] : st.step === 'vote' ? ['votou', 'votando…']
      : st.step === 'upgrade-buy' ? ['comprou', 'comprando…'] : st.step === 'choose' ? ['pronto', 'escolhendo o cenário…']
      : st.step === 'upgrade-summary' || st.step === 'upgrade-curses' ? ['pronto', 'vendo…'] : ['pronto', 'distribuindo cartas…'];
    if (st.tick !== this.lastTick) {
      if (this.lastTick >= 0 && st.news) this.setStatus(st.news, 'ok');
      this.lastTick = st.tick;
      this.pickHero = null;
      this.banSel = [];
      this.upSel.clear();
      if (st.step !== 'upgrade-arrange') this.arrState = null;
    }
    const back = (n: number) => Array.from({ length: n }, () => '<div class="cback"><span>CBT</span></div>').join('');
    const face = (h: string) => `<div class="cface" title="${HEROES[h]?.name ?? ''}"><canvas width="64" height="64" data-face="${h}"></canvas><small>${HEROES[h]?.name ?? ''}</small></div>`;
    const others = st.order.filter(g => g !== me);
    const seat = (g: GuildId) => {
      const s = l.seats.find(x => x.guild === g);
      const hand = st.hands[g] ?? [];
      const picks = st.picks[g] ?? [];
      return `<div class="tb-seat ${g === me ? 'me' : ''}" style="--gc:${GUILDS[g].color}">
        <div class="tb-name"><span class="dot" style="background:${GUILDS[g].color}"></span><b>${esc(name(g))}</b><small>${s?.team ? esc(s.team) : GUILDS[g].name.split(' (')[0]}</small>
          ${s && !s.connected ? '<span class="tb-off">desconectado (IA assumiu)</span>' : ''}
          <span class="tb-status ${done(g) ? 'ok' : 'wait'}">${st.step === 'done' ? '✓ pronto' : done(g) ? `✓ ${verb[0]}` : `⏳ ${verb[1]}`}</span></div>
        ${g !== me && hand.length ? `<div class="tb-row"><small>Mão</small>${back(hand.length)}</div>` : ''}
        <div class="tb-row"><small>Recrutados</small>${picks.map(h => h === HIDDEN ? back(1) : face(h)).join('') || '<i class="muted">nenhum ainda</i>'}${st.step === 'draft' && st.choice[g] ? '<div class="cback chosen"><span>✓</span></div>' : ''}</div>
      </div>`;
    };
    let center = '';
    // Fase de Melhorias: a mesa inteira para a etapa (sem as cadeiras em cima e embaixo)
    const upgrading = st.step.startsWith('upgrade') && !!me && !!camp?.upgrade;
    if (st.step === 'ban' && me) {
      const pool = st.banPool ?? [];
      const mine = st.bans?.[me] ?? null;
      const sel = this.banSel.length ? this.banSel : mine ?? [];
      const ready = this.banSel.length === BANS_EACH;
      center = `<h3>Banimento de Heróis</h3>
        <p>O jogo sorteou <b>${pool.length} Heróis</b>. Cada jogador bane ${BANS_EACH} (escondido até todos banirem). Os que sobrarem são embaralhados e vão para o recrutamento.</p>
        <div class="hgrid cards3 ban-grid">${pool.map(h => heroCard(h, sel.includes(h) ? 'picked banned' : '', `data-ban="${h}"`)).join('')}</div>
        <div class="tb-actions">${mine && !this.banSel.length
          ? `<span class="tb-wait">✓ Você baniu <b>${mine.map(h => HEROES[h].name).join(' e ')}</b> (clique em outros para trocar). Aguardando: ${st.order.filter(g => !st.bans?.[g]).map(g => esc(name(g))).join(', ') || '…'}</span>`
          : `<button class="primary" id="tb-ban" ${ready ? '' : 'disabled'}>${ready ? `🚫 Banir ${this.banSel.map(h => HEROES[h].name).join(' e ')}` : `Escolha ${BANS_EACH - this.banSel.length} Herói(s)`}</button>`}</div>`;
    } else if (st.step === 'allpick' && me) {
      // All Pick: todos os Heróis; os já escolhidos por outra Guilda aparecem marcados (quem confirma primeiro fica com o Herói)
      const pool = st.pool ?? [];
      const mine = st.picks[me] ?? [];
      const owner = (h: string) => st.order.find(g => g !== me && (st.picks[g] ?? []).includes(h));
      this.apSel = this.apSel.filter(h => pool.includes(h) && !owner(h));
      const n = this.apSel.length;
      center = `<h3>All Pick — escolha 3 Heróis</h3>
        <p>Todos os <b>${pool.length} Heróis</b> disponíveis. Quem confirma primeiro fica com o Herói; os já escolhidos por outra Guilda ficam marcados. As IAs escolhem depois, entre os que sobrarem.</p>
        <div class="hgrid cards3 ap-grid">${pool.map(h => { const o = owner(h); return `<div class="ap-cell ${o ? 'taken' : ''}" ${o ? `style="--gc:${GUILDS[o].color}"` : ''}>${heroCard(h, (mine.includes(h) || this.apSel.includes(h)) ? 'picked' : '', mine.length === 3 || o ? '' : `data-ap="${h}"`)}${o ? `<span class="ap-tag">${esc(name(o))}</span>` : ''}</div>`; }).join('')}</div>
        <div class="tb-actions">${mine.length === 3
          ? `<span class="tb-wait">✓ Você recrutou <b>${mine.map(h => HEROES[h].name).join(', ')}</b>. Aguardando: ${st.order.filter(g => (st.picks[g] ?? []).length !== 3 && !l.seats.find(s => s.guild === g)?.ai).map(g => esc(name(g))).join(', ') || '…'}</span>`
          : `<button class="primary" id="tb-ap" ${n === 3 ? '' : 'disabled'}>${n === 3 ? `✔ Recrutar ${this.apSel.map(h => HEROES[h].name).join(', ')}` : `Escolha mais ${3 - n}`}</button>`}</div>`;
    } else if (st.step === 'draft' && me) {
      const hand = st.hands[me] ?? [];
      const chosen = st.choice[me];
      center = `<h3>Recrutamento — rodada ${st.round + 1} de 3</h3>
        <p>Escolha 1 Herói da sua mão. Os outros escolhem ao mesmo tempo, sem ver a sua escolha; quando todos escolherem, as cartas que sobraram passam para o jogador à esquerda.</p>
        <div class="hgrid cards3 tb-hand">${hand.map(h => heroCard(h, (this.pickHero ?? chosen) === h ? 'picked' : '', `data-h="${h}"`)).join('')}</div>
        <div class="tb-actions">${chosen
          ? `<span class="tb-wait">✓ Você escolheu <b>${HEROES[chosen].name}</b>. Aguardando: ${st.order.filter(g => !st.choice[g]).map(g => esc(name(g))).join(', ') || '…'}</span>${this.pickHero && this.pickHero !== chosen ? `<button class="primary" id="tb-pick">Trocar para ${HEROES[this.pickHero].name}</button>` : ''}`
          : `<button class="primary" id="tb-pick" ${this.pickHero ? '' : 'disabled'}>${this.pickHero ? `Escolher ${HEROES[this.pickHero].name}` : 'Clique num Herói'}</button>`}</div>`;
    } else if (st.step === 'vote' && me) {
      const mine = st.votes[me];
      center = `<h3>Votação do mapa</h3><p>Todos votam ao mesmo tempo; os votos aparecem quando todos votarem. Empate = sorteio entre os mais votados.</p>
        ${st.mode === 'campaign' ? '<p><b>Campanha:</b> o primeiro cenário é do Círculo Exterior.</p>' : ''}
        <div class="cp-votes tb-votes">${votableMaps(st).map(id => MAPS[id]).map(m => mapChoiceCard(m, { cls: mine === m.id ? 'sel' : '', attrs: `data-v="${m.id}"`, sub: `${m.circle} · ${m.missions.pve.map(x => x.name).join(' · ')}` })).join('')}</div>
        ${mine ? `<div class="tb-actions"><span class="tb-wait">✓ Seu voto: <b>${MAPS[mine].name}</b> (pode mudar). Aguardando: ${st.order.filter(g => !st.votes[g]).map(g => esc(name(g))).join(', ')}</span></div>` : ''}`;
    } else if (st.step === 'equip' && me) {
      const heroes = st.picks[me] ?? [];
      // Beyond the Grave: a Foice chega sem Herói; equipe 5 das 6 cartas e descarte 1
      const btg = st.mode === 'campaign' && st.edition === 'btg';
      if (!this.equipDraft) this.equipDraft = starterCards(btg ? 'btg' : undefined).map((cid, i) => ({ id: cid, to: cid === 'foice' ? 'pool' : heroes[i % heroes.length] }));
      const items = this.equipDraft;
      const inv = Object.fromEntries(heroes.map(h => [h, items.filter(x => x.to === h).map(x => x.id)]));
      const errs = [...equipErrors(st, me, inv), ...poolErrors(items, false)];
      const ready = !!st.equip[me];
      // mesmo depois de "Pronto" dá para reorganizar enquanto alguém ainda escolhe (cada mudança é enviada de novo)
      const eqOpts: InvOptions = { heroes, color: GUILDS[me].color, discard: btg, slots: (_h, cards) => ({ used: cards.length, max: 4, magicExtra: cards.reduce((s, id) => s + (CARDS[id]?.fx.magicSlots ?? 0), 0) }) };
      this.invBind = { items, opts: eqOpts };
      center = `<h3>Equipamento inicial — ${MAPS[st.map!].name}</h3>
        ${st.tie ? `<p>Empate entre ${st.tie.map(id => MAPS[id].name).join(' e ')}: sorteado <b>${MAPS[st.map!].name}</b>.</p>` : ''}
        <table class="cp-vtable">${st.order.map(g => `<tr><td><span class="dot" style="background:${GUILDS[g].color}"></span> ${esc(name(g))}</td><td>${st.votes[g] ? MAPS[st.votes[g]!]?.name ?? '' : ''}</td></tr>`).join('')}</table>
        <p>Equipe seus Heróis: clique num <b>espaço vazio</b> ou numa <b>carta</b> para escolher qual carta vai nele.</p>
        ${btg ? '<p class="lb-note">💀 <b>Beyond the Grave:</b> além das 5 cartas iniciais você recebe a <b>Foice</b>, mas a Guilda fica só com 5 — equipe 5 e <b>descarte 1</b>.</p>' : ''}
        ${invEditorHtml(items, eqOpts)}
        ${errs.length ? `<div class="lb-warn">${errs.join('<br/>')}</div>` : ''}
        <div class="tb-actions">${ready
          ? `<span class="tb-wait">✓ Pronto! Aguardando: ${st.order.filter(g => !st.equip[g]).map(g => esc(name(g))).join(', ')} — você ainda pode trocar as cartas até todos terminarem.</span>`
          : `<button class="primary" id="tb-equip" ${errs.length ? 'disabled' : ''}>✔ Pronto</button>`}</div>`;
    } else if (upgrading) {
      center = this.upgradeHtml(st, me!);
    } else if (st.step === 'choose' && camp) {
      const av = availableScenarios(camp);
      const chooser = camp.chooser;
      center = `<h3>Próximo cenário (${camp.played.length + 1} de 6)</h3>
        <p>Quem venceu o último cenário escolhe: <b>${esc(name(chooser))}</b>.</p>
        <div class="cp-votes tb-votes">${av.map(id => mapChoiceCard(MAPS[id], { cls: chooser === me ? '' : 'off', attrs: chooser === me ? `data-next="${id}"` : '', level: scenarioLevel(camp), sub: `${MAPS[id].circle} · Monstros Nível ${scenarioLevel(camp)}`, titles: titleHolders(camp, id, g => this.seatName(g)) })).join('')}</div>
        ${chooser === me ? '' : '<p class="tb-wait">Aguardando a escolha…</p>'}`;
    } else if (st.step === 'final' && camp) {
      center = campaignFinalHtml(camp, g => name(g), me);
    } else if (st.step === 'done') {
      center = `<h3>Todos prontos!</h3><p>Mapa: <b>${MAPS[st.nextMap ?? st.map!].name}</b>. A partida vai começar — cada um posiciona seus Heróis na Área Inicial.</p>`;
    } else center = '<h3>Você está assistindo</h3>';

    this.show(`
      <div class="mp-head"><button class="mp-back">← Sair da sala</button><h2>Mesa · sala ${l.code}</h2></div>
      ${upgrading ? `<div class="tb-table up-table"><div class="tb-center">${center}</div></div>` : `<div class="tb-table">
        <div class="tb-others">${others.map(seat).join('')}</div>
        <div class="tb-center">${center}</div>
        ${me ? seat(me) : ''}
      </div>`}
      <div class="lb-status ${this.status.kind}" id="lb-status">${esc(this.status.text)}</div>
      ${this.chatHtml()}`);
    this.bindChat();
    paintCardArt(this.page);
    this.page.querySelectorAll<HTMLCanvasElement>('canvas[data-face]').forEach(cv => drawFace(cv, cv.dataset.face!, '#3a5a8a'));
    (this.page.querySelector('.mp-back') as HTMLElement).onclick = async () => {
      if (await gameConfirm({ icon: '🚪', title: 'Sair da sala?', body: 'A mesa continua sem você — a IA assume o seu lugar.', yes: 'Sair', no: 'Ficar', danger: true })) this.leave();
    };
    this.page.querySelectorAll<HTMLElement>('[data-h]').forEach(el => { el.onclick = () => { this.pickHero = el.dataset.h!; this.renderTable(); }; });
    this.page.querySelectorAll<HTMLElement>('[data-ban]').forEach(el => {
      el.onclick = () => {
        const h = el.dataset.ban!;
        this.banSel = this.banSel.includes(h) ? this.banSel.filter(x => x !== h) : [...this.banSel, h].slice(-BANS_EACH);
        const y = this.page.scrollTop; this.renderTable(); this.page.scrollTop = y;
      };
    });
    const ban = this.page.querySelector('#tb-ban') as HTMLElement | null;
    if (ban) ban.onclick = () => { if (this.banSel.length === BANS_EACH) { this.send({ t: 'ban', ids: this.banSel }); this.banSel = []; } };
    this.page.querySelectorAll<HTMLElement>('[data-ap]').forEach(el => {
      el.onclick = () => {
        const h = el.dataset.ap!;
        this.apSel = this.apSel.includes(h) ? this.apSel.filter(x => x !== h) : this.apSel.length < 3 ? [...this.apSel, h] : this.apSel;
        const y = this.page.scrollTop; this.renderTable(); this.page.scrollTop = y;
      };
    });
    const ap = this.page.querySelector('#tb-ap') as HTMLElement | null;
    if (ap) ap.onclick = () => { if (this.apSel.length === 3) { this.send({ t: 'allpick', ids: this.apSel }); this.apSel = []; } };
    const pick = this.page.querySelector('#tb-pick') as HTMLElement | null;
    if (pick) pick.onclick = () => { if (this.pickHero) this.send({ t: 'draft', hero: this.pickHero }); };
    this.bindUpgrade(st, me);
    // fim da campanha: sair da sala (a campanha online já não fica salva)
    const fin = this.page.querySelector('#cp-finish') as HTMLElement | null;
    if (fin) fin.onclick = () => this.leave();
    this.page.querySelectorAll<HTMLElement>('[data-next]').forEach(el => {
      el.onclick = () => this.send({ t: 'pickmap', map: el.dataset.next! });
    });
    closeMapPeek();
    attachMapPeek(this.page);
    this.page.querySelectorAll<HTMLElement>('[data-v]').forEach(el => {
      el.onclick = () => this.send({ t: 'vote', map: el.dataset.v! });
    });
    if (this.invBind) {
      bindInvEditor(this.page, this.invBind.items, this.invBind.opts, () => {
        // já estava pronto: a nova arrumação vale (se estiver válida)
        if (st.step === 'equip' && me && st.equip[me] && this.equipDraft) {
          const heroes = st.picks[me] ?? [];
          const inv = Object.fromEntries(heroes.map(h => [h, this.equipDraft!.filter(x => x.to === h).map(x => x.id)]));
          if (!equipErrors(st, me, inv).length && !poolErrors(this.equipDraft, false).length) this.send({ t: 'equip', inv });
        }
        this.renderTable();
      });
      this.invBind = null;
    }
    const eq = this.page.querySelector('#tb-equip') as HTMLElement | null;
    if (eq && me) eq.onclick = () => {
      const heroes = st.picks[me] ?? [];
      const items = this.equipDraft!;
      this.send({ t: 'equip', inv: Object.fromEntries(heroes.map(h => [h, items.filter(x => x.to === h).map(x => x.id)])) });
    };
    if (st.step !== 'equip') this.equipDraft = null;
  }

  // ------------------------------------------------------------------ Fase de Melhorias (campanha online)
  private upgradeHtml(st: OnlineSetup, me: GuildId): string {
    const c = st.camp!;
    const up = c.upgrade!;
    const g = c.guilds.find(x => x.id === me)!;
    const name = (x: GuildId) => this.seatName(x);
    // quem ainda está escolhendo nesta etapa (as IAs escolhem na hora)
    const pending = (x: GuildId): boolean => {
      const cg = c.guilds.find(q => q.id === x);
      if (!cg || cg.controller !== 'human') return false;
      return st.step === 'upgrade-draft' ? !st.upPick[x] : st.step === 'upgrade-buy' ? !st.upBuy[x] : st.step === 'upgrade-arrange' ? !st.upArr[x] : false;
    };
    const waitList = () => { const w = c.guilds.filter(x => x.id !== me && pending(x.id)).map(x => esc(name(x.id))); return w.length ? `<p class="up-waitlist">⏳ Aguardando ${w.join(', ')} escolher${w.length > 1 ? 'em' : ''}…</p>` : '<p class="up-waitlist">✓ Todos prontos…</p>'; };
    // topo: as Guildas (a sua primeiro, com quem ainda está escolhendo); ao lado da etapa: os seus Heróis com as cartas e o resultado do mapa
    const bar = upgradeBarHtml(c, me, name, ['upgrade-draft', 'upgrade-buy', 'upgrade-arrange'].includes(st.step) ? pending : undefined);
    const lay = (main: string) => upgradeLayout(bar, main, `${myHeroesHtml(c, me)}${resultHtml(c, name)}`);
    // Maldições Mortais: as cartas viradas na mesa, um Herói de cada vez (todos veem); depois o resumo
    if (st.step === 'upgrade-curses') {
      if ((up.curseStep ?? 0) < up.cursesDrawn.length) {
        const cur = up.cursesDrawn[up.curseStep ?? 0];
        return curseRevealHtml(c, cur.guild === me && g.controller === 'human', name);
      }
      return `${curseSummaryHtml(c, name, me)}<div class="tb-actions">${st.upOk?.[me] || g.controller !== 'human' ? '<p class="tb-wait">✓ Aguardando os outros…</p>' : '<button class="primary" id="up-ok">Continuar para as Melhorias ▶</button>'}</div>`;
    }
    // depois das compras: o que cada Guilda comprou e descartou
    if (st.step === 'upgrade-summary') {
      return `${buySummaryHtml(c, name, me)}<div class="tb-actions">${st.upOk?.[me] || g.controller !== 'human' ? '<p class="tb-wait">✓ Aguardando os outros…</p>' : '<button class="primary" id="up-ok">Equipar meus Heróis ▶</button>'}</div>`;
    }
    if (g.controller !== 'human') return lay('<p>Você está assistindo.</p>');
    if (st.step === 'upgrade-draft') {
      const hand = up.hands[me] ?? [];
      const need = Math.min(picksPerRound(c), hand.length);
      const head = `<h3>1. Escolha de cartas <small>rodada ${up.round + 1} de ${draftRounds(c)}</small></h3>`;
      if (st.upPick[me]) return lay(`<div class="up-step">${head}${waitList()}
        <h4>Você escolheu</h4>${miniCards(st.upPick[me] ?? [])}
        ${(up.picked[me] ?? []).length ? `<h4>Já escolhidas antes</h4>${miniCards(up.picked[me]!)}` : ''}</div>`);
      return lay(`<div class="up-step">${head}
        <p>Escolha <b>${need === 1 ? '1 carta' : `${need} cartas`}</b>; o resto passa para a esquerda. Ao fim você terá 6 cartas para comprar.</p>
        ${handFromHtml(c, me, name)}
        <div class="cp-cards">${hand.map((id, i) => itemCard(id, this.upSel.has(i) ? 'sel' : '', `data-up="${i}"`)).join('')}</div>
        <div class="tb-actions up-actions"><button class="primary" id="up-go" ${this.upSel.size === need ? '' : 'disabled'}>Confirmar escolha</button></div>
        ${(up.picked[me] ?? []).length ? `<h4>Já escolhidas</h4>${miniCards(up.picked[me]!)}` : ''}</div>`);
    }
    if (st.step === 'upgrade-buy') {
      const coins = up.coins[me] ?? 0;
      const picked = up.picked[me] ?? [];
      const spent = [...this.upSel].reduce((s, i) => s + CARDS[picked[i]].cost, 0);
      if (st.upBuy[me]) return lay(`<div class="up-step"><h3>2. Compra</h3>${waitList()}<h4>Você comprou</h4>${miniCards(st.upBuy[me] ?? [])}</div>`);
      return lay(`<div class="up-step"><h3>2. Compra <small>você tem 🪙 ${coins}</small></h3>
        <p>Compre até <b>3 cartas</b>. Sobrando moedas, só 1 fica guardada.</p>
        <div class="cp-cards">${picked.map((id, i) => itemCard(id, this.upSel.has(i) ? 'sel' : '', `data-up="${i}"`)).join('')}</div>
        ${buyHint(picked, [...this.upSel], coins).html}
        <div class="tb-actions up-actions"><button class="primary" id="up-go" ${spent <= coins ? '' : 'disabled'}>Comprar e continuar</button>
          <span class="cp-sum">Selecionadas: ${this.upSel.size}/3 · Custo: 🪙 ${spent} ${spent > coins ? '<b class="bad">— moedas insuficientes</b>' : ''}</span></div></div>`);
    }
    // distribuição
    if (st.upArr[me]) return lay(`<div class="up-step"><h3>3. Inventário</h3>${waitList()}</div>`);
    if (!this.arrState) {
      this.arrState = [
        ...g.heroes.flatMap(h => (g.inventory[h] ?? []).map(id => ({ id, to: h }))),
        ...(up.bought[me] ?? []).map(id => ({ id, to: g.heroes.find(h => heroSlots(c, g, h).used < 4) ?? 'pool' })),
      ];
    }
    const arr = this.arrState;
    const inv = Object.fromEntries(g.heroes.map(h => [h, arr.filter(x => x.to === h).map(x => x.id)]));
    const errs = [...validateInventory(c, g, inv), ...poolErrors(arr, true)];
    const arOpts: InvOptions = { heroes: g.heroes, color: GUILDS[me].color, discard: true, slots: (h, cards) => heroSlots(c, g, h, cards), curse: h => curseLabel(g.curses[h]), curseSlot: h => CURSES[g.curses[h]]?.slot ? CURSES[g.curses[h]].name : null };
    this.invBind = { items: arr, opts: arOpts };
    return `${bar}<h3>3. Equipe seus Heróis</h3>
      <p>Clique num <b>espaço vazio</b> ou numa <b>carta</b> para escolher a carta (troca entre Heróis, tira ou descarta).</p>
      ${invEditorHtml(arr, arOpts)}
      ${errs.length ? `<div class="lb-warn">${errs.join('<br/>')}</div>` : ''}
      <div class="tb-actions"><button class="primary" id="up-go" ${errs.length ? 'disabled' : ''}>✔ Pronto</button></div>`;
  }

  private bindUpgrade(st: OnlineSetup, me: GuildId | null) {
    if (!me || !st.camp?.upgrade) return;
    const up = st.camp.upgrade;
    const g = st.camp.guilds.find(x => x.id === me)!;
    this.page.querySelectorAll<HTMLElement>('[data-up]').forEach(el => { el.onclick = () => {
      const i = Number(el.dataset.up);
      const max = st.step === 'upgrade-draft' ? Math.min(picksPerRound(st.camp!), (up.hands[me] ?? []).length) : 3;
      if (this.upSel.has(i)) this.upSel.delete(i); else if (this.upSel.size < max) this.upSel.add(i);
      this.renderTable();
    }; });
    if (this.invBind) { bindInvEditor(this.page, this.invBind.items, this.invBind.opts, () => this.renderTable()); this.invBind = null; }
    paintCardArt(this.page);
    bindUpgradeView(this.page);
    this.page.querySelectorAll<HTMLElement>('[data-flip]').forEach(b => { b.onclick = () => { if (!b.hasAttribute('disabled')) { play('pick-item'); this.send({ t: 'curseFlip' }); } }; });
    const ok = this.page.querySelector('#up-ok') as HTMLElement | null;
    if (ok) ok.onclick = () => this.send({ t: 'upOk' });
    const go = this.page.querySelector('#up-go') as HTMLElement | null;
    if (!go) return;
    go.onclick = () => {
      if (st.step === 'upgrade-draft') { const hand = up.hands[me] ?? []; this.send({ t: 'upPick', ids: [...this.upSel].map(i => hand[i]) }); }
      else if (st.step === 'upgrade-buy') {
        const picked = up.picked[me] ?? [];
        const sel = [...this.upSel];
        const hint = buyHint(picked, sel, up.coins[me] ?? 0);
        void (async () => {
          if (hint.more && !await gameConfirm({ icon: '🪙', title: 'Ainda dá para comprar!', body: hint.html, yes: 'Comprar assim mesmo', no: 'Voltar e escolher' })) return;
          this.send({ t: 'upBuy', ids: sel.map(i => picked[i]) });
          this.upSel.clear();
        })();
        return;
      }
      else { const arr = this.arrState!; this.send({ t: 'upArr', inv: Object.fromEntries(g.heroes.map(h => [h, arr.filter(x => x.to === h).map(x => x.id)])) }); }
      this.upSel.clear();
    };
  }

  private seatName(g: GuildId) { const s = this.lobby?.seats.find(x => x.guild === g); return s ? (s.ai ? 'IA' : s.name) : g; }

  // ------------------------------------------------------------------ chat
  private chatHtml() {
    return `<div class="lb-chatbox"><div id="lb-chat"></div>
      <form id="lb-form"><input id="lb-msg" maxlength="200" placeholder="Mensagem para a sala…" autocomplete="off"/><button>Enviar</button></form></div>`;
  }

  private bindChat() {
    this.renderChat();
    (this.page.querySelector('#lb-form') as HTMLFormElement).onsubmit = e => {
      e.preventDefault();
      const inp = this.page.querySelector('#lb-msg') as HTMLInputElement;
      if (inp.value.trim()) this.session?.chat(inp.value.trim());
      inp.value = '';
    };
  }

  private renderChat() {
    const box = this.page.querySelector('#lb-chat');
    if (!box) return;
    box.innerHTML = '';
    for (const m of this.chatLog) {
      const el = document.createElement('div');
      const b = document.createElement('b');
      b.style.color = m.color ?? '#d7b8ff';
      b.textContent = `${m.from}: `;
      el.append(b, document.createTextNode(m.text));
      box.append(el);
    }
    box.scrollTop = box.scrollHeight;
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
