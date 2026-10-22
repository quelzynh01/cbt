"""Arte dos personagens de Beyond the Grave, tirada do Livro de Campanha (ref/regras-beyond-the-grave.pdf).

O livro só tem a pose de frente de cada um: ela vira as 2 direções do sprite (direita e esquerda, espelhada). Saídas:
  public/sprites/<id>_{se,sw}.webp + manifest.json (entradas 'lazy': carregam só quando entram no mapa)
  public/portraits/<id>.webp (retrato quadrado, para menus e cartas)
"""
import io
import json
import os
import warnings
from PIL import Image

warnings.filterwarnings('ignore')
import pymupdf  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(ROOT, 'ref', 'regras-beyond-the-grave.pdf')
SPR = os.path.join(ROOT, 'public', 'sprites')
POR = os.path.join(ROOT, 'public', 'portraits')

# id -> (xref da imagem, xref da máscara, lado para onde olha 'L'/'R', altura do corpo em px, centro do rosto x, y)
ART = {
    'chaz': (1663, 1662, 'L', 420, 0.42, 0.24),
    'darryn': (1667, 1666, 'L', 420, 0.40, 0.26),
    'esqueleto': (1746, 1745, 'L', 390, 0.42, 0.36),
    'zumbi_retalhador': (1738, 1737, 'R', 400, 0.40, 0.28),
    'zumbi_arremessador': (1742, 1741, 'L', 380, 0.40, 0.25),
    'fantasma': (1815, 1814, 'L', 400, 0.48, 0.30),
    'necromante': (1819, 1818, 'L', 450, 0.38, 0.30),
    'frank': (1823, 1822, 'R', 470, 0.50, 0.24),
    'ivan': (1827, 1826, 'R', 420, 0.40, 0.24),
    'dr_spider': (1890, 1889, 'L', 440, 0.48, 0.20),
    'rei_pavoroso': (1894, 1893, 'L', 560, 0.36, 0.26),
}


def load(doc, x, mask):
    pix = pymupdf.Pixmap(doc, x)
    if mask:
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, mask))
    if pix.n - pix.alpha > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGBA')
    return im.crop(im.getbbox() or (0, 0, im.width, im.height))


def main():
    doc = pymupdf.open(PDF)
    # xrefs das máscaras: a imagem guarda a sua (smask)
    smask = {}
    for pg in doc:
        for img in pg.get_images(full=True):
            smask[img[0]] = img[1]
    man_path = os.path.join(SPR, 'manifest.json')
    man = json.load(open(man_path, encoding='utf-8'))
    for cid, (x, _m, side, body, fx, fy) in ART.items():
        im = load(doc, x, smask.get(x, 0))
        pad = 0.04
        h = int(body / (1 - 2 * pad))
        w = max(1, round(im.width * h / im.height))
        big = im.resize((w, h), Image.LANCZOS)
        canvas = Image.new('RGBA', (w, int(h * (1 + 2 * pad))), (0, 0, 0, 0))
        canvas.paste(big, (0, int(h * pad)), big)
        right = canvas if side == 'R' else canvas.transpose(Image.FLIP_LEFT_RIGHT)
        left = right.transpose(Image.FLIP_LEFT_RIGHT)
        for d, img in (('se', right), ('sw', left)):  # só de frente: o jogo não usa as poses de costas
            img.save(os.path.join(SPR, f'{cid}_{d}.webp'), 'WEBP', quality=90, method=6)
        top = pad / (1 + 2 * pad)
        feet = 1 - top
        cxr = fx if side == 'R' else 1 - fx
        man[cid] = {
            'dirs': ['se', 'sw'], 'ext': 'webp', 'lazy': True,
            'feet': {d: round(feet, 4) for d in ('se', 'sw')},
            'top': {d: round(top, 4) for d in ('se', 'sw')},
            'face': {'se': [round(cxr, 3), round(top + fy * (feet - top), 3), 0.36], 'sw': [round(1 - cxr, 3), round(top + fy * (feet - top), 3), 0.36]},
        }
        # retrato: quadrado em volta do rosto
        side_px = int(min(im.width, im.height * 0.62))
        cx = int(fx * im.width)
        cy = int(fy * im.height)
        x0 = max(0, min(im.width - side_px, cx - side_px // 2))
        y0 = max(0, min(im.height - side_px, cy - int(side_px * 0.42)))
        por = im.crop((x0, y0, x0 + side_px, y0 + side_px)).resize((192, 192), Image.LANCZOS)
        if side == 'L':
            por = por.transpose(Image.FLIP_LEFT_RIGHT)
        por.save(os.path.join(POR, f'{cid}.webp'), 'WEBP', quality=90, method=6)
        print(cid, im.size, '->', canvas.size)
    json.dump(man, open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()


# ------------------------------------------------------------------ ilustração de cada mapa (public/maps/<id>.webp)
# Substituída pelas ilustrações em ref/maps (tools/build_maps.py); só roda com MAPS=1.
MAP_PAGES = {  # id -> (página, retângulo do mapa na página)
    'quartel-assombrado': (11, (67, 81, 545, 400)), 'abatedouro': (13, (81, 77, 400, 715)), 'criptas': (15, (67, 51, 545, 529)),
    'ponte-dos-condenados': (17, (67, 51, 545, 529)), 'o-cemiterio': (19, (45, 51, 544, 529)), 'santuario-negro': (21, (67, 51, 545, 529)),
    'moinho-das-almas': (23, (23, 35, 589, 602)), 'laboratorio-secreto': (25, (67, 51, 545, 529)), 'mausoleu-profano': (27, (67, 77, 545, 715)),
}


def maps():
    doc = pymupdf.open(PDF)
    out = os.path.join(ROOT, 'public', 'maps')
    for mid, (pg, rect) in MAP_PAGES.items():
        pix = doc[pg - 1].get_pixmap(matrix=pymupdf.Matrix(2.2, 2.2), clip=pymupdf.Rect(*rect))
        im = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
        # como as outras ilustrações: 3x4 em pé (os mapas deitados ficam centralizados num fundo escuro)
        W, H = 540, 720
        bg = Image.new('RGB', (W, H), (24, 18, 30))
        im.thumbnail((W, H), Image.LANCZOS)
        bg.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
        bg.save(os.path.join(out, f'{mid}.webp'), 'WEBP', quality=86, method=6)
        print('mapa', mid)


if __name__ == '__main__' and os.environ.get('MAPS'):
    maps()
