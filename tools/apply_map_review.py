"""Aplica nos arquivos dos mapas (src/engine/maps/*.ts) o texto gerado pela Revisão dos mapas (/#paredes).

Uso: python tools/apply_map_review.py revisao.txt
O arquivo pode começar com "PAREDES" (como o editor copia). Para cada mapa:
  adicionar / remover        paredes  "(c,r)-(c,r)"
  bloquear / desbloquear     Espaços bloqueados (pillars)  "(c,r)"
  madeira / tirar_madeira    decks de madeira (rooms)  "(c,r)"
  portas                     portas novas  {"entre": "(c,r)-(c,r)", "tipo": "fechada|aberta|pequena|trancada"}
  tirar_portas               portas removidas  "(c,r)-(c,r)"
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS = os.path.join(ROOT, 'src', 'engine', 'maps')

CELL = re.compile(r'\((\d+),\s*(\d+)\)')


def cells(s):
    return [(int(a), int(b)) for a, b in CELL.findall(s)]


def c_txt(c):
    return f'C({c[0]}, {c[1]})'


def block(src, start, name):
    """(início, fim) do conteúdo do array `name: [...]` depois de `start`."""
    i = src.index(f'{name}: [', start) + len(name) + 3
    depth, j = 1, i
    while depth:
        ch = src[j]
        depth += ch == '['
        depth -= ch == ']'
        j += 1
    return i, j - 1


def find_map(id_):
    for path in glob.glob(os.path.join(MAPS, '*.ts')):
        src = open(path, encoding='utf-8').read()
        m = re.search(rf"id:\s*'{re.escape(id_)}'", src)
        if m:
            return path, src, m.start()
    raise SystemExit(f'mapa não encontrado: {id_}')


def pair_re(a, b):
    sp = r'\s*'
    one = lambda c: rf'C\({c[0]},{sp}{c[1]}\)'
    return re.compile(rf'\[{sp}(?:{one(a)},{sp}{one(b)}|{one(b)},{sp}{one(a)}){sp}\],?[ \t]*')


def door_re(a, b):
    sp = r'\s*'
    one = lambda c: rf'C\({c[0]},{sp}{c[1]}\)'
    return re.compile(rf'[ \t]*\{{{sp}a:{sp}(?:{one(a)},{sp}b:{sp}{one(b)}|{one(b)},{sp}b:{sp}{one(a)})[^}}]*\}},?[ \t]*\n?')


def edit_cells(src, start, name, add, remove):
    i, j = block(src, start, name)
    body = src[i:j]
    have = cells(body)
    have = [c for c in have if c not in remove]
    have += [c for c in add if c not in have]
    return src[:i] + ', '.join(c_txt(c) for c in have) + src[j:]


def apply(id_, ed):
    path, src, start = find_map(id_)
    n = 0
    # paredes
    for s in ed.get('remover', []):
        a, b = cells(s)
        i, j = block(src, start, 'walls')
        body, new = src[i:j], pair_re(a, b).sub('', src[i:j], count=1)
        new = re.sub(r'\n[ \t]+\n', '\n', new)  # linha que ficou vazia
        if body == new:
            print(f'  ! {id_}: parede {s} não encontrada')
        src = src[:i] + new + src[j:]
        n += 1
    add = [cells(s) for s in ed.get('adicionar', [])]
    if add:
        i, j = block(src, start, 'walls')
        body = src[i:j].rstrip()
        sep = '' if body.endswith(',') or not body.strip() else ','
        lines = '\n    // revisão dos mapas\n    ' + ', '.join(f'[{c_txt(a)}, {c_txt(b)}]' for a, b in add) + ',\n  '
        src = src[:i] + body + sep + lines + src[j:]
        n += len(add)
    # Espaços bloqueados e decks de madeira
    for name, a_key, r_key in (('pillars', 'bloquear', 'desbloquear'), ('rooms', 'madeira', 'tirar_madeira')):
        a = [cells(s)[0] for s in ed.get(a_key, [])]
        r = [cells(s)[0] for s in ed.get(r_key, [])]
        if a or r:
            src = edit_cells(src, start, name, a, r)
            n += len(a) + len(r)
    # portas
    for s in ed.get('tirar_portas', []):
        a, b = cells(s)
        i, j = block(src, start, 'doors')
        new = door_re(a, b).sub('', src[i:j], count=1)
        if new == src[i:j]:
            print(f'  ! {id_}: porta {s} não encontrada')
        src = src[:i] + new + src[j:]
        n += 1
    doors = ed.get('portas', [])
    if doors:
        i, j = block(src, start, 'doors')
        body = src[i:j].rstrip()
        sep = '' if body.endswith(',') or not body.strip() else ','
        out = []
        for d in doors:
            a, b = cells(d['entre'])
            t = d.get('tipo', 'fechada')
            extra = {'fechada': 'open: false', 'aberta': 'open: true', 'pequena': 'open: true, small: true', 'trancada': 'open: false, locked: true'}[t]
            out.append(f'{{ a: {c_txt(a)}, b: {c_txt(b)}, {extra} }}')
        src = src[:i] + body + sep + '\n    // revisão dos mapas\n    ' + ',\n    '.join(out) + ',\n  ' + src[j:]
        n += len(doors)
    open(path, 'w', encoding='utf-8').write(src)
    print(f'{id_}: {n} alteração(ões) em {os.path.basename(path)}')


def main():
    txt = open(sys.argv[1], encoding='utf-8').read()
    txt = txt[txt.index('{'):]
    for id_, ed in json.loads(txt).items():
        apply(id_, ed)


if __name__ == '__main__':
    main()
