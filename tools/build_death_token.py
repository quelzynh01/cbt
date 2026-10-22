"""Marcador de Morte (Beyond the Grave): a caveira do medalhão de Extermínio, sem o número.

Os 10 medalhões public/bonus/skull<n>.webp têm a mesma caveira com números diferentes: a mediana deles limpa
quase tudo; a área dos números (embaixo à esquerda) é repintada com o fundo do disco.
Saída: public/tokens/missao_morte.webp (160x160).
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BONUS = os.path.join(ROOT, 'public', 'bonus')
OUT = os.path.join(ROOT, 'public', 'tokens', 'missao_morte.webp')


def main():
    a = np.stack([np.asarray(Image.open(os.path.join(BONUS, f'skull{i}.webp')).convert('RGBA')).astype(np.float32) for i in range(1, 11)])
    med = np.median(a, axis=0)
    n = med.shape[0]
    c = (n - 1) / 2
    yy, xx = np.mgrid[0:n, 0:n]
    r = np.hypot(xx - c, yy - c)
    # caveira: maior região clara (com os buracos dos olhos preenchidos); o resto do disco vira fundo liso
    from scipy import ndimage as ndi
    lum = med[..., :3].mean(-1)
    lab, cnt = ndi.label((lum > 95) & (r < 55))
    sizes = ndi.sum(np.ones_like(lum), lab, range(1, cnt + 1))
    skull = ndi.binary_fill_holes(lab == (1 + int(np.argmax(sizes))))
    skull &= ~((xx < 53) & (yy > 52))  # contorno de número grudado na caveira
    skull = ndi.binary_dilation(skull, iterations=2)
    zone = (r < 56.5) & ~skull
    # fundo do disco: degradê vertical (azul-acinzentado em cima, mais escuro embaixo) com um pouco de textura
    top, bot = np.array([49, 72, 90], np.float32), np.array([30, 37, 55], np.float32)
    k = np.clip((yy - 20) / 95, 0, 1)[..., None]
    bg = top * (1 - k) + bot * k + np.random.default_rng(7).normal(0, 2.0, (n, n, 1))
    ring = (xx < c) & (yy > c) & (r > 52)
    # costura suave entre a caveira e o fundo
    mix = np.asarray(Image.fromarray((zone * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)[..., None] / 255
    mix = np.where(((r < 56.5) & ~ring)[..., None], mix, 0)
    out = med.copy()
    # borda do anel embaixo à esquerda (onde ficam os números): copia a de cima, espelhada
    out[ring] = med[(2 * c - yy[ring]).round().astype(int), xx[ring]]
    out[..., :3] = out[..., :3] * (1 - mix) + bg * mix
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), ).resize((160, 160), Image.LANCZOS)
    img.save(OUT, 'WEBP', quality=92, method=6)
    print('ok', OUT)


if __name__ == '__main__':
    main()
