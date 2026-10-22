import type { MapDef } from '../engine/board';
import { EXTRA_HEROES } from '../engine/extraHeroes';
import { key } from '../engine/board';
import { ALL_HEROES, BTG_HEROES, CARDS, HEROES, MONSTERS, TEST_HUMAN_HEROES, distributeStartingGear, EXTRA_HERO_IDS } from '../engine/data';
import { TOMBSTONES } from '../engine/tombstones';
import { BTG_MAP_IDS, CAMPAIGN, CAMPAIGN_BTG, MAPS, difficultyBadge, getMap, loadMapId, mapDifficulty, saveMapId } from '../engine/maps';
import { drawFace, ensureArt } from '../render/chibi';
import { MAX_SLOTS, TEST_GUILDS, slotsFor, type TestConfig, loadTestConfig, normalizeTestConfig, saveTestConfig } from './testConfig';
import { GUILDS } from '../engine/data';
import { ITEM_LEVEL, MONSTER_LEVEL, curseCard, extraHeroCard, heroCard, itemCard, monsterCard, paintCardArt } from './cardview';
import { BTG_REMOVED, CARDS as ALL_CARDS, CURSES } from '../engine/cards';
import { TITLES, TITLE_TEXT } from '../engine/titles';
import { getSettings, saveSettings } from './settings';
import { play } from '../audio/sfx';
import { tokenUrl } from '../render/tokens';
import { EXPLORATION_BAG, TOKEN_INFO } from '../engine/data';
import { bindInvEditor, invEditorHtml, type InvItem, type InvOptions } from './inventoryEditor';
import { attachMapPeek, closeMapPeek, drawMinimap, mapArtUrl, mapSheet, miniCanvas, paintMapSheets } from './mapInfo';

type Tab = 'herois' | 'monstros' | 'itens' | 'marcadores' | 'mapas' | 'regras';
const TABS: [Tab, string][] = [['herois', '👥 Heróis'], ['monstros', '👹 Monstros'], ['itens', '🃏 Itens'], ['marcadores', '🪙 Marcadores'], ['mapas', '🗺️ Mapas'], ['regras', '📖 Regras']];

/** Edições na Biblioteca: cada aba mostra só o conteúdo do CBT Clássico ou de Beyond the Grave. */
type LibEd = 'classic' | 'btg';
const LIB_EDS: [LibEd, string][] = [['classic', '⚔️ CBT Clássico'], ['btg', '💀 Beyond the Grave']];
const BTG_TITLES = ['orador_mortos', 'mente_mestra', 'purificador', 'casamenteiro', 'coveiro', 'capitao_milicia', 'mestre_morte', 'alquimista'];
const BTG_MONSTERS = ['esqueleto', 'zumbi_arremessador', 'zumbi_retalhador', 'fantasma', 'necromante', 'ivan', 'frank', 'dr_spider', 'rei_pavoroso'];
const CLASSIC_MONSTERS = ['goblin', 'orc', 'capitao_orc', 'feral_martelador', 'feral_lanceiro', 'irma_dor', 'irma_prazer', 'troll', 'minotauro', 'lorde_presas'];

