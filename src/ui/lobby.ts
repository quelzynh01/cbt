import { ALL_HEROES, GUILDS, HEROES } from '../engine/data';
import { Game } from '../engine/game';
import { MAPS, getMap, saveMapId } from '../engine/maps';
import type { GameState } from '../engine/types';
import { hasSprite } from '../render/chibi';
import { ClientSession, HostSession, type Lobby, type Session, type SessionEvents, savedName, saveName } from '../net/net';
import { loadGuild, type MenuPages } from './menu';

/** Tela do modo online: criar/entrar numa sala, montar as Guildas e começar. */
export class OnlineLobby {
  private page: HTMLElement;
  private home: HTMLElement;
  private pages: MenuPages;
  private session: Session | null = null;
  private lobby: Lobby | null = null;
  private status = { text: '', kind: '' };
  private chatLog: { from: string; text: string; color?: string }[] = [];
  onStart: (state: GameState, lobby: Lobby, s: Session) => void = () => {};

  constructor(menu: HTMLElement, pages: MenuPages) {
    this.pages = pages;
    this.home = menu.querySelector('.menu-box') as HTMLElement;
    this.page = document.createElement('div');
    this.page.className = 'menu-page lobby hidden';
    menu.append(this.page);
  }

  private show(html: string) {
    this.home.classList.add('hidden');
    this.page.classList.remove('hidden');
    this.page.innerHTML = html;
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
    this.close();
  }

