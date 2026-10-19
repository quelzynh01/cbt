import type { Game, RestOptions } from './game';
import type { Cell, GuildId } from './types';

/** Jogadas serializáveis: é isto que viaja pela rede no modo online. */
export type Action =
  | { type: 'activate'; heroId: string }
  | { type: 'move'; cell: Cell; openDoors?: boolean }
  | { type: 'door'; doorId: string }
  | { type: 'attack'; cardUid: string; targetId: string; secondaryId?: string; sacrifice?: boolean; boosts?: string[] }
  | { type: 'token'; tokenId: string }
  | { type: 'rest'; opts?: RestOptions }
  | { type: 'end' }
  | { type: 'vengeance'; dest: Cell | null; attack: boolean }
  | { type: 'place'; heroId: string; cell: Cell }
  | { type: 'ready' };

/** Aplica a jogada se `by` tiver o direito de fazê-la agora. */
export function applyAction(g: Game, by: GuildId, a: Action): boolean {
  if (g.s.winner) return false;
  if (a.type === 'place') return g.placeHero(by, a.heroId, a.cell);
  if (a.type === 'ready') return g.deployDone(by);
  if (g.s.deploying?.length) return false;
  if (a.type === 'vengeance') {
    if (g.s.pending?.controller !== by) return false;
    return g.resolveVengeance(a.dest, a.attack);
  }
  if (g.currentGuild().id !== by || g.s.pending) return false;
  switch (a.type) {
    case 'activate': return g.activate(a.heroId);
    case 'move': return g.moveTo(a.cell, !!a.openDoors);
    case 'door': return g.toggleDoor(a.doorId);
    case 'attack': return g.attack(a.cardUid, a.targetId, a.secondaryId, !!a.sacrifice, a.boosts ?? []);
    case 'token': return g.useToken(a.tokenId);
    case 'rest': return g.rest(a.opts ?? {});
    case 'end': return g.endTurn();
  }
}

/** Guilda que precisa agir agora (decisão de Vingança pendente ou a da vez). */
export function actingGuild(g: Game): GuildId {
  return g.s.pending?.controller ?? g.currentGuild().id;
}
