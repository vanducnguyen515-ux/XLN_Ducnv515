/* AquaDesign VN – Engine công nghệ nhà cung cấp:
   • ICEAS (Sanitaire/Xylem) – thiết kế theo SRT, trình tự 10 bước (SRT → bùn dư → khối bùn → bể → khử nitrat → P → oxy → decanter → mùa)
   • C-Tech (SFC Environmental) – trình tự Basic Engineering Package (F/M theo MLVSS, ΔH gạn, selector, RAS)
   Cả hai được đối chiếu với DWA-A 131:2016 (tuổi bùn hiếu khí yêu cầu, cân bằng N, bùn dư, nhu cầu O₂ dùng cho bước Sục khí).
   • Kubota MBR – màng tấm phẳng ngập (ES/EK/RW/SP): thông lượng TB/đỉnh, chu kỳ lọc–nghỉ, lọc trọng lực/xi-phông/hút, CIP tại chỗ. */
'use strict';

// động học AOB (M&E 5th bảng 8-14) – dùng cho kiểm tra SRT kiểu Sanitaire
ENG.muAOB = (T, NH4, DO) => {
  const N = Math.max(0.5, NH4);
  return 0.90 * Math.pow(1.072, T - 20) * N / (N + 0.5) * DO / (DO + 0.5) - 0.17 * Math.pow(1.029, T - 20);
};
// tuổi bùn hiếu khí thiết kế DWA (cùng công thức với ENG.bio)
ENG.tAerDWA = (S, RL) => {
  const b = S.bio, BCOD = RL.bio.COD;
  let fN = U.clamp(U.interp([[2400, 2.4], [12000, 1.5]], BCOD), 1.4, 2.4);
  if (b.fNsel > 0) fN = b.fNsel;
  const PF = b.PF > 0 ? b.PF : U.interp(ENG.PF_TAB[b.SNH4ctl >= 10 ? 10 : 5], fN);
  return Math.max(2, PF * 3.4 * Math.pow(1.103, 15 - b.T));
};
ENG.tStabDWA = S => S.opt.stab ? S.bio.fBstab / ((1 - S.bio.fBstab - S.bio.fiStab) * S.bio.b * Math.pow(1.072, S.bio.T - 15)) : 0;

// chạy ENG.bio ở tuổi bùn cho trước (khử nitrat theo thời gian không sục khí) để lấy cân bằng N, bùn dư, OV
ENG.bioAt = function (S, RL, tSS, TS) {
  const S2 = U.clone(S);
  S2.bio.tSSfix = tSS; S2.opt.dn = 'int';
  const B = ENG.bio(S2, RL, { TS, fr: 1 });
  // các kiểm tra kiểu dòng liên tục không áp dụng cho bể theo mẻ (đã kiểm tra trong module nhà cung cấp)
  B.d.msgs = B.d.msgs.filter(m => !/^Tuổi bùn chọn|^V_D\/V_BB/.test(m.t));
  B.d.title = 'Đối chiếu DWA-A 131 tại tuổi bùn thiết kế ' + U.fmt(tSS, 1) + ' d';
  return B;
};

/* Đối chiếu kết quả mô hình DWA-A 131 (chạy tại tuổi bùn thiết kế của nhà cung cấp) với dải khuyến cáo của DWA-A 131:2016.
   ctx: { tech, fAer (phân suất thời gian sục khí), fDN (phân suất thời gian không sục khí), MLSS kg/m³, MLSSlvl, tSSsrc } */
