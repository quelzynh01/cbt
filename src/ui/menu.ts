import type { MapDef } from '../engine/board';
import { key } from '../engine/board';
import { ALL_HEROES, CARDS, HEROES, MONSTERS, TEST_HUMAN_HEROES, distributeStartingGear } from '../engine/data';
import { CAMPAIGN, MAPS, getMap, loadMapId, saveMapId } from '../engine/maps';
import { drawFace } from '../render/chibi';
import { MAX_SLOTS, TEST_GUILDS, type TestConfig, loadTestConfig, normalizeTestConfig, saveTestConfig } from './testConfig';
import { GUILDS } from '../engine/data';
import { ITEM_LEVEL, MONSTER_LEVEL, curseCard, heroCard, itemCard, monsterCard, paintCardArt } from './cardview';
import { CARDS as ALL_CARDS, CURSES } from '../engine/cards';
import { TITLES, TITLE_TEXT } from '../engine/titles';
import { getSettings, saveSettings } from './settings';
import { tokenUrl } from '../render/tokens';
import { EXPLORATION_BAG, TOKEN_INFO } from '../engine/data';

type Tab = 'herois' | 'monstros' | 'itens' | 'marcadores' | 'mapas' | 'regras';
const TABS: [Tab, string][] = [['herois', '👥 Heróis'], ['monstros', '👹 Monstros'], ['itens', '🃏 Itens'], ['marcadores', '🪙 Marcadores'], ['mapas', '🗺️ Mapas'], ['regras', '📖 Regras']];

// Tela inicial: galeria de Personagens (status, habilidade, escolha da Guilda) e de Mapas.

const STORE = 'cbt.guild';

export function loadGuild(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (Array.isArray(v) && v.length === 3 && v.every(x => HEROES[x])) return v;
  } catch { /* sem armazenamento */ }
  return TEST_HUMAN_HEROES.slice();
}

function saveGuild(g: string[]) {
  try { localStorage.setItem(STORE, JSON.stringify(g)); } catch { /* ignora */ }
}

export class MenuPages {
  private page: HTMLElement;
  private home: HTMLElement;
  guild = loadGuild();
  onGuildChange: () => void = () => {};

  constructor(menu: HTMLElement) {
    this.home = menu.querySelector('.menu-box') as HTMLElement;
    this.page = document.createElement('div');
    this.page.className = 'menu-page hidden';
    menu.append(this.page);
  }

  guildLabel() { return this.guild.map(h => HEROES[h].name).join(' · '); }

  close() {
    this.page.classList.add('hidden');
    this.home.classList.remove('hidden');
  }

  private back: (() => void) | null = null;

  private tab: Tab | null = null;
  /** Define para onde o botão Voltar leva (usado por cima da partida). */
  setBack(fn: () => void) { this.back = fn; }
  /** Biblioteca aberta de dentro da partida: não muda a Guilda nem o mapa. */
  private readOnly = false;
  /** Galeria aberta para escolher os Heróis da sala online. */
  private picking = false;

