"""Heróis extras (só na Biblioteca, ainda não jogáveis): ref/wiki/extra-heroes.csv -> src/engine/extraHeroes.ts
e os retratos de ref/modelos/extra-heroes1..4.jpg (fundo verde; 12 + 12 + 12 + 5 na ordem do CSV) -> public/portraits/x_<id>.webp.
Se uma folha ainda não existir, os Heróis dela ficam sem retrato (a carta mostra só as iniciais).
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


def main():
    rows = list(csv.DictReader(open(CSV, encoding='utf-8-sig'), delimiter=';'))
    heroes = [{'id': slug(r['Hero']), 'name': r['Hero'].strip(), 'def': int(r['Def']), 'hp': int(r['Life']),
               'ability': r['Ability'].strip(), 'text': r['Effect'].strip(), 'art': False} for r in rows if r.get('Hero')]
    os.makedirs(OUT, exist_ok=True)
    i = 0
    for sheet, count in SHEETS:
        path = os.path.join(SRC, sheet + '.jpg')
        group = heroes[i:i + count]
        i += count
        if not os.path.exists(path):
            print('falta', sheet, '->', ', '.join(h['name'] for h in group))
            continue
        faces = crop_sheet(path, len(group))
        if len(faces) != len(group):
            print(f'{sheet}: achei {len(faces)} quadradinhos, esperava {len(group)}')
        for h, im in zip(group, faces):
            im.save(os.path.join(OUT, f"x_{h['id']}.webp"), 'WEBP', quality=88, method=6)
            h['art'] = True
            print(sheet, '->', h['name'])
    with open(TS, 'w', encoding='utf-8') as f:
        f.write('// Gerado por tools/build_extra_heroes.py — Heróis extras (só na Biblioteca; ainda não jogáveis).\n')
        f.write('// art: tem retrato em public/portraits/x_<id>.webp\n')
        f.write('export interface ExtraHero { id: string; name: string; def: number; hp: number; ability: string; text: string; art: boolean }\n')
        f.write('export const EXTRA_HEROES: ExtraHero[] = ' + json.dumps(heroes, ensure_ascii=False, indent=2) + ';\n')
    print(len(heroes), 'heróis extras')


if __name__ == '__main__':
    main()
