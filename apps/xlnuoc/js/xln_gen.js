'use strict';
/* ==========================================================================
   XLNuoc – các module công nghệ cho dây chuyền tổng quát (khác dây chuyền của file mẫu Leopold).
   Mỗi module: (1) tự chọn kích thước bằng JS theo chỉ tiêu MWH / TCVN 33:2006 / CLAUDE.md,
   (2) sinh các dòng bảng tính (ô nhập ở 01_DauVao hoặc "CHỌN" trong sheet, công thức sống, dòng kiểm tra).
   Bộ tính XLCALC tính lại toàn bộ bảng tính → giao diện và Excel cho cùng một kết quả.
   Nguồn chỉ tiêu: MWH Water Treatment 3rd ed. (Bảng 9-11, 9-15, 10-2, 10-4, 10-6, 10-9, 11-8, 11-11, 12-10, 17-4, 21-2, 21-13,
   21-16, 21-17), TCXDVN 33:2006, QCVN 01-1:2018/BYT, Leopold P9.007/P9.014/P9.016 (Texler, CT2, Type XA, IMS 200).
   ========================================================================== */
const XLNG = (() => {
  const SEQ = 'ABCDEFGHIKLMNOPRSTUVWXYZ';
  const IEC = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 185, 200, 250, 280, 315, 355, 400, 450, 500, 560, 630, 710, 800];
  const iec = p => IEC.find(x => x >= p) || Math.ceil(p / 50) * 50;
  const up = (x, s) => Math.ceil(x / s - 1e-9) * s, rd = (x, s) => Math.round(x / s) * s;
  const r10 = x => Math.round(x * 10) / 10, c10 = x => up(x, 0.1);
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const muT = T => 2.414e-5 * Math.pow(10, 247.8 / (T + 133.15));
  const rhoT = T => 1000 * (1 - (T + 288.9414) / (508929.2 * (T + 68.12963)) * Math.pow(T - 3.9863, 2));
  const even = n => n >= 4 && n % 2 ? n + 1 : n;

  // dòng bảng tính
  const R = (k, l, s, u, x, n, o) => { const z = Object.assign({ k, l, s, u, n }, o || {}); if (typeof x === 'number') z.v = x; else if (typeof x === 'string' && x[0] === '=') z.f = x; else if (x != null) z.t = x; return z; };
  const CK = (k, l, f, n) => ({ k, l, chk: f, n });
  const IFR = (x, lo, hi, txt) => `=IF(AND({${x}}>=${lo},{${x}}<=${hi}),"ĐẠT  (${txt})","XEM LẠI  (yêu cầu ${txt})")`;
  const IFLE = (x, hi, txt, bad) => `=IF({${x}}<=${hi},"ĐẠT  (${txt})","${bad || 'XEM LẠI  (yêu cầu ' + txt + ')'}")`;
  const IFGE = (x, lo, txt, bad) => `=IF({${x}}>=${lo},"ĐẠT  (${txt})","${bad || 'XEM LẠI  (yêu cầu ' + txt + ')'}")`;
  const vn = (x, d) => (+x).toLocaleString('vi-VN', { maximumFractionDigits: d === undefined ? 2 : d });

  /* ===================== danh mục công nghệ ===================== */
  const TECH = {
    pre: { none: 'Không', presed: 'Bể lắng sơ bộ (nước lũ độ đục cao)', aer: 'Làm thoáng + bể tiếp xúc (khử Fe, CO₂ – nước ngầm)' },
    mix: { mech: 'Bể trộn nhanh cơ khí', stat: 'Trộn tĩnh trên ống (static mixer)' },
    floc: { mech: 'Phản ứng cơ khí 3 buồng (G giảm dần)', hyd: 'Phản ứng thủy lực vách ngăn (zích-zắc)' },
    clar: { texler: 'Lắng lamen Leopold Texler + thu bùn CT2', lamella: 'Lắng lamen ống nghiêng 60° (tube settler)', horiz: 'Lắng ngang thu nước bề mặt + gạt bùn', daf: 'Tuyển nổi khí hòa tan (DAF)', none: 'Không lắng – lọc trực tiếp / lọc tiếp xúc' },
    filt: { xa: 'Lọc nhanh Leopold Type XA + IMS 200 – cát thô 1 lớp', rgf: 'Lọc nhanh trọng lực cát 1 lớp – sàn chụp lọc (TCVN)', dual: 'Lọc nhanh 2 lớp than antraxit + cát', press: 'Lọc áp lực (bình thép)', uf: 'Màng siêu lọc UF (áp lực)', slow: 'Lọc chậm cát' },
    adv: { gac: 'Lọc than hoạt tính GAC (mùi vị, TOC, thuốc BVTV)', ro: 'Thẩm thấu ngược RO (khử mặn, TDS cao) – xử lý một phần + hòa trộn' },
    dis: { naocl: 'Khử trùng NaOCl', uv: 'UV + NaOCl duy trì clo dư' },
    sl: { centri: 'Cô đặc trọng lực + ly tâm', belt: 'Cô đặc trọng lực + ép băng tải', bed: 'Cô đặc trọng lực + sân phơi bùn' }
  };
  const isLeopold = ch => ch.pre === 'none' && ch.mix === 'mech' && ch.floc === 'mech' && ch.clar === 'texler' && ch.filt === 'xa' && !(ch.adv || []).length && ch.dis === 'naocl' && ch.sl === 'centri';

  /* ===================== định cỡ Texler + CT2 (dùng chung cho file mẫu) =====================
     Tìm số bể N, số dãy n_tr, số header n_h, chiều dài L sao cho mọi chỉ tiêu của sheet 06 đạt; ưu tiên tổng diện tích nhỏ,
     ít bể, bề rộng ≤ 17 m (rộng hơn cần Leopold xác nhận + CFD – CLAUDE §13), header ≤ 9 m. */
  function sizeTexler(o) {
    const { Qh, Vsl, g = 9.81, nu = 1.004e-6 } = o;
    const F = 1.956, K = 0.388, p = 0.06837, Lp = 2.44, Wp = 1.45, cos = Math.cos(55 * Math.PI / 180), s = 0.0508, eta = 0.8, b = 0.381;
    let best = null;
    for (let N = 2; N <= 24; N++) for (let nh = 1; nh <= 3; nh++) for (let ntr = 3; ntr <= 15; ntr++) for (let L = 12; L <= 38; L += 2) {
      const B = c10(ntr * F + 2 * K);
      if (B / nh - 0.2 > 9) continue;
      const C = L / 2, Q7 = Qh / N;
      const SLR = Q7 / (B * L); if (SLR > 4.2) continue;
      const nP = Math.floor(C / p + 1e-9) * ntr, Ae = eta * nP * Lp * Wp * cos;
      const u = Q7 / Ae; if (u > 0.72) continue;
      const v = Q7 / (nP * s * Wp); if (v > 18) continue;
      const Re = v / 3600 * 2 * s / nu; if (Re >= 500) continue;
      if ((v / 3600) ** 2 / (g * 2 * s) < 1e-5) continue;
      if (N > 1 && (Qh / ((N - 1) * B * L) > 5 || Qh / ((N - 1) * Ae) > 0.9)) continue;
      const qt = Q7 / (ntr + 1), yc = Math.cbrt((qt / 3600) ** 2 / (g * b * b)), y = 1.73 * yc;
      const h = Math.max(0.3, up(y + 0.08, 0.025)); if (h > 0.365) continue;
      const wl = Q7 / (2 * (ntr + 1) * C); if (wl < 3.75 || wl > 15) continue;
      if (L - 1.626 > 37) continue;
      const qhd = 50 * (B / nh - 0.2) * 60 / 1000, run = Vsl / (N * nh) / qhd, run1 = N > 1 ? Vsl / ((N - 1) * nh * qhd) : 99;
      if (run > 20 || run1 > 24) continue;
      const cost = N * B * L + N * 60 + nh * N * 8 + (B > 17 ? 0.25 * N * B * L : 0) + (N % 2 && N > 3 ? 40 : 0);
      if (!best || cost < best.cost) best = { N, ntr, nh, L, B, C, D: C + 0.6, h, cost, SLR, u };
    }
    return best;
  }
  /* định cỡ bể lọc Leopold XA: 2 ngăn hai bên máng H-gullet, lateral A ≤ 9,6 m, E lateral/ngăn (bước 0,308 m, đầu/cuối 0,175 m) */
  function sizeXA(o) {
    const { QhF, Qtk } = o;
    const Nmin = Math.max(4, Math.ceil(1.2 * Math.sqrt(Qtk / 3785.41) - 1e-9));   // N ≥ 4: v (1 rửa + 1 sửa) ≤ 12,5 mà v thường ≥ 5
    let best = null;
    for (let N = Nmin; N <= Nmin + 16; N++) for (const A of [9.6, 9.0, 8.4, 7.8, 7.2, 6.6, 6.0, 5.4, 4.8, 4.2, 3.6, 3.0]) {
      const Areq = Math.max(QhF / 8.5 / N, QhF / 12.4 / (N - 2), QhF / 12.4 / (N - 1));
      const E = Math.max(3, Math.ceil((Areq / (2 * A) - 0.35) / 0.308 + 1 - 1e-9));
      const len = 0.35 + (E - 1) * 0.308, A1 = 2 * A * len, v = QhF / (A1 * N);
      if (v < 5 || v > 9) continue;
      if (QhF / (A1 * (N - 1)) > 12.5 || (N > 2 && QhF / (A1 * (N - 2)) > 12.5)) continue;
      const asp = Math.max(A / len, len / A);
      const cost = N * 120 + N * A1 + (asp > 3 ? 30 * N : 0) + (N % 2 && N > 3 ? 50 : 0) + (9.6 - A) * 4 * N;
      if (!best || cost < best.cost) best = { N, A, E, len, A1, v, cost };
    }
    return best;
  }

  /* ===================== dựng bảng tính ===================== */
  function make(P) {
    const ch = P.chain, q = P.q, ov = P.ov || {};
    const auto = {};
    const V = (k, d) => { auto[k] = d; return ov[k] !== undefined && ov[k] !== '' && isFinite(+ov[k]) ? +ov[k] : d; };
    const dv = [];           // các mục của 01_DauVao: {sec, rows}
    const SH = [];           // các sheet tính toán theo thứ tự dây chuyền
    const kwh = [], hl = [], civ = [], eqp = [], keyRes = [], notes = [], dims = [];
    const sec = (t, rows) => { dv.push({ t, rows }); };
    const T = q.T, mu = muT(T), rho = rhoT(T), nu = mu / rho;
    const Q = P.Q, a0 = V('a', P._aAuto || P.a || 1.05), tlv = V('tlv', 24), rth = V('rth', ch.filt === 'slow' ? 0 : 0.05), Kh = V('Kh', P.Kh || 1.5);
    const surf = P.src !== 'ngam';
    const coag = ch.pre !== 'aer' || ch.clar !== 'none' || q.NTU > 5;
    // ---------- liều hóa chất (GIẢ ĐỊNH – phải Jar-test) ----------
    const pacDef = coag ? Math.max(10, rd(5.6 * Math.pow(Math.max(q.NTU, 1), 0.33) + 0.1 * Math.max(0, q.color - 15) + (q.TOC > 3 ? 4 * (q.TOC - 3) : 0), 5)) : 0;
    const PAC = V('PAC', P.chem && P.chem.PAC != null ? P.chem.PAC : pacDef);
    const lime = V('lime', rd(Math.max(5, 0.56 * Math.max(0, 60 - (q.alk - 0.45 * PAC)) + 13), 1) * (coag ? 1 : 0.6));
    const poly = V('poly', coag && ch.clar !== 'none' ? 0.2 : coag ? 0.05 : 0);
    const Cl1 = V('Cl1', ch.pre === 'aer' || ch.adv && ch.adv.includes('ro') ? 0 : 1 + (q.NH4 > 0.2 ? Math.min(8, 7.6 * q.NH4) : 0));
    const Cl2 = V('Cl2', 2);
    const kmn = V('KMnO4', q.Mn > 0.1 ? rd(1.92 * q.Mn + 0.5, 0.1) : 0);
    const NTUavg = V('NTUavg', q.NTUavg || Math.max(1, q.NTU * 0.3));
    const Ksl = V('rDS', +(Math.max(0.2, Math.pow(NTUavg / Math.max(q.NTU, 1), 0.7))).toFixed(2));
    // ---------- lưu lượng (JS – định cỡ) ----------
    const Qtk = Q * a0, Qh = Qtk / tlv, Qhtr = Qtk * (1 + rth) / tlv, Qs = Qhtr / 3600;

    /* ---------- 01_DauVao: A–D ---------- */
    sec('LƯU LƯỢNG THIẾT KẾ', [
      R('Q', 'Công suất hữu ích (nước phát vào mạng)', 'Q_ích', 'm³/ngđ', V('Q', Q), 'Đề bài', { nf: '#,##0' }),
      R('a', 'Hệ số dùng nước cho bản thân trạm', 'a', '–', a0, 'TCXDVN 33:2006 – rửa lọc + xả bùn' + (ch.adv && ch.adv.includes('ro') ? ' + nước muối RO' : '') + '; kiểm tra lại ở sheet 02', { nf: '0.00' }),
      R('tlv', 'Số giờ làm việc trong ngày', 't_lv', 'h', tlv, 'Trạm vận hành liên tục'),
      R('rth', 'Tỷ lệ nước thu hồi tuần hoàn về bể trộn', 'r_th', '–', rth, 'An toàn: công trình xử lý tính cho Q_tk + Q_th', { nf: '0.00' }),
      R('Kh', 'Hệ số dùng nước giờ lớn nhất (bơm cấp II)', 'K_h', '–', Kh, 'TCXDVN 33:2006', { nf: '0.00' })]);
    sec('CHẤT LƯỢNG NƯỚC NGUỒN – ' + (P.srcName || (surf ? 'NƯỚC MẶT' : 'NƯỚC NGẦM')).toUpperCase() + ' (GIẢ ĐỊNH – THAY BẰNG SỐ LIỆU THỰC TẾ)', [
      R('NTU', 'Độ đục thiết kế', 'NTU', 'NTU', V('NTU', q.NTU), 'Lớn nhất mùa lũ'),
      R('NTUavg', 'Độ đục trung bình năm', 'NTU_tb', 'NTU', NTUavg, 'Dùng tính hóa chất, bùn trung bình'),
      R('SS', 'Hàm lượng cặn lơ lửng', 'SS', 'mg/L', V('SS', q.SS), ''),
      R('color', 'Độ màu', '–', 'Pt-Co', V('color', q.color), ''),
      R('pH', 'pH nước thô', 'pH', '–', V('pH', q.pH), '', { nf: '0.0' }),
      R('T', 'Nhiệt độ nước thiết kế', 'T', '°C', V('T', T), 'Mùa đông – tra μ, ρ'),
      R('alk', 'Độ kiềm', '–', 'mg/L CaCO₃', V('alk', q.alk), 'Kiểm tra nhu cầu vôi'),
      R('Fe', 'Sắt tổng', 'Fe', 'mg/L', V('Fe', q.Fe), 'QCVN 01-1:2018: ≤ 0,3 mg/L', { nf: '0.00' }),
      R('Mn', 'Mangan tổng', 'Mn', 'mg/L', V('Mn', q.Mn), 'QCVN 01-1:2018: ≤ 0,1 mg/L', { nf: '0.00' }),
      R('NH4', 'Amoni (NH₄⁺ tính theo N)', 'NH₄-N', 'mg/L', V('NH4', q.NH4), 'QCVN 01-1:2018: ≤ 0,3 mg/L', { nf: '0.00' }),
      R('TDS', 'Tổng chất rắn hòa tan', 'TDS', 'mg/L', V('TDS', q.TDS), 'QCVN 01-1:2018: ≤ 1.000 mg/L'),
      R('hard', 'Độ cứng tổng', '–', 'mg/L CaCO₃', V('hard', q.hard), 'QCVN 01-1:2018: ≤ 300 mg/L'),
      R('TOC', 'Tổng cacbon hữu cơ', 'TOC', 'mg/L', V('TOC', q.TOC), 'Tiền chất THM; > 4 mg/L cân nhắc GAC / keo tụ tăng cường', { nf: '0.0' }),
      R('algae', 'Mật độ tảo', '–', 'tế bào/mL', V('algae', q.algae), '> 5.000 tb/mL: ưu tiên DAF; tiền oxy hóa nhẹ', { nf: '#,##0' })]);
    sec('TÍNH CHẤT NƯỚC & HẰNG SỐ', [
      R('rho', 'Khối lượng riêng của nước', 'ρ', 'kg/m³', '=1000*(1-({T}+288.9414)/(508929.2*({T}+68.12963))*({T}-3.9863)^2)', 'Theo nhiệt độ T (công thức Tanaka)', { nf: '0.0' }),
      R('mu', 'Độ nhớt động lực', 'μ', 'Pa·s', '=0.00002414*10^(247.8/({T}+133.15))', 'Theo nhiệt độ T (Vogel; MWH Bảng C-1)', { nf: '0.000000' }),
      R('g', 'Gia tốc trọng trường', 'g', 'm/s²', 9.81, '')]);
    sec('HÓA CHẤT', [
      R('PAC', 'Liều PAC lớn nhất (sản phẩm, 31% Al₂O₃)', '–', 'mg/L', PAC, 'GIẢ ĐỊNH theo độ đục, màu, TOC – Jar-test (MWH §9-4)'),
      R('cPAC', 'Nồng độ dung dịch PAC pha', '–', '%', V('cPAC', 10), ''),
      R('poly', 'Liều polymer trợ keo tụ', '–', 'mg/L', poly, 'GIẢ ĐỊNH – Jar-test', { nf: '0.00' }),
      R('cPoly', 'Nồng độ dung dịch polymer', '–', '%', V('cPoly', 0.1), '', { nf: '0.0' }),
      R('lime', 'Liều vôi CaO (ổn định pH)', '–', 'mg/L', lime, 'GIẢ ĐỊNH theo độ kiềm nước thô'),
      R('cLime', 'Nồng độ sữa vôi', '–', '%', V('cLime', 5), ''),
      R('KMnO4', 'Liều KMnO₄ (oxy hóa Mn²⁺)', '–', 'mg/L', kmn, kmn ? 'Lý thuyết 1,92 mg/mg Mn + dư 0,5 mg/L' : 'Không dùng', { nf: '0.0' }),
      R('Cl1', 'Liều clo tiền khử trùng', '–', 'mg/L', Cl1, q.NH4 > 0.2 ? 'Gồm clo điểm đột biến 7,6 mg/mg NH₄-N' : 'GIẢ ĐỊNH', { nf: '0.0' }),
      R('Cl2', 'Liều clo khử trùng chính', '–', 'mg/L', Cl2, 'GIẢ ĐỊNH', { nf: '0.0' }),
      R('cCl', 'Hàm lượng clo hoạt tính NaOCl', '–', '%', V('cCl', 10), ''),
      R('days', 'Số ngày dự trữ hóa chất trong kho', '–', 'ngày', V('days', 30), '')]);

    /* ---------- 02_CanBang ---------- */
    const cb = { name: '02_CanBang', title: '02 – CÂN BẰNG LƯU LƯỢNG VÀ HỆ SỐ DÙNG NƯỚC BẢN THÂN', blocks: [
      { sec: 'A. LƯU LƯỢNG TÍNH TOÁN', rows: [
        R('Qu', 'Công suất hữu ích (phát vào mạng)', 'Q_ích', 'm³/ngđ', '={Q}', 'Sheet 01'),
        R('Qtk', 'Công suất thiết kế của trạm (nước thô)', 'Q_tk', 'm³/ngđ', '={Q}*{a}', 'Q_tk = a · Q_ích'),
        R('Qh', 'Lưu lượng giờ tính toán', 'Q_h', 'm³/h', '={Qtk}/{tlv}', ''),
        R('Qsec', 'Lưu lượng giây tính toán', 'Q_s', 'm³/s', '={Qh}/3600', '', { nf: '0.000' }),
        R('Qrec', 'Nước thu hồi tuần hoàn về bể trộn', 'Q_th', 'm³/ngđ', '={Qtk}*{rth}', ''),
        R('Qtr', 'Lưu lượng qua trộn – phản ứng – lắng', 'Q_L', 'm³/ngđ', '={Qtk}+{Qrec}', ''),
        R('Qhtr', 'Lưu lượng giờ qua trộn – phản ứng – lắng', 'Q_L,h', 'm³/h', '={Qtr}/{tlv}', ''),
        R('Qstr', 'Lưu lượng giây qua trộn – phản ứng – lắng', 'Q_L,s', 'm³/s', '={Qhtr}/3600', '', { nf: '0.000' }),
        R('QhF', 'Lưu lượng giờ vào bể lọc', 'Q_F', 'm³/h', '=({Qtr}-{sl_Vcl})/{tlv}', 'Trừ nước xả bùn công trình lắng / tuyển nổi'),
        R('Qmax2', 'Lưu lượng giờ lớn nhất bơm cấp II', 'Q_max', 'm³/h', '={Q}/24*{Kh}', '')] },
      { sec: 'B. KIỂM TRA HỆ SỐ DÙNG NƯỚC CHO BẢN THÂN TRẠM', rows: [
        R('cb_bw', 'Nước rửa lọc trong 1 ngày', 'V_rl', 'm³/ngđ', '={bw_Vd}', 'Sheet rửa lọc'),
        R('cb_sl', 'Nước xả bùn công trình lắng trong 1 ngày', 'V_xb', 'm³/ngđ', '={sl_Vcl}', 'Sheet 11'),
        R('cb_ro', 'Nước muối đậm đặc RO thải bỏ', 'V_RO', 'm³/ngđ', ch.adv && ch.adv.includes('ro') ? '={ro_Qc}' : '=0', ch.adv && ch.adv.includes('ro') ? 'Sheet RO' : 'Không có RO'),
        R('cb_tot', 'Tổng nước dùng cho bản thân trạm', 'ΣV', 'm³/ngđ', '={cb_bw}+{cb_sl}+{cb_ro}', ''),
        R('cb_a', 'Hệ số dùng nước cho bản thân trạm thực tế', 'a_tt', '–', '=1+{cb_tot}/{Q}', '', { nf: '0.000' }),
        CK('cb_chk', 'Kiểm tra', '=IF({cb_a}<={a},"ĐẠT – hệ số a giả thiết đủ bao phủ","XEM LẠI – tăng hệ số a lên ≥ "&TEXT({cb_a},"0.000"))')] }] };

    /* ---------- 03_HoaChat (bảng như file mẫu) ---------- */
    const hcRows = [];
    const hc = (k, name, dose, conc, note, dKey) => hcRows.push([hcRows.length + 1, name, { f: dose, k: 'hc_' + k + '_C' }, { f: dKey || `={Qtk}*{hc_${k}_C}/1000`, k: 'hc_' + k }, { f: conc, k: 'hc_' + k + '_E' }, { f: `={hc_${k}}/(10*{hc_${k}_E})`, k: 'hc_' + k + '_F' }, { f: `={hc_${k}_F}*1000/24`, k: 'hc_' + k + '_G' }, { f: `={hc_${k}_F}/2`, k: 'hc_' + k + '_H' }, note]);
    if (PAC > 0) hc('PAC', 'PAC 31% Al₂O₃', '={PAC}', '={cPAC}', 'Keo tụ chính – châm tại bể trộn');
    if (poly > 0) hc('poly', 'Polymer anion trợ keo tụ', '={poly}', '={cPoly}', 'Châm vào buồng phản ứng 1');
    if (lime > 0) hc('lime', 'Vôi CaO (sữa vôi)', '={lime}', '={cLime}', 'Ổn định pH sau keo tụ / lọc');
    if (kmn > 0) hc('kmn', 'KMnO₄ – oxy hóa mangan', '={KMnO4}', '=3', 'Châm trước bể tiếp xúc / bể lọc');
    if (Cl1 > 0) hc('cl1', 'NaOCl – tiền khử trùng', '={Cl1}', '={cCl}', 'Châm tại bể trộn');
    hc('cl2', 'NaOCl – khử trùng chính', '={Cl2}', '={cCl}', 'Châm tại đầu bể chứa');
    const mechDew = ch.sl !== 'bed';
    if (mechDew) hc('pc', 'Polymer cation – khử nước bùn', '={sl_pd}*1000/{Qtk}', '={sl_cpoly}', 'Liều tính theo bùn khô (sheet 11)', '={sl_pd}');
    const hk = k => hcRows.some(r => r[2].k === 'hc_' + k + '_C');
    const hcs = { name: '03_HoaChat', title: '03 – TÍNH TOÁN HÓA CHẤT', ncol: 9, widths: [5, 34, 12, 14, 12, 14, 14, 16, 46], blocks: [
      { grid: { sec: 'LƯỢNG HÓA CHẤT, BỂ PHA VÀ BƠM ĐỊNH LƯỢNG', head: ['TT', 'Hóa chất', 'Liều lượng', 'Lượng dùng', 'Nồng độ dd', 'Lưu lượng dd', 'Bơm định lượng', 'Dung tích bể pha', 'Ghi chú'], unit: ['', '', 'mg/L', 'kg/ngđ', '%', 'm³/ngđ', 'L/h', 'm³ (2 bể × 12 h)', ''], rows: hcRows } },
      { sec: 'B. KHO CHỨA HÓA CHẤT – DỰ TRỮ', rows: [
        hk('PAC') && R('hc_sPAC', 'Khối lượng PAC dự trữ', '–', 'tấn', '={hc_PAC}*{days}/1000', 'Bao 25 kg / bồn PAC lỏng'),
        hk('lime') && R('hc_sLime', 'Khối lượng vôi dự trữ', '–', 'tấn', '={hc_lime}*{days}/1000', 'Silo vôi bột'),
        hk('poly') && R('hc_sPoly', 'Khối lượng polymer dự trữ', '–', 'tấn', '={hc_poly}*{days}/1000', ''),
        R('hc_sCl', 'Thể tích NaOCl 10 % dự trữ (15 ngày)', '–', 'm³', hk('cl1') ? '=({hc_cl1_F}+{hc_cl2_F})*15' : '={hc_cl2_F}*15', 'NaOCl phân hủy theo thời gian – dự trữ 15 ngày')] }] };

    /* ---------- tiền xử lý ---------- */
    let SSin = q.SS, Epre = 0;
    if (ch.pre === 'presed') {
      const SOR = 12, N = 2, Ar = Qhtr / SOR, A1 = Ar / N, B = c10(Math.sqrt(A1 / 5)), L = c10(A1 / B);
      Epre = 0.5;
      sec('BỂ LẮNG SƠ BỘ (MWH Bảng 10-2)', [
        R('ps_N', 'Số bể lắng sơ bộ', 'N', 'bể', V('ps_N', N), '≥ 2 bể'),
        R('ps_B', 'CHỌN: chiều rộng bể', 'B', 'm', V('ps_B', B), 'L/B = 4÷8', { nf: '0.0' }),
        R('ps_L', 'CHỌN: chiều dài bể', 'L', 'm', V('ps_L', L), '', { nf: '0.0' }),
        R('ps_H', 'Chiều sâu công tác', 'H', 'm', V('ps_H', 3.5), 'MWH: 3÷5 m', { nf: '0.0' }),
        R('ps_E', 'Hiệu suất khử cặn lắng sơ bộ', 'E', '%', V('ps_E', 50), 'GIẢ ĐỊNH – phù sa thô mùa lũ')]);
      SH.push({ name: 'Lang_SoBo', title: 'BỂ LẮNG SƠ BỘ (TIỀN LẮNG CÁT – PHÙ SA MÙA LŨ)', blocks: [{ sec: 'A. KÍCH THƯỚC VÀ KIỂM TRA', rows: [
        R('ps_Q1', 'Lưu lượng mỗi bể', 'Q₁', 'm³/h', '={Qhtr}/{ps_N}', ''),
        R('ps_A', 'Diện tích mặt bằng mỗi bể', 'A', 'm²', '={ps_B}*{ps_L}', ''),
        R('ps_u', 'Tải trọng bề mặt', 'U', 'm³/m²·ngđ', '={ps_Q1}*24/{ps_A}', ''),
        CK('ps_c1', 'Kiểm tra tải trọng bề mặt', IFR('ps_u', 200, 400, '200÷400 m³/m²·ngđ – MWH Bảng 10-2')),
        R('ps_LB', 'Tỷ lệ L/B', 'L/B', '–', '={ps_L}/{ps_B}', ''),
        CK('ps_c2', 'Kiểm tra tỷ lệ L/B', IFR('ps_LB', 4, 8, '4÷8')),
        CK('ps_c3', 'Kiểm tra chiều sâu', IFR('ps_H', 3, 5, '3÷5 m')),
        R('ps_t', 'Thời gian lưu', 't', 'h', '={ps_A}*{ps_H}/{ps_Q1}', '', { nf: '0.00' }),
        R('ps_hl', 'Tổn thất áp qua bể lắng sơ bộ', 'h', 'm', V('ps_hl', 0.2), 'Tràn vào + tràn ra', { nf: '0.00' }),
        R('ps_Vc', 'Dung tích xây dựng (bảo vệ 0,5 m)', 'V_xd', 'm³', '={ps_N}*{ps_A}*({ps_H}+0.5)', ''),
        R('ps_dim', 'Kích thước mỗi bể', '', '', '=TEXT({ps_B},"0.0")&" m × "&TEXT({ps_L},"0.0")&" m × "&TEXT({ps_H}+0.5,"0.0")&" m"', '', { sel: 1 })] }] });
      civ.push(['Bể lắng sơ bộ', 'ps_Vc', 4.5]); hl.push(['Qua bể lắng sơ bộ', 'ps_hl']); eqp.push(['Thiết bị gạt cặn bể lắng sơ bộ', 'bộ', '={ps_N}', 800]); kwh.push(['Gạt cặn bể lắng sơ bộ', '={ps_N}*0.75*24/{eta_mot}']);
      dims.push(['Bể lắng sơ bộ', 'ps_N', 'ps_dim']);
      SSin = q.SS * 0.5;
    }
    if (ch.pre === 'aer') {
      const qa = 12, A = Qh / qa, n = Qh > 400 ? 2 : 1, tct = 45;
      sec('LÀM THOÁNG – BỂ TIẾP XÚC (KHỬ Fe²⁺, CO₂)', [
        R('ae_n', 'Số giàn mưa / tháp làm thoáng', 'n', 'giàn', V('ae_n', n), ''),
        R('ae_q', 'Cường độ tưới', 'q', 'm³/m²·h', V('ae_q', qa), 'TCXDVN 33:2006: giàn mưa 10÷15 m³/m²·h'),
        R('ae_ns', 'Số tầng sàn tung nước', 'n_s', 'tầng', V('ae_ns', 3), '3÷4 tầng, khoảng cách 0,6÷0,8 m'),
        R('ae_t', 'Thời gian lưu bể tiếp xúc', 't', 'min', V('ae_t', tct), 'Thủy phân Fe(OH)₃: 30÷60 min'),
        R('ae_H', 'Chiều sâu công tác bể tiếp xúc', 'H', 'm', V('ae_H', 3), '', { nf: '0.0' })]);
      SH.push({ name: 'LamThoang', title: 'LÀM THOÁNG – BỂ TIẾP XÚC (KHỬ SẮT, CO₂)', blocks: [
        { sec: 'A. GIÀN MƯA LÀM THOÁNG', rows: [
          R('ae_A', 'Diện tích giàn mưa yêu cầu', 'F', 'm²', '={Qh}/{ae_q}', ''),
          R('ae_A1', 'Diện tích mỗi giàn', 'F₁', 'm²', '={ae_A}/{ae_n}', ''),
          R('ae_O2', 'Nhu cầu oxy (0,143 mg/mg Fe + 0,29 mg/mg Mn)', 'O₂', 'mg/L', '=0.143*{Fe}+0.29*{Mn}', 'Làm thoáng tự nhiên đạt 6÷8 mg/L', { nf: '0.00' }),
          CK('ae_c1', 'Kiểm tra nhu cầu oxy', IFLE('ae_O2', 6, '≤ 6 mg/L – làm thoáng tự nhiên đủ')),
          R('ae_pH', 'pH sau làm thoáng (ước tính, khử CO₂)', 'pH', '–', '={pH}+0.4', 'Fe²⁺ oxy hóa nhanh khi pH ≥ 7', { nf: '0.0' }),
          R('ae_hl', 'Chiều cao giàn mưa (tổn thất áp)', 'h', 'm', '={ae_ns}*0.7+0.6', 'Nước bơm lên đỉnh giàn', { nf: '0.00' })] },
        { sec: 'B. BỂ TIẾP XÚC', rows: [
          R('ae_V', 'Dung tích bể tiếp xúc', 'V', 'm³', '={Qh}*{ae_t}/60', ''),
          R('ae_Fct', 'Diện tích bể tiếp xúc', 'F', 'm²', '={ae_V}/{ae_H}', ''),
          R('ae_Vc', 'Dung tích xây dựng (bảo vệ 0,5 m)', 'V_xd', 'm³', '={ae_Fct}*({ae_H}+0.5)', ''),
          CK('ae_c2', 'Kiểm tra thời gian tiếp xúc', IFR('ae_t', 30, 90, '30÷90 min')),
          R('ae_dim', 'Kích thước', '', '', '=TEXT({ae_n},"0")&" giàn × "&TEXT({ae_A1},"0.0")&" m²; bể tiếp xúc "&TEXT({ae_V},"#,##0")&" m³"', '', { sel: 1 })] }] });
      civ.push(['Giàn mưa + bể tiếp xúc', 'ae_Vc', 4.5]); hl.push(['Giàn mưa làm thoáng', 'ae_hl']); dims.push(['Làm thoáng – tiếp xúc', 'ae_n', 'ae_dim']);
    }

    /* ---------- bể lắng / tuyển nổi: định cỡ trước để biết bề rộng đơn nguyên phản ứng ---------- */
    let CL = null;
    const Vsl0 = Qtk * 0.018;
    if (ch.clar === 'texler') {
      const b = sizeTexler({ Qh: Qhtr, Vsl: Vsl0, nu }) || { N: 2, ntr: 3, nh: 1, L: 12, B: 6.7, C: 6, D: 6.6, h: 0.3 };   // không có cấu hình đạt: Texler không phù hợp quy mô này
      CL = { N: V('cl_N', b.N), W: V('tx_B', b.B), H: 4.6, E: 90, C1: 1.5 };
      sec('BỂ LẮNG LAMEN LEOPOLD TEXLER + THU BÙN CT2', [
        R('cl_N', 'Số bể lắng', 'N', 'bể', CL.N, ''),
        R('tx_ntr', 'Số dãy Texler (train) mỗi bể', 'n_tr', 'dãy', V('tx_ntr', b.ntr), 'Leopold: 4 dãy / 8,6 m'),
        R('tx_F', 'Bước dãy Texler (tâm máng – tâm máng)', 'F', 'm', 1.956, 'Bản vẽ Leopold I21254.93.01 – kích thước F', { nf: '0.000' }),
        R('tx_K', 'Khoảng hở biên tới tường (mỗi bên)', 'K', 'm', 0.388, 'Bản vẽ I21254.93.01 – kích thước K', { nf: '0.000' }),
        R('tx_B', 'CHỌN: chiều rộng bể lắng', 'B', 'm', CL.W, '≥ n_tr × F + 2K', { nf: '0.0' }),
        R('tx_L', 'CHỌN: chiều dài bể lắng (không gồm phản ứng)', 'L', 'm', V('tx_L', b.L), 'Hành trình CT2 1 header ≤ 37 m (P9.007)', { nf: '0.0' }),
        R('tx_C', 'CHỌN: chiều dài vùng đặt tấm', 'C', 'm', V('tx_C', b.C), '≈ 50 % chiều dài bể', { nf: '0.0' }),
        R('cl_H', 'Chiều sâu lớp nước (SWD)', 'H', 'm', 4.6, 'Leopold 4,6 m; P9.007 ≥ 2,4 m', { nf: '0.0' }),
        R('tx_Lp', 'Chiều dài tấm Texler', 'L_p', 'm', 2.44, 'Tấm geomembrane HDPE', { nf: '0.00' }),
        R('tx_Wp', 'Chiều rộng tấm Texler', 'W_p', 'm', 1.45, '', { nf: '0.00' }),
        R('tx_th', 'Góc nghiêng tấm', 'θ', 'độ', 55, 'Texler 55°'),
        R('tx_s', 'Khoảng cách vuông góc giữa 2 tấm', 's', 'mm', 50.8, 'Texler: 2 in', { nf: '0.0' }),
        R('tx_p', 'Bước tấm theo phương ngang', 'p', 'm', 0.06837, '15,042 m / 220 tấm', { nf: '0.00000' }),
        R('tx_eta', 'Hệ số hiệu quả tấm', 'η', '–', 0.8, 'Leopold: 0,80', { nf: '0.00' }),
        R('tx_Qv', 'Chiều cao đứng cụm tấm', 'Q', 'm', 2.46, 'Bản vẽ I21254.93.02', { nf: '0.00' }),
        R('tx_b', 'Chiều rộng máng Texler', 'b', 'm', 0.381, 'Texler: 15 in', { nf: '0.000' }),
        R('tx_h', 'Chiều cao máng Texler', 'h', 'm', V('tx_h', b.h), 'Design Tool Texler: 12÷14,3 in theo lưu lượng', { nf: '0.000' }),
        R('cl_E', 'Hiệu suất khử cặn của bể lắng', 'E', '%', V('cl_E', 90), 'GIẢ ĐỊNH'),
        R('tx_nh', 'Số header CT2 mỗi bể (song song theo chiều rộng)', 'n_h', 'header', V('tx_nh', b.nh), 'P9.007: header ≤ 9 m'),
        R('tx_qs', 'Cường độ hút bùn CT2', 'q_s', 'L/ph·m', 50, 'P9.007: tối đa 4 gpm/ft = 50 L/ph/m'),
        R('tx_vh', 'Tốc độ di chuyển header CT2', 'v_h', 'm/ph', 0.5, 'Điều chỉnh tại tủ', { nf: '0.00' })]);
      SH.push({ name: 'LangTexler', title: 'BỂ LẮNG LAMEN LEOPOLD TEXLER™ + HỆ THU BÙN CT2®', blocks: [
        { sec: 'A. KÍCH THƯỚC BỂ VÀ TẢI TRỌNG BỀ MẶT', rows: [
          R('tx_Q7', 'Lưu lượng mỗi bể lắng', 'Q₁', 'm³/h', '={Qhtr}/{cl_N}', ''),
          R('tx_Btt', 'Chiều rộng bể yêu cầu theo số dãy Texler', 'B_tt', 'm', '={tx_ntr}*{tx_F}+2*{tx_K}', ''),
          CK('tx_c1', 'Kiểm tra chiều rộng', '=IF({tx_B}>={tx_Btt},"ĐẠT  (B ≥ B_tt)","XEM LẠI – tăng B")'),
          R('cl_A1', 'Diện tích mặt bằng bể', 'A', 'm²', '={tx_B}*{tx_L}', ''),
          R('tx_SLR', 'Tải trọng bề mặt bể', 'U', 'm/h', '={tx_Q7}/{cl_A1}', ''),
          CK('tx_c2', 'Kiểm tra tải trọng bề mặt', IFLE('tx_SLR', 4.2, '≤ 4,2 m/h')),
          R('tx_cov', 'Tỷ lệ chiều dài phủ tấm', 'C/L', '–', '={tx_C}/{tx_L}', '', { nf: '0.00' }),
          CK('tx_c3', 'Kiểm tra tỷ lệ phủ tấm', IFLE('tx_cov', 0.75, '≤ 75 %')),
          CK('tx_c4', 'Kiểm tra chiều sâu', IFR('cl_H', 3, 5, '3÷5 m; P9.007 ≥ 2,4 m'))] },
        { sec: 'B. CỤM TẤM TEXLER', rows: [
          R('tx_np', 'Tổng số tấm mỗi bể', 'n_p', 'tấm', '=ROUNDDOWN({tx_C}/{tx_p},0)*{tx_ntr}', ''),
          R('tx_Ae', 'Diện tích lắng hiệu dụng', 'A_e', 'm²', '={tx_eta}*{tx_np}*{tx_Lp}*{tx_Wp}*COS(RADIANS({tx_th}))', 'η · n · L_p · W_p · cosθ'),
          R('tx_u', 'Tải trọng trên tấm (plate loading)', 'u', 'm/h', '={tx_Q7}/{tx_Ae}', '', { nf: '0.000' }),
          CK('tx_c5', 'Kiểm tra tải trọng trên tấm', IFLE('tx_u', 0.72, '≤ 0,72 m/h ⇔ v_c ≤ 0,2 mm/s')),
          R('tx_v', 'Vận tốc nước giữa các tấm', 'v', 'm/h', '={tx_Q7}/({tx_np}*{tx_s}/1000*{tx_Wp})', ''),
          CK('tx_c6', 'Kiểm tra vận tốc giữa tấm', IFLE('tx_v', 18, '≤ 18 m/h')),
          R('tx_Re', 'Số Reynolds trong khe', 'Re', '–', '=({tx_v}/3600)*2*{tx_s}/1000/({mu}/{rho})', ''),
          CK('tx_c7', 'Kiểm tra Reynolds', '=IF({tx_Re}<500,"ĐẠT  (< 500 – chảy tầng)","XEM LẠI")'),
          R('tx_Fr', 'Số Froude trong khe', 'Fr', '–', '=({tx_v}/3600)^2/({g}*2*{tx_s}/1000)', '', { nf: '0.000E+00' }),
          CK('tx_c8', 'Kiểm tra Froude', IFGE('tx_Fr', 0.00001, '≥ 1×10⁻⁵')),
          R('tx_gap', 'Khoảng hở đáy bể → đáy tấm', 'Δh', 'm', '={cl_H}-{tx_Qv}-0.4', '', { nf: '0.00' }),
          CK('tx_c9', 'Kiểm tra khoảng hở', IFGE('tx_gap', 0.9, '≥ 0,9 m cho CT2 và vùng phân phối')),
          R('tx_u1', 'Tải trọng trên tấm khi 1 bể dừng', 'u₁', 'm/h', '={Qhtr}/(({cl_N}-1)*{tx_Ae})', '', { nf: '0.000' }),
          CK('tx_c10', 'Kiểm tra vận hành khi 1 bể dừng', '=IF(AND({Qhtr}/(({cl_N}-1)*{cl_A1})<=5,{tx_u1}<=0.9),"ĐẠT  (ngắn hạn: U ≤ 5,0; u ≤ 0,90 m/h)","XEM LẠI")')] },
        { sec: 'C. MÁNG THU TEXLER VÀ HỆ CT2', rows: [
          R('tx_qt', 'Lưu lượng mỗi máng', 'q_m', 'm³/h', '={tx_Q7}/({tx_ntr}+1)', ''),
          R('tx_y', 'Chiều sâu nước đầu máng', 'y₀', 'm', '=1.73*(({tx_qt}/3600)^2/({g}*{tx_b}^2))^(1/3)', '', { nf: '0.000' }),
          CK('tx_c11', 'Kiểm tra chiều cao máng', '=IF({tx_y}<={tx_h}-0.08,"ĐẠT – còn ≥ 80 mm dự trữ","XEM LẠI – tăng chiều cao máng")'),
          R('tx_wl', 'Tải trọng thu trên mép máng (2 bên)', 'q_w', 'm³/m·h', '={tx_Q7}/(2*({tx_ntr}+1)*{tx_C})', ''),
          CK('tx_c12', 'Kiểm tra tải trọng mép máng', IFR('tx_wl', 3.75, 15, '3,75÷15 m³/m·h')),
          R('tx_hw', 'Bề rộng quét mỗi header', 'b_h', 'm', '={tx_B}/{tx_nh}-0.2', '', { nf: '0.00' }),
          CK('tx_c13', 'Kiểm tra chiều dài header', IFLE('tx_hw', 9, 'P9.007: ≤ 9 m', 'VƯỢT P9')),
          R('tx_tr', 'Hành trình header', 'L_h', 'm', '={tx_L}-2*0.051-2*0.762', ''),
          CK('tx_c14', 'Kiểm tra hành trình', IFLE('tx_tr', 37, 'P9.007: ≤ 37 m / 1 header', 'VƯỢT P9')),
          R('tx_run', 'Thời gian chạy header cần thiết', 't_ch', 'h/ngđ', '={sl_Vcl}/({cl_N}*{tx_nh})/({tx_qs}*{tx_hw}*60/1000)', ''),
          CK('tx_c15', 'Kiểm tra thời gian chạy', IFLE('tx_run', 20, '≤ 20 h/ngđ', 'XEM LẠI – thêm header')),
          R('tx_run1', 'Thời gian chạy khi 1 bể lắng dừng', 't₁', 'h/ngđ', '={sl_Vcl}/(({cl_N}-1)*{tx_nh}*{tx_qs}*{tx_hw}*60/1000)', ''),
          CK('tx_c16', 'Kiểm tra khi 1 bể dừng', IFLE('tx_run1', 24, '≤ 24 h/ngđ', 'KHÔNG ĐỦ – thêm header')),
          R('cl_hl', 'Tổn thất qua bể lắng (máng thu + rơi tự do)', 'h', 'm', '={tx_y}+0.1', '', { nf: '0.00' }),
          R('cl_Vc', 'Dung tích xây dựng bể lắng (bảo vệ 0,5 m)', 'V_xd', 'm³', '={cl_N}*{cl_A1}*({cl_H}+0.5)', ''),
          R('cl_dim', 'Kích thước mỗi bể lắng', '', '', '=TEXT({tx_B},"0.00")&" m × "&TEXT({tx_L},"0.00")&" m × "&TEXT({cl_H}+0.5,"0.00")&" m"', '', { sel: 1 })] }] });
      civ.push(['Bể lắng Texler', 'cl_Vc', 5]); eqp.push(['Hệ lắng Leopold Texler (tấm, máng, dầm, nắp)', 'm² bể', '={cl_N}*{cl_A1}', 18], ['Hệ thu bùn Leopold CT2', 'header', '={cl_N}*{tx_nh}', 500]);
      kwh.push(['CT2 – tời kéo header', '={cl_N}*{tx_nh}*0.37*{tx_run}/{eta_mot}']);
      keyRes.push(['Lắng Texler – tải trọng bề mặt', 'tx_SLR', 'm/h'], ['Lắng Texler – tải trọng trên tấm', 'tx_u', 'm/h'], ['CT2 – thời gian chạy', 'tx_run', 'h/ngđ']);
    } else if (ch.clar === 'lamella') {
      // tải trọng ống lắng ≤ 5,7 m/h và khi 1 bể dừng ≤ 7,4 m/h → u_t = min(5,7; 7,4·(N−1)/N)
      const f = 0.7; let N = 2, ut;
      for (; N < 40; N++) { ut = Math.min(5.7, 7.4 * (N - 1) / N); if (Qhtr / (ut * f) / N <= 220) break; }
      N = even(N); ut = Math.min(5.7, 7.4 * (N - 1) / N);
      const Areq = Qhtr / (ut * f), A1 = Areq / N, B = cl(c10(Math.sqrt(A1 / 1.6)), 2, 12), L = c10(A1 / B);
      CL = { N: V('cl_N', N), W: V('lm_B', B), H: 4.6, E: 90, C1: 1.0 };
      sec('BỂ LẮNG LAMEN ỐNG NGHIÊNG (MWH Bảng 10-6)', [
        R('cl_N', 'Số bể lắng', 'N', 'bể', CL.N, '≥ 2 bể'),
        R('lm_B', 'CHỌN: chiều rộng bể', 'B', 'm', CL.W, '≤ 12 m (gạt bùn)', { nf: '0.0' }),
        R('lm_L', 'CHỌN: chiều dài vùng lắng', 'L', 'm', V('lm_L', L), '', { nf: '0.0' }),
        R('lm_f', 'Tỷ lệ diện tích đặt ống lắng / mặt bằng', 'f', '–', V('lm_f', f), 'Phần còn lại: vùng phân phối, máng thu', { nf: '0.00' }),
        R('lm_th', 'Góc nghiêng ống lắng', 'θ', 'độ', V('lm_th', 60), 'MWH: 60°'),
        R('lm_Lt', 'Chiều dài ống lắng', 'l', 'm', V('lm_Lt', cl(rd(ut / Math.sin(Math.PI / 3) / 60 * 8, 0.1), 0.6, 1.2)), 'Module 0,6÷1,2 m; chọn để t ≈ 8 min', { nf: '0.00' }),
        R('lm_d', 'Đường kính thủy lực ống', 'd_h', 'm', V('lm_d', 0.06), 'MWH: 50÷80 mm', { nf: '0.000' }),
        R('cl_H', 'Chiều sâu công tác bể', 'H', 'm', V('cl_H', 4.6), 'Phân phối 1,5 + ống 0,9 + nước trong 1,0 + bùn 1,2', { nf: '0.0' }),
        R('cl_E', 'Hiệu suất khử cặn của bể lắng', 'E', '%', V('cl_E', 90), 'GIẢ ĐỊNH'),
        R('lm_nl', 'Số máng thu nước trên mặt ống lắng', 'n_m', 'máng', V('lm_nl', Math.max(2, Math.ceil(L * f / 1.4))), 'Khoảng cách máng ≤ 1,5 m')]);
      SH.push({ name: 'LangLamen', title: 'BỂ LẮNG LAMEN ỐNG NGHIÊNG 60° (TUBE SETTLER)', blocks: [
        { sec: 'A. TẢI TRỌNG VÀ THỦY LỰC', rows: [
          R('lm_Q1', 'Lưu lượng mỗi bể lắng', 'Q₁', 'm³/h', '={Qhtr}/{cl_N}', ''),
          R('cl_A1', 'Diện tích mặt bằng bể', 'A', 'm²', '={lm_B}*{lm_L}', ''),
          R('lm_At', 'Diện tích đặt ống lắng', 'A_t', 'm²', '={lm_f}*{cl_A1}', ''),
          R('lm_ut', 'Tải trọng trên diện tích ống lắng', 'u_t', 'm/h', '={lm_Q1}/{lm_At}', ''),
          CK('lm_c1', 'Kiểm tra tải trọng ống lắng', IFR('lm_ut', 2.5, 6.25, '2,5÷6,25 m/h – keo tụ phèn, MWH Bảng 10-6')),
          CK('lm_c2', 'Kiểm tra tỷ lệ phủ', IFLE('lm_f', 0.75, '≤ 75 %')),
          R('lm_v', 'Vận tốc dọc ống lắng', 'v', 'm/ph', '={lm_ut}/SIN(RADIANS({lm_th}))/60', '', { nf: '0.000' }),
          CK('lm_c3', 'Kiểm tra vận tốc dọc ống', IFLE('lm_v', 0.15, '≤ 0,15 m/ph')),
          R('lm_t', 'Thời gian nước qua ống lắng', 't', 'min', '={lm_Lt}/{lm_v}', '', { nf: '0.0' }),
          CK('lm_c4', 'Kiểm tra thời gian qua ống', IFR('lm_t', 5, 12, '6÷10 min (MWH), cho phép 5÷12')),
          R('lm_Re', 'Số Reynolds trong ống', 'Re', '–', '={lm_v}/60*{lm_d}/({mu}/{rho})', ''),
          CK('lm_c5', 'Kiểm tra Reynolds', '=IF({lm_Re}<500,"ĐẠT  (< 500 – chảy tầng)","XEM LẠI")'),
          R('lm_vc', 'Vận tốc lắng tới hạn (Yao)', 'v_c', 'mm/s', '={lm_v}/60*1000/(SIN(RADIANS({lm_th}))+{lm_Lt}/{lm_d}*COS(RADIANS({lm_th})))', 'S_c = 1 – ống tròn', { nf: '0.000' }),
          CK('lm_c6', 'Kiểm tra vận tốc lắng tới hạn', IFLE('lm_vc', 0.25, '≤ 0,25 mm/s – bông cặn phèn')),
          R('lm_Fr', 'Số Froude trong ống (tham khảo)', 'Fr', '–', '=({lm_v}/60)^2/({g}*{lm_d})', 'MWH: Fr > 10⁻⁵ ổn định; ống lắng thường thấp hơn – tham khảo', { nf: '0.000E+00' }),
          R('lm_ut1', 'Tải trọng ống lắng khi 1 bể dừng', 'u_t1', 'm/h', '={Qhtr}/(({cl_N}-1)*{lm_At})', ''),
          CK('lm_c7', 'Kiểm tra khi 1 bể dừng', IFLE('lm_ut1', 7.5, '≤ 7,5 m/h ngắn hạn'))] },
        { sec: 'B. MÁNG THU, BÙN, KÍCH THƯỚC', rows: [
          R('lm_wl', 'Tải trọng thu trên mép máng (2 bên)', 'q_w', 'm³/m·h', '={lm_Q1}/(2*{lm_nl}*{lm_B})', ''),
          CK('lm_c8', 'Kiểm tra tải trọng mép máng', IFLE('lm_wl', 15, '≤ 15 m³/m·h')),
          R('lm_sp', 'Khoảng cách giữa các máng', 'a', 'm', '={lm_L}*{lm_f}/{lm_nl}', '', { nf: '0.00' }),
          CK('lm_c9', 'Kiểm tra khoảng cách máng', IFLE('lm_sp', 1.5, '≤ 1,5 m')),
          R('lm_mod', 'Thể tích module ống lắng', 'V_m', 'm³', '={cl_N}*{lm_At}*{lm_Lt}*SIN(RADIANS({lm_th}))', 'Vật tư tiêu hao: tuổi thọ 10÷15 năm (CLAUDE §13)'),
          R('cl_hl', 'Tổn thất qua bể lắng (máng thu + rơi tự do)', 'h', 'm', V('cl_hl', 0.15), '', { nf: '0.00' }),
          R('cl_Vc', 'Dung tích xây dựng bể lắng (bảo vệ 0,5 m)', 'V_xd', 'm³', '={cl_N}*{cl_A1}*({cl_H}+0.5)', ''),
          R('cl_dim', 'Kích thước mỗi bể lắng', '', '', '=TEXT({lm_B},"0.00")&" m × "&TEXT({lm_L},"0.00")&" m × "&TEXT({cl_H}+0.5,"0.00")&" m"', '', { sel: 1 })] }] });
      civ.push(['Bể lắng lamen', 'cl_Vc', 5]); eqp.push(['Module ống lắng lamen (PVC/PP)', 'm³', '={lm_mod}', 2.5], ['Gạt / xả bùn bể lắng lamen', 'bộ', '={cl_N}', 500]);
      kwh.push(['Gạt bùn bể lắng lamen', '={cl_N}*0.75*24/{eta_mot}']);
      keyRes.push(['Lắng lamen – tải trọng ống lắng', 'lm_ut', 'm/h'], ['Lắng lamen – vận tốc lắng tới hạn', 'lm_vc', 'mm/s']);
    } else if (ch.clar === 'horiz') {
      // U ≤ 1,8 m/h và khi 1 bể dừng ≤ 3,1 m/h
      const N = even(Math.max(2, Math.ceil(Qhtr / (1.8 * 4.5 * 18 * 18) - 1e-9))), SOR = Math.min(1.8, 3.1 * (N - 1) / N);
      const A1 = Qhtr / N / SOR, H = cl(r10(Math.sqrt(A1 / 4.5) / 4), 3, 5), B = cl(Math.max(3 * H, c10(Math.sqrt(A1 / 4.5))), 3, 30), L = c10(A1 / B);
      const vh = Qhtr / N / (B * H) / 3600; let nw = 0; while (nw < 8 && vh * ((B / (nw + 1)) * H / (B / (nw + 1) + 2 * H)) / nu >= 19000) nw++;
      CL = { N: V('cl_N', N), W: V('hz_B', B), H: V('cl_H', H), E: 90, C1: 1.0 };
      sec('BỂ LẮNG NGANG (MWH Bảng 10-4; TCXDVN 33:2006)', [
        R('cl_N', 'Số bể lắng', 'N', 'bể', CL.N, '≥ 2 bể'),
        R('hz_B', 'CHỌN: chiều rộng bể', 'B', 'm', CL.W, '', { nf: '0.0' }),
        R('hz_L', 'CHỌN: chiều dài bể', 'L', 'm', V('hz_L', L), '', { nf: '0.0' }),
        R('cl_H', 'Chiều sâu công tác', 'H', 'm', CL.H, 'MWH: 3÷5 m', { nf: '0.0' }),
        R('cl_E', 'Hiệu suất khử cặn của bể lắng', 'E', '%', V('cl_E', 90), 'GIẢ ĐỊNH'),
        R('hz_nw', 'Số tường hướng dòng dọc bể', 'n_t', 'tường', V('hz_nw', nw), 'Giảm Re, chống dòng chảy tắt'),
        R('hz_nl', 'Số máng thu nước bề mặt (cuối bể)', 'n_m', 'máng', V('hz_nl', Math.max(2, Math.ceil(Qhtr / N / (2 * 0.33 * L * 11)))), 'Máng dài ≈ 1/3 chiều dài bể')]);
      SH.push({ name: 'LangNgang', title: 'BỂ LẮNG NGANG THU NƯỚC BỀ MẶT + GẠT BÙN', blocks: [
        { sec: 'A. TẢI TRỌNG, THỜI GIAN LƯU, VẬN TỐC', rows: [
          R('hz_Q1', 'Lưu lượng mỗi bể lắng', 'Q₁', 'm³/h', '={Qhtr}/{cl_N}', ''),
          R('cl_A1', 'Diện tích mặt bằng bể', 'A', 'm²', '={hz_B}*{hz_L}', ''),
          R('hz_SOR', 'Tải trọng bề mặt bể', 'U', 'm/h', '={hz_Q1}/{cl_A1}', ''),
          CK('hz_c1', 'Kiểm tra tải trọng bề mặt', IFR('hz_SOR', 1.25, 2.5, '1,25÷2,5 m/h – MWH Bảng 10-4')),
          R('hz_t', 'Thời gian lưu', 't', 'h', '={cl_A1}*{cl_H}/{hz_Q1}', '', { nf: '0.00' }),
          CK('hz_c2', 'Kiểm tra thời gian lưu', IFR('hz_t', 1.5, 4, '1,5÷4 h')),
          R('hz_v', 'Vận tốc dòng chảy ngang', 'v', 'm/ph', '={hz_Q1}/({hz_B}*{cl_H})/60', '', { nf: '0.000' }),
          CK('hz_c3', 'Kiểm tra vận tốc ngang', IFR('hz_v', 0.3, 1.1, '0,3÷1,1 m/ph')),
          R('hz_LH', 'Tỷ lệ L/H', 'L/H', '–', '={hz_L}/{cl_H}', ''),
          CK('hz_c4', 'Kiểm tra L/H', '=IF({hz_LH}>=15,"ĐẠT  (≥ 15 – MWH)",IF({hz_LH}>=8,"ĐẠT  (≥ 8 theo TCVN – bổ sung tường hướng dòng dọc bể)","XEM LẠI  (L/H < 8)"))', 'CLAUDE §13'),
          R('hz_WH', 'Tỷ lệ B/H', 'B/H', '–', '={hz_B}/{cl_H}', '', { nf: '0.00' }),
          CK('hz_c5', 'Kiểm tra B/H', IFR('hz_WH', 3, 6, '3÷6')),
          R('hz_LW', 'Tỷ lệ L/B', 'L/B', '–', '={hz_L}/{hz_B}', '', { nf: '0.00' }),
          CK('hz_c6', 'Kiểm tra L/B', IFR('hz_LW', 3, 6, '4÷5 (MWH), cho phép 3÷6')),
          R('hz_Rh', 'Bán kính thủy lực (mỗi ngăn giữa các tường hướng dòng)', 'R', 'm', '=({hz_B}/({hz_nw}+1))*{cl_H}/({hz_B}/({hz_nw}+1)+2*{cl_H})', '', { nf: '0.00' }),
          R('hz_Re', 'Số Reynolds', 'Re', '–', '={hz_v}/60*{hz_Rh}/({mu}/{rho})', ''),
          CK('hz_c7', 'Kiểm tra Reynolds', IFLE('hz_Re', 20000, '< 20.000')),
          R('hz_Fr', 'Số Froude (tham khảo)', 'Fr', '–', '=({hz_v}/60)^2/({g}*{hz_Rh})', 'MWH §10-7: Fr nhỏ là bình thường với lắng ngang – chỉ tham khảo', { nf: '0.000E+00' })] },
        { sec: 'B. MÁNG THU, BÙN, KÍCH THƯỚC', rows: [
          R('hz_wl', 'Tải trọng thu trên mép máng (2 bên)', 'q_w', 'm³/m·h', '={hz_Q1}/(2*{hz_nl}*0.33*{hz_L})', ''),
          CK('hz_c8', 'Kiểm tra tải trọng mép máng', IFLE('hz_wl', 13, '≤ 13 m³/m·h – MWH 9÷13')),
          R('hz_U1', 'Tải trọng bề mặt khi 1 bể dừng', 'U₁', 'm/h', '={Qhtr}/(({cl_N}-1)*{cl_A1})', ''),
          CK('hz_c9', 'Kiểm tra khi 1 bể dừng', IFLE('hz_U1', 3.2, '≤ 3,2 m/h ngắn hạn')),
          R('cl_hl', 'Tổn thất qua bể lắng (máng thu + rơi tự do)', 'h', 'm', V('cl_hl', 0.15), '', { nf: '0.00' }),
          R('cl_Vc', 'Dung tích xây dựng bể lắng (bảo vệ 0,5 m + hố bùn)', 'V_xd', 'm³', '={cl_N}*{cl_A1}*({cl_H}+0.8)', ''),
          R('cl_dim', 'Kích thước mỗi bể lắng', '', '', '=TEXT({hz_B},"0.0")&" m × "&TEXT({hz_L},"0.0")&" m × "&TEXT({cl_H}+0.5,"0.0")&" m"', '', { sel: 1 })] }] });
      civ.push(['Bể lắng ngang', 'cl_Vc', 4]); eqp.push(['Gạt bùn bể lắng ngang (xích / cầu chạy)', 'bộ', '={cl_N}', 800]);
      kwh.push(['Gạt bùn bể lắng ngang', '={cl_N}*1.5*24/{eta_mot}']);
      keyRes.push(['Lắng ngang – tải trọng bề mặt', 'hz_SOR', 'm/h'], ['Lắng ngang – thời gian lưu', 'hz_t', 'h']);
    } else if (ch.clar === 'daf') {
      const SOR = 12, r = 0.1, Areq = Qhtr * (1 + r) / SOR, N = even(Math.max(2, Math.ceil(Areq / 100 - 1e-9))), A1 = Areq / N;
      const B = cl(c10(Math.sqrt(A1 / 1.5)), 2, 9), L = c10(A1 / B);
      CL = { N: V('cl_N', N), W: V('df_B', B), H: 2.8, E: 92, C1: 2.5 };
      sec('TUYỂN NỔI KHÍ HÒA TAN DAF (MWH Bảng 10-9)', [
        R('cl_N', 'Số bể tuyển nổi', 'N', 'bể', CL.N, '≥ 2 bể'),
        R('df_B', 'CHỌN: chiều rộng bể', 'B', 'm', CL.W, '', { nf: '0.0' }),
        R('df_L', 'CHỌN: chiều dài vùng tuyển nổi', 'L', 'm', V('df_L', L), 'MWH: L ≤ 11÷12 m', { nf: '0.0' }),
        R('cl_H', 'Chiều sâu công tác', 'H', 'm', V('cl_H', 2.8), 'MWH: 2,5÷3,0 m', { nf: '0.0' }),
        R('df_lc', 'CHỌN: chiều dài vùng tiếp xúc', 'l_c', 'm', V('df_lc', c10(Math.max(0.8, Qhtr / N * (1 + r) * 120 / 3600 / (B * 2.8)))), '', { nf: '0.0' }),
        R('df_r', 'Tỷ lệ tuần hoàn nước bão hòa khí', 'r', '–', V('df_r', r), 'MWH: 6÷12 %', { nf: '0.00' }),
        R('df_P', 'Áp lực bình bão hòa', 'P', 'kPa', V('df_P', 500), 'MWH: 400÷700 kPa'),
        R('df_fs', 'Hiệu suất bão hòa khí', 'f', '–', V('df_fs', 0.7), '', { nf: '0.00' }),
        R('df_sa', 'Độ hòa tan không khí ở 1 atm', 's_a', 'mL/L', V('df_sa', 18.7), 'Ở 20 °C', { nf: '0.0' }),
        R('cl_E', 'Hiệu suất khử cặn của bể tuyển nổi', 'E', '%', V('cl_E', 92), 'GIẢ ĐỊNH – tảo, bông nhẹ')]);
      SH.push({ name: 'TuyenNoi_DAF', title: 'BỂ TUYỂN NỔI KHÍ HÒA TAN (DAF)', blocks: [
        { sec: 'A. VÙNG TUYỂN NỔI', rows: [
          R('df_Q1', 'Lưu lượng nước vào mỗi bể', 'Q₁', 'm³/h', '={Qhtr}/{cl_N}', ''),
          R('cl_A1', 'Diện tích vùng tuyển nổi mỗi bể', 'A', 'm²', '={df_B}*{df_L}', ''),
          CK('df_c1', 'Kiểm tra diện tích 1 bể', IFLE('cl_A1', 110, '≤ 90÷110 m²')),
          R('df_SOR', 'Tải trọng bề mặt (gồm nước tuần hoàn)', 'U', 'm/h', '={df_Q1}*(1+{df_r})/{cl_A1}', ''),
          CK('df_c2', 'Kiểm tra tải trọng bề mặt', IFR('df_SOR', 10, 20, '10÷20 m/h – DAF thường')),
          CK('df_c3', 'Kiểm tra chiều sâu', IFR('cl_H', 2.5, 3.0, '2,5÷3,0 m')),
          R('df_tc', 'Thời gian lưu vùng tiếp xúc', 't_c', 's', '={df_B}*{df_lc}*{cl_H}/({df_Q1}*(1+{df_r})/3600)', ''),
          CK('df_c4', 'Kiểm tra thời gian tiếp xúc', IFR('df_tc', 60, 240, '60÷240 s')),
          CK('df_c5', 'Kiểm tra tỷ lệ tuần hoàn', IFR('df_r', 0.06, 0.12, '6÷12 %'))] },
        { sec: 'B. KHÍ HÒA TAN VÀ BƠM TUẦN HOÀN', rows: [
          R('df_Qr', 'Lưu lượng tuần hoàn mỗi bể', 'Q_r', 'm³/h', '={df_r}*{df_Q1}', ''),
          R('df_air', 'Lượng khí giải phóng / m³ nước xử lý', 'A', 'g/m³', '={df_r}*1.2*{df_sa}*({df_fs}*({df_P}+101.3)/101.3-1)', '1,2 mg/mL không khí'),
          CK('df_c6', 'Kiểm tra lượng khí', IFR('df_air', 6, 10, '6÷10 g/m³')),
          R('df_Hp', 'Cột áp bơm tuần hoàn', 'H', 'm', '={df_P}/9.81+5', ''),
          R('df_kW', 'Công suất trục bơm tuần hoàn mỗi bể', 'N', 'kW', '={rho}*{g}*{df_Qr}/3600*{df_Hp}/0.7/1000', ''),
          R('df_kWh', 'Điện năng bơm tuần hoàn + máy nén + gạt váng', 'E', 'kWh/ngđ', '=({df_kW}*1.1+1.5)*{cl_N}*24/{eta_mot}', ''),
          R('cl_hl', 'Tổn thất qua bể tuyển nổi (tràn thu)', 'h', 'm', V('cl_hl', 0.3), '', { nf: '0.00' }),
          R('cl_Vc', 'Dung tích xây dựng (vùng tiếp xúc + tuyển nổi, bảo vệ 0,5 m)', 'V_xd', 'm³', '={cl_N}*{df_B}*({df_L}+{df_lc})*({cl_H}+0.5)', ''),
          R('cl_dim', 'Kích thước mỗi bể', '', '', '=TEXT({df_B},"0.0")&" m × "&TEXT({df_L}+{df_lc},"0.0")&" m × "&TEXT({cl_H}+0.5,"0.0")&" m"', '', { sel: 1 })] }] });
      civ.push(['Bể tuyển nổi DAF', 'cl_Vc', 5.5]); eqp.push(['Thiết bị DAF (bình bão hòa, bơm tuần hoàn, máy nén, gạt váng, vòi giải áp)', 'm²', '={cl_N}*{cl_A1}', 25]);
      kwh.push(['DAF – bơm tuần hoàn, máy nén, gạt váng', '={df_kWh}']);
      keyRes.push(['DAF – tải trọng bề mặt', 'df_SOR', 'm/h'], ['DAF – lượng khí', 'df_air', 'g/m³']);
    }
    if (CL) dims.push([TECH.clar[ch.clar], 'cl_N', 'cl_dim']);

    /* ---------- trộn nhanh ---------- */
    const needCoag = !(ch.pre === 'aer' && ch.clar === 'none');
    if (!needCoag) { /* nước ngầm: làm thoáng → lọc, không keo tụ */ }
    else if (ch.mix === 'mech') {
      const N = Q >= 1000 ? 2 : 1, qm = Qs / N, Vr = qm * 45, B = Math.max(1, c10(Math.cbrt(Vr / 0.84))), H = Math.max(1, c10(Math.max(Vr / (B * B), 0.84 * B * 0.85)));
      const Vt = B * B * H, Psh = 700 * 700 * mu * Vt / 0.8 / 1000, D = 0.45 * B, n = rd(3.9 * 60 / (Math.PI * D), 1);
      sec('BỂ TRỘN NHANH (CƠ KHÍ)', [
        R('mx_N', 'Số bể trộn (song song, chung 1 khối)', 'N_m', 'bể', V('mx_N', N), N > 1 ? 'Khi 1 bể dừng, bể còn lại nhận 100 % Q' : 'Trạm nhỏ – 1 bể, có ống vượt'),
        R('mx_t', 'Thời gian lưu bể trộn', 't', 's', V('mx_t', 45), 'MWH §6-10: 30÷120 s'),
        R('mx_G', 'Gradient vận tốc bể trộn', 'G', '1/s', V('mx_G', 700), 'MWH: 600÷1000 1/s'),
        R('mx_eta', 'Hiệu suất truyền động máy khuấy', 'η', '–', 0.8, '', { nf: '0.00' }),
        R('mx_B', 'CHỌN: cạnh bể trộn (vuông)', 'B=L', 'm', V('mx_B', B), 'Có vách chắn chống xoáy', { nf: '0.0' }),
        R('mx_H', 'CHỌN: chiều sâu công tác bể trộn', 'H', 'm', V('mx_H', H), 'MWH Bảng 9-13: H/T ≈ 0,9÷1,1', { nf: '0.0' })]);
      SH.push({ name: 'BeTron', title: 'BỂ TRỘN NHANH CƠ KHÍ (KEO TỤ PAC)', blocks: [
        { sec: 'A. DUNG TÍCH VÀ THỜI GIAN LƯU', rows: [
          R('mx_q', 'Lưu lượng mỗi bể trộn', 'q', 'm³/s', '={Qstr}/{mx_N}', '', { nf: '0.000' }),
          R('mx_Vr', 'Dung tích yêu cầu', 'V_yc', 'm³', '={mx_q}*{mx_t}', ''),
          R('mx_V', 'Dung tích thực tế', 'V', 'm³', '={mx_B}^2*{mx_H}', ''),
          R('mx_tt', 'Thời gian lưu thực tế', 't', 's', '={mx_V}/{mx_q}', ''),
          CK('mx_c1', 'Kiểm tra thời gian lưu', IFR('mx_tt', 30, 120, '30÷120 s')),
          N > 1 ? R('mx_t1', 'Thời gian lưu khi 1 bể dừng (bể còn lại nhận 100 % Q)', 't₁', 's', '={mx_V}/{Qstr}', '') : null,
          N > 1 ? CK('mx_c2', 'Kiểm tra khi 1 bể dừng', IFGE('mx_t1', 20, '≥ 20 s – chấp nhận ngắn hạn')) : null] },
        { sec: 'B. MÁY KHUẤY', rows: [
          R('mx_P', 'Công suất truyền vào nước', 'P', 'W', '={mx_G}^2*{mu}*{mx_V}', 'P = G²·μ·V'),
          R('mx_Ps', 'Công suất trục máy khuấy', 'P_tr', 'kW', '={mx_P}/{mx_eta}/1000', ''),
          R('mx_Pm', 'CHỌN: công suất động cơ', 'P_đc', 'kW', V('mx_Pm', iec(Psh * 1.25)), 'Dãy IEC'),
          CK('mx_c3', 'Kiểm tra dự phòng động cơ', '=IF({mx_Pm}>=1.25*{mx_Ps},"ĐẠT – dự phòng ≥ 25%","XEM LẠI – tăng công suất động cơ")'),
          R('mx_D', 'Đường kính cánh khuấy', 'D', 'm', '=0.45*{mx_B}', 'D/T = 0,45', { nf: '0.00' }),
          R('mx_n', 'CHỌN: tốc độ quay', 'n', 'v/ph', V('mx_n', n), ''),
          R('mx_tip', 'Vận tốc đầu cánh', 'v_t', 'm/s', '=PI()*{mx_D}*{mx_n}/60', '', { nf: '0.00' }),
          CK('mx_c4', 'Kiểm tra vận tốc đầu cánh', IFR('mx_tip', 3, 6, '3,0÷6,0 m/s')),
          R('mx_Gt', 'Gradient vận tốc thực tế', 'G', '1/s', '=SQRT({mx_P}/({mu}*{mx_V}))', ''),
          CK('mx_c5', 'Kiểm tra G', IFR('mx_Gt', 600, 1000, '600÷1000 1/s')),
          R('mx_hl', 'Tổn thất bể trộn → kênh → bể phản ứng', 'h', 'm', V('mx_hl', 0.3), '', { nf: '0.00' }),
          R('mx_Vc', 'Dung tích xây dựng (bảo vệ 0,5 m)', 'V_xd', 'm³', '={mx_N}*{mx_B}^2*({mx_H}+0.5)', ''),
          R('mx_dim', 'Kích thước mỗi bể trộn', '', '', '=TEXT({mx_B},"0.0")&" m × "&TEXT({mx_B},"0.0")&" m × "&TEXT({mx_H}+0.5,"0.0")&" m"', '', { sel: 1 })] }] });
      civ.push(['Bể trộn nhanh', 'mx_Vc', 5]); eqp.push(['Máy khuấy bể trộn nhanh', 'bộ', '={mx_N}', '=13*{mx_Pm}^0.85']);
      kwh.push(['Máy khuấy trộn nhanh', '={mx_N}*{mx_Ps}/{eta_mot}*24']); hl.push(['Bể trộn → kênh → bể phản ứng', 'mx_hl']); dims.push(['Bể trộn nhanh cơ khí', 'mx_N', 'mx_dim']);
    } else {
      const nmx = V('mx_N', Q > 50000 ? 2 : 1), D = Math.max(0.1, up(Math.sqrt(4 * (Qs / nmx) / (Math.PI * 1.8)), 0.05));
      sec('TRỘN TĨNH TRÊN ỐNG (STATIC MIXER)', [
        R('mx_N', 'Số bộ trộn tĩnh (theo số tuyến ống nước thô)', 'n', 'bộ', nmx, ''),
        R('mx_D', 'CHỌN: đường kính ống trộn', 'D', 'm', V('mx_D', D), 'v ≈ 1,5÷2,5 m/s', { nf: '0.00' }),
        R('mx_ne', 'Số phần tử trộn', 'n_e', 'phần tử', V('mx_ne', 4), 'Theo hãng sản xuất'),
        R('mx_K', 'Hệ số tổn thất mỗi phần tử', 'K', '–', V('mx_K', 1.5), 'Theo hãng sản xuất', { nf: '0.0' })]);
      SH.push({ name: 'BeTron', title: 'TRỘN NHANH – BỘ TRỘN TĨNH TRÊN ỐNG', blocks: [{ sec: 'A. THỦY LỰC BỘ TRỘN TĨNH', rows: [
        R('mx_q', 'Lưu lượng mỗi bộ trộn', 'q', 'm³/s', '={Qstr}/{mx_N}', '', { nf: '0.000' }),
        R('mx_v', 'Vận tốc trong ống trộn', 'v', 'm/s', '={mx_q}/(PI()/4*{mx_D}^2)', '', { nf: '0.00' }),
        CK('mx_c1', 'Kiểm tra vận tốc', IFR('mx_v', 1.0, 3.0, '1,0÷3,0 m/s')),
        R('mx_hl', 'Tổn thất qua bộ trộn', 'h', 'm', '={mx_ne}*{mx_K}*{mx_v}^2/(2*{g})', '', { nf: '0.00' }),
        R('mx_Lm', 'Chiều dài bộ trộn (1,5 D / phần tử)', 'L', 'm', '=1.5*{mx_D}*{mx_ne}', '', { nf: '0.00' }),
        R('mx_tt', 'Thời gian lưu trong bộ trộn', 't', 's', '={mx_Lm}/{mx_v}', '', { nf: '0.00' }),
        R('mx_Gt', 'Gradient vận tốc', 'G', '1/s', '=SQRT({rho}*{g}*{mx_hl}/({mu}*{mx_tt}))', ''),
        CK('mx_c2', 'Kiểm tra G', IFR('mx_Gt', 1000, 5000, '1000÷5000 1/s – trộn tĩnh')),
        R('mx_Gtt', 'Chỉ số G·t', 'G·t', '–', '={mx_Gt}*{mx_tt}', ''),
        CK('mx_c3', 'Kiểm tra G·t', IFR('mx_Gtt', 300, 6000, '300÷6000')),
        R('mx_dim', 'Bộ trộn tĩnh', '', '', '=TEXT({mx_N},"0")&" bộ DN"&TEXT({mx_D}*1000,"0")&", "&TEXT({mx_ne},"0")&" phần tử"', '', { sel: 1 })] }] });
      eqp.push(['Bộ trộn tĩnh trên ống', 'bộ', '={mx_N}', '=120*{mx_D}^1.5*10']); hl.push(['Bộ trộn tĩnh', 'mx_hl']); dims.push(['Trộn tĩnh', 'mx_N', 'mx_dim']);
    }

    /* ---------- phản ứng tạo bông ---------- */
    if (needCoag) {
      const daf = ch.clar === 'daf', direct = ch.clar === 'none';
      const NU = CL ? CL.N : 2, W = CL ? CL.W : null, Q1 = Qhtr / NU;
      const tT = daf ? 12 : direct ? 12 : 22, m = daf || direct ? 2 : 3, Hf = CL ? +(CL.H + (daf ? 0 : 0.15)).toFixed(2) : 3.5;
      if (ch.floc === 'mech') {
        const Wf = W || cl(c10(Math.sqrt(Q1 * tT / 60 / Hf / 1.5 * 1.0)), 2, 20);
        let l = c10(tT * Q1 / 60 / (m * Wf * Hf)), Hf2 = Hf;
        if (l < 1) { l = 1; Hf2 = Math.max(2.5, c10(tT * Q1 / 60 / (m * Wf * l))); }   // trạm nhỏ: buồng ngắn nhất 1 m, giảm chiều sâu
        const no = Math.max(1, Math.ceil(Wf / 9 - 1e-9));
        const Gs = daf ? [70, 50] : direct ? [60, 40] : [60, 40, 25];
        const Vc = Wf * l * Hf2 / no, pm = Gs.map(G => iec(G * G * mu * Vc / 0.8 / 1000 * 1.25));
        sec('BỂ PHẢN ỨNG TẠO BÔNG CƠ KHÍ (' + m + ' BUỒNG NỐI TIẾP, G GIẢM DẦN)', [
          R('fl_m', 'Số buồng nối tiếp mỗi đơn nguyên', 'm', 'buồng', m, daf ? 'MWH Bảng 10-9: DAF 2 buồng' : 'Tapered flocculation; TCVN 33:2006 ≥ 3'),
          R('fl_no', 'Số ô khuấy mỗi buồng (chia theo chiều rộng)', 'n_ô', 'ô', V('fl_no', no), ''),
          R('fl_l', 'CHỌN: chiều dài buồng theo dòng chảy', 'l', 'm', V('fl_l', l), '', { nf: '0.0' }),
          R('fl_H', 'CHỌN: chiều sâu công tác bể phản ứng', 'H', 'm', V('fl_H', Hf2), Hf2 < Hf ? 'Nâng đáy bể phản ứng so với bể lắng' : 'Cùng cốt đáy bể lắng', { nf: '0.00' }),
          W ? null : R('fl_W', 'CHỌN: chiều rộng đơn nguyên phản ứng', 'W', 'm', V('fl_W', Wf), '', { nf: '0.0' }),
          W ? null : R('fl_N', 'Số đơn nguyên phản ứng', 'N', 'đn', V('fl_N', NU), ''),
          ...Gs.map((G, i) => R('fl_G' + (i + 1), `Gradient vận tốc buồng ${i + 1}`, `G${'₁₂₃'[i]}`, '1/s', V('fl_G' + (i + 1), G), i ? '' : 'MWH Bảng 9-11 / 10-9')),
          R('fl_v', 'Vận tốc qua cửa thông giữa các buồng', 'v', 'm/s', V('fl_v', 0.25), '0,15÷0,45 m/s – tránh vỡ bông', { nf: '0.00' })]);
        const NUk = W ? 'cl_N' : 'fl_N', Wk = W ? (ch.clar === 'texler' ? 'tx_B' : ch.clar === 'lamella' ? 'lm_B' : ch.clar === 'horiz' ? 'hz_B' : 'df_B') : 'fl_W';
        SH.push({ name: 'TaoBong', title: `BỂ PHẢN ỨNG TẠO BÔNG CƠ KHÍ – ${m} BUỒNG, G GIẢM DẦN`, blocks: [
          { sec: 'A. DUNG TÍCH VÀ THỜI GIAN LƯU', rows: [
            R('fl_NU', 'Số đơn nguyên phản ứng', 'N', 'đn', `={${NUk}}`, W ? 'Đặt liền đầu mỗi bể lắng' : ''),
            R('fl_Q1', 'Lưu lượng mỗi đơn nguyên', 'Q₁', 'm³/h', '={Qhtr}/{fl_NU}', ''),
            R('fl_Wd', 'Chiều rộng đơn nguyên', 'W', 'm', `={${Wk}}`, '', { nf: '0.00' }),
            R('fl_V1', 'Dung tích mỗi buồng', 'V_b', 'm³', '={fl_Wd}*{fl_l}*{fl_H}', ''),
            R('fl_Vc1', 'Dung tích mỗi ô khuấy', 'V_ô', 'm³', '={fl_V1}/{fl_no}', ''),
            R('fl_t', 'Thời gian lưu thực tế', 't', 'min', '={fl_V1}*{fl_m}/{fl_Q1}*60', '', { nf: '0.0' }),
            CK('fl_c1', 'Kiểm tra thời gian lưu', daf ? IFR('fl_t', 10, 20, '10÷20 min – DAF') : direct ? IFR('fl_t', 8, 20, '8÷20 min – lọc trực tiếp') : IFR('fl_t', 15, 30, '15÷30 min'))] },
          { sec: 'B. MÁY KHUẤY', rows: [
            ...Gs.flatMap((G, i) => [R('fl_P' + (i + 1), `Buồng ${i + 1}: công suất trục / ô`, 'P', 'kW', `={fl_G${i + 1}}^2*{mu}*{fl_Vc1}/0.8/1000`, '', { nf: '0.000' }),
              R('fl_M' + (i + 1), `Buồng ${i + 1}: chọn động cơ`, 'P_đc', 'kW', V('fl_M' + (i + 1), pm[i]), 'Dãy IEC', { nf: '0.00' })]),
            CK('fl_c2', 'Kiểm tra dự phòng động cơ (≥ 1,25 × P_trục)', '=IF(AND(' + Gs.map((G, i) => `{fl_M${i + 1}}>=1.25*{fl_P${i + 1}}`).join(',') + '),"ĐẠT","XEM LẠI – tăng động cơ")'),
            R('fl_n', 'Tổng số máy khuấy phản ứng toàn trạm', 'n', 'máy', '={fl_NU}*{fl_m}*{fl_no}', ''),
            R('fl_Gm', 'Gradient vận tốc trung bình', 'G_tb', '1/s', '=(' + Gs.map((G, i) => `{fl_G${i + 1}}`).join('+') + ')/' + m, ''),
            R('fl_Camp', 'Chỉ số Camp', 'G·t', '–', '={fl_Gm}*{fl_t}*60', ''),
            CK('fl_c3', 'Kiểm tra chỉ số Camp', daf || direct ? IFR('fl_Camp', 25000, 100000, '25000÷100000') : IFR('fl_Camp', 30000, 150000, '30000÷150000')),
            R('fl_hl', 'Tổn thất áp qua bể phản ứng', 'h', 'm', '={fl_m}*1.5*{fl_v}^2/(2*{g})+0.25', 'Cửa thông + tường lỗ phân phối vào bể lắng', { nf: '0.000' }),
            R('fl_Vc', 'Dung tích xây dựng (bảo vệ 0,5 m)', 'V_xd', 'm³', '={fl_NU}*{fl_Wd}*{fl_l}*{fl_m}*({fl_H}+0.5)', ''),
            R('fl_dim', 'Kích thước 1 đơn nguyên', '', '', '=TEXT({fl_Wd},"0.00")&" m × "&TEXT({fl_l}*{fl_m},"0.00")&" m × "&TEXT({fl_H}+0.5,"0.00")&" m"', '', { sel: 1 })] }] });
        civ.push(['Bể phản ứng tạo bông', 'fl_Vc', 5]); eqp.push(['Máy khuấy phản ứng', 'bộ', '={fl_n}', '=60*((' + Gs.map((G, i) => `{fl_M${i + 1}}`).join('+') + ')/' + m + ')^0.6+120']);
        kwh.push(['Máy khuấy phản ứng', '={fl_NU}*{fl_no}*(' + Gs.map((G, i) => `{fl_P${i + 1}}`).join('+') + ')/{eta_mot}*24']);
        hl.push(['Qua bể phản ứng + tường lỗ', 'fl_hl']); dims.push(['Bể phản ứng cơ khí', 'fl_NU', 'fl_dim']);
        keyRes.push(['Phản ứng – thời gian lưu', 'fl_t', 'min'], ['Phản ứng – chỉ số Camp', 'fl_Camp', '–']);
      } else {
        // vận tốc hành lang chọn để bề rộng hành lang đoạn 1 ≈ 0,6 m (không nhỏ hơn 0,45 m để vệ sinh)
        const Q1s = Q1 / 3600, Hh = cl(c10(Q1s / (0.6 * 0.15)), 1.5, Hf), v1 = cl(+(Q1s / (0.55 * Hh)).toFixed(2), 0.08, 0.3);
        const Wf = W || 4, vs = [v1, +(v1 * 0.75).toFixed(2), +(v1 * 0.55).toFixed(2)], Gs = [50, 35, 20];
        sec('BỂ PHẢN ỨNG THỦY LỰC VÁCH NGĂN (MWH Bảng 9-15)', [
          R('fl_t0', 'Thời gian lưu thiết kế', 't', 'min', V('fl_t0', Math.max(20, tT)), 'MWH: ≥ 20 min'),
          R('fl_H', 'Chiều sâu công tác', 'H', 'm', V('fl_H', Hh), Hh < Hf ? 'Nâng đáy bể phản ứng so với bể lắng' : '', { nf: '0.00' }),
          W ? null : R('fl_N', 'Số đơn nguyên phản ứng', 'N', 'đn', V('fl_N', NU), ''),
          ...vs.map((v, i) => R('fl_v' + (i + 1), `Vận tốc trong hành lang – đoạn ${i + 1}`, 'v', 'm/s', V('fl_v' + (i + 1), v), i ? '' : 'MWH: 0,15÷0,45 m/s (trạm nhỏ 0,1÷0,3), giảm dần', { nf: '0.00' })),
          R('fl_k', 'Hệ số tổn thất mỗi chỗ ngoặt 180°', 'k', '–', V('fl_k', 3.2), 'MWH §9-…: 3,2', { nf: '0.0' })]);
        const NUk = W ? 'cl_N' : 'fl_N';
        SH.push({ name: 'TaoBong', title: 'BỂ PHẢN ỨNG THỦY LỰC VÁCH NGĂN NGANG (ZÍCH-ZẮC) – 3 ĐOẠN', blocks: [{ sec: 'A. CÁC ĐOẠN HÀNH LANG', rows: [
          R('fl_NU', 'Số đơn nguyên phản ứng', 'N', 'đn', `={${NUk}}`, ''),
          R('fl_Q1', 'Lưu lượng mỗi đơn nguyên', 'Q₁', 'm³/s', '={Qstr}/{fl_NU}', '', { nf: '0.000' }),
          ...vs.flatMap((v, i) => [
            R('fl_w' + (i + 1), `Đoạn ${i + 1}: bề rộng hành lang`, 'b', 'm', `={fl_Q1}/({fl_v${i + 1}}*{fl_H})`, '', { nf: '0.00' }),
            R('fl_nt' + (i + 1), `Đoạn ${i + 1}: số chỗ ngoặt`, 'n', 'chỗ', `=MAX(2,ROUNDUP({mu}*${Gs[i]}^2*{fl_t0}*60/3/({rho}*{g})/({fl_k}*{fl_v${i + 1}}^2/(2*{g})),0))`, `Theo G ≈ ${Gs[i]} 1/s`),
            R('fl_h' + (i + 1), `Đoạn ${i + 1}: tổn thất`, 'h', 'm', `={fl_nt${i + 1}}*{fl_k}*{fl_v${i + 1}}^2/(2*{g})`, '', { nf: '0.000' }),
            R('fl_G' + (i + 1), `Đoạn ${i + 1}: gradient vận tốc`, 'G', '1/s', `=SQRT({rho}*{g}*{fl_h${i + 1}}/({mu}*{fl_t0}*60/3))`, '')]),
          CK('fl_c1', 'Kiểm tra bề rộng hành lang nhỏ nhất', '=IF(MIN({fl_w1},{fl_w2},{fl_w3})>=0.45,"ĐẠT  (≥ 0,45 m – vệ sinh)","XEM LẠI – tăng chiều sâu hoặc giảm vận tốc")'),
          R('fl_Gm', 'Gradient vận tốc trung bình', 'G_tb', '1/s', '=({fl_G1}+{fl_G2}+{fl_G3})/3', ''),
          CK('fl_c2', 'Kiểm tra G trung bình', IFR('fl_Gm', 20, 60, '20÷60 1/s')),
          R('fl_Camp', 'Chỉ số Camp', 'G·t', '–', '={fl_Gm}*{fl_t0}*60', ''),
          CK('fl_c3', 'Kiểm tra chỉ số Camp', IFR('fl_Camp', 30000, 150000, '30000÷150000')),
          R('fl_hl', 'Tổn thất áp qua bể phản ứng', 'h', 'm', '={fl_h1}+{fl_h2}+{fl_h3}+0.1', '', { nf: '0.000' }),
          R('fl_V', 'Dung tích mỗi đơn nguyên', 'V', 'm³', '={fl_Q1}*{fl_t0}*60', ''),
          R('fl_Vc', 'Dung tích xây dựng (bảo vệ 0,5 m)', 'V_xd', 'm³', '={fl_NU}*{fl_V}*({fl_H}+0.5)/{fl_H}', ''),
          R('fl_dim', 'Mỗi đơn nguyên', '', '', '=TEXT({fl_V},"#,##0")&" m³; hành lang "&TEXT({fl_w1},"0.00")&" / "&TEXT({fl_w2},"0.00")&" / "&TEXT({fl_w3},"0.00")&" m"', '', { sel: 1 })] }] });
        civ.push(['Bể phản ứng thủy lực', 'fl_Vc', 4.5]); hl.push(['Qua bể phản ứng thủy lực', 'fl_hl']); dims.push(['Bể phản ứng vách ngăn', 'fl_NU', 'fl_dim']);
        keyRes.push(['Phản ứng – G trung bình', 'fl_Gm', '1/s']);
      }
    }
    if (CL) hl.push(['Qua công trình lắng / tuyển nổi', 'cl_hl']);

    /* ---------- bể lọc ---------- */
    const QhF = Qhtr - (CL ? Vsl0 / tlv : 0);
    let FIL = { bw: true };
    const fsec = (t, rows) => sec(t, rows);
    if (ch.filt === 'xa') {
      const b = sizeXA({ QhF, Qtk }) || { N: 4, A: 2.4, E: 3, len: 0.966, A1: 4.6, v: 5 };
      fsec('BỂ LỌC LEOPOLD – ĐAN TYPE XA + IMS 200 – CÁT THÔ 1 LỚP', [
        R('f_N', 'Số bể lọc', 'N', 'bể', V('f_N', b.N), ''),
        R('f_nc', 'Số ngăn mỗi bể (2 bên máng H-gullet)', 'n_c', 'ngăn', 2, ''),
        R('xa_A', 'CHỌN: chiều dài lateral (= chiều rộng 1 ngăn)', 'A', 'm', V('xa_A', b.A), 'P9.016: ≤ 9,8 m', { nf: '0.0' }),
        R('xa_D', 'Khoảng cách tâm lateral Type XA', 'D', 'm', 0.308, 'Submittal XA Leopold', { nf: '0.000' }),
        R('xa_c', 'Khoảng tường – tâm lateral đầu/cuối dãy', 'c', 'm', 0.175, 'Submittal XA', { nf: '0.000' }),
        R('xa_E', 'CHỌN: số lateral mỗi ngăn', 'E', 'lateral', V('xa_E', b.E), ''),
        R('f_hd', 'Chiều cao đan XA kể cả vữa + IMS 200', 'h_đ', 'm', 0.266, '241 mm + IMS 200 ≈ 25 mm', { nf: '0.000' }),
        R('f_L', 'Chiều dày lớp cát thạch anh', 'L', 'm', V('f_L', 1.3), 'Lọc cát thô 1 lớp sâu', { nf: '0.00' }),
        R('f_d10', 'Cỡ hạt hiệu quả cát', 'd₁₀', 'mm', V('f_d10', 0.9), '0,85÷0,95 mm; P9.014 ES ≥ 0,45', { nf: '0.00' }),
        R('f_UC', 'Hệ số đồng nhất', 'UC', '–', V('f_UC', 1.4), '< 1,4', { nf: '0.00' }),
        R('f_d90', 'Cỡ hạt d₉₀ của cát', 'd₉₀', 'mm', V('f_d90', 1.5), '', { nf: '0.00' }),
        R('f_eps', 'Độ rỗng lớp cát', 'ε', '–', 0.42, 'MWH Bảng 11-3', { nf: '0.00' }),
        R('f_psi', 'Hệ số hình dạng hạt cát', 'ψ', '–', 0.8, '', { nf: '0.00' }),
        R('f_rs', 'Khối lượng riêng cát', 'ρ_s', 'kg/m³', 2650, ''),
        R('f_hu', 'Tổn thất qua đan XA + IMS khi lọc', 'h_u', 'm', 0.05, 'Biểu đồ XA Headloss', { nf: '0.00' }),
        R('f_Hav', 'Cột nước lọc khả dụng (MN max → ngưỡng tràn sau lọc)', 'H_kd', 'm', V('f_Hav', 2.6), '', { nf: '0.00' }),
        R('f_ho', 'Tổn thất ống, van, đồng hồ, van điều chỉnh khi lọc', 'h_o', 'm', V('f_ho', 0.6), '', { nf: '0.00' }),
        R('f_T', 'Chu kỳ lọc', 'T', 'h', V('f_T', Math.max(30, Math.ceil(205 / b.v))), 'MWH: 24÷96 h; UFRV ≥ 200 m³/m²'),
        R('xa_bg', 'CHỌN: chiều rộng máng H-gullet', 'b_g', 'm', V('xa_bg', Math.max(0.6, c10(Math.sqrt(30 * b.A1 / 3600 / 0.72)))), '', { nf: '0.0' })]);
      SH.push({ name: 'BeLoc', title: 'BỂ LỌC NHANH TRỌNG LỰC LEOPOLD – ĐAN TYPE XA + IMS 200 – CÁT THÔ 1 LỚP', blocks: [
        { sec: 'A. DIỆN TÍCH VÀ VẬN TỐC LỌC', rows: [
          R('f_Q', 'Lưu lượng vào bể lọc', 'Q', 'm³/h', '={QhF}', ''),
          R('f_len', 'Chiều dài 1 ngăn dọc máng H-gullet', 'l', 'm', '=2*{xa_c}+({xa_E}-1)*{xa_D}', '', { nf: '0.000' }),
          R('f_A1', 'Diện tích 1 bể lọc', 'F₁', 'm²', '={f_nc}*{xa_A}*{f_len}', ''),
          R('f_At', 'Tổng diện tích lọc', 'F', 'm²', '={f_A1}*{f_N}', ''),
          R('f_v', 'Vận tốc lọc khi tất cả bể làm việc', 'v', 'm/h', '={f_Q}/{f_At}', ''),
          R('f_v1', 'Vận tốc lọc khi 1 bể ngừng để rửa', 'v₁', 'm/h', '={f_Q}/({f_A1}*({f_N}-1))', ''),
          R('f_v2', 'Vận tốc lọc khi 1 bể rửa + 1 bể sửa chữa', 'v₂', 'm/h', '={f_Q}/({f_A1}*MAX(1,{f_N}-2))', ''),
          CK('f_c1', 'Kiểm tra vận tốc lọc bình thường', IFR('f_v', 5, 10, '5÷10 m/h')),
          CK('f_c2', 'Kiểm tra vận tốc lọc tăng cường', '=IF(AND({f_v1}<=12.5,{f_v2}<=12.5),"ĐẠT  (≤ 12,5 m/h)","XEM LẠI")'),
          R('f_Nmin', 'Số bể tối thiểu (Kawamura)', 'N_min', 'bể', '=MAX(2,ROUNDUP(1.2*SQRT({Qtk}/3785.41),0))', 'N = 1,2·√Q (Q – MGD)'),
          CK('f_c3', 'Kiểm tra số bể tối thiểu', '=IF({f_N}>={f_Nmin},"ĐẠT  (N ≥ N_min)","XEM LẠI")'),
          CK('f_c4', 'Kiểm tra chiều dài lateral XA', IFLE('xa_A', 9.8, 'P9.016: ≤ 9,8 m', 'VƯỢT P9'))] },
        { sec: 'B. LỚP VẬT LIỆU LỌC VÀ TỔN THẤT', rows: [
          CK('f_c5', 'Kiểm tra cỡ hạt cho IMS 200', IFGE('f_d10', 0.45, 'P9.014: ES ≥ 0,45 mm', 'XEM LẠI – BU duyệt')),
          R('f_Ld', 'Tỷ số L/d₁₀', 'L/d', '–', '={f_L}*1000/{f_d10}', ''),
          CK('f_c6', 'Kiểm tra tỷ số L/d₁₀', IFGE('f_Ld', 1250, '≥ 1250 – lọc cát thô sâu')),
          R('f_mt', 'Khối lượng cát thạch anh', 'M', 'tấn', '={f_At}*{f_L}*{f_rs}*(1-{f_eps})/1000', ''),
          R('f_h0', 'Tổn thất qua lớp cát sạch', 'h₀', 'm', '=5*{mu}*(1-{f_eps})^2*(6/({f_psi}*{f_d10}/1000))^2*({f_v}/3600)/({rho}*{g}*{f_eps}^3)*{f_L}', 'Kozeny (MWH PT 11-19), k = 5', { nf: '0.000' }),
          R('f_hc', 'Dung lượng tổn thất dành cho cặn', 'H_c', 'm', '={f_Hav}-{f_h0}-{f_hu}-{f_ho}', '', { nf: '0.00' }),
          CK('f_c7', 'Kiểm tra dung lượng chứa cặn', IFGE('f_hc', 1.2, '≥ 1,2 m – chu kỳ ≥ 24 h')),
          R('f_UFRV', 'Thể tích nước lọc riêng (UFRV)', 'UFRV', 'm³/m²', '={f_v}*{f_T}', ''),
          CK('f_c8', 'Kiểm tra UFRV', IFGE('f_UFRV', 200, '≥ 200 m³/m²'))] },
        { sec: 'C. MÁNG H-GULLET, KÍCH THƯỚC', rows: [
          R('xa_Qw', 'Lưu lượng nước rửa 1 bể (q₃)', 'Q_r', 'm³/s', '={bw_q3}*{f_A1}/3600', '', { nf: '0.000' }),
          R('xa_hg', 'Chiều sâu máng dưới sàn', 'h_g', 'm', '=ROUNDUP({xa_Qw}/(0.6*{xa_bg}),1)', '', { nf: '0.0' }),
          R('xa_vg', 'Vận tốc nước rửa trong máng', 'v_g', 'm/s', '={xa_Qw}/({xa_bg}*{xa_hg})', '', { nf: '0.00' }),
          CK('f_c9', 'Kiểm tra vận tốc trong máng H-gullet', IFLE('xa_vg', 0.65, '≤ 0,65 m/s')),
          R('f_hl', 'Tổn thất qua bể lọc (cột nước lọc khả dụng)', 'H', 'm', '={f_Hav}', '', { nf: '0.00' }),
          R('f_Hb', 'Chiều cao xây dựng bể lọc', 'H_xd', 'm', '={f_Hav}+{f_L}+1.5+{f_hd}+{xa_hg}+0.5+0.6', '', { nf: '0.00' }),
          R('f_Vc', 'Dung tích xây dựng bể lọc', 'V_xd', 'm³', '={f_N}*(2*{xa_A}+{xa_bg})*{f_len}*{f_Hb}', ''),
          R('f_dim', 'Kích thước mỗi bể lọc', '', '', '=TEXT(2*{xa_A}+{xa_bg},"0.00")&" m × "&TEXT({f_len},"0.000")&" m × "&TEXT({f_Hb},"0.00")&" m"', '', { sel: 1 })] }] });
      eqp.push(['Đan lọc Leopold Type XA + IMS 200', 'm² lọc', '={f_At}', 20], ['Cát thạch anh lọc', 'tấn', '={f_mt}', 3]);
    } else if (ch.filt === 'rgf' || ch.filt === 'dual' || ch.filt === 'press') {
      const dual = ch.filt === 'dual', press = ch.filt === 'press';
      const vT = press ? 8 : dual ? 9.5 : 7, Nmin = Math.max(2, Math.ceil(1.2 * Math.sqrt(Qtk / 3785.41) - 1e-9));
      let N, A1, B, L, Dv;
      if (press) {
        Dv = [3.6, 3.2, 3.0, 2.8, 2.5, 2.2, 2.0, 1.8, 1.6].find(D => QhF / (vT * Math.PI * D * D / 4) >= 3) || 1.6;
        N = Math.max(3, Math.ceil(QhF / (vT * Math.PI * Dv * Dv / 4) - 1e-9));
        if (QhF / ((N - 1) * Math.PI * Dv * Dv / 4) > 12) N++;
      } else {
        N = even(Math.max(Nmin, Math.ceil(QhF / vT / 100 - 1e-9), 2));
        while (QhF / ((N - 1) * QhF / vT / N) > (dual ? 15 : 10) && N < 60) N++;
        A1 = QhF / vT / N; const nc = A1 > 40 ? 2 : 1; B = cl(c10(Math.sqrt(A1 / nc / 2)), 1.5, 6); L = c10(A1 / (nc * B));
        FIL.nc = nc;
      }
      const mlab = dual ? 'BỂ LỌC NHANH 2 LỚP – THAN ANTRAXIT + CÁT' : press ? 'BỂ LỌC ÁP LỰC (BÌNH THÉP)' : 'BỂ LỌC NHANH TRỌNG LỰC – CÁT THẠCH ANH 1 LỚP – SÀN CHỤP LỌC';
      fsec(mlab, [
        R('f_N', press ? 'Số bình lọc áp lực' : 'Số bể lọc', 'N', press ? 'bình' : 'bể', V('f_N', N), press ? 'CLAUDE §10: lọc áp lực chỉ đáng khi Q < ~5.000 m³/ngđ' : ''),
        press ? R('f_Dv', 'CHỌN: đường kính bình lọc', 'D', 'm', V('f_Dv', Dv), 'Bình đứng, áp lực làm việc 6 bar', { nf: '0.0' }) : R('f_nc', 'Số ngăn mỗi bể', 'n_c', 'ngăn', V('f_nc', FIL.nc), FIL.nc > 1 ? '2 ngăn hai bên máng trung tâm' : 'Máng thu nước rửa một bên'),
        press ? null : R('f_B', 'CHỌN: chiều rộng 1 ngăn', 'b', 'm', V('f_B', B), 'Khoảng cách tới máng ≤ 6 m', { nf: '0.0' }),
        press ? null : R('f_Lc', 'CHỌN: chiều dài 1 ngăn', 'l', 'm', V('f_Lc', L), '', { nf: '0.0' }),
        dual ? R('f_L1', 'Chiều dày lớp than antraxit', 'L₁', 'm', V('f_L1', 0.5), 'MWH Bảng 11-11: 0,4÷0,6 m', { nf: '0.00' }) : null,
        dual ? R('f_d1', 'Cỡ hạt hiệu quả than antraxit', 'd₁', 'mm', V('f_d1', 1.0), '0,9÷1,1 mm', { nf: '0.00' }) : null,
        dual ? R('f_r1', 'Khối lượng riêng than antraxit', 'ρ₁', 'kg/m³', V('f_r1', 1450), '') : null,
        R('f_L', dual ? 'Chiều dày lớp cát thạch anh' : 'Chiều dày lớp cát thạch anh', 'L', 'm', V('f_L', dual ? 0.3 : press ? 1.0 : 1.0), dual ? '0,25÷0,3 m' : 'TCXDVN 33:2006 / MWH 0,6÷1,8 m', { nf: '0.00' }),
        R('f_d10', 'Cỡ hạt hiệu quả cát', 'd₁₀', 'mm', V('f_d10', dual ? 0.5 : 0.7), dual ? '0,45÷0,55 mm' : '0,6÷0,8 mm', { nf: '0.00' }),
        R('f_UC', 'Hệ số đồng nhất', 'UC', '–', V('f_UC', 1.4), '≤ 1,4÷1,5', { nf: '0.00' }),
        R('f_d90', 'Cỡ hạt d₉₀ của cát', 'd₉₀', 'mm', V('f_d90', dual ? 0.8 : 1.1), '', { nf: '0.00' }),
        R('f_eps', 'Độ rỗng lớp vật liệu lọc', 'ε', '–', 0.42, 'MWH Bảng 11-3', { nf: '0.00' }),
        R('f_psi', 'Hệ số hình dạng hạt', 'ψ', '–', 0.8, '', { nf: '0.00' }),
        R('f_rs', 'Khối lượng riêng cát', 'ρ_s', 'kg/m³', 2650, ''),
        R('f_hu', press ? 'Tổn thất qua hệ thu nước đáy bình khi lọc' : 'Tổn thất qua sàn chụp lọc khi lọc', 'h_u', 'm', V('f_hu', 0.15), '', { nf: '0.00' }),
        R('f_Hav', press ? 'Tổn thất cho phép cuối chu kỳ (chênh áp)' : 'Cột nước lọc khả dụng (MN max → ngưỡng tràn sau lọc)', 'H_kd', 'm', V('f_Hav', press ? 4 : 2.5), press ? 'Rửa khi Δp ≈ 0,4 bar' : '', { nf: '0.00' }),
        R('f_ho', 'Tổn thất ống, van, đồng hồ khi lọc', 'h_o', 'm', V('f_ho', 0.5), '', { nf: '0.00' }),
        R('f_T', 'Chu kỳ lọc', 'T', 'h', V('f_T', press ? 24 : 30), 'MWH: 24÷96 h'),
        R('f_nz', press ? 'Mật độ chụp lọc đáy bình' : 'Mật độ chụp lọc', 'n_ch', 'chụp/m²', V('f_nz', 50), 'TCXDVN 33:2006: 35÷50 chụp/m²')]);
      const Ak = press ? '=PI()/4*{f_Dv}^2' : '={f_nc}*{f_B}*{f_Lc}';
      const vNorm = dual ? IFR('f_v', 7.5, 12, '7,5÷12 m/h – 2 lớp') : press ? IFR('f_v', 5, 10, '5÷10 m/h') : IFR('f_v', 5, 8.5, '5÷8,5 m/h – cát 1 lớp');
      const vMax = dual ? 15 : press ? 12 : 10;
      SH.push({ name: press ? 'BeLoc_ApLuc' : 'BeLoc', title: mlab, blocks: [
        { sec: 'A. DIỆN TÍCH VÀ VẬN TỐC LỌC', rows: [
          R('f_Q', 'Lưu lượng vào bể lọc', 'Q', 'm³/h', '={QhF}', ''),
          R('f_A1', press ? 'Diện tích 1 bình lọc' : 'Diện tích 1 bể lọc', 'F₁', 'm²', Ak, ''),
          R('f_At', 'Tổng diện tích lọc', 'F', 'm²', '={f_A1}*{f_N}', ''),
          R('f_v', 'Vận tốc lọc khi tất cả bể làm việc', 'v', 'm/h', '={f_Q}/{f_At}', ''),
          R('f_v1', 'Vận tốc lọc khi 1 bể ngừng để rửa', 'v₁', 'm/h', '={f_Q}/({f_A1}*({f_N}-1))', ''),
          CK('f_c1', 'Kiểm tra vận tốc lọc bình thường', vNorm),
          CK('f_c2', 'Kiểm tra vận tốc lọc tăng cường', IFLE('f_v1', vMax, '≤ ' + vMax + ' m/h khi 1 bể rửa')),
          R('f_Nmin', 'Số bể tối thiểu (Kawamura; ≥ 2)', 'N_min', 'bể', '=MAX(2,ROUNDUP(1.2*SQRT({Qtk}/3785.41),0))', 'N = 1,2·√Q (Q – MGD)'),
          CK('f_c3', 'Kiểm tra số bể tối thiểu', '=IF({f_N}>={f_Nmin},"ĐẠT  (N ≥ N_min)","XEM LẠI")'),
          press ? CK('f_c10', 'Phạm vi áp dụng lọc áp lực', '=IF({Q}<=5000,"ĐẠT  (Q ≤ 5.000 m³/ngđ)","XEM LẠI  (lọc áp lực chỉ kinh tế khi Q < ~5.000 m³/ngđ – CLAUDE §10)")') : null] },
        { sec: 'B. LỚP VẬT LIỆU LỌC VÀ TỔN THẤT', rows: [
          R('f_Ld', dual ? 'Tỷ số ΣL/d (than + cát)' : 'Tỷ số L/d₁₀', 'L/d', '–', dual ? '={f_L1}*1000/{f_d1}+{f_L}*1000/{f_d10}' : '={f_L}*1000/{f_d10}', ''),
          CK('f_c6', 'Kiểm tra tỷ số L/d', IFGE('f_Ld', 1000, '≥ 1000 – MWH')),
          R('f_mt', 'Khối lượng cát thạch anh', 'M', 'tấn', '={f_At}*{f_L}*{f_rs}*(1-{f_eps})/1000', ''),
          dual ? R('f_mt1', 'Khối lượng than antraxit', 'M₁', 'tấn', '={f_At}*{f_L1}*{f_r1}*(1-0.5)/1000', 'Độ rỗng than 0,5') : null,
          R('f_h0', 'Tổn thất qua lớp vật liệu sạch', 'h₀', 'm', '=5*{mu}*(1-{f_eps})^2*(6/({f_psi}*{f_d10}/1000))^2*({f_v}/3600)/({rho}*{g}*{f_eps}^3)*{f_L}' + (dual ? '+5*{mu}*(1-0.5)^2*(6/(0.7*{f_d1}/1000))^2*({f_v}/3600)/({rho}*{g}*0.5^3)*{f_L1}' : ''), 'Kozeny (MWH PT 11-19), k = 5', { nf: '0.000' }),
          R('f_hc', 'Dung lượng tổn thất dành cho cặn', 'H_c', 'm', '={f_Hav}-{f_h0}-{f_hu}-' + (press ? '0' : '{f_ho}'), '', { nf: '0.00' }),
          CK('f_c7', 'Kiểm tra dung lượng chứa cặn', IFGE('f_hc', press ? 2.5 : 1.2, press ? '≥ 2,5 m chênh áp cho cặn' : '≥ 1,2 m – chu kỳ ≥ 24 h')),
          R('f_UFRV', 'Thể tích nước lọc riêng (UFRV)', 'UFRV', 'm³/m²', '={f_v}*{f_T}', ''),
          CK('f_c8', 'Kiểm tra UFRV', IFGE('f_UFRV', 150, '≥ 150 m³/m²'))] },
        { sec: 'C. ' + (press ? 'BÌNH LỌC' : 'SÀN CHỤP LỌC') + ', KÍCH THƯỚC', rows: [
          R('f_nzt', 'Tổng số chụp lọc', 'n', 'chụp', '=ROUNDUP({f_At}*{f_nz},0)', ''),
          press ? null : R('f_Hb', 'Chiều cao xây dựng bể lọc', 'H_xd', 'm', '=0.8+0.1+{f_L}' + (dual ? '+{f_L1}' : '') + '+{f_Hav}+0.6+0.5', 'Sàn 0,8 m + đan 0,1 + VLL + nước + mép tràn + bảo vệ', { nf: '0.00' }),
          press ? R('f_Hs', 'Chiều cao thân bình', 'H_b', 'm', '=0.5+{f_L}+0.6*{f_L}+0.5', 'Đáy + VLL + khoảng giãn nở + đỉnh', { nf: '0.00' }) : null,
          R('f_hl', press ? 'Tổn thất qua bình lọc (cuối chu kỳ)' : 'Tổn thất qua bể lọc (cột nước lọc khả dụng)', 'H', 'm', '={f_Hav}' + (press ? '+{f_ho}' : ''), '', { nf: '0.00' }),
          press ? R('f_Vc', 'Thể tích bình thép (tham khảo)', 'V', 'm³', '={f_N}*{f_A1}*{f_Hs}', '') : R('f_Vc', 'Dung tích xây dựng bể lọc', 'V_xd', 'm³', '={f_N}*({f_A1}*1.15)*{f_Hb}', 'Kể máng thu nước rửa ≈ 15 %'),
          R('f_dim', press ? 'Kích thước mỗi bình lọc' : 'Kích thước mỗi bể lọc', '', '', press ? '="D = "&TEXT({f_Dv},"0.0")&" m; H thân "&TEXT({f_Hs},"0.0")&" m"' : '=TEXT({f_nc},"0")&" ngăn × "&TEXT({f_B},"0.0")&" m × "&TEXT({f_Lc},"0.0")&" m; H = "&TEXT({f_Hb},"0.0")&" m"', '', { sel: 1 })] }] });
      if (press) { eqp.push(['Bình lọc áp lực thép + VLL + van', 'bình', '={f_N}', '=180*{f_Dv}^1.6']); kwh.push(['Bơm trung gian cấp vào lọc áp lực', '={rho}*{g}/(3.6*10^6)*{Qtk}*({f_hl}+3+4)/(0.75*{eta_mot})']); notes.push('Lọc áp lực: dây chuyền cắt làm hai cấp bơm (bơm trung gian) – tốn điện hơn lọc trọng lực (CLAUDE §10); không tự rửa kiểu xi phông; bố trí đo độ đục sau từng bình (GLUMRB).'); }
      else { eqp.push(['Sàn chụp lọc + chụp lọc', 'm² lọc', '={f_At}', 4.5], ['Vật liệu lọc (cát' + (dual ? ' + than antraxit' : '') + ')', 'm³', dual ? '={f_At}*({f_L}+{f_L1})' : '={f_At}*{f_L}', dual ? 5.5 : 3.5], ['Van điều khiển điện bể lọc', 'cái', '=6*{f_N}', '=25+0.12*{f_A1}*{f_v}']); }
    } else if (ch.filt === 'uf') {
      FIL.bw = false;
      const J = 60, Am = 77, A = QhF * 1000 / (J * muT(20) / mu), nm = Math.ceil(A / Am), nt = Math.max(2, Math.ceil(nm / 120 - 1e-9));
      fsec('MÀNG SIÊU LỌC UF – ÁP LỰC (MWH Bảng 12-10)', [
        R('uf_J', 'Thông lượng thiết kế ở 20 °C', 'J₂₀', 'L/m²·h', V('uf_J', J), 'MWH: áp lực 30÷170; nước mặt sau lắng 50÷80'),
        R('uf_Am', 'Diện tích màng mỗi module', 'A_m', 'm²', V('uf_Am', Am), 'Module 8 in – theo hãng'),
        R('f_N', 'Số dàn (train) UF', 'N', 'dàn', V('f_N', nt), '≥ 2 dàn; 1 dàn rửa ngược / CIP'),
        R('uf_rec', 'Hiệu suất thu hồi', 'Y', '–', V('uf_rec', 0.95), 'MWH: > 95 %', { nf: '0.00' }),
        R('uf_TMP', 'Áp lực xuyên màng trung bình', 'TMP', 'bar', V('uf_TMP', 0.6), 'MWH: 0,4÷1,0 bar', { nf: '0.00' }),
        R('uf_life', 'Tuổi thọ màng', 't_m', 'năm', V('uf_life', 7), 'MWH: 5÷10 năm'),
        R('uf_bw', 'Thông lượng rửa ngược / thông lượng lọc', 'k_bw', '–', V('uf_bw', 2), 'Rửa ngược 30÷60 s mỗi 30÷60 min', { nf: '0.0' }),
        R('uf_tbw', 'Chu kỳ rửa ngược', 't_bw', 'min', V('uf_tbw', 40), '')]);
      SH.push({ name: 'LocMang_UF', title: 'MÀNG SIÊU LỌC UF ÁP LỰC (THAY BỂ LỌC NHANH)', blocks: [
        { sec: 'A. DIỆN TÍCH MÀNG, SỐ MODULE', rows: [
          R('f_Q', 'Lưu lượng vào hệ UF', 'Q', 'm³/h', '={QhF}', ''),
          R('uf_JT', 'Thông lượng hiệu chỉnh theo nhiệt độ', 'J_T', 'L/m²·h', '={uf_J}*{mu}/0.001002', 'J_T = J₂₀·μ₂₀/μ_T (ghi chú: μ₂₀ = 0,001002)'),
          R('uf_A', 'Diện tích màng yêu cầu', 'A', 'm²', '={f_Q}*1000/{uf_JT}', ''),
          R('uf_nm', 'Số module yêu cầu', 'n_m', 'module', '=ROUNDUP({uf_A}/{uf_Am},0)', ''),
          R('uf_npt', 'Số module mỗi dàn', 'n_d', 'module', '=ROUNDUP({uf_nm}/{f_N},0)', ''),
          R('uf_Jr', 'Thông lượng thực tế', 'J', 'L/m²·h', '={f_Q}*1000/({uf_npt}*{f_N}*{uf_Am})', ''),
          CK('uf_c1', 'Kiểm tra thông lượng', IFR('uf_Jr', 30, 100, '30÷100 L/m²·h')),
          R('uf_J1', 'Thông lượng khi 1 dàn rửa / CIP', 'J₁', 'L/m²·h', '={f_Q}*1000/({uf_npt}*({f_N}-1)*{uf_Am})', ''),
          CK('uf_c2', 'Kiểm tra khi 1 dàn ngừng', IFLE('uf_J1', 120, '≤ 120 L/m²·h ngắn hạn')),
          CK('uf_c3', 'Kiểm tra áp lực xuyên màng', IFR('uf_TMP', 0.2, 1.0, '0,2÷1,0 bar')),
          CK('uf_c4', 'Kiểm tra hiệu suất thu hồi', IFGE('uf_rec', 0.9, '≥ 90 %'))] },
        { sec: 'B. RỬA NGƯỢC, ĐIỆN NĂNG, KÍCH THƯỚC', rows: [
          R('bw_Vd', 'Nước rửa ngược + xả đáy trong 1 ngày', 'V_rl', 'm³/ngđ', '={f_Q}*24*(1-{uf_rec})', 'Đưa về bể thu hồi'),
          R('uf_Hp', 'Cột áp bơm cấp màng', 'H', 'm', '={uf_TMP}*10.2+15', 'TMP + tổn thất ống, lọc chắn rác 200 µm'),
          R('bw_kWh', 'Điện năng bơm cấp màng + rửa ngược + CEB', 'E', 'kWh/ngđ', '={rho}*{g}/(3.6*10^6)*{f_Q}*24*{uf_Hp}/(0.75*{eta_mot})*1.15', ''),
          R('f_hl', 'Tổn thất qua UF (bơm cấp riêng)', 'H', 'm', 0, 'Bơm trung gian – cao trình cắt tại bể chứa nước lắng', { nf: '0.00' }),
          R('f_At', 'Tổng diện tích màng lắp đặt', 'A', 'm²', '={uf_npt}*{f_N}*{uf_Am}', ''),
          R('f_Vc', 'Bể chứa nước lắng + bể chứa nước rửa ngược', 'V_xd', 'm³', '={f_Q}*0.75', '45 min lưu'),
          R('f_dim', 'Hệ UF', '', '', '=TEXT({f_N},"0")&" dàn × "&TEXT({uf_npt},"0")&" module × "&TEXT({uf_Am},"0")&" m²"', '', { sel: 1 })] }] });
      eqp.push(['Hệ UF (module, khung, bơm, CIP, CEB, lọc chắn rác)', 'm³/ngđ', '={Qtk}', '=4.5*({Qtk}/10000)^(-0.15)']);
      kwh.push(['UF – bơm cấp màng, rửa ngược, CEB', '={bw_kWh}']);
      notes.push('UF: chi phí thay màng tính theo tuổi thọ màng; cần bể nước lắng làm bể hút bơm cấp màng.');
    } else if (ch.filt === 'slow') {
      FIL.bw = false;
      const v = 0.15, A = QhF / v, N = Math.max(3, Math.ceil(A / 2500 - 1e-9));
      fsec('BỂ LỌC CHẬM CÁT', [
        R('f_N', 'Số bể lọc chậm', 'N', 'bể', V('f_N', N), '≥ 3 (1 bể cào cát)'),
        R('f_vs', 'Vận tốc lọc thiết kế', 'v', 'm/h', V('f_vs', v), 'MWH: 0,08÷0,25 m/h', { nf: '0.00' }),
        R('f_L', 'Chiều dày lớp cát', 'L', 'm', V('f_L', 1.0), '0,9÷1,2 m', { nf: '0.00' }),
        R('f_d10', 'Cỡ hạt hiệu quả cát', 'd₁₀', 'mm', V('f_d10', 0.25), '0,15÷0,35 mm', { nf: '0.00' }),
        R('f_Hav', 'Chiều sâu lớp nước trên cát', 'H_n', 'm', V('f_Hav', 1.2), '1,0÷1,5 m', { nf: '0.00' }),
        R('f_T', 'Chu kỳ cào cát', 'T', 'ngày', V('f_T', 45), '30÷60 ngày')]);
      SH.push({ name: 'BeLoc_Cham', title: 'BỂ LỌC CHẬM CÁT', blocks: [{ sec: 'A. DIỆN TÍCH VÀ VẬN TỐC', rows: [
        R('f_Q', 'Lưu lượng vào bể lọc', 'Q', 'm³/h', '={QhF}', ''),
        R('f_At', 'Tổng diện tích lọc', 'F', 'm²', '={f_Q}/{f_vs}', ''),
        R('f_A1', 'Diện tích 1 bể lọc', 'F₁', 'm²', '={f_At}/{f_N}', ''),
        R('f_v', 'Vận tốc lọc khi tất cả bể làm việc', 'v', 'm/h', '={f_Q}/{f_At}', '', { nf: '0.000' }),
        R('f_v1', 'Vận tốc lọc khi 1 bể cào cát', 'v₁', 'm/h', '={f_Q}/({f_A1}*({f_N}-1))', '', { nf: '0.000' }),
        CK('f_c1', 'Kiểm tra vận tốc lọc', IFR('f_v', 0.08, 0.25, '0,08÷0,25 m/h')),
        CK('f_c2', 'Kiểm tra khi 1 bể cào cát', IFLE('f_v1', 0.3, '≤ 0,3 m/h')),
        CK('f_c3', 'Phạm vi áp dụng (độ đục nước vào)', '=IF({NTU}<=10,"ĐẠT  (≤ 10 NTU)","XEM LẠI  (lọc chậm cần nước vào ≤ 10 NTU – thêm lắng / lọc thô)")'),
        R('bw_Vd', 'Nước rửa cát cào (quy đổi / ngày)', 'V_rl', 'm³/ngđ', '={f_At}*0.03*3/{f_T}', 'Cào 3 cm, rửa 3 m³/m³ cát'),
        R('bw_kWh', 'Điện năng rửa cát', 'E', 'kWh/ngđ', '={bw_Vd}*0.5', ''),
        R('f_mt', 'Khối lượng cát', 'M', 'tấn', '={f_At}*{f_L}*1.6', ''),
        R('f_hl', 'Tổn thất qua bể lọc chậm', 'H', 'm', '={f_Hav}', '', { nf: '0.00' }),
        R('f_Vc', 'Dung tích xây dựng', 'V_xd', 'm³', '={f_At}*({f_L}+{f_Hav}+0.8+0.5)', ''),
        R('f_dim', 'Kích thước mỗi bể', '', '', '=TEXT({f_A1},"#,##0")&" m²"', '', { sel: 1 })] }] });
      eqp.push(['Cát lọc chậm + hệ thu nước đáy', 'm² lọc', '={f_At}', 0.8]);
    }
    if (ch.filt !== 'press') civ.push([TECH.filt[ch.filt], 'f_Vc', 7]); hl.push(['Qua bể lọc', 'f_hl']); dims.push([TECH.filt[ch.filt], 'f_N', 'f_dim']);
    keyRes.push(['Lọc – số bể / dàn', 'f_N', ch.filt === 'uf' ? 'dàn' : 'bể'], ['Lọc – tổng diện tích', 'f_At', 'm²']);
    if (ch.filt !== 'uf') keyRes.push(['Lọc – vận tốc lọc bình thường', 'f_v', 'm/h']);

    /* ---------- rửa lọc ---------- */
    if (FIL.bw) {
      const xa = ch.filt === 'xa', dual = ch.filt === 'dual', press = ch.filt === 'press';
      const qa = xa ? 73 : dual ? 55 : press ? 60 : 55, q2 = xa ? 10 : dual ? 0 : 12, q3 = xa ? 30 : dual ? 45 : press ? 30 : 25;
      sec('RỬA LỌC ' + (dual ? 'GIÓ RỒI NƯỚC (2 LỚP)' : 'GIÓ + NƯỚC ĐỒNG THỜI'), [
        R('bw_qa', 'Cường độ gió rửa', 'q_air', 'm³/m²·h', V('bw_qa', qa), xa ? 'P9.016 XA đồng thời: 36÷73' : 'MWH Bảng 11-8: 36÷72'),
        R('bw_t1', 'Thời gian rửa gió (đơn thuần)', 't₁', 'min', V('bw_t1', dual ? 3 : 2), ''),
        R('bw_q2', 'Cường độ nước giai đoạn gió + nước', 'q₂', 'm/h', V('bw_q2', q2), dual ? 'Không rửa đồng thời – tránh trôi than' : xa ? 'P9.016: 7÷12 m/h' : 'TCXDVN 33: 3÷4 L/s·m²'),
        R('bw_t2', 'Thời gian rửa gió + nước', 't₂', 'min', V('bw_t2', dual ? 0 : press ? 4 : xa ? 2 : 5), ''),
        R('bw_q3', 'Cường độ nước rửa giai đoạn nước đơn thuần', 'q₃', 'm/h', V('bw_q3', q3), dual ? 'Giãn nở 20÷25 % (MWH 30÷60 m/h)' : 'MWH Bảng 11-8'),
        R('bw_t3', 'Thời gian rửa nước đơn thuần', 't₃', 'min', V('bw_t3', dual ? 8 : xa ? 10 : 6), ''),
        R('bw_tx', 'Thời gian hạ mực nước, đóng mở van, lọc đầu', 't_x', 'min', V('bw_tx', 12), ''),
        R('bw_e', 'Độ giãn nở lớp vật liệu khi rửa nước', 'e', '%', V('bw_e', dual ? 22 : 10), ''),
        R('bw_hu', 'Tổn thất qua sàn / đan khi rửa nước', 'h_s', 'm', V('bw_hu', xa ? 0.4 : 0.5), '', { nf: '0.00' }),
        R('bw_eta', 'Hiệu suất bơm rửa lọc', 'η', '–', 0.75, '', { nf: '0.00' }),
        R('bw_etb', 'Hiệu suất máy thổi khí', 'η', '–', 0.65, '', { nf: '0.00' }),
        R('bw_n', 'Số bơm rửa làm việc', 'n', 'bơm', V('bw_n', q3 * 100 > 1500 && Qtk > 50000 ? 2 : 1), '+ 1 dự phòng'),
        R('bw_ho', 'Tổn thất đường ống + van bơm rửa', 'h_ống', 'm', V('bw_ho', Qtk > 100000 ? 3 : 2), '', { nf: '0.0' }),
        R('bw_P', 'Khoảng mặt vật liệu lọc → mép tràn thu nước rửa', 'P', 'm', V('bw_P', xa ? 1.5 : 0.7), xa ? '1.499 mm (Leopold)' : 'Mép máng ≥ lớp giãn nở + 0,15÷0,25 m', { nf: '0.00' })]);
      SH.push({ name: 'RuaLoc', title: 'RỬA LỌC ' + (dual ? 'GIÓ RỒI NƯỚC' : 'GIÓ + NƯỚC') + ' – BƠM RỬA – MÁY THỔI KHÍ', blocks: [
        { sec: 'A. CHẾ ĐỘ RỬA', rows: [
          R('bw_d90', 'Cỡ hạt d₉₀', 'd₉₀', 'm', '={f_d90}/1000', '', { nf: '0.0000' }),
          R('bw_Ga', 'Số Galileo (d₉₀)', 'Ga', '–', '={bw_d90}^3*{rho}*({f_rs}-{rho})*{g}/{mu}^2', ''),
          R('bw_vmf', 'Vận tốc hóa lỏng hạt d₉₀', 'v_mf', 'm/h', '=(SQRT(33.7^2+0.0408*{bw_Ga})-33.7)*{mu}/({rho}*{bw_d90})*3600', 'Wen–Yu'),
          dual ? R('bw_exp', 'Chiều cao lớp than + cát giãn nở', 'L_e', 'm', '=({f_L}+{f_L1})*(1+{bw_e}/100)', '', { nf: '0.00' })
            : CK('bw_c1', 'Kiểm tra chế độ rửa cát 1 lớp', '=IF({bw_q3}<{bw_vmf},"ĐẠT – rửa dưới ngưỡng hóa lỏng, lớp cát không phân tầng (cát + gió)","XEM LẠI – lớp cát bị hóa lỏng, phân tầng")'),
          CK('bw_c2', 'Kiểm tra cường độ gió', IFR('bw_qa', 36, 73, '36÷73 m³/m²·h')),
          (dual || q2 === 0) ? null : CK('bw_c3', 'Kiểm tra nước rửa đồng thời', IFR('bw_q2', 7, 15, '7÷15 m/h')),
          CK('bw_c4', 'Kiểm tra cường độ nước rửa', IFR('bw_q3', 15, 61, '15÷61 m/h'))] },
        { sec: 'B. LƯỢNG NƯỚC VÀ GIÓ RỬA', rows: [
          R('bw_Qw', 'Lưu lượng nước rửa lớn nhất (1 bể)', 'Q_r', 'm³/h', '={bw_q3}*{f_A1}', ''),
          R('bw_Qa', 'Lưu lượng gió rửa (1 bể)', 'Q_k', 'm³/h', '={bw_qa}*{f_A1}', ''),
          R('bw_V1', 'Tổng nước rửa 1 bể 1 lần', 'V₁', 'm³', '={bw_q2}*{f_A1}*{bw_t2}/60+{bw_Qw}*{bw_t3}/60', ''),
          R('bw_UBWV', 'Thể tích nước rửa riêng (UBWV)', 'UBWV', 'm³/m²', '={bw_V1}/{f_A1}', '', { nf: '0.00' }),
          R('bw_nw', 'Tổng số lần rửa toàn trạm 1 ngày', 'n', 'lần', '=24/{f_T}*{f_N}', '', { nf: '0.0' }),
          R('bw_Vd', 'Tổng nước rửa lọc trong 1 ngày', 'V_rl', 'm³/ngđ', '={bw_V1}*{bw_nw}', ''),
          R('bw_r', 'Tỷ lệ nước rửa / công suất trạm', 'r', '–', '={bw_Vd}/{Qtk}', '', { nf: '0.0%' }),
          CK('bw_c5', 'Kiểm tra tỷ lệ nước rửa', IFLE('bw_r', 0.05, '≤ 5 % – MWH 2÷5 %')),
          R('bw_hd', 'Thời gian trạm rửa chung làm việc / ngày', 't', 'h/ngđ', '={bw_nw}*({bw_t1}+{bw_t2}+{bw_t3}+{bw_tx})/60', '', { nf: '0.0' }),
          CK('bw_c6', 'Kiểm tra năng lực trạm rửa chung', IFLE('bw_hd', 16, '≤ 16 h/ngđ', 'XEM LẠI – thêm trạm rửa'))] },
        { sec: 'C. BƠM RỬA LỌC, MÁY THỔI KHÍ', rows: [
          R('bw_hm', 'Tổn thất qua lớp vật liệu khi rửa', 'h_v', 'm', '={f_L}*(1-{f_eps})*({f_rs}/{rho}-1)' + (dual ? '+{f_L1}*(1-0.5)*({f_r1}/{rho}-1)' : ''), '', { nf: '0.00' }),
          R('bw_H', 'CỘT ÁP BƠM RỬA LỌC', 'H_r', 'm', press ? '={bw_hu}+{bw_hm}+{f_Hs}+3+{bw_ho}+1' : '={bw_hu}+{bw_hm}+({f_L}' + (dual ? '+{f_L1}' : '') + '+{bw_P}+3)+{bw_ho}+1', 'Đan + VLL + hình học (MN min bể chứa → mép tràn) + ống + 1 m', { nf: '0.00' }),
          R('bw_Qp', 'Lưu lượng mỗi bơm rửa', 'Q_b', 'm³/h', '={bw_Qw}/{bw_n}', ''),
          R('bw_Pp', 'Công suất trục mỗi bơm rửa', 'N', 'kW', '={rho}*{g}*({bw_Qp}/3600)*{bw_H}/{bw_eta}/1000', ''),
          R('bw_sel', 'CHỌN: bơm rửa lọc', '', '', '=TEXT(CEILING({bw_Qp},10),"#,##0")&" m³/h × "&TEXT(CEILING({bw_H},1),"0")&" m – "&TEXT({bw_n},"0")&" làm việc + 1 dự phòng"', '', { sel: 1 }),
          R('bw_pb', 'Áp lực máy thổi khí', 'p', 'bar', '=({f_L}' + (dual ? '+{f_L1}' : '') + '+0.15+0.3+0.2)*0.0981+0.12', '', { nf: '0.00' }),
          R('bw_Pb', 'Công suất trục máy thổi khí', 'N', 'kW', '=({bw_Qa}/3600)*{bw_pb}*100000/{bw_etb}/1000', ''),
          R('bw_selb', 'CHỌN: máy thổi khí', '', '', '=TEXT(CEILING({bw_Qa},50),"#,##0")&" m³/h × "&TEXT({bw_pb},"0.00")&" bar – 1 làm việc + 1 dự phòng"', '', { sel: 1 }),
          R('bw_kWh', 'Điện năng rửa lọc (bơm + máy thổi)', 'E', 'kWh/ngđ', '=({rho}*{g}/(3.6*10^6)*{bw_Vd}*{bw_H}/{bw_eta}+{bw_Pb}*{bw_nw}*({bw_t1}+{bw_t2})/60)/{eta_mot}', ''),
          R('bw_ex', 'Chiều cao lớp vật liệu giãn nở', 'Δ', 'm', '=({f_L}' + (dual ? '+{f_L1}' : '') + ')*{bw_e}/100', '', { nf: '0.00' }),
          CK('bw_c7', 'Kiểm tra mép tràn chống trôi vật liệu', '=IF({bw_P}>={bw_ex}+' + (xa ? '0.5' : '0.15') + ',"ĐẠT – mép tràn cao hơn lớp giãn nở ≥ ' + (xa ? '0,5' : '0,15') + ' m","XEM LẠI – nâng mép máng thu")')] },
        { sec: 'D. BỂ THU HỒI NƯỚC RỬA LỌC', rows: [
          R('bw_Vr', 'Dung tích bể thu hồi (≥ 1,5 lần rửa 1 bể)', 'V_th', 'm³', '=CEILING(1.5*{bw_V1},10)', 'CLAUDE §13: chứa ≥ 1 lần rửa của 1 bể'),
          CK('bw_c8', 'Kiểm tra dung tích bể thu hồi', '=IF({bw_Vr}>={bw_V1},"ĐẠT  (≥ 1 lần rửa 1 bể)","XEM LẠI")'),
          R('bw_Vc', 'Dung tích xây dựng bể thu hồi (H 4 m + 0,5 m)', 'V_xd', 'm³', '={bw_Vr}*4.5/4', '')] }] });
      civ.push(['Bể thu hồi nước rửa lọc', 'bw_Vc', 4.5]);
      eqp.push(['Bơm rửa lọc', 'bộ', '={bw_n}+1', '=25*{bw_Pp}^0.85'], ['Máy thổi khí rửa lọc', 'bộ', 2, '=30*{bw_Pb}^0.85']);
      kwh.push(['Rửa lọc (bơm rửa + máy thổi khí)', '={bw_kWh}']);
      keyRes.push(['Rửa lọc – lưu lượng nước rửa 1 bể', 'bw_Qw', 'm³/h'], ['Rửa lọc – tổng nước rửa 1 ngày', 'bw_Vd', 'm³/ngđ']);
    }

    /* ---------- xử lý nâng cao ---------- */
    const adv = ch.adv || [];
    if (adv.includes('gac')) {
      const vg = 10, Ag = QhF / vg, Ng = Math.max(2, Math.ceil(Ag / 100 - 1e-9));
      sec('LỌC THAN HOẠT TÍNH GAC', [
        R('gac_N', 'Số bể lọc GAC', 'N', 'bể', V('gac_N', Ng), '≥ 2'),
        R('gac_v', 'Vận tốc lọc qua GAC', 'v', 'm/h', V('gac_v', vg), 'MWH: 5÷15 m/h'),
        R('gac_EBCT', 'Thời gian tiếp xúc tầng rỗng EBCT', 'EBCT', 'min', V('gac_EBCT', 15), 'MWH: 10÷20 min'),
        R('gac_rho', 'Khối lượng riêng đổ đống GAC', 'ρ_b', 'kg/m³', V('gac_rho', 450), ''),
        R('gac_CUR', 'Suất tiêu hao than (CUR)', 'CUR', 'g/m³', V('gac_CUR', 15), 'GIẢ ĐỊNH – thử nghiệm cột RSSCT')]);
      SH.push({ name: 'LocThan_GAC', title: 'LỌC HẤP PHỤ THAN HOẠT TÍNH DẠNG HẠT (GAC)', blocks: [{ sec: 'A. KÍCH THƯỚC VÀ THAN', rows: [
        R('gac_A', 'Tổng diện tích lọc GAC', 'F', 'm²', '={QhF}/{gac_v}', ''),
        R('gac_A1', 'Diện tích 1 bể', 'F₁', 'm²', '={gac_A}/{gac_N}', ''),
        R('gac_L', 'Chiều dày lớp GAC', 'L', 'm', '={gac_v}*{gac_EBCT}/60', '', { nf: '0.00' }),
        CK('gac_c1', 'Kiểm tra EBCT', IFR('gac_EBCT', 10, 20, '10÷20 min')),
        CK('gac_c2', 'Kiểm tra chiều dày lớp than', IFR('gac_L', 1.0, 3.0, '1,0÷3,0 m')),
        R('gac_M', 'Khối lượng than', 'M', 'tấn', '={gac_A}*{gac_L}*{gac_rho}/1000', ''),
        R('gac_day', 'Chu kỳ thay / hoàn nguyên than', 't', 'ngày', '={gac_M}*1000000/({gac_CUR}*{Qtk})', ''),
        CK('gac_c3', 'Kiểm tra chu kỳ thay than', IFGE('gac_day', 180, '≥ 180 ngày')),
        R('gac_hl', 'Tổn thất qua bể GAC', 'h', 'm', V('gac_hl', 1.5), '', { nf: '0.00' }),
        R('gac_Vc', 'Dung tích xây dựng', 'V_xd', 'm³', '={gac_A}*({gac_L}+1.5+1.2+0.5)', ''),
        R('gac_dim', 'Kích thước', '', '', '=TEXT({gac_N},"0")&" bể × "&TEXT({gac_A1},"0.0")&" m²; L = "&TEXT({gac_L},"0.0")&" m"', '', { sel: 1 })] }] });
      civ.push(['Bể lọc GAC', 'gac_Vc', 7]); eqp.push(['Than hoạt tính GAC (nạp đầu)', 'tấn', '={gac_M}', 45]); hl.push(['Qua bể lọc GAC', 'gac_hl']); dims.push(['Lọc GAC', 'gac_N', 'gac_dim']);
      kwh.push(['Bơm nâng / rửa GAC', '={rho}*{g}/(3.6*10^6)*{Qtk}*2/(0.75*{eta_mot})']);
    }
    if (adv.includes('ro')) {
      sec('THẨM THẤU NGƯỢC RO – XỬ LÝ MỘT PHẦN + HÒA TRỘN (MWH Bảng 17-4)', [
        R('ro_TDSt', 'TDS mục tiêu sau hòa trộn', 'TDS_t', 'mg/L', V('ro_TDSt', 500), 'QCVN 01-1:2018 ≤ 1.000; chọn dự trữ'),
        R('ro_R', 'Tỷ lệ khử muối của màng', 'R', '–', V('ro_R', 0.98), '', { nf: '0.000' }),
        R('ro_Y', 'Hiệu suất thu hồi', 'Y', '–', V('ro_Y', 0.78), 'MWH: nước lợ 75÷85 %', { nf: '0.00' }),
        R('ro_J', 'Thông lượng thiết kế', 'J', 'L/m²·h', V('ro_J', 18), 'MWH Bảng 17-4: 17÷21'),
        R('ro_Ae', 'Diện tích màng mỗi phần tử 8 in', 'A_e', 'm²', V('ro_Ae', 37.2), '400 ft²', { nf: '0.0' }),
        R('ro_ne', 'Số phần tử mỗi ống áp lực', 'n_e', 'phần tử', V('ro_ne', 7), 'MWH: 6÷7'),
        R('ro_NDP', 'Áp lực hữu hiệu thuần (NDP)', 'NDP', 'bar', V('ro_NDP', 7), '', { nf: '0.0' }),
        R('ro_eta', 'Hiệu suất bơm cao áp', 'η', '–', V('ro_eta', 0.8), '', { nf: '0.00' })]);
      SH.push({ name: 'LocRO', title: 'THẨM THẤU NGƯỢC RO (XỬ LÝ MỘT PHẦN, HÒA TRỘN VỚI NƯỚC SAU LỌC)', blocks: [
        { sec: 'A. CÂN BẰNG TDS VÀ LƯU LƯỢNG', rows: [
          R('ro_TDSp', 'TDS nước sau màng', 'TDS_p', 'mg/L', '={TDS}*(1-{ro_R})*(1+1/(1-{ro_Y}))/2', 'Theo nồng độ trung bình phía cấp', { nf: '0.0' }),
          R('ro_f', 'Tỷ lệ nước qua RO', 'f', '–', '=MIN(1,MAX(0,({TDS}-{ro_TDSt})/({TDS}-{ro_TDSp})))', '', { nf: '0.00' }),
          R('ro_Qp', 'Lưu lượng nước sau màng', 'Q_p', 'm³/ngđ', '={ro_f}*{Q}', ''),
          R('ro_Qf', 'Lưu lượng nước cấp vào RO', 'Q_f', 'm³/ngđ', '={ro_Qp}/{ro_Y}', ''),
          R('ro_Qc', 'Lưu lượng nước muối đậm đặc', 'Q_c', 'm³/ngđ', '={ro_Qf}-{ro_Qp}', 'Xả thải – cần đánh giá môi trường'),
          R('ro_TDSc', 'TDS nước muối đậm đặc', 'TDS_c', 'mg/L', '={TDS}/(1-{ro_Y})', ''),
          CK('ro_c1', 'Kiểm tra hiệu suất thu hồi', IFR('ro_Y', 0.7, 0.85, '70÷85 %'))] },
        { sec: 'B. MÀNG, ÁP LỰC, ĐIỆN NĂNG', rows: [
          R('ro_nel', 'Số phần tử màng', 'n', 'phần tử', '=ROUNDUP({ro_Qp}*1000/24/({ro_J}*{ro_Ae}),0)', ''),
          R('ro_nv', 'Số ống áp lực', 'n_v', 'ống', '=ROUNDUP({ro_nel}/{ro_ne},0)', ''),
          R('ro_Jr', 'Thông lượng thực tế', 'J', 'L/m²·h', '=IF({ro_nv}=0,{ro_J},{ro_Qp}*1000/24/({ro_nv}*{ro_ne}*{ro_Ae}))', ''),
          CK('ro_c2', 'Kiểm tra thông lượng', IFR('ro_Jr', 14, 22, '14÷22 L/m²·h')),
          R('ro_pi', 'Áp suất thẩm thấu trung bình phía cấp', 'π', 'bar', '=0.0007*{TDS}*(1+1/(1-{ro_Y}))/2', '≈ 0,7 bar / 1.000 mg/L', { nf: '0.0' }),
          R('ro_Pf', 'Áp lực cấp', 'P_f', 'bar', '={ro_NDP}+{ro_pi}+1.5', '', { nf: '0.0' }),
          R('ro_SEC', 'Suất tiêu thụ điện', 'SEC', 'kWh/m³', '={ro_Pf}/(36*{ro_eta}*{ro_Y})', 'Trên m³ nước sau màng', { nf: '0.00' }),
          R('ro_kWh', 'Điện năng RO', 'E', 'kWh/ngđ', '={ro_SEC}*{ro_Qp}/{eta_mot}', ''),
          R('ro_TDSm', 'TDS sau hòa trộn', 'TDS', 'mg/L', '={ro_f}*{ro_TDSp}+(1-{ro_f})*{TDS}', ''),
          CK('ro_c3', 'Kiểm tra TDS nước thành phẩm', '=IF({ro_TDSm}<=1000,"ĐẠT  (≤ 1.000 mg/L – QCVN 01-1:2018)","XEM LẠI")'),
          R('ro_dim', 'Hệ RO', '', '', '=TEXT({ro_nv},"0")&" ống × "&TEXT({ro_ne},"0")&" phần tử; "&TEXT({ro_Qp},"#,##0")&" m³/ngđ"', '', { sel: 1 })] }] });
      eqp.push(['Hệ RO (màng, ống áp lực, bơm cao áp, lọc tinh 5 µm, CIP, antiscalant)', 'm³/ngđ', '={ro_Qp}', 9]); kwh.push(['RO – bơm cao áp', '={ro_kWh}']); dims.push(['Hệ RO', 'ro_nv', 'ro_dim']);
      keyRes.push(['RO – nước sau màng', 'ro_Qp', 'm³/ngđ'], ['RO – nước muối đậm đặc', 'ro_Qc', 'm³/ngđ'], ['TDS sau hòa trộn', 'ro_TDSm', 'mg/L']);
      notes.push('RO: tiền xử lý cần SDI < 3÷5 (nên dùng UF); nước muối đậm đặc phải có phương án xả thải / tiếp nhận.');
    }

    /* ---------- khử trùng, bể chứa, bơm I/II ---------- */
    const pct = Q >= 100000 ? 12 : Q >= 20000 ? 15 : 20, nt = Q >= 100000 ? 4 : 2, Ht = Q >= 20000 ? 5 : 4;
    const Bt = Math.max(4, Math.round(Math.sqrt(Q * pct / 100 / nt / Ht / 1.2)));
    const n1 = Math.max(2, Math.ceil(Qh / 3650 - 1e-9)), n2 = Math.max(2, Math.ceil(Q / 24 * Kh / 3900 - 1e-9));
    sec('KHỬ TRÙNG – BỂ CHỨA – BƠM CẤP I, II', [
      R('ds_pct', 'Dung tích bể chứa (% công suất ngày)', '–', '%', V('ds_pct', pct), 'TCXDVN 33:2006: 10÷20 % (trạm nhỏ lấy cao)'),
      R('ds_n', 'Số ngăn bể chứa', 'n', 'ngăn', V('ds_n', nt), ''),
      R('ds_H', 'Chiều sâu công tác bể chứa', 'H', 'm', V('ds_H', Ht), ''),
      R('ds_B', 'CHỌN: chiều rộng mỗi ngăn', 'B', 'm', V('ds_B', Bt), ''),
      R('ds_C', 'Clo dư duy trì trong bể chứa', 'C', 'mg/L', V('ds_C', 0.8), 'QCVN 01-1:2018/BYT: 0,2÷1,0', { nf: '0.0' }),
      R('ds_CT', 'CT yêu cầu (Giardia 0,5-log còn lại, pH 7)', 'CT', 'mg·min/L', V('ds_CT', ch.dis === 'uv' ? 6 : T < 15 ? 20 : 12), ch.dis === 'uv' ? 'UV đã khử Giardia/Crypto – clo chỉ cho virus 4-log' : 'USEPA SWTR: keo tụ–lắng–lọc được tính 2,5-log'),
      R('ds_BF', 'Hệ số kể đến dòng chảy tắt (baffling factor)', 'BF', '–', V('ds_BF', 0.5), 'Bể có vách hướng dòng trung bình', { nf: '0.00' }),
      R('ds_n1', 'Số bơm cấp I làm việc', 'n₁', 'bơm', V('ds_n1', n1), '+ dự phòng'),
      R('ds_s1', 'Số bơm cấp I dự phòng', 'n₁ᵈᵖ', 'bơm', V('ds_s1', n1 > 4 ? 2 : 1), ''),
      R('ds_e1', 'Hiệu suất bơm cấp I', 'η₁', '–', V('ds_e1', 0.78), '', { nf: '0.00' }),
      R('ds_n2', 'Số bơm cấp II làm việc', 'n₂', 'bơm', V('ds_n2', n2), '+ dự phòng; biến tần'),
      R('ds_s2', 'Số bơm cấp II dự phòng', 'n₂ᵈᵖ', 'bơm', V('ds_s2', n2 > 4 ? 2 : 1), ''),
      R('ds_H2', 'Cột áp bơm cấp II', 'H₂', 'm', V('ds_H2', P.H2 || 45), 'Theo mạng lưới'),
      R('ds_e2', 'Hiệu suất bơm cấp II', 'η₂', '–', V('ds_e2', 0.8), '', { nf: '0.00' }),
      R('ds_MNTN', 'Mực nước thấp nhất tại công trình thu', 'MNTN', 'm', V('ds_MNTN', surf ? -3 : -15), surf ? 'GIẢ ĐỊNH – cần số liệu thủy văn P = 95 %' : 'Mực nước động giếng – GIẢ ĐỊNH', { nf: '0.0' }),
      R('ds_Lraw', 'Chiều dài tuyến ống nước thô', 'L', 'm', V('ds_Lraw', Q >= 50000 ? 500 : 300), 'GIẢ ĐỊNH theo mặt bằng'),
      R('ds_CHW', 'Hệ số Hazen-Williams', 'C', '–', 120, ''),
      ch.dis === 'uv' ? R('uv_D', 'Liều UV thiết kế', 'D', 'mJ/cm²', V('uv_D', 40), 'Giardia/Crypto 3-log: ≥ 12; thiết kế 40') : null,
      ch.dis === 'uv' ? R('uv_cap', 'Công suất 1 thiết bị UV', 'q', 'm³/h', V('uv_cap', Math.min(1500, Math.max(50, rd(Qh / 2, 50)))), 'Theo hãng') : null]);
    const dsRows = [
      R('ds_V', 'Dung tích bể chứa', 'V', 'm³', '={Q}*{ds_pct}/100', ''),
      R('ds_V1', 'Dung tích mỗi ngăn', 'V₁', 'm³', '={ds_V}/{ds_n}', ''),
      R('ds_Lt', 'Chiều dài mỗi ngăn', 'L', 'm', '={ds_V1}/{ds_H}/{ds_B}', '', { nf: '0.0' }),
      R('ds_dim', 'Kích thước mỗi ngăn bể chứa', '', '', '=TEXT({ds_B},"0.0")&" m × "&TEXT({ds_Lt},"0.0")&" m × "&TEXT({ds_H}+0.5,"0.0")&" m"', '', { sel: 1 }),
      R('ds_t', 'Thời gian lưu lý thuyết trong bể chứa', 't', 'min', '={ds_V}/({Q}/24)*60', ''),
      R('ds_CTa', 'Giá trị CT đạt được', 'CT', 'mg·min/L', '={ds_C}*{ds_t}*{ds_BF}', ''),
      CK('ds_c1', 'Kiểm tra khử trùng', '=IF({ds_CTa}>={ds_CT},"ĐẠT – đủ CT","XEM LẠI – tăng clo dư hoặc vách hướng dòng")'),
      CK('ds_c2', 'Kiểm tra clo dư theo quy chuẩn', IFR('ds_C', 0.2, 1, '0,2÷1,0 mg/L')),
      R('ds_Vc', 'Dung tích xây dựng bể chứa', 'V_xd', 'm³', '={ds_V}*({ds_H}+0.5)/{ds_H}', '')];
    if (ch.dis === 'uv') dsRows.push(R('uv_n', 'Số thiết bị UV làm việc', 'n', 'bộ', '=ROUNDUP({QhF}/{uv_cap},0)', '+ 1 dự phòng'), R('uv_kWh', 'Điện năng UV', 'E', 'kWh/ngđ', '={Qtk}*0.015', '≈ 15 Wh/m³'));
    SH.push({ name: 'KhuTrung', title: 'KHỬ TRÙNG – BỂ CHỨA NƯỚC SẠCH – TRẠM BƠM CẤP I, II', blocks: [
      { sec: 'A. BỂ CHỨA NƯỚC SẠCH VÀ KHỬ TRÙNG', rows: dsRows },
      { sec: 'B. TRẠM BƠM CẤP I', rows: [
        R('ds_Q1', 'Lưu lượng trạm bơm cấp I', 'Q', 'm³/h', '={Qh}', ''),
        R('ds_q1', 'Lưu lượng mỗi bơm', 'q', 'm³/h', '={ds_Q1}/{ds_n1}', ''),
        R('ds_Dr', 'Đường kính ống nước thô (1 tuyến/bơm chung, v ≤ 1,5 m/s)', 'D', 'm', '=CEILING(SQRT(4*{ds_Q1}/3600/(PI()*1.5)),0.05)', '', { nf: '0.00' }),
        R('ds_hr', 'Tổn thất tuyến ống nước thô', 'h', 'm', '=10.67*{ds_Lraw}*({ds_Q1}/3600)^1.852/({ds_CHW}^1.852*{ds_Dr}^4.87)+6*({ds_Q1}/3600/(PI()/4*{ds_Dr}^2))^2/(2*{g})', 'Hazen-Williams + Σξ = 6', { nf: '0.00' }),
        R('ds_H1c', 'CỘT ÁP BƠM CẤP I TÍNH TOÁN', 'H₁', 'm', '={ct_Zmix}-{ds_MNTN}+1+{ds_hr}+1+0.5', 'MN bể trộn − MNTN + cửa thu 1 m + ống thô + ống đẩy 1 m + 0,5 m', { nf: '0.00' }),
        R('ds_H1s', 'CHỌN: cột áp bơm cấp I', 'H₁', 'm', '=CEILING({ds_H1c},1)', ''),
        R('ds_P1', 'Công suất trục mỗi bơm', 'N', 'kW', '={rho}*{g}*({ds_q1}/3600)*{ds_H1s}/{ds_e1}/1000', ''),
        R('ds_sel1', 'CHỌN: bơm cấp I', '', '', '=TEXT(CEILING({ds_q1},10),"#,##0")&" m³/h × "&TEXT({ds_H1s},"0")&" m – "&TEXT({ds_n1},"0")&" bơm + "&TEXT({ds_s1},"0")&" dự phòng"', '', { sel: 1 })] },
      { sec: 'C. TRẠM BƠM CẤP II', rows: [
        R('ds_Q2', 'Lưu lượng giờ lớn nhất', 'Q_max', 'm³/h', '={Qmax2}', ''),
        R('ds_q2', 'Lưu lượng mỗi bơm', 'q', 'm³/h', '={ds_Q2}/{ds_n2}', ''),
        R('ds_P2', 'Công suất trục mỗi bơm', 'N', 'kW', '={rho}*{g}*({ds_q2}/3600)*{ds_H2}/{ds_e2}/1000', ''),
        R('ds_sel2', 'CHỌN: bơm cấp II', '', '', '=TEXT(CEILING({ds_q2},10),"#,##0")&" m³/h × "&TEXT({ds_H2},"0")&" m – "&TEXT({ds_n2},"0")&" bơm + "&TEXT({ds_s2},"0")&" dự phòng"', '', { sel: 1 })] }] });
    civ.push(['Bể chứa nước sạch', 'ds_Vc', 3.5]);
    eqp.push(['Bơm cấp I (kể cả động cơ, biến tần)', 'bộ', '={ds_n1}+{ds_s1}', '=25*{ds_P1}^0.85'], ['Bơm cấp II (kể cả động cơ, biến tần)', 'bộ', '={ds_n2}+{ds_s2}', '=25*{ds_P2}^0.85']);
    if (ch.dis === 'uv') { eqp.push(['Thiết bị khử trùng UV', 'bộ', '={uv_n}+1', '=1.2*{uv_cap}^0.8']); kwh.push(['Khử trùng UV', '={uv_kWh}']); }
    kwh.push(['Bơm cấp I', '={rho}*{g}/(3.6*10^6)*{Qtk}*{ds_H1s}/({ds_e1}*{eta_mot})'], ['Bơm cấp II', '={rho}*{g}/(3.6*10^6)*{Q}*{ds_H2}/({ds_e2}*{eta_mot})']);
    dims.push(['Bể chứa nước sạch', 'ds_n', 'ds_dim']);
    keyRes.push(['Bể chứa – dung tích', 'ds_V', 'm³'], ['Khử trùng – CT đạt được', 'ds_CTa', 'mg·min/L'], ['Bơm cấp I', 'ds_sel1', ''], ['Bơm cấp II', 'ds_sel2', '']);

    /* ---------- xử lý bùn ---------- */
    const slEq = ch.sl;
    sec('XỬ LÝ BÙN', [
      R('sl_C1', CL ? (ch.clar === 'daf' ? 'Nồng độ bùn nổi gạt từ bể DAF' : 'Nồng độ bùn xả từ bể lắng') : 'Nồng độ cặn trong nước rửa lọc', 'C₁', '%', V('sl_C1', CL ? CL.C1 : 0.05), CL ? (ch.clar === 'daf' ? 'MWH: 2÷3 %' : 'GIẢ ĐỊNH') : 'Nước rửa lọc loãng', { nf: '0.00' }),
      R('sl_C2', 'Nồng độ bùn sau bể cô đặc', 'C₂', '%', V('sl_C2', 3), 'MWH Bảng 21-13: 2÷3 % (bùn keo tụ)', { nf: '0.0' }),
      R('sl_C3', 'Nồng độ bánh bùn sau khử nước', 'C₃', '%', V('sl_C3', slEq === 'centri' ? 22 : slEq === 'belt' ? 20 : 35), slEq === 'centri' ? 'Ly tâm – bùn phèn + phù sa' : slEq === 'belt' ? 'MWH Bảng 21-16: 15÷30 %' : 'Sân phơi 25÷40 %'),
      R('sl_SLR', 'Tải trọng chất rắn bể cô đặc', '–', 'kg/m²·ngđ', V('sl_SLR', 25), 'MWH Bảng 21-13: 20÷80; bùn nhà máy nước 15÷30'),
      R('sl_Hth', 'Chiều sâu công tác bể cô đặc', 'H', 'm', V('sl_Hth', Q >= 20000 ? 4 : 3.5), '', { nf: '0.0' }),
      slEq !== 'bed' ? R('sl_t', 'Số giờ vận hành thiết bị khử nước / ngày', 't', 'h', V('sl_t', Q >= 50000 ? 20 : 8), '') : R('sl_bl', 'Tải trọng chất rắn sân phơi', '–', 'kg/m²·năm', V('sl_bl', 120), 'GIẢ ĐỊNH – khí hậu nhiệt đới'),
      slEq !== 'bed' ? R('sl_nm', 'Số máy khử nước làm việc tối thiểu', 'n', 'máy', V('sl_nm', 1), '+ 1 dự phòng') : null,
      slEq !== 'bed' ? R('sl_pk', 'Liều polymer cation khử nước bùn', '–', 'kg/tấn DS', V('sl_pk', 4), 'GIẢ ĐỊNH – 2÷6 kg/t DS; thử nghiệm') : null,
      slEq !== 'bed' ? R('sl_cpoly', 'Nồng độ dung dịch polymer pha', '–', '%', V('sl_cpoly', 0.2), '0,1÷0,5 %', { nf: '0.00' }) : null,
      R('sl_pr', 'Tỷ lệ nước rửa lọc thu hồi tuần hoàn', 'r_bw', '–', V('sl_pr', 0.95), 'Phần cặn còn lại về bể cô đặc', { nf: '0.00' })]);
    const pacAl = '{PAC}*0.31*(53.96/101.96)*(78/26.98)';
    SH.push({ name: 'Bun', title: 'XỬ LÝ BÙN – CÔ ĐẶC – KHỬ NƯỚC', blocks: [
      { sec: 'A. LƯỢNG BÙN KHÔ', rows: [
        R('sl_Q', 'Công suất thiết kế', 'Q_tk', 'm³/ngđ', '={Qtk}', ''),
        R('sl_SSr', 'Cặn lơ lửng được giữ lại', 'SS', 'mg/L', ch.pre === 'aer' ? '={SS}' : '={SS}*0.95', 'Sau lắng + lọc'),
        R('sl_Al', 'Lượng Al(OH)₃ tạo thành từ PAC', '–', 'mg/L', '=' + pacAl, '', { nf: '0.00' }),
        R('sl_FeMn', 'Bông cặn Fe(OH)₃ + MnO₂', '–', 'mg/L', '=1.91*{Fe}+1.58*{Mn}+0.6*{KMnO4}', '', { nf: '0.00' }),
        R('sl_cc', 'Tổng hàm lượng cặn khô', 'C', 'mg/L', '={sl_SSr}+{sl_Al}+{sl_FeMn}+{poly}', ''),
        R('sl_DS', 'Khối lượng bùn khô', 'M', 'kg DS/ngđ', '={sl_Q}*{sl_cc}/1000', 'Ứng với độ đục thiết kế lớn nhất'),
        R('sl_fcl', 'Tỷ lệ bùn giữ lại ở công trình lắng', 'f', '–', CL ? '={cl_E}/100' : 0, CL ? '' : 'Không có công trình lắng – toàn bộ cặn vào nước rửa lọc', { nf: '0.00' }),
        R('sl_Vcl', CL ? (ch.clar === 'daf' ? 'Lưu lượng bùn nổi xả từ bể DAF' : 'Lưu lượng bùn xả từ bể lắng') : 'Lưu lượng bùn xả từ bể lắng', 'Q_b', 'm³/ngđ', '={sl_DS}*{sl_fcl}/({sl_C1}*10)', ''),
        R('sl_r', 'Tỷ lệ nước xả bùn / công suất', '–', '–', '={sl_Vcl}/{Qtk}', '', { nf: '0.0%' })] },
      { sec: 'B. BỂ CÔ ĐẶC TRỌNG LỰC', rows: [
        R('sl_A', 'Diện tích bể cô đặc yêu cầu', 'F', 'm²', '={sl_DS}/{sl_SLR}', ''),
        R('sl_nt', 'Số bể cô đặc', 'n', 'bể', '=MAX(IF({Q}>=5000,2,1),ROUNDUP({sl_A}/(PI()/4*35^2),0))', 'Đường kính ≤ 35 m'),
        R('sl_D', 'Đường kính mỗi bể', 'D', 'm', '=SQRT({sl_A}/{sl_nt}*4/PI())', '', { nf: '0.0' }),
        R('sl_V2', 'Lưu lượng bùn sau cô đặc', 'Q₂', 'm³/ngđ', '={sl_DS}/({sl_C2}*10)', ''),
        R('sl_Vc', 'Dung tích xây dựng bể cô đặc + bể chứa bùn', 'V_xd', 'm³', '={sl_nt}*PI()/4*{sl_D}^2*({sl_Hth}+0.5)+{sl_V2}', '')] },
      { sec: 'C. ' + (slEq === 'bed' ? 'SÂN PHƠI BÙN' : 'KHỬ NƯỚC BÙN'), rows: slEq === 'bed' ? [
        R('sl_Ab', 'Diện tích sân phơi bùn', 'F', 'm²', '={sl_DS}*{rDS}*365/{sl_bl}', 'Theo lượng bùn trung bình năm'),
        R('sl_cake', 'Khối lượng bánh bùn', 'M', 'tấn/ngđ', '={sl_DS}/({sl_C3}/100)/1000', ''),
        R('sl_pd', 'Lượng polymer bột dùng mỗi ngày', '–', 'kg/ngđ', 0, 'Không dùng'),
        R('sl_kWh', 'Điện năng xử lý bùn', 'E', 'kWh/ngđ', '={sl_nt}*0.75*24', 'Gạt bùn bể cô đặc'),
        R('sl_dim', 'Sân phơi bùn', '', '', '=TEXT({sl_Ab},"#,##0")&" m²"', '', { sel: 1 })] : [
        R('sl_cap', 'Công suất khử nước yêu cầu', 'G', 'kg DS/h', '={sl_DS}/{sl_t}', ''),
        R('sl_nmc', 'Số máy làm việc', 'n', 'máy', '=MAX({sl_nm},ROUNDUP({sl_cap}/1500,0))', '≤ 1.500 kg DS/h/máy'),
        R('sl_cap1', 'Công suất mỗi máy', 'g', 'kg DS/h', '={sl_cap}/{sl_nmc}', ''),
        R('sl_cake', 'Khối lượng bánh bùn', 'M', 'tấn/ngđ', '={sl_DS}/({sl_C3}/100)/1000', ''),
        CK('sl_c1', 'Kiểm tra dải liều polymer', IFR('sl_pk', 2, 6, '2÷6 kg/tấn DS – bùn nhà máy nước')),
        R('sl_pd', 'Lượng polymer bột dùng mỗi ngày', '–', 'kg/ngđ', '={sl_DS}/1000*{sl_pk}', ''),
        R('sl_kWh', 'Điện năng xử lý bùn (khử nước + bơm bùn + gạt bùn)', 'E', 'kWh/ngđ', '=({sl_cap}*' + (slEq === 'centri' ? '0.04' : '0.02') + '*{sl_t}+{sl_nt}*0.75*24)/{eta_mot}*{rDS}+{sl_nt}*0.0', ''),
        R('sl_dim', 'CHỌN: thiết bị khử nước', '', '', `="${slEq === 'centri' ? 'Ly tâm' : 'Ép băng tải'} ≥ "&TEXT(CEILING({sl_cap1}*1.2,10),"#,##0")&" kg DS/h × "&TEXT({sl_nmc},"0")&" máy + 1 dự phòng"`, '', { sel: 1 })] }] });
    civ.push(['Bể cô đặc, chứa bùn', 'sl_Vc', 4.5]);
    if (slEq === 'bed') civ.push(['Sân phơi bùn (m² × 1 m)', 'sl_Ab', 0.8]);
    else eqp.push([slEq === 'centri' ? 'Thiết bị khử nước bùn (ly tâm)' : 'Thiết bị khử nước bùn (ép băng tải)', 'máy', '={sl_nmc}+1', '=' + (slEq === 'centri' ? 7000 : 4500) + '*({sl_cap1}/1900)^0.6']);
    eqp.push(['Gạt bùn bể cô đặc', 'bộ', '={sl_nt}', '=60*{sl_D}^1.0+200']);
    kwh.push(['Xử lý bùn', '={sl_kWh}']);
    keyRes.push(['Bùn khô phát sinh', 'sl_DS', 'kg DS/ngđ'], ['Bánh bùn', 'sl_cake', 'tấn/ngđ']);

    /* ---------- cao trình ---------- */
    const pressLike = ch.filt === 'press' || ch.filt === 'uf';
    const hlBefore = hl.filter(x => x[1] !== 'f_hl' && x[1] !== 'gac_hl');
    sec('CAO TRÌNH THỦY LỰC', [
      R('ct_Z0', 'Mực nước cao nhất bể chứa nước sạch', 'Z₀', 'm', V('ct_Z0', 1.5), 'GIẢ ĐỊNH theo san nền ±0,00', { nf: '0.00' }),
      R('ct_hft', 'Tổn thất bể lọc → bể chứa (ống, van, tràn)', 'h', 'm', V('ct_hft', 0.5), '', { nf: '0.00' }),
      R('ct_hcf', pressLike ? 'Tổn thất bể nước lắng → bơm trung gian' : 'Tổn thất bể lắng → bể lọc (kênh + tràn chia nước)', 'h', 'm', V('ct_hcf', pressLike ? 0.2 : 0.45), '', { nf: '0.00' })]);
    const ctRows = [
      R('ct_Zw', 'Ngưỡng tràn hố nước sau lọc (yêu cầu tối thiểu)', 'Z_w', 'm', '={ct_Z0}+{ct_hft}', '', { nf: '0.00' })];
    let prev = 'ct_Zw';
    if (adv.includes('gac')) { ctRows.push(R('ct_Zg', 'Mực nước bể lọc GAC', 'Z', 'm', `={${prev}}+{gac_hl}`, '', { nf: '0.00' })); prev = 'ct_Zg'; }
    if (pressLike) {
      ctRows.push(R('ct_Zcl', 'Mực nước bể chứa nước lắng (hút bơm trung gian)', 'Z', 'm', `={${prev}}+0.3`, 'Bơm trung gian cấp vào ' + (ch.filt === 'uf' ? 'UF' : 'lọc áp lực') + ' – chênh cột áp do bơm', { nf: '0.00' }));
      prev = 'ct_Zcl';
      ctRows.push(R('ct_Zcf', 'Mực nước ra công trình lắng', 'Z', 'm', `={${prev}}+{ct_hcf}`, '', { nf: '0.00' })); prev = 'ct_Zcf';
    } else {
      ctRows.push(R('ct_Zf', 'Mực nước lọc tối đa', 'Z', 'm', `={${prev}}+{f_hl}`, '', { nf: '0.00' })); prev = 'ct_Zf';
      ctRows.push(R('ct_Zcf', CL ? 'Mực nước kênh nước lắng (trước tràn chia)' : 'Mực nước kênh phân phối vào bể lọc', 'Z', 'm', `={${prev}}+{ct_hcf}`, '', { nf: '0.00' })); prev = 'ct_Zcf';
    }
    hlBefore.slice().reverse().forEach((x, i) => { const k = 'ct_z' + i; ctRows.push(R(k, 'Mực nước trước: ' + x[0].toLowerCase(), 'Z', 'm', `={${prev}}+{${x[1]}}`, '', { nf: '0.00' })); prev = k; });
    ctRows.push(R('ct_Zmix', 'Mực nước đầu dây chuyền (bể trộn / giàn mưa)', 'Z_đ', 'm', `={${prev}}`, '', { nf: '0.00' }));
    SH.push({ name: 'CaoTrinh', title: 'CAO TRÌNH THỦY LỰC TOÀN DÂY CHUYỀN', blocks: [{ sec: 'A. CHUỖI MỰC NƯỚC (tính ngược từ bể chứa)', rows: ctRows }] });

    /* ---------- chi phí ---------- */
    sec('ĐƠN GIÁ (GIẢ ĐỊNH – cập nhật theo thời điểm lập dự án)', [
      R('pE', 'Giá điện bình quân sản xuất', '–', 'đ/kWh', V('pE', 1950), 'GIẢ ĐỊNH – biểu giá EVN'),
      R('eta_mot', 'Hiệu suất động cơ điện', 'η_đc', '–', 0.95, '', { nf: '0.00' }),
      R('pPAC', 'Đơn giá PAC 31 %', '–', 'đ/kg', V('pPAC', 7000), 'GIẢ ĐỊNH'),
      R('pLime', 'Đơn giá vôi CaO', '–', 'đ/kg', V('pLime', 3000), 'GIẢ ĐỊNH'),
      R('pPoly', 'Đơn giá polymer anion', '–', 'đ/kg', V('pPoly', 70000), 'GIẢ ĐỊNH'),
      R('pPolyC', 'Đơn giá polymer cation (khử nước bùn)', '–', 'đ/kg', V('pPolyC', 80000), 'GIẢ ĐỊNH'),
      R('pCl', 'Đơn giá NaOCl 10 % (theo clo hoạt tính)', '–', 'đ/kg Cl₂', V('pCl', 40000), 'GIẢ ĐỊNH'),
      R('pKMn', 'Đơn giá KMnO₄', '–', 'đ/kg', V('pKMn', 60000), 'GIẢ ĐỊNH'),
      R('PACavg', 'Liều PAC trung bình năm', '–', 'mg/L', V('PACavg', Math.max(5, rd(PAC * Math.sqrt(NTUavg / Math.max(q.NTU, 1)), 1))), 'Theo độ đục trung bình'),
      R('rDS', 'Tỷ lệ bùn khô trung bình / bùn khô lớn nhất', '–', '–', Ksl, '', { nf: '0.00' }),
      R('pSl', 'Chi phí vận chuyển + xử lý bánh bùn', '–', 'đ/tấn', V('pSl', 250000), 'GIẢ ĐỊNH'),
      R('Kkt', 'Hệ số khai thác trung bình năm', '–', '–', V('Kkt', 0.85), '', { nf: '0.00' }),
      R('staff', 'Định biên lao động', '–', 'người', V('staff', Math.max(12, Math.round(0.2 * Q / 1000 + 10 * Math.pow(Q / 100000, 0.3)))), 'CLAUDE §11: ≈ 0,2 người / 1.000 m³·ngđ (tối thiểu 12)'),
      R('wage', 'Lương bình quân (kể BHXH, phụ cấp)', '–', 'tr.đ/tháng', V('wage', 17), ''),
      R('pUSD', 'Tỷ giá', '–', 'đ/USD', V('pUSD', 26000), 'GIẢ ĐỊNH')]);
    const cpA = civ.filter(x => x[0]).map((x, i) => [i + 1, x[0], 'm³', { f: `={${x[1]}}`, k: 'cp_q' + i }, { v: x[2], k: 'cp_u' + i }, { f: `={cp_q${i}}*{cp_u${i}}/1000`, k: 'cp_m' + i }, 'Dung tích xây dựng']);
    const nC = cpA.length;
    const bld = [['Nhà hóa chất + kho', 'm²', `=MAX(150,{Qtk}*0.004)`, 8], ['Nhà bơm rửa lọc + máy thổi khí / nhà thiết bị', 'm²', `=MAX(100,{Qtk}*0.0016)`, 10], ['Nhà trạm bơm cấp II (kể cả bể hút)', 'm²', `=MAX(120,{Qtk}*0.0035)`, 15], ['Nhà khử nước bùn + kho bánh bùn', 'm²', `=MAX(100,{Qtk}*0.004)`, 8], ['Nhà điều hành – phòng thí nghiệm', 'm² sàn', '=MAX(200,{staff}*13)', 9]];
    bld.forEach((b, j) => { const i = nC + j; cpA.push([i + 1, b[0], b[1], { f: b[2], k: 'cp_q' + i }, { v: b[3], k: 'cp_u' + i }, { f: `={cp_q${i}}*{cp_u${i}}/1000`, k: 'cp_m' + i }, '']); });
    let iA = cpA.length;
    cpA.push([iA + 1, 'Xử lý nền móng cho các bể', 'tr.đ', { f: '=(' + civ.filter(x => x[0]).map((x, i) => `{cp_m${i}}`).join('+') + ')*1000', k: 'cp_q' + iA }, { v: 0.2, k: 'cp_u' + iA }, { f: `={cp_q${iA}}*{cp_u${iA}}/1000`, k: 'cp_m' + iA }, 'Tỷ lệ 20 % chi phí bể – GIẢ ĐỊNH']); iA++;
    cpA.push([iA + 1, 'Công trình thu nước + nhà trạm bơm cấp I', 'công trình', { v: 1, k: 'cp_q' + iA }, { f: '=60000*({Qtk}/525000)^0.7', k: 'cp_u' + iA }, { f: `={cp_q${iA}}*{cp_u${iA}}/1000`, k: 'cp_m' + iA }, 'Quy đổi từ 60.000 tr.đ / công trình 525.000 m³/ngđ, mũ 0,7']); iA++;
    cpA.push([iA + 1, 'San nền, đường nội bộ, tường rào, PCCC, cấp thoát nước ngoài nhà', 'trọn gói', { v: 1, k: 'cp_q' + iA }, { f: '=114000*({Qtk}/525000)^0.7', k: 'cp_u' + iA }, { f: `={cp_q${iA}}*{cp_u${iA}}/1000`, k: 'cp_m' + iA }, 'Quy đổi từ file mẫu 500.000']); iA++;
    cpA.push([iA + 1, 'Tuyến ống nước thô ngoài trạm', 'm·mm', { f: '={ds_Lraw}*{ds_Dr}*1000', k: 'cp_q' + iA }, { v: 0.03, k: 'cp_u' + iA }, { f: `={cp_q${iA}}*{cp_u${iA}}/1000`, k: 'cp_m' + iA }, 'Thép lót XM ≈ 0,03 tr.đ/m/mm DN']); iA++;
    const cpB = [];
    const eq2 = eqp.filter(x => x[0]);
    eq2.forEach((x, i) => cpB.push([i + 1, x[0], x[1], typeof x[2] === 'number' ? { v: x[2], k: 'cq_q' + i } : { f: x[2], k: 'cq_q' + i }, typeof x[3] === 'number' ? { v: x[3], k: 'cq_u' + i } : { f: x[3], k: 'cq_u' + i }, { f: `={cq_q${i}}*{cq_u${i}}/1000`, k: 'cq_m' + i }, '']));
    let iB = cpB.length;
    const sumB = () => cpB.map((x, i) => `{cq_m${i}}`).join('+');
    cpB.push([iB + 1, 'Hệ hóa chất (pha, định lượng, bồn, kho)', 'hệ', { v: 1, k: 'cq_q' + iB }, { f: '=35000*({Qtk}/525000)^0.7', k: 'cq_u' + iB }, { f: `={cq_q${iB}}*{cq_u${iB}}/1000`, k: 'cq_m' + iB }, 'Quy đổi từ file mẫu']); iB++;
    cpB.push([iB + 1, 'Đo lường online, đồng hồ lưu lượng, thiết bị PTN', 'hệ', { v: 1, k: 'cq_q' + iB }, { f: '=20000*({Qtk}/525000)^0.6', k: 'cq_u' + iB }, { f: `={cq_q${iB}}*{cq_u${iB}}/1000`, k: 'cq_m' + iB }, '']); iB++;
    cpB.push([iB + 1, 'Đường ống, van, phụ kiện công nghệ trong trạm', 'tr.đ', { f: '=(' + sumB() + ')*1000', k: 'cq_q' + iB }, { v: 0.15, k: 'cq_u' + iB }, { f: `={cq_q${iB}}*{cq_u${iB}}/1000`, k: 'cq_m' + iB }, '15 % thiết bị – GIẢ ĐỊNH']); iB++;
    cpB.push([iB + 1, 'Điện động lực – tự động hóa – SCADA – TBA – máy phát', 'tr.đ', { f: '=(' + sumB() + ')*1000', k: 'cq_q' + iB }, { v: 0.22, k: 'cq_u' + iB }, { f: `={cq_q${iB}}*{cq_u${iB}}/1000`, k: 'cq_m' + iB }, '22 % thiết bị (CLAUDE §11: điện–SCADA 15 % + TBA, máy phát)']); iB++;
    cpB.push([iB + 1, 'Vận chuyển, lắp đặt, chạy thử, đào tạo', 'tr.đ', { f: '=(' + sumB() + ')*1000', k: 'cq_q' + iB }, { v: 0.08, k: 'cq_u' + iB }, { f: `={cq_q${iB}}*{cq_u${iB}}/1000`, k: 'cq_m' + iB }, '8 % thiết bị']); iB++;
    const kw = kwh.map((x, i) => R('op_e' + i, x[0], '–', 'kWh/ngđ', x[1], ''));
    kw.push(R('op_eo', 'Chiếu sáng, văn phòng, PTN, hóa chất, điều hòa', '–', 'kWh/ngđ', '=MAX(300,{Qtk}*0.007)', 'GIẢ ĐỊNH'));
    const kwSum = '=' + kw.map(x => `{${x.k}}`).join('+');
    const chemDay = [];
    if (hk('PAC')) chemDay.push('{Qtk}*{PACavg}/1000*{pPAC}');
    if (hk('lime')) chemDay.push('{Qtk}*{lime}*0.7/1000*{pLime}');
    if (hk('poly')) chemDay.push('{hc_poly}*{pPoly}');
    if (hk('kmn')) chemDay.push('{hc_kmn}*{pKMn}');
    chemDay.push((hk('cl1') ? '({hc_cl1}+{hc_cl2})' : '{hc_cl2}') + '*{pCl}');
    if (hk('pc')) chemDay.push('{sl_pd}*{rDS}*{pPolyC}');
    SH.push({ name: 'ChiPhi', title: 'CHI PHÍ ĐẦU TƯ VÀ CHI PHÍ VẬN HÀNH SƠ BỘ', ncol: 7, widths: [5, 52, 12, 14, 14, 14, 50], blocks: [
      { grid: { sec: 'A. XÂY DỰNG', head: ['TT', 'Hạng mục', 'Đơn vị', 'Khối lượng', 'Đơn giá (tr.đ)', 'Thành tiền (tỷ đ)', 'Ghi chú'], rows: cpA } },
      { grid: { sec: 'B. THIẾT BỊ CÔNG NGHỆ', head: ['TT', 'Hạng mục', 'Đơn vị', 'Khối lượng', 'Đơn giá (tr.đ)', 'Thành tiền (tỷ đ)', 'Ghi chú'], rows: cpB } },
      { sec: 'C. TỔNG MỨC ĐẦU TƯ SƠ BỘ', rows: [
        R('cp_XD', 'Chi phí xây dựng', 'G_XD', 'tỷ đ', '=' + cpA.map((x, i) => `{cp_m${i}}`).join('+'), 'Mục A'),
        R('cp_TB', 'Chi phí thiết bị', 'G_TB', 'tỷ đ', '=' + cpB.map((x, i) => `{cq_m${i}}`).join('+'), 'Mục B'),
        R('cp_k', 'Tỷ lệ QLDA + tư vấn + chi phí khác', '–', '–', 0.067, '1,2 % + 3,5 % + 2 % (CLAUDE §11)', { nf: '0.000' }),
        R('cp_dp', 'Tỷ lệ dự phòng', '–', '–', 0.1, '', { nf: '0.00' }),
        R('cp_GK', 'Chi phí QLDA + tư vấn + khác', 'G_K', 'tỷ đ', '=({cp_XD}+{cp_TB})*{cp_k}', ''),
        R('cp_GDP', 'Chi phí dự phòng', 'G_DP', 'tỷ đ', '=({cp_XD}+{cp_TB}+{cp_GK})*{cp_dp}', ''),
        R('cp_TM', 'TỔNG MỨC ĐẦU TƯ SƠ BỘ (chưa VAT, chưa GPMB)', 'TMĐT', 'tỷ đ', '={cp_XD}+{cp_TB}+{cp_GK}+{cp_GDP}', '', { nf: '#,##0.0' }),
        R('cp_USD', 'Quy đổi USD', '–', 'triệu USD', '={cp_TM}*1000/{pUSD}', '', { nf: '0.00' }),
        R('cp_s', 'Suất đầu tư', 's', 'tr.đ/(m³/ngđ)', '={cp_TM}*1000/{Q}', '', { nf: '0.00' }),
        R('cp_sc', 'Đối chiếu suất đầu tư (tham khảo)', '–', '', '=IF(AND({cp_s}>=3,{cp_s}<=8),"Trong dải tham khảo 3÷8 tr.đ/(m³/ngđ)","Ngoài dải 3÷8 – kiểm tra đơn giá / quy mô")', 'CLAUDE §11', { sel: 1 })] },
      { sec: 'D. CHI PHÍ VẬN HÀNH', rows: [
        ...kw,
        R('op_E', 'TỔNG ĐIỆN NĂNG', 'E', 'kWh/ngđ', kwSum, ''),
        R('op_sE', 'Suất tiêu thụ điện', 'e', 'kWh/m³', '={op_E}/{Q}', '', { nf: '0.000' }),
        R('op_cE', 'Chi phí điện / năm', '–', 'tỷ đ/năm', '={op_E}*{Kkt}*365*{pE}/10^9', ''),
        R('op_cC', 'Chi phí hóa chất / năm', '–', 'tỷ đ/năm', '=(' + chemDay.join('+') + ')*{Kkt}*365/10^9', 'Theo liều trung bình năm'),
        R('op_cL', 'Chi phí nhân công / năm', '–', 'tỷ đ/năm', '={staff}*{wage}*12/1000', ''),
        R('op_cM', 'Chi phí bảo dưỡng – sửa chữa / năm (2 % TB + 0,5 % XD)', '–', 'tỷ đ/năm', '=0.02*{cp_TB}+0.005*{cp_XD}' + (ch.filt === 'uf' ? '+{f_At}*1.3/{uf_life}/1000' : '') + (adv.includes('gac') ? '+{gac_M}*45/1000*365/{gac_day}' : '') + (adv.includes('ro') ? '+{ro_nel}*18/7/1000' : ''), ch.filt === 'uf' ? 'Kể thay màng UF 1,3 tr.đ/m² theo tuổi thọ' : ''),
        R('op_cS', 'Vận chuyển + xử lý bánh bùn / năm', '–', 'tỷ đ/năm', '={sl_cake}*{rDS}*365*{pSl}/10^9', ''),
        R('op_cO', 'Chi phí khác / năm (8 %)', '–', 'tỷ đ/năm', '=({op_cE}+{op_cC}+{op_cL}+{op_cM}+{op_cS})*0.08', ''),
        R('op_T', 'TỔNG CHI PHÍ VẬN HÀNH / NĂM', '–', 'tỷ đ/năm', '={op_cE}+{op_cC}+{op_cL}+{op_cM}+{op_cS}+{op_cO}', ''),
        R('op_V', 'Sản lượng nước sạch / năm', '–', 'm³/năm', '={Q}*{Kkt}*365', ''),
        R('op_u', 'Chi phí vận hành đơn vị', '–', 'đ/m³', '={op_T}*10^9/{op_V}', '', { nf: '#,##0' }),
        R('op_kh', 'Khấu hao / năm (XD 25 năm, TB 12 năm, phân bổ chi phí khác)', '–', 'tỷ đ/năm', '=({cp_XD}+({cp_GK}+{cp_GDP})*{cp_XD}/({cp_XD}+{cp_TB}))/25+({cp_TB}+({cp_GK}+{cp_GDP})*{cp_TB}/({cp_XD}+{cp_TB}))/12', ''),
        R('op_full', 'GIÁ THÀNH SẢN XUẤT ĐẦY ĐỦ (VH + khấu hao)', '–', 'đ/m³', '=({op_T}+{op_kh})*10^9/{op_V}', '', { nf: '#,##0' })] }] });
    keyRes.push(['Tổng mức đầu tư sơ bộ', 'cp_TM', 'tỷ đ'], ['Suất đầu tư', 'cp_s', 'tr.đ/(m³/ngđ)'], ['Suất tiêu thụ điện', 'op_sE', 'kWh/m³'], ['Chi phí vận hành đơn vị', 'op_u', 'đ/m³'], ['Giá thành sản xuất đầy đủ', 'op_full', 'đ/m³']);

    /* ---------- lắp ráp: 00, 01, 02, 03, công nghệ, 13 tổng hợp ---------- */
    const chainTxt = chainText(ch);
    const order = ['Lang_SoBo', 'LamThoang', 'BeTron', 'TaoBong', 'LangTexler', 'LangLamen', 'LangNgang', 'TuyenNoi_DAF', 'BeLoc', 'BeLoc_ApLuc', 'BeLoc_Cham', 'LocMang_UF', 'RuaLoc', 'LocThan_GAC', 'LocRO', 'KhuTrung', 'Bun', 'CaoTrinh', 'ChiPhi'];
    SH.sort((x, y) => order.indexOf(x.name) - order.indexOf(y.name));
    const all = [{ name: '02_CanBang' }, { name: '03_HoaChat' }, ...SH];
    let no = 4;
    for (const s of SH) { s.name = String(no).padStart(2, '0') + '_' + s.name; s.title = String(no).padStart(2, '0') + ' – ' + s.title; no++; }
    // sheet 01
    const dvSheet = { name: '01_DauVao', title: '01 – THÔNG SỐ ĐẦU VÀO', sub: 'Quy ước: chữ XANH DƯƠNG trên nền VÀNG = ô nhập liệu  •  chữ ĐEN = ô công thức  •  chữ XANH LÁ = tham chiếu sang sheet khác  •  nền XANH NHẠT = kết quả chọn.', sub2: 'Mọi số liệu ghi "GIẢ ĐỊNH" cần thay bằng kết quả quan trắc nước nguồn / Jar-test / tài liệu nhà cung cấp trước khi dùng cho hồ sơ thiết kế.', blocks: dv.map((s, i) => ({ sec: SEQ[i] + '. ' + s.t, rows: s.rows, noteHead: 'Nguồn / Ghi chú' })) };
    const tong = { name: String(no).padStart(2, '0') + '_TongHop', kind: 'th', title: String(no).padStart(2, '0') + ' – TỔNG HỢP THÔNG SỐ THIẾT KẾ VÀ BẢNG KIỂM TRA', blocks: [] };
    const guide = { name: '00_HuongDan', title: 'BẢNG TÍNH TOÁN THIẾT KẾ CÔNG NGHỆ – TRẠM XỬ LÝ NƯỚC CẤP ' + vn(Q, 0) + ' m³/ngđ' + (P.name ? ' – ' + P.name.toUpperCase() : ''), freeze: 0, widths: [5, 22, 30, 20, 20, 56], blocks: [
      { text: ['Dây chuyền: ' + chainTxt, 'Lập bằng XLNuoc (bộ phần mềm XLN_Ducnv515' + (typeof XLNT_VERSION !== 'undefined' ? ' v' + XLNT_VERSION : '') + ') – bảng tính công thức sống, mở bằng Excel sẽ tự tính lại toàn bộ.', 'Nguồn chỉ tiêu: MWH Water Treatment: Principles and Design (3rd ed.); TCXDVN 33:2006; QCVN 01-1:2018/BYT' + (ch.clar === 'texler' || ch.filt === 'xa' ? '; Leopold P9.007 / P9.014 / P9.016' : '') + '.', 'Quy ước: ô nền vàng chữ xanh – số nhập/chọn; chữ xanh lá – liên kết sheet khác; dòng kiểm tra hiện "ĐẠT …" hoặc "XEM LẠI …"; sheet Tổng hợp gom toàn bộ kiểm tra.'] },
      { sec: 'A. DANH MỤC SHEET', head: ['TT', 'Sheet', '', 'Nội dung', '', ''], rows: [] },
      { sec: 'B. GIẢ ĐỊNH CẦN XÁC NHẬN', head: ['TT', 'Nội dung', '', '', '', ''], rows: [] }] };
    const sheetsAll = [guide, dvSheet, cb, hcs, ...SH, tong];
    guide.blocks[1].rows = sheetsAll.map(s => ({ l: s.name, t: s.title.replace(/^\d+ – /, '') }));
    const ass = ['Chất lượng nước nguồn là GIẢ ĐỊNH – thay bằng quan trắc tối thiểu 1 năm (mùa lũ, mùa khô).', 'Liều hóa chất phải xác định bằng Jar-test (MWH §9-4).', 'Đơn giá đầu tư và vận hành là GIẢ ĐỊNH (mặt bằng giá 2026) – cập nhật theo thời điểm lập dự án.', 'Mực nước thấp nhất tại công trình thu, chiều dài tuyến ống nước thô, cột áp ra mạng: GIẢ ĐỊNH.', ...notes];
    guide.blocks[2].rows = ass.map(x => ({ l: x }));
    // tổng hợp: kết quả chính + kiểm tra
    const M0 = XLNB.build({ sheets: sheetsAll.slice(0, -1) });
    const chk = M0.checks;
    tong.blocks = [
      { sec: 'A. TỔNG HỢP THÔNG SỐ CÔNG TRÌNH', rows: [R('', 'Công suất hữu ích', '', 'm³/ngđ', '={Qu}', ''), R('', 'Công suất thiết kế của trạm', '', 'm³/ngđ', '={Qtk}', ''), R('', 'Lưu lượng giờ qua trộn – phản ứng – lắng', '', 'm³/h', '={Qhtr}', ''),
        ...dims.map(d => R('', d[0] + ' – số lượng × kích thước', '', '', `=TEXT({${d[1]}},"0")&" × "&{${d[2]}}`, '')), ...keyRes.map(x => R('', x[0], '', x[2], `={${x[1]}}`, ''))] },
      { sec: 'B. BẢNG KIỂM TRA TỔNG HỢP – tất cả phải hiện "ĐẠT"', rows: chk.map(c => ({ l: c.l, chk: `='${c.sheet}'!$${c.addr.replace(/(\d+)/, '$$$1')}` })) },
      { end: { l: 'KẾT LUẬN CHUNG', k: 'th_end', f: '' } }];
    const M = XLNB.build({ sheets: sheetsAll });
    // công thức kết luận: đếm "ĐẠT" trong vùng kiểm tra
    const ths = M.sheets[M.sheets.length - 1], rows = M.thRows;
    const r0 = Math.min(...rows), r1 = Math.max(...rows), n = chk.length;
    const endA = M.keys.th_end[1];
    M.cells[ths][endA] = ['f', `IF(SUMPRODUCT(--(LEFT(D${r0}:D${r1},3)="ĐẠT"))=${n},"TẤT CẢ ${n} CHỈ TIÊU ĐỀU ĐẠT","CÓ "&(${n}-SUMPRODUCT(--(LEFT(D${r0}:D${r1},3)="ĐẠT")))&" CHỈ TIÊU CẦN XEM LẠI / THAM KHẢO")`];
    M.thRange = [ths, r0, r1, n];
    M.auto = auto; M.chainTxt = chainTxt; M.notes = ass; M.kind = 'gen'; M.dims = dims; M.keyRes = keyRes;
    return M;
  }

  function chainText(ch) {
    const p = [];
    if (ch.pre !== 'none') p.push(TECH.pre[ch.pre]);
    if (!(ch.pre === 'aer' && ch.clar === 'none')) { p.push(TECH.mix[ch.mix]); p.push(TECH.floc[ch.floc]); }
    if (ch.clar !== 'none') p.push(TECH.clar[ch.clar]);
    p.push(TECH.filt[ch.filt]);
    for (const a of ch.adv || []) p.push(TECH.adv[a]);
    p.push(TECH.dis[ch.dis] + ' – bể chứa – bơm cấp II');
    p.push('Bùn: ' + TECH.sl[ch.sl]);
    return p.join(' → ');
  }

  /* dựng + tính; nếu hệ số a giả thiết không đủ bao phủ nước dùng bản thân (sheet 02) thì nâng a và dựng lại (khi người dùng chưa khóa a) */
  // ô nhập người dùng sửa (P.ov theo khóa) ghi thẳng vào ô của bảng tính (kể cả hằng số không qua V())
  function applyOv(M, ov) {
    for (const k in ov || {}) {
      const t = M.keys[k], v = +ov[k]; if (!t || ov[k] === '' || !isFinite(v)) continue;
      const c = M.cells[t[0]][t[1]];
      if (c && c[0] === 'n') { M.cells[t[0]][t[1]] = ['n', v]; const i = M.inputs.find(x => x.s === t[0] && x.a === t[1]); if (i) i.v = v; }
    }
    return M;
  }
  function run(P) {
    const mk = p => applyOv(make(p), p.ov);
    let M = mk(P), B = XLCALC.book(M.cells), V = B.evalAll();
    const g = k => { const t = M.keys[k]; return t ? B.get(t[0], t[1]) : undefined; };
    for (let it = 0; it < 4 && !(P.ov && P.ov.a !== undefined) && g('cb_a') > g('a') + 1e-9; it++) {
      P = Object.assign({}, P, { _aAuto: Math.ceil((g('cb_a') + 0.004) * 100) / 100 });
      M = mk(P); B = XLCALC.book(M.cells); V = B.evalAll();
    }
    XLNB.styleFormulas(M, V);
    M.book = B; M.vals = V;
    return M;
  }
  return { make, run, TECH, chainText, isLeopold, sizeTexler, sizeXA, iec, IEC, muT, rhoT };
})();
if (typeof module !== 'undefined') module.exports = XLNG;
