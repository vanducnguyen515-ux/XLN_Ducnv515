/* AquaDesign VN – bản vẽ đúng tỷ lệ (mặt bằng + mặt cắt), sơ đồ công nghệ; xuất SVG / DXF R12 */
'use strict';
const DRW = {};
DRW.LAYERS = {
  WALL: { c: 7, col: 'var(--ink)', w: 0.06 },
  WATER: { c: 5, col: '#2d7fd3', w: 0.03, dash: '0.4 0.2' },
  EQUIP: { c: 1, col: '#d0453a', w: 0.035 },
  DIM: { c: 3, col: '#2f9e54', w: 0.02 },
  TEXT: { c: 7, col: 'var(--ink)', w: 0.02 },
  AXIS: { c: 8, col: '#8a8f98', w: 0.015, dash: '1 0.3 0.15 0.3' },
  ZONE: { c: 30, col: '#c58a16', w: 0.02, dash: '0.3 0.2' },
  SLUDGE: { c: 34, col: '#8b5a2b', w: 0.03 },
  FLOW: { c: 4, col: '#2d7fd3', w: 0.05 },
};

class Dwg {
  constructor(title) { this.title = title; this.e = []; }
  line(x1, y1, x2, y2, ly = 'WALL') { this.e.push({ t: 'line', x1, y1, x2, y2, ly }); return this; }
  rect(x, y, w, h, ly = 'WALL', fill) { this.e.push({ t: 'poly', pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true, ly, fill }); return this; }
  poly(pts, closed = false, ly = 'WALL', fill) { this.e.push({ t: 'poly', pts, closed, ly, fill }); return this; }
  circle(cx, cy, r, ly = 'WALL', fill) { this.e.push({ t: 'circle', cx, cy, r, ly, fill }); return this; }
  arc(cx, cy, r, a1, a2, ly = 'WALL') { this.e.push({ t: 'arc', cx, cy, r, a1, a2, ly }); return this; } // độ, ngược chiều kim đồng hồ
  text(x, y, txt, s = 0.5, ly = 'TEXT', anchor = 'middle') { this.e.push({ t: 'text', x, y, txt: String(txt), s, ly, anchor }); return this; }
  dim(x1, y1, x2, y2, off, txt, s = 0.45) {
    // kích thước thẳng: off > 0 lệch sang trái chiều (x1,y1)->(x2,y2)
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const a = [x1 + nx * off, y1 + ny * off], b = [x2 + nx * off, y2 + ny * off];
    this.line(x1, y1, a[0] + nx * 0.2 * Math.sign(off), a[1] + ny * 0.2 * Math.sign(off), 'DIM');
    this.line(x2, y2, b[0] + nx * 0.2 * Math.sign(off), b[1] + ny * 0.2 * Math.sign(off), 'DIM');
    this.line(a[0], a[1], b[0], b[1], 'DIM');
    const t = s * 0.6, ux = dx / L, uy = dy / L;
    for (const [p, sg] of [[a, 1], [b, -1]]) this.line(p[0] - (ux + uy) * t * 0.5 * sg + 0, p[1] - (uy - ux) * t * 0.5 * sg, p[0] + (ux + uy) * t * 0.5 * sg, p[1] + (uy - ux) * t * 0.5 * sg, 'DIM');
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    this.e.push({ t: 'text', x: (a[0] + b[0]) / 2 + nx * s * 0.7 * Math.sign(off || 1), y: (a[1] + b[1]) / 2 + ny * s * 0.7 * Math.sign(off || 1), txt: txt === undefined ? U.fmt(L, 2) : txt, s, ly: 'DIM', anchor: 'middle', rot: (ang > 90 || ang < -90) ? ang + 180 : ang });
    return this;
  }
  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const P = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const e of this.e) {
      if (e.t === 'line') { P(e.x1, e.y1); P(e.x2, e.y2); }
      else if (e.t === 'poly') e.pts.forEach(p => P(p[0], p[1]));
      else if (e.t === 'circle' || e.t === 'arc') { P(e.cx - e.r, e.cy - e.r); P(e.cx + e.r, e.cy + e.r); }
      else if (e.t === 'text') { const w = e.txt.length * e.s * 0.55; P(e.x - w / 2, e.y - e.s); P(e.x + w / 2, e.y + e.s); }
    }
    return { x0, y0, x1, y1 };
  }
  svg(opt = {}) {
    const b = this.bounds(), pad = Math.max(1, (b.x1 - b.x0) * 0.04);
    const W = b.x1 - b.x0 + 2 * pad, H = b.y1 - b.y0 + 2 * pad;
    const X = x => (x - b.x0 + pad).toFixed(3), Y = y => (b.y1 - y + pad).toFixed(3);
    const k = Math.max(W, H) / 60; // độ dày nét theo kích thước
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" class="dwg" preserveAspectRatio="xMidYMid meet"${opt.id ? ' id="' + opt.id + '"' : ''}>`];
    for (const e of this.e) {
      const L = DRW.LAYERS[e.ly] || DRW.LAYERS.WALL;
      const st = `stroke="${L.col}" stroke-width="${(L.w * k).toFixed(3)}" fill="${e.fill || 'none'}"${L.dash ? ` stroke-dasharray="${L.dash.split(' ').map(v => (v * k).toFixed(3)).join(' ')}"` : ''}`;
      if (e.t === 'line') out.push(`<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" ${st}/>`);
      else if (e.t === 'poly') out.push(`<${e.closed ? 'polygon' : 'polyline'} points="${e.pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" ${st}/>`);
      else if (e.t === 'circle') out.push(`<circle cx="${X(e.cx)}" cy="${Y(e.cy)}" r="${e.r.toFixed(3)}" ${st}/>`);
      else if (e.t === 'arc') {
        const a1 = e.a1 * Math.PI / 180, a2 = e.a2 * Math.PI / 180;
        const p1 = [e.cx + e.r * Math.cos(a1), e.cy + e.r * Math.sin(a1)], p2 = [e.cx + e.r * Math.cos(a2), e.cy + e.r * Math.sin(a2)];
        let sw = ((e.a2 - e.a1) % 360 + 360) % 360;
        out.push(`<path d="M${X(p1[0])} ${Y(p1[1])} A${e.r} ${e.r} 0 ${sw > 180 ? 1 : 0} 0 ${X(p2[0])} ${Y(p2[1])}" ${st}/>`);
      } else if (e.t === 'text') {
        const rot = e.rot ? ` transform="rotate(${(-e.rot).toFixed(2)} ${X(e.x)} ${Y(e.y)})"` : '';
        out.push(`<text x="${X(e.x)}" y="${Y(e.y)}" font-size="${e.s.toFixed(3)}" text-anchor="${e.anchor}" dominant-baseline="middle" fill="${L.col}"${rot}>${U.esc(e.txt)}</text>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }
  dxf() {
    const o = [], g = (c, v) => o.push(String(c), String(v));
    const mm = v => (v * 1000).toFixed(1);
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0); g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(DRW.LAYERS).length);
    for (const [n, L] of Object.entries(DRW.LAYERS)) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, L.c); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB'); g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1); g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, ''); g(0, 'ENDTAB');
    g(0, 'ENDSEC'); g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const e of this.e) {
      if (e.t === 'line') { g(0, 'LINE'); g(8, e.ly); g(10, mm(e.x1)); g(20, mm(e.y1)); g(30, 0); g(11, mm(e.x2)); g(21, mm(e.y2)); g(31, 0); }
      else if (e.t === 'circle') { g(0, 'CIRCLE'); g(8, e.ly); g(10, mm(e.cx)); g(20, mm(e.cy)); g(30, 0); g(40, mm(e.r)); }
      else if (e.t === 'arc') { g(0, 'ARC'); g(8, e.ly); g(10, mm(e.cx)); g(20, mm(e.cy)); g(30, 0); g(40, mm(e.r)); g(50, e.a1); g(51, e.a2); }
      else if (e.t === 'poly') {
        g(0, 'POLYLINE'); g(8, e.ly); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, e.closed ? 1 : 0);
        for (const p of e.pts) { g(0, 'VERTEX'); g(8, e.ly); g(10, mm(p[0])); g(20, mm(p[1])); g(30, 0); }
        g(0, 'SEQEND'); g(8, e.ly);
      } else if (e.t === 'text') {
        g(0, 'TEXT'); g(8, e.ly); g(10, mm(e.x)); g(20, mm(e.y - e.s / 2)); g(30, 0); g(40, mm(e.s)); g(1, DRW.dxfText(e.txt));
        if (e.rot) g(50, e.rot.toFixed(2));
        if (e.anchor !== 'start') { g(72, e.anchor === 'middle' ? 1 : 2); g(11, mm(e.x)); g(21, mm(e.y - e.s / 2)); g(31, 0); }
      }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return o.join('\r\n');
  }
}
DRW.Dwg = Dwg;
// DXF R12 không có Unicode: mã hóa \U+XXXX (AutoCAD/LibreCAD đọc được)
DRW.dxfText = s => s.replace(/[^\x20-\x7e]/g, ch => '\\U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));

/* ---- ký hiệu ---- */
DRW.mixer = (g, x, y, ang, s = 1) => { // máy khuấy chìm (mặt bằng)
  const c = Math.cos(ang), sn = Math.sin(ang);
  const P = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
  g.poly([P(-0.6 * s, -0.25 * s), P(0.3 * s, -0.25 * s), P(0.3 * s, 0.25 * s), P(-0.6 * s, 0.25 * s)], true, 'EQUIP');
  g.poly([P(0.3 * s, 0), P(0.5 * s, -0.7 * s), P(0.6 * s, 0.7 * s)], true, 'EQUIP');
};
DRW.lattice = (g, x, y, w, h, rows, tube, label) => {
  g.rect(x, y, w, h, 'EQUIP');
  // vẽ sơ đồ hóa: các hàng ống/đĩa (tối đa 8 hàng); số lượng thực ghi trên lưới và trong bản tính
  const n = Math.min(8, Math.max(1, rows));
  for (let i = 0; i < n; i++) {
    const yy = y + h * (i + 0.5) / n;
    g.line(x + 0.2, yy, x + w - 0.2, yy, 'EQUIP');
    if (!tube) for (const xx of [x + 0.4, x + w - 0.4]) g.circle(xx, yy, Math.min(0.15, h / n / 3), 'EQUIP');
  }
  if (label) g.text(x + w / 2, y + h / 2, label, Math.min(0.5, w / 8), 'EQUIP');
};

/* ---- bể lắng II tròn ---- */
DRW.sstCirc = function (S, R) {
  const s = R.sst, g = new Dwg('Bể lắng II – mặt bằng & mặt cắt');
  const D = s.D, Din = s.Din, rr = D / 2, ri = Din / 2, tw = S.build.tWallST;
  // mặt bằng (tâm 0,0)
  g.circle(0, 0, rr + tw); g.circle(0, 0, rr);
  g.circle(0, 0, rr - 0.5, 'WATER'); g.circle(0, 0, rr - 1.0, 'WATER'); // máng thu
  g.circle(0, 0, ri, 'WALL'); g.circle(0, 0, Math.max(0.6, ri * 0.25), 'WALL');
  g.line(-rr - tw - 1, 0, rr + tw + 1, 0, 'AXIS'); g.line(0, -rr - tw - 1, 0, rr + tw + 1, 'AXIS');
  g.rect(-0.75, 0, 1.5, rr, 'EQUIP'); // cầu gạt
  g.text(0, rr + tw + 1.4, 'MẶT BẰNG – ' + s.n + ' bể', 0.9);
  g.dim(-rr, -rr - tw - 1.5, rr, -rr - tw - 1.5, 0, 'D = ' + U.fmt(D) + ' m', 0.6);
  g.dim(-ri, ri + 0.6, ri, ri + 0.6, 0, 'D_E = ' + U.fmt(Din), 0.45);
  // mặt cắt bên phải
  const ox = 2 * (rr + tw) + 6, hE = s.hEdge, hM = s.hCenter, fb = S.build.free;
  const X = x => ox + x; // mặt nước tại y = 0, gốc x tại tâm bể
  g.poly([[X(rr), fb], [X(rr), -hE], [X(ri), -hM], [X(0.8), -hM], [X(0.8), -hM - 1.2], [X(-0.8), -hM - 1.2], [X(-0.8), -hM], [X(-ri), -hM], [X(-rr), -hE], [X(-rr), fb]], false, 'WALL');
  g.poly([[X(rr + tw), fb], [X(rr + tw), -hE - S.build.tSlab], [X(-rr - tw), -hE - S.build.tSlab], [X(-rr - tw), fb]], false, 'WALL');
  // công trình vào
  const hIn = s.hIn || (s.zones.h1 + s.zones.h2 + s.zones.h3);
  g.poly([[X(-ri), fb * 0.6], [X(-ri), -hIn + (S.sst.gap || 0.5)]], false, 'WALL');
  g.poly([[X(ri), fb * 0.6], [X(ri), -hIn + (S.sst.gap || 0.5)]], false, 'WALL');
  // mặt nước & vùng
  g.line(X(-rr), 0, X(rr), 0, 'WATER');
  g.text(X(rr) - 1.2, 0.35, '▽ MNTK', 0.4, 'WATER');
  const z = s.zones; let yy = 0;
  const zl = [['h₁', z.h1], ['h₂', z.h2], ['h₃', z.h3], ['h₄', z.h4]];
  for (const [n, h] of zl) {
    yy -= h;
    g.line(X(ri + 0.2), yy, X(rr - 0.2), yy, 'ZONE');
    g.text(X((rr + ri) / 2), yy + h / 2, n + ' = ' + U.fmt(h) + ' m', 0.38, 'ZONE');
  }
  g.line(X(0), fb + 1, X(0), -hM - 1.8, 'AXIS');
  g.dim(X(rr + tw), 0, X(rr + tw), -hE, 1.8, 'h_R = ' + U.fmt(hE), 0.42);
  g.dim(X(-ri), 0, X(-ri), -hM, 1.2, 'h_M = ' + U.fmt(hM), 0.42);
  g.dim(X(-rr), fb + 0.8, X(rr), fb + 0.8, 0, 'D = ' + U.fmt(D) + ' m', 0.5);
  g.line(X(ri), -hM + 0.3, X(rr), -hE + 0.3, 'SLUDGE');
  g.text(ox, fb + 2.0, 'MẶT CẮT', 0.9);
  return g;
};

/* ---- bể lắng II đáy phễu (Trichter) ---- */
DRW.sstHop = function (S, R) {
  const s = R.sst, g = new Dwg('Bể lắng II đáy phễu – mặt bằng & mặt cắt');
  const D = s.D, rr = D / 2, ri = (s.Din || 1) / 2, tw = S.build.tWallST, fb = S.build.free, r0 = 0.2;
  g.circle(0, 0, rr + tw); g.circle(0, 0, rr); g.circle(0, 0, rr - 0.5, 'WATER');
  g.circle(0, 0, ri, 'WALL'); g.circle(0, 0, r0, 'SLUDGE');
  g.line(-rr - tw - 1, 0, rr + tw + 1, 0, 'AXIS'); g.line(0, -rr - tw - 1, 0, rr + tw + 1, 'AXIS');
  g.text(0, rr + tw + 1.4, 'MẶT BẰNG – ' + s.n + ' bể', 0.9);
  g.dim(-rr, -rr - tw - 1.5, rr, -rr - tw - 1.5, 0, 'D = ' + U.fmt(D) + ' m', 0.6);
  const ox = 2 * (rr + tw) + 6, X = x => ox + x, hz = s.Hcyl, H = s.H;
  g.poly([[X(rr), fb], [X(rr), -hz], [X(r0), -H], [X(-r0), -H], [X(-rr), -hz], [X(-rr), fb]], false, 'WALL');
  g.poly([[X(rr + tw), fb], [X(rr + tw), -hz - tw], [X(r0 + tw), -H - tw], [X(-r0 - tw), -H - tw], [X(-rr - tw), -hz - tw], [X(-rr - tw), fb]], false, 'WALL');
  const he = s.he || (s.zones.h1 + s.zones.h2 + s.zones.h3 / 2);
  g.poly([[X(-ri), fb * 0.6], [X(-ri), -he]], false, 'WALL'); g.poly([[X(ri), fb * 0.6], [X(ri), -he]], false, 'WALL');
  g.line(X(-rr), 0, X(rr), 0, 'WATER'); g.text(X(rr) - 1.2, 0.35, '▽ MNTK', 0.4, 'WATER');
  g.line(X(0.15), -H + 0.2, X(0.15), fb + 0.5, 'SLUDGE'); g.text(X(0.6), fb + 0.8, 'ống hút bùn', 0.35, 'SLUDGE');
  g.line(X(0), fb + 1, X(0), -H - 1.2, 'AXIS');
  g.dim(X(rr + tw), 0, X(rr + tw), -hz, 1.8, 'h_zyl = ' + U.fmt(hz), 0.42);
  g.dim(X(rr + tw), -hz, X(rr + tw), -H, 1.8, 'h_phễu = ' + U.fmt(H - hz), 0.42);
  g.dim(X(-rr - tw), 0, X(-rr - tw), -H, -1.8, 'H = ' + U.fmt(H), 0.42);
  g.text(X(0), -H - 0.9, 'Ø 0,40 – góc ' + U.fmt(s.cone, 0) + '°', 0.38);
  g.text(ox, fb + 2.0, 'MẶT CẮT', 0.9);
  return g;
};

DRW.sstRect = function (S, R) {
  const s = R.sst, g = new Dwg('Bể lắng II chữ nhật');
  const B = s.B, L = s.L, H = s.H, tw = S.build.tWallST, n = s.n;
  for (let i = 0; i < n; i++) {
    const y = i * (B + tw);
    g.rect(0, y, L, B); g.line(s.Lin, y, s.Lin, y + B, 'ZONE');
    g.line(L - 0.5, y, L - 0.5, y + B, 'WATER');
    g.text(L / 2, y + B / 2, 'Bể lắng ' + (i + 1), 0.7);
  }
  g.rect(-tw, -tw, L + 2 * tw, n * B + (n + 1) * tw - tw + tw);
  g.dim(0, -tw - 1, L, -tw - 1, 0, 'L = ' + U.fmt(L) + ' m', 0.6);
  g.dim(-tw - 1, 0, -tw - 1, B, 0, 'B = ' + U.fmt(B), 0.5);
  const oy = -H - 6;
  g.poly([[0, oy + H + 0.5], [0, oy], [L, oy + Math.min(0.5, L * S.sst.slope)], [L, oy + H + 0.5]], false);
  g.line(0, oy + H, L, oy + H, 'WATER');
  let yy = oy + H;
  for (const [nm, h] of [['h₁', s.zones.h1], ['h₂', s.zones.h2], ['h₃', s.zones.h3], ['h₄', s.zones.h4]]) { yy -= h; g.line(s.Lin, yy, L, yy, 'ZONE'); g.text(L * 0.7, yy + h / 2, nm + ' = ' + U.fmt(h), 0.4, 'ZONE'); }
  g.dim(L, oy + H, L, oy, -1.2, 'H = ' + U.fmt(H), 0.45);
  g.text(L / 2, oy - 1.5, 'MẶT CẮT DỌC', 0.8);
  return g;
};

/* ---- bể aerotank ---- */
DRW.at = function (S, R) {
  const t = R.tank, a = R.aer, g = new Dwg('Bể bùn hoạt tính – mặt bằng & mặt cắt');
  const tw = S.build.tWallAT, H = t.H, fb = S.build.free, r = S.opt.process === 'ND' ? (R.bio.r || 0) : 0;
  const isTube = a && a.diff && a.diff.type.type === 'tube';
  const pre = S.opt.process === 'ND' && (S.opt.dn === 'pre' || S.opt.dn === 'casc');
  if (t.type === 'rect') {
    const B = t.B, L = t.L;
    for (let i = 0; i < t.n; i++) {
      const y = i * (B + tw);
      g.rect(0, y, L, B);
      if (pre) { g.line(L * r, y, L * r, y + B, 'WALL'); g.text(L * r / 2, y + B / 2, 'THIẾU KHÍ', 0.6); }
      g.text(L * (pre ? (1 + r) / 2 : 0.5), y + B - 0.8, 'Bể ' + (i + 1) + (pre ? ' – HIẾU KHÍ' : ''), 0.6);
      if (a && a.grid && a.grid.lattices) for (const l of a.grid.lattices) DRW.lattice(g, l.x, y + l.y, l.w, l.h, Math.min(l.rows, 14), isTube, l.perL + (isTube ? ' m' : ' đĩa'));
      if (a && a.mix && a.mix.n) for (let k = 0; k < a.mix.n; k++) {
        const xm = pre ? L * r * (k + 0.5) / a.mix.n : 2 + (L - 4) * k / Math.max(1, a.mix.n - 1 || 1);
        DRW.mixer(g, xm, y + (k % 2 ? B - 1 : 1), k % 2 ? -Math.PI / 2 : Math.PI / 2, 0.9);
      }
    }
    g.rect(-tw, -tw, L + 2 * tw, t.n * B + (t.n + 1) * tw);
    g.dim(0, -tw - 1.2, L, -tw - 1.2, 0, 'L = ' + U.fmt(L) + ' m', 0.7);
    g.dim(-tw - 1.2, 0, -tw - 1.2, B, 0, 'B = ' + U.fmt(B), 0.6);
    // mặt cắt ngang
    const ox = L + 8, Bt = t.n * B + (t.n - 1) * tw;
    g.poly([[ox, fb], [ox, -H - S.build.tSlab], [ox + Bt + 2 * tw, -H - S.build.tSlab], [ox + Bt + 2 * tw, fb]]);
    for (let i = 0; i < t.n; i++) {
      const x0 = ox + tw + i * (B + tw);
      g.poly([[x0, fb], [x0, -H], [x0 + B, -H], [x0 + B, fb]]);
      g.line(x0, 0, x0 + B, 0, 'WATER');
      for (let k = 0; k < 6; k++) g.circle(x0 + 0.5 + (B - 1) * (k + 0.5) / 6, -H + S.aer.dz, 0.1, 'EQUIP');
    }
    g.dim(ox + Bt + 2 * tw, 0, ox + Bt + 2 * tw, -H, -1.5, 'H = ' + U.fmt(H), 0.5);
    g.text(ox + Bt / 2, fb + 1.5, 'MẶT CẮT NGANG', 0.8);
  } else if (t.type === 'circ' || t.type === 'ring') {
    const rr = t.D / 2, ri = t.type === 'ring' ? t.Di / 2 : 0;
    g.circle(0, 0, rr + tw); g.circle(0, 0, rr);
    if (ri) { g.circle(0, 0, ri); g.circle(0, 0, ri - S.build.tWallST); g.text(0, 0, 'BỂ LẮNG II', 0.8); g.circle(0, 0, (ri - S.build.tWallST) - 0.5, 'WATER'); }
    if (pre) { const a1 = 90, a2 = 90 + 360 * r; g.line(ri, 0, rr, 0, 'WALL'); g.line(ri * Math.cos(a2 * Math.PI / 180), ri * Math.sin(a2 * Math.PI / 180), rr * Math.cos(a2 * Math.PI / 180), rr * Math.sin(a2 * Math.PI / 180), 'WALL'); g.text(((ri + rr) / 2) * Math.cos((a1 + 180 * r) * Math.PI / 180), ((ri + rr) / 2) * Math.sin((a1 + 180 * r) * Math.PI / 180), 'THIẾU KHÍ', 0.6); }
    const nL = a && a.grid ? a.grid.nL : 8, rm = (ri + rr) / 2, w = Math.max(1, (rr - ri) * 0.6);
    if (a && a.diff) for (let k = 0; k < nL; k++) {
      const ang = (pre ? 360 * r : 0) + (360 * (1 - (pre ? r : 0))) * (k + 0.5) / nL;
      const c = Math.cos(ang * Math.PI / 180), sn = Math.sin(ang * Math.PI / 180);
      const l = 2 * Math.PI * rm / nL * 0.55;
      const pts = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([u, v]) => [rm * c + u * -sn + v * c, rm * sn + u * c + v * sn]);
      g.poly(pts, true, 'EQUIP');
    }
    if (a && a.mix) for (let k = 0; k < a.mix.n; k++) { const ang = 2 * Math.PI * k / a.mix.n + 0.3; DRW.mixer(g, rm * Math.cos(ang), rm * Math.sin(ang), ang + Math.PI / 2, 1.0); }
    g.dim(-rr, -rr - tw - 1.5, rr, -rr - tw - 1.5, 0, 'D = ' + U.fmt(t.D) + ' m', 0.7);
    if (ri) g.dim(-ri, 0.8, ri, 0.8, 0, 'D_i = ' + U.fmt(t.Di), 0.5);
    const ox = rr + tw + 6;
    g.poly([[ox, fb], [ox, -H], [ox + 2 * rr, -H], [ox + 2 * rr, fb]]);
    g.line(ox, 0, ox + 2 * rr, 0, 'WATER');
    if (ri) { g.poly([[ox + rr - ri, fb], [ox + rr - ri, -H]]); g.poly([[ox + rr + ri, fb], [ox + rr + ri, -H]]); }
    g.dim(ox + 2 * rr, 0, ox + 2 * rr, -H, -1.5, 'H = ' + U.fmt(H), 0.5);
    g.text(ox + rr, fb + 1.5, 'MẶT CẮT', 0.8);
  } else {
    const W = t.W, L = t.L, tm = t.t, R2 = W / 2;
    // đường bao mương: 2 đoạn thẳng + 2 bán nguyệt
    g.line(R2, -R2, L - R2, -R2); g.line(R2, R2, L - R2, R2);
    g.arc(R2, 0, R2, 90, 270); g.arc(L - R2, 0, R2, -90, 90);
    g.rect(R2, -tm / 2, L - W, tm); // vách giữa
    // Carrousel 4/6 làn: thêm vách trong đối xứng (đoạn thẳng + nửa vòng)
    const kL = t.lanes || 2, bw0 = (W - (kL - 1) * tm) / kL;
    for (let j = 1; j < kL / 2; j++) { const y = j * (bw0 + tm); for (const sg of [-1, 1]) g.rect(R2, sg * y - tm / 2, L - W, tm); g.arc(R2, 0, y, 90, 270, 'WALL'); g.arc(L - R2, 0, y, -90, 90, 'WALL'); }
    g.arc(R2, 0, R2 + tw, 90, 270); g.arc(L - R2, 0, R2 + tw, -90, 90);
    g.line(R2, -R2 - tw, L - R2, -R2 - tw); g.line(R2, R2 + tw, L - R2, R2 + tw);
    const bl = (W - tm) / 2;
    if (a && a.diff) { const nL = Math.max(2, (a.grid && a.grid.nL) || 4); for (let k = 0; k < nL; k++) { const x = R2 + (L - W) * (k + 0.5) / nL; DRW.lattice(g, x - (L - W) / nL * 0.35, tm / 2 + 0.3, (L - W) / nL * 0.7, bl - 0.6, 4, isTube); } }
    if (a && a.mix) for (let k = 0; k < a.mix.n; k++) DRW.mixer(g, R2 + (L - W) * (k + 0.5) / a.mix.n, -tm / 2 - bl / 2, 0, 1.0);
    g.text(L / 2, -tm / 2 - bl / 2 + 1.2, '→ dòng chảy', 0.6, 'FLOW');
    g.dim(0, -R2 - tw - 1.5, L, -R2 - tw - 1.5, 0, 'L = ' + U.fmt(L) + ' m', 0.7);
    g.dim(-tw - 1.2, -R2, -tw - 1.2, R2, 0, 'W = ' + U.fmt(W), 0.6);
    g.text(L / 2, R2 + tw + 1.5, (kL > 2 ? 'CARROUSEL ' + kL + ' LÀN – ' : 'MƯƠNG ÔXY HÓA – ') + t.n + ' mương, H = ' + U.fmt(H) + ' m', 0.8);
  }
  if (t.an) { const ox = 0, oy = (t.type === 'rect' ? t.n * (t.B + tw) + 4 : (t.D || t.W) / 2 + 6); for (let i = 0; i < t.an.n; i++) { g.rect(ox + i * (t.an.B + tw), oy, t.an.B, t.an.L); g.text(ox + i * (t.an.B + tw) + t.an.B / 2, oy + t.an.L / 2, 'KỴ KHÍ', 0.5); } }
  return g;
};

DRW.sbr = function (S, R) {
  const s = R.sbr, g = new Dwg('Bể SBR'), sb = S.sbr, tw = S.build.tWallAT, H = sb.H, fb = S.build.free;
  if (sb.shape === 'circ') {
    for (let i = 0; i < sb.n; i++) { const cx = i * (s.D + 2 * tw + 2); g.circle(cx, 0, s.D / 2); g.circle(cx, 0, s.D / 2 + tw); g.text(cx, 0, 'SBR ' + (i + 1), 0.8); DRW.mixer(g, cx + s.D / 4, 0, Math.PI / 2, 1); }
    g.dim(-s.D / 2, -s.D / 2 - 2, s.D / 2, -s.D / 2 - 2, 0, 'D = ' + U.fmt(s.D) + ' m', 0.7);
  } else {
    for (let i = 0; i < sb.n; i++) { const y = i * (s.Bw + tw); g.rect(0, y, s.L, s.Bw); g.text(s.L / 2, y + s.Bw / 2, 'SBR ' + (i + 1), 0.8); g.rect(s.L - 2.5, y + s.Bw / 2 - 1, 2, 2, 'EQUIP'); g.text(s.L - 1.5, y + s.Bw / 2 + 1.5, 'decanter', 0.35, 'EQUIP'); DRW.mixer(g, 2, y + 1.2, Math.PI / 2, 1); }
    g.rect(-tw, -tw, s.L + 2 * tw, sb.n * s.Bw + (sb.n + 1) * tw);
    g.dim(0, -tw - 1.2, s.L, -tw - 1.2, 0, 'L = ' + U.fmt(s.L) + ' m', 0.7);
    g.dim(-tw - 1.2, 0, -tw - 1.2, s.Bw, 0, 'B = ' + U.fmt(s.Bw), 0.6);
  }
  // mặt cắt mực nước
  const ox = (sb.shape === 'circ' ? sb.n * (s.D + 2 * tw + 2) : s.L) + 8, W = sb.shape === 'circ' ? s.D : s.Bw;
  g.poly([[ox, fb], [ox, -H], [ox + W, -H], [ox + W, fb]]);
  g.line(ox, 0, ox + W, 0, 'WATER'); g.text(ox + W + 0.3, 0, 'MN max', 0.4, 'WATER', 'start');
  const hmin = H * (1 - s.fA);
  g.line(ox, -H + hmin, ox + W, -H + hmin, 'WATER'); g.text(ox + W + 0.3, -H + hmin, 'MN min', 0.4, 'WATER', 'start');
  g.line(ox, -H + s.level, ox + W, -H + s.level, 'SLUDGE'); g.text(ox + W + 0.3, -H + s.level, 'mực bùn', 0.4, 'SLUDGE', 'start');
  g.dim(ox, 0, ox, -H, 1.2, 'H = ' + U.fmt(H), 0.45);
  g.dim(ox + W, 0, ox + W, -H + hmin, -3.5, 'ΔH = ' + U.fmt(H - hmin), 0.4);
  g.text(ox + W / 2, fb + 1.5, 'MẶT CẮT – f_A = ' + U.fmt(s.fA), 0.7);
  return g;
};

/* ---- ICEAS ---- */
DRW.iceas = function (S, R) {
  const c = R.iceas, g = new Dwg('Bể ICEAS – mặt bằng & mặt cắt dọc'), tw = S.build.tWallAT, fb = S.build.free;
  const W = c.W, L = c.L, n = c.nb, Lp = c.Lpre;
  for (let i = 0; i < n; i++) {
    const y = i * (W + tw);
    g.rect(0, y, L, W);
    g.line(Lp, y, Lp, y + W * 0.85); // vách pre-react, hở phía đáy/cửa
    g.text(Lp / 2, y + W / 2, 'PRE-REACT', Math.min(0.6, Lp / 6));
    g.text((Lp + L) / 2, y + W / 2 + 0.8, 'ICEAS ' + (i + 1) + ' – VÙNG PHẢN ỨNG CHÍNH', 0.6);
    // decanter ở cuối bể
    const dl = Math.min(c.DL, W - 1);
    g.rect(L - 1.6, y + (W - dl) / 2, 0.6, dl, 'EQUIP'); g.text(L - 2.4, y + W / 2, 'decanter ' + U.fmt(c.DL) + ' m', 0.4, 'EQUIP', 'end');
    // lưới đĩa vùng chính
    const nL = Math.max(2, Math.round((L - Lp) / 8));
    for (let k = 0; k < nL; k++) { const x0 = Lp + 0.8 + k * (L - Lp - 3) / nL; DRW.lattice(g, x0, y + 0.6, (L - Lp - 3) / nL - 0.8, W - 1.2, 6, false); }
    if (c.cycle !== 'NIT') { DRW.mixer(g, Lp + 1.5, y + 1.2, Math.PI / 2, 1); DRW.mixer(g, (Lp + L) / 2, y + W - 1.2, -Math.PI / 2, 1); }
  }
  g.rect(-tw, -tw, L + 2 * tw, n * W + (n + 1) * tw);
  g.dim(0, -tw - 1.2, L, -tw - 1.2, 0, 'L = ' + U.fmt(L) + ' m', 0.7);
  g.dim(-tw - 1.2, 0, -tw - 1.2, W, 0, 'W = ' + U.fmt(W), 0.6);
  g.text(-tw, n * (W + tw) + 1.2, 'Nước vào liên tục → vùng pre-react', 0.5, 'FLOW', 'start');
  // mặt cắt dọc
  const oy = -c.TWL - 8, H = c.TWL;
  g.poly([[0, oy + H + fb], [0, oy], [L, oy], [L, oy + H + fb]]);
  g.line(Lp, oy + H + fb, Lp, oy + 0.8);
  g.line(0, oy + H, L, oy + H, 'WATER'); g.text(L + 0.4, oy + H, 'TWL ' + U.fmt(H), 0.45, 'WATER', 'start');
  g.line(Lp, oy + c.BWL, L, oy + c.BWL, 'WATER'); g.text(L + 0.4, oy + c.BWL, 'BWL ' + U.fmt(c.BWL), 0.45, 'WATER', 'start');
  g.line(Lp, oy + c.SD, L, oy + c.SD, 'SLUDGE'); g.text(L + 0.4, oy + c.SD, 'mực bùn SD ' + U.fmt(c.SD), 0.45, 'SLUDGE', 'start');
  g.rect(L - 1.6, oy + c.BWL, 0.6, 0.4, 'EQUIP');
  for (let k = 0; k < 12; k++) g.circle(Lp + 0.8 + (L - Lp - 3) * (k + 0.5) / 12, oy + S.aer.dz, 0.12, 'EQUIP');
  g.dim(0, oy + H, 0, oy, 1.2, 'TWL = ' + U.fmt(H), 0.45);
  g.dim(L, oy + H, L, oy + c.BWL, -3.6, 'DD = ' + U.fmt(c.DD), 0.4);
  g.text(L / 2, oy - 1.4, 'MẶT CẮT DỌC – chu trình ' + c.cycle + ' ' + c.ci.v.slice(0, 4).join('/') + ' phút', 0.7);
  return g;
};

/* ---- C-Tech ---- */
DRW.ctech = function (S, R) {
  const c = R.ctech, g = new Dwg('Bể C-Tech – mặt bằng & mặt cắt'), tw = S.build.tWallAT, fb = c.TWL ? S.ct.fb : 0.5;
  const L = c.L, B = c.Bw, N = c.N, Ws = c.Wsel;
  const cols = Math.ceil(N / 2);
  for (let i = 0; i < N; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = col * (L + tw), y = row * (B + tw);
    g.rect(x, y, L, B);
    // selector dọc theo một cạnh dài, chia ngăn
    const ys = row === 0 ? y + B - Ws : y;
    g.line(x, row === 0 ? ys : ys + Ws, x + L, row === 0 ? ys : ys + Ws);
    const ns = S.ct.nsel;
    for (let k = 1; k < ns; k++) g.line(x + L * k / ns, ys, x + L * k / ns, ys + Ws);
    g.text(x + L / 2, ys + Ws / 2, 'SELECTOR ' + ns + ' ngăn', Math.min(0.5, Ws / 2.5));
    g.text(x + L / 2, row === 0 ? y + (B - Ws) / 2 : y + Ws + (B - Ws) / 2, 'C-Tech ' + (i + 1), 0.7);
    const dy = row === 0 ? y + 0.6 : y + B - 1.2;
    g.rect(x + 1, dy, L - 2, 0.6, 'EQUIP'); g.text(x + L / 2, dy + (row === 0 ? 1.0 : -0.4), 'decanter', 0.4, 'EQUIP');
    const zy0 = row === 0 ? y + 1.6 : y + Ws + 0.4, zh = B - Ws - 2.0;
    const nL = Math.max(2, Math.round(L / 9));
    for (let k = 0; k < nL; k++) DRW.lattice(g, x + 0.8 + k * (L - 1.6) / nL, zy0, (L - 1.6) / nL - 0.6, zh, 5, false);
  }
  const rows = Math.ceil(N / cols);
  g.rect(-tw, -tw, cols * L + (cols + 1) * tw, rows * B + (rows + 1) * tw);
  g.dim(0, -tw - 1.2, L, -tw - 1.2, 0, 'L = ' + U.fmt(L) + ' m', 0.7);
  g.dim(-tw - 1.2, 0, -tw - 1.2, B, 0, 'B = ' + U.fmt(B), 0.6);
  // mặt cắt ngang
  const ox = cols * (L + tw) + 8, H = c.TWL;
  g.poly([[ox, H + fb], [ox, 0], [ox + B, 0], [ox + B, H + fb]]);
  g.line(ox + Ws, H + fb, ox + Ws, 1.0);
  g.line(ox, H, ox + B, H, 'WATER'); g.text(ox + B + 0.4, H, 'TWL ' + U.fmt(H), 0.45, 'WATER', 'start');
  g.line(ox + Ws, c.BWL, ox + B, c.BWL, 'WATER'); g.text(ox + B + 0.4, c.BWL, 'BWL ' + U.fmt(c.BWL), 0.45, 'WATER', 'start');
  for (let k = 0; k < 8; k++) g.circle(ox + Ws + 0.5 + (B - Ws - 1) * (k + 0.5) / 8, S.ct.hd, 0.12, 'EQUIP');
  g.text(ox + Ws / 2, H / 2, 'SEL', 0.45);
  g.dim(ox, H, ox, 0, 1.2, 'TWL = ' + U.fmt(H), 0.45);
  g.dim(ox + B, H, ox + B, c.BWL, -3.0, 'ΔH = ' + U.fmt(S.ct.dH), 0.4);
  g.text(ox + B / 2, H + fb + 1.5, 'MẶT CẮT – chu kỳ ' + U.fmt(c.TC) + ' h', 0.7);
  return g;
};

/* ---- bể màng Kubota ---- */
DRW.kubota = function (S, R) {
  const K = R.mbr.kub, m = K.mod, g = new Dwg('Bể màng Kubota – bố trí SMU'), tw = S.build.tWallAT, gap = S.mbr.kub.gap;
  const nTr = S.mbr.nTrains, per = K.nU / nTr;
  for (let t = 0; t < nTr; t++) {
    const y0 = t * (K.tankW + tw + 1.2);
    g.rect(0, y0, K.tankL, K.tankW);
    let cnt = 0;
    for (let r = 0; r < K.rows; r++) for (let c = 0; c < K.perRow; c++) {
      if (cnt++ >= per) break;
      const x = gap + c * (m.Lu + gap), y = y0 + gap + r * (m.Wu + gap);
      g.rect(x, y, m.Lu, m.Wu, 'EQUIP');
      g.line(x, y, x + m.Lu, y + m.Wu, 'EQUIP');
    }
    g.text(K.tankL / 2, y0 + K.tankW + 0.55, 'Dây chuyền ' + (t + 1) + ': ' + per + ' × ' + m.id.replace('KB-', 'Kubota '), 0.35);
  }
  g.dim(0, -0.8, K.tankL, -0.8, 0, U.fmt(K.tankL) + ' m', 0.35);
  g.dim(-0.8, 0, -0.8, K.tankW, 0, U.fmt(K.tankW) + ' m', 0.35);
  // mặt cắt một bộ
  const ox = K.tankL + 4, H = K.tankH;
  g.poly([[ox, H + 0.4], [ox, 0], [ox + m.Wu + 2 * gap, 0], [ox + m.Wu + 2 * gap, H + 0.4]]);
  g.line(ox, H, ox + m.Wu + 2 * gap, H, 'WATER');
  const z0 = 0.5;
  g.rect(ox + gap, z0, m.Wu, 0.5, 'EQUIP'); g.text(ox + gap + m.Wu / 2, z0 + 0.25, 'bộ khuếch tán', 0.22, 'EQUIP');
  const dh = (m.H - 0.6) / m.deck;
  for (let k = 0; k < m.deck; k++) { g.rect(ox + gap, z0 + 0.6 + k * dh, m.Wu, dh - 0.1, 'EQUIP'); g.text(ox + gap + m.Wu / 2, z0 + 0.6 + (k + 0.5) * dh, 'tầng màng ' + (k + 1), 0.25, 'EQUIP'); }
  g.dim(ox + m.Wu + 2 * gap, H, ox + m.Wu + 2 * gap, 0, 0.8, 'H = ' + U.fmt(H), 0.3);
  g.text(ox + m.Wu / 2, H + 1.0, 'MẶT CẮT SMU', 0.4);
  return g;
};

/* ---- bể màng MBR chung (AD 9.1: mặt bằng & mặt cắt dọc đúng tỷ lệ) ---- */
DRW.mbrLayout = function (S, R) {
  const M = R.mbr, m = S.mbr, mod = M.mod, nTr = Math.max(1, m.nTrains);
  const per = Math.ceil(M.nFE / nTr);
  // kích thước module trên mặt bằng: Wm (ngang bể) × Lm (dọc bể) từ diện tích chiếm chỗ, tỉ lệ ~ 1 : 1,6
  const Wm = Math.sqrt(mod.foot / 1.6), Lm = mod.foot / Wm, gap = 0.6, wall = 0.8;
  const nRow = per > 6 ? 2 : 1, perRow = Math.ceil(per / nRow);
  const tankL = 2 * wall + perRow * Lm + (perRow - 1) * gap, tankW = 2 * wall + nRow * Wm + (nRow - 1) * gap;
  return { per, Wm, Lm, gap, wall, nRow, perRow, tankL, tankW, H: m.Hmb, modH: mod.H || 2.5 };
};
DRW.mbr = function (S, R) {
  const M = R.mbr, m = S.mbr, g = new Dwg('Bể màng MBR – mặt bằng & mặt cắt'), tw = S.build.tWallAT, fb = S.build.free;
  const K = DRW.mbrLayout(S, R), nTr = Math.max(1, m.nTrains);
  // mặt bằng: nTr bể màng song song, kênh phân phối phía đầu, kênh tuần hoàn phía cuối
  for (let t = 0; t < nTr; t++) {
    const y0 = t * (K.tankW + tw);
    g.rect(0, y0, K.tankL, K.tankW);
    let c = 0;
    for (let r = 0; r < K.nRow; r++) for (let k = 0; k < K.perRow; k++) {
      if (c++ >= K.per) break;
      const x = K.wall + k * (K.Lm + K.gap), y = y0 + K.wall + r * (K.Wm + K.gap);
      g.rect(x, y, K.Lm, K.Wm, 'EQUIP');
      for (let j = 1; j < 5; j++) g.line(x + K.Lm * j / 5, y, x + K.Lm * j / 5, y + K.Wm, 'EQUIP');
    }
    g.text(K.tankL / 2, y0 + K.tankW - 0.35, 'Dây chuyền ' + (t + 1) + ': ' + K.per + ' khối', 0.32);
  }
  const Wtot = nTr * K.tankW + (nTr - 1) * tw;
  g.rect(-tw, -tw, K.tankL + 2 * tw, Wtot + 2 * tw);
  g.rect(-tw - 1.2, -tw, 1.2, Wtot + 2 * tw); g.text(-tw - 0.6, Wtot / 2, 'KÊNH VÀO', 0.3);
  g.text(K.tankL + tw + 0.3, Wtot / 2 + 0.6, '→ tuần hoàn ' + U.fmt(m.recir, 1) + '·Q_M', 0.32, 'SLUDGE', 'start');
  g.text(K.tankL + tw + 0.3, Wtot / 2 - 0.4, '→ nước thấm ' + nTr + ' bơm', 0.32, 'FLOW', 'start');
  g.dim(0, -tw - 1.0, K.tankL, -tw - 1.0, 0, 'L = ' + U.fmt(K.tankL) + ' m', 0.4);
  g.dim(-tw - 2.2, 0, -tw - 2.2, K.tankW, 0, 'B = ' + U.fmt(K.tankW), 0.35);
  g.text(K.tankL / 2, Wtot + tw + 1.0, 'MẶT BẰNG – ' + nTr + ' bể màng, ' + M.nFE + ' × ' + M.mod.name, 0.45);
  // mặt cắt dọc một dây chuyền
  const oy = -K.H - fb - 4, H = K.H, hB = m.hBelow ?? 0.3, zMod = hB + 0.25;
  g.poly([[0, oy + H + fb], [0, oy], [K.tankL, oy], [K.tankL, oy + H + fb]]);
  g.line(0, oy + H, K.tankL, oy + H, 'WATER'); g.text(K.tankL + 0.3, oy + H, 'MN ' + U.fmt(H), 0.3, 'WATER', 'start');
  for (let k = 0; k < K.perRow && k < K.per; k++) {
    const x = K.wall + k * (K.Lm + K.gap);
    g.rect(x, oy + hB, K.Lm, 0.2, 'EQUIP');                                   // bộ sục khí rửa
    g.rect(x, oy + zMod, K.Lm, Math.min(K.modH, H - zMod - (m.hAbove ?? 0.1)), 'EQUIP');
    g.line(x + K.Lm / 2, oy + zMod + K.modH, x + K.Lm / 2, oy + H + fb + 0.6, 'FLOW');   // ống thu nước thấm
  }
  const yP = oy + H + fb + 0.6;
  g.line(K.wall + K.Lm / 2, yP, K.tankL + 1.5, yP, 'FLOW');
  g.circle(K.tankL + 2.0, yP, 0.45, 'EQUIP'); g.text(K.tankL + 2.0, yP + 0.9, 'P', 0.35, 'EQUIP');
  g.text(K.tankL + 2.8, yP, (M.permItem ? M.permItem.name : 'bơm thấm') + ', H = ' + U.fmt(M.Hp) + ' m', 0.28, 'EQUIP', 'start');
  // khí rửa
  g.line(-1.5, oy + hB + 0.1, K.tankL - K.wall, oy + hB + 0.1, 'EQUIP');
  g.text(-1.6, oy + hB + 0.55, 'khí rửa ' + U.fmt(M.QCF, 0) + ' Nm³/h', 0.28, 'EQUIP', 'end');
  g.dim(K.tankL, oy + H, K.tankL, oy, -1.2, 'H = ' + U.fmt(H), 0.35);
  g.dim(-0.6, oy + zMod, -0.6, oy + zMod + K.modH, 0, 'module ' + U.fmt(K.modH), 0.28);
  g.text(K.tankL / 2, oy - 1.0, 'MẶT CẮT DỌC (1 dây chuyền) – J = ' + U.fmt(M.fluxDes, 1) + ' l/(m²·h) ở Q_M, SAD_m = ' + U.fmt(m.SADm, 2), 0.4);
  return g;
};

/* ---- sơ đồ công nghệ ---- */
DRW.flow = function (S, R) {
  const g = new Dwg('Sơ đồ công nghệ'), M = (R.mach && R.mach.M) || [], MI = (R.mach && R.mach.MI) || [];
  // nhãn theo mã đặt hàng AD (M-<công đoạn>-<loại>) nếu có, ngược lại mã nội bộ
  const tagOf = k => { const m = M.find(x => x.tag.startsWith(k)); if (!m) return ''; const st =MI.find(r => r.name.startsWith(m.name + '.') || r.name === m.name); return st ? st.ord.replace(/\.\d+(\.\d+)?$/, '') : m.tag; };
  const blocks = [];
  const add = (name, sub, tag) => blocks.push({ name, sub, tag });
  const c = S.comp;
  add('Nước thải vào', U.fmt(R.load.Qm) + ' m³/h', '');
  if (c.inletPS) add('Trạm bơm', '', tagOf('10-PU'));
  if (c.screenC || c.screenF) add('Song chắn rác', c.screenF ? 'thô + tinh' : 'thô', tagOf('20-SC'));
  if (R.grit) add(R.grit.type === 'aer' ? 'Lắng cát thổi khí' : 'Lắng cát xoáy', S.grit.grease ? '+ tách mỡ' : '', tagOf('30-'));
  if (R.load.prim.on) add('Lắng sơ cấp', 't_R ' + S.load.prim.tR + ' h', tagOf('40-'));
  if (R.tank && R.tank.an) add('Bể kỵ khí', U.fmt(R.tank.an.V, 0) + ' m³', '');
  if (R.tank && R.tank.sel) add('Selector', U.fmt(R.tank.sel.V, 0) + ' m³', '');
  if (S.opt.line === 'CAS') {
    if (S.opt.process === 'ND' && (S.opt.dn === 'pre' || S.opt.dn === 'casc')) add('Thiếu khí (DN)', U.fmt(R.tank ? R.tank.VD : 0, 0) + ' m³', tagOf('50-MX'));
    add(S.opt.process === 'ND' && S.opt.dn === 'int' ? 'Aerotank N/DN gián đoạn' : 'Aerotank (hiếu khí)', R.tank ? U.fmt(R.tank.V, 0) + ' m³' : '', tagOf('50-BL'));
    add('Bể lắng II', R.sst ? R.sst.n + ' × ' + (R.sst.D ? 'D' + U.fmt(R.sst.D) : U.fmt(R.sst.B) + '×' + U.fmt(R.sst.L)) : '', tagOf('60-'));
  } else if (S.opt.line === 'SBR') {
    if (R.sbr && R.sbr.Vbuf) add('Bể điều hòa', U.fmt(R.sbr.Vbuf, 0) + ' m³', '');
    add('Bể SBR', R.sbr ? S.sbr.n + ' × ' + U.fmt(R.sbr.V1, 0) + ' m³' : '', tagOf('50-DC'));
  } else if (S.opt.line === 'ICEAS') {
    add('Bể ICEAS', R.iceas ? R.iceas.nb + ' × ' + U.fmt(R.iceas.W) + '×' + U.fmt(R.iceas.L) + ' m' : '', tagOf('50-DC'));
  } else if (S.opt.line === 'CTECH') {
    add('Bể C-Tech + selector', R.ctech ? R.ctech.N + ' × ' + U.fmt(R.ctech.L) + '×' + U.fmt(R.ctech.Bw) + ' m' : '', tagOf('50-DC'));
  } else {
    add('Aerotank MBR', R.tank ? U.fmt(R.tank.V, 0) + ' m³' : '', tagOf('50-BL'));
    add('Bể màng', R.mbr ? U.fmt(R.mbr.Areal, 0) + ' m²' : '', tagOf('55-MB'));
  }
  if (c.uv) add('Khử trùng UV', '', tagOf('90-UV'));
  add('Nước ra', '', '');
  const bw = 5.2, bh = 2.6, gap = 2.2;
  const perRow = 7;
  blocks.forEach((b, i) => {
    const row = Math.floor(i / perRow), col = row % 2 ? perRow - 1 - (i % perRow) : i % perRow;
    b.x = col * (bw + gap); b.y = -row * (bh + 5);
    const isIO = b.name.startsWith('Nước');
    if (isIO) g.poly([[b.x, b.y], [b.x + bw - 0.8, b.y], [b.x + bw, b.y + bh / 2], [b.x + bw - 0.8, b.y + bh], [b.x, b.y + bh]], true, 'FLOW');
    else g.rect(b.x, b.y, bw, bh);
    g.text(b.x + bw / 2, b.y + bh * 0.62, b.name, 0.42);
    if (b.sub) g.text(b.x + bw / 2, b.y + bh * 0.3, b.sub, 0.34, 'DIM');
    if (b.tag) g.text(b.x + bw / 2, b.y + bh + 0.35, b.tag, 0.3, 'EQUIP');
  });
  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i], b = blocks[i + 1];
    if (Math.abs(a.y - b.y) < 0.01) {
      const x1 = a.x < b.x ? a.x + bw : a.x, x2 = a.x < b.x ? b.x : b.x + bw, y = a.y + bh / 2;
      g.line(x1, y, x2, y, 'FLOW'); const s = Math.sign(x2 - x1); g.poly([[x2, y], [x2 - 0.4 * s, y + 0.2], [x2 - 0.4 * s, y - 0.2]], true, 'FLOW', '#2d7fd3');
    } else {
      const x = a.x + bw / 2; g.line(x, a.y, x, b.y + bh, 'FLOW'); g.poly([[x, b.y + bh], [x - 0.2, b.y + bh + 0.4], [x + 0.2, b.y + bh + 0.4]], true, 'FLOW', '#2d7fd3');
    }
  }
  // dòng bùn
  const sstB = blocks.find(b => ['Bể lắng II', 'Bể màng', 'Bể SBR', 'Bể ICEAS', 'Bể C-Tech + selector'].includes(b.name));
  const atB = blocks.find(b => b.name.startsWith('Aerotank') || b.name.startsWith('Thiếu khí') || b.name === 'Bể kỵ khí');
  if (sstB && atB && sstB !== atB) {
    const yb = Math.min(sstB.y, atB.y) - 1.4;
    g.poly([[sstB.x + bw / 2, sstB.y], [sstB.x + bw / 2, yb], [atB.x + bw / 2, yb], [atB.x + bw / 2, atB.y]], false, 'SLUDGE');
    g.text((sstB.x + atB.x) / 2 + bw / 2, yb - 0.45, 'Bùn tuần hoàn' + (R.rs ? ' ' + U.fmt(R.rs.QRS, 0) + ' m³/h' : '') + (tagOf('70-PU') ? ' – ' + tagOf('70-PU') : ''), 0.34, 'SLUDGE');
  }
  if (sstB) {
    const y2 = sstB.y - 3.3;
    g.line(sstB.x + bw / 2 + 0.6, sstB.y, sstB.x + bw / 2 + 0.6, y2, 'SLUDGE');
    let x = sstB.x + bw / 2 + 0.6; const steps = [];
    if (S.sludge.thick.on) steps.push('Nén bùn'); if (S.sludge.dig.on) steps.push('Phân hủy kỵ khí'); if (S.sludge.aerob.on) steps.push('Ổn định hiếu khí'); if (S.sludge.tank.on) steps.push('Bể chứa bùn'); if (S.sludge.dew.on) steps.push('Tách nước');
    g.text(x + 0.3, y2 + 1.4, 'Bùn dư' + (R.bio ? ' ' + U.fmt(R.bio.US, 0) + ' kg/d' : ''), 0.34, 'SLUDGE', 'start');
    steps.forEach((s, i) => { const xb = x + 1.0 + i * (bw * 0.8 + 1.2); g.rect(xb, y2 - 0.9, bw * 0.8, 1.8, 'SLUDGE'); g.text(xb + bw * 0.4, y2, s, 0.36, 'SLUDGE'); g.line(i ? xb - 1.2 : x, y2, xb, y2, 'SLUDGE'); });
  }
  g.text(0, bh + 2, 'SƠ ĐỒ CÔNG NGHỆ – ' + S.project.name, 0.8, 'TEXT', 'start');
  return g;
};

/* ---- sơ đồ dây chuyền bùn (AD 8.3) – các khối theo lựa chọn xử lý bùn, nhãn mã đặt hàng M-… ---- */
DRW.flowSludge = function (S, R) {
  const g = new Dwg('Sơ đồ dây chuyền bùn'), sl = R.sludge, s = S.sludge, MI = (R.mach && R.mach.MI) || [];
  const tags = st => [...new Set(MI.filter(r => r.st === st).map(r => r.ord.replace(/\.\d+(\.\d+)?$/, '')))].slice(0, 3).join(', ');
  const bw = 5.6, bh = 2.8, gx = 2.6, B = [];
  const add = (name, sub, st, row = 0) => { const b = { name, sub, tag: st ? tags(st) : '', row }; B.push(b); return b; };
  const src = [];
  if (R.load.prim.on && sl.PS) src.push(add('Bùn sơ cấp', U.fmt(sl.PS, 0) + ' kg TS/d', 'PS', 1));
  src.push(add(S.opt.line === 'MBR' ? 'Bùn dư (bể màng)' : 'Bùn dư', U.fmt(sl.US, 0) + ' kg TS/d', 'ES', 0));
  const chain = [];
  if (sl.thick) chain.push(add(sl.thick.sep ? 'Nén trọng lực (bùn sơ cấp)' : 'Bể nén bùn', U.fmt(sl.thick.V, 0) + ' m³', 'PTH'));
  if (sl.thick && sl.thick.sep) chain.push(add('Nén cơ học bùn dư', 'TS ' + U.fmt((s.thick.TSus || 60) / 10, 1) + ' %', 'MTH'));
  if (sl.dig) { chain.push(add('Bùn tươi', U.fmt(sl.thick ? sl.thick.Qo : sl.Q0, 1) + ' m³/d', 'RMS')); chain.push(add('Bể phân hủy kỵ khí', U.fmt(sl.dig.V, 0) + ' m³, ' + U.fmt(sl.dig.gas, 0) + ' m³ khí/d', 'DP')); chain.push(add('Bể nén sau phân hủy', '', 'STH')); }
  if (sl.aerob) chain.push(add(sl.aerob.thermo ? 'Ổn định ưa nhiệt (ATS)' : 'Ổn định hiếu khí', U.fmt(sl.aerob.V, 0) + ' m³', ''));
  if (sl.tank) chain.push(add('Bể chứa bùn', U.fmt(sl.tank.V, 0) + ' m³', 'ST'));
  if (sl.dew) chain.push(add('Tách nước bùn', 'bánh bùn ' + U.fmt(sl.dew.cake, 1) + ' m³/d', 'DW'));
  chain.push(add('Thải bỏ bùn', U.fmt(sl.disposal, 0) + ' t/năm', ''));
  // bố trí: nguồn bên trái (2 hàng), chuỗi xử lý nằm ngang
  src.forEach((b, i) => { b.x = 0; b.y = (src.length > 1 ? (i ? -1 : 1) : 0) * (bh + 1.5) / 2; });
  chain.forEach((b, i) => { b.x = (i + 1) * (bw + gx); b.y = 0; });
  for (const b of B) {
    const end = b.name === 'Thải bỏ bùn';
    if (end) g.poly([[b.x, b.y], [b.x + bw - 0.8, b.y], [b.x + bw, b.y + bh / 2], [b.x + bw - 0.8, b.y + bh], [b.x, b.y + bh]], true, 'SLUDGE');
    else g.rect(b.x, b.y, bw, bh, 'SLUDGE');
    g.text(b.x + bw / 2, b.y + bh * 0.64, b.name, 0.4);
    if (b.sub) g.text(b.x + bw / 2, b.y + bh * 0.32, b.sub, 0.3, 'DIM');
    if (b.tag) g.text(b.x + bw / 2, b.y - 0.4, b.tag, 0.27, 'EQUIP');
  }
  const arrow = (x1, y1, x2, y2, ly = 'SLUDGE') => { g.line(x1, y1, x2, y2, ly); const a = Math.atan2(y2 - y1, x2 - x1), k = 0.4; g.poly([[x2, y2], [x2 - k * Math.cos(a) + 0.2 * Math.sin(a), y2 - k * Math.sin(a) - 0.2 * Math.cos(a)], [x2 - k * Math.cos(a) - 0.2 * Math.sin(a), y2 - k * Math.sin(a) + 0.2 * Math.cos(a)]], true, ly, '#8b5a2b'); };
  const first = chain[0];
  for (const b of src) arrow(b.x + bw, b.y + bh / 2, first.x, first.y + bh / 2);
  for (let i = 0; i < chain.length - 1; i++) arrow(chain[i].x + bw, bh / 2, chain[i + 1].x, bh / 2);
  // nước tách hoàn lưu về đầu vào
  const sup = (sl.supT || 0) + (sl.supD || 0);
  if (sup > 0) {
    const yb = -bh - 2.2, xs = chain.filter(b => /nén|chứa|Tách nước/i.test(b.name)).map(b => b.x + bw / 2);
    for (const x of xs) g.line(x, 0, x, yb, 'FLOW');
    if (xs.length) { arrow(Math.max(...xs), yb, -2.5, yb, 'FLOW'); g.text(-2.6, yb + 0.5, 'Nước tách bùn ' + U.fmt(sup, 1) + ' m³/d → đầu vào' + (tags('SN') ? ' (' + tags('SN') + ')' : ''), 0.32, 'FLOW', 'end'); }
  }
  if (sl.dig) { const d = chain.find(b => b.name.startsWith('Bể phân hủy')); arrow(d.x + bw / 2, bh, d.x + bw / 2, bh + 2.2, 'EQUIP'); g.text(d.x + bw / 2, bh + 2.7, 'Khí sinh học → CHP ' + U.fmt(sl.dig.Eel, 0) + ' kWh_el/d', 0.32, 'EQUIP'); }
  g.text(0, bh + 4.2, 'SƠ ĐỒ DÂY CHUYỀN BÙN – ' + S.project.name, 0.7, 'TEXT', 'start');
  return g;
};

// danh sách bản vẽ khả dụng
DRW.list = function (S, R) {
  const L = [];
  if (R.sst && R.sst.hop) L.push(['sst', 'Bể lắng II', () => DRW.sstHop(S, R)]);
  else if (R.sst && R.sst.D && R.sst.zones) L.push(['sst', 'Bể lắng II', () => DRW.sstCirc(S, R)]);
  if (R.sst && R.sst.B && R.sst.zones) L.push(['sst', 'Bể lắng II', () => DRW.sstRect(S, R)]);
  if (R.tank) L.push(['at', 'Bể aerotank', () => DRW.at(S, R)]);
  if (R.sbr) L.push(['sbr', 'Bể SBR', () => DRW.sbr(S, R)]);
  if (R.iceas) L.push(['iceas', 'Bể ICEAS', () => DRW.iceas(S, R)]);
  if (R.ctech) L.push(['ctech', 'Bể C-Tech', () => DRW.ctech(S, R)]);
  if (R.mbr && R.mbr.kub) L.push(['kubota', 'Bể màng Kubota', () => DRW.kubota(S, R)]);
  else if (R.mbr && R.mbr.mod && S.mbr.place !== 'in') L.push(['mbr', 'Bể màng MBR', () => DRW.mbr(S, R)]);
  if (R.load) L.push(['flow', 'Sơ đồ công nghệ', () => DRW.flow(S, R)]);
  if (R.sludge) L.push(['flowS', 'Sơ đồ dây chuyền bùn', () => DRW.flowSludge(S, R)]);
  return L;
};
