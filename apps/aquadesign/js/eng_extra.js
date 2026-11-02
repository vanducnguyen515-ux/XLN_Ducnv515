/* AquaDesign VN – Engine: bể lắng cát, xử lý bùn, chi phí vận hành, đường ống, hiệu suất ôxy,
   khối lượng/đẩy nổi, kiểm tra bể lắng hiện hữu, danh mục thiết bị */
'use strict';

ENG.grit = function (S, RL) {
  const g = S.grit, d = new Rep('Bể lắng cát');
  const R = { type: g.type, n: g.n };
  const PE = S.load.PE || RL.Qd / 0.15;
  const Q1 = RL.Qm / g.n / 3600;
  if (g.type === 'aer') {
    d.h('Bể lắng cát thổi khí' + (g.grease ? ' kèm tách mỡ' : ''));
    const V = Q1 * g.tR * 60;
    const A = Math.max(Q1 / g.vh, V / 50);   // v_h ≤ 0,20 m/s và L ≤ 50 m với t_R ≥ t_R,min
    const T = Math.sqrt(A / g.BT), Bw = g.BT * T;
    const L = U.clamp(Math.max(V / A, 10 * Bw), 0, 50);
    const Vr = A * L;
    // khí: ATV (nhập q_L, đối chiếu bảng Stein theo tiết diện) hoặc Londong (độ sâu thổi khí T_E = 0,7·T; hợp lệ B/T = 0,8)
    const TE0 = 0.7 * T, TE = g.airMode === 'coarse' ? Math.max(2.0, TE0) : g.airMode === 'fine' ? Math.max(1.0, TE0) : TE0, steinMax = A <= 3 ? 0.9 : A <= 5 ? 1.1 : 1.3;
    const qL = g.airMode === 'fine' ? Math.pow(0.63 + 0.52 * Math.log(TE), -0.62) : g.airMode === 'coarse' ? Math.pow(0.07 + 0.76 * Math.log(TE), -1.33) : g.qAir;
    const Qair = qL * Vr;
    Object.assign(R, { A, T, B: Bw, L, V: Vr, Qair, qL });
    d.r('Lưu lượng mỗi ngăn', 'Q', Q1 * 3600, 'm³/h');
    d.r('Vận tốc ngang', 'v_h', g.vh, 'm/s', '≤ 0,20 m/s');
    d.r('Tiết diện ướt', 'A_q', A, 'm²', '1–15 m²');
    d.r('Chiều sâu / rộng', 'T / B', U.fmt(T) + ' / ' + U.fmt(Bw), 'm', 'B/T = ' + g.BT + ' (≤ 0,8 mưa)');
    d.r('Chiều dài', 'L', L, 'm', '≥ 10·B; ≤ 50 m; t_R ≥ ' + g.tR + ' phút');
    d.r('Thời gian lưu thực', 't_R', Vr / Q1 / 60, 'phút');
    d.r('Khí riêng theo thể tích', 'q_L', qL, 'm³/(m³·h)', g.airMode === 'fine' ? 'Londong bọt mịn (0,63 + 0,52·ln T_E)^−0,62, T_E = ' + U.fmt(TE) + ' m' : g.airMode === 'coarse' ? 'Londong bọt thô (0,07 + 0,76·ln T_E)^−1,33, T_E = ' + U.fmt(TE) + ' m' : 'ATV 2.5.1: 0,5–1,3 (0,1–0,2 khi có bio-P/DN); Stein: 0,5 – ' + steinMax + ' cho A_q = ' + U.fmt(A, 1) + ' m²');
    if (TE !== TE0) d.info('Londong: độ sâu thổi khí ' + U.fmt(TE0) + ' m ngoài phạm vi công thức – tính với ' + U.fmt(TE) + ' m.');
    if (g.airMode !== 'fine' && g.airMode !== 'coarse' && (qL > steinMax || qL < 0.1)) d.info('q_L ngoài dải Stein 0,5 – ' + steinMax + ' Nm³/(m³·h) cho tiết diện ' + U.fmt(A, 1) + ' m².');
    if (g.BT > 0.8 + 1e-9) d.warn('B/T = ' + g.BT + ' > 0,8 ở lưu lượng mưa (ATV 2.5.1; mùa khô < 1,0).', FX('Đặt B/T = 0,8', { 'grit.BT': 0.8 }));
    if (A < 1) d.info('Tiết diện < 1 m² – nhỏ hơn dải ATV 1 – 15 m².');
    if (Vr / Q1 / 60 < 10 - 1e-6) d.warn('Thời gian lưu ở Q_M < 10 phút.', FX('Đặt t_R = 10 phút', { 'grit.tR': 10 }));
    d.r('Độ dốc đáy (rãnh cát)', 'β', g.slopeDeg || 40, '°', '35 – 45°; ống khí cao hơn đỉnh rãnh cát 30 cm');
    d.r('Lưu lượng khí mỗi ngăn', 'Q_L', Qair, 'm³/h');
    if (A > 15) d.warn('Tiết diện > 15 m² – tăng số ngăn.', FX('Thêm ngăn', { 'grit.n': Math.ceil(g.n * A / 12) }));
    if (g.grease) {
      const Ag = Q1 * 3600 / 25, bg = Math.max(0.2 * Bw, Ag / L);
      R.bGrease = bg;
      d.r('Bề rộng ngăn tách mỡ', 'b_FF', bg, 'm', 'q_A ≤ 25 m/h; 0,2–0,5·B');
    }
  } else {
    // bể lắng cát tròn (Kalbskopf / ATV): phễu dốc 1:1,5 thiết kế cho toàn bộ Q mùa khô; chỉ ½ thể tích nón cụt có hiệu quả; Q mưa lên phần trụ
    d.h('Bể lắng cát tròn (Kalbskopf 1966 / ATV)');
    const Qd1 = (RL.Qth || RL.Qm) / g.n / 3600, ds = g.dSump || 0.8, tRd = g.tRdry || 40, tRr = g.tRrain || 25;
    const frus = D => { const hf = (D - ds) / 2 / 1.5; return Math.PI / 12 * hf * (D * D + D * ds + ds * ds); };
    const D = g.Dv > 0 ? g.Dv : U.ceilTo(U.bisect(D => 0.5 * frus(D) - Qd1 * tRd, ds + 0.1, 20, 1e-4), 0.1);
    const hf = (D - ds) / 2 / 1.5, Vf = 0.5 * frus(D), Ac = Math.PI * D * D / 4;
    const hc = Math.max(0.3, (Q1 * tRr - Vf) / (0.5 * Ac));
    const V = Vf + 0.5 * Ac * hc;
    Object.assign(R, { D, V, hf, hc, ds });
    d.r('Đường kính', 'D', D, 'm', 'phễu dốc 1 : 1,5, hố cát Ø ' + ds + ' m');
    d.r('Chiều cao phễu', 'h_T', hf, 'm');
    d.r('Chiều cao phần trụ (mưa)', 'h_Z', hc, 'm');
    d.r('Thời gian lưu mùa khô', 't_R,T', Vf / Qd1, 's', '30 – 45 s (½ thể tích nón cụt)');
    d.r('Thời gian lưu ở Q_M', 't_R,M', V / Q1, 's', '> 25 s');
    d.r('Tiết diện kênh vào cần', 'A_zu', Q1 / (g.vIn || 0.6), 'm²', 'v_zu ≤ ' + (g.vIn || 0.6) + ' m/s (Kalbskopf 0,5 – 0,6; ATV 0,75 – 1,0)');
    d.r('Tiết diện kênh ra cần', 'A_ab', Q1 / (g.vOut || 0.5), 'm²', 'v_ab ≤ ' + (g.vOut || 0.5) + ' m/s; đáy ra cao hơn đáy vào 10 – 15 cm');
    if (Vf / Qd1 < 30 || Vf / Qd1 > 45) d.info('Thời gian lưu mùa khô ngoài 30 – 45 s.');
    if (V / Q1 < 25 - 1e-6) d.warn('Thời gian lưu ở Q_M < 25 s.', FX('Tự tính đường kính / tăng t_R mưa 30 s', { 'grit.Dv': 0, 'grit.tRrain': 30 }));
    d.r('Khí sục hố cát (vòng sục)', 'Q_L', 30, 'm³/h', 'liên tục hoặc trước khi hút cát');
    R.Qair = 30;
  }
  // hút cát bằng airlift: độ sâu thổi khí ≥ chiều cao nâng trên mặt nước + 1 % chiều dài ống (Handbook 7.13)
  if (g.extract === 'airlift') { const hReq = (g.hLift || 1.5) + 0.01 * (g.lLift || 10); d.r('Độ sâu thổi khí airlift cần', 'h_E', hReq, 'm', 'h_nâng ' + (g.hLift || 1.5) + ' m + 0,01·L ' + (g.lLift || 10) + ' m'); R.hAirlift = hReq; }
  R.sand = PE * g.sandSp / 1000 / 365; R.greaseQ = g.grease ? PE * g.greaseSp / 1000 / 365 : 0;
  d.r('Lượng cát', '', R.sand, 'm³/d', g.sandSp + ' l/(PE·a)');
  if (g.grease) d.r('Lượng mỡ', '', R.greaseQ, 'm³/d', g.greaseSp + ' l/(PE·a)');
  d.r('Hỗn hợp cát–nước hút', 'Q_S', R.sand * 1500 / 50, 'm³/d', '5 % cát (50 kg/m³)');
  const qE = g.qExt || 30;
  R.tExt = R.sand * 1500 / 50 / qE;
  d.r('Thời gian hút cát', 't_ext', R.tExt, 'h/d', 'Q_S/' + qE + ' m³/h (' + { airlift: 'airlift', pump: 'bơm ly tâm', screw: 'vít tải' }[g.extract || 'airlift'] + ')');
  if (g.qClass > 0 && g.qClass < qE) d.warn('Công suất máy tách cát ' + g.qClass + ' m³/h < công suất hút ' + qE + ' m³/h.', FX('Công suất máy tách = ' + qE + ' m³/h', { 'grit.qClass': qE }));
  R.d = d;
  return R;
};

