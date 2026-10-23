import type { GameState } from '../engine/types';
import type { Lobby } from './net';
import type { OnlineSetup } from './onlineSetup';

// Partidas online salvas (no navegador do anfitrião): a sala, a preparação/campanha e o estado da partida.
// O anfitrião reabre a sala depois (mesmo código, se der) e os jogadores voltam para as mesmas vagas.

export interface OnlineSave {
  id: string;
  savedAt: number;
  /** Sala completa (vagas, campanha, preparação sem esconder nada). */
  lobby: Lobby;
  /** Campanha online: a preparação guardada enquanto um cenário é jogado. */
  stash: OnlineSetup | null;
  /** Partida em andamento (null = na mesa: preparação ou Fase de Melhorias). */
  state: GameState | null;
}

const STORE = 'cbt.onlineSaves';
const MAX = 6;

export function listSaves(): OnlineSave[] {
  try { const v = JSON.parse(localStorage.getItem(STORE) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

function write(all: OnlineSave[]) {
  // sem espaço: descarta as mais antigas até caber
  for (let list = all.slice(0, MAX); list.length; list = list.slice(0, -1)) {
    try { localStorage.setItem(STORE, JSON.stringify(list)); return; } catch { /* cheio */ }
  }
  try { localStorage.removeItem(STORE); } catch { /* sem armazenamento */ }
}

export function putSave(s: OnlineSave) {
  write([s, ...listSaves().filter(x => x.id !== s.id)].sort((a, b) => b.savedAt - a.savedAt));
}

export function removeSave(id: string) {
  write(listSaves().filter(x => x.id !== id));
}

export function newSaveId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
