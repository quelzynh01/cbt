// IA com busca no navegador: Worker principal sozinho x com auxiliares (MessagePort). Mesma partida, mesmo tempo de busca:
// conta as simulações por jogada e confere que as respostas chegam sem erro. HELPERS=lista (padrão 0,3); MS=tempo da busca
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
page.on('console', m => { if (/IA|worker|auxiliar/i.test(m.text())) console.log('CONSOLE', m.text()); });
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto(`http://localhost:${process.env.PORT ?? 5199}/`, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.setItem('cbt.settings', JSON.stringify({ battle: 'never', music: false, sound: false })); localStorage.setItem('cbt.test', JSON.stringify({ mapId: 'portao-da-lua', teams: [{ guild: 'azul', controller: 'human' }, { guild: 'vermelho', controller: 'human' }] })); });
await page.reload({ waitUntil: 'networkidle0' }); await wait(800);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(4000);
for (let k = 0; k < 2; k++) { await page.evaluate(() => { document.querySelector('.rl-go')?.click(); document.querySelector('#dp-ok')?.click(); }); await wait(700); await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Sim, terminar/.test(b.textContent))?.click()); await wait(2000); }
const res = await page.evaluate(async (helpersList, ms) => {
  const { AIBrain } = await import('/src/ai/brain.ts');
  const { SEARCH_OPTS } = await import('/src/ai/search.ts');
  const c = window.cbt, st = JSON.parse(JSON.stringify(c.game.s)), gid = c.game.currentGuild().id;
  const out = {};
  for (const h of helpersList) {
    const b = new AIBrain({ ...SEARCH_OPTS, timeMs: ms, maxSamples: 100000 }, h);
    await new Promise(r => setTimeout(r, 1500)); // Workers carregando
    const samples = [], acts = [];
    for (let i = 0; i < 4; i++) { const t = performance.now(); const a = await b.next(gid, st); acts.push(a?.type + ' ' + Math.round(performance.now() - t) + 'ms'); samples.push(b.lastSamples); b.reset(); }
    out[h] = { auxiliares: b.helperWorkers, simulacoes: samples, acoes: acts };
  }
  return out;
}, (process.env.HELPERS ?? '0,3').split(',').map(Number), Number(process.env.MS ?? 1500));
console.log(JSON.stringify(res, null, 1));
const v = Object.values(res).map(r => r.simulacoes.reduce((a, b) => a + b, 0) / r.simulacoes.length);
console.log(v.length > 1 && v.at(-1) > v[0] * 1.8 ? `AUXILIARES OK (${v.map(x => x.toFixed(0)).join(' -> ')} simulações por busca)` : 'FALHOU');
await browser.close();
