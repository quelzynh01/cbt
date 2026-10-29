import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { SimpleAI } from '../../../src/ai/ai';
import { SearchAI, SEARCH_OPTS, EVAL_W } from '../../../src/ai/search';
import { applyAction } from '../../../src/engine/actions';
import { ALL_HEROES, CARDS, distributeStartingGear } from '../../../src/engine/data';

// Diagnóstico de um mapa (IA x IA): de onde vem o dano nos Heróis, quem mata, qual arma vai em qual alvo, quando saem as Missões.
// N partidas; MAP=id (padrão portao-da-lua); AI=busca|comum; MS=ms da busca; SEED=n; P={params}; W={pesos}
const N = Number(process.argv[2] ?? 6);
const map = MAPS[process.env.MAP ?? 'portao-da-lua'];
const kind = process.env.AI ?? 'busca';
const opts = { ...SEARCH_OPTS, timeMs: Number(process.env.MS ?? 300), w: { ...EVAL_W, ...JSON.parse(process.env.W ?? '{}') } };
const P = JSON.parse(process.env.P ?? '{}');
const inc = (o: Record<string, number>, k: string, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const dmg: Record<string, number> = {}, deaths: Record<string, number> = {}, weapon: Record<string, number> = {}, mis: Record<string, number> = {}, misTurn: Record<string, number[]> = {};
const monKills: Record<string, number> = {};
let rounds = 0, games = 0, noMission = 0, wasted = 0, atks = 0;
let seed = Number(process.env.SEED ?? 9100);
for (let r = 0; r < N; r++) {
  const s0 = seed++;
  let x = s0;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const pool = ALL_HEROES.slice().sort(() => rnd() - 0.5);
  const players = (['azul', 'vermelho', 'verde', 'laranja'] as const).slice(0, Number(process.env.PL ?? 2)).map((gid, i) => { const heroes = pool.slice(i * 3, i * 3 + 3); return { guild: gid, controller: 'ai' as const, heroes, cards: distributeStartingGear(heroes) }; });
  const g = Game.create(map, { seed: s0, players });
  g.drain();
  const ais: Record<string, SimpleAI> = Object.fromEntries(players.map(p => [p.guild, kind === 'busca' ? new SearchAI(opts, P, rnd) : new SimpleAI('hard', rnd, P)]));
  let anyMission = false;
  const marks: string[] = [];
  const lastHit: Record<string, string> = {};
  let actStart: { c: number; r: number } | null = null;
  for (let step = 0; step < 4000 && !g.s.winner; step++) {
    if (g.s.pending) { g.autoResolvePending(); for (const e of g.drain()) handle(e); continue; }
    const cur = g.currentGuild().id;
    const a = ais[cur].next(g) as { type: string; heroId?: string };
    if (a.type === 'activate') { const hh = g.unit(a.heroId!); actStart = hh.cell ? { ...hh.cell } : null; }
    const act = a.type === 'move' ? { ...a, openDoors: true } : a;
    if (!applyAction(g, cur, act as never)) applyAction(g, cur, { type: 'end' });
    for (const e of g.drain()) handle(e);
  }
  function handle(e: any) {
    if (e.t === 'attack') {
      const atk = g.unit(e.attackerId);
      for (const t of e.targets) {
        const u = g.unit(t.id);
        if (u.kind === 'hero' && t.wounds) {
          const where = e.reason === 'alerta' ? (actStart && u.cell && u.cell.c === actStart.c && u.cell.r === actStart.r ? '(saída)' : '(caminho)') : '';
          const src = atk.kind === 'hero' ? 'Herói' : `${e.reason}${where}:${atk.defId.replace(/\d+$/, '')}`;
          inc(dmg, src, t.wounds); lastHit[u.id] = src;
        }
        if (atk.kind === 'hero' && e.reason === 'heroi' && e.targets[0] === t) {
          const tgt = u.kind === 'hero' ? 'Herói' : u.defId.replace(/\d+$/, '');
          inc(weapon, `${e.cardName} -> ${tgt}`); atks++;
          if (u.kind === 'monster' && !t.wounds) wasted++;
        }
      }
    }
    if (e.t === 'death') { const u = g.unit(e.id); if (u.kind === 'hero') inc(deaths, lastHit[u.id] ?? '?'); else { inc(monKills, u.defId.replace(/\d+$/, '')); if (/feral|capitao/.test(u.defId)) marks.push(`${u.defId.replace(/\d+$/, '')}†r${g.s.turn}`); } }
    if (e.t === 'mission') { anyMission = true; inc(mis, e.missionId); (misTurn[e.missionId] ??= []).push(g.s.turn); marks.push(`${e.missionId}:${e.guild}@r${g.s.turn}`); }
  }
  games++; rounds += g.s.turn; if (!anyMission) noMission++;
  console.log(`seed ${s0}: ${g.s.turn} rodadas, vencedor ${g.s.winner ?? '-'}, missões ${g.s.guildOrder.map(id => g.guild(id).missions.join('+') || '-').join(' / ')}  [${marks.join(' ')}]`);
}
const top = (o: Record<string, number>, n = 14) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}: ${v}`).join(', ');
console.log(`\n${games} partidas (${kind}), ${(rounds / games).toFixed(1)} rodadas em média, ${noMission} sem nenhuma Missão`);
console.log('Ferimentos nos Heróis por origem:', top(dmg));
console.log('Mortes de Heróis por:', top(deaths));
console.log('Monstros mortos:', top(monKills));
console.log('Missões:', top(mis), '| rodada média:', Object.entries(misTurn).map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(', '));
console.log(`Ataques em Monstro sem dano: ${wasted}/${atks}`);
console.log('Arma -> alvo:', top(weapon, 30));
