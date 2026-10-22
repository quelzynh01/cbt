import { gameConfirm } from './dialog';
import type { GuildId } from '../engine/types';
import { play } from '../audio/sfx';
import {
  useCampaignNames,
  CIRCLES, CIRCLE_NEED, STARTER_CARDS, type CampaignState, aiChoice, draftHero, finishEquip, voteMap, availableScenarios, draftPick, finishArrange, finishBuy, guildName,
  guildOf, heroSlots, human, picksPerRound, draftRounds, loadCampaign, medals, newCampaign, nextScenario, progress, saveCampaign, scenarioLevel, scenarioNumber,
  validateInventory, victoryRank,
} from '../campaign/campaign';
import { CARDS, CURSES } from '../engine/cards';
import { GUILDS, HEROES, HERO_SETS, heroSetName, starterCards, type HeroSet } from '../engine/data';
import { MAPS, campaignList, difficultyBadge, type Edition } from '../engine/maps';
import { TITLES, TITLE_TEXT } from '../engine/titles';
import { drawFace } from '../render/chibi';
import { curseCard, heroCard, itemCard, paintCardArt } from './cardview';
import { CARD_ART } from './cardArt';
import { buyHint, buySummaryHtml, curseRevealHtml, curseSummaryHtml } from './upgradeViews';
import { attachMapPeek, closeMapPeek, mapChoiceCard } from './mapInfo';
import { bindInvEditor, invEditorHtml, poolErrors, type InvItem, type InvOptions } from './inventoryEditor';
import { fmtTime, getSettings } from './settings';
import type { MenuPages } from './menu';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Carta de item (mesmo visual da Biblioteca, cor pelo nível). */
export function cardHtml(id: string, extra = '', attrs = ''): string {
  return itemCard(id, extra, attrs);
}

