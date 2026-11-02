'use strict';
/* ==========================================================================
   SimXLNT – Nhập bản tính thiết kế (.xlsx của phần mềm thiết kế XLNT) →
   tự dựng sơ đồ, gán thông số bể/thiết bị, liệt kê thông số thiếu,
   so sánh kết quả mô phỏng với kết quả tính toán của bản tính.
   Bản tính dạng bảng: cột A = ký hiệu, B = thông số, C = giá trị, D = đơn vị;
   các dòng tiêu đề mục (chỉ có cột A) chia sheet thành các mục.
   ========================================================================== */
const BT = {};

const _l1 = s => String(s == null ? '' : s).split('\n')[0].trim();
const _norm = s => _l1(s).replace(/\s+/g, ' ').toLowerCase();

/* ---------------------------------------------------------------- phân tích workbook */
BT.parse = function (wb, fileName) {
  const doc = { file: fileName || '', sheets: [], wb };
  for (const name of wb.order) {
    const sh = wb.sheets[name], c = sh.cells, rows = [];
    let sec = '';
    for (let r = 1; r <= sh.maxRow; r++) {
      const A = c['A' + r], B = c['B' + r], C = c['C' + r], D = c['D' + r];
      if (A === undefined && B === undefined && C === undefined) continue;
      if (A !== undefined && B === undefined && C === undefined) { sec = _l1(A); continue; }   // tiêu đề mục / ghi chú
      rows.push({ r, sym: _l1(A), name: _l1(B), nameFull: String(B == null ? '' : B), v: C, u: _l1(D), sec, ref: name + '!C' + r });
    }
    doc.sheets.push({ name, title: _l1(c.A1), rows, cells: c });
  }
  doc.title = (() => { const s = doc.sheets.find(x => /TONG_QUAN/i.test(x.name)); return s ? [_l1(s.cells.A1), _l1(s.cells.A2), _l1(s.cells.A3)].filter(Boolean).join(' – ') : fileName; })();
  return doc;
};
/* tìm sheet theo mẫu tên (regex trên tên sheet) */
BT.sheet = (doc, re) => doc.sheets.find(s => re.test(s.name));
/* tìm 1 dòng: q = { sh: /regex tên sheet/, sym: 'ký hiệu' | [..], name: /regex tên/, sec: /regex mục/, nth } */
BT.find = function (doc, q) {
  const shs = q.sh ? doc.sheets.filter(s => q.sh.test(s.name)) : [];
  const syms = q.sym == null ? null : (Array.isArray(q.sym) ? q.sym : [q.sym]).map(_norm);
  let k = 0;
  if (q.fn) return q.fn(doc);
  for (const s of shs) for (const row of s.rows) {
    if (syms && !syms.includes(_norm(row.sym))) continue;
    if (q.name && !q.name.test(row.nameFull)) continue;
    if (q.sec && !q.sec.test(row.sec)) continue;
    if (typeof row.v !== 'number' && !q.text) continue;
    if ((q.nth || 0) === k++) return row;
  }
  return null;
};
/* lựa chọn công nghệ ở sheet TONG_QUAN: nhãn → giá trị */
BT.choice = function (doc, labelRe) {
  const s = BT.sheet(doc, /TONG_QUAN/i); if (!s) return '';
  for (let r = 1; r < 200; r++) { const a = s.cells['A' + r]; if (a && labelRe.test(String(a))) return _l1(s.cells['B' + r]); }
  return '';
};

/* ---------------------------------------------------------------- nhận diện công nghệ */
BT.TECH = [
  [/^ICEAS/i, 'ICEAS'], [/^C-?Tech/i, 'CTECH'], [/^SBR/i, 'SBR'], [/^A²O|^A2O|^AAO/i, 'AAO'], [/^AO\b|MLE/i, 'AO'], [/^CAS|Aeroten/i, 'CAS'],
  [/Mương oxy|Oxidation/i, 'OD'], [/^MBBR/i, 'MBBR'], [/^MBR/i, 'MBR'], [/Organica/i, 'ORG'], [/Biopolus|Bioplus/i, 'BIOP'], [/NEREDA|AGS|bùn hạt hiếu khí/i, 'AGS']
];
BT.TECH_NAME = { ICEAS: 'ICEAS (Xylem)', CTECH: 'C-Tech (SFC)', SBR: 'SBR', AAO: 'A²O', AO: 'AO (MLE)', CAS: 'CAS (aeroten)', OD: 'Mương oxy hóa', MBBR: 'AO-MBBR', MBR: 'AO-MBR', ORG: 'Organica FCR (xấp xỉ IFAS)', BIOP: 'Biopolus (xấp xỉ màng bám)', AGS: 'NEREDA® – bùn hạt hiếu khí (AGS)' };
BT.techOf = function (doc) {
  const s = BT.choice(doc, /^Công nghệ sinh học/i);
  for (const [re, k] of BT.TECH) if (re.test(s)) return k;
  // không có TONG_QUAN: đoán theo tiêu đề sheet sinh học
  const sh = BT.sheet(doc, /(^|_)SH$/i);
  if (sh) for (const [re, k] of BT.TECH) if (re.test(sh.title.replace(/^.*–\s*/, ''))) return k;
  return 'AO';
};

/* ---------------------------------------------------------------- đặc tả thông số */
const S_IN = /DauVao/i, S_CB = /CanBang$/i, S_SH = /(^|_)SH$/i, S_SHCT = /SH-CT/i, S_LT = /LT2/i;
const S_HL = /(^|_)HL$/i, S_HL3 = /(^|_)HL3$/i, S_DH = /(^|_)DH$/i, S_KT = /(^|_)KT$/i, S_ANY = /./;
/* methanol (kg/ngđ) → kg COD/d (1 g methanol ≈ 1,5 g COD) – liều áp dụng kể cả khi người thiết kế chọn liều tùy ý */
const btMeOH = sh => d => { const r = BT.find(d, { sh, sym: 'M_MeOH' }); return r ? { v: r.v * 1.5, ref: r.ref, name: 'M_MeOH × 1,5 (methanol → COD)', u: 'kg COD/d' } : null; };
/* q: danh sách truy vấn; def: giá trị mặc định phần mềm (null = bắt buộc nhập) */
function P_(id, grp, l, u, q, def, opt = {}) { return Object.assign({ id, grp, l, u, q: q || [], def }, opt); }

