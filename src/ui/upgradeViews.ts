import { CARDS, CURSES } from '../engine/cards';
import { GUILDS, HEROES } from '../engine/data';
import type { GuildId } from '../engine/types';
import { heroSlots, medals, type CampaignState } from '../campaign/campaign';
import { MAPS, campaignList } from '../engine/maps';
import { TITLES } from '../engine/titles';
import { drawFace } from '../render/chibi';
import { curseCard, itemCard } from './cardview';

// Telas da Fase de Melhorias usadas igual na campanha (neste computador) e na campanha online:
// as Maldições Mortais viradas na mesa e o resumo das compras de todas as Guildas.

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const who = (g: GuildId, name: (g: GuildId) => string) => `<span class="dot" style="background:${GUILDS[g].color}"></span> ${esc(name(g))}`;

/** Maldição do Herói no editor de cartas: nome e o que faz (as que ocupam espaço cobrem a 4ª carta, p.24). */
export const curseLabel = (id?: string) => {
  const c = id ? CURSES[id] : null;
  return c ? `${c.name} — ${c.text}${c.slot ? ' Com 4 cartas, a última fica debaixo da Maldição (indisponível até uma Poção de Cura).' : ''}` : null;
};

/** Topo da Fase de Melhorias: as Guildas (a sua primeiro) com moedas e medalhas; `waiting` marca quem ainda está escolhendo. */
export function upgradeBarHtml(c: CampaignState, me: GuildId, name: (g: GuildId) => string, waiting?: (g: GuildId) => boolean): string {
  const up = c.upgrade;
  const ms = medals(c);
  const order = [me, ...c.guilds.map(g => g.id).filter(id => id !== me)];
  return `<div class="up-bar">${order.map(id => {
    const w = waiting?.(id);
    return `<div class="up-g ${id === me ? 'me' : ''}" style="--gc:${GUILDS[id].color}">
      <b>${esc(name(id))}${id === me ? ' <small>(você)</small>' : ''}</b>
      <span title="Moedas para a compra">🪙 ${up?.coins[id] ?? 0}</span><span title="Medalhas da campanha">🏅 ${ms.filter(m => m.winners.includes(id)).length}</span>
      ${waiting ? `<span class="up-st ${w ? 'wait' : 'ok'}">${w ? '⏳ escolhendo…' : '✓ pronto'}</span>` : ''}
    </div>`;
  }).join('')}</div>`;
}

/** Carta pequena (cartas dos Heróis e resumos): o nome e o texto aparecem ao passar o mouse; a lupa amplia. */
const mini = (id: string) => `<div class="up-mini" title="${esc(`${CARDS[id]?.name ?? id}: ${CARDS[id]?.text ?? ''}`)}">${itemCard(id)}</div>`;
export function miniCards(ids: string[], cls = ''): string {
  return `<div class="up-minis ${cls}">${ids.map(mini).join('') || '<span class="muted">Nada</span>'}</div>`;
}

/** Tela da Fase de Melhorias: as Guildas no topo; a etapa à esquerda e, ao lado, os seus Heróis e o resultado (sem rolar a tela). */
export function upgradeLayout(bar: string, main: string, side: string): string {
  return `${bar}<div class="up-lay"><div class="up-main">${main}</div><aside class="up-side">${side}</aside></div>`;
}

/** Placar da campanha aberto (janela por cima): continua aberto quando a tela é redesenhada (online). */
let rankOpen = false;

