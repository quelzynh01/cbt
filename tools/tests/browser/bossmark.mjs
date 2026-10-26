// Círculo de invocação (giz) no chão onde os chefes surgem
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
for (const map of ['arena-do-sol-brilhante', 'templo-do-amanhecer-crepuscular', 'mansao']) {
  await page.evaluate(m => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: m }); }, map);
  await wait(3500);
  // ainda no posicionamento (o chefe escondido): o círculo aparece sozinho
  const cells = await page.evaluate(() => { const c = window.cbt; const cs = c.game.bossSpawnCells(); c.renderer.camGoal = null; c.renderer.focus([cs[0]], 1.1); return cs; });
  await wait(700);
  await page.screenshot({ path: `${OUT}/mark-${map}.png`, clip: { x: 500, y: 230, width: 400, height: 330 } });
  console.log(map, JSON.stringify(cells));
}
await browser.close();
