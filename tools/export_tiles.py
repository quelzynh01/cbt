"""Exporta os tabuleiros (3x3 Espaços) usados nos mapas de Beyond the Grave, recortados do Livro de Campanha.

Saída em ref/tiles/:
  originais/<código>.png   recorte do livro, como está (com os ícones impressos)
  limpos/<código>.png      mesmo recorte com os ícones apagados (tools/build_floors.py)
  ampliados/               pasta vazia: coloque aqui as versões melhoradas (mesmo nome, qualquer tamanho quadrado)
Cada código sai do mapa onde ele tem menos ícones impressos por cima. Os tabuleiros girados no mapa voltam à posição padrão
não é possível saber pelo livro, então o recorte sai como aparece no mapa indicado em mapas.txt.
"""
import io
import json
import os
import sys
import warnings

import numpy as np
from PIL import Image

warnings.filterwarnings('ignore')
import pymupdf  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_floors import fill, icon_mask  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, 'ref', 'regras-beyond-the-grave.pdf')
OUT = os.path.join(ROOT, 'ref', 'tiles')
# mapa -> (página, retângulo da imagem do mapa, colunas, linhas, tabuleiros {código: (c, r)})
MAPS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '_btg_boards.json'), encoding='utf-8'))


def map_image(doc, pg, rect):
    page = doc[pg - 1]
    for im in page.get_images(full=True):
        for r in page.get_image_rects(im[0]):
            if abs(r.x0 - rect[0]) < 3 and abs(r.y0 - rect[1]) < 3:
                pix = pymupdf.Pixmap(doc, im[0])
                if pix.n - pix.alpha > 3:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                return np.asarray(Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB'))
    # sem imagem única: renderiza a página
    pix = page.get_pixmap(matrix=pymupdf.Matrix(4, 4), clip=pymupdf.Rect(*rect))
    return np.asarray(Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB'))


def main():
    doc = pymupdf.open(PDF)
    best = {}
    for mid, m in MAPS.items():
        img = map_image(doc, m['page'], m['rect'])
        H, W = img.shape[:2]
        cw, ch = W / m['cols'], H / m['rows']
        np.random.seed(7)
        mask = icon_mask(img)
        clean = fill(img, mask)
        for code, (c, r) in m['boards'].items():
            box = (round(c * cw), round(r * ch), round((c + 3) * cw), round((r + 3) * ch))
            raw = img[box[1]:box[3], box[0]:box[2]]
            if abs(raw.shape[0] - raw.shape[1]) > 3:  # imagem do mapa fora da grade (Criptas): ignora
                continue
            # o mapa onde o tabuleiro tem menos ícones impressos por cima
            cover = mask[box[1]:box[3], box[0]:box[2]].mean()
            if code not in best or cover < best[code][0]:
                best[code] = (cover, raw, clean[box[1]:box[3], box[0]:box[2]], mid)
    for d in ('originais', 'limpos', 'ampliados'):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    lines = []
    for code in sorted(best, key=lambda k: (int(k[:-1]), k[-1])):
        _, raw, clean, mid = best[code]
        Image.fromarray(raw).save(os.path.join(OUT, 'originais', f'{code}.png'))
        Image.fromarray(clean).save(os.path.join(OUT, 'limpos', f'{code}.png'))
        lines.append(f'{code}: {raw.shape[1]}x{raw.shape[0]} px, recortado de {mid}')
        print(lines[-1])
    open(os.path.join(OUT, 'mapas.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
