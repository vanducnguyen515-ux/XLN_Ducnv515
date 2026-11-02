/*
 * SimXLNT – Bộ tính toán sơ bộ công nghệ bùn hạt hiếu khí (AGS, kiểu NEREDA®)
 *
 * Phương pháp: cân bằng khối lượng trạng thái ổn định (Metcalf & Eddy, 5th ed.)
 * áp dụng cho bể SBR nạp-xả đồng thời từ đáy, kết hợp các tiêu chí thủy lực
 * đặc thù của AGS (tỷ lệ trao đổi thể tích, vận tốc nạp đi lên, chiều cao lớp
 * bùn sau lắng, thời gian lắng).
 *
 * NEREDA® là thương hiệu của Royal HaskoningDHV. Công cụ này độc lập, chỉ dùng
 * cho tính toán sơ bộ / đánh giá phương án, không thay thế thiết kế của nhà
 * cung cấp công nghệ.
 *
 * Đơn vị: Q m³/ngày, nồng độ mg/L (= g/m³), thời gian h, SRT ngày.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeredaEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    // Lưu lượng
    Q: 20000, PFh: 1.5, Frwf: 2.5,
    // Nước thải đầu vào
    COD: 400, BOD: 200, bcodBod: 1.6, nbsCOD: 30, rbFrac: 0.20,
    TSS: 220, vssTss: 0.80, TKN: 45, NH4: 32, TP: 6, Alk: 250,
    Tmin: 22, Tmax: 32, elev: 10, pH: 7.2, EC: 1000,
    // Mục tiêu đầu ra (QCVN 40:2011/BTNMT cột A, tham khảo)
    tBOD: 30, tCOD: 75, tTSS: 50, tNH4: 5, tTN: 20, tTP: 4, tNO3: 0,
    sfEff: 0.8, TSSe: 15, ONsol: 1.0,
    // Cấu hình bể
    Nr: 3, H: 7.0, shape: 'rect', LW: 2.0,
    tc: 6.0, tcRwf: 3.0, ts: 0.5, tidle: 0.25, tAnMin: 1.0, tAerMinRwf: 1.0,
    buffer: false, tF: 1.0,
    // MLSS 8–15 g/L, trao đổi 15–60%/mẻ: O&M Manual RHDHV (2023); bùn hạt lắng 1 m trong ~4 phút
    X: 8.0, SVI: 40, VERdwf: 0.50, VERrwf: 0.60, vUpMax: 5.0, vSettle: 15,
    // Động học & thiết kế
    SFn: 1.5, NH4design: 1.0, SRTmin: 15, DO: 2.0, KO: 1.0,
    muN: 0.90, bN: 0.17, KN: 0.50, Yn: 0.15,
    muH: 6.0, Ks: 8.0, YH: 0.45, bH: 0.12, fd: 0.15,
    // Cấp khí
    // α 0,70: O&M ghi nhận hiệu quả hấp thụ O₂ của bùn hạt cao hơn; hiệu chỉnh theo điện năng Epe & Garmerwolde
    alpha: 0.70, beta: 0.95, Ff: 0.90, sotePerM: 5.0, dPloss: 15,
    eBlower: 0.70, Tair: 35, PFo2: 1.5, mixMin: 0.6, discQ: 6.0,
    // Khử N, P, hóa chất, bùn
    // fDen hiệu chỉnh theo số liệu Garmerwolde và Epe (TN ra 7 và < 4 mg/L, không châm carbon)
    fDen: 0.55, CODN: 5.0, rbP: 10, etaBioP: 0.70, Pcont: 0.04,
    pChem: 'FeCl3', MeP: 1.8, AlkMin: 70,
    WASc: 12, cakeDS: 20, polyDose: 6,
    // Khởi động: có hạt mồi từ trạm NEREDA khác (O&M khuyến nghị) hay chỉ bùn hoạt tính
    seed: 'granule'
  };

  const PRESETS = {
    'qcvn40A': { nameEn: 'QCVN 40:2011/BTNMT – Column A (expired 1 Sep 2025)', name: 'QCVN 40:2011/BTNMT – Cột A (hết hiệu lực 01/9/2025)', tBOD: 30, tCOD: 75, tTSS: 50, tNH4: 5, tTN: 20, tTP: 4 , tNO3: 0 },
    'qcvn40B': { nameEn: 'QCVN 40:2011/BTNMT – Column B (expired 1 Sep 2025)', name: 'QCVN 40:2011/BTNMT – Cột B (hết hiệu lực 01/9/2025)', tBOD: 50, tCOD: 150, tTSS: 100, tNH4: 10, tTN: 40, tTP: 6 , tNO3: 0 },
    'qcvn14A': { nameEn: 'QCVN 14:2008/BTNMT – Column A (expired 1 Sep 2025)', name: 'QCVN 14:2008/BTNMT – Cột A (hết hiệu lực 01/9/2025)', tBOD: 30, tCOD: 0, tTSS: 50, tNH4: 5, tTN: 35, tTP: 6 , tNO3: 0 },
    'qcvn14B': { nameEn: 'QCVN 14:2008/BTNMT – Column B (expired 1 Sep 2025)', name: 'QCVN 14:2008/BTNMT – Cột B (hết hiệu lực 01/9/2025)', tBOD: 50, tCOD: 0, tTSS: 100, tNH4: 10, tTN: 60, tTP: 10 , tNO3: 0 },
    'eu91': { nameEn: 'EU 91/271/EEC – sensitive area > 100,000 PE', name: 'EU 91/271/EEC – vùng nhạy cảm > 100.000 PE', tBOD: 25, tCOD: 125, tTSS: 35, tNH4: 0, tTN: 10, tTP: 1, tNO3: 0 },
    'ksaTSE': { nameEn: 'Saudi Arabia TSE reuse (Jeddah Airport-2 project)', name: 'TSE tái sử dụng Ả Rập Xê Út (dự án Jeddah Airport-2)', tBOD: 10, tCOD: 0, tTSS: 10, tNH4: 5, tTN: 0, tTP: 1, tNO3: 10 }
  };
  // QCVN 2025 (../../js/qcvn.js) – mọi bậc lưu lượng F, nguồn tiếp nhận sông (hồ: sửa T-P theo QCVN)
  if (typeof QCVN !== 'undefined') for (const o of QCVN.list(null)) {
    if (o.rcv !== 'song') continue;
    const v = o.v, en = v.name.replace('cột', 'column').replace('nguồn tiếp nhận sông', 'river').replace('m³/ngđ', 'm³/d').replace(/(\d)\.(\d{3})/g, '$1,$2');
    PRESETS['q25_' + o.id] = { name: v.name, nameEn: en, tBOD: v.BOD, tCOD: v.COD, tTSS: v.TSS, tNH4: v.NH4, tTN: v.TN, tTP: v.TP, tNO3: 0 };
  }

  const GOV = {
    bio: { vi: 'Khối lượng bùn (SRT × MLSS)', en: 'Sludge mass (SRT × MLSS)' },
    dwf: { vi: 'Trao đổi thể tích – mùa khô', en: 'Volume exchange – dry weather' },
    rwf: { vi: 'Trao đổi thể tích – mùa mưa', en: 'Volume exchange – wet weather' },
    up: { vi: 'Vận tốc nạp đi lên', en: 'Feed upflow velocity' }
  };
  const AIR_O2 = 0.279;     // kg O2 / Sm³ không khí (20 °C, 1 atm)
  const AIR_RHO = 1.204;    // kg/Sm³
  const MW = { P: 30.97, Fe: 55.85, Al: 26.98, FeCl3: 162.2, FePO4: 150.8, FeOH3: 106.9, AlPO4: 121.95, AlOH3: 78.0 };

  // Độ hòa tan O2 trong nước sạch, 1 atm (mg/L)
  function csT(T) { return 14.652 - 0.41022 * T + 0.007991 * T * T - 0.000077774 * T * T * T; }

  // Lịch chu kỳ: các pha cho bể k, lệch pha tc/N
  function schedule(N, tc, tF, tA, tS, tI, tW = 0) {
    const phases = [['F', tF], ['W', tW], ['A', tA], ['S', tS], ['I', tI]];
    const rows = [];
    for (let k = 0; k < N; k++) rows.push({ offset: k * tc / N, phases });
    return rows;
  }
  function phaseAt(row, t, tc) {
    let x = ((t - row.offset) % tc + tc) % tc, acc = 0;
    for (const [ph, d] of row.phases) { if (x < acc + d) return ph; acc += d; }
    return 'I';
  }
  function maxSimultaneous(rows, tc, ph) {
    let m = 0;
    for (let i = 0; i < 2000; i++) {
      const t = (i + 0.5) * tc / 2000;
      let c = 0; for (const r of rows) if (phaseAt(r, t, tc) === ph) c++;
      if (c > m) m = c;
    }
    return m;
  }

  // Động học sinh học ở nhiệt độ T, SRT tổng và SRT hiếu khí
  function biology(p, inf, T, SRT, SRTa) {
    const muN = p.muN * Math.pow(1.072, T - 20);
    const bN = p.bN * Math.pow(1.029, T - 20);
    const KN = p.KN * Math.pow(1.053, T - 20);
    const muH = p.muH * Math.pow(1.07, T - 20);
    const bH = p.bH * Math.pow(1.04, T - 20);
    const fDO = p.DO / (p.KO + p.DO);

    let S = p.Ks * (1 + bH * SRTa) / (SRTa * (muH - bH) - 1);
    if (!(S > 0) || S > inf.bCOD) S = inf.bCOD;
    const dN = SRTa * (muN * fDO - bN) - 1;
    let Ne = dN > 0 ? KN * (1 + bN * SRTa) / dN : p.TKN;
    Ne = Math.min(Math.max(Ne, 0), p.TKN);

    let NOx = 0.7 * p.TKN, Xh = 0, Xd = 0, Xn = 0;
    for (let i = 0; i < 30; i++) {
      Xh = p.YH * (inf.bCOD - S) / (1 + bH * SRT);
      Xd = p.fd * bH * Xh * SRT;
      Xn = p.Yn * NOx / (1 + bN * SRT);
      const n = Math.max(0, p.TKN - Ne - p.ONsol - 0.12 * (Xh + Xd + Xn));
      if (Math.abs(n - NOx) < 1e-6) { NOx = n; break; }
      NOx = n;
    }
    const Pbio = Xh + Xd + Xn;                       // mg VSS / L nước vào
    const PVSS = Pbio + inf.nbVSS;
    const PTSS = Pbio / 0.85 + inf.nbVSS + inf.iTSS;  // mg TSS / L
    return { muN, bN, KN, muH, bH, fDO, S, Ne, NOx, Xh, Xd, Xn, Pbio, PVSS, PTSS };
  }

  function compute(input) {
    const p = Object.assign({}, DEFAULTS, input);
    const W = [];
    const warn = (lvl, msg, en) => W.push({ lvl, msg, en: en || msg });

    // ---- Lưu lượng
    const Q = p.Q, Qh = Q / 24, QpkH = Q * p.PFh / 24, Qrwf = Q * p.Frwf, QrwfH = Qrwf / 24;

    // ---- Thành phần nước thải
    const bCOD = p.bcodBod * p.BOD;
    const VSS = p.vssTss * p.TSS, iTSS = p.TSS - VSS;
    let nbpCOD = p.COD - bCOD - p.nbsCOD;
    if (nbpCOD < 0) { warn('warn', 'COD < bCOD + nbsCOD: kiểm tra lại tỷ lệ bCOD/BOD hoặc nbsCOD. Đã đặt nbpCOD = 0.', 'COD < bCOD + nbsCOD: check the bCOD/BOD ratio or nbsCOD. nbpCOD has been set to 0.'); nbpCOD = 0; }
    const nbVSS = Math.min(nbpCOD / 1.42, VSS);
    const rbCOD = Math.min(p.rbFrac * p.COD, bCOD);
    const inf = { bCOD, VSS, iTSS, nbpCOD, nbVSS, rbCOD };

    if (p.BOD / p.COD < 0.4) warn('warn', `BOD₅/COD = ${(p.BOD / p.COD).toFixed(2)} < 0,4: nước thải khó phân hủy sinh học, cần thí nghiệm xác nhận.`, `BOD₅/COD = ${(p.BOD / p.COD).toFixed(2)} < 0.4: poorly biodegradable wastewater, confirm by testing.`);
    if (p.rbFrac < 0.10) warn('warn', 'rbCOD/COD < 10%: thiếu cơ chất dễ phân hủy cho PAO/GAO ở pha nạp kỵ khí, nguy cơ tạo hạt kém. Cân nhắc bỏ lắng sơ cấp hoặc lên men bùn sơ cấp.', 'rbCOD/COD < 10%: little readily biodegradable substrate for PAO/GAO during the anaerobic feed, risk of poor granulation. Consider bypassing primary settling or primary sludge fermentation.');
    if (p.COD / p.TKN < 8) warn('warn', `COD/TKN = ${(p.COD / p.TKN).toFixed(1)} < 8: nguồn carbon hạn chế cho khử nitrat.`, `COD/TKN = ${(p.COD / p.TKN).toFixed(1)} < 8: limited carbon for denitrification.`);
    if (p.Frwf < 1.7 || p.Frwf > 4.5) warn('info', `Hệ số lưu lượng mùa mưa ${p.Frwf} nằm ngoài dải của các trạm NEREDA tham chiếu (1,7–4,5).`, `Wet-weather flow factor ${p.Frwf} is outside the range of the reference NEREDA plants (1.7–4.5).`);
    if (p.H > 11.5) warn('warn', `Chiều sâu ${p.H} m vượt bể sâu nhất trong tài liệu tham chiếu (11,3 m – Westfort).`, `Depth ${p.H} m exceeds the deepest reference tank (11.3 m – Westfort).`);
    if (p.H < 4) warn('info', `Chiều sâu ${p.H} m nông: diện tích lớn, chưa tận dụng ưu thế SOTE của bể sâu.`, `Depth ${p.H} m is shallow: larger footprint and the SOTE benefit of deep tanks is not used.`);
    if (p.Tmin < 12) warn('warn', 'Nhiệt độ thấp (< 12 °C): tạo hạt và nitrat hóa chậm, cần SRT dài hơn.', 'Low temperature (< 12 °C): slower granulation and nitrification, a longer SRT is needed.');
    if (p.pH < 5.5 || p.pH > 9.5) warn('crit', `pH đầu vào ${p.pH} ngoài dải 5,5–9,5: bộ điều khiển NEREDA dừng nạp để bảo vệ bùn hạt. Cần trung hòa trước.`, `Influent pH ${p.pH} outside 5.5–9.5: the NEREDA controller stops feeding to protect the granules. Neutralise upstream.`);
    if (p.EC < 100 || p.EC > 5000) warn('warn', `Độ dẫn điện ${p.EC} µS/cm ngoài dải đặt điển hình 100–5.000 µS/cm: bộ điều khiển NEREDA dừng nạp nếu giữ giá trị đặt này. Giá trị đặt tùy trạm (Ringsend vận hành với nước nhiễm mặn); cần thí nghiệm và nhà cung cấp xác nhận.`, `Conductivity ${p.EC} µS/cm outside the typical setpoint range 100–5,000 µS/cm: the NEREDA controller stops feeding at these setpoints. Setpoints are site-specific (Ringsend operates on saline sewage); confirm by testing and with the supplier.`);
    if (p.COD < 250 && p.seed !== 'granule') warn('warn', 'Nước thải loãng (COD < 250 mg/L) khởi động bằng bùn hoạt tính: các trạm thực tế cần 10–13 tháng để đạt ≥ 85% bùn hạt. Nên dùng hạt mồi từ trạm NEREDA khác.', 'Low-strength sewage (COD < 250 mg/L) started with activated sludge: full-scale plants needed 10–13 months to reach ≥ 85% granules. Use granular seed from another NEREDA plant.');

    // ---- Chu kỳ
    const N = Math.max(1, Math.round(p.Nr)), tc = p.tc;
    let tF = p.buffer ? p.tF : tc / N;
    if (p.buffer && N * p.tF > tc + 1e-9) { warn('warn', 'Tổng thời gian nạp của các bể vượt chu kỳ: đã đặt thời gian nạp = chu kỳ / số bể.', 'Total feed time of all reactors exceeds the cycle: feed time set to cycle / number of reactors.'); tF = tc / N; }
    // Kỵ khí ≥ 60 phút tính từ đầu pha nạp đến lúc sục khí (O&M Manual): thêm pha chờ kỵ khí nếu nạp ngắn
    const tW = Math.max(p.tAnMin - tF, 0);
    const tA = tc - tF - tW - p.ts - p.tidle;
    if (tA <= 0.25) { warn('crit', 'Thời gian sục khí ≤ 15 phút: tăng chu kỳ, tăng số bể hoặc giảm thời gian lắng/chờ.', 'Aeration time ≤ 15 min: increase the cycle, the number of reactors, or reduce settling/idle time.'); }
    const tAeff = Math.max(tA, 0.25);
    const fAer = tAeff / tc;
    if (!p.buffer && N < 3) warn('warn', `Không có bể điều hòa thì cần ít nhất 3 bể để luôn có 1 bể nhận nước (cấu hình Epe). Với ${N} bể, dùng bể điều hòa (Wemmershoek: 1 điều hòa + 2 bể; Hartebeestfontein: 1 điều hòa + 1 bể).`, `Without an influent buffer at least 3 reactors are needed so one reactor always receives flow (Epe layout). With ${N} reactor(s), add a buffer (Wemmershoek: 1 buffer + 2 reactors; Hartebeestfontein: 1 buffer + 1 reactor).`);
    const tFr = tc > 0 ? p.tcRwf / N : 0;
    const tWr = Math.max(p.tAnMin - tFr, 0);
    const tAr = p.tcRwf - tFr - tWr - p.ts - p.tidle;
    if (tAr <= 0.25) warn('crit', `Chế độ mưa: thời gian sục khí chỉ còn ${(Math.max(tAr, 0) * 60).toFixed(0)} phút. Tăng chu kỳ mùa mưa hoặc số bể.`, `Storm mode: aeration time is only ${(Math.max(tAr, 0) * 60).toFixed(0)} min. Increase the storm cycle or the number of reactors.`);
    else if (tAr < p.tAerMinRwf) warn('warn', `Chế độ mưa: thời gian sục khí ${(tAr * 60).toFixed(0)} phút < tối thiểu ${(p.tAerMinRwf * 60).toFixed(0)} phút. Tăng chu kỳ mùa mưa, số bể hoặc dùng bể điều hòa.`, `Storm mode: aeration time ${(tAr * 60).toFixed(0)} min < minimum ${(p.tAerMinRwf * 60).toFixed(0)} min. Increase the storm cycle, the number of reactors, or use a buffer.`);

    // ---- SRT nitrat hóa ở Tmin
    const T = p.Tmin;
    const muN = p.muN * Math.pow(1.072, T - 20), bN = p.bN * Math.pow(1.029, T - 20), KN = p.KN * Math.pow(1.053, T - 20);
    const fDO = p.DO / (p.KO + p.DO);
    const muNeff = muN * fDO * p.NH4design / (KN + p.NH4design) - bN;
    if (muNeff <= 0) {
      warn('crit', 'Không thể nitrat hóa ở nhiệt độ/DO đã chọn (tốc độ tăng trưởng thực ≤ 0).', 'Nitrification is not possible at the selected temperature/DO (net growth rate ≤ 0).');
      return { ok: false, p, warnings: W };
    }
    const SRTth = 1 / muNeff;
    const SRTaerReq = p.SFn * SRTth;
    const SRTbyN = SRTaerReq / fAer;
    const SRT = Math.max(SRTbyN, p.SRTmin);
    const SRTgovKey = SRT === SRTbyN ? 'nit' : 'gran';
    const SRTgov = SRTgovKey === 'nit' ? 'nitrat hóa' : 'ổn định hạt';
    const SRTa = SRT * fAer;

    const bioC = biology(p, inf, p.Tmin, SRT, SRTa);
    const bioW = biology(p, inf, p.Tmax, SRT, SRTa);

    // ---- Khử nitrat (dùng trường hợp Tmin – NOx bảo thủ cho TN; Tmax cho O2)
    function denit(bio) {
      const TNlim = p.tTN > 0 ? p.tTN * p.sfEff : Infinity;
      const VSSe = p.TSSe * (bio.PVSS / bio.PTSS);
      const ONpart = 0.12 * VSSe;
      const NO3lim = p.tNO3 > 0 ? p.tNO3 * p.sfEff : Infinity;
      const NO3allow = Math.max(0, Math.min(TNlim - bio.Ne - p.ONsol - ONpart, NO3lim));
      const cap = p.fDen * bCOD / p.CODN;
      const dnBio = Math.min(bio.NOx, cap);
      const NO3bio = bio.NOx - dnBio;
      const short = Math.max(0, NO3bio - NO3allow);
      return { TNlim, VSSe, ONpart, NO3allow, cap, dnBio, NO3bio, short, NO3fin: NO3bio - short };
    }
    const dnC = denit(bioC), dnW = denit(bioW);
    const carbonCOD = Math.max(dnC.short, dnW.short) * p.CODN;  // mg COD/L
    const methanolKg = carbonCOD * Q / 1000 / 1.5;

    // ---- Phốt pho
    const VSSe = dnC.VSSe;
    const Psyn = 0.015 * bioC.Pbio;
    const Pebpr = p.etaBioP * rbCOD / p.rbP;
    const Ppart = VSSe * p.Pcont;
    const sPbio = Math.max(p.TP - Psyn - Pebpr - Ppart, 0.1);   // Epe: P-PO4 ra 0,26 → < 0,02 mg/L
    const TPbio = sPbio + Ppart;
    const TPlim = p.tTP > 0 ? p.tTP * p.sfEff : Infinity;
    let Pchem = 0, metal = 0, chemDose = 0, chemSludge = 0, chemAlk = 0, chemName = '', chemSol = 0;
    if (TPbio > TPlim) {
      const sPtarget = Math.max(TPlim - Ppart, 0.1);
      Pchem = Math.max(sPbio - sPtarget, 0);
      const molP = Pchem / MW.P, molMe = p.MeP * molP;
      if (p.pChem === 'PAC') {
        metal = molMe * MW.Al;
        chemDose = metal / (0.30 * 2 * MW.Al / 101.96);             // PAC 30% Al2O3
        chemSludge = molP * MW.AlPO4 + (molMe - molP) * MW.AlOH3;
        chemAlk = metal * 5.56 * 0.5;                               // PAC đã trung hòa một phần
        chemName = 'PAC (30% Al₂O₃)';
        chemSol = chemDose * Q / 1000;                              // kg/ngày dạng bột
      } else {
        metal = molMe * MW.Fe;
        chemDose = molMe * MW.FeCl3;
        chemSludge = molP * MW.FePO4 + (molMe - molP) * MW.FeOH3;
        chemAlk = metal * 2.69;
        chemName = 'FeCl₃';
        chemSol = chemDose * Q / 1000 / (0.40 * 1.42);              // L/ngày dung dịch 40%
      }
    }
    const TPfin = TPbio - Pchem;
    if (Ppart > TPlim) warn('crit', `P dạng hạt trong TSS đầu ra (${Ppart.toFixed(2)} mg/L) đã vượt giới hạn TP thiết kế: cần lọc sau AGS để giảm TSS.`, `Particulate P in effluent TSS (${Ppart.toFixed(2)} mg/L) already exceeds the design TP limit: filtration after AGS is needed to reduce TSS.`);

    // ---- Kiềm
    const AlkBio = p.Alk - 7.14 * bioW.NOx + 3.57 * dnW.dnBio;
    const AlkFin = AlkBio + 3.57 * dnW.short - chemAlk;
    const NaOH = AlkFin < p.AlkMin ? (p.AlkMin - AlkFin) * 0.8 : 0;     // mg NaOH/L
    const NaOHkg = NaOH * Q / 1000, NaOHsol = NaOHkg / (0.32 * 1.35);

    // ---- Bùn & thể tích
    const PxTSS = (bioC.PTSS + chemSludge) * Q / 1000;      // kg/ngày
    const PxVSS = bioC.PVSS * Q / 1000;
    const M = PxTSS * SRT;                                  // kg TSS trong hệ
    const Vbio = M / p.X;
    const VfDwf = Q * tc / 24 / N;
    const VfRwf = Qrwf * p.tcRwf / 24 / N;
    const VhydD = N * VfDwf / p.VERdwf;
    const VhydR = N * VfRwf / p.VERrwf;
    let Vreq = Math.max(Vbio, VhydD, VhydR);
    let govKey = Vreq === Vbio ? 'bio' : (Vreq === VhydD ? 'dwf' : 'rwf');
    let A = Vreq / N / p.H;
    const QfeedD = p.buffer ? QpkH * tc / (N * tF) : QpkH;
    const QfeedR = QrwfH;
    const Aup = Math.max(QfeedD, QfeedR) / p.vUpMax;
    if (Aup > A) { A = Aup; govKey = 'up'; }
    const gov = GOV[govKey].vi, govEn = GOV[govKey].en;
    const VR = A * p.H, Vtot = VR * N;
    const Xact = M / Vtot;
    const SRTatX = Vtot * p.X / PxTSS;
    const VERd = VfDwf / VR, VERr = VfRwf / VR;
    if (VERd < 0.15) warn('info', `Tỷ lệ trao đổi mùa khô ${(VERd * 100).toFixed(0)}% < 15%: thấp hơn dải thường gặp (15–60%), có thể rút ngắn chu kỳ hoặc giảm thể tích.`, `Dry-weather exchange ratio ${(VERd * 100).toFixed(0)}% < 15%: below the usual range (15–60%); the cycle or the volume could be reduced.`);
    const vUpD = QfeedD / A, vUpR = QfeedR / A;
    if (p.COD < 400 && vUpD > 5.9) warn('info', `Nước thải loãng với vận tốc nạp đi lên ${vUpD.toFixed(1)} m/h: thí nghiệm Derlon và cs. (2016) cho thấy 5,9–16 m/h làm trôi bùn, SRT thấp, nitrat hóa kém khi tạo hạt. Giai đoạn khởi động nên nạp chậm (khoảng 1 m/h).`, `Low-strength sewage with a feed upflow velocity of ${vUpD.toFixed(1)} m/h: Derlon et al. (2016) found that 5.9–16 m/h washes out biomass, lowers SRT and impairs nitrification during granulation. Feed slowly during start-up (about 1 m/h).`);

    let dims;
    if (p.shape === 'circ') dims = { D: Math.sqrt(4 * A / Math.PI) };
    else { const Wd = Math.sqrt(A / p.LW); dims = { L: Wd * p.LW, W: Wd }; }

    const Mr = M / N;
    const Hb = Mr * p.SVI / 1000 / A;
    const clear = p.H - Hb;
    const tsReq = Math.max(clear, 0) / p.vSettle;
    if (Hb > 0.7 * p.H) warn('crit', `Lớp bùn sau lắng cao ${Hb.toFixed(2)} m (> 70% chiều sâu). Giảm MLSS, giảm SVI thiết kế hoặc tăng thể tích.`, `Settled sludge bed ${Hb.toFixed(2)} m (> 70% of depth). Reduce MLSS, the design SVI, or increase volume.`);
    else if (clear < 1.0) warn('warn', `Lớp nước trong phía trên lớp bùn chỉ ${clear.toFixed(2)} m.`, `Clear water above the sludge bed is only ${clear.toFixed(2)} m.`);
    // Ống xả bùn dư đặt trên mặt lớp bùn sau lắng; áp lực chọn lọc = vận tốc lắng tối thiểu để hạt ở lại bể
    const zDS = Math.min(Hb + 0.3, p.H - 0.5);
    const vSel = (p.H - zDS) / Math.max(p.ts, 1e-6);
    if (tsReq > p.ts + 1e-9) warn('warn', `Thời gian lắng yêu cầu ${(tsReq * 60).toFixed(0)} phút > thời gian lắng đã chọn ${(p.ts * 60).toFixed(0)} phút.`, `Required settling time ${(tsReq * 60).toFixed(0)} min > selected settling time ${(p.ts * 60).toFixed(0)} min.`);
    if (p.X > 15) warn('warn', 'MLSS > 15 kg/m³ vượt dải vận hành NEREDA (8–15 kg/m³).', 'MLSS > 15 kg/m³ is above the NEREDA operating range (8–15 kg/m³).');
    if (p.X < 8) warn('info', 'MLSS < 8 kg/m³: thấp hơn dải vận hành NEREDA (8–15 kg/m³), chưa tận dụng hết ưu thế bùn hạt.', 'MLSS < 8 kg/m³: below the NEREDA operating range (8–15 kg/m³); the granular sludge advantage is not fully used.');
    if (p.SVI > 60) warn('warn', 'SVI > 60 mL/g không đặc trưng cho bùn hạt ổn định (thường SVI₅ ≈ SVI₃₀ = 30–50 mL/g).', 'SVI > 60 mL/g is not typical of stable granular sludge (usually SVI₅ ≈ SVI₃₀ = 30–50 mL/g).');
    if (Xact < 0.85 * p.X) warn('info', `Thủy lực khống chế thể tích: MLSS thực tế ${Xact.toFixed(1)} kg/m³, hoặc giữ MLSS ${p.X} kg/m³ để SRT đạt ${SRTatX.toFixed(0)} ngày.`, `Hydraulics govern the volume: actual MLSS ${Xact.toFixed(1)} kg/m³, or keep MLSS ${p.X} kg/m³ for an SRT of ${SRTatX.toFixed(0)} d.`);

    const bufGap = p.buffer ? Math.max(tc / N - tF, 0) : 0;
    const Vbuf = p.buffer ? QpkH * bufGap * 1.2 : 0;

    // ---- Lịch chu kỳ
    const rowsD = schedule(N, tc, tF, Math.max(tA, 0), p.ts, p.tidle, tW);
    const rowsR = schedule(N, p.tcRwf, tFr, Math.max(tAr, 0), p.ts, p.tidle, tWr);
    const kAer = Math.max(1, maxSimultaneous(rowsD, tc, 'A'));
    const kAerR = Math.max(1, maxSimultaneous(rowsR, p.tcRwf, 'A'));
    const kFeed = maxSimultaneous(rowsD, tc, 'F');

    // ---- Nhu cầu oxy (Tmax)
    const o2C = (bCOD - bioW.S - 1.42 * bioW.Pbio) * Q / 1000;
    const o2N = 4.57 * bioW.NOx * Q / 1000;
    const o2D = -2.86 * dnW.dnBio * Q / 1000;
    const R0 = Math.max(o2C + o2N + o2D, 0);
    const nc = 24 / tc;
    const aorAvgR = R0 / (N * nc * tAeff);
    const aorPkR = aorAvgR * p.PFo2;

    const Patm = 101.325 * Math.pow(1 - 2.25577e-5 * p.elev, 5.25588);
    const hd = Math.max(p.H - 0.3, 0.5);
    const SOTE = Math.min(p.sotePerM * hd / 100, 0.45);
    const Ot = 21 * (1 - SOTE) / (79 + 21 * (1 - SOTE));
    const CinfT = csT(p.Tmax) * 0.5 * ((Patm + 9.81 * hd) / 101.325 + (Patm / 101.325) * Ot / 21);
    const Cinf20 = csT(20) * 0.5 * ((101.325 + 9.81 * hd) / 101.325 + Ot / 21);
    const ratio = p.alpha * p.Ff * (p.beta * CinfT - p.DO) / Cinf20 * Math.pow(1.024, p.Tmax - 20);
    if (ratio <= 0) warn('crit', 'Hệ số hiệu chỉnh truyền khí ≤ 0: DO đặt cao hơn nồng độ bão hòa.', 'Oxygen transfer correction factor ≤ 0: DO setpoint above saturation.');
    const sotrAvgR = aorAvgR / ratio, sotrPkR = aorPkR / ratio;
    const airAvgR = sotrAvgR / (SOTE * AIR_O2), airPkR = sotrPkR / (SOTE * AIR_O2);
    const airMix = p.mixMin * VR;
    const airDesR = Math.max(airPkR, airMix);
    const mixGov = airMix > airPkR;
    const airTot = airDesR * kAer;

    const p1 = Patm, p2 = Patm + 9.81 * hd + p.dPloss;
    const blowerKW = air => (air * AIR_RHO / 3600) * 8.314 * (p.Tair + 273.15) / (29.7 * 0.283 * p.eBlower) * (Math.pow(p2 / p1, 0.283) - 1);
    const kWdesign = blowerKW(airTot);
    const kWavgR = blowerKW(Math.max(airAvgR, airMix));
    const Eday = kWavgR * tAeff * nc * N;
    const nDisc = Math.ceil(airDesR / p.discQ);
    const discDens = nDisc / A;
    if (discDens > 4.5) warn('warn', `Mật độ đĩa ${discDens.toFixed(1)} đĩa/m² cao: chọn đĩa lưu lượng lớn hơn hoặc dùng ống/tấm phân phối khí.`, `Diffuser density ${discDens.toFixed(1)} /m² is high: choose higher-capacity diffusers or tube/panel diffusers.`);
    if (discDens < 1.0) warn('info', `Mật độ đĩa ${discDens.toFixed(1)} đĩa/m² thấp: kiểm tra phân bố khí đồng đều trên đáy bể.`, `Diffuser density ${discDens.toFixed(1)} /m² is low: check uniform air distribution over the floor.`);

    // ---- Dân số tương đương
    const PEbod = Q * p.BOD / 54;                         // 54 g BOD/PE·ngày (RHDHV)
    const PEtod = Q * (p.COD + 4.57 * p.TKN) / 150;       // 150 g TOD/PE·ngày (chuẩn so sánh điện năng Hà Lan)

    // ---- Bùn dư
    const WASm3 = PxTSS / p.WASc;
    const Vdis = WASm3 / (N * nc);          // m³ bùn xả mỗi lần (mỗi bể, mỗi chu kỳ)
    const Vsb = 2 * Vdis;                    // bể đệm bùn: chứa 2 lần xả liên tiếp
    const cakeT = PxTSS / 1000 / (p.cakeDS / 100);
    const polyKg = PxTSS / 1000 * p.polyDose;

    // ---- Đường ống & thiết bị sơ bộ (bản vẽ)
    const DNS = [80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1400, 1600, 1800, 2000];
    const pickDN = (qm3h, vmax) => { for (const d of DNS) { const v = qm3h / 3600 / (Math.PI * (d / 1000) ** 2 / 4); if (v <= vmax) return { DN: d, v }; } const d = 2000; return { DN: d, v: qm3h / 3600 / (Math.PI * 4 / 4) }; };
    const qFeedMax = Math.max(QfeedD, QfeedR);
    const tDis = 0.25;                                      // h: thời gian xả bùn mỗi lần
    const qDis = Vdis / tDis;
    const nBlowDuty = airTot <= 12000 ? 2 : Math.ceil(airTot / 12000);
    const pipes = {
      feed: Object.assign({ Q: qFeedMax, vmax: 1.5 }, pickDN(qFeedMax, 1.5)),
      eff: Object.assign({ Q: qFeedMax, vmax: 1.0 }, pickDN(qFeedMax, 1.0)),
      airR: Object.assign({ Q: airDesR, vmax: 15 }, pickDN(airDesR, 15)),
      airMain: Object.assign({ Q: airTot, vmax: 15 }, pickDN(airTot, 15)),
      sludge: Object.assign({ Q: qDis, vmax: 1.5 }, pickDN(qDis, 1.5))
    };
    const weirLoad = 20;                                    // m³/(m·h) tải trọng máng thu nước sơ bộ
    const weirLen = qFeedMax / weirLoad;
    const wallT = p.H > 8 ? 0.5 : 0.4;
    const equip = {
      blowerDuty: nBlowDuty, blowerStby: 1, blowerQ: airTot / nBlowDuty, blowerKW: kWdesign / nBlowDuty, blowerP: p2 - Patm,
      feedPumps: p.buffer ? { duty: 2, stby: 1, Q: qFeedMax / 2 } : null,
      wasPumps: { duty: 1, stby: 1, Q: qDis },
      dewater: { Q: WASm3 / 20, hours: 20 },
      weirLoad, weirLen, wallT, tDis
    };

    // ---- Kế hoạch khởi động (xem tab Hướng dẫn vận hành)
    const nStage = N;
    const stages = [];
    for (let k = 1; k <= nStage; k++) {
      const f = k / nStage;                                  // tỷ lệ lưu lượng tối đa ở giai đoạn k
      const qk = Q * f;
      const vUpK = p.buffer ? (qk / 24) * tc / (k * tF) / A : (qk / 24) / A;
      stages.push({ k, f, Q: qk, vUp: vUpK, Mtarget: M / N * k });
    }
    const seedAS = 2.0 * VR;                                 // kg DS: bùn hoạt tính 2 g/L cho 1 bể (Derlon 2016)
    const startPlan = { stages, seedAS, seedASm3: seedAS / 8, Mr: M / N, tAccAll: M / PxTSS, vUpLowStrength: 1.0, vUpWashout: 5.9 };

    // ---- Chất lượng đầu ra
    function effluent(bio, dn, withChem) {
      const sBOD = bio.S / p.bcodBod;
      const BOD = sBOD + 0.8 * dn.VSSe * 1.42 * 0.68;
      const COD = p.nbsCOD + bio.S + 1.42 * dn.VSSe;
      const NO3 = withChem ? dn.NO3fin : dn.NO3bio;
      const TN = bio.Ne + p.ONsol + dn.ONpart + NO3;
      const TPv = withChem ? TPfin : TPbio;
      const alk = withChem ? Math.max(AlkFin, p.AlkMin) : AlkBio;
      return { BOD, COD, TSS: p.TSSe, NH4: bio.Ne, NO3, TN, TP: TPv, Alk: alk };
    }
    const effBio = effluent(bioC, dnC, false);
    const effFin = effluent(bioC, dnC, true);
    const limits = { BOD: p.tBOD, COD: p.tCOD, TSS: p.tTSS, NH4: p.tNH4, NO3: p.tNO3, TN: p.tTN, TP: p.tTP };
    const pass = {};
    for (const k of Object.keys(limits)) pass[k] = !(limits[k] > 0) || effFin[k] <= limits[k];
    if (!pass.TSS) warn('crit', 'TSS đầu ra kỳ vọng vượt giới hạn: cần lọc bổ sung sau AGS.', 'Expected effluent TSS exceeds the limit: additional filtration after AGS is needed.');
    if (!pass.NH4) warn('crit', 'NH₄-N đầu ra vượt giới hạn: tăng hệ số an toàn SRT, DO hoặc thời gian sục khí.', 'Effluent NH₄-N exceeds the limit: increase the SRT safety factor, DO or aeration time.');
    if (!pass.BOD || !pass.COD) warn('crit', 'BOD/COD đầu ra vượt giới hạn: kiểm tra phần COD khó phân hủy và TSS đầu ra.', 'Effluent BOD/COD exceeds the limit: check the non-biodegradable COD fraction and effluent TSS.');
    if (carbonCOD > 0) warn('warn', `Thiếu carbon cho khử nitrat: cần bổ sung khoảng ${carbonCOD.toFixed(1)} mg COD/L (≈ ${methanolKg.toFixed(0)} kg methanol/ngày).`, `Carbon-limited denitrification: add about ${carbonCOD.toFixed(1)} mg COD/L (≈ ${methanolKg.toFixed(0)} kg methanol/d).`);
    if (Pchem > 0) warn('info', `Khử P sinh học chưa đủ: châm ${chemName} để loại thêm ${Pchem.toFixed(2)} mg P/L.`, `Biological P removal insufficient: dose ${chemName} to remove a further ${Pchem.toFixed(2)} mg P/L.`);
    if (NaOH > 0) warn('warn', `Kiềm sau xử lý thấp (${AlkFin.toFixed(0)} mg CaCO₃/L): châm NaOH ${NaOH.toFixed(0)} mg/L.`, `Low effluent alkalinity (${AlkFin.toFixed(0)} mg CaCO₃/L): dose NaOH ${NaOH.toFixed(0)} mg/L.`);

    // ---- So sánh với bùn hoạt tính truyền thống (ước tính)
    const SRTcas = Math.max(SRTaerReq / 0.65, 8);
    const bioCas = biology(p, inf, p.Tmin, SRTcas, SRTaerReq);
    const Mcas = (bioCas.PTSS + chemSludge) * Q / 1000 * SRTcas;
    const Vcas = Mcas / 3.5;
    const Aclar = Math.max(Q / 20, Qrwf / 40);
    const footCas = Vcas / 5 + Aclar;
    const footAgs = N * A + Vbuf / 5;

    return {
      ok: true, p, warnings: W,
      flow: { Q, Qh, QpkH, Qrwf, QrwfH },
      inf,
      kin: { muN, bN, KN, fDO, SRTth, SRTaerReq, SRTbyN, SRT, SRTa, SRTgov, SRTgovKey, fAer },
      cycle: { tc, tF, tW, tA, tS: p.ts, tI: p.tidle, tcR: p.tcRwf, tFr, tWr, tAr, nc, rowsD, rowsR, kAer, kAerR, kFeed },
      bioC, bioW, dnC, dnW,
      phos: { Psyn, Pebpr, Ppart, sPbio, TPbio, TPlim, Pchem, metal, chemDose, chemSludge, chemName, chemSol, TPfin },
      alk: { AlkBio, AlkFin, chemAlk, NaOH, NaOHkg, NaOHsol },
      carbon: { carbonCOD, methanolKg },
      reactor: { M, Vbio, VhydD, VhydR, Vreq, gov, govEn, govKey, A, VR, Vtot, Xact, SRTatX, VfDwf, VfRwf, VERd, VERr, QfeedD, QfeedR, vUpD, vUpR, dims, Hb, clear, tsReq, zDS, vSel, Vbuf, bufGap, HRT: Vtot / Q * 24, OLR: Q * p.COD / 1000 / Vtot, NLR: Q * p.TKN / 1000 / Vtot },
      sludge: { PxTSS, PxVSS, WASm3, Vdis, Vsb, cakeT, polyKg, kaumera: [0.20 * PxTSS, 0.35 * PxTSS], kaumeraPot: [5 * PEbod / 1000, 10 * PEbod / 1000], yieldObs: PxTSS / (Q * p.COD / 1000) },
      pe: { PEbod, PEtod, kWhPE: Eday * 365 / PEtod },
      air: { o2C, o2N, o2D, R0, aorAvgR, aorPkR, SOTE, ratio, sotrAvgR, sotrPkR, airAvgR, airPkR, airMix, airDesR, mixGov, airTot, kWdesign, kWavgR, Eday, kWhm3: Eday / Q, sae: R0 / Eday, nDisc, discDens, hd, p2 },
      eff: { bio: effBio, fin: effFin, limits, pass, allPass: Object.values(pass).every(Boolean) },
      cas: { SRTcas, Vcas, Aclar, footCas, footAgs },
      pipes, equip, startPlan,
      startup: p.seed === 'granule' ? 'Khoảng 3–4 tháng đạt lưu lượng thiết kế với hạt mồi (Garmerwolde ~3 tháng từ hạt mồi Epe; Epe 4 tháng nhận 100% nước)' : (p.COD < 250 ? 'Có thể 10–13 tháng để đạt ≥ 85% bùn hạt (nước thải loãng, khởi động từ bùn hoạt tính)' : 'Vài tháng đến khoảng 10 tháng tùy tải lượng và tỷ lệ nước thải công nghiệp (khởi động từ bùn hoạt tính)'),
      startupEn: p.seed === 'granule' ? 'About 3–4 months to design flow with granular seed (Garmerwolde ~3 months from Epe seed; Epe took 4 months to receive 100% of the flow)' : (p.COD < 250 ? 'Possibly 10–13 months to reach ≥ 85% granules (low-strength sewage, started with activated sludge)' : 'A few months to about 10 months depending on load and industrial share (started with activated sludge)')
    };
  }

  // Số liệu trạm thực tế dùng để kiểm chứng (Semaha et al. 2023, Bảng 1; AECOM/BACWA 2017)
  const BENCHMARKS = [
    { nameEn: 'Garmerwolde (Netherlands)', srcEn: 'RHDHV 2014 (2 × 9,500 m³, peak 4,200 m³/h); Pronk et al. 2015; Guo et al. 2020 – cited in Semaha et al. 2023', name: 'Garmerwolde (Hà Lan)', src: 'RHDHV 2014 (2 × 9.500 m³, đỉnh 4.200 m³/h); Pronk et al. 2015; Guo et al. 2020 – trích trong Semaha et al. 2023',
      input: { Q: 30000, Frwf: 3.36, COD: 528, BOD: 232, TSS: 247, TKN: 53, NH4: 39, TP: 7.2, Tmin: 8, Tmax: 20, Nr: 2, H: 7.5,
        tc: 6.25, buffer: true, tF: 1, ts: 1, tidle: 0.25, tTN: 10, tTP: 1, tCOD: 125, tBOD: 25, tTSS: 35, tNH4: 5 },
      ref: { V: [19000, 19000], SRT: [20, 38], COD: [57, 64], BOD: [9.3, 9.7], TN: [6.9, 7.4], TP: [0.7, 0.9] } },
    { nameEn: 'Epe (Netherlands)', srcEn: 'Verification campaign Mar–May 2012 (peak 1,500 m³/h, 16.3 kWh/PE·yr whole plant) – RHDHV 2014; AECOM/BACWA 2017', name: 'Epe (Hà Lan)', src: 'Đợt kiểm định 3–5/2012 (đỉnh 1.500 m³/h, điện 16,3 kWh/PE·năm toàn trạm) – RHDHV 2014; AECOM/BACWA 2017',
      input: { Q: 8000, Frwf: 4.5, COD: 879, BOD: 333, TSS: 341, TKN: 77, NH4: 54, TP: 9.3, Tmin: 10, Tmax: 20, Nr: 3, tc: 6, TSSe: 5,
        tTN: 10, tTP: 1, tCOD: 125, tBOD: 25, tTSS: 35, tNH4: 5 },
      ref: { COD: [27, 27], BOD: [0, 2], NH4: [0.1, 0.1], TN: [0, 4], TP: [0.3, 0.3], kWhPE: [16.3, 16.3] } },
    { nameEn: 'Wemmershoek (South Africa)', srcEn: 'Robertson et al., Civil Engineering 6/2015 (600 m³ buffer + 2 × 1,800 m³; peak 14.4 ML/d; bio-P not yet optimised). Assumed BOD₅ = 0.5 COD, 14–24 °C', name: 'Wemmershoek (Nam Phi)', src: 'Robertson và cs., Civil Engineering 6/2015 (1 bể điều hòa 600 m³ + 2 × 1.800 m³; đỉnh 14,4 ML/ngày; khử P sinh học chưa tối ưu). Giả định BOD₅ = 0,5 COD, nhiệt độ 14–24 °C',
      input: { Q: 5000, Frwf: 2.88, COD: 870, BOD: 435, TSS: 381, TKN: 60, NH4: 45, TP: 12, Tmin: 14, Tmax: 24, Nr: 2, buffer: true, tF: 1,
        tTN: 0, tTP: 0, tNH4: 6, tNO3: 15, tCOD: 75, tBOD: 0, tTSS: 0 },
      ref: { V: [3600, 3600], COD: [48, 48], NH4: [0.3, 0.3], NO3: [0.1, 0.1], TP: [2.6, 2.6] } },
    { nameEn: 'Gansbaai (South Africa)', srcEn: 'Khan et al. 2012, 2011 data (strong septic sewage). Assumed BOD₅ = 0.5 COD, 15–24 °C, 2 reactors + buffer', name: 'Gansbaai (Nam Phi)', src: 'Khan và cs. 2012, số liệu 2011 (nước thải đậm đặc, tự hoại). Giả định BOD₅ = 0,5 COD, nhiệt độ 15–24 °C, 2 bể + điều hòa',
      input: { Q: 4000, COD: 1265, BOD: 630, TSS: 450, TKN: 115, NH4: 75, TP: 19, Tmin: 15, Tmax: 24, Nr: 2, buffer: true, tF: 1, TSSe: 5,
        tTN: 15, tTP: 10, tNH4: 6, tCOD: 75, tBOD: 0, tTSS: 0, Alk: 500 },
      ref: { COD: [40, 40], NH4: [0, 1], TN: [0, 10], TP: [3.2, 3.2] } }
  ];

  // Trạm NEREDA tham chiếu: lưu lượng TB và đỉnh (RHDHV 2014; Kerstens, IChemE 2017; AECOM 2017)
  const REFERENCES = [
    ['Epe (Hà Lan)', 'Đô thị + công nghiệp', 8000, 1500, 59000, 2011, 'Lọc cát sau bể; tách dầu mỡ lò mổ', 'Epe (Netherlands)', 'Municipal + industrial', 'Sand filtration downstream; slaughterhouse FOG removal'],
    ['Garmerwolde (Hà Lan)', 'Đô thị', 30000, 4200, 140000, 2013, '2 × 9.500 m³; không xử lý bậc 3', 'Garmerwolde (Netherlands)', 'Municipal', '2 × 9,500 m³; no tertiary treatment'],
    ['Frielas, Lisbon (Bồ Đào Nha)', 'Đô thị + công nghiệp', 12000, null, 44444, 2012, 'Cải tạo hybrid', 'Frielas, Lisbon (Portugal)', 'Municipal + industrial', 'Hybrid retrofit'],
    ['Wemmershoek (Nam Phi)', 'Đô thị', 5000, 600, 40000, 2014, '1 điều hòa 600 m³ + 2 × 1.800 m³; đỉnh 14,4 ML/ngày; tái sử dụng tưới', 'Wemmershoek (South Africa)', 'Municipal', '600 m³ buffer + 2 × 1,800 m³; peak 14.4 ML/d; effluent reused for irrigation'],
    ['Clonakilty (Ireland)', 'Đô thị', 5000, 626, 23278, 2015, 'Tách rác, cát, dầu mỡ kết hợp', 'Clonakilty (Ireland)', 'Municipal', 'Combined screening, grit and FOG removal'],
    ['Westfort (Hà Lan)', 'Chế biến thịt', 1400, null, 43000, 2015, 'Bể sâu 11,3 m; lọc trống + tuyển nổi', 'Westfort (Netherlands)', 'Meat processing', '11.3 m deep; drum filter + flotation'],
    ['Deodoro, Rio (Brazil)', 'Đô thị', 86400, 6120, 480000, 2016, 'Khí hậu nhiệt đới', 'Deodoro, Rio (Brazil)', 'Municipal', 'Tropical climate'],
    ['Kingaroy (Úc)', 'Đô thị', null, 450, 11000, 2016, 'Tái sử dụng tưới sân thể thao', 'Kingaroy (Australia)', 'Municipal', 'Reuse for sports field irrigation'],
    ['Gansbaai (Nam Phi)', 'Đô thị, tự hoại đậm đặc', 4000, null, 63000, 2009, 'Trạm trình diễn đô thị đầu tiên; COD 1.265 → 40 mg/L', 'Gansbaai (South Africa)', 'Municipal, strong septic', 'First municipal demonstration plant; COD 1,265 → 40 mg/L'],
    ['Vroomshoop (Hà Lan)', 'Đô thị', null, 1265, 25000, 2013, 'Song song bùn hoạt tính; điện thấp hơn ~35%; TN 7,2, TP 0,9', 'Vroomshoop (Netherlands)', 'Municipal', 'Parallel to activated sludge; ~35% less energy; TN 7.2, TP 0.9'],
    ['Hartebeestfontein (Nam Phi)', 'Đô thị', 5000, null, 52185, 2016, 'Cải tạo bể cũ: 1 điều hòa 1.700 m³ + 1 bể 2.900 m³', 'Hartebeestfontein (South Africa)', 'Municipal', 'Converted tanks: 1,700 m³ buffer + 1 reactor 2,900 m³'],
    ['Highworth (Anh)', 'Đô thị', 1444, 197, 10000, 2017, '', 'Highworth (UK)', 'Municipal', ''],
    ['Kloten/Opfikon (Thụy Sĩ)', 'Đô thị', 26000, 2850, 125000, 2019, '', 'Kloten/Opfikon (Switzerland)', 'Municipal', ''],
    ['Ringsend, Dublin (Ireland)', 'Đô thị', 435000, 50000, 2400000, 2021, 'Cải tạo SBR; nước nhiễm mặn; MLSS 8 g/L; TN < 10 (Q TB 115 MGD theo AECOM 2017)', 'Ringsend, Dublin (Ireland)', 'Municipal', 'SBR retrofit; saline sewage; MLSS 8 g/L; TN < 10 (avg 115 MGD per AECOM 2017)'],
    ['Jeddah Airport-2 (Ả Rập Xê Út)', 'Sinh hoạt', 300000, 18750, null, 2023, 'Giai đoạn 1; đỉnh ngày 1,5Q; lắng sơ cấp + bể đệm + lọc đĩa + clo; 15–35 °C', 'Jeddah Airport-2 (Saudi Arabia)', 'Domestic', 'Phase 1; peak day 1.5Q; primary clarifiers + buffer + disc filters + chlorine; 15–35 °C']
  ];

  return { DEFAULTS, PRESETS, BENCHMARKS, REFERENCES, compute, schedule, phaseAt, csT };
});
