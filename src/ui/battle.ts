import { itemArt, itemColor, medal, richText } from './cardview';
import { CARD_ART } from './cardArt';
import { play } from '../audio/sfx';
import { dieImg } from '../render/dice';
import { CARDS, GUILDS, HEROES, MONSTERS } from '../engine/data';
import type { Game } from '../engine/game';
import type { RerollInfo, DieFace, GameEvent, GuildId, Unit } from '../engine/types';
import { charScale, drawCharacter } from '../render/chibi';
import { diceSync } from './diceSync';

type AttackEvent = Extract<GameEvent, { t: 'attack' }>;

const FACE: Record<DieFace, string> = { crit: '✷', melee: '⚔', ranged: '➶', shield: '⛨', blank: '–' };
const ATK_FACES: DieFace[] = ['crit', 'melee', 'melee', 'ranged', 'ranged', 'blank'];
const DEF_FACES: DieFace[] = ['crit', 'shield', 'shield', 'blank', 'blank', 'blank'];

export interface BattleDeps {
  game: () => Game;
  speed: () => number;
  viewWounds: (id: string) => number;
  isHuman: (u: Unit) => boolean;
  /** A Guilda é controlada neste computador (ex.: quem controla os Monstros numa Reação). */
  isMineGuild: (g: GuildId) => boolean;
  /** Abre a carta (status atuais) de um personagem. */
  inspect?: (id: string) => void;
}

interface Fighter { id: string; canvas: HTMLCanvasElement; hurtT: number; lungeT: number; flip: boolean }

/** Tela de batalha 2D (no centro da tela) para escolher a arma, rolar ataque e defesa. */
export class BattlePanel {
  private el: HTMLElement;
  private deps: BattleDeps;
  private fighters: Fighter[] = [];
  private raf = 0;
  private resolveBtn: (() => void) | null = null;
  mode: 'closed' | 'prepare' | 'play' | 'spectate' = 'closed';
  /** Online: avisa os outros jogadores qual arma está marcada na preparação. */
  onPrepSelect: ((cardUid: string | null) => void) | null = null;
  onCancel: (() => void) | null = null;
  /** Alvo escolhido na preparação (para a Rerrolagem do ataque acontecer nesta mesma tela). */
  private prepTarget: string | null = null;
  /** Rerrolagem decidida nesta tela: a rolagem do ataque continua aqui, com os mesmos dados. */
  private carry: {
    attackerId: string;
    atk?: { dice: HTMLElement[]; before: DieFace[]; idx: number[]; settled: boolean };
    def?: { heroId: string; dice: HTMLElement[]; before: DieFace[]; idx: number[] };
  } | null = null;
  get hasCarry() { return !!this.carry; }
  private pickConfirm: (() => void) | null = null;
  /** Dados escolhidos girando desde o clique em Rerrolar até o resultado novo chegar. */
  private pickSpin = 0;
  private stopPickSpin() { if (this.pickSpin) { clearInterval(this.pickSpin); this.pickSpin = 0; } }