/** Resultado do último mapa (tabela curta) e o botão do placar da campanha (abre numa janela). */
export function resultHtml(c: CampaignState, name: (g: GuildId) => string): string {
  const last = c.played[c.played.length - 1];
  if (!last) return '';
  return `<section class="up-panel up-result"><h4>📋 ${esc(MAPS[last.mapId]?.name ?? '')}</h4>
    <table><tr><th>Guilda</th><th title="Missões">🎯</th><th title="Mortes">💀</th><th title="Moedas">🪙</th></tr>
    ${last.guilds.map(r => `<tr class="${r.id === last.winner ? 'win' : ''}"><td>${who(r.id, name)}${r.id === last.winner ? ' 🏆' : ''}</td><td>${r.missions}</td><td>${r.deaths}</td><td>${r.coins}</td></tr>`).join('')}</table>
    <button type="button" class="up-rankbtn" data-rank="1">🏆 Placar da campanha</button>
    <div class="up-pop ${rankOpen ? 'open' : ''}" data-rankpop><div class="up-popbox"><button type="button" class="up-popx" data-rank="0" title="Fechar">✕</button>${rankingHtml(c, name)}</div></div>
  </section>`;
}

/** Os seus Heróis: as cartas que cada um tem agora e a Maldição (para pensar na escolha e na compra). */
export function myHeroesHtml(c: CampaignState, me: GuildId): string {
  const g = c.guilds.find(x => x.id === me);
  if (!g) return '';
  const total = g.heroes.reduce((n, h) => n + (g.inventory[h] ?? []).length, 0);
  return `<section class="up-panel up-heroes" style="--gc:${GUILDS[me].color}"><h4>🛡 Seus Heróis <small>${total}/12 cartas</small></h4>
    ${g.heroes.map(h => {
      const cards = g.inventory[h] ?? [];
      const sl = heroSlots(c, g, h);
      const cu = g.curses[h] && g.curses[h] !== 'sem_maldicao' ? CURSES[g.curses[h]] : null;
      return `<div class="up-hero">
        <div class="up-hh"><canvas width="56" height="56" data-uface="${h}" data-color="${GUILDS[me].color}"></canvas><b>${HEROES[h].name}</b><small>${sl.used}/${sl.max}</small></div>
        ${cu ? `<div class="up-hcurse" title="${esc(cu.text)}">☠ <b>${esc(cu.name)}</b> — ${esc(cu.text)}</div>` : ''}
        <div class="up-minis">${cards.map(mini).join('')}${'<div class="up-mini empty"></div>'.repeat(Math.max(0, sl.max - sl.used))}</div>
      </div>`;
    }).join('')}</section>`;
}

/** Depois de desenhar a tela: rostos dos Heróis e o botão do placar da campanha. */
export function bindUpgradeView(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-uface]').forEach(cv => drawFace(cv, cv.dataset.uface!, cv.dataset.color!));
  const pop = root.querySelector<HTMLElement>('[data-rankpop]');
  const set = (v: boolean) => { rankOpen = v; pop?.classList.toggle('open', v); };
  root.querySelectorAll<HTMLElement>('[data-rank]').forEach(b => { b.onclick = () => set(b.dataset.rank === '1'); });
  if (pop) pop.onclick = e => { if (e.target === pop) set(false); };
}

/** De quem veio a mão desta rodada (as mãos passam para a esquerda, as mesmas cartas rodando). */
export function handFromHtml(c: CampaignState, me: GuildId, name: (g: GuildId) => string): string {
  const up = c.upgrade;
  if (!up || up.round === 0 || c.guilds.length < 2) return '';
  const order = c.guilds.map(g => g.id);
  const i = order.indexOf(me);
  const from = order[(i - 1 + order.length) % order.length], to = order[(i + 1) % order.length];
  return `<p class="up-from">🔄 Estas cartas são as que ${who(from, name)} passou para você (a sua mão foi para ${who(to, name)}).</p>`;
}

