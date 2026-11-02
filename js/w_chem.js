'use strict';
/* ==========================================================================
   SimNước – Lõi hóa học nước (nước cấp / tái sử dụng / nước siêu sạch)
   Dòng nước = đối tượng WQ (nồng độ theo mg/L trừ khi ghi khác).
   Cân bằng điện tích đầy đủ (ion chính + axit/bazơ yếu), hoạt độ Davies,
   hằng số phụ thuộc nhiệt độ; chỉ số bão hòa, CCPP, áp suất thẩm thấu, EC.
   ========================================================================== */
const WQ = {};

/* danh mục thành phần: [khóa, tên, đơn vị, nhóm, M (g/mol), z (điện tích), λ0 S·cm²/eq] */
WQ.DEF = [
  ['Ca', 'Canxi', 'mg/L', 'cation', 40.078, 2, 59.5], ['Mg', 'Magie', 'mg/L', 'cation', 24.305, 2, 53.1],
  ['Na', 'Natri', 'mg/L', 'cation', 22.99, 1, 50.1], ['K', 'Kali', 'mg/L', 'cation', 39.098, 1, 73.5],
  ['NH4', 'Amoni tổng (NH₄⁺+NH₃)', 'mgN/L', 'cation', 14.007, 1, 73.5], ['Fe2', 'Sắt hòa tan Fe²⁺', 'mg/L', 'cation', 55.845, 2, 54],
  ['Mn', 'Mangan hòa tan Mn²⁺', 'mg/L', 'cation', 54.938, 2, 53.5], ['Ba', 'Bari', 'mg/L', 'cation', 137.33, 2, 63.6],
  ['Sr', 'Stronti', 'mg/L', 'cation', 87.62, 2, 59.5],
  ['Cl', 'Clorua', 'mg/L', 'anion', 35.453, -1, 76.3], ['SO4', 'Sunfat', 'mg/L', 'anion', 96.06, -2, 80],
  ['NO3', 'Nitrat', 'mgN/L', 'anion', 14.007, -1, 71.4], ['NO2', 'Nitrit', 'mgN/L', 'anion', 14.007, -1, 71.8],
  ['F', 'Florua', 'mg/L', 'anion', 18.998, -1, 55.4], ['Br', 'Bromua', 'mg/L', 'anion', 79.904, -1, 78.1],
  ['PO4', 'Phosphat (ortho)', 'mgP/L', 'weak', 30.974, 0, 0], ['SiO2', 'Silica hòa tan', 'mg/L', 'weak', 60.08, 0, 0],
  ['B', 'Bo tổng', 'mgB/L', 'weak', 10.81, 0, 0], ['TIC', 'Carbon vô cơ tổng', 'mmol/L', 'weak', 12.011, 0, 0],
  ['Fe3', 'Sắt(III) hòa tan', 'mg/L', 'metal', 55.845, 0, 0], ['Al', 'Nhôm hòa tan', 'mg/L', 'metal', 26.98, 0, 0],
  ['DOC', 'Carbon hữu cơ hòa tan', 'mgC/L', 'org', 12, 0, 0], ['BDOC', 'DOC phân hủy sinh học', 'mgC/L', 'org', 12, 0, 0],
  ['POC', 'Carbon hữu cơ dạng hạt', 'mgC/L', 'org', 12, 0, 0], ['UV254', 'Hấp thụ UV 254 nm', '1/cm', 'org', 1, 0, 0],
  ['SSi', 'Chất rắn lơ lửng vô cơ (gốc)', 'mg/L', 'part', 1, 0, 0], ['FeOH3', 'Kết tủa Fe(OH)₃', 'mg/L', 'part', 106.87, 0, 0],
  ['AlOH3', 'Kết tủa Al(OH)₃', 'mg/L', 'part', 78.0, 0, 0], ['CaCO3s', 'Kết tủa CaCO₃', 'mg/L', 'part', 100.09, 0, 0],
  ['MgOH2', 'Kết tủa Mg(OH)₂', 'mg/L', 'part', 58.32, 0, 0], ['MnO2', 'Kết tủa MnO₂', 'mg/L', 'part', 86.94, 0, 0],
  ['PACs', 'Than hoạt tính bột', 'mg/L', 'part', 1, 0, 0], ['Pads', 'P hấp phụ trên kết tủa', 'mgP/L', 'part', 30.974, 0, 0],
  ['CaF2c', 'CaF₂ dạng keo (mới kết tủa)', 'mg/L', 'part', 78.075, 0, 0], ['CaF2s', 'CaF₂ đã keo tụ (bông)', 'mg/L', 'part', 78.075, 0, 0],
  ['Cl2f', 'Clo tự do (HOCl+OCl⁻)', 'mgCl₂/L', 'ox', 70.9, 0, 0], ['NH2Cl', 'Monocloramin', 'mgCl₂/L', 'ox', 70.9, 0, 0],
  ['NHCl2', 'Dicloramin', 'mgCl₂/L', 'ox', 70.9, 0, 0], ['NCl3', 'Tricloramin', 'mgCl₂/L', 'ox', 70.9, 0, 0],
  ['O3', 'Ozone hòa tan', 'mg/L', 'ox', 48, 0, 0], ['H2O2', 'Hydro peroxit', 'mg/L', 'ox', 34.01, 0, 0],
  ['THM', 'Trihalomethan', 'µg/L', 'dbp', 1, 0, 0], ['BrO3', 'Bromat', 'µg/L', 'dbp', 1, 0, 0],
  ['O2', 'Oxy hòa tan', 'mg/L', 'gas', 32, 0, 0], ['CH4', 'Methan hòa tan', 'mg/L', 'gas', 16, 0, 0], ['H2S', 'Sulfua tổng', 'mgS/L', 'gas', 32.06, 0, 0],
  ['ClD', 'Nhu cầu clo nhanh còn lại (NOM)', 'mgCl₂/L', 'ox', 70.9, 0, 0],
  ['AS', 'Chất chống cáu cặn', 'mg/L', 'chem', 1, 0, 0], ['Poly', 'Polymer trợ keo tụ', 'mg/L', 'chem', 1, 0, 0], ['cond', 'Mức keo tụ (0–1)', '-', 'chem', 1, 0, 0],
  ['Ecoli', 'E. coli', 'log CFU/100mL', 'micro', 1, 0, 0], ['Giardia', 'Giardia', 'log nang/L', 'micro', 1, 0, 0],
  ['Crypto', 'Cryptosporidium', 'log noãn nang/L', 'micro', 1, 0, 0], ['Virus', 'Virus', 'log/L', 'micro', 1, 0, 0],
  ['PFOA', 'PFOA', 'ng/L', 'mp', 1, 0, 0], ['PFOS', 'PFOS', 'ng/L', 'mp', 1, 0, 0], ['MP', 'Vi chất ô nhiễm đại diện', 'ng/L', 'mp', 1, 0, 0]
];
WQ.KEYS = WQ.DEF.map(d => d[0]);
WQ.D = {}; WQ.DEF.forEach(d => (WQ.D[d[0]] = { k: d[0], name: d[1], u: d[2], g: d[3], M: d[4], z: d[5], lam: d[6] }));
WQ.LOGK = new Set(['Ecoli', 'Giardia', 'Crypto', 'Virus']);   // lưu dạng log10 – hòa trộn theo tuyến tính

