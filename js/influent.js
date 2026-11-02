'use strict';
/* ==========================================================================
   SimXLNT – Đặc tính hóa nước thải đầu vào (phân đoạn COD/N/P) & mẫu động
   ========================================================================== */
const INF = {};

INF.defaults = () => ({
  mode: 'frac', COD: 500, fSI: 0.05, fSB: 0.20, fSA: 0.40, fXI: 0.13, fXH: 0.10, fXA: 0, fXPAO: 0,
  TKN: 50, fNH4: 0.66, fSND: 0.30, TP: 8, fPO4: 0.40, TSS: 320, Alk: 300, pH: 7.2, NO3: 0, DO: 0, metal: 0,
  st: {},
  pat: { type: 'const', aQ: 0.3, pQ: 14, aC: 0.2, pC: 12, csv: '', loop: true }
});

INF.fracFields = [
  ['COD', 'COD tổng', 'mg/L'],
  ['fSI', 'SI / COD (hòa tan trơ)', '-'],
  ['fSB', 'RBCOD / COD (dễ phân hủy)', '-'],
  ['fSA', 'VFA / RBCOD (chỉ ASM2d)', '-', 'ASM2d'],
  ['fXI', 'XI / COD (hạt trơ)', '-'],
  ['fXH', 'XH / COD (sinh khối dị dưỡng)', '-'],
  ['fXA', 'XAUT / COD (tự dưỡng)', '-'],
  ['fXPAO', 'XPAO / COD (chỉ ASM2d)', '-', 'ASM2d'],
  ['TKN', 'TKN', 'mgN/L'],
  ['fNH4', 'NH₄ / TKN', '-'],
  ['fSND', 'N hữu cơ hòa tan / N hữu cơ (chỉ ASM1)', '-', 'ASM1'],
  ['TP', 'TP (chỉ ASM2d)', 'mgP/L', 'ASM2d'],
  ['fPO4', 'PO₄ / TP (chỉ ASM2d)', '-', 'ASM2d'],
  ['TSS', 'TSS', 'mg/L'],
  ['Alk', 'Độ kiềm', 'mgCaCO₃/L'],
  ['pH', 'pH', '-'],
  ['NO3', 'NOx-N', 'mgN/L'],
  ['DO', 'DO', 'mg/L'],
  ['metal', 'Hydroxit kim loại XMeOH (chỉ ASM2d)', 'mg/L', 'ASM2d']
];

/* trả về {x, warn} */
INF.characterize = function (m, pIn, inf) {
  const p = Object.assign({}, m.defaults, pIn);
  const x = new Float64Array(m.n), I = m.idx, warn = [];
  if (inf.mode === 'state' && !(inf.st && inf.st[m.id] && Object.keys(inf.st[m.id]).length)) {
    const r = INF.characterize(m, pIn, Object.assign({}, inf, { mode: 'frac' }));
    r.warn.unshift('Chưa có biến trạng thái nhập trực tiếp cho ' + m.id + ' → dùng chế độ phân đoạn');
    return r;
  }
  const T = p.T_ !== undefined ? p.T_ : 20;
  if (inf.mode === 'state') {
    const st = inf.st[m.id];
    for (const c of m.comps) x[I[c.id]] = +st[c.id] || 0;
    if (!(+st.STIC > 0)) x[I.STIC] = CHEM.ticFromPH(m, x, T, +inf.pH || 7.2);
    return { x, warn };
  }
  const COD = +inf.COD || 0;
  const SI = inf.fSI * COD, RB = inf.fSB * COD, XI = inf.fXI * COD, XH = inf.fXH * COD, XA = inf.fXA * COD;
  const XPAO = m.fam === 'ASM2d' ? (inf.fXPAO || 0) * COD : 0;
  let XS = COD - SI - RB - XI - XH - XA - XPAO;
  if (XS < 0) { warn.push('Tổng các phân đoạn COD > 1 → XS âm, đã đặt XS = 0'); XS = 0; }
  const NH = inf.fNH4 * inf.TKN;
  if (m.fam === 'ASM1') {
    x[I.SI] = SI; x[I.SS] = RB; x[I.XI] = XI; x[I.XS] = XS; x[I.XBH] = XH; x[I.XBA] = XA;
    x[I.SNH] = NH;
    let orgN = inf.TKN - NH - p.iXB * (XH + XA) - p.iXP * XI;
    if (orgN < 0) { warn.push('TKN quá thấp so với N trong sinh khối/XI → N hữu cơ âm, đặt = 0'); orgN = 0; }
    x[I.SND] = inf.fSND * orgN; x[I.XND] = orgN - x[I.SND];
    let iss = inf.TSS - (XI + XS + XH + XA) / p.iCV;
    if (iss < 0) { warn.push('TSS nhập nhỏ hơn VSS tính từ COD hạt (' + ((XI + XS + XH + XA) / p.iCV).toFixed(0) + ' mg/L) → ISS = 0'); iss = 0; }
    x[I.XISS] = iss;
    x[I.SALK] = inf.Alk / 50; x[I.SNO] = inf.NO3; x[I.SO] = inf.DO;
  } else {
    const SA = inf.fSA * RB;
    x[I.SI] = SI; x[I.SA] = SA; x[I.SF] = RB - SA; x[I.XI] = XI; x[I.XS] = XS; x[I.XH] = XH; x[I.XAUT] = XA; x[I.XPAO] = XPAO;
    x[I.SNH4] = NH;
    x[I.SPO4] = inf.fPO4 * inf.TP;
    const bm = XH + XA + XPAO;
    const orgN = p.iNSF * (RB - SA) + p.iNSI * SI + p.iNXI * XI + p.iNXS * XS + p.iNBM * bm;
    const orgP = p.iPSF * (RB - SA) + p.iPSI * SI + p.iPXI * XI + p.iPXS * XS + p.iPBM * bm;
    const tkn = NH + orgN, tp = x[I.SPO4] + orgP;
    if (Math.abs(tkn - inf.TKN) > 0.05 * inf.TKN) warn.push('TKN tính theo hệ số iN = ' + tkn.toFixed(1) + ' khác TKN nhập ' + inf.TKN + ' (chỉnh NH₄/TKN hoặc iN…)');
    if (Math.abs(tp - inf.TP) > 0.05 * inf.TP) warn.push('TP tính theo hệ số iP = ' + tp.toFixed(2) + ' khác TP nhập ' + inf.TP + ' (chỉnh PO₄/TP hoặc iP…)');
    // TSS hữu cơ theo hệ số TSS của chính mô hình (ASM2d: iTSS·; kiểu Sumo: 1/iCV + tro sinh khối)
    const tf = m.tssFactors(p); let tssOrg = 0;
    for (const i of m.partIdx) if (i !== I.XISS) tssOrg += tf[i] * x[i];
    let iss = inf.TSS - tssOrg;
    if (iss < 0) { warn.push('TSS nhập nhỏ hơn TSS hữu cơ tính được → ISS = 0'); iss = 0; }
    x[I.XISS] = iss;
    x[I.XMeOH] = +inf.metal || 0;
    x[I.SALK] = inf.Alk / 50; x[I.SNO3] = inf.NO3; x[I.SO2] = inf.DO;
  }
  x[I.STIC] = CHEM.ticFromPH(m, x, T, +inf.pH || 7.2);
  return { x, warn };
};

