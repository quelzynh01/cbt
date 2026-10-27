import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { BTG_MAPS } from '../../../src/engine/maps/beyondTheGrave';
import { SimpleAI } from '../../../src/ai/ai';
import { applyAction } from '../../../src/engine/actions';
import { EXTRA_HERO_IDS, ALL_HEROES, HEROES, distributeStartingGear } from '../../../src/engine/data';
import { CARDS } from '../../../src/engine/cards';

// Partidas IA x IA com Heróis extras: procura travamentos/erros e conta o uso de cada habilidade.
const N = Number(process.argv[2] ?? 4);
const mode = process.argv[3] ?? 'mix'; // mix | core | extra
const skills: Record<string, number> = {};
const wins: Record<string, number> = {};
const played: Record<string, number> = {};
const choiceAsk: Record<string, number> = {};
const perMap: Record<string, { n: number; turns: number; stuck: number }> = {};
let aiMs = 0, aiCalls = 0, aiMax = 0;
let games = 0, stuck = 0, errors = 0, turnsSum = 0, powers = 0;
const allCards = Object.keys(CARDS).filter(id => CARDS[id].kind === 'attack' && id !== 'foice');
// só os mapas do jogo padrão (Clássico); BTG=1 inclui os de Beyond the Grave (ou MAP=id escolhe um)
const btgIds = new Set(BTG_MAPS.map(m => m.id));
const maps = Object.values(MAPS).filter(m => process.env.MAP ? m.id === process.env.MAP : process.env.BTG || !btgIds.has(m.id));
let seedBase = Number(process.env.SEED ?? 1000); // SEED=n repete uma partida (com MAP=id)
for (let r = 0; r < N; r++) for (const map of maps) {
  const seed = seedBase++;
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const pool = (mode === 'core' ? ALL_HEROES : mode === 'extra' ? EXTRA_HERO_IDS : [...ALL_HEROES, ...EXTRA_HERO_IDS]).slice().sort(() => rnd() - 0.5);
  const nP = map.startAreas.length >= 3 && rnd() < 0.4 ? 3 : 2;
  const guilds = ['azul', 'vermelho', 'verde', 'laranja'].slice(0, nP) as ('azul' | 'vermelho' | 'verde' | 'laranja')[];
  const players = guilds.map((gid, i) => {
    const heroes = pool.slice(i * 3, i * 3 + 3);
    const gear = distributeStartingGear(heroes);
    // + 1 carta de ataque aleatória por Herói (exercita Espada/Arco/Mágica)
    for (const h of heroes) gear[h] = [...gear[h], allCards[Math.floor(rnd() * allCards.length)]].slice(0, 4);
    return { guild: gid, controller: 'ai' as const, heroes, cards: gear };
  });
  const g = Game.create(map, { seed, players, allHeroes: true });
  g.drain();
  // decisões dos jogadores: metade das partidas escolhe ao acaso (testa os ganchos)
  if (seed % 2) g.choiceHook = req => { choiceAsk[req.source] = (choiceAsk[req.source] ?? 0) + 1; const n = req.cells?.length ?? req.units?.length ?? 1; return Math.floor(rnd() * (n + 1)) - (req.choice === 'confirm' ? 0 : 1); };
  const ais: Record<string, SimpleAI> = {};
  const lastEv: string[] = [];
  let step = 0;
  try {
    for (; step < 4000 && !g.s.winner; step++) {
      if (g.s.pending) { g.autoResolvePending(); continue; }
      const cur = g.currentGuild().id;
      const ai = (ais[cur] ??= new SimpleAI(process.env.LVL === 'hard' ? 'hard' : process.env.LVL === 'normal' ? 'normal' : rnd() < 0.5 ? 'hard' : 'normal', rnd, JSON.parse(process.env.P ?? '{}')));
      const ta = performance.now();
      const a = ai.next(g);
      const dt = performance.now() - ta; aiMs += dt; aiCalls++; if (dt > aiMax) aiMax = dt;
      const act = a.type === 'move' ? { type: 'move' as const, cell: a.cell, openDoors: true } : a;
      if (a.type === 'power') powers++;
      if (!applyAction(g, cur, act as never)) applyAction(g, cur, { type: 'end' });
      const dbg = seed === Number(process.env.DBG) && g.s.turn >= 300 && g.s.turn <= 303;
      if (dbg) console.log('T', g.s.turn, cur, JSON.stringify(act).slice(0, 120), g.s.activation ? `${g.s.activation.heroId} mp${g.s.activation.mp}` : '-');
      const evs = g.drain();
      for (const e of evs) lastEv.push(e.t === 'log' ? e.text : e.t + (e.t === 'death' ? ':' + e.id : ''));
      lastEv.push('>> ' + JSON.stringify(act).slice(0, 80));
      while (lastEv.length > 400) lastEv.shift();
      for (const e of evs) if (dbg && e.t === 'log') console.log('   ', e.text); else if (e.t === 'skill') skills[e.skill] = (skills[e.skill] ?? 0) + 1;
      // invariantes
      for (const u of g.onBoard()) {
        if (u.wounds < 0) throw new Error(`wounds<0 ${u.id}`);
        if (g.cellLoad(u.cell!) > 2) throw new Error(`3+ no Espaço ${u.cell!.c},${u.cell!.r} ${g.unitsAt(u.cell!).map(x => x.id)}`);
        if (!g.board.playable(u.cell!)) throw new Error(`fora do tabuleiro ${u.id} ${u.cell!.c},${u.cell!.r}`);
        if (u.wounds >= g.maxHp(u) && !g.s.pending) throw new Error(`vivo com Vida 0 ${u.id} ${u.wounds}/${g.maxHp(u)}`);
        
      }
      for (const u of g.units()) if (!u.alive && u.cell) throw new Error(`morto com Espaço ${u.id}`);
      for (const u of g.units()) if (u.kind === 'hero' && u.cards.some(c => !c)) throw new Error(`carta vazia ${u.id}`);
      const uids = g.units().flatMap(u => u.cards.map(c => c.uid));
      if (new Set(uids).size !== uids.length) throw new Error('carta duplicada');
      const toks = [...g.units().flatMap(u => u.tokens.map(t => t.id)), ...Object.values(g.s.floor).flat().map(t => t.id)];
      if (new Set(toks).size !== toks.length) throw new Error('marcador duplicado ' + toks.filter((t, i) => toks.indexOf(t) !== i));
      if (g.s.activation && !g.unit(g.s.activation.heroId).alive && !g.s.pending) throw new Error('ativação de Herói morto');
    }
  } catch (e) {
    errors++;
    if (process.env.V) console.log(lastEv.join(String.fromCharCode(10) + '   '));
    console.log('ERRO', map.id, seed, players.map(p => p.heroes.join('/')).join(' vs '), (e as Error).stack?.split('\n').slice(0, 4).join(' | '));
    continue;
  }
  games++;
  turnsSum += g.s.turn;
  const pm = (perMap[map.id] ??= { n: 0, turns: 0, stuck: 0 }); pm.n++; pm.turns += g.s.turn; if (!g.s.winner) pm.stuck++;
  for (const p of players) for (const h of p.heroes) played[h] = (played[h] ?? 0) + 1;
  if (!g.s.winner) { stuck++; if (process.env.V) console.log('TRAVOU', map.id, seed, 'turno', g.s.turn, players.map(p => p.heroes.join('/')).join(' vs '), g.guilds().map(x => x.id + ':' + x.missions.join('+') + ' $' + x.coins + (x.barrierOpen ? ' aberta' : '')).join(' '), g.heroesOf(g.s.guildOrder[0]).map(h => h.cell ? h.cell.c + ',' + h.cell.r : 'x').join(' ')); continue; }
  for (const h of players.find(p => p.guild === g.s.winner)!.heroes) wins[h] = (wins[h] ?? 0) + 1;
}
console.log({ games, stuck, errors, avgTurns: +(turnsSum / Math.max(1, games)).toFixed(1), powers });
console.log('IA: média', (aiMs / aiCalls).toFixed(2), 'ms por decisão, pior', aiMax.toFixed(0), 'ms');
console.log(Object.entries(perMap).map(([k, v]) => `${k.slice(0, 22).padEnd(22)} ${(v.turns / v.n).toFixed(1).padStart(6)} turnos  travou ${v.stuck}/${v.n}`).join(String.fromCharCode(10)));
console.log('escolhas:', JSON.stringify(choiceAsk));
console.log('habilidades:', Object.entries(skills).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
const rate = Object.keys(played).map(h => ({ h: HEROES[h].name, w: (wins[h] ?? 0) / played[h], n: played[h] })).sort((a, b) => b.w - a.w);
console.log('vitórias:', rate.map(r => `${r.h} ${(r.w * 100).toFixed(0)}%(${r.n})`).join(', '));
