'use strict';
/* ==========================================================================
   SimXLNT – Biểu đồ bổ sung: cột nhóm (so sánh kịch bản), bản đồ màu 2 chiều (2 thông số)
   ========================================================================== */

/* ---------------- biểu đồ cột nhóm: danh mục (kịch bản) × chuỗi (chỉ tiêu) ---------------- */
class BarChart {
  constructor(canvas, opt = {}) {
    this.c = canvas; this.opt = opt; this.d = null; this.hover = null;
    canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.draw(); });
    canvas.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
    this._ro = new ResizeObserver(() => this.draw()); this._ro.observe(canvas);
  }
  set(d, opt) { this.d = d; if (opt) Object.assign(this.opt, opt); this.draw(); }
  draw() {
    const c = this.c, dpr = window.devicePixelRatio || 1, W = c.clientWidth || 600, H = c.clientHeight || 300;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#111', mute = css.getPropertyValue('--mute').trim() || '#666', grid = css.getPropertyValue('--grid').trim() || '#e5e7eb';
    g.font = '12px system-ui, sans-serif';
    const d = this.d;
    if (!d || !d.cats.length || !d.series.length) { g.fillStyle = mute; g.fillText(this.opt.empty || 'Chưa có dữ liệu', 64, 40); return; }
    let rows = 1; { let lx = 68; for (const s of d.series) { const w = g.measureText(s.label).width + 26; if (lx + w > W - 16) { lx = 68; rows++; } lx += w + 8; } }
    const L = 64, R = 16, T = 28 + (rows - 1) * 16, B = 46, pw = W - L - R, ph = H - T - B;
    let y1 = -Infinity, ymn = Infinity;
    for (const s of d.series) for (const v of s.v) if (isFinite(v)) { y1 = Math.max(y1, v); ymn = Math.min(ymn, v); }
    if (!isFinite(y1)) { y1 = 1; ymn = 0; }
    if (this.opt.ref !== undefined) y1 = Math.max(y1, this.opt.ref);
    let y0 = Math.min(0, ymn);
    y1 += (y1 - y0) * 0.06;   // chừa khoảng trống trên đỉnh cột cao nhất
    const yt = niceTicks(y0, y1,Math.max(2, Math.floor(ph / 45))); y0 = yt[0]; y1 = yt[yt.length - 1];
    const Y = v => T + ph - (v - y0) / (y1 - y0) * ph;
    g.strokeStyle = grid; g.fillStyle = mute; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const v of yt) { const yy = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(L, yy); g.lineTo(L + pw, yy); g.stroke(); g.fillText(fmtTick(v), L - 6, yy); }
    g.strokeStyle = mute; g.strokeRect(L + 0.5, T + 0.5, pw, ph);
    if (this.opt.ylabel) { g.save(); g.translate(14, T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText(this.opt.ylabel, 0, 0); g.restore(); }
    const nc = d.cats.length, ns = d.series.length, cw = pw / nc, bw = Math.max(2, Math.min(28, cw * 0.8 / ns));
    const hovC = this.hover && this.hover.x > L && this.hover.x < L + pw && this.hover.y > T && this.hover.y < T + ph ? Math.floor((this.hover.x - L) / cw) : -1;
    g.textAlign = 'center'; g.textBaseline = 'top';
    d.cats.forEach((cat, i) => {
      const cx = L + cw * (i + 0.5), x0 = cx - bw * ns / 2;
      if (i === hovC) { g.fillStyle = grid; g.globalAlpha = 0.5; g.fillRect(L + cw * i, T, cw, ph); g.globalAlpha = 1; }
      d.series.forEach((s, k) => {
        const v = s.v[i]; if (!isFinite(v)) return;
        g.fillStyle = s.color || PALETTE[k % PALETTE.length];
        const ya = Y(Math.max(v, 0)), yb = Y(Math.min(v, 0));
        g.fillRect(x0 + k * bw + 1, ya, bw - 2, Math.max(1, yb - ya));
      });
      g.fillStyle = mute; g.fillText(String(cat).slice(0, Math.max(5, Math.floor(cw / 6.5))), cx, T + ph + 6);
    });
    if (this.opt.ref !== undefined) { g.strokeStyle = ink; g.setLineDash([5, 3]); const yy = Y(this.opt.ref) + 0.5; g.beginPath(); g.moveTo(L, yy); g.lineTo(L + pw, yy); g.stroke(); g.setLineDash([]); }
    g.textAlign = 'left'; g.textBaseline = 'middle';
    let lx = L + 4, ly = 12;
    d.series.forEach((s, k) => { const w = g.measureText(s.label).width + 26; if (lx + w > W - 16) { lx = L + 4; ly += 16; } g.fillStyle = s.color || PALETTE[k % PALETTE.length]; g.fillRect(lx, ly - 5, 12, 10); g.fillStyle = ink; g.fillText(s.label, lx + 16, ly); lx += w + 8; });
    if (hovC >= 0 && hovC < nc) {
      const lines = [String(d.cats[hovC])].concat(d.series.map((s, k) => [s.label, fmtTick(s.v[hovC]) + (s.raw && isFinite(s.raw[hovC]) ? ' (' + fmtTick(s.raw[hovC]) + (s.rawU ? ' ' + s.rawU : '') + ')' : ''), s.color || PALETTE[k % PALETTE.length]]));
      const bwid = Math.max(...lines.map(l => g.measureText(typeof l === 'string' ? l : l[0] + ': ' + l[1]).width)) + 22, bh = lines.length * 16 + 8;
      let bx = this.hover.x + 12, by = T + 8; if (bx + bwid > W - 4) bx = this.hover.x - bwid - 12;
      g.fillStyle = css.getPropertyValue('--panel').trim() || '#fff'; g.strokeStyle = grid; g.fillRect(bx, by, bwid, bh); g.strokeRect(bx + 0.5, by + 0.5, bwid, bh);
      lines.forEach((l, i) => { const yy = by + 12 + i * 16; if (typeof l === 'string') { g.fillStyle = mute; g.fillText(l, bx + 8, yy); } else { g.fillStyle = l[2]; g.fillRect(bx + 8, yy - 4, 8, 8); g.fillStyle = ink; g.fillText(l[0] + ': ' + l[1], bx + 20, yy); } });
    }
  }
}

