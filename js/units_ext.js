'use strict';
/* ==========================================================================
   SimXLNT – THIẾT BỊ MỞ RỘNG (theo danh mục Sumo24)
   Tiền xử lý : song chắn/lưới rác, lắng cát, bể điều hòa, lắng sơ cấp (M&E)
   Hóa lý     : keo tụ – tạo bông – lắng/lamella/DAF, lọc cát/đĩa/GAC/UF/RO
   Tách bùn   : nén bùn (trọng lực/DAF/băng tải/trống/ly tâm), tách nước (ly tâm/băng tải ép/trục vít/khung bản)
   Xử lý bùn  : phân hủy hiếu khí, thủy phân nhiệt (THP), sấy bùn, kết tinh struvite
   Sinh học   : bể dòng đẩy (PFR – chuỗi ngăn), lọc sinh học BAF / lọc nhỏ giọt (động học màng ở plant.js)
   AOP        : Fenton, O₃, O₃/H₂O₂, UV/H₂O₂, H₂O₂, UV, NaOCl (clo hóa – điểm đột biến)
   Mỗi loại khai báo: UT[type] (giao diện, cửa) và UNITX[type] (hook tính toán gọi từ compilePlant):
     ns, init, rows, qdyn (dòng đáy theo chất rắn), sep (đơn vị không thể tích), out/deriv/y0/info (đơn vị có thể tích),
     denseIdx (biến quyết định lưu lượng), reactor (tính vào cụm sinh học), glyph/geom (vẽ sơ đồ), rep (bảng kết quả).
   Bảo toàn: COD, N, P giữ đúng – phần N/P thay đổi do chuyển dạng (vd. thủy phân) được trả về NH₄/PO₄ theo ma trận thành phần;
   COD bị khoáng hóa bởi chất oxy hóa, N₂ của clo hóa, P/N của struvite được ghi vào info để cân bằng toàn nhà máy.
   ========================================================================== */
const UNITX = {};
const XU = (() => {
  // nhóm thành phần theo mô hình (ASM1 / ASM2d và biến thể bùn hạt)
  function cats(m) {
    if (m._xc) return m._xc;
    const I = m.idx, has = id => I[id] !== undefined, g = id => has(id) ? I[id] : -1;
    const L = ids => ids.filter(has).map(g);
    const c = {
      SI: g('SI'), SB: m.fam === 'ASM1' ? L(['SS']) : L(['SF', 'SA']), SBm: m.fam === 'ASM1' ? g('SS') : g('SF'), SA: g('SA'),
      XI: L(['XI', 'XP', 'XE']), XS: L(['XS', 'XSE', 'XSTO']), BIOM: L(['XBH', 'XBA', 'XNOB', 'XAMX', 'XCMX', 'XH', 'XPAO', 'XAUT']), XPHA: g('XPHA'), XPP: g('XPP'),
      ISS: L(['XISS', 'XMeOH', 'XMeP']), XISS: g('XISS'), XMeOH: g('XMeOH'), XMeP: g('XMeP'),
      NH: g(m.NH), NO: g(m.NO), NO2: m.NO2 ? g(m.NO2) : -1, PO: m.PO ? g(m.PO) : -1, ALK: g(m.ALK), SO: g(m.SO), N2: g('SN2'), TIC: g('STIC'), XND: g('XND'), SND: g('SND'),
      gases: L([m.SO, 'SN2', 'STIC'])
    };
    // bùn hạt: bản sao "trong hạt" thuộc cùng nhóm với thành phần bông
    if (m.gran) for (const [s, gg] of m.gran) for (const k of ['XI', 'XS', 'BIOM', 'ISS']) if (c[k].includes(s)) c[k].push(gg);
    c.XB = c.XS.concat(c.BIOM, c.XPHA >= 0 ? [c.XPHA] : []);
    return (m._xc = c);
  }
  const tss = (c, X) => { let s = 0; for (let k = 0; k < X.nPart; k++) s += X.tssP[k] * Math.max(c[X.partIdx[k]], 0); return s; };
  // giữ N, P: phần chênh do chuyển dạng trả về NH₄ / PO₄
  function fixNP(c0, c, X) {
    const C = cats(X.m), cN = X.comp.N, cP = X.comp.P;
    if (cN && C.NH >= 0) { let d = 0; for (let k = 0; k < X.n; k++) d += cN[k] * (c[k] - c0[k]); c[C.NH] = c[C.NH] - d / (cN[C.NH] || 1); }
    if (cP && C.PO >= 0) { let d = 0; for (let k = 0; k < X.n; k++) d += cP[k] * (c[k] - c0[k]); c[C.PO] = c[C.PO] - d / (cP[C.PO] || 1); }
  }
  // tách 2 dòng theo phần khối lượng vào dòng đáy f[k]; dùng lưu lượng thực của hệ (bảo toàn khối lượng tuyệt đối)
  function split(cu, c, q, X, f, outP, undP) {
    const Qo = X.Qv[cu.outs[outP]], Qu = X.Qv[cu.outs[undP]], co = X.C[cu.outs[outP]], cw = X.C[cu.outs[undP]];
    for (let k = 0; k < X.n; k++) {
      const mass = c[k] * q, fu = Qu > 1e-9 ? f[k] : 0, mu = mass * fu;
      cw[k] = Qu > 1e-9 ? mu / Qu : c[k];
      co[k] = Qo > 1e-9 ? (mass - mu) / Qo : c[k];
    }
    return { Qo, Qu };
  }
  // vector phần chất hạt vào dòng đáy: chất hạt theo eff(k), chất hòa tan theo tỷ lệ lưu lượng (hoặc giữ lại rej)
  function fracVec(cu, X, eff, q, rej) {
    const f = cu._f || (cu._f = new Float64Array(X.n)), Qu = X.Qv[cu.outs.und] || 0, r = q > 1e-9 ? Math.min(Qu / q, 1) : 0;
    for (let k = 0; k < X.n; k++) f[k] = X.isPart[k] ? eff(k) : rej && rej[k] != null ? r + (1 - r) * rej[k] : r;
    return f;
  }
  const clamp01 = v => Math.min(Math.max(+v || 0, 0), 1);
  const rd = (v, d = 3) => +(+v).toPrecision(d);
  return { cats, tss, fixNP, split, fracVec, clamp01, rd };
})();

/* ---------- giao diện chung ---------- */
const _num = (k, l, u, o) => Object.assign({ k, l, u, t: 'num' }, o || {});
const _sel = (k, l, opts, o) => Object.assign({ k, l, t: 'sel', opts }, o || {});
/* hình vẽ đơn giản cho sơ đồ */
const _G = {
  box: (w, h, fill, stroke, txt, tc) => `<rect class="outline" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` + (txt ? `<text x="0" y="${h / 2 - 6}" text-anchor="middle" font-size="9" font-weight="700" fill="${tc || stroke}">${txt}</text>` : ''),
  water: (w, h, top) => `<rect x="${-w / 2 + 3}" y="${-h / 2 + (top || 12)}" width="${w - 6}" height="${h - (top || 12) - 3}" fill="url(#gW)"/>`
};

