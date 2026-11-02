/* AquaDesign VN – Engine: tải lượng (DWA-A 198 / A 131, M&E, MSIG), lắng sơ cấp, bể lắng II (DWA-A 131:2016, M&E) */
'use strict';
const ENG = {};
const PAR = ['BOD', 'COD', 'TSS', 'TKN', 'P', 'NO3'];
const PARN = { BOD: 'BOD₅', COD: 'COD', TSS: 'TSS', TKN: 'TKN', P: 'P tổng', NO3: 'NO₃-N' };

// bộ ghi bảng tính dùng chung cho báo cáo
class Rep {
  constructor(title) { this.title = title; this.rows = []; this.msgs = []; }
  h(t) { this.rows.push({ h: t }); return this; }
  r(l, sym, v, u, note, d) { this.rows.push({ l, sym, v, u, note, d }); return v; }
  f(t) { this.rows.push({ f: t }); return this; } // công thức / ghi chú
  // dòng đối chiếu: giá trị – dải khuyến cáo – đánh giá (ok: true/false/null = tham khảo) – giải thích
  c(l, sym, v, u, rng, ok, ex, d) { this.rows.push({ c: 1, l, sym, v, u, rng, ok, ex, d }); return v; }
  // cảnh báo/lỗi kèm phương án sửa (FX): nút "áp dụng" đổi thông số rồi tính lại
  warn(t, ...fx) { this.msgs.push({ lvl: 'warn', t, fix: fx.filter(Boolean) }); }
  err(t, ...fx) { this.msgs.push({ lvl: 'err', t, fix: fx.filter(Boolean) }); }
  info(t, ...fx) { this.msgs.push({ lvl: 'info', t, fix: fx.filter(Boolean) }); }
}
ENG.Rep = Rep;
/* phương án sửa: l = nhãn nút, set = { 'đường.dẫn.thông.số': giá trị | (S) => giá trị } – áp dụng lên bản sao dự án rồi tính lại */
const FX = (l, set) => ({ l, set });
ENG.FX = FX;

// giá trị tải lượng riêng theo tiêu chuẩn (g/(PE·d)), lưu lượng riêng l/(PE·d)
ENG.SPEC = {
  DWA: { ws: 125, BOD: 60, COD: 120, TSS: 70, TKN: 11, P: 1.8, infPct: 50 },
  ME: { ws: 230, BOD: 76, COD: 193, TSS: 74, TKN: 13.2, P: 2.1, infPct: 0 },
  MSIG: { ws: 225, BOD: 56, COD: 113, TSS: 68, TKN: 11, P: 2.0, infPct: 0 },
};

// hiệu suất lắng sơ cấp DWA theo thời gian lưu (h) – A 131 (bảng tham khảo, sửa được)
// A 131 Bảng 1 (tải g/(PE·d): nước thô 60/120/70/11/1,8 → 0,5–1,0 h: 45/90/35/10/1,6 → 1,5–2,0 h: 40/80/25/10/1,6)
ENG.PRIM_DWA = {
  BOD: [[0, 0], [0.5, 0.25], [1.0, 0.25], [1.5, 1 / 3], [2.0, 1 / 3], [2.5, 1 / 3]],
  COD: [[0, 0], [0.5, 0.25], [1.0, 0.25], [1.5, 1 / 3], [2.0, 1 / 3], [2.5, 1 / 3]],
  TSS: [[0, 0], [0.5, 0.50], [1.0, 0.50], [1.5, 45 / 70], [2.0, 45 / 70], [2.5, 45 / 70]],
  TKN: [[0, 0], [0.5, 1 / 11], [2.5, 1 / 11]],
  P: [[0, 0], [0.5, 0.2 / 1.8], [2.5, 0.2 / 1.8]],
  NO3: [[0, 0], [2.5, 0]],
};
// nồng độ nước tách bùn mặc định (mg/l): ATV "Maschinelle Schlammentwässerung" Bảng 3 (trung bình) và nước nén bùn sơ cấp (Jardin, Bảng 6) – Handbook 7.3.3
ENG.SUP_DEW = { BOD: 690, COD: 2196, TSS: 300, TKN: 1025, P: 86, NO3: 0 };
ENG.SUP_THK = { BOD: 4000, COD: 8000, TSS: 300, TKN: 550, P: 12, NO3: 0 };

