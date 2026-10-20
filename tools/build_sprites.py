"""Gera os sprites (4 direções) a partir de ref/modelos/<nome>.jpg (fundo verde, chroma key).

Cada imagem tem a pose de FRENTE à esquerda e a de COSTAS à direita:
  frente -> sw (frente-esquerda); espelhada -> se
  costas -> nw (costas-esquerda); espelhada -> ne

TAMANHO: as poses têm armas levantadas, braços esticados, pulos… Então a escala NÃO usa a caixa da imagem:
mede o CORPO (do topo da cabeça até os pés, ignorando partes finas como lanças e espadas) e deixa todos os corpos
com a mesma altura × o tamanho do personagem (SIZE: o Orc é mais alto e largo, o Goblin e o anão são menores).
As armas continuam na imagem (saindo do corpo), e a âncora no chão é a linha dos pés — não a ponta de uma arma.

Uso:  python tools/build_sprites.py [--lineup saida.png]   (precisa de Pillow, numpy e scipy)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'modelos')
OUT = os.path.join(ROOT, 'public', 'sprites')

# arquivo de referência -> id no jogo
NAMES = {
    'vapor': 'vapor', 'spike': 'espetado', 'hobsbawm': 'hobsbawm', 'arqueira': 'goblin', 'orc': 'orc',
    'diva': 'diva', 'greensleeves': 'casacaverde', 'grom': 'grom', 'johan': 'johan', 'kanga': 'kanga',
    'maya': 'maya', 'scarlet': 'escarlate', 'seth': 'seth', 'zazu': 'zazu',
    # Monstros
    'orc-captain': 'capitao_orc', 'hammer-beastman': 'feral_martelador', 'spear-beastman': 'feral_lanceiro',
    'sister-of-pain': 'irma_dor', 'sister-of-pleasure': 'irma_prazer',
    'schmetterling': 'troll', 'bullroarer': 'minotauro', 'lord-fang': 'lorde_presas',
}
# altura do corpo relativa a um Herói comum (1.0)
SIZE = {
    'orc': 1.22, 'goblin': 0.86, 'espetado': 0.9, 'diva': 1.0, 'grom': 1.04, 'johan': 1.0, 'kanga': 1.0,
    'casacaverde': 1.0, 'hobsbawm': 1.02, 'maya': 1.0, 'escarlate': 0.98, 'seth': 1.0, 'zazu': 1.0, 'vapor': 1.0,
    # Monstros: Ferais são grandes; Troll e Minotauro, enormes
    'capitao_orc': 1.28, 'feral_martelador': 1.32, 'feral_lanceiro': 1.3, 'irma_dor': 1.0, 'irma_prazer': 1.0,
    'troll': 1.62, 'minotauro': 1.62, 'lorde_presas': 1.18,
}
# Ajustes manuais (fração da altura da caixa recortada) quando a medição automática erra:
# 'top': topo da cabeça, 'feet': linha dos pés. Chave: (id, 'front'|'back').
OVERRIDE = {
    # Grom pula com a espada acima da cabeça: o topo do corpo é o cabelo, não a lâmina
    ('grom', 'front'): {'top': 0.17},
    ('grom', 'back'): {'top': 0.15},
}

# Enquadramento do rosto nos retratos (pose de frente 'se'): centro x, centro y e lado do quadrado,
# em fração da largura/altura do PNG. A pose 'sw' é a espelhada (x -> 1 - x).
FACE = {
    'vapor': (0.53, 0.35, 0.38), 'espetado': (0.57, 0.37, 0.40), 'hobsbawm': (0.58, 0.30, 0.38),
    'goblin': (0.62, 0.37, 0.45), 'orc': (0.62, 0.35, 0.36), 'diva': (0.58, 0.30, 0.38),
    'casacaverde': (0.53, 0.30, 0.38), 'grom': (0.60, 0.37, 0.38), 'johan': (0.68, 0.30, 0.38),
    'kanga': (0.48, 0.47, 0.35), 'maya': (0.63, 0.37, 0.36), 'escarlate': (0.40, 0.33, 0.38),
    'seth': (0.47, 0.25, 0.35), 'zazu': (0.23, 0.33, 0.42), 'capitao_orc': (0.54, 0.37, 0.38),
    'feral_martelador': (0.62, 0.33, 0.38), 'feral_lanceiro': (0.60, 0.38, 0.35), 'irma_dor': (0.63, 0.31, 0.32),
    'irma_prazer': (0.64, 0.30, 0.32), 'troll': (0.62, 0.48, 0.35), 'minotauro': (0.55, 0.30, 0.40),
    'lorde_presas': (0.62, 0.35, 0.35),
}

BODY_PX = 400  # altura do corpo (cabeça→pés) de um Herói de tamanho 1.0 no PNG final


def key_alpha(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gx = g - np.maximum(r, b)  # "verdice"
    return np.clip(1.0 - (gx - 40) / 60.0, 0, 1), gx


def cut(img, x0, x1):
    """Recorta a pose (sem fundo), justa na caixa dos pixels visíveis."""
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
    rgb = a[..., :3].copy()
    lim = np.maximum(rgb[..., 0], rgb[..., 2])
    spill = (alpha < 0.999) | (gx > 10)
    rgb[..., 1] = np.where(spill, np.minimum(rgb[..., 1], lim + 6), rgb[..., 1])  # tira o reflexo verde
    ys, xs = np.nonzero(alpha > 0.05)
    rgba = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA').crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def split_x(img):
    a = np.asarray(img).astype(np.float32)
    alpha, _ = key_alpha(a)
    col = (alpha > 0.5).sum(0)
    lo, hi = int(img.width * 0.4), int(img.width * 0.6)
    return lo + int(np.argmin(col[lo:hi]))


def runs(mask_row):
    """Maior sequência contínua de pixels visíveis na linha."""
    p = np.concatenate([[0], mask_row.astype(np.int8), [0]])
    d = np.diff(p)
    st, en = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
    return int((en - st).max()) if len(st) else 0


def measure(im):
    """Topo da cabeça, pés e centro dos pés (em pixels da pose recortada), ignorando partes finas (armas)."""
    f = 4  # mede numa versão reduzida (rápido) e volta para a escala da pose
    small = im.resize((max(1, im.width // f), max(1, im.height // f)))
    al = np.asarray(small)[..., 3] > 128
    # tira as partes finas: abertura morfológica apaga lanças, cajados e lâminas finas
    k = max(3, small.width // 40)
    body = ndi.binary_opening(al, structure=np.ones((k, k)))
    lab, n = ndi.label(body)
    if n:
        sizes = ndi.sum(body, lab, range(1, n + 1))
        body = lab == (int(np.argmax(sizes)) + 1)  # o maior bloco é o corpo
    rows = np.array([runs(r) for r in body])
    W = np.median(rows[rows > 0]) if (rows > 0).any() else 1
    ok = rows >= 0.25 * W
    ys = np.nonzero(ok)[0]
    top = int(ys.min())
    feet = int(np.nonzero(body.any(1))[0].max())  # pés: fundo do corpo (pernas finas contam; lanças já saíram)
    # centro dos pés: média das colunas do corpo nas últimas linhas
    band = body[max(top, feet - max(6, (feet - top) // 14)):feet + 1]
    fx = float(np.nonzero(band.any(0))[0].mean()) if band.any() else small.width / 2
    return top * f, feet * f + f - 1, fx * f


def build(lineup_path=None):
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    manifest = {}
    lineup = []
    for fname, cid in NAMES.items():
        path = os.path.join(SRC, fname + '.jpg')
        if not os.path.exists(path):
            print('faltando', path)
            continue
        img = Image.open(path).convert('RGB')
        sx = split_x(img)
        entry = {'dirs': ['se', 'sw', 'nw', 'ne'], 'ext': 'webp', 'feet': {}, 'top': {}}
        for side, (x0, x1) in (('front', (0, sx)), ('back', (sx, img.width))):
            pose = cut(img, x0, x1)
            top, feet, fx = measure(pose)
            ov = OVERRIDE.get((cid, side), {})
            if 'top' in ov: top = int(ov['top'] * pose.height)
            if 'feet' in ov: feet = int(ov['feet'] * pose.height)
            scale = BODY_PX * SIZE.get(cid, 1.0) / max(1, feet - top)
            im = pose.resize((max(1, round(pose.width * scale)), max(1, round(pose.height * scale))), Image.LANCZOS)
            feet_s, fx_s = feet * scale, fx * scale
            # centraliza os pés na horizontal (a âncora do jogo é o meio da imagem)
            half = int(max(fx_s, im.width - fx_s)) + 2
            canvas = Image.new('RGBA', (2 * half, im.height), (0, 0, 0, 0))
            canvas.paste(im, (int(round(half - fx_s)), 0))
            dirs = ('sw', 'se') if side == 'front' else ('nw', 'ne')
            # WebP com transparência: ~5x menor que PNG, mesma qualidade visual
            canvas.save(os.path.join(OUT, f'{cid}_{dirs[0]}.webp'), 'WEBP', quality=90, method=6)
            canvas.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(OUT, f'{cid}_{dirs[1]}.webp'), 'WEBP', quality=90, method=6)
            for d in dirs:
                entry['feet'][d] = round(feet_s / canvas.height, 4)
                entry['top'][d] = round(top * scale / canvas.height, 4)
            lineup.append((cid, side, canvas, feet_s, top * scale))
            print(f'{cid:12s} {side:5s} caixa {pose.size} corpo {top}->{feet} escala {scale:.3f} png {canvas.size}')
        if cid in FACE:
            fx_, fy_, fs_ = FACE[cid]
            entry['face'] = {'se': [fx_, fy_, fs_], 'sw': [round(1 - fx_, 4), fy_, fs_]}
        manifest[cid] = entry
    json.dump(manifest, open(man_path, 'w', encoding='utf-8'), indent=1)
    if lineup_path:
        # todos lado a lado sobre a mesma linha do chão, com a altura do corpo marcada
        sc = 0.35
        ground = int(max(f for *_, f, _ in lineup) * sc) + 20
        up = int(max(c.height - f for _, _, c, f, _ in lineup) * sc) + 10
        W = int(sum(c.width * sc + 10 for _, s, c, _, _ in lineup if s == 'front'))
        sheet = Image.new('RGBA', (W, ground + up + 30), (60, 90, 50, 255))
        dr = ImageDraw.Draw(sheet)
        x = 5
        for cid, side, c, f, t in lineup:
            if side != 'front':
                continue
            cc = c.resize((int(c.width * sc), int(c.height * sc)))
            y = int(ground - f * sc)
            sheet.alpha_composite(cc, (x, y))
            dr.line([(x, int(ground - (f - t) * sc)), (x + cc.width, int(ground - (f - t) * sc))], fill=(255, 0, 255), width=2)
            dr.text((x + 4, ground + 6), cid, fill=(255, 255, 255))
            x += cc.width + 10
        dr.line([(0, ground), (W, ground)], fill=(255, 255, 0), width=2)
        sheet.save(lineup_path)


if __name__ == '__main__':
    out = sys.argv[sys.argv.index('--lineup') + 1] if '--lineup' in sys.argv else None
    build(out)
