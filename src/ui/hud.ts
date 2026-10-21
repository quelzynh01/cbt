import { TITLES, TITLE_TEXT } from '../engine/titles';
import { CARDS, GUILDS, GUILD_NAMES, HEROES, MONSTERS, TOKEN_INFO, setGuildNames, teamName } from '../engine/data';
import type { Game } from '../engine/game';
import type { CardInst, DieFace, GameEvent, GuildId, RerollInfo, Token, Unit } from '../engine/types';
import { tokenImageId, tokenUrl } from '../render/tokens';
import { dieImg } from '../render/dice';
import { play, playOnce } from '../audio/sfx';
import { soundWidget } from '../audio/widget';
import { drawFace, getArtVersion } from '../render/chibi';
import { CURSES } from '../engine/cards';
import { ITEM_LEVEL, itemArt, richText, bonusImg, curseCard, medal, heroCard, itemCard, itemColor, monsterCard, paintCardArt } from './cardview';
import { getSettings, onSettings, saveSettings } from './settings';
import { CARD_ART } from './cardArt';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export interface HudActions {
  activate(heroId: string): void;
  /** Botão "▶ Ativar" do Herói selecionado. */
  confirmActivate(heroId: string): void;
  /** Quadradinho do Herói na faixa "Sua vez": seleciona e leva a câmera até ele. */
  pick(heroId: string): void;
  selectCard(uid: string): void;
  useToken(tokenId: string): void;
  /** Carta ativável (ícone ⚡). */
  useCard(heroId: string, cardUid: string): void;
  endTurn(): void;
  rest(): void;
  inspect(unitId: string | null): void;
  /** Mostra no mapa os objetivos da Missão. */
  mission(id: string): void;
  /** Abre o menu da partida. */
  menu(): void;
}

const FACE_ICON: Record<DieFace, string> = { crit: '✷', melee: '⚔', ranged: '➶', shield: '⛨', blank: '–' };

/** Nome curto do time (o escolhido pelo jogador ou a cor). */
export function guildShort(g: GuildId) { return teamName(g); }
/** "da Azul" ou "de Dragões" (nome escolhido). */
export function daTime(g: GuildId) { return `${GUILD_NAMES[g] ? 'de' : 'da'} ${teamName(g)}`; }

/** Ícones do celular: cada um abre um painel numa gaveta lateral. */
const DOCK: [string, string, string][] = [['hero', '🧙', 'Herói'], ['score', '🏆', 'Placar'], ['missions', '📜', 'Missões'], ['cem', '⚰️', 'Cemitério'], ['log', '📖', 'Registro'], ['online', '🌐', 'Online']];

/** Bloco de Defesa (painel de dados do centro). */
const cdDefHtml = (name: string, id: string) => `<div class="cd-def" data-tid="${id}"><div class="cd-who">${name} ${lupa(id)}</div>
  <div class="cd-row def"></div><div class="cd-btn def"></div><div class="cd-sum def"></div></div>`;

/** Lupa ao lado do nome na tela de combate: abre os status atuais do personagem. */
const lupa = (id: string) => `<button class="cd-lupa" data-lupa="${id}" title="Ver status">🔍</button>`;

/** Embaixo do nome da carta na tela de combate: medalhão do tipo de ataque com o número de dados. */
function atkInfo(type: string, n: number): string {
  const melee = type === 'melee';
  return `<div class="cd-atkinfo">${medal(melee ? 'melee' : 'ranged', n, `${n} dados de ataque`)}<span>${melee ? 'Ataque Próximo' : 'Ataque a Distância'} · <b>${n}</b> dado${n === 1 ? '' : 's'}</span></div>`;
}

/** Celular / tablet: sem teclado nem mouse. */
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
/** Dicas no toque: "toque" em vez de "clique" e sem os atalhos de teclado (Espaço, Esc, R…). */
function touchHint(t: string): string {
  return t.split(' · ')
    .filter(part => !/(<b>)?(Espaço|Esc|Enter|[A-Z0-9](-[0-9])?)(<\/b>)? (encerra|cancela|Descansar|descansar|carta|mapa)/.test(part))
    .join(' · ')
    .replace(/Clique/g, 'Toque').replace(/clique/g, 'toque');
}

/** Arte da carta de Maldição Mortal (public/cards). */
function curseArt(id: string): string {
  const a = CARD_ART[`curse:${id}`];
  return a ? `<img class="ac-img icon curse-img" src="${import.meta.env.BASE_URL}cards/${a.img}.webp" alt="" draggable="false"/>` : '<span class="ac-icon">💀</span>';
}

