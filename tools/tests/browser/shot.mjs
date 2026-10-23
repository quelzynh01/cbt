// Abre o jogo como um celular deitado, entra no Modo Teste e tira capturas de tela em cada etapa.
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const W = Number(process.argv[3] ?? 844), H = Number(process.argv[4] ?? 390);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: W > H });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await wait(2500);
await shot('01-menu');
await page.tap('#m-test'); await wait(800);
await shot('02-testsetup');
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(2500);
await shot('03-deploy');
// confirma o posicionamento (botão do painel de deploy)
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(2500);
await shot('04-game');
// clica no primeiro Herói da barra
await page.evaluate(() => (document.querySelector('[data-hero]'))?.click()); await wait(800);
await shot('05-select');
await browser.close();
