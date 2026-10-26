import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { DEFENSE_DIE } from '../../../src/engine/data';
import { HELD_PICK } from '../../../src/engine/game';

// Defesa: sem acertos, quem defende escolhe rolar ou manter (IA e Monstros mantêm); já bloqueou tudo: o ✷ extra só rola se escolher.
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
const mk = (cards: Record<string, string[]> = {}) => {
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 8, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards }, { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = [];
  return g;
};
type G = { roll: (...a: unknown[]) => { faces: string[]; successes: number; crits: number }; monsterAttack: (m: unknown, h: unknown, r: string) => void };
{
  // ataque com 0 acertos: ninguém rola Defesa
  const g = mk();
  const [grom] = g.heroesOf('azul');
  const m = Object.values(g.s.units).find(u => u.kind === 'monster' && u.alive)!;
  m.cell = { ...grom.cell! };
  const gg = g as unknown as G;
  const orig = gg.roll.bind(g);
  let first = true;
  gg.roll = (...a: unknown[]) => { if (first && a[1] !== DEFENSE_DIE) { first = false; const n = a[0] as number; return { faces: Array(n).fill('blank'), successes: 0, crits: 0 }; } return orig(...a); };
  gg.monsterAttack(m, grom, 'alerta');
  const e = g.drain().find(x => x.t === 'attack') as { hits: number; targets: { defense: string[]; noHits?: boolean }[] };
  check(e.hits === 0 && e.targets[0].defense.length === 0 && !!e.targets[0].noHits, 'ataque sem acertos (escolheu manter / IA): a Defesa não foi rolada');
}
{
  // sem acertos, mas o jogador escolhe rolar a Defesa
  const g = mk();
  const [grom] = g.heroesOf('azul');
  const m = Object.values(g.s.units).find(u => u.kind === 'monster' && u.alive)!;
  m.cell = { ...grom.cell! };
  let asked = '';
  g.choiceHook = r => { if (r.choice === 'confirm') { asked = r.yes ?? ''; return 0; } return 'auto'; };
  const gg = g as unknown as G;
  const orig = gg.roll.bind(g);
  let first = true;
  gg.roll = (...a: unknown[]) => { if (first && a[1] !== DEFENSE_DIE) { first = false; const n = a[0] as number; return { faces: Array(n).fill('blank'), successes: 0, crits: 0 }; } return orig(...a); };
  gg.monsterAttack(m, grom, 'alerta');
  const e = g.drain().find(x => x.t === 'attack') as { targets: { defense: string[]; noHits?: boolean }[] };
  check(asked.includes('Rolar') && e.targets[0].defense.length > 0 && !e.targets[0].noHits, `perguntou ("${asked}" / Manter) e rolou a Defesa`);
}
{
  // o ✷ da Defesa não rola mais dado depois de cobrir os acertos
  const g = mk();
  let extra = 0, never = 0;
  for (let i = 0; i < 400; i++) {
    const r = g.roll(4, DEFENSE_DIE, 'shield', 'normal', true, 1);
    if (r.faces.length > 4) extra++;
    const r0 = g.roll(4, DEFENSE_DIE, 'shield', 'normal', true, 0);
    if (r0.faces.length > 4) never++;
  }
  check(never === 0, 'com 0 acertos para bloquear, o ✷ nunca rola dado extra');
  check(extra === 0, 'precisando bloquear 1: depois do 1º bloqueio o ✷ não rola dado extra');
}
for (const want of [false, true]) {
  // Rerrolagem na Defesa: já bloqueou tudo -> uma pergunta só, Manter é o padrão
  const g = mk({ grom: ['coracao_unicornio'] });
  const [grom] = g.heroesOf('azul');
  const m = Object.values(g.s.units).find(u => u.kind === 'monster' && u.alive)!;
  m.cell = { ...grom.cell! };
  let asked = 0, covered = 0;
  g.rerollHook = r => { if (r.kind !== 'defense') return 'auto'; asked++; if (r.covered) covered++; return want ? [0] : []; };
  const gg = g as unknown as G;
  const orig = gg.roll.bind(g);
  gg.roll = (...a: unknown[]) => {
    const n = a[0] as number;
    if (a[1] === DEFENSE_DIE && n > 1) return { faces: Array(n).fill('shield'), successes: n, crits: 0 };
    if (a[1] !== DEFENSE_DIE) return { faces: ['melee', 'blank', 'blank'], successes: 1, crits: 0 };
    return orig(...a);
  };
  gg.monsterAttack(m, grom, 'alerta');
  const e = g.drain().find(x => x.t === 'attack') as { targets: { rr?: { idx: number[] } }[] };
  if (!want) check(g.rerollsOf(grom) > 0 && asked === 1 && covered === 1 && !(e.targets[0].rr?.idx.length), `já bloqueou: perguntou 1x no painel ("Manter" é o padrão) e manteve`);
  else check(covered >= 1 && e.targets[0].rr?.idx.length === 1, `já bloqueou e escolheu rerrolar: rerrolou 1 dado (${asked} pergunta(s))`);
}
{
  // ✷ guardado: a Defesa que já bloqueou tudo só rola o dado extra se o jogador pedir (HELD_PICK)
  for (const want of [false, true]) {
    const g = mk();
    const [grom] = g.heroesOf('azul');
    const m = Object.values(g.s.units).find(u => u.kind === 'monster' && u.alive)!;
    m.cell = { ...grom.cell! };
    let held = 0;
    g.rerollHook = r => { if (r.kind === 'defense' && r.covered) { held = r.held ?? 0; return want ? [HELD_PICK] : []; } return 'auto'; };
    const gg = g as unknown as G;
    const orig = gg.roll.bind(g);
    gg.roll = (...a: unknown[]) => a[1] !== DEFENSE_DIE ? { faces: ['melee', 'blank', 'blank'], successes: 1, crits: 0 } : orig(a[0], a[1], 'crit', 'max', ...a.slice(4));
    (g as unknown as { rerollsOf: () => number }).rerollsOf = () => 0;
    gg.monsterAttack(m, grom, 'alerta');
    const e = g.drain().find(x => x.t === 'attack') as { targets: { defense: string[] }[] };
    const n = e.targets[0].defense.length;
    const base = (e.targets[0] as { base?: number }).base ?? 0;
    check(held > 0 && (want ? n > base : n === base), `✷ guardado (${held}): ${want ? 'pediu e rolou o extra' : 'manteve sem rolar o extra'} (${n} dados)`);
  }
}
for (const use of [false, true]) {
  // Escudo de Cavaleiro e Escudo do Rei: perguntados na hora do combate (exaustam o Herói)
  const g = mk({ grom: ['escudo_cavaleiro'], maya: ['escudo_rei'] });
  const [grom, maya] = g.heroesOf('azul');
  const ms = Object.values(g.s.units).filter(u => u.kind === 'monster' && u.alive);
  const asked: string[] = [];
  g.choiceHook = r => { if (r.choice === 'confirm' && r.source.startsWith('Escudo')) { asked.push(r.source); return use ? 0 : -1; } return 'auto'; };
  const gg = g as unknown as G;
  const orig = gg.roll.bind(g);
  gg.roll = (...a: unknown[]) => a[1] !== DEFENSE_DIE ? { faces: ['melee', 'melee', 'blank'], successes: 2, crits: 0 } : orig(...a);
  ms[0].cell = { ...grom.cell! };
  gg.monsterAttack(ms[0], grom, 'alerta');
  ms[1].cell = { ...maya.cell! };
  gg.monsterAttack(ms[1], maya, 'alerta');
  const ok2 = asked.includes('Escudo de Cavaleiro') && asked.includes('Escudo do Rei') && !!grom.spent === use && !!maya.spent === use;
  check(ok2, `escudos perguntados no combate (${asked.join(', ')}); ${use ? 'usou: Heróis exaustos' : 'não usou: Heróis prontos'}`);
}
console.log(ok ? 'DEFESA SÓ QUANDO PRECISA OK' : 'FALHOU');
