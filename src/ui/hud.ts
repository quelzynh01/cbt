import { CARDS, GUILDS, GUILD_NAMES, HEROES, MONSTERS, TOKEN_INFO, setGuildNames, teamName } from '../engine/data';
import type { Game } from '../engine/game';
import type { CardInst, DieFace, GameEvent, GuildId, Unit } from '../engine/types';
import { drawFace, getArtVersion } from '../render/chibi';
import { CURSES } from '../engine/cards';
import { ITEM_LEVEL, curseCard, heroCard, itemCard, itemColor, monsterCard, paintCardArt } from './cardview';
import { getSettings, onSettings, saveSettings } from './settings';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export interface HudActions {
  activate(heroId: string): void;
  selectCard(uid: string): void;
  useToken(tokenId: string): void;
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
          <div class="panel-h" id="missiontoggle" title="Minimizar / mostrar as Missões">Missões <small id="towin"></small><span class="mtoggle"></span></div><div id="missionlist"></div>
        </div>
        <div id="logbox" class="panel collapsed"><div class="panel-h" id="logtoggle">Registro <small>▲</small></div><div id="log"></div></div>
      </div>
      <div id="spawnbox" class="panel hidden"></div>
      <div id="monsterctl" class="panel hidden"></div>
      <div id="timeline"></div>
      <div id="cardview" class="hidden"></div>
      <div id="dice" class="hidden"></div>
      <div id="banner" class="hidden"></div>
      <div id="toasts"></div>
      <div id="tooltip" class="hidden"></div>
      <div id="hint"></div>
    `;
    $('#logtoggle', root).onclick = () => $('#logbox', root).classList.toggle('collapsed');
    $('#missiontoggle', root).onclick = () => saveFlag('cbt.missionsMin', $('#missions', root).classList.toggle('collapsed'));
    $('#scoretoggle', root).onclick = () => saveFlag('cbt.scoreOpen', !$('#scorebox', root).classList.toggle('collapsed'));
    $('#cardview', root).onclick = e => { if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.cv-x')) this.closeCard(); };
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && this.cardOpen) { e.stopImmediatePropagation(); this.closeCard(); } }, true);
    $('#menubtn', root).onclick = () => this.actions?.menu();
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
    this.renderTimeline();
    this.renderCemetery();
    this.renderHeroBox();
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
          <span title="Moedas">🪙 ${gs.coins}</span><span title="Monstros mortos">💀 ${gs.monsterKills}</span><span title="Missões cumpridas">🏆 ${gs.missions.length}/${g.s.missionsToWin}</span></div>
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

  closeCard() { this.cardOpen = null; $('#cardview', this.root).classList.add('hidden'); }

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

  spawnRoll(e: Extract<GameEvent, { t: 'spawnRoll' }>, done: () => void) {
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
    dice.innerHTML = '<span class="die black">?</span><span class="die black">?</span>';
    const faces: DieFace[] = ['crit', 'melee', 'ranged', 'blank'];
    const spin = window.setInterval(() => dice.querySelectorAll('.die').forEach(d => { d.textContent = FACE_ICON[faces[Math.floor(Math.random() * 4)]]; }), 70);
    window.setTimeout(() => {
      clearInterval(spin);
      dice.innerHTML = e.faces.map(f => `<span class="die black hit">${FACE_ICON[f]}</span>`).join('');
      res.className = `sp-res ${e.cell ? 'good' : 'bad'}`;
      res.textContent = e.cell ? `${e.reason} (${e.cell.c},${e.cell.r})` : e.reason;
      row.classList.remove('active');
      window.setTimeout(finish, 450 / this.speed);
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
        <button id="btn-end" class="primary" ${human ? '' : 'disabled'} title="Encerrar o turno (Espaço)">Encerrar Turno ⏎</button>
      </div>`;
    if (!id) {
      box.innerHTML = `<div class="empty">${g.s.deploying?.length ? 'Posicionamento: coloque seus Heróis na Área Inicial.' : human ? 'Clique em um dos seus Heróis (anel colorido) para <b>Ativá-lo</b>,<br/>ou <b>Descanse</b> a Guilda.' : 'Aguardando o adversário…'}</div>${actions}`;
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
    while (cards.length < 4) cards.push(null);
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
      <div class="stats">
        <span title="Vida atual (carta: ${hd.hp})" class="${stat(u.alive ? max - u.wounds : 0, hd.hp)}">❤ ${u.alive ? max - u.wounds : 0}/${max}</span>
        ${g.rerollsOf(u) ? `<span title="Rerrolagem" class="up">↻ ${g.rerollsOf(u)}</span>` : ''}
        <span title="Dados de Defesa (inclui bônus)" class="${stat(g.defenseDice(u), hd.defense)}">⛨ ${g.defenseDice(u)}</span>
        <span title="Mortes neste cenário">☠ ${u.deaths}</span>
        ${isActive ? (g.freeMode ? '<span class="mp" title="Modo Livre">👣 ∞</span>' : `<span class="mp" title="Pontos de Movimento">👣 ${[0, 1, 2].map(i => `<i class="${i < act!.mp && !act!.moveLocked ? 'on' : ''}"></i>`).join('')}</span>`) : ''}
        ${isActive ? `<span title="Ataque">${act!.attacked ? '⚔ usado' : '⚔ disponível'}</span>` : ''}
      </div>
      <div class="ability ${u.curse === 'amnesia' ? 'off' : ''}"><b>${hd.abilityName}</b> — ${hd.abilityText}</div>
      ${u.curse ? `<div class="tag dead" title="${CURSES[u.curse]?.text ?? ''}">☠ Maldição: ${CURSES[u.curse]?.name} — ${CURSES[u.curse]?.text}</div>` : ''}
      ${g.rerollsOf(u) ? `<div class="tag rr">↻ Rerrolagem ${g.rerollsOf(u)} ${getSettings().reroll === 'auto' ? '(automática nos dados que falharem)' : '(você escolhe os dados após cada rolagem)'}</div>` : ''}
      ${u.stunned ? '<div class="tag stun">✷ Atordoado — não rola Defesa até Descansar</div>' : ''}
      ${!u.alive ? '<div class="tag dead">☠ Morto — ressuscita quando a Guilda Descansar</div>' : ''}
      <div class="cards">${cards.map(c => this.cardHtml(c, u, usableIds)).join('')}</div>
      <div class="tokens">${u.tokens.length ? u.tokens.map(t => `
        <div class="token" title="${TOKEN_INFO[t.type].text}"><span>${TOKEN_INFO[t.type].name}${t.type === 'bau' ? ` (${t.value})` : ''}</span>
        ${isActive && mine && t.type !== 'bau' ? `<button data-token="${t.id}">Usar</button>` : ''}</div>`).join('') : '<span class="muted">Sem marcadores de Exploração</span>'}</div>
      ${actions}`;
    if (this.inspected) $('#hb-close', box).onclick = () => this.actions.inspect(null);
    $('#hb-card', box).onclick = () => this.showCard(u.id);
    box.querySelectorAll<HTMLElement>('[data-card]').forEach(el => {
      el.onclick = () => { if (mine && isActive && usableIds.has(el.dataset.card!)) this.actions.selectCard(el.dataset.card!); };
    });
    box.querySelectorAll<HTMLElement>('[data-token]').forEach(el => { el.onclick = () => this.actions.useToken(el.dataset.token!); });
    this.bindActions(box);
  }

  private cardHtml(c: CardInst | null, u: Unit, usable: Set<string>) {
    if (!c) return `<div class="card empty-slot"><span>vazio</span></div>`;
    const d = CARDS[c.defId];
    const maya = HEROES[u.defId].ability === 'dominio_magia' && d.magic;
    const sel = this.selectedCard === c.uid && usable.has(c.uid);
    const bonus = d.kind === 'attack' ? this.game.attackBonus(u).n : 0;
    return `<div class="card k-${d.kind} ${c.exhausted ? 'exhausted' : ''} ${sel ? 'selected' : ''} ${usable.has(c.uid) ? 'usable' : ''}" data-card="${c.uid}" style="--lv:${itemColor(c.defId)}" title="${ITEM_LEVEL[d.level]?.name ?? ''}">
      <div class="cname">${d.name}</div>
      ${d.kind === 'attack' ? `<div class="cdice">${d.attackType === 'melee' ? '⚔' : '➶'} <b class="${bonus > 0 ? 'up' : ''}" title="${bonus ? `${d.dice} da carta + ${bonus} de bônus` : ''}">${d.dice + bonus}</b><small>${d.attackType === 'melee' ? 'Próximo' : 'Distância'}</small></div>`
        : `<div class="cdice"><small>${d.kind === 'boost' ? '✚ Ampliação' : '◆ Permanente'}</small></div>`}
      <div class="cgroup">${d.group}${d.defBonus ? ` · ⛨+${d.defBonus}` : ''}${d.hpBonus ? ` · ❤+${d.hpBonus}` : ''}${d.rerolls ? ` · ↻+${d.rerolls}` : ''}</div>
      ${d.text ? `<div class="ctext">${d.text}</div>` : ''}
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

  setHint(text: string) { $('#hint', this.root).innerHTML = text; }

  // ------------------------------------------------------------------
  // Eventos visuais
  // ------------------------------------------------------------------
  onEvent(e: GameEvent, battleShown = false) {
    const g = this.game;
    switch (e.t) {
      case 'log': this.log(e.text); break;
      case 'attack': if (!battleShown) this.showDice(e); break;
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
      case 'coins': this.toast(`🪙 +${e.amount} ${guildShort(e.guild)} — ${e.reason}`, GUILDS[e.guild].color); break;
      case 'rest': this.banner('Descanso', GUILDS[e.guild].color, 'Cartas restauradas · Heróis ressuscitados'); break;
      case 'card': this.toast(`🃏 Nova carta: ${e.cardName}`, '#e0b43a'); break;
      case 'pickup': this.log(`${g.name(g.unit(e.heroId))} pegou: ${TOKEN_INFO[e.token.type].name}`); break;
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

  private showDice(e: Extract<GameEvent, { t: 'attack' }>) {
    const g = this.game;
    const atk = g.unit(e.attackerId);
    const reason = { heroi: '', alerta: 'Reação de Alerta', vinganca: 'Reação de Vingança', armadilha: 'Armadilha' }[e.reason];
    const succ = (f: DieFace, type: string) => f === 'crit' || f === type;
    const dice = (faces: DieFace[], type: string, cls: string) => faces.map((f, i) =>
      `<span class="die ${cls} ${succ(f, type) ? 'hit' : ''} ${f === 'crit' ? 'crit' : ''}" style="animation-delay:${i * 60}ms">${FACE_ICON[f]}</span>`).join('') || '<span class="muted">sem dados</span>';
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
