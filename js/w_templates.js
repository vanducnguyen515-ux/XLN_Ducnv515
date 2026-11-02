'use strict';
/* ==========================================================================
   SimNước – Sơ đồ mẫu (lấy cảm hứng từ các nhóm ví dụ: nước uống, tái sử dụng,
   nước siêu sạch, hướng dẫn clo hóa điểm đột biến, làm mềm bằng vôi)
   ========================================================================== */
const WT = {};
function wtNew(name, desc) { return { app: 'simnuoc', name, desc, units: [], links: [], ctrls: [], events: [], sim: { hours: 72, dt: 0.25 } }; }
function wtU(P, id, type, name, x, y, p = {}) {
  // giãn khoảng cách ngang để nhãn lưu lượng/kết quả không chồng lên biểu tượng
  const u = { id, type, name, x: Math.round((80 + (x - 80) * 1.3) / 10) * 10, y, p: Object.assign(WU[type].def(), p) };
  P.units.push(u); return u;
}
function wtL(P, a, pa, b, pb) { const id = 'L' + (P.links.length + 1); P.links.push({ id, from: [a, pa], to: [b, pb] }); return id; }
function wtSrc(preset, over = {}) { return Object.assign(W_PRESETS[preset].wq(), over); }

WT.conv = () => {
  const P = wtNew('Nước sông – keo tụ, lắng lamella, lọc cát, clo hóa', 'Xử lý nước mặt truyền thống: PACl + điều chỉnh pH, lắng lamella, lọc nhanh, khử trùng clo, bể chứa nước sạch. Bộ điều khiển giữ clo dư sau bể tiếp xúc 0,8 mg/L.');
  wtU(P, 'SRC', 'source', 'Nước sông', 80, 160, { Q: 20000, wq: wtSrc('river') });
  wtU(P, 'D1', 'dose', 'PACl', 220, 160, { chem: 'PACl', dose: 4, tmix: 0 });
  wtU(P, 'D2', 'dose', 'Vôi chỉnh pH', 330, 160, { chem: 'lime', mode: 'pH', pHset: 7.0, tmix: 0 });
  wtU(P, 'CO', 'coag', 'Keo tụ – tạo bông', 460, 160);
  wtU(P, 'SE', 'settler', 'Lắng lamella', 610, 160, { kind: 'lam', A: 150, Fl: 8, Cs: 8 });
  wtU(P, 'FI', 'filter', 'Lọc cát nhanh', 770, 160, { A: 120 });
  wtU(P, 'D3', 'dose', 'Clo (NaOCl)', 910, 160, { chem: 'NaOCl', dose: 2.5, tmix: 30 });
  wtU(P, 'TK', 'tank', 'Bể tiếp xúc', 1040, 160, { V: 1500, BF: 0.5 });
  wtU(P, 'RS', 'tank', 'Bể chứa nước sạch', 1180, 160, { V: 5000, flow: 'cstr', BF: 0.1 });
  wtU(P, 'PU', 'pump', 'Bơm cấp II', 1310, 160, { H: 45 });
  wtU(P, 'PR', 'product', 'Mạng cấp nước', 1440, 160);
  wtU(P, 'MX', 'mixer', 'Gom cặn', 690, 330);
  wtU(P, 'WS', 'waste', 'Bùn & nước rửa lọc', 830, 330);
  wtL(P, 'SRC', 'out', 'D1', 'in'); wtL(P, 'D1', 'out', 'D2', 'in'); wtL(P, 'D2', 'out', 'CO', 'in'); wtL(P, 'CO', 'out', 'SE', 'in');
  wtL(P, 'SE', 'out', 'FI', 'in'); wtL(P, 'FI', 'out', 'D3', 'in'); wtL(P, 'D3', 'out', 'TK', 'in'); const lt = wtL(P, 'TK', 'out', 'RS', 'in'); wtL(P, 'RS', 'out', 'PU', 'in'); wtL(P, 'PU', 'out', 'PR', 'in');
  wtL(P, 'SE', 'sludge', 'MX', 'a'); wtL(P, 'FI', 'bw', 'MX', 'b'); wtL(P, 'MX', 'out', 'WS', 'in');
  P.ctrls.push({ id: 'C1', name: 'Clo dư sau bể tiếp xúc', on: true, unit: 'D3', param: 'dose', ref: lt, v: 'Cl2f', sp: 0.8, lo: 0, hi: 15, kp: 0.5, ti: 2 });
  return P;
};

