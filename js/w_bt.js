'use strict';
/* ==========================================================================
   SimNước – Tab "Bản tính": nhập bảng tính thiết kế trạm xử lý nước cấp (.xlsx)
   Cấu trúc bảng tính: mỗi sheet có các bảng [TT | Thông số | Ký hiệu | Giá trị | Đơn vị | Ghi chú],
   tiêu đề mục "A. …" ở cột A; sheet nhận theo tên (01_DauVao, 02_CanBang, 03_HoaChat, 04_BeTron,
   05_TaoBong, 06_Lang…, 07_BeLoc, 09_RuaLoc, 10_KhuTrung, 11_Bun, 14_DanhSachBe, 16_CanBangNuoc,
   20_ChiPhiVanHanh). Ký hiệu trùng nhau giữa các mục nên tra theo TÊN thông số (+ mục).
   → danh sách thông số (nguồn: bản tính / suy ra / mặc định / thiếu), dựng sơ đồ, so sánh kết quả.
   ========================================================================== */
const WBT = {};

/* ---------------------------------------------------------------- đọc bảng tính */
WBT.parse = function (wb, file) {
  const rows = [];
  for (const sh of wb.order) {
    const S = wb.sheets[sh], c = S.cells;
    let sec = '';
    for (let r = 1; r <= S.maxRow; r++) {
      const A = c['A' + r], B = c['B' + r], C = c['C' + r], D = c['D' + r], E = c['E' + r], F = c['F' + r];
      if (typeof A === 'string' && /^[A-ZĐ]\.\s/.test(A) && D === undefined) { sec = A; continue; }
      if (typeof B !== 'string') continue;
      rows.push({ sh, r, sec, name: B.trim(), sym: typeof C === 'string' ? C.trim() : '', v: D, u: typeof E === 'string' ? E : '', note: typeof F === 'string' ? F : '', C, D, E, F, G: c['G' + r], H: c['H' + r], I: c['I' + r] });
    }
  }
  const title = (wb.sheets[wb.order[0]] && wb.sheets[wb.order[0]].cells.A1) || file;
  const chainTxt = (() => { for (const sh of wb.order) for (const k in wb.sheets[sh].cells) { const v = wb.sheets[sh].cells[k]; if (typeof v === 'string' && /^Dây chuyền\s*:/i.test(v)) return v.replace(/^Dây chuyền\s*:\s*/i, ''); } return ''; })();
  return { file, title: String(title).replace(/^BẢNG TÍNH TOÁN THIẾT KẾ CÔNG NGHỆ\s*[–-]\s*/i, ''), sheets: wb.order.slice(), rows, chainTxt };
};
/* tìm dòng: sh = regex tên sheet, re = regex tên thông số, opt.sec = regex tên mục, opt.sym = ký hiệu */
WBT.find = function (doc, sh, re, opt = {}) {
  for (const x of doc.rows) {
    if (!sh.test(x.sh) || !re.test(x.name)) continue;
    if (opt.sec && !opt.sec.test(x.sec)) continue;
    if (opt.sym !== undefined && x.sym !== opt.sym) continue;
    const v = opt.col ? x[opt.col] : x.v;
    if (opt.num !== false && typeof v !== 'number') continue;
    return { v, ref: x.sh + '!' + (opt.col || 'D') + x.r, name: x.name, u: x.u, row: x };
  }
  return null;
};
const S_IN = /DauVao/, S_CB = /^\d+_CanBang$/, S_HC = /HoaChat/, S_MIX = /BeTron/, S_FL = /TaoBong/, S_SE = /Lang/, S_FI = /BeLoc/, S_BW = /RuaLoc/,
  S_DI = /KhuTrung/, S_SL = /Bun$/, S_LIST = /DanhSachBe/, S_WB = /CanBangNuoc/, S_OP = /ChiPhiVanHanh/;

/* ---------------------------------------------------------------- ánh xạ thông số */
WBT.TYP = { Q: 20000, turb: 50, pH: 7.2, T: 25, alk: 60, PAC: 30, Alp: 31, Cl1: 1, Cl2: 2, tmix: 60, tfl: 20, G: 40, Nse: 2, Fse: 300, Ae: 0, Ese: 90, Cs: 15,
  Afi: 200, Lfi: 1, d10: 0.7, Hmax: 2, Tfi: 24, UBWV: 5, Vtk: 2000, BF: 0.5, H1: 15, e1: 75, H2: 40, e2: 75 };
