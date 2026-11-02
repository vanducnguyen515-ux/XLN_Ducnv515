'use strict';
/* ==========================================================================
   NEREDA® (AGS) ⇄ hồ sơ trao đổi (../../js/xch.js)
   Gửi: nước thải, lưu lượng, giới hạn xả + thiết kế bể AGS (số bể, thể tích, chu kỳ nạp/sục/lắng/chờ,
        trao đổi thể tích, MLSS, SRT, SVI, bể điều hòa, hóa chất, bùn) + kết quả tính (nước ra, bùn dư, O₂, khí, điện).
        SimXLNT dựng sơ đồ: [bể điều hòa] → AGS (SBR nạp kỵ khí, ASM2dG) → nước ra; bùn dư → tách nước, nước tách quay về.
   Nhận: nước thải thô, lưu lượng, nhiệt độ, giới hạn xả, DO/SVI/MLSS/số bể/chiều sâu (bảng chọn thông số).
   ========================================================================== */
(() => {
  const num = XCH.num;
  const pos = v => num(v) && +v > 0 ? +v : undefined;

  function build() {
    const s = NR.state, r = NR.last;
    if (!r || !r.ok) throw new Error('Phương án NEREDA hiện tại chưa tính được – xem phần cảnh báo.');
    const R = r.reactor, C = r.cycle, K = r.kin, A = r.air, F = r.eff.fin, ph = r.phos;
    // chu kỳ cho mô hình SBR: nạp (kỵ khí) – sục khí – lắng – xả – chờ; pha chờ kỵ khí sau nạp (tW) và chờ/xả bùn gộp vào xả + chờ
    const rest = C.tW + C.tI, tD = Math.max(0.1, Math.min(0.25, rest)), tR = rest >= tD ? C.tA : Math.max(C.tA - (tD - rest), 0.25);
    const lim = {};
    for (const [k, v] of Object.entries(r.eff.limits)) if (pos(v)) lim[k] = +v;
    const metalKg = ph.metal * r.flow.Q / 1000;
    return XCH.make('nereda', {
      project: { name: 'NEREDA® ' + XCH.fmt(s.Q) + ' m³/ngày' },
      tech: 'AGS',
      flow: { Q: s.Q, kmax: s.PFh, Qpk: r.flow.QpkH },
      temp: { Tmin: s.Tmin, Tmax: s.Tmax, Tdes: s.Tmin },
      inf: { COD: s.COD, BOD: s.BOD, TSS: s.TSS, TKN: s.TKN, NH4: s.NH4, TP: s.TP, Alk: s.Alk, pH: s.pH, VSSr: s.vssTss },
      frac: { bCOD: s.bcodBod * s.BOD, rbCOD: s.rbFrac * s.COD, nbsCOD: s.nbsCOD },
      lim,
      des: {
        DO: s.DO, SVI: s.SVI, SRT: K.SRT, SRTaer: K.SRTa, MLSS: R.Xact * 1000, TSSe: s.TSSe, H: s.H, N: C.rowsD ? C.rowsD.length : s.Nr,
        VT: R.VR, Vtot: R.Vtot, VF: R.VERd, PXTSS: r.sludge.PxTSS, Vbuf: R.Vbuf, tAer: C.tA * 60,
        sbr: { tF: C.tF, tR, tS: C.tS, tD, tI: Math.max(rest - tD, 0), VF: R.VERd }
      },
      air: { alpha: s.alpha, F: s.Ff, SOTE: A.SOTE, subm: A.hd, eBlow: s.eBlower, dPloss: s.dPloss },
      chem: Object.assign({ NaOH: r.alk.NaOHkg || undefined, Cext: r.carbon.carbonCOD > 0 ? r.carbon.carbonCOD * r.flow.Q / 1000 : undefined },
        metalKg > 0 ? (s.pChem === 'PAC' ? { Al: metalKg } : { Fe: metalKg }) : {}),
      sludge: { streams: [{ name: 'Bùn dư bùn hạt NEREDA', kind: 'gran', M: r.sludge.PxTSS, C: s.WASc / 10, fVS: r.sludge.PxVSS / r.sludge.PxTSS }] },
      kin: { muA: s.muN, bA: s.bN, KNH: s.KN, muH: s.muH, bH: s.bH, YH: s.YH },
      res: {
        eff: { COD: F.COD, BOD: F.BOD, TSS: F.TSS, NH4: F.NH4, NO3: F.NO3, TN: F.TN, TP: F.TP },
        SRT: K.SRT, SRTaer: K.SRTa, MLSS: R.Xact * 1000, PX: r.sludge.PxTSS, OTR: A.R0, air: A.airAvgR * C.tA * (24 / C.tc) * s.Nr,
        kWh: A.Eday, Vbio: R.Vtot,
        note: `NEREDA: ${s.Nr} bể × ${XCH.fmt(R.VR)} m³, H = ${s.H} m, chu kỳ ${s.tc} h (nạp ${XCH.fmt(C.tF)} h, sục ${XCH.fmt(C.tA)} h, lắng ${s.ts} h), trao đổi thể tích ${XCH.fmt(R.VERd * 100)} %, thể tích quyết định bởi: ${R.gov}.`
      },
      extra: { nereda: { X: s.X, SVI: s.SVI, tc: s.tc, tcRwf: s.tcRwf, ts: s.ts, WASc: s.WASc, cakeDS: s.cakeDS, polyDose: s.polyDose, buffer: !!s.buffer, Vbuf: R.Vbuf, seed: s.seed } }
    });
  }

  function receive(rec) {
    const s = NR.state, I = rec.inf || rec.bioIn || {}, items = [], g1 = 'Lưu lượng & nhiệt độ', g2 = 'Nước thải đầu vào', g3 = 'Yêu cầu đầu ra', g4 = 'Bể & vận hành';
    const set = {};
    const it = (grp, k, l, u, nv, note) => { if (num(nv)) items.push({ grp, l, u, cur: s[k], nv: +nv, note, set: v => { set[k] = v; } }); };
    if (rec.flow) { it(g1, 'Q', 'Lưu lượng trung bình', 'm³/ngày', rec.flow.Q); it(g1, 'PFh', 'Hệ số giờ cao điểm', '–', rec.flow.kmax); }
    if (rec.temp) { it(g1, 'Tmin', 'Nhiệt độ thấp nhất', '°C', rec.temp.Tmin != null ? rec.temp.Tmin : rec.temp.Tdes); it(g1, 'Tmax', 'Nhiệt độ cao nhất', '°C', rec.temp.Tmax); }
    for (const [k, l, u] of [['COD', 'COD', 'mg/L'], ['BOD', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['TKN', 'TKN', 'mg N/L'], ['NH4', 'NH₄-N', 'mg N/L'], ['TP', 'TP', 'mg P/L'], ['Alk', 'Độ kiềm', 'mg CaCO₃/L'], ['pH', 'pH', '–']])
      it(g2, k, l, u, I[k], rec.inf ? 'nước thải thô' : 'nước vào sinh học');
    if (num(I.VSSr)) it(g2, 'vssTss', 'VSS / TSS', '–', I.VSSr);
    const fr = rec.frac || {};
    if (num(fr.rbCOD) && num(I.COD) && +I.COD > 0) it(g2, 'rbFrac', 'rbCOD / COD', '–', +fr.rbCOD / +I.COD);
    if (num(fr.nbsCOD)) it(g2, 'nbsCOD', 'COD hòa tan khó phân hủy', 'mg/L', fr.nbsCOD);
    const L = rec.lim || {};
    for (const [k, l] of [['BOD', 'BOD₅'], ['COD', 'COD'], ['TSS', 'TSS'], ['NH4', 'NH₄-N'], ['NO3', 'NO₃-N'], ['TN', 'TN'], ['TP', 'TP']]) it(g3, 't' + k, l + ' giới hạn', 'mg/L', L[k], rec.limName);
    const d = rec.des || {};
    it(g4, 'DO', 'DO vận hành', 'mg/L', d.DO);
    if (rec.tech === 'AGS') {
      it(g4, 'SVI', 'SVI₃₀ bùn hạt', 'mL/g', d.SVI); it(g4, 'H', 'Chiều sâu nước', 'm', d.H); it(g4, 'Nr', 'Số bể', 'bể', d.N);
      const xn = (rec.extra && rec.extra.nereda) || {};
      if (num(xn.X)) it(g4, 'X', 'MLSS thiết kế', 'kg/m³', xn.X); else if (num(d.MLSS)) it(g4, 'X', 'MLSS thiết kế', 'kg/m³', +d.MLSS / 1000);
      it(g4, 'tc', 'Chu kỳ mùa khô', 'h', xn.tc); it(g4, 'tcRwf', 'Chu kỳ mùa mưa', 'h', xn.tcRwf); it(g4, 'ts', 'Thời gian lắng', 'h', xn.ts); it(g4, 'WASc', 'Nồng độ bùn dư rút', 'kg/m³', xn.WASc);
      if (xn.buffer !== undefined) items.push({ grp: g4, l: 'Bể điều hòa đầu vào', u: '', cur: s.buffer ? 1 : 0, nv: xn.buffer ? 1 : 0, set: v => { set.buffer = !!v; } });
    } else if (num(d.H)) it(g4, 'H', 'Chiều sâu nước', 'm', d.H, 'tham khảo – bể bùn hạt thường sâu 6–8 m');
    if (rec.air) { it(g4, 'alpha', 'Hệ số α', '–', rec.air.alpha); it(g4, 'eBlower', 'Hiệu suất máy thổi khí', '–', rec.air.eBlow); it(g4, 'dPloss', 'Tổn thất đĩa + ống', 'kPa', rec.air.dPloss); }
    XCH.review({
      title: '⇄ Nhận hồ sơ từ ' + XCH.APPS[rec.from].long, items,
      intro: XCH.header(rec) + '<div class="msg">Thông số chọn được ghi vào phương án NEREDA hiện tại và tính lại ngay. Các thông số riêng của bùn hạt (SVI, MLSS 8–15 g/L, trao đổi thể tích, chu kỳ) giữ giá trị hiện tại nếu hồ sơ không phải từ công nghệ AGS.</div>',
      info: XCH.resTable(rec),
      onApply: ch => { if (ch.length) { NR.apply(set); NR.toast('Đã áp dụng ' + ch.length + ' thông số từ ' + XCH.APPS[rec.from].name); } }
    });
  }

  const acts = document.querySelector('.acts');
  if (acts) XCH.button(acts, acts.firstChild);
  XCH.init('nereda', { store: { keys: /^simxlnt-nereda-v1$/, name: () => NR.state.name || 'NEREDA ' + Math.round(+NR.state.Q || 0) + ' m3d' }, build, receive, toast: t => NR.toast(t) });
  if (acts && typeof STATE !== 'undefined') { const rs = document.getElementById('btnReset'); STATE.projectMenu(acts, rs, [rs]); }   // 📁 Dự án ▾: khôi phục · mở · lưu
})();
