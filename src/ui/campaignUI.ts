import { gameConfirm } from './dialog';
import {
  useCampaignNames,
  CIRCLES, CIRCLE_NEED, STARTER_CARDS, type CampaignState, aiChoice, draftHero, finishEquip, voteMap, availableScenarios, draftPick, finishArrange, finishBuy, guildName,
  guildOf, heroSlots, human, loadCampaign, medals, newCampaign, progress, saveCampaign, scenarioLevel, scenarioNumber,
  validateInventory, victoryRank,
} from '../campaign/campaign';
import { CARDS, CURSES } from '../engine/cards';
import { GUILDS, HEROES } from '../engine/data';
import { CAMPAIGN, MAPS, difficultyBadge } from '../engine/maps';
import { TITLES, TITLE_TEXT } from '../engine/titles';
import { drawFace } from '../render/chibi';
import { heroCard, itemCard, paintCardArt } from './cardview';
import { attachMapPeek, closeMapPeek, mapChoiceCard } from './mapInfo';
import { bindInvEditor, invEditorHtml, poolErrors, type InvItem, type InvOptions } from './inventoryEditor';
import { fmtTime, getSettings } from './settings';
import type { MenuPages } from './menu';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Carta de item (mesmo visual da Biblioteca, cor pelo nível). */
export function cardHtml(id: string, extra = '', attrs = ''): string {
  return itemCard(id, extra, attrs);
}

export class CampaignUI {
  private page: HTMLElement;
  private home: HTMLElement;
  private pages: MenuPages;
  c: CampaignState | null = loadCampaign();
  /** Começa um cenário (main.ts cria a partida). */
  onPlay: (mapId: string) => void = () => {};
  private sel = new Set<string>();

  constructor(menu: HTMLElement, pages: MenuPages) {
    this.pages = pages;
    this.home = menu.querySelector('.menu-box') as HTMLElement;
    this.page = document.createElement('div');
    this.page.className = 'menu-page camp hidden';
    menu.append(this.page);
  }

  close() { this.page.classList.add('hidden'); this.home.classList.remove('hidden'); }

  private lastTitle = '';
  private show(title: string, body: string, back = true) {
    this.home.classList.add('hidden');
    const same = title === this.lastTitle && !this.page.classList.contains('hidden');
    const y = this.page.scrollTop;
    this.lastTitle = title;
    this.page.classList.remove('hidden');
    this.page.innerHTML = `<div class="mp-head">${back ? '<button class="mp-back">← Menu</button>' : ''}<h2>${title}</h2></div><div class="mp-body">${body}</div>`;
    const b = this.page.querySelector('.mp-back') as HTMLElement | null;
    if (b) b.onclick = () => this.close();
    closeMapPeek();
    attachMapPeek(this.page);
    this.page.scrollTop = same ? y : 0;
  }

  private save() { saveCampaign(this.c); }

  /** Entrada: continua a campanha salva ou mostra a criação. */
  open() {
    this.c = loadCampaign();
    if (!this.c) return this.editions();
    useCampaignNames(this.c);
    if (this.c.phase === 'setup') return this.setupFlow();
    if (this.c.phase === 'upgrade') return this.upgrade();
    if (this.c.phase === 'done') return this.final();
    this.hub();
  }

