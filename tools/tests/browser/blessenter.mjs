// Bênção do Hobsbawm: clicar no Aliado (para ver) e apertar Enter NÃO pode ativar ele (Enter encerra o turno);
// ativar de propósito (botão Ativar) funciona e, depois da invocação da Sombra, o Herói ainda anda
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
page.on('pageerror', e => console.log('PAGEERR', e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const c = window.cbt; c.startTest(undefined, { ...c.testCfg, mapId: 'praca-da-aurora-vermelha', heroes: ['hobsbawm', 'johan', 'maya'] }); });
await wait(3500);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(4000);
const setBless = () => page.evaluate(() => {
  const c = window.cbt, g = c.game;
  const [hob, johan] = g.heroesOf(g.currentGuild().id);
  for (const u of g.units()) if (u.kind === 'monster' && u.cell && ((u.cell.c === 0 && u.cell.r === 4) || (u.cell.c === 1 && u.cell.r === 4))) { u.cell = null; u.alive = false; }
  johan.cell = { c: 0, r: 4 }; hob.cell = { c: 1, r: 4 };
  g.s.activation = null; g.s.activatedThisTurn = [];
  c.renderer.sync();
  c.act({ type: 'activate', heroId: hob.id });
  g.s.activation.attacked = true; g.s.activation.mp = 0; g.s.blessing = { heroId: hob.id };
  c.renderer.focus([johan.cell], 1);
  c.refresh();
  return { johan: johan.id, hob: hob.id };
});
const ids = await setBless();
await wait(800);
// clica no Johan (para ver) e aperta Enter
const p = await page.evaluate(id => window.cbt.renderer.unitScreenPos(id), ids.johan);
await page.mouse.click(p.x, p.y - 30);
await wait(500);
const sel = await page.evaluate(() => ({ pend: window.cbt.hud.pendingActivate, insp: window.cbt.hud.inspected }));
await page.keyboard.press('Enter');
await wait(1500);
const afterEnter = await page.evaluate(id => ({ endAsk: document.getElementById('confirmbox').innerText.slice(0, 60), act: window.cbt.game.s.activation?.heroId ?? null, confirm: !document.getElementById('confirmbox').classList.contains('hidden'), johanAct: window.cbt.game.s.activation?.heroId === id }), ids.johan);
console.log('clicou no Johan:', JSON.stringify(sel), '| depois do Enter:', JSON.stringify(afterEnter));
await page.evaluate(() => { document.getElementById('cf-no')?.click(); });
await wait(500);
// ativa de propósito: botão Ativar
await page.evaluate(id => { const c = window.cbt; c.hud.pendingActivate = id; c.refresh(); }, ids.johan);
await wait(400);
await page.evaluate(() => document.getElementById('btn-act')?.click() || document.getElementById('ap-go')?.click());
await wait(6500);
const st = await page.evaluate(id => { const c = window.cbt, g = c.game; return { act: g.s.activation?.heroId, busy: c.renderer.busy, moves: c.renderer.hl.move.size, canMove: g.canMove() }; }, ids.johan);
console.log('ativou pelo botão:', JSON.stringify(st));
await page.evaluate(() => { const r = window.cbt.renderer; const k = [...r.hl.move.keys()][0]; if (!k) return; const [c, rr] = k.split(',').map(Number); r.camGoal = null; r.focus([{ c, r: rr }], 1); });
await wait(600);
const cell = await page.evaluate(() => { const k = [...window.cbt.renderer.hl.move.keys()][0]; if (!k) return null; const [c, r] = k.split(',').map(Number); return window.cbt.renderer.cellScreenPos({ c, r }); });
if (cell) { await page.mouse.click(cell.x, cell.y + 10); await wait(600); await page.evaluate(() => document.querySelector('#clickmenu .cm-opt.move')?.click()); await wait(700); await page.evaluate(() => document.getElementById('cf-yes')?.click()); }
await wait(2500);
const moved = await page.evaluate(id => { const v = window.cbt.game.unit(id); return v.cell; }, ids.johan);
await page.screenshot({ path: `${OUT}/bless-after.png` });
console.log('Johan depois de tentar andar:', JSON.stringify(moved));
console.log(!afterEnter.johanAct && st.act === ids.johan && st.moves > 0 && !(moved.c === 0 && moved.r === 4) ? 'BÊNÇÃO SEM ATIVAR SEM QUERER OK' : 'FALHOU');
await browser.close();
