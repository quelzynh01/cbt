import type { DieFace } from '../engine/types';

// Imagens dos dados (public/dice, geradas por tools/build_dice.py): dado preto = ataque, branco = defesa.

const FILES = ['atk_melee', 'atk_ranged', 'atk_crit', 'atk_blank', 'def_shield', 'def_crit', 'def_blank',
  'entry_melee-melee', 'entry_ranged-ranged', 'entry_melee-ranged', 'entry_crit-ranged', 'entry_crit-melee'];
const imgs = new Map<string, HTMLImageElement>();
const url = (id: string) => `${import.meta.env.BASE_URL}dice/${id}.webp`;

export function preloadDice(): Promise<void> {
  return Promise.all(FILES.map(id => new Promise<void>(res => {
    const im = new Image();
    im.onload = () => { imgs.set(id, im); res(); };
    im.onerror = () => res();
    im.src = url(id);
  }))).then(() => undefined);
}

/** Id da imagem de uma face. `black`: dado de ataque; senão, de defesa. */
export function dieId(f: DieFace, black: boolean): string {
  if (black) return f === 'crit' ? 'atk_crit' : f === 'melee' ? 'atk_melee' : f === 'ranged' ? 'atk_ranged' : 'atk_blank';
  return f === 'crit' ? 'def_crit' : f === 'shield' ? 'def_shield' : 'def_blank';
}

/** <img> da face (para o HUD e a tela de batalha). */
export function dieImg(f: DieFace, black: boolean): string {
  return `<img class="dface" src="${url(dieId(f, black))}" alt="${f}" draggable="false"/>`;
}

/** Placa da Entrada de Monstro (par de símbolos), se houver imagem. */
export function entryPlaque(pair: [DieFace, DieFace]): HTMLImageElement | null {
  const order = (f: DieFace) => (f === 'crit' ? 0 : f === 'melee' ? 1 : 2);
  const [a, b] = pair.slice().sort((x, y) => order(x) - order(y));
  return imgs.get(`entry_${a}-${b}`) ?? null;
}
