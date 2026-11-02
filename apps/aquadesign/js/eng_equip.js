/* AquaDesign VN – Engine: kích thước bể aerotank, sục khí (DWA-M 229-1), khuấy, bùn tuần hoàn, bùn dư */
'use strict';

ENG.TANK_NAME = { rect: 'bể chữ nhật riêng', circ: 'bể tròn riêng', ring: 'bể kết hợp (aerotank vành khuyên quanh bể lắng)', ditch: 'mương ôxy hóa / carrousel' };

ENG.tank = function (S, B, RS) {
  const a = S.at, d = new Rep('Bể bùn hoạt tính');
  const R = { type: a.type, n: a.n, H: a.H };
  const Vreq = B.V;
  const v1 = Vreq / a.n;
  d.h('Kết cấu: ' + ENG.TANK_NAME[a.type]);
  d.r('Thể tích cần (tổng)', 'V_BB,min', Vreq, 'm³');
  d.r('Số bể', 'n', a.n, '');
  d.r('Chiều sâu nước', 'H', a.H, 'm');
  if (a.H > 6) d.info('Bể sâu > 6 m: chú ý CO₂ hòa tan làm giảm pH và N₂ hòa tan gây nổi bùn ở bể lắng (báo cáo ATV 2.6).');
  let Aw;
  if (a.type === 'rect') {
    const B0 = a.B > 0 ? a.B : U.ceilTo(U.clamp(Math.sqrt(v1 / a.H / 3), 4, 15), 0.5);
    const L0 = a.L > 0 ? a.L : U.ceilTo(v1 / a.H / B0, 0.5);
    Object.assign(R, { B: B0, L: L0 }); Aw = B0 * L0;
    d.r('Chiều rộng', 'B', B0, 'm'); d.r('Chiều dài', 'L', L0, 'm');
  } else if (a.type === 'circ') {
    const D = a.D > 0 ? a.D : U.ceilTo(Math.sqrt(4 * v1 / Math.PI / a.H), 0.5);
    R.D = D; Aw = Math.PI * D * D / 4;
    d.r('Đường kính', 'D', D, 'm');
  } else if (a.type === 'ring') {
    if (!RS || !RS.D) { d.err('Bể kết hợp cần bể lắng II tròn.', FX('Chọn bể lắng II tròn', { 'sst.shape': 'circ' }), FX('Đổi sang bể chữ nhật riêng', { 'at.type': 'rect' })); R.Di = 10; }
    const Di = (RS && RS.D ? RS.D : 10) + 2 * S.build.tWallST;
    const Do = a.D > 0 ? a.D : U.ceilTo(Math.sqrt(4 * v1 / Math.PI / a.H + Di * Di), 0.5);
    Object.assign(R, { D: Do, Di }); Aw = Math.PI * (Do * Do - Di * Di) / 4;
    d.r('Đường kính trong (bể lắng + thành)', 'D_i', Di, 'm'); d.r('Đường kính ngoài', 'D_a', Do, 'm');
    d.r('Bề rộng vành', 'b', (Do - Di) / 2, 'm');
    if (RS && RS.hEdge && Math.abs(a.H - (RS.hEdge + S.at.dWL)) > 0.3) d.info('Trạm kết hợp: H_BB nên ≈ chiều sâu thành bể lắng + chênh mực nước = ' + U.fmt(RS.hEdge + S.at.dWL) + ' m (Handbook 7.9.5).');
    if (Do - Di < 1.5 - 1e-6) d.warn('Trạm kết hợp: D_BB − D_NB = ' + U.fmt(Do - Di) + ' m < 1,5 m (Handbook 7.9.5) – tăng đường kính ngoài.', FX('Đặt D ngoài = ' + U.fmt(U.ceilTo(Di + 1.5, 0.5)) + ' m', { 'at.D': U.ceilTo(Di + 1.5, 0.5) }), FX('Tự tính đường kính', { 'at.D': 0 }));
    if (RS && RS.n !== a.n) d.warn('Số bể aerotank phải bằng số bể lắng II khi chọn bể kết hợp.', FX('Đặt số aerotank = ' + (RS && RS.n), { 'at.n': RS && RS.n }));
  } else {
    // mương ôxy hóa / Carrousel 2, 4 hoặc 6 làn: trừ diện tích vách ngăn trong (Handbook 7.9.5)
    const t = a.tWall, k = [2, 4, 6].includes(+a.lanes) ? +a.lanes : 2;
    const W = a.W > 0 ? a.W : U.ceilTo(U.clamp(Math.sqrt(v1 / a.H / 2.5) * (k > 2 ? 1.3 : 1), 8, 60), 0.5);
    const A1 = v1 / a.H;
    const wallA = Lx => (k - 1) * t * (Lx - W) + (k > 2 ? (k - 2) / 2 * t * Math.PI * W / 2 : Math.PI * t * t / 4);
    const gross = Lx => W * (Lx - W) + Math.PI * W * W / 4;
    const L0 = a.L > 0 ? a.L : U.ceilTo(U.bisect(Lx => gross(Lx) - wallA(Lx) - A1, W, W + 50 * A1 / W + 10, 1e-3), 0.5);
    Object.assign(R, { W, L: L0, t, lanes: k });
    Aw = gross(L0) - wallA(L0);
    const bL = (W - (k - 1) * t) / k;
    d.r('Số làn', 'n_L', k, '', k > 2 ? 'Carrousel – vách trong ' + (k - 1) : 'mương ôxy hóa 2 làn');
    d.r('Bề rộng tổng', 'W', W, 'm', 'mỗi làn ' + U.fmt(bL) + ' m'); d.r('Chiều dài tổng', 'L', L0, 'm');
    d.r('Diện tích vách ngăn trừ', 'A_W', wallA(L0), 'm²');
    if (bL < 2) d.warn('Bề rộng làn < 2 m – giảm số làn hoặc tăng W.', k > 2 && FX('Giảm số làn còn ' + (k - 2), { 'at.lanes': k - 2 }), FX('Tự tính bề rộng W', { 'at.W': 0, 'at.L': 0 }));
  }
  R.Aw = Aw; R.V1 = Aw * a.H; R.V = R.V1 * a.n;
  d.r('Diện tích mặt nước mỗi bể', 'A', Aw, 'm²');
  d.r('Thể tích thực (tổng)', 'V_BB', R.V, 'm³');
  if (R.V < Vreq * 0.995) d.err('Thể tích thực nhỏ hơn yêu cầu.', FX('Tự tính kích thước bể', { 'at.B': 0, 'at.L': 0, 'at.D': 0, 'at.W': 0 }), FX('Thêm 1 bể', { 'at.n': a.n + 1 }));
  const act = ENG.bioActual(B, R.V + (B.Vextra || 0));
  if (B.Vextra) d.r('Thể tích bể màng tham gia sinh học', 'V_MB', B.Vextra, 'm³');
  R.tSS = act.tSS; R.tAer = act.tAer;
  d.r('Tuổi bùn thực', 't_TS', act.tSS, 'd');
  d.r('Tuổi bùn hiếu khí thực', 't_TS,aer', act.tAer, 'd', '≥ ' + U.fmt(B.tAerDim / 1) + ' d');
  if (S.opt.process !== 'C' && act.tAer < B.tAerDim * 0.999) d.warn('Tuổi bùn hiếu khí thực nhỏ hơn yêu cầu.', FX('Tự tính kích thước bể', { 'at.B': 0, 'at.L': 0, 'at.D': 0, 'at.W': 0 }), FX('Tăng chiều sâu nước +0,5 m', { 'at.H': a.H + 0.5 }));
  if (S.opt.stab && act.tSS < B.tStab * 0.999) d.warn('Tuổi bùn thực nhỏ hơn tuổi bùn ổn định.', FX('Tự tính kích thước bể', { 'at.B': 0, 'at.L': 0, 'at.D': 0, 'at.W': 0 }));
  if (B.VD) { R.VD = B.r * R.V; d.r('Thể tích thiếu khí', 'V_D', R.VD, 'm³'); }
  if (S.opt.anaerobic) {
    const v = B.VAN / Math.max(1, S.bio.nAn);
    if (S.bio.anShape === 'circ') {   // bể kỵ khí tròn (Handbook 7.9.1)
      const Dn = U.ceilTo(Math.sqrt(4 * v / Math.PI / a.H), 0.25);
      R.an = { V: B.VAN, n: S.bio.nAn, H: a.H, D: Dn, B: Dn, L: Dn, circ: true };
      d.r('Bể kỵ khí (tròn)', 'V_AN', B.VAN, 'm³', S.bio.nAn + ' bể D = ' + U.fmt(Dn) + ' m');
    } else {
      R.an = { V: B.VAN, n: S.bio.nAn, H: a.H, B: U.ceilTo(Math.sqrt(v / a.H), 0.5) };
      R.an.L = U.ceilTo(v / a.H / R.an.B, 0.25);
      d.r('Bể kỵ khí', 'V_AN', B.VAN, 'm³', S.bio.nAn + ' bể ' + U.fmt(R.an.B) + ' × ' + U.fmt(R.an.L) + ' m');
    }
    d.r('Máy khuấy bể kỵ khí', 'P', B.VAN * (S.aer.wMix || 2.5) / 1000, 'kW', U.fmt(S.aer.wMix || 2.5, 1) + ' W/m³; 1 máy/bể');
  }
  if (S.opt.selector) {
    const v = B.Vsel / Math.max(1, S.bio.nSel);
    R.sel = { V: B.Vsel, n: S.bio.nSel, D: U.ceilTo(Math.sqrt(4 * v / Math.PI / a.H), 0.25) };
    d.r('Selector hiếu khí', 'V_Sel', B.Vsel, 'm³', S.bio.nSel + ' ngăn D = ' + U.fmt(R.sel.D) + ' m');
  }
  R.d = d;
  return R;
};

