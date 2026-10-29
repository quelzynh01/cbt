import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { BTG_MAPS } from '../../../src/engine/maps/beyondTheGrave';
import { SimpleAI } from '../../../src/ai/ai';
import { applyAction } from '../../../src/engine/actions';
import { ALL_HEROES, distributeStartingGear } from '../../../src/engine/data';
import { sameCell } from '../../../src/engine/board';
// OLD=1: versões antigas de unitsAt/status (para conferir que a otimização não muda nada)
if (process.env.OLD) {
  const P = Game.prototype as any;
  P.unitsAt = function (c: any) { return this.onBoard().filter((u: any) => sameCell(u.cell, c)); };
  P.status = function (mover: any, c: any) {
    const others = this.unitsAt(c).filter((u: any) => u.id !== mover.id && !this.isObject(u));
    if (others.length && this.monAbility(mover, 'shove')) return 'free';
    if (this.cellLoad(c, mover) + this.weight(mover) <= 2) return 'free';
    if (others.some((o: any) => this.monAbility(o, 'huge'))) return others.some((o: any) => this.monAbility(o, 'huge') && this.isEnemy(mover, o)) ? 'blocked' : 'occupied';
    return others.length >= 2 && others.every((o: any) => this.isEnemy(mover, o)) ? 'blocked' : 'occupied';
  };
}
const btg = new Set(BTG_MAPS.map(m => m.id));
let h = 0; const t0 = Date.now();
for (const map of Object.values(MAPS).filter(m => !btg.has(m.id) || process.env.BTG)) for (let s = 0; s < Number(process.argv[2] ?? 2); s++) {
  let x = 300 + s; const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const pool = ALL_HEROES.slice().sort(() => rnd() - 0.5);
  const players = (['azul', 'vermelho', 'verde'] as const).map((gid, i) => { const heroes = pool.slice(i * 3, i * 3 + 3); return { guild: gid, controller: 'ai' as const, heroes, cards: distributeStartingGear(heroes) }; });
  const g = Game.create(map, { seed: 300 + s, players }); g.drain();
  const ais: Record<string, SimpleAI> = Object.fromEntries(players.map(p => [p.guild, new SimpleAI('hard', rnd)]));
  for (const d of g.s.deploying ?? []) { for (const p of ais[d].deployPlan(g, d)) applyAction(g, d, { type: 'place', heroId: p.heroId, cell: p.cell }); applyAction(g, d, { type: 'ready' }); }
  for (let step = 0; step < 3000 && !g.s.winner; step++) {
    if (g.s.pending) { g.autoResolvePending(); continue; }
    const cur = g.currentGuild().id; const a = ais[cur].next(g) as any;
    if (!applyAction(g, cur, a.type === 'move' ? { ...a, openDoors: true } : a)) applyAction(g, cur, { type: 'end' });
    g.drain();
  }
  const js = JSON.stringify(g.s); for (let i = 0; i < js.length; i++) h = (h * 31 + js.charCodeAt(i)) | 0;
}
console.log('hash', h, 'tempo', Date.now() - t0, 'ms');
