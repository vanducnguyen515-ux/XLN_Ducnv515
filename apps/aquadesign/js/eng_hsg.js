/* AquaDesign VN – Thuật toán Hochschulgruppe (HSG, Böhnke 1989 / Dohmann 1993) – đối chiếu với A 131 (Handbook AQUA DESIGNER 7.7) */
'use strict';

ENG.hsg = function (S, RL, B) {
  const o = S.opt, h = Object.assign({}, DEF.project().hsg, S.hsg || {}), d = new Rep('Thuật toán HSG (Hochschulgruppe) – đối chiếu');
  const C = RL.C, Qd = RL.Qd, T = S.bio.T, PE = S.load.PE || Qd / 0.15;
  const So = C.BOD, TSo = C.TSS, TKNo = C.TKN, NO3o = C.NO3 || 0, Po = C.P;
  const SSAT = h.SS > 0 ? h.SS : (B && (B.TSm || B.TS)) || 3.5;
  const proc = o.process, dn = o.dn;
  const NH4p = h.NH4p > 0 ? h.NH4p : (S.bio.SNH4ctl >= 10 ? 10 : 5);
  const NH4m = h.calcOut ? NH4p / 5 : h.NH4m;
  const NO3e = h.calcOut ? Math.max(0, h.Nanorg / 1.5 - NH4m) : h.NO3e;
  const Sf = h.Sf > 0 ? h.Sf : PE < 20000 ? 2.0 : 1.7;
  const fTA = Math.pow(h.thA, T - 15), fTbA = Math.pow(h.thbA, T - 15), fTbH = Math.pow(h.thbH, T - 15);
  const Fe = B && B.Fe > 0 && S.bio.prec !== 'Al' ? B.Fe / Qd * 1000 : 0, Al = B && B.Fe > 0 && S.bio.prec === 'Al' ? B.Fe / Qd * 1000 : 0;
  d.h('Đầu vào & yêu cầu dòng ra');
  d.r('BOD₅ / TSS / TKN vào bể', 'S_o / TS_o / TKN_o', U.fmt(So, 0) + ' / ' + U.fmt(TSo, 0) + ' / ' + U.fmt(TKNo, 1), 'mg/l', 'TS_o/S_o = ' + U.fmt(TSo / So, 2) + ' (không lắng sơ cấp ≈ 1,2; có ≈ 0,8)');
  d.r('NH₄-N ra đỉnh / trung bình', '[NH4-N]_e,P / _e,m', U.fmt(NH4p) + ' / ' + U.fmt(NH4m), 'mg/l', h.calcOut ? 'NH4,m = NH4,P/5' : 'nhập');
  if (proc === 'ND') d.r('NO₃-N ra trung bình', '[NO3-N]_e', NO3e, 'mg/l', h.calcOut ? 'N_anorg/1,5 − NH4,m (N_anorg = ' + h.Nanorg + ')' : 'nhập');
  d.r('Hệ số dao động', 'S', Sf, '–', h.Sf > 0 ? 'nhập (đo ≥ 1 tuổi bùn)' : PE < 20000 ? '< 20 000 PE: 2,0' : '≥ 20 000 PE: 1,7');
  if (NH4p < 3) d.warn('HSG không thiết kế được giới hạn NH₄-N < 3 mg/l.');
  // tuổi bùn hiếu khí lý thuyết (Monod)
  const den = h.muA / Sf * NH4p / (h.KN + NH4p) * fTA - h.bA * fTbA;
  if (den <= 0) { d.err('HSG: tốc độ sinh trưởng thực ≤ 0 ở ' + T + ' °C – không nitrat hóa được.'); return { d }; }
  const tA = proc === 'C' ? 0 : h.fs / den;
  d.r('Tuổi bùn hiếu khí lý thuyết', 't_SS,A', tA, 'd', "f'/((µ_max/S)·NH4/(K_N + NH4)·f_T,A − b_A·f_T,bA)");
  // vòng lặp theo V_D/V
  const run = r => {
    const tSS = proc === 'C' ? (h.tC || 5) : tA / (1 - r);
    let NUS = 0.04 * So, Nnm = TKNo - 2 - NUS, z;
    for (let i = 0; i < 30; i++) {
      const sA = (1 + h.fi * h.bA * fTbA * tA) / (1 + h.bA * fTbA * tA), sH = (1 + h.fi * h.bH * fTbH * tSS) / (1 + h.bH * fTbH * tSS);
      const Pp = h.fp * TSo + sH * h.yH * h.eta * So + (proc === 'C' ? 0 : sA * h.yA * Math.max(0, Nnm - NH4m)) + 2.5 * Fe + 4.0 * Al;
      const WSR = SSAT * 1000 / tSS, qR = WSR / Pp;
      const xA = proc === 'C' ? 0 : h.yA * Math.max(0, Nnm - NH4m) * qR * tSS / (1 + h.bA * fTbA * tA) / 1000;
      const xH = h.yH * h.eta * So * qR * tSS / (1 + h.bH * fTbH * tSS) / 1000;
      const xF = (2.5 * Fe + 4.0 * Al) * qR * tSS / 1000;
      const xI = (h.fp * TSo * qR * tSS + h.fi * h.bH * fTbH * xH * 1000 * tSS + h.fi * h.bA * fTbA * xA * 1000 * tA) / 1000;
      const NUSn = (h.iB * (xH + xA) + h.iI * xI) * 1000 / (tSS * qR);
      z = { tSS, Pp, WSR, qR, xA, xH, xI, xF, NUS: NUSn, Nnm };
      if (Math.abs(NUSn - NUS) < 1e-6) break;
      NUS = NUSn; Nnm = TKNo - 2 - NUS;
    }
    const a = dn === 'sim' ? 1 : r > 0 ? 2.95 * Math.pow(100 * r, -0.235) : 1;
    z.a = a;
    z.Nd1 = a * h.fD / 2.86 * h.eta * So * r * (0.5 + 0.24 * h.yH * z.tSS * fTbH / (1 + h.bH * fTbH * z.tSS));
    z.Nd2 = TKNo + NO3o + h.rx * z.NUS - NH4m - NO3e - 2 - z.NUS;
    return z;
  };
  let r = 0, z;
  if (proc === 'ND') {
    const f = x => { const q = run(x); return q.Nd1 - q.Nd2; };
    if (f(0.75) < 0) { r = 0.75; d.warn('HSG: kể cả V_D/V = 0,75 không đủ khử nitrat đến ' + U.fmt(NO3e) + ' mg/l.'); }
    else r = U.bisect(f, 0.01, 0.75, 1e-6);
  }
  z = run(r);
  const V = Qd / z.qR, WS = z.WSR * V / 1000;
  const NO3out = proc === 'ND' ? NO3e : proc === 'N' ? Math.max(0, TKNo + NO3o - NH4m - 2 - z.NUS) : 0;
  Object.assign(z, { r, V, WS, NO3out, tA, Sf });
  d.h('Kết quả HSG');
  if (proc === 'ND') { d.r('Tỷ lệ khử nitrat', 'V_D/V', r, '–', 'N_d,m1 = N_d,m2'); d.r('Hệ số tăng hô hấp', 'a', z.a, '–', dn === 'sim' ? 'khử nitrat đồng thời: a = 1' : '2,95·(100·V_D/V)^−0,235'); d.r('N khử được / cần khử', 'N_d,m1 / N_d,m2', U.fmt(z.Nd1) + ' / ' + U.fmt(z.Nd2), 'mg/l'); }
  d.r('Tuổi bùn tổng', 't_SS', z.tSS, 'd', proc === 'ND' ? 't_SS,A/(1 − V_D/V)' : '');
  d.r('Sản lượng bùn riêng', 'P', z.Pp, 'g TS/m³', 'f_p·TS_o + … + 2,5·Fe + 4,0·Al');
  d.r('Tải trọng thể tích nước', 'q_R', z.qR, 'm³/(m³·d)', 'WS_R/P; WS_R = SS_BB/t_SS');
  d.r('Phân đoạn bùn x_A / x_H / x_I / x_F', '', [z.xA, z.xH, z.xI, z.xF].map(x => U.fmt(x, 2)).join(' / '), 'kg/m³', 'Σ = ' + U.fmt(z.xA + z.xH + z.xI + z.xF, 2) + ' (SS_BB = ' + U.fmt(SSAT, 2) + ')');
  d.r('N vào bùn dư', 'N_ÜS', z.NUS, 'mg/l', '(i_B·(x_H + x_A) + i_I·x_I)/(t_SS·q_R)');
  d.r('Thể tích bể', 'V', V, 'm³', 'Q_d/q_R' + (proc === 'ND' ? '; V_D = ' + U.fmt(r * V, 0) + ' m³' : ''));
  d.r('Bùn dư', 'ÜS_d', WS, 'kg TS/d');
  d.r('NO₃-N ra (trung bình vận hành)', 'NO3-N_e', NO3out, 'mg/l', 'giá trị trung bình – không dùng làm giới hạn');
  const SKe = (S.bio.SKS || 8) - TKNo / 14 + (NH4m + NO3o - NO3out) / 14 - 0.06 * Fe + 0.03 * Al + 0.03 * (Po - (S.bio.Pe || 1));
  z.SKe = SKe;
  d.r('Độ kiềm ra', 'SK_e', SKe, 'mmol/l', 'công thức như Handbook in (dấu khác bản gốc HSG – đối chiếu)');
  if (B) {
    d.h('So sánh với A 131:2016');
    d.c('Thể tích bể', 'V', V, 'm³', 'A 131: ' + U.fmt(B.V, 0), null, 'HSG/A 131 = ' + U.fmt(V / B.V, 2));
    d.c('Tuổi bùn', 't_SS', z.tSS, 'd', 'A 131: ' + U.fmt(B.tSS, 1), null);
    d.c('Bùn dư', 'ÜS_d', WS, 'kg/d', 'A 131: ' + U.fmt(B.US, 0), null);
    if (proc === 'ND') d.c('Tỷ lệ khử nitrat', 'V_D/V', r, '–', 'A 131: ' + U.fmt(B.r, 3), null);
  }
  if (o.stab) d.info('HSG không xét ổn định bùn hiếu khí đồng thời – thể tích A 131 lớn hơn do tuổi bùn ổn định ' + U.fmt(B ? B.tStab : 0, 1) + ' d.');
  d.info('HSG cho phép dự báo dòng ra theo động học và đôi khi cho thể tích nhỏ hơn A 131 – nên chạy so sánh. Áp dụng cho nước thải sinh hoạt hoặc tương đương.');
  z.d = d;
  return z;
};
