'use strict';
/* ==========================================================================
   SimXLNT – Thư viện đơn vị công nghệ, biên dịch sơ đồ → hệ phương trình vi phân
   Đơn vị: dòng vào, châm hóa chất, CSTR, bể lắng Takács, tách lý tưởng, chia dòng,
           SBR (nhiều bể, thể tích thay đổi), MBR, MBBR/IFAS (màng sinh học nhiều lớp),
           bể phân hủy kỵ khí; bộ điều khiển PID; pH & trao đổi CO2.
   ========================================================================== */

const AER_FIELDS = [
  { k: 'aer', l: 'Chế độ sục khí', t: 'sel', opts: [['none', 'Không sục khí (thiếu/kỵ khí)'], ['kla', 'Cố định kLa'], ['do', 'Điều khiển DO (setpoint)']] },
  { k: 'kla', l: 'kLa', u: '1/d', t: 'num', show: p => p.aer === 'kla' },
  { k: 'DOsp', l: 'DO đặt', u: 'mg/L', t: 'num', show: p => p.aer === 'do' },
  { k: 'klaMax', l: 'kLa tối đa', u: '1/d', t: 'num', show: p => p.aer === 'do' },
  { k: 'mix', l: 'Công suất khuấy', u: 'W/m³', t: 'num', show: p => p.aer === 'none' },
  { k: 'Tloc', l: 'Nhiệt độ riêng của bể (0 = theo nhà máy)', u: '°C', t: 'num', adv: 1 }
];

/* liều châm hóa chất: nhập theo khối lượng hoạt chất (kg/d), theo nồng độ sản phẩm trong dòng nhận (mg/L × lưu lượng)
   hoặc theo dung dịch (L/h × % × ρ); sản phẩm → hoạt chất (kg COD / kg CaCO₃ / kg Me) theo hệ số stoichiometry */
const DOSE = {
  PROD: {
    carbon: [['cod', 'COD (đã quy đổi)', 1], ['meoh', 'Methanol CH₃OH', 1.5], ['acet', 'Axit axetic CH₃COOH', 1.07], ['etoh', 'Ethanol C₂H₅OH', 2.09], ['glyc', 'Glycerol', 1.22], ['sug', 'Đường sucrose', 1.12]],
    alk: [['caco3', 'Độ kiềm (đã quy CaCO₃)', 1], ['naoh', 'NaOH', 1.25], ['na2co3', 'Na₂CO₃', 0.943], ['caoh2', 'Ca(OH)₂', 1.35], ['nahco3', 'NaHCO₃', 0.595]],
    metal: [['me', 'Kim loại (đã quy đổi)', 1], ['fecl3', 'FeCl₃ (khan)', 0.344], ['pac', 'PAC 30 % Al₂O₃', 0.159], ['alum', 'Phèn nhôm Al₂(SO₄)₃·14H₂O', 0.091], ['feso4', 'FeSO₄·7H₂O', 0.201]]
  },
  prod(p) { const L = DOSE.PROD[p.kind] || []; return L.find(x => x[0] === p.prod) || L[0]; },
  f(p) { const r = DOSE.prod(p); return +p.fAct > 0 ? +p.fAct : r ? r[2] : 1; },
  // cập nhật p.mass (và lưu lượng dung dịch) theo cách nhập; Qinf = lưu lượng nước vào trạm
  sync(p, Qinf) {
    const r = DOSE.prod(p);
    if (p.kind === 'metal' && r) { if (/pac|alum/.test(r[0])) p.metal = 'Al'; else if (/fe/.test(r[0])) p.metal = 'Fe'; }
    if (p.dmode === 'conc') { const q = +p.Qref > 0 ? +p.Qref : Qinf; if (q > 0) p.mass = +(Math.max(+p.cmg || 0, 0) * q / 1000 * DOSE.f(p)).toFixed(3); }
    else if (p.dmode === 'sol') {
      const Lh = Math.max(+p.Lh || 0, 0);
      p.mass = +(Lh * 24 * (+p.rho || 1) * (+p.pct || 0) / 100 * DOSE.f(p)).toFixed(3);
      if (Lh > 0) p.Q = +(Lh * 24 / 1000).toFixed(4);
    }
    return p;
  },
  Qinf: P => P.units.filter(u => u.type === 'influent' && !/^_TI\d/.test(u.id)).reduce((a, u) => a + (+u.p.Q || 0), 0)   // bỏ dòng vào tạm khi xé dòng tuần hoàn
};

const UT = {
  influent: {
    label: 'Dòng vào', group: 'Dòng chảy', ins: [], outs: ['out'],
    fields: [{ k: 'Q', l: 'Lưu lượng trung bình', u: 'm³/d', t: 'num' }],
    def: () => ({ Q: 20000, inf: INF.defaults() })
  },
  dose: {
    label: 'Châm hóa chất', group: 'Dòng chảy', ins: [], outs: ['out'],
    fields: [
      { k: 'kind', l: 'Loại', t: 'sel', opts: [['carbon', 'Nguồn carbon (COD dễ phân hủy)'], ['metal', 'Muối kim loại (Fe/Al) – ASM2d'], ['alk', 'Độ kiềm (NaOH)']] },
      { k: 'metal', l: 'Kim loại', t: 'sel', opts: [['Fe', 'Fe³⁺'], ['Al', 'Al³⁺']], show: p => p.kind === 'metal' },
      { k: 'dmode', l: 'Cách nhập liều', t: 'sel', opts: [['mass', 'Khối lượng hoạt chất (kg/d)'], ['conc', 'Nồng độ sản phẩm trong dòng nhận (mg/L)'], ['sol', 'Dung dịch châm (L/h × nồng độ × ρ)']] },
      { k: 'prod', l: 'Sản phẩm', t: 'sel', opts: [], optsFn: p => (DOSE.PROD[p.kind] || []).map(x => [x[0], x[1] + (x[2] !== 1 ? ` (×${x[2]})` : '')]), show: p => p.dmode === 'conc' || p.dmode === 'sol' },
      { k: 'cmg', l: 'Liều sản phẩm theo dòng nhận', u: 'mg/L', t: 'num', show: p => p.dmode === 'conc' },
      { k: 'Qref', l: 'Lưu lượng dòng nhận (0 = lưu lượng nước vào trạm)', u: 'm³/d', t: 'num', show: p => p.dmode === 'conc' },
      { k: 'Lh', l: 'Lưu lượng bơm định lượng', u: 'L/h', t: 'num', show: p => p.dmode === 'sol' },
      { k: 'pct', l: 'Nồng độ dung dịch (theo sản phẩm)', u: '% kl', t: 'num', show: p => p.dmode === 'sol' },
      { k: 'rho', l: 'Khối lượng riêng dung dịch', u: 'kg/L', t: 'num', show: p => p.dmode === 'sol' },
      { k: 'fAct', l: 'Hệ số quy đổi sản phẩm → hoạt chất (0 = theo sản phẩm)', u: '-', t: 'num', adv: 1, show: p => p.dmode === 'conc' || p.dmode === 'sol' },
      { k: 'mass', l: 'Liều lượng', u: 'kg/d', t: 'num', show: p => !p.dmode || p.dmode === 'mass', hint: p => p.kind === 'carbon' ? 'kg COD/d' : p.kind === 'metal' ? 'kg Me/d' : 'kg CaCO₃/d' },
      { k: 'mass', l: 'Hoạt chất châm (tự tính)', t: 'ro', show: p => p.dmode === 'conc' || p.dmode === 'sol', hint: p => p.kind === 'carbon' ? 'kg COD/d' : p.kind === 'metal' ? 'kg Me/d' : 'kg CaCO₃/d' },
      { k: 'Q', l: 'Lưu lượng dung dịch', u: 'm³/d', t: 'num', show: p => p.dmode !== 'sol' }
    ],
    def: () => ({ kind: 'carbon', metal: 'Fe', mass: 100, Q: 2, dmode: 'mass', prod: '', cmg: 30, Qref: 0, Lh: 10, pct: 32, rho: 1.2, fAct: 0 })
  },
  splitter: {
    label: 'Chia dòng', group: 'Dòng chảy', ins: ['in'], outs: ['a', 'b'],
    fields: [
      { k: 'mode', l: 'Quy định nhánh A', t: 'sel', opts: [['Q', 'Lưu lượng cố định'], ['frac', 'Phần dòng vào bộ chia (0–1)'], ['rQ', 'Bội số lưu lượng nước vào trạm (×Q)']] },
      { k: 'Q', l: 'Lưu lượng nhánh A', u: 'm³/d', t: 'num', show: p => p.mode === 'Q' },
      { k: 'frac', l: 'Phần nhánh A / dòng vào bộ chia', u: '-', t: 'num', show: p => p.mode === 'frac' },
      { k: 'kQ', l: 'Nhánh A = hệ số × Q vào trạm', u: '×Q', t: 'num', show: p => p.mode === 'rQ' }
    ],
    def: () => ({ mode: 'frac', Q: 1000, frac: 0.5, kQ: 1 })
  },
  effluent: { label: 'Nước ra', group: 'Dòng chảy', ins: ['in'], outs: [], fields: [], def: () => ({}) },
  sludge: { label: 'Bùn thải (WAS)', group: 'Dòng chảy', ins: ['in'], outs: [], fields: [], def: () => ({}) },
  cstr: {
    label: 'Bể phản ứng (CSTR)', group: 'Bể sinh học', ins: ['in'], outs: ['out'],
    fields: [{ k: 'V', l: 'Thể tích', u: 'm³', t: 'num' }, { k: 'H', l: 'Chiều sâu nước', u: 'm', t: 'num' }].concat(AER_FIELDS),
    def: () => ({ V: 3000, H: 5, aer: 'do', kla: 120, DOsp: 2, klaMax: 600, mix: 5 })
  },
  sbr: {
    label: 'SBR (bể phản ứng theo mẻ)', group: 'Bể sinh học', ins: ['in'], outs: ['eff', 'was'],
    fields: [
      { k: 'N', l: 'Số bể', u: '', t: 'num' },
      { k: 'Vmax', l: 'Thể tích tối đa mỗi bể', u: 'm³', t: 'num' },
      { k: 'Vmin', l: 'Thể tích sau gạn mỗi bể', u: 'm³', t: 'num' },
      { k: 'H', l: 'Chiều sâu nước tối đa', u: 'm', t: 'num' },
      { k: 'feed', l: 'Chế độ cấp nước', t: 'sel', opts: [['batch', 'Nạp theo mẻ (chỉ pha nạp)'], ['cont', 'Nạp liên tục (kiểu ICEAS)']] },
      { k: 'tF', l: 'Pha nạp', u: 'h', t: 'num' },
      { k: 'tFa', l: 'Trong đó: sục khí cuối pha nạp', u: 'h', t: 'num' },
      { k: 'tR', l: 'Pha phản ứng (sục khí)', u: 'h', t: 'num' },
      { k: 'tS', l: 'Pha lắng', u: 'h', t: 'num' },
      { k: 'tD', l: 'Pha gạn', u: 'h', t: 'num' },
      { k: 'tI', l: 'Pha chờ', u: 'h', t: 'num' },
      { k: 'DOsp', l: 'DO đặt khi sục khí', u: 'mg/L', t: 'num' },
      { k: 'klaMax', l: 'kLa tối đa', u: '1/d', t: 'num' },
      { k: 'sm', l: 'Mô hình lắng', t: 'sel', opts: [['ideal', 'Tách lý tưởng (TSS gạn cho trước)'], ['svi', 'Lớp bùn đơn theo SVI'], ['layered', 'Phân tầng nhiều lớp (Takács–SVI)']] },
      { k: 'SVI', l: 'Chỉ số thể tích bùn SVI', u: 'mL/g', t: 'num', show: p => p.sm && p.sm !== 'ideal' },
      { k: 'nLay', l: 'Số lớp lắng', u: '', t: 'num', show: p => p.sm === 'layered', adv: 1 },
      { k: 'fns', l: 'Phần không lắng được f_ns', u: '-', t: 'num', show: p => p.sm === 'layered', adv: 1 },
      { k: 'TSSe', l: 'TSS nước gạn', u: 'mg/L', t: 'num', show: p => !p.sm || p.sm === 'ideal' },
      { k: 'wasMode', l: 'Cách xả bùn', t: 'sel', opts: [['vol', 'Thể tích cố định mỗi chu kỳ'], ['srt', 'Theo tuổi bùn mục tiêu (SRT tính theo bùn xả)']] }, { k: 'SRTw', l: 'Tuổi bùn mục tiêu (khối bùn / bùn xả)', u: 'd', t: 'num', show: p => p.wasMode === 'srt' },
      { k: 'Vwas', l: 'Bùn xả mỗi bể mỗi chu kỳ', u: 'm³', t: 'num', show: p => p.wasMode !== 'srt' },
      { k: 'mix', l: 'Công suất khuấy (pha không sục)', u: 'W/m³', t: 'num', adv: 1 },
      { k: 'Tloc', l: 'Nhiệt độ riêng của bể (0 = theo nhà máy)', u: '°C', t: 'num', adv: 1 }
    ],
    def: () => ({ N: 2, Vmax: 6000, Vmin: 4000, H: 5.5, feed: 'batch', tF: 3, tFa: 0, tR: 1.5, tS: 0.75, tD: 0.75, tI: 0, DOsp: 2, klaMax: 600, TSSe: 15, Vwas: 60, wasMode: 'vol', SRTw: 20, mix: 5, sm: 'ideal', SVI: 120, nLay: 15, fns: 0.002 })
  },
  iceas: {
    label: 'ICEAS (Xylem)', group: 'Bể sinh học', ins: ['in'], outs: ['eff', 'was'],
    fields: [
      { k: 'N', l: 'Số bể', u: '', t: 'num' },
      { k: 'A', l: 'Diện tích mặt bằng mỗi bể', u: 'm²', t: 'num' },
      { k: 'fPre', l: 'Tỷ lệ diện tích ngăn tiền phản ứng', u: '-', t: 'num' },
      { k: 'Hmax', l: 'Mực nước cao TWL', u: 'm', t: 'num' },
      { k: 'Hmin', l: 'Mực nước thấp BWL', u: 'm', t: 'num' },
      { k: 'feed', l: 'Chế độ nạp nước', t: 'sel', opts: [['cont', 'Liên tục (ICEAS chuẩn, ngăn tiền phản ứng)'], ['batch', 'Gián đoạn theo mẻ như SBR (luân phiên giữa các bể)']] },
      { k: 'mode', l: 'Chu kỳ vận hành', t: 'sel', opts: [['NIT', 'NIT – nitrat hóa (120/0/60/60 phút)'], ['NDN', 'NDN(P) – khử N, P (96/72/60/60 phút)'], ['custom', 'Tự đặt']] },
      { k: 'tAer', l: 'Sục khí', u: 'phút', t: 'num', show: p => p.mode === 'custom' },
      { k: 'tMix', l: 'Khuấy thiếu khí (không sục)', u: 'phút', t: 'num', show: p => p.mode === 'custom' },
      { k: 'tS', l: 'Lắng', u: 'phút', t: 'num', show: p => p.mode === 'custom' },
      { k: 'tD', l: 'Gạn', u: 'phút', t: 'num', show: p => p.mode === 'custom' },
      { k: 'DOsp', l: 'DO đặt khi sục khí', u: 'mg/L', t: 'num' },
      { k: 'klaMax', l: 'kLa tối đa', u: '1/d', t: 'num' },
      { k: 'sm', l: 'Mô hình lắng', t: 'sel', opts: [['layered', 'Phân tầng nhiều lớp (Takács–SVI)'], ['svi', 'Lớp bùn đơn theo SVI']] },
      { k: 'nLay', l: 'Số lớp lắng', u: '', t: 'num', show: p => p.sm === 'layered', adv: 1 },
      { k: 'fns', l: 'Phần không lắng được f_ns', u: '-', t: 'num', show: p => p.sm === 'layered', adv: 1 },
      { k: 'SVI', l: 'Chỉ số thể tích bùn SVI', u: 'mL/g', t: 'num' },
      { k: 'TSSe', l: 'TSS nước gạn (khi lớp bùn đủ sâu)', u: 'mg/L', t: 'num', show: p => p.sm === 'svi' },
      { k: 'wasMode', l: 'Cách xả bùn', t: 'sel', opts: [['vol', 'Thể tích cố định mỗi chu kỳ'], ['srt', 'Theo tuổi bùn mục tiêu (SRT tính theo bùn xả)']] }, { k: 'SRTw', l: 'Tuổi bùn mục tiêu (khối bùn / bùn xả)', u: 'd', t: 'num', show: p => p.wasMode === 'srt' },
      { k: 'Vwas', l: 'Bùn xả mỗi bể mỗi chu kỳ (rút đáy khi gạn)', u: 'm³', t: 'num', show: p => p.wasMode !== 'srt' },
      { k: 'mix', l: 'Công suất khuấy (pha thiếu khí)', u: 'W/m³', t: 'num', adv: 1 }
    ],
    def: () => ({ N: 4, A: 500, fPre: 0.15, Hmax: 5.5, Hmin: 4.5, feed: 'cont', mode: 'NDN', tAer: 96, tMix: 72, tS: 60, tD: 60, DOsp: 2, klaMax: 600, SVI: 120, TSSe: 10, Vwas: 7, wasMode: 'vol', SRTw: 20, mix: 4, sm: 'layered', nLay: 15, fns: 0.002 })
  },
  ctech: {
    label: 'C-Tech (SFC)', group: 'Bể sinh học', ins: ['in'], outs: ['eff', 'was'],
    fields: [
      { k: 'N', l: 'Số bể', u: '', t: 'num' },
      { k: 'A', l: 'Diện tích mặt bằng mỗi bể', u: 'm²', t: 'num' },
      { k: 'fSel', l: 'Tỷ lệ diện tích ngăn chọn lọc (selector)', u: '-', t: 'num' },
      { k: 'Hmax', l: 'Mực nước cao TWL', u: 'm', t: 'num' },
      { k: 'Hmin', l: 'Mực nước thấp BWL', u: 'm', t: 'num' },
      { k: 'tF', l: 'Pha nạp (tổng)', u: 'phút', t: 'num' },
      { k: 'tFm', l: 'Trong đó: nạp khuấy không sục khí', u: 'phút', t: 'num' },
      { k: 'tR', l: 'Sục khí sau nạp', u: 'phút', t: 'num' },
      { k: 'tS', l: 'Lắng', u: 'phút', t: 'num' },
      { k: 'tD', l: 'Gạn', u: 'phút', t: 'num' },
      { k: 'tI', l: 'Chờ', u: 'phút', t: 'num', adv: 1 },
      { k: 'rRAS', l: 'Bùn hồi lưu về selector / dòng nạp', u: '-', t: 'num' },
      { k: 'DOsp', l: 'DO đặt khi sục khí', u: 'mg/L', t: 'num' },
      { k: 'klaMax', l: 'kLa tối đa', u: '1/d', t: 'num' },
      { k: 'sm', l: 'Mô hình lắng', t: 'sel', opts: [['layered', 'Phân tầng nhiều lớp (Takács–SVI)'], ['svi', 'Lớp bùn đơn theo SVI']] },
      { k: 'nLay', l: 'Số lớp lắng', u: '', t: 'num', show: p => p.sm === 'layered', adv: 1 },
      { k: 'fns', l: 'Phần không lắng được f_ns', u: '-', t: 'num', show: p => p.sm === 'layered', adv: 1 },
      { k: 'SVI', l: 'Chỉ số thể tích bùn SVI', u: 'mL/g', t: 'num' },
      { k: 'TSSe', l: 'TSS nước gạn (khi lớp bùn đủ sâu)', u: 'mg/L', t: 'num', show: p => p.sm === 'svi' },
      { k: 'wasMode', l: 'Cách xả bùn', t: 'sel', opts: [['vol', 'Thể tích cố định mỗi chu kỳ'], ['srt', 'Theo tuổi bùn mục tiêu (SRT tính theo bùn xả)']] }, { k: 'SRTw', l: 'Tuổi bùn mục tiêu (khối bùn / bùn xả)', u: 'd', t: 'num', show: p => p.wasMode === 'srt' },
      { k: 'Vwas', l: 'Bùn xả mỗi bể mỗi chu kỳ (rút đáy khi gạn)', u: 'm³', t: 'num', show: p => p.wasMode !== 'srt' },
      { k: 'mix', l: 'Công suất khuấy (pha không sục)', u: 'W/m³', t: 'num', adv: 1 }
    ],
    def: () => ({ N: 2, A: 1000, fSel: 0.1, Hmax: 5.5, Hmin: 4.4, tF: 120, tFm: 30, tR: 0, tS: 60, tD: 60, tI: 0, rRAS: 0.2, DOsp: 2, klaMax: 600, SVI: 120, TSSe: 10, Vwas: 12, wasMode: 'vol', SRTw: 20, mix: 4, sm: 'layered', nLay: 15, fns: 0.002 })
  },
  mbr: {
    label: 'Bể màng MBR', group: 'Bể sinh học', ins: ['in'], outs: ['eff', 'und'],
    fields: [
      { k: 'V', l: 'Thể tích', u: 'm³', t: 'num' }, { k: 'H', l: 'Chiều sâu nước', u: 'm', t: 'num' }
    ].concat(AER_FIELDS).concat([
      { k: 'Am', l: 'Diện tích màng', u: 'm²', t: 'num' },
      { k: 'SADm', l: 'Khí sục rửa màng SADm', u: 'Nm³/m²/h', t: 'num' },
      { k: 'soteC', l: 'SOTE khí thô (rửa màng)', u: '%/m', t: 'num' },
      { k: 'uMode', l: 'Dòng tuần hoàn/bùn (retentate)', t: 'sel', opts: [['Q', 'Lưu lượng cố định'], ['rQ', 'Bội số lưu lượng nước vào trạm (×Q)'], ['ratio', 'Phần dòng vào bể màng (0–1)']] },
      { k: 'uQ', l: 'Lưu lượng retentate', u: 'm³/d', t: 'num', show: p => p.uMode === 'Q' },
      { k: 'uK', l: 'Retentate = hệ số × Q vào trạm', u: '×Q', t: 'num', show: p => p.uMode === 'rQ' },
      { k: 'uR', l: 'Phần retentate / dòng vào bể màng', u: '-', t: 'num', show: p => p.uMode === 'ratio' }
    ]),
    def: () => ({ V: 2500, H: 4, aer: 'do', kla: 120, DOsp: 1, klaMax: 600, mix: 5, Am: 40000, SADm: 0.25, soteC: 2, uMode: 'rQ', uK: 4, uR: 0.8 })
  },
  mbbr: {
    label: 'Bể giá thể MBBR/IFAS/MABR', group: 'Bể sinh học', ins: ['in'], outs: ['out'],
    fields: [
      { k: 'V', l: 'Thể tích', u: 'm³', t: 'num' }, { k: 'H', l: 'Chiều sâu nước', u: 'm', t: 'num' },
      { k: 'mabr', l: 'Kiểu màng sinh học', t: 'sel', opts: [['no', 'MBBR/IFAS – giá thể, O₂ khuếch tán từ nước'], ['yes', 'MABR – màng thấm khí, O₂ cấp từ phía màng (màng sinh học ngược chiều)']] },
      { k: 'CO2m', l: 'MABR: nồng độ O₂ tương đương tại mặt màng', u: 'mg/L', t: 'num', show: p => p.mabr === 'yes', hint: () => 'Khí trong màng ≈ 10 – 13 (không khí), 40 – 50 (O₂ tinh khiết)' },
      { k: 'kM', l: 'MABR: hệ số truyền O₂ qua màng', u: 'm/d', t: 'num', show: p => p.mabr === 'yes', hint: () => 'Thông lượng O₂ điển hình 5 – 15 g/m²·ngđ' },
      { k: 'OTEm', l: 'MABR: hiệu suất sử dụng O₂ của khí cấp vào màng', u: '%', t: 'num', show: p => p.mabr === 'yes' }
    ].concat(AER_FIELDS).concat([
      { k: 'fill', l: 'Tỷ lệ nạp giá thể', u: '-', t: 'num' },
      { k: 'SSA', l: 'Diện tích bề mặt hiệu dụng giá thể', u: 'm²/m³', t: 'num' },
      { k: 'Lf', l: 'Bề dày màng sinh học', u: 'µm', t: 'num' },
      { k: 'nLay', l: 'Số lớp màng', u: '', t: 'num', adv: 1 },
      { k: 'Lbl', l: 'Bề dày lớp biên', u: 'µm', t: 'num', adv: 1 },
      { k: 'XfTSS', l: 'Mật độ chất rắn màng', u: 'g TSS/m³', t: 'num', adv: 1 }
    ]),
    def: () => ({ V: 3000, H: 5, mabr: 'no', CO2m: 12, kM: 1.2, OTEm: 40, aer: 'do', kla: 120, DOsp: 3, klaMax: 800, mix: 8, fill: 0.5, SSA: 500, Lf: 200, nLay: 4, Lbl: 40, XfTSS: 30000 })
  },
  clarifier: {
    label: 'Bể lắng thứ cấp (Takács)', group: 'Tách', ins: ['in'], outs: ['eff', 'und'],
    fields: [
      { k: 'A', l: 'Diện tích bề mặt', u: 'm²', t: 'num' },
      { k: 'H', l: 'Chiều sâu', u: 'm', t: 'num' },
      { k: 'nL', l: 'Số lớp', u: '', t: 'num' },
      { k: 'feed', l: 'Lớp cấp nước (từ trên, 1..nL)', u: '', t: 'num' },
      { k: 'uMode', l: 'Dòng đáy (RAS+WAS)', t: 'sel', opts: [['Q', 'Lưu lượng cố định'], ['rQ', 'Bội số lưu lượng nước vào trạm (×Q)'], ['ratio', 'Phần dòng vào bể lắng (0–1)']] },
      { k: 'uQ', l: 'Lưu lượng dòng đáy', u: 'm³/d', t: 'num', show: p => p.uMode === 'Q' },
      { k: 'uK', l: 'Dòng đáy = hệ số × Q vào trạm', u: '×Q', t: 'num', show: p => p.uMode === 'rQ' },
      { k: 'uR', l: 'Phần dòng đáy / dòng vào bể lắng', u: '-', t: 'num', show: p => p.uMode === 'ratio' },
      { k: 'v0max', l: "v₀' – vận tốc lắng tối đa", u: 'm/d', t: 'num', adv: 1 },
      { k: 'v0', l: 'v₀ – vận tốc Vesilind', u: 'm/d', t: 'num', adv: 1 },
      { k: 'rh', l: 'r_h – lắng cản', u: 'm³/g', t: 'num', adv: 1 },
      { k: 'rp', l: 'r_p – hạt khó lắng', u: 'm³/g', t: 'num', adv: 1 },
      { k: 'fns', l: 'f_ns – phần không lắng', u: '-', t: 'num', adv: 1 },
      { k: 'Xt', l: 'X_t – ngưỡng nồng độ', u: 'g/m³', t: 'num', adv: 1 },
      { k: 'vg', l: 'Vận tốc lắng bùn hạt (mô hình bùn hạt)', u: 'm/d', t: 'num', adv: 1 }
    ],
    def: () => ({ A: 1500, H: 4, nL: 10, feed: 5, uMode: 'rQ', uQ: 20000, uK: 1.0, uR: 0.5, v0max: 250, v0: 474, rh: 0.000576, rp: 0.00286, fns: 0.00228, Xt: 3000, vg: 300 })
  },
  psep: {
    label: 'Tách lý tưởng (lắng sơ cấp/nén/tách nước)', group: 'Tách', ins: ['in'], outs: ['ovf', 'und'],
    fields: [
      { k: 'rmode', l: 'Cách tách chất rắn', t: 'sel', opts: [['rem', 'Hiệu suất giữ chất rắn (%)'], ['eTSS', 'TSS nước tràn cố định (bể lắng không thể tích)']] },
      { k: 'rem', l: 'Hiệu suất giữ chất rắn', u: '%', t: 'num', show: p => p.rmode !== 'eTSS' },
      { k: 'eTSS', l: 'TSS nước tràn', u: 'mg/L', t: 'num', show: p => p.rmode === 'eTSS' },
      { k: 'uMode', l: 'Dòng đáy', t: 'sel', opts: [['Q', 'Lưu lượng cố định'], ['ratio', 'Tỷ lệ theo dòng vào']] },
      { k: 'uQ', l: 'Lưu lượng dòng đáy', u: 'm³/d', t: 'num', show: p => p.uMode === 'Q' },
      { k: 'uR', l: 'Tỷ lệ dòng đáy / dòng vào', u: '-', t: 'num', show: p => p.uMode === 'ratio' }
    ],
    def: () => ({ rmode: 'rem', rem: 60, eTSS: 10, uMode: 'ratio', uQ: 100, uR: 0.005 })
  },
  cyclone: {
    label: 'Cyclone tách bùn hạt (densified)', group: 'Tách', ins: ['in'], outs: ['ovf', 'und'],
    fields: [
      { k: 'uMode', l: 'Dòng đáy (giữ lại)', t: 'sel', opts: [['ratio', 'Tỷ lệ theo dòng vào'], ['Q', 'Lưu lượng cố định']] },
      { k: 'uR', l: 'Tỷ lệ dòng đáy / dòng vào', u: '-', t: 'num', show: p => p.uMode === 'ratio' },
      { k: 'uQ', l: 'Lưu lượng dòng đáy', u: 'm³/d', t: 'num', show: p => p.uMode === 'Q' },
      { k: 'rTSS', l: 'Tỷ số nồng độ bông dòng đáy / dòng tràn', u: '-', t: 'num' },
      { k: 'fG', l: 'Hiệu suất giữ hạt vào dòng đáy', u: '%', t: 'num' },
      { k: 'fISS', l: 'Hiệu suất giữ chất rắn vô cơ', u: '%', t: 'num' },
      { k: 'fDes', l: 'Tỷ lệ hạt bị vỡ thành bông', u: '%', t: 'num', adv: 1 }
    ],
    def: () => ({ uMode: 'ratio', uR: 0.2, uQ: 100, rTSS: 2, fG: 80, fISS: 50, fDes: 15 })
  },
  sewer: {
    label: 'Ống cống (tự chảy / áp lực)', group: 'Dòng chảy', ins: ['in'], outs: ['out'],
    fields: [
      { k: 'kind', l: 'Loại', t: 'sel', opts: [['gravity', 'Cống tự chảy (mặt thoáng, thông khí tự nhiên)'], ['pressure', 'Ống áp lực (đầy ống, kỵ khí)']] },
      { k: 'L', l: 'Chiều dài', u: 'm', t: 'num' },
      { k: 'D', l: 'Đường kính trong', u: 'mm', t: 'num' },
      { k: 'S', l: 'Độ dốc', u: '‰', t: 'num', show: p => p.kind !== 'pressure' },
      { k: 'nM', l: 'Hệ số nhám Manning n', u: '-', t: 'num', show: p => p.kind !== 'pressure', adv: 1 },
      { k: 'nSeg', l: 'Số đoạn tính (xấp xỉ dòng đẩy)', u: '', t: 'num', adv: 1 },
      { k: 'aS', l: 'Hệ số tạo sulfua thành ống a', u: 'gS/m²/h', t: 'num', adv: 1 },
      { k: 'fRea', l: 'Hệ số hiệu chỉnh thông khí', u: '-', t: 'num', show: p => p.kind !== 'pressure', adv: 1 }
    ],
    def: () => ({ kind: 'gravity', L: 3000, D: 800, S: 1.5, nM: 0.013, nSeg: 8, aS: 0.0015, fRea: 1 })
  },
  digester: {
    label: 'Bể phân hủy kỵ khí (ADM1)', group: 'Xử lý bùn', ins: ['in'], outs: ['out'],
    fields: [
      { k: 'V', l: 'Thể tích pha lỏng', u: 'm³', t: 'num' },
      { k: 'Vgas', l: 'Thể tích pha khí', u: 'm³', t: 'num' },
      { k: 'T', l: 'Nhiệt độ vận hành', u: '°C', t: 'num' },
      { k: 'mix', l: 'Công suất khuấy', u: 'W/m³', t: 'num', adv: 1 }
    ],
    def: () => ({ V: 4000, Vgas: 400, T: 35, mix: 5 })
  },
  // bể kỵ khí tốc độ cao xử lý nước thải (UASB, EGSB, IC, AF, ABR, AMBR, ACP, ASBR, khuấy trộn): ADM1 với lưu giữ bùn – tuổi bùn SRT ≫ HRT;
  // chất hạt rời bể với tốc độ V·X/SRT, phần fWas rút ra theo dòng bùn dư (lưu lượng Qw), phần còn lại theo nước ra
  anr: {
    label: 'Bể kỵ khí tốc độ cao (UASB/EGSB/IC/AF/ABR… – ADM1)', group: 'Bể sinh học', ins: ['in'], outs: ['out', 'und'],
    plabel: { out: 'nước ra', und: 'bùn dư' },
    fields: [
      { k: 'kind', l: 'Công nghệ', t: 'sel', opts: [['UASB', 'UASB – lớp bùn dòng chảy ngược'], ['EGSB', 'EGSB – lớp bùn hạt giãn nở'], ['IC', 'IC – tuần hoàn nội'], ['AF', 'AF – lọc kỵ khí'], ['ABR', 'ABR – vách ngăn'], ['AMBR', 'AMBR – lớp bùn di chuyển'], ['ACP', 'ACP – tiếp xúc kỵ khí'], ['ASBR', 'ASBR – SBR kỵ khí'], ['CSTR', 'Khuấy trộn hoàn toàn']] },
      { k: 'V', l: 'Thể tích làm việc (tổng các bể)', u: 'm³', t: 'num' },
      { k: 'Vgas', l: 'Thể tích pha khí', u: 'm³', t: 'num' },
      { k: 'T', l: 'Nhiệt độ vận hành', u: '°C', t: 'num' },
      { k: 'SRT', l: 'Tuổi bùn SRT (lưu giữ bùn)', u: 'ngày', t: 'num', hint: () => 'UASB/EGSB/IC ≥ 30–100 ngày; khuấy trộn = HRT' },
      { k: 'Qw', l: 'Lưu lượng bùn dư rút đáy', u: 'm³/d', t: 'num' },
      { k: 'fWas', l: 'Phần bùn sinh ra rút theo dòng bùn dư (còn lại trôi theo nước ra)', u: '%', t: 'num' },
      { k: 'mix', l: 'Công suất khuấy / bơm tuần hoàn', u: 'W/m³', t: 'num', adv: 1 }
    ],
    def: () => ({ kind: 'UASB', V: 1500, Vgas: 150, T: 30, SRT: 60, Qw: 10, fWas: 70, mix: 1 }), geom: { w: 84, h: 78 },
    glyph: (u, w, h) => { const hw = w / 2, hh = h / 2; return `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="4" fill="#ece4d2" stroke="#6b4f1d" stroke-width="1.5"/>
      <rect x="${-hw + 3}" y="${-hh + 14}" width="${w - 6}" height="${h - 17}" fill="url(#gW)"/><rect x="${-hw + 3}" y="${hh - 26}" width="${w - 6}" height="23" fill="#7a5a2c" opacity=".6"/>
      <path d="M${-hw + 8},${-hh + 30} L${-8},${-hh + 20} M${hw - 8},${-hh + 30} L${8},${-hh + 20}" stroke="#4a3412" stroke-width="1.6" fill="none"/>
      <text x="0" y="${-hh + 11}" text-anchor="middle" font-size="9" font-weight="700" fill="#4a3412">${(u.p.kind || 'UASB')} · CH₄</text>`; }
  },
  blower: {
    label: 'Trạm máy thổi khí', group: 'Thiết bị', ins: [], outs: [],
    fields: [
      { k: 'kind', l: 'Loại máy thổi', t: 'sel', opts: [['turbo', 'Turbo (ổ khí/ổ từ)'], ['screw', 'Trục vít'], ['lobe', 'Roots (cánh khế)'], ['multi', 'Ly tâm nhiều cấp']] },
      { k: 'arr', l: 'Bố trí', t: 'sel', opts: [['pool', 'Đường ống chung (các máy cấp chung cho mọi bể)'], ['dedicated', 'Mỗi bể một máy riêng']] },
      { k: 'nDuty', l: 'Số máy làm việc', u: 'máy', t: 'num' },
      { k: 'nStby', l: 'Số máy dự phòng', u: 'máy', t: 'num' },
      { k: 'Qr', l: 'Lưu lượng định mức 1 máy (khí chuẩn 20 °C)', u: 'm³/h', t: 'num' },
      { k: 'Pr', l: 'Áp suất đẩy tối đa', u: 'kPa', t: 'num' },
      { k: 'tdn', l: 'Lưu lượng tối thiểu 1 máy (turndown)', u: '%', t: 'num' },
      { k: 'etaMax', l: 'Hiệu suất tổng (điện → khí) tại điểm định mức', u: '%', t: 'num' },
      { k: 'vfd', l: 'Biến tần', t: 'sel', opts: [['yes', 'Có (điều chỉnh tốc độ)'], ['no', 'Không (chạy định mức, xả bớt khí)']] },
      { k: 'ctl', l: 'Điều khiển áp suất', t: 'sel', opts: [['mov', 'MOV – áp suất trượt theo van mở nhất'], ['pressure', 'Áp suất đường ống cố định'], ['flow', 'Cấp đúng nhu cầu (lý tưởng)']] },
      { k: 'Psp', l: 'Áp suất đặt đường ống', u: 'kPa', t: 'num', show: p => p.ctl === 'pressure' },
      { k: 'dPpipe', l: 'Tổn thất đường ống + đĩa ở lưu lượng tối đa', u: 'kPa', t: 'num' },
      { k: 'Qaux', l: 'Khí phụ trợ cấp từ cùng trạm (lắng cát, điều hòa…)', u: 'm³/h', t: 'num', show: p => p.arr !== 'dedicated' },
      { k: 'doMode', l: 'Giá trị DO đặt', t: 'sel', opts: [['zone', 'Theo từng bể (DO đặt của bể)'], ['common', 'Chung cho mọi vùng']] },
      { k: 'DOsp', l: 'DO đặt chung', u: 'mg/L', t: 'num', show: p => p.doMode === 'common' },
      { k: 'Kp', l: 'Kp vòng DO → khí (theo kLa)', u: '(1/d)/(mg/L)', t: 'num', adv: 1 },
      { k: 'Ti', l: 'Ti vòng DO → khí', u: 'phút', t: 'num', adv: 1 },
      { k: 'price', l: 'Đơn giá điện', u: 'đ/kWh', t: 'num', adv: 1 }
    ],
    def: () => ({ kind: 'turbo', arr: 'pool', nDuty: 2, nStby: 1, Qr: 3000, Pr: 75, tdn: 45, etaMax: 72, vfd: 'yes', ctl: 'mov', Psp: 65, dPpipe: 6, Qaux: 0, doMode: 'zone', DOsp: 2, Kp: 1500, Ti: 15, price: 1900, zones: [] })
  }
};
/* đặc tính máy thổi: suy giảm hiệu suất khi non tải, turndown điển hình */
const BLOWER_KIND = { turbo: { c: 0.55, tdn: 45 }, screw: { c: 0.30, tdn: 25 }, lobe: { c: 0.20, tdn: 30 }, multi: { c: 0.80, tdn: 60 } };
const AER_TYPES = new Set(['cstr', 'mbr', 'mbbr', 'baf', 'sbr', 'iceas', 'ctech']);

