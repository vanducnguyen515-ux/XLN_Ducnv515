'use strict';
/* ==========================================================================
   SimXLNT – Biểu đồ đường đơn giản trên canvas (không phụ thuộc thư viện)
   ========================================================================== */
const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563', '#65a30d', '#ea580c'];

function niceTicks(lo, hi, n = 5) {
  if (!isFinite(lo) || !isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-12) { const d = Math.abs(hi) * 0.1 || 1; lo -= d; hi += d; }
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const st = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || 10 * mag;
  const out = [];
  const end = Math.ceil(hi / st - 1e-9) * st;
  for (let v = Math.floor(lo / st) * st; v <= end + st * 1e-6; v += st) out.push(+v.toPrecision(12));
  return out;
}
function fmtTick(v) {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
  return (+v.toPrecision(6)).toLocaleString('vi-VN', { maximumFractionDigits: 4 });
}

class LineChart {
  constructor(canvas, opt = {}) {
    this.c = canvas; this.opt = opt; this.series = []; this.hover = null;
    canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.draw(); });
    canvas.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
    this._ro = new ResizeObserver(() => this.draw());
    this._ro.observe(canvas);
  }
  set(series, opt) { this.series = series || []; if (opt) Object.assign(this.opt, opt); this.draw(); }
  draw() {
    const c = this.c, dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth || 600, H = c.clientHeight || 300;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#111', mute = css.getPropertyValue('--mute').trim() || '#666', grid = css.getPropertyValue('--grid').trim() || '#e5e7eb';
    const S = this.series.filter(s => s.x && s.x.length);
    const S2 = S.filter(s => s.y2), has2 = S2.length > 0 && S2.length < S.length;   // trục tung phụ (phải) khi có cả hai nhóm
    g.font = '12px system-ui, sans-serif';
    // số dòng chú giải (nhiều chuỗi → đẩy vùng vẽ xuống)
    const lgLab = s => (s.label || '') + (has2 && s.y2 ? ' ▸' : '');
    let rows = 1; { let lx = 68; for (const s of S) { if (s.nolegend) continue; const w = g.measureText(lgLab(s)).width + 26; if (lx + w > W - 16) { lx = 68; rows++; } lx += w + 8; } }
    const L = 64, R = has2 ? 66 : 16, T = 28 + (rows - 1) * 16, B = 40;
    const pw = W - L - R, ph = H - T - B;
    if (!S.length) { g.fillStyle = mute; g.fillText(this.opt.empty || 'Chưa có dữ liệu', L, T + 20); return; }
    let x0 = Infinity, x1 = -Infinity;
    const rng = list => { let a = Infinity, b = -Infinity; for (const s of list) for (let i = 0; i < s.x.length; i++) { const yv = s.y[i]; if (!isFinite(yv)) continue; if (yv < a) a = yv; if (yv > b) b = yv; } return [a, b]; };
    for (const s of S) for (let i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i])) continue; const xv = s.x[i]; if (xv < x0) x0 = xv; if (xv > x1) x1 = xv; }
    let [y0, y1] = rng(has2 ? S.filter(s => !s.y2) : S);
    if (!isFinite(y0)) { y0 = 0; y1 = 1; }
    if (this.opt.xmin !== undefined) x0 = this.opt.xmin; if (this.opt.xmax !== undefined) x1 = this.opt.xmax;
    if (this.opt.ymin !== undefined) y0 = this.opt.ymin; else if (y0 > 0 && this.opt.zero !== false) y0 = 0;
    if (this.opt.ymax !== undefined) y1 = this.opt.ymax; else if (this.opt.headroom) y1 += (y1 - y0) * this.opt.headroom;   // chừa khoảng trống phía trên (đường giới hạn không trùng khung)
    const nY = Math.max(2, Math.floor(ph / 45));
    const xt = this.opt.xcats ? this.opt.xcats.map((_, i) => i) : niceTicks(x0, x1, Math.max(2, Math.floor(pw / 90))), yt = niceTicks(y0, y1, nY);
    if (this.opt.xcats) { x0 = -0.3; x1 = this.opt.xcats.length - 0.7; }
    else { if (this.opt.xmin === undefined) x0 = Math.min(x0, xt[0]); if (this.opt.xmax === undefined) x1 = Math.max(x1, xt[xt.length - 1]); }
    y0 = Math.min(y0, yt[0]); y1 = Math.max(y1, yt[yt.length - 1]);
    if (x1 === x0) x1 = x0 + 1; if (y1 === y0) y1 = y0 + 1;
    let z0 = 0, z1 = 1, zt = [];
    if (has2) {
      [z0, z1] = rng(S2);
      if (z0 > 0 && this.opt.zero !== false) z0 = 0;
      if (this.opt.headroom) z1 += (z1 - z0) * this.opt.headroom;
      zt =niceTicks(z0, z1, nY); z0 = Math.min(z0, zt[0]); z1 = Math.max(z1, zt[zt.length - 1]); if (z1 === z0) z1 = z0 + 1;
    }
    const X = v => L + (v - x0) / (x1 - x0) * pw, Y = v => T + ph - (v - y0) / (y1 - y0) * ph, Z = v => T + ph - (v - z0) / (z1 - z0) * ph;
    const YY = s => (has2 && s.y2 ? Z : Y);
    // lưới
    g.strokeStyle = grid; g.lineWidth = 1; g.fillStyle = mute; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of yt) { if (v < y0 - 1e-9 || v > y1 + 1e-9) continue; const yy = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(L, yy); g.lineTo(L + pw, yy); g.stroke(); g.fillText(fmtTick(v), L - 6, yy); }
    if (has2) { g.textAlign = 'left'; for (const v of zt) { if (v < z0 - 1e-9 || v > z1 + 1e-9) continue; const yy = Math.round(Z(v)) + 0.5; g.beginPath(); g.moveTo(L + pw, yy); g.lineTo(L + pw + 4, yy); g.stroke(); g.fillText(fmtTick(v), L + pw + 7, yy); } }
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (const v of xt) {
      if (v < x0 - 1e-9 || v > x1 + 1e-9) continue; const xx = Math.round(X(v)) + 0.5; g.beginPath(); g.moveTo(xx, T); g.lineTo(xx, T + ph); g.stroke();
      g.fillText(this.opt.xcats ? String(this.opt.xcats[v]).slice(0, Math.max(6, Math.floor(pw / xt.length / 6.5))) : fmtTick(v), xx, T + ph + 6);
    }
    g.strokeStyle = mute; g.strokeRect(L + 0.5, T + 0.5, pw, ph);
    // nhãn trục
    g.fillStyle = mute; g.textAlign = 'center';
    if (this.opt.xlabel) g.fillText(this.opt.xlabel, L + pw / 2, H - 16);
    if (this.opt.ylabel) { g.save(); g.translate(14, T + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(this.opt.ylabel, 0, 0); g.restore(); }
    if (has2 && this.opt.y2label) { g.save(); g.translate(W - 12, T + ph / 2); g.rotate(Math.PI / 2); g.textBaseline = 'middle'; g.fillText(this.opt.y2label, 0, 0); g.restore(); }
    // chuỗi
    g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    S.forEach((s, k) => {
      const col = s.color || PALETTE[k % PALETTE.length], Yf = YY(s);
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = s.width || 2;
      g.setLineDash(s.dash || []);
      if (s.points) {
        for (let i = 0; i < s.x.length; i++) { g.beginPath(); g.arc(X(s.x[i]), Yf(s.y[i]), s.r || 4, 0, 7); g.fill(); }
      } else {
        g.beginPath(); let pen = false;
        for (let i = 0; i < s.x.length; i++) {
          if (!isFinite(s.y[i])) { pen = false; continue; }
          const px = X(s.x[i]), py = Yf(s.y[i]);
          if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py);
        }
        g.stroke();
        g.setLineDash([]);
        if (s.marks) for (let i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i])) continue; g.beginPath(); if (s.y2 && has2) g.rect(X(s.x[i]) - 2.5, Yf(s.y[i]) - 2.5, 5, 5); else g.arc(X(s.x[i]), Yf(s.y[i]), 2.8, 0, 7); g.fill(); }
      }
    });
    g.restore(); g.setLineDash([]);
    // chú giải
    g.textAlign = 'left'; g.textBaseline = 'middle';
    let lx = L + 4, ly = 12;
    S.forEach((s, k) => {
      if (s.nolegend) return;
      const col = s.color || PALETTE[k % PALETTE.length];
      const w = g.measureText(lgLab(s)).width + 26;
      if (lx + w > W - 16) { lx = L + 4; ly += 16; }
      g.fillStyle = col;
      if (s.dash && s.dash.length) { for (let d = 0; d < 14; d += 5) g.fillRect(lx + d, ly - 1, 3, 3); } else g.fillRect(lx, ly - 2, 14, 4);
      g.fillStyle = ink; g.fillText(lgLab(s), lx + 18, ly);
      lx += w + 8;
    });
    // con trỏ
    if (this.hover && this.hover.x >= L && this.hover.x <= L + pw && this.hover.y >= T && this.hover.y <= T + ph) {
      const xv = x0 + (this.hover.x - L) / pw * (x1 - x0);
      g.strokeStyle = mute; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(this.hover.x, T); g.lineTo(this.hover.x, T + ph); g.stroke(); g.setLineDash([]);
      const lines = [(this.opt.xlabel || 'x') + ': ' + (this.opt.xcats ? (this.opt.xcats[Math.round(xv)] ?? '') : fmtTick(xv))];
      S.forEach((s, k) => {
        if (s.points || s.nolegend) return;
        let bi = 0, bd = Infinity;
        for (let i = 0; i < s.x.length; i++) { const d = Math.abs(s.x[i] - xv); if (d < bd) { bd = d; bi = i; } }
        const raw = s.raw ? s.raw[bi] : null;
        lines.push([s.label, fmtTick(s.y[bi]) + (raw != null && isFinite(raw) ? ' (' + fmtTick(raw) + (s.rawU ? ' ' + s.rawU : '') + ')' : ''), s.color || PALETTE[k % PALETTE.length]]);
        if (isFinite(s.y[bi])) { g.fillStyle = s.color || PALETTE[k % PALETTE.length]; g.beginPath(); g.arc(X(s.x[bi]), YY(s)(s.y[bi]), 3.5, 0, 7); g.fill(); }
      });
      const bw = Math.max(...lines.map(l => g.measureText(typeof l === 'string' ? l : l[0] + ': ' + l[1]).width)) + 20, bh = lines.length * 16 + 8;
      let bx = this.hover.x + 12, by = T + 8;
      if (bx + bw > W - 4) bx = this.hover.x - bw - 12;
      g.fillStyle = css.getPropertyValue('--panel').trim() || '#fff'; g.strokeStyle = grid;
      g.fillRect(bx, by, bw, bh); g.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      lines.forEach((l, i) => {
        const yy = by + 12 + i * 16;
        if (typeof l === 'string') { g.fillStyle = mute; g.fillText(l, bx + 8, yy); }
        else { g.fillStyle = l[2]; g.fillRect(bx + 8, yy - 1, 8, 3); g.fillStyle = ink; g.fillText(l[0] + ': ' + l[1], bx + 20, yy); }
      });
    }
  }
}