ENG.load = function (S) {
  const L = S.load, std = S.opt.standard, d = new Rep('Tải lượng & lưu lượng');
  const R = { mun: {}, ind: {}, sup: {}, raw: {}, bio: {}, C: {}, Craw: {} };
  d.h('Lưu lượng nước thải');
  let Qsd, Qfd, Qth, Qm, Qd;
  if (L.mode === 'spec') {
    // nước thải khu thương mại/dịch vụ theo diện tích (A 198): q_G·A_E,G (l/(s·ha) × ha) → m³/d
    const QGd = (+L.qG || 0) * (+L.AEG || 0) * 86.4;
    Qsd = L.PE * L.ws / 1000 + QGd; Qfd = L.infPct / 100 * Qsd;
    if (L.PE < 50 || L.PE > 3000000) d.warn('PE = ' + U.fmt(L.PE, 0) + ' ngoài phạm vi 50 – 3 000 000 PE của form tải lượng (Handbook 7.2).');
    if (QGd > 0) d.r('Nước thải khu thương mại theo diện tích', 'q_G·A_E,G', QGd, 'm³/d', U.fmt(+L.qG) + ' l/(s·ha) × ' + U.fmt(+L.AEG) + ' ha');
    d.r('Dân số tương đương', 'PE', L.PE, 'PE');
    d.r('Lưu lượng riêng sinh hoạt', 'w_s,d', L.ws, 'l/(PE·d)');
    d.r('Nước thải sinh hoạt ngày', 'Q_S,d', Qsd, 'm³/d', 'PE·w_s/1000');
    d.r('Nước ngoại lai (thấm)', 'Q_F,d', Qfd, 'm³/d', L.infPct + ' % của Q_S,d');
    for (const p of PAR) R.mun[p] = L.PE * (L.sp[p] || 0) / 1000;
    if (std === 'DWA') {
      Qth = Qsd / L.xQ + Qfd / 24;
      // A 198: Q_M = f_S,QM·Q_S,aM + Q_F,aM (cống chung, f_S,QM theo quy mô – A 198 Hình 33); cống riêng: Q_M = Q_T,h,max
      const fS = +L.fSQM > 0 ? +L.fSQM : 2 * 24 / L.xQ;
      Qm = S.opt.sewer === 'comb' ? Math.max(Qth, fS * Qsd / 24 + Qfd / 24) : Qth;
      d.r('Hệ số giờ (chia ngày)', 'x_Qmax', L.xQ, 'h/d', 'DWA-A 118 / A 198');
      d.r('Lưu lượng giờ lớn nhất mùa khô', 'Q_T,h,max', Qth, 'm³/h', 'Q_S,d/x + Q_F,d/24');
      if (S.opt.sewer === 'comb') {
        d.r('Hệ số nước mưa', 'f_S,QM', +L.fSQM > 0 ? +L.fSQM : 2 * 24 / L.xQ, '–', +L.fSQM > 0 ? 'nhập – A 198 Hình 33 (theo quy mô)' : 'chưa nhập → 2·24/x_Qmax (tương đương Q_M = 2·Q_S,x + Q_F của A 131 cũ)');
        d.r('Lưu lượng thiết kế mùa mưa', 'Q_M', Qm, 'm³/h', 'f_S,QM·Q_S,aM + Q_F,aM (A 198)');
      } else d.r('Lưu lượng thiết kế (cống riêng)', 'Q_M', Qm, 'm³/h', '= Q_T,h,max');
    } else {
      const kP = std === 'MSIG' ? (S.msig && +S.msig.kPeak > 0 ? +S.msig.kPeak : 4.7) : 0, fp = std === 'MSIG' ? kP * Math.pow(L.PE / 1000, -0.11) : L.peakME;
      Qd = Qsd + Qfd;
      Qth = Qm = Qd / 24 * fp;
      d.r('Hệ số đỉnh', 'f_peak', fp, '–', std === 'MSIG' ? 'MSIG: ' + U.fmt(kP, 1) + '·(PE/1000)^-0,11' + (kP === 4.7 ? ' (MSIG 2009)' : '') : 'M&E hình 3-18');
      d.r('Lưu lượng đỉnh', 'Q_peak', Qm, 'm³/h', 'Q_avg·f_peak');
    }
  } else {
    Qd = L.abs.Qd; Qsd = Qd; Qfd = 0; Qth = L.abs.Qh; Qm = Math.max(L.abs.Qm, L.abs.Qh);
    for (const p of PAR) R.mun[p] = (L.abs.conc[p] || 0) * Qd / 1000;
    d.r('Lưu lượng ngày (nhập)', 'Q_d', Qd, 'm³/d');
    d.r('Lưu lượng giờ lớn nhất mùa khô (nhập)', 'Q_T,h,max', Qth, 'm³/h');
    d.r('Lưu lượng thiết kế (nhập)', 'Q_M', Qm, 'm³/h');
  }
  // công nghiệp
  let Qid = 0, Qih = 0;
  if (L.ind.on && L.ind.Qd > 0) {
    Qid = L.ind.Qd; Qih = Qid / L.ind.x;
    for (const p of PAR) R.ind[p] = (L.ind.conc[p] || 0) * Qid / 1000;
    d.r('Nước thải công nghiệp', 'Q_i,d', Qid, 'm³/d', 'giờ lớn nhất ' + U.fmt(Qih) + ' m³/h (x = ' + L.ind.x + ' h/d)');
    Qth += Qih; Qm += Qih;
  } else for (const p of PAR) R.ind[p] = 0;
  // nước thải thương mại/dịch vụ (Gewerbe) với hệ số giờ riêng – đi qua lắng sơ cấp như công nghiệp (Handbook 7.3.4)
  if (L.trade && L.trade.on && L.trade.Qd > 0) {
    const Qgd = L.trade.Qd, Qgh = Qgd / (L.trade.x || 14);
    for (const p of PAR) R.ind[p] += (L.trade.conc[p] || 0) * Qgd / 1000;
    d.r('Nước thải thương mại', 'Q_g,d', Qgd, 'm³/d', 'giờ lớn nhất ' + U.fmt(Qgh) + ' m³/h (x = ' + (L.trade.x || 14) + ' h/d)');
    Qid += Qgd; Qth += Qgh; Qm += Qgh;
  }
  Qd = (L.mode === 'spec' ? Qsd + Qfd : Qd) + Qid;
  R.Qd = Qd; R.Qsd = Qsd; R.Qfd = Qfd; R.Qth = Qth; R.Qm = Qm; R.Qid = Qid;
  R.Qavg = Qd / 24; R.QtaM = Qd / 24;
  R.Qls = Qm / 3.6;
  d.r('Tổng lưu lượng ngày', 'Q_d', Qd, 'm³/d');
  d.r('Lưu lượng trung bình giờ', 'Q_T,aM', R.QtaM, 'm³/h');
  if (L.mode === 'spec' && std === 'DWA' && Qid) d.r('Q_M (gồm công nghiệp)', 'Q_M', Qm, 'm³/h');
  // nước tách bùn tuần hoàn
  for (const p of PAR) R.sup[p] = 0;
  let Qsup = 0;
  if (L.sup.on) {
    if (L.sup.mode === 'pct') for (const p of PAR) R.sup[p] = (L.sup.pct[p] || 0) / 100 * (R.mun[p] + R.ind[p]);
    else if (L.sup.mode === 'vol' || L.sup.mode === 'enh' || L.sup.mode === 'sludge') {
      // lượng nước tách bùn từ cân bằng bùn (Handbook 7.3.3): Q_WS = B_BOD·ÜS_BOD/TS_WS; Q_SI = Q_WS − Q_WS,th
      const BBOD = R.mun.BOD + R.ind.BOD, WS = BBOD * (+L.sup.WSbod || 1.0);
      const Q0 = WS / (+L.sup.TS0 || 8), Q1 = WS / (+L.sup.TS1 || 60), Q2 = WS / (+L.sup.TS2 || 250);
      const cD = Object.assign({}, ENG.SUP_DEW, L.sup.conc2 || {}), cT = Object.assign({}, ENG.SUP_THK, L.sup.conc1 || {});
      if (L.sup.mode === 'vol') { Qsup = Math.max(0, Q0 - Q2); for (const p of PAR) R.sup[p] = (cD[p] || 0) * Qsup / 1000; }
      else { const cpl = L.sup.mode === 'sludge' && S.__sup, q1 = cpl ? S.__sup.q1 : Math.max(0, Q0 - Q1), q2 = cpl ? S.__sup.q2 : Math.max(0, Q1 - Q2); Qsup = q1 + q2; for (const p of PAR) R.sup[p] = ((cT[p] || 0) * q1 + (cD[p] || 0) * q2) / 1000; R.supQ1 = q1; R.supQ2 = q2; }
      R.supWS = WS;
    } else { Qsup = L.sup.Qd; for (const p of PAR) R.sup[p] = (L.sup.conc[p] || 0) * Qsup / 1000; }
  }
  R.Qsup = Qsup;
  if (L.sup.on && (L.sup.mode === 'vol' || L.sup.mode === 'enh' || L.sup.mode === 'sludge')) {
    d.h('Nước tách bùn hoàn lưu (từ cân bằng bùn)');
    d.r('Bùn dư ước tính', 'ÜS_d', R.supWS, 'kg TS/d', 'B_d,BOD·ÜS_BOD, ÜS_BOD = ' + (+L.sup.WSbod || 1.0) + ' kg SS/kg BOD₅');
    if (L.sup.mode === 'vol') d.r('Nước tách bùn', 'Q_SI', Qsup, 'm³/d', 'ÜS/TS_rút (' + (+L.sup.TS0 || 8) + ' kg/m³) − ÜS/TS_khử nước (' + (+L.sup.TS2 || 250) + ' kg/m³); nồng độ ATV Bảng 3 (trung bình)');
    else if (L.sup.mode === 'sludge') { d.r('Nước nén/lắng từ xử lý bùn', 'Q_SI,1', R.supQ1, 'm³/d', S.__sup ? 'ghép với kết quả Xử lý bùn (lặp ' + S.__sup.it + ' lần)' : 'ước tính ban đầu'); d.r('Nước tách nước từ xử lý bùn', 'Q_SI,2', R.supQ2, 'm³/d', 'nồng độ ATV Bảng 3'); }
    else { d.r('Nước nén bùn (bước 1)', 'Q_SI,1', R.supQ1, 'm³/d', 'TS ' + (+L.sup.TS0 || 8) + ' → ' + (+L.sup.TS1 || 60) + ' kg/m³; nồng độ nước nén (Jardin Bảng 6)'); d.r('Nước khử nước bùn (bước 2)', 'Q_SI,2', R.supQ2, 'm³/d', 'TS ' + (+L.sup.TS1 || 60) + ' → ' + (+L.sup.TS2 || 250) + ' kg/m³; nồng độ ATV Bảng 3'); }
    for (const p of PAR) if (R.sup[p]) d.r('Tải ' + PARN[p] + ' hoàn lưu', 'B_SI,' + p, R.sup[p], 'kg/d', 'cộng sau lắng sơ cấp (không giảm theo lắng sơ cấp)');
  }
  // tổng nước thô
  d.h('Tải lượng nước thô (kg/d)');
  for (const p of PAR) {
    R.raw[p] = R.mun[p] + R.ind[p];
    R.Craw[p] = R.raw[p] / Qd * 1000;
    d.r(PARN[p], 'B_d,' + p, R.raw[p], 'kg/d', 'SH ' + U.fmt(R.mun[p]) + (R.ind[p] ? ' + CN ' + U.fmt(R.ind[p]) : '') + ' → C = ' + U.fmt(R.Craw[p]) + ' mg/l');
  }
  // lắng sơ cấp
  const P = { on: !!L.prim.on };
  const after = {};
  if (P.on) {
    d.h('Lắng sơ cấp');
    let eff = {};
    if (std === 'DWA' || std === 'MSIG') {
      for (const p of PAR) eff[p] = U.interp(ENG.PRIM_DWA[p], L.prim.tR);
      P.V = L.prim.tR * R.QtaM; P.H = L.prim.H; P.A = P.V / P.H;
      d.r('Thời gian lưu (theo Q_T,aM)', 't_R', L.prim.tR, 'h');
      d.r('Thể tích cần', 'V_VK', P.V, 'm³', 't_R·Q_T,aM');
    } else {
      const t = L.prim.tR;
      eff.BOD = t / (0.018 + 0.020 * t); eff.TSS = t / (0.0075 + 0.014 * t);
      eff.COD = eff.BOD * 0.9; eff.TKN = 0.1; eff.P = 0.1; eff.NO3 = 0;
      for (const p of ['BOD', 'TSS']) eff[p] /= 100;
      eff.COD = eff.BOD * 0.9;
      P.A = R.Qavg * 24 / L.prim.SOR; P.H = L.prim.tR * R.Qavg / P.A; P.V = P.A * P.H;
      d.r('Tải trọng bề mặt TB', 'SOR', L.prim.SOR, 'm³/(m²·d)', 'M&E bảng 5-19: 30–50');
      d.r('Diện tích', 'A', P.A, 'm²'); d.r('Chiều sâu từ t_R', 'H', P.H, 'm');
      d.r('SOR ở lưu lượng đỉnh', 'SOR_peak', Qm * 24 / P.A, 'm³/(m²·d)', '80–120');
      if (t < 1.5 || t > 2.5) d.warn('M&E Bảng 5-19: thời gian lưu lắng sơ cấp 1,5 – 2,5 h (điển hình 2,0 h); đang chọn ' + U.fmt(t) + ' h.', FX('Đặt t_R = 2,0 h', { 'load.prim.tR': 2.0 }));
      if (Qm * 24 / P.A > 120) d.warn('SOR ở lưu lượng đỉnh > 120 m³/(m²·d) (M&E Bảng 5-19).', FX('Giảm SOR thiết kế để SOR đỉnh ≈ 110', { 'load.prim.SOR': S => U.roundTo(S.load.prim.SOR * 110 / (Qm * 24 / P.A), 1) }));
    }
    P.n = L.prim.n; P.eff = eff;
    if (L.prim.shape === 'rect') { const a = P.A / P.n; P.B = U.ceilTo(Math.sqrt(a / L.prim.Lb), 0.5); P.L = U.ceilTo(a / P.B, 0.5); }
    else { P.D = U.ceilTo(Math.sqrt(4 * P.A / P.n / Math.PI), 0.5); }
    for (const p of PAR) {
      after[p] = R.raw[p] * (1 - eff[p]);
      d.r('Giảm ' + PARN[p], 'η', eff[p] * 100, '%', '→ ' + U.fmt(after[p]) + ' kg/d');
    }
    P.sludgeTS = R.raw.TSS * eff.TSS; // kg/d
    P.sludgeQ = P.sludgeTS / 25; // m3/d với 2,5 % TS (Handbook 15.4.4)
    d.r('Bùn sơ cấp', 'PS_d', P.sludgeTS, 'kg TS/d', '≈ ' + U.fmt(P.sludgeQ) + ' m³/d ở 25 kg/m³');
    P.WL = Qm / P.n / (P.L ? P.B : Math.PI * (P.D - 1));
    if (std === 'ME') { d.r('Tải trọng máng tràn', 'WLR', P.WL * 24, 'm³/(m·d)', 'M&E Bảng 5-19: 125 – 500 (điển hình 250)'); if (P.WL * 24 > 500) d.warn('Tải trọng máng tràn lắng sơ cấp > 500 m³/(m·d) – tăng chiều dài máng (máng hai phía / máng phụ).', FX('Tăng số bể lắng sơ cấp', { 'load.prim.n': S => S.load.prim.n + 1 })); }
  } else for (const p of PAR) after[p] = R.raw[p];
  R.prim = P;
  d.h('Tải lượng vào bể sinh học (sau lắng sơ cấp, gồm nước tách bùn)');
  for (const p of PAR) {
    R.bio[p] = after[p] + R.sup[p];
    R.C[p] = R.bio[p] / Qd * 1000;
    d.r(PARN[p], 'C_' + p + ',ZB', R.C[p], 'mg/l', 'B = ' + U.fmt(R.bio[p]) + ' kg/d' + (R.sup[p] ? ' (nước tách bùn ' + U.fmt(R.sup[p]) + ')' : ''));
  }
  const tkncod = R.C.TKN / R.C.COD;
  R.TKN_COD = tkncod;
  if (tkncod > 0.12) d.warn('Tỷ lệ TKN/COD vào bể = ' + U.fmt(tkncod, 3) + ' > 0,12: khử nitrat có thể thiếu carbon – cân nhắc bỏ/rút ngắn lắng sơ cấp hoặc bổ sung carbon.', L.prim.on && FX('Rút ngắn lắng sơ cấp t_R = 0,5 h', { 'load.prim.tR': 0.5 }), L.prim.on && FX('Bỏ lắng sơ cấp', { 'load.prim.on': false }), S.opt.process === 'ND' && FX('Bổ sung carbon ngoài', { 'bio.extC': true }));
  if (R.C.COD / R.C.BOD < 1.6 || R.C.COD / R.C.BOD > 3.2) d.warn('Tỷ lệ COD/BOD₅ = ' + U.fmt(R.C.COD / R.C.BOD) + ' nằm ngoài dải thường gặp 1,8–2,5.');
  R.d = d;
  return R;
};

