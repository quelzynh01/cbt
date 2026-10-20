"""Ilustrações e textos dos cenários.

ref/maps/<NOME>.jpg      -> public/maps/<id>.webp (3x4, 540x720)
ref/maps/desc_maps.txt   -> src/engine/maps/lore.ts (textos do Livro de Campanha, organizados por seção)
"""
import json
import os
import re
import unicodedata
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'maps')
OUT = os.path.join(ROOT, 'public', 'maps')
LORE = os.path.join(ROOT, 'src', 'engine', 'maps', 'lore.ts')
SIZE = (540, 720)

NAMES = {  # nome do cenário (sem acento, minúsculo) -> id do mapa
    'distrito dos martelos': 'distrito-dos-martelos', 'arena do sol brilhante': 'arena-do-sol-brilhante',
    'o portao da lua': 'portao-da-lua', 'o viveiro das aguias': 'viveiro-das-aguias', 'a mansao': 'mansao',
    'covil dos orcs': 'covil-dos-orcs', 'distrito do alquimista': 'distrito-do-alquimista',
    'praca da aurora vermelha': 'praca-da-aurora-vermelha', 'o patio da universidade': 'patio-da-universidade',
    'distrito sempressombrio': 'distrito-sempressombrio', 'o templo do amanhecer crepuscular': 'templo-do-amanhecer-crepuscular',
}
PRETTY = {
    'distrito-dos-martelos': 'Distrito dos Martelos', 'arena-do-sol-brilhante': 'Arena do Sol Brilhante',
    'portao-da-lua': 'O Portão da Lua', 'viveiro-das-aguias': 'O Viveiro das Águias', 'mansao': 'A Mansão',
    'covil-dos-orcs': 'Covil dos Orcs', 'distrito-do-alquimista': 'Distrito do Alquimista',
    'praca-da-aurora-vermelha': 'Praça da Aurora Vermelha', 'patio-da-universidade': 'O Pátio da Universidade',
    'distrito-sempressombrio': 'Distrito Sempressombrio', 'templo-do-amanhecer-crepuscular': 'O Templo do Amanhecer Crepuscular',
}


def norm(s: str) -> str:
    s = unicodedata.normalize('NFD', s)
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[\s\-]+', ' ', s).strip().lower()