WBT.plan = function (doc) {
  const P = [], tg = [], chain = [];
  const add = (grp, id, l, u, f, conv, note, extra) => {
    const p = { grp, id, l, u, v: null, src: 'miss', ref: '', btName: '', note: note || '' };
    if (f && typeof f.v === 'number') { p.v = conv ? conv(f.v) : f.v; p.src = 'bt'; p.ref = f.ref; p.btName = f.name; p.btUnit = f.u; }
    Object.assign(p, extra || {});
    P.push(p); return p;
  };
  const calc = (grp, id, l, u, v, note, ref) => { const p = { grp, id, l, u, v, src: v == null || !isFinite(v) ? 'miss' : 'calc', ref: ref || '', btName: '', note }; if (p.src === 'miss') p.v = null; P.push(p); return p; };
  const def = (grp, id, l, u, v, note) => { const p = { grp, id, l, u, v, src: 'def', ref: '', btName: '', note }; P.push(p); return p; };
  const F = (sh, re, o) => WBT.find(doc, sh, re, o);
  const has = re => doc.sheets.some(s => re.test(s));

  // ----- nguồn nước & lưu lượng
  const G1 = 'Nước nguồn & lưu lượng';
  const qRaw = F(S_WB, /NƯỚC THÔ PHẢI KHAI THÁC/i), qTk = F(S_CB, /Công suất thiết kế/i) || F(S_IN, /Công suất/i), qUse = F(S_CB, /Công suất hữu ích/i) || F(S_IN, /Công suất hữu ích/i);
  add(G1, 'Q', 'Lưu lượng nước thô khai thác', 'm³/d', qRaw || qTk, null, qRaw ? 'Theo cân bằng nước (đã tính nước tuần hoàn về đầu trạm)' : 'Chưa có cân bằng nước – dùng công suất thiết kế');
  const fSS = F(S_IN, /cặn lơ lửng/i), fNTU = F(S_IN, /Độ đục/i);
  add(G1, 'SS', 'Cặn lơ lửng nước thô', 'mg/L', fSS || (fNTU ? { v: fNTU.v, ref: fNTU.ref, name: fNTU.name + ' (lấy SS ≈ NTU)', u: 'NTU' } : null), null, 'SimNước lấy chất rắn vô cơ ≈ 2 × độ đục nhập → độ đục nhập = SS/2 để TSS khớp bản tính');
  add(G1, 'turbD', 'Độ đục thiết kế (tham khảo)', 'NTU', fNTU);
  add(G1, 'pH', 'pH nước thô', '-', F(S_IN, /^pH/i));
  add(G1, 'T', 'Nhiệt độ nước', '°C', F(S_IN, /Nhiệt độ/i));
  add(G1, 'alk', 'Độ kiềm', 'mgCaCO₃/L', F(S_IN, /Độ kiềm/i));
  const fCol = F(S_IN, /Độ màu/i);
  def(G1, 'DOC', 'DOC nước thô', 'mgC/L', 3.5, fCol ? `Bản tính chỉ có độ màu ${fCol.v} ${fCol.u} (${fCol.ref}) – không quy đổi; nhập DOC thực đo nếu có` : 'Không có trong bản tính');
  def(G1, 'UV254', 'UV254 nước thô', '1/cm', 0.12, 'Không có trong bản tính');
  P.push({ grp: G1, id: 'ions', l: 'Ion chính, vi sinh, vi chất', u: '', v: null, src: 'def', ref: '', btName: '', note: 'Lấy theo mẫu "Nước sông" của phần mềm (Ca, Mg, Na, Cl, SO₄, Fe, Mn, vi sinh…)', noNum: 1 });

  // ----- bơm
  const G2 = 'Trạm bơm';
  const eMot = F(S_IN, /Hiệu suất động cơ/i);
  const mot = eMot ? eMot.v : 1;
  add(G2, 'H1', 'Cột áp bơm cấp I', 'm', F(S_IN, /Cột áp bơm cấp I$/i) || F(S_DI, /Cột áp/i, { sec: /CẤP I(?!I)/i }));
  add(G2, 'e1', 'Hiệu suất bơm cấp I × động cơ', '%', F(S_IN, /Hiệu suất bơm cấp I$/i), v => v * mot * 100, eMot ? `× hiệu suất động cơ ${eMot.v} (${eMot.ref})` : '');
  add(G2, 'H2', 'Cột áp bơm cấp II', 'm', F(S_IN, /Cột áp bơm cấp II/i));
  add(G2, 'e2', 'Hiệu suất bơm cấp II × động cơ', '%', F(S_IN, /Hiệu suất bơm cấp II/i), v => v * mot * 100, eMot ? `× hiệu suất động cơ ${eMot.v}` : '');

  // ----- hóa chất
  const G3 = 'Hóa chất';
  const fPAC = F(S_IN, /Liều PAC lớn nhất/i) || F(S_IN, /Liều PAC/i) || F(S_HC, /PAC/i, { col: 'C' });
  add(G3, 'PAC', 'Liều PAC (sản phẩm)', 'mg/L', fPAC, null, 'Liều thiết kế lớn nhất – trung bình năm xem dưới');
  const alp = fPAC && /(\d+(?:[.,]\d+)?)\s*%\s*Al/i.exec(fPAC.name);
  if (alp) calc(G3, 'Alp', 'Hàm lượng Al₂O₃ trong PAC', '%', +alp[1].replace(',', '.'), 'Đọc từ tên thông số', fPAC.ref); else def(G3, 'Alp', 'Hàm lượng Al₂O₃ trong PAC', '%', 31, 'PAC lỏng/bột thông dụng');
  add(G3, 'PACavg', 'Liều PAC trung bình năm (tham khảo)', 'mg/L', F(S_IN, /Liều PAC trung bình/i));
  add(G3, 'poly', 'Liều polymer trợ keo tụ', 'mg/L', F(S_IN, /Liều polymer trợ keo tụ/i) || F(S_HC, /Polymer anion/i, { col: 'C' }));
  add(G3, 'lime', 'Liều vôi (CaO) ổn định pH', 'mg/L', F(S_IN, /Liều vôi/i) || F(S_HC, /Vôi/i, { col: 'C' }), null, 'Châm sau lọc; quy đổi sang Ca(OH)₂ × 74,09/56,08');
  add(G3, 'Cl1', 'Liều clo tiền khử trùng', 'mgCl₂/L', F(S_IN, /clo tiền khử trùng/i) || F(S_HC, /tiền khử trùng/i, { col: 'C' }));
  add(G3, 'Cl2', 'Liều clo khử trùng chính', 'mgCl₂/L', F(S_IN, /clo khử trùng chính/i) || F(S_HC, /khử trùng chính/i, { col: 'C' }));
  const pr = (id, l, re) => add(G3, id, l, 'đ/kg', F(S_IN, re), null, '', { opt: 1 });
  pr('pPAC', 'Đơn giá PAC (sản phẩm)', /Đơn giá PAC/i); pr('pLime', 'Đơn giá vôi CaO', /Đơn giá vôi/i); pr('pPoly', 'Đơn giá polymer anion', /Đơn giá polymer anion/i);
  pr('pCl', 'Đơn giá clo hoạt tính', /Đơn giá NaOCl/i);

  // ----- trộn & tạo bông
  const G4 = 'Trộn nhanh – tạo bông';
  add(G4, 'tmix', 'Thời gian lưu bể trộn', 's', F(S_MIX, /Thời gian lưu thực tế/i) || F(S_IN, /Thời gian lưu bể trộn/i));
  add(G4, 'Gmix', 'Gradient bể trộn (tham khảo)', '1/s', F(S_MIX, /Gradient vận tốc thực tế/i) || F(S_IN, /Gradient vận tốc bể trộn/i));
  add(G4, 'tfl', 'Thời gian lưu bể phản ứng', 'min', F(S_FL, /Thời gian lưu thực tế/i));
  add(G4, 'G', 'Gradient trung bình bể phản ứng', '1/s', F(S_FL, /Gradient vận tốc trung bình/i));

  // ----- lắng
  const G5 = 'Bể lắng';
  const lam = doc.rows.some(x => S_SE.test(x.sh) && /tấm|lamen|Texler/i.test(x.name + x.sec));
  calc(G5, 'kind', 'Loại bể lắng (1 = lamella, 0 = lắng thường)', '-', lam ? 1 : 0, lam ? 'Có cụm tấm lắng trong bản tính' : '');
  const nSe = F(S_SE, /^Số bể lắng|Số bể$/i) || F(S_IN, /Số bể lắng/i);
  add(G5, 'Nse', 'Số bể lắng', 'bể', nSe);
  add(G5, 'Fse', 'Diện tích mặt bằng mỗi bể', 'm²', F(S_SE, /Diện tích mặt bằng bể/i));
  add(G5, 'Ae', 'Diện tích lắng hiệu dụng của tấm mỗi bể', 'm²', F(S_SE, /Diện tích lắng hiệu dụng/i), null, lam ? 'Hệ số diện tích lamella = A_e / diện tích mặt bằng' : '', { opt: !lam });
  add(G5, 'Ese', 'Hiệu suất khử cặn bể lắng (giả định thiết kế)', '%', F(S_IN, /Hiệu suất khử cặn/i), null, 'Chỉ để đối chiếu – mô hình tính hiệu suất theo tải bề mặt');
  add(G5, 'Cs', 'Nồng độ bùn xả bể lắng', 'g/L', F(S_IN, /Nồng độ bùn CT2|Nồng độ bùn.*bể lắng|Nồng độ bùn.*hút/i) || F(S_SL, /Nồng độ bùn/i), v => v * 10, 'Quy đổi % → g/L (× 10)');

  // ----- lọc
  const G6 = 'Bể lọc';
  add(G6, 'Afi', 'Tổng diện tích lọc', 'm²', F(S_FI, /Tổng diện tích lọc/i));
  add(G6, 'Lfi', 'Chiều dày lớp vật liệu lọc', 'm', F(S_FI, /Chiều dày lớp/i) || F(S_IN, /Chiều dày lớp cát/i));
  add(G6, 'd10', 'Cỡ hạt hiệu quả d₁₀', 'mm', F(S_FI, /Cỡ hạt hiệu quả/i) || F(S_IN, /Cỡ hạt hiệu quả/i));
  const hAv = F(S_FI, /Cột nước lọc khả dụng/i), hO = F(S_IN, /Tổn thất ống, van.*khi lọc/i);
  calc(G6, 'Hmax', 'Tổn thất áp lực cho phép qua lớp lọc', 'm', hAv ? hAv.v - (hO ? hO.v : 0) : null, hAv ? `Cột nước khả dụng ${fmt(hAv.v)} m − tổn thất ống/van ${hO ? fmt(hO.v) : 0} m` : '', hAv ? hAv.ref : '');
  add(G6, 'Tfi', 'Chu kỳ lọc thiết kế', 'h', F(S_FI, /Chu kỳ lọc/i) || F(S_IN, /Chu kỳ lọc/i));
  add(G6, 'UBWV', 'Nước rửa mỗi lần trên 1 m² lọc', 'm³/m²', F(S_BW, /UBWV|Thể tích nước rửa riêng/i));
  add(G6, 'rbw', 'Tỷ lệ nước rửa lọc thu hồi tuần hoàn', '-', F(S_IN, /nước rửa lọc thu hồi/i), null, '0 = không thu hồi', { opt: 1 });
  const rec = doc.rows.find(x => S_LIST.test(x.sh) && /thu hồi nước rửa/i.test(x.name) && typeof x.E === 'number');
  if (rec) calc(G6, 'Abw', 'Diện tích bể thu hồi nước rửa lọc', 'm²', (+rec.C || 1) * rec.E * (+rec.F || rec.E), `${rec.C} bể × ${fmt(rec.E)} × ${fmt(+rec.F)} m`, rec.sh + '!E' + rec.r);
  else def(G6, 'Abw', 'Diện tích bể thu hồi nước rửa lọc', 'm²', 100, 'Không có trong bản tính');

  // ----- khử trùng, bể chứa
  const G7 = 'Khử trùng – bể chứa';
  add(G7, 'Vtk', 'Dung tích bể chứa nước sạch', 'm³', F(S_DI, /Dung tích bể chứa/i));
  add(G7, 'BF', 'Hệ số dòng chảy tắt (baffling)', '-', F(S_DI, /dòng chảy tắt/i) || F(S_IN, /baffling/i));
  add(G7, 'Cres', 'Clo dư thiết kế', 'mg/L', F(S_DI, /Clo dư duy trì/i) || F(S_IN, /Clo dư/i), null, 'Để đối chiếu');

  // ----- bùn
  const G8 = 'Xử lý bùn';
  add(G8, 'C2', 'Nồng độ bùn sau cô đặc', '%', F(S_SL, /Nồng độ bùn sau cô đặc/i) || F(S_IN, /Nồng độ bùn sau bể cô đặc/i));
  add(G8, 'C3', 'Nồng độ bánh bùn', '%', F(S_SL, /Nồng độ bánh bùn/i) || F(S_IN, /bánh bùn/i));
  add(G8, 'polyDW', 'Liều polymer khử nước', 'kg/t DS', F(S_SL, /Liều polymer cation/i) || F(S_IN, /polymer cation/i));
  add(G8, 'rht', 'Tỷ lệ nước tách bùn tuần hoàn về đầu trạm', '-', F(S_IN, /nước tách bùn.*tuần hoàn/i), null, '1 = tuần hoàn toàn bộ; 0 = xả', { opt: 1 });

  // các tham số tùy chọn thiếu → mặc định
  const OPT0 = { rbw: 0, rht: 0, Ae: 0 };
  for (const p of P) if (p.src === 'miss' && p.opt) { p.src = 'def'; if (OPT0[p.id] !== undefined) p.v = OPT0[p.id]; else { p.v = 0; p.note = (p.note ? p.note + '; ' : '') + 'không có – bỏ qua'; } }

  // ----- dây chuyền
  const ch = (n, re, c, sim) => { if (has(re)) chain.push({ n, c, sim }); };
  ch('Trạm bơm cấp I', S_DI, 'Bơm nước thô', 1);
  ch('Trộn nhanh', S_MIX, 'Cơ khí – châm PAC, clo sơ bộ', 1);
  ch('Phản ứng tạo bông', S_FL, 'Khuấy cơ khí nhiều buồng', 1);
  ch('Lắng', S_SE, lam ? 'Lắng lamella (tấm nghiêng)' : 'Lắng', 1);
  ch('Lọc nhanh', S_FI, 'Lọc cát trọng lực', 1);
  ch('Rửa lọc', S_BW, 'Gió + nước; thu hồi nước rửa', 1);
  ch('Khử trùng – bể chứa – bơm cấp II', S_DI, 'Clo; CT', 1);
  ch('Xử lý bùn', S_SL, 'Cô đặc trọng lực + khử nước', 1);
  ch('Cao trình thủy lực, đường ống', /CaoTrinh|DuongOng/, 'Không mô phỏng', 0);
  ch('Chi phí đầu tư, vận hành', /ChiPhi/, 'Chỉ đối chiếu điện năng, hóa chất', 0);

  // ----- chỉ tiêu đối chiếu
  const T = (k, l, u, f, opt = {}) => { if (f && typeof f.v === 'number') tg.push(Object.assign({ k, l, u, v: f.v, ref: f.ref, btName: f.name }, opt)); };
  T('Qprod', 'Nước sạch phát ra (thành phẩm)', 'm³/d', qUse, { tol: 0.02 });
  T('SOR', lam ? 'Tải trọng trên tấm lắng' : 'Tải trọng bề mặt bể lắng', 'm/h', lam ? F(S_SE, /Tải trọng trên tấm/i) : F(S_SE, /Tải trọng bề mặt bể/i), { tol: 0.05, note: 'Lưu lượng qua bể lắng mô hình đã gồm nước tuần hoàn' });
  T('Ese', 'Hiệu suất khử cặn bể lắng', '%', F(S_IN, /Hiệu suất khử cặn/i), { tol: 0.05, note: 'Bản tính giả định; mô hình tính theo tốc độ lắng bông / tải trọng' });
  T('Qse', 'Nước xả bùn bể lắng', 'm³/d', F(S_SL, /Lưu lượng bùn xả từ bể lắng/i), { tol: 0.2 });
  T('vf', 'Vận tốc lọc bình thường', 'm/h', F(S_FI, /Vận tốc lọc khi tất cả/i), { tol: 0.05 });
  T('h0', 'Tổn thất lớp lọc sạch', 'm', F(S_FI, /Tổng tổn thất lớp lọc sạch/i) || F(S_FI, /Tổn thất qua lớp cát sạch/i), { tol: 0.25, note: 'Bản tính Kozeny + đan; mô hình Carman–Kozeny' });
  T('run', 'Chu kỳ lọc', 'h', F(S_FI, /Chu kỳ lọc/i), { tol: 0.3, note: 'Mô hình: theo tổn thất áp tích lũy, tối đa = chu kỳ thiết kế' });
  T('Qbw', 'Nước rửa lọc', 'm³/d', F(S_BW, /Tổng nước rửa lọc trong 1 ngày/i), { tol: 0.2 });
  T('DS', 'Bùn khô phát sinh', 'kg DS/d', F(S_SL, /Khối lượng bùn khô/i), { tol: 0.15 });
  T('cake', 'Bánh bùn', 't/d', F(S_SL, /Khối lượng bánh bùn/i), { tol: 0.15 });
  T('polyDW', 'Polymer khử nước bùn', 'kg/d', F(S_SL, /Lượng polymer bột dùng mỗi ngày/i), { tol: 0.15 });
  T('Cl2res', 'Clo dư sau bể chứa', 'mg/L', F(S_DI, /Clo dư duy trì/i), { tol: 0.25, abs: 0.2 });
  T('CT', 'CT đạt được', 'mg·min/L', F(S_DI, /Giá trị CT đạt được/i), { tol: 0.2 });
  const hc = (k, l, re) => { const f = F(S_HC, re, { col: 'D' }); if (f) T(k, 'Lượng ' + l, 'kg/d', f, { tol: 0.06, note: 'Bản tính tính trên Q thiết kế; mô hình trên lưu lượng qua điểm châm' }); };
  hc('kPAC', 'PAC', /PAC/i); hc('kPoly', 'polymer anion', /Polymer anion/i); hc('kLime', 'vôi CaO', /Vôi/i); hc('kCl1', 'NaOCl tiền khử trùng', /tiền khử trùng/i); hc('kCl2', 'NaOCl khử trùng chính', /khử trùng chính/i);
  const tCl = tg.find(t => t.k === 'kCl2'); if (tCl) { tCl.tol = 0.15; tCl.note = 'Mô hình: liều do bộ điều khiển chọn để giữ clo dư sau bể chứa = giá trị thiết kế (tắt bộ điều khiển ở tab Điều khiển để dùng liều cố định)'; }
  T('E1', 'Điện năng bơm cấp I', 'kWh/d', F(S_OP, /Bơm cấp I$/i), { tol: 0.15 });
  T('E2', 'Điện năng bơm cấp II', 'kWh/d', F(S_OP, /Bơm cấp II/i), { tol: 0.15 });
  // giới hạn chất lượng nước (QCVN 01-1:2018/BYT)
  tg.push({ k: 'turb', l: 'Độ đục nước thành phẩm', u: 'NTU', v: null, ref: 'QCVN 01-1:2018', lim: 2 });
  tg.push({ k: 'pHp', l: 'pH nước thành phẩm', u: '-', v: null, ref: 'QCVN 01-1:2018', limR: [6, 8.5] });
  tg.push({ k: 'Al', l: 'Nhôm tổng nước thành phẩm', u: 'mg/L', v: null, ref: 'QCVN 01-1:2018', lim: 0.2 });

  for (const p of P) if (p.src === 'miss' && WBT.TYP[p.id] !== undefined) p.typ = WBT.TYP[p.id];
  return { app: 'simnuoc', file: doc.file, title: doc.title, chainTxt: doc.chainTxt, params: P, targets: tg, chain, time: new Date().toLocaleString('vi-VN') };
};
WBT.missing = D => D.params.filter(p => p.src === 'miss' && !p.noNum);
WBT.val = (D, id, d) => { const p = D.params.find(x => x.id === id); return p && p.v != null && isFinite(p.v) ? +p.v : d; };