BT.specCommon = () => [
  P_('Q', 'Dòng vào', 'Lưu lượng trung bình', 'm³/d', [{ sh: S_IN, sym: 'Q_tb' }], null),
  P_('kmax', 'Dòng vào', 'Hệ số không điều hòa lớn nhất', '-', [{ sh: S_IN, sym: 'k_max' }], 1.3),
  P_('kmin', 'Dòng vào', 'Hệ số không điều hòa nhỏ nhất', '-', [{ sh: S_IN, sym: 'k_min' }], 0.6),
  P_('T', 'Chung', 'Nhiệt độ mô phỏng (= T thấp nhất thiết kế sinh học)', '°C', [{ sh: S_IN, sym: 'T_min' }], 20, { note: 'Có thể đổi thành T cao nhất để kiểm tra cấp khí' }),
  P_('Tmax', 'Chung', 'Nhiệt độ cao nhất (tham khảo)', '°C', [{ sh: S_IN, sym: 'T_max' }], 30),
  P_('elev', 'Chung', 'Cao độ khu vực', 'm', [{ sh: S_IN, sym: 'z' }], 0),
  // nước vào cụm sinh học (cột ④ của cân bằng chất lượng – đã cộng tải nước tách bùn)
  P_('COD', 'Nước vào sinh học (cột ④)', 'COD', 'mg/L', [{ sh: S_CB, sym: 'COD4' }, { sh: S_SH, sym: 'COD' }], null),
  P_('BOD', 'Nước vào sinh học (cột ④)', 'BOD₅', 'mg/L', [{ sh: S_CB, sym: 'BOD4' }, { sh: S_SH, sym: 'BOD' }], null),
  P_('TSS', 'Nước vào sinh học (cột ④)', 'TSS', 'mg/L', [{ sh: S_CB, sym: 'TSS4' }, { sh: S_SH, sym: 'TSS' }], null),
  P_('TKN', 'Nước vào sinh học (cột ④)', 'TKN', 'mgN/L', [{ sh: S_CB, sym: 'TKN4' }, { sh: S_SH, sym: 'TKN' }], null),
  P_('NH4', 'Nước vào sinh học (cột ④)', 'NH₄-N', 'mgN/L', [{ sh: S_CB, sym: 'NH44' }, { sh: S_SH, sym: 'NH₄-N' }], null),
  P_('NO3', 'Nước vào sinh học (cột ④)', 'NO₃-N', 'mgN/L', [{ sh: S_CB, sym: 'NO34' }], 0),
  P_('TP', 'Nước vào sinh học (cột ④)', 'TP', 'mgP/L', [{ sh: S_CB, sym: 'TP4' }, { sh: S_SH, sym: 'TP' }], null),
  P_('Alk', 'Nước vào sinh học (cột ④)', 'Độ kiềm', 'mgCaCO₃/L', [{ sh: S_CB, sym: 'Alk4' }, { sh: S_SH, sym: 'Alk' }], 200),
  P_('pH', 'Nước vào sinh học (cột ④)', 'pH', '-', [{ sh: S_IN, sym: 'pH' }], 7.2),
  P_('VSSr', 'Nước vào sinh học (cột ④)', 'VSS/TSS', '-', [{ sh: S_IN, sym: 'VSS/TSS' }], 0.8, { note: 'Tham khảo – mô hình suy VSS từ COD dạng hạt, phần còn lại của TSS là chất rắn vô cơ' }),
  // nước thải thô – chỉ dùng khi dựng TOÀN dây chuyền (tiền xử lý, hóa lý, lọc, khử trùng, xử lý bùn có nước tách quay về)
  P_('COD0', 'Nước thải thô (cột ①) – toàn dây chuyền', 'COD', 'mg/L', [{ sh: S_CB, sym: 'COD3a' }, { sh: S_CB, sym: 'COD1' }], 0, { note: '0 = lấy theo cột ④; có xử lý yếm khí cấp 1 → lấy cột ③a (SimXLNT chưa mô phỏng bể yếm khí)' }),
  P_('BOD0', 'Nước thải thô (cột ①) – toàn dây chuyền', 'BOD₅', 'mg/L', [{ sh: S_CB, sym: 'BOD3a' }, { sh: S_CB, sym: 'BOD1' }], 0, { note: '0 = lấy theo cột ④; có xử lý yếm khí cấp 1 → lấy cột ③a (SimXLNT chưa mô phỏng bể yếm khí)' }),
  P_('TSS0', 'Nước thải thô (cột ①) – toàn dây chuyền', 'TSS', 'mg/L', [{ sh: S_CB, sym: 'TSS3a' }, { sh: S_CB, sym: 'TSS1' }], 0, { note: '0 = lấy theo cột ④; có xử lý yếm khí cấp 1 → lấy cột ③a (SimXLNT chưa mô phỏng bể yếm khí)' }),
  P_('TKN0', 'Nước thải thô (cột ①) – toàn dây chuyền', 'TKN', 'mgN/L', [{ sh: S_CB, sym: 'TKN3a' }, { sh: S_CB, sym: 'TKN1' }], 0, { note: '0 = lấy theo cột ④; có xử lý yếm khí cấp 1 → lấy cột ③a (SimXLNT chưa mô phỏng bể yếm khí)' }),
  P_('NH40', 'Nước thải thô (cột ①) – toàn dây chuyền', 'NH₄-N', 'mgN/L', [{ sh: S_CB, sym: 'NH43a' }, { sh: S_CB, sym: 'NH41' }], 0, { note: '0 = lấy theo cột ④; có xử lý yếm khí cấp 1 → lấy cột ③a (SimXLNT chưa mô phỏng bể yếm khí)' }),
  P_('TP0', 'Nước thải thô (cột ①) – toàn dây chuyền', 'TP', 'mgP/L', [{ sh: S_CB, sym: 'TP3a' }, { sh: S_CB, sym: 'TP1' }], 0, { note: '0 = lấy theo cột ④; có xử lý yếm khí cấp 1 → lấy cột ③a (SimXLNT chưa mô phỏng bể yếm khí)' }),
  // phân đoạn COD (M&E) → ASM
  P_('bCOD', 'Phân đoạn COD', 'bCOD vào sinh học', 'mg/L', [{ sh: S_SH, sym: ['S₀ = bCOD', 'S₀'] }], null, { derive: v => v.BOD * 1.6, note: 'Không có → 1,6·BOD' }),
  P_('rbCOD', 'Phân đoạn COD', 'rbCOD (COD dễ phân hủy)', 'mg/L', [{ sh: S_SH, sym: 'rbCOD' }], null, { derive: v => 0.2 * v.bCOD, note: 'Không có → 20 % bCOD' }),
  P_('nbsCOD', 'Phân đoạn COD', 'COD hòa tan trơ (SI)', 'mg/L', [{ sh: S_SH, sym: 'nbsCOD' }, { sh: S_IN, sym: 'nbsCOD' }], null, { derive: v => 0.05 * v.COD }),
  P_('fXH', 'Phân đoạn COD', 'Sinh khối dị dưỡng trong nước vào XH/COD', '-', [], 0.08, { note: 'Bản tính M&E không tách riêng – giá trị điển hình 0,05 – 0,15' }),
  P_('fSA', 'Phân đoạn COD', 'VFA/rbCOD (ASM2d)', '-', [], 0.4, { note: 'Nước thải sinh hoạt 0,2 – 0,5' }),
  P_('fPO4', 'Phân đoạn COD', 'PO₄/TP', '-', [], 0.5, { note: '0,4 – 0,7' }),
  P_('fSND', 'Phân đoạn COD', 'N hữu cơ hòa tan / N hữu cơ (ASM1)', '-', [], 0.3),
  // cấp khí
  P_('alpha', 'Cấp khí', 'Hệ số α', '-', [{ sh: S_SH, sym: 'α' }], 0.6),
  P_('F', 'Cấp khí', 'Hệ số bám bẩn F', '-', [{ sh: S_SH, sym: 'F' }], 0.9),
  P_('de', 'Cấp khí', 'Hệ số độ sâu hiệu dụng dₑ', '-', [{ sh: S_SH, sym: 'd_e' }], 0.4),
  P_('SOTE', 'Cấp khí', 'SOTE ở độ ngập thiết kế', '-', [{ sh: S_SH, sym: 'SOTE' }], 0.3),
  P_('subm', 'Cấp khí', 'Độ ngập đĩa', 'm', [{ sh: S_SH, sym: 'độ ngập' }, { sh: S_SH, sym: 'D_f' }, { sh: S_SH, name: /Độ ngập đĩa|độ ngập\)/i }], null, { derive: v => Math.max((v.Hmax || v.H || 5) - 0.3, 2) }),
  P_('eBlow', 'Cấp khí', 'Hiệu suất máy thổi', '-', [{ sh: S_SH, sym: 'η', name: /máy thổi/i }, { sh: S_SH, sym: 'e', name: /Hiệu suất máy thổi/i }], 0.7),
  P_('dPloss', 'Cấp khí', 'Tổn thất áp đường ống + đĩa', 'kPa', [{ sh: S_SH, sym: 'HL' }, { sh: S_SH, sym: 'Δp', name: /Tổn thất áp/ }, { sh: S_SH, name: /Tổn thất áp/ }], 12),
  P_('DO', 'Vận hành', 'DO đặt vùng hiếu khí', 'mg/L', [{ sh: S_SH, sym: 'DO' }], 2),
  P_('SVI', 'Vận hành', 'Chỉ số thể tích bùn SVI', 'mL/g', [{ sh: S_SH, sym: 'SVI' }], 120),
  P_('SRTd', 'Vận hành', 'Tuổi bùn thiết kế (mục tiêu xả bùn)', 'ngày', [{ sh: S_SH, sym: 'MCRT', name: /Tuổi bùn thiết kế/ }, { sh: S_SH, sym: 'SRT_hệ' }, { sh: S_SH, sym: 'SRT' }], 15),
  // hóa chất
  P_('Al', 'Hóa chất', 'Al châm khử P đồng thời', 'kg Al/d', [{ sh: S_SH, sym: 'M_Al' }], 0),
  P_('Fe', 'Hóa chất', 'Fe châm khử P đồng thời (FeCl₃)', 'kg Fe/d', [{ sh: S_SH, sym: 'M_Fe' }], 0),
  P_('NaOH', 'Hóa chất', 'NaOH bổ sung kiềm', 'kg/d', [{ sh: S_SH, sym: 'M_NaOH' }], 0),
  P_('nBl', 'Máy thổi khí', 'Tổng số máy thổi (kể dự phòng)', 'máy', [{ fn: d => btBlowerRow(d, 'qty') }], 0, { note: '0 = tự chọn (số bể + 1 với bể chu kỳ)' }),
  P_('nBlS', 'Máy thổi khí', 'Số máy dự phòng', 'máy', [{ fn: d => btBlowerRow(d, 'stby') }], 1),
  P_('Qbl', 'Máy thổi khí', 'Lưu lượng 1 máy (khí chuẩn 20 °C)', 'm³/h', [{ fn: d => btBlowerRow(d, 'Q') }, { sh: S_SH, sym: 'BUC', flow: 1 }, { fn: d => { const t = BT.find(d, { sh: S_SH, sym: 'ΣQ_khí' }), n = BT.find(d, { sh: S_SH, sym: 'n_máy' }); return t && n && n.v > 0 ? { v: btFlowH(t.v, t.u) / n.v, ref: t.ref, name: 'ΣQ_khí / n_máy', u: 'm³/h' } : null; } }], 0, { note: '0 = không dựng trạm máy thổi (DO lý tưởng)' }),
  P_('QairDes', 'Máy thổi khí', 'Khí công nghệ thiết kế (bể sinh học, giờ cao điểm / khi sục khí)', 'm³/h', [{ sh: S_SH, sym: 'BUC', flow: 1 }, { sh: S_SH, sym: 'Q_khí,CN', flow: 1 }, { sh: S_SH, sym: 'Q_khí', name: /khí công nghệ/i, flow: 1 }], 0),
  P_('Qaux', 'Máy thổi khí', 'Khí phụ trợ cấp từ cùng trạm (lắng cát, điều hòa, rửa màng…)', 'm³/h', [{ sh: S_SH, sym: 'Q_khác', flow: 1 }], 0),
  P_('QairTot', 'Máy thổi khí', 'Tổng khí máy thổi thiết kế (đối chiếu năng lực)', 'm³/h', [{ sh: S_SH, sym: 'ΣQ_khí', flow: 1 }], 0),
  P_('kPeak', 'Máy thổi khí', 'Hệ số đỉnh nhu cầu oxy dùng chọn khí', '-', [{ sh: S_SH, sym: 'k_đỉnh' }], 1),
  P_('arrBl', 'Máy thổi khí', 'Bố trí: 1 = mỗi bể một máy, 0 = đường ống chung', '-', [{ fn: d => btBlowerRow(d, 'arr') }], 0),
  P_('kWbl', 'Máy thổi khí', 'Công suất động cơ 1 máy (tham khảo)', 'kW', [{ fn: d => btBlowerRow(d, 'kW') }, { sh: S_SH, sym: 'P_1' }], 0),
  P_('Pbl', 'Máy thổi khí', 'Áp suất đẩy thiết kế', 'kPa', [{ fn: d => btBlowerRow(d, 'P') }, { sh: S_SH, sym: 'p_đẩy' }], null, { derive: v => 9.81 * v.subm + v.dPloss + 2 }),
  P_('Cext', 'Hóa chất', 'Carbon ngoài (quy COD)', 'kg COD/d', [{ fn: btMeOH(S_SH) }, { fn: btMeOH(S_ANY) }, { sh: S_SH, sym: 'COD_ngoài' }, { sh: S_ANY, sym: 'COD_ngoài' }, { sh: S_SH, name: /carbon ngoài.*COD|COD.*carbon ngoài/i }], 0),
  // toàn dây chuyền: liều hóa chất & kích thước theo bản tính (chỉ dùng khi dựng "Toàn dây chuyền")
  P_('PAC1', 'Toàn dây chuyền', 'Liều PAC – hóa lý trước sinh học (CEPT)', 'mg/L', [{ sh: S_HL, sym: 'C_PAC' }], 40),
  P_('poly1', 'Toàn dây chuyền', 'Liều polymer – hóa lý trước sinh học', 'mg/L', [{ sh: S_HL, sym: 'C_poly' }], 1),
  P_('NaOH1', 'Toàn dây chuyền', 'NaOH 100 % chỉnh pH – hóa lý trước sinh học', 'kg/d', [{ sh: S_HL, sym: 'M_NaOH' }], 0),
  P_('PAC3', 'Toàn dây chuyền', 'Liều PAC – hóa lý bậc 3', 'mg/L', [{ sh: S_HL3, sym: 'C_PAC' }], 30),
  P_('poly3', 'Toàn dây chuyền', 'Liều polymer – hóa lý bậc 3', 'mg/L', [{ sh: S_HL3, sym: 'C_poly' }], 0.5),
  P_('NaOH3', 'Toàn dây chuyền', 'NaOH 100 % chỉnh pH – hóa lý bậc 3', 'kg/d', [{ sh: S_HL3, sym: 'M_NaOH' }], 0),
  P_('Veq', 'Toàn dây chuyền', 'Thể tích bể điều hòa', 'm³', [{ sh: S_DH, sym: 'V_tt' }, { sh: S_DH, sym: 'V' }], 0, { note: '0 = Q·6/24' }),
  P_('Heq', 'Toàn dây chuyền', 'Chiều sâu công tác bể điều hòa', 'm', [{ sh: S_DH, sym: 'H' }], 5),
  P_('Cl2', 'Toàn dây chuyền', 'Liều clo hoạt tính khử trùng', 'mg/L', [{ sh: S_KT, sym: 'C' }], 5),
  P_('tCl', 'Toàn dây chuyền', 'Thời gian tiếp xúc clo', 'phút', [{ sh: S_KT, sym: 't' }], 30),
  P_('UVd', 'Toàn dây chuyền', 'Liều UV', 'mJ/cm²', [{ sh: S_KT, sym: 'D_UV' }], 40)
];

