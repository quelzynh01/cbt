// Seth mata com magia: som próprio e alvo se desfazendo; sem magia, ou outro Herói, não. Gemido ao morrer: masculino/feminino (PORT=)
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] ?? '.';
const PORT = process.env.PORT ?? '5199';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
let errors = 0;
page.on('pageerror', e => { errors++; console.log('PAGEERR', e.message); });
const wait = ms => new Promise(r => setTimeout(r, ms));
await page.evaluateOnNewDocument(() => {
  window.__sounds = [];
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { window.__sounds.push(this.src.split('/').pop()); return play.call(this); };
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });
await wait(2000);
await page.click('#m-test'); await wait(800);
await page.evaluate(() => document.querySelector('#ts-start')?.click()); await wait(3000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Pronto|Começar|Confirmar/i.test(x.textContent || '')); b?.click(); });
await wait(1000);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Sim, terminar/i.test(x.textContent || '')); b?.click(); });
await wait(2500);
await page.evaluate(() => document.body.click());

/** Ataque seguido da morte, pela fila de eventos (como vem do anfitrião). */
async function kill(attacker, cardName, target, shot) {
  const res = await page.evaluate((attacker, cardName, target) => {
    const c = window.cbt, r = c.renderer, g = c.game;
    const heroes = g.units().filter(u => u.kind === 'hero' && u.alive && u.cell);
    const a = heroes[0];
    const t = target === 'monster' ? g.units().find(u => u.kind === 'monster' && u.alive && u.cell) : heroes[1];
    if (target !== 'monster') { t.defId = target; r.units.get(t.id).defId = target; }
    a.defId = attacker; r.units.get(a.id).defId = attacker;
    r.focus?.([t.cell]); r.cam.zoom = 1.5; { const q = r.unitScreenPos(t.id); r.cam.x += 700 - q.x; r.cam.y += 480 - q.y; }
    window.__sounds.length = 0;
    const ms = r.animateAttack({ attackerId: a.id, cardName, attackType: 'ranged', targets: [{ id: t.id }], hits: 3 });
    return { ms, id: t.id };
  }, attacker, cardName, target);
  await wait(res.ms + 100);
  await page.evaluate(id => window.cbt.renderer.enqueue([{ t: 'death', id }]), res.id);
  await wait(420);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}_1.png` });
  await wait(650);
  if (shot) await page.screenshot({ path: `${OUT}/${shot}_2.png` });
  await wait(1100);
  const sounds = await page.evaluate(() => window.__sounds.slice());
  // revive a vista para o próximo caso
  await page.evaluate(id => { window.cbt.renderer.sync(); const v = window.cbt.renderer.units.get(id); v.alpha = 1; v.fade = null; }, res.id);
  return sounds;
}
const check = (name, ok, got) => { console.log(ok ? 'ok ' : 'FALHOU', name, got.join(',')); if (!ok) errors++; };

let s = await kill('seth', 'Raio Nova', 'monster', 'seth_mata');
check('Seth + magia em Monstro', s.includes('atack-seth-kill.mp3') && !s.some(x => x.startsWith('grunt')), s);
s = await kill('seth', 'Arco Crescente', 'monster');
check('Seth sem magia', !s.includes('atack-seth-kill.mp3'), s);
s = await kill('maya', 'Raio Nova', 'monster');
check('outro Herói com magia', !s.includes('atack-seth-kill.mp3'), s);
s = await kill('grom', 'Lâmina Confiável', 'zazu');
check('Herói morre: masculino', s.includes('grunt-male.mp3'), s);
s = await kill('grom', 'Lâmina Confiável', 'maya');
check('Heroína morre: feminino', s.includes('grunt-female.mp3'), s);
s = await kill('seth', 'Raio Nova', 'diva');
check('Seth mata Heroína: os dois sons', s.includes('atack-seth-kill.mp3') && s.includes('grunt-female.mp3'), s);
console.log(errors ? 'FALHOU' : 'SETH E MORTES OK');
await browser.close();