/* cơ cấu chấp hành mà bộ điều khiển được phép thay đổi */
const ACTUATORS = {
  cstr: [['kla', 'kLa (1/d)'], ['DOsp', 'DO đặt (mg/L)']],
  mbr: [['kla', 'kLa (1/d)'], ['DOsp', 'DO đặt (mg/L)'], ['uQ', 'Lưu lượng retentate (m³/d)']],
  mbbr: [['kla', 'kLa (1/d)'], ['DOsp', 'DO đặt (mg/L)']],
  sbr: [['DOsp', 'DO đặt (mg/L)'], ['SRTw', 'Tuổi bùn mục tiêu – chế độ xả theo SRT (d)'], ['Vwas', 'Bùn xả mỗi bể mỗi chu kỳ (m³)']],
  iceas: [['DOsp', 'DO đặt (mg/L)'], ['SRTw', 'Tuổi bùn mục tiêu – chế độ xả theo SRT (d)'], ['Vwas', 'Bùn xả mỗi bể mỗi chu kỳ (m³)']],
  ctech: [['DOsp', 'DO đặt (mg/L)'], ['SRTw', 'Tuổi bùn mục tiêu – chế độ xả theo SRT (d)'], ['Vwas', 'Bùn xả mỗi bể mỗi chu kỳ (m³)']],
  blower: [['DOsp', 'DO đặt chung các vùng (mg/L)'], ['Psp', 'Áp suất đặt đường ống (kPa)']],
  splitter: [['Q', 'Lưu lượng nhánh A (m³/d)']],
  clarifier: [['uQ', 'Lưu lượng dòng đáy (m³/d)']],
  psep: [['uQ', 'Lưu lượng dòng đáy (m³/d)']],
  cyclone: [['uQ', 'Lưu lượng dòng đáy (m³/d)']],
  dose: [['mass', 'Liều lượng (kg/d)']]
};

const PLANT_FIELDS = [
  { k: 'T', l: 'Nhiệt độ nước', u: '°C', t: 'num' },
  { k: 'elev', l: 'Cao độ so với mực nước biển', u: 'm', t: 'num' },
  { k: 'csMode', l: 'Nồng độ O₂ bão hòa', t: 'sel', opts: [['calc', 'Tính theo T, cao độ, độ sâu'], ['fixed', 'Giá trị cố định']] },
  { k: 'csFixed', l: 'Cs cố định', u: 'mg/L', t: 'num', show: p => p.csMode === 'fixed' },
  { k: 'beta', l: 'β (hệ số muối)', u: '-', t: 'num' },
  { k: 'de', l: 'dₑ – hệ số độ sâu hiệu dụng', u: '-', t: 'num' },
  { k: 'alpha', l: 'α (hệ số truyền khí)', u: '-', t: 'num' },
  { k: 'F', l: 'F (hệ số bám bẩn đĩa)', u: '-', t: 'num' },
  { k: 'sote', l: 'SOTE theo chiều sâu ngập', u: '%/m', t: 'num' },
  { k: 'eBlow', l: 'Hiệu suất máy thổi khí', u: '-', t: 'num' },
  { k: 'dPloss', l: 'Tổn thất áp đường ống + đĩa', u: 'kPa', t: 'num' },
  { k: 'pCO2', l: 'CO₂ khí quyển', u: 'atm', t: 'num' },
  { k: 'kLaSurf', l: 'Trao đổi CO₂ bề mặt (bể không sục)', u: '1/d', t: 'num' },
  { k: 'kLaSurfO2', l: 'Thông khí O₂ bề mặt bể khuấy trộn (0 = bỏ qua)', u: '1/d', t: 'num' },
  { k: 'ePump', l: 'Năng lượng bơm', u: 'kWh/1000 m³', t: 'num' },
  { k: 'chpEff', l: 'Hiệu suất phát điện CHP từ biogas', u: '-', t: 'num' },
  { k: 'price', l: 'Đơn giá điện', u: 'đ/kWh', t: 'num' },
  { k: 'efGrid', l: 'Hệ số phát thải lưới điện', u: 'kg CO₂/kWh', t: 'num' }
];
const PLANT_DEF = () => ({ T: 20, elev: 0, csMode: 'calc', csFixed: 8, beta: 0.95, de: 0.4, alpha: 0.6, F: 0.9, sote: 6.0, eBlow: 0.7, dPloss: 12, pCO2: 0.00042, kLaSurf: 0.5, kLaSurfO2: 0, ePump: 40, chpEff: 0.38, price: 1900, efGrid: 0.68 });

/* hệ số khuếch tán trong nước (m²/d), theo mã biến */
const DIFF = { SO: 1.8e-4, SO2: 1.8e-4, SNO: 1.6e-4, SNO3: 1.6e-4, SNH: 1.7e-4, SNH4: 1.7e-4, SS: 0.6e-4, SF: 0.6e-4, SA: 1.0e-4, SI: 0.5e-4, SND: 0.6e-4, SALK: 1.0e-4, SN2: 1.7e-4, SPO4: 0.7e-4, STIC: 1.6e-4 };

function cs20(T) { return 14.652 - 0.41022 * T + 0.007991 * T * T - 0.000077774 * T * T * T; }
function pbRatio(elev, T) { return Math.exp(-9.81 * 0.02896 * elev / (8.314 * (T + 273.15))); }
/* min trơn: tránh "rung" Newton ở vùng nén của mô hình Takács (sai lệch ≤ 0,05 %) */
function smin(a, b) { const s = a + b, d = a - b; return 0.5 * (s - Math.sqrt(d * d + 1e-6 * s * s)); }

let TOL_LAYER = 20;   // hệ số nới dung sai cho lớp TSS phân tầng
let TOL_FILM = 4;     // hệ số nới dung sai cho chất hạt trong lớp màng sinh học
const AER_KP = 5000; // bộ điều khiển DO lý tưởng [1/d per mg/L]

/* ---------------------------------------------------------------------------
   Bể phản ứng theo chu kỳ (SBR / ICEAS / C-Tech): cấu hình pha & hình học
   phase: {k, t0, t1, aer, feed, ras, mixed}  (thời gian theo ngày)
   --------------------------------------------------------------------------- */
const CYC = new Set(['sbr', 'iceas', 'ctech']);
const ICEAS_MODES = { NIT: [120, 0, 60, 60], NDN: [96, 72, 60, 60] };
function buildCycle(cu, q) {
  const c = { N: Math.max(1, Math.min(8, Math.round(+q.N || 1))), Vp: 0, rRAS: 0, svi: 0, TSSe: +q.TSSe || 10, Vwas: +q.Vwas || 0, preAer: false, SRTw: q.wasMode === 'srt' ? Math.max(+q.SRTw || 20, 0.5) : 0 };
  const ph = [];
  const add = (k, minutes, f) => { if (minutes > 0) ph.push(Object.assign({ k, d: minutes / 1440 }, f)); };
  if (cu.type === 'sbr') {
    c.H = +q.H || 5; c.Vmax = +q.Vmax; c.Vmin = +q.Vmin; c.A = c.Vmax / Math.max(c.H, 0.5);
    c.feedMode = q.feed === 'cont' ? 'cont' : 'batch';
    const tFa = q.fillAer === '1' ? +q.tF : Math.min(Math.max(+q.tFa || 0, 0), +q.tF);
    add('fill', (+q.tF - tFa) * 60, { feed: 1, mixed: 1 }); add('fillA', tFa * 60, { feed: 1, aer: 1, mixed: 1 });
    add('react', +q.tR * 60, { aer: 1, mixed: 1 }); add('settle', +q.tS * 60, {}); add('decant', +q.tD * 60, {}); add('idle', +q.tI * 60, {});
    c.wasThick = false;
  } else {
    const A = Math.max(+q.A, 1), fz = Math.min(Math.max(cu.type === 'iceas' ? +q.fPre : +q.fSel, 0), 0.5);
    c.H = +q.Hmax; c.A = A * (1 - fz); c.Vmax = c.A * (+q.Hmax); c.Vmin = c.A * (+q.Hmin);
    c.Vp = A * fz * ((+q.Hmax) + (+q.Hmin)) / 2;
    c.svi = Math.max(+q.SVI || 0, 0);
    c.wasThick = true;
    if (cu.type === 'iceas') {
      const t = q.mode === 'custom' ? [+q.tAer, +q.tMix, +q.tS, +q.tD] : (ICEAS_MODES[q.mode] || ICEAS_MODES.NIT);
      if (q.feed === 'batch') {
        // nạp gián đoạn như SBR: mỗi bể nhận toàn bộ dòng vào trong Tc/N, luân phiên; nạp thiếu khí (khuấy) trước rồi nạp sục khí,
        // không nạp trong lắng & gạn → không có dòng tắt qua ngăn tiền phản ứng
        c.feedMode = 'batch';
        const Nf = Math.max(c.N, Math.round(+q._redN || 1));   // hệ rút gọn (1 bể đại diện): thời gian nạp theo số bể của cụm thật
        const Tc = t[0] + t[1] + t[2] + t[3], tf = Math.min(Tc / Nf, t[0] + t[1]);
        const fm = Math.min(t[1], tf), fa = tf - fm;
        add('fill', fm, { feed: 1, mixed: 1 }); add('fillA', fa, { feed: 1, aer: 1, mixed: 1 });
        add('react', t[0] - fa, { aer: 1, mixed: 1 }); add('mix', t[1] - fm, { mixed: 1 }); add('settle', t[2], {}); add('decant', t[3], {});
        if (Tc / Nf > t[0] + t[1] + 1e-9) c.feedWarn = 'nạp gián đoạn: Tc/N > thời gian phản ứng (sục + khuấy) – tăng số bể hoặc dùng bể điều hòa';
      } else {
        c.feedMode = 'cont';
        add('react', t[0], { aer: 1, mixed: 1 }); add('mix', t[1], { mixed: 1 }); add('settle', t[2], {}); add('decant', t[3], {});
      }
    } else {
      c.feedMode = 'batch'; c.rRAS = Math.max(+q.rRAS || 0, 0);
      const tFm = Math.min(Math.max(+q.tFm || 0, 0), +q.tF);
      add('fill', tFm, { feed: 1, ras: 1, mixed: 1 }); add('fillA', +q.tF - tFm, { feed: 1, aer: 1, ras: 1, mixed: 1 });
      add('react', +q.tR || 0, { aer: 1, mixed: 1 });
      add('settle', +q.tS, {}); add('decant', +q.tD, {}); add('idle', +q.tI || 0, {});
    }
  }
  let t0 = 0;
  c.phases = ph.map(x => { const o = Object.assign({}, x, { t0, t1: t0 + x.d }); t0 += x.d; return o; });
  c.Tc = t0;
  c.tFeed = c.phases.filter(x => x.feed).reduce((a, x) => a + x.t1 - x.t0, 0);
  c.redN = Math.max(1, Math.round(+q._redN || 1));   // >1: bể đại diện của cụm redN bể (chỉ dùng khi tìm trạng thái ổn định)
  // xả bùn: SBR – hỗn hợp cuối pha sục khí; ICEAS/C-Tech – rút đáy (cô đặc) trong pha gạn
  if (c.wasThick) {
    const dc = c.phases.find(x => x.k === 'decant');
    c.wasT0 = dc ? dc.t0 : 0; c.wasT1 = dc ? dc.t1 : 0;
  } else {
    const lastAer = [...c.phases].reverse().find(x => x.aer) || c.phases[0];
    c.tWas = Math.min(0.5 / 1440 * 60, lastAer ? lastAer.t1 - lastAer.t0 : 0.01);
    c.wasT1 = lastAer ? lastAer.t1 : c.Tc; c.wasT0 = c.wasT1 - c.tWas;
  }
  c.tWas = c.wasT1 - c.wasT0;
  // mô hình lắng: 'ideal' (SBR – TSS gạn cho trước), 'svi' (lớp bùn đơn theo SVI), 'layered' (phân tầng Takács)
  c.sm = q.sm || (cu.type === 'sbr' ? 'ideal' : 'svi');
  if (cu.type === 'sbr' && c.sm !== 'ideal') c.svi = Math.max(+q.SVI || 120, 1);
  if (c.sm === 'svi' && !(c.svi > 0)) c.sm = 'ideal';
  c.layered = c.sm === 'layered';
  if (c.layered) {
    c.nL = Math.max(4, Math.min(30, Math.round(+q.nLay || 15)));
    const svi = c.svi || 120;
    // tham số Takács: vùng lắng cản quy đổi từ SVI (Daigger 1995): v0 = (15,3 − 0,0615·SVI) m/h, rh = k/1000;
    // vùng nồng độ thấp (hạt mịn) rp = 0,00286 m³/g theo Takács et al. (1991)/BSM1
    c.tk = { v0: Math.max(15.3 - 0.0615 * svi, 0.5) * 24, rh: Math.max((0.426 + 0.00384 * svi - 0.0000543 * svi * svi) / 1000, 2e-5), fns: Math.max(+q.fns || 0.002, 0) };
    c.tk.rp = Math.max(0.00286, 3 * c.tk.rh); c.tk.v0max = c.tk.v0;
    c.kmix = 2000;   // m/d – trao đổi giữa các lớp khi khuấy/sục khí (đồng nhất hóa trong vài phút)
  }
  return c;
}
/* vận tốc lắng vùng (m/d) theo SVI – tương quan Daigger (1995), M&E 5th */
function vsSVI(svi, Xmg) {
  const v0 = Math.max(15.3 - 0.0615 * svi, 0.5), k = 0.426 + 0.00384 * svi - 0.0000543 * svi * svi;
  return v0 * Math.exp(-k * Xmg / 1000) * 24;
}

/* tính khí cấp & công suất từ OTR thực (kg/d) */
function aerCalc(pl, OTR, so, H, soteOverride) {
  if (!(OTR > 0)) return { SOTR: 0, air: 0, Pblow: 0, SOTE: 0 };
  const T = pl.T, sub = Math.max(H - 0.3, 0.5);
  const csStd = 9.09 * (1 + pl.de * H / 10.33);
  const csF = pl.beta * cs20(T) * pbRatio(pl.elev, T) * (1 + pl.de * H / 10.33);
  const drive = Math.max(csF - so, 0.2);
  const SOTR = OTR * csStd / (pl.alpha * pl.F * Math.pow(1.024, T - 20) * drive);
  const SOTE = soteOverride || Math.min(pl.sote * sub / 100, 0.6);
  const air = SOTR * 1000 / (SOTE * 279.4);
  return { SOTR, air, SOTE, Pblow: blowerKW(pl, air, sub) };
}
function blowerKW(pl, air, sub) {
  const w = air * 1.204 / 86400, p1 = 101.325, p2 = p1 + 9.81 * sub + (+pl.dPloss);
  return w * 8.314 * 293.15 / (29.7 * 0.283 * pl.eBlow) * (Math.pow(p2 / p1, 0.283) - 1);
}