ENG.dwaCompare = function (S, RL, B, ctx) {
  const d = B.d, b = S.bio, o = S.opt, proc = o.process, T = B.T;
  const inR = (v, a, z) => v >= a - 1e-9 && v <= z + 1e-9;
  d.h('Giải thích phần đối chiếu');
  d.f(`Mô hình cân bằng COD của DWA-A 131:2016 được chạy lại ở đúng tuổi bùn thiết kế t_TS = ${U.fmt(B.tSS, 1)} d do phương pháp ${ctx.tech} ấn định (${ctx.tSSsrc}), với khử nitrat gián đoạn trong các pha không sục khí. Kết quả (bùn dư ÜS, cân bằng N, nhu cầu O₂) không phụ thuộc phương pháp nhà cung cấp nên dùng để kiểm tra chéo: tuổi bùn hiếu khí có đủ cho nitrat hóa ở ${U.fmt(T, 1)} °C, thời gian không sục khí có đủ cho khử nitrat, độ kiềm còn lại và các phân đoạn COD có nằm trong dải khuyến cáo hay không.`);
  d.f('Cột "Đánh giá": ✔ trong dải / thỏa tiêu chí; ✖ ngoài dải – cần xem lại thông số thiết kế hoặc thông số nhà cung cấp; "tham khảo" – giá trị điển hình để so sánh, không phải tiêu chí bắt buộc của A 131:2016.');
  d.h('Đối chiếu với dải khuyến cáo DWA-A 131:2016');
  // --- điều kiện thiết kế
  d.c('Nhiệt độ thiết kế', 'T', T, '°C', '5 – 30 °C; nitrat hóa thiết kế ở nhiệt độ thấp nhất (thường 10 – 12 °C)', inR(T, 5, 30), 'Hiệu chỉnh nhiệt độ F_T = 1,072^(T−15) cho phân hủy nội sinh và 1,103^(15−T) cho tuổi bùn hiếu khí (DWA Themen T4/2016).');
  if (proc !== 'C') {
    d.c('Hệ số dao động tải N', 'f_N', B.fN, '–', '1,4 – 2,4 (B_d,COD ≥ 12 000 → 1,5; ≤ 2 400 → 2,4)', inR(B.fN, 1.4, 2.4), 'Trạm càng nhỏ tải N càng dao động → f_N lớn → PF lớn → tuổi bùn hiếu khí lớn.');
    d.c('Hệ số quá trình', 'PF', B.PF, '–', `1,5 – 2,8 (Bảng 3; S_NH4 kiểm soát ${b.SNH4ctl >= 10 ? 10 : 5} mg/l)`, inR(B.PF, 1.5, 2.8), 'PF bao gồm hệ số an toàn cho tốc độ sinh trưởng của vi khuẩn nitrat hóa và dao động tải.');
    d.c('Tuổi bùn hiếu khí yêu cầu', 't_TS,aer,Bem', B.tAerDim, 'd', 'PF·3,4·1,103^(15−T), tối thiểu 2 d', null, 'Tiêu chí bắt buộc: tuổi bùn hiếu khí thực phải ≥ giá trị này.');
    const tAerAct = B.tSS * ctx.fAer;
    d.c('Tuổi bùn hiếu khí thực', 't_TS,aer', tAerAct, 'd', '≥ ' + U.fmt(B.tAerDim, 1) + ' d (= t_TS,aer,Bem)', tAerAct >= B.tAerDim - 1e-6, `t_TS·phân suất sục khí = ${U.fmt(B.tSS, 1)} × ${U.fmt(ctx.fAer, 3)}. Không đạt → giảm F/M (tăng khối bùn) hoặc tăng thời gian sục khí.`);
  }
  // --- tuổi bùn tổng
  const PE = B.BCOD / 0.12, small = PE <= 20000;
  const tab2 = proc === 'C' ? (small ? 5 : 4) : proc === 'N' ? (small ? 10 : 8) : (small ? 12.5 : 10);
  const tReq = proc === 'C' ? B.tC : proc === 'N' ? B.tAerDim / Math.max(0.05, ctx.fAer) : B.tAerDim / Math.max(0.05, Math.min(ctx.fAer, 1 - Math.min(B.r || 0, b.dnMax)));
  d.c('Tuổi bùn tổng', 't_TS', B.tSS, 'd', `≥ ${U.fmt(Math.max(tReq, B.tStab || 0), 1)} d (t_TS,aer,Bem/phân suất sục khí = ${U.fmt(tReq, 1)}${B.tStab ? '; ổn định bùn ' + U.fmt(B.tStab, 1) : ''}); tham khảo Bảng 2 A 131:2000 (10 °C, ${small ? '≤ 20 000' : '> 20 000'} PE): ≥ ${tab2} d`, B.tSS >= Math.max(tReq, B.tStab || 0) - 1e-6, `PE tương đương ≈ ${U.fmt(PE, 0)} (B_d,COD/0,12 kg/(PE·d)).`);
  if (o.stab) d.c('Tuổi bùn ổn định bùn hiếu khí', 't_TS,Stab', B.tStab, 'd', '≥ 20 – 25 d (ổn định đồng thời)', B.tSS >= B.tStab - 1e-6, 'Chỉ áp dụng khi chọn ổn định bùn hiếu khí đồng thời.');
  // --- khử nitrat
  if (proc === 'ND') {
    d.c('Tỷ lệ khử nitrat cần', 'V_D/V_BB', B.r, '–', '0,2 – 0,6 (> 0,6 không khuyến cáo; < 0,2 vùng thiếu khí nhỏ)', B.r <= 0.6 + 1e-9, 'Với bể theo mẻ là phân suất thời gian không sục khí cần để khử đủ NO₃-N (OV_C,D = 0,75·OV_C·V_D/V).');
    d.c('Phân suất thời gian không sục khí có', 't_D/t_C', ctx.fDN, '–', '≥ V_D/V_BB = ' + U.fmt(B.r, 3), ctx.fDN >= B.r - 1e-6, ctx.fDNnote || 'Air-Off + lắng + chắt/gạn chia cho thời gian chu kỳ.');
    if (B.x != null) d.c('Tỷ số cung/cầu carbon cho khử nitrat', 'x', B.x, '–', '≥ 1,0', B.x >= 1 - 1e-6, 'x = OV_C,D/(2,86·S_NO3,D); < 1 → thiếu carbon nội tại, cần carbon ngoài hoặc tăng NO₃-N ra.');
    d.c('NO₃-N ra thiết kế', 'S_NO3,AN', B.capped ? B.NO3eff : b.NO3e, 'mg/l', '≈ (0,6 – 0,8)·N_vô cơ cho phép (dự phòng dao động)', null, 'Đặt thấp hơn giới hạn xả để có biên dao động (A 131 mục 5.2.1.3).');
  }
  // --- độ kiềm, sản lượng bùn, tải trọng
  d.c('Độ kiềm còn lại', 'S_KS,AN', B.SKSe, 'mmol/l', '≥ 1,5 mmol/l (≈ 75 mg CaCO₃/l)', B.SKSe >= 1.5 - 1e-9, 'Thấp hơn → pH giảm, ức chế nitrat hóa; bổ sung NaOH/vôi hoặc tăng khử nitrat để hoàn trả kiềm.');
  const usr = B.US / B.BCOD;
  d.c('Bùn dư riêng', 'ÜS_d/B_d,COD', usr, 'kg TS/kg COD', '0,30 – 0,55 (điển hình, không lắng sơ cấp; tăng khi có kết tủa P)', inR(usr, 0.3, 0.55) ? true : null, 'Kiểm tra chéo bùn dư của nhà cung cấp (Sanitaire ΔM / SFC Y·ΔBOD thường thấp hơn vì bỏ qua SS trơ).');
  const BTS = RL.bio.BOD / Math.max(1e-6, B.tSS * B.US);
  const btsLim = o.stab ? 0.05 : proc === 'C' ? 0.3 : proc === 'N' ? 0.15 : 0.12;
  d.c('Tải trọng bùn BOD', 'B_TS', BTS, 'kg/(kg TS·d)', '≤ ' + U.fmt(btsLim) + (o.stab ? ' (ổn định bùn)' : proc === 'C' ? ' (chỉ khử C)' : proc === 'N' ? ' (nitrat hóa)' : ' (nitrat hóa + khử nitrat)') + ' – tham khảo ATV-A 131:1991', BTS <= btsLim + 1e-9 ? true : null, 'A 131:2016 thiết kế theo tuổi bùn; B_TS = B_d,BOD/M_TS chỉ để so sánh.');
  if (ctx.MLSS > 0) d.c('Nồng độ bùn ' + (ctx.MLSSlvl || ''), 'TS_BB', ctx.MLSS, 'kg/m³', '2,5 – 5,0 (có lắng II 2,5 – 4,5; SBR/ổn định bùn đến 5,0)', inR(ctx.MLSS, 2.5, 5.0), 'Nồng độ cao làm giảm thể tích nhưng tăng tải bể lắng / thời gian lắng của bể mẻ.');
  // --- phân đoạn COD & hằng số
  d.c('Phần COD hòa tan trơ', 'f_S', b.fS, '–', '0,05 – 0,10 (khuyến cáo 0,05)', inR(b.fS, 0.05, 0.1), 'S_COD,inert = f_S·C_COD – quyết định COD ra tối thiểu.');
  d.c('Phần COD hạt trơ', 'f_A', b.fA, '–', '0,20 – 0,35 (khuyến cáo 0,3)', inR(b.fA, 0.2, 0.35), 'X_COD,inert = f_A·X_COD – tích lũy vào bùn dư.');
  d.c('Phần chất rắn vô cơ', 'f_B', B.fB || b.fB, '–', '0,20 – 0,30 (0,3 không / 0,2 có lắng sơ cấp)', inR(B.fB || b.fB, 0.2, 0.3), 'X_anorg,TS = f_B·X_TS.');
  d.c('Phần COD dễ phân hủy', 'f_COD', b.fCOD, '–', '0,15 – 0,25', inR(b.fCOD, 0.15, 0.25), 'C_COD,la = f_COD·C_COD,abb – nguồn carbon chính cho tiền khử nitrat.');
  d.c('Hệ số sản sinh', 'Y', b.Y, 'g COD/g COD', '0,67', Math.abs(b.Y - 0.67) < 0.02, 'Giá trị chuẩn của A 131:2016.');
  d.c('Hệ số phân hủy nội sinh (15 °C)', 'b', b.b, '1/d', '0,17', Math.abs(b.b - 0.17) < 0.01, 'b(T) = 0,17·1,072^(T−15).');
  const nBad = d.rows.filter(x => x.c && x.ok === false).length;
  // phương án theo dòng ngoài dải: hằng số về giá trị khuyến cáo; thiếu thời gian khử nitrat / carbon → carbon ngoài
  const badSym = new Set(d.rows.filter(x => x.c && x.ok === false).map(x => x.sym));
  const kfix = {}; if (badSym.has('f_S')) kfix['bio.fS'] = 0.05; if (badSym.has('f_A')) kfix['bio.fA'] = 0.3; if (badSym.has('f_COD')) kfix['bio.fCOD'] = 0.25; if (badSym.has('Y')) kfix['bio.Y'] = 0.67; if (badSym.has('b')) kfix['bio.b'] = 0.17;
  if (nBad) d.warn(`Đối chiếu DWA-A 131: ${nBad} thông số ngoài dải khuyến cáo – xem bảng đối chiếu.`,
    Object.keys(kfix).length && FX('Hằng số về giá trị A 131', kfix),
    (badSym.has('t_D/t_C') || badSym.has('x')) && FX('Bổ sung carbon ngoài', { 'bio.extC': true }),
    badSym.has('S_KS,AN') && FX('Nhập độ kiềm vào +1 mmol/l', { 'bio.SKS': S => S.bio.SKS + 1 }));
  else d.info('Đối chiếu DWA-A 131: các thông số kiểm tra đều trong dải khuyến cáo.');
  return B;
};

/* ================= ICEAS ================= */
ENG.ICEAS_CYC = { NIT: [120, 0, 60, 60, 90, 0, 45, 45], NDN: [96, 72, 60, 60, 72, 54, 45, 45] };

/* ICEAS thiết kế theo SRT – cùng trình tự 10 bước với Thiết kế XLNT, mô hình bùn & cân bằng N theo DWA-A 131:
   0 số liệu → 1 chu kỳ (f_hk) → 2 SRT = max(t_TS,aer/f_hk ở T thiết kế; lắng; ổn định bùn) → 3 bùn dư ÜS ở SRT (gồm SS trơ, bùn kết tủa P)
   → 4 khối bùn M = ÜS·SRT, F/M kiểm tra → 5 kích thước bể (SVI, vùng đệm, thể tích nạp; MLSS_BWL ≤ giới hạn)
   → 6 khử nitrat V_D/V ≤ ART/24 (thiếu → tăng Air-Off, quay lại Bước 2) → 7 khử P (bùn kết tủa đã nằm trong ÜS)
   → 8 oxy & sục khí (bước "Sục khí", T_min … T_max, hệ số đỉnh) → 9 decanter, bơm bùn, máy khuấy → 10 kiểm tra T_max, xả bùn theo mùa */