  private open(title: string, body: string) {
    this.home.classList.add('hidden');
    this.page.classList.remove('hidden');
    const tabs = this.tab ? `<div class="lib-tabs">${TABS.map(([t, n]) => `<button class="${t === this.tab ? 'on' : ''}" data-tab="${t}">${n}</button>`).join('')}</div>` : '';
    this.page.innerHTML = `<div class="mp-head"><button class="mp-back">← Voltar</button><h2>${title}</h2>${tabs}</div><div class="mp-body">${body}</div>`;
    this.page.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => { b.onclick = () => this.showLibrary(b.dataset.tab as Tab); });
    (this.page.querySelector('.mp-back') as HTMLElement).onclick = () => {
      const b = this.back;
      this.back = null;
      this.tab = null;
      this.readOnly = false;
      this.picking = false;
      this.page.classList.add('hidden');
      if (b) b(); else this.close();
    };
    this.page.scrollTop = 0;
  }

  // ------------------------------------------------------------------
  /** `onBack`: para onde voltar (ex.: sala online). */
  /** Biblioteca: Heróis, Monstros, Itens, Mapas e Regras. */
  showLibrary(tab: Tab = 'herois', onBack?: () => void, readOnly?: boolean) {
    if (onBack) this.back = onBack;
    if (readOnly !== undefined) this.readOnly = readOnly;
    this.tab = tab;
    if (tab === 'herois') this.showHeroes();
    else if (tab === 'monstros') this.showMonsters();
    else if (tab === 'itens') this.showItems();
    else if (tab === 'marcadores') this.showTokens();
    else if (tab === 'mapas') this.showMaps();
    else this.showRules();
  }

  /** Galeria de Heróis. `onBack` (sala online): escolher os 3 Heróis da sua Guilda. */
  showHeroes(onBack?: () => void) {
    if (onBack) { this.back = onBack; this.tab = null; this.picking = true; }
    else if (this.tab) this.picking = false;
    const cards = ALL_HEROES.map(id => {
      const idx = this.guild.indexOf(id);
      const on = this.picking && idx >= 0;
      return heroCard(id, on ? 'picked' : '', `data-hero="${id}"`, '', on ? `${idx + 1}` : '');
    }).join('');
    this.open(this.tab ? 'Biblioteca' : 'Personagens', `
      ${!this.picking ? '' : `<div class="mp-guild">
        <div><b>Sua Guilda</b> (sala online) — clique nos cartões para escolher 3 Heróis.</div>
        <div class="mp-slots">${[0, 1, 2].map(i => `<span class="slot">${i + 1}. ${this.guild[i] ? HEROES[this.guild[i]].name : '—'}</span>`).join('')}</div>
      </div>`}
      <div class="hgrid cards3">${cards}</div>`);
    paintCardArt(this.page);
    this.page.querySelectorAll<HTMLElement>('[data-hero]').forEach(el => {
      if (this.picking) el.onclick = () => this.toggle(el.dataset.hero!);
    });
  }

  private toggle(id: string) {
    const i = this.guild.indexOf(id);
    if (i >= 0) {
      if (this.guild.length <= 1) return;
      this.guild.splice(i, 1);
    } else {
      if (this.guild.length >= 3) this.guild.pop();
      this.guild.push(id);
    }
    if (this.guild.length === 3) saveGuild(this.guild);
    this.onGuildChange();
    const y = this.page.scrollTop;
    this.showHeroes();
    this.page.scrollTop = y;
  }

  // ------------------------------------------------------------------
  /** Configuração do Modo Teste: mapa, times, seus Heróis e itens. */
  private test: TestConfig | null = null;
  showTestSetup(onStart: (c: TestConfig) => void) {
    const c = (this.test ??= loadTestConfig());
    this.tab = null;
    const y = this.page.classList.contains('hidden') ? 0 : this.page.scrollTop;
    const m = getMap(c.mapId);
    const humans = c.teams.filter(t => t.controller === 'human').length;
    const lvColor = (lv: string) => ITEM_LEVEL[lv]?.color ?? '#888';
    const addOptions = ['I', '1', '2', '3', '4', '5', 'R'].map(lv => `<optgroup label="${ITEM_LEVEL[lv].name}">${Object.values(ALL_CARDS).filter(x => x.level === lv)
      .map(x => `<option value="${x.id}" style="color:${lvColor(lv)}">${x.name} (${x.kind === 'attack' ? `${x.dice} dados` : x.kind === 'boost' ? 'Ampliação' : 'Permanente'})</option>`).join('')}</optgroup>`).join('');
    this.open('Modo Teste', `<div class="ts">
      <section class="ts-sec ts-mapsec"><h3>1. Mapa</h3>
        <select id="ts-map">${Object.values(MAPS).map(x => `<option value="${x.id}" ${x.id === c.mapId ? 'selected' : ''}>${x.name} — ${x.circle}</option>`).join('')}</select>
        <canvas id="ts-mini" width="260" height="260"></canvas>
        <small>Monstros Nível ${m.level ?? '1'} · ${m.startAreas.length} Áreas Iniciais</small></section>
      <section class="ts-sec"><h3>2. Times</h3>
        <div class="ts-count">${[2, 3, 4].map(n => `<button data-n="${n}" class="${c.teams.length === n ? 'primary' : ''}">${n} times</button>`).join('')}</div>
        <div class="ts-teams">${c.teams.map((t, i) => `<div class="ts-team" style="--gc:${GUILDS[t.guild].color}">
          <span class="dot" style="background:${GUILDS[t.guild].color}"></span><b>Time ${i + 1}</b>
          <input class="ts-name" data-tn="${i}" maxlength="20" placeholder="${GUILDS[t.guild].name.split(' (')[0].replace('Guilda ', '')} (nome opcional)" value="${(t.name ?? '').replace(/"/g, '&quot;')}" title="${i === 0 ? 'Seus Heróis' : 'Heróis sorteados'} — deixe vazio para usar a cor"/>
          <select data-ctl="${i}"><option value="human" ${t.controller === 'human' ? 'selected' : ''}>👤 Você</option><option value="ai" ${t.controller === 'ai' ? 'selected' : ''}>🤖 IA</option></select></div>`).join('')}</div>
        <label class="ts-diff">Dificuldade da IA <select id="ts-ai"><option value="normal" ${getSettings().ai === 'normal' ? 'selected' : ''}>Normal</option><option value="hard" ${getSettings().ai === 'hard' ? 'selected' : ''}>Difícil</option></select></label>
        <p class="muted">${humans === 0 ? 'Todos os times são IA: você assiste à partida.' : humans > 1 ? 'Vários times "Você": jogam neste computador, revezando.' : 'Times "Você" são controlados por você; os outros pela IA.'} Nenhum Herói se repete entre os times.</p></section>
      <section class="ts-sec ts-wide"><h3>3. Seus Heróis <small>(Time 1 — escolha 3)</small></h3>
        <div class="ts-heroes">${ALL_HEROES.map(h => { const i = c.heroes.indexOf(h); return `<button class="ts-hero ${i >= 0 ? 'on' : ''}" data-th="${h}">${i >= 0 ? `<span class="pick-badge">${i + 1}</span>` : ''}<canvas width="72" height="72" data-face="${h}"></canvas><b>${HEROES[h].name}</b><small>${HEROES[h].title}</small></button>`; }).join('')}</div></section>
      <section class="ts-sec ts-wide"><h3>4. Itens <small>(até ${MAX_SLOTS} cartas por Herói)</small></h3>
        <div class="ts-btnrow"><button id="ts-gear">Equipamento inicial padrão</button><button id="ts-clear">Remover todas as cartas</button></div>
        <div class="ts-invs">${c.heroes.map(h => `<div class="ts-inv"><div class="ts-inv-h"><b>${HEROES[h].name}</b> <small>${(c.cards[h] ?? []).length}/${MAX_SLOTS}</small></div>
          <div class="ts-cards">${(c.cards[h] ?? []).map((id, i) => `<div class="ts-card">${itemCard(id)}<button class="ts-x" data-rm="${h}|${i}" title="Remover">✕</button></div>`).join('') || '<i class="muted">Sem cartas</i>'}</div>
          ${(c.cards[h] ?? []).length < MAX_SLOTS ? `<select data-add="${h}"><option value="">+ Adicionar carta…</option>${addOptions}</select>` : ''}</div>`).join('')}</div></section>
      <div class="ts-go"><button class="primary" id="ts-start">▶ Começar teste</button></div>
    </div>`);
    this.page.scrollTop = y;
    drawMinimap(this.page.querySelector('#ts-mini') as HTMLCanvasElement, m);
    this.page.querySelectorAll<HTMLCanvasElement>('canvas[data-face]').forEach(cv => drawFace(cv, cv.dataset.face!, '#3a5a8a'));
    const save = () => { this.test = normalizeTestConfig(c); saveTestConfig(this.test); saveMapId(this.test.mapId); this.onMapChange(); this.showTestSetup(onStart); };
    (this.page.querySelector('#ts-ai') as HTMLSelectElement).onchange = e => saveSettings({ ...getSettings(), ai: (e.target as HTMLSelectElement).value as 'normal' | 'hard' });
    (this.page.querySelector('#ts-map') as HTMLSelectElement).onchange = e => { c.mapId = (e.target as HTMLSelectElement).value; save(); };
    this.page.querySelectorAll<HTMLElement>('[data-n]').forEach(b => { b.onclick = () => {
      const n = Number(b.dataset.n);
      c.teams = TEST_GUILDS.slice(0, n).map((g, i) => c.teams[i] ?? { guild: g, controller: 'ai' });
      save();
    }; });
    this.page.querySelectorAll<HTMLInputElement>('[data-tn]').forEach(inp => { inp.onchange = () => { c.teams[Number(inp.dataset.tn)].name = inp.value; save(); }; });
    this.page.querySelectorAll<HTMLSelectElement>('[data-ctl]').forEach(s => { s.onchange = () => { c.teams[Number(s.dataset.ctl)].controller = s.value as 'human' | 'ai'; save(); }; });
    this.page.querySelectorAll<HTMLElement>('[data-th]').forEach(b => { b.onclick = () => {
      const h = b.dataset.th!;
      const i = c.heroes.indexOf(h);
      if (i >= 0) { if (c.heroes.length > 1) { c.heroes.splice(i, 1); delete c.cards[h]; } }
      else {
        if (c.heroes.length >= 3) { const out = c.heroes.pop()!; delete c.cards[out]; }
        c.heroes.push(h);
        c.cards[h] = distributeStartingGear([...c.heroes])[h] ?? [];
      }
      this.test = c;
      if (c.heroes.length === 3) save(); else this.showTestSetup(onStart);
    }; });
    (this.page.querySelector('#ts-gear') as HTMLElement).onclick = () => { c.cards = distributeStartingGear(c.heroes); save(); };
    (this.page.querySelector('#ts-clear') as HTMLElement).onclick = () => { c.cards = Object.fromEntries(c.heroes.map(h => [h, []])); save(); };
    this.page.querySelectorAll<HTMLElement>('[data-rm]').forEach(b => { b.onclick = () => { const [h, i] = b.dataset.rm!.split('|'); c.cards[h].splice(Number(i), 1); save(); }; });
    this.page.querySelectorAll<HTMLSelectElement>('[data-add]').forEach(s => { s.onchange = () => { if (s.value) { (c.cards[s.dataset.add!] ??= []).push(s.value); save(); } }; });
    const start = this.page.querySelector('#ts-start') as HTMLButtonElement;
    start.disabled = c.heroes.length !== 3;
    if (c.heroes.length !== 3) start.textContent = 'Escolha 3 Heróis';
    start.onclick = () => { const cfg = normalizeTestConfig(c); saveTestConfig(cfg); onStart(cfg); };
  }

  /** Texto curto do Modo Teste no menu inicial. */
  testLabel() {
    const c = this.test ?? loadTestConfig();
    return `${getMap(c.mapId).name} · ${c.teams.length} times`;
  }

  // ------------------------------------------------------------------
  /** Chamado quando o jogador escolhe outro mapa (atualiza o menu). */
  onMapChange: () => void = () => {};

  // ------------------------------------------------------------------
  private monLevel = '';
  showMonsters() {
    const bases = ['goblin', 'orc', 'capitao_orc', 'feral_martelador', 'feral_lanceiro', 'irma_dor', 'irma_prazer', 'troll', 'minotauro', 'lorde_presas'];
    const lv = this.monLevel;
    const cards = bases.map(b => MONSTERS[b + lv]).filter(Boolean).map(m => monsterCard(m.id)).join('');
    const lvBtn = (v: string, n: string) => `<button class="${lv === v ? 'primary' : ''}" data-lv="${v}" style="border-color:${MONSTER_LEVEL[n]}"><span class="lvdot" style="background:${MONSTER_LEVEL[n]}"></span>Nível ${n}</button>`;
    this.open('Biblioteca', `<div class="lib-filter">${lvBtn('', '1')}${lvBtn('2', '2-3')}${lvBtn('4', '4-5')}${lvBtn('6', '6')}</div><div class="hgrid cards-m">${cards}</div>
      <p class="muted">Lacaios voltam pelo Cemitério (Entrada de Monstros). Vilões: todas as Guildas que tentarem feri-los ganham a recompensa.</p>`);
    paintCardArt(this.page);
    this.page.querySelectorAll<HTMLElement>('[data-lv]').forEach(b => { b.onclick = () => { this.monLevel = b.dataset.lv!; this.showMonsters(); }; });
  }

  private itemLevel = 'I';
  showItems() {
    const lv = this.itemLevel;
    const list = Object.values(ALL_CARDS).filter(c => c.level === lv);
    const body = lv === 'M'
      ? `<div class="cp-cards">${Object.keys(CURSES).map(id => curseCard(id)).join('')}</div>
         <h3 class="mp-sub">Títulos</h3><div class="mapinfo">${Object.keys(TITLES).map(t => `<div><b>🏅 ${TITLES[t]}</b> — ${TITLE_TEXT[t]}</div>`).join('')}</div>`
      : `<div class="cp-cards">${list.map(c => itemCard(c.id, '', '', true)).join('')}</div>`;
    const b = (v: string, n: string) => `<button class="${lv === v ? 'primary' : ''}" data-il="${v}">${ITEM_LEVEL[v] ? `<span class="lvdot" style="background:${ITEM_LEVEL[v].color}"></span>` : ''}${n}</button>`;
    this.open('Biblioteca', `<div class="lib-filter">${b('I', 'Iniciais')}${b('1', 'Nível 1')}${b('2', 'Nível 2')}${b('3', 'Nível 3')}${b('4', 'Nível 4')}${b('5', 'Nível 5')}${b('R', 'Recompensas')}${b('M', 'Maldições e Títulos')}</div>${body}`);
    this.page.querySelectorAll<HTMLElement>('[data-il]').forEach(x => { x.onclick = () => { this.itemLevel = x.dataset.il!; this.showItems(); }; });
  }

  showTokens() {
    const qty = (type: string, value?: number) => EXPLORATION_BAG.filter(t => t.type === type && (value === undefined || t.value === value)).length;
    const tok = (img: string, name: string, text: string, extra = '') => `<div class="tk-card"><img src="${tokenUrl(img)}"/><b>${name}</b>${extra ? `<small>${extra}</small>` : ''}<p>${text}</p></div>`;
    this.open('Biblioteca', `
      <h3 class="mp-sub">Marcadores de Exploração</h3>
      <p class="muted">Ficam virados para baixo no mapa. O Herói pega automaticamente ao entrar num Espaço sem Inimigos — aí o marcador é revelado.
        Por partida são sorteados ${EXPLORATION_BAG.length - 2} dos ${EXPLORATION_BAG.length} do saco.</p>
      <div class="tk-grid">
        ${tok('fundo', 'Verso', 'É assim que todos aparecem no tabuleiro até alguém pegar.')}
        ${tok('cura', TOKEN_INFO.cura.name, TOKEN_INFO.cura.text, `${qty('cura')} no saco`)}
        ${tok('revigorante', TOKEN_INFO.revigorante.name, TOKEN_INFO.revigorante.text, `${qty('revigorante')} no saco`)}
        ${tok('turno', TOKEN_INFO.turno.name, TOKEN_INFO.turno.text, `${qty('turno')} no saco`)}
        ${tok('bau1', 'Baú de Tesouro (1)', TOKEN_INFO.bau.text, `${qty('bau', 1)} no saco · vale 1 moeda`)}
        ${tok('bau2', 'Baú de Tesouro (2)', TOKEN_INFO.bau.text, `${qty('bau', 2)} no saco · vale 2 moedas`)}
        ${tok('bau3', 'Baú de Tesouro (3)', TOKEN_INFO.bau.text, `${qty('bau', 3)} no saco · vale 3 moedas`)}
        ${tok('armadilha', TOKEN_INFO.armadilha.name, TOKEN_INFO.armadilha.text, `${qty('armadilha')} no saco`)}
      </div>
      <h3 class="mp-sub">Marcadores de Missão</h3>
      <p class="muted">Ficam à vista. Cada cenário diz o que fazer com eles (recuperar, escoltar, pisar…) — veja em Mapas.</p>
      <div class="tk-grid">${['azul', 'vermelho', 'verde', 'laranja'].map(c => tok(`missao_${c}`, `Missão ${c[0].toUpperCase()}${c.slice(1)}`, 'Marcador de Missão.')).join('')}</div>`);
  }

  showRules() {
    this.open('Biblioteca', RULES_HTML);
  }

  // ------------------------------------------------------------------
  showSettings() {
    const st = getSettings();
    const opt = (name: string, v: string, label: string, cur: string) => `<label class="set-opt"><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''}/> ${label}</label>`;
    this.tab = null;
    this.open('Configurações', `<div class="set-box">
      <h3>Tela de confronto</h3>
      ${opt('battle', 'always', '<b>Sempre</b> — mostra a tela 2D de batalha em todos os ataques', st.battle)}
      ${opt('battle', 'mine', '<b>Só os meus</b> — mostra só quando um Herói seu ataca ou é atacado', st.battle)}
      ${opt('battle', 'never', '<b>Nunca</b> — combate rápido, só o resumo dos dados no topo (como na velocidade 4x)', st.battle)}
      <h3>Rerrolagem</h3>
      ${opt('reroll', 'choose', '<b>Escolher os dados</b> — quando um Herói seu tem Rerrolagem (↻), você escolhe quais dados rolar de novo', st.reroll)}
      ${opt('reroll', 'auto', '<b>Automática</b> — rerrola sozinho os dados que falharam', st.reroll)}
      <h3>Dificuldade da IA</h3>
      ${opt('ai', 'normal', '<b>Normal</b> — joga bem, mas comete erros e às vezes arrisca à toa', st.ai)}
      ${opt('ai', 'hard', '<b>Difícil</b> — calcula as chances dos dados, usa poções, caça quem carrega Missões e se protege', st.ai)}
      <h3>Câmera</h3>
      ${opt('view', 'free', '<b>Visão livre</b> — você move a câmera (arrastar e roda do mouse)', st.view)}
      ${opt('view', 'players', '<b>Visão dos jogadores</b> — a câmera segue quem está jogando (online: a tela e o mouse do jogador da vez)', st.view)}
      <h3>Velocidade das animações</h3>
      ${opt('speed', '1', '1x', String(st.speed))}${opt('speed', '2', '2x', String(st.speed))}${opt('speed', '4', '4x', String(st.speed))}
      <h3>Cronômetro</h3>
      <label class="set-opt"><input type="checkbox" id="set-clock" ${st.clock ? 'checked' : ''}/> Mostrar o tempo da partida e da campanha</label>
      <p class="muted">As configurações ficam salvas neste navegador e valem na hora, inclusive durante uma partida.</p>
    </div>`);
    const upd = () => {
      const battle = (this.page.querySelector('input[name=battle]:checked') as HTMLInputElement).value as 'always';
      const speed = Number((this.page.querySelector('input[name=speed]:checked') as HTMLInputElement).value);
      const clock = (this.page.querySelector('#set-clock') as HTMLInputElement).checked;
      const reroll = (this.page.querySelector('input[name=reroll]:checked') as HTMLInputElement).value as 'choose';
      const view = (this.page.querySelector('input[name=view]:checked') as HTMLInputElement).value as 'free';
      const ai = (this.page.querySelector('input[name=ai]:checked') as HTMLInputElement).value as 'normal';
      saveSettings({ battle, speed, clock, reroll, view, ai });
    };
    this.page.querySelectorAll<HTMLInputElement>('input').forEach(i => { i.onchange = upd; });
  }

  showMaps(selected = loadMapId()) {
    const m = getMap(selected);
    const circles = [...new Set(CAMPAIGN.map(c => c.circle))];
    const list = circles.map(circle => `<div class="mc-group">${circle}</div>` + CAMPAIGN.filter(c => c.circle === circle).map(c => {
      const sel = c.map?.id === m.id;
      return `<div class="mapcard ${c.map ? 'playable' : 'locked'} ${sel ? 'sel' : ''}" ${c.map ? `data-map="${c.map.id}"` : ''}>
        <div class="mc-name">${c.name}</div>${c.map ? `<span class="mc-ok">${sel ? 'Vendo' : 'Ver'}</span>` : '<span class="mc-soon">Em breve</span>'}
      </div>`;
    }).join('')).join('');
    const types = new Map<string, number>();
    for (const x of m.monsters) types.set(x.type, (types.get(x.type) ?? 0) + 1);
    const closed = m.doors.filter(d => !d.open).length, open = m.doors.length - closed;
    const missionMarks = m.missionMarkers.length + (m.missionMarkersByArea?.length ?? 0);
    this.open(this.tab ? 'Biblioteca' : 'Mapas', `
      <div class="maps">
        <div class="maplist">${list}</div>
        <div class="mapdetail">
          <h3>${m.name} <small>${m.circle} · Monstros Nível ${m.level ?? '1'}</small></h3>
          <canvas id="minimap" width="560" height="560"></canvas>
          <div class="legend">
            <span><i style="background:#e9dcbf"></i>Rua</span><span><i style="background:#c99459"></i>Sala</span><span><i style="background:#7da23a"></i>Bloqueado</span>
            <span><i style="background:#d98a3c"></i>Área Inicial</span><span><i class="ln wall"></i>Parede</span><span><i class="ln door"></i>Porta fechada</span><span><i class="ln open"></i>Porta aberta</span><span><i class="ln lock"></i>Porta trancada</span>
          </div>
          <div class="mapinfo">
            <div><b>Tabuleiros:</b> ${m.boards.map(b => b.code).join(', ')}</div>
            <div><b>Componentes:</b> ${closed} portas fechadas · ${open} abertas · ${m.portals.length} portais · ${m.exploration.length} marcadores de Exploração · ${m.entryMarkers.length} Entradas de Monstro · ${missionMarks} marcadores de Missão</div>
            <div><b>Monstros:</b> ${[...types].map(([t, n]) => `${n} ${MONSTERS[t].name}`).join(' · ')}</div>
            <div><b>Missões contra o Jogo:</b> ${m.missions.pve.map(x => `<i>${x.name}</i> — ${x.text}`).join('<br/>')}</div>
            <div><b>Missões contra Jogador:</b> ${m.pvp === false ? 'nenhuma' : 'Matar um Herói de cada Guilda adversária.'}</div>
            ${m.missions.rewards.length ? `<div><b>Recompensa:</b> ${m.missions.rewards.map(r => CARDS[r].name).join(', ')} — ${CARDS[m.missions.rewards[0]].text}</div>` : ''}
            <div><b>Para vencer:</b> ${m.missionsToWin ? `${m.missionsToWin} Missão` : '2 Missões (2 jogadores) ou 3 Missões com pelo menos 1 contra o Jogo (3-4 jogadores)'}</div>
            ${(m.notes ?? []).map(n => `<div class="mi-note">• ${n}</div>`).join('')}
          </div>
        </div>
      </div>`);
    drawMinimap(this.page.querySelector('#minimap') as HTMLCanvasElement, m);
    this.page.querySelectorAll<HTMLElement>('[data-map]').forEach(el => { el.onclick = () => this.showMaps(el.dataset.map!); });
  }
}