WT.iron = () => {
  const P = wtNew('Nước ngầm – khử sắt, mangan, amoni (có thu hồi nước rửa lọc)', 'Giàn mưa khử CO₂/H₂S/CH₄, bể oxy hóa sục khí, lọc sinh học (nitrat hóa, MnOx), clo hóa; nước rửa lọc được lắng và tuần hoàn về đầu trạm; bùn ly tâm.');
  wtU(P, 'SRC', 'source', 'Giếng khoan', 80, 160, { Q: 8000, wq: wtSrc('ground') });
  wtU(P, 'MX', 'mixer', 'Hòa trộn', 200, 160);
  wtU(P, 'AE', 'stripper', 'Giàn mưa', 320, 160, { kind: 'cascade', eff: 65 });
  wtU(P, 'OX', 'tank', 'Bể oxy hóa – tiếp xúc', 460, 160, { V: 250, flow: 'cstr', kla: 4 });
  wtU(P, 'FI', 'filter', 'Lọc sinh học', 610, 160, { A: 80, L: 1.2, bio: 'yes', mnox: 'yes', tmax: 36, lam0: 3 });
  wtU(P, 'D1', 'dose', 'Clo (NaOCl)', 760, 160, { chem: 'NaOCl', dose: 2.5, tmix: 30 });
  wtU(P, 'TK', 'tank', 'Bể chứa', 900, 160, { V: 2000, flow: 'cstr' });
  wtU(P, 'PR', 'product', 'Nước sạch', 1040, 160);
  wtU(P, 'BW', 'settler', 'Bể lắng nước rửa lọc', 610, 340, { kind: 'sed', A: 60, v0: 1.2, vf: 2, Cs: 15 });
  wtU(P, 'DW', 'dewater', 'Ly tâm bùn', 760, 340);
  wtU(P, 'WS', 'waste', 'Bánh bùn', 900, 340);
  wtU(P, 'WF', 'waste', 'Nước tách bùn', 900, 440, { kind: 'other' });
  wtL(P, 'SRC', 'out', 'MX', 'a'); wtL(P, 'MX', 'out', 'AE', 'in'); wtL(P, 'AE', 'out', 'OX', 'in'); wtL(P, 'OX', 'out', 'FI', 'in');
  wtL(P, 'FI', 'out', 'D1', 'in'); wtL(P, 'D1', 'out', 'TK', 'in'); const lp = wtL(P, 'TK', 'out', 'PR', 'in');
  P.ctrls.push({ id: 'C1', name: 'Clo dư nước sạch', on: true, unit: 'D1', param: 'dose', ref: lp, v: 'Cl2tot', sp: 0.5, lo: 0, hi: 15, kp: 0.5, ti: 2 });
  wtL(P, 'FI', 'bw', 'BW', 'in'); wtL(P, 'BW', 'out', 'MX', 'b'); wtL(P, 'BW', 'sludge', 'DW', 'in'); wtL(P, 'DW', 'cake', 'WS', 'in'); wtL(P, 'DW', 'filt', 'WF', 'in');
  return P;
};