BT.specTech = function (tech) {
  const cyc = [
    P_('fPre', 'Bể sinh học', 'Tỷ lệ diện tích ngăn tiền phản ứng/chọn lọc', '-', [], tech === 'CTECH' ? 0.1 : 0.15, { note: 'Bản tính không tách riêng – Sanitaire/SFC 10 – 15 %' })
  ];
  if (tech === 'ICEAS') return cyc.concat([
    P_('N', 'Bể sinh học', 'Tổng số bể ICEAS', 'bể', [{ sh: S_SH, sym: 'N', name: /Tổng số bể/ }], null),
    P_('W', 'Bể sinh học', 'Chiều rộng bể', 'm', [{ sh: S_SH, sym: 'W', sec: /H1|thể tích bể/i }], null),
    P_('L', 'Bể sinh học', 'Chiều dài bể', 'm', [{ sh: S_SH, sym: 'L', sec: /H1|thể tích bể/i }], null),
    P_('Hmax', 'Bể sinh học', 'Mực nước cao TWL', 'm', [{ sh: S_SH, sym: 'TWL' }], null),
    P_('Hmin', 'Bể sinh học', 'Mực nước đáy BWL', 'm', [{ sh: S_SH, sym: 'BWL', sec: /H1|thể tích bể/i }, { sh: S_SH, sym: 'BWL' }], null),
    P_('icBatch', 'Chu kỳ', 'Chế độ nạp: 1 = gián đoạn theo mẻ như SBR, 0 = liên tục (ICEAS chuẩn)', '-', [{ fn: d => { const c = BT.choice(d, /^Chế độ nạp nước ICEAS/i); return c ? { v: /gián đoạn|theo mẻ/i.test(c) ? 1 : 0, ref: 'TONG_QUAN', name: c, u: '-' } : null; } }], 0),
    P_('tAer', 'Chu kỳ', 'Sục khí (Air-On)', 'phút', [{ sh: S_SH, sym: 't_on' }], 120),
    P_('tMix', 'Chu kỳ', 'Khuấy không sục (Air-Off)', 'phút', [{ sh: S_SH, sym: 't_off' }], 0),
    P_('tS', 'Chu kỳ', 'Lắng', 'phút', [{ sh: S_SH, sym: 't_set' }], 60),
    P_('tD', 'Chu kỳ', 'Gạn', 'phút', [{ sh: S_SH, sym: 't_dec' }], 60),
    P_('TSSe', 'Bể sinh học', 'TSS nước gạn thiết kế', 'mg/L', [{ sh: S_SH, sym: ['TESS', 'TSS_e'] }], 10),
    P_('Vws', 'Bùn dư', 'Thể tích bùn thải mỗi bể (tham khảo, SF_ws của bản tính)', 'm³/d', [{ sh: S_SH, sym: 'V_ws' }], 0),
    P_('dM', 'Bùn dư', 'Bùn sinh ra mỗi bể ΔM', 'kg/d', [{ sh: S_SH, sym: 'ΔM', name: /bùn sinh ra mỗi bể|Khối lượng bùn sinh ra/i }], null, { derive: v => v.BMOB / v.SRTd - v.Q / v.N * v.TSSe / 1000 }),
    P_('BMOB', 'Bùn dư', 'Khối lượng bùn trong 1 bể BMOB', 'kg', [{ sh: S_SH, sym: 'BMOB' }], null, { derive: v => v.MLSSd * v.W * v.L * v.Hmin / 1000 }),
    P_('MLSSd', 'Bùn dư', 'MLSS thiết kế tại BWL', 'mg/L', [{ sh: S_SH, sym: 'MLSS_BWL' }], 4000),
    P_('ncy', 'Bùn dư', 'Số chu kỳ / ngày', 'chu kỳ', [{ sh: S_SH, sym: 'n_ck' }], null, { derive: v => 1440 / (v.tAer + v.tMix + v.tS + v.tD) })
  ]);
  if (tech === 'CTECH') return cyc.concat([
    P_('N', 'Bể sinh học', 'Số bể', 'bể', [{ sh: S_SH, sym: 'N', name: /Số bể/ }, { sh: S_SH, sym: ['N', 'n'] }], null),
    P_('L', 'Bể sinh học', 'Chiều dài bể', 'm', [{ sh: S_SH, sym: 'L', name: /Chiều dài bể/ }], null),
    P_('W', 'Bể sinh học', 'Chiều rộng bể', 'm', [{ sh: S_SH, sym: 'B', name: /Chiều rộng bể/ }], null),
    P_('Hmax', 'Bể sinh học', 'Mực nước cao TWL', 'm', [{ sh: S_SH, sym: 'TWL' }], null),
    P_('Hmin', 'Bể sinh học', 'Mực nước thấp BWL', 'm', [{ sh: S_SH, sym: 'BWL' }], null),
    P_('tF', 'Chu kỳ', 'Pha nạp', 'phút', [{ sh: S_SH, name: /(^|\s)Nạp|thời gian nạp/i, sec: /chu kỳ|C-Tech|pha/i }], 120),
    P_('tFm', 'Chu kỳ', 'Trong đó nạp khuấy không sục', 'phút', [{ sh: S_SH, name: /không sục|khuấy/i, sec: /chu kỳ|pha/i }], 30),
    P_('tS', 'Chu kỳ', 'Lắng', 'phút', [{ sh: S_SH, name: /^Lắng|thời gian lắng/i, sec: /chu kỳ|pha/i }], 60),
    P_('tD', 'Chu kỳ', 'Gạn', 'phút', [{ sh: S_SH, name: /^Gạn|Chắt|thời gian gạn/i, sec: /chu kỳ|pha/i }], 60),
    P_('rRAS', 'Bể sinh học', 'Tỷ lệ tuần hoàn bùn về selector', '-', [{ sh: S_SH, sym: 'R', name: /tuần hoàn/i }], 0.25),
    P_('TSSe', 'Bể sinh học', 'TSS nước gạn thiết kế', 'mg/L', [{ sh: S_SH, sym: ['TSSe_dec', 'TSS_e', 'TESS'] }], 10),
    P_('PXTSS', 'Bùn dư', 'Bùn dư P_X,TSS', 'kg/d', [{ sh: S_SH, sym: 'P_X,TSS' }], null),
    P_('Cws', 'Bùn dư', 'Nồng độ bùn xả', 'kg/m³', [{ sh: S_SH, name: /Nồng độ bùn (thải|xả|dư)/i }], null, { derive: v => 1000 / v.SVI })
  ]);
  if (tech === 'AGS') return BT.specTech('SBR').concat([
    P_('Vbuf', 'Bể sinh học', 'Bể điều hòa trước AGS (0 = không)', 'm³', [{ sh: S_SH, sym: 'V_đh' }], 0),
    P_('WASc', 'Xử lý bùn', 'Nồng độ bùn dư rút', 'kg/m³', [{ sh: S_SH, sym: 'C_bùn dư' }], 12),
    P_('cakeDS', 'Xử lý bùn', 'Độ khô bánh bùn', '%', [], 20)
  ]);
  if (tech === 'SBR') return [
    P_('N', 'Bể sinh học', 'Số bể SBR', 'bể', [{ sh: S_SH, sym: 'n', name: /Số bể/ }], null),
    P_('VT', 'Bể sinh học', 'Thể tích 1 bể', 'm³', [{ sh: S_SH, sym: 'V_T' }], null),
    P_('H', 'Bể sinh học', 'Chiều sâu nước cao nhất', 'm', [{ sh: S_SH, sym: 'H', name: /Chiều sâu nước cao nhất/ }, { sh: S_SH, sym: 'H' }], 5),
    P_('VF', 'Bể sinh học', 'Phân suất nạp V_F/V_T', '-', [{ sh: S_SH, sym: 'V_F/V_T' }], 0.25),
    P_('tF', 'Chu kỳ', 'Nạp (khuấy)', 'h', [{ sh: S_SH, sym: 't_nạp' }], 2),
    P_('tR', 'Chu kỳ', 'Sục khí', 'h', [{ sh: S_SH, sym: 't_sục' }], 2),
    P_('tS', 'Chu kỳ', 'Lắng', 'h', [{ sh: S_SH, sym: 't_lắng' }], 1),
    P_('tD', 'Chu kỳ', 'Xả nước', 'h', [{ sh: S_SH, sym: 't_xả' }], 0.75),
    P_('tI', 'Chu kỳ', 'Chờ', 'h', [{ sh: S_SH, sym: 't_chờ' }], 0.25),
    P_('TSSe', 'Bể sinh học', 'TSS nước gạn thiết kế', 'mg/L', [{ sh: S_SH, sym: ['TSS_e', 'TESS'] }], 10),
    P_('PXTSS', 'Bùn dư', 'Bùn dư P_X,TSS', 'kg/d', [{ sh: S_SH, sym: 'P_X,TSS' }], null)
  ];
  // công nghệ dòng liên tục
  const cont = [
    P_('Vkk', 'Bể sinh học', 'Thể tích kỵ khí', 'm³', [{ sh: S_SH, sym: 'V_kk' }], tech === 'AAO' ? null : 0),
    P_('Vtk', 'Bể sinh học', 'Thể tích thiếu khí', 'm³', [{ sh: S_SH, sym: 'V_tk' }], ['CAS'].includes(tech) ? 0 : null),
    P_('Vhk', 'Bể sinh học', 'Thể tích hiếu khí', 'm³', tech === 'MBBR' ? [{ sh: S_SH, sym: 'V_hk', name: /bể hiếu khí/ }, { sh: S_SH, sym: 'V_hk' }] : [{ sh: S_SH, sym: 'V_hk' }], null),
    P_('Vtot', 'Bể sinh học', 'Tổng thể tích (tham khảo)', 'm³', [{ sh: S_SH, sym: 'V_tổng' }], 0),
    P_('H', 'Bể sinh học', 'Chiều sâu nước', 'm', [{ sh: S_SH, sym: 'H', name: /Chiều sâu/ }], 5),
    P_('R', 'Tuần hoàn', 'Tỷ lệ tuần hoàn bùn R', '-', [{ sh: S_SH, sym: 'R', name: /tuần hoàn bùn/i }], tech === 'MBR' ? 4 : 0.7),
    P_('IR', 'Tuần hoàn', 'Tỷ lệ tuần hoàn nội IR', '-', [{ sh: S_SH, sym: 'IR' }], ['CAS', 'MBBR'].includes(tech) ? 0 : 3),
    P_('PXTSS', 'Bùn dư', 'Bùn dư P_X,TSS', 'kg/d', [{ sh: S_SH, sym: 'P_X,TSS' }], null, { derive: v => { const V = (+v.Vkk || 0) + (+v.Vtk || 0) + (+v.Vhk || 0) + (+v.Vmem || 0), X = v.XR > 0 && v.R > 0 ? v.XR * v.R / (1 + v.R) : null; return V > 0 && X && v.SRTd > 0 ? V * X / 1000 / v.SRTd : null; }, note: 'Không có → V·MLSS/SRT (MLSS = X_R·R/(1+R))' }),
    P_('XR', 'Bùn dư', 'Nồng độ bùn tuần hoàn/xả X_R', 'mg/L', [{ sh: S_SH, sym: 'X_R' }], null, { derive: v => 1e6 / v.SVI, note: 'Trong mô phỏng X_R là kết quả của bể lắng; giá trị này dùng quy đổi bùn dư P_X → lưu lượng xả (đổi SRT thiết kế để đổi lượng xả)' })
  ];
  if (tech === 'OD') cont.push(P_('fAerOD', 'Bể sinh học', 'Phần thể tích sục khí mương oxy hóa', '-', [], 0.6, { note: 'Áp dụng khi bản tính chỉ có tổng thể tích' }));
  if (tech === 'MBR') cont.push(
    P_('Vmem', 'Bể màng', 'Thể tích bể màng', 'm³', [{ sh: S_SH, sym: 'V_màng' }], null),
    P_('Am', 'Bể màng', 'Diện tích màng', 'm²', [{ sh: S_SH, sym: 'A_màng' }], null),
    P_('SADm', 'Bể màng', 'Khí sục rửa màng SADm', 'Nm³/m²/h', [{ sh: S_SH, sym: 'SADm' }], 0.25));
  if (['MBBR', 'ORG', 'BIOP'].includes(tech)) cont.push(
    P_('fill', 'Giá thể', 'Tỷ lệ nạp giá thể / thể tích module', '-', [{ sh: S_SH, sym: ['fill', 'f', 'φ'] }], 0.5),
    P_('SSA', 'Giá thể', 'Diện tích bề mặt hiệu dụng', 'm²/m³', [{ sh: S_SH, sym: 'SSA' }], 500));
  if (!['MBR', 'MBBR'].includes(tech) && !(tech === 'BIOP')) cont.push(
    P_('Acl', 'Bể lắng thứ cấp', 'Tổng diện tích bề mặt bể lắng', 'm²', [{ sh: S_LT, name: /Tổng diện tích|Diện tích (bề mặt|lắng) (tổng|yêu cầu)/i }, { sh: S_LT, sym: 'A' }], null,
      { derive: v => (v.nCl > 0 && v.Dcl > 0) ? v.nCl * Math.PI * v.Dcl * v.Dcl / 4 : null }),
    P_('nCl', 'Bể lắng thứ cấp', 'Số bể lắng', 'bể', [{ sh: S_LT, sym: 'n' }], 0),
    P_('Dcl', 'Bể lắng thứ cấp', 'Đường kính bể lắng', 'm', [{ sh: S_LT, sym: 'D' }], 0),
    P_('Hcl', 'Bể lắng thứ cấp', 'Chiều sâu công tác bể lắng', 'm', [{ sh: S_LT, name: /Chiều sâu/ }], 4));
  return cont;
};

/* các chỉ tiêu so sánh: thiết kế (bản tính) ↔ mô hình */
BT.targetSpec = tech => {
  const cyc = ['ICEAS', 'CTECH', 'SBR', 'AGS'].includes(tech);
  const perB = tech === 'ICEAS' ? 'N' : null;  // một số dòng ICEAS tính cho MỘT bể
  return [
    { k: 'COD', l: 'COD ra', u: 'mg/L', q: [{ sh: S_CB, sym: 'COD5' }], m: 'eff', tol: 5, lim: { sh: S_IN, sym: 'COD_gh' } },
    { k: 'BOD5', l: 'BOD₅ ra', u: 'mg/L', q: [{ sh: S_CB, sym: 'BOD5' }], m: 'eff', tol: 3, lim: { sh: S_IN, sym: 'BOD_gh' } },
    { k: 'TSS', l: 'TSS ra', u: 'mg/L', q: [{ sh: S_CB, sym: 'TSS5' }], m: 'eff', tol: 3, lim: { sh: S_IN, sym: 'TSS_gh' } },
    { k: 'NH4', l: 'NH₄-N ra', u: 'mg/L', q: [{ sh: S_CB, sym: 'NH45' }], m: 'eff', tol: 1, lim: { sh: S_IN, sym: 'NH4_gh' } },
    { k: 'NOx', l: 'NO₃-N ra', u: 'mg/L', q: [{ sh: S_CB, sym: 'NO35' }], m: 'eff', tol: 1.5 },
    { k: 'TKN', l: 'TKN ra', u: 'mg/L', q: [{ sh: S_CB, sym: 'TKN5' }], m: 'eff', tol: 1 },
    { k: 'TN', l: 'TN ra', u: 'mg/L', q: [{ sh: S_CB, sym: 'TN5' }], m: 'eff', tol: 2, lim: { sh: S_IN, sym: 'TN_gh' } },
    { k: 'TP', l: 'TP ra', u: 'mg/L', q: [{ sh: S_CB, sym: 'TP5' }], m: 'eff', tol: 0.5, lim: { sh: S_IN, sym: 'TP_gh' }, only: 'ASM2d' },
    { k: 'Alk', l: 'Độ kiềm ra', u: 'mgCaCO₃/L', q: [{ sh: S_CB, sym: 'Alk5' }], m: 'eff', tol: 15 },
    { k: 'SRT', l: 'Tuổi bùn SRT', u: 'ngày', q: [{ sh: S_SH, sym: ['MCRT'], name: /Tuổi bùn thiết kế/ }, { sh: S_SH, sym: 'SRT_hệ' }, { sh: S_SH, sym: 'SRT' }], m: 'plant', rel: 0.1 },
    { k: 'MLSS', l: cyc ? 'MLSS (trung bình theo thể tích)' : 'MLSS bể hiếu khí', u: 'mg/L', q: cyc ? [{ sh: S_SH, sym: 'MLSS_TWL' }, { sh: S_SH, sym: 'MLSS' }, { sh: S_SH, sym: 'X_TSS' }] : [{ sh: S_SH, sym: ['X_TSS', 'MLSS'] }], q2: cyc ? [{ sh: S_SH, sym: 'MLSS_BWL' }] : null, m: 'plant', rel: 0.1 },
    { k: 'WAS', l: 'Bùn dư sinh học (kể bùn hóa học khử P)', u: 'kgTSS/d', q: [{ sh: /Bun$/i, sym: 'M_sinh học' }, { sh: S_SH, sym: 'P_X,TSS' }], m: 'plant', rel: 0.15 },
    { k: 'OTR', l: 'Nhu cầu O₂ thực (AOR)', u: 'kgO₂/d', q: [{ sh: S_SH, sym: 'AOR', name: /Tổng nhu cầu oxy/ }, { sh: S_SH, name: /Tổng nhu cầu oxy|AOR/ }], m: 'plant', rel: 0.15, perB },
    { k: 'air', l: 'Lượng khí cấp (bể sinh học, TB ngày)', u: 'm³/d', q: [{ sh: S_SH, sym: 'Q_khí,CN' }, { sh: S_SH, sym: 'Q_khí', name: /khí công nghệ/i }, { sh: S_SH, name: /Khí công nghệ/i }], m: 'plant', rel: 0.2 },
    { k: 'Eblow', l: 'Điện năng máy thổi khí', u: 'kWh/d', q: [{ sh: S_SH, sym: 'E_thổi' }, { sh: S_SH, name: /Điện năng máy thổi/i }, { fn: d => btEnergyRow(d) }], m: 'plant', rel: 0.2 },
    { k: 'HRT', l: 'Thời gian lưu nước HRT', u: 'h', q: [{ sh: S_SH, sym: 'HRT' }, { sh: S_SH, sym: 'τ' }], m: 'plant', rel: 0.1 }
  ];
};

