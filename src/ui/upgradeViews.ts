import { CARDS, CURSES } from '../engine/cards';
import { GUILDS, HEROES } from '../engine/data';
import type { GuildId } from '../engine/types';
import type { CampaignState } from '../campaign/campaign';
import { curseCard, itemCard } from './cardview';

// Telas da Fase de Melhorias usadas igual na campanha (neste computador) e na campanha online:
// as Maldições Mortais viradas na mesa e o resumo das compras de todas as Guildas.

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const who = (g: GuildId, name: (g: GuildId) => string) => `<span class="dot" style="background:${GUILDS[g].color}"></span> ${esc(name(g))}`;

/** Herói da vez nas Maldições: as cartas na mesa (viradas ou não). `canFlip`: quem está olhando pode virar a próxima. */
export function curseRevealHtml(c: CampaignState, canFlip: boolean, name: (g: GuildId) => string): string {
  const up = c.upgrade!;
  const list = up.cursesDrawn;
  const step = up.curseStep ?? 0;
  const cur = list[step];
  const flipped = Math.min(up.curseFlipped ?? 0, cur.drawn.length);
  const all = flipped >= cur.drawn.length;
  const keptAt = cur.drawn.indexOf(cur.kept);
  const cards = cur.drawn.map((id, i) => i < flipped
    ? `<div class="cr-slot face ${all ? (i === keptAt ? 'kept' : 'back-deck') : ''}">${curseCard(id)}${all ? `<span class="cr-tag">${i === keptAt ? '✔ Fica com esta' : '↩ Volta ao baralho'}</span>` : ''}</div>`
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
export function curseSummaryHtml(c: CampaignState, name: (g: GuildId) => string): string {
  const list = c.upgrade!.cursesDrawn;
  const rows = c.guilds.map(g => {
    const mine = list.filter(x => x.guild === g.id);
    if (!mine.length) return '';
    return `<div class="cr-sumg"><h4>${who(g.id, name)}</h4><div class="cr-sumrow">${mine.map(x => `<div class="cr-sumhero ${x.kept === 'sem_maldicao' ? 'free' : ''}">
      <b>${HEROES[x.hero].name}</b><small>${x.drawn.length} morte${x.drawn.length > 1 ? 's' : ''}</small>${curseCard(x.kept, 'small')}</div>`).join('')}</div></div>`;
  }).join('');
  return `<div class="cp-step"><h3>☠ Quem ficou amaldiçoado</h3>
    <p>As Maldições valem durante o próximo cenário. Uma <b>Poção de Cura</b> remove a Maldição na hora.</p>
    ${rows}</div>`;
}

/** Depois que todos compram: o que cada Guilda comprou e descartou (as escolhidas e não compradas). */
export function buySummaryHtml(c: CampaignState, name: (g: GuildId) => string, me?: GuildId | null): string {
  const up = c.upgrade!;
  const rows = c.guilds.map(g => {
    // o registro das compras (a IA já colocou as cartas nos Heróis, então `bought` dela pode estar vazio)
    const bought = up.purchased?.[g.id] ?? up.bought[g.id] ?? [];
    const left = (up.picked[g.id] ?? []).slice();
    for (const id of bought) { const i = left.indexOf(id); if (i >= 0) left.splice(i, 1); }
    const dropped = up.dropped?.[g.id] ?? [];
    return `<div class="by-guild" style="--gc:${GUILDS[g.id].color}">
      <h4>${who(g.id, name)} ${g.id === me ? '<small>(você)</small>' : g.controller === 'ai' ? '<small>(IA)</small>' : ''}
        <span class="by-coins">🪙 sobrou ${up.coins[g.id] ?? 0} · guarda ${g.saved}</span></h4>
      <div class="by-cols">
        <div><h5>🛒 Comprou</h5><div class="cp-cards small">${bought.map(id => itemCard(id)).join('') || '<span class="muted">Nada</span>'}</div></div>
        <div><h5>🗑 Descartou</h5><div class="cp-cards small by-disc">${left.map(id => itemCard(id)).join('') || '<span class="muted">Nada</span>'}</div></div>
      </div>
      ${dropped.length ? `<div class="by-drop"><h5>↩ Tirou do inventário para dar lugar</h5><div class="cp-cards small by-disc">${dropped.map(id => itemCard(id)).join('')}</div></div>` : ''}</div>`;
  }).join('');
  void CARDS;
  return `<div class="cp-step"><h3>🛒 Compras de todas as Guildas</h3>
    <p>As cartas escolhidas e não compradas voltam para a caixa.</p>
    ${rows}</div>`;
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