/** Ranking da campanha até agora (Medalhas do Livro de Campanha: quem lidera cada Conquista) e total por Guilda. */
export function rankingHtml(c: CampaignState, name: (g: GuildId) => string): string {
  const ms = medals(c);
  const total = (g: GuildId) => ms.filter(m => m.winners.includes(g)).length;
  const mark = (ids: GuildId[]) => ids.map(id => `<i class="cs-mk" style="--gc:${GUILDS[id].color}" title="${esc(name(id))}"></i>`).join('');
  // linhas: os cenários da campanha (o último, o Confronto Final, em azul)
  const list = campaignList(c.edition).filter(sc => sc.map);
  const rows = list.map((sc, i) => {
    const r = c.played.find(p => p.mapId === sc.map!.id);
    const cell = (ids: GuildId[]) => `<td><div class="cs-cell">${mark(ids)}</div></td>`;
    const cols = r ? [
      [r.winner],
      r.guilds.filter(x => x.deaths === Math.min(...r.guilds.map(y => y.deaths))).map(x => x.id),
      r.guilds.filter(x => x.coins === Math.max(...r.guilds.map(y => y.coins))).map(x => x.id),
      r.guilds.filter(x => x.reward).map(x => x.id),
      r.guilds.filter(x => x.title).map(x => x.id),
    ] : [[], [], [], [], []];
    return `<tr class="${r ? 'done' : ''}"><th class="cs-map ${i === list.length - 1 ? 'final' : ''}">${esc(sc.name)}</th>${cols.map(cell).join('')}</tr>`;
  }).join('');
  // Títulos (como na folha do Livro de Campanha): frase curta e quem tem
  const SHORT: Record<string, string> = {
    guardiao_portao: 'Protegeu o portão!', senhor_aguias: 'Resgatou as águias!', cacador_trolls: 'Derrotou o troll!', destruidor_pedra: 'Destruiu a Pedra!',
    protetor_fogo: 'Desarmou as bombas!', lider_rebelde: 'Resgatou a Resistência!', mestre_conhecimento: 'Recuperou dois tomos!', forjador_almas: 'Destruiu a alma do Lorde Presas!',
  };
  const groups: [string, string[]][] = c.edition === 'btg'
    ? [['Títulos', ['orador_mortos', 'mente_mestra', 'purificador', 'casamenteiro', 'coveiro', 'capitao_milicia', 'mestre_morte', 'alquimista']]]
    : [['Títulos · Círculo Exterior', ['guardiao_portao', 'senhor_aguias', 'cacador_trolls', 'destruidor_pedra']], ['Títulos · Círculo Interior', ['protetor_fogo', 'lider_rebelde', 'mestre_conhecimento', 'forjador_almas']]];
  const titles = groups.map(([h, ids]) => `<div class="cs-tgroup"><h5>${h}</h5>${ids.filter(t => TITLES[t]).map(t => {
    const holders = c.guilds.filter(g => g.titles.includes(t)).map(g => g.id);
    return `<div class="cs-title ${holders.length ? 'got' : ''}"><b>"${esc(TITLES[t])}"</b> <small>${esc(SHORT[t] ?? '')}</small>${holders.length ? `<span>${mark(holders)}</span>` : ''}</div>`;
  }).join('')}</div>`).join('');
  return `<div class="cp-rank cs-sheet"><h4>🏆 Placar da campanha <small>(${c.played.length} de 6 cenários)</small></h4>
    <table class="cs-table"><tr><th></th>${ms.map(m => `<th>${esc(m.name)}</th>`).join('')}</tr>${rows}
      <tr class="cs-medal"><th class="cs-map">Ganhador da Medalha</th>${ms.map(m => `<td><div class="cs-cell">${mark(m.winners)}</div></td>`).join('')}</tr></table>
    <div class="cs-totals">${c.guilds.slice().sort((a, b) => total(b.id) - total(a.id)).map(g => `<span>${who(g.id, name)}: <b>${total(g.id)}</b> medalha${total(g.id) === 1 ? '' : 's'}</span>`).join('')}</div>
    <div class="cs-titles">${titles}</div></div>`;
}

/** Herói da vez nas Maldições: as cartas na mesa (viradas ou não). `canFlip`: quem está olhando pode virar a próxima. */
/** Cartas de Maldição já animadas (para não virarem de novo a cada atualização da tela). */
const animatedFlips = new Set<string>();

