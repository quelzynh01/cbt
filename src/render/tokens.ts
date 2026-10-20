import type { Token } from '../engine/types';

// Imagens dos marcadores (public/tokens/<id>.webp, geradas por tools/build_tokens.py).

const IDS = ['fundo', 'cura', 'revigorante', 'turno', 'armadilha', 'bau1', 'bau2', 'bau3',
  'missao_azul', 'missao_vermelho', 'missao_verde', 'missao_laranja'];
const imgs = new Map<string, HTMLImageElement>();

export const TOKEN_COUNT = 12;

export function tokenUrl(id: string) { return `${import.meta.env.BASE_URL}tokens/${id}.webp`; }

/** Carrega as imagens (chame uma vez no início). */
export function preloadTokens(onEach?: () => void): Promise<void> {
  return Promise.all(IDS.map(id => new Promise<void>(resolve => {
    const img = new Image();
    img.onload = () => { imgs.set(id, img); onEach?.(); resolve(); };
    img.onerror = () => { onEach?.(); resolve(); };
    img.src = tokenUrl(id);
  }))).then(() => undefined);
}

/** Id da imagem da face do marcador (ou null se não houver imagem). */
export function tokenImageId(t: Pick<Token, 'type' | 'value' | 'color'>): string | null {
  if (t.type === 'bau') return `bau${Math.max(1, Math.min(3, t.value ?? 1))}`;
  if (t.type === 'missao') return IDS.includes(`missao_${t.color}`) ? `missao_${t.color}` : null;
  return t.type;
}

export function tokenImage(id: string | null): HTMLImageElement | null { return id ? imgs.get(id) ?? null : null; }

/** Desenha o marcador deitado no chão (centro em 0,0). `faceDown`: mostra o verso (?). */
export function drawTokenImage(ctx: CanvasRenderingContext2D, t: Pick<Token, 'type' | 'value' | 'color'>, faceDown: boolean, size: number, bob = 0, flat = false): boolean {
  const img = tokenImage(faceDown ? 'fundo' : tokenImageId(t));
  if (!img) return false;
  ctx.save();
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 4, size * 0.48, size * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  // disco levemente inclinado (perspectiva isométrica)
  // flat: deitado no chão; senão, levemente em pé
  ctx.translate(0, flat ? -size * 0.04 : -size * 0.18 + bob);
  ctx.scale(1, flat ? 0.5 : 0.62);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}