  /** Abre a tela inicial do online. `code` pré-preenche "Entrar" (link ?sala=CODE). */
  open(code = '') {
    if (this.session && this.lobby) { this.renderRoom(); return; }
    const heroes = loadGuild();
    this.show(`
      <div class="mp-head"><button class="mp-back">← Voltar</button><h2>Multiplayer Online</h2></div>
      <div class="lb-entry">
        <label class="lb-field">Seu nome <input id="lb-name" maxlength="16" value="${esc(savedName())}" placeholder="Ex.: Raquel"/></label>
        <div class="lb-guild"><b>Seus Heróis:</b> ${heroes.map(h => HEROES[h].name).join(' · ')} <button id="lb-heroes">Trocar heróis</button></div>
        <div class="lb-cols">
          <div class="lb-box"><h3>Criar sala</h3><p>Você será o anfitrião: o jogo roda no seu navegador. Mantenha a aba aberta durante a partida.</p>
            <button class="primary" id="lb-create">👑 Criar sala</button></div>
          <div class="lb-box"><h3>Entrar numa sala</h3><p>Digite o código que o anfitrião enviou.</p>
            <input id="lb-code" maxlength="5" value="${esc(code)}" placeholder="CÓDIGO" class="lb-code-in"/>
            <button class="primary" id="lb-join">🚪 Entrar</button></div>
        </div>
        <p class="lb-note">Até 4 jogadores, cada um no seu computador. Vagas vazias podem ser preenchidas pela IA.</p>
        <div class="lb-status" id="lb-status"></div>
      </div>`);
    (this.page.querySelector('.mp-back') as HTMLElement).onclick = () => this.leave();
    (this.page.querySelector('#lb-heroes') as HTMLElement).onclick = () => this.pages.showHeroes(() => this.open(code));
    const name = () => {
      const v = (this.page.querySelector('#lb-name') as HTMLInputElement).value.trim();
      if (!v) { this.setStatus('Digite seu nome.', 'error'); return null; }
      saveName(v);
      return v;
    };
    (this.page.querySelector('#lb-create') as HTMLElement).onclick = () => {
      const n = name();
      if (!n) return;
      this.session = new HostSession(n, loadGuild(), this.events());
    };
    (this.page.querySelector('#lb-join') as HTMLElement).onclick = () => {
      const n = name();
      const c = (this.page.querySelector('#lb-code') as HTMLInputElement).value.trim().toUpperCase();
      if (!n) return;
      if (c.length < 5) { this.setStatus('Código inválido.', 'error'); return; }
      this.session = new ClientSession(c, n, loadGuild(), this.events());
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

  private conflicts(l: Lobby): Set<string> {
    const seen = new Map<string, number>();
    for (const s of l.seats) if (!s.ai) for (const h of s.heroes) seen.set(h, (seen.get(h) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([h]) => h));
  }

  private renderRoom() {
    const l = this.lobby!;
    const host = this.session?.isHost;
    const me = this.session!.me;
    const dup = this.conflicts(l);
    const link = `${location.origin}${location.pathname}?sala=${l.code}`;
    const slots = [0, 1, 2, 3].map(i => {
      const s = l.seats[i];
      if (!s) return `<div class="lb-seat empty">${host ? '<button class="lb-addai">+ Adicionar IA</button>' : '<span>Vaga livre</span>'}</div>`;
      const heroes = s.ai ? '<i>heróis escolhidos automaticamente</i>' : s.heroes.map(h => `<span class="${dup.has(h) ? 'dup' : ''}">${HEROES[h]?.name ?? h}</span>`).join(' · ');
      return `<div class="lb-seat" style="--gc:${GUILDS[s.guild].color}">
        <div class="lb-seat-h"><span class="dot" style="background:${GUILDS[s.guild].color}"></span><b>${esc(s.ai ? 'IA' : s.name)}</b>
          ${s.host ? '<span class="tag-host">👑 anfitrião</span>' : ''}${s.clientId === me ? '<span class="tag-me">você</span>' : ''}
          ${host && !s.host ? `<button class="lb-kick" data-id="${s.clientId}">✕</button>` : ''}</div>
        <div class="lb-seat-g">${s.team ? `<b>${esc(s.team)}</b> · ` : ''}${GUILDS[s.guild].name}</div>
        ${s.clientId === me ? `<input class="lb-team" maxlength="20" placeholder="Nome do time (opcional)" value="${esc(s.team ?? '')}"/>` : ''}
        <div class="lb-seat-hero">${heroes}</div>
      </div>`;
    }).join('');
    const canStart = l.seats.length >= 2 && dup.size === 0;
    this.show(`
      <div class="mp-head"><button class="mp-back">← Sair da sala</button><h2>Sala online</h2></div>
      <div class="lb-room">
        <div class="lb-codebox"><span>Código da sala</span><b>${l.code}</b>
          <button id="lb-copy">📋 Copiar link</button><small>${esc(link)}</small></div>
        <div class="lb-map"><b>Mapa:</b> ${host
          ? `<select id="lb-mapsel">${Object.values(MAPS).map(mp => `<option value="${mp.id}" ${mp.id === getMap(l.mapId).id ? 'selected' : ''}>${mp.name} (${mp.circle})</option>`).join('')}</select>`
          : `${getMap(l.mapId).name} <small>(${getMap(l.mapId).circle})</small>`}</div>
        <div class="lb-seats">${slots}</div>
        ${dup.size ? `<div class="lb-warn">⚠ Heróis repetidos entre jogadores: ${[...dup].map(h => HEROES[h].name).join(', ')}. Cada herói só pode estar em uma Guilda — troquem antes de começar.</div>` : ''}
        <div class="lb-actions">
          <button id="lb-myheroes">Trocar meus heróis</button>
          ${host ? `<button class="primary" id="lb-start" ${canStart ? '' : 'disabled'}>▶ Começar partida</button>` : '<span class="lb-wait">Aguardando o anfitrião começar…</span>'}
        </div>
        <div class="lb-chatbox"><div id="lb-chat"></div>
          <form id="lb-form"><input id="lb-msg" maxlength="200" placeholder="Mensagem para a sala…" autocomplete="off"/><button>Enviar</button></form></div>
        <div class="lb-status ${this.status.kind}" id="lb-status">${esc(this.status.text)}</div>
      </div>`);
    this.renderChat();
    (this.page.querySelector('.mp-back') as HTMLElement).onclick = () => this.leave();
    (this.page.querySelector('#lb-copy') as HTMLElement).onclick = () => {
      navigator.clipboard?.writeText(link).then(() => this.setStatus('Link copiado! Envie para seus amigos.', 'ok'), () => this.setStatus(link));
    };
    (this.page.querySelector('#lb-myheroes') as HTMLElement).onclick = () => this.pages.showHeroes(() => {
      this.session?.setMine({ heroes: loadGuild() });
      this.renderRoom();
    });
    const team = this.page.querySelector('.lb-team') as HTMLInputElement | null;
    if (team) team.onchange = () => this.session?.setMine({ team: team.value });
    this.page.querySelectorAll<HTMLElement>('.lb-addai').forEach(b => { b.onclick = () => (this.session as HostSession).addAI(); });
    this.page.querySelectorAll<HTMLElement>('.lb-kick').forEach(b => { b.onclick = () => (this.session as HostSession).removeSeat(b.dataset.id!); });
    const ms = this.page.querySelector('#lb-mapsel') as HTMLSelectElement | null;
    if (ms) ms.onchange = () => { saveMapId(ms.value); (this.session as HostSession).setMap(ms.value); };
    const st = this.page.querySelector('#lb-start') as HTMLElement | null;
    if (st) st.onclick = () => this.startGame();
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

  /** Anfitrião: monta as Guildas (IA pega heróis livres) e começa. */
  private startGame() {
    const host = this.session as HostSession;
    const l = host.lobby;
    const used = new Set(l.seats.filter(s => !s.ai).flatMap(s => s.heroes));
    const pool = ALL_HEROES.filter(h => !used.has(h)).sort((a, b) => Number(hasSprite(b)) - Number(hasSprite(a)));
    for (const s of l.seats) if (s.ai) s.heroes = pool.splice(0, 3);
    const game = Game.create(getMap(l.mapId), {
      players: l.seats.map(s => ({ guild: s.guild, controller: s.ai ? 'ai' as const : 'human' as const, heroes: s.heroes, name: s.team })),
      deploy: true,
    });
    game.drain();
    host.startGame(game.s);
    this.close();
    this.onStart(game.s, l, host);
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