/* ---------- Bể lắng II ---------- */
ENG.sst = function (S, RL) {
  const s = S.sst, d = new Rep('Bể lắng thứ cấp (bể lắng II)');
  const R = { n: s.n }; const std = S.opt.standard;
  const Qm = RL.Qm;
  if (std === 'ME') return ENG.sstME(S, RL, d);
  const hop = s.shape === 'hop', vt = s.flow === 'vt' || hop, pv = s.flow === 'pv' && !hop;
  // dòng nửa đứng: A 131 Bảng 11 – nội suy q_SV, q_A, RV cho phép theo h_V/h_H (0,33 → dòng ngang … 0,50 → dòng đứng) – Handbook 7.9.3
  const T11 = [[0.33, 500, 1.60, 0.75], [0.36, 525, 1.65, 0.80], [0.39, 550, 1.75, 0.85], [0.42, 575, 1.80, 0.90], [0.44, 600, 1.85, 0.90], [0.47, 625, 1.90, 0.95], [0.50, 650, 2.00, 1.00]];
  const hr = U.clamp(+s.hVhH || 0.33, 0.33, 0.5), t11 = k => U.interp(T11.map(r => [r[0], r[k]]), hr);
  const qSVmax = pv ? t11(1) : vt ? (+s.qSVmax > 500 ? +s.qSVmax : 650) : (+s.qSVmax || 500), qAmax = pv ? t11(2) : vt ? (+s.qAmax > 1.6 ? +s.qAmax : 2.0) : (+s.qAmax || 1.6), RVmax = pv ? t11(3) : vt ? 1.0 : 0.75;
  d.h('Thông số bùn & cô đặc (DWA-A 131:2016, mục 6)');
  d.r('Lưu lượng thiết kế', 'Q_M', Qm, 'm³/h');
  d.r('Chỉ số thể tích bùn', 'ISV', s.ISV, 'ml/g', 'ISV ≤ 180; tải hữu cơ thấp 75–100, cao 100–150');
  if (s.ISV > 180) d.warn('ISV > 180 ml/g – vượt giới hạn A 131 (mục 4.2.1).', FX('Đặt ISV = 150 (chọn selector chống bùn khó lắng)', { 'sst.ISV': 150, 'opt.selector': S => S.opt.line === 'CAS' ? true : S.opt.selector }));
  if (pv) d.r('Tỷ lệ h_V/h_H (dòng nửa đứng)', 'h_V/h_H', hr, '–', 'A 131 Bảng 11: q_SV ≤ ' + U.fmt(qSVmax, 0) + ', q_A ≤ ' + U.fmt(qAmax, 2) + ', RV ≤ ' + U.fmt(RVmax, 2));
  if (s.RV > RVmax + 1e-9) d.warn('RV = ' + s.RV + ' > ' + U.fmt(RVmax, 2) + ' cho phép ở Q_M (' + (pv ? 'A 131 Bảng 11' : vt ? 'dòng đứng' : 'dòng ngang') + ').', FX('Đặt RV = ' + U.fmt(RVmax, 2), { 'sst.RV': +RVmax.toFixed(2) }));
  d.r('Tỷ lệ bùn tuần hoàn', 'RV', s.RV, '–');
  d.r('Thời gian cô đặc', 't_E', s.tE, 'h', 'C: 1,5–2; N: 1–1,5; DN: 2–2,5');
  if (s.tE > 2.0) d.info('t_E > 2,0 h: nguy cơ bùn nổi do khử nitrat trong bể lắng (A 131).');
  const TSBS = 1000 / s.ISV * Math.cbrt(s.tE);
  const rRS = hop ? 1.0 : s.rRS;   // bể phễu: SS_RS = SS_BS (A 131, Handbook 7.9.3)
  const TSRS = rRS * TSBS;
  const TSAT = s.RV * TSRS / (1 + s.RV);
  d.r('TS đáy bể lắng', 'TS_BS', TSBS, 'kg/m³', '1000/ISV·t_E^(1/3)');
  d.r('TS bùn tuần hoàn', 'TS_RS', TSRS, 'kg/m³', hop ? '= TS_BS (bể đáy phễu)' : (s.rRS) + '·TS_BS (gạt bùn 0,7; hút bùn 0,5–0,7)');
  d.r('TS lớn nhất bể aerotank', 'TS_BB,max', TSAT, 'kg/m³', 'RV·TS_RS/(1+RV)');
  R.TSBS = TSBS; R.TSRS = TSRS; R.TSmax = TSAT;
  if (TSAT > 5) d.warn('TS_BB > 5 kg/m³ – A 131 khuyến nghị không vượt 5 kg/m³.', FX('Giới hạn TS_BB = 5 kg/m³', { 'bio.TS': 5 }), FX('Giảm t_E', { 'sst.tE': S => Math.max(1, +(S.sst.tE * Math.pow(5 / TSAT, 3)).toFixed(2)) }));
  if (s.ISV > 150 && TSAT > 2.5) d.info('ISV > 150 ml/g và TS_BB > 2,5 kg/m³: A 131 mục 4.1.3 khuyến nghị TS_BB < 2,5 kg/m³ khi bùn lắng kém.');
  const TS = TSAT;
  const VSV = TS * s.ISV; R.VSV = VSV; R.TS = TS;
  d.r('Thể tích bùn so sánh', 'VSV', VSV, 'l/m³', 'TS·ISV ≤ 600');
  if (VSV > 600) d.warn('VSV > 600 l/m³.', FX('Giảm TS_BB để VSV = 600', { 'bio.TS': +(600 / s.ISV).toFixed(2) }));
  const qA = Math.min(qSVmax / VSV, qAmax);
  d.r('Tải trọng thể tích bùn cho phép', 'q_SV', qSVmax, 'l/(m²·h)', pv ? 'dòng nửa đứng – A 131 Bảng 11' : vt ? 'dòng đứng ≤ 650' : 'dòng ngang ≤ 500');
  d.r('Tải trọng bề mặt', 'q_A', qA, 'm/h', 'min(q_SV/VSV; ' + qAmax + ')');
  const Areq = Qm / qA; R.Areq = Areq;
  d.r('Diện tích cần (tổng)', 'A_NB', Areq, 'm²', 'Q_M/q_A');
  if (hop) return ENG.sstHop(S, RL, d, R, { Areq, qA, VSV, TS, TSBS, qSVmax });
  d.h('Kích thước (' + s.n + ' bể)');
  const Qp = Qm * (1 + s.RV) / s.n / 3600; // m3/s mỗi bể (dòng vào)
  let Aeff, D, Din = 0, B, L, Lin = 0;
  const a1 = Areq / s.n;
  if (s.shape === 'circ') {
    // đường kính công trình vào D_D = 1/6·√(4/π·A) (Handbook 7.9.3, mọi kiểu bể)
    const DinMin = Math.sqrt(4 * a1 / Math.PI) / 6;
    Din = s.Dinlet > 0 ? s.Dinlet : U.ceilTo(DinMin, 0.25);
    const Dmin = Math.sqrt(4 * (a1 + Math.PI * Din * Din / 4) / Math.PI);
    D = s.D > 0 ? s.D : U.ceilTo(Dmin, 0.5);
    Aeff = Math.PI * (D * D - Din * Din) / 4;
    d.r('Đường kính tối thiểu', 'D_min', Dmin, 'm');
    d.r('Đường kính công trình vào (tâm)', 'D_E', Din, 'm', 'tối thiểu ' + U.fmt(DinMin) + ' = 1/6·√(4·A/π)');
    d.r('Đường kính chọn', 'D', D, 'm');
    if (D < Dmin - 1e-6) d.err('Đường kính chọn nhỏ hơn yêu cầu.', FX('Đặt D = ' + U.fmt(U.ceilTo(Dmin, 0.5)) + ' m', { 'sst.D': U.ceilTo(Dmin, 0.5) }), FX('Tự tính đường kính', { 'sst.D': 0 }));
    R.D = D; R.Din = Din; R.Dmin = Dmin; R.DinMin = DinMin;
  } else {
    B = s.B > 0 ? s.B : U.ceilTo(Math.min(Math.max(Math.sqrt(a1 / 6), 4), 12), 0.5);
    Lin = 0; // tạm, cập nhật sau theo chiều sâu
    L = s.L > 0 ? s.L : 0;
    R.B = B;
  }
  // các vùng chiều sâu
  const zones = (qa0) => {
    // dòng đứng: chiều sâu tính với q_SV = 600 l/(m²·h) (Handbook 7.9.3, A 131:2000)
    const qa = vt ? Math.min(qa0, 600 / VSV) : qa0;
    const qsv = qa * VSV;
    const h1 = 0.5;
    const h2 = 0.5 * qa * (1 + s.RV) / (1 - VSV / 1000);
    const h3 = 1.5 * 0.3 * qsv * (1 + s.RV) / 500;
    const h4 = TS * qa * (1 + s.RV) * s.tE / TSBS;
    return { qsv, h1, h2, h3, h4, h: h1 + h2 + h3 + h4 };
  };
  if (s.shape === 'rect') {
    // vùng vào ≈ chiều sâu bể không tính vào diện tích hữu ích
    let z = zones(qA); Lin = s.Lin > 0 ? s.Lin : z.h;   // vùng vào ≈ chiều sâu nước (sửa được)
    if (!L) L = U.ceilTo(a1 / B + Lin, 0.5);
    Aeff = B * (L - Lin);
    R.L = L; R.Lin = Lin;
    d.r('Chiều rộng', 'B', B, 'm'); d.r('Chiều dài', 'L', L, 'm', 'gồm vùng vào ' + U.fmt(Lin) + ' m');
    if (L / B < 3) d.warn('L/B < 3 – bể chữ nhật nên có L/B ≥ 4.', FX('Giảm chiều rộng B (L/B ≈ 4)', { 'sst.B': U.ceilTo(Math.sqrt(a1 / 4), 0.5), 'sst.L': 0 }));
  }
  const qAact = Qm / s.n / Aeff;
  const zAct = zones(qAact);
  // chiều sâu tính theo q_A thiết kế (an toàn, như trình tự A 131); nếu q_A thực lớn hơn thì theo q_A thực
  const z = zones(Math.max(qA, qAact));
  R.Aeff = Aeff; R.Atot = Aeff * s.n; R.qA = qAact; R.qSV = zAct.qsv; R.zones = z;
  d.r('Diện tích hữu ích mỗi bể', 'A', Aeff, 'm²');
  d.r('Tải trọng bề mặt thực', 'q_A', qAact, 'm/h');
  d.r('Tải trọng thể tích bùn thực', 'q_SV', zAct.qsv, 'l/(m²·h)');
  if (zAct.qsv > qSVmax * 1.0001) d.err('q_SV vượt giới hạn ' + qSVmax + ' l/(m²·h).', FX('Tự tính kích thước bể lắng', { 'sst.D': 0, 'sst.B': 0, 'sst.L': 0 }), FX('Thêm 1 bể lắng', { 'sst.n': s.n + 1 }));
  d.h('Các vùng chiều sâu (tại 2/3 đường dòng, q_A = ' + U.fmt(Math.max(qA, qAact), 3) + ' m/h)');
  d.r('Vùng nước trong', 'h₁', z.h1, 'm', '0,5 m');
  d.r('Vùng tách/dòng về', 'h₂', z.h2, 'm', '0,5·q_A·(1+RV)/(1−VSV/1000)');
  d.r('Vùng dòng mật độ & chứa', 'h₃', z.h3, 'm', '1,5·0,3·q_SV·(1+RV)/500');
  d.r('Vùng cô đặc', 'h₄', z.h4, 'm', 'TS·q_A·(1+RV)·t_E/TS_BS');
  const hmin = Math.max(z.h, vt ? 0 : 3.0);
  const H = (s.shape === 'circ' ? s.Htot : s.Hrect) > 0 ? (s.shape === 'circ' ? s.Htot : s.Hrect) : U.ceilTo(hmin, 0.05);
  d.r('Tổng chiều sâu tối thiểu', 'h_ges', z.h, 'm', vt ? '' : '≥ 3,0 m');
  d.r('Chiều sâu chọn (2/3 đường dòng)', 'H', H, 'm');
  if (H < z.h - 1e-6) d.err('Chiều sâu chọn nhỏ hơn tổng các vùng.', FX('Đặt chiều sâu = ' + U.fmt(U.ceilTo(z.h, 0.05)) + ' m', s.shape === 'circ' ? { 'sst.Htot': U.ceilTo(z.h, 0.05) } : { 'sst.Hrect': U.ceilTo(z.h, 0.05) }), FX('Tự tính chiều sâu', { 'sst.Htot': 0, 'sst.Hrect': 0 }));
  R.H = H; R.hmin = z.h;
  if (s.shape === 'circ') {
    const fl = (D - Din) / 2;
    R.hEdge = H - s.slope * fl / 3;
    R.hCenter = H + s.slope * fl * 2 / 3;
    R.V = Aeff * H;
    d.r('Chiều sâu thành', 'h_R', R.hEdge, 'm', 'độ dốc đáy ' + U.fmt(s.slope, 3) + ' (≥ 2,5 m)');
    d.r('Chiều sâu tại công trình vào', 'h_M', R.hCenter, 'm');
    const a226 = S.opt.guide === 'A226' && S.opt.standard === 'DWA';
    if (!vt && R.hEdge < (a226 ? 3.5 : 2.5)) d.warn('Chiều sâu thành < ' + (a226 ? '3,5 m (A 226)' : '2,5 m') + '.', FX('Tăng chiều sâu để thành đạt ' + (a226 ? '3,5' : '2,5') + ' m', { 'sst.Htot': U.ceilTo(H + (a226 ? 3.5 : 2.5) - R.hEdge, 0.05) }), FX('Giảm độ dốc đáy 1:20', { 'sst.slope': 0.05 }));
    if (!vt && R.hCenter < 4.0) d.warn('Chiều sâu tại công trình vào (tâm) < 4,0 m (Handbook 7.9.3).', FX('Tăng chiều sâu để tâm đạt 4,0 m', { 'sst.Htot': U.ceilTo(H + 4.0 - R.hCenter, 0.05) }));
    if (a226 && H < 4.0) d.warn('A 226: tổng chiều sâu tại 2/3 đường dòng ≥ 4,0 m.', FX('Đặt chiều sâu 4,0 m', { 'sst.Htot': 4.0 }));
    d.r('Thể tích mỗi bể', 'V', R.V, 'm³');
    // công trình vào
    d.h('Công trình phân phối vào (tâm)');
    const dPipe = Math.sqrt(4 * Qp / Math.PI / s.vE);
    const hIn = z.h1 + z.h2 + z.h3;
    const Vin = Math.PI * Din * Din / 4 * hIn;
    const Ain = Math.PI * Din * s.gap, u = Qp / Ain;
    const FD = u / Math.sqrt(9.81 * 0.001 * s.gap);
    // năng lượng vào P_E = 0,5·ρ·v_E²·Q_M·(1 + RV) (Handbook 7.9.3); thời gian keo tụ V_E/Q 60 – 180 s
    const PE = 0.5 * 1000 * s.vE * s.vE * Qp;
    const G = Math.sqrt(PE / (0.001 * Vin)), tFl = Vin / Qp;
    Object.assign(R, { dPipe, hIn, Vin, u, FD, G, tFl });
    d.r('Đường kính ống vào (v_E = ' + s.vE + ' m/s)', 'd_E', dPipe * 1000, 'mm', 'chọn DN ' + U.dnUp(dPipe * 1000));
    d.r('Chiều sâu vào (đỉnh vùng cô đặc)', 'h_E', hIn, 'm');
    d.r('Thể tích công trình vào', 'V_E', Vin, 'm³');
    d.r('Khe cửa vào', 'h_gap', s.gap * 1000, 'mm');
    d.r('Vận tốc qua cửa vào', 'u', u * 100, 'cm/s', '5–7 cm/s');
    d.r('Số Froude mật độ', 'F_D', FD, '–', '≈ 1');
    d.r('Gradient vận tốc keo tụ', 'G', G, '1/s', '40–80; P_E = 0,5·ρ·v_E²·Q_M·(1+RV)');
    d.r('Thời gian keo tụ', 't_F', tFl, 's', 'V_E/(Q_M·(1+RV)) – 60 (DWA) đến 180 s (Holthausen)');
    if (tFl < 60 || tFl > 180) d.info('Thời gian keo tụ ' + U.fmt(tFl, 0) + ' s ngoài 60 – 180 s – chỉnh đường kính/chiều sâu công trình vào.');
    if (s.gap < 0.3 || s.gap > 0.6) d.info('Khe cửa vào nên 30 – 60 cm.');
    if (u > 0.08) d.warn('Vận tốc cửa vào > 8 cm/s – tăng đường kính công trình vào hoặc khe.', FX('Tăng khe cửa vào (u ≈ 6 cm/s)', { 'sst.gap': U.clamp(U.ceilTo(s.gap * u / 0.06, 0.05), 0.3, 0.6) }), FX('Tăng đường kính công trình vào', { 'sst.Dinlet': U.ceilTo(Din * u / 0.06, 0.25) }));
  } else {
    R.V = Aeff * H;
    d.r('Thể tích mỗi bể (hữu ích)', 'V', R.V, 'm³');
  }
  // máng thu nước trong
  d.h('Máng thu nước trong');
  let Lw;
  if (s.shape === 'circ') Lw = Math.PI * (R.D - 1.0) * (s.weir === 'two' ? 2 : 1);
  else Lw = R.B * (s.weir === 'two' ? 2 : 1) * Math.max(1, Math.round(R.L / 15));
  const qw = Qm / s.n / Lw, qwLim = s.weir === 'two' ? 6 : 10;
  R.Lw = Lw; R.qw = qw;
  d.r('Chiều dài tràn mỗi bể', 'L_w', Lw, 'm', s.weir === 'two' ? 'tràn 2 phía' : 'tràn 1 phía');
  d.r('Tải trọng tràn', 'q_w', qw, 'm³/(m·h)', '≤ ' + qwLim + (s.ISV > 150 ? ' (giảm khi ISV > 150)' : ''));
  if (qw > qwLim) d.warn('Tải trọng tràn vượt ' + qwLim + ' m³/(m·h) – chọn tràn 2 phía hoặc thêm máng.', s.weir !== 'two' && FX('Chọn máng tràn 2 phía', { 'sst.weir': 'two' }), FX('Thêm 1 bể lắng', { 'sst.n': s.n + 1 }));
  if (s.outlet === 'pipes') {   // ống thu nước đục lỗ ngập (Handbook 7.9.4): v_lỗ 0,25; ống 1,0; ống ra 1,0 m/s
    const q1 = Qm / s.n / 3600, nP = Math.max(1, Math.round(s.nPipes || 4)), dH = s.dHole || 0.03;
    const dP = Math.sqrt(4 * q1 / nP / Math.PI / 1.0), nH = Math.ceil(q1 / nP / 0.25 / (Math.PI * dH * dH / 4)), dO = Math.sqrt(4 * q1 / Math.PI / 1.0);
    R.outPipes = { nP, dP, nH, dO };
    d.h('Ống thu nước đục lỗ ngập');
    d.r('Số ống thu mỗi bể', 'n', nP, '', 'Ø ống ≈ DN ' + U.dnUp(dP * 1000) + ' (1,0 m/s)');
    d.r('Số lỗ mỗi ống', 'n_L', nH, '', 'Ø lỗ ' + U.fmt(dH * 1000, 0) + ' mm, v_lỗ 0,25 m/s');
    d.r('Ống thu chung', 'd_ab', dO * 1000, 'mm', 'DN ' + U.dnUp(dO * 1000) + ' (1,0 m/s)');
    if (!vt) d.info('Ống thu đục lỗ ngập chủ yếu cho bể lắng dòng đứng (Handbook 7.9.4).');
  }
  R.QRS = s.RV * Qm;
  d.r('Lưu lượng bùn tuần hoàn', 'Q_RS', R.QRS, 'm³/h', 'RV·Q_M');
  if (S.opt.sewer === 'comb' && s.RV > 0.75) d.warn('Cống chung: A 131 khuyến nghị RV ≤ 0,75 tại Q_M (bể dòng ngang).', FX('Đặt RV = 0,75', { 'sst.RV': 0.75 }));
  if (s.RV * Qm > (vt ? 2.0 : 1.5) * RL.Qth) d.info('Q_RS > ' + (vt ? '2,0' : '1,5') + '·Q_T,h – kiểm tra giới hạn mùa khô.');
  R.d = d;
  return R;
};

