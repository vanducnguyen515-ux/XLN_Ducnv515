'use strict';
/* ==========================================================================
   SimNước – Thư viện đơn vị xử lý nước cấp / tái sử dụng / nước siêu sạch
   Mỗi đơn vị: label, group, ins, outs, fields, def(), calc(u, inp, ctx)
   calc trả về { o: {cổng: WQ}, info: {...} }.
   ctx = { mode: 'steady'|'dyn', t (h), dt (h), st: trạng thái đơn vị (đọc), ns: trạng thái mới (ghi), warn(msg) }
   ========================================================================== */
const W_PART = ['SSi', 'FeOH3', 'AlOH3', 'CaCO3s', 'MgOH2', 'MnO2', 'PACs', 'Pads', 'POC', 'CaF2c', 'CaF2s'];
const W_MIC = ['Ecoli', 'Giardia', 'Crypto', 'Virus'];
const W_IONS_CAT = ['Ca', 'Mg', 'Na', 'K', 'NH4', 'Fe2', 'Mn', 'Ba', 'Sr'];
const W_IONS_AN = ['Cl', 'SO4', 'NO3', 'NO2', 'F', 'Br'];

/* tách dòng: phần hạt theo hiệu suất E sang B (Ek: hiệu suất riêng từng thành phần); chất tan theo lưu lượng; vi sinh theo LRV ở A */
function wSplit(w, QB, E0, lrv = {}, Ek = {}) {
  QB = Math.min(Math.max(QB, 0), w.Q);
  const QA = w.Q - QB;
  const A = WQ.copy(w), B = WQ.copy(w);
  A.Q = QA; B.Q = QB;
  for (const k of W_PART) {
    const m = (w[k] || 0) * w.Q, E = Ek[k] !== undefined ? Ek[k] : E0;
    if (QB > 1e-9 && QA > 1e-9) { A[k] = (1 - E) * m / QA; B[k] = E * m / QB; }
    else if (QB <= 1e-9) { A[k] = (w[k] || 0) * (1 - E); B[k] = 0; }
    else { B[k] = w[k] || 0; A[k] = 0; }
  }
  for (const k of W_MIC) {
    const L = lrv[k] || 0;
    A[k] = Math.max(w[k] - L, -9);
    if (QB > 1e-9) { const tot = Math.pow(10, w[k]) * w.Q, a = Math.pow(10, A[k]) * QA; B[k] = Math.log10(Math.max((tot - a) / QB, 1e-9)); }
  }
  return [A, B];
}
/* mức keo tụ hiệu dụng: kết tủa oxit/hydroxit/tinh thể tự tạo bông dễ tách */
const condEff = w => { const t = WQ.tss(w); const f = t > 0 ? (w.FeOH3 + w.MnO2 + w.AlOH3 + w.CaCO3s + w.MgOH2 + (w.CaF2s || 0)) / t : 0; return Math.min(Math.max(Math.max(w.cond || 0, 0.9 * f), 0), 1); };
const lrvFromE = (E, f = 1, cap = 4) => Math.min(cap, -f * Math.log10(Math.max(1 - E, 1e-6)));
const viscosity = T => 2.414e-5 * Math.pow(10, 247.8 / (T + 133.15));   // Pa·s
const o2sat = T => 14.62 - 0.3898 * T + 0.006969 * T * T - 5.897e-5 * T * T * T;

/* ---------------------------------------------------------------- hóa chất */
const WCHEM = {
  HCl: { n: 'Axit HCl', M: 36.46, acid: 1, add: (w, x) => { w.Cl += x * 35.453; } },
  H2SO4: { n: 'Axit H₂SO₄', M: 98.08, acid: 1, add: (w, x) => { w.SO4 += x * 96.06; } },
  CO2: { n: 'Khí CO₂', M: 44.01, acid: 1, add: (w, x) => { w.TIC += x; } },
  NaOH: { n: 'Xút NaOH', M: 40.0, base: 1, add: (w, x) => { w.Na += x * 22.99; } },
  lime: { n: 'Vôi Ca(OH)₂', M: 74.09, base: 1, add: (w, x) => { w.Ca += x * 40.078; } },
  soda: { n: 'Soda Na₂CO₃', M: 105.99, base: 1, add: (w, x) => { w.Na += 2 * x * 22.99; w.TIC += x; } },
  NaHCO3: { n: 'NaHCO₃', M: 84.01, base: 1, add: (w, x) => { w.Na += x * 22.99; w.TIC += x; } },
  HNO3: { n: 'Axit HNO₃', M: 63.01, acid: 1, add: (w, x) => { w.NO3 += x * 14.007; } },
  MgOH2: { n: 'Magie hydroxit Mg(OH)₂', M: 58.32, base: 1, add: (w, x) => { w.Mg += x * 24.305; } },
  NH4HCO3: { n: 'Amoni bicacbonat NH₄HCO₃', M: 79.06, add: (w, x) => { w.NH4 += x * 14.007; w.TIC += x; } },
  CaCl2: { n: 'CaCl₂', M: 110.98, add: (w, x) => { w.Ca += x * 40.078; w.Cl += 2 * x * 35.453; } },
  MgCl2: { n: 'MgCl₂', M: 95.21, add: (w, x) => { w.Mg += x * 24.305; w.Cl += 2 * x * 35.453; } },
  KNO3: { n: 'Kali nitrat KNO₃', M: 101.1, add: (w, x) => { w.K += x * 39.098; w.NO3 += x * 14.007; } },
  KNO2: { n: 'Kali nitrit KNO₂', M: 85.1, add: (w, x) => { w.K += x * 39.098; w.NO2 += x * 14.007; } },
  AlCl3: { n: 'Nhôm clorua AlCl₃', M: 133.34, coag: 'Al', add: (w, x) => { w.Al += x * 26.98; w.Cl += 3 * x * 35.453; } },
  FeCl2: { n: 'Sắt(II) clorua FeCl₂', M: 126.75, add: (w, x) => { w.Fe2 += x * 55.845; w.Cl += 2 * x * 35.453; } },
  FeSO4: { n: 'Sắt(II) sunfat FeSO₄', M: 151.91, add: (w, x) => { w.Fe2 += x * 55.845; w.SO4 += x * 96.06; } },
  FeCl3: { n: 'Phèn sắt FeCl₃', M: 162.2, coag: 'Fe', add: (w, x) => { w.Fe3 += x * 55.845; w.Cl += 3 * x * 35.453; } },
  Fe2SO43: { n: 'Phèn sắt Fe₂(SO₄)₃', M: 399.9, coag: 'Fe', add: (w, x) => { w.Fe3 += 2 * x * 55.845; w.SO4 += 3 * x * 96.06; } },
  alum: { n: 'Phèn nhôm Al₂(SO₄)₃·14H₂O', M: 594.4, coag: 'Al', add: (w, x) => { w.Al += 2 * x * 26.98; w.SO4 += 3 * x * 96.06; } },
  PACl: { n: 'PAC (PACl, liều theo mg Al)', M: 26.98, coag: 'Al', add: (w, x, u) => { const b = (+u.p.basic || 70) / 100; w.Al += x * 26.98; w.Cl += 3 * (1 - b) * x * 35.453; } },
  NaOCl: { n: 'Javen NaOCl (mgCl₂)', M: 70.9, ox: 1, add: (w, x) => { w.Na += x * 22.99; w.Cl2f += x * 70.9; } },
  Cl2: { n: 'Clo khí Cl₂', M: 70.9, ox: 1, add: (w, x) => { w.Cl2f += x * 70.9; w.Cl += x * 35.453; } },
  NH4Cl: { n: 'NH₄Cl (mgN)', M: 14.007, nh: 1, add: (w, x) => { w.NH4 += x * 14.007; w.Cl += x * 35.453; } },
  NH42SO4: { n: '(NH₄)₂SO₄ (mgN)', M: 14.007, nh: 1, add: (w, x) => { w.NH4 += x * 14.007; w.SO4 += 0.5 * x * 96.06; } },
  NH3: { n: 'Amoniac NH₃ (mgN)', M: 14.007, nh: 1, add: (w, x) => { w.NH4 += x * 14.007; } },
  KMnO4: { n: 'KMnO₄', M: 158.03, add: (w, x) => {
    w.K += x * 39.098;
    let ox = x;                                            // mmol MnO4⁻
    const fe = Math.min(w.Fe2 / 55.845, 3 * ox); w.Fe2 -= fe * 55.845; w.FeOH3 += fe * 106.87; ox -= fe / 3;
    const mn = Math.min(w.Mn / 54.938, 1.5 * ox); w.Mn -= mn * 54.938; ox -= mn / 1.5;
    w.MnO2 += (x + mn) * 86.94;                              // MnO4⁻ còn dư coi như bị NOM khử thành MnO2
    w.ClD = Math.max(w.ClD - ox * 70.9 * 1.5, 0);
  } },
  NaHSO3: { n: 'Natri bisulfit NaHSO₃', M: 104.06, add: (w, x) => {
    w.Na += x * 22.99; w.SO4 += x * 96.06;
    let r = x;                                             // mmol chất khử (2e⁻ mỗi mol)
    const take = (k, mgPerMmol, onUse) => { const a = Math.min(w[k] / mgPerMmol, r); w[k] -= a * mgPerMmol; r -= a; if (onUse) onUse(a); };
    take('Cl2f', 70.9, a => { w.Cl += a * 35.453; });
    take('NH2Cl', 70.9, a => { w.Cl += a * 35.453; w.NH4 += a * 14.007; });
    take('NHCl2', 70.9, a => { w.Cl += a * 35.453; w.NH4 += 0.5 * a * 14.007; });
    take('NCl3', 70.9, a => { w.Cl += a * 35.453; w.NH4 += a / 3 * 14.007; });
    take('O3', 48, null); take('H2O2', 34.01, null);
    w.O2 = Math.max(w.O2 - 0.5 * r * 32, 0);                // dư → bị O2 oxy hóa
  } },
  H2O2: { n: 'Hydro peroxit H₂O₂', M: 34.01, add: (w, x) => { w.H2O2 += x * 34.01; } },
  NaF: { n: 'NaF (flo hóa)', M: 41.99, add: (w, x) => { w.Na += x * 22.99; w.F += x * 18.998; } },
  H3PO4: { n: 'Ortho-phosphat ức chế ăn mòn (mgP)', M: 30.974, add: (w, x) => { w.PO4 += x * 30.974; } },
  AS: { n: 'Chất chống cáu cặn', M: 1, add: (w, x) => { w.AS += x; } },
  poly: { n: 'Polymer trợ keo tụ', M: 1, add: (w, x) => { w.Poly += x; } },
  PAC: { n: 'Than hoạt tính bột (PAC)', M: 1, add: (w, x) => {
    w.PACs += x;
    const fD = 1 - 1 / (1 + 0.006 * x), fM = 1 - 1 / (1 + 0.08 * x), fS = 1 - 1 / (1 + 0.03 * x), fA = 1 - 1 / (1 + 0.01 * x);
    const dD = fD * w.DOC; w.DOC -= dD; w.POC += dD; w.UV254 *= Math.max(1 - 1.3 * fD, 0.2); w.BDOC = Math.min(w.BDOC, w.DOC);
    w.MP *= 1 - fM; w.PFOS *= 1 - fS; w.PFOA *= 1 - fA;
  } }
};

/* ---------------------------------------------------------------- tiêu chuẩn so sánh (người dùng kiểm tra lại với văn bản gốc) */
const WSTD = {
  qcvn01: { n: 'QCVN 01-1:2018/BYT (nước sạch sinh hoạt – tham khảo)', lim: { pH: [6, 8.5], turb: 2, TDS: 1000, hard: 300, Cl: 250, SO4: 250, NH4: 0.3, NO3: 2, NO2: 0.05, Fe: 0.3, Mn: 0.1, Al: 0.2, F: 1.5, Cl2f: [0.2, 1.0], THM: 300, BrO3: 10, Ecoli: 0 } },
  who: { n: 'WHO GDWQ (tham khảo)', lim: { pH: [6.5, 8.5], turb: 1, TDS: 600, Cl: 250, SO4: 250, NO3: 11.3, NO2: 0.9, Mn: 0.08, Al: 0.2, F: 1.5, Cl2f: [0.2, 5], THM: 300, BrO3: 10, Ecoli: 0 } },
  reuse: { n: 'Tái sử dụng gián tiếp cho cấp nước (tham khảo, kiểu Title 22)', lim: { turb: 0.2, TOC: 0.5, NO3: 10, TN: 10, Crypto: -9, Virus: -9, BrO3: 10, MP: 100, PFOA: 4, PFOS: 4 } },
  boiler: { n: 'Nước cấp lò hơi áp lực trung bình (tham khảo)', lim: { EC: 1, SiO2: 0.02, hard: 0.1, Fe: 0.02, TOC: 0.2 } },
  pure: { n: 'Nước siêu sạch kiểu ASTM D1193 loại I (tham khảo)', lim: { EC: 0.0555, SiO2: 0.003, TOC: 0.05, Na: 0.001, Cl: 0.001 } },
  q40_25A: { n: 'QCVN 40:2025/BTNMT cột A – nước thải công nghiệp (F ≤ 2.000 m³/ngđ)', lim: { pH: [6, 9], TSS: 40, F: 3, NH4: 5, Fe: 2, Mn: 2 } },
  q40_25B: { n: 'QCVN 40:2025/BTNMT cột B – nước thải công nghiệp (F ≤ 2.000 m³/ngđ)', lim: { pH: [6, 9], TSS: 80, F: 15, NH4: 10, Fe: 10, Mn: 10 } },
  q40_25C: { n: 'QCVN 40:2025/BTNMT cột C – nước thải công nghiệp (F ≤ 2.000 m³/ngđ)', lim: { pH: [6, 9], TSS: 120, F: 15, NH4: 12, Fe: 10, Mn: 10 } },
  qcvn40A: { n: 'QCVN 40:2011/BTNMT cột A – nước thải công nghiệp (hết hiệu lực 01/9/2025)', lim: { pH: [6, 9], TSS: 50, F: 5, NH4: 5, Fe: 1, Mn: 0.5 } },
  qcvn40B: { n: 'QCVN 40:2011/BTNMT cột B – nước thải công nghiệp (hết hiệu lực 01/9/2025)', lim: { pH: [5.5, 9], TSS: 100, F: 10, NH4: 10, Fe: 5, Mn: 1 } },
  none: { n: 'Không so sánh', lim: {} }
};

const WRES_LBL = { out: 'ra', perm: 'thấm', conc: 'đặc', waste: 'thải', sludge: 'bùn', bw: 'rửa lọc', regen: 'tái sinh', a: 'A', b: 'B', c: 'C', dist: 'ngưng', cake: 'bánh', filt: 'nước tách' };

/* ---------------------------------------------------------------- thư viện đơn vị */
const WU = {};

