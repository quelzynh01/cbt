import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { newCampaign, gameOptions } from '../../../src/campaign/campaign';

// Ordem dos jogadores: sorteada na partida avulsa e no 1º cenário da campanha (não a ordem da sala)
const seen = new Set<string>(), seenC = new Set<string>();
for (let i = 0; i < 40; i++) {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 1000 + i * 7919, players: [{ guild: 'azul', controller: 'human' }, { guild: 'vermelho', controller: 'human' }, { guild: 'verde', controller: 'human' }] });
  seen.add(g.s.guildOrder.join('>'));
}
console.log('avulsa:', [...seen].join(' | '));
const mk = newCampaign as unknown as (...a: unknown[]) => ReturnType<typeof newCampaign>;
for (let i = 0; i < 40; i++) {
  const c = mk(2);
  c.guilds.forEach(g => { g.heroes = []; });
  const o = gameOptions(c);
  seenC.add(o.players.map(p => p.guild).join('>'));
}
console.log('campanha:', [...seenC].join(' | '));
console.log(seen.size >= 4 && seenC.size >= 4 ? 'ORDEM SORTEADA OK' : 'FALHOU');
