import type { MapDef } from '../board';
import { DISTRITO_DO_ALQUIMISTA } from './distritoDoAlquimista';
import { DISTRITO_DOS_MARTELOS } from './distritoDosMartelos';
import { TEMPLO_DO_AMANHECER } from './temploDoAmanhecer';
import { PORTAO_DA_LUA } from './portaoDaLua';
import { COVIL_DOS_ORCS } from './covilDosOrcs';
import { PATIO_DA_UNIVERSIDADE } from './patioDaUniversidade';
import { ARENA_DO_SOL } from './arenaDoSol';
import { VIVEIRO_DAS_AGUIAS } from './viveiroDasAguias';
import { MANSAO } from './mansao';
import { PRACA_AURORA } from './pracaAurora';
import { SEMPRESSOMBRIO } from './sempressombrio';

/** Mapas jogáveis. */
export const MAPS: Record<string, MapDef> = {
  [DISTRITO_DOS_MARTELOS.id]: DISTRITO_DOS_MARTELOS,
  [ARENA_DO_SOL.id]: ARENA_DO_SOL,
  [PORTAO_DA_LUA.id]: PORTAO_DA_LUA,
  [VIVEIRO_DAS_AGUIAS.id]: VIVEIRO_DAS_AGUIAS,
  [MANSAO.id]: MANSAO,
  [COVIL_DOS_ORCS.id]: COVIL_DOS_ORCS,
  [DISTRITO_DO_ALQUIMISTA.id]: DISTRITO_DO_ALQUIMISTA,
  [PRACA_AURORA.id]: PRACA_AURORA,
  [PATIO_DA_UNIVERSIDADE.id]: PATIO_DA_UNIVERSIDADE,
  [SEMPRESSOMBRIO.id]: SEMPRESSOMBRIO,
  [TEMPLO_DO_AMANHECER.id]: TEMPLO_DO_AMANHECER,
};

/** Cenários do Livro de Campanha. Sem `map` = em breve. */
export const CAMPAIGN: { name: string; circle: string; map?: MapDef }[] = [
  { name: 'Distrito dos Martelos', circle: 'Círculo Exterior', map: DISTRITO_DOS_MARTELOS },
  { name: 'Arena do Sol Brilhante', circle: 'Círculo Exterior', map: ARENA_DO_SOL },
  { name: 'O Portão da Lua', circle: 'Círculo Exterior', map: PORTAO_DA_LUA },
  { name: 'O Viveiro das Águias', circle: 'Círculo Exterior', map: VIVEIRO_DAS_AGUIAS },
  { name: 'A Mansão', circle: 'Círculo Exterior', map: MANSAO },
  { name: 'Covil dos Orcs', circle: 'Círculo Exterior', map: COVIL_DOS_ORCS },
  { name: 'Distrito do Alquimista', circle: 'Círculo Interior', map: DISTRITO_DO_ALQUIMISTA },
  { name: 'Praça da Aurora Vermelha', circle: 'Círculo Interior', map: PRACA_AURORA },
  { name: 'O Pátio da Universidade', circle: 'Círculo Interior', map: PATIO_DA_UNIVERSIDADE },
  { name: 'Distrito Sempressombrio', circle: 'Círculo Interior', map: SEMPRESSOMBRIO },
  { name: 'O Templo do Amanhecer Crepuscular', circle: 'Confronto Final', map: TEMPLO_DO_AMANHECER },
];

export const DEFAULT_MAP = DISTRITO_DOS_MARTELOS.id;

export function getMap(id: string | undefined | null): MapDef {
  return (id && MAPS[id]) || MAPS[DEFAULT_MAP];
}

export function loadMapId(): string {
  try { const v = localStorage.getItem('cbt.map'); if (v && MAPS[v]) return v; } catch { /* */ }
  return DEFAULT_MAP;
}
export function saveMapId(id: string) { try { localStorage.setItem('cbt.map', id); } catch { /* */ } }

/** Dificuldade do cenário (definida em cada mapa, como no Livro de Campanha). */
export function mapDifficulty(m: MapDef, _level?: string): { label: string; stars: number; color: string } {
  // dificuldade do Livro de Campanha (não depende do nível dos Monstros)
  switch (m.difficulty) {
    case 'muito': return { label: 'Muito difícil', stars: 4, color: '#b8352a' };
    case 'dificil': return { label: 'Difícil', stars: 3, color: '#d07a26' };
    case 'medio': return { label: 'Médio', stars: 2, color: '#c79a22' };
    default: return { label: 'Fácil', stars: 1, color: '#3c9a52' };
  }
}

/** Selo HTML da dificuldade (ex.: ★★☆☆ Difícil · Monstros Nível 4-5). */
export function difficultyBadge(m: MapDef, level?: string): string {
  const d = mapDifficulty(m, level);
  return `<span class="diff" style="--dc:${d.color}" title="Monstros Nível ${level ?? m.level ?? '1'}">${'★'.repeat(d.stars)}${'☆'.repeat(4 - d.stars)} ${d.label}</span>`;
}
