'use strict';
/* ==========================================================================
   AquaDesign VN ⇄ hồ sơ trao đổi (../../js/xch.js)
   Gửi: tải lượng (nước thô & nước vào sinh học), dây chuyền, kết quả DWA-A 131 (tuổi bùn, V_D/V_BB,
        thể tích thiếu khí/hiếu khí/kỵ khí, TS, bùn dư, tuần hoàn, bể lắng II, màng, ICEAS/C-Tech/SBR).
   Nhận: bảng "hiện tại → giá trị nhận" – lưu lượng/nồng độ (chế độ nhập tuyệt đối), dây chuyền,
        tuổi bùn cố định, TS, ISV, DO, chiều sâu, số bể, thông số ICEAS/C-Tech/SBR/MBR.
   ========================================================================== */
const AQX = (() => {
  const num = XCH.num;
  const techOf = S => {
    const o = S.opt;
    if (o.line === 'MBR') return S.mbr.vendor === 'kubota' ? 'KMBR' : 'MBR';
    if (o.line !== 'CAS') return o.line;
    if (S.at.type === 'ditch') return 'OD';
    if (o.process !== 'ND') return 'CAS';
    return o.anaerobic ? 'AAO' : 'AO';
  };

  /* ---------------- gửi ---------------- */
  function build() {
    const S = APP.S, R = ENG.compute(S);
    if (!R.load) throw new Error('Chưa tính được tải lượng: ' + R.errors.join('; '));
    const L = R.load, B = R.bio || {}, tech = techOf(S);
    const conc = C => ({ COD: C.COD, BOD: C.BOD, TSS: C.TSS, TKN: C.TKN, NO3: C.NO3, TP: C.P, Alk: S.bio.SKS * 50 });
    const r = {
      project: { name: S.project.name, location: S.project.place }, tech,
      flow: { Q: L.Qd, kmax: L.Qth / (L.Qd / 24), Qpk: L.Qm }, temp: { Tmin: S.bio.T, Tdes: S.bio.T, Tmax: S.aer.Tmax },
      inf: conc(L.Craw), bioIn: conc(L.C)
    };
    r.notes = { NH4: 'AquaDesign không có NH₄ nước vào – ước tính 0,7·TKN' };
    if (S.opt.line === 'CAS' && S.opt.process === 'ND' && !['pre', 'casc'].includes(S.opt.dn))
      r.notes.Vtk = 'DWA khử nitrat ' + (ENG.DN_NAME[S.opt.dn] || S.opt.dn) + ': V_D = (V_D/V_BB)·V là phần thời gian/thể tích không sục khí – dựng thành bể thiếu khí riêng là xấp xỉ';
    r.bioIn.NH4 = 0.7 * L.C.TKN; r.inf.NH4 = 0.7 * L.Craw.TKN;
    r.frac = { bCOD: B.Cdeg, rbCOD: B.Cla, nbsCOD: B.Sinert };
    const des = { DO: S.aer.Cx, SVI: S.sst.ISV, SRT: B.tSS, SRTaer: B.tAer, MLSS: num(B.TS) ? B.TS * 1000 : undefined, PXTSS: B.US, H: S.at.H, N: S.at.n };
    const res = { eff: { NH4: S.bio.NH4e, NO3: B.NO3eff != null ? B.NO3eff : S.bio.NO3e, TP: B.Pe }, SRT: B.tSS, SRTaer: B.tAer, PX: B.US };
    if (num(res.eff.NH4) && num(res.eff.NO3)) res.eff.TN = res.eff.NH4 + res.eff.NO3 + (+S.bio.NorgE || 0);
    if (num(B.OVdC)) res.OTR = B.OVdC + (B.OVdN || 0) - (B.OVdD || 0);
    if (R.aer && num(R.aer.QL)) { res.air = R.aer.QL * (R.aer.tA || 24); r.air = { alpha: R.aer.alpha, Qair: R.aer.QL }; }
    if (tech === 'ICEAS' && R.iceas) {
      const c = R.iceas, cv = c.ci.v, cy = { on: cv[0], off: cv[1], set: cv[2], dec: cv[3] };   // chu kỳ áp dụng (kể cả khi Bước 6 đã tăng Air-Off)
      Object.assign(des, { N: c.nb, W: c.W, L: c.L, Hmax: c.TWL, Hmin: c.BWL, H: c.TWL, tAer: cy.on, tMix: cy.off, tS: cy.set, tD: cy.dec, fPre: S.ic.pre, TSSe: S.ic.TESS, icFeed: S.ic.feed === 'batch' ? 'batch' : 'cont',
        BMOB: c.BMOB, MLSSd: c.MLSSb, dM: c.dM, Vws: c.Vws, SRT: c.SRT, MLSS: c.MLSSt, Vtot: c.W * c.L * c.TWL * c.nb });
      res.SRT = c.SRT; res.MLSS = c.MLSSt; res.Vbio = des.Vtot;
    } else if (tech === 'CTECH' && R.ctech) {
      const c = R.ctech;
      Object.assign(des, { N: c.N, L: c.L, W: c.Bw, Hmax: c.TWL, Hmin: c.BWL, H: c.TWL, MLSS: c.MLSS, SRT: c.tSS, rRAS: S.ct.R, Cws: S.ct.Cs * 1000 > 0 ? S.ct.Cs * 1000 : undefined,
        tF: S.ct.TFA * 60, tFm: 0, tS: S.ct.TS * 60, tD: S.ct.TD * 60, ct: { TFA: S.ct.TFA, TS: S.ct.TS, TD: S.ct.TD, R: S.ct.R }, Vtot: c.V });
      res.SRT = c.tSS; res.MLSS = c.MLSS; res.Vbio = c.V;
    } else if (tech === 'SBR' && R.sbr) {
      const s = R.sbr, sb = S.sbr, tR = Math.max(sb.tZ - sb.tFill - sb.tSed - sb.tDec - sb.tIdle, 0);
      Object.assign(des, { N: sb.n, VT: s.Vreal / sb.n, H: sb.H, VF: s.fA, sbr: { tF: sb.tFill, tR, tS: sb.tSed, tD: sb.tDec, tI: sb.tIdle, VF: s.fA }, Vtot: s.Vreal });
      res.Vbio = s.Vreal;
    } else if (R.tank) {
      const t = R.tank, rr = S.opt.process === 'ND' ? (B.r || 0) : 0;
      Object.assign(des, { Vtk: rr * t.V, Vhk: (1 - rr) * t.V, Vkk: B.VAN || 0, H: t.H, N: t.n, R: S.opt.line === 'MBR' ? S.mbr.recir : S.sst.RV, IR: B.RZ, SRT: t.tSS });
      res.SRT = t.tSS; res.MLSS = des.MLSS; res.Vbio = t.V;
      if (R.mbr) Object.assign(des, { Vmem: R.mbr.VMBmin, Am: R.mbr.Areal, SADm: S.mbr.SADm });
      if (R.sst) Object.assign(des, { Acl: R.sst.Atot, nCl: R.sst.n, Dcl: R.sst.D, Hcl: R.sst.H, XR: num(R.sst.TSBS) ? R.sst.TSBS * 1000 : undefined });
    }
    const chem = {};
    if (num(B.Fe) && B.Fe > 0) chem[S.bio.prec === 'Al' ? 'Al' : 'Fe'] = B.Fe;
    if (num(B.Cdos_kg) && B.ce) chem.Cext = B.Cdos_kg * B.ce.COD;
    r.des = des; r.res = res; r.chem = chem;
    res.note = 'DWA-A 131:2016, T = ' + S.bio.T + ' °C';
    return XCH.make('aqua', r);
  }

  /* ---------------- nhận ---------------- */
  function receive(r) {
    const S = APP.S, items = [];
    const it = (grp, l, u, cur, nv, set, o) => items.push(Object.assign({ grp, l, u, cur, nv, set }, o || {}));
    const n = (grp, l, u, obj, key, nv, o) => { if (num(nv)) it(grp, l, u, obj[key], +(+nv).toPrecision(6), v => { obj[key] = v; }, o); };
    let touchLoad = false;
    // dây chuyền
    const tech = r.tech, g0 = 'Dây chuyền';
    if (tech) {
      const line = { ICEAS: 'ICEAS', CTECH: 'CTECH', SBR: 'SBR', AGS: 'SBR', MBR: 'MBR', KMBR: 'MBR' }[tech] || 'CAS';
      const cur = techOf(S);
      if (cur !== tech) it(g0, 'Dây chuyền / công nghệ', '', XCH.TECH[cur] || cur, XCH.TECH[tech] || tech, () => {
        S.opt.line = line;
        if (line === 'CAS') {
          S.opt.process = tech === 'CAS' ? 'N' : 'ND'; if (tech !== 'CAS') S.opt.dn = 'pre';
          S.opt.anaerobic = tech === 'AAO'; if (tech === 'OD') S.at.type = 'ditch'; else if (S.at.type === 'ditch') S.at.type = 'rect';
        }
        if (line === 'MBR') S.mbr.vendor = tech === 'KMBR' ? 'kubota' : 'generic';
      }, { fmt: v => v, note: ['MBBR', 'ORG', 'BIOP'].includes(tech) ? 'AquaDesign không có công nghệ giá thể – dùng bùn hoạt tính liên tục' : tech === 'AGS' ? 'AquaDesign không có bùn hạt – đối chiếu bằng SBR (DWA-M 210)' : '' });
    }
    // tải lượng
    const g1 = 'Lưu lượng & nồng độ (chế độ nhập tuyệt đối)', A = S.load.abs;
    const src = r.inf || r.bioIn, isBio = !r.inf && !!r.bioIn;
    if (r.flow && num(r.flow.Q)) {
      if (S.load.mode !== 'abs') it(g1, 'Cách nhập tải lượng', '', 'theo dân số tương đương', 'tuyệt đối (Q, nồng độ)', () => { S.load.mode = 'abs'; touchLoad = true; }, { fmt: v => v });
      n(g1, 'Lưu lượng ngày Q_d', 'm³/d', A, 'Qd', r.flow.Q);
      const Qh = num(r.flow.kmax) ? r.flow.Q / 24 * r.flow.kmax : null;
      if (Qh) { n(g1, 'Lưu lượng giờ lớn nhất mùa khô', 'm³/h', A, 'Qh', Qh); n(g1, 'Lưu lượng thiết kế Q_M', 'm³/h', A, 'Qm', num(r.flow.Qpk) ? r.flow.Qpk : Qh); }
    }
    if (src) {
      const C = A.conc, o = { on: !isBio, note: isBio ? 'Nước vào sinh học của bên gửi' : '' };
      n(g1, 'BOD₅', 'mg/l', C, 'BOD', src.BOD, o); n(g1, 'COD', 'mg/l', C, 'COD', src.COD, o); n(g1, 'TSS', 'mg/l', C, 'TSS', src.TSS, o);
      n(g1, 'TKN', 'mg/l', C, 'TKN', src.TKN, o); n(g1, 'P tổng', 'mg/l', C, 'P', src.TP, o); n(g1, 'NO₃-N', 'mg/l', C, 'NO3', src.NO3, o);
      if (num(src.Alk)) n(g1, 'Độ kiềm S_KS', 'mmol/l', S.bio, 'SKS', src.Alk / 50, o);
    }
    // bùn hoạt tính
    const d = r.des || {}, g2 = 'Bùn hoạt tính & bể';
    const T = r.temp && (num(r.temp.Tmin) ? r.temp.Tmin : r.temp.Tdes);
    n(g2, 'Nhiệt độ thiết kế', '°C', S.bio, 'T', T);
    n(g2, 'Chỉ số thể tích bùn ISV', 'ml/g', S.sst, 'ISV', d.SVI);
    n(g2, 'DO vùng hiếu khí C_x', 'mg/l', S.aer, 'Cx', d.DO);
    n(g2, 'Tuổi bùn cố định t_TS (0 = tự tính)', 'd', S.bio, 'tSSfix', d.SRT, { on: r.from === 'sim', note: r.from === 'sim' ? 'SRT mô phỏng' : 'Bỏ chọn để AquaDesign tự tính theo A 131' });
    const L = r.lim || {};
    if (num(L.NO3)) n(g2, 'NO₃-N ra mục tiêu', 'mg/l', S.bio, 'NO3e', Math.min(L.NO3, 0.8 * L.NO3 + 1));
    if (num(L.TP)) n(g2, 'P ra mục tiêu', 'mg/l', S.bio, 'Pe', L.TP);
    const line = S.opt.line, tl = r.tech ? ({ ICEAS: 'ICEAS', CTECH: 'CTECH', SBR: 'SBR', AGS: 'SBR', MBR: 'MBR', KMBR: 'MBR' }[r.tech] || 'CAS') : line;
    if (tl === 'CAS' || tl === 'MBR') {
      n(g2, 'Chiều sâu nước bể', 'm', S.at, 'H', d.H); n(g2, 'Số bể aerotank', 'bể', S.at, 'n', d.N);
      if (num(d.MLSS)) n(g2, 'TS bể (0 = theo bể lắng II)', 'kg/m³', tl === 'MBR' ? S.mbr : S.bio, 'TS', d.MLSS / 1000, { note: 'MLSS ' + XCH.fmt(d.MLSS) + ' mg/L' });
      if (tl === 'CAS') n(g2, 'Tỷ lệ bùn tuần hoàn RV', '-', S.sst, 'RV', d.R);
      else { n(g2, 'Tỷ lệ tuần hoàn bể màng', '-', S.mbr, 'recir', d.R); n(g2, 'Khí rửa màng SADm', 'Nm³/(m²·h)', S.mbr, 'SADm', d.SADm); }
    } else if (tl === 'ICEAS') {
      const g = 'ICEAS'; n(g, 'Số bể', 'bể', S.ic, 'nb', d.N);
      if (d.icFeed && d.icFeed !== (S.ic.feed || 'cont')) it(g, 'Chế độ nạp nước', '', S.ic.feed || 'cont', d.icFeed, v => { S.ic.feed = v; }, { fmt: v => v === 'batch' ? 'gián đoạn (như SBR)' : 'liên tục' }); n(g, 'Mực nước TWL', 'm', S.ic, 'TWL', d.Hmax || d.H); n(g, 'TSS nước gạn', 'mg/l', S.ic, 'TESS', d.TSSe);
      if ([d.tAer, d.tMix, d.tS, d.tD].some(num)) {
        n(g, 'Sục khí (Air-On)', 'phút', S.ic, 'on', d.tAer); n(g, 'Không sục (Air-Off)', 'phút', S.ic, 'off', d.tMix); n(g, 'Lắng', 'phút', S.ic, 'set', d.tS); n(g, 'Gạn', 'phút', S.ic, 'dec', d.tD);
        if (S.ic.cycle !== 'custom') it(g, 'Chu trình', '', S.ic.cycle, 'custom', () => { S.ic.cycle = 'custom'; }, { fmt: v => v });
      }
      if (num(d.fPre)) n(g, 'Tỷ lệ ngăn tiền phản ứng', '-', S.ic, 'pre', d.fPre);
      if (num(d.SRT)) n(g, 'SRT thiết kế (0 = tự chọn theo Bước 2)', 'd', S.ic, 'SRT', d.SRT, { on: false, note: 'SRT của phần mềm gửi; bỏ chọn để AquaDesign tự chọn theo DWA-A 131' });
    } else if (tl === 'CTECH') {
      const g = 'C-Tech', c = d.ct || {}; n(g, 'Số bể', 'bể', S.ct, 'N', d.N); n(g, 'MLSS', 'mg/l', S.ct, 'MLSS', d.MLSS); n(g, 'TWL tối đa', 'm', S.ct, 'TWLmax', d.Hmax || d.H);
      n(g, 'Pha nạp + sục khí', 'h', S.ct, 'TFA', c.TFA); n(g, 'Lắng', 'h', S.ct, 'TS', c.TS); n(g, 'Gạn', 'h', S.ct, 'TD', c.TD); n(g, 'Tỷ lệ tuần hoàn bùn', '-', S.ct, 'R', c.R != null ? c.R : d.rRAS);
    } else if (tl === 'SBR') {
      const g = 'SBR', s = d.sbr || {}; n(g, 'Số bể', 'bể', S.sbr, 'n', d.N); n(g, 'Chiều sâu nước', 'm', S.sbr, 'H', d.H);
      if ([s.tF, s.tR, s.tS, s.tD].every(num)) n(g, 'Thời gian chu kỳ', 'h', S.sbr, 'tZ', s.tF + s.tR + s.tS + s.tD + (+s.tI || 0));
      n(g, 'Nạp', 'h', S.sbr, 'tFill', s.tF); n(g, 'Lắng', 'h', S.sbr, 'tSed', s.tS); n(g, 'Gạn', 'h', S.sbr, 'tDec', s.tD); n(g, 'Chờ', 'h', S.sbr, 'tIdle', s.tI);
    }
    XCH.review({
      title: '⇄ Nhận hồ sơ từ ' + XCH.APPS[r.from].long, items,
      intro: XCH.header(r) + '<div class="msg">Thông số ghi vào dự án hiện tại. Các bước sau "Tải lượng" phải xác nhận lại (trạng thái trắng) khi tải lượng thay đổi. Lưu dự án trước nếu muốn giữ bản cũ.</div>',
      info: XCH.resTable(r) + (isBio && r.notes && r.notes.bioIn ? `<p class="note">${XCH.esc(r.notes.bioIn)}</p>` : ''),
      onApply: ch => {
        if (!ch.length) return;
        const loadKeys = /Lưu lượng|BOD|COD|TSS|TKN|P tổng|NO₃|kiềm|Cách nhập|Dây chuyền/;
        if (touchLoad || ch.some(x => loadKeys.test(x.l))) ENG.invalidateAfter(S, 'load');
        APP.render();
        APP.toast('Đã áp dụng ' + ch.length + ' thông số từ ' + XCH.APPS[r.from].name + '.', 3000);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const hdr = document.querySelector('header');
    if (hdr) XCH.button(hdr, document.getElementById('btnTheme'));
    XCH.init('aqua', { store: { keys: /^adv_project$/ }, build, receive, toast: t => APP.toast(t, 3500) });
  });
  return { build, receive, techOf };
})();