ENG.iceas = function (S, RL) {
  const c = S.ic, d = new Rep('ICEAS – thiết kế theo SRT (trình tự 10 bước; bùn & N theo DWA-A 131)');
  const R = {};
  const nb = c.nb, T = S.bio.T, Tmax = Math.max(T, +S.aer.Tmax || T);
  const kw = +c.kw > 0 ? +c.kw : 0;
  const Qb = RL.Qd / nb, PDWF = RL.Qth * 24 / nb, PWWF = kw > 0 ? Qb * kw : RL.Qm * 24 / nb;
  const SVI = S.sst.ISV, TWL = c.TWL, BZ = c.BZ, Xmax = +c.MLSSmax || 5000;
  const icB = c.feed === 'batch', needDN = S.opt.process === 'ND';
  const tAerReq = ENG.tAerDWA(S, RL), tStab = ENG.tStabDWA(S), SRTset = +c.SRTset || 5, SRTman = +c.SRT > 0 ? +c.SRT : 0;
  const SRTlim = tStab > 0 ? 40 : 30;
  const cyc = k => k === 'custom' ? [c.on, c.off, c.set, c.dec, c.on_s, c.off_s, c.set_s, c.dec_s].map(Number) : ENG.ICEAS_CYC[k].slice();
  const design = v => {
    const NCT = (v[0] + v[1] + v[2] + v[3]) / 60, SCT = (v[4] + v[5] + v[6] + v[7]) / 60, n = 24 / NCT, TA = v[0] * n / 60, ART = (v[1] + v[2] + v[3]) * n / 60, fA = TA / 24;
    const SRTn = tAerReq / fA, SRTo = Math.max(SRTn, SRTset, tStab), SRT = SRTman > 0 ? SRTman : SRTo;
    const B = ENG.bioAt(S, RL, SRT, 4);
    const Mt = B.US * SRT, Mb = Mt / nb, Vsl = Mb * SVI / 1000;
    const MVAB = icB ? Math.max(PDWF * NCT, PWWF * SCT) / 24 : Math.max(PDWF * (NCT - v[3] / 60), PWWF * (SCT - v[7] / 60)) / 24;
    const BA1 = (Vsl + MVAB) / (TWL - BZ), BA2 = (Mb * 1000 / Xmax + MVAB) / TWL, BA = Math.max(BA1, BA2);
    const r = needDN ? (B.r || 0) : 0;
    // thời gian khử nitrat hiệu dụng: Air-Off khuấy (cả bể) + lắng/chắt chỉ phần lớp bùn tiếp xúc NO₃ (φ = MLSS·SVI/10⁶) – cùng cách Thiết kế XLNT (M&E 5th mục 8-6)
    const phi = Math.min(1, Mb * 1000 / (TWL * BA) * SVI / 1e6), fDN = (v[1] + (v[2] + v[3]) * phi) * n / 60 / 24;
    return { v, NCT, SCT, n, TA, ART, fA, SRTn, SRTo, SRT, B, Mt, Mb, Vsl, MVAB, BA1, BA2, BA, r, phi, fDN, dnOK: !needDN || r <= fDN + 1e-6, SKSe: B.SKSe };
  };
  // ---- Bước 1: chọn chu trình (auto: NIT nếu không cần khử nitrat hoặc đủ thời gian thiếu khí; thiếu / thiếu kiềm → NDN(P)) ----
  const eN = design(cyc('NIT')), eD = design(cyc('NDN'));
  const alkBetter = eN.SKSe < 1.5 && eD.SKSe > eN.SKSe + 0.1;
  const rec = !needDN ? (alkBetter ? 'NDN' : 'NIT') : (eN.dnOK && !alkBetter ? 'NIT' : 'NDN');
  let key = c.cycle === 'auto' ? rec : c.cycle;
  // ---- Bước 6 ↔ Bước 2: thiếu thời gian khử nitrat → tăng Air-Off 12 phút (mùa mưa 9 phút), giữ thời gian chu kỳ; f_hk giảm nên SRT tính lại ----
  let v = cyc(key), E = design(v);
  const v0 = v.slice();
  if (needDN && key !== 'NIT') {
    for (let it = 0; it < 30 && !E.dnOK; it++) {
      const w = v.slice(); w[0] -= 12; w[1] += 12; if (w[4] - 9 >= 9) { w[4] -= 9; w[5] += 9; }
      const t = design(w);
      if (t.fA < (+c.fAmin || 0.3) - 1e-9 || t.SRT > SRTlim) break;
      v = w; E = t;
    }
  }
  const adj = v[1] !== v0[1];
  const ci = { v, NCT: E.NCT, n: E.n, TA: E.TA, ART: E.ART, SCT: E.SCT };
  const [on, off, set, dec, on_s, off_s, set_s, dec_s] = v;
  const SRT = E.SRT, B = E.B;
  R.cycle = key; R.ci = ci; R.rec = rec; R.adj = adj;

  d.h('Bước 0. Số liệu đầu vào (một bể)');
  d.r('Số bể ICEAS', 'N', nb, 'bể');
  d.r('Lưu lượng trung bình mỗi bể', 'Q_b', Qb, 'm³/d');
  d.r('Cao điểm mùa khô mỗi bể', 'PDWF', PDWF, 'm³/d', 'Q_T,h·24/N');
  d.r('Cao điểm mùa mưa mỗi bể', 'PWWF', PWWF, 'm³/d', kw > 0 ? 'Q_b·k_mưa, k_mưa = ' + kw : 'Q_M·24/N');
  d.r('Tải lượng BOD₅ / COD vào sinh học', '', U.fmt(RL.bio.BOD, 0) + ' / ' + U.fmt(RL.bio.COD, 0), 'kg/d');
  d.r('Nhiệt độ thiết kế (thấp nhất) / cao nhất', 'T / T_max', U.fmt(T) + ' / ' + U.fmt(Tmax), '°C', 'T: nitrat hóa, bùn dư (Bước 2, 3); T_max: oxy (Bước 8), xả bùn mùa nóng (Bước 10)');
  d.r('Chế độ nạp', '', icB ? 'gián đoạn theo mẻ (như SBR)' : 'liên tục (ngăn pre-react)', '');

  d.h('Bước 1. Cấu trúc chu kỳ – chu trình ' + (key === 'NIT' ? 'NIT' : key === 'NDN' ? 'NDN(P)' : 'tự nhập') + (adj ? ' (đã tăng Air-Off ở Bước 6)' : ''));
  d.r('Sục khí / không sục khí / lắng / chắt (thường)', '', `${on} / ${off} / ${set} / ${dec}`, 'phút', 'NCT = ' + U.fmt(ci.NCT) + ' h, ' + U.fmt(ci.n) + ' chu kỳ/d');
  d.r('Sục khí / không sục khí / lắng / chắt (mùa mưa)', '', `${on_s} / ${off_s} / ${set_s} / ${dec_s}`, 'phút', 'SCT = ' + U.fmt(ci.SCT) + ' h');
  d.r('Thời gian sục khí / ngày', 'TA', ci.TA, 'h/d');
  d.r('Thời gian không sục khí / ngày', 'ART', ci.ART, 'h/d', 'Air-Off + lắng + chắt');
  d.r('Tỷ lệ thời gian hiếu khí / thiếu khí', 'f_hk / f_tk', U.fmt(E.fA, 3) + ' / ' + U.fmt(ci.ART / 24, 3), '–', 'f_hk = TA/24');
  if (icB) {
    const tF = ci.NCT * 60 / nb, tFs = ci.SCT * 60 / nb;
    d.r('Thời gian nạp mỗi bể – thường / mưa', 't_nạp', U.fmt(tF) + ' / ' + U.fmt(tFs), 'phút', 'NCT/N; SCT/N – luân phiên');
    if (nb < 2) d.warn('ICEAS nạp gián đoạn cần ≥ 2 bể (hoặc bể điều hòa) để luôn có bể nhận nước.', FX('Đặt 2 bể', { 'ic.nb': 2 }), FX('Nạp liên tục', { 'ic.feed': 'cont' }));
    if (tF > on + off + 1e-6 || tFs > on_s + off_s + 1e-6) d.warn('ICEAS nạp gián đoạn: thời gian nạp mỗi bể (chu kỳ/N) vượt Air-On + Air-Off – tăng số bể hoặc bố trí bể điều hòa.', FX('Thêm 1 bể', { 'ic.nb': nb + 1 }), FX('Nạp liên tục', { 'ic.feed': 'cont' }));
  }
  d.r('So sánh NIT | NDN(P): f_hk / SRT (d)', '', `${U.fmt(eN.fA, 3)} / ${U.fmt(eN.SRT, 1)}  |  ${U.fmt(eD.fA, 3)} / ${U.fmt(eD.SRT, 1)}`, '');
  if (needDN) d.r('So sánh NIT | NDN(P): V_D/V cần / t_D,hd có', '', `${U.fmt(eN.r, 3)} / ${U.fmt(eN.fDN, 3)}  |  ${U.fmt(eD.r, 3)} / ${U.fmt(eD.fDN, 3)}`, '');
  d.r('Chu trình khuyến cáo', '', rec === 'NIT' ? 'NIT' : 'NDN(P)', '', !needDN ? 'không yêu cầu khử nitrat' + (alkBetter ? '; NDN(P) hoàn trả kiềm' : '') : eN.dnOK && !alkBetter ? 'NIT đủ thời gian khử nitrat trong pha lắng + chắt' : 'cần pha Air-Off có khuấy để khử nitrat' + (alkBetter ? ' / hoàn trả kiềm' : ''));
  if (c.cycle !== 'auto' && c.cycle !== 'custom' && key !== rec) d.info('Chu trình khuyến cáo theo chất lượng nước là ' + (rec === 'NIT' ? 'NIT' : 'NDN(P)') + '.');

  d.h('Bước 2. Tuổi bùn thiết kế SRT = max(nitrat hóa; lắng tốt; ổn định bùn)');
  d.r('Tuổi bùn hiếu khí yêu cầu ở ' + U.fmt(T) + ' °C', 't_TS,aer', tAerReq, 'd', 'DWA-A 131: PF·3,4·1,103^(15−T) (hệ số an toàn PF)');
  d.r('SRT theo nitrat hóa', 'SRT_N', E.SRTn, 'd', 't_TS,aer/f_hk');
  d.r('SRT tối thiểu cho bùn lắng tốt', 'SRT_lắng', SRTset, 'd', '3 – 5 d trở lên');
  if (tStab > 0) d.r('SRT ổn định bùn hiếu khí', 'SRT_ổđ', tStab, 'd', 'DWA-A 131 (ổn định bùn đồng thời, 20 – 25 d)');
  d.r('SRT thiết kế', 'SRT', SRT, 'd', SRTman > 0 ? 'nhập tay (yêu cầu ' + U.fmt(E.SRTo, 1) + ' d)' : 'max(SRT_N; SRT_lắng' + (tStab > 0 ? '; SRT_ổđ' : '') + ')');
  if (SRTman > 0 && SRTman < E.SRTo - 1e-6) d.warn('SRT nhập tay ' + U.fmt(SRTman, 1) + ' d < SRT yêu cầu ' + U.fmt(E.SRTo, 1) + ' d.', FX('Tự tính SRT', { 'ic.SRT': 0 }));
  d.r('Tuổi bùn hiếu khí thực', 't_TS,aer', SRT * E.fA, 'd', 'SRT·f_hk ≥ ' + U.fmt(tAerReq, 1));
  if (SRT < 12 || SRT > SRTlim) d.info('SRT ' + U.fmt(SRT, 1) + ' d ngoài khoảng thường gặp của bể mẻ 12 – ' + SRTlim + ' d.');
  if (key !== 'NIT' && S.bio.pChem === false && SRT > 30) d.info('Có khử P sinh học: SRT dài làm giảm hiệu quả EBPR – dự phòng hóa chất.');

  d.h('Bước 3 & 7. Bùn sinh ra ở SRT thiết kế (DWA-A 131, gồm SS trơ và bùn kết tủa P)');
  d.r('Bùn dư từ khử carbon', 'ÜS_d,C', B.USC, 'kg TS/d', 'sinh khối, phần nội sinh trơ, chất rắn vô cơ – ở ' + U.fmt(T) + ' °C');
  d.r('Bùn dư từ khử P (sinh học + kết tủa)', 'ÜS_d,P', B.USP, 'kg TS/d', 'Bước 7: bùn hóa chất cộng vào bùn sinh ra');
  d.r('Tổng bùn dư', 'ÜS_d', B.US, 'kg TS/d');
  d.r('P ra sau khử P', 'C_P', B.Pe, 'mg/l');

  d.h('Bước 4. Khối bùn & F/M kiểm tra');
  const FM = RL.bio.BOD / E.Mt;
  d.r('Khối bùn toàn trạm', 'M_TS', E.Mt, 'kg', 'ÜS_d·SRT');
  d.r('Khối bùn mỗi bể', 'BMOB', E.Mb, 'kg/bể');
  d.r('Tỷ số F/M (theo MLSS)', 'F/M', FM, 'kg BOD/(kg MLSS·d)', 'kiểm tra 0,04 – 0,10');
  if (FM < 0.04 || FM > 0.1) d.info('F/M ' + U.fmt(FM, 3) + ' ngoài khoảng tham khảo ICEAS 0,04 – 0,10 (thiết kế theo SRT, F/M chỉ để kiểm tra).');

  d.h('Bước 5. Kích thước bể');
  const BA = E.BA, DD = E.MVAB / BA, BWL = TWL - DD, SD = E.Vsl / BA, BZa = BWL - SD;
  const W = U.ceilTo(Math.sqrt(BA / c.LW), 0.5), L = U.ceilTo(BA / W, 0.5);
  const HRT = W * L * TWL / Qb * 24, MLSSb = E.Mb * 1000 / (BWL * BA), MLSSt = E.Mb * 1000 / (TWL * BA);
  d.r('Thể tích lớp bùn', 'V_bùn', E.Vsl, 'm³/bể', 'M·SVI/1000, SVI = ' + SVI);
  d.r('Thể tích nạp lớn nhất giữa hai lần chắt', 'MVAB', E.MVAB, 'm³/bể', icB ? 'max(PDWF·NCT; PWWF·SCT)/24 – nạp gián đoạn' : 'max(PDWF·(NCT − t_chắt); PWWF·(SCT − t_chắt,mưa))/24');
  d.r('Diện tích theo TWL − BZ', 'BA₁', E.BA1, 'm²/bể', '(V_bùn + MVAB)/(TWL − BZ), TWL = ' + TWL + ', BZ = ' + BZ + ' m');
  d.r('Diện tích để MLSS_BWL ≤ ' + U.fmt(Xmax, 0), 'BA₂', E.BA2, 'm²/bể', '(M_b/MLSS_max + MVAB)/TWL');
  d.r('Diện tích bể yêu cầu', 'BA', BA, 'm²/bể', 'max(BA₁; BA₂)');
  d.r('Chiều cao chắt / mực nước đáy', 'DD / BWL', U.fmt(DD) + ' / ' + U.fmt(BWL), 'm', 'BWL = TWL − DD');
  d.r('Chiều sâu lớp bùn / vùng đệm thực tế', 'SD / BZ_tt', U.fmt(SD) + ' / ' + U.fmt(BZa), 'm', 'BZ_tt ≥ ' + BZ + ' m');
	  const Lpre = U.ceilTo(L * c.pre, 0.5), Vpre = Lpre * TWL * nb, VprePct = Vpre / (W * L * TWL * nb);
	  d.r('Kích thước bể W × L', '', U.fmt(W) + ' × ' + U.fmt(L), 'm', 'L:W = ' + c.LW + '; vùng pre-react ≈ ' + U.fmt(Lpre / nb, 0.5) + ' m/bể (' + U.fmt(VprePct * 100, 1) + '% thể tích)');
	  d.r('Thể tích vùng pre-react', 'V_pre', Vpre, 'm³', VprePct * 100 + '% tổng thể tích (khuyến cáo 10–15 %)');
	  if (VprePct > 0.15 + 1e-9) d.warn('Vùng pre-react ' + U.fmt(VprePct * 100, 1) + '% > 15 % tổng thể tích bể ICEAS.', FX('Giảm tỷ lệ pre-react về 0,15', { 'ic.pre': 0.15 }));
	  if (VprePct < 0.10 - 1e-9) d.info('Vùng pre-react ' + U.fmt(VprePct * 100, 1) + '% < 10 % tổng thể tích bể ICEAS – diện tích tiếp xúc nhỏ, có thể ảnh hưởng khử nitrat.');
	  d.r('Tổng thể tích (TWL)', 'V', W * L * TWL * nb, 'm³');
  d.r('Thời gian lưu nước', 'HRT', HRT, 'h', 'ICEAS thường 20–40 h');
  d.r('MLSS tại BWL / TWL', '', U.fmt(MLSSb, 0) + ' / ' + U.fmt(MLSSt, 0), 'mg/l', '≤ ' + U.fmt(Xmax, 0) + ' tại BWL');

  d.h('Bước 6. Khử nitrat');
  if (needDN) {
    d.r('Tỷ lệ thời gian khử nitrat cần (A 131)', 'V_D/V', E.r, '–', 'OV_C,D = 0,75·OV_C·V_D/V');
    d.r('Tỷ lệ thời gian không sục khí', 'ART/24', ci.ART / 24, '–', 'Air-Off + lắng + chắt');
    d.r('Phần lớp bùn khi lắng (tiếp xúc NO₃)', 'φ', E.phi, '–', 'MLSS_TWL·SVI/10⁶ – lớp nước trong phía trên bị chắt ra, không được khử nitrat');
    d.r('Tỷ lệ thời gian khử nitrat hiệu dụng', 't_D,hd', E.fDN, '–', '(Air-Off + (lắng + chắt)·φ)·n_ck/24 ≥ V_D/V');
    if (adj) d.info(`Bước 6: thiếu thời gian khử nitrat → Air-On/Air-Off ${v0[0]}/${v0[1]} → ${on}/${off} phút (giữ chu kỳ), f_hk ${U.fmt(design(v0).fA, 3)} → ${U.fmt(E.fA, 3)}, SRT tính lại ở Bước 2.`);
    if (!E.dnOK) d.warn('Thời gian không sục khí không đủ để đạt NO₃-N ra ' + S.bio.NO3e + ' mg/l' + (key === 'NIT' ? ' – dùng chu trình NDN(P).' : ' (đã chạm giới hạn f_hk ≥ ' + U.fmt(+c.fAmin || 0.3, 2) + ' hoặc SRT ≤ ' + SRTlim + ' d) – bổ sung carbon ngoài.'), key === 'NIT' && FX('Dùng chu trình NDN(P)', { 'ic.cycle': 'NDN' }), FX('Bổ sung carbon ngoài', { 'bio.extC': true }), FX('Tăng NO₃-N ra +2 mg/l', { 'bio.NO3e': S => S.bio.NO3e + 2 }));
  } else d.r('Yêu cầu khử nitrat', '', 'không (quy trình ' + S.opt.process + ')', '');

  d.h('Bước 8. Nhu cầu oxy & sục khí');
  const Qmix = c.MI * W * L;
  d.r('Khí xáo trộn tối thiểu', 'Q_trộn', Qmix, 'Nm³/h/bể', c.MI + ' m³/(h·m²) – so với khí công nghệ ở bước Sục khí');
  d.f('Nhu cầu oxy tính ở bước "Sục khí": OV_C + OV_N − OV_D theo DWA-A 131 tại SRT thiết kế, ở T_min … T_max với hệ số đỉnh f_C, f_N; chia cho thời gian sục khí TA = ' + U.fmt(ci.TA) + ' h/d; đổi sang SOTR (α, β, θ) và lưu lượng khí.');

  d.h('Bước 9. Thủy lực & thiết bị');
  const PDR = E.MVAB / dec + (icB ? 0 : PDWF / 1440), PWR = E.MVAB / dec_s + (icB ? 0 : PWWF / 1440);
  const DL = U.ceilTo(Math.max(PDR / c.WLR, PWR / c.WLRs), 0.5);
  const dM = B.US / nb, Vws = dM / (c.SFws * 1000), WSP = Vws * 1000 * ci.NCT / (24 * c.SPT);
  const nOver = Math.max(1, Math.ceil(nb * (dec_s / 60) / ci.SCT - 1e-9));
  d.r('Lưu lượng chắt thường / mùa mưa', 'PDR / PWR', U.fmt(PDR) + ' / ' + U.fmt(PWR), 'm³/phút');
  d.r('Chiều dài decanter', 'DL', DL, 'm', 'max(PDR/' + c.WLR + '; PWR/' + c.WLRs + ') m³/(phút·m)');
  if (DL > W + 1e-9) d.warn('Chiều dài decanter ' + U.fmt(DL) + ' m > chiều rộng bể ' + U.fmt(W) + ' m – dùng 2 decanter hoặc tăng W.', FX('Thêm 1 bể', { 'ic.nb': nb + 1 }));
  d.r('Bùn dư mỗi bể', 'ΔM', dM, 'kg TS/d/bể', 'ÜS_d/N');
  d.r('Thể tích bùn thải', 'V_ws', Vws, 'm³/d/bể', 'nồng độ ' + c.SFws * 100 + ' %');
  d.r('Bơm bùn thải', 'WSP', WSP, 'l/phút', 'chạy ' + c.SPT + ' phút/chu kỳ');
  d.r('Lưu lượng chắt đỉnh ra công trình sau', 'Q_chắt', PWR * 60 * nOver, 'm³/h', nOver + ' bể chắt đồng thời');
  d.r('Độ kiềm còn lại', 'S_KS,AN', B.SKSe, 'mmol/l', '≥ 1,5 mmol/l');
  if (key !== 'NIT') d.r('Máy khuấy chìm (pha Air-Off)', 'P', c.Pmix, 'kW/bể');

  d.h('Bước 10. Kiểm tra T_max & chế độ xả bùn theo mùa');
  const S2 = U.clone(S); S2.bio.T = Tmax;
  const tAerX = ENG.tAerDWA(S2, RL), tStabX = ENG.tStabDWA(S2);
  const SRTw = Math.min(SRT, Math.max(tAerX / E.fA, SRTset, tStabX));
  const Bw = ENG.bioAt(S2, RL, SRTw, 4), Bk = ENG.bioAt(S2, RL, SRT, 4);
  const Mw = Bw.US * SRTw, MLSSw = Mw / nb * 1000 / (BWL * BA);
  d.r('Tuổi bùn hiếu khí yêu cầu ở ' + U.fmt(Tmax) + ' °C', 't_TS,aer,max', tAerX, 'd', 'SRT·f_hk = ' + U.fmt(SRT * E.fA, 1) + ' d ≥ yêu cầu');
  d.r('Mùa lạnh (' + U.fmt(T) + ' °C) – giữ SRT ' + U.fmt(SRT, 1) + ' d', 'V_ws', Vws, 'm³/d/bể', 'ÜS ' + U.fmt(B.US, 0) + ' kg/d; MLSS_BWL ' + U.fmt(MLSSb, 0) + ' mg/l');
  d.r('Mùa nóng (' + U.fmt(Tmax) + ' °C) – giữ SRT ' + U.fmt(SRT, 1) + ' d', 'V_ws', Bk.US / nb / (c.SFws * 1000), 'm³/d/bể', 'ÜS ' + U.fmt(Bk.US, 0) + ' kg/d; MLSS_BWL ' + U.fmt(Bk.US * SRT / nb * 1000 / (BWL * BA), 0) + ' mg/l');
  d.r('Mùa nóng – SRT tối thiểu ' + U.fmt(SRTw, 1) + ' d', 'V_ws', Bw.US / nb / (c.SFws * 1000), 'm³/d/bể', 'ÜS ' + U.fmt(Bw.US, 0) + ' kg/d; MLSS_BWL ' + U.fmt(MLSSw, 0) + ' mg/l (xả dần trong vài tuần khi chuyển mùa)');

  Object.assign(R, { nb, Qb, FM, BMOB: E.Mb, Mt: E.Mt, Vbio: E.Vsl, SRT, MCRT: SRT, SRTw, dM, Vws, MVAB: E.MVAB, BA, SD, DD, BWL, TWL, W, L, HRT, MLSSb, MLSSt, PDR, PWR, DL, WSP, Lpre: U.ceilTo(L * c.pre, 0.5), Qmix, BUC: Qmix, fA: E.fA });
  R.Qdec = PWR * 60 * nOver;
  R.B = B;
  ENG.dwaCompare(S, RL, B, { tech: 'ICEAS (thiết kế theo SRT)', tSSsrc: 'SRT = max(t_TS,aer/f_hk; SRT lắng; SRT ổn định), F/M kiểm tra = ' + U.fmt(FM, 4), fAer: E.fA, fDN: E.fDN, fDNnote: '(Air-Off + (lắng + chắt)·φ)·n_ck/24, φ = ' + U.fmt(E.phi, 2) + ' (phần lớp bùn) – chu trình ' + key, MLSS: MLSSt / 1000, MLSSlvl: 'tại mực nước cao TWL (tại BWL ' + U.fmt(MLSSb / 1000, 2) + ' kg/m³)' });
  R.d = d;
  return R;
};

