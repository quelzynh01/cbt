import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { SimpleAI } from '../../../src/ai/ai';
import { applyAction } from '../../../src/engine/actions';
import { CARDS } from '../../../src/engine/cards';
import { HEROES, distributeStartingGear } from '../../../src/engine/data';
import { AI_LAB, newCampaign, draftHero, voteMap, gameOptions, recordResult, autoUpgrade, nextScenario, type CampaignState } from '../../../src/campaign/campaign';

// Campanha completa só de IAs (6 cenários + Fase de Melhorias entre eles): vê como a IA chega ao Templo (último mapa)
// e como ela joga lá. N campanhas; LVL=hard|normal; CAP=0 tira o Limite de dados (padrão: com limite 8/6); V=1 detalha.
// Campanha: sh tools/tests/run-engine.sh camp 20   -> resumo; o Templo é o que importa.
const N = Number(process.argv[2] ?? 6);
const lvl = process.env.LVL === 'normal' ? 'normal' : 'hard';
const cap = process.env.CAP !== '0';
const verbose = !!process.env.V;
// Duelo A x B dentro das mesmas campanhas: Guildas A = lugares pares (azul, verde), B = ímpares, trocando a cada campanha.
// PA / PB = parâmetros da IA (JSON) no combate; OLDB = compras "antigas" só nas B (buy); OLDALL = antigas em todas.
const PA = JSON.parse(process.env.PA ?? '{}'), PB = JSON.parse(process.env.PB ?? '{}');
const oldB = (process.env.OLDB ?? '').split(','), oldAll = (process.env.OLDALL ?? '').split(',');
const ab = { A: { templo: 0, all: 0 }, B: { templo: 0, all: 0 } };
const GIDS = ['azul', 'vermelho', 'verde', 'laranja'];

const tot = {
  camps: 0, stuck: 0, errors: 0,
  temploGames: 0, temploStuck: 0, temploTurns: 0, trapDeaths: 0, chestHits: 0, barrierOpen: 0, withFire: 0, deaths: 0, bossKills: 0,
  hp: 0, def: 0, rr: 0, dice: 0, heroes: 0,
};
const fireStat = { with: { n: 0, win: 0 }, without: { n: 0, win: 0 } };
const openTurns: number[] = [], openWinner: number[] = [], bossTurns: number[] = [], firstOpenWins = { n: 0, win: 0 };
const deathBy: Record<string, number> = {};
const kit = { A: { hp: 0, def: 0, defTot: 0, def6: 0, rr: 0, atkBest: 0, cards: 0, n: 0 }, B: { hp: 0, def: 0, defTot: 0, def6: 0, rr: 0, atkBest: 0, cards: 0, n: 0 } };
const perScenario: Record<string, { n: number; turns: number; stuck: number }> = {};
const winBy: Record<string, number> = {};

