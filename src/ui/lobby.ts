import { GUILDS, HEROES } from '../engine/data';
import { Game } from '../engine/game';
import { MAPS, getMap } from '../engine/maps';
import type { GameState, GuildId } from '../engine/types';
import { drawFace } from '../render/chibi';
import { ClientSession, HostSession, type Lobby, type Session, type SessionEvents, type SetupMsg, savedName, saveName } from '../net/net';
import { HIDDEN, STARTER, advance, chooseHero, equipErrors, newSetup, setEquip, voteMap } from '../net/onlineSetup';
import { heroCard, itemCard, paintCardArt } from './cardview';
import { drawMinimap, type MenuPages } from './menu';
import { getSettings, saveSettings } from './settings';

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
  private equipDraft: Record<string, string> | null = null;
  private lastTick = -1;
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
    if (this.session && this.lobby) { this.renderRoom(); return; }
    this.show(`
      <div class="mp-head"><button class="mp-back">← Voltar</button><h2>Multiplayer Online</h2></div>
      <div class="lb-entry">
        <label class="lb-field">Seu nome <input id="lb-name" maxlength="16" value="${esc(savedName())}" placeholder="Ex.: Raquel"/></label>
        <div class="lb-cols">
          <div class="lb-box"><h3>Criar sala</h3><p>Você será o anfitrião: o jogo roda no seu navegador. Mantenha a aba aberta durante a partida.</p>
            <button class="primary" id="lb-create">👑 Criar sala</button></div>
          <div class="lb-box"><h3>Entrar numa sala</h3><p>Digite o código que o anfitrião enviou.</p>
            <input id="lb-code" maxlength="5" value="${esc(code)}" placeholder="CÓDIGO" class="lb-code-in"/>
            <button class="primary" id="lb-join">🚪 Entrar</button></div>
        </div>
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
      host.onSetupMsg = (g, m) => this.hostSetupMsg(g, m);
      host.onSeatsChanged = () => { if (host.lobby.setup && !host.lobby.started) this.hostAdvance(); };
      this.session = host;
    };
    (this.page.querySelector('#lb-join') as HTMLElement).onclick = () => {
      const n = name();
      const c = (this.page.querySelector('#lb-code') as HTMLInputElement).value.trim().toUpperCase();
      if (!n) return;
      if (c.length < 5) { this.setStatus('Código inválido.', 'error'); return; }
      this.session = new ClientSession(c, n, [], this.events());
    };
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
        ${s.clientId === me ? `<input class="lb-team" maxlength="20" placeholder="Nome do time (opcional)" value="${esc(s.team ?? '')}"/>` : ''}
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
          ${host ? `<label>Dificuldade da IA <select id="lb-ai"><option value="normal">Normal</option><option value="hard" ${getSettings().ai === 'hard' ? 'selected' : ''}>Difícil</option></select></label>
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
    const team = this.page.querySelector('.lb-team') as HTMLInputElement | null;
    if (team) team.onchange = () => this.session?.setMine({ team: team.value });
    this.page.querySelectorAll<HTMLElement>('.lb-addai').forEach(b => { b.onclick = () => (this.session as HostSession).addAI(); });
    this.page.querySelectorAll<HTMLElement>('.lb-kick').forEach(b => { b.onclick = () => (this.session as HostSession).removeSeat(b.dataset.id!); });
    const ai = this.page.querySelector('#lb-ai') as HTMLSelectElement | null;
    if (ai) ai.onchange = () => saveSettings({ ...getSettings(), ai: ai.value as 'normal' | 'hard' });
    const st = this.page.querySelector('#lb-start') as HTMLElement | null;
    if (st) st.onclick = () => this.startSetup();
  }

  // ------------------------------------------------------------------ anfitrião: preparação
  private startSetup() {
    const host = this.session as HostSession;
    const l = host.lobby;
    l.setup = newSetup(l.seats.map(s => ({ guild: s.guild, ai: s.ai })), getSettings().ai);
    this.hostAdvance();
  }

  /** Jogada da preparação (de qualquer jogador; o anfitrião também passa por aqui). */
  private hostSetupMsg(g: GuildId, m: SetupMsg) {
    const st = (this.session as HostSession).lobby.setup;
    if (!st) return;
    if (m.t === 'draft') chooseHero(st, g, m.hero);
    else if (m.t === 'vote') voteMap(st, g, m.map);
    else if (m.t === 'equip') setEquip(st, g, m.inv);
    this.hostAdvance();
  }

  private hostAdvance() {
    const host = this.session as HostSession;
    const l = host.lobby;
    const st = l.setup;
    if (!st) return;
    // quem caiu durante a preparação vira IA (para a mesa não travar)
    for (const s of l.seats) if (!s.connected && !s.ai) s.ai = true;
    advance(st, l.seats.map(s => ({ guild: s.guild, ai: s.ai })));
    host.pushLobby();
    if (st.step === 'done') setTimeout(() => this.startGame(), 1500);
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
    l.mapId = st.map;
    const game = Game.create(getMap(st.map), {
      players: l.seats.map(s => ({
        guild: s.guild, controller: s.ai ? 'ai' as const : 'human' as const, name: s.team,
        heroes: st.picks[s.guild], cards: st.equip[s.guild] ?? undefined,
      })),
      deploy: true,
    });
    game.drain();
    l.setup = undefined;
    host.startGame(game.s);
    this.close();
    this.onStart(game.s, l, host);
  }

  // ------------------------------------------------------------------ a mesa
  private renderTable() {
    const l = this.lobby!;
    const st = l.setup!;
    const me = this.myGuild();
    const name = (g: GuildId) => { const s = l.seats.find(x => x.guild === g); return s ? (s.ai ? 'IA' : s.name) : g; };
    const done = (g: GuildId) => st.step === 'draft' ? !!st.choice[g] : st.step === 'vote' ? !!st.votes[g] : st.step === 'equip' ? !!st.equip[g] : true;
    const verb = st.step === 'draft' ? ['escolheu', 'escolhendo…'] : st.step === 'vote' ? ['votou', 'votando…'] : ['pronto', 'distribuindo cartas…'];
    if (st.tick !== this.lastTick) {
      if (this.lastTick >= 0 && st.news) this.setStatus(st.news, 'ok');
      this.lastTick = st.tick;
      this.pickHero = null;
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
    if (st.step === 'draft' && me) {
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
        <div class="cp-votes tb-votes">${Object.values(MAPS).map(m => `<div class="cp-vote ${mine === m.id ? 'sel' : ''}" data-v="${m.id}"><canvas width="180" height="180"></canvas><b>${m.name}</b><small>${m.circle} · ${m.missions.pve.map(x => x.name).join(' · ')}</small></div>`).join('')}</div>
        ${mine ? `<div class="tb-actions"><span class="tb-wait">✓ Seu voto: <b>${MAPS[mine].name}</b> (pode mudar). Aguardando: ${st.order.filter(g => !st.votes[g]).map(g => esc(name(g))).join(', ')}</span></div>` : ''}`;
    } else if (st.step === 'equip' && me) {
      const heroes = st.picks[me] ?? [];
      if (!this.equipDraft) {
        this.equipDraft = {};
        STARTER.forEach((cid, i) => { this.equipDraft![cid] = heroes[i % heroes.length]; });
      }
      const d = this.equipDraft;
      const inv = Object.fromEntries(heroes.map(h => [h, STARTER.filter(cid => d[cid] === h)]));
      const errs = equipErrors(st, me, inv);
      const ready = !!st.equip[me];
      center = `<h3>Equipamento inicial — ${MAPS[st.map!].name}</h3>
        ${st.tie ? `<p>Empate entre ${st.tie.map(id => MAPS[id].name).join(' e ')}: sorteado <b>${MAPS[st.map!].name}</b>.</p>` : ''}
        <table class="cp-vtable">${st.order.map(g => `<tr><td><span class="dot" style="background:${GUILDS[g].color}"></span> ${esc(name(g))}</td><td>${st.votes[g] ? MAPS[st.votes[g]!]?.name ?? '' : ''}</td></tr>`).join('')}</table>
        <p>Distribua as 5 cartas iniciais entre seus Heróis (até 4 por Herói).</p>
        <div class="cp-cols">${heroes.map(h => `<div class="cp-col"><h4>${HEROES[h].name} <small>${inv[h].length}/4</small></h4>
          <div class="cc-kind">${HEROES[h].abilityName} — ${HEROES[h].abilityText}</div>
          ${inv[h].map(cid => `<div class="cp-slot">${itemCard(cid)}<select data-c="${cid}" ${ready ? 'disabled' : ''}>${heroes.map(x => `<option value="${x}" ${x === h ? 'selected' : ''}>${HEROES[x].name}</option>`).join('')}</select></div>`).join('')}</div>`).join('')}</div>
        ${errs.length ? `<div class="lb-warn">${errs.join('<br/>')}</div>` : ''}
        <div class="tb-actions">${ready
          ? `<span class="tb-wait">✓ Pronto! Aguardando: ${st.order.filter(g => !st.equip[g]).map(g => esc(name(g))).join(', ')}</span>`
          : `<button class="primary" id="tb-equip" ${errs.length ? 'disabled' : ''}>✔ Pronto</button>`}</div>`;
    } else if (st.step === 'done') {
      center = `<h3>Todos prontos!</h3><p>Mapa: <b>${MAPS[st.map!].name}</b>. A partida vai começar — cada um posiciona seus Heróis na Área Inicial.</p>`;
    } else center = '<h3>Você está assistindo</h3>';

    this.show(`
      <div class="mp-head"><button class="mp-back">← Sair da sala</button><h2>Mesa · sala ${l.code}</h2></div>
      <div class="tb-table">
        <div class="tb-others">${others.map(seat).join('')}</div>
        <div class="tb-center">${center}</div>
        ${me ? seat(me) : ''}
      </div>
      <div class="lb-status ${this.status.kind}" id="lb-status">${esc(this.status.text)}</div>
      ${this.chatHtml()}`);
    this.bindChat();
    paintCardArt(this.page);
    this.page.querySelectorAll<HTMLCanvasElement>('canvas[data-face]').forEach(cv => drawFace(cv, cv.dataset.face!, '#3a5a8a'));
    (this.page.querySelector('.mp-back') as HTMLElement).onclick = () => { if (confirm('Sair da sala? A mesa continua sem você (a IA assume).')) this.leave(); };
    this.page.querySelectorAll<HTMLElement>('[data-h]').forEach(el => { el.onclick = () => { this.pickHero = el.dataset.h!; this.renderTable(); }; });
    const pick = this.page.querySelector('#tb-pick') as HTMLElement | null;
    if (pick) pick.onclick = () => { if (this.pickHero) this.send({ t: 'draft', hero: this.pickHero }); };
    this.page.querySelectorAll<HTMLElement>('[data-v]').forEach(el => {
      drawMinimap(el.querySelector('canvas')!, MAPS[el.dataset.v!]);
      el.onclick = () => this.send({ t: 'vote', map: el.dataset.v! });
    });
    this.page.querySelectorAll<HTMLSelectElement>('[data-c]').forEach(sel => { sel.onchange = () => { this.equipDraft![sel.dataset.c!] = sel.value; this.renderTable(); }; });
    const eq = this.page.querySelector('#tb-equip') as HTMLElement | null;
    if (eq && me) eq.onclick = () => {
      const heroes = st.picks[me] ?? [];
      const d = this.equipDraft!;
      this.send({ t: 'equip', inv: Object.fromEntries(heroes.map(h => [h, STARTER.filter(cid => d[cid] === h)])) });
    };
    if (st.step !== 'equip') this.equipDraft = null;
  }

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
