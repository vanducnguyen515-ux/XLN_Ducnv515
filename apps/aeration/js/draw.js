// Aeration Design Tool – bản vẽ sơ bộ: mô hình hình học chung → SVG (màn hình/PDF) và DXF R12 (AutoCAD)
'use strict';
var DRW = {};
(function () {
  const f1 = x => (Math.round(x * 10) / 10).toString(), f0 = x => Math.round(x).toString();
  // Mô hình: danh sách đối tượng {t:'line'|'rect'|'circle'|'text'|'poly'|'dim', layer, ...} theo mét
  function M() { this.e = []; }
  M.prototype = {
    line(x1, y1, x2, y2, l) { this.e.push({ t: 'line', x1, y1, x2, y2, l }); },
    rect(x, y, w, h, l) { this.e.push({ t: 'poly', p: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c: 1, l }); },
    poly(p, l, c) { this.e.push({ t: 'poly', p, c: !!c, l }); },
    circ(x, y, r, l) { this.e.push({ t: 'circle', x, y, r, l }); },
    text(x, y, s, h, l, a) { this.e.push({ t: 'text', x, y, s, h, l, a: a || 'l' }); },
    dim(x1, y1, x2, y2, off, s, h) {                     // kích thước thẳng (ngang/dọc)
      const hz = Math.abs(y2 - y1) < 1e-9, l = 'DIM';
      if (hz) { const y = y1 + off; this.line(x1, y1, x1, y, l); this.line(x2, y2, x2, y, l); this.line(x1, y, x2, y, l);
        this.tick(x1, y); this.tick(x2, y); this.text((x1 + x2) / 2, y + h * 0.4, s, h, l, 'c'); }
      else { const x = x1 + off; this.line(x1, y1, x, y1, l); this.line(x2, y2, x, y2, l); this.line(x, y1, x, y2, l);
        this.tick(x, y1); this.tick(x, y2); this.e.push({ t: 'text', x: x - h * 0.4, y: (y1 + y2) / 2, s, h, l, a: 'c', rot: 90 }); }
    },
    tick(x, y) { const k = 0.12; this.line(x - k, y - k, x + k, y + k, 'DIM'); },
    bbox() {
      let a = [1e9, 1e9, -1e9, -1e9];
      const u = (x, y) => { a[0] = Math.min(a[0], x); a[1] = Math.min(a[1], y); a[2] = Math.max(a[2], x); a[3] = Math.max(a[3], y); };
      for (const o of this.e) {
        if (o.t === 'line') { u(o.x1, o.y1); u(o.x2, o.y2); } else if (o.t === 'poly') o.p.forEach(p => u(p[0], p[1]));
        else if (o.t === 'circle') { u(o.x - o.r, o.y - o.r); u(o.x + o.r, o.y + o.r); } else u(o.x, o.y);
      }
      return a;
    }
  };
  DRW.M = M;
  // Chuỗi 'Việt|English' → dòng tiếng Việt + dòng tiếng Anh nhỏ hơn ngay bên dưới (en = true)
  DRW.split = s => { const i = String(s).indexOf('|'); return i < 0 ? [String(s), ''] : [String(s).slice(0, i), String(s).slice(i + 1)]; };
  DRW.lines = e => { const [vi, en] = DRW.split(e.s); return en && !e.rot ? [{ x: e.x, y: e.y, s: vi, h: e.h }, { x: e.x, y: e.y - e.h * 1.15, s: en, h: e.h * 0.72, en: true }] : [{ x: e.x, y: e.y, s: vi, h: e.h }]; };
  DRW.colors = { WALL: '#1f2937', CONC: '#6b7280', DIFF: '#2563eb', PIPE: '#dc2626', AIR: '#ea580c', EQUIP: '#059669', DIM: '#475569',
    TEXT: '#111827', WATER: '#0ea5e9', AXIS: '#9ca3af', MECH: '#7c3aed', TITLE: '#111827', HATCH: '#94a3b8' };
  DRW.aci = { WALL: 7, CONC: 8, DIFF: 5, PIPE: 1, AIR: 30, EQUIP: 3, DIM: 9, TEXT: 7, WATER: 4, AXIS: 8, MECH: 6, TITLE: 7, HATCH: 8 };

  // ---- Bản vẽ 1: Mặt bằng bể + lưới đĩa ----
  DRW.plan = (S, r) => {
    const m = new M(), t = S.tank, wt = t.wall, L = t.L, W = t.W, h = Math.max(0.25, Math.min(L, W) / 40);
    const nB = Math.min(t.nBasin, 4);
    const gap = wt;
    for (let b = 0; b < nB; b++) {
      const y0 = b * (W + gap);
      m.rect(0, y0, L, W, 'WALL');
      if (b === 0) m.rect(-wt, -wt, L + 2 * wt, nB * W + (nB - 1) * gap + 2 * wt, 'WALL');
      if (b > 0) m.line(0, y0 - gap, L, y0 - gap, 'WALL');
      m.text(L / 2, y0 + W - 1.2 * h, `BỂ ${b + 1}|BASIN ${b + 1}`, h, 'TEXT', 'c');
      if (r.kind === 'fb' || r.kind === 'cb') DRW.gridPlan(m, S, r, 0, y0, b === 0);
      else DRW.mechPlan(m, S, r, 0, y0);
    }
    if (t.nBasin > nB) m.text(L / 2, -wt - 3.2 * h, `(Vẽ ${nB}/${t.nBasin} bể giống nhau)|(${nB} of ${t.nBasin} identical basins shown)`, h * 0.8, 'TEXT', 'c');
    const Wt = nB * W + (nB - 1) * gap;
    m.dim(0, -wt, L, -wt, -1.8 * h - 0.5, `${f1(L * 1000 / 1000)} m`, h);
    m.dim(L + wt, 0, L + wt, W, 1.8 * h + 0.5, `${f1(W)} m`, h);
    // ống góp chính phía trên
    if (r.kind === 'fb' || r.kind === 'cb') {
      const ym = Wt + wt + 1.2;
      m.line(-2, ym, L + 1, ym, 'AIR');
      m.text(-2, ym + 1.2 * h, `ỐNG GÓP CHÍNH DN${r.dn.main} → từ nhà máy thổi khí|MAIN HEADER DN${r.dn.main} → from blower building`, h * 0.8, 'AIR');
    }
    m.title = r.kind === 'fb' || r.kind === 'cb' ? 'MẶT BẰNG BỐ TRÍ LƯỚI PHÂN PHỐI KHÍ|AIR DIFFUSER GRID LAYOUT PLAN' : 'MẶT BẰNG BỐ TRÍ THIẾT BỊ SỤC KHÍ|AERATOR LAYOUT PLAN';
    m.sub = r.name + (r.en ? '|' + r.en : '');
    return m;
  };
  DRW.gridPlan = (m, S, r, x0, y0, label) => {
    const lay = r.lay, d = r.d, c = lay.c, rr = Math.max(0.1, d.len / 2);
    let li = 0;
    const xs = []; for (let i = 0; i < lay.nLat; i++) xs.push(x0 + c + (lay.nLat > 1 ? i * lay.pl : (lay.Ll) / 2));
    for (let gi = 0; gi < lay.nGrid; gi++) {
      const nL = lay.latPerGrid[gi], gx = xs.slice(li, li + nL); li += nL;
      if (!gx.length) continue;
      const ymF = y0 + c * 0.6;                                   // manifold dọc tường (cạnh dưới)
      m.line(gx[0] - 0.2, ymF, gx[gx.length - 1] + 0.2, ymF, 'PIPE');
      const xd = (gx[0] + gx[gx.length - 1]) / 2;
      m.circ(xd, ymF, 0.18, 'PIPE');                             // dropleg
      if (label) m.text(xd, ymF - 0.7, `G${gi + 1}`, 0.35, 'TEXT', 'c');
      for (const x of gx) {
        m.line(x, ymF, x, y0 + c + lay.Wl, 'PIPE');
        for (let j = 0; j < lay.nPer; j++) {
          if (lay.lin) { const yc = y0 + c + (j + 0.5) * lay.pd; m.rect(x - 0.06, yc - rr, 0.12, 2 * rr, 'DIFF'); }
          else { const yc = y0 + c + (lay.nPer > 1 ? j * lay.pd : lay.Wl / 2); m.circ(x, yc, rr, 'DIFF'); }
        }
      }
      if (label && gi === 0 && gx.length > 1) {
        m.dim(gx[0], y0 + c + lay.Wl + 0.2, gx[1], y0 + c + lay.Wl + 0.2, 0.5, `${f0(lay.pl * 1000)}`, 0.25);
      }
    }
  };
  DRW.mechPlan = (m, S, r, x0, y0) => {
    const t = S.tank, n = r.sel.n, cols = Math.ceil(n / (t.L / t.W > 1.6 ? 1 : Math.ceil(Math.sqrt(n)))), rows = Math.ceil(n / cols);
    const dx = t.L / cols, dy = t.W / rows;
    let k = 0;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (k++ >= n) break;
      const x = x0 + dx * (i + 0.5), y = y0 + dy * (j + 0.5);
      if (r.key === 'surf') { m.circ(x, y, Math.min(dx, dy) * 0.12, 'MECH'); m.circ(x, y, Math.min(dx, dy) * 0.42, 'WATER'); }
      else if (r.key === 'asp') { m.rect(x - 0.6, y - 0.6, 1.2, 1.2, 'MECH'); m.line(x, y, x + Math.min(dx, dy) * 0.4, y, 'WATER'); }
      else { m.rect(x - 0.5, y - 0.4, 1.0, 0.8, 'MECH'); m.line(x + 0.5, y, x + Math.min(dx * 0.45, 4), y, 'WATER'); m.line(x, y, x, y0 + t.W, 'AIR'); }
      m.text(x, y - Math.min(dx, dy) * 0.25 - 0.3, `A${k}`, 0.35, 'TEXT', 'c');
    }
  };

  // ---- Bản vẽ 2: Mặt cắt bể ----
  DRW.section = (S, r) => {
    const m = new M(), t = S.tank, W = t.W, H = t.H, fb = t.freeboard, wt = t.wall, h = Math.max(0.2, W / 40);
    m.poly([[-wt, H + fb], [-wt, -wt], [W + wt, -wt], [W + wt, H + fb], [W, H + fb], [W, 0], [0, 0], [0, H + fb]], 'CONC', true);
    m.line(0, H, W, H, 'WATER'); m.text(W + wt + 0.3, H, `MNC (TWL) +${f1(H)}|Top water level`, h, 'WATER');
    if (t.Hbwl < H) { m.line(0, t.Hbwl, W, t.Hbwl, 'WATER'); m.text(W + wt + 0.3, t.Hbwl - 0.1, `MNT (BWL) +${f1(t.Hbwl)}|Bottom water level`, h, 'WATER'); }
    m.text(W + wt + 0.3, -0.1, '±0.00 đáy bể|basin floor', h, 'TEXT');
    if (r.kind === 'fb' || r.kind === 'cb') {
      const lay = r.lay, hd = t.hDiff;
      m.line(lay.c, hd, lay.c + lay.Wl, hd, 'PIPE');
      for (let j = 0; j < lay.nPer; j++) {
        const y = lay.lin ? lay.c + (j + 0.5) * lay.pd : lay.c + (lay.nPer > 1 ? j * lay.pd : lay.Wl / 2);
        if (lay.lin) m.rect(y - Math.min(0.9, lay.pd * 0.4), hd, 2 * Math.min(0.9, lay.pd * 0.4), 0.07, 'DIFF');
        else m.rect(y - 0.11, hd, 0.22, 0.06, 'DIFF');
        m.line(y, hd + 0.07, y, hd + 0.5, 'AIR');
      }
      const xd = 0.35;
      m.poly([[xd, H + fb + 0.6], [xd, hd], [lay.c, hd]], 'PIPE');
      m.text(xd + 0.15, (H + hd) / 2, `ỐNG ĐỨNG DN${r.dn.drop} (${S.pipe.dropMat})|DROPLEG DN${r.dn.drop}`, h * 0.8, 'PIPE');
      m.line(-wt - 1.5, H + fb + 0.6, xd, H + fb + 0.6, 'AIR');
      m.text(-wt - 1.5, H + fb + 0.6 + 0.4 * h, `NHÁNH DN${r.dn.br}|BRANCH DN${r.dn.br}`, h * 0.8, 'AIR');
      m.dim(W, 0, W, hd, 0.8, `${f0(hd * 1000)}`, h * 0.8);
      m.dim(W, hd, W, H, 0.8, `ngập / subm. ${f1(H - hd)} m`, h * 0.8);
      m.text(W / 2, hd + 0.9 + 0.6 * h, `${r.d.name}|${r.d.en}`, h * 0.75, 'DIFF', 'c');
    } else {
      const x = W / 2;
      if (r.key === 'surf') { m.rect(x - 1, H - 0.2, 2, 0.4, 'MECH'); m.rect(x - 0.4, H + 0.2, 0.8, 0.9, 'MECH'); m.text(x, H + 1.4, 'Máy sục khí bề mặt (cầu/phao)|Surface aerator (bridge/float)', h, 'MECH', 'c'); }
      else if (r.key === 'asp') { m.poly([[x - 1.6, H + 0.8], [x + 1.4, H - 1.6]], 'MECH'); m.rect(x - 2.1, H + 0.6, 0.9, 0.6, 'MECH'); m.text(x, H + 1.5, 'Máy sục khí hút (phao)|Aspirating aerator (float)', h, 'MECH', 'c'); }
      else { m.rect(x - 0.6, 0, 1.2, 1.1, 'MECH'); m.line(x + 0.6, 0.55, x + 2.4, 0.55, 'MECH'); m.line(x, 1.1, x, H + fb + 0.5, 'AIR'); m.text(x + 0.2, H + fb + 0.7, 'Ống hút khí|Air intake pipe', h, 'AIR'); m.text(x, 1.4, 'Jet aerator (bơm chìm + ejector)|Jet aerator (submersible pump + ejector)', h, 'MECH', 'c'); }
    }
    m.dim(0, -wt, W, -wt, -1.0, `${f1(W)} m`, h);
    m.dim(-wt, 0, -wt, H + fb, -1.0, `${f1(H + fb)} m`, h);
    m.title = 'MẶT CẮT NGANG BỂ SỤC KHÍ|AERATION BASIN CROSS-SECTION'; m.sub = `Ngập trung bình ${f1(r.sub ? r.sub.mean : 0)} m|Mean submergence ${f1(r.sub ? r.sub.mean : 0)} m`;
    return m;
  };

  // ---- Bản vẽ 3: Sơ đồ đường khí (PFD) + nhà máy thổi khí ----
  DRW.pfd = (S, r) => {
    const m = new M(), b = r.blower, nT = b.nDuty + b.nStby, h = 0.35;
    const dims = b.model ? b.model.dim.map(x => x / 1000) : ENG.blowerDim(b.motor, b.tech).map(x => x / 1000);
    const bw = dims[0], bl = dims[1], sp = Math.max(1.2, bw * 0.8);
    const roomW = nT * bw + (nT + 1) * sp, roomL = bl + 4.5;
    m.rect(0, 0, roomW, roomL, 'WALL'); m.rect(-0.25, -0.25, roomW + 0.5, roomL + 0.5, 'WALL');
    m.text(roomW / 2, roomL + 1.1, 'NHÀ ĐẶT MÁY THỔI KHÍ (sơ bộ)|BLOWER BUILDING (preliminary)', h * 1.2, 'TEXT', 'c');
    const yh = roomL - 1.2;
    m.line(sp, yh, roomW + 6, yh, 'AIR');
    m.text(roomW + 0.4, yh + 0.25, `DN${r.dn.main}`, h, 'AIR');
    for (let i = 0; i < nT; i++) {
      const x = sp + i * (bw + sp);
      m.rect(x, 1.2, bw, bl, 'EQUIP');
      const st = i >= b.nDuty;
      m.text(x + bw / 2, 1.2 + bl / 2, `B-${i + 1}${st ? ' (DP)|(standby)' : ''}`, h, 'EQUIP', 'c');
      m.text(x + bw / 2, 1.2 + bl / 2 - 0.85, b.model ? b.model.m : `${b.motor} kW`, h * 0.8, 'EQUIP', 'c');
      m.line(x + bw / 2, 1.2 + bl, x + bw / 2, yh, 'AIR');
      m.circ(x + bw / 2, (1.2 + bl + yh) / 2, 0.18, 'AIR');           // van một chiều/van
      m.rect(x + bw / 2 - 0.3, 0.2, 0.6, 0.5, 'EQUIP');                 // lọc gió
    }
    m.text(sp, 0.8 - 0.4, 'Cửa lấy gió + lọc|Air intake + filter', h * 0.8, 'TEXT');
    // sơ đồ phân phối tới bể
    const x0 = roomW + 6, nB = Math.min(S.tank.nBasin, 6);
    for (let i = 0; i < nB; i++) {
      const y = yh - i * 2.2;
      m.line(x0, yh, x0, y, 'AIR'); m.line(x0, y, x0 + 4, y, 'AIR');
      m.circ(x0 + 1.4, y, 0.2, 'PIPE'); m.text(x0 + 1.4, y + 0.35, 'FCV', h * 0.7, 'PIPE', 'c');
      m.rect(x0 + 2.2, y - 0.25, 0.5, 0.5, 'PIPE'); m.text(x0 + 2.45, y + 0.45, 'FIT', h * 0.7, 'PIPE', 'c');
      m.rect(x0 + 4, y - 0.8, 5, 1.6, 'WALL'); m.text(x0 + 6.5, y + 0.2, `BỂ ${i + 1}${r.lay ? ' – ' + r.lay.nGrid + ' lưới' : ''}|BASIN ${i + 1}${r.lay ? ' – ' + r.lay.nGrid + ' grids' : ''}`, h, 'TEXT', 'c');
      m.circ(x0 + 8.3, y, 0.25, 'WATER'); m.text(x0 + 8.3, y - 0.65, 'DO', h * 0.7, 'WATER', 'c');
    }
    m.title = 'SƠ ĐỒ ĐƯỜNG KHÍ & NHÀ MÁY THỔI KHÍ|AIR FLOW DIAGRAM & BLOWER BUILDING'; m.sub = `${b.nDuty} chạy + ${b.nStby} dự phòng – ${b.Bk.name}|${b.nDuty} duty + ${b.nStby} standby – ${b.Bk.en}`;
    m.room = { W: roomW, L: roomL };
    return m;
  };

  DRW.all = (S, r) => (r.kind === 'fb' || r.kind === 'cb') ? [DRW.plan(S, r), DRW.section(S, r), DRW.pfd(S, r)] : [DRW.plan(S, r), DRW.section(S, r)];

  // ---- Xuất SVG ----
  DRW.svg = (m, wPx, hPx, opt) => {
    opt = opt || {};
    const bb = m.bbox(), pad = 0.08, bw = bb[2] - bb[0], bh = bb[3] - bb[1];
    const sc = Math.min(wPx / (bw * (1 + 2 * pad)), (hPx - 66) / (bh * (1 + 2 * pad)));
    const ox = (wPx - bw * sc) / 2 - bb[0] * sc, oy = (hPx - 66 + bh * sc) / 2 + bb[1] * sc + 60;
    const X = x => (x * sc + ox).toFixed(1), Y = y => (oy - y * sc).toFixed(1), C = DRW.colors;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wPx} ${hPx}" width="${wPx}" height="${hPx}" font-family="Roboto, Arial, sans-serif">`;
    o += `<rect width="${wPx}" height="${hPx}" fill="#fff"/>`;
    const [tv, te] = DRW.split(m.title || ''), [sv, se] = DRW.split(m.sub || '');
    o += `<text x="12" y="20" font-size="15" font-weight="700" fill="${C.TITLE}">${esc(tv)}</text>`;
    if (te) o += `<text x="12" y="33" font-size="11" fill="${C.TITLE}" fill-opacity=".6">${esc(te)}</text>`;
    if (sv) o += `<text x="12" y="48" font-size="11" fill="#475569">${esc(sv)}</text>`;
    if (se) o += `<text x="12" y="59" font-size="9.5" fill="#475569" fill-opacity=".6">${esc(se)}</text>`;
    for (const e of m.e) {
      const col = C[e.l] || '#000', sw = e.l === 'WALL' || e.l === 'CONC' ? 1.8 : e.l === 'PIPE' || e.l === 'AIR' ? 1.4 : 0.9;
      if (e.t === 'line') o += `<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" stroke="${col}" stroke-width="${sw}"/>`;
      else if (e.t === 'poly') o += `<${e.c ? 'polygon' : 'polyline'} points="${e.p.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" fill="${e.l === 'CONC' ? '#e5e7eb' : 'none'}" stroke="${col}" stroke-width="${sw}"/>`;
      else if (e.t === 'circle') o += `<circle cx="${X(e.x)}" cy="${Y(e.y)}" r="${Math.max(0.8, e.r * sc).toFixed(1)}" fill="none" stroke="${col}" stroke-width="${sw}"/>`;
      else if (e.t === 'text') {
        const an = e.a === 'c' ? 'middle' : e.a === 'r' ? 'end' : 'start';
        for (const t of DRW.lines(e)) {
          const fs = Math.max(t.en ? 6 : 7, Math.min(16, t.h * sc));
          o += `<text x="${X(t.x)}" y="${Y(t.y)}" font-size="${fs.toFixed(1)}" fill="${col}"${t.en ? ' fill-opacity=".6"' : ''} text-anchor="${an}"${e.rot ? ` transform="rotate(-${e.rot} ${X(t.x)} ${Y(t.y)})"` : ''}>${esc(t.s)}</text>`;
        }
      }
    }
    if (opt.scaleNote !== false) o += `<text x="${wPx - 10}" y="${hPx - 8}" font-size="9" fill="#64748b" text-anchor="end">Kích thước: m (trừ ghi chú mm) – bản vẽ sơ bộ, không theo tỷ lệ in <tspan fill-opacity=".6">· Dimensions: m (unless noted mm) – preliminary, not to scale</tspan></text>`;
    return o + '</svg>';
  };

  // ---- Xuất DXF R12 (nhiều bản vẽ đặt cạnh nhau, có khung tên) ----
  DRW.dxfText = s => String(s).replace(/[^\x20-\x7e]/g, ch => '\\U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
  DRW.dxf = (models, info) => {
    const out = [], g = (c, v) => { out.push(String(c)); out.push(String(v)); };
    const layers = Object.keys(DRW.aci);
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 6); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1); g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0); g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length);
    for (const l of layers) { g(0, 'LAYER'); g(2, 'AER_' + l); g(70, 0); g(62, DRW.aci[l]); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1); g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'arial.ttf'); g(4, ''); g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    let ox = 0;
    models.forEach((m, i) => {
      const bb = m.bbox(), dx = ox - bb[0] + 3, dy = -bb[1] + 6;
      const fw = bb[2] - bb[0] + 6, fh = bb[3] - bb[1] + 12;
      const L = (l) => 'AER_' + l;
      const P = (x, y) => [x + dx, y + dy];
      for (const e of m.e) {
        if (e.t === 'line') { const a = P(e.x1, e.y1), b = P(e.x2, e.y2); g(0, 'LINE'); g(8, L(e.l)); g(10, a[0]); g(20, a[1]); g(30, 0); g(11, b[0]); g(21, b[1]); g(31, 0); }
        else if (e.t === 'poly') { g(0, 'POLYLINE'); g(8, L(e.l)); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, e.c ? 1 : 0);
          for (const p of e.p) { const a = P(p[0], p[1]); g(0, 'VERTEX'); g(8, L(e.l)); g(10, a[0]); g(20, a[1]); g(30, 0); } g(0, 'SEQEND'); g(8, L(e.l)); }
        else if (e.t === 'circle') { const a = P(e.x, e.y); g(0, 'CIRCLE'); g(8, L(e.l)); g(10, a[0]); g(20, a[1]); g(30, 0); g(40, e.r); }
        else if (e.t === 'text') for (const t of DRW.lines(e)) { const a = P(t.x, t.y); g(0, 'TEXT'); g(8, L(e.l)); if (t.en) g(62, 8); g(10, a[0]); g(20, a[1]); g(30, 0); g(40, t.h); g(1, DRW.dxfText(t.s));
          if (e.rot) g(50, e.rot); const ha = e.a === 'c' ? 1 : e.a === 'r' ? 2 : 0; if (ha) { g(72, ha); g(11, a[0]); g(21, a[1]); g(31, 0); } }
      }
      // khung + khung tên
      const fx = ox, fy = 0;
      const box = (x, y, w, h) => { g(0, 'POLYLINE'); g(8, 'AER_TITLE'); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1);
        for (const p of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) { g(0, 'VERTEX'); g(8, 'AER_TITLE'); g(10, p[0]); g(20, p[1]); g(30, 0); } g(0, 'SEQEND'); g(8, 'AER_TITLE'); };
      box(fx, fy, fw, fh);
      const tw = Math.min(fw, 28), th = 5.2;
      box(fx + fw - tw, fy, tw, th);
      const tx = (x, y, s, h, en) => { g(0, 'TEXT'); g(8, 'AER_TITLE'); if (en) g(62, 8); g(10, x); g(20, y); g(30, 0); g(40, h); g(1, DRW.dxfText(s)); };
      const [tv, te] = DRW.split(m.title || ''), [sv, se] = DRW.split(m.sub || ''), x1 = fx + fw - tw + 0.4;
      tx(x1, fy + th - 1.0, tv, 0.6); if (te) tx(x1, fy + th - 1.65, te, 0.4, true);
      tx(x1, fy + th - 2.5, (info.proj || '') + ' – ' + sv, 0.4); if (se) tx(x1, fy + th - 3.05, se, 0.3, true);
      tx(x1, fy + 0.5, `Bản vẽ / Drawing AER-${String(i + 1).padStart(2, '0')}  |  Rev ${info.rev || 'A'}  |  ${info.date || ''}  |  Đơn vị / Units: m`, 0.35);
      ox += fw + 5;
    });
    g(0, 'ENDSEC'); g(0, 'EOF');
    return out.join('\r\n');
  };
})();
if (typeof module !== 'undefined') module.exports = DRW;
