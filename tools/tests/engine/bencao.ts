import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Bênção do Hobsbawm: o Aliado ativado pela Bênção não pode "trocar" de volta para quem já jogou;
// a troca normal no começo do turno (antes de agir) continua valendo
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 3, fixedOrder: true, players: [{ guild: 'azul', controller: 'human', heroes: ['hobsbawm', 'johan', 'maya'] }, { guild: 'vermelho', controller: 'ai' }] });
g.s.deploying = null;
const [hob, johan, maya] = g.heroesOf('azul');
// troca normal: ativa a Maya, troca para o Johan e volta para a Maya (nada feito ainda)
check(g.activate(maya.id) && g.activate(johan.id) && g.activate(maya.id) && g.s.activation!.heroId === maya.id, 'troca antes de agir: Maya -> Jøhan -> Maya');
// Hobsbawm joga e dá a Bênção; Johan é ativado por ela
g.s.activation = null; g.s.activatedThisTurn = [];
g.activate(hob.id);
g.s.activation!.attacked = true; g.s.activation!.mp = 0; g.s.blessing = { heroId: hob.id };
johan.cell = { ...hob.cell! };
check(g.activate(johan.id) && g.s.activation!.heroId === johan.id, 'Bênção: ativou o Jøhan');
check(!g.activate(hob.id) && g.s.activation!.heroId === johan.id, 'Jøhan ainda sem agir: não dá para "trocar" de volta para o Hobsbawm (já jogou)');
console.log(ok ? 'BÊNÇÃO SEM REATIVAR QUEM JÁ JOGOU OK' : 'FALHOU');