export function curseRevealHtml(c: CampaignState, canFlip: boolean, name: (g: GuildId) => string): string {
  const up = c.upgrade!;
  const list = up.cursesDrawn;
  const step = up.curseStep ?? 0;
  const cur = list[step];
  const flipped = Math.min(up.curseFlipped ?? 0, cur.drawn.length);
  const all = flipped >= cur.drawn.length;
  const keptAt = cur.drawn.indexOf(cur.kept);
  // só a carta que acabou de virar anima (as já viradas ficam paradas quando a tela é redesenhada)
  const flipKey = (i: number) => `${c.played.length}:${step}:${cur.hero}:${i}`;
  const cards = cur.drawn.map((id, i) => i < flipped
    ? `<div class="cr-slot face ${animatedFlips.has(flipKey(i)) ? 'still' : (animatedFlips.add(flipKey(i)), '')} ${all ? (i === keptAt ? 'kept' : 'back-deck') : ''}">${curseCard(id)}${all ? `<span class="cr-tag">${i === keptAt ? '✔ Fica com esta' : '↩ Volta ao baralho'}</span>` : ''}</div>`
    : `<button class="cr-slot cr-back ${canFlip && i === flipped ? 'next' : ''}" data-flip="${i}" ${canFlip && i === flipped ? '' : 'disabled'}><span class="cr-skull">💀</span><b>Maldição<br/>Mortal</b>${canFlip && i === flipped ? '<small>toque para virar</small>' : ''}</button>`).join('');
  const done = list.slice(0, step);
  return `<div class="cp-step cr-step">
      <h3>☠ Maldições Mortais <small>(${step + 1} de ${list.length})</small></h3>
      <div class="cr-who" style="--gc:${GUILDS[cur.guild].color}">${who(cur.guild, name)} · <b>${HEROES[cur.hero].name}</b> morreu <b>${cur.drawn.length}</b> ${cur.drawn.length > 1 ? 'vezes' : 'vez'}:
        compra ${cur.drawn.length} carta${cur.drawn.length > 1 ? 's' : ''} e fica com a de <b>maior valor</b>.</div>
      <div class="cr-table">${cards}</div>
      <div class="cr-result">${all ? (cur.kept === 'sem_maldicao' ? `🎉 <b>${HEROES[cur.hero].name}</b> escapou: Sem Maldição!` : `☠ <b>${HEROES[cur.hero].name}</b> fica com <b>${CURSES[cur.kept].name}</b> — ${esc(CURSES[cur.kept].text)}`) : canFlip ? 'Vire as cartas — todos estão vendo.' : `${esc(name(cur.guild))} está virando as cartas…`}</div>
      ${done.length ? `<div class="cr-done">${done.map(x => `<span>${who(x.guild, name)} ${HEROES[x.hero].name}: <b>${CURSES[x.kept].name}</b></span>`).join('')}</div>` : ''}
    </div>`;
}

/** Resumo: quem ficou amaldiçoado (e com qual Maldição). */
export function curseSummaryHtml(c: CampaignState, name: (g: GuildId) => string, me?: GuildId | null): string {
  const list = c.upgrade!.cursesDrawn;
  const rows = byMeFirst(c, me).map(g => {
    const mine = list.filter(x => x.guild === g.id);
    if (!mine.length) return '';
    return `<div class="cr-sumg ${g.id === me ? 'me' : ''}" style="--gc:${GUILDS[g.id].color}"><h4>${who(g.id, name)}${g.id === me ? ' <small>(você)</small>' : ''}</h4><div class="cr-sumrow">${mine.map(x => `<div class="cr-sumhero ${x.kept === 'sem_maldicao' ? 'free' : ''}">
      <b>${HEROES[x.hero].name}</b><small>${x.drawn.length} morte${x.drawn.length > 1 ? 's' : ''}</small>${curseCard(x.kept, 'small')}
      <span class="cr-sumtxt"><b>${esc(CURSES[x.kept].name)}</b>${x.kept === 'sem_maldicao' ? '' : ` — ${esc(CURSES[x.kept].text)}`}</span></div>`).join('')}</div></div>`;
  }).join('');
  return `<div class="cp-step up-sum"><h3>☠ Quem ficou amaldiçoado <small>— valem no próximo cenário; uma <b>Poção de Cura</b> remove a Maldição na hora</small></h3>
    <div class="up-sumgrid">${rows}</div></div>`;
}

