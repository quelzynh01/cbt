import { newCampaign, allPickHeroes } from '../../../src/campaign/campaign';
import { newSetup, allPick, advance } from '../../../src/net/onlineSetup';

// All Pick: cada Guilda escolhe 3 Heróis de todos os disponíveis (sem repetir entre Guildas); as IAs escolhem depois.
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
{
  const c = newCampaign(3, 'Teste', 'normal', true, true, 'all', 'classic', 'allpick');
  check(c.setup?.step === 'allpick' && (c.setup.pool ?? []).length > 12, `campanha local: começa no All Pick (${c.setup?.pool?.length} Heróis)`);
  const pool = c.setup!.pool!;
  check(!allPickHeroes(c, [pool[0], pool[0], pool[1]]), 'não aceita o mesmo Herói duas vezes');
  check(allPickHeroes(c, [pool[0], pool[5], pool[9]]), 'recrutou 3 Heróis');
  const all = c.guilds.flatMap(g => g.heroes);
  check(c.guilds.every(g => g.heroes.length === 3) && new Set(all).size === all.length, `todas as Guildas com 3 Heróis, sem repetir (${all.length})`);
  check(c.setup!.step === 'vote', 'depois: votação do mapa');
}
{
  const seats = [{ guild: 'azul' as const, ai: false }, { guild: 'vermelho' as const, ai: false }, { guild: 'verde' as const, ai: true }];
  const st = newSetup(seats, 'normal', Math.random, 'campaign', true, true, 'core', 'classic', 'allpick');
  const pool = st.pool!;
  check(st.step === 'allpick', 'online: começa no All Pick');
  check(allPick(st, 'azul', [pool[0], pool[1], pool[2]]), 'online: azul confirmou');
  check(!allPick(st, 'vermelho', [pool[2], pool[3], pool[4]]), 'online: vermelho não pode pegar um Herói já escolhido');
  advance(st, seats);
  check(st.step === 'allpick', 'online: espera o outro jogador (a IA ainda não escolhe)');
  check(allPick(st, 'vermelho', [pool[3], pool[4], pool[5]]), 'online: vermelho confirmou');
  advance(st, seats);
  const all = st.order.flatMap(g => st.picks[g] ?? []);
  check(st.step === 'vote' && st.order.every(g => (st.picks[g] ?? []).length === 3) && new Set(all).size === all.length, 'online: a IA escolheu entre os que sobraram e foi para a votação');
}
console.log(ok ? 'ALL PICK OK' : 'FALHOU');