/* ===== Nguồn nước ===== */
WU.source = {
  label: 'Nguồn nước', group: 'Nguồn & đích', ins: [], outs: ['out'],
  fields: [
    { k: 'Q', l: 'Lưu lượng', u: 'm³/d' },
    { k: 'Qamp', l: 'Biên độ dao động lưu lượng', u: '%', adv: true }, { k: 'Tamp', l: 'Biên độ dao động nhiệt độ', u: '°C', adv: true },
    { k: 'bal', l: 'Cân bằng điện tích bằng', t: 'sel', opts: [['Na', 'Na⁺ (khi thiếu cation)'], ['Cl', 'Cl⁻ (khi thiếu anion)'], ['auto', 'Tự chọn Na⁺/Cl⁻'], ['none', 'Không cân bằng']] }
  ],
  def: () => ({ Q: 10000, Qamp: 0, Tamp: 0, bal: 'auto', wq: W_PRESETS.river.wq() }),
  calc(u, inp, ctx) {
    const r = wCharacterize(u.p);
    const w = WQ.copy(r.w);
    let Q = +u.p.Q;
    if (ctx.mode === 'dyn') {
      const ph = 2 * Math.PI * (ctx.t % 24) / 24;
      Q *= 1 + (+u.p.Qamp || 0) / 100 * Math.sin(ph - Math.PI / 2);
      w.T += (+u.p.Tamp || 0) * Math.sin(ph - Math.PI / 2);
    }
    w.Q = Q;
    return { o: { out: w }, info: { Q, err: r.err, pH: r.pH, balIon: r.ion, balDelta: r.delta } };
  }
};
/* phân tích đầu vào → dòng WQ: TIC từ pH & độ kiềm, cân bằng điện tích */
const _charCache = new Map();
function wCharacterize(p) {
  const key = JSON.stringify([p.wq, p.bal]);
  if (_charCache.has(key)) return _charCache.get(key);
  const a = p.wq, w = WQ.make();
  for (const k of WQ.KEYS) if (a[k] !== undefined && k !== 'TIC') w[k] = +a[k];
  w.T = +a.T; w.Q = 1;
  w.SSi = Math.max(2 * (+a.turb || 0) - 0.8 * w.POC, 0);
  w.TIC = WQ.ticFromAlk(+a.alk, +a.pH, w.T);
  if (!(a.ClD >= 0)) w.ClD = 0.35 * w.DOC;
  const ib = WQ.ionBalance(w, +a.pH);
  let ion = p.bal, res = { w, delta: 0 };
  if (ion === 'auto') ion = ib.cat < ib.an ? 'Na' : 'Cl';
  if (ion === 'Na' || ion === 'Cl') res = WQ.balanceTo(w, +a.pH, ion);
  WQ.precipMetals(res.w);
  const out = { w: res.w, err: ib.err, ion, delta: res.delta, pH: WQ.solve(res.w).pH };
  if (_charCache.size > 200) _charCache.clear();
  _charCache.set(key, out);
  return out;
}
/* mẫu nước nguồn */
const W_PRESETS = {
  river: { n: 'Nước sông (độ đục, NOM trung bình)', wq: () => ({ T: 26, pH: 7.3, alk: 70, turb: 40, Ca: 22, Mg: 5, Na: 9, K: 2.5, NH4: 0.2, Fe2: 0, Mn: 0.08, Ba: 0.03, Sr: 0.1, Cl: 12, SO4: 15, NO3: 0.8, NO2: 0.01, F: 0.2, Br: 0.05, PO4: 0.05, SiO2: 12, B: 0.02, Fe3: 0.6, Al: 0.1, DOC: 3.5, BDOC: 0.8, POC: 1.0, UV254: 0.12, O2: 7, Ecoli: 3, Giardia: 1, Crypto: 0.5, Virus: 1, MP: 200, PFOA: 5, PFOS: 3 }) },
  ground: { n: 'Nước ngầm nhiều sắt, mangan, amoni', wq: () => ({ T: 27, pH: 6.6, alk: 120, turb: 2, Ca: 45, Mg: 12, Na: 18, K: 3, NH4: 1.5, Fe2: 8, Mn: 0.6, Ba: 0.05, Sr: 0.2, Cl: 25, SO4: 20, NO3: 0.1, NO2: 0, F: 0.4, Br: 0.05, PO4: 0.3, SiO2: 25, B: 0.05, Fe3: 0.2, Al: 0, DOC: 2, BDOC: 0.4, POC: 0.1, UV254: 0.06, O2: 0.3, CH4: 1, H2S: 0.2, Ecoli: -9, Giardia: -9, Crypto: -9, Virus: -9, MP: 0, PFOA: 0, PFOS: 0 }) },
  hard: { n: 'Nước ngầm cứng (vôi hóa – làm mềm)', wq: () => ({ T: 20, pH: 7.4, alk: 280, turb: 1, Ca: 110, Mg: 28, Na: 25, K: 4, NH4: 0.05, Fe2: 0.1, Mn: 0.02, Ba: 0.1, Sr: 0.6, Cl: 45, SO4: 85, NO3: 3, NO2: 0, F: 0.3, Br: 0.1, PO4: 0.05, SiO2: 18, B: 0.1, Fe3: 0, Al: 0, DOC: 1.5, BDOC: 0.3, POC: 0.05, UV254: 0.03, O2: 4, Ecoli: -9, Giardia: -9, Crypto: -9, Virus: -9, MP: 0, PFOA: 0, PFOS: 0 }) },
  brackish: { n: 'Nước lợ (TDS ≈ 3 000 mg/L)', wq: () => ({ T: 25, pH: 7.6, alk: 180, turb: 1, Ca: 120, Mg: 70, Na: 750, K: 25, NH4: 0.1, Fe2: 0.05, Mn: 0.02, Ba: 0.05, Sr: 2, Cl: 1300, SO4: 350, NO3: 2, NO2: 0, F: 0.8, Br: 4, PO4: 0.05, SiO2: 25, B: 0.6, Fe3: 0, Al: 0, DOC: 2, BDOC: 0.3, POC: 0.1, UV254: 0.04, O2: 6, Ecoli: 0, Giardia: -9, Crypto: -9, Virus: -9, MP: 0, PFOA: 0, PFOS: 0 }) },
  sea: { n: 'Nước biển (TDS ≈ 35 000 mg/L)', wq: () => ({ T: 28, pH: 8.1, alk: 115, turb: 2, Ca: 410, Mg: 1290, Na: 10770, K: 400, NH4: 0.05, Fe2: 0, Mn: 0, Ba: 0.02, Sr: 8, Cl: 19350, SO4: 2700, NO3: 0.1, NO2: 0, F: 1.3, Br: 67, PO4: 0.02, SiO2: 2, B: 4.5, Fe3: 0.02, Al: 0, DOC: 1.5, BDOC: 0.3, POC: 0.3, UV254: 0.02, O2: 6.5, Ecoli: 1, Giardia: -9, Crypto: -9, Virus: 0, MP: 0, PFOA: 0, PFOS: 0 }) },
  secondary: { n: 'Nước thải sau xử lý thứ cấp (tái sử dụng)', wq: () => ({ T: 28, pH: 7.1, alk: 110, turb: 4, Ca: 40, Mg: 10, Na: 95, K: 15, NH4: 1, Fe2: 0, Mn: 0.05, Ba: 0.04, Sr: 0.2, Cl: 120, SO4: 70, NO3: 8, NO2: 0.1, F: 0.6, Br: 0.2, PO4: 1, SiO2: 20, B: 0.3, Fe3: 0.1, Al: 0.05, DOC: 8, BDOC: 2, POC: 2, UV254: 0.18, O2: 4, Ecoli: 5, Giardia: 2, Crypto: 1, Virus: 3, MP: 2000, PFOA: 20, PFOS: 15 }) },
  pureFeed: { n: 'Nước máy làm nguồn cho nước siêu sạch', wq: () => ({ T: 25, pH: 7.6, alk: 90, turb: 0.2, Ca: 30, Mg: 8, Na: 20, K: 3, NH4: 0, Fe2: 0, Mn: 0, Ba: 0.02, Sr: 0.1, Cl: 30, SO4: 25, NO3: 1.5, NO2: 0, F: 0.5, Br: 0.05, PO4: 0.05, SiO2: 15, B: 0.05, Fe3: 0.02, Al: 0.02, DOC: 1.5, BDOC: 0.2, POC: 0.02, UV254: 0.03, O2: 8, Cl2f: 0.5, Ecoli: -9, Giardia: -9, Crypto: -9, Virus: -9, MP: 0, PFOA: 0, PFOS: 0 }) }
};

/* ===== Nước sau XLNT từ SimXLNT ===== */
WU.wwtp = {
  label: 'Nước ra từ SimXLNT', group: 'Nguồn & đích', ins: [], outs: ['out'],
  fields: [
    { k: 'fQ', l: 'Tỉ lệ lưu lượng đưa sang', u: '%' },
    { k: 'codToc', l: 'Tỉ số COD hòa tan/DOC', u: 'gCOD/gC', adv: true },
    { k: 'bal', l: 'Cân bằng điện tích bằng', t: 'sel', opts: [['auto', 'Tự chọn Na⁺/Cl⁻'], ['Na', 'Na⁺'], ['Cl', 'Cl⁻'], ['none', 'Không']] },
    { k: 'dynSeries', l: 'Mô phỏng theo thời gian dùng', t: 'sel', opts: [['series', 'Chuỗi động SimXLNT (lặp lại)'], ['avg', 'Giá trị trung bình']] }
  ],
  def: () => ({ fQ: 100, codToc: 2.8, bal: 'auto', dynSeries: 'series', snap: null, bg: { Ca: 40, Mg: 10, Na: 90, K: 15, Cl: 120, SO4: 70, F: 0.6, Br: 0.2, SiO2: 20, B: 0.3, Ba: 0.04, Sr: 0.2, Fe3: 0.1, Al: 0.05, Mn: 0.05, UVspec: 0.022, Ecoli: 5, Giardia: 2, Crypto: 1, Virus: 3, MP: 2000, PFOA: 20, PFOS: 15 } }),
  calc(u, inp, ctx) {
    const s = u.p.snap;
    if (!s) { ctx.warn(u.name + ': chưa nhập dữ liệu từ SimXLNT – dùng nước thải thứ cấp điển hình'); }
    let e = s ? s.avg : null;
    if (s && ctx.mode === 'dyn' && u.p.dynSeries === 'series' && s.series && s.series.t.length > 1) {
      const S = s.series, per = S.t[S.t.length - 1] - S.t[0], tt = S.t[0] + ((ctx.t / 24 - S.t[0]) % per + per) % per;
      let i = 1; while (i < S.t.length - 1 && S.t[i] < tt) i++;
      const f = Math.min(Math.max((tt - S.t[i - 1]) / (S.t[i] - S.t[i - 1] || 1), 0), 1);
      e = {}; for (const k in S.v) e[k] = S.v[k][i - 1] + f * (S.v[k][i] - S.v[k][i - 1]);
    }
    const w = wFromWwtp(e, u.p);
    w.Q = (e ? e.Q : 10000) * (+u.p.fQ) / 100;
    return { o: { out: w }, info: { Q: w.Q, src: s ? s.name : '(mặc định)', time: s ? s.time : '' } };
  }
};
function wFromWwtp(e, p) {
  const bg = p.bg;
  const d = e || { Q: 10000, T: 25, pH: 7.1, sCOD: 30, SS: 2, COD: 45, TSS: 10, VSS: 7, NH4: 1, NOx: 8, PO4: 1, TIC: 3, DO: 2, Alk: 120 };
  const key = JSON.stringify([d, bg, p.codToc, p.bal]);
  if (_charCache.has(key)) return WQ.copy(_charCache.get(key));
  const wq = Object.assign({}, bg);
  wq.T = d.T || 25; wq.pH = d.pH || 7;
  wq.DOC = Math.max(d.sCOD || 0, 0) / p.codToc;
  wq.BDOC = Math.min(Math.max(d.SS || 0, 0) / 2.67, wq.DOC);
  wq.POC = Math.max((d.COD || 0) - (d.sCOD || 0), 0) / 2.7;
  wq.turb = Math.max((d.TSS || 0) - (d.VSS || 0), 0) / 2 + 0.05;
  wq.NH4 = d.NH4 || 0; wq.NO3 = d.NOx || 0; wq.NO2 = 0; wq.PO4 = d.PO4 || 0; wq.O2 = d.DO || 0;
  wq.UV254 = (bg.UVspec || 0.022) * wq.DOC;
  const w = WQ.make();
  for (const k of WQ.KEYS) if (wq[k] !== undefined) w[k] = +wq[k];
  w.T = wq.T; w.Q = 1;
  w.SSi = 2 * wq.turb;
  // TIC: ưu tiên STIC của SimXLNT (mol/m³ = mmol/L), nếu không thì từ độ kiềm
  w.TIC = d.TIC > 0 ? d.TIC : WQ.ticFromAlk(d.Alk || 100, wq.pH, w.T);
  w.ClD = 0.35 * w.DOC;
  const ib = WQ.ionBalance(w, wq.pH);
  let ion = p.bal; if (ion === 'auto') ion = ib.cat < ib.an ? 'Na' : 'Cl';
  const r = (ion === 'Na' || ion === 'Cl') ? WQ.balanceTo(w, wq.pH, ion).w : w;
  if (_charCache.size > 200) _charCache.clear();
  _charCache.set(key, r);
  return WQ.copy(r);
}

WU.product = {
  label: 'Nước thành phẩm', group: 'Nguồn & đích', ins: ['in'], outs: [],
  fields: [{ k: 'std', l: 'So sánh với', t: 'sel', opts: Object.keys(WSTD).map(k => [k, WSTD[k].n]) }],
  def: () => ({ std: 'qcvn01' }),
  calc(u, inp) { return { o: {}, info: { Q: inp.in.Q } }; }
};
WU.waste = {
  label: 'Dòng thải / bùn / nước muối', group: 'Nguồn & đích', ins: ['in'], outs: [],
  fields: [{ k: 'kind', l: 'Loại', t: 'sel', opts: [['sludge', 'Bùn cặn'], ['brine', 'Nước muối đậm đặc'], ['bw', 'Nước rửa lọc'], ['other', 'Khác']] }],
  def: () => ({ kind: 'sludge' }),
  calc(u, inp) { return { o: {}, info: { Q: inp.in.Q, TSS: WQ.tss(inp.in) * inp.in.Q / 1000 } }; }
};

