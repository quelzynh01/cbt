"""Heróis extras (só na Biblioteca, ainda não jogáveis): ref/wiki/extra-heroes.csv -> src/engine/extraHeroes.ts.
- Modelo de cada um: ref/modelos/extra/<nome>.jpg (frente à esquerda, costas à direita, fundo verde, como os do jogo)
  -> public/extras/x_<id>.webp (a pose de frente, para a carta).
- Retratos: os quadradinhos de ref/modelos/extra-heroes1..4.jpg são recortados e cada um vai para o Herói cujo modelo
  tem as cores mais parecidas (as folhas não seguem exatamente a ordem do CSV) -> public/portraits/x_<id>.webp.
"""
import csv
import json
import os
import re
import unicodedata
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'ref', 'wiki', 'extra-heroes.csv')
SRC = os.path.join(ROOT, 'ref', 'modelos')
OUT = os.path.join(ROOT, 'public', 'portraits')
TS = os.path.join(ROOT, 'src', 'engine', 'extraHeroes.ts')
SHEETS = [('extra-heroes1', 12), ('extra-heroes2', 12), ('extra-heroes3', 12), ('extra-heroes4', 5)]
SIZE = 192
MODELS = os.path.join(SRC, 'extra')
ART = os.path.join(ROOT, 'public', 'extras')


def slug(name: str) -> str:
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')


def crop_sheet(path: str, count: int):
    """Recorta os quadradinhos (blocos grandes sem verde), na ordem de leitura (linha por linha)."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = np.clip(1.0 - (g - np.maximum(r, b) - 40) / 60.0, 0, 1)
    lab, n = ndi.label(alpha > 0.5)
    sizes = ndi.sum(np.ones_like(alpha), lab, index=np.arange(1, n + 1))
    boxes = [s for i, s in enumerate(ndi.find_objects(lab)) if sizes[i] > alpha.size * 0.006]
    boxes = sorted(boxes, key=lambda s: -(s[0].stop - s[0].start) * (s[1].stop - s[1].start))[:count]
    # linhas: agrupa por altura do centro
    h = np.median([s[0].stop - s[0].start for s in boxes])
    boxes.sort(key=lambda s: (round(((s[0].start + s[0].stop) / 2) / h), s[1].start))
    out = []
    for sl in boxes:
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        rgb = a[y0:y1, x0:x1].copy()
        al = alpha[y0:y1, x0:x1]
        rgb[..., 1] = np.where(al < 0.999, np.minimum(rgb[..., 1], np.maximum(rgb[..., 0], rgb[..., 2]) + 6), rgb[..., 1])
        im = Image.fromarray(np.dstack([rgb, al * 255]).clip(0, 255).astype(np.uint8))
        side = max(im.width, im.height)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(im, ((side - im.width) // 2, side - im.height))
        out.append(sq.resize((SIZE, SIZE), Image.LANCZOS))
    return out


def hist(im: Image.Image) -> np.ndarray:
    """Histograma de cores (HSV, só pixels do personagem) para comparar retrato x modelo."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    m = a[..., 3] > 128
    hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(np.float32)[m]
    h, _ = np.histogramdd(hsv[:, :2], bins=(18, 6), range=((0, 256), (0, 256)))
    v, _ = np.histogram(hsv[:, 2], bins=8, range=(0, 256))
    f = np.concatenate([h.ravel(), v * 0.5])
    return f / max(1e-6, f.sum())


def main():
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from build_sprites import cut, split_x
    from scipy.optimize import linear_sum_assignment
    rows = list(csv.DictReader(open(CSV, encoding='utf-8-sig'), delimiter=';'))
    heroes = [{'id': slug(r['Hero']), 'name': r['Hero'].strip(), 'def': int(r['Def']), 'hp': int(r['Life']),
               'ability': r['Ability'].strip(), 'text': r['Effect'].strip(), 'art': False, 'model': False} for r in rows if r.get('Hero')]
    # textos em português (ref/wiki/extra-heroes-pt.csv); o nome do Herói continua o original
    pt_path = os.path.join(ROOT, 'ref', 'wiki', 'extra-heroes-pt.csv')
    if os.path.exists(pt_path):
        pt = {slug(r['Hero']): r for r in csv.DictReader(open(pt_path, encoding='utf-8-sig'), delimiter=';') if r.get('Hero')}
        for h in heroes:
            r = pt.get(h['id'])
            if r:
                h['ability'] = r['Habilidade'].strip()
                h['text'] = r['Efeito'].strip()
        # "+N Rerrolagem." no começo do texto vira o medalhão de Rerrolagem da carta
        for h in heroes:
            m = re.match(r'\+(\d+) Rerrolagem\.\s*', h['text'])
            if m:
                h['rr'] = int(m.group(1))
                h['text'] = h['text'][m.end():]
            else:
                print('sem tradução', h['name'])
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(ART, exist_ok=True)
    # modelos: pose de frente (olhando para a direita, como a carta do jogo)
    fronts = {}
    for h in heroes:
        path = os.path.join(MODELS, h['id'].replace('_', '-') + '.jpg')
        if not os.path.exists(path):
            print('sem modelo', h['name'])
            continue
        img = Image.open(path).convert('RGB')
        front = cut(img, 0, split_x(img)).transpose(Image.FLIP_LEFT_RIGHT)
        front.thumbnail((420, 520), Image.LANCZOS)
        front.save(os.path.join(ART, f"x_{h['id']}.webp"), 'WEBP', quality=88, method=6)
        h['model'] = True
        fronts[h['id']] = front
    # retratos: recorta todas as folhas e liga cada Herói (com modelo) ao retrato mais parecido
    crops = []
    for sheet, count in SHEETS:
        path = os.path.join(SRC, sheet + '.jpg')
        if os.path.exists(path):
            crops += crop_sheet(path, 99)
    with_model = [h for h in heroes if h['id'] in fronts]
    if crops and with_model:
        A = np.array([hist(fronts[h['id']]) for h in with_model])
        B = np.array([hist(c) for c in crops])
        cost = np.array([[np.abs(a - b).sum() for b in B] for a in A])
        ri, ci = linear_sum_assignment(cost)
        for r, c in zip(ri, ci):
            h = with_model[r]
            crops[c].save(os.path.join(OUT, f"x_{h['id']}.webp"), 'WEBP', quality=88, method=6)
            h['art'] = True
            print(f"{h['name']:22s} <- retrato {c:2d} (diferença {cost[r, c]:.2f})")
    with open(TS, 'w', encoding='utf-8') as f:
        f.write('// Gerado por tools/build_extra_heroes.py — Heróis extras (só na Biblioteca; ainda não jogáveis).\n')
        f.write('// art: retrato em public/portraits/x_<id>.webp · model: corpo inteiro em public/extras/x_<id>.webp\n')
        f.write('export interface ExtraHero { id: string; name: string; def: number; hp: number; ability: string; text: string; art: boolean; model: boolean; rr?: number }\n')
        f.write('export const EXTRA_HEROES: ExtraHero[] = ' + json.dumps(heroes, ensure_ascii=False, indent=2) + ';\n')
    print(len(heroes), 'heróis extras')


if __name__ == '__main__':
    main()
