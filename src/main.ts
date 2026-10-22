import './style.css';
import './menu.css';
import './mapinfo.css';
import './cards.css';
import './polish.css';
import './mobile.css';
import { Controller } from './ui/controller';
import { installCardZoom } from './ui/cardview';
installCardZoom();
import { DEFAULT_CURSOR, POINTER_CURSOR } from './render/cursors';

// cursores do jogo em toda a interface
document.documentElement.style.setProperty('--cur-default', DEFAULT_CURSOR);
document.documentElement.style.setProperty('--cur-pointer', POINTER_CURSOR);
import { MenuPages } from './ui/menu';
import { OnlineLobby } from './ui/lobby';
import { CampaignUI } from './ui/campaignUI';
import { gameOptions, recordResult } from './campaign/campaign';
import { preloadArt } from './render/chibi';
import { initMusic, setMusic } from './audio/music';
import { soundWidget } from './audio/widget';
import { hideLoading, loader, showLoading } from './ui/loading';

// ---------------------------------------------------------------- celular: em pé ou deitado
// No primeiro toque o jogo entra em tela cheia (esconde as barras do navegador). Dá para jogar nas duas orientações.
const isTouch = matchMedia('(pointer: coarse)').matches;
document.documentElement.classList.toggle('touch', isTouch);
async function fullscreen() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* sem suporte (iPhone) */ }
}
if (isTouch) window.addEventListener('pointerdown', () => { void fullscreen(); }, { once: true, capture: true });
// a câmera recentraliza quando o celular gira
const portraitMq = matchMedia('(orientation: portrait)');
portraitMq.addEventListener?.('change', () => setTimeout(() => window.dispatchEvent(new Event('resize')), 250));

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const menu = document.getElementById('menu')!;

let controller: Controller | null = null;
const pages = new MenuPages(menu);
const guildLabel = () => { document.getElementById('m-guild')!.textContent = pages.testLabel(); };
pages.onGuildChange = guildLabel;
pages.onMapChange = guildLabel;
guildLabel();

/** Biblioteca / Configurações por cima da partida: ao voltar, retorna ao jogo. */
function overlay(open: (back: () => void) => void) {
  menu.classList.remove('hidden');
  menu.classList.add('over-game');
  open(() => { menu.classList.add('hidden'); menu.classList.remove('over-game'); pages.close(); });
}

function getController(): Controller {
  if (!controller) {
    controller = new Controller(canvas, hud, showMenu);
    controller.openLibrary = () => overlay(back => pages.showLibrary('herois', back, true));
    controller.openSettings = () => overlay(back => { pages.showSettings(); pages.setBack(back); });
    (window as unknown as { cbt: Controller }).cbt = controller; // depuração pelo console
  }
  return controller;
}

function enterGame() {
  setMusic('partida');
  menu.classList.add('hidden');
  menu.classList.remove('over-game');
  hud.classList.remove('hidden');
}

const lobby = new OnlineLobby(menu, pages);
(window as unknown as { cbtLobby: OnlineLobby }).cbtLobby = lobby; // depuração pelo console
lobby.onStart = (state, l, session) => {
  enterGame();
  const ctl = getController();
  ctl.onlineCampaign = session.isHost && lobby.isCampaign ? g => lobby.afterScenario(g) : null;
  ctl.onLobbyBack = back => lobby.resume(back);
  ctl.startOnline(state, l, session);
};
lobby.onReturn = () => {
  controller?.stop();
  document.getElementById('gameover')?.remove();
  setMusic('menu');
  hud.classList.add('hidden');
  menu.classList.remove('hidden', 'over-game');
};

const camp = new CampaignUI(menu, pages);
function backToCampaign() {
  setMusic('menu');
  controller?.stop();
  hud.classList.add('hidden');
  menu.classList.remove('hidden');
  camp.afterScenario();
}
camp.onPlay = mapId => {
  enterGame();
  getController().startCampaign(mapId, gameOptions(camp.c!), game => {
    recordResult(camp.c!, game);
    backToCampaign();
  }, { baseMs: camp.c!.elapsed ?? 0, onExit: backToCampaign, aiLevel: camp.c!.aiLevel ?? 'normal', roulette: camp.c!.played.length === 0, scenario: camp.c!.played.length + 1 });
};

function showMenu() {
  setMusic('menu');
  controller?.stop();
  pages.close();
  lobby.close();
  camp.close();
  menu.classList.remove('hidden', 'over-game');
  hud.classList.add('hidden');
}

document.getElementById('m-test')!.onclick = () => pages.showTestSetup(cfg => {
  enterGame();
  getController().startTest(undefined, cfg);
});
document.getElementById('m-camp')!.onclick = () => camp.open();
document.getElementById('m-online')!.onclick = () => lobby.open();
document.getElementById('m-lib')!.onclick = () => pages.showLibrary('herois');
document.getElementById('m-set')!.onclick = () => pages.showSettings();

hud.classList.add('hidden');

// No início só os retratos (menus); os personagens, marcadores, dados e sons vêm ao entrar numa partida (mapLoading).
// Atalhos: /#teste inicia direto no Modo Teste; /#biblioteca abre a Biblioteca.
showLoading();
initMusic();
setMusic('menu');
menu.querySelector('.menu-box')!.append(soundWidget());
Promise.all([
  preloadArt(loader.tick, loader.expect),
  document.fonts?.ready ?? Promise.resolve(),
]).then(() => {
  hideLoading();
  if (location.hash === '#teste') { enterGame(); getController().startTest(); }
  if (location.hash === '#biblioteca') pages.showLibrary('herois');
  const sala = new URLSearchParams(location.search).get('sala');
  if (sala) lobby.open(sala.toUpperCase());
});