/* trạng thái khởi tạo điển hình */
function initVector(m, aer, scale = 1) {
  const x = new Float64Array(m.n), I = m.idx;
  const set = o => { for (const k in o) if (I[k] !== undefined) x[I[k]] = o[k]; };
  if (m.fam === 'ASM1') {
    set({ SI: 30, SS: 5, SO: aer ? 2 : 0, SNO: 5, SNH: 5, SND: 1, SALK: 5, SN2: 15, STIC: 5 });
    set({ XI: 1000 * scale, XS: 100 * scale, XBH: 1500 * scale, XBA: 100 * scale, XP: 300 * scale, XND: 5 * scale, XISS: 300 * scale });
    if (m.nitro) set({ SNO2: 0.5, XNOB: 50 * scale, XAMX: 20 * scale, XCMX: 20 * scale });   // ASM1N: gieo NOB, anammox, comammox để quần thể có thể phát triển
  } else {
    set({ SO2: aer ? 2 : 0, SF: 5, SA: 2, SI: 30, SNH4: 5, SN2: 15, SNO3: 5, SPO4: 3, SALK: 4, STIC: 5 });
    set({ XI: 1000 * scale, XS: 100 * scale, XH: 1500 * scale, XPAO: 300 * scale, XPP: 60 * scale, XPHA: 10 * scale, XAUT: 100 * scale, XMeOH: 0, XMeP: 0, XISS: 300 * scale });
    set({ XE: 600 * scale, XSE: 80 * scale, XSTO: 50 * scale });                                       // ASM2dS: sản phẩm nội sinh; ASM3P: chất dự trữ
    if (m.NO2) set({ SNO2: 0.3, XNOB: 50 * scale, XAMX: 5 * scale });                 // ASM2dS2: gieo NOB, anammox
  }
  // mô hình bùn hạt: gieo 30 % sinh khối/sản phẩm trơ ở dạng hạt để lời giải ổn định không rơi vào nghiệm "không có hạt"
  if (m.gran) for (const [s, g] of m.gran) { x[g] = 0.3 * x[s]; x[s] *= 0.7; }
  return x;
}

/* ---------------------------------------------------------------------------
   Biên dịch dự án → hệ thống mô phỏng
   --------------------------------------------------------------------------- */