WQ.make = (o = {}) => {
  const w = { Q: 0, T: 20 };
  for (const k of WQ.KEYS) w[k] = WQ.LOGK.has(k) ? -9 : 0;
  return Object.assign(w, o);
};
WQ.copy = w => Object.assign({}, w);

/* hòa trộn theo lưu lượng (vi sinh: theo số lượng tuyến tính) */
WQ.mix = (list) => {
  const out = WQ.make();
  let q = 0, qt = 0;
  for (const s of list) { if (!s || !(s.Q > 0)) continue; q += s.Q; qt += s.Q * s.T; }
  if (!(q > 0)) { const w = WQ.make(); if (list[0]) w.T = list[0].T; return w; }
  out.Q = q; out.T = qt / q;
  for (const k of WQ.KEYS) {
    let a = 0;
    for (const s of list) if (s && s.Q > 0) a += s.Q * (WQ.LOGK.has(k) ? Math.pow(10, s[k] === undefined ? -9 : s[k]) : (s[k] || 0));
    out[k] = WQ.LOGK.has(k) ? Math.log10(Math.max(a / q, 1e-12)) : a / q;
  }
  return out;
};
WQ.scale = (w, Q) => Object.assign(WQ.copy(w), { Q });

/* ---------------------------------------------------------------- hằng số */
WQ.K = function (T) {
  const TK = T + 273.15, l10 = Math.log10(TK);
  const pKw = 4470.99 / TK - 6.0875 + 0.01706 * TK;
  // Plummer & Busenberg (1982)
  const pK1 = -(-356.3094 - 0.06091964 * TK + 21834.37 / TK + 126.8339 * l10 - 1684915 / (TK * TK));
  const pK2 = -(-107.8871 - 0.03252849 * TK + 5151.79 / TK + 38.92561 * l10 - 563713.9 / (TK * TK));
  const pKsC = -(-171.9065 - 0.077993 * TK + 2839.319 / TK + 71.595 * l10);   // calcite
  const pKN = 0.09018 + 2729.92 / TK;
  const pKHOCl = 3000 / TK - 10.0686 + 0.0253 * TK;                           // Morris (1966)
  const lnKH = -58.0931 + 90.5069 * (100 / TK) + 22.294 * Math.log(TK / 100); // CO2 Henry mol/(L·atm)
  const A = 0.4918 + 6.6098e-4 * T + 5.0231e-6 * T * T;                       // Davies A(T)
  const vh = dH => Math.exp(dH / 8.314 * (1 / 298.15 - 1 / TK));              // van 't Hoff từ 25 °C
  return {
    TK, A, Kw: 10 ** -pKw, K1: 10 ** -pK1, K2: 10 ** -pK2, KN: 10 ** -pKN, KHOCl: 10 ** -pKHOCl,
    KP1: 10 ** -2.15, KP2: 10 ** -7.20, KP3: 10 ** -12.35, KSi: 10 ** -9.84, KB: 10 ** -(9.24 - 0.006 * (T - 25)), KH2S: 10 ** -7.0,
    KHF: 10 ** -3.17,                                                            // HF ⇌ H⁺ + F⁻
    KsCal: 10 ** -pKsC, KsGyp: 10 ** -(4.58 + 0.005 * (T - 25)), KsBar: 10 ** -9.97, KsCel: 10 ** -6.63, KsFlu: 10 ** -10.5 * vh(8000), KsBru: 10 ** -11.16,
    SiSat: Math.pow(10, -731 / TK + 4.52),                                       // mg SiO2/L (silica vô định hình)
    KHco2: Math.exp(lnKH)
  };
};
WQ.gam = (I, A, z) => Math.pow(10, -A * z * z * (Math.sqrt(I) / (1 + Math.sqrt(I)) - 0.3 * I));

