"""Arte das cartas de item: ref/cards/<nome>.jpg (fundo verde) -> public/cards/<id>.webp.

- Armas/objetos: o verde vira transparente e a figura é recortada (fica sobre o fundo colorido da carta).
- Magias: a ilustração é um quadro que preenche a arte da carta (recorta só a área sem verde).
Gera também src/ui/cardArt.ts com a lista (id -> 'icon' | 'fill').
Os nomes dos arquivos usam hífen (espada-enferrujada) e viram o id da carta (espada_enferrujada).
"""
import json
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'cards')
OUT = os.path.join(ROOT, 'public', 'cards')
TS = os.path.join(ROOT, 'src', 'ui', 'cardArt.ts')
# arquivo -> cartas que usam a imagem (as versões II/III usam a mesma). Os outros arquivos da pasta são referências de layout.
ITEMS = {
    'espada-enferrujada': ['espada_enferrujada'],
    'adaga-aparadora': ['adaga_aparadora'],
    'estilingue': ['estilingue'],
    'raio-nova': ['raio_nova', 'raio_nova2'],
    'drenar-vida': ['drenar_vida', 'drenar_vida2', 'drenar_vida3'],
    'boodthirst': ['sede_sangue'],
    'twinbolt': ['raio_duplo'],
    'mon-ring': ['anel_lua', 'anel_lua2', 'anel_lua3'],
    'heart-of-the-gryphon': ['coracao_grifo'],
    'apocalypse-crown': ['apocalipse'],
    'hate': ['odio', 'odio2'],
    'wind-blast': ['rajada_vento', 'rajada_vento2'],
    'crushing-gauntlet': ['manopla_esmagadora'],
    'frostbite': ['ulceracao'],
    'captains-blade': ['espada_capitao'],
    'bleeder': ['sangradora'],
    'cleave': ['fender', 'fender2'],
    'emberstrike': ['golpe_flamejante'],
    'Editing_item_background_color_2K_20261020160804': ['esmaga_cara'],  # o martelo (Esmaga-Cara)
    'knights-shield': ['escudo_cavaleiro'],
    'orc-beater': ['esmaga_orcs'],
    'thorn': ['espinho'],
    'sun-ring': ['anel_sol', 'anel_sol2'],
    'das-boot': ['das_boot'],
    'die-booen': ['die_booten'],
    'deadshot': ['tiro_certeiro'],
    'grrrrrrrrrr': ['grrr', 'mais_grrr'],
    'holy-nova': ['golpe_astral', 'golpe_astral2'],  # Astral Strike
    'trust-blade': ['lamina_confiavel'],
    'kings-shield': ['escudo_rei'],
    'night-fury ': ['furia_noturna'],  # o arquivo tem um espaço no nome
    'crescent-bow': ['arco_crescente'],
    'quickshot': ['tiro_rapido'],
    'kings-plate': ['armadura_rei'],
    'batle-cry': ['grito_guerra'],
    'orc-pelt': ['pele_orc'],
    'geneis-glass': ['vidro_genesis', 'vidro_genesis2'],
    'shield-of-souls': ['escudo_almas'],
    'incinerar': ['incinerar', 'incinerar2'],
    'dizimador': ['dizimador'],
    'bomb1': ['bomba'],  # a Bomba da Recompensa (Distrito do Alquimista)
    # Maldições Mortais: a 1ª imagem é a carta "Sem Maldição"; a 2ª, todas as outras
    'death-curse1': ['curse:sem_maldicao'],
    'death-curse2': ['curse:aquafobia', 'curse:choque', 'curse:sangramento', 'curse:amnesia', 'curse:sangramento_grave', 'curse:propenso', 'curse:atordoado'],
}
MAX = 512


def main():
    os.makedirs(OUT, exist_ok=True)
    kinds = {}
    art = {}
    for name, ids in ITEMS.items():
        path = os.path.join(SRC, name + '.jpg')
        if not os.path.exists(path):
            print('falta', name)
            continue
        a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        gx = g - np.maximum(r, b)
        alpha = np.clip(1.0 - (gx - 40) / 60.0, 0, 1)
        solid = alpha > 0.5
        ys, xs = np.nonzero(solid)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        fill_ratio = solid[y0:y1, x0:x1].mean()
        cid = ids[0].replace('curse:', 'curse_')
        if fill_ratio > 0.9:
            # quadro (magia): recorta a ilustração inteira, um pouco para dentro para não pegar a borda verde
            pad = 6
            im = Image.fromarray(a[y0 + pad:y1 - pad, x0 + pad:x1 - pad].astype(np.uint8), 'RGB')
            im.thumbnail((MAX, MAX), Image.LANCZOS)
            im.save(os.path.join(OUT, cid + '.webp'), 'WEBP', quality=86, method=6)
            kinds[cid] = 'fill'
        else:
            # figura solta: todo o verde vira transparente (inclusive o que fica preso dentro da figura,
            # como no meio da forquilha do estilingue) e o reflexo verde da borda é tirado
            # (áreas verdes pequenas e fechadas, como as gemas da Adaga, são da própria arte e ficam)
            bg = alpha < 0.5
            lab, n = ndi.label(bg)
            edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
            sizes = ndi.sum(bg, lab, index=np.arange(1, n + 1))
            # verde de fundo puro (preso entre partes da figura) sai mesmo pequeno; verde escuro da arte (gemas) fica
            mg = ndi.mean(g, lab, index=np.arange(1, n + 1))
            mr = ndi.mean(np.maximum(r, b), lab, index=np.arange(1, n + 1))
            keep = [i + 1 for i, sz in enumerate(sizes) if (i + 1) in edge or sz > bg.size * 0.004 or (mg[i] > 200 and mr[i] < 90)]
            outside = np.isin(lab, keep)
            near = ndi.binary_dilation(outside, iterations=3)
            alpha = np.where(near, alpha, 1.0)
            alpha = np.where(outside, 0.0, alpha)
            rgb = a.copy()
            rgb[..., 1] = np.where((alpha < 0.999) & near, np.minimum(g, np.maximum(r, b) + 6), g)
            im = Image.fromarray(np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
            ys, xs = np.nonzero(alpha > 0.1)
            im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
            im.thumbnail((MAX, MAX), Image.LANCZOS)
            im.save(os.path.join(OUT, cid + '.webp'), 'WEBP', quality=90, method=6)
            kinds[cid] = 'icon'
        for i in ids:
            art[i] = {'img': cid, 'kind': kinds[cid]}
        print(name, '->', ', '.join(ids), kinds[cid], os.path.getsize(os.path.join(OUT, cid + '.webp')) // 1024, 'KB')
    with open(TS, 'w', encoding='utf-8') as f:
        f.write('// Gerado por tools/build_cards.py — arte das cartas de item (public/cards/<id>.webp).\n')
        f.write("// 'fill' = ilustração que preenche a arte (magias); 'icon' = figura com fundo transparente (armas).\n")
        f.write("// chave = id da carta (Maldições: 'curse:<id>'); img = arquivo em public/cards\n")
        f.write("export const CARD_ART: Record<string, { img: string; kind: 'fill' | 'icon' }> = " + json.dumps(art, indent=2) + ';\n')


if __name__ == '__main__':
    main()