function compilePlant(P) {
  const m = MODELS[P.model];
  if (!m) throw new Error('Không có mô hình ' + P.model);
  const pl = Object.assign(PLANT_DEF(), P.plant);
  const p20 = Object.assign({}, m.defaults, P.params[m.id] || {});
  p20.T_ = pl.T;
  const p = paramsAtT(m, p20, pl.T);
  const sto = computeStoich(m, p20);
  const nu = sto.flat, n = m.n, np = m.np;
  const rateFn = m.makeRates();
  const tssF = m.tssFactors(p20);
  const errors = [], warns = [];
  const iSO = m.idx[m.SO], iTIC = m.idx.STIC;
  // khí hòa tan thoát ra (N₂O, NO – mô hình có m.strip): cùng hệ số trao đổi khí với CO₂ (0,89·kLa + kLa bề mặt), áp suất riêng phần khí quyển ≈ 0
  const STRIP = (m.strip || []).map(s => ({ i: m.idx[s.id], cod: s.cod, id: s.id }));
  const nSol = m.solIdx.length, nPart = m.partIdx.length, solIdx = m.solIdx, partIdx = m.partIdx;
  const tssP = Float64Array.from(partIdx.map(i => tssF[i]));
  const isPart = new Uint8Array(n); partIdx.forEach(i => (isPart[i] = 1));
  const Kchem = CHEM.K(pl.T), co2Atm = CHEM.co2sat(pl.T, +pl.pCO2);
  const BIO = new Set(['cstr', 'mbr', 'mbbr', 'baf', 'sbr', 'iceas', 'ctech']);
  // thiết bị mở rộng (js/units_ext.js): tiền xử lý, hóa lý, tách, xử lý bùn, AOP, PFR… – mỗi loại khai báo các hook tính toán
  const XT = typeof UNITX !== 'undefined' ? UNITX : {}, xh = cu => XT[cu.type];
  const X = { m, n, p, p20, pl, nu, np, rateFn, isPart, partIdx, solIdx, tssP, tssF, nSol, nPart, idx: m.idx, sto, comp: sto.comp, errors, warns, iSO, iTIC };

  // ----- đơn vị & liên kết
  const units = P.units.map(u => ({ u, id: u.id, type: u.type, T: UT[u.type], p: Object.assign(UT[u.type].def(), u.p), ins: [], outs: {}, ns: 0, off: 0, ov: {}, _pH: 7 }));
  const byId = {};
  units.forEach(cu => (byId[cu.id] = cu));
  const links = P.links.filter(l => byId[l.from[0]] && byId[l.to[0]]);
  links.forEach((l, i) => {
    const a = byId[l.from[0]], b = byId[l.to[0]];
    if (a.outs[l.from[1]] !== undefined) errors.push('Cửa ra "' + l.from[1] + '" của ' + a.u.name + ' nối nhiều hơn một đường ống');
    a.outs[l.from[1]] = i;
    b.ins.push(i);
  });
  for (const cu of units) {
    for (const o of cu.T.outs) if (cu.outs[o] === undefined) errors.push(cu.u.name + ': cửa ra "' + o + '" chưa được nối');
    if (cu.T.ins.length && !cu.ins.length) errors.push(cu.u.name + ': chưa có dòng vào');
  }
  const L = links.length;
  const val = (cu, k) => (cu.ov[k] !== undefined ? cu.ov[k] : +cu.p[k]);

  // ----- trạm máy thổi khí: gán các vùng (bể) được cấp khí
  const blowers = units.filter(cu => cu.type === 'blower');
  for (const bl of blowers) {
    let ids = Array.isArray(bl.p.zones) ? bl.p.zones.filter(id => byId[id]) : [];
    if (!ids.length) ids = units.filter(cu => AER_TYPES.has(cu.type) && (CYC.has(cu.type) || cu.p.aer !== 'none') && !cu.blower).map(cu => cu.id);
    bl.zoneUnits = [];
    for (const id of ids) {
      const zu = byId[id];
      if (!AER_TYPES.has(zu.type)) { errors.push(bl.u.name + ': ' + zu.u.name + ' không phải bể sục khí'); continue; }
      if (!CYC.has(zu.type) && zu.p.aer === 'none') { warns.push(bl.u.name + ': ' + zu.u.name + ' đang đặt "không sục khí" – bỏ qua'); continue; }
      if (zu.blower) { errors.push(zu.u.name + ' được gán cho hơn một trạm máy thổi'); continue; }
      zu.blower = bl; bl.zoneUnits.push(zu);
    }
    if (!bl.zoneUnits.length) warns.push(bl.u.name + ': chưa có bể nào được cấp khí');
    const nTk = bl.zoneUnits.reduce((a, zu) => a + (CYC.has(zu.type) ? Math.max(1, Math.min(8, Math.round(+zu.p.N || 1))) : 1), 0);
    if (bl.p.arr === 'dedicated' && Math.round(+bl.p.nDuty) < nTk) warns.push(bl.u.name + ': bố trí mỗi bể một máy nhưng số máy làm việc (' + Math.round(+bl.p.nDuty) + ') < số bể được cấp khí (' + nTk + ')');
    if (!(+bl.p.Qr > 0) || !(+bl.p.nDuty >= 1)) errors.push(bl.u.name + ': lưu lượng định mức và số máy làm việc phải > 0');
  }

  // ----- bố trí biến trạng thái & thông số dẫn xuất
  let off = 0, hmaxHint = Infinity, period = 0;
  for (const cu of units) {
    cu.off = off;
    const q = cu.p;
    switch (cu.type) {
      case 'cstr': case 'mbr': cu.ns = n; break;
      case 'sewer': cu.nSeg = Math.max(1, Math.min(30, Math.round(+q.nSeg || 8))); cu.ns = n * cu.nSeg; break;
      case 'digester': case 'anr': cu.ns = ADM.N; break;
      case 'clarifier':
        cu.nL = Math.max(3, Math.round(q.nL));
        cu.feed = Math.min(cu.nL, Math.max(1, Math.round(q.feed))) - 1;
        cu.ns = nSol + cu.nL * nPart; break;
      case 'mbbr': case 'baf':
        cu.nLay = Math.max(1, Math.min(10, Math.round(q.nLay)));
        cu.ns = n * (1 + cu.nLay); break;
      case 'sbr': case 'iceas': case 'ctech': {
        const cy = buildCycle(cu, q);
        Object.assign(cu, cy);
        // biến mỗi bể: vùng chính trộn đều [n], V, (phân tầng: nL lớp TSS), ngăn trước [n]
        cu.nMain = n; cu.iV = n; cu.iL = n + 1;
        cu.iP = n + 1 + (cu.layered ? cu.nL : 0);
        cu.ts = cu.iP + (cu.Vp > 0 ? n : 0);
        cu.ns = cu.N * cu.ts;
        if (!(cu.Tc > 0)) errors.push(cu.u.name + ': tổng thời gian chu kỳ phải > 0');
        if (!cu.phases.some(x => x.k === 'decant')) errors.push(cu.u.name + ': cần có pha gạn (> 0)');
        if (cu.feedWarn) warns.push(cu.u.name + ': ' + cu.feedWarn);
        if (cu.feedMode === 'batch') {
          const tf = cu.phases.filter(x => x.feed).reduce((a, x) => a + x.t1 - x.t0, 0);
          if (tf * cu.N < cu.Tc - 1e-9) warns.push(cu.u.name + ': thời gian nạp × số bể < chu kỳ → có lúc không bể nào nạp, dòng vào được chia đều cho mọi bể');
        }
        if (cu.Vmin >= cu.Vmax) errors.push(cu.u.name + ': mức nước thấp (BWL) phải nhỏ hơn mức nước cao (TWL)');
        hmaxHint = Math.min(hmaxHint, Math.min(...cu.phases.map(x => x.t1 - x.t0)) / 3);
        period = Math.max(period, cu.Tc);
        break;
      }
      case 'blower': {
        let s = 0;
        for (const zu of cu.zoneUnits) { zu.bz = s; s += CYC.has(zu.type) ? Math.max(1, Math.min(8, Math.round(+zu.p.N || 1))) : 1; }
        cu.nz = s; cu.ns = s;   // mỗi vùng (bể) một biến tích phân của vòng PI DO → khí
        break;
      }
      default: cu.ns = xh(cu) && xh(cu).ns ? xh(cu).ns(cu, X) : 0;
    }
    off += cu.ns;
  }
  // ----- bộ điều khiển
  const ctrls = [];
  for (const c of (P.ctrls || [])) {
    if (c.on === false) continue;
    const li = links.findIndex(l => l.id === c.link);
    const au = byId[c.unit];
    const nm = 'Bộ điều khiển "' + (c.name || c.id) + '"';
    const mu = c.src === 'unit' ? byId[c.munit] : null;
    if (c.src === 'unit') {
      if (!mu || !['cstr', 'mbr', 'mbbr', 'sbr', 'iceas', 'ctech'].includes(mu.type)) { errors.push(nm + ': chưa chọn bể sinh học để đo'); continue; }
    } else if (li < 0) { errors.push(nm + ': chưa chọn/không tìm thấy đường ống đo'); continue; }
    if (!au || !(ACTUATORS[au.type] || []).some(a => a[0] === c.act)) { errors.push(nm + ': cơ cấu chấp hành không hợp lệ'); continue; }
    if (au.type === 'splitter' && c.act === 'Q' && au.p.mode !== 'Q') errors.push(nm + ': bộ chia dòng phải ở chế độ "Lưu lượng cố định"');
    if (c.act === 'uQ' && au.p.uMode !== 'Q') errors.push(nm + ': ' + au.u.name + ' phải đặt dòng đáy "Lưu lượng cố định"');
    if (c.act === 'DOsp' && !CYC.has(au.type) && au.type !== 'blower' && au.p.aer !== 'do' && !blowers.some(b => b.zoneUnits.includes(au))) errors.push(nm + ': ' + au.u.name + ' phải ở chế độ "Điều khiển DO"');
    if (c.act === 'kla' && blowers.some(b => b.zoneUnits.includes(au))) errors.push(nm + ': ' + au.u.name + ' đang được trạm máy thổi cấp khí – kLa do vòng DO → khí quyết định, hãy tác động vào DO đặt');
    if (c.act === 'kla' && au.p.aer === 'none') errors.push(nm + ': ' + au.u.name + ' đang không sục khí');
    ctrls.push({ c, li, mu, mtank: c.mtank === undefined || c.mtank === '' ? -1 : +c.mtank, au, off, v: c.v, sp: +c.sp, Kp: +c.Kp, Ti: +c.Ti, Td: +c.Td || 0, u0: +c.u0, umin: +c.umin, umax: +c.umax, tau: Math.max(+c.tau || 1, 0.05) / 1440 });
    off += 3;
  }
  const N = off;

  // ----- nguồn
  for (const cu of units) {
    if (cu.type === 'influent') {
      const s = INF.makeSource(m, p20, cu.u);
      cu.src = s.src; cu.xbase = s.xbase;
      s.warn.forEach(w => warns.push(cu.u.name + ': ' + w));
    } else if (cu.type === 'dose') {
      DOSE.sync(cu.p, units.filter(u => u.type === 'influent').reduce((a, u) => a + (+u.p.Q || 0), 0));
      const q = Math.max(+cu.p.Q || 0, 1e-6);
      const unitX = new Float64Array(n); // nồng độ ứng với 1 kg/d
      const g = 1000 / q;
      if (cu.p.kind === 'carbon') unitX[m.idx[m.RB]] = g;
      else if (cu.p.kind === 'alk') unitX[m.idx[m.ALK]] = g / 50;
      else if (m.fam === 'ASM2d') unitX[m.idx.XMeOH] = g * (cu.p.metal === 'Al' ? 78.0 / 26.98 : 106.87 / 55.85);
      else warns.push(cu.u.name + ': châm kim loại chỉ có tác dụng với ASM2d');
      cu.src = (t, out) => { const mass = Math.max(val(cu, 'mass'), 0); for (let k = 0; k < n; k++) out[k] = unitX[k] * mass; return q; };
    }
  }

  // ----- hệ phương trình lưu lượng: ma trận hằng, vế phải là hàm (t, y)
  const FM = new Float64Array(L * L), rowFn = new Array(L).fill(null);
  let row = 0;
  const sumIn = (cu, r, sgn) => { for (const li of cu.ins) FM[r * L + li] += sgn; };
  // "×Q": bội số lưu lượng nước vào trạm (tổng các nguồn nước thải) – cách quen dùng cho RAS, retentate, tuần hoàn nội (R = 4Q, IR = 3Q)
  const infLinks = units.filter(u => u.type === 'influent').map(u => u.outs.out);
  const sumInf = (r, sgn) => { for (const li of infLinks) FM[r * L + li] += sgn; };
  // "phần dòng vào" tính trên TỔNG dòng vào đơn vị (gồm cả dòng tuần hoàn quay về) nên phải < 1, nếu không dòng còn lại âm
  const fracChk = (cu, f, what) => { if (!(f >= 0 && f < 1)) errors.push(`${cu.u.name}: ${what} theo "phần dòng vào" = ${f} – phải trong khoảng 0–<1 (tính trên tổng dòng vào đơn vị, gồm cả dòng tuần hoàn). Muốn đặt theo bội số lưu lượng (vd ${f}Q) hãy chọn chế độ "Bội số lưu lượng nước vào trạm (×Q)".`); };
  const fixedOrRatio = (cu, und, top) => {
    FM[row * L + und] = 1;
    if (cu.p.uMode === 'Q') rowFn[row] = () => Math.max(val(cu, 'uQ'), 0);
    else if (cu.p.uMode === 'rQ') sumInf(row, -Math.max(+cu.p.uK || 0, 0));
    else { fracChk(cu, +cu.p.uR, 'dòng đáy'); sumIn(cu, row, -(+cu.p.uR)); }
    row++;
    FM[row * L + und] = 1; FM[row * L + top] = 1; sumIn(cu, row, -1); row++;
  };
  // hàng phương trình lưu lượng cho thiết bị mở rộng
  const FRX = {
    pass(cu, r, out) { FM[r * L + out] = 1; sumIn(cu, r, -1); return r + 1; },
    fixed(r, li, fn) { FM[r * L + li] = 1; rowFn[r] = fn; return r + 1; },
    // tách 2 dòng: kind 'ratio' (k × dòng vào), 'Q' (k hoặc hàm), 'dyn' (cu._Qu – theo chất rắn, lặp trong portConcs)
    split(cu, r, und, top, kind, k) {
      FM[r * L + und] = 1;
      if (kind === 'ratio') sumIn(cu, r, -Math.max(+k || 0, 0));
      else if (kind === 'Q') rowFn[r] = typeof k === 'function' ? k : () => Math.max(+k || 0, 0);
      else rowFn[r] = () => Math.max(cu._Qu || 0, 0);
      r++; FM[r * L + und] = 1; FM[r * L + top] = 1; sumIn(cu, r, -1); return r + 1;
    }
  };
  for (const cu of units) {
    const o = cu.outs;
    if (errors.length) break;
    switch (cu.type) {
      case 'influent': case 'dose': FM[row * L + o.out] = 1; rowFn[row] = (t) => cu.src(t, srcBuf, steadyMode); row++; break;
      case 'cstr': case 'mbbr': case 'digester': case 'sewer': FM[row * L + o.out] = 1; sumIn(cu, row, -1); row++; break;
      case 'anr': row = FRX.split(cu, row, o.und, o.out, 'Q', () => Math.max(+cu.p.Qw || 0, 0)); break;
      case 'clarifier': case 'mbr': fixedOrRatio(cu, o.und, o.eff); break;
      case 'psep': case 'cyclone': fixedOrRatio(cu, o.und, o.ovf); break;
      case 'baf': FM[row * L + o.und] = 1; sumIn(cu, row, -Math.min(Math.max(+cu.p.bw || 0, 0), 50) / 100); row++; FM[row * L + o.und] = 1; FM[row * L + o.out] = 1; sumIn(cu, row, -1); row++; break;
      default: if (xh(cu) && xh(cu).rows) row = xh(cu).rows(cu, FRX, row, X); break;
      case 'splitter':
        FM[row * L + o.a] = 1;
        if (cu.p.mode === 'Q') rowFn[row] = () => Math.max(val(cu, 'Q'), 0);
        else if (cu.p.mode === 'rQ') sumInf(row, -Math.max(+cu.p.kQ || 0, 0));
        else { const f = +cu.p.frac; if (!(f >= 0 && f <= 1)) fracChk(cu, f, 'nhánh A'); sumIn(cu, row, -f); }
        row++;
        FM[row * L + o.a] = 1; FM[row * L + o.b] = 1; sumIn(cu, row, -1); row++;
        break;
      case 'sbr': case 'iceas': case 'ctech':
        FM[row * L + o.eff] = 1; rowFn[row] = (t, y) => sbrFlows(cu, t, y).dec; row++;
        FM[row * L + o.was] = 1; rowFn[row] = (t, y) => sbrFlows(cu, t, y).was; row++;
        break;
    }
  }
  if (!errors.length && row !== L) errors.push('Số phương trình lưu lượng (' + row + ') khác số đường ống (' + L + ')');
  if (errors.length) return { errors, warns };
  const FLU = FM.slice(), fpiv = new Int32Array(L);
  if (L) LA.lu(FLU, L, fpiv);
  for (let i = 0; i < L; i++) if (Math.abs(FLU[i * L + i]) < 1e-12) { errors.push('Hệ lưu lượng suy biến – kiểm tra vòng tuần hoàn không có lối ra'); break; }
  if (errors.length) return { errors, warns };

  // ----- thứ tự tính các đơn vị không có thể tích
  const SL = new Set(['splitter', 'psep', 'cyclone']);
  for (const k in XT) if (XT[k].stateless) SL.add(k);
  const stateless = units.filter(cu => SL.has(cu.type));
  const order = [], mark = {};
  const visit = (cu, stack) => {
    if (mark[cu.id] === 2) return;
    if (mark[cu.id] === 1) { errors.push('Vòng lặp đại số giữa các bộ chia dòng/tách (' + stack.map(c => c.u.name).join(' → ') + ') – cần có bể trong vòng'); return; }
    mark[cu.id] = 1;
    for (const li of cu.ins) { const a = byId[links[li].from[0]]; if (SL.has(a.type)) visit(a, stack.concat(a)); }
    mark[cu.id] = 2; order.push(cu);
  };
  stateless.forEach(cu => visit(cu, [cu]));
  if (errors.length) return { errors, warns };

  // ----- thông số dẫn xuất từng đơn vị
  const csOf = H => pl.csMode === 'fixed' ? +pl.csFixed : pl.beta * cs20(pl.T) * pbRatio(pl.elev, pl.T) * (1 + pl.de * H / 10.33);
  const fieldFactor = pl.alpha * pl.F * Math.pow(1.024, pl.T - 20);
  Object.assign(X, { csOf, fieldFactor, units });
  for (const cu of units) {
    const q = cu.p, H = CYC.has(cu.type) ? cu.H : (+q.H || 4);
    if (BIO.has(cu.type)) { cu.Cs = csOf(H); cu.V = CYC.has(cu.type) ? cu.Vmax : Math.max(+q.V || 1, 1e-6); cu.H = H; }
    if (cu.type === 'clarifier') { cu.A = Math.max(+q.A, 1e-6); cu.h = (+q.H) / cu.nL; cu.V = cu.A * (+q.H); }
    if (cu.type === 'sewer') {
      cu.Dm = Math.max(+q.D, 50) / 1000; cu.Lm = Math.max(+q.L, 1); cu.grav = q.kind !== 'pressure';
      cu.slope = Math.max(+q.S, 0.01) / 1000; cu.nM = Math.max(+q.nM || 0.013, 0.005);
      cu.Cs = csOf(0); cu.Afull = Math.PI * cu.Dm * cu.Dm / 4;
      if (!cu.grav && cu.Lm * cu.Afull > 0) cu.V = cu.Lm * cu.Afull;
    }
    if (cu.type === 'cyclone') {
      const I = m.idx;
      cu.isISS = new Uint8Array(n); ['XISS', 'XMeOH', 'XMeP'].forEach(id => { if (I[id] !== undefined) cu.isISS[I[id]] = 1; });
      cu.gOf = new Int32Array(n).fill(-1); if (m.gran) for (const [s, g] of m.gran) cu.gOf[g] = s;   // hạt → bông tương ứng
    }
    if (cu.type === 'digester' || cu.type === 'anr') {
      cu.V = Math.max(+q.V, 1);
      cu.adm = ADM.make(m, p20, q, (P.params && P.params.ADM1) || {});
      if (cu.type === 'anr') { cu._xe = new Float64Array(ADM.N); cu._xw = new Float64Array(ADM.N); }
    }
    if (cu.type === 'mbr') {
      const sub = Math.max(H - 0.3, 0.5);
      cu.scourAir = (+q.SADm) * (+q.Am) * 24;                         // Nm³/d
      const soteC = Math.min((+q.soteC) * sub / 100, 0.3);
      const csStd = 9.09 * (1 + pl.de * H / 10.33);
      cu.klaScour = cu.scourAir * 279.4 * soteC / (csStd * cu.V) * fieldFactor;   // 1/d
    }
    if (xh(cu) && xh(cu).init) xh(cu).init(cu, X);
    // nhiệt độ riêng của bể (vd. dòng phụ SHARON/DEMON 30–35 °C trong nhà máy 20 °C): động học, cân bằng hóa học, O₂ bão hòa
    if (+q.Tloc > 0 && Math.abs(+q.Tloc - pl.T) > 1e-6) {
      cu.Tl = +q.Tloc; cu._pT = paramsAtT(m, p20, cu.Tl); cu._pT.T_ = cu.Tl; cu._K = CHEM.K(cu.Tl);
      if (cu.Cs && pl.csMode !== 'fixed') cu.Cs *= cs20(cu.Tl) * pbRatio(pl.elev, cu.Tl) / (cs20(pl.T) * pbRatio(pl.elev, pl.T));
    }
    if (cu.type === 'mbbr' || cu.type === 'baf') {
      cu.Af = cu.V * (+q.fill) * (+q.SSA);
      cu.dz = (+q.Lf) * 1e-6 / cu.nLay; cu.Vl = Math.max(cu.Af * cu.dz, 1e-9);
      cu.Df = new Float64Array(n); cu.kbl = new Float64Array(n);
      for (const i of solIdx) {
        const Dw = DIFF[m.comps[i].id] || 1e-4, Df = 0.8 * Dw;
        cu.Df[i] = Df; cu.kbl[i] = 1 / ((+q.Lbl) * 1e-6 / Dw + cu.dz / 2 / Df);
      }
      cu.Xf = +q.XfTSS;
      cu.mabr = cu.type === 'mbbr' && q.mabr === 'yes'; cu.kM = Math.max(+q.kM || 0, 0); cu.CO2m = Math.max(+q.CO2m || 0, 0);
      cu.Rl = []; for (let j = 0; j < cu.nLay; j++) cu.Rl.push(new Float64Array(n));
    }
  }

  // ----- bộ đệm
  const Qv = new Float64Array(L);
  const C = []; for (let i = 0; i < L; i++) C.push(new Float64Array(n));
  const cin = new Float64Array(n), xs = new Float64Array(n), r = new Float64Array(np), rr = new Float64Array(n);
  const srcBuf = new Float64Array(n);
  let steadyMode = false, Ycur = null;

  /* ---- SBR: pha & lưu lượng theo thời gian/thể tích ---- */
  function phaseAt(cu, k, t) {
    let tt = (t - k * cu.Tc / cu.N) % cu.Tc; if (tt < 0) tt += cu.Tc;
    for (const ph of cu.phases) if (tt < ph.t1) return { k: ph.k, tt, rem: ph.t1 - tt, dur: ph.t1 - ph.t0, aer: ph.aer, feed: ph.feed, ras: ph.ras, mixed: ph.mixed };
    const ph = cu.phases[cu.phases.length - 1];
    return { k: ph.k, tt, rem: 0, dur: ph.t1 - ph.t0, aer: ph.aer, feed: ph.feed, ras: ph.ras, mixed: ph.mixed };
  }
  /* bể đại diện của cụm redN bể lệch pha Tc/redN (hệ rút gọn): lưu lượng vào theo đúng quy tắc chia dòng của hệ đầy đủ –
     Q/nf cho bể đang nạp (nf = số bể đang ở pha nạp), không bể nào nạp → Q/N cho mọi bể. q = Q/redN (nguồn đã chia N) */
  function redFeed(cu, t, q, ph) {
    const Nn = cu.redN; let nf = 0;
    for (let k = 0; k < Nn; k++) {
      let tt = (t - k * cu.Tc / Nn) % cu.Tc; if (tt < 0) tt += cu.Tc;
      for (const x of cu.phases) if (tt < x.t1) { if (x.feed) nf++; break; }
    }
    if (nf === 0) return q;
    return ph.feed ? q * Nn / nf : 0;
  }
  function sbrFlows(cu, t, y) {
    let dec = 0, was = 0;
    const N = cu.N, mk = () => new Float64Array(N);
    const res = cu._fl || (cu._fl = { dec: 0, was: 0, qd: mk(), qw: mk(), phd: mk(), phw: mk(), hb: mk(), hw: mk(), X: mk(), ph: new Array(N) });
    const Vmin = cu.Vmin, settleT0 = (cu.phases.find(x => x.k === 'settle') || cu.phases.find(x => x.k === 'decant')).t0;
    for (let k = 0; k < N; k++) {
      const ph = phaseAt(cu, k, t); res.ph[k] = ph;
      const b = cu.off + k * cu.ts, V = Math.max(y[b + cu.iV], 1);
      const hw = V / cu.A;
      const settled = !ph.mixed;
      if (cu.layered) {
        // phân tầng: mặt cắt TSS chuẩn hóa theo TSS hỗn hợp; mặt lớp bùn nội suy tại ngưỡng 50 % TSS trung bình
        const nL = cu.nL, prof = cu._prof || (cu._prof = new Float64Array(nL));
        const Xm = tssOf(y, b);
        let s = 0;
        for (let j = 0; j < nL; j++) { prof[j] = Math.max(y[b + cu.iL + j], 0); s += prof[j]; }
        const sc = s > 1e-9 ? Xm * nL / s : 1;
        for (let j = 0; j < nL; j++) prof[j] *= sc;
        const X = Xm, thr = 0.5 * X, dz = hw / nL;
        let hb = 0;
        for (let j = nL - 1; j >= 0; j--) {
          if (prof[j] >= thr) {
            if (j === nL - 1) { hb = hw; break; }
            const a = prof[j], c2 = prof[j + 1];
            hb = (j + 0.5) * dz + (a - thr) / Math.max(a - c2, 1e-9) * dz;
            break;
          }
        }
        let qd = 0, qw = 0;
        if (ph.k === 'decant') qd = Math.max(0, V - Vmin) / Math.max(ph.rem, 0.05 * ph.dur);
        if (ph.tt >= cu.wasT0 && ph.tt < cu.wasT1 && cu.tWas > 0) qw = cu.SRTw > 0 ? X * (V + cu.Vp) / Math.max(val(cu, 'SRTw'), 0.5) * cu.Tc / cu.tWas / Math.max(prof[0], 100) : Math.max(val(cu, 'Vwas'), 0) / cu.tWas;
        res.qd[k] = qd; res.qw[k] = qw;
        res.phd[k] = prof[nL - 1] / Math.max(X, 1e-9); res.phw[k] = prof[0] / Math.max(X, 1e-9);   // nồng độ gạn = lớp mặt, xả/hồi lưu = lớp đáy
        res.hb[k] = Math.min(hb, hw); res.hw[k] = hw; res.X[k] = X;
        dec += qd; was += qw;
        continue;
      }
      const X = tssOf(y, b);
      // lớp bùn: lắng vùng theo SVI (Daigger), giới hạn bởi thể tích bùn nén (khối lượng × SVI)
      let hb = hw;
      if (settled && cu.svi > 0) {
        const tsn = Math.max(ph.tt - settleT0 - 5 / 1440, 0);
        const hcomp = Math.min(hw, X * hw * cu.svi / 1e6);
        hb = Math.min(hw, Math.max(hcomp, cu.H - vsSVI(cu.svi, X) * tsn));
      }
      let phd = Math.min(1, cu.TSSe / Math.max(X, 1e-9)), phw = 1;
      if (cu.svi > 0) {
        const f = Math.min(Math.max((hw - hb) / 0.6, 0), 1);   // khoảng cách lớp bùn – mặt nước (ống gạn hút lớp 0,3 m trên cùng)
        phd = (1 - f) + f * phd;
        if (settled && cu.wasThick) phw = Math.min(Math.max(hw / Math.max(hb, 0.05), 1), Math.max(1, 1.2e6 / cu.svi / Math.max(X, 1)));   // giới hạn nén chung 1,2·10⁶/SVI
      }
      let qd = 0, qw = 0;
      if (ph.k === 'decant') qd = Math.max(0, V - Vmin) / Math.max(ph.rem, 0.05 * ph.dur);
      if (ph.tt >= cu.wasT0 && ph.tt < cu.wasT1 && cu.tWas > 0) qw = cu.SRTw > 0 ? (V + cu.Vp) / Math.max(val(cu, 'SRTw'), 0.5) * cu.Tc / cu.tWas / Math.max(phw, 1e-3) : Math.max(val(cu, 'Vwas'), 0) / cu.tWas;
      res.qd[k] = qd; res.qw[k] = qw; res.phd[k] = phd; res.phw[k] = phw; res.hb[k] = hb; res.hw[k] = hw; res.X[k] = X;
      dec += qd; was += qw;
    }
    res.dec = dec; res.was = was;
    return res;
  }

  function flows(t, y) {
    for (let i = 0; i < L; i++) Qv[i] = rowFn[i] ? rowFn[i](t, y) : 0;
    if (L) LA.solve(FLU, L, fpiv, Qv);
  }
  function mix(cu, out) {
    let q = 0; out.fill(0);
    for (const li of cu.ins) { const qq = Qv[li]; if (qq <= 0) continue; q += qq; const c = C[li]; for (let k = 0; k < n; k++) out[k] += qq * c[k]; }
    if (q > 0) for (let k = 0; k < n; k++) out[k] /= q;
    return q;
  }
  const clLayerTSS = (y, cu, j) => { let s = 0; const b = cu.off + nSol + j * nPart; for (let k = 0; k < nPart; k++) s += tssP[k] * Math.max(y[b + k], 0); return s; };
  // mô hình bùn hạt: phần hạt lắng riêng với vận tốc v_hạt, phần bông theo Takács
  const isGP = new Uint8Array(nPart); if (m.gran) partIdx.forEach((i, k) => { if (m.granIdx.has(i)) isGP[k] = 1; });
  const tssPf = Float64Array.from(tssP, (v, k) => isGP[k] ? 0 : v);
  const clLayerTSSf = (y, cu, j) => { let s = 0; const b = cu.off + nSol + j * nPart; for (let k = 0; k < nPart; k++) s += tssPf[k] * Math.max(y[b + k], 0); return s; };
  const tssOf = (x, o) => { let s = 0; for (let k = 0; k < nPart; k++) s += tssP[k] * Math.max(x[o + partIdx[k]], 0); return s; };

  /* nồng độ các cửa: một lượt; thiết bị tách có dòng đáy theo chất rắn (qdyn) → lặp 4 lượt lưu lượng ↔ nồng độ (xác định theo y) */
  const qOn = cu => xh(cu) && xh(cu).qdyn && !(xh(cu).qdynOff && xh(cu).qdynOff(cu));
  const dynU = units.filter(qOn);
  function portConcs(t, y) {
    for (const cu of dynU) if (!(cu._Qu >= 0)) cu._Qu = 0;   // dùng lại lưu lượng dòng đáy lần trước làm điểm xuất phát
    concPass(t, y);
    for (let it = 0; it < (dynU.length ? 4 : 0); it++) {
      let ch = 0;
      for (const cu of dynU) { const q = mix(cu, cin), nq = Math.max(0, Math.min(xh(cu).qdyn(cu, cin, q, X), 0.98 * q)); ch = Math.max(ch, Math.abs(nq - cu._Qu) / Math.max(q, 1e-9)); cu._Qu = nq; }
      if (ch < 1e-13) break;     // lưu lượng dòng đáy không đổi (vd. song chắn/lắng cát ở đầu dây chuyền) → nồng độ đã đúng, khỏi tính lại
      concPass(t, y);
    }
  }
  // bể kỵ khí tốc độ cao: SRT hiệu dụng ≥ HRT; chia chất hạt rời bể (V·X/SRT) giữa dòng bùn dư (phần fWas) và nước ra
  function anrSRT(cu, q) { return Math.max(+cu.p.SRT || 0, cu.V / Math.max(q, 1e-9)); }
  function anrSplit(cu, xd) {
    const qo = Qv[cu.outs.out], qw = Qv[cu.outs.und], q = qo + qw, R = cu.V / anrSRT(cu, q);
    const fw = qw > 1e-9 ? Math.min(Math.max((+cu.p.fWas || 0) / 100, 0), 1) : 0, ke = qo > 1e-9 ? (1 - fw) * R / qo : 1, kw = qw > 1e-9 ? fw * R / qw : 1;
    cu._xe.set(xd); cu._xw.set(xd);
    for (const k of ADM.partIdx) { cu._xe[k] = xd[k] * ke; cu._xw[k] = xd[k] * kw; }
  }
  function concPass(t, y) {
    flows(t, y);
    for (const cu of units) {
      const o = cu.off;
      switch (cu.type) {
        case 'influent': case 'dose': cu.src(t, C[cu.outs.out], steadyMode); break;
        case 'cstr': { const c = C[cu.outs.out]; for (let k = 0; k < n; k++) c[k] = y[o + k]; break; }
        case 'sewer': { const c = C[cu.outs.out], b = o + (cu.nSeg - 1) * n; for (let k = 0; k < n; k++) c[k] = y[b + k]; break; }
        case 'digester': cu.adm.toAsm(y.subarray(o, o + ADM.N), C[cu.outs.out]); break;
        case 'anr': { const xd = y.subarray(o, o + ADM.N); anrSplit(cu, xd); cu.adm.toAsm(cu._xe, C[cu.outs.out]); cu.adm.toAsm(cu._xw, C[cu.outs.und]); break; }
        case 'mbbr': { const c = C[cu.outs.out]; for (let k = 0; k < n; k++) c[k] = y[o + k]; break; }
        case 'baf': {
          // lọc sinh học BAF / lọc nhỏ giọt: chất rắn giữ lại theo hiệu suất, ra theo nước rửa lọc (dòng 'und')
          const qo = Qv[cu.outs.out], qb = Qv[cu.outs.und], qt = qo + qb, cap = qb > 1e-9 ? Math.min(Math.max(+cu.p.cap / 100, 0), 0.999) : 0;
          const co = C[cu.outs.out], cb = C[cu.outs.und];
          for (let k = 0; k < n; k++) { const v = y[o + k]; if (isPart[k]) { co[k] = qo > 1e-9 ? v * (1 - cap) * qt / qo : 0; cb[k] = qb > 1e-9 ? v * cap * qt / qb : 0; } else { co[k] = v; cb[k] = v; } }
          break;
        }
        default: if (xh(cu) && xh(cu).out) xh(cu).out(cu, y, X); break;
        case 'mbr': {
          const ce = C[cu.outs.eff], cu2 = C[cu.outs.und];
          for (let k = 0; k < n; k++) { cu2[k] = y[o + k]; ce[k] = isPart[k] ? 0 : y[o + k]; }
          break;
        }
        case 'clarifier': {
          const ce = C[cu.outs.eff], cu2 = C[cu.outs.und];
          for (let s = 0; s < nSol; s++) { const v = y[o + s]; ce[solIdx[s]] = v; cu2[solIdx[s]] = v; }
          const bt = o + nSol, bb = o + nSol + (cu.nL - 1) * nPart;
          for (let k = 0; k < nPart; k++) { ce[partIdx[k]] = y[bt + k]; cu2[partIdx[k]] = y[bb + k]; }
          break;
        }
        case 'sbr': case 'iceas': case 'ctech': {
          const fl = cu._fl, ce = C[cu.outs.eff], cw = C[cu.outs.was];
          ce.fill(0); cw.fill(0);
          for (let k = 0; k < cu.N; k++) {
            const b = o + k * cu.ts;
            const pd = fl.phd[k], pw = fl.phw[k];
            const wd = fl.dec > 0 ? fl.qd[k] / fl.dec : (k === 0 ? 1 : 0);
            const ww = fl.was > 0 ? fl.qw[k] / fl.was : (k === 0 ? 1 : 0);
            for (let i = 0; i < n; i++) { const v = y[b + i]; ce[i] += wd * (isPart[i] ? pd * v : v); cw[i] += ww * (isPart[i] ? pw * v : v); }
          }
          break;
        }
      }
    }
    for (const cu of order) {
      const q = mix(cu, cin);
      if (cu.type === 'splitter') { C[cu.outs.a].set(cin); C[cu.outs.b].set(cin); }
      else if (xh(cu)) xh(cu).sep(cu, cin, q, X);
      else if (cu.type === 'cyclone') {
        // cyclone: bông theo tỷ số nồng độ dòng đáy/dòng tràn, hạt & vô cơ theo hiệu suất giữ, một phần hạt vỡ thành bông
        const qu = Qv[cu.outs.und], qo = Qv[cu.outs.ovf], cu_ = C[cu.outs.und], co = C[cu.outs.ovf], pp = cu.p;
        cu_.set(cin); co.set(cin);
        const rr = Math.max(+pp.rTSS || 1, 1), eF = qu > 0 ? qu * rr / (qu * rr + Math.max(qo, 0)) : 0;
        const eG = Math.min(Math.max(+pp.fG / 100, 0), 1), eI = Math.min(Math.max(+pp.fISS / 100, 0), 1), fD = Math.min(Math.max(+pp.fDes / 100, 0), 1);
        const mFloc = cu._mf || (cu._mf = new Float64Array(n)), mU = cu._mu || (cu._mu = new Float64Array(n));
        for (const k of partIdx) mFloc[k] = cin[k] * q;
        mU.fill(0);
        for (const k of partIdx) {
          const s = cu.gOf[k];
          if (s >= 0) { const mg = cin[k] * q; mFloc[s] += fD * mg; mFloc[k] = 0; mU[k] = (1 - fD) * mg * eG; cu_[k] = 0; co[k] = (1 - fD) * mg; }
        }
        for (const k of partIdx) {
          if (cu.gOf[k] >= 0) { const tot = co[k]; cu_[k] = qu > 1e-9 ? mU[k] / qu : 0; co[k] = qo > 1e-9 ? (tot - mU[k]) / qo : 0; continue; }
          const e = cu.isISS[k] ? eI : eF, mk = mFloc[k];
          cu_[k] = qu > 1e-9 ? mk * e / qu : 0; co[k] = qo > 1e-9 ? mk * (1 - e) / qo : 0;
        }
      }
      else {
        const qu = Qv[cu.outs.und], qo = Qv[cu.outs.ovf];
        let R = Math.min(Math.max(+cu.p.rem / 100, 0), 1);
        if (cu.p.rmode === 'eTSS') {          // TSS nước tràn cố định (kiểu bể lắng không thể tích của SUMO)
          let tin = 0; for (const k of partIdx) tin += tssF[k] * Math.max(cin[k], 0);
          R = tin > 1e-9 && q > 1e-9 ? Math.min(Math.max(1 - Math.max(+cu.p.eTSS, 0) * Math.max(qo, 0) / (tin * q), 0), 1) : 0;
        }
        const cu_ = C[cu.outs.und], co = C[cu.outs.ovf];
        cu_.set(cin); co.set(cin);
        for (const k of partIdx) {
          cu_[k] = qu > 1e-9 ? cin[k] * R * q / qu : 0;
          co[k] = qo > 1e-9 ? cin[k] * (1 - R) * q / qo : 0;
        }
      }
    }
  }

  /* ---- thủy lực ống cống: tiết diện ướt theo Manning (tự chảy) hoặc đầy ống (áp lực);
         thông khí bề mặt Parkhurst & Pomeroy (1972): KLa,20 = 0,96(1 + 0,20F²)(s·u)^⅜ / d_m  [1/h] ---- */
  function sewerHyd(cu, Qd) {
    const c = cu._hy || (cu._hy = {});
    if (c.Q === Qd) return c;
    const D = cu.Dm, Qs = Math.max(Qd, 0) / 86400;
    let A, P, W, full = false, yD = 1;
    if (!cu.grav) { A = cu.Afull; P = Math.PI * D; W = 0; full = true; }
    else {
      const geo = th => { const a = D * D / 8 * (th - Math.sin(th)), pp = D * th / 2; return [a, pp, a / Math.max(pp, 1e-9)]; };
      const qOf = th => { const [a, , R] = geo(th); return a * Math.pow(R, 2 / 3) * Math.sqrt(cu.slope) / cu.nM; };
      const thMax = 5.278;
      if (Qs >= qOf(thMax)) { A = cu.Afull; P = Math.PI * D; W = 0.05 * D; full = true; }
      else {
        let lo = 1e-4, hi = thMax;
        for (let k = 0; k < 50; k++) { const mid = 0.5 * (lo + hi); if (qOf(mid) < Qs) lo = mid; else hi = mid; }
        const th = Math.max(0.5 * (lo + hi), 0.05);
        [A, P] = geo(th); W = D * Math.sin(th / 2); yD = (1 - Math.cos(th / 2)) / 2;
      }
    }
    const v = Qs / Math.max(A, 1e-9), dm = W > 0 ? A / W : D;
    let kla = 0;
    if (cu.grav && W > 0) {
      const F2 = v * v / (9.81 * dm);
      kla = 0.96 * (1 + 0.2 * F2) * Math.pow(cu.slope * v, 3 / 8) / dm * 24 * Math.pow(1.024, pl.T - 20) * (+cu.p.fRea || 1);
    }
    Object.assign(c, { Q: Qd, A, P, W, v, dm, kla, full, yD, Vseg: A * cu.Lm / cu.nSeg });
    return c;
  }

  function vs(cu, X, Xmin) {
    const pp = cu.p, d = X - Xmin;
    const v = pp.v0 * (Math.exp(-pp.rh * d) - Math.exp(-pp.rp * d));
    return Math.max(0, Math.min(+pp.v0max, v));
  }
  const klaOf = (cu, so, aerOn = true, kt = 0) => {
    if (!aerOn) return 0;
    if (cu.blower) return cu.blower._z ? cu.blower._z.kla[cu.bz + kt] : 0;
    if (cu.ov.kla !== undefined) return Math.max(cu.ov.kla, 0);
    const a = CYC.has(cu.type) ? 'do' : cu.p.aer;
    if (a === 'kla') return +cu.p.kla;
    if (a === 'do') return Math.min(Math.max((steadyMode ? 20 : 1) * AER_KP * (val(cu, 'DOsp') - so), 0), +cu.p.klaMax);   // trạng thái ổn định: hệ số lớn → DO ≈ giá trị đặt (sai lệch tĩnh < 0,002 mg/L)
    return 0;
  };

  /* ---- trạm máy thổi khí: vòng PI DO → kLa yêu cầu từng vùng, quy ra khí, giới hạn năng lực/turndown, chia lại ---- */
  const fieldF = pl.alpha * pl.F * Math.pow(1.024, pl.T - 20);
  const csStdOf = H => 9.09 * (1 + pl.de * H / 10.33);
  const smax = (a, b) => a + b - smin(a, b);
  function blowerUpdate(bl, y) {
    const nz = bl.nz, Kp = Math.max(+bl.p.Kp || 1500, 1), Ti = Math.max(+bl.p.Ti || 15, 0.1) / 1440;
    const common = bl.p.doMode === 'common', spC = val(bl, 'DOsp');
    if (!bl._z) bl._z = { dem: new Float64Array(nz), raw: new Float64Array(nz), cf: new Float64Array(nz), kla: new Float64Array(nz), e: new Float64Array(nz), on: new Uint8Array(nz), sp: new Float64Array(nz), DO: new Float64Array(nz), air: new Float64Array(nz), H: new Float64Array(nz) };
    const z = bl._z; let D = 0;
    for (const zu of bl.zoneUnits) {
      const cyc = CYC.has(zu.type), nt = cyc ? zu.N : 1;
      for (let k = 0; k < nt; k++) {
        const i = zu.bz + k, b = cyc ? zu.off + k * zu.ts : zu.off;
        const DO = Math.max(y[b + iSO], 0);
        const on = cyc ? !!(zu._fl && zu._fl.ph[k] && zu._fl.ph[k].aer) : true;
        const V = cyc ? Math.max(y[b + zu.iV], 1) : zu.V, H = cyc ? V / zu.A : zu.H;
        const sote = Math.min(pl.sote * Math.max(H - 0.3, 0.5) / 100, 0.6);
        z.cf[i] = csStdOf(H) * V / (279.4 * sote * fieldF);          // Nm³/d khí ứng với kLa = 1 (1/d)
        z.H[i] = H;
        const sp = common ? spC : val(zu, 'DOsp');
        // ổn định: PI không sai lệch tĩnh ≈ P hệ số lớn (đại số, như bộ DO lý tưởng); động: PI thật
        const e = sp - DO, raw = steadyMode ? AER_KP * e : Kp * (e + y[bl.off + i] / Ti);
        z.sp[i] = sp; z.DO[i] = DO; z.on[i] = on ? 1 : 0; z.e[i] = e; z.raw[i] = raw;
        const dem = on ? Math.min(Math.max(raw, 0), +zu.p.klaMax || 600) : 0;
        z.dem[i] = dem; D += dem * z.cf[i];
      }
    }
    const Qr = +bl.p.Qr, aux = bl.p.arr === 'dedicated' ? 0 : Math.max(+bl.p.Qaux || 0, 0) * 24;
    const Qmax = Math.max(Math.max(Math.round(+bl.p.nDuty), 1) * Qr * 24 - aux, 0.02 * Qr * 24);   // năng lực còn cho bể sinh học
    const Qmin = Math.max((+bl.p.tdn || (BLOWER_KIND[bl.p.kind] || BLOWER_KIND.turbo).tdn) / 100 * Qr * 24 - aux, 0);   // khí phụ trợ đã giữ máy trên mức tối thiểu
    let S = 0;
    if (bl.p.arr === 'dedicated') {
      // mỗi bể một máy: giới hạn năng lực & turndown theo từng bể
      const Qb = Qr * 24;
      for (let i = 0; i < nz; i++) {
        const Di = z.dem[i] * z.cf[i];
        let Si = Di > 0 ? smin(Di, Qb) : 0;
        if (Di > 0) Si = smax(Si, Qmin * Math.min(1, Di / (0.05 * Qmin)));
        z.kla[i] = Di > 1e-9 ? z.dem[i] * Si / Di : 0; z.air[i] = Si; S += Si;
      }
    } else {
      S = D > 0 ? smin(D, Qmax) : 0;
      if (D > 0 && Qmin > 0) S = smax(S, Qmin * Math.min(1, D / (0.05 * Qmin)));   // dưới turndown → máy chạy ở mức tối thiểu, dư khí
      const fr = D > 1e-9 ? S / D : 0;
      for (let i = 0; i < nz; i++) { z.kla[i] = z.dem[i] * fr; z.air[i] = z.kla[i] * z.cf[i]; }
    }
    bl._D = D; bl._S = S; bl._Kp = Kp; bl._Qmax = Qmax; bl._Qmin = Qmin;
  }
  /* điện năng máy thổi: nén đoạn nhiệt, hiệu suất giảm khi non tải; không biến tần → chạy định mức */
  function blowerPower(bl, S) {
    const p = bl.p, Qr = +p.Qr, nD = Math.max(Math.round(+p.nDuty), 1), Sh = S / 24;
    const kind = BLOWER_KIND[p.kind] || BLOWER_KIND.turbo;
    let sub = 0;
    for (const zu of bl.zoneUnits) sub = Math.max(sub, (CYC.has(zu.type) ? zu.H : zu.H) - 0.3);
    const pStat = 9.81 * sub, pLoss = (+p.dPpipe) * (0.3 + 0.7 * Math.pow(Sh / (nD * Qr), 2));
    const pNeed = pStat + pLoss + 0.5;
    const pH = p.ctl === 'pressure' ? Math.max(val(bl, 'Psp'), pNeed) : p.ctl === 'mov' ? pNeed + 1.5 : pNeed;
    const n = Sh > 1e-6 ? Math.min(Math.max(Math.ceil(Sh / Qr - 1e-9), 1), nD) : 0;
    const load = n ? Sh / (n * Qr) : 0;
    const kw = (qh, pg, eta) => qh * 1.204 / 3600 * 8.314 * 293.15 / (28.97 * 0.283 * eta) * (Math.pow((101.325 + pg) / 101.325, 0.283) - 1);
    const etaR = (+p.etaMax || 70) / 100;
    const etaAt = ld => p.vfd === 'no' ? etaR : etaR * Math.max(1 - kind.c * Math.pow(1 - Math.min(ld, 1), 2), 0.3);
    if (p.arr === 'dedicated' && bl._z) {
      // mỗi bể một máy, đường ống riêng: áp suất & tải theo từng máy
      let n2 = 0, P2 = 0, Pi = 0, ldS = 0, pMax = 0, pNmax = 0;
      for (let i = 0; i < bl.nz; i++) {
        const qh = bl._z.air[i] / 24; if (!(qh > 1e-6)) continue;
        const ld = qh / Qr, pn = 9.81 * Math.max(bl._z.H[i] - 0.3, 0.5) + (+p.dPpipe) * (0.3 + 0.7 * ld * ld) + 0.5;
        const ph = p.ctl === 'pressure' ? Math.max(val(bl, 'Psp'), pn) : p.ctl === 'mov' ? pn + 1.5 : pn;
        n2++; ldS += ld; pMax = Math.max(pMax, ph); pNmax = Math.max(pNmax, pn);
        P2 += p.vfd === 'no' ? kw(Qr, ph, etaR) : kw(qh, ph, etaAt(ld)); Pi += kw(qh, pn, etaR);
      }
      const ldA = n2 ? ldS / n2 : 0;
      return { n: n2, nD, load: ldA, pStat, pLoss, pNeed: pNmax || pNeed, pH: pMax || pH, eta: etaAt(ldA), P: P2, Pideal: Pi, sub, Qr, Sh };
    }
    let eta = etaR, P;
    if (p.vfd === 'no') { P = n * kw(Qr, pH, etaR); }
    else { eta = etaAt(load); P = n ? n * kw(Sh / n, pH, eta) : 0; }
    const Pideal = Sh > 0 ? kw(Sh, pNeed, etaR) : 0;
    return { n, nD, load, pStat, pLoss, pNeed, pH, eta, P, Pideal, sub, Qr, Sh };
  }

  /* phản ứng sinh học + sục khí + CO2 cho một thể tích khuấy trộn (ghi vào dy[o..]) */
  function bioReact(cu, y, o, dy, kla, kco2, pHstore) {
    for (let k = 0; k < n; k++) { const v = y[o + k]; xs[k] = v > 0 ? v : 0; }
    const pp = cu._pT || p, KK = cu._K || Kchem;
    const pH = CHEM.solve(CHEM.ions(m, xs), KK, cu[pHstore] || 7);
    cu[pHstore] = pH;
    pp.pHcur = pH;
    rateFn(xs, pp, r);
    for (let j = 0; j < np; j++) {
      const rj = r[j]; if (rj === 0) continue;
      const b = j * n;
      for (let k = 0; k < n; k++) { const s = nu[b + k]; if (s !== 0) dy[o + k] += s * rj; }
    }
    if (kla > 0) dy[o + iSO] += kla * (cu.Cs - y[o + iSO]);
    if (kco2 > 0) { dy[o + iTIC] -= kco2 * (xs[iTIC] * CHEM.a0(pH, KK) - co2Atm); for (const s of STRIP) dy[o + s.i] -= kco2 * xs[s.i]; }
    return pH;
  }
  const co2k = (kla) => 0.89 * kla + (+pl.kLaSurf);
  const klSO2 = Math.max(+pl.kLaSurfO2 || 0, 0);   // thông khí bề mặt O₂ của bể khuấy trộn (cộng thêm kLa sục khí; SUMO: kL,sur/h)

  /* ---- bể chu kỳ phân tầng (mô hình lắng nhiều lớp TSS, kiểu Takács/BSM1) ----
     Vùng chính: thành phần trộn đều (phản ứng sinh học theo hỗn hợp) + nL lớp TSS co giãn theo mực nước
     (lớp 0 = đáy … nL−1 = mặt) chỉ dùng cho phân bố chất rắn theo chiều sâu.
     Nước vào (từ ngăn trước/dòng vào) và rút bùn (xả, hồi lưu) ở lớp đáy, gạn ở lớp mặt.
     Thông lượng qua mặt phân cách j/j+1 (hướng lên, g/d): A·[(u − w)·S_upwind − Js + kmix·(Sj − Sj+1)],
     u = (q − qw)/A vận tốc chất lỏng, w = (j+1)/nL·dh/dt vận tốc mặt phân cách,
     Js = smin(lắng lớp trên, khả năng nhận của lớp dưới), vận tốc Takács (tham số từ SVI) có giới hạn nén 1,2·10⁶/SVI.
     Nồng độ hạt của nước gạn/bùn xả/bùn hồi lưu = thành phần hỗn hợp × (S lớp mặt/đáy ÷ S trung bình)
     → bảo toàn khối lượng tuyệt đối; ΣS bám theo TSS hỗn hợp bằng hạng tử hồi phục (phản ứng sinh/mất chất rắn). */
  function layerTransport(cu, b, y, dy, qk, rk, qd, qw, V, ph, Xmean, Cin) {
    const nL = cu.nL, A = cu.A, Vl = V / nL, dVdt = qk - qd - qw, hdot = dVdt / A, u = (qk - qw) / A;
    const iL = b + cu.iL, tk = cu.tk, mixed = !!ph.mixed;
    const S = cu._S || (cu._S = new Float64Array(nL)), Js = cu._Js || (cu._Js = new Float64Array(nL)), F = cu._F || (cu._F = new Float64Array(nL));
    let sm = 0;
    for (let j = 0; j < nL; j++) { S[j] = Math.max(y[iL + j], 0); sm += S[j]; }
    const Sm = sm / nL;
    const Xmin = tk.fns * Xmean, Xc = 1.2e6 / Math.max(cu.svi || 120, 1);
    for (let j = 0; j < nL; j++) {
      if (mixed) { Js[j] = 0; continue; }
      const d = S[j] - Xmin;
      const v = Math.max(0, Math.min(tk.v0max, tk.v0 * (Math.exp(-tk.rh * d) - Math.exp(-tk.rp * d))));
      Js[j] = v * S[j] / (1 + Math.exp((S[j] - Xc) / (0.03 * Xc)));   // giới hạn nén (đóng khi S ≥ Xc)
    }
    for (let j = 0; j < nL; j++) F[j] = 0;
    for (let j = 0; j < nL - 1; j++) {
      const vrel = u - (j + 1) / nL * hdot;
      const Jd = mixed ? 0 : smin(Js[j + 1], Js[j]);
      const f = A * ((vrel > 0 ? vrel * y[iL + j] : vrel * y[iL + j + 1]) - Jd + (mixed ? cu.kmix * (S[j] - S[j + 1]) : 0));
      F[j] -= f; F[j + 1] += f;
    }
    let tin = 0; for (let k2 = 0; k2 < nPart; k2++) tin += tssP[k2] * Cin[partIdx[k2]];
    F[0] += (qk + rk) * tin - (rk + qw) * y[iL];
    F[nL - 1] -= qd * y[iL + nL - 1];
    const krel = 20 * (Xmean - Sm) / Math.max(Sm, 1);            // bám theo TSS hỗn hợp
    for (let j = 0; j < nL; j++) dy[iL + j] = F[j] / Vl - y[iL + j] * (dVdt / nL) / Vl + krel * S[j];
  }
  /* vector nồng độ của vùng chính (trộn đều) */
  function mainMix(cu, y, b, out) { for (let i = 0; i < n; i++) out[i] = y[b + i]; return out; }
  /* mặt cắt TSS theo lớp (chuẩn hóa về TSS hỗn hợp) */
  function profOf(cu, y, b) {
    const Xm = tssOf(y, b); let s = 0; const out = [];
    for (let j = 0; j < cu.nL; j++) { out.push(Math.max(y[b + cu.iL + j], 0)); s += out[j]; }
    const sc = s > 1e-9 ? Xm * cu.nL / s : 1;
    return out.map(v => v * sc);
  }

  /* ---- bộ điều khiển: tính tín hiệu từ trạng thái ---- */
  function ctrlOutputs(y) {
    for (const k of ctrls) {
      const s = y[k.off], I = y[k.off + 1], s2 = y[k.off + 2];
      const e = k.sp - s;
      const Tf = Math.max(k.Td / 10, k.tau);
      const dmeas = k.Td > 0 ? (s - s2) / Tf : 0;
      const raw = k.u0 + k.Kp * (e + (k.Ti > 0 ? I / k.Ti : 0) - k.Td * dmeas);
      const u = Math.min(Math.max(raw, k.umin), k.umax);
      k.e = e; k.raw = raw; k.u = u; k.Tf = Tf;
      k.au.ov[k.c.act] = u;
    }
  }
  const mbuf = new Float64Array(n);
  function measure(k) {
    if (k.mu) {
      const cu = k.mu, y = Ycur; let x;
      if (!y) return 0;
      if (CYC.has(cu.type)) {
        x = mbuf; x.fill(0); let vs = 0;
        for (let kk = 0; kk < cu.N; kk++) {
          if (k.mtank >= 0 && kk !== k.mtank) continue;
          const b = cu.off + kk * cu.ts, V = Math.max(y[b + cu.iV], 1);
          for (let i = 0; i < n; i++) x[i] += V * y[b + i];
          vs += V;
        }
        for (let i = 0; i < n; i++) x[i] /= Math.max(vs, 1e-9);
      } else x = y.subarray(cu.off, cu.off + n);
      if (k.v === 'Q') return 0;
      const ii = m.idx[k.v];
      if (ii !== undefined) return x[ii];
      return m.composites(x, p20, {})[k.v];
    }
    const c = C[k.li];
    if (k.v === 'Q') return Qv[k.li];
    const ii = m.idx[k.v];
    if (ii !== undefined) return c[ii];
    return m.composites(c, p20, {})[k.v];
  }

  Object.assign(X, { Qv, C, cin, xs, mix, tssOf, bioReact, klaOf, co2k, val, Kchem, csStdOf, steady: () => steadyMode,
    initVector: (aer, s) => initVector(m, aer, s), aerCalc: (OTR, so, H, s) => aerCalc(pl, OTR, so, H, s), blowerKW: (air, sub) => blowerKW(pl, air, sub) });
  function f(t, y, dy) {
    Ycur = y;
    if (ctrls.length) ctrlOutputs(y);
    portConcs(t, y);
    for (const bl of blowers) blowerUpdate(bl, y);
    for (const cu of units) {
      const o = cu.off;
      switch (cu.type) {
        case 'cstr': {
          const q = mix(cu, cin), D = q / cu.V;
          for (let k = 0; k < n; k++) dy[o + k] = D * (cin[k] - y[o + k]);
          const kl = klaOf(cu, Math.max(y[o + iSO], 0)) + klSO2;
          bioReact(cu, y, o, dy, kl, co2k(kl), '_pH');
          break;
        }
        case 'sewer': {
          // các đoạn khuấy trộn nối tiếp (xấp xỉ dòng đẩy); phản ứng ASM trong nước thải + thông khí bề mặt (cống tự chảy)
          const q = mix(cu, cin), hy = sewerHyd(cu, q), D = q > 0 ? q / Math.max(hy.Vseg, 1e-6) : 0, kl = hy.kla;
          for (let j = 0; j < cu.nSeg; j++) {
            const b = o + j * n;
            for (let k = 0; k < n; k++) dy[b + k] = D * ((j === 0 ? cin[k] : y[b - n + k]) - y[b + k]);
            bioReact(cu, y, b, dy, kl, 0.89 * kl, '_pH' + j);
          }
          break;
        }
        case 'mbr': {
          const q = mix(cu, cin), qu = Qv[cu.outs.und];
          for (let k = 0; k < n; k++) dy[o + k] = isPart[k] ? (q * cin[k] - qu * y[o + k]) / cu.V : q / cu.V * (cin[k] - y[o + k]);
          const kl = klaOf(cu, Math.max(y[o + iSO], 0)) + cu.klaScour;
          bioReact(cu, y, o, dy, kl, co2k(kl), '_pH');
          break;
        }
        case 'digester': {
          const q = mix(cu, cin);
          cu.adm.deriv(y.subarray(o, o + ADM.N), cin, q, dy.subarray(o, o + ADM.N));
          break;
        }
        case 'anr': {
          // như bể phân hủy nhưng chất hạt rời bể với tốc độ 1/SRT thay cho q/V (lưu giữ bùn)
          const q = mix(cu, cin), xd = y.subarray(o, o + ADM.N), dd = dy.subarray(o, o + ADM.N);
          cu.adm.deriv(xd, cin, q, dd);
          const D = q / cu.V, kx = 1 / anrSRT(cu, q);
          for (const k of ADM.partIdx) dd[k] += (D - kx) * xd[k];
          break;
        }
        case 'mbbr': case 'baf': {
          const q = mix(cu, cin), D = q / cu.V, nl = cu.nLay, Af = cu.Af, Vl = cu.Vl, dz = cu.dz;
          for (let k = 0; k < n; k++) dy[o + k] = D * (cin[k] - y[o + k]);
          const kl = klaOf(cu, Math.max(y[o + iSO], 0));
          bioReact(cu, y, o, dy, kl, co2k(kl), '_pH');
          const pHb = cu._pH;
          // màng sinh học: lớp 0 = sát giá thể, lớp nl-1 = bề mặt
          let Fprev = 0;
          for (let k = o + n; k < o + n * (1 + nl); k++) dy[k] = 0;
          for (let j = 0; j < nl; j++) {
            const b = o + n * (1 + j);
            for (let k = 0; k < n; k++) { const v = y[b + k]; xs[k] = v > 0 ? v : 0; }
            p.pHcur = pHb;
            rateFn(xs, p, r);
            const R = cu.Rl[j]; R.fill(0);
            for (let jj = 0; jj < np; jj++) { const rj = r[jj]; if (rj === 0) continue; const bb = jj * n; for (let k = 0; k < n; k++) { const s = nu[bb + k]; if (s !== 0) R[k] += s * rj; } }
            for (let k = 0; k < n; k++) dy[b + k] += R[k];
            // MABR: O₂ khuếch tán qua màng vào lớp sát màng (lớp 0) – màng sinh học ngược chiều (O₂ từ trong, cơ chất từ ngoài)
            if (j === 0 && cu.mabr) dy[b + iSO] += cu.kM * cu.Af * (cu.CO2m - y[b + iSO]) / Vl;
            // khuếch tán chất hòa tan
            for (const i of solIdx) {
              const cj = y[b + i];
              if (j > 0) dy[b + i] += cu.Df[i] / dz * (y[b - n + i] - cj) / dz;
              if (j < nl - 1) dy[b + i] += cu.Df[i] / dz * (y[b + n + i] - cj) / dz;
              else { const J = cu.kbl[i] * Af * (y[o + i] - cj); dy[b + i] += J / Vl; dy[o + i] -= J / cu.V; }
            }
            // đẩy chất rắn ra ngoài (giữ mật độ màng ≈ XfTSS), bong tróc ở bề mặt
            let tss = 0, P = 0;
            for (let k = 0; k < nPart; k++) { const i = partIdx[k]; tss += tssP[k] * xs[i]; P += tssP[k] * R[i]; }
            const E = P + 2 * (tss - cu.Xf);
            const Fj = Math.max(0, Fprev + E * Vl);                      // g TSS/d ra khỏi lớp j
            const fo = tss > 1e-9 ? Fj / tss : 0;
            for (const i of partIdx) {
              dy[b + i] -= fo * xs[i] / Vl;
              if (j < nl - 1) dy[b + n + i] += fo * xs[i] / Vl;          // sang lớp ngoài (đã cộng trước khi lớp ngoài tính)
              else dy[o + i] += fo * xs[i] / cu.V;                       // bong tróc vào nước
            }
            Fprev = Fj;
          }
          break;
        }
        case 'sbr': case 'iceas': case 'ctech': {
          const q = mix(cu, cin), fl = cu._fl, hasP = cu.Vp > 0;
          let nf = 0;
          if (cu.feedMode === 'batch') for (let k = 0; k < cu.N; k++) if (fl.ph[k].feed) nf++;
          for (let k = 0; k < cu.N; k++) {
            const b = o + k * cu.ts, bp = b + cu.iP, ph = fl.ph[k];
            const V = Math.max(y[b + cu.iV], 1);
            const qk = cu.redN > 1 && cu.feedMode === 'batch' ? redFeed(cu, t, q, ph)
              : (cu.feedMode === 'cont' || nf === 0) ? q / cu.N : (ph.feed ? q / nf : 0);
            const rk = ph.ras ? cu.rRAS * qk : 0;                  // C-Tech: bùn hồi lưu vùng chính → selector
            const qd = fl.qd[k], qw = fl.qw[k], pd = fl.phd[k], pw = fl.phw[k];
            const pr = cu.layered ? pw : 1;                         // bùn hồi lưu rút từ lớp đáy (phân tầng)
            dy[b + cu.iV] = qk - qd - qw;
            for (let i = 0; i < n; i++) {
              const cm = y[b + i], ci = hasP ? y[bp + i] : cin[i];
              let v = (qk + rk) / V * (ci - cm);
              if (isPart[i]) v += (qd * (1 - pd) + qw * (1 - pw) + rk * (1 - pr)) * cm / V;
              dy[b + i] = v;
            }
            if (hasP) for (let i = 0; i < n; i++) dy[bp + i] = (qk * cin[i] + rk * (isPart[i] ? pr : 1) * y[b + i] - (qk + rk) * y[bp + i]) / cu.Vp;
            cu.V = V;
            const kl = klaOf(cu, Math.max(y[b + iSO], 0), !!ph.aer, k);
            bioReact(cu, y, b, dy, kl, co2k(kl), '_pH' + k);
            if (cu.layered) layerTransport(cu, b, y, dy, qk, rk, qd, qw, V, ph, fl.X[k], hasP ? y.subarray(bp, bp + n) : cin);
            if (hasP) bioReact(cu, y, bp, dy, 0, co2k(0), '_pHp' + k);   // ngăn trước: không sục khí
          }
          break;
        }
        case 'clarifier': {
          const q = mix(cu, cin);
          const qe = Qv[cu.outs.eff], qu = Qv[cu.outs.und];
          for (let s = 0; s < nSol; s++) dy[o + s] = q / cu.V * (cin[solIdx[s]] - y[o + s]);
          const nL = cu.nL, fl = cu.feed, A = cu.A, h = cu.h;
          const vup = qe / A, vdn = qu / A;
          let tssIn = 0; for (let k = 0; k < nPart; k++) tssIn += tssPf[k] * cin[partIdx[k]];
          const Xmin = (+cu.p.fns) * tssIn, Xt = +cu.p.Xt, vg = Math.max(+cu.p.vg || 0, 0);
          const X = cu._X || (cu._X = new Float64Array(nL)), Js = cu._J || (cu._J = new Float64Array(nL)), Jt = cu._Jt || (cu._Jt = new Float64Array(nL));
          for (let j = 0; j < nL; j++) { X[j] = clLayerTSSf(y, cu, j); Js[j] = vs(cu, X[j], Xmin) * X[j]; }
          for (let j = 0; j < nL - 1; j++) {
            if (j < fl) Jt[j] = X[j + 1] <= Xt ? Js[j] : smin(Js[j], Js[j + 1]);
            else Jt[j] = smin(Js[j], Js[j + 1]);
          }
          Jt[nL - 1] = 0;
          const b0 = o + nSol;
          for (let j = 0; j < nL; j++) {
            const bj = b0 + j * nPart;
            const fo = X[j] > 1e-12 ? Jt[j] / X[j] : 0;
            const fi = j > 0 && X[j - 1] > 1e-12 ? Jt[j - 1] / X[j - 1] : 0;
            for (let k = 0; k < nPart; k++) {
              const yj = y[bj + k];
              let v;
              if (isGP[k]) {   // hạt: lắng không cản trở, dừng ở lớp đáy
                v = j < nL - 1 ? -vg * Math.max(yj, 0) : 0;
                if (j > 0) v += vg * Math.max(y[bj - nPart + k], 0);
              } else {
                v = -fo * Math.max(yj, 0);
                if (j > 0) v += fi * Math.max(y[bj - nPart + k], 0);
              }
              if (j < fl) v += vup * (y[bj + nPart + k] - yj);
              else if (j === fl) v += q * cin[partIdx[k]] / A - (vup + vdn) * yj;
              else v += vdn * (y[bj - nPart + k] - yj);
              dy[bj + k] = v / h;
            }
          }
          break;
        }
        default: if (xh(cu) && xh(cu).deriv) xh(cu).deriv(cu, t, y, dy, X);
      }
    }
    // bộ điều khiển: cảm biến (trễ bậc 1), tích phân có chống bão hòa, lọc đạo hàm
    for (const k of ctrls) {
      const s = y[k.off], s2 = y[k.off + 2];
      dy[k.off] = (measure(k) - s) / k.tau;
      dy[k.off + 1] = k.Ti > 0 && k.Kp !== 0 ? k.e + (k.u - k.raw) / k.Kp : 0;   // back-calculation (Tt = Ti)
      dy[k.off + 2] = (s - s2) / k.Tf;
    }
    // máy thổi: tích phân vòng DO có chống bão hòa (giới hạn năng lực/turndown/kLa tối đa); vùng không sục khí: giữ nguyên
    for (const bl of blowers) {
      const z = bl._z;
      const Ti = Math.max(+bl.p.Ti || 15, 0.1) / 1440;
      for (let i = 0; i < bl.nz; i++) {
        if (!z.on[i]) { dy[bl.off + i] = 0; continue; }
        // ổn định: tích phân bám theo giá trị cho cùng kLa (chuyển sang mô phỏng động không giật)
        dy[bl.off + i] = steadyMode ? ((z.kla[i] / bl._Kp - z.e[i]) * Ti - y[bl.off + i]) / 0.01 : z.e[i] + (z.kla[i] - z.raw[i]) / bl._Kp;
      }
    }
  }

  /* ---- cấu trúc thưa của Jacobian (tô màu cột) ---- */
  function buildSparsity() {
    const blocks = [];
    const blockOfState = new Int32Array(N).fill(-1);
    const addB = (cu, s, e) => { blocks.push({ cu, s, e }); return blocks.length - 1; };
    for (const cu of units) {
      if (cu.type === 'cstr' || cu.type === 'mbr' || cu.type === 'digester' || cu.type === 'anr' || cu.type === 'mbbr' || cu.type === 'baf' || (xh(cu) && cu.ns > 0)) cu.blocks = [addB(cu, cu.off, cu.off + cu.ns)];
      else if (cu.type === 'sewer') { cu.blocks = []; for (let j = 0; j < cu.nSeg; j++) cu.blocks.push(addB(cu, cu.off + j * n, cu.off + (j + 1) * n)); }
      else if (CYC.has(cu.type)) { cu.blocks = []; for (let k = 0; k < cu.N; k++) cu.blocks.push(addB(cu, cu.off + k * cu.ts, cu.off + (k + 1) * cu.ts)); }
      else if (cu.type === 'clarifier') {
        cu.bSol = addB(cu, cu.off, cu.off + nSol);
        cu.bLay = [];
        for (let j = 0; j < cu.nL; j++) { const s = cu.off + nSol + j * nPart; cu.bLay.push(addB(cu, s, s + nPart)); }
        cu.blocks = [cu.bSol].concat(cu.bLay);
      }
    }
    for (const k of ctrls) k.block = addB(null, k.off, k.off + 3);
    blocks.forEach((b, i) => { for (let s = b.s; s < b.e; s++) blockOfState[s] = i; });
    const portBlocks = new Array(L).fill(null), memo = {};
    const outBlocks = li => {
      if (portBlocks[li]) return portBlocks[li];
      const a = byId[links[li].from[0]], port = links[li].from[1];
      let res = [];
      if (a.type === 'clarifier') res = [a.bSol, port === 'eff' ? a.bLay[0] : a.bLay[a.nL - 1]];
      else if (a.type === 'sewer') res = [a.blocks[a.blocks.length - 1]];
      else if (SL.has(a.type)) res = inBlocks(a);
      else if (a.blocks) res = a.blocks;
      portBlocks[li] = res; return res;
    };
    const inBlocks = cu => {
      if (memo[cu.id]) return memo[cu.id];
      memo[cu.id] = [];
      const s = new Set();
      for (const li of cu.ins) for (const b of outBlocks(li)) s.add(b);
      return (memo[cu.id] = [...s]);
    };
    const affects = blocks.map(() => new Set());
    for (const cu of units) {
      const ib = cu.T.ins.length ? inBlocks(cu) : [];
      if (cu.type === 'clarifier') {
        affects[cu.bSol].add(cu.bSol); ib.forEach(b => affects[b].add(cu.bSol));
        for (let j = 0; j < cu.nL; j++) {
          const rb = cu.bLay[j];
          ib.forEach(b => affects[b].add(rb));
          for (let d = -2; d <= 2; d++) { const jj = j + d; if (jj >= 0 && jj < cu.nL) affects[cu.bLay[jj]].add(rb); }
        }
      } else if (cu.type === 'sewer') {
        ib.forEach(b => affects[b].add(cu.blocks[0]));
        cu.blocks.forEach((rb, j) => { affects[rb].add(rb); if (j + 1 < cu.blocks.length) affects[rb].add(cu.blocks[j + 1]); });
      } else if (cu.blocks) for (const rb of cu.blocks) { affects[rb].add(rb); ib.forEach(b => affects[b].add(rb)); }
    }
    for (const k of ctrls) { affects[k.block].add(k.block); (k.mu ? k.mu.blocks : outBlocks(k.li)).forEach(b => affects[b].add(k.block)); }
    // máy thổi: các vùng cùng một trạm ghép nhau (chia khí khi thiếu/dư năng lực)
    for (const bl of blowers) {
      bl.block = addB(bl, bl.off, bl.off + bl.ns); blockOfState.fill(-1); blocks.forEach((b, i) => { for (let s = b.s; s < b.e; s++) blockOfState[s] = i; });
      const zb = [bl.block]; for (const zu of bl.zoneUnits) (zu.blocks || []).forEach(b => zb.push(b));
      affects.push(new Set());
      for (const a of zb) for (const b of zb) affects[a].add(b);
    }
    // cột "đặc": thể tích SBR (ảnh hưởng lưu lượng) và trạng thái bộ điều khiển
    const dense = new Set();
    for (const cu of units) if (CYC.has(cu.type)) for (let k = 0; k < cu.N; k++) dense.add(cu.off + k * cu.ts + cu.iV);
    for (const k of ctrls) for (let i = 0; i < 3; i++) dense.add(k.off + i);
    for (const cu of units) if (xh(cu)) {
      if (xh(cu).denseIdx) for (const j of xh(cu).denseIdx(cu, X)) dense.add(j);                  // vd. thể tích bể điều hòa (quyết định lưu lượng)
      if (qOn(cu)) for (const b of inBlocks(cu)) for (let s = blocks[b].s; s < blocks[b].e; s++) dense.add(s);   // dòng đáy theo chất rắn
    }
    const all = Int32Array.from({ length: N }, (_, i) => i);
    const colRows = new Array(N);
    for (let j = 0; j < N; j++) {
      if (dense.has(j)) { colRows[j] = all; continue; }
      const rows = [];
      for (const rb of affects[blockOfState[j]]) for (let s = blocks[rb].s; s < blocks[rb].e; s++) rows.push(s);
      colRows[j] = Int32Array.from(rows);
    }
    const groups = [], used = [];
    for (let j = 0; j < N; j++) {
      let placed = false;
      for (let g = 0; g < groups.length && !placed; g++) {
        const u = used[g];
        if (colRows[j].every(rw => !u.has(rw))) { groups[g].push(j); colRows[j].forEach(rw => u.add(rw)); placed = true; }
      }
      if (!placed) { groups.push([j]); used.push(new Set(colRows[j])); }
    }
    return { colRows, groups };
  }
  const sp = N > 0 ? buildSparsity() : { colRows: [], groups: [] };

  // kiểm tra lưu lượng âm tại điều kiện ban đầu
  {
    const y0 = y0Default();
    steadyMode = true;
    if (ctrls.length) ctrlOutputs(y0);
    flows(0, y0);
    steadyMode = false;
    links.forEach((l, i) => {
      if (Qv[i] < -1e-6) errors.push('Lưu lượng âm (' + Qv[i].toFixed(0) + ' m³/d) trên ống ' + byId[l.from[0]].u.name + ' → ' + byId[l.to[0]].u.name +
        ' – kiểm tra lưu lượng cố định/tỷ lệ của bộ chia, dòng đáy: tổng lưu lượng rút ra (tuần hoàn nội, retentate/RAS, xả bùn) lớn hơn dòng đi qua. ' +
        '"Phần dòng vào" tính trên tổng dòng vào đơn vị (gồm cả dòng tuần hoàn); muốn đặt R = 4Q, IR = 3Q… hãy chọn chế độ "Bội số lưu lượng nước vào trạm (×Q)".');
    });
    for (const cu of units) { cu.ov = {}; }
  }

  function y0Default() {
    const y = new Float64Array(N);
    for (const cu of units) {
      const o = cu.off;
      switch (cu.type) {
        case 'cstr': case 'mbr': y.set(initVector(m, cu.p.aer !== 'none', cu.type === 'mbr' ? 3 : 1), o); break;
        case 'sewer': { const v = initVector(m, cu.grav, 0.03); for (let j = 0; j < cu.nSeg; j++) y.set(v, o + j * n); break; }
        case 'digester': case 'anr': y.set(ADM.init(), o); break;
        case 'mbbr': case 'baf': {
          y.set(initVector(m, cu.p.aer !== 'none', 0.5), o);
          // màng: lớp sâu giàu chất trơ (sản phẩm phân hủy), lớp ngoài giàu sinh khối hoạt tính
          const I = m.idx, inert = m.fam === 'ASM1' ? 'XP' : 'XI';
          for (let j = 0; j < cu.nLay; j++) {
            const v = initVector(m, false, 1), w = cu.nLay > 1 ? j / (cu.nLay - 1) : 1;
            const fi = 0.88 - 0.38 * w, fa = (1 - fi) * 0.4;
            const fr = { [m.HET]: 1 - fi - fa, [m.AUT]: fa, [inert]: fi };
            for (const i of partIdx) v[i] = 0;
            let t = 0; for (const k in fr) t += fr[k] * tssF[I[k]];
            for (const k in fr) v[I[k]] = fr[k] * cu.Xf / t;
            y.set(v, o + n * (1 + j));
          }
          break;
        }
        case 'sbr': case 'iceas': case 'ctech': {
          const v = initVector(m, true, 1.3), vp = initVector(m, false, 1.3);
          for (let k = 0; k < cu.N; k++) {
            const b = o + k * cu.ts;
            y.set(v, b);
            if (cu.layered) { const x0 = tssOf(v, 0); for (let j = 0; j < cu.nL; j++) y[b + cu.iL + j] = x0; }
            y[b + cu.iV] = (cu.Vmin + cu.Vmax) / 2;
            if (cu.Vp > 0) y.set(vp, b + cu.iP);
          }
          break;
        }
        case 'clarifier': {
          const v = initVector(m, false);
          solIdx.forEach((k, s) => (y[o + s] = v[k]));
          for (let j = 0; j < cu.nL; j++) {
            const sc = j < cu.feed ? 0.003 : 0.3 + 1.7 * (j - cu.feed) / Math.max(1, cu.nL - 1 - cu.feed);
            partIdx.forEach((k, s) => (y[o + nSol + j * nPart + s] = v[k] * sc));
          }
          break;
        }
        default: if (xh(cu) && xh(cu).y0) xh(cu).y0(cu, y, X);
      }
    }
    for (const bl of blowers) for (let i = 0; i < bl.nz; i++) y[bl.off + i] = 100 * (Math.max(+bl.p.Ti || 15, 0.1) / 1440) / Math.max(+bl.p.Kp || 1500, 1);
    if (ctrls.length) initCtrls(y);
    return y;
  }
  /* khởi tạo trạng thái bộ điều khiển: cảm biến = đo, tích phân sao cho u = giá trị hiện hành */
  function initCtrls(y, us) {
    Ycur = y;
    for (const k of ctrls) { y[k.off] = k.sp; y[k.off + 1] = 0; y[k.off + 2] = k.sp; }
    ctrlOutputs(y);
    portConcs(0, y);
    ctrls.forEach((k, i) => {
      const s = measure(k);
      y[k.off] = s; y[k.off + 2] = s;
      const cur = Math.min(Math.max(us ? us[i] : k.u0, k.umin), k.umax);
      // us cho trước (từ lời giải ổn định): tích phân sao cho u TRUNG BÌNH = us (sai lệch trung bình = 0), không theo giá trị tức thời
      y[k.off + 1] = k.Ti > 0 && k.Kp !== 0 ? (cur - k.u0 - (us ? 0 : k.Kp * (k.sp - s))) / k.Kp * k.Ti : 0;
    });
  }
  /* giá trị đo theo đặc tả bộ điều khiển {src, munit, mtank, link, v} tại (t, y) – dùng cho giải ổn định có bộ điều khiển */
  function measureAt(spec, t, y) {
    const sm = steadyMode; steadyMode = true;
    Ycur = y; portConcs(t, y);
    const k = { mu: spec.src === 'unit' ? byId[spec.munit] : null, mtank: spec.mtank === undefined || spec.mtank === '' ? -1 : +spec.mtank, li: links.findIndex(l => l.id === spec.link), v: spec.v };
    const v = (k.mu || k.li >= 0) ? measure(k) : NaN;
    steadyMode = sm;
    return v;
  }

  /* ---- đánh giá chi tiết để xuất kết quả ---- */
  function detail(t, y) {
    Ycur = y;
    if (ctrls.length) ctrlOutputs(y);
    X.wantRep = true; portConcs(t, y); X.wantRep = false;     // số liệu báo cáo của thiết bị mở rộng chỉ tính khi lập kết quả
    for (const bl of blowers) blowerUpdate(bl, y);
    const Q = Float64Array.from(Qv);
    const Cs = C.map(c => Float64Array.from(c));
    const U = {};
    for (const cu of units) {
      const info = { type: cu.type };
      const o = cu.off;
      if (cu.T.ins.length) {
        info.Qin = mix(cu, cin);
        // không có dòng vào ở thời điểm này (vd. bể chu kỳ ngoài pha gạn/xả bùn): lấy thành phần của đường ống vào
        // thay vì 0 – nồng độ vẫn xác định (chất lượng nước gạn/bùn), chỉ lưu lượng bằng 0
        if (!(info.Qin > 0)) { const li = cu.ins.find(i => C[i]); if (li !== undefined) cin.set(C[li]); }
        info.Cin = Float64Array.from(cin);
      }
      const aerInfo = (x, V, H, kla, Cs, kco2o) => {
        for (let k = 0; k < n; k++) xs[k] = Math.max(x[k], 0);
        const pp = cu._pT || p;
        pp.pHcur = CHEM.pH(m, xs, cu.Tl || pl.T, 7);
        rateFn(xs, pp, r);
        let our = 0; for (let j = 0; j < np; j++) our -= nu[j * n + iSO] * r[j];
        const OTR = kla * (Cs - x[iSO]) * V / 1000;
        const sp = CHEM.speciate(m, xs, pl.T);
        const kco2 = kco2o !== undefined ? kco2o : co2k(kla);
        const co2 = kco2 * (xs[iTIC] * CHEM.a0(sp.pH, Kchem) - co2Atm) * V / 1000; // kmol/d
        for (const s of STRIP) {   // N₂O / NO thoát khí, kg N/d
          const kg = kco2 * xs[s.i] * V / 1000;
          info.gasNs = (info.gasNs || 0) + kg; info.gasCODs = (info.gasCODs || 0) + s.cod * kg; info['g_' + s.id] = (info['g_' + s.id] || 0) + kg;
        }
        return { OUR: our, OTR, kla, pH: sp.pH, spec: sp, CO2: co2, rates: Float64Array.from(r) };
      };
      switch (cu.type) {
        case 'cstr': case 'mbr': case 'mbbr': case 'baf': {
          const x = y.subarray(o, o + n);
          const klc = klaOf(cu, Math.max(x[iSO], 0));
          const kl = klc + (cu.type === 'mbr' ? cu.klaScour : 0) + (cu.type === 'cstr' ? klSO2 : 0);
          Object.assign(info, aerInfo(x, cu.V, cu.H, kl, cu.Cs));
          info.V = cu.V; info.H = cu.H; info.Cs = cu.Cs; info.C = Float64Array.from(x);
          info.HRT = info.Qin > 0 ? cu.V / info.Qin * 24 : Infinity;
          if (cu.blower) {   // khí do trạm máy thổi cấp – điện năng tính ở trạm
            const z = cu.blower._z;
            info.airBl = z.air[cu.bz]; info.DOsp = z.sp[cu.bz];
          }
          if (cu.type === 'mbr') {
            const OTRc = klc * (cu.Cs - x[iSO]) * cu.V / 1000;
            const a = aerCalc(pl, OTRc, Math.max(x[iSO], 0), cu.H);
            info.air = cu.blower ? info.airBl : a.air; info.Pblow = cu.blower ? 0 : a.Pblow;
            info.scourAir = cu.scourAir; info.Pscour = blowerKW(pl, cu.scourAir, Math.max(cu.H - 0.3, 0.5));
            info.air += cu.scourAir; info.Pblow += info.Pscour;
            info.flux = Q[cu.outs.eff] / (+cu.p.Am) * 1000 / 24; // L/m²/h
            info.Pmix = 0;
          } else {
            const a = aerCalc(pl, klSO2 > 0 ? klc * (cu.Cs - x[iSO]) * cu.V / 1000 : info.OTR, Math.max(x[iSO], 0), cu.H);   // khí cấp chỉ cho phần sục khí (không tính O₂ bề mặt)
            info.air = cu.blower ? info.airBl : a.air; info.Pblow = cu.blower ? 0 : a.Pblow; info.SOTE = a.SOTE;
            info.Pmix = cu.p.aer === 'none' ? (+cu.p.mix) * cu.V / 1000 : 0;
          }
          if (cu.type === 'baf') { info.Qbw = Q[cu.outs.und]; info.cap = +cu.p.cap; info.HLR = info.Qin / Math.max(cu.V / Math.max(+cu.p.Hm || 4, 0.5), 1e-6) / 24; }
          if (cu.type === 'mbbr' || cu.type === 'baf') {
            const nl = cu.nLay, lay = [];
            let att = 0;
            for (let j = 0; j < nl; j++) {
              const b = o + n * (1 + j), xl = y.subarray(b, b + n);
              const c = m.composites(xl, p20, {});
              lay.push({ C: Float64Array.from(xl), TSS: c.TSS, DO: xl[iSO], NH4: c.NH4, NOx: c.NOx });
              att += c.TSS * cu.Vl / 1000;
            }
            const surf = o + n * nl;
            const fluxOf = id => { const i = m.idx[id]; return cu.kbl[i] * (y[o + i] - y[surf + i]); }; // g/m²/d vào màng
            info.layers = lay; info.attached = att; info.Af = cu.Af;
            info.SALR_NH = fluxOf(m.NH); info.SALR_O2 = fluxOf(m.SO); info.SALR_NO = fluxOf(m.NO);
            info.SALR_COD = fluxOf(m.RB);
            info.Lf = +cu.p.Lf; info.nLay = nl;
            if (cu.mabr) {
              // O₂ cấp qua màng: tính vào OTR (cân bằng COD), khí cấp theo hiệu suất sử dụng O₂ của màng, máy thổi áp thấp (~3 m cột nước)
              const OTRm = cu.kM * cu.Af * (cu.CO2m - Math.max(y[o + n + iSO], 0)) / 1000, airM = OTRm / (0.2795 * Math.max(+cu.p.OTEm || 40, 1) / 100);
              const kWm = blowerKW(pl, airM, 3);
              Object.assign(info, { mabr: 1, OTRm, airM, PblowM: kWm, JO2m: OTRm * 1000 / Math.max(cu.Af, 1e-9) });
              info.OTR = (info.OTR || 0) + OTRm; info.air = (info.air || 0) + airM; info.Pblow = (info.Pblow || 0) + kWm;
            }
          }
          break;
        }
        case 'sewer': {
          const hy = sewerHyd(cu, info.Qin), hSeg = info.Qin > 0 ? hy.Vseg / info.Qin * 24 : Infinity;   // h mỗi đoạn
          let OTR = 0, CO2 = 0, H2S = 0;
          const segs = [], fT = Math.pow(1.03, pl.T - 20), aS = Math.max(+cu.p.aS || 0, 0), PA = hy.P / Math.max(hy.A, 1e-9);
          for (let j = 0; j < cu.nSeg; j++) {
            const x = y.subarray(o + j * n, o + (j + 1) * n), ai = aerInfo(x, hy.Vseg, hy.dm, hy.kla, cu.Cs, 0.89 * hy.kla), c = m.composites(x, p20, {});
            OTR += ai.OTR; CO2 += ai.CO2;
            // sulfua: tạo trong màng sinh học thành ống khi kỵ khí (Hvitved-Jacobsen), bị oxy hóa nhanh khi có O₂
            if (isFinite(hSeg)) {
              if (c.DO < 0.2 && c.NOx < 0.5) H2S += aS * Math.sqrt(Math.max(c.sCOD - 50, 0)) * fT * PA * hSeg;
              else if (c.DO > 0.5) H2S *= Math.exp(-2 * hSeg);
            }
            segs.push({ x: (j + 0.5) * cu.Lm / cu.nSeg, DO: c.DO, NH4: c.NH4, NOx: c.NOx, sCOD: c.sCOD, COD: c.COD, VFA: c.VFA, pH: ai.pH, H2S });
          }
          Object.assign(info, { V: hy.Vseg * cu.nSeg, HRT: hSeg * cu.nSeg, v: hy.v, yD: hy.yD, full: hy.full, kla: hy.kla, OTR, CO2, H2S, segs, L: cu.Lm, D: cu.Dm * 1000, grav: cu.grav,
            C: Float64Array.from(y.subarray(o + (cu.nSeg - 1) * n, o + cu.nSeg * n)), Pmix: 0, air: 0, Pblow: 0 });
          break;
        }
        case 'cyclone': {
          const cv0 = m.composites(info.Cin, p20, {}), cu0 = m.composites(Cs[cu.outs.und], p20, {}), co0 = m.composites(Cs[cu.outs.ovf], p20, {});
          Object.assign(info, { Qu: Q[cu.outs.und], Qo: Q[cu.outs.ovf], TSSin: cv0.TSS, TSSu: cu0.TSS, TSSo: co0.TSS, Fgin: cv0.Fg, Fgu: cu0.Fg, Fgo: co0.Fg,
            kgU: Q[cu.outs.und] * cu0.TSS / 1000, kgO: Q[cu.outs.ovf] * co0.TSS / 1000 });
          break;
        }
        case 'sbr': case 'iceas': case 'ctech': {
          const fl = sbrFlows(cu, t, y);
          let OTR = 0, air = 0, Pb = 0, Pmix = 0, Vt = 0, CO2 = 0, clrMin = Infinity;
          const tanks = [], Cmix = new Float64Array(n);
          for (let k = 0; k < cu.N; k++) {
            const b = o + k * cu.ts, x = mainMix(cu, y, b, new Float64Array(n)), V = y[b + cu.iV], ph = fl.ph[k];
            const aerOn = !!ph.aer;
            const kl = klaOf(cu, Math.max(x[iSO], 0), aerOn, k);
            const ai = aerInfo(x, V, cu.H, kl, cu.Cs);
            const a = aerCalc(pl, ai.OTR, Math.max(x[iSO], 0), cu.H * V / cu.Vmax);
            OTR += ai.OTR; CO2 += ai.CO2;
            if (cu.blower) air += cu.blower._z.air[cu.bz + k]; else { air += a.air; Pb += a.Pblow; }
            if (!aerOn && ph.mixed) Pmix += (+cu.p.mix) * V / 1000;
            Vt += V; for (let i = 0; i < n; i++) Cmix[i] += V * x[i];
            const tk = { V, phase: ph.k, kla: kl, DO: x[iSO], pH: ai.pH, C: Float64Array.from(x),
              hw: fl.hw[k], hb: fl.hb[k], clr: fl.hw[k] - fl.hb[k], TSSe: fl.phd[k] * fl.X[k], Xwas: fl.phw[k] * fl.X[k] };
            if (cu.layered) tk.prof = profOf(cu, y, b);
            if (cu.Vp > 0) {
              const xp = y.subarray(b + cu.iP, b + cu.iP + n);
              tk.Cpre = Float64Array.from(xp);
              CO2 += aerInfo(xp, cu.Vp, cu.H, 0, cu.Cs).CO2;   // ngăn trước: CO₂ thoát qua mặt thoáng (kLa bề mặt, như phương trình)
              Vt += cu.Vp; for (let i = 0; i < n; i++) Cmix[i] += cu.Vp * xp[i];
              Pmix += (+cu.p.mix) * cu.Vp / 1000;
            }
            if (ph.k === 'decant') clrMin = Math.min(clrMin, tk.clr);
            tanks.push(tk);
          }
          for (let i = 0; i < n; i++) Cmix[i] /= Vt;
          Object.assign(info, { tanks, OTR, air, Pblow: Pb, Pmix, V: Vt, C: Cmix, CO2, Tc: cu.Tc, H: cu.H, clrDecant: isFinite(clrMin) ? [clrMin] : null });
          info.HRT = info.Qin > 0 ? cu.N * (cu.Vmax + cu.Vp) / info.Qin * 24 : Infinity;
          info.pH = CHEM.pH(m, Cmix, pl.T, 7);
          break;
        }
        case 'digester': case 'anr': {
          const xd = y.subarray(o, o + ADM.N), AI = ADM.I;
          const ai = cu.adm.detail(xd, info.Cin, info.Qin);
          Object.assign(info, ai);
          info.xd = Float64Array.from(xd);
          info.C = cu.adm.toAsm(xd, new Float64Array(n));          // dòng ra quy đổi ASM (bể kỵ khí tốc độ cao: hỗn hợp trong bể)
          info.V = cu.V; info.Vgas = +cu.p.Vgas;
          const qo = info.Qin;
          // khí: CH4 (kg COD/d), CO2 (kmol/d), H2; Nm³ ở 0 °C, 1 atm
          info.CH4 = ai.CH4kg / 64 * 22.414; info.H2 = ai.H2kg / 16 * 22.414; info.CO2Nm3 = Math.max(ai.CO2kmol, 0) * 22.414;
          info.biogas = info.CH4 + info.CO2Nm3 + info.H2; info.pCH4 = info.biogas > 0 ? info.CH4 / info.biogas * 100 : 0;
          // các dòng "thoát" khỏi pha lỏng để kiểm tra cân bằng: khí + CH4/H2 hòa tan bị bỏ khi quy đổi + N2
          const dissCOD = qo * (Math.max(xd[AI.Sch4], 0) + Math.max(xd[AI.Sh2], 0)) / 1000;
          info.gasCOD = ai.CH4kg + ai.H2kg + dissCOD - 24 / 14 * ai.N2in;
          info.gasC = ai.CO2kmol + ai.CH4kg / 64 + qo * Math.max(xd[AI.Sch4], 0) / 64 / 1000;
          info.gasN = ai.N2in;
          info.CO2 = 0;
          info.HRT = info.Qin > 0 ? cu.V / info.Qin : Infinity; // ngày
          info.VFAac = Math.max(xd[AI.Sac], 0); info.VFApro = Math.max(xd[AI.Spro], 0);
          info.alkHCO3 = ai.Shco3 * 1000 * 50;                     // mg CaCO3/L
          const ci = m.composites(info.Cin, p20, {}), co = m.composites(info.C, p20, {});
          info.VSSin = ci.VSS; info.VSSout = co.VSS; info.VSSdes = ci.VSS > 0 ? (1 - co.VSS / ci.VSS) * 100 : 0;
          info.Pmix = (+cu.p.mix) * cu.V / 1000;
          info.kWh = info.CH4 * 9.97 * (+pl.chpEff);
          if (cu.type === 'anr') {
            const qe = Q[cu.outs.out], qw = Q[cu.outs.und], ce = m.composites(C[cu.outs.out], p20, {}), cw = m.composites(C[cu.outs.und], p20, {});
            const cin = m.composites(info.Cin, p20, {}), cr = m.composites(info.C, p20, {});
            info.C = Float64Array.from(C[cu.outs.out]);             // chất lượng nước ra của bể (cho thẻ kết quả)
            Object.assign(info, { SRT: anrSRT(cu, qo), HRTh: info.HRT * 24, OLR: qo * cin.COD / 1000 / cu.V, CODin: cin.COD, CODout: ce.COD, sCODout: ce.sCOD,
              Eff: cin.COD > 0 ? (1 - qe * ce.COD / Math.max(qo * cin.COD, 1e-9)) * 100 : 0, TSSe: ce.TSS, Xbed: cr.TSS, Qw: qw, Mw: qw * cw.TSS / 1000, Cw: cw.TSS / 1e4,
              yCH4: qo * cin.COD > 0 ? info.CH4 / ((qo * cin.COD - qe * ce.COD - qw * cw.COD) / 1000) : 0 });
          }
          break;
        }
        case 'blower': {
          const auxD = cu.p.arr === 'dedicated' ? 0 : Math.max(+cu.p.Qaux || 0, 0) * 24;
          const z = cu._z, bp = blowerPower(cu, cu._S + auxD);
          const OTRz = new Float64Array(cu.nz);
          for (const zu of cu.zoneUnits) {
            const cyc = CYC.has(zu.type), nt = cyc ? zu.N : 1;
            for (let k = 0; k < nt; k++) { const i = zu.bz + k, b = cyc ? zu.off + k * zu.ts : zu.off; OTRz[i] = z.kla[i] * (zu.Cs - Math.max(y[b + iSO], 0)) * (cyc ? Math.max(y[b + zu.iV], 1) : zu.V) / 1000; }
          }
          let OTRt = 0; for (let i = 0; i < cu.nz; i++) OTRt += OTRz[i];
          Object.assign(info, {
            air: 0, airTot: cu._S, airAux: auxD, airDem: cu._D, Qmax: cu._Qmax, Qmin: cu._Qmin, nRun: bp.n, nDuty: bp.nD, load: bp.load * 100,
            pNeed: bp.pNeed, pHead: bp.pH, pStat: bp.pStat, pLoss: bp.pLoss, eta: bp.eta * 100, Pblow: bp.P, Pideal: bp.Pideal,
            short: (cu.p.arr === 'dedicated' ? Array.from(z.dem).some((d, i) => d * z.cf[i] > (+cu.p.Qr) * 24 * 1.002) : cu._D > cu._Qmax * 1.002) ? 1 : 0, excess: cu._S > cu._D * 1.002 ? 1 : 0, overP: bp.pH > (+cu.p.Pr) ? 1 : 0,
            OTR: OTRt, kWhkgO2: OTRt > 0 ? bp.P * 24 / OTRt : 0,
            zAir: Float64Array.from(z.air), zDem: Float64Array.from(z.dem.map((d, i) => d * z.cf[i])), zDO: Float64Array.from(z.DO), zSp: Float64Array.from(z.sp),
            zKla: Float64Array.from(z.kla), zOn: Float64Array.from(z.on), zOTR: OTRz,
            zones: cu.zoneUnits.map(zu => ({ id: zu.id, name: zu.u.name, bz: zu.bz, nt: CYC.has(zu.type) ? zu.N : 1 }))
          });
          break;
        }
        case 'clarifier': {
          info.layers = [];
          for (let j = 0; j < cu.nL; j++) info.layers.push(clLayerTSS(y, cu, j));
          info.A = cu.A; info.SOR = Q[cu.outs.eff] / cu.A; info.V = cu.V;
          let tssIn = 0; for (let k = 0; k < nPart; k++) tssIn += tssP[k] * info.Cin[partIdx[k]];
          info.SLR = info.Qin * tssIn / 1000 / cu.A / 24;
          info.TSSin = tssIn;
          let mass = 0; for (let j = 0; j < cu.nL; j++) mass += info.layers[j] * cu.A * cu.h / 1000;
          info.mass = mass;
          break;
        }
      }
      if (xh(cu) && !['cstr', 'mbr', 'mbbr', 'baf', 'clarifier'].includes(cu.type)) { X.aerInfo = aerInfo; X.Q = Q; if (xh(cu).info) xh(cu).info(cu, y, info, X); else if (cu._rep) Object.assign(info, cu._rep); }
      U[cu.id] = info;
    }
    const CT = {};
    for (const k of ctrls) CT[k.c.id] = { meas: y[k.off], u: k.u, sp: k.sp, e: k.e, raw: measure(k) };
    return { t, Q, C: Cs, U, CT };
  }

  /* thời điểm gián đoạn kế tiếp (chuyển pha SBR) để bộ giải dừng đúng điểm */
  const brk = [];
  for (const cu of units) if (CYC.has(cu.type)) {
    const pts = new Set();
    // hệ rút gọn: thêm điểm chuyển pha của các bể "ảo" lệch pha (số bể đang nạp đổi → lưu lượng vào bể đại diện nhảy bậc)
    const Nb = Math.max(cu.N, cu.redN || 1);
    for (let k = 0; k < Nb; k++) {
      const o = k * cu.Tc / Nb;
      for (const ph of cu.phases) { pts.add(((o + ph.t0) % cu.Tc + cu.Tc) % cu.Tc); }
      pts.add(((o + cu.wasT0) % cu.Tc + cu.Tc) % cu.Tc); pts.add(((o + cu.wasT1) % cu.Tc + cu.Tc) % cu.Tc);
    }
    brk.push({ Tc: cu.Tc, pts: [...pts].sort((a, b) => a - b) });
  }
  function nextBreak(t) {
    let best = Infinity;
    for (const b of brk) {
      const base = Math.floor(t / b.Tc) * b.Tc;
      let cand = base + b.Tc + b.pts[0];
      for (const q of b.pts) if (base + q > t + 1e-10) { cand = base + q; break; }
      best = Math.min(best, cand);
    }
    return best;
  }

  // dung sai tích phân nới cho các lớp TSS (chỉ định hình phân bố chất rắn, được trộn lại mỗi chu kỳ)
  let tolScale = null;
  for (const cu of units) if (cu.layered) {
    tolScale = tolScale || new Float64Array(N).fill(1);
    for (let k = 0; k < cu.N; k++) for (let j = 0; j < cu.nL; j++) tolScale[cu.off + k * cu.ts + cu.iL + j] = TOL_LAYER;
  }
  // chất hạt trong các lớp màng sinh học (MBBR/IFAS/BAF): lớp sát giá thể gần như không tăng trưởng thực nên thành phần
  // (XP, XS trơ…) đổi mới với hằng số thời gian 10³–10⁴ ngày, không ảnh hưởng nước ra → nới dung sai
  for (const cu of units) if ((cu.type === 'mbbr' || cu.type === 'baf') && cu.nLay > 0) {
    tolScale = tolScale || new Float64Array(N).fill(1);
    for (let j = 0; j < cu.nLay; j++) for (const i of partIdx) tolScale[cu.off + n * (1 + j) + i] = TOL_FILM;
  }
  // tích phân vòng DO của máy thổi: biến nhanh, dao động theo chu kỳ → loại khỏi ngoại suy trạng thái tuần hoàn
  for (const bl of blowers) if (period > 0) {
    tolScale = tolScale || new Float64Array(N).fill(1);
    for (let i = 0; i < bl.ns; i++) tolScale[bl.off + i] = TOL_LAYER;
  }

  /* tổng khối lượng TSS trong các bể sinh học (đại lượng của mode chậm – dùng cho ngoại suy trạng thái tuần hoàn) */
  function slowMass(y) {
    let s = 0;
    for (const cu of units) {
      if (CYC.has(cu.type)) for (let k = 0; k < cu.N; k++) { const b = cu.off + k * cu.ts; s += tssOf(y, b) * Math.max(y[b + cu.iV], 0) + (cu.Vp > 0 ? tssOf(y, b + cu.iP) * cu.Vp : 0); }
      else if (cu.type === 'cstr' || cu.type === 'mbr' || cu.type === 'mbbr' || cu.type === 'baf') s += tssOf(y, cu.off) * cu.V;
    }
    return s;
  }

  return {
    nextBreak: brk.length ? nextBreak : null, tolScale, slowMass,
    errors, warns, m, p, p20, pl, sto, units, byId, links, ctrls, n: N, nc: n,
    f, detail, y0Default, tssF, measureAt,
    initCtrlsAt(y, us) { if (ctrls.length) initCtrls(y, us); return y; },
    colGroups: sp.groups, colRows: sp.colRows,
    hmax: isFinite(hmaxHint) ? hmaxHint : undefined, period,
    setSteady(v) { steadyMode = v; },
    layoutSig: units.map(cu => cu.id + ':' + cu.type + ':' + cu.ns).join('|') + '|C' + ctrls.length + '|' + m.id
  };
}