/* ===== Dòng chảy ===== */
WU.mixer = {
  label: 'Hòa trộn', group: 'Dòng chảy', ins: ['a', 'b', 'c'], outs: ['out'], fields: [], def: () => ({}),
  calc(u, inp) { return { o: { out: WQ.mix([inp.a, inp.b, inp.c]) }, info: {} }; }
};
WU.splitter = {
  label: 'Chia dòng', group: 'Dòng chảy', ins: ['in'], outs: ['a', 'b'],
  fields: [{ k: 'mode', l: 'Cách chia', t: 'sel', opts: [['frac', 'Tỉ lệ sang A'], ['Qa', 'Lưu lượng sang A']] },
    { k: 'frac', l: 'Tỉ lệ sang A', u: '%', show: p => p.mode === 'frac' }, { k: 'Qa', l: 'Lưu lượng sang A', u: 'm³/d', show: p => p.mode === 'Qa' }],
  def: () => ({ mode: 'frac', frac: 50, Qa: 1000 }),
  calc(u, inp) {
    const w = inp.in, Qa = u.p.mode === 'Qa' ? Math.min(+u.p.Qa, w.Q) : w.Q * (+u.p.frac) / 100;
    return { o: { a: WQ.scale(w, Qa), b: WQ.scale(w, w.Q - Qa) }, info: { Qa, Qb: w.Q - Qa } };
  }
};
WU.pump = {
  label: 'Bơm', group: 'Dòng chảy', ins: ['in'], outs: ['out'],
  fields: [{ k: 'H', l: 'Cột áp', u: 'm' }, { k: 'eta', l: 'Hiệu suất bơm + động cơ', u: '%' }],
  def: () => ({ H: 20, eta: 70 }),
  calc(u, inp) { const w = inp.in, kW = 1000 * 9.81 * w.Q / 86400 * (+u.p.H) / ((+u.p.eta) / 100) / 1000; return { o: { out: WQ.copy(w) }, info: { kW } }; }
};
WU.hx = {
  label: 'Điều chỉnh nhiệt độ', group: 'Dòng chảy', ins: ['in'], outs: ['out'],
  fields: [{ k: 'mode', l: 'Chế độ', t: 'sel', opts: [['set', 'Nhiệt độ ra đặt'], ['dT', 'Tăng/giảm ΔT']] }, { k: 'Tset', l: 'Nhiệt độ ra', u: '°C', show: p => p.mode === 'set' }, { k: 'dT', l: 'ΔT', u: '°C', show: p => p.mode === 'dT' }, { k: 'eta', l: 'Hiệu suất cấp nhiệt', u: '%' }],
  def: () => ({ mode: 'set', Tset: 25, dT: 5, eta: 90 }),
  calc(u, inp) {
    const w = WQ.copy(inp.in), T0 = w.T;
    w.T = u.p.mode === 'set' ? +u.p.Tset : T0 + (+u.p.dT);
    const kW = Math.abs(w.T - T0) * 4.18 * w.Q * 1000 / 86400 / ((+u.p.eta) / 100);
    return { o: { out: w }, info: { kW, dT: w.T - T0 } };
  }
};

/* ===== Hóa chất ===== */
WU.dose = {
  label: 'Châm hóa chất', group: 'Hóa chất', ins: ['in'], outs: ['out'],
  fields: [
    { k: 'chem', l: 'Hóa chất', t: 'sel', opts: Object.keys(WCHEM).map(k => [k, WCHEM[k].n]) },
    { k: 'mode', l: 'Chế độ', t: 'sel', opts: [['fixed', 'Liều cố định'], ['pH', 'Điều chỉnh tới pH đặt (axit/bazơ)'], ['ratio', 'Theo tỉ lệ Cl₂:N (cloramin)']] },
    { k: 'dose', l: 'Liều (chất tinh khiết)', u: 'mg/L', show: p => p.mode === 'fixed' },
    { k: 'pHset', l: 'pH đặt', show: p => p.mode === 'pH' },
    { k: 'ratio', l: 'Tỉ lệ Cl₂:NH₃-N', u: 'mg/mg', show: p => p.mode === 'ratio' },
    { k: 'basic', l: 'Độ bazơ PACl', u: '%', show: p => p.chem === 'PACl' },
    { k: 'tmix', l: 'Thời gian phản ứng tại điểm châm', u: 's', adv: true },
    { k: 'strength', l: 'Nồng độ thương phẩm', u: '%', adv: true }, { k: 'price', l: 'Đơn giá thương phẩm', u: 'đ/kg', adv: true }
  ],
  def: () => ({ chem: 'NaOCl', mode: 'fixed', dose: 2, pHset: 7.5, ratio: 4.5, basic: 70, tmix: 60, strength: 100, price: 0 }),
  calc(u, inp, ctx) {
    const w = WQ.copy(inp.in), c = WCHEM[u.p.chem];
    if (!c) return { o: { out: w }, info: {} };
    let x = 0;   // mmol/L
    if (u.p.mode === 'pH' && (c.acid || c.base)) {
      const pH0 = WQ.solve(w).pH, need = c.acid ? pH0 > +u.p.pHset : pH0 < +u.p.pHset;
      if (need) x = WQ.solveDose(w, (y, xx) => c.add(y, xx, u), +u.p.pHset, c.acid ? 50 : 30);
      if (u.p.chem === 'lime') x = Math.min(x, 15);
    } else if (u.p.mode === 'ratio' && c.nh) {
      const tot = w.Cl2f + w.NH2Cl + 2 * w.NHCl2;
      x = Math.max(tot / (+u.p.ratio) - w.NH4, 0) / 14.007;
    } else x = Math.max(+u.p.dose, 0) / c.M;
    c.add(w, x, u);
    WQ.precipMetals(w);
    let k = null;
    const tm = +u.p.tmix || 0;
    if (tm > 0 && (w.Cl2f > 1e-3 || w.NH2Cl > 1e-3 || w.O3 > 1e-3 || w.H2O2 > 1e-3)) { k = WK.integrate(w, tm, {}); Object.assign(w, k.w); }
    const mgL = x * c.M, kgd = mgL * w.Q / 1000;
    const kgProd = kgd / Math.max((+u.p.strength || 100) / 100, 1e-3);
    return { o: { out: w }, info: { dose: mgL, kgd, kgProd, cost: kgProd * (+u.p.price || 0), pH: WQ.solve(w).pH, chem: c.n } };
  }
};

/* ===== Keo tụ – tạo bông ===== */
WU.coag = {
  label: 'Keo tụ – tạo bông', group: 'Tách rắn', ins: ['in'], outs: ['out'],
  fields: [
    { k: 'HRT', l: 'Thời gian lưu (trộn + tạo bông)', u: 'min' }, { k: 'G', l: 'Gradient vận tốc G', u: '1/s' },
    { k: 'nom', l: 'Mô hình loại NOM', t: 'sel', opts: [['edwards', 'Edwards (1997) – hấp phụ Langmuir'], ['none', 'Không tính']] },
    { k: 'qP', l: 'Dung lượng hấp phụ P', u: 'mgP/mmol KL', adv: true }, { k: 'KP', l: 'Hằng số Langmuir P', u: 'L/mgP', adv: true }
  ],
  def: () => ({ HRT: 25, G: 50, nom: 'edwards', qP: 12, KP: 2 }),
  calc(u, inp) {
    const w = WQ.copy(inp.in);
    WQ.precipMetals(w);
    const pH = WQ.solve(w).pH;
    const Mfe = w.FeOH3 / 106.87, Mal = w.AlOH3 / 78.0, M = Mfe + Mal;       // mmol/L kết tủa
    const DOC0 = w.DOC;
    if (u.p.nom === 'edwards' && M > 0 && w.DOC > 0) {
      const SUVA = w.UV254 * 100 / w.DOC;
      const fnon = Math.min(Math.max(-0.0753 * SUVA + 0.5655, 0.03), 0.95);
      const Cs0 = (1 - fnon) * w.DOC;
      const lang = (C0, Mx, a, b) => { if (Mx <= 0 || a <= 0) return C0; const B = 1 + Mx * a * b - b * C0; return (-B + Math.sqrt(B * B + 4 * b * C0)) / (2 * b); };
      const aFe = Math.max(4.96 * pH ** 3 - 73.9 * pH ** 2 + 280 * pH, 0), aAl = Math.max(4.91 * pH ** 3 - 74.2 * pH ** 2 + 284 * pH, 0);
      let C = lang(Cs0, Mal, aAl, 0.147); C = lang(C, Mfe, aFe, 0.068);
      const DOC1 = fnon * w.DOC + C, rem = w.DOC - DOC1;
      w.UV254 *= Math.pow(Math.max(DOC1 / w.DOC, 0), 1.4);
      w.BDOC = Math.min(w.BDOC, DOC1);
      w.DOC = DOC1; w.POC += rem;
    }
    // phosphat hấp phụ lên kết tủa
    if (M > 0 && w.PO4 > 0) {
      const a = +u.p.qP, b = +u.p.KP, C0 = w.PO4, B = 1 + M * a * b - b * C0;
      const Ce = (-B + Math.sqrt(B * B + 4 * b * C0)) / (2 * b);
      w.Pads += C0 - Ce; w.PO4 = Ce;
    }
    // mức độ keo tụ: lượng kết tủa so với nhu cầu (hạt + NOM), giảm khi pH lệch vùng tối ưu
    const need = 0.02 + 0.003 * (WQ.ntu(inp.in)) + 0.025 * DOC0;
    const pHopt = Mfe >= Mal ? (pH < 5 ? 0.3 : pH > 8.8 ? 0.6 : 1) : (pH < 5.5 ? 0.4 : pH > 7.8 ? 0.6 : 1);
    w.cond = Math.min(1, (M > 0 ? Math.min(1, M / need) * pHopt : 0) + 0.15 * Math.min(w.Poly, 1) + (w.cond || 0) * 0.5);
    return { o: { out: w }, info: { pH, M, DOCrem: DOC0 - w.DOC, cond: w.cond, Gt: (+u.p.G) * (+u.p.HRT) * 60, alkUse: WQ.solve(inp.in).alk - WQ.solve(w).alk } };
  }
};

/* ===== Lắng / lắng lamella / tuyển nổi ===== */
WU.settler = {
  label: 'Lắng / Lamella / DAF', group: 'Tách rắn', ins: ['in'], outs: ['out', 'sludge'],
  fields: [
    { k: 'kind', l: 'Loại', t: 'sel', opts: [['sed', 'Bể lắng ngang/đứng'], ['lam', 'Bể lắng lamella'], ['daf', 'Tuyển nổi khí hòa tan (DAF)']] },
    { k: 'A', l: 'Diện tích mặt bằng', u: 'm²' }, { k: 'Fl', l: 'Hệ số diện tích lamella', show: p => p.kind === 'lam' },
    { k: 'vf', l: 'Tốc độ lắng/nổi của bông tốt', u: 'm/h', adv: true }, { k: 'v0', l: 'Tốc độ lắng hạt không keo tụ', u: 'm/h', adv: true },
    { k: 'Cs', l: 'Nồng độ bùn xả / váng nổi', u: 'g/L' }, { k: 'rr', l: 'Tỉ lệ tuần hoàn bão hòa khí', u: '%', show: p => p.kind === 'daf' }
  ],
  def: () => ({ kind: 'sed', A: 500, Fl: 8, vf: 2.5, v0: 0.3, Cs: 10, rr: 10 }),
  calc(u, inp) {
    const w = inp.in, p = u.p, cond = condEff(w);
    const Aeff = (+p.A) * (p.kind === 'lam' ? +p.Fl : 1);
    const SOR = w.Q / 24 / Math.max(Aeff, 1e-6);                      // m/h
    const daf = p.kind === 'daf';
    const vs = daf ? 0.5 + (Math.max(+p.vf, 0.1) * 3.5 - 0.5) * cond : (+p.v0) + ((+p.vf) - (+p.v0)) * cond;
    const E = Math.min(0.998, 1 - Math.exp(-1.6 * vs / Math.max(SOR, 1e-6)));
    const solids = WQ.tss(w) * w.Q / 1000;                              // kg/d
    const QB = Math.min(E * solids / Math.max(+p.Cs, 0.1), 0.1 * w.Q);
    const lrv = { Crypto: lrvFromE(E, 0.5, 2), Giardia: lrvFromE(E, 0.5, 2), Virus: lrvFromE(E, 0.3, 1), Ecoli: lrvFromE(E, 0.4, 2) };
    // keo CaF₂ chưa keo tụ: hạt < 1 µm, lắng rất chậm (≈ 0,05 m/h) – cần keo tụ bằng Al/Fe/polymer trước
    const Ek = { CaF2c: Math.min(E, 1 - Math.exp(-1.6 * 0.05 / Math.max(SOR, 1e-6))) };
    const [A, B] = wSplit(w, QB, E, lrv, Ek);
    let kW = 0; if (daf) kW = (+p.rr) / 100 * w.Q / 86400 * 5e5 / 0.6 / 1000;
    return { o: { out: A, sludge: B }, info: { SOR, E: E * 100, vs, Qs: QB, solids: E * solids, turbOut: WQ.ntu(A), kW, CaF2out: (A.CaF2c || 0) + (A.CaF2s || 0) } };
  }
};

/* ===== Làm mềm bằng vôi – soda ===== */
WU.soften = {
  label: 'Làm mềm vôi – soda', group: 'Tách rắn', ins: ['in'], outs: ['out', 'sludge'],
  fields: [
    { k: 'mode', l: 'Liều vôi', t: 'sel', opts: [['pH', 'Theo pH đặt'], ['fixed', 'Cố định']] },
    { k: 'pHset', l: 'pH làm mềm', show: p => p.mode === 'pH' }, { k: 'lime', l: 'Liều Ca(OH)₂', u: 'mg/L', show: p => p.mode === 'fixed' },
    { k: 'soda', l: 'Liều Na₂CO₃', u: 'mg/L' }, { k: 'SIres', l: 'Quá bão hòa CaCO₃ còn lại (SI)', adv: true },
    { k: 'E', l: 'Hiệu suất tách cặn', u: '%' }, { k: 'Cs', l: 'Nồng độ bùn xả', u: 'g/L' }
  ],
  def: () => ({ mode: 'pH', pHset: 10.3, lime: 200, soda: 0, SIres: 0.5, E: 97, Cs: 60 }),
  calc(u, inp) {
    const w = WQ.copy(inp.in), p = u.p;
    const react = (y, limeMg) => {
      WCHEM.lime.add(y, limeMg / 74.09); WCHEM.soda.add(y, (+p.soda) / 105.99);
      let ca = 0, mg = 0;
      for (let i = 0; i < 3; i++) { ca += WQ.precipCalcite(y, +p.SIres); mg += WQ.precipBrucite(y); }
      return [ca, mg];
    };
    let lime = +p.lime;
    if (p.mode === 'pH') {
      // liều vôi sao cho pH SAU kết tủa đạt giá trị đặt
      let lo = 0, hi = 1500;
      for (let k = 0; k < 30; k++) { const m = 0.5 * (lo + hi), y = WQ.copy(w); react(y, m); if (WQ.solve(y).pH < +p.pHset) lo = m; else hi = m; }
      lime = 0.5 * (lo + hi);
    }
    const [caP, mgP] = react(w, lime);
    WQ.precipMetals(w);
    if (w.Fe2 > 0) { w.FeOH3 += w.Fe2 * 0.9 * 106.87 / 55.845; w.Fe2 *= 0.1; }
    if (w.Mn > 0) { w.MnO2 += w.Mn * 0.7 * 86.94 / 54.938; w.Mn *= 0.3; }
    const dSi = Math.min(0.8 * w.SiO2, 0.5 * mgP * 24.305); w.SiO2 -= dSi;
    const dD = 0.15 * w.DOC; w.DOC -= dD; w.POC += dD; w.UV254 *= 0.8;
    w.cond = 1;
    const E = (+p.E) / 100, solids = WQ.tss(w) * w.Q / 1000, QB = Math.min(E * solids / (+p.Cs), 0.1 * w.Q);
    const [A, B] = wSplit(w, QB, E, { Crypto: 1, Giardia: 1, Virus: 2, Ecoli: 2 });
    return { o: { out: A, sludge: B }, info: { lime, limeKg: lime * w.Q / 1000, CaCO3: caP * 100.09, MgOH2: mgP * 58.32, hardIn: WQ.solve(inp.in).hard, hardOut: WQ.solve(A).hard, pH: WQ.solve(A).pH, solids: E * solids } };
  }
};

