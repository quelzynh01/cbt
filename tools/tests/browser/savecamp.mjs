// Campanha local: sai no meio do cenário e continua de onde parou.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1300, height: 820 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await page.evaluate(c => { localStorage.setItem('cbt.campaign', c); localStorage.setItem('cbt.settings', JSON.stringify({ battle: 'never' })); }, fs.readFileSync(new URL('./hub_ai.json', import.meta.url), 'utf8'));
await page.reload({ waitUntil: 'networkidle0' }); await wait(900);
await page.evaluate(() => document.querySelector('#m-camp').click()); await wait(900);
await page.evaluate(() => document.querySelector('#cp-go').click()); await wait(5000);
await page.evaluate(() => { document.querySelector('.rl-go')?.click(); }); await wait(500);
const mark = await page.evaluate(() => { const g = window.cbt.game; g.s.turn = 4; g.guild(g.s.guildOrder[0]).coins = 9; return { map: g.s.mapId, turn: 4, coins: 9, guild: g.s.guildOrder[0] }; });
await wait(3500);
// fecha a aba "de repente" (recarrega)
await page.reload({ waitUntil: 'networkidle0' }); await wait(900);
await page.evaluate(() => document.querySelector('#m-camp').click()); await wait(900);
console.log('botão:', await page.evaluate(() => document.querySelector('#cp-go')?.textContent));
await page.screenshot({ path: `${OUT}/c1-hub.png` });
await page.evaluate(() => document.querySelector('#cp-go').click()); await wait(600);
await page.screenshot({ path: `${OUT}/c2-ask.png` });
await page.evaluate(() => document.querySelector('.gd-yes').click()); await wait(4000);
const after = await page.evaluate(g0 => { const g = window.cbt.game; return { map: g.s.mapId, turn: g.s.turn, coins: g.guild(g0).coins }; }, mark.guild);
console.log('antes', JSON.stringify(mark), 'depois', JSON.stringify(after));
await page.screenshot({ path: `${OUT}/c3-game.png` });
await browser.close();