INF.parseCSV = function (txt) {
  const lines = String(txt || '').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  if (lines.length < 2) return null;
  const sep = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
  const head = lines[0].split(sep).map(s => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const v = lines[i].split(sep).map(s => parseFloat(s.replace(',', '.')));
    if (v.some(isNaN)) continue;
    rows.push(v);
  }
  if (!rows.length) return null;
  return { head, rows };
};

/* tạo nguồn động: trả về {Qbase, xbase, src(t, out)->Q, warn} */
INF.makeSource = function (m, p, unit) {
  const inf = unit.p.inf, Q0 = +unit.p.Q || 0;
  const base = INF.characterize(m, p, inf);
  const xb = base.x, n = m.n;
  const keep = new Set([m.idx[m.SO], m.idx[m.ALK], m.idx.STIC]);
  const pat = inf.pat || { type: 'const' };
  const res = { Qbase: Q0, xbase: xb, warn: base.warn.slice() };
  if (pat.type === 'diurnal') {
    const aQ = +pat.aQ || 0, aC = +pat.aC || 0, pQ = (+pat.pQ || 0) / 24, pC = (+pat.pC || 0) / 24;
    res.src = (t, out, steady) => {
      if (steady) { out.set(xb); return Q0; }
      const mC = 1 + aC * Math.cos(2 * Math.PI * (t - pC));
      for (let i = 0; i < n; i++) out[i] = keep.has(i) ? xb[i] : xb[i] * mC;
      return Q0 * (1 + aQ * Math.cos(2 * Math.PI * (t - pQ)));
    };
  } else if (pat.type === 'csv') {
    const d = INF.parseCSV(pat.csv);
    if (!d || d.head[0].toLowerCase() !== 't') {
      res.warn.push('Chuỗi số liệu CSV không hợp lệ (cột đầu phải là t [ngày]) → dùng giá trị không đổi');
      res.src = (t, out) => { out.set(xb); return Q0; };
    } else {
      const T = d.rows.map(r => r[0]), Qs = [], Xs = [];
      for (const r of d.rows) {
        const f = JSON.parse(JSON.stringify(inf));
        let Q = Q0;
        const stOver = {};
        d.head.forEach((h, j) => {
          if (j === 0) return;
          const v = r[j];
          if (h === 'Q') Q = v;
          else if (h === 'NH4') f._NH4 = v;
          else if (h === 'PO4') f._PO4 = v;
          else if (m.idx[h] !== undefined) stOver[h] = v;
          else if (h in f) f[h] = v;
        });
        if (f._NH4 !== undefined && f.TKN > 0) f.fNH4 = f._NH4 / f.TKN;
        if (f._PO4 !== undefined && f.TP > 0) f.fPO4 = f._PO4 / f.TP;
        const x = INF.characterize(m, p, f).x;
        for (const k in stOver) x[m.idx[k]] = stOver[k];
        Qs.push(Q); Xs.push(x);
      }
      const t0 = T[0], span = T[T.length - 1] - t0;
      res.csvSpan = span;
      res.src = (t, out, steady) => {
        if (steady) { out.set(xb); return Q0; }
        let tt = t;
        if (pat.loop && span > 0) tt = t0 + ((t - t0) % span + span) % span;
        if (tt <= T[0]) { out.set(Xs[0]); return Qs[0]; }
        if (tt >= T[T.length - 1]) { out.set(Xs[T.length - 1]); return Qs[T.length - 1]; }
        let lo = 0, hi = T.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= tt) lo = mid; else hi = mid; }
        const w = (tt - T[lo]) / (T[hi] - T[lo] || 1);
        const a = Xs[lo], b = Xs[hi];
        for (let i = 0; i < n; i++) out[i] = a[i] + w * (b[i] - a[i]);
        return Qs[lo] + w * (Qs[hi] - Qs[lo]);
      };
    }
  } else {
    res.src = (t, out) => { out.set(xb); return Q0; };
  }
  return res;
};