WT.soften = () => {
  const P = wtNew('Làm mềm bằng vôi – lắng – tái cacbonat – lọc cát', 'Nước ngầm cứng: vôi tới pH 10,3, kết tủa CaCO₃/Mg(OH)₂, tái cacbonat bằng CO₂ về pH 8,3, lọc cát, khử trùng.');
  wtU(P, 'SRC', 'source', 'Nước ngầm cứng', 80, 160, { Q: 10000, wq: wtSrc('hard') });
  wtU(P, 'SO', 'soften', 'Bể phản ứng – lắng làm mềm', 250, 160);
  wtU(P, 'D1', 'dose', 'Tái cacbonat CO₂', 410, 160, { chem: 'CO2', mode: 'pH', pHset: 8.3, tmix: 0 });
  wtU(P, 'FI', 'filter', 'Lọc cát', 550, 160, { A: 60 });
  wtU(P, 'D2', 'dose', 'Clo', 690, 160, { chem: 'NaOCl', dose: 1.2 });
  wtU(P, 'TK', 'tank', 'Bể chứa', 820, 160, { V: 2000, flow: 'cstr' });
  wtU(P, 'PR', 'product', 'Nước sạch', 960, 160);
  wtU(P, 'WS', 'waste', 'Bùn vôi', 410, 330); wtU(P, 'WB', 'waste', 'Nước rửa lọc', 690, 330, { kind: 'bw' });
  wtL(P, 'SRC', 'out', 'SO', 'in'); wtL(P, 'SO', 'out', 'D1', 'in'); wtL(P, 'D1', 'out', 'FI', 'in'); wtL(P, 'FI', 'out', 'D2', 'in'); wtL(P, 'D2', 'out', 'TK', 'in'); wtL(P, 'TK', 'out', 'PR', 'in');
  wtL(P, 'SO', 'sludge', 'WS', 'in'); wtL(P, 'FI', 'bw', 'WB', 'in');
  return P;
};

WT.bp = () => {
  const P = wtNew('Hướng dẫn: clo hóa điểm đột biến (breakpoint)', 'Nước có NH₃-N 1 mg/L; châm clo 0–12 mg Cl₂/L (dùng Công cụ → Quét thông số: D1.dose) để thấy đường cong clo dư tổng, monocloramin, dicloramin và điểm đột biến (~7,6 mg Cl₂/mg N).');
  wtU(P, 'SRC', 'source', 'Nước có amoni', 80, 160, { Q: 1000, wq: Object.assign(wtSrc('pureFeed', { Cl2f: 0, DOC: 1, NH4: 1, Br: 0 }), { ClD: 0 }) });
  wtU(P, 'D1', 'dose', 'Clo (NaOCl)', 240, 160, { chem: 'NaOCl', dose: 8, tmix: 0 });
  wtU(P, 'TK', 'tank', 'Phản ứng 2 giờ', 400, 160, { V: 83.3, BF: 1, prof: 'yes' });
  wtU(P, 'PR', 'product', 'Mẫu sau 2 h', 560, 160, { std: 'none' });
  wtL(P, 'SRC', 'out', 'D1', 'in'); wtL(P, 'D1', 'out', 'TK', 'in'); wtL(P, 'TK', 'out', 'PR', 'in');
  P.sweep = { unit: 'D1', param: 'dose', from: 0, to: 12, n: 25, ref: 'L3', vars: ['Cl2tot', 'Cl2f', 'NH2Cl', 'NHCl2', 'NH4'] };
  return P;
};

WT.ozbac = () => {
  const P = wtNew('Tái sử dụng: keo tụ – lắng – ozone – BAC – GAC – UV', 'Chuỗi không màng (kiểu SWIFT): FeCl₃, lắng, ozone (khử vi chất, khử trùng), lọc than sinh học BAC, GAC chính, UV, clo dư.');
  wtU(P, 'SRC', 'source', 'Nước thải thứ cấp', 80, 160, { Q: 20000, wq: wtSrc('secondary') });
  wtU(P, 'D1', 'dose', 'FeCl₃', 210, 160, { chem: 'FeCl3', dose: 40, tmix: 0 });
  wtU(P, 'CO', 'coag', 'Keo tụ – tạo bông', 340, 160);
  wtU(P, 'SE', 'settler', 'Lắng lamella', 480, 160, { kind: 'lam', A: 150, Fl: 8 });
  wtU(P, 'OZ', 'ozone', 'Ozone', 620, 160, { dose: 6, HRT: 10 });
  wtU(P, 'BAC', 'gac', 'Lọc than sinh học BAC', 760, 160, { EBCT: 15, bio: 'yes', tRepl: 1500 });
  wtU(P, 'GAC', 'gac', 'GAC', 900, 160, { EBCT: 20, bio: 'no', nPar: 6, tRepl: 300, tgt: 'PFOA' });
  wtU(P, 'UV', 'uv', 'UV', 1030, 160, { D0: 186 });
  wtU(P, 'D2', 'dose', 'Clo', 1150, 160, { chem: 'NaOCl', dose: 2 });
  wtU(P, 'PR', 'product', 'Nước tái sử dụng', 1280, 160, { std: 'reuse' });
  wtU(P, 'WS', 'waste', 'Bùn', 480, 330);
  wtL(P, 'SRC', 'out', 'D1', 'in'); wtL(P, 'D1', 'out', 'CO', 'in'); wtL(P, 'CO', 'out', 'SE', 'in'); wtL(P, 'SE', 'out', 'OZ', 'in');
  wtL(P, 'OZ', 'out', 'BAC', 'in'); wtL(P, 'BAC', 'out', 'GAC', 'in'); wtL(P, 'GAC', 'out', 'UV', 'in'); wtL(P, 'UV', 'out', 'D2', 'in'); wtL(P, 'D2', 'out', 'PR', 'in');
  wtL(P, 'SE', 'sludge', 'WS', 'in');
  return P;
};

