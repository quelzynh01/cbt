import { CARDS, CURSES } from '../engine/cards';
import { HEROES, MONSTERS } from '../engine/data';
import { CARD_ART } from './cardArt';
import { drawFull } from '../render/chibi';
import { dieImg } from '../render/dice';

// Cartas no estilo do jogo de tabuleiro: moldura de pedra, título em pergaminho, medalhões e caixa de texto.
// A cor de fundo indica o nível (itens e monstros).

/** Cor de cada nível de item. */
export const ITEM_LEVEL: Record<string, { color: string; name: string }> = {
  I: { color: '#7d848c', name: 'Inicial' },
  '1': { color: '#3a7bc8', name: 'Nível 1' },
  '2': { color: '#7a4bb8', name: 'Nível 2' },
  '3': { color: '#3c9a52', name: 'Nível 3' },
  '4': { color: '#d07a26', name: 'Nível 4' },
  '5': { color: '#b8352a', name: 'Nível 5' },
  R: { color: '#c79a22', name: 'Recompensa' },
};

/** Cor de cada nível de Monstro. */
export const MONSTER_LEVEL: Record<string, string> = { '1': '#d4802a', '2-3': '#4c9a3c', '4-5': '#3567b0', '6': '#6a3a9a' };

export const itemColor = (id: string) => ITEM_LEVEL[CARDS[id]?.level ?? 'I']?.color ?? '#7d848c';
export const monsterColor = (id: string) => MONSTER_LEVEL[MONSTERS[id]?.level ?? '1'] ?? '#d4802a';

const GROUP_ICON: Record<string, string> = {
  Espada: '🗡️', Machado: '🪓', Martelo: '🔨', Arco: '🏹', Mágica: '🔮', Arremesso: '💣', Lança: '🔱',
  Armadura: '🛡️', Escudo: '🛡️', Joia: '💍', Habilidade: '💪', Equipamento: '🎒',
};