/* Bể lắng II đáy phễu (Trichter): A 131 (Handbook 7.9.3, tr. 133–135) hoặc A 226 (vách 1,7:1, tr. 136–137) */
ENG.sstHop = function (S, RL, d, R, c) {
  const s = S.sst, Qm = RL.Qm, a1 = c.Areq / s.n, d0 = 0.4, a226 = S.opt.guide === 'A226' && S.opt.standard === 'DWA';
  const Qp = Qm * (1 + s.RV) / s.n / 3600;
  // vùng chiều sâu như bể trụ, dòng đứng với q_SV = 600 l/(m²·h)
  const qa = Math.min(c.qA, 600 / c.VSV), qsv = qa * c.VSV;
  const h1 = 0.5, h2 = 0.5 * c.qA * (1 + s.RV) / (1 - c.VSV / 1000), h3 = 1.5 * 0.3 * qsv * (1 + s.RV) / 500, h4 = c.TS * c.qA * (1 + s.RV) * s.tE / c.TSBS;
  const hz = [h1, h2, h3, h4], hs = h1 + h2 + h3 + h4;
  const DinMin = Math.sqrt(4 * a1 / Math.PI) / 6, Din = s.Dinlet > 0 ? s.Dinlet : U.ceilTo(DinMin, 0.01), AD = Math.PI * Din * Din / 4;
  const Dmin = Math.sqrt(4 * (a1 + AD) / Math.PI), D = s.D > 0 ? s.D : U.ceilTo(Dmin, 0.1), Atop = Math.PI * D * D / 4;
  d.h('Bể lắng đáy phễu ' + (a226 ? '(DWA-A 226)' : '(DWA-A 131)') + ' – ' + s.n + ' bể');
  d.r('Diện tích cần mỗi bể', 'A_NB', a1, 'm²', 'q_A = ' + U.fmt(c.qA, 2) + ' m/h');
  d.r('Đường kính công trình vào', 'D_D', Din, 'm', 'tối thiểu 1/6·√(4·A/π) = ' + U.fmt(DinMin));
  d.r('Đường kính tối thiểu / chọn', 'D', D, 'm', 'D_min = ' + U.fmt(Dmin));
  if (D < Dmin - 1e-6) d.err('Đường kính chọn nhỏ hơn yêu cầu.', FX('Tự tính đường kính', { 'sst.D': 0 }));
  let Hc, Hcyl, H, Vreal, ang;
  if (!a226) {
    ang = U.clamp(+s.cone || 60, 45, 85);
    const Vmin = a1 * hs;   // thể tích cần = A·Σh_i (bể trụ tương đương)
    const he = h1 + h2 + h3 / 2;   // mép dưới công trình vào ở giữa vùng chứa
    Hc = (D - d0) / 2 * Math.tan(ang * Math.PI / 180);
    const Vc = Math.PI / 12 * Hc * (D * D + D * d0 + d0 * d0);
    Hcyl = Math.max(0.5, (Vmin - Vc + AD * he) / Atop);
    H = Hcyl + Hc; Vreal = Atop * Hcyl + Vc - AD * he;
    d.r('Tổng chiều sâu các vùng (bể trụ)', 'Σh', hs, 'm', 'h₁ ' + U.fmt(h1) + ' / h₂ ' + U.fmt(h2) + ' / h₃ ' + U.fmt(h3) + ' / h₄ ' + U.fmt(h4) + ' m; q_SV ' + U.fmt(qsv, 0));
    d.r('Thể tích cần mỗi bể', 'V_min', Vmin, 'm³', 'A_NB·Σh');
    d.r('Góc phễu', 'α', ang, '°', '60 – 80° (< 60° không cho phép)');
    d.r('Chiều cao phễu', 'H_Trichter', Hc, 'm', '(D − 0,40)/2·tan α; đáy phễu Ø 0,40 m');
    d.r('Chiều cao phần trụ', 'H_zyl', Hcyl, 'm', '≥ 0,5 m');
    d.r('Tổng chiều sâu nước', 'H_ges', H, 'm', '≤ 15 m');
    d.r('Thể tích thực mỗi bể', 'V_NB', Vreal, 'm³', 'π/4·D²·H_zyl + V_phễu − A_D·h_e (h_e = ' + U.fmt(he) + ' m)');
    // phân vùng trong phễu: lấp từ đáy V₄, V₃, V₂, V₁
    const vol = y => y <= Hc ? Math.PI / 12 * y * (d0 * d0 + d0 * (d0 + (D - d0) * y / Hc) + (d0 + (D - d0) * y / Hc) ** 2) : Vc + Atop * (y - Hc);
    const Vz = [a1 * h1 + AD * h1, a1 * h2 + AD * h2, a1 * h3 + AD * h3 / 2, a1 * h4];
    let acc = 0, y0 = 0; const lev = [];
    for (const k of [3, 2, 1, 0]) { acc += Vz[k]; const y = Math.min(H, U.bisect(y => vol(y) - acc, 0, H + 50, 1e-4)); lev[k] = y - y0; y0 = y; }
    lev[0] = Math.max(0.5, H - (y0 - lev[0]));
    d.r('Vùng trong phễu h₁ / h₂ / h₃ / h₄', '', lev.map(x => U.fmt(x)).join(' / '), 'm', 'lấp từ đáy: V₄, V₃, V₂, V₁ (h₁ ≥ 0,5 m)');
    if (ang < 60) d.warn('Góc phễu < 60° – bùn không trượt xuống được (A 131).', FX('Đặt góc phễu 60°', { 'sst.cone': 60 }));
    if (ang > 80) d.info('Góc phễu > 80° – phễu rất sâu.');
    if (H > 15) d.warn('Chiều sâu bể phễu > 15 m – chọn bể lắng dòng ngang có cào bùn.', FX('Chọn bể tròn dòng ngang', { 'sst.shape': 'circ', 'sst.flow': 'hz' }), FX('Thêm 1 bể phễu', { 'sst.n': s.n + 1 }));
    if (Vreal < Vmin - 1e-3) d.err('Thể tích thực nhỏ hơn yêu cầu.');
    Object.assign(R, { he, Vmin });
  } else {
    // A 226: diện tích tại mực nước vào; h_e = 0,3·h_ges; h_z ≤ 1 m; vách 1,7:1 (đứng:ngang)
    const r = Math.sqrt((a1 + AD) / Math.PI), hzyl = U.clamp(+s.hz226 || 1.0, 0.3, 1.0);
    const H1 = 1.7 * (r - d0 / 2) + hzyl, H2 = 1.7 * (r - d0 / 2) / 0.7;
    H = Math.max(H1, H2); Hcyl = hzyl; Hc = H - hzyl;
    const rNB = d0 / 2 + Hc / 1.7, Dn = 2 * rNB;
    Vreal = Math.PI / 3 * Hc * (rNB * rNB + rNB * d0 / 2 + d0 * d0 / 4) + Math.PI * rNB * rNB * hzyl;
    ang = Math.atan(1.7) * 180 / Math.PI;
    d.r('Bán kính cần tại mực nước vào', 'r', r, 'm', 'A_NB,theo = Q/q_A (gồm công trình vào)');
    d.r('Chiều cao phần trụ', 'h_z', hzyl, 'm', '≤ 1,0 m');
    d.r('Tổng chiều sâu', 'h_ges', H, 'm', 'h_e = 0,3·h_ges = ' + U.fmt(0.3 * H) + ' m');
    d.r('Chiều cao phần phễu', 'h_t', Hc, 'm', 'vách 1,7 : 1');
    d.r('Đường kính tại mặt nước', 'D_NB', Dn, 'm', 'r_NB = (h_ges − h_z)/1,7 + 0,20');
    d.r('Thể tích mỗi bể', 'V', Vreal, 'm³');
    if (Qm > 70) d.warn('A 226: bể phễu chỉ hợp lý đến Q ≈ 70 m³/h (nước thải sinh hoạt) / 100 m³/h (hệ thống thoát nước mưa).', FX('Chọn bể tròn dòng ngang', { 'sst.shape': 'circ', 'sst.flow': 'hz' }));
    R.Dnb = Dn;
  }
  Object.assign(R, { D: a226 ? R.Dnb : D, Din, Dmin, DinMin, H, Hc, Hcyl, V: Vreal, cone: ang, Aeff: Atop - AD, Atot: (Atop - AD) * s.n, qA: Qm / s.n / (Atop - AD), zones: { h1, h2, h3, h4, h: hs, qsv }, hop: true, hEdge: Hcyl, hCenter: H });
  R.qSV = R.qA * c.VSV;
  d.r('Tải trọng bề mặt thực', 'q_A', R.qA, 'm/h'); d.r('Tải trọng thể tích bùn thực', 'q_SV', R.qSV, 'l/(m²·h)', '≤ ' + U.fmt(c.qSVmax, 0));
  if (R.qSV > c.qSVmax * 1.0001) d.err('q_SV vượt giới hạn ' + U.fmt(c.qSVmax, 0) + ' l/(m²·h).', FX('Tự tính đường kính', { 'sst.D': 0 }), FX('Thêm 1 bể', { 'sst.n': s.n + 1 }));
  // công trình vào & máng
  R.dPipe = Math.sqrt(4 * Qp / Math.PI / s.vE);
  d.r('Đường kính ống vào (v_E = ' + s.vE + ' m/s)', 'd_E', R.dPipe * 1000, 'mm', 'chọn DN ' + U.dnUp(R.dPipe * 1000));
  const Lw = Math.PI * (D - 0.5) * (s.weir === 'two' ? 2 : 1), qw = Qm / s.n / Lw, qwLim = s.weir === 'two' ? 6 : 10;
  R.Lw = Lw; R.qw = qw;
  d.r('Chiều dài tràn mỗi bể', 'L_w', Lw, 'm'); d.r('Tải trọng tràn', 'q_w', qw, 'm³/(m·h)', '≤ ' + qwLim);
  if (qw > qwLim) d.warn('Tải trọng tràn vượt ' + qwLim + ' m³/(m·h).', s.weir !== 'two' && FX('Chọn máng tràn 2 phía', { 'sst.weir': 'two' }));
  R.QRS = s.RV * Qm;
  d.r('Lưu lượng bùn tuần hoàn', 'Q_RS', R.QRS, 'm³/h', 'RV·Q_M (hút bùn từ đáy phễu)');
  if (Qm > 150) d.info('Bể phễu chỉ kinh tế ở tải thủy lực nhỏ – lưu lượng lớn nên dùng bể dòng ngang có cào bùn (Handbook 7.9.3).');
  R.d = d;
  return R;
};

