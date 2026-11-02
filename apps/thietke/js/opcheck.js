/* =====================================================================
   KIỂM TRA KHẢ NĂNG VẬN HÀNH CỦA HỆ THỐNG XLNT HIỆN HỮU
   Từ công nghệ, chất lượng nước vào, tiêu chuẩn xả và số liệu công trình – thiết bị đang có
   (thể tích bể, MLSS, máy thổi khí, bể lắng, hóa chất…) → dự đoán chất lượng nước ra bằng mô hình
   trạng thái ổn định M&E 5th: PT (7-46) cơ chất, (7-94) nitrat hóa, (8-20)/(8-21) bùn – giải SRT từ
   khối bùn đang giữ, (8-23) nhu cầu oxy, (5-70) khả năng cấp oxy của máy thổi → DO thực đạt,
   (8-56)…(8-58) khử nitrat, Bảng 8-30 EBPR, mục 6-4 khử P hóa học, Bảng 8-34 bể lắng, PT (8-50) gạn,
   Bảng 12-14 liều clo. Sau đó đề xuất điều kiện vận hành (lặp) để nước ra đạt tiêu chuẩn.
   ===================================================================== */
'use strict';

const OPS = (() => {
  const BATCH = { SBR: 1, ICEAS: 1, CTECH: 1, AGS: 1 };
  const MEDIA = { MBBR: 1, ORG: 1, BIOP: 1 };
  const MLE = { AO: 1, AAO: 1, MBR: 1, MBBR: 1, ORG: 1, BIOP: 1, KMBR: 1 };
  const MBRS = { MBR: 1, KMBR: 1 };
  const BNR = { AO: 1, AAO: 1, OD: 1, MBBR: 1, ORG: 1, BIOP: 1 };
  const KEYS = ['COD', 'BOD', 'TSS', 'TN', 'TKN', 'NH4', 'NO3', 'TP', 'OG', 'Color', 'Alk', 'Coli'];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const doSat = t => { const k = t + 273.15; return Math.exp(-139.34411 + 1.575701e5 / k - 6.642308e7 / k ** 2 + 1.2438e10 / k ** 3 - 8.621949e11 / k ** 4); };
  const CODN_MEOH = 2.86 / (1 - 1.42 * 0.3);          // g COD/g N khi dùng methanol (M&E PT 8-65, Y ≈ 0,3)

  /* ---------------- trạng thái mặc định ---------------- */
  function defaults(S) {
    const I = S.input, p = S.p;
    return {
      bio: 'AO', src: '', Q: +I.Q, kmax: +I.kmax, T: +I.Tmin, Tmax: +I.Tmax,
      q: { ...I.q }, meas: {},
      pre: 'none',
      Vana: 0, Van: 0, Vaer: 0, Vmem: 0, Am: 0,
      Vb: 0, fAer: 0.5, fSD: 0.33, TWL: 5, dH: 1.2, ncy: 0, fOff: 0, Rsel: 0, SND: 0,
      fOn: 1,
      MLSS: 3000, SVI: p.SVI, SRT: 0,
      Acl: 0, R: 0.5, IR: 2,
      aer: 'diff', blowCont: 0, air: 0, airMax: 0, SOTE: p.air_SOTE, Df: p.air_de, alpha: p.air_alpha, DO: 2, kWs: 0, kWsMax: 0, SAE: p.od_SAE,
      pacSim: 0, tert: 0, pacTert: 0, filt: 0, meoh: 0, naoh: 0, poly: 0, disinf: 'naocl', cl: p.cl_dose, uv: 30,
    };
  }
  function ensure(S) { S.op = Object.assign(defaults(S), S.op || {}); S.op.q = Object.assign({}, S.input.q, S.op.q || {}); S.op.meas = S.op.meas || {}; return S.op; }

  /* ---------------- nạp từ phương án thiết kế ---------------- */
  function fromDesign(S, R) {
    const p = S.p, c = R.alt.c, b = c.bio, u = R.um.bio;
    const id = k => (u.ids[k] && typeof u.ids[k].val === 'number' ? u.ids[k].val : 0);
    const o = defaults(S);
    Object.assign(o, { bio: b, src: R.alt.name, pre: c.chemPos === 'pre' ? 'cept' : 'none', tert: c.chemPos === 'post' ? 1 : 0, filt: c.filt !== 'none' ? 1 : 0, disinf: c.disinf, SVI: p.SVI, q: { ...S.input.q }, meas: (S.op && S.op.meas) || {} });
    o.R = u.RAS || 0; o.MLSS = id('MLSS') || 3000;
    const ua = R.um.ana;
    o.anaR = ua ? Object.fromEntries(['COD', 'BOD', 'TSS', 'TKN', 'NH4', 'NO3', 'TP', 'OG', 'Alk'].map(k => { const vi = R.um.bal.ids[k + '3'], vo = ua.ids[k + '_ra']; return [k, vi && vo && vi.val > 0 ? vo.val / vi.val : 1]; })) : null;
    if (id('Qpk3') && !BATCH[b]) o.kmax = +(id('Qpk3') * 24 / S.input.Q).toFixed(2);       // lưu lượng đỉnh tới cụm sinh học (sau điều hòa nếu có)
    if (b === 'KMBR' && u.kb) {
      const k = u.kb;
      o.Vana = 0; o.Van = k.Van; o.Vaer = k.Vpre; o.Vmem = k.Vm; o.Am = k.Am; o.R = k.r; o.IR = 0;
      o.MLSS = Math.round(id('kXavg') || p.kb_MLSS);
      // khí: rửa màng (bọt thô) + đĩa bọt mịn → SOTE tương đương theo O₂ thiết kế Kubota (α đã gồm trong OTE Kubota)
      o.alpha = 1; o.air = Math.round((k.Amem + k.Afb) * 60); o.airMax = Math.round((k.Amem * k.M.qmax / k.qa + k.Afb) * 60);
      o.SOTE = +(k.O2K / Math.max(1e-6, (k.Amem + k.Afb) * 1440 * 0.277) / 0.75 / p.air_F).toFixed(4);
      o.Df = k.Hm; o.SVI = p.SVI;
    } else if (b === 'CAS') o.Vaer = id('Vaer');
    else if (b === 'OD') {
      o.Vaer = id('Vtot');
      let f = 0; for (let i = 1; i <= 8; i++) if (u.ids['f' + i]) f = u.ids['f' + i].val;
      o.fOn = 1 - (f || p.od_ftk); o.aer = 'surf'; o.kWs = u.airP || 0; o.kWsMax = o.kWs; o.SAE = p.od_SAE;
    } else if (MLE[b]) {
      o.Vana = id('Vana'); o.Van = id('Van'); o.Vmem = id('Vmem'); o.Am = id('Am');
      const Vt = id('Vtot') || R.kpi.Vbio;
      o.Vaer = Math.max(0, Vt - o.Vana - o.Van - o.Vmem);
      o.IR = id('IR');
      if (MEDIA[b]) {
        const Mt = id('Mtss'), Va = o.Vaer;
        o.MLSS = Mt && Va ? Math.round(Mt * 1000 / Va / 10) * 10 : (id('Xeq') || 6000);
        if (b === 'MBBR') { o.SOTE = p.mbbr_SOTE; o.alpha = 0.6; } else o.alpha = p[DATA.FIXED[b] + '_alpha'] || 0.7;
      }
      if (MBRS[b]) { o.R = 4; o.IR = 0; o.alpha = 0.5; }
    } else if (b === 'SBR') {
      o.Vb = id('Vtot'); o.fAer = id('fAer') || 0.33; o.TWL = p.sbr_H; o.dH = p.sbr_H * (id('VF') || p.sbr_VF);
      o.fSD = (p.sbr_settle + p.sbr_decant) / (id('tc') || 12); o.R = 0;
    } else if (b === 'ICEAS' && R.icRec) {
      const ic = R.icRec.M || R.icRec[R.icRec.use], ph = ic.ph;   // chu kỳ đang áp dụng (kể cả tự nhập / đã tăng Air-Off ở Bước 6)
      const nb = id('nb') || 1;
      o.Vb = ic.BA * (id('TWL') || p.ic_TWL) * nb; o.MLSS = Math.round(ic.MLSSt); o.fAer = ic.TA / 24; o.TWL = id('TWL') || p.ic_TWL; o.dH = ic.DD;
      o.fSD = (ph.set + ph.dec) / (ph.on + ph.off + ph.set + ph.dec); o.R = 0;
      o.ncy = ic.cyc; o.fOff = ph.off / (ph.on + ph.off + ph.set + ph.dec); o.Rsel = 0; o.SND = +p.ic_SND || 0;
    } else if (b === 'CTECH') {
      o.Vb = id('cVtot'); o.MLSS = id('MLSSc') || p.ct_MLSS; o.fAer = id('cfA') || 0.5; o.TWL = id('TWL') || p.ct_TWLmax; o.dH = id('cdH');
      o.fSD = (p.ct_TS + p.ct_TD) / (p.ct_TFA + p.ct_TS + p.ct_TD); o.Vana = id('cVsel') * (id('cN') || 1); o.R = 0; o.blowCont = 1;
      o.ncy = 24 / (p.ct_TFA + p.ct_TS + p.ct_TD); o.fOff = 0; o.Rsel = (id('cQRd') || 0) / Math.max(1, +S.input.Q); o.SND = +p.ct_SND || 0;
    } else if (b === 'AGS' && u.ags) {
      // NEREDA: thể tích bể × pha nạp kỵ khí (từ đáy) quy về "thể tích kỵ khí" tương đương; bùn hạt SVI thấp, MLSS cao
      const g = u.ags;
      o.Vb = g.VR * g.Nr; o.MLSS = Math.round(g.Xact * 1000); o.fAer = g.fAer; o.TWL = g.H; o.dH = g.H * g.VF;
      o.fSD = (g.tS + g.tI) / g.tc; o.Vana = o.Vb * g.tF / g.tc; o.R = 0; o.SVI = p.ags_SVI;
      o.SOTE = +g.r.air.SOTE.toFixed(4);   // đĩa ở đáy bể sâu
    }
    if (R.um.clar) { const ci = R.um.clar.ids; o.Acl = ci.At ? ci.At.val : ci.A ? ci.A.val : 0; }
    // cấp khí
    if (o.aer === 'diff' && b !== 'KMBR') {
      const extra = id('Qx');
      o.air = Math.round(Math.max(0, (u.airQ || 0) - extra) * 60); o.airMax = o.air;
      if (!MEDIA[b] && !MBRS[b]) o.alpha = p.air_alpha;
    }
    o.Df = b === 'AGS' && u.ags ? Math.max(1, u.ags.H - 0.3) : b === 'KMBR' && u.kb ? u.kb.Hm : b === 'ICEAS' ? (p.ic_sub || p.air_de) : b === 'CTECH' ? Math.max(1, o.TWL - (p.ct_hd || 0.3)) : p.air_de;
    o.DO = p.DO;
    // hóa chất
    for (const x of R.chem) {
      if (/khử P đồng thời/.test(x.name)) o.pacSim = +x.dose.toFixed(1);
      else if (/^PAC/.test(x.name) && c.chemPos === 'post') o.pacTert = +x.dose.toFixed(1);
      else if (/^Methanol/.test(x.name)) o.meoh = +x.dose.toFixed(1);
      else if (/^NaOH 100 % – bổ sung kiềm/.test(x.name)) o.naoh = +x.dose.toFixed(1);
    }
    o.cl = p.cl_dose;
    return o;
  }

  /* ---------------- mô hình dự đoán ---------------- */
  function predict(S, o) {
    const p = S.p, E = S.eff, lim = ENG.limits(S), L = lim.L;
    const bio = o.bio, isB = !!BATCH[bio], isM = !!MEDIA[bio];
    const Q = Math.max(1, +o.Q || 1), T = +o.T, Tm = +o.Tmax, kmax = Math.max(1, +o.kmax || 1);
    const patm = 101.325 * Math.pow(1 - 0.0000225577 * (+S.input.z || 0), 5.2559);
    const q = o.q, flags = [];
    const st1 = { COD: +q.COD, BOD: +q.BOD, TSS: +q.TSS, TN: +q.TN, TKN: +q.TKN, NH4: +q.NH4, NO3: Math.max(0, q.TN - q.TKN), TP: +q.TP, OG: +q.OG, Color: +q.Color, Alk: +q.Alk, Coli: +q.Coli };
    const st4 = { ...st1 };
    for (const k of DATA.EFF_ROWS) st4[k] = st1[k] * (1 - E[k].hw / 100) * (o.pre === 'cept' ? 1 - E[k].cept / 100 : 1);
    // xử lý yếm khí cấp 1 của phương án thiết kế: áp tỷ lệ ra/vào từng chỉ tiêu (bản tính mục YK)
    if (o.anaR) for (const [k, f] of Object.entries(o.anaR)) if (st4[k] !== undefined && isFinite(f)) st4[k] *= f;
    st4.TN = st4.TKN + st4.NO3;
    // đặc trưng nước thải (tỷ lệ tab 4)
    const bCODr = p.bcod_bod * st1.BOD, sBODr = p.sbod_bod * st1.BOD, sCODr = p.scod_cod * st1.COD;
    const nbsCOD = Math.max(0, sCODr - p.bcod_bod * sBODr), pCOD = st1.COD - sCODr;
    const bpp = pCOD > 0 ? clamp((bCODr - p.bcod_bod * sBODr) / pCOD, 0, 1) : 0.9;
    const S0 = p.bcod_bod * st4.BOD, rb = p.rb_bio * S0;
    const VSS = st4.TSS * p.vss_tss, nbVSS = (1 - bpp) * VSS, iTSS = st4.TSS - VSS;
    const kin = { muA: p.muAOB * Math.pow(1.072, T - 20), bA: p.bAOB * Math.pow(1.029, T - 20), muH: p.muH * Math.pow(1.07, T - 20), bH: p.bH * Math.pow(1.04, T - 20) };
    // hình học: thể tích chứa bùn & phân suất (thể tích × thời gian) hiếu khí / thiếu khí / kỵ khí
    let Vt, fA, fN, fAn, tAer;
    if (isB) {
      Vt = +o.Vb; fAn = Vt > 0 ? clamp(o.Vana / Vt, 0, 0.3) : 0; fA = clamp(+o.fAer, 0.05, 1 - fAn); fN = Math.max(0, 1 - fA - fAn); tAer = +o.blowCont ? 1 : fA;
      // NEREDA (AGS): khử nitrat đồng thời (SND) trong lõi thiếu khí của hạt bùn suốt pha sục khí – quy ~40 % thời gian sục khí thành thiếu khí tương đương
      if (bio === 'AGS') fN = Math.min(1 - fAn, fN + 0.4 * fA);
    }
    else if (bio === 'CAS' || bio === 'OD') { Vt = +o.Vaer; fA = clamp(+o.fOn, 0.05, 1); fN = 1 - fA; fAn = 0; tAer = bio === 'OD' ? 1 : fA; }
    else { Vt = (+o.Vana) + (+o.Van) + (+o.Vaer) + (+o.Vmem); fA = Vt > 0 ? (+o.Vaer + +o.Vmem) / Vt : 1; fN = Vt > 0 ? o.Van / Vt : 0; fAn = Vt > 0 ? o.Vana / Vt : 0; tAer = 1; }
    if (!(Vt > 0)) return { err: 'Chưa nhập thể tích bể sinh học.' };
    const MLSS = Math.max(100, +o.MLSS), M = MLSS * Vt / 1000;
    // bùn hóa học & carbon ngoài chiếm chỗ trong MLSS
    const AlSim = (+o.pacSim) * p.PAC_al * 54 / 102;
    const chemSl = 2.9 * AlSim * Q / 1000 * 1.4;
    const meohN = fN > 0 ? (+o.meoh) * 1.5 / CODN_MEOH : 0;
    const meohSl = 0.3 * (+o.meoh) * 1.5 / 0.85 * Q / 1000;
    // khử nitrat: SDNR theo F/M_b (M&E 5th PT 8-56…8-58, Bảng 8-22)
    const pctB = clamp(p.rb_bio * 100, 10, 50), tb = [[10, .186, .078], [20, .213, .118], [30, .235, .141], [40, .242, .152], [50, .27, .162]];
    let b0 = .213, b1 = .118;
    for (let i = 0; i < 4; i++) if (pctB >= tb[i][0] && pctB <= tb[i + 1][0]) { const f = (pctB - tb[i][0]) / 10; b0 = tb[i][1] + f * (tb[i + 1][1] - tb[i][1]); b1 = tb[i][2] + f * (tb[i + 1][2] - tb[i][2]); }
    const sdnrOf = fmb => Math.max(0, (fmb <= 0.5 ? 0.24 * fmb : b0 + b1 * Math.log(fmb)) * Math.pow(1.026, T - 20));
    const Rr = isB ? 0 : Math.max(0, +o.R), IR = MLE[bio] ? Math.max(0, +o.IR) : 0;
    const rDec = isB ? clamp((+o.dH) / Math.max(0.5, +o.TWL), 0, 0.9) : 0, fLast = bio === 'SBR' || bio === 'AGS' ? 1 : bio === 'CTECH' ? 0.35 : 0.5;   // SBR một pha phản ứng; ICEAS NDN / C-Tech sục khí luân phiên

    /* trạng thái sinh học tại SRT, DO */
    function bioAt(SRT, DO) {
      const SRTa = SRT * fA;
      const dH_ = SRT * (kin.muH - kin.bH) - 1;
      const Ssol = dH_ > 0 ? clamp(p.Ks * (1 + kin.bH * SRT) / dH_, 0, S0) : S0;
      const A = Q * p.YH * (S0 - Ssol) / (1 + kin.bH * SRT) / 1000, B = p.fd * kin.bH * SRT * A;
      const DOf = DO / (p.KOA + DO);
      const den = SRTa * (kin.muA * DOf - kin.bA) - 1;
      let Ne = den > 0 ? p.KNH4 * (1 + kin.bA * SRTa) / den : 1e9;
      let NOx = 0.8 * st4.TKN, C = 0, PXbio = A + B;
      for (let i = 0; i < 6; i++) {
        C = Q * p.YAOB * NOx / (1 + kin.bA * SRT) / 1000; PXbio = A + B + C;
        const Nav = Math.max(0, st4.TKN - p.fN * PXbio * 1000 / Q);
        Ne = Math.min(Ne, Nav); NOx = Math.max(0, Nav - Ne);
      }
      const PXTSS = PXbio / 0.85 + Q * nbVSS / 1000 + Q * iTSS / 1000 + chemSl + meohSl;
      return { SRT, SRTa, S: Ssol, A, B, C, PXbio, PXTSS, PXVSS: PXbio + Q * nbVSS / 1000, NOx, Ne, washout: den <= 0 };
    }
    function solveSRT(DO) {
      if (+o.SRT > 0) return +o.SRT;
      let lo = 0.3, hi = 300;
      for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); const b = bioAt(m, DO); if (b.PXTSS * m > M) hi = m; else lo = m; }
      return Math.sqrt(lo * hi);
    }
    // cấp khí – M&E 5th PT (5-70) ở T_max
    const Cs20 = doSat(20), CsT = doSat(Tm), Om = patm / 101.325, kT = Math.pow(1.024, Tm - 20);
    const surf = o.aer === 'surf';
    const Cinf = surf ? Cs20 : Cs20 * (1 + p.air_dmid * (+o.Df) / 10.33), tau = CsT / Cs20;
    const aF = (surf ? +o.alpha : (+o.alpha) * p.air_F);
    const sotrOf = air => surf ? air * (+o.SAE) : air * 1.2 * 0.2318 * (+o.SOTE);         // kg O₂/h
    const SOTR = sotrOf(surf ? +o.kWs : +o.air);
    const Csat = tau * p.air_beta * Om * Cinf;
    const DOfix = +o._DOfix > 0 ? +o._DOfix : 0;                 // DO đo thực tế (chỉ dùng khi hiệu chỉnh)
    const DOmax = DOfix || Math.max(0.05, +o.DO);

    let DO = DOmax, st = null, NO3den = 0, NO3e = 0, cap = 0, capInt = 0, fed = 0, FMb = 0, sdnr = 0, Xb = 0, AORd = 0, AORh = 0, DOach = DOmax, alkLim = false, AlkRes = 0, o2Lim = 0, SRT = 0;
    for (let it = 0; it < 60; it++) {
      SRT = solveSRT(DO);
      st = bioAt(SRT, DO);
      Xb = Q * p.YH * (S0 - st.S) * SRT / (1 + kin.bH * SRT) / 1000;
      FMb = fN > 0 && Xb > 0 ? Q * st4.BOD / 1000 / (Xb * fN) : 0;
      sdnr = sdnrOf(Math.min(FMb, 1.5));                 // giữ trong phạm vi Bảng 8-22 / Hình 8-23
      const Ynet = p.YH / (1 + kin.bH * SRT), gN = 2.86 / (1 - 1.42 * Ynet);
      capInt = fN > 0 ? Math.min(sdnr * Xb * fN * 1000 / Q, 0.6 * S0 / gN) : 0;
      cap = capInt + meohN;
      let NOx = st.NOx;
      // độ kiềm: giữ ≥ 40 mg/L CaCO₃ cho nitrat hóa ổn định (VD 8-3 bước 15)
      const alkOf = (nx, dn) => st4.Alk + 1.25 * (+o.naoh) - 7.14 * nx + 3.57 * dn;
      // nitrat tới vùng/pha thiếu khí: MLE theo PT (8-61); bể mẻ: phần nitrat tạo ra trong pha sục khí cuối bị gạn đi theo nước ra (tỷ lệ gạn ΔH/TWL)
      const fedOf = nx => bio === 'AGS' ? nx : (MLE[bio] && fN > 0) ? nx * (IR + Rr) / (1 + IR + Rr) : isB ? nx * (1 - fLast * rDec) : nx;
      // ICEAS, C-Tech: cân bằng NO₃ bể mẻ dùng chung với bản tính (ENG.batchNO3) – Air-Off khuấy, lớp bùn khi lắng/gạn, selector
      const BNs = (bio === 'ICEAS' || bio === 'CTECH') && +o.ncy > 0;
      // ICEAS: phần không sục khí ngoài lắng + gạn là Air-Off có khuấy (tăng khi giảm f_sục); C-Tech không có pha khuấy thiếu khí
      const fSDb = BNs ? clamp(+o.fSD, 0, 1) : 0, fOff = BNs && bio === 'ICEAS' ? Math.max(0, fN - fSDb) : 0;
      const bnOf = nx => ENG.batchNO3({ Q, NOx: nx, snd: +o.SND || 0,
        dMix: fOff > 0 ? sdnrOf(Math.min(Q * st4.BOD / 1000 / Math.max(Xb, 1e-9), 1.5)) * Xb * fOff + (bio === 'ICEAS' ? meohN * Q / 1000 : 0) : 0,
        dEnd: (1 - p.fd) * 1.42 * kin.bH * p.dn_eta * Xb * fSDb / 2.86, Vbld: MLSS * (+o.SVI) / 1e6 * Vt * (+o.ncy),
        Qsel: (+o.Rsel || 0) * Q, dSel: Q * rb / gN / 1000 + (bio === 'CTECH' ? meohN * Q / 1000 : 0) });
      if (BNs) { const b0 = bnOf(NOx); capInt = (b0.mix + b0.end + b0.sel + b0.snd) * 1000 / Q; cap = capInt; }
      const dnOf = nx => BNs ? nx - bnOf(nx).Ce : Math.min(fedOf(nx), cap);
      let dn = dnOf(NOx);
      alkLim = false;
      if (alkOf(NOx, dn) < 40) {
        // NOx tối đa theo độ kiềm (giải lặp vì khử nitrat hoàn trả kiềm)
        let lo = 0, hi = NOx;
        for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (alkOf(m, dnOf(m)) >= 40) lo = m; else hi = m; }
        st.Ne += NOx - lo; NOx = lo; dn = dnOf(NOx); alkLim = true;
      }
      st.NOx = NOx; fed = BNs ? NOx : fedOf(NOx); NO3den = dn; NO3e = Math.max(0, NOx - dn); AlkRes = alkOf(NOx, dn);
      // oxy
      AORd = Math.max(0, Q * (S0 - st.S) / 1000 - 1.42 * st.PXbio + 4.57 * Q * NOx / 1000 - 2.86 * Q * Math.min(NO3den, capInt) / 1000);
      AORh = AORd / 24 / tAer;
      DOach = SOTR > 0 ? Csat - AORh * Cinf / (SOTR * aF * kT) : -99;
      const DOn = DOfix || clamp(Math.min(DOmax, DOach), 0.05, DOmax);
      if (Math.abs(DOn - DO) < 1e-4) { DO = DOn; break; }
      DO = 0.6 * DO + 0.4 * DOn;
    }
    // thiếu oxy trầm trọng → BOD không xử lý hết
    const carbO2 = Math.max(0, Q * (S0 - st.S) / 1000 - 1.42 * st.PXbio - 2.86 * Q * Math.min(NO3den, capInt) / 1000) / 24 / tAer;
    const OTRmax = SOTR * aF * kT * Csat / Cinf;
    let Sx = st.S;
    if (!DOfix && OTRmax < carbO2 && carbO2 > 0) { o2Lim = 1 - OTRmax / carbO2; Sx = st.S + (S0 - st.S) * o2Lim * 0.5; flags.push('o2'); }
    if (DOfix ? DOfix < 0.5 : DOach < 0.5) flags.push('lowDO');
    if (st.washout) flags.push('washout');
    if (alkLim) flags.push('alk');
    // lượng khí cần để giữ DO đặt (trung bình và giờ cao điểm)
    const sotrNeed = (aor, dos) => aor * Cinf / (aF * kT * Math.max(0.1, Csat - dos));
    const airOf = sotr => surf ? sotr / (+o.SAE) : sotr / (1.2 * 0.2318 * (+o.SOTE));
    const airReq = airOf(sotrNeed(AORh, DOmax)), airReqPk = airOf(sotrNeed(AORh * p.O2peak, Math.min(DOmax, 1)));

    /* ---------- photpho ---------- */
    const Pass = p.fP * st.PXVSS * 1000 / Q;
    let dPE = 0;
    if (fAn > 0) {
      const ret = bio === 'AGS' ? 0 : isB ? Math.max(0, (+o.TWL - +o.dH) / Math.max(0.1, +o.dH)) : Rr;
      const rbAv = Math.max(0, rb - 5.2 * ret * NO3e);
      const tauAn = isB ? 1 : (+o.Vana) / (Q * (1 + Rr)) * 24;
      dPE = rbAv / p.aao_rbP * Math.min(1, tauAn / 0.75);
    }
    const TPbio = Math.max(0.1, st4.TP - Pass - dPE);
    const Psim = AlSim / (p.AlP * 27 / 31);
    let TPsol = Math.max(0.05, TPbio - Psim);

    /* ---------- chất rắn lơ lửng ra ---------- */
    let TSSe, ov = 1, base, SOR = 0, SORpk = 0, SLR = 0, SLRpk = 0, Rreq = 0, rD = 0, rDmax = 0, Jn = 0, Jpk = 0, XR = 0, lims = null;
    const clar = !!DATA.NEED_CLARIFIER[bio];
    if (MBRS[bio]) {
      base = 1; TSSe = 1; XR = MLSS * 1.25;
      if (+o.Am > 0) { Jn = Q * 1000 / 24 / o.Am; Jpk = Jn * kmax; const jl = bio === 'KMBR' ? [p.kb_F * 1000 / 24, p.kb_Fmax * 1000 / 24] : [p.mbr_flux, p.mbr_fluxp]; if (Jn > jl[0] * 1.1 || Jpk > jl[1]) flags.push('flux'); }
    } else if (isB) {
      base = p.TSSe_dec;
      const FVT = MLSS * (+o.SVI) / 1e6;
      rD = (+o.dH) / Math.max(0.5, +o.TWL); rDmax = 1 - FVT - p.ct_hsup / Math.max(0.5, +o.TWL);
      ov = Math.max(rDmax > 0 ? rD / rDmax : 5, (+o.SVI) / 150);
    } else {
      base = p.TSSe_cl;
      const pure = isM && !(+o.R > 0);
      const Xin = pure ? st.PXTSS * 1000 / Q : MLSS;
      lims = BNR[bio] ? [32, 64, 8, 10] : [28, 56, 6, 10];
      if (+o.Acl > 0) {
        SOR = Q / o.Acl; SORpk = Q * kmax / o.Acl;
        SLR = Q * (1 + Rr) * Xin / 1000 / o.Acl / 24; SLRpk = Q * (kmax + Rr) * Xin / 1000 / o.Acl / 24;
        XR = 1e6 / Math.max(30, +o.SVI);
        Rreq = pure ? 0 : (XR > MLSS ? MLSS / (XR - MLSS) : 99);
        ov = Math.max(SOR / lims[0], SORpk / lims[1], SLR / lims[2], SLRpk / lims[3], Rr > 0 && Rreq > 0 ? Rreq / Rr : 1, (+o.SVI) / 150);
      } else { ov = Math.max(1, (+o.SVI) / 150); if (clar) flags.push('noAcl'); }
    }
    if (!MBRS[bio]) {
      TSSe = ov <= 1 ? base * (0.6 + 0.4 * ov) : base * ov * ov;
      if (ov > 1.3) flags.push('solidsLoss');
      TSSe *= 1 - 0.3 * Math.min(1, (+o.poly) / 1);
      TSSe = Math.min(TSSe, Math.max(base, 0.1 * MLSS));
    }
    if (!XR) XR = isB ? MLSS : 1e6 / Math.max(30, +o.SVI);

    /* ---------- nước sau sinh học (⑤) ---------- */
    const fPp = dPE > 0 || AlSim > 0 ? 0.03 : 0.02;
    const sBOD = Sx / p.bcod_bod;
    const e5 = {};
    e5.TSS = TSSe; e5.BOD = sBOD + p.bod_tss * TSSe; e5.COD = nbsCOD + p.bcod_bod * sBOD + p.cod_tss * TSSe;
    e5.NH4 = st.Ne; e5.TKN = st.Ne + p.Norg + p.fN * 0.85 * TSSe; e5.NO3 = NO3e; e5.TN = e5.TKN + e5.NO3;
    e5.TP = TPsol + fPp * TSSe; e5.OG = st4.OG * 0.2; e5.Color = st4.Color * 0.7; e5.Alk = Math.max(0, AlkRes);
    e5.Coli = MBRS[bio] ? 100 : p.coli_bio;
    /* ---------- hóa lý bậc 3, lọc ---------- */
    const e = { ...e5 };
    const AlT = (+o.pacTert) * p.PAC_al * 54 / 102;
    if (+o.tert) {
      const kc = AlT > 0 ? 1 : 0.5;
      const dT = e.TSS * E.TSS.tert / 100 * kc;
      e.TSS -= dT; e.BOD = Math.max(0, e.BOD - p.bod_tss * dT); e.COD = Math.max(0, e.COD - p.cod_tss * dT);
      if (AlT > 0) { e.COD = Math.max(0, e.COD - 0.2 * nbsCOD * Math.min(1, AlT / 10)); e.Color *= 1 - E.Color.tert / 100; TPsol = Math.max(0.05, TPsol - AlT / (p.AlP * 27 / 31)); }
      e.TP = TPsol + fPp * e.TSS; e.TKN -= p.fN * 0.85 * dT; e.TN = e.TKN + e.NO3; e.OG *= 0.5; e.Coli *= 0.5;
    }
    if (+o.filt) {
      const dT = e.TSS * E.TSS.filt / 100;
      e.TSS -= dT; e.BOD = Math.max(0, e.BOD - p.bod_tss * dT); e.COD = Math.max(0, e.COD - p.cod_tss * dT);
      e.TP = TPsol + fPp * e.TSS; e.TKN -= p.fN * 0.85 * dT; e.TN = e.TKN + e.NO3; e.Coli *= 0.3;
    }
    /* ---------- khử trùng – Bảng 12-14 (clo kết hợp, tiếp xúc 30 phút) ---------- */
    const lrOf = d => {
      if (o.disinf === 'uv') return Math.min(5, 4 * Math.pow(Math.max(0, +o.uv) / 40, 0.8)) * Math.min(1, Math.pow(10 / Math.max(e.TSS, 1), 0.25));
      if (o.disinf !== 'naocl') return 0;
      const P = (+o.filt || MBRS[bio]) ? [[0, 0], [3, 2], [6.5, 2.7], [11.5, 3.64], [15, 4.66]] : [[0, 0], [6.5, 2.5], [11.5, 3.2], [15, 4.14]];
      if (d >= P[P.length - 1][0]) return P[P.length - 1][1] + 0.27 * (d - P[P.length - 1][0]);
      for (let i = 0; i < P.length - 1; i++) if (d <= P[i + 1][0]) return P[i][1] + (P[i + 1][1] - P[i][1]) * (d - P[i][0]) / (P[i + 1][0] - P[i][0]);
      return 0;
    };
    e.Coli = e.Coli * Math.pow(10, -lrOf(+o.cl));

    const comp = DATA.QPARAMS.filter(x => x[0] !== 'Alk').map(([k, nm, un]) => {
      const v = e[k], lv = L[k];
      return { key: k, nm, un, v, lim: lv, ok: lv === undefined ? null : v <= lv + 1e-9, ratio: lv ? v / lv : 0 };
    });
    const Qw = (st.PXTSS) * 1000 / Math.max(1, XR);
    const d = {
      Vt, fA, fN, fAn, tAer, MLSS, M, SRT, SRTa: SRT * fA, HRT: Vt / Q * 24, FM: Q * st4.BOD / 1000 / (M * p.vss_tss),
      S0, Sx, Ne: st.Ne, NOx: st.NOx, NO3den, NO3e, cap, capInt, meohN, fed, FMb, sdnr, Xb, AORd, AORh, SOTR, OTRmax, PXVSS: st.PXVSS, sTSS: st4.TSS, Csat, Cinf, DO, DOach, DOmax,
      airReq, airReqPk, AlkRes, alkLim, o2Lim, PXTSS: st.PXTSS, PXbio: st.PXbio, Qw, XR, Pass, dPE, Psim, AlT, TPbio,
      TPsolE: TPsol, fPp, SOR, SORpk, SLR, SLRpk, Rreq, lims, ov, rD, rDmax, Jn, Jpk, base, TSSe, washout: st.washout, kin, muNet: kin.muA * DO / (p.KOA + DO) - kin.bA,
    };
    return { o, lim, st1, st4, e5, eff: e, comp, comply: comp.every(x => x.ok !== false), d, flags };
  }

  /* SRT hiếu khí cần cho NH₄-N ra = N (M&E PT 7-94 giải ngược) */
  function srtaFor(S, r, N, DO) {
    const p = S.p, k = r.d.kin, mu = k.muA * N / (p.KNH4 + N) * DO / (p.KOA + DO) - k.bA;
    return mu > 0 ? 1 / mu : Infinity;
  }
  /* MLSS tối đa cho phép theo bể lắng / tỷ lệ gạn / loại công nghệ */
  function mlssMax(S, o) {
    const p = S.p, bio = o.bio, Q = +o.Q, kmax = Math.max(1, +o.kmax);
    let m = BATCH[bio] ? 6000 : MBRS[bio] ? 12000 : MEDIA[bio] ? 15000 : 5000;
    if (BATCH[bio]) m = Math.min(m, (1 - (+o.dH) / o.TWL - p.ct_hsup / o.TWL) * 1e6 / Math.max(30, +o.SVI) * 0.97);
    else if (DATA.NEED_CLARIFIER[bio] && +o.Acl > 0 && !(MEDIA[bio] && !(+o.R > 0))) {
      const lm = BNR[bio] ? [8, 10] : [6, 10], R = Math.max(0.1, +o.R), XR = 1e6 / Math.max(30, +o.SVI);
      m = Math.min(m, lm[0] * 0.95 * o.Acl * 24 * 1000 / (Q * (1 + R)), lm[1] * 0.95 * o.Acl * 24 * 1000 / (Q * (kmax + R)), XR * Math.min(1.2, R * 1.3) / (1 + Math.min(1.2, R * 1.3)));
    }
    return Math.max(500, Math.floor(m / 50) * 50);
  }

  /* ---------------- khuyến cáo vận hành ---------------- */
  const LABEL = {
    air: ['Lưu lượng khí cấp cho bể sinh học', 'Nm³/h'], kWs: ['Công suất guồng khí vận hành', 'kW'], DO: ['DO đặt vùng hiếu khí', 'mg/L'],
    MLSS: ['MLSS vận hành', 'mg/L'], fAer: ['Phân suất thời gian sục khí trong chu kỳ', '-'], fOn: ['Phân suất thời gian sục khí (sục khí gián đoạn)', '-'],
    IR: ['Tỷ lệ tuần hoàn nội IR', '× Q'], R: ['Tỷ lệ tuần hoàn bùn R', '× Q'], naoh: ['Liều NaOH 100 % bổ sung kiềm', 'mg/L'], meoh: ['Liều methanol (carbon ngoài)', 'mg/L'],
    pacSim: ['Liều PAC châm vào bể sinh học', 'mg/L'], pacTert: ['Liều PAC cụm hóa lý bậc 3', 'mg/L'], poly: ['Liều polymer trợ lắng', 'mg/L'],
    dH: ['Chiều sâu gạn nước mỗi chu kỳ', 'm'], cl: ['Liều clo hoạt tính', 'mg/L'], uv: ['Liều UV', 'mJ/cm²'],
  };
  function advise(S, o0) {
    const p = S.p, base = predict(S, o0);
    if (base.err) return { base, err: base.err };
    const L = base.lim.L, o = JSON.parse(JSON.stringify(o0)), recs = new Map(), infra = new Map();
    const tg = k => L[k] * 0.9;
    const set = (k, v, why) => {
      v = +(+v).toFixed(k === 'fAer' || k === 'fOn' || k === 'IR' || k === 'R' ? 2 : k === 'air' || k === 'MLSS' ? 0 : 1);
      if (Math.abs(v - (+o[k])) < 1e-9) return false;
      if (!recs.has(k)) recs.set(k, { k, label: LABEL[k][0], unit: LABEL[k][1], from: +o0[k], to: v, why: [] });
      const r = recs.get(k); r.to = v; if (!r.why.includes(why)) r.why.push(why);
      o[k] = v; return true;
    };
    const addI = (k, t) => infra.set(k, t);
    const isB = !!BATCH[o.bio], lockUp = new Set(), lockDn = new Set();
    let r = base, it = 0;
    for (; it < 25; it++) {
      const e = r.eff, d = r.d, f = k => L[k] !== undefined && e[k] > tg(k) + 1e-9;
      const before = JSON.stringify(o);
      const nFail = f('NH4') || f('TKN') || (f('TN') && e.NH4 > 0.3 * e.TN);
      const tnFail = (f('TN') || f('NO3')) && !(L.NH4 !== undefined && e.NH4 > tg('NH4'));
      // 1. oxy: đủ khí để giữ DO đặt
      if ((nFail || f('BOD') || f('COD') || r.flags.includes('o2')) && d.DOach < d.DOmax - 0.05) {
        if (o.aer === 'surf') {
          const need = d.airReq * 1.1, capx = Math.max(+o.kWsMax || 0, +o.kWs);
          set('kWs', Math.min(need, capx), 'Giữ DO đặt khi tải oxy thực tế cao (PT 5-70)');
          if (need > capx * 1.001) addI('air', `Bổ sung guồng khí: thiếu khoảng ${fx(need - capx)} kW so với công suất hiện có.`);
        } else {
          const need = d.airReq * 1.1, capx = Math.max(+o.airMax || 0, +o.air);
          set('air', Math.min(need, capx), 'Giữ DO đặt khi tải oxy thực tế cao (PT 5-70)');
          if (need > capx * 1.001) addI('air', `Bổ sung năng lực cấp khí: thiếu khoảng ${fx(need - capx, 0)} Nm³/h so với máy thổi đang có (kiểm tra số đĩa, áp lực).`);
        }
      }
      // 2. DO đặt
      if (nFail && +o.DO < 2 && d.DOach >= +o.DO - 0.05) set('DO', 2, 'Tăng tốc độ nitrat hóa (μ_AOB tỷ lệ DO/(K_o + DO))');
      // 3. kiềm
      if ((d.alkLim || d.AlkRes < 50) && (nFail || d.AlkRes < 50)) set('naoh', (+o.naoh) + Math.max(0, p.alk_res - d.AlkRes) / 1.25 * 1.05, 'Độ kiềm còn lại thấp – nitrat hóa bị ức chế, pH giảm (VD 8-3 bước 15)');
      // 4. tuổi bùn hiếu khí
      if (nFail && !r.flags.includes('o2') && !d.alkLim) {
        const Nt = Math.min(L.NH4 !== undefined ? tg('NH4') : 99, L.TKN !== undefined ? tg('TKN') - p.Norg - p.fN * 0.85 * e.TSS : 99, L.TN !== undefined ? 0.5 * tg('TN') : 99, 5);
        const need = srtaFor(S, r, Math.max(0.2, Nt), Math.max(+o.DO, 0.5)) * 1.1;
        if (need > d.SRTa) {
          const mMax = mlssMax(S, o);
          let ch = false;
          if (+o.MLSS < mMax - 1) ch = set('MLSS', Math.min(mMax, (+o.MLSS) * Math.min(1.5, need / d.SRTa)), `Tăng SRT hiếu khí từ ${fx(d.SRTa)} lên ≥ ${fx(need)} ngày (giảm xả bùn dư)`);
          if (!ch) {
            if (lockDn.has('fAer') || lockDn.has('fOn')) ch = false;
            else if (isB && +o.fAer < 1 - (+o.fSD) - d.fAn - 0.02) { ch = set('fAer', Math.min(1 - (+o.fSD) - d.fAn, (+o.fAer) + 0.05), 'Kéo dài pha sục khí trong chu kỳ để tăng SRT hiếu khí'); lockUp.add('fAer'); }
            else if ((o.bio === 'CAS' || o.bio === 'OD') && +o.fOn < (o.bio === 'OD' ? 0.85 : 1)) { ch = set('fOn', Math.min(o.bio === 'OD' ? 0.85 : 1, (+o.fOn) + 0.05), 'Tăng thời gian sục khí để tăng SRT hiếu khí'); lockUp.add('fOn'); }
          }
          if (!ch) {
            const Vneed = d.Vt * d.fA * need / Math.max(0.1, d.SRTa) - d.Vt * d.fA;
            addI('vol', `Tuổi bùn hiếu khí không đủ ở ${fx(+o.T)} °C kể cả khi MLSS tối đa ${fx(mMax, 0)} mg/L: cần thêm khoảng ${fx(Vneed, 0)} m³ thể tích hiếu khí (hoặc giá thể MBBR/IFAS).`);
          }
        }
      }
      // 5. tổng nitơ / nitrat
      if (tnFail) {
        const NO3t = Math.max(1, Math.min(L.NO3 !== undefined ? tg('NO3') : 99, L.TN !== undefined ? tg('TN') - e.TKN : 99));
        let ch = false;
        // giới hạn bởi lượng nitrat đưa tới vùng thiếu khí (năng lực còn dư) hay bởi năng lực khử nitrat?
        const fedLim = d.fed < d.cap - 1e-6;
        if (fedLim) {
          if (MLE[o.bio] && d.fN > 0) {
            if (MBRS[o.bio]) { if (+o.R < 6) ch = set('R', Math.min(6, Math.max((+o.R) + 0.5, d.NOx / NO3t - 1)), 'Tăng tuần hoàn bể màng → thiếu khí (PT 8-61)'); }
            else if (+o.IR < 4) ch = set('IR', Math.min(4, Math.max((+o.IR) + 0.3, d.NOx / NO3t - 1 - (+o.R))), 'Đưa thêm nitrat về vùng thiếu khí (PT 8-61, 8-62)');
            if (!ch) addI('ir', 'Tuần hoàn nội đã ở mức tối đa: NO₃-N ra bị giới hạn bởi PT (8-61) – cân nhắc thêm vùng thiếu khí sau (Bardenpho 4 bậc) hoặc lọc khử nitrat.');
          } else if (isB) {
            if (+o.dH > 0.1 * o.TWL + 0.05) ch = set('dH', Math.max(0.1 * o.TWL, (+o.dH) * 0.85), 'Nitrat tạo ra trong pha sục khí cuối bị gạn theo nước ra: giảm chiều sâu gạn mỗi chu kỳ (tăng số chu kỳ/ngày) và kết thúc pha phản ứng bằng khuấy thiếu khí trước khi lắng');
            else addI('dec', 'Tỷ lệ gạn đã thấp: kết thúc mỗi pha phản ứng bằng khuấy thiếu khí 20 – 30 phút (có thể châm carbon) trước pha lắng.');
          }
        } else {
          const nh4ok = (L.NH4 === undefined || e.NH4 < 0.6 * tg('NH4')) && e.NH4 < 2 && !lockUp.has('fAer') && !lockUp.has('fOn');
          if (nh4ok) {
            if (isB && +o.fAer > 0.35) ch = set('fAer', Math.max(0.35, (+o.fAer) - 0.05), 'Tăng thời gian khuấy không sục khí (thiếu khí) trong chu kỳ để khử nitrat');
            else if ((o.bio === 'CAS' || o.bio === 'OD') && +o.fOn > 0.55) ch = set('fOn', (+o.fOn) - 0.05, 'Sục khí gián đoạn (tắt khí theo chu kỳ) tạo pha thiếu khí khử nitrat');
            if (ch) lockDn.add(isB ? 'fAer' : 'fOn');
          }
          if (!ch) {
            if (d.fN > 0) {
              const def = Math.max(0.3, Math.min(d.fed - d.cap, e.NO3 - NO3t));
              if (+o.meoh < 120) ch = set('meoh', Math.min(120, (+o.meoh) + def * CODN_MEOH / 1.5 * 1.15), `Thiếu năng lực khử nitrat (SDNR, carbon nội tại): bổ sung carbon ngoài (methanol ≈ ${fx(CODN_MEOH / 1.5)} mg/mg NO₃-N, M&E Bảng 8-26)`);
              else addI('meoh', 'Liều methanol đã rất cao (≥ 120 mg/L): cần tăng thể tích/thời gian thiếu khí.');
            } else addI('anox', 'Không có vùng/pha thiếu khí: cần cải tạo bố trí vùng thiếu khí + tuần hoàn nội (AO) hoặc vận hành sục khí gián đoạn.');
          }
        }
      }
      // 6. photpho
      if (f('TP')) {
        const solP = Math.max(0, d.TPsolE - Math.max(0.3 * tg('TP'), tg('TP') - d.fPp * e.TSS));      // chỉ phần P hòa tan – P trong TSS xử lý bằng kiểm soát chất rắn
        const pac = solP * p.AlP * 27 / 31 / (p.PAC_al * 54 / 102) * 1.1;
        if (solP < 0.01) { /* chỉ vượt do P dạng hạt */ }
        else if (+o.tert) set('pacTert', (+o.pacTert) + pac, `Khử thêm ${fx(solP)} mg/L P bằng PAC (mol Al:P = ${p.AlP}, M&E mục 6-4)`);
        else set('pacSim', (+o.pacSim) + pac, `Khử thêm ${fx(solP)} mg/L P bằng PAC châm vào bể sinh học (mol Al:P = ${p.AlP}, M&E mục 6-4)`);
      }
      // 7. chất rắn lơ lửng (và BOD/COD dạng hạt)
      const share = { BOD: p.bod_tss * e.TSS / Math.max(e.BOD, 1e-6), COD: p.cod_tss * e.TSS / Math.max(e.COD, 1e-6), TP: d.fPp * e.TSS / Math.max(e.TP, 1e-6) };
      const partFail = f('TSS') || ['BOD', 'COD', 'TP'].some(k => f(k) && share[k] > 0.25);
      if (partFail && !MBRS[o.bio]) {
        let ch = false;
        if (isB) {
          if (d.rD > d.rDmax * 0.95) {
            const mMax = mlssMax(S, o);
            if (+o.MLSS > mMax + 1) ch = set('MLSS', mMax, 'Lớp bùn lắng quá cao so với chiều sâu gạn (PT 8-50): giảm MLSS');
            else ch = set('dH', Math.max(0.3, d.rDmax * 0.9 * (+o.TWL)), 'Giảm chiều sâu gạn mỗi chu kỳ (tăng số chu kỳ/ngày) để không cuốn bùn (PT 8-50, Hình 8-21)');
          }
        } else if (DATA.NEED_CLARIFIER[o.bio] && +o.Acl > 0) {
          if (d.Rreq > (+o.R) * 1.02 && +o.R < 1.2) ch = set('R', Math.min(1.2, d.Rreq * 1.15), 'Hạ lớp bùn trong bể lắng: tăng tuần hoàn bùn (R = X/(X_R − X))');
          if (!ch && (d.SLR > d.lims[2] || d.SLRpk > d.lims[3] || d.Rreq > (+o.R) * 1.02)) {
            const mMax = mlssMax(S, o);
            const nh4ok = L.NH4 === undefined || e.NH4 < 0.7 * tg('NH4');
            if (+o.MLSS > mMax + 1 && nh4ok) ch = set('MLSS', mMax, 'Bể lắng quá tải chất rắn (Bảng 8-34): giảm MLSS');
          }
        }
        if (!ch && +o.poly < 1) ch = set('poly', 1, 'Châm polymer trợ lắng 0,5 – 1 mg/L trước bể lắng / pha lắng');
        if (!ch && d.ov > 1.2 && !(+o.filt)) addI('tss', `Bể lắng/pha lắng quá tải (chỉ số quá tải ${fx(d.ov)}): bổ sung bể lắng hoặc lọc bậc 3 (lọc đĩa vải), kiểm soát SVI (selector, clo hóa bùn tuần hoàn).`);
      }
      // 8. COD/BOD hòa tan
      if (f('COD') && (r.e5.COD - p.cod_tss * r.e5.TSS) > tg('COD')) {
        if (+o.tert && +o.pacTert < 60) set('pacTert', Math.max(+o.pacTert, 60), 'COD hòa tan khó phân hủy cao: tăng liều keo tụ bậc 3 (hấp phụ – keo tụ một phần)');
        if ((r.st4.COD - r.st4.BOD * p.bcod_bod) > 0 && e.COD > tg('COD')) addI('cod', `COD khó phân hủy sinh học (nbsCOD ≈ ${fx(r.e5.COD - p.cod_tss * r.e5.TSS - p.bcod_bod * r.d.Sx / p.bcod_bod)} mg/L) vượt mức cho phép: cần xử lý bậc cao (keo tụ bậc 3, than hoạt tính, ozone/Fenton) – vận hành bể sinh học không giảm được phần này.`);
      }
      if (f('BOD') && r.flags.includes('o2')) addI('air', 'Cấp khí không đủ cho cả khử BOD: bổ sung máy thổi khí / đĩa phân phối khí.');
      // 9. coliform
      if (f('Coli')) {
        if (o.disinf === 'naocl') { if (+o.cl < 25) set('cl', Math.min(25, (+o.cl) + 2), 'Coliform ra vượt giới hạn: tăng liều clo (Bảng 12-14, tiếp xúc ≥ 30 phút)'); else addI('coli', 'Liều clo đã cao: kiểm tra thời gian tiếp xúc, TSS và amoni (tạo cloramin); xem xét bổ sung UV.'); }
        else if (o.disinf === 'uv') { if (+o.uv < 80) set('uv', Math.min(80, (+o.uv) + 10), 'Coliform ra vượt giới hạn: tăng liều UV, vệ sinh ống thạch anh'); }
        else addI('coli', 'Chưa có công đoạn khử trùng: bổ sung khử trùng (NaOCl/UV).');
      }
      // 10. độ màu, dầu mỡ
      if (f('Color')) { if (+o.tert) set('pacTert', Math.max(+o.pacTert, 80), 'Độ màu cao: tăng liều keo tụ bậc 3'); else addI('color', 'Độ màu vượt giới hạn: cần cụm hóa lý bậc 3 / oxy hóa (Fenton, ozone).'); }
      if (f('OG')) addI('og', 'Dầu mỡ vượt giới hạn: tăng hiệu quả tách dầu đầu vào (bể tách dầu, DAF).');
      if (JSON.stringify(o) === before) break;
      r = predict(S, o);
    }
    // điều chỉnh lượng bùn xả theo MLSS mới
    const after = r;
    const ok = after.comply;
    return { base, after, o, recs: [...recs.values()], infra: [...infra.values()], iters: it + 1, ok };
  }

  /* ---------------- hóa chất & năng lượng ---------------- */
  function costs(S, r) {
    const p = S.p, o = r.o, Q = +o.Q, d = r.d;
    const items = [];
    const add = (name, kg, price) => { if (kg > 1e-6) items.push({ name, kg, cost: kg * (p[price] || 0) }); };
    add('PAC (bể sinh học)', (+o.pacSim) * Q / 1000, 'p_PAC');
    add('PAC (hóa lý bậc 3)', (+o.pacTert) * Q / 1000, 'p_PAC');
    add('Methanol', (+o.meoh) * Q / 1000, 'p_MeOH');
    add('NaOH 100 %', (+o.naoh) * Q / 1000, 'p_NaOH');
    add('Polymer trợ lắng', (+o.poly) * Q / 1000, 'p_poly');
    if (o.disinf === 'naocl') add('NaOCl 10 %', (+o.cl) * Q / 1000 / p.cl_conc, 'p_NaOCl');
    // điện cấp khí (PT 5-77)
    const patm = 101.325 * Math.pow(1 - 0.0000225577 * (+S.input.z || 0), 5.2559);
    let kW = 0;
    if (o.aer === 'surf') kW = +o.kWs;
    else { const air = Math.min(+o.air, Math.max(d.airReq, 0)); const p2 = patm + 9.81 * (+o.Df) + p.air_dp; kW = air / 3600 * 1.2 * 8.314 * 293.15 / (28.97 * 0.283 * p.air_e) * (Math.pow(p2 / patm, 0.283) - 1) / 0.95; }
    const kWh = kW * 24 * d.tAer;
    items.push({ name: 'Điện cấp khí (theo nhu cầu oxy thực tế)', kg: kWh, unit: 'kWh/ngđ', cost: kWh * (p.p_kwh || 0) });
    return { items, total: items.reduce((a, x) => a + x.cost, 0) };
  }

  /* ---------------- hiệu chỉnh đặc trưng nước thải & hằng số động học theo số liệu đo ----------------
     Mỗi chỉ tiêu đo hiệu chỉnh một thông số nhạy nhất (giải ngược 1 chiều bằng chia đôi, lặp 3 lượt vì có tương tác):
     TSS → TSS ra cơ sở; bùn dư → b_H; NH₄ → μmax,AOB; NO₃ (hoặc TN) → rbCOD/bCOD (SDNR, Bảng 8-22);
     TP → f_P / rbCOD:P / Al:P theo cơ chế khử P; COD → sCOD/COD (COD trơ hòa tan); BOD → gBOD/gTSS; Coliform → coliform sau SH */
  const isNum = v => v !== undefined && v !== null && v !== '' && isFinite(+v);
  const SDNR_KEY = { AO: 'ao_SDNR', AAO: 'aao_SDNR', MBR: 'mbr_SDNR', SBR: 'sbr_SDNR', ORG: 'org_SDNR', BIOP: 'bp_SDNR' };
  const CAL_STATUS = { ok: 'Khớp số đo', bound: 'Chạm biên – số đo nằm ngoài phạm vi mô hình giải thích được', insens: 'Không nhận dạng được (chỉ tiêu không nhạy với thông số này) – giữ nguyên', derived: 'Suy ra từ SDNR_b đã hiệu chỉnh (quy về MLVSS, 20 °C)' };
  const MEASK = ['COD', 'BOD', 'TSS', 'TN', 'TKN', 'NH4', 'NO3', 'TP', 'Coli'];
  const hasMeas = o => !!o.meas && (MEASK.some(k => isNum(o.meas[k])) || isNum(o.meas.PX));
  const sig = v => +(+v).toPrecision(3);
  function calibrate(S, o) {
    const m = o.meas || {};
    if (!hasMeas(o)) return null;
    const P = { ...S.p }, SS = { ...S, p: P }, oc = JSON.parse(JSON.stringify(o));
    if (isNum(m.T)) { oc.T = +m.T; oc.Tmax = +m.T; }
    if (isNum(m.DO) && +m.DO > 0) oc._DOfix = +m.DO;
    const pr = () => predict(SS, oc);
    const r0 = pr(); if (r0.err) return { err: r0.err };
    const d0 = r0.d, isB = !!BATCH[o.bio];
    const no3m = isNum(m.NO3) ? +m.NO3 : isNum(m.TN) && isNum(m.TKN) ? Math.max(0, m.TN - m.TKN) : null;
    const specs = [];
    const tssKey = MBRS[o.bio] ? null : isB ? 'TSSe_dec' : 'TSSe_cl';
    if (tssKey && isNum(m.TSS)) specs.push({ k: tssKey, lo: 1, hi: 80, by: 'TSS', meas: +m.TSS, get: r => r.eff.TSS });
    if (isNum(m.PX)) specs.push({ k: 'bH', lo: 0.02, hi: 0.4, by: 'PX', meas: +m.PX, get: r => r.d.PXTSS });
    if (isNum(m.NH4)) specs.push({ k: 'muAOB', lo: 0.15, hi: 3, by: 'NH4', meas: Math.max(0.05, +m.NH4), get: r => r.eff.NH4 });
    if (d0.fN > 0 && (no3m !== null || isNum(m.TN))) specs.push({ k: 'rb_bio', lo: 0.05, hi: 0.6, by: no3m !== null ? 'NO3' : 'TN', meas: no3m !== null ? no3m : +m.TN, get: r => no3m !== null ? r.eff.NO3 : r.eff.TN });
    if (isNum(m.TP)) {
      const k = d0.dPE > 0.05 ? ['aao_rbP', 6, 60] : (d0.Psim > 0.05 || d0.AlT > 0) ? ['AlP', 1, 6] : ['fP', 0.005, 0.05];
      specs.push({ k: k[0], lo: k[1], hi: k[2], by: 'TP', meas: +m.TP, get: r => r.eff.TP });
    }
    if (isNum(m.COD)) specs.push({ k: 'scod_cod', lo: 0.03, hi: 0.95, by: 'COD', meas: +m.COD, get: r => r.eff.COD });
    if (isNum(m.BOD)) specs.push({ k: 'bod_tss', lo: 0.05, hi: 1.2, by: 'BOD', meas: +m.BOD, get: r => r.eff.BOD });
    if (isNum(m.Coli) && +m.Coli > 0) specs.push({ k: 'coli_bio', lo: 1e2, hi: 1e8, log: true, by: 'Coli', meas: +m.Coli, get: r => r.eff.Coli });
    const status = {};
    for (let pass = 0; pass < 3; pass++) for (const s of specs) {
      const X = z => s.log ? Math.pow(10, z) : z;
      const fOf = z => { P[s.k] = X(z); const v = s.get(pr()); return s.log ? Math.log10(Math.max(v, 1e-6)) - Math.log10(s.meas) : v - s.meas; };
      const x0 = P[s.k], a = s.log ? Math.log10(s.lo) : s.lo, b = s.log ? Math.log10(s.hi) : s.hi;
      const fa = fOf(a), fb = fOf(b);
      let x, stt = 'ok';
      if (Math.abs(fa - fb) < 1e-3 * Math.max(1, s.log ? 1 : Math.abs(s.meas))) { x = x0; stt = 'insens'; }
      else if (fa * fb > 0) { x = X(Math.abs(fa) < Math.abs(fb) ? a : b); stt = 'bound'; }
      else {
        let lo = a, hi = b, flo = fa;
        for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2, fm = fOf(mid); if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid; }
        x = X((lo + hi) / 2);
      }
      P[s.k] = stt === 'insens' ? x0 : sig(x); status[s.k] = stt;
    }
    const r1 = pr();
    // khoảng tham khảo (M&E 5th Bảng 8-14, 8-22, 8-30, mục 6-4, VD 8-3) – vượt khoảng → cảnh báo kiểm tra lại số đo
    const RANGE = { muAOB: [0.2, 1.2], bH: [0.06, 0.2], rb_bio: [0.1, 0.5], fP: [0.01, 0.03], aao_rbP: [10, 30], AlP: [1.2, 3], scod_cod: [0.15, 0.7], bod_tss: [0.3, 0.7], TSSe_cl: [5, 30], TSSe_dec: [5, 30], coli_bio: [1e4, 1e6] };
    const warnOf = (k, v) => { const g = RANGE[k]; return g && (v < g[0] * 0.999 || v > g[1] * 1.001) ? `ngoài khoảng tham khảo ${fx(g[0], 3)} – ${fx(g[1], 3)}: kiểm tra lại số liệu đo / vận hành trước khi áp dụng` : ''; };
    const items = specs.map(s => ({ k: s.k, label: (DATA.P[s.k] || [])[1] || s.k, unit: (DATA.P[s.k] || [])[2] || '', from: S.p[s.k], to: P[s.k], by: s.by, meas: s.meas, pred0: s.get(r0), pred1: s.get(r1), status: status[s.k], warn: status[s.k] === 'insens' ? '' : warnOf(s.k, P[s.k]) }));
    // SDNR₂₀ của công nghệ đang dùng (cơ sở MLVSS như engine thiết kế: SDNR = SDNR_b·X_b/MLVSS)
    const sk = SDNR_KEY[o.bio];
    if (sk && DATA.P[sk] && status.rb_bio && status.rb_bio !== 'insens') {
      const d = r1.d, mlvss = d.M * d.PXVSS / Math.max(d.PXTSS, 1e-9);
      const v = sig(d.sdnr * d.Xb / Math.max(mlvss, 1e-9) / Math.pow(1.026, oc.T - 20));
      items.push({ k: sk, label: DATA.P[sk][1], unit: DATA.P[sk][2], from: S.p[sk], to: v, by: items.find(x => x.k === 'rb_bio').by, meas: null, pred0: null, pred1: null, status: 'derived' });
    }
    const keys = MEASK.filter(k => isNum(m[k]));
    const cmp = keys.map(k => ({ key: k, meas: +m[k], pred0: r0.eff[k], pred1: r1.eff[k] }));
    if (isNum(m.PX)) cmp.push({ key: 'PX', meas: +m.PX, pred0: r0.d.PXTSS, pred1: r1.d.PXTSS });
    return { items, cmp, r0, r1, P, cond: { T: oc.T, DO: oc._DOfix || null, PX: isNum(m.PX) ? +m.PX : null } };
  }
  /* các thay đổi áp dụng vào thông số thiết kế (tab 4) */
  const calChanges = cal => (cal && cal.items ? cal.items.filter(x => x.status !== 'insens' && Math.abs(x.to - x.from) > 1e-12) : []);

  /* ---------------- gói kết quả cho giao diện & Excel ---------------- */
  const FLAGTXT = { o2: 'Thiếu oxy nghiêm trọng: máy thổi không đủ cả cho khử BOD.', lowDO: 'DO thực đạt < 0,5 mg/L: nitrat hóa bị ức chế, nguy cơ bùn khó lắng.', washout: 'SRT hiếu khí nhỏ hơn SRT tối thiểu: vi khuẩn nitrat hóa bị rửa trôi – gần như không nitrat hóa.', alk: 'Thiếu kiềm: nitrat hóa bị giới hạn bởi độ kiềm, pH giảm.', solidsLoss: 'Bể lắng / pha lắng quá tải: nguy cơ trôi bùn, TSS ra cao.', noAcl: 'Chưa nhập diện tích bể lắng thứ cấp – TSS ra lấy theo giá trị thiết kế.', flux: 'Thông lượng màng vượt khuyến cáo – nguy cơ tắc màng, tăng tần suất rửa.' };
  function report(S, o) {
    const A = advise(S, o);
    if (A.err) return { err: A.err };
    const p = S.p, bio = o.bio, isB = !!BATCH[bio], L = A.base.lim.L, r0 = A.base, r1 = A.after, d0 = r0.d, d1 = r1.d, ao = A.o;
    const Nt = Math.max(0.3, Math.min(L.NH4 !== undefined ? 0.9 * L.NH4 : p.NH4e_des, 5));
    const srtReq = rr => p.SF * srtaFor(S, rr, Nt, Math.max(0.3, rr.d.DOmax));
    const dg = [];
    const D = (n, u, a, b, crit, ok, dec) => dg.push({ n, u, a, b, crit: crit || '', ok: ok === undefined ? null : ok, dec });
    const pair = (x, y, dd) => `${fx(x, dd)} / ${fx(y, dd)}`;
    const mMax = mlssMax(S, ao);
    D('Thể tích chứa bùn hoạt tính', 'm³', d0.Vt, d1.Vt, '', undefined, 0);
    D('Thời gian lưu nước HRT', 'h', d0.HRT, d1.HRT, '');
    D('MLSS vận hành', 'mg/L', d0.MLSS, d1.MLSS, `≤ ${fx(mMax, 0)} (bể lắng / gạn / công nghệ)`, d1.MLSS <= mMax + 1, 0);
    D('SRT toàn hệ (giải từ khối bùn đang giữ)', 'ngày', d0.SRT, d1.SRT, 'M = P_X,TSS·SRT (PT 8-21)');
    D('SRT hiếu khí', 'ngày', d0.SRTa, d1.SRTa, `≥ SF·1/μ_AOB(N = ${fx(Nt)}) = ${fx(srtReq(r1))} (PT 7-94)`, d1.SRTa >= srtReq(r1) * 0.999);
    D('F/M', 'kgBOD/kgMLVSS·d', d0.FM, d1.FM, 'Bảng 8-19', undefined, 3);
    D('Nhu cầu oxy thực tế AOR (trung bình, trong thời gian sục khí)', 'kgO₂/h', d0.AORh, d1.AORh, 'PT (8-23)');
    const surf = o.aer === 'surf', cap1 = surf ? Math.max(+ao.kWsMax, +ao.kWs) : Math.max(+ao.airMax, +ao.air);
    D(surf ? 'Công suất guồng khí cần để giữ DO đặt (trung bình / cao điểm)' : 'Lưu lượng khí cần để giữ DO đặt (trung bình / cao điểm)', surf ? 'kW' : 'Nm³/h', pair(d0.airReq, d0.airReqPk, 0), pair(d1.airReq, d1.airReqPk, 0), `Đang cấp ${fx(surf ? +o.kWs : +o.air, 0)} → ${fx(surf ? +ao.kWs : +ao.air, 0)}; tối đa ${fx(surf ? +o.kWsMax : +o.airMax, 0)}`, d1.airReqPk <= cap1 * 1.0001);
    D('DO thực đạt (ở T_max)', 'mg/L', d0.DO, d1.DO, `DO đặt ${fx(d1.DOmax)}`, d1.DO >= d1.DOmax - 0.05);
    D('Độ kiềm còn lại', 'mg/L CaCO₃', d0.AlkRes, d1.AlkRes, '≥ 50 (khuyến cáo 70 – 80)', d1.AlkRes >= 50, 0);
    D('N bị nitrat hóa NOx', 'mg/L', d0.NOx, d1.NOx, 'PT (8-24)');
    if (d0.fN > 0 || d1.fN > 0) {
      D('F/M_b vùng/pha thiếu khí', 'g/g·d', d0.FMb, d1.FMb, 'PT (8-56)', undefined, 3);
      D('SDNR_b ở T', 'g/g·d', d0.sdnr, d1.sdnr, 'PT (8-57), (8-58)', undefined, 3);
      D('NO₃-N đưa tới vùng/pha thiếu khí', 'mg/L', d0.fed, d1.fed, MLE[bio] ? 'NOx·(IR + R)/(1 + IR + R) (PT 8-61)' : 'toàn bộ NOx (bể mẻ / sục khí gián đoạn)');
      D('Năng lực khử nitrat (carbon nội tại + methanol)', 'mg/L', d0.cap, d1.cap, 'SDNR_b·M_Xb·f_tk (PT 8-52)');
    }
    D('P đồng hóa / EBPR / hóa học (bể sinh học)', 'mg/L', `${fx(d0.Pass)} / ${fx(d0.dPE)} / ${fx(d0.Psim)}`, `${fx(d1.Pass)} / ${fx(d1.dPE)} / ${fx(d1.Psim)}`, 'VD 8-13; Bảng 8-30; mục 6-4');
    if (DATA.NEED_CLARIFIER[bio] && +o.Acl > 0) {
      D('Tải trọng bề mặt bể lắng TB / đỉnh', 'm³/m²·ngđ', pair(d0.SOR, d0.SORpk), pair(d1.SOR, d1.SORpk), `≤ ${d1.lims[0]} / ${d1.lims[1]} (Bảng 8-34)`, d1.SOR <= d1.lims[0] && d1.SORpk <= d1.lims[1]);
      D('Tải trọng chất rắn TB / đỉnh', 'kg/m²·h', pair(d0.SLR, d0.SLRpk), pair(d1.SLR, d1.SLRpk), `≤ ${d1.lims[2]} / ${d1.lims[3]} (Bảng 8-34)`, d1.SLR <= d1.lims[2] && d1.SLRpk <= d1.lims[3]);
      D('Tỷ lệ tuần hoàn bùn cần R = X/(X_R − X)', '× Q', d0.Rreq, d1.Rreq, `Đang vận hành ${fx(+o.R)} → ${fx(+ao.R)}`, +ao.R >= d1.Rreq * 0.98);
    }
    if (isB) D('Tỷ lệ gạn ΔH/TWL', '-', d0.rD, d1.rD, `≤ 1 − MLSS·SVI/10⁶ − h_sup/TWL = ${fx(d1.rDmax)} (PT 8-50)`, d1.rD <= d1.rDmax, 3);
    if (MBRS[bio] && +o.Am > 0) D('Thông lượng màng TB / đỉnh', 'L/m²·h', pair(d0.Jn, d0.Jpk), pair(d1.Jn, d1.Jpk), bio === 'KMBR' ? `≤ ${fx(p.kb_F * 1000 / 24)} / ${fx(p.kb_Fmax * 1000 / 24)} (Kubota)` : `≤ ${p.mbr_flux} / ${p.mbr_fluxp}`, bio === 'KMBR' ? d1.Jn <= p.kb_F * 1000 / 24 * 1.1 && d1.Jpk <= p.kb_Fmax * 1000 / 24 : d1.Jn <= p.mbr_flux * 1.1 && d1.Jpk <= p.mbr_fluxp);
    D('Bùn dư sinh ra P_X,TSS', 'kg/ngđ', d0.PXTSS, d1.PXTSS, '', undefined, 0);
    D('Lưu lượng bùn cần xả để giữ MLSS', 'm³/ngđ', d0.Qw, d1.Qw, isB ? 'theo MLSS ở TWL (xả trong pha lắng/gạn)' : 'Q_w = P_X/X_R', undefined, 1);
    const recs = A.recs.map(x => ({ label: x.label, unit: x.unit, from: x.from, to: x.to, why: x.why.join('; '), dec: x.k === 'air' || x.k === 'MLSS' ? 0 : 2 }));
    recs.push({ label: 'Lưu lượng bùn dư xả', unit: 'm³/ngđ', from: d0.Qw, to: d1.Qw, why: `Xả đều trong ngày để giữ MLSS khuyến cáo (P_X,TSS = ${fx(d1.PXTSS, 0)} kg/ngđ)`, dec: 1 });
    return { A, diag: dg, recs, c0: costs(S, r0), c1: costs(S, r1), flags: r0.flags.map(k => FLAGTXT[k] || k), cal: calibrate(S, o), Nt };
  }

  return { defaults, ensure, fromDesign, predict, advise, costs, mlssMax, srtaFor, calibrate, calChanges, report, hasMeas, CAL_STATUS, BATCH, MEDIA, MLE };
})();
