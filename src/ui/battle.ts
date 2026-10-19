import { CARDS, GUILDS, HEROES, MONSTERS } from '../engine/data';
import type { Game } from '../engine/game';
import type { DieFace, GameEvent, Unit } from '../engine/types';
import { charScale, drawCharacter } from '../render/chibi';

type AttackEvent = Extract<GameEvent, { t: 'attack' }>;

const FACE: Record<DieFace, string> = { crit: '✷', melee: '⚔', ranged: '➶', shield: '⛨', blank: '–' };
const ATK_FACES: DieFace[] = ['crit', 'melee', 'melee', 'ranged', 'ranged', 'blank'];
const DEF_FACES: DieFace[] = ['crit', 'shield', 'shield', 'blank', 'blank', 'blank'];

export interface BattleDeps {
  game: () => Game;
  speed: () => number;
  viewWounds: (id: string) => number;
  isHuman: (u: Unit) => boolean;
}

interface Fighter { id: string; canvas: HTMLCanvasElement; hurtT: number; lungeT: number; flip: boolean }

/** Tela de batalha 2D (no centro da tela) para escolher a arma, rolar ataque e defesa. */
export class BattlePanel {
  private el: HTMLElement;
  private deps: BattleDeps;
  private fighters: Fighter[] = [];
  private raf = 0;
  private resolveBtn: (() => void) | null = null;
  mode: 'closed' | 'prepare' | 'play' = 'closed';
  onCancel: (() => void) | null = null;

