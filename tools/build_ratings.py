"""Rating dos Heróis (ref/wiki/rating-heroes.csv) -> src/engine/ratings.ts.

Só os Heróis que o jogo já tem (Core, extras e Beyond the Grave); os outros do CSV ficam de fora por enquanto.
O id do jogo vem do nome em inglês (Vapor = Wisp, Espetado = Spike, Casacaverde = Greensleeves, Escarlate = Scarlet).
"""
import csv
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'ref', 'wiki', 'rating-heroes.csv')
EXTRA = os.path.join(ROOT, 'src', 'engine', 'extraHeroes.ts')
OUT = os.path.join(ROOT, 'src', 'engine', 'ratings.ts')

CORE = {'diva': 'diva', 'greensleeves': 'casacaverde', 'grom': 'grom', 'hobsbawm': 'hobsbawm', 'johan': 'johan', 'kanga': 'kanga',
        'maya': 'maya', 'scarlet': 'escarlate', 'seth': 'seth', 'spike': 'espetado', 'wisp': 'vapor', 'zazu': 'zazu',
        'chaz': 'chaz', 'darryn': 'darryn'}


def slug(name: str) -> str:
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')


def main():
    src = open(EXTRA, encoding='utf-8').read()
    extras = {h['id'] for h in json.loads(src[src.index('= [') + 2:src.rindex(']') + 1])}
    out = {}
    for r in csv.DictReader(open(CSV, encoding='utf-8-sig'), delimiter=';'):
        s = slug(r.get('Hero', ''))
        rating = (r.get('Rating') or '').strip().replace(',', '.')
        if not s or not rating:
            continue
        hid = CORE.get(s) or (f'x_{s}' if s in extras else None)
        if hid:
            out[hid] = float(rating)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// Gerado por tools/build_ratings.py (ref/wiki/rating-heroes.csv): força de cada Herói (0-10).\n')
        f.write('export const HERO_RATING: Record<string, number> = ' + json.dumps(out, ensure_ascii=False, indent=2) + ';\n')
    print(len(out), 'ratings')


if __name__ == '__main__':
    main()
