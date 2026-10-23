import { MAPS, BTG_MAP_IDS } from '../../../src/engine/maps';
import { Board, key } from '../../../src/engine/board';
type C = { c: number; r: number };
let bad = 0;
for (const id of (process.env.ALL ? Object.keys(MAPS) : [...BTG_MAP_IDS])) {
  const m = MAPS[id];
  const doors = m.doors.map((d, i) => ({ id: `d${i}`, a: d.a, b: d.b, open: true, small: !!d.small, locked: false }));
  const b = new Board(m, () => doors as never);
  const portals: Record<string, C[]> = {};
  for (const p of m.portals) (portals[p.color] ??= []).push(p.cell);
  const reach = (start: C[]) => {
    const seen = new Set<string>(start.map(key));
    const q = [...start];
    while (q.length) {
      const c = q.shift()!;
      const nx: C[] = b.neighbors(c).filter(n => b.edgeOpen(c, n));
      const col = b.portalAt(c);
      if (col) nx.push(...portals[col]);
      for (const n of nx) if (!seen.has(key(n))) { seen.add(key(n)); q.push(n); }
    }
    return seen;
  };
  const things: [string, C][] = [
    ...m.monsters.map(x => [x.type, x.cell] as [string, C]), ...m.missionMarkers.map(x => [`missao ${x.color}`, x.cell] as [string, C]),
    ...(m.tombstones ?? []).map(x => ['lapide', x] as [string, C]), ...m.exploration.map(x => ['explor', x] as [string, C]),
    ...m.portals.map(x => ['portal', x.cell] as [string, C]), ...m.entryMarkers.map(x => ['entrada', x] as [string, C]),
    ...m.startAreas.flat().map(x => ['area', x] as [string, C]),
    ...((m.missions.pve.flatMap(p => (p as { escortTo?: C[] }).escortTo ?? [])).filter(x => x && x.c !== undefined).map(x => ['destino', x] as [string, C])),
  ];
  const issues: string[] = [];
  m.startAreas.forEach((area, i) => {
    const s = reach(area);
    const miss = things.filter(([, c]) => !s.has(key(c))).map(([n, c]) => `${n}@${c.c},${c.r}`);
    if (miss.length) issues.push(`  J${i + 1}: não alcança ${[...new Set(miss)].join(' ')}`);
  });
  // paredes que coincidem com portas (a porta vale)
  const dup = m.walls.filter(([a, z]) => m.doors.some(d => (key(d.a) === key(a) && key(d.b) === key(z)) || (key(d.a) === key(z) && key(d.b) === key(a))));
  if (dup.length) issues.push(`  parede em cima de porta: ${dup.map(([a, z]) => `${a.c},${a.r}-${z.c},${z.r}`).join(' ')}`);
  // marcadores ou monstros em Espaços que não existem
  const off = things.filter(([, c]) => !b.playable(c));
  if (off.length) issues.push(`  fora do tabuleiro: ${off.map(([n, c]) => `${n}@${c.c},${c.r}`).join(' ')}`);
  if (issues.length) { bad++; console.log(id); issues.forEach(x => console.log(x)); }
}
console.log(bad ? `${bad} mapa(s) com problema` : 'TODOS OS MAPAS OK');
