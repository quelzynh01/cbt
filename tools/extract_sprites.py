"""Recorta as 4 poses de cada folha de personagem (fundo de papel + bloco de grama removidos)."""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = sys.argv[1]
OUT = sys.argv[2]
PREVIEW = sys.argv[3]
os.makedirs(OUT, exist_ok=True)

SHEETS = {'vapor': '11.png', 'orc': '12.png', 'goblin': '13.png'}
# pose: (caixa x0,y0,x1,y1), linha dos pés, losango do topo do bloco (esq, fundo, dir, frente)
POSES = {
    'se': ((30, 170, 455, 625), 612, [(46, 588), (225, 522), (388, 585), (225, 658)]),
    'sw': ((370, 40, 770, 405), 398, [(378, 374), (520, 322), (688, 362), (535, 428)]),
    'nw': ((650, 250, 1015, 625), 614, [(692, 586), (850, 532), (1003, 580), (845, 642)]),
    'ne': ((985, 130, 1345, 500), 492, [(1028, 466), (1180, 418), (1333, 460), (1180, 522)]),
}


def poly_mask(shape, pts, ox, oy):
    from PIL import ImageDraw
    m = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).polygon([(x - ox, y - oy) for x, y in pts], fill=255)
    return np.array(m) > 0


EXCLUDE = {'se': [(350, 170, 460, 345)], 'nw': [(650, 250, 702, 425)]}