  // ---------------------------------------------------------------- criação
  /** Escolha da edição da campanha (só a Clássica existe por enquanto). */
  private editions() {
    const eds = [
      { id: 'classic', name: 'CBT', sub: 'Clássico', icon: '⚔️', text: 'A campanha original: 11 cenários pela cidade de Arcadia, do Círculo Exterior ao Templo do Amanhecer Crepuscular.', ok: true },
      { id: 'inferno', name: 'CBT Inferno', sub: 'Em breve', icon: '🔥', text: 'Nova campanha com novos cenários. Em desenvolvimento.', ok: false },
      { id: 'grave', name: 'CBT Beyond the Grave', sub: 'Em breve', icon: '💀', text: 'Nova campanha com novos cenários. Em desenvolvimento.', ok: false },
    ];
    this.show('Nova Campanha', `<div class="ed-list">${eds.map(e => `<button class="ed-card ed-${e.id} ${e.ok ? '' : 'soon'}" data-ed="${e.id}" ${e.ok ? '' : 'disabled'}>
        <span class="ed-icon">${e.icon}</span><b>${e.name}</b><span class="ed-sub">${e.ok ? e.sub : '🔒 Em breve'}</span><small>${e.text}</small></button>`).join('')}</div>`);
    this.page.querySelectorAll<HTMLElement>('[data-ed="classic"]').forEach(b => { b.onclick = () => this.setup(); });
  }

  private setup() {
    this.show('Nova Campanha', `
      <div class="cp-box">
        <p>Uma campanha tem <b>6 cenários</b>: 3 do <b>Círculo Exterior</b>, 2 do <b>Círculo Interior</b> e o <b>Confronto Final</b>.</p>
        <ol class="cp-steps">
          <li><b>Recrutamento:</b> cada jogador recebe uma mão de Heróis, escolhe 1 e passa o resto para a esquerda, até todos terem 3.</li>
          <li><b>Votação:</b> todos votam no primeiro cenário (empate = sorteio).</li>
          <li><b>Equipamento inicial:</b> distribua as 5 cartas iniciais entre seus Heróis.</li>
          <li><b>Posicionamento:</b> coloque seus Heróis na Área Inicial e comece.</li>
        </ol>
        <p>Entre os cenários: <b>Maldições Mortais</b>, <b>Fase de Melhorias</b> e <b>Títulos</b>. O vencedor de cada cenário escolhe o próximo.</p>
        <label class="lb-field">Nome da sua Guilda <input id="cp-name" maxlength="20" placeholder="Azul (opcional)"/></label>
        <label class="lb-field">Dificuldade da IA <select id="cp-ai"><option value="normal">Normal</option><option value="hard" ${getSettings().ai === 'hard' ? 'selected' : ''}>Difícil</option></select></label>
        <label class="set-opt"><input type="checkbox" id="cp-cap"/> <b>Dados ilimitados</b> — sem limite de dados por rolagem (o padrão é no máximo 8 dados de ataque e 6 de defesa, contando críticos e rerrolagens, como os dados físicos da caixa)</label>
        <label class="lb-field">Adversários (IA) <select id="cp-opp"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option></select></label>
        <button class="primary cp-big" id="cp-start">🏰 Começar campanha</button>
      </div>`);
    (this.page.querySelector('#cp-start') as HTMLElement).onclick = () => {
      const n = Number((this.page.querySelector('#cp-opp') as HTMLSelectElement).value);
      this.c = newCampaign(n, (this.page.querySelector('#cp-name') as HTMLInputElement).value, (this.page.querySelector('#cp-ai') as HTMLSelectElement).value as 'normal' | 'hard', (this.page.querySelector('#cp-cap') as HTMLInputElement).checked);
      this.c.chooser = human(this.c).id;
      this.save();
      this.setupFlow();
    };
  }

