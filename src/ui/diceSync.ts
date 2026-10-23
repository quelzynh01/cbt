import type { GameEvent, GuildId } from '../engine/types';

// Online: os dados aparecem ao mesmo tempo para todos. Quem rola (o dono da Guilda) avisa cada passo
// ("rolou o ataque", "rolou o ✷ 1", "rolou a Defesa de X") pela rede; nas outras telas a animação daquele
// passo espera o aviso. Os passos têm nome (não contagem), então a tela de combate e os dados do centro combinam.

type Attack = Extract<GameEvent, { t: 'attack' }>;

const got = new Set<string>();
const order: string[] = [];
const waiters = new Map<string, (() => void)[]>();
let rollKey = '';

export const diceSync = {
  /** Ligado pelo controlador no online: envia um passo e diz se a Guilda é de um jogador em outro computador. */
  net: null as null | { send(id: string): void; remote(g: GuildId | null | undefined): boolean; name(g: GuildId): string },

  /** Começa a rolagem de um ataque (a chave é igual em todos os computadores). */
  begin(e: Attack) {
    rollKey = `${e.attackerId}|${e.dice.join('')}|${e.targets.map(t => `${t.id}:${t.defense.join('')}`).join(',')}`;
  },
  /** A Guilda que rola é de outro jogador (online)? */
  remote(g: GuildId | null | undefined) { return !!this.net && !!g && this.net.remote(g); },
  /** Eu rolei este passo: avisa os outros. */
  mine(step: string) { this.net?.send(`${rollKey}#${step}`); },
  /** Espera o jogador de outro computador rolar este passo (no máximo 60 s). */
  wait(step: string, ms = 60000): Promise<void> {
    const id = `${rollKey}#${step}`;
    if (got.has(id)) return Promise.resolve();
    return new Promise(res => {
      const t = window.setTimeout(done, ms);
      function done() { clearTimeout(t); const l = waiters.get(id)?.filter(f => f !== done) ?? []; if (l.length) waiters.set(id, l); else waiters.delete(id); res(); }
      waiters.set(id, [...(waiters.get(id) ?? []), done]);
    });
  },
  /** Chegou o aviso de um passo (de outro computador). */
  receive(id: string) {
    if (got.has(id)) return;
    got.add(id); order.push(id);
    if (order.length > 300) got.delete(order.shift()!);
    for (const f of waiters.get(id) ?? []) f();
  },
};
