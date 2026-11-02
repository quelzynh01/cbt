import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Itens em ação: o evento 'item' sai antes do efeito (Vidro do Gênesis antes da cura; ampliação antes do ataque)
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const mk = (cards: string[]) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 5, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: cards } }, { guild: 'vermelho', controller: 'human', heroes: ['seth', 'hobsbawm', 'johan'] }] });
  g.s.deploying = null;
  g.choiceHook = r => (r.choice === 'confirm' ? -1 : 'auto');
  g.rerollHook = () => 'auto';
  return g;
};
type Ev = { t: string; id?: string; card?: string; hold?: boolean; attackerId?: string };
{
  const g = mk(['espada_enferrujada', 'vidro_genesis']);
  const grom = g.heroesOf('azul')[0];
  grom.wounds = 2;
  g.endTurn(); g.drain();
  g.endTurn();
  const ev = g.drain() as unknown as Ev[];
  const iItem = ev.findIndex(e => e.t === 'item' && e.card === 'vidro_genesis');
  const iHeal = ev.findIndex(e => e.t === 'heal' && e.id === grom.id);
  check(iItem >= 0 && iHeal > iItem, `Vidro do Gênesis aparece antes da cura (item ${iItem}, cura ${iHeal})`);
  check(!!ev[iItem]?.hold, 'a fila espera o Vidro');
  g.drain();
  grom.wounds = 0;
  g.endTurn(); g.drain();
  const ev2 = g.drain() as unknown as Ev[];
  g.endTurn();
  check(![...ev2, ...(g.drain() as unknown as Ev[])].some(e => e.t === 'item' && e.card === 'vidro_genesis'), 'sem Ferimentos: o Vidro não aparece');
}
{
  const g = mk(['espada_enferrujada', 'anel_lua']);
  const grom = g.heroesOf('azul')[0];
  const mons = Object.values(g.s.units).filter(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object'));
  for (const m of mons) m.cell = null;
  const spot = g.board.allCells().find(c => g.board.playable(c) && !g.board.isPillar(c) && !g.unitsAt(c).length)!;
  mons[0].cell = { ...spot }; grom.cell = { ...spot };
  g.activate(grom.id);
  g.drain();
  const card = grom.cards.find(c => c.defId === 'espada_enferrujada')!, ring = grom.cards.find(c => c.defId === 'anel_lua')!;
  g.attack(card.uid, mons[0].id, undefined, false, [ring.uid]);
  const ev = g.drain() as unknown as Ev[];
  const iItem = ev.findIndex(e => e.t === 'item' && e.card === 'anel_lua');
  const iAtk = ev.findIndex(e => e.t === 'attack');
  check(iItem >= 0 && iAtk > iItem, 'Anel da Lua aparece antes do ataque');
  check(JSON.parse(JSON.stringify(ev)).length === ev.length, 'eventos seguem serializáveis');
}
console.log(ok ? 'ITENS OK' : 'FALHOU');