/* nồng độ mol/L của các ion mạnh */
const _mm = (w, k) => Math.max(w[k] || 0, 0) / 1000 / WQ.D[k].M;

/* ---------------------------------------------------------------- phân bố & pH */
WQ.solve = function (w, opt = {}) {
  const K = WQ.K(w.T);
  const c = {}; for (const k of ['Ca', 'Mg', 'Na', 'K', 'Fe2', 'Mn', 'Ba', 'Sr', 'Cl', 'SO4', 'NO3', 'NO2', 'F', 'Br', 'NH4', 'PO4', 'SiO2', 'B']) c[k] = _mm(w, k);
  const CT = Math.max(w.TIC, 0) / 1000, HOClt = Math.max(w.Cl2f, 0) / 70900, H2St = Math.max(w.H2S, 0) / 32060;
  const strongCat = 2 * (c.Ca + c.Mg + c.Fe2 + c.Mn + c.Ba + c.Sr) + c.Na + c.K;
  const strongAn = c.Cl + 2 * c.SO4 + c.NO3 + c.NO2 + c.Br;
  let I = Math.max(0.5 * (4 * (c.Ca + c.Mg + c.Fe2 + c.Mn + c.Ba + c.Sr + c.SO4) + c.Na + c.K + c.Cl + c.NO3 + c.NO2 + c.F + c.Br + CT), 1e-6);
  let pH = opt.pH0 || 7, sp = null;
  for (let it = 0; it < 4; it++) {
    const g1 = WQ.gam(I, K.A, 1), g2 = WQ.gam(I, K.A, 2), g3 = WQ.gam(I, K.A, 3);
    const K1 = K.K1 / g1, K12 = K.K1 * K.K2 / g2, KN = K.KN * g1, Kw = K.Kw / g1;
    const P1 = K.KP1 / g1, P12 = K.KP1 * K.KP2 / g2, P123 = K.KP1 * K.KP2 * K.KP3 / g3;
    const KSi = K.KSi / g1, KB = K.KB / g1, KHO = K.KHOCl / g1, KHS = K.KH2S / g1, KF = K.KHF / g1;
    const spec = aH => {
      const D3 = aH * aH + aH * K1 + K12, hco3 = CT * aH * K1 / D3, co3 = CT * K12 / D3;
      const DP = aH * aH * aH + aH * aH * P1 + aH * P12 + P123;
      const h2po4 = c.PO4 * aH * aH * P1 / DP, hpo4 = c.PO4 * aH * P12 / DP, po4 = c.PO4 * P123 / DP;
      return {
        h: aH / g1, oh: Kw / aH, hco3, co3, co2: CT - hco3 - co3, nh4: c.NH4 * aH / (aH + KN),
        h2po4, hpo4, po4, sio3: c.SiO2 * KSi / (aH + KSi), bo4: c.B * KB / (aH + KB), ocl: HOClt * KHO / (aH + KHO), hs: H2St * KHS / (aH + KHS),
        f: c.F * KF / (aH + KF)
      };
    };
    const bal = aH => {
      const s = spec(aH);
      return strongCat + s.nh4 + s.h - strongAn - s.f - s.hco3 - 2 * s.co3 - s.oh - s.h2po4 - 2 * s.hpo4 - 3 * s.po4 - s.sio3 - s.bo4 - s.ocl - s.hs;
    };
    let lo = 0, hi = 14;
    for (let k = 0; k < 60; k++) { const mid = 0.5 * (lo + hi); if (bal(10 ** -mid) > 0) lo = mid; else hi = mid; }
    pH = 0.5 * (lo + hi);
    sp = spec(10 ** -pH);
    const In = 0.5 * (4 * (c.Ca + c.Mg + c.Fe2 + c.Mn + c.Ba + c.Sr + c.SO4 + sp.co3 + sp.hpo4) + 9 * sp.po4 + c.Na + c.K + c.Cl + c.NO3 + c.NO2 + sp.f + c.Br
      + sp.hco3 + sp.oh + sp.h + sp.nh4 + sp.h2po4 + sp.sio3 + sp.bo4 + sp.ocl + sp.hs);
    if (Math.abs(In - I) < 1e-7) { I = In; break; }
    I = In;
  }
  const g1 = WQ.gam(I, K.A, 1), g2 = WQ.gam(I, K.A, 2);
  const r = { pH, I, g1, g2, K, sp, c };
  // độ kiềm, độ cứng, TDS, EC
  r.alk = 50 * 1000 * (sp.hco3 + 2 * sp.co3 + sp.oh - sp.h);                     // mg CaCO3/L
  r.hard = 2.497 * w.Ca + 4.118 * w.Mg;
  r.caHard = 2.497 * w.Ca;
  r.CO2 = 44000 * sp.co2;
  r.NH3 = 14000 * (c.NH4 - sp.nh4);
  const tds = w.Ca + w.Mg + w.Na + w.K + w.Fe2 + w.Mn + w.Ba + w.Sr + w.NH4 * 18.04 / 14.007 + w.Cl + w.SO4 + w.NO3 * 62 / 14.007 + w.NO2 * 46 / 14.007
    + w.F + w.Br + w.PO4 * 94.97 / 30.974 + w.SiO2 + w.B * 61.83 / 10.81 + 61017 * sp.hco3 * 0.4917 + 60009 * sp.co3;
  r.TDS = Math.max(tds, 0);
  const meq = k => Math.abs(WQ.D[k].z) * _mm(w, k) * 1000;
  let ec = 0;
  for (const k of ['Ca', 'Mg', 'Na', 'K', 'Fe2', 'Mn', 'Ba', 'Sr', 'Cl', 'SO4', 'NO3', 'NO2', 'F', 'Br']) ec += WQ.D[k].lam * meq(k);
  ec += 73.5 * sp.nh4 * 1000 + 349.8 * sp.h * 1000 + 198 * sp.oh * 1000 + 44.5 * sp.hco3 * 1000 + 69.3 * 2 * sp.co3 * 1000 + 36 * sp.h2po4 * 1000 + 57 * 2 * sp.hpo4 * 1000;
  r.EC = ec * Math.max(1 - 0.7 * Math.sqrt(I), 0.3);                             // µS/cm ở 25 °C (gần đúng)
  // chỉ số bão hòa
  // cặp ion (CaSO4°, MgSO4°, NaSO4⁻, CaCO3°, MgCO3°, CaHCO3⁺, MgHCO3⁺, BaSO4°, SrSO4°) – chỉ dùng cho chỉ số bão hòa
  const KP = { CaS: 10 ** 2.30, MgS: 10 ** 2.37, NaS: 10 ** 0.70, CaC: 10 ** 3.22, MgC: 10 ** 2.98, CaH: 10 ** 1.11, MgH: 10 ** 1.07, BaS: 10 ** 2.7, SrS: 10 ** 2.29 };
  const g22 = g2 * g2;
  let Caf = c.Ca, Mgf = c.Mg, Naf = c.Na, Baf = c.Ba, Srf = c.Sr, Sf = c.SO4, Cf = sp.co3, Hf = sp.hco3;
  for (let k = 0; k < 30; k++) {
    Caf = c.Ca / (1 + KP.CaS * g22 * Sf + KP.CaC * g22 * Cf + KP.CaH * g2 * Hf);
    Mgf = c.Mg / (1 + KP.MgS * g22 * Sf + KP.MgC * g22 * Cf + KP.MgH * g2 * Hf);
    Naf = c.Na / (1 + KP.NaS * g2 * Sf);
    Baf = c.Ba / (1 + KP.BaS * g22 * Sf); Srf = c.Sr / (1 + KP.SrS * g22 * Sf);
    Sf = c.SO4 / (1 + g22 * (KP.CaS * Caf + KP.MgS * Mgf + KP.BaS * Baf + KP.SrS * Srf) + KP.NaS * g2 * Naf);
    Cf = sp.co3 / (1 + g22 * (KP.CaC * Caf + KP.MgC * Mgf));
    Hf = sp.hco3 / (1 + g2 * (KP.CaH * Caf + KP.MgH * Mgf));
  }
  r.free = { Ca: Caf / Math.max(c.Ca, 1e-30), SO4: Sf / Math.max(c.SO4, 1e-30), CO3: Cf / Math.max(sp.co3, 1e-30) };
  const aCa = Caf * g2, aCO3 = Cf * g2, aSO4 = Sf * g2, aF = sp.f * g1, aOH = sp.oh * g1;
  r.aCaF = [aCa, aF];   // hoạt độ Ca²⁺ tự do và F⁻ cho động học kết tủa fluorit
  const lg = x => x > 0 ? Math.log10(x) : -99;
  r.SIcal = lg(aCa * aCO3 / K.KsCal);
  r.LSI = r.SIcal;
  r.pHs = pH - r.LSI;
  r.RSI = 2 * r.pHs - pH;
  r.SIgyp = lg(aCa * aSO4 / K.KsGyp);
  r.SIbar = lg(Baf * g2 * aSO4 / K.KsBar);
  r.SIcel = lg(Srf * g2 * aSO4 / K.KsCel);
  r.SIflu = lg(aCa * aF * aF / K.KsFlu);
  r.SIbru = lg(Mgf * g2 * aOH * aOH / K.KsBru);
  r.SiSat = K.SiSat;
  r.silicaPct = w.SiO2 > 0 ? (w.SiO2 * (1 - sp.sio3 / Math.max(c.SiO2, 1e-30))) / K.SiSat * 100 : 0;
  // áp suất thẩm thấu (bar), φ = 0,93
  const mol = c.Ca + c.Mg + c.Fe2 + c.Mn + c.Ba + c.Sr + c.Na + c.K + c.Cl + c.SO4 + c.NO3 + c.NO2 + c.F + c.Br + c.NH4 + c.PO4 + c.SiO2 + c.B + CT;
  r.osm = 0.93 * 0.08314 * K.TK * mol;
  r.UVT = Math.pow(10, -Math.max(w.UV254, 0)) * 100;
  r.SUVA = w.DOC > 0 ? w.UV254 * 100 / w.DOC : 0;
  r.TSS = WQ.tss(w);
  r.turb = WQ.ntu(w);
  r.TOC = w.DOC + w.POC;
  r.Cl2tot = w.Cl2f + w.NH2Cl + w.NHCl2 + w.NCl3;
  r.TN = w.NH4 + w.NO3 + w.NO2;
  return r;
};
WQ.tss = w => Math.max(w.SSi + w.FeOH3 + w.AlOH3 + w.CaCO3s + w.MgOH2 + w.MnO2 + w.PACs + 2.2 * w.POC + w.Pads * 3.1 + (w.CaF2c || 0) + (w.CaF2s || 0), 0);
/* độ đục (NTU) quy đổi từ các pha rắn: đất sét/phù sa ~0,5 NTU per mg/L, bông hydroxit ~0,25, tinh thể ~0,1, keo CaF₂ mịn ~0,4 */
WQ.ntu = w => Math.max(0.5 * w.SSi + 0.25 * (w.FeOH3 + w.AlOH3 + w.MnO2) + 0.1 * (w.CaCO3s + w.MgOH2 + w.PACs + (w.CaF2s || 0)) + 0.4 * (w.POC + (w.CaF2c || 0)), 0);

