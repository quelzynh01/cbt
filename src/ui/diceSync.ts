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
  /** Começa a rolagem de uma decisão de Rerrolagem (a chave vem do pedido, igual em todos os computadores). */
  beginDecision(req: { heroId: string; kind: string; faces: string[]; round?: number }) {
    rollKey = `dec|${req.heroId}|${req.kind}|${req.faces.join('')}|${req.round ?? 1}`;
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
  /** Quem joga neste ataque: a Guilda que rola o ataque (dono do Herói ou quem controla o Monstro) e as dos Heróis atacados. */
  players(e: Attack, guildOf: (id: string) => GuildId | null | undefined): GuildId[] {
    const out = [e.ctl ?? guildOf(e.attackerId), ...e.targets.map(t => guildOf(t.id))].filter((g): g is GuildId => !!g);
    return [...new Set(out)];
  },
  /** Fim da tela do ataque: cada jogador avisa quando terminou ("Continuar" na tela de combate, ou o fim da animação no "Nunca").
   *  Todas as telas esperam todos os envolvidos (online) antes de seguir para o golpe e a Reação — assim ninguém vê antes. */
  async finish(players: GuildId[], mine: (g: GuildId) => boolean, show?: (who: string) => void, ms = 60000) {
    for (const g of players) if (mine(g)) this.mine(`done:${g}`);
    for (const g of players) {
      if (!this.remote(g) || got.has(`${rollKey}#done:${g}`)) continue;
      show?.(this.net?.name(g) ?? '');
      await this.wait(`done:${g}`, ms);
    }
  },
  /** Chegou o aviso de um passo (de outro computador). */
  receive(id: string) {
    if (got.has(id)) return;
    got.add(id); order.push(id);
    if (order.length > 300) got.delete(order.shift()!);
    for (const f of waiters.get(id) ?? []) f();
  },
};
