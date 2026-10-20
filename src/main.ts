import './style.css';
import './menu.css';
import './cards.css';
import { Controller } from './ui/controller';
import { MenuPages } from './ui/menu';
import { OnlineLobby } from './ui/lobby';
import { CampaignUI } from './ui/campaignUI';
import { gameOptions, recordResult } from './campaign/campaign';
import { preloadArt } from './render/chibi';
import { TOKEN_COUNT, preloadTokens } from './render/tokens';
import { DICE_COUNT, preloadDice } from './render/dice';
import { SOUND_COUNT, preloadSounds } from './audio/sfx';
import { initMusic, setMusic } from './audio/music';
import { soundWidget } from './audio/widget';
import { hideLoading, loader, showLoading } from './ui/loading';

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
lobby.onStart = (state, l, session) => {
  enterGame();
  getController().startOnline(state, l, session);
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
  }, { baseMs: camp.c!.elapsed ?? 0, onExit: backToCampaign, aiLevel: camp.c!.aiLevel ?? 'normal' });
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

// Carrega os sprites (PNG) antes de liberar o jogo.
// Atalhos: /#teste inicia direto no Modo Teste; /#biblioteca abre a Biblioteca.
showLoading();
loader.expect(TOKEN_COUNT + DICE_COUNT + SOUND_COUNT);
initMusic();
setMusic('menu');
menu.querySelector('.menu-box')!.append(soundWidget());
Promise.all([
  preloadArt(loader.tick, loader.expect),
  preloadTokens(loader.tick),
  preloadDice(loader.tick),
  preloadSounds(loader.tick),
  document.fonts?.ready ?? Promise.resolve(),
]).then(() => {
  hideLoading();
  if (location.hash === '#teste') { enterGame(); getController().startTest(); }
  if (location.hash === '#biblioteca') pages.showLibrary('herois');
  const sala = new URLSearchParams(location.search).get('sala');
  if (sala) lobby.open(sala.toUpperCase());
});