  constructor(root: HTMLElement, deps: BattleDeps) {
    this.deps = deps;
    this.el = document.createElement('div');
    this.el.id = 'battle';
    this.el.className = 'hidden';
    root.append(this.el);
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
      <div class="bt-name">${name}</div><div class="bt-sub">${sub}</div>
      <div class="bt-hp"><i style="width:${(hp / max) * 100}%"></i><span>❤ ${hp}/${max}</span></div>
      <div class="bt-stats">⛨ ${g.defenseDice(u)} defesa${u.stunned ? ' · <b class="stun">✷ Atordoado</b>' : ''}</div>
    </div>`;
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
    this.el.classList.remove('hidden');
    this.el.classList.remove('anim');
    void this.el.offsetWidth;
    this.el.classList.add('anim');
  }

  close() {
    this.mode = 'closed';
    cancelAnimationFrame(this.raf);
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
    this.resolveBtn = null;
  }

  // ---------------------------------------------------------------
  // Preparação: escolher a arma e clicar em Atacar
  // ---------------------------------------------------------------
  openPrepare(heroId: string, targetId: string, preselect: string | null, onAttack: (cardUid: string, sacrifice: boolean, boosts: string[]) => void, onCancel: () => void) {
    const g = this.deps.game();
    const h = g.unit(heroId), t = g.unit(targetId);
    this.mode = 'prepare';
    this.onCancel = onCancel;
    const usable = h.cards.filter(c => !c.exhausted && g.canCardHit(h, c, h.cell!, t));
    let sel = usable.find(c => c.uid === preselect)?.uid ?? usable[0]?.uid ?? null;
    let sacrifice = false;
    const boosts = new Set<string>();
    const render = () => {
      const card = h.cards.find(c => c.uid === sel);
      const avail = card ? [...g.boostsFor(h, card), ...g.optionalPerms(h)] : [];
      for (const b of [...boosts]) if (!avail.some(x => x.uid === b)) boosts.delete(b);
      const prev = card ? g.attackDicePreview(h, card, t, [...boosts]) : null;
      const pierce = !!card && g.ab(h) === 'magia_perfurante' && !!CARDS[card.defId].magic;
      const defDice = pierce ? 0 : g.defenseDice(t, h);
      this.el.innerHTML = `<div class="bt-box">
        <div class="bt-head"><span class="bt-reason">Batalha</span><span class="bt-title">Escolha a arma</span><button class="bt-x" title="Cancelar (Esc)">✕</button></div>
        <div class="bt-arena">${this.fighterHtml(h, 'left', h.wounds)}<div class="bt-vs">VS</div>${this.fighterHtml(t, 'right', t.wounds)}</div>
        <div class="bt-weapons">${h.cards.filter(c => CARDS[c.defId].kind === 'attack').map(c => {
          const d = CARDS[c.defId];
          const can = usable.includes(c);
          const why = c.exhausted ? 'Exaustada' : !can ? (d.fx.astral ? 'Alvo não está Perto de um Aliado' : d.attackType === 'melee' ? 'Alvo não está Perto' : 'Sem Linha de Visão') : '';
          const pv = can ? g.attackDicePreview(h, c, t).dice : d.dice;
          return `<button class="bt-weapon ${c.uid === sel ? 'sel' : ''}" data-uid="${c.uid}" ${can ? '' : 'disabled'}>
            <b>${d.name}</b><span class="bw-dice">${d.attackType === 'melee' ? '⚔' : '➶'} ${pv} dado${pv > 1 ? 's' : ''}</span>
            <small>${d.attackType === 'melee' ? 'Próximo' : 'Distância'} · ${d.group}</small>${d.text ? `<em>${d.text}</em>` : ''}${why ? `<i>${why}</i>` : ''}</button>`;
        }).join('')}</div>
        <div class="bt-preview">${prev
          ? `Você rola <b>${prev.dice}</b> dado${prev.dice > 1 ? 's' : ''} de ataque${prev.notes.length ? ` <span class="bt-notes">(${prev.notes.join(', ')})</span>` : ''} · ${MONSTERS[t.defId]?.name ?? HEROES[t.defId].name} rola <b>${defDice}</b> de defesa${t.stunned ? ' (Atordoado)' : ''}`
          : 'Nenhuma arma consegue atingir este alvo agora.'}</div>
        <div class="bt-hint">${t.kind === 'monster' ? `Atenção: ${MONSTERS[t.defId].name} faz <b>Reação de Vingança</b> se sobreviver (Extermínio com ${MONSTERS[t.defId].exterm}+ Ferimentos num só ataque evita).` : 'Matar um Herói inimigo cumpre a Missão contra Jogador e rende 1 moeda.'}</div>
        ${avail.length ? `<div class="bt-boosts"><b>Ampliações:</b> ${avail.map(b => { const d = CARDS[b.defId]; return `<label title="${d.text}"><input type="checkbox" data-boost="${b.uid}" ${boosts.has(b.uid) ? 'checked' : ''}/> ${d.name}${d.fx.selfWound || (d.kind === 'permanent' && d.fx.grrr) ? ' <small>(fere você)</small>' : ''}</label>`; }).join('')}</div>` : ''}
        ${g.canSacrifice(h) ? `<label class="bt-sac"><input type="checkbox" id="bt-sac" ${sacrifice ? 'checked' : ''}/> <b>Autossacrifício</b>: sofrer 1 Ferimento em vez de exaustar a carta</label>` : ''}
        <div class="bt-btns"><button class="bt-cancel">Cancelar</button><button class="primary bt-go" ${sel ? '' : 'disabled'}>⚔ Atacar</button></div>
      </div>`;
      this.mountFighters(h, t);
      this.el.querySelectorAll<HTMLButtonElement>('.bt-weapon').forEach(b => { b.onclick = () => { sel = b.dataset.uid!; render(); }; });
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
    const humanAtk = atk.kind === 'hero' && this.deps.isHuman(atk);
    const humanInvolved = humanAtk || e.targets.some(t => { const u = g.unit(t.id); return u.kind === 'hero' && this.deps.isHuman(u); });
    const reason = { heroi: 'Ataque', alerta: 'Reação de Alerta!', vinganca: 'Reação de Vingança!', armadilha: 'Armadilha' }[e.reason];
    const before = new Map(e.targets.map(t => [t.id, this.deps.viewWounds(t.id)]));
    const atkWounds = this.deps.viewWounds(atk.id);

    this.mode = 'play';
    this.el.innerHTML = `<div class="bt-box">
      <div class="bt-head"><span class="bt-reason ${e.reason !== 'heroi' ? 'react' : ''}">${reason}</span><span class="bt-title">${e.cardName} <small>${e.attackType === 'melee' ? '⚔ Próximo' : '➶ Distância'}</small></span></div>
      <div class="bt-arena">${this.fighterHtml(atk, 'left', atkWounds)}<div class="bt-vs">VS</div>${this.fighterHtml(main, 'right', before.get(main.id)!)}</div>
      ${e.notes.length ? `<div class="bt-notes center">${e.notes.join(' · ')}</div>` : ''}
      <div class="bt-tray-wrap"><div class="bt-lbl">Ataque</div><div class="bt-tray atk"></div><div class="bt-count atk"></div></div>
      ${e.targets.map((t, i) => `<div class="bt-tray-wrap def" data-ti="${i}"><div class="bt-lbl">Defesa · ${g.name(g.unit(t.id))}</div><div class="bt-tray def"></div><div class="bt-count def"></div></div>`).join('')}
      <div class="bt-result"></div>
      <div class="bt-btns"></div>
    </div>`;
    this.mountFighters(atk, main);
    this.show();
    const btns = this.el.querySelector('.bt-btns') as HTMLElement;
    const button = (label: string, primary = true) => new Promise<void>(res => {
      btns.innerHTML = `<button class="${primary ? 'primary' : ''} bt-act">${label}</button>`;
      const b = btns.querySelector('.bt-act') as HTMLButtonElement;
      this.resolveBtn = () => { btns.innerHTML = ''; res(); };
      b.onclick = () => this.resolveBtn?.();
      b.focus();
    });

    // --- ataque
    if (!humanAtk || e.reason !== 'heroi') await wait(450);
    const f = this.fighter(atk.id);
    if (f) f.lungeT = performance.now() + 500 / sp;
    await this.rollTray(this.el.querySelector('.bt-tray.atk') as HTMLElement, e.dice, e.attackType, ATK_FACES, sp);
    (this.el.querySelector('.bt-count.atk') as HTMLElement).innerHTML = `<b>${e.hits}</b> acerto${e.hits === 1 ? '' : 's'}${e.crits ? ` <span class="crit">(${e.crits} crítico${e.crits > 1 ? 's' : ''})</span>` : ''}`;

    // --- defesa (por alvo)
    const result = this.el.querySelector('.bt-result') as HTMLElement;
    for (let i = 0; i < e.targets.length; i++) {
      const t = e.targets[i];
      const tu = g.unit(t.id);
      const wrap = this.el.querySelector(`.bt-tray-wrap.def[data-ti="${i}"]`) as HTMLElement;
      const tray = wrap.querySelector('.bt-tray') as HTMLElement;
      const count = wrap.querySelector('.bt-count') as HTMLElement;
      if (e.hits === 0) { tray.innerHTML = '<span class="muted">Nenhum acerto para bloquear</span>'; continue; }
      if (t.stunnedNoDefense) { tray.innerHTML = '<span class="muted">✷ Atordoado — não rola Defesa</span>'; }
      else if (!t.defense.length) { tray.innerHTML = '<span class="muted">Sem dados de Defesa</span>'; }
      else {
        if (tu.kind === 'hero' && this.deps.isHuman(tu)) await button(`🛡 Defender ${HEROES[tu.defId].name} (${t.defense.length - t.defense.filter(x => x === 'crit').length} dado${t.defense.length > 1 ? 's' : ''})`);
        else await wait(400);
        await this.rollTray(tray, t.defense, 'shield', DEF_FACES, sp);
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
        fe.classList.add('hit');
      }
    }
    result.innerHTML = lines.join('');
    if (humanInvolved) await button('Continuar ▶');
    else await wait(1300);
    this.close();
    done();
  }

  /** Dados girando e parando um a um; críticos fazem surgir um dado extra. */
  private async rollTray(tray: HTMLElement, faces: DieFace[], success: DieFace, pool: DieFace[], sp: number) {
    const cls = pool === ATK_FACES ? 'black' : 'white';
    const crits = faces.filter(f => f === 'crit').length;
    let visible = Math.max(0, faces.length - crits);
    const dice: HTMLElement[] = [];
    const add = () => {
      const d = document.createElement('div');
      d.className = `bdie ${cls} rolling`;
      d.innerHTML = '<span></span>';
      tray.append(d);
      dice.push(d);
    };
    for (let i = 0; i < visible; i++) add();
    const spin = window.setInterval(() => {
      for (const d of dice) if (d.classList.contains('rolling')) d.firstElementChild!.textContent = FACE[pool[Math.floor(Math.random() * pool.length)]];
    }, 70);
    await new Promise(r => setTimeout(r, 750 / sp));
    for (let i = 0; i < faces.length; i++) {
      if (i >= dice.length) { add(); await new Promise(r => setTimeout(r, 380 / sp)); }
      const d = dice[i];
      const f = faces[i];
      d.classList.remove('rolling');
      d.firstElementChild!.textContent = FACE[f];
      if (f === 'crit' || f === success) d.classList.add('hit');
      if (f === 'crit') { d.classList.add('crit'); d.setAttribute('title', 'Crítico! Rola um dado extra'); }
      await new Promise(r => setTimeout(r, 170 / sp));
    }
    clearInterval(spin);
  }

  // ---------------------------------------------------------------
  // Rerrolagem: o jogador escolhe quais dados rolar de novo
  // ---------------------------------------------------------------
  private askEl: HTMLElement | null = null;
  private askResolve: ((idx: number[]) => void) | null = null;
  private askSel = new Set<number>();
  get isAsking() { return !!this.askResolve; }

  askReroll(req: { heroId: string; kind: 'attack' | 'defense'; faces: DieFace[]; success: DieFace; rerolls: number }): Promise<number[]> {
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
        <div class="bt-head"><span class="bt-reason">↻ Rerrolagem</span><span class="bt-title">${HEROES[h.defId].name} — ${req.kind === 'attack' ? 'rolagem de Ataque' : 'rolagem de Defesa'}</span></div>
        <p>Você tem <b>${req.rerolls}</b> rerrolage${req.rerolls > 1 ? 'ns' : 'm'}. Clique nos dados que quer rolar de novo (o resultado novo substitui o antigo; ✷ crítico não pode ser rerrolado).</p>
        <div class="rr-dice">${req.faces.map((f, i) => `<button class="bdie ${req.kind === 'attack' ? 'black' : 'white'} ${ok(f) ? 'hit' : ''} ${f === 'crit' ? 'crit' : ''} ${this.askSel.has(i) ? 'pick' : ''}" data-i="${i}" ${f === 'crit' ? 'disabled' : ''}><span>${FACE[f]}</span></button>`).join('')}</div>
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
    render();
    el.classList.remove('hidden');
    return new Promise(res => { this.askResolve = res; });
  }

  /** Enter confirma a Rerrolagem sugerida. */
  confirmAsk() { if (this.askResolve) this.answer([...this.askSel]); }

  private answer(idx: number[]) {
    const r = this.askResolve;
    this.askResolve = null;
    this.askEl?.classList.add('hidden');
    r?.(idx);
  }

  /** Enter/Espaço aciona o botão atual (Defender / Continuar). */
  pressButton(): boolean {
    if (this.resolveBtn) { this.resolveBtn(); return true; }
    return false;
  }
}
