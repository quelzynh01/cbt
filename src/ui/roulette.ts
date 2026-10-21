import { play } from '../audio/sfx';

// Roleta de quem começa (1º cenário da campanha e partidas avulsas: o jogador inicial é sorteado, p.14).
// O sorteio já foi feito pelo jogo (ordem dos turnos); a roleta só mostra o resultado, girando até parar nele.

export interface RouletteEntry { name: string; color: string }

export function showRoulette(entries: RouletteEntry[], winner: number): Promise<void> {
  document.getElementById('roulette')?.remove();
  const el = document.createElement('div');
  el.id = 'roulette';
  el.innerHTML = `<div class="rl-box">
      <div class="rl-title">🎲 Quem começa?</div>
      <div class="rl-wheel"><canvas width="560" height="560"></canvas><div class="rl-pin"></div><div class="rl-hub">CBT</div></div>
      <div class="rl-result"></div>
      <button class="primary rl-go hidden">▶ Começar</button>
    </div>`;
  document.body.append(el);
  const cv = el.querySelector('canvas') as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  const n = entries.length;
  const seg = (Math.PI * 2) / n;
  const R = cv.width / 2;
  const draw = (rot: number) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(rot);
    entries.forEach((e, i) => {
      const a0 = i * seg - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R - 8, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = e.color;
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#2a1606';
      ctx.stroke();
      // nome no meio da fatia
      ctx.save();
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${n > 3 ? 30 : 34}px "Baloo 2", system-ui, sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.strokeText(e.name, R - 34, 0);
      ctx.fillStyle = '#fff';
      ctx.fillText(e.name, R - 34, 0);
      ctx.restore();
    });
    ctx.beginPath();
    ctx.arc(0, 0, R - 8, 0, Math.PI * 2);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#f0c243';
    ctx.stroke();
    ctx.restore();
  };
  // gira várias voltas e para com o meio da fatia vencedora debaixo do ponteiro (topo)
  const jitter = (Math.random() - 0.5) * seg * 0.6;
  const target = Math.PI * 2 * (5 + Math.floor(Math.random() * 2)) - (winner * seg + seg / 2) + jitter;
  const dur = 4200;
  const t0 = performance.now();
  let lastTick = -1;
  return new Promise(res => {
    const frame = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const ease = 1 - Math.pow(1 - k, 4);
      const rot = target * ease;
      draw(rot);
      // "tic" a cada fatia que passa pelo ponteiro
      const tick = Math.floor((rot + seg / 2) / seg);
      if (tick !== lastTick) { lastTick = tick; if (k < 0.97) play('dice', 0.25); }
      if (k < 1) { requestAnimationFrame(frame); return; }
      const w = entries[winner];
      const result = el.querySelector('.rl-result') as HTMLElement;
      result.innerHTML = `<span style="color:${w.color}">●</span> <b>${w.name}</b> começa!`;
      result.classList.add('show');
      play('gold');
      const go = el.querySelector('.rl-go') as HTMLElement;
      go.classList.remove('hidden');
      const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); res(); };
      go.onclick = close;
      go.focus();
      // fecha sozinha depois de um tempo (ninguém fica preso na roleta)
      setTimeout(() => { if (document.body.contains(el)) close(); }, 4500);
    };
    requestAnimationFrame(frame);
  });
}