/* ---------------------------------------------------------------- lập kế hoạch (ánh xạ + thông số thiếu) */
BT.plan = function (doc) {
  const tech = BT.techOf(doc);
  const spec = BT.specCommon().concat(BT.specTech(tech));
  const vals = {}, params = [];
  // hai lượt: giá trị trực tiếp, sau đó giá trị suy ra (cần các giá trị khác)
  for (const s of spec) {
    let row = null;
    for (const q of s.q) { row = BT.find(doc, q); if (row) break; }
    const p = { id: s.id, grp: s.grp, l: s.l, u: s.u, note: s.note || '', v: null, src: 'miss', ref: '' };
    if (row) {
      p.v = row.v; p.src = 'bt'; p.ref = row.ref; p.btName = row.name; p.btUnit = row.u;
      const qq = s.q.find(q => q.flow && BT.find(doc, q) === row);
      if (qq && row.u) { p.v = btFlowH(row.v, row.u); if (!/m³\s*\/\s*h\b/i.test(row.u)) p.btName += ` (${fmt(row.v)} ${row.u} → m³/h)`; }
    }
    params.push(p); vals[s.id] = p.v;
  }
  for (const s of spec) {
    const p = params.find(x => x.id === s.id);
    if (p.src === 'bt') continue;
    let v = null;
    if (s.derive) { try { v = s.derive(Object.assign({}, vals, Object.fromEntries(params.map(x => [x.id, x.v == null ? (spec.find(y => y.id === x.id).def) : x.v])))); } catch (e) { v = null; } }
    if (v != null && isFinite(v)) { p.v = v; p.src = 'calc'; }
    else if (s.def != null) { p.v = s.def; p.src = 'def'; }
    vals[s.id] = p.v;
  }
  // đối chiếu năng lực máy thổi (ThietBi) với khí thiết kế (SH): bể chu kỳ – theo bể; dòng liên tục – tổng (kể khí phụ trợ)
  {
    const P = id => params.find(p => p.id === id), val = id => { const p = P(id); return p ? +p.v : 0; };
    const pq = P('Qbl'), nD = Math.max(val('nBl') - val('nBlS'), 1), ded = val('arrBl') > 0.5;
    if (pq && pq.v > 0) {
      const notes = [];
      if (ded && val('QairDes') > 0) { const d = (pq.v - val('QairDes')) / val('QairDes') * 100; notes.push(`đối chiếu khí mỗi bể ${fmt(val('QairDes'))} m³/h: lệch ${d.toFixed(2)} %` + (d < -1 ? ' – MÁY NHỎ HƠN NHU CẦU MỖI BỂ' : '')); }
      else {
        const need = val('QairTot') > 0 ? val('QairTot') : val('QairDes') + val('Qaux');
        if (need > 0) { const cap = nD * pq.v, d = (cap - need) / need * 100; notes.push(`năng lực ${nD} máy × ${fmt(pq.v)} = ${fmt(cap)} m³/h so với tổng khí thiết kế ${fmt(need)} m³/h (công nghệ đỉnh ${fmt(val('QairDes'))} + phụ trợ ${fmt(val('Qaux'))}): ${Math.abs(d) < 1 ? 'khớp (lệch ' + d.toFixed(2) + ' %)' : (d >= 0 ? 'dư ' : 'THIẾU ') + Math.abs(d).toFixed(1) + ' %'}`); }
      }
      if (notes.length) pq.note = notes.join('; ') + '. ' + (pq.note || '');
    }
  }  // chuỗi công nghệ (để hiển thị)
  const chain = [];
  const sh = (lab) => BT.choice(doc, lab);
  [[/^Song chắn rác thô/i, 'Song chắn rác thô', 0], [/^Lưới lọc rác tinh/i, 'Lưới lọc rác tinh', 0], [/^Lắng cát/i, 'Lắng cát – tách dầu', 0], [/^Bể điều hòa/i, 'Bể điều hòa', 0],
   [/^Vị trí cụm hóa lý/i, 'Hóa lý', 0], [/^Công nghệ sinh học/i, 'Sinh học', 1], [/^Bể lắng thứ cấp/i, 'Lắng thứ cấp', 1], [/^Lọc bậc 3/i, 'Lọc bậc 3', 0], [/^Khử trùng/i, 'Khử trùng', 0],
   [/^Nén bùn/i, 'Nén bùn', 0], [/^Khử nước bùn/i, 'Khử nước bùn', 0], [/^Khử P hóa học/i, 'Khử P hóa học bổ trợ', 1], [/^Carbon ngoài/i, 'Carbon ngoài', 1]
  ].forEach(([re, n, sim]) => {
    const c = sh(re); if (!c) return;
    let s = sim && !/Không/i.test(c);
    if (n === 'Lắng thứ cấp') s = !['ICEAS', 'CTECH', 'SBR', 'AGS', 'MBR'].includes(tech);
    if (n === 'Khử P hóa học bổ trợ') s = vals.Al > 0;
    if (n === 'Carbon ngoài') s = vals.Cext > 0;
    chain.push({ n, c, sim: s });
  });
  const targets = [];
  for (const t of BT.targetSpec(tech)) {
    let row = null; for (const q of t.q) { row = BT.find(doc, q); if (row) break; }
    if (!row) continue;
    let v = row.v;
    const lim = t.lim ? BT.find(doc, t.lim) : null;
    let v2 = null; if (t.q2) { for (const q of t.q2) { const r2 = BT.find(doc, q); if (r2) { v2 = r2.v; break; } } }
    let note = '', perB = t.perB, conv = t.conv, refOnly = false;
    if (t.k === 'air') {
      // Q khí thiết kế (theo đơn vị bản tính) → m³/h → trung bình ngày: × giờ sục khí/ngày ÷ hệ số đỉnh (× số bể nếu tính cho 1 bể)
      const qh = btFlowH(row.v, row.u), get = (sym, d) => { const r = BT.find(doc, { sh: S_SH, sym }); return r ? +r.v : d; };
      const k = get('k_đỉnh', 1), TA = get('TA', null), f = get('f_sục', 1);
      const hrs = TA != null ? TA : 24 * f, nB = tech === 'ICEAS' ? get('N', 1) : 1;
      v = qh * hrs / k * nB; perB = null; conv = null;
      note = `${fmt(row.v)} ${row.u}` + (qh !== row.v ? ` = ${fmt(qh)} m³/h` : '') + (nB > 1 ? ` × ${nB} bể` : '') + ` × ${fmt(hrs)} h sục khí/ngày` + (k !== 1 ? ` ÷ hệ số đỉnh ${fmt(k)}` : '') + ' = khí trung bình ngày (bể sinh học, ở T_max)';
    }
    if (t.k === 'Eblow' && /phụ trợ|lắng cát|điều hòa/i.test(row.nameFull || row.name)) { refOnly = true; note = 'Bản tính gồm cả khí phụ trợ, ở lưu lượng đỉnh – chỉ tham khảo'; }
    if (t.k === 'OTR' && tech !== 'ICEAS') note = 'AOR trung bình ngày ở T_max';
    targets.push({ k: t.k, l: t.l, u: t.u, m: t.m, tol: t.tol, rel: t.rel, v, v2, ref: row.ref, perB, conv, only: t.only, lim: lim ? lim.v : null, btName: row.name, btUnit: row.u, note, refOnly });
  }
  return { file: doc.file, title: doc.title, tech, techName: BT.TECH_NAME[tech], model: 'ASM2d', params, targets, chain, time: new Date().toLocaleString('vi-VN') };
};

/* giá trị thông số theo id */
BT.val = (D, id) => { const p = D.params.find(x => x.id === id); return p ? +p.v : NaN; };
/* người dùng sửa một thông số: lưu giá trị nhập tay rồi tính lại các thông số suy ra phụ thuộc (chưa nhập tay) –
   'calc'/'def'/'typ' → giá trị suy ra mới; số liệu bên gửi ('bt'/'xch') → co giãn theo tỷ lệ suy ra mới/cũ (giữ hiệu chỉnh của bên gửi).
   Lặp vài lượt cho chuỗi phụ thuộc (SVI → X_R → P_X,TSS), mỗi lượt tính từ giá trị gốc trước khi sửa. */
BT.setParam = function (D, id, x) {
  const p = D.params.find(q => q.id === id); if (!p) return;
  const spec = BT.specCommon().concat(BT.specTech(D.tech)), sp = Object.fromEntries(spec.map(s => [s.id, s]));
  const cur = () => Object.fromEntries(D.params.map(q => [q.id, q.v == null ? (sp[q.id] && sp[q.id].def) : +q.v]));
  const before = cur(), orig = Object.fromEntries(D.params.map(q => [q.id, q.v]));
  if (x == null || x === '' || !isFinite(+x)) { p.v = null; p.src = 'miss'; } else { p.v = +x; p.src = 'user'; }
  const ev = (f, vals) => { try { const r = f(vals); return r != null && isFinite(r) ? +r : null; } catch (e) { return null; } };
  for (let pass = 0; pass < 3; pass++) {
    let chg = false;
    for (const s of spec) {
      if (!s.derive || s.id === id) continue;
      const q = D.params.find(z => z.id === s.id); if (!q || q.src === 'user') continue;
      const dB = ev(s.derive, before), dA = ev(s.derive, cur()); if (dA == null || (dB != null && Math.abs(dA - dB) <= 1e-12 * (1 + Math.abs(dB)))) continue;
      const o = orig[s.id];
      const nv = ['bt', 'xch'].includes(q.src) && o != null && isFinite(+o) && dB != null && dB !== 0 ? +o * dA / dB : dA;
      if (q.v == null || Math.abs(nv - +q.v) > 1e-9 * (1 + Math.abs(nv))) { q.v = +(+nv).toPrecision(8); if (q.src === 'miss' || q.src === 'def' || q.src === 'typ') q.src = 'calc'; chg = true; }
    }
    if (!chg) break;
  }
};
BT.missing = D => D.params.filter(p => p.src === 'miss' && !(p.v != null && p.v !== '' && isFinite(+p.v)));

