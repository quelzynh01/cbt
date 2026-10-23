import { Game } from '../../../src/engine/game';
import { getMap } from '../../../src/engine/maps';
const mk = () => { const g = Game.create(getMap('distrito-dos-martelos'), { seed: 5, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['johan', 'vapor', 'hobsbawm'], cards: { johan: ['espada_enferrujada'], vapor: ['das_boot'], hobsbawm: ['raio_nova'] } }, { guild: 'vermelho', controller: 'ai' }] }); g.drain(); return g; };
// 1) turno adicional: outro Herói joga, quem usou a poção não, e não descansa
{ const g = mk(); const [jo, va, ho] = g.heroesOf('azul');
  g.activate(jo.id); jo.tokens.push({ id: 'p', type: 'turno' } as never); g.useToken('p'); g.endTurn();
  console.log('turno extra: vez', g.currentGuild().id, '| ativa Jøhan', g.activate(jo.id), '| descansa', g.rest({}), '| ativa Vapor', g.activate(va.id)); }
// 2) Bênção: depois de ativar outro Herói, não descansa
{ const g = mk(); const [jo, va, ho] = g.heroesOf('azul');
  g.activate(ho.id); g.s.blessing = { heroId: ho.id }; g.s.activation!.attacked = true;
  const ok = g.activate(va.id) || g.activate(jo.id);
  console.log('Bênção: ativou outro', ok, '| descansa', g.rest({})); }
// 3) Botas: ativa Jøhan, usa a bota do Vapor -> não dá para trocar para o Vapor, nem descansar
{ const g = mk(); const [jo, va] = g.heroesOf('azul');
  g.activate(jo.id);
  const boot = va.cards.find(c => c.defId === 'das_boot')!;
  const cells = g.bootCells(va, boot);
  console.log('Botas: usou', g.useCard(va.id, boot.uid, undefined, cells[0]), '| troca para Vapor', g.activate(va.id), '| descansa', g.rest({}), '| Jøhan continua ativo', g.s.activation?.heroId); }
// 4) descansar no começo do turno continua valendo
{ const g = mk(); console.log('Descanso normal', g.rest({})); }