/* ---------------------------------------------------------------- dựng sơ đồ */
WBT.build = function (D) {
  const v = (id, d) => WBT.val(D, id, d);
  const P = wtNew('Từ bản tính: ' + (D.title || D.file).slice(0, 90), 'Dựng tự động từ ' + D.file + (D.chainTxt ? '. Dây chuyền: ' + D.chainTxt : ''));
  const wq = W_PRESETS.river.wq();
  Object.assign(wq, { T: v('T', 25), pH: v('pH', 7.2), alk: v('alk', 60), DOC: v('DOC', 3.5), UV254: v('UV254', 0.12) });
  wq.POC = 1.0; wq.turb = Math.max((v('SS', 50) + 0.8 * wq.POC) / 2, 0.1);
  const alF = v('Alp', 31) / 100 * 2 * 26.98 / 101.96;                 // phần Al trong PAC
  const rbw = v('rbw', 0), rht = v('rht', 0), lam = v('kind', 1) >= 0.5;
  const Nse = Math.max(v('Nse', 1), 1), Fse = v('Fse', 300), Ae = v('Ae', 0);
  const U = (id, t, n, x, y, p) => wtU(P, id, t, n, x, y, p);
  U('SRC', 'source', 'Nước thô', 60, 160, { Q: v('Q', 20000), wq });
  U('P1', 'pump', 'Bơm cấp I', 180, 160, { H: v('H1', 15), eta: v('e1', 75) });
  U('MX0', 'mixer', 'Hòa trộn nước tuần hoàn', 300, 160);
  U('D1', 'dose', 'PAC', 420, 160, { chem: 'PACl', dose: v('PAC', 30) * alF, tmix: 0, strength: +(alF * 100).toFixed(2), price: v('pPAC', 0) });
  U('D2', 'dose', 'Clo tiền khử trùng', 540, 160, { chem: 'NaOCl', dose: v('Cl1', 0), tmix: Math.max(v('tmix', 45), 1), price: v('pCl', 0) });
  U('D3', 'dose', 'Polymer trợ keo tụ', 660, 160, { chem: 'poly', dose: v('poly', 0), tmix: 0, price: v('pPoly', 0) });
  U('CO', 'coag', 'Trộn nhanh + phản ứng', 780, 160, { HRT: v('tmix', 45) / 60 + v('tfl', 20), G: v('G', 40) });
  U('SE', 'settler', lam ? 'Bể lắng lamella' : 'Bể lắng', 920, 160, { kind: lam ? 'lam' : 'sed', A: Nse * Fse, Fl: lam && Ae > 0 ? +(Ae / Fse).toFixed(3) : 1, Cs: v('Cs', 15) });
  U('FI', 'filter', 'Bể lọc nhanh', 1060, 160, { A: v('Afi', 200), L: v('Lfi', 1), d10: v('d10', 0.7), Hmax: v('Hmax', 2), tmax: v('Tfi', 24), bwV: v('UBWV', 5), ftw: 0 });
  U('D4', 'dose', 'Vôi ổn định pH', 1180, 160, { chem: 'lime', dose: v('lime', 0) * 74.09 / 56.08, tmix: 0, strength: 100, price: v('pLime', 0) * 56.08 / 74.09 });
  U('D5', 'dose', 'Clo khử trùng chính', 1300, 160, { chem: 'NaOCl', dose: v('Cl2', 2), tmix: 0, price: v('pCl', 0) });
  U('TK', 'tank', 'Bể chứa nước sạch', 1420, 160, { V: v('Vtk', 2000), flow: 'plug', BF: v('BF', 0.5) });
  U('P2', 'pump', 'Bơm cấp II', 1540, 160, { H: v('H2', 40), eta: v('e2', 75) });
  U('PR', 'product', 'Nước sạch phát vào mạng', 1660, 160, { std: 'qcvn01' });
  const L = (a, pa, b, pb) => wtL(P, a, pa, b, pb);
  L('SRC', 'out', 'P1', 'in'); L('P1', 'out', 'MX0', 'a'); L('MX0', 'out', 'D1', 'in'); L('D1', 'out', 'D2', 'in'); L('D2', 'out', 'D3', 'in'); L('D3', 'out', 'CO', 'in');
  L('CO', 'out', 'SE', 'in'); L('SE', 'out', 'FI', 'in'); L('FI', 'out', 'D4', 'in'); L('D4', 'out', 'D5', 'in'); L('D5', 'out', 'TK', 'in');
  const lTK = L('TK', 'out', 'P2', 'in'); L('P2', 'out', 'PR', 'in');
  // giữ clo dư sau bể chứa bằng giá trị thiết kế → so sánh liều clo cần thiết với liều giả định
  if (D.ctlCl !== false && v('Cres', 0) > 0) P.ctrls.push({ id: 'C1', name: 'Clo dư sau bể chứa', on: true, unit: 'D5', param: 'dose', ref: lTK, v: 'Cl2f', sp: v('Cres', 0.8), lo: 0, hi: Math.max(10, 5 * v('Cl2', 2)), kp: 0.5, ti: 2 });
  // nước rửa lọc: bể thu hồi (lắng) → tuần hoàn; cặn → xử lý bùn
  U('MXS', 'mixer', 'Gom bùn', 920, 360);
  L('SE', 'sludge', 'MXS', 'a');
  if (rbw > 0) {
    U('BWR', 'settler', 'Bể thu hồi nước rửa lọc', 1060, 360, { kind: 'sed', A: v('Abw', 100), Cs: 10 });
    L('FI', 'bw', 'BWR', 'in'); L('BWR', 'out', 'MX0', 'b'); L('BWR', 'sludge', 'MXS', 'b');
  } else L('FI', 'bw', 'MXS', 'b');
  U('TH', 'dewater', 'Bể cô đặc bùn', 680, 360, { kind: 'thick', cap: 95, cs: v('C2', 4), poly: 0 });
  U('DW', 'dewater', 'Khử nước bùn (ly tâm)', 500, 360, { kind: 'cent', cap: 95, cs: v('C3', 25), poly: v('polyDW', 4) });
  U('WS', 'waste', 'Bánh bùn', 500, 500, { kind: 'sludge' });
  L('MXS', 'out', 'TH', 'in'); L('TH', 'cake', 'DW', 'in'); L('DW', 'cake', 'WS', 'in');
  U('MXR', 'mixer', 'Nước tách bùn', 300, 360);
  L('TH', 'filt', 'MXR', 'a'); L('DW', 'filt', 'MXR', 'b');
  if (rht >= 0.5) L('MXR', 'out', 'MX0', 'c');
  else { U('WR', 'waste', 'Nước tách bùn xả', 300, 500, { kind: 'other' }); L('MXR', 'out', 'WR', 'in'); }
  P.design = D;
  return P;
};

