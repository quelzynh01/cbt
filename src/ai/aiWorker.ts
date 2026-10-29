import { Game } from '../engine/game';
import { getMap } from '../engine/maps';
import { SearchAI } from './search';
import type { BrainRequest, BrainReply } from './brain';

// Web Worker da IA: a busca por simulação roda aqui para a tela não travar enquanto a IA pensa.
let ais = new Map<string, SearchAI>();

self.onmessage = (e: MessageEvent<BrainRequest>) => {
  const req = e.data;
  if (req.kind === 'reset') { ais = new Map(); return; }
  let reply: BrainReply;
  try {
    const g = new Game(getMap(req.state.mapId), req.state);
    const ai = ais.get(req.guild) ?? new SearchAI({ ...req.opts });
    ais.set(req.guild, ai);
    reply = { id: req.id, action: ai.next(g) };
  } catch (err) {
    reply = { id: req.id, action: null, error: String(err) };
  }
  (self as unknown as Worker).postMessage(reply);
};
