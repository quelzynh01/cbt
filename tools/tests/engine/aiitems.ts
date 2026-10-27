import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { SimpleAI } from '../../../src/ai/ai';
import { applyAction } from '../../../src/engine/actions';

// IA: usa poções no fim da ativação (ferido -> Cura; cartas gastas -> Revigorante); no Descanso passa Baús e poções
// para o Herói mais seguro (a Cura para o mais ferido); Kanga não se fere à toa com o Autossacrifício.
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const mk = (heroes = ['grom', 'maya', 'kanga']) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 7, fixedOrder: true, players: [{ guild: 'azul', controller: 'ai', heroes }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = null;
  return g;
};
const runTurn = (g: Game, ai: SimpleAI) => { const used: string[] = []; for (let i = 0; i < 40 && g.currentGuild().id === 'azul'; i++) { const a = ai.next(g); if (a.type === 'token') used.push(a.tokenId); if (!applyAction(g, 'azul', (a.type === 'move' ? { ...a, openDoors: true } : a) as never)) applyAction(g, 'azul', { type: 'end' }); g.drain(); } return used; };
{
  // todos feridos com Cura: em algum momento do turno a IA usa
  const g = mk();
  for (const h of g.heroesOf('azul')) { h.wounds = g.maxHp(h) - 1; h.tokens.push({ id: 'c-' + h.id, type: 'cura', faceUp: true }); }
  const used = runTurn(g, new SimpleAI('hard', () => 0.5));
  check(used.some(id => id.startsWith('c-')), `ferido com 1 de Vida: usou a Cura (${used.join(',') || 'nada'})`);
}
{
  // Descanso: Baú e Revigorante com o Herói mais seguro, Cura com o mais ferido
  const g = mk();
  const [a, b, c] = g.heroesOf('azul');
  a.wounds = g.maxHp(a) - 1; b.wounds = 0; c.wounds = 1;
  a.tokens.push({ id: 'bau1', type: 'bau', faceUp: true, value: 3 } as never, { id: 'rev1', type: 'revigorante', faceUp: true });
  c.tokens.push({ id: 'cura1', type: 'cura', faceUp: true });
  const opts = new SimpleAI('hard', () => 0.5).restOptions(g, 'azul');
  const where = (id: string) => Object.entries(opts?.tokens ?? {}).find(([, l]) => l.includes(id))?.[0];
  check(!!opts?.tokens && where('bau1') !== a.id && where('cura1') === a.id && g.validateRest('azul', opts!) === null, `Baú com ${where('bau1')}, Cura com ${where('cura1')} (mais ferido: ${a.id})`);
}
console.log(ok ? 'IA: ITENS E DESCANSO OK' : 'FALHOU');