/* ================= C-Tech ================= */
ENG.ctech = function (S, RL) {
  const c = S.ct, d = new Rep('C-Tech – bùn hoạt tính theo chu kỳ (SFC Environmental, BEP)');
  const R = {};
  const Qd = RL.Qd, Qh = Qd / 24, Qmx = RL.Qm, BOD = RL.C.BOD, SVI = S.sst.ISV;
  const N = c.N;
  const TC = c.TFA + c.TS + c.TD, ncy = 24 / TC, TA = c.TFA * ncy, nF = N * c.TFA / TC, nD = Math.ceil(N * c.TD / TC - 1e-9);
  const Qb = Qh / nF;
  d.h('A. Chu kỳ vận hành');
  d.r('Số bể', 'N', N, 'bể', 'nên chẵn – luân phiên theo cặp');
  d.r('Pha cấp nước + sục khí / lắng / gạn', '', `${c.TFA} / ${c.TS} / ${c.TD}`, 'h', 'T_C = ' + U.fmt(TC) + ' h (2,5–6 h)');
  if (TC < 2.5 || TC > 6) d.warn('Chu kỳ ngoài khoảng 2,5–6 h.', FX('Chu kỳ 4 h (F/A 2 / lắng 1 / gạn 1)', { 'ct.TFA': 2, 'ct.TS': 1, 'ct.TD': 1 }));
  d.r('Số chu kỳ / ngày', 'n_ck', ncy, '');
  d.r('Giờ sục khí / ngày / bể', 'TA', TA, 'h/d');
  d.r('Số bể nhận nước (sục khí) đồng thời', 'n_cấp', nF, 'bể', 'N·t_FA/T_C');
  if (Math.abs(nF - Math.round(nF)) > 1e-6) d.warn('Số bể nhận nước đồng thời không nguyên – chỉnh chu kỳ / số bể.', FX('Chỉnh t_FA để n_cấp = ' + Math.max(1, Math.round(nF)), { 'ct.TFA': +(Math.max(1, Math.round(nF)) * (c.TS + c.TD) / (N - Math.max(1, Math.round(nF)))).toFixed(3) }), FX('t_FA = t_lắng + t_gạn (n_cấp = N/2)', { 'ct.TFA': c.TS + c.TD }));
  d.r('Số bể gạn đồng thời', 'n_gạn', nD, 'bể');
  d.r('Lưu lượng vào mỗi bể đang cấp', 'Q_b', Qb, 'm³/h');
  // ---- MLSS theo SVI ----
  d.h('B. Thể tích & kích thước');
  const twlOf = m => {
    const v1 = Qd * BOD / (m * c.VR * c.FM) / N, a = Math.max(Qmx / nF * c.TFA / c.dH, v1 / c.TWLmax);
    const l = c.L > 0 ? c.L : U.ceilTo(Math.sqrt(a * c.LB), 0.5), bb = U.ceilTo(a / l, 0.5);
    return U.ceilTo(v1 / (l * bb), 0.1);
  };
  const mlssMax = twl => Math.floor((1 - c.dH / twl - c.hsup / twl) * 1e6 / SVI / 50) * 50;
  // MLSS lớn nhất (bước 50 mg/l) thỏa điều kiện gạn: MLSS ≤ (1 − ΔH/TWL − h_sup/TWL)·10⁶/SVI
  let MLSS = c.MLSS;
  while (MLSS > 1000 && MLSS > mlssMax(twlOf(MLSS))) MLSS -= 50;
  if (MLSS < c.MLSS) d.info('MLSS hạ từ ' + c.MLSS + ' xuống ' + MLSS + ' mg/l để đạt chiều sâu gạn với SVI ' + SVI + ' ml/g.');
  const MLVSS = MLSS * c.VR;
  // thể tích = max(theo F/M của SFC; theo tuổi bùn: ÜS·SRT_N/MLSS, SRT_N = max(t_TS,aer/f_sục; ổn định bùn)) – cùng cách Thiết kế XLNT (M&E 5th)
  const VFM = Qd * BOD / (MLVSS * c.FM), SRTN = Math.max(ENG.tAerDWA(S, RL) / (c.TFA / TC), ENG.tStabDWA(S));
  const VSRT = ENG.bioAt(S, RL, SRTN, MLSS / 1000).US * SRTN / (MLSS / 1000);
  const Vreq = Math.max(VFM, VSRT), V1r = Vreq / N;
  const Vfill = Qmx / nF * c.TFA;
  const A1q = Vfill / c.dH, A2q = V1r / c.TWLmax, Areq = Math.max(A1q, A2q);
  const L = c.L > 0 ? c.L : U.ceilTo(Math.sqrt(Areq * c.LB), 0.5);
  const Bw = U.ceilTo(Areq / L, 0.5), A1 = L * Bw;
  const TWL = U.ceilTo(V1r / A1, 0.1), BWL = TWL - c.dH;
  const V1 = A1 * TWL, V = V1 * N;
  const HRT = V / Qd * 24, FMa = Qd * BOD / (V * MLVSS);
  const dHavg = Qh * c.TFA / nF / A1;
  Object.assign(R, { N, TC, ncy, TA, nF, nD, Qb, MLSS, MLVSS, Vreq, Vfill, L, Bw, A1, TWL, BWL, V1, V, HRT, FMa });
  d.r('MLSS tại TWL', 'MLSS', MLSS, 'mg/l', '3.500–5.000');
  d.r('F/M (theo MLVSS)', 'F/M', c.FM, '1/d', 'MLVSS/MLSS = ' + c.VR);
  d.r('Thể tích theo F/M (SFC)', 'V_F/M', VFM, 'm³', 'Q_d·BOD₅/(MLVSS·F/M)');
  d.r('Thể tích theo tuổi bùn', 'V_SRT', VSRT, 'm³', 'ÜS_d·SRT_N/MLSS, SRT_N = ' + U.fmt(SRTN, 1) + ' d (t_TS,aer/f_sục' + (ENG.tStabDWA(S) ? '; ổn định bùn' : '') + ')');
  d.r('Thể tích yêu cầu', 'V_yc', Vreq, 'm³', 'max(V_F/M; V_SRT)');
  if (VSRT > VFM + 1e-6) d.info('Thể tích do tuổi bùn chi phối (V_SRT > V_F/M): F/M thực ' + U.fmt(Qd * BOD / (Vreq * MLVSS), 3) + ' < F/M SFC ' + c.FM + '.');
  d.r('Thể tích cấp/chu kỳ ở lưu lượng đỉnh', 'V_cấp', Vfill, 'm³/bể', 'Q_M/n_cấp·t_FA');
  d.r('Diện tích theo ΔH gạn', 'A₁', A1q, 'm²', 'V_cấp/ΔH, ΔH = ' + c.dH + ' m');
  d.r('Diện tích theo TWL tối đa', 'A₂', A2q, 'm²', 'V₁/' + c.TWLmax + ' m');
  d.r('Kích thước bể L × B', '', U.fmt(L) + ' × ' + U.fmt(Bw), 'm');
  d.r('Mực nước TWL / BWL', '', U.fmt(TWL) + ' / ' + U.fmt(BWL), 'm', 'cao xây dựng ' + U.fmt(TWL + c.fb) + ' m');
  if (TWL < 4.5 || TWL > 7.5) d.warn('TWL ngoài 4,5–7,5 m.', FX('Tự tính chiều dài bể', { 'ct.L': 0 }), FX('TWL max = 6,0 m', { 'ct.TWLmax': 6.0 }));
  d.r('Tổng thể tích (gồm selector)', 'V', V, 'm³', 'HRT = ' + U.fmt(HRT) + ' h; F/M thực ' + U.fmt(FMa, 3));
  d.r('Chiều sâu gạn ở Q trung bình', 'ΔH_TB', dHavg, 'm');
  // ---- RAS & selector ----
  d.h('C. Tuần hoàn bùn & selector');
  const QR = U.ceilTo(Qb * c.R, 5), Qsel = Qb + QR, Vsel = Qsel * c.tsel / 60;
  const Wsel = U.ceilTo(Vsel / (L * TWL), 0.5), Vsr = L * Wsel * TWL;
  Object.assign(R, { QR, Wsel, Vsel: Vsr, QRtot: QR * nF });
  d.r('Bơm RAS mỗi bể', 'Q_RAS', QR, 'm³/h', 'R = ' + c.R + ' × Q_b, chạy trong pha F/A; tổng đồng thời ' + U.fmt(QR * nF) + ' m³/h');
  d.r('Thể tích selector', 'V_sel', Vsr, 'm³/bể', 't = ' + c.tsel + ' phút; ' + c.nsel + ' ngăn; bề rộng ' + U.fmt(Wsel) + ' m');
  d.r('Selector / thể tích bể', '', Vsr / V1, '–', '≈ 10–20 %');
  if (Vsr / V1 < 0.1 || Vsr / V1 > 0.2) d.info('Selector ngoài khoảng 10–20 % thể tích bể.');
  // tải trọng F/M selector (M&E 5th mục 8-4; khoảng tham khảo WEF/Jenkins – cùng Thiết kế XLNT): X_sel = R/(1 + R)·10⁶/ISV
  const Xsel = c.R / (1 + c.R) * 1e6 / SVI, FMsel = Qb * 24 * BOD / (Vsr * Xsel), fmLo = c.selFMmin || 1, fmHi = c.selFMmax || 6;
  d.r('Tải trọng F/M selector', 'F/M_sel', FMsel, 'kg BOD/(kg MLSS·d)', 'Q_b·24·BOD/(V_sel·X_sel), X_sel = ' + U.fmt(Xsel, 0) + ' mg/l; tham khảo ' + fmLo + ' – ' + fmHi);
  if (FMsel < fmLo || FMsel > fmHi) d.warn('F/M selector ' + U.fmt(FMsel, 2) + ' ngoài khoảng ' + fmLo + ' – ' + fmHi + ' kg BOD/(kg MLSS·d) – chỉnh thời gian lưu selector (t_sel) hoặc tỷ lệ tuần hoàn R.', FX('Chỉnh t_sel để F/M_sel = ' + U.fmt((fmLo + fmHi) / 2, 1), { 'ct.tsel': U.clamp(Math.round(c.tsel * FMsel / ((fmLo + fmHi) / 2)), 10, 180) }));
  // chu kỳ mùa mưa (SFC storm mode): chiều sâu gạn & lưu lượng decanter ở lưu lượng mùa mưa
  const TFAs = c.TFA_s > 0 ? c.TFA_s : c.TFA, TSs = c.TS_s > 0 ? c.TS_s : c.TS, TDs = c.TD_s > 0 ? c.TD_s : c.TD, TCs = TFAs + TSs + TDs, nFs = N * TFAs / TCs;
  const Qww = c.kw > 0 ? Qh * c.kw : Qmx, Vfs = Qww / nFs * TFAs, dHs = Vfs / A1;
  d.r('Chu kỳ mùa mưa F/A / lắng / gạn', '', `${U.fmt(TFAs)} / ${U.fmt(TSs)} / ${U.fmt(TDs)}`, 'h', 'Q mùa mưa ' + U.fmt(Qww, 0) + ' m³/h; ΔH mưa = ' + U.fmt(dHs) + ' m (≤ ΔH ' + c.dH + ' m); Q_gạn mưa ' + U.fmt(Vfs / TDs, 0) + ' m³/h');
  if (dHs > c.dH + 1e-6) d.warn('Mùa mưa: chiều sâu gạn ' + U.fmt(dHs) + ' m > ΔH ' + c.dH + ' m – rút ngắn chu kỳ mùa mưa (F/A), tăng số bể hoặc ΔH.', FX('Rút ngắn F/A mùa mưa', { 'ct.TFA_s': +(TFAs * c.dH / dHs).toFixed(2) }), FX('Thêm 1 bể', { 'ct.N': N + 1 }));
  if (TSs < 0.5 - 1e-9) d.warn('Mùa mưa: thời gian lắng < 0,5 h.', FX('Thời gian lắng mùa mưa 0,5 h', { 'ct.TS_s': 0.5 }));
  if (Math.abs(nFs - Math.round(nFs)) > 1e-6) d.warn('Mùa mưa: số bể nhận nước đồng thời không nguyên – chỉnh chu kỳ mùa mưa.', (c.TFA_s > 0 || c.TS_s > 0 || c.TD_s > 0) && FX('Dùng chu kỳ thường cho mùa mưa', { 'ct.TFA_s': 0, 'ct.TS_s': 0, 'ct.TD_s': 0 }), FX('t_FA mùa mưa = t_lắng + t_gạn', { 'ct.TFA_s': TSs + TDs }));
  // ---- tuổi bùn: SFC & DWA ----
  d.h('D. Bùn & tuổi bùn');
  const dBOD = Math.max(0, BOD - c.BODout), LBOD = Qd * dBOD / 1000, Xs = c.Y * LBOD, SRTs = V * MLSS / (Xs * 1000);
  d.r('Bùn sinh học theo SFC', 'X', Xs, 'kg/d', 'Y = ' + c.Y + ' kg/kg BOD');
  d.r('Tuổi bùn theo SFC', 'SRT_SFC', SRTs, 'd', '≥ 10 d (CPHEEO)');
  let B = ENG.bioAt(S, RL, 20, MLSS / 1000);
  let tSS = ENG.bioActual(B, V).tSS;
  B = ENG.bioAt(S, RL, tSS, MLSS / 1000); tSS = ENG.bioActual(B, V).tSS;
  B = ENG.bioAt(S, RL, tSS, MLSS / 1000);
  R.B = B; R.tSS = tSS;
  const phiC = Math.min(1, MLSS * SVI / 1e6), fDNc = (c.TS + c.TD) / TC * phiC;
  ENG.dwaCompare(S, RL, B, { tech: 'SFC C-Tech (BEP)', tSSsrc: 'cân bằng bùn A 131: t_TS = V·TS/ÜS_d với V và MLSS của SFC', fAer: c.TFA / TC, fDN: fDNc, fDNnote: '(t_S + t_D)/T_C·φ, φ = MLSS·SVI/10⁶ = ' + U.fmt(phiC, 2) + ' (chỉ lớp bùn khi lắng tiếp xúc NO₃) – chưa kể selector và SND trong pha F/A', MLSS: MLSS / 1000, MLSSlvl: 'tại mực nước cao TWL' });
  const tAerReq = ENG.tAerDWA(S, RL);
  d.r('Tuổi bùn theo cân bằng bùn A 131', 't_TS', tSS, 'd', 'V·TS/ÜS_d, ÜS = ' + U.fmt(B.US) + ' kg/d');
  d.r('Tuổi bùn hiếu khí', 't_TS,aer', tSS * c.TFA / TC, 'd', '≥ ' + U.fmt(tAerReq) + ' (DWA)');
  if (tSS * c.TFA / TC < tAerReq - 1e-6) d.warn('Tuổi bùn hiếu khí nhỏ hơn yêu cầu DWA – giảm F/M hoặc tăng t_FA.', FX('Giảm F/M 20 %', { 'ct.FM': +(c.FM * 0.8).toFixed(3) }));
  const tSt = ENG.tStabDWA(S);
  if (tSt && tSS < tSt - 1e-6) d.warn('Tuổi bùn ' + U.fmt(tSS, 1) + ' d < tuổi bùn ổn định bùn ' + U.fmt(tSt, 1) + ' d – giảm F/M hoặc bỏ chọn ổn định bùn.', FX('Giảm F/M theo tuổi bùn ổn định', { 'ct.FM': +(c.FM * tSS / tSt).toFixed(3) }), FX('Bỏ ổn định bùn đồng thời', { 'opt.stab': false }));
  if (S.opt.process === 'ND') {
    d.r('Tỷ lệ khử nitrat cần (A 131)', 'V_D/V', B.r, '–');
    d.r('Thời gian khử nitrat hiệu dụng (lớp bùn khi lắng + gạn)', 't_D,hd', fDNc, '–', '(t_S + t_D)/T_C·φ, φ = ' + U.fmt(phiC, 2) + '; không có pha khuấy thiếu khí');
    if (B.r > fDNc + 1e-6) d.warn('C-Tech: thời gian khử nitrat hiệu dụng ' + U.fmt(fDNc, 3) + ' < V_D/V cần ' + U.fmt(B.r, 3) + ' – NO₃ ra cao hơn mục tiêu nếu không có khử nitrat đồng thời (SND, điều khiển DO thấp – cần số liệu) hoặc selector; xem xét ICEAS NDN(P) / tiền khử nitrat.', FX('Đổi sang ICEAS NDN(P)', { 'opt.line': 'ICEAS', 'ic.cycle': 'NDN' }), FX('Bổ sung carbon ngoài', { 'bio.extC': true }));
  }
  // ---- khí theo SFC ----
  d.h('E. Nhu cầu ôxy (phương pháp SFC)');
  const Nnit = B.st.Nnit, NO3dn = S.opt.process === 'ND' ? B.st.SNO3D : 0;
  const AOR = c.kO * LBOD + 4.57 * Nnit * Qd / 1000 - 2.86 * c.eDN * NO3dn * Qd / 1000;
  const p = U.patm(S.aer.hNN), hD = TWL - c.hd, fd = 1 + hD / 20.7, alpha = S.aer.alpha > 0 ? S.aer.alpha : 0.65, Tm = S.aer.Tmax;
  const ratio = alpha * Math.pow(1.024, Tm - 20) * (S.aer.beta * U.CsT(Tm) * fd * p / 1013.25 - S.aer.Cx) / (U.CsT(20) * fd);
  const SOR = AOR / ratio, SOTRb = SOR / (N * TA);
  const Qb_air = SOTRb * 1000 / (S.aer.SSOTR * ((TWL + BWL) / 2 - c.hd));
  const pd = (TWL - c.hd + 1.25) * 9.81; // + tổn thất đĩa & ống ≈ 1,25 m
  Object.assign(R, { AOR, SOR, SOTRb, Qair_b: Qb_air, pd, Qdec: Vfill / c.TD, Vsas: B.US / (c.Cs * 1000) });
  d.r('Nhu cầu ôxy thực', 'AOR', AOR, 'kg O₂/d', c.kO + '·L_BOD + 4,57·N_nit − 2,86·' + c.eDN + '·NO₃,dn');
  d.r('SOTR mỗi bể đang sục', 'SOTR_b', SOTRb, 'kg O₂/h', 'SOR/(N·TA); ' + U.fmt(nF) + ' bể sục đồng thời');
  d.r('Khí mỗi bể đang sục', 'Q_L', Qb_air, 'Nm³/h', c.nBl + ' máy/bể đang sục + ' + c.nBlSb + ' dự phòng');
  d.r('Áp lực máy thổi', 'p', pd, 'kPa');
  d.r('Decanter mỗi bể', 'Q_gạn', R.Qdec, 'm³/h', 'V_cấp/t_D');
  d.r('Bùn dư (SAS)', 'V_SAS', R.Vsas, 'm³/d', 'nồng độ ' + c.Cs * 100 + ' %; bơm ' + c.tSAS + ' phút/chu kỳ');
  R.d = d;
  return R;
};

