/* AquaDesign VN – Engine: bể bùn hoạt tính theo DWA-A 131 (2016), cơ sở COD
   Dùng chung cho dòng liên tục (CAS), SBR (hệ số thời gian phản ứng) và MBR. */
'use strict';

ENG.FC_TAB = [[4, 1.3], [6, 1.25], [8, 1.2], [10, 1.2], [15, 1.15], [25, 1.1]];
// hệ số quá trình PF theo fN và giá trị NH4 kiểm soát (A 131:2016)
ENG.PF_TAB = { 5: [[1.4, 1.5], [1.6, 1.6], [1.8, 1.9], [2.0, 2.2], [2.2, 2.5], [2.4, 2.8]], 10: [[1.4, 1.5], [1.6, 1.5], [1.8, 1.5], [2.0, 1.6], [2.2, 1.9], [2.4, 2.1]] };
ENG.DN_NAME = { pre: 'tiền khử nitrat', int: 'khử nitrat gián đoạn', sim: 'khử nitrat đồng thời', casc: 'khử nitrat bậc thang', comb: 'kết hợp tiền + gián đoạn' };
ENG.PROC_NAME = { C: 'chỉ khử carbon', N: 'nitrat hóa', ND: 'nitrat hóa & khử nitrat' };

/* mode: 'CAS' | 'SBR' | 'MBR'; ext = { TSmax, TS, fr (tỷ lệ thời gian phản ứng SBR) } */
ENG.bio = function (S, RL, ext) {
  const b = S.bio, o = S.opt, d = new Rep('Thông số bùn hoạt tính (DWA-A 131:2016)');
  const Qd = RL.Qd, C = RL.C, T = b.T;
  const fr = ext.fr || 1;
  const R = { T, fr };
  const proc = o.process, dn = o.dn;
  d.h('Cơ sở tính');
  d.r('Quy trình', '', ENG.PROC_NAME[proc] + (proc === 'ND' ? ' – ' + ENG.DN_NAME[dn] : '') + (o.stab ? ', ổn định bùn hiếu khí đồng thời' : ''), '');
  d.r('Nhiệt độ thiết kế', 'T', T, '°C', 'phạm vi 5–30 °C (DWA Themen T4/2016)');
  if (T < 5 || T > 30) d.warn('Nhiệt độ thiết kế ' + T + ' °C ngoài phạm vi áp dụng 5 – 30 °C.', FX('Đặt T = ' + (T < 5 ? 5 : 30) + ' °C', { 'bio.T': T < 5 ? 5 : 30 }));
  // tỷ lệ dinh dưỡng BOD₅ : N : P = 100 : 5 : 1 (Handbook 6.3) – thiếu N/P (nước thải công nghiệp) cần bổ sung
  if (C.BOD > 0) { const nN = C.TKN / C.BOD * 100, nP = C.P / C.BOD * 100;
    if (nN < 5 || nP < 1) d.warn('Tỷ lệ dinh dưỡng BOD₅:N:P = 100:' + U.fmt(nN, 1) + ':' + U.fmt(nP, 2) + ' – thiếu ' + (nN < 5 ? 'N' : '') + (nN < 5 && nP < 1 ? ' và ' : '') + (nP < 1 ? 'P' : '') + ' so với 100:5:1; bổ sung muối amoni/urê hoặc phosphat.'); }
  // ----- phân đoạn COD -----
  const CCOD = C.COD, XTS = C.TSS;
  // f_B: phần vô cơ của chất rắn lơ lửng – 0 = tự chọn theo A 131:2016 (0,3 không lắng sơ cấp; 0,2 có lắng sơ cấp)
  const fB = b.fB > 0 ? b.fB : (RL.prim && RL.prim.on ? 0.2 : 0.3);
  let XCOD = XTS * 1.6 * (1 - fB);
  if (XCOD > CCOD * (1 - b.fS)) { XCOD = CCOD * (1 - b.fS); d.warn('X_COD giới hạn bởi C_COD (TSS vào cao so với COD).'); }
  const SCOD = CCOD - XCOD, Sinert = b.fS * CCOD, Xinert = b.fA * XCOD;
  const Cdeg = CCOD - Sinert - Xinert, Cla = b.fCOD * Cdeg, Xanorg = fB * XTS;
  Object.assign(R, { CCOD, XCOD, SCOD, Sinert, Xinert, Cdeg, Cla, Xanorg, XTS });
  d.h('Phân đoạn COD vào bể (mg/l)');
  d.r('COD tổng', 'C_COD,ZB', CCOD, 'mg/l');
  d.r('COD dạng hạt', 'X_COD,ZB', XCOD, 'mg/l', 'X_TS·1,6·(1−f_B)');
  d.r('COD hòa tan', 'S_COD,ZB', SCOD, 'mg/l');
  d.r('COD hòa tan trơ', 'S_COD,inert', Sinert, 'mg/l', 'f_S = ' + b.fS);
  d.r('COD hạt trơ', 'X_COD,inert', Xinert, 'mg/l', 'f_A = ' + b.fA);
  d.r('COD phân hủy được', 'C_COD,abb', Cdeg, 'mg/l');
  d.r('COD dễ phân hủy', 'C_COD,la', Cla, 'mg/l', 'f_COD = ' + b.fCOD);
  d.r('Chất rắn vô cơ', 'X_anorg,TS', Xanorg, 'mg/l', 'f_B = ' + fB + (b.fB > 0 ? ' (nhập)' : RL.prim && RL.prim.on ? ' (tự chọn: có lắng sơ cấp)' : ' (tự chọn: không lắng sơ cấp)'));
  R.fB = fB;
  // ----- hàm trạng thái -----
  // danh mục carbon ngoài / chất kết tủa: sửa được trong Tùy chọn > Hằng số (S.cat), mặc định DEF
  const CAT = S.cat || {}, carb = DEF.carbon.map((c, i) => Object.assign({}, c, (CAT.carbon || [])[i] || {})), precs = Object.assign({}, DEF.prec, CAT.prec || {});
  const ce = carb[b.extType] || carb[0];
  const FT = t => Math.pow(1.072, t - 15);
  const XPBM = b.XPBM * CCOD;
  // X_P,BioP: nhập (b.XPBio > 0) hoặc 0 = tự chọn theo A 131: có bể kỵ khí riêng 0,01·C_COD; không có 0,005·C_COD
  const XPBioF = b.XPBio > 0 ? b.XPBio : o.anaerobic ? 0.01 : 0.005;
  const XPBio = (b.pBio || o.anaerobic) ? XPBioF * CCOD : 0;
  const state = (tSS, Cdos, t = T, NO3e = b.NO3e) => {
    const bf = b.b * FT(t);
    const XBM = (Cdeg * b.Y + Cdos * ce.Ydos) / (1 + bf * tSS);
    const XinBM = 0.2 * XBM * tSS * bf;
    const OVC = Cdeg + Cdos - XBM - XinBM;
    const XorgN = 0.07 * XBM + 0.03 * (XinBM + Xinert);
    const Nnit = Math.max(0, C.TKN - b.NorgE - b.NH4e - XorgN);
    const SNO3D = Math.max(0, C.TKN + C.NO3 - b.NorgE - b.NH4e - NO3e - XorgN);
    const USC = Qd * (Xinert / 1.33 + (XBM + XinBM) / (0.93 * 1.42) + Xanorg) / 1000;
    return { tSS, Cdos, t, bf, XBM, XinBM, OVC, XorgN, Nnit, SNO3D, USC };
  };
  const OVdos = Cdos => Cdos * (1 - ce.Ydos);
  // số mũ α_DB của tiền khử nitrat theo nhiệt độ & loại trạm (DWA-Themen T4/2016, Handbook 7.9.6): có lắng sơ cấp 0,64/0,68/0,75/0,76; sục khí kéo dài 0,60/0,68/0,72/0,75
  const aDB = (o.stab ? [0.60, 0.68, 0.72, 0.75] : [0.64, 0.68, 0.75, 0.76])[T < 8 ? 0 : T <= 20 ? 1 : T <= 25 ? 2 : 3];
  R.aDB = aDB;
  // phần tiền khử nitrat của hệ kết hợp (tiền + gián đoạn), ≥ 0,15 (Handbook AQUA DESIGNER 7.5.3; A 131:2016)
  const fPre = U.clamp(+o.combPre || 0.2, 0.05, 0.6);
  const OVCD0 = (st, r) => {
    const la = Cla * (1 - b.Y) + OVdos(st.Cdos), od = OVdos(st.Cdos);
    const pre = x => 0.75 * (la + (st.OVC - la) * Math.pow(Math.max(0, x), aDB));
    if (dn === 'pre' || dn === 'casc') return pre(r);
    if (dn === 'comb') {
      // OV_C,D = OV_C,D,vorg (bể tiền khử nitrat V_D,vorg/V) + OV_C,D,int (phần gián đoạn trong bể nitrat hóa); carbon dễ phân hủy & carbon ngoài chỉ tính ở phần tiền khử
      if (r <= fPre) return pre(r);
      return pre(fPre) + 0.75 * st.OVC * (r - fPre);
    }
    return 0.75 * (od + (st.OVC - od) * r);
  };
  // hệ số môi trường (DO/T/pH) cho năng lực khử nitrat – Handbook 7.5.4 (mặc định 1, giả thiết không ảnh hưởng)
  const OVCD = (st, r) => (b.fMil > 0 ? b.fMil : 1) * OVCD0(st, r);
  const dnRatio = st => {
    const need = 2.86 * st.SNO3D;
    if (need <= 0) return 0;
    if (OVCD(st, 1) < need) return 1.5; // không đủ
    return U.bisect(r => OVCD(st, r) - need, 0, 1, 1e-6);
  };
  // ----- tuổi bùn -----
  const BCOD = RL.bio.COD;
  let fN = U.clamp(U.interp([[2400, 2.4], [12000, 1.5]], BCOD), 1.4, 2.4);
  if (b.fNsel > 0) fN = b.fNsel;
  const PF = b.PF > 0 ? b.PF : U.interp(ENG.PF_TAB[b.SNH4ctl >= 10 ? 10 : 5], fN);
  const tAerDim = Math.max(2, PF * 3.4 * Math.pow(1.103, 15 - T));
  const tStab = o.stab ? b.fBstab / ((1 - b.fBstab - b.fiStab) * b.b * FT(T)) : 0;
  const PEc = BCOD / 0.12;
  // chỉ khử C: A 131 Bảng 2 (5 d ≤ 20 000 PE … 4 d > 100 000 PE) đến 12 °C; nước ấm theo DWA-Themen T4/2016 Bảng 6.1 (≤ 20 °C: 3 d; > 20 °C: 2 d)
  const tC = T <= 12 ? U.interp([[20000, 5], [100000, 4]], PEc) : T <= 20 ? 3 : 2;
  Object.assign(R, { fN, PF, tAerDim, tStab, tC });
  d.h('Tuổi bùn');
  if (proc !== 'C') {
    d.r('Hệ số dao động tải N', 'f_N', fN, '–', b.fNsel > 0 ? 'chọn' : 'theo B_d,COD = ' + U.fmt(BCOD) + ' kg/d');
    d.r('Hệ số quá trình', 'PF', PF, '–', 'S_NH4 kiểm soát ' + (b.SNH4ctl >= 10 ? 10 : 5) + ' mg/l');
    d.r('Tuổi bùn hiếu khí thiết kế', 't_TS,aer,Bem', tAerDim, 'd', 'PF·3,4·1,103^(15−T)');
  } else d.r('Tuổi bùn chỉ khử C', 't_TS', tC, 'd', T <= 12 ? 'A 131 Bảng 2 (theo quy mô PE)' : 'DWA-Themen T4/2016 Bảng 6.1 (T ' + (T <= 20 ? '≤' : '>') + ' 20 °C)');
  if (o.stab) d.r('Tuổi bùn ổn định bùn', 't_TS,Stab', tStab, 'd', 'f_B,Stab/((1−f_B,Stab−f_i)·b·1,072^(T−15))');
  let tSS, r = 0, st, Cdos = 0, capped = false, NO3eff = b.NO3e;
  const solveND = (cd) => {
    let t = Math.max(tAerDim / (0.7 * fr), tStab), rr = 0, s;
    for (let i = 0; i < 200; i++) {
      s = state(t, cd); rr = dnRatio(s);
      const ru = Math.min(rr, b.dnMax);
      const tn = Math.max(tAerDim / ((1 - ru) * fr), tStab);
      if (Math.abs(tn - t) < 1e-6) { t = tn; break; }
      t = 0.5 * (t + tn);
    }
    s = state(t, cd);
    return { t, r: dnRatio(s), s };
  };
  if (b.tSSfix > 0) {
    tSS = b.tSSfix; st = state(tSS, 0);
    r = proc === 'ND' ? dnRatio(st) : 0;
    const need = proc === 'C' ? tC : proc === 'N' ? tAerDim / fr : Math.max(tAerDim / ((1 - Math.min(r, b.dnMax)) * fr), tStab);
    if (tSS < Math.max(need, tStab) - 1e-6) d.warn('Tuổi bùn chọn ' + U.fmt(tSS) + ' d nhỏ hơn yêu cầu ' + U.fmt(Math.max(need, tStab)) + ' d.', FX('Tự tính tuổi bùn', { 'bio.tSSfix': 0 }), FX('Đặt t_TS = ' + U.fmt(U.ceilTo(Math.max(need, tStab), 0.5)) + ' d', { 'bio.tSSfix': U.ceilTo(Math.max(need, tStab), 0.5) }));
  } else if (proc === 'C') { tSS = Math.max(tC, tStab); st = state(tSS, 0); }
  else if (proc === 'N') { tSS = Math.max(tAerDim / fr, tStab); st = state(tSS, 0); }
  else {
    let z = solveND(0); tSS = z.t; r = z.r; st = z.s;
    if (r > b.dnMax + 1e-9) {
      if (b.extC) {
        const f = cd => solveND(cd).r - b.dnMax;
        let hi = 50; while (f(hi) > 0 && hi < 5000) hi *= 2;
        Cdos = U.bisect(f, 0, hi, 1e-4);
        z = solveND(Cdos); tSS = z.t; r = z.r; st = z.s;
        d.info('Bổ sung carbon ngoài để giữ V_D/V_BB = ' + b.dnMax);
      } else {
        capped = true;
        // nitrat ra đạt được khi V_D/V = dnMax
        const f = no3 => { const s = state(tSS, 0, T, no3); return OVCD(s, b.dnMax) - 2.86 * s.SNO3D; };
        NO3eff = U.bisect(f, 0, C.TKN, 1e-4);
        st = state(tSS, 0, T, NO3eff); r = b.dnMax;
        d.err('Tỷ lệ khử nitrat cần > ' + b.dnMax + ' (thiếu carbon). Với V_D/V = ' + b.dnMax + ' nitrat ra đạt ≈ ' + U.fmt(NO3eff) + ' mg/l. Chọn bổ sung carbon ngoài hoặc tăng NO₃-N ra.', FX('Bổ sung carbon ngoài', { 'bio.extC': true }), FX('Tăng NO₃-N ra = ' + U.fmt(U.ceilTo(NO3eff, 0.5)) + ' mg/l', { 'bio.NO3e': U.ceilTo(NO3eff, 0.5) }));
      }
    }
  }
  if (capped) { st = state(tSS, 0, T, NO3eff); r = b.dnMax; }
  if (proc === 'ND' && r > 1) r = b.dnMax;
  // V_D/V chọn lớn hơn yêu cầu (vd. SBR khử nitrat theo mẻ thiếu năng lực): giữ tuổi bùn hiếu khí → tăng tuổi bùn tổng
  if (proc === 'ND' && b.dnFix > r + 1e-9 && !(b.tSSfix > 0)) {
    d.info('V_D/V_BB chọn ' + U.fmt(b.dnFix, 2) + ' > yêu cầu ' + U.fmt(r, 3) + ' – tuổi bùn tăng để giữ tuổi bùn hiếu khí.');
    r = Math.min(b.dnFix, 0.75); tSS = Math.max(tAerDim / ((1 - r) * fr), tStab); st = state(tSS, 0, T, capped ? NO3eff : b.NO3e);
  }
  const tAer = tSS * (1 - (proc === 'ND' ? r : 0)) * fr;
  Object.assign(R, { tSS, r, st, Cdos, tAer, capped, NO3eff, ce });
  if (proc === 'ND') {
    d.r('Tỷ lệ thể tích khử nitrat', 'V_D/V_BB', r, '–', dn === 'pre' || dn === 'casc' || dn === 'comb' ? 'OV_C,D = 0,75·[OV_C,la + (OV_C − OV_C,la)·(V_D/V)^α], α = ' + aDB + ' (T4/2016, T = ' + T + ' °C, ' + (o.stab ? 'sục khí kéo dài' : 'có lắng sơ cấp') + ')' : 'OV_C,D = 0,75·OV_C·V_D/V');
    if (r > 0.6) d.warn('V_D/V_BB > 0,6.', FX('Giới hạn V_D/V = 0,6 (bổ sung carbon)', { 'bio.dnMax': 0.6, 'bio.extC': true }), FX('Tăng NO₃-N ra +2 mg/l', { 'bio.NO3e': S => S.bio.NO3e + 2 }));
    if (r < 0.2 && dn !== 'sim') d.info('V_D/V_BB < 0,2 – vùng thiếu khí nhỏ.');
  }
  d.r('Tuổi bùn tổng', 't_TS', tSS, 'd');
  d.r('Tuổi bùn hiếu khí', 't_TS,aer', tAer, 'd');
  // ----- bùn dư -----
  d.h('Sản lượng bùn dư');
  d.r('Hệ số nhiệt độ phân hủy', 'F_T', FT(T), '–', '1,072^(T−15)');
  d.r('Sinh khối (COD)', 'X_COD,BM', st.XBM, 'mg/l', '(C_abb·Y + C_dos·Y_dos)/(1+b·t_TS·F_T)');
  d.r('COD trơ từ phân hủy nội sinh', 'X_COD,inert,BM', st.XinBM, 'mg/l', '0,2·X_BM·t_TS·b·F_T');
  d.r('Bùn dư do khử C', 'ÜS_d,C', st.USC, 'kg/d', 'Q_d·(X_inert/1,33 + (X_BM+X_inert,BM)/(0,93·1,42) + f_B·X_TS) – A 131:2016');
  // ----- phốt pho -----
  d.h('Khử phốt pho');
  let XPprec = 0, XPe = C.P - XPBM - XPBio, Fe = 0, prec = precs[b.prec] || precs.Fe, precL = 0;
  if (b.pChem) { XPprec = Math.max(0, C.P - b.Pe - XPBM - XPBio); XPe = C.P - XPBM - XPBio - XPprec; }
  d.r('P vào', 'C_P,ZB', C.P, 'mg/l');
  d.r('P tích lũy sinh khối', 'X_P,BM', XPBM, 'mg/l', b.XPBM + '·C_COD');
  d.r('P khử sinh học tăng cường', 'X_P,BioP', XPBio, 'mg/l', XPBio ? XPBioF + '·C_COD' + (b.XPBio > 0 ? '' : o.anaerobic ? ' (tự chọn: có bể kỵ khí riêng, A 131: 0,01 – 0,0125)' : ' (tự chọn: không bể kỵ khí riêng)') : 'không chọn');
  if (b.pChem) {
    d.r('P cần kết tủa', 'X_P,Fäll', XPprec, 'mg/l', 'C_P − C_P,AN − X_P,BM − X_P,BioP');
    Fe = b.beta * prec.M / 30.97 * XPprec * Qd / 1000; // kg Me/d
    precL = Fe / prec.pct / prec.rho * 1000;
    d.r('Lượng kim loại (β = ' + b.beta + ')', b.prec, Fe, 'kg/d', 'β·M/31·X_P,Fäll·Q_d');
    d.r('Dung dịch ' + prec.name, '', precL, 'l/d', U.fmt(Fe / prec.pct) + ' kg/d');
  }
  d.r('P ra (ước tính)', 'C_P,AN', Math.max(0, XPe), 'mg/l');
  if (!b.pChem && XPe > b.Pe) d.warn('P ra ước tính ' + U.fmt(XPe) + ' mg/l > mục tiêu ' + b.Pe + ' – chọn kết tủa hóa học / bio-P.', FX('Bật kết tủa hóa học P', { 'bio.pChem': true }), S.opt.line === 'CAS' && FX('Thêm bể kỵ khí (bio-P) + kết tủa', { 'opt.anaerobic': true, 'bio.pChem': true }));
  // bùn hóa chất: hệ số 6,8 (Fe) / 5,3 (Al) ứng với β = 1,5, tăng tỷ lệ với β (Handbook 7.6.10)
  const fPrec = (prec.sludge || (b.prec === 'Al' ? 5.3 : 6.8)) * Math.max(1, b.beta / 1.5);
  const USP = Qd * (3 * XPBio + fPrec * XPprec) / 1000;
  d.r('Bùn dư do khử P', 'ÜS_d,P', USP, 'kg/d', 'Q_d·(3·X_P,BioP + ' + U.fmt(fPrec, 2) + '·X_P,Fäll)' + (b.beta > 1.5 ? ' – hệ số ×β/1,5' : ''));
  let US = st.USC + USP;
  d.r('Tổng bùn dư', 'ÜS_d', US, 'kg TS/d');
  // DWA-A 226 (trạm nhỏ, ổn định bùn hiếu khí đồng thời): bùn dư theo tải BOD, tuổi bùn tối thiểu 20/25 ngày (Handbook 7.5.3)
  const a226 = o.guide === 'A226' && o.standard === 'DWA' && S.opt.line === 'CAS';
  if (a226) {
    d.h('Thiết kế theo DWA-A 226 (trạm nhỏ, ổn định bùn đồng thời)');
    const BBOD = RL.bio.BOD, WSC = 1.0 * BBOD, WSP = b.pChem ? (b.prec === 'Al' ? 0.08 : 0.10) * WSC : 0;
    US = WSC + WSP;
    const tMin = proc === 'ND' ? 25 : 20;
    tSS = Math.max(b.tSSfix > 0 ? b.tSSfix : tMin, tMin);
    R.tAer = tSS * (1 - (proc === 'ND' ? r : 0)) * fr;
    d.r('Bùn dư do khử C', 'ÜS_d,C', WSC, 'kg/d', 'ÜS_BOD·B_d,BOD, ÜS_BOD = 1,0 kg SS/kg BOD₅');
    d.r('Bùn dư do kết tủa P', 'ÜS_d,P', WSP, 'kg/d', b.pChem ? (b.prec === 'Al' ? '8 %' : '10 %') + '·ÜS_d,C (' + b.prec + ')' : 'không kết tủa');
    d.r('Tổng bùn dư (A 226)', 'ÜS_d', US, 'kg TS/d');
    d.r('Tuổi bùn (A 226)', 't_TS', tSS, 'd', proc === 'ND' ? '≥ 25 d (ổn định + khử nitrat)' : '≥ 20 d (ổn định + nitrat hóa)');
    if (proc === 'ND' && dn !== 'int') d.warn('DWA-A 226 chỉ cho phép khử nitrat gián đoạn – đổi phương pháp khử nitrat sang "gián đoạn".', FX('Đổi sang khử nitrat gián đoạn', { 'opt.dn': 'int' }));
    if (BBOD / 0.06 > 5000) d.warn('DWA-A 226 dành cho trạm nhỏ (≤ 5 000 PE); trạm ' + U.fmt(BBOD / 0.06, 0) + ' PE nên dùng A 131:2016.', FX('Dùng DWA-A 131:2016', { 'opt.guide': 'A131' }));
  }
  R.a226 = a226;
  d.r('Bùn dư riêng', 'ÜS/B_COD', US / BCOD, 'kg/kg COD');
  // đối chiếu A 131:2000 (cơ sở BOD₅, hợp lệ COD/BOD ≤ 2): ÜS_C = B_BOD·(0,75 + 0,6·X_TS/C_BOD − 0,8·0,17·0,75·t_TS·F_T/(1 + 0,17·t_TS·F_T)); OV_C = 0,56 + 0,15·t_TS·F_T/(1 + 0,17·t_TS·F_T) ≤ 1,6
  if (!a226 && RL.bio.BOD > 0) {
    const ft = FT(T), x = 0.17 * tSS * ft, BB = RL.bio.BOD;
    const US2000 = BB * (0.75 + 0.6 * RL.bio.TSS / BB - 0.8 * 0.75 * x / (1 + x)), OVC2000 = Math.min(1.6, 0.56 + 0.15 * tSS * ft / (1 + x));
    R.a131old = { US: US2000, OVC: OVC2000 };
    d.c('Bùn dư khử C theo A 131:2000 (BOD₅)', 'ÜS_d,C', US2000, 'kg/d', 'đối chiếu', null, 'A 131:2016 = ' + U.fmt(st.USC) + ' kg/d' + (RL.bio.COD / BB > 2 ? '; COD/BOD > 2 – A 131:2000 không còn hợp lệ' : ''));
    d.c('Nhu cầu ôxy khử C theo A 131:2000', 'OV_C', OVC2000, 'kg O₂/kg BOD₅', 'đối chiếu (giới hạn 1,6)', null, 'A 131:2016 = ' + U.fmt(Qd * st.OVC / 1000 / BB, 2) + ' kg O₂/kg BOD₅');
  }
  Object.assign(R, { XPBM, XPBio, XPprec, Fe, precL, prec, USP, US, USC: st.USC, Pe: Math.max(0, XPe), BCOD, tSS });
  // ----- nitơ -----
  d.h('Cân bằng nitơ');
  d.r('TKN vào', 'C_N,ZB', C.TKN, 'mg/l');
  d.r('N hữu cơ ra', 'S_orgN,AN', b.NorgE, 'mg/l');
  d.r('NH₄-N ra', 'S_NH4,AN', b.NH4e, 'mg/l');
  d.r('N vào bùn dư', 'X_orgN,BM', st.XorgN, 'mg/l', '0,07·X_BM + 0,03·(X_inert,BM + X_inert)');
  d.r('N cần nitrat hóa', 'S_NH4,N', st.Nnit, 'mg/l');
  if (proc === 'ND') {
    d.r('NO₃-N ra', 'S_NO3,AN', capped ? NO3eff : b.NO3e, 'mg/l');
    d.r('NO₃-N cần khử', 'S_NO3,D', st.SNO3D, 'mg/l');
    const OVd = OVCD(st, r);
    d.r('Tỷ số x = OV_C,D/(2,86·S_NO3,D)', 'x', st.SNO3D > 0 ? OVd / (2.86 * st.SNO3D) : 0, '–', '≥ 1');
    R.x = st.SNO3D > 0 ? OVd / (2.86 * st.SNO3D) : 0;
    if (Cdos > 0) {
      const kg = Cdos * Qd / 1000 / ce.COD;
      d.r('Liều carbon ngoài (' + ce.name + ')', 'C_COD,dos', Cdos, 'mg/l COD', U.fmt(kg) + ' kg/d = ' + U.fmt(kg / ce.rho * 1000) + ' l/d');
      R.Cdos_kg = kg;
      // đối chiếu theo năng lực khử nitrat (Handbook 7.5.4): Q_d,Dos = S_NO3,D,ext/(cap·COD)·Q_d/1000; DWA: cap = 0,2 kg N/kg COD
      const s0 = state(tSS, 0), Sext = Math.max(0, st.SNO3D - OVCD(s0, r) / 2.86), codV = ce.COD * ce.rho;
      const capU = b.cDWA ? 0.2 : (ce.cap || 0.2), Qdos = Sext / (capU * codV) * Qd / 1000;
      d.r('NO₃-N cần khử bằng carbon ngoài', 'S_NO3,D,ext', Sext, 'mg/l', 'S_NO3,D − OV_C,D(không định lượng)/2,86');
      d.r('Lượng định lượng theo năng lực khử nitrat', 'Q_d,Dos', Qdos * 1000, 'l/d', 'S_NO3,D,ext/(' + capU + ' kg N/kg COD·' + U.fmt(codV, 0) + ' kg COD/m³)·Q_d' + (b.cDWA ? ' – DWA' : ''));
      d.r('Bùn dư thêm do carbon ngoài', 'ÜS_d,dos', 0.5 * Cdos * Qd / 1000, 'kg/d', '0,5 kg TS/kg COD định lượng (DWA/ATV) – đối chiếu');
      d.r('Điểm định lượng', '', { pre: 'trước bể bùn hoạt tính (bể tiền khử nitrat)', post: 'sau bể bùn hoạt tính (bể hậu khử nitrat)', rs: 'vào bùn tuần hoàn' }[b.dosPt || 'post'], '');
      R.QdosDWA = Qdos;
    }
    if (dn === 'pre' || dn === 'comb') {
      const NO3a = Math.max(0.5, capped ? NO3eff : b.NO3e);
      const RF = st.SNO3D / NO3a, RZ = Math.max(0, RF - S.sst.RV);
      R.RF = RF; R.RZ = RZ; R.QRZ = RZ * RL.QtaM;
      d.r('Tỷ lệ tuần hoàn tổng', 'RF', RF, '–', 'S_NO3,D/S_NO3,AN; η_D = ' + U.fmt(100 * (1 - 1 / (1 + RF)), 1) + ' %');
      d.r('Tuần hoàn nội', 'RZ', RZ, '–', 'RF − RV → Q_RZ = ' + U.fmt(R.QRZ) + ' m³/h');
      if (RZ > 4) d.warn('Tuần hoàn nội RZ = ' + U.fmt(RZ, 1) + ' > 4 – không kinh tế với tiền khử nitrat (Handbook 7.5.3): tăng NO₃-N ra, dùng khử nitrat bậc thang hoặc gián đoạn (bể khuấy trộn hoàn toàn cho phép đến 20).', FX('Tăng NO₃-N ra (RZ ≈ 4)', { 'bio.NO3e': +(st.SNO3D / (4 + S.sst.RV)).toFixed(1) }), FX('Đổi sang khử nitrat bậc thang', { 'opt.dn': 'casc', 'opt.nCasc': 3 }), FX('Đổi sang khử nitrat gián đoạn', { 'opt.dn': 'int' }));
    }
    if (dn === 'casc') {
      // bậc thang tách biệt: bùn tuần hoàn vào bậc 1, nước vào chia cho các bậc, không tuần hoàn nội – η_D = 1 − 1/(n·(1 + RS))
      const n = U.clamp(Math.round(+o.nCasc || 2), 1, 4), RS = S.sst.RV, etaD = 1 - 1 / (n * (1 + RS));
      const NO3min = st.Nnit / (n * (1 + RS));
      R.RZ = 0; R.QRZ = 0; R.etaD = etaD; R.NO3casc = NO3min;
      d.r('Hiệu suất khử nitrat bậc thang', 'η_D', etaD * 100, '%', '1 − 1/(n·(1 + RS)), n = ' + n + ', RS = ' + RS);
      d.r('NO₃-N ra theo cân bằng bậc thang', 'S_NO3,AN', NO3min, 'mg/l', 'S_NH4,N/(n·(1 + RS)) – phần nước vào bậc cuối được nitrat hóa và ra theo Q·(1 + RS)');
      if (NO3min > (capped ? NO3eff : b.NO3e) + 1e-6) d.warn('Khử nitrat bậc thang ' + n + ' bậc với RS = ' + RS + ' chỉ đạt NO₃-N ra ≈ ' + U.fmt(NO3min) + ' mg/l > mục tiêu ' + b.NO3e + ' mg/l – tăng số bậc (tối đa 4), tăng tỷ lệ bùn tuần hoàn hoặc bố trí tuần hoàn nội ở bậc cuối.', n < 4 && FX('Tăng số bậc lên ' + (n + 1), { 'opt.nCasc': n + 1 }), FX('Tăng NO₃-N ra = ' + U.fmt(U.ceilTo(NO3min, 0.5)), { 'bio.NO3e': U.ceilTo(NO3min, 0.5) }));
    }
  }
  // kiềm
  const dALK = 0.143 * st.Nnit - 0.071 * (proc === 'ND' ? st.SNO3D : 0) + (b.pChem ? (b.prec === 'Al' ? 0.11 : 0.06) * Fe / Qd * 1000 : 0) - 0.03 * XPprec;
  const SKSe = b.SKS - dALK; R.SKSe = SKSe;
  d.r('Độ kiềm ra', 'S_KS,AN', SKSe, 'mmol/l', 'S_KS,ZB − 0,143·N_nit + 0,071·S_NO3,D + 0,06·Fe − 0,03·X_P (≥ 1,5)');
  if (SKSe < 1.5) d.warn('Độ kiềm ra < 1,5 mmol/l – cần bổ sung kiềm.', proc === 'N' && FX('Đổi sang N/DN (hoàn trả kiềm)', { 'opt.process': 'ND' }), FX('Nhập độ kiềm vào sau bổ sung = ' + U.fmt(U.ceilTo(b.SKS + 1.5 - SKSe, 0.5)) + ' mmol/l', { 'bio.SKS': U.ceilTo(b.SKS + 1.5 - SKSe, 0.5) }));
  // ----- tải trọng/oxy -----
  const fC = U.interp(ENG.FC_TAB, tSS);
  R.fC = fC;
  R.ov = (t, tss) => {
    const s = state(tss, Cdos, t, capped ? NO3eff : b.NO3e);
    const OVdC = Qd * s.OVC / 1000;
    const OVdN = proc === 'C' ? 0 : Qd * 4.3 * s.Nnit / 1000;
    const OVdD = proc === 'ND' ? Qd * 2.86 * s.SNO3D / 1000 : 0;
    return { OVdC, OVdN, OVdD, s };
  };
  // M 229-1 / Handbook 7.9.6: tỷ lệ khử nitrat thực cần cho từng trường hợp tải (T); t_TS,aer > t_TS → giảm PF về 1,2; vẫn lớn hơn → không nitrat hóa
  R.caseDN = (t, tss) => {
    const s = state(tss, Cdos, t, capped ? NO3eff : b.NO3e);
    if (proc !== 'ND') return { r: 0, PF, noNit: proc === 'N' && PF * 3.4 * Math.pow(1.103, 15 - t) / fr > tss, SNO3D: 0, s };
    const need = Math.min(dnRatio(s), b.dnMax);
    let pf = PF, rMax = 1 - Math.max(2, pf * 3.4 * Math.pow(1.103, 15 - t)) / fr / tss;
    if (rMax < need && pf > 1.2) { pf = 1.2; rMax = 1 - Math.max(2, pf * 3.4 * Math.pow(1.103, 15 - t)) / fr / tss; }
    const rr = U.clamp(Math.min(need, rMax), 0, 1);
    return { r: rr, PF: pf, noNit: rMax <= 0, SNO3D: Math.min(s.SNO3D, OVCD(s, rr) / 2.86), s };
  };
  const ov = R.ov(T, tSS);
  Object.assign(R, ov);
  d.h('Nhu cầu ôxy (T = ' + T + ' °C)');
  d.r('Nhu cầu ôxy khử C', 'OV_d,C', ov.OVdC, 'kg O₂/d', 'Q_d·(C_abb + C_dos − X_BM − X_inert,BM)');
  d.r('Nhu cầu ôxy nitrat hóa', 'OV_d,N', ov.OVdN, 'kg O₂/d', 'Q_d·4,3·S_NH4,N');
  d.r('Ôxy thu hồi khử nitrat', 'OV_d,D', ov.OVdD, 'kg O₂/d', 'Q_d·2,86·S_NO3,D');
  d.r('Hệ số đỉnh khử C', 'f_C', fC, '–');
  d.r('Hệ số đỉnh nitrat hóa', 'f_N', fN, '–');
  // ----- khối lượng & thể tích -----
  const TS = ext.TS;
  const MTS = tSS * US;
  // bậc thang: MLSS mỗi bậc SS_k = SS_RS·Q_RS/(Q_RS + Σq_j) – bậc cuối = TS_BB (ra bể lắng); MLSS trung bình (thể tích bằng nhau) lớn hơn → thể tích nhỏ hơn
  let TSm = TS;
  if (proc === 'ND' && dn === 'casc' && S.opt.line !== 'SBR') {
    const n = U.clamp(Math.round(+o.nCasc || 2), 1, 4), RS = S.sst.RV, SSRS = TS * (1 + RS) / RS;
    let sh = Array(n).fill(1 / n);
    const ssOf = shv => { let cum = 0; return shv.map(q => { cum += q; return SSRS * RS / (RS + cum); }); };
    let ss = ssOf(sh);
    if (o.cascMode === 'bts') for (let it = 0; it < 50; it++) { const tot = ss.reduce((a, x) => a + x, 0); sh = ss.map(x => x / tot); ss = ssOf(sh); }   // tải trọng bùn bằng nhau: q_k ∝ SS_k (lặp)
    TSm = ss.reduce((a, x) => a + x, 0) / n;
    R.casc = { n, RS, SSRS, sh, ss, TSm };
  }
  const V = MTS / TSm;
  Object.assign(R, { TS, MTS, V, TSm, Bbod: RL.bio.BOD, Btkn: RL.bio.TKN });
  d.h('Thể tích bể');
  d.r('TS bể bùn hoạt tính', 'TS_BB', TS, 'kg/m³', ext.TSmax ? 'tối đa theo bể lắng ' + U.fmt(ext.TSmax) : '');
  if (ext.TSmax && TS > ext.TSmax + 1e-6) d.err('TS_BB lớn hơn giá trị lớn nhất bể lắng II cho phép.', FX('Lấy TS theo bể lắng II', { 'bio.TS': 0 }));
  d.r('Khối lượng bùn cần', 'M_TS,BB', MTS, 'kg', 't_TS·ÜS_d');
  if (S.opt.line !== 'SBR') {
    if (R.casc) {
      d.h('Khử nitrat bậc thang – ' + R.casc.n + ' bậc, thể tích bằng nhau, ' + (o.cascMode === 'bts' ? 'tải trọng bùn bằng nhau (lặp)' : 'chia đều nước vào'));
      d.r('MLSS bùn tuần hoàn', 'SS_RS', R.casc.SSRS, 'kg/m³', 'TS_BB·(1 + RS)/RS');
      R.casc.ss.forEach((x, k) => d.r('Bậc ' + (k + 1) + ': phần nước vào / MLSS / thể tích / B_TS', '', `${U.fmt(R.casc.sh[k] * 100, 1)} % / ${U.fmt(x, 2)} kg/m³ / ${U.fmt(V / R.casc.n, 0)} m³ / ${U.fmt(RL.bio.BOD * R.casc.sh[k] / (V / R.casc.n * x), 3)}`, '', 'SS_k = SS_RS·Q_RS/(Q_RS + Σq_j)'));
      d.r('MLSS trung bình', 'SS_AT,m', R.casc.TSm, 'kg/m³', 'so với ' + U.fmt(TS, 2) + ' kg/m³ không bậc thang');
    }
    d.r('Thể tích bể bùn hoạt tính cần', 'V_BB', V, 'm³', R.casc ? 'M_TS/SS_AT,m' : 'M_TS/TS_BB');
    if (proc === 'ND') { R.VD = r * V; R.VN = V - R.VD; d.r('Trong đó thiếu khí', 'V_D', R.VD, 'm³'); d.r('Hiếu khí', 'V_N', R.VN, 'm³'); }
    const BTS = RL.bio.BOD / MTS, BR = RL.bio.BOD / V;
    R.BTS = BTS; R.BR = BR;
    d.r('Tải trọng bùn BOD', 'B_TS', BTS, 'kg/(kg·d)');
    if (a226) {
      const lim = proc === 'ND' ? 0.04 : 0.05, fAT = V * 1000 / (RL.bio.BOD / 0.06);
      d.r('Thể tích riêng', 'f_AT', fAT, 'l/PE', 'V_BB·1000/EW_BOD60 – đối chiếu A 226 Bảng 2, 3');
      if (BTS > lim + 1e-9) d.warn('A 226: B_TS = ' + U.fmt(BTS, 3) + ' > ' + lim + ' kg/(kg·d) – tăng thể tích / tuổi bùn.', FX('Đặt t_TS để B_TS = ' + lim, { 'bio.tSSfix': U.ceilTo(tSS * BTS / lim, 1) }));
    }
    d.r('Tải trọng thể tích BOD', 'B_R', BR, 'kg/(m³·d)');
    d.r('Thời gian lưu nước (Q_d)', 'HRT', V / RL.Qd * 24, 'h');
  }
  // bể kỵ khí, selector
  if (o.anaerobic) {
    R.VAN = b.tRan * (1 + S.sst.RV) * RL.QtaM;
    d.r('Thể tích bể kỵ khí', 'V_BioP', R.VAN, 'm³', 't_R·(Q_T,aM + Q_RS), t_R = ' + b.tRan + ' h (thuận lợi 0,75 – 1,0; còn lại 1,0 – 2,0 h)');
    d.info('Khử P sinh học thuận lợi khi: nước thải đã lên men (axit hữu cơ ≥ 50 mg HAc/l); BOD₁/BOD₅ ≥ 0,3 hoặc BOD₅ lọc/BOD₅ ≥ 0,4; N/BOD₅ vào khử nitrat ≤ 0,25; không hoặc ít lắng sơ cấp; nén bùn cơ học; ít P hoàn lưu từ xử lý bùn; cống riêng ít nước thấm (Handbook 6.5). Không thỏa → chọn t_R 1,0 – 2,0 h và dự phòng kết tủa hóa học.');
  }
  if (o.selector) {
    R.Vsel = RL.bio.BOD / b.selBR;
    R.O2sel = 4 * R.Vsel;
    d.r('Thể tích selector hiếu khí', 'V_Sel', R.Vsel, 'm³', 'B_d,BOD/B_R,Sel, B_R = ' + b.selBR + ' kg/(m³·d)');
    d.r('Cấp ôxy selector', 'OC_Sel', R.O2sel, 'kg O₂/d', '4 kg O₂/(m³·d)');
  }
  R.d = d;
  return R;
};

// tính lại tuổi bùn thực theo thể tích chọn
ENG.bioActual = function (B, Vreal) {
  const M = Vreal * (B.TSm || B.TS);   // bậc thang: MLSS trung bình
  let t = B.tSS;
  for (let i = 0; i < 30; i++) {
    const s = B.ov(B.T, t).s;
    const US = s.USC + B.USP;
    t = M / US;
  }
  return { tSS: t, tAer: t * (1 - (B.r || 0)) * B.fr };
};
