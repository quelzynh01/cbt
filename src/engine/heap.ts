/** Fila de prioridade (menor primeiro). Empate: quem entrou antes sai antes, igual a `sort` estável + `shift`
 *  (os caminhos e as distâncias saem idênticos aos de antes, só mais rápido). */
export class MinHeap<T> {
  private items: { v: T; p: number; s: number }[] = [];
  private seq = 0;
  get size(): number { return this.items.length; }
  push(v: T, p: number) {
    const a = this.items;
    a.push({ v, p, s: this.seq++ });
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (!this.less(a[i], a[j])) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top.v;
  }
  private less(x: { p: number; s: number }, y: { p: number; s: number }) { return x.p < y.p || (x.p === y.p && x.s < y.s); }
}