ENG.sstME = function (S, RL, d) {
  const s = S.sst, R = { n: s.n };
  const MLSS = S.bio.TS > 0 ? S.bio.TS : 3.5;
  const Qavg = RL.Qavg, Qpk = RL.Qm, QR = s.RV * Qavg;
  d.h('Bể lắng II theo M&E (bảng 8-7)');
  const A1 = Qavg * 24 / s.ME_SOR, A2 = Qpk * 24 / 40, A3 = (Qavg + QR) * MLSS / s.ME_SLR, A4 = (Qpk + QR) * MLSS / 8;
  const Areq = Math.max(A1, A2, A3, A4);
  d.r('MLSS', 'X', MLSS, 'kg/m³');
  d.r('SOR trung bình', 'SOR_avg', s.ME_SOR, 'm³/(m²·d)', '16–28 → A = ' + U.fmt(A1) + ' m²');
  d.r('SOR đỉnh', 'SOR_pk', 40, 'm³/(m²·d)', '40–64 → A = ' + U.fmt(A2) + ' m²');
  d.r('SLR trung bình', 'SLR_avg', s.ME_SLR, 'kg/(m²·h)', '4–6 → A = ' + U.fmt(A3) + ' m²');
  d.r('SLR đỉnh', 'SLR_pk', 8, 'kg/(m²·h)', '≤ 8 → A = ' + U.fmt(A4) + ' m²');
  d.r('Diện tích cần', 'A', Areq, 'm²');
  const a1 = Areq / s.n;
  const D = s.D > 0 ? s.D : U.ceilTo(Math.sqrt(4 * a1 / Math.PI), 0.5);
  const H = s.Htot > 0 ? s.Htot : 4.5;
  Object.assign(R, { D, Din: U.ceilTo(D * 0.15, 0.25), Aeff: Math.PI * D * D / 4, H, hEdge: H, hCenter: H + s.slope * D / 2, TS: MLSS, TSmax: MLSS, Areq, VSV: MLSS * s.ISV, TSRS: MLSS * (1 + s.RV) / s.RV, TSBS: MLSS * (1 + s.RV) / s.RV / s.rRS });   // bùn tuần hoàn theo cân bằng khối lượng
  R.Atot = R.Aeff * s.n; R.qA = Qpk / R.Atot; R.qSV = R.qA * R.VSV; R.V = R.Aeff * H;
  d.r('Đường kính', 'D', D, 'm'); d.r('Chiều sâu thành', 'SWD', H, 'm', '4,0–5,5 m');
  R.zones = { h1: 0.5, h2: H * 0.4, h3: H * 0.2, h4: H * 0.4 - 0.5, h: H };
  const Lw = Math.PI * (D - 1) * (s.weir === 'two' ? 2 : 1); R.Lw = Lw; R.qw = Qpk / s.n / Lw;
  d.r('Tải trọng tràn', 'WLR', R.qw * 24, 'm³/(m·d)', '≤ 375 khuyến nghị');
  R.QRS = s.RV * Qpk; R.d = d;
  return R;
};