/* ---------------------------------------------------------------- so sánh */
WBT.compare = function (D, P, r) {
  const I = id => r.info[id] || {}, S = WSIM.summary({ units: P.units }, r);
  const pr = S.prod[0], w = pr ? pr.w : null, sw = w ? WQ.solve(w) : null;
  const chem = id => I(id).kgProd;
  const waste = S.waste.filter(x => x.u.p.kind === 'sludge');
  const M = {
    Qprod: S.Qprod, SOR: I('SE').SOR, Ese: I('SE').E, Qse: I('SE').Qs, vf: I('FI').vf, h0: I('FI').h0, run: I('FI').run,
    Qbw: I('FI').bwFrac != null && P.units.find(u => u.id === 'FI') ? I('FI').bwFrac / 100 * (I('FI')._in ? I('FI')._in.Q : NaN) : NaN,
    DS: waste.reduce((a, x) => a + WQ.tss(x.w) * x.w.Q / 1000, 0), cake: I('DW').cakeT, polyDW: I('DW').polyKg,
    Cl2res: I('TK').Cl2f, CT: I('TK').CTfree, kPAC: chem('D1'), kPoly: chem('D3'), kLime: chem('D4') * 56.08 / 74.09, kCl1: chem('D2'), kCl2: chem('D5'),
    E1: (I('P1').kW || 0) * 24, E2: (I('P2').kW || 0) * 24,
    turb: sw ? sw.turb : NaN, pHp: sw ? sw.pH : NaN, Al: w ? WQ.value(w, 'Al', sw) : NaN
  };
  const rows = [];
  for (const t of D.targets) {
    const mod = M[t.k];
    if (mod === undefined || mod === null || Number.isNaN(mod)) continue;
    const row = { l: t.l, u: t.u, des: t.v, mod, ref: t.ref, note: t.note || '' };
    if (t.v != null) {
      row.d = mod - t.v; row.dr = t.v !== 0 ? row.d / Math.abs(t.v) : NaN;
      const tol = t.tol || 0.1, err = t.abs != null ? Math.min(Math.abs(row.dr), Math.abs(row.d) / t.abs * tol) : Math.abs(row.dr);
      row.st = err <= tol ? 'ok' : err <= 2 * tol ? 'near' : 'off';
    } else row.st = 'ref';
    if (t.lim != null) { row.lim = t.lim; row.limOk = mod <= t.lim; }
    if (t.limR) { row.lim = fmt(t.limR[0]) + ' – ' + fmt(t.limR[1]); row.limOk = mod >= t.limR[0] && mod <= t.limR[1]; }
    rows.push(row);
  }
  const sug = [], R = k => rows.find(x => x.l === (D.targets.find(t => t.k === k) || {}).l);
  const e = R('Ese'); if (e && e.st !== 'ok') sug.push(e.mod > e.des ? 'Hiệu suất lắng mô hình cao hơn giả định thiết kế: tốc độ lắng bông (thông số nâng cao bể lắng, mặc định 2,5 m/h) có thể cao so với bông thực tế – giảm để khớp 90 %, hoặc đây là dự trữ an toàn của thiết kế.' : 'Hiệu suất lắng mô hình thấp hơn thiết kế: kiểm tra liều keo tụ/pH, mức keo tụ ở bể phản ứng.');
  const rn = R('run'); if (rn && rn.mod < rn.des * 0.85) sug.push('Chu kỳ lọc mô hình ngắn hơn thiết kế (bị giới hạn bởi tổn thất áp): lượng cặn vào bể lọc cao hoặc hệ số tăng tổn thất (thông số nâng cao bể lọc) lớn – xem lại hiệu suất lắng và dung lượng chứa cặn.');
  const cl = R('Cl2res'); if (cl && cl.st !== 'ok') sug.push(`Clo dư mô hình ${fmt(cl.mod)} mg/L so với ${fmt(cl.des)} mg/L thiết kế: nhu cầu clo của NOM phụ thuộc DOC (bảng tính không có – đang dùng ${fmt(WBT.val(D, 'DOC', 3.5))} mgC/L). Nhập DOC thực đo hoặc bật bộ điều khiển clo dư (tab Điều khiển).`);
  const kc = R('kCl2'); if (kc && kc.st !== 'ok' && P.ctrls.some(c => c.on !== false && c.unit === 'D5')) sug.push(`Để giữ clo dư ${fmt(WBT.val(D, 'Cres', 0.8))} mg/L sau bể chứa, mô hình cần liều clo chính ≈ ${fmt(kc.mod * 1000 / Math.max((I('D5')._in || {}).Q || 1, 1))} mg/L (bảng tính giả định ${fmt(WBT.val(D, 'Cl2', 2))} mg/L): nhu cầu clo của chất hữu cơ phụ thuộc DOC (bảng tính không có – đang dùng ${fmt(WBT.val(D, 'DOC', 3.5))} mgC/L nước thô). Nhập DOC thực đo ở bảng thông số rồi dựng lại; kiểm tra năng lực bơm định lượng/kho NaOCl.`);
  const h0 = R('h0'); if (h0 && h0.st === 'off') sug.push('Tổn thất lớp lọc sạch khác do quy ước: bảng tính dùng Kozeny với d₁₀ và ψ = 0,8 (cộng tổn thất đan), mô hình dùng Carman–Kozeny với đường kính tương đương ≈ 1,4·d₁₀. Chu kỳ lọc mô hình vì vậy có thể dài hơn – chỉnh "Tổn thất áp lực cho phép" của bể lọc nếu muốn bảo thủ.');
  const ds = R('DS'); if (ds && ds.st !== 'ok') sug.push('Bùn khô lệch: bản tính tính cặn = SS × hiệu suất + Al(OH)₃ từ PAC; mô hình gồm toàn bộ chất rắn rời trạm (cả cặn trong nước rửa lọc, POC, polymer). Kiểm tra SS nước thô và hệ số quy đổi PAC.');
  return { rows, sug };
};