/* ======================================================================== TIỀN XỬ LÝ */
UT.screen = {
  plabel: { out: 'ra', und: 'rác' },
  label: 'Song chắn / lưới lọc rác', group: 'Tiền xử lý', ins: ['in'], outs: ['out', 'und'],
  fields: [
    _sel('kind', 'Loại', [['coarse', 'Song chắn rác thô (khe 15 – 75 mm)'], ['fine', 'Lưới tinh bậc thang (1 – 6 mm)'], ['micro', 'Lưới siêu mịn / trống quay (≤ 1 mm, trước MBR)']]),
    _num('cap', 'Phần chất rắn hạt (XS, XI, ISS) bị giữ lại', '%', { hint: () => 'Thô 2 – 5 %; tinh 5 – 15 %; siêu mịn 15 – 30 %' }),
    _num('DS', 'Độ khô rác sau ép', '%'),
    _num('kW', 'Công suất thiết bị (song chắn, băng tải, ép rác)', 'kW')
  ],
  def: () => ({ kind: 'fine', cap: 8, DS: 25, kW: 3 }), geom: { w: 70, h: 54 },
  glyph: (u, w, h) => { let s = _G.box(w, h, '#eef6ff', '#3b5b85'); for (let i = 0; i < 8; i++) s += `<line x1="${-w / 2 + 10 + i * 7}" y1="${-h / 2 + 8}" x2="${-w / 2 + 6 + i * 7}" y2="${h / 2 - 12}" stroke="#475569" stroke-width="${u.p.kind === 'coarse' ? 2 : 1}"/>`; return s + `<text x="0" y="${h / 2 - 3}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#334155">${u.p.kind === 'coarse' ? 'SC RÁC' : 'LƯỚI TINH'}</text>`; }
};
UT.grit = {
  plabel: { out: 'ra', und: 'cát' },
  label: 'Bể lắng cát (thổi khí / xoáy / ngang)', group: 'Tiền xử lý', ins: ['in'], outs: ['out', 'und'],
  fields: [
    _sel('kind', 'Loại', [['aerated', 'Lắng cát thổi khí (kèm tách dầu mỡ)'], ['vortex', 'Lắng cát xoáy'], ['horiz', 'Lắng cát ngang']]),
    _num('eISS', 'Hiệu suất giữ chất rắn vô cơ (cát)', '%', { hint: () => 'Phần ISS là cát ≥ 0,2 mm – thường 30 – 60 % ISS nước thô' }),
    _num('eOrg', 'Chất hữu cơ hạt bị cuốn theo cát', '%'),
    _num('DS', 'Độ khô cát sau phân loại', '%'),
    _num('air', 'Khí cấp (lắng cát thổi khí)', 'Nm³/h', { show: p => p.kind === 'aerated' }),
    _num('kW', 'Công suất cầu cào/bơm cát/phân loại', 'kW')
  ],
  def: () => ({ kind: 'aerated', eISS: 45, eOrg: 2, DS: 60, air: 300, kW: 4 }), geom: { w: 84, h: 50 },
  glyph: (u, w, h) => _G.box(w, h, '#f5efe0', '#8a6a3a') + `<path d="M${-w / 2 + 6},${h / 2 - 16} q${w / 4},10 ${w / 2 - 6},0 t${w / 2 - 6},0" fill="none" stroke="#8a6a3a" stroke-width="1.4"/>` + '<g fill="#a16207">' + [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${-w / 2 + 12 + i * 11}" cy="${h / 2 - 20 + (i % 2) * 3}" r="1.8"/>`).join('') + `</g><text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="9" font-weight="700" fill="#6b4f1d">LẮNG CÁT</text>`
};
UT.pclar = {
  plabel: { out: 'tràn', und: 'bùn' },
  label: 'Lắng sơ cấp (theo thời gian lưu – M&E)', group: 'Tiền xử lý', ins: ['in'], outs: ['out', 'und'],
  fields: [
    _num('A', 'Diện tích bề mặt', 'm²'), _num('H', 'Chiều sâu công tác', 'm'),
    _sel('mode', 'Hiệu suất khử TSS', [['me', 'Theo thời gian lưu: R = t/(a + b·t) (M&E PT 5-45)'], ['fix', 'Nhập trực tiếp']]),
    _num('a', 'Hằng số a (TSS)', 'h', { show: p => p.mode === 'me', adv: 1 }), _num('b', 'Hằng số b (TSS)', '-', { show: p => p.mode === 'me', adv: 1 }),
    _num('rem', 'Hiệu suất khử TSS', '%', { show: p => p.mode === 'fix' }),
    _num('DS', 'Nồng độ bùn sơ cấp', '%'), _num('kW', 'Công suất cầu gạt + bơm bùn', 'kW')
  ],
  def: () => ({ A: 600, H: 3.5, mode: 'me', a: 0.0075, b: 0.014, rem: 55, DS: 4, kW: 3 }), geom: { w: 100, h: 66 },
  glyph: (u, w, h) => `<path class="outline" d="M${-w / 2},${-h / 2} H${w / 2} V${h * 0.1} L8,${h / 2} H-8 L${-w / 2},${h * 0.1} Z" fill="#e8eef5" stroke="#3b5b85" stroke-width="1.5"/><text x="0" y="${-h / 2 + 13}" text-anchor="middle" font-size="9" font-weight="700" fill="#1e3a5f">SƠ CẤP</text>`
};
UT.eqtank = {
  label: 'Bể điều hòa (mực nước thay đổi)', group: 'Tiền xử lý', ins: ['in'], outs: ['out'],
  fields: [
    _num('Vmax', 'Thể tích công tác tối đa', 'm³'), _num('Vmin', 'Thể tích tối thiểu (bơm dừng)', 'm³'), _num('H', 'Chiều sâu nước tối đa', 'm'),
    _sel('qmode', 'Lưu lượng bơm ra', [['auto', 'Theo lưu lượng trung bình dòng vào trạm × hệ số'], ['Q', 'Lưu lượng cố định']]),
    _num('kQ', 'Hệ số × Q trung bình', '-', { show: p => p.qmode !== 'Q' }), _num('Qset', 'Lưu lượng bơm', 'm³/d', { show: p => p.qmode === 'Q' }),
    _sel('aer', 'Khuấy trộn', [['none', 'Máy khuấy chìm (không sục khí)'], ['kla', 'Sục khí khuấy trộn (kLa cố định)']]),
    _num('kla', 'kLa', '1/d', { show: p => p.aer === 'kla' }), _num('mix', 'Công suất khuấy', 'W/m³'), _num('lv0', 'Mực nước ban đầu', '% V_max', { adv: 1 })
  ],
  def: () => ({ Vmax: 3000, Vmin: 300, H: 5, qmode: 'auto', kQ: 1, Qset: 20000, aer: 'none', kla: 20, mix: 5, lv0: 50 }), geom: { w: 96, h: 62 },
  glyph: (u, w, h) => _G.box(w, h, '#d6ebfb', '#3b5b85') + `<rect x="${-w / 2 + 3}" y="${-2}" width="${w - 6}" height="${h / 2 - 1}" fill="url(#gW)"/><path d="M${-w / 2 + 3},-2 q10,-5 20,0 t20,0 t20,0 t20,0" fill="none" stroke="#1d4ed8"/><text x="0" y="${-h / 2 + 13}" text-anchor="middle" font-size="9" font-weight="700" fill="#1e3a5f">ĐIỀU HÒA</text>`
};

/* ======================================================================== HÓA LÝ */
const COAG = { pac: ['PAC (Al ≈ 15 %)', 'Al', 0.15], fecl2: ['FeCl₂ 30 % (Fe ≈ 13,2 %, oxy hóa lên Fe³⁺)', 'Fe', 0.132], alum: ['Phèn nhôm Al₂(SO₄)₃·14H₂O (Al ≈ 9 %)', 'Al', 0.09], fecl3: ['FeCl₃ 40 % (Fe ≈ 13,8 %)', 'Fe', 0.138], feso4: ['FeSO₄·7H₂O (Fe ≈ 20 %)', 'Fe', 0.2] };
UT.chem = {
  plabel: { out: 'ra', und: 'bùn' },
  label: 'Keo tụ – tạo bông – lắng / tuyển nổi', group: 'Hóa lý', ins: ['in'], outs: ['out', 'und'],
  fields: [
    _sel('sep', 'Tách pha', [['settle', 'Lắng thường (ly tâm/ngang)'], ['lamella', 'Lắng lamella'], ['daf', 'Tuyển nổi DAF']]),
    _sel('coag', 'Chất keo tụ', Object.entries(COAG).map(([k, v]) => [k, v[0]])),
    _num('dose', 'Liều chất keo tụ (sản phẩm thương mại)', 'mg/L'), _num('poly', 'Liều polymer', 'mg/L'),
    _num('R0', 'Hiệu suất khử TSS khi không châm hóa chất', '%'), _num('Rmax', 'Hiệu suất khử TSS tối đa', '%'),
    _num('sRem', 'Khử COD hòa tan (keo, hấp phụ trên bông)', '%'), _num('DS', 'Nồng độ bùn tách ra', '%'),
    _num('kW', 'Công suất (khuấy nhanh/chậm, gạt bùn, bơm tuần hoàn DAF)', 'kW'),
    _num('solC', 'Nồng độ dung dịch keo tụ pha', '% kl', { adv: 1 }), _num('solRho', 'Khối lượng riêng dung dịch keo tụ', 'kg/L', { adv: 1 }),
    _num('polyC', 'Nồng độ dung dịch polymer pha', '% kl', { adv: 1 })
  ],
  def: () => ({ sep: 'settle', coag: 'pac', dose: 60, poly: 1, R0: 50, Rmax: 88, sRem: 10, DS: 1.5, kW: 8, solC: 10, solRho: 1.05, polyC: 0.1 }), geom: { w: 104, h: 64 },
  glyph: (u, w, h) => { let s = _G.box(w, h, '#fff7ed', '#b45309') + `<line x1="${-w / 6}" y1="${-h / 2}" x2="${-w / 6}" y2="${h / 2}" stroke="#b45309"/><line x1="${w / 6}" y1="${-h / 2}" x2="${w / 6}" y2="${h / 2}" stroke="#b45309"/>`; s += `<path d="M${-w / 2 + 8},0 l8,-6 l8,6 l8,-6" fill="none" stroke="#b45309"/>`; if (u.p.sep === 'lamella') for (let i = 0; i < 4; i++) s += `<line x1="${w / 6 + 6 + i * 7}" y1="${h / 2 - 8}" x2="${w / 6 + 14 + i * 7}" y2="${-h / 2 + 18}" stroke="#64748b"/>`; return s + `<text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#92400e">${u.p.sep === 'daf' ? 'KEO TỤ – DAF' : 'KEO TỤ – LẮNG'}</text>`; }
};
const FILT = { sand: ['Lọc cát nhanh', 70, 3], disc: ['Lọc đĩa vải', 80, 2], gac: ['Lọc than hoạt tính GAC', 70, 3], uf: ['Siêu lọc UF', 99.9, 8], ro: ['Thẩm thấu ngược RO', 100, 25] };
UT.filter = {
  plabel: { out: 'ra', und: 'rửa/cô đặc' },
  label: 'Lọc bậc 3 / màng (cát, đĩa, GAC, UF, RO)', group: 'Hóa lý', ins: ['in'], outs: ['out', 'und'],
  fields: [
    _sel('kind', 'Loại', Object.entries(FILT).map(([k, v]) => [k, v[0]])),
    _num('cap', 'Hiệu suất giữ chất rắn', '%', { hint: p => 'Điển hình ' + FILT[p.kind][1] + ' %' }),
    _num('bw', 'Nước rửa lọc / dòng cô đặc (% dòng vào)', '%', { hint: p => 'Điển hình ' + FILT[p.kind][2] + ' % (RO: 100 − độ thu hồi)' }),
    _num('sRem', 'Hấp phụ COD hòa tan (GAC)', '%', { show: p => p.kind === 'gac' }),
    _num('rej', 'Độ loại bỏ chất hòa tan (RO)', '%', { show: p => p.kind === 'ro' }),
    _num('kWh', 'Điện năng riêng', 'kWh/m³')
  ],
  def: () => ({ kind: 'disc', cap: 80, bw: 2, sRem: 40, rej: 97, kWh: 0.02 }), geom: { w: 84, h: 58 },
  glyph: (u, w, h) => { let s = _G.box(w, h, '#f1f5f9', '#334155'); if (u.p.kind === 'uf' || u.p.kind === 'ro') { for (let i = 0; i < 5; i++) s += `<rect x="${-w / 2 + 10 + i * 13}" y="${-h / 2 + 16}" width="7" height="${h - 30}" fill="#fff" stroke="#64748b"/>`; } else s += `<rect x="${-w / 2 + 6}" y="${-2}" width="${w - 12}" height="${h / 2 - 10}" fill="#fde68a" stroke="#a16207"/>` + `<rect x="${-w / 2 + 6}" y="${-h / 2 + 16}" width="${w - 12}" height="14" fill="url(#gW)"/>`; return s + `<text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#1f2937">${{ sand: 'LỌC CÁT', disc: 'LỌC ĐĨA', gac: 'GAC', uf: 'UF', ro: 'RO' }[u.p.kind] || 'LỌC'}</text>`; }
};

/* ======================================================================== TÁCH BÙN */
const THK = { gravity: ['Nén trọng lực', 90, 5, 0, 1], daf: ['Nén tuyển nổi DAF', 95, 4, 2, 60], belt: ['Nén băng tải (GBT)', 95, 6, 4, 15], drum: ['Nén trống quay', 93, 6, 4, 10], centrifuge: ['Nén ly tâm', 95, 6, 3, 40] };
UT.thicken = {
  plabel: { out: 'nước tách', und: 'bùn đặc' },
  label: 'Nén bùn (trọng lực / DAF / băng tải / trống / ly tâm)', group: 'Tách bùn', ins: ['in'], outs: ['out', 'und'],
  fields: [
    _sel('kind', 'Loại', Object.entries(THK).map(([k, v]) => [k, v[0]])),
    _num('capt', 'Hiệu suất thu hồi chất rắn', '%', { hint: p => 'Điển hình ' + THK[p.kind][1] + ' %' }),
    _sel('qm', 'Cách tính lưu lượng bùn', [['ds', 'Theo độ khô đặt (lưu lượng bùn tự tính)'], ['ratio', 'Tỷ lệ lưu lượng bùn / lưu lượng vào cố định']]),
    _num('rU', 'Lưu lượng bùn / lưu lượng vào', '%', { show: p => p.qm === 'ratio' }),
    _num('DS', 'Nồng độ bùn sau nén', '%', { show: p => p.qm !== 'ratio', hint: p => 'Điển hình ' + THK[p.kind][2] + ' %' }),
    _num('poly', 'Polymer', 'kg/tấn DS'), _num('kWh', 'Điện năng', 'kWh/tấn DS')
  ],
  def: () => ({ kind: 'gravity', capt: 90, qm: 'ds', rU: 10, DS: 5, poly: 0, kWh: 1 }), geom: { w: 80, h: 66 },
  glyph: (u, w, h) => `<path class="outline" d="M${-w / 2},${-h / 2} H${w / 2} V${0} L6,${h / 2} H-6 L${-w / 2},0 Z" fill="#efe6d4" stroke="#6b4f1d" stroke-width="1.5"/><path d="M${-w / 2 + 6},${-4} H${w / 2 - 6} L4,${h / 2 - 4} H-4 Z" fill="#a07c45" opacity=".55"/><text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#4a3412">NÉN BÙN</text>`
};
const DWT = { centrifuge: ['Ly tâm', 95, 22, 8, 70], belt: ['Băng tải ép', 93, 18, 5, 15], screw: ['Ép trục vít', 95, 18, 6, 10], press: ['Ép khung bản', 98, 30, 2, 30] };
UT.dewater = {
  plabel: { out: 'nước tách', und: 'bánh bùn' },
  label: 'Tách nước bùn (ly tâm / băng tải / trục vít / khung bản)', group: 'Tách bùn', ins: ['in'], outs: ['out', 'und'],
  fields: [
    _sel('kind', 'Loại', Object.entries(DWT).map(([k, v]) => [k, v[0]])),
    _num('capt', 'Hiệu suất thu hồi chất rắn', '%', { hint: p => 'Điển hình ' + DWT[p.kind][1] + ' %' }),
    _sel('qm', 'Cách tính lưu lượng bùn', [['ds', 'Theo độ khô đặt (lưu lượng bùn tự tính)'], ['ratio', 'Tỷ lệ lưu lượng bùn / lưu lượng vào cố định']]),
    _num('rU', 'Lưu lượng bùn / lưu lượng vào', '%', { show: p => p.qm === 'ratio' }),
    _num('DS', 'Độ khô bánh bùn', '%', { show: p => p.qm !== 'ratio', hint: p => 'Điển hình ' + DWT[p.kind][2] + ' %' }),
    _num('poly', 'Polymer', 'kg/tấn DS'), _num('kWh', 'Điện năng', 'kWh/tấn DS')
  ],
  def: () => ({ kind: 'centrifuge', capt: 95, qm: 'ds', rU: 5, DS: 22, poly: 8, kWh: 70 }), geom: { w: 88, h: 52 },
  glyph: (u, w, h) => _G.box(w, h, '#efe6d4', '#6b4f1d') + (u.p.kind === 'centrifuge' ? `<ellipse cx="0" cy="-2" rx="${w / 2 - 10}" ry="9" fill="#d6c19a" stroke="#6b4f1d"/>` : `<circle cx="-18" cy="-2" r="8" fill="#d6c19a" stroke="#6b4f1d"/><circle cx="0" cy="-2" r="8" fill="#d6c19a" stroke="#6b4f1d"/><circle cx="18" cy="-2" r="8" fill="#d6c19a" stroke="#6b4f1d"/>`) + `<text x="0" y="${h / 2 - 5}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#4a3412">TÁCH NƯỚC</text>`
};

/* ======================================================================== XỬ LÝ BÙN */
UT.aerdig = {
  label: 'Phân hủy bùn hiếu khí', group: 'Xử lý bùn', ins: ['in'], outs: ['out'],
  fields: [_num('V', 'Thể tích', 'm³'), _num('H', 'Chiều sâu nước', 'm')].concat(AER_FIELDS),
  def: () => ({ V: 2000, H: 5, aer: 'do', kla: 100, DOsp: 1.5, klaMax: 600, mix: 10 }), geom: { w: 84, h: 64 },
  glyph: (u, w, h) => _G.box(w, h, '#efe6d4', '#6b4f1d') + `<rect x="${-w / 2 + 3}" y="${-h / 2 + 12}" width="${w - 6}" height="${h - 15}" fill="#b08a55" opacity=".45"/><line x1="${-w / 2 + 8}" y1="${h / 2 - 5}" x2="${w / 2 - 8}" y2="${h / 2 - 5}" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="4 3"/><text x="0" y="${-h / 2 + 11}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#4a3412">PHÂN HỦY HK</text>`
};
UT.stank = {
  label: 'Bể chứa bùn (thể tích cố định, khuấy trộn)', group: 'Xử lý bùn', ins: ['in'], outs: ['out'],
  fields: [_num('V', 'Thể tích', 'm³'), _num('H', 'Chiều sâu nước', 'm'), _num('mix', 'Công suất khuấy', 'W/m³')],
  def: () => ({ V: 400, H: 4, aer: 'none', mix: 5 }), geom: { w: 76, h: 58 },
  glyph: (u, w, h) => _G.box(w, h, '#efe6d4', '#6b4f1d') + `<rect x="${-w / 2 + 3}" y="${-h / 2 + 16}" width="${w - 6}" height="${h - 19}" fill="#b08a55" opacity=".35"/><text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#6b4f1d">CHỨA BÙN</text>`
};
UT.thp = {
  label: 'Thủy phân nhiệt bùn (THP)', group: 'Xử lý bùn', ins: ['in'], outs: ['out'],
  fields: [
    _num('fBio', 'Phần chất hữu cơ hạt phân hủy được (XS, sinh khối) hòa tan', '%'), _num('fIn', 'Phần COD hạt trơ chuyển thành hòa tan trơ', '%'),
    _num('T', 'Nhiệt độ thủy phân', '°C'), _num('steam', 'Hơi tiêu thụ', 't/t DS'), _num('kWh', 'Điện năng (bơm, xả áp)', 'kWh/t DS')
  ],
  def: () => ({ fBio: 40, fIn: 12, T: 165, steam: 1.1, kWh: 30 }), geom: { w: 70, h: 56 },
  glyph: (u, w, h) => _G.box(w, h, '#fee2e2', '#b91c1c') + `<path d="M-12,8 q-6,-8 0,-16 q6,-8 0,-16 M0,8 q-6,-8 0,-16 q6,-8 0,-16 M12,8 q-6,-8 0,-16 q6,-8 0,-16" fill="none" stroke="#b91c1c" stroke-width="1.4"/><text x="0" y="${h / 2 - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="#991b1b">THP</text>`
};
UT.dryer = {
  plabel: { out: 'hơi nước', und: 'bùn khô' },
  label: 'Sấy bùn', group: 'Xử lý bùn', ins: ['in'], outs: ['out', 'und'],
  fields: [_num('DS', 'Độ khô bùn sau sấy', '%'), _num('eTh', 'Nhiệt tiêu thụ', 'kWh/kg nước bay hơi'), _num('kWh', 'Điện năng', 'kWh/t DS')],
  def: () => ({ DS: 90, eTh: 0.9, kWh: 60 }), geom: { w: 80, h: 52 },
  glyph: (u, w, h) => _G.box(w, h, '#fef3c7', '#b45309') + `<rect x="${-w / 2 + 8}" y="-6" width="${w - 16}" height="12" rx="6" fill="#fcd34d" stroke="#b45309"/><text x="0" y="${h / 2 - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="#92400e">SẤY BÙN</text>`
};
UT.struvite = {
  label: 'Kết tinh struvite (thu hồi P)', group: 'Xử lý bùn', ins: ['in'], outs: ['out'],
  fields: [_num('eff', 'Hiệu suất thu hồi PO₄-P', '%'), _num('MgP', 'Tỷ lệ mol Mg:P', '-'), _num('pH', 'pH vận hành', '-'), _num('kW', 'Công suất', 'kW')],
  def: () => ({ eff: 85, MgP: 1.3, pH: 8.3, kW: 5 }), geom: { w: 60, h: 70 },
  glyph: (u, w, h) => `<path class="outline" d="M${-w / 2 + 8},${-h / 2} H${w / 2 - 8} V${h / 4} L0,${h / 2} L${-w / 2 + 8},${h / 4} Z" fill="#ecfeff" stroke="#0e7490" stroke-width="1.5"/>` + [0, 1, 2].map(i => `<path d="M${-8 + i * 8},${8 + (i % 2) * 5} l4,-6 l4,6 l-4,6 z" fill="#a5f3fc" stroke="#0e7490"/>`).join('') + `<text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="8" font-weight="700" fill="#155e75">STRUVITE</text>`
};

/* ======================================================================== SINH HỌC BỔ SUNG */
UT.pfr = {
  label: 'Bể dòng đẩy (PFR – chuỗi ngăn nối tiếp)', group: 'Bể sinh học', ins: ['in'], outs: ['out'],
  fields: [_num('V', 'Tổng thể tích', 'm³'), _num('H', 'Chiều sâu nước', 'm'), _num('nSeg', 'Số ngăn tính (xấp xỉ dòng đẩy)', ''), _num('nAnox', 'Số ngăn đầu không sục khí (thiếu khí)', '')].concat(AER_FIELDS),
  def: () => ({ V: 6000, H: 5, nSeg: 5, nAnox: 0, aer: 'do', kla: 120, DOsp: 2, klaMax: 600, mix: 5 }), geom: { w: 140, h: 56 },
  glyph: (u, w, h) => { const ns = Math.max(1, Math.min(10, Math.round(+u.p.nSeg || 5))), na = Math.round(+u.p.nAnox || 0); let s = _G.box(w, h, '#d6ebfb', '#3b5b85') + _G.water(w, h, 10); for (let i = 1; i < ns; i++) s += `<line x1="${-w / 2 + i * w / ns}" y1="${-h / 2 + 6}" x2="${-w / 2 + i * w / ns}" y2="${h / 2 - 3}" stroke="#334155" stroke-width="1"/>`; for (let i = na; i < ns; i++) if (u.p.aer !== 'none') s += `<line x1="${-w / 2 + i * w / ns + 4}" y1="${h / 2 - 5}" x2="${-w / 2 + (i + 1) * w / ns - 4}" y2="${h / 2 - 5}" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="3 3"/>`; return s + `<text x="0" y="${-h / 2 + 9}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#1e3a5f">PFR</text>`; }
};
UT.baf = {
  plabel: { out: 'ra', und: 'rửa ngược' },
  label: 'Lọc sinh học BAF / lọc nhỏ giọt', group: 'Bể sinh học', ins: ['in'], outs: ['out', 'und'],
  fields: [
    _sel('kind', 'Loại', [['baf', 'BAF – lọc sinh học ngập nước có sục khí'], ['tf', 'Lọc sinh học nhỏ giọt (thông khí tự nhiên)']]),
    _num('V', 'Thể tích lớp vật liệu (cả rỗng)', 'm³'), _num('H', 'Chiều sâu nước / chiều cao tháp', 'm'), _num('Hm', 'Chiều cao lớp vật liệu', 'm'),
    _num('fill', 'Tỷ lệ thể tích vật liệu', '-'), _num('SSA', 'Diện tích bề mặt riêng vật liệu', 'm²/m³'),
    _num('cap', 'Hiệu suất giữ chất rắn (lọc)', '%'), _num('bw', 'Nước rửa ngược (% dòng vào)', '%'),
    { k: 'aer', l: 'Cấp khí', t: 'sel', opts: [['do', 'Điều khiển DO (BAF)'], ['kla', 'kLa cố định (thông khí tự nhiên)'], ['none', 'Không sục khí (BAF khử nitrat)']] },
    _num('DOsp', 'DO đặt', 'mg/L', { show: p => p.aer === 'do' }), _num('kla', 'kLa', '1/d', { show: p => p.aer === 'kla' }), _num('klaMax', 'kLa tối đa', '1/d', { show: p => p.aer === 'do' }),
    _num('Lf', 'Bề dày màng tối đa', 'µm', { adv: 1 }), _num('nLay', 'Số lớp màng', '', { adv: 1 }), _num('Lbl', 'Lớp biên khuếch tán', 'µm', { adv: 1 }), _num('XfTSS', 'Mật độ màng', 'g TSS/m³', { adv: 1 }), _num('mix', 'Khuấy', 'W/m³', { adv: 1 })
  ],
  def: () => ({ kind: 'baf', V: 800, H: 5, Hm: 3.5, fill: 0.6, SSA: 1200, cap: 75, bw: 8, aer: 'do', DOsp: 3, kla: 60, klaMax: 900, Lf: 150, nLay: 4, Lbl: 30, XfTSS: 35000, mix: 0 }), geom: { w: 70, h: 78 },
  glyph: (u, w, h) => { let s = _G.box(w, h, '#e0f2fe', '#0f4c81') + `<rect x="${-w / 2 + 5}" y="${-h / 2 + 18}" width="${w - 10}" height="${h - 34}" fill="#fde68a" stroke="#a16207"/>`; for (let i = 0; i < 12; i++) s += `<circle cx="${-w / 2 + 11 + (i % 4) * 16}" cy="${-h / 2 + 25 + Math.floor(i / 4) * 12}" r="3" fill="#f59e0b"/>`; return s + `<text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="9" font-weight="700" fill="#0f4c81">${u.p.kind === 'tf' ? 'NHỎ GIỌT' : 'BAF'}</text>`; }
};

/* ======================================================================== AOP & KHỬ TRÙNG */
const AOPK = {
  fenton: { n: 'Fenton (Fe²⁺/H₂O₂)', eta: 60, k: 0.05, kWh: 0.02 }, o3: { n: 'Ozone (O₃)', eta: 70, k: 0.2, kWh: 0 }, o3h2o2: { n: 'Peroxone (O₃/H₂O₂)', eta: 80, k: 0.3, kWh: 0 },
  uvh2o2: { n: 'UV/H₂O₂', eta: 50, k: 0.1, kWh: 0.3 }, h2o2: { n: 'H₂O₂ đơn lẻ', eta: 5, k: 0.01, kWh: 0.01 }, uv: { n: 'UV (khử trùng)', eta: 0, k: 1, kWh: 0.04 }, naocl: { n: 'NaOCl (clo hóa, điểm đột biến)', eta: 30, k: 0.1, kWh: 0.005 }
};
UT.aop = {
  label: 'Oxy hóa nâng cao (AOP) / khử trùng', group: 'AOP & khử trùng', ins: ['in'], outs: ['out'],
  fields: [
    _sel('kind', 'Công nghệ', Object.entries(AOPK).map(([k, v]) => [k, v.n])),
    _num('V', 'Thể tích bể phản ứng / tiếp xúc', 'm³'),
    _num('H2O2', 'Liều H₂O₂ (100 %)', 'mg/L', { show: p => ['fenton', 'o3h2o2', 'uvh2o2', 'h2o2'].includes(p.kind) }),
    _num('Fe', 'Liều Fe²⁺', 'mg/L', { show: p => p.kind === 'fenton' }),
    _num('pH', 'pH phản ứng', '-', { show: p => p.kind === 'fenton' }),
    _num('O3', 'Liều O₃ (đã hòa tan)', 'mg/L', { show: p => p.kind === 'o3' || p.kind === 'o3h2o2' }),
    _num('UVd', 'Liều UV (fluence)', 'mJ/cm²', { show: p => p.kind === 'uv' || p.kind === 'uvh2o2' }),
    _num('Cl2', 'Liều clo hoạt tính (NaOCl)', 'mg Cl₂/L', { show: p => p.kind === 'naocl' }),
    _num('eta', 'Hiệu suất sử dụng chất oxy hóa', '%', { hint: p => 'Điển hình ' + AOPK[p.kind].eta + ' % – hiệu chỉnh theo thí nghiệm (Jar test)' }),
    _num('k', 'Hằng số tốc độ tiêu thụ chất oxy hóa', '1/phút', { adv: 1, hint: p => 'Mặc định ' + AOPK[p.kind].k }),
    _num('wSI', 'Khả năng phản ứng COD trơ so với COD phân hủy được', '-', { adv: 1 }),
    _num('fMin', 'Phần COD bị oxy hóa được khoáng hóa (CO₂)', '%'),
    _num('kWhO3', 'Điện năng sản xuất O₃', 'kWh/kg O₃', { show: p => p.kind === 'o3' || p.kind === 'o3h2o2' }),
    _num('kWh', 'Điện năng khác (khuấy, đèn UV, bơm)', 'kWh/m³'),
    _num('h2o2C', 'Nồng độ H₂O₂ thương phẩm', '% kl', { adv: 1, show: p => ['fenton', 'o3h2o2', 'uvh2o2', 'h2o2'].includes(p.kind) }),
    _num('clC', 'Nồng độ NaOCl thương phẩm (Cl₂ hoạt tính)', '% kl', { adv: 1, show: p => p.kind === 'naocl' })
  ],
  def: () => ({ kind: 'fenton', V: 300, H2O2: 300, Fe: 60, pH: 3, O3: 50, UVd: 400, Cl2: 8, eta: 60, k: 0.05, wSI: 1, fMin: 50, kWhO3: 12, kWh: 0.02, h2o2C: 50, clC: 10 }), geom: { w: 90, h: 60 },
  glyph: (u, w, h) => { const k = u.p.kind; let s = _G.box(w, h, k === 'uv' || k === 'uvh2o2' ? '#f5f3ff' : k === 'naocl' ? '#ecfdf5' : '#fdf4ff', '#7c3aed') + _G.water(w, h, 14); if (k === 'uv' || k === 'uvh2o2') for (let i = 0; i < 4; i++) s += `<rect x="${-w / 2 + 12 + i * 18}" y="${-6}" width="6" height="18" rx="3" fill="#c4b5fd" stroke="#6d28d9"/>`; else s += `<path d="M-14,10 l6,-12 l4,8 l6,-14" fill="none" stroke="#7c3aed" stroke-width="1.6"/><text x="16" y="10" font-size="11" fill="#7c3aed">•OH</text>`; return s + `<text x="0" y="${-h / 2 + 11}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#5b21b6">${{ fenton: 'FENTON', o3: 'OZONE', o3h2o2: 'O₃/H₂O₂', uvh2o2: 'UV/H₂O₂', h2o2: 'H₂O₂', uv: 'UV', naocl: 'CLO HÓA' }[k]}</text>`; }
};
Object.assign(ACTUATORS, {
  chem: [['dose', 'Liều chất keo tụ (mg/L)']], aop: [['H2O2', 'Liều H₂O₂ (mg/L)'], ['O3', 'Liều O₃ (mg/L)'], ['Cl2', 'Liều clo (mg/L)'], ['Fe', 'Liều Fe²⁺ (mg/L)']],
  eqtank: [['Qset', 'Lưu lượng bơm điều hòa (m³/d)']], aerdig: [['kla', 'kLa (1/d)'], ['DOsp', 'DO đặt (mg/L)']], pfr: [['kla', 'kLa (1/d)'], ['DOsp', 'DO đặt (mg/L)']], baf: [['kla', 'kLa (1/d)'], ['DOsp', 'DO đặt (mg/L)']]
});

/* ======================================================================== HOOK TÍNH TOÁN */
(() => {
  const { cats, tss, fixNP, split, fracVec, clamp01, rd } = XU;
  const buf = n => new Float64Array(n);
  /* bộ tách 2 dòng không thể tích: prep(cu,cin,q,X) → { c, eff(k), Xu (g/m³) | ratio, rej, rep } */
  function sepUnit(prep, mode) {
    return {
      stateless: true,
      qdynOff: cu => mode(cu).kind !== 'dyn',
      rows(cu, F, r) { const md = mode(cu); return md.kind === 'ratio' ? F.split(cu, r, cu.outs.und, cu.outs.out, 'ratio', md.k) : F.split(cu, r, cu.outs.und, cu.outs.out, 'dyn'); },
      qdyn: (cu, cin, q, X) => { if (mode(cu).kind !== 'dyn') return 0; const P = prep(cu, cin, q, X); let m = 0; for (let k = 0; k < X.nPart; k++) m += X.tssP[k] * Math.max(P.c[X.partIdx[k]], 0) * q * P.eff(X.partIdx[k]); return m / Math.max(P.Xu, 1); },
      sep(cu, cin, q, X) {
        const P = prep(cu, cin, q, X), f = fracVec(cu, X, P.eff, q, P.rej);
        const { Qo, Qu } = split(cu, P.c, q, X, f, 'out', 'und');
        if (X.wantRep === false) return;     // trong tích phân: chỉ cần nồng độ các cửa
        const tIn = tss(P.c, X), tU = tss(X.C[cu.outs.und], X), tO = tss(X.C[cu.outs.out], X);
        cu._rep = Object.assign({ Qo, Qu, TSSin: tIn, TSSout: tO, TSSu: tU, solids: Qu * tU / 1000, remTSS: tIn > 0 ? (1 - Qo * tO / (q * tIn)) * 100 : 0 }, P.rep || {});
        if (P.post) P.post(cu._rep, X);
      },
    };
  }
  /* đơn vị 1 dòng không thể tích: chuyển dạng nồng độ */
  function xfUnit(fn) {
    return {
      stateless: true,
      rows: (cu, F, r) => F.pass(cu, r, cu.outs.out),
      sep(cu, cin, q, X) { const c = X.C[cu.outs.out]; c.set(cin); cu._rep = fn(cu, c, q, X) || {}; }
    };
  }
  const kwRep = (kW, extra) => Object.assign({ kW }, extra || {});

  /* ---------------- song chắn / lưới rác ---------------- */
  UNITX.screen = sepUnit((cu, cin, q, X) => {
    const C = cats(X.m), e = clamp01(X.val(cu, 'cap') / 100), set = C._scr || (C._scr = new Set(C.XI.concat(C.XS, C.ISS))), bm = C._bm || (C._bm = new Set(C.BIOM));
    return { c: cin, eff: k => set.has(k) ? e : bm.has(k) ? 0.3 * e : 0, Xu: Math.max(+cu.p.DS, 1) * 1e4,
      rep: kwRep(+cu.p.kW || 0), post: r => { r.wet = r.solids / (Math.max(+cu.p.DS, 1) / 100) / 1000; } };
  }, () => ({ kind: 'dyn' }));
  UNITX.screen.rep = i => [['Rác giữ lại (khô)', i.solids, 'kg/d'], ['Rác ướt sau ép', i.wet, 't/d'], ['TSS vào → ra', `${rd(i.TSSin)} → ${rd(i.TSSout)}`, 'mg/L'], ['Khử TSS', i.remTSS, '%']];

  /* ---------------- lắng cát ---------------- */
  UNITX.grit = sepUnit((cu, cin, q, X) => {
    const C = cats(X.m), eI = clamp01(X.val(cu, 'eISS') / 100), eO = clamp01(X.val(cu, 'eOrg') / 100), iss = C._iss || (C._iss = new Set(C.ISS)), org = C._org || (C._org = new Set(C.XI.concat(C.XS)));
    const air = cu.p.kind === 'aerated' ? Math.max(+cu.p.air || 0, 0) : 0;
    return { c: cin, eff: k => iss.has(k) ? eI : org.has(k) ? eO : 0, Xu: Math.max(+cu.p.DS, 1) * 1e4,
      rep: kwRep((+cu.p.kW || 0) + (air > 0 ? X.blowerKW(air * 24, 3) : 0), { airG: air }) };
  }, () => ({ kind: 'dyn' }));
  UNITX.grit.rep = i => [['Cát + cặn vô cơ (khô)', i.solids, 'kg/d'], ['TSS vào → ra', `${rd(i.TSSin)} → ${rd(i.TSSout)}`, 'mg/L'], ['Khí lắng cát', i.airG, 'Nm³/h']];

  /* ---------------- lắng sơ cấp ---------------- */
  UNITX.pclar = sepUnit((cu, cin, q, X) => {
    const A = Math.max(+cu.p.A, 1), H = Math.max(+cu.p.H, 0.5), t = q > 0 ? A * H / q * 24 : 99;
    const R = cu.p.mode === 'fix' ? clamp01(+cu.p.rem / 100) : clamp01(t / (Math.max(+cu.p.a, 1e-4) + Math.max(+cu.p.b, 1e-4) * t) / 100);   // M&E: R tính bằng %
    return { c: cin, eff: () => R, Xu: Math.max(+cu.p.DS, 0.3) * 1e4, rep: kwRep(+cu.p.kW || 0, { t, SOR: q / A, Rdes: R * 100 }) };
  }, () => ({ kind: 'dyn' }));
  UNITX.pclar.rep = i => [['Thời gian lưu', i.t, 'h'], ['Tải trọng bề mặt', i.SOR, 'm³/m²·d'], ['Hiệu suất khử TSS (thiết kế/thực)', `${rd(i.Rdes)} / ${rd(i.remTSS)}`, '%'], ['Bùn sơ cấp', i.solids, 'kg TSS/d'], ['Lưu lượng bùn', i.Qu, 'm³/d']];

  /* ---------------- keo tụ – tạo bông – lắng / DAF ---------------- */
  function chemPrep(cu, cin, q, X) {
    const C = cats(X.m), cg = COAG[cu.p.coag] || COAG.pac, me = cg[1], M = me === 'Al' ? 26.98 : 55.85;
    const dose = Math.max(X.val(cu, 'dose'), 0), Me = dose * cg[2], molMe = Me / M;   // mg/L, mmol/L
    const c = cu._c || (cu._c = buf(X.n)), c0 = cu._c0 || (cu._c0 = buf(X.n)); c.set(cin); c0.set(cin);
    let Prem = 0;
    if (C.PO >= 0) {
      const P = Math.max(cin[C.PO], 0), r = P > 1e-6 ? molMe / (P / 30.97) : 99;
      const f = 1 - Math.exp(-Math.pow(r / (me === 'Al' ? 1 : 1.25), 1.2));
      Prem = Math.min(P * f, molMe * 30.97 * 0.95);
      c[C.PO] -= Prem;
      const fP = X.comp.P && C.XMeP >= 0 ? X.comp.P[C.XMeP] : 0;
      if (C.XMeP >= 0 && fP > 0) c[C.XMeP] += Prem / fP;
    }
    const MeLeft = Math.max(Me - Prem / 30.97 * M, 0), hyd = MeLeft * (me === 'Al' ? 78.0 / 26.98 : 106.87 / 55.85);
    if (C.XMeOH >= 0) c[C.XMeOH] += hyd; else if (C.XISS >= 0) c[C.XISS] += hyd;
    if (C.ALK >= 0) c[C.ALK] = Math.max(c[C.ALK] - 3 * molMe, 0);
    const sR = clamp01(X.val(cu, 'sRem') / 100) * (1 - Math.exp(-Me / 5));
    const R0 = clamp01(+cu.p.R0 / 100), Rm = Math.max(clamp01(+cu.p.Rmax / 100), R0);
    // hiệu suất tách theo liều kim loại (bão hòa ở R_max); polymer cải thiện tối đa 2 % nhưng không vượt R_max
    const R = Math.min(Rm, 0.995, R0 + (Rm - R0) * (1 - Math.exp(-Me / 4)) + 0.02 * Math.min(+cu.p.poly || 0, 2) / 2);
    const rej = buf(X.n); if (C.SI >= 0) rej[C.SI] = sR; for (const k of C.SB) rej[k] = 0.5 * sR;
    return { c, eff: () => R, rej, Xu: Math.max(+cu.p.DS, 0.2) * 1e4,
      rep: { kW: +cu.p.kW || 0, Me, Prem, alkUse: 3 * molMe * 50, chem: [{ name: cg[0], kg: dose * q / 1000, sol: +cu.p.solC > 0 ? cu.p.solC / 100 : undefined, rho: +cu.p.solRho || 1 }, { name: 'Polymer', kg: (+cu.p.poly || 0) * q / 1000, sol: +cu.p.polyC > 0 ? cu.p.polyC / 100 : undefined, rho: 1 }] } };
  }
  UNITX.chem = sepUnit(chemPrep, () => ({ kind: 'dyn' }));
  UNITX.chem.rep = i => [['Kim loại châm', i.Me, 'mg/L'], ['PO₄-P bị kết tủa', i.Prem, 'mg/L'], ['Độ kiềm tiêu thụ', i.alkUse, 'mg CaCO₃/L'], ['TSS vào → ra', `${rd(i.TSSin)} → ${rd(i.TSSout)}`, 'mg/L'], ['Bùn hóa lý', i.solids, 'kg/d'], ['Lưu lượng bùn', i.Qu, 'm³/d']];

  /* ---------------- lọc / màng ---------------- */
  UNITX.filter = sepUnit((cu, cin, q, X) => {
    const C = cats(X.m), k = cu.p.kind, e = clamp01(+cu.p.cap / 100), rej = buf(X.n);
    if (k === 'gac') { const s = clamp01(+cu.p.sRem / 100); if (C.SI >= 0) rej[C.SI] = s; for (const j of C.SB) rej[j] = 0.5 * s; }
    if (k === 'ro') { const s = clamp01(+cu.p.rej / 100), gas = new Set(C.gases); for (const j of X.solIdx) if (!gas.has(j)) rej[j] = s; }
    return { c: cin, eff: () => e, rej, rep: { kW: Math.max(+cu.p.kWh || 0, 0) * q / 24 } };
  }, cu => ({ kind: 'ratio', k: Math.min(Math.max(+cu.p.bw || 0, 0), 60) / 100 }));
  UNITX.filter.rep = i => [['Dòng thành phẩm / rửa lọc (cô đặc)', `${rd(i.Qo)} / ${rd(i.Qu)}`, 'm³/d'], ['TSS vào → ra', `${rd(i.TSSin)} → ${rd(i.TSSout)}`, 'mg/L'], ['Chất rắn giữ lại', i.solids, 'kg/d']];

  /* ---------------- nén / tách nước bùn ---------------- */
  const sludgeSep = tab => sepUnit((cu, cin, q, X) => {
    const e = clamp01(+cu.p.capt / 100);
    return { c: cin, eff: () => e, Xu: Math.max(+cu.p.DS, 0.5) * 1e4, rep: {}, post: r => { const tDS = r.solids / 1000; r.kW = (+cu.p.kWh || 0) * tDS / 24; r.chem = [{ name: 'Polymer (' + tab[cu.p.kind][0] + ')', kg: (+cu.p.poly || 0) * tDS }]; r.DSact = r.TSSu / 1e4; r.cake = cu.p.qm === 'ratio' ? r.Qu : r.solids / (Math.max(+cu.p.DS, 0.5) / 100) / 1000; } };
  }, cu => cu.p.qm === 'ratio' ? { kind: 'ratio', k: Math.min(Math.max(+cu.p.rU || 5, 0.01), 98) / 100 } : { kind: 'dyn' });
  UNITX.thicken = sludgeSep(THK); UNITX.dewater = sludgeSep(DWT);
  UNITX.thicken.rep = i => [['Chất rắn vào', i.Qu * i.TSSu / 1000 + i.Qo * i.TSSout / 1000, 'kg/d'], ['Bùn đặc', `${rd(i.Qu)} m³/d · ${rd(i.DSact)} %`, ''], ['Hiệu suất thu hồi', i.remTSS, '%'], ['Nước tách – TSS', i.TSSout, 'mg/L']];
  UNITX.dewater.rep = i => [['Bánh bùn', i.cake, 't/d'], ['Độ khô bánh bùn', i.DSact, '%'], ['Chất rắn khô', i.solids, 'kg/d'], ['Hiệu suất thu hồi', i.remTSS, '%'], ['Nước tách – lưu lượng / TSS', `${rd(i.Qo)} m³/d · ${rd(i.TSSout)} mg/L`, '']];

  /* ---------------- sấy bùn: dòng 'und' = bùn khô, 'out' = hơi nước ngưng ---------------- */
  UNITX.dryer = {
    stateless: true,
    rows: (cu, F, r) => F.split(cu, r, cu.outs.und, cu.outs.out, 'dyn'),
    qdyn: (cu, cin, q, X) => tss(cin, X) * q / (Math.max(+cu.p.DS, 5) * 1e4),
    sep(cu, cin, q, X) {
      const C = cats(X.m), gas = new Set(C.gases), f = cu._f || (cu._f = buf(X.n));
      for (let k = 0; k < X.n; k++) f[k] = gas.has(k) ? 0 : 1;           // chất rắn và chất hòa tan ở lại bùn khô
      const { Qo, Qu } = split(cu, cin, q, X, f, 'out', 'und'), DS = tss(cin, X) * q / 1000;
      cu._rep = { Qo, Qu, water: Qo * 1000, solids: DS, kW: (+cu.p.kWh || 0) * DS / 1000 / 24, heat: (+cu.p.eTh || 0) * Qo * 1000, prod: DS / (Math.max(+cu.p.DS, 5) / 100) / 1000 };
    }
  };
  UNITX.dryer.rep = i => [['Bùn khô', i.prod, 't/d'], ['Nước bay hơi', i.water / 1000, 't/d'], ['Nhiệt cần', i.heat, 'kWh/d']];

  /* ---------------- thủy phân nhiệt ---------------- */
  UNITX.thp = xfUnit((cu, c, q, X) => {
    // mức hòa tan hóa nhập ở 165 °C; nhiệt độ khác → tỷ lệ tuyến tính (≈ 0 ở 120 °C, tối đa ×1,3 ở ~180 °C); hơi tiêu thụ theo ΔT
    const fT = Math.min(Math.max(((+cu.p.T || 165) - 120) / 45, 0), 1.3);
    const C = cats(X.m), fB = clamp01(+cu.p.fBio / 100 * fT), fI = clamp01(+cu.p.fIn / 100 * fT), c0 = Float64Array.from(c);
    let sol = 0, inert = 0;
    for (const k of C.XB) { const d = c[k] * fB; c[k] -= d; if (k === C.XPHA && C.SA >= 0) c[C.SA] += d; else sol += d; }
    for (const k of C.XI) { const d = c[k] * fI; c[k] -= d; inert += d; }
    if (C.SBm >= 0) c[C.SBm] += sol; if (C.SI >= 0) c[C.SI] += inert;
    if (C.XPP >= 0 && C.PO >= 0) { const d = c[C.XPP] * fB; c[C.XPP] -= d; c[C.PO] += d; }
    if (C.XND >= 0 && C.SND >= 0) { const d = c[C.XND] * fB; c[C.XND] -= d; c[C.SND] += d; }
    fixNP(c0, c, X);
    const DS = tss(c0, X) * q / 1e6;
    return { kW: (+cu.p.kWh || 0) * DS / 24, solCOD: (sol + inert) * q / 1000, steam: (+cu.p.steam || 0) * DS * Math.max((+cu.p.T || 165) - 20, 0) / 145, DS };
  });
  UNITX.thp.rep = i => [['COD hòa tan hóa', i.solCOD, 'kg/d'], ['Chất rắn khô qua THP', i.DS, 't/d'], ['Hơi tiêu thụ', i.steam, 't/d']];

  /* ---------------- struvite ---------------- */
  UNITX.struvite = xfUnit((cu, c, q, X) => {
    const C = cats(X.m);
    if (C.PO < 0) { if (!cu._w) { cu._w = 1; X.warns.push(cu.u.name + ': kết tinh struvite cần mô hình có P (ASM2d)'); } return { kW: +cu.p.kW || 0, Prem: 0 }; }
    const P = Math.max(c[C.PO], 0), NH = Math.max(c[C.NH], 0);
    // hiệu suất nhập ở pH tham chiếu 8,3; pH khác → hiệu chỉnh theo đường kết tinh (logistic quanh pH 7,6); không vượt tỷ lệ mol Mg:P
    const gpH = x => 1 / (1 + Math.exp(-(x - 7.6) / 0.25)), effA = Math.min(clamp01(+cu.p.eff / 100) * gpH(+cu.p.pH || 8.3) / gpH(8.3), 0.98, Math.max(+cu.p.MgP || 1.3, 0));
    const Prem = Math.min(P * effA, NH * 30.97 / 14.007), Nrem = Prem * 14.007 / 30.97;
    c[C.PO] -= Prem; c[C.NH] -= Nrem;
    if (C.ALK >= 0) c[C.ALK] = Math.max(c[C.ALK] - Nrem / 14.007, 0);   // NH₄⁺ kết tinh → giải phóng H⁺
    const molP = Prem * q / 30.97 / 1000;   // kmol/d
    return { kW: +cu.p.kW || 0, Prem, Nrem, prodKg: molP * 245.4, Pout: Prem * q / 1000, Nout: Nrem * q / 1000, chem: [{ name: 'MgCl₂·6H₂O', kg: molP * (+cu.p.MgP || 1.3) * 203.3 }] };
  });
  UNITX.struvite.rep = i => [['PO₄-P thu hồi', i.Prem, 'mg/L'], ['NH₄-N cùng kết tinh', i.Nrem, 'mg/L'], ['Struvite', i.prodKg, 'kg/d']];

  /* ---------------- AOP / khử trùng ---------------- */
  UNITX.aop = xfUnit((cu, c, q, X) => {
    const C = cats(X.m), K = cu.p.kind, d = AOPK[K] || AOPK.fenton, V = Math.max(+cu.p.V, 0.1), tau = q > 0 ? V / q * 1440 : 1e3;   // phút
    const eta = Math.max(X.val(cu, 'eta'), 0) / 100, kk = Math.max(+cu.p.k > 0 ? +cu.p.k : d.k, 1e-4), fk = 1 - Math.exp(-kk * tau);
    const H2O2 = ['fenton', 'o3h2o2', 'uvh2o2', 'h2o2'].includes(K) ? Math.max(X.val(cu, 'H2O2'), 0) : 0;
    const O3 = K === 'o3' || K === 'o3h2o2' ? Math.max(X.val(cu, 'O3'), 0) : 0;
    const Cl2 = K === 'naocl' ? Math.max(X.val(cu, 'Cl2'), 0) : 0, Fe = K === 'fenton' ? Math.max(X.val(cu, 'Fe'), 0) : 0, UVd = Math.max(+cu.p.UVd || 0, 0);
    const c0 = cu._c0 || (cu._c0 = new Float64Array(X.n)); c0.set(c); const rep = { tau, kW: 0, chem: [] };
    let Ox = 0, Clfree = Cl2, Nox = 0;
    // oxy tương đương (g O₂/m³): H₂O₂ 0,47; O₃ 0,5; Cl₂ 0,225
    if (K === 'fenton') {
      const R = Fe > 0 ? H2O2 / Fe : 0, fR = R > 0 ? Math.exp(-Math.pow(Math.log(R / 6), 2) / (2 * 0.9 * 0.9)) : 0, fpH = Math.exp(-Math.pow((+cu.p.pH - 3) / 1.2, 2));
      Ox = 0.47 * H2O2 * eta * fk * fR * fpH; Object.assign(rep, { fR, fpH, H2Oratio: R });
    } else if (K === 'o3') Ox = 0.5 * O3 * eta * fk;                     // O₃: 0,33 (trực tiếp) – 0,67 (qua •OH) g O₂/g O₃ → lấy 0,5
    else if (K === 'o3h2o2') Ox = (0.5 * O3 + 0.235 * H2O2) * eta * fk;
    else if (K === 'uvh2o2') Ox = 0.47 * H2O2 * eta * fk * (1 - Math.exp(-UVd / 400));
    else if (K === 'h2o2') Ox = 0.47 * H2O2 * eta * fk;
    if (K === 'naocl' && C.NH >= 0) {
      // clo hóa điểm đột biến: 7,6 mg Cl₂/mg NH₄-N → N₂; phần còn lại oxy hóa hữu cơ
      const nh = Math.max(c[C.NH], 0), dN = Math.min(nh, Cl2 * fk / 7.6);
      c[C.NH] -= dN; Nox = dN; Clfree = Math.max(Cl2 - 7.6 * dN, 0);
      if (C.ALK >= 0) c[C.ALK] = Math.max(c[C.ALK] - 14.3 * dN / 50, 0);
      Ox = 0.225 * Clfree * eta * fk;
    }
    // phân bố: COD hòa tan phân hủy được & COD trơ (trọng số phản ứng wSI)
    const wSI = Math.max(+cu.p.wSI || 0, 0), sI = C.SI >= 0 ? Math.max(c[C.SI], 0) : 0;
    let sB = 0; for (const k of C.SB) sB += Math.max(c[k], 0);
    const Dem = wSI * sI + sB, dCOD = Dem > 1e-9 && Ox > 0 ? Dem * Ox / (Dem + Ox) : 0;
    const fMin = clamp01(+cu.p.fMin / 100);
    let min = 0;
    if (dCOD > 0) {
      const xI = dCOD * wSI * sI / Dem, xB = dCOD * sB / Dem;
      if (C.SI >= 0) c[C.SI] -= xI;
      for (const k of C.SB) c[k] -= xB * Math.max(c0[k], 0) / Math.max(sB, 1e-12);
      // COD trơ bị oxy hóa: phần khoáng hóa → CO₂, phần còn lại thành chất dễ phân hủy (tăng BOD/COD) – axit hữu cơ mạch ngắn
      // (SA của ASM2d, không chứa N/P: N, P của chất bị oxy hóa giải phóng thành NH₄, PO₄; dùng SF làm NH₄ âm khi NH₄ ≈ 0)
      const tB = C.SA >= 0 ? C.SA : C.SBm;
      if (tB >= 0) c[tB] += xI * (1 - fMin);
      min = xI * fMin + xB * fMin;
      // phần dễ phân hủy bị oxy hóa không hoàn toàn quay lại dạng dễ phân hủy
      if (tB >= 0) c[tB] += xB * (1 - fMin);
      if (C.TIC >= 0) c[C.TIC] += min / 32;                               // CO₂ sinh ra (mol C ≈ g O₂/32)
    }
    // Fenton: Fe(OH)₃ sau trung hòa; H₂O₂ dư phân hủy thành O₂
    if (K === 'fenton') { const fh = Fe * 106.87 / 55.85; if (C.XMeOH >= 0) c[C.XMeOH] += fh; else if (C.XISS >= 0) c[C.XISS] += fh; rep.FeOH = fh * q / 1000; }
    const usedH = Ox > 0 && (K === 'fenton' || K === 'uvh2o2' || K === 'h2o2') ? Math.min(H2O2, dCOD / 0.47 / Math.max(eta, 0.05)) : 0;
    const H2O2res = Math.max(H2O2 * (1 - fk) + (H2O2 * fk - usedH) * 0.2, 0);
    if (C.SO >= 0 && H2O2 > 0) c[C.SO] += 0.47 * Math.max(H2O2 - usedH - H2O2res, 0);
    fixNP(c0, c, X);
    if (Nox > 0) c[C.NH] = Math.max(c[C.NH] - Nox, 0);   // fixNP trả N về NH₄ → khử lại phần N₂ thoát ra do clo hóa
    // năng lượng & hóa chất
    const m3 = q;
    rep.kW = (Math.max(+cu.p.kWh || 0, 0) * m3 + (O3 > 0 ? O3 * m3 / 1000 * (+cu.p.kWhO3 || 12) : 0)) / 24;
    const hC = Math.min(Math.max(+cu.p.h2o2C || 50, 1), 100) / 100, cC = Math.min(Math.max(+cu.p.clC || 10, 1), 100) / 100;
    if (H2O2 > 0) rep.chem.push({ name: `H₂O₂ ${+(hC * 100).toFixed(1)} %`, kg: H2O2 * m3 / 1000 / hC, sol: 1, rho: hC >= 0.45 ? 1.2 : 1.11 });
    if (Fe > 0) rep.chem.push({ name: 'FeSO₄·7H₂O', kg: Fe * m3 / 1000 / 0.2 });
    if (K === 'fenton') { const alk = c0[C.ALK] || 0; rep.chem.push({ name: 'H₂SO₄ 98 % (hạ pH ≈ 3)', kg: (alk + 1) * 49 * m3 / 1000 / 0.98 }, { name: 'NaOH 32 % (trung hòa)', kg: (alk + 1 + 3 * Fe / 55.85) * 40 * m3 / 1000 / 0.32 }); }
    if (O3 > 0) rep.chem.push({ name: 'O₃ (sản xuất tại chỗ)', kg: O3 * m3 / 1000 });
    if (Cl2 > 0) rep.chem.push({ name: `NaOCl ${+(cC * 100).toFixed(1)} %`, kg: Cl2 * m3 / 1000 / cC, sol: 1, rho: 1.2 });
    const CODin = c0.reduce((a, v, k) => a + (X.comp.COD ? X.comp.COD[k] * v : 0), 0), CODout = c.reduce((a, v, k) => a + (X.comp.COD ? X.comp.COD[k] * v : 0), 0);
    // COD khoáng hóa bởi chất oxy hóa (không qua O₂ hòa tan) – dùng trong cân bằng COD toàn nhà máy
    const sB2 = C.SB.reduce((a, k) => a + Math.max(c[k], 0), 0), sI2 = C.SI >= 0 ? Math.max(c[C.SI], 0) : 0;
    // COD bị phá hủy bởi chất oxy hóa (kể O₂ do H₂O₂ dư phân hủy) – dùng trong cân bằng COD toàn nhà máy như "O₂ cấp"
    Object.assign(rep, { Ox, dCOD, CODox: (CODin - CODout) * q / 1000, Ngas: Nox * q / 1000, Nox, Clfree: Math.max(Clfree * (1 - fk), 0), H2O2res,
      logUV: K === 'uv' || K === 'uvh2o2' ? UVd / 10 : 0, logCl: K === 'naocl' ? Math.min(6, Math.max(Clfree, 0) * tau / 15) : 0, SIin: sI, SIout: sI2, CODin, CODout,
      BODratio: [sB + sI > 0 ? sB / (sB + sI) : 0, sB2 + sI2 > 0 ? sB2 / (sB2 + sI2) : 0] });
    return rep;
  });
  UNITX.aop.rep = i => [['Thời gian tiếp xúc', i.tau, 'phút'], ['Oxy hóa khả dụng (O₂ tương đương)', i.Ox, 'mg/L'], ['COD hòa tan bị oxy hóa', i.dCOD, 'mg/L'], ['COD trơ (SI) vào → ra', `${rd(i.SIin)} → ${rd(i.SIout)}`, 'mg/L'],
    ['Tỷ lệ COD phân hủy được / COD hòa tan (vào → ra)', `${rd(i.BODratio[0], 2)} → ${rd(i.BODratio[1], 2)}`, ''], ['NH₄-N khử (clo hóa)', i.Nox, 'mg/L'], ['Clo tự do dư', i.Clfree, 'mg/L'], ['H₂O₂ dư', i.H2O2res, 'mg/L'],
    ['Bất hoạt vi sinh (ước tính)', Math.max(i.logUV, i.logCl), 'log'], ['Bùn Fe(OH)₃', i.FeOH, 'kg/d']];

  /* ---------------- bể điều hòa (có thể tích, mực nước thay đổi) ---------------- */
  UNITX.eqtank = {
    ns: (cu, X) => X.n + 1,
    init(cu, X) {
      cu.Vmax = Math.max(+cu.p.Vmax, 1); cu.Vmin = Math.min(Math.max(+cu.p.Vmin, 0), 0.9 * cu.Vmax); cu.H = Math.max(+cu.p.H, 0.5); cu.Cs = X.csOf(cu.H);
      // tổng nước thải vào trạm (bỏ dòng vào tạm _TI… của bộ giải khi xé dòng tuần hoàn – vốn là dòng nội bộ)
      cu._Qbase = (X.units || []).filter(u => u.type === 'influent' && !/^_TI\d/.test(u.id)).reduce((a, u) => a + Math.max(+u.p.Q || 0, 0), 0);
    },
    rows(cu, F, r, X) {
      const iV = cu.off + X.n;
      const Qs = () => cu.p.qmode === 'Q' ? Math.max(X.val(cu, 'Qset'), 0) : Math.max(+cu.p.kQ || 1, 0) * (cu._Qbase || 0);
      cu._qOut = y => {
        const s = 0.01 * cu.Vmax, V = y[iV], on = 1 / (1 + Math.exp(-(V - cu.Vmin) / s)), zz = (V - cu.Vmax) / s, sp = zz > 30 ? V - cu.Vmax : s * Math.log1p(Math.exp(zz)), Q0 = Qs();
        return Q0 * on + 20 * Math.max(Q0, 1) / cu.Vmax * sp;        // bơm + "tràn" khi đầy (điều khiển mực nước hệ số lớn)
      };
      return F.fixed(r, cu.outs.out, (t, y) => cu._qOut(y));
    },
    denseIdx: (cu, X) => [cu.off + X.n],
    // hệ rút gọn 1 bể đại diện của cụm bể chu kỳ (steadyAuto): lưu lượng & thể tích chia N, khi dựng lại hệ đầy đủ nhân N
    redScale(p, N) { p.Vmax = +p.Vmax / N; p.Vmin = +p.Vmin / N; if (p.qmode === 'Q') p.Qset = +p.Qset / N; },
    redUnmap(cu, y, N) { y[cu.off + cu.ns - 1] *= N; },
    out(cu, y, X) { const c = X.C[cu.outs.out]; for (let k = 0; k < X.n; k++) c[k] = y[cu.off + k]; },
    deriv(cu, t, y, dy, X) {
      const o = cu.off, n = X.n, q = X.mix(cu, X.cin), V = Math.max(y[o + n], 1), qo = X.Qv[cu.outs.out];
      for (let k = 0; k < n; k++) dy[o + k] = q / V * (X.cin[k] - y[o + k]);
      dy[o + n] = q - qo;
      const kl = cu.p.aer === 'kla' ? Math.max(+cu.p.kla || 0, 0) : 0;
      cu.V = V; X.bioReact(cu, y, o, dy, kl, X.co2k(kl), '_pH');
    },
    y0(cu, y, X) { y.set(X.initVector(false, 0.02), cu.off); y[cu.off + X.n] = Math.max(cu.Vmin * 1.05, cu.Vmax * Math.min(Math.max(+cu.p.lv0 || 50, 1), 100) / 100); },
    info(cu, y, info, X) {
      const V = Math.max(y[cu.off + X.n], 0), x = y.subarray(cu.off, cu.off + X.n), kl = cu.p.aer === 'kla' ? Math.max(+cu.p.kla || 0, 0) : 0;
      Object.assign(info, X.aerInfo(x, Math.max(V, 1), cu.H, kl, cu.Cs));
      const a = kl > 0 ? X.aerCalc(info.OTR, Math.max(x[X.iSO], 0), cu.H) : { air: 0, Pblow: 0 };
      Object.assign(info, { V, level: V / cu.Vmax * 100, Qout: X.Q[cu.outs.out], C: Float64Array.from(x), HRT: info.Qin > 0 ? V / info.Qin * 24 : 0, air: a.air, Pblow: a.Pblow, Pmix: (+cu.p.mix || 0) * V / 1000 });
    }
  };
  UNITX.eqtank.rep = i => [['Thể tích / mực nước', `${rd(i.V)} m³ · ${rd(i.level)} %`, ''], ['Lưu lượng vào → ra', `${rd(i.Qin)} → ${rd(i.Qout)}`, 'm³/d'], ['Thời gian lưu', i.HRT, 'h']];

  /* ---------------- bể có thể tích khuấy trộn (phân hủy hiếu khí) ---------------- */
  const stirred = {
    ns: (cu, X) => X.n,
    init(cu, X) { cu.V = Math.max(+cu.p.V, 1); cu.H = Math.max(+cu.p.H, 0.5); cu.Cs = X.csOf(cu.H); },
    rows: (cu, F, r) => F.pass(cu, r, cu.outs.out),
    out(cu, y, X) { const c = X.C[cu.outs.out]; for (let k = 0; k < X.n; k++) c[k] = y[cu.off + k]; },
    deriv(cu, t, y, dy, X) {
      const o = cu.off, q = X.mix(cu, X.cin), D = q / cu.V;
      for (let k = 0; k < X.n; k++) dy[o + k] = D * (X.cin[k] - y[o + k]);
      const kl = X.klaOf(cu, Math.max(y[o + X.iSO], 0)); X.bioReact(cu, y, o, dy, kl, X.co2k(kl), '_pH');
    },
    y0(cu, y, X) { y.set(X.initVector(cu.p.aer !== 'none', 2), cu.off); },
    info(cu, y, info, X) {
      const x = y.subarray(cu.off, cu.off + X.n), kl = X.klaOf(cu, Math.max(x[X.iSO], 0));
      Object.assign(info, X.aerInfo(x, cu.V, cu.H, kl, cu.Cs));
      const a = X.aerCalc(info.OTR, Math.max(x[X.iSO], 0), cu.H);
      const cv = c => X.m.composites(c, X.p20, {}), ci = cv(info.Cin), co = cv(x);
      Object.assign(info, { V: cu.V, C: Float64Array.from(x), HRT: info.Qin > 0 ? cu.V / info.Qin : 0, air: a.air, Pblow: a.Pblow, Pmix: cu.p.aer === 'none' ? (+cu.p.mix) * cu.V / 1000 : 0, VSSin: ci.VSS, VSSout: co.VSS, VSSred: ci.VSS > 0 ? (1 - co.VSS / ci.VSS) * 100 : 0 });
    }
  };
  UNITX.aerdig = stirred;
  // bể chứa bùn: như bể khuấy trộn (không sục khí); là bể đệm của hệ rút gọn bể chu kỳ (thể tích chia N)
  UNITX.stank = Object.assign({}, stirred, { redScale(p, N) { p.V = +p.V / N; } });
  UNITX.stank.rep = i => [['Thời gian lưu', i.HRT, 'ngày'], ['VSS vào → ra', `${rd(i.VSSin)} → ${rd(i.VSSout)}`, 'mg/L']];
  UNITX.aerdig.rep = i => [['Thời gian lưu', i.HRT, 'ngày'], ['VSS vào → ra', `${rd(i.VSSin)} → ${rd(i.VSSout)}`, 'mg/L'], ['Giảm VSS', i.VSSred, '%'], ['Khí cấp', i.air / 24, 'Nm³/h']];

  /* ---------------- bể dòng đẩy (chuỗi ngăn) ---------------- */
  UNITX.pfr = {
    reactor: true,
    ns: (cu, X) => { cu.nSeg = Math.max(1, Math.min(20, Math.round(+cu.p.nSeg || 5))); return X.n * cu.nSeg; },
    init(cu, X) { cu.V = Math.max(+cu.p.V, 1); cu.H = Math.max(+cu.p.H, 0.5); cu.Cs = X.csOf(cu.H); cu.nAn = Math.min(Math.max(Math.round(+cu.p.nAnox || 0), 0), cu.nSeg); cu.Vs = cu.V / cu.nSeg; },
    rows: (cu, F, r) => F.pass(cu, r, cu.outs.out),
    out(cu, y, X) { const c = X.C[cu.outs.out], b = cu.off + (cu.nSeg - 1) * X.n; for (let k = 0; k < X.n; k++) c[k] = y[b + k]; },
    deriv(cu, t, y, dy, X) {
      const n = X.n, q = X.mix(cu, X.cin), D = q / cu.Vs;
      for (let j = 0; j < cu.nSeg; j++) {
        const b = cu.off + j * n;
        for (let k = 0; k < n; k++) dy[b + k] = D * ((j === 0 ? X.cin[k] : y[b - n + k]) - y[b + k]);
        const kl = j < cu.nAn || cu.p.aer === 'none' ? 0 : X.klaOf(cu, Math.max(y[b + X.iSO], 0));
        X.bioReact(cu, y, b, dy, kl, X.co2k(kl), '_pH' + j);
      }
    },
    y0(cu, y, X) { for (let j = 0; j < cu.nSeg; j++) y.set(X.initVector(j >= cu.nAn && cu.p.aer !== 'none', 1), cu.off + j * X.n); },
    info(cu, y, info, X) {
      const n = X.n, avg = new Float64Array(n), segs = [];
      let OTR = 0, air = 0, Pb = 0, CO2 = 0;
      for (let j = 0; j < cu.nSeg; j++) {
        const x = y.subarray(cu.off + j * n, cu.off + (j + 1) * n), kl = j < cu.nAn || cu.p.aer === 'none' ? 0 : X.klaOf(cu, Math.max(x[X.iSO], 0));
        const ai = X.aerInfo(x, cu.Vs, cu.H, kl, cu.Cs), a = X.aerCalc(ai.OTR, Math.max(x[X.iSO], 0), cu.H);
        OTR += ai.OTR; CO2 += ai.CO2; air += a.air; Pb += a.Pblow; for (let k = 0; k < n; k++) avg[k] += x[k] / cu.nSeg;
        const cc = X.m.composites(x, X.p20, {}); segs.push({ DO: x[X.iSO], NH4: cc.NH4, NOx: cc.NOx, TSS: cc.TSS });
      }
      Object.assign(info, { V: cu.V, C: avg, OTR, CO2, air, Pblow: Pb, Pmix: (+cu.p.mix || 0) * cu.Vs * cu.nAn / 1000, segs, HRT: info.Qin > 0 ? cu.V / info.Qin * 24 : 0, aerated: cu.p.aer !== 'none' && cu.nAn < cu.nSeg, fAer: (cu.nSeg - cu.nAn) / cu.nSeg, pH: 7 });
    }
  };
  UNITX.pfr.rep = i => [['Thời gian lưu', i.HRT, 'h'], ['DO theo ngăn', i.segs.map(s => rd(s.DO, 2)).join(' · '), 'mg/L'], ['NH₄-N theo ngăn', i.segs.map(s => rd(s.NH4, 2)).join(' · '), 'mg/L'], ['NOx-N theo ngăn', i.segs.map(s => rd(s.NOx, 2)).join(' · '), 'mg/L'], ['Khí cấp', i.air / 24, 'Nm³/h']];
})();

/* BAF / lọc nhỏ giọt: động học màng ở plant.js (như MBBR) – chỉ khai báo bảng kết quả */
const UNITX_REP_BAF = i => [['Tải thủy lực', i.HLR, 'm³/m²·h'], ['Nước rửa ngược', i.Qbw, 'm³/d'], ['Hiệu suất giữ chất rắn', i.cap, '%'], ['Tải NH₄ bề mặt màng', i.SALR_NH, 'g N/m²·d'], ['Tải COD bề mặt màng', i.SALR_COD, 'g COD/m²·d']];
