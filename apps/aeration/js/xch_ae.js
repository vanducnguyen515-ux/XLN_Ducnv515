'use strict';
/* ==========================================================================
   Aeration Design (hệ thống cấp khí) ⇄ hồ sơ trao đổi (../../js/xch.js)
   Nhận: lưu lượng, BOD/TKN nước vào cụm sinh học, BOD/NH₄ ra (kết quả hoặc giới hạn), nhiệt độ, hệ số đỉnh,
         nhu cầu O₂ (AOR) bên gửi đã tính, số bể – kích thước – mực nước, chu kỳ (ICEAS/SBR → số bể sục khí đồng thời,
         giờ sục khí), α, F, DO.
   Gửi: đầu bài, kích thước bể, thông số sục khí (α, F, SOTE tại độ ngập, η máy thổi, khí cấp), kết quả
        (AOR, khí, điện) và extra.aer (AOR/khí min–TB–max, máy thổi, điện năm) – cho SimXLNT, Thiết kế XLNT,
        ICEAS Studio, NEREDA, KhíSạch (khí cấp nhỏ nhất cho khuếch tán khí mùi vào bể sục khí, điện cho kiểm kê KNK).
   ========================================================================== */
(() => {
  const num = XCH.num;
  const PROC = { ICEAS: 'sbr', SBR: 'sbr', CTECH: 'sbr', AGS: 'sbr', OD: 'ea', MBBR: 'mbbr', CAS: 'cas', AO: 'cas', AAO: 'cas', MBR: 'cas', KMBR: 'cas', ORG: 'cas', BIOP: 'cas' };
  const apply = fn => { const { S } = APP.state(); fn(S); APP.form(); APP.run(); };

  function receive(rec) {
    const { S } = APP.state(), items = [], ch = [];
    const it = (grp, l, u, cur, nv, fn, x) => { if (nv !== undefined && nv !== null && (typeof nv !== 'number' || isFinite(nv))) items.push(Object.assign({ grp, l, u, cur, nv, set: v => ch.push(s => fn(s, v)) }, x || {})); };
    const r1 = v => +(+v).toFixed(1), r2 = v => +(+v).toFixed(2), r3 = v => +(+v).toFixed(3);
    const g0 = 'Dự án', g1 = 'Tải lượng (cụm sinh học)', g2 = 'Bể sục khí', g3 = 'Hệ số sục khí';
    if (rec.project && rec.project.name) it(g0, 'Tên dự án', '', S.proj.name, rec.project.name + (rec.project.alt ? ' – ' + rec.project.alt : ''), (s, v) => { s.proj.name = v; }, { fmt: v => v });
    const I = rec.bioIn || rec.inf || {}, E = (rec.res && rec.res.eff) || {}, L = rec.lim || {};
    if (rec.flow && num(rec.flow.Q)) it(g1, 'Lưu lượng Q', 'm³/ngày', S.load.Q, r1(rec.flow.Q), (s, v) => { s.load.Q = v; s.load.mode = 'loads'; });
    if (num(I.BOD)) it(g1, 'BOD₅ vào' + (rec.bioIn ? ' (vào cụm sinh học)' : ''), 'mg/L', S.load.BODin, r1(I.BOD), (s, v) => { s.load.BODin = v; s.load.mode = 'loads'; });
    if (num(I.TKN)) it(g1, 'TKN vào', 'mg/L', S.load.TKNin, r1(I.TKN), (s, v) => { s.load.TKNin = v; s.load.mode = 'loads'; });
    const bo = num(E.BOD) ? E.BOD : L.BOD, nh = num(E.NH4) ? E.NH4 : L.NH4;
    if (num(bo)) it(g1, 'BOD₅ ra', 'mg/L', S.load.BODout, r1(bo), (s, v) => { s.load.BODout = v; }, { note: num(E.BOD) ? 'kết quả bên gửi' : 'giới hạn xả' });
    if (num(nh)) it(g1, 'NH₄-N ra', 'mg/L', S.load.NH4out, r2(nh), (s, v) => { s.load.NH4out = v; }, { note: num(E.NH4) ? 'kết quả bên gửi' : 'giới hạn xả' });
    // NO₃ được khử ≈ TKN vào − N đồng hóa − NH₄ ra − NOx ra (khi có kết quả TN/NOx ra của bên gửi)
    const no = num(E.NO3) ? +E.NO3 : num(E.TN) && num(E.TKN) ? E.TN - E.TKN : undefined;
    if (num(I.TKN) && num(no) && num(nh)) {
      const dn = Math.max(+I.TKN - S.load.fNsyn * Math.max((+I.BOD || S.load.BODin) - (+bo || 0), 0) - +nh - no, 0);
      it(g1, 'NO₃-N được khử (tín chỉ O₂ khử nitrat)', 'mg/L', S.load.NO3dn, r1(dn), (s, v) => { s.load.NO3dn = v; s.load.dnCredit = v > 0; }, { note: 'ước tính từ TKN vào và N ra của bên gửi' });
    }
    if (rec.flow && num(rec.flow.kmax)) it(g1, 'Hệ số tải cực đại', '', S.load.fPk, r2(rec.flow.kmax), (s, v) => { s.load.fPk = v; }, { note: 'lấy bằng hệ số lưu lượng giờ lớn nhất' });
    if (rec.res && num(rec.res.OTR)) {
      const a = +rec.res.OTR;
      it(g1, 'Dùng AOR của bên gửi thay cho tính từ tải lượng (TB / max / min)', 'kg O₂/ngày', `${XCH.fmt(S.load.AOR_avg)} / ${XCH.fmt(S.load.AOR_pk)} / ${XCH.fmt(S.load.AOR_min)}`,
        `${XCH.fmt(a)} / ${XCH.fmt(a * S.load.fPk)} / ${XCH.fmt(a * S.load.fMin)}`, s => { s.load.mode = 'aor'; s.load.AOR_avg = Math.round(a); s.load.AOR_pk = Math.round(a * s.load.fPk); s.load.AOR_min = Math.round(a * s.load.fMin); },
        { fmt: v => v, on: false, note: 'mặc định giữ cách tính từ tải lượng' });
    }
    // khí mùi đưa vào đường hút máy thổi (KhíSạch, MC5 Bảng 16-6): H₂S bị oxy hóa thành sunfat trong bể, 2 mol O₂/mol H₂S = 1,88 kg O₂/kg H₂S
    const xk = rec.extra && rec.extra.khi;
    if (xk && num(xk.H2Skg) && xk.H2Skg > 0) it(g1, 'Nhu cầu khác: oxy hóa H₂S của khí mùi khuếch tán vào bể', 'kg O₂/ngày', S.load.other, r1(xk.H2Skg * 1.88), (s, v) => { s.load.other = v; },
      { note: `${XCH.fmt(xk.H2Skg)} kg H₂S/ngày × 1,88 kg O₂/kg H₂S` });
    if (rec.temp) {
      if (num(rec.temp.Tmax)) it(g1, 'Nhiệt độ nước – mùa nóng', '°C', S.site.Tw_sum, r1(rec.temp.Tmax), (s, v) => { s.site.Tw_sum = v; });
      if (num(rec.temp.Tmin)) it(g1, 'Nhiệt độ nước – mùa lạnh', '°C', S.site.Tw_win, r1(rec.temp.Tmin), (s, v) => { s.site.Tw_win = v; });
    }
    const d = rec.des || {};
    if (rec.tech && PROC[rec.tech]) it(g2, 'Loại công trình', '', S.process, PROC[rec.tech], (s, v) => { s.process = v; s.load.kBOD = DB.process[v].kBOD; }, { fmt: v => (DB.process[v] || {}).name || v, note: XCH.TECH[rec.tech] || rec.tech });
    if (num(d.N)) it(g2, 'Tổng số bể', 'bể', S.tank.nBasin, Math.round(d.N), (s, v) => { s.tank.nBasin = v; if (s.tank.nAerSim > v) s.tank.nAerSim = v; });
    // bể chu kỳ: phần thời gian sục khí → số bể sục khí đồng thời và giờ sục khí mỗi bể
    const cyc = [d.tAer, d.tMix, d.tS, d.tD].every(num) ? +d.tAer + +d.tMix + +d.tS + +d.tD : 0;
    if (cyc > 0 && num(d.N)) {
      const f = +d.tAer / cyc;
      it(g2, 'Số bể sục khí đồng thời', 'bể', S.tank.nAerSim, Math.max(1, Math.round(d.N * f)), (s, v) => { s.tank.nAerSim = v; }, { note: `sục khí ${XCH.fmt(d.tAer)} / ${XCH.fmt(cyc)} phút mỗi chu kỳ` });
      it(g2, 'Giờ sục khí mỗi bể', 'h/ngày', S.tank.aerHours, r1(24 * f), (s, v) => { s.tank.aerHours = v; });
    }
    if (num(d.L)) it(g2, 'Chiều dài bể', 'm', S.tank.L, r2(d.L), (s, v) => { s.tank.L = v; });
    if (num(d.W)) it(g2, 'Chiều rộng bể', 'm', S.tank.W, r2(d.W), (s, v) => { s.tank.W = v; });
    const H = num(d.Hmax) ? d.Hmax : d.H;
    if (num(H)) it(g2, 'Mực nước cao TWL', 'm', S.tank.H, r2(H), (s, v) => { s.tank.H = v; if (!num(d.Hmin)) s.tank.Hbwl = v; });
    if (num(d.Hmin)) it(g2, 'Mực nước thấp BWL', 'm', S.tank.Hbwl, r2(d.Hmin), (s, v) => { s.tank.Hbwl = v; });
    const a = rec.air || {};
    if (num(a.alpha)) it(g3, 'α bọt mịn', '', S.water.a_fb, r3(a.alpha), (s, v) => { s.water.a_fb = v; });
    if (num(a.F)) it(g3, 'F bám bẩn', '', S.water.F, r3(a.F), (s, v) => { s.water.F = v; });
    if (num(d.DO)) it(g3, 'DO vận hành TB', 'mg/L', S.water.DO_avg, r2(d.DO), (s, v) => { s.water.DO_avg = v; });
    XCH.review({
      title: '⇄ Nhận hồ sơ từ ' + XCH.APPS[rec.from].long, items,
      intro: XCH.header(rec) + '<div class="msg">Chọn các thông số áp dụng; nhu cầu oxy, bố trí đĩa, đường ống và máy thổi được tính lại ngay.</div>',
      info: XCH.resTable(rec),
      onApply: sel => { if (!sel.length) return; apply(s => ch.forEach(f => f(s))); XCH.toast('Đã nhận ' + sel.length + ' mục từ ' + XCH.APPS[rec.from].name); }
    });
  }

  function build() {
    const { S, R } = APP.state();
    if (!R || !R.sel) throw new Error('Chưa tính được hệ thống cấp khí.');
    const s = R.sel, A = R.A, b = s.blower || {}, fine = s.kind === 'fb', diff = s.kind === 'fb' || s.kind === 'cb';
    const tech = { sbr: 'SBR', ea: 'OD', mbbr: 'MBBR' }[S.process] || undefined;
    const sub = s.sub && num(s.sub.mean) ? s.sub.mean : undefined;
    const sote = diff && s.cond && s.cond.avg && num(s.cond.avg.sote) ? s.cond.avg.sote : undefined;
    const opsEta = s.ops && s.ops.avg && num(s.ops.avg.eta) ? s.ops.avg.eta : undefined;
    return XCH.make('aer', {
      project: { name: S.proj.name, code: S.proj.code, location: S.proj.loc, alt: s.name },
      tech, flow: S.load.mode === 'loads' ? { Q: S.load.Q, kmax: S.load.fPk } : undefined,
      temp: { Tmax: S.site.Tw_sum, Tmin: S.site.Tw_win },
      bioIn: S.load.mode === 'loads' ? { BOD: S.load.BODin, TKN: S.load.TKNin } : undefined,
      des: { N: S.tank.nBasin, L: S.tank.L, W: S.tank.W, H: S.tank.H, Hmax: S.tank.H, Hmin: S.tank.Hbwl, DO: S.water.DO_avg },
      air: { alpha: fine ? S.water.a_fb : s.kind === 'cb' ? S.water.a_cb : S.water.a_me, F: fine ? S.water.F : undefined, SOTE: sote, subm: sub, eBlow: opsEta, Qair: diff && s.Qt ? s.Qt.avg : undefined },
      res: { OTR: A.avg, air: diff && s.Qt ? s.Qt.avg * 24 : undefined, kWh: num(s.kWavg) ? s.kWavg * 24 : undefined,
        note: `${s.name}: AOR TB ${XCH.fmt(A.avg)} kg O₂/ngày (max ${XCH.fmt(A.pk)}); ${diff ? `khí ${XCH.fmt(s.Qt.avg)} Sm³/h TB (${XCH.fmt(s.Qt.min)} – ${XCH.fmt(s.Qt.pk)}); ` : ''}điện TB ${XCH.fmt(s.kWavg)} kW, ${XCH.fmt(s.kWhY / 1000)} MWh/năm` },
      extra: { aer: { tech: s.key, techName: s.name, AORmin: A.min, AORavg: A.avg, AORpk: A.pk,
        Qmin: diff && s.Qt ? s.Qt.min : undefined, Qavg: diff && s.Qt ? s.Qt.avg : undefined, Qpk: diff && s.Qt ? s.Qt.pk : undefined,
        blower: b.model ? b.model.fam + ' ' + b.model.m : b.Bk ? b.Bk.name : undefined, nDuty: b.nDuty, nStby: b.nStby, motor: b.motor,
        nDiff: diff ? s.N : undefined, kWavg: s.kWavg, kWinst: s.kWinst, kWhY: s.kWhY, sote: sote != null ? sote * 100 : undefined } }
    });
  }

  function mount() {
    const bar = document.querySelector('header.top .actions');
    if (bar) XCH.button(bar, bar.firstChild);
    XCH.init('aer', { build, receive, store: { keys: /^aerationdesign\.v1$/ } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount)); else mount();
})();