/* ---------------------------------------------------------------- giao diện */
const WBT_SRC = { bt: ['Bản tính', '#15803d', '#e6f5ea'], calc: ['Suy ra', '#1d4ed8', '#e8f0fc'], def: ['Mặc định phần mềm', '#b45309', '#fdf3e1'], typ: ['Giá trị điển hình', '#b45309', '#fdf3e1'], user: ['Nhập tay', '#7c3aed', '#f3e8ff'], miss: ['THIẾU', '#b91c1c', '#fde8e8'] };
WAPP.btPlan = null;
async function wbtImport(file) {
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) { alert('Chỉ nhận tệp bảng tính .xlsx'); return; }
  return wbtImportBuf(await file.arrayBuffer(), file.name);
}
// nhập bảng tính từ bộ nhớ – dùng cho tệp và cho hồ sơ trao đổi của XLNuoc (trường xlsx)
async function wbtImportBuf(buf, name) {
  try {
    const wb = await XLSX_READ.read(buf);
    const doc = WBT.parse(wb, name);
    if (!doc.rows.length) throw new Error('không tìm thấy bảng thông số');
    WAPP.btPlan = WBT.plan(doc);
    wShowTab('bt');
  } catch (e) { alert('Không đọc được bảng tính: ' + e.message); console.error(e); }
}
window.addEventListener('DOMContentLoaded', () => {
  const hdr = document.querySelector('header');
  const b = el(`<button id="btnBT" title="Nhập bảng tính thiết kế trạm xử lý nước cấp .xlsx (hoặc kéo-thả tệp vào cửa sổ)">Nhập bảng tính…</button>`);
  const fi = el(`<input type="file" id="fileBT" accept=".xlsx" hidden>`);
  hdr.insertBefore(b, $('#btnNew')); hdr.appendChild(fi);
  b.onclick = () => fi.click();
  fi.onchange = e => { wbtImport(e.target.files[0]); e.target.value = ''; };
  window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
  window.addEventListener('dragleave', e => { if (e.target === document.documentElement || !e.relatedTarget) document.body.classList.remove('dropping'); });
  window.addEventListener('drop', e => {
    document.body.classList.remove('dropping');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /\.xlsx$/i.test(f.name)) { e.preventDefault(); wbtImport(f); }
  });
});
const wbtDesign = () => WAPP.btPlan || (WAPP.P && WAPP.P.design) || null;
const wKpiTxt = (k, v, cls = '') => `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v" style="font-size:15px">${esc(v || '–')}</div></div>`;

function wRenderBT() {
  const box = $('#tab-bt'); box.innerHTML = '';
  const D = wbtDesign();
  if (!D) {
    box.appendChild(el(`<div class="card"><h2>Nhập bảng tính thiết kế trạm xử lý nước cấp</h2>
      <p>Thả tệp <b>.xlsx</b> (bảng tính công nghệ trạm xử lý nước mặt: <code>01_DauVao</code>, <code>02_CanBang</code>, <code>03_HoaChat</code>, <code>04_BeTron</code>, <code>05_TaoBong</code>, <code>06_Lang…</code>, <code>07_BeLoc</code>, <code>09_RuaLoc</code>, <code>10_KhuTrung</code>, <code>11_Bun</code>, <code>16_CanBangNuoc</code>…) vào cửa sổ, hoặc bấm nút bên dưới. Chương trình đọc giá trị đã tính, tự dựng sơ đồ (bơm cấp I → PAC/clo/polymer → trộn + phản ứng → lắng → lọc → vôi → clo → bể chứa → bơm cấp II; thu hồi nước rửa lọc, cô đặc + khử nước bùn, nước tách tuần hoàn), liệt kê thông số còn thiếu và so sánh kết quả mô phỏng với kết quả tính toán.</p>
      <div class="dropzone" id="btDrop">Kéo-thả tệp .xlsx vào đây<br><button class="pri" style="margin-top:10px">Chọn tệp…</button></div></div>`));
    box.querySelector('#btDrop button').onclick = () => $('#fileBT').click();
    return;
  }
  const pending = D === WAPP.btPlan, miss = WBT.missing(D);
  const head = el(`<div class="card"><h2>Bảng tính: ${esc(D.title || D.file)}</h2>
    <div class="kpis">${wKpiTxt('Tệp', D.file)}${wKpiTxt('Nhập lúc', D.time)}${wKpiTxt('Thông số', D.params.length + ' (' + D.params.filter(p => p.src === 'bt').length + ' từ bảng tính)')}${wKpiTxt('Còn thiếu', String(miss.length), miss.length ? 'bad' : 'ok')}</div>
    ${D.chainTxt ? `<p class="small"><b>Dây chuyền trong bảng tính:</b> ${esc(D.chainTxt)}</p>` : ''}
    <table class="t" style="max-width:900px"><tr><th class="l">Công đoạn</th><th class="l">Lựa chọn</th><th class="l">Mô phỏng</th></tr>
    ${D.chain.map(c => `<tr><td class="l">${esc(c.n)}</td><td class="l">${esc(c.c)}</td><td class="l">${c.sim ? '<b style="color:var(--ok)">có</b>' : '<span class="muted">không (chỉ đối chiếu)</span>'}</td></tr>`).join('')}</table>
    <div class="row" style="margin-top:12px"><button class="pri" id="btBuild">${pending ? 'Dựng sơ đồ' : 'Dựng lại sơ đồ'}</button><button class="pri" id="btBuildRun">${pending ? 'Dựng sơ đồ & tính ổn định' : 'Dựng lại & tính ổn định'}</button><button id="btNew2">Nhập bảng tính khác…</button></div>
    ${miss.length ? `<div class="msg err">Còn ${miss.length} thông số thiếu: ${miss.map(p => esc(p.l)).join('; ')}. Nhập tay ở bảng dưới hoặc bấm "Dùng giá trị điển hình".</div>` : '<div class="msg ok">Đủ thông số để dựng sơ đồ.</div>'}
    ${!pending ? '<p class="small muted">Sơ đồ hiện tại được dựng từ bảng tính này. Sửa thông số ở bảng dưới rồi bấm "Dựng lại" (thay thế sơ đồ, chỉnh sửa tay trên sơ đồ sẽ mất).</p>' : ''}</div>`);
  box.appendChild(head);
  head.querySelector('#btNew2').onclick = () => $('#fileBT').click();
  const doBuild = run => {
    const m = WBT.missing(D);
    if (m.length) { alert('Còn thiếu: ' + m.map(p => p.l).join('; ')); return; }
    const P = WBT.build(D);
    WAPP.btPlan = null;
    wSetProject(P);
    if (run) wRunSteady(true);
    wShowTab('bt');
  };
  head.querySelector('#btBuild').onclick = () => doBuild(false);
  head.querySelector('#btBuildRun').onclick = () => doBuild(true);
  if (!pending && WAPP.ss && !WAPP.stale) box.appendChild(wbtCompareCard(D));
  else if (!pending) {
    const c = el(`<div class="card"><h2>So sánh với bảng tính</h2><p>${WAPP.stale ? 'Sơ đồ/thông số đã thay đổi – ' : ''}Chưa có kết quả ổn định. <button class="pri">▶ Tính ổn định</button></p></div>`);
    c.querySelector('button').onclick = () => { wRunSteady(true); wRenderBT(); };
    box.appendChild(c);
  }
  // bảng thông số
  const grps = [...new Set(D.params.map(p => p.grp))];
  const card = el(`<div class="card"><h2>Thông số ánh xạ từ bảng tính</h2>
    <div class="row" style="margin-bottom:8px"><button id="btTyp">Dùng giá trị điển hình cho ô thiếu</button><label><input type="checkbox" id="btOnlyMiss"> Chỉ hiện ô thiếu / mặc định</label>
    <span class="small muted">${Object.values(WBT_SRC).map(s => `<span class="badge" style="color:${s[1]};background:${s[2]}">${s[0]}</span>`).join(' ')}</span></div><div id="btTab"></div></div>`);
  box.appendChild(card);
  const drawTab = () => {
    const only = card.querySelector('#btOnlyMiss').checked;
    let h = `<div class="tscroll" style="max-height:none"><table class="t"><tr><th class="l">Nhóm</th><th class="l">Thông số</th><th>Giá trị dùng</th><th class="l">Đơn vị</th><th class="l">Nguồn</th><th class="l">Trong bảng tính / ghi chú</th></tr>`;
    for (const g of grps) for (const p of D.params.filter(x => x.grp === g)) {
      if (only && !['miss', 'def', 'typ'].includes(p.src)) continue;
      const s = WBT_SRC[p.src] || WBT_SRC.def;
      h += `<tr${p.src === 'miss' ? ' style="background:#fff5f5"' : ''}><td class="l small">${esc(g)}</td><td class="l">${esc(p.l)}</td><td>${p.noNum ? '' : `<input type="number" step="any" data-p="${p.id}" value="${p.v == null ? '' : +(+p.v).toPrecision(6)}" placeholder="${p.typ != null ? 'điển hình ' + p.typ : ''}">`}</td>
        <td class="l small">${esc(p.u)}</td><td class="l"><span class="badge" style="color:${s[1]};background:${s[2]}">${s[0]}</span></td>
        <td class="l small" style="white-space:normal">${p.ref ? `<code>${esc(p.ref)}</code> ${esc(p.btName || '')}${p.btUnit && p.btUnit !== p.u ? ' [' + esc(p.btUnit) + ']' : ''}` : ''}${p.note ? ' <span class="muted">' + esc(p.note) + '</span>' : ''}</td></tr>`;
    }
    card.querySelector('#btTab').innerHTML = h + '</table></div>';
    card.querySelectorAll('input[data-p]').forEach(inp => (inp.onchange = () => {
      const p = D.params.find(x => x.id === inp.dataset.p), x = parseFloat(inp.value);
      if (isFinite(x)) { p.v = x; p.src = 'user'; } else if (inp.value === '') { p.v = null; p.src = 'miss'; }
      if (!pending) wSave();
      wRenderBT();
    }));
  };
  card.querySelector('#btOnlyMiss').onchange = drawTab;
  card.querySelector('#btTyp').onclick = () => { for (const p of D.params) if (p.src === 'miss' && p.typ != null) { p.v = p.typ; p.src = 'typ'; } if (!pending) wSave(); wRenderBT(); };
  drawTab();
}

function wbtCompareCard(D) {
  const C = WBT.compare(D, WAPP.P, WAPP.ss);
  const ST = { ok: ['khớp', 'var(--ok)'], near: ['gần', 'var(--warn)'], off: ['lệch', 'var(--bad)'], ref: ['–', 'var(--mute)'] };
  const cmp = C.rows.filter(r => r.st !== 'ref'), nOk = cmp.filter(r => r.st === 'ok').length;
  const card = el(`<div class="card"><h2>So sánh kết quả mô phỏng với bảng tính</h2>
    <div class="kpis">${wKpiTxt('Chỉ tiêu khớp', nOk + ' / ' + cmp.length, nOk === cmp.length ? 'ok' : '')}${wKpiTxt('Gần (≤ 2× sai số cho phép)', String(cmp.filter(r => r.st === 'near').length))}${wKpiTxt('Lệch', String(cmp.filter(r => r.st === 'off').length), cmp.some(r => r.st === 'off') ? 'bad' : '')}${wKpiTxt('Đạt QCVN 01-1', C.rows.filter(r => r.limOk != null).every(r => r.limOk) ? 'đạt' : 'không đạt', C.rows.filter(r => r.limOk != null).every(r => r.limOk) ? 'ok' : 'bad')}</div>
    <div class="tscroll" style="margin-top:10px;max-height:none"><table class="t"><tr><th class="l">Chỉ tiêu</th><th class="l">Đơn vị</th><th>Bảng tính</th><th>Mô hình</th><th>Chênh lệch</th><th>%</th><th class="l">Đánh giá</th><th>Giới hạn</th><th class="l">So với giới hạn</th><th class="l">Ô bảng tính</th><th class="l">Ghi chú</th></tr>
    ${C.rows.map(r => `<tr><td class="l">${esc(r.l)}</td><td class="l small">${esc(r.u)}</td><td>${r.des != null ? fmt(r.des) : '–'}</td><td><b>${fmt(r.mod)}</b></td><td>${r.d != null ? fmt(r.d) : ''}</td><td>${isFinite(r.dr) ? (r.dr * 100).toFixed(1) + ' %' : ''}</td>
      <td class="l" style="color:${ST[r.st][1]};font-weight:600">${ST[r.st][0]}</td><td>${r.lim != null ? (typeof r.lim === 'string' ? r.lim : fmt(r.lim)) : ''}</td><td class="l">${r.limOk == null ? '' : r.limOk ? '<span style="color:var(--ok)">đạt</span>' : '<span style="color:var(--bad)">không đạt</span>'}</td>
      <td class="l small"><code>${esc(r.ref || '')}</code></td><td class="l small" style="white-space:normal;min-width:220px">${esc(r.note || '')}</td></tr>`).join('')}</table></div>
    <h3>Nhận xét & gợi ý hiệu chỉnh</h3><div id="btSug"></div>
    <div class="btnrow"><button id="btCsv">Xuất bảng so sánh CSV</button></div>
    <p class="small muted">Bảng tính dùng phương pháp thiết kế (tải trọng, thời gian lưu, liều giả định); mô hình tính chất lượng nước theo hóa học cân bằng, keo tụ – lắng – lọc – khử trùng, có tuần hoàn nước rửa lọc và nước tách bùn. Sai số cho phép từng chỉ tiêu ghi ở cột ghi chú/ngầm định (lưu lượng 2 %, thủy lực 5 %, bùn/điện 15 %, nước rửa 20 %).</p></div>`);
  const sug = card.querySelector('#btSug');
  if (!C.sug.length) sug.appendChild(el('<div class="msg ok">Kết quả mô phỏng phù hợp với bảng tính trong giới hạn sai số.</div>'));
  for (const s of C.sug) sug.appendChild(el(`<div class="msg warn">${esc(s)}</div>`));
  card.querySelector('#btCsv').onclick = () => {
    const L = ['"Chi tieu","Don vi","Bang tinh","Mo hinh","Chenh lech","%","Danh gia","O bang tinh"'];
    C.rows.forEach(r => L.push(`"${r.l}","${r.u}",${r.des == null ? '' : r.des},${r.mod},${r.d == null ? '' : r.d},${isFinite(r.dr) ? (r.dr * 100).toFixed(2) : ''},"${r.st}","${r.ref || ''}"`));
    downloadText('so_sanh_bang_tinh_nuoc.csv', '﻿' + L.join('\n'), 'text/csv');
  };
  return card;
}