WT.roReuse = () => {
  const P = wtNew('Tái sử dụng tiên tiến: UF – RO – UV/H₂O₂ – khử CO₂ – tái khoáng', 'Chuỗi FAT: cloramin trước UF, UF, chống cáu cặn + axit, RO 2 bậc 80 %, UV-AOP với H₂O₂, tháp khử CO₂, vôi ổn định.');
  wtU(P, 'SRC', 'source', 'Nước thải thứ cấp', 80, 160, { Q: 10000, wq: wtSrc('secondary') });
  wtU(P, 'D0', 'dose', 'NaOCl (tạo cloramin)', 200, 160, { chem: 'NaOCl', dose: 4, tmix: 60 });
  wtU(P, 'UF', 'mf', 'UF', 330, 160);
  wtU(P, 'D1', 'dose', 'Chống cáu cặn', 450, 160, { chem: 'AS', dose: 3, tmix: 0 });
  wtU(P, 'D2', 'dose', 'Axit H₂SO₄', 560, 160, { chem: 'H2SO4', mode: 'pH', pHset: 6.8, tmix: 0 });
  wtU(P, 'RO', 'ro', 'RO', 690, 160, { rec: 80, v1: 30, v2: 15, nE: 7, mem: 'BWLE' });
  wtU(P, 'D3', 'dose', 'H₂O₂', 820, 160, { chem: 'H2O2', dose: 3, tmix: 0 });
  wtU(P, 'UV', 'uv', 'UV-AOP', 940, 160, { D0: 900, kWh0: 0.25 });
  wtU(P, 'ST', 'stripper', 'Tháp khử CO₂', 1060, 160);
  wtU(P, 'D4', 'dose', 'Vôi ổn định', 1180, 160, { chem: 'lime', mode: 'pH', pHset: 8.3, tmix: 0 });
  wtU(P, 'PR', 'product', 'Nước tinh khiết tái sử dụng', 1310, 160, { std: 'reuse' });
  wtU(P, 'W1', 'waste', 'Nước rửa UF', 330, 330, { kind: 'bw' }); wtU(P, 'W2', 'waste', 'Nước muối RO', 690, 330, { kind: 'brine' });
  wtL(P, 'SRC', 'out', 'D0', 'in'); wtL(P, 'D0', 'out', 'UF', 'in'); wtL(P, 'UF', 'perm', 'D1', 'in'); wtL(P, 'D1', 'out', 'D2', 'in'); wtL(P, 'D2', 'out', 'RO', 'in');
  wtL(P, 'RO', 'perm', 'D3', 'in'); wtL(P, 'D3', 'out', 'UV', 'in'); wtL(P, 'UV', 'out', 'ST', 'in'); wtL(P, 'ST', 'out', 'D4', 'in'); wtL(P, 'D4', 'out', 'PR', 'in');
  wtL(P, 'UF', 'waste', 'W1', 'in'); wtL(P, 'RO', 'conc', 'W2', 'in');
  return P;
};