ENG.sludge = function (S, RL, B, RS) {
  const s = S.sludge, d = new Rep('Xử lý bùn');
  const R = {};
  const US = B ? B.US : 0;
  const TSUS = RS && RS.TSRS ? RS.TSRS : (B ? B.TS : 8);
  const PS = RL.prim.on ? RL.prim.sludgeTS : 0;
  let Q = US / TSUS + (PS ? PS / 25 : 0), M = US + PS;
  const oTS = PS * 0.67 + US * (S.opt.stab ? 0.65 : 0.7);   // M 368 Bảng 3: PS 0,67; ÜS 0,70 (t_TS 15 d) / 0,65 (t_TS 25 d, không lắng sơ cấp)
  R.US = US; R.PS = PS; R.M0 = M; R.Q0 = Q; R.oTS = oTS;
  d.h('Bùn phát sinh');
  d.r('Bùn dư', 'ÜS_d', US, 'kg TS/d', U.fmt(US / TSUS) + ' m³/d');
  if (PS) d.r('Bùn sơ cấp', 'PS_d', PS, 'kg TS/d', U.fmt(PS / 25) + ' m³/d (2,5 %)');
  d.r('Chất hữu cơ', 'oTS', oTS, 'kg/d', 'oTR/TR: PS 0,67; ÜS ' + (S.opt.stab ? '0,65 (ổn định)' : '0,70') + ' (M 368 Bảng 3)');
  R.supQ = 0;
  if (s.thick.on && s.thick.mode === 'sep' && PS) {
    // nén riêng (M 368): bùn sơ cấp nén trọng lực, bùn dư nén cơ học → Q_TW = PS/TS_PS1 − PS/TS_PS2; Q_MS = PS/TS_PS2 + ÜS/TS_ÜS2; TS_MS = MS/Q_MS
    const t = s.thick, TSPS1 = 25, TSPS2 = t.TSps || 60, TSUS2 = t.TSus || 60;
    const QTW = PS / TSPS1 - PS / TSPS2, QUS0 = US / TSUS, QUS2 = US / TSUS2, QMS = PS / TSPS2 + QUS2, TSMS = M / QMS, V = PS / TSPS1 * t.tR;
    R.thick = { V, Qo: QMS, sup: QTW + (QUS0 - QUS2), D: U.ceilTo(Math.sqrt(4 * V / t.n / Math.PI / t.H), 0.5), sep: true, TSMS };
    d.h('Nén bùn riêng (M 368): sơ cấp trọng lực + bùn dư cơ học');
    d.r('Bể nén bùn sơ cấp', 'V', V, 'm³', 't_R ' + t.tR + ' d; ' + t.n + ' bể D = ' + U.fmt(R.thick.D) + ' m');
    d.r('TS bùn sơ cấp sau nén', 'TS_PS2', TSPS2, 'kg/m³', 'bùn sơ cấp đến 8 % sau 1 d');
    d.r('Nước tách bùn sơ cấp', 'Q_TW', QTW, 'm³/d', 'PS/TS_PS1 − PS/TS_PS2');
    d.r('TS bùn dư sau nén cơ học', 'TS_ÜS2', TSUS2, 'kg/m³', 'bùn hoạt tính 1 – 5 %; ATS 3 – 5 %');
    d.r('Nước tách bùn dư', 'Q_TW,ÜS', QUS0 - QUS2, 'm³/d');
    d.r('Bùn hỗn hợp', 'Q_MS', QMS, 'm³/d', 'PS/TS_PS2 + ÜS/TS_ÜS2; MS = ' + U.fmt(M) + ' kg/d');
    d.r('TS bùn hỗn hợp', 'TS_MS', TSMS, 'kg/m³', 'MS_d/Q_MS (hỗn hợp 3 – 7 %)');
    R.supQ += R.thick.sup; Q = QMS;
  } else if (s.thick.on) {
    const t = s.thick, V = Q * t.tR, Qo = M / t.TS;
    R.thick = { V, Qo, sup: Q - Qo, D: U.ceilTo(Math.sqrt(4 * V / t.n / Math.PI / t.H), 0.5) };
    d.h('Bể nén bùn trọng lực');
    d.r('Thời gian lưu', 't_R', t.tR, 'd'); d.r('Thể tích', 'V', V, 'm³', t.n + ' bể D = ' + U.fmt(R.thick.D) + ' m, H = ' + t.H + ' m');
    d.r('TS sau nén', 'TS', t.TS, 'kg/m³', 'bùn hoạt tính 10–50; hỗn hợp 30–70');
    d.r('Bùn sau nén', 'Q', Qo, 'm³/d'); d.r('Nước tách', 'Q_TW', Q - Qo, 'm³/d');
    R.supQ += Q - Qo; Q = Qo;
  }
  if (s.dig.on) {
    const g = s.dig, V = Q * g.tR;
    const BR = oTS / V, gas = oTS * g.gasSp;
    const fOn = 1 - (g.down || 0), E = gas * g.kWhgas, Eel = E * g.etaEl * fOn, Eth = E * g.etaTh * fOn, heatNeed = Eth * g.heatSelf;
    const Mout = M - oTS * g.deg;
    const n = Math.max(1, Math.ceil(V / 12000));
    const Dd = Math.cbrt(4 * V / n / Math.PI / g.H2D);
    R.dig = { V, n, D: Dd, BR, gas, E, Eel, Eth, heatNeed, Mout, mixP: V * 0.008 };
    d.h('Phân hủy kỵ khí');
    // Bảng 4.2-10 (Handbook 11.3): t_R / B_R,oTS theo quy mô; +20 % thể tích khi có kết tủa hóa học / xử lý nước mưa
    const PEd = S.load.PE || RL.Qd / 0.15, tRec = PEd < 50000 ? 20 : PEd <= 100000 ? 17.5 : 15, BRmax = PEd < 50000 ? 2.0 : PEd <= 100000 ? 3.5 : 5.0;
    const tReq = tRec * (S.bio.pChem ? 1.2 : 1);
    d.r('Thời gian lưu', 't_R', g.tR, 'd', 'Bảng 4.2-10: ' + U.fmt(tRec, 1) + ' d (' + (PEd < 50000 ? '< 50.000' : PEd <= 100000 ? '50.000–100.000' : '> 100.000') + ' PE)' + (S.bio.pChem ? ' ×1,2 do kết tủa hóa học' : ''));
    if (g.tR < tReq - 1e-6) d.warn('Thời gian lưu bể phân hủy ' + U.fmt(g.tR) + ' d < ' + U.fmt(tReq, 1) + ' d khuyến cáo (Handbook Bảng 4.2-10' + (S.bio.pChem ? ', +20 % khi kết tủa hóa học' : '') + ').', FX('Đặt t_R = ' + U.fmt(U.ceilTo(tReq, 0.5)) + ' d', { 'sludge.dig.tR': U.ceilTo(tReq, 0.5) }));
    d.r('Thể tích bể phân hủy', 'V_F', V, 'm³', n + ' bể, D ≈ ' + U.fmt(Dd) + ' m (≤ 10.000–15.000 m³/bể)');
    d.r('Tải trọng hữu cơ', 'B_R,oTS', BR, 'kg oTS/(m³·d)', '2–3,5 (≤ 5)');
    if (BR > BRmax) d.warn('Tải trọng hữu cơ bể phân hủy ' + U.fmt(BR) + ' > ' + BRmax + ' kg oTS/(m³·d) (Bảng 4.2-10 theo quy mô).', FX('Tăng t_R để B_R = ' + BRmax, { 'sludge.dig.tR': U.ceilTo(g.tR * BR / BRmax, 0.5) }));
    d.r('Khí sinh học riêng theo PE', 'q_Gas', gas / PEd * 1000, 'l/(PE·d)', 'đối chiếu M 363 Bảng 5: 4,4 (t_TS ≥ 25 d) … 20,7 (t_TS 8 d, có lắng sơ cấp)');
    d.r('Khí sinh học', 'Q_Gas', gas, 'm³/d', g.gasSp + ' m³/kg oTS nạp');
    d.r('Năng lượng khí', 'E', E, 'kWh/d', g.kWhgas + ' kWh/m³ (60–70 % CH₄)');
    d.r('Điện CHP', 'E_el', Eel, 'kWh/d', 'η_el = ' + g.etaEl + (g.down ? '; dừng máy ' + U.fmt(g.down * 100, 0) + ' %' : ''));
    d.r('Nhiệt CHP', 'E_th', Eth, 'kWh/d', 'tự dùng gia nhiệt ' + g.heatSelf * 100 + ' %');
    d.r('Bùn sau phân hủy', 'M', Mout, 'kg TS/d', 'phân hủy ' + g.deg * 100 + ' % oTS');
    d.r('Khuấy trộn', 'P', R.dig.mixP, 'kW', '5–15 W/m³');
    M = Mout;
  }
  if (s.aerob.on) {
    const a = s.aerob, thermo = a.mode === 'thermo';
    const tR = thermo ? Math.max(5, Math.min(a.tR, 10)) : a.tR;
    const V = Q * tR, O2 = a.OC * V;
    const hD = 4.0, QL = O2 / 24 * 1000 / (a.alpha * S.aer.SSOTR * hD);
    const NR = thermo ? 100 : 50, P = NR * V / 1000;
    R.aerob = { V, tR, O2, QL, P, thermo };
    if (!thermo && a.TS && (a.TS < 30 || a.TS > 40)) d.info('Ổn định hiếu khí thường: TS khuyến cáo 3 – 4 % (M 368).');
    d.h(thermo ? 'Ổn định hiếu khí ưa nhiệt (ATS)' : 'Ổn định hiếu khí riêng');
    d.r('Thời gian lưu', 't_R', tR, 'd', thermo ? '≥ 5 d' : '≥ 20 d (T ≥ 10 °C)');
    d.r('Thể tích', 'V', V, 'm³');
    d.r('Nhu cầu ôxy', 'OC', O2, 'kg O₂/d', a.OC + ' kg O₂/(m³·d)');
    d.r('Lưu lượng khí', 'Q_L', QL, 'Nm³/h', 'α = ' + a.alpha);
    if (thermo) {   // M 368 / Handbook 11.4: Q_L = 1,2·3,367·COD_roh·α_CSB·V_R/(ΔO₂·t_A·24); COD_roh ≈ 1,6 kg/kg TS; ΔO₂ hiệu suất sử dụng O₂
      const CODraw = 1.6 * (a.TS || 35), QLats = 1.2 * 3.367 * CODraw * (a.degCOD || 0.3) * V / ((a.dO2 || 0.1) * tR * 24);
      d.r('Lưu lượng khí ATS (theo COD)', 'Q_L,ATS', QLats, 'm³/h', '1,2·3,367·COD_roh·α_COD·V_R/(ΔO₂·t_A·24); α_COD ' + (a.degCOD || 0.3) + ', ΔO₂ ' + (a.dO2 || 0.1));
      R.aerob.QLats = QLats;
    }
    d.r('Công suất sục khí/khuấy', 'P', P, 'kW', NR + ' W/m³');
    M = M - oTS * 0.3;
  }
  if (s.tank.on) {
    const t = s.tank, Qs = M / t.TS, V = Qs * t.t;
    const H0 = Math.min(6, 0.5 * Math.cbrt(8 * V / t.n / Math.PI));
    const Dd = t.D > 0 ? t.D : U.ceilTo(Math.sqrt(4 * V / t.n / Math.PI / H0), 0.5);
    const H = V / t.n / (Math.PI * Dd * Dd / 4);
    R.tank = { Qs, V, D: Dd, H, P: V * t.wMix / 1000 / t.n, sup: Math.max(0, Q - Qs) };
    d.h('Bể chứa bùn');
    d.r('Thời gian chứa', 't', t.t, 'd', '90 d (nông nghiệp) – 180 d trạm nhỏ – 20 d khi có tách nước');
    d.r('TS trong bể chứa', 'TS', t.TS, 'kg/m³', '≤ 50 trọng lực; ≈ 80 nén cơ học');
    d.r('Thể tích', 'V', V, 'm³', t.n + ' bể, D = ' + U.fmt(Dd) + ' m, H = ' + U.fmt(H) + ' m');
    d.r('Máy khuấy mỗi bể', 'P', R.tank.P, 'kW', t.wMix + ' W/m³ (gián đoạn)');
    if (H > 8) d.warn('Chiều cao bể chứa bùn > 8 m – tăng đường kính hoặc số bể.', FX('Thêm 1 bể chứa', { 'sludge.tank.n': t.n + 1, 'sludge.tank.D': 0 }), FX('Tự tính đường kính', { 'sludge.tank.D': 0 }));
  }
  if (s.dew.on) {
    const cake = M / (s.dew.TS * 10), Qdin = R.tank ? R.tank.Qs : Q;
    R.dew = { cake, Qin: Qdin, sup: Math.max(0, Qdin - cake) };
    d.h('Tách nước bùn');
    d.r('TS bánh bùn', 'TS', s.dew.TS, '%', '24–40 %');
    d.r('Bánh bùn', '', cake, 'm³/d ≈ t/d');
    R.supQ += Math.max(0, Q - cake);
  }
  R.Mfinal = M;
  // nước tách hoàn lưu về đầu vào (Handbook 11, 15.4.4): loại 1 = nước nén/lắng (bể nén, bể chứa), loại 2 = nước tách nước cơ học
  R.supT = (R.thick ? R.thick.sup : 0) + (R.tank ? R.tank.sup : 0); R.supD = R.dew ? R.dew.sup : 0;
  d.r('Nước tách hoàn lưu – nén/lắng', 'Q_SI,1', R.supT, 'm³/d', 'bể nén + bể chứa bùn');
  d.r('Nước tách hoàn lưu – tách nước', 'Q_SI,2', R.supD, 'm³/d', R.dig ? 'sau phân hủy (NH₄ cao)' : '');
  R.disposal = s.dew.on ? R.dew.cake * 365 : (M / ((s.tank.on ? s.tank.TS : 40) / 1000)) / 1000 * 365; // t/a ướt
  d.r('Bùn đi thải bỏ', '', R.disposal, 't/năm (ướt)', U.fmt(M * 365 / 1000) + ' t TS/năm');
  // cân bằng bùn bể lắng
  if (RS && RS.TSBS && B) {
    const QRS = RS.QRS || S.sst.RV * RL.Qm;
    const TSAT = B.TS, TSBS = RS.TSBS, TSRS = RS.TSRS;
    const QSR = QRS * (TSRS - TSAT) / (TSBS - TSAT), Qsh = QRS - QSR;
    R.bal = { QRS, QSR, Qsh };
    d.h('Cân bằng bùn bể lắng II');
    d.r('Lưu lượng gạt/hút bùn', 'Q_SR', QSR, 'm³/h', 'Q_RS·(TS_RS − TS_BB)/(TS_BS − TS_BB)');
    d.r('Dòng ngắn mạch', 'Q_Kurz', Qsh, 'm³/h', 'Q_RS − Q_SR');
  }
  R.d = d;
  return R;
};