/** As Guildas com a sua primeiro. */
const byMeFirst = (c: CampaignState, me?: GuildId | null) => [...c.guilds.filter(g => g.id === me), ...c.guilds.filter(g => g.id !== me)];

/** Depois que todos compram: o que cada Guilda comprou e descartou (as escolhidas e não compradas). */
export function buySummaryHtml(c: CampaignState, name: (g: GuildId) => string, me?: GuildId | null): string {
  const up = c.upgrade!;
  const rows = byMeFirst(c, me).map(g => {
    // o registro das compras (a IA já colocou as cartas nos Heróis, então `bought` dela pode estar vazio)
    const bought = up.purchased?.[g.id] ?? up.bought[g.id] ?? [];
    const left = (up.picked[g.id] ?? []).slice();
    for (const id of bought) { const i = left.indexOf(id); if (i >= 0) left.splice(i, 1); }
    const dropped = up.dropped?.[g.id] ?? [];
    return `<div class="by-guild ${g.id === me ? 'me' : ''}" style="--gc:${GUILDS[g.id].color}">
      <h4>${who(g.id, name)} ${g.id === me ? '<small>(você)</small>' : g.controller === 'ai' ? '<small>(IA)</small>' : ''}
        <span class="by-coins">🪙 sobrou ${up.coins[g.id] ?? 0} · guarda ${g.saved}</span></h4>
      <h5>🛒 Comprou</h5>${miniCards(bought)}
      <h5>🗑 Descartou</h5>${miniCards(left, 'by-disc')}
      ${dropped.length ? `<h5 class="by-droph">↩ Tirou do inventário para dar lugar</h5>${miniCards(dropped, 'by-disc')}` : ''}</div>`;
  }).join('');
  return `<div class="cp-step up-sum"><h3>🛒 Compras de todas as Guildas <small>— as escolhidas e não compradas voltam para a caixa</small></h3>
    <div class="up-sumgrid">${rows}</div></div>`;
}

/** Compra: o que ainda dá para comprar com as moedas que sobram (até 3 cartas). */
export function buyHint(picked: string[], sel: number[], coins: number): { html: string; more: boolean } {
  const spent = sel.reduce((s, i) => s + CARDS[picked[i]].cost, 0);
  const left = coins - spent;
  const slots = 3 - sel.length;
  const can = slots > 0 ? picked.filter((id, i) => !sel.includes(i) && CARDS[id].cost <= left) : [];
  if (left < 0) return { html: '<div class="buy-hint bad">⚠ Moedas insuficientes para essas cartas.</div>', more: false };
  if (can.length) return { html: `<div class="buy-hint more">💡 Você ainda tem <b>🪙 ${left}</b> e pode comprar mais <b>${slots}</b> carta${slots > 1 ? 's' : ''} — dá para levar: ${[...new Set(can.map(id => CARDS[id].name))].join(', ')}.</div>`, more: true };
  return { html: `<div class="buy-hint ok">✔ ${slots === 0 ? 'Você já escolheu 3 cartas (o máximo).' : 'Nenhuma outra carta cabe nas moedas que sobram.'} Sobram 🪙 ${left}${left > 1 ? ' (só 1 fica guardada)' : ''}.</div>`, more: false };
}