/* trung bình theo thời gian (quy tắc hình thang trên các bước tích phân) – dùng cho chu kỳ SBR.
   Q: trung bình thời gian; nồng độ: trung bình theo lưu lượng; biến khác: trung bình thời gian. */
function averageDet(snaps, times) {
  const nS = snaps.length, d0 = snaps[0];
  const tw = new Float64Array(nS);
  if (times && nS > 1) {
    for (let i = 0; i < nS; i++) tw[i] = ((i < nS - 1 ? times[i + 1] : times[i]) - (i > 0 ? times[i - 1] : times[i])) / 2;
  } else tw.fill(1);
  const avgArr = (get, w) => {
    const a = new Float64Array(get(d0).length); let ws = 0;
    snaps.forEach((d, j) => { const wt = tw[j] * (w ? w(d) : 1); ws += wt; const v = get(d); for (let i = 0; i < a.length; i++) a[i] += wt * v[i]; });
    if (ws > 0) for (let i = 0; i < a.length; i++) a[i] /= ws; else a.set(get(d0));
    return a;
  };
  const avgNum = get => { let s = 0, ws = 0; snaps.forEach((d, j) => { s += tw[j] * (get(d) || 0); ws += tw[j]; }); return ws > 0 ? s / ws : 0; };
  const Q = avgArr(d => d.Q);
  const C = d0.C.map((_, li) => avgArr(d => d.C[li], d => d.Q[li]));
  const U = {};
  for (const id in d0.U) {
    const o = {};
    for (const k in d0.U[id]) {
      const v = d0.U[id][k];
      if (typeof v === 'number') o[k] = avgNum(d => d.U[id][k]);
      else if (v instanceof Float64Array) o[k] = k === 'Cin' ? avgArr(d => d.U[id][k], d => d.U[id].Qin || 0) : avgArr(d => d.U[id][k]);
      else o[k] = v;
    }
    U[id] = o;
  }
  const CT = {};
  for (const id in d0.CT) { CT[id] = {}; for (const k in d0.CT[id]) CT[id][k] = avgNum(d => d.CT[id][k]); }
  return { t: d0.t, Q, C, U, CT, avg: true };
}

