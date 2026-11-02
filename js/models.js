'use strict';
/* ==========================================================================
   SimXLNT – Mô hình động học (ma trận Gujer) – tự cài đặt theo tài liệu IWA:
   ASM1  : Henze et al. (2000) IWA STR No.9 (+ SN2, XISS để cân bằng N và TSS)
   ASM2d : Henze et al. (1999) Wat. Sci. Tech. 39(1) (+ XISS; TSS là biến tính)
   Hệ số hợp thức chưa biết được giải tự động bằng các phương trình bảo toàn
   (COD, N, P, điện tích) → mọi quá trình luôn cân bằng khối lượng.
   ========================================================================== */
const MODELS = {};

const CONS_LABEL = { COD: 'COD', N: 'N', P: 'P', Q: 'Điện tích', C: 'Carbon' };

/* hàm chuyển đổi pH cho sinh trưởng (dạng chuông, 1 ở khoảng pH tối ưu) */
function phFactor(p) {
  if (!p.pHinh || p.pHcur === undefined) return 1;
  const ph = p.pHcur;
  return 1 / (1 + Math.pow(10, p.pHlo - ph) + Math.pow(10, ph - p.pHhi));
}
const PH_PARAMS = [
  { id: 'iCorg', v: 0.36, u: 'g C/g COD', d: 'Hàm lượng carbon của chất hữu cơ', g: 'Carbon & pH' },
  { id: 'pHinh', v: 0, u: '0/1', d: 'Bật ức chế pH lên vi khuẩn nitrat hóa (1 = bật)', g: 'Carbon & pH' },
  { id: 'pHlo', v: 6.0, u: '-', d: 'pH thấp (giảm 50 % tốc độ)', g: 'Carbon & pH' },
  { id: 'pHhi', v: 9.5, u: '-', d: 'pH cao (giảm 50 % tốc độ)', g: 'Carbon & pH' }
];