/* ---------- Sục khí ---------- */
ENG.alphaDefault = S => {
  if (S.opt.line === 'MBR') return S.mbr.alpha;
  if (S.opt.line === 'SBR') return 0.65;
  if (S.opt.stab) return 0.75;
  return S.opt.mixing === 'sep' ? 0.70 : 0.62;
};

/* B: kết quả sinh học; geo: {V, Vtank1, H, n, Aw, tSS}; ctx: {tAerPerDay (h/d), SBRf} */
ENG.aer = function (S, B, geo, ctx = {}) {
  const A = S.aer, o = S.opt, d = new Rep('Sục khí & khuấy trộn (DWA-M 229-1)');
  const R = {};
  const alpha = A.alpha > 0 ? A.alpha : ENG.alphaDefault(S);
  const hD = geo.H - A.dz;
  const p = U.patm(A.hNN);
  const fd = 1 + hD / 20.7;
  const r = o.process === 'ND' ? B.r : 0;
  // thời gian sục khí trong ngày
  let tA = 24;
  if (ctx.tAer) tA = ctx.tAer;
  else if (o.process === 'ND' && (o.dn === 'int')) tA = 24 * (1 - r);
  else if (o.process === 'ND' && o.dn === 'comb') { const fp = U.clamp(+o.combPre || 0.2, 0.05, 0.6); tA = 24 * (1 - Math.max(0, r - fp) / (1 - fp)); }   // bể nitrat hóa (1 − f_vorg) sục khí gián đoạn
  R.tA = tA; R.alpha = alpha; R.hD = hD; R.p = p; R.fd = fd;
  d.h('Thông số');
  d.r('Hệ số α', 'α', alpha, '–', 'M229-1 bảng 1: ổn định 0,7–0,9; N/DN 0,6–0,85; SBR 0,6–0,85; MBR 0,5–0,7');
  d.r('Hệ số muối', 'β', A.beta, '–');
  d.r('Nồng độ O₂ vận hành', 'C_x', A.Cx, 'mg/l');
  d.r('Cao độ', 'h_NN', A.hNN, 'm', 'p_atm = ' + U.fmt(p, 1) + ' hPa');
  d.r('Chiều sâu thổi khí', 'h_D', hD, 'm', 'H − ' + A.dz + ' m');
  d.r('Hệ số chiều sâu', 'f_d', fd, '–', '1 + h_D/20,7');
  d.r('Thời gian sục khí', 't_N', tA, 'h/d');
  // các trường hợp tải
  const cases = [];
  const sf = ctx.SBRf || 1;
  const sel = (o.selector && B.O2sel) ? B.O2sel / 24 : 0;
  const Cs20 = U.CsT(20);
  const sotr = (OVh, T, cx, al) => OVh * Cs20 * fd / (al * (A.beta * U.CsT(T) * fd * p / 1013.25 - cx) * Math.pow(1.024, T - 20));
  if (A.lcMode === 'A131' || !B.caseDN) {
    const temps = [...new Set([A.Tmin, B.T, A.Tmax])].sort((x, y) => x - y);
    for (const T of temps) {
      const v = B.ov(T, geo.tSS);
      const fC = U.interp(ENG.FC_TAB, geo.tSS), fN = B.fN;
      const mk = (fc, fn, lab) => {
        let OVh = (fc * (v.OVdC - v.OVdD) + fn * v.OVdN) / 24;
        OVh = OVh * 24 / tA * sf;
        if (A.fsel && sel) OVh = Math.max(0, OVh - sel);
        return { T, lab, fc, fn, OVh, SOTR: sotr(OVh, T, A.Cx, alpha), Cs: U.CsT(T), Cx: A.Cx, alpha, load: 1, tA, r };
      };
      cases.push(mk(fC, 1, 'max C'));
      if (o.process !== 'C') cases.push(mk(1, fN, 'max N'));
      cases.push(mk(1, 1, 'trung bình'));
    }
  } else {
    // DWA-M 229-1: trường hợp 0 – 5 (Handbook 7.9.6); trường hợp 2 quyết định sục khí & khuấy; 3 cho phân cấp máy thổi
    const LAB = ['0 – thiết kế', '1 – trung bình (hiện trạng)', '2 – lớn nhất (hiện trạng)', '3 – nhỏ nhất', '4 – dự báo', '5 – tự do'];
    const Tm = (A.Tmin + A.Tmax) / 2, Tauto = [B.T, Tm, A.Tmax, Tm, Tm, A.Tmin];
    const fC0 = U.interp(ENG.FC_TAB, geo.tSS), fN0 = B.fN;
    for (let i = 0; i < 6; i++) {
      const lc = (A.lc || [])[i] || {};
      if (lc.on === false) continue;
      const T = +lc.T || Tauto[i], load = +lc.load > 0 ? +lc.load : 1, cx = +lc.Cx > 0 ? +lc.Cx : A.Cx, al = +lc.alpha > 0 ? +lc.alpha : alpha;
      const v = B.ov(T, geo.tSS), cd = B.caseDN(T, geo.tSS);
      const OVdD = o.process === 'ND' ? v.OVdD * (v.s.SNO3D > 0 ? cd.SNO3D / v.s.SNO3D : 0) : 0;
      const OVdN = cd.noNit ? 0 : v.OVdN;
      // thời gian sục khí theo tỷ lệ khử nitrat của trường hợp
      let tAc = tA;
      if (!ctx.tAer && o.process === 'ND' && o.dn === 'int') tAc = 24 * (1 - cd.r);
      else if (!ctx.tAer && o.process === 'ND' && o.dn === 'comb') { const fp = U.clamp(+o.combPre || 0.2, 0.05, 0.6); tAc = 24 * (1 - Math.max(0, cd.r - fp) / (1 - fp)); }
      // tải thấp < 30 % công suất trung bình: f_C = f_N = 1
      const low = load < 0.3, peak = (i === 0 || i === 2 || i === 4 || i === 5) && !low;
      let fc = peak ? fC0 : 1, fn = peak && o.process !== 'C' ? fN0 : 1, OVh;
      if (i === 3 && A.lc3 !== 'b') {   // 3a: không có tải đáng kể ban đêm
        OVh = v.OVdC * load / ((3.92 / (geo.tSS * Math.pow(1.072, T - 15)) + 1.66) * 24);
        fc = fn = 0;
      } else OVh = load * (fc * (v.OVdC - OVdD) + fn * OVdN) / 24;
      OVh = OVh * 24 / tAc * sf;
      if (A.fsel && sel) OVh = Math.max(0, OVh - sel * load);
      cases.push({ no: i, T, lab: LAB[i] + (cd.noNit && o.process !== 'C' ? ' – không nitrat hóa' : '') + (cd.PF < B.PF - 1e-9 ? ' (PF→1,2)' : ''), fc, fn, OVh, SOTR: sotr(OVh, T, cx, al), Cs: U.CsT(T), Cx: cx, alpha: al, load, tA: tAc, r: cd.r, noNit: cd.noNit });
    }
    if (!cases.length) cases.push({ no: 2, T: A.Tmax, lab: LAB[2], fc: fC0, fn: fN0, OVh: 0, SOTR: 0, Cs: U.CsT(A.Tmax), Cx: A.Cx, alpha, load: 1, tA, r });
  }
  // DWA-A 226 (trạm nhỏ): tải ôxy cố định OB = 3,0 (N) / 2,5 (N/DN) kg O₂/kg BOD₅; OC = OB·B_d,BOD5/t_L,dim (24 h N; 16 h DN) – Handbook 7.9.6
  const a226 = o.guide === 'A226' && o.standard === 'DWA' && o.line === 'CAS' && B.Bbod;
  if (a226) {
    const OB = A.OB226 > 0 ? A.OB226 : o.process === 'ND' ? 2.5 : 3.0, tL = o.process === 'ND' ? 16 : 24, T = A.Tmax;
    const OVh = OB * B.Bbod / tL;
    cases.push({ no: 9, T, lab: 'A 226 – OB = ' + U.fmt(OB, 1) + ' kg O₂/kg BOD₅, t_L ' + tL + ' h', fc: 1, fn: 1, OVh, SOTR: sotr(OVh, T, A.Cx, alpha), Cs: U.CsT(T), Cx: A.Cx, alpha, load: 1, tA: tL, r, a226: true });
  }
  // MBR: trừ ôxy cấp bởi khí rửa màng (Handbook 7.10)
  if (ctx.O2credit > 0) for (const c of cases) { c.OVh = Math.max(0, c.OVh - ctx.O2credit * (c.load || 1)); c.SOTR = sotr(c.OVh, c.T, c.Cx ?? A.Cx, c.alpha ?? alpha); c.lab += ' (− O₂ khí rửa)'; }
  const des = a226 ? cases[cases.length - 1] : cases.reduce((m, c) => (c.SOTR > m.SOTR ? c : m), cases[0]);
  R.cases = cases; R.des = des; R.OVh = des.OVh; R.SOTR = des.SOTR;
  const m229 = cases[0] && cases[0].no !== undefined;
  d.h(m229 ? 'Trường hợp tải DWA-M 229-1 (0 – 5)' : 'Trường hợp tải (f_C, f_N theo A 131)');
  for (const c of cases) d.r((m229 ? 'TH ' + c.lab + ', T = ' + c.T + ' °C' : `T = ${c.T} °C – ${c.lab}`) + (c.no === 3 && A.lc3 !== 'b' ? ' (3a)' : ` (f_C=${U.fmt(c.fc)}, f_N=${U.fmt(c.fn)})`), 'OV_h → SOTR', c.SOTR, 'kg O₂/h', 'OV_h = ' + U.fmt(c.OVh) + ' kg/h; C_S,T = ' + U.fmt(c.Cs) + ' mg/l' + (m229 ? '; tải ' + U.fmt(c.load * 100, 0) + ' %, C_x ' + U.fmt(c.Cx, 1) + ', α ' + U.fmt(c.alpha, 2) + (o.process === 'ND' ? ', V_D/V_BB ' + U.fmt(c.r, 2) + ', t_N ' + U.fmt(c.tA, 1) + ' h/d' : '') : ''));
  if (m229) { if (cases.some(c => c.noNit && o.process !== 'C')) d.warn('Có trường hợp tải không đủ tuổi bùn cho nitrat hóa (kể cả PF = 1,2) – Handbook 7.9.6.', FX('Tăng hệ số quá trình PF = 1,8', { 'bio.PF': 1.8 }), FX('Thiết kế tuổi bùn ở T_min', { 'bio.T': S => Math.min(S.bio.T, S.aer.Tmin) })); d.info('M 229-1: trường hợp 3a OV_h,min = OV_d,C,aM/((3,92/(t_TS·1,072^(T−15)) + 1,66)·24); tải < 30 % → f_C = f_N = 1.'); }
  if (a226 && B.Btkn / B.Bbod > 1 / 3.5) d.info('A 226: TKN : BOD₅ = 1 : ' + U.fmt(B.Bbod / B.Btkn, 1) + ' > 1 : 3,5 – nhu cầu ôxy nitrat hóa nên tính riêng (đối chiếu trường hợp tải M 229-1 ở trên).');
  d.r('Nhu cầu ôxy giờ thiết kế', 'OV_h', des.OVh, 'kg O₂/h', 'T = ' + des.T + ' °C, ' + des.lab);
  d.r('Khả năng cấp ôxy chuẩn yêu cầu', 'SOTR', des.SOTR, 'kg O₂/h', 'OV_h·C_S,20·f_d/[α·(β·C_S,T·f_d·p/1013 − C_x)·1,024^(T−20)]');
  R.OVd = des.OVh * tA;
  const Vtot = geo.V;
  if (o.aeration === 'diff') {
    // đĩa/ống: sản phẩm từ ngân hàng thiết bị (AD 9.2) – nếu chọn, SSOTR lấy theo sản phẩm
    const dfSel = A.diffId && DB.find('diffuser', A.diffId);
    const df = (dfSel && dfSel.type === A.diff ? dfSel : null) || DB.find('diffuser', A.diff === 'tube' ? 'T1' : A.diff === 'plate' ? 'P1' : A.diff === 'strip' ? 'S1' : 'D9') || DB.data.diffuser[0];
    const useDB = A.ssotrSrc === 'db' && df.SSOTR > 0;
    const SSOTR = useDB ? df.SSOTR : A.SSOTR;
    const QL = des.SOTR * 1000 / (SSOTR * hD);
    R.QL = QL; R.SSOTR = SSOTR;
    d.h('Khí nén');
    d.r('Sản phẩm phân phối khí', '', df.name, '', (dfSel && dfSel !== df ? 'sản phẩm chọn khác loại "' + A.diff + '" – dùng mặc định; ' : '') + 'tải ' + df.qmin + ' – ' + df.qmax + ' ' + df.unit);
    d.r('Hiệu suất cấp ôxy riêng', 'SSOTR', SSOTR, 'g O₂/(Nm³·m)', (useDB ? 'theo ngân hàng thiết bị' : 'nhập tay') + '; SSOTE ≈ ' + U.fmt(SSOTR / 3, 1) + ' %/m');
    d.r('Lưu lượng khí (chuẩn)', 'Q_L,N', QL, 'Nm³/h', 'SOTR·1000/(SSOTR·h_D)');
    d.r('Lưu lượng khí riêng theo thể tích', '', QL / Vtot, 'Nm³/(m³·h)');
    const q = A.qDiff > 0 ? A.qDiff : df.qopt;
    // nAer: số bể sục khí đồng thời (C-Tech: chỉ các bể đang pha F/A) – đĩa lắp cho mọi bể theo lưu lượng một bể đang sục
    const nAer = ctx.nAer || geo.n;
    const nD = Math.ceil(QL / q / nAer) * geo.n;
    const Afloor = geo.Aw * geo.n * (o.process === 'ND' && o.dn === 'pre' ? (1 - r) : 1);
    R.diff = { type: df, q, n: nD, perTank: nD / geo.n, dens: nD * df.A / Afloor * 100 };
    d.r(df.name, 'n_Bel', nD, df.type === 'tube' ? 'm ống' : 'cái', 'tải ' + U.fmt(q) + ' ' + df.unit + ' (' + df.qmin + '–' + df.qmax + ')');
    d.r('Mật độ phủ đáy', '', R.diff.dens, '%', 'diện tích màng / diện tích đáy vùng sục khí');
    if (q > df.qmax) d.warn('Tải đĩa/ống vượt giới hạn nhà sản xuất.', FX('Đặt tải tối ưu ' + df.qopt + ' ' + df.unit, { 'aer.qDiff': 0 }), FX('Đặt tải = ' + df.qmax, { 'aer.qDiff': df.qmax }));
    // tải nhỏ
    const c3 = cases.find(c => c.no === 3), minC = c3 || cases.reduce((m, c) => (c.SOTR < m.SOTR ? c : m), cases[0]);
    const QLmin = minC.SOTR * 1000 / (SSOTR * hD) * (c3 ? 1 : 0.6);
    R.QLmin = QLmin;
    if (QLmin / nD < df.qmin) d.info('Ở tải nhỏ (≈ ' + U.fmt(QLmin) + ' Nm³/h) tải đĩa < min – cần điều khiển gián đoạn/vùng.');
    // máy thổi
    const dp = hD * 98.07 + A.dpLoss;
    const p1 = p - A.dpSuction;
    const phi = A.phi > 0 ? A.phi : 0.6, T1 = 273.15 + A.Tair, ps = U.psat(A.Tair);
    const Q1 = QL * (1013.25 / p1) * (T1 / 273.15) * (p1 / (p1 - phi * ps));
    const nB = A.nBlow > 0 ? A.nBlow : (ctx.nBlow || Math.max(2, geo.n));
    const Qb = Q1 / nB;
    const bl = (A.blowerId && DB.find('blower', A.blowerId)) || DB.pickBlower(Qb, dp);
    const eta = bl ? (bl.type === 'Turbo' ? 0.78 : bl.type === 'Trục vít' ? 0.70 : 0.60) : 0.6;
    const Pshaft = DB.blowerPower(Qb, p1, dp, eta);
    const Pel = Pshaft * 1.05 / DB.etaMotor(Pshaft);
    R.blow = { dp, p1, Q1, n: nB, sb: A.nBlowSb, Qb, item: bl, Pshaft, Pel, Ptot: Pel * nB };
    d.h('Máy thổi khí');
    d.r('Áp lực đẩy', 'Δp', dp, 'mbar', 'h_D·98,07 + tổn thất ' + A.dpLoss + ' mbar');
    d.r('Lưu lượng hút (trạng thái hút)', 'Q₁', Q1, 'm³/h', 'p₁ = ' + U.fmt(p1, 0) + ' hPa, ' + A.Tair + ' °C, φ = ' + U.fmt(phi * 100, 0) + ' %');
    d.r('Số máy làm việc + dự phòng', '', nB + ' + ' + A.nBlowSb, '');
    d.r('Lưu lượng mỗi máy', 'Q₁/n', Qb, 'm³/h');
    d.r('Máy chọn', '', bl ? bl.name + ' (' + bl.Pn + ' kW)' : 'không có trong ngân hàng – thêm thiết bị', '');
    d.r('Công suất trục mỗi máy', 'P_W', Pshaft, 'kW', 'nén đoạn nhiệt, η = ' + eta);
    d.r('Công suất điện mỗi máy', 'P_el', Pel, 'kW');
    d.r('Điện năng sục khí', 'E', Pel * nB * tA, 'kWh/d', 'ở tải thiết kế');
    // thông gió phòng máy thổi
    if (bl) {
      const heat = (nB + A.nBlowSb) * bl.Pn * 0.15; // kW
      const Qvent = heat * 3600 / (1.007 * 1.168 * A.dTroom);
      R.vent = { heat, Qvent, Qnet: Math.max(0, Qvent - Q1) };
      d.r('Nhiệt tỏa phòng máy', '', heat, 'kW', '15 % công suất định mức');
      d.r('Lưu lượng gió cần', 'Q_vent', Qvent, 'm³/h', 'ΔT = ' + A.dTroom + ' K; trừ khí hút máy thổi còn ' + U.fmt(R.vent.Qnet) + ' m³/h');
    }
    // lưới phân phối khí
    R.grid = ENG.grid(S, geo, R.diff);
    { // bố trí lưới (Handbook 7.9.7): ống góp, phân bố đều / theo bậc, khoảng cách tường, sức chứa lưới
      const G = R.grid;
      d.h('Lưới phân phối khí (mỗi bể)');
      d.r('Số lưới', 'n_G', G.nL, '', 'mỗi lưới ' + U.fmt(G.perL, 0) + ' ' + (R.diff.type.type === 'tube' ? 'm ống' : 'bộ'));
      d.r('Ống góp ngang mỗi lưới', 'n_V', G.nHeader || 0, '', G.nHeader ? (G.grade ? 'phân bố theo bậc (giảm sau mỗi ' + G.grade + ' ống góp)' : 'phân bố đều') : 'gắn trên ống trung tâm');
      if (G.perHeader && G.perHeader.length) d.r('Số đĩa/ống trên mỗi ống góp', '', G.perHeader.join(' / '), '', '');
      if (G.cap) { d.r('Sức chứa lưới', '', G.cap, '', 'hàng × cột với bước ' + U.fmt(G.spacing, 2) + ' m, cách tường ' + U.fmt(A.wallDist ?? 0.5) + ' m'); if (G.cap < G.perL) d.warn('Lưới không đủ chỗ cho ' + U.fmt(G.perL, 0) + ' đĩa/ống – tăng số lưới, giảm bước hoặc tăng tải mỗi đĩa.', FX('Tăng số lưới mỗi bể', { 'aer.lattices': S => (S.aer.lattices || G.nL) + 1 }), FX('Giảm bước đĩa 10 %', { 'aer.spacing': S => +((S.aer.spacing || G.spacing) * 0.9).toFixed(2) }), FX('Tăng tải mỗi đĩa/ống để vừa lưới', { 'aer.qDiff': +Math.min(R.diff.type.qmax, R.diff.q * G.perL / G.cap * 1.05).toFixed(2) }), S.at.type === 'rect' && (S.at.B > 0 || S.at.L > 0) && FX('Tự tính kích thước bể (rộng hơn)', { 'at.B': 0, 'at.L': 0 })); }
      if (R.diff.type.type === 'disc' && !G.nHeader) d.info('Đĩa màng luôn cần ống góp ngang (Handbook 7.9.7).');
      if (!useDB) d.info('SSOTR nhập tay – chọn "SSOTR theo sản phẩm" trong form Sục khí để lấy giá trị từ ngân hàng đĩa/ống.');
    }
  } else {
    // sục khí bề mặt: theo SAE hoặc Pöpel (Handbook 7.9.6): OC_A = OB/V → mật độ công suất LD (W/m³) → ON10
    const POP = { rotor: ['rôto trục ngang (mương tuần hoàn)', 11.75, 1.40, 1.97, -0.0058], vmix: ['trục đứng – bể khuấy trộn hoàn toàn', 10.73, 1.96, 1.41, 0.0055], vcirc: ['trục đứng – mương tuần hoàn', -2.05, 2.58, 2.36, -0.0121] };
    const pp = POP[A.surfType];
    let SAE = A.surfSAE, P = des.SOTR / SAE;
    if (pp) {
      const OCA = des.SOTR * 1000 / Vtot, LD = Math.max(0, (OCA - pp[1]) / pp[2]), ON10 = pp[3] + pp[4] * LD;
      P = LD * Vtot / 1000; SAE = P > 0 ? des.SOTR / P : ON10;
      R.popel = { OCA, LD, ON10 };
      d.h('Sục khí bề mặt theo Pöpel – ' + pp[0]);
      d.r('Khả năng cấp ôxy theo thể tích', 'OC_A', OCA, 'g O₂/(m³·h)', 'SOTR/V_BB');
      d.r('Mật độ công suất', 'LD', LD, 'W/m³', 'OC_A = ' + pp[1] + ' + ' + pp[2] + '·LD');
      d.r('Hiệu suất ôxy', 'ON10', ON10, 'kg O₂/kWh', pp[3] + (pp[4] < 0 ? ' − ' : ' + ') + Math.abs(pp[4]) + '·LD; SOTR/P = ' + U.fmt(SAE, 2));
      if (A.surfType === 'vcirc') d.info('Pöpel: tương quan trục đứng trong mương tuần hoàn chưa đảm bảo thống kê.');
      if (LD < 10) d.info('Mật độ công suất < 10 W/m³ – kiểm tra khả năng giữ bùn lơ lửng (có thể cần máy khuấy/đẩy dòng).');
    }
    const nS = A.nSurf > 0 ? A.nSurf : Math.max(geo.n, Math.ceil(P / 45 / geo.n) * geo.n);
    const unit = DB.data.surf.find(x => x.P >= P / nS) || DB.data.surf[DB.data.surf.length - 1];
    R.surf = { SAE, P, n: nS, item: unit, Ptot: nS * unit.P };
    d.h('Sục khí cơ khí bề mặt');
    if (!pp) d.r('Hiệu suất ôxy', 'SAE', SAE, 'kg O₂/kWh', '1,6–2,0');
    d.r('Công suất cần', 'P', P, 'kW');
    d.r('Số máy', 'n', nS, ''); d.r('Máy chọn', '', unit.name, '');
    d.r('Điện năng', 'E', unit.P * nS * tA, 'kWh/d');
  }
  // khuấy trộn
  // khuấy bằng xung khí (Handbook 7.9.7, M 229-1): mật độ phủ 12 – 20 %; Q_L = P_BB·V/(2,72·h_D)·273/(273 + T_W); tham khảo 1,8 Nm³/(m²_BB·h)
  if (o.mixing === 'pulse' && o.aeration === 'diff' && !ctx.noMix) {
    const Vm = (o.process === 'ND' && (o.dn === 'pre' || o.dn === 'casc')) ? geo.V * r : geo.V, Am = Vm / geo.H;
    const Qf = A.wMix * Vm / (2.72 * hD) * 273 / (273 + B.T), Qg = 1.8 * Am, Qp = Math.max(Qf, Qg);
    R.pulse = { Qf, Qg, Q: Qp, dens: R.diff ? R.diff.dens : 0 };
    d.h('Khuấy bằng xung khí (không máy khuấy)');
    d.r('Lưu lượng khí khuấy theo năng lượng', 'Q_L,mix', Qf, 'Nm³/h', 'P_BB·V/(2,72·h_D)·273/(273+T), P_BB = ' + A.wMix + ' W/m³');
    d.r('Lưu lượng khí khuấy tham khảo', 'Q_L,mix', Qg, 'Nm³/h', '1,8 Nm³/(m²·h) × ' + U.fmt(Am, 0) + ' m² đáy');
    if (R.diff) d.c('Mật độ phủ đáy', '', R.diff.dens, '%', '12 – 20', R.diff.dens >= 12 && R.diff.dens <= 20, 'nhà cung cấp phải xác nhận & bảo đảm');
    if (R.QL && Qp > R.QL) d.warn('Khí khuấy xung (' + U.fmt(Qp, 0) + ' Nm³/h) > khí sục thiết kế – máy thổi phải đủ cho xung khí.', FX('Dùng máy khuấy riêng', { 'opt.mixing': 'sep' }));
    d.info('Xung khí khi nồng độ bùn đáy ≈ 8 g/l; thời gian xung ≥ 3 × thời gian nổi bọt (vận tốc trượt ≈ 20 cm/s); trạm > 600 PE nên có máy khuấy.');
  }
  const needMix = !ctx.noMix && o.mixing !== 'pulse' && (o.mixing === 'sep' || (o.process === 'ND' && o.dn !== 'sim') || o.aeration === 'surf');
  if (needMix) {
    const Vmix1 = (o.process === 'ND' && (o.dn === 'pre' || o.dn === 'casc')) ? geo.V * r / geo.n : geo.V / geo.n;
    if (o.guide === 'A226' && (A.wMix < 3 || A.wMix > 8)) d.info('A 226: năng lượng khuấy 3 – 8 W/m³ (thấp hơn cho bể thuận lợi).');
    const Preq = Vmix1 * A.wMix / 1000;
    let nM = A.nMix > 0 ? A.nMix : Math.max(1, Math.ceil(Preq / 5.5));
    let mx = (A.mixId && DB.find('mixer', A.mixId)) || DB.pickMixer(Preq / nM, true);
    if (mx && mx.Pn * nM < Preq) nM = Math.ceil(Preq / mx.Pn);
    R.mix = { Vmix1, Preq, n: nM, item: mx, nTot: nM * geo.n, P: mx ? mx.P * nM * geo.n : 0 };
    d.h('Khuấy trộn');
    d.r('Thể tích khuấy mỗi bể', 'V', Vmix1, 'm³');
    d.r('Năng lượng khuấy riêng', 'w', A.wMix, 'W/m³', 'cánh lớn tốc độ thấp 1,5–3 W/m³');
    d.r('Công suất cần mỗi bể', 'P', Preq, 'kW');
    d.r('Máy khuấy', '', nM + ' × ' + (mx ? mx.name : '?') + ' mỗi bể', '', 'tổng ' + U.fmt(R.mix.nTot, 0) + ' máy' + (A.mixGroup > 1 ? '; ' + A.mixGroup + ' máy/nhóm → ' + Math.ceil(nM / A.mixGroup) + ' nhóm' : ''));
    if (A.mixGroup > 1 && nM % A.mixGroup) d.info('Số máy khuấy mỗi bể không chia hết cho số máy mỗi nhóm.');
  }
  R.d = d;
  return R;
};