export class Hud {
  root: HTMLElement;
  game!: Game;
  actions!: HudActions;
  selectedCard: string | null = null;
  inspected: string | null = null;
  speed = 1;
  /** Guilda controlada por quem está neste computador. */
  isMine: (g: GuildId) => boolean = g => this.game.guild(g).controller === 'human';
  /** Nome do jogador da Guilda (modo online). */
  nameOf: (g: GuildId) => string | null = () => null;
  private portraitCache = new Map<string, string>();
  private diceTimer = 0;
  private bannerTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div id="topbar">
        <div class="brand"><span class="logo">CBT</span><div><div class="title">Champions Battle Tactics</div><div class="sub" id="mapname"></div></div><span class="badge-test">MODO TESTE</span></div>
        <div id="turninfo"></div>
        <div id="clock"></div>
        <button id="testbtn" class="hidden" title="Opções do Modo Teste (T)">🧪 Teste</button>
        <button id="viewbtn" title="Câmera: visão livre ou visão dos jogadores (V)"></button>
        <button id="menubtn" title="Menu da partida (Esc)">☰</button>
      </div>
      <div id="activebar" class="hidden"></div>
      <div id="heropick" class="hidden"></div>
      <div id="gamemenu" class="hidden"></div>
      <div id="restbox" class="panel hidden"></div>
      <div id="deploybox" class="panel hidden"></div>
      <div id="leftside">
        <div id="scorebox" class="panel ${loadFlag('cbt.scoreOpen') ? '' : 'collapsed'}">
          <div class="panel-h" id="scoretoggle" title="Mostrar / esconder os detalhes do Placar">Placar <small id="scoresub"></small><span class="mtoggle"></span></div>
          <div id="score"></div>
        </div>
        <div id="sidepanels"></div>
        <div id="herobox" class="panel"></div>
      </div>
      <div id="rightside">
        <div id="cembox" class="panel">
          <div class="panel-h">Cemitério <small title="Tabuleiro de Entrada de Monstro: com 5 monstros (ou sem monstros no mapa), eles revivem no fim do turno">(Entrada de Monstros)</small></div>
          <div id="cemetery"></div>
        </div>
        <div id="missions" class="panel ${loadFlag('cbt.missionsMin') ? 'collapsed' : ''}">
          <div class="panel-h" id="missiontoggle" title="Minimizar / mostrar as Missões"><button id="tipsbtn" title="Dicas do mapa">!</button>Missões <small id="towin"></small><span class="mtoggle"></span></div><div id="missionlist"></div><div id="maptips" class="hidden"></div>
        </div>
        <div id="logbox" class="panel collapsed"><div class="panel-h" id="logtoggle">Registro <small>▲</small></div><div id="log"></div></div>
      </div>
      <div id="dock">
        ${DOCK.map(([k, icon, label]) => `<button data-dock="${k}" title="${label}"><span>${icon}</span><small>${label}</small></button>`).join('')}
        <div class="dock-sep"></div>
        <button id="dock-rest" title="Descansar a Guilda"><span>💤</span><small>Descansar</small></button>
        <button id="dock-end" class="primary" title="Encerrar o turno"><span>⏭</span><small>Encerrar</small></button>
      </div>
      <div id="drawerbg" class="hidden"></div>
      <div id="drawerhead"><b id="drawertitle"></b><button id="drawerclose" title="Fechar">✕</button></div>
      <div id="spawnbox" class="panel hidden"></div>
      <div id="monsterctl" class="panel hidden"></div>
      <div id="timeline"></div>
      <div id="cardview" class="hidden"></div>
      <div id="tokenflip" class="hidden"></div>
      <div id="bagview" class="hidden"></div>
      <div id="dicecenter" class="hidden"></div>
      <div id="awardbox" class="hidden"></div>
      <div id="prizebox" class="hidden"></div>
      <div id="confirmbox" class="hidden"></div>
      <div id="actprompt" class="hidden"></div>
      <div id="zoombtns"><button id="zoom-in" title="Aproximar">＋</button><button id="zoom-out" title="Afastar">－</button></div>
      <div id="turnframe" class="hidden"></div>
      <div id="dice" class="hidden"></div>
      <div id="banner" class="hidden"></div>
      <div id="toasts"></div>
      <div id="tooltip" class="hidden"></div>
      <div id="hint"></div>
    `;
    $('#logtoggle', root).onclick = () => $('#logbox', root).classList.toggle('collapsed');
    $('#tipsbtn', root).onclick = e => {
      e.stopPropagation();
      // balão à esquerda do painel de Missões (fora dele, para não ser cortado pela rolagem)
      const tb = $('#maptips', root), r = $('#missions', root).getBoundingClientRect();
      if (root.dataset.drawer) { tb.style.top = '56px'; tb.style.right = '8px'; }
      else { tb.style.top = `${Math.max(8, r.top)}px`; tb.style.right = `${window.innerWidth - r.left + 10}px`; }
      tb.classList.toggle('hidden');
    };
    // celular: os painéis abrem numa gaveta lateral pelos ícones
    root.querySelectorAll<HTMLElement>('[data-dock]').forEach(b => { b.onclick = () => this.openDrawer(root.dataset.drawer === b.dataset.dock ? null : b.dataset.dock!); });
    $('#drawerclose', root).onclick = () => this.openDrawer(null);
    $('#drawerbg', root).onclick = () => this.openDrawer(null);
    $('#dock-rest', root).onclick = () => { this.openDrawer(null); this.actions.rest(); };
    $('#dock-end', root).onclick = () => { this.openDrawer(null); this.actions.endTurn(); };
    $('#missiontoggle', root).onclick = () => saveFlag('cbt.missionsMin', $('#missions', root).classList.toggle('collapsed'));
    $('#scoretoggle', root).onclick = () => saveFlag('cbt.scoreOpen', !$('#scorebox', root).classList.toggle('collapsed'));
    $('#dicecenter', root).addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lupa]');
      if (b) { e.stopPropagation(); this.showCard(b.dataset.lupa!); }
    });
    $('#cardview', root).onclick = e => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.cv-x')) this.closeCard(); };
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.cardOpen) { e.stopImmediatePropagation(); this.closeCard(); }
      else if (e.code === 'Escape' && this.bagOpen) { e.stopImmediatePropagation(); this.closeBag(); }
    }, true);
    $('#menubtn', root).onclick = () => this.actions?.menu();
    $('#menubtn', root).before(soundWidget());
    $('#viewbtn', root).onclick = () => toggleView();
    const viewLabel = () => { $('#viewbtn', root).textContent = getSettings().view === 'players' ? '🎥 Jogadores' : '👁 Livre'; };
    viewLabel();
    onSettings(viewLabel);
  }

  bind(game: Game, actions: HudActions) {
    this.game = game;
    this.actions = actions;
    this.selectedCard = null;
    this.inspected = null;
    this.cem = [];
    setGuildNames(Object.fromEntries(game.guilds().map(gs => [gs.id, gs.label])));
    $('#log', this.root).innerHTML = '';
    $('#mapname', this.root).textContent = `${game.map.name} · ${game.map.circle}`;
    this.refresh();
  }

  private portrait(lookId: string, color: string): string {
    const k = `${lookId}|${color}|${getArtVersion()}`;
    let url = this.portraitCache.get(k);
    if (!url) {
      const cv = document.createElement('canvas');
      cv.width = 96; cv.height = 96;
      drawFace(cv, lookId, color);
      url = cv.toDataURL();
      this.portraitCache.set(k, url);
    }
    return url;
  }

  // ------------------------------------------------------------------
  refresh() {
    const g = this.game;
    if (!g) return;
    const cur = g.currentGuild();
    $('#turninfo', this.root).innerHTML = g.s.winner
      ? `<b>Fim de cenário</b>`
      : `<span class="round">Rodada ${g.s.turn}</span> <span class="dot" style="background:${cur.color}"></span> Vez ${GUILD_NAMES[cur.id] ? 'de' : 'da'} <b style="color:${GUILDS[cur.id].light}">${guildShort(cur.id)}</b> ${cur.controller === 'ai' ? '<span class="ai-tag">IA pensando…</span>' : this.isMine(cur.id) ? '<span class="you-tag">Você</span>' : `<span class="ai-tag">${this.nameOf(cur.id) ?? 'Adversário'} jogando…</span>`}`;
    this.renderScore();
    this.paintTurnFrame();
    this.renderActiveBar();
    this.paintDock();
    this.renderActPrompt();
    $('#towin', this.root).textContent = `(vence com ${g.s.missionsToWin})`;
    $('#missionlist', this.root).innerHTML = g.s.missions.map(m => {
      const done = g.s.missionDone[m.id] ?? [];
      return `<div class="mission ${m.kind}" data-mission="${m.id}" title="Clique para ver os objetivos no mapa">
        <div class="mrow"><span class="mkind">${m.kind === 'pve' ? 'Contra o Jogo' : 'Contra Jogador'}</span>
        <span class="mdone">${done.map((gid, i) => `<span class="dot" title="${guildShort(gid)}${i === 0 ? ' (1º bônus)' : ''}" style="background:${GUILDS[gid].color}"></span>`).join('')}</span></div>
        <div class="mname">${m.name}</div><div class="mtext">${m.text}${m.id === 'monstros3' ? ` <i>(${g.guilds().map(x => `${guildShort(x.id)}: ${Math.min(3, x.monsterKills)}/3`).join(' · ')})</i>` : ''}</div>
      </div>`;
    }).join('');
    this.root.querySelectorAll<HTMLElement>('[data-mission]').forEach(el => { el.onclick = () => this.actions.mission(el.dataset.mission!); });
    this.renderTips();
    this.renderTimeline();
    this.renderCemetery();
    this.renderHeroBox();
  }

  /** Celular: abre a gaveta lateral com um painel (ou fecha, com null). */
  openDrawer(kind: string | null) {
    const root = this.root;
    if (kind) root.dataset.drawer = kind; else delete root.dataset.drawer;
    $('#drawerbg', root).classList.toggle('hidden', !kind);
    $('#drawertitle', root).textContent = DOCK.find(d => d[0] === kind)?.[2] ?? '';
    root.querySelectorAll<HTMLElement>('[data-dock]').forEach(b => b.classList.toggle('on', b.dataset.dock === kind));
    $('#maptips', root).classList.add('hidden');
  }

  /** Botões de ação do celular (Descansar / Encerrar) e o ícone do Online. */
  private paintDock() {
    const g = this.game;
    const act = g.s.activation;
    const cur = g.currentGuild();
    const human = this.isMine(cur.id) && !g.s.winner && !g.s.deploying?.length;
    const fresh = !act || (!act.moved && !act.attacked && act.mp === 3);
    ($('#dock-rest', this.root) as HTMLButtonElement).disabled = !(human && fresh);
    ($('#dock-end', this.root) as HTMLButtonElement).disabled = !human;
    $('#dock-end', this.root).classList.toggle('end-now', human && this.nothingLeft());
    const online = this.root.querySelector('#onlinepanel');
    this.root.querySelector<HTMLElement>('[data-dock="online"]')?.classList.toggle('hidden', !online || online.classList.contains('hidden'));
  }

  /** O controlador diz se não sobrou nada para fazer no turno (o "Encerrar Turno" pisca). */
  nothingLeft: () => boolean = () => false;

  /** Herói selecionado esperando o "▶ Ativar". */
  pendingActivate: string | null = null;

  /** Botão grande "▶ Ativar Fulano" acima da barra dos Heróis. */
  private renderActPrompt() {
    const g = this.game;
    const el = $('#actprompt', this.root);
    const id = this.pendingActivate;
    const u = id ? g.s.units[id] : null;
    const cur = g.currentGuild();
    if (!u || !u.alive || u.guild !== cur.id || !this.isMine(cur.id) || g.s.activation?.heroId === u.id || g.s.winner) {
      if (id && (!u || g.s.activation?.heroId === id || u.guild !== cur.id)) this.pendingActivate = null;
      el.classList.add('hidden');
      return;
    }
    // o que acontece ao ativar: começar o turno com ele, trocar o Herói ativado ou ativação extra (Bênção / Grito de Guerra)
    const note = g.s.activation && !g.canBless(u.id) ? `↔ Troca o Herói ativado (${g.name(g.unit(g.s.activation.heroId))})` : g.s.activation ? '✨ Ativação extra' : '';
    const max = g.maxHp(u);
    const ready = u.cards.filter(c => !c.exhausted && g.isAttackCard(c)).length;
    el.innerHTML = `<img src="${this.portrait(u.defId, cur.color)}"/>
      <div class="ap-info">
        <b>${HEROES[u.defId].name}</b><span class="ap-title">${HEROES[u.defId].title}</span>
        <span class="ap-stats"><span title="Vida">❤ ${max - u.wounds}/${max}</span><span title="Defesa">⛨ ${g.defenseDice(u)}</span><span title="Cartas de Ataque prontas">⚔ ${ready} pronta${ready === 1 ? '' : 's'}</span>${u.stunned ? '<span class="ap-stun">✷ Atordoado</span>' : ''}</span>
        ${note ? `<span class="ap-note">${note}</span>` : ''}
      </div>
      <button class="primary" id="ap-go">▶ Ativar</button><button id="ap-x" title="Cancelar (Esc)">✕</button>`;
    el.classList.remove('hidden');
    ($('#ap-go', el) as HTMLElement).onclick = () => this.actions.confirmActivate(u.id);
    ($('#ap-x', el) as HTMLElement).onclick = () => { this.pendingActivate = null; this.inspected = null; this.refresh(); };
  }

  /** Faixa no topo, para todos: de quem é a vez e qual Herói está ativado. */
  private renderActiveBar() {
    const g = this.game;
    const bar = $('#activebar', this.root);
    if (g.s.winner || g.s.deploying?.length) { bar.classList.add('hidden'); $('#heropick', this.root).classList.add('hidden'); return; }
    const cur = g.currentGuild();
    const who = this.isMine(cur.id) ? 'Sua vez!' : cur.controller === 'ai' ? `Vez da IA · ${guildShort(cur.id)}` : `Vez de ${this.nameOf(cur.id) ?? guildShort(cur.id)}`;
    const a = g.s.activation;
    const h = a ? g.unit(a.heroId) : null;
    bar.style.setProperty('--gc', cur.color);
    bar.innerHTML = `<span class="ab-who">${who}</span>${h
      ? `<span class="ab-hero"><img src="${this.portrait(h.defId, cur.color)}"/><b>${HEROES[h.defId]?.name ?? g.name(h)}</b><span class="ab-on">✔ ATIVADO</span><small>${a!.attacked ? 'atacou' : a!.moved ? 'movendo' : ''}</small></span>`
      : '<span class="ab-hero"><small>escolhendo Herói…</small></span>'}`;
    bar.classList.remove('hidden');
    this.renderHeroPick();
  }

  /** Sua vez: os quadradinhos dos seus Heróis logo abaixo da faixa (toque = seleciona e a câmera vai até ele). */
  private renderHeroPick() {
    const g = this.game;
    const el = $('#heropick', this.root);
    const cur = g.currentGuild();
    const a = g.s.activation;
    // aparece enquanto dá para escolher quem ativar: no começo do turno, antes de agir, ou com Bênção / Grito de Guerra
    const choosing = !a || (!a.moved && !a.attacked && a.mp >= 3) || g.heroesOf(cur.id).some(h => h.id !== a.heroId && g.canBless(h.id));
    if (!this.isMine(cur.id) || g.s.winner || g.s.pending || !choosing) { el.classList.add('hidden'); return; }
    const done = g.s.activatedThisTurn ?? [];
    el.innerHTML = g.heroesOf(cur.id).map(h => {
      const max = g.maxHp(h);
      const state = !h.alive || !h.cell ? 'dead' : h.spent ? 'spent' : a?.heroId === h.id ? 'on' : done.includes(h.id) && !g.canBless(h.id) ? 'used' : '';
      const tag = state === 'dead' ? '☠' : state === 'spent' ? '💤' : state === 'on' ? '✔' : state === 'used' ? '✓' : '';
      return `<button class="hp-hero ${state} ${this.pendingActivate === h.id ? 'sel' : ''}" data-hp="${h.id}" ${state === 'dead' ? 'disabled' : ''} title="${HEROES[h.defId].name}">
        <img src="${this.portrait(h.defId, cur.color)}"/><span class="hp-num">${h.num}</span>${tag ? `<span class="hp-tag">${tag}</span>` : ''}
        <span class="hp-life"><i style="width:${h.alive ? ((max - h.wounds) / max) * 100 : 0}%"></i></span></button>`;
    }).join('');
    el.classList.remove('hidden');
    el.querySelectorAll<HTMLElement>('[data-hp]').forEach(b => { b.onclick = () => this.actions.pick(b.dataset.hp!); });
  }

  /** Guilda de quem está olhando a tela (a da vez, se for sua). */
  viewerGuild(): GuildId {
    const cur = this.game.currentGuild().id;
    if (this.isMine(cur)) return cur;
    return this.game.guilds().find(x => this.isMine(x.id))?.id ?? cur;
  }

  /** Dicas do mapa embaixo das Missões: portais, portas trancadas, Títulos, emboscadas… */
  private renderTips() {
    const g = this.game, map = g.map;
    const me = this.viewerGuild();
    const has = (t: string) => g.hasTitle(me, t);
    const tn = (t: string) => `<q>${TITLES[t] ?? t}</q>`;
    const you = (t: string) => has(t) ? '<b class="tip-ok">Você tem.</b>' : '<b class="tip-no">Você não tem.</b>';
    const mon = (id: string) => MONSTERS[id]?.name ?? id;
    const tips: string[] = [];
    if (map.portalTitle) tips.push(`🌀 Portais ${map.portalTitle.color === 'magenta' ? 'vermelhos' : map.portalTitle.color}: só para quem tem o Título ${tn(map.portalTitle.title)}. ${you(map.portalTitle.title)} Os portais azuis são de todos.`);
    else if (map.portals.length) tips.push('🌀 Portais: entrar num portal custa 1 Movimento e leva a qualquer outro portal da mesma cor livre.');
    if (map.lockTitle) tips.push(`🔒 Porta trancada (Esconderijo do Troll): só abre para quem tem ${tn(map.lockTitle)}. ${you(map.lockTitle)}`);
    if (map.hideout) tips.push(`🎁 Esconderijo: o primeiro Herói com o Título que entrar leva a carta ${map.hideout.cards.map(c => `<b>${CARDS[c]?.name ?? c}</b>`).join(', ')}.`);
    if (map.barrier) tips.push(`✨ Barreira mágica: a porta do Templo e os portais vermelhos só funcionam para a Guilda que juntar ${map.barrier.coins} moedas (Baús contam).`);
    if (map.deadlyTokens) tips.push('☠️ Armadilhas matam o Herói na hora; Baús causam Ferimentos iguais ao seu valor.');
    if (map.noEntry || map.id.startsWith('templo')) tips.push('⚰️ Sem Entrada de Monstros: Herói que morre sai da partida.');
    if (map.hiddenMissions?.length) tips.push('❓ Os marcadores de Missão estão escondidos entre os de Exploração: vire os "?" para encontrá-los.');
    if (map.ambush) tips.push(`⚠️ Emboscada: os marcadores ${map.ambush.colors.join(' e ')} viram ${mon(map.ambush.monster)}, que ataca quem os encontrar.`);
    if (g.s.missions.some(m => m.rule === 'escort')) tips.push('🦅 Escolta: cada Guilda carrega só 1 marcador por vez; se o Herói morrer, o marcador cai no Espaço. Clique na Missão para ver o destino (verde).');
    if (map.boxOnDeath?.length) tips.push(`📦 Voltam para a caixa ao morrer (não revivem): ${[...new Set(map.boxOnDeath)].map(mon).join(', ')}.`);
    if (map.gateGuardTitle) tips.push(`🚪 Quem tem ${tn(map.gateGuardTitle)} controla as Entradas de Monstro: os Monstros do Cemitério não voltam. ${you(map.gateGuardTitle)}`);
    if (map.weakOrcsTitle) tips.push(`🪓 Quem tem ${tn(map.weakOrcsTitle)} enfrenta Orcs e Goblins um nível abaixo. ${you(map.weakOrcsTitle)}`);
    if (map.fireProtectTitle) tips.push(`🔥 Quem tem ${tn(map.fireProtectTitle)} é imune aos efeitos extras de Armadilhas e Baús. ${you(map.fireProtectTitle)}`);
    if (map.rebelTitle) tips.push(`🛡️ Quem tem ${tn(map.rebelTitle)} começa com 2 Orcs a menos perto da Área Inicial. ${you(map.rebelTitle)}`);
    if (!tips.length) tips.push(...(map.notes ?? []).map(n => `📜 ${n}`));
    tips.push('🏁 A partida só acaba no fim do turno de quem cumpriu as Missões.');
    const box = $('#maptips', this.root);
    box.innerHTML = `<div class="tips-h">💡 Dicas do mapa <button class="tips-x" title="Fechar">✕</button></div><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
    (box.querySelector('.tips-x') as HTMLElement).onclick = () => box.classList.add('hidden');
  }

  /** Janela de confirmação (Enter confirma, Esc cancela). */
  confirm(title: string, body: string, ok = 'Confirmar', cancel = 'Cancelar'): Promise<boolean> {
    const box = $('#confirmbox', this.root);
    box.innerHTML = `<div class="cf-box"><div class="cf-title">${title}</div><div class="cf-body">${body}</div>
      <div class="cf-btns"><button id="cf-no">✕ ${cancel}</button><button class="primary" id="cf-yes">✔ ${ok}</button></div></div>`;
    box.classList.remove('hidden');
    play('scan');
    return new Promise(res => {
      const end = (v: boolean) => { window.removeEventListener('keydown', key, true); box.classList.add('hidden'); res(v); };
      const key = (e: KeyboardEvent) => {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); end(true); }
        else if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(false); }
        else e.stopImmediatePropagation(); // com a janela aberta, as outras teclas (Espaço = encerrar turno…) não valem
      };
      window.addEventListener('keydown', key, true);
      ($('#cf-yes', box) as HTMLElement).onclick = () => end(true);
      ($('#cf-no', box) as HTMLElement).onclick = () => end(false);
    });
  }
  /** Escolha entre opções (ex.: com qual Aliado trocar de lugar). Esc cancela. */
  choose(title: string, body: string, options: { id: string; html: string }[]): Promise<string | null> {
    const box = $('#confirmbox', this.root);
    box.innerHTML = `<div class="cf-box"><div class="cf-title">${title}</div><div class="cf-body">${body}</div>
      <div class="cf-opts">${options.map(o => `<button data-opt="${o.id}">${o.html}</button>`).join('')}</div>
      <div class="cf-btns"><button id="cf-no">✕ Cancelar</button></div></div>`;
    box.classList.remove('hidden');
    return new Promise(res => {
      const end = (v: string | null) => { window.removeEventListener('keydown', key, true); box.classList.add('hidden'); res(v); };
      const key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(null); } else e.stopImmediatePropagation(); };
      window.addEventListener('keydown', key, true);
      box.querySelectorAll<HTMLElement>('[data-opt]').forEach(b => { b.onclick = () => end(b.dataset.opt!); });
      ($('#cf-no', box) as HTMLElement).onclick = () => end(null);
    });
  }
  /** Retrato de um personagem (para listas de escolha). */
  portraitOf(u: Unit): string { return this.portrait(u.defId, u.guild ? this.game.guild(u.guild).color : '#4a3a5a'); }
  get confirming() { return !$('#confirmbox', this.root).classList.contains('hidden'); }

  /** Carta de Recompensa (ou Título) que a Missão dá: aparece na tela até fechar no ✕. */
  showPrize(m: { name: string; reward?: boolean; title?: string }) {
    const g = this.game;
    const box = $('#prizebox', this.root);
    const card = m.reward ? (g.s.rewardDeck?.[0] ?? g.map.missions.rewards[0]) : null;
    if (!card && !m.title) { box.classList.add('hidden'); return; }
    const left = m.reward ? (g.s.rewardDeck?.length ?? 0) : 0;
    box.innerHTML = `<div class="pz-box"><button class="pz-x" title="Fechar">✕</button>
      <div class="aw-kind">${card ? '🃏 Recompensa' : '🏅 Título'} · ${m.name}</div>
      ${card ? `<div class="aw-card">${itemCard(card)}</div><div class="pz-sub">${left ? `Restam ${left} carta${left > 1 ? 's' : ''} de Recompensa` : 'As cartas de Recompensa já acabaram'}</div>` : ''}
      ${m.title ? `<div class="aw-title">${TITLES[m.title] ?? m.title}</div><div class="aw-text">${TITLE_TEXT[m.title] ?? ''}</div>` : ''}</div>`;
    box.classList.remove('hidden');
    paintCardArt(box);
    (box.querySelector('.pz-x') as HTMLElement).onclick = () => box.classList.add('hidden');
  }

  /** Placar: uma linha por Guilda; aberto, mostra os detalhes. */
  private renderScore() {
    const g = this.game;
    const cur = g.currentGuild();
    $('#scoresub', this.root).textContent = `(vence com ${g.s.missionsToWin} Missões)`;
    $('#score', this.root).innerHTML = g.s.guildOrder.map(id => {
      const gs = g.guild(id);
      const heroes = g.heroesOf(id);
      const alive = heroes.filter(h => h.alive).length;
      const deaths = heroes.reduce((s, h) => s + h.deaths, 0);
      const tokens = heroes.reduce((s, h) => s + h.tokens.length, 0);
      const done = gs.missions.map(m => g.s.missions.find(x => x.id === m)?.name ?? m);
      const titles = g.s.titles?.[id] ?? [];
      const who = this.nameOf(id) ?? (gs.controller === 'ai' ? 'IA' : this.isMine(id) ? 'Você' : 'Jogador');
      return `<div class="sc-guild ${id === cur.id && !g.s.winner ? 'cur' : ''} ${g.s.winner === id ? 'win' : ''}" style="--gc:${gs.color}">
        <div class="sc-row"><span class="dot" style="background:${gs.color}"></span><b class="sc-name">${guildShort(id)}</b><small>${who}</small>
          <span title="Moedas: ${gs.coins} + ${g.wealth(id) - gs.coins} dos Baús de Tesouro">🪙 ${g.wealth(id)}</span><span title="Monstros mortos">💀 ${gs.monsterKills}</span><span title="Missões cumpridas">🏆 ${gs.missions.length}/${g.s.missionsToWin}</span></div>
        <div class="sc-detail">
          <span title="Mortes de Heróis da Guilda">☠ ${deaths} mortes</span>
          <span title="Heróis vivos">❤ ${alive}/${heroes.length} vivos</span><span title="Marcadores de Exploração">🎒 ${tokens}</span>
          <div class="sc-heroes">${heroes.map(h => `<span class="${h.alive ? '' : 'dead'}" title="${HEROES[h.defId].name}: ${h.alive ? `${g.maxHp(h) - h.wounds}/${g.maxHp(h)} de Vida` : 'morto'}">${HEROES[h.defId].name} <i>${h.alive ? `❤${g.maxHp(h) - h.wounds}` : '☠'}</i></span>`).join('')}</div>
          ${done.length ? `<div class="sc-miss">✔ ${done.join(' · ')}</div>` : '<div class="sc-miss muted">Nenhuma Missão cumprida</div>'}
          ${titles.length ? `<div class="sc-miss">🏅 ${titles.length} Título(s)</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // ------------------------------------------------------------------
  /** Lupa: mostra a carta do personagem com os valores atuais (verde = melhorado, vermelho = piorado). */
  private cardOpen: string | null = null;
  showCard(id: string) {
    const g = this.game;
    const u = g.unit(id);
    const box = $('#cardview', this.root);
    this.cardOpen = id;
    let body: string;
    if (u.kind === 'monster') {
      const md = MONSTERS[u.defId];
      const hpNow = u.alive ? md.hp - u.wounds : 0;
      const live = { def: g.defenseDice(u), hp: hpNow, maxHp: md.hp, rr: g.rerollsOf(u) };
      body = `<div class="cv-cards">${monsterCard(u.defId, '', '', live)}</div>
        <div class="cv-info">
          <div class="cv-life">❤ Vida atual: <b class="${stat(hpNow, md.hp)}">${hpNow}/${md.hp}</b></div>
          ${u.stunned ? '<div class="tag stun">Atordoado: não rola Defesa (Defesa 0)</div>' : ''}
          ${this.modList([['Vida', md.hp, hpNow], ['Defesa', md.defense, live.def], ['Rerrolagem', md.rerolls, live.rr]])}
        </div>`;
    } else {
      const hd = HEROES[u.defId];
      const max = g.maxHp(u);
      const hpNow = u.alive ? max - u.wounds : 0;
      const atk = g.attackBonus(u);
      const live = { def: g.defenseDice(u), hp: hpNow, maxHp: max, rr: g.rerollsOf(u), atk: atk.n };
      body = `<div class="cv-cards">${heroCard(u.defId, '', '', '', '', live)}</div>
        <div class="cv-info">
          <div class="cv-life">❤ Vida atual: <b class="${stat(hpNow, hd.hp)}">${hpNow}/${max}</b>${max !== hd.hp ? ` <small>(máx. ${max}; carta ${hd.hp})</small>` : ''} · ☠ ${u.deaths} morte(s)</div>
          ${u.stunned ? '<div class="tag stun">Atordoado: não rola Defesa até Descansar</div>' : ''}
          ${u.curse === 'amnesia' ? '<div class="tag dead">Amnésia: sem Habilidade Natural</div>' : ''}
          ${this.modList([['Vida', hd.hp, hpNow], ['Vida máxima', hd.hp, max], ['Defesa', hd.defense, live.def], ['Rerrolagem', 0, live.rr], ['Dados de ataque (bônus)', 0, atk.n]])}
          ${atk.notes.length ? `<div class="muted">${atk.notes.join(' · ')}</div>` : ''}
        </div>
        <h4>Cartas</h4>
        <div class="cv-items">${u.cards.map(c => itemCard(c.defId, c.exhausted ? 'disc' : '', '', false, atk.n)).join('') || '<i class="muted">Sem cartas</i>'}${u.curse ? curseCard(u.curse) : ''}</div>`;
    }
    box.innerHTML = `<div class="cv-box"><button class="cv-x" title="Fechar (Esc)">✕</button>${body}</div>`;
    box.classList.remove('hidden');
    paintCardArt(box);
  }

  private modList(rows: [string, number, number][]) {
    const out = rows.filter(([, b, n]) => b !== n).map(([name, b, n]) => `<div class="cv-mod ${n > b ? 'up' : 'down'}">${n > b ? '▲' : '▼'} ${name}: <b>${n}</b> <small>(carta: ${b})</small></div>`);
    return out.length ? `<div class="cv-mods">${out.join('')}</div>` : '<div class="cv-mods muted">Sem bônus nem penalidades agora.</div>';
  }

  // ------------------------------------------------------------------
  /** Bolsa do Herói: consumíveis (poções) em cima, com "Usar" quando dá para usar agora; depois Baús e Missões. */
  private bagOpen: string | null = null;
  showBag(id: string) {
    const g = this.game;
    const u = g.unit(id);
    const act = g.s.activation;
    const canUse = act?.heroId === u.id && this.isMine(u.guild!) && !g.s.winner;
    const box = $('#bagview', this.root);
    this.bagOpen = id;
    const items = sortTokens(u.tokens);
    const row = (t: Token) => {
      const cons = CONSUMABLE.includes(t.type);
      const why = !cons ? '' : !canUse ? 'Ative este Herói no seu turno para usar' : u.curse === 'aquafobia' ? 'Aquafobia: não pode usar Poções' : t.type === 'turno' && g.s.extraTurn ? 'Já há um turno adicional' : '';
      return `<div class="bag-it ${cons ? 'cons' : ''}"><img src="${tokenUrl(tokenImageId(t) ?? 'fundo')}"/>
        <div><b>${tokenName(t)}</b><small>${t.type === 'missao' ? 'Marcador de Missão' : TOKEN_INFO[t.type].text}</small></div>
        ${cons ? `<button class="primary" data-use="${t.id}" ${why ? `disabled title="${why}"` : ''}>Usar</button>` : ''}</div>`;
    };
    box.innerHTML = `<div class="bag-box"><button class="cv-x" title="Fechar (Esc)">✕</button>
      <h3>🎒 Bolsa de ${g.name(u)}</h3>
      ${items.length ? items.map(row).join('') : '<p class="muted">Sem marcadores. Ande sobre os "?" do mapa para pegar.</p>'}
      ${items.length && !canUse ? '<p class="muted">Poções só podem ser usadas pelo Herói ativo, no seu turno.</p>' : ''}</div>`;
    box.classList.remove('hidden');
    (box.querySelector('.cv-x') as HTMLElement).onclick = () => this.closeBag();
    box.onclick = e => { if (e.target === box) this.closeBag(); };
    box.querySelectorAll<HTMLElement>('[data-use]').forEach(b => { b.onclick = () => { this.closeBag(); this.actions.useToken(b.dataset.use!); }; });
  }
  closeBag() { this.bagOpen = null; $('#bagview', this.root).classList.add('hidden'); }
  get bagIsOpen() { return !!this.bagOpen; }

  closeCard() { this.cardOpen = null; $('#cardview', this.root).classList.add('hidden'); }

  // ------------------------------------------------------------------
  /** Marcador pego: aparece no centro da tela com o verso (?) virando para a face. Vários seguidos entram na fila. */
  private flipQueue: { heroId: string; tokens: { token: Token; hidden: boolean }[]; used?: boolean; done?: () => void }[] = [];
  private flipBusy = false;
  private flipDone: (() => void) | undefined;
  /** Marcadores pegos de uma vez (mesmo Espaço). Os virados para baixo giram juntos; os que já estavam à mostra só aparecem.
   *  `done` é chamado quando a animação acaba (o jogo espera). */
  flipTokens(heroId: string, tokens: { token: Token; hidden: boolean }[], done?: () => void) {
    this.flipQueue.push({ heroId, tokens: tokens.map(x => ({ token: { ...x.token }, hidden: x.hidden })), done });
    if (!this.flipBusy) this.nextFlip();
  }
  /** Marcador usado (poção): aparece no centro com o efeito. */
  showUsed(heroId: string, token: Token, done?: () => void) {
    this.flipQueue.push({ heroId, tokens: [{ token: { ...token }, hidden: false }], used: true, done });
    if (!this.flipBusy) this.nextFlip();
  }
  private nextFlip() {
    const box = $('#tokenflip', this.root);
    this.flipDone?.();
    this.flipDone = undefined;
    const it = this.flipQueue.shift();
    if (!it) { this.flipBusy = false; box.classList.add('hidden'); return; }
    this.flipBusy = true;
    this.flipDone = it.done;
    const g = this.game;
    const u = g.s.units[it.heroId];
    const color = u?.guild ? g.guild(u.guild).color : '#e6c8ff';
    const sp = Math.max(1, this.speed);
    const anyHidden = it.tokens.some(x => x.hidden);
    const traps = it.tokens.some(x => x.token.type === 'armadilha');
    if (it.used) play(it.tokens[0].token.type === 'cura' ? 'healing' : 'refresh');
    else {
      play('pick-item');
      // som e borda da Armadilha só depois do giro (sem spoiler)
      if (traps) setTimeout(() => { play('trap'); box.querySelector('.tf-card')?.classList.add('bad'); }, (anyHidden ? 1400 : 0) / sp);
    }
    const coin = (x: { token: Token; hidden: boolean }) => {
      const t = x.token;
      const face = tokenImageId(t);
      const faceHtml = face ? `<img class="tf-face" src="${tokenUrl(face)}"/>` : `<div class="tf-face tf-txt">${tokenName(t)}</div>`;
      return x.hidden
        ? `<div class="tf-coin"><div class="tf-spin" style="--sp:${(1.4 / sp).toFixed(2)}s"><img class="tf-back" src="${tokenUrl('fundo')}"/><img class="tf-back2" src="${tokenUrl('fundo')}"/>${faceHtml}</div></div>`
        : `<div class="tf-coin tf-static">${face ? `<img src="${tokenUrl(face)}"/>` : `<div class="tf-txt">${tokenName(t)}</div>`}</div>`;
    };
    const many = it.tokens.length > 1;
    const one = it.tokens[0].token;
    box.innerHTML = `<div class="tf-card ${it.used || !anyHidden ? 'used' : ''} ${many ? 'many' : ''}">
        <div class="tf-coins">${it.tokens.map(coin).join('')}</div>
        <div class="tf-name">${it.tokens.map(x => tokenName(x.token)).join(' · ')}</div>
        <div class="tf-who" style="color:${color}">${u ? g.name(u) : ''} ${it.used ? 'usou!' : 'pegou!'}</div>
        ${many ? '' : `<div class="tf-text">${one.type === 'missao' ? 'Marcador de Missão' : TOKEN_INFO[one.type].text}</div>`}
      </div>`;
    box.classList.remove('hidden');
    const card = box.firstElementChild as HTMLElement;
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('flip')));
    const ms = (anyHidden && !it.used ? 2600 : 1600) / sp;
    setTimeout(() => { card.classList.add('out'); setTimeout(() => this.nextFlip(), 300); }, ms);
  }

  /** Recompensa ou Título: aparece no centro da tela para todos. `done` quando acabar (o jogo espera). */
  showAward(e: Extract<GameEvent, { t: 'reward' } | { t: 'title' }>, done?: () => void) {
    const g = this.game;
    const box = $('#awardbox', this.root);
    let html: string;
    if (e.t === 'reward') {
      const u = g.s.units[e.heroId];
      const color = u?.guild ? g.guild(u.guild).color : '#e0b43a';
      html = `<div class="aw-box"><div class="aw-kind">🏆 Carta de Recompensa</div>
        <div class="aw-card">${itemCard(e.cardId)}</div>
        <div class="aw-who" style="color:${color}">${u ? g.name(u) : ''} recebeu ${CARDS[e.cardId]?.name ?? ''}!</div></div>`;
    } else {
      html = `<div class="aw-box title"><div class="aw-kind">🏅 Novo Título</div>
        <div class="aw-title">${e.name}</div>
        <div class="aw-who" style="color:${g.guild(e.guild).color}">${guildShort(e.guild)} conquistou o Título!</div>
        <div class="aw-text">${TITLE_TEXT[e.title] ?? ''}</div></div>`;
    }
    box.innerHTML = html;
    box.classList.remove('hidden');
    play('pick-item');
    paintCardArt(box);
    setTimeout(() => { box.classList.add('hidden'); done?.(); }, 3200 / Math.max(1, this.speed));
  }

  /** Moldura da cor da Guilda em volta da tela quando é a vez deste jogador. */
  private paintTurnFrame() {
    const g = this.game;
    const fr = $('#turnframe', this.root);
    const cur = g.currentGuild();
    const mine = !g.s.winner && !g.s.deploying?.length && this.isMine(cur.id);
    fr.classList.toggle('hidden', !mine);
    if (mine) fr.style.setProperty('--tc', cur.color);
  }

  /** Monstros no Cemitério (Tabuleiro de Entrada de Monstro). Atualizado por eventos durante as animações. */
  cem: string[] = [];
  syncCemetery() { this.cem = this.game.s.entryBoard.slice(); this.renderCemetery(); }

  private renderCemetery() {
    const g = this.game;
    const slots = [0, 1, 2, 3, 4].map(i => {
      const id = this.cem[i];
      if (!id) return `<div class="cem-slot empty">${i + 1}</div>`;
      const md = MONSTERS[g.unit(id).defId];
      return `<div class="cem-slot" title="${md.name}"><img src="${this.portrait(md.id, '#4a3a5a')}"/><span>${md.abbr}</span></div>`;
    }).join('');
    const full = this.cem.length >= 5;
    $('#cemetery', this.root).innerHTML = `<div class="cem-row">${slots}</div>
      <div class="cem-info ${full ? 'full' : ''}">${full ? '☠ Cheio! Os monstros revivem no fim deste turno.' : `${this.cem.length}/5 — com 5 (ou mapa sem monstros) eles revivem.`}</div>`;
  }

  /** Janela de Entrada de Monstros: rolagem de 2 dados por monstro. */
  private spawnHideTimer = 0;
  spawnStart(ids: string[]) {
    const g = this.game;
    const box = $('#spawnbox', this.root);
    clearTimeout(this.spawnHideTimer);
    box.innerHTML = `<div class="panel-h">☠ Entrada de Monstros!</div><div class="sp-sub">Role 2 dados por monstro e compare com os bueiros (Marcadores de Entrada).</div>
      ${ids.map(id => `<div class="sp-row" data-sp="${id}"><img src="${this.portrait(g.unit(id).defId, '#4a3a5a')}"/><span class="sp-name">${MONSTERS[g.unit(id).defId].name}</span><span class="sp-dice"></span><span class="sp-res muted">aguardando…</span></div>`).join('')}`;
    box.classList.remove('hidden');
  }

  /** onLand: chamado quando os dados param (a câmera vai até a Entrada indicada). */
  spawnRoll(e: Extract<GameEvent, { t: 'spawnRoll' }>, done: () => void, onLand?: () => void) {
    if (e.faces.length) play('dice', 0.6);
    const row = this.root.querySelector(`[data-sp="${e.id}"]`) as HTMLElement | null;
    const finish = () => {
      this.cem = this.cem.filter(x => x !== e.id);
      this.renderCemetery();
      clearTimeout(this.spawnHideTimer);
      this.spawnHideTimer = window.setTimeout(() => $('#spawnbox', this.root).classList.add('hidden'), 2600 / this.speed);
      done();
    };
    if (!row) { finish(); return; }
    const dice = row.querySelector('.sp-dice') as HTMLElement;
    const res = row.querySelector('.sp-res') as HTMLElement;
    row.classList.add('active');
    dice.innerHTML = `<span class="die black">${dieImg('blank', true)}</span><span class="die black">${dieImg('blank', true)}</span>`;
    const faces: DieFace[] = ['crit', 'melee', 'ranged', 'blank'];
    const spin = window.setInterval(() => dice.querySelectorAll('.die').forEach(d => { d.innerHTML = dieImg(faces[Math.floor(Math.random() * 4)], true); }), 70);
    window.setTimeout(() => {
      clearInterval(spin);
      dice.innerHTML = e.faces.map(f => `<span class="die black hit">${dieImg(f, true)}</span>`).join('');
      res.className = `sp-res ${e.cell ? 'good' : 'bad'}`;
      res.textContent = e.cell ? `${e.reason} (${e.cell.c},${e.cell.r})` : e.reason;
      row.classList.remove('active');
      onLand?.();
      // tempo para a câmera chegar e mostrar a Entrada antes do próximo Monstro
      window.setTimeout(finish, (onLand ? 1000 : 450) / this.speed);
    }, 750 / this.speed);
  }

  private renderTimeline() {
    const g = this.game;
    const act = g.s.activation;
    const cur = g.currentGuild();
    const html = g.guilds().map(gs => {
      const heroes = g.heroesOf(gs.id).map(h => {
        const max = g.maxHp(h);
        const hp = h.alive ? max - h.wounds : 0;
        const cls = ['tl-hero', !h.alive ? 'dead' : '', act?.heroId === h.id ? 'active' : '', gs.id === cur.id && this.isMine(gs.id) && h.alive ? 'clickable' : '', this.inspected === h.id ? 'insp' : ''].join(' ');
        return `<div class="${cls}" data-hero="${h.id}" title="${HEROES[h.defId].name}">
          <img src="${this.portrait(h.defId, gs.color)}"/>
          <span class="num" style="background:${gs.color}">${h.num}</span>
          ${h.stunned ? '<span class="stun">✷</span>' : ''}
          ${!h.alive ? '<span class="skull">☠</span>' : ''}
          <div class="hpbar"><i style="width:${(hp / max) * 100}%"></i></div>
        </div>`;
      }).join('');
      return `<div class="tl-guild ${gs.id === cur.id ? 'cur' : ''}" style="--gc:${gs.color}">${heroes}</div>`;
    }).join('<div class="tl-sep"></div>');
    const tl = $('#timeline', this.root);
    tl.innerHTML = `<div class="tl-clock">⏱<b>${g.s.turn}</b></div>${html}`;
    tl.querySelectorAll<HTMLElement>('[data-hero]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.hero!;
        const u = g.unit(id);
        if (u.guild === cur.id && this.isMine(cur.id) && u.alive) this.actions.activate(id);
        else this.actions.inspect(id);
      };
    });
  }

  private renderHeroBox() {
    const g = this.game;
    const box = $('#herobox', this.root);
    const act = g.s.activation;
    const cur = g.currentGuild();
    const id = this.inspected ?? act?.heroId ?? null;
    const human = this.isMine(cur.id) && !g.s.winner && !g.s.deploying?.length;
    const fresh = !act || (!act.moved && !act.attacked && act.mp === 3);
    const actions = `
      <div class="actions">
        <button id="btn-rest" ${human && fresh ? '' : 'disabled'} title="Restaurar cartas, recuperar atordoados e ressuscitar (R)">💤 Descansar Guilda</button>
        <button id="btn-end" class="primary ${human && this.nothingLeft() ? 'end-now' : ''}" ${human ? '' : 'disabled'} title="Encerrar o turno (Espaço)">Encerrar Turno ⏎</button>
      </div>`;
    if (!id) {
      box.innerHTML = `<div class="empty">${g.s.deploying?.length ? 'Posicionamento: coloque seus Heróis na Área Inicial.' : human ? 'Clique em um dos seus Heróis (anel colorido) e depois em <b>▶ Ativar</b>,<br/>ou <b>Descanse</b> a Guilda.<br/><small>Ctrl + clique num Espaço marca o lugar para todos.</small>' : 'Aguardando o adversário…'}</div>${actions}`;
      this.bindActions(box);
      return;
    }
    const u = g.unit(id);
    if (u.kind === 'monster') {
      const md = MONSTERS[u.defId];
      box.innerHTML = `
        <div class="hb-head"><img src="${this.portrait(u.defId, '#7a2b8f')}"/><div><div class="hb-name">${md.name}</div><div class="hb-sub">${md.category} · Nível ${md.level}</div></div><button class="lupa" id="hb-card" title="Ver a carta com os valores atuais">🔍</button><button class="x" id="hb-close">✕</button></div>
        <div class="stats">
          <span title="Vida atual" class="${stat(md.hp - u.wounds, md.hp)}">❤ ${md.hp - u.wounds}/${md.hp}</span><span title="Extermínio">☠ ${md.exterm}</span>
          <span title="Defesa" class="${stat(g.defenseDice(u), md.defense)}">⛨ ${g.defenseDice(u)}</span><span title="Movimento">👣 ${md.move}</span><span title="Recompensa">🪙 ${md.reward}</span>
        </div>
        <div class="mcard"><b>${md.attackType === 'melee' ? '⚔ Ataque Próximo' : '➶ Ataque a Distância'}</b> — ${md.attackName}: ${md.dice} dados</div>
        <div class="hb-note">Reação de Alerta: ataca quem sair de um Espaço Perto dele ou atacar outro alvo estando Perto.<br/>Reação de Vingança: ao ser atacado, move até ${md.move} e revida.</div>
        ${u.stunned ? '<div class="tag stun">Atordoado (não rola Defesa)</div>' : ''}
        ${actions}`;
      $('#hb-close', box).onclick = () => this.actions.inspect(null);
      $('#hb-card', box).onclick = () => this.showCard(u.id);
      this.bindActions(box);
      return;
    }
    const hd = HEROES[u.defId];
    const gs = g.guild(u.guild!);
    const isActive = act?.heroId === u.id;
    const mine = human && u.guild === cur.id;
    const max = g.maxHp(u);
    const cards: (CardInst | null)[] = [...u.cards];
    // Maldição que ocupa espaço: aparece como uma carta no inventário (com a carta que ficou debaixo dela)
    const curseSlot = u.curse && CURSES[u.curse]?.slot ? 1 : 0;
    while (cards.length < g.slotCount(u) - curseSlot) cards.push(null);
    const usableIds = isActive && !act!.attacked ? new Set(g.usableCards(u).map(c => c.uid)) : new Set<string>();
    if (isActive && this.selectedCard && !usableIds.has(this.selectedCard)) this.selectedCard = null;
    if (isActive && !this.selectedCard && usableIds.size) this.selectedCard = [...usableIds][0];
    box.innerHTML = `
      <div class="hb-head">
        <img src="${this.portrait(u.defId, gs.color)}" style="border-color:${gs.color}"/>
        <div><div class="hb-name">${hd.name} <span class="num" style="background:${gs.color}">${u.num}</span></div><div class="hb-sub">${hd.title} · ${guildShort(gs.id)}</div></div>
        <button class="lupa" id="hb-card" title="Ver a carta com os valores atuais">🔍</button>
        ${this.inspected ? '<button class="x" id="hb-close">✕</button>' : ''}
      </div>
      <div class="stats hb-meds">
        ${u.alive && max - u.wounds > 0 ? medal('hp', max - u.wounds, `Vida: ${max - u.wounds} de ${max} (carta: ${hd.hp})`, 'hbm') : `<span class="hbm-zero" title="Sem Vida"><img src="${import.meta.env.BASE_URL}bonus/hp1.webp" alt=""/><b>0</b></span>`}
        ${g.defenseDice(u) > 0 ? medal('def', g.defenseDice(u), `${g.defenseDice(u)} dado${g.defenseDice(u) === 1 ? '' : 's'} de Defesa (carta: ${hd.defense})`, 'hbm') : `<span class="hbm-zero" title="Sem dados de Defesa"><img src="${import.meta.env.BASE_URL}bonus/def1.webp" alt=""/><b>0</b></span>`}
        ${g.rerollsOf(u) ? medal('rr', g.rerollsOf(u), `Rerrolagem ${g.rerollsOf(u)}`, 'hbm') : ''}
        ${u.deaths ? medal('skull', u.deaths, `Morreu ${u.deaths} vez${u.deaths === 1 ? '' : 'es'} neste cenário`, 'hbm') : ''}
        ${isActive ? (g.freeMode ? '<span class="mp" title="Modo Livre">👣 ∞</span>' : `<span class="mp" title="Pontos de Movimento">👣 ${[0, 1, 2].map(i => `<i class="${i < act!.mp && !act!.moveLocked ? 'on' : ''}"></i>`).join('')}</span>`) : ''}
        ${isActive ? `<span title="Ataque">${act!.attacked ? '⚔ usado' : '⚔ disponível'}</span>` : ''}
      </div>
      <div class="ability ${u.curse === 'amnesia' ? 'off' : ''}"><b>${hd.abilityName}</b> — ${hd.abilityText}</div>
      ${u.curse ? `<div class="tag dead hb-curse" title="${CURSES[u.curse]?.text ?? ''}">${curseArt(u.curse)}<span>☠ Maldição: <b>${CURSES[u.curse]?.name}</b> — ${CURSES[u.curse]?.text}</span></div>` : ''}
      ${g.rerollsOf(u) ? `<div class="tag rr">↻ Rerrolagem ${g.rerollsOf(u)} ${getSettings().reroll === 'auto' ? '(automática nos dados que falharem)' : '(você escolhe os dados após cada rolagem)'}</div>` : ''}
      ${u.stunned ? '<div class="tag stun">✷ Atordoado — não rola Defesa até Descansar</div>' : ''}
      ${!u.alive ? '<div class="tag dead">☠ Morto — ressuscita quando a Guilda Descansar</div>' : ''}
      ${u.spent ? '<div class="tag stun">💤 Exausto por uma carta — não pode ser ativado até a Guilda Descansar</div>' : ''}
      <div class="cards">${cards.map(c => this.cardHtml(c, u, usableIds, mine || (human && this.isMine(u.guild!)))).join('')}${curseSlot ? `<div class="card mini curse-slot" title="${CURSES[u.curse!].name}: ${CURSES[u.curse!].text}${u.covered ? ` Debaixo dela: ${CARDS[u.covered.defId].name} (indisponível até uma Poção de Cura).` : ''}">
        <div class="cname">☠ ${CURSES[u.curse!].name}</div><div class="cart">${curseArt(u.curse!)}</div>${u.covered ? `<div class="ccov">cobre: ${CARDS[u.covered.defId].name}</div>` : '<div class="ccov">Maldição</div>'}</div>` : ''}</div>
      <div class="tokrow"><button class="tok-bag" id="hb-bag2" title="Abrir a bolsa">🎒</button>${u.tokens.length ? `${sortTokens(u.tokens).slice(0, 3).map(t => `<img class="tok-mini" src="${tokenUrl(tokenImageId(t) ?? 'fundo')}" title="${tokenName(t)}"/>`).join('')}${u.tokens.length > 3 ? `<span class="tok-more">+${u.tokens.length - 3}</span>` : ''}` : '<span class="muted">Bolsa vazia</span>'}</div>
      ${actions}`;
    if (this.inspected) $('#hb-close', box).onclick = () => this.actions.inspect(null);
    $('#hb-card', box).onclick = () => this.showCard(u.id);
    box.querySelectorAll<HTMLElement>('[data-card]').forEach(el => {
      el.onclick = () => { if (mine && isActive && usableIds.has(el.dataset.card!)) this.actions.selectCard(el.dataset.card!); };
    });
    box.querySelectorAll<HTMLElement>('[data-useact]').forEach(b => {
      b.onclick = e => { e.stopPropagation(); if (!b.classList.contains('off')) this.actions.useCard(u.id, b.dataset.useact!); };
    });
    const openBag = () => this.showBag(u.id);
    $('#hb-bag2', box).onclick = openBag;
    if (this.bagOpen === u.id) this.showBag(u.id);
    this.bindActions(box);
  }

  private cardHtml(c: CardInst | null, u: Unit, usable: Set<string>, mine = false) {
    if (!c) return `<div class="card empty-slot"><span>vazio</span></div>`;
    const act = this.game.activatable(u, c);
    const actBtn = act ? (mine
      ? `<button class="c-act ${act.ok ? '' : 'off'} ${act.armed ? 'armed' : ''}" data-useact="${c.uid}" title="${act.label}${act.why ? ` — ${act.why}` : ''}">${act.toggle ? (act.armed ? '🛡️ Armado' : '🛡️ Armar') : '⚡ Usar'}</button>`
      : act.armed ? '<span class="c-act armed" title="Escudo armado">🛡️ Armado</span>' : '') : '';
    const d = CARDS[c.defId];
    const maya = HEROES[u.defId].ability === 'dominio_magia' && d.magic;
    const sel = this.selectedCard === c.uid && usable.has(c.uid);
    const bonus = d.kind === 'attack' ? this.game.attackBonus(u).n : 0;
    // mini carta: nome, arte e os números (dados de ataque, Defesa, Vida, Rerrolagem); o texto fica no toque longo / mouse e na lupa
    const tip = `${d.name} — ${ITEM_LEVEL[d.level]?.name ?? ''}${d.text ? `: ${d.text}` : ''}`.replace(/"/g, '&quot;');
    const fill = CARD_ART[c.defId]?.kind === 'fill';
    return `<div class="card mini k-${d.kind} ${c.exhausted ? 'exhausted' : ''} ${sel ? 'selected' : ''} ${usable.has(c.uid) ? 'usable' : ''}" data-card="${c.uid}" style="--lv:${itemColor(c.defId)}" title="${tip}">
      <div class="cname">${d.name}</div>${actBtn}
      <div class="cart ${fill ? 'fill' : ''}">${itemArt(c.defId)}</div>
      ${d.kind === 'attack' ? `<div class="cicons">${medal(d.attackType === 'melee' ? 'melee' : 'ranged', d.dice + bonus, `${d.dice + bonus} dados de ataque ${d.attackType === 'melee' ? 'Próximo' : 'a Distância'}${bonus ? ` (carta ${d.dice} + ${bonus} de bônus)` : ''}`, `catk${bonus > 0 ? ' up' : ''}`)}</div>` : ''}
      ${maya && !c.exhausted && c.uses > 0 ? '<div class="cuses">1 uso restante</div>' : ''}
      ${c.exhausted ? '<div class="cexh">EXAUSTADA</div>' : ''}
    </div>`;
  }

  private bindActions(box: HTMLElement) {
    const r = box.querySelector<HTMLButtonElement>('#btn-rest');
    const e = box.querySelector<HTMLButtonElement>('#btn-end');
    if (r) r.onclick = () => this.actions.rest();
    if (e) e.onclick = () => this.actions.endTurn();
  }

  /** Painel "Você controla o Monstro" (Reação de Vingança decidida pelo jogador à direita). */
  monsterPanel(html: string | null) {
    const el = $('#monsterctl', this.root);
    if (!html) { el.classList.add('hidden'); el.innerHTML = ''; return el; }
    el.innerHTML = html;
    el.classList.remove('hidden');
    return el;
  }

  /** Atualiza o cronômetro (partida e, na campanha, total). */
  setClock(html: string) { $('#clock', this.root).innerHTML = html; }

  /** Painel genérico (Descanso, posicionamento). */
  panel(id: 'restbox' | 'deploybox', html: string | null): HTMLElement {
    const el = $(`#${id}`, this.root);
    if (!html) { el.classList.add('hidden'); el.innerHTML = ''; return el; }
    el.innerHTML = html;
    el.classList.remove('hidden');
    return el;
  }

  setModeBadge(text: string) { $('.badge-test', this.root).textContent = text; }

  setHint(text: string) { $('#hint', this.root).innerHTML = isTouch ? touchHint(text) : text; }

  // ------------------------------------------------------------------
  // Eventos visuais
  // ------------------------------------------------------------------
  onEvent(e: GameEvent, battleShown = false) {
    const g = this.game;
    switch (e.t) {
      case 'log': this.log(e.text); break;
      case 'attack': break; // rolagem: centerDice (chamado pelo controlador, que espera acabar)
      case 'cemetery': {
        if (!this.cem.includes(e.id)) this.cem.push(e.id);
        this.renderCemetery();
        this.toast(`☠ ${MONSTERS[g.unit(e.id).defId].name} foi para o Cemitério (${e.count}/5)${e.full ? ' — CHEIO!' : ''}`, '#a983d8');
        break;
      }
      case 'spawnStart': this.spawnStart(e.ids); break;
      case 'turn': {
        const gs = g.guild(e.guild);
        this.banner(`Vez ${daTime(e.guild)}`, gs.color, gs.controller === 'ai' ? 'Inteligência Artificial' : this.isMine(e.guild) ? 'Sua vez!' : `${this.nameOf(e.guild) ?? 'Adversário'} está jogando`);
        this.log(`— Rodada ${e.turn}: vez ${daTime(e.guild)} —`, gs.color);
        break;
      }
      case 'mission':
        this.banner(`Missão cumprida!`, GUILDS[e.guild].color, `${guildShort(e.guild)}: ${e.name}${e.first ? ' (+1 moeda de Primeiro Bônus)' : ''}`);
        this.log(`🏆 ${guildShort(e.guild)} cumpriu a Missão "${e.name}"`, GUILDS[e.guild].color);
        break;
      case 'coins': this.toast(`🪙 +${e.amount} ${guildShort(e.guild)} — ${e.reason}`, GUILDS[e.guild].color); playOnce('gold'); break;
      case 'rest': this.banner('Descanso', GUILDS[e.guild].color, 'Cartas restauradas · Heróis ressuscitados'); break;
      case 'card': this.toast(`🃏 Nova carta: ${e.cardName}`, '#e0b43a'); break;
      case 'pickup':
        this.log(`${g.name(g.unit(e.heroId))} pegou: ${TOKEN_INFO[e.token.type].name}`);
        break;
      case 'victory': {
        const gs = g.guild(e.guild);
        this.banner('Vitória garantida!', gs.color, this.isMine(e.guild) ? 'Você cumpriu as Missões — encerre o turno para terminar a partida' : `${guildShort(e.guild)} cumpriu as Missões: a partida acaba no fim do turno`);
        this.log(`🏆 ${guildShort(e.guild)} cumpriu as Missões para vencer!`, gs.color);
        break;
      }
      case 'useToken': this.log(`${g.name(g.unit(e.heroId))} usou: ${TOKEN_INFO[e.token.type].name}`); break;
      case 'skill': play(e.skill === 'furtivo' ? 'skill-wisp' : 'skill-spike'); this.toast(`✨ ${g.name(g.unit(e.id))}: ${e.name}!`, '#9fe8ff'); break;
      case 'door': this.log(`${g.name(g.unit(e.by))} ${e.open ? 'abriu' : 'fechou'} uma porta.`); break;
      case 'spawn': this.log(`${MONSTERS[g.unit(e.id).defId].name} entrou no tabuleiro.`); break;
      case 'reaction': this.log(`${MONSTERS[g.unit(e.monsterId).defId].name}: Reação de ${e.kind === 'alerta' ? 'Alerta' : 'Vingança'}!`); break;
      default: break;
    }
  }

  log(text: string, color?: string) {
    const el = document.createElement('div');
    el.textContent = text;
    if (color) el.style.color = color;
    const log = $('#log', this.root);
    log.prepend(el);
    while (log.children.length > 120) log.lastChild!.remove();
  }

  toast(text: string, color: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.borderColor = color;
    el.textContent = text;
    $('#toasts', this.root).append(el);
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  }

  banner(title: string, color: string, sub = '') {
    const b = $('#banner', this.root);
    b.innerHTML = `<div class="b-title" style="--bc:${color}">${title}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    b.classList.remove('hidden');
    b.classList.remove('anim');
    void b.offsetWidth;
    b.classList.add('anim');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.add('hidden'), 1400 / this.speed);
  }

  /** Rolagem no centro da tela: os dados giram, param um a um e aparece o resultado final. */
  private centerTimers: number[] = [];
  /** Rolagem no centro da tela. Os seus dados só rolam quando você clica em "Rolar";
   *  com Rerrolagem, aparece o resultado original e depois os dados escolhidos giram de novo. */
  centerDice(e: Extract<GameEvent, { t: 'attack' }>, done?: () => void) {
    const g = this.game;
    const box = $('#dicecenter', this.root);
    for (const t of this.centerTimers) clearTimeout(t);
    this.centerTimers = [];
    const token = ++this.centerRun;
    const sp = Math.max(1, this.speed);
    const wait = (ms: number) => new Promise<void>(r => this.centerTimers.push(window.setTimeout(r, ms / sp)));
    const atk = g.unit(e.attackerId);
    const reason = { heroi: 'Ataque', alerta: 'Reação de Alerta', vinganca: 'Reação de Vingança', armadilha: 'Armadilha' }[e.reason];
    const ok = (f: DieFace, s: string) => f === 'crit' || f === s;
    const mineHero = (u: Unit) => u.kind === 'hero' && !!u.guild && this.isMine(u.guild);
    // Reação de Monstro: quem controla os Monstros rola o ataque dele (botões de Rolar e de ✷)
    const mineAtk = mineHero(atk) || (atk.kind === 'monster' && !!e.ctl && this.isMine(e.ctl));
    const totalW = e.targets.reduce((s, t) => s + t.wounds, 0);
    // continuação de uma Rerrolagem decidida neste mesmo painel: NÃO reconstrói (não pisca); os dados escolhidos giram aqui
    const carry = this.carry && this.carry.attackerId === e.attackerId && !box.classList.contains('hidden') && box.querySelector('.cd-box') ? this.carry : null;
    this.carry = null;
    const titleHtml = `<div class="cd-title">${reason} · <b>${g.name(atk)}</b> ${lupa(atk.id)} <small>${e.cardName}</small></div>${atkInfo(e.attackType, e.baseDice ?? e.dice.length)}`;
    if (!carry) {
      box.innerHTML = `<div class="cd-box">
        ${titleHtml}
        <div class="cd-row atk"></div><div class="cd-btn atk"></div>
        <div class="cd-sum atk"></div>
        ${e.targets.map(t => cdDefHtml(g.name(g.unit(t.id)), t.id)).join('')}
        <div class="cd-final"></div></div>`;
    } else {
      const cb = box.querySelector('.cd-box')!;
      cb.querySelectorAll('.cd-title, .cd-atkinfo').forEach(x => x.remove());
      cb.insertAdjacentHTML('afterbegin', titleHtml);
      for (const t of e.targets) this.cdDef(t.id);
    }
    box.classList.remove('hidden', 'fade');
    const alive = () => token === this.centerRun;

    /** Botão "Rolar" (só para os dados de quem joga neste computador). */
    const askClick = (holder: Element, label: string) => new Promise<void>(res => {
      holder.innerHTML = `<button class="primary cd-roll">🎲 ${label}</button>`;
      box.classList.add('interactive');
      const b = holder.querySelector('button') as HTMLButtonElement;
      const go = () => { holder.innerHTML = ''; box.classList.remove('interactive'); window.removeEventListener('keydown', key, true); res(); };
      const key = (ev: KeyboardEvent) => { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); ev.stopImmediatePropagation(); go(); } };
      window.addEventListener('keydown', key, true);
      b.onclick = go;
      b.focus();
    });

    /** Rola uma fileira: gira, para um a um; se houver Rerrolagem, gira de novo os escolhidos. */
    const rollRow = async (row: Element, final: DieFace[], black: boolean, success: string, rr?: RerollInfo, already = false, base?: number, mine = false, holder?: Element | null) => {
      const pool: DieFace[] = black ? ['crit', 'melee', 'ranged', 'blank'] : ['crit', 'shield', 'blank', 'blank'];
      const first = rr && !already ? rr.before : final;
      const instant = !!rr?.asked || already; // já rolado nesta mesma tela (decisão de Rerrolagem)
      const mk = () => { const d = document.createElement('span'); d.className = `cd-die ${black ? 'black' : 'white'} rolling`; d.innerHTML = dieImg('blank', black); row.append(d); return d; };
      const settle = (d: HTMLElement, f: DieFace) => { d.classList.remove('rolling', 'rerolling'); d.innerHTML = dieImg(f, black); d.classList.toggle('hit', ok(f, success)); d.classList.toggle('crit', f === 'crit'); };
      let dice: HTMLElement[];
      if (instant) { dice = first.map(() => mk()); first.forEach((f, i) => settle(dice[i], f)); }
      else dice = await this.rollWaves(row, first, base, black, success, mine, holder ?? null, wait);
      const spin = window.setInterval(() => row.querySelectorAll<HTMLElement>('.cd-die.rolling').forEach(d => { d.innerHTML = dieImg(pool[Math.floor(Math.random() * pool.length)], black); }), 70);
      this.centerTimers.push(spin);
      if (rr && rr.idx.length && !already) {
        await wait(500);
        row.parentElement?.querySelector('.cd-sum')?.classList.add('rr');
        for (const i of rr.idx) { const d = dice[i]; if (d) { d.classList.remove('hit', 'crit'); d.classList.add('rolling', 'rerolling'); } }
        play('dice');
        await wait(650);
        for (const i of rr.idx) { if (dice[i]) settle(dice[i], final[i]); await wait(160); }
        for (let i = rr.before.length; i < final.length; i++) { const d = mk(); await wait(350); settle(d, final[i]); }
      }
      clearInterval(spin);
    };

    (async () => {
      // ataque
      const atkRow = box.querySelector('.cd-row.atk')!;
      if (carry?.kind === 'attack') {
        // os dados escolhidos giram de novo NESTE painel até o resultado novo
        if (carry.idx.length) await this.rerollIn(atkRow, carry.dice, carry.before, carry.idx, e.dice, true, e.attackType, wait, mineAtk, box.querySelector('.cd-btn.atk'));
      } else if (carry?.kind === 'defense' && carry.atkPending) {
        if (carry.atkPending.idx.length) await this.rerollIn(atkRow, carry.atkPending.dice, carry.atkPending.before, carry.atkPending.idx, e.dice, true, e.attackType, wait);
      } else if (!carry) {
        if (!e.dice.length) atkRow.innerHTML = '<span class="muted">sem dados</span>';
        else {
          if (mineAtk && !e.rr?.asked && !e.spread) await askClick(box.querySelector('.cd-btn.atk')!, 'Rolar ataque');
          if (!alive()) return;
          // dano espalhado: mesmos dados do ataque anterior, já rolados
          if (e.spread) await rollRow(atkRow, e.dice, true, e.attackType, undefined, true);
          else await rollRow(atkRow, e.dice, true, e.attackType, e.rr, false, e.baseDice, mineAtk, box.querySelector('.cd-btn.atk'));
        }
      }
      if (!alive()) return;
      box.querySelector('.cd-sum.atk')!.innerHTML = `<b>${e.hits}</b> acerto${e.hits === 1 ? '' : 's'}${e.crits ? ` <span class="crit">(${e.crits}✷)</span>` : ''}${e.rr?.idx.length ? ' <span class="rrtag">↻ rerrolado</span>' : ''}`;
      await wait(150);
      // defesas
      for (let ti = 0; ti < e.targets.length; ti++) {
        const t = e.targets[ti];
        const wrap = this.cdDef(t.id);
        wrap.classList.add('show');
        const row = wrap.querySelector('.cd-row')!;
        if (carry?.kind === 'defense' && carry.heroId === t.id) {
          if (carry.idx.length) await this.rerollIn(row, carry.dice, carry.before, carry.idx, t.defense, false, 'shield', wait, mineHero(g.unit(t.id)), wrap.querySelector('.cd-btn'));
          wrap.querySelector('.cd-sum')!.innerHTML = `<b>${t.blocks}</b> bloqueio${t.blocks === 1 ? '' : 's'}${carry.idx.length ? ' <span class="rrtag">↻ rerrolado</span>' : ''}`;
          if (!alive()) return;
          await wait(150);
          continue;
        }
        if (t.stunnedNoDefense) row.innerHTML = '<span class="muted">Atordoado: sem Defesa</span>';
        else if (!t.defense.length) row.innerHTML = '<span class="muted">sem dados de Defesa</span>';
        else if (e.hits === 0) row.innerHTML = '<span class="muted">nenhum acerto para bloquear</span>';
        else {
          if (mineHero(g.unit(t.id)) && !t.rr?.asked) await askClick(wrap.querySelector('.cd-btn')!, 'Rolar defesa');
          if (!alive()) return;
          await rollRow(row, t.defense, false, 'shield', t.rr, false, undefined, mineHero(g.unit(t.id)), wrap.querySelector('.cd-btn'));
          wrap.querySelector('.cd-sum')!.innerHTML = `<b>${t.blocks}</b> bloqueio${t.blocks === 1 ? '' : 's'}${t.rr?.idx.length ? ' <span class="rrtag">↻ rerrolado</span>' : ''}`;
        }
        if (!alive()) return;
        await wait(150);
      }
      const f = box.querySelector('.cd-final')!;
      f.className = `cd-final show ${totalW ? 'bad' : 'good'}`;
      f.innerHTML = e.targets.length > 1
        ? e.targets.map(t => `${g.name(g.unit(t.id))}: ${t.wounds ? `−${t.wounds}` : 'bloqueou'}`).join(' · ')
        : totalW ? `−${totalW} Ferimento${totalW > 1 ? 's' : ''}!` : 'Bloqueado!';
      await wait(1500);
      if (!alive()) return;
      box.classList.add('fade');
      await wait(400);
      box.classList.add('hidden'); box.classList.remove('fade');
      done?.();
    })();
  }
  private centerRun = 0;
  /** Decisão de Rerrolagem feita no painel do centro: a rolagem seguinte continua nele (sem reconstruir). */
  private carry: {
    heroId: string; kind: 'attack' | 'defense'; attackerId: string;
    dice: HTMLElement[]; before: DieFace[]; idx: number[];
    /** Defesa decidida depois de uma Rerrolagem de ataque (mesmo painel): os dados do ataque ainda vão girar. */
    atkPending?: { dice: HTMLElement[]; before: DieFace[]; idx: number[] };
  } | null = null;
  get hasCarry() { return !!this.carry; }

  /** Bloco de Defesa de um alvo no painel do centro (cria se faltar). */
  private cdDef(id: string): HTMLElement {
    const box = $('#dicecenter', this.root);
    let w = box.querySelector<HTMLElement>(`.cd-def[data-tid="${id}"]`);
    if (!w) {
      box.querySelector('.cd-final')?.insertAdjacentHTML('beforebegin', cdDefHtml(this.game.name(this.game.unit(id)), id));
      w = box.querySelector<HTMLElement>(`.cd-def[data-tid="${id}"]`)!;
    }
    return w;
  }

  /** Rola em ondas: primeiro os dados normais; cada ✷ dá direito a +1 dado, rolado depois (você clica; Monstros e IA rolam sozinhos). */
  private async rollWaves(row: Element, faces: DieFace[], base: number | undefined, black: boolean, success: string, mine: boolean, holder: Element | null, wait: (ms: number) => Promise<void>): Promise<HTMLElement[]> {
    const pool: DieFace[] = black ? ['crit', 'melee', 'ranged', 'blank'] : ['crit', 'shield', 'blank', 'blank'];
    const ok = (f: DieFace) => f === 'crit' || f === success;
    const box = $('#dicecenter', this.root);
    const dice: HTMLElement[] = [];
    const crits = faces.filter(f => f === 'crit').length;
    let wave = Math.max(1, Math.min(faces.length, base ?? faces.length - crits));
    let shown = 0;
    const spin = window.setInterval(() => row.querySelectorAll<HTMLElement>('.cd-die.rolling').forEach(d => { d.innerHTML = dieImg(pool[Math.floor(Math.random() * pool.length)], black); }), 70);
    this.centerTimers.push(spin);
    const rollWave = async (n: number) => {
      const fresh: HTMLElement[] = [];
      for (let i = 0; i < n; i++) { const d = document.createElement('span'); d.className = `cd-die ${black ? 'black' : 'white'} rolling`; d.innerHTML = dieImg('blank', black); row.append(d); fresh.push(d); }
      play('dice');
      await wait(500);
      for (let i = 0; i < n; i++) {
        const f = faces[shown + i]; const d = fresh[i];
        d.classList.remove('rolling'); d.innerHTML = dieImg(f, black); d.classList.toggle('hit', ok(f)); d.classList.toggle('crit', f === 'crit');
        await wait(110);
      }
      dice.push(...fresh);
      shown += n;
    };
    if (faces.length) await rollWave(wave);
    while (shown < faces.length) {
      const c = faces.slice(shown - wave, shown).filter(f => f === 'crit').length;
      const next = Math.min(faces.length - shown, c || faces.length - shown);
      await this.critPrompt(row, holder, next, mine, wait);
      wave = next;
      await rollWave(next);
    }
    clearInterval(spin);
    return dice;
  }

  /** ✷ Crítico: o seu = botão "Rolar +N dado" (você rola); dos outros = aviso "✷ +N" e o dado rola sozinho. */
  private async critPrompt(row: Element, holder: Element | null, next: number, mine: boolean, wait: (ms: number) => Promise<void>) {
    const box = $('#dicecenter', this.root);
    const label = `✷ Crítico! Rolar +${next} dado${next > 1 ? 's' : ''}`;
    if (mine && holder) {
      await new Promise<void>(res => {
        holder.innerHTML = `<button class="primary cd-roll cd-crit">${label}</button>`;
        // mantém o painel clicável se ele já estava (a escolha da Rerrolagem vem logo depois)
        const was = box.classList.contains('interactive');
        box.classList.add('interactive');
        const go = () => { holder.innerHTML = ''; if (!was) box.classList.remove('interactive'); window.removeEventListener('keydown', key, true); res(); };
        const key = (ev: KeyboardEvent) => { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); ev.stopImmediatePropagation(); go(); } };
        window.addEventListener('keydown', key, true);
        (holder.querySelector('button') as HTMLButtonElement).onclick = go;
      });
    } else {
      const tag = document.createElement('span');
      tag.className = 'cd-crittag';
      tag.textContent = `✷ +${next}`;
      row.append(tag);
      await wait(650);
      tag.remove();
    }
  }

  /** Os dados escolhidos giram de novo e param no resultado novo (no mesmo lugar).
   *  Se a Rerrolagem tirar ✷, o dado extra vem depois — o seu com o botão "Rolar +1 dado". */
  private async rerollIn(row: Element, dice: HTMLElement[], before: DieFace[], idx: number[], final: DieFace[], black: boolean, success: string, wait: (ms: number) => Promise<void>, mine = false, holder: Element | null = null) {
    const pool: DieFace[] = black ? ['crit', 'melee', 'ranged', 'blank'] : ['crit', 'shield', 'blank', 'blank'];
    const ok = (f: DieFace) => f === 'crit' || f === success;
    for (const i of idx) { const d = dice[i]; if (d) { d.classList.remove('hit', 'crit'); d.classList.add('rolling', 'rerolling'); } }
    const spin = window.setInterval(() => row.querySelectorAll<HTMLElement>('.cd-die.rolling').forEach(d => { d.innerHTML = dieImg(pool[Math.floor(Math.random() * pool.length)], black); }), 70);
    this.centerTimers.push(spin);
    play('dice');
    await wait(700);
    const settle = (d: HTMLElement, f: DieFace) => { d.classList.remove('rolling'); d.innerHTML = dieImg(f, black); d.classList.toggle('hit', ok(f)); d.classList.toggle('crit', f === 'crit'); };
    for (const i of idx) { if (dice[i]) settle(dice[i], final[i]); await wait(180); }
    // dados extras dos ✷ tirados na Rerrolagem, em ondas
    let shown = before.length;
    let lastCrits = idx.filter(i => final[i] === 'crit').length;
    while (shown < final.length) {
      const next = Math.min(final.length - shown, lastCrits || final.length - shown);
      await this.critPrompt(row, holder, next, mine, wait);
      const fresh: HTMLElement[] = [];
      for (let k = 0; k < next; k++) { const d = document.createElement('span'); d.className = `cd-die ${black ? 'black' : 'white'} rolling`; d.innerHTML = dieImg('blank', black); row.append(d); fresh.push(d); }
      play('dice');
      await wait(500);
      for (let k = 0; k < next; k++) { settle(fresh[k], final[shown + k]); await wait(110); }
      lastCrits = final.slice(shown, shown + next).filter(f => f === 'crit').length;
      dice.push(...fresh);
      shown += next;
    }
    clearInterval(spin);
    window.setTimeout(() => dice.forEach(d => d.classList.remove('rerolling')), 800);
  }

  /** Rerrolagem no painel do centro: rola (com clique), mostra o resultado e deixa escolher os dados para rolar de novo.
   *  Na Defesa, primeiro aparece o ataque de quem atacou. O painel continua aberto e a rolagem segue nele. */
  askDecision(req: { heroId: string; kind: 'attack' | 'defense'; faces: DieFace[]; success: DieFace; rerolls: number; base?: number; round?: number; vs?: { id: string; faces: DieFace[]; hits: number; type: string; base?: number }; card?: { name: string; type: string; dice: number } }): Promise<number[]> {
    const g = this.game;
    const box = $('#dicecenter', this.root);
    for (const t of this.centerTimers) clearTimeout(t);
    this.centerTimers = [];
    ++this.centerRun;
    const sp = Math.max(1, this.speed);
    const wait = (ms: number) => new Promise<void>(r => this.centerTimers.push(window.setTimeout(r, ms / sp)));
    const me = g.unit(req.heroId);
    const black = req.kind === 'attack';
    const ok = (f: DieFace, s: string) => f === 'crit' || f === s;
    const attackerId = req.kind === 'attack' ? me.id : req.vs!.id;
    const attacker = g.unit(attackerId);
    // ainda sobrou Rerrolagem: a próxima rodada continua com os MESMOS dados (só os escolhidos giram)
    const cont = this.carry && this.carry.heroId === req.heroId && this.carry.kind === req.kind && (req.round ?? 1) > 1 && !box.classList.contains('hidden') ? this.carry : null;
    // Defesa logo depois da Rerrolagem do ataque (mesmo ataque): continua no mesmo painel
    const prev = !cont && this.carry && this.carry.kind === 'attack' && this.carry.attackerId === attackerId && !box.classList.contains('hidden') ? this.carry : null;
    this.carry = null;
    if (!prev && !cont) {
      const title = `${req.kind === 'attack' || attacker.kind === 'hero' ? 'Ataque' : 'Reação'} · <b>${g.name(attacker)}</b> ${lupa(attacker.id)}${req.card ? ` <small>${req.card.name}</small>` : ''}`;
      box.innerHTML = `<div class="cd-box">
        <div class="cd-title">${title}</div>${req.card ? atkInfo(req.card.type, req.card.dice) : ''}
        <div class="cd-row atk"></div><div class="cd-btn atk"></div><div class="cd-sum atk"></div>
        ${req.kind === 'defense' ? cdDefHtml(g.name(me), me.id) : ''}
        <div class="cd-final"></div></div>`;
    }
    box.classList.remove('hidden', 'fade');
    const mk = (row: Element, b: boolean) => { const d = document.createElement('span'); d.className = `cd-die ${b ? 'black' : 'white'} rolling`; d.innerHTML = dieImg('blank', b); row.append(d); return d; };
    const pool = (b: boolean): DieFace[] => b ? ['crit', 'melee', 'ranged', 'blank'] : ['crit', 'shield', 'blank', 'blank'];
    const spinRow = (row: Element, b: boolean) => { const iv = window.setInterval(() => row.querySelectorAll<HTMLElement>('.cd-die.rolling').forEach(d => { d.innerHTML = dieImg(pool(b)[Math.floor(Math.random() * 4)], b); }), 70); this.centerTimers.push(iv); return iv; };
    const settle = (d: HTMLElement, f: DieFace, b: boolean, s: string) => { d.classList.remove('rolling'); d.innerHTML = dieImg(f, b); d.classList.toggle('hit', ok(f, s)); d.classList.toggle('crit', f === 'crit'); };
    return new Promise<number[]>(resolve => {
      (async () => {
        let atkPending: { dice: HTMLElement[]; before: DieFace[]; idx: number[] } | undefined;
        // ataque de quem atacou (na Defesa)
        if (req.vs && !cont) {
          const row = box.querySelector('.cd-row.atk')!;
          if (prev) {
            if (prev.idx.length) await this.rerollIn(row, prev.dice, prev.before, prev.idx, req.vs.faces, true, req.vs.type, wait);
          } else {
            await this.rollWaves(row, req.vs.faces, req.vs.base, true, req.vs.type, false, null, wait);
          }
          box.querySelector('.cd-sum.atk')!.innerHTML = `<b>${req.vs.hits}</b> acerto${req.vs.hits === 1 ? '' : 's'}`;
          await wait(250);
        }
        const holder = req.kind === 'attack' ? box.querySelector('.cd-box')! : this.cdDef(me.id);
        holder.classList?.add('show');
        const row = (req.kind === 'attack' ? box.querySelector('.cd-row.atk') : holder.querySelector('.cd-row'))!;
        const btn = (req.kind === 'attack' ? box.querySelector('.cd-btn.atk') : holder.querySelector('.cd-btn'))!;
        const sum = (req.kind === 'attack' ? box.querySelector('.cd-sum.atk') : holder.querySelector('.cd-sum'))!;
        let dice: HTMLElement[];
        if (cont) {
          // rodada seguinte: os dados escolhidos antes giram e param; depois escolhe de novo com o que sobrou
          if (cont.idx.length) await this.rerollIn(row, cont.dice, cont.before, cont.idx, req.faces, black, req.success, wait, true, btn);
          dice = cont.dice;
        } else {
          row.innerHTML = '';
          // minha rolagem: espera o clique
          await new Promise<void>(res => {
            btn.innerHTML = `<button class="primary cd-roll">🎲 Rolar ${black ? 'ataque' : 'defesa'}</button>`;
            box.classList.add('interactive');
            const go = () => { btn.innerHTML = ''; window.removeEventListener('keydown', key, true); res(); };
            const key = (ev: KeyboardEvent) => { if (ev.code === 'Enter' || ev.code === 'Space') { ev.preventDefault(); ev.stopImmediatePropagation(); go(); } };
            window.addEventListener('keydown', key, true);
            (btn.querySelector('button') as HTMLButtonElement).onclick = go;
          });
          dice = await this.rollWaves(row, req.faces, req.base ?? (black ? req.card?.dice : undefined), black, req.success, true, btn, wait);
        }
        box.classList.add('interactive'); // a escolha abaixo precisa de clique
        // escolha dos dados para rerrolar (aqui mesmo)
        const sel = new Set<number>();
        req.faces.forEach((f, i) => { if (!ok(f, req.success) && sel.size < req.rerolls) sel.add(i); });
        const paint = () => {
          dice.forEach((d, i) => d.classList.toggle('pick', sel.has(i)));
          const hits = req.faces.filter(f => ok(f, req.success)).length;
          sum.innerHTML = `<b>${hits}</b> ${black ? 'acerto' : 'bloqueio'}${hits === 1 ? '' : 's'} · ↻ ${(req.round ?? 1) > 1 ? `Ainda tem ${req.rerolls} Rerrolagem` : `Rerrolagem ${req.rerolls}`}: clique nos dados para rolar de novo (${sel.size}/${req.rerolls})${[...sel].some(i => ok(req.faces[i], req.success)) ? `<div class="rr-warn">⚠ Rerrolar um dado que já acertou pode fazer você perder esse ${req.kind === 'attack' ? 'acerto' : 'bloqueio'} — mas pode sair ✷ (crítico)!</div>` : ''}`;
          btn.innerHTML = `<button id="cd-keep">Manter</button><button class="primary" id="cd-rr" ${sel.size ? '' : 'disabled'}>↻ Rerrolar ${sel.size || ''}</button>`;
          (btn.querySelector('#cd-keep') as HTMLElement).onclick = () => finish([]);
          (btn.querySelector('#cd-rr') as HTMLElement).onclick = () => finish([...sel]);
        };
        dice.forEach((d, i) => {
          if (req.faces[i] === 'crit') return;
          d.classList.add('pickable');
          d.onclick = () => { if (sel.has(i)) sel.delete(i); else if (sel.size < req.rerolls) sel.add(i); paint(); };
        });
        const key = (ev: KeyboardEvent) => { if (ev.code === 'Enter') { ev.preventDefault(); ev.stopImmediatePropagation(); finish([...sel]); } };
        window.addEventListener('keydown', key, true);
        const finish = (idx: number[]) => {
          window.removeEventListener('keydown', key, true);
          btn.innerHTML = '';
          box.classList.remove('interactive');
          dice.forEach(d => { d.onclick = null; d.classList.remove('pickable', 'pick'); });
          // os escolhidos já começam a girar aqui; o resultado novo para neste mesmo painel
          for (const i of idx) { dice[i].classList.remove('hit', 'crit'); dice[i].classList.add('rolling', 'rerolling'); }
          if (idx.length) { spinRow(row, black); play('dice'); sum.innerHTML = '↻ Rerrolando…'; }
          this.carry = { heroId: req.heroId, kind: req.kind, attackerId, dice, before: req.faces.slice(), idx, atkPending };
          resolve(idx);
        };
        paint();
      })();
    });
  }

  private showDice(e: Extract<GameEvent, { t: 'attack' }>) {
    const g = this.game;
    const atk = g.unit(e.attackerId);
    const reason = { heroi: '', alerta: 'Reação de Alerta', vinganca: 'Reação de Vingança', armadilha: 'Armadilha' }[e.reason];
    const succ = (f: DieFace, type: string) => f === 'crit' || f === type;
    const dice = (faces: DieFace[], type: string, cls: string) => faces.map((f, i) =>
      `<span class="die ${cls} ${succ(f, type) ? 'hit' : ''} ${f === 'crit' ? 'crit' : ''}" style="animation-delay:${i * 60}ms">${dieImg(f, cls === 'black')}</span>`).join('') || '<span class="muted">sem dados</span>';
    const el = $('#dice', this.root);
    el.innerHTML = `
      ${reason ? `<div class="d-reason">${reason}</div>` : ''}
      <div class="d-title"><b>${g.name(atk)}</b> → ${e.cardName} <small>${e.attackType === 'melee' ? '⚔ Próximo' : '➶ Distância'}</small></div>
      ${e.notes.length ? `<div class="d-notes">${e.notes.join(' · ')}</div>` : ''}
      <div class="d-row"><span class="d-lbl">Ataque</span>${dice(e.dice, e.attackType, 'black')}<span class="d-res">${e.hits} acerto${e.hits === 1 ? '' : 's'}</span></div>
      ${e.targets.map(t => `
        <div class="d-row"><span class="d-lbl">${g.name(g.unit(t.id))}</span>${t.stunnedNoDefense ? '<span class="muted">Atordoado: sem Defesa</span>' : dice(t.defense, 'shield', 'white')}<span class="d-res">${t.blocks} bloq.</span></div>
        <div class="d-out ${t.wounds ? 'bad' : 'good'}">${t.wounds ? `−${t.wounds} Ferimento${t.wounds > 1 ? 's' : ''}` : 'Nenhum Ferimento!'}</div>`).join('')}
    `;
    el.classList.remove('hidden');
    el.classList.remove('anim');
    void el.offsetWidth;
    el.classList.add('anim');
    clearTimeout(this.diceTimer);
    this.diceTimer = window.setTimeout(() => el.classList.add('hidden'), 2300 / this.speed);
  }

  tooltip(html: string | null, x = 0, y = 0) {
    const t = $('#tooltip', this.root);
    if (!html) { t.classList.add('hidden'); return; }
    t.innerHTML = html;
    t.style.left = `${x + 16}px`;
    t.style.top = `${y + 16}px`;
    t.classList.remove('hidden');
  }
}

function loadFlag(k: string): boolean { try { return localStorage.getItem(k) === '1'; } catch { return false; } }
function saveFlag(k: string, v: boolean) { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* sem armazenamento */ } }

/** Alterna a câmera entre visão livre e visão dos jogadores. */
export function toggleView() { const st = getSettings(); saveSettings({ ...st, view: st.view === 'players' ? 'free' : 'players' }); }

/** Classe do valor no painel: verde se melhorado, vermelho se piorado em relação à carta. */
function stat(now: number, base: number) { return now > base ? 'up' : now < base ? 'down' : ''; }

const CONSUMABLE = ['cura', 'revigorante', 'turno'];
/** Consumíveis (poções) primeiro, depois Baús e Missões. */
function sortTokens(ts: Token[]): Token[] {
  const rank = (t: Token) => (CONSUMABLE.includes(t.type) ? 0 : t.type === 'bau' ? 1 : 2);
  return ts.slice().sort((a, b) => rank(a) - rank(b));
}
function tokenName(t: Token): string {
  return t.type === 'bau' ? `Baú de Tesouro (${t.value ?? 1})` : t.type === 'missao' ? `Marcador de Missão ${t.color ?? ''}` : TOKEN_INFO[t.type].name;
}