/* ===== Bể phản ứng kết tủa (CSTR nối tiếp): fluorit CaF₂, keo tụ CaF₂, hydroxit kim loại, CaCO₃ ===== */
WU.precip = {
  label: 'Bể phản ứng kết tủa (CaF₂…)', group: 'Tách rắn', ins: ['in'], outs: ['out'],
  fields: [
    { k: 'V', l: 'Thể tích', u: 'm³' }, { k: 'nT', l: 'Số ngăn khuấy nối tiếp', u: '' },
    { k: 'cal', l: 'Kết tủa CaCO₃ đồng thời', t: 'sel', opts: [['no', 'Không'], ['eq', 'Có – tới SI còn lại']] },
    { k: 'SIres', l: 'Quá bão hòa CaCO₃ còn lại (SI)', show: p => p.cal === 'eq', adv: true },
    { k: 'mixW', l: 'Công suất khuấy', u: 'W/m³' },
    { k: 'qP', l: 'Tốc độ kết tủa fluorit q_P', u: 'g/m³/d', adv: true }, { k: 'qC', l: 'Tốc độ keo tụ CaF₂ trên bông Al/Fe', u: '1/d', adv: true }
  ],
  def: () => ({ V: 10, nT: 1, cal: 'no', SIres: 0.3, mixW: 30, qP: 500, qC: 1000 }),
  calc(u, inp) {
    const w = WQ.copy(inp.in), p = u.p, nT = Math.max(1, Math.round(+p.nT || 1));
    const Fin = w.F, Q = Math.max(w.Q, 1e-9), tau = (+p.V) / nT / Q;          // ngày mỗi ngăn
    let prec = 0, coag = 0, cal = 0;
    WQ.precipMetals(w);
    for (let i = 0; i < nT; i++) {
      const r = WQ.fluoriteCSTR(w, tau, { qP: +p.qP, qD: +p.qP, qFe: +p.qC, qAl: +p.qC });
      prec += r.prec; coag += r.coag;
      if (p.cal === 'eq') cal += WQ.precipCalcite(w, +p.SIres) * 100.09;
      WQ.precipMetals(w);
    }
    const s = WQ.solve(w);
    return { o: { out: w }, info: { HRT: (+p.V) / Q * 1440, CaF2: prec, coag, Fin, Fout: w.F, SIflu: s.SIflu, CaCO3: cal, pH: s.pH, CaF2c: w.CaF2c, CaF2s: w.CaF2s, kW: (+p.mixW) * (+p.V) / 1000 } };
  }
};

/* ===== Lọc nhanh trọng lực (cát / hai lớp vật liệu / sinh học) ===== */
WU.filter = {
  label: 'Lọc cát / lọc nhanh', group: 'Tách rắn', ins: ['in'], outs: ['out', 'bw'],
  fields: [
    { k: 'A', l: 'Tổng diện tích lọc', u: 'm²' }, { k: 'L', l: 'Chiều dày lớp vật liệu', u: 'm' }, { k: 'd10', l: 'Cỡ hạt hiệu quả d10', u: 'mm' },
    { k: 'Hmax', l: 'Tổn thất áp lực cho phép', u: 'm' }, { k: 'tmax', l: 'Chu kỳ lọc tối đa', u: 'h' },
    { k: 'bwV', l: 'Nước rửa lọc mỗi lần', u: 'm³/m²' }, { k: 'ftw', l: 'Xả lọc đầu', u: 'min', adv: true },
    { k: 'lam0', l: 'Hệ số lọc λ (keo tụ tốt)', u: '1/m', adv: true }, { k: 'kh', l: 'Hệ số tăng tổn thất', u: 'm/(kg/m²)', adv: true },
    { k: 'bio', l: 'Lọc sinh học (không có clo dư)', t: 'sel', opts: [['no', 'Không'], ['yes', 'Có']] },
    { k: 'mnox', l: 'Vật liệu phủ MnOx (khử Mn)', t: 'sel', opts: [['no', 'Không'], ['yes', 'Có']] }
  ],
  def: () => ({ A: 100, L: 1.0, d10: 0.6, Hmax: 2.0, tmax: 48, bwV: 5, ftw: 10, lam0: 4.5, kh: 0.8, bio: 'no', mnox: 'no' }),
  calc(u, inp, ctx) {
    const w0 = inp.in, p = u.p, w = WQ.copy(w0);
    const A = Math.max(+p.A, 1e-6), vf = w.Q / 24 / A;                  // m/h
    const cond = condEff(w);
    const lam = (+p.lam0) * (0.15 + 0.85 * cond) * Math.sqrt(10 / Math.max(vf, 0.5)) * Math.pow(0.6 / (+p.d10), 0.7);
    const E = Math.min(0.9995, 1 - Math.exp(-lam * (+p.L)));
    // sinh học & khử Fe/Mn trên vật liệu
    const EBCT = (+p.L) * A / Math.max(w.Q, 1e-9) * 1440;              // min
    const hasCl = w.Cl2f + w.NH2Cl > 0.1;
    // Fe²⁺ còn lại bị oxy hóa xúc tác trên bề mặt vật liệu (trước quá trình sinh học)
    if (w.Fe2 > 0 && (w.O2 > 0.5 || hasCl)) { const d = 0.9 * w.Fe2; w.Fe2 -= d; w.FeOH3 += d * 106.87 / 55.845; w.O2 = Math.max(w.O2 - 0.14 * d, 0); }
    let nitr = 0;
    if (p.bio === 'yes' && !hasCl) {
      const fT = Math.pow(1.04, w.T - 20);
      const fB = 1 - Math.exp(-0.15 * EBCT * fT); const dB = fB * w.BDOC; w.BDOC -= dB; w.DOC -= dB;
      const dS = 0.9 * w.H2S; w.H2S -= dS; w.SO4 += dS * 96.06 / 32.06; w.O2 = Math.max(w.O2 - 2 * dS, 0);
      const nMax = Math.max(w.O2 - 1, 0) / 4.57;
      nitr = Math.min((1 - Math.exp(-0.25 * EBCT * fT)) * w.NH4, nMax);
      w.NH4 -= nitr; w.NO3 += nitr; w.O2 -= 4.57 * nitr + 2.67 * dB;
      // nitrat hóa tiêu thụ độ kiềm: NH4⁺ → NO3⁻ (thay cation bằng anion) – tự động qua cân bằng điện tích
      const dMn = (p.mnox === 'yes' ? 0.95 : 0.6) * w.Mn; w.Mn -= dMn; w.MnO2 += dMn * 86.94 / 54.938;
    } else if (p.mnox === 'yes' && (hasCl || w.O2 > 2)) {
      const dMn = 0.95 * w.Mn; w.Mn -= dMn; w.MnO2 += dMn * 86.94 / 54.938;
    }
    // tổn thất áp lực (Carman–Kozeny) & chu kỳ lọc
    const mu = viscosity(w.T), eps = 0.42, de = (+p.d10) * 1.4e-3, psi = 0.85;
    const h0 = 180 * mu / (1000 * 9.81) * Math.pow(1 - eps, 2) / Math.pow(eps, 3) * (vf / 3600) * (+p.L) / Math.pow(psi * de, 2);
    const solidsIn = WQ.tss(w);
    const floc = 1 + 1.5 * (w.FeOH3 + w.AlOH3 + w.MnO2) / Math.max(solidsIn, 1e-9);
    const loadRate = E * solidsIn * vf / 1000 * floc;                     // kg/m²/h (hiệu chỉnh thể tích bông)
    let run = loadRate > 0 ? ((+p.Hmax) - h0) / ((+p.kh) * loadRate) : +p.tmax;
    run = Math.min(Math.max(run, 0.5), +p.tmax);
    const Vw = (+p.bwV) * A + w.Q / 24 * (+p.ftw) / 60;                 // m³ mỗi chu kỳ
    let QB = Vw / run * 24;
    let H = h0;
    if (ctx.mode === 'dyn') {
      const st = ctx.st || { m: 0 };
      const m = st.m + loadRate * ctx.dt;                                 // kg/m² đã giữ lại
      H = h0 + (+p.kh) * m;
      const bw = H >= +p.Hmax || (st.tr || 0) + ctx.dt >= +p.tmax;
      ctx.ns = { m: bw ? 0 : m, tr: bw ? 0 : (st.tr || 0) + ctx.dt, nbw: (st.nbw || 0) + (bw ? 1 : 0) };
    } else H = h0 + (+p.kh) * loadRate * run / 2;
    QB = Math.min(QB, 0.3 * w.Q);
    const lrv = { Crypto: lrvFromE(E, 0.8, 3), Giardia: lrvFromE(E, 0.9, 3), Virus: lrvFromE(E, 0.4, 2), Ecoli: lrvFromE(E, 0.7, 3) };
    const [Aout, B] = wSplit(w, QB, E, lrv, { CaF2c: 0.5 * E });
    return { o: { out: Aout, bw: B }, info: { vf, E: E * 100, h0, H, run, bwFrac: QB / w.Q * 100, EBCT, nitr, turbOut: WQ.ntu(Aout), lam } };
  }
};

/* ===== GAC / BAC ===== */
const GAC_ADS = {       // K (Freundlich), 1/n, độ dốc đường cong thoát s
  DOC: { K: 25, n: 0.4, s: 2.5, unit: 'mg' }, MP: { K: 80, n: 0.5, s: 4, unit: 'ug' }, PFOA: { K: 20, n: 0.4, s: 3, unit: 'ug' }, PFOS: { K: 60, n: 0.45, s: 3, unit: 'ug' }, THM: { K: 3, n: 0.6, s: 3, unit: 'ug' }
};
WU.gac = {
  label: 'Than hoạt tính hạt (GAC/BAC)', group: 'Hấp phụ & trao đổi ion', ins: ['in'], outs: ['out'],
  fields: [
    { k: 'EBCT', l: 'Thời gian tiếp xúc rỗng EBCT', u: 'min' }, { k: 'rho', l: 'Khối lượng riêng lớp than', u: 'g/L' },
    { k: 'nPar', l: 'Số bể vận hành so le', u: '' }, { k: 'tRepl', l: 'Chu kỳ thay/hoàn nguyên than', u: 'ngày' },
    { k: 'age', l: 'Tuổi than (khi tính ổn định, 1 bể)', u: 'ngày', show: p => +p.nPar <= 1 },
    { k: 'bio', l: 'Hoạt tính sinh học (BAC)', t: 'sel', opts: [['yes', 'Có'], ['no', 'Không']] },
    { k: 'fnon', l: 'Phần DOC không hấp phụ', u: '-', adv: true }, { k: 'comp', l: 'Hệ số cạnh tranh DOC', u: 'L/mgC', adv: true },
    { k: 'tgt', l: 'Tiêu chí thoát để tính CUR', t: 'sel', opts: [['DOC', 'DOC 50 %'], ['MP', 'Vi chất 20 %'], ['PFOA', 'PFOA 20 %'], ['PFOS', 'PFOS 20 %']], adv: true }
  ],
  def: () => ({ EBCT: 15, rho: 480, nPar: 4, tRepl: 360, age: 180, bio: 'yes', fnon: 0.15, comp: 0.3, tgt: 'DOC' }),
  calc(u, inp, ctx) {
    const w0 = inp.in, p = u.p, EBCT = Math.max(+p.EBCT, 0.01), N = Math.max(1, Math.round(+p.nPar)), tR = Math.max(+p.tRepl, 1);
    const ages = [];
    if (N <= 1) ages.push(ctx.mode === 'dyn' ? ((+p.age) + ctx.t / 24) % tR : +p.age);
    else for (let i = 0; i < N; i++) ages.push(((i + 0.5) / N * tR + (ctx.mode === 'dyn' ? ctx.t / 24 : 0)) % tR);
    const comp = 1 / (1 + (+p.comp) * w0.DOC);
    const bv50 = {};
    for (const k in GAC_ADS) {
      const g = GAC_ADS[k], C0 = g.unit === 'ug' ? w0[k] / 1000 * (k === 'THM' ? 1000 : 1) : w0[k] * (1 - (+p.fnon));
      if (!(C0 > 0)) { bv50[k] = Infinity; continue; }
      const q = g.K * Math.pow(C0, g.n) * (k === 'DOC' ? 1 : comp);
      bv50[k] = q * (+p.rho) / C0;
    }
    const frac = (k, bv) => bv50[k] === Infinity ? 0 : 1 / (1 + Math.pow(bv50[k] / Math.max(bv, 1e-9), GAC_ADS[k].s));
    const outs = ages.map(a => {
      const w = WQ.copy(w0), BV = a * 1440 / EBCT;
      const fD = frac('DOC', BV);
      const D1 = w0.DOC * ((+p.fnon) + (1 - (+p.fnon)) * fD);
      w.UV254 = w0.UV254 * Math.pow(D1 / Math.max(w0.DOC, 1e-9), 1.2);
      w.DOC = D1; w.BDOC = Math.min(w0.BDOC, D1);
      for (const k of ['MP', 'PFOA', 'PFOS', 'THM']) w[k] = w0[k] * frac(k, BV);
      return w;
    });
    const w = WQ.mix(outs.map(x => WQ.scale(x, w0.Q / N)));
    // BAC: phân hủy sinh học BDOC, nitrat hóa nếu không có chất oxy hóa dư
    const fT = Math.pow(1.04, w.T - 20);
    if (p.bio === 'yes' && w0.Cl2f + w0.O3 < 0.1) {
      const dB = (1 - Math.exp(-0.08 * EBCT * fT)) * w.BDOC; w.BDOC -= dB; w.DOC -= dB;
      const n = Math.min((1 - Math.exp(-0.15 * EBCT * fT)) * w.NH4, Math.max(w.O2 - 1, 0) / 4.57);
      w.NH4 -= n; w.NO3 += n; w.O2 = Math.max(w.O2 - 4.57 * n - 2.67 * dB, 0);
      const dMn = 0.8 * w.Mn; w.Mn -= dMn; w.MnO2 += dMn * 86.94 / 54.938;
    }
    // khử chất oxy hóa dư trên bề mặt than
    w.Cl2f *= Math.exp(-EBCT / 0.5); w.O3 *= Math.exp(-EBCT / 0.2); w.H2O2 *= Math.exp(-EBCT / 4);
    const nh = w.NH2Cl * (1 - Math.exp(-EBCT / 4)); w.NH2Cl -= nh; w.NH4 += nh / 70.9 * 14.007; w.Cl += nh / 70.9 * 35.453;
    w.NHCl2 *= Math.exp(-EBCT / 2);
    // CUR
    const tg = p.tgt || 'DOC', lev = tg === 'DOC' ? 0.5 : 0.2;
    const BVt = bv50[tg] * Math.pow(lev / (1 - lev), 1 / GAC_ADS[tg].s);
    const CUR = isFinite(BVt) && BVt > 0 ? (+p.rho) * 1000 / BVt : 0;
    const Vbed = w0.Q * EBCT / 1440;
    const [Aout] = wSplit(w, 0, 0.9, { Crypto: 0.5, Giardia: 0.5, Virus: 0.3, Ecoli: 0.5 });
    return { o: { out: Aout }, info: { EBCT, Vbed, BV50doc: bv50.DOC, BV50mp: bv50.MP, BV50pfoa: bv50.PFOA, BV50pfos: bv50.PFOS, daysTgt: BVt * EBCT / 1440, CUR, kgd: CUR * w0.Q / 1000, ages } };
  }
};

