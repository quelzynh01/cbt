import type { Game } from '../engine/game';
import { difficultyBadge } from '../engine/maps';
import { ensureArt } from '../render/chibi';
import { DICE_COUNT, preloadDice } from '../render/dice';
import { TOKEN_COUNT, preloadTokens } from '../render/tokens';
import { SOUND_COUNT, preloadSounds } from '../audio/sfx';
import { mapArtUrl } from './mapInfo';

// Carregamento de uma partida: só o que o mapa usa (os personagens em jogo) e, na primeira partida, marcadores,
// dados e sons. Enquanto carrega, aparece a arte do mapa com as Missões.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let common: Promise<void> | null = null;

const TIPS = [
  'Críticos (✷) sempre acertam e rolam mais um dado.',
  'Sair de perto de um Monstro provoca a Reação de Alerta.',
  'Um Monstro que sobrevive ao seu ataque faz a Reação de Vingança.',
  'Descansar restaura as cartas e ressuscita os Heróis mortos.',
  'Extermínio: muitos Ferimentos num só ataque evitam a Vingança.',
  'Ctrl + clique num Espaço marca o lugar para todos verem.',
  'Dois Inimigos no mesmo Espaço bloqueiam a passagem.',
];

/** Mostra a tela do mapa e carrega o que a partida precisa. Resolve quando a tela some. */
export function loadGame(g: Game): Promise<void> {
  const el = document.createElement('div');
  el.id = 'maploading';
  const m = g.map;
  const missions = g.s.missions.map(x => `<li class="${x.kind}"><small>${x.kind === 'pve' ? 'Contra o Jogo' : 'Contra Jogador'}</small><b>${esc(x.name)}</b><span>${esc(x.text)}</span></li>`).join('');
  el.innerHTML = `<div class="ml-bg" style="background-image:url('${mapArtUrl(m.id)}')"></div>
    <div class="ml-box">
      <div class="ml-art"><img src="${mapArtUrl(m.id)}" alt=""/></div>
      <div class="ml-info">
        <div class="ml-circle">${esc(m.circle)} · Monstros Nível ${esc(g.s.level ?? m.level ?? '1')}</div>
        <h2>${esc(m.name)} ${difficultyBadge(m, g.s.level)}</h2>
        <div class="ml-goal">Vence quem cumprir <b>${g.s.missionsToWin}</b> Miss${g.s.missionsToWin > 1 ? 'ões' : 'ão'}</div>
        <ul class="ml-missions">${missions}</ul>
        <div class="ld-bar"><i></i></div>
        <div class="ml-txt">Preparando o mapa…</div>
        <div class="ml-tip">💡 ${TIPS[Math.floor(Math.random() * TIPS.length)]}</div>
      </div>
    </div>`;
  document.body.append(el);
  let total = 0, done = 0;
  const bar = el.querySelector('.ld-bar i') as HTMLElement;
  const txt = el.querySelector('.ml-txt') as HTMLElement;
  const paint = () => {
    bar.style.width = `${total ? Math.round(Math.min(1, done / total) * 100) : 100}%`;
    txt.textContent = total ? `Carregando personagens e efeitos… ${Math.min(done, total)}/${total}` : 'Pronto!';
  };
  const expect = (n: number) => { total += n; paint(); };
  const tick = () => { done++; paint(); };
  paint();
  const jobs: Promise<void>[] = [ensureArt([...new Set(g.units().map(u => u.defId))], tick, expect)];
  if (!common) {
    expect(TOKEN_COUNT + DICE_COUNT + SOUND_COUNT);
    common = Promise.all([preloadTokens(tick), preloadDice(tick), preloadSounds(tick)]).then(() => undefined);
    jobs.push(common);
  } else jobs.push(common);
  const t0 = performance.now();
  return Promise.all(jobs).then(() => new Promise<void>(res => {
    // a tela fica um pouquinho para dar tempo de ler o mapa e as Missões
    const wait = Math.max(0, (total ? 1400 : 900) - (performance.now() - t0));
    setTimeout(() => {
      txt.textContent = 'Pronto!';
      bar.style.width = '100%';
      el.classList.add('out');
      res();
      setTimeout(() => el.remove(), 500);
    }, wait);
  }));
}
