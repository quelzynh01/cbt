import { Game } from '../engine/game';
import { getMap } from '../engine/maps';
import type { GuildId } from '../engine/types';
import { SearchAI, rolloutSums, type RolloutPool } from './search';
import type { BrainRequest, BrainReply, HelperMsg, HelperReply } from './brain';

// Web Worker da IA: a busca por simulação roda aqui para a tela não travar enquanto a IA pensa.
// O Worker principal recebe `next` e pode repartir as simulações com Workers auxiliares (`pool`), ligados por MessagePort.
// Um auxiliar recebe `helper` e daí em diante só simula o que o principal pedir.
let ais = new Map<string, SearchAI>();
let pool: PortPool | null = null;

/** Lado do Worker principal: manda as rodadas para os auxiliares e junta as respostas. */
class PortPool implements RolloutPool {
  private rid = 0;
  private sid = 0;
  private waiting: Map<number, (sums: number[] | null) => void>[];
  /** Auxiliar que não respondeu a tempo: fica de fora (senão toda rodada esperaria por ele). */
  private dead: boolean[];
  constructor(private ports: MessagePort[]) {
    this.waiting = ports.map(() => new Map());
    this.dead = ports.map(() => false);
    ports.forEach((p, k) => {
      p.onmessage = (e: MessageEvent<HelperReply>) => {
        const done = this.waiting[k].get(e.data.rid);
        this.waiting[k].delete(e.data.rid);
        done?.(e.data.sums);
      };
    });
  }
  get size() { return this.ports.length; }
  begin(job: Parameters<RolloutPool['begin']>[0]): number {
    const sid = ++this.sid;
    for (const p of this.ports) p.postMessage({ kind: 'begin', sid, ...job } satisfies HelperMsg);
    return sid;
  }
  run(sid: number, idx: number[], seeds: number[][]): Promise<(number[] | null)[]> {
    const rid = ++this.rid;
    return Promise.all(this.ports.map((p, k) => new Promise<number[] | null>(resolve => {
      if (this.dead[k]) { resolve(null); return; }
      // auxiliar travado ou morto: segue sem ele
      const timer = setTimeout(() => { this.waiting[k].delete(rid); this.dead[k] = true; resolve(null); }, 4000);
      this.waiting[k].set(rid, sums => { clearTimeout(timer); resolve(sums); });
      p.postMessage({ kind: 'run', sid, rid, idx, seeds: seeds[k] } satisfies HelperMsg);
    })));
  }
}

/** Lado do auxiliar: guarda a partida da busca atual e simula cada rodada. */
function serveHelper(port: MessagePort) {
  let cur: { sid: number; g: Game; job: Extract<HelperMsg, { kind: 'begin' }> } | null = null;
  port.onmessage = (e: MessageEvent<HelperMsg>) => {
    const m = e.data;
    if (m.kind === 'begin') { cur = { sid: m.sid, g: new Game(getMap(m.state.mapId), m.state), job: m }; return; }
    let sums: number[] | null = null;
    try {
      if (cur && cur.sid === m.sid) {
        const j = cur.job;
        sums = rolloutSums(cur.g, j.me as GuildId, m.idx.map(i => j.plans[i]), m.seeds, j.params, j.mem, j.w);
      }
    } catch (err) { console.warn('IA (auxiliar):', err); }
    port.postMessage({ rid: m.rid, sums } satisfies HelperReply);
  };
}

self.onmessage = async (e: MessageEvent<BrainRequest>) => {
  const req = e.data;
  if (req.kind === 'reset') { ais = new Map(); return; }
  if (req.kind === 'pool') { pool = new PortPool(req.ports); return; }
  if (req.kind === 'helper') { serveHelper(req.port); return; }
  let reply: BrainReply;
  try {
    const g = new Game(getMap(req.state.mapId), req.state);
    const ai = ais.get(req.guild) ?? new SearchAI({ ...req.opts });
    ais.set(req.guild, ai);
    const action = await ai.nextParallel(g, pool);
    reply = { id: req.id, action, ...(ai.last ? { samples: ai.last.samples } : {}) };
    ai.last = null;
  } catch (err) {
    reply = { id: req.id, action: null, error: String(err) };
  }
  (self as unknown as Worker).postMessage(reply);
};