/* ===== Trao đổi ion ===== */
const IX_TYPES = {
  SACNa: { n: 'Cation axit mạnh dạng Na (làm mềm)', cap: 1.0, regen: 'NaCl', lev: 120, stoich: 58.44, leak: 0.01 },
  SACH: { n: 'Cation axit mạnh dạng H', cap: 1.4, regen: 'HCl', lev: 80, stoich: 36.46, leak: 0.02 },
  WACH: { n: 'Cation axit yếu dạng H (khử kiềm)', cap: 3.0, regen: 'HCl', lev: 120, stoich: 36.46, leak: 0.05 },
  SBAOH: { n: 'Anion bazơ mạnh dạng OH', cap: 0.8, regen: 'NaOH', lev: 80, stoich: 40.0, leak: 0.02 },
  SBACl: { n: 'Anion bazơ mạnh dạng Cl (khử nitrat/hữu cơ)', cap: 1.0, regen: 'NaCl', lev: 150, stoich: 58.44, leak: 0.05 },
  MB: { n: 'Hỗn hợp (mixed bed)', cap: 0.5, regen: 'HCl+NaOH', lev: 100, stoich: 38, leak: 0.001 },
  PFAS: { n: 'Nhựa chọn lọc PFAS (dùng một lần)', cap: 0, regen: '', lev: 0, stoich: 1, leak: 0.01, life: 150000 }
};
WU.ix = {
  label: 'Trao đổi ion', group: 'Hấp phụ & trao đổi ion', ins: ['in'], outs: ['out', 'regen'],
  fields: [
    { k: 'type', l: 'Loại nhựa', t: 'sel', opts: Object.keys(IX_TYPES).map(k => [k, IX_TYPES[k].n]) },
    { k: 'V', l: 'Thể tích nhựa (mỗi cột)', u: 'm³' }, { k: 'nCol', l: 'Số cột vận hành', u: '' },
    { k: 'cap', l: 'Dung lượng làm việc', u: 'eq/L nhựa' }, { k: 'lev', l: 'Mức hóa chất tái sinh', u: 'g/L nhựa', show: p => p.type !== 'PFAS' },
    { k: 'leak', l: 'Tỉ lệ rò rỉ', u: '%', adv: true }, { k: 'rinse', l: 'Thể tích nước rửa + tái sinh', u: 'BV', adv: true }
  ],
  def: () => ({ type: 'SACNa', V: 5, nCol: 2, cap: 1.0, lev: 120, leak: 1, rinse: 8 }),
  calc(u, inp, ctx) {
    const w0 = inp.in, p = u.p, T = IX_TYPES[p.type] || IX_TYPES.SACNa, w = WQ.copy(w0);
    const sol = WQ.solve(w0);
    const eq = (k) => Math.abs(WQ.D[k].z) * Math.max(w0[k], 0) / WQ.D[k].M;   // meq/L
    let leak = (+p.leak) / 100;
    const Vres = (+p.V) * Math.max(1, +p.nCol);
    // tải ion (meq/L) và biến đổi chất lượng
    let load = 0;
    const strip = (keys, f) => { for (const k of keys) { const r = w[k] * f; load += Math.abs(WQ.D[k].z) * r / WQ.D[k].M; w[k] -= r; } };
    let added = {};
    if (p.type === 'PFAS') {
      w.PFOA *= leak; w.PFOS *= leak; w.MP *= 0.5;
    } else if (p.type === 'SACNa') {
      strip(['Ca', 'Mg', 'Ba', 'Sr', 'Fe2', 'Mn'], 1 - leak); strip(['NH4', 'K'], 0.5);
      w.Na += load * 22.99; added.Na = load;
    } else if (p.type === 'SACH') {
      strip(['Ca', 'Mg', 'Ba', 'Sr', 'Fe2', 'Mn', 'NH4', 'K'], 1 - leak); strip(['Na'], 1 - 2 * leak);
    } else if (p.type === 'WACH') {
      const alk = Math.max(sol.alk / 50, 0);                                 // meq/L
      const hard = eq('Ca') + eq('Mg');
      const r = Math.min(alk, hard) * (1 - leak), f = hard > 0 ? r / hard : 0;
      strip(['Ca', 'Mg'], f);
      const rest = Math.max(Math.min(alk, eq('Ca') + eq('Mg') + eq('Na') + eq('K')) * (1 - leak) - r, 0);
      if (rest > 0 && eq('Na') + eq('K') > 0) strip(['Na', 'K'], Math.min(rest / (eq('Na') + eq('K')), 1));
    } else if (p.type === 'SBAOH') {
      strip(['Cl', 'SO4', 'NO3', 'NO2', 'F', 'Br'], 1 - leak);
      const tic = w.TIC * (1 - leak); load += tic; w.TIC -= tic;          // CO2 + HCO3 → giữ lại (meq ≈ mmol)
      const si = 0.97 * w.SiO2; load += si / 60.08; w.SiO2 -= si;
      const b = 0.85 * w.B; w.B -= b; load += b / 10.81;
      const po = (1 - leak) * w.PO4; w.PO4 -= po; load += 2 * po / 30.974;
      w.DOC *= 0.6; w.UV254 *= 0.5; w.PFOA *= 0.1; w.PFOS *= 0.05; w.MP *= 0.6;
    } else if (p.type === 'SBACl') {
      strip(['SO4', 'NO3', 'NO2'], 1 - leak - 0.05); strip(['Br'], 0.7);
      const hco = w.TIC * 0.1; w.TIC -= hco; load += hco;
      w.Cl += load * 35.453; added.Cl = load;
      w.DOC *= 0.55; w.UV254 *= 0.4; w.PFOA *= 0.2; w.PFOS *= 0.1; w.MP *= 0.7;
    } else if (p.type === 'MB') {
      strip(['Ca', 'Mg', 'Ba', 'Sr', 'Fe2', 'Mn', 'NH4', 'K', 'Na'], 1 - leak); strip(['Cl', 'SO4', 'NO3', 'NO2', 'F', 'Br'], 1 - leak);
      const tic = w.TIC * (1 - leak); w.TIC -= tic; load += tic;
      const si = 0.99 * w.SiO2; w.SiO2 -= si; load += si / 60.08;
      const b = 0.95 * w.B; w.B -= b;
      w.PO4 *= leak; w.DOC *= 0.7; w.UV254 *= 0.6;
    }
    // chu kỳ làm việc
    const capEq = (+p.cap) * Vres * 1000;                                    // eq
    let BVrun, hrs, QB = 0, regenKg = 0;
    if (p.type === 'PFAS') { BVrun = T.life; hrs = BVrun * Vres / Math.max(w0.Q, 1e-9) * 24; }
    else {
      BVrun = load > 0 ? (+p.cap) * 1000 / load : 1e9;
      hrs = BVrun * Vres / Math.max(w0.Q, 1e-9) * 24;
      const vWaste = (+p.rinse) * Vres;                                      // m³/chu kỳ
      QB = Math.min(vWaste / Math.max(hrs, 0.1) * 24, 0.5 * w0.Q);
      regenKg = (+p.lev) * Vres;                                             // kg/chu kỳ
    }
    // động: rò rỉ tăng khi gần cạn kiệt
    if (ctx.mode === 'dyn' && p.type !== 'PFAS') {
      const st = ctx.st || { F: 0 };
      const F = st.F + (load * w0.Q * ctx.dt / 24) / Math.max(capEq, 1e-9);
      ctx.ns = { F: F >= 1 ? 0 : F, n: (st.n || 0) + (F >= 1 ? 1 : 0) };
      const bt = 1 / (1 + Math.exp(-(F - 0.97) / 0.015));
      if (bt > 1e-3) for (const k of WQ.KEYS) if (typeof w[k] === 'number' && !W_MIC.includes(k) && k !== 'T') w[k] = w[k] + bt * (w0[k] - w[k]);
    }
    const prod = WQ.scale(w, w0.Q - QB);
    // dòng thải tái sinh: ion bị giữ + hóa chất dư
    const rg = WQ.copy(w); rg.Q = QB;
    if (QB > 0) {
      const cf = w0.Q / QB;
      for (const k of WQ.KEYS) if (!W_MIC.includes(k) && k !== 'T' && k !== 'cond') rg[k] = Math.max(w0[k] - w[k], 0) * cf + w[k];
      const regenEq = regenKg * 1000 / T.stoich;                                        // eq/chu kỳ
      const excess = Math.max(regenEq - capEq, 0) / ((+p.rinse) * Vres);                // meq/L trong nước thải
      const exch = load * cf;                                                           // meq/L ion bị giữ thả ra
      const cation = ['SACNa', 'SACH', 'WACH'].includes(p.type);
      if (T.regen === 'NaCl') { if (cation) { rg.Cl += (exch + excess) * 35.453; rg.Na += excess * 22.99; } else { rg.Na += (exch + excess) * 22.99; rg.Cl += excess * 35.453; } }
      if (T.regen === 'HCl') rg.Cl += (exch + excess) * 35.453;
      if (T.regen === 'NaOH') rg.Na += (exch + excess) * 22.99;
      if (T.regen === 'HCl+NaOH') { rg.Cl += (exch / 2 + excess) * 35.453; rg.Na += (exch / 2 + excess) * 22.99; }
    }
    return { o: { out: prod, regen: rg }, info: { load, BVrun, hrs, regenKg, regenKgd: hrs > 0 ? regenKg / hrs * 24 : 0, QB, hardOut: WQ.solve(prod).hard, EC: WQ.solve(prod).EC, regen: T.regen } };
  }
};

/* ===== Màng MF/UF ===== */
WU.mf = {
  label: 'Màng MF / UF', group: 'Màng', ins: ['in'], outs: ['perm', 'waste'],
  fields: [
    { k: 'kind', l: 'Loại màng', t: 'sel', opts: [['UF', 'Siêu lọc UF'], ['MF', 'Vi lọc MF']] },
    { k: 'J', l: 'Thông lượng thiết kế', u: 'L/m²/h' }, { k: 'rec', l: 'Hiệu suất thu hồi', u: '%' },
    { k: 'Rm', l: 'Trở lực màng sạch', u: '10¹² 1/m', adv: true }, { k: 'kc', l: 'Hệ số tạo lớp bánh', u: '10¹² /(kg/m²)', adv: true },
    { k: 'tbw', l: 'Chu kỳ rửa ngược', u: 'min' }, { k: 'kirr', l: 'Tăng trở lực không thuận nghịch', u: '10¹²/ngày', adv: true },
    { k: 'tCIP', l: 'Chu kỳ rửa hóa chất CIP', u: 'ngày' }, { k: 'daysCIP', l: 'Số ngày từ lần CIP (tính ổn định)', u: 'ngày', adv: true }
  ],
  def: () => ({ kind: 'UF', J: 60, rec: 95, Rm: 1.2, kc: 8, tbw: 30, kirr: 0.03, tCIP: 30, daysCIP: 15 }),
  calc(u, inp, ctx) {
    const w0 = inp.in, p = u.p, rec = Math.min(Math.max(+p.rec, 1), 99.9) / 100;
    const Qp = w0.Q * rec, Am = Qp / 24 * 1000 / Math.max(+p.J, 1e-6);          // m²
    const uf = p.kind === 'UF';
    const lrv = { Crypto: 4, Giardia: 4, Virus: uf ? 2.5 : 0.5, Ecoli: 6 };
    const w = WQ.copy(w0);
    const dD = (uf ? 0.06 : 0.02) * w.DOC; w.DOC -= dD; w.POC += dD;
    const [P, W] = wSplit(w, w0.Q - Qp, 0.9999, lrv);
    // lọc đục: hạt sét mịn (độ đục) xuống ~0,03–0,05 NTU
    // TMP
    const mu = viscosity(w0.T), Jms = (+p.J) / 3.6e6;
    const solids = WQ.tss(w0);                                                       // g/m³
    const mcake = solids / 1000 * (+p.J) / 1000 * (+p.tbw) / 60;                   // kg/m² cuối chu kỳ
    let days = +p.daysCIP;
    if (ctx.mode === 'dyn') {
      const st = ctx.st || { d: 0 };
      days = st.d + ctx.dt / 24;
      ctx.ns = { d: days >= +p.tCIP ? 0 : days, n: (st.n || 0) + (days >= +p.tCIP ? 1 : 0) };
    }
    const R = ((+p.Rm) + (+p.kirr) * days + (+p.kc) * mcake * (ctx.mode === 'dyn' ? 1 : 0.5)) * 1e12;
    const TMP = Jms * mu * R / 1e5;
    const kWh = 0.06 + 0.25 * TMP;   // kWh/m³ thấm (bơm + rửa ngược + sục khí, gần đúng)
    return { o: { perm: P, waste: W }, info: { Am, TMP, TMP20: Jms * viscosity(20) * R / 1e5, R: R / 1e12, kW: kWh * Qp / 24, kWh, rec: rec * 100, turbOut: WQ.ntu(P) } };
  }
};

