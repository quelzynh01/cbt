import { Game } from '../engine/game';
import { getMap } from '../engine/maps';
import type { GameState, GuildId } from '../engine/types';
import type { AIAction } from './ai';
import { SearchAI, SEARCH_OPTS, type SearchOpts } from './search';

export type BrainRequest =
  | { kind: 'next'; id: number; guild: GuildId; state: GameState; opts: SearchOpts }
  | { kind: 'reset' };
export interface BrainReply { id: number; action: AIAction | null; error?: string }

/** Cérebro das IAs da partida: pede a próxima ação ao Web Worker (a busca leva até `opts.timeMs`).
 *  Sem Worker (ou se ele falhar), roda a mesma IA aqui mesmo. A memória de cada IA fica onde ela roda: `reset()` a cada partida nova. */
export class AIBrain {
  private worker: Worker | null = null;
  private seq = 0;
  private waiting = new Map<number, (a: AIAction | null) => void>();
  private local = new Map<GuildId, SearchAI>();
  constructor(private opts: SearchOpts = SEARCH_OPTS) {
    try {
      this.worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<BrainReply>) => {
        const done = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        if (e.data.error) console.warn('IA (worker):', e.data.error);
        done?.(e.data.action);
      };
      this.worker.onerror = ev => { console.warn('IA: worker falhou, usando a IA local', ev.message); this.dropWorker(); };
    } catch { this.worker = null; }
  }

  private dropWorker() {
    this.worker?.terminate();
    this.worker = null;
    for (const done of this.waiting.values()) done(null);
    this.waiting.clear();
  }

  private localNext(guild: GuildId, state: GameState): AIAction {
    const g = new Game(getMap(state.mapId), JSON.parse(JSON.stringify(state)));
    const ai = this.local.get(guild) ?? new SearchAI({ ...this.opts });
    this.local.set(guild, ai);
    return ai.next(g);
  }

  /** Próxima ação da IA da Guilda `guild` no estado `state` (o estado não é alterado). */
  next(guild: GuildId, state: GameState): Promise<AIAction> {
    if (!this.worker) return Promise.resolve(this.localNext(guild, state));
    const id = ++this.seq;
    return new Promise(resolve => {
      this.waiting.set(id, a => resolve(a ?? this.localNext(guild, state)));
      this.worker!.postMessage({ kind: 'next', id, guild, state, opts: this.opts } satisfies BrainRequest);
    });
  }

  /** Partida nova (ou estado voltado): esquece a memória das IAs e as respostas que ainda não chegaram. */
  reset() {
    this.local.clear();
    this.waiting.clear(); // respostas antigas são descartadas (quem pediu confere a geração)
    this.worker?.postMessage({ kind: 'reset' } satisfies BrainRequest);
  }
}