/* sai số cân bằng ion (%) của số liệu phân tích ở pH & độ kiềm nhập */
WQ.ionBalance = function (w, pH) {
  const K = WQ.K(w.T), aH = 10 ** -pH;
  const c = k => _mm(w, k);
  const CT = w.TIC / 1000;
  const D3 = aH * aH + aH * K.K1 + K.K1 * K.K2;
  const cat = 2 * (c('Ca') + c('Mg') + c('Fe2') + c('Mn') + c('Ba') + c('Sr')) + c('Na') + c('K') + c('NH4') * aH / (aH + K.KN);
  const an = c('Cl') + 2 * c('SO4') + c('NO3') + c('NO2') + c('F') + c('Br') + CT * (aH * K.K1 + 2 * K.K1 * K.K2) / D3;
  return { cat: cat * 1000, an: an * 1000, err: (cat - an) / (cat + an) * 100 };
};

/* TIC từ pH & độ kiềm (mg CaCO3/L) */
WQ.ticFromAlk = function (alk, pH, T) {
  const K = WQ.K(T), aH = 10 ** -pH;
  const a1 = aH * K.K1 / (aH * aH + aH * K.K1 + K.K1 * K.K2), a2 = K.K1 * K.K2 / (aH * aH + aH * K.K1 + K.K1 * K.K2);
  const carbAlk = alk / 50000 - K.Kw / aH + aH;     // mol/L
  return Math.max(carbAlk / (a1 + 2 * a2), 0) * 1000; // mmol/L
};