/** Maldição do Herói no editor de cartas (as que ocupam espaço cobrem a 4ª carta, p.24). */
const curseLabel = (id?: string) => {
  const c = id ? CURSES[id] : null;
  return c ? `${c.name} — ${c.text}${c.slot ? ' Com 4 cartas, a última fica debaixo da Maldição (indisponível até uma Poção de Cura).' : ''}` : null;
};

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
    if (!this.c) return this.setup();
    useCampaignNames(this.c);
    if (this.c.phase === 'setup') return this.setupFlow();
    if (this.c.phase === 'upgrade') return this.upgrade();
    if (this.c.phase === 'done') return this.final();
    this.hub();
  }

  // ---------------------------------------------------------------- criação
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
        <div class="cp-cfgrow"><span class="lb-sum" id="cp-cfgsum"></span><button id="cp-cfg">⚙️ Configurações da partida</button></div>
        <button class="primary cp-big" id="cp-start">🏰 Começar campanha</button>
      </div>`);
    const cfg = this.cfg;
    const sum = () => {
      (this.page.querySelector('#cp-cfgsum') as HTMLElement).textContent = [cfg.edition === 'btg' ? '💀 CBT Beyond the Grave' : '⚔️ CBT Clássico', heroSetName(cfg.heroSet),
        `IA ${cfg.ai === 'hard' ? 'Difícil' : 'Normal'}`, `${cfg.opp} adversário${cfg.opp > 1 ? 's' : ''}`, cfg.diceCap ? 'Limite de dados' : 'Dados ilimitados', cfg.pickOne ? 'Pegar 1 carta' : 'Pegar 2 cartas'].join(' · ');
    };
    sum();
    (this.page.querySelector('#cp-cfg') as HTMLElement).onclick = () => this.matchSettings(sum);
    (this.page.querySelector('#cp-start') as HTMLElement).onclick = () => {
      this.c = newCampaign(cfg.opp, (this.page.querySelector('#cp-name') as HTMLInputElement).value, cfg.ai, cfg.diceCap, cfg.pickOne, cfg.heroSet, cfg.edition);
      this.c.chooser = human(this.c).id;
      this.save();
      this.setupFlow();
    };
  }

  /** Configurações da partida da nova campanha (padrão: Limite de dados, Pegar 1 carta e Apenas Core Heroes). */
  private cfg: { edition: Edition; heroSet: HeroSet; ai: 'normal' | 'hard'; opp: number; diceCap: boolean; pickOne: boolean } =
    { edition: 'classic', heroSet: 'core', ai: getSettings().ai === 'hard' ? 'hard' : 'normal', opp: 3, diceCap: true, pickOne: true };

  /** Janela "Configurações da partida" (igual à da sala online). */
  private matchSettings(done: () => void) {
    document.getElementById('matchcfg')?.remove();
    const el = document.createElement('div');
    el.id = 'matchcfg';
    const cfg = this.cfg;
    el.innerHTML = `<div class="mc-cfg">
        <div class="gd-title">⚙️ Configurações da partida</div>
        <label class="mcf-row">Campanha <select id="mc-ed"><option value="classic">⚔️ CBT Clássico</option><option value="btg" ${cfg.edition === 'btg' ? 'selected' : ''}>💀 CBT Beyond the Grave</option></select></label>
        <label class="mcf-row">Heróis <select id="mc-heroes">${HERO_SETS.map(([v, n]) => `<option value="${v}" ${cfg.heroSet === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="mcf-row">Dificuldade da IA <select id="mc-ai"><option value="normal">Normal</option><option value="hard" ${cfg.ai === 'hard' ? 'selected' : ''}>Difícil</option></select></label>
        <label class="mcf-row">Adversários (IA) <select id="mc-opp">${[1, 2, 3].map(n => `<option value="${n}" ${cfg.opp === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="set-opt"><input type="checkbox" id="mc-cap" ${cfg.diceCap ? 'checked' : ''}/> <b>Limite de dados</b> — no máximo 8 dados de ataque e 6 de defesa por rolagem (contando críticos e rerrolagens), como os dados físicos da caixa. Sem marcar, ilimitado.</label>
        <label class="set-opt"><input type="checkbox" id="mc-one" ${cfg.pickOne ? 'checked' : ''}/> <b>Pegar 1 carta</b> — na Fase de Melhorias cada um pega <b>1 carta</b> e passa o resto (6 rodadas), em vez de 2 cartas (3 rodadas).</label>
        <div class="gd-btns"><button class="primary" id="mc-ok">✔ Pronto</button></div>
      </div>`;
    const heroes = el.querySelector('#mc-heroes') as HTMLSelectElement;
    heroes.onchange = () => { cfg.heroSet = heroes.value as HeroSet; };
    // Beyond the Grave: Chaz e Darryn entram junto (dá para mudar em Heróis)
    (el.querySelector('#mc-ed') as HTMLSelectElement).onchange = e => {
      cfg.edition = (e.target as HTMLSelectElement).value as Edition;
      if (cfg.heroSet !== 'all') heroes.value = cfg.heroSet = cfg.edition === 'btg' ? 'btg' : 'core';
    };
    (el.querySelector('#mc-ai') as HTMLSelectElement).onchange = e => { cfg.ai = (e.target as HTMLSelectElement).value as 'normal' | 'hard'; };
    (el.querySelector('#mc-opp') as HTMLSelectElement).onchange = e => { cfg.opp = Number((e.target as HTMLSelectElement).value); };
    (el.querySelector('#mc-cap') as HTMLInputElement).onchange = e => { cfg.diceCap = (e.target as HTMLInputElement).checked; };
    (el.querySelector('#mc-one') as HTMLInputElement).onchange = e => { cfg.pickOne = (e.target as HTMLInputElement).checked; };
    const close = () => { el.remove(); done(); };
    (el.querySelector('#mc-ok') as HTMLElement).onclick = close;
    el.onpointerdown = e => { if (e.target === el) close(); };
    document.body.append(el);
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
      // Beyond the Grave: a Foice chega sem Herói; equipe 5 das 6 cartas e descarte 1
      this.equipItems = starterCards(c.edition).map((cid, i) => ({ id: cid, to: cid === 'foice' ? 'pool' : order[i % order.length] }));
    }
    const items = this.equipItems;
    const inv = Object.fromEntries(me.heroes.map(h => [h, items.filter(x => x.to === h).map(x => x.id)]));
    const errs = [...validateInventory(c, me, inv), ...poolErrors(items, false)];
    const btg = c.edition === 'btg';
    if (btg && items.filter(x => x.to === 'descartar').length !== 1 && !errs.length) errs.push('Descarte 1 das 6 cartas iniciais.');
    const opts: InvOptions = { heroes: me.heroes, color: GUILDS[me.id].color, discard: btg, slots: (h, cards) => heroSlots(c, me, h, cards), curse: h => curseLabel(me.curses[h]) };
    this.show('Campanha · Equipamento inicial', `
      <div class="cp-step"><h3>Equipe seus Heróis</h3>
      <p>Clique num <b>espaço vazio</b> ou numa <b>carta</b> para escolher qual carta vai nele (trocar entre Heróis também). Mapa: <b>${MAPS[st.map!].name}</b>.</p>
      ${btg ? '<p class="lb-note">💀 <b>Beyond the Grave:</b> além das 5 cartas iniciais você recebe a <b>Foice</b>, mas a Guilda fica só com 5 — equipe 5 e <b>descarte 1</b>.</p>' : ''}
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
    // o próximo mapa fica salvo assim que é escolhido (votação, você ou a IA): sair e voltar não muda
    const next = nextScenario(c);
    this.save();
    const myChoice = !next && c.chooser === me.id;
    const n = scenarioNumber(c);
    const why = !c.played.length ? 'Escolhido na votação.' : c.chooser === me.id ? 'Você venceu o último cenário e escolheu.' : `A ${guildName(c.chooser)} venceu o último cenário e escolheu.`;
    const nextHtml = next
      ? `<div class="hub-nextmap">${mapChoiceCard(MAPS[next], { cls: 'big', level: scenarioLevel(c), sub: MAPS[next].missions.pve.map(m => m.name).join(' · ') })}
          <div class="hub-nextinfo"><p>${why}</p><button class="primary cp-big" id="cp-go">▶ Jogar ${MAPS[next].name}</button></div></div>`
      : myChoice
        ? `<p>Você venceu o último cenário: <b>escolha o próximo</b>. A escolha fica salva.</p>
           <div class="cp-votes hub-choices">${av.map(id => mapChoiceCard(MAPS[id], { attrs: `data-pick="${id}"`, level: scenarioLevel(c), sub: MAPS[id].missions.pve.map(m => m.name).join(' · ') })).join('')}</div>`
        : '<p class="muted">Nenhum cenário disponível.</p>';
    const curseImg = (id: string) => CARD_ART[`curse:${id}`] ? `<img src="${import.meta.env.BASE_URL}cards/${CARD_ART[`curse:${id}`].img}.webp" alt=""/>` : '💀';
    // cada Herói: retrato, Maldição e as cartas (2 em cima, 2 embaixo) — igual para a sua Guilda e as outras
    const heroesOf = (g: typeof me) => g.heroes.map(h => `<div class="hub-hero">
        <div class="hub-hh"><canvas width="56" height="56" data-face="${h}" data-color="${GUILDS[g.id].color}"></canvas><div><b>${HEROES[h].name}</b><small>${HEROES[h].title}</small></div></div>
        ${g.curses[h] ? `<div class="hub-curse" title="${esc(CURSES[g.curses[h]].text)}">${curseImg(g.curses[h])}<span>☠ <b>${CURSES[g.curses[h]].name}</b> — ${esc(CURSES[g.curses[h]].text)}</span></div>` : ''}
        <div class="hub-cards">${(g.inventory[h] ?? []).map(id => `<div class="hub-card" title="${esc(`${CARDS[id]?.name ?? id}: ${CARDS[id]?.text ?? ''}`)}">${itemCard(id)}</div>`).join('') || '<i class="muted">sem cartas</i>'}</div>
      </div>`).join('');
    const titles = (g: typeof me) => g.titles.length ? `<div class="cp-titles">${g.titles.map(t => `<span title="${esc(TITLE_TEXT[t] ?? '')}">🏅 ${TITLES[t] ?? t}</span>`).join('')}</div>` : '';
    const myHeroes = heroesOf(me);
    const others = c.guilds.filter(g => g.id !== me.id).map(g => `
      <section class="hub-sec hub-me" style="--gc:${GUILDS[g.id].color}">
        <h3><span class="dot" style="background:${GUILDS[g.id].color}"></span> ${guildName(g.id)} <small>(IA)</small>${g.saved ? ` <span class="hub-coin">🪙 ${g.saved} guardada</span>` : ''}</h3>
        ${titles(g)}
        <div class="hub-heroes">${heroesOf(g)}</div>
      </section>`).join('');
    const circles = CIRCLES.map(ci => {
      const items = campaignList(this.c!.edition).filter(sc => sc.circle === ci).map(sc => {
        const res = sc.map ? c.played.find(pl => pl.mapId === sc.map!.id) : null;
        const can = sc.map && av.includes(sc.map.id);
        const status = res ? `<span class="cp-done" style="--gc:${GUILDS[res.winner].color}">✓ ${guildName(res.winner)}</span>` : !sc.map ? '<span class="mc-soon">Em breve</span>' : sc.map.id === next ? '<span class="mc-ok">▶ Próximo</span>' : can ? '<span class="mc-ok">Disponível</span>' : '<span class="mc-soon">—</span>';
        return `<div class="cp-scen ${can ? 'can' : ''} ${sc.map?.id === next ? 'ai-pick' : ''}" ${sc.map ? `data-peek="${sc.map.id}"` : ''}><b>${sc.name}</b>${status}</div>`;
      }).join('');
      return `<div class="cp-circle"><h4>${ci} <small>${pr[ci]}/${CIRCLE_NEED[ci]}</small></h4>${items}</div>`;
    }).join('');
    this.show('Campanha', `
      <div class="cp-top">
        <div><b>${n}º cenário</b> · Monstros Nível ${scenarioLevel(c)}</div>
        <div title="Tempo total jogado na campanha">🏰 ${fmtTime(c.elapsed ?? 0)}</div>
        <button id="cp-reset" class="cp-reset">Abandonar campanha</button>
      </div>
      <div class="hub">
        <section class="hub-sec hub-next"><h3>🗺 Próximo cenário</h3>${nextHtml}</section>
        <section class="hub-sec hub-me" style="--gc:${GUILDS[me.id].color}">
          <h3><span class="dot" style="background:${GUILDS[me.id].color}"></span> ${guildName(me.id)} <small>(você)</small>${me.saved ? ` <span class="hub-coin">🪙 ${me.saved} guardada</span>` : ''}
            <button id="cp-org">🎒 Organizar meus itens</button></h3>
          ${me.titles.length ? `<div class="cp-titles">${me.titles.map(t => `<span title="${esc(TITLE_TEXT[t] ?? '')}">🏅 ${TITLES[t] ?? t}</span>`).join('')}</div>` : ''}
          <div class="hub-heroes">${myHeroes}</div>
        </section>
        ${others}
        <section class="hub-sec hub-prog"><h3>🏰 Campanha</h3><div class="hub-circles">${circles}</div></section>
      </div>`);
    paintCardArt(this.page);
    this.page.querySelectorAll<HTMLCanvasElement>('[data-face]').forEach(cv => drawFace(cv, cv.dataset.face!, cv.dataset.color!));
    this.page.querySelectorAll<HTMLElement>('[data-pick]').forEach(el => {
      el.onclick = async e => {
        if ((e.target as HTMLElement).closest('.mv-zoom')) return;
        const id = el.dataset.pick!;
        if (!await gameConfirm({ icon: '🗺', title: `Escolher ${MAPS[id].name}?`, body: 'Este será o próximo cenário da campanha (a escolha fica salva).', yes: 'Escolher', no: 'Voltar' })) return;
        c.next = id;
        this.save();
        this.hub();
      };
    });
    const go = this.page.querySelector('#cp-go') as HTMLElement | null;
    if (go && next) go.onclick = () => this.onPlay(next);
    (this.page.querySelector('#cp-org') as HTMLElement).onclick = () => this.organize();
    (this.page.querySelector('#cp-reset') as HTMLElement).onclick = async () => {
      if (!await gameConfirm({ icon: '🏳️', title: 'Abandonar a campanha?', body: 'Todo o progresso da campanha atual (Heróis, cartas, moedas e cenários jogados) será perdido.', yes: 'Abandonar', no: 'Voltar', danger: true })) return;
      this.c = null; this.save(); this.setup();
    };
    attachMapPeek(this.page);
  }

  /** Entre os cenários: reorganizar (ou descartar) as cartas entre os seus Heróis. */
  private orgState: InvItem[] | null = null;
  private organize() {
    const c = this.c!;
    const me = human(c);
    if (!this.orgState) this.orgState = me.heroes.flatMap(h => (me.inventory[h] ?? []).map(id => ({ id, to: h })));
    const st = this.orgState;
    const inv = Object.fromEntries(me.heroes.map(h => [h, st.filter(x => x.to === h).map(x => x.id)]));
    const errs = [...validateInventory(c, me, inv), ...poolErrors(st, true)];
    const opts: InvOptions = { heroes: me.heroes, color: GUILDS[me.id].color, discard: true, slots: (h, cards) => heroSlots(c, me, h, cards), curse: h => curseLabel(me.curses[h]) };
    this.show('Campanha · Organizar itens', `
      <div class="cp-step"><h3>🎒 Organize as cartas dos seus Heróis</h3>
      <p>Toque num <b>espaço vazio</b> ou numa <b>carta</b> para trocar entre os Heróis (ou descartar). Cada Herói tem 4 espaços; até 12 cartas na Guilda; 1 armadura por Herói.</p>
      ${invEditorHtml(st, opts)}
      ${errs.length ? `<div class="lb-warn">${errs.join('<br/>')}</div>` : ''}
      <div class="hub-orgbtns"><button id="cp-cancel">Cancelar</button><button class="primary cp-big" id="cp-ok" ${errs.length ? 'disabled' : ''}>✔ Salvar</button></div></div>`, false);
    bindInvEditor(this.page, st, opts, () => this.organize());
    (this.page.querySelector('#cp-cancel') as HTMLElement).onclick = () => { this.orgState = null; this.hub(); };
    (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => {
      if (validateInventory(c, me, inv).length) return;
      me.inventory = inv;
      this.orgState = null;
      this.save();
      this.hub();
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
    // antes das Melhorias: as Maldições Mortais (cartas viradas na mesa, um Herói de cada vez)
    if (!up.curseDone) { this.curses(); return; }
    // depois da compra: o que cada Guilda comprou e descartou
    if (up.buySummary) { this.buys(); return; }
    if (up.step === 'draft') {
      const hand = up.hands[me.id]!;
      this.sel = new Set([...this.sel].filter(i => Number(i) < hand.length));
      this.show(`Fase de Melhorias · Nível ${up.level}`, `${results}
        <div class="cp-step"><h3>1. Escolha de cartas — rodada ${up.round + 1} de ${draftRounds(c)}</h3>
        <p>Escolha <b>${picksPerRound(c) === 1 ? '1 carta' : '2 cartas'}</b> da sua mão. O resto passa para o jogador à esquerda (as IAs fazem o mesmo). No fim você terá 6 cartas para comprar.</p>
        <div class="cp-cards">${hand.map((id, i) => cardHtml(id, this.sel.has(`${i}`) ? 'sel' : '', `data-i="${i}"`)).join('')}</div>
        ${up.picked[me.id]!.length ? `<h4>Já escolhidas</h4><div class="cp-cards small">${up.picked[me.id]!.map(id => cardHtml(id)).join('')}</div>` : ''}
        <button class="primary cp-big" id="cp-ok" ${this.sel.size === Math.min(picksPerRound(c), hand.length) ? '' : 'disabled'}>Confirmar escolha</button></div>`, false);
      this.page.querySelectorAll<HTMLElement>('[data-i]').forEach(el => {
        el.onclick = () => { const k = el.dataset.i!; if (this.sel.has(k)) this.sel.delete(k); else if (this.sel.size < picksPerRound(c)) this.sel.add(k); this.upgrade(); };
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
        ${buyHint(picked, [...this.sel].map(Number), coins).html}
        <button class="primary cp-big" id="cp-ok" ${spent <= coins ? '' : 'disabled'}>Comprar e continuar</button></div>`, false);
      this.page.querySelectorAll<HTMLElement>('[data-i]').forEach(el => {
        el.onclick = () => { const k = el.dataset.i!; if (this.sel.has(k)) this.sel.delete(k); else if (this.sel.size < 3) this.sel.add(k); this.upgrade(); };
      });
      (this.page.querySelector('#cp-ok') as HTMLElement).onclick = async () => {
        const hint = buyHint(picked, [...this.sel].map(Number), coins);
        if (hint.more && !await gameConfirm({ icon: '🪙', title: 'Ainda dá para comprar!', body: hint.html, yes: 'Comprar assim mesmo', no: 'Voltar e escolher' })) return;
        finishBuy(c, me, [...this.sel].map(i => picked[Number(i)]));
        this.sel.clear();
        up.step = 'arrange';
        up.buySummary = true;
        this.save();
        this.upgrade();
      };
      return;
    }
    this.arrange();
  }

  // ---------------------------------------------------------------- Maldições Mortais (p.24)
  /** Um Herói de cada vez: as cartas compradas ficam viradas na mesa; quem joga vira (a IA vira sozinha) e todos veem.
   *  O Herói fica com a de maior valor; as outras voltam para o baralho. No fim, o resumo de quem ficou amaldiçoado. */
  private curseTimer = 0;
  private curses() {
    const c = this.c!;
    const up = c.upgrade!;
    const me = human(c);
    const list = up.cursesDrawn;
    const step = up.curseStep ?? 0;
    clearTimeout(this.curseTimer);
    const name = (g: GuildId) => guildName(g);
    if (step >= list.length) {
      this.show('Maldições Mortais · Resumo', `${curseSummaryHtml(c, name)}
        <div class="cp-step"><button class="primary cp-big" id="cp-ok">Continuar para as Melhorias ▶</button></div>`, false);
      paintCardArt(this.page);
      (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => { up.curseDone = true; this.save(); this.upgrade(); };
      return;
    }
    const cur = list[step];
    const flipped = Math.min(up.curseFlipped ?? 0, cur.drawn.length);
    const all = flipped >= cur.drawn.length;
    const mine = cur.guild === me.id;
    this.show('Maldições Mortais', `${curseRevealHtml(c, mine, name)}
      ${all ? `<div class="cp-step cr-step"><button class="primary cp-big" id="cp-ok">${step + 1 < list.length ? 'Próximo Herói ▶' : 'Ver o resumo ▶'}</button></div>` : ''}`, false);
    paintCardArt(this.page);
    const flip = () => { up.curseFlipped = flipped + 1; play('pick-item'); this.save(); this.curses(); };
    this.page.querySelectorAll<HTMLElement>('[data-flip]').forEach(b => { b.onclick = () => { if (!b.hasAttribute('disabled')) flip(); }; });
    // a IA vira as cartas dela sozinha
    if (!mine && !all) this.curseTimer = window.setTimeout(flip, flipped ? 800 : 1100);
    const ok = this.page.querySelector('#cp-ok') as HTMLElement | null;
    if (ok) ok.onclick = () => { up.curseStep = step + 1; up.curseFlipped = 0; this.save(); this.curses(); };
  }

  /** Depois que todos compram: o que cada Guilda comprou e o que descartou. */
  private buys() {
    const c = this.c!;
    const up = c.upgrade!;
    this.show(`Fase de Melhorias · Nível ${up.level}`, `${buySummaryHtml(c, g => guildName(g), human(c).id)}
      <div class="cp-step"><button class="primary cp-big" id="cp-ok">Equipar meus Heróis ▶</button></div>`, false);
    paintCardArt(this.page);
    (this.page.querySelector('#cp-ok') as HTMLElement).onclick = () => { up.buySummary = false; this.save(); this.arrange(); };
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
    const opts: InvOptions = { heroes: me.heroes, color: GUILDS[me.id].color, discard: true, slots: (h, cards) => heroSlots(c, me, h, cards), curse: h => curseLabel(me.curses[h]) };
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
    (this.page.querySelector('#cp-new') as HTMLElement).onclick = () => { this.c = null; this.save(); this.setup(); };
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
