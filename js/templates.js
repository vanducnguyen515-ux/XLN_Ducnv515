'use strict';
/* ==========================================================================
   SimXLNT – Các sơ đồ mẫu
   ========================================================================== */
const TEMPLATES = {};

function _mk(def) {
  const units = def.units.map(([id, type, name, x, y, p]) => {
    const u = { id, type, name, x, y, p: Object.assign(UT[type].def(), p || {}) };
    if (type === 'influent' && p && p.inf) u.p.inf = Object.assign(INF.defaults(), p.inf);
    return u;
  });
  const links = def.links.map(([a, b], i) => {
    const [ua, pa] = a.split('.'), [ub, pb] = b.split('.');
    return { id: 'L' + (i + 1), from: [ua, pa], to: [ub, pb] };
  });
  return {
    name: def.name, desc: def.desc || '', model: def.model,
    params: { ASM1: {}, ASM2d: {}, ADM1: {}, ...(def.params || {}) },
    plant: Object.assign(PLANT_DEF(), def.plant || {}),
    units, links, ctrls: def.ctrls || [],
    sim: Object.assign({ days: 7, dtOut: 1 / 96, rtol: 1e-4, atol: 1e-3, init: 'ss' }, def.sim || {})
  };
}

TEMPLATES.bsm1 = () => _mk({
  name: 'BSM1 – Benchmark Simulation Model No.1 (ASM1)',
  desc: 'Sơ đồ MLE 5 bể (2 thiếu khí + 3 hiếu khí) + bể lắng Takács 10 lớp theo IWA BSM1 (Alex et al., 2008). ' +
    'Thông số động học BSM1 (đã quy về 15 °C) nhập trực tiếp; nhiệt độ mô phỏng đặt 20 °C để không hiệu chỉnh lại. Cs cố định 8 mg/L. ' +
    'Kết quả ổn định tham chiếu (bể 5): SO≈0,49; SNO≈10,4; SNH≈1,73 mg/L; nước ra TSS≈12,5 mg/L.',
  model: 'ASM1',
  params: { ASM1: { muH: 4, KS: 10, KOH: 0.2, KNO: 0.5, bH: 0.3, etag: 0.8, etah: 0.8, kh: 3, KX: 0.1, muA: 0.5, KNH: 1, bA: 0.05, KOA: 0.4, ka: 0.05, YH: 0.67, YA: 0.24, fP: 0.08, iXB: 0.08, iXP: 0.06, iCV: 1 / 0.75, fBOD: 0.25 } },
  plant: { T: 20, csMode: 'fixed', csFixed: 8 },
  units: [
    ['INF', 'influent', 'Dòng vào', 50, 230, { Q: 18446, inf: { mode: 'state', st: { ASM1: { SI: 30, SS: 69.5, XI: 51.2, XS: 202.32, XBH: 28.17, XBA: 0, XP: 0, SO: 0, SNO: 0, SNH: 31.56, SND: 6.95, XND: 10.59, SALK: 7, SN2: 0, XISS: 0 } }, pat: { type: 'diurnal', aQ: 0.3, pQ: 14, aC: 0.25, pC: 12, csv: '', loop: true } } }],
    ['R1', 'cstr', 'Bể 1 (thiếu khí)', 190, 230, { V: 1000, H: 4, aer: 'none', mix: 0 }],
    ['R2', 'cstr', 'Bể 2 (thiếu khí)', 320, 230, { V: 1000, H: 4, aer: 'none', mix: 0 }],
    ['R3', 'cstr', 'Bể 3 (hiếu khí)', 450, 230, { V: 1333, H: 4, aer: 'kla', kla: 240 }],
    ['R4', 'cstr', 'Bể 4 (hiếu khí)', 580, 230, { V: 1333, H: 4, aer: 'kla', kla: 240 }],
    ['R5', 'cstr', 'Bể 5 (hiếu khí)', 710, 230, { V: 1333, H: 4, aer: 'kla', kla: 84 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 820, 230, { mode: 'Q', Q: 55338 }],
    ['CL', 'clarifier', 'Bể lắng', 930, 230, { A: 1500, H: 4, nL: 10, feed: 5, uMode: 'Q', uQ: 18831 }],
    ['EFF', 'effluent', 'Nước ra', 1080, 200, {}],
    ['SP2', 'splitter', 'Chia RAS/WAS', 930, 390, { mode: 'Q', Q: 385 }],
    ['WAS', 'sludge', 'Bùn thải', 1080, 410, {}]
  ],
  links: [
    ['INF.out', 'R1.in'], ['R1.out', 'R2.in'], ['R2.out', 'R3.in'], ['R3.out', 'R4.in'], ['R4.out', 'R5.in'], ['R5.out', 'SP1.in'],
    ['SP1.a', 'R1.in'], ['SP1.b', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'R1.in']
  ],
  sim: { days: 7 }
});

TEMPLATES.a2o = () => _mk({
  name: 'A²O – khử N, P sinh học (ASM2d)',
  desc: 'Kỵ khí → Thiếu khí → Hiếu khí ×2, tuần hoàn nội từ cuối hiếu khí về thiếu khí, bùn hồi lưu về bể kỵ khí. Mô hình ASM2d (PAO, lên men, kết tủa).',
  model: 'ASM2d',
  plant: { T: 20 },
  units: [
    ['INF', 'influent', 'Nước thải', 50, 230, { Q: 20000, inf: { fSB: 0.25, fSA: 0.5, fPO4: 0.38, pat: { type: 'diurnal', aQ: 0.3, pQ: 14, aC: 0.2, pC: 12, csv: '', loop: true } } }],
    ['AN', 'cstr', 'Kỵ khí', 190, 230, { V: 2000, H: 5, aer: 'none' }],
    ['AX', 'cstr', 'Thiếu khí', 330, 230, { V: 4000, H: 5, aer: 'none' }],
    ['OX1', 'cstr', 'Hiếu khí 1', 470, 230, { V: 5000, H: 5, aer: 'do', DOsp: 2 }],
    ['OX2', 'cstr', 'Hiếu khí 2', 610, 230, { V: 5000, H: 5, aer: 'do', DOsp: 1.5 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 730, 230, { mode: 'Q', Q: 60000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 850, 230, { A: 2600, H: 4.5, nL: 10, feed: 5, uMode: 'ratio', uR: 0.5 }],
    ['EFF', 'effluent', 'Nước ra', 1000, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 850, 390, { mode: 'Q', Q: 650 }],
    ['WAS', 'sludge', 'Bùn thải', 1000, 410, {}]
  ],
  links: [
    ['INF.out', 'AN.in'], ['AN.out', 'AX.in'], ['AX.out', 'OX1.in'], ['OX1.out', 'OX2.in'], ['OX2.out', 'SP1.in'],
    ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'AN.in']
  ]
});

TEMPLATES.a2oG = () => _mk({
  name: 'A²O + cyclone chọn lọc bùn hạt (ASM2dG – densified)',
  desc: 'Như A²O nhưng bùn dư đi qua cyclone: dòng đáy (giàu hạt, 20 % lưu lượng) quay về bể kỵ khí, dòng tràn (bông nhẹ) thải bỏ → tuổi bùn hạt dài hơn bông, tỷ lệ bùn hạt tăng, bể lắng tách bùn hạt nhanh. ' +
    'Mô hình ASM2dG: sinh khối, PHA, polyP, chất trơ có bản sao "trong hạt" với hằng số bán bão hòa nhân hệ số cản khuếch tán. So sánh với mẫu A²O thường (tỷ lệ hạt, TSS ra, SRT). ' +
    'Tốc độ hạt hóa/vỡ hạt (tab Mô hình, nhóm "Bùn hạt") là thông số cần hiệu chỉnh theo số liệu thực tế.',
  model: 'ASM2dG',
  plant: { T: 20 },
  units: [
    ['INF', 'influent', 'Nước thải', 50, 230, { Q: 20000, inf: { fSB: 0.25, fSA: 0.5, fPO4: 0.38 } }],
    ['AN', 'cstr', 'Kỵ khí', 190, 230, { V: 2000, H: 5, aer: 'none' }],
    ['AX', 'cstr', 'Thiếu khí', 330, 230, { V: 4000, H: 5, aer: 'none' }],
    ['OX1', 'cstr', 'Hiếu khí 1', 470, 230, { V: 5000, H: 5, aer: 'do', DOsp: 2 }],
    ['OX2', 'cstr', 'Hiếu khí 2', 610, 230, { V: 5000, H: 5, aer: 'do', DOsp: 1.5 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 730, 230, { mode: 'Q', Q: 60000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 850, 230, { A: 2600, H: 4.5, nL: 10, feed: 5, uMode: 'ratio', uR: 0.5 }],
    ['EFF', 'effluent', 'Nước ra', 1000, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 850, 390, { mode: 'Q', Q: 1000 }],
    ['CY', 'cyclone', 'Cyclone bùn hạt', 700, 420, { uR: 0.2, rTSS: 2, fG: 80, fISS: 50, fDes: 15 }],
    ['WAS', 'sludge', 'Bùn thải (bông)', 560, 470, {}]
  ],
  links: [
    ['INF.out', 'AN.in'], ['AN.out', 'AX.in'], ['AX.out', 'OX1.in'], ['OX1.out', 'OX2.in'], ['OX2.out', 'SP1.in'],
    ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'], ['SP2.a', 'CY.in'], ['SP2.b', 'AN.in'],
    ['CY.und', 'AN.in'], ['CY.ovf', 'WAS.in']
  ]
});

TEMPLATES.sewer = () => _mk({
  name: 'Mạng cống (ống áp lực + cống tự chảy) → A²O (ASM2d)',
  desc: 'Nước thải qua ống áp lực 2,5 km (đầy ống, kỵ khí: lên men tạo VFA, sulfua) rồi cống tự chảy 4 km (thông khí bề mặt, hiếu khí một phần) trước khi vào trạm A²O. ' +
    'Thử: đổi chiều dài/đường kính/độ dốc để xem COD dễ phân hủy, VFA, DO và sulfua tại cửa trạm thay đổi, ảnh hưởng tới khử P sinh học.',
  model: 'ASM2d',
  plant: { T: 25 },
  units: [
    ['INF', 'influent', 'Nước thải khu dân cư', 50, 230, { Q: 20000, inf: { fSB: 0.25, fSA: 0.2, fPO4: 0.38 } }],
    ['SWP', 'sewer', 'Ống áp lực', 190, 230, { kind: 'pressure', L: 2500, D: 600, nSeg: 8 }],
    ['SWG', 'sewer', 'Cống tự chảy', 350, 230, { kind: 'gravity', L: 4000, D: 1000, S: 1.0, nSeg: 8 }],
    ['AN', 'cstr', 'Kỵ khí', 500, 230, { V: 2000, H: 5, aer: 'none' }],
    ['AX', 'cstr', 'Thiếu khí', 640, 230, { V: 4000, H: 5, aer: 'none' }],
    ['OX1', 'cstr', 'Hiếu khí 1', 780, 230, { V: 5000, H: 5, aer: 'do', DOsp: 2 }],
    ['OX2', 'cstr', 'Hiếu khí 2', 920, 230, { V: 5000, H: 5, aer: 'do', DOsp: 1.5 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 1040, 230, { mode: 'Q', Q: 60000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 1160, 230, { A: 2600, H: 4.5, nL: 10, feed: 5, uMode: 'ratio', uR: 0.5 }],
    ['EFF', 'effluent', 'Nước ra', 1310, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 1160, 390, { mode: 'Q', Q: 650 }],
    ['WAS', 'sludge', 'Bùn thải', 1310, 410, {}]
  ],
  links: [
    ['INF.out', 'SWP.in'], ['SWP.out', 'SWG.in'], ['SWG.out', 'AN.in'], ['AN.out', 'AX.in'], ['AX.out', 'OX1.in'], ['OX1.out', 'OX2.in'], ['OX2.out', 'SP1.in'],
    ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'AN.in']
  ]
});

TEMPLATES.mleFe = () => _mk({
  name: 'MLE + châm FeCl₃ khử P hóa học (ASM2d)',
  desc: 'Thiếu khí → Hiếu khí, châm sắt vào cuối bể hiếu khí để kết tủa phosphat (quá trình 20–21 của ASM2d).',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải', 50, 230, { Q: 20000 }],
    ['AX', 'cstr', 'Thiếu khí', 200, 230, { V: 5000, H: 5, aer: 'none' }],
    ['OX', 'cstr', 'Hiếu khí', 360, 230, { V: 10000, H: 5, aer: 'do', DOsp: 2 }],
    ['FE', 'dose', 'Châm FeCl₃', 360, 90, { kind: 'metal', metal: 'Fe', mass: 400, Q: 2 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 500, 230, { mode: 'Q', Q: 60000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 630, 230, { A: 2600, H: 4.5, nL: 10, feed: 5, uMode: 'ratio', uR: 0.8 }],
    ['EFF', 'effluent', 'Nước ra', 780, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 630, 390, { mode: 'Q', Q: 550 }],
    ['WAS', 'sludge', 'Bùn thải', 780, 410, {}]
  ],
  links: [
    ['INF.out', 'AX.in'], ['AX.out', 'OX.in'], ['FE.out', 'OX.in'], ['OX.out', 'SP1.in'], ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'],
    ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'AX.in']
  ]
});

TEMPLATES.primary = () => _mk({
  name: 'Lắng sơ cấp + MLE + bổ sung carbon (ASM1)',
  desc: 'Lắng sơ cấp lý tưởng (60 % TSS), MLE với bể thiếu khí thứ hai được châm nguồn carbon ngoài – thử nghiệm ảnh hưởng của liều carbon tới TN.',
  model: 'ASM1',
  units: [
    ['INF', 'influent', 'Nước thải thô', 50, 230, { Q: 20000, inf: { COD: 550, fSB: 0.2, fXI: 0.13, fXH: 0.1, TKN: 55, fNH4: 0.68, TSS: 280 } }],
    ['PC', 'psep', 'Lắng sơ cấp', 180, 230, { rem: 60, uMode: 'ratio', uR: 0.004 }],
    ['PS', 'sludge', 'Bùn sơ cấp', 180, 400, {}],
    ['AX', 'cstr', 'Thiếu khí 1', 320, 230, { V: 4000, H: 5, aer: 'none' }],
    ['OX', 'cstr', 'Hiếu khí', 460, 230, { V: 8000, H: 5, aer: 'do', DOsp: 2 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 590, 230, { mode: 'Q', Q: 50000 }],
    ['AX2', 'cstr', 'Thiếu khí 2', 700, 230, { V: 2000, H: 5, aer: 'none' }],
    ['MC', 'dose', 'Methanol/Acetat', 700, 90, { kind: 'carbon', mass: 300, Q: 1 }],
    ['RE', 'cstr', 'Tái sục khí', 820, 230, { V: 800, H: 5, aer: 'do', DOsp: 2 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 940, 230, { A: 2500, H: 4.5, uMode: 'ratio', uR: 0.75 }],
    ['EFF', 'effluent', 'Nước ra', 1080, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 940, 400, { mode: 'Q', Q: 330 }],
    ['WAS', 'sludge', 'Bùn dư', 1080, 420, {}]
  ],
  links: [
    ['INF.out', 'PC.in'], ['PC.und', 'PS.in'], ['PC.ovf', 'AX.in'], ['AX.out', 'OX.in'], ['OX.out', 'SP1.in'], ['SP1.a', 'AX.in'],
    ['SP1.b', 'AX2.in'], ['MC.out', 'AX2.in'], ['AX2.out', 'RE.in'], ['RE.out', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'],
    ['SP2.a', 'WAS.in'], ['SP2.b', 'AX.in']
  ]
});

TEMPLATES.bsm1cl = () => {
  const P = TEMPLATES.bsm1();
  P.name = 'BSM1 vòng kín – điều khiển PI DO & nitrat (ASM1)';
  P.desc = 'BSM1 với 2 bộ điều khiển PI theo chiến lược mặc định của benchmark: DO bể 5 = 2 mg/L bằng kLa₅ (K = 500, Ti = 0,001 d, kLa ≤ 360 1/d) ' +
    'và NO₃ bể 2 = 1 mg N/L bằng lưu lượng tuần hoàn nội Qa (K = 15000, Ti = 0,05 d, Qa ≤ 92230 m³/d).';
  P.ctrls = [
    { id: 'C1', name: 'DO bể 5', on: true, link: 'L6', v: 'DO', unit: 'R5', act: 'kla', sp: 2, Kp: 500, Ti: 0.001, Td: 0, u0: 84, umin: 0, umax: 360, tau: 1 },
    { id: 'C2', name: 'NO₃ bể 2', on: true, link: 'L3', v: 'NOx', unit: 'SP1', act: 'Q', sp: 1, Kp: 15000, Ti: 0.05, Td: 0, u0: 55338, umin: 0, umax: 92230, tau: 10 }
  ];
  return P;
};

TEMPLATES.sbr = () => _mk({
  name: 'SBR 2 bể nạp theo mẻ (ASM2d)',
  desc: 'Hai bể SBR lệch pha nửa chu kỳ, chu kỳ 8 h: nạp 4 h (2 h khuấy thiếu/kỵ khí + 2 h có sục khí) → sục khí 2,5 h → lắng 0,75 h → gạn 0,75 h.' +
    'Đổi "Chế độ cấp nước" sang "Nạp liên tục" để mô phỏng kiểu ICEAS. Trạng thái ổn định là trạng thái tuần hoàn theo chu kỳ; kết quả hiển thị là trung bình một chu kỳ.',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải', 60, 230, { Q: 4000, inf: { fSB: 0.25, fSA: 0.5, fPO4: 0.38 } }],
    ['SBR', 'sbr', 'Cụm SBR', 260, 230, { N: 2, Vmax: 4400, Vmin: 3000, H: 5.5, feed: 'batch', tF: 4, tFa: 2, tR: 2.5, tS: 0.75, tD: 0.75, tI: 0, DOsp: 2, TSSe: 15, Vwas: 60 }],
    ['EFF', 'effluent', 'Nước gạn', 450, 200, {}],
    ['WAS', 'sludge', 'Bùn thải', 450, 380, {}]
  ],
  links: [['INF.out', 'SBR.in'], ['SBR.eff', 'EFF.in'], ['SBR.was', 'WAS.in']],
  sim: { days: 2, dtOut: 1 / 288 }
});

TEMPLATES.iceas = () => _mk({
  name: 'ICEAS 4 bể – chu kỳ NIT (ASM2d)',
  desc: 'ICEAS (Xylem/Sanitaire): nạp liên tục vào ngăn tiền phản ứng 15 % diện tích, tràn qua vách ngăn sang vùng chính. ' +
    'Chu kỳ NIT 4 h: sục khí 120′ → lắng 60′ → gạn 60′; 4 bể lệch pha; khử nitrat diễn ra ở ngăn tiền phản ứng và khi lắng/gạn. Lắng phân tầng 15 lớp (Takács, tham số từ SVI); bùn dư rút đáy trong pha gạn. ' +
    'Đổi "Chu kỳ vận hành" sang NDN(P) (96/72/60/60) để so sánh – với ASM2d gốc thời gian hiếu khí 33 % là sát ngưỡng nitrat hóa; thử thêm ηb,A ≈ 0,33 ở tab Mô hình và điều chỉnh lượng bùn xả.',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải', 60, 230, { Q: 10000, inf: { fSB: 0.25, fSA: 0.5, fPO4: 0.38 } }],
    ['IC', 'iceas', 'ICEAS', 270, 230, { N: 4, A: 500, fPre: 0.15, Hmax: 5.5, Hmin: 4.5, mode: 'NIT', DOsp: 2, SVI: 120, TSSe: 10, Vwas: 7, sm: 'layered', nLay: 15 }],
    ['EFF', 'effluent', 'Nước gạn', 460, 200, {}],
    ['WAS', 'sludge', 'Bùn thải', 460, 390, {}]
  ],
  links: [['INF.out', 'IC.in'], ['IC.eff', 'EFF.in'], ['IC.was', 'WAS.in']],
  sim: { days: 2, dtOut: 1 / 288 }
});

TEMPLATES.ctech = () => _mk({
  name: 'C-Tech 2 bể – chu kỳ 4 h (ASM2d)',
  desc: 'C-Tech (SFC): ngăn chọn lọc 10 % diện tích nhận nước thải và bùn hồi lưu (20 % dòng nạp) từ vùng chính; nạp theo mẻ luân phiên 2 bể. ' +
    'Chu kỳ 4 h: nạp 120′ (30′ khuấy không sục + 90′ có sục khí) → lắng 60′ → gạn 60′. Lắng phân tầng 15 lớp (Takács, tham số từ SVI); bùn dư rút đáy trong pha gạn.',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải', 60, 230, { Q: 10000, inf: { fSB: 0.25, fSA: 0.5, fPO4: 0.38 } }],
    ['CT', 'ctech', 'C-Tech', 270, 230, { N: 2, A: 1000, fSel: 0.1, Hmax: 5.5, Hmin: 4.4, tF: 120, tFm: 30, tR: 0, tS: 60, tD: 60, rRAS: 0.2, DOsp: 2, SVI: 120, TSSe: 10, Vwas: 12, sm: 'layered', nLay: 15 }],
    ['EFF', 'effluent', 'Nước gạn', 460, 200, {}],
    ['WAS', 'sludge', 'Bùn thải', 460, 390, {}]
  ],
  links: [['INF.out', 'CT.in'], ['CT.eff', 'EFF.in'], ['CT.was', 'WAS.in']],
  sim: { days: 2, dtOut: 1 / 288 }
});

TEMPLATES.mbr = () => _mk({
  name: 'MLE–MBR (ASM2d)',
  desc: 'Thiếu khí → hiếu khí → bể màng; retentate (4Q) hồi về thiếu khí, bùn dư xả từ dòng retentate. Khí sục rửa màng góp phần cấp O₂.',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải', 60, 230, { Q: 10000 }],
    ['AX', 'cstr', 'Thiếu khí', 210, 230, { V: 2500, H: 5, aer: 'none' }],
    ['OX', 'cstr', 'Hiếu khí', 360, 230, { V: 3500, H: 5, aer: 'do', DOsp: 2 }],
    ['MB', 'mbr', 'Bể màng', 520, 230, { V: 1500, H: 4, aer: 'do', DOsp: 1, Am: 25000, SADm: 0.25, uMode: 'Q', uQ: 40000 }],
    ['EFF', 'effluent', 'Nước sau màng', 690, 200, {}],
    ['SP', 'splitter', 'Retentate/WAS', 520, 400, { mode: 'Q', Q: 300 }],
    ['WAS', 'sludge', 'Bùn thải', 690, 420, {}]
  ],
  links: [['INF.out', 'AX.in'], ['AX.out', 'OX.in'], ['OX.out', 'MB.in'], ['MB.eff', 'EFF.in'], ['MB.und', 'SP.in'], ['SP.a', 'WAS.in'], ['SP.b', 'AX.in']]
});

TEMPLATES.ifas = () => _mk({
  name: 'IFAS – bùn hoạt tính + giá thể (ASM1)',
  desc: 'Tuổi bùn lơ lửng thấp (~3 ngày) nên vi khuẩn nitrat hóa lơ lửng bị rửa trôi; nitrat hóa chủ yếu nhờ màng sinh học trên giá thể (4 lớp, 200 µm). ' +
    'Xem mặt cắt O₂, NH₄, NO₃ trong màng ở tab Kết quả.',
  model: 'ASM1',
  units: [
    ['INF', 'influent', 'Nước thải', 60, 230, { Q: 20000 }],
    ['AX', 'cstr', 'Thiếu khí', 210, 230, { V: 3000, H: 5, aer: 'none' }],
    ['IF', 'mbbr', 'Bể IFAS', 370, 230, { V: 5000, H: 5, aer: 'do', DOsp: 3, fill: 0.4, SSA: 500, Lf: 200 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 500, 230, { mode: 'Q', Q: 40000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 630, 230, { A: 2200, H: 4.5, uMode: 'ratio', uR: 0.75 }],
    ['EFF', 'effluent', 'Nước ra', 780, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 630, 400, { mode: 'Q', Q: 1500 }],
    ['WAS', 'sludge', 'Bùn thải', 780, 420, {}]
  ],
  links: [['INF.out', 'AX.in'], ['AX.out', 'IF.in'], ['IF.out', 'SP1.in'], ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'], ['CL.eff', 'EFF.in'],
    ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'AX.in']]
});

TEMPLATES.digest = () => _mk({
  name: 'A²O + phân hủy kỵ khí + nước tách bùn tuần hoàn (ASM2d)',
  desc: 'Lắng sơ cấp, A²O, nén bùn dư, bể phân hủy kỵ khí 35 °C, tách nước; nước tách bùn (giàu NH₄, PO₄) quay về đầu trạm. ' +
    'Bể phân hủy dùng ADM1 đầy đủ (BSM2) với giao diện ASM2d ↔ ADM1. ' +
    'Lưu ý: khử P sinh học ở đây bị hạn chế do nitrat theo bùn hồi lưu vào bể kỵ khí và tải P từ nước tách bùn – thử chuyển sang sơ đồ UCT hoặc châm Fe để so sánh.',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải', 50, 200, { Q: 20000, inf: { fSB: 0.25, fSA: 0.5, fPO4: 0.38 } }],
    ['PC', 'psep', 'Lắng sơ cấp', 180, 200, { rem: 40, uMode: 'ratio', uR: 0.004 }],
    ['AN', 'cstr', 'Kỵ khí', 320, 200, { V: 3000, H: 5, aer: 'none' }],
    ['AX', 'cstr', 'Thiếu khí', 450, 200, { V: 4000, H: 5, aer: 'none' }],
    ['OX1', 'cstr', 'Hiếu khí 1', 580, 200, { V: 5000, H: 5, aer: 'do', DOsp: 2 }],
    ['OX2', 'cstr', 'Hiếu khí 2', 710, 200, { V: 5000, H: 5, aer: 'do', DOsp: 1.5 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 820, 200, { mode: 'Q', Q: 60000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 940, 200, { A: 2600, H: 4.5, uMode: 'ratio', uR: 0.5 }],
    ['EFF', 'effluent', 'Nước ra', 1090, 170, {}],
    ['SP2', 'splitter', 'RAS/WAS', 940, 360, { mode: 'Q', Q: 750 }],
    ['TH', 'psep', 'Nén bùn dư', 820, 470, { rem: 95, uMode: 'ratio', uR: 0.2 }],
    ['DIG', 'digester', 'Bể phân hủy kỵ khí', 560, 470, { V: 4000, Vgas: 400, T: 35 }],
    ['DW', 'psep', 'Tách nước bùn', 380, 470, { rem: 95, uMode: 'ratio', uR: 0.2 }],
    ['CAKE', 'sludge', 'Bánh bùn', 380, 620, {}]
  ],
  links: [
    ['INF.out', 'PC.in'], ['PC.ovf', 'AN.in'], ['PC.und', 'DIG.in'], ['AN.out', 'AX.in'], ['AX.out', 'OX1.in'], ['OX1.out', 'OX2.in'], ['OX2.out', 'SP1.in'],
    ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'], ['SP2.b', 'AN.in'], ['SP2.a', 'TH.in'],
    ['TH.und', 'DIG.in'], ['TH.ovf', 'PC.in'], ['DIG.out', 'DW.in'], ['DW.und', 'CAKE.in'], ['DW.ovf', 'PC.in']
  ]
});

TEMPLATES.uasbAO = () => _mk({
  name: 'Nước thải bia: UASB + AO (ADM1 + ASM2d)',
  desc: 'Nước thải tải lượng hữu cơ cao (bia, COD 3.000 mg/L, 25 °C): bể UASB xử lý yếm khí cấp 1 mô hình ADM1 với lưu giữ bùn hạt (SRT 60 ngày ≫ HRT 16 h), ' +
    'châm NaHCO₃ giữ pH; nước ra UASB vào AO (MLE) + lắng thứ cấp. Bùn dư yếm khí rút đáy riêng. Hàm lượng N, P của chất hữu cơ hạ theo TKN, TP thấp của nước thải bia (tab Mô hình). ' +
    'Thử giảm NaHCO₃ để thấy bể chua (VFA tích lũy, pH < 6,5, CH₄ giảm), hoặc giảm SRT / thể tích UASB.',
  model: 'ASM2d',
  params: { ASM2d: { iNSF: 0.0136, iNXS: 0.0181, iPSF: 0.0032, iPXS: 0.0032 } },
  plant: { T: 25 },
  units: [
    ['INF', 'influent', 'Nước thải bia', 50, 230, { Q: 2000, inf: { COD: 3000, fSI: 0.02, fSB: 0.66, fSA: 0.25, fXI: 0.05, fXH: 0.02, TKN: 50, fNH4: 0.3, TP: 15, fPO4: 0.4, TSS: 400, Alk: 600, pH: 7.2 } }],
    ['ALK', 'dose', 'NaHCO₃ bổ sung kiềm', 120, 100, { kind: 'alk', mass: 2000, Q: 1 }],
    ['ANR', 'anr', 'UASB', 210, 230, { kind: 'UASB', V: 1350, Vgas: 135, T: 25, SRT: 60, Qw: 8.5, fWas: 80 }],
    ['WANA', 'sludge', 'Bùn dư yếm khí', 210, 400, {}],
    ['AX', 'cstr', 'Thiếu khí', 380, 230, { V: 250, H: 5, aer: 'none' }],
    ['OX', 'cstr', 'Hiếu khí', 510, 230, { V: 900, H: 5, aer: 'do', DOsp: 2 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 630, 230, { mode: 'rQ', kQ: 3 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 750, 230, { A: 120, H: 4, uMode: 'rQ', uK: 0.6 }],
    ['EFF', 'effluent', 'Nước ra', 900, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 750, 400, { mode: 'Q', Q: 25 }],
    ['WAS', 'sludge', 'Bùn dư hiếu khí', 900, 400, {}]
  ],
  links: [['INF.out', 'ANR.in'], ['ALK.out', 'ANR.in'], ['ANR.out', 'AX.in'], ['ANR.und', 'WANA.in'], ['AX.out', 'OX.in'], ['OX.out', 'SP1.in'], ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'],
    ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'], ['SP2.b', 'AX.in'], ['SP2.a', 'WAS.in']]
});

TEMPLATES.mabr = () => _mk({
  name: 'MABR lai – màng thấm khí trong vùng thiếu khí (ASM1)',
  desc: 'Bùn hoạt tính SRT thấp (~4 ngày) + mô-đun MABR đặt trong vùng thiếu khí: O₂ cấp từ phía trong màng → màng sinh học ngược chiều nitrat hóa ở lớp sát màng, ' +
    'khử nitrat ở lớp ngoài và trong nước bùn (SND). Diện tích màng 40 m²/m³ vùng MABR, khí trong màng tương đương O₂ 12 mg/L, hiệu suất sử dụng O₂ 40 %. ' +
    'Xem mặt cắt O₂/NH₄/NO₃ trong màng ở tab Kết quả; thử tắt MABR (Kiểu màng = MBBR) để so sánh.',
  model: 'ASM1',
  units: [
    ['INF', 'influent', 'Nước thải', 60, 230, { Q: 20000 }],
    ['MA', 'mbbr', 'Vùng MABR (thiếu khí)', 220, 230, { V: 5000, H: 6, mabr: 'yes', CO2m: 12, kM: 1.2, OTEm: 40, aer: 'none', mix: 4, fill: 1, SSA: 40, Lf: 300, nLay: 5 }],
    ['OX', 'cstr', 'Hiếu khí', 380, 230, { V: 3000, H: 5, aer: 'do', DOsp: 2 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 500, 230, { mode: 'Q', Q: 40000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 630, 230, { A: 2200, H: 4.5, uMode: 'ratio', uR: 0.75 }],
    ['EFF', 'effluent', 'Nước ra', 780, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 630, 400, { mode: 'Q', Q: 1100 }],
    ['WAS', 'sludge', 'Bùn thải', 780, 420, {}]
  ],
  links: [['INF.out', 'MA.in'], ['MA.out', 'OX.in'], ['OX.out', 'SP1.in'], ['SP1.a', 'MA.in'], ['SP1.b', 'CL.in'], ['CL.eff', 'EFF.in'],
    ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'MA.in']]
});

TEMPLATES.digCHP = () => {
  const P = TEMPLATES.digest();
  P.name = 'A²O + phân hủy kỵ khí + CHP + stripping NH₃ (ASM2d)';
  P.desc = 'Như mẫu "A²O + phân hủy kỵ khí", thêm: gia nhiệt bùn trước bể phân hủy (thu hồi nhiệt 50 %), cụm năng lượng biogas – bồn chứa khí, máy phát CHP 150 kWe, đuốc đốt khí dư – ' +
    'và tháp stripping NH₃ xử lý nước tách bùn (pH 11, khí/nước 3.000) trước khi quay về đầu trạm. Xem thẻ "Thiết bị mở rộng" ở tab Kết quả: điện phát, nhiệt thu hồi, khí đốt bỏ, NH₄ khử.';
  const add = (id, type, name, x, y, p) => P.units.push({ id, type, name, x, y, p: Object.assign(UT[type].def(), p || {}) });
  add('HX', 'heatx', 'Gia nhiệt bùn', 690, 470, { Tset: 35, rec: 50, eta: 85 });
  add('STR', 'stripper', 'Stripping NH₃ nước tách', 250, 470, { pH: 11, GL: 3000, NTU: 4 });
  add('GH', 'gasholder', 'Bồn chứa biogas', 560, 600, { V: 800 });
  add('CHP', 'chp', 'Máy phát CHP', 680, 600, { kWe: 150, etaE: 38, etaT: 45, avail: 92 });
  add('FL', 'flare', 'Đuốc đốt khí', 790, 600, { cap: 200 });
  const L = P.links, f = (a, b) => L.find(l => l.from.join('.') === a && l.to.join('.') === b);
  let l = f('TH.und', 'DIG.in'); l.to = ['HX', 'in']; L.push({ id: 'L' + (L.length + 1), from: ['HX', 'out'], to: ['DIG', 'in'] });
  l = f('DW.ovf', 'PC.in'); l.to = ['STR', 'in']; L.push({ id: 'L' + (L.length + 1), from: ['STR', 'out'], to: ['PC', 'in'] });
  return P;
};

TEMPLATES.urban = () => _mk({
  name: 'Lưu vực đô thị – CSO – trạm bơm – XLNT – sông (ASM1)',
  desc: 'Hệ thoát nước chung: nước thải sinh hoạt (dòng khô) + nước mưa chảy tràn lưu vực đô thị 100 ha (mưa 25 mm/h × 2 h mỗi 3 ngày) → đập tràn tách dòng (về trạm tối đa 2,5·Q) → ' +
    'trạm bơm hố thu → bùn hoạt tính MLE → sông tiếp nhận (5 km, nước thượng nguồn 2 m³/s sạch). Nước tràn CSO xả thẳng ra sông. Chạy "Động" vài ngày để thấy trận mưa, tràn CSO và võng DO dọc sông; ' +
    'kết quả "nước ra" của sơ đồ là nước sông hạ lưu – xem nước sau lắng trên đường ống CL → sông.',
  model: 'ASM1',
  units: [
    ['INF', 'influent', 'Nước thải sinh hoạt', 40, 180, { Q: 12000 }],
    ['CA', 'catchment', 'Lưu vực đô thị', 40, 320, { kind: 'urban', A: 100, imp: 60, i: 25, dur: 2, per: 3, t0: 14, Qb: 300 }],
    ['CSO', 'cso', 'Đập tràn CSO', 180, 230, { Qmax: 30000 }],
    ['WW', 'wetwell', 'Trạm bơm hố thu', 300, 230, { Vmax: 300, Vmin: 30, Qp: 650, nP: 2, Hp: 15 }],
    ['AX', 'cstr', 'Thiếu khí', 430, 230, { V: 2500, H: 5, aer: 'none' }],
    ['OX', 'cstr', 'Hiếu khí', 560, 230, { V: 5000, H: 5, aer: 'do', DOsp: 2 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 670, 230, { mode: 'Q', Q: 24000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 790, 230, { A: 1500, H: 4.5, uMode: 'ratio', uR: 0.6 }],
    ['SP2', 'splitter', 'RAS/WAS', 790, 400, { mode: 'Q', Q: 250 }],
    ['WAS', 'sludge', 'Bùn thải', 930, 420, {}],
    ['RIN', 'influent', 'Sông thượng nguồn', 820, 60, { Q: 172800, inf: { COD: 15, fSI: 0.4, fSB: 0.1, fXI: 0.3, fXH: 0.02, TKN: 1.5, fNH4: 0.5, TSS: 20, Alk: 120, DO: 7 } }],
    ['RV', 'river', 'Sông tiếp nhận', 980, 120, { L: 5, W: 30, H: 2, nSeg: 8, SOD: 1 }],
    ['EFF', 'effluent', 'Sông hạ lưu', 1120, 120, {}]
  ],
  links: [['INF.out', 'CSO.in'], ['CA.out', 'CSO.in'], ['CSO.out', 'WW.in'], ['CSO.und', 'RV.in'], ['WW.out', 'AX.in'], ['AX.out', 'OX.in'], ['OX.out', 'SP1.in'], ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'],
    ['CL.eff', 'RV.in'], ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'AX.in'], ['RIN.out', 'RV.in'], ['RV.out', 'EFF.in']],
  sim: { days: 6, dtOut: 1 / 96 }
});

TEMPLATES.lagoon = () => _mk({
  name: 'Hồ sinh học tùy nghi 3 ngăn (ASM1)',
  desc: 'Nước thải sinh hoạt 2.000 m³/ngđ qua hồ tùy nghi 3 ngăn (5 ha, sâu 1,8 m, thời gian lưu 45 ngày, tải BOD ~70 kg/ha·ngđ): thông khí bề mặt + O₂ quang hợp của tảo, chất rắn lắng giữ lại trong hồ và phân hủy, ' +
    'nạo vét bùn đáy quy về liên tục. Đổi "Loại hồ" sang hồ sục khí / kỵ khí để so sánh.',
  model: 'ASM1',
  units: [
    ['INF', 'influent', 'Nước thải', 60, 230, { Q: 2000 }],
    ['LG', 'lagoon', 'Hồ tùy nghi', 260, 230, { kind: 'fac', A: 50000, H: 1.8, nCell: 3, vs: 0.5, Tdes: 365, KL: 0.6, Palg: 8 }],
    ['EFF', 'effluent', 'Nước ra', 460, 200, {}],
    ['SLG', 'sludge', 'Bùn nạo vét', 460, 360, {}]
  ],
  links: [['INF.out', 'LG.in'], ['LG.out', 'EFF.in'], ['LG.und', 'SLG.in']],
  sim: { days: 20, dtOut: 1 / 24, ssMax: 8000 }
});

TEMPLATES.full = () => _mk({
  name: 'Trạm đầy đủ: tiền xử lý → A²O → hóa lý bậc 3 → lọc → khử trùng + dây chuyền bùn (ASM2d)',
  desc: 'Cấu hình kiểu Sumo: song chắn – lắng cát thổi khí – bể điều hòa – lắng sơ cấp (M&E) – A²O – lắng thứ cấp – keo tụ PAC khử P – lọc đĩa vải – clo hóa NaOCl. ' +
    'Bùn: nén trọng lực bùn sơ cấp + nén băng tải bùn dư/bùn hóa lý → phân hủy kỵ khí ADM1 → ly tâm tách nước; nước tách, nước rửa lọc quay về bể điều hòa.',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải thô', 40, 160, { Q: 20000, inf: { fSB: 0.25, fSA: 0.5, fPO4: 0.38 } }],
    ['SCR', 'screen', 'Lưới lọc rác tinh', 150, 160, { kind: 'fine', cap: 8, DS: 25, kW: 4 }],
    ['GR', 'grit', 'Lắng cát thổi khí', 260, 160, { kind: 'aerated', eISS: 45, eOrg: 2, DS: 60, air: 300, kW: 4 }],
    ['EQ', 'eqtank', 'Bể điều hòa', 380, 160, { Vmax: 5000, Vmin: 500, H: 5, qmode: 'auto', kQ: 1.04, aer: 'kla', kla: 6, mix: 3 }],
    ['PC', 'pclar', 'Lắng sơ cấp', 500, 160, { A: 700, H: 3.5, mode: 'me', DS: 4 }],
    ['AN', 'cstr', 'Kỵ khí', 620, 160, { V: 2500, H: 5, aer: 'none' }],
    ['AX', 'cstr', 'Thiếu khí', 740, 160, { V: 4000, H: 5, aer: 'none' }],
    ['OX', 'pfr', 'Hiếu khí (dòng đẩy)', 890, 160, { V: 9000, H: 5, nSeg: 4, aer: 'do', DOsp: 2 }],
    ['SPI', 'splitter', 'Tuần hoàn nội', 1000, 160, { mode: 'rQ', kQ: 3 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 1110, 160, { A: 2600, H: 4.5, uMode: 'rQ', uK: 0.75 }],
    ['CH', 'chem', 'Keo tụ PAC – lắng lamella', 1240, 130, { sep: 'lamella', coag: 'pac', dose: 50, poly: 1, R0: 50, Rmax: 90, DS: 1 }],
    ['FI', 'filter', 'Lọc đĩa vải', 1360, 130, { kind: 'disc', cap: 80, bw: 2 }],
    ['DIS', 'aop', 'Khử trùng NaOCl', 1470, 130, { kind: 'naocl', V: 400, Cl2: 6, eta: 30 }],
    ['EFF', 'effluent', 'Nước ra', 1580, 130, {}],
    ['SCRW', 'sludge', 'Rác', 150, 300, {}], ['GRW', 'sludge', 'Cát', 260, 300, {}],
    ['SPW', 'splitter', 'RAS/WAS', 1110, 330, { mode: 'Q', Q: 600 }],
    ['TH1', 'thicken', 'Nén bùn sơ cấp (trọng lực)', 500, 330, { kind: 'gravity', capt: 90, DS: 5 }],
    ['TH2', 'thicken', 'Nén bùn dư (băng tải)', 1110, 460, { kind: 'belt', capt: 95, DS: 6, poly: 4, kWh: 15 }],
    ['DIG', 'digester', 'Phân hủy kỵ khí', 800, 460, { V: 5000, Vgas: 500, T: 35 }],
    ['DW', 'dewater', 'Ly tâm tách nước', 600, 520, { kind: 'centrifuge', capt: 95, DS: 22, poly: 8, kWh: 70 }],
    ['CAKE', 'sludge', 'Bánh bùn', 600, 640, {}]
  ],
  links: [
    ['INF.out', 'SCR.in'], ['SCR.out', 'GR.in'], ['SCR.und', 'SCRW.in'], ['GR.out', 'EQ.in'], ['GR.und', 'GRW.in'], ['EQ.out', 'PC.in'],
    ['PC.out', 'AN.in'], ['PC.und', 'TH1.in'], ['AN.out', 'AX.in'], ['AX.out', 'OX.in'], ['OX.out', 'SPI.in'], ['SPI.a', 'AX.in'], ['SPI.b', 'CL.in'],
    ['CL.eff', 'CH.in'], ['CL.und', 'SPW.in'], ['SPW.b', 'AN.in'], ['SPW.a', 'TH2.in'], ['CH.out', 'FI.in'], ['CH.und', 'TH2.in'], ['FI.out', 'DIS.in'], ['FI.und', 'EQ.in'], ['DIS.out', 'EFF.in'],
    ['TH1.und', 'DIG.in'], ['TH1.out', 'EQ.in'], ['TH2.und', 'DIG.in'], ['TH2.out', 'EQ.in'], ['DIG.out', 'DW.in'], ['DW.und', 'CAKE.in'], ['DW.out', 'EQ.in']
  ]
});

TEMPLATES.aopInd = () => _mk({
  name: 'Nước thải công nghiệp khó phân hủy: hóa lý → Fenton → sinh học MBBR → Ozone (ASM2d)',
  desc: 'Nước thải có COD trơ hòa tan cao (dệt nhuộm, mạch in PCB, giấy): bể điều hòa – keo tụ PAC/DAF – Fenton (pH 3, H₂O₂/Fe ≈ 5) – trung hòa & lắng bùn sắt – AO-MBBR – lắng – ozone tinh hóa. ' +
    'Hiệu suất sử dụng chất oxy hóa (eta) và tỷ lệ khoáng hóa cần hiệu chỉnh theo Jar test; Fenton chuyển một phần COD trơ thành dễ phân hủy cho sinh học phía sau.',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải công nghiệp', 40, 200, { Q: 3000, inf: { COD: 900, fSI: 0.3, fSB: 0.15, fSA: 0.2, fXI: 0.15, TKN: 40, TP: 6, TSS: 350, Alk: 250 } }],
    ['EQ', 'eqtank', 'Bể điều hòa', 160, 200, { Vmax: 1500, Vmin: 150, H: 5, qmode: 'auto', kQ: 1.04, aer: 'kla', kla: 8 }],
    ['CEPT', 'chem', 'Keo tụ PAC – DAF', 290, 200, { sep: 'daf', coag: 'pac', dose: 120, poly: 2, R0: 40, Rmax: 92, sRem: 15, DS: 3 }],
    ['FEN', 'aop', 'Fenton', 420, 200, { kind: 'fenton', V: 250, H2O2: 400, Fe: 80, pH: 3, eta: 60, fMin: 45 }],
    ['NEU', 'chem', 'Trung hòa – lắng bùn sắt', 550, 200, { sep: 'settle', coag: 'feso4', dose: 0, poly: 2, R0: 85, Rmax: 92, sRem: 0, DS: 2 }],
    ['AX', 'mbbr', 'Thiếu khí MBBR', 680, 200, { V: 800, H: 5, aer: 'none', fill: 0.4, SSA: 500 }],
    ['OX', 'mbbr', 'Hiếu khí MBBR', 810, 200, { V: 1500, H: 5, aer: 'do', DOsp: 3, fill: 0.5, SSA: 500 }],
    ['SPI', 'splitter', 'Tuần hoàn nội', 910, 200, { mode: 'rQ', kQ: 2 }],
    ['CL', 'clarifier', 'Lắng sinh học', 1010, 200, { A: 250, H: 4, uMode: 'ratio', uR: 0.01 }],
    ['O3', 'aop', 'Ozone tinh hóa', 1130, 170, { kind: 'o3', V: 120, O3: 40, eta: 70, fMin: 30 }],
    ['EFF', 'effluent', 'Nước ra', 1240, 170, {}],
    ['SL1', 'sludge', 'Bùn hóa lý', 290, 360, {}], ['SL2', 'sludge', 'Bùn sắt', 550, 360, {}], ['SL3', 'sludge', 'Bùn sinh học', 1010, 360, {}]
  ],
  links: [['INF.out', 'EQ.in'], ['EQ.out', 'CEPT.in'], ['CEPT.out', 'FEN.in'], ['CEPT.und', 'SL1.in'], ['FEN.out', 'NEU.in'], ['NEU.out', 'AX.in'], ['NEU.und', 'SL2.in'],
    ['AX.out', 'OX.in'], ['OX.out', 'SPI.in'], ['SPI.a', 'AX.in'], ['SPI.b', 'CL.in'], ['CL.eff', 'O3.in'], ['CL.und', 'SL3.in'], ['O3.out', 'EFF.in']]
});

TEMPLATES.baf = () => _mk({
  name: 'Lắng sơ cấp + BAF 2 bậc (khử C, nitrat hóa) + UV (ASM1)',
  desc: 'Lọc sinh học hiếu khí ngập nước (BAF) – màng vi sinh trên vật liệu hạt, giữ chất rắn và rửa ngược định kỳ (nước rửa về đầu trạm). Bậc 1 khử carbon, bậc 2 nitrat hóa. Khử trùng UV.',
  model: 'ASM1',
  units: [
    ['INF', 'influent', 'Nước thải', 40, 200, { Q: 10000 }],
    ['PC', 'pclar', 'Lắng sơ cấp', 170, 200, { A: 400, H: 3.5, mode: 'me', DS: 4 }],
    ['B1', 'baf', 'BAF bậc 1 (khử C)', 310, 200, { kind: 'baf', V: 900, H: 5, fill: 0.6, SSA: 1200, cap: 75, bw: 8, aer: 'do', DOsp: 2 }],
    ['B2', 'baf', 'BAF bậc 2 (nitrat hóa)', 450, 200, { kind: 'baf', V: 1200, H: 5, fill: 0.6, SSA: 1200, cap: 70, bw: 6, aer: 'do', DOsp: 4 }],
    ['UV', 'aop', 'Khử trùng UV', 580, 200, { kind: 'uv', V: 20, UVd: 40, kWh: 0.03 }],
    ['EFF', 'effluent', 'Nước ra', 690, 200, {}],
    ['PSL', 'sludge', 'Bùn sơ cấp', 170, 360, {}]
  ],
  links: [['INF.out', 'PC.in'], ['PC.out', 'B1.in'], ['PC.und', 'PSL.in'], ['B1.out', 'B2.in'], ['B1.und', 'PC.in'], ['B2.out', 'UV.in'], ['B2.und', 'PC.in'], ['UV.out', 'EFF.in']]
});

TEMPLATES.thpStruv = () => _mk({
  name: 'MLE + THP + phân hủy kỵ khí + thu hồi struvite + sấy bùn (ASM2d)',
  desc: 'Bùn dư nén ly tâm → thủy phân nhiệt (THP, 165 °C) → phân hủy kỵ khí → ly tâm tách nước → sấy bùn; nước tách bùn giàu PO₄, NH₄ qua kết tinh struvite trước khi quay về đầu trạm. Bể phân hủy hiếu khí xử lý bùn sơ cấp (minh họa).',
  model: 'ASM2d',
  units: [
    ['INF', 'influent', 'Nước thải', 40, 200, { Q: 15000, inf: { fPO4: 0.4 } }],
    ['AX', 'cstr', 'Thiếu khí', 180, 200, { V: 3500, H: 5, aer: 'none' }],
    ['OX1', 'cstr', 'Hiếu khí 1', 310, 200, { V: 4000, H: 5, aer: 'do', DOsp: 2 }],
    ['OX2', 'cstr', 'Hiếu khí 2', 440, 200, { V: 4000, H: 5, aer: 'do', DOsp: 1.5 }],
    ['SPI', 'splitter', 'Tuần hoàn nội', 550, 200, { mode: 'rQ', kQ: 3 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 660, 200, { A: 1900, H: 4.5, uMode: 'rQ', uK: 0.75 }],
    ['EFF', 'effluent', 'Nước ra', 790, 170, {}],
    ['SPW', 'splitter', 'RAS/WAS', 660, 360, { mode: 'Q', Q: 450 }],
    ['TH', 'thicken', 'Nén ly tâm bùn dư', 520, 470, { kind: 'centrifuge', capt: 95, DS: 16, poly: 3, kWh: 40 }],
    ['THP', 'thp', 'Thủy phân nhiệt', 400, 470, { fBio: 40, fIn: 12 }],
    ['DIG', 'digester', 'Phân hủy kỵ khí', 280, 470, { V: 2500, Vgas: 250, T: 38 }],
    ['DW', 'dewater', 'Ly tâm tách nước', 160, 470, { kind: 'centrifuge', capt: 95, DS: 30, poly: 8 }],
    ['DRY', 'dryer', 'Sấy bùn', 160, 610, { DS: 90 }],
    ['ST', 'struvite', 'Kết tinh struvite', 160, 340, { eff: 85, MgP: 1.3 }],
    ['DRYP', 'sludge', 'Bùn khô', 70, 700, {}], ['VAP', 'effluent', 'Hơi nước ngưng', 280, 640, {}]
  ],
  links: [['INF.out', 'AX.in'], ['AX.out', 'OX1.in'], ['OX1.out', 'OX2.in'], ['OX2.out', 'SPI.in'], ['SPI.a', 'AX.in'], ['SPI.b', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SPW.in'], ['SPW.b', 'AX.in'], ['SPW.a', 'TH.in'],
    ['TH.und', 'THP.in'], ['TH.out', 'AX.in'], ['THP.out', 'DIG.in'], ['DIG.out', 'DW.in'], ['DW.und', 'DRY.in'], ['DW.out', 'ST.in'], ['ST.out', 'AX.in'], ['DRY.und', 'DRYP.in'], ['DRY.out', 'VAP.in']]
});

TEMPLATES.pfrAer = () => _mk({
  name: 'Bùn hoạt tính dòng đẩy (PFR) + phân hủy bùn hiếu khí (ASM1)',
  desc: 'Bể dòng đẩy 6 ngăn (ngăn đầu thiếu khí) – lắng thứ cấp; bùn dư qua bể phân hủy hiếu khí rồi nén trọng lực.',
  model: 'ASM1',
  units: [
    ['INF', 'influent', 'Nước thải', 40, 200, { Q: 12000 }],
    ['PF', 'pfr', 'Bể dòng đẩy', 220, 200, { V: 9000, H: 5, nSeg: 6, nAnox: 1, aer: 'do', DOsp: 2 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 400, 200, { A: 1600, H: 4, uMode: 'rQ', uK: 0.8 }],
    ['EFF', 'effluent', 'Nước ra', 530, 170, {}],
    ['SPW', 'splitter', 'RAS/WAS', 400, 360, { mode: 'Q', Q: 300 }],
    ['AD', 'aerdig', 'Phân hủy hiếu khí', 260, 460, { V: 3000, H: 5, aer: 'do', DOsp: 1 }],
    ['TH', 'thicken', 'Nén trọng lực', 120, 460, { kind: 'gravity', capt: 90, DS: 3 }],
    ['SL', 'sludge', 'Bùn đã ổn định', 120, 600, {}]
  ],
  links: [['INF.out', 'PF.in'], ['PF.out', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SPW.in'], ['SPW.b', 'PF.in'], ['SPW.a', 'AD.in'], ['AD.out', 'TH.in'], ['TH.und', 'SL.in'], ['TH.out', 'PF.in']]
});

TEMPLATES.empty = () => _mk({ name: 'Dự án mới', model: 'ASM2d', units: [], links: [] });

/* ---------------- xử lý nitơ dòng phụ / dòng chính – mô hình ASM1N (AOB, NOB, anammox, comammox) ---------------- */
// nước tách bùn sau phân hủy kỵ khí: NH₄ cao, COD chủ yếu khó phân hủy, độ kiềm ≈ 1,1 mol HCO₃⁻/mol NH₄⁺
const REJECT_INF = (Q, NH4) => ({ Q, inf: { mode: 'frac', COD: 450, fSI: 0.55, fSB: 0.05, fSA: 0, fXI: 0.25, fXH: 0.05, fXA: 0, TKN: NH4 * 1.06, fNH4: 0.94, fSND: 0.5,
  TSS: 350, Alk: NH4 / 14 * 1.1 * 50, pH: 7.9, NO3: 0, DO: 0, pat: { type: 'const' } } });

TEMPLATES.sharon = () => _mk({
  name: 'SHARON + Anammox – nước tách bùn 2 bậc (ASM1N)',
  desc: 'Bậc 1 SHARON: bể khuấy trộn không giữ bùn, HRT ≈ 1,2 ngày ở 35 °C → SRT = HRT, AOB (μ cao ở nhiệt độ cao) tồn tại còn NOB bị rửa trôi; ' +
    'độ kiềm sẵn có chỉ đủ oxy hóa ≈ 55 % NH₄ → tỷ lệ NO₂/NH₄ ≈ 1,3 phù hợp anammox (Hellinga et al., 1998). ' +
    'Bậc 2 anammox: bể khuấy thiếu khí + lắng giữ bùn hạt (SRT dài), NH₄ + 1,32 NO₂ → N₂ + 0,26 NO₃ (Strous, 1998). 5 % nước tách bùn đi tắt vào bể anammox để bổ sung HCO₃⁻ (CO₂ cho anammox, giữ pH) vì CO₂ đã bị sục khí cuốn đi ở bậc SHARON. Nhiệt độ nhà máy 35 °C.',
  model: 'ASM1N',
  plant: { T: 35 },
  units: [
    ['INF', 'influent', 'Nước tách bùn (reject)', 60, 230, REJECT_INF(500, 950)],
    ['SP0', 'splitter', 'Chia dòng (tắt 5 % cấp HCO₃⁻)', 140, 230, { mode: 'Q', Q: 25 }],
    ['SH', 'cstr', 'SHARON (nitrit hóa, không giữ bùn)', 260, 230, { V: 600, H: 5, aer: 'do', DOsp: 1.5, klaMax: 1500 }],
    ['AM', 'cstr', 'Bể anammox (thiếu khí)', 410, 230, { V: 400, H: 5, aer: 'none', mix: 8 }],
    ['CL', 'clarifier', 'Lắng / giữ hạt anammox', 570, 230, { A: 60, H: 4, nL: 10, feed: 5, uMode: 'Q', uQ: 500 }],
    ['EFF', 'effluent', 'Nước ra (về đầu trạm)', 720, 200, {}],
    ['SPW', 'splitter', 'Hồi lưu / xả bùn', 570, 400, { mode: 'Q', Q: 4 }],
    ['WAS', 'sludge', 'Bùn dư', 720, 420, {}]
  ],
  links: [['INF.out', 'SP0.in'], ['SP0.b', 'SH.in'], ['SP0.a', 'AM.in'], ['SH.out', 'AM.in'], ['AM.out', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SPW.in'], ['SPW.a', 'WAS.in'], ['SPW.b', 'AM.in']],
  sim: { days: 10, ssMax: 10000 }
});

TEMPLATES.demon = () => _mk({
  name: 'DEMON® – PN/A một bậc trong SBR (ASM1N)',
  desc: 'Nitrit hóa bán phần + anammox trong cùng bể SBR (Wett, 2007): nạp liên tục trong pha phản ứng, sục khí DO thấp (0,3 mg/L) kìm NOB, ' +
    'anammox dùng NO₂ ngay khi tạo ra; amoniac tự do và thiếu NO₂ ức chế thêm NOB. Tuổi bùn dài (hạt anammox giữ lại, ở thiết bị thực dùng cyclone). ' +
    'Hằng số ức chế O₂ biểu kiến của anammox (K_I,O = 0,2 mg/L) đại diện cho lớp bảo vệ trong hạt – thông số hiệu chỉnh. Nhiệt độ 30 °C.',
  model: 'ASM1N',
  plant: { T: 30 },
  units: [
    ['INF', 'influent', 'Nước tách bùn (reject)', 60, 230, REJECT_INF(400, 900)],
    ['DM', 'sbr', 'SBR DEMON (2 bể)', 300, 230, { N: 2, Vmax: 800, Vmin: 650, H: 6, feed: 'cont', tF: 6.5, tFa: 6.5, tR: 0, tS: 0.75, tD: 0.5, tI: 0.25, DOsp: 0.3, klaMax: 1500,
      sm: 'ideal', TSSe: 30, wasMode: 'srt', SRTw: 60, mix: 6 }],
    ['EFF', 'effluent', 'Nước gạn (về đầu trạm)', 520, 200, {}],
    ['WAS', 'sludge', 'Bùn dư', 520, 380, {}]
  ],
  links: [['INF.out', 'DM.in'], ['DM.eff', 'EFF.in'], ['DM.was', 'WAS.in']],
  sim: { days: 4, dtOut: 1 / 288, ssMax: 10000 }
});

TEMPLATES.anitaMox = () => _mk({
  name: 'Anammox MBBR một bậc (kiểu ANITA™Mox / Kaldnes) (ASM1N)',
  desc: 'PN/A trên giá thể: lớp ngoài màng sinh học (AOB) dùng O₂ tạo NO₂, lớp trong thiếu khí (anammox) khử NH₄ + NO₂ → N₂. ' +
    'DO 1,0 mg/L, độ đầy giá thể 40 %, 30 °C. Mặt cắt O₂ / NH₄ / NO₂ trong màng ở tab Kết quả.',
  model: 'ASM1N',
  plant: { T: 30 },
  units: [
    ['INF', 'influent', 'Nước tách bùn (reject)', 60, 230, REJECT_INF(300, 900)],
    ['MB', 'mbbr', 'MBBR PN/A', 270, 230, { V: 900, H: 5, aer: 'do', DOsp: 1.0, klaMax: 1500, fill: 0.4, SSA: 500, Lf: 400 }],
    ['CL', 'clarifier', 'Lắng', 450, 230, { A: 40, H: 4, nL: 10, feed: 5, uMode: 'ratio', uR: 0.02 }],
    ['EFF', 'effluent', 'Nước ra (về đầu trạm)', 600, 200, {}],
    ['WAS', 'sludge', 'Bùn bong tróc', 600, 400, {}]
  ],
  links: [['INF.out', 'MB.in'], ['MB.out', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'WAS.in']],
  sim: { ssMax: 12000 }
});

TEMPLATES.sideMain = () => _mk({
  name: 'Dòng chính MLE + dòng phụ PN/A nước tách bùn (ASM1N)',
  desc: 'Như cấu hình Sumo "sidestream deammonification": nước tách bùn (300 m³/d, NH₄ ≈ 900 mg/L) xử lý riêng trong bể PN/A 32 °C (nhiệt độ riêng của bể) ' +
    'có lắng giữ bùn, nước ra hòa vào dòng chính MLE 20 °C. So sánh tải N về dòng chính và điện năng so với khi không xử lý dòng phụ (đổi đường ống SS.out → AX.in).',
  model: 'ASM1N',
  plant: { T: 20 },
  units: [
    ['INF', 'influent', 'Nước thải', 60, 160, { Q: 20000 }],
    ['REJ', 'influent', 'Nước tách bùn (reject)', 60, 420, REJECT_INF(300, 900)],
    ['SS', 'cstr', 'PN/A dòng phụ (32 °C)', 230, 420, { V: 1200, H: 6, aer: 'do', DOsp: 0.3, klaMax: 1500, Tloc: 32 }],
    ['SCL', 'clarifier', 'Lắng dòng phụ', 390, 420, { A: 50, H: 4, nL: 10, feed: 5, uMode: 'Q', uQ: 300 }],
    ['SSP', 'splitter', 'Hồi lưu / xả bùn dòng phụ', 390, 560, { mode: 'Q', Q: 6 }],
    ['AX', 'cstr', 'Thiếu khí', 230, 160, { V: 3500, H: 5, aer: 'none' }],
    ['OX1', 'cstr', 'Hiếu khí 1', 380, 160, { V: 4000, H: 5, aer: 'do', DOsp: 2 }],
    ['OX2', 'cstr', 'Hiếu khí 2', 530, 160, { V: 4000, H: 5, aer: 'do', DOsp: 1.5 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 660, 160, { mode: 'Q', Q: 60000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 790, 160, { A: 2400, H: 4.5, uMode: 'ratio', uR: 0.75 }],
    ['EFF', 'effluent', 'Nước ra', 940, 130, {}],
    ['SP2', 'splitter', 'RAS/WAS', 790, 330, { mode: 'Q', Q: 600 }],
    ['WAS', 'sludge', 'Bùn thải', 940, 350, {}],
    ['WS', 'sludge', 'Bùn dư dòng phụ', 540, 580, {}]
  ],
  links: [['INF.out', 'AX.in'], ['REJ.out', 'SS.in'], ['SS.out', 'SCL.in'], ['SCL.eff', 'AX.in'], ['SCL.und', 'SSP.in'], ['SSP.a', 'WS.in'], ['SSP.b', 'SS.in'],
    ['AX.out', 'OX1.in'], ['OX1.out', 'OX2.in'], ['OX2.out', 'SP1.in'], ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'], ['CL.eff', 'EFF.in'],
    ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'AX.in']],
  sim: { ssMax: 10000 }
});

TEMPLATES.comammox = () => _mk({
  name: 'Comammox – nitrat hóa DO thấp, tuổi bùn dài (ASM1N)',
  desc: 'Nitrospira comammox oxy hóa NH₄ → NO₃ một bước, ái lực NH₄ và O₂ rất cao, μ thấp (Kits et al., 2017) → chiếm ưu thế khi NH₄ thấp, DO thấp và SRT dài. ' +
    'Ba bể hiếu khí DO 0,5 mg/L nối tiếp sau thiếu khí, SRT ≈ 25 ngày. Xem tỷ lệ AOB / NOB / CMX trong bảng bể sinh học và so sánh khi đặt μ_CMX = 0 (tab Mô hình).',
  model: 'ASM1N',
  plant: { T: 20 },
  units: [
    ['INF', 'influent', 'Nước thải', 60, 230, { Q: 10000 }],
    ['AX', 'cstr', 'Thiếu khí', 200, 230, { V: 2500, H: 5, aer: 'none' }],
    ['OX1', 'cstr', 'Hiếu khí DO thấp 1', 340, 230, { V: 2500, H: 5, aer: 'do', DOsp: 0.5 }],
    ['OX2', 'cstr', 'Hiếu khí DO thấp 2', 480, 230, { V: 2500, H: 5, aer: 'do', DOsp: 0.5 }],
    ['OX3', 'cstr', 'Hiếu khí DO thấp 3', 620, 230, { V: 2500, H: 5, aer: 'do', DOsp: 0.5 }],
    ['SP1', 'splitter', 'Tuần hoàn nội', 740, 230, { mode: 'Q', Q: 30000 }],
    ['CL', 'clarifier', 'Lắng thứ cấp', 860, 230, { A: 1300, H: 4.5, uMode: 'ratio', uR: 0.8 }],
    ['EFF', 'effluent', 'Nước ra', 1000, 200, {}],
    ['SP2', 'splitter', 'RAS/WAS', 860, 400, { mode: 'Q', Q: 260 }],
    ['WAS', 'sludge', 'Bùn thải', 1000, 420, {}]
  ],
  links: [['INF.out', 'AX.in'], ['AX.out', 'OX1.in'], ['OX1.out', 'OX2.in'], ['OX2.out', 'OX3.in'], ['OX3.out', 'SP1.in'], ['SP1.a', 'AX.in'], ['SP1.b', 'CL.in'],
    ['CL.eff', 'EFF.in'], ['CL.und', 'SP2.in'], ['SP2.a', 'WAS.in'], ['SP2.b', 'AX.in']]
});

/* mô hình mới: ASM3 và phát thải N₂O (cùng sơ đồ lắng sơ cấp + MLE) */
TEMPLATES.asm3 = () => Object.assign(TEMPLATES.primary(), { name: 'Lắng sơ cấp + MLE – ASM3 (tích trữ XSTO)', model: 'ASM3',
  desc: 'Cùng sơ đồ mẫu "Lắng sơ cấp + MLE" nhưng dùng ASM3 (Gujer et al. 1999): dị dưỡng tích trữ cơ chất thành XSTO trước khi sinh trưởng, hô hấp nội sinh hiếu khí/thiếu khí. So sánh với mẫu ASM1 để thấy khác biệt bùn dư, nhu cầu O₂ và khử nitrat.' });
TEMPLATES.n2oMLE = () => Object.assign(TEMPLATES.primary(), { name: 'Phát thải N₂O – MLE (ASM1N-N2O)', model: 'ASM1N2O',
  desc: 'Cùng sơ đồ "Lắng sơ cấp + MLE" với mô hình ASM1N-N2O: AOB hai con đường (khử nitrat bởi AOB, NH₂OH) và khử nitrat dị dưỡng 4 bước; N₂O/NO thoát khí theo kLa. Kết quả: N₂O phát thải (kg N/d), hệ số phát thải (% TN vào), CO₂e (GWP 273) và CO₂e điện năng. Thử giảm DO đặt hoặc tăng tải để thấy N₂O tăng; thông số N₂O cần hiệu chỉnh theo đo khí thải.' });

/* Đối chiếu với ví dụ SUMO24 "A2O with P recovery and energy plus CFP" (Examples/20 Nutrient removal plants, mô hình Sumo4N).
   Dòng chính: nước vào sinh học = nước sau lắng sơ cấp + dịch lên men (Pipe20 của SUMO, trạng thái ổn định), quy đổi Sumo4N → ASM2d:
   SA=SVFA, SF=SB, SI=SU, XS=CB+XB+XB_e, XI=XU+CU+XE(+ana)+methanogen, XH=XOHO, XPAO=XCASTO, XPHA=PHA(PAO+GAO), XAUT=AOB+NOB+AMX,
   SNH4=SNHx+SNH2OH, SNO3=SNO3+SNO2, XISS=XINORG+kết tủa. Hệ số N/P thành phần khớp phân đoạn của SUMO; động học PAO theo Sumo4N
   (qPHA 7, bPAO 0,08); bể lắng Takács hiệu chỉnh rp để TSS ra ≈ 10 mg/L như mục tiêu của bể lắng SUMO. Số liệu SUMO đặt ở P.design (đối chiếu). */
TEMPLATES.sumoA2OP = () => {
  const P = _mk({
    name: 'Đối chiếu SUMO24: A2O + thu hồi P (dòng chính, ASM2d)',
    desc: 'Tái lập dòng chính ví dụ SUMO24 "A2O with P recovery and energy plus CFP": kỵ khí 1000 m³ → thiếu khí 1500 m³ → hiếu khí 4500 m³ (DO 2) → lắng II 3×300 m²; tuần hoàn nội 72 000 m³/d (3Q), RAS 24 000 m³/d, xả bùn 400 m³/d. ' +
      'Nước vào = nước sau lắng sơ cấp + dịch lên men (Pipe20 SUMO, 24 376 m³/d, COD 292, TKN 34,9, TP 3,94, VFA 27,6 mg/L). Hệ số N/P thành phần và động học PAO chỉnh theo Sumo4N (với tham số ASM2d mặc định, PAO bị rửa trôi – không khử P sinh học). ' +
      'Kết quả SUMO để đối chiếu ở tab Bản tính. Khác biệt cấu trúc còn lại: SUMO có COD keo, nitrat hóa 2 bậc (NO₂/NH₂OH/N₂O), bể lắng có vùng lớp bùn phản ứng (khử nitrat RAS), SRT của SUMO tính cả bùn trong bể lắng.',
    model: 'ASM2d',
    plant: { T: 20.36 },
    params: { ASM2d: { iNSF: 0.039, iNSI: 0.01, iNXS: 0.017, iNXI: 0.0265, iPSF: 0.0097, iPSI: 0, iPXS: 0.0016, iPXI: 0.0067, qPHA: 7, bPAO: 0.08, bPP: 0.04, bPHA: 0.08, etabA: 0.5 } },
    units: [
      ['INF', 'influent', 'Nước vào sinh học (SUMO Pipe20)', 60, 230, { Q: 24375.78, inf: { mode: 'state', pH: 7.33, COD: 291.9, TKN: 34.87, TP: 3.94, TSS: 84.8, Alk: 362,
        st: { ASM2d: { SO2: 0, SF: 44.521, SA: 27.609, SI: 20.009, SNH4: 28.522, SN2: 15.695, SNO3: 0, SPO4: 2.699, SALK: 7.24, XI: 49.12, XS: 139.713, XH: 10.097, XPAO: 0.381, XPP: 0.042, XPHA: 0.265, XAUT: 0.189, XMeOH: 0, XMeP: 0, XISS: 10.61 } } } }],
      ['AN', 'cstr', 'Kỵ khí (CSTR)', 200, 230, { V: 1000, H: 5, aer: 'none' }],
      ['AX', 'cstr', 'Thiếu khí (CSTR2)', 340, 230, { V: 1500, H: 5, aer: 'none' }],
      ['OX', 'cstr', 'Hiếu khí (CSTR3)', 480, 230, { V: 4500, H: 5, aer: 'do', DOsp: 2 }],
      ['SPI', 'splitter', 'Tuần hoàn nội 3Q', 620, 230, { mode: 'Q', Q: 72000 }],
      ['CL', 'clarifier', 'Lắng II 3×300 m²', 760, 230, { A: 900, H: 6, nL: 10, feed: 5, uMode: 'Q', uQ: 24000, rp: 0.009 }],
      ['EFF', 'effluent', 'Nước ra', 920, 200, {}],
      ['SPW', 'splitter', 'RAS/WAS (xả 400 m³/d)', 760, 400, { mode: 'Q', Q: 400 }],
      ['WAS', 'sludge', 'Bùn dư → bể giải phóng P', 920, 420, {}]
    ],
    links: [['INF.out', 'AN.in'], ['AN.out', 'AX.in'], ['AX.out', 'OX.in'], ['OX.out', 'SPI.in'], ['SPI.a', 'AX.in'], ['SPI.b', 'CL.in'], ['CL.eff', 'EFF.in'], ['CL.und', 'SPW.in'], ['SPW.a', 'WAS.in'], ['SPW.b', 'AN.in']]
  });
  const T = (k, l, u, v, m, o) => Object.assign({ k, l, u, v, m, ref: 'SUMO24', btName: 'kết quả ổn định SUMO24' }, o || {});
  P.design = {
    ref: true, file: 'A2O with P recovery and energy plus CFP.sumo', title: 'SUMO24 – A2O with P recovery and energy plus CFP', tech: 'AAO', techName: 'A²O + lên men bùn sơ cấp + WASSTRIP + struvite (Sumo4N)',
    model: 'ASM2d', params: [], time: '',
    note: 'Số liệu lấy từ trạng thái ổn định lưu trong tệp ví dụ SUMO24. <b>Chưa mô phỏng trong sơ đồ này:</b> lắng sơ cấp, bể lên men pha axit (2000 m³, 35 °C), bể giải phóng P bùn dư (400 m³), nén – tách nước, bể phân hủy 2500 m³, thu hồi struvite, CHP – tải các dòng này đã nằm trong nước vào (Pipe20) do SUMO tính. ' +
      'SUMO còn tính 0,63 mg/L NH₂OH và 0,46 mg/L NO₂ trong nước ra (nitrat hóa 2 bậc). TSS ra của SUMO là giá trị đặt 10 mg/L của bể lắng, không phải kết quả lắng. ' +
      'Với tham số ASM2d mặc định (qPHA 3, bPAO = bPP = bPHA = 0,2 ở mọi vùng) PAO bị rửa trôi trong sơ đồ này: PO₄ ra ≈ 3 mg/L.',
    chain: [
      { n: 'Lắng sơ cấp', c: 'Primary – giữ 58 % hạt lắng được, COD keo đi qua', sim: false },
      { n: 'Lên men bùn sơ cấp', c: 'Digester2 2000 m³, 35 °C, pH 6,0 → dịch VFA 481 mg/L về bể kỵ khí (404 m³/d)', sim: false },
      { n: 'Sinh học A²O', c: 'Kỵ khí 1000 · thiếu khí 1500 · hiếu khí 4500 m³ (DO 2)', sim: 'có (cùng thể tích, DO, lưu lượng)' },
      { n: 'Lắng thứ cấp', c: 'Bể lắng 3 vùng (phân phối, nước trong, lớp bùn phản ứng), TSS ra đặt 10 mg/L', sim: 'Takács 10 lớp (không phản ứng)' },
      { n: 'Giải phóng P bùn dư (WASSTRIP)', c: 'CSTR5 400 m³ không sục khí', sim: false },
      { n: 'Phân hủy kỵ khí + CHP', c: 'Digester1 2500 m³, CHP 150 kW', sim: false },
      { n: 'Thu hồi struvite', c: 'Precovery 500 m³ + Mg(OH)₂ → 5,4 m³/d struvite; nước sau thu hồi về đầu vào', sim: false }
    ],
    targets: [
      T('COD', 'COD ra', 'mg/L', 31.6, 'eff', { tol: 5 }), T('BOD5', 'BOD₅ ra', 'mg/L', 3.24, 'eff', { tol: 3 }), T('TSS', 'TSS ra (SUMO: giá trị đặt)', 'mg/L', 10, 'eff', { tol: 3 }),
      T('NH4', 'NH₄-N ra (SUMO thêm NH₂OH 0,63)', 'mg/L', 0.888, 'eff', { tol: 1 }), T('NOx', 'NOx-N ra (NO₃ 5,23 + NO₂ 0,46)', 'mg/L', 5.69, 'eff', { tol: 1.5 }), T('TKN', 'TKN ra', 'mg/L', 2.14, 'eff', { tol: 1 }),
      T('TN', 'TN ra', 'mg/L', 8.47, 'eff', { tol: 2 }), T('PO4', 'PO₄-P ra', 'mg/L', 0.268, 'eff', { tol: 0.5 }), T('TP', 'TP ra', 'mg/L', 0.636, 'eff', { tol: 0.5, only: 'ASM2d' }),
      T('SRTcl', 'SRT kể cả bùn bể lắng (SRT1 của SUMO)', 'ngày', 9.575, 'plant', { rel: 0.1 }), T('SRT', 'SRT chỉ bể sinh học (từ khối bùn SUMO)', 'ngày', 8.015, 'plant', { rel: 0.1 }),
      T('MLSS', 'MLSS bể hiếu khí', 'mg/L', 3194, 'plant', { rel: 0.1 }), T('MLVSS', 'MLVSS bể hiếu khí', 'mg/L', 2508, 'plant', { rel: 0.1 }), T('WAS', 'Bùn dư', 'kgTSS/d', 2548, 'plant', { rel: 0.15 }),
      T('OTR', 'O₂ cấp (OTR)', 'kgO₂/d', 4943, 'plant', { rel: 0.15 }), T('air', 'Lưu lượng khí (SUMO: Nm³ ở 0 °C)', 'm³/d', 137938, 'plant', { rel: 0.2 }),
      T('PO4', 'PO₄ bể kỵ khí (giải phóng P)', 'mg/L', 8.39, 'unit', { unit: 'AN', tol: 1.5 }), T('VFA', 'VFA còn lại bể kỵ khí', 'mgCOD/L', 6.2, 'unit', { unit: 'AN', tol: 3 }),
      T('NOx', 'NOx bể thiếu khí', 'mg/L', 1.39, 'unit', { unit: 'AX', tol: 1 }), T('NH4', 'NH₄ bể hiếu khí', 'mg/L', 0.906, 'unit', { unit: 'OX', tol: 1 }),
      T('NOx', 'NOx bể hiếu khí', 'mg/L', 6.24, 'unit', { unit: 'OX', tol: 1.5 }), T('PO4', 'PO₄ bể hiếu khí', 'mg/L', 0.74, 'unit', { unit: 'OX', tol: 0.5 })
    ]
  };
  return P;
};

const TEMPLATE_LIST = [
  ['bsm1', 'BSM1 – MLE 5 bể (ASM1, benchmark IWA)'],
  ['bsm1cl', 'BSM1 vòng kín – PI điều khiển DO & nitrat'],
  ['sbr', 'SBR 2 bể nạp theo mẻ (ASM2d)'],
  ['iceas', 'ICEAS (Xylem) 4 bể – chu kỳ NIT (ASM2d)'],
  ['ctech', 'C-Tech (SFC) 2 bể (ASM2d)'],
  ['mbr', 'MLE–MBR (ASM2d)'],
  ['ifas', 'IFAS – bùn hoạt tính + giá thể (ASM1)'],
  ['digest', 'A²O + phân hủy kỵ khí + nước tách bùn (ASM2d)'],
  ['uasbAO', 'Nước thải bia: UASB (ADM1) + AO – yếm khí cấp 1 (ASM2d)'],
  ['mabr', 'MABR lai (màng thấm khí trong bể thiếu khí) – nitrat hóa ở SRT thấp (ASM1)'],
  ['digCHP', 'A²O + phân hủy kỵ khí + gia nhiệt + CHP/đuốc/bồn khí + stripping NH₃ nước tách (ASM2d)'],
  ['urban', 'Lưu vực đô thị – tràn CSO – trạm bơm – trạm XLNT – sông tiếp nhận (ASM1)'],
  ['lagoon', 'Hồ sinh học tùy nghi 3 ngăn (ASM1)'],
  ['a2o', 'A²O khử N, P sinh học (ASM2d)'],
  ['a2oG', 'A²O + cyclone bùn hạt (ASM2dG – densified)'],
  ['sewer', 'Mạng cống áp lực + tự chảy → A²O (ASM2d)'],
  ['mleFe', 'MLE + châm FeCl₃ (ASM2d)'],
  ['primary', 'Lắng sơ cấp + MLE + bổ sung carbon (ASM1)'],
  ['full', 'Trạm đầy đủ: tiền xử lý → A²O → hóa lý → lọc → khử trùng + dây chuyền bùn (ASM2d)'],
  ['aopInd', 'Công nghiệp khó phân hủy: hóa lý → Fenton → MBBR → Ozone (ASM2d)'],
  ['baf', 'Lắng sơ cấp + BAF 2 bậc + UV (ASM1)'],
  ['thpStruv', 'MLE + THP + phân hủy kỵ khí + struvite + sấy bùn (ASM2d)'],
  ['pfrAer', 'Dòng đẩy PFR + phân hủy bùn hiếu khí (ASM1)'],
  ['sharon', 'Dòng phụ: SHARON + Anammox 2 bậc (ASM1N)'],
  ['demon', 'Dòng phụ: DEMON® PN/A một bậc SBR (ASM1N)'],
  ['anitaMox', 'Dòng phụ: Anammox MBBR một bậc – ANITA™Mox (ASM1N)'],
  ['sideMain', 'Dòng chính MLE + dòng phụ PN/A nước tách bùn (ASM1N)'],
  ['comammox', 'Comammox – nitrat hóa DO thấp, SRT dài (ASM1N)'],
  ['asm3', 'Lắng sơ cấp + MLE – ASM3 (tích trữ XSTO)'],
  ['n2oMLE', 'Phát thải N₂O – MLE (ASM1N-N2O)'],
  ['sumoA2OP', 'Đối chiếu SUMO24: A2O + thu hồi P (dòng chính, ASM2d)'],
  ['empty', 'Dự án trống']
];
