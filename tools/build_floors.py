"""Piso dos mapas de Beyond the Grave a partir da arte dos tabuleiros no Livro de Campanha.

A imagem do mapa no livro traz ícones impressos (Monstros, marcadores "?", portais, portas, placas das Áreas
Iniciais): eles são apagados e o buraco é preenchido com um pedaço de piso vizinho parecido. Depois a imagem
ganha um pouco de cor/nitidez e é ampliada 2x.
Saída: public/floors/<id>.webp (uma imagem por mapa, alinhada à grade: largura = colunas x Espaço).
Uso: python tools/build_floors.py [id ...]   (sem ids: os mapas de FLOORS)
"""
import io
import os
import sys
import warnings

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
from scipy import ndimage as ndi

warnings.filterwarnings('ignore')
import pymupdf  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, 'ref', 'regras-beyond-the-grave.pdf')
OUT = os.path.join(ROOT, 'public', 'floors')

# id -> (página, xref da imagem do mapa)
FLOORS = {
    'mausoleu-profano': (27, 1611),
}


def icon_mask(rgb: np.ndarray) -> np.ndarray:
    """Pixels de ícones impressos: cores fortes (vermelho, verde, azul, roxo, laranja, amarelo) e pretos."""
    hsv = np.asarray(Image.fromarray(rgb).convert('HSV')).astype(np.float32)
    hue, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # cores fortes; roxos/azuis-violeta dos "?" e Fantasmas (o piso azul do centro tem matiz ~140 e pouca cor);
    # escuros: Necromantes e a moldura das placas de Lápide
    m = ((s > 100) & (v > 50)) | ((hue > 150) & (hue < 220) & (s > 52))
    # escuros (Necromantes, moldura das placas de Lápide): fecha a moldura e pega a placa inteira
    dark = ndi.binary_fill_holes(ndi.binary_closing(v < 88, iterations=5))
    m |= dark
    m = ndi.binary_closing(m, iterations=3)           # junta letras e contornos do ícone
    m = ndi.binary_fill_holes(m)
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.nonzero(sizes >= 40)[0])  # manchas pequenas são do próprio piso
    return ndi.binary_dilation(keep, iterations=4)


def fill(rgb: np.ndarray, mask: np.ndarray, T: int = 14) -> np.ndarray:
    """Preenche a máscara em blocos TxT, de fora para dentro: cada bloco recebe o pedaço de piso livre
    (até ~R px de distância) que melhor combina com o que já está em volta dele."""
    out = rgb.astype(np.float32).copy()
    H, W = mask.shape
    hole = mask.copy()
    R = 110
    while hole.any():
        dist = ndi.distance_transform_edt(hole)
        # blocos na borda do buraco (perto de pixels já bons)
        ys, xs = np.nonzero(hole & (dist <= T * 0.75))
        if not len(ys):
            ys, xs = np.nonzero(hole)
        done = np.zeros_like(hole)
        order = np.argsort(dist[ys, xs])
        for k in order[::max(1, len(order) // 400)]:
            y, x = ys[k], xs[k]
            if done[y, x] or not hole[y, x]:
                continue
            y0, x0 = max(0, y - T // 2), max(0, x - T // 2)
            y1, x1 = min(H, y0 + T), min(W, x0 + T)
            h, w = y1 - y0, x1 - x0
            need = hole[y0:y1, x0:x1]
            known = ~need
            best = None
            for _ in range(160):
                sy = int(np.clip(y0 + np.random.randint(-R, R + 1), 0, H - h))
                sx = int(np.clip(x0 + np.random.randint(-R, R + 1), 0, W - w))
                if hole[sy:sy + h, sx:sx + w].any() or mask[sy:sy + h, sx:sx + w].any():
                    continue
                src = out[sy:sy + h, sx:sx + w]
                cost = np.abs(src[known] - out[y0:y1, x0:x1][known]).mean() if known.any() else 0
                cost += 0.05 * (abs(sy - y0) + abs(sx - x0))
                if best is None or cost < best[0]:
                    best = (cost, sy, sx)
            if best is None:
                continue
            _, sy, sx = best
            tgt = out[y0:y1, x0:x1]
            tgt[need] = out[sy:sy + h, sx:sx + w][need]
            hole[y0:y1, x0:x1] = False
            done[y0:y1, x0:x1] = True
        if not done.any():  # nada achou fonte: média da vizinhança
            out[hole] = out[~hole].mean(0)
            break
    # suaviza as emendas dentro do que foi preenchido
    soft = ndi.gaussian_filter(out, sigma=(0.8, 0.8, 0))
    a = mask[..., None].astype(np.float32) * 0.5
    out = out * (1 - a) + soft * a
    return out.clip(0, 255).astype(np.uint8)


def build(mid: str):
    pg, xref = FLOORS[mid]
    doc = pymupdf.open(PDF)
    pix = pymupdf.Pixmap(doc, xref)
    if pix.n - pix.alpha > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    rgb = np.asarray(Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB'))
    np.random.seed(7)
    m = icon_mask(rgb)
    clean = Image.fromarray(fill(rgb, m))
    clean = ImageEnhance.Color(clean).enhance(1.45)
    clean = ImageEnhance.Contrast(clean).enhance(1.2)
    clean = ImageEnhance.Brightness(clean).enhance(0.95)
    big = clean.resize((clean.width * 2, clean.height * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    os.makedirs(OUT, exist_ok=True)
    big.save(os.path.join(OUT, f'{mid}.webp'), 'WEBP', quality=88, method=6)
    Image.fromarray((m * 255).astype(np.uint8)).save(os.path.join(OUT, f'_{mid}_mask.png')) if os.environ.get('DEBUG') else None
    print(mid, big.size, f'{m.mean() * 100:.1f}% apagado')


if __name__ == '__main__':
    for mid in (sys.argv[1:] or list(FLOORS)):
        build(mid)