/* chạy một chu kỳ từ trạng thái tuần hoàn, trả về kết quả trung bình + chuỗi thời gian để vẽ */
/* Cụm bể chu kỳ có dòng tuần hoàn quay về (nước tách bùn, rửa lọc…) không qua bể đệm: "xé dòng".
   Cắt mỗi đường quay về thành điểm xả tạm + nguồn vào tạm (lưu lượng & thành phần cố định), giải bằng bể đại diện
   (nhanh), cập nhật nguồn tạm bằng trung bình chu kỳ của điểm xả tạm, lặp tới khi dòng tuần hoàn không đổi (≤ 0,5 %). */
async function steadyTorn(P, sys, y0, opt, cu) {
  const R = new Set(), st = Object.values(cu.outs).map(li => sys.links[li].to[0]);
  while (st.length) { const id = st.pop(); if (id === cu.id || R.has(id)) continue; R.add(id); for (const li of Object.values(sys.byId[id].outs)) st.push(sys.links[li].to[0]); }
  // ưu tiên cắt các đường quay về "đường nước vào" (từ nguồn tới cụm bể, không đi qua cụm bể – vd nước tách bùn → bể điều hòa):
  // phần phía trước (điều hòa, bể kỵ khí…) vẫn giải tách được (steadyDecomp); không có thì cắt đường từ phần sau ra ngoài
  const F = new Set(), fq = sys.units.filter(u => !u.T.ins.length).map(u => u.id);
  while (fq.length) { const id = fq.pop(); if (id === cu.id || F.has(id)) continue; F.add(id); for (const li of Object.values(sys.byId[id].outs)) fq.push(sys.links[li].to[0]); }
  let back = P.links.filter(l => l.from[0] !== cu.id && R.has(l.from[0]) && !F.has(l.from[0]) && (F.has(l.to[0]) || l.to[0] === cu.id));
  if (!back.length) back = P.links.filter(l => R.has(l.from[0]) && !R.has(l.to[0]));
  if (typeof STEADY_DBG !== 'undefined' && STEADY_DBG) console.log('steadyTorn: R', [...R].join(','), 'back', back.map(l => l.from.join('.') + '>' + l.to.join('.')).join(' '));
  if (!back.length) return null;
  const m = sys.m, Pt = JSON.parse(JSON.stringify(P));
  const tears = back.map((l, k) => ({ k, sink: '_TS' + k, src: '_TI' + k, lid: l.id }));
  for (const t of tears) {
    const L = Pt.links.find(x => x.id === t.lid), to = L.to;
    L.to = [t.sink, 'in'];
    Pt.units.push({ id: t.sink, type: 'effluent', name: 'xé dòng', x: 0, y: 0, p: {} });
    Pt.units.push({ id: t.src, type: 'influent', name: 'xé dòng', x: 0, y: 0, p: { Q: 1e-3, inf: Object.assign(INF.defaults(), { pat: { type: 'const' } }) } });
    Pt.links.push({ id: '_LT' + t.k, from: [t.src, 'out'], to });
  }
  const map = (from, to, yf, yt) => { for (const u of to.units) { const c0 = from.byId[u.id]; if (c0 && c0.ns === u.ns && u.ns > 0) yt.set(yf.subarray(c0.off, c0.off + c0.ns), u.off); } return yt; };
  let sPrev = sys, yPrev = y0, r = null, simT = 0, steps = 0, it = 0, dmax = Infinity, last = false;
  const tolF = opt.tol || 2e-4, tolL = Math.max(tolF, 1e-3);
  for (; it < 10; it++) {
    const sT = compilePlant(Pt);
    if (sT.errors.length) { if (typeof STEADY_DBG !== 'undefined' && STEADY_DBG) console.log('steadyTorn: lỗi dựng', sT.errors); return null; }
    sT.setSteady(true);
    // vòng trung gian: dung sai lỏng; khi dòng tuần hoàn đã ổn định → một vòng cuối dung sai đầy đủ
    r = await steadyAuto(Pt, sT, map(sPrev, sT, yPrev, sT.y0Default()), Object.assign({}, opt, { _torn: true, skipVerify: true, tol: last ? tolF : tolL, rtol: last ? opt.rtol : 1e-4, atol: last ? opt.atol : 1e-3 }, it > 0 ? { warmSvi: false } : {}));
    simT += r.simT || 0; steps += r.steps || 0;
    const det = sT.period > 0 ? (await cycleRun(sT, 0, r.y)).avg : sT.detail(0, r.y);
    sT.setSteady(false);
    dmax = 0;
    for (const t of tears) {
      const i = det.U[t.sink], u = Pt.units.find(x => x.id === t.src), Qn = Math.max(i.Qin || 0, 1e-3), C = i.Cin;
      const Qo = +u.p.Q, cOld = u.p.inf.st && u.p.inf.st[m.id];
      dmax = Math.max(dmax, Math.abs(Qn - Qo) / Math.max(Qn, 1));
      if (cOld) for (const c of m.comps) { const a = Math.max(C[m.idx[c.id]], 0), b = +cOld[c.id] || 0; dmax = Math.max(dmax, Math.abs(a - b) / (Math.abs(a) + 10)); }
      u.p.Q = Qn; u.p.inf.mode = 'state'; u.p.inf.st = { [m.id]: Object.fromEntries(m.comps.map(c => [c.id, Math.max(C[m.idx[c.id]], 0)])) };
    }
    sPrev = sT; yPrev = r.y;
    if (opt.abort && opt.abort()) break;
    // vòng cuối (dung sai đầy đủ) làm dòng tuần hoàn còn thay đổi → lặp tiếp với dung sai đầy đủ
    if (last && dmax < 5e-3) break;
    if (it > 0 && dmax < 5e-3) last = true;
  }
  const yF = map(sPrev, sys, yPrev, Float64Array.from(y0));
  return Object.assign({}, r, { y: yF, simT, steps, converged: r.converged && dmax < 1e-2, torn: { n: tears.length, iter: it + 1, change: dmax } });
}