/* ===== UF đơn giản: tách tức thời theo hiệu suất giữ, rửa ngược quy về dòng thải liên tục (cân bằng khối lượng & năng lượng) ===== */
WU.ufs = {
  label: 'UF đơn giản (cân bằng khối lượng)', group: 'Màng', ins: ['in'], outs: ['perm', 'waste'],
  fields: [
    { k: 'mode', l: 'Kiểu vận hành', t: 'sel', opts: [['dead', 'Lọc chặn đầu (dead-end) + rửa ngược'], ['cross', 'Lọc dòng chéo (cross-flow)']] },
    { k: 'Ntrain', l: 'Số dàn (train)', u: '' }, { k: 'rec', l: 'Hiệu suất thu hồi', u: '%' },
    { k: 'rejTSS', l: 'Giữ chất rắn lơ lửng', u: '%' }, { k: 'rejCol', l: 'Giữ chất keo (CaF₂ keo…)', u: '%' },
    { k: 'pfeed', l: 'Áp suất cấp', u: 'kPa' }, { k: 'dpl', l: 'Tổn thất đường ống bơm cấp', u: 'kPa', adv: true }, { k: 'eta', l: 'Hiệu suất bơm cấp', u: '%' },
    { k: 'tfilt', l: 'Thời gian lọc mỗi chu kỳ', u: 'min', show: p => p.mode === 'dead' }, { k: 'tbw', l: 'Thời gian rửa ngược', u: 'min', show: p => p.mode === 'dead' },
    { k: 'fsc', l: 'Phần thời gian sục khí trong rửa ngược', u: '-', show: p => p.mode === 'dead', adv: true },
    { k: 'Qair', l: 'Khí sục rửa mỗi dàn (khi sục)', u: 'Nm³/d', show: p => p.mode === 'dead' },
    { k: 'eBW', l: 'Điện năng bơm rửa ngược', u: 'kWh/m³', show: p => p.mode === 'dead', adv: true }, { k: 'eAir', l: 'Điện năng sục khí', u: 'kWh/Nm³', show: p => p.mode === 'dead', adv: true }
  ],
  def: () => ({ mode: 'dead', Ntrain: 1, rec: 92.5, rejTSS: 99, rejCol: 90, pfeed: 250, dpl: 50, eta: 55, tfilt: 60, tbw: 2.5, fsc: 0.133, Qair: 5760, eBW: 0.25, eAir: 0.025 }),
  calc(u, inp) {
    const w0 = inp.in, p = u.p, dead = p.mode !== 'cross';
    const rec = Math.min(Math.max(+p.rec, 1), 99.9) / 100, Qp = w0.Q * rec, QB = w0.Q - Qp;
    const E = Math.min(Math.max(+p.rejTSS / 100, 0), 1), Ec = Math.min(Math.max(+p.rejCol / 100, 0), 1);
    const lrv = { Crypto: lrvFromE(E, 2, 4), Giardia: lrvFromE(E, 2, 4), Ecoli: lrvFromE(E, 2, 4), Virus: lrvFromE(E, 1, 2.5) };
    const [P, W] = wSplit(w0, QB, E, lrv, { CaF2c: Ec });
    const kWfeed = w0.Q / 86400 * ((+p.pfeed) + (+p.dpl)) / Math.max((+p.eta) / 100, 0.05);
    const air = dead ? Math.max(+p.Ntrain, 1) * (+p.Qair) * (+p.fsc) * (+p.tbw) / ((+p.tfilt) + (+p.tbw)) : 0;   // Nm³/d trung bình
    const kWbw = dead ? (+p.eBW) * QB / 24 : 0, kWair = (+p.eAir) * air / 24;
    const kW = kWfeed + kWbw + kWair;
    return { o: { perm: P, waste: W }, info: { rec: rec * 100, Qp, QB, kWfeed, kWbw, kWair, air, kW, kWh: kW * 24 / Math.max(Qp, 1e-9), turbOut: WQ.ntu(P), cyc: dead ? 1440 / ((+p.tfilt) + (+p.tbw)) : 0 } };
  }
};

/* ===== Thẩm thấu ngược RO / lọc nano NF ===== */
const RO_MEM = {
  BW: { n: 'RO nước lợ (tiêu chuẩn)', A: 3.0, B: { m: 0.13, d: 0.03, NO3: 0.6, F: 0.15, HCO3: 0.08, Si: 0.12, BOH: 9, NH3: 30, CO2: 1e4, PO4: 0.02 }, rDOC: 0.99, rMP: 0.95, rPF: 0.995 },
  BWLE: { n: 'RO nước lợ áp thấp', A: 4.5, B: { m: 0.2, d: 0.05, NO3: 0.9, F: 0.25, HCO3: 0.13, Si: 0.2, BOH: 12, NH3: 35, CO2: 1e4, PO4: 0.03 }, rDOC: 0.985, rMP: 0.93, rPF: 0.993 },
  SW: { n: 'RO nước biển', A: 1.1, B: { m: 0.035, d: 0.01, NO3: 0.15, F: 0.05, HCO3: 0.02, Si: 0.04, BOH: 3.5, NH3: 20, CO2: 1e4, PO4: 0.01 }, rDOC: 0.995, rMP: 0.97, rPF: 0.998 },
  NF90: { n: 'NF chặt (kiểu NF90)', A: 7.5, B: { m: 1.8, d: 0.15, NO3: 3, F: 1.2, HCO3: 0.8, Si: 2, BOH: 20, NH3: 40, CO2: 1e4, PO4: 0.1 }, rDOC: 0.97, rMP: 0.85, rPF: 0.99 },
  NF270: { n: 'NF lỏng (kiểu NF270)', A: 12, B: { m: 18, d: 0.9, SO4: 0.3, NO3: 30, F: 12, HCO3: 6, Si: 25, BOH: 40, NH3: 60, CO2: 1e4, PO4: 0.3 }, rDOC: 0.93, rMP: 0.6, rPF: 0.97 }
};
/* các "ion" trong mô hình RO: [khóa WQ, nhóm B, khối lượng mol, điện tích] */
const RO_ION = [['Na', 'm', 22.99, 1], ['K', 'm', 39.1, 1], ['NH4', 'm', 14.007, 1], ['Ca', 'd', 40.08, 2], ['Mg', 'd', 24.3, 2], ['Ba', 'd', 137.3, 2], ['Sr', 'd', 87.6, 2], ['Fe2', 'd', 55.85, 2], ['Mn', 'd', 54.94, 2],
  ['Cl', 'm', 35.45, -1], ['Br', 'm', 79.9, -1], ['NO3', 'NO3', 14.007, -1], ['NO2', 'NO3', 14.007, -1], ['F', 'F', 19.0, -1], ['SO4', 'd', 96.06, -2]];
WU.ro = {
  label: 'Thẩm thấu ngược / NF', group: 'Màng', ins: ['in'], outs: ['perm', 'conc'],
  fields: [
    { k: 'mem', l: 'Loại màng', t: 'sel', opts: Object.keys(RO_MEM).map(k => [k, RO_MEM[k].n]) },
    { k: 'rec', l: 'Hiệu suất thu hồi mục tiêu', u: '%' },
    { k: 'nSt', l: 'Số bậc (stage)', t: 'sel', opts: [['1', '1'], ['2', '2'], ['3', '3']] },
    { k: 'v1', l: 'Số ống bậc 1' }, { k: 'v2', l: 'Số ống bậc 2', show: p => +p.nSt >= 2 }, { k: 'v3', l: 'Số ống bậc 3', show: p => +p.nSt >= 3 },
    { k: 'nE', l: 'Số phần tử mỗi ống' }, { k: 'Ael', l: 'Diện tích mỗi phần tử', u: 'm²' },
    { k: 'boost', l: 'Bơm tăng áp giữa các bậc', u: 'bar', show: p => +p.nSt >= 2 },
    { k: 'ff', l: 'Hệ số bám bẩn (A thực/A mới)', u: '-' }, { k: 'spi', l: 'Tăng độ truyền muối/năm', u: '%/năm', adv: true },
    { k: 'age', l: 'Tuổi màng', u: 'năm', adv: true }, { k: 'Pp', l: 'Áp suất phía thấm', u: 'bar', adv: true },
    { k: 'eta', l: 'Hiệu suất bơm cao áp', u: '%' }, { k: 'erd', l: 'Hiệu suất thu hồi năng lượng (0 = không)', u: '%' },
    { k: 'lrv', l: 'LRV vi sinh tính cho màng', u: 'log', adv: true }, { k: 'kfoul', l: 'Suy giảm A theo thời gian (động)', u: '%/ngày', adv: true }, { k: 'tCIP', l: 'Chu kỳ CIP (động)', u: 'ngày', adv: true }
  ],
  def: () => ({ mem: 'BW', rec: 75, nSt: '2', v1: 10, v2: 5, v3: 3, nE: 7, Ael: 37.2, boost: 0, ff: 0.85, spi: 7, age: 1, Pp: 0.5, eta: 80, erd: 0, lrv: 2, kfoul: 0.5, tCIP: 90 }),
  calc(u, inp, ctx) {
    const w0 = inp.in, p = u.p, mem = RO_MEM[p.mem] || RO_MEM.BW;
    const TK = w0.T + 273.15, TCF = Math.exp(2640 * (1 / 298.15 - 1 / TK)), TCFB = Math.exp(3020 * (1 / 298.15 - 1 / TK));
    let ff = +p.ff;
    if (ctx.mode === 'dyn') {
      const st = ctx.st || { d: 0 };
      const d = st.d + ctx.dt / 24;
      ff = (+p.ff) * Math.max(1 - (+p.kfoul) / 100 * d, 0.3);
      ctx.ns = { d: d >= +p.tCIP ? 0 : d, n: (st.n || 0) + (d >= +p.tCIP ? 1 : 0) };
    }
    const A = mem.A * TCF * ff;                                            // L/m²/h/bar
    const Bf = TCFB * Math.pow(1 + (+p.spi) / 100, +p.age);
    const sol0 = WQ.solve(w0);
    // giả-ion trung tính
    const fNH3 = sol0.NH3 > 0 ? Math.min(sol0.NH3 / Math.max(w0.NH4, 1e-12), 1) : 0;
    const KB = WQ.K(w0.T).KB, aH = 10 ** -sol0.pH, fBOH = aH / (aH + KB);
    const co2 = sol0.sp.co2 * 1000, hco3 = Math.max(w0.TIC - co2, 0);       // mmol/L
    // vector nồng độ (mmol/L): ion RO_ION + [HCO3, CO2, SiO2, BOH3, borate, NH3, PO4]
    const nI = RO_ION.length, NX = nI + 7;
    const Bv = new Float64Array(NX), z = new Float64Array(NX);
    const c0 = new Float64Array(NX);
    RO_ION.forEach(([k, g, M, zz], i) => { Bv[i] = (mem.B[k] || mem.B[g] || mem.B.m) * Bf; z[i] = zz; c0[i] = Math.max(w0[k], 0) / M * (k === 'NH4' ? 1 - fNH3 : 1); });
    const iH = nI, iC = nI + 1, iS = nI + 2, iBo = nI + 3, iBt = nI + 4, iN = nI + 5, iP = nI + 6;
    c0[iH] = hco3; Bv[iH] = mem.B.HCO3 * Bf; z[iH] = -1;
    c0[iC] = co2; Bv[iC] = mem.B.CO2;
    c0[iS] = w0.SiO2 / 60.08; Bv[iS] = mem.B.Si * Bf;
    c0[iBo] = w0.B / 10.81 * fBOH; Bv[iBo] = mem.B.BOH * Bf;
    c0[iBt] = w0.B / 10.81 * (1 - fBOH); Bv[iBt] = mem.B.d * Bf; z[iBt] = 0;
    c0[iN] = w0.NH4 / 14.007 * fNH3; Bv[iN] = mem.B.NH3 * Bf;
    c0[iP] = w0.PO4 / 30.974; Bv[iP] = mem.B.PO4 * Bf;
    const osm = c => { let s = 0; for (let i = 0; i < NX; i++) if (i !== iC) s += c[i]; return 0.93 * 0.08314 * TK * s / 1000; };   // bar
    const nSt = Math.max(1, Math.min(3, +p.nSt)), ves = [+p.v1, +p.v2, +p.v3].slice(0, nSt).map(v => Math.max(1, Math.round(v))), nE = Math.max(1, Math.round(+p.nE)), Ael = +p.Ael;
    const Pp = +p.Pp;
    // mô phỏng chuỗi phần tử với áp suất cấp Pf
    const train = (Pf, keep) => {
      let Qf = w0.Q / 24, c = Float64Array.from(c0), P = Pf, QpT = 0;
      const cpT = new Float64Array(NX), els = [];
      for (let s = 0; s < nSt; s++) {
        if (s > 0) P += +p.boost;
        const nv = ves[s];
        for (let e = 0; e < nE; e++) {
          const qv = Qf / nv;                                              // m³/h mỗi ống
          const pi_f = osm(c);
          // giải Jw bằng chia đôi
          let lo = 0, hi = 200, J = 0, cp = new Float64Array(NX), cpf = 1, r = 0;
          for (let it = 0; it < 40; it++) {
            J = 0.5 * (lo + hi);
            const qp = J * Ael / 1000; r = Math.min(qp / qv, 0.95);
            cpf = Math.exp(0.7 * r);
            const lm = r > 1e-6 ? Math.log(1 / (1 - r)) / r : 1;
            let sp = 0;
            for (let i = 0; i < NX; i++) { const cm = c[i] * lm * cpf; cp[i] = Bv[i] * cm / (J + Bv[i] + 1e-12); if (i !== iC) sp += cp[i]; }
            const dP = 0.2 * Math.pow((qv * (1 - r / 2)) / 10, 1.5);
            const Jn = A * Math.max(P - dP / 2 - Pp - (pi_f * lm * cpf - 0.93 * 0.08314 * TK * sp / 1000), 0);
            if (Jn > J) lo = J; else hi = J;
          }
          // trung hòa điện tích permeate: co giãn cation/anion về trung bình nhân
          let cat = 0, an = 0;
          for (let i = 0; i < NX; i++) { if (z[i] > 0) cat += z[i] * cp[i]; else if (z[i] < 0) an += -z[i] * cp[i]; }
          if (cat > 0 && an > 0) { const g = Math.sqrt(cat * an); for (let i = 0; i < NX; i++) { if (z[i] > 0) cp[i] *= g / cat; else if (z[i] < 0) cp[i] *= g / an; } }
          const qp = J * Ael / 1000, Qp = qp * nv;
          const dP = 0.2 * Math.pow((qv * (1 - r / 2)) / 10, 1.5);
          if (keep) els.push({ st: s + 1, el: e + 1, J, P, qf: qv, r: r * 100, cpf, dP, TDSp: 0, pi: pi_f });
          for (let i = 0; i < NX; i++) { const m = c[i] * Qf - cp[i] * Qp; cpT[i] += cp[i] * Qp; c[i] = Math.max(m / Math.max(Qf - Qp, 1e-9), 0); }
          Qf -= Qp; QpT += Qp; P -= dP;
          if (Qf <= 1e-9) break;
        }
      }
      for (let i = 0; i < NX; i++) cpT[i] /= Math.max(QpT, 1e-12);
      return { QpT: QpT * 24, cp: cpT, cc: c, Pc: P, els };
    };
    const target = Math.min(Math.max(+p.rec, 5), 95) / 100 * w0.Q;
    let lo = 0, hi = mem.A < 2 ? 120 : 60, best = null;
    for (let it = 0; it < 40; it++) { const Pm = 0.5 * (lo + hi), r = train(Pm, false); if (r.QpT < target) lo = Pm; else hi = Pm; }
    const Pf = 0.5 * (lo + hi);
    best = train(Pf, true);
    // dựng dòng thấm & đặc
    const mk = (cv, Q) => {
      const w = WQ.make({ Q, T: w0.T });
      RO_ION.forEach(([k, g, M], i) => { w[k] = cv[i] * M; });
      w.NH4 = (cv[RO_ION.findIndex(x => x[0] === 'NH4')] + cv[iN]) * 14.007;
      w.TIC = cv[iH] + cv[iC]; w.SiO2 = cv[iS] * 60.08; w.B = (cv[iBo] + cv[iBt]) * 10.81; w.PO4 = cv[iP] * 30.974;
      return w;
    };
    const Qp = best.QpT, Qc = w0.Q - Qp;
    const P = mk(best.cp, Qp), C = mk(best.cc, Qc);
    // hữu cơ, vi sinh, khí, hạt
    const pass = (k, rej) => { P[k] = w0[k] * (1 - rej); C[k] = Qc > 0 ? (w0[k] * w0.Q - P[k] * Qp) / Qc : 0; };
    pass('DOC', mem.rDOC); pass('BDOC', mem.rDOC); pass('UV254', mem.rDOC); pass('MP', mem.rMP); pass('PFOA', mem.rPF); pass('PFOS', mem.rPF); pass('THM', 0.6); pass('BrO3', 0.95);
    pass('AS', 0.999); pass('Poly', 0.999); pass('ClD', 0.99); pass('cond', 1); pass('Fe3', 0.999); pass('Al', 0.995);
    for (const k of ['O2', 'CH4', 'H2S', 'O3', 'H2O2']) { P[k] = w0[k]; C[k] = w0[k]; }
    pass('Cl2f', 0.5); pass('NH2Cl', 0.6); pass('NHCl2', 0.6); pass('NCl3', 0.6);
    for (const k of W_PART) { P[k] = 0; C[k] = Qc > 0 ? w0[k] * w0.Q / Qc : 0; }
    for (const k of W_MIC) { P[k] = Math.max(w0[k] - (+p.lrv), -9); C[k] = Qc > 0 ? Math.log10(Math.max((Math.pow(10, w0[k]) * w0.Q - Math.pow(10, P[k]) * Qp) / Qc, 1e-9)) : -9; }
    // năng lượng
    const kWfeed = Pf * (w0.Q / 24) / 36 / ((+p.eta) / 100);
    const kWboost = nSt > 1 ? (+p.boost) * (nSt - 1) * (w0.Q / 24) * 0.5 / 36 / 0.75 : 0;
    const kWrec = (+p.erd) / 100 * best.Pc * (Qc / 24) / 36;
    const kW = kWfeed + kWboost - kWrec;
    // chỉ số cáu cặn dòng đặc
    const sc = WQ.solve(C), sp = WQ.solve(P);
    const asOn = w0.AS > 0.5;
    const lim = { LSI: asOn ? 1.8 : 0.2, SIgyp: asOn ? 0.36 : 0, SIbar: asOn ? 1.8 : 0, SIcel: asOn ? 0.9 : 0, SIflu: asOn ? 2 : 0, Si: asOn ? 150 : 100 };
    const warns = [];
    if (sc.LSI > lim.LSI) warns.push(`LSI dòng đặc ${sc.LSI.toFixed(2)} > ${lim.LSI}`);
    if (sc.SIgyp > lim.SIgyp) warns.push(`Thạch cao CaSO₄ SI ${sc.SIgyp.toFixed(2)} > ${lim.SIgyp}`);
    if (sc.SIbar > lim.SIbar) warns.push(`BaSO₄ SI ${sc.SIbar.toFixed(2)} > ${lim.SIbar}`);
    if (sc.SIcel > lim.SIcel) warns.push(`SrSO₄ SI ${sc.SIcel.toFixed(2)} > ${lim.SIcel}`);
    if (sc.SIflu > lim.SIflu) warns.push(`CaF₂ SI ${sc.SIflu.toFixed(2)} > ${lim.SIflu}`);
    if (sc.silicaPct > lim.Si) warns.push(`Silica ${sc.silicaPct.toFixed(0)} % bão hòa > ${lim.Si} %`);
    const els = best.els, Jmax = Math.max(...els.map(e => e.J)), Javg = Qp / 24 * 1000 / (ves.reduce((a, b) => a + b, 0) * nE * Ael);
    const sz = Ael / 37.2;
    if (Jmax > (mem.A < 2 ? 35 : 40)) warns.push(`Thông lượng phần tử đầu ${Jmax.toFixed(1)} L/m²/h cao`);
    const minConc = Math.min(...ves.map((v, s) => { const e = els.filter(x => x.st === s + 1); return e.length ? e[e.length - 1].qf * (1 - e[e.length - 1].r / 100) : 99; }));
    if (minConc < 3 * sz) warns.push(`Lưu lượng đặc cuối mỗi ống ${minConc.toFixed(2)} m³/h < ${(3 * sz).toFixed(1)} m³/h`);
    if (w0.Cl2f > 0.05) warns.push('Clo tự do vào màng polyamide – cần khử (SBS/GAC)');
    if (WQ.ntu(w0) > 1) warns.push('Độ đục nước vào RO > 1 NTU – cần tiền xử lý (SDI)');
    if (Math.abs(Qp - target) / Math.max(target, 1e-9) > 0.01) warns.push('Không đạt hiệu suất thu hồi mục tiêu ở áp suất cho phép');
    warns.forEach(m => ctx.warn(u.name + ': ' + m));
    return { o: { perm: P, conc: C }, info: { Pf, Pc: best.Pc, rec: Qp / w0.Q * 100, Javg, Jmax, kW, kWh: kW * 24 / Math.max(Qp, 1e-9), TDSp: sp.TDS, ECp: sp.EC, pHp: sp.pH, TDSc: sc.TDS, LSIc: sc.LSI, SIgyp: sc.SIgyp, SIbar: sc.SIbar, SIcel: sc.SIcel, SIflu: sc.SIflu, Sipct: sc.silicaPct, rejTDS: (1 - sp.TDS / Math.max(sol0.TDS, 1e-9)) * 100, rejB: (1 - P.B / Math.max(w0.B, 1e-9)) * 100, pif: sol0.osm, els, warns, nEl: ves.reduce((a, b) => a + b, 0) * nE } };
  }
};