/** Mapa visto de cima, no estilo do Livro de Campanha. */
export function drawMinimap(cv: HTMLCanvasElement, m: MapDef) {
  const ctx = cv.getContext('2d')!;
  const S = Math.floor(Math.min(cv.width, cv.height) / m.cols);
  ctx.fillStyle = '#d9d0e6';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const exists = new Set<string>();
  for (const b of m.boards) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) exists.add(key({ c: b.c + c, r: b.r + r }));
  const pillars = new Set(m.pillars.map(key));
  const rooms = new Set(m.rooms.map(key));
  const start = new Map<string, number>();
  m.startAreas.forEach((cells, i) => cells.forEach(c => start.set(key(c), i)));
  for (const k of exists) {
    const [c, r] = k.split(',').map(Number);
    ctx.fillStyle = pillars.has(k) ? '#7da23a' : start.has(k) ? '#d98a3c' : rooms.has(k) ? '#c99459' : '#e9dcbf';
    ctx.fillRect(c * S, r * S, S, S);
    ctx.strokeStyle = 'rgba(80,55,25,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(c * S + 0.5, r * S + 0.5, S - 1, S - 1);
    if (!pillars.has(k)) { ctx.fillStyle = 'rgba(80,55,25,0.35)'; ctx.beginPath(); ctx.arc(c * S + S / 2, r * S + S / 2, 2, 0, 7); ctx.fill(); }
  }
  // rótulos das áreas iniciais
  ctx.font = `bold ${Math.round(S * 0.2)}px "Baloo 2", sans-serif`;
  ctx.textAlign = 'center';
  m.startAreas.forEach((cells, i) => {
    const cx = cells.reduce((s, c) => s + c.c + 0.5, 0) / cells.length, cy = cells.reduce((s, c) => s + c.r + 0.5, 0) / cells.length;
    ctx.fillStyle = '#fff3e0';
    ctx.fillText(`ÁREA INICIAL J${i + 1}`, cx * S, cy * S + 5);
  });
  // paredes e portas
  const edge = (a: { c: number; r: number }, b: { c: number; r: number }) => {
    if (a.r === b.r) { const x = Math.max(a.c, b.c) * S; return [x, a.r * S, x, (a.r + 1) * S]; }
    const y = Math.max(a.r, b.r) * S; return [a.c * S, y, (a.c + 1) * S, y];
  };
  ctx.lineCap = 'round';
  for (const [a, b] of m.walls) {
    const [x0, y0, x1, y1] = edge(a, b);
    ctx.strokeStyle = '#6e6a62'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  for (const d of m.doors) {
    const [x0, y0, x1, y1] = edge(d.a, d.b);
    const ix = (x1 - x0) * 0.12, iy = (y1 - y0) * 0.12;
    ctx.strokeStyle = d.locked ? '#7a3fb0' : d.open ? '#3fa34d' : '#d8432f'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x0 + ix, y0 + iy); ctx.lineTo(x1 - ix, y1 - iy); ctx.stroke();
    ctx.strokeStyle = d.open ? '#cfe9b0' : '#8a5a2b'; ctx.lineWidth = 4;
    ctx.stroke();
  }
  const icon = (c: { c: number; r: number }, dx: number, dy: number, color: string, txt: string) => {
    const x = (c.c + 0.5 + dx) * S, y = (c.r + 0.5 + dy) * S;
    ctx.beginPath(); ctx.arc(x, y, S * 0.15, 0, 7);
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(S * 0.14)}px "Baloo 2", sans-serif`; ctx.fillText(txt, x, y + S * 0.05);
  };
  for (const p of m.portals) icon(p.cell, 0.22, -0.22, p.color === 'magenta' ? '#c03a9a' : '#2fb3b8', '◎');
  for (const e of m.entryMarkers) icon(e, -0.24, 0.24, '#d9a92c', '⚑');
  for (const x of m.exploration) icon(x, -0.22, -0.22, '#6a3fa0', '?');
  for (const mm of m.missionMarkers) icon(mm.cell, -0.24, -0.02, GUILDS[mm.color as keyof typeof GUILDS]?.color ?? '#e0b43a', '★');
  for (const c of m.missionMarkersByArea ?? []) icon(c, -0.24, -0.02, '#e0b43a', '★');
  for (const lb of m.labels ?? []) {
    const cx = lb.cells.reduce((a, c) => a + c.c + 0.5, 0) / lb.cells.length, cy = lb.cells.reduce((a, c) => a + c.r + 0.5, 0) / lb.cells.length;
    ctx.fillStyle = '#4a2a6a'; for (const c of lb.cells) ctx.fillRect(c.c * S + 2, c.r * S + 2, S - 4, S - 4);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(S * 0.16)}px "Baloo 2", sans-serif`; ctx.fillText(lb.text, cx * S, cy * S + 4);
  }
  const seen = new Map<string, number>();
  for (const mo of m.monsters) {
    const k = key(mo.cell);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const md = MONSTERS[mo.type];
    const col = md.category.startsWith('Vilão') ? (md.category === 'Vilão Maior' ? '#2a3a8a' : '#a0285a') : md.category === 'Lacaio Maior' ? '#e06a1c' : md.attackType === 'ranged' ? '#5aa02c' : '#c8382c';
    icon(mo.cell, 0.12 + n * 0.2, 0.2 - n * 0.06, col, md.abbr);
  }
}

