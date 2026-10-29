import { Game } from '../engine/game';
import { getMap } from '../engine/maps';
import type { GameState, GuildId } from '../engine/types';
import type { AIAction, AIParams, Plan, SimpleAI } from './ai';
import { SearchAI, SEARCH_OPTS, type EvalWeights, type SearchOpts } from './search';

export type BrainRequest =
  | { kind: 'next'; id: number; guild: GuildId; state: GameState; opts: SearchOpts }
  | { kind: 'reset' }
  /** Para o Worker principal: as portas dos auxiliares. */
  | { kind: 'pool'; ports: MessagePort[] }
  /** Este Worker vira auxiliar e atende o principal por esta porta. */
  | { kind: 'helper'; port: MessagePort };
export interface BrainReply { id: number; action: AIAction | null; error?: string; /** simulações da última busca (diagnóstico) */ samples?: number }
/** Principal -> auxiliar. */
export type HelperMsg =
  | { kind: 'begin'; sid: number; state: GameState; me: GuildId; plans: (Plan | null)[]; params: Partial<AIParams>; mem: ReturnType<SimpleAI['memory']>; w: EvalWeights }
  | { kind: 'run'; sid: number; rid: number; idx: number[]; seeds: number[] };
/** Auxiliar -> principal: soma das simulações de cada plano pedido (null = não deu). */
export interface HelperReply { rid: number; sums: number[] | null }

/** Workers auxiliares: os núcleos que sobram (deixa 2 para a tela e o sistema), no máximo 3. */
export function helperCount(): number {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(0, Math.min(3, n - 2));
}

/** Cérebro das IAs da partida: pede a próxima ação ao Web Worker (a busca leva até `opts.timeMs`).
 *  Sem Worker (ou se ele falhar), roda a mesma IA aqui mesmo. A memória de cada IA fica onde ela roda: `reset()` a cada partida nova. */
export class AIBrain {
  private worker: Worker | null = null;
  private helpers: Worker[] = [];
  /** Simulações da última busca e quantos auxiliares estão ligados (diagnóstico / testes). */
  lastSamples = 0;
  get helperWorkers(): number { return this.helpers.length; }
  private seq = 0;
  private waiting = new Map<number, (a: AIAction | null) => void>();
  private local = new Map<GuildId, SearchAI>();
  constructor(private opts: SearchOpts = SEARCH_OPTS, helpers = helperCount()) {
    try {
      this.worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<BrainReply>) => {
        const done = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        if (e.data.error) console.warn('IA (worker):', e.data.error);
        if (e.data.samples !== undefined) this.lastSamples = e.data.samples;
        done?.(e.data.action);
      };
      this.worker.onerror = ev => { console.warn('IA: worker falhou, usando a IA local', ev.message); this.dropWorker(); };
    } catch { this.worker = null; }
    if (this.worker) this.startHelpers(helpers);
  }

  /** Auxiliares: dividem as simulações da busca com o Worker principal (mais simulações no mesmo tempo). */
  private startHelpers(n: number) {
    const ports: MessagePort[] = [];
    for (let i = 0; i < n; i++) {
      try {
        const w = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
        const ch = new MessageChannel();
        w.postMessage({ kind: 'helper', port: ch.port2 } satisfies BrainRequest, [ch.port2]);
        // auxiliar com erro: o principal segue sem ele (a rodada dele volta vazia)
        w.onerror = ev => { console.warn('IA: auxiliar falhou', ev.message); w.terminate(); };
        this.helpers.push(w);
        ports.push(ch.port1);
      } catch { break; }
    }
    if (ports.length) this.worker!.postMessage({ kind: 'pool', ports } satisfies BrainRequest, ports);
  }

  private dropWorker() {
    this.worker?.terminate();
    this.worker = null;
    for (const h of this.helpers) h.terminate();
    this.helpers = [];
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
