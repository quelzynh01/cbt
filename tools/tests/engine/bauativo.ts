import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Só o Herói ativado pega o que está no chão. Templo: o outro Herói parado num Baú amaldiçoado (4) NÃO abre o Baú
// quando o Inimigo do Espaço dele morre ou quando é empurrado; só abre se o jogador o ativar.
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
const map = Object.values(MAPS).find(m => m.deadlyTokens)!;
const g = Game.create(map, { seed: 5, fixedOrder: true, players: [
  { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'] }, { guild: 'vermelho', controller: 'ai' }] });
g.s.deploying = [];
const [grom, maya] = g.heroesOf('azul');
const k = Object.keys(g.s.floor).find(k => !g.unitsAt({ c: +k.split(',')[0], r: +k.split(',')[1] }).length)
  ?? Object.keys(g.s.floor)[0];
const [c, r] = k.split(',').map(Number);
for (const u of g.unitsAt({ c, r })) { u.alive = false; u.cell = null; }
g.s.floor[k] = [{ id: 'bau-teste', type: 'bau', value: 4, faceUp: false }];
maya.cell = { c, r };
const hp0 = maya.hp;
const gg = g as unknown as { pickupAfterCombat: () => void; pickup: (h: unknown) => void; place: (u: unknown, c: unknown) => void };
g.s.current = g.s.guildOrder.indexOf('azul' as never);
g.s.activation = { heroId: grom.id, mp: 3, moved: true, moveLocked: false, attacked: true };
gg.pickupAfterCombat();
check(maya.alive && maya.hp === hp0 && g.s.floor[k]?.length === 1, 'combate do Grom: a Maya não abriu o Baú');
gg.pickup(maya);
check(g.s.floor[k]?.length === 1, 'empurrada/colocada sem estar ativada: não pega');
g.s.activation = null;
gg.pickup(maya);
check(g.s.floor[k]?.length === 1, 'sem ninguém ativado (Descanso/Vingança): não pega');
g.s.activation = { heroId: maya.id, mp: 3, moved: false, moveLocked: false, attacked: false };
gg.pickup(maya);
check(!g.s.floor[k], 'ativada pelo jogador: pega o Baú');
console.log(ok ? 'SÓ O HERÓI ATIVADO PEGA OK' : 'FALHOU');
