'use strict';
/* ==========================================================================
   SimNước – Động học phản ứng pha lỏng (bể tiếp xúc, bể chứa, ozone)
   Clo/cloramin (rút gọn theo Jafvert & Valentine 1992), nhu cầu clo NOM,
   oxy hóa Fe/Mn/NO2/H2S bằng O2–HOCl–O3, phân hủy O3/H2O2, THM,
   bất hoạt vi sinh theo CT (bảng EPA SWTR/LT2 nội suy).
   Tích phân dạng mẻ (dòng đẩy) – RK2/3 bước thích nghi; pH cập nhật định kỳ
   từ cân bằng điện tích nên axit sinh ra (HCl…) tự động làm giảm pH.
   ========================================================================== */
const WK = {};

/* bảng CT (mg·min/L) – nội suy theo nhiệt độ */
WK.interp = (tab, T) => {
  if (T <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (T <= tab[i][0]) { const [a, fa] = tab[i - 1], [b, fb] = tab[i]; return fa + (fb - fa) * (T - a) / (b - a); }
  return tab[tab.length - 1][1];
};
WK.CT = {
  // CT cho 3-log Giardia bằng clo tự do ở pH 7, C = 1 mg/L
  giaFree3: [[0.5, 165], [5, 149], [10, 112], [15, 75], [20, 56], [25, 37]],
  // CT cho 4-log virus bằng clo tự do (pH 6–9)
  virFree4: [[0.5, 12], [5, 8], [10, 6], [15, 4], [20, 3], [25, 2]],
  giaCam3: [[0.5, 3800], [5, 2200], [10, 1850], [15, 1500], [20, 1100], [25, 750]],
  virCam4: [[0.5, 2883], [5, 1988], [10, 1491], [15, 994], [20, 746], [25, 497]]
};
/* tốc độ bất hoạt (log / (mg·min/L)) */
WK.kFree = (T, pH, C) => {
  const fpH = Math.pow(Math.max(pH, 6) / 7, 2.7), fC = Math.pow(Math.max(C, 0.4), 0.15);
  return { Giardia: 3 / (WK.interp(WK.CT.giaFree3, T) * fpH * fC), Virus: 4 / WK.interp(WK.CT.virFree4, T), Ecoli: 4 / 0.25 * Math.pow(1.07, T - 20) / fpH, Crypto: 1 / 2600 };
};
WK.kCam = T => ({ Giardia: 3 / WK.interp(WK.CT.giaCam3, T), Virus: 4 / WK.interp(WK.CT.virCam4, T), Ecoli: 4 / 200 * Math.pow(1.05, T - 20), Crypto: 0 });
/* ozone – công thức EPA LT2 (log = k·CT) */
WK.kO3 = T => ({ Giardia: 1.038 * Math.pow(1.0741, T), Virus: 2.1744 * Math.pow(1.0726, T), Crypto: 0.0397 * Math.pow(1.09757, T), Ecoli: 10 });

WK.par = {
  k1: 4.2e6,     // HOCl + NH3 → NH2Cl  (M⁻¹s⁻¹)
  k2: 1.5e2,     // HOCl + NH2Cl → NHCl2
  k3: 1.0e4,     // NHCl2 + NH2Cl → N2 + 3HCl (gộp phản ứng điểm đột biến)
  k4: 30,        // HOCl + NHCl2 → NCl3
  kFd: 3,        // nhu cầu clo nhanh của NOM (L/mg/h)
  kFs: 0.012,    // phân hủy clo tự do chậm theo DOC (L/mgC/h)
  kCs: 0.0008,   // phân hủy cloramin theo DOC (L/mgC/h)
  yTHM: 25,      // µg THM / mg Cl2 tiêu thụ bởi NOM (20 °C, pH 7, Br⁻ ≈ 0)
  kFeO2: 1.33e12,// Fe²⁺ + O2: k[OH⁻]²pO2 (M⁻²atm⁻¹s⁻¹, Stumm & Lee)
  kMnO2: 2e7,    // Mn²⁺ + O2 (rất chậm khi pH < 9)
  kFeCl: 1e5, kMnCl: 20, kNO2Cl: 6e3, kH2SCl: 1e5,
  kFeO3: 8e5, kMnO3: 1.5e3, kNO2O3: 3.7e5,
  kdO3: 5e-4,    // phân hủy O3 (1/s ứng với DOC = 1 mgC/L, pH 7, 20 °C)
  kH2O2Cl: 1e3, kH2O2O3: 2.8e6
};

/* vận tốc phản ứng – c: mol/L (và mg/L cho các nhóm gộp) */
WK.integrate = function (w0, tSec, opt = {}) {
  const w = WQ.copy(w0), P = Object.assign({}, WK.par, opt.par || {});
  const out = { CTfree: 0, CTcam: 0, CTo3: 0, logs: { Giardia: 0, Virus: 0, Crypto: 0, Ecoli: 0 }, Cl2used: 0, O3used: 0, profile: [] };
  if (!(tSec > 0)) return { w, ...out };
  const BF = opt.BF === undefined ? 1 : opt.BF;          // hệ số dòng chảy cho CT (T10/T)
  const T = w.T, th = Math.pow(1.07, T - 20);
  const O2sat = 14.62 - 0.3898 * T + 0.006969 * T * T - 5.897e-5 * T * T * T;
  // biến: [HOCl_t, NH3_t, NH2Cl, NHCl2, NCl3, ClD, Fe2, Mn, NO2, H2S, O3, H2O2, O2]   (mol/L; ClD mg/L)
  const y = [w.Cl2f / 70900, w.NH4 / 14007, w.NH2Cl / 70900, w.NHCl2 / 141800, w.NCl3 / 212700, w.ClD, w.Fe2 / 55845, w.Mn / 54938, w.NO2 / 14007, w.H2S / 32060, w.O3 / 48000, w.H2O2 / 34010, w.O2 / 32000];
  const n = y.length;
  let pH = WQ.solve(w).pH, aH = 10 ** -pH;
  const K = WQ.K(T);
  let aHOCl = aH / (aH + K.KHOCl), aNH3 = K.KN / (aH + K.KN), OH = K.Kw / aH;
  let DOC = w.DOC;
  const kla = opt.kla || 0, O2eq = (opt.O2sat !== undefined ? opt.O2sat : O2sat) / 32000;
  const extra = { ClCons: 0, THM: 0, Cl: 0, SO4: 0, NO3: 0, Fe3: 0, MnO2: 0, NH4ret: 0, N2: 0 };
  const rates = (y, dy, acc) => {
    const [Cf, N, M, D, Tr, ClD, Fe, Mn, NO2, HS, O3, HP, O2] = y.map(v => Math.max(v, 0));
    const HOCl = aHOCl * Cf, NH3 = aNH3 * N;
    const r1 = P.k1 * HOCl * NH3, r2 = P.k2 * HOCl * M, r3 = P.k3 * D * M, r4 = P.k4 * HOCl * D;
    const kd = 2.5e7 * aH, r6 = kd * M * M;                                // phân ly cân bằng monocloramin
    const CfMg = Cf * 70900;
    const rFd = P.kFd / 3600 * CfMg * ClD;                                  // mg/L/s
    const rFs = P.kFs / 3600 * th * DOC * CfMg;                             // mg/L/s
    const rCs = P.kCs / 3600 * th * DOC * M * 70900;                       // mg/L/s
    const pO2 = O2 * 32000 / 43.4;
    const rFeO = P.kFeO2 * OH * OH * pO2 * Fe, rMnO = P.kMnO2 * OH * OH * pO2 * Mn;
    const rFeC = P.kFeCl * Cf * Fe, rMnC = P.kMnCl * Math.pow(10, pH - 7) * Cf * Mn, rNOC = P.kNO2Cl * HOCl * NO2, rHSC = P.kH2SCl * Cf * HS;
    const rFe3 = P.kFeO3 * O3 * Fe, rMn3 = P.kMnO3 * O3 * Mn, rNO3 = P.kNO2O3 * O3 * NO2;
    const kdec = P.kdO3 * th * Math.max(DOC, 0.2) * Math.pow(10, 0.2 * (pH - 7));
    const aHO2 = 10 ** (pH - 11.6), rPer = P.kH2O2O3 * aHO2 * HP * O3, rHPC = P.kH2O2Cl * HP * Cf;
    // HOCl
    dy[0] = -r1 - r2 - r4 - (rFd + rFs) / 70900 - 0.5 * rFeC - rMnC - rNOC - 4 * rHSC - rHPC;
    dy[1] = -r1 + r6 * 0.5 + rCs / 70900;                                 // NH3 tổng
    dy[2] = r1 - r2 - r3 - r6 - rCs / 70900;
    dy[3] = r2 - r3 - r4 + 0.5 * r6;
    dy[4] = r4;
    dy[5] = -rFd;
    dy[6] = -rFeO - rFeC - rFe3;
    dy[7] = -rMnO - rMnC - rMn3;
    dy[8] = -rNOC - rNO3;
    dy[9] = -rHSC;
    dy[10] = -kdec * O3 - 0.5 * rFe3 - rMn3 - rNO3 - rPer;
    dy[11] = -rPer - rHPC;
    dy[12] = kla * (O2eq - O2) - 0.25 * rFeO - 0.5 * rMnO + 0.5 * kdec * O3;
    if (acc) {                                                             // các đại lượng tích lũy (mol/L/s hoặc mg/L/s)
      acc.N2 = r3; acc.Cl = 3 * r3 + (rFd + rFs + rCs) / 70900 + 0.5 * rFeC + rMnC + rNOC + 4 * rHSC + rHPC;
      acc.SO4 = rHSC; acc.NO3 = rNOC + rNO3; acc.Fe3 = rFeO + rFeC + rFe3; acc.MnO2 = rMnO + rMnC + rMn3;
      acc.ClNOM = rFd + rFs; acc.ClNOMcam = rCs; acc.Cl2 = CfMg; acc.cam = (M + 2 * D) * 70900; acc.O3 = O3 * 48000;
    }
  };
  // seg: mô hình dòng phân tách cho bể khuấy trộn hoàn toàn (τ = tSec), tích phân tới 7τ và lấy trung bình theo E(t)
  const seg = !!opt.seg, tEnd = seg ? 7 * tSec : tSec;
  let t = 0, h = Math.min(1, tSec / 50), steps = 0, lastPH = 0;
  const dy1 = new Array(n), dy2 = new Array(n), dy3 = new Array(n), yt = new Array(n), acc = {}, acc2 = {};
  const tot = { N2: 0, Cl: 0, SO4: 0, NO3: 0, Fe3: 0, MnO2: 0, ClNOM: 0, ClNOMcam: 0, Cl2: 0, cam: 0, O3: 0 };
  const recEvery = tEnd / 60; let nextRec = 0;
  const MIC = ['Giardia', 'Virus', 'Crypto', 'Ecoli'];
  const logs = { Giardia: 0, Virus: 0, Crypto: 0, Ecoli: 0 };
  let THM = 0;
  const AVG = ['Cl2f', 'NH4', 'NH2Cl', 'NHCl2', 'NCl3', 'ClD', 'Fe2', 'Mn', 'NO2', 'H2S', 'O3', 'H2O2', 'O2', 'Cl', 'SO4', 'NO3', 'FeOH3', 'MnO2'];
  const avg = {}; AVG.forEach(k => (avg[k] = 0)); const surv = { Giardia: 0, Virus: 0, Crypto: 0, Ecoli: 0 }; let thmAvg = 0, wsum = 0;
  const syncW = () => {
    w.Cl2f = Math.max(y[0], 0) * 70900; w.NH4 = Math.max(y[1], 0) * 14007; w.NH2Cl = Math.max(y[2], 0) * 70900; w.NHCl2 = Math.max(y[3], 0) * 141800; w.NCl3 = Math.max(y[4], 0) * 212700;
    w.ClD = Math.max(y[5], 0); w.Fe2 = Math.max(y[6], 0) * 55845; w.Mn = Math.max(y[7], 0) * 54938; w.NO2 = Math.max(y[8], 0) * 14007; w.H2S = Math.max(y[9], 0) * 32060;
    w.O3 = Math.max(y[10], 0) * 48000; w.H2O2 = Math.max(y[11], 0) * 34010; w.O2 = Math.max(y[12], 0) * 32000;
    w.Cl = w0.Cl + tot.Cl * 35453; w.SO4 = w0.SO4 + tot.SO4 * 96060; w.NO3 = w0.NO3 + tot.NO3 * 14007;
    w.FeOH3 = w0.FeOH3 + tot.Fe3 * 106870; w.MnO2 = w0.MnO2 + tot.MnO2 * 86940;
  };
  const fT = Math.pow(1.025, T - 20), fBr = 1 + 3 * (w0.Br || 0);
  let kf = WK.kFree(T, pH, w0.Cl2f), kc = WK.kCam(T), ko = WK.kO3(T);
  while (t < tEnd && steps < 200000) {
    if (t + h > tEnd) h = tEnd - t;
    rates(y, dy1, acc);
    for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * h * dy1[i];
    rates(yt, dy2, null);
    for (let i = 0; i < n; i++) yt[i] = y[i] + 0.75 * h * dy2[i];
    rates(yt, dy3, acc2);
    let err = 0;
    for (let i = 0; i < n; i++) {
      const y3 = y[i] + h * (2 * dy1[i] + 3 * dy2[i] + 4 * dy3[i]) / 9;
      const y2 = y[i] + h * dy2[i];
      const sc = 1e-4 * Math.abs(y[i]) + (i === 5 ? 1e-4 : i === 12 ? 1e-7 : 1e-10);
      err = Math.max(err, Math.abs(y3 - y2) / sc);
      yt[i] = y3;
    }
    if (err > 1 && h > 1e-4) { h *= Math.max(0.2, 0.9 / Math.cbrt(err)); continue; }
    // chấp nhận bước
    const d = {};
    for (const k in tot) { d[k] = h * 0.5 * ((acc[k] || 0) + (acc2[k] || 0)); tot[k] += d[k]; }
    THM += P.yTHM * fT * Math.pow(10, 0.25 * (Math.min(pH, 9) - 7)) * fBr * (d.ClNOM + 0.05 * d.ClNOMcam);
    for (const m of MIC) logs[m] += (kf[m] * d.Cl2 + kc[m] * d.cam + ko[m] * d.O3) / 60;
    for (let i = 0; i < n; i++) y[i] = Math.max(yt[i], 0);
    t += h; steps++;
    if (seg) {
      syncW();
      const wt = Math.exp(-(t - 0.5 * h) / tSec) * h / tSec;
      for (const k of AVG) avg[k] += wt * w[k];
      for (const m of MIC) surv[m] += wt * Math.pow(10, -logs[m]);
      thmAvg += wt * THM; wsum += wt;
    }
    h = Math.min(h * Math.min(4, 0.9 / Math.cbrt(Math.max(err, 1e-6))), tEnd / 40, 900);
    if (t - lastPH > Math.min(120, tSec / 10) || (steps % 400 === 0)) {
      syncW(); pH = WQ.solve(w).pH; aH = 10 ** -pH; aHOCl = aH / (aH + K.KHOCl); aNH3 = K.KN / (aH + K.KN); OH = K.Kw / aH; lastPH = t;
      kf = WK.kFree(T, pH, w.Cl2f);
    }
    if (opt.profile && t >= nextRec) { syncW(); out.profile.push({ t: t / 60, Cl2f: w.Cl2f, NH2Cl: w.NH2Cl, NHCl2: w.NHCl2, NCl3: w.NCl3, NH4: w.NH4, O3: w.O3, pH }); nextRec += recEvery; }
  }
  syncW();
  if (seg && wsum > 0) {
    for (const k of AVG) w[k] = avg[k] / wsum;
    w.THM += thmAvg / wsum;
    for (const m of MIC) { const L = -Math.log10(Math.max(surv[m] / wsum, 1e-15)); out.logs[m] = L; w[m] = Math.max(w[m] - L, -9); }
  } else {
    w.THM += THM;
    for (const m of MIC) { out.logs[m] = logs[m]; w[m] = Math.max(w[m] - logs[m], -9); }
  }
  // CT theo quy ước EPA: nồng độ dư đầu ra × T10 (T10 = BF·τ)
  const tau = tSec / 60;
  out.CTfree = BF * tau * w.Cl2f; out.CTcam = BF * tau * (w.NH2Cl + w.NHCl2); out.CTo3 = BF * tau * w.O3;
  const kr = WK.kFree(T, pH, w.Cl2f);
  out.credit = {};
  for (const m of MIC) out.credit[m] = Math.min(kr[m] * out.CTfree + kc[m] * out.CTcam + ko[m] * out.CTo3, 6);
  out.Cl2used = (w0.Cl2f + w0.NH2Cl + w0.NHCl2 + w0.NCl3) - (w.Cl2f + w.NH2Cl + w.NHCl2 + w.NCl3);
  out.N2 = tot.N2 * 2 * 14007;
  out.pH = WQ.solve(w).pH; out.steps = steps;
  return Object.assign(out, { w });
};