/* =====================================================================
   THƯ VIỆN VẼ: đối tượng nguyên thủy trên tờ giấy (mm) → SVG / DXF R12
   ===================================================================== */
'use strict';

const DRW = (() => {
  const LAYERS = {
    KHUNG: { c: 7, s: '#000000' }, BE: { c: 7, s: '#1a1a1a' }, TEXT: { c: 7, s: '#111111' },
    NUOC: { c: 4, s: '#0096c7' }, BUN: { c: 30, s: '#e07b00' }, KHI: { c: 5, s: '#2856d6' },
    HOACHAT: { c: 6, s: '#c21fc2' }, DIM: { c: 3, s: '#2a8a2a' }, MUCNUOC: { c: 5, s: '#1f5fbf' },
    TEXT_EN: { c: 8, s: '#8c8c8c' }, TRUC: { c: 1, s: '#d00000' }, THIETBI: { c: 6, s: '#a0149e' }, HATCH: { c: 8, s: '#9a9a9a' },
    DUONG: { c: 2, s: '#b39b00' }, VIEN: { c: 8, s: '#666666' }, DIEUKHIEN: { c: 1, s: '#b91c1c' },
  };

  class Sheet {
    constructor(W, H) { this.W = W; this.H = H; this.items = []; }
    add(o) { this.items.push(o); return o; }
    line(x1, y1, x2, y2, st) { return this.add({ t: 'l', x1, y1, x2, y2, st: st || {} }); }
    pl(pts, closed, st) { return this.add({ t: 'p', pts, closed: !!closed, st: st || {} }); }
    rect(x, y, w, h, st) { return this.pl([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, st); }
    circle(cx, cy, r, st) { return this.add({ t: 'c', cx, cy, r, st: st || {} }); }
    arc(cx, cy, r, a1, a2, st) { return this.add({ t: 'a', cx, cy, r, a1, a2, st: st || {} }); } // độ, ngược chiều kim (hệ y xuống: theo chiều kim đồng hồ trên màn hình)
    /* chữ; nếu có tiếng Việt thì thêm dòng tiếng Anh nhỏ (0,72h), xám, ngay bên dưới (o.en = bản dịch cho sẵn, o.noEn = không thêm) */
    text(x, y, s, o) {
      o = o || {}; s = String(s);
      const h = o.h || 2.5, an = o.an || 'start', vb = o.vb || 'base', rot = o.rot || 0;
      const e = o.noEn ? '' : (o.en !== undefined ? o.en : (typeof BI !== 'undefined' ? BI.en(s) : ''));
      if (!e) return this.add({ t: 't', x, y, s, h, an, vb, rot, bold: !!o.bold, st: { layer: o.layer || 'TEXT', color: o.color } });
      const he = h * 0.72, a = rot * Math.PI / 180, dx = -Math.sin(a), dy = Math.cos(a);   // hướng "xuống dưới" của dòng chữ
      const up = vb === 'middle' ? 0.5 * he + 0.2 : 0, dn = vb === 'middle' ? 0.5 * h + 0.3 : he + 0.45;
      const it = this.add({ t: 't', x: x - dx * up, y: y - dy * up, s, h, an, vb, rot, bold: !!o.bold, st: { layer: o.layer || 'TEXT', color: o.color } });
      this.add({ t: 't', x: x + dx * dn, y: y + dy * dn, s: e, h: he, an, vb, rot, bold: false, en: true, st: { layer: 'TEXT_EN', color: '#8c8c8c' } });
      return it;
    }
    fill(x, y, w, h, color, layer) { return this.add({ t: 'f', x, y, w, h, color, st: { layer: layer || 'HATCH' } }); }
    arrow(x1, y1, x2, y2, st, size) {
      this.line(x1, y1, x2, y2, st);
      const a = Math.atan2(y2 - y1, x2 - x1), s = size || 3;
      this.pl([[x2, y2], [x2 - s * Math.cos(a - 0.35), y2 - s * Math.sin(a - 0.35)], [x2 - s * Math.cos(a + 0.35), y2 - s * Math.sin(a + 0.35)]], true, Object.assign({}, st, { fillC: true }));
    }
    polyArrow(pts, st, size) {
      for (let i = 0; i < pts.length - 2; i++) this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], st);
      const n = pts.length; this.arrow(pts[n - 2][0], pts[n - 2][1], pts[n - 1][0], pts[n - 1][1], st, size);
    }
    /* bảng: cột rộng cw[], hàng rows[][]; trả về chiều cao */
    table(x, y, cw, rows, o) {
      o = o || {}; const rh = o.rh || 6, h = o.h || 2.2, hdr = o.header !== false;
      const W = cw.reduce((a, b) => a + b, 0);
      for (let r = 0; r < rows.length; r++) {
        const yy = y + r * rh;
        if (r === 0 && hdr) this.fill(x, yy, W, rh, '#eef3f8');
        let xx = x;
        for (let cI = 0; cI < cw.length; cI++) {
          const v = rows[r][cI]; const al = (o.align && o.align[cI]) || 'start';
          if (v !== undefined && v !== null && v !== '') {
            const tx = al === 'middle' ? xx + cw[cI] / 2 : al === 'end' ? xx + cw[cI] - 1 : xx + 1;
            const ev = typeof BI !== 'undefined' ? BI.en(String(v)) : '';
            this.text(tx, yy + rh / 2, fitStr(String(v), cw[cI], h), { h, an: al, vb: 'middle', bold: r === 0 && hdr, en: ev ? fitStr(ev, cw[cI], h * 0.72) : '' });
          }
          xx += cw[cI];
        }
      }
      const H = rows.length * rh, st = { layer: 'VIEN', w: 0.18 };
      this.rect(x, y, W, H, { layer: 'KHUNG', w: 0.35 });
      for (let r = 1; r < rows.length; r++) this.line(x, y + r * rh, x + W, y + r * rh, st);
      let xx = x; for (let cI = 0; cI < cw.length - 1; cI++) { xx += cw[cI]; this.line(xx, y, xx, y + H, st); }
      return H;
    }
    /* đoạn văn nhiều dòng tự xuống dòng */
    para(x, y, text, width, o) {
      o = o || {}; const h = o.h || 2.3, lh = h * 1.55;
      const lines = wrap(text, width, h);
      lines.forEach((ln, i) => this.text(x, y + i * lh, ln, { h, bold: o.bold, layer: o.layer, noEn: true }));
      const e = typeof BI !== 'undefined' ? BI.en(text) : '';
      if (!e) return lines.length * lh;
      const he = h * 0.72, lhe = he * 1.5, le = wrap(e, width, he);
      le.forEach((ln, i) => this.add({ t: 't', x, y: y + lines.length * lh + i * lhe - 0.3, s: ln, h: he, an: 'start', vb: 'base', rot: 0, bold: false, en: true, st: { layer: 'TEXT_EN', color: '#8c8c8c' } }));
      return lines.length * lh + le.length * lhe;
    }
  }
  const fitStr = (s, w, h) => { const max = Math.floor(w / (h * 0.52)); return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s; };
  function wrap(text, width, h) {
    const max = Math.max(4, Math.floor(width / (h * 0.5)));
    const out = [];
    for (const para of String(text).split('\n')) {
      let cur = '';
      for (const w of para.split(' ')) {
        if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
      }
      out.push(cur);
    }
    return out;
  }

  /* Khung nhìn mô hình (m) → giấy (mm), trục y mô hình hướng lên */
  class View {
    constructor(sh, px, py, scale, ox, oy) { Object.assign(this, { sh, px, py, scale, ox: ox || 0, oy: oy || 0 }); this.k = 1000 / scale; }
    X(x) { return this.px + (x - this.ox) * this.k; }
    Y(y) { return this.py - (y - this.oy) * this.k; }
    line(x1, y1, x2, y2, st) { return this.sh.line(this.X(x1), this.Y(y1), this.X(x2), this.Y(y2), st); }
    rect(x, y, w, h, st) { return this.sh.pl([[this.X(x), this.Y(y)], [this.X(x + w), this.Y(y)], [this.X(x + w), this.Y(y + h)], [this.X(x), this.Y(y + h)]], true, st); }
    pl(pts, closed, st) { return this.sh.pl(pts.map(p => [this.X(p[0]), this.Y(p[1])]), closed, st); }
    circle(cx, cy, r, st) { return this.sh.circle(this.X(cx), this.Y(cy), r * this.k, st); }
    arc(cx, cy, r, a1, a2, st) { return this.sh.arc(this.X(cx), this.Y(cy), r * this.k, -a2, -a1, st); }
    text(x, y, s, o) { return this.sh.text(this.X(x), this.Y(y), s, o); }
    fill(x, y, w, h, color, layer) { return this.sh.fill(this.X(x), this.Y(y + h), w * this.k, h * this.k, color, layer); }
    arrow(x1, y1, x2, y2, st, size) { return this.sh.arrow(this.X(x1), this.Y(y1), this.X(x2), this.Y(y2), st, size); }
    /* đường kích thước ngang tại cao độ y, lệch off (mm giấy, âm = phía dưới) */
    dimH(x1, x2, y, off, label) {
      const X1 = this.X(x1), X2 = this.X(x2), Y0 = this.Y(y), Y = Y0 - off, st = { layer: 'DIM', w: 0.18 };
      this.sh.line(X1, Y0 - Math.sign(off) * 1, X1, Y - Math.sign(off) * 1.5, st); this.sh.line(X2, Y0 - Math.sign(off) * 1, X2, Y - Math.sign(off) * 1.5, st);
      this.sh.line(X1 - 1.5, Y, X2 + 1.5, Y, st);
      this.sh.line(X1 - 0.9, Y + 0.9, X1 + 0.9, Y - 0.9, { layer: 'DIM', w: 0.35 }); this.sh.line(X2 - 0.9, Y + 0.9, X2 + 0.9, Y - 0.9, { layer: 'DIM', w: 0.35 });
      this.sh.text((X1 + X2) / 2, Y - 0.8, label !== undefined ? label : mm(x2 - x1), { h: 2.2, an: 'middle', layer: 'DIM' });
    }
    dimV(y1, y2, x, off, label) {
      const Y1 = this.Y(y1), Y2 = this.Y(y2), X0 = this.X(x), X = X0 + off, st = { layer: 'DIM', w: 0.18 };
      this.sh.line(X0 + Math.sign(off) * 1, Y1, X + Math.sign(off) * 1.5, Y1, st); this.sh.line(X0 + Math.sign(off) * 1, Y2, X + Math.sign(off) * 1.5, Y2, st);
      this.sh.line(X, Y1 + 1.5, X, Y2 - 1.5, st);
      this.sh.line(X - 0.9, Y1 + 0.9, X + 0.9, Y1 - 0.9, { layer: 'DIM', w: 0.35 }); this.sh.line(X - 0.9, Y2 + 0.9, X + 0.9, Y2 - 0.9, { layer: 'DIM', w: 0.35 });
      this.sh.text(X - 0.8, (Y1 + Y2) / 2, label !== undefined ? label : mm(Math.abs(y2 - y1)), { h: 2.2, an: 'middle', rot: -90, layer: 'DIM' });
    }
    /* ký hiệu cao độ mực nước ▽ */
    level(x, y, label, layer) {
      const X = this.X(x), Y = this.Y(y), st = { layer: layer || 'MUCNUOC', w: 0.25 };
      this.sh.pl([[X, Y], [X - 1.6, Y - 2.4], [X + 1.6, Y - 2.4]], true, st);
      this.sh.line(X - 3, Y, X + 18, Y, st);
      this.sh.text(X + 2.5, Y - 1, label, { h: 2.2, layer: layer || 'MUCNUOC' });
    }
  }
  const mm = m => String(Math.round(m * 1000));

  /* ---------------- SVG ---------------- */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function toSVG(sh, opt) {
    opt = opt || {};
    const o = [];
    o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sh.W} ${sh.H}" ${opt.px ? `width="${opt.px}"` : `width="${sh.W}mm" height="${sh.H}mm"`} font-family="Arial, Helvetica, sans-serif" style="background:#fff">`);
    o.push(`<rect x="0" y="0" width="${sh.W}" height="${sh.H}" fill="#fff"/>`);
    for (const it of sh.items) {
      const L = LAYERS[it.st.layer || 'BE'] || LAYERS.BE;
      const col = it.st.color || L.s, w = it.st.w || 0.25;
      const dash = it.st.dash ? ` stroke-dasharray="${it.st.dash === true ? '4 2' : it.st.dash}"` : '';
      if (it.t === 'l') o.push(`<line x1="${r(it.x1)}" y1="${r(it.y1)}" x2="${r(it.x2)}" y2="${r(it.y2)}" stroke="${col}" stroke-width="${w}"${dash} stroke-linecap="round"/>`);
      else if (it.t === 'p') {
        const d = it.pts.map(p => r(p[0]) + ',' + r(p[1])).join(' ');
        const fill = it.st.fillC ? col : (it.st.fill || 'none');
        o.push(`<${it.closed ? 'polygon' : 'polyline'} points="${d}" fill="${fill}" stroke="${col}" stroke-width="${w}"${dash} stroke-linejoin="round"/>`);
      } else if (it.t === 'c') o.push(`<circle cx="${r(it.cx)}" cy="${r(it.cy)}" r="${r(it.r)}" fill="${it.st.fill || 'none'}" stroke="${col}" stroke-width="${w}"${dash}/>`);
      else if (it.t === 'a') {
        const a1 = it.a1 * Math.PI / 180, a2 = it.a2 * Math.PI / 180;
        const x1 = it.cx + it.r * Math.cos(a1), y1 = it.cy + it.r * Math.sin(a1), x2 = it.cx + it.r * Math.cos(a2), y2 = it.cy + it.r * Math.sin(a2);
        let da = (it.a2 - it.a1) % 360; if (da < 0) da += 360;
        o.push(`<path d="M${r(x1)},${r(y1)} A${r(it.r)},${r(it.r)} 0 ${da > 180 ? 1 : 0} 1 ${r(x2)},${r(y2)}" fill="none" stroke="${col}" stroke-width="${w}"${dash}/>`);
      } else if (it.t === 'f') o.push(`<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" fill="${it.color}" stroke="none"/>`);
      else if (it.t === 't') {
        const db = it.vb === 'middle' ? ' dominant-baseline="central"' : it.vb === 'top' ? ' dominant-baseline="hanging"' : '';
        const tr = it.rot ? ` transform="rotate(${it.rot} ${r(it.x)} ${r(it.y)})"` : '';
        o.push(`<text x="${r(it.x)}" y="${r(it.y)}" font-size="${it.h * 1.35}" text-anchor="${it.an}"${db}${tr} fill="${col}"${it.bold ? ' font-weight="bold"' : ''}${it.en ? ' fill-opacity="0.85"' : ''}>${esc(it.s)}</text>`);
      }
    }
    o.push('</svg>');
    return o.join('\n');
  }
  const r = v => Math.round(v * 100) / 100;

  /* ---------------- DXF R12 ---------------- */
  function dxfStr(s) {
    let o = '';
    for (const ch of String(s)) { const c = ch.codePointAt(0); o += c < 128 ? ch : '\\U+' + c.toString(16).toUpperCase().padStart(4, '0'); }
    return o;
  }
  function toDXF(sheets) {
    const o = [];
    const g = (code, v) => { o.push(String(code)); o.push(String(v)); };
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1258');
    let W = 0, H = 0; sheets.forEach(s => { W += s.sh.W + 50; H = Math.max(H, s.sh.H); });
    g(9, '$EXTMIN'); g(10, 0); g(20, 0); g(30, 0); g(9, '$EXTMAX'); g(10, W); g(20, H); g(30, 0); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
    g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, '__ __ __'); g(72, 65); g(73, 2); g(40, 6); g(49, 4); g(49, -2);
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, Object.keys(LAYERS).length);
    for (const [n, L] of Object.entries(LAYERS)) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, L.c); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'VN_ARIAL'); g(70, 0); g(40, 0); g(41, 0.9); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'arial.ttf'); g(4, '');
    g(0, 'ENDTAB'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    let ox = 0;
    for (const s of sheets) {
      const sh = s.sh, Hh = sh.H;
      const X = x => (ox + x).toFixed(3), Y = y => (Hh - y).toFixed(3);
      for (const it of sh.items) {
        const lay = it.st.layer || 'BE';
        const lt = () => { if (it.st.dash) g(6, 'DASHED'); };
        if (it.t === 'l') { g(0, 'LINE'); g(8, lay); lt(); g(10, X(it.x1)); g(20, Y(it.y1)); g(30, 0); g(11, X(it.x2)); g(21, Y(it.y2)); g(31, 0); }
        else if (it.t === 'p') {
          g(0, 'POLYLINE'); g(8, lay); lt(); g(66, 1); g(70, it.closed ? 1 : 0); g(10, 0); g(20, 0); g(30, 0);
          for (const p of it.pts) { g(0, 'VERTEX'); g(8, lay); g(10, X(p[0])); g(20, Y(p[1])); g(30, 0); }
          g(0, 'SEQEND'); g(8, lay);
          if (it.st.fillC && it.pts.length === 3) { g(0, 'SOLID'); g(8, lay); const q = it.pts; [[10, 20, q[0]], [11, 21, q[1]], [12, 22, q[2]], [13, 23, q[2]]].forEach(([a, b, p]) => { g(a, X(p[0])); g(b, Y(p[1])); }); }
        } else if (it.t === 'c') { g(0, 'CIRCLE'); g(8, lay); lt(); g(10, X(it.cx)); g(20, Y(it.cy)); g(30, 0); g(40, it.r.toFixed(3)); }
        else if (it.t === 'a') { g(0, 'ARC'); g(8, lay); lt(); g(10, X(it.cx)); g(20, Y(it.cy)); g(30, 0); g(40, it.r.toFixed(3)); g(50, (-it.a2).toFixed(3)); g(51, (-it.a1).toFixed(3)); }
        else if (it.t === 't') {
          const ha = it.an === 'middle' ? 1 : it.an === 'end' ? 2 : 0, va = it.vb === 'middle' ? 2 : it.vb === 'top' ? 3 : 0;
          g(0, 'TEXT'); g(8, lay); g(10, X(it.x)); g(20, Y(it.y)); g(30, 0); g(40, it.h.toFixed(2)); g(1, dxfStr(it.s)); g(7, 'VN_ARIAL');
          if (it.rot) g(50, (-it.rot).toFixed(2));
          if (ha || va) { g(72, ha); g(11, X(it.x)); g(21, Y(it.y)); g(31, 0); g(73, va); }
        }
      }
      ox += sh.W + 50;
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return o.join('\r\n');
  }

  return { Sheet, View, toSVG, toDXF, LAYERS, wrap, mm };
})();
