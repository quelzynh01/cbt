import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { CARDS } from '../../../src/engine/cards';
import { HEROES } from '../../../src/engine/data';

// Descanso: não deixa tirar a carta que dá Vida se o Herói (vivo) ficar com a Vida zerada
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const hpCard = Object.keys(CARDS).find(id => (CARDS[id].hpBonus ?? 0) > 0)!;
const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 3, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: [hpCard] } }, { guild: 'vermelho', controller: 'ai' }] });
g.s.deploying = null;
const [grom, maya] = g.heroesOf('azul');
const card = grom.cards.find(c => c.defId === hpCard)!;
const base = HEROES.grom.hp;
grom.wounds = base; // só está vivo por causa da carta
const cards = (moveCard: boolean) => Object.fromEntries(g.heroesOf('azul').map(h => [h.id,
  h.id === grom.id ? h.cards.filter(c => !moveCard || c.uid !== card.uid).map(c => c.uid)
    : h.id === maya.id ? [...h.cards.map(c => c.uid), ...(moveCard ? [card.uid] : [])] : h.cards.map(c => c.uid)]));
const errMove = g.validateRest('azul', { cards: cards(true) });
const errKeep = g.validateRest('azul', { cards: cards(false) });
check(!!errMove && /sem Vida/.test(errMove), `tirar ${CARDS[hpCard].name} do Grom (${grom.wounds} Ferimentos, Vida ${base} sem a carta): bloqueado — "${errMove}"`);
check(errKeep === null, 'mantendo a carta: pode descansar');
grom.wounds = base - 1;
check(g.validateRest('azul', { cards: cards(true) }) === null, 'com Vida sobrando sem a carta: pode trocar');
console.log(ok ? 'DESCANSO SEM ZERAR A VIDA OK' : 'FALHOU');