  constructor(root: HTMLElement, deps: BattleDeps) {
    this.deps = deps;
    this.el = document.createElement('div');
    this.el.id = 'battle';
    this.el.className = 'hidden';
    root.append(this.el);
    // lupa no nome: abre a carta com os status atuais
    this.el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-lupa]');
      if (b) { e.stopPropagation(); this.deps.inspect?.(b.dataset.lupa!); }
    });
  }

  get isOpen() { return this.mode !== 'closed'; }

  // ---------------------------------------------------------------
  private fighterHtml(u: Unit, side: 'left' | 'right', woundsShown: number) {
    const g = this.deps.game();
    const max = g.maxHp(u);
    const hp = Math.max(0, max - woundsShown);
    const name = u.kind === 'hero' ? HEROES[u.defId].name : MONSTERS[u.defId].name;
    const sub = u.kind === 'hero' ? `${HEROES[u.defId].title} · ${GUILDS[u.guild!].name.split(' (')[0]}` : `${MONSTERS[u.defId].category}`;
    const color = u.guild ? GUILDS[u.guild].color : '#7a2b8f';
    return `<div class="bt-fighter ${side}" data-fid="${u.id}" style="--fc:${color}">
      <canvas width="260" height="230"></canvas>
      <div class="bt-name">${name} <button class="bt-lupa" data-lupa="${u.id}" title="Ver status de ${name}">🔍</button></div><div class="bt-sub">${sub}</div>
      <div class="bt-hp"><i style="width:${(hp / max) * 100}%"></i><span>❤ ${hp}/${max}</span></div>
      <div class="bt-medals">${this.medals(u, hp)}</div>
      ${u.stunned ? '<div class="bt-stats"><b class="stun">✷ Atordoado — não rola Defesa</b></div>' : ''}
    </div>`;
  }

  /** Medalhões do lutador: Vida atual, dados de Defesa e Rerrolagem. */
  private medals(u: Unit, hp: number) {
    const g = this.deps.game();
    const def = g.defenseDice(u);
    const rr = u.kind === 'hero' ? g.rerollsOf(u) : (g.monDef(u).rerolls ?? 0);
    return `${hp > 0 ? medal('hp', hp, `Vida atual: ${hp}`, 'bm-hp') : ''}${def > 0 ? medal('def', def, `${def} dado${def === 1 ? '' : 's'} de Defesa`, 'bm-def') : ''}${rr ? medal('rr', rr, `Rerrolagem ${rr}`) : ''}`;
  }

  private mountFighters(a: Unit, b: Unit) {
    this.fighters = [a, b].map((u, i) => ({
      id: u.id,
      canvas: this.el.querySelector(`[data-fid="${u.id}"] canvas`) as HTMLCanvasElement,
      hurtT: -9e9, lungeT: -9e9, flip: i === 1,
    }));
    cancelAnimationFrame(this.raf);
    const loop = (t: number) => {
      if (this.mode === 'closed') return;
      for (const f of this.fighters) this.drawFighter(f, t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private drawFighter(f: Fighter, now: number) {
    const ctx = f.canvas.getContext('2d')!;
    const g = this.deps.game();
    const u = g.unit(f.id);
    ctx.clearRect(0, 0, f.canvas.width, f.canvas.height);
    ctx.save();
    ctx.translate(f.canvas.width / 2, f.canvas.height - 14);
    const s = 1.42 * Math.min(1.12, charScale(u.defId) / 1.2);
    const lk = (now - f.lungeT) / 380;
    const lunge = lk >= 0 && lk <= 1 ? Math.sin(lk * Math.PI) * 26 * (f.flip ? -1 : 1) : 0;
    const hurt = Math.max(0, 1 - (now - f.hurtT) / 420);
    drawCharacter(ctx, u.defId, { flip: f.flip, t: now / 1000, hurt, alpha: 1, stunned: u.stunned, lunge, scale: s });
    ctx.restore();
  }

  private fighter(id: string) { return this.fighters.find(f => f.id === id); }

  private show() {
    this.stopLinger();
    // já aberta (ex.: a Reação logo depois do ataque): só troca o conteúdo, sem fechar e abrir
    if (!this.el.classList.contains('hidden')) return;
    this.el.classList.remove('hidden');
    this.el.classList.remove('anim');
    void this.el.offsetWidth;
    this.el.classList.add('anim');
  }

  /** Depois do "Continuar" a tela fica um instante: se vier outra luta (Reação), continua nela. */
  private lingerT = 0;
  private linger(sp: number) {
    this.mode = 'closed';
    this.carry = null;
    this.el.classList.add('linger');
    // some rápido (a animação no tabuleiro aparece) e fica um tempo esperando uma Reação para reaparecer
    this.lingerT = window.setTimeout(() => this.close(), 2800 / Math.max(1, sp));
  }
  private stopLinger() {
    if (this.lingerT) { clearTimeout(this.lingerT); this.lingerT = 0; }
    this.el.classList.remove('linger');
  }

  close() {
    this.stopLinger();
    this.stopPickSpin();
    this.mode = 'closed';
    this.carry = null;
    this.pickConfirm = null;
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    this.resolveBtn = null;
    // escolha de Rerrolagem / botão Rolar pendentes (ex.: voltou o turno no meio do combate)
    this.askResolve = null;
    this.askRoll = null;
    this.askEl?.classList.add('hidden');
  }

  // ---------------------------------------------------------------
  // Preparação: escolher a arma e clicar em Atacar
  // ---------------------------------------------------------------
  openPrepare(heroId: string, targetId: string, preselect: string | null, onAttack: (cardUid: string, sacrifice: boolean, boosts: string[]) => void, onCancel: () => void) {
    const g = this.deps.game();
    const h = g.unit(heroId), t = g.unit(targetId);
    this.mode = 'prepare';
    this.prepTarget = targetId;
    this.carry = null;
    this.onCancel = onCancel;
    const pool = g.attackCardPool(h);
    const usable = pool.filter(c => !c.exhausted && g.canCardHit(h, c, h.cell!, t));
    let sel = usable.find(c => c.uid === preselect)?.uid ?? usable[0]?.uid ?? null;
    let sacrifice = false;
    const boosts = new Set<string>();
    let first = true;
    const render = () => {
      const card = pool.find(c => c.uid === sel);
      const avail = card ? [...g.boostsFor(h, card), ...g.optionalPerms(h)] : [];
      for (const b of [...boosts]) if (!avail.some(x => x.uid === b)) boosts.delete(b);
      const prev = card ? g.attackDicePreview(h, card, t, [...boosts]) : null;
      const pierce = !!card && g.piercing(h, card);
      const defDice = pierce ? 0 : g.defenseDice(t, h, card ? CARDS[card.defId].attackType : undefined);
      const html = `<div class="bt-box">
        <div class="bt-head"><span class="bt-reason">Batalha</span><span class="bt-title">Escolha a arma</span><button class="bt-x" title="Cancelar (Esc)">✕</button></div>
        <div class="bt-arena">${this.fighterHtml(h, 'left', h.wounds)}<div class="bt-vs">VS</div>${this.fighterHtml(t, 'right', t.wounds)}</div>
        <div class="bt-weapons">${pool.map(c => {
          const d = CARDS[c.defId];
          const can = usable.includes(c);
          const why = c.exhausted ? 'Exaustada' : !can ? (d.fx.astral ? 'Alvo não está Perto de um Aliado' : d.attackType === 'melee' ? 'Alvo não está Perto' : 'Sem Linha de Visão') : '';
          const pv = can ? g.attackDicePreview(h, c, t).dice : d.dice;
          return `<button class="bt-weapon ${c.uid === sel ? 'sel' : ''}" data-uid="${c.uid}" ${can ? '' : 'disabled'} style="--lv:${itemColor(c.defId)}">
            <div class="bw-art ${CARD_ART[c.defId]?.kind === 'fill' ? 'fill' : ''}">${itemArt(c.defId)}</div>
            <b>${d.name}</b><span class="bw-dice">${medal(d.attackType === 'melee' ? 'melee' : 'ranged', pv, `${pv} dado${pv > 1 ? 's' : ''} de ataque ${d.attackType === 'melee' ? 'Próximo' : 'a Distância'}`, pv > d.dice ? 'up' : '')}</span>
            <small>${d.attackType === 'melee' ? 'Próximo' : 'Distância'} · ${d.group}</small>${d.text ? `<em>${richText(d.text)}</em>` : ''}${why ? `<i>${why}</i>` : ''}</button>`;
        }).join('')}</div>
        <div class="bt-preview">${prev
          ? `Você rola <b>${prev.dice}</b> dado${prev.dice > 1 ? 's' : ''} de ataque${prev.notes.length ? ` <span class="bt-notes">(${prev.notes.join(', ')})</span>` : ''} · ${MONSTERS[t.defId]?.name ?? HEROES[t.defId].name} rola <b>${defDice}</b> de defesa${t.stunned ? ' (Atordoado)' : ''}`
          : 'Nenhuma arma consegue atingir este alvo agora.'}</div>
        <div class="bt-hint">${t.kind === 'monster' ? `Atenção: ${MONSTERS[t.defId].name} faz <b>Reação de Vingança</b> se sobreviver (Extermínio com ${MONSTERS[t.defId].exterm}+ Ferimentos num só ataque evita).` : 'Matar um Herói inimigo cumpre a Missão contra Jogador e rende 1 moeda.'}</div>
        <div class="bt-boostwrap">${avail.length ? `<div class="bt-boosts"><b>Ampliações:</b> ${avail.map(b => { const d = CARDS[b.defId]; return `<label title="${d.text}"><input type="checkbox" data-boost="${b.uid}" ${boosts.has(b.uid) ? 'checked' : ''}/> ${d.name}${d.fx.selfWound || (d.kind === 'permanent' && d.fx.grrr) ? ' <small>(fere você)</small>' : ''}</label>`; }).join('')}</div>` : ''}</div>
        ${g.canSacrifice(h) ? `<label class="bt-sac"><input type="checkbox" id="bt-sac" ${sacrifice ? 'checked' : ''}/> <b>Autossacrifício</b>: sofrer 1 Ferimento em vez de exaustar a carta</label>` : ''}
        <div class="bt-btns"><button class="bt-cancel">Cancelar</button><button class="primary bt-go" ${sel ? '' : 'disabled'}>⚔ Atacar</button></div>
      </div>`;
      if (first) {
        first = false;
        this.el.innerHTML = html;
        this.mountFighters(h, t);
      } else {
        // trocar a arma: só atualiza seleção, prévia e ampliações (sem redesenhar os bonecos e as artes: não pisca)
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        for (const q of ['.bt-preview', '.bt-boostwrap', '.bt-btns']) this.el.querySelector(q)?.replaceWith(tmp.querySelector(q)!);
        const sac0 = this.el.querySelector('.bt-sac'), sac1 = tmp.querySelector('.bt-sac');
        if (sac0 && sac1) sac0.replaceWith(sac1);
        this.el.querySelectorAll<HTMLElement>('.bt-weapon').forEach(b => b.classList.toggle('sel', b.dataset.uid === sel));
      }
      this.el.querySelectorAll<HTMLButtonElement>('.bt-weapon').forEach(b => { b.onclick = () => { sel = b.dataset.uid!; this.onPrepSelect?.(sel); render(); }; });
      this.el.querySelectorAll<HTMLInputElement>('[data-boost]').forEach(cb => { cb.onchange = () => { if (cb.checked) boosts.add(cb.dataset.boost!); else boosts.delete(cb.dataset.boost!); render(); }; });
      const sac = this.el.querySelector('#bt-sac') as HTMLInputElement | null;
      if (sac) sac.onchange = () => { sacrifice = sac.checked; };
      (this.el.querySelector('.bt-x') as HTMLElement).onclick = () => this.cancel();
      (this.el.querySelector('.bt-cancel') as HTMLElement).onclick = () => this.cancel();
      (this.el.querySelector('.bt-go') as HTMLElement).onclick = () => {
        if (!sel) return;
        this.mode = 'play';
        const go = this.el.querySelector('.bt-go') as HTMLButtonElement;
        go.disabled = true;
        onAttack(sel, sacrifice, [...boosts]);
      };
    };
    render();
    this.show();
  }

  /** Online: outro jogador está escolhendo como atacar — a mesma tela, só para ver (a arma marcada acompanha a dele). */
  spectatePrepare(heroId: string, targetId: string, cardUid: string | null, who: string) {
    if (this.mode === 'prepare' || this.mode === 'play') return;
    const g = this.deps.game();
    const h = g.unit(heroId), t = g.unit(targetId);
    if (!h || !t) return;
    const fresh = this.mode !== 'spectate' || this.prepTarget !== targetId;
    this.mode = 'spectate';
    this.prepTarget = targetId;
    this.carry = null;
    const pool = g.attackCardPool(h);
    const weapons = pool.map(c => {
      const d = CARDS[c.defId];
      return `<button class="bt-weapon ${c.uid === cardUid ? 'sel' : ''}" data-uid="${c.uid}" disabled style="--lv:${itemColor(c.defId)}">
        <div class="bw-art ${CARD_ART[c.defId]?.kind === 'fill' ? 'fill' : ''}">${itemArt(c.defId)}</div>
        <b>${d.name}</b><span class="bw-dice">${medal(d.attackType === 'melee' ? 'melee' : 'ranged', d.dice, `${d.dice} dados de ataque`)}</span>
        <small>${d.attackType === 'melee' ? 'Próximo' : 'Distância'} · ${d.group}</small></button>`;
    }).join('');
    if (fresh) {
      this.el.innerHTML = `<div class="bt-box">
        <div class="bt-head"><span class="bt-reason">Batalha</span><span class="bt-title">⚔ ${who} está escolhendo o ataque</span></div>
        <div class="bt-arena">${this.fighterHtml(h, 'left', h.wounds)}<div class="bt-vs">VS</div>${this.fighterHtml(t, 'right', t.wounds)}</div>
        <div class="bt-weapons">${weapons}</div>
        <div class="bt-btns"><span class="bt-wait">⏳ Aguardando ${who} atacar…</span></div>
      </div>`;
      this.mountFighters(h, t);
      this.show();
    } else {
      this.el.querySelectorAll<HTMLElement>('.bt-weapon').forEach(b => b.classList.toggle('sel', b.dataset.uid === cardUid));
    }
  }
  /** O outro jogador desistiu do ataque: fecha a tela de ver. */
  closeSpectate() { if (this.mode === 'spectate') this.close(); }

  cancel() {
    if (this.mode !== 'prepare') return;
    this.close();
    this.onCancel?.();
  }

  // ---------------------------------------------------------------
  // Resolução animada de um ataque (herói ou monstro)
  // ---------------------------------------------------------------
  async playAttack(e: AttackEvent, done: () => void) {
    const g = this.deps.game();
    const atk = g.unit(e.attackerId);
    const main = g.unit(e.targets[0].id);
    const sp = this.deps.speed();
    const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms / sp));
    // Reação de Monstro: quem rola é o jogador que controla os Monstros (com o botão de ✷, igual ao Herói)
    const humanAtk = atk.kind === 'hero' ? this.deps.isHuman(atk) : !!e.ctl && this.deps.isMineGuild(e.ctl);
    const humanInvolved = humanAtk || e.targets.some(t => { const u = g.unit(t.id); return u.kind === 'hero' && this.deps.isHuman(u); });
    // online: dados de quem joga em outro computador esperam o clique dele (aparecem juntos para todos)
    diceSync.begin(e);
    const atkOwner = atk.kind === 'hero' ? atk.guild : e.ctl;
    const atkRemote = !humanAtk && diceSync.remote(atkOwner);
    const reason = { heroi: 'Ataque', alerta: 'Reação de Alerta!', vinganca: 'Reação de Vingança!', armadilha: 'Armadilha', lapide: 'Lápide: Monstro ativado!' }[e.reason];
    const before = new Map(e.targets.map(t => [t.id, this.deps.viewWounds(t.id)]));
    const atkWounds = this.deps.viewWounds(atk.id);

    this.mode = 'play';
    const c = this.carry && this.carry.attackerId === e.attackerId ? this.carry : null;
    this.carry = null;
    if (!c) {
      this.buildPlay(atk, e.targets.map(t => g.unit(t.id)), reason, e.reason !== 'heroi', atkWounds, before.get(main.id)!);
      this.show();
    }
    // título com a carta e os dados; observações do ataque
    (this.el.querySelector('.bt-title') as HTMLElement).innerHTML = `${e.cardName} ${medal(e.attackType === 'melee' ? 'melee' : 'ranged', e.baseDice ?? e.dice.length, `${e.baseDice ?? e.dice.length} dados de ataque ${e.attackType === 'melee' ? 'Próximo' : 'a Distância'}`, 'bt-medal')}`;
    const notesEl = this.el.querySelector('.bt-notes.center') as HTMLElement | null;
    if (notesEl) notesEl.innerHTML = e.notes.join(' · ');
    for (const t of e.targets) this.defWrap(t.id);
    const btns = this.el.querySelector('.bt-btns') as HTMLElement;
    const waitRemote = async (who: GuildId, step: string, what: string, ms?: number) => {
      const b = this.el.querySelector('.bt-btns') as HTMLElement;
      b.innerHTML = `<span class="bt-wait">⏳ Aguardando ${diceSync.net?.name(who) ?? ''} ${what}…</span>`;
      await diceSync.wait(step, ms);
      b.innerHTML = '';
    };
    const button = (label: string, primary = true) => new Promise<void>(res => {
      btns.innerHTML = `<button class="${primary ? 'primary' : ''} bt-act">${label}</button>`;
      const b = btns.querySelector('.bt-act') as HTMLButtonElement;
      this.resolveBtn = () => { btns.innerHTML = ''; res(); };
      b.onclick = () => this.resolveBtn?.();
      b.focus();
    });

    // --- ataque (se a Rerrolagem foi decidida aqui, só os dados escolhidos giram de novo)
    const atkTray = this.el.querySelector('.bt-tray.atk') as HTMLElement;
    if (c?.atk) {
      if (!c.atk.settled && c.atk.idx.length) await rerollDice(atkTray, c.atk.dice, { before: c.atk.before, idx: c.atk.idx, asked: true }, e.dice, e.attackType, true, sp, () => this.newDie(atkTray, true), () => this.stopPickSpin(), n => this.critAsk(atkTray, n, humanAtk, sp));
    } else if (!c && e.spread) {
      // dano espalhado: os dados são os mesmos do ataque anterior (já rolados)
      await this.rollTray(atkTray, e.dice, e.attackType, ATK_FACES, sp, true);
      await wait(350);
    } else if (!c) {
      if (humanAtk && atk.kind === 'monster') await button(`🎲 Rolar ataque de ${g.name(atk)} (${e.baseDice ?? e.dice.length} dado${(e.baseDice ?? e.dice.length) > 1 ? 's' : ''})`);
      else if (atkRemote && !e.rr?.asked) await waitRemote(atkOwner!, 'atk', 'rolar o ataque');
      else if (!humanAtk || e.reason !== 'heroi') await wait(450);
      if (humanAtk && !e.rr?.asked) diceSync.mine('atk');
      const f = this.fighter(atk.id);
      if (f) f.lungeT = performance.now() + 500 / sp;
      await this.rollWithReroll(atkTray, e.dice, e.attackType, ATK_FACES, sp, e.rr, e.baseDice, humanAtk, atkRemote, 'atk');
    }
    (this.el.querySelector('.bt-count.atk') as HTMLElement).innerHTML = `<b>${e.hits}</b> acerto${e.hits === 1 ? '' : 's'}${e.crits ? ` <span class="crit">(${e.crits} crítico${e.crits > 1 ? 's' : ''})</span>` : ''}`;

    // --- defesa (por alvo)
    const result = this.el.querySelector('.bt-result') as HTMLElement;
    for (let i = 0; i < e.targets.length; i++) {
      const t = e.targets[i];
      const tu = g.unit(t.id);
      const wrap = this.defWrap(t.id);
      const tray = wrap.querySelector('.bt-tray') as HTMLElement;
      const count = wrap.querySelector('.bt-count') as HTMLElement;
      if (c?.def && c.def.heroId === t.id) {
        // Defesa já rolada nesta tela (Rerrolagem): só os escolhidos giram de novo
        if (c.def.idx.length) await rerollDice(tray, c.def.dice, { before: c.def.before, idx: c.def.idx, asked: true }, t.defense, 'shield', false, sp, () => this.newDie(tray, false), () => this.stopPickSpin(), n => this.critAsk(tray, n, true, sp));
        count.innerHTML = `<b>${t.blocks}</b> bloqueio${t.blocks === 1 ? '' : 's'}`;
        continue;
      }
      // a Defesa rola sempre, mesmo sem acertos (regra)
      if (t.stunnedNoDefense) { tray.innerHTML = '<span class="muted">✷ Atordoado — não rola Defesa</span>'; }
      else if (!t.defense.length) { tray.innerHTML = '<span class="muted">Sem dados de Defesa</span>'; }
      else {
        const mineDef = tu.kind === 'hero' && this.deps.isHuman(tu);
        const defRemote = !mineDef && tu.kind === 'hero' && diceSync.remote(tu.guild);
        if (mineDef) await button(`🛡 Defender ${HEROES[tu.defId].name} (${t.defense.length - t.defense.filter(x => x === 'crit').length} dado${t.defense.length > 1 ? 's' : ''})`);
        else if (defRemote && !t.rr?.asked) await waitRemote(tu.guild!, `def:${t.id}`, 'rolar a defesa');
        else await wait(400);
        if (mineDef && !t.rr?.asked) diceSync.mine(`def:${t.id}`);
        await this.rollWithReroll(tray, t.defense, 'shield', DEF_FACES, sp, t.rr, undefined, mineDef, defRemote, `def:${t.id}`);
        count.innerHTML = `<b>${t.blocks}</b> bloqueio${t.blocks === 1 ? '' : 's'}`;
      }
    }

    // --- resultado + barra de vida
    const lines: string[] = [];
    for (const t of e.targets) {
      const tu = g.unit(t.id);
      const max = g.maxHp(tu);
      const b = before.get(t.id)!;
      const after = Math.min(max, b + t.wounds);
      const dead = after >= max;
      lines.push(t.wounds
        ? `<div class="bad">${g.name(tu)}: −${t.wounds} Ferimento${t.wounds > 1 ? 's' : ''}${dead ? ' — <b>DERROTADO!</b>' : ''}</div>`
        : `<div class="good">${g.name(tu)}: nenhum Ferimento!</div>`);
      const fe = this.el.querySelector(`[data-fid="${t.id}"]`) as HTMLElement | null;
      if (fe && t.wounds) {
        const fi = this.fighter(t.id);
        if (fi) fi.hurtT = performance.now();
        (fe.querySelector('.bt-hp i') as HTMLElement).style.width = `${(Math.max(0, max - after) / max) * 100}%`;
        (fe.querySelector('.bt-hp span') as HTMLElement).textContent = `❤ ${Math.max(0, max - after)}/${max}`;
        const md = fe.querySelector('.bt-medals') as HTMLElement | null;
        if (md) md.innerHTML = this.medals(tu, Math.max(0, max - after));
        fe.classList.add('hit');
      }
    }
    result.innerHTML = lines.join('');
    // online: todas as telas seguem juntas — cada envolvido avisa quando terminou (Continuar aqui, ou o fim dos dados no "Nunca")
    const players = diceSync.players(e, id => g.unit(id).kind === 'hero' ? g.unit(id).guild : null);
    if (humanInvolved) await button('Continuar ▶');
    else if (!players.some(p => diceSync.remote(p))) await wait(1300);
    else await wait(600);
    await diceSync.finish(players, p => this.deps.isMineGuild(p), who => {
      (this.el.querySelector('.bt-btns') as HTMLElement).innerHTML = `<span class="bt-wait">⏳ Aguardando ${who} continuar…</span>`;
    });
    (this.el.querySelector('.bt-btns') as HTMLElement).innerHTML = '';
    this.linger(sp);
    done();
  }

  /** Monta a tela de luta (lutadores e bandejas vazias). */
  private buildPlay(atk: Unit, targets: Unit[], reason: string, react: boolean, atkWounds: number, mainWounds: number) {
    const g = this.deps.game();
    const main = targets[0];
    this.el.innerHTML = `<div class="bt-box">
      <div class="bt-head"><span class="bt-reason ${react ? 'react' : ''}">${reason}</span><span class="bt-title"></span></div>
      <div class="bt-arena">${this.fighterHtml(atk, 'left', atkWounds)}<div class="bt-vs">VS</div>${main ? this.fighterHtml(main, 'right', mainWounds) : ''}</div>
      <div class="bt-notes center"></div>
      <div class="bt-tray-wrap"><div class="bt-lbl">Ataque</div><div class="bt-tray atk"></div><div class="bt-count atk"></div></div>
      ${targets.map(t => `<div class="bt-tray-wrap def" data-tid="${t.id}"><div class="bt-lbl">Defesa · ${g.name(t)}</div><div class="bt-tray def"></div><div class="bt-count def"></div></div>`).join('')}
      <div class="bt-result"></div>
      <div class="bt-btns"></div>
    </div>`;
    if (main) this.mountFighters(atk, main);
  }

  /** Bandeja de Defesa de um alvo (cria se ainda não existir). */
  private defWrap(id: string): HTMLElement {
    let w = this.el.querySelector<HTMLElement>(`.bt-tray-wrap.def[data-tid="${id}"]`);
    if (!w) {
      w = document.createElement('div');
      w.className = 'bt-tray-wrap def';
      w.dataset.tid = id;
      w.innerHTML = `<div class="bt-lbl">Defesa · ${this.deps.game().name(this.deps.game().unit(id))}</div><div class="bt-tray def"></div><div class="bt-count def"></div>`;
      this.el.querySelector('.bt-result')?.before(w);
    }
    return w;
  }

  private newDie(tray: HTMLElement, black: boolean) {
    const d = document.createElement('div');
    d.className = `bdie ${black ? 'black' : 'white'} rolling`;
    d.innerHTML = '<span></span>';
    tray.append(d);
    return d;
  }

  /** Botão na própria tela (Rolar / Defender). */
  private ask(label: string, cls = '') {
    const btns = this.el.querySelector('.bt-btns') as HTMLElement;
    return new Promise<void>(res => {
      btns.innerHTML = `<button class="primary bt-act ${cls}">${label}</button>`;
      const b = btns.querySelector('.bt-act') as HTMLButtonElement;
      this.resolveBtn = () => { btns.innerHTML = ''; this.resolveBtn = null; res(); };
      b.onclick = () => this.resolveBtn?.();
      b.focus();
    });
  }

  /** Rerrolagem NESTA tela: rola os dados na bandeja e deixa escolher quais rolar de novo. */
  async decide(req: { heroId: string; target?: string; kind: 'attack' | 'defense'; faces: DieFace[]; success: DieFace; rerolls: number; base?: number; round?: number; vs?: { id: string; faces: DieFace[]; hits: number; type: string; base?: number }; card?: { name: string; type: string; dice: number } }): Promise<number[]> {
    const g = this.deps.game();
    const me = g.unit(req.heroId);
    const sp = Math.max(1, this.deps.speed());
    this.mode = 'play';
    diceSync.beginDecision(req);
    // ainda sobrou Rerrolagem: a próxima rodada continua com os mesmos dados na mesma bandeja
    if ((req.round ?? 1) > 1 && this.carry) {
      const c = this.carry;
      if (req.kind === 'attack' && c.atk && !c.atk.settled && c.attackerId === me.id) {
        const tray = this.el.querySelector('.bt-tray.atk') as HTMLElement;
        if (c.atk.idx.length) await rerollDice(tray, c.atk.dice, { before: c.atk.before, idx: c.atk.idx, asked: true }, req.faces, req.success, true, sp, () => this.newDie(tray, true), () => this.stopPickSpin(), n => this.critAsk(tray, n, true, sp));
        const idx = await this.pick(tray, c.atk.dice, req, this.el.querySelector('.bt-count.atk') as HTMLElement);
        c.atk = { dice: c.atk.dice, before: req.faces.slice(), idx, settled: false };
        return idx;
      }
      if (req.kind === 'defense' && c.def && c.def.heroId === me.id) {
        const wrap = this.defWrap(me.id);
        const tray = wrap.querySelector('.bt-tray') as HTMLElement;
        if (c.def.idx.length) await rerollDice(tray, c.def.dice, { before: c.def.before, idx: c.def.idx, asked: true }, req.faces, req.success, false, sp, () => this.newDie(tray, false), () => this.stopPickSpin(), n => this.critAsk(tray, n, true, sp));
        const idx = await this.pick(tray, c.def.dice, req, wrap.querySelector('.bt-count') as HTMLElement);
        c.def = { heroId: me.id, dice: c.def.dice, before: req.faces.slice(), idx };
        return idx;
      }
    }
    if (req.kind === 'attack') {
      // Monstro (Reação controlada por você): o alvo vem do pedido
      const mon = me.kind === 'monster';
      const tid = req.target ?? this.prepTarget;
      const tgt = tid ? g.unit(tid) : null;
      if (!this.carry || this.carry.attackerId !== me.id || !this.el.querySelector('.bt-tray.atk')) {
        this.buildPlay(me, tgt ? [tgt] : [], mon ? 'Reação!' : 'Ataque', mon, this.deps.viewWounds(me.id), tgt ? this.deps.viewWounds(tgt.id) : 0);
        if (req.card) (this.el.querySelector('.bt-title') as HTMLElement).innerHTML = `${req.card.name} ${medal(req.card.type === 'melee' ? 'melee' : 'ranged', req.card.dice, `${req.card.dice} dados de ataque`, 'bt-medal')}`;
        this.show();
        this.carry = { attackerId: me.id };
      }
      const tray = this.el.querySelector('.bt-tray.atk') as HTMLElement;
      tray.innerHTML = '';
      if (mon) await this.ask(`🎲 Rolar ataque de ${g.name(me)} (${req.base ?? req.faces.length} dado${(req.base ?? req.faces.length) > 1 ? 's' : ''})`);
      const f = this.fighter(me.id);
      if (f) f.lungeT = performance.now() + 500 / sp;
      diceSync.mine('roll'); // online: os outros veem a rolagem junto
      const dice = await this.rollTray(tray, req.faces, req.success, ATK_FACES, sp, false, req.base ?? req.card?.dice, true, false, 'roll');
      const idx = await this.pick(tray, dice, req, this.el.querySelector('.bt-count.atk') as HTMLElement);
      this.carry!.atk = { dice, before: req.faces.slice(), idx, settled: false };
      return idx;
    }
    // Defesa: primeiro o ataque de quem atacou, depois os seus dados
    const vs = req.vs!;
    const atkU = g.unit(vs.id);
    if (!this.carry || this.carry.attackerId !== atkU.id || !this.el.querySelector('.bt-tray.atk')) {
      this.buildPlay(atkU, [me], atkU.kind === 'monster' ? 'Reação!' : 'Ataque', atkU.kind === 'monster', this.deps.viewWounds(atkU.id), this.deps.viewWounds(me.id));
      this.show();
      this.carry = { attackerId: atkU.id };
      const at = this.el.querySelector('.bt-tray.atk') as HTMLElement;
      await this.rollTray(at, vs.faces, vs.type as DieFace, ATK_FACES, sp, false, vs.base, false);
      this.carry.atk = { dice: [], before: vs.faces.slice(), idx: [], settled: true };
    } else if (this.carry.atk && !this.carry.atk.settled) {
      const at = this.el.querySelector('.bt-tray.atk') as HTMLElement;
      if (this.carry.atk.idx.length) await rerollDice(at, this.carry.atk.dice, { before: this.carry.atk.before, idx: this.carry.atk.idx, asked: true }, vs.faces, vs.type as DieFace, true, sp, () => this.newDie(at, true), () => this.stopPickSpin());
      this.carry.atk.settled = true;
    }
    (this.el.querySelector('.bt-count.atk') as HTMLElement).innerHTML = `<b>${vs.hits}</b> acerto${vs.hits === 1 ? '' : 's'}`;
    const wrap = this.defWrap(me.id);
    const tray = wrap.querySelector('.bt-tray') as HTMLElement;
    tray.innerHTML = '';
    await this.ask(`🛡 Defender ${g.name(me)} (${req.faces.length} dado${req.faces.length > 1 ? 's' : ''})`);
    diceSync.mine('roll');
    const dice = await this.rollTray(tray, req.faces, req.success, DEF_FACES, sp, false, req.base, true, false, 'roll');
    const idx = await this.pick(tray, dice, req, wrap.querySelector('.bt-count') as HTMLElement);
    this.carry!.def = { heroId: me.id, dice, before: req.faces.slice(), idx };
    return idx;
  }

  /** Escolha dos dados para rerrolar, na própria bandeja (Enter confirma). */
  private pick(tray: HTMLElement, dice: HTMLElement[], req: { faces: DieFace[]; success: DieFace; rerolls: number; kind: string }, countEl: HTMLElement): Promise<number[]> {
    const ok = (f: DieFace) => f === 'crit' || f === req.success;
    const sel = new Set<number>();
    req.faces.forEach((f, i) => { if (!ok(f) && sel.size < req.rerolls) sel.add(i); });
    const btns = this.el.querySelector('.bt-btns') as HTMLElement;
    return new Promise(res => {
      const paint = () => {
        const hits = req.faces.filter(ok).length;
        dice.forEach((d, i) => d.classList.toggle('pick', sel.has(i)));
        const risky = [...sel].some(i => ok(req.faces[i]));
        countEl.innerHTML = `<b>${hits}</b> ${req.kind === 'attack' ? 'acerto' : 'bloqueio'}${hits === 1 ? '' : 's'} · <span class="bt-rrhint">↻ Rerrolagem ${req.rerolls}: toque nos dados para rolar de novo (${sel.size}/${req.rerolls})</span>${risky ? `<div class="rr-warn">⚠ Rerrolar um dado que já acertou pode fazer você perder esse ${req.kind === 'attack' ? 'acerto' : 'bloqueio'} — mas pode sair ✷ (crítico)!</div>` : ''}`;
        btns.innerHTML = `<button id="bt-keep">Manter</button><button class="primary" id="bt-rr" ${sel.size ? '' : 'disabled'}>↻ Rerrolar ${sel.size || ''}</button>`;
        (btns.querySelector('#bt-keep') as HTMLElement).onclick = () => finish([]);
        (btns.querySelector('#bt-rr') as HTMLElement).onclick = () => finish([...sel]);
      };
      dice.forEach((d, i) => {
        if (req.faces[i] === 'crit') return;
        d.classList.add('pickable');
        d.onclick = () => { if (sel.has(i)) sel.delete(i); else if (sel.size < req.rerolls) sel.add(i); paint(); };
      });
      const finish = (idx: number[]) => {
        this.pickConfirm = null;
        btns.innerHTML = '';
        dice.forEach(d => { d.onclick = null; d.classList.remove('pickable', 'pick'); });
        // os escolhidos já começam a girar; o resultado novo para nesta mesma tela
        for (const i of idx) { dice[i].classList.remove('hit', 'crit'); dice[i].classList.add('rolling', 'rerolling'); }
        if (idx.length) {
          countEl.innerHTML = '↻ Rerrolando…';
          play('dice', 0.8);
          const black = req.kind === 'attack';
          const pool: DieFace[] = black ? ['crit', 'melee', 'ranged', 'blank'] : ['crit', 'shield', 'blank', 'blank'];
          this.stopPickSpin();
          this.pickSpin = window.setInterval(() => tray.querySelectorAll<HTMLElement>('.bdie.rolling > span').forEach(x => { x.innerHTML = dieImg(pool[Math.floor(Math.random() * pool.length)], black); }), 70);
        }
        res(idx);
      };
      this.pickConfirm = () => finish([...sel]);
      paint();
    });
  }

  /** Rolagem com Rerrolagem: primeiro o resultado original; depois os dados escolhidos giram de novo. */
  private async rollWithReroll(tray: HTMLElement, faces: DieFace[], success: DieFace, pool: DieFace[], sp: number, rr?: RerollInfo, base?: number, mine = false, remote = false, tag = '') {
    if (!rr) { await this.rollTray(tray, faces, success, pool, sp, false, base, mine, remote, tag); return; }
    const dice = await this.rollTray(tray, rr.before, success, pool, sp, rr.asked, base, mine, remote, tag);
    if (!rr.idx.length) return;
    await new Promise(r => setTimeout(r, 450 / sp));
    await rerollDice(tray, dice, rr, faces, success, pool === ATK_FACES, sp, () => this.newDie(tray, pool === ATK_FACES), undefined, n => this.critAsk(tray, n, mine, sp));
  }

  /** ✷ Crítico: o seu = botão "Rolar +N dado" (você rola o extra); dos outros = aviso "✷ +N" e o dado rola sozinho. */
  private async critAsk(tray: HTMLElement, next: number, mine: boolean, sp: number, remote = false, step = '') {
    if (mine) { await this.ask(`✷ Crítico! Rolar +${next} dado${next > 1 ? 's' : ''}`, 'bt-crit'); if (step) diceSync.mine(step); return; }
    const tag = document.createElement('span');
    tag.className = 'bt-crittag';
    tag.textContent = `✷ +${next}`;
    tray.append(tag);
    // online: o dado extra só rola quando o dono clicar no ✷ na tela dele
    if (remote && step) await diceSync.wait(step); else await new Promise(r => setTimeout(r, 650 / sp));
    tag.remove();
  }

  /** Dados girando e parando um a um. Primeiro só os dados rolados de verdade (`base`);
   *  cada ✷ dá direito a +1 dado, rolado depois (o seu com clique). `instant`: já mostra o resultado. */
  private async rollTray(tray: HTMLElement, faces: DieFace[], success: DieFace, pool: DieFace[], sp: number, instant = false, base?: number, mine = false, remote = false, tag = ''): Promise<HTMLElement[]> {
    const cls = pool === ATK_FACES ? 'black' : 'white';
    const dice: HTMLElement[] = [];
    const add = () => { const d = this.newDie(tray, cls === 'black'); dice.push(d); return d; };
    const settle = (d: HTMLElement, f: DieFace) => {
      d.classList.remove('rolling');
      d.firstElementChild!.innerHTML = dieImg(f, cls === 'black');
      if (f === 'crit' || f === success) d.classList.add('hit');
      if (f === 'crit') { d.classList.add('crit'); d.setAttribute('title', 'Crítico! Rola um dado extra'); }
    };
    if (instant) { for (const f of faces) settle(add(), f); return dice; }
    const spin = window.setInterval(() => {
      for (const d of dice) if (d.classList.contains('rolling')) d.firstElementChild!.innerHTML = dieImg(pool[Math.floor(Math.random() * pool.length)], cls === 'black');
    }, 70);
    const crits = faces.filter(f => f === 'crit').length;
    let wave = Math.max(1, Math.min(faces.length, base ?? faces.length - crits));
    let shown = 0;
    const rollWave = async (n: number, ms: number) => {
      const fresh = Array.from({ length: n }, () => add());
      play('dice', 0.8);
      await new Promise(r => setTimeout(r, ms / sp));
      for (let i = 0; i < n; i++) { settle(fresh[i], faces[shown + i]); await new Promise(r => setTimeout(r, 170 / sp)); }
      shown += n;
    };
    if (faces.length) await rollWave(wave, 750);
    let k = 0;
    while (shown < faces.length) {
      const c = faces.slice(shown - wave, shown).filter(f => f === 'crit').length;
      const next = Math.min(faces.length - shown, c || faces.length - shown);
      await this.critAsk(tray, next, mine, sp, remote, `${tag}:crit${++k}`);
      wave = next;
      await rollWave(next, 500);
    }
    clearInterval(spin);
    return dice;
  }

  // ---------------------------------------------------------------
  // Rerrolagem: o jogador escolhe quais dados rolar de novo
  // ---------------------------------------------------------------
  private askEl: HTMLElement | null = null;
  private askResolve: ((idx: number[]) => void) | null = null;
  private askSel = new Set<number>();
  get isAsking() { return !!this.pickConfirm || !!this.askResolve || !!this.askRoll || (!!this.askEl && !this.askEl.classList.contains('hidden')); }

  private askRoll: (() => void) | null = null;
  async askReroll(req: { heroId: string; kind: 'attack' | 'defense'; faces: DieFace[]; success: DieFace; rerolls: number; vs?: { id: string; faces: DieFace[]; hits: number; type: string } }): Promise<number[]> {
    const g = this.deps.game();
    const h = g.unit(req.heroId);
    if (!this.askEl) { this.askEl = document.createElement('div'); this.askEl.id = 'rerollbox'; this.el.parentElement!.append(this.askEl); }
    const el = this.askEl;
    this.askSel = new Set();
    // sugestão: os dados que falharam
    req.faces.forEach((f, i) => { if (f !== 'crit' && f !== req.success && this.askSel.size < req.rerolls) this.askSel.add(i); });
    const ok = (f: DieFace) => f === 'crit' || f === req.success;
    const render = () => {
      const hits = req.faces.filter(ok).length;
      el.innerHTML = `<div class="rr-box">
        <div class="bt-head"><span class="bt-reason">↻ Rerrolagem</span><span class="bt-title">${g.name(h)} — ${req.kind === 'attack' ? 'rolagem de Ataque' : 'rolagem de Defesa'}</span></div>
        ${req.vs ? `<div class="rr-vs"><b>${g.name(g.unit(req.vs.id))}</b> atacou com <b>${req.vs.hits} acerto${req.vs.hits === 1 ? '' : 's'}</b></div>` : ''}
        <p>Você tem <b>${req.rerolls}</b> rerrolage${req.rerolls > 1 ? 'ns' : 'm'}. Clique nos dados que quer rolar de novo (o resultado novo substitui o antigo; ✷ crítico não pode ser rerrolado).</p>
        <div class="rr-dice">${req.faces.map((f, i) => `<button class="bdie ${req.kind === 'attack' ? 'black' : 'white'} ${ok(f) ? 'hit' : ''} ${f === 'crit' ? 'crit' : ''} ${this.askSel.has(i) ? 'pick' : ''}" data-i="${i}" ${f === 'crit' ? 'disabled' : ''}><span>${dieImg(f, req.kind === 'attack')}</span></button>`).join('')}</div>
        <div class="rr-sum">${hits} ${req.kind === 'attack' ? 'acerto' : 'bloqueio'}${hits === 1 ? '' : 's'} agora · selecionados: ${this.askSel.size}/${req.rerolls}</div>
        <div class="bt-btns"><button id="rr-keep">Manter resultado</button><button class="primary" id="rr-go" ${this.askSel.size ? '' : 'disabled'}>↻ Rerrolar ${this.askSel.size || ''}</button></div>
      </div>`;
      el.querySelectorAll<HTMLElement>('[data-i]').forEach(b => { b.onclick = () => {
        const i = Number(b.dataset.i);
        if (this.askSel.has(i)) this.askSel.delete(i); else if (this.askSel.size < req.rerolls) this.askSel.add(i);
        render();
      }; });
      (el.querySelector('#rr-keep') as HTMLElement).onclick = () => this.answer([]);
      (el.querySelector('#rr-go') as HTMLElement).onclick = () => this.answer([...this.askSel]);
    };
    // primeiro os dados rolam na tela; só depois dá para escolher quais rerrolar
    const black = req.kind === 'attack';
    const pool: DieFace[] = black ? ['crit', 'melee', 'ranged', 'blank'] : ['crit', 'shield', 'blank', 'blank'];
    const sp = Math.max(1, this.deps.speed());
    this.askReady = false;
    el.innerHTML = `<div class="rr-box">
      <div class="bt-head"><span class="bt-reason">↻ Rerrolagem</span><span class="bt-title">${g.name(h)} — ${black ? 'rolagem de Ataque' : 'rolagem de Defesa'}</span></div>
      ${req.vs ? `<div class="rr-vs"><b>${g.name(g.unit(req.vs.id))}</b> atacou: <span class="rr-vsd">${req.vs.faces.map(f => `<span class="bdie black ${f === 'crit' || f === req.vs!.type ? 'hit' : ''}"><span>${dieImg(f, true)}</span></span>`).join('')}</span> <b>${req.vs.hits} acerto${req.vs.hits === 1 ? '' : 's'}</b></div>` : ''}
      <p class="rr-msg">Clique para rolar os seus ${req.faces.length} dado${req.faces.length > 1 ? 's' : ''} de ${black ? 'Ataque' : 'Defesa'}.</p>
      <div class="rr-dice">${req.faces.map((_, i) => `<span class="bdie ${black ? 'black' : 'white'}" data-r="${i}"><span>${dieImg('blank', black)}</span></span>`).join('')}</div>
      <div class="bt-btns"><button class="primary" id="rr-roll">🎲 Rolar ${black ? 'ataque' : 'defesa'}</button></div></div>`;
    el.classList.remove('hidden');
    await new Promise<void>(res => { this.askRoll = res; const b = el.querySelector('#rr-roll') as HTMLElement; b.onclick = () => res(); b.focus(); });
    this.askRoll = null;
    (el.querySelector('.bt-btns') as HTMLElement).innerHTML = '';
    (el.querySelector('.rr-msg') as HTMLElement).textContent = 'Rolando os dados…';
    el.querySelectorAll('.bdie').forEach(d => d.classList.add('rolling'));
    play('dice', 0.8);
    const spin = window.setInterval(() => el.querySelectorAll<HTMLElement>('.bdie.rolling > span').forEach(s => { s.innerHTML = dieImg(pool[Math.floor(Math.random() * pool.length)], black); }), 70);
    req.faces.forEach((f, i) => setTimeout(() => {
      const d = el.querySelector<HTMLElement>(`[data-r="${i}"]`);
      if (!d) return;
      d.classList.remove('rolling');
      d.firstElementChild!.innerHTML = dieImg(f, black);
      if (ok(f)) d.classList.add('hit');
    }, (600 + i * 120) / sp));
    await new Promise(r => setTimeout(r, (900 + req.faces.length * 120) / sp));
    clearInterval(spin);
    this.askReady = true;
    render();
    return new Promise(res => { this.askResolve = res; });
  }

  /** Enter confirma a Rerrolagem sugerida. */
  confirmAsk() { if (this.pickConfirm) this.pickConfirm(); else if (this.resolveBtn) this.resolveBtn(); else if (this.askRoll) this.askRoll(); else if (this.askResolve && this.askReady) this.answer([...this.askSel]); }
  private askReady = true;

  private answer(idx: number[]) {
    const r = this.askResolve;
    this.askResolve = null;
    this.askReady = false;
    const el = this.askEl;
    if (!idx.length || !el) { el?.classList.add('hidden'); r?.(idx); return; }
    // os dados escolhidos giram; o resultado novo aparece em seguida na rolagem do ataque
    el.querySelectorAll<HTMLElement>('[data-i]').forEach(b => { if (idx.includes(Number(b.dataset.i))) b.classList.add('rolling', 'rerolling'); (b as HTMLButtonElement).disabled = true; });
    const btns = el.querySelector('.bt-btns');
    if (btns) btns.innerHTML = '<span class="muted">↻ Rerrolando…</span>';
    play('dice', 0.8);
    const black = !!el.querySelector('.bdie.black');
    const pool: DieFace[] = black ? ['crit', 'melee', 'ranged', 'blank'] : ['crit', 'shield', 'blank', 'blank'];
    const spin = window.setInterval(() => el.querySelectorAll<HTMLElement>('.bdie.rolling > span').forEach(x => { x.innerHTML = dieImg(pool[Math.floor(Math.random() * pool.length)], black); }), 70);
    setTimeout(() => { clearInterval(spin); el.classList.add('hidden'); r?.(idx); }, 700 / Math.max(1, this.deps.speed()));
  }

  /** Enter/Espaço aciona o botão atual (Defender / Continuar). */
  pressButton(): boolean {
    if (this.resolveBtn) { this.resolveBtn(); return true; }
    return false;
  }
}