/* Giải tách phía trước / phía sau cụm bể chu kỳ: phần phía trước (không nhận dòng nào từ cụm bể hay phía sau) là hệ liên tục –
   giải ổn định riêng (nhanh, không có các lần chuyển pha), rồi thay bằng các dòng vào cố định có đúng lưu lượng & thành phần
   trên từng đường ống cắt; phần sau giải bằng steadyAuto (hệ rút gọn 1 bể…). Ghép trạng thái hai phần vào hệ đầy đủ.
   Lợi ích lớn khi phía trước có bể kỵ khí ADM1 (rất cứng – mỗi lần chuyển pha SBR phải khởi động lại bước tích phân). */
async function steadyDecomp(P, sys, y0, opt, cu) {
  const down = new Set(), st = Object.values(cu.outs).map(li => sys.links[li].to[0]);
  while (st.length) { const id = st.pop(); if (down.has(id)) continue; down.add(id); for (const li of Object.values(sys.byId[id].outs)) st.push(sys.links[li].to[0]); }
  if (down.has(cu.id)) return null;                                   // có tuần hoàn qua cụm bể → xé dòng (steadyTorn)
  const R = new Set(sys.units.filter(u => u.id !== cu.id && !down.has(u.id) && u.type !== 'blower').map(u => u.id));
  if (!sys.units.some(u => R.has(u.id) && u.ns > 0)) return null;
  for (const bl of sys.units) if (bl.type === 'blower' && bl.zoneUnits.some(z => R.has(z.id))) return null;
  const cut = P.links.filter(l => R.has(l.from[0]) && !R.has(l.to[0]));
  if (!cut.length || P.links.some(l => !R.has(l.from[0]) && R.has(l.to[0]))) return null;
  const m = sys.m;
  // phần phía trước: các đường cắt đổ vào điểm cuối tạm
  const Pu = JSON.parse(JSON.stringify(P));
  Pu.units = Pu.units.filter(u => R.has(u.id)); Pu.ctrls = [];
  Pu.links = Pu.links.filter(l => R.has(l.from[0]));
  cut.forEach((l, k) => { const L = Pu.links.find(x => x.id === l.id); L.to = ['_DS' + k, 'in']; Pu.units.push({ id: '_DS' + k, type: 'effluent', name: 'cắt dòng', x: 0, y: 0, p: {} }); });
  const su = compilePlant(Pu);
  if (su.errors.length) return null;
  su.setSteady(true);
  const yu0 = su.y0Default(); for (const u of su.units) { const c0 = sys.byId[u.id]; if (c0 && c0.ns === u.ns && u.ns > 0) yu0.set(y0.subarray(c0.off, c0.off + c0.ns), u.off); }
  const ru = await SOLVER.steady(su, yu0, Object.assign({}, opt, { onProgress: opt.onProgress }));
  const du = su.detail(0, ru.y);
  su.setSteady(false);
  // phần phía sau: đường cắt → dòng vào cố định
  const Pd = JSON.parse(JSON.stringify(P));
  Pd.units = Pd.units.filter(u => !R.has(u.id));
  Pd.links = Pd.links.filter(l => !R.has(l.from[0]));
  cut.forEach((l, k) => {
    const i = du.U['_DS' + k], C = i.Cin || new Float64Array(m.n), Q = Math.max(i.Qin || 0, 1e-3);
    const inf = Object.assign(INF.defaults(), { pat: { type: 'const' }, mode: 'state', st: { [m.id]: Object.fromEntries(m.comps.map(c => [c.id, Math.max(C[m.idx[c.id]], 0)])) } });
    Pd.units.push({ id: '_DI' + k, type: 'influent', name: 'cắt dòng', x: 0, y: 0, p: { Q, inf } });
    Pd.links.push({ id: '_LD' + k, from: ['_DI' + k, 'out'], to: l.to });
  });
  const sd = compilePlant(Pd);
  if (sd.errors.length) return null;
  sd.setSteady(true);
  const yd0 = sd.y0Default(); for (const u of sd.units) { const c0 = sys.byId[u.id]; if (c0 && c0.ns === u.ns && u.ns > 0) yd0.set(y0.subarray(c0.off, c0.off + c0.ns), u.off); }
  const rd = await steadyAuto(Pd, sd, yd0, Object.assign({}, opt, { _dec: true }));
  sd.setSteady(false);
  const yF = Float64Array.from(y0);
  for (const [s2, yy] of [[su, ru.y], [sd, rd.y]]) for (const u of s2.units) { const c0 = sys.byId[u.id]; if (c0 && c0.ns === u.ns && u.ns > 0) yF.set(yy.subarray(u.off, u.off + u.ns), c0.off); }
  return Object.assign({}, rd, { y: yF, simT: (ru.simT || 0) + (rd.simT || 0), steps: (ru.steps || 0) + (rd.steps || 0), converged: ru.converged && rd.converged, res: Math.max(ru.res, rd.res), decomp: { up: [...R].filter(id => sys.byId[id].ns > 0), cut: cut.length, upT: ru.simT } });
}

async function cycleRun(sys, t0, y0, nOut = 192, NA = 1440) {
  const per = sys.period, snaps = [], times = [], avgD = [], avgT = [], stD = [], stT = [];
  // điểm lấy trung bình: lưới đều dày + hai phía mỗi điểm chuyển pha (lưu lượng gạn/xả bùn nhảy bậc)
  const tA = [];
  for (let i = 0; i <= NA; i++) tA.push(t0 + per * i / NA);
  if (sys.nextBreak) { let tb = sys.nextBreak(t0); while (tb < t0 + per - 1e-9) { tA.push(tb - 2e-9, tb + 2e-9); tb = sys.nextBreak(tb + 1e-8); } }
  const tOut = [...new Set(tA)].sort((a, b) => a - b);
  const keep = new Set(); for (let i = 0; i <= nOut; i++) keep.add(Math.round(i * NA / nOut));
  const r = await SOLVER.ode23s(sys, t0, t0 + per, y0, {
    hmax: Math.min(sys.hmax || per / 20, per / 20), rtol: 1e-5, atol: 1e-4, tOut,
    onOut: (t, y) => {
      const d = sys.detail(t, y);
      avgD.push(d); avgT.push(t);
      const k = Math.round((t - t0) / per * NA);
      if (Math.abs(t - (t0 + per * k / NA)) < 1e-12 && keep.has(k)) { snaps.push(d); times.push(t - t0); }
    },
    // + các điểm bước thích nghi của bộ giải: bắt được xung ngắn (vd O₂ cấp khi DO được kéo lên điểm đặt đầu pha sục khí)
    // mà lưới đều bỏ sót → trung bình chu kỳ (cân bằng COD/O₂) chính xác
    onStep: (t, y) => { if (t > t0 && t < t0 + per) { stD.push(sys.detail(t, y)); stT.push(t); } }
  });
  const ord = avgT.map((t, i) => [t, avgD[i]]).concat(stT.map((t, i) => [t, stD[i]])).sort((a, b) => a[0] - b[0]);
  const mT = [], mD = [];
  for (const [t, d] of ord) { if (mT.length && t - mT[mT.length - 1] < 1e-12) continue; mT.push(t); mD.push(d); }
  return { avg: averageDet(mD, mT), snaps, times, y: r.y };
}

/* ---------------------------------------------------------------------------
   Tìm trạng thái ổn định – tự chọn cách nhanh nhất:
   sơ đồ chỉ gồm nguồn → 1 cụm bể chu kỳ (N bể) → điểm cuối (không bể nào khác, không tuần hoàn,
   không bộ điều khiển) và nạp đều theo lịch: các bể giống hệt nhau chỉ lệch pha ⇒ giải 1 bể đại diện
   với 1/N lưu lượng, dựng trạng thái N bể bằng dịch pha, rồi xác nhận bằng hệ đầy đủ.
   --------------------------------------------------------------------------- */
const n0 = sys => sys.m.n;
let STEADY_WARM_SVI = true;
async function steadyAuto(P, sys, y0, opt = {}) {
  // có bộ điều khiển + bể chu kỳ: giải điều kiện ổn định của PI (trung bình chu kỳ giá trị đo = giá trị đặt) bằng vòng ngoài
  if (!opt._noCtl && sys.ctrls.length && sys.period > 0 && STEADY_CTRL_OUTER) {
    const r = await steadyCtrl(P, sys, y0, opt);
    if (r) return r;
  }
  // trạm máy thổi + bể chu kỳ: (1) trạng thái tuần hoàn với DO lý tưởng (bỏ trạm máy thổi) – hội tụ nhanh;
  // (2) bật trạm máy thổi, mô phỏng tiếp tối đa 6 ngày cho vòng khí và các biến liên quan thích nghi
  if (!opt._noBl && sys.units.some(u => u.type === 'blower') && sys.units.some(u => CYC.has(u.type))) {
    const P0 = JSON.parse(JSON.stringify(P));
    P0.units = P0.units.filter(u => u.type !== 'blower');
    P0.ctrls = (P0.ctrls || []).filter(c => (P.units.find(u => u.id === c.unit) || {}).type !== 'blower');
    const s0 = compilePlant(P0);
    if (!s0.errors.length) {
      const map = (from, to, yf, yt) => { for (const cu of to.units) { const c0 = from.byId[cu.id]; if (c0 && c0.ns === cu.ns && cu.ns > 0) yt.set(yf.subarray(c0.off, c0.off + c0.ns), cu.off); } return yt; };
      s0.setSteady(true);
      const r0 = await steadyAuto(P0, s0, map(sys, s0, y0, s0.y0Default()), Object.assign({}, opt, { _noBl: true }));
      s0.setSteady(false);
      const y1 = map(s0, sys, r0.y, sys.y0Default());
      // (2) có máy thổi: tiếp tục bằng cách nhanh nhất (1 bể đại diện nếu được) nhưng giới hạn 6 ngày mô phỏng
      const r1 = await steadyAuto(P, sys, y1, Object.assign({}, opt, { _noBl: true, maxT: 6, warmSvi: false }));
      return Object.assign(r1, { simT: r0.simT + r1.simT, steps: (r0.steps || 0) + (r1.steps || 0), converged: r0.converged && r1.res < 5e-2, res: r1.res, blowerStage: { days: r1.simT, change: r1.res } });
    }
  }
  const cyc = sys.units.filter(cu => CYC.has(cu.type));
  const cu = cyc[0];
  // bể chu kỳ: sai số tích phân qua các lần chuyển pha (DO điều khiển lý tưởng rất cứng) tích lũy thành trạng thái "ổn định giả"
  // lệch 0,1–0,3 % (bùn hạt ASM1G/ASM2dG: vài %) → dung sai chặt hơn cho giai đoạn hội tụ của hệ rút gọn 1 bể (rẻ);
  // hệ đầy đủ và mô hình lắng phân tầng giữ mặc định (tốn thời gian)
  const tight = !cyc.length ? {} : /G$/.test(sys.m.id) ? { rtol: 1e-6, atol: 1e-5 } : cyc.some(c => c.layered) ? {} : { rtol: 1e-5, atol: 1e-4 };
  const tOpt = Object.assign({}, opt, opt.rtol ? {} : tight);
  // phần phía trước cụm bể chu kỳ có thiết bị có trạng thái (bể kỵ khí ADM1, điều hòa…) và không có dòng quay lại → giải tách
  if (cyc.length === 1 && !opt._dec && !sys.ctrls.length) { const rd = await steadyDecomp(P, sys, y0, opt, cu); if (rd) return rd; }
  // trạm máy thổi chỉ cấp cho cụm bể này: hệ rút gọn dùng 1/N năng lực máy thổi
  // bể đệm mở rộng (bể điều hòa / chứa bùn – UNITX.redScale): cho phép trong hệ rút gọn, lưu lượng & thể tích chia N
  // + bể kỵ khí tốc độ cao (yếm khí cấp 1) phía trước: nhận dòng liên tục, chia N như bể đệm (V, V khí, bùn dư)
  const bufU = c => c.type === 'anr' || (typeof UNITX !== 'undefined' && UNITX[c.type] && UNITX[c.type].redScale);
  const others = sys.units.filter(c => !CYC.has(c.type) && c.ns > 0 && !bufU(c) && !(c.type === 'blower' && cu && c.zoneUnits.length === 1 && c.zoneUnits[0] === cu));
  const bufs = sys.units.filter(bufU);
  let ok = cyc.length === 1 && !others.length && !sys.ctrls.length && cu.N > 1, loopBad = false;
  if (ok) {   // có đường từ cửa ra của cụm bể quay lại cửa vào → xé dòng (steadyTorn)
    const seen = new Set(), stack = Object.values(cu.outs).map(li => [sys.links[li].to[0], false]);
    while (stack.length) {
      const [id, buf] = stack.pop(); if (id === cu.id) { ok = false; loopBad = true; break; }
      const key = id + (buf ? '+' : ''); if (seen.has(key)) continue; seen.add(key);
      const u = sys.byId[id], b2 = buf || !!bufU(u); for (const li of Object.values(u.outs)) stack.push([sys.links[li].to[0], b2]);
    }
  }
  if (!ok && loopBad && !opt._torn) { const rt = await steadyTorn(P, sys, y0, opt, cu); if (rt) return rt; }
  if (!ok) return SOLVER.steady(sys, y0, opt);
  // hệ rút gọn: 1 bể, nguồn chia N
  const Pr = JSON.parse(JSON.stringify(P));
  for (const u of Pr.units) {
    if (u.type === 'influent') u.p.Q = +u.p.Q / cu.N;
    if (u.type === 'dose') { DOSE.sync(u.p, DOSE.Qinf(P)); u.p.Q = +u.p.Q / cu.N; u.p.mass = +u.p.mass / cu.N; u.p.dmode = 'mass'; }
    if (u.id === cu.id) { u.p.N = 1; u.p._redN = cu.N; }
    if (typeof UNITX !== 'undefined' && UNITX[u.type] && UNITX[u.type].redScale) UNITX[u.type].redScale(u.p, cu.N);
    if (u.type === 'anr') { u.p.V = +u.p.V / cu.N; u.p.Vgas = +u.p.Vgas / cu.N; u.p.Qw = +u.p.Qw / cu.N; }
    if (u.type === 'blower') {   // năng lực chia cho số bể sục khí đồng thời (N × phần thời gian sục khí)
      const fA = cu.phases.filter(x => x.aer).reduce((a, x) => a + x.t1 - x.t0, 0) / cu.Tc;
      if (u.p.arr !== 'dedicated') u.p.Qr = +u.p.Qr / Math.max(cu.N * fA, 1);
      u.p.zones = [cu.id];
    }
  }
  const sr = compilePlant(Pr);
  if (sr.errors.length) return SOLVER.steady(sys, y0, opt);
  sr.setSteady(true);
  const cr = sr.units.find(u => u.id === cu.id);
  // điểm xuất phát: bể 0 của hệ đầy đủ
  let yr0 = sr.y0Default();
  yr0.set(y0.subarray(cu.off, cu.off + cu.ts), cr.off);
  // phân tầng: khởi động bằng mô hình lớp bùn đơn (rẻ) để sinh học tới gần trạng thái tuần hoàn
  if (cu.layered && opt.warmSvi !== false && STEADY_WARM_SVI) {
    const Ps = JSON.parse(JSON.stringify(Pr));
    Ps.units.find(u => u.id === cu.id).p.sm = 'svi';
    const ss = compilePlant(Ps);
    if (!ss.errors.length) {
      ss.setSteady(true);
      const cs = ss.units.find(u => u.id === cu.id), ys0 = ss.y0Default();
      for (let i = 0; i <= cu.nMain; i++) ys0[cs.off + i] = yr0[cr.off + i];     // vùng chính + V
      const rs = await SOLVER.steady(ss, ys0, Object.assign({}, opt, { rtol: 1e-3, atol: 1e-2, tol: 1e-3 }));
      for (let i = 0; i <= cu.nMain; i++) yr0[cr.off + i] = rs.y[cs.off + i];
      if (cu.Vp > 0) for (let i = 0; i < n0(sys); i++) yr0[cr.off + cr.iP + i] = rs.y[cs.off + cs.iP + i];
      // lớp TSS đồng nhất (đầu chu kỳ là pha khuấy trộn)
      let xm = 0; for (const i of sys.m.partIdx) xm += sys.tssF[i] * Math.max(yr0[cr.off + i], 0);
      for (let j = 0; j < cr.nL; j++) yr0[cr.off + cr.iL + j] = xm;
    }
  }
  // giai đoạn 1: dung sai lỏng để tiến nhanh; giai đoạn 2: dung sai chặt khử sai lệch tích lũy qua chu kỳ
  const r0 = await SOLVER.steady(sr, yr0, Object.assign({}, opt, { rtol: 1e-3, atol: 1e-2, tol: 1e-3 }));
  const r1 = await SOLVER.steady(sr, r0.y, tOpt);
  r1.simT += r0.simT;
  // dựng N bể: bể k tại t=0 ≡ bể đại diện tại t = Tc − k·Tc/N
  const tOut = []; for (let k = cu.N - 1; k >= 1; k--) tOut.push(cu.Tc - k * cu.Tc / cu.N);
  const shots = {};
  const blR = sr.units.find(u => u.type === 'blower'), blF = sys.units.find(u => u.type === 'blower' && u.zoneUnits.includes(cu)), bshots = {};
  await SOLVER.ode23s(sr, 0, cu.Tc, r1.y, { hmax: sr.hmax, rtol: 1e-5, atol: 1e-4, tOut, onOut: (t, y) => { shots[t.toFixed(9)] = Float64Array.from(y.subarray(cr.off, cr.off + cr.ts)); if (blR) bshots[t.toFixed(9)] = y[blR.off]; } });
  const yf = Float64Array.from(y0);
  for (const b of bufs) { const br = sr.byId[b.id]; if (!br) continue; for (let i = 0; i < b.ns; i++) yf[b.off + i] = r1.y[br.off + i]; if (typeof UNITX !== 'undefined' && UNITX[b.type] && UNITX[b.type].redUnmap) UNITX[b.type].redUnmap(b, yf, cu.N); }
  for (let k = 0; k < cu.N; k++) {
    const src = k === 0 ? r1.y.subarray(cr.off, cr.off + cr.ts) : shots[(cu.Tc - k * cu.Tc / cu.N).toFixed(9)];
    if (src) yf.set(src, cu.off + k * cu.ts);
    if (blR && blF) { const bv = k === 0 ? r1.y[blR.off] : bshots[(cu.Tc - k * cu.Tc / cu.N).toFixed(9)]; if (bv !== undefined) yf[blF.off + cu.bz + k] = bv; }
  }
  // lần giải trung gian (vòng ngoài của bộ điều khiển, dung sai lỏng): không cần xác nhận bằng hệ đầy đủ
  if (opt.skipVerify) return { y: yf, res: r1.res, simT: r1.simT, steps: r1.steps, converged: r1.converged, reduced: { simT: r1.simT, nExt: (r0.nExt || 0) + (r1.nExt || 0), periodicity: NaN } };
  // xác nhận bằng hệ đầy đủ: một chu kỳ phải quay về đúng trạng thái đầu
  const chk = await SOLVER.ode23s(sys, 0, cu.Tc, yf, { hmax: sys.hmax, rtol: 1e-4, atol: 1e-3, abort: opt.abort });
  let dmax = 0;
  // bể đệm (thời gian lưu dài, nhận bùn từ N bể lệch pha thay vì 1 bể đại diện): không xét tính tuần hoàn – trung bình đã đúng
  const skip = new Uint8Array(sys.n); for (const b of bufs) skip.fill(1, b.off, b.off + b.ns);
  for (let i = 0; i < sys.n; i++) if (!skip[i]) dmax = Math.max(dmax, Math.abs(chk.y[i] - yf[i]) / ((Math.abs(yf[i]) + 10) * (sys.tolScale ? sys.tolScale[i] : 1)));
  const reduced = { simT: r1.simT, nExt: (r0.nExt || 0) + (r1.nExt || 0), periodicity: dmax };
  if (typeof STEADY_DBG !== 'undefined' && STEADY_DBG) { let im = 0, dm = 0; for (let i = 0; i < sys.n; i++) { const d = skip[i] ? 0 : Math.abs(chk.y[i] - yf[i]) / ((Math.abs(yf[i]) + 10) * (sys.tolScale ? sys.tolScale[i] : 1)); if (d > dm) { dm = d; im = i; } } const u = sys.units.find(c => im >= c.off && im < c.off + c.ns); console.log('periodicity', dmax, 'at', im, u && u.id, u && im - u.off, 'y0', yf[im], 'y1', chk.y[im]); }
  if (dmax < (bufs.length ? 5e-3 : 2e-3)) return { y: yf, res: r1.res, simT: r1.simT, steps: r1.steps, converged: r1.converged, reduced };
  const r2 = await SOLVER.steady(sys, yf, opt);
  r2.reduced = reduced;
  return r2;
}