/* cân bằng điện tích của phân tích nhập (pH đo) bằng Na hoặc Cl để pH tính = pH đo */
WQ.balanceTo = function (w, pH, ion) {
  const target = pH;
  const f = d => { const x = WQ.copy(w); x[ion] = Math.max((w[ion] || 0) + d, 0); return WQ.solve(x).pH - target; };
  let lo = -(w[ion] || 0), hi = 5000;
  // pH tăng khi thêm Na, giảm khi thêm Cl
  const sgn = ion === 'Na' ? 1 : -1;
  for (let k = 0; k < 80; k++) { const mid = 0.5 * (lo + hi); if (sgn * f(mid) > 0) hi = mid; else lo = mid; }
  const d = 0.5 * (lo + hi);
  const x = WQ.copy(w); x[ion] = Math.max((w[ion] || 0) + d, 0);
  return { w: x, delta: d };
};

/* CCPP: lượng CaCO3 kết tủa (+) / hòa tan (−) để đạt cân bằng calcite (mg/L), hệ kín */
WQ.ccpp = function (w) {
  const f = x => { const y = WQ.copy(w); y.Ca = w.Ca - x * 40.078; y.TIC = w.TIC - x; return WQ.solve(y).SIcal; };   // x mmol/L
  const s0 = f(0);
  if (Math.abs(s0) < 1e-4) return 0;
  let lo, hi;
  if (s0 > 0) { lo = 0; hi = Math.min(w.Ca / 40.078, w.TIC) * 0.999; } else { lo = -10; hi = 0; }
  for (let k = 0; k < 60; k++) { const mid = 0.5 * (lo + hi); if (f(mid) > 0) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi) * 100.09;
};