for (let i = 0; i < N; i++) {
  const k = i + Number(process.env.SEEDOFF ?? 0); // SEEDOFF=n: outra faixa de campanhas (para juntar várias rodadas)
  const seed = 5000 + k * 131;
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const realRandom = Math.random;
  Math.random = rnd;
  const c: CampaignState = newCampaign(3, undefined, lvl, cap, true, 'core', 'classic', 'draft');
  Math.random = realRandom;
  c.seed = seed;
  const isA = (gid: string) => (GIDS.indexOf(gid) % 2 === 0) === (k % 2 === 0);
  AI_LAB.oldBuy.clear();
  for (const gd of c.guilds) for (const [feat, set] of [['buy', AI_LAB.oldBuy]] as const) if (oldAll.includes(feat) || (!isA(gd.id) && oldB.includes(feat))) set.add(gd.id);
  for (const g of c.guilds) g.controller = 'ai';
  // recrutamento + votação + equipamento inicial (tudo pela IA)
  while (c.setup && c.setup.step === 'draft') draftHero(c, '');
  voteMap(c, '');
  for (const g of c.guilds) g.inventory = distributeStartingGear(g.heroes, c.edition);
  c.voted = c.setup!.map; c.setup = undefined; c.phase = 'choose';
  let ok = true;
  try {
    while (c.phase === 'choose') {
      const mapId = nextScenario(c)!;
      const map = MAPS[mapId];
      const isTemplo = !!map.barrier && !!map.deadlyTokens;
      // FORCEFIRE=1: no Templo só as Guildas A ganham o Protetor do Fogo (mede o efeito do título sem o resto da campanha)
      if (isTemplo && process.env.FORCEFIRE) for (const gd of c.guilds) { const has = gd.titles.includes('protetor_fogo'); if (isA(gd.id) && !has) gd.titles.push('protetor_fogo'); if (!isA(gd.id) && has) gd.titles.splice(gd.titles.indexOf('protetor_fogo'), 1); }
      const opts = gameOptions(c);
      if (isTemplo) for (const gd of c.guilds) {
        const hs = gd.heroes.map(h => gd.inventory[h] ?? []);
        for (const [hi, hero] of gd.heroes.entries()) {
          const k2 = kit[isA(gd.id) ? 'A' : 'B'], inv = (gd.inventory[hero] ?? []).map(x => CARDS[x]);
          const dTot = HEROES[hero].defense + inv.reduce((a2, d) => a2 + (d.defBonus ?? 0), 0);
          k2.n++; k2.hp += inv.reduce((a2, d) => a2 + (d.hpBonus ?? 0), 0); k2.def += inv.reduce((a2, d) => a2 + (d.defBonus ?? 0), 0); k2.defTot += dTot; if (dTot >= 6) k2.def6++;
          k2.rr += inv.reduce((a2, d) => a2 + (d.rerolls ?? 0), 0); k2.atkBest += Math.max(0, ...inv.filter(d => d.kind === 'attack').map(d => d.dice)); k2.cards += inv.length; void hi;
        }
        for (const cards of hs) for (const id of cards) { const d = CARDS[id]; tot.hp += d.hpBonus ?? 0; tot.def += d.defBonus ?? 0; tot.rr += d.rerolls ?? 0; tot.dice += d.dice; }
        tot.heroes += gd.heroes.length;
        if (map.fireProtectTitle && gd.titles.includes(map.fireProtectTitle)) tot.withFire++;
      }
      const g = Game.create(map, { ...opts, seed: seed + c.played.length * 17, deploy: false } as never);
      g.drain();
      g.choiceHook = () => 'auto' as never;
      if (isTemplo) {
        const orig = g.damageHero.bind(g);
        g.damageHero = (h, n, src) => {
          const was = h.alive; orig(h, n, src);
          if (was && !h.alive) { const k = src.kind === 'monster' ? 'M:' + (g.s.units[src.id!]?.defId ?? '?').replace(/\d+$/, '') : src.kind; deathBy[k] = (deathBy[k] ?? 0) + 1; }
        };
      }
      const ais: Record<string, SimpleAI> = {};
      let traps = 0, chests = 0;
      const openAt: Record<string, number> = {};
      let lastTr = -1;
      for (let step = 0; step < 6000 && !g.s.winner; step++) {
        if (g.s.pending) { g.autoResolvePending(); continue; }
        const cur = g.currentGuild().id;
        const ai = (ais[cur] ??= new SimpleAI(lvl, rnd, isA(cur) ? PA : PB));
        const a = ai.next(g);
        const act = a.type === 'move' ? { type: 'move' as const, cell: a.cell, openDoors: true } : a;
        if (!applyAction(g, cur, act as never)) applyAction(g, cur, { type: 'end' });
        if (isTemplo && process.env.TR && g.s.turn !== lastTr && c.played.length === 5) {
          lastTr = g.s.turn;
          const lp = Object.values(g.s.units).find(u => u.defId.startsWith('lorde_presas') && u.alive);
          const lc = lp?.cell;
          const info = g.guilds().map(gd => {
            const hs = g.heroesOf(gd.id);
            const near = lc ? hs.filter(h => h.alive && h.cell && Math.abs(h.cell.c - lc.c) + Math.abs(h.cell.r - lc.r) <= 3).length : 0;
            return `${gd.id[0]}:${hs.filter(h => h.alive).length}v/${near}perto/${hs.reduce((a2, h) => a2 + (h.alive ? h.wounds : 0), 0)}fer${gd.barrierOpen ? '' : '(fechada)'}`;
          }).join(' ');
          console.log(`T${String(g.s.turn).padStart(3)} Lorde ${lp ? lp.wounds + '/' + g.maxHp(lp) : 'x'} | ${info}`);
        }
        if (isTemplo) for (const gd of g.guilds()) if (gd.barrierOpen && openAt[gd.id] === undefined) openAt[gd.id] = g.s.turn;
        for (const e of g.drain()) if (e.t === 'log') {
          if (e.text.includes('Armadilha do Templo')) traps++;
          if (e.text.includes('Baú amaldiçoado')) chests++;
        }
      }
      const pm = (perScenario[map.id] ??= { n: 0, turns: 0, stuck: 0 });
      pm.n++; pm.turns += g.s.turn;
      if (isTemplo) {
        tot.temploGames++; tot.temploTurns += g.s.turn; tot.trapDeaths += traps; tot.chestHits += chests;
        tot.barrierOpen += g.guilds().filter(x => x.barrierOpen).length;
        tot.deaths += g.guilds().reduce((s, gd) => s + g.heroesOf(gd.id).reduce((a, h) => a + h.deaths, 0), 0);
        if (g.s.winner) {
          tot.bossKills++;
          bossTurns.push(g.s.turn);
          for (const [gid, t0] of Object.entries(openAt)) { openTurns.push(t0); if (gid === g.s.winner) openWinner.push(t0); }
          const firstId = Object.entries(openAt).sort((a, b) => a[1] - b[1])[0]?.[0];
          if (firstId) { firstOpenWins.n++; if (firstId === g.s.winner) firstOpenWins.win++; }
          for (const gd of c.guilds) { const k = map.fireProtectTitle && gd.titles.includes(map.fireProtectTitle) ? 'with' : 'without'; fireStat[k].n++; if (gd.id === g.s.winner) fireStat[k].win++; }
        }
      }
      if (!g.s.winner) {
        pm.stuck++; if (isTemplo) tot.temploStuck++;
        if (verbose) console.log('TRAVOU', map.id, 'campanha', seed, 'turno', g.s.turn, g.guilds().map(x => x.id + ' $' + x.coins + (x.barrierOpen ? ' aberta' : '') + ' vivos ' + g.heroesOf(x.id).filter(h => h.alive).length).join(' | '));
        ok = false; break;
      }
      winBy[g.s.winner] = (winBy[g.s.winner] ?? 0) + 1;
      const side = isA(g.s.winner) ? 'A' : 'B'; ab[side].all++; if (isTemplo) ab[side].templo++;
      if (verbose) console.log(`  ${map.id.slice(0, 24).padEnd(24)} turno ${String(g.s.turn).padStart(3)} venceu ${g.s.winner}${isTemplo ? ` | armadilhas ${traps} baús ${chests}` : ''}`);
      recordResult(c, g);
      if (c.phase === 'upgrade') autoUpgrade(c);
    }
  } catch (e) {
    tot.errors++; ok = false;
    console.log('ERRO campanha', seed, (e as Error).stack?.split('\n').slice(0, 4).join(' | '));
  }
  tot.camps++; if (!ok) tot.stuck++;
}
const pct = (a: number, b: number) => b ? (100 * a / b).toFixed(0) + '%' : '-';
console.log(`campanhas ${tot.camps} (IA ${lvl}, ${cap ? 'limite 8/6' : 'dados ilimitados'}) | travadas/erros ${tot.stuck}/${tot.errors}`);
console.log(Object.entries(perScenario).map(([k, v]) => `${k.slice(0, 24).padEnd(24)} ${(v.turns / v.n).toFixed(1).padStart(6)} turnos  travou ${v.stuck}/${v.n}`).join('\n'));
const t = tot.temploGames || 1, h = tot.heroes || 1;
console.log(`TEMPLO: ${tot.temploGames} partidas | terminou ${pct(tot.bossKills, tot.temploGames)} | turnos ${(tot.temploTurns / t).toFixed(0)} | mortes ${(tot.deaths / t).toFixed(1)} (Armadilhas ${(tot.trapDeaths / t).toFixed(1)}, Baús ${(tot.chestHits / t).toFixed(1)}) | barreiras abertas ${(tot.barrierOpen / t).toFixed(1)} | Guildas com Protetor do Fogo ${pct(tot.withFire, tot.heroes / 3)}`);
console.log(`  Heróis ao chegar ao Templo (média): Vida +${(tot.hp / h).toFixed(1)} Defesa +${(tot.def / h).toFixed(1)} Rerrolagens ${(tot.rr / h).toFixed(1)} dados de ataque ${(tot.dice / h).toFixed(1)}`);
const avg = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
console.log(`  barreira aberta no turno ${avg(openTurns)} (da vencedora ${avg(openWinner)}) | Lorde morre no turno ${avg(bossTurns)} | 1ª a abrir vence ${pct(firstOpenWins.win, firstOpenWins.n)} | com Protetor do Fogo vence ${pct(fireStat.with.win, fireStat.with.n)} (${fireStat.with.n}) x sem ${pct(fireStat.without.win, fireStat.without.n)} (${fireStat.without.n})`);
console.log(`DUELO  Templo: A ${ab.A.templo} x B ${ab.B.templo} (${pct(ab.A.templo, ab.A.templo + ab.B.templo)} A) | todos os cenários: A ${ab.A.all} x B ${ab.B.all} (${pct(ab.A.all, ab.A.all + ab.B.all)} A)`);
console.log('mortes por causa (Templo):', JSON.stringify(Object.fromEntries(Object.entries(deathBy).sort((a, b) => b[1] - a[1]))));
for (const side of ['A', 'B'] as const) { const k2 = kit[side], m = k2.n || 1; console.log(`  Kit no Templo, lado ${side}: Vida +${(k2.hp / m).toFixed(2)} Defesa +${(k2.def / m).toFixed(2)} (total ${(k2.defTot / m).toFixed(1)}, ${pct(k2.def6, k2.n)} com 6+) Rerrolagens ${(k2.rr / m).toFixed(2)} melhor arma ${(k2.atkBest / m).toFixed(1)} dados | ${(k2.cards / m).toFixed(1)} cartas por Herói`); }
console.log('vitórias por Guilda:', JSON.stringify(winBy));
void HEROES;