WT.pure = () => {
  const P = wtNew('Nước siêu sạch: GAC – RO 2 lần – khử khí – EDI', 'Nước máy → GAC khử clo → RO lần 1 → NaOH nâng pH → RO lần 2 → tháp khử khí → EDI.');
  wtU(P, 'SRC', 'source', 'Nước máy', 80, 160, { Q: 500, wq: wtSrc('pureFeed') });
  wtU(P, 'GAC', 'gac', 'GAC khử clo', 210, 160, { EBCT: 8, bio: 'no', nPar: 1, age: 60 });
  wtU(P, 'D1', 'dose', 'Chống cáu cặn', 330, 160, { chem: 'AS', dose: 3, tmix: 0 });
  wtU(P, 'RO1', 'ro', 'RO lần 1', 450, 160, { rec: 75, nSt: '2', v1: 2, v2: 1, nE: 6 });
  wtU(P, 'D2', 'dose', 'NaOH', 580, 160, { chem: 'NaOH', mode: 'pH', pHset: 8.5, tmix: 0 });
  wtU(P, 'RO2', 'ro', 'RO lần 2', 700, 160, { rec: 80, nSt: '2', v1: 2, v2: 1, nE: 6, mem: 'BWLE' });
  wtU(P, 'ST', 'stripper', 'Khử khí', 830, 160, { GL: 40, Z: 3 });
  wtU(P, 'EDI', 'edi', 'EDI', 950, 160);
  wtU(P, 'PR', 'product', 'Nước siêu sạch', 1080, 160, { std: 'pure' });
  wtU(P, 'W1', 'waste', 'Nước muối RO1', 450, 330, { kind: 'brine' });
  wtU(P, 'MX', 'mixer', 'Thu hồi', 330, 60);
  wtU(P, 'W3', 'waste', 'Nước thải EDI', 950, 330, { kind: 'other' });
  wtL(P, 'SRC', 'out', 'MX', 'a'); wtL(P, 'MX', 'out', 'GAC', 'in'); wtL(P, 'GAC', 'out', 'D1', 'in'); wtL(P, 'D1', 'out', 'RO1', 'in'); wtL(P, 'RO1', 'perm', 'D2', 'in'); wtL(P, 'D2', 'out', 'RO2', 'in');
  wtL(P, 'RO2', 'perm', 'ST', 'in'); wtL(P, 'ST', 'out', 'EDI', 'in'); wtL(P, 'EDI', 'perm', 'PR', 'in');
  wtL(P, 'RO1', 'conc', 'W1', 'in'); wtL(P, 'RO2', 'conc', 'MX', 'b'); wtL(P, 'EDI', 'conc', 'W3', 'in');
  return P;
};

WT.dualbed = () => {
  const P = wtNew('Khử khoáng hai cột (SAC-H – khử khí – SBA-OH) + mixed bed', 'Nước cấp lò hơi: cation H, tháp khử CO₂, anion OH, đánh bóng bằng mixed bed.');
  wtU(P, 'SRC', 'source', 'Nước máy', 80, 160, { Q: 300, wq: wtSrc('pureFeed', { Cl2f: 0 }) });
  wtU(P, 'C1', 'ix', 'Cation SAC-H', 220, 160, { type: 'SACH', V: 3, nCol: 1, cap: 1.4, lev: 80 });
  wtU(P, 'ST', 'stripper', 'Khử CO₂', 360, 160, { GL: 30, Z: 2.5 });
  wtU(P, 'A1', 'ix', 'Anion SBA-OH', 500, 160, { type: 'SBAOH', V: 4, nCol: 1, cap: 0.8, lev: 80 });
  wtU(P, 'MB', 'ix', 'Mixed bed', 640, 160, { type: 'MB', V: 1, nCol: 1, cap: 0.5, leak: 0.1 });
  wtU(P, 'PR', 'product', 'Nước khử khoáng', 780, 160, { std: 'boiler' });
  wtU(P, 'MX', 'mixer', 'Gom nước tái sinh', 430, 330); wtU(P, 'WS', 'waste', 'Nước thải tái sinh', 580, 330, { kind: 'brine' });
  wtL(P, 'SRC', 'out', 'C1', 'in'); wtL(P, 'C1', 'out', 'ST', 'in'); wtL(P, 'ST', 'out', 'A1', 'in'); wtL(P, 'A1', 'out', 'MB', 'in'); wtL(P, 'MB', 'out', 'PR', 'in');
  wtL(P, 'C1', 'regen', 'MX', 'a'); wtL(P, 'A1', 'regen', 'MX', 'b'); wtL(P, 'MB', 'regen', 'MX', 'c'); wtL(P, 'MX', 'out', 'WS', 'in');
  return P;
};

