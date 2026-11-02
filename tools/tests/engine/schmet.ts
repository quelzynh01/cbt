import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Machado de Schmetterling: cada ✷ causa 1 acerto adicional e cura 1 Ferimento de quem atacou
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const run = (dice: 'normal' | 'zero', wounds: number, seed = 5) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['machado_schmetterling'] } }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  g.s.debug.attackDice = dice;
  const grom = g.heroesOf('azul')[0];
  const mons = Object.values(g.s.units).filter(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object'));
  for (const m of mons) m.cell = null;
  mons.sort((a, b) => g.monDef(b, grom).hp - g.monDef(a, grom).hp);
  const spot = g.board.allCells().find(c => g.board.playable(c) && !g.board.isPillar(c) && !g.unitsAt(c).length)!;
  const t = mons[0]; t.cell = { ...spot }; grom.cell = { ...spot };
  grom.wounds = wounds;
  g.activate(grom.id);
  g.choiceHook = r => (r.choice === 'confirm' ? -1 : 'auto');
  g.rerollHook = () => 'auto';
  g.drain();
  g.attack(grom.cards.find(c => c.defId === 'machado_schmetterling')!.uid, t.id);
  const ev = g.drain() as unknown as { t: string; id?: string; amount?: number; attackerId?: string; crits?: number; hits?: number; dice?: string[] }[];
  const atk = ev.find(e => e.t === 'attack' && e.attackerId === grom.id)!;
  const heal = ev.filter(e => e.t === 'heal' && e.id === grom.id).reduce((n, e) => n + (e.amount ?? 0), 0);
  return { atk, heal };
};
const withCrit = (wounds: number, want: (crits: number) => boolean) => {
  for (let seed = 1; seed < 500; seed++) { const r = run('normal', wounds, seed); if (want(r.atk.crits!)) return r; }
  throw new Error('nenhuma semente serviu');
};
for (const n of [1, 2]) {
  const { atk, heal } = withCrit(5, c => c === n);
  const plain = atk.dice!.filter(f => f === 'melee').length;
  console.log('dados', atk.dice, 'acertos', atk.hits, 'cura', heal);
  check(atk.hits === plain + n * 2, `${n} ✷: cada ✷ vale 2 acertos (1 + 1 adicional)`);
  check(heal === n, `${n} ✷: curou ${n}`);
}
check(withCrit(1, c => c >= 2).heal === 1, 'cura no máximo os Ferimentos que tem');
check(withCrit(0, c => c >= 1).heal === 0, 'sem Ferimentos: não cura');
check(withCrit(3, c => c === 0).heal === 0, 'sem ✷: não cura');
console.log(ok ? 'SCHMETTERLING OK' : 'FALHOU');