/** Título em pergaminho; nomes longos ficam menores para caber em até 2 linhas. */
const title = (name: string, sub = '') => {
  const fs = name.length > 20 ? 13 : name.length > 14 ? 15 : 17;
  return `<div class="ac-title" style="font-size:${fs}px"><span>${name}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
};

/** Medalhão de bônus +1..+10 (public/bonus, tools/build_bonus.py). */
export function bonusImg(kind: 'def' | 'hp' | 'rr', n: number, cls = 'bonus'): string {
  const name = kind === 'def' ? 'Defesa' : kind === 'hp' ? 'Vida' : 'Rerrolagem';
  if (n < 1 || n > medalMax(kind)) return `<span class="${cls}">+${n}</span>`;
  return `<img class="${cls}" src="${import.meta.env.BASE_URL}bonus/${kind}${n}.webp" title="+${n} ${name}" alt="+${n} ${name}" draggable="false"/>`;
}

/** Maior número com imagem de medalhão (Vida vai até 20). */
const medalMax = (kind: string) => kind === 'hp' ? 20 : 10;

type BadgeKind = 'def' | 'hp' | 'rr' | 'melee' | 'ranged' | 'coin' | 'skull' | 'move';
/** Medalhão com o número (imagem de public/bonus, 1..10); fora disso usa o medalhão desenhado. `extra`: up/down, posição. */
export function medal(kind: BadgeKind, n: number, title: string, extra = ''): string {
  if (Number.isInteger(n) && n >= 1 && n <= medalMax(kind)) {
    return `<img class="bimg ${kind} ${extra}" src="${import.meta.env.BASE_URL}bonus/${kind}${n}.webp" title="${title}" alt="${n}" draggable="false"/>`;
  }
  const cls = kind === 'melee' || kind === 'ranged' ? `dice ${kind}` : kind;
  return med(`${cls} ${extra}`, n, title);
}

const med = (cls: string, v: string | number, title: string) => `<span class="med ${cls}" title="${title}"><b>${v}</b></span>`;

/** Valores atuais de um personagem na partida (com itens, Maldições e efeitos). */
export interface LiveStats {
  def: number;
  /** Vida atual (Vida máxima − Ferimentos). */
  hp: number;
  /** Vida máxima com itens e Maldições. */
  maxHp?: number;
  rr: number;
  /** Bônus de dados de ataque (todas as cartas). */
  atk?: number;
}
/** Classe do medalhão comparando o valor atual com o da carta. */
const cmp = (now: number, base: number) => now > base ? ' up' : now < base ? ' down' : '';
const diff = (now: number, base: number, name: string) => now === base ? name : `${name}: ${now} (carta: ${base})`;

/** Carta de item (Ataque, Ampliação ou Permanente). Mesmo tamanho das cartas de Monstro. */
export function itemCard(id: string, extra = '', attrs = '', qty = false, atkBonus = 0): string {
  const d = CARDS[id];
  if (!d) return '';
  const lv = ITEM_LEVEL[d.level] ?? ITEM_LEVEL.I;
  const type = d.kind === 'attack' ? (d.attackType === 'melee' ? 'Ataque Próximo' : 'Ataque a Distância') : d.kind === 'boost' ? 'Ampliação' : 'Permanente';
  const bonus = [d.defBonus ? bonusImg('def', d.defBonus, 'ac-bmed') : '', d.hpBonus ? bonusImg('hp', d.hpBonus, 'ac-bmed') : '', d.rerolls ? bonusImg('rr', d.rerolls, 'ac-bmed') : ''].join('');
  const text = `${richText(d.text)}${d.partial ? ' <i>(efeito ainda não implementado)</i>' : ''}`;
  const art = CARD_ART[id];
  return `<div class="acard item ${extra}" style="--lv:${lv.color}" ${attrs} title="${(d.text || d.name).replace(/"/g, '&quot;')}">
    ${title(d.name)}
    <div class="ac-art ${art?.kind === 'fill' ? 'fill' : ''}">${d.cost ? medal('coin', d.cost, `Custo: ${d.cost} moeda(s)`, 'ac-tl') : ''}${art
      ? artImg(art, `art-${art.img}`)
      : `<span class="ac-icon">${GROUP_ICON[d.group] ?? '✦'}</span>`}</div>
    <div class="ac-type"><div><b>${type}</b><small>${d.group}</small></div>${d.kind === 'attack' ? medal(d.attackType === 'melee' ? 'melee' : 'ranged', d.dice + atkBonus, atkBonus ? `${d.dice + atkBonus} dados de ataque (carta: ${d.dice})` : `${d.dice} dados de ataque ${d.attackType === 'melee' ? 'Próximo' : 'a Distância'}`, atkBonus > 0 ? 'up' : atkBonus < 0 ? 'down' : '') : ''}</div>
    <div class="ac-text ${textSize(d.text)}">${bonus ? `<div class="ac-bmeds">${bonus}</div>` : ''}${d.text ? `<p>${text}</p>` : ''}</div>
    <div class="ac-code">${d.code} · ${lv.name}${qty && d.qty ? ` · ${d.qty}x` : ''}${d.scenario ? ` · ${d.scenario}` : ''}</div>
  </div>`;
}

/** Só a arte de uma carta de item (mini carta da ficha do Herói); sem arte, o ícone do grupo. */
export function itemArt(id: string): string {
  const art = CARD_ART[id];
  return art ? artImg(art, `art-${art.img}`) : `<span class="ac-icon">${GROUP_ICON[CARDS[id]?.group ?? ''] ?? '✦'}</span>`;
}

/** Imagem da arte da carta (public/cards). */
const artImg = (a: { img: string; kind: string }, cls = '') => `<img class="ac-img ${a.kind} ${cls}" src="${import.meta.env.BASE_URL}cards/${a.img}.webp" alt="" draggable="false"/>`;

/** Texto de carta: o ✷ vira o ícone do dado crítico. */
export const richText = (t = '') => t.replace(/✷/g, `<span class="ic-crit" title="Crítico">${dieImg('crit', true)}</span>`)
  // {rrN} {defN} {hpN}: medalhões (Rerrolagem, Defesa, Vida) dentro do texto
  .replace(/\{(rr|def|hp)(\d+)\}/g, (_, k, n) => `<img class="ic-rr" src="${import.meta.env.BASE_URL}bonus/${k}${n}.webp" title="+${n} ${({ rr: 'Rerrolagem', def: 'Defesa', hp: 'Vida' } as Record<string, string>)[k]}" alt=""/>`);

/** Texto de Herói: os medalhões do começo do texto ficam numa linha própria, grandes, em cima (como na carta oficial). */
function heroText(t: string): string {
  const m = t.match(/^((?:\{(?:rr|def|hp)\d+\}\s*)+)/);
  if (!m) return `<p>${richText(t)}</p>`;
  return `<div class="ic-row">${richText(m[1].trim())}</div><p>${richText(t.slice(m[0].length))}</p>`;
}

const textSize = (t = '') => t.length > 170 ? 'xxs' : t.length > 110 ? 'xs' : t.length > 80 ? 'sm' : '';

/** Carta de Maldição Mortal (mesmo tamanho das cartas de Monstro). */
export function curseCard(id: string, extra = '', attrs = ''): string {
  const c = CURSES[id];
  if (!c) return '';
  return `<div class="acard curse ${extra}" ${attrs}>
    ${title(c.name)}
    <div class="ac-art curse-art">${med('curse ac-tl', c.value, 'Valor da Maldição')}${CARD_ART[`curse:${id}`] ? artImg(CARD_ART[`curse:${id}`], 'art-curse') : '<span class="ac-icon">💀</span>'}</div>
    <div class="ac-type"><div><b>Maldição Mortal</b><small>${c.slot ? 'Ocupa um espaço de carta' : 'Efeito permanente'}</small></div></div>
    <div class="ac-text ${textSize(c.text)}"><p>${richText(c.text)}</p></div>
    <div class="ac-code">T-${String(c.value).padStart(2, '0')} · ${c.qty}x no baralho</div>
  </div>`;
}

/** Carta de Herói (paisagem). O canvas `data-art` recebe o desenho do personagem. */
export function heroCard(id: string, extra = '', attrs = '', foot = '', badge = '', live?: LiveStats): string {
  const h = HEROES[id];
  const def = live?.def ?? h.defense, hp = live?.hp ?? h.hp, rr = live?.rr ?? 0;
  return `<div class="acard hero ${extra}" ${attrs}>${badge ? `<span class="pick-badge">${badge}</span>` : ''}
    ${title(h.name, h.title)}
    <div class="hc-body">
      <div class="hc-left">
        <div class="hc-meds">${medal('def', def, diff(def, h.defense, 'Defesa'), `big${cmp(def, h.defense)}`)}${medal('hp', hp, live ? `Vida atual: ${hp}/${live.maxHp ?? h.hp} (carta: ${h.hp})` : 'Vida', `big${cmp(hp, h.hp)}`)}${rr ?medal('rr', rr, `Rerrolagem: ${rr}`, `big${cmp(rr, 0)}`) : ''}${live?.atk ?medal('melee', live.atk, `+${live.atk} dado(s) em todos os ataques`, 'big up') : ''}</div>
        <div class="ac-ribbon"><small>Habilidade</small><b>${h.abilityName}</b></div>
        <div class="ac-text ${textSize(h.abilityText)}"><p>${richText(h.abilityText)}${h.implemented === false ? ' <i>(a confirmar)</i>' : ''}</p></div>
      </div>
      <canvas class="hc-artc" width="300" height="340" data-art="${id}"></canvas>
    </div>
    ${foot ? `<div class="ac-code">${foot}</div>` : ''}
  </div>`;
}

/** Carta de Herói extra (só na Biblioteca, ainda não jogável): o retrato no lugar do boneco, carta mais escura. */
export function extraHeroCard(h: { id: string; name: string; def: number; hp: number; ability: string; text: string; art: boolean; model?: boolean }): string {
  return `<div class="acard hero extra" title="Herói extra — ainda não jogável">
    ${title(h.name, 'Herói Extra')}
    <div class="hc-body">
      <div class="hc-left">
        <div class="hc-meds">${h.def > 0 ? medal('def', h.def, 'Defesa', 'big') : `<span class="med def big" title="Defesa"><b>0</b></span>`}${medal('hp', h.hp, 'Vida', 'big')}</div>
        <div class="ac-ribbon"><small>Habilidade</small><b>${h.ability}</b></div>
        <div class="ac-text ${textSize(h.text)} ${/^\{/.test(h.text) ? 'has-row' : ''}">${heroText(h.text)}</div>
      </div>
      ${h.model ? `<img class="hc-artc xh-full" src="${import.meta.env.BASE_URL}extras/x_${h.id}.webp" alt="" draggable="false"/>`
        : h.art ? `<img class="hc-artc xh-img" src="${import.meta.env.BASE_URL}portraits/x_${h.id}.webp" alt="" draggable="false"/>` : `<div class="hc-artc xh-none">${h.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>`}
    </div>
    <div class="ac-code">Extra · ainda não jogável</div>
  </div>`;
}

/** Carta de Monstro (retrato) com a cor do nível. */
export function monsterCard(id: string, extra = '', attrs = '', live?: LiveStats): string {
  const m = MONSTERS[id];
  const def = live?.def ?? m.defense, hp = live?.hp ?? m.hp, rr = live?.rr ?? m.rerolls;
  const villain = m.category.startsWith('Vilão');
  return `<div class="acard monster ${extra}" style="--lv:${monsterColor(id)}" ${attrs}>
    ${title(m.name, `Nível ${m.level}${villain ? ` · ${m.category}` : ''}`)}
    <div class="mc-art">
      <div class="mc-meds">${medal('hp', hp, live ? `Vida atual: ${hp}/${m.hp}` : `Vida ${m.hp}`, cmp(hp, m.hp))}${Number.isFinite(m.exterm) ? medal('skull', m.exterm, `Extermínio: ${m.exterm} Ferimentos num só ataque matam sem Vingança`) : ''}${m.defense || def ?medal('def', def, diff(def, m.defense, 'Defesa'), cmp(def, m.defense)) : ''}${m.rerolls || rr ?medal('rr', rr, diff(rr, m.rerolls, 'Rerrolagem'), cmp(rr, m.rerolls)) : ''}</div>
      ${medal('coin', m.reward, `Recompensa: ${m.reward} moeda(s)`, 'mc-coin')}
      <canvas width="320" height="328" data-art="${id}"></canvas>
    </div>
    <div class="ac-type">${medal('move', m.move, `Movimento: ${m.move}`)}<div><b>${m.attackType === 'melee' ? 'Ataque Próximo' : 'Ataque a Distância'}</b><small>${m.attackName}</small></div>${medal(m.attackType === 'melee' ? 'melee' : 'ranged', m.dice, `${m.dice} dados de ataque`)}</div>
    <div class="ac-text ${textSize(m.abilityText)}">${m.abilityText ? `<p>${richText(m.abilityText)}</p>` : ''}</div>
  </div>`;
}

/** Desenha os personagens das cartas (canvas com data-art) dentro de `root`. */
export function paintCardArt(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-art]').forEach(cv => drawFull(cv, cv.dataset.art!));
}