/* kết tủa CaCO3 (hệ kín) tới SI mục tiêu; trả về mmol/L đã kết tủa */
WQ.precipCalcite = function (w, SItarget = 0) {
  const s0 = WQ.solve(w).SIcal;
  if (s0 <= SItarget) return 0;
  const f = x => { const y = WQ.copy(w); y.Ca = w.Ca - x * 40.078; y.TIC = w.TIC - x; return WQ.solve(y).SIcal - SItarget; };
  let lo = 0, hi = Math.min(w.Ca / 40.078, w.TIC) * 0.999;
  for (let k = 0; k < 50; k++) { const mid = 0.5 * (lo + hi); if (f(mid) > 0) lo = mid; else hi = mid; }
  const x = 0.5 * (lo + hi);
  w.Ca -= x * 40.078; w.TIC -= x; w.CaCO3s += x * 100.09;
  return x;
};
/* kết tủa Mg(OH)2 tới bão hòa brucite */
WQ.precipBrucite = function (w) {
  const s0 = WQ.solve(w).SIbru;
  if (s0 <= 0) return 0;
  const f = x => { const y = WQ.copy(w); y.Mg = w.Mg - x * 24.305; return WQ.solve(y).SIbru; };
  let lo = 0, hi = w.Mg / 24.305 * 0.999;
  for (let k = 0; k < 50; k++) { const mid = 0.5 * (lo + hi); if (f(mid) > 0) lo = mid; else hi = mid; }
  const x = 0.5 * (lo + hi);
  w.Mg -= x * 24.305; w.MgOH2 += x * 58.32;
  return x;
};
/* ---- Kết tủa fluorit CaF₂ (động học theo lực đẩy quá bão hòa, tự cài đặt) ----
   r_prec = q_P · DF²  [g CaF₂/m³/d],  DF = ((a_Ca·a_F²)^(1/3) − Ksp^(1/3)) / Ksp^(1/3)
   r_diss = q_D · CaF2c/(K_D + CaF2c)  khi DF < 0 (chỉ keo mới tạo hòa tan lại)
   keo tụ CaF₂ keo → bông: (q_Fe·Fe(OH)₃ + q_Al·(Al(OH)₃+PACl) + q_Pol·Polymer) · CaF2c/(K_C + CaF2c)
   Thông số mặc định theo dạng công bố trong tài liệu mô hình nước (q_P = q_D = 500 g/m³/d, q_C = 1000 1/d, K = 0,01 g/m³). */