/* ---------- Đường ống ---------- */
ENG.pipes = function (S, R) {
  const p = S.pipes, d = new Rep('Đường kính đường ống (theo vận tốc)');
  const L = R.load, list = [];
  const add = (name, Qh, v) => {
    const dm = Math.sqrt(4 * Qh / 3600 / Math.PI / v) * 1000;
    list.push({ name, Q: Qh, v, d: dm, DN: U.dnUp(dm) });
    d.r(name, 'DN', U.dnUp(dm), '', 'Q = ' + U.fmt(Qh) + ' m³/h, v = ' + v + ' m/s, d = ' + U.fmt(dm, 0) + ' mm');
  };
  d.h('Nước');
  add('Ống dẫn vào', L.Qm, p.vW);
  if (R.sst) {
    add('Ống aerotank → bể lắng (mỗi bể)', L.Qm * (1 + S.sst.RV) / R.sst.n, p.vSiphon);
    add('Ống nước ra (mỗi bể lắng)', L.Qm / R.sst.n, p.vW);
  }
  if (R.rs) {
    add('Ống bùn tuần hoàn (tổng)', R.rs.QRS, p.vSludge);
    if (R.rs.rz) add('Ống tuần hoàn nội (mỗi bơm)', R.rs.rz.Q1, p.vW);
    if (R.rs.es) add('Ống bùn dư', R.rs.es.q1 * R.rs.es.n, p.vSludge);
  }
  if (R.aer && R.aer.blow) {
    d.h('Khí');
    const b = R.aer.blow, Qp = b.Q1 * b.p1 / (b.p1 + b.dp) * 1.25;
    add('Ống khí chính (thực, sau máy thổi)', Qp, p.vAir);
    add('Ống góp mỗi bể', Qp / (R.tank ? R.tank.n : 1), p.vAir * 0.8);
    add('Ống nhánh mỗi lưới', Qp / (R.tank ? R.tank.n : 1) / Math.max(1, (R.aer.grid && R.aer.grid.nL) || 4), p.vAir * 0.6);
  }
  return { list, d };
};

/* ---------- Hiệu suất ôxy ---------- */
ENG.o2eff = function (S, R) {
  const d = new Rep('Hiệu suất ôxy (DWA-M 209)');
  const a = R.aer; if (!a) return null;
  let OC, P;
  if (a.blow) {
    OC = a.QL * (S.aer.SSOTRop > 0 ? S.aer.SSOTRop : a.SSOTR) * a.hD / 1000;   // SSOTR vận hành có thể khác thiết kế (Handbook 12.5)
    P = a.blow.Pel * a.blow.n + (a.mix ? a.mix.P : 0);
  } else { OC = a.SOTR; P = a.surf.Ptot + (a.mix ? a.mix.P : 0); }
  const SAE = OC / P;
  d.r('Khả năng cấp ôxy nước sạch', 'OC', OC, 'kg O₂/h');
  d.r('Công suất tiêu thụ (máy thổi + khuấy)', 'P', P, 'kW');
  d.r('Hiệu suất cấp ôxy', 'SAE', SAE, 'kg O₂/kWh', 'khí nén mịn 2–4; bề mặt 1,6–2,0');
  return { OC, P, SAE, d };
};

