"""Retratos (quadradinhos) dos personagens: ref/modelos/heorois.jpg e monstros.jpg (grade 4x3, fundo verde)
-> public/portraits/<id>.webp (fundo transparente) e src/render/portraitList.ts (ids com retrato).
Os retratos são usados nas fichas, na barra de Heróis, no Cemitério etc. (drawFace em src/render/chibi.ts).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'modelos')
OUT = os.path.join(ROOT, 'public', 'portraits')
TS = os.path.join(ROOT, 'src', 'render', 'portraitList.ts')
# folha -> ids na ordem da grade (linha por linha); None = quadradinho repetido (não usado)
SHEETS = {
    'heorois': ['diva', 'casacaverde', 'grom', 'hobsbawm',
                'johan', 'kanga', 'maya', 'escarlate',
                'seth', 'espetado', 'vapor', 'zazu'],
    'monstros': ['goblin', 'capitao_orc', 'orc', 'feral_martelador',
                 'feral_lanceiro', 'troll', 'minotauro', None,
                 None, 'irma_dor', 'irma_prazer', 'lorde_presas'],
}
SIZE = 192


def main():
    os.makedirs(OUT, exist_ok=True)
    done = []
    for sheet, ids in SHEETS.items():
        a = np.asarray(Image.open(os.path.join(SRC, sheet + '.jpg')).convert('RGB')).astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        gx = g - np.maximum(r, b)
        alpha = np.clip(1.0 - (gx - 40) / 60.0, 0, 1)
        # cada quadradinho é um bloco grande de pixels não verdes
        lab, n = ndi.label(alpha > 0.5)
        sizes = ndi.sum(np.ones_like(alpha), lab, index=np.arange(1, n + 1))
        boxes = [s for i, s in enumerate(ndi.find_objects(lab)) if sizes[i] > alpha.size * 0.01]
        assert len(boxes) == len(ids), (sheet, len(boxes))
        # ordem da grade: por linha (centro y), depois por coluna
        H = a.shape[0]
        boxes.sort(key=lambda s: (round((s[0].start + s[0].stop) / 2 / (H / 3) - 0.5), s[1].start))
        for sl, cid in zip(boxes, ids):
            if not cid:
                continue
            y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
            rgb = a[y0:y1, x0:x1].copy()
            al = alpha[y0:y1, x0:x1]
            # tira o reflexo verde da borda
            rgb[..., 1] = np.where(al < 0.999, np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]) + 6), rgb[..., 1])
            im = Image.fromarray(np.dstack([rgb, al * 255]).clip(0, 255).astype(np.uint8))
            # quadrado: centralizado na horizontal, apoiado embaixo
            side = max(im.width, im.height)
            sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            sq.paste(im, ((side - im.width) // 2, side - im.height))
            sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
            sq.save(os.path.join(OUT, cid + '.webp'), 'WEBP', quality=88, method=6)
            done.append(cid)
            print(sheet, '->', cid)
    with open(TS, 'w', encoding='utf-8') as f:
        f.write('// Gerado por tools/build_portraits.py — personagens com retrato próprio (public/portraits/<id>.webp).\n')
        f.write('export const PORTRAITS: string[] = [' + ', '.join(f"'{x}'" for x in done) + '];\n')


if __name__ == '__main__':
    main()
