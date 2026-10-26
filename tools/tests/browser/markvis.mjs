// Círculo de giz: aparece até o chefe surgir, some enquanto ele está em campo e volta quando ele morre
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
const shot = async (name, cell) => {
  await page.evaluate(c => { const r = window.cbt.renderer; r.camGoal = null; r.focus([c], 1.1); }, cell);
  await wait(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 500, y: 230, width: 400, height: 330 } });
};
// conta pixels "de giz" (quase brancos) na região do círculo
const chalk = name => page.evaluate(async src => {
  const img = new Image(); img.src = src; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
  const d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 228 && d[i + 2] > 205) n++;
  return n;
}, 'data:image/png;base64,' + require_b64(name));
import fs from 'fs';
function require_b64(name) { return fs.readFileSync(`${OUT}/${name}.png`).toString('base64'); }
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'arena-do-sol-brilhante' }); });
await wait(3500);
const cell = await page.evaluate(() => window.cbt.game.bossSpawnCells()[0]);
await shot('vis-1-posicionando', cell);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(6000);
// tira os personagens de cima para medir só o chão
await shot('vis-2-em-campo', cell);
await page.evaluate(() => { const c = window.cbt, g = c.game; const m = g.units().find(u => u.defId.startsWith('minotauro')); m.alive = false; m.cell = null; c.renderer.sync(); });
await wait(500);
await shot('vis-3-morto', cell);
const a = await chalk('vis-1-posicionando'), b = await chalk('vis-2-em-campo'), c3 = await chalk('vis-3-morto');
console.log({ posicionando: a, emCampo: b, morto: c3 });
// antes de surgir e depois de morrer: o chão fica igual (círculo de volta); com o chefe em campo, muda
const diff = (x, y) => page.evaluate(async (s1, s2) => {
  const load = async s => { const im = new Image(); im.src = s; await im.decode(); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const c = cv.getContext('2d'); c.drawImage(im, 0, 0); return c.getImageData(0, 0, cv.width, cv.height).data; };
  const A = await load(s1), B = await load(s2); let n = 0;
  for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 60) n++;
  return n / (A.length / 4);
}, 'data:image/png;base64,' + require_b64(x), 'data:image/png;base64,' + require_b64(y));
const d13 = await diff('vis-1-posicionando', 'vis-3-morto'), d12 = await diff('vis-1-posicionando', 'vis-2-em-campo');
console.log({ antesXmorto: d13.toFixed(3), antesXemCampo: d12.toFixed(3) });
console.log(d13 < 0.08 && d12 > 0.2 ? 'CÍRCULO SOME E VOLTA OK' : 'FALHOU');
// Irmãs com aura no Alquimista e círculo do Viveiro no meio
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'distrito-do-alquimista' }); });
await wait(3500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(6500);
const sis = await page.evaluate(() => window.cbt.game.units().filter(u => /^irma_/.test(u.defId)).map(u => u.cell));
await shot('aura-irmas', sis[0]);
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'viveiro-das-aguias' }); });
await wait(3500);
await shot('vis-viveiro', { c: 0, r: 5 });
await browser.close();