/* ---------- Chi phí vận hành ---------- */
ENG.cost = function (S, R) {
  const c = S.cost, d = new Rep('Chi phí vận hành');
  const L = R.load, PE = S.load.PE || L.Qd / 0.15;
  const E = [];
  let stage = 'Sinh học';
  const add = (name, kW, h) => { if (kW > 0) E.push({ name, kW, h, kWhd: kW * h, stage }); };
  // AD 9.1: vận chuyển theo năng lượng riêng e_SPEZ [Wh/(m³·m)] × cột áp × lưu lượng trung bình
  const P = [], es = Object.assign({}, DEF.project().cost.espez, c.espez || {});
  const addP = (name, type, e, H, Qh) => { if (Qh > 0 && H > 0) { const kWhd = e * H * Qh * 24 / 1000; P.push({ name, type, e, H, Qh, kWhd }); E.push({ name: name + ' (e_SPEZ)', kW: kWhd / 24, h: 24, kWhd, stage: 'Vận chuyển', pump: true }); } };
  const a = R.aer, sp = c.pumpCalc !== 'power';   // sp: tính bơm theo e_SPEZ (AD 9.1); 'power' = theo công suất bơm đã chọn
  const mc = Object.assign({}, DEF.project().cost.mach, c.mach || {});
  const fAvg = L.QtaM / L.Qm;
  // Q trung bình đầu vào: Q_t,aM (cống riêng); Q_t,aM + n_R·(Q_M − Q_t,aM) (cống chung, n_R = tỷ lệ ngày mưa)
  const Qin = S.opt.sewer === 'comb' ? L.QtaM + (c.nR || 0) * Math.max(0, L.Qm - L.QtaM) : L.QtaM;
  // ---- vận chuyển ----
  if (S.comp.inletPS) {
    if (sp) addP('Trạm bơm đầu vào', { cent: 'bơm ly tâm', screw: 'bơm trục vít', airlift: 'airlift' }[c.pumpType || 'cent'], c.pumpType === 'screw' ? es.screw : es.inlet, c.hInlet, Qin);
    else { stage = 'Vận chuyển'; const eta = c.etaP > 0 && c.pumpType === 'cent' ? c.etaP : { cent: 0.65, screw: 0.75, airlift: 0.45 }[c.pumpType] || 0.65;
      add('Trạm bơm đầu vào (' + { cent: 'ly tâm', screw: 'trục vít', airlift: 'airlift' }[c.pumpType || 'cent'] + ', η ' + U.fmt(eta, 2) + ')', 9.81 * Qin / 3600 * c.hInlet / eta, 24); }
  }
  if (S.comp.intPS) addP('Trạm bơm trung gian', 'bơm ly tâm', es.inter, c.hInter, Qin);
  if (R.rs) {
    const QRSm = R.ctech ? R.rs.QRS * S.ct.TFA / R.ctech.TC : R.rs.QRS * (S.opt.line === 'CAS' || S.opt.line === 'MBR' ? fAvg : 1);
    if (sp && R.rs.type !== 'air' && R.rs.QRS) addP(S.opt.line === 'MBR' ? 'Tuần hoàn bể màng' : 'Bùn tuần hoàn', R.rs.type === 'screw' ? 'bơm trục vít' : 'bơm ly tâm', R.rs.type === 'screw' ? es.screw : es.ras, R.rs.H || S.rs.H, QRSm);
    else { stage = 'Vận chuyển'; add('Bùn tuần hoàn' + (R.rs.type === 'air' ? ' (khí nâng)' : ''), (R.rs.Ptot || 0) * (R.ctech ? 1 : 0.8), R.ctech ? 24 * S.ct.TFA / R.ctech.TC : 24); }
    if (R.rs.rz) { if (sp) addP('Tuần hoàn nội', 'bơm chân vịt', es.recirc, c.hRecirc, R.rs.rz.Q); else { stage = 'Vận chuyển'; add('Bơm tuần hoàn nội', R.rs.rz.P, 24); } }
    if (R.rs.es) { if (sp) addP('Bùn dư', 'bơm ly tâm', es.was, S.rs.esH, R.rs.es.Qd / 24); else { stage = 'Vận chuyển'; add('Bơm bùn dư', R.rs.es.P, R.rs.es.hours); } }
  }
  if (L.prim.on && R.sludge && R.sludge.PS) addP('Bùn sơ cấp', 'bơm ly tâm', es.ps, c.hPS, R.sludge.PS / 25 / 24);
  if (R.sludge && R.sludge.dig) addP('Bùn tươi (cấp bể phân hủy)', 'bơm trục vít xoắn', es.raw, c.hRaw, (R.sludge.thick ? R.sludge.thick.Qo : R.sludge.Q0) / 24);
  if (R.sludge && (R.sludge.supT + R.sludge.supD) > 0) addP('Nước tách bùn', 'bơm ly tâm', es.sup, c.hSup, (R.sludge.supT + R.sludge.supD) / 24);
  // ---- cơ học ----
  stage = 'Xử lý cơ học';
  if (S.comp.screenC || S.comp.screenF) add('Song chắn rác' + (S.comp.screenF ? ' + máy ép' : ''), mc.screen.P * ((S.comp.screenC ? 1 : 0) + (S.comp.screenF ? 1 : 0)), mc.screen.h);
  if (R.grit && R.grit.type === 'aer') add('Máy thổi bể lắng cát', DB.blowerPower(R.grit.Qair * R.grit.n, 1000, R.grit.T * 98 + 100, 0.55), mc.gritBlow.h);
  if (R.grit) {
    add('Bơm airlift cát', mc.airlift.P * R.grit.n, mc.airlift.h);
    add('Máy tách – rửa cát', mc.classifier.P, mc.classifier.h);
    if (S.grit.grease) add('Thiết bị gạt mỡ', mc.grease.P * R.grit.n, mc.grease.h);
    add('Cầu cào bể lắng cát', mc.scraper.P * R.grit.n, mc.scraper.h);
  }
  stage = 'Lắng sơ cấp';
  if (L.prim.on) add('Thiết bị gạt bùn lắng sơ cấp', mc.primScr.P * (L.prim.n || 1), mc.primScr.h);
  // ---- sinh học ----
  stage = 'Sinh học';
  if (a) {
    // Handbook 12.2: máy thổi chạy theo tải ôxy trung bình (không hệ số đỉnh): t_L,vh = Q_L,vh/(Q_L,máy·n) ≤ 24 h/d
    const mean = a.cases && (a.cases.find(x => x.no === 1) || a.cases.find(x => x.lab === 'trung bình' && x.T === (R.bio && R.bio.T)) || a.cases.find(x => x.lab === 'trung bình'));
    const tRun = c.blowMode === 'mean' && mean && a.des.SOTR > 0 ? Math.min(24, mean.SOTR * (mean.tA || a.tA) / a.des.SOTR) : 0.75 * a.tA;
    const note = c.blowMode === 'mean' && mean ? 'tải TB (' + (mean.no === 1 ? 'TH 1' : 'f = 1') + ')' : '0,75·t_N';
    if (a.blow) { add('Máy thổi khí aerotank (' + note + ')', a.blow.Pel * a.blow.n, tRun); E[E.length - 1].eff = a.des.SOTR / Math.max(1e-9, a.blow.Pel * a.blow.n); }
    if (a.surf) add('Máy sục khí bề mặt (' + note + ')', a.surf.Ptot, tRun);
    if (a.mix) add('Máy khuấy', a.mix.P, S.opt.process === 'ND' && S.opt.dn === 'int' ? 24 - a.tA + 2 : 24);
  }
  if (R.iceas && R.iceas.cycle !== 'NIT') add('Máy khuấy ICEAS (pha Air-Off)', S.ic.Pmix * R.iceas.nb, R.iceas.ci.v[1] * R.iceas.ci.n / 60);
  if (R.mbr) {
    stage = 'Màng MBR';
    add('Máy thổi khí rửa màng (cross-flow)', R.mbr.Pcf, 24);
    if (sp && R.mbr.Hp > 0) { addP('Bơm nước thấm', 'bơm thấm', es.perm, R.mbr.Hp, L.QtaM); }
    else add('Bơm thấm', R.mbr.Pperm * fAvg, 24);
  }
  stage = 'Bể lắng II';
  if (R.sst && !R.sst.hop) add('Cầu gạt / hút bùn bể lắng II', mc.sstScr.P * R.sst.n, mc.sstScr.h);
  if (R.sst && !R.sst.hop && S.comp.scum) add('Bơm váng bể lắng II', mc.scum.P * R.sst.n, mc.scum.h);
  // ---- bùn ----
  if (R.sludge) {
    const sl = R.sludge;
    stage = 'Nén bùn';
    if (sl.thick) add(S.sludge.thick.drive === 'mixer' ? 'Khuấy bể nén bùn' : 'Cào bể nén bùn', (S.sludge.thick.drive === 'mixer' ? 0.75 : 0.37) * S.sludge.thick.n, 24);
    if (sl.thick && sl.thick.sep) E.push({ name: 'Nén bùn dư cơ học (' + es.mth + ' Wh/kg TS)', kW: sl.US * es.mth / 1000 / 24, h: 24, kWhd: sl.US * es.mth / 1000, stage });
    if (sl.thick && S.sludge.thick.pcPump && sl.dig && !sp) add('Bơm trục vít xoắn cấp bể phân hủy', 2.2, Math.min(24, sl.thick.Qo / 5));
    stage = 'Ổn định bùn';
    if (sl.dig) add('Khuấy bể phân hủy', sl.dig.mixP, 20);
    if (sl.aerob) add('Ổn định hiếu khí riêng', sl.aerob.P, 24);
    stage = 'Chứa & tách nước bùn';
    if (sl.tank) { add('Khuấy bể chứa bùn', sl.tank.P * S.sludge.tank.n, mc.sMix.h); if (!sp) add('Bơm bể chứa bùn (xả nước)', mc.sPump.P, mc.sPump.h); }
    if (sl.dew) E.push({ name: 'Tách nước bùn (' + es.dew + ' Wh/kg TS)', kW: sl.Mfinal * es.dew / 1000 / 24, h: 24, kWhd: sl.Mfinal * es.dew / 1000, stage });
  }
  stage = 'Khác';
  const other = c.otherkWhPE * PE / 365;
  E.push({ name: 'Thiết bị khác (chiếu sáng, nhà điều hành, đo lường…)', kW: other / 24, h: 24, kWhd: other, stage });
  const kWhd = E.reduce((s, e) => s + e.kWhd, 0);
  const kWha = kWhd * 365;
  let costE = kWha * c.el;
  if (P.length) {
    d.h('Vận chuyển – năng lượng riêng e_SPEZ');
    for (const p of P) d.r(p.name, '', p.kWhd * 365, 'kWh/năm', p.type + '; ' + U.fmt(p.e, 1) + ' Wh/(m³·m) × ' + U.fmt(p.H, 2) + ' m × ' + U.fmt(p.Qh, 2) + ' m³/h');
  }
  const stages = [...new Set(E.filter(e => !e.pump).map(e => e.stage))];
  for (const st of stages) {
    d.h('Thiết bị khác – ' + st);
    for (const e of E.filter(x => !x.pump && x.stage === st)) d.r(e.name, '', e.kWhd * 365, 'kWh/năm', U.fmt(e.kW) + ' kW × ' + U.fmt(e.h, 1) + ' h/d' + (e.eff ? '; ' + U.fmt(e.eff, 2) + ' kg O₂/kWh ở tải thiết kế' : ''));
  }
  d.h('Điện năng – tổng hợp');
  const byStage = {};
  for (const e of E) byStage[e.stage || 'Khác'] = (byStage[e.stage || 'Khác'] || 0) + e.kWhd * 365;
  for (const [st, v] of Object.entries(byStage)) d.r(st, '', v, 'kWh/năm', U.fmt(v / kWha * 100, 1) + ' %');
  d.r('Tổng điện năng', 'E', kWha, 'kWh/năm', U.fmt(kWha / PE, 1) + ' kWh/(PE·năm); ' + U.fmt(kWha / (L.Qd * 365), 3) + ' kWh/m³');
  d.r('Chi phí điện', '', costE, c.currency + '/năm', U.fmt(c.el, 0) + ' ' + c.currency + '/kWh');
  // bùn & chất thải
  d.h('Thải bỏ bùn & rác');
  const sludgeT = R.sludge ? R.sludge.disposal : (R.bio ? R.bio.US * 365 / 1000 / 0.05 : 0);
  const items = [
    ['Bùn thải', sludgeT, 't/năm', c.sludgePrice],
    ['Rác song chắn' + (c.screenPress === false ? ' (chưa ép)' : ' (sau ép)'), S.comp.screenF || S.comp.screenC ? PE * c.screenSp * (c.screenPress === false ? 2 : 1) / 1000 : 0, 'm³/năm', c.screenPrice],
    ['Cát', S.comp.grit || (R.grit) ? PE * c.gritSp / 1000 : 0, 'm³/năm', c.gritPrice],
    ['Mỡ', R.grit && S.grit.grease ? PE * c.greaseSp / 1000 : 0, 'm³/năm', c.greasePrice],
  ];
  let costS = 0;
  for (const [n, q, u, pr] of items) if (q > 0) { costS += q * pr; d.r(n, '', q, u, U.fmt(q * pr) + ' ' + c.currency + '/năm'); }
  d.r('Tổng chi phí thải bỏ', '', costS, c.currency + '/năm');
  // hóa chất
  d.h('Hóa chất');
  let costC = 0;
  if (R.bio && R.bio.Fe > 0) { const kg = R.bio.Fe / R.bio.prec.pct * 365; costC += kg * c.FePrice; d.r(R.bio.prec.name, '', kg, 'kg/năm', U.fmt(kg * c.FePrice) + ' ' + c.currency); }
  if (R.bio && R.bio.Cdos_kg > 0) { const kg = R.bio.Cdos_kg * 365; costC += kg * c.CPrice; d.r('Nguồn carbon (' + R.bio.ce.name + ')', '', kg, 'kg/năm', U.fmt(kg * c.CPrice) + ' ' + c.currency); }
  d.r('Tổng hóa chất', '', costC, c.currency + '/năm');
  // nhân sự
  d.h('Nhân sự');
  const staff = c.staff > 0 ? c.staff : Math.max(1, Math.round(U.interp([[2000, 0.5], [10000, 2], [50000, 6], [100000, 10], [250000, 18], [1000000, 45]], PE)));
  const costP = staff * c.salary * c.hd / 8;
  d.r('Số nhân sự', 'P_n', staff, 'người', c.staff > 0 ? '' : 'ATV FA 2.12 (ước tính theo quy mô)');
  d.r('Chi phí nhân sự', 'P_a', costP, c.currency + '/năm', U.fmt(c.salary, 0) + '/người·năm × ' + c.hd + '/8 h');
  // lợi ích CHP
  let benefit = 0;
  if (R.sludge && R.sludge.dig) {
    const g = R.sludge.dig;
    benefit = g.Eel * 365 * c.el + Math.max(0, g.Eth - g.heatNeed) * 365 * c.heatPrice;
    d.h('Lợi ích phân hủy kỵ khí');
    d.r('Điện từ CHP', '', g.Eel * 365, 'kWh/năm', 'giảm ' + U.fmt(g.Eel * 365 / kWha * 100, 0) + ' % điện mua');
    d.r('Giá trị điện + nhiệt dư', '', benefit, c.currency + '/năm');
  }
  // cài đặt chi phí (Handbook 15.2.3): bỏ các nhóm không xét khỏi tổng và khỏi báo cáo
  const cf = Object.assign({ energy: true, sludge: true, prec: true, staff: true, prod: true }, (S.settings && S.settings.cost) || {});
  const total = (cf.energy ? costE : 0) + (cf.sludge ? costS : 0) + (cf.prec ? costC : 0) + (cf.staff ? costP : 0) - (cf.prod ? benefit : 0);
  { const off = { 'Điện năng': !cf.energy, 'Thải bỏ bùn & rác': !cf.sludge, 'Hóa chất': !cf.prec, 'Nhân sự': !cf.staff, 'Lợi ích phân hủy kỵ khí': !cf.prod };
    let skip = false; d.rows = d.rows.filter(r => { if (r.h) skip = !!off[r.h]; return !skip; });
    const ex = Object.keys(off).filter(k => off[k]); if (ex.length) d.info('Không xét trong chi phí: ' + ex.join(', ') + ' (Tùy chọn > Cài đặt báo cáo & chi phí).'); }
  d.h('Tổng hợp');
  d.r('Tổng chi phí vận hành', '', total, c.currency + '/năm');
  d.r('Chi phí riêng', '', total / PE, c.currency + '/(PE·năm)');
  d.r('Chi phí theo m³', '', total / (L.Qd * 365), c.currency + '/m³');
  return { E, P, byStage, kWha, costE, costS, costC, costP, benefit, total, staff, d };
};