WT.sea = () => {
  const P = wtNew('Khử mặn nước biển: UF – RO một bậc (ERD) – tái khoáng', 'UF tiền xử lý, khử clo bằng SBS, RO nước biển 45 % với thu hồi năng lượng, bể calcit + CO₂, khử trùng.');
  wtU(P, 'SRC', 'source', 'Nước biển', 80, 160, { Q: 22000, wq: wtSrc('sea') });
  wtU(P, 'UF', 'mf', 'UF', 210, 160, { rec: 93, J: 70 });
  wtU(P, 'D1', 'dose', 'Chống cáu cặn', 330, 160, { chem: 'AS', dose: 1.5, tmix: 0 });
  wtU(P, 'RO', 'ro', 'SWRO', 460, 160, { mem: 'SW', rec: 45, nSt: '1', v1: 70, nE: 7, eta: 85, erd: 94, ff: 0.9 });
  wtU(P, 'D2', 'dose', 'CO₂', 590, 160, { chem: 'CO2', dose: 40, tmix: 0 });
  wtU(P, 'RM', 'remin', 'Bể calcit', 710, 160, { EBCT: 20 });
  wtU(P, 'D3', 'dose', 'Clo', 830, 160, { chem: 'NaOCl', dose: 1 });
  wtU(P, 'PR', 'product', 'Nước ngọt', 960, 160, { std: 'who' });
  wtU(P, 'W1', 'waste', 'Nước rửa UF', 210, 330, { kind: 'bw' }); wtU(P, 'W2', 'waste', 'Nước muối', 460, 330, { kind: 'brine' });
  wtL(P, 'SRC', 'out', 'UF', 'in'); wtL(P, 'UF', 'perm', 'D1', 'in'); wtL(P, 'D1', 'out', 'RO', 'in'); wtL(P, 'RO', 'perm', 'D2', 'in');
  wtL(P, 'D2', 'out', 'RM', 'in'); wtL(P, 'RM', 'out', 'D3', 'in'); wtL(P, 'D3', 'out', 'PR', 'in');
  wtL(P, 'UF', 'waste', 'W1', 'in'); wtL(P, 'RO', 'conc', 'W2', 'in');
  return P;
};

WT.zld = () => {
  const P = wtNew('Nước lợ: RO hai bậc + cô đặc bay hơi (gần ZLD)', 'RO 2 bậc thu hồi 75 %, dòng đặc qua RO thứ cấp có làm mềm bằng SAC-Na, cuối cùng cô đặc bay hơi MVC.');
  wtU(P, 'SRC', 'source', 'Nước lợ', 80, 160, { Q: 5000, wq: wtSrc('brackish') });
  wtU(P, 'D1', 'dose', 'Chống cáu cặn', 200, 160, { chem: 'AS', dose: 4, tmix: 0 });
  wtU(P, 'D2', 'dose', 'Axit HCl', 310, 160, { chem: 'HCl', mode: 'pH', pHset: 6.8, tmix: 0 });
  wtU(P, 'RO', 'ro', 'RO chính', 430, 160, { rec: 75, v1: 24, v2: 12 });
  wtU(P, 'MX', 'mixer', 'Nước sản phẩm', 780, 160);
  wtU(P, 'D3', 'dose', 'Vôi ổn định', 900, 160, { chem: 'lime', mode: 'pH', pHset: 7.8, tmix: 0 });
  wtU(P, 'PR', 'product', 'Nước sạch', 1020, 160, { std: 'who' });
  wtU(P, 'SF', 'ix', 'Làm mềm SAC-Na', 430, 320, { type: 'SACNa', V: 6, nCol: 2 });
  wtU(P, 'RO2', 'ro', 'RO thu hồi', 580, 320, { rec: 60, nSt: '1', v1: 6, mem: 'BW' });
  wtU(P, 'EV', 'evap', 'Cô đặc MVC', 730, 320);
  wtU(P, 'W1', 'waste', 'Muối cô đặc', 880, 420, { kind: 'brine' }); wtU(P, 'W2', 'waste', 'Nước tái sinh', 430, 460, { kind: 'brine' });
  wtL(P, 'SRC', 'out', 'D1', 'in'); wtL(P, 'D1', 'out', 'D2', 'in'); wtL(P, 'D2', 'out', 'RO', 'in'); wtL(P, 'RO', 'perm', 'MX', 'a'); wtL(P, 'MX', 'out', 'D3', 'in'); wtL(P, 'D3', 'out', 'PR', 'in');
  wtL(P, 'RO', 'conc', 'SF', 'in'); wtL(P, 'SF', 'out', 'RO2', 'in'); wtL(P, 'RO2', 'perm', 'MX', 'b'); wtL(P, 'RO2', 'conc', 'EV', 'in'); wtL(P, 'EV', 'dist', 'MX', 'c'); wtL(P, 'EV', 'conc', 'W1', 'in'); wtL(P, 'SF', 'regen', 'W2', 'in');
  return P;
};

