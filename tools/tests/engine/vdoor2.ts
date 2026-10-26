import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Vingança: o controlador dos Monstros abre/fecha portas Perto do Monstro (1 Movimento cada), enquanto tiver Movimento
let ok = true;
const check = (c: boolean, m: string) => { console.log(c ? '✔' : '✘', m); if (!c) ok = false; };
let tested = 0;
for (const mapId of Object.keys(MAPS)) {
  const map = MAPS[mapId];
  if (!map.doors?.some(d => !d.locked)) continue;
  const g = Game.create(map, { seed: 3, players: [{ guild: 'azul', controller: 'human' }, { guild: 'vermelho', controller: 'human' }] });
  g.s.deploying = null;
  const d = g.s.doors.find(x => !x.locked)!;
  const m = Object.values(g.s.units).find(u => u.kind === 'monster' && u.alive && !g.monAbility(u, 'object'))!;
  if (!m) continue;
  const h = g.heroesOf(g.s.guildOrder[0])[0];
  m.cell = { ...d.a }; h.cell = { ...d.b };
  const mv = g.monMove(m);
  g.s.pending = { monsterId: m.id, heroId: h.id, controller: g.s.guildOrder[1], dying: [] } as never;
  const near = g.vengeanceDoors();
  const was = d.open;
  const r = g.resolveVengeance(null, false, [d.id]);
  check(near.includes(d.id) && r && d.open === !was, `${mapId}: ${was ? 'fechou' : 'abriu'} a porta (Movimento ${mv})`);
  // sem Movimento sobrando: não deixa mexer em mais portas que o Movimento
  const g2 = Game.create(map, { seed: 3, players: [{ guild: 'azul', controller: 'human' }, { guild: 'vermelho', controller: 'human' }] });
  g2.s.deploying = null;
  const d2 = g2.s.doors.find(x => x.id === d.id)!, m2 = g2.unit(m.id), h2 = g2.unit(h.id);
  m2.cell = { ...d2.a }; h2.cell = { ...d2.b };
  g2.s.pending = { monsterId: m2.id, heroId: h2.id, controller: g2.s.guildOrder[1], dying: [] } as never;
  const all = g2.vengeanceDoors();
  const tooMany = [...all, ...all].slice(0, g2.monMove(m2) + 1);
  check(!g2.resolveVengeance(null, false, tooMany) || new Set(tooMany).size === tooMany.length && tooMany.length <= g2.monMove(m2), `${mapId}: não passa do Movimento`);
  if (++tested >= 4) break;
}
console.log(ok && tested ? 'PORTAS NA VINGANÇA OK' : 'FALHOU');
