"""Recorta os medalhões 1..10 das folhas de ref/dados/+*.jpg (fundo verde: Defesa, Vida, Rerrolagem, dados de ataque,
moeda, caveira de Extermínio e movimento)
e salva em public/bonus/<tipo><n>.webp."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'dados')
OUT = os.path.join(ROOT, 'public', 'bonus')
SHEETS = {'+defesas': 'def', '+vidas': 'hp', '+re-rolls': 'rr', '+ataque-melee': 'melee', '+ataque-ranged': 'ranged',
          '+custo-ou-premio': 'coin', '+morte-sem-retaliacao': 'skull', '+movimento': 'move'}
SIZE = 128


def main():
    os.makedirs(OUT, exist_ok=True)
    for fname, kind in SHEETS.items():
        a = np.asarray(Image.open(os.path.join(SRC, fname + '.jpg')).convert('RGB')).astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        gx = g - np.maximum(r, b)
        alpha = np.clip(1.0 - (gx - 40) / 60.0, 0, 1)
        solid = alpha > 0.5
        # 2 linhas de 5 medalhões: separa as linhas pelo meio e divide cada linha em 5 partes iguais
        mid = a.shape[0] // 2
        boxes = []
        for y0, y1 in ((0, mid), (mid, a.shape[0])):
            band = solid[y0:y1]
            ys, xs = np.nonzero(band)
            bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min() + y0, ys.max() + 1 + y0
            w = (bx1 - bx0) / 5
            for k in range(5):
                cx0, cx1 = int(bx0 + k * w), int(bx0 + (k + 1) * w)
                cell = solid[by0:by1, cx0:cx1]
                cy, cxs = np.nonzero(cell)
                boxes.append((slice(by0 + cy.min(), by0 + cy.max() + 1), slice(cx0 + cxs.min(), cx0 + cxs.max() + 1)))
        a[..., 1] = np.where(alpha < 0.999, np.minimum(g, np.maximum(r, b) + 6), g)
        rgba = Image.fromarray(np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
        for i, s in enumerate(boxes):
            im = rgba.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
            side = max(im.size)
            sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
            sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{kind}{i + 1}.webp'), 'WEBP', quality=90, method=6)
        print(kind, len(boxes))


if __name__ == '__main__':
    main()
