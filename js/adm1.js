'use strict';
/* ==========================================================================
   SimXLNT – ADM1 (Anaerobic Digestion Model No.1) đầy đủ
   Batstone et al. (2002) IWA STR No.13; hiệu chỉnh & tham số theo BSM2:
   Rosen C., Jeppsson U. (2006) Aspects on ADM1 implementation within the BSM2 framework.
   - 24 biến pha lỏng + Scat, San + 3 biến pha khí; 19 quá trình sinh hóa + 3 trao đổi khí
   - pH giải đại số (DAE) từ cân bằng điện tích (có thêm phosphat)
   - ức chế pH dạng Hill (trơn), giới hạn N vô cơ, ức chế H2, NH3 tự do
   - giao diện ASM1/ASM2d ↔ ADM1 tự xây dựng, bảo toàn COD, N, P, C, điện tích
   Đơn vị lưu trữ: COD g/m³ (= kg/m³ ×1000), C & N vô cơ, ion, CO2 khí: mol/m³; P: g P/m³.
   ========================================================================== */
const ADM = {};

ADM.ids = ['Ssu', 'Saa', 'Sfa', 'Sva', 'Sbu', 'Spro', 'Sac', 'Sh2', 'Sch4', 'SIC', 'SIN', 'SI',
  'Xc', 'Xch', 'Xpr', 'Xli', 'Xsu', 'Xaa', 'Xfa', 'Xc4', 'Xpro', 'Xac', 'Xh2', 'XI',
  'Scat', 'San', 'Gh2', 'Gch4', 'Gco2', 'SIP', 'XPB', 'XPI', 'XISS', 'XMeOH', 'XMeP'];
ADM.N = ADM.ids.length;
ADM.I = {}; ADM.ids.forEach((k, i) => (ADM.I[k] = i));
ADM.partIdx = ADM.ids.map((k, i) => k[0] === 'X' ? i : -1).filter(i => i >= 0);   // chất hạt (Xc … XI, P hạt, vô cơ, kim loại)
ADM.names = {
  Ssu: 'Đường đơn', Saa: 'Axit amin', Sfa: 'Axit béo mạch dài', Sva: 'Valerat', Sbu: 'Butyrat', Spro: 'Propionat', Sac: 'Acetat', Sh2: 'Hydro', Sch4: 'Methan hòa tan',
  SIC: 'Carbon vô cơ', SIN: 'Nitơ vô cơ', SI: 'COD hòa tan trơ', Xc: 'Hợp chất phức', Xch: 'Carbohydrat', Xpr: 'Protein', Xli: 'Lipid',
  Xsu: 'VSV phân hủy đường', Xaa: 'VSV phân hủy axit amin', Xfa: 'VSV phân hủy LCFA', Xc4: 'VSV valerat & butyrat', Xpro: 'VSV propionat', Xac: 'VSV methan hóa acetat', Xh2: 'VSV methan hóa H₂', XI: 'COD hạt trơ',
  Scat: 'Cation', San: 'Anion', Gh2: 'H₂ pha khí', Gch4: 'CH₄ pha khí', Gco2: 'CO₂ pha khí', SIP: 'Phosphat', XPB: 'P liên kết hữu cơ phân hủy được', XPI: 'P trong chất trơ', XISS: 'Chất rắn vô cơ', XMeOH: 'Hydroxit kim loại', XMeP: 'Phosphat kim loại'
};