function _solveSmall(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    if (Math.abs(M[k][k]) < 1e-14) throw new Error('Ma trận bảo toàn suy biến');
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

function defineModel(def) {
  const m = def;
  m.fam = m.fam || m.id;      // họ mô hình (ASM1 / ASM2d) – các biến thể bùn hạt dùng chung logic hiển thị/giao diện ADM
  if (m.cons.includes('C')) m.procs.forEach(pr => { pr.unk = pr.unk || []; if (!pr.unk.some(u => u[1] === 'C')) pr.unk = pr.unk.concat([['STIC', 'C']]); });
  m.n = m.comps.length;
  m.idx = {};
  m.comps.forEach((c, i) => (m.idx[c.id] = i));
  m.partIdx = []; m.solIdx = [];
  m.comps.forEach((c, i) => (c.part ? m.partIdx : m.solIdx).push(i));
  m.np = m.procs.length;
  m.defaults = {};
  m.params.forEach(p => (m.defaults[p.id] = p.v));
  m.pById = {};
  m.params.forEach(p => (m.pById[p.id] = p));
  MODELS[m.id] = m;
  return m;
}

/* tham số hiệu chỉnh nhiệt độ: k_T = k_20 · θ^(T−20) */
function paramsAtT(m, p, T) {
  const q = Object.assign({}, m.defaults, p);
  for (const d of m.params) if (d.th && d.th !== 1) q[d.id] = q[d.id] * Math.pow(d.th, T - 20);
  return q;
}

/* Giải hệ số hợp thức cho một danh sách quá trình.
   virt: các thành phần ảo ngoài vector trạng thái (vd khí CH4: {CH4:{COD:1, C:1/64}}),
   hệ số của chúng trả về trong gas[i][tên]. */
function stoichProcs(m, p, procs, virt = {}) {
  const comp0 = m.composition(p), vn = Object.keys(virt), N = m.n + vn.length;
  const idx = Object.assign({}, m.idx); vn.forEach((v, i) => (idx[v] = m.n + i));
  const comp = {};
  for (const cn of m.cons) { const a = new Float64Array(N); a.set(comp0[cn]); vn.forEach((v, i) => (a[m.n + i] = virt[v][cn] || 0)); comp[cn] = a; }
  const nu = [], resid = [], gas = [];
  for (const pr of procs) {
    const row = new Float64Array(N);
    const k = pr.st(p);
    for (const id in k) row[idx[id]] += k[id];
    const unk = pr.unk || [];
    const U = unk.map(u => {
      const v = new Float64Array(N);
      const dir = typeof u[0] === 'string' ? { [u[0]]: 1 } : u[0];
      for (const id in dir) v[idx[id]] = dir[id];
      return v;
    });
    const nU = U.length;
    if (nU) {
      const A = [], b = [];
      for (let i = 0; i < nU; i++) {
        const cv = comp[unk[i][1]];
        A.push(U.map(Uj => { let s = 0; for (let c = 0; c < N; c++) s += cv[c] * Uj[c]; return s; }));
        let s = 0; for (let c = 0; c < N; c++) s += cv[c] * row[c];
        b.push(-s);
      }
      const a = _solveSmall(A, b);
      for (let j = 0; j < nU; j++) for (let c = 0; c < N; c++) row[c] += a[j] * U[j][c];
    }
    for (let c = 0; c < N; c++) if (Math.abs(row[c]) < 1e-15) row[c] = 0;
    const r = {};
    for (const cn of m.cons) { let s = 0; const cv = comp[cn]; for (let c = 0; c < N; c++) s += cv[c] * row[c]; r[cn] = s; }
    resid.push(r);
    const g = {}; vn.forEach((v, i) => (g[v] = row[m.n + i])); gas.push(g);
    nu.push(row.slice(0, m.n));
  }
  const flat = new Float64Array(procs.length * m.n);
  nu.forEach((r, i) => flat.set(r, i * m.n));
  return { nu, flat, resid, comp: comp0, gas };
}

/* ma trận hợp thức ν[proc][comp] + kiểm tra bảo toàn */
function computeStoich(m, pIn) {
  return stoichProcs(m, Object.assign({}, m.defaults, pIn), m.procs);
}

const MON = (S, K) => S / (K + S);
const INH = (S, K) => K / (K + S);

/* --------------------------------------------------------------------------
   ASM1
   -------------------------------------------------------------------------- */
defineModel({
  id: 'ASM1',
  name: 'ASM1 (IWA, 2000) + SN2, XISS',
  ref: 'Henze M., Grady C.P.L., Gujer W., Marais G.v.R., Matsuo T. (2000) Activated Sludge Model No.1. IWA STR No.9.',
  cons: ['COD', 'N', 'Q', 'C'],
  SO: 'SO', NO: 'SNO', NH: 'SNH', ALK: 'SALK', RB: 'SS', AUT: 'XBA', HET: 'XBH',
  comps: [
    { id: 'SI', name: 'COD hòa tan trơ', u: 'g COD/m³' },
    { id: 'SS', name: 'Cơ chất dễ phân hủy (RBCOD)', u: 'g COD/m³' },
    { id: 'XI', name: 'COD hạt trơ', u: 'g COD/m³', part: 1 },
    { id: 'XS', name: 'Cơ chất chậm phân hủy', u: 'g COD/m³', part: 1 },
    { id: 'XBH', name: 'Sinh khối dị dưỡng', u: 'g COD/m³', part: 1 },
    { id: 'XBA', name: 'Sinh khối tự dưỡng (nitrat hóa)', u: 'g COD/m³', part: 1 },
    { id: 'XP', name: 'Sản phẩm phân hủy sinh khối', u: 'g COD/m³', part: 1 },
    { id: 'SO', name: 'Oxy hòa tan', u: 'g O₂/m³' },
    { id: 'SNO', name: 'Nitrat + nitrit', u: 'g N/m³' },
    { id: 'SNH', name: 'Amoni', u: 'g N/m³' },
    { id: 'SND', name: 'N hữu cơ hòa tan', u: 'g N/m³' },
    { id: 'XND', name: 'N hữu cơ dạng hạt', u: 'g N/m³', part: 1 },
    { id: 'SALK', name: 'Độ kiềm', u: 'mol/m³' },
    { id: 'SN2', name: 'Khí N₂ hòa tan', u: 'g N/m³' },
    { id: 'STIC', name: 'Carbon vô cơ tổng (TIC)', u: 'mol C/m³' },
    { id: 'XISS', name: 'Chất rắn vô cơ (ISS)', u: 'g TSS/m³', part: 1 }
  ],
  params: [
    { id: 'muH', v: 6.0, u: '1/d', d: 'Tốc độ sinh trưởng cực đại dị dưỡng μH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'KS', v: 20, u: 'g COD/m³', d: 'Hằng số bán bão hòa cơ chất KS', g: 'Dị dưỡng' },
    { id: 'KOH', v: 0.2, u: 'g O₂/m³', d: 'Hằng số bán bão hòa O₂ (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KNO', v: 0.5, u: 'g N/m³', d: 'Hằng số bán bão hòa nitrat', g: 'Dị dưỡng' },
    { id: 'bH', v: 0.62, u: '1/d', d: 'Hệ số phân hủy dị dưỡng bH', th: 1.04, g: 'Dị dưỡng' },
    { id: 'etag', v: 0.8, u: '-', d: 'Hệ số hiệu chỉnh sinh trưởng thiếu khí ηg', g: 'Dị dưỡng' },
    { id: 'kh', v: 3.0, u: 'g XS/(g XBH·d)', d: 'Tốc độ thủy phân cực đại kh', th: 1.04, g: 'Thủy phân' },
    { id: 'KX', v: 0.03, u: 'g XS/g XBH', d: 'Hằng số bán bão hòa thủy phân KX', g: 'Thủy phân' },
    { id: 'etah', v: 0.4, u: '-', d: 'Hệ số hiệu chỉnh thủy phân thiếu khí ηh', g: 'Thủy phân' },
    { id: 'ka', v: 0.08, u: 'm³/(g COD·d)', d: 'Tốc độ amon hóa ka', th: 1.04, g: 'Thủy phân' },
    { id: 'muA', v: 0.8, u: '1/d', d: 'Tốc độ sinh trưởng cực đại tự dưỡng μA', th: 1.103, g: 'Tự dưỡng' },
    { id: 'KNH', v: 1.0, u: 'g N/m³', d: 'Hằng số bán bão hòa amoni (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KOA', v: 0.4, u: 'g O₂/m³', d: 'Hằng số bán bão hòa O₂ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'bA', v: 0.15, u: '1/d', d: 'Hệ số phân hủy tự dưỡng bA', th: 1.04, g: 'Tự dưỡng' },
    { id: 'etabA', v: 1, u: '-', d: 'Hệ số giảm phân hủy tự dưỡng khi thiếu/kỵ khí ηb,A (1 = ASM gốc)', g: 'Tự dưỡng' },
    { id: 'KALK', v: 0, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (0 = bỏ qua)', g: 'Tự dưỡng' },
    { id: 'YH', v: 0.67, u: 'g COD/g COD', d: 'Hệ số sản lượng dị dưỡng YH', g: 'Hợp thức' },
    { id: 'YA', v: 0.24, u: 'g COD/g N', d: 'Hệ số sản lượng tự dưỡng YA', g: 'Hợp thức' },
    { id: 'fP', v: 0.08, u: '-', d: 'Phần sinh khối thành sản phẩm trơ fP', g: 'Hợp thức' },
    { id: 'iXB', v: 0.086, u: 'g N/g COD', d: 'Hàm lượng N trong sinh khối iXB', g: 'Hợp thức' },
    { id: 'iXP', v: 0.06, u: 'g N/g COD', d: 'Hàm lượng N trong XP, XI iXP', g: 'Hợp thức' },
    { id: 'iCV', v: 1.48, u: 'g COD/g VSS', d: 'Tỷ lệ COD hạt / VSS', g: 'Biến tổng hợp' },
    { id: 'fBOD', v: 0.65, u: '-', d: 'Tỷ lệ BOD5 / BOD cuối', g: 'Biến tổng hợp' }
  ].concat(PH_PARAMS),
  composition(p) {
    const n = this.n, I = this.idx;
    const z = () => new Float64Array(n);
    const COD = z(), N = z(), Q = z(), C = z();
    ['SI', 'SS', 'XI', 'XS', 'XBH', 'XBA', 'XP'].forEach(k => { COD[I[k]] = 1; C[I[k]] = p.iCorg / 12; });
    COD[I.SO] = -1; COD[I.SNO] = -64 / 14; COD[I.SN2] = -24 / 14;
    N[I.SNO] = 1; N[I.SNH] = 1; N[I.SND] = 1; N[I.XND] = 1; N[I.SN2] = 1;
    N[I.XBH] = p.iXB; N[I.XBA] = p.iXB; N[I.XP] = p.iXP; N[I.XI] = p.iXP;
    Q[I.SNH] = 1 / 14; Q[I.SNO] = -1 / 14; Q[I.SALK] = -1;
    C[I.STIC] = 1;
    return { COD, N, Q, C };
  },
  procs: [
    { id: 'p1', name: 'Sinh trưởng hiếu khí dị dưỡng', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']],
      rate: 'μH·SS/(KS+SS)·SO/(KOH+SO)·XBH' },
    { id: 'p2', name: 'Sinh trưởng thiếu khí dị dưỡng (khử nitrat)', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [[{ SNO: 1, SN2: -1 }, 'COD'], ['SNH', 'N'], ['SALK', 'Q']],
      rate: 'μH·ηg·SS/(KS+SS)·KOH/(KOH+SO)·SNO/(KNO+SNO)·XBH' },
    { id: 'p3', name: 'Sinh trưởng hiếu khí tự dưỡng (nitrat hóa)', st: p => ({ XBA: 1, SNO: 1 / p.YA }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']],
      rate: 'μA·SNH/(KNH+SNH)·SO/(KOA+SO)·SALK/(KALK+SALK)·XBA' },
    { id: 'p4', name: 'Phân hủy dị dưỡng', st: p => ({ XBH: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bH·XBH' },
    { id: 'p5', name: 'Phân hủy tự dưỡng', st: p => ({ XBA: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bA·XBA' },
    { id: 'p6', name: 'Amon hóa N hữu cơ hòa tan', st: p => ({ SND: -1, SNH: 1 }), unk: [['SALK', 'Q']], rate: 'ka·SND·XBH' },
    { id: 'p7', name: 'Thủy phân hữu cơ hạt', st: p => ({ XS: -1, SS: 1 }), unk: [], rate: 'kh·(XS/XBH)/(KX+XS/XBH)·[SO/(KOH+SO)+ηh·KOH/(KOH+SO)·SNO/(KNO+SNO)]·XBH' },
    { id: 'p8', name: 'Thủy phân N hữu cơ hạt', st: p => ({ XND: -1, SND: 1 }), unk: [], rate: 'ρ7·XND/XS' }
  ],
  makeRates() {
    const I = this.idx;
    const SS = I.SS, XS = I.XS, XBH = I.XBH, XBA = I.XBA, SO = I.SO, SNO = I.SNO, SNH = I.SNH, SND = I.SND, XND = I.XND, SALK = I.SALK;
    return function (x, p, r) {
      const so = x[SO], sno = x[SNO], snh = x[SNH], ss = x[SS], xbh = x[XBH];
      const mS = ss / (p.KS + ss), oH = so / (p.KOH + so), iH = p.KOH / (p.KOH + so), mNO = sno / (p.KNO + sno);
      r[0] = p.muH * mS * oH * xbh;
      r[1] = p.muH * p.etag * mS * iH * mNO * xbh;
      const alk = p.KALK > 0 ? x[SALK] / (p.KALK + x[SALK]) : 1;
      r[2] = p.muA * snh / (p.KNH + snh) * so / (p.KOA + so) * alk * x[XBA] * phFactor(p);
      r[3] = p.bH * xbh;
      r[4] = p.bA * x[XBA] * (p.etabA === 1 ? 1 : so / (p.KOA + so) + p.etabA * p.KOA / (p.KOA + so));
      r[5] = p.ka * x[SND] * xbh;
      const xs = x[XS];
      r[6] = p.kh * xs / (p.KX * xbh + xs + 1e-12) * (oH + p.etah * iH * mNO) * xbh;
      r[7] = xs > 1e-9 ? r[6] * x[XND] / xs : 0;
    };
  },
  tssFactors(p) {
    const f = new Float64Array(this.n), I = this.idx;
    ['XI', 'XS', 'XBH', 'XBA', 'XP'].forEach(k => (f[I[k]] = 1 / p.iCV));
    f[I.XISS] = 1;
    return f;
  },
  compVars: [
    ['COD', 'COD', 'mg/L'], ['sCOD', 'COD hòa tan', 'mg/L'], ['BOD5', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['VSS', 'VSS', 'mg/L'],
    ['TKN', 'TKN', 'mgN/L'], ['NH4', 'NH₄-N', 'mgN/L'], ['NOx', 'NOx-N', 'mgN/L'], ['TN', 'TN', 'mgN/L'],
    ['DO', 'DO', 'mg/L'], ['Alk', 'Độ kiềm', 'mgCaCO₃/L'], ['pH', 'pH', '-']
  ],
  composites(x, p, o) {
    const I = this.idx;
    o.pH = CHEM.pH(this, x, p.T_ !== undefined ? p.T_ : 20);
    const xc = x[I.XI] + x[I.XS] + x[I.XBH] + x[I.XBA] + x[I.XP];
    o.COD = x[I.SI] + x[I.SS] + xc;
    o.sCOD = x[I.SI] + x[I.SS];
    o.BOD5 = p.fBOD * (x[I.SS] + x[I.XS] + (1 - p.fP) * (x[I.XBH] + x[I.XBA]));
    o.VSS = xc / p.iCV;
    o.TSS = o.VSS + x[I.XISS];
    o.NH4 = x[I.SNH];
    o.TKN = x[I.SNH] + x[I.SND] + x[I.XND] + p.iXB * (x[I.XBH] + x[I.XBA]) + p.iXP * (x[I.XP] + x[I.XI]);
    o.NOx = x[I.SNO];
    o.TN = o.TKN + o.NOx;
    o.DO = x[I.SO];
    o.Alk = x[I.SALK] * 50;
    return o;
  }
});

/* --------------------------------------------------------------------------
   ASM1N – ASM1 mở rộng nitơ: nitrat hóa 2 bước (AOB, NOB), anammox (AMX), comammox (CMX),
   khử nitrat 2 bước (NO₃→NO₂→N₂), ức chế amoniac tự do (FA) / axit nitrơ tự do (FNA) theo pH, T.
   Dùng cho xử lý nitơ dòng phụ (SHARON, DEMON, anammox MBBR) và dòng chính (comammox, nitrit hóa tắt).
   Tham khảo: Hiatt & Grady (2008) WER 80(11) – ASMN; Anthonisen et al. (1976); Strous et al. (1998);
   Wett (2007) – DEMON; Hellinga et al. (1998) – SHARON; Kits et al. (2017) Nature 549 – comammox.
   Tên biến giữ tương thích ASM1: SNO = NO₃-N, XBA = AOB.
   -------------------------------------------------------------------------- */
defineModel({
  id: 'ASM1N',
  fam: 'ASM1',
  name: 'ASM1N – nitrat hóa 2 bước + anammox + comammox (C, N)',
  ref: 'Hiatt W.C., Grady C.P.L. (2008) An updated process model for carbon oxidation, nitrification and denitrification. WER 80(11), 2145-2156; Strous M. et al. (1998) Appl. Microbiol. Biotechnol. 50, 589-596; Wett B. (2007) WST 56(7) 81-88; Kits K.D. et al. (2017) Nature 549, 269-272.',
  cons: ['COD', 'N', 'Q', 'C'],
  SO: 'SO', NO: 'SNO', NO2: 'SNO2', NH: 'SNH', ALK: 'SALK', RB: 'SS', AUT: 'XBA', HET: 'XBH',
  nitro: true,
  comps: [
    { id: 'SI', name: 'COD hòa tan trơ', u: 'g COD/m³' },
    { id: 'SS', name: 'Cơ chất dễ phân hủy (RBCOD)', u: 'g COD/m³' },
    { id: 'XI', name: 'COD hạt trơ', u: 'g COD/m³', part: 1 },
    { id: 'XS', name: 'Cơ chất chậm phân hủy', u: 'g COD/m³', part: 1 },
    { id: 'XBH', name: 'Sinh khối dị dưỡng', u: 'g COD/m³', part: 1 },
    { id: 'XBA', name: 'Vi khuẩn oxy hóa amoni AOB', u: 'g COD/m³', part: 1 },
    { id: 'XNOB', name: 'Vi khuẩn oxy hóa nitrit NOB', u: 'g COD/m³', part: 1 },
    { id: 'XAMX', name: 'Vi khuẩn anammox AMX', u: 'g COD/m³', part: 1 },
    { id: 'XCMX', name: 'Vi khuẩn comammox CMX (Nitrospira)', u: 'g COD/m³', part: 1 },
    { id: 'XP', name: 'Sản phẩm phân hủy sinh khối', u: 'g COD/m³', part: 1 },
    { id: 'SO', name: 'Oxy hòa tan', u: 'g O₂/m³' },
    { id: 'SNO2', name: 'Nitrit', u: 'g N/m³' },
    { id: 'SNO', name: 'Nitrat', u: 'g N/m³' },
    { id: 'SNH', name: 'Amoni', u: 'g N/m³' },
    { id: 'SND', name: 'N hữu cơ hòa tan', u: 'g N/m³' },
    { id: 'XND', name: 'N hữu cơ dạng hạt', u: 'g N/m³', part: 1 },
    { id: 'SALK', name: 'Độ kiềm', u: 'mol/m³' },
    { id: 'SN2', name: 'Khí N₂ hòa tan', u: 'g N/m³' },
    { id: 'STIC', name: 'Carbon vô cơ tổng (TIC)', u: 'mol C/m³' },
    { id: 'XISS', name: 'Chất rắn vô cơ (ISS)', u: 'g TSS/m³', part: 1 }
  ],
  params: [
    { id: 'muH', v: 6.0, u: '1/d', d: 'Tốc độ sinh trưởng cực đại dị dưỡng μH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'KS', v: 20, u: 'g COD/m³', d: 'Hằng số bán bão hòa cơ chất KS', g: 'Dị dưỡng' },
    { id: 'KOH', v: 0.2, u: 'g O₂/m³', d: 'Hằng số bán bão hòa O₂ (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KNO3', v: 0.2, u: 'g N/m³', d: 'Bán bão hòa NO₃ (khử nitrat bước 1)', g: 'Dị dưỡng' },
    { id: 'KNO2', v: 0.2, u: 'g N/m³', d: 'Bán bão hòa NO₂ (khử nitrit bước 2)', g: 'Dị dưỡng' },
    { id: 'etag3', v: 0.6, u: '-', d: 'Hệ số thiếu khí NO₃ → NO₂ ηg1', g: 'Dị dưỡng' },
    { id: 'etag2', v: 0.8, u: '-', d: 'Hệ số thiếu khí NO₂ → N₂ ηg2', g: 'Dị dưỡng' },
    { id: 'bH', v: 0.62, u: '1/d', d: 'Hệ số phân hủy dị dưỡng bH', th: 1.04, g: 'Dị dưỡng' },
    { id: 'kh', v: 3.0, u: 'g XS/(g XBH·d)', d: 'Tốc độ thủy phân cực đại kh', th: 1.04, g: 'Thủy phân' },
    { id: 'KX', v: 0.03, u: 'g XS/g XBH', d: 'Hằng số bán bão hòa thủy phân KX', g: 'Thủy phân' },
    { id: 'etah', v: 0.4, u: '-', d: 'Hệ số hiệu chỉnh thủy phân thiếu khí ηh', g: 'Thủy phân' },
    { id: 'ka', v: 0.08, u: 'm³/(g COD·d)', d: 'Tốc độ amon hóa ka', th: 1.04, g: 'Thủy phân' },
    { id: 'muAOB', v: 0.9, u: '1/d', d: 'μmax AOB', th: 1.072, g: 'AOB' },
    { id: 'KNHA', v: 0.75, u: 'g N/m³', d: 'Bán bão hòa NH₄ của AOB', g: 'AOB' },
    { id: 'KOAOB', v: 0.6, u: 'g O₂/m³', d: 'Bán bão hòa O₂ của AOB', g: 'AOB' },
    { id: 'bAOB', v: 0.15, u: '1/d', d: 'Phân hủy AOB', th: 1.029, g: 'AOB' },
    { id: 'YAOB', v: 0.18, u: 'g COD/g N', d: 'Sản lượng AOB', g: 'AOB' },
    { id: 'KIFAA', v: 150, u: 'mg NH₃-N/L', d: 'Ức chế FA lên AOB (Anthonisen 10–150; dòng phụ ~150)', g: 'AOB' },
    { id: 'KIFNAA', v: 0.5, u: 'mg HNO₂-N/L', d: 'Ức chế FNA lên AOB', g: 'AOB' },
    { id: 'muNOB', v: 0.7, u: '1/d', d: 'μmax NOB', th: 1.06, g: 'NOB' },
    { id: 'KNO2N', v: 0.2, u: 'g N/m³', d: 'Bán bão hòa NO₂ của NOB', g: 'NOB' },
    { id: 'KONOB', v: 0.5, u: 'g O₂/m³', d: 'Bán bão hòa O₂ của NOB (Nitrobacter 1–1,5; Nitrospira 0,2–0,5)', g: 'NOB' },
    { id: 'bNOB', v: 0.12, u: '1/d', d: 'Phân hủy NOB', th: 1.029, g: 'NOB' },
    { id: 'YNOB', v: 0.06, u: 'g COD/g N', d: 'Sản lượng NOB', g: 'NOB' },
    { id: 'KIFAN', v: 1.0, u: 'mg NH₃-N/L', d: 'Ức chế FA lên NOB (Anthonisen 0,1–1)', g: 'NOB' },
    { id: 'KIFNAN', v: 0.2, u: 'mg HNO₂-N/L', d: 'Ức chế FNA lên NOB', g: 'NOB' },
    { id: 'muAMX', v: 0.06, u: '1/d', d: 'μmax anammox (≈ 0,15/d ở 30 °C)', th: 1.096, g: 'Anammox' },
    { id: 'KNHX', v: 0.07, u: 'g N/m³', d: 'Bán bão hòa NH₄ của anammox', g: 'Anammox' },
    { id: 'KNO2X', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa NO₂ của anammox', g: 'Anammox' },
    { id: 'KIOX', v: 0.2, u: 'g O₂/m³', d: 'Hằng số ức chế O₂ anammox (biểu kiến – hạt/màng bảo vệ)', g: 'Anammox' },
    { id: 'KINO2X', v: 400, u: 'g N/m³', d: 'Ức chế NO₂ (Haldane) lên anammox', g: 'Anammox' },
    { id: 'bAMX', v: 0.003, u: '1/d', d: 'Phân hủy anammox', th: 1.03, g: 'Anammox' },
    { id: 'YAMX', v: 0.159, u: 'g COD/g NH₄-N', d: 'Sản lượng anammox (Strous 1998)', g: 'Anammox' },
    { id: 'rNO2X', v: 1.32, u: 'g N/g N', d: 'NO₂-N tiêu thụ / NH₄-N (Strous 1998)', g: 'Anammox' },
    { id: 'muCMX', v: 0.3, u: '1/d', d: 'μmax comammox (0 = tắt)', th: 1.06, g: 'Comammox' },
    { id: 'KNHC', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa NH₄ của comammox (ái lực cao)', g: 'Comammox' },
    { id: 'KOCMX', v: 0.3, u: 'g O₂/m³', d: 'Bán bão hòa O₂ của comammox', g: 'Comammox' },
    { id: 'KIFAC', v: 0.5, u: 'mg NH₃-N/L', d: 'Ức chế FA lên comammox', g: 'Comammox' },
    { id: 'bCMX', v: 0.08, u: '1/d', d: 'Phân hủy comammox', th: 1.03, g: 'Comammox' },
    { id: 'YCMX', v: 0.12, u: 'g COD/g N', d: 'Sản lượng comammox', g: 'Comammox' },
    { id: 'etabA', v: 0.5, u: '-', d: 'Hệ số giảm phân hủy tự dưỡng khi thiếu/kỵ khí', g: 'Tự dưỡng chung' },
    { id: 'YH', v: 0.67, u: 'g COD/g COD', d: 'Hệ số sản lượng dị dưỡng YH', g: 'Hợp thức' },
    { id: 'fP', v: 0.08, u: '-', d: 'Phần sinh khối thành sản phẩm trơ fP', g: 'Hợp thức' },
    { id: 'iXB', v: 0.086, u: 'g N/g COD', d: 'Hàm lượng N trong sinh khối iXB', g: 'Hợp thức' },
    { id: 'iXP', v: 0.06, u: 'g N/g COD', d: 'Hàm lượng N trong XP, XI iXP', g: 'Hợp thức' },
    { id: 'iCV', v: 1.48, u: 'g COD/g VSS', d: 'Tỷ lệ COD hạt / VSS', g: 'Biến tổng hợp' },
    { id: 'fBOD', v: 0.65, u: '-', d: 'Tỷ lệ BOD5 / BOD cuối', g: 'Biến tổng hợp' }
  ].concat(PH_PARAMS.map(q => q.id === 'pHinh' ? Object.assign({}, q, { v: 1 }) : q)),   // dòng phụ: độ kiềm giới hạn nitrit hóa qua pH → bật ức chế pH mặc định
  composition(p) {
    const n = this.n, I = this.idx;
    const z = () => new Float64Array(n);
    const COD = z(), N = z(), Q = z(), C = z();
    const org = ['SI', 'SS', 'XI', 'XS', 'XBH', 'XBA', 'XNOB', 'XAMX', 'XCMX', 'XP'];
    org.forEach(k => { COD[I[k]] = 1; C[I[k]] = p.iCorg / 12; });
    COD[I.SO] = -1; COD[I.SNO] = -64 / 14; COD[I.SNO2] = -48 / 14; COD[I.SN2] = -24 / 14;
    ['SNO', 'SNO2', 'SNH', 'SND', 'XND', 'SN2'].forEach(k => (N[I[k]] = 1));
    ['XBH', 'XBA', 'XNOB', 'XAMX', 'XCMX'].forEach(k => (N[I[k]] = p.iXB));
    N[I.XP] = p.iXP; N[I.XI] = p.iXP;
    Q[I.SNH] = 1 / 14; Q[I.SNO] = -1 / 14; Q[I.SNO2] = -1 / 14; Q[I.SALK] = -1;
    C[I.STIC] = 1;
    return { COD, N, Q, C };
  },
  procs: [
    { id: 'p1', name: 'Sinh trưởng hiếu khí dị dưỡng', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μH·SS/(KS+SS)·SO/(KOH+SO)·XBH' },
    { id: 'p2', name: 'Khử nitrat NO₃ → NO₂ (dị dưỡng)', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [[{ SNO: 1, SNO2: -1 }, 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μH·ηg1·SS/(KS+SS)·KOH/(KOH+SO)·SNO3/(KNO3+SNO3)·XBH' },
    { id: 'p3', name: 'Khử nitrit NO₂ → N₂ (dị dưỡng)', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [[{ SNO2: 1, SN2: -1 }, 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μH·ηg2·SS/(KS+SS)·KOH/(KOH+SO)·SNO2/(KNO2+SNO2)·XBH' },
    { id: 'p4', name: 'Nitrit hóa NH₄ → NO₂ (AOB)', st: p => ({ XBA: 1, SNO2: 1 / p.YAOB }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μAOB·SNH/(KNHA+SNH)·SO/(KOAOB+SO)·I_FA·I_FNA·XAOB' },
    { id: 'p5', name: 'Nitrat hóa NO₂ → NO₃ (NOB)', st: p => ({ XNOB: 1, SNO: 1 / p.YNOB, SNO2: -1 / p.YNOB }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μNOB·SNO2/(KNO2N+SNO2)·SO/(KONOB+SO)·I_FA·I_FNA·XNOB' },
    { id: 'p6', name: 'Anammox NH₄ + 1,32 NO₂ → N₂ + 0,26 NO₃', st: p => ({ XAMX: 1, SNH: -1 / p.YAMX, SNO2: -p.rNO2X / p.YAMX }), unk: [['SNO', 'COD'], ['SN2', 'N'], ['SALK', 'Q']], rate: 'μAMX·SNH/(KNHX+SNH)·SNO2/(KNO2X+SNO2+SNO2²/KINO2X)·KIOX/(KIOX+SO)·XAMX' },
    { id: 'p7', name: 'Comammox NH₄ → NO₃ (một bước)', st: p => ({ XCMX: 1, SNO: 1 / p.YCMX }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μCMX·SNH/(KNHC+SNH)·SO/(KOCMX+SO)·I_FA·XCMX' },
    { id: 'p8', name: 'Phân hủy dị dưỡng', st: p => ({ XBH: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bH·XBH' },
    { id: 'p9', name: 'Phân hủy AOB', st: p => ({ XBA: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bAOB·XAOB' },
    { id: 'p10', name: 'Phân hủy NOB', st: p => ({ XNOB: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bNOB·XNOB' },
    { id: 'p11', name: 'Phân hủy anammox', st: p => ({ XAMX: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bAMX·XAMX' },
    { id: 'p12', name: 'Phân hủy comammox', st: p => ({ XCMX: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bCMX·XCMX' },
    { id: 'p13', name: 'Amon hóa N hữu cơ hòa tan', st: p => ({ SND: -1, SNH: 1 }), unk: [['SALK', 'Q']], rate: 'ka·SND·XBH' },
    { id: 'p14', name: 'Thủy phân hữu cơ hạt', st: p => ({ XS: -1, SS: 1 }), unk: [], rate: 'kh·(XS/XBH)/(KX+XS/XBH)·[SO/(KOH+SO)+ηh·KOH/(KOH+SO)·NOx/(KNO3+NOx)]·XBH' },
    { id: 'p15', name: 'Thủy phân N hữu cơ hạt', st: p => ({ XND: -1, SND: 1 }), unk: [], rate: 'ρ14·XND/XS' }
  ],
  /* amoniac tự do & axit nitrơ tự do (Anthonisen 1976), mg N/L */
  freeNH3(snh, pH, T) { const e = Math.pow(10, pH); return snh * e / (Math.exp(6344 / (273.15 + T)) + e); },
  freeHNO2(sno2, pH, T) { return sno2 / (Math.exp(-2300 / (273.15 + T)) * Math.pow(10, pH)); },
  makeRates() {
    const I = this.idx, M = this;
    const SS = I.SS, XS = I.XS, XBH = I.XBH, XAOB = I.XBA, XNOB = I.XNOB, XAMX = I.XAMX, XCMX = I.XCMX, SO = I.SO, NO3 = I.SNO, NO2 = I.SNO2, SNH = I.SNH, SND = I.SND, XND = I.XND;
    return function (x, p, r) {
      const so = x[SO], no3 = x[NO3], no2 = x[NO2], snh = x[SNH], ss = x[SS], xbh = x[XBH];
      const pH = p.pHcur !== undefined ? p.pHcur : 7.2, T = p.T_ !== undefined ? p.T_ : 20;
      const FA = M.freeNH3(snh, pH, T), FNA = M.freeHNO2(no2, pH, T);
      const mS = ss / (p.KS + ss), oH = so / (p.KOH + so), iH = p.KOH / (p.KOH + so);
      const pf = phFactor(p);
      r[0] = p.muH * mS * oH * xbh;
      r[1] = p.muH * p.etag3 * mS * iH * no3 / (p.KNO3 + no3) * xbh;
      r[2] = p.muH * p.etag2 * mS * iH * no2 / (p.KNO2 + no2) * xbh;
      r[3] = p.muAOB * snh / (p.KNHA + snh) * so / (p.KOAOB + so) * p.KIFAA / (p.KIFAA + FA) * p.KIFNAA / (p.KIFNAA + FNA) * x[XAOB] * pf;
      r[4] = p.muNOB * no2 / (p.KNO2N + no2) * so / (p.KONOB + so) * p.KIFAN / (p.KIFAN + FA) * p.KIFNAN / (p.KIFNAN + FNA) * x[XNOB] * pf;
      r[5] = p.muAMX * snh / (p.KNHX + snh) * no2 / (p.KNO2X + no2 + no2 * no2 / p.KINO2X) * p.KIOX / (p.KIOX + so) * x[XAMX] * pf;
      r[6] = p.muCMX * snh / (p.KNHC + snh) * so / (p.KOCMX + so) * p.KIFAC / (p.KIFAC + FA) * x[XCMX] * pf;
      const fb = p.etabA === 1 ? 1 : so / (p.KOAOB + so) + p.etabA * p.KOAOB / (p.KOAOB + so);
      r[7] = p.bH * xbh;
      r[8] = p.bAOB * x[XAOB] * fb;
      r[9] = p.bNOB * x[XNOB] * fb;
      r[10] = p.bAMX * x[XAMX];
      r[11] = p.bCMX * x[XCMX] * fb;
      r[12] = p.ka * x[SND] * xbh;
      const xs = x[XS], nox = no3 + no2;
      r[13] = p.kh * xs / (p.KX * xbh + xs + 1e-12) * (oH + p.etah * iH * nox / (p.KNO3 + nox)) * xbh;
      r[14] = xs > 1e-9 ? r[13] * x[XND] / xs : 0;
    };
  },
  tssFactors(p) {
    const f = new Float64Array(this.n), I = this.idx;
    ['XI', 'XS', 'XBH', 'XBA', 'XNOB', 'XAMX', 'XCMX', 'XP'].forEach(k => (f[I[k]] = 1 / p.iCV));
    f[I.XISS] = 1;
    return f;
  },
  compVars: [
    ['COD', 'COD', 'mg/L'], ['sCOD', 'COD hòa tan', 'mg/L'], ['BOD5', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['VSS', 'VSS', 'mg/L'],
    ['TKN', 'TKN', 'mgN/L'], ['NH4', 'NH₄-N', 'mgN/L'], ['NO2', 'NO₂-N', 'mgN/L'], ['NO3', 'NO₃-N', 'mgN/L'], ['NOx', 'NOx-N', 'mgN/L'], ['TN', 'TN', 'mgN/L'],
    ['FA', 'NH₃ tự do (FA)', 'mgN/L'], ['FNA', 'HNO₂ tự do (FNA)', 'mgN/L'],
    ['DO', 'DO', 'mg/L'], ['Alk', 'Độ kiềm', 'mgCaCO₃/L'], ['pH', 'pH', '-']
  ],
  composites(x, p, o) {
    const I = this.idx, T = p.T_ !== undefined ? p.T_ : 20;
    o.pH = CHEM.pH(this, x, T);
    const bio = x[I.XBH] + x[I.XBA] + x[I.XNOB] + x[I.XAMX] + x[I.XCMX];
    const xc = x[I.XI] + x[I.XS] + bio + x[I.XP];
    o.COD = x[I.SI] + x[I.SS] + xc;
    o.sCOD = x[I.SI] + x[I.SS];
    o.BOD5 = p.fBOD * (x[I.SS] + x[I.XS] + (1 - p.fP) * bio);
    o.VSS = xc / p.iCV;
    o.TSS = o.VSS + x[I.XISS];
    o.NH4 = x[I.SNH];
    o.TKN = x[I.SNH] + x[I.SND] + x[I.XND] + p.iXB * bio + p.iXP * (x[I.XP] + x[I.XI]);
    o.NO2 = x[I.SNO2]; o.NO3 = x[I.SNO];
    o.NOx = o.NO2 + o.NO3;
    o.TN = o.TKN + o.NOx;
    o.FA = this.freeNH3(Math.max(x[I.SNH], 0), o.pH, T); o.FNA = this.freeHNO2(Math.max(x[I.SNO2], 0), o.pH, T);
    o.DO = x[I.SO];
    o.Alk = x[I.SALK] * 50;
    o.AOB = x[I.XBA]; o.NOB = x[I.XNOB]; o.AMX = x[I.XAMX]; o.CMX = x[I.XCMX];
    return o;
  }
});

/* --------------------------------------------------------------------------
   ASM1N-N2O – ASM1N + phát thải N₂O: AOB hai con đường (khử nitrat bởi AOB – NN; oxy hóa NH₂OH – NH₂OH),
   khử nitrat dị dưỡng 4 bước NO₃→NO₂→NO→N₂O→N₂, NO/N₂O thoát khí theo kLa (tỷ lệ khuếch tán ≈ 0,89·kLa_O₂).
   Tham khảo: Ni B.-J. et al. (2014) ES&T 48, 3916-3924 (mô hình 2 con đường); Pocquet M. et al. (2016) WR 88, 948-959;
   Hiatt W.C., Grady C.P.L. (2008) WER 80(11) – ASMN 4 bước; Massara T.M. et al. (2018) ChemEng J 335 (ASM2d-N2O).
   Thông số N₂O mặc định là giá trị điển hình – cần hiệu chỉnh theo đo đạc khí thải (EF thường 0,1 – 2 % TN vào).
   -------------------------------------------------------------------------- */
(function () {
  const B = MODELS.ASM1N;
  const comps = B.comps.map(c => Object.assign({}, c)).concat([
    { id: 'SNH2OH', name: 'Hydroxylamin NH₂OH', u: 'g N/m³' },
    { id: 'SNOg', name: 'Nitơ oxit NO (hòa tan)', u: 'g N/m³' },
    { id: 'SN2O', name: 'N₂O hòa tan', u: 'g N/m³' }
  ]);
  const drop = new Set(['etag3', 'etag2']);
  const params = B.params.filter(q => !drop.has(q.id)).map(q => Object.assign({}, q)).concat([
    { id: 'etag2', v: 0.28, u: '-', d: 'ηg NO₃ → NO₂ (Hiatt & Grady)', g: 'Dị dưỡng N₂O' },
    { id: 'etag3', v: 0.16, u: '-', d: 'ηg NO₂ → NO', g: 'Dị dưỡng N₂O' },
    { id: 'etag4', v: 0.35, u: '-', d: 'ηg NO → N₂O', g: 'Dị dưỡng N₂O' },
    { id: 'etag5', v: 0.35, u: '-', d: 'ηg N₂O → N₂', g: 'Dị dưỡng N₂O' },
    { id: 'KNOh', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa NO (dị dưỡng)', g: 'Dị dưỡng N₂O' },
    { id: 'KN2O', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa N₂O (dị dưỡng)', g: 'Dị dưỡng N₂O' },
    { id: 'KOH5', v: 0.1, u: 'g O₂/m³', d: 'Ức chế O₂ lên khử N₂O (enzym Nos nhạy O₂ nhất)', g: 'Dị dưỡng N₂O' },
    { id: 'KI3NO', v: 0.5, u: 'g N/m³', d: 'Ức chế NO lên khử NO₂', g: 'Dị dưỡng N₂O' },
    { id: 'KI4NO', v: 0.3, u: 'g N/m³', d: 'Ức chế NO (Haldane) lên khử NO', g: 'Dị dưỡng N₂O' },
    { id: 'KI5NO', v: 0.075, u: 'g N/m³', d: 'Ức chế NO lên khử N₂O', g: 'Dị dưỡng N₂O' },
    { id: 'qHA', v: 50, u: 'g N/(g COD·d)', d: 'Tốc độ oxy hóa NH₂OH → NO (HAO) – NH₂OH là chất trung gian', th: 1.072, g: 'AOB N₂O' },
    { id: 'KNH2OH', v: 0.9, u: 'g N/m³', d: 'Bán bão hòa NH₂OH (AOB)', g: 'AOB N₂O' },
    { id: 'qHAO', v: 50, u: 'g N/(g COD·d)', d: 'Tốc độ oxy hóa NO → NO₂ (HAO)', th: 1.072, g: 'AOB N₂O' },
    { id: 'KNOA', v: 0.0003, u: 'g N/m³', d: 'Bán bão hòa NO (AOB)', g: 'AOB N₂O' },
    { id: 'qNN', v: 0.06, u: 'g N/(g COD·d)', d: 'Tốc độ khử nitrat bởi AOB (NO₂ → N₂O) – hiệu chỉnh', th: 1.072, g: 'AOB N₂O' },
    { id: 'KNO2NN', v: 0.2, u: 'g N/m³', d: 'Bán bão hòa NO₂ con đường NN', g: 'AOB N₂O' },
    { id: 'KONN', v: 0.2, u: 'g O₂/m³', d: 'Haldane O₂ con đường NN – bán bão hòa', g: 'AOB N₂O' },
    { id: 'KIONN', v: 0.8, u: 'g O₂/m³', d: 'Haldane O₂ con đường NN – ức chế (NN mạnh ở DO thấp)', g: 'AOB N₂O' },
    { id: 'qNH2OH', v: 0.1, u: 'g N/(g COD·d)', d: 'Tốc độ con đường NH₂OH (NO → N₂O) – hiệu chỉnh', th: 1.072, g: 'AOB N₂O' },
    { id: 'GWPN2O', v: 273, u: 'kg CO₂e/kg N₂O', d: 'Hệ số tiềm năng nóng lên N₂O (IPCC AR6; AR5 = 265)', g: 'Khí nhà kính' }
  ]);
  const NQ = [['SNH', 'N'], ['SALK', 'Q']];
  const procs = [
    { id: 'p1', name: 'Sinh trưởng hiếu khí dị dưỡng', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [['SO', 'COD'], ...NQ], rate: 'μH·SS/(KS+SS)·SO/(KOH+SO)·XBH' },
    { id: 'h1', name: 'Khử nitrat NO₃ → NO₂', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [[{ SNO: 1, SNO2: -1 }, 'COD'], ...NQ], rate: 'μH·ηg2·SS/(KS+SS)·KOH/(KOH+SO)·NO₃/(KNO3+NO₃)·XBH' },
    { id: 'h2', name: 'Khử nitrit NO₂ → NO', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [[{ SNO2: 1, SNOg: -1 }, 'COD'], ...NQ], rate: 'μH·ηg3·…·NO₂/(KNO2+NO₂)·KI3NO/(KI3NO+NO)·XBH' },
    { id: 'h3', name: 'Khử NO → N₂O', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [[{ SNOg: 1, SN2O: -1 }, 'COD'], ...NQ], rate: 'μH·ηg4·…·NO/(KNOh+NO+NO²/KI4NO)·XBH' },
    { id: 'h4', name: 'Khử N₂O → N₂', st: p => ({ SS: -1 / p.YH, XBH: 1 }), unk: [[{ SN2O: 1, SN2: -1 }, 'COD'], ...NQ], rate: 'μH·ηg5·SS/(KS+SS)·KOH5/(KOH5+SO)·N₂O/(KN2O+N₂O)·KI5NO/(KI5NO+NO)·XBH' },
    { id: 'a1', name: 'AOB: NH₄ → NH₂OH (AMO, sinh trưởng)', st: p => ({ SNH: -1 / p.YAOB, SNH2OH: 1 / p.YAOB, XBA: 1 }), unk: [['SO', 'COD'], ...NQ], rate: 'μAOB·NH₄/(KNHA+NH₄)·SO/(KOAOB+SO)·I_FA·I_FNA·XAOB' },
    { id: 'a2', name: 'AOB: NH₂OH → NO (HAO)', st: () => ({ SNH2OH: -1, SNOg: 1 }), unk: [['SO', 'COD'], ['SALK', 'Q']], rate: 'qHA·NH₂OH/(KNH2OH+NH₂OH)·SO/(KOAOB+SO)·XAOB' },
    { id: 'a3', name: 'AOB: NO → NO₂ (HAO)', st: () => ({ SNOg: -1, SNO2: 1 }), unk: [['SO', 'COD'], ['SALK', 'Q']], rate: 'qHAO·NO/(KNOA+NO)·SO/(KOAOB+SO)·XAOB' },
    { id: 'a4', name: 'AOB: khử nitrat bởi AOB NO₂ + NH₂OH → N₂O (NN)', st: () => ({ SNH2OH: -1, SNO2: -1, SN2O: 2 }), unk: [['SALK', 'Q']], rate: 'qNN·NH₂OH/(KNH2OH+NH₂OH)·NO₂/(KNO2NN+NO₂)·SO/(KONN+SO+SO²/KIONN)·XAOB' },
    { id: 'a5', name: 'AOB: con đường NH₂OH NO + ½NH₂OH → 1,5 N₂O', st: () => ({ SNOg: -1, SNH2OH: -0.5, SN2O: 1.5 }), unk: [], rate: 'qNH2OH·NH₂OH/(KNH2OH+NH₂OH)·NO/(KNOA+NO)·XAOB' },
    { id: 'p5', name: 'Nitrat hóa NO₂ → NO₃ (NOB)', st: p => ({ XNOB: 1, SNO: 1 / p.YNOB, SNO2: -1 / p.YNOB }), unk: [['SO', 'COD'], ...NQ], rate: 'μNOB·NO₂/(KNO2N+NO₂)·SO/(KONOB+SO)·I_FA·I_FNA·XNOB' },
    { id: 'p6', name: 'Anammox', st: p => ({ XAMX: 1, SNH: -1 / p.YAMX, SNO2: -p.rNO2X / p.YAMX }), unk: [['SNO', 'COD'], ['SN2', 'N'], ['SALK', 'Q']], rate: 'μAMX·…·XAMX' },
    { id: 'p7', name: 'Comammox NH₄ → NO₃', st: p => ({ XCMX: 1, SNO: 1 / p.YCMX }), unk: [['SO', 'COD'], ...NQ], rate: 'μCMX·…·XCMX' },
    { id: 'p8', name: 'Phân hủy dị dưỡng', st: p => ({ XBH: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bH·XBH' },
    { id: 'p9', name: 'Phân hủy AOB', st: p => ({ XBA: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bAOB·XAOB' },
    { id: 'p10', name: 'Phân hủy NOB', st: p => ({ XNOB: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bNOB·XNOB' },
    { id: 'p11', name: 'Phân hủy anammox', st: p => ({ XAMX: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bAMX·XAMX' },
    { id: 'p12', name: 'Phân hủy comammox', st: p => ({ XCMX: -1, XP: p.fP, XS: 1 - p.fP }), unk: [['XND', 'N']], rate: 'bCMX·XCMX' },
    { id: 'p13', name: 'Amon hóa N hữu cơ hòa tan', st: () => ({ SND: -1, SNH: 1 }), unk: [['SALK', 'Q']], rate: 'ka·SND·XBH' },
    { id: 'p14', name: 'Thủy phân hữu cơ hạt', st: () => ({ XS: -1, SS: 1 }), unk: [], rate: 'kh·…·XBH' },
    { id: 'p15', name: 'Thủy phân N hữu cơ hạt', st: () => ({ XND: -1, SND: 1 }), unk: [], rate: 'ρ14·XND/XS' }
  ];
  defineModel({
    id: 'ASM1N2O', fam: 'ASM1',
    name: 'ASM1N-N2O – nitơ mở rộng + phát thải N₂O (AOB 2 con đường, khử nitrat 4 bước)',
    ref: 'Ni B.-J., Peng L., Law Y., Guo J., Yuan Z. (2014) Modeling of nitrous oxide production by AOB enriched nitrifying sludge – two-pathway model, ES&T 48, 3916-3924; Pocquet M., Wu Z., Queinnec I., Spérandio M. (2016) WR 88, 948-959; Hiatt W.C., Grady C.P.L. (2008) WER 80(11); Massara T.M. et al. (2018) Chem. Eng. J. 335, 185-196.',
    cons: ['COD', 'N', 'Q', 'C'],
    SO: 'SO', NO: 'SNO', NO2: 'SNO2', NH: 'SNH', ALK: 'SALK', RB: 'SS', AUT: 'XBA', HET: 'XBH',
    nitro: true, n2o: true,
    // khí hòa tan thoát ra theo hệ số trao đổi khí (bộ giải dùng 0,89·kLa + kLa bề mặt); cod = COD tương đương / g N
    strip: [{ id: 'SN2O', cod: -32 / 14, name: 'N₂O' }, { id: 'SNOg', cod: -40 / 14, name: 'NO' }],
    comps, params,
    composition(p) {
      const n = this.n, I = this.idx, z = () => new Float64Array(n);
      const COD = z(), N = z(), Q = z(), C = z();
      ['SI', 'SS', 'XI', 'XS', 'XBH', 'XBA', 'XNOB', 'XAMX', 'XCMX', 'XP'].forEach(k => { COD[I[k]] = 1; C[I[k]] = p.iCorg / 12; });
      COD[I.SO] = -1; COD[I.SNO] = -64 / 14; COD[I.SNO2] = -48 / 14; COD[I.SN2] = -24 / 14;
      COD[I.SNH2OH] = -16 / 14; COD[I.SNOg] = -40 / 14; COD[I.SN2O] = -32 / 14;
      ['SNO', 'SNO2', 'SNH', 'SND', 'XND', 'SN2', 'SNH2OH', 'SNOg', 'SN2O'].forEach(k => (N[I[k]] = 1));
      ['XBH', 'XBA', 'XNOB', 'XAMX', 'XCMX'].forEach(k => (N[I[k]] = p.iXB));
      N[I.XP] = p.iXP; N[I.XI] = p.iXP;
      Q[I.SNH] = 1 / 14; Q[I.SNO] = -1 / 14; Q[I.SNO2] = -1 / 14; Q[I.SALK] = -1;
      C[I.STIC] = 1;
      return { COD, N, Q, C };
    },
    procs,
    freeNH3: B.freeNH3, freeHNO2: B.freeHNO2,
    makeRates() {
      const I = this.idx, M = this;
      const SS = I.SS, XS = I.XS, XBH = I.XBH, XAOB = I.XBA, XNOB = I.XNOB, XAMX = I.XAMX, XCMX = I.XCMX, SO = I.SO, NO3 = I.SNO, NO2 = I.SNO2, SNH = I.SNH, SND = I.SND, XND = I.XND;
      const HA = I.SNH2OH, NO = I.SNOg, N2O = I.SN2O;
      return function (x, p, r) {
        const so = x[SO], no3 = x[NO3], no2 = x[NO2], snh = x[SNH], ss = x[SS], xbh = x[XBH], ha = x[HA], no = x[NO], n2o = x[N2O], xa = x[XAOB];
        const pH = p.pHcur !== undefined ? p.pHcur : 7.2, T = p.T_ !== undefined ? p.T_ : 20;
        const FA = M.freeNH3(snh, pH, T), FNA = M.freeHNO2(no2, pH, T);
        const mS = ss / (p.KS + ss), oH = so / (p.KOH + so), iH = p.KOH / (p.KOH + so), pf = phFactor(p);
        r[0] = p.muH * mS * oH * xbh;
        r[1] = p.muH * p.etag2 * mS * iH * no3 / (p.KNO3 + no3) * xbh;
        r[2] = p.muH * p.etag3 * mS * iH * no2 / (p.KNO2 + no2) * p.KI3NO / (p.KI3NO + no) * xbh;
        r[3] = p.muH * p.etag4 * mS * iH * no / (p.KNOh + no + no * no / p.KI4NO) * xbh;
        r[4] = p.muH * p.etag5 * mS * p.KOH5 / (p.KOH5 + so) * n2o / (p.KN2O + n2o) * p.KI5NO / (p.KI5NO + no) * xbh;
        const inh = p.KIFAA / (p.KIFAA + FA) * p.KIFNAA / (p.KIFNAA + FNA);
        const mHA = ha / (p.KNH2OH + ha), oA = so / (p.KOAOB + so);
        r[5] = p.muAOB * snh / (p.KNHA + snh) * oA * inh * xa * pf;
        r[6] = p.qHA * mHA * oA * xa * pf;
        r[7] = p.qHAO * no / (p.KNOA + no) * oA * xa * pf;
        r[8] = p.qNN * mHA * no2 / (p.KNO2NN + no2) * so / (p.KONN + so + so * so / p.KIONN) * xa * pf;
        r[9] = p.qNH2OH * mHA * no / (p.KNOA + no) * xa * pf;
        r[10] = p.muNOB * no2 / (p.KNO2N + no2) * so / (p.KONOB + so) * p.KIFAN / (p.KIFAN + FA) * p.KIFNAN / (p.KIFNAN + FNA) * x[XNOB] * pf;
        r[11] = p.muAMX * snh / (p.KNHX + snh) * no2 / (p.KNO2X + no2 + no2 * no2 / p.KINO2X) * p.KIOX / (p.KIOX + so) * x[XAMX] * pf;
        r[12] = p.muCMX * snh / (p.KNHC + snh) * so / (p.KOCMX + so) * p.KIFAC / (p.KIFAC + FA) * x[XCMX] * pf;
        const fb = p.etabA === 1 ? 1 : so / (p.KOAOB + so) + p.etabA * p.KOAOB / (p.KOAOB + so);
        r[13] = p.bH * xbh; r[14] = p.bAOB * xa * fb; r[15] = p.bNOB * x[XNOB] * fb; r[16] = p.bAMX * x[XAMX]; r[17] = p.bCMX * x[XCMX] * fb;
        r[18] = p.ka * x[SND] * xbh;
        const xs = x[XS], nox = no3 + no2;
        r[19] = p.kh * xs / (p.KX * xbh + xs + 1e-12) * (oH + p.etah * iH * nox / (p.KNO3 + nox)) * xbh;
        r[20] = xs > 1e-9 ? r[19] * x[XND] / xs : 0;
      };
    },
    tssFactors: B.tssFactors,
    compVars: B.compVars.concat([['N2O', 'N₂O-N hòa tan', 'mgN/L'], ['NOg', 'NO-N hòa tan', 'mgN/L'], ['NH2OH', 'NH₂OH-N', 'mgN/L']]),
    composites(x, p, o) {
      B.composites.call(this, x, p, o);
      const I = this.idx;
      o.N2O = x[I.SN2O]; o.NOg = x[I.SNOg]; o.NH2OH = x[I.SNH2OH];
      o.TKN += x[I.SNH2OH];
      o.TN += x[I.SNH2OH] + x[I.SNOg] + x[I.SN2O];
      return o;
    }
  });
})();

/* --------------------------------------------------------------------------
   ASM3 – Gujer W., Henze M., Mino T., van Loosdrecht M. (1999) WST 39(1), 183-193; IWA STR No.9 (2000).
   Dị dưỡng tích trữ cơ chất (XSTO) rồi sinh trưởng trên XSTO; hô hấp nội sinh thay cho "chết – tái sinh";
   tự dưỡng hô hấp nội sinh hiếu khí/thiếu khí. Dạng biến tương thích họ ASM1 (XBH = XH, XBA = XA, XP = XI từ hô hấp nội sinh,
   N hữu cơ theo SND/XND + amon hóa) để dùng chung dòng vào, giao diện ADM1, khởi tạo và giao diện người dùng.
   -------------------------------------------------------------------------- */
defineModel({
  id: 'ASM3', fam: 'ASM1',
  nitrAlias: { muA: 'muA', bA: 'bAO2', KOA: 'KAO2', KNH: 'KANH4' },   // tên tham số nitrat hóa cho công cụ chẩn đoán (fix.js)
  name: 'ASM3 (IWA, 2000) – tích trữ XSTO, hô hấp nội sinh (C, N)',
  ref: 'Gujer W., Henze M., Mino T., van Loosdrecht M.C.M. (1999) Activated Sludge Model No. 3. Wat. Sci. Tech. 39(1), 183-193; Henze M. et al. (2000) IWA STR No.9. Biến N hữu cơ SND/XND theo cách ASM1 (biến thể tương thích).',
  cons: ['COD', 'N', 'Q', 'C'],
  SO: 'SO', NO: 'SNO', NH: 'SNH', ALK: 'SALK', RB: 'SS', AUT: 'XBA', HET: 'XBH',
  comps: [
    { id: 'SI', name: 'COD hòa tan trơ', u: 'g COD/m³' },
    { id: 'SS', name: 'Cơ chất dễ phân hủy (RBCOD)', u: 'g COD/m³' },
    { id: 'XI', name: 'COD hạt trơ', u: 'g COD/m³', part: 1 },
    { id: 'XS', name: 'Cơ chất chậm phân hủy', u: 'g COD/m³', part: 1 },
    { id: 'XBH', name: 'Sinh khối dị dưỡng XH', u: 'g COD/m³', part: 1 },
    { id: 'XBA', name: 'Sinh khối tự dưỡng XA (nitrat hóa)', u: 'g COD/m³', part: 1 },
    { id: 'XSTO', name: 'Chất dự trữ nội bào (PHA, glycogen) XSTO', u: 'g COD/m³', part: 1 },
    { id: 'XP', name: 'Phần trơ từ hô hấp nội sinh (fI)', u: 'g COD/m³', part: 1 },
    { id: 'SO', name: 'Oxy hòa tan', u: 'g O₂/m³' },
    { id: 'SNO', name: 'Nitrat + nitrit', u: 'g N/m³' },
    { id: 'SNH', name: 'Amoni', u: 'g N/m³' },
    { id: 'SND', name: 'N hữu cơ hòa tan', u: 'g N/m³' },
    { id: 'XND', name: 'N hữu cơ dạng hạt', u: 'g N/m³', part: 1 },
    { id: 'SALK', name: 'Độ kiềm', u: 'mol/m³' },
    { id: 'SN2', name: 'Khí N₂ hòa tan', u: 'g N/m³' },
    { id: 'STIC', name: 'Carbon vô cơ tổng (TIC)', u: 'mol C/m³' },
    { id: 'XISS', name: 'Chất rắn vô cơ (ISS)', u: 'g TSS/m³', part: 1 }
  ],
  params: [
    { id: 'kH', v: 3, u: 'g COD/(g COD·d)', d: 'Tốc độ thủy phân kH', th: 1.04, g: 'Thủy phân' },
    { id: 'KX', v: 1, u: 'g XS/g XH', d: 'Bán bão hòa thủy phân KX', g: 'Thủy phân' },
    { id: 'ka', v: 0.08, u: 'm³/(g COD·d)', d: 'Tốc độ amon hóa ka (bổ sung cho SND)', th: 1.04, g: 'Thủy phân' },
    { id: 'kSTO', v: 5, u: 'g COD/(g COD·d)', d: 'Tốc độ tích trữ kSTO', th: 1.072, g: 'Dị dưỡng' },
    { id: 'etaNOX', v: 0.6, u: '-', d: 'Hệ số thiếu khí ηNOX', g: 'Dị dưỡng' },
    { id: 'KO2', v: 0.2, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KNOX', v: 0.5, u: 'g N/m³', d: 'Bán bão hòa NOx (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KS', v: 2, u: 'g COD/m³', d: 'Bán bão hòa SS cho tích trữ', g: 'Dị dưỡng' },
    { id: 'KSTO', v: 1, u: 'g XSTO/g XH', d: 'Bán bão hòa XSTO', g: 'Dị dưỡng' },
    { id: 'muH', v: 2, u: '1/d', d: 'Tốc độ sinh trưởng cực đại dị dưỡng μH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'KNH4', v: 0.01, u: 'g N/m³', d: 'Bán bão hòa NH₄ (dinh dưỡng, dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KALK', v: 0.1, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'bHO2', v: 0.2, u: '1/d', d: 'Hô hấp nội sinh hiếu khí XH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'bHNOX', v: 0.1, u: '1/d', d: 'Hô hấp nội sinh thiếu khí XH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'bSTOO2', v: 0.2, u: '1/d', d: 'Hô hấp hiếu khí XSTO', th: 1.072, g: 'Dị dưỡng' },
    { id: 'bSTONOX', v: 0.1, u: '1/d', d: 'Hô hấp thiếu khí XSTO', th: 1.072, g: 'Dị dưỡng' },
    { id: 'muA', v: 1.0, u: '1/d', d: 'Tốc độ sinh trưởng cực đại tự dưỡng μA', th: 1.111, g: 'Tự dưỡng' },
    { id: 'KANH4', v: 1, u: 'g N/m³', d: 'Bán bão hòa NH₄ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KAO2', v: 0.5, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KAALK', v: 0.5, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'bAO2', v: 0.15, u: '1/d', d: 'Hô hấp nội sinh hiếu khí XA', th: 1.116, g: 'Tự dưỡng' },
    { id: 'bANOX', v: 0.05, u: '1/d', d: 'Hô hấp nội sinh thiếu khí XA', th: 1.116, g: 'Tự dưỡng' },
    { id: 'YSTOO2', v: 0.85, u: 'g COD/g COD', d: 'Sản lượng tích trữ hiếu khí', g: 'Hợp thức' },
    { id: 'YSTONOX', v: 0.80, u: 'g COD/g COD', d: 'Sản lượng tích trữ thiếu khí', g: 'Hợp thức' },
    { id: 'YHO2', v: 0.63, u: 'g COD/g COD', d: 'Sản lượng dị dưỡng hiếu khí', g: 'Hợp thức' },
    { id: 'YHNOX', v: 0.54, u: 'g COD/g COD', d: 'Sản lượng dị dưỡng thiếu khí', g: 'Hợp thức' },
    { id: 'YA', v: 0.24, u: 'g COD/g N', d: 'Sản lượng tự dưỡng YA', g: 'Hợp thức' },
    { id: 'fI', v: 0.2, u: '-', d: 'Phần trơ từ hô hấp nội sinh fI', g: 'Hợp thức' },
    { id: 'iXB', v: 0.07, u: 'g N/g COD', d: 'N trong sinh khối iN,BM', g: 'Hợp thức' },
    { id: 'iXP', v: 0.02, u: 'g N/g COD', d: 'N trong XI/XP iN,XI', g: 'Hợp thức' },
    { id: 'iCV', v: 1.48, u: 'g COD/g VSS', d: 'Tỷ lệ COD hạt / VSS', g: 'Biến tổng hợp' },
    { id: 'fBOD', v: 0.65, u: '-', d: 'Tỷ lệ BOD5 / BOD cuối', g: 'Biến tổng hợp' }
  ].concat(PH_PARAMS),
  composition(p) {
    const n = this.n, I = this.idx, z = () => new Float64Array(n);
    const COD = z(), N = z(), Q = z(), C = z();
    ['SI', 'SS', 'XI', 'XS', 'XBH', 'XBA', 'XSTO', 'XP'].forEach(k => { COD[I[k]] = 1; C[I[k]] = p.iCorg / 12; });
    COD[I.SO] = -1; COD[I.SNO] = -64 / 14; COD[I.SN2] = -24 / 14;
    N[I.SNO] = 1; N[I.SNH] = 1; N[I.SND] = 1; N[I.XND] = 1; N[I.SN2] = 1;
    N[I.XBH] = p.iXB; N[I.XBA] = p.iXB; N[I.XP] = p.iXP; N[I.XI] = p.iXP;
    Q[I.SNH] = 1 / 14; Q[I.SNO] = -1 / 14; Q[I.SALK] = -1;
    C[I.STIC] = 1;
    return { COD, N, Q, C };
  },
  procs: [
    { id: 'p1', name: 'Thủy phân XS → SS', st: () => ({ XS: -1, SS: 1 }), unk: [], rate: 'kH·(XS/XH)/(KX+XS/XH)·XH' },
    { id: 'p2', name: 'Tích trữ hiếu khí SS → XSTO', st: p => ({ SS: -1, XSTO: p.YSTOO2 }), unk: [['SO', 'COD']], rate: 'kSTO·SO/(KO2+SO)·SS/(KS+SS)·XH' },
    { id: 'p3', name: 'Tích trữ thiếu khí SS → XSTO', st: p => ({ SS: -1, XSTO: p.YSTONOX }), unk: [[{ SNO: 1, SN2: -1 }, 'COD'], ['SALK', 'Q']], rate: 'kSTO·ηNOX·KO2/(KO2+SO)·SNO/(KNOX+SNO)·SS/(KS+SS)·XH' },
    { id: 'p4', name: 'Sinh trưởng hiếu khí XH trên XSTO', st: p => ({ XSTO: -1 / p.YHO2, XBH: 1 }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μH·SO/(KO2+SO)·SNH/(KNH4+SNH)·SALK/(KALK+SALK)·(XSTO/XH)/(KSTO+XSTO/XH)·XH' },
    { id: 'p5', name: 'Sinh trưởng thiếu khí XH (khử nitrat)', st: p => ({ XSTO: -1 / p.YHNOX, XBH: 1 }), unk: [[{ SNO: 1, SN2: -1 }, 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μH·ηNOX·KO2/(KO2+SO)·SNO/(KNOX+SNO)·…·XH' },
    { id: 'p6', name: 'Hô hấp nội sinh hiếu khí XH', st: p => ({ XBH: -1, XP: p.fI }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'bH,O2·SO/(KO2+SO)·XH' },
    { id: 'p7', name: 'Hô hấp nội sinh thiếu khí XH', st: p => ({ XBH: -1, XP: p.fI }), unk: [[{ SNO: 1, SN2: -1 }, 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'bH,NOX·KO2/(KO2+SO)·SNO/(KNOX+SNO)·XH' },
    { id: 'p8', name: 'Hô hấp hiếu khí XSTO', st: () => ({ XSTO: -1 }), unk: [['SO', 'COD']], rate: 'bSTO,O2·SO/(KO2+SO)·XSTO' },
    { id: 'p9', name: 'Hô hấp thiếu khí XSTO', st: () => ({ XSTO: -1 }), unk: [[{ SNO: 1, SN2: -1 }, 'COD'], ['SALK', 'Q']], rate: 'bSTO,NOX·KO2/(KO2+SO)·SNO/(KNOX+SNO)·XSTO' },
    { id: 'p10', name: 'Sinh trưởng hiếu khí XA (nitrat hóa)', st: p => ({ XBA: 1, SNO: 1 / p.YA }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'μA·SO/(KA,O2+SO)·SNH/(KA,NH4+SNH)·SALK/(KA,ALK+SALK)·XA' },
    { id: 'p11', name: 'Hô hấp nội sinh hiếu khí XA', st: p => ({ XBA: -1, XP: p.fI }), unk: [['SO', 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'bA,O2·SO/(KA,O2+SO)·XA' },
    { id: 'p12', name: 'Hô hấp nội sinh thiếu khí XA', st: p => ({ XBA: -1, XP: p.fI }), unk: [[{ SNO: 1, SN2: -1 }, 'COD'], ['SNH', 'N'], ['SALK', 'Q']], rate: 'bA,NOX·KA,O2/(KA,O2+SO)·SNO/(KNOX+SNO)·XA' },
    { id: 'p13', name: 'Amon hóa N hữu cơ hòa tan', st: () => ({ SND: -1, SNH: 1 }), unk: [['SALK', 'Q']], rate: 'ka·SND·XH' },
    { id: 'p14', name: 'Thủy phân N hữu cơ hạt', st: () => ({ XND: -1, SND: 1 }), unk: [], rate: 'ρ1·XND/XS' }
  ],
  makeRates() {
    const I = this.idx;
    const SS = I.SS, XS = I.XS, XH = I.XBH, XA = I.XBA, XSTO = I.XSTO, SO = I.SO, SNO = I.SNO, SNH = I.SNH, SALK = I.SALK, SND = I.SND, XND = I.XND;
    return function (x, p, r) {
      const so = x[SO], sno = x[SNO], snh = x[SNH], ss = x[SS], xh = x[XH], xsto = x[XSTO], alk = x[SALK];
      const oH = so / (p.KO2 + so), iH = p.KO2 / (p.KO2 + so), mN = sno / (p.KNOX + sno), mS = ss / (p.KS + ss);
      const xs = x[XS];
      r[0] = p.kH * xs / (p.KX * xh + xs + 1e-12) * xh;
      r[1] = p.kSTO * oH * mS * xh;
      r[2] = p.kSTO * p.etaNOX * iH * mN * mS * xh;
      const nut = snh / (p.KNH4 + snh) * alk / (p.KALK + alk), sto = xsto / (p.KSTO * xh + xsto + 1e-12);
      r[3] = p.muH * oH * nut * sto * xh;
      r[4] = p.muH * p.etaNOX * iH * mN * nut * sto * xh;
      r[5] = p.bHO2 * oH * xh;
      r[6] = p.bHNOX * iH * mN * xh;
      r[7] = p.bSTOO2 * oH * xsto;
      r[8] = p.bSTONOX * iH * mN * xsto;
      const oA = so / (p.KAO2 + so);
      r[9] = p.muA * oA * snh / (p.KANH4 + snh) * alk / (p.KAALK + alk) * x[XA] * phFactor(p);
      r[10] = p.bAO2 * oA * x[XA];
      r[11] = p.bANOX * p.KAO2 / (p.KAO2 + so) * mN * x[XA];
      r[12] = p.ka * x[SND] * xh;
      r[13] = xs > 1e-9 ? r[0] * x[XND] / xs : 0;
    };
  },
  tssFactors(p) {
    const f = new Float64Array(this.n), I = this.idx;
    ['XI', 'XS', 'XBH', 'XBA', 'XSTO', 'XP'].forEach(k => (f[I[k]] = 1 / p.iCV));
    f[I.XISS] = 1;
    return f;
  },
  compVars: [
    ['COD', 'COD', 'mg/L'], ['sCOD', 'COD hòa tan', 'mg/L'], ['BOD5', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['VSS', 'VSS', 'mg/L'],
    ['TKN', 'TKN', 'mgN/L'], ['NH4', 'NH₄-N', 'mgN/L'], ['NOx', 'NOx-N', 'mgN/L'], ['TN', 'TN', 'mgN/L'],
    ['XSTO', 'Chất dự trữ XSTO', 'mgCOD/L'], ['DO', 'DO', 'mg/L'], ['Alk', 'Độ kiềm', 'mgCaCO₃/L'], ['pH', 'pH', '-']
  ],
  composites(x, p, o) {
    const I = this.idx;
    o.pH = CHEM.pH(this, x, p.T_ !== undefined ? p.T_ : 20);
    const bio = x[I.XBH] + x[I.XBA];
    const xc = x[I.XI] + x[I.XS] + bio + x[I.XSTO] + x[I.XP];
    o.COD = x[I.SI] + x[I.SS] + xc;
    o.sCOD = x[I.SI] + x[I.SS];
    o.BOD5 = p.fBOD * (x[I.SS] + x[I.XS] + x[I.XSTO] + (1 - p.fI) * bio);
    o.VSS = xc / p.iCV;
    o.TSS = o.VSS + x[I.XISS];
    o.NH4 = x[I.SNH];
    o.TKN = x[I.SNH] + x[I.SND] + x[I.XND] + p.iXB * bio + p.iXP * (x[I.XP] + x[I.XI]);
    o.NOx = x[I.SNO];
    o.TN = o.TKN + o.NOx;
    o.XSTO = x[I.XSTO];
    o.DO = x[I.SO];
    o.Alk = x[I.SALK] * 50;
    return o;
  }
});

/* --------------------------------------------------------------------------
   ASM2d
   -------------------------------------------------------------------------- */
defineModel({
  id: 'ASM2d',
  name: 'ASM2d (IWA, 1999) + XISS – C, N, P sinh học & hóa học',
  ref: 'Henze M., Gujer W., Mino T., Matsuo T., Wentzel M.C., Marais G.v.R., van Loosdrecht M.C.M. (1999) Activated Sludge Model No.2d, ASM2d. Wat. Sci. Tech. 39(1), 165-182.',
  cons: ['COD', 'N', 'P', 'Q', 'C'],
  SO: 'SO2', NO: 'SNO3', NH: 'SNH4', ALK: 'SALK', PO: 'SPO4', RB: 'SA', AUT: 'XAUT', HET: 'XH',
  comps: [
    { id: 'SO2', name: 'Oxy hòa tan', u: 'g O₂/m³' },
    { id: 'SF', name: 'Cơ chất lên men được', u: 'g COD/m³' },
    { id: 'SA', name: 'Axit béo bay hơi (VFA)', u: 'g COD/m³' },
    { id: 'SI', name: 'COD hòa tan trơ', u: 'g COD/m³' },
    { id: 'SNH4', name: 'Amoni', u: 'g N/m³' },
    { id: 'SN2', name: 'Khí N₂ hòa tan', u: 'g N/m³' },
    { id: 'SNO3', name: 'Nitrat + nitrit', u: 'g N/m³' },
    { id: 'SPO4', name: 'Phosphat', u: 'g P/m³' },
    { id: 'SALK', name: 'Độ kiềm', u: 'mol/m³' },
    { id: 'STIC', name: 'Carbon vô cơ tổng (TIC)', u: 'mol C/m³' },
    { id: 'XI', name: 'COD hạt trơ', u: 'g COD/m³', part: 1 },
    { id: 'XS', name: 'Cơ chất chậm phân hủy', u: 'g COD/m³', part: 1 },
    { id: 'XH', name: 'Sinh khối dị dưỡng', u: 'g COD/m³', part: 1 },
    { id: 'XPAO', name: 'Sinh khối PAO', u: 'g COD/m³', part: 1 },
    { id: 'XPP', name: 'Poly-phosphat', u: 'g P/m³', part: 1 },
    { id: 'XPHA', name: 'PHA nội bào', u: 'g COD/m³', part: 1 },
    { id: 'XAUT', name: 'Sinh khối nitrat hóa', u: 'g COD/m³', part: 1 },
    { id: 'XMeOH', name: 'Hydroxit kim loại', u: 'g TSS/m³', part: 1 },
    { id: 'XMeP', name: 'Phosphat kim loại', u: 'g TSS/m³', part: 1 },
    { id: 'XISS', name: 'Chất rắn vô cơ (ISS)', u: 'g TSS/m³', part: 1 }
  ],
  params: [
    { id: 'fSI', v: 0, u: '-', d: 'Phần SI sinh ra khi thủy phân fSI', g: 'Hợp thức' },
    { id: 'YH', v: 0.625, u: 'g COD/g COD', d: 'Sản lượng dị dưỡng YH', g: 'Hợp thức' },
    { id: 'fXI', v: 0.1, u: '-', d: 'Phần XI sinh ra khi phân hủy fXI', g: 'Hợp thức' },
    { id: 'YPAO', v: 0.625, u: 'g COD/g COD', d: 'Sản lượng PAO YPAO', g: 'Hợp thức' },
    { id: 'YPO4', v: 0.40, u: 'g P/g COD', d: 'P giải phóng / PHA lưu trữ YPO4', g: 'Hợp thức' },
    { id: 'YPHA', v: 0.20, u: 'g COD/g P', d: 'PHA tiêu thụ / PP lưu trữ YPHA', g: 'Hợp thức' },
    { id: 'YA', v: 0.24, u: 'g COD/g N', d: 'Sản lượng tự dưỡng YA', g: 'Hợp thức' },
    { id: 'iNSI', v: 0.01, u: 'g N/g COD', d: 'N trong SI', g: 'Thành phần' },
    { id: 'iNSF', v: 0.03, u: 'g N/g COD', d: 'N trong SF', g: 'Thành phần' },
    { id: 'iNXI', v: 0.02, u: 'g N/g COD', d: 'N trong XI', g: 'Thành phần' },
    { id: 'iNXS', v: 0.04, u: 'g N/g COD', d: 'N trong XS', g: 'Thành phần' },
    { id: 'iNBM', v: 0.07, u: 'g N/g COD', d: 'N trong sinh khối', g: 'Thành phần' },
    { id: 'iPSI', v: 0, u: 'g P/g COD', d: 'P trong SI', g: 'Thành phần' },
    { id: 'iPSF', v: 0.01, u: 'g P/g COD', d: 'P trong SF', g: 'Thành phần' },
    { id: 'iPXI', v: 0.01, u: 'g P/g COD', d: 'P trong XI', g: 'Thành phần' },
    { id: 'iPXS', v: 0.01, u: 'g P/g COD', d: 'P trong XS', g: 'Thành phần' },
    { id: 'iPBM', v: 0.02, u: 'g P/g COD', d: 'P trong sinh khối', g: 'Thành phần' },
    { id: 'iTSSXI', v: 0.75, u: 'g TSS/g COD', d: 'TSS/COD của XI', g: 'Thành phần' },
    { id: 'iTSSXS', v: 0.75, u: 'g TSS/g COD', d: 'TSS/COD của XS', g: 'Thành phần' },
    { id: 'iTSSBM', v: 0.90, u: 'g TSS/g COD', d: 'TSS/COD của sinh khối', g: 'Thành phần' },
    { id: 'iTSSPP', v: 3.23, u: 'g TSS/g P', d: 'TSS/P của XPP', g: 'Thành phần' },
    { id: 'iTSSPHA', v: 0.60, u: 'g TSS/g COD', d: 'TSS/COD của XPHA', g: 'Thành phần' },
    { id: 'iCV', v: 1.42, u: 'g COD/g VSS', d: 'Tỷ lệ COD hạt hữu cơ / VSS', g: 'Biến tổng hợp' },
    { id: 'fBOD', v: 0.65, u: '-', d: 'Tỷ lệ BOD5 / BOD cuối', g: 'Biến tổng hợp' },
    { id: 'kh', v: 3.0, u: '1/d', d: 'Tốc độ thủy phân kh', th: 1.041, g: 'Thủy phân' },
    { id: 'etaNOh', v: 0.6, u: '-', d: 'Hệ số thủy phân thiếu khí ηNO3', g: 'Thủy phân' },
    { id: 'etafe', v: 0.4, u: '-', d: 'Hệ số thủy phân kỵ khí ηfe', g: 'Thủy phân' },
    { id: 'KO2h', v: 0.2, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (thủy phân)', g: 'Thủy phân' },
    { id: 'KNO3h', v: 0.5, u: 'g N/m³', d: 'Bán bão hòa NO₃ (thủy phân)', g: 'Thủy phân' },
    { id: 'KX', v: 0.1, u: 'g XS/g XH', d: 'Bán bão hòa XS/XH', g: 'Thủy phân' },
    { id: 'muH', v: 6.0, u: '1/d', d: 'Sinh trưởng cực đại dị dưỡng μH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'qfe', v: 3.0, u: 'g SF/(g XH·d)', d: 'Tốc độ lên men qfe', th: 1.072, g: 'Dị dưỡng' },
    { id: 'etaNOH', v: 0.8, u: '-', d: 'Hệ số sinh trưởng thiếu khí ηNO3', g: 'Dị dưỡng' },
    { id: 'bH', v: 0.4, u: '1/d', d: 'Phân hủy dị dưỡng bH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'KO2H', v: 0.2, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KF', v: 4.0, u: 'g COD/m³', d: 'Bán bão hòa SF', g: 'Dị dưỡng' },
    { id: 'Kfe', v: 4.0, u: 'g COD/m³', d: 'Bán bão hòa lên men SF', g: 'Dị dưỡng' },
    { id: 'KAH', v: 4.0, u: 'g COD/m³', d: 'Bán bão hòa SA (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KNO3H', v: 0.5, u: 'g N/m³', d: 'Bán bão hòa NO₃ (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KNH4H', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa NH₄ (dinh dưỡng)', g: 'Dị dưỡng' },
    { id: 'KPH', v: 0.01, u: 'g P/m³', d: 'Bán bão hòa PO₄ (dinh dưỡng)', g: 'Dị dưỡng' },
    { id: 'KALKH', v: 0.1, u: 'mol/m³', d: 'Bán bão hòa độ kiềm', g: 'Dị dưỡng' },
    { id: 'qPHA', v: 3.0, u: 'g PHA/(g PAO·d)', d: 'Tốc độ lưu trữ PHA qPHA', th: 1.041, g: 'PAO' },
    { id: 'qPP', v: 1.5, u: 'g PP/(g PAO·d)', d: 'Tốc độ lưu trữ PP qPP', th: 1.041, g: 'PAO' },
    { id: 'muPAO', v: 1.0, u: '1/d', d: 'Sinh trưởng cực đại PAO μPAO', th: 1.041, g: 'PAO' },
    { id: 'bPAO', v: 0.2, u: '1/d', d: 'Phân hủy PAO bPAO', th: 1.072, g: 'PAO' },
    { id: 'bPP', v: 0.2, u: '1/d', d: 'Phân hủy XPP bPP', th: 1.072, g: 'PAO' },
    { id: 'bPHA', v: 0.2, u: '1/d', d: 'Phân hủy XPHA bPHA', th: 1.072, g: 'PAO' },
    { id: 'etaNOP', v: 0.6, u: '-', d: 'Hệ số thiếu khí PAO ηNO3', g: 'PAO' },
    { id: 'KO2P', v: 0.2, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (PAO)', g: 'PAO' },
    { id: 'KNO3P', v: 0.5, u: 'g N/m³', d: 'Bán bão hòa NO₃ (PAO)', g: 'PAO' },
    { id: 'KAP', v: 4.0, u: 'g COD/m³', d: 'Bán bão hòa SA (PAO)', g: 'PAO' },
    { id: 'KNH4P', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa NH₄ (PAO)', g: 'PAO' },
    { id: 'KPS', v: 0.2, u: 'g P/m³', d: 'Bán bão hòa PO₄ khi lưu trữ PP', g: 'PAO' },
    { id: 'KPP', v: 0.01, u: 'g P/m³', d: 'Bán bão hòa PO₄ (sinh trưởng PAO)', g: 'PAO' },
    { id: 'KALKP', v: 0.1, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (PAO)', g: 'PAO' },
    { id: 'KPPr', v: 0.01, u: 'g PP/g PAO', d: 'Bán bão hòa tỷ lệ XPP/XPAO', g: 'PAO' },
    { id: 'KMAX', v: 0.34, u: 'g PP/g PAO', d: 'Tỷ lệ XPP/XPAO cực đại', g: 'PAO' },
    { id: 'KIPP', v: 0.02, u: 'g PP/g PAO', d: 'Hằng số ức chế lưu trữ PP', g: 'PAO' },
    { id: 'KPHA', v: 0.01, u: 'g PHA/g PAO', d: 'Bán bão hòa tỷ lệ PHA/PAO', g: 'PAO' },
    { id: 'muA', v: 1.0, u: '1/d', d: 'Sinh trưởng cực đại tự dưỡng μAUT', th: 1.111, g: 'Tự dưỡng' },
    { id: 'bA', v: 0.15, u: '1/d', d: 'Phân hủy tự dưỡng bAUT', th: 1.116, g: 'Tự dưỡng' },
    { id: 'etabA', v: 1, u: '-', d: 'Hệ số giảm phân hủy tự dưỡng khi thiếu/kỵ khí ηb,A (1 = ASM gốc)', g: 'Tự dưỡng' },
    { id: 'KO2A', v: 0.5, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KNH4A', v: 1.0, u: 'g N/m³', d: 'Bán bão hòa NH₄ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KALKA', v: 0.5, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KPA', v: 0.01, u: 'g P/m³', d: 'Bán bão hòa PO₄ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'kPRE', v: 1.0, u: 'm³/(g Fe(OH)₃·d)', d: 'Tốc độ kết tủa kPRE', g: 'Kết tủa P' },
    { id: 'kRED', v: 0.6, u: '1/d', d: 'Tốc độ hòa tan lại kRED', g: 'Kết tủa P' },
    { id: 'KALKpr', v: 0.5, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (kết tủa)', g: 'Kết tủa P' }
  ].concat(PH_PARAMS),
  composition(p) {
    const n = this.n, I = this.idx;
    const z = () => new Float64Array(n);
    const COD = z(), N = z(), P = z(), Q = z(), C = z();
    ['SF', 'SA', 'SI', 'XI', 'XS', 'XH', 'XPAO', 'XPHA', 'XAUT'].forEach(k => { COD[I[k]] = 1; C[I[k]] = p.iCorg / 12; });
    C[I.SA] = 0.375 / 12; C[I.XPHA] = 0.333 / 12; C[I.STIC] = 1;
    COD[I.SO2] = -1; COD[I.SN2] = -24 / 14; COD[I.SNO3] = -64 / 14;
    N[I.SNH4] = 1; N[I.SN2] = 1; N[I.SNO3] = 1;
    N[I.SF] = p.iNSF; N[I.SI] = p.iNSI; N[I.XI] = p.iNXI; N[I.XS] = p.iNXS;
    N[I.XH] = N[I.XPAO] = N[I.XAUT] = p.iNBM;
    P[I.SPO4] = 1; P[I.XPP] = 1; P[I.XMeP] = 1 / 4.87;
    P[I.SF] = p.iPSF; P[I.SI] = p.iPSI; P[I.XI] = p.iPXI; P[I.XS] = p.iPXS;
    P[I.XH] = P[I.XPAO] = P[I.XAUT] = p.iPBM;
    Q[I.SA] = -1 / 64; Q[I.SNH4] = 1 / 14; Q[I.SNO3] = -1 / 14; Q[I.SPO4] = -1.5 / 31; Q[I.SALK] = -1; Q[I.XPP] = -1 / 31;
    return { COD, N, P, Q, C };
  },
  procs: (() => {
    const NOD = { SNO3: 1, SN2: -1 };
    const NPQ = [['SNH4', 'N'], ['SPO4', 'P'], ['SALK', 'Q']];
    const hyd = p => ({ XS: -1, SF: 1 - p.fSI, SI: p.fSI });
    const lysis = k => p => ({ [k]: -1, XI: p.fXI, XS: 1 - p.fXI });
    return [
      { id: 'p1', name: 'Thủy phân hiếu khí', st: hyd, unk: NPQ, rate: 'kh·SO2/(KO2+SO2)·(XS/XH)/(KX+XS/XH)·XH' },
      { id: 'p2', name: 'Thủy phân thiếu khí', st: hyd, unk: NPQ, rate: 'kh·ηNO3·KO2/(KO2+SO2)·SNO3/(KNO3+SNO3)·(XS/XH)/(KX+XS/XH)·XH' },
      { id: 'p3', name: 'Thủy phân kỵ khí', st: hyd, unk: NPQ, rate: 'kh·ηfe·KO2/(KO2+SO2)·KNO3/(KNO3+SNO3)·(XS/XH)/(KX+XS/XH)·XH' },
      { id: 'p4', name: 'Sinh trưởng XH trên SF (hiếu khí)', st: p => ({ SF: -1 / p.YH, XH: 1 }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μH·SO2/(KO2+SO2)·SF/(KF+SF)·SF/(SF+SA)·SNH4/(KNH4+SNH4)·SPO4/(KP+SPO4)·SALK/(KALK+SALK)·XH' },
      { id: 'p5', name: 'Sinh trưởng XH trên SA (hiếu khí)', st: p => ({ SA: -1 / p.YH, XH: 1 }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μH·SO2/(KO2+SO2)·SA/(KA+SA)·SA/(SF+SA)·SNH4/(KNH4+SNH4)·SPO4/(KP+SPO4)·SALK/(KALK+SALK)·XH' },
      { id: 'p6', name: 'Sinh trưởng XH trên SF (khử nitrat)', st: p => ({ SF: -1 / p.YH, XH: 1 }), unk: [[NOD, 'COD'], ...NPQ], rate: 'μH·ηNO3·KO2/(KO2+SO2)·SNO3/(KNO3+SNO3)·SF/(KF+SF)·SF/(SF+SA)·…·XH' },
      { id: 'p7', name: 'Sinh trưởng XH trên SA (khử nitrat)', st: p => ({ SA: -1 / p.YH, XH: 1 }), unk: [[NOD, 'COD'], ...NPQ], rate: 'μH·ηNO3·KO2/(KO2+SO2)·SNO3/(KNO3+SNO3)·SA/(KA+SA)·SA/(SF+SA)·…·XH' },
      { id: 'p8', name: 'Lên men', st: p => ({ SF: -1, SA: 1 }), unk: NPQ, rate: 'qfe·KO2/(KO2+SO2)·KNO3/(KNO3+SNO3)·SF/(Kfe+SF)·SALK/(KALK+SALK)·XH' },
      { id: 'p9', name: 'Phân hủy XH', st: lysis('XH'), unk: NPQ, rate: 'bH·XH' },
      { id: 'p10', name: 'Lưu trữ XPHA (kỵ khí)', st: p => ({ SA: -1, XPHA: 1, XPP: -p.YPO4 }), unk: [['SPO4', 'P'], ['SALK', 'Q']], rate: 'qPHA·SA/(KA+SA)·SALK/(KALK+SALK)·(XPP/XPAO)/(KPP+XPP/XPAO)·XPAO' },
      { id: 'p11', name: 'Lưu trữ XPP hiếu khí', st: p => ({ XPHA: -p.YPHA, XPP: 1 }), unk: [['SO2', 'COD'], ['SPO4', 'P'], ['SALK', 'Q']], rate: 'qPP·SO2/(KO2+SO2)·SPO4/(KPS+SPO4)·SALK/(KALK+SALK)·(XPHA/XPAO)/(KPHA+XPHA/XPAO)·(KMAX−XPP/XPAO)/(KIPP+KMAX−XPP/XPAO)·XPAO' },
      { id: 'p12', name: 'Lưu trữ XPP thiếu khí', st: p => ({ XPHA: -p.YPHA, XPP: 1 }), unk: [[NOD, 'COD'], ['SPO4', 'P'], ['SALK', 'Q']], rate: 'ρ11·ηNO3·KO2/SO2·SNO3/(KNO3+SNO3)' },
      { id: 'p13', name: 'Sinh trưởng PAO hiếu khí', st: p => ({ XPHA: -1 / p.YPAO, XPAO: 1 }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μPAO·SO2/(KO2+SO2)·SNH4/(KNH4+SNH4)·SPO4/(KP+SPO4)·SALK/(KALK+SALK)·(XPHA/XPAO)/(KPHA+XPHA/XPAO)·XPAO' },
      { id: 'p14', name: 'Sinh trưởng PAO thiếu khí', st: p => ({ XPHA: -1 / p.YPAO, XPAO: 1 }), unk: [[NOD, 'COD'], ...NPQ], rate: 'ρ13·ηNO3·KO2/SO2·SNO3/(KNO3+SNO3)' },
      { id: 'p15', name: 'Phân hủy XPAO', st: lysis('XPAO'), unk: NPQ, rate: 'bPAO·XPAO·SALK/(KALK+SALK)' },
      { id: 'p16', name: 'Phân hủy XPP', st: p => ({ XPP: -1 }), unk: [['SPO4', 'P'], ['SALK', 'Q']], rate: 'bPP·XPP·SALK/(KALK+SALK)' },
      { id: 'p17', name: 'Phân hủy XPHA', st: p => ({ XPHA: -1, SA: 1 }), unk: [['SALK', 'Q']], rate: 'bPHA·XPHA·SALK/(KALK+SALK)' },
      { id: 'p18', name: 'Sinh trưởng XAUT (nitrat hóa)', st: p => ({ XAUT: 1, SNO3: 1 / p.YA }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μAUT·SO2/(KO2+SO2)·SNH4/(KNH4+SNH4)·SPO4/(KP+SPO4)·SALK/(KALK+SALK)·XAUT' },
      { id: 'p19', name: 'Phân hủy XAUT', st: lysis('XAUT'), unk: NPQ, rate: 'bAUT·XAUT' },
      { id: 'p20', name: 'Kết tủa phosphat', st: p => ({ SPO4: -1, XMeOH: -3.45, XMeP: 4.87 }), unk: [['SALK', 'Q']], rate: 'kPRE·SPO4·XMeOH' },
      { id: 'p21', name: 'Hòa tan lại', st: p => ({ SPO4: 1, XMeOH: 3.45, XMeP: -4.87 }), unk: [['SALK', 'Q']], rate: 'kRED·XMeP·SALK/(KALK+SALK)' }
    ];
  })(),
  makeRates() {
    const I = this.idx;
    const iO = I.SO2, iF = I.SF, iA = I.SA, iNH = I.SNH4, iNO = I.SNO3, iPO = I.SPO4, iALK = I.SALK,
      iXS = I.XS, iXH = I.XH, iPAO = I.XPAO, iPP = I.XPP, iPHA = I.XPHA, iAUT = I.XAUT, iMeOH = I.XMeOH, iMeP = I.XMeP;
    return function (x, p, r) {
      const so = x[iO], sf = x[iF], sa = x[iA], snh = x[iNH], sno = x[iNO], spo = x[iPO], alk = x[iALK];
      const xs = x[iXS], xh = x[iXH], xpao = x[iPAO], xpp = x[iPP], xpha = x[iPHA], xaut = x[iAUT];
      // thủy phân
      const hyd = p.kh * xs / (p.KX * xh + xs + 1e-12) * xh;
      const oh = so / (p.KO2h + so), ioh = p.KO2h / (p.KO2h + so);
      const noh = sno / (p.KNO3h + sno), inoh = p.KNO3h / (p.KNO3h + sno);
      r[0] = hyd * oh;
      r[1] = hyd * p.etaNOh * ioh * noh;
      r[2] = hyd * p.etafe * ioh * inoh;
      // dị dưỡng
      const sfsa = sf + sa + 1e-12;
      const nutH = snh / (p.KNH4H + snh) * spo / (p.KPH + spo) * alk / (p.KALKH + alk);
      const oH = so / (p.KO2H + so), ioH = p.KO2H / (p.KO2H + so);
      const noH = sno / (p.KNO3H + sno), inoH = p.KNO3H / (p.KNO3H + sno);
      const gF = sf / (p.KF + sf) * sf / sfsa, gA = sa / (p.KAH + sa) * sa / sfsa;
      const muX = p.muH * nutH * xh;
      r[3] = muX * oH * gF;
      r[4] = muX * oH * gA;
      r[5] = muX * p.etaNOH * ioH * noH * gF;
      r[6] = muX * p.etaNOH * ioH * noH * gA;
      r[7] = p.qfe * ioH * inoH * sf / (p.Kfe + sf) * alk / (p.KALKH + alk) * xh;
      r[8] = p.bH * xh;
      // PAO
      const alkP = alk / (p.KALKP + alk);
      const ppr = xpp / (p.KPPr * xpao + xpp + 1e-12);
      r[9] = p.qPHA * sa / (p.KAP + sa) * alkP * ppr * xpao;
      const oP = so / (p.KO2P + so), ioP = p.KO2P / (p.KO2P + so), noP = sno / (p.KNO3P + sno);
      const phr = xpha / (p.KPHA * xpao + xpha + 1e-12);
      const rpp = xpao > 1e-9 ? xpp / xpao : 0;
      const room = Math.max(p.KMAX - rpp, 0);
      const pp = p.qPP * spo / (p.KPS + spo) * alkP * phr * room / (p.KIPP + room) * xpao;
      r[10] = pp * oP;
      r[11] = pp * p.etaNOP * ioP * noP;
      const gP = p.muPAO * snh / (p.KNH4P + snh) * spo / (p.KPP + spo) * alkP * phr * xpao;
      r[12] = gP * oP;
      r[13] = gP * p.etaNOP * ioP * noP;
      r[14] = p.bPAO * xpao * alkP;
      r[15] = p.bPP * xpp * alkP;
      r[16] = p.bPHA * xpha * alkP;
      // tự dưỡng
      r[17] = p.muA * so / (p.KO2A + so) * snh / (p.KNH4A + snh) * spo / (p.KPA + spo) * alk / (p.KALKA + alk) * xaut * phFactor(p);
      r[18] = p.bA * xaut * (p.etabA === 1 ? 1 : so / (p.KO2A + so) + p.etabA * p.KO2A / (p.KO2A + so));
      // kết tủa hóa học
      r[19] = p.kPRE * spo * x[iMeOH];
      r[20] = p.kRED * x[iMeP] * alk / (p.KALKpr + alk);
    };
  },
  tssFactors(p) {
    const f = new Float64Array(this.n), I = this.idx;
    f[I.XI] = p.iTSSXI; f[I.XS] = p.iTSSXS;
    f[I.XH] = f[I.XPAO] = f[I.XAUT] = p.iTSSBM;
    f[I.XPP] = p.iTSSPP; f[I.XPHA] = p.iTSSPHA;
    f[I.XMeOH] = 1; f[I.XMeP] = 1; f[I.XISS] = 1;
    return f;
  },
  compVars: [
    ['COD', 'COD', 'mg/L'], ['sCOD', 'COD hòa tan', 'mg/L'], ['BOD5', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['VSS', 'VSS', 'mg/L'],
    ['TKN', 'TKN', 'mgN/L'], ['NH4', 'NH₄-N', 'mgN/L'], ['NOx', 'NOx-N', 'mgN/L'], ['TN', 'TN', 'mgN/L'],
    ['TP', 'TP', 'mgP/L'], ['PO4', 'PO₄-P', 'mgP/L'], ['VFA', 'VFA', 'mgCOD/L'], ['DO', 'DO', 'mg/L'], ['Alk', 'Độ kiềm', 'mgCaCO₃/L'], ['pH', 'pH', '-']
  ],
  composites(x, p, o) {
    const I = this.idx;
    const bm = x[I.XH] + x[I.XPAO] + x[I.XAUT];
    o.pH = CHEM.pH(this, x, p.T_ !== undefined ? p.T_ : 20);
    o.COD = x[I.SF] + x[I.SA] + x[I.SI] + x[I.XI] + x[I.XS] + bm + x[I.XPHA];
    o.sCOD = x[I.SF] + x[I.SA] + x[I.SI];
    o.BOD5 = p.fBOD * (x[I.SF] + x[I.SA] + x[I.XS] + x[I.XPHA] + (1 - p.fXI) * bm);
    o.TSS = p.iTSSXI * x[I.XI] + p.iTSSXS * x[I.XS] + p.iTSSBM * bm + p.iTSSPP * x[I.XPP] + p.iTSSPHA * x[I.XPHA] + x[I.XMeOH] + x[I.XMeP] + x[I.XISS];
    o.VSS = Math.min(o.TSS, (x[I.XI] + x[I.XS] + bm + x[I.XPHA]) / p.iCV);
    o.NH4 = x[I.SNH4];
    o.TKN = x[I.SNH4] + p.iNSF * x[I.SF] + p.iNSI * x[I.SI] + p.iNXI * x[I.XI] + p.iNXS * x[I.XS] + p.iNBM * bm;
    o.NOx = x[I.SNO3];
    o.TN = o.TKN + o.NOx;
    o.PO4 = x[I.SPO4];
    o.TP = x[I.SPO4] + p.iPSF * x[I.SF] + p.iPSI * x[I.SI] + p.iPXI * x[I.XI] + p.iPXS * x[I.XS] + p.iPBM * bm + x[I.XPP] + x[I.XMeP] / 4.87;
    o.VFA = x[I.SA];
    o.DO = x[I.SO2];
    o.Alk = x[I.SALK] * 50;
    return o;
  }
});

/* --------------------------------------------------------------------------
   Biến thể "bùn hạt / bùn đặc" (densified, granular) – tự xây dựng:
   - mỗi sinh khối (và chất lưu trữ, sản phẩm trơ nội bào) có thêm một bản sao "trong hạt";
   - quá trình của phần hạt = quá trình gốc, tính trên sinh khối hạt với hằng số bán bão hòa
     nhân hệ số cản khuếch tán DR (K_hạt = K·DR), cơ chất hòa tan dùng chung với bông;
   - chuyển hóa bông ⇄ hạt bậc nhất (q_hạt hóa, q_vỡ hạt);
   - tổng hợp (COD, TSS, TKN, …) cộng phần hạt vào bản gốc; Fg = TSS hạt / TSS.
   Tách hạt bằng cyclone (đơn vị "Cyclone bùn hạt") và lắng nhanh ở bể lắng (v_hạt).
   -------------------------------------------------------------------------- */
const GRAN_PARAMS = [
  { id: 'DRS', v: 3, u: '-', d: 'Hệ số cản khuếch tán cơ chất hữu cơ (K_hạt = K·DR)', g: 'Bùn hạt' },
  { id: 'DROH', v: 4, u: '-', d: 'Hệ số cản khuếch tán O₂ cho dị dưỡng', g: 'Bùn hạt' },
  { id: 'DROA', v: 1.2, u: '-', d: 'Hệ số cản khuếch tán O₂ cho tự dưỡng', g: 'Bùn hạt' },
  { id: 'DROP', v: 1.2, u: '-', d: 'Hệ số cản khuếch tán O₂ / VFA / PO₄ cho PAO', g: 'Bùn hạt' },
  { id: 'DRN', v: 1.2, u: '-', d: 'Hệ số cản khuếch tán NH₄, NO₃', g: 'Bùn hạt' },
  { id: 'DRP', v: 2, u: '-', d: 'Hệ số cản khuếch tán PO₄', g: 'Bùn hạt' },
  { id: 'qFG', v: 0.02, u: '1/d', d: 'Tốc độ hạt hóa (bông → hạt) – thông số hiệu chỉnh', g: 'Bùn hạt' },
  { id: 'qGF', v: 0.02, u: '1/d', d: 'Tốc độ vỡ hạt / bào mòn (hạt → bông) – thông số hiệu chỉnh', g: 'Bùn hạt' }
];
function defineGranular(baseId, cfg) {
  const B = MODELS[baseId], nB = B.n, npB = B.np;
  const map = cfg.map;                                  // {gốc: tên hạt}
  const srcs = Object.keys(map);
  const comps = B.comps.concat(srcs.map(s => { const c = B.comps[B.idx[s]]; return { id: map[s], name: c.name + ' – trong hạt', u: c.u, part: 1, gran: 1 }; }));
  const remap = st => { const o = {}; for (const k in st) { const kk = map[k] || k; o[kk] = (o[kk] || 0) + st[k]; } return o; };
  const gProcIdx = B.procs.map((pr, j) => j).filter(j => !cfg.exclude.includes(j));
  const procs = B.procs.map(pr => Object.assign({}, pr))
    .concat(gProcIdx.map(j => { const pr = B.procs[j]; return Object.assign({}, pr, { id: 'g' + pr.id, name: pr.name + ' – hạt', st: p => remap(pr.st(p)), gran: 1 }); }))
    .concat(srcs.map(s => ({ id: 'fg_' + s, name: 'Hạt hóa ' + s, st: () => ({ [s]: -1, [map[s]]: 1 }), unk: [], rate: 'qFG·' + s, gran: 1 })))
    .concat(srcs.map(s => ({ id: 'gf_' + s, name: 'Vỡ hạt ' + map[s], st: () => ({ [map[s]]: -1, [s]: 1 }), unk: [], rate: 'qGF·' + map[s], gran: 1 })));
  const m = defineModel({
    id: cfg.id, fam: B.fam, name: cfg.name, ref: B.ref + ' · Biến thể bùn hạt tự xây dựng (hệ số cản khuếch tán, chuyển hóa bông ⇄ hạt).',
    cons: B.cons.slice(), SO: B.SO, NO: B.NO, NH: B.NH, ALK: B.ALK, PO: B.PO, RB: B.RB, AUT: B.AUT, HET: B.HET,
    comps, params: B.params.concat(GRAN_PARAMS), procs,
    composition(p) {
      const c0 = B.composition.call(B, p), out = {};
      for (const k in c0) { const a = new Float64Array(this.n); a.set(c0[k]); srcs.forEach(s => (a[this.idx[map[s]]] = c0[k][B.idx[s]])); out[k] = a; }
      return out;
    },
    makeRates() {
      const base = B.makeRates.call(B), I = this.idx;
      const gi = srcs.map(s => [B.idx[s], I[map[s]]]);
      const xg = new Float64Array(nB), rg = new Float64Array(npB);
      const DRmap = cfg.DR;
      let lastP = null, pg = null;
      const nG = gProcIdx.length, nS = srcs.length;
      return function (x, p, r) {
        base(x, p, r);
        if (p !== lastP) { pg = Object.assign({}, p); for (const k in DRmap) pg[k] = p[k] * p[DRmap[k]]; lastP = p; }
        pg.pHcur = p.pHcur;
        for (let k = 0; k < nB; k++) xg[k] = x[k];
        for (const [s, g] of gi) xg[s] = x[g];
        base(xg, pg, rg);
        for (let k = 0; k < nG; k++) r[npB + k] = rg[gProcIdx[k]];
        for (let k = 0; k < nS; k++) { r[npB + nG + k] = p.qFG * Math.max(x[gi[k][0]], 0); r[npB + nG + nS + k] = p.qGF * Math.max(x[gi[k][1]], 0); }
      };
    },
    tssFactors(p) {
      const f0 = B.tssFactors.call(B, p), f = new Float64Array(this.n); f.set(f0);
      srcs.forEach(s => (f[this.idx[map[s]]] = f0[B.idx[s]]));
      return f;
    },
    compVars: B.compVars.concat([['Fg', 'Tỷ lệ bùn hạt (TSS hạt / TSS)', '-']]),
    composites(x, p, o) {
      const xs = this._xs || (this._xs = new Float64Array(nB)), I = this.idx;
      for (let k = 0; k < nB; k++) xs[k] = x[k];
      let tg = 0;
      const tf = this._tf && this._tfP === p ? this._tf : (this._tf = this.tssFactors(Object.assign({}, this.defaults, p)), this._tfP = p, this._tf);
      for (const s of srcs) { const g = I[map[s]]; xs[B.idx[s]] += x[g]; tg += tf[g] * Math.max(x[g], 0); }
      B.composites.call(B, xs, p, o);
      o.Fg = o.TSS > 1e-9 ? tg / o.TSS : 0;
      return o;
    }
  });
  m.gran = srcs.map(s => [m.idx[s], m.idx[map[s]]]);
  m.granIdx = new Set(m.gran.map(a => a[1]));
  return m;
}
defineGranular('ASM1', {
  id: 'ASM1G', name: 'ASM1 + bùn hạt (densified)',
  map: { XBH: 'XBHg', XBA: 'XBAg', XP: 'XPg' }, exclude: [],
  DR: { KS: 'DRS', KOH: 'DROH', KNO: 'DRN', KNH: 'DRN', KOA: 'DROA' }
});
defineGranular('ASM2d', {
  id: 'ASM2dG', name: 'ASM2d + bùn hạt (densified)',
  map: { XH: 'XHg', XPAO: 'XPAOg', XPP: 'XPPg', XPHA: 'XPHAg', XAUT: 'XAUTg', XI: 'XIg' }, exclude: [19, 20],
  DR: { KF: 'DRS', KAH: 'DRS', Kfe: 'DRS', KO2H: 'DROH', KO2h: 'DROH', KNO3H: 'DRN', KNO3h: 'DRN', KNH4H: 'DRN', KNH4P: 'DRN', KNH4A: 'DRN',
    KPH: 'DRP', KPA: 'DRP', KPP: 'DROP', KPS: 'DROP', KO2P: 'DROP', KAP: 'DROP', KNO3P: 'DRN', KO2A: 'DROA' }
});

/* tiện ích: danh sách biến hiển thị (biến tổng hợp + biến trạng thái) */
function modelVarList(m) {
  return m.compVars.map(v => ({ id: v[0], name: v[1], u: v[2], kind: 'c' }))
    .concat(m.comps.map(c => ({ id: c.id, name: c.id + ' – ' + c.name, u: c.u, kind: 's' })));
}