/* ---------------------------------------------------------------- dựng dự án SimXLNT */
BT.build = function (D) {
  const v = id => BT.val(D, id);
  const tech = D.tech, Q = v('Q');
  const COD = v('COD'), bCOD = v('bCOD'), SI = v('nbsCOD'), rb = v('rbCOD');
  const fSI = SI / COD, fSB = rb / COD, fXI = Math.max(COD - bCOD - SI, 0) / COD;
  const inf = {
    mode: 'frac', COD, fSI: +fSI.toFixed(4), fSB: +fSB.toFixed(4), fSA: v('fSA'), fXI: +fXI.toFixed(4), fXH: v('fXH'), fXA: 0, fXPAO: 0,
    TKN: v('TKN'), fNH4: +(v('NH4') / v('TKN')).toFixed(4), fSND: v('fSND'), TP: v('TP'), fPO4: v('fPO4'), TSS: v('TSS'), Alk: v('Alk'), pH: v('pH'), NO3: v('NO3'), DO: 0, metal: 0,
    st: {}, pat: { type: 'diurnal', aQ: +Math.max(Math.min(((v('kmax') - 1) + (1 - (v('kmin') > 0 ? v('kmin') : 2 - v('kmax')))) / 2, 0.8), 0.05).toFixed(3), pQ: 14, aC: 0.15, pC: 12, csv: '', loop: true }
  };
  const subm = v('subm');
  const plant = { T: v('T'), elev: v('elev') || 0, alpha: v('alpha'), F: v('F'), de: v('de'), sote: +(v('SOTE') * 100 / Math.max(subm, 0.5)).toFixed(3), eBlow: v('eBlow'), dPloss: v('dPloss') };
  const U = [], Lk = [];
  const add = (id, type, name, x, y, p) => U.push([id, type, name, x, y, p || {}]);
  const ln = (a, b) => Lk.push([a, b]);
  const desc = [`Dựng tự động từ bản tính "${D.file}" (${D.techName}).`];
  let bioIn = null;    // đơn vị nhận nước vào sinh học
  add('INF', 'influent', 'Nước vào sinh học (cột ④)', 60, 230, { Q, inf });
  const DO = v('DO'), SVI = v('SVI');
  if (tech === 'ICEAS' || tech === 'CTECH') {
    const N = Math.round(v('N')), A = v('W') * v('L');
    const p = { N, A: +A.toFixed(1), Hmax: v('Hmax'), Hmin: +v('Hmin').toFixed(3), DOsp: DO, SVI, TSSe: v('TSSe'), sm: 'layered', nLay: 15 };
    if (tech === 'ICEAS') {
      Object.assign(p, { fPre: v('fPre'), feed: v('icBatch') > 0.5 ? 'batch' : 'cont', mode: 'custom', tAer: v('tAer'), tMix: v('tMix'), tS: v('tS'), tD: v('tD') });
      if (p.feed === 'batch') desc.push(`ICEAS nạp gián đoạn như SBR: mỗi bể nhận toàn bộ dòng vào trong Tc/N = ${((p.tAer + p.tMix + p.tS + p.tD) / N).toFixed(0)} phút (nạp khuấy thiếu khí trước, sau đó nạp sục khí), luân phiên giữa ${N} bể; không nạp khi lắng và gạn.`);
      // xả bùn từ cân bằng bùn: (BMOB·N/SRT − Q·TSS_e)/X_đáy, X_đáy ≈ giới hạn nén 1,2·10⁶/SVI của mô hình lắng phân tầng
      const Xb = 1.2e6 / SVI / 1000, Mw = v('BMOB') * N / v('SRTd') - Q * v('TSSe') / 1000;
      p.Vwas = +(Math.max(Mw, 0.02 * v('BMOB') * N / v('SRTd')) / Xb / v('ncy') / N).toFixed(2);
      desc.push(`ICEAS ${N} bể × ${(+A).toFixed(0)} m², TWL ${p.Hmax} m / BWL ${p.Hmin} m; chu kỳ ${p.tAer}/${p.tMix}/${p.tS}/${p.tD} phút; bùn xả ${p.Vwas} m³/bể/chu kỳ từ cân bằng bùn (BMOB·N/SRT − Q·TSS_e)/X_đáy với X_đáy = ${(Xb).toFixed(1)} kg/m³ – dùng nút Tự hiệu chỉnh SRT để khớp chính xác.`);
    } else {
      Object.assign(p, { fSel: v('fPre'), tF: v('tF'), tFm: v('tFm'), tR: 0, tS: v('tS'), tD: v('tD'), tI: 0, rRAS: v('rRAS') });
      const Tc = (p.tF + p.tR + p.tS + p.tD) / 60, ncy = 24 / Tc * N / Math.max(N, 1);
      p.Vwas = +(v('PXTSS') / v('Cws') / (24 / Tc) / N).toFixed(2);
      desc.push(`C-Tech ${N} bể; bùn xả ${p.Vwas} m³/bể/chu kỳ (= P_X,TSS/C_ws/số chu kỳ).`); void ncy;
    }
    p.wasMode = 'srt'; p.SRTw = +btSRTw(v, tech).toFixed(2);
    desc.push(`Xả bùn theo tuổi bùn mục tiêu SRT_xả = ${p.SRTw} d (khối bùn / bùn xả, tương đương MCRT ${(+v('SRTd')).toFixed(1)} d của bản tính khi TSS ra = ${v('TSSe')} mg/L).`);
    add('BIO', tech === 'ICEAS' ? 'iceas' : 'ctech', tech === 'ICEAS' ? 'ICEAS' : 'C-Tech', 330, 230, p);
    add('EFF', 'effluent', 'Nước gạn (sau sinh học – cột ⑤)', 560, 200);
    add('WAS', 'sludge', 'Bùn dư', 560, 380);
    ln('INF.out', 'BIO.in'); ln('BIO.eff', 'EFF.in'); ln('BIO.was', 'WAS.in');
    bioIn = 'BIO';
  } else if (tech === 'SBR' || tech === 'AGS') {
    const N = Math.round(v('N')), VT = v('VT'), VF = v('VF'), Tc = v('tF') + v('tR') + v('tS') + v('tD') + v('tI');
    const Xb = 1e6 / SVI;   // g/m³ bùn đáy
    const p = { N, Vmax: +VT.toFixed(0), Vmin: +(VT * (1 - VF)).toFixed(0), H: v('H'), feed: 'batch', tF: v('tF'), tFa: 0, tR: v('tR'), tS: v('tS'), tD: v('tD'), tI: v('tI'), DOsp: DO, SVI, TSSe: v('TSSe'), sm: tech === 'AGS' ? 'ideal' : 'layered', nLay: 15 };
    p.Vwas = +(v('PXTSS') * 1000 / Xb / (24 / Tc) / N).toFixed(2);
    p.wasMode = 'srt'; p.SRTw = +btSRTw(v, tech).toFixed(2);
    const ags = tech === 'AGS', Vbuf = ags ? v('Vbuf') || 0 : 0;
    if (Vbuf > 0) {
      // bể điều hòa của NEREDA: nạp theo mẻ từ bể đệm, lưu lượng bơm trung bình = Q
      add('EQ', 'eqtank', 'Bể điều hòa', 200, 230, { Vmax: +Vbuf.toFixed(0), Vmin: +(0.1 * Vbuf).toFixed(0), H: 5, Qset: Q });
      ln('INF.out', 'EQ.in'); ln('EQ.out', 'BIO.in');
    } else ln('INF.out', 'BIO.in');
    add('BIO', 'sbr', ags ? 'NEREDA® AGS' : 'SBR', 340, 230, p);
    add('EFF', 'effluent', 'Nước gạn (sau sinh học – cột ⑤)', 560, 200);
    ln('BIO.eff', 'EFF.in');
    if (ags) {
      // bùn dư bùn hạt đã đặc (≈ 12 kg/m³) → tách nước trực tiếp, nước tách quay về đầu bể
      // tách nước theo tỷ lệ lưu lượng bùn cố định (bùn dư bùn hạt ≈ WASc kg/m³ → bánh bùn cakeDS %); nước tách quay về (bộ giải ổn định "xé dòng")
      add('DW', 'dewater', 'Tách nước bùn dư', 600, 380, { kind: 'centrifuge', qm: 'ratio', rU: +(Math.max(v('WASc') || 12, 1) * 0.95 / ((v('cakeDS') || 20) * 10) * 100).toFixed(2), DS: +(v('cakeDS') || 20), capt: 95 });
      add('CAKE', 'sludge', 'Bánh bùn', 760, 420);
      ln('BIO.was', 'DW.in'); ln('DW.und', 'CAKE.in'); ln('DW.out', (Vbuf > 0 ? 'EQ' : 'BIO') + '.in');
      desc.push(`NEREDA® ${N} bể × ${p.Vmax} m³ (H ${v('H')} m), chu kỳ ${Tc.toFixed(2)} h: nạp kỵ khí ${(+v('tF')).toFixed(2)} h – sục khí ${(+v('tR')).toFixed(2)} h – lắng ${(+v('tS')).toFixed(2)} h; trao đổi thể tích ${(VF * 100).toFixed(0)} %; SVI ${SVI} mL/g. Nạp-xả đồng thời của NEREDA được xấp xỉ bằng SBR nạp theo mẻ (thể tích dao động V_min → V_max), mô hình ASM2dG bùn hạt; lắng tách lý tưởng với TSS nước ra ${v('TSSe')} mg/L (bùn hạt lắng nhanh – có thể chuyển sang mô hình lắng phân tầng ở bể, tính lâu hơn); bùn dư tách nước trực tiếp (tỷ lệ lưu lượng bùn cố định), nước tách quay về đầu bể. Giới hạn: nạp theo mẻ trộn với phần nước còn lại (chứa NO₃) – chưa thể hiện nạp đẩy kỵ khí qua lớp bùn hạt và xả chọn lọc bông nhẹ của NEREDA, nên khử nitrat đồng thời và khử P sinh học thường thấp hơn bản tính NEREDA; hiệu chỉnh bằng DO đặt, pha sục khí cuối nạp, tốc độ hạt hóa (tab Mô hình) hoặc so sánh ở bảng dưới.${Vbuf > 0 ? ` Bể điều hòa ${Vbuf.toFixed(0)} m³.` : ''}`);
    } else {
      add('WAS', 'sludge', 'Bùn dư', 560, 380); ln('BIO.was', 'WAS.in');
      desc.push(`SBR ${N} bể × ${p.Vmax} m³, chu kỳ ${Tc} h.`);
    }
    bioIn = 'BIO';
  } else {
    // dòng liên tục: [kỵ khí] → [thiếu khí] → hiếu khí (2 ngăn) → lắng/màng
    let Vkk = v('Vkk') || 0, Vtk = v('Vtk') || 0, Vhk = v('Vhk') || 0;
    if (tech === 'OD' && !(Vhk > 0) && v('Vtot') > 0) { Vhk = v('Vtot') * v('fAerOD'); Vtk = v('Vtot') - Vhk; }
    const H = v('H') || 5, R = v('R'), IR = v('IR');
    const isMBR = tech === 'MBR', isMB = ['MBBR', 'ORG', 'BIOP'].includes(tech);
    let x = 200, first = null, prev = null;
    const chainU = (id, type, name, p) => { add(id, type, name, x, 230, p); if (prev) ln(prev + '.out', id + '.in'); else first = id; prev = id; x += 140; };
    if (Vkk > 0) chainU('AN', 'cstr', 'Kỵ khí', { V: +Vkk.toFixed(0), H, aer: 'none' });
    if (Vtk > 0) chainU('AX', 'cstr', 'Thiếu khí', { V: +Vtk.toFixed(0), H, aer: 'none' });
    const aerType = isMB ? 'mbbr' : 'cstr';
    const aerP = Vh => isMB ? { V: +Vh.toFixed(0), H, aer: 'do', DOsp: DO, fill: v('fill'), SSA: v('SSA') } : { V: +Vh.toFixed(0), H, aer: 'do', DOsp: DO };
    chainU('OX1', aerType, 'Hiếu khí 1', aerP(Vhk / 2));
    chainU('OX2', aerType, 'Hiếu khí 2', aerP(Vhk / 2));
    ln('INF.out', first + '.in');
    const QWAS = v('PXTSS') * 1000 / v('XR');
    if (IR > 0 && Vtk > 0) { add('SPI', 'splitter', 'Tuần hoàn nội', x, 230, { mode: 'Q', Q: +(IR * Q).toFixed(0) }); ln(prev + '.out', 'SPI.in'); ln('SPI.a', 'AX.in'); prev = 'SPI'; x += 120; }
    const sep = prev === 'SPI' ? 'SPI.b' : prev + '.out';
    const ret = Vkk > 0 ? 'AN.in' : Vtk > 0 ? 'AX.in' : first + '.in';
    if (isMBR) {
      add('MB', 'mbr', 'Bể màng', x, 230, { V: +v('Vmem').toFixed(0), H, aer: 'do', DOsp: DO, Am: +v('Am').toFixed(0), SADm: v('SADm'), uMode: 'rQ', uK: R });
      ln(sep, 'MB.in'); add('EFF', 'effluent', 'Nước thấm (sau sinh học – cột ⑤)', x + 160, 200);
      add('SPW', 'splitter', 'Xả bùn', x, 400, { mode: 'Q', Q: +QWAS.toFixed(1) }); add('WAS', 'sludge', 'Bùn dư', x + 160, 420);
      ln('MB.eff', 'EFF.in'); ln('MB.und', 'SPW.in'); ln('SPW.a', 'WAS.in'); ln('SPW.b', ret);
    } else if (tech === 'MBBR' || tech === 'BIOP') {
      add('CL', 'clarifier', 'Bể lắng', x, 230, { A: +(v('Acl') || Q / 24 / 0.8).toFixed(0), H: v('Hcl') || 4, nL: 10, feed: 5, uMode: 'Q', uQ: +Math.max(QWAS, Q * 0.005).toFixed(0), rh: btRh(SVI) });
      ln(sep, 'CL.in'); add('EFF', 'effluent', 'Nước ra (sau sinh học – cột ⑤)', x + 160, 200); add('WAS', 'sludge', 'Bùn dư', x + 160, 400);
      ln('CL.eff', 'EFF.in'); ln('CL.und', 'WAS.in');
    } else {
      const A = v('Acl');
      add('CL', 'clarifier', 'Lắng thứ cấp', x, 230, { A: +(A > 0 ? A : Q / 24 / 0.7).toFixed(0), H: v('Hcl') || 4, nL: 10, feed: 5, uMode: 'Q', uQ: +((R * Q) + QWAS).toFixed(0), rh: btRh(SVI) });
      ln(sep, 'CL.in'); add('EFF', 'effluent', 'Nước ra (sau sinh học – cột ⑤)', x + 160, 200);
      add('SPW', 'splitter', 'RAS/WAS', x, 400, { mode: 'Q', Q: +QWAS.toFixed(1) }); add('WAS', 'sludge', 'Bùn dư', x + 160, 420);
      ln('CL.eff', 'EFF.in'); ln('CL.und', 'SPW.in'); ln('SPW.a', 'WAS.in'); ln('SPW.b', ret);
    }
    bioIn = Vkk > 0 ? 'AN' : Vtk > 0 ? 'AX' : 'OX1';
    desc.push(`${D.techName}: kỵ khí ${Vkk.toFixed(0)} m³, thiếu khí ${Vtk.toFixed(0)} m³, hiếu khí ${Vhk.toFixed(0)} m³ (chia 2 ngăn); R = ${(+R).toFixed(2)}, IR = ${(+IR).toFixed(2)}; xả bùn ${QWAS.toFixed(0)} m³/d (= P_X,TSS/X_R).`);
    if (['ORG', 'BIOP'].includes(tech)) desc.push('Giá thể cố định Organica/Biopolus được xấp xỉ bằng bể giá thể MBBR/IFAS – cần hiệu chỉnh mật độ màng.');
  }
  // trạm máy thổi khí (theo sheet ThietBi / 06_SH)
  if (v('Qbl') > 0) {
    const zones = U.filter(u => ['iceas', 'ctech', 'sbr'].includes(u[1]) || (['cstr', 'mbbr', 'mbr'].includes(u[1]) && u[5].aer && u[5].aer !== 'none')).map(u => u[0]);
    const nTot = Math.round(v('nBl')) || (tech === 'ICEAS' || tech === 'CTECH' ? Math.round(v('N')) + 1 : 3), nSt = Math.round(v('nBlS')) || 0;
    add('BL', 'blower', 'Trạm máy thổi khí', 500, 80, { kind: 'turbo', arr: v('arrBl') > 0.5 ? 'dedicated' : 'pool', nDuty: Math.max(nTot - nSt, 1), nStby: nSt, Qr: Math.round(v('Qbl')), Pr: Math.ceil((v('Pbl') + 10) / 5) * 5, tdn: 45, Qaux: Math.round(v('Qaux') || 0),
      etaMax: Math.round(v('eBlow') * 95), vfd: 'yes', ctl: 'mov', dPpipe: v('dPloss'), doMode: 'zone', DOsp: DO, zones });
    desc.push(`Trạm máy thổi ${Math.max(nTot - nSt, 1)} làm việc + ${nSt} dự phòng × ${Math.round(v('Qbl'))} m³/h (khí chuẩn), ${(+v('Pbl')).toFixed(1)} kPa, ${v('arrBl') > 0.5 ? 'mỗi bể một máy' : 'đường ống chung'} (bản tính); DO điều khiển bằng lưu lượng khí, áp suất trượt MOV.`);
  }
  // hóa chất
  let yd = 90;
  const aerUnit = U.find(u => ['iceas', 'ctech', 'sbr'].includes(u[1])) ? 'BIO' : (U.find(u => u[0] === 'OX2') ? 'OX2' : bioIn);
  if (v('Fe') > 0) { add('FECL', 'dose', 'FeCl₃ (khử P đồng thời)', 420, yd, { kind: 'metal', metal: 'Fe', mass: +(+v('Fe')).toPrecision(4), Q: 2 }); ln('FECL.out', aerUnit + '.in'); desc.push(`Châm FeCl₃ ${(+v('Fe')).toFixed(0)} kg Fe/d.`); }
  if (v('Al') > 0) { add('PAC', 'dose', 'PAC (khử P đồng thời)', 330, yd, { kind: 'metal', metal: 'Al', mass: +(+v('Al')).toPrecision(4), Q: 2 }); ln('PAC.out', aerUnit + '.in'); desc.push(`Châm PAC ${(+v('Al')).toFixed(0)} kg Al/d.`); }
  if (v('NaOH') > 0) { add('NAOH', 'dose', 'NaOH bổ sung kiềm', 200, yd, { kind: 'alk', mass: +(v('NaOH') / 0.8).toPrecision(4), Q: 1 }); ln('NAOH.out', bioIn + '.in'); }
  if (v('Cext') > 0) { add('CEXT', 'dose', 'Carbon ngoài', 260, yd + 40, { kind: 'carbon', mass: +(+v('Cext')).toPrecision(4), Q: 1 }); ln('CEXT.out', (U.find(u => u[0] === 'AX') ? 'AX' : bioIn) + '.in'); }
  if (D.anaer && D.scope !== 'full') btAnaer(D, v, U, Lk, add, desc, inf, 'bio');
  if (D.scope === 'full') btFullLine(D, v, U, Lk, add, ln, desc, tech, inf);
  else desc.push('Không mô phỏng: song chắn/lưới rác, lắng cát, khử trùng, xử lý bùn – nước vào lấy ở cột ④ (đã gồm tải nước tách bùn). Chọn "Toàn dây chuyền" ở tab Bản tính để dựng cả tiền xử lý, hóa lý, lọc, khử trùng và xử lý bùn.');
  // nước thải công nghiệp COD cao (có xử lý yếm khí): hàm lượng N, P của chất hữu cơ (iN, iP của SF, XS) hạ theo TKN, TP nước thải
  const npAdj = D.anaer ? btNP(inf, D.model || 'ASM2d', desc) : null;
  const P = _mk({
    name: 'Từ bản tính: ' + (D.title || D.file), desc: desc.join(' '), model: D.model || 'ASM2d', plant, params: npAdj ? { [D.model || 'ASM2d']: npAdj } : undefined,
    units: U, links: Lk.map(([a, b]) => [a, b]),
    sim: ['ICEAS', 'CTECH', 'SBR', 'AGS'].includes(tech) ? { days: 2, dtOut: 1 / 288 } : { days: 7 }
  });
  P.design = D;
  return P;
};

