'use strict';
/* ==========================================================================
   XLNuoc – dây chuyền của FILE MẪU (Leopold Texler + CT2 + lọc Type XA / IMS 200, 21 sheet).
   Bảng tính được tính bằng chính công thức của file mẫu (XLN_TPL.cells qua XLCALC); khi xuất Excel chỉ thay
   giá trị ô nhập + giá trị lưu sẵn của ô công thức trong các tệp XML gốc → cấu trúc, định dạng, công thức y hệt file mẫu.
   Tự chọn kích thước (khi bật): số bể/kích thước bể trộn, phản ứng, Texler, CT2, bể lọc XA, bơm, bể chứa, bùn,
   rồi các bảng phụ (danh sách bể, thiết bị, nhân lực, đường ống, đơn giá) quy đổi theo công suất – mọi giá trị là ô nhập sửa được.
   ========================================================================== */
const XLNL = (() => {
  const T = XLN_TPL, D = '01_DauVao';
  const IEC = XLNG.IEC, iec = XLNG.iec;
  const up = (x, s) => Math.ceil(x / s - 1e-9) * s, rd = (x, s) => Math.round(x / s) * s, c10 = x => up(x, 0.1);
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const DEF = {}; for (const i of T.inputs) DEF[i.s + '!' + i.a] = i.v;
  const Q0 = DEF[D + '!D6'];
  // các dòng kiểm tra của sheet 13 (D58:D117) → ô gốc
  const CHECKS = [];
  for (let r = 58; r <= 117; r++) {
    const f = T.cells['13_TongHop']['D' + r][1], m = f.match(/^'([^']+)'!\$([A-Z]+)\$(\d+)$/);
    CHECKS.push({ sheet: m[1], addr: m[2] + m[3], l: T.cells['13_TongHop']['B' + r][1], th: 'D' + r });
  }
  // khóa ngữ nghĩa → ô của file mẫu (giao diện, trao đổi dữ liệu, so sánh phương án)
  const K = {
    Q: [D, 'D6'], a: [D, 'D7'], Qtk: ['02_CanBang', 'D7'], Qh: ['02_CanBang', 'D8'], Qhtr: ['02_CanBang', 'D12'], QhF: ['02_CanBang', 'D14'], Qmax2: ['02_CanBang', 'D15'],
    NTU: [D, 'D13'], SS: [D, 'D14'], T: [D, 'D17'], PAC: [D, 'D26'], Cl1: [D, 'D32'], Cl2: [D, 'D33'], lime: [D, 'D30'], poly: [D, 'D28'],
    mx_N: [D, 'D38'], mx_tt: ['04_BeTron', 'D11'], fl_t: ['05_TaoBong', 'D15'], fl_Camp: ['05_TaoBong', 'D35'],
    cl_N: [D, 'D56'], tx_B: [D, 'D60'], tx_L: [D, 'D61'], tx_SLR: ['06_LangTexler', 'D13'], tx_u: ['06_LangTexler', 'D26'], tx_run: ['06_LangTexler', 'D70'], tx_nh: [D, 'D77'],
    f_N: [D, 'D83'], f_A1: ['07_BeLoc', 'D11'], f_At: ['07_BeLoc', 'D12'], f_v: ['07_BeLoc', 'D13'], bw_Qw: ['09_RuaLoc', 'D24'], bw_Vd: ['09_RuaLoc', 'D33'],
    ds_V: ['10_KhuTrung', 'D8'], ds_CTa: ['10_KhuTrung', 'D22'], ds_sel1: ['10_KhuTrung', 'D33'], ds_sel2: ['10_KhuTrung', 'D41'],
    sl_DS: ['11_Bun', 'D10'], sl_cake: ['11_Bun', 'D31'], sl_Vcl: ['11_Bun', 'D12'], sl_pd: ['11_Bun', 'D40'],
    cp_TM: ['19_ChiPhiDauTu', 'D63'], cp_s: ['19_ChiPhiDauTu', 'D66'], op_sE: ['20_ChiPhiVanHanh', 'D16'], op_u: ['20_ChiPhiVanHanh', 'D46'], op_full: ['20_ChiPhiVanHanh', 'D53'],
    op_E: ['20_ChiPhiVanHanh', 'D15'], th_end: ['13_TongHop', 'D119'], ds_H1s: [D, 'D139'], ds_H2: [D, 'D142'], cl_A1: ['06_LangTexler', 'D12'], mx_dim: ['04_BeTron', 'D8'],
    cl_dim: ['06_LangTexler', 'D77'], f_dim: ['07_BeLoc', 'D50'], fl_dim: ['05_TaoBong', 'D18']
  };
  const KEYRES = [['Lắng Texler – tải trọng bề mặt', 'tx_SLR', 'm/h'], ['Lắng Texler – tải trọng trên tấm', 'tx_u', 'm/h'], ['CT2 – thời gian chạy', 'tx_run', 'h/ngđ'],
    ['Lọc – số bể', 'f_N', 'bể'], ['Lọc – tổng diện tích', 'f_At', 'm²'], ['Lọc – vận tốc lọc bình thường', 'f_v', 'm/h'], ['Rửa lọc – tổng nước rửa 1 ngày', 'bw_Vd', 'm³/ngđ'],
    ['Bể chứa – dung tích', 'ds_V', 'm³'], ['Khử trùng – CT đạt được', 'ds_CTa', 'mg·min/L'], ['Bơm cấp I', 'ds_sel1', ''], ['Bơm cấp II', 'ds_sel2', ''],
    ['Bùn khô phát sinh', 'sl_DS', 'kg DS/ngđ'], ['Bánh bùn', 'sl_cake', 'tấn/ngđ'], ['Tổng mức đầu tư sơ bộ', 'cp_TM', 'tỷ đ'], ['Suất đầu tư', 'cp_s', 'tr.đ/(m³/ngđ)'],
    ['Suất tiêu thụ điện', 'op_sE', 'kWh/m³'], ['Chi phí vận hành đơn vị', 'op_u', 'đ/m³'], ['Giá thành sản xuất đầy đủ', 'op_full', 'đ/m³']];

  /* ---------- đầu bài → ô nhập của file mẫu ---------- */
  function fromBrief(P, set) {
    const q = P.q, s = (k, v) => { if (v !== undefined && v !== null && isFinite(v)) set[D + '!' + k] = v; };
    s('D6', P.Q); s('D13', q.NTU); s('D14', q.SS); s('D15', q.color); s('D16', q.pH); s('D17', q.T); s('D18', q.alk);
    s('D21', +XLNG.rhoT(q.T).toFixed(1)); s('D22', +XLNG.muT(q.T).toPrecision(4)); s('D10', P.Kh); s('D142', P.H2);
    if (P.MNTN != null) s('D185', P.MNTN);
    const ch = P.chem || {};
    const pac = ch.PAC != null ? ch.PAC : Math.max(10, rd(5.6 * Math.pow(Math.max(q.NTU, 1), 0.33) + 0.1 * Math.max(0, q.color - 15) + (q.TOC > 3 ? 4 * (q.TOC - 3) : 0), 5));
    s('D26', pac); s('D30', rd(Math.max(5, 0.56 * Math.max(0, 60 - (q.alk - 0.45 * pac)) + 13), 1));
    s('D32', 1 + (q.NH4 > 0.2 ? Math.min(8, 7.6 * q.NH4) : 0));
    const avg = q.NTUavg || q.NTU * 0.3;
    s('D202', Math.max(5, rd(pac * Math.sqrt(avg / Math.max(q.NTU, 1)), 5))); s('D204', +Math.max(0.2, Math.pow(avg / Math.max(q.NTU, 1), 0.7)).toFixed(2));
  }

  /* ---------- tự chọn kích thước ---------- */
  function sizeMain(P, set, a) {
    const q = P.q, Q = P.Q, Qtk = Q * a, rth = 0.05, Qhtr = Qtk * (1 + rth) / 24, Qs = Qhtr / 3600, mu = XLNG.muT(q.T), s = Qtk / (Q0 * 1.05);
    const Vsl = Qtk * (q.SS * 0.9 + 19) / 1000 / 15;
    const S = (k, v) => { set[D + '!' + k] = v; };
    S('D7', a);
    // trộn: 2 bể, t ≈ 45 s, H/B ≈ 0,84
    const qm = Qs / 2, Vr = qm * 45, B = Math.max(1, c10(Math.cbrt(Vr / 0.836))), H = Math.max(1, c10(Vr / (B * B)));
    S('D38', 2); S('D42', B); S('D43', H);
    // Texler + CT2
    const t = XLNG.sizeTexler({ Qh: Qhtr, Vsl, nu: mu / XLNG.rhoT(q.T) });
    if (t) { S('D56', t.N); S('D57', t.ntr); S('D60', t.B); S('D61', t.L); S('D62', t.C); S('D73', +(t.C + 0.6).toFixed(1)); S('D77', t.nh); S('D72', +t.h.toFixed(3)); }
    const N = t ? t.N : DEF[D + '!D56'], Wt = t ? t.B : DEF[D + '!D60'];
    // phản ứng: 3 buồng, t ≈ 23 min, cùng chiều sâu bể lắng + 0,15
    const Q1 = Qhtr / N, l = Math.max(1, c10(23 * Q1 / 60 / (3 * Wt * 4.75)));
    S('D47', Math.max(1, Math.ceil(Wt / 9 - 1e-9))); S('D48', l); S('D49', 4.75);
    // bể lọc XA
    const QhF = Qhtr - Vsl / 24, x = XLNG.sizeXA({ QhF, Qtk });
    if (x) { S('D83', x.N); S('D84', 2); S('D85', x.A); S('D88', x.E); S('D107', Math.max(30, Math.ceil(205 / x.v))); S('D109', Math.max(0.6, c10(Math.sqrt(30 * x.A1 / 3600 / 0.72)))); }
    const A1 = x ? x.A1 : 166.4;
    S('D126', 30 * A1 > 3000 ? 2 : 1); S('D128', Qtk > 150000 ? 3 : 2);
    // bể chứa, bơm
    const pct = Q >= 100000 ? 12 : Q >= 20000 ? 15 : 20, nt = Q >= 100000 ? 4 : 2, Ht = Q >= 20000 ? 5 : 4;
    S('D131', pct); S('D132', nt); S('D133', Ht); S('D134', Math.max(4, Math.round(Math.sqrt(Q * pct / 100 / nt / Ht / 1.1))));
    S('D138', Math.max(2, Math.ceil(Qtk / 24 / 3650 - 1e-9))); S('D141', Math.max(2, Math.ceil(Q / 24 * (P.Kh || 1.5) / 3900 - 1e-9)));
    // bùn
    const DS = Qtk * (q.SS * 0.9 + DEF[D + '!D26'] * 0.474) / 1000;
    S('D150', Math.max(Q >= 5000 ? 2 : 1, Math.ceil(DS / 25 / (Math.PI / 4 * 45 * 45) - 1e-9)));
    const hrs = Q >= 50000 ? 20 : 8; S('D152', hrs); S('D153', Math.max(1, Math.ceil(DS / hrs / 1900 - 1e-9)));
    // nội bộ, đường ống
    S('D172', rd(30000 * Math.pow(s, 0.7), 100)); S('D174', Math.max(5, rd(50 * Math.pow(s, 0.7), 1)));
    S('D186', Q >= 50000 ? 500 : 300); S('D187', Math.max(30, rd(150 * Math.sqrt(s), 10)));
    return { s, t, x };
  }
  // các bảng phụ quy đổi theo công suất (ô nhập ở sheet 14, 15, 17, 18, 19, 20)
  function sizeAux(set, s, nIntake) {
    const Sx = (sh, a, v) => { set[sh + '!' + a] = v; };
    const sc = (k, e, min, step) => Math.max(min || 0, rd(DEF[k] * Math.pow(s, e), step || 1));
    // 15 – thiết bị (công suất động cơ không tính bằng công thức)
    Sx('15_DanhSachTB', 'D7', Math.max(1, Math.round(4 * Math.sqrt(s) / nIntake) * nIntake));
    for (const a of ['H11', 'H15', 'H42', 'H46', 'H13', 'H44']) Sx('15_DanhSachTB', a, iec(DEF['15_DanhSachTB!' + a] * Math.pow(s, 0.6)));
    Sx('15_DanhSachTB', 'D48', s > 0.2 ? 3 : 2);
    // 17 – nhân lực, nhà điều hành
    for (let r = 5; r <= 17; r++) {
      const c = '17_NhanLuc_NhaDH!C' + r, e = '17_NhanLuc_NhaDH!E' + r;
      if (DEF[c] > 0) set[c] = Math.max(1, Math.round(DEF[c] * Math.pow(s, 0.3)));
      if (DEF[e] > 0) set[e] = r === 5 ? (s >= 0.2 ? 3 : s >= 0.04 ? 2 : 1) : Math.max(1, Math.round(DEF[e] * Math.pow(s, 0.4)));
    }
    for (let r = 29; r <= 40; r++) set['17_NhanLuc_NhaDH!D' + r] = sc('17_NhanLuc_NhaDH!D' + r, 0.35, 12, 1);
    Sx('17_NhanLuc_NhaDH', 'D44', s >= 0.2 ? 3 : s >= 0.04 ? 2 : 1);
    // 18 – đường ống, kênh
    const lines = s >= 0.19 ? 2 : 1;
    for (const a of ['D5', 'D9', 'D18']) Sx('18_DuongOng_TroLuc', a, lines);
    for (const [a, e, m] of [['I10', 0.5, 30], ['I13', 0.5, 30], ['I14', 0.5, 50], ['I16', 0.5, 50], ['I18', 0.5, 50]]) set['18_DuongOng_TroLuc!' + a] = sc('18_DuongOng_TroLuc!' + a, e, m, 5);
    for (let r = 27; r <= 30; r++) {
      for (const c of ['E', 'F']) set[`18_DuongOng_TroLuc!${c}${r}`] = Math.max(0.5, rd(DEF[`18_DuongOng_TroLuc!${c}${r}`] * Math.sqrt(s), 0.1));
      set[`18_DuongOng_TroLuc!I${r}`] = sc(`18_DuongOng_TroLuc!I${r}`, 0.5, 10, 5);
    }
    // 19 – khối lượng và đơn giá quy đổi
    const P19 = '19_ChiPhiDauTu!';
    set[P19 + 'D11'] = nIntake;
    set[P19 + 'E11'] = rd(60000 * Math.pow(s * 2 / nIntake, 0.7), 100);
    for (const [a, e] of [['D13', 0.7], ['D14', 0.6], ['D15', 0.6], ['D16', 0.7], ['D17', 0.6], ['D18', 0.5], ['D19', 0.8], ['D20', 0.7], ['D21', 0.5]]) set[P19 + a] = sc(P19 + a, e, 20, 10);
    for (const [a, e] of [['E22', 0.7], ['E39', 0.7], ['E42', 0.7], ['E43', 0.6]]) set[P19 + a] = sc(P19 + a, e, 300, 10);
    set['20_ChiPhiVanHanh!D14'] = sc('20_ChiPhiVanHanh!D14', 0.8, 150, 10);
  }
  // sau lượt tính 1: các giá trị phụ thuộc kết quả (động cơ, cột áp, kích thước bể phụ, đơn giá thiết bị)
  function sizeFromResults(B, set, s) {
    const g = (sh, a) => B.get(sh, a);
    const S = (k, v) => { if (isFinite(v)) set[k] = v; };
    S('04_BeTron!D20', iec(g('04_BeTron', 'D19') * 1.25));
    const Bm = g(D, 'D42'); S('04_BeTron!D23', Math.round(3.9 * 60 / (Math.PI * 0.45 * Bm)));
    S('05_TaoBong!D23', iec(g('05_TaoBong', 'D22') * 1.25)); S('05_TaoBong!D26', iec(g('05_TaoBong', 'D25') * 1.25)); S('05_TaoBong!D29', iec(g('05_TaoBong', 'D28') * 1.25));
    S(D + '!D139', Math.ceil(g('18_DuongOng_TroLuc', 'D41') - 1e-9));
    // tổn thất dành sẵn ở sheet 01 (cao trình) không nhỏ hơn tổn thất tính ở sheet 18
    for (const [c, al, st] of [['D45', 'D167', 0.05], ['D47', 'D165', 0.05], ['D51', 'D164', 0.05], ['D57', 'D128', 0.5]]) {
      const need = g('18_DuongOng_TroLuc', c);
      if (need > g(D, al)) S(D + '!' + al, Math.ceil(need / st - 1e-9) * st);
    }
    // ngưỡng tràn sau lọc ≥ MN bể chứa + tổn thất lọc → bể chứa (giữ nguyên cột nước lọc khả dụng)
    const zw = g(D, 'D163') + (set[D + '!D164'] !== undefined ? set[D + '!D164'] : g(D, 'D164'));
    if (zw > g(D, 'D105') + 1e-9) { const dz = +(zw - g(D, 'D105')).toFixed(2); S(D + '!D105', +(g(D, 'D105') + dz).toFixed(2)); S(D + '!D104', +(g(D, 'D104') + dz).toFixed(2)); }
    S('14_DanhSachBe!E12', Math.max(3, Math.ceil(Math.sqrt(g('14_DanhSachBe', 'H12') / g('14_DanhSachBe', 'G12')) - 1e-9)));
    S('14_DanhSachBe!E14', Math.max(3, Math.ceil(Math.sqrt(g('14_DanhSachBe', 'H14') / g('14_DanhSachBe', 'G14')) - 1e-9)));
    S('14_DanhSachBe!E15', Math.max(3, Math.ceil(Math.sqrt(g('14_DanhSachBe', 'H15') / g('14_DanhSachBe', 'G15')) - 1e-9)));
    const qr = g('16_CanBangNuoc', 'D24') / 24 / 2, Hr = g(D, 'D192');
    S('15_DanhSachTB!H40', iec(998 * 9.81 * qr / 3600 * Hr / 0.75 / 1000 * 1.15));
    S('15_DanhSachTB!H43', iec(75 * Math.pow(g('11_Bun', 'D29') / 1896, 0.7)));
    S('15_DanhSachTB!H41', iec(1.5 * Math.pow(g('11_Bun', 'D19') / 44, 0.8)));
    const P19 = '19_ChiPhiDauTu!', pr = (a, base, x, x0, e) => S(P19 + a, Math.max(5, rd(base * Math.pow(Math.max(x, 1e-6) / x0, e), 5)));
    pr('E27', 2800, g('10_KhuTrung', 'D32'), 223.1, 0.7); pr('E38', 5500, g('10_KhuTrung', 'D40'), 583.1, 0.7);
    pr('E34', 1500, g('09_RuaLoc', 'D48'), 95.17, 0.7); pr('E35', 2800, g('09_RuaLoc', 'D52'), 159.3, 0.7);
    pr('E28', 1500, g('04_BeTron', 'D19'), 85.4, 0.7); pr('E40', 7000, g('11_Bun', 'D29'), 1896, 0.6);
    pr('E41', 2500, g('11_Bun', 'D19'), 43.95, 0.8); pr('E36', 200, g('18_DuongOng_TroLuc', 'G7'), 800, 1.2); pr('E37', 450, g('18_DuongOng_TroLuc', 'G8'), 700, 1.2);
    pr('E31', 500, g('06_LangTexler', 'D64'), 8.567, 0.5); pr('E29', 180, g('05_TaoBong', 'D22'), 0.563, 0.5);
  }

  /* ---------- chạy ---------- */
  // P.auto: true → tự chọn kích thước theo Q; P.ovT: {'sheet!A1': giá trị} – ô người dùng sửa (luôn thắng)
  function run(P) {
    const ovT = P.ovT || {};
    const make = (set) => {
      const B = XLCALC.book(T.cells);
      for (const k in set) { const i = k.indexOf('!'); B.set(k.slice(0, i), k.slice(i + 1), set[k]); }
      for (const k in ovT) { const i = k.indexOf('!'); if (isFinite(+ovT[k]) && ovT[k] !== '') B.set(k.slice(0, i), k.slice(i + 1), +ovT[k]); }
      return B;
    };
    const set = {};
    fromBrief(P, set);
    let B, info = null;
    if (P.auto) {
      let a = ovT[D + '!D7'] !== undefined ? +ovT[D + '!D7'] : 1.05;
      for (let it = 0; it < 3; it++) {
        info = sizeMain(P, set, a);
        sizeAux(set, info.s, P.nIntake || 1);
        B = make(set);
        sizeFromResults(B, set, info.s); B = make(set);
        sizeFromResults(B, set, info.s); B = make(set);
        const need = B.get('02_CanBang', 'D21');
        if (ovT[D + '!D7'] !== undefined || need <= a + 1e-9) break;
        a = Math.ceil((need + 0.004) * 100) / 100;
      }
    } else B = make(set);
    const vals = B.evalAll();
    const auto = {};
    for (const k in set) if (DEF[k] !== undefined) auto[k] = set[k];
    return { kind: 'tpl', sheets: T.sheets, book: B, vals, cells: B.sheets, set: auto, ovT, inputs: T.inputs, checks: CHECKS, keys: K, keyRes: KEYRES,
      chainTxt: XLNG.chainText({ pre: 'none', mix: 'mech', floc: 'mech', clar: 'texler', filt: 'xa', adv: [], dis: 'naocl', sl: 'centri' }), info,
      thRange: ['13_TongHop', 58, 117, 60], dims: [['Bể trộn nhanh', 'mx_N', 'mx_dim'], ['Bể lắng Texler + phản ứng', 'cl_N', 'cl_dim'], ['Bể lọc Leopold XA', 'f_N', 'f_dim']] };
  }
  const val = (M, k) => { const t = M.keys[k]; return t ? M.book.get(t[0], t[1]) : undefined; };

  /* ---------- xuất .xlsx giữ nguyên cấu trúc file mẫu ---------- */
  const X = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  async function xlsx(M, P) {
    const z = await XLSX_READ.unzip(XLCALC_b64(T.xlsx));
    const files = {};
    for (const n of z.names) files[n] = await z.get(n);
    const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels'];
    const rid = {}; rels.replace(/<Relationship [^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g, (m, i, t) => { rid[i] = 'xl/' + t.replace(/^\/?xl\//, ''); });
    rels.replace(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="(rId\d+)"/g, (m, t, i) => { rid[i] = 'xl/' + t.replace(/^\/?xl\//, ''); });
    const map = {}; wb.replace(/<sheet [^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g, (m, n, i) => { map[n.replace(/&amp;/g, '&')] = rid[i]; });
    const isIn = {}; for (const i of T.inputs) isIn[i.s + '!' + i.a] = 1;
    const B = M.book;
    for (const sh of T.sheets) {
      const f = map[sh]; if (!f || !files[f]) continue;
      files[f] = files[f].replace(/<c r="([A-Z]+\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, (all, a, attr, tail, inner) => {
        const c = T.cells[sh][a];
        if (!c) return all;
        if (c[0] === 'f') {
          const v = M.vals[sh][a], fx = (inner || '').match(/<f[\s\S]*?(<\/f>|\/>)/);
          const fpart = fx ? fx[0] : `<f>${X(c[1])}</f>`;
          const at = attr.replace(/\s+t="[^"]*"/, '');
          if (typeof v === 'number' && isFinite(v)) return `<c r="${a}"${at}>${fpart}<v>${v}</v></c>`;
          if (typeof v === 'boolean') return `<c r="${a}"${at} t="b">${fpart}<v>${v ? 1 : 0}</v></c>`;
          if (v && typeof v === 'object') return `<c r="${a}"${at} t="e">${fpart}<v>${X(String(v.err).split(' ')[0])}</v></c>`;
          return `<c r="${a}"${at} t="str">${fpart}<v>${X(v == null ? '' : v)}</v></c>`;
        }
        if (isIn[sh + '!' + a]) {
          const v = B.get(sh, a);
          if (typeof v === 'number' && v !== c[1]) return `<c r="${a}"${attr.replace(/\s+t="[^"]*"/, '')}><v>${v}</v></c>`;
        }
        return all;
      });
    }
    // chữ phụ thuộc cấu hình (tiêu đề, ghi chú số bể…) – chỉ thay khi khác file mẫu
    const g = k => val(M, k), vn = (x, d) => (+x).toLocaleString('vi-VN', { maximumFractionDigits: d === undefined ? 1 : d });
    const N = g('cl_N'), NF = g('f_N'), nh = g('tx_nh'), ntr = B.get(D, 'D57'), Bt = g('tx_B'), Q = g('Q');
    const rows2 = n => n >= 4 && n % 2 === 0 ? `2 dãy × ${n / 2} bể` : `${n} bể`;
    let ss = files['xl/sharedStrings.xml'];
    const rep = (a, b) => { if (a !== b) ss = ss.split(X(a)).join(X(b)); };
    const src = (P.srcName || '').trim();
    rep('500.000 m³/ngđ (SÔNG TRÍ + SÔNG RÀO TRỔ)', vn(Q, 0) + ' m³/ngđ' + (src ? ' (' + src.toUpperCase() + ')' : (Q === Q0 ? ' (SÔNG TRÍ + SÔNG RÀO TRỔ)' : '')));
    if (src) { rep('CHẤT LƯỢNG NƯỚC SÔNG TRÍ + RÀO TRỔ', 'CHẤT LƯỢNG NƯỚC ' + src.toUpperCase()); rep('quan trắc nước 2 sông', 'quan trắc nước ' + src); rep('Chất lượng nước 2 sông là GIẢ ĐỊNH', 'Chất lượng nước ' + src + ' là GIẢ ĐỊNH'); }
    rep('Cấu hình: 1 khối – 2 bể trộn, 8 đơn nguyên phản ứng + 8 bể lắng Texler (3 header CT2/bể), 16 bể lọc 2 ngăn, 1 trạm rửa lọc chung, bể chứa 4 ngăn.',
      `Cấu hình: 1 khối – ${B.get(D, 'D38')} bể trộn, ${N} đơn nguyên phản ứng + ${N} bể lắng Texler (${nh} header CT2/bể), ${NF} bể lọc 2 ngăn, 1 trạm rửa lọc chung, bể chứa ${B.get(D, 'D132')} ngăn.`);
    rep('4. Bể Texler rộng 26,3 m với 3 header CT2 song song cần Leopold xác nhận và chạy CFD phân phối nước.',
      Bt > 17 ? `4. Bể Texler rộng ${vn(Bt)} m với ${nh} header CT2 song song cần Leopold xác nhận và chạy CFD phân phối nước.` : `4. Bể Texler rộng ${vn(Bt)} m (≤ 17 m) với ${nh} header CT2 – trong phạm vi kinh nghiệm; vẫn cần Leopold xác nhận bố trí.`);
    rep('06 – BỂ LẮNG LAMEN LEOPOLD TEXLER™ + HỆ THU BÙN CT2® – 8 BỂ', `06 – BỂ LẮNG LAMEN LEOPOLD TEXLER™ + HỆ THU BÙN CT2® – ${N} BỂ`);
    rep('07 – BỂ LỌC NHANH TRỌNG LỰC LEOPOLD – CÁT THẠCH ANH 1 LỚP – 16 BỂ', `07 – BỂ LỌC NHANH TRỌNG LỰC LEOPOLD – CÁT THẠCH ANH 1 LỚP – ${NF} BỂ`);
    rep('2 dãy × 4 bể, kênh phân phối ở giữa', rows2(N) + (N >= 4 && N % 2 === 0 ? ', kênh phân phối ở giữa' : ''));
    rep('2 dãy × 8 bể, hành lang ống ở giữa', rows2(NF) + (NF >= 4 && NF % 2 === 0 ? ', hành lang ống ở giữa' : ''));
    rep('Tràn chia nước cố định cho 16 bể', `Tràn chia nước cố định cho ${NF} bể`); rep('Tràn cố định chia đều 16 bể', `Tràn cố định chia đều ${NF} bể`);
    rep('1 trạm rửa chung cho 16 bể', `1 trạm rửa chung cho ${NF} bể`); rep('Bể lọc Leopold (16 bể, hành lang ống, sàn công tác)', `Bể lọc Leopold (${NF} bể, hành lang ống, sàn công tác)`);
    rep('BTCT đáy phẳng; 13 dãy Texler, 3 header CT2; tường lỗ phân phối', `BTCT đáy phẳng; ${ntr} dãy Texler, ${nh} header CT2; tường lỗ phân phối`);
    rep('Bằng số header CT2 → ô ≈ 8,8 × 3,0 m', `Ô khuấy ≈ ${vn(Bt / B.get(D, 'D47'))} × ${vn(B.get(D, 'D48'))} m`);
    rep('Ghi chú: với trạm 500.000 m³/ngđ có thể thay bể trộn cơ khí bằng trộn thủy lực/trộn tĩnh trên ống để tiết kiệm điện (2 × 110 kW).',
      `Ghi chú: với trạm ${vn(Q, 0)} m³/ngđ có thể thay bể trộn cơ khí bằng trộn thủy lực/trộn tĩnh trên ống để tiết kiệm điện (${B.get(D, 'D38')} × ${vn(B.get('04_BeTron', 'D20'))} kW).`);
    if ((P.nIntake || 2) === 1) rep('Công trình thu nước + nhà trạm bơm cấp I (2 sông)', 'Công trình thu nước + nhà trạm bơm cấp I');
    files['xl/sharedStrings.xml'] = ss;
    files['xl/workbook.xml'] = wb.replace(/<calcPr([^>]*?)\/>/, (m, a) => `<calcPr${a.replace(/\s+fullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`);
    if (files['docProps/core.xml']) files['docProps/core.xml'] = files['docProps/core.xml'].replace(/<dcterms:modified([^>]*)>[^<]*</, `<dcterms:modified$1>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}<`);
    const order = ['[Content_Types].xml', ...z.names.filter(n => n !== '[Content_Types].xml')];
    return OOXML.zip(order.map(n => ({ name: n, data: files[n] })));
  }
  return { run, val, xlsx, CHECKS, K, DEF, Q0 };
})();
if (typeof module !== 'undefined') module.exports = XLNL;