/* tham số BSM2 (35 °C) */
ADM.params = [
  ['f_sI_xc', 0.1, '-', 'Phần SI từ phân rã Xc', 'Hợp thức'], ['f_xI_xc', 0.2, '-', 'Phần XI từ phân rã Xc', 'Hợp thức'],
  ['f_ch_xc', 0.2, '-', 'Phần carbohydrat từ Xc', 'Hợp thức'], ['f_pr_xc', 0.2, '-', 'Phần protein từ Xc', 'Hợp thức'], ['f_li_xc', 0.3, '-', 'Phần lipid từ Xc', 'Hợp thức'],
  ['N_xc', 0.0376 / 14, 'kmol N/kg COD', 'N trong Xc', 'Hợp thức'], ['N_I', 0.06 / 14, 'kmol N/kg COD', 'N trong chất trơ', 'Hợp thức'],
  ['N_aa', 0.007, 'kmol N/kg COD', 'N trong axit amin/protein', 'Hợp thức'], ['N_bac', 0.08 / 14, 'kmol N/kg COD', 'N trong sinh khối', 'Hợp thức'],
  ['f_fa_li', 0.95, '-', 'LCFA từ lipid', 'Hợp thức'],
  ['f_h2_su', 0.19, '-', 'H₂ từ đường', 'Hợp thức'], ['f_bu_su', 0.13, '-', 'Butyrat từ đường', 'Hợp thức'], ['f_pro_su', 0.27, '-', 'Propionat từ đường', 'Hợp thức'], ['f_ac_su', 0.41, '-', 'Acetat từ đường', 'Hợp thức'],
  ['f_h2_aa', 0.06, '-', 'H₂ từ axit amin', 'Hợp thức'], ['f_va_aa', 0.23, '-', 'Valerat từ axit amin', 'Hợp thức'], ['f_bu_aa', 0.26, '-', 'Butyrat từ axit amin', 'Hợp thức'],
  ['f_pro_aa', 0.05, '-', 'Propionat từ axit amin', 'Hợp thức'], ['f_ac_aa', 0.40, '-', 'Acetat từ axit amin', 'Hợp thức'],
  ['Y_su', 0.1, 'kg COD/kg COD', 'Sản lượng VSV đường', 'Hợp thức'], ['Y_aa', 0.08, 'kg COD/kg COD', 'Sản lượng VSV axit amin', 'Hợp thức'], ['Y_fa', 0.06, 'kg COD/kg COD', 'Sản lượng VSV LCFA', 'Hợp thức'],
  ['Y_c4', 0.06, 'kg COD/kg COD', 'Sản lượng VSV C4', 'Hợp thức'], ['Y_pro', 0.04, 'kg COD/kg COD', 'Sản lượng VSV propionat', 'Hợp thức'],
  ['Y_ac', 0.05, 'kg COD/kg COD', 'Sản lượng VSV acetat', 'Hợp thức'], ['Y_h2', 0.06, 'kg COD/kg COD', 'Sản lượng VSV H₂', 'Hợp thức'],
  ['k_dis', 0.5, '1/d', 'Phân rã Xc', 'Phân rã & thủy phân'], ['k_hyd_ch', 10, '1/d', 'Thủy phân carbohydrat', 'Phân rã & thủy phân'],
  ['k_hyd_pr', 10, '1/d', 'Thủy phân protein', 'Phân rã & thủy phân'], ['k_hyd_li', 10, '1/d', 'Thủy phân lipid', 'Phân rã & thủy phân'],
  ['k_m_su', 30, '1/d', 'Tốc độ hấp thụ cực đại đường', 'Hấp thụ'], ['K_S_su', 0.5, 'kg COD/m³', 'Bán bão hòa đường', 'Hấp thụ'],
  ['k_m_aa', 50, '1/d', 'Tốc độ hấp thụ cực đại axit amin', 'Hấp thụ'], ['K_S_aa', 0.3, 'kg COD/m³', 'Bán bão hòa axit amin', 'Hấp thụ'],
  ['k_m_fa', 6, '1/d', 'Tốc độ hấp thụ cực đại LCFA', 'Hấp thụ'], ['K_S_fa', 0.4, 'kg COD/m³', 'Bán bão hòa LCFA', 'Hấp thụ'],
  ['k_m_c4', 20, '1/d', 'Tốc độ hấp thụ cực đại C4', 'Hấp thụ'], ['K_S_c4', 0.2, 'kg COD/m³', 'Bán bão hòa C4', 'Hấp thụ'],
  ['k_m_pro', 13, '1/d', 'Tốc độ hấp thụ cực đại propionat', 'Hấp thụ'], ['K_S_pro', 0.1, 'kg COD/m³', 'Bán bão hòa propionat', 'Hấp thụ'],
  ['k_m_ac', 8, '1/d', 'Tốc độ hấp thụ cực đại acetat', 'Hấp thụ'], ['K_S_ac', 0.15, 'kg COD/m³', 'Bán bão hòa acetat', 'Hấp thụ'],
  ['k_m_h2', 35, '1/d', 'Tốc độ hấp thụ cực đại H₂', 'Hấp thụ'], ['K_S_h2', 7e-6, 'kg COD/m³', 'Bán bão hòa H₂', 'Hấp thụ'],
  ['k_dec', 0.02, '1/d', 'Phân hủy sinh khối (mọi nhóm)', 'Hấp thụ'],
  ['K_S_IN', 1e-4, 'kmol N/m³', 'Giới hạn N vô cơ', 'Ức chế'], ['K_I_h2_fa', 5e-6, 'kg COD/m³', 'Ức chế H₂ – LCFA', 'Ức chế'],
  ['K_I_h2_c4', 1e-5, 'kg COD/m³', 'Ức chế H₂ – C4', 'Ức chế'], ['K_I_h2_pro', 3.5e-6, 'kg COD/m³', 'Ức chế H₂ – propionat', 'Ức chế'],
  ['K_I_nh3', 0.0018, 'kmol N/m³', 'Ức chế NH₃ tự do – acetat', 'Ức chế'],
  ['pH_UL_aa', 5.5, '-', 'pH trên – axit hóa', 'Ức chế'], ['pH_LL_aa', 4, '-', 'pH dưới – axit hóa', 'Ức chế'],
  ['pH_UL_ac', 7, '-', 'pH trên – methan acetat', 'Ức chế'], ['pH_LL_ac', 6, '-', 'pH dưới – methan acetat', 'Ức chế'],
  ['pH_UL_h2', 6, '-', 'pH trên – methan H₂', 'Ức chế'], ['pH_LL_h2', 5, '-', 'pH dưới – methan H₂', 'Ức chế'],
  ['kLa', 200, '1/d', 'Hệ số trao đổi lỏng–khí', 'Hóa lý'], ['k_p', 5e4, 'm³/(d·bar)', 'Hệ số dòng khí ra', 'Hóa lý'],
  ['fch_in', 0.25, '-', 'Giao diện: phần carbohydrat của hữu cơ hạt phân hủy được', 'Giao diện ASM→ADM'],
  ['fpr_in', 0.5, '-', 'Giao diện: phần protein', 'Giao diện ASM→ADM'], ['fli_in', 0.25, '-', 'Giao diện: phần lipid', 'Giao diện ASM→ADM']
].map(([id, v, u, d, g]) => ({ id, v, u, d, g }));
ADM.defaults = {}; ADM.params.forEach(p => (ADM.defaults[p.id] = p.v));

