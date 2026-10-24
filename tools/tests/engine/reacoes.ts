import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';

// Vários Monstros atacados (Fender, Raio Nova…): quem controla os Monstros escolhe qual faz a Vingança (p.20).
// Esconderijo do Troll (Praça da Aurora Vermelha): a carta aparece para todos e, com o inventário cheio, o jogador escolhe onde fica.
let ok = true;
const check = (cond: boolean, msg: string) => { console.log(cond ? '✔' : '✘', msg); if (!cond) ok = false; };
{
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 5, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['espada_enferrujada', 'fender'] } },
    { guild: 'vermelho', controller: 'human', heroes: ['johan', 'kanga', 'diva'] }] });
  g.s.deploying = [];
  const mons = Object.values(g.s.units).filter(u => u.kind === 'monster');
  for (const m of mons) { m.alive = false; m.cell = null; }
  const [grom] = g.heroesOf('azul');
  grom.cell = { c: 4, r: 5 };
  const [a, b] = mons.filter(m => /^(orc|goblin)/.test(m.defId));
  a.alive = true; a.cell = { c: 4, r: 4 }; a.wounds = 0;
  b.alive = true; b.cell = { c: 3, r: 5 }; b.wounds = 0;
  let asked: string[] = [];
  g.choiceHook = req => {
    if (req.choice === 'extra' && req.source === 'Reação de Vingança') { asked = req.units ?? []; return asked.indexOf(b.id); }
    if (req.choice === 'extra') return (req.units ?? []).indexOf(b.id);
    return 'auto';
  };
  g.rerollHook = () => 'auto';
  g.s.debug.heroesImmortal = true;
  g.activate(grom.id);
  const espada = grom.cards.find(c => c.defId === 'espada_enferrujada')!;
  const okAtk = g.attack(espada.uid, a.id, b.id);
  check(okAtk, 'Grom atacou os 2 Monstros (Fender)');
  const alive = [a, b].filter(m => m.alive).length;
  check(alive === 2 ? asked.length === 2 : true, `perguntou qual Monstro faz a Vingança (${asked.length} opções, vivos: ${alive})`);
  check(alive < 2 || g.s.pending?.monsterId === b.id, 'a Vingança é do Monstro escolhido (o 2º)');
}
{
  const g = Game.create(MAPS['praca-da-aurora-vermelha'], { seed: 5, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['espada_enferrujada', 'adaga_aparadora', 'estilingue', 'raio_nova'] } },
    { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = [];
  const [grom] = g.heroesOf('azul');
  let req: { source?: string; newCard?: string } | null = null;
  g.choiceHook = r => { if (r.choice === 'reward') { req = r; return 1; } return 'auto'; };
  grom.cell = { ...MAPS['praca-da-aurora-vermelha'].hideout!.cells[0] };
  (g as unknown as { checkHideout: (h: unknown) => void }).checkHideout(grom);
  const ev = g.drain().find(e => e.t === 'reward') as { cardId: string; source?: string } | undefined;
  check(!!req && (req as { source?: string }).source === 'Esconderijo do Troll', 'inventário cheio: perguntou onde a carta fica (como a Recompensa)');
  check(ev?.cardId === 'machado_schmetterling' && ev.source === 'Esconderijo do Troll', 'a carta aparece na tela para todos');
  check(grom.cards[1]?.defId === 'machado_schmetterling' && (g.s.spare?.azul ?? []).some(c => c.defId === 'adaga_aparadora'), 'trocou pela Adaga (que ficou sem Herói)');
}
{
  // a carta é de quem pegou: com o inventário cheio, "auto" (IA) guarda sem Herói — não vai para um Aliado
  const g = Game.create(MAPS['praca-da-aurora-vermelha'], { seed: 6, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'], cards: { grom: ['espada_enferrujada', 'adaga_aparadora', 'estilingue', 'raio_nova'] } },
    { guild: 'vermelho', controller: 'ai' }] });
  g.s.deploying = [];
  const [grom, maya] = g.heroesOf('azul');
  let units: string[] | undefined;
  g.choiceHook = r => { if (r.choice === 'reward') units = r.units; return 'auto'; };
  grom.cell = { ...MAPS['praca-da-aurora-vermelha'].hideout!.cells[0] };
  (g as unknown as { checkHideout: (h: unknown) => void }).checkHideout(grom);
  check((units ?? []).length === 0, 'não oferece dar a carta para um Aliado');
  check(!maya.cards.some(c => c.defId === 'machado_schmetterling') && (g.s.spare?.azul ?? []).some(c => c.defId === 'machado_schmetterling'), 'sem troca: a carta fica sem Herói (outro Herói só no Descanso)');
}
{
  // marcador de Missão de quem morreu cai no chão (não vai para quem matou)
  const g = Game.create(MAPS['distrito-dos-martelos'], { seed: 5, fixedOrder: true, players: [
    { guild: 'azul', controller: 'human', heroes: ['grom', 'maya', 'zazu'] },
    { guild: 'vermelho', controller: 'human', heroes: ['johan', 'kanga', 'diva'] }] });
  g.s.deploying = [];
  const [grom] = g.heroesOf('azul');
  const [johan] = g.heroesOf('vermelho');
  johan.cell = { c: 4, r: 4 }; grom.cell = { c: 4, r: 5 };
  johan.tokens = [{ id: 'mm1', type: 'missao', color: 'vermelho', faceUp: true } as never, { id: 'cu1', type: 'cura' } as never];
  g.damageHero(johan, 99, { kind: 'hero', id: grom.id });
  check(!grom.tokens.some(t => t.type === 'missao'), 'quem matou NÃO ficou com o marcador de Missão');
  check((g.s.floor['4,4'] ?? []).some(t => t.id === 'mm1'), 'o marcador de Missão caiu no Espaço onde ele morreu');
  check(grom.tokens.some(t => t.id === 'cu1'), 'a Poção (Exploração) continua sendo saqueada');
}
console.log(ok ? 'VINGANÇA ESCOLHIDA E ESCONDERIJO OK' : 'FALHOU');