/* ---------------------------------------------------------------- so sánh */
BT.compare = function (D, sys, det) {
  const S = plantSummary(sys, det), m = sys.m;
  const eff = (D.effUnit && S.sinks.find(s => s.cu.id === D.effUnit)) || S.sinks.find(s => s.cu.type === 'effluent');
  const reac = S.reactors;
  const vDes = id => BT.val(D, id);
  const rows = [];
  for (const t of D.targets) {
    if (t.only && t.only !== m.fam) continue;
    let des = +t.v, des2 = t.v2 != null ? +t.v2 : null, mod = NaN;
    if (t.perB) { des *= vDes(t.perB); }
    if (t.conv === 'icAir') des = des * (vDes('tAer') / (vDes('tAer') + vDes('tMix') + vDes('tS') + vDes('tD'))) * 24 * vDes('N');
    else if (t.conv === 'h2d') des = des * 24;
    if (t.m === 'eff' && eff) mod = eff.c[t.k];
    else if (t.m === 'unit') { const r = reac.find(x => x.cu.id === t.unit); mod = r ? r.c[t.k] : NaN; }   // chỉ tiêu trong một bể (đối chiếu mô hình khác)
    else if (t.k === 'SRT') mod = S.SRT;
    else if (t.k === 'SRTcl') mod = S.SRTcl;                                                              // SRT kể cả bùn bể lắng
    else if (t.k === 'MLSS' || t.k === 'MLVSS') {
      const aer = reac.filter(r => r.aerated && !(r.cu.type === 'mbr'));
      const vol = aer.reduce((a, r) => a + r.info.V, 0);
      mod = vol > 0 ? aer.reduce((a, r) => a + (t.k === 'MLSS' ? r.c.TSS : r.c.VSS) * r.info.V, 0) / vol : NaN;
    }
    else if (t.k === 'WAS') mod = S.WAS;
    else if (t.k === 'OTR') mod = S.OTR;
    else if (t.k === 'air') mod = S.air;
    else if (t.k === 'Eblow') mod = S.Pblow * 24;
    else if (t.k === 'HRT') mod = S.HRT;
    const d = mod - des, dr = des !== 0 ? d / Math.abs(des) : NaN;
    let st;
    if (des2 != null) { const lo = Math.min(des, des2), hi = Math.max(des, des2); st = mod >= lo * 0.95 && mod <= hi * 1.05 ? 'ok' : (mod >= lo * 0.8 && mod <= hi * 1.2 ? 'near' : 'off'); }
    else if (t.tol != null) st = Math.abs(d) <= Math.max(t.tol, 0.1 * Math.abs(des)) ? 'ok' : Math.abs(d) <= 2 * Math.max(t.tol, 0.15 * Math.abs(des)) ? 'near' : 'off';
    else st = Math.abs(dr) <= t.rel ? 'ok' : Math.abs(dr) <= 2 * t.rel ? 'near' : 'off';
    if (t.refOnly) st = 'ref';
    rows.push({ k: t.k, l: t.l, u: t.u, des, des2, mod, d, dr, st, ref: t.ref, note: t.note || '', lim: t.lim, limOk: t.lim != null && isFinite(mod) ? mod <= t.lim : null });
  }
  // gợi ý hiệu chỉnh
  const sug = [];
  const srt = rows.find(r => r.k === 'SRT');
  if (srt && isFinite(srt.mod) && isFinite(srt.des) && Math.abs(srt.dr) > 0.08) sug.push({ k: 'srt', txt: `SRT mô hình ${fmt(srt.mod)} d khác thiết kế ${fmt(srt.des)} d → điều chỉnh lượng bùn xả theo tỷ lệ ${fmt(srt.mod / srt.des)}.`, f: srt.mod / srt.des });
  const nh = rows.find(r => r.k === 'NH4');
  if (nh && nh.st === 'off' && nh.mod > nh.des) sug.push({ k: 'txt', txt: 'NH₄ ra cao hơn thiết kế: kiểm tra thời gian sục khí/SRT hiếu khí, DO đặt và nhiệt độ mô phỏng (bản tính dùng T thấp nhất cho nitrat hóa).' });
  const no = rows.find(r => r.k === 'NOx');
  if (no && no.st === 'off' && no.mod > no.des) sug.push({ k: 'txt', txt: 'NO₃ ra cao hơn: năng lực khử nitrat của mô hình động (theo động học ASM) thấp hơn cách tính SDNR của bản tính – thử tăng pha không sục khí / tuần hoàn nội hoặc rbCOD.' });
  const ts = rows.find(r => r.k === 'TSS');
  if (ts && ts.st === 'off' && ts.mod > ts.des) sug.push({ k: 'txt', txt: `TSS ra mô hình ${fmt(ts.mod)} mg/L > thiết kế ${fmt(ts.des)} mg/L: bản tính giả định TSS_e cố định, mô hình tính lắng phân tầng theo SVI – kiểm tra SVI, thời gian lắng/gạn, khoảng cách lớp bùn – mặt nước; TSS ra cao cũng làm tăng thất thoát bùn và giảm SRT.` });
  const tp = rows.find(r => r.k === 'TP');
  if (tp && tp.st === 'off' && tp.mod > tp.des) sug.push({ k: 'txt', txt: 'TP ra cao hơn: tăng liều PAC hoặc kiểm tra PO₄/TP của nước vào.' });
  return { rows, sug, S };
};

/* tuổi bùn tính theo bùn xả (không kể bùn theo nước ra) tương đương SRT thiết kế */
/* ---------------------------------------------------------------- toàn dây chuyền
   Nước thô (cột ①) → song chắn → [lưới tinh] → [lắng cát] → [điều hòa] → [hóa lý CEPT] → sinh học → [hóa lý bậc 3] → [lọc] → khử trùng → nước ra;
   bùn dư (+ bùn hóa lý) → [nén] → tách nước → bánh bùn; nước tách quay về sau lắng cát. Lựa chọn theo TONG_QUAN của bản tính (D.chain),
   không có thì theo cấu hình thông dụng (song chắn tinh + lắng cát thổi khí + NaOCl + nén + ly tâm). */