/* ---------------- bản đồ màu 2 chiều z(x, y) trên lưới ---------------- */
const HEAT_STOPS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];   // dải màu kiểu viridis
function heatColor(t) {
  t = Math.min(Math.max(t, 0), 1) * (HEAT_STOPS.length - 1);
  const i = Math.min(Math.floor(t), HEAT_STOPS.length - 2), f = t - i, a = HEAT_STOPS[i], b = HEAT_STOPS[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
class HeatMap {
  constructor(canvas, opt = {}) {
    this.c = canvas; this.opt = opt; this.d = null; this.hover = null;
    canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; this.draw(); });
    canvas.addEventListener('mouseleave', () => { this.hover = null; this.draw(); });
    this._ro = new ResizeObserver(() => this.draw()); this._ro.observe(canvas);
  }
  set(d, opt) { this.d = d; if (opt) Object.assign(this.opt, opt); this.draw(); }
  draw() {
    const c = this.c, dpr = window.devicePixelRatio || 1, W = c.clientWidth || 600, H = c.clientHeight || 300;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--ink').trim() || '#111', mute = css.getPropertyValue('--mute').trim() || '#666';
    g.font = '12px system-ui, sans-serif';
    const d = this.d;
    if (!d || !d.xs.length || !d.ys.length) { g.fillStyle = mute; g.fillText('Chưa có dữ liệu', 64, 40); return; }
    const L = 70, R = 84, T = 24, B = 44, pw = W - L - R, ph = H - T - B, nx = d.xs.length, ny = d.ys.length, cw = pw / nx, chh = ph / ny;
    let z0 = Infinity, z1 = -Infinity;
    for (const row of d.z) for (const v of row) if (isFinite(v)) { z0 = Math.min(z0, v); z1 = Math.max(z1, v); }
    if (!isFinite(z0)) { z0 = 0; z1 = 1; } if (z1 === z0) z1 = z0 + 1e-9;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const v = d.z[iy] ? d.z[iy][ix] : NaN, x = L + ix * cw, y = T + ph - (iy + 1) * chh;
      g.fillStyle = isFinite(v) ? heatColor((v - z0) / (z1 - z0)) : '#e5e7eb'; g.fillRect(x, y, cw + 0.5, chh + 0.5);
      if (isFinite(v) && cw > 42 && chh > 16) { const t = (v - z0) / (z1 - z0); g.fillStyle = t > 0.6 ? '#111' : '#fff'; g.fillText(fmtTick(+v.toPrecision(3)), x + cw / 2, y + chh / 2); }
      if (d.lim != null && isFinite(v) && v > d.lim) { g.strokeStyle = '#dc2626'; g.lineWidth = 2; g.strokeRect(x + 1.5, y + 1.5, cw - 3, chh - 3); g.lineWidth = 1; }
    }
    g.strokeStyle = mute; g.strokeRect(L + 0.5, T + 0.5, pw, ph);
    g.fillStyle = mute; g.textBaseline = 'top';
    const stx = Math.max(1, Math.ceil(nx / Math.max(2, Math.floor(pw / 60))));
    d.xs.forEach((v, i) => { if (i % stx === 0) g.fillText(fmtTick(+(+v).toPrecision(4)), L + (i + 0.5) * cw, T + ph + 6); });
    g.textAlign = 'right'; g.textBaseline = 'middle';
    const sty = Math.max(1, Math.ceil(ny / Math.max(2, Math.floor(ph / 22))));
    d.ys.forEach((v, i) => { if (i % sty === 0) g.fillText(fmtTick(+(+v).toPrecision(4)), L - 6, T + ph - (i + 0.5) * chh); });
    g.textAlign = 'center';
    if (d.xlabel) g.fillText(d.xlabel, L + pw / 2, H - 12);
    if (d.ylabel) { g.save(); g.translate(14, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText(d.ylabel, 0, 0); g.restore(); }
    // thang màu
    const bx = L + pw + 14, bwd = 14;
    for (let i = 0; i < ph; i++) { g.fillStyle = heatColor(1 - i / ph); g.fillRect(bx, T + i, bwd, 1.5); }
    g.strokeStyle = mute; g.strokeRect(bx + 0.5, T + 0.5, bwd, ph);
    g.fillStyle = ink; g.textAlign = 'left';
    niceTicks(z0, z1, 4).forEach(v => { if (v < z0 || v > z1) return; const yy = T + ph - (v - z0) / (z1 - z0) * ph; g.fillText(fmtTick(v), bx + bwd + 4, yy); });
    if (d.zlabel) { g.save(); g.translate(W - 6, T + ph / 2); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillStyle = mute; g.fillText(d.zlabel, 0, 0); g.restore(); }
    if (this.hover && this.hover.x > L && this.hover.x < L + pw && this.hover.y > T && this.hover.y < T + ph) {
      const ix = Math.floor((this.hover.x - L) / cw), iy = ny - 1 - Math.floor((this.hover.y - T) / chh);
      const v = d.z[iy] ? d.z[iy][ix] : NaN;
      const lines = [(d.xlabel || 'x') + ': ' + fmtTick(d.xs[ix]), (d.ylabel || 'y') + ': ' + fmtTick(d.ys[iy]), (d.zlabel || 'z') + ': ' + (isFinite(v) ? fmtTick(v) : '–')];
      const bw2 = Math.max(...lines.map(l => g.measureText(l).width)) + 16, bh = lines.length * 16 + 8;
      let px = this.hover.x + 12, py = this.hover.y + 12; if (px + bw2 > W - 4) px = this.hover.x - bw2 - 12; if (py + bh > H - 4) py = this.hover.y - bh - 12;
      g.fillStyle = css.getPropertyValue('--panel').trim() || '#fff'; g.strokeStyle = '#cbd5e1'; g.fillRect(px, py, bw2, bh); g.strokeRect(px + 0.5, py + 0.5, bw2, bh);
      g.fillStyle = ink; g.textBaseline = 'middle'; lines.forEach((l, i) => g.fillText(l, px + 8, py + 12 + i * 16));
    }
  }
}