/* carbon (kmol C/kg COD = mol C/g COD) */
const AC = { xc: 0.02786, sI: 0.03, ch: 0.0313, pr: 0.03, li: 0.022, xI: 0.03, su: 0.0313, aa: 0.03, fa: 0.0217, bu: 0.025, pro: 0.0268, ac: 0.0313, bac: 0.0313, va: 0.024, ch4: 0.0156 };

/* trạng thái ban đầu điển hình (BSM2, kg→g) */
ADM.init = function () {
  const k = { Ssu: 0.012, Saa: 0.0053, Sfa: 0.099, Sva: 0.012, Sbu: 0.013, Spro: 0.016, Sac: 0.2, Sh2: 2.4e-7, Sch4: 0.055, SIC: 0.15, SIN: 0.13, SI: 0.33,
    Xc: 0.31, Xch: 0.028, Xpr: 0.1, Xli: 0.029, Xsu: 0.42, Xaa: 1.18, Xfa: 0.24, Xc4: 0.43, Xpro: 0.14, Xac: 0.76, Xh2: 0.32, XI: 25.6,
    Scat: 0.04, San: 0.02, Gh2: 1e-5, Gch4: 1.65, Gco2: 0.014 };
  const x = new Float64Array(ADM.N);
  for (const id in k) x[ADM.I[id]] = k[id] * 1000;
  x[ADM.I.SIP] = 150; x[ADM.I.XPB] = 50; x[ADM.I.XPI] = 50;
  return x;
};

/* hằng số hóa lý phụ thuộc nhiệt độ (Rosen & Jeppsson 2006) */
ADM.phys = function (T) {
  const R = 0.083145, Tb = 298.15, Tk = T + 273.15, f = (dH) => Math.exp(dH / (100 * R) * (1 / Tb - 1 / Tk));
  return {
    R, Tk, Patm: 1.013,
    Kw: 1e-14 * f(55900), Kva: 10 ** -4.86, Kbu: 10 ** -4.82, Kpro: 10 ** -4.88, Kac: 10 ** -4.76,
    Kco2: 10 ** -6.35 * f(7646), KIN: 10 ** -9.25 * f(51965),
    KHco2: 0.035 * f(-19410), KHch4: 0.0014 * f(-14240), KHh2: 7.8e-4 * f(-4180),
    ph2o: 0.0313 * Math.exp(5290 * (1 / Tb - 1 / Tk)),
    KP1: 10 ** -2.15, KP2: 10 ** -7.20, KP3: 10 ** -12.35
  };
};

/* ----------------------------------------------------------------------------
   Dựng bộ mô phỏng ADM1 cho một bể: up = thông số đơn vị, pa = tham số ADM1 (người dùng)
   m, p20: mô hình ASM để chuyển đổi dòng vào/ra
   ---------------------------------------------------------------------------- */
