'use strict';
/* ==========================================================================
   Thiết kế XLNT ⇄ hồ sơ trao đổi (../../js/xch.js)
   Gửi: đầu bài (lưu lượng, nhiệt độ, chất lượng nước thô, giới hạn xả), công nghệ & thông số thiết kế
        của phương án đang xem, kết quả chính (thể tích, SRT, MLSS, bùn dư, O₂, nước ra cột ⑤) và
        bản tính Excel (SimXLNT dùng bộ nhập bản tính đầy đủ).
   Nhận: bảng "hiện tại → giá trị nhận", người dùng chọn rồi áp dụng; thể tích/tuần hoàn của
        phần mềm khác được quy về thông số đầu vào của phần mềm này (thời gian lưu thiếu khí/kỵ khí…).
   ========================================================================== */
const TKX = (() => {
  // tiền tố thông số theo công nghệ
  const PRE = { CAS: 'cas', AO: 'ao', AAO: 'aao', SBR: 'sbr', ICEAS: 'ic', OD: 'od', MBBR: 'mbbr', MBR: 'mbr', ORG: 'org', BIOP: 'bp', CTECH: 'ct', KMBR: 'kb', AGS: 'ags' };
  const BATCH = { SBR: 1, ICEAS: 1, CTECH: 1, AGS: 1 };
  const has = k => DATA.P[k] !== undefined;
  const clampV = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = XCH.num;

  function rowVal(R, uid, re) {
    const U = R && R.um && R.um[uid]; if (!U || !U.ids) return undefined;
    for (const r of Object.values(U.ids)) if (r && (re.test(r.sym || '') || re.test(r.id || '')) && num(r.val)) return +r.val;
    return undefined;
  }

  /* hóa chất của phương án: sinh học (PAC khử P đồng thời → Al, NaOH bổ sung kiềm, methanol → COD), hóa lý trước/bậc 3, khử trùng */
  /* xử lý bậc 3 – oxy hóa (mục OXH) & chất keo tụ: SimXLNT dựng thiết bị AOP / keo tụ tương ứng */
  function tertOf(R, c) {
    const u = R.um.aop, g = k => u && u.ids[k] && num(u.ids[k].val) ? +u.ids[k].val : undefined;
    return { coag: c.coag || 'pac', aop: c.aop || 'none', E: g('E'), t: g('t'), V: u ? u.V : undefined, H2O2: g('H2O2'), Fe: g('Fe'), O3: g('O3'), ClO2: g('ClO2'), acid: g('acid') };
  }
  function chemOf(R, p) {
    const sum = re => R.chem.filter(x => re.test(x.name)).reduce((a, x) => a + (+x.kg || 0), 0) || undefined;
    const pac = sum(/khử P đồng thời/), meoh = sum(/^Methanol/);
    return {
      Al: pac ? pac * p.PAC_al * 54 / 102 : undefined, NaOH: sum(/^NaOH 100 % – bổ sung kiềm/), Cext: meoh ? meoh * 1.5 : undefined,
      PACpre: rowVal(R, 'hl', /^C_PAC$/), polyPre: rowVal(R, 'hl', /^C_poly$/), NaOHpre: rowVal(R, 'hl', /^M_NaOH$/),
      PACpost: rowVal(R, 'hl3', /^C_PAC$/), polyPost: rowVal(R, 'hl3', /^C_poly$/), NaOHpost: rowVal(R, 'hl3', /^M_NaOH$/),
      Cl2: rowVal(R, 'dis', /^C$/), tCl: rowVal(R, 'dis', /^t$/), UVd: rowVal(R, 'dis', /^D_UV$/)
    };
  }

  /* xử lý yếm khí cấp 1 (mục YK): công nghệ, thể tích, nhiệt độ, tuổi bùn, bùn dư, NaHCO₃, chất lượng nước vào/ra –
     SimXLNT dựng bể kỵ khí tốc độ cao (ADM1, lưu giữ bùn) trước cụm sinh học */
  function anaerOf(R, p, c) {
    const u = R && R.um && R.um.ana; if (!u || !c || !c.anaer || c.anaer === 'none') return undefined;
    const g = k => u.ids[k] && num(u.ids[k].val) ? +u.ids[k].val : undefined;
    const st = R.st || {}, pick = s => s ? { COD: s.COD, BOD: s.BOD, TSS: s.TSS, TKN: s.TKN, NH4: s.NH4, NO3: s.NO3, TP: s.TP, Alk: s.Alk } : undefined;
    return { tech: c.anaer, name: (DATA.ANA[c.anaer] || {}).name, V: g('Vd'), T: g('Ta'), SRT: g('SRT'), HRT: g('HRT'), OLR: g('OLR'), Qw: g('Qwa') || 0, Mw: g('PXa') || 0, DS: g('DSa'),
      NaHCO3: g('MNaHCO3') || 0, TSSe: g('TSS_ra'), CODe: g('COD_ra'), CH4: g('VCH4'), in: pick(st.st3), raw: pick(st.st1), out: pick(st.st3a),
      frac: { scod: p.scod_cod, sbodBod: p.sbod_bod, bcodBod: p.bcod_bod, rbB: p.rb_b, vss: p.vss_tss } };
  }

  /* dòng bùn cho phần mềm Xử lý bùn: sinh học (hoặc bùn hạt NEREDA), hóa lý, bùn dư yếm khí cấp 1 */
  function sludgeOf(R, p, c) {
    const g = (u, k) => R.um[u] && R.um[u].ids[k] && num(R.um[u].ids[k].val) ? +R.um[u].ids[k].val : 0;
    const Mana = g('ana', 'PXa'), Mbio = Math.max(0, g('sl0', 'Mbio') - Mana), Mchem = g('sl0', 'Mchem');
    const PXV = g('bio', 'PXVSS'), PXT = g('bio', 'PXTSS'), Cwas = g('dw', 'Cwas');
    const streams = [];
    if (Mbio > 0) streams.push(c.bio === 'AGS' ? { name: 'Bùn dư bùn hạt NEREDA', kind: 'gran', M: Mbio, C: (+p.ags_WASc || 12) / 10, fVS: PXT > 0 ? PXV / PXT : 0.7 }
      : { name: 'Bùn sinh học dư (' + (DATA.BIO_SHORT[c.bio] || c.bio) + ')', kind: 'bio', M: Mbio, C: Cwas > 0 ? Cwas / 10 : 0.8, fVS: PXT > 0 ? PXV / PXT : 0.75 });
    if (Mchem > 0) streams.push({ name: 'Bùn hóa lý', kind: 'chem', M: Mchem, C: +p.chem_DS || 1.5, fVS: 0.4 });
    if (Mana > 0) streams.push({ name: 'Bùn dư yếm khí ' + ((DATA.ANA && DATA.ANA[c.anaer] && DATA.ANA[c.anaer].short) || ''), kind: 'ana', M: Mana, C: +p.ana_DS || 4, fVS: 0.7 });
    const st = R.um.stab, ids = st ? st.ids : {}, gv = k => ids[k] && num(ids[k].val) ? +ids[k].val : undefined;
    return { streams, thick: c.thick || 'gravity', dew: { belt: 'belt', screw: 'screw', centrifuge: 'centrifuge', filterpress: 'press', beds: 'beds' }[c.dewater] || 'belt',
      stab: c.stab || 'none', dry: c.dry || 'none', stabV: gv('V'), stabSRT: gv('SRT'), stabT: c.stab === 'tad' ? 55 : c.stab === 'mad' ? 35 : undefined, thC: R.um.thm ? g('thm', 'C') : R.um.gbt ? +p.gbt_C : undefined, cakeDS: R.sludge && R.sludge.cake ? g('dw', 'Cc') : undefined };
  }

  /* ---------------- gửi ---------------- */
  async function build(to) {
    const S = APP.S, cur = APP.RES[S.cur];
    if (!cur || !cur.R) throw new Error('Phương án đang xem chưa tính được (xem tab Kết quả & kiểm tra).');
    const R = cur.R, alt = cur.alt, tech = alt.c.bio, p = S.p, pre = PRE[tech], I = S.input;
    const q = S.input.q;
    const r = {
      project: { name: S.project.name, code: S.project.code, location: S.project.location, alt: alt.name },
      tech, flow: { Q: +I.Q, kmax: +I.kmax, kmin: +I.kmin }, temp: { Tmin: +I.Tmin, Tmax: +I.Tmax, Tdes: +I.Tmin },
      inf: { COD: q.COD, BOD: q.BOD, TSS: q.TSS, TKN: q.TKN, NH4: q.NH4, NO3: q.NO3, TN: q.TN, TP: q.TP, Alk: q.Alk, pH: q.pH, VSSr: p.vss_tss },
      lim: Object.assign({}, R.lim && R.lim.L), limName: R.lim && R.lim.name
    };
    const des = { DO: p.DO, SVI: p.SVI, TSSe: BATCH[tech] ? p.TSSe_dec : p.TSSe_cl };
    const P = k => (has(pre + '_' + k) ? +p[pre + '_' + k] : undefined);
    des.SRT = P('SRT'); des.MLSS = P('MLSS'); des.H = P('H'); des.N = P('n') || P('N') || P('nT') || P('nb');
    if (tech === 'ICEAS') {
      // ic_pre là chiều dài khoang pre-react (m) → tỷ lệ diện tích = min(ic_pre; 0,2·L)/L như trong engine
      const Lb = rowVal(R, 'bio', /^L$/), Wb = rowVal(R, 'bio', /^W$/);
      // chu kỳ đang áp dụng (NIT / NDN(P) / tự nhập, kể cả khi Bước 6 đã tăng Air-Off), tổng số bể và SRT tính ở Bước 2
      const bi = R.um.bio.ids, iv = k => bi[k] ? +bi[k].val : undefined;
      Object.assign(des, { H: p.ic_TWL, Hmax: p.ic_TWL, N: iv('nb') || p.ic_nb, tAer: iv('ton') ?? p.ic_on, tMix: iv('toff') ?? p.ic_off, tS: iv('tset') ?? p.ic_set, tD: iv('tdec') ?? p.ic_dec, L: Lb, W: Wb, Hmin: rowVal(R, 'bio', /^BWL$/),
        SRT: iv('SRT') || des.SRT,
        fPre: Lb > 0 ? Math.min(p.ic_pre, 0.2 * Lb) / Lb : undefined, icFeed: alt.c.icFeed === 'batch' ? 'batch' : 'cont' });
    }
    if (tech === 'CTECH') Object.assign(des, { H: p.ct_TWLmax, Hmax: p.ct_TWLmax, N: p.ct_N, ct: { TFA: p.ct_TFA, TS: p.ct_TS, TD: p.ct_TD, R: p.ct_R }, rRAS: p.ct_R });
    if (tech === 'SBR') des.sbr = { tF: p.sbr_fill, tR: p.sbr_react, tS: p.sbr_settle, tD: p.sbr_decant, tI: p.sbr_idle, VF: p.sbr_VF };
    if (tech === 'AGS' && R.um.bio.ags) {
      // NEREDA: số bể, kích thước, chu kỳ (như hồ sơ của phần mềm NEREDA – SimXLNT dựng SBR nạp kỵ khí ASM2dG)
      const g = R.um.bio.ags, v = k => rowVal(R, 'bio', new RegExp('^' + k + '$'));
      Object.assign(des, { H: g.H, Hmax: g.H, Hmin: g.BWL, N: g.Nr, MLSS: g.Xact * 1000, SVI: p.ags_SVI, VT: g.VR, Vtot: g.VR * g.Nr, VF: g.VF, L: g.Lb, W: g.W, tAer: g.tA * 60,
        Vbuf: g.r.reactor.Vbuf || 0, sbr: { tF: v('t_nạp'), tR: v('t_sục'), tS: v('t_lắng'), tD: v('t_xả'), tI: v('t_chờ'), VF: g.VF } });
      r.extra = { nereda: { X: p.ags_X, SVI: p.ags_SVI, tc: p.ags_tc, tcRwf: p.ags_tcRwf, ts: p.ags_ts, WASc: p.ags_WASc, buffer: +p.ags_buffer > 0, Vbuf: g.r.reactor.Vbuf || 0 } };
    }
    if (tech === 'MBR') des.SADm = p.mbr_SAD;
    if (tech === 'KMBR') des.R = p.kb_r;
    // kết quả chính từ bản tính (dòng tìm theo ký hiệu)
    const res = { eff: {} };
    for (const k of ['COD', 'BOD', 'TSS', 'TKN', 'NH4', 'NO3', 'TN', 'TP']) { const v = rowVal(R, 'bal', new RegExp('^' + k + '5$')); if (v !== undefined) res.eff[k] = v; }
    // quy ước hồ sơ: SRT = tuổi bùn TỔNG (MCRT ICEAS, SRT cân bằng bùn C-Tech/Kubota, SRT_hệ dòng liên tục), SRTaer = tuổi bùn hiếu khí
    const id = k => R.um.bio && R.um.bio.ids[k] && num(R.um.bio.ids[k].val) ? +R.um.bio.ids[k].val : undefined;
    let srtTot, srtAer;
    if (tech === 'ICEAS') { srtTot = id('SRT'); srtAer = id('SRTae'); }
    else if (tech === 'CTECH') { srtTot = id('cSRTme'); srtAer = id('cSRTa'); }
    else if (tech === 'KMBR') { srtTot = id('kSRT'); srtAer = id('kSRTa'); }
    else if (tech === 'AGS') { srtTot = id('agsSRT'); srtAer = id('agsSRTa'); }
    else if (tech === 'SBR') { srtAer = id('SRT'); srtTot = id('SRTs') ?? (num(srtAer) && id('fAer') > 0 ? srtAer / id('fAer') : srtAer); }
    else { srtAer = id('SRT'); srtTot = id('SRTs') ?? srtAer; }       // bioCommon: SRT = hiếu khí; SRT_hệ = tổng
    res.SRT = srtTot; res.SRTaer = srtAer;
    res.PX = rowVal(R, 'bio', /^P_X,TSS$/); res.OTR = rowVal(R, 'bio', /^AOR$/);
    res.Vbio = R.kpi && R.kpi.Vbio; res.note = 'Bản tính ' + alt.name + ' (M&E 5th), T thiết kế sinh học = ' + I.Tmin + ' °C';
    if (num(srtTot)) des.SRT = srtTot; des.SRTaer = srtAer;
    const vk = rowVal(R, 'bio', /^V_kk$/), vt = rowVal(R, 'bio', /^V_tk$/), vh = rowVal(R, 'bio', /^V_hk$/);
    Object.assign(des, { Vkk: vk, Vtk: vt, Vhk: vh, R: des.R != null ? des.R : rowVal(R, 'bio', /^R$/), IR: rowVal(R, 'bio', /^IR$/) });
    const Veq = rowVal(R, 'eq', /^V_tt$/); if (num(Veq)) { des.Veq = Veq; des.Heq = rowVal(R, 'eq', /^H$/); }
    r.des = des; r.res = res;
    r.chem = chemOf(R, p);
    r.sludge = sludgeOf(R, p, alt.c);
    r.tert = tertOf(R, alt.c);
    r.anaer = anaerOf(R, p, alt.c);
    r.air = { alpha: p.air_alpha, F: p.air_F, SOTE: p.air_SOTE, eBlow: p.air_e };
    r.kin = { muH: p.muH, bH: p.bH, YH: p.YH, muA: p.muAOB, bA: p.bAOB, KNH: p.KNH4 };
    // bản tính Excel cho SimXLNT (bộ nhập đầy đủ: cột ④, bể, chu kỳ, máy thổi, so sánh)
    if (!to || to === 'sim') {
      try {
        const blob = REP.xlsx(S, R, APP.RES.filter(x => x.R));
        r.xlsx = XCH.b64(await (blob instanceof Blob ? blob : new Blob([blob])).arrayBuffer());
      } catch (e) { console.warn('Không tạo được bản tính Excel cho hồ sơ:', e); }
    }
    return XCH.make('thietke', r);
  }

  /* ---------------- gửi từ tab "Kiểm tra vận hành" ----------------
     which = 'cur' (số liệu vận hành hiện tại) | 'rec' (điều kiện vận hành khuyến cáo): công trình hiện hữu (thể tích, MLSS, R, IR,
     khí cấp), nước vào thực tế, hóa chất và nước ra dự đoán (mô hình ổn định M&E) → SimXLNT dựng sơ đồ để mô phỏng động. */
  function opsState(which) {
    const S = APP.S, o0 = OPS.ensure(S);
    if (which !== 'rec') return { o: o0, P: OPS.predict(S, o0) };
    const A = OPS.advise(S, o0);
    if (A.err || !A.o) throw new Error(A.err || 'Không tìm được điều kiện vận hành khuyến cáo.');
    return { o: A.o, P: A.after };
  }
  function buildOps(which) {
    return async () => {
      const S = APP.S, { o, P } = opsState(which);
      if (!P || P.err) throw new Error((P && P.err) || 'Số liệu vận hành chưa đủ để tính (tab Kiểm tra vận hành).');
      const d = P.d, q = o.q, isB = !!OPS.BATCH[o.bio], Q = +o.Q;
      const r = {
        project: { name: S.project.name + ' – vận hành' + (which === 'rec' ? ' (khuyến cáo)' : ''), code: S.project.code, location: S.project.location, alt: 'Kiểm tra vận hành' },
        tech: o.bio, flow: { Q, kmax: +o.kmax }, temp: { Tmin: +o.T, Tmax: +o.Tmax, Tdes: +o.T },
        inf: { COD: q.COD, BOD: q.BOD, TSS: q.TSS, TKN: q.TKN, NH4: q.NH4, NO3: Math.max(0, (q.TN || 0) - (q.TKN || 0)), TN: q.TN, TP: q.TP, Alk: q.Alk, pH: q.pH, VSSr: S.p.vss_tss },
        lim: Object.assign({}, P.lim && P.lim.L), limName: P.lim && P.lim.name,
        notes: { bioIn: 'Số liệu vận hành ' + (which === 'rec' ? 'theo điều kiện khuyến cáo' : 'hiện tại') + ' – tab Kiểm tra vận hành' }
      };
      const des = { DO: +o.DO, SVI: +o.SVI, MLSS: +o.MLSS, SRT: d.SRT, SRTaer: d.SRTa, R: +o.R, IR: +o.IR };
      if (isB) {
        // bể mẻ: số bể, kích thước & chu kỳ lấy theo thiết kế hiện tại (số liệu vận hành chỉ có tổng thể tích, mực nước, phân suất pha)
        const p = S.p, b = o.bio, cur = APP.RES[S.cur], R0 = cur && cur.R && cur.alt.c.bio === b ? cur.R : null;
        const N = b === 'ICEAS' ? (+p.ic_nb) * Math.max(1, +S.input.nMod | 0) : b === 'CTECH' ? +p.ct_N : b === 'AGS' ? Math.max(1, Math.round(+p.ags_Nr)) : +p.sbr_n;
        const A1 = o.Vb > 0 && o.TWL > 0 && N > 0 ? o.Vb / o.TWL / N : undefined, LW = b === 'ICEAS' ? +p.ic_LW : b === 'CTECH' ? +p.ct_LB : b === 'AGS' ? +p.ags_LW : +p.sbr_LW || 2;
        const W = A1 ? Math.sqrt(A1 / Math.max(LW, 0.5)) : undefined;
        Object.assign(des, { Vtot: +o.Vb, Hmax: +o.TWL, H: +o.TWL, Hmin: Math.max(0, o.TWL - o.dH), Vkk: +o.Vana || undefined, N, W, L: A1 && W ? A1 / W : undefined, dM: N > 0 && d.PXTSS > 0 ? d.PXTSS / N : undefined });
        if (b === 'ICEAS') des.icFeed = (S.alts[S.cur].c.icFeed === 'batch') ? 'batch' : 'cont';
        if (b === 'ICEAS') { const ic0 = R0 && R0.icRec ? R0.icRec.M || R0.icRec[R0.icRec.use] : null, ph = ic0 && ic0.ph; Object.assign(des, ph ? { tAer: ph.on, tMix: ph.off, tS: ph.set, tD: ph.dec } : { tAer: p.ic_on, tMix: p.ic_off, tS: p.ic_set, tD: p.ic_dec }); }
        if (b === 'CTECH') Object.assign(des, { ct: { TFA: p.ct_TFA, TS: p.ct_TS, TD: p.ct_TD, R: p.ct_R }, rRAS: p.ct_R });
        if (b === 'SBR') {
          const VF = o.TWL > 0 && o.dH > 0 ? o.dH / o.TWL : p.sbr_VF;
          Object.assign(des, { VT: N > 0 && o.Vb > 0 ? o.Vb / N : undefined, VF });
          des.sbr = { tF: p.sbr_fill, tR: p.sbr_react, tS: p.sbr_settle, tD: p.sbr_decant, tI: p.sbr_idle, VF };
        }
        if (b === 'AGS') {
          // NEREDA: chu kỳ theo thiết kế hiện tại; thể tích & trao đổi thể tích theo số liệu vận hành
          const VF = o.TWL > 0 ? clampV(o.dH / o.TWL, 0.05, 0.9) : +p.ags_VERdwf, rv = k => R0 ? rowVal(R0, 'bio', new RegExp('^' + k + '$')) : undefined;
          Object.assign(des, { VT: o.Vb / N, VF, SVI: +o.SVI, sbr: { tF: rv('t_nạp') ?? 2, tR: rv('t_sục') ?? 3.25, tS: rv('t_lắng') ?? +p.ags_ts, tD: rv('t_xả') ?? 0.25, tI: rv('t_chờ') ?? 0, VF } });
          r.extra = { nereda: { X: p.ags_X, SVI: +o.SVI, tc: p.ags_tc, tcRwf: p.ags_tcRwf, ts: p.ags_ts, WASc: p.ags_WASc, buffer: +p.ags_buffer > 0 } };
        }
      }
      else Object.assign(des, { Vkk: +o.Vana || undefined, Vtk: +o.Van || undefined, Vhk: +o.Vaer, Vmem: +o.Vmem || undefined, Am: +o.Am || undefined, Acl: +o.Acl || undefined, Vtot: (+o.Vana || 0) + (+o.Van || 0) + (+o.Vaer || 0) + (+o.Vmem || 0) });
      r.des = des;
      r.air = { alpha: +o.alpha, F: S.p.air_F, SOTE: o.aer === 'diff' ? +o.SOTE : undefined, subm: o.aer === 'diff' ? +o.Df : undefined, eBlow: S.p.air_e, Qair: o.aer === 'diff' ? +o.air : undefined };
      r.chem = { NaOH: o.naoh * Q / 1000 || undefined, Cext: o.meoh * Q / 1000 * 1.5 || undefined, Al: o.pacSim * Q / 1000 * S.p.PAC_al * 54 / 102 || undefined,
        PACpost: +o.tert ? +o.pacTert || undefined : undefined, polyPost: +o.tert ? +o.poly || undefined : undefined,
        Cl2: o.disinf === 'naocl' ? +o.cl || undefined : undefined, UVd: o.disinf === 'uv' ? +o.uv || undefined : undefined };
      const e = P.eff || {};
      r.res = { eff: { COD: e.COD, BOD: e.BOD, TSS: e.TSS, TKN: e.TKN, NH4: e.NH4, NO3: e.NO3, TN: e.TN, TP: e.TP }, SRT: d.SRT, SRTaer: d.SRTa, MLSS: d.MLSS, PX: d.PXTSS, OTR: d.AORd, air: o.aer === 'diff' ? o.air * 24 : undefined, Vbio: d.Vt,
        note: 'Dự đoán trạng thái ổn định (M&E 5th) – tab Kiểm tra vận hành, ' + (which === 'rec' ? 'điều kiện khuyến cáo' : 'vận hành hiện tại') + ', T = ' + o.T + ' °C' };
      { const cur = APP.RES[S.cur]; if (cur && cur.R) {
        r.anaer = anaerOf(cur.R, S.p, cur.alt.c); if (r.anaer) r.anaer.ops = true;
        r.tert = tertOf(cur.R, cur.alt.c); r.sludge = sludgeOf(cur.R, S.p, cur.alt.c);
        // dây chuyền công nghệ cho SimXLNT dựng "toàn dây chuyền": theo phương án thiết kế, các lựa chọn của tab Kiểm tra vận hành
        // (hóa lý trước/sau sinh học, lọc, khử trùng) ghi đè; hóa lý trước sinh học (CEPT): liều hóa chất theo phương án
        const c = cur.alt.c, on = (k, v) => DATA.optName(k, v), cpos = o.pre === 'cept' ? 'pre' : +o.tert ? 'post' : 'none';
        r.chain = [
          { n: 'Song chắn rác thô', c: on('screen', c.screen) }, { n: 'Lưới lọc rác tinh', c: on('fine', c.fine) },
          { n: 'Lắng cát – tách dầu', c: on('grit', c.grit) }, { n: 'Bể điều hòa', c: on('eq', c.eq) },
          { n: 'Hóa lý', c: cpos === 'none' ? on('chemPos', 'none') : on('chemPos', cpos) + ' – ' + on('chemSep', c.chemSep) },
          { n: 'Lọc bậc 3', c: on('filt', +o.filt ? (c.filt !== 'none' ? c.filt : 'sand') : 'none') },
          { n: 'Khử trùng', c: on('disinf', o.disinf || c.disinf) },
          { n: 'Nén bùn', c: on('thick', c.thick) }, { n: 'Khử nước bùn', c: on('dewater', c.dewater) }
        ];
        if (cpos === 'pre') Object.assign(r.chem, { PACpre: rowVal(cur.R, 'hl', /^C_PAC$/), polyPre: rowVal(cur.R, 'hl', /^C_poly$/), NaOHpre: rowVal(cur.R, 'hl', /^M_NaOH$/) });
      } }
      // nước vào cụm sinh học theo mô hình dự đoán (sau tiền xử lý / CEPT): SimXLNT dựng phạm vi "sinh học" đúng tải; có yếm khí cấp 1
      // → nước vào bể yếm khí (SimXLNT dựng bể kỵ khí trước sinh học, không áp tỷ lệ ra/vào lần nữa); nước thô (inf) cho "toàn dây chuyền"
      if (P.st4) {
        const s = Object.assign({}, P.st4);
        if (r.anaer && o.anaR) for (const [k, f] of Object.entries(o.anaR)) if (s[k] !== undefined && f > 0 && isFinite(f)) s[k] /= f;
        r.bioIn = { COD: s.COD, BOD: s.BOD, TSS: s.TSS, TKN: s.TKN, NH4: s.NH4, NO3: s.NO3, TN: s.TKN + s.NO3, TP: s.TP, Alk: s.Alk, pH: q.pH, VSSr: S.p.vss_tss };
      }
      r.extra = Object.assign(r.extra || {}, { ops: which });
      return XCH.make('thietke', r);
    };
  }
  function opsMenu(anchor, which) { XCH.menu(anchor, { build: buildOps(which), label: which === 'rec' ? 'Gửi điều kiện vận hành KHUYẾN CÁO sang' : 'Gửi số liệu vận hành HIỆN TẠI sang' }); }

  /* ---------------- chuyển kết quả kiểm tra vận hành → phần tính toán thiết kế (tính lại) ---------------- */
  function opsToDesign(which) {
    const S = APP.S, p = S.p, alt = S.alts[S.cur], I = S.input;
    let st; try { st = opsState(which); } catch (e) { alert(e.message); return; }
    const { o, P } = st; if (!P || P.err) { alert((P && P.err) || 'Số liệu vận hành chưa đủ để tính.'); return; }
    const d = P.d, tech = o.bio, pre = PRE[tech], items = [], Q = +o.Q;
    const it = (grp, l, u, cur, nv, set, x) => items.push(Object.assign({ grp, l, u, cur, nv, set }, x || {}));
    const PP = (grp, key, nv, x) => { if (has(key) && num(nv)) it(grp, DATA.P[key][1], DATA.P[key][2], p[key], +(+nv).toPrecision(5), v => { p[key] = v; (S.pMan = S.pMan || {})[key] = 1; }, x); };
    if (tech !== alt.c.bio) it('Phương án', 'Công nghệ sinh học của phương án "' + alt.name + '"', '', DATA.BIO_SHORT[alt.c.bio] || alt.c.bio, DATA.BIO_SHORT[tech] || tech, () => { alt.c.bio = tech; }, { fmt: v => v });
    const g1 = 'Đầu bài (tab 1)';
    if (num(Q)) it(g1, 'Lưu lượng trung bình Q', 'm³/ngđ', I.Q, Q, v => { I.Q = v; });
    if (num(o.T)) it(g1, 'Nhiệt độ thấp nhất', '°C', I.Tmin, +o.T, v => { I.Tmin = v; });
    if (num(o.Tmax)) it(g1, 'Nhiệt độ cao nhất', '°C', I.Tmax, +o.Tmax, v => { I.Tmax = v; });
    for (const k of ['COD', 'BOD', 'TSS', 'TKN', 'NH4', 'TN', 'TP', 'Alk', 'OG', 'Color', 'Coli', 'pH']) {
      if (!o.q || !num(o.q[k]) || I.q[k] === undefined) continue;
      const qp = DATA.QPARAMS.find(x => x[0] === k);
      it('Chất lượng nước thải vào (tab 1)', qp ? qp[1] : k, qp ? qp[2] : '', I.q[k], +o.q[k], v => { I.q[k] = v; I.preset = 'custom'; });
    }
    const g3 = 'Thông số thiết kế chung (tab 4)', g4 = 'Thông số công nghệ ' + (DATA.BIO_SHORT[tech] || tech) + ' (tab 4)';
    PP(g3, 'DO', o.DO); PP(g3, 'SVI', o.SVI);
    if (o.aer === 'diff') { PP(g3, 'air_SOTE', o.SOTE); PP(g3, 'air_alpha', o.alpha, { on: !OPS.MEDIA[tech] && tech !== 'MBR' && tech !== 'KMBR' }); PP(g3, 'air_de', o.Df, { on: false, note: 'Độ ngập đĩa hiện hữu' }); }
    if (!OPS.BATCH[tech]) {
      PP(g4, pre + '_SRT', d.SRTa, { note: 'SRT hiếu khí tính từ khối bùn đang giữ (MLSS·V)' });
      PP(g4, pre + '_MLSS', o.MLSS);
      const h = V => num(V) && V > 0 && Q > 0 ? V / Q * 24 : undefined;
      if (tech === 'AO' || tech === 'MBR') PP(g4, 'ao_tanox', h(o.Van), { note: 'V_thiếu khí ' + XCH.fmt(o.Van) + ' m³ / Q × 24' });
      if (tech === 'AAO') { PP(g4, 'aao_tanox', h(o.Van), { note: 'V_thiếu khí / Q × 24' }); PP(g4, 'aao_tana', h(o.Vana), { note: 'V_kỵ khí / Q × 24' }); }
      if (tech === 'ORG' || tech === 'BIOP') PP(g4, pre + '_tanox', h(o.Van));
      if (num(o.IR) && o.IR > 0) PP(g4, pre + '_IRmax', o.IR, { note: 'IR vận hành – dùng làm IR tối đa' });
      if (tech === 'OD') PP(g4, 'od_ftk', 1 - o.fOn);
    } else if (tech === 'CTECH') { PP(g4, 'ct_MLSS', o.MLSS); PP(g4, 'ct_dH', o.dH); PP(g4, 'ct_TWLmax', o.TWL); }
    else if (tech === 'ICEAS') { PP(g4, 'ic_TWL', o.TWL); PP(g4, 'ic_SRT', d.SRT, { on: false, note: 'SRT tổng từ khối bùn đang giữ (0 = tự chọn theo Bước 2 – nên giữ tự chọn)' }); }
    else if (tech === 'SBR') { PP(g4, 'sbr_SRT', d.SRTa, { note: 'SRT hiếu khí (SRT tổng ' + XCH.fmt(d.SRT) + ' d × phân suất sục khí)' }); PP(g4, 'sbr_MLSS', o.MLSS); PP(g4, 'sbr_H', o.TWL); }
    // hóa chất: liều vận hành → liều chọn của phần thiết kế (0 = theo tính toán khuyến cáo)
    const g5 = 'Hóa chất – liều chọn (tab 4)';
    const PC = (key, nv, x) => { if (has(key) && num(nv) && Math.abs(+nv - (+p[key] || 0)) > 1e-6) PP(g5, key, nv, x); };
    PC('naoh_set', +o.naoh || 0, { note: +o.naoh > 0 ? 'NaOH 100 % bổ sung kiềm ' + XCH.fmt(o.naoh) + ' mg/L' : '0 = theo cân bằng kiềm' });
    PC('meoh_set', +o.meoh || 0, { note: +o.meoh > 0 ? 'Methanol ' + XCH.fmt(o.meoh) + ' mg/L ≈ ' + XCH.fmt(o.meoh * 1.5 * Q / 1000) + ' kg COD/ngđ' : '0 = theo thiếu hụt khử nitrat' });
    PC('pacSim_set', +o.pacSim || 0, { note: +o.pacSim > 0 ? 'PAC châm vào bể sinh học' : '0 = theo khử P' });
    if (+o.tert) { PC('PAC', o.pacTert, { note: 'Liều Jartest – dùng chung cho cụm hóa lý trước/bậc 3' }); PC('poly_c', o.poly); }
    if (o.disinf === 'naocl') PC('cl_dose', o.cl);
    if (+o.meoh > 0 && alt.c.carbon !== 'auto') it('Lựa chọn công nghệ (tab 3)', 'Bổ sung carbon ngoài', '', alt.c.carbon, 'auto', () => { alt.c.carbon = 'auto'; }, { fmt: v => v === 'auto' ? 'Tự động' : v, note: 'Đang châm methanol ' + XCH.fmt(o.meoh) + ' mg/L' });
    if (+o.tert && alt.c.chemPos === 'none') it('Lựa chọn công nghệ (tab 3)', 'Hóa lý bậc 3 sau sinh học', '', alt.c.chemPos, 'post', () => { alt.c.chemPos = 'post'; }, { fmt: v => DATA.optName('chemPos', v) });
    let info = XCH.resTable({ from: 'thietke', res: { eff: P.eff, SRT: d.SRT, MLSS: d.MLSS, PX: d.PXTSS, OTR: d.AORd }, lim: P.lim && P.lim.L }, 'Dự đoán nước ra – ' + (which === 'rec' ? 'điều kiện khuyến cáo' : 'vận hành hiện tại') + ' (tham khảo)');
    XCH.review({
      title: '↻ Chuyển ' + (which === 'rec' ? 'điều kiện vận hành khuyến cáo' : 'số liệu vận hành hiện tại') + ' sang phần tính toán thiết kế',
      items, applyLabel: 'Áp dụng & tính lại thiết kế',
      intro: `<div class="msg">Các giá trị được ghi vào <b>đầu bài, thông số thiết kế (tab 4)</b> và phương án đang xem "${XCH.esc(alt.name)}", rồi toàn bộ thiết kế tính lại. Thông số thiết kế dùng chung cho mọi phương án. Lưu dự án trước nếu muốn giữ bản cũ.</div>`,
      info,
      onApply: ch => {
        if (!ch.length) return;
        S.xchLog = (S.xchLog || []).concat([{ time: new Date().toISOString(), from: 'ops-' + which, n: ch.length, items: ch.map(x => x.l + ': ' + x.cur + ' → ' + x.nv) }]).slice(-20);
        APP.refresh(); APP.setTab('results');
        APP.toast('Đã chuyển ' + ch.length + ' thông số vận hành sang thiết kế – đã tính lại.');
      }
    });
  }

  /* ---------------- nhận vào tab "Kiểm tra vận hành" (vd. kết quả mô phỏng SimXLNT) ---------------- */
  function receiveOps(r) {
    const S = APP.S, o = OPS.ensure(S), items = [], d = r.des || {}, a = r.air || {};
    const it = (grp, l, u, cur, nv, set, x) => { if (num(nv)) items.push(Object.assign({ grp, l, u, cur, nv: +(+nv).toPrecision(5), set }, x || {})); };
    const F = (grp, l, u, key, nv, x) => it(grp, l, u, o[key], nv, v => { o[key] = v; }, x);
    if (r.tech && PRE[r.tech] && r.tech !== o.bio) items.push({ grp: 'Công nghệ', l: 'Công nghệ sinh học', u: '', cur: o.bio, nv: r.tech, set: v => { o.bio = v; }, fmt: v => DATA.BIO_SHORT[v] || v });
    const g1 = 'Lưu lượng & nhiệt độ';
    if (r.flow) { F(g1, 'Lưu lượng Q', 'm³/ngđ', 'Q', r.flow.Q); F(g1, 'Hệ số đỉnh vào sinh học', '-', 'kmax', r.flow.kmax, { on: false }); }
    if (r.temp) { F(g1, 'Nhiệt độ thấp nhất', '°C', 'T', num(r.temp.Tmin) ? r.temp.Tmin : r.temp.Tdes); F(g1, 'Nhiệt độ cao nhất', '°C', 'Tmax', r.temp.Tmax); }
    const src = r.inf || r.bioIn;
    if (src) for (const k of ['COD', 'BOD', 'TSS', 'TKN', 'NH4', 'TN', 'TP', 'Alk', 'pH']) { const qp = DATA.QPARAMS.find(x => x[0] === k); it('Nước thải vào', qp ? qp[1] : k, qp ? qp[2] : '', o.q[k], src[k], v => { o.q[k] = v; }, { on: !!r.inf, note: r.inf ? '' : 'Nước vào sinh học của bên gửi' }); }
    const g3 = 'Công trình & vận hành';
    if (OPS.BATCH[o.bio]) { F(g3, 'Tổng thể tích bể TWL', 'm³', 'Vb', d.Vtot); F(g3, 'Mực nước cao TWL', 'm', 'TWL', d.Hmax || d.H); if (num(d.Hmax) && num(d.Hmin)) F(g3, 'Chiều sâu gạn ΔH', 'm', 'dH', d.Hmax - d.Hmin); }
    else { F(g3, 'Thể tích kỵ khí', 'm³', 'Vana', d.Vkk); F(g3, 'Thể tích thiếu khí', 'm³', 'Van', d.Vtk); F(g3, 'Thể tích hiếu khí', 'm³', 'Vaer', d.Vhk); F(g3, 'Thể tích bể màng', 'm³', 'Vmem', d.Vmem); F(g3, 'Diện tích màng', 'm²', 'Am', d.Am); F(g3, 'Tuần hoàn bùn R', '× Q', 'R', d.R); F(g3, 'Tuần hoàn nội IR', '× Q', 'IR', d.IR); }
    F(g3, 'MLSS', 'mg/L', 'MLSS', d.MLSS != null ? d.MLSS : r.res && r.res.MLSS); F(g3, 'SVI', 'mL/g', 'SVI', d.SVI); F(g3, 'DO đặt', 'mg/L', 'DO', d.DO);
    F(g3, 'SRT vận hành (0 = tự tính)', 'ngày', 'SRT', r.res && r.res.SRT, { on: false, note: 'SRT của bên gửi – để 0 nếu muốn tự tính từ MLSS' });
    if (o.aer === 'diff') { F('Cấp khí', 'Lưu lượng khí cấp', 'Nm³/h', 'air', num(a.Qair) ? a.Qair : r.res && num(r.res.air) ? r.res.air / 24 : undefined); F('Cấp khí', 'SOTE', '-', 'SOTE', a.SOTE); F('Cấp khí', 'Hệ số α', '-', 'alpha', a.alpha); F('Cấp khí', 'Độ ngập đĩa', 'm', 'Df', a.subm); }
    const ch = r.chem || {}, Qd = +o.Q || 1;
    if (num(ch.NaOH)) F('Hóa chất', 'NaOH 100 %', 'mg/L', 'naoh', ch.NaOH * 1000 / Qd);
    if (num(ch.Cext)) F('Hóa chất', 'Methanol', 'mg/L', 'meoh', ch.Cext / 1.5 * 1000 / Qd);
    if (num(ch.Al)) F('Hóa chất', 'PAC châm vào bể sinh học', 'mg/L', 'pacSim', ch.Al / (S.p.PAC_al * 54 / 102) * 1000 / Qd);
    if (num(ch.PACpost)) F('Hóa chất', 'PAC cụm hóa lý bậc 3', 'mg/L', 'pacTert', ch.PACpost, { on: !!+o.tert });
    if (num(ch.polyPost)) F('Hóa chất', 'Polymer trợ lắng', 'mg/L', 'poly', ch.polyPost, { on: !!+o.tert });
    if (num(ch.Cl2) && o.disinf === 'naocl') F('Hóa chất', 'Liều clo hoạt tính', 'mg/L', 'cl', ch.Cl2);
    if (num(ch.UVd) && o.disinf === 'uv') F('Hóa chất', 'Liều UV', 'mJ/cm²', 'uv', ch.UVd);
    // nước ra của bên gửi → cột "Đo thực tế" (đối chiếu / hiệu chỉnh mô hình)
    const E = (r.res && r.res.eff) || {};
    for (const k of ['COD', 'BOD', 'TSS', 'NH4', 'NO3', 'TN', 'TP']) if (num(E[k])) { const qp = DATA.QPARAMS.find(x => x[0] === k); it('Nước ra của bên gửi → cột "Đo thực tế" (đối chiếu, hiệu chỉnh)', qp ? qp[1] : k, qp ? qp[2] : '', o.meas[k], E[k], v => { o.meas[k] = v; }, { on: false, note: 'Chọn nếu muốn hiệu chỉnh mô hình theo kết quả này' }); }
    XCH.review({
      title: '⇄ Nhận hồ sơ từ ' + XCH.APPS[r.from].long + ' vào tab Kiểm tra vận hành', items,
      intro: XCH.header(r) + '<div class="msg">Các giá trị được ghi vào <b>số liệu kiểm tra vận hành</b> (không thay đổi các phương án thiết kế). Sau khi áp dụng, dùng nút "↻ Chuyển sang tính toán thiết kế" nếu muốn tính lại thiết kế với số liệu này.</div>',
      info: XCH.resTable(r, 'Kết quả của ' + XCH.APPS[r.from].name + ' (tham khảo)'),
      onApply: chs => { if (!chs.length) return; APP.refresh(); APP.setTab('ops'); APP.toast('Đã nhận ' + chs.length + ' thông số vào tab Kiểm tra vận hành.'); }
    });
  }

  /* ---------------- nhận ---------------- */
  function receive(r) {
    if (APP.tab === 'ops') return receiveOps(r);
    const S = APP.S, alt = S.alts[S.cur], p = S.p, items = [];
    const recTech = r.tech && PRE[r.tech] ? r.tech : null;
    const tech = recTech || alt.c.bio, pre = PRE[tech];
    const it = (grp, l, u, cur, nv, set, o) => items.push(Object.assign({ grp, l, u, cur, nv, set }, o || {}));
    const P = (grp, key, nv, o) => { if (has(key) && num(nv)) it(grp, DATA.P[key][1], DATA.P[key][2], p[key], +(+nv).toPrecision(6), v => { p[key] = v; (S.pMan = S.pMan || {})[key] = 1; }, o); };
    // công nghệ
    if (recTech && recTech !== alt.c.bio) it('Phương án', 'Công nghệ sinh học của phương án "' + alt.name + '"', '', DATA.BIO_SHORT[alt.c.bio] || alt.c.bio, DATA.BIO_SHORT[recTech] || recTech,
      () => { alt.c.bio = recTech; }, { on: false, fmt: v => v, note: 'Hoặc giữ nguyên phương án và chỉ nhận thông số' });
    // đầu bài
    const g1 = 'Đầu bài – lưu lượng & nhiệt độ', I = S.input;
    if (r.flow) {
      if (num(r.flow.Q)) it(g1, 'Lưu lượng trung bình Q', 'm³/ngđ', I.Q, +r.flow.Q, v => { I.Q = v; });
      if (num(r.flow.kmax)) it(g1, 'Hệ số k_max', '-', I.kmax, +(+r.flow.kmax).toFixed(3), v => { I.kmax = v; });
      if (num(r.flow.kmin)) it(g1, 'Hệ số k_min', '-', I.kmin, +(+r.flow.kmin).toFixed(3), v => { I.kmin = v; });
    }
    if (r.temp) {
      const tmin = num(r.temp.Tmin) ? r.temp.Tmin : r.temp.Tdes;
      if (num(tmin)) it(g1, 'Nhiệt độ thấp nhất', '°C', I.Tmin, +tmin, v => { I.Tmin = v; }, { on: r.from !== 'sim', note: r.from === 'sim' ? 'Nhiệt độ mô phỏng' : '' });
      if (num(r.temp.Tmax)) it(g1, 'Nhiệt độ cao nhất', '°C', I.Tmax, +r.temp.Tmax, v => { I.Tmax = v; });
    }
    // chất lượng nước vào
    const src = r.inf || r.bioIn, isBio = !r.inf && !!r.bioIn;
    if (src) {
      const g2 = isBio ? 'Chất lượng nước – nước VÀO SINH HỌC của bên gửi (không phải nước thô)' : 'Đầu bài – chất lượng nước thải đầu vào';
      for (const k of ['COD', 'BOD', 'TSS', 'TKN', 'NH4', 'NO3', 'TN', 'TP', 'Alk', 'pH']) {
        if (!num(src[k]) || I.q[k] === undefined) continue;
        const qp = DATA.QPARAMS.find(x => x[0] === k);
        const est = r.notes && r.notes[k];   // giá trị ước tính của bên gửi → mặc định không chọn
        it(g2, qp ? qp[1] : k, qp ? qp[2] : '', I.q[k], +(+src[k]).toPrecision(5), v => { I.q[k] = v; I.preset = 'custom'; }, { on: !isBio && !est, note: est || (isBio ? 'Chỉ nhận khi muốn thay đầu bài' : '') });
      }
    }
    // thông số thiết kế
    const d = r.des || {}, g3 = 'Thông số thiết kế chung', g4 = 'Thông số công nghệ ' + (DATA.BIO_SHORT[tech] || tech);
    P(g3, 'DO', d.DO); if (tech !== 'AGS') P(g3, 'SVI', d.SVI); P(g3, BATCH[tech] ? 'TSSe_dec' : 'TSSe_cl', d.TSSe);
    // thông số pre_SRT của phần mềm này là SRT HIẾU KHÍ (bioCommon) → quy SRT tổng của bên gửi về hiếu khí
    { const Vt = (+d.Vkk || 0) + (+d.Vtk || 0) + (+d.Vhk || 0), aer = num(d.SRTaer) ? +d.SRTaer : num(d.SRT) && Vt > 0 && num(d.Vhk) ? d.SRT * d.Vhk / Vt : null;
      if (!BATCH[tech] && aer !== null) P(g4, pre + '_SRT', aer, { note: (r.from === 'sim' ? 'SRT hiếu khí mô phỏng' : 'SRT hiếu khí của bên gửi') + (num(d.SRT) ? ' (SRT tổng ' + XCH.fmt(d.SRT) + ' d)' : '') });
      else if (!BATCH[tech]) P(g4, pre + '_SRT', d.SRT, { on: false, note: 'SRT TỔNG của bên gửi – thông số này là SRT hiếu khí, chỉ nhận khi không có vùng thiếu khí' });
      else P(g4, pre + '_SRT', num(d.SRTaer) ? d.SRTaer : d.SRT, { note: num(d.SRTaer) ? 'SRT hiếu khí của bên gửi (SRT tổng ' + XCH.fmt(d.SRT) + ' d)' : 'SRT tổng của bên gửi' }); }
    P(g4, pre + '_MLSS', d.MLSS, { note: r.from === 'sim' ? 'MLSS trung bình bể hiếu khí mô phỏng' : '' });
    if (tech === 'ICEAS') {
      P(g4, 'ic_TWL', d.Hmax || d.H); P(g4, 'ic_nb', d.N);
      if (d.icFeed && d.icFeed !== (alt.c.icFeed || 'cont')) it(g4, 'Chế độ nạp nước ICEAS', '', alt.c.icFeed || 'cont', d.icFeed, v => { alt.c.icFeed = v; }, { fmt: v => DATA.optName('icFeed', v) });
      if (num(d.fPre) && num(d.L)) P(g4, 'ic_pre', d.fPre * d.L, { note: 'tỷ lệ ngăn tiền phản ứng ' + XCH.fmt(d.fPre) + ' × L ' + XCH.fmt(d.L) + ' m' });
      if ([d.tAer, d.tMix, d.tS, d.tD].some(num)) {
        P(g4, 'ic_on', d.tAer); P(g4, 'ic_off', d.tMix); P(g4, 'ic_set', d.tS); P(g4, 'ic_dec', d.tD);
        // chỉ đề xuất chu trình "tự nhập" khi thời gian pha nhận được khác chu trình chuẩn đang dùng
        const PRESET = { NIT: [120, 0, 60, 60], NDN: [96, 72, 60, 60] }, pr = PRESET[alt.c.icCycle];
        const same = pr && [d.tAer, d.tMix, d.tS, d.tD].every((v, i) => !num(v) || Math.abs(v - pr[i]) < 1e-6);
        if (alt.c.icCycle !== 'custom' && !same) it(g4, 'Chu trình ICEAS', '', alt.c.icCycle, 'custom', () => { alt.c.icCycle = 'custom'; }, { fmt: v => v, note: 'Dùng thời gian pha nhận được' });
      }
    } else if (tech === 'CTECH') {
      P(g4, 'ct_TWLmax', d.Hmax || d.H); P(g4, 'ct_N', d.N);
      const c = d.ct || {}; P(g4, 'ct_TFA', c.TFA); P(g4, 'ct_TS', c.TS); P(g4, 'ct_TD', c.TD); P(g4, 'ct_R', c.R != null ? c.R : d.rRAS);
    } else if (tech === 'AGS') {
      // NEREDA: bùn hạt – số bể, chiều sâu, MLSS, SVI, chu kỳ (thể tích tự định cỡ theo các tiêu chí NEREDA)
      P(g4, 'ags_H', d.Hmax || d.H); P(g4, 'ags_Nr', d.N); P(g4, 'ags_SVI', d.SVI);
      const xn = (r.extra && r.extra.nereda) || {}, s = d.sbr || {}, tc = [s.tF, s.tR, s.tS, s.tD, s.tI].every(num) ? s.tF + s.tR + s.tS + s.tD + s.tI : undefined;
      P(g4, 'ags_X', num(xn.X) ? xn.X : undefined, { note: 'MLSS thiết kế bể NEREDA' });
      P(g4, 'ags_tc', num(xn.tc) ? xn.tc : tc, { note: num(xn.tc) ? '' : 'Tổng các pha của bên gửi' }); P(g4, 'ags_tcRwf', xn.tcRwf); P(g4, 'ags_ts', num(xn.ts) ? xn.ts : s.tS);
      P(g4, 'ags_WASc', xn.WASc); if (xn.buffer !== undefined) P(g4, 'ags_buffer', xn.buffer ? 1 : 0);
    } else if (tech === 'SBR') {
      P(g4, 'sbr_H', d.H); P(g4, 'sbr_n', d.N);
      const s = d.sbr || {}; P(g4, 'sbr_fill', s.tF); P(g4, 'sbr_react', s.tR); P(g4, 'sbr_settle', s.tS); P(g4, 'sbr_decant', s.tD); P(g4, 'sbr_idle', s.tI); P(g4, 'sbr_VF', s.VF);
    } else {
      P(g4, pre + '_H', d.H); P(g4, pre + '_n', d.N);
      const Q = num(r.flow && r.flow.Q) ? +r.flow.Q : +I.Q, h = V => num(V) && V > 0 && Q > 0 ? V / Q * 24 : undefined;
      // thể tích của bên gửi → thời gian lưu (đầu vào của phần mềm này)
      P(g4, pre + '_tanox', h(d.Vtk), { note: num(d.Vtk) ? 'V_thiếu khí ' + XCH.fmt(d.Vtk) + ' m³ / Q × 24' : '' });
      P(g4, 'aao_tana', tech === 'AAO' ? h(d.Vkk) : undefined, { note: num(d.Vkk) ? 'V_kỵ khí ' + XCH.fmt(d.Vkk) + ' m³ / Q × 24' : '' });
      if (tech === 'OD' && num(d.Vtk) && num(d.Vhk) && d.Vtk + d.Vhk > 0) P(g4, 'od_ftk', d.Vtk / (d.Vtk + d.Vhk));
      if (tech === 'MBR') P(g4, 'mbr_SAD', d.SADm);
      if (tech === 'KMBR') P(g4, 'kb_r', d.R);
      if (num(d.IR)) P(g4, pre + '_IRmax', Math.max(d.IR, 0.5), { on: false, note: 'IR của bên gửi ' + XCH.fmt(d.IR) + ' – thông số này là IR tối đa' });
    }
    // động học
    const k = r.kin || {}, g5 = 'Động học ở 20 °C (mô hình khác nhau – chỉ nhận khi đã hiệu chỉnh)';
    P(g5, 'muH', k.muH, { on: false }); P(g5, 'bH', k.bH, { on: false }); P(g5, 'YH', k.YH, { on: false });
    P(g5, 'muAOB', k.muA, { on: false }); P(g5, 'bAOB', k.bA, { on: false }); P(g5, 'KNH4', k.KNH, { on: false });
    let info = XCH.resTable(r, 'Kết quả của ' + XCH.APPS[r.from].name + ' (tham khảo, đối chiếu với tab Kết quả & kiểm tra)');
    if (r.notes && r.notes.bioIn && isBio) info += `<p class="note">${XCH.esc(r.notes.bioIn)}</p>`;
    XCH.review({
      title: '⇄ Nhận hồ sơ từ ' + XCH.APPS[r.from].long, items,
      intro: XCH.header(r) + `<div class="msg">Các thông số được ghi vào <b>dự án hiện tại</b>, phương án đang xem "${XCH.esc(alt.name)}". Lưu dự án (nút "Lưu dự án") trước nếu muốn giữ bản cũ.</div>`,
      info,
      onApply: ch => {
        if (!ch.length) return;
        S.xchLog = (S.xchLog || []).concat([{ time: r.time, from: r.from, n: ch.length, items: ch.map(x => x.l + ': ' + x.cur + ' → ' + x.nv) }]).slice(-20);
        if (r.res) S.simRef = { from: r.from, time: r.time, res: r.res };
        APP.refresh();
        APP.toast('Đã áp dụng ' + ch.length + ' thông số từ ' + XCH.APPS[r.from].name + ' – thiết kế đã tính lại.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const tools = document.querySelector('header.top .tools');
    if (tools) XCH.button(tools, tools.firstElementChild);   // đầu thanh công cụ – thanh này dài, nút cuối dễ bị khuất
    XCH.init('thietke', { store: { keys: /^xlnt_design_v1$/ }, build, receive, toast: t => APP.toast(t) });
  });
  return { build, receive, receiveOps, opsMenu, opsToDesign, buildOps };
})();