/* bố trí lưới đĩa/ống trong bể (để vẽ) */
ENG.grid = function (S, geo, diff) {
  const a = S.at, A = S.aer, g = { lattices: [] };
  if (!diff) return g;
  const per = diff.perTank;
  const isTube = diff.type.type === 'tube';
  const spacing = A.spacing > 0 ? A.spacing : isTube ? 1.0 : diff.type.type === 'strip' ? 1.2 : 0.6, wd = A.wallDist ?? 0.5;
  if (geo.type === 'rect') {
    const lenAer = geo.L * (S.opt.process === 'ND' && S.opt.dn === 'pre' ? (1 - (geo.r || 0)) : 1);
    const nL = A.lattices > 0 ? A.lattices : Math.max(1, Math.round(lenAer / 6));
    const Lg = (lenAer - (nL + 1) * A.latDist) / nL;
    const Bg = geo.B - 2 * wd;
    const rows = Math.max(1, Math.floor(Bg / spacing));
    const perL = Math.ceil(per / nL);
    g.cap = rows * Math.max(1, Math.floor(Lg / (isTube ? (A.tubeSeg || 2.0) : spacing))) * (isTube ? (A.tubeSeg || 2.0) : 1);
    for (let i = 0; i < nL; i++) g.lattices.push({ x: geo.L - lenAer + A.latDist + i * (Lg + A.latDist), y: 0.5, w: Lg, h: Bg, rows, perL });
    g.nL = nL; g.perL = perL;
  } else {
    g.nL = A.lattices > 0 ? A.lattices : 8;
    g.perL = Math.ceil(per / g.nL);
  }
  g.spacing = spacing;
  // ống góp ngang: 0 = gắn trên ống trung tâm; > 0 → phân bố đều hoặc theo bậc (bể tròn: ít đĩa hơn về phía tâm)
  const nH = Math.max(0, Math.round(A.nHeader || 0));
  g.nHeader = nH; g.grade = A.grade > 0 ? Math.round(A.grade) : 0;
  if (nH > 0) {
    let w = [...Array(nH)].map((_, i) => g.grade ? 1 + Math.floor((nH - 1 - i) / g.grade) : 1);
    if (g.grade && geo.type !== 'rect') w = w.reverse();
    const sw = w.reduce((s, x) => s + x, 0);
    g.perHeader = w.map(x => Math.round(g.perL * x / sw));
  }
  return g;
};