/* ---------------------------------------------------------------------------
   Trạng thái ổn định khi có bộ điều khiển PI (hệ có bể chu kỳ).
   Ở trạng thái (tuần hoàn) ổn định, PI chưa bão hòa luôn cho trung bình chu kỳ của giá trị đo = giá trị đặt,
   không phụ thuộc Kp, Ti, τ. Thay vì tích phân cả vòng điều khiển (mode dao động chậm, ngoại suy kém,
   bước nhỏ, không dùng được hệ rút gọn 1 bể), giải trực tiếp hệ m phương trình  ē_i(u) = 0
   theo các đại lượng tác động u (giữ cố định trong mỗi lần giải) bằng Newton–Broyden có giới hạn [umin, umax]:
   mỗi lần đánh giá = 1 lần giải ổn định KHÔNG có bộ điều khiển, khởi động nóng từ lời giải trước
   (dùng được hệ rút gọn 1 bể đại diện, tách giai đoạn máy thổi). Bộ điều khiển chạm giới hạn → giữ ở giới hạn (như PI bão hòa).
   Cuối cùng gắn lại PI thật (tích phân khởi tạo đúng u*) và mô phỏng thêm vài ngày để có quỹ đạo trong chu kỳ.
   --------------------------------------------------------------------------- */
let STEADY_CTRL_OUTER = true;
async function steadyCtrl(P, sys, y0, opt = {}) {
  const K = sys.ctrls, m = K.length;
  if (new Set(K.map(k => k.au.id + '|' + k.c.act)).size < m) return null;   // hai bộ cùng tác động một đại lượng → giải trực tiếp
  const Pf = JSON.parse(JSON.stringify(P));
  Pf.ctrls = [];
  const sysF = compilePlant(Pf);
  if (sysF.errors.length) return null;
  const nF = sysF.n;
  const lo = K.map(k => k.umin), hi = K.map(k => k.umax);
  const clamp = (v, i) => Math.min(Math.max(v, lo[i]), hi[i]);
  const tolE = K.map(k => Math.max(0.005 * Math.abs(k.sp), 0.005));
  const spec = K.map(k => ({ src: k.c.src, munit: k.c.munit, mtank: k.c.mtank, link: k.c.link, v: k.c.v }));
  const pu = K.map(k => Pf.units.find(u => u.id === k.au.id));
  let yW = Float64Array.from(y0.subarray(0, nF)), simT = 0, steps = 0, nEval = 0, lastConv = true;
  const t0 = performance.now();
  const info = msg => opt.onCtrl && opt.onCtrl(msg), f4 = v => String(+(+v).toPrecision(4));
  // đánh giá: giải ổn định với u cố định → sai lệch trung bình (chu kỳ) của giá trị đo
  let tolIn = Math.max(opt.tol || 2e-4, 1e-3);      // Newton không chính xác: xa nghiệm giải lỏng, gần nghiệm giải chặt
  const evalU = async u => {
    u.forEach((v, i) => (pu[i].p[K[i].c.act] = v));
    const s = compilePlant(Pf), te = performance.now();
    s.setSteady(true);
    // mỗi lần giải tối đa 400 ngày: u làm hệ không có trạng thái ổn định (vd. không xả bùn) không được tiêu tốn thời gian
    // từ lần thứ hai: khởi động nóng từ trạng thái phân tầng đã hội tụ → bỏ bước khởi động bằng lớp bùn đơn (sẽ xóa mặt cắt bùn)
    const r = await steadyAuto(Pf, s, yW, Object.assign({}, opt, { _noCtl: true, tol: tolIn, skipVerify: tolIn > (opt.tol || 2e-4), maxT: Math.min(opt.maxT || 2000, 400), warmSvi: nEval === 0 ? opt.warmSvi : false, onProgress: (t, ch) => opt.onProgress && opt.onProgress(simT + t, ch) }));
    simT += r.simT; steps += r.steps || 0; nEval++;
    if (!r.converged) { const e = new Array(m).fill(NaN); e.bad = true; info(`  lần giải ${nEval}: u = ${u.map(f4).join(', ')} – không hội tụ sau ${r.simT} ngày (${((performance.now() - te) / 1000).toFixed(1)} s), bỏ điểm này`); return e; }
    yW = Float64Array.from(r.y);
    info(`  lần giải ${nEval}: u = ${u.map(f4).join(', ')} – ${r.simT} ngày mô phỏng, ${((performance.now() - te) / 1000).toFixed(1)} s`);
    const avg = new Float64Array(m);
    if (s.period > 0) {
      // trung bình theo thời gian một chu kỳ (hình thang trên lưới đều)
      const NA = 96, tOut = []; for (let i = 0; i <= NA; i++) tOut.push(s.period * i / NA);
      let j = 0;
      await SOLVER.ode23s(s, 0, s.period, r.y, { hmax: s.hmax, rtol: 1e-4, atol: 1e-3, tOut, abort: opt.abort,
        onOut: (t, y) => { const wgt = (j === 0 || j === NA) ? 0.5 / NA : 1 / NA; for (let i = 0; i < m; i++) avg[i] += wgt * s.measureAt(spec[i], t, y); j++; } });
    } else for (let i = 0; i < m; i++) avg[i] = s.measureAt(spec[i], 0, r.y);
    return Array.from(avg, (v, i) => v - K[i].sp);
  };
  const nrm = e => e.bad ? Infinity : Math.sqrt(e.reduce((a, v, i) => a + (v / tolE[i]) ** 2, 0) / m);
  let u = K.map((k, i) => clamp(k.u0, i));
  let e = await evalU(u);
  if (e.bad) { info('điểm xuất phát không có trạng thái ổn định – chuyển sang mô phỏng trực tiếp vòng điều khiển'); return null; }
  let yGood = yW;                                   // trạng thái của điểm hiện hành (khởi động nóng)
  info(`vòng 0: ${u.map(f4).join(', ')} → sai lệch ${e.map(f4).join(', ')}`);
  const J = Array.from({ length: m }, () => new Float64Array(m));
  const sat = new Array(m).fill(0), flat = new Array(m).fill(0);
  const done = () => e.every((v, i) => Math.abs(v) <= tolE[i] || sat[i] || flat[i]);
  // vùng tin cậy: mỗi vòng thay đổi u_i không quá max(50 % giá trị hiện hành, 10 % khoảng điều chỉnh)
  const rad = (v, i) => Math.max(0.5 * Math.abs(v), 0.1 * (hi[i] - lo[i]));
  // độ nhạy của toàn bộ trạng thái theo u (dy/du, cột j) → dự báo điểm khởi động cho u mới (ngoại suy tuyến tính, giữ không âm)
  const dY = new Array(m).fill(null);
  const predict = uT => {
    const y = Float64Array.from(yGood);
    for (let j = 0; j < m; j++) { const d = uT[j] - u[j]; if (!dY[j] || d === 0) continue; const c = dY[j]; for (let k = 0; k < nF; k++) y[k] += c[k] * d; }
    for (let k = 0; k < nF; k++) if (y[k] < 0 && yGood[k] >= 0) y[k] = 0.3 * yGood[k];
    return y;
  };
  if (!done()) {
    // Jacobian sai phân ban đầu (mỗi đại lượng tác động một lần giải)
    for (let j = 0; j < m; j++) {
      // bước sai phân nhỏ (2 %): quá độ ngắn hơn, vẫn lớn hơn nhiều so với sai số của lời giải dung sai lỏng
      let du = Math.max(0.02 * Math.abs(u[j]), 0.005 * (hi[j] - lo[j]), 1e-6);
      if (u[j] + du > hi[j]) du = -du;
      let u2 = u.slice(); u2[j] = clamp(u[j] + du, j);
      let e2 = await evalU(u2);
      if (e2.bad) { yW = yGood; u2 = u.slice(); u2[j] = clamp(u[j] - du, j); e2 = await evalU(u2); }
      if (e2.bad) { yW = yGood; continue; }        // cột Jacobian = 0 → bộ này coi như không nhạy
      for (let i = 0; i < m; i++) J[i][j] = (e2[i] - e[i]) / (u2[j] - u[j]);
      { const c = new Float64Array(nF), d = u2[j] - u[j]; for (let k = 0; k < nF; k++) c[k] = (yW[k] - yGood[k]) / d; dY[j] = c; }
      if (nrm(e2) < nrm(e)) { u = u2; e = e2; yGood = yW; } else yW = yGood;   // điểm thử tốt hơn → giữ làm điểm hiện hành
    }
  }
  const tight = opt.tol || 2e-4;
  let it = 0;
  const newton = async () => { for (; it < 15 && !done() && nEval < 8 + 6 * m; it++) {
    // tập hoạt động: bỏ bộ bão hòa (Newton đòi vượt giới hạn) và bộ không nhạy (đạo hàm ≈ 0)
    for (let i = 0; i < m; i++) {
      flat[i] = Math.abs(J[i][i]) * (hi[i] - lo[i]) < 0.1 * tolE[i] ? 1 : 0;
      if (flat[i]) continue;
      const want = u[i] - e[i] / J[i][i];
      sat[i] = (want <= lo[i] && u[i] <= lo[i] + 1e-12) || (want >= hi[i] && u[i] >= hi[i] - 1e-12) ? 1 : 0;
    }
    const A = [...Array(m).keys()].filter(i => !sat[i] && !flat[i]);
    if (!A.length) break;
    let du = new Float64Array(m);
    try { const x = _solveSmall(A.map(i => A.map(j => J[i][j])), A.map(i => -e[i])); A.forEach((i, k) => (du[i] = x[k])); }
    catch (er) { A.forEach(i => (du[i] = -e[i] / (J[i][i] || 1))); }
    // giới hạn bước theo vùng tin cậy (co đều cả véc-tơ để giữ hướng Newton)
    let sc = 1; for (let i = 0; i < m; i++) if (Math.abs(du[i]) > rad(u[i], i)) sc = Math.min(sc, rad(u[i], i) / Math.abs(du[i]));
    // chỉ xét sai lệch của các bộ đang hoạt động (bộ bão hòa/không nhạy không làm hỏng tiêu chí giảm)
    const nrmA = x => x.bad ? Infinity : Math.sqrt(A.reduce((a, i) => a + (x[i] / tolE[i]) ** 2, 0) / A.length);
    let lam = sc, uN, eN, okStep = false, yPred = null;
    for (let ls = 0; ls < 4; ls++) {
      uN = u.map((v, i) => clamp(v + lam * du[i], i));
      yW = yPred = predict(uN);                       // khởi động từ trạng thái dự báo
      eN = await evalU(uN);
      if (nrmA(eN) < nrmA(e)) { okStep = true; break; }
      if (!eN.bad && ls === 3) { okStep = true; break; }   // không giảm nhưng hợp lệ: chấp nhận để Broyden học thêm
      yW = yGood; lam *= 0.5;
    }
    if (!okStep) { yW = yGood; info(`vòng ${it + 1}: không tìm được bước hợp lệ – dừng`); break; }
    // cập nhật Broyden cho sai lệch (J) và cho trạng thái (dY)
    const s = uN.map((v, i) => v - u[i]), ss = s.reduce((a, v) => a + v * v, 0);
    if (ss > 0) for (let i = 0; i < m; i++) { let js = 0; for (let j = 0; j < m; j++) js += J[i][j] * s[j]; const c = (eN[i] - e[i] - js) / ss; for (let j = 0; j < m; j++) J[i][j] += c * s[j]; }
    if (ss > 0 && yPred) for (let j = 0; j < m; j++) { if (!s[j]) continue; const c = dY[j] || (dY[j] = new Float64Array(nF)), f = s[j] / ss; for (let k = 0; k < nF; k++) c[k] += (yW[k] - yPred[k]) * f; }
    u = uN; e = eN; yGood = yW;
    info(`vòng ${it + 1}: ${u.map(f4).join(', ')} → sai lệch ${e.map(f4).join(', ')}`);
  } };
  await newton();
  // các lần giải trên dùng dung sai lỏng → xác nhận tại u* với dung sai chuẩn, còn lệch thì Newton tiếp
  if (tolIn > tight) {
    tolIn = tight; yW = yGood;
    const e2 = await evalU(u);
    if (!e2.bad) { e = e2; yGood = yW; info(`xác nhận (dung sai chuẩn): sai lệch ${e.map(f4).join(', ')}`); if (!done()) await newton(); }
  }
  yW = yGood;
  for (let i = 0; i < m; i++) if (!flat[i]) sat[i] = Math.abs(e[i]) > tolE[i] && (u[i] <= lo[i] + 1e-9 || u[i] >= hi[i] - 1e-9) ? 1 : 0;
  const ok = done();
  // gắn lại PI thật: trạng thái các đơn vị giữ nguyên (cùng vị trí), cảm biến = giá trị đo, tích phân sao cho u = u*
  const yF = sys.y0Default();
  yF.set(yW.subarray(0, nF), 0);
  sys.initCtrlsAt(yF, u);
  const r1 = await steadyAuto(P, sys, yF, Object.assign({}, opt, { _noCtl: true, _noBl: true, maxT: 4, warmSvi: false, onProgress: (t, ch) => opt.onProgress && opt.onProgress(simT + t, ch) }));
  // độ thay đổi của các biến nhà máy trong giai đoạn PI thật (bỏ trạng thái bộ điều khiển: tích phân vẫn tích lũy sai lệch dư trong dung sai)
  let dPl = 0; const ts = sys.tolScale;
  for (let i = 0; i < nF; i++) dPl = Math.max(dPl, Math.abs(r1.y[i] - yF[i]) / ((Math.abs(yF[i]) + 10) * (ts ? ts[i] : 1)));
  return Object.assign(r1, {
    res: dPl, simT: simT + r1.simT, steps: steps + (r1.steps || 0), converged: ok && dPl < 5e-2,
    ctrlStage: { evals: nEval, u, e, sat, flat, tol: tolE, ok, ms: performance.now() - t0, names: K.map(k => k.c.name || k.c.id), acts: K.map(k => k.c.act) }
  });
}

/* hệ sinh học: bể sinh học + bể lắng thứ cấp + bộ chia/tách có cả vào lẫn ra trong hệ; exits = ống ra ngoài hệ */
function bioSubsystem(sys) {
  if (sys._bio) return sys._bio;
  const inS = new Set(sys.units.filter(cu => ['cstr', 'mbr', 'mbbr', 'baf', 'sbr', 'iceas', 'ctech', 'clarifier'].includes(cu.type) || (typeof UNITX !== 'undefined' && UNITX[cu.type] && UNITX[cu.type].reactor)).map(cu => cu.id));
  // bộ chia / tách nằm trên vòng tuần hoàn của hệ sinh học – kể cả chuỗi nối tiếp (vd. tách lý tưởng → bơm RAS/WAS → bể)
  const SPL = cu => cu.type === 'splitter' || cu.type === 'psep' || cu.type === 'cyclone';
  const reachS = (cu, seen) => Object.values(cu.outs).some(li => {
    const to = sys.byId[sys.links[li].to[0]];
    if (inS.has(to.id)) return true;
    if (!SPL(to) || seen.has(to.id)) return false;
    seen.add(to.id); return reachS(to, seen);
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const cu of sys.units) {
      if (inS.has(cu.id) || !SPL(cu)) continue;
      const fromS = cu.ins.some(li => inS.has(sys.links[li].from[0]));
      if (fromS && reachS(cu, new Set([cu.id]))) { inS.add(cu.id); changed = true; }
    }
  }
  // bỏ bể lắng không nối với bể sinh học nào
  const exits = [], effLinks = new Set();
  sys.links.forEach((l, i) => {
    if (inS.has(l.from[0]) && !inS.has(l.to[0])) {
      exits.push(i);
      const a = sys.byId[l.from[0]], b = sys.byId[l.to[0]];
      if (b.type === 'effluent' || (a.type === 'clarifier' && l.from[1] === 'eff') || (a.type === 'psep' && l.from[1] === 'ovf' && b.type !== 'sludge') || (a.type === 'mbr' && l.from[1] === 'eff') || (CYC.has(a.type) && l.from[1] === 'eff')) effLinks.add(i);
    }
  });
  return (sys._bio = { set: inS, exits, effLinks });
}

/* ----- tính các chỉ tiêu toàn nhà máy từ một kết quả chi tiết ----- */
function plantSummary(sys, det) {
  const m = sys.m, p = sys.p20, n = m.n;
  const comp = sys.sto.comp;
  const out = { reactors: [], sinks: [], srcs: [], digesters: [], ext: [] }, chem = [];
  let Pext = 0, xCOD = 0, xN = 0, xP = 0; const xDose = { Q: 0, C: 0 };   // thiết bị mở rộng: COD bị oxy hóa hóa học, N/P rời hệ không theo dòng (N₂ clo hóa, struvite)
  const cv = c => m.composites(c, p, {});
  let OTRs = 0, massR = 0, massAer = 0, Vtot = 0, Qinf = 0, air = 0, Pblow = 0, Pmix = 0, OTR = 0, gasCOD = 0, gasC = 0, gasN = 0, CO2 = 0, Egen = 0, CH4 = 0, biogas = 0, N2Os = 0, NOs = 0;
  for (const cu of sys.units) {
    const info = det.U[cu.id];
    const xu = typeof UNITX !== 'undefined' ? UNITX[cu.type] : null;
    if (xu) {
      Pext += info.kW || 0; air += info.air || 0; Pblow += info.Pblow || 0; Pmix += info.Pmix || 0; OTR += info.OTR || 0; CO2 += info.CO2 || 0;
      xCOD += info.CODox || 0; xN += (info.Ngas || 0) + (info.Nout || 0); xP += info.Pout || 0;
      // điện tích / carbon do hóa chất châm (kim loại, kiềm, clo, CO₂ khoáng hóa…) – tính như đầu vào ngoài
      if (xu.stateless && info.Cin && det.Q) for (const cn of ['Q', 'C']) if (comp[cn]) {
        let d = -(info.Qin || 0) * comp[cn].reduce((a, v, k) => a + v * info.Cin[k], 0);
        for (const pt in cu.outs) { const li = cu.outs[pt], c = det.C[li]; if (li == null || !c) continue; d += det.Q[li] * comp[cn].reduce((a, v, k) => a + v * c[k], 0); }
        xDose[cn] += d / 1000;
      }
      if (info.chem) for (const c of info.chem) chem.push(Object.assign({ unit: cu.u.name }, c));
      out.ext.push({ cu, info });
      if (xu.reactor && info.C && info.V > 0) {
        const c = cv(info.C), mass = c.TSS * info.V / 1000;
        massR += mass; Vtot += info.V; if (info.aerated) massAer += mass * (info.fAer != null ? info.fAer : 1);
        out.reactors.push({ cu, c, info, mass, aerated: !!info.aerated });
      }
    }
    if (['cstr', 'mbr', 'mbbr', 'baf', 'sbr', 'iceas', 'ctech'].includes(cu.type)) {
      const c = cv(info.C);
      const mass = c.TSS * info.V / 1000;
      massR += mass; Vtot += CYC.has(cu.type) ? cu.N * (cu.Vmax + cu.Vp) : info.V;
      const aerated = CYC.has(cu.type) || cu.p.aer !== 'none';
      // bể chu kỳ: chỉ phần thời gian có sục khí mới tính vào SRT hiếu khí (cùng định nghĩa SRT_hk = MCRT·TA/24 của bản tính)
      const fAerT = CYC.has(cu.type) && cu.Tc > 0 ? cu.phases.filter(x => x.aer).reduce((a, x) => a + x.t1 - x.t0, 0) / cu.Tc * (cu.Vmax / Math.max(cu.Vmax + (cu.Vp || 0), 1e-9)) : 1;
      if (aerated) massAer += mass * fAerT;
      air += info.air || 0; Pblow += info.Pblow || 0; Pmix += info.Pmix || 0; OTR += info.OTR || 0; CO2 += info.CO2 || 0;
      out.reactors.push({ cu, c, info, mass, aerated });
    }
    if (cu.type === 'blower') { Pblow += info.Pblow || 0; (out.blowers || (out.blowers = [])).push({ cu, info }); }
    if (cu.type === 'sewer') { OTRs += info.OTR || 0; CO2 += info.CO2 || 0; (out.sewers || (out.sewers = [])).push({ cu, info, c: cv(info.C), cIn: cv(info.Cin) }); }
    if (cu.type === 'digester' || cu.type === 'anr') {
      gasCOD += info.gasCOD; gasC += info.gasC; gasN += info.gasN; Pmix += info.Pmix; Egen += info.kWh; CH4 += info.CH4; biogas += info.biogas;
      out.digesters.push({ cu, info, c: cv(info.C) });
    }
    gasN += info.gasNs || 0; gasCOD += info.gasCODs || 0; N2Os += info.g_SN2O || 0; NOs += info.g_SNOg || 0;
    if (cu.type === 'influent') Qinf += det.Q[cu.outs.out];
    if (cu.type === 'influent' || cu.type === 'dose' || (xu && !cu.T.ins.length && cu.outs.out !== undefined)) out.srcs.push({ cu, li: cu.outs.out });   // + nguồn mở rộng (lưu vực)
    if (cu.type === 'effluent' || cu.type === 'sludge') out.sinks.push({ cu, Q: info.Qin, c: cv(info.Cin), C: info.Cin });
  }
  let wasTSS = 0, effTSS = 0, wasQ = 0;
  for (const s of out.sinks) {
    const kg = s.Q * s.c.TSS / 1000;
    if (s.cu.type === 'sludge') { wasTSS += kg; wasQ += s.Q; } else effTSS += kg;
  }
  out.Qinf = Qinf; out.Vtot = Vtot; out.massR = massR;
  out.HRT = Qinf > 0 ? Vtot / Qinf * 24 : 0;
  // SRT: bùn trong bể sinh học / bùn rời "hệ sinh học" (bể + lắng + bộ chia tuần hoàn) qua các đường ống ra ngoài hệ
  const S = bioSubsystem(sys);
  let exitTSS = 0, exWAS = 0, exWASQ = 0;
  for (const li of S.exits) {
    const kg = det.Q[li] * cv(det.C[li]).TSS / 1000;
    exitTSS += kg;
    if (!S.effLinks.has(li)) { exWAS += kg; exWASQ += det.Q[li]; }
  }
  out.SRT = exitTSS > 0 ? massR / exitTSS : Infinity;
  out.SRTaer = exitTSS > 0 ? massAer / exitTSS : Infinity;
  // SRT kể cả bùn lưu trong bể lắng thứ cấp thuộc hệ sinh học (định nghĩa "Plant SRT" của SUMO/BioWin – tử số gồm khối bùn bể lắng)
  let massCl = 0;
  for (const cu of sys.units) if (cu.type === 'clarifier' && S.set.has(cu.id) && det.U[cu.id] && isFinite(det.U[cu.id].mass)) massCl += det.U[cu.id].mass;
  out.massCl = massCl;
  out.SRTcl = exitTSS > 0 ? (massR + massCl) / exitTSS : Infinity;
  out.WAS = S.exits.length ? exWAS : wasTSS; out.WASQ = S.exits.length ? exWASQ : wasQ; out.effTSSload = effTSS;
  out.sludgeOut = wasTSS;
  out.air = air; out.Pblow = Pblow; out.Pmix = Pmix; out.OTR = OTR;
  out.Epump = Qinf * (+sys.pl.ePump) / 1000;
  // châm hóa chất (đơn vị "Châm hóa chất"): quy về sản phẩm & dung dịch khi nhập theo nồng độ / dung dịch
  for (const cu of sys.units) if (cu.type === 'dose') {
    const p = cu.p, m = Math.max(+p.mass || 0, 0); if (!(m > 0)) continue;
    const pr = p.dmode && p.dmode !== 'mass' ? DOSE.prod(p) : null, f = pr ? DOSE.f(p) : 1;
    chem.push({ unit: cu.u.name, name: pr ? pr[1] : p.kind === 'carbon' ? 'Carbon ngoài (quy COD)' : p.kind === 'alk' ? 'Kiềm (quy CaCO₃)' : (p.metal === 'Al' ? 'Al³⁺' : 'Fe³⁺'), kg: m / f,
      sol: p.dmode === 'sol' ? (+p.pct || 0) / 100 : undefined, rho: p.dmode === 'sol' ? +p.rho || 1 : undefined });
  }
  out.Pext = Pext; out.chem = chem;
  out.Eday = (Pblow + Pmix + Pext) * 24 + out.Epump;
  // cụm năng lượng biogas (bồn khí / CHP / đuốc – units_sumo.js): có máy CHP thì điện phát theo máy, không thì theo hiệu suất CHP chung
  const gt = typeof GASTRAIN === 'function' ? GASTRAIN(sys, det, biogas, CH4) : null;
  if (gt) { out.gas = gt; if (gt.hasCHP) Egen = gt.Egen; }
  out.Egen = Egen; out.Enet = out.Eday - Egen; out.CH4 = CH4; out.biogas = biogas;
  out.kWhm3 = Qinf > 0 ? out.Eday / Qinf : 0;
  if ((m.strip || []).length) { out.N2O = N2Os; out.NOgas = NOs; }
  // khí nhà kính: N₂O trực tiếp (mô hình có N₂O) + gián tiếp từ điện năng ròng (hệ số lưới điện) – kg CO₂e/d
  {
    let TNin = 0; for (const s of out.srcs) { const c = det.C[s.li]; if (c) TNin += det.Q[s.li] * cv(c).TN / 1000; }
    const pl = sys.pl || {}, efG = pl.efGrid !== '' && pl.efGrid != null && isFinite(+pl.efGrid) ? +pl.efGrid : 0.68;
    const n2o = out.N2O != null ? out.N2O * 44 / 28 * (+p.GWPN2O || 273) : null, en = out.Enet * efG;
    out.GHG = { n2o, energy: en, total: (n2o || 0) + en, efN2O: out.N2O != null && TNin > 0 ? out.N2O / TNin * 100 : null, TNin, efGrid: efG };
  }
  out.cost = out.Eday * (+sys.pl.price);
  out.gasCOD = gasCOD; out.CO2 = CO2;
  const bal = {};
  for (const cn of m.cons) {
    let inp = 0, outp = 0;
    for (const s of out.srcs) { const c = det.C[s.li]; let v = 0; for (let k = 0; k < n; k++) v += comp[cn][k] * c[k]; inp += det.Q[s.li] * v / 1000; }
    for (const s of out.sinks) { let v = 0; for (let k = 0; k < n; k++) v += comp[cn][k] * s.C[k]; outp += s.Q * v / 1000; }
    let o2 = 0, gas = 0;
    if (cn === 'COD') { o2 = -(OTR + OTRs + xCOD); gas = gasCOD; }
    if (cn === 'P') gas = xP;
    if (cn === 'C') gas = CO2 + gasC;
    if (cn === 'N') gas = gasN + xN;
    if (xDose[cn]) inp += xDose[cn];
    bal[cn] = { inp, outp, o2, gas, err: inp + o2 - outp - gas, rel: (inp + o2 - outp - gas) / Math.max(Math.abs(inp), 1e-9) * 100 };
  }
  out.bal = bal;
  const iN2 = m.idx.SN2;
  let n2 = 0; for (const s of out.sinks) n2 += s.Q * s.C[iN2] / 1000;
  for (const s of out.srcs) n2 -= det.Q[s.li] * det.C[s.li][iN2] / 1000;
  out.N2 = n2;
  return out;
}