/* ---------- MSIG (Malaysia, 3rd ed. 2009) – lớp kiểm tra tiêu chí trên kết quả A 131 (Handbook 7.8, 7.9.3) ---------- */
ENG.msig = function (S, R) {
  const d = new Rep('Kiểm tra theo MSIG (Malaysia)'), L = R.load, B = R.bio, T = R.tank, ext = !!S.opt.stab;
  const m = Object.assign({}, DEF.project().msig, S.msig || {});
  const ck = (l, sym, v, u, lo, hi, ex) => d.c(l, sym, v, u, lo != null && hi != null ? U.fmt(lo) + ' – ' + U.fmt(hi) : lo != null ? '≥ ' + U.fmt(lo) : '≤ ' + U.fmt(hi), (lo == null || v >= lo - 1e-9) && (hi == null || v <= hi + 1e-9), ex);
  d.h(ext ? 'Bể bùn hoạt tính – ổn định hiếu khí đồng thời (MSIG Fig. 64)' : 'Bể bùn hoạt tính – thông thường, ổn định bùn kỵ khí (MSIG Fig. 63)');
  if (B) {
    const V = (T && T.V) || B.V, TS = B.TSm || B.TS, BOD = L.bio.BOD;
    const FM = BOD / (V * TS), HRT = V / L.Qd * 24, BR = BOD / V;
    ck('Tỷ số F/M', 'F/M', FM, 'kg BOD₅/(kg MLSS·d)', ext ? 0.05 : 0.25, ext ? 0.10 : 0.50);
    ck('Thời gian lưu nước', 'HRT', HRT, 'h', ext ? 18 : S.opt.process === 'ND' ? 12 : 6, ext ? 24 : 16, ext ? '' : '6 – 16 h chỉ khử NH₄; 12 – 16 h khử N tổng');
    ck('MLSS', 'MLSS', TS * 1000, 'mg/l', ext ? 2500 : 1500, ext ? 5000 : 3000, 'điển hình ' + (ext ? 3000 : 2500));
    ck('Tải trọng thể tích', 'B_R', BR, 'kg BOD₅/(m³·d)', ext ? 0.1 : 0.3, ext ? 0.4 : 0.6);
    const Yobs = B.US / Math.max(1e-9, BOD);
    ck('Hệ số bùn sinh ra', 'Y', Yobs, 'kg bùn/kg BOD₅', ext ? 0.4 : 0.8, ext ? 0.6 : 1.0, ext ? '0,4 (HRT 24 h) – 0,6 (HRT 18 h)' : '');
    ck('Tuổi bùn', 't_TS', (T && T.tSS) || B.tSS, 'd', ext ? 20 : 5, ext ? null : 10);
    if (R.aer) {
      const OB = R.aer.OVd / Math.max(1e-9, BOD + L.bio.TKN);
      d.c('Nhu cầu ôxy', 'OR', OB, 'kg O₂/kg (BOD₅ + TKN)', 'MSIG: 2,0', null, 'MSIG lấy cố định 2,0 kg O₂/kg chất nền; AquaDesign tính theo A 131/M 229-1');
      ck('Nồng độ ôxy hòa tan vận hành', 'DO', S.aer.Cx, 'mg/l', ext ? 2.0 : 1.0, null);
      const Pin = (R.aer.blow ? R.aer.blow.Ptot : R.aer.surf ? R.aer.surf.Ptot : 0) + (R.aer.mix ? R.aer.mix.P : 0);
      if (Pin > 0) ck('Mật độ công suất (sục khí + khuấy)', 'P/V', Pin * 1000 / V, 'W/m³', 20, null, 'MSIG: tối thiểu 20 W/m³ để giữ bùn lơ lửng');
    }
    if (T) {
      ck('Số bể', 'n', T.n, '', 2, null);
      if (ext) {
        ck('Chiều sâu nước', 'H', T.H, 'm', 3, 5);
        if (T.L && T.B) d.c('Tỷ lệ L:B', 'L/B', T.L / T.B, '–', '≈ 3:1', null);
        if (T.B) ck('Chiều rộng bể ghép', 'B', T.B * T.n, 'm', null, 60);
      }
    }
    if (R.rs && R.rs.QRS) {
      const Cu = R.sst && R.sst.TSRS ? R.sst.TSRS : 8, QRSc = TS / Math.max(1e-6, Cu - TS) * L.Qd / 24;
      ck('Tỷ lệ tuần hoàn bùn vận hành', 'Q_RAS/Q_avg', TS / Math.max(1e-6, Cu - TS), '–', ext ? 0.5 : 0.75, 1.0, 'Q_RAS = MLSS/(C_u − MLSS)·Q_avg = ' + U.fmt(QRSc) + ' m³/h (C_u = ' + U.fmt(Cu) + ' kg/m³); bơm lắp ' + U.fmt(R.rs.QRS) + ' m³/h, chạy 24 h/d');
      if (S.opt.process === 'ND' && R.rs.rz) d.c('Tuần hoàn hỗn hợp khử nitrat', 'Q_IR/Q', R.rs.rz.Q / (L.Qd / 24), '–', '4 – 6', R.rs.rz.Q / (L.Qd / 24) >= 4 - 1e-9 && R.rs.rz.Q / (L.Qd / 24) <= 6 + 1e-9);
    }
    if (!ext && !L.prim.on) d.warn('MSIG Fig. 63: hệ bùn hoạt tính thông thường (ổn định bùn kỵ khí) phải có lắng sơ cấp.', FX('Thêm lắng sơ cấp', { 'load.prim.on': true }), FX('Chọn ổn định bùn hiếu khí đồng thời', { 'opt.stab': true }));
  }
  // bể lắng II: SOR, SLR theo Q_peak; HRT (MSIG – giá trị giới hạn nhập được)
  if (R.sst && R.sst.Atot) {
    const Qp = L.Qm * 24, A = R.sst.Atot, TS = B ? (B.TSm || B.TS) : 3.5;
    d.h('Bể lắng II (MSIG – theo Q_peak)');
    ck('Tải trọng bề mặt ở Q_peak', 'SOR', Qp / A, 'm³/(m²·d)', null, m.sstSOR);
    ck('Tải trọng chất rắn ở Q_peak', 'SLR', Qp * TS / A, 'kg/(m²·d)', null, m.sstSLR);
    const H = R.sst.H || 0;
    if (H > 0) ck('Thời gian lưu nước ở Q_peak', 'HRT', (R.sst.hop ? R.sst.V * R.sst.n : A * H) / L.Qm, 'h', m.sstHRT, null);
    if (R.sst.qw) ck('Tải trọng máng tràn ở Q_peak', 'WLR', R.sst.qw * 24, 'm³/(m·d)', null, m.sstWLR);
    d.r('Diện tích cần theo MSIG', 'A_MSIG', Math.max(Qp / m.sstSOR, Qp * TS / m.sstSLR), 'm²', 'max(Q_peak/SOR, Q_peak·MLSS/SLR); hiện có ' + U.fmt(A, 0) + ' m²');
  }
  // lắng sơ cấp: diện tích + máng tràn (MSIG)
  const P = L.prim;
  if (P && P.on && P.A) {
    d.h('Lắng sơ cấp (MSIG – theo Q_peak)');
    ck('Tải trọng bề mặt ở Q_peak', 'SOR', L.Qm * 24 / P.A, 'm³/(m²·d)', null, m.primSOR);
    ck('Thời gian lưu nước ở Q_avg', 'HRT', P.V / (L.Qd / 24), 'h', m.primHRTmin, m.primHRTmax);
    if (P.WL) ck('Tải trọng máng tràn ở Q_peak', 'WLR', P.WL * 24, 'm³/(m·d)', null, m.primWLR);
  }
  const D0 = DEF.project().msig, chg = ['sstSOR', 'sstSLR', 'sstHRT', 'sstWLR', 'primSOR', 'primHRTmin', 'primHRTmax', 'primWLR'].filter(k => m[k] !== D0[k]);
  d.info('Giới hạn MSIG Vol. IV (2009) theo trích đoạn bảng thiết kế: lắng II SOR ≤ 30 m³/(m²·d) và HRT ≥ 2 h ở Q_peak; lắng sơ cấp SOR < 45 m³/(m²·d), máng tràn < 150 m³/(m·d) ở Q_peak. Chưa xác nhận từ nguồn (giá trị tham khảo): SLR lắng II ' + D0.sstSLR + ' kg/(m²·d), máng tràn lắng II ' + D0.sstWLR + ' m³/(m·d), HRT lắng sơ cấp ' + D0.primHRTmin + ' – ' + D0.primHRTmax + ' h – nên đối chiếu bản gốc MSIG (SPAN).' + (chg.length ? ' Đang dùng giá trị người dùng sửa: ' + chg.join(', ') + '.' : ''));
  return { d };
};

/* ---------- Khối lượng xây dựng & đẩy nổi ---------- */
ENG.mass = function (S, shape) {
  // shape: {kind:'rect'|'circ'|'ring'|'ditch', B,L|D, H, n}
  const b = S.build, d = new Rep('Khối lượng xây dựng & chống đẩy nổi – ' + shape.name);
  const tw = shape.tw || b.tWallAT, ts = b.tSlab, hw = shape.H + b.free;
  let Ain, Pmid, Aout, wallV, slabV;
  if (shape.kind === 'circ' || shape.kind === 'ring') {
    const D = shape.D;
    Ain = Math.PI * D * D / 4; Pmid = Math.PI * (D + tw);
    const Do = D + 2 * tw + 2 * b.spur; Aout = Math.PI * Do * Do / 4;
    wallV = Pmid * tw * hw; slabV = Aout * ts;
    if (shape.kind === 'ring' && shape.Di) wallV += Math.PI * (shape.Di - S.build.tWallST) * S.build.tWallST * hw;
  } else {
    const Bw = shape.B, L = shape.L;
    Ain = Bw * L; Pmid = 2 * (Bw + L + 2 * tw);
    Aout = (Bw + 2 * tw + 2 * b.spur) * (L + 2 * tw + 2 * b.spur);
    wallV = Pmid * tw * hw; slabV = Aout * ts;
  }
  const n = shape.n || 1;
  const conc = (wallV + slabV) * n;
  const Hd = Math.max(0, hw + ts - (b.above || 0.5)); // chiều sâu đáy móng dưới mặt đất
  const e = Hd / Math.tan(b.slope * Math.PI / 180);
  let exc;
  if (shape.kind === 'rect' || shape.kind === 'ditch') {
    const a1 = shape.B + 2 * tw + 2 * b.spur + 2 * b.work, l1 = shape.L + 2 * tw + 2 * b.spur + 2 * b.work;
    const A1 = a1 * l1, A2 = (a1 + 2 * e) * (l1 + 2 * e);
    exc = Hd / 3 * (A1 + A2 + Math.sqrt(A1 * A2)) * n;
  } else {
    const r1 = shape.D / 2 + tw + b.spur + b.work, r2 = r1 + e;
    exc = Math.PI * Hd / 3 * (r1 * r1 + r1 * r2 + r2 * r2) * n;
  }
  const embedded = Aout * Hd * n;
  const backfill = Math.max(0, exc - embedded);
  const steel = (wallV * 100 + slabV * 90) * n / 1000;
  d.h('Bê tông & đất');
  d.r('Bê tông thành', '', wallV * n, 'm³', 'dày ' + tw + ' m, cao ' + U.fmt(hw) + ' m');
  d.r('Bê tông đáy', '', slabV * n, 'm³', 'dày ' + ts + ' m, gờ chân ' + b.spur + ' m');
  d.r('Tổng bê tông', '', conc, 'm³');
  d.r('Cốt thép (ước tính)', '', steel, 't', '≈ 100 kg/m³ thành, 90 kg/m³ đáy');
  d.r('Chiều sâu đào', 'H_d', Hd, 'm', 'đỉnh thành cao hơn mặt đất ' + (b.above || 0.5) + ' m');
  d.r('Đào đất', '', exc, 'm³', 'mái dốc ' + b.slope + '°, khoảng thao tác ' + b.work + ' m');
  d.r('Đắp lại', '', backfill, 'm³');
  // đẩy nổi (bể rỗng)
  const G1 = (wallV + slabV) * b.gamma + (Aout - Ain - Pmid * tw) * Math.max(0, Hd - ts) * b.gammaSoil * 0; // đất trên gờ tính riêng
  const soilSpur = (Aout - (shape.kind === 'circ' || shape.kind === 'ring' ? Math.PI * Math.pow(shape.D + 2 * tw, 2) / 4 : (shape.B + 2 * tw) * (shape.L + 2 * tw))) * Math.max(0, Hd - ts) * b.gammaSoil;
  const G = G1 + soilSpur;
  const hwMax = G / (b.eta * b.gammaW * Aout);
  const gwDepth = Hd - hwMax;
  d.h('Đẩy nổi (bể rỗng, không tính thiết bị)');
  d.r('Trọng lượng kết cấu', 'G_B', G1, 'kN/bể', 'γ_BT = ' + b.gamma + ' kN/m³');
  d.r('Đất trên gờ chân', 'G_E', soilSpur, 'kN/bể');
  d.r('Hệ số an toàn', 'η', b.eta, '–');
  d.r('Mực nước ngầm cho phép trên đáy móng', 'h_w', hwMax, 'm', 'G/(η·γ_w·A)');
  d.r('Mực nước ngầm cho phép dưới mặt đất', '', gwDepth, 'm', gwDepth < 0 ? 'an toàn cả khi ngập' : '');
  if (b.ground !== undefined && b.ground > 0 && gwDepth > b.ground) d.warn('Mực nước ngầm thiết kế (' + b.ground + ' m dưới đất) cao hơn mức cho phép – cần chống đẩy nổi.');
  return { conc, steel, exc, backfill, Hd, hwMax, gwDepth, d };
};