/* ---------- Bùn tuần hoàn, tuần hoàn nội, bùn dư ---------- */
/* ras: undefined = theo RV (CAS/MBR); null = không có bùn tuần hoàn (SBR, ICEAS); {Q, n, note} = cho trước (C-Tech) */
ENG.rs = function (S, RL, RS, B, geo, ras) {
  const s = S.rs, d = new Rep(ras === null ? 'Bơm bùn dư' : 'Bơm bùn tuần hoàn & bùn dư');
  const R = {};
  const RV = S.opt.line === 'MBR' ? S.mbr.recir : S.sst.RV;
  const QRS = ras ? ras.Q : ras === null ? 0 : RV * RL.Qm;
  const nSST = RS ? RS.n : geo.n;
  R.QRS = QRS;
  if (ras !== null) {
  d.h('Bùn tuần hoàn');
  if (ras) d.r('Lưu lượng tuần hoàn', 'Q_RAS', QRS, 'm³/h', ras.note || '');
  else {
    d.r('Tỷ lệ tuần hoàn', 'RV', RV, '–');
    d.r('Lưu lượng tuần hoàn', 'Q_RS', QRS, 'm³/h', 'RV·Q_M; A131: dòng ngang ≤ 1,5·Q_T, dòng đứng ≤ 2,0·Q_T');
  }
  const nP = s.nP > 0 ? s.nP : ras ? ras.n : Math.max(2, nSST);
  if (s.type === 'air') {
    const hs = RS ? RS.hEdge || RS.H : 4;
    const Va = 0.5 / (6 * Math.log10((hs + 10.33) / 10.33));
    const Qair = Va * QRS;
    const dp = hs * 98.07 + 50;
    const bl = DB.pickBlower(Qair / nP, dp);
    const P = DB.blowerPower(Qair / nP, 1000, dp, 0.5) / 0.85;
    Object.assign(R, { type: 'air', Va, Qair, dp, n: nP, item: bl, Pel: P, Ptot: P * nP });
    d.r('Khí cho bơm khí nâng', 'Q_L', Qair, 'm³/h', U.fmt(Va, 2) + ' m³ khí/m³ bùn (nhấn chìm ' + U.fmt(hs) + ' m, nâng 0,5 m)');
    d.r('Máy nén / máy thổi', '', nP + ' × ' + (bl ? bl.name : '?'), '', 'áp ' + U.fmt(dp, 0) + ' mbar');
  } else {
    const cat = s.type === 'screw' ? 'screw' : 'cent';
    const Q1 = QRS / nP;
    const it = (s.pumpId && DB.find(cat, s.pumpId)) || DB.pickPump(cat, Q1, s.H);
    const eta = it ? it.eta : 0.6;
    const P = 9.81 * (Q1 / 3600) * s.H / eta / 0.9;
    Object.assign(R, { type: cat, n: nP, sb: s.nSb, Q1, H: s.H, item: it, Pel: P, Ptot: P * nP });
    d.r('Số bơm làm việc + dự phòng', '', nP + ' + ' + s.nSb, '');
    d.r('Lưu lượng mỗi bơm', 'Q', Q1, 'm³/h'); d.r('Cột áp', 'H', s.H, 'm');
    d.r('Bơm chọn', '', it ? it.name + ' (' + it.Pn + ' kW)' : 'không có trong ngân hàng', '');
    d.r('Công suất điện', 'P_el', P * nP, 'kW');
  }
  if (S.opt.line !== 'MBR' && RS) {
    const recQ = (RS.n > 0 ? (S.opt.sewer === 'comb' ? 1.0 : 1.0) : 1) * RL.Qm;
    d.r('Công suất bơm khuyến nghị', '', recQ, 'm³/h', 'thiết bị nên đạt ' + (S.sst.flow === 'vt' ? '1,5' : '1,0') + '·Q_M khi vận hành');
  }
  } else d.info('Bể phản ứng theo mẻ: không có bơm bùn tuần hoàn; bùn dư bơm trong pha lắng/xả.');
  if (B && B.RZ > 0) {
    d.h('Tuần hoàn nội (nitrat)');
    const nR = s.nRZ > 0 ? s.nRZ : geo.n;
    const QRZ = (s.RZsel > 0 ? s.RZsel : B.RZ) * RL.QtaM;
    const it = (s.rzPumpId && DB.find('cent', s.rzPumpId)) || DB.pickPump('cent', QRZ / nR, 1);
    const P = 9.81 * (QRZ / nR / 3600) * 0.8 / 0.55;
    R.rz = { n: nR, Q: QRZ, Q1: QRZ / nR, item: it, P: P * nR };
    d.r('Lưu lượng tuần hoàn nội', 'Q_RZ', QRZ, 'm³/h', 'RZ = ' + U.fmt(s.RZsel > 0 ? s.RZsel : B.RZ));
    d.r('Bơm chân vịt', '', nR + ' × ' + U.fmt(QRZ / nR) + ' m³/h', '', 'cột áp ≈ 0,8 m; ' + U.fmt(P * nR) + ' kW');
  }
  if (B) {
    d.h('Bùn dư');
    const TSRS = RS ? RS.TSRS : (geo.TSwas || B.TS);
    const Qes = B.US / TSRS;
    const nE = s.esNP > 0 ? s.esNP : 1;
    const q1 = Qes / s.esHours / nE;
    const it = (s.esPumpId && DB.find('cent', s.esPumpId)) || DB.pickPump('cent', q1, s.esH);
    R.es = { Qd: Qes, n: nE, q1, item: it, P: 9.81 * q1 / 3600 * s.esH / 0.5 * nE, hours: s.esHours };
    d.r('Bùn dư', 'ÜS_d', B.US, 'kg TS/d');
    d.r('Thể tích bùn dư', 'Q_ÜS', Qes, 'm³/d', 'ở TS_RS = ' + U.fmt(TSRS) + ' kg/m³');
    d.r('Bơm bùn dư', '', nE + ' × ' + U.fmt(q1) + ' m³/h', '', s.esHours + ' h/d, H = ' + s.esH + ' m' + (it ? ' – ' + it.name : ''));
  }
  R.d = d;
  return R;
};