WQ.FLU = { qP: 500, qD: 500, KD: 0.01, qFe: 1000, qAl: 1000, qPol: 200, KC: 0.01 };
WQ.fluDF = function (w) {
  const s = WQ.solve(w), [aCa, aF] = s.aCaF, k3 = Math.cbrt(s.K.KsFlu);
  return (Math.cbrt(aCa * aF * aF) - k3) / k3;
};
/* chuyển x mg/L CaF₂ từ hòa tan sang keo (x < 0: keo hòa tan lại) */
WQ.moveCaF2 = (w, x) => { w.Ca -= x * 40.078 / 78.075; w.F -= x * 2 * 18.998 / 78.075; w.CaF2c = (w.CaF2c || 0) + x; };
/* một bể khuấy trộn hoàn toàn ổn định, thời gian lưu tau (ngày): giải cân bằng khối lượng bằng chia đôi */
WQ.fluoriteCSTR = function (w, tau, par = {}) {
  const P = Object.assign({}, WQ.FLU, par);
  w.CaF2c = w.CaF2c || 0; w.CaF2s = w.CaF2s || 0;
  const rate = y => { const DF = WQ.fluDF(y); return DF > 0 ? P.qP * DF * DF : -P.qD * y.CaF2c / (P.KD + y.CaF2c); };
  const g = x => { const y = WQ.copy(w); WQ.moveCaF2(y, x); return x / tau - rate(y); };
  let lo = -w.CaF2c, hi = Math.max(Math.min(w.Ca * 78.075 / 40.078, w.F * 78.075 / (2 * 18.998)) * 0.9999, 0);
  let x = 0;
  if (g(0) < 0) { lo = 0; } else { hi = 0; }
  if (hi > lo) { for (let k = 0; k < 60; k++) { const mid = 0.5 * (lo + hi); if (g(mid) < 0) lo = mid; else hi = mid; } x = 0.5 * (lo + hi); }
  WQ.moveCaF2(w, x);
  // keo tụ keo CaF₂ trên bông hydroxit kim loại / polymer: (c0 − c)/τ = R·c/(K + c)
  const R = P.qFe * (w.FeOH3 || 0) + P.qAl * (w.AlOH3 || 0) + P.qPol * (w.Poly || 0);
  const c0 = w.CaF2c;
  let c = c0;
  if (R > 0 && c0 > 0) {
    const b = R * tau + P.KC - c0;          // c² + b·c − K·c0 = 0
    c = Math.max((-b + Math.sqrt(b * b + 4 * P.KC * c0)) / 2, 0);
  }
  w.CaF2c = c; w.CaF2s += c0 - c;
  return { prec: x, coag: c0 - c, DF: WQ.fluDF(w) };
};