/* ---------- Kiểm tra bể lắng II hiện hữu (đảo ngược A 131) ---------- */
ENG.verifySST = function (V) {
  // Handbook 14: kiểm tra ngược bể lắng II hiện hữu → Q_mz cho phép; hướng dẫn A 131 (2016), A 131:2000 (q_SV 450/600) hoặc A 226 (q_SV 450 dòng ngang)
  const g = V.guide || 'A131', hop = V.shape === 'hop', vt = V.flow === 'vt' || hop;
  const d = new Rep('Kiểm tra bể lắng II hiện hữu (' + { A131: 'DWA-A 131:2016', A131old: 'DWA-A 131:2000', A226: 'DWA-A 226' }[g] + ')');
  const qSVmax = g === 'A131' ? (vt ? 650 : 500) : (vt ? 600 : 450), qAmax = vt ? 2.0 : 1.6;
  let A;
  if (V.shape === 'circ' || hop) A = Math.PI * (V.D * V.D - V.Din * V.Din) / 4;
  else if (V.shape === 'rect') A = V.B * Math.max(0, V.L - V.H);
  else A = V.A;
  const H = V.shape === 'circ' ? V.hEdge + V.slope * (V.D - V.Din) / 2 / 3 : hop ? (V.hCyl || 0) + (V.hCone || 0) : V.H;
  const TSBS = V.TS * (1 + V.RV) / V.RV / V.rRS;
  const tE = Math.pow(TSBS * V.ISV / 1000, 3);
  const VSV = V.TS * V.ISV;
  const zones = qa => {
    const qsv = qa * VSV;
    return 0.5 + 0.5 * qa * (1 + V.RV) / (1 - VSV / 1000) + 0.45 * qsv * (1 + V.RV) / 500 + V.TS * qa * (1 + V.RV) * tE / TSBS;
  };
  const qA1 = Math.min(qSVmax / VSV, qAmax);
  // A 226: Q_mz = q_A·A với q_SV = 450 (không lặp theo chiều sâu); A 131: lặp q_A đến khi tổng các vùng = chiều sâu
  const qA = g === 'A226' || hop ? qA1 : zones(qA1) <= H ? qA1 : U.bisect(q => zones(q) - H, 1e-4, qA1);
  const Qm = qA * A * V.n;
  d.r('Diện tích hữu ích mỗi bể', 'A', A, 'm²', V.shape === 'rect' ? 'trừ vùng vào ≈ chiều sâu' : '');
  d.r('Chiều sâu ' + (hop ? 'tổng' : 'tại 2/3 đường dòng'), 'H', H, 'm');
  d.r('TS bể aerotank', 'TS_BB', V.TS, 'kg/m³');
  d.r('TS đáy cần', 'TS_BS', TSBS, 'kg/m³', 'TS_BB·(1+RV)/(RV·' + V.rRS + ')');
  d.r('Thời gian cô đặc tương ứng', 't_E', tE, 'h', '(TS_BS·ISV/1000)³; C = 300·t_E + 500 = ' + U.fmt(300 * tE + 500, 0));
  if (tE > 2.5) d.warn('t_E > 2,5 h – vượt khuyến nghị, nên giảm TS_BB hoặc tăng RV.');
  d.r('VSV', 'VSV', VSV, 'l/m³');
  d.r('q_SV max', 'q_SV', qSVmax, 'l/(m²·h)', (vt ? 'dòng đứng' : 'dòng ngang') + ' – ' + g);
  d.r('q_A cho phép', 'q_A', qA, 'm/h', g === 'A226' ? 'q_SV/(TS·ISV)' : zones(qA1) <= H || hop ? 'giới hạn bởi q_SV/q_A max' : 'giới hạn bởi chiều sâu');
  d.r('q_SV', 'q_SV', qA * VSV, 'l/(m²·h)');
  d.r('Lưu lượng cho phép', 'Q_mz', Qm, 'm³/h', U.fmt(Qm / 3.6) + ' l/s');
  if (V.comb && V.RV > 0.75) d.warn('Cống chung: RV ≤ 0,75·Q_M.');
  // chiều sâu tối thiểu theo hướng dẫn
  const hR = V.shape === 'circ' ? V.hEdge : H;
  if (hop) {
    if ((V.hCyl || 0) < (V.hCone || 0) / 3) d.err('Bể phễu: phần trụ < 1/3 chiều cao phễu.');
    if ((V.hCyl || 0) < (V.comb ? 3.0 : 2.0)) d.err('Bể phễu: phần trụ < ' + (V.comb ? '3,0 m (cống chung)' : '2,0 m (cống riêng)') + '.');
  } else if (g === 'A226') { if (hR < 3.5) d.err('A 226: chiều sâu thành < 3,5 m.'); if (H < 4.0) d.err('A 226: tổng chiều sâu < 4,0 m.'); }
  else if (!vt && hR < 2.5) d.warn('Chiều sâu thành < 2,5 m.');
  if (vt && !hop && V.inflowDepth && V.inflowDepth <= H / 2) d.err('Dòng đứng: chiều sâu vào phải > ½ chiều sâu – không tính như dòng đứng được.');
  if (!vt && V.inflowDepth && V.inflowDepth > H / 2) d.info('Chiều sâu vào > ½ chiều sâu: có thể tính như bể dòng đứng (q_SV cao hơn).');
  if (!hop && g !== 'A226' && zones(qA1) > H) d.info('Chiều sâu quyết định q_A – tổng các vùng với q_A max = ' + U.fmt(zones(qA1)) + ' m > ' + U.fmt(H) + ' m.');
  return { A, H, TSBS, tE, qA, Qm, d };
};

