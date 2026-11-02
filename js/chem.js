'use strict';
/* ==========================================================================
   SimXLNT – Hóa học cân bằng: pH, phân bố carbonat/amoni/phosphat/acetat,
   bão hòa CO₂.  Đơn vị nội bộ: mol/L; biến mô hình: g/m³, mol/m³.
   Cân bằng điện tích:  Z + [NH4+] + [H+] − [HCO3−] − 2[CO3²−] − [OH−] − [Ac−] − ΣP − [NO3−] = 0
   Z (mol/m³) = SALK + SNO/14 + 1,5·SPO4/31 + SA/64 − SNH/14  (bất biến với các phản ứng ASM)
   ========================================================================== */
const CHEM = { _kc: {} };

CHEM.K = function (T) {
  const key = Math.round(T * 100);
  if (CHEM._kc[key]) return CHEM._kc[key];
  const TK = T + 273.15;
  const pKw = 4470.99 / TK - 6.0875 + 0.01706 * TK;            // Harned & Owen
  const pK1 = 3404.71 / TK - 14.8435 + 0.032786 * TK;          // Harned & Davis
  const pK2 = 2902.39 / TK - 6.4980 + 0.02379 * TK;            // Harned & Scholes
  const pKN = 0.09018 + 2729.92 / TK;                          // Emerson et al. 1975
  const lnKH = -58.0931 + 90.5069 * (100 / TK) + 22.294 * Math.log(TK / 100); // Weiss 1974, mol/(L·atm)
  const K = {
    Kw: 10 ** -pKw, K1: 10 ** -pK1, K2: 10 ** -pK2, KN: 10 ** -pKN, KA: 10 ** -4.76,
    KP1: 10 ** -2.15, KP2: 10 ** -7.20, KP3: 10 ** -12.35, KH: Math.exp(lnKH)
  };
  CHEM._kc[key] = K;
  return K;
};

/* các thành phần ion (mol/L) của một vector trạng thái mô hình */
CHEM.ions = function (m, x) {
  const I = m.idx;
  const alk = x[I[m.ALK]], nh = Math.max(x[I[m.NH]], 0), no = Math.max(x[I[m.NO]], 0) + (m.NO2 ? Math.max(x[I[m.NO2]], 0) : 0);   // NO₂⁻ (ASM1N) cùng điện tích với NO₃⁻
  const po = m.PO ? Math.max(x[I[m.PO]], 0) : 0, ac = I.SA !== undefined ? Math.max(x[I.SA], 0) : 0;
  const tic = Math.max(x[I.STIC], 0);
  return {
    z: (alk + no / 14 + 1.5 * po / 31 + ac / 64 - nh / 14) / 1000,
    n: nh / 14000, no: no / 14000, p: po / 31000, a: ac / 64000, c: tic / 1000
  };
};

/* g(h) và dg/dh */
function _chg(s, K, h) {
  const D3 = h * h + K.K1 * h + K.K1 * K.K2, N3 = K.K1 * h + 2 * K.K1 * K.K2;
  const N6 = K.KP1 * h * h + 2 * K.KP1 * K.KP2 * h + 3 * K.KP1 * K.KP2 * K.KP3;
  const D6 = h * h * h + K.KP1 * h * h + K.KP1 * K.KP2 * h + K.KP1 * K.KP2 * K.KP3;
  const g = s.z + s.n * h / (h + K.KN) + h - s.c * N3 / D3 - K.Kw / h - s.a * K.KA / (h + K.KA) - s.p * N6 / D6 - s.no;
  const dg = s.n * K.KN / ((h + K.KN) ** 2) + 1
    - s.c * (K.K1 * D3 - N3 * (2 * h + K.K1)) / (D3 * D3)
    + K.Kw / (h * h) + s.a * K.KA / ((h + K.KA) ** 2)
    - s.p * ((2 * K.KP1 * h + 2 * K.KP1 * K.KP2) * D6 - N6 * (3 * h * h + 2 * K.KP1 * h + K.KP1 * K.KP2)) / (D6 * D6);
  return [g, dg];
}

/* giải pH (Newton có bảo vệ khoảng) */
CHEM.solve = function (s, K, pH0) {
  let lo = 0, hi = 14, x = pH0 && isFinite(pH0) ? pH0 : 7;
  for (let it = 0; it < 60; it++) {
    const h = Math.pow(10, -x);
    const [g, dgh] = _chg(s, K, h);
    if (g > 0) lo = x; else hi = x;            // g giảm theo pH: dư điện tích dương → pH phải cao hơn
    const dgx = dgh * (-Math.LN10 * h);
    let xn = dgx !== 0 ? x - g / dgx : NaN;
    if (!(xn > lo && xn < hi)) xn = 0.5 * (lo + hi);
    if (Math.abs(xn - x) < 1e-12) { x = xn; break; }
    x = xn;
  }
  return x;
};

CHEM.pH = function (m, x, T, pH0) { return CHEM.solve(CHEM.ions(m, x), CHEM.K(T), pH0); };

/* phân số CO2 tự do trong TIC */
CHEM.a0 = function (pH, K) { const h = 10 ** -pH; return h * h / (h * h + K.K1 * h + K.K1 * K.K2); };
/* CO2 bão hòa (mol/m³) với áp suất riêng phần pCO2 (atm) */
CHEM.co2sat = function (T, pCO2) { return CHEM.K(T).KH * pCO2 * 1000; };

/* TIC (mol/m³) để vector x có pH cho trước */
CHEM.ticFromPH = function (m, x, T, pH) {
  const s = CHEM.ions(m, x), K = CHEM.K(T), h = 10 ** -pH;
  const rest = s.z + s.n * h / (h + K.KN) + h - K.Kw / h - s.a * K.KA / (h + K.KA)
    - s.p * (K.KP1 * h * h + 2 * K.KP1 * K.KP2 * h + 3 * K.KP1 * K.KP2 * K.KP3) / (h * h * h + K.KP1 * h * h + K.KP1 * K.KP2 * h + K.KP1 * K.KP2 * K.KP3) - s.no;
  const f = (K.K1 * h + 2 * K.K1 * K.K2) / (h * h + K.K1 * h + K.K1 * K.K2);
  return Math.max(rest / f * 1000, 0);
};

/* phân bố chi tiết để báo cáo */
CHEM.speciate = function (m, x, T) {
  const s = CHEM.ions(m, x), K = CHEM.K(T), pH = CHEM.solve(s, K, 7), h = 10 ** -pH;
  const D3 = h * h + K.K1 * h + K.K1 * K.K2;
  return {
    pH,
    CO2: s.c * h * h / D3 * 44000,                 // mg CO2/L
    HCO3: s.c * K.K1 * h / D3 * 61000,             // mg HCO3/L
    NH3: s.n * K.KN / (h + K.KN) * 14000,          // mg N/L tự do
    HAc: s.a * h / (h + K.KA) * 64000,             // mg COD/L acid tự do
    alkReal: (s.c * (K.K1 * h + 2 * K.K1 * K.K2) / D3 + K.Kw / h - h + s.n * K.KN / (h + K.KN)) * 50000 // mg CaCO3/L
  };
};