/* ===== EDI ===== */
WU.edi = {
  label: 'Điện khử ion (EDI)', group: 'Màng', ins: ['in'], outs: ['perm', 'conc'],
  fields: [{ k: 'rec', l: 'Hiệu suất thu hồi', u: '%' }, { k: 'rI', l: 'Loại ion mạnh', u: '%' }, { k: 'rSi', l: 'Loại silica', u: '%' }, { k: 'rB', l: 'Loại bo', u: '%' }, { k: 'kWh', l: 'Điện năng', u: 'kWh/m³' }],
  def: () => ({ rec: 92, rI: 99.5, rSi: 95, rB: 90, kWh: 0.35 }),
  calc(u, inp, ctx) {
    const w0 = inp.in, p = u.p, rec = (+p.rec) / 100, Qp = w0.Q * rec, Qc = w0.Q - Qp;
    const P = WQ.copy(w0); P.Q = Qp;
    const f = 1 - (+p.rI) / 100;
    for (const k of W_IONS_CAT.concat(W_IONS_AN)) P[k] = w0[k] * f;
    P.TIC = w0.TIC * (1 - 0.97); P.SiO2 = w0.SiO2 * (1 - (+p.rSi) / 100); P.B = w0.B * (1 - (+p.rB) / 100); P.PO4 *= f;
    P.DOC *= 0.8; P.UV254 *= 0.8;
    const C = WQ.copy(w0); C.Q = Qc;
    for (const k of WQ.KEYS) if (!W_MIC.includes(k) && k !== 'T' && k !== 'cond') C[k] = Qc > 0 ? (w0[k] * w0.Q - P[k] * Qp) / Qc : 0;
    if (w0.TIC > 0.1) ctx.warn(u.name + ': CO₂/TIC vào EDI cao – cân nhắc khử khí CO₂ trước EDI');
    if (WQ.solve(w0).EC > 40) ctx.warn(u.name + ': độ dẫn vào EDI > 40 µS/cm (thường yêu cầu RO đặt trước)');
    const sp = WQ.solve(P);
    return { o: { perm: P, conc: C }, info: { kW: (+p.kWh) * Qp / 24, EC: sp.EC, res: 1 / Math.max(sp.EC, 0.0555) , rec: rec * 100 } };
  }
};

/* ===== Bể tiếp xúc / bể chứa / bể phản ứng ===== */
WU.tank = {
  label: 'Bể tiếp xúc / bể chứa', group: 'Khử trùng & oxy hóa', ins: ['in'], outs: ['out'],
  fields: [
    { k: 'V', l: 'Thể tích', u: 'm³' }, { k: 'flow', l: 'Chế độ dòng', t: 'sel', opts: [['plug', 'Dòng đẩy (bể tiếp xúc có vách)'], ['cstr', 'Khuấy trộn hoàn toàn (bể chứa)']] },
    { k: 'BF', l: 'Hệ số vách ngăn T10/T', u: '-' },
    { k: 'kla', l: 'Sục khí kLa (0 = không)', u: '1/h' },
    { k: 'prof', l: 'Lưu đồ phân bố theo thời gian', t: 'sel', opts: [['no', 'Không'], ['yes', 'Có']], adv: true }
  ],
  def: () => ({ V: 1000, flow: 'plug', BF: 0.5, kla: 0, prof: 'no' }),
  calc(u, inp, ctx) {
    const w0 = inp.in, p = u.p, tau = (+p.V) / Math.max(w0.Q, 1e-9) * 86400;     // s
    const opt = { BF: +p.BF, kla: (+p.kla) / 3600, profile: p.prof === 'yes', seg: p.flow === 'cstr' };
    let r, w;
    if (ctx.mode === 'dyn' && p.flow === 'cstr' && ctx.st && ctx.st.w) {
      // bể chứa động: trộn thể tích nội dung với lượng vào trong dt rồi phản ứng dt
      const st = ctx.st.w, dt = ctx.dt * 3600, Vin = w0.Q / 86400 * dt;
      const mix = WQ.mix([WQ.scale(st, +p.V - Math.min(Vin, +p.V)), WQ.scale(w0, Math.min(Vin, +p.V))]);
      r = WK.integrate(mix, dt, { BF: +p.BF, kla: opt.kla });
      w = WQ.copy(st); w.Q = w0.Q;
      ctx.ns = { w: Object.assign(WQ.copy(r.w), { Q: w0.Q }) };
      r.CTfree = st.Cl2f * (+p.BF) * tau / 60; r.CTcam = (st.NH2Cl + st.NHCl2) * (+p.BF) * tau / 60;
      r.credit = {}; const kf = WK.kFree(w.T, WQ.solve(w).pH, w.Cl2f), kc = WK.kCam(w.T);
      for (const m of W_MIC) r.credit[m] = Math.min(kf[m] * r.CTfree + kc[m] * r.CTcam, 6);
    } else {
      r = WK.integrate(w0, tau, opt);
      w = r.w; w.Q = w0.Q;
      WQ.precipMetals(w);
      if (ctx.mode === 'dyn') ctx.ns = { w: WQ.copy(w) };
    }
    const sol = WQ.solve(w);
    return { o: { out: w }, info: { HRT: tau / 3600, CTfree: r.CTfree, CTcam: r.CTcam, credit: r.credit, logs: r.logs, Cl2f: w.Cl2f, Cl2tot: sol.Cl2tot, pH: sol.pH, THM: w.THM, profile: r.profile } };
  }
};

/* ===== Ozone ===== */
WU.ozone = {
  label: 'Ozone hóa', group: 'Khử trùng & oxy hóa', ins: ['in'], outs: ['out'],
  fields: [
    { k: 'dose', l: 'Liều ozone hấp thụ', u: 'mg/L' }, { k: 'HRT', l: 'Thời gian tiếp xúc', u: 'min' }, { k: 'BF', l: 'Hệ số T10/T', u: '-' },
    { k: 'TE', l: 'Hiệu suất truyền khí', u: '%' }, { k: 'kWhkg', l: 'Điện năng sản xuất O₃', u: 'kWh/kg' },
    { k: 'kID', l: 'Nhu cầu tức thời', u: 'mgO₃/mgC', adv: true }, { k: 'kMP', l: 'kO₃ vi chất đại diện', u: 'M⁻¹s⁻¹', adv: true }, { k: 'kOH', l: 'kOH vi chất đại diện', u: 'M⁻¹s⁻¹', adv: true }, { k: 'Rct', l: 'Rct (phơi nhiễm OH/O₃)', u: '-', adv: true }
  ],
  def: () => ({ dose: 3, HRT: 10, BF: 0.6, TE: 90, kWhkg: 12, kID: 0.3, kMP: 100, kOH: 5e9, Rct: 1e-8 }),
  calc(u, inp) {
    const w0 = inp.in, p = u.p, w = WQ.copy(w0), dose = Math.max(+p.dose, 0);
    // nhu cầu tức thời của NOM
    const ID = Math.min(dose, (+p.kID) * w.DOC);
    const C0 = dose - ID;
    const doc0 = w.DOC;
    w.UV254 *= Math.exp(-0.3 * dose / Math.max(doc0, 0.3));
    w.BDOC = Math.min(w.BDOC + 0.12 * dose, 0.6 * w.DOC);
    w.DOC *= 1 - Math.min(0.03 * dose / Math.max(doc0, 0.3), 0.1);
    w.O3 += C0;
    const r = WK.integrate(w, (+p.HRT) * 60, { BF: +p.BF, O2sat: o2sat(w.T) * 4 });
    const o = r.w; o.Q = w0.Q;
    o.O2 = Math.min(o.O2 + 0.6 * dose, o2sat(w.T) * 2.5);
    // phơi nhiễm O3 thực (M·s) và OH
    const expO3 = r.CTo3 / Math.max(+p.BF, 0.05) / 48000 * 60 + 0;
    const H2O2r = Math.min(w0.H2O2 / 34.01 / Math.max(dose / 48, 1e-9), 2);
    const expOH = (+p.Rct) * (1 + 15 * H2O2r) * expO3 + 1.5e-10 * ID;
    const lMP = ((+p.kMP) * expO3 + (+p.kOH) * expOH) / 2.303;
    o.MP = w0.MP * Math.pow(10, -lMP);
    // bromat (Amy et al. 1994) – µg/L
    const BrUg = w0.Br * 1000;
    let BrO3 = 0;
    if (C0 > 0 && BrUg > 0) {
      const pH = WQ.solve(w0).pH;
      BrO3 = 1.55e-6 * Math.pow(Math.max(doc0, 0.3), -1.26) * Math.pow(pH, 5.82) * Math.pow(dose, 1.57) * Math.pow(BrUg, 0.73) * Math.pow(+p.HRT, 0.28) * Math.pow(1.035, w0.T - 20) / (1 + 1.5 * w0.NH4);
      BrO3 = Math.min(BrO3, BrUg * 127.9 / 79.9 * 0.5);
      o.BrO3 += BrO3; o.Br = Math.max(o.Br - BrO3 / 1000 * 79.9 / 127.9, 0);
    }
    const kgO3 = dose / ((+p.TE) / 100) * w0.Q / 1000;
    return { o: { out: o }, info: { ID, C0, Cout: o.O3, CT: r.CTo3, credit: r.credit, logs: r.logs, BrO3, lMP, kgO3, kW: kgO3 * (+p.kWhkg) / 24, expOH } };
  }
};

