"""Gera os sprites (4 direções) a partir de ref/modelos/<nome>.jpg com fundo verde (chroma key).

Cada imagem tem a pose de FRENTE à esquerda e a de COSTAS à direita.
  frente  -> sw (frente-esquerda);  espelhada -> se
  costas  -> nw (costas-esquerda);  espelhada -> ne

Uso:  python tools/chroma_sprites.py            (precisa de Pillow, numpy e scipy)
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'modelos')
OUT = os.path.join(ROOT, 'public', 'sprites')
# nome do arquivo de referência -> id do personagem no jogo
NAMES = {'vapor': 'vapor', 'spike': 'espetado', 'hobsbawm': 'hobsbawm', 'arqueira': 'goblin', 'orc': 'orc'}
TARGET_H = 400  # altura final do PNG


def key_alpha(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # "verdice": quanto o verde passa do maior entre vermelho e azul
    gx = g - np.maximum(r, b)
    alpha = np.clip(1.0 - (gx - 40) / 60.0, 0, 1)  # gx<=40 opaco, gx>=100 transparente
    return alpha, gx


def cut(img, x0, x1):
    a = np.asarray(img.crop((x0, 0, x1, img.height))).astype(np.float32)
    alpha, gx = key_alpha(a)
    solid = alpha > 0.5
    lab, n = ndi.label(solid)
    if n == 0:
        return None
    sizes = ndi.sum(solid, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 0.004 * sizes.max()])
    keep = ndi.binary_dilation(keep, iterations=2)
    alpha = alpha * keep
    # despill: tira o reflexo verde das bordas
    rgb = a[..., :3].copy()
    lim = np.maximum(rgb[..., 0], rgb[..., 2])
    spill = (alpha < 0.999) | (gx > 10)
    rgb[..., 1] = np.where(spill, np.minimum(rgb[..., 1], lim + 6), rgb[..., 1])
    ys, xs = np.nonzero(alpha > 0.05)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    # âncora dos pés: centro dos pixels opacos nas últimas linhas
    foot = alpha[by1 - int((by1 - by0) * 0.06):by1] > 0.5
    fx = int(np.nonzero(foot.any(0))[0].mean())
    half = max(fx - bx0, bx1 - fx) + 4
    rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    full = Image.fromarray(rgba, 'RGBA')
    out = Image.new('RGBA', (2 * half, by1 - by0 + 4), (0, 0, 0, 0))
    out.paste(full.crop((max(fx - half, 0), by0, min(fx + half, full.width), by1)), (max(0, half - fx), 0))
    return out


def split_x(img):
    """Coluna perto do meio com menos pixels de personagem (separa frente/costas)."""
    a = np.asarray(img).astype(np.float32)
    alpha, _ = key_alpha(a)
    col = (alpha > 0.5).sum(0)
    w = img.width
    lo, hi = int(w * 0.4), int(w * 0.6)
    return lo + int(np.argmin(col[lo:hi]))


def main():
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else {}
    for fname, cid in NAMES.items():
        path = os.path.join(SRC, fname + '.jpg')
        if not os.path.exists(path):
            print('faltando', path)
            continue
        img = Image.open(path).convert('RGB')
        sx = split_x(img)
        front, back = cut(img, 0, sx), cut(img, sx, img.width)
        # todos os personagens e poses com a MESMA altura (do topo da cabeça aos pés)
        def fit(im):
            return im.resize((round(im.width * TARGET_H / im.height), TARGET_H), Image.LANCZOS)
        front, back = fit(front), fit(back)
        poses = {'sw': front, 'se': front.transpose(Image.FLIP_LEFT_RIGHT),
                 'nw': back, 'ne': back.transpose(Image.FLIP_LEFT_RIGHT)}
        for d, im in poses.items():
            im.save(os.path.join(OUT, f'{cid}_{d}.png'), optimize=True)
        manifest[cid] = ['se', 'sw', 'nw', 'ne']
        print(cid, 'corte em x =', sx, 'tamanho', front.size, back.size)
    json.dump(manifest, open(man_path, 'w', encoding='utf-8'), indent=2)


if __name__ == '__main__':
    sys.exit(main())
