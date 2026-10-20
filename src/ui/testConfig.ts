import { ALL_HEROES, CARDS, HEROES, TEST_HUMAN_HEROES, distributeStartingGear } from '../engine/data';
import { MAPS, loadMapId } from '../engine/maps';
import type { GuildId } from '../engine/types';

// Configuração do Modo Teste: mapa, quantidade de times (2-4, cada um Você ou IA), seus Heróis e itens.

export const TEST_GUILDS: GuildId[] = ['azul', 'vermelho', 'verde', 'laranja'];

export interface TestTeam { guild: GuildId; controller: 'human' | 'ai'; /** Nome do time (vazio = cor). */ name?: string }
export interface TestConfig {
  mapId: string;
  teams: TestTeam[];
  /** Heróis do Time 1 (os seus). Os outros times recebem Heróis diferentes, sorteados. */
  heroes: string[];
  /** Cartas de cada Herói do Time 1. */
  cards: Record<string, string[]>;
}

const STORE = 'cbt.test';
export const MAX_SLOTS = 4;
/** Espaços de um Herói com estas cartas (Tomo da Iluminação: +2). */
export function slotsFor(cards: string[]): number { return MAX_SLOTS + cards.reduce((s, id) => s + (CARDS[id]?.fx.magicSlots ?? 0), 0); }

export function defaultTestConfig(): TestConfig {
  const heroes = TEST_HUMAN_HEROES.slice();
  return {
    mapId: loadMapId(),
    teams: [{ guild: 'azul', controller: 'human' }, { guild: 'vermelho', controller: 'ai' }],
    heroes,
    cards: distributeStartingGear(heroes),
  };
}

/** Corrige uma configuração (salva ou editada) para ficar sempre válida. */
export function normalizeTestConfig(c: Partial<TestConfig>): TestConfig {
  const d = defaultTestConfig();
  const mapId = c.mapId && MAPS[c.mapId] ? c.mapId : d.mapId;
  let teams = Array.isArray(c.teams) ? c.teams.filter(t => TEST_GUILDS.includes(t.guild)).slice(0, 4) : d.teams;
  teams = TEST_GUILDS.slice(0, Math.max(2, teams.length)).map((g, i) => {
    const name = typeof teams[i]?.name === 'string' ? teams[i].name!.trim().slice(0, 20) : '';
    return { guild: g, controller: teams[i]?.controller === 'ai' ? 'ai' : teams[i]?.controller === 'human' ? 'human' : i === 0 ? 'human' : 'ai', ...(name ? { name } : {}) };
  });
  let heroes = Array.isArray(c.heroes) ? [...new Set(c.heroes.filter(h => HEROES[h]))].slice(0, 3) : d.heroes;
  for (const h of ALL_HEROES) if (heroes.length < 3 && !heroes.includes(h)) heroes = [...heroes, h];
  const gear = distributeStartingGear(heroes);
  const cards = Object.fromEntries(heroes.map(h => [h, (c.cards?.[h] ?? gear[h]).filter(id => CARDS[id]).slice(0, slotsFor((c.cards?.[h] ?? gear[h]).filter(id => CARDS[id])))]));
  return { mapId, teams, heroes, cards };
}

export function loadTestConfig(): TestConfig {
  try { return normalizeTestConfig(JSON.parse(localStorage.getItem(STORE) ?? '{}')); } catch { return defaultTestConfig(); }
}

export function saveTestConfig(c: TestConfig) {
  try { localStorage.setItem(STORE, JSON.stringify(c)); } catch { /* sem armazenamento */ }
}