/** Anima a Rerrolagem: os dados rerrolados ficam com borda verde, giram e param no novo valor; ✷ extras entram no fim. */
export async function rerollDice(_tray: HTMLElement, dice: HTMLElement[], rr: RerollInfo, final: DieFace[], success: DieFace, black: boolean, sp: number, add: () => HTMLElement, onStart?: () => void, critAsk?: (next: number) => Promise<void>) {
  onStart?.();
  const pool: DieFace[] = black ? ['crit', 'melee', 'ranged', 'blank'] : ['crit', 'shield', 'blank', 'blank'];
  const sel = rr.idx.map(i => dice[i]).filter(Boolean);
  for (const d of sel) { d.classList.remove('hit', 'crit'); d.classList.add('rolling', 'rerolling'); }
  play('dice', 0.8);
  const spin = window.setInterval(() => { for (const d of dice) if (d.classList.contains('rolling')) d.firstElementChild!.innerHTML = dieImg(pool[Math.floor(Math.random() * pool.length)], black); }, 70);
  await new Promise(r => setTimeout(r, 700 / sp));
  for (const i of rr.idx) {
    const d = dice[i];
    if (!d) continue;
    d.classList.remove('rolling');
    d.firstElementChild!.innerHTML = dieImg(final[i], black);
    if (final[i] === 'crit' || final[i] === success) d.classList.add('hit');
    if (final[i] === 'crit') d.classList.add('crit');
    await new Promise(r => setTimeout(r, 200 / sp));
  }
  // dados extras de críticos tirados na rerrolagem: depois dos rerrolados, em ondas (o seu com clique)
  let shown = rr.before.length;
  let lastCrits = rr.idx.filter(i => final[i] === 'crit').length;
  while (shown < final.length) {
    const next = Math.min(final.length - shown, lastCrits || final.length - shown);
    if (critAsk) await critAsk(next);
    const fresh: HTMLElement[] = [];
    for (let k = 0; k < next; k++) { const d = add(); dice.push(d); fresh.push(d); }
    play('dice', 0.8);
    await new Promise(r => setTimeout(r, 450 / sp));
    for (let k = 0; k < next; k++) {
      const d = fresh[k], f = final[shown + k];
      d.classList.remove('rolling');
      d.firstElementChild!.innerHTML = dieImg(f, black);
      if (f === 'crit' || f === success) d.classList.add('hit');
      if (f === 'crit') d.classList.add('crit');
      await new Promise(r => setTimeout(r, 170 / sp));
    }
    lastCrits = final.slice(shown, shown + next).filter(f => f === 'crit').length;
    shown += next;
  }
  clearInterval(spin);
  setTimeout(() => sel.forEach(d => d.classList.remove('rerolling')), 900 / sp);
}
