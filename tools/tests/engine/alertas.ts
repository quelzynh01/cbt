import { Game } from '../../../src/engine/game';
import { MAPS } from '../../../src/engine/maps';
import { key } from '../../../src/engine/board';

// Aviso de Reação de Alerta (antes de andar): nenhuma Reação de verdade fica sem aviso (o aviso pode ter mais: o Herói morre ou para no caminho)
let bad = 0, checked = 0, withAlert = 0;
for (const mapId of ['templo-do-amanhecer-crepuscular', 'distrito-dos-martelos', 'praca-da-aurora-vermelha', 'distrito-sempressombrio']) {
  for (let seed = 1; seed <= 6; seed++) {
    const g0 = Game.create(MAPS[mapId], { seed: seed * 101, players: [{ guild: 'azul', controller: 'human' }, { guild: 'vermelho', controller: 'ai' }] });
    g0.s.deploying = null;
    const snap = JSON.stringify(g0.s);
    const heroes = g0.heroesOf(g0.currentGuild().id).filter(h => h.alive && h.cell);
    for (const hero of heroes) {
      // espalha o Herói por Espaços livres do mapa para pegar Monstros por perto
      for (const start of g0.board.allCells().filter(c => g0.board.playable(c) && !g0.board.isPillar(c)).filter((_, i) => i % 5 === seed % 5)) {
        const g = new Game(MAPS[mapId], JSON.parse(snap));
        const h = g.unit(hero.id);
        if (g.unitsAt(start).length >= 2) continue;
        h.cell = { ...start };
        if (!g.activate(h.id)) continue;
        const a = g.s.activation;
        if (!a) continue;
        const base = JSON.stringify(g.s);
        for (const [k, n] of g.reachable(h, a.mp, h.cell!, false)) {
          if (!n.canEnd || n.prev === null) continue;
          const t = new Game(MAPS[mapId], JSON.parse(base));
          const prev = t.alertPreview(n.cell, false).length;
          t.drain();
          t.moveTo(n.cell, false);
          const real = t.drain().filter(e => e.t === 'reaction' && e.kind === 'alerta').length;
          checked++;
          if (real) withAlert++;
          if (real > prev) { bad++; if (bad <= 5) console.log('diferente', mapId, h.defId, key(start), '->', k, 'aviso', prev, 'real', real); }
        }
      }
    }
  }
}
console.log({ checked, withAlert, bad });
console.log(bad === 0 && withAlert > 50 ? 'AVISO DE ALERTA OK' : 'FALHOU');