/* độ hòa tan Fe(III) và Al (mg/L) theo pH – ferrihydrit, Al(OH)3 vô định hình */
WQ.feSol = pH => 55845 * Math.pow(10, 3.2 - 3 * pH) * (1 + Math.pow(10, pH - 2.19) + Math.pow(10, 2 * pH - 5.67) + Math.pow(10, 4 * pH - 21.6));
WQ.alSol = pH => 26980 * (Math.pow(10, 10.8 - 3 * pH) + Math.pow(10, -12.4 + pH) + Math.pow(10, 10.8 - 3 * pH + pH - 4.97));
/* đưa kim loại hòa tan về giới hạn hòa tan (kết tủa phần dư) */
WQ.precipMetals = function (w) {
  const pH = WQ.solve(w).pH;
  const fe = WQ.feSol(pH), al = WQ.alSol(pH);
  if (w.Fe3 > fe) { const d = w.Fe3 - fe; w.Fe3 = fe; w.FeOH3 += d * 106.87 / 55.845; }
  else if (w.FeOH3 > 0 && w.Fe3 < fe) { const d = Math.min(fe - w.Fe3, w.FeOH3 * 55.845 / 106.87); w.Fe3 += d; w.FeOH3 -= d * 106.87 / 55.845; }
  if (w.Al > al) { const d = w.Al - al; w.Al = al; w.AlOH3 += d * 78.0 / 26.98; }
  else if (w.AlOH3 > 0 && w.Al < al) { const d = Math.min(al - w.Al, w.AlOH3 * 26.98 / 78); w.Al += d; w.AlOH3 -= d * 78 / 26.98; }
};

/* tính lượng thêm (mmol/L) một tác nhân để đạt pH mục tiêu – tác nhân là hàm add(w, x) */
WQ.solveDose = function (w, add, pHtarget, maxX) {
  const f = x => { const y = WQ.copy(w); add(y, x); return WQ.solve(y).pH - pHtarget; };
  const f0 = f(0), fm = f(maxX);
  if (f0 * fm > 0) return Math.abs(f0) < Math.abs(fm) ? 0 : maxX;
  let lo = 0, hi = maxX;
  for (let k = 0; k < 60; k++) { const mid = 0.5 * (lo + hi); if (f(mid) * f0 > 0) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
};

/* bảng tổng hợp chỉ tiêu để hiển thị */
WQ.SUMMARY = [
  ['Q', 'Lưu lượng', 'm³/d'], ['T', 'Nhiệt độ', '°C'], ['pH', 'pH', '-'], ['alk', 'Độ kiềm', 'mgCaCO₃/L'], ['hard', 'Độ cứng tổng', 'mgCaCO₃/L'],
  ['TDS', 'TDS', 'mg/L'], ['EC', 'Độ dẫn điện (25 °C)', 'µS/cm'], ['turb', 'Độ đục', 'NTU'], ['TSS', 'TSS', 'mg/L'],
  ['TOC', 'TOC', 'mgC/L'], ['DOC', 'DOC', 'mgC/L'], ['UVT', 'UVT (1 cm)', '%'], ['SUVA', 'SUVA', 'L/mg·m'],
  ['NH4', 'Amoni', 'mgN/L'], ['NO3', 'Nitrat', 'mgN/L'], ['NO2', 'Nitrit', 'mgN/L'], ['PO4', 'Phosphat', 'mgP/L'], ['F', 'Florua', 'mg/L'],
  ['Fe', 'Sắt tổng', 'mg/L'], ['Mn', 'Mangan tổng', 'mg/L'], ['Al', 'Nhôm tổng', 'mg/L'],
  ['Cl2f', 'Clo tự do', 'mgCl₂/L'], ['Cl2tot', 'Clo tổng', 'mgCl₂/L'], ['THM', 'THM', 'µg/L'], ['BrO3', 'Bromat', 'µg/L'],
  ['ClD', 'Nhu cầu clo nhanh còn lại (NOM)', 'mgCl₂/L', 'ox', 70.9, 0, 0],
  ['AS', 'Chất chống cáu cặn', 'mg/L', 'chem', 1, 0, 0], ['Poly', 'Polymer trợ keo tụ', 'mg/L', 'chem', 1, 0, 0], ['cond', 'Mức keo tụ (0–1)', '-', 'chem', 1, 0, 0],
  ['Ecoli', 'E. coli', 'CFU/100mL'], ['Crypto', 'Cryptosporidium', 'noãn nang/L'], ['Giardia', 'Giardia', 'nang/L'], ['Virus', 'Virus', 'PFU/L'],
  ['LSI', 'LSI', '-'], ['CCPP', 'CCPP', 'mgCaCO₃/L'], ['osm', 'Áp suất thẩm thấu', 'bar']
];
WQ.value = function (w, key, sol) {
  const s = sol || WQ.solve(w);
  switch (key) {
    case 'Fe': return w.Fe2 + w.Fe3 + w.FeOH3 * 55.845 / 106.87;
    case 'Mn': return w.Mn + w.MnO2 * 54.938 / 86.94;
    case 'Al': return w.Al + w.AlOH3 * 26.98 / 78;
    case 'CCPP': return WQ.ccpp(w);
    case 'Q': case 'T': return w[key];
    default: return typeof s[key] === 'number' ? s[key] : w[key];
  }
};