WT.chain = () => {
  const P = wtNew('Chuỗi công nghệ: SimXLNT → UF → RO → UV-AOP → tái khoáng', 'Nguồn là nước ra của sơ đồ SimXLNT (bấm "Nhập từ SimXLNT" ở thuộc tính đơn vị nguồn). Chưa nhập thì dùng nước thải thứ cấp điển hình.');
  wtU(P, 'WW', 'wwtp', 'Nước ra trạm XLNT (SimXLNT)', 90, 160);
  wtU(P, 'D0', 'dose', 'NaOCl (cloramin)', 230, 160, { chem: 'NaOCl', dose: 4, tmix: 60 });
  wtU(P, 'UF', 'mf', 'UF', 350, 160);
  wtU(P, 'D1', 'dose', 'Chống cáu cặn', 470, 160, { chem: 'AS', dose: 3, tmix: 0 });
  wtU(P, 'RO', 'ro', 'RO', 590, 160, { rec: 80, v1: 30, v2: 15, mem: 'BWLE' });
  wtU(P, 'D3', 'dose', 'H₂O₂', 710, 160, { chem: 'H2O2', dose: 3, tmix: 0 });
  wtU(P, 'UV', 'uv', 'UV-AOP', 830, 160, { D0: 900, kWh0: 0.25 });
  wtU(P, 'ST', 'stripper', 'Khử CO₂', 950, 160);
  wtU(P, 'D4', 'dose', 'Vôi', 1070, 160, { chem: 'lime', mode: 'pH', pHset: 8.3, tmix: 0 });
  wtU(P, 'PR', 'product', 'Nước tái sử dụng', 1200, 160, { std: 'reuse' });
  wtU(P, 'W1', 'waste', 'Nước rửa UF', 350, 330, { kind: 'bw' }); wtU(P, 'W2', 'waste', 'Nước muối RO', 590, 330, { kind: 'brine' });
  wtL(P, 'WW', 'out', 'D0', 'in'); wtL(P, 'D0', 'out', 'UF', 'in'); wtL(P, 'UF', 'perm', 'D1', 'in'); wtL(P, 'D1', 'out', 'RO', 'in'); wtL(P, 'RO', 'perm', 'D3', 'in');
  wtL(P, 'D3', 'out', 'UV', 'in'); wtL(P, 'UV', 'out', 'ST', 'in'); wtL(P, 'ST', 'out', 'D4', 'in'); wtL(P, 'D4', 'out', 'PR', 'in');
  wtL(P, 'UF', 'waste', 'W1', 'in'); wtL(P, 'RO', 'conc', 'W2', 'in');
  return P;
};