/* ---------- Danh mục thiết bị & điểm đo ---------- */
ENG.machines = function (S, R) {
  const M = [], c = S.comp;
  const add = (tag, name, n, sb, spec, kW, src) => M.push({ tag, name, n, sb: sb || 0, spec: spec || '', kW: kW || 0, src: src || 'tính toán' });
  const L = R.load;
  if (c.inletPS) add('10-PU-01', 'Bơm chìm trạm bơm đầu vào', Math.max(2, Math.ceil(L.Qm / 500)), 1, U.fmt(L.Qm / Math.max(2, Math.ceil(L.Qm / 500))) + ' m³/h; H = ' + S.cost.hInlet + ' m', DB.motorUp(9.81 * L.Qm / Math.max(2, Math.ceil(L.Qm / 500)) / 3600 * S.cost.hInlet / 0.65), 'thành phần');
  if (c.screenC) add('20-SC-01', 'Song chắn rác thô cơ giới', 1, 1, 'khe 20–50 mm', 0.75, 'thành phần');
  if (c.screenF) add('20-SC-02', 'Song chắn rác tinh', 1, 1, 'khe 3–6 mm' + (S.opt.line === 'MBR' ? ' (MBR: ≤ 1–2 mm lỗ)' : ''), 1.5, 'thành phần');
  if (c.screenF) add('20-PR-01', 'Máy ép rác', 1, 0, '', 2.2, 'thành phần');
  if (R.grit) {
    add('30-BR-01', 'Cầu cào/hút cát', R.grit.n, 0, R.grit.type === 'aer' ? 'L = ' + U.fmt(R.grit.L) + ' m' : 'D = ' + U.fmt(R.grit.D) + ' m', 0.75);
    if (R.grit.type === 'aer') add('30-BL-01', 'Máy thổi khí bể lắng cát', 1, 1, U.fmt(R.grit.Qair * R.grit.n) + ' m³/h', 3);
    add('30-CL-01', 'Máy phân loại – rửa cát', 1, 0, '', 1.1);
  }
  if (L.prim.on) add('40-BR-01', 'Thiết bị gạt bùn lắng sơ cấp', L.prim.n, 0, '', 0.37);
  const a = R.aer;
  if (a && a.blow) {
    add('50-BL-01', 'Máy thổi khí aerotank', a.blow.n, a.blow.sb, (a.blow.item ? a.blow.item.name + '; ' : '') + U.fmt(a.blow.Qb) + ' m³/h; Δp = ' + U.fmt(a.blow.dp, 0) + ' mbar', a.blow.item ? a.blow.item.Pn : DB.motorUp(a.blow.Pel));
    add('50-AE-01', a.diff.type.name, a.diff.n, 0, U.fmt(a.diff.q) + ' ' + a.diff.type.unit, 0);
  }
  if (a && a.surf) add('50-SA-01', 'Máy sục khí bề mặt', a.surf.n, 0, a.surf.item.name, a.surf.item.Pn);
  if (a && a.mix && a.mix.item) add('50-MX-01', 'Máy khuấy chìm aerotank', a.mix.nTot, 0, a.mix.item.name, a.mix.item.Pn);
  if (R.tank && R.tank.an) add('50-MX-02', 'Máy khuấy bể kỵ khí', R.tank.an.n, 0, '', DB.motorUp(R.tank.an.V / R.tank.an.n * 5 / 1000));
  if (R.mbr) {
    add('55-MB-01', 'Khối màng MBR', R.mbr.nFE, 0, R.mbr.mod.name, 0);
    const mb = R.mbr;
    add('55-BL-01', 'Máy thổi khí rửa màng', S.mbr.nTrains, 1, (mb.cfItem ? mb.cfItem.name + '; ' : '') + U.fmt(mb.QCF / S.mbr.nTrains) + ' Nm³/h', mb.cfItem ? mb.cfItem.Pn : DB.motorUp(mb.Pcf / S.mbr.nTrains));
    add('55-PU-01', 'Bơm thấm (hút)', S.mbr.nTrains, S.mbr.nPermSb ?? 1, (mb.permItem ? mb.permItem.name + '; ' : '') + U.fmt(mb.Qp1 || L.Qm / S.mbr.nTrains) + ' m³/h; H = ' + U.fmt(mb.Hp) + ' m', mb.permItem ? mb.permItem.Pn : DB.motorUp(mb.Pperm / S.mbr.nTrains));
  }
  if (R.sbr) add('50-DC-01', 'Thiết bị xả nước trong (decanter)', S.sbr.n, 0, U.fmt(R.sbr.Qdec) + ' m³/h', 1.5);
  if (R.iceas) {
    const c = R.iceas;
    add('50-DC-01', 'Decanter ICEAS (máng thu, bộ truyền động)', c.nb, 0, 'L = ' + U.fmt(c.DL) + ' m; ' + U.fmt(c.PWR) + ' m³/phút', 1.1, 'ICEAS');
    if (c.cycle !== 'NIT') add('50-MX-02', 'Máy khuấy chìm ICEAS (pha Air-Off)', c.nb * 2, 0, U.fmt(S.ic.Pmix / 2) + ' kW/máy', S.ic.Pmix / 2, 'ICEAS');
    add('50-PU-05', 'Bơm bùn thải ICEAS', c.nb, 0, U.fmt(c.WSP * 0.06) + ' m³/h', 2.2, 'ICEAS');
    add('50-BF-01', 'Vách ngăn pre-react (cửa thông đáy)', c.nb, 0, 'cách đầu bể ' + U.fmt(c.Lpre) + ' m', 0, 'ICEAS');
  }
  if (R.ctech) {
    const c = R.ctech;
    add('50-DC-01', 'Decanter C-Tech', c.N, 0, U.fmt(c.Qdec) + ' m³/h; ΔH = ' + S.ct.dH + ' m', 1.5, 'C-Tech');
    add('50-PU-04', 'Bơm RAS về selector', c.N, 0, U.fmt(c.QR) + ' m³/h; H ≈ 5 m', DB.motorUp(9.81 * c.QR / 3600 * 5 / 0.55), 'C-Tech');
    add('50-PU-05', 'Bơm bùn dư SAS', c.N, 0, U.fmt(c.Vsas / c.ncy / c.N / (S.ct.tSAS / 60)) + ' m³/h', 2.2, 'C-Tech');
  }
  if (R.mbr && R.mbr.kub) add('55-CIP-01', 'Hệ rửa hóa chất tại chỗ (bồn + bơm NaOCl)', 1, 0, U.fmt(R.mbr.kub.cipV) + ' m³/lần', 1.5, 'Kubota');
  if (R.sst && !R.sst.hop) add('60-BR-01', 'Cầu gạt bùn bể lắng II', R.sst.n, 0, R.sst.D ? 'D = ' + U.fmt(R.sst.D) + ' m' : 'B = ' + U.fmt(R.sst.B) + ' m', 0.75);
  if (R.rs) {
    const r = R.rs;
    if (!r.n) { /* không có bùn tuần hoàn */ }
    else if (r.type === 'air') add('70-BL-01', 'Máy nén khí nâng bùn tuần hoàn', r.n, 1, U.fmt(r.Qair / r.n) + ' m³/h', r.item ? r.item.Pn : 1.5);
    else add('70-PU-01', r.type === 'screw' ? 'Bơm trục vít bùn tuần hoàn' : 'Bơm bùn tuần hoàn', r.n, r.sb, U.fmt(r.Q1) + ' m³/h; H = ' + r.H + ' m', r.item ? r.item.Pn : DB.motorUp(r.Pel));
    if (r.rz) add('70-PU-02', 'Bơm tuần hoàn nội (chân vịt)', r.rz.n, 0, U.fmt(r.rz.Q1) + ' m³/h', DB.motorUp(r.rz.P / r.rz.n));
    if (r.es) add('70-PU-03', 'Bơm bùn dư', r.es.n, 1, U.fmt(r.es.q1) + ' m³/h', r.es.item ? r.es.item.Pn : 1.5);
  }
  if (R.bio && R.bio.Fe > 0) add('75-DP-01', 'Bơm định lượng ' + R.bio.prec.name, 1, 1, U.fmt(R.bio.precL / 24) + ' l/h', 0.37);
  if (R.bio && R.bio.Cdos_kg > 0) add('75-DP-02', 'Bơm định lượng carbon', 1, 1, U.fmt(R.bio.Cdos_kg / R.bio.ce.rho * 1000 / 24) + ' l/h', 0.37);
  const sl = R.sludge;
  if (sl) {
    if (sl.thick) add('80-TH-01', 'Cào bể nén bùn', S.sludge.thick.n, 0, 'D = ' + U.fmt(sl.thick.D) + ' m', 0.37);
    if (sl.dig) { add('82-MX-01', 'Máy khuấy bể phân hủy', sl.dig.n, 0, '', DB.motorUp(sl.dig.mixP / sl.dig.n)); add('82-CHP-01', 'Máy phát nhiệt-điện CHP', 1, 0, U.fmt(sl.dig.Eel / 22) + ' kW_el', 0); }
    if (sl.tank) add('84-MX-01', 'Máy khuấy bể chứa bùn', S.sludge.tank.n, 0, '', DB.motorUp(sl.tank.P));
    if (sl.dew) add('86-DW-01', 'Thiết bị tách nước bùn', 1, 0, U.fmt(sl.dew.Qin / 8) + ' m³/h (8 h/d)', 15);
  }
  if (c.uv) add('90-UV-01', 'Khử trùng UV', 1, 0, U.fmt(L.Qm) + ' m³/h', U.roundTo(L.Qm / 100, 1) + 2, 'thành phần');
  // điểm đo
  const P = [], m = c.meas;
  const addP = (tag, name, loc) => P.push({ tag, name, loc });
  if (m.Q) { addP('10-FIT-01', 'Lưu lượng nước vào', 'đường vào'); addP('90-FIT-01', 'Lưu lượng nước ra', 'đường ra'); }
  if (m.level) addP('10-LIT-01', 'Mực nước hố bơm', 'trạm bơm');
  const nAT = R.tank ? R.tank.n : R.sbr ? S.sbr.n : R.iceas ? R.iceas.nb : R.ctech ? R.ctech.N : 1;
  for (let i = 1; i <= nAT; i++) {
    if (m.DO) addP('50-QIT-' + i + '1', 'DO aerotank ' + i, 'vùng hiếu khí');
    if (m.NH4) addP('50-QIT-' + i + '2', 'NH₄-N aerotank ' + i, 'cuối vùng hiếu khí');
    if (m.NO3 && S.opt.process === 'ND') addP('50-QIT-' + i + '3', 'NO₃-N aerotank ' + i, 'cuối vùng thiếu khí');
    if (m.MLSS) addP('50-QIT-' + i + '4', 'MLSS aerotank ' + i, '');
  }
  if (m.PO4) addP('90-QIT-01', 'PO₄-P nước ra', 'đường ra');
  if (m.pH) addP('10-QIT-01', 'pH nước vào', 'đường vào');
  if (m.temp) addP('50-TIT-01', 'Nhiệt độ', 'aerotank');
  if (R.aer && R.aer.blow) addP('50-FIT-02', 'Lưu lượng khí', 'ống khí chính');
  if (R.rs) addP('70-FIT-01', 'Lưu lượng bùn tuần hoàn', 'ống RS');
  // thiết bị bổ sung theo bộ máy điển hình của từng công đoạn (AD 8.3: danh mục tự sinh theo lựa chọn công đoạn)
  if (c.intPS) add('45-PU-01', 'Bơm trạm bơm trung gian', Math.max(2, Math.ceil(L.Qm / 500)), 1, U.fmt(L.Qm / Math.max(2, Math.ceil(L.Qm / 500))) + ' m³/h; H = ' + S.cost.hInter + ' m', DB.motorUp(9.81 * L.Qm / Math.max(2, Math.ceil(L.Qm / 500)) / 3600 * S.cost.hInter / 0.65), 'thành phần');
  if (L.prim.on) add('40-PU-01', 'Bơm bùn sơ cấp', 1, 1, R.sludge && R.sludge.PS ? U.fmt(R.sludge.PS / 25 / 4) + ' m³/h (4 h/d)' : '', 2.2);
  if (R.sst && !R.sst.hop && c.scum) add('60-PU-02', 'Bơm váng bể lắng II', R.sst.n, 0, '20 m³/h', 1.1);
  if (R.sst && !R.sst.hop && c.channelClean) add('60-CC-01', 'Thiết bị làm sạch máng tràn', R.sst.n, 0, '', 0.25);
  if (c.ventilation && (c.screenC || c.screenF)) add('20-VE-01', 'Quạt thông gió nhà song chắn', 1, 0, '', 0.75);
  if (c.ventilation && a && a.blow && a.vent) add('50-VE-01', 'Quạt thông gió phòng máy thổi', 1, 0, U.fmt(a.vent.Qnet) + ' m³/h', 1.1);
  if (sl) {
    if (sl.thick) { add('80-PU-01', 'Bơm trục vít xoắn bùn sau nén', 1, 0, U.fmt(sl.thick.Qo / 8) + ' m³/h', 2.2); add('80-PU-02', 'Bơm nước tách bể nén', 1, 0, '', 1.5); }
    if (sl.thick && sl.thick.sep) {
      add('81-PU-01', 'Bơm bùn loãng cấp máy nén', 1, 1, U.fmt(sl.US / ((R.sst && R.sst.TSRS) || 8) / 16) + ' m³/h', 2.2);
      add('81-TM-01', 'Máy nén bùn cơ học', 1, 0, U.fmt(sl.US) + ' kg TS/d', 5.5);
      add('81-PU-02', 'Bơm bùn đặc', 1, 0, '', 2.2);
      add('81-PO-01', 'Trạm pha polymer (máy khuấy)', 2, 0, '', 0.55); add('81-DP-01', 'Bơm định lượng polymer', 1, 1, '', 0.37);
      if (c.ventilation) add('81-VE-01', 'Quạt thông gió nhà nén bùn', 1, 0, '', 0.75);
    }
    if (sl.dig) { add('82-PU-01', 'Bơm bùn tươi cấp bể phân hủy', 1, 1, U.fmt((sl.thick ? sl.thick.Qo : sl.Q0) / 8) + ' m³/h', 3); add('82-PU-02', 'Bơm tuần hoàn bể phân hủy', 1, 1, '', 4); add('83-MX-01', 'Máy khuấy bể nén sau phân hủy', 1, 0, '', 0.75); add('83-PU-01', 'Bơm trục vít xoắn bể nén sau phân hủy', 1, 0, '', 2.2); add('83-PU-02', 'Bơm nước tách bể nén sau phân hủy', 1, 0, '', 1.5); }
    if (sl.dew) {
      add('86-PU-01', 'Bơm cấp máy tách nước', 1, 1, U.fmt(sl.dew.Qin / 8) + ' m³/h', 3);
      add('86-SC-01', 'Vít tải bánh bùn', 2, 0, U.fmt(sl.dew.cake / 8, 2) + ' m³/h', 2.2);
      add('86-PU-02', 'Bơm nước lọc', 1, 1, '', 1.5);
      add('86-PO-01', 'Trạm pha polymer (máy khuấy)', 2, 0, '', 0.55);
      if (c.ventilation) add('86-VE-01', 'Quạt thông gió nhà tách nước', 1, 0, '', 1.1);
    }
    if (sl.supT + sl.supD > 0) add('88-PU-01', 'Bơm nước tách bùn hoàn lưu', 1, 1, U.fmt((sl.supT + sl.supD) / 8) + ' m³/h', 1.5);
  }
  return { M, P, ...ENG.machListAD(S, R, M) };
};