ADM.make = function (m, p20, up, pa) {
  const P = Object.assign({}, ADM.defaults, pa || {});
  // hàm lượng N của chất trơ ADM đồng bộ với mô hình ASM (Nopens et al. 2009) nếu người dùng không tự đặt
  if (!pa || pa.N_I === undefined) P.N_I = (m.fam === 'ASM1' ? p20.iXP : p20.iNXI) / 14;
  const K = ADM.phys(+up.T);
  const I = ADM.I, N = ADM.N, A = m.idx;
  const is1 = m.fam === 'ASM1';
  const comp = m.composition(p20);
  const nAsm = m.n;
  const Vl = Math.max(+up.V, 1), Vg = Math.max(+up.Vgas, 1);
  const fsum = P.fch_in + P.fpr_in + P.fli_in || 1;
  const fch = P.fch_in / fsum, fpr = P.fpr_in / fsum, fli = P.fli_in / fsum;
  const Naa = P.N_aa * 14, NI = P.N_I * 14, Nbac = P.N_bac * 14, Nxc = P.N_xc * 14; // g N/g COD
  // hệ số carbon cho phương trình SIC
  const s = [];
  s[1] = -AC.xc + P.f_sI_xc * AC.sI + P.f_ch_xc * AC.ch + P.f_pr_xc * AC.pr + P.f_li_xc * AC.li + P.f_xI_xc * AC.xI;
  s[2] = -AC.ch + AC.su; s[3] = -AC.pr + AC.aa; s[4] = -AC.li + (1 - P.f_fa_li) * AC.su + P.f_fa_li * AC.fa;
  s[5] = -AC.su + (1 - P.Y_su) * (P.f_bu_su * AC.bu + P.f_pro_su * AC.pro + P.f_ac_su * AC.ac) + P.Y_su * AC.bac;
  s[6] = -AC.aa + (1 - P.Y_aa) * (P.f_va_aa * AC.va + P.f_bu_aa * AC.bu + P.f_pro_aa * AC.pro + P.f_ac_aa * AC.ac) + P.Y_aa * AC.bac;
  s[7] = -AC.fa + (1 - P.Y_fa) * 0.7 * AC.ac + P.Y_fa * AC.bac;
  s[8] = -AC.va + (1 - P.Y_c4) * 0.54 * AC.pro + (1 - P.Y_c4) * 0.31 * AC.ac + P.Y_c4 * AC.bac;
  s[9] = -AC.bu + (1 - P.Y_c4) * 0.8 * AC.ac + P.Y_c4 * AC.bac;
  s[10] = -AC.pro + (1 - P.Y_pro) * 0.57 * AC.ac + P.Y_pro * AC.bac;
  s[11] = -AC.ac + (1 - P.Y_ac) * AC.ch4 + P.Y_ac * AC.bac;
  s[12] = (1 - P.Y_h2) * AC.ch4 + P.Y_h2 * AC.bac;
  s[13] = -AC.bac + AC.xc;
  const hill = (UL, LL) => ({ K: Math.pow(10, -(UL + LL) / 2), n: 3 / (UL - LL) });
  const Haa = hill(P.pH_UL_aa, P.pH_LL_aa), Hac = hill(P.pH_UL_ac, P.pH_LL_ac), Hh2 = hill(P.pH_UL_h2, P.pH_LL_h2);
  const fPx = is1 ? (p20.fP !== undefined ? p20.fP : p20.fI) : p20.fXI;                       // phần trơ khi phân hủy sinh khối ASM
  const iXI_N = is1 ? p20.iXP : p20.iNXI;
  // P trong sinh khối ADM (ẩn – không có biến riêng): cùng hàm lượng P của XS/XI mà sinh khối quy đổi sang ở giao diện ADM→ASM,
  // lấy từ SIP khi tăng trưởng, trả về XPB khi phân hủy → bảo toàn P khi bùn giàu sinh khối (bể kỵ khí tốc độ cao, SRT dài)
  const iPbac = is1 ? 0 : (1 - fPx) * p20.iPXS + fPx * p20.iPXI;

  // carbon hữu cơ của vector ADM (mol C/m³)
  const admOrgC = x => (x[I.Ssu] * AC.su + x[I.Saa] * AC.aa + x[I.Sfa] * AC.fa + x[I.Sva] * AC.va + x[I.Sbu] * AC.bu + x[I.Spro] * AC.pro + x[I.Sac] * AC.ac
    + x[I.Sch4] * AC.ch4 + x[I.SI] * AC.sI + x[I.Xc] * AC.xc + x[I.Xch] * AC.ch + x[I.Xpr] * AC.pr + x[I.Xli] * AC.li
    + (x[I.Xsu] + x[I.Xaa] + x[I.Xfa] + x[I.Xc4] + x[I.Xpro] + x[I.Xac] + x[I.Xh2]) * AC.bac + x[I.XI] * AC.xI);
  const admBio = x => x[I.Xsu] + x[I.Xaa] + x[I.Xfa] + x[I.Xc4] + x[I.Xpro] + x[I.Xac] + x[I.Xh2];
  const admOrgN = x => (x[I.Saa] + x[I.Xpr]) * Naa + (x[I.SI] + x[I.XI]) * NI + x[I.Xc] * Nxc + admBio(x) * Nbac; // g N/m³
  const dot = (cv, x) => { let s0 = 0; for (let k = 0; k < nAsm; k++) s0 += cv[k] * x[k]; return s0; };
  const Zof = x => CHEM.ions(m, x).z * 1000;  // mol/m³

  /* ---- ASM → ADM1 (dòng vào) ---- */
  const tmp = new Float64Array(nAsm);
  function toAdm(xa, out, acc) {
    out.fill(0);
    const x = tmp; for (let k = 0; k < nAsm; k++) x[k] = Math.max(xa[k], 0);
    if (m.gran) for (const [s, g] of m.gran) { x[s] += x[g]; x[g] = 0; }   // bùn hạt: gộp vào phần bông tương ứng (cùng thành phần)
    const no2 = m.NO2 ? x[A[m.NO2]] : 0;
    const Ntot = dot(comp.N, x) - x[A[m.NO]] - no2 - x[A.SN2];       // N trừ NO3 (+NO2) và N2 hòa tan
    const Ctot = dot(comp.C, x);
    const Ptot = is1 ? 0 : dot(comp.P, x);
    // polyP mang điện tích âm (−1/31 mol/g P) kèm cation đối; khi giải phóng thành PO4 các cation này vào dung dịch
    const Z = Zof(xa) + (is1 ? 0 : Math.max(xa[A.XPP], 0) / 31);
    // nhu cầu COD của O2 và NO3 trừ vào chất hữu cơ dễ phân hủy trước
    let dem = x[A[m.SO]] + 2.857 * x[A[m.NO]] + 1.714 * no2;
    const take = id => { const v = Math.min(x[A[id]], dem); x[A[id]] -= v; dem -= v; };
    if (is1) ['SS', 'XS', 'XBH', 'XBA', 'XNOB', 'XAMX', 'XCMX'].filter(k => A[k] !== undefined).forEach(take); else ['SA', 'SF', 'XS', 'XH', 'XPAO', 'XAUT'].concat(m.extraBio || []).forEach(take);
    let bio, deg, inert, Psol = 0, Pin = 0;
    if (is1) {
      out[I.Ssu] = x[A.SS];
      bio = x[A.XBH] + x[A.XBA] + (m.nitro ? x[A.XNOB] + x[A.XAMX] + x[A.XCMX] : 0);
      inert = x[A.XI] + x[A.XP] + fPx * bio;
      deg = x[A.XS] + (1 - fPx) * bio + (A.XSTO !== undefined ? x[A.XSTO] : 0);   // ASM3: chất dự trữ XSTO → phân hủy được
    } else {
      out[I.Ssu] = x[A.SF];
      out[I.Sac] = x[A.SA] + x[A.XPHA];                           // VFA + PHA → acetat
      bio = x[A.XH] + x[A.XPAO] + x[A.XAUT];
      for (const k of m.extraBio || []) bio += x[A[k]];            // ASM2dS2: NOB, anammox
      inert = x[A.XI] + fPx * bio;
      for (const k of m.extraInert || []) inert += x[A[k]];        // ASM2dS: sản phẩm nội sinh XE
      deg = x[A.XS] + (1 - fPx) * bio;
      for (const k of m.extraDeg || []) deg += x[A[k]];            // ASM3P: chất dự trữ XSTO
      Psol = x[A.SPO4] + x[A.XPP] + p20.iPSF * x[A.SF];          // polyP & P hòa tan giải phóng ngay
      Pin = p20.iPXI * inert + p20.iPSI * x[A.SI];
      out[I.XMeOH] = x[A.XMeOH]; out[I.XMeP] = x[A.XMeP];
    }
    out[I.SI] = x[A.SI];
    out[I.XI] = inert;
    // protein theo lượng N sẵn có (sau khi trừ N của chất trơ); phần thiếu chuyển sang carbohydrat/lipid
    const nAvail = Math.max(Ntot - NI * (inert + x[A.SI]), 0);
    let xpr = fpr * deg;
    if (xpr * Naa > nAvail) xpr = nAvail / Naa;
    const rest = deg - xpr, fcl = fch + fli || 1;
    out[I.Xpr] = xpr; out[I.Xch] = rest * fch / fcl; out[I.Xli] = rest * fli / fcl;
    out[I.XISS] = x[A.XISS];
    // N vô cơ = N tổng − N hữu cơ ADM
    const nRes = Ntot - admOrgN(out);
    out[I.SIN] = Math.max(nRes, 0) / 14;
    // C vô cơ = C tổng − C hữu cơ ADM
    out[I.SIC] = Math.max(Ctot - admOrgC(out), 0);
    // điện tích: Scat − San = Z
    out[I.Scat] = Math.max(Z, 0); out[I.San] = Math.max(-Z, 0);
    if (!is1) {
      out[I.SIP] = Psol; out[I.XPI] = Pin;
      out[I.XPB] = Math.max(Ptot - Psol - Pin - x[A.XMeP] / 4.87, 0);
    }
    if (acc) { acc.N2 = x[A[m.NO]] + no2 + x[A.SN2]; acc.nMiss = Math.min(nRes, 0); }
    return out;
  }

  /* ---- ADM1 → ASM (dòng ra) ---- */
  function toAsm(xd, out) {
    out.fill(0);
    const d = id => Math.max(xd[I[id]], 0);
    const bio = admBio(xd);
    const degX = d('Xc') + d('Xch') + d('Xpr') + d('Xli');
    const NtotAdm = d('SIN') * 14 + admOrgN(xd);                     // g N/m³
    const CtotAdm = d('SIC') + admOrgC(xd) - d('Sch4') * AC.ch4;     // CH4 hòa tan coi như thoát khí
    const Z = d('Scat') - d('San');
    if (is1) {
      out[A.SS] = d('Ssu') + d('Saa') + d('Sfa') + d('Sva') + d('Sbu') + d('Spro') + d('Sac');
      out[A.SI] = d('SI');
      out[A.XS] = degX + (1 - fPx) * bio;
      out[A.XP] = fPx * bio;
      out[A.XI] = d('XI');
      out[A.SND] = d('Saa') * Naa;
      let snh = d('SIN') * 14;
      let xnd = NtotAdm - snh - out[A.SND] - p20.iXP * (out[A.XP] + out[A.XI]);
      if (xnd < 0) { snh += xnd; xnd = 0; }
      out[A.SNH] = Math.max(snh, 0); out[A.XND] = xnd;
    } else {
      out[A.SF] = d('Ssu') + d('Saa') + d('Sfa');
      out[A.SA] = d('Sva') + d('Sbu') + d('Spro') + d('Sac');
      out[A.SI] = d('SI');
      out[A.XS] = degX + (1 - fPx) * bio;
      out[A.XI] = d('XI') + fPx * bio;
      let orgN = p20.iNSF * out[A.SF] + p20.iNSI * out[A.SI] + p20.iNXI * out[A.XI] + p20.iNXS * out[A.XS];
      // N hữu cơ của ADM1 (sinh khối, protein ≈ 0,08 – 0,1 gN/gCOD) vượt sức chứa N của XS (iNXS) → chuyển một phần XS thành XH
      // (iNBM cao hơn) để N nằm trong chất hạt, theo bùn; không giải phóng ngay thành NH₄ hòa tan tại giao diện
      // (bùn dư bể kỵ khí / bùn phân hủy → nước tách bùn có NH₄ "ảo" hàng nghìn mg/L)
      // (giới hạn thêm theo P sẵn có nếu XH chứa nhiều P hơn XS – không để PO₄ âm)
      const PtotD = d('SIP') + d('XPB') + d('XPI') + d('XMeP') / 4.87 + iPbac * bio;
      const orgP0 = p20.iPSF * out[A.SF] + p20.iPSI * out[A.SI] + p20.iPXI * out[A.XI] + p20.iPXS * out[A.XS];
      const exN = NtotAdm - d('SIN') * 14 - orgN, dN = p20.iNBM - p20.iNXS, dP = p20.iPBM - p20.iPXS;
      if (exN > 0 && A.XH !== undefined && dN > 0) {
        let s = Math.min(out[A.XS], exN / dN);
        if (dP > 0) s = Math.min(s, Math.max(PtotD - d('XMeP') / 4.87 - orgP0, 0) / dP);
        out[A.XS] -= s; out[A.XH] += s; orgN += s * dN;
      }
      out[A.SNH4] = Math.max(NtotAdm - orgN, 0);
      const orgP = orgP0 + (A.XH !== undefined ? (p20.iPBM - p20.iPXS) * out[A.XH] : 0);
      out[A.SPO4] = Math.max(PtotD - orgP - d('XMeP') / 4.87, 0);
      out[A.XMeOH] = d('XMeOH'); out[A.XMeP] = d('XMeP');
    }
    out[A.XISS] = d('XISS');
    // C vô cơ cân bằng carbon; độ kiềm ASM suy từ Z
    out[A.STIC] = Math.max(CtotAdm - (dot(comp.C, out) - out[A.STIC] * comp.C[A.STIC]), 0);
    const nh = out[A[m.NH]], po = m.PO ? out[A[m.PO]] : 0, sa = A.SA !== undefined ? out[A.SA] : 0;
    out[A[m.ALK]] = Z + nh / 14 - 1.5 * po / 31 - sa / 64;
    return out;
  }

  /* ---- pH (cân bằng điện tích ADM1 + phosphat), trả về [H+] mol/L ---- */
  function solveH(xk, sip) {
    const cat = xk[I.Scat], an = xk[I.San], IN = xk[I.SIN], IC = xk[I.SIC];
    const va = xk[I.Sva], bu = xk[I.Sbu], pro = xk[I.Spro], ac = xk[I.Sac], pP = sip / 31000;
    const g = H => cat + IN * H / (K.KIN + H) + H - IC * K.Kco2 / (K.Kco2 + H) - ac * K.Kac / (K.Kac + H) / 64 - pro * K.Kpro / (K.Kpro + H) / 112
      - bu * K.Kbu / (K.Kbu + H) / 160 - va * K.Kva / (K.Kva + H) / 208 - K.Kw / H - an
      - pP * (K.KP1 * H * H + 2 * K.KP1 * K.KP2 * H + 3 * K.KP1 * K.KP2 * K.KP3) / (H * H * H + K.KP1 * H * H + K.KP1 * K.KP2 * H + K.KP1 * K.KP2 * K.KP3);
    let lo = 0, hi = 14;
    for (let it = 0; it < 60; it++) { const mid = 0.5 * (lo + hi); if (g(10 ** -mid) > 0) lo = mid; else hi = mid; }
    return 10 ** -(0.5 * (lo + hi));
  }

  const xk = new Float64Array(29), rho = new Float64Array(20);
  /* tốc độ & đạo hàm phản ứng; x: trạng thái (đơn vị lưu trữ); dy cộng dồn */
  function react(x, dy, info) {
    for (let k = 0; k < 29; k++) xk[k] = Math.max(x[k], 0) / 1000;   // → kg COD/m³, kmol/m³
    const H = solveH(xk, Math.max(x[I.SIP], 0));
    const Snh3 = xk[I.SIN] * K.KIN / (K.KIN + H), Shco3 = xk[I.SIC] * K.Kco2 / (K.Kco2 + H), Sco2 = xk[I.SIC] - Shco3;
    const ih = (h) => Math.pow(h.K, h.n) / (Math.pow(H, h.n) + Math.pow(h.K, h.n));
    const IpHaa = ih(Haa), IpHac = ih(Hac), IpHh2 = ih(Hh2);
    const IIN = 1 / (1 + P.K_S_IN / Math.max(xk[I.SIN], 1e-12));
    const sh2 = xk[I.Sh2];
    const Ih2fa = 1 / (1 + sh2 / P.K_I_h2_fa), Ih2c4 = 1 / (1 + sh2 / P.K_I_h2_c4), Ih2pro = 1 / (1 + sh2 / P.K_I_h2_pro);
    const Inh3 = 1 / (1 + Snh3 / P.K_I_nh3);
    const I5 = IpHaa * IIN, I7 = I5 * Ih2fa, I8 = I5 * Ih2c4, I10 = I5 * Ih2pro, I11 = IpHac * IIN * Inh3, I12 = IpHh2 * IIN;
    const M = (S, Ks) => S / (Ks + S);
    const va = xk[I.Sva], bu = xk[I.Sbu], c4 = va + bu + 1e-6;
    rho[1] = P.k_dis * xk[I.Xc]; rho[2] = P.k_hyd_ch * xk[I.Xch]; rho[3] = P.k_hyd_pr * xk[I.Xpr]; rho[4] = P.k_hyd_li * xk[I.Xli];
    rho[5] = P.k_m_su * M(xk[I.Ssu], P.K_S_su) * xk[I.Xsu] * I5;
    rho[6] = P.k_m_aa * M(xk[I.Saa], P.K_S_aa) * xk[I.Xaa] * I5;
    rho[7] = P.k_m_fa * M(xk[I.Sfa], P.K_S_fa) * xk[I.Xfa] * I7;
    rho[8] = P.k_m_c4 * M(va, P.K_S_c4) * xk[I.Xc4] * va / c4 * I8;
    rho[9] = P.k_m_c4 * M(bu, P.K_S_c4) * xk[I.Xc4] * bu / c4 * I8;
    rho[10] = P.k_m_pro * M(xk[I.Spro], P.K_S_pro) * xk[I.Xpro] * I10;
    rho[11] = P.k_m_ac * M(xk[I.Sac], P.K_S_ac) * xk[I.Xac] * I11;
    rho[12] = P.k_m_h2 * M(sh2, P.K_S_h2) * xk[I.Xh2] * I12;
    const dec = [xk[I.Xsu], xk[I.Xaa], xk[I.Xfa], xk[I.Xc4], xk[I.Xpro], xk[I.Xac], xk[I.Xh2]].map(v => P.k_dec * v);
    const decS = dec.reduce((a, b) => a + b, 0);
    // khí
    const RT = K.R * K.Tk;
    const ph2 = xk[I.Gh2] * RT / 16, pch4 = xk[I.Gch4] * RT / 64, pco2 = xk[I.Gco2] * RT;
    const Pg = ph2 + pch4 + pco2 + K.ph2o;
    const qg = Math.max(P.k_p * (Pg - K.Patm) * Pg / K.Patm, 0);    // m³/d
    const rT8 = P.kLa * (sh2 - 16 * K.KHh2 * ph2);
    const rT9 = P.kLa * (xk[I.Sch4] - 64 * K.KHch4 * pch4);
    const rT10 = P.kLa * (Sco2 - K.KHco2 * pco2);
    const r = rho;
    const d = new Float64Array(29);
    d[I.Ssu] = r[2] + (1 - P.f_fa_li) * r[4] - r[5];
    d[I.Saa] = r[3] - r[6];
    d[I.Sfa] = P.f_fa_li * r[4] - r[7];
    d[I.Sva] = (1 - P.Y_aa) * P.f_va_aa * r[6] - r[8];
    d[I.Sbu] = (1 - P.Y_su) * P.f_bu_su * r[5] + (1 - P.Y_aa) * P.f_bu_aa * r[6] - r[9];
    d[I.Spro] = (1 - P.Y_su) * P.f_pro_su * r[5] + (1 - P.Y_aa) * P.f_pro_aa * r[6] + (1 - P.Y_c4) * 0.54 * r[8] - r[10];
    d[I.Sac] = (1 - P.Y_su) * P.f_ac_su * r[5] + (1 - P.Y_aa) * P.f_ac_aa * r[6] + (1 - P.Y_fa) * 0.7 * r[7] + (1 - P.Y_c4) * 0.31 * r[8] + (1 - P.Y_c4) * 0.8 * r[9] + (1 - P.Y_pro) * 0.57 * r[10] - r[11];
    d[I.Sh2] = (1 - P.Y_su) * P.f_h2_su * r[5] + (1 - P.Y_aa) * P.f_h2_aa * r[6] + (1 - P.Y_fa) * 0.3 * r[7] + (1 - P.Y_c4) * 0.15 * r[8] + (1 - P.Y_c4) * 0.2 * r[9] + (1 - P.Y_pro) * 0.43 * r[10] - r[12] - rT8;
    d[I.Sch4] = (1 - P.Y_ac) * r[11] + (1 - P.Y_h2) * r[12] - rT9;
    let sc = 0; for (let k = 1; k <= 12; k++) sc += s[k] * r[k];
    d[I.SIC] = -sc - s[13] * decS - rT10;
    d[I.SIN] = -P.Y_su * P.N_bac * r[5] + (P.N_aa - P.Y_aa * P.N_bac) * r[6] - P.Y_fa * P.N_bac * r[7] - P.Y_c4 * P.N_bac * (r[8] + r[9]) - P.Y_pro * P.N_bac * r[10]
      - P.Y_ac * P.N_bac * r[11] - P.Y_h2 * P.N_bac * r[12] + (P.N_bac - P.N_xc) * decS + (P.N_xc - P.f_xI_xc * P.N_I - P.f_sI_xc * P.N_I - P.f_pr_xc * P.N_aa) * r[1];
    d[I.SI] = P.f_sI_xc * r[1];
    d[I.Xc] = -r[1] + decS;
    d[I.Xch] = P.f_ch_xc * r[1] - r[2]; d[I.Xpr] = P.f_pr_xc * r[1] - r[3]; d[I.Xli] = P.f_li_xc * r[1] - r[4];
    d[I.Xsu] = P.Y_su * r[5] - dec[0]; d[I.Xaa] = P.Y_aa * r[6] - dec[1]; d[I.Xfa] = P.Y_fa * r[7] - dec[2];
    d[I.Xc4] = P.Y_c4 * (r[8] + r[9]) - dec[3]; d[I.Xpro] = P.Y_pro * r[10] - dec[4]; d[I.Xac] = P.Y_ac * r[11] - dec[5]; d[I.Xh2] = P.Y_h2 * r[12] - dec[6];
    d[I.XI] = P.f_xI_xc * r[1];
    // pha khí (thể tích khí Vg)
    d[I.Gh2] = -xk[I.Gh2] * qg / Vg + rT8 * Vl / Vg;
    d[I.Gch4] = -xk[I.Gch4] * qg / Vg + rT9 * Vl / Vg;
    d[I.Gco2] = -xk[I.Gco2] * qg / Vg + rT10 * Vl / Vg;
    for (let k = 0; k < 29; k++) dy[k] += 1000 * d[k];
    if (iPbac > 0) {
      const grow = P.Y_su * r[5] + P.Y_aa * r[6] + P.Y_fa * r[7] + P.Y_c4 * (r[8] + r[9]) + P.Y_pro * r[10] + P.Y_ac * r[11] + P.Y_h2 * r[12];
      dy[I.SIP] -= 1000 * iPbac * grow; dy[I.XPB] += 1000 * iPbac * decS;
    }
    // P liên kết hữu cơ giải phóng theo tốc độ thủy phân tương đối
    const degS = xk[I.Xc] + xk[I.Xch] + xk[I.Xpr] + xk[I.Xli];
    // hàm lượng P của chất hữu cơ phân hủy được pd = XPB/degS: thủy phân giải phóng pd·(r2+r3+r4); phân rã Xc → XI chuyển P sang XPI
    // theo iP của XI (đúng hàm lượng khi quy đổi về ASM), phần Xc → SI giải phóng → bảo toàn P khi bùn lưu lâu (SRT dài)
    const pd = degS > 1e-9 ? Math.max(x[I.XPB], 0) / (degS * 1000) : 0, iPXI = is1 ? 0 : p20.iPXI;
    const rel = 1000 * pd * (r[2] + r[3] + r[4] + P.f_sI_xc * r[1]), toI = 1000 * iPXI * P.f_xI_xc * r[1];
    dy[I.XPB] -= rel + toI + 1000 * pd * P.f_xI_xc * r[1] - toI; dy[I.SIP] += rel + 1000 * pd * P.f_xI_xc * r[1] - toI; dy[I.XPI] += toI;
    if (info) {
      Object.assign(info, {
        pH: -Math.log10(H), qgas: qg, Pgas: Pg, ph2, pch4, pco2,
        CH4kg: xk[I.Gch4] * qg, H2kg: xk[I.Gh2] * qg, CO2kmol: xk[I.Gco2] * qg,
        Snh3: Snh3 * 14000, Shco3: Shco3, VFA: (xk[I.Sva] + xk[I.Sbu] + xk[I.Spro] + xk[I.Sac]) * 1000,
        IpHac, IpHh2, IpHaa, Inh3, IIN, Ih2pro, rho: Array.from(r)
      });
    }
  }

  const ain = new Float64Array(N), acc = {};
  /* đạo hàm toàn bể: x = trạng thái, cinAsm = dòng vào (ASM), q = lưu lượng vào */
  function deriv(x, cinAsm, q, dy) {
    toAdm(cinAsm, ain, acc);
    const D = q / Vl;
    for (let k = 0; k < N; k++) dy[k] = (k >= I.Gh2 && k <= I.Gco2) ? 0 : D * (ain[k] - x[k]);
    react(x, dy, null);
  }

  return {
    N, Vl, Vg, toAdm, toAsm, deriv, P, K,
    detail(x, cinAsm, q) {
      const info = {}, dy = new Float64Array(N);
      react(x, dy, info);
      const a = new Float64Array(N), ac2 = {};
      toAdm(cinAsm, a, ac2);
      info.N2in = ac2.N2 * q / 1000;          // kg N/d thoát dạng N2 (nitrat/N2 vào bể)
      info.nMiss = ac2.nMiss * q / 1000;
      info.ain = a;
      return info;
    }
  };
};
