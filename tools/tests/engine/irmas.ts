import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Distrito do Alquimista: as Irmãs surgem uma de cada vez; quem vem primeiro é sorteado
const firsts = new Set<string>();
for (let seed = 1; seed <= 30; seed++) {
  const g = Game.create(MAPS['distrito-do-alquimista'], { seed, players: [{ guild: 'azul', controller: 'ai' }, { guild: 'vermelho', controller: 'ai' }], deploy: true });
  for (const gid of [...(g.s.deploying ?? [])]) g.deployDone(gid);
  const e = g.drain().find(x => x.t === 'lordEntrance') as { id: string; others?: { id: string }[] } | undefined;
  if (e && e.others?.length === 1) firsts.add(g.unit(e.id).defId.replace(/\d+$/, ''));
}
console.log('primeira a surgir:', [...firsts].join(', '));
// Pátio da Universidade: Troll e Minotauro em dupla, ordem sorteada
const duo = new Set<string>();
for (let seed = 1; seed <= 30; seed++) {
  const g = Game.create(MAPS['patio-da-universidade'], { seed, players: [{ guild: 'azul', controller: 'ai' }, { guild: 'vermelho', controller: 'ai' }], deploy: true });
  for (const gid of [...(g.s.deploying ?? [])]) g.deployDone(gid);
  const e = g.drain().find(x => x.t === 'lordEntrance') as { id: string; others?: { id: string }[] } | undefined;
  if (e && e.others?.length === 1) duo.add(g.unit(e.id).defId.replace(/\d+$/, '') + '>' + g.unit(e.others[0].id).defId.replace(/\d+$/, ''));
}
console.log('dupla do Pátio:', [...duo].join(', '));
console.log(firsts.size === 2 && duo.size === 2 ? 'ORDEM DAS IRMÃS E DA DUPLA SORTEADA OK' : 'FALHOU');