def images():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(SRC):
        if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            continue
        mid = NAMES.get(norm(os.path.splitext(f)[0]))
        if not mid:
            print('sem mapa para', f)
            continue
        im = Image.open(os.path.join(SRC, f)).convert('RGB')
        # recorta para 3x4 (centro) e reduz
        w, h = im.size
        tw = min(w, round(h * 3 / 4))
        th = round(tw * 4 / 3)
        im = im.crop(((w - tw) // 2, (h - th) // 2, (w - tw) // 2 + tw, (h - th) // 2 + th)).resize(SIZE, Image.LANCZOS)
        im.save(os.path.join(OUT, mid + '.webp'), 'WEBP', quality=80, method=6)
        print(mid, os.path.getsize(os.path.join(OUT, mid + '.webp')) // 1024, 'KB')


# ---------------------------------------------------------------- textos
FIX = [
    ('ENEFICIA-SE DE', 'BENEFICIA-SE DE'), ('BBENEFICIA-SE DE', 'BENEFICIA-SE DE'),
    ('portaisvermelhos', 'portais vermelhos'), ('osjogadores', 'os jogadores'), ('Inímigo', 'Inimigo'),
    ('Irm da Dor', 'Irmã da Dor'), ('Irma do', 'Irmã do'), ('recebera recompensa', 'receberá a recompensa'),
    ('Titulo', 'Título'), ('Aguias', 'Águias'), ('MissãoDá', 'Missão - Dá'), ('"Matar o Minotauro\n', '"Matar o Minotauro"\n'),
    ('- "Matar o Capitão Orc"\nCONTRA JOGADOR\nDá uma carta de Recompensa\n', '- "Matar o Capitão Orc" - Dá uma carta de Recompensa\nCONTRA JOGADOR\n'),
    ('Crepuscular\n"O jogador', 'Crepuscular".\nO jogador'), ('"O Templo do Amanhecer Crepuscular\nMISSÕES', '"O Templo do Amanhecer Crepuscular".\nMISSÕES'),
    (' (*)', ''), ('Missão "Matar Feral Martelador"', 'Missão "Matar o Feral Martelador"'),
]
CYR = str.maketrans({'а': 'a', 'р': 'p', 'е': 'e', 'о': 'o', 'с': 'c', 'х': 'x'})
HEADS = {
    'BENEFICIA-SE DE': 'from', 'BENEFICIA': 'to', 'TÍTULO': 'title', 'MISSÕES': None, 'CONTRA O JOGO': 'pve',
    'CONTRA JOGADOR': 'pvp', 'CARTA DE RECOMPENSA': 'reward', 'PREPARAÇÃO ESPECIAL': 'setup',
    'REGRAS ESPECIAIS': 'rules', 'VANTAGENS DO TÍTULO': 'adv',
}
STARTERS = ('Se ', 'Quando ', 'Nota:', 'Somente ', 'Qualquer ', 'Neste ', 'Separe ', 'Insira ', 'Coloque ', 'Cada ', 'Ao jogar', 'Os portais azuis')
MAPNAMES = set(NAMES)


def paragraphs(lines, mission=False):
    """Junta as linhas quebradas do PDF em itens (um por regra / Missão)."""
    out = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        bullet = bool(re.match(r'^-\s*', ln))
        ln = re.sub(r'^-\s*', '', ln)
        new = bullet or not out
        if mission:
            new = new or ln.startswith('"')
        else:
            new = new or (out[-1].rstrip().endswith(('.', '"', ')')) and ln.startswith(STARTERS))
        if new:
            out.append(ln)
        else:
            out[-1] += ' ' + ln
    return [re.sub(r'\s+', ' ', x).strip() for x in out]


def mission(item):
    m = re.match(r'^"([^"]+)"\.?\s*(.*)$', item)
    name, rest = (m.group(1), m.group(2)) if m else (item, '')
    gives = ''
    g = re.search(r'\s*-?\s*(Dá (?:Título|uma carta de Recompensa))\.?$', rest)
    if g:
        gives, rest = g.group(1), rest[:g.start()].strip()
    rest = rest.rstrip(' .-')
    return {'name': name.strip(), 'text': rest + '.' if rest else '', 'gives': gives}


def lore():
    raw = open(os.path.join(SRC, 'desc_maps.txt'), encoding='utf-8').read().translate(CYR).replace('\r', '')
    for a, b in FIX:
        raw = raw.replace(a, b)
    # cada cenário começa com o nome do arquivo em maiúsculas (O-PORTÃO-DA-LUA)
    blocks, cur = {}, None
    for ln in raw.split('\n'):
        s = ln.strip()
        if s == '---':
            continue
        if re.fullmatch(r'[A-ZÀ-Ü\-]+', s) and NAMES.get(norm(s)):
            cur = NAMES[norm(s)]
            blocks[cur] = []
            continue
        if cur:
            blocks[cur].append(s)
    data, seen = {}, {}
    for mid, lines in blocks.items():
        sec = {k: [] for k in ('from', 'to', 'title', 'pve', 'pvp', 'reward', 'setup', 'rules', 'adv')}
        at = None
        for s in lines:
            if s in HEADS:
                at = HEADS[s]
                continue
            if at in ('from', 'to'):
                if norm(s) in MAPNAMES or norm('o ' + s) in MAPNAMES:
                    sec[at].append(PRETTY[NAMES.get(norm(s)) or NAMES[norm('o ' + s)]])
                    continue
                if sec[at] and norm(sec[at][-1] + ' ' + s) in {norm(PRETTY[v]) for v in PRETTY.keys()}:
                    sec[at][-1] = PRETTY[NAMES[norm(sec[at][-1] + ' ' + s)]]
                    continue
                if norm(s) in {'o templo do amanhecer'}:
                    sec[at].append('O Templo do Amanhecer')
                    continue
                at = 'title'  # o texto do Título aparece logo após a lista
            if at:
                sec[at].append(s)
        sig = json.dumps(sec, ensure_ascii=False)
        if sig in seen:  # texto repetido de outro cenário: ignora (o Templo ficou com o texto do Pátio)
            print(f'{mid}: texto igual ao de {seen[sig]} — ignorado')
            continue
        seen[sig] = mid
        title = ' '.join(sec['title']).strip()
        data[mid] = {
            'benefitsFrom': sec['from'], 'benefits': sec['to'],
            'title': re.sub(r'\s+', ' ', title),
            'pve': [mission(x) for x in paragraphs(sec['pve'], True)],
            'reward': ' '.join(sec['reward']).strip(),
            'setup': paragraphs(sec['setup']), 'rules': paragraphs(sec['rules']), 'advantages': paragraphs(sec['adv']),
        }
    # o Templo do arquivo é o texto do Pátio: o bloco do Templo é descartado se for igual
    if 'templo-do-amanhecer-crepuscular' in data and 'patio-da-universidade' in data:
        if data['templo-do-amanhecer-crepuscular']['pve'] == data['patio-da-universidade']['pve']:
            del data['templo-do-amanhecer-crepuscular']
            print('templo: texto igual ao do Pátio — ignorado')
    body = json.dumps(data, ensure_ascii=False, indent=2)
    with open(LORE, 'w', encoding='utf-8') as f:
        f.write('// Gerado por tools/build_maps.py a partir de ref/maps/desc_maps.txt — não edite à mão.\n')
        f.write('export interface MapLore {\n  benefitsFrom: string[];\n  benefits: string[];\n  title: string;\n'
                '  pve: { name: string; text: string; gives: string }[];\n  reward: string;\n  setup: string[];\n  rules: string[];\n  advantages: string[];\n}\n\n')
        f.write(f'export const MAP_LORE: Record<string, MapLore> = {body};\n')
    print('lore:', ', '.join(data))


if __name__ == '__main__':
    images()
    lore()
