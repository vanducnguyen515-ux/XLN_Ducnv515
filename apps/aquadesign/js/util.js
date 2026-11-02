/* AquaDesign VN – tiện ích chung */
'use strict';
const U = {
  clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
  // nội suy tuyến tính trên bảng [[x,y],...]
  interp(tab, x) {
    if (x <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) {
      if (x <= tab[i][0]) {
        const [x0, y0] = tab[i - 1], [x1, y1] = tab[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return tab[tab.length - 1][1];
  },
  // giải f(x)=0 bằng chia đôi trên [a,b]
  bisect(f, a, b, tol = 1e-7, it = 200) {
    let fa = f(a), fb = f(b);
    if (fa * fb > 0) return Math.abs(fa) < Math.abs(fb) ? a : b;
    for (let i = 0; i < it; i++) {
      const m = 0.5 * (a + b), fm = f(m);
      if (Math.abs(b - a) < tol) return m;
      if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return 0.5 * (a + b);
  },
  ceilTo: (x, s) => Math.ceil(x / s - 1e-9) * s,
  roundTo: (x, s) => Math.round(x / s) * s,
  // đường kính ống chuẩn DN gần nhất >= d (mm)
  DN: [25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1400, 1500, 1600, 1800, 2000, 2200, 2400, 2600, 2800, 3000],
  dnUp(dmm) { return this.DN.find(x => x >= dmm - 1e-6) || Math.ceil(dmm / 100) * 100; },
  fmt(v, d) {
    if (v === undefined || v === null || v === '') return '–';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'có' : 'không';
    if (!isFinite(v)) return '–';
    if (d === undefined) {
      const a = Math.abs(v);
      d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
      if (v === 0) d = 0;
    }
    return v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
  },
  esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  get(o, path) { return path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); },
  set(o, path, v) {
    const ks = path.split('.'); let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  },
  clone: o => JSON.parse(JSON.stringify(o)),
  // hợp nhất sâu: điền các khóa thiếu trong dst bằng src
  fill(dst, src) {
    for (const k in src) {
      if (dst[k] === undefined) dst[k] = U.clone(src[k]);
      else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof dst[k] === 'object') U.fill(dst[k], src[k]);
    }
    return dst;
  },
  download(name, data, mime) {
    const b = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
  // tính chất nước/khí
  CsT(T) { // DO bão hòa nước sạch, mg/l, 1013 hPa (DIN EN 12255-15 / M229-1)
    return 2234.34 / Math.pow(T + 45.93, 1.31403);
  },
  patm(hNN) { return 1013.25 * Math.pow(1 - 0.0065 * hNN / 288.15, 5.255); }, // hPa
  psat(T) { return 6.1078 * Math.pow(10, 7.5 * T / (T + 237.3)); }, // hPa
};
