/*
 * SimXLNT – Bản vẽ thiết kế sơ bộ NEREDA® trong trình duyệt.
 * Dựng 8 tờ A1 từ kết quả NeredaEngine.compute() rồi xuất SVG (xem trước), PDF (jsPDF) và DXF R12 (AutoCAD).
 * Toạ độ tờ giấy: mm, gốc góc dưới trái, trục y hướng lên (như DXF). Hình chiếu đổi m thực → mm giấy theo tỷ lệ.
 * Cùng bố cục và giả định với bộ công cụ Python nereda/drawings/ (bản có hatch và kích thước DIMENSION đầy đủ).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeredaDrawings = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // tên lớp: [màu ACI, màu hiển thị, nét (mm), kiểu nét]
  const LAYERS = {
    KHUNG: [7, '#000000', 0.5, null], KHUNG_MANH: [7, '#000000', 0.18, null], CHU: [7, '#000000', 0.13, null],
    TUONG: [7, '#000000', 0.35, null], NET_THAY: [7, '#000000', 0.18, null], KHUAT: [8, '#7a7a7a', 0.13, 'DASHED'],
    TRUC: [1, '#d01818', 0.13, 'CENTER'], KICH_THUOC: [3, '#0a8a2a', 0.13, null], KY_HIEU: [7, '#000000', 0.18, null],
    ONG_NUOC: [5, '#1450c8', 0.35, null], ONG_KHI: [30, '#f07800', 0.35, null], ONG_BUN: [34, '#8b4a14', 0.35, null],
    ONG_HC: [6, '#b000b0', 0.25, 'DASHED'], THIET_BI: [3, '#0a9a2a', 0.25, null], MUC_NUOC: [5, '#1450c8', 0.18, null],
    BUN: [42, '#b8860b', 0.18, 'DASHED'], NUOC: [254, '#d8dde2', 0, null], HATCH: [8, '#9aa0a6', 0.09, null],
    DAT: [8, '#7a7a7a', 0.13, null], PHA_F: [131, '#9fe6f0', 0, null], PHA_W: [151, '#c2dcf5', 0, null],
    PHA_A: [41, '#ffd98a', 0, null], PHA_S: [91, '#b9eeb0', 0, null], PHA_I: [9, '#d0d0d0', 0, null]
  };
  const WALL_FILL = '#b8bec4';
  const SCALES = [20, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 5000];
  const COL_X0 = 646;
  const GALLERY = 4.0, EFF_CH = 1.5, TROUGH_W = 0.5, DISC_R = 0.115, GROUND = 1.5;
  const SHEETS = [
    ['NR-00', 'Bìa – danh mục – cơ sở thiết kế – thông số chính'],
    ['NR-01', 'Sơ đồ công nghệ (PFD) và cân bằng chất lượng'],
    ['NR-02', 'Tổng mặt bằng sơ bộ'],
    ['NR-03', 'Mặt bằng cụm bể NEREDA'],
    ['NR-04', 'Mặt cắt bể NEREDA'],
    ['NR-05', 'Bố trí đĩa phân phối khí và ống phân phối nước đáy – 1 bể'],
    ['NR-06', 'Chu trình vận hành mùa khô và mùa mưa'],
    ['NR-07', 'Bảng thống kê thiết bị và đường ống']
  ];

  function fnum(v, d = 0) {
    if (v == null || !isFinite(v)) return '–';
    return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  }
  function fitScale(wm, hm, wmm, hmm) {
    const need = Math.max(wm * 1000 / wmm, hm * 1000 / hmm);
    for (const s of SCALES) if (s >= need) return s;
    return SCALES[SCALES.length - 1];
  }
  // Bề rộng ước tính theo phông DejaVu Sans (cỡ chữ = 1,38 × chiều cao chữ hoa h)
  function textW(t, h, bold) {
    let w = 0;
    for (const ch of String(t)) {
      if (ch === ' ') w += 0.44;
      else if (/[ilIjtf.,:;'|!()\[\]\/-]/.test(ch)) w += 0.45;
      else if (/[mwMW%]/.test(ch)) w += 1.2;
      else if (/[0-9]/.test(ch)) w += 0.88;
      else if (ch !== ch.toLowerCase()) w += 0.98;
      else w += 0.78;
    }
    return w * h * (bold ? 1.16 : 1.06);
  }
  function wrap(text, width, h, bold) {
    const out = []; let line = '';
    for (const w of String(text).split(/\s+/)) {
      if (!w) continue;
      const t = line ? line + ' ' + w : w;
      if (line && textW(t, h, bold) > width) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  // ------------------------------------------------------------------ Tờ giấy
  class Sheet {
    constructor(number, title, scaleNote, project) {
      this.number = number; this.title = title; this.scaleNote = scaleNote || '–'; this.project = project || {};
      this.W = 841; this.H = 594; this.e = [];
      this.frame();
    }
    line(a, b, ly = 'NET_THAY') { this.e.push({ t: 'pl', pts: [a, b], closed: false, ly }); }
    pline(pts, ly = 'NET_THAY', closed = false) { this.e.push({ t: 'pl', pts: pts.slice(), closed, ly }); }
    rect(x0, y0, x1, y1, ly = 'NET_THAY') { this.pline([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], ly, true); }
    circle(c, r, ly = 'NET_THAY') { this.e.push({ t: 'ci', c, r, ly }); }
    solid(pts, ly = 'NUOC', rgb) { this.e.push({ t: 'so', pts, ly, rgb }); }
    region(outer, holes, ly = 'TUONG', rgb = WALL_FILL) { this.e.push({ t: 're', outer, holes, ly, rgb }); }
    text(s, x, y, h = 2.5, al = 'L', bold = false, rot = 0, ly = 'CHU') { if (s === null || s === undefined || String(s).trim() === '') return; this.e.push({ t: 'tx', s: String(s), x, y, h, al, bold, rot, ly }); }
    para(t, x, y, width, h = 2.2, gap = 1.55, bold = false) {
      for (const ln of wrap(t, width, h, bold)) { this.text(ln, x, y, h, 'L', bold); y -= h * gap; }
      return y;
    }
    table(x, y, colw, rows, h = 2.2, opt = {}) {
      const rh = h * 2.1, W = colw.reduce((a, b) => a + b, 0), al = opt.aligns;
      let yy = y;
      this.line([x, yy], [x + W, yy], 'KHUNG_MANH');
      rows.forEach((r, i) => {
        const cells = r.map((c, j) => (c === null || c === '' ? [''] : wrap(c, colw[j] - 2, h)));
        const n = Math.max(...cells.map(c => c.length));
        const hh = rh + (n - 1) * h * 1.45;
        cells.forEach((ls, j) => {
          const cx = x + colw.slice(0, j).reduce((a, b) => a + b, 0), a = al ? al[j] : 'L', b = opt.header !== false && i === 0;
          ls.forEach((ln, k) => {
            const ty = yy - rh * 0.68 - k * h * 1.45;
            if (a === 'R') this.text(ln, cx + colw[j] - 1.2, ty, h, 'R', b);
            else if (a === 'C') this.text(ln, cx + colw[j] / 2, ty, h, 'C', b);
            else this.text(ln, cx + 1.2, ty, h, 'L', b);
          });
        });
        yy -= hh;
        this.line([x, yy], [x + W, yy], 'KHUNG_MANH');
      });
      let cx = x;
      for (const w of [0].concat(colw)) { cx += w; this.line([cx, y], [cx, yy], 'KHUNG_MANH'); }
      return yy;
    }
    frame() {
      const W = this.W, H = this.H, P = this.project;
      this.rect(0, 0, W, H, 'KHUNG_MANH'); this.rect(10, 10, W - 10, H - 10, 'KHUNG');
      const x0 = W - 10 - 188, x1 = W - 10;
      this.rect(x0, 10, x1, 84, 'KHUNG');
      [[84, 72, 'CHỦ ĐẦU TƯ', ''], [72, 60, 'ĐƠN VỊ TƯ VẤN', ''], [60, 46, 'DỰ ÁN', P.name || ''], [46, 34, 'TÊN BẢN VẼ', this.title]].forEach(([yt, yb, lab, val]) => {
        this.line([x0, yb], [x1, yb], 'KHUNG_MANH');
        this.text(lab, x0 + 2, yt - 4, 2.0);
        let vy = yt - 4;
        for (const ln of wrap(val, 140, 2.6).slice(0, 2)) { this.text(ln, x0 + 40, vy, 2.6, 'L', lab === 'TÊN BẢN VẼ'); vy -= 4.2; }
      });
      this.line([x0 + 38, 34], [x0 + 38, 84], 'KHUNG_MANH');
      const cells = [['THIẾT KẾ', ''], ['KIỂM TRA', ''], ['CHỦ TRÌ', ''], ['GIAI ĐOẠN', 'THIẾT KẾ SƠ BỘ'], ['TỶ LỆ', this.scaleNote], ['NGÀY', P.date || ''], ['SỐ HIỆU', this.number]];
      const cw = 188 / cells.length;
      cells.forEach(([lab, val], i) => {
        const cx = x0 + i * cw;
        if (i) this.line([cx, 10], [cx, 34], 'KHUNG_MANH');
        this.text(lab, cx + 1.5, 29, 1.8);
        wrap(val, cw - 2, 1.9).slice(0, 2).forEach((ln, k) => this.text(ln, cx + 1.5, 21 - k * 4, lab === 'SỐ HIỆU' ? 3.5 : 1.9, 'L', lab === 'SỐ HIỆU'));
      });
      this.rect(x0, 84, x1, 95, 'KHUNG_MANH');
      this.text('LẦN', x0 + 2, 90.8, 1.8); this.text('NGÀY', x0 + 16, 90.8, 1.8); this.text('NỘI DUNG SỬA ĐỔI', x0 + 42, 90.8, 1.8);
      this.text('R0', x0 + 2, 85.5, 2.0); this.text(P.date || '', x0 + 16, 85.5, 2.0); this.text('Phát hành lần đầu – thiết kế sơ bộ', x0 + 42, 85.5, 2.0);
      this.text('Lập bằng SimXLNT – bộ tính toán NEREDA® độc lập, không liên kết Royal HaskoningDHV', 14, 13, 1.8);
    }
  }

  // ------------------------------------------------------------------ Hình chiếu tỷ lệ
  class View {
    constructor(sh, ox, oy, scale) { this.s = sh; this.ox = ox; this.oy = oy; this.sc = scale; this.k = 1000 / scale; }
    P(x, y) { return [this.ox + x * this.k, this.oy + y * this.k]; }
    line(a, b, ly) { this.s.line(this.P(...a), this.P(...b), ly); }
    pline(pts, ly, closed) { this.s.pline(pts.map(p => this.P(...p)), ly, closed); }
    rect(x0, y0, x1, y1, ly) { const a = this.P(x0, y0), b = this.P(x1, y1); this.s.rect(a[0], a[1], b[0], b[1], ly); }
    circle(c, r, ly) { this.s.circle(this.P(...c), r * this.k, ly); }
    water(x0, y0, x1, y1) { const a = this.P(x0, y0), b = this.P(x1, y1); this.s.solid([a, [b[0], a[1]], b, [a[0], b[1]]], 'NUOC'); }
    wallRect(x0, y0, x1, y1) { const a = this.P(x0, y0), b = this.P(x1, y1); this.s.region([a, [b[0], a[1]], b, [a[0], b[1]]], [], 'TUONG'); }
    region(outer, holes) { this.s.region(outer.map(p => this.P(...p)), holes.map(h => h.map(p => this.P(...p))), 'TUONG'); }
    text(t, x, y, h, al, bold, rot) { const p = this.P(x, y); this.s.text(t, p[0], p[1], h, al, bold, rot); }
    dim(a, b, off, horiz = true) {
      const p1 = this.P(...a), p2 = this.P(...b), s = this.s, ly = 'KICH_THUOC';
      const val = Math.round((horiz ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1])) * 1000);
      if (horiz) {
        const by = this.oy + off * this.k, d = by >= p1[1] ? 1 : -1;
        s.line(p1, [p1[0], by + d * 1.0], ly); s.line(p2, [p2[0], by + d * 1.0], ly);
        s.line([p1[0], by], [p2[0], by], ly);
        for (const x of [p1[0], p2[0]]) s.line([x - 0.8, by - 0.8], [x + 0.8, by + 0.8], ly);
        s.text(String(val), (p1[0] + p2[0]) / 2, by + 0.7, 2.0, 'BC', false, 0, ly);
      } else {
        const bx = this.ox + off * this.k, d = bx >= p1[0] ? 1 : -1;
        s.line(p1, [bx + d * 1.0, p1[1]], ly); s.line(p2, [bx + d * 1.0, p2[1]], ly);
        s.line([bx, p1[1]], [bx, p2[1]], ly);
        for (const y of [p1[1], p2[1]]) s.line([bx - 0.8, y - 0.8], [bx + 0.8, y + 0.8], ly);
        s.text(String(val), bx - 0.7, (p1[1] + p2[1]) / 2, 2.0, 'BC', false, 90, ly);
      }
    }
    level(x, z, label, side = 1) {
      const [px, py] = this.P(x, z), s = this.s;
      s.pline([[px, py], [px - 1.6, py + 2.4], [px + 1.6, py + 2.4]], 'KY_HIEU', true);
      s.line([side > 0 ? px - 1.6 : px - 16, py + 2.4], [side > 0 ? px + 16 : px + 1.6, py + 2.4], 'KY_HIEU');
      const t = label != null ? label : (z >= 0 ? '+' : '') + fnum(z, 3);
      s.text(t, px + (side > 0 ? 2.2 : -2.2), py + 3.0, 2.0, side > 0 ? 'L' : 'R');
    }
    tagto(pt, text, tx, ty, h = 2.2) {
      const p = this.P(...pt), lines = Array.isArray(text) ? text : [text], s = this.s;
      const w = Math.max(...lines.map(l => l.length)) * 0.62 * h, right = tx >= p[0];
      s.line(p, [tx, ty], 'KY_HIEU'); s.line([tx, ty], [right ? tx + w : tx - w, ty], 'KY_HIEU');
      lines.slice().reverse().forEach((ln, i) => s.text(ln, right ? tx : tx - w, ty + 1.0 + i * h * 1.45, h));
      s.circle(p, 0.5, 'KY_HIEU');
    }
  }
  function title(sh, x, y, t, h = 4.0) {
    sh.text(t, x, y, h, 'L', true);
    sh.line([x, y - 1.6], [x + t.length * 0.66 * h, y - 1.6], 'KHUNG');
  }
  function notes(sh, x, y, items, width = 180, h = 2.2, head = 'GHI CHÚ') {
    sh.text(head, x, y, 2.8, 'L', true); y -= 5;
    items.forEach((t, i) => {
      sh.text(`${i + 1}.`, x, y, h);
      for (const ln of wrap(t, width - 6, h)) { sh.text(ln, x + 5, y, h); y -= h * 1.55; }
      y -= 0.8;
    });
    return y;
  }
  function arrow(sh, pts, ly = 'ONG_NUOC', size = 2.2) {
    sh.pline(pts, ly);
    const [x0, y0] = pts[pts.length - 2], [x1, y1] = pts[pts.length - 1], a = Math.atan2(y1 - y0, x1 - x0);
    const p1 = [x1 - size * Math.cos(a) + size * 0.45 * Math.sin(a), y1 - size * Math.sin(a) - size * 0.45 * Math.cos(a)];
    const p2 = [x1 - size * Math.cos(a) - size * 0.45 * Math.sin(a), y1 - size * Math.sin(a) + size * 0.45 * Math.cos(a)];
    sh.solid([[x1, y1], p1, p2], ly, LAYERS[ly][1]);
  }
  function valve(sh, c, size = 2.0, rot = 0) {
    const [x, y] = c, ca = Math.cos(rot), sa = Math.sin(rot), P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
    sh.pline([P(-size, -size * 0.6), P(size, size * 0.6), P(size, -size * 0.6), P(-size, size * 0.6)], 'THIET_BI', true);
  }
  function box(sh, x, y, w, h, lines, ly = 'THIET_BI', th = 2.4) {
    sh.rect(x, y, x + w, y + h, ly);
    const n = lines.length;
    lines.forEach((t, i) => sh.text(t, x + w / 2, y + h / 2 + (n - 1) * th * 0.75 - i * th * 1.5, i === 0 ? th : th * 0.85, 'MC', i === 0));
  }

  // ------------------------------------------------------------------ Hình học cụm bể, đĩa khí, tổng mặt bằng
  function cluster(R) {
    const p = R.p, rc = R.reactor, eq = R.equip, c = {};
    c.N = Math.round(p.Nr); c.H = p.H; c.t = eq.wallT; c.circ = p.shape === 'circ';
    if (c.circ) { c.D = rc.dims.D; c.W = c.L = c.D; } else { c.W = rc.dims.W; c.L = rc.dims.L; }
    c.ntop = c.N === 1 ? 1 : Math.ceil(c.N / 2); c.nbot = c.N - c.ntop;
    const t = c.t, G = GALLERY; c.gap = c.circ ? 3.0 : 0.0; c.reactors = [];
    let k = 0;
    for (const [row, n] of [['T', c.ntop], ['B', c.nbot]]) {
      for (let i = 0; i < n; i++) {
        const x0 = t + i * (c.W + t + c.gap);
        let y0, y1;
        if (row === 'T') { y0 = G / 2 + t; y1 = y0 + c.L; } else { y1 = -(G / 2 + t); y0 = y1 - c.L; }
        k++;
        c.reactors.push({ id: `R-${300 + k}`, k, row, x0, y0, x1: x0 + c.W, y1, cx: x0 + c.W / 2, cy: (y0 + y1) / 2 });
      }
    }
    c.X = t + c.ntop * (c.W + t + c.gap) - c.gap;
    c.Xbot = c.nbot ? t + c.nbot * (c.W + t + c.gap) - c.gap : 0;
    const yt = G / 2 + t + c.L + t, yb = -(G / 2 + t + c.L + t);
    c.chTop = [t, yt, c.X - t, yt + EFF_CH];
    c.chBot = c.nbot ? [t, yb - EFF_CH, c.Xbot - t, yb] : null;
    c.gallery = [t, -G / 2, c.X - t, G / 2];
    c.Ytop = yt + EFF_CH + t;
    c.Ybot = c.nbot ? yb - EFF_CH - t : -G / 2 - t;
    c.nTrough = Math.max(2, Math.ceil(eq.weirLen / (2 * c.L)));
    c.troughsX = Array.from({ length: c.nTrough }, (_, i) => (i + 0.5) * c.W / c.nTrough);
    // đường bao ngoài cụm (đa giác vuông góc) và các lòng bể
    c.outline = (!c.nbot || Math.abs(c.Xbot - c.X) < 1e-6) ? [[0, c.Ybot], [c.X, c.Ybot], [c.X, c.Ytop], [0, c.Ytop]]
      : [[0, c.Ybot], [c.Xbot, c.Ybot], [c.Xbot, -G / 2 - t], [c.X, -G / 2 - t], [c.X, c.Ytop], [0, c.Ytop]];
    const rr = q => [[q[0], q[1]], [q[2], q[1]], [q[2], q[3]], [q[0], q[3]]];
    c.holes = (c.circ ? [] : c.reactors.map(r => rr([r.x0, r.y0, r.x1, r.y1]))).concat([rr(c.chTop)], c.chBot ? [rr(c.chBot)] : [], [rr(c.gallery)]);
    return c;
  }

  function discLayout(R, c) {
    const n = Math.round(R.air.nDisc), W = c.W, L = c.L, nGrid = Math.max(1, Math.ceil(L / 16.0));
    if (c.circ) {
      const Rr = c.D / 2 - 0.5; let s = Math.sqrt(Math.PI * Rr * Rr / n), cand;
      for (;;) {
        const k = Math.floor(Rr / s) + 1; cand = [];
        for (let j = -k; j <= k; j++) for (let i = -k; i <= k; i++) if ((i * s) ** 2 + (j * s) ** 2 <= Rr * Rr) cand.push([c.D / 2 + i * s, c.D / 2 + j * s]);
        if (cand.length >= n) break;
        s *= 0.98;
      }
      const drop = cand.length - n;
      if (drop) { const step = cand.length / drop, rm = new Set(Array.from({ length: drop }, (_, i) => Math.floor(i * step))); cand = cand.filter((_, i) => !rm.has(i)); }
      const grids = Array.from({ length: nGrid }, (_, g) => {
        const y0 = g * c.D / nGrid, y1 = (g + 1) * c.D / nGrid;
        return { g: g + 1, y0, y1, n: cand.filter(q => q[1] >= y0 && (q[1] < y1 || g === nGrid - 1)).length, nx: 0, ny: 0, sx: s, sy: s };
      });
      return { grids, pts: cand };
    }
    const base = Math.floor(n / nGrid), extra = n % nGrid, grids = [], pts = [];
    for (let g = 0; g < nGrid; g++) {
      const ng = base + (g < extra ? 1 : 0), gy0 = g * L / nGrid, gl = L / nGrid;
      const a = (W - 1.0) / Math.max(gl - 1.0, 0.5);
      const nx = Math.max(1, Math.ceil(Math.sqrt(ng * a))), ny = Math.max(1, Math.ceil(ng / nx));
      const sx = (W - 1.0) / nx, sy = (gl - 1.0) / ny, gp = [];
      for (let j = 0; j < ny; j++) {
        const m = Math.min(nx, ng - j * nx); if (m <= 0) break;
        const xs = 0.5 + sx / 2 + (nx - m) * sx / 2;
        for (let i = 0; i < m; i++) gp.push([xs + i * sx, gy0 + 0.5 + sy / 2 + j * sy]);
      }
      grids.push({ g: g + 1, y0: gy0, y1: gy0 + gl, n: gp.length, nx, ny, sx, sy });
      pts.push(...gp);
    }
    if (pts.length !== n) throw new Error(`Số đĩa bố trí ${pts.length} khác số đĩa tính toán ${n}`);
    return { grids, pts };
  }

  function site(R, c) {
    const p = R.p, f = R.flow, eq = R.equip, rc = R.reactor, m = 12, road = 7, qh = f.QrwfH, s = {};
    const aGrit = Math.max(qh * 3 / 60 / 3.5, 20), ptW = Math.max(6, Math.sqrt(aGrit / 4));
    s.pt = { name: 'Tiền xử lý (song chắn tinh, lắng cát, tách dầu mỡ)', w: ptW * 4 + 10, h: ptW * 2 + 4 };
    s.buf = p.buffer && rc.Vbuf > 0 ? { name: `Bể điều hòa V = ${fnum(rc.Vbuf)} m³`, D: Math.max(8, Math.sqrt(4 * rc.Vbuf / 6 / Math.PI)) } : null;
    s.blow = { name: 'Nhà máy thổi khí', w: 6 + 4.5 * (eq.blowerDuty + eq.blowerStby), h: 12 };
    const aDis = Math.max(qh * 0.5 / 3.0, 30);
    s.dis = { name: 'Khử trùng (UV / clo)', w: Math.max(8, Math.sqrt(aDis * 3)), h: Math.max(4, Math.sqrt(aDis / 3)) };
    const needF = (p.tTSS > 0 && p.tTSS <= 15) || (p.tTSS > 0 && p.TSSe > p.tTSS);
    s.filt = needF ? { name: 'Lọc đĩa / lọc cát', w: Math.max(10, Math.sqrt(qh / 10) * 1.6), h: Math.max(8, Math.sqrt(qh / 10) / 1.6) } : null;
    s.sb = { name: `Bể đệm bùn V = ${fnum(R.sludge.Vsb)} m³`, D: Math.max(5, Math.sqrt(4 * R.sludge.Vsb / 5 / Math.PI)) };
    s.dw = { name: 'Nhà tách nước bùn + hóa chất', w: 20, h: 14 };
    s.adm = { name: 'Nhà điều hành', w: 20, h: 12 };
    const yMid = m + road - c.Ybot + 20;
    let x = m + road;
    Object.assign(s.pt, { x, y: yMid - s.pt.h / 2 }); x += s.pt.w + 10;
    if (s.buf) { Object.assign(s.buf, { cx: x + s.buf.D / 2, cy: yMid }); x += s.buf.D + 10; }
    s.clox = x; s.cloy = yMid;
    const xEnd = x + c.X;
    Object.assign(s.blow, { x: xEnd + 6, y: yMid - s.blow.h / 2 });
    let xr = s.blow.x + s.blow.w + 10;
    if (s.filt) { Object.assign(s.filt, { x: xr, y: yMid + c.Ytop - s.filt.h }); xr += s.filt.w + 8; }
    Object.assign(s.dis, { x: xr, y: yMid + c.Ytop - s.dis.h });
    const yLow = yMid + c.Ybot - 10;
    Object.assign(s.sb, { cx: xEnd - s.sb.D / 2, cy: yLow - s.sb.D / 2 });
    Object.assign(s.dw, { x: s.sb.cx - s.sb.D / 2 - 10 - s.dw.w, y: yLow - s.dw.h });
    Object.assign(s.adm, { x: m + road, y: m });
    const ymin = Math.min(s.dw.y, s.sb.cy - s.sb.D / 2, s.adm.y), shift = ymin < m ? m - ymin : 0;
    for (const o of [s.pt, s.blow, s.dis, s.dw, s.filt].filter(Boolean)) o.y += shift;
    for (const o of [s.sb, s.buf].filter(Boolean)) o.cy += shift;
    s.cloy += shift; s.adm.y = m;
    s.Wsite = Math.max(s.dis.x + s.dis.w, s.blow.x + s.blow.w) + road + m;
    s.Hsite = s.cloy + c.Ytop + road + m;
    return s;
  }

  // ------------------------------------------------------------------ Các tờ
  function project(R, date) { return { name: `TRẠM XỬ LÝ NƯỚC THẢI CÔNG NGHỆ BÙN HẠT HIẾU KHÍ NEREDA® – Q = ${fnum(R.flow.Q)} m³/ngày`, date }; }

  function sheet00(R, date, scales) {
    const p = R.p, rc = R.reactor, k = R.kin, A = R.air;
    const sh = new Sheet('NR-00', SHEETS[0][1], '–', project(R, date));
    sh.text('TRẠM XỬ LÝ NƯỚC THẢI', 40, 545, 9, 'L', true);
    sh.text('CÔNG NGHỆ BÙN HẠT HIẾU KHÍ NEREDA®', 40, 530, 9, 'L', true);
    sh.text(`CÔNG SUẤT TRUNG BÌNH Q = ${fnum(R.flow.Q)} m³/ngày · LƯU LƯỢNG MÙA MƯA ${fnum(R.flow.Qrwf)} m³/ngày`, 40, 516, 4.2);
    sh.text('HỒ SƠ BẢN VẼ THIẾT KẾ SƠ BỘ PHẦN CÔNG NGHỆ', 40, 506, 4.2, 'L', true);
    title(sh, 40, 488, 'DANH MỤC BẢN VẼ');
    let yb = sh.table(40, 482, [24, 132, 28], [['SỐ HIỆU', 'TÊN BẢN VẼ', 'TỶ LỆ']].concat(SHEETS.map(([n, t]) => [n, t, scales[n] || '–'])), 2.8);
    title(sh, 40, yb - 10, 'CƠ SỞ THIẾT KẾ');
    sh.table(40, yb - 16, [88, 56, 40], [['THÔNG SỐ', 'GIÁ TRỊ', 'ĐƠN VỊ'],
      ['Lưu lượng trung bình / mùa mưa', `${fnum(p.Q)} / ${fnum(R.flow.Qrwf)}`, 'm³/ngày'], ['Hệ số giờ cao điểm mùa khô', fnum(p.PFh, 2), '–'],
      ['COD / BOD₅ / TSS', `${fnum(p.COD)} / ${fnum(p.BOD)} / ${fnum(p.TSS)}`, 'mg/L'], ['TKN / NH₄-N / TP', `${fnum(p.TKN)} / ${fnum(p.NH4)} / ${fnum(p.TP, 1)}`, 'mg/L'],
      ['Nhiệt độ nước thấp nhất / cao nhất', `${fnum(p.Tmin)} / ${fnum(p.Tmax)}`, '°C'], ['Giới hạn ra BOD₅ / COD / TSS', `${fnum(p.tBOD)} / ${fnum(p.tCOD)} / ${fnum(p.tTSS)}`, 'mg/L'],
      ['Giới hạn ra NH₄-N / NO₃-N / TN / TP', `${fnum(p.tNH4)} / ${fnum(p.tNO3)} / ${fnum(p.tTN)} / ${fnum(p.tTP, 1)}`, 'mg/L (0 = không xét)']], 2.6);
    const x2 = 245;
    title(sh, x2, 488, 'THÔNG SỐ CHÍNH CỦA PHƯƠNG ÁN');
    const dims = p.shape === 'circ' ? `Ø ${fnum(rc.dims.D, 1)}` : `${fnum(rc.dims.L, 1)} × ${fnum(rc.dims.W, 1)}`;
    const outp = [['HẠNG MỤC', 'GIÁ TRỊ', 'ĐƠN VỊ'], ['Số bể NEREDA', fnum(p.Nr), 'bể'], ['Thể tích mỗi bể / tổng', `${fnum(rc.VR)} / ${fnum(rc.Vtot)}`, 'm³'],
      ['Kích thước lòng mỗi bể (dài × rộng)', dims, 'm'], ['Chiều sâu nước / tổng chiều sâu bể', `${fnum(p.H, 2)} / ${fnum(p.H + 0.5, 2)}`, 'm'],
      ['Tiêu chí khống chế thể tích', rc.gov, ''], ['MLSS thiết kế / thực tế', `${fnum(p.X, 1)} / ${fnum(rc.Xact, 1)}`, 'kg/m³'],
      ['SRT tổng / hiếu khí', `${fnum(k.SRT, 1)} / ${fnum(k.SRTa, 1)}`, 'ngày'], ['Chu kỳ mùa khô / mùa mưa', `${fnum(R.cycle.tc, 2)} / ${fnum(R.cycle.tcR, 2)}`, 'h'],
      ['Trao đổi thể tích khô / mưa', `${fnum(rc.VERd * 100)} / ${fnum(rc.VERr * 100)}`, '%'], ['Nhu cầu O₂ (AOR)', fnum(A.R0), 'kg/ngày'],
      ['Tổng lưu lượng khí thiết kế', fnum(A.airTot), 'Sm³/h'], ['Số đĩa khí mỗi bể / tổng', `${fnum(A.nDisc)} / ${fnum(A.nDisc * p.Nr)}`, 'đĩa'],
      ['Điện năng cấp khí', fnum(A.kWhm3, 3), 'kWh/m³'], ['Bùn dư', fnum(R.sludge.PxTSS), 'kg DS/ngày'], ['Bể đệm bùn', fnum(R.sludge.Vsb), 'm³']];
    if (p.buffer) outp.push(['Bể điều hòa đầu vào', fnum(rc.Vbuf), 'm³']);
    const yb2 = sh.table(x2, 482, [86, 56, 30], outp, 2.5);
    title(sh, x2, yb2 - 10, 'CHẤT LƯỢNG NƯỚC SAU XỬ LÝ (TÍNH TOÁN)');
    const e = R.eff.fin, Lm = R.eff.limits, er = [['CHỈ TIÊU', 'TÍNH TOÁN', 'GIỚI HẠN', 'ĐÁNH GIÁ']];
    for (const [key, lab, d] of [['BOD', 'BOD₅', 1], ['COD', 'COD', 0], ['TSS', 'TSS', 0], ['NH4', 'NH₄-N', 2], ['NO3', 'NO₃-N', 1], ['TN', 'TN', 1], ['TP', 'TP', 2]]) {
      const lim = Lm[key] || 0;
      er.push([lab, fnum(e[key], d), lim > 0 ? fnum(lim, d) : '–', lim > 0 ? (R.eff.pass[key] ? 'ĐẠT' : 'KHÔNG ĐẠT') : '–']);
    }
    sh.table(x2, yb2 - 16, [40, 40, 40, 52], er, 2.5, { aligns: ['L', 'R', 'R', 'C'] });
    const x3 = 440;
    title(sh, x3, 488, 'KÝ HIỆU');
    let y = 476;
    for (const [ly, lab] of [['ONG_NUOC', 'Ống / dòng nước thải'], ['ONG_KHI', 'Ống khí'], ['ONG_BUN', 'Ống bùn'], ['ONG_HC', 'Ống hóa chất'], ['MUC_NUOC', 'Mực nước'], ['BUN', 'Mặt lớp bùn sau lắng'], ['TRUC', 'Trục định vị'], ['KHUAT', 'Nét khuất']]) {
      sh.line([x3, y], [x3 + 22, y], ly); sh.text(lab, x3 + 26, y - 1, 2.3); y -= 7;
    }
    valve(sh, [x3 + 11, y], 2.2); sh.text('Van', x3 + 26, y - 1, 2.3); y -= 12;
    notes(sh, x3, y, [
      'Hệ cao độ tương đối: ±0.000 = mặt bản đáy bể NEREDA. Cốt san nền giả định +1.500. Quy đổi về cao độ Quốc gia theo số liệu khảo sát.',
      'Kích thước bể, mực nước, số đĩa khí, đường kính ống và công suất thiết bị lấy trực tiếp từ bộ tính toán SimXLNT NEREDA. Kích thước các công trình phụ trợ và bố trí tổng mặt bằng là ước tính sơ bộ.',
      'Đây là hồ sơ thiết kế sơ bộ phần công nghệ để so sánh phương án và lập dự toán sơ bộ, không phải bản vẽ thi công. Kết cấu, điện, tự động hóa, PCCC do các bộ môn khác thực hiện.',
      'Thiết bị đặc thù NEREDA (lưới phân phối nước đáy, máng thu, lưới xả bùn, đĩa khí, bộ điều khiển) phải được nhà cung cấp công nghệ xác nhận.',
      'Song chắn rác tinh có máy dự phòng, tách cát và dầu mỡ là bắt buộc trước bể NEREDA (O&M Manual RHDHV).',
      'NEREDA® là thương hiệu của Royal HaskoningDHV. SimXLNT là công cụ độc lập, không liên kết với Royal HaskoningDHV.'], 190);
    const ws = R.warnings.filter(w => w.lvl === 'crit' || w.lvl === 'warn');
    if (ws.length) {
      let yy = 300; sh.text('CẢNH BÁO TỪ BỘ TÍNH TOÁN', x3, yy, 2.8, 'L', true); yy -= 5;
      for (const w of ws.slice(0, 8)) { for (const ln of wrap((w.lvl === 'crit' ? '[NGHIÊM TRỌNG] ' : '[LƯU Ý] ') + w.msg, 184, 2.1)) { sh.text(ln, x3, yy, 2.1); yy -= 3.3; } yy -= 1; }
    }
    return sh;
  }

  function sheet01(R, date) {
    const p = R.p, rc = R.reactor, S = R.sludge;
    const sh = new Sheet('NR-01', SHEETS[1][1], 'KTL', project(R, date));
    title(sh, 30, 560, 'SƠ ĐỒ CÔNG NGHỆ (PFD)');
    const y = 470, bw = 62, bh = 26, st = site(R, cluster(R));
    const seq = [['NƯỚC THẢI ĐẾN', [`Q = ${fnum(p.Q)} m³/ngày`, `Qmax mưa = ${fnum(R.flow.QrwfH)} m³/h`]], ['TIỀN XỬ LÝ', ['Song chắn rác tinh (có DP)', 'Lắng cát sục khí, tách dầu mỡ']]];
    if (p.buffer) seq.push(['BỂ ĐIỀU HÒA', [`V = ${fnum(rc.Vbuf)} m³`, `Bơm nạp ${fnum(R.pipes.feed.Q)} m³/h`]]);
    seq.push([`BỂ NEREDA × ${p.Nr}`, [`${fnum(rc.VR)} m³/bể, H = ${fnum(p.H, 1)} m`, `Chu kỳ ${fnum(R.cycle.tc, 2)} h`]]);
    if (st.filt) seq.push(['LỌC BẬC 3', ['Lọc đĩa / lọc cát', '(theo yêu cầu TSS)']]);
    seq.push(['KHỬ TRÙNG', ['UV hoặc clo', 'tiếp xúc ≥ 30 phút']], ['NGUỒN TIẾP NHẬN', ['hoặc tái sử dụng']]);
    const n = seq.length, gx = (600 - n * bw) / (n - 1), xs = seq.map((_, i) => 30 + i * (bw + gx));
    const iN = seq.findIndex(s => s[0].startsWith('BỂ NEREDA'));
    seq.forEach(([t, l], i) => { box(sh, xs[i], y, bw, bh, [t].concat(l), i === 0 || i === n - 1 ? 'ONG_NUOC' : 'THIET_BI'); if (i) arrow(sh, [[xs[i - 1] + bw, y + bh / 2], [xs[i] - 0.5, y + bh / 2]]); });
    [[1, xs[0] + bw + gx / 2], [2, xs[iN] + bw + gx / 2]].forEach(([k2, px]) => { sh.circle([px, y + bh / 2 + 6], 2.6, 'KY_HIEU'); sh.text(String(k2), px, y + bh / 2 + 6, 2.6, 'MC', true); });
    const xn = xs[iN];
    box(sh, xn, y - 70, bw, bh, ['MÁY THỔI KHÍ', `${R.equip.blowerDuty} LV + 1 DP × ${fnum(R.equip.blowerQ)} Sm³/h`, `Δp ${fnum(R.equip.blowerP)} kPa`]);
    arrow(sh, [[xn + bw / 2, y - 70 + bh], [xn + bw / 2, y - 0.5]], 'ONG_KHI');
    sh.text(`Khí ${fnum(R.air.airTot)} Sm³/h`, xn + bw / 2 + 2, y - 30, 2.2);
    const xb = xn + bw + gx;
    box(sh, xb, y - 70, bw, bh, ['BỂ ĐỆM BÙN', `V = ${fnum(S.Vsb)} m³`, `${fnum(S.WASm3)} m³/ngày`]);
    arrow(sh, [[xn + bw * 0.8, y], [xn + bw * 0.8, y - 22], [xb + bw / 2, y - 22], [xb + bw / 2, y - 70 + bh + 0.5]], 'ONG_BUN');
    sh.text(`Bùn dư ${fnum(S.PxTSS)} kg DS/ngày`, xn + bw * 0.8 + 2, y - 19, 2.2);
    const xd = xb + bw + gx;
    box(sh, xd, y - 70, bw, bh, ['TÁCH NƯỚC BÙN', `${fnum(R.equip.dewater.Q, 1)} m³/h × ${R.equip.dewater.hours} h`, `Polymer ${fnum(S.polyKg, 1)} kg/ngày`]);
    arrow(sh, [[xb + bw, y - 57], [xd - 0.5, y - 57]], 'ONG_BUN'); arrow(sh, [[xd + bw, y - 57], [xd + bw + 20, y - 57]], 'ONG_BUN');
    sh.text(`Bánh bùn ${fnum(S.cakeT, 1)} t/ngày (${fnum(p.cakeDS)}% DS)`, xd + bw + 2, y - 54, 2.2);
    arrow(sh, [[xd + bw / 2, y - 70], [xd + bw / 2, y - 82], [xs[1] + bw / 2, y - 82], [xs[1] + bw / 2, y - 0.5]], 'KHUAT');
    sh.text('Nước tách bùn, nước dư bể đệm (TSS ≤ 150 mg/L) quay về đầu trạm', xs[1] + bw / 2 + 2, y - 80, 2.2);
    arrow(sh, [[xs[1] + bw / 2, y + bh], [xs[1] + bw / 2, y + bh + 16]], 'ONG_BUN');
    sh.text('Rác, cát, dầu mỡ → thu gom xử lý', xs[1] + bw / 2 + 2, y + bh + 12, 2.2);
    const chem = [];
    if (R.phos.Pchem > 0) chem.push(`${R.phos.chemName}: ${fnum(R.phos.chemSol)} ${p.pChem === 'PAC' ? 'kg' : 'L'}/ngày`);
    if (R.carbon.methanolKg > 0) chem.push(`Methanol: ${fnum(R.carbon.methanolKg)} kg/ngày`);
    if (R.alk.NaOH > 0) chem.push(`NaOH 32%: ${fnum(R.alk.NaOHsol)} L/ngày`);
    if (chem.length) { box(sh, xn, y + 50, bw, 8 + 5 * chem.length, ['HÓA CHẤT'].concat(chem), 'ONG_HC', 2.2); arrow(sh, [[xn + bw / 2, y + 50], [xn + bw / 2, y + bh + 0.5]], 'ONG_HC'); }
    title(sh, 30, 330, 'CÂN BẰNG CHẤT LƯỢNG NƯỚC (mg/L)');
    const e = R.eff.fin, eb = R.eff.bio, Lm = R.eff.limits;
    const lim = key => (Lm[key] || 0) > 0 ? fnum(Lm[key]) : '–';
    const yb = sh.table(30, 322, [14, 78, 30, 24, 24, 24, 24, 24, 24, 24], [['ĐIỂM', 'VỊ TRÍ', 'Q (m³/ngày)', 'BOD₅', 'COD', 'TSS', 'NH₄-N', 'NO₃-N', 'TN', 'TP'],
      ['①', 'Nước thải đến', fnum(p.Q), fnum(p.BOD), fnum(p.COD), fnum(p.TSS), fnum(p.NH4, 1), '–', fnum(p.TKN, 1), fnum(p.TP, 1)],
      ['②', 'Sau bể NEREDA – chỉ sinh học', fnum(p.Q), fnum(eb.BOD, 1), fnum(eb.COD), fnum(eb.TSS), fnum(eb.NH4, 2), fnum(eb.NO3, 1), fnum(eb.TN, 1), fnum(eb.TP, 2)],
      ['②', 'Sau bể NEREDA – có châm hóa chất', fnum(p.Q), fnum(e.BOD, 1), fnum(e.COD), fnum(e.TSS), fnum(e.NH4, 2), fnum(e.NO3, 1), fnum(e.TN, 1), fnum(e.TP, 2)],
      ['', 'Giới hạn xả', '', lim('BOD'), lim('COD'), lim('TSS'), lim('NH4'), lim('NO3'), lim('TN'), lim('TP')]], 2.4, { aligns: ['C', 'L', 'R', 'R', 'R', 'R', 'R', 'R', 'R', 'R'] });
    notes(sh, 30, yb - 12, ['Chất lượng tại ② tính ở nhiệt độ thấp nhất; nhu cầu O₂ tính ở nhiệt độ cao nhất.', 'Coliform không tính; khử trùng theo yêu cầu quy chuẩn xả hoặc tái sử dụng.', `Khởi động: ${R.startup}.`], 330);
    title(sh, COL_X0, 560, 'BÙN VÀ NĂNG LƯỢNG');
    sh.table(COL_X0, 552, [80, 46, 50], [['HẠNG MỤC', 'GIÁ TRỊ', 'ĐƠN VỊ'], ['Bùn dư (TSS)', fnum(S.PxTSS), 'kg DS/ngày'], ['Thể tích bùn rút', fnum(S.WASm3), 'm³/ngày'],
      ['Bùn xả mỗi lần / bể', fnum(S.Vdis, 1), 'm³'], ['Bánh bùn', fnum(S.cakeT, 1), 't/ngày'], ['AOR', fnum(R.air.R0), 'kg O₂/ngày'], ['Điện cấp khí', fnum(R.air.Eday), 'kWh/ngày'],
      ['Điện cấp khí riêng', fnum(R.air.kWhm3, 3), 'kWh/m³'], ['Dân số tương đương', fnum(R.pe.PEtod), 'PE (150 g TOD)']], 2.3, { aligns: ['L', 'R', 'L'] });
    return sh;
  }

  function sheet02(R, date, scales) {
    const c = cluster(R), st = site(R, c), sc = fitScale(st.Wsite, st.Hsite, 600, 440);
    scales['NR-02'] = `1:${sc}`;
    const sh = new Sheet('NR-02', SHEETS[2][1], `1:${sc}`, project(R, date));
    title(sh, 30, 560, `TỔNG MẶT BẰNG SƠ BỘ   TL 1:${sc}`);
    const v = new View(sh, 30 + (600 - st.Wsite * 1000 / sc) / 2, 110, sc), ox = st.clox, oy = st.cloy;
    v.rect(0, 0, st.Wsite, st.Hsite, 'KHUNG'); v.text('HÀNG RÀO', 2, st.Hsite - 4, 2.2);
    v.rect(ox - 7, oy + c.Ybot - 7, ox + c.X + 7, oy + c.Ytop + 7, 'KHUAT');
    for (const r of c.reactors) {
      if (c.circ) v.circle([ox + r.cx, oy + r.cy], c.D / 2, 'TUONG'); else v.rect(ox + r.x0, oy + r.y0, ox + r.x1, oy + r.y1, 'TUONG');
      v.text(r.id, ox + r.cx, oy + r.cy, 2.2, 'MC', true);
    }
    v.pline(c.outline.map(([x, y]) => [ox + x, oy + y]), 'TUONG', true);
    v.text('CỤM BỂ NEREDA', ox + c.X / 2, oy + c.Ytop + 2, 2.4, 'BC', true);
    const blk = (o, n) => { v.rect(o.x, o.y, o.x + o.w, o.y + o.h, 'TUONG'); v.text(n, o.x + o.w / 2, o.y + o.h / 2, 2.0, 'MC'); };
    blk(st.pt, 'TX'); blk(st.blow, 'MTK'); blk(st.dis, 'KT'); blk(st.dw, 'TNB'); blk(st.adm, 'ĐH'); if (st.filt) blk(st.filt, 'LỌC');
    v.circle([st.sb.cx, st.sb.cy], st.sb.D / 2, 'TUONG'); v.text('ĐB', st.sb.cx, st.sb.cy, 2.0, 'MC');
    if (st.buf) { v.circle([st.buf.cx, st.buf.cy], st.buf.D / 2, 'TUONG'); v.text('ĐH-B', st.buf.cx, st.buf.cy, 2.0, 'MC'); }
    const yc = oy, xin = st.pt.x - 10;
    v.line([xin, yc], [st.pt.x, yc], 'ONG_NUOC'); v.text('Nước thải đến', xin, yc + 1.5, 2.0);
    let xc = st.pt.x + st.pt.w;
    if (st.buf) { v.line([xc, yc], [st.buf.cx - st.buf.D / 2, yc], 'ONG_NUOC'); xc = st.buf.cx + st.buf.D / 2; }
    v.line([xc, yc], [ox, yc], 'ONG_NUOC');
    v.line([ox + c.X, yc - 0.6], [st.blow.x, yc - 0.6], 'ONG_KHI');
    const ych = oy + c.chTop[1] + EFF_CH / 2, tgt = st.filt || st.dis;
    v.pline([[ox + c.X, ych], [tgt.x - 3, ych], [tgt.x - 3, tgt.y + tgt.h / 2], [tgt.x, tgt.y + tgt.h / 2]], 'ONG_NUOC');
    if (st.filt) v.line([st.filt.x + st.filt.w, st.filt.y + st.filt.h / 2], [st.dis.x, st.dis.y + st.dis.h / 2], 'ONG_NUOC');
    v.line([st.dis.x + st.dis.w, st.dis.y + st.dis.h / 2], [st.Wsite, st.dis.y + st.dis.h / 2], 'ONG_NUOC');
    v.text('Xả / tái sử dụng', st.Wsite - 2, st.dis.y + st.dis.h / 2 + 1.5, 2.0, 'R');
    if (c.chBot) { const ycb = oy + c.chBot[1] + EFF_CH / 2, xe = ox + c.Xbot; v.pline([[xe, ycb], [tgt.x - 5, ycb], [tgt.x - 5, tgt.y + tgt.h / 2 - 1]], 'ONG_NUOC'); }
    v.pline([[ox + c.X, yc - 1.2], [ox + c.X + 3, yc - 1.2], [ox + c.X + 3, st.sb.cy], [st.sb.cx + st.sb.D / 2, st.sb.cy]], 'ONG_BUN');
    v.line([st.sb.cx - st.sb.D / 2, st.sb.cy], [st.dw.x + st.dw.w, st.dw.y + st.dw.h / 2], 'ONG_BUN');
    const nx = 600, ny = 540;
    sh.pline([[nx, ny - 8], [nx + 3, ny], [nx, ny + 8], [nx - 3, ny]], 'KY_HIEU', true);
    sh.solid([[nx, ny + 8], [nx + 3, ny], [nx, ny - 8]], 'KY_HIEU', '#000000'); sh.text('B', nx, ny + 11, 3.2, 'BC', true);
    v.dim([0, 0], [st.Wsite, 0], -6); v.dim([0, 0], [0, st.Hsite], -6, false);
    title(sh, COL_X0, 560, 'BẢNG CÔNG TRÌNH');
    const rows = [['KH', 'CÔNG TRÌNH', 'KÍCH THƯỚC (m)'], ['TX', st.pt.name, `${fnum(st.pt.w, 1)} × ${fnum(st.pt.h, 1)}`]];
    if (st.buf) rows.push(['ĐH-B', st.buf.name, `Ø ${fnum(st.buf.D, 1)}`]);
    rows.push([`R-301…${300 + c.N}`, `Bể NEREDA × ${c.N}, ${fnum(R.reactor.VR)} m³/bể`, `${fnum(c.X, 1)} × ${fnum(c.Ytop - c.Ybot, 1)} (cụm)`], ['MTK', st.blow.name, `${fnum(st.blow.w, 1)} × ${fnum(st.blow.h, 1)}`]);
    if (st.filt) rows.push(['LỌC', st.filt.name, `${fnum(st.filt.w, 1)} × ${fnum(st.filt.h, 1)}`]);
    rows.push(['KT', st.dis.name, `${fnum(st.dis.w, 1)} × ${fnum(st.dis.h, 1)}`], ['ĐB', st.sb.name, `Ø ${fnum(st.sb.D, 1)}`], ['TNB', st.dw.name, `${fnum(st.dw.w, 1)} × ${fnum(st.dw.h, 1)}`], ['ĐH', st.adm.name, `${fnum(st.adm.w, 1)} × ${fnum(st.adm.h, 1)}`]);
    const yb = sh.table(COL_X0, 552, [24, 104, 48], rows, 2.2);
    notes(sh, COL_X0, yb - 10, [
      `Diện tích trong hàng rào ≈ ${fnum(st.Wsite * st.Hsite / 10000, 2)} ha (${fnum(st.Wsite)} × ${fnum(st.Hsite)} m).`,
      `Cụm bể NEREDA chiếm ${fnum(c.X * (c.Ytop - c.Ybot))} m². So sánh: bùn hoạt tính truyền thống ≈ ${fnum(R.cas.footCas)} m² (bể sinh học + lắng II).`,
      'Toạ độ giả định, gốc (0;0) góc Tây-Nam hàng rào. Bố trí theo dòng chảy Tây → Đông; điều chỉnh theo ranh giới khu đất thực tế.',
      'Kích thước công trình phụ trợ là ước tính sơ bộ: lắng cát HRT 3 phút, tiếp xúc khử trùng 30 phút ở lưu lượng mưa, bể đệm bùn chứa 2 lần xả.']);
    return sh;
  }

  function sheet03(R, date, scales) {
    const c = cluster(R), p = R.p, P = R.pipes, t = c.t;
    const sc = fitScale(c.X + 14, c.Ytop - c.Ybot + 14, 590, 455);
    scales['NR-03'] = `1:${sc}`;
    const sh = new Sheet('NR-03', SHEETS[3][1], `1:${sc}`, project(R, date));
    title(sh, 30, 560, `MẶT BẰNG CỤM BỂ NEREDA   TL 1:${sc}`);
    const v = new View(sh, 30 + (600 - c.X * 1000 / sc) / 2, 105 + (-c.Ybot + 6) * 1000 / sc, sc);
    for (const r of c.reactors) {
      if (c.circ) sh.solid(Array.from({ length: 48 }, (_, a) => v.P(r.cx + c.D / 2 * Math.cos(a / 48 * 2 * Math.PI), r.cy + c.D / 2 * Math.sin(a / 48 * 2 * Math.PI))), 'NUOC');
      else v.water(r.x0, r.y0, r.x1, r.y1);
    }
    for (const ch of [c.chTop, c.chBot]) if (ch) v.water(...ch);
    v.region(c.outline, c.holes);
    if (c.circ) for (const r of c.reactors) { v.circle([r.cx, r.cy], c.D / 2, 'TUONG'); v.circle([r.cx, r.cy], c.D / 2 + t, 'TUONG'); }
    for (const r of c.reactors) {
      for (const xr of c.troughsX) {
        const x = r.x0 + xr;
        if (c.circ) { const hc = Math.sqrt(Math.max((c.D / 2) ** 2 - (xr - c.D / 2) ** 2, 0)) - 0.4; v.rect(x - TROUGH_W / 2, r.cy - hc, x + TROUGH_W / 2, r.cy + hc, 'THIET_BI'); }
        else if (r.row === 'T') v.rect(x - TROUGH_W / 2, r.y0 + 0.6, x + TROUGH_W / 2, r.y1, 'THIET_BI');
        else v.rect(x - TROUGH_W / 2, r.y0, x + TROUGH_W / 2, r.y1 - 0.6, 'THIET_BI');
      }
      v.text(r.id, r.cx, r.cy + 1.2, 3.0, 'MC', true);
      v.text(`V = ${fnum(R.reactor.VR)} m³ · H = ${fnum(p.H, 1)} m`, r.cx, r.cy - 1.6, 2.2, 'MC');
    }
    const g0 = c.gallery, yf = 0.9, ya = -0.1, ys = -1.0;
    v.line([g0[0] + 0.3, yf], [g0[2] - 0.3, yf], 'ONG_NUOC');
    v.line([g0[0] + 0.3, ya], [g0[2] + t + 6, ya], 'ONG_KHI');
    v.line([g0[0] + 0.3, ys], [g0[2] + t + 6, ys], 'ONG_BUN');
    v.line([g0[0] - t - 6, yf], [g0[0] + 0.3, yf], 'ONG_NUOC');
    v.text(`Nước vào DN${P.feed.DN}`, g0[0] - t - 6, yf + 0.4, 2.0);
    v.text(`Khí chính DN${P.airMain.DN} ← nhà máy thổi khí`, g0[2] + t + 6.5, ya, 2.0, 'ML');
    v.text(`Bùn dư DN${P.sludge.DN} → bể đệm bùn`, g0[2] + t + 6.5, ys - 0.6, 2.0, 'ML');
    for (const r of c.reactors) {
      const sgn = r.row === 'T' ? 1 : -1, yw = r.row === 'T' ? r.y0 : r.y1;
      const xf = r.x0 + c.W * 0.25, xa = r.x0 + c.W * 0.5, xs = r.x0 + c.W * 0.75;
      v.line([xf, yf], [xf, yw + sgn * 0.8], 'ONG_NUOC'); valve(sh, v.P(xf, (yf + yw) / 2), 1.6, Math.PI / 2);
      v.line([xa, ya], [xa, yw + sgn * 0.8], 'ONG_KHI'); valve(sh, v.P(xa, (ya + yw) / 2), 1.6, Math.PI / 2);
      v.line([xs, ys], [xs, yw + sgn * 0.8], 'ONG_BUN'); valve(sh, v.P(xs, (ys + yw) / 2), 1.6, Math.PI / 2);
    }
    v.tagto([g0[0] + 0.6, g0[1] + 0.4], 'HÀNH LANG ỐNG', v.P(-8, 0)[0], v.P(0, -6)[1]);
    for (const ch of [c.chTop, c.chBot]) if (ch) {
      const yc = (ch[1] + ch[3]) / 2;
      v.line([ch[2], yc], [ch[2] + t + 6, yc], 'ONG_NUOC');
      v.text(`Nước ra DN${P.eff.DN} → khử trùng`, ch[2] + t + 6.5, yc, 2.0, 'ML');
      v.text('KÊNH THU NƯỚC RA', (ch[0] + ch[2]) / 2, yc, 2.0, 'MC');
    }
    const r1 = c.reactors[0], yd = c.Ytop + 2.5;
    v.dim([r1.x0, c.Ytop], [r1.x1, c.Ytop], yd); v.dim([0, c.Ytop], [c.X, c.Ytop], yd + 3.5);
    v.dim([0, r1.y0], [0, r1.y1], -3, false); v.dim([0, c.gallery[1]], [0, c.gallery[3]], -3, false); v.dim([0, c.Ybot], [0, c.Ytop], -6.5, false);
    const xa_ = r1.cx + c.W * 0.12;
    v.text('A', xa_, c.Ybot - 1.5, 3.2, 'MC', true); v.text('A', xa_, c.Ytop + 1.0, 3.2, 'MC', true);
    v.line([xa_, c.Ybot - 0.8], [xa_, c.Ytop + 0.3], 'TRUC');
    const yb_ = r1.cy + c.L * 0.2;
    v.line([-1.2, yb_], [c.X + 1.0, yb_], 'TRUC'); v.text('B', -1.8, yb_, 3.2, 'MC', true); v.text('B', c.X + 1.8, yb_, 3.2, 'MC', true);
    title(sh, COL_X0, 560, 'THÔNG SỐ BỂ NEREDA');
    const rc = R.reactor;
    const yb = sh.table(COL_X0, 552, [78, 70, 28], [['THÔNG SỐ', 'GIÁ TRỊ', 'ĐV'], ['Số bể', fnum(c.N), 'bể'], ['Lòng bể (rộng × dài)', `${fnum(c.W, 2)} × ${fnum(c.L, 2)}`, 'm'],
      ['Diện tích / thể tích mỗi bể', `${fnum(rc.A)} / ${fnum(rc.VR)}`, 'm² · m³'], ['Chiều sâu nước', fnum(p.H, 2), 'm'], ['Tường bể (giả định)', fnum(t, 2), 'm'],
      ['Hành lang ống / kênh thu', `${fnum(GALLERY, 1)} / ${fnum(EFF_CH, 1)}`, 'm'], ['Máng thu mỗi bể', `${c.nTrough} × ${fnum(TROUGH_W, 1)} m`, ''],
      ['Chiều dài tràn mỗi bể', `${fnum(c.nTrough * 2 * c.L)} (yêu cầu ≥ ${fnum(R.equip.weirLen)})`, 'm'], ['Ống nạp / ra mỗi bể', `DN${P.feed.DN} / DN${P.eff.DN}`, ''],
      ['Ống khí xuống / bùn dư', `DN${P.airR.DN} / DN${P.sludge.DN}`, ''], ['Vận tốc nạp đi lên khô / mưa', `${fnum(rc.vUpD, 2)} / ${fnum(rc.vUpR, 2)}`, 'm/h']], 2.2, { aligns: ['L', 'R', 'L'] });
    notes(sh, COL_X0, yb - 10, ['Mỗi bể nạp nước từ đáy qua lưới phân phối và xả nước đã xử lý qua máng thu cố định cùng lúc (mực nước không đổi).',
      'Van nạp, van khí, van xả bùn đặt trong hành lang ống; ống khí có van khoá kín khí ống xả bùn trước pha sục khí.',
      'Máng thu, lưới phân phối nước đáy và lưới xả bùn do nhà cung cấp công nghệ thiết kế chi tiết.']);
    return sh;
  }

  function sheet04(R, date, scales) {
    const c = cluster(R), p = R.p, rc = R.reactor, P = R.pipes, H = p.H, t = c.t, L = c.L, W = c.W, top = H + 0.5;
    const sc = fitScale(GALLERY / 2 + t + L + t + EFF_CH + t + 3, top + 3, 470, 200);
    const sh = new Sheet('NR-04', SHEETS[4][1], '', project(R, date));
    title(sh, 30, 560, `MẶT CẮT A-A   TL 1:${sc}`);
    const va = new View(sh, 70, 360, sc), y0 = 0, yw1 = GALLERY / 2, yr0 = yw1 + t, yr1 = yr0 + L, yc0 = yr1 + t, yc1 = yc0 + EFF_CH, chBot = H - 1.6;
    va.water(yr0, 0, yr1, H); va.water(yc0, chBot, yc1, H - 0.35);
    va.wallRect(y0 - 0.5, -0.5, yc1 + t + 0.5, 0); va.wallRect(yw1, 0, yr0, top); va.wallRect(yr1, 0, yc0, top); va.wallRect(yc1, 0, yc1 + t, top); va.wallRect(yc0, chBot - 0.3, yc1, chBot);
    va.rect(y0 - 0.5, top, yw1, top + 0.3, 'TUONG');
    va.line([yc1 + t, GROUND], [yc1 + t + 3, GROUND], 'DAT'); va.line([y0 - 0.5, GROUND], [y0 - 2.5, GROUND], 'DAT');
    va.line([yr0, H], [yr1, H], 'MUC_NUOC'); va.line([yr0, H - 0.15], [yr1, H - 0.15], 'KHUAT'); va.line([yr0, rc.Hb], [yr1, rc.Hb], 'BUN');
    va.line([yr0 + 0.3, 0.2], [yr1 - 0.3, 0.2], 'ONG_NUOC');
    const nd = Math.max(4, Math.floor(L / 1.0));
    for (let i = 0; i < nd; i++) { const yy = yr0 + 0.5 + i * (L - 1.0) / (nd - 1); va.rect(yy - DISC_R, 0.30, yy + DISC_R, 0.36, 'ONG_KHI'); }
    va.line([yr0 + 0.3, 0.33], [yr1 - 0.3, 0.33], 'ONG_KHI'); va.line([yr0 + 0.3, rc.zDS], [yr1 - 0.3, rc.zDS], 'ONG_BUN');
    va.rect(yr0 + 0.6, H - 0.55, yr1, H + 0.05, 'THIET_BI');
    va.pline([[y0 + 0.6, 1.0], [yr0 + 0.4, 1.0], [yr0 + 0.4, 0.2]], 'ONG_NUOC');
    va.pline([[y0 + 1.2, top - 0.6], [yr0 + 0.25, top - 0.6], [yr0 + 0.25, 0.33]], 'ONG_KHI');
    va.pline([[yr0 + 0.55, rc.zDS], [yw1 - 0.1, rc.zDS], [y0 + 1.8, rc.zDS]], 'ONG_BUN');
    const tx = va.P(yc1 + t, 0)[0] + 52;
    [[[yr0 + L * 0.7, H + 0.05], [`Máng thu nước cố định, ngưỡng tràn +${fnum(H, 3)}`]],
      [[yc0 + EFF_CH / 2, H - 0.35], ['Kênh thu nước ra', `ống DN${P.eff.DN} → khử trùng`]],
      [[yr0 + L * 0.55, rc.zDS], [`Lưới xả bùn dư +${fnum(rc.zDS, 3)}`, `ống DN${P.sludge.DN}`]],
      [[yr0 + L * 0.45, rc.Hb], [`Mặt lớp bùn sau lắng +${fnum(rc.Hb, 3)}`, `(SVI ${fnum(p.SVI)} mL/g, ${fnum(rc.M / 1000 / c.N, 1)} t DS/bể)`]],
      [[yr0 + L * 0.35, 0.33], [`Đĩa khí 9" – ${fnum(R.air.nDisc)} đĩa/bể, +0.300`, `ống khí DN${P.airR.DN}`]],
      [[yr0 + L * 0.25, 0.2], ['Lưới phân phối nước đáy +0.200', `ống nạp DN${P.feed.DN}`]]].forEach(([pt, txt], i) => {
      const px = pt[0] > yr1 ? pt[0] : yr1 - 1.5 - i * 1.6;
      va.tagto([px, pt[1]], txt, tx, va.P(0, top + 1.2)[1] - i * 12);
    });
    const xl = yr0 + 1.2;
    va.level(xl, H, `+${fnum(H, 3)} MNCT (mực nước không đổi)`); va.level(xl + L * 0.25, H - 0.15, `+${fnum(H - 0.15, 3)} hạ mực nước trước sục khí`);
    va.level(xl, 0, '±0.000 mặt bản đáy'); va.level(yc1 + t + 1.0, top, `+${fnum(top, 3)} đỉnh tường`); va.level(yc1 + t + 2.2, GROUND, `+${fnum(GROUND, 3)} san nền (giả định)`);
    va.dim([yr0, top], [yr1, top], top + 1.0); va.dim([yr0, 0], [yr0, H], yr0 - 1.2, false);
    va.text('HÀNH LANG ỐNG', y0 + 0.2, top - 1.6, 2.0);
    const scb = fitScale(W + 2 * t + 10, top + 3, 470, 175);
    sh.scaleNote = `1:${sc}; 1:${scb}`; scales['NR-04'] = sh.scaleNote;
    title(sh, 30, 255, `MẶT CẮT B-B   TL 1:${scb}`);
    const vb = new View(sh, 60, 130, scb);
    vb.water(0, 0, W, H); vb.wallRect(-t - 0.5, -0.5, W + t + 0.5, 0); vb.wallRect(-t, 0, 0, top); vb.wallRect(W, 0, W + t, top);
    vb.line([0, H], [W, H], 'MUC_NUOC'); vb.line([0, rc.Hb], [W, rc.Hb], 'BUN');
    for (const xr of c.troughsX) vb.pline([[xr - TROUGH_W / 2, H + 0.05], [xr - TROUGH_W / 2, H - 0.55], [xr + TROUGH_W / 2, H - 0.55], [xr + TROUGH_W / 2, H + 0.05]], 'THIET_BI');
    const { pts } = discLayout(R, c);
    for (const x of [...new Set(pts.map(q => Math.round(q[0] * 1000) / 1000))]) vb.rect(x - DISC_R, 0.30, x + DISC_R, 0.36, 'ONG_KHI');
    const nLat = Math.max(2, Math.round(W / 2.0));
    for (let i = 0; i < nLat; i++) { const x = (i + 0.5) * W / nLat; vb.circle([x, 0.2], 0.08, 'ONG_NUOC'); vb.circle([x, rc.zDS], 0.07, 'ONG_BUN'); }
    const xo = W + t + 0.6;
    vb.level(xo, top, `+${fnum(top, 3)} đỉnh tường`); vb.level(xo, H, `+${fnum(H, 3)} MNCT`); vb.level(xo + 3.2, rc.zDS, `+${fnum(rc.zDS, 3)} lưới xả bùn`);
    vb.level(xo, rc.Hb, `+${fnum(rc.Hb, 3)} lớp bùn`); vb.level(xo, 0, '±0.000 mặt bản đáy'); vb.line([W, rc.Hb], [xo, rc.Hb], 'KHUAT');
    vb.dim([0, top], [W, top], top + 0.8); vb.dim([-t, top], [0, top], top + 0.8);
    title(sh, COL_X0, 560, 'CAO ĐỘ VÀ MỰC NƯỚC');
    const yb = sh.table(COL_X0, 552, [120, 56], [['VỊ TRÍ', 'CAO ĐỘ (m)'], ['Đỉnh tường bể', `+${fnum(top, 3)}`], ['Mực nước công tác (không đổi)', `+${fnum(H, 3)}`],
      ['Mực nước sau hạ trước sục khí (−15 cm)', `+${fnum(H - 0.15, 3)}`], ['Mặt lớp bùn sau lắng', `+${fnum(rc.Hb, 3)}`], ['Lưới xả bùn dư', `+${fnum(rc.zDS, 3)}`],
      ['Đĩa khí', '+0.300'], ['Lưới phân phối nước đáy', '+0.200'], ['Mặt bản đáy', '±0.000'], ['San nền (giả định)', `+${fnum(GROUND, 3)}`]], 2.2, { aligns: ['L', 'R'] });
    notes(sh, COL_X0, yb - 10, [`Thời gian lắng yêu cầu ${fnum(rc.tsReq * 60)} phút (lớp bùn hạt lắng ${fnum(p.vSettle)} m/h); thời gian lắng chọn ${fnum(p.ts * 60)} phút.`,
      `Áp lực chọn lọc (vận tốc lắng tối thiểu để hạt ở lại bể) ≈ ${fnum(rc.vSel, 1)} m/h với lưới xả bùn ở +${fnum(rc.zDS, 3)}. Điều chỉnh bằng thời gian chờ trước khi mở van xả bùn.`,
      'Chiều dày tường, bản đáy là giả định cho bản vẽ sơ bộ; kết cấu tính toán riêng.', 'Mực nước hạ 15 cm trước pha sục khí để bùn nở không tràn qua máng (O&M Manual).']);
    return sh;
  }

  function sheet05(R, date, scales) {
    const c = cluster(R), p = R.p, A = R.air, P = R.pipes, W = c.W, L = c.L, t = c.t;
    const sc = fitScale(W + 2 * t + 6, L + 2 * t + 6, 420, 440);
    scales['NR-05'] = `1:${sc}; 1:10`;
    const sh = new Sheet('NR-05', SHEETS[5][1], `1:${sc}; 1:10`, project(R, date));
    title(sh, 30, 560, `BỐ TRÍ ĐĨA KHÍ VÀ ỐNG PHÂN PHỐI NƯỚC ĐÁY – 1 BỂ   TL 1:${sc}`);
    const { grids, pts } = discLayout(R, c), v = new View(sh, 70, 110, sc);
    if (c.circ) { v.circle([W / 2, L / 2], W / 2, 'TUONG'); v.circle([W / 2, L / 2], W / 2 + t, 'TUONG'); }
    else v.region([[-t, -t], [W + t, -t], [W + t, L + t], [-t, L + t]], [[[0, 0], [W, 0], [W, L], [0, L]]]);
    const nLat = Math.max(2, Math.round(W / 2.0));
    for (let i = 0; i < nLat; i++) {
      const x = (i + 0.5) * W / nLat, hc = c.circ ? Math.sqrt(Math.max((W / 2) ** 2 - (x - W / 2) ** 2, 0)) - 0.3 : L / 2 - 0.3;
      v.line([x, L / 2 - hc], [x, L / 2 + hc], 'KHUAT');
    }
    if (!c.circ) v.line([0.3, 0.25], [W - 0.3, 0.25], 'ONG_NUOC');
    let drawn = 0;
    for (const g of grids) {
      const gp = pts.filter(q => q[1] >= g.y0 && (q[1] < g.y1 || g.g === grids.length));
      if (!gp.length) continue;
      const ys = [...new Set(gp.map(q => Math.round(q[1] * 1000) / 1000))].sort((a, b) => a - b), xm = Math.min(...gp.map(q => q[0])) - 0.3;
      for (const y of ys) { const row = gp.filter(q => Math.round(q[1] * 1000) / 1000 === y); v.line([Math.min(...row.map(q => q[0])) - 0.3, y], [Math.max(...row.map(q => q[0])), y], 'ONG_KHI'); }
      if (!c.circ) v.line([xm, ys[0]], [xm, ys[ys.length - 1]], 'ONG_KHI');
      const dt = g.nx ? `(${g.nx} × ${g.ny}), a = ${fnum(g.sx, 2)} × ${fnum(g.sy, 2)} m` : `bước lưới ${fnum(g.sx, 2)} m`;
      v.text(`LƯỚI ${g.g}: ${g.n} đĩa ${dt}`, W + t + 1.0, (g.y0 + g.y1) / 2, 2.2, 'ML');
      for (const q of gp) { v.circle(q, DISC_R, 'ONG_KHI'); drawn++; }
    }
    if (drawn !== A.nDisc) throw new Error('Số đĩa vẽ khác số đĩa tính toán');
    v.text('PHÍA HÀNH LANG ỐNG', W / 2, -t - 1.2, 2.2, 'MC'); v.text('PHÍA KÊNH THU NƯỚC RA', W / 2, L + t + 1.0, 2.2, 'MC');
    v.dim([0, 0], [W, 0], -t - 2.6); v.dim([0, 0], [0, L], -t - 2.6, false);
    const dv = new View(sh, 560, 330, 10);
    dv.circle([0, 0], DISC_R, 'ONG_KHI'); dv.circle([0, 0], DISC_R - 0.015, 'ONG_KHI'); dv.circle([0, 0], 0.03, 'ONG_KHI'); dv.line([-0.25, 0], [0.25, 0], 'TRUC');
    dv.text('Ø230 (đĩa 9")', 0, DISC_R + 0.04, 2.2, 'BC'); sh.text('CHI TIẾT ĐĨA KHÍ   TL 1:10', 530, 370, 2.8, 'L', true);
    title(sh, COL_X0, 560, 'BẢNG ĐẾM ĐĨA KHÍ');
    const yb = sh.table(COL_X0, 552, [80, 70, 26], [['HẠNG MỤC', 'GIÁ TRỊ', 'ĐV'], ['Số đĩa mỗi bể (tính toán = bố trí)', `${fnum(A.nDisc)} = ${fnum(drawn)}`, 'đĩa'],
      ['Số lưới khí mỗi bể', fnum(grids.length), 'lưới'], ['Tổng số đĩa toàn trạm', fnum(A.nDisc * p.Nr), 'đĩa'], ['Mật độ đĩa', fnum(A.discDens, 2), 'đĩa/m²'],
      ['Lưu lượng khí thiết kế mỗi đĩa', fnum(A.airDesR / A.nDisc, 2), 'Sm³/h'], ['Lưu lượng khí thiết kế mỗi bể', fnum(A.airDesR), 'Sm³/h'],
      ['Độ ngập đĩa / SOTE', `${fnum(A.hd, 2)} m / ${fnum(A.SOTE * 100, 1)}%`, ''], ['Ống khí xuống mỗi bể', `DN${P.airR.DN} (v = ${fnum(P.airR.v, 1)} m/s)`, ''],
      ['Ống phân phối nước đáy', `${nLat} nhánh, ống góp DN${P.feed.DN}`, '']], 2.2, { aligns: ['L', 'R', 'L'] });
    notes(sh, COL_X0, yb - 10, ['Số đĩa bố trí được kiểm tra bằng chương trình, bằng đúng số đĩa của bộ tính toán.',
      'Ống phân phối nước đáy (nét đứt) đặt giữa các nhánh khí, lỗ phân phối hướng xuống đáy; bước lỗ và đường kính lỗ do nhà cung cấp tính để phân bố đều.',
      'Mỗi lưới khí có ống xuống riêng và van điều chỉnh trong hành lang ống, cho phép sục khí ngắt quãng (khử nitrat trước/sau).']);
    return sh;
  }

  function sheet06(R, date) {
    const C = R.cycle, p = R.p;
    const sh = new Sheet('NR-06', SHEETS[6][1], 'KTL', project(R, date));
    const PHC = { F: ['PHA_F', 'Nạp kỵ khí + xả nước'], W: ['PHA_W', 'Chờ kỵ khí bổ sung'], A: ['PHA_A', 'Sục khí'], S: ['PHA_S', 'Lắng'], I: ['PHA_I', 'Chờ / xả bùn dư'] };
    const SH = { F: 'Nạp/xả', W: 'Kỵ khí', A: 'Sục khí', S: 'Lắng', I: 'Chờ' };
    function gantt(rows, tc, x0, ytop, wmm, label) {
      const span = 2 * tc, X = tt => x0 + tt / span * wmm, N = rows.length, rh = Math.min(12, 120 / Math.max(N, 1));
      title(sh, 30, ytop + 14, label);
      rows.forEach((rw, k) => {
        const y = ytop - (k + 1) * (rh + 2);
        sh.text(`R-${301 + k}`, x0 - 4, y + rh / 2, 2.4, 'MR');
        for (let cc = -1; cc <= 2; cc++) {
          let t0 = rw.offset + cc * tc;
          for (const [ph, d] of rw.phases) {
            if (d <= 0) continue;
            const a = Math.max(t0, 0), b = Math.min(t0 + d, span);
            if (b > a + 1e-6) {
              const ly = PHC[ph][0], pts = [[X(a) + 0.3, y], [X(b) - 0.3, y], [X(b) - 0.3, y + rh], [X(a) + 0.3, y + rh]];
              sh.solid(pts, ly, LAYERS[ly][1]); sh.pline(pts, 'KHUNG_MANH', true);
              if (X(b) - X(a) > 22) sh.text(SH[ph], X(a) + 2, y + rh / 2, 2.2, 'ML');
            }
            t0 += d;
          }
        }
      });
      const yb = ytop - N * (rh + 2) - 4, hs = 14;
      sh.line([x0, yb - hs], [x0 + wmm, yb - hs], 'KHUNG_MANH');
      const pts = [];
      for (let i = 0; i <= 720; i++) {
        const tt = i / 720 * span; let cnt = 0;
        for (const rw of rows) { const xx = ((tt - rw.offset) % tc + tc) % tc; let acc = 0; for (const [ph, d] of rw.phases) { if (xx < acc + d) { cnt += ph === 'A' ? 1 : 0; break; } acc += d; } }
        pts.push([X(tt), yb - hs + cnt / Math.max(N, 1) * hs]);
      }
      sh.pline(pts, 'ONG_KHI'); sh.text('Số bể sục khí', x0 - 4, yb - hs / 2, 2.2, 'MR');
      for (let i = 0; i <= Math.floor(span); i++) { sh.line([X(i), yb - hs - 1], [X(i), ytop], 'KHUAT'); sh.text(`${i} h`, X(i), yb - hs - 4, 2.2, 'TC'); }
      return yb - hs - 10;
    }
    const yb = gantt(C.rowsD, C.tc, 70, 520, 560, `CHU TRÌNH MÙA KHÔ – CHU KỲ ${fnum(C.tc, 2)} h, LỆCH PHA ${fnum(C.tc / p.Nr * 60)} phút`);
    gantt(C.rowsR, C.tcR, 70, yb - 30, 560, `CHU TRÌNH MÙA MƯA – CHU KỲ ${fnum(C.tcR, 2)} h, LỆCH PHA ${fnum(C.tcR / p.Nr * 60)} phút`);
    title(sh, COL_X0, 560, 'THỜI GIAN CÁC PHA (phút)');
    const yb2 = sh.table(COL_X0, 552, [96, 40, 40], [['PHA', 'MÙA KHÔ', 'MÙA MƯA'], ['Nạp kỵ khí + xả nước', fnum(C.tF * 60), fnum(C.tFr * 60)], ['Chờ kỵ khí bổ sung', fnum(C.tW * 60), fnum(C.tWr * 60)],
      ['Sục khí', fnum(C.tA * 60), fnum(C.tAr * 60)], ['Lắng', fnum(C.tS * 60), fnum(C.tS * 60)], ['Chờ / xả bùn dư', fnum(C.tI * 60), fnum(C.tI * 60)], ['Tổng chu kỳ', fnum(C.tc * 60), fnum(C.tcR * 60)],
      ['Số bể sục khí đồng thời tối đa', fnum(C.kAer), fnum(C.kAerR)]], 2.2, { aligns: ['L', 'R', 'R'] });
    let y = yb2 - 10; sh.text('CHÚ GIẢI MÀU', COL_X0, y, 2.6, 'L', true); y -= 7;
    for (const [ly, lab] of Object.values(PHC)) { sh.solid([[COL_X0, y], [COL_X0 + 10, y], [COL_X0 + 10, y + 4], [COL_X0, y + 4]], ly, LAYERS[ly][1]); sh.text(lab, COL_X0 + 13, y + 0.8, 2.2); y -= 7; }
    notes(sh, COL_X0, y - 4, ['Kỵ khí tối thiểu 60 phút tính từ đầu pha nạp đến khi bắt đầu sục khí để giải phóng P hiệu quả (O&M Manual).',
      'Mùa mưa: bộ điều khiển rút ngắn sục khí về mức tối thiểu và tăng mẻ nạp tối đa.', 'Bùn dư xả mỗi chu kỳ sau pha lắng để duy trì áp lực chọn lọc hạt.']);
    return sh;
  }

  function sheet07(R, date) {
    const p = R.p, E = R.equip, P = R.pipes, A = R.air, S = R.sludge, N = Math.round(p.Nr), nTr = cluster(R).nTrough;
    const sh = new Sheet('NR-07', SHEETS[7][1], '–', project(R, date));
    title(sh, 30, 560, 'BẢNG THỐNG KÊ THIẾT BỊ CHÍNH');
    const rr = N > 1 ? `R-301…R-${300 + N}` : 'R-301';
    const rows = [['TAG', 'THIẾT BỊ / CÔNG TRÌNH', 'THÔNG SỐ CHÍNH', 'SL (LV+DP)', 'kW/máy', 'VỊ TRÍ', 'TỜ'],
      [rr, 'Bể NEREDA (bê tông cốt thép)', `${fnum(R.reactor.VR)} m³; H = ${fnum(p.H, 1)} m`, String(N), '–', 'Cụm bể', 'NR-03'],
      [`MV-311…${310 + N}`, 'Van nạp nước (điều khiển điện)', `DN${P.feed.DN}, ${fnum(P.feed.Q)} m³/h`, String(N), '–', 'Hành lang ống', 'NR-03'],
      [`MV-321…${320 + N}`, 'Van xả bùn dư', `DN${P.sludge.DN}, ${fnum(P.sludge.Q)} m³/h`, String(N), '–', 'Hành lang ống', 'NR-03'],
      [`MV-411…${410 + N}`, 'Van điều chỉnh khí', `DN${P.airR.DN}, ${fnum(A.airDesR)} Sm³/h`, String(N), '–', 'Hành lang ống', 'NR-03'],
      [`D-301…${300 + N}`, 'Lưới đĩa phân phối khí 9"', `${fnum(A.nDisc)} đĩa/bể; ${fnum(A.airDesR / A.nDisc, 2)} Sm³/h·đĩa`, `${N} bể`, '–', 'Đáy bể', 'NR-05'],
      [`FD-301…${300 + N}`, 'Lưới phân phối nước đáy', `ống góp DN${P.feed.DN}`, `${N} bể`, '–', 'Đáy bể', 'NR-05'],
      [`ET-301…${300 + N}`, 'Máng thu nước cố định', `${nTr} máng × ${fnum(TROUGH_W, 1)} m/bể`, `${N} bể`, '–', 'Mặt bể', 'NR-03'],
      [`AB-401…${400 + E.blowerDuty + E.blowerStby}`, 'Máy thổi khí (biến tần)', `${fnum(E.blowerQ)} Sm³/h; Δp ${fnum(E.blowerP)} kPa`, `${E.blowerDuty}+${E.blowerStby}`, fnum(E.blowerKW * 1.1), 'Nhà máy thổi khí', 'NR-02']];
    if (E.feedPumps) rows.push(['P-201…203', 'Bơm nạp từ bể điều hòa', `${fnum(E.feedPumps.Q)} m³/h`, `${E.feedPumps.duty}+${E.feedPumps.stby}`, '–', 'Bể điều hòa', 'NR-02']);
    rows.push(['WP-501…502', 'Bơm bùn dư bể đệm bùn', `${fnum(E.wasPumps.Q)} m³/h`, '1+1', '–', 'Bể đệm bùn', 'NR-02'],
      ['TK-501', 'Bể đệm bùn (có tiền cô đặc)', `${fnum(S.Vsb)} m³; rút bùn ≤ 1 m/h`, '1', '–', 'Khu bùn', 'NR-02'],
      ['DW-601', 'Máy tách nước bùn (ly tâm)', `${fnum(E.dewater.Q, 1)} m³/h × ${E.dewater.hours} h/ngày`, '1+1', '–', 'Nhà tách nước', 'NR-02'],
      ['AIT-3x1…3x7', 'Thiết bị đo mỗi bể', 'DO, NH₄, NO₃, PO₄, redox, mức, TSS', `${N} bộ`, '–', 'Mỗi bể', 'NR-03'],
      ['NC-001', 'Bộ điều khiển quá trình NEREDA', 'Lập lịch chu trình, điều khiển khí theo DO', '1', '–', 'Nhà điều hành', '–']);
    const yb = sh.table(30, 552, [44, 118, 160, 34, 26, 64, 26], rows, 3.0, { aligns: ['L', 'L', 'L', 'C', 'R', 'L', 'C'] });
    title(sh, 30, yb - 14, 'BẢNG ĐƯỜNG ỐNG CHÍNH');
    const prow = [['TUYẾN', 'LƯU LƯỢNG', 'DN', 'v (m/s)', 'GIỚI HẠN v']];
    for (const [k, lab, un] of [['feed', 'Ống nạp mỗi bể', 'm³/h'], ['eff', 'Ống thu nước ra mỗi bể', 'm³/h'], ['airR', 'Ống khí xuống mỗi bể', 'Sm³/h'], ['airMain', 'Ống khí chính', 'Sm³/h'], ['sludge', 'Ống xả bùn dư mỗi bể', 'm³/h']]) {
      const x = P[k]; prow.push([lab, `${fnum(x.Q)} ${un}`, `DN${x.DN}`, fnum(x.v, 2), `≤ ${fnum(x.vmax, 1)}`]);
    }
    sh.table(30, yb - 22, [110, 70, 40, 40, 40], prow, 3.0, { aligns: ['L', 'R', 'C', 'R', 'R'] });
    notes(sh, 30, 150, ['Thông số thiết bị là định cỡ sơ bộ từ bộ tính toán; chọn model cụ thể khi thiết kế kỹ thuật.',
      `Công suất máy thổi khí lấy dư 10% so với công suất trục tính toán (${fnum(E.blowerKW)} kW/máy).`,
      `Tổng điện cấp khí ≈ ${fnum(A.Eday)} kWh/ngày (${fnum(A.kWhm3, 3)} kWh/m³).`, 'Mã thiết bị (tag) thống nhất giữa các tờ NR-03, NR-05 và bảng này.'], 420, 2.6);
    return sh;
  }

  /** Dựng toàn bộ 8 tờ. */
  function build(R, date) {
    if (!R || !R.ok) throw new Error('Kết quả tính toán không hợp lệ');
    date = date || new Date().toLocaleDateString('vi-VN');
    const scales = {}, out = {};
    out[2] = sheet02(R, date, scales); out[3] = sheet03(R, date, scales); out[4] = sheet04(R, date, scales); out[5] = sheet05(R, date, scales);
    out[1] = sheet01(R, date); out[6] = sheet06(R, date); out[7] = sheet07(R, date); out[0] = sheet00(R, date, scales);
    return [0, 1, 2, 3, 4, 5, 6, 7].map(i => out[i]);
  }

  // ------------------------------------------------------------------ Xuất SVG
  const xmlEsc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const DASH = { DASHED: '2.4 1.2', CENTER: '6 1.2 1.2 1.2' };
  function toSVG(sh) {
    const H = sh.H, f = v => Math.round(v * 100) / 100, Y = y => f(H - y), out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sh.W} ${sh.H}" width="100%" font-family="DejaVu Sans, Be Vietnam Pro, Arial, sans-serif"><rect width="${sh.W}" height="${sh.H}" fill="#ffffff"/>`);
    const st = ly => { const L = LAYERS[ly]; return `stroke="${L[1]}" stroke-width="${Math.max(L[2], 0.1)}"${L[3] ? ` stroke-dasharray="${DASH[L[3]]}"` : ''}`; };
    const pth = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${Y(p[1])}`).join('');
    for (const e of sh.e) {
      if (e.t === 'pl') out.push(`<path d="${pth(e.pts)}${e.closed ? 'Z' : ''}" fill="none" ${st(e.ly)}/>`);
      else if (e.t === 'ci') out.push(`<circle cx="${f(e.c[0])}" cy="${Y(e.c[1])}" r="${f(e.r)}" fill="none" ${st(e.ly)}/>`);
      else if (e.t === 'so') out.push(`<path d="${pth(e.pts)}Z" fill="${e.rgb || LAYERS[e.ly][1]}" stroke="none"/>`);
      else if (e.t === 're') out.push(`<path d="${[e.outer].concat(e.holes).map(q => pth(q) + 'Z').join('')}" fill="${e.rgb}" fill-rule="evenodd" ${st(e.ly)}/>`);
      else if (e.t === 'tx') {
        const al = e.al, anchor = /R$/.test(al) || al === 'R' ? 'end' : (/C$/.test(al) || al === 'C') ? 'middle' : 'start';
        const base = al[0] === 'M' ? 'central' : al[0] === 'T' ? 'hanging' : al[0] === 'B' ? 'text-after-edge' : 'alphabetic';
        const fs = f(e.h * 1.38), rot = e.rot ? ` transform="rotate(${-e.rot} ${f(e.x)} ${Y(e.y)})"` : '';
        out.push(`<text x="${f(e.x)}" y="${Y(e.y)}" font-size="${fs}" text-anchor="${anchor}" dominant-baseline="${base}"${e.bold ? ' font-weight="700"' : ''} fill="${LAYERS[e.ly][1]}"${rot}>${xmlEsc(e.s)}</text>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  // ------------------------------------------------------------------ Xuất DXF R12 (ASCII, mở được bằng AutoCAD)
  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '①': '(1)', '②': '(2)' };
  function dxfStr(s) {
    let o = '';
    for (const ch of String(s)) {
      const r = SUB[ch]; if (r) { o += r; continue; }
      const cp = ch.codePointAt(0);
      o += cp < 128 ? ch : '\\U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    }
    return o;
  }
  function toDXF(sh) {
    const o = [], g = (c, v) => { o.push(String(c), String(v)); }, n = v => (Math.round(v * 10000) / 10000).toString();
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252'); g(9, '$INSUNITS'); g(70, 4);
    g(9, '$EXTMIN'); g(10, 0); g(20, 0); g(30, 0); g(9, '$EXTMAX'); g(10, sh.W); g(20, sh.H); g(30, 0);
    g(9, '$LIMMIN'); g(10, 0); g(20, 0); g(9, '$LIMMAX'); g(10, sh.W); g(20, sh.H); g(9, '$LTSCALE'); g(40, 1.0);
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 3);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0.0);
    g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, '__ __ __'); g(72, 65); g(73, 2); g(40, 3.6); g(49, 2.4); g(49, -1.2);
    g(0, 'LTYPE'); g(2, 'CENTER'); g(70, 0); g(3, '____ _ ____'); g(72, 65); g(73, 4); g(40, 9.6); g(49, 6.0); g(49, -1.2); g(49, 1.2); g(49, -1.2);
    g(0, 'ENDTAB');
    const names = Object.keys(LAYERS);
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, names.length + 1);
    g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
    for (const nm of names) { g(0, 'LAYER'); g(2, nm); g(70, 0); g(62, LAYERS[nm][0]); g(6, LAYERS[nm][3] || 'CONTINUOUS'); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 3);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'arial.ttf'); g(4, '');
    g(0, 'STYLE'); g(2, 'VN'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'arial.ttf'); g(4, '');
    g(0, 'STYLE'); g(2, 'VNB'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'arialbd.ttf'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    const poly = (pts, ly, closed) => {
      g(0, 'POLYLINE'); g(8, ly); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, closed ? 1 : 0);
      for (const p of pts) { g(0, 'VERTEX'); g(8, ly); g(10, n(p[0])); g(20, n(p[1])); g(30, 0); }
      g(0, 'SEQEND'); g(8, ly);
    };
    const solid = (pts, ly) => {
      const q = pts.length === 3 ? [pts[0], pts[1], pts[2], pts[2]] : [pts[0], pts[1], pts[3], pts[2]];
      g(0, 'SOLID'); g(8, ly);
      q.forEach((p, i) => { g(10 + i, n(p[0])); g(20 + i, n(p[1])); g(30 + i, 0); });
    };
    for (const e of sh.e) {
      if (e.t === 'pl') {
        if (e.pts.length === 2 && !e.closed) { g(0, 'LINE'); g(8, e.ly); g(10, n(e.pts[0][0])); g(20, n(e.pts[0][1])); g(30, 0); g(11, n(e.pts[1][0])); g(21, n(e.pts[1][1])); g(31, 0); }
        else poly(e.pts, e.ly, e.closed);
      } else if (e.t === 'ci') { g(0, 'CIRCLE'); g(8, e.ly); g(10, n(e.c[0])); g(20, n(e.c[1])); g(30, 0); g(40, n(e.r)); }
      else if (e.t === 'so') {
        if (e.pts.length <= 4) solid(e.pts, e.ly);
        else { const c0 = e.pts.reduce((a, p) => [a[0] + p[0] / e.pts.length, a[1] + p[1] / e.pts.length], [0, 0]); e.pts.forEach((p, i) => solid([c0, p, e.pts[(i + 1) % e.pts.length]], e.ly)); }
      } else if (e.t === 're') { poly(e.outer, e.ly, true); for (const h of e.holes) poly(h, e.ly, true); }
      else if (e.t === 'tx') {
        const al = e.al, h72 = /R$/.test(al) ? 2 : (/C$/.test(al) && al !== 'C') || al === 'C' ? 1 : 0;
        const v73 = al[0] === 'M' ? 2 : al[0] === 'T' ? 3 : al[0] === 'B' ? 1 : 0;
        const hh = al === 'MC' ? 4 : h72, vv = al === 'MC' ? 0 : v73;
        g(0, 'TEXT'); g(8, e.ly); g(10, n(e.x)); g(20, n(e.y)); g(30, 0); g(40, n(e.h)); g(1, dxfStr(e.s));
        if (e.rot) g(50, e.rot);
        g(7, e.bold ? 'VNB' : 'VN');
        if (hh || vv) { g(72, hh); g(11, n(e.x)); g(21, n(e.y)); g(31, 0); g(73, vv); }
      }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return o.join('\r\n') + '\r\n';
  }

  // ------------------------------------------------------------------ Xuất PDF (jsPDF, font nhúng có dấu tiếng Việt)
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  function toPDF(sheets, jsPDF, fonts) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [841, 594], compress: true });
    doc.addFileToVFS('DejaVuSans-vn.ttf', fonts.regular); doc.addFont('DejaVuSans-vn.ttf', 'DejaVu', 'normal');
    doc.addFileToVFS('DejaVuSans-Bold-vn.ttf', fonts.bold); doc.addFont('DejaVuSans-Bold-vn.ttf', 'DejaVu', 'bold');
    sheets.forEach((sh, si) => {
      if (si) doc.addPage([841, 594], 'landscape');
      const H = sh.H, Y = y => H - y;
      const pen = ly => { const L = LAYERS[ly]; doc.setDrawColor(...hex(L[1])); doc.setLineWidth(Math.max(L[2], 0.1)); doc.setLineDashPattern(L[3] === 'DASHED' ? [2.4, 1.2] : L[3] === 'CENTER' ? [6, 1.2, 1.2, 1.2] : [], 0); };
      const path = (pts, close) => { pts.forEach((p, i) => i ? doc.lineTo(p[0], Y(p[1])) : doc.moveTo(p[0], Y(p[1]))); if (close) doc.close(); };
      for (const e of sh.e) {
        if (e.t === 'so') { doc.setFillColor(...hex(e.rgb || LAYERS[e.ly][1])); path(e.pts, true); doc.fill(); }
        else if (e.t === 're') { doc.setFillColor(...hex(e.rgb)); pen(e.ly); [e.outer].concat(e.holes).forEach(q => path(q, true)); doc.fillStrokeEvenOdd(); }
        else if (e.t === 'pl') { pen(e.ly); path(e.pts, e.closed); doc.stroke(); }
        else if (e.t === 'ci') { pen(e.ly); doc.circle(e.c[0], Y(e.c[1]), e.r, 'S'); }
        else if (e.t === 'tx') {
          doc.setFont('DejaVu', e.bold ? 'bold' : 'normal'); doc.setFontSize(e.h * 1.38 / 0.3528); doc.setTextColor(...hex(LAYERS[e.ly][1]));
          const al = e.al, align = /R$/.test(al) ? 'right' : (/C$/.test(al) || al === 'C') ? 'center' : 'left';
          const baseline = al[0] === 'M' ? 'middle' : al[0] === 'T' ? 'top' : al[0] === 'B' ? 'bottom' : 'alphabetic';
          doc.text(e.s, e.x, Y(e.y), { align, baseline, angle: e.rot || 0 });
        }
      }
      doc.setLineDashPattern([], 0);
    });
    if (doc.outline) sheets.forEach((sh, i) => doc.outline.add(null, `${sh.number} ${sh.title}`, { pageNumber: i + 1 }));
    doc.setProperties({ title: (sheets[0] && sheets[0].project.name) || 'NEREDA', subject: 'Bản vẽ thiết kế sơ bộ NEREDA', creator: 'SimXLNT NEREDA' });
    return doc;
  }

  return { SHEETS, LAYERS, build, toSVG, toDXF, toPDF, cluster, discLayout, site, dxfStr, textW };
});
