"""Recorta as faces dos dados e as placas de Entrada de Monstro de ref/dados/*.jpg (fundo verde)
e salva em public/dice/<id>.webp."""
import os
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'dados')
OUT = os.path.join(ROOT, 'public', 'dice')
# dado preto (ataque), dado branco (defesa) e placas das Entradas de Monstro
FACES = {
    'espada': 'atk_melee', 'arca': 'atk_ranged', 'critico-ataque': 'atk_crit',
    'escudo': 'def_shield', 'crito-defesa': 'def_crit', 'branco': 'def_blank',
    'espada-espada': 'entry_melee-melee', 'arco-arco': 'entry_ranged-ranged',
    'espada-arco': 'entry_melee-ranged', 'arco-critico': 'entry_crit-ranged',
}


def key(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gx = g - np.maximum(r, b)
    alpha = np.clip(1.0 - (gx - 40) / 60.0, 0, 1)
    lab, _ = ndi.label(alpha < 0.5)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    outside = np.isin(lab, edge[edge > 0])
    near = ndi.binary_dilation(outside, iterations=3)
    alpha = np.where(outside, 0.0, np.where(near, alpha, 1.0))
    a[..., 1] = np.where(near, np.minimum(g, np.maximum(r, b) + 6), g)
    ys, xs = np.nonzero(alpha > 0.1)
    im = Image.fromarray(np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def save(im, tid, size):
    k = size / max(im.size)
    im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS).save(
        os.path.join(OUT, tid + '.webp'), 'WEBP', quality=90, method=6)


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {}
    for fname, tid in FACES.items():
        out[tid] = key(os.path.join(SRC, fname + '.jpg'))
    # dado preto sem símbolo: o dado branco invertido (mesmo formato)
    w = out['def_blank']
    rgb = ImageOps.invert(w.convert('RGB'))
    rgb.putalpha(w.getchannel('A'))
    out['atk_blank'] = rgb
    # placa ✷ + ⚔: a placa ✷ + ➶ com a pedra de baixo da placa ⚔ + ➶ (que tem ⚔ embaixo)
    base = out['entry_crit-ranged'].copy()
    src = out['entry_melee-ranged'].resize(base.size, Image.LANCZOS)
    h = base.height
    cut = int(h * 0.5)
    bottom = src.crop((0, cut, base.width, h))
    mask = bottom.getchannel('A')
    base.paste(bottom, (0, cut), mask)
    out['entry_crit-melee'] = base
    for tid, im in out.items():
        save(im, tid, 128 if tid.startswith(('atk', 'def')) else 200)
        print(tid)


if __name__ == '__main__':
    main()
