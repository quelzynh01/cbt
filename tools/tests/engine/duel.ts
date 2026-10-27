import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { BTG_MAPS } from '../../../src/engine/maps/beyondTheGrave';
import { SimpleAI } from '../../../src/ai/ai';
import { OldAI } from './ai_old';
import { applyAction } from '../../../src/engine/actions';
import { ALL_HEROES, distributeStartingGear } from '../../../src/engine/data';

// IA nova x IA antiga (último commit): partidas espelhadas (mesma seed e Heróis, trocando quem joga com cada Guilda).
const N = Number(process.argv[2] ?? 3);
const LVL = (process.env.LVL ?? 'hard') as 'hard' | 'normal';
const btg = new Set(BTG_MAPS.map(m => m.id));
const maps = Object.values(MAPS).filter(m => !btg.has(m.id) && (!process.env.MAP || m.id === process.env.MAP));
const src: Record<string, Record<string, number>> = { nova: {}, antiga: {} };
const st = { nova: { wins: 0, alertDmg: 0, pveFirst: 0, potions: 0, sacrifice: 0, deaths: 0, pve: 0, pvp: 0 }, antiga: { wins: 0, alertDmg: 0, pveFirst: 0, potions: 0, sacrifice: 0, deaths: 0, pve: 0, pvp: 0 } };
let games = 0, draws = 0;
let seed = Number(process.env.SEED ?? 5000);
for (let r = 0; r < N; r++) for (const map of maps) {
  const s0 = seed++;
  for (const flip of [false, true]) {
    let x = s0;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    const pool = ALL_HEROES.slice().sort(() => rnd() - 0.5);
    const guilds = ['azul', 'vermelho'] as const;
    const players = guilds.map((gid, i) => { const heroes = pool.slice(i * 3, i * 3 + 3); return { guild: gid, controller: 'ai' as const, heroes, cards: distributeStartingGear(heroes) }; });
    const g = Game.create(map, { seed: s0, players });
    g.drain();
    const who: Record<string, 'nova' | 'antiga'> = { azul: flip ? 'antiga' : 'nova', vermelho: flip ? 'nova' : 'antiga' };
    const ais: Record<string, { next: (g: Game) => unknown }> = {
      azul: who.azul === 'nova' ? new SimpleAI(LVL, rnd, JSON.parse(process.env.P ?? '{}')) : new OldAI(LVL, rnd),
      vermelho: who.vermelho === 'nova' ? new SimpleAI(LVL, rnd, JSON.parse(process.env.P ?? '{}')) : new OldAI(LVL, rnd),
    };
    const firstMission: Record<string, string> = {};
    for (let step = 0; step < 4000 && !g.s.winner; step++) {
      if (g.s.pending) { g.autoResolvePending(); continue; }
      const cur = g.currentGuild().id;
      const a = ais[cur].next(g) as { type: string; cell?: unknown; sacrifice?: boolean };
      if (a.type === 'token') st[who[cur]].potions++;
      if (a.type === 'attack' && a.sacrifice) st[who[cur]].sacrifice++;
      const act = a.type === 'move' ? { ...a, openDoors: true } : a;
      if (!applyAction(g, cur, act as never)) applyAction(g, cur, { type: 'end' });
      for (const e of g.drain()) {
        if (e.t === 'attack' && e.reason === 'alerta') for (const t of e.targets) { const u = g.unit(t.id); if (u.kind === 'hero') { st[who[u.guild!]].alertDmg += t.wounds; const k = who[u.guild!] === who[cur] ? a.type : 'outro'; src[who[u.guild!]][k] = (src[who[u.guild!]][k] ?? 0) + t.wounds; } }
        if (e.t === 'death') { const u = g.unit(e.id); if (u.kind === 'hero') st[who[u.guild!]].deaths++; }
        if (e.t === 'mission') {
          const kind = g.s.missions.find(m => m.id === e.missionId)?.kind;
          if (kind === 'pve') st[who[e.guild]].pve++; else st[who[e.guild]].pvp++;
          if (!firstMission[e.guild]) { firstMission[e.guild] = kind ?? ''; if (kind === 'pve') st[who[e.guild]].pveFirst++; }
        }
      }
    }
    games++;
    if (g.s.winner) st[who[g.s.winner]].wins++; else draws++;
  }
}
console.log(`${games} partidas (${LVL}), ${draws} sem vencedor`);
for (const k of ['nova', 'antiga'] as const) console.log(k.padEnd(7), JSON.stringify(st[k]));
console.log('origem do dano de Alerta:', JSON.stringify(src));
console.log(`IA nova venceu ${(st.nova.wins / Math.max(1, games - draws) * 100).toFixed(0)}% das partidas decididas`);