/* Danh mục thiết bị & điểm đo kiểu AQUA DESIGNER 8.3+: mỗi thiết bị một dòng, mã đặt hàng M-<công đoạn>-<loại>.<số>
   (thiết bị theo bể: M-AC-MR.<bể>.<số>), điểm đo MES-<công đoạn>.<bể>.<số> – hệ thống nhận dạng dùng chung cho danh mục & sơ đồ */
ENG.AD_STAGE = {
  IN: 'Trạm bơm đầu vào', SCR: 'Song chắn rác', GC: 'Bể lắng cát & tách mỡ', PS: 'Lắng sơ cấp', INT: 'Trạm bơm trung gian', AMT: 'Bể kỵ khí',
  AC: 'Bể bùn hoạt tính', MBR: 'Bể màng MBR', PD: 'Định lượng hóa chất kết tủa', CD: 'Định lượng carbon', SS: 'Bể lắng II', RAS: 'Trạm bơm bùn tuần hoàn',
  ES: 'Bơm bùn dư', PTH: 'Bể nén bùn', MTH: 'Nén bùn cơ học', RMS: 'Bùn tươi', DP: 'Bể phân hủy', STH: 'Bể nén sau phân hủy', ST: 'Bể chứa bùn',
  DW: 'Tách nước bùn', SN: 'Nước tách bùn', UV: 'Khử trùng UV',
};
ENG.machListAD = function (S, R, M) {
  // tag nội bộ → [công đoạn, mã loại, theo bể?]
  const map = [
    [/^10-PU/, 'IN', 'P'], [/^20-SC/, 'SCR', 'SCR'], [/^20-PR/, 'SCR', 'PR'], [/^20-VE/, 'SCR', 'VE'],
    [/^30-BR/, 'GC', 'SR', 1], [/^30-BL/, 'GC', 'B'], [/^30-CL/, 'GC', 'CL'], [/^40-BR/, 'PS', 'SR', 1], [/^40-PU/, 'PS', 'PSP'], [/^45-PU/, 'INT', 'P'],
    [/^50-BL/, 'AC', 'B'], [/^50-AE/, 'AC', 'AE'], [/^50-SA/, 'AC', 'SA', 1], [/^50-MX-01/, 'AC', 'MR', 1], [/^50-MX-02/, R.iceas ? 'AC' : 'AMT', 'MR', 1], [/^50-VE/, 'AC', 'VE'],
    [/^50-DC/, 'AC', 'DC', 1], [/^50-PU-04/, 'AC', 'RAS'], [/^50-PU-05/, 'AC', 'WSP'], [/^50-BF/, 'AC', 'BF', 1],
    [/^55-MB/, 'MBR', 'MB'], [/^55-BL/, 'MBR', 'B'], [/^55-PU/, 'MBR', 'PP'], [/^55-CIP/, 'MBR', 'CIP'],
    [/^60-BR/, 'SS', 'SR', 1], [/^60-PU-02/, 'SS', 'SCP', 1], [/^60-CC/, 'SS', 'CC', 1],
    [/^70-BL/, 'RAS', 'B'], [/^70-PU-01/, 'RAS', 'P'], [/^70-PU-02/, 'AC', 'RCP'], [/^70-PU-03/, 'ES', 'P'],
    [/^75-DP-01/, 'PD', 'MNP'], [/^75-DP-02/, 'CD', 'MNP'],
    [/^80-TH/, 'PTH', 'MR'], [/^80-PU-01/, 'PTH', 'PCP'], [/^80-PU-02/, 'PTH', 'SN-P'],
    [/^81-PU-01/, 'MTH', 'DSP'], [/^81-TM/, 'MTH', 'TM'], [/^81-PU-02/, 'MTH', 'TSP'], [/^81-PO/, 'MTH', 'POM'], [/^81-DP/, 'MTH', 'PDP'], [/^81-VE/, 'MTH', 'VE'],
    [/^82-PU-01/, 'RMS', 'P'], [/^82-PU-02/, 'DP', 'PC'], [/^82-MX/, 'DP', 'MR'], [/^82-CHP/, 'DP', 'CHP'],
    [/^83-MX/, 'STH', 'MR'], [/^83-PU-01/, 'STH', 'PCP'], [/^83-PU-02/, 'STH', 'SN-P'], [/^84-MX/, 'ST', 'MR'],
    [/^86-PU-01/, 'DW', 'PFE'], [/^86-DW/, 'DW', 'M'], [/^86-SC/, 'DW', 'SSC'], [/^86-PU-02/, 'DW', 'FIP'], [/^86-PO/, 'DW', 'POM'], [/^86-VE/, 'DW', 'VE'],
    [/^88-PU/, 'SN', 'P'], [/^90-UV/, 'UV', 'UV'],
  ];
  const order = Object.keys(ENG.AD_STAGE);
  const nTank = { AC: R.tank ? R.tank.n : R.sbr ? S.sbr.n : R.iceas ? R.iceas.nb : R.ctech ? R.ctech.N : 1, AMT: R.tank && R.tank.an ? R.tank.an.n : 1, SS: R.sst ? R.sst.n : 1, PS: R.load.prim.n || 1, GC: R.grit ? R.grit.n : 1 };
  const rows = [], used = {};   // used: số thứ tự đã cấp theo mã (2 nhóm cùng mã, vd. song chắn thô + tinh → .1, .2, .3…)
  for (const m of M) {
    const hit = map.find(x => x[0].test(m.tag));
    const st = hit ? hit[1] : 'AC', code = hit ? hit[2] : m.tag.replace(/[^A-Z]/g, '') || 'X', perT = hit && hit[3];
    const tot = (m.n || 0) + (m.sb || 0);
    if (code === 'AE' || code === 'MB') { rows.push({ st, ord: 'M-' + st + '-' + code, name: m.name, type: m.spec, kW: 0, kWc: 0, n: tot, cap: '', key: order.indexOf(st) }); continue; }
    const nt = perT ? Math.max(1, Math.min(nTank[st] || 1, tot)) : 1, per = Math.ceil(tot / nt);
    const capM = /([\d.,]+)\s*(N?m³\/h|l\/h|m³\/phút|kg TS\/d)/.exec(m.spec || '');
    let k = 0;
    const key = st + '-' + code;
    for (let t = 1; t <= nt; t++) for (let j = 1; j <= per && k < tot; j++, k++) {
      const no = perT ? t + '.' + (j + (used[key + t] || 0)) : String(k + 1 + (used[key] || 0));
      rows.push({ st, ord: 'M-' + st + '-' + code + '.' + no, name: m.name + '.' + no, type: (m.spec || '').split(';')[0], kW: m.kW || 0, kWc: m.kWc || (m.kW ? +(m.kW * 0.85).toFixed(2) : 0), n: 1, cap: capM ? capM[1] + ' ' + capM[2] : '', sb: k >= m.n, key: order.indexOf(st) });
    }
    if (perT) for (let t = 1; t <= nt; t++) used[key + t] = (used[key + t] || 0) + per; else used[key] = (used[key] || 0) + tot;
  }
  rows.sort((a, b) => a.key - b.key);
  rows.forEach((r, i) => { r.nr = i + 1; r.stage = ENG.AD_STAGE[r.st] || r.st; });
  // điểm đo
  const me = S.comp.meas, PI = [], c = S.comp;
  const addM = (st, sub, items) => { let k = 0; for (const it of items) if (it) PI.push({ st, stage: ENG.AD_STAGE[st] || st, ord: 'MES-' + st + (sub ? '.' + sub : '') + '.' + (++k), what: it }); };
  addM('IN', '', [me.Q && 'Lưu lượng', 'Độ dẫn điện', me.pH && 'pH', me.NH4 && 'NH₄-N']);
  if (c.inletPS) { PI.push({ st: 'IN', stage: ENG.AD_STAGE.IN, ord: 'MES-IN-PS.1', what: 'Lưu lượng' }); PI.push({ st: 'IN', stage: ENG.AD_STAGE.IN, ord: 'MES-IN-PS.2', what: 'Mực nước' }); }
  if (c.screenC || c.screenF) addM('SCR', '', [me.level && 'Mực nước (chênh áp)']);
  for (let t = 1; t <= nTank.AC; t++) addM('AC', t, [me.pH && 'pH', me.temp && 'Nhiệt độ', me.DO && 'O₂', me.NH4 && 'NH₄-N', me.NO3 && S.opt.process === 'ND' && 'NO₃-N', me.MLSS && 'MLSS', R.aer && R.aer.blow && 'Áp lực khí']);
  if (R.mbr) for (let t = 1; t <= S.mbr.nTrains; t++) addM('MBR', t, ['TMP (áp suất xuyên màng)', 'Lưu lượng nước thấm', 'Lưu lượng khí rửa', 'Mực nước', 'Độ đục nước thấm']);
  if (R.sst) { addM('SS', '', [me.Q && 'Lưu lượng nước ra', 'Mực bùn']); }
  if (R.rs && R.rs.QRS) for (let t = 1; t <= Math.max(1, R.rs.n || 1); t++) PI.push({ st: 'RAS', stage: ENG.AD_STAGE.RAS, ord: 'MES-RAS-PS.' + t + '.1', what: 'Mực nước' });
  if (R.rs && R.rs.QRS) PI.push({ st: 'RAS', stage: ENG.AD_STAGE.RAS, ord: 'MES-RAS.1', what: 'Lưu lượng bùn tuần hoàn' });
  if (R.bio && R.bio.Fe > 0) addM('PD', '', ['Mức bồn hóa chất', me.PO4 && 'PO₄-P']);
  const sl = R.sludge;
  if (sl) {
    if (sl.thick) addM('PTH', '', ['Mực bùn']);
    if (sl.thick && sl.thick.sep) addM('MTH', '', ['Lưu lượng', 'MLSS']);
    if (sl.dig) { addM('RMS', 'PS', ['Lưu lượng', 'Mực nước', 'Phốt phát', 'MLSS']); addM('DP', '', ['Mực nước', 'pH', 'Nhiệt độ', 'Lưu lượng khí sinh học', 'CH₄']); }
    if (sl.dew) addM('DW', '', ['Lưu lượng', 'Mực nước', 'MLSS']);
    if (sl.supT + sl.supD > 0) addM('SN', '', ['Mực nước']);
  }
  if (c.uv) addM('UV', '', ['Cường độ UV', 'Lưu lượng']);
  PI.forEach((p, i) => { p.nr = i + 1; });
  return { MI: rows, PI };
};