const RULES_HTML = `<div class="rules">
  <section><h3>Objetivo</h3><p>Cumprir Missões antes das outras Guildas. Com 2 jogadores vence quem cumprir <b>2 Missões</b>; com 3-4, <b>3 Missões</b> com pelo menos <b>1 contra o Jogo</b>. Na campanha, 6 cenários: 3 do Círculo Exterior, 2 do Interior e o Confronto Final.</p></section>
  <section><h3>Turno</h3><p>No seu turno escolha <b>Ativar</b> um Herói <i>ou</i> <b>Descansar</b> a Guilda. Ativar: <b>3 Pontos de Movimento</b> (mover 1 Espaço, abrir/fechar porta Perto ou usar portal) e <b>1 Ataque</b>, em qualquer ordem — mas o Movimento não pode ser dividido pelo Ataque.</p></section>
  <section><h3>Espaços</h3><p>Máximo de <b>2 personagens</b> por Espaço. Com 2 personagens e algum Aliado o Espaço está <i>Ocupado</i> (atravessa, não para). Com 2 Inimigos está <i>Bloqueado</i> (não atravessa e bloqueia a Linha de Visão). <b>Perto</b> = mesmo Espaço ou ortogonal sem parede/porta fechada.</p></section>
  <section><h3>Ataque</h3><p>Escolha uma carta de Ataque (Próximo: alvo Perto; Distância: Linha de Visão). Role os dados pretos: ⚔ acerta corpo a corpo, ➶ acerta a distância, ✷ <b>crítico</b> sempre acerta e rola mais um dado. O alvo rola dados brancos (⛨ e ✷ bloqueiam). Cada acerto não bloqueado = 1 Ferimento. A carta fica <b>exaustada</b>. <b>Ampliações</b> somam ao ataque e também exaustam. O <b>Conjunto de Rerrolagem</b> (↻) é usado nos dados que falharam.</p></section>
  <section><h3>Monstros</h3><p>Não têm turno. <b>Reação de Alerta</b>: atacam o Herói que sai de um Espaço Perto deles ou que ataca outro alvo estando Perto. <b>Reação de Vingança</b>: ao ser atacado, o Monstro pode se mover e revidar — quem decide é o jogador à direita do jogador ativo. <b>Extermínio</b>: Ferimentos num só ataque ≥ Extermínio matam sem Vingança.</p></section>
  <section><h3>Descansar</h3><p>Restaura todas as cartas, recupera Atordoados, permite <b>reorganizar as cartas</b> e os marcadores de Exploração entre os Heróis (marcadores de Missão e Maldições não se movem) e <b>ressuscita os mortos</b> na Área Inicial ou Perto de um Aliado que já estava no tabuleiro.</p></section>
  <section><h3>Cemitério e Entrada de Monstros</h3><p>Lacaios mortos vão ao Cemitério (5 vagas). Com 5, ou sem Monstros no mapa, no fim do turno cada um rola 2 dados contra os marcadores de Entrada: revive no correspondente livre ou volta à caixa.</p></section>
  <section><h3>Recompensas em moedas</h3><p>Matar Monstro: o valor da carta. Matar Herói inimigo: 1. Monstro mata Herói: 1 para cada outra Guilda. Primeiro a cumprir uma Missão: +1. No fim: 1 por Missão e o valor dos Baús.</p></section>
  <section><h3>Marcadores de Exploração</h3><p>Pegos automaticamente ao entrar no Espaço sem Inimigos: Poção de Cura, Poção Revigorante, Poção de Turno Adicional, Baú de Tesouro e Armadilha (1 Ferimento).</p></section>
  <section><h3>Campanha</h3><p>Escolha de Heróis em rodadas (cada um pega 1 e passa a mão), votação do primeiro cenário, distribuição do equipamento inicial e posicionamento na Área Inicial. Entre cenários: <b>Maldições Mortais</b> (1 carta por morte, fica a pior), <b>Fase de Melhorias</b> (escolhe 2 de 6 cartas 3 vezes, compra até 3, guarda 1 moeda) e <b>Títulos</b>. O vencedor de cada cenário escolhe o próximo. No fim, <b>Medalhas</b> definem o grau da vitória.</p></section>
  <section><h3>Controles</h3><p>Clique: ativar / mover / atacar · arrastar: câmera · roda: zoom · <b>1-4</b> carta · <b>Espaço</b> encerra o turno · <b>R</b> descansar · <b>C</b> mapa inteiro · <b>F</b> focar Herói · <b>Esc</b> menu. Clique numa Missão para ver os objetivos no mapa.</p></section>
</div>`;