previews = []
for cid, fname in SHEETS.items():
    im = Image.open(os.path.join(SRC, fname)).convert('RGB')
    for d, (box, feet, rh) in POSES.items():
        x0, y0, x1, y1 = box
        a = np.array(im.crop(box)).astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        mx, mn = a.max(-1), a.min(-1)
        sat = (mx - mn) / (mx + 1e-3)
        H, W = lum.shape
        fy = feet - y0
        border = np.zeros(lum.shape, bool)
        border[0, :] = border[-1, :] = True
        border[:, 0] = border[:, -1] = True
        # 1) papel: claro e pouco saturado, ligado à borda
        # papel: claro e pouco saturado, ligado à borda. Barreiras: contorno escuro ou linhas lilás GROSSAS
        # (o contorno do cabelo branco do Vapor); as linhas finas da grade de fundo não barram.
        bluish = ((b - r) >= 6) & (lum < 215)
        thick = ndi.binary_opening(bluish, structure=np.ones((3, 3)))
        barrier = (lum < 110) | ndi.binary_dilation(thick, iterations=1)
        paper = (lum > 140) & (sat < 0.2) & ~barrier
        labp, nump = ndi.label(paper)
        ids = np.unique(labp[border & paper]); ids = ids[ids > 0]
        bg = np.isin(labp, ids)
        if cid == 'goblin':  # papel preso dentro do arco
            for i in range(1, nump + 1):
                comp = labp == i
                if comp.sum() > 150 and lum[comp].mean() > 222 and sat[comp].mean() < 0.09:
                    bg |= comp
        for (ex0, ey0, ex1, ey1) in EXCLUDE.get(d, []):
            bg[max(0, ey0 - y0):max(0, ey1 - y0), max(0, ex0 - x0):max(0, ex1 - x0)] = True
        # 2) bloco de grama: só dentro do losango (dilatado) e abaixo dos pés
        rhm = ndi.binary_dilation(poly_mask(lum.shape, rh, x0, y0), iterations=10)
        zone = rhm.copy(); zone[fy:, :] = True
        plat = (lum > 88) & zone
        labq, _ = ndi.label(plat)
        seeds = np.zeros(lum.shape, bool)
        seeds[fy:, :] = True
        for (px, py) in rh[:3]:
            cx, cy = px - x0, py - y0
            seeds[max(0, cy - 8):cy + 8, max(0, cx - 18):cx + 18] = True
        ids = np.unique(labq[seeds & plat]); ids = ids[ids > 0]
        bg |= np.isin(labq, ids)
        fg = ~bg
        fg[fy:, :] = False
        # cabelo branco do Vapor: preenche o casco convexo do contorno lilás do cabelo (topo do personagem)
        if cid == 'vapor' and d == 'sw':
            from scipy.spatial import ConvexHull
            from PIL import ImageDraw
            ys_, xs_ = np.nonzero(fg)
            top = ys_.min(); hgt = fy - top
            hy, hx = np.nonzero(thick & (np.arange(H)[:, None] < top + hgt * 0.38))
            if len(hx) > 10:
                pts = np.stack([hx, hy], 1)
                hull = pts[ConvexHull(pts).vertices]
                hm = Image.new('L', (W, H), 0)
                ImageDraw.Draw(hm).polygon([tuple(map(float, q)) for q in hull], fill=255)
                hm = np.array(hm) > 0
                fg |= hm & (lum > 120)
        # grama do bloco vizinho (pose 'se' do orc)
        if d == 'se':
            gx0 = 378 - x0
            region = np.zeros_like(fg); region[:, gx0:] = True
            fg &= ~(region & (g > r * 1.0) & (g > b * 1.05) & (lum > 70))
        # fiapos de grama clara perto dos pés
        grass = (g > r * 1.05) & (g > b * 1.2) & (lum > 115) & rhm
        fg &= ~grass
        # contornos escuros do bloco que sobraram dentro do losango
        fg &= ~(rhm & (lum < 88) & ~ndi.binary_dilation(fg & ~rhm, iterations=4))
        # linhas finas (contornos do bloco, grade) -> abertura + maior componente
        opened = ndi.binary_opening(fg, structure=np.ones((3, 3)), iterations=2)
        lab2, n2 = ndi.label(opened, structure=np.ones((3, 3)))
        if n2 == 0:
            continue
        sizes = ndi.sum(opened, lab2, range(1, n2 + 1))
        keep = lab2 == (int(np.argmax(sizes)) + 1)
        # outros pedaços grandes (ex.: arma separada por fundo) também ficam
        for i, sz in enumerate(sizes):
            comp = lab2 == (i + 1)
            if sz > 0.08 * sizes.max() and not (comp & border).any():
                keep |= comp
        keep = ndi.binary_dilation(keep, iterations=3) & fg
        # borda suave
        alpha = ndi.gaussian_filter(keep.astype(np.float32), 0.7)
        alpha = np.clip(alpha * 1.25, 0, 1)
        ys, xs = np.nonzero(keep)
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        # âncora dos pés: centro das colunas nas últimas linhas
        bottom = keep[by1 - 12:by1, :]
        fx = int(np.nonzero(bottom.any(0))[0].mean())
        rgba = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
        pad = 6
        half = max(fx - bx0, bx1 - fx) + pad
        cx0, cx1 = fx - half, fx + half
        cy0, cy1 = by0 - pad, by1 + 2
        out = Image.new('RGBA', (cx1 - cx0, cy1 - cy0), (0, 0, 0, 0))
        src = Image.fromarray(rgba, 'RGBA')
        out.paste(src.crop((max(cx0, 0), max(cy0, 0), min(cx1, W), min(cy1, H))), (max(0, -cx0), max(0, -cy0)))
        # altura padrão
        th = 360
        out = out.resize((round(out.width * th / out.height), th), Image.LANCZOS)
        out.save(os.path.join(OUT, f'{cid}_{d}.png'))
        previews.append(out)
        print(cid, d, out.size)

# folha de conferência sobre fundo de grama
cols = 4
w = max(p.width for p in previews)
sheet = Image.new('RGBA', (cols * w, ((len(previews) + cols - 1) // cols) * 370), (110, 160, 60, 255))
for i, p in enumerate(previews):
    sheet.alpha_composite(p, ((i % cols) * w + (w - p.width) // 2, (i // cols) * 370 + 5))
sheet.convert('RGB').save(PREVIEW)