WT.fluor = () => {
  const P = wtNew('Nước thải chứa F⁻ (điện tử): kết tủa CaF₂ hai bậc – keo tụ AlCl₃ – lắng',
    'Q = 2 400 m³/d, F⁻ 300 mg/L. Bậc 1: CaCl₂ + vôi, chỉnh pH 5,5 bằng H₂SO₄, bể kết tủa 3 ngăn nối tiếp 100 m³ (≈ 1 h). Bậc 2: AlCl₃, chỉnh pH 6,5 bằng NaOH, bể keo tụ 2 ngăn 35 m³ (≈ 20 phút) chuyển keo CaF₂ thành bông, lắng. Kết tủa CaF₂ là phản ứng bậc cao theo độ quá bão hòa nên số ngăn và thời gian lưu ảnh hưởng mạnh (thử V = 8,5 m³, 1 ngăn). Thử: quét liều CaCl₂ hoặc pH đặt (tab Công cụ) để cân đối F⁻ ra với chi phí hóa chất.');
  wtU(P, 'SRC', 'source', 'Nước thải chứa F⁻', 80, 160, { Q: 2400, bal: 'auto', wq: { T: 25, pH: 6.0, alk: 20, turb: 15, Ca: 20, Mg: 5, Na: 0, K: 5, NH4: 5, Fe2: 0, Mn: 0, Ba: 0, Sr: 0, Cl: 50, SO4: 150, NO3: 2, NO2: 0, F: 300, Br: 0, PO4: 20, SiO2: 15, B: 0.5, Fe3: 0, Al: 0, DOC: 15, BDOC: 5, POC: 2, UV254: 0.1, O2: 5, Ecoli: -9, Giardia: -9, Crypto: -9, Virus: -9, MP: 0, PFOA: 0, PFOS: 0 } });
  wtU(P, 'D1', 'dose', 'CaCl₂', 200, 160, { chem: 'CaCl2', dose: 1500, tmix: 0, price: 6000 });
  wtU(P, 'D2', 'dose', 'Vôi Ca(OH)₂', 300, 160, { chem: 'lime', dose: 50, tmix: 0, price: 3500 });
  wtU(P, 'D3', 'dose', 'H₂SO₄ chỉnh pH', 400, 160, { chem: 'H2SO4', mode: 'pH', pHset: 5.5, tmix: 0, price: 5000 });
  wtU(P, 'PT1', 'precip', 'Bể kết tủa CaF₂', 520, 160, { V: 100, nT: 3 });
  wtU(P, 'D4', 'dose', 'AlCl₃', 640, 160, { chem: 'AlCl3', dose: 120, tmix: 0, price: 9000 });
  wtU(P, 'D5', 'dose', 'NaOH chỉnh pH', 740, 160, { chem: 'NaOH', mode: 'pH', pHset: 6.5, tmix: 0, price: 9000 });
  wtU(P, 'PT2', 'precip', 'Bể keo tụ CaF₂', 860, 160, { V: 35, nT: 2 });
  wtU(P, 'SE', 'settler', 'Bể lắng', 990, 160, { kind: 'sed', A: 120, Cs: 30 });
  wtU(P, 'PR', 'product', 'Nước sau xử lý', 1130, 160, { std: 'qcvn40B' });
  wtU(P, 'WS', 'waste', 'Bùn CaF₂', 1130, 330);
  wtL(P, 'SRC', 'out', 'D1', 'in'); wtL(P, 'D1', 'out', 'D2', 'in'); wtL(P, 'D2', 'out', 'D3', 'in'); wtL(P, 'D3', 'out', 'PT1', 'in'); wtL(P, 'PT1', 'out', 'D4', 'in');
  wtL(P, 'D4', 'out', 'D5', 'in'); wtL(P, 'D5', 'out', 'PT2', 'in'); wtL(P, 'PT2', 'out', 'SE', 'in'); wtL(P, 'SE', 'out', 'PR', 'in'); wtL(P, 'SE', 'sludge', 'WS', 'in');
  return P;
};

WT.empty = () => wtNew('Dự án mới', '');

const WT_LIST = [
  ['conv', 'Nước uống: keo tụ – lắng – lọc – clo hóa'], ['iron', 'Nước uống: khử Fe/Mn/NH₄ nước ngầm + thu hồi nước rửa'], ['soften', 'Nước uống: làm mềm bằng vôi – lọc cát'],
  ['bp', 'Hướng dẫn: clo hóa điểm đột biến'], ['ozbac', 'Tái sử dụng: ozone – BAC – GAC – UV'], ['roReuse', 'Tái sử dụng: UF – RO – UV/H₂O₂'],
  ['chain', 'Chuỗi SimXLNT → UF – RO – AOP'], ['pure', 'Nước siêu sạch: RO 2 lần – EDI'], ['dualbed', 'Nước siêu sạch: khử khoáng hai cột + mixed bed'],
  ['sea', 'Khử mặn nước biển SWRO'], ['zld', 'Nước lợ: RO 2 bậc + cô đặc bay hơi'], ['fluor', 'Nước thải công nghiệp: kết tủa fluorit CaF₂'], ['empty', 'Dự án trống']
];