/* ===== UV / UV-AOP ===== */
WU.uv = {
  label: 'Tia cực tím UV / UV-AOP', group: 'Khử trùng & oxy hóa', ins: ['in'], outs: ['out'],
  fields: [
    { k: 'D0', l: 'Liều thiết kế ở UVT tham chiếu', u: 'mJ/cm²' }, { k: 'UVTref', l: 'UVT tham chiếu', u: '%' }, { k: 'd', l: 'Bề dày lớp nước hiệu dụng', u: 'cm', adv: true },
    { k: 'fP', l: 'Công suất đèn (tỉ lệ)', u: '-' }, { k: 'kWh0', l: 'Điện năng ở liều thiết kế', u: 'kWh/m³' },
    { k: 'kUV', l: 'Quang phân vi chất', u: 'cm²/mJ', adv: true }, { k: 'kOH', l: 'kOH vi chất', u: 'M⁻¹s⁻¹', adv: true }
  ],
  def: () => ({ D0: 40, UVTref: 95, d: 5, fP: 1, kWh0: 0.015, kUV: 5e-4, kOH: 5e9 }),
  calc(u, inp) {
    const w0 = inp.in, p = u.p, w = WQ.copy(w0);
    const g = UVT => { const a = -Math.log10(Math.min(Math.max(UVT, 1), 99.99) / 100) * (+p.d); return (1 - Math.pow(10, -a)) / (a * Math.LN10); };
    const UVT = Math.pow(10, -Math.max(w0.UV254, 0)) * 100;
    const D = (+p.D0) * (+p.fP) * g(UVT) / g(+p.UVTref);
    const tab = { Crypto: [[0, 0], [2.5, 1], [5.8, 2], [12, 3], [22, 4]], Giardia: [[0, 0], [2.1, 1], [5.2, 2], [11, 3], [22, 4]], Virus: [[0, 0], [39, 0.5], [58, 1], [100, 2], [143, 3], [186, 4]] };
    const lg = t => { const T = tab[t]; if (D >= T[T.length - 1][0]) return T[T.length - 1][1] * D / T[T.length - 1][0]; for (let i = 1; i < T.length; i++) if (D <= T[i][0]) return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * (D - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); return 0; };
    const logs = { Crypto: Math.min(lg('Crypto'), 6), Giardia: Math.min(lg('Giardia'), 6), Virus: Math.min(lg('Virus'), 6), Ecoli: Math.min(D / 3, 6) };
    for (const m of W_MIC) w[m] = Math.max(w[m] - logs[m], -9);
    // AOP: phơi nhiễm OH ~ D·[H2O2]/scavenging
    const sol = WQ.solve(w0);
    const H2O2M = w0.H2O2 / 34010;
    const scav = 2.5e4 * w0.DOC + 8.5e6 * sol.sp.hco3 + 3.9e8 * sol.sp.co3 + 2.7e7 * H2O2M + 1e3;
    const expOH = 7.8e-5 * D * H2O2M / scav;
    const lMP = (D * (+p.kUV) + (+p.kOH) * expOH / 2.303 * 2.303) / 2.303;
    w.MP = w0.MP * Math.pow(10, -lMP);
    w.H2O2 = w0.H2O2 * Math.exp(-1e-4 * D);
    // quang phân cloramin/clo (nhẹ)
    w.NH2Cl *= Math.exp(-2e-4 * D); w.Cl2f *= Math.exp(-5e-4 * D);
    const kWh = (+p.kWh0) * (+p.fP);
    return { o: { out: w }, info: { D, UVT, logs, lMP, expOH, kW: kWh * w0.Q / 24, kWh } };
  }
};

/* ===== Tháp khử khí / làm thoáng ===== */
WU.stripper = {
  label: 'Khử khí / làm thoáng', group: 'Khí & khoáng hóa', ins: ['in'], outs: ['out'],
  fields: [
    { k: 'kind', l: 'Loại', t: 'sel', opts: [['packed', 'Tháp đệm ngược chiều'], ['cascade', 'Giàn mưa / bậc thang']] },
    { k: 'GL', l: 'Tỉ lệ khí/nước G/L', u: 'm³/m³', show: p => p.kind === 'packed' }, { k: 'Z', l: 'Chiều cao lớp đệm', u: 'm', show: p => p.kind === 'packed' }, { k: 'HTU', l: 'Chiều cao đơn vị truyền khối', u: 'm', show: p => p.kind === 'packed', adv: true },
    { k: 'eff', l: 'Hiệu suất trao đổi khí (với CO₂)', u: '%', show: p => p.kind === 'cascade' },
    { k: 'Hmp', l: 'Hằng số Henry vi chất (không thứ nguyên)', u: '-', adv: true }
  ],
  def: () => ({ kind: 'packed', GL: 30, Z: 3, HTU: 0.6, eff: 60, Hmp: 0 }),
  calc(u, inp) {
    const w0 = inp.in, p = u.p, w = WQ.copy(w0);
    const T = w.T, nSeg = 10;
    // Henry không thứ nguyên ~20 °C
    const H = { CO2: 1.1 * Math.pow(1.03, T - 20), H2S: 0.4, CH4: 28, NH3: 7e-4 * Math.pow(1.07, T - 20), O2: 30, THM: 0.15, MP: +p.Hmp };
    const fOf = h => {
      if (p.kind === 'cascade') { const e = (+p.eff) / 100; return 1 - Math.pow(1 - e * Math.min(1, h / 1.1) / Math.max(1, 1), 1 / nSeg); }
      const S = h * (+p.GL), NTU = (+p.Z) / (+p.HTU) / nSeg;
      return S > 1e-9 ? (1 - Math.exp(-NTU * (1 - 1 / Math.max(S, 1.0001)))) * Math.min(1, S) : 0;
    };
    const K = WQ.K(T);
    const co2air = K.KHco2 * 4.2e-4 * 1000;                                   // mmol/L cân bằng với không khí
    for (let s = 0; s < nSeg; s++) {
      const sol = WQ.solve(w);
      const co2 = sol.sp.co2 * 1000, f = fOf(H.CO2);
      w.TIC -= Math.max(co2 - co2air, 0) * f;
      const fh = fOf(H.H2S), aH = 10 ** -sol.pH, fH2S = aH / (aH + K.KH2S); w.H2S -= w.H2S * fH2S * fh;
      w.CH4 *= 1 - fOf(H.CH4);
      const fnh3 = sol.NH3 / Math.max(w.NH4, 1e-12); w.NH4 -= w.NH4 * Math.min(fnh3, 1) * fOf(H.NH3);
      const sat = o2sat(T); w.O2 += (sat - w.O2) * fOf(H.O2);
      w.THM *= 1 - fOf(H.THM); if (H.MP > 0) w.MP *= 1 - fOf(H.MP);
    }
    const s1 = WQ.solve(w);
    const kW = p.kind === 'packed' ? (+p.GL) * w0.Q / 86400 * 2500 / 0.6 / 1000 : 0;
    return { o: { out: w }, info: { pHin: WQ.solve(w0).pH, pHout: s1.pH, CO2in: WQ.solve(w0).CO2, CO2out: s1.CO2, O2: w.O2, kW } };
  }
};

/* ===== Tái khoáng hóa (bể calcit) ===== */
WU.remin = {
  label: 'Tái khoáng (bể calcit)', group: 'Khí & khoáng hóa', ins: ['in'], outs: ['out'],
  fields: [{ k: 'EBCT', l: 'Thời gian tiếp xúc EBCT', u: 'min' }, { k: 'k', l: 'Hằng số hòa tan', u: '1/min', adv: true }],
  def: () => ({ EBCT: 15, k: 0.12 }),
  calc(u, inp) {
    const w0 = inp.in, w = WQ.copy(w0);
    const x = WQ.ccpp(w0) / 100.09;                                          // mmol/L (âm = hòa tan được)
    let d = 0;
    if (x < 0) { d = -x * (1 - Math.exp(-(+u.p.k) * (+u.p.EBCT) * Math.pow(1.03, w0.T - 20))); w.Ca += d * 40.078; w.TIC += d; }
    const s = WQ.solve(w);
    return { o: { out: w }, info: { CaCO3: d * 100.09, kgd: d * 100.09 * w0.Q / 1000, LSI: s.LSI, alk: s.alk, hard: s.hard, pH: s.pH, CCPP: WQ.ccpp(w) } };
  }
};

/* ===== Cô đặc bay hơi ===== */
WU.evap = {
  label: 'Cô đặc bay hơi (MVC)', group: 'Khí & khoáng hóa', ins: ['in'], outs: ['dist', 'conc'],
  fields: [{ k: 'rec', l: 'Hiệu suất thu hồi nước ngưng', u: '%' }, { k: 'carry', l: 'Tỉ lệ cuốn theo', u: '%', adv: true }, { k: 'sec', l: 'Điện năng riêng', u: 'kWh/m³ ngưng' }],
  def: () => ({ rec: 90, carry: 0.01, sec: 22 }),
  calc(u, inp, ctx) {
    const w0 = inp.in, p = u.p, rec = (+p.rec) / 100, Qd = w0.Q * rec, Qc = w0.Q - Qd, cr = (+p.carry) / 100;
    const D = WQ.make({ Q: Qd, T: w0.T }), C = WQ.copy(w0); C.Q = Qc;
    for (const k of WQ.KEYS) {
      if (k === 'T' || W_MIC.includes(k)) continue;
      if (['O2', 'CH4', 'NH4', 'TIC', 'H2S', 'THM'].includes(k)) { D[k] = w0[k] * (k === 'TIC' ? 0.3 : k === 'NH4' ? 0.2 : 1); }
      else D[k] = w0[k] * cr;
      C[k] = Qc > 0 ? Math.max(w0[k] * w0.Q - D[k] * Qd, 0) / Qc : 0;
    }
    for (const k of W_MIC) { D[k] = -9; C[k] = w0[k] + Math.log10(1 / Math.max(1 - rec, 1e-6)); }
    const sc = WQ.solve(C);
    if (sc.SIgyp > 0.3 || sc.LSI > 2) ctx.warn(u.name + ': dòng đặc quá bão hòa (cần mầm tinh thể/ chống cáu cặn)');
    return { o: { dist: D, conc: C }, info: { kW: (+p.sec) * Qd / 24, TDSc: sc.TDS, LSIc: sc.LSI, SIgyp: sc.SIgyp } };
  }
};

/* ===== Xử lý bùn cặn ===== */
WU.dewater = {
  label: 'Cô đặc / tách nước bùn', group: 'Tách rắn', ins: ['in'], outs: ['cake', 'filt'],
  fields: [{ k: 'kind', l: 'Thiết bị', t: 'sel', opts: [['thick', 'Bể cô đặc trọng lực'], ['cent', 'Máy ly tâm'], ['press', 'Máy ép lọc khung bản'], ['bed', 'Sân phơi bùn']] },
    { k: 'cap', l: 'Hiệu suất thu giữ rắn', u: '%' }, { k: 'cs', l: 'Hàm lượng rắn bùn ra', u: '%' }, { k: 'poly', l: 'Liều polymer', u: 'kg/t DS' }],
  def: () => ({ kind: 'cent', cap: 95, cs: 20, poly: 4 }),
  calc(u, inp) {
    const w0 = inp.in, p = u.p, E = (+p.cap) / 100;
    const kgDS = WQ.tss(w0) * w0.Q / 1000;
    const Qc = Math.min(E * kgDS / ((+p.cs) / 100) / 1000, w0.Q);
    const [F, C] = wSplit(w0, Qc, E, { Crypto: 1, Giardia: 1, Virus: 0.5, Ecoli: 1 });
    return { o: { cake: C, filt: F }, info: { kgDS, cakeT: E * kgDS / ((+p.cs) / 100) / 1000, polyKg: (+p.poly) * kgDS / 1000 } };
  }
};

/* ===== Tách thành phần tổng quát ===== */
WU.cs = {
  label: 'Tách thành phần (tổng quát)', group: 'Tách rắn', ins: ['in'], outs: ['a', 'b'],
  fields: [{ k: 'fq', l: 'Tỉ lệ lưu lượng sang B', u: '%' }, { k: 'Ep', l: 'Phần chất rắn sang B', u: '%' }, { k: 'Ed', l: 'Phần chất tan sang B (ngoài theo lưu lượng)', u: '%' }, { k: 'lrv', l: 'LRV vi sinh ở A', u: 'log' }],
  def: () => ({ fq: 2, Ep: 95, Ed: 0, lrv: 1 }),
  calc(u, inp) {
    const w0 = inp.in, p = u.p, QB = w0.Q * (+p.fq) / 100;
    const L = +p.lrv;
    const [A, B] = wSplit(w0, QB, (+p.Ep) / 100, { Crypto: L, Giardia: L, Virus: L, Ecoli: L });
    const ed = (+p.Ed) / 100;
    if (ed > 0 && QB > 0) for (const k of W_IONS_CAT.concat(W_IONS_AN, ['TIC', 'SiO2', 'B', 'PO4', 'DOC', 'BDOC', 'UV254', 'MP', 'PFOA', 'PFOS'])) { const m = A[k] * A.Q * ed; A[k] -= m / A.Q; B[k] += m / QB; }
    return { o: { a: A, b: B }, info: {} };
  }
};

/* nhóm hiển thị */
const WU_GROUPS = ['Nguồn & đích', 'Dòng chảy', 'Hóa chất', 'Tách rắn', 'Màng', 'Hấp phụ & trao đổi ion', 'Khử trùng & oxy hóa', 'Khí & khoáng hóa'];