  /** Preparação: recrutamento, votação e equipamento inicial. */
  private pickHero: string | null = null;
  private equipItems: InvItem[] | null = null;
  setupFlow() {
    const c = this.c!;
    const st = c.setup!;
    const me = human(c);
    const guildsHtml = c.guilds.map(g => `<div class="cp-mini" style="--gc:${GUILDS[g.id].color}"><span class="dot" style="background:${GUILDS[g.id].color}"></span><b>${guildName(g.id)}</b> ${g.controller === 'human' ? '(você)' : '(IA)'}: ${g.heroes.map(h => HEROES[h].name).join(', ') || '—'}</div>`).join('');
    if (st.step === 'draft') {
      const hand = st.hands[me.id]!;
      if (this.pickHero && !hand.includes(this.pickHero)) this.pickHero = null;
      this.show('Campanha · Recrutamento de Heróis', `
        <div class="cp-step"><h3>Rodada ${st.round + 1} de 3 — escolha 1 Herói</h3>
        <p>As cartas que sobrarem passam para o jogador à esquerda (as IAs escolhem ao mesmo tempo).</p>
        <div class="hgrid cards3">${hand.map(h => heroCard(h, this.pickHero === h ? 'picked' : '', `data-h="${h}"`)).join('')}</div>
        <button class="primary cp-big" id="cp-ok" ${this.pickHero ? '' : 'disabled'}>Escolher ${this.pickHero ? HEROES[this.pickHero].name : ''}</button>
        <h4>Guildas</h4>${guildsHtml}</div>`);
      paintCardArt(this.page);
      this.page.querySelectorAll<HTMLElement>('[data-h]').forEach(el => {
        el.onclick = () => { this.pickHero = el.dataset.h!; this.setupFlow(); };
      });
      (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => {
        const round = st.round;
        draftHero(c, this.pickHero!);
        this.pickHero = null;
        this.save();
        // todas as Guildas escolheram ao mesmo tempo: mostra as escolhas e passa as mãos para a esquerda
        this.show('Campanha · Recrutamento de Heróis', `
          <div class="cp-step cp-wait"><h3>Rodada ${round + 1} de 3 — todos escolheram</h3>
          <div class="cp-picks">${c.guilds.map(g => `<div class="cp-mini" style="--gc:${GUILDS[g.id].color}"><span class="dot" style="background:${GUILDS[g.id].color}"></span><b>${guildName(g.id)}</b> ${g.controller === 'human' ? '(você)' : '(IA)'} escolheu <b>${HEROES[g.heroes[round]]?.name ?? '—'}</b></div>`).join('')}</div>
          <p>${round < 2 ? '↻ Passando as cartas restantes para o jogador à esquerda…' : 'Recrutamento concluído.'}</p></div>`);
        setTimeout(() => { if (this.c === c && c.setup) this.setupFlow(); }, 1400);
      };
      return;
    }
    if (st.step === 'vote') {
      const av = availableScenarios(c);
      if (!st.votes) {
        this.show('Campanha · Votação do mapa', `
          <div class="cp-step"><h3>Vote no primeiro cenário</h3>
          <p>Todos votam; se empatar, o mapa é sorteado entre os mais votados. (Recomendado para iniciantes: Distrito dos Martelos.)</p>
          <div class="cp-votes">${av.map(id => mapChoiceCard(MAPS[id], { attrs: `data-v="${id}"`, sub: MAPS[id].missions.pve.map(m => m.name).join(' · ') })).join('')}</div>
          <h4>Guildas</h4>${guildsHtml}</div>`);
        this.page.querySelectorAll<HTMLElement>('[data-v]').forEach(el => {
          el.onclick = () => { voteMap(c, el.dataset.v!); this.save(); this.setupFlow(); };
        });
        return;
      }
      this.show('Campanha · Votação do mapa', `
        <div class="cp-step"><h3>Resultado: ${MAPS[st.map!].name}</h3>
        ${st.tie ? `<p>Empate entre ${st.tie.map(id => MAPS[id].name).join(' e ')} — sorteado: <b>${MAPS[st.map!].name}</b>.</p>` : ''}
        <table class="cp-vtable">${c.guilds.map(g => `<tr><td><span class="dot" style="background:${GUILDS[g.id].color}"></span> ${guildName(g.id)}</td><td>${MAPS[st.votes![g.id]!].name}</td></tr>`).join('')}</table>
        <button class="primary cp-big" id="cp-ok">Continuar ▶</button></div>`);
      (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => { st.step = 'equip'; this.save(); this.setupFlow(); };
      return;
    }
    // equipamento inicial: os espaços de cada Herói; clique num espaço ou numa carta para escolher
    if (!this.equipItems) {
      const order = me.heroes.slice();
      this.equipItems = STARTER_CARDS.map((cid, i) => ({ id: cid, to: order[i % order.length] }));
    }
    const items = this.equipItems;
    const inv = Object.fromEntries(me.heroes.map(h => [h, items.filter(x => x.to === h).map(x => x.id)]));
    const errs = [...validateInventory(c, me, inv), ...poolErrors(items, false)];
    const opts: InvOptions = { heroes: me.heroes, color: GUILDS[me.id].color, discard: false, slots: (h, cards) => heroSlots(c, me, h, cards), curse: h => me.curses[h] ? CURSES[me.curses[h]].name : null };
    this.show('Campanha · Equipamento inicial', `
      <div class="cp-step"><h3>Equipe seus Heróis</h3>
      <p>Clique num <b>espaço vazio</b> ou numa <b>carta</b> para escolher qual carta vai nele (trocar entre Heróis também). Mapa: <b>${MAPS[st.map!].name}</b>.</p>
      ${invEditorHtml(items, opts)}
      ${errs.length ? `<div class="lb-warn">${errs.join('<br/>')}</div>` : ''}
      <button class="primary cp-big" id="cp-ok" ${errs.length ? 'disabled' : ''}>Equipar e ir para o mapa ▶</button></div>`);
    bindInvEditor(this.page, items, opts, () => this.setupFlow());
    (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => {
      const map = st.map!;
      if (finishEquip(c, inv).length) return;
      this.equipItems = null;
      this.save();
      this.onPlay(map);
    };
  }

  // ---------------------------------------------------------------- painel da campanha
  hub() {
    const c = this.c!;
    const pr = progress(c);
    const av = availableScenarios(c);
    const me = human(c);
    const voted = !c.played.length && c.voted && av.includes(c.voted) ? c.voted : null;
    const chooserIsMe = c.chooser === me.id && !voted;
    const aiPick = voted ?? (chooserIsMe ? null : aiChoice(c));
    const circles = CIRCLES.map(ci => {
      const items = CAMPAIGN.filter(s => s.circle === ci).map(s => {
        const res = s.map ? c.played.find(p => p.mapId === s.map!.id) : null;
        const can = s.map && av.includes(s.map.id);
        const status = res ? `<span class="cp-done" style="--gc:${GUILDS[res.winner].color}">✓ ${guildName(res.winner)}</span>` : !s.map ? '<span class="mc-soon">Em breve</span>' : can ? '<span class="mc-ok">Disponível</span>' : '<span class="mc-soon">—</span>';
        return `<div class="cp-scen ${can ? 'can' : ''} ${aiPick === s.map?.id ? 'ai-pick' : ''}" ${can && chooserIsMe ? `data-map="${s.map!.id}"` : ''} ${s.map ? `data-peek="${s.map.id}"` : ''}><b>${s.name}</b>${s.map ? difficultyBadge(s.map, can ? scenarioLevel(c) : undefined) : ''}${status}</div>`;
      }).join('');
      return `<div class="cp-circle"><h3>${ci} <small>${pr[ci]}/${CIRCLE_NEED[ci]}</small></h3>${items}</div>`;
    }).join('');
    const guilds = c.guilds.map(g => `
      <div class="cp-guild" style="--gc:${GUILDS[g.id].color}">
        <div class="cp-gh"><span class="dot" style="background:${GUILDS[g.id].color}"></span><b>${guildName(g.id)}</b> ${g.controller === 'human' ? '<span class="tag-me">você</span>' : '<span class="tag-host">IA</span>'}
          ${g.saved ? `<span>🪙 ${g.saved} guardada</span>` : ''}</div>
        ${g.titles.length ? `<div class="cp-titles">${g.titles.map(t => `<span title="${esc(TITLE_TEXT[t] ?? '')}">🏅 ${TITLES[t] ?? t}</span>`).join('')}</div>` : ''}
        <div class="cp-heroes">${g.heroes.map(h => `<div class="cp-hero"><canvas width="44" height="44" data-face="${h}" data-color="${GUILDS[g.id].color}"></canvas>
          <div><b>${HEROES[h].name}</b>${g.curses[h] ? ` <span class="cp-curse" title="${esc(CURSES[g.curses[h]].text)}">☠ ${CURSES[g.curses[h]].name}</span>` : ''}
          <div class="cp-inv">${(g.inventory[h] ?? []).map(id => `<span title="${esc(CARDS[id]?.text ?? '')}">${CARDS[id]?.name ?? id}</span>`).join('') || '<i>sem cartas</i>'}</div></div></div>`).join('')}</div>
      </div>`).join('');
    const n = scenarioNumber(c);
    this.show('Campanha', `
      <div class="cp-top">
        <div><b>Próximo: ${n}º cenário</b> · Monstros Nível ${scenarioLevel(c)}</div>
        <div>${voted ? `Mapa escolhido na votação: <b>${MAPS[voted].name}</b>.` : chooserIsMe ? 'Você venceu o último cenário: <b>escolha o próximo</b>.' : `A ${guildName(c.chooser)} venceu o último cenário e escolheu <b>${aiPick ? MAPS[aiPick].name : '—'}</b>.`}</div>
        <div title="Tempo total jogado na campanha">🏰 ${fmtTime(c.elapsed ?? 0)}</div>
        ${!chooserIsMe && aiPick ? `<button class="primary" id="cp-go">▶ Jogar ${MAPS[aiPick].name}</button>` : ''}
        <button id="cp-reset" class="cp-reset">Abandonar campanha</button>
      </div>
      <div class="cp-grid"><div class="cp-circles">${circles}</div><div class="cp-guilds">${guilds}</div></div>`);
    this.page.querySelectorAll<HTMLCanvasElement>('[data-face]').forEach(cv => drawFace(cv, cv.dataset.face!, cv.dataset.color!));
    this.page.querySelectorAll<HTMLElement>('[data-map]').forEach(el => { el.onclick = () => this.onPlay(el.dataset.map!); });
    const go = this.page.querySelector('#cp-go') as HTMLElement | null;
    if (go && aiPick) go.onclick = () => this.onPlay(aiPick);
    (this.page.querySelector('#cp-reset') as HTMLElement).onclick = async () => {
      if (!await gameConfirm({ icon: '🏳️', title: 'Abandonar a campanha?', body: 'Todo o progresso da campanha atual (Heróis, cartas, moedas e cenários jogados) será perdido.', yes: 'Abandonar', no: 'Voltar', danger: true })) return;
      this.c = null; this.save(); this.editions();
    };
  }

  // ---------------------------------------------------------------- Fase de Melhorias
  upgrade() {
    const c = this.c!;
    const up = c.upgrade!;
    const me = human(c);
    const last = c.played[c.played.length - 1];
    const results = `<div class="cp-results"><h3>Resultado: ${MAPS[last.mapId].name}</h3>
      <table><tr><th>Guilda</th><th>Missões</th><th>Mortes</th><th>Moedas</th></tr>
      ${last.guilds.map(r => `<tr class="${r.id === last.winner ? 'win' : ''}"><td><span class="dot" style="background:${GUILDS[r.id].color}"></span> ${guildName(r.id)}${r.id === last.winner ? ' 🏆' : ''}</td><td>${r.missions}</td><td>${r.deaths}</td><td>${r.coins}</td></tr>`).join('')}</table>
      ${up.cursesDrawn.length ? `<h4>Maldições Mortais</h4><div class="cp-curses">${up.cursesDrawn.map(x => `<div><span class="dot" style="background:${GUILDS[x.guild].color}"></span> ${HEROES[x.hero].name}: comprou ${x.drawn.map(d => CURSES[d].name).join(', ')} → <b>${CURSES[x.kept].name}</b> <small>${esc(CURSES[x.kept].text)}</small></div>`).join('')}</div>` : ''}
    </div>`;
    if (up.step === 'draft') {
      const hand = up.hands[me.id]!;
      this.sel = new Set([...this.sel].filter(i => Number(i) < hand.length));
      this.show(`Fase de Melhorias · Nível ${up.level}`, `${results}
        <div class="cp-step"><h3>1. Escolha de cartas — rodada ${up.round + 1} de 3</h3>
        <p>Escolha <b>2 cartas</b> da sua mão. O resto passa para o jogador à esquerda (as IAs fazem o mesmo). No fim você terá 6 cartas para comprar.</p>
        <div class="cp-cards">${hand.map((id, i) => cardHtml(id, this.sel.has(`${i}`) ? 'sel' : '', `data-i="${i}"`)).join('')}</div>
        ${up.picked[me.id]!.length ? `<h4>Já escolhidas</h4><div class="cp-cards small">${up.picked[me.id]!.map(id => cardHtml(id)).join('')}</div>` : ''}
        <button class="primary cp-big" id="cp-ok" ${this.sel.size === Math.min(2, hand.length) ? '' : 'disabled'}>Confirmar escolha</button></div>`, false);
      this.page.querySelectorAll<HTMLElement>('[data-i]').forEach(el => {
        el.onclick = () => { const k = el.dataset.i!; if (this.sel.has(k)) this.sel.delete(k); else if (this.sel.size < 2) this.sel.add(k); this.upgrade(); };
      });
      (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => {
        const ids = [...this.sel].map(i => hand[Number(i)]);
        this.sel.clear();
        draftPick(c, ids);
        this.save();
        this.upgrade();
      };
      return;
    }
    if (up.step === 'buy') {
      const coins = up.coins[me.id] ?? 0;
      const picked = up.picked[me.id]!;
      const spent = [...this.sel].reduce((s, i) => s + CARDS[picked[Number(i)]].cost, 0);
      this.show(`Fase de Melhorias · Nível ${up.level}`, `${results}
        <div class="cp-step"><h3>2. Compra — você tem 🪙 ${coins}</h3>
        <p>Compre até <b>3 cartas</b>. Sobrando moedas, só <b>1</b> fica guardada para a próxima Fase de Melhorias.</p>
        <div class="cp-cards">${picked.map((id, i) => cardHtml(id, this.sel.has(`${i}`) ? 'sel' : '', `data-i="${i}"`)).join('')}</div>
        <div class="cp-sum">Selecionadas: ${this.sel.size}/3 · Custo: 🪙 ${spent} ${spent > coins ? '<b class="bad">— moedas insuficientes</b>' : ''}</div>
        <button class="primary cp-big" id="cp-ok" ${spent <= coins ? '' : 'disabled'}>Comprar e continuar</button></div>`, false);
      this.page.querySelectorAll<HTMLElement>('[data-i]').forEach(el => {
        el.onclick = () => { const k = el.dataset.i!; if (this.sel.has(k)) this.sel.delete(k); else if (this.sel.size < 3) this.sel.add(k); this.upgrade(); };
      });
      (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => {
        finishBuy(c, me, [...this.sel].map(i => picked[Number(i)]));
        this.sel.clear();
        up.step = 'arrange';
        this.save();
        this.arrange();
      };
      return;
    }
    this.arrange();
  }

  /** Distribuição das cartas entre os Heróis (4 espaços cada, máx. 12 na Guilda). */
  private arrangeState: { id: string; to: string }[] | null = null;
  private arrange() {
    const c = this.c!;
    const up = c.upgrade!;
    const me = human(c);
    if (!this.arrangeState) {
      this.arrangeState = [
        ...me.heroes.flatMap(h => (me.inventory[h] ?? []).map(id => ({ id, to: h }))),
        // compradas: entram num Herói com espaço; senão ficam "sem Herói" para você escolher
        ...(up.bought[me.id] ?? []).map(id => ({ id, to: me.heroes.find(h => heroSlots(c, me, h).used < 4) ?? 'pool' })),
      ];
    }
    const st = this.arrangeState;
    const inv = Object.fromEntries(me.heroes.map(h => [h, st.filter(x => x.to === h).map(x => x.id)]));
    const errs = [...validateInventory(c, me, inv), ...poolErrors(st, true)];
    const opts: InvOptions = { heroes: me.heroes, color: GUILDS[me.id].color, discard: true, slots: (h, cards) => heroSlots(c, me, h, cards), curse: h => me.curses[h] ? CURSES[me.curses[h]].name : null };
    this.show('Fase de Melhorias · Inventário', `
      <div class="cp-step"><h3>3. Equipe seus Heróis</h3>
      <p>Clique num <b>espaço vazio</b> ou numa <b>carta</b> para escolher a carta (troca entre Heróis, tira ou descarta). Cada Herói tem 4 espaços (o Tomo da Iluminação dá +2 para Mágicas; algumas Maldições ocupam 1). Até 12 cartas na Guilda; 1 armadura por Herói; 1 Bomba por Guilda.</p>
      ${invEditorHtml(st, opts)}
      ${errs.length ? `<div class="lb-warn">${errs.join('<br/>')}</div>` : ''}
      <button class="primary cp-big" id="cp-ok" ${errs.length ? 'disabled' : ''}>Concluir Fase de Melhorias</button></div>`, false);
    bindInvEditor(this.page, st, opts, () => this.arrange());
    (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => {
      const e = finishArrange(c, inv);
      if (e.length) return;
      this.arrangeState = null;
      this.save();
      this.hub();
    };
  }

  // ---------------------------------------------------------------- fim
  final() {
    const c = this.c!;
    const last = c.played[c.played.length - 1];
    const ms = medals(c);
    const count = (id: string) => ms.filter(m => m.winners.includes(id as never)).length;
    const winner = last.winner;
    const rank = victoryRank(count(winner));
    this.show('Fim da Campanha', `
      <div class="cp-final" style="--gc:${GUILDS[winner].color}">
        <div class="go-title">Arcadia está livre! 🏆 ${guildName(winner)}</div>
        <div class="cp-rank"><b>${rank.title}</b> — ${rank.text}</div>
        <table><tr><th>Medalha</th><th>Guilda(s)</th></tr>${ms.map(m => `<tr><td>🎖 ${m.name}</td><td>${m.winners.map(g => `<span class="dot" style="background:${GUILDS[g].color}"></span> ${guildName(g)}`).join(', ') || '—'}</td></tr>`).join('')}</table>
        <h4>Cenários</h4>
        <ol>${c.played.map(p => `<li>${MAPS[p.mapId].name} — ${guildName(p.winner)}${p.ms ? ` <small>(${fmtTime(p.ms)})</small>` : ''}</li>`).join('')}</ol>
        <p>Tempo total da campanha: <b>${fmtTime(c.elapsed ?? 0)}</b></p>
        <p>Medalhas: ${c.guilds.map(g => `${guildName(g.id)} ${count(g.id)}`).join(' · ')}</p>
        <button class="primary cp-big" id="cp-new">Nova campanha</button>
      </div>`);
    (this.page.querySelector('#cp-new') as HTMLElement).onclick = () => { this.c = null; this.save(); this.editions(); };
  }

  /** Chamado ao terminar um cenário da campanha. */
  afterScenario() {
    this.save();
    if (this.c!.phase === 'setup') this.setupFlow();
    else if (this.c!.phase === 'done') this.final();
    else if (this.c!.phase === 'upgrade') this.upgrade();
    else this.hub();
  }

  guildOf(id: Parameters<typeof guildOf>[1]) { return guildOf(this.c!, id); }
}