function btFullLine(D, v, U, Lk, add, ln, desc, tech, inf) {
  const ch = n => { const c = (D.chain || []).find(x => x.n === n); return c ? c.c : null; };
  const no = t => t != null && /^Không/i.test(t);
  const Q = v('Q'), cyc = ['ICEAS', 'CTECH', 'SBR', 'AGS'].includes(tech);
  const inL = Lk.find(l => l[0] === 'INF.out'); if (!inL) return;
  // hồ sơ Thiết kế XLNT: chất keo tụ, xử lý bậc 3 – oxy hóa, dây chuyền bùn (ổn định, làm khô)
  const T3 = D.tert || {}, SL = D.sl || {};
  const cg = ['pac', 'alum', 'fecl3', 'fecl2'].includes(T3.coag) ? T3.coag : 'pac', cgK = n => cg === 'fecl2' ? 'fecl2' : cg;
  const target = inL[1];
  // nước thô: thay cột ④ bằng cột ① (giữ phân đoạn; COD hòa tan trơ giữ nguyên nồng độ)
  const raw = k => v(k + '0') > 0 ? v(k + '0') : null;
  if (D.anaer && D.anaer.raw && !D.anaer.ops) btRefrac(inf, D.anaer.raw, v, D.anaer.frac, D);
  // số liệu vận hành có yếm khí cấp 1 (nước thải công nghiệp): phân đoạn COD nước thô theo tỷ lệ đặc trưng như phạm vi "sinh học"
  else if (D.anaer && D.anaer.ops) btRefrac(inf, { COD: raw('COD') || inf.COD, BOD: raw('BOD') || v('BOD'), TSS: raw('TSS') || inf.TSS, TKN: raw('TKN') || inf.TKN, NH4: raw('NH4') || inf.fNH4 * inf.TKN, TP: raw('TP') || inf.TP, Alk: inf.Alk }, v, D.anaer.frac, D);
  else if (raw('COD')) {
    const COD0 = raw('COD'), SI = inf.fSI * inf.COD, rb = inf.fSB * inf.COD, sb = (raw('BOD') && v('BOD') > 0 ? raw('BOD') / v('BOD') : COD0 / inf.COD);
    const bCOD0 = Math.min(v('bCOD') * sb, COD0 - SI);
    Object.assign(inf, { COD: COD0, fSI: +(SI / COD0).toFixed(4), fSB: +(Math.min(rb, bCOD0) / COD0).toFixed(4), fXI: +Math.max((COD0 - bCOD0 - SI) / COD0, 0).toFixed(4) });
  }
  const anaRaw = !!(D.anaer && D.anaer.raw && !D.anaer.ops);
  if (raw('TSS') && !anaRaw) inf.TSS = raw('TSS');
  if (raw('TKN') && !anaRaw) { inf.TKN = raw('TKN'); inf.fNH4 = +Math.min((raw('NH4') || v('NH4')) / inf.TKN, 0.95).toFixed(4); }
  if (raw('TP') && !anaRaw) inf.TP = raw('TP');
  const infU = U.find(u => u[0] === 'INF'); if (infU) { infU[2] = 'Nước thải thô (cột ①)'; infU[5].inf = inf; }
  // dời các đơn vị sinh học sang phải nhường chỗ cho tiền xử lý
  for (const u of U) if (u[0] !== 'INF') u[3] += 380 + (D.anaer ? 130 : 0);
  let prev = 'INF.out', x = 150;
  const step = (id, type, name, p, dx) => { add(id, type, name, x, 230, p); Lk.push([prev, id + '.in']); prev = id + '.out'; x += dx || 95; };
  Lk.splice(Lk.indexOf(inL), 1);
  const sc = ch('Song chắn rác thô'), fi = ch('Lưới lọc rác tinh'), gr = ch('Lắng cát – tách dầu'), eq = ch('Bể điều hòa'), cp = ch('Hóa lý');
  step('SCR', 'screen', 'Song chắn rác thô', { kind: 'coarse', cap: 3, DS: 20, kW: /thủ công/i.test(sc || '') ? 0 : 1.5 }, 80);
  if (!no(fi)) step('FSC', 'screen', /trống/i.test(fi || '') ? 'Lưới trống quay' : 'Lưới lọc rác tinh', { kind: tech === 'MBR' ? 'micro' : 'fine', cap: tech === 'MBR' ? 15 : 8, DS: 25, kW: 3 }, 80);
  if (!no(gr)) step('GR', 'grit', 'Lắng cát', { kind: /thổi khí/i.test(gr || 'thổi khí') ? 'aerated' : 'vortex', eISS: 45, eOrg: 2, DS: 60, air: /thổi khí/i.test(gr || 'thổi khí') ? Math.round(Q / 24 * 0.25) : 0, kW: 2 }, 80);
  const rejTo = []; let sludgeIn = [];
  const hasEQ = eq ? (/^Có/i.test(eq) || (/Tự động/i.test(eq) && !cyc)) : !cyc;
  if (hasEQ) { const Ve = v('Veq') > 0 ? v('Veq') : Q * 6 / 24; step('EQ', 'eqtank', 'Bể điều hòa', { Vmax: Math.round(Ve), Vmin: Math.round(Ve * 0.1), H: v('Heq') || 5, qmode: 'auto', kQ: 1.04, lv0: 50, Qset: Q, aer: 'none' }); rejTo.push('EQ.in'); }
  if (cp && /Trước/i.test(cp)) {
    const sep = /lamella/i.test(D.chain.map(c => c.c).join(' ')) ? 'lamella' : /DAF|tuyển nổi/i.test(D.chain.map(c => c.c).join(' ')) ? 'daf' : 'settle';
    if (v('NaOH1') > 0) { add('NAOH1', 'dose', 'NaOH chỉnh pH (hóa lý)', x, 110, { kind: 'alk', mass: +(v('NaOH1') / 0.8).toFixed(1), Q: 1 }); Lk.push(['NAOH1.out', 'CEPT.in']); }
    step('CEPT', 'chem', 'Keo tụ – lắng hóa lý (CEPT)', { sep, coag: cgK(), dose: +(+v('PAC1')).toFixed(1), poly: +(+v('poly1')).toFixed(2), R0: 50, Rmax: 85, sRem: 10, DS: 1.5, kW: 8 });
    Lk.push(['CEPT.und', 'TH.in']); sludgeIn.push('CEPT');
  }
  let anaU = null;
  if (D.anaer) { const r = btAnaerUnit(D, v, Q); step('ANR', 'anr', r.name, r.p, 110); anaU = r; btAnaerDesc(D, r, desc); if (r.alk > 0) { add('NAHCO3', 'dose', 'NaHCO₃ bổ sung kiềm (yếm khí)', x - 110, 110, { kind: 'alk', mass: r.alk, Q: 1 }); Lk.push(['NAHCO3.out', 'ANR.in']); } }
  if (!rejTo.length) rejTo.push(target);
  Lk.push([prev, target]);
  // phía sau sinh học
  const effL = Lk.find(l => l[1] === 'EFF.in'), effU = U.find(u => u[0] === 'EFF');
  if (effL && effU) {
    let ex = effU[3]; prev = effL[0]; Lk.splice(Lk.indexOf(effL), 1);
    const post = (id, type, name, p) => { add(id, type, name, ex, 200, p); Lk.push([prev, id + '.in']); prev = id + '.out'; ex += 110; };
    if (cp && /Sau/i.test(cp)) { post('CHT', 'chem', 'Hóa lý bậc 3 (khử P)', { sep: 'lamella', coag: cgK(), dose: +(+v('PAC3')).toFixed(1), poly: +(+v('poly3')).toFixed(2), R0: 60, Rmax: 92, sRem: 10, DS: 1, kW: 5 }); Lk.push(['CHT.und', 'TH.in']); sludgeIn.push('CHT'); if (v('NaOH3') > 0) { add('NAOH3', 'dose', 'NaOH chỉnh pH (bậc 3)', ex - 110, 110, { kind: 'alk', mass: +(v('NaOH3') / 0.8).toFixed(1), Q: 1 }); Lk.push(['NAOH3.out', 'CHT.in']); } }
    if (T3.aop && T3.aop !== 'none') {
      // xử lý bậc 3 – oxy hóa: liều theo bản tính; ClO₂ quy về clo hoạt tính tương đương (2,63 g Cl₂/g ClO₂)
      const kind = T3.aop === 'clo2' ? 'naocl' : T3.aop, pa = { kind, V: Math.max(Math.round(+T3.V || Q / 1440 * (+T3.t || 30)), 5) };
      if (T3.aop === 'fenton') Object.assign(pa, { H2O2: +(+T3.H2O2 || 300).toFixed(1), Fe: +(+T3.Fe || 60).toFixed(1), pH: 3 });
      if (T3.aop === 'o3' || T3.aop === 'o3h2o2') Object.assign(pa, { O3: +(+T3.O3 || 30).toFixed(1) });
      if (T3.aop === 'o3h2o2') pa.H2O2 = +(0.4 * (+T3.O3 || 30)).toFixed(1);
      if (T3.aop === 'uvh2o2') Object.assign(pa, { H2O2: +(+T3.H2O2 || 25).toFixed(1), UVd: 400 });
      if (T3.aop === 'clo2') pa.Cl2 = +(2.63 * (+T3.ClO2 || 5)).toFixed(2);
      post('AOPX', 'aop', { fenton: 'Fenton bậc 3', o3: 'Ozone bậc 3', o3h2o2: 'O₃/H₂O₂ bậc 3', uvh2o2: 'UV/H₂O₂ bậc 3', clo2: 'ClO₂ (quy clo tương đương)' }[T3.aop] || 'Oxy hóa bậc 3', pa);
      desc.push(`Xử lý bậc 3 – oxy hóa ${T3.aop} theo bản tính (hiệu suất khử COD thiết kế ${(+T3.E || 0).toFixed(0)} %; SimXLNT tính theo động học chất oxy hóa – so sánh ở bảng kết quả).`);
      // Fenton: trung hòa – keo tụ – lắng bùn sắt Fe(OH)₃ (như bản tính) trước lọc / khử trùng; bùn về dây chuyền xử lý bùn
      if (T3.aop === 'fenton') { add('FSL', 'psep', 'Lắng bùn sắt (sau Fenton)', ex, 200, { rem: 95, uMode: 'ratio', uR: 0.01 }); Lk.push([prev, 'FSL.in']); prev = 'FSL.ovf'; ex += 110; Lk.push(['FSL.und', 'TH.in']); sludgeIn.push('FSL'); }
    }
    const ft = ch('Lọc bậc 3');
    if (ft && !no(ft)) { post('FI', 'filter', ft.replace(/\s*\(.*\)$/, ''), { kind: /cát/i.test(ft) ? 'sand' : 'disc', cap: /cát/i.test(ft) ? 70 : 80, bw: /cát/i.test(ft) ? 3 : 2, sRem: 40, rej: 97, kWh: 0.02 }); rejTo.length && Lk.push(['FI.und', rejTo[0]]); }
    const ds = ch('Khử trùng') || 'NaOCl';
    if (!no(ds)) post('DIS', 'aop', /UV/i.test(ds) ? 'Khử trùng UV' : 'Khử trùng NaOCl', /UV/i.test(ds) ? { kind: 'uv', V: Math.max(Math.round(Q / 1440 * 2), 5), UVd: +v('UVd') || 40, kWh: 0.015 } : { kind: 'naocl', V: Math.round(Q / 1440 * (v('tCl') || 30)), Cl2: +(+v('Cl2')).toFixed(2), eta: 60, k: 0.05, kWh: 0.003 });
    effU[3] = ex; Lk.push([prev, 'EFF.in']);
  }
  // xử lý bùn: bùn dư sinh học (+ bùn hóa lý) → [nén] → tách nước; nước tách về đầu dây chuyền (sau lắng cát)
  const wasL = Lk.find(l => l[1] === 'WAS.in'), wasU = U.find(u => u[0] === 'WAS');
  const th = ch('Nén bùn'), dw = ch('Khử nước bùn') || 'ly tâm';
  const dwKind = D.sl && D.sl.dew ? ({ belt: 'belt', screw: 'screw', centrifuge: 'centrifuge', press: 'press', beds: 'press' }[D.sl.dew] || 'centrifuge') : /trục vít/i.test(dw) ? 'screw' : /băng/i.test(dw) ? 'belt' : /khung bản/i.test(dw) ? 'press' : 'centrifuge';
  let wy = 430, wx = 560;
  if (wasL && wasU) {
    Lk.splice(Lk.indexOf(wasL), 1); U.splice(U.indexOf(wasU), 1);
    const thK = SL.thick ? ({ gravity: 'gravity', gbt: 'belt', daf: 'daf', centrifuge: 'centrifuge', drum: 'drum' }[SL.thick] || 'gravity') : /băng|GBT/i.test(th || '') ? 'belt' : 'gravity', dsTh = +SL.thC > 0 ? +SL.thC : { gravity: 4, belt: 6, daf: 4, centrifuge: 6, drum: 6 }[thK];
    // sau bể chu kỳ (bùn xả theo mẻ): lưu lượng bùn đặc theo tỷ lệ cố định (ước tính từ MLSS) – tránh ghép Jacobian đặc với cụm bể
    const Xw = (v('MLSS') || v('MLSSd') || 4000) / 1e4, rq = (cap, ds) => cyc ? { qm: 'ratio', rU: +(Xw * cap / 100 / ds * 100).toFixed(2) } : {};
    add('TH', 'thicken', { gravity: 'Bể nén bùn', belt: 'Cô đặc băng tải', daf: 'Cô đặc DAF', centrifuge: 'Ly tâm cô đặc', drum: 'Cô đặc trống quay' }[thK], wx, wy, Object.assign({ kind: thK, capt: thK === 'gravity' ? 90 : 95, DS: dsTh, poly: thK === 'gravity' ? 0 : 4, kWh: { gravity: 1, belt: 15, daf: 60, centrifuge: 40, drum: 10 }[thK] }, rq(thK === 'gravity' ? 90 : 95, dsTh)));
    Lk.push([wasL[0], 'TH.in']);
    add('DW', 'dewater', 'Tách nước bùn', wx + 150, wy, { qm: cyc ? 'ratio' : 'ds', rU: +(dsTh * 0.95 / ({ centrifuge: 22, belt: 18, screw: 18, press: 30 }[dwKind]) * 100).toFixed(2), kind: dwKind, capt: { centrifuge: 95, belt: 93, screw: 95, press: 98 }[dwKind], DS: { centrifuge: 22, belt: 18, screw: 18, press: 30 }[dwKind], poly: { centrifuge: 8, belt: 5, screw: 6, press: 2 }[dwKind], kWh: { centrifuge: 70, belt: 15, screw: 10, press: 30 }[dwKind] });
    // ổn định bùn (bể phân hủy kỵ khí ADM1 / phân hủy hiếu khí) giữa cô đặc và khử nước; làm khô sau khử nước
    let toDW = 'TH.und', toCake = 'DW.und';
    if (SL.stab === 'mad' || SL.stab === 'tad') { const Vd = Math.max(Math.round(+SL.stabV || 0), 100); add('DIG', 'digester', SL.stab === 'tad' ? 'Phân hủy kỵ khí 55 °C' : 'Phân hủy kỵ khí 35 °C', wx + 75, wy + 110, { V: Vd, Vgas: Math.round(Vd * 0.1), T: SL.stab === 'tad' ? 55 : 35 }); Lk.push(['TH.und', 'DIG.in']); toDW = 'DIG.out'; desc.push(`Ổn định bùn: bể phân hủy kỵ khí ${Vd} m³ (ADM1).`); }
    else if (SL.stab === 'aed') { const Vd = Math.max(Math.round(+SL.stabV || 0), 50); add('AED', 'aerdig', 'Phân hủy bùn hiếu khí', wx + 75, wy + 110, { V: Vd, H: 5, aer: 'do', DOsp: 1.5 }); Lk.push(['TH.und', 'AED.in']); toDW = 'AED.out'; }
    else if (SL.stab === 'lime') desc.push('Ổn định vôi của bản tính không mô phỏng (chỉ ảnh hưởng khối lượng bùn).');
    if (SL.dry && SL.dry !== 'none') { add('DRY', 'dryer', SL.dry === 'solar' ? 'Sấy mặt trời' : 'Sấy nhiệt', wx + 225, wy + 110, { DS: SL.dry === 'solar' ? 75 : 90 }); add('VAP', 'sludge', 'Hơi nước bay hơi', wx + 330, wy + 140); Lk.push(['DW.und', 'DRY.in'], ['DRY.out', 'VAP.in']); toCake = 'DRY.und'; }
    add('CAKE', 'sludge', SL.dry && SL.dry !== 'none' ? 'Bùn khô' : 'Bánh bùn', wx + 300, wy + 30);
    Lk.push([toDW, 'DW.in'], [toCake, 'CAKE.in'], ['TH.out', rejTo[0]], ['DW.out', rejTo[0]]);
  } else if (U.find(u => u[0] === 'DW') && sludgeIn.length) {
    // AGS: bùn dư đã đặc – bùn hóa lý cũng đưa vào thiết bị tách nước
    for (let i = Lk.length - 1; i >= 0; i--) if (Lk[i][1] === 'TH.in') Lk[i][1] = 'DW.in';
  }
  // bùn dư yếm khí (bùn hạt/bùn kỵ khí đặc, ít phân hủy tiếp): điểm xả riêng – không qua cô đặc/tách nước chung. N hữu cơ của sinh khối
  // kỵ khí vượt hàm lượng N cố định của chất hạt ASM2d → tại giao diện ADM1→ASM thành NH₄ hòa tan; cho qua cô đặc thì nước tách
  // mang NH₄ "ảo" hàng nghìn mg/L về đầu trạm (thực tế ≈ NH₄ trong bể kỵ khí)
  if (anaU) { add('WANA', 'sludge', 'Bùn dư yếm khí (xử lý riêng / bùn mồi)', U.find(u => u[0] === 'ANR')[3], 400); Lk.push(['ANR.und', 'WANA.in']); desc.push('Bùn dư yếm khí đưa ra điểm xả riêng (không qua cô đặc chung) để nước tách không mang NH₄ của N hữu cơ sinh khối kỵ khí – khối lượng bùn dư yếm khí xem tại điểm xả này.'); }
  if (!U.find(u => u[0] === 'TH')) for (let i = Lk.length - 1; i >= 0; i--) if (Lk[i][1] === 'TH.in') Lk.splice(i, 1);
  // song chắn & lắng cát: rác / cát ra bãi thải
  let sy = 120; for (const id of ['SCR', 'FSC', 'GR']) if (U.find(u => u[0] === id)) { add(id + 'W', 'sludge', id === 'GR' ? 'Cát' : 'Rác', U.find(u => u[0] === id)[3], sy + 260); Lk.push([id + '.und', id + 'W.in']); }
  desc.push(`Toàn dây chuyền: nước thải thô${v('COD0') > 0 ? ' (cột ①)' : ' (không có cột ① – dùng cột ④)'} → ${U.filter(u => ['screen', 'grit', 'eqtank', 'chem'].includes(u[1]) && !/CHT/.test(u[0])).map(u => u[2]).join(' → ')} → sinh học${U.find(u => u[0] === 'CHT') ? ' → hóa lý bậc 3' : ''}${U.find(u => u[0] === 'FI') ? ' → lọc' : ''}${U.find(u => u[0] === 'DIS') ? ' → ' + U.find(u => u[0] === 'DIS')[2] : ''}; bùn: ${U.find(u => u[0] === 'TH') ? U.find(u => u[0] === 'TH')[2] + ' → ' : ''}${U.find(u => u[0] === 'DW') ? 'tách nước' : ''}, nước tách quay về ${rejTo[0].replace('.in', '')}. Liều PAC/polymer/NaOH hóa lý, liều clo – thời gian tiếp xúc và thể tích bể điều hòa lấy theo bản tính (không có thì giá trị điển hình); carbon ngoài, kiềm và PAC khử P đồng thời châm theo bản tính${v('Cext') > 0 ? ` (carbon ${(+v('Cext')).toFixed(0)} kg COD/d)` : ''}.`);
}
/* ---------------------------------------------------------------- xử lý yếm khí cấp 1 (Thiết kế XLNT mục YK)
   Bể kỵ khí tốc độ cao (ADM1, lưu giữ bùn – SRT ≫ HRT) trước cụm sinh học. Nước vào bể lấy theo cột ③ của bản tính,
   phân đoạn COD theo tỷ lệ đặc trưng nước thải (sCOD/COD, bCOD/BOD); NaHCO₃ châm vào bể theo bản tính. */
