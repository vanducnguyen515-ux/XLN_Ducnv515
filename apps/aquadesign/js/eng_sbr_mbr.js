/* AquaDesign VN – Engine: SBR (DWA-A 131:2016 / M 210) và MBR (DWA-M 227) */
'use strict';

ENG.sbr = function (S, RL) {
  const s = S.sbr, d = new Rep('Bể SBR (DWA-A 131:2016, M 210)');
  const R = {};
  const mZ = 24 / s.tZ;
  const tR = s.tZ - s.tSed - s.tDec - s.tIdle;
  if (tR <= 0) { d.err('Thời gian phản ứng ≤ 0 – kiểm tra các pha.', FX('Tăng chu kỳ t_Z = ' + U.fmt(s.tSed + s.tDec + s.tIdle + 2) + ' h', { 'sbr.tZ': s.tSed + s.tDec + s.tIdle + 2 }), FX('Bỏ pha chờ', { 'sbr.tIdle': 0 })); }
  const fr = Math.max(0.05, (tR - s.tAn) / s.tZ);
  d.h('Chu kỳ');
  d.r('Số bể', 'n', s.n, '');
  d.r('Thời gian chu kỳ (mùa khô)', 't_Z', s.tZ, 'h', 'm_Z = ' + U.fmt(mZ) + ' chu kỳ/d');
  d.r('Thời gian chu kỳ (mưa)', 't_Z,R', s.tZrain, 'h');
  d.r('Pha nạp', 't_F', s.tFill, 'h', s.nFeed + ' lần nạp/chu kỳ');
  d.r('Pha kỵ khí', 't_AN', s.tAn, 'h');
  d.r('Pha phản ứng (gồm nạp)', 't_R', tR, 'h');
  d.r('Pha lắng', 't_Sed', s.tSed, 'h');
  d.r('Pha xả nước trong', 't_Ab', s.tDec, 'h');
  d.r('Pha chờ', 't_Still', s.tIdle, 'h');
  d.r('Tỷ lệ thời gian phản ứng', 't_R/t_Z', fr, '–', '(t_R − t_AN)/t_Z');
  const B = ENG.bio(S, RL, { TS: s.TS, fr });
  R.B = B;
  // tính toán thủy lực + lắng
  const M = B.MTS;
  const dVdry = RL.Qd / (mZ * s.n);
  const dVrain = RL.Qm * s.tZrain / s.n;
  const dV = Math.max(dVdry, dVrain);
  const ISV = S.sst.ISV;
  const level = (TS) => {
    const vs = 650 / (TS * ISV);
    const ts = Math.max(0, s.tSed + s.tDec - 1 / 6);
    const hComp = s.H * TS * ISV / 1000;
    return Math.max(s.H - vs * ts, hComp);
  };
  // M 210 (Handbook 7.11): H_S(t) = H_W,0·[h_S,e + (1 − h_S,e)·e^(−a·(t − t_Flock))], a = 725/(H_W,0·(1 − VSV/1000)·(VSV − 100)); lớp nước trong H_KW ≥ 0,15·H_W và ≥ 0,4 m ở đầu & cuối pha xả, mùa khô và mưa
  const m210 = s.settle !== 'simple', tFl = s.tFlock > 0 ? s.tFlock : 1 / 6;
  const HS = (TS, t) => {
    const VSV = TS * ISV, hSe = Math.min(1, VSV / 1000);
    if (VSV <= 100) return s.H * hSe;   // bùn lắng rất tốt – lấy mực nén cuối
    if (VSV >= 1000) return s.H;
    const a = 725 / (s.H * (1 - VSV / 1000) * (VSV - 100));
    return s.H * (hSe + (1 - hSe) * Math.exp(-a * Math.max(0, t - tFl)));
  };
  const lam = (TS, fAx) => {   // [đầu xả, cuối xả]: dư lớp nước trong so với yêu cầu
    const Hs = s.H, He = s.H * (1 - fAx);
    return [Hs - HS(TS, s.tSed) - Math.max(0.15 * Hs, 0.4), He - HS(TS, s.tSed + s.tDec) - Math.max(0.15 * He, 0.4)];
  };
  const ok = V1 => {
    const TS = M / (s.n * V1), fA = dV / V1;
    if (m210) return Math.min(...lam(TS, dVdry / V1), ...lam(TS, dVrain / V1));
    return s.H * (1 - fA) - s.hSafe - level(TS);
  };
  const Vbio1 = M / s.TS / s.n;
  let V1 = Vbio1;
  if (ok(V1) < 0) {
    let hi = V1 * 2; while (ok(hi) < 0 && hi < V1 * 100) hi *= 1.5;
    V1 = U.bisect(ok, V1, hi, 1e-3);
  }
  const TSR = M / (s.n * V1), fA = dV / V1;
  Object.assign(R, { mZ, tR, fr, dVdry, dVrain, dV, V1, V: V1 * s.n, TSR, fA, vs: 650 / (TSR * ISV), level: level(TSR) });
  d.h('Thể tích phản ứng');
  d.r('Khối lượng bùn cần', 'M_TS', M, 'kg', 't_TS·ÜS_d');
  d.r('Thể tích theo sinh học', 'V_R,bio', Vbio1 * s.n, 'm³', 'TS_R,max = ' + s.TS + ' kg/m³');
  d.r('Thể tích trao đổi/chu kỳ (khô)', 'ΔV', dVdry, 'm³/bể', 'Q_d/(m_Z·n)');
  d.r('Thể tích trao đổi/chu kỳ (mưa)', 'ΔV_R', dVrain, 'm³/bể', 'Q_M·t_Z,R/n');
  d.r('Thể tích mỗi bể (chọn)', 'V_R', V1, 'm³', V1 > Vbio1 * 1.001 ? 'quyết định bởi điều kiện lắng/xả' : 'quyết định bởi sinh học');
  d.r('Tỷ lệ trao đổi thể tích', 'f_A', fA, '–', '≤ 0,3–0,4 (thường)');
  d.r('TS tại mực nước max', 'TS_R', TSR, 'kg/m³');
  d.r('Vận tốc lắng vùng', 'v_s', R.vs, 'm/h', '650/(TS·ISV)');
  if (m210) {
    const VSV = TSR * ISV, a = VSV > 100 && VSV < 1000 ? 725 / (s.H * (1 - VSV / 1000) * (VSV - 100)) : 0;
    R.m210 = { VSV, a, hSe: VSV / 1000, curve: [] };
    for (let t = 0; t <= s.tSed + s.tDec + 1e-9; t += (s.tSed + s.tDec) / 12) R.m210.curve.push([t, HS(TSR, t)]);
    d.h('Lắng & xả nước trong (ATV-M 210)');
    d.r('Thể tích bùn so sánh', 'VSV', VSV, 'l/m³', 'TS_R·ISV');
    d.r('Mực bùn tương đối cuối', 'h_S,e', VSV / 1000, '–', 'TS_R·ISV/1000');
    d.r('Hệ số lắng', 'a', a, '1/h', '725/(H_W,0·(1 − VSV/1000)·(VSV − 100))');
    for (const [nm, fx] of [['khô', dVdry / V1], ['mưa', dVrain / V1]]) {
      const He = s.H * (1 - fx), h1 = HS(TSR, s.tSed), h2 = HS(TSR, s.tSed + s.tDec);
      d.r('Lớp nước trong đầu xả (' + nm + ')', 'H_KW', s.H - h1, 'm', 'H_S = ' + U.fmt(h1) + ' m; yêu cầu ≥ ' + U.fmt(Math.max(0.15 * s.H, 0.4)) + ' m');
      d.r('Lớp nước trong cuối xả (' + nm + ')', 'H_KW', He - h2, 'm', 'H_W = ' + U.fmt(He) + ' m, H_S = ' + U.fmt(h2) + ' m; yêu cầu ≥ ' + U.fmt(Math.max(0.15 * He, 0.4)) + ' m');
      if (Math.min(s.H - h1 - Math.max(0.15 * s.H, 0.4), He - h2 - Math.max(0.15 * He, 0.4)) < -1e-3) d.warn('Lớp nước trong không đủ (' + nm + ') – tăng thể tích, thời gian lắng hoặc giảm f_A.', FX('Tăng thời gian lắng +0,25 h', { 'sbr.tSed': s.tSed + 0.25 }), FX('Giảm TS tại MN max 10 %', { 'sbr.TS': +(s.TS * 0.9).toFixed(2) }), FX('Thêm 1 bể', { 'sbr.n': s.n + 1 }));
    }
  } else d.r('Mực bùn cuối xả', 'h_S', R.level, 'm', 'cách mực nước thấp ≥ ' + s.hSafe + ' m');
  d.r('Mực nước thấp nhất', 'h_min', s.H * (1 - fA), 'm');
  if (fA > 0.5) d.warn('f_A > 0,5 – tỷ lệ trao đổi lớn.', FX('Thêm 1 bể', { 'sbr.n': s.n + 1 }), FX('Tăng chiều sâu +0,5 m', { 'sbr.H': s.H + 0.5 }));
  // hình học
  const A1 = V1 / s.H;
  if (s.shape === 'circ') { R.D = s.D > 0 ? s.D : U.ceilTo(Math.sqrt(4 * A1 / Math.PI), 0.5); R.Aw = Math.PI * R.D * R.D / 4; }
  else { R.Bw = s.B > 0 ? s.B : U.ceilTo(U.clamp(Math.sqrt(A1 / 2), 5, 25), 0.5); R.L = s.L > 0 ? s.L : U.ceilTo(A1 / R.Bw, 0.5); R.Aw = R.Bw * R.L; }
  R.Vreal = R.Aw * s.H * s.n;
  d.r(s.shape === 'circ' ? 'Đường kính' : 'Kích thước B × L', '', s.shape === 'circ' ? U.fmt(R.D) + ' m' : U.fmt(R.Bw) + ' × ' + U.fmt(R.L) + ' m', '', 'H = ' + s.H + ' m');
  d.r('Thể tích thực (tổng)', 'V', R.Vreal, 'm³');
  const act = ENG.bioActual(Object.assign({}, B, { TS: M / R.Vreal }), R.Vreal);
  R.tSS = act.tSS;
  // thời gian sục khí
  const tAerCyc = (tR - s.tAn) * (1 - (S.opt.process === 'ND' ? B.r : 0));
  R.tAerCyc = tAerCyc; R.tAerDay = tAerCyc * mZ;
  d.r('Thời gian sục khí/chu kỳ', 't_N', tAerCyc, 'h', 'khử nitrat ' + U.fmt((tR - s.tAn) - tAerCyc) + ' h/chu kỳ');
  // khử nitrat theo mẻ (M 210, Handbook 7.11): z mẻ nạp/pha phản ứng; NO3_e = NH4_Nit·f_A/z; t_D + t_N ≤ 2 h; kiểm tra năng lực theo A 131:1991
  if (S.opt.process === 'ND') {
    const z = Math.max(1, s.nFeed || 1), tRr = tR - s.tAn, fAd = dVdry / V1;
    const NH4 = B.st.Nnit, NO3e = NH4 * fAd / z, NO3D = NH4 - NO3e;
    const tD = B.r * tRr / z, tN = (1 - B.r) * tRr / z;
    const FT = Math.pow(1.072, B.T - 15), OUC = Math.min(1.6, 0.56 + 0.15 * B.tSS * FT / (1 + 0.17 * B.tSS * FT));
    const BOD = RL.bio.BOD / RL.Qd * 1000, cap = 0.8 * 0.75 * OUC / 2.9 * B.r * BOD;
    R.batchDN = { z, NH4, NO3e, NO3D, tD, tN, OUC, cap };
    d.h('Khử nitrat theo mẻ (ATV-M 210)');
    d.r('Số mẻ nạp mỗi pha phản ứng', 'z', z, '');
    d.r('NH₄-N cần nitrat hóa', 'NH4-N_Nit', NH4, 'mg/l', 'A 131 (M 210: TKN − 0,04·BOD₅ − 2)');
    d.r('NO₃-N ra', 'NO3-N_e', NO3e, 'mg/l', 'NH4-N_Nit·f_A/z (mùa khô)');
    d.r('NO₃-N khử', 'NO3-N_D', NO3D, 'mg/l');
    d.r('Thời gian khử nitrat / nitrat hóa mỗi mẻ', 't_D + t_N', tD + tN, 'h', 't_D = ' + U.fmt(tD) + ' h, t_N = ' + U.fmt(tN) + ' h (≤ 2 h)');
    d.r('Năng lực khử nitrat (A 131:1991)', 'NO3-N_D,max', cap, 'mg/l', '0,8·0,75·OV_C/2,9·t_D/t_R·BOD₅; OV_C = ' + U.fmt(OUC, 2) + ' kg O₂/kg BOD₅');
    if (tD + tN > 2 + 1e-6) d.info('M 210 khuyến cáo t_D + t_N ≤ 2 h mỗi mẻ (đang ' + U.fmt(tD + tN) + ' h) – tăng số lần nạp z/chu kỳ.');
    if (cap < NO3D - 1e-6) d.warn('M 210 (đối chiếu A 131:1991): năng lực khử nitrat ' + U.fmt(cap) + ' < ' + U.fmt(NO3D) + ' mg/l cần khử – tăng V_D/V (pha thiếu khí), tuổi bùn hoặc bổ sung carbon.', FX('Tăng số lần nạp z = ' + (z + 1), { 'sbr.nFeed': z + 1 }), FX('Cố định V_D/V = ' + U.fmt(Math.min(0.6, U.ceilTo(B.r * NO3D / cap, 0.05)), 2) + ' (pha thiếu khí dài hơn)', { 'bio.dnFix': Math.min(0.6, U.ceilTo(B.r * NO3D / cap, 0.05)) }), FX('Tăng tuổi bùn 30 %', { 'bio.tSSfix': U.ceilTo(B.tSS * 1.3, 0.5) }), FX('Tăng NO₃-N ra = ' + U.fmt(U.ceilTo(NO3e + NO3D - cap, 0.5)) + ' mg/l', { 'bio.NO3e': U.ceilTo(NO3e + NO3D - cap, 0.5) }));
    if (NO3e > (S.bio.NO3e || 0) + 1e-6) d.info('NO₃-N ra theo M 210 (' + U.fmt(NO3e) + ' mg/l) > mục tiêu ' + S.bio.NO3e + ' mg/l – tăng z hoặc giảm f_A.');
  }
  // bùn dư mỗi chu kỳ (M 210): V_WS·SS_WS = V_R·SS_R/t_TS·t_R/24
  { const kg = V1 * TSR / R.tSS * tR / 24, SSWS = 1000 / ISV * Math.cbrt(Math.max(0.5, s.tSed)), Vws = kg / SSWS;
    R.wsCyc = { kg, SSWS, V: Vws };
    d.r('Bùn dư mỗi chu kỳ mỗi bể', 'V_WS', Vws, 'm³', U.fmt(kg) + ' kg/chu kỳ; SS_WS ≈ 1000/ISV·∛t_Sed = ' + U.fmt(SSWS) + ' kg/m³'); }
  // xả nước trong
  R.Qdec = dV / s.tDec;
  d.r('Công suất thiết bị xả (decanter)', 'Q_Ab', R.Qdec, 'm³/h mỗi bể', 'ΔV/t_Ab');
  // bể điều hòa trước SBR
  if (s.buffer && s.mode !== 'idea') {
    const tGap = Math.max(0, s.tZ / (s.n * s.nFeed) - s.tFill / s.nFeed);
    R.Vbuf = RL.Qth * tGap;
    d.r('Bể điều hòa trước SBR', 'V_S', R.Vbuf, 'm³', 'Q_T,h·t_S, t_S = ' + U.fmt(tGap) + ' h');
  }
  if (s.mode === 'idea') d.info('Chế độ IDEA (nạp liên tục, xả gián đoạn): không cần bể điều hòa; cần vách chắn vùng vào.');
  R.d = d;
  return R;
};