/* ================= Kubota MBR ================= */
ENG.kubota = function (S, RL, R0) {
  const k = S.mbr.kub, d = new Rep('Kubota – màng tấm phẳng ngập (SMU)');
  const mod = DB.find('membrane', k.model) || DB.data.membrane.find(m => m.vendor === 'Kubota');
  const nTr = S.mbr.nTrains;
  const relax = (k.tOn + k.tOff) / k.tOn;
  const Aavg = RL.QtaM * 1000 / k.fluxAvg * relax, Apk = RL.Qm * 1000 / k.fluxPk * relax;
  const Areq = Math.max(Aavg, Apk);
  const nU = Math.ceil(Areq / mod.Afe / nTr) * nTr;
  const A = nU * mod.Afe;
  const Jnet = RL.QtaM * 1000 / A, JnetPk = RL.Qm * 1000 / A;
  const SAD = k.SADm > 0 ? k.SADm : mod.SADm;
  const Qair = SAD * A;
  // bố trí gần vuông: số bộ mỗi hàng ≈ √(n·W_u/L_u)
  const perRow = k.perRow > 0 ? k.perRow : Math.max(1, Math.min(nU / nTr, Math.ceil(Math.sqrt(nU / nTr * mod.Wu / mod.Lu))));
  const rows = Math.ceil(nU / nTr / perRow);
  const tankL = perRow * mod.Lu + (perRow + 1) * k.gap, tankW = rows * mod.Wu + (rows + 1) * k.gap;
  const tankH = mod.H + 0.5 + 0.6; // khoảng đáy + ngập trên
  const Vmb = tankL * tankW * tankH * nTr;
  const dp = (tankH - 0.3) * 98.07 + 80;
  const Pcf = DB.blowerPower(Qair, 1000, dp, 0.62) * 1.05 / 0.92;
  let Pperm = 0, head = 0;
  if (k.mode === 'suction') { head = k.TMPk / 9.81 + 2.5; Pperm = 9.81 * (RL.Qm / 3600) * head / 0.6; }
  const gravOK = k.mode === 'suction' || k.hG * 9.81 >= k.TMPk + 3;
  const cipV = A * k.cipL / 1000; // m³ dung dịch mỗi lần
  const naocl12 = cipV * k.cipC / 120000 * 1000 * k.cipN; // l/năm NaOCl 12 %
  Object.assign(R0, { kub: { mod, nU, A, Jnet, JnetPk, SAD, Qair, perRow, rows, tankL, tankW, tankH, Vmb, Pcf, Pperm, head, cipV, naocl12, relax, gravOK } });
  d.h('Màng Kubota');
  d.r('Model', '', mod.name, '', U.fmt(mod.Afe) + ' m²/bộ; vật liệu CPE, lỗ 0,2 µm');
  d.r('Thông lượng thiết kế TB / đỉnh (thực)', 'J', U.fmt(k.fluxAvg) + ' / ' + U.fmt(k.fluxPk), 'l/(m²·h)', 'tham khảo Kubota đô thị ~20 / 35');
  d.r('Chu kỳ lọc – nghỉ', '', k.tOn + ' / ' + k.tOff, 'phút', 'hệ số thông lượng tổng ' + U.fmt(relax, 3));
  d.r('Diện tích theo Q TB / Q_M', '', U.fmt(Aavg, 0) + ' / ' + U.fmt(Apk, 0), 'm²');
  d.r('Số bộ SMU', 'n', nU, 'bộ', nTr + ' dây chuyền × ' + nU / nTr);
  d.r('Diện tích màng lắp đặt', 'A', A, 'm²');
  d.r('Thông lượng thực TB / ở Q_M', '', U.fmt(Jnet) + ' / ' + U.fmt(JnetPk), 'l/(m²·h)');
  d.h('Bể màng & khí rửa');
  d.r('Bố trí mỗi dây chuyền', '', rows + ' hàng × ' + perRow + ' bộ', '', 'khe hở ' + k.gap + ' m');
  d.r('Kích thước bể màng (mỗi dây chuyền)', '', U.fmt(tankL) + ' × ' + U.fmt(tankW) + ' × ' + U.fmt(tankH), 'm', 'cao SMU ' + mod.H + ' m (tham khảo)');
  d.r('Thể tích bể màng', 'V_MB', Vmb, 'm³');
  d.r('Khí rửa riêng', 'SAD_m', SAD, 'Nm³/(m²·h)', mod.deck === 2 ? 'loại 2 tầng' : 'loại 1 tầng');
  d.r('Lưu lượng khí rửa', 'Q_CF', Qair, 'Nm³/h', 'làm sạch bộ khuếch tán tại chỗ 5 phút/ngày');
  d.r('Công suất máy thổi rửa', 'P', Pcf, 'kW', 'Δp ≈ ' + U.fmt(dp, 0) + ' mbar');
  d.h('Lấy nước thấm');
  d.r('Phương thức', '', { gravity: 'trọng lực', siphon: 'xi-phông', suction: 'bơm hút' }[k.mode], '', k.mode === 'suction' ? 'cột áp ' + U.fmt(head) + ' m, ' + U.fmt(Pperm) + ' kW' : 'cột nước khả dụng ' + k.hG + ' m');
  d.r('TMP vận hành', 'TMP', k.TMPk, 'kPa', 'thường 2–15 kPa');
  if (!gravOK) d.warn('Cột nước trọng lực không đủ cho TMP + tổn thất – tăng chênh mực nước hoặc dùng bơm hút.', FX('Dùng bơm hút', { 'mbr.kub.mode': 'suction' }), FX('Tăng cột nước +0,5 m', { 'mbr.kub.hG': k.hG + 0.5 }));
  d.h('Rửa hóa chất tại chỗ (CIP)');
  d.r('Dung dịch NaOCl ' + k.cipC + ' mg/l mỗi lần', 'V_CIP', cipV, 'm³', k.cipL + ' l/m² (tham khảo)');
  d.r('Tần suất', '', k.cipN, 'lần/năm', 'Kubota: 3–4 giờ mỗi 3 tháng');
  d.r('NaOCl 12 % tiêu thụ', '', naocl12, 'l/năm');
  d.info('Kubota MBR cho phép MLSS 5–20 g/l, SRT đến ~30 d; số liệu kích thước/SAD là tham khảo – xác nhận với Kubota khi lập hồ sơ.');
  return d;
};