function btNP(inf, model, desc) {
  const M = typeof MODELS !== 'undefined' && MODELS[model]; if (!M || M.fam !== 'ASM2d') return null;
  const p = M.defaults, COD = +inf.COD, SI = inf.fSI * COD, RB = inf.fSB * COD, SA = (inf.fSA || 0) * RB, XI = inf.fXI * COD, bm = (inf.fXH || 0) * COD;
  const XS = Math.max(COD - SI - RB - XI - bm, 0), SF = RB - SA, NH = inf.fNH4 * inf.TKN, PO = inf.fPO4 * inf.TP;
  const out = {};
  const nFix = p.iNSI * SI + p.iNXI * XI + p.iNBM * bm, nVar = p.iNSF * SF + p.iNXS * XS;
  if (nVar > 0 && NH + nFix + nVar > 1.05 * inf.TKN) { const f = Math.min(Math.max((inf.TKN - NH - nFix) / nVar, 0.1), 1); out.iNSF = +(p.iNSF * f).toFixed(4); out.iNXS = +(p.iNXS * f).toFixed(4); }
  const pFix = p.iPSI * SI + p.iPXI * XI + p.iPBM * bm, pVar = p.iPSF * SF + p.iPXS * XS;
  if (pVar > 0 && PO + pFix + pVar > 1.05 * inf.TP) { const f = Math.min(Math.max((inf.TP - PO - pFix) / pVar, 0.1), 1); out.iPSF = +(p.iPSF * f).toFixed(4); out.iPXS = +(p.iPXS * f).toFixed(4); }
  if (!Object.keys(out).length) return null;
  desc.push(`Nước thải COD cao, N/P thấp: hạ hàm lượng N, P của chất hữu cơ dễ/chậm phân hủy (${Object.entries(out).map(([k, x]) => k + ' = ' + x).join(', ')}) để TKN, TP đầu vào mô hình khớp số liệu (tab Mô hình).`);
  return out;
}
function btRefrac(inf, s, v, fr, D) {
  fr = fr || {};
  // phân đoạn COD người dùng đã nhập tay ở tab Bản tính: giữ nguyên (chỉ cập nhật COD, TSS, N, P, độ kiềm của nước thô)
  const manFr = D && D.params && D.params.some(q => q.src === 'user' && ['bCOD', 'rbCOD', 'nbsCOD', 'fXH', 'fSA'].includes(q.id));
  // COD hòa tan trơ: nbsCOD = sCOD − (bCOD/BOD)·sBOD (cách tính của Thiết kế XLNT); thiếu tỷ lệ → giữ nồng độ SI của cột ④
  const COD = +s.COD, SI = Math.min(fr.scod > 0 && fr.sbodBod > 0 && +s.BOD > 0 ? Math.max(fr.scod * COD - (+fr.bcodBod || 1.6) * fr.sbodBod * s.BOD, 0.02 * COD) : inf.fSI * inf.COD, 0.5 * COD), bCOD = Math.min((+fr.bcodBod || 1.6) * (+s.BOD || COD / 2), COD - SI);
  const sCOD = (+fr.scod || 0.5) * COD, SB = Math.min(Math.max(sCOD - SI, 0), bCOD);
  if (manFr) inf.COD = COD;
  else Object.assign(inf, { COD, fSI: +(SI / COD).toFixed(4), fSB: +(SB / COD).toFixed(4), fXI: +Math.max((COD - bCOD - SI) / COD, 0).toFixed(4), fXH: Math.min(inf.fXH || 0.02, 0.05) });
  if (+s.TSS > 0) inf.TSS = +s.TSS;
  if (+s.TKN > 0) { inf.TKN = +s.TKN; inf.fNH4 = +Math.min((+s.NH4 || inf.fNH4 * s.TKN) / s.TKN, 0.95).toFixed(4); }
  if (+s.TP > 0) inf.TP = +s.TP;
  if (+s.Alk > 0) inf.Alk = +s.Alk;
}
function btAnaerUnit(D, v, Q) {
  const a = D.anaer, V = +a.V, sl = Math.max(+a.Mw || 0, 0), se = Q * Math.max(+a.TSSe || 0, 0) / 1000;
  const SRT = Math.max(+a.SRT || 0, V / Math.max(Q, 1));
  const p = { kind: ['UASB', 'EGSB', 'IC', 'AF', 'ABR', 'AMBR', 'ACP', 'ASBR', 'CSTR'].includes(a.tech) ? a.tech : 'UASB', V: Math.round(V), Vgas: Math.max(Math.round(V * 0.1), 10), T: +(+a.T || v('T') || 30).toFixed(1),
    SRT: +SRT.toFixed(1), Qw: +(Math.max(+a.Qw || 0, 0)).toFixed(2), fWas: sl + se > 0 ? Math.round(sl / (sl + se) * 100) : 0, mix: a.tech === 'CSTR' || a.tech === 'ACP' ? 5 : 1 };
  return { p, name: (a.tech || 'Bể') + ' – xử lý yếm khí cấp 1', alk: +(Math.max(+a.NaHCO3 || 0, 0) * 50 / 84).toFixed(1) };
}
function btAnaer(D, v, U, Lk, add, desc, inf, scope) {
  const Q = v('Q'), inL = Lk.find(l => l[0] === 'INF.out'); if (!inL) return;
  // số liệu vận hành: nước vào đã là nước thô – chỉ phân đoạn lại COD theo tỷ lệ đặc trưng; bản tính: nước vào bể yếm khí (cột ③)
  const src = D.anaer.ops ? { COD: inf.COD, BOD: v('BOD'), TSS: inf.TSS, TKN: inf.TKN, NH4: inf.fNH4 * inf.TKN, TP: inf.TP, Alk: inf.Alk } : D.anaer.in;
  if (src && +src.COD > 0) btRefrac(inf, src, v, D.anaer.frac, D);
  const infU = U.find(u => u[0] === 'INF'); if (infU) { infU[2] = D.anaer.ops ? 'Nước thải vào' : 'Nước vào xử lý yếm khí (cột ③)'; infU[5].inf = inf; }
  for (const u of U) if (u[0] !== 'INF') u[3] += 170;
  const r = btAnaerUnit(D, v, Q);
  add('ANR', 'anr', r.name, 215, 230, r.p);
  const target = inL[1]; inL[1] = 'ANR.in'; Lk.push(['ANR.out', target]);
  add('WANA', 'sludge', 'Bùn dư yếm khí', 215, 400); Lk.push(['ANR.und', 'WANA.in']);
  if (r.alk > 0) { add('NAHCO3', 'dose', 'NaHCO₃ bổ sung kiềm (yếm khí)', 100, 110, { kind: 'alk', mass: r.alk, Q: 1 }); Lk.push(['NAHCO3.out', 'ANR.in']); }
  btAnaerDesc(D, r, desc);
}
function btAnaerDesc(D, r, desc) {
  const a = D.anaer;
  desc.push(`Xử lý yếm khí cấp 1 – ${a.name || a.tech}: bể kỵ khí tốc độ cao ADM1 V = ${r.p.V} m³ (HRT ${(+a.HRT || 0).toFixed(1)} h), T = ${r.p.T} °C, SRT = ${r.p.SRT} d (lưu giữ bùn), bùn dư rút đáy ${r.p.Qw} m³/d (${r.p.fWas} % bùn sinh ra, còn lại trôi theo nước ra)${r.alk > 0 ? `, NaHCO₃ ${(+a.NaHCO3).toFixed(0)} kg/d` : ''}. Bản tính: COD ra ${(+a.CODe || 0).toFixed(0)} mg/L, CH₄ ${(+a.CH4 || 0).toFixed(0)} m³/d. Động học ADM1 (BSM2, 35 °C) – hiệu suất mô phỏng có thể khác hệ số thực nghiệm của bản tính.`);
}
/* hệ số lắng cản trở r_h (Takács) theo SVI thiết kế – tương quan Daigger (1995): k = 0,148 + 0,0021·SVI (L/g);
   SVI ≈ 204 mL/g cho đúng giá trị BSM1 0,000576 m³/g */
function btRh(SVI) { const s = Math.min(Math.max(+SVI || 150, 50), 400); return +((0.148 + 0.0021 * s) / 1000).toPrecision(4); }
function btSRTw(v, tech) {
  const SRT = v('SRTd'), Q = v('Q'), TSSe = v('TSSe') || 10;
  if (tech === 'ICEAS' && v('BMOB') > 0 && v('dM') > 0) return v('BMOB') / v('dM');
  const PX = v('PXTSS');
  if (PX > 0) { const f = 1 - Q * TSSe / 1000 / PX; if (f > 0.3) return SRT / f; }
  return SRT;
}
/* lưu lượng khí theo đơn vị ghi trong bản tính → m³/h */
function btFlowH(v, u) {
  const s = String(u || '').toLowerCase();
  if (/\/\s*(phút|min)/.test(s)) return v * 60;
  if (/\/\s*(ngđ|ngày|d\b|day)/.test(s)) return v / 24;
  if (/\/\s*(s|giây)\b/.test(s)) return v * 3600;
  return v;
}
/* số theo định dạng VN ("1.289,5") hoặc EN ("1,289.5" / "128.9") */
function btNum(t) {
  t = String(t).trim();
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return +t;
}
/* dòng "Máy thổi khí" trong sheet ThietBi: "128,9 m³/phút; 55,76 kPa; 159 kW", số lượng cột E, "(1 máy/bể + 1 dự phòng)" */
function btBlowerRow(doc, what) {
  const sh = doc.sheets.find(s => /ThietBi/i.test(s.name)); if (!sh) return null;
  const c = sh.cells;
  for (let r = 1; r < 400; r++) {
    const name = String(c['C' + r] || '');
    if (!/máy thổi khí|blower/i.test(name) || /lắng cát|grit|bể điều hòa|nén bùn/i.test(name)) continue;
    const specFull = String(c['D' + r] || ''), spec = specFull.split('\n')[0];
    const num = re => { const m = specFull.match(re); return m ? btNum(m[1]) : null; };
    let v = null, how = '';
    if (what === 'qty') { v = +c['E' + r]; how = 'cột số lượng'; }
    if (what === 'stby') { const m = (name + ' ' + String(c['H' + r] || '')).match(/\+\s*(\d+)\s*(dự phòng|standby)/i); v = m ? +m[1] : null; how = 'theo tên/ghi chú thiết bị'; }
    if (what === 'arr') { v = /1\s*máy\s*\/\s*bể|1 per basin|mỗi bể/i.test(name) ? 1 : 0; how = v ? '"1 máy/bể" → mỗi bể một máy' : 'đường ống chung'; }
    if (what === 'Q') {
      const qm = num(/([\d.,]+)\s*N?m³\s*\/\s*(?:phút|min)/i), qh = num(/([\d.,]+)\s*N?m³\s*\/\s*h/i);
      v = qm ? qm * 60 : qh; how = qm ? `${spec.match(/[\d.,]+\s*N?m³\s*\/\s*(?:phút|min)/i)[0]} × 60` : qh ? 'm³/h' : '';
    }
    if (what === 'P') { v = num(/([\d.,]+)\s*kPa/i); how = 'kPa'; }
    if (what === 'kW') { v = num(/([\d.,]+)\s*kW/i); how = 'công suất động cơ'; }
    if (v == null || !isFinite(v)) return null;
    return { v, ref: sh.name + '!' + (what === 'qty' ? 'E' : what === 'stby' || what === 'arr' ? 'C' : 'D') + r, name: _l1(name) + (how ? ' – ' + how : ''), u: '' };
  }
  return null;
}
/* dòng máy thổi khí trong sheet DienNang: cột F = kWh/ngđ */
function btEnergyRow(doc) {
  const sh = doc.sheets.find(s => /DienNang/i.test(s.name)); if (!sh) return null;
  for (let r = 1; r < 200; r++) {
    const nm = String(sh.cells['B' + r] || '');
    if (/máy thổi khí/i.test(nm) && !/lắng cát/i.test(nm) && +sh.cells['F' + r] > 0) return { v: +sh.cells['F' + r], ref: sh.name + '!F' + r, name: _l1(nm), nameFull: nm, u: 'kWh/ngđ' };
  }
  return null;
}