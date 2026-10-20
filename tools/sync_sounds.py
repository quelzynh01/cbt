"""Copia os sons de ref/sounds/ para public/sounds/<nome>.mp3 (os .mpeg são MP3; só muda a extensão).
Use depois de colocar sons novos (ex.: musica-menu, musica-partida, foot-step)."""
import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'ref', 'sounds')
OUT = os.path.join(ROOT, 'public', 'sounds')

os.makedirs(OUT, exist_ok=True)
for f in sorted(os.listdir(SRC)):
    name, ext = os.path.splitext(f)
    if ext.lower() not in ('.mp3', '.mpeg', '.mpga', '.wav', '.ogg'):
        continue
    dest = os.path.join(OUT, name + ('.mp3' if ext.lower() in ('.mp3', '.mpeg', '.mpga') else ext.lower()))
    shutil.copyfile(os.path.join(SRC, f), dest)
    print(f, '->', os.path.relpath(dest, ROOT))