const SET_TABS: [string, string][] = [['jogo', '🎮 Jogabilidade'], ['grafico', '🖥️ Gráficos'], ['som', '🔊 Som']];

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
  /** Edição mostrada na Biblioteca. */
  private libEd: LibEd = 'classic';
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
    // na aba Heróis: Core, Beyond the Grave e Extra; nas outras, só as duas edições
    const heroTab = this.tab === 'herois';
    const edBtn = (e: string, n: string, on: boolean) => `<button class="${on ? 'on' : ''} ed-${e}" data-led="${e}">${n}</button>`;
    const eds = !this.tab ? '' : `<div class="lib-eds">${heroTab
      ? edBtn('classic', `⭐ Core Heroes <small>(${ALL_HEROES.length})</small>`, this.heroSet === 'core' && this.libEd === 'classic')
        + edBtn('btg', `💀 Beyond the Grave <small>(${BTG_HEROES.length})</small>`, this.heroSet === 'core' && this.libEd === 'btg')
        + edBtn('extra', `✨ Extra Heroes <small>(${EXTRA_HEROES.length})</small>`, this.heroSet === 'extra')
      : LIB_EDS.map(([e, n]) => edBtn(e, n, e === this.libEd)).join('')}</div>`;
    this.page.innerHTML = `<div class="mp-head"><button class="mp-back">← Voltar</button><h2>${title}</h2>${tabs}</div><div class="mp-body">${eds}${body}</div>`;
    this.page.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => { b.onclick = () => this.showLibrary(b.dataset.tab as Tab); });
    this.page.querySelectorAll<HTMLElement>('[data-led]').forEach(b => { b.onclick = () => {
      if (b.dataset.led === 'extra') this.heroSet = 'extra';
      else { this.libEd = b.dataset.led as LibEd; this.heroSet = 'core'; }
      this.showLibrary(this.tab ?? 'herois');
    }; });
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
  /** Aba dos Heróis na Biblioteca: os do jogo ou os extras (só para ver). */
  private heroSet: 'core' | 'extra' = 'core';
  /** Aba de Heróis no Modo Teste. */
  private tsSet: 'core' | 'btg' | 'extra' = 'core';
  /** Espaço de Herói escolhido no Modo Teste (o próximo Herói tocado vai nele). */
  private tsSlot = 0;
  showHeroes(onBack?: () => void) {
    if (onBack) { this.back = onBack; this.tab = null; this.picking = true; }
    else if (this.tab) this.picking = false;
    const extra = !this.picking && this.heroSet === 'extra';
    const btg = !this.picking && !extra && this.libEd === 'btg';
    const sub = '';
    const cards = btg ? BTG_HEROES.map(id => heroCard(id, '', `data-hero="${id}"`)).join('') : extra ? EXTRA_HEROES.map(h => extraHeroCard(h)).join('') : ALL_HEROES.map(id => {
      const idx = this.guild.indexOf(id);
      const on = this.picking && idx >= 0;
      return heroCard(id, on ? 'picked' : '', `data-hero="${id}"`, '', on ? `${idx + 1}` : '');
    }).join('');
    this.open(this.tab ? 'Biblioteca' : 'Personagens', `
      ${!this.picking ? '' : `<div class="mp-guild">
        <div><b>Sua Guilda</b> (sala online) — clique nos cartões para escolher 3 Heróis.</div>
        <div class="mp-slots">${[0, 1, 2].map(i => `<span class="slot">${i + 1}. ${this.guild[i] ? HEROES[this.guild[i]].name : '—'}</span>`).join('')}</div>
      </div>`}
      ${sub}${extra ? '<p class="muted">Heróis extras: entram no recrutamento com <b>Permitir Todos os Heróis</b> nas Configurações da partida.</p>' : ''}${btg ? '<p class="muted">Heróis de Beyond the Grave: entram no recrutamento da campanha Beyond the Grave (e em todas com <b>Permitir Todos os Heróis</b>).</p>' : ''}
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
    // itens: o mesmo editor da campanha (espaços dos Heróis), com todas as cartas do jogo disponíveis
    const invItems: InvItem[] = c.heroes.flatMap(h => (c.cards[h] ?? []).map(id => ({ id, to: h })));
    const invOpts: InvOptions = {
      heroes: c.heroes, color: GUILDS[c.teams[0].guild].color, discard: false, catalog: true,
      slots: (_h, cards) => {
        const magicExtra = slotsFor(cards) - MAX_SLOTS;
        const magic = cards.filter(id => ALL_CARDS[id]?.magic && ALL_CARDS[id]?.kind === 'attack').length;
        return { used: cards.length - Math.min(magic, magicExtra), max: MAX_SLOTS, magicExtra };
      },
    };
    this.open('Modo Teste', `<div class="ts">
      <section class="ts-sec ts-mapsec"><h3>1. Mapa</h3>
        <select id="ts-map">${Object.values(MAPS).map(x => x).sort((p, q) => Number(BTG_MAP_IDS.has(p.id)) - Number(BTG_MAP_IDS.has(q.id))).map(x => `<option value="${x.id}" ${x.id === c.mapId ? 'selected' : ''}>${BTG_MAP_IDS.has(x.id) ? '💀 ' : ''}${x.name} — ${x.circle} · ${mapDifficulty(x).label}</option>`).join('')}</select>
        <div class="ts-mappick" data-peek="${m.id}"><img src="${mapArtUrl(m.id)}" alt=""/>${miniCanvas(m, 360, 'id="ts-mini"')}</div>
        <small>${difficultyBadge(m)} Monstros Nível ${m.level ?? '1'} · ${m.startAreas.length} Áreas Iniciais · 🔍 abre a ficha</small></section>
      <section class="ts-sec"><h3>2. Times</h3>
        <div class="ts-count">${[2, 3, 4].map(n => `<button data-n="${n}" class="${c.teams.length === n ? 'primary' : ''}">${n} times</button>`).join('')}</div>
        <div class="ts-teams">${c.teams.map((t, i) => `<div class="ts-team" style="--gc:${GUILDS[t.guild].color}">
          <span class="dot" style="background:${GUILDS[t.guild].color}"></span><b>Time ${i + 1}</b>
          <input class="ts-name" data-tn="${i}" maxlength="20" placeholder="${GUILDS[t.guild].name.split(' (')[0].replace('Guilda ', '')} (nome opcional)" value="${(t.name ?? '').replace(/"/g, '&quot;')}" title="${i === 0 ? 'Seus Heróis' : 'Heróis sorteados'} — deixe vazio para usar a cor"/>
          <select data-ctl="${i}"><option value="human" ${t.controller === 'human' ? 'selected' : ''}>👤 Você</option><option value="ai" ${t.controller === 'ai' ? 'selected' : ''}>🤖 IA</option></select></div>`).join('')}</div>
        <label class="ts-diff">Dificuldade da IA <select id="ts-ai"><option value="normal" ${getSettings().ai === 'normal' ? 'selected' : ''}>Normal</option><option value="hard" ${getSettings().ai === 'hard' ? 'selected' : ''}>Difícil</option></select></label>
        <p class="muted">${humans === 0 ? 'Todos os times são IA: você assiste à partida.' : humans > 1 ? 'Vários times "Você": jogam neste computador, revezando.' : 'Times "Você" são controlados por você; os outros pela IA.'} Nenhum Herói se repete entre os times.</p></section>
      <section class="ts-sec ts-wide"><h3>3. Seus Heróis <small>(Time 1)</small></h3>
        <div class="ts-slots">${[0, 1, 2].map(i => { const h = c.heroes[i]; const d = HEROES[h]; return `<button class="ts-slot ${i === this.tsSlot ? 'sel' : ''}" data-tslot="${i}" title="Escolher quem vai no espaço ${i + 1}">
          <span class="ts-sn">${i + 1}</span><canvas width="96" height="96" data-face="${h}"></canvas>
          <span class="ts-si"><b>${d.name}</b><small>${d.title}</small><em>⚡ ${d.abilityName}</em></span>${i === this.tsSlot ? '<span class="ts-swap">trocar ▾</span>' : ''}</button>`; }).join('')}</div>
        <p class="ts-help">👆 Toque num <b>espaço</b> acima (fica dourado) e depois no <b>Herói</b> que vai nele. As cartas do espaço continuam com o novo Herói.</p>
        <div class="lib-filter ts-tabs"><button class="${this.tsSet === 'core' ? 'primary' : ''}" data-tset="core">⭐ Core Heroes <small>(${ALL_HEROES.length})</small></button><button class="${this.tsSet === 'btg' ? 'primary' : ''}" data-tset="btg">💀 Beyond the Grave <small>(${BTG_HEROES.length})</small></button><button class="${this.tsSet === 'extra' ? 'primary' : ''}" data-tset="extra">✨ Extra Heroes <small>(${EXTRA_HERO_IDS.length})</small></button></div>
        <div class="ts-heroes">${(this.tsSet === 'extra' ? EXTRA_HERO_IDS : this.tsSet === 'btg' ? BTG_HEROES : ALL_HEROES).map(h => { const i = c.heroes.indexOf(h); return `<button class="ts-hero ${i >= 0 ? 'on' : ''}" data-th="${h}">${i >= 0 ? `<span class="pick-badge">${i + 1}</span>` : ''}<canvas width="72" height="72" data-face="${h}"></canvas><b>${HEROES[h].name}</b><small>${HEROES[h].title}</small></button>`; }).join('')}</div></section>
      <section class="ts-sec ts-wide"><h3>4. Itens <small>(até ${MAX_SLOTS} cartas por Herói)</small></h3>
        <p class="muted">Clique num <b>espaço vazio</b> ou numa <b>carta</b> para escolher qual carta vai nele (qualquer carta do jogo, ou trocar entre Heróis).</p>
        <div class="ts-btnrow"><button id="ts-gear">Equipamento inicial padrão</button><button id="ts-clear">Remover todas as cartas</button></div>
        ${invEditorHtml(invItems, invOpts)}</section>
      <section class="ts-sec ts-wide"><h3>5. Configurações da partida</h3>
        <label class="set-opt"><input type="checkbox" id="ts-cap" ${c.diceCap ? 'checked' : ''}/> <b>Limite de dados</b> — no máximo 8 dados de ataque e 6 de defesa por rolagem (contando críticos e rerrolagens), como os dados físicos da caixa. Sem marcar, os dados são ilimitados.</label></section>
      <div class="ts-go"><button class="primary" id="ts-start">▶ Começar teste</button></div>
    </div>`);
    this.page.scrollTop = y;
    drawMinimap(this.page.querySelector('#ts-mini') as HTMLCanvasElement, m);
    closeMapPeek();
    attachMapPeek(this.page);
    this.page.querySelectorAll<HTMLCanvasElement>('canvas[data-face]').forEach(cv => drawFace(cv, cv.dataset.face!, '#3a5a8a'));
    // retratos dos Heróis extras: desenha de novo quando a arte terminar de carregar
    // retratos que carregam sob demanda (Heróis extras e de Beyond the Grave)
    const lazy = [...(this.tsSet === 'extra' || c.heroes.some(h => HEROES[h].extra) ? EXTRA_HERO_IDS : []), ...(this.tsSet === 'btg' || c.heroes.some(h => BTG_HEROES.includes(h)) ? BTG_HEROES : [])];
    if (lazy.length) void ensureArt(lazy).then(() => this.page.querySelectorAll<HTMLCanvasElement>('canvas[data-face]').forEach(cv => drawFace(cv, cv.dataset.face!, '#3a5a8a')));
    const save = () => { this.test = normalizeTestConfig(c); saveTestConfig(this.test); saveMapId(this.test.mapId); this.onMapChange(); this.showTestSetup(onStart); };
    (this.page.querySelector('#ts-cap') as HTMLInputElement).onchange = e => { c.diceCap = (e.target as HTMLInputElement).checked; save(); };
    this.page.querySelectorAll<HTMLElement>('[data-tset]').forEach(b => { b.onclick = () => { this.tsSet = b.dataset.tset as 'core' | 'btg' | 'extra'; this.showTestSetup(onStart); }; });
    (this.page.querySelector('#ts-ai') as HTMLSelectElement).onchange = e => saveSettings({ ...getSettings(), ai: (e.target as HTMLSelectElement).value as 'normal' | 'hard' });
    (this.page.querySelector('#ts-map') as HTMLSelectElement).onchange = e => { c.mapId = (e.target as HTMLSelectElement).value; save(); };
    this.page.querySelectorAll<HTMLElement>('[data-n]').forEach(b => { b.onclick = () => {
      const n = Number(b.dataset.n);
      c.teams = TEST_GUILDS.slice(0, n).map((g, i) => c.teams[i] ?? { guild: g, controller: 'ai' });
      save();
    }; });
    this.page.querySelectorAll<HTMLInputElement>('[data-tn]').forEach(inp => { inp.onchange = () => { c.teams[Number(inp.dataset.tn)].name = inp.value; save(); }; });
    this.page.querySelectorAll<HTMLSelectElement>('[data-ctl]').forEach(s => { s.onchange = () => { c.teams[Number(s.dataset.ctl)].controller = s.value as 'human' | 'ai'; save(); }; });
    // espaços dos Heróis: escolhe o espaço, depois o Herói que vai nele
    this.page.querySelectorAll<HTMLElement>('[data-tslot]').forEach(b => { b.onclick = () => { this.tsSlot = Number(b.dataset.tslot); this.showTestSetup(onStart); }; });
    this.page.querySelectorAll<HTMLElement>('[data-th]').forEach(b => { b.onclick = () => {
      const h = b.dataset.th!;
      const slot = this.tsSlot;
      const old = c.heroes[slot];
      if (h === old) return;
      const j = c.heroes.indexOf(h);
      if (j >= 0) {
        // já está em outro espaço: os dois trocam de lugar (com as cartas)
        [c.heroes[slot], c.heroes[j]] = [c.heroes[j], c.heroes[slot]];
      } else {
        // entra no espaço e fica com as cartas de quem saiu
        c.heroes[slot] = h;
        c.cards[h] = c.cards[old] ?? [];
        delete c.cards[old];
      }
      // próximo espaço fica escolhido (para montar a Guilda em sequência)
      this.tsSlot = (slot + 1) % 3;
      this.test = c;
      save();
    }; });
    (this.page.querySelector('#ts-gear') as HTMLElement).onclick = () => { c.cards = distributeStartingGear(c.heroes); save(); };
    (this.page.querySelector('#ts-clear') as HTMLElement).onclick = () => { c.cards = Object.fromEntries(c.heroes.map(h => [h, []])); save(); };
    // "Tirar do Herói" no Modo Teste remove a carta
    bindInvEditor(this.page, invItems, invOpts, () => { c.cards = Object.fromEntries(c.heroes.map(h => [h, invItems.filter(x => x.to === h).map(x => x.id)])); save(); });
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
    const btg = this.libEd === 'btg';
    const bases = btg ? BTG_MONSTERS : CLASSIC_MONSTERS;
    const lv = this.monLevel;
    const cards = bases.map(b => MONSTERS[b + lv]).filter(Boolean).map(m => monsterCard(m.id)).join('');
    const lvBtn = (v: string, n: string) => `<button class="${lv === v ? 'primary' : ''}" data-lv="${v}" style="border-color:${MONSTER_LEVEL[n]}"><span class="lvdot" style="background:${MONSTER_LEVEL[n]}"></span>Nível ${n}</button>`;
    this.open('Biblioteca', `<div class="lib-filter">${lvBtn('', '1')}${lvBtn('2', '2-3')}${lvBtn('4', '4-5')}${lvBtn('6', '6')}</div><div class="hgrid cards-m">${cards}</div>
      <p class="muted">${btg ? 'Mortos-vivos de Beyond the Grave: Fantasmas atravessam paredes, o Necromante ergue os mortos e o Rei Pavoroso ocupa o Espaço inteiro.' : 'Lacaios voltam pelo Cemitério (Entrada de Monstros). Vilões: todas as Guildas que tentarem feri-los ganham a recompensa.'}</p>`);
    paintCardArt(this.page);
    this.page.querySelectorAll<HTMLElement>('[data-lv]').forEach(b => { b.onclick = () => { this.monLevel = b.dataset.lv!; this.showMonsters(); }; });
  }

  private itemLevel = 'I';
  showItems() {
    const btg = this.libEd === 'btg';
    // Beyond the Grave só traz cartas de Recompensa (dos seus cenários) e Títulos novos
    const btgScen = new Set(CAMPAIGN_BTG.map(c => c.name));
    const lv = btg && !['I', 'R', 'M'].includes(this.itemLevel) ? 'R' : this.itemLevel;
    // Iniciais: no Clássico as 5 da caixa; em Beyond the Grave só a Foice (a 6ª carta inicial)
    const list = Object.values(ALL_CARDS).filter(c => c.level === lv && (lv === 'I' ? btg === !!c.btg : lv !== 'R' || btg === btgScen.has(c.scenario ?? '')));
    const titles = Object.keys(TITLES).filter(t => btg === BTG_TITLES.includes(t));
    const body = lv === 'M'
      ? `${btg ? '' : `<div class="cp-cards">${Object.keys(CURSES).map(id => curseCard(id)).join('')}</div>`}
         <h3 class="mp-sub">Títulos</h3><div class="mapinfo">${titles.map(t => `<div><b>🏅 ${TITLES[t]}</b> — ${TITLE_TEXT[t]}</div>`).join('')}</div>`
      : `<div class="cp-cards">${list.map(c => itemCard(c.id, '', '', true)).join('')}</div>`;
    const b = (v: string, n: string) => `<button class="${lv === v ? 'primary' : ''}" data-il="${v}">${ITEM_LEVEL[v] ? `<span class="lvdot" style="background:${ITEM_LEVEL[v].color}"></span>` : ''}${n}</button>`;
    const levels = btg ? b('I', 'Inicial') + b('R', 'Recompensas') + b('M', 'Títulos')
      : `${b('I', 'Iniciais')}${b('1', 'Nível 1')}${b('2', 'Nível 2')}${b('3', 'Nível 3')}${b('4', 'Nível 4')}${b('5', 'Nível 5')}${b('R', 'Recompensas')}${b('M', 'Maldições e Títulos')}`;
    const removed = Object.entries(BTG_REMOVED).map(([n, ids]) => `<div><b>Nível ${n}:</b> ${ids.map(id => ALL_CARDS[id]?.name ?? id).join(', ')}</div>`).join('');
    const note = !btg ? '' : lv === 'I'
      ? '<p class="muted">Na campanha Beyond the Grave cada jogador recebe as 5 cartas iniciais <b>e a Foice</b>, mas a Guilda fica só com 5: escolha 1 para descartar no Equipamento inicial.</p>'
      : `<p class="muted">Beyond the Grave usa as cartas de Melhoria do CBT Clássico, tirando 1 cópia de cada uma destas (p.6 do livro):</p><div class="mapinfo">${removed}</div>`;
    this.open('Biblioteca', `<div class="lib-filter">${levels}</div>${body}${note}`);
    this.page.querySelectorAll<HTMLElement>('[data-il]').forEach(x => { x.onclick = () => { this.itemLevel = x.dataset.il!; this.showItems(); }; });
  }

  showTokens() {
    if (this.libEd === 'btg') return this.showTombs();
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

  /** Marcadores de Beyond the Grave: o marcador de Morte e as cartas de Lápide. */
  private showTombs() {
    this.open('Biblioteca', `
      <h3 class="mp-sub">Marcador de Morte</h3>
      <div class="tk-grid"><div class="tk-card"><img src="${tokenUrl('missao_morte')}"/><b>Morte</b><p>Marcador de Missão de Beyond the Grave (O Cemitério e outros cenários).</p></div></div>
      <h3 class="mp-sub">Cartas de Lápide 🪦</h3>
      <p class="muted">Ficam em pé em Espaços do mapa. Um Herói no Espaço gasta 1 Ponto de Movimento para revelar (mesmo com Inimigo, sem Reação de Alerta) e o efeito acontece na hora.</p>
      <div class="tk-grid">${TOMBSTONES.map(t => `<div class="tk-card tomb ${t.good ? '' : 'bad'}"><span class="tomb-ic">🪦</span><b>${t.name}</b><p>${t.text}</p></div>`).join('')}</div>`);
  }

  showRules() {
    this.open('Biblioteca', this.libEd === 'btg' ? RULES_BTG_HTML : RULES_HTML);
  }

  // ------------------------------------------------------------------
  private setTab: 'jogo' | 'grafico' | 'som' = 'jogo';
  showSettings() {
    const st = getSettings();
    const opt = (name: string, v: string, label: string, cur: string) => `<label class="set-opt"><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''}/> ${label}</label>`;
    this.tab = null;
    const tab = this.setTab;
    const pane = (id: string) => `<div class="set-pane ${tab === id ? '' : 'hidden'}" data-pane="${id}">`;
    this.open('Configurações', `<div class="set-box">
      <div class="set-tabs">${SET_TABS.map(([id, label]) => `<button data-stab="${id}" class="${tab === id ? 'primary' : ''}">${label}</button>`).join('')}</div>
      ${pane('jogo')}
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
      <h3>Sinalização de ajuda</h3>
      <label class="set-opt"><input type="checkbox" id="set-hints" ${st.hints !== false ? 'checked' : ''}/> Mostrar os <b>Espaços azuis</b> (onde dá para andar) e os <b>vermelhos</b> (quem dá para atacar) no tabuleiro</label>
      <h3>Reação de Alerta</h3>
      <label class="set-opt"><input type="checkbox" id="set-alert" ${st.alertConfirm ? 'checked' : ''}/> Avisar e pedir confirmação antes de um movimento que provoca <b>Reação de Alerta</b></label>
      <label class="set-opt"><input type="checkbox" id="set-endc" ${st.endConfirm ? 'checked' : ''}/> Avisar ao <b>encerrar o turno</b> se ainda dá para ativar, mover ou atacar</label>
      <h3>Cronômetro</h3>
      <label class="set-opt"><input type="checkbox" id="set-clock" ${st.clock ? 'checked' : ''}/> Mostrar o tempo da partida e da campanha</label>
      </div>
      ${pane('grafico')}
      <h3>Qualidade</h3>
      ${opt('gfx', 'high', '<b>Alta</b> — mapa e personagens mais nítidos (recomendado)', st.gfx)}
      ${opt('gfx', 'normal', '<b>Normal</b> — mais leve para computadores e celulares fracos', st.gfx)}
      <h3>Câmera</h3>
      ${opt('view', 'free', '<b>Visão livre</b> — você move a câmera (arrastar e roda do mouse)', st.view)}
      ${opt('view', 'players', '<b>Visão dos jogadores</b> — a câmera segue quem está jogando (online: a tela e o mouse do jogador da vez)', st.view)}
      <h3>Velocidade das animações</h3>
      ${opt('speed', '1', '1x', String(st.speed))}${opt('speed', '2', '2x', String(st.speed))}${opt('speed', '4', '4x', String(st.speed))}
      </div>
      ${pane('som')}
      <h3>Som</h3>
      <label class="set-opt"><input type="checkbox" id="set-muted" ${st.muted ? 'checked' : ''}/> <b>Desativar todos os sons</b> (efeitos e música)</label>
      <label class="set-opt"><input type="checkbox" id="set-sound" ${st.sound ? 'checked' : ''}/> Sons ligados</label>
      <label class="set-opt set-vol">Volume geral <input type="range" id="set-master" min="0" max="100" step="5" value="${Math.round((st.master ?? 1) * 100)}"/> <b id="set-masterv">${Math.round((st.master ?? 1) * 100)}%</b></label>
      <label class="set-opt set-vol">Volume dos efeitos <input type="range" id="set-volume" min="0" max="100" step="5" value="${Math.round(st.volume * 100)}"/> <b id="set-volv">${Math.round(st.volume * 100)}%</b></label>
      <label class="set-opt"><input type="checkbox" id="set-music" ${st.music ? 'checked' : ''}/> Música ligada</label>
      <label class="set-opt set-vol">Volume da música <input type="range" id="set-mvolume" min="0" max="100" step="5" value="${Math.round(st.musicVolume * 100)}"/> <b id="set-mvolv">${Math.round(st.musicVolume * 100)}%</b></label>
      </div>
      <p class="muted">As configurações ficam salvas neste navegador e valem na hora, inclusive durante uma partida.</p>
    </div>`);
    const upd = () => {
      const battle = (this.page.querySelector('input[name=battle]:checked') as HTMLInputElement).value as 'always';
      const speed = Number((this.page.querySelector('input[name=speed]:checked') as HTMLInputElement).value);
      const clock = (this.page.querySelector('#set-clock') as HTMLInputElement).checked;
      const reroll = (this.page.querySelector('input[name=reroll]:checked') as HTMLInputElement).value as 'choose';
      const view = (this.page.querySelector('input[name=view]:checked') as HTMLInputElement).value as 'free';
      const ai = (this.page.querySelector('input[name=ai]:checked') as HTMLInputElement).value as 'normal';
      const sound = (this.page.querySelector('#set-sound') as HTMLInputElement).checked;
      const volume = Number((this.page.querySelector('#set-volume') as HTMLInputElement).value) / 100;
      (this.page.querySelector('#set-volv') as HTMLElement).textContent = `${Math.round(volume * 100)}%`;
      const music = (this.page.querySelector('#set-music') as HTMLInputElement).checked;
      const musicVolume = Number((this.page.querySelector('#set-mvolume') as HTMLInputElement).value) / 100;
      const master = Number((this.page.querySelector('#set-master') as HTMLInputElement).value) / 100;
      (this.page.querySelector('#set-masterv') as HTMLElement).textContent = `${Math.round(master * 100)}%`;
      (this.page.querySelector('#set-mvolv') as HTMLElement).textContent = `${Math.round(musicVolume * 100)}%`;
      const muted = (this.page.querySelector('#set-muted') as HTMLInputElement).checked;
      const alertConfirm = (this.page.querySelector('#set-alert') as HTMLInputElement).checked;
      const endConfirm = (this.page.querySelector('#set-endc') as HTMLInputElement).checked;
      const hints = (this.page.querySelector('#set-hints') as HTMLInputElement).checked;
      const gfx = ((this.page.querySelector('input[name=gfx]:checked') as HTMLInputElement | null)?.value ?? 'high') as 'high' | 'normal';
      saveSettings({ ...getSettings(), gfx, battle, speed, clock, reroll, view, ai, sound, volume, master, hints, music, musicVolume, muted, alertConfirm, endConfirm });
    };
    this.page.querySelectorAll<HTMLInputElement>('input').forEach(i => { i.onchange = upd; });
    this.page.querySelectorAll<HTMLElement>('[data-stab]').forEach(b => { b.onclick = () => {
      this.setTab = b.dataset.stab as typeof this.setTab;
      this.page.querySelectorAll<HTMLElement>('[data-stab]').forEach(x => x.classList.toggle('primary', x === b));
      this.page.querySelectorAll<HTMLElement>('[data-pane]').forEach(x => x.classList.toggle('hidden', x.dataset.pane !== this.setTab));
    }; });
    (this.page.querySelector('#set-volume') as HTMLInputElement).oninput = upd;
    (this.page.querySelector('#set-mvolume') as HTMLInputElement).oninput = upd;
    (this.page.querySelector('#set-master') as HTMLInputElement).oninput = upd;
    (this.page.querySelector('#set-volume') as HTMLInputElement).onchange = () => { upd(); play('dice', 0.8); };
  }

  showMaps(selected = loadMapId()) {
    // as duas campanhas: CBT Clássico e Beyond the Grave (o mapa mostrado é da edição da aba)
    const camp = (this.tab ? this.libEd === 'btg' : BTG_MAP_IDS.has(getMap(selected).id)) ? CAMPAIGN_BTG : CAMPAIGN;
    const m = camp.some(c => c.map?.id === selected) ? getMap(selected) : camp.find(c => c.map)!.map!;
    const groups = [...new Set(camp.map(c => c.circle))].map(circle => ({ head: circle, list: camp.filter(c => c.circle === circle) }));
    const list = groups.map(({ head, list: items }) => `<div class="mc-group">${head}</div>` + items.map(c => {
      const sel = c.map?.id === m.id;
      return `<div class="mapcard ${c.map ? 'playable' : 'locked'} ${sel ? 'sel' : ''}" ${c.map ? `data-map="${c.map.id}"` : ''}>
        ${c.map ? `<img class="mc-thumb" src="${mapArtUrl(c.map.id)}" alt="" loading="lazy"/>` : ''}<div class="mc-name">${c.name}${c.map ? ` ${difficultyBadge(c.map)}` : ''}</div>
      </div>`;
    }).join('')).join('');
    this.open(this.tab ? 'Biblioteca' : 'Mapas', `
      <div class="maps">
        <div class="maplist">${list}</div>
        <div class="mapdetail">${mapSheet(m)}</div>
      </div>`);
    paintMapSheets(this.page);
    this.page.querySelectorAll<HTMLElement>('[data-map]').forEach(el => { el.onclick = () => { const y = this.page.scrollTop; this.showMaps(el.dataset.map!); this.page.scrollTop = y; }; });
  }
}

export { drawMinimap } from './mapInfo';

const RULES_BTG_HTML = `<div class="rules">
  <section><h3>Beyond the Grave</h3><p>O Rei Pavoroso se ergueu! Campanha de 9 cenários: 5 no Círculo Exterior, 3 no Interior e o Confronto Final no Mausoléu Profano. Valem todas as regras do CBT Clássico, mais as abaixo.</p></section>
  <section><h3>Cartas de Lápide 🪦</h3><p>Ficam em pé em Espaços do mapa. Um Herói no Espaço gasta <b>1 Ponto de Movimento</b> para revelar — mesmo com Inimigos no Espaço e sem provocar Reação de Alerta. O efeito acontece na hora (moedas, cura, movimento, ativar um Monstro…).</p></section>
  <section><h3>Banimento</h3><p>Personagem banido vai para o <b>Tabuleiro de Entrada</b> com os seus Ferimentos e marcadores. Monstros voltam pela Entrada de Monstros; Heróis voltam quando a Guilda Descansa.</p></section>
  <section><h3>Fantasma</h3><p>Atravessa paredes e portas fechadas, e está <b>Perto</b> dos Espaços vizinhos mesmo através delas.</p></section>
  <section><h3>Enorme</h3><p>O <b>Rei Pavoroso</b> ocupa o Espaço inteiro (conta como 2 personagens) e empurra quem estiver no caminho.</p></section>
  <section><h3>Necromante</h3><p>Antes de atacar, traz de volta um Monstro do Tabuleiro de Entrada para Perto dele.</p></section>
  <section><h3>Heróis novos</h3><p><b>Chaz</b>: +2 dados em ataques Próximos enquanto não estiver ferido. <b>Darryn</b>: +1 dado contra alvos sem Ferimentos.</p></section>
</div>`;

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
  <section><h3>Controles</h3><p>Clique: ativar / mover / atacar · arrastar: câmera · roda: zoom · <b>1-4</b> carta · <b>Espaço</b> rola os dados · <b>Enter</b> encerra o turno · <b>R</b> descansar · <b>C</b> mapa inteiro · <b>F</b> focar Herói · <b>Esc</b> menu. Clique numa Missão para ver os objetivos no mapa.</p></section>
</div>`;
