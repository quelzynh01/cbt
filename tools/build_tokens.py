"""Recorta os marcadores de ref/tokens/*.jpg (fundo verde) e salva em public/tokens/<id>.webp (256 px)."""
import os
import numpy as np
from scipy import ndimage as ndi
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'tokens')
OUT = os.path.join(ROOT, 'public', 'tokens')
# arquivo -> id usado pelo jogo
NAMES = {
    'fundo_tokens': 'fundo', 'healing': 'cura', 'refresh': 'revigorante', 'turn': 'turno', 'trap': 'armadilha',
    'gold1': 'bau1', 'gold2': 'bau2', 'gold3': 'bau3',
    'azul': 'missao_azul', 'vermelho': 'missao_vermelho', 'verde': 'missao_verde', 'laranja': 'missao_laranja',
    'lapide': 'lapide',  # Lápide de Beyond the Grave (em pé no tabuleiro)
}
SIZE = 256


def main():
    os.makedirs(OUT, exist_ok=True)
    for fname, tid in NAMES.items():
        a = np.asarray(Image.open(os.path.join(SRC, fname + '.jpg')).convert('RGB')).astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        gx = g - np.maximum(r, b)
        alpha = np.clip(1.0 - (gx - 40) / 60.0, 0, 1)
        # só é fundo o verde ligado à borda (a Poção Revigorante é verde por dentro)
        bg = alpha < 0.5
        lab, _ = ndi.label(bg)
        edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
        outside = np.isin(lab, edge[edge > 0])
        near = ndi.binary_dilation(outside, iterations=3)
        alpha = np.where(near, alpha, 1.0)
        alpha = np.where(outside, 0.0, alpha)
        rgb = a.copy()
        rgb[..., 1] = np.where((alpha < 0.999) & near, np.minimum(g, np.maximum(r, b) + 6), g)  # tira o reflexo verde
        ys, xs = np.nonzero(alpha > 0.1)
        im = Image.fromarray(np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
        im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        side = max(im.size)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, tid + '.webp'), 'WEBP', quality=90, method=6)
        print(tid)


if __name__ == '__main__':
    main()