ENG.mbr = function (S, RL) {
  const m = S.mbr, d = new Rep('Hệ màng sinh học MBR (DWA-M 227)');
  const R = {};
  const kub = m.vendor === 'kubota';
  let B = ENG.bio(S, RL, { TS: kub ? m.kub.MLSS : m.TS });
  if (!(S.bio.tSSfix > 0) && B.tSS < m.tSSmin) {
    const S2 = U.clone(S); S2.bio.tSSfix = m.tSSmin;
    B = ENG.bio(S2, RL, { TS: kub ? m.kub.MLSS : m.TS });
    B.d.info('MBR: tuổi bùn nâng lên tối thiểu ' + m.tSSmin + ' d (thực tiễn MBR 15–25 d – giảm tắc màng, bùn ổn định hơn).');
  }
  R.B = B;
  if (kub) {
    d.title = 'MBR Kubota – màng tấm phẳng ngập (DWA-M 227)';
    const dk = ENG.kubota(S, RL, R), K = R.kub;
    if (m.kub.MLSS > 20) d.warn('MLSS > 20 g/l vượt giới hạn Kubota.', FX('Đặt MLSS = 15 g/l', { 'mbr.kub.MLSS': 15 }));
    Object.assign(R, { mod: K.mod, nFE: K.nU, Areal: K.A, Amem: K.A, fluxAvg: K.Jnet, fluxDes: K.JnetPk, VMBmin: K.Vmb, footprint: K.tankL * K.tankW * m.nTrains, QCF: K.Qair, Pcf: K.Pcf, Pperm: K.Pperm, Hp: K.head, ECF: K.Pcf * 1000 / K.A, O2cf: K.Qair * (m.O2cfSp || 2.5) * Math.max(0.5, K.tankH - 0.8) / 1000 });
    d.rows.push(...dk.rows); d.msgs.push(...dk.msgs);
    d.h('Bể sinh học');
    d.r('Thể tích sinh học cần', 'V_BB', B.V, 'm³', 'MLSS = ' + m.kub.MLSS + ' kg/m³');
    R.Vbio = Math.max(B.V - (m.activeMB ? K.Vmb : 0), B.V * 0.4);
    d.r('Thể tích aerotank (trừ bể màng hoạt động)', 'V', R.Vbio, 'm³');
    d.r('Tuần hoàn bể màng → thiếu khí', 'Q_Rez', m.recir * RL.Qm, 'm³/h', m.recir + '·Q_M');
    R.d = d;
    return R;
  }
  if (m.TS > 15) d.warn('TS > 15 kg/m³: α giảm mạnh, M 227 khuyến nghị 8–12 kg/m³.', FX('Đặt TS = 12 kg/m³', { 'mbr.TS': 12 }));
  { // α theo MLSS (KA Rödingen, Markranstädt – Handbook 7.10.4); M 227: α ≤ 0,5
    const aH = U.interp([[7, 0.7], [9.5, 0.7], [11, 0.65], [14, 0.5], [17, 0.4]], m.TS);
    if (m.alpha > aH + 0.02) d.info('α = ' + m.alpha + ' cao hơn giá trị đo ≈ ' + U.fmt(aH, 2) + ' ở MLSS ' + m.TS + ' g/l (Rödingen/Markranstädt); M 227 khuyến nghị α ≤ 0,5.');
  }
  d.info('Khử trùng: MBR giữ lại phần lớn vi sinh gây bệnh nếu không có dòng tắt, nhưng không bảo đảm – kiểm tra vệ sinh khi tái sử dụng trực tiếp (Handbook 7.10.5).');
  if (m.place === 'in' && S.opt.process === 'ND' && S.opt.dn !== 'pre') d.warn('Module đặt trong bể aerotank: chỉ khả thi tiền khử nitrat.', FX('Đổi sang tiền khử nitrat', { 'opt.dn': 'pre' }), FX('Đặt module ở bể màng riêng', { 'mbr.place': 'ext' }));
  const mod = (m.moduleId && DB.find('membrane', m.moduleId)) || DB.data.membrane[0];
  const Amem = RL.Qm * 1000 / m.flux;
  const nFE = Math.ceil(Amem / mod.Afe / m.nTrains) * m.nTrains;
  const Areal = nFE * mod.Afe;
  const fluxAvg = RL.QtaM * 1000 / Areal;
  const fluxDes = RL.Qm * 1000 / Areal;
  const VMBmin = Areal / mod.pack;
  const footprint = nFE * mod.foot;
  const QCF = m.SADm * Areal;
  const dpCF = m.Hmb * 98.07 + 100;
  // máy thổi khí rửa (cross-flow) & bơm thấm chọn từ ngân hàng (AD 9.1): 1 máy + 1 bơm mỗi dây chuyền
  const nTr = Math.max(1, m.nTrains);
  const cfQ1 = QCF / nTr * (1013.25 / 1000) * ((273.15 + (S.aer.Tair || 30)) / 273.15);   // Nm³/h → m³/h trạng thái hút
  const cfItem = (m.cfBlowerId && DB.find('blower', m.cfBlowerId)) || DB.pickBlower(cfQ1, dpCF);
  const etaCF = cfItem ? (cfItem.type === 'Turbo' ? 0.78 : cfItem.type === 'Trục vít' ? 0.70 : 0.60) : 0.62;
  const Pcf = DB.blowerPower(cfQ1, 1000, dpCF, etaCF) * 1.05 / DB.etaMotor(DB.blowerPower(cfQ1, 1000, dpCF, etaCF)) * nTr;
  const ECF = Pcf * 1000 / Areal;
  const Hp = m.TMP * 10.2 + (m.hLoss ?? 0.5) + (m.hTrans ?? 2.0);   // TMP + tổn thất + chiều cao vận chuyển (Handbook 7.10)
  const fNet = (m.tFilt > 0 && m.tRelax >= 0) ? (m.tFilt + m.tRelax) / m.tFilt : 1;   // lọc – nghỉ: bơm chạy với lưu lượng tức thời lớn hơn
  const Qp1 = RL.Qm / nTr * fNet;
  const permItem = (m.permPumpId && DB.find('perm', m.permPumpId)) || (DB.data.perm && DB.pickPump('perm', Qp1, Hp));
  const etaP = permItem ? permItem.eta : 0.6;
  const Pperm = 9.81 * (Qp1 / 3600) * Hp / etaP * nTr / fNet;   // công suất trung bình (bơm chạy t_lọc/(t_lọc + t_nghỉ))
  // ôxy cấp bởi khí rửa màng (bọt thô ~ 8 g/(Nm³·m))
  const O2cf = QCF * (m.O2cfSp || 2.5) * Math.max(0.5, m.Hmb - (m.hBelow ?? 0.3) - 0.2) / 1000;   // bọt thô: 2,5 g O₂/(Nm³·m) × chiều sâu thổi khí
  Object.assign(R, { mod, Amem, nFE, Areal, fluxAvg, fluxDes, VMBmin, footprint, QCF, dpCF, Pcf, ECF, Hp, Pperm, O2cf, cfItem, cfQ1, permItem, Qp1, fNet });
  d.h('Module màng');
  d.r('Module chọn', '', mod.name, '', mod.Afe + ' m²/khối');
  d.r('Thông lượng thiết kế', 'J_bem', m.flux, 'l/(m²·h)', 'tại Q_M; thực tế 2021: 12–22');
  d.r('Diện tích màng cần', 'A_Mem', Amem, 'm²', 'Q_M/J');
  d.r('Số khối lọc', 'n_FE', nFE, '', m.nTrains + ' dây chuyền');
  d.r('Diện tích màng lắp đặt', 'A', Areal, 'm²');
  d.r('Thông lượng ở Q_M', 'J', fluxDes, 'l/(m²·h)');
  d.r('Thông lượng trung bình năm', 'J_aM', fluxAvg, 'l/(m²·h)', 'M 227: < 10 (2014)');
  d.r('Thể tích bể màng tối thiểu', 'V_MB,min', VMBmin, 'm³', 'A/mật độ ' + mod.pack + ' m²/m³');
  d.r('Diện tích chiếm chỗ', '', footprint, 'm²');
  d.c('Diện tích màng riêng theo mặt bằng', '', Areal / footprint, 'm²/m²', '70 – 180', Areal / footprint >= 70 && Areal / footprint <= 180);
  d.c('Mật độ lắp đặt', 'A_Mem,spez', mod.pack, 'm²/m³', '15 – 75 (lắp đặt)', mod.pack >= 15 && mod.pack <= 75);
  const hReq = (mod.H || 2) + (m.hAbove ?? 0.1) + (m.hBelow ?? 0.3);
  d.r('Chiều sâu nước cần cho module', 'H_req', hReq, 'm', 'H_module + ' + (m.hAbove ?? 0.1) + ' m trên + ' + (m.hBelow ?? 0.3) + ' m dưới');
  if (m.Hmb < hReq - 1e-6) d.warn('Chiều sâu bể màng ' + U.fmt(m.Hmb) + ' m < ' + U.fmt(hReq) + ' m cần cho module.', FX('Đặt chiều sâu bể màng = ' + U.fmt(U.ceilTo(hReq, 0.1)) + ' m', { 'mbr.Hmb': U.ceilTo(hReq, 0.1) }));
  if (m.Hmb < 2.5 || m.Hmb > 5.0) d.info('Chiều sâu bể màng khuyến cáo 2,5 – 5,0 m (Handbook 7.10).');
  if (m.SADm < 0.2 || m.SADm > 0.7) d.info('SAD_m ngoài dải 0,2 – 0,7 Nm³/(m²·h).');
  if (fluxAvg > 10) d.info('M 227 (2014): thông lượng trung bình năm < 10 l/(m²·h) (5 – 6 TB); thực tế 2021: 12 – 22.');
  d.h('Khí rửa màng (cross-flow)');
  d.r('Lưu lượng khí riêng', 'SAD_m', m.SADm, 'Nm³/(m²·h)');
  d.r('Lưu lượng khí rửa', 'Q_CF', QCF, 'Nm³/h');
  d.r('Máy thổi khí rửa (mỗi dây chuyền)', '', cfItem ? cfItem.name + ' (' + cfItem.Pn + ' kW)' : 'không có trong ngân hàng – thêm thiết bị', '', nTr + ' máy × ' + U.fmt(cfQ1) + ' m³/h hút');
  if (cfItem && cfItem.Q > cfQ1 * 1.6) d.info('Máy thổi khí rửa chọn lớn hơn nhiều so với nhu cầu (' + U.fmt(cfItem.Q) + ' / ' + U.fmt(cfQ1) + ' m³/h) – cần biến tần.');
  d.r('Công suất máy thổi rửa', 'P_CF', Pcf, 'kW', 'Δp = ' + U.fmt(dpCF, 0) + ' mbar, η = ' + etaCF);
  d.r('Năng lượng riêng', 'E_CF', ECF, 'Wh/m²');
  d.r('Ôxy cấp từ khí rửa (ước tính)', 'OC_CF', O2cf, 'kg O₂/h', (m.O2cfSp || 2.5) + ' g O₂/(Nm³·m)' + (m.creditCF ? ' – đã trừ vào nhu cầu ôxy sinh học' : ' – chưa trừ (chọn trong form MBR)'));
  d.h('Bơm thấm & tuần hoàn');
  d.r('Cột áp bơm thấm', 'H', Hp, 'm', 'TMP ' + m.TMP + ' bar + tổn thất ' + (m.hLoss ?? 0.5) + ' m + vận chuyển ' + (m.hTrans ?? 2.0) + ' m');
  d.r('Lưu lượng mỗi bơm thấm', 'Q_P', Qp1, 'm³/h', fNet > 1 ? 'Q_M/n · (t_lọc + t_nghỉ)/t_lọc = ' + U.fmt(fNet, 3) : 'Q_M/n');
  d.r('Bơm thấm chọn', '', permItem ? permItem.name + ' (' + permItem.Pn + ' kW)' : 'không có trong ngân hàng', '', nTr + ' làm việc + ' + (m.nPermSb ?? 1) + ' dự phòng');
  d.r('Công suất bơm thấm (trung bình)', 'P', Pperm, 'kW', 'η = ' + U.fmt(etaP, 2));
  d.r('Tuần hoàn bể màng → aerotank', 'Q_Rez', m.recir * RL.Qm, 'm³/h', m.recir + '·Q_M');
  // thể tích sinh học
  const Vbio = B.V - (m.activeMB && m.place === 'ext' ? VMBmin : 0);
  R.Vbio = Math.max(Vbio, B.V * 0.5);
  d.h('Bể sinh học');
  d.r('Thể tích sinh học cần', 'V_BB', B.V, 'm³', 'TS = ' + m.TS + ' kg/m³');
  d.r('Thể tích aerotank (trừ bể màng hoạt động)', 'V', R.Vbio, 'm³');
  R.d = d;
  return R;
};
