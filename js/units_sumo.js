'use strict';
/* ==========================================================================
   SimXLNT – THIẾT BỊ BỔ SUNG THEO DANH MỤC PROCESS UNIT CỦA SUMO24
   Sản xuất năng lượng : bồn chứa khí, đuốc đốt khí, máy phát CHP (cân bằng biogas từ bể phân hủy / bể kỵ khí tốc độ cao)
   Bể sinh học         : hồ sinh học (tùy nghi / sục khí / kỵ khí) – chuỗi ngăn có lắng giữ chất rắn, nạo vét bùn đáy
                         (MABR: lựa chọn "Kiểu màng" của Bể giá thể MBBR/IFAS ở plant.js)
   Đơn vị đặc biệt     : tháp stripping NH₃, gia nhiệt / trao đổi nhiệt, bơm
   Lưu vực & sông      : lưu vực (mưa – dòng chảy mặt đô thị / nông thôn), tràn tách dòng mưa (CSO), đoạn sông (tái thông khí
                         O'Connor–Dobbins, nhu cầu O₂ trầm tích)
   Mạng thoát nước     : trạm bơm hố thu (bể mực nước thay đổi + bơm theo mực nước)
   Cùng giao diện hook UNITX như units_ext.js.
   ========================================================================== */
(() => {
  const { cats, tss, split, fracVec, clamp01, rd } = XU;
  const num = (k, l, u, o) => Object.assign({ k, l, u, t: 'num' }, o || {});
  const sel = (k, l, opts, o) => Object.assign({ k, l, t: 'sel', opts }, o || {});
  const box = (w, h, fill, stroke, txt, tc) => `<rect class="outline" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` + (txt ? `<text x="0" y="${h / 2 - 6}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${tc || stroke}">${txt}</text>` : '');
  const kWpump = (q, H, eta) => 1000 * 9.81 * Math.max(q, 0) / 86400 * Math.max(H, 0) / Math.max(eta / 100, 0.05) / 1000;

  /* ====================================================================== SẢN XUẤT NĂNG LƯỢNG (không có cửa nước – nhận biogas của mọi bể kỵ khí) */
  UT.gasholder = {
    label: 'Bồn chứa khí biogas', group: 'Sản xuất năng lượng', ins: [], outs: [],
    fields: [num('V', 'Thể tích chứa', 'm³'), num('P', 'Áp suất làm việc', 'mbar')],
    def: () => ({ V: 1000, P: 25 }), geom: { w: 70, h: 56 },
    glyph: (u, w, h) => `<path class="outline" d="M${-w / 2},${h / 2 - 6} V${-h / 2 + 22} Q0,${-h / 2 - 8} ${w / 2},${-h / 2 + 22} V${h / 2 - 6} Z" fill="#fef3c7" stroke="#a16207" stroke-width="1.5"/><path d="M${-w / 2 + 6},0 H${w / 2 - 6}" stroke="#a16207" stroke-dasharray="3 3"/><text x="0" y="${h / 2 - 10}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#713f12">BIOGAS</text>`
  };
  UT.flare = {
    label: 'Đuốc đốt khí dư', group: 'Sản xuất năng lượng', ins: [], outs: [],
    fields: [num('cap', 'Công suất đốt tối đa', 'Nm³/h'), num('eff', 'Hiệu suất đốt CH₄', '%')],
    def: () => ({ cap: 300, eff: 99 }), geom: { w: 44, h: 70 },
    glyph: (u, w, h) => `<rect class="outline" x="-5" y="${-h / 2 + 18}" width="10" height="${h - 20}" fill="#d1d5db" stroke="#374151" stroke-width="1.5"/><path d="M0,${-h / 2 + 18} q-10,-8 0,-18 q10,10 0,18" fill="#fb923c" stroke="#c2410c"/><text x="0" y="${h / 2 - 2}" text-anchor="middle" font-size="8" font-weight="700" fill="#374151">ĐUỐC</text>`
  };
  UT.chp = {
    label: 'Máy phát điện CHP (biogas)', group: 'Sản xuất năng lượng', ins: [], outs: [],
    fields: [num('kWe', 'Công suất điện định mức (tổng)', 'kW'), num('etaE', 'Hiệu suất điện', '%'), num('etaT', 'Hiệu suất nhiệt thu hồi', '%'), num('avail', 'Hệ số sẵn sàng', '%'), num('kWhPrice', 'Giá điện bù trừ', 'đ/kWh', { adv: 1 })],
    def: () => ({ kWe: 250, etaE: 38, etaT: 45, avail: 92, kWhPrice: 1900 }), geom: { w: 76, h: 54 },
    glyph: (u, w, h) => box(w, h, '#ecfccb', '#3f6212') + `<path d="M-4,-16 l-8,14 h8 l-4,12 l12,-16 h-8 l4,-10 z" fill="#facc15" stroke="#a16207"/><text x="0" y="${h / 2 - 5}" text-anchor="middle" font-size="9" font-weight="700" fill="#365314">CHP</text>`
  };
  UNITX.gasholder = { rep: i => [['Thể tích', i.V, 'm³'], ['Thời gian chứa (theo biogas sinh ra)', i.hours, 'h'], ['Biogas vào', i.biogas, 'Nm³/d']] };
  UNITX.flare = { rep: i => [['Biogas đốt', i.flared, 'Nm³/d'], ['Tải đuốc', i.load, '%'], ['CH₄ thất thoát (không cháy)', i.slip, 'Nm³/d']] };
  UNITX.chp = { rep: i => [['Biogas cấp (CH₄)', `${rd(i.gas)} (${rd(i.CH4)})`, 'Nm³/d'], ['Tải máy', i.load, '%'], ['Điện phát', i.Egen, 'kWh/d'], ['Nhiệt thu hồi', i.heat, 'kWh/d'], ['Giá trị điện', i.value, 'đ/d']] };
  /* cân bằng biogas toàn trạm (gọi từ plantSummary): CHP ưu tiên, phần dư đốt ở đuốc, không có đuốc → xả bỏ (cảnh báo) */
  globalThis.GASTRAIN = function (sys, det, biogas, CH4) {
    const G = sys.units.filter(cu => ['gasholder', 'flare', 'chp'].includes(cu.type));
    if (!G.length) return null;
    const fCH4 = biogas > 0 ? CH4 / biogas : 0.65, LHV = 9.97;   // kWh/Nm³ CH₄
    let left = biogas, Egen = 0, heat = 0;
    for (const cu of G.filter(c => c.type === 'chp')) {
      const p = cu.p, cap = Math.max(+p.kWe || 0, 0) * 24 * clamp01((+p.avail || 100) / 100) / Math.max(clamp01(+p.etaE / 100), 0.05) / LHV / Math.max(fCH4, 0.05);  // Nm³ biogas/d
      const g = Math.min(left, cap), e = g * fCH4 * LHV * clamp01(+p.etaE / 100), h = g * fCH4 * LHV * clamp01(+p.etaT / 100);
      left -= g; Egen += e; heat += h;
      Object.assign(det.U[cu.id] || (det.U[cu.id] = {}), { gas: g, CH4: g * fCH4, load: cap > 0 ? g / cap * 100 : 0, Egen: e, heat: h, value: e * (+p.kWhPrice || 0) });
    }
    let flared = 0;
    for (const cu of G.filter(c => c.type === 'flare')) {
      const cap = Math.max(+cu.p.cap || 0, 0) * 24, g = Math.min(left, cap);
      left -= g; flared += g;
      Object.assign(det.U[cu.id] || (det.U[cu.id] = {}), { flared: g, load: cap > 0 ? g / cap * 100 : 0, slip: g * fCH4 * (1 - clamp01((+cu.p.eff || 99) / 100)) });
    }
    for (const cu of G.filter(c => c.type === 'gasholder')) Object.assign(det.U[cu.id] || (det.U[cu.id] = {}), { V: +cu.p.V, biogas, hours: biogas > 0 ? (+cu.p.V) / (biogas / 24) : Infinity });
    const hasCHP = G.some(c => c.type === 'chp');
    return { biogas, CH4, Egen, heat, flared, vented: left, hasCHP };
  };

  /* ====================================================================== HỒ SINH HỌC */
  UT.lagoon = {
    plabel: { out: 'ra', und: 'bùn nạo vét' },
    label: 'Hồ sinh học (tùy nghi / sục khí / kỵ khí)', group: 'Bể sinh học', ins: ['in'], outs: ['out', 'und'],
    fields: [
      sel('kind', 'Loại hồ', [['fac', 'Hồ tùy nghi – thông khí bề mặt + O₂ quang hợp của tảo'], ['aer', 'Hồ sục khí (máy khuấy/thổi khí)'], ['ana', 'Hồ kỵ khí (không thông khí)']]),
      num('A', 'Diện tích mặt nước (tổng)', 'm²'), num('H', 'Chiều sâu nước', 'm'), num('nCell', 'Số ngăn nối tiếp', ''),
      num('vs', 'Vận tốc lắng chất rắn (cột nước → lớp bùn đáy)', 'm/d'), num('hb', 'Bề dày lớp bùn đáy hoạt động', 'm', { adv: 1 }), num('KLb', 'Hệ số trao đổi chất hòa tan nước ↔ bùn đáy', 'm/d', { adv: 1 }),
      num('Tdes', 'Chu kỳ nạo vét bùn đáy (quy liên tục)', 'ngày'), num('Qd', 'Lưu lượng bùn nạo vét (quy đổi)', 'm³/d', { adv: 1 }),
      num('KL', 'Hệ số tái thông khí bề mặt', 'm/d', { show: p => p.kind !== 'ana' }), num('Palg', 'Quang hợp của tảo (O₂ sinh ra, trung bình ngày)', 'g O₂/m²·d', { show: p => p.kind === 'fac' })
    ].concat(AER_FIELDS.map(f => Object.assign({}, f, { show: p => p.kind === 'aer' && (!f.show || f.show(p)) }))),
    def: () => ({ kind: 'fac', A: 20000, H: 2, nCell: 3, vs: 0.5, hb: 0.3, KLb: 0.05, Tdes: 365, Qd: 1, KL: 0.6, Palg: 8, aer: 'kla', kla: 10, DOsp: 2, klaMax: 100, mix: 1 }), geom: { w: 110, h: 54 },
    glyph: (u, w, h) => `<path class="outline" d="M${-w / 2},${-h / 2 + 10} H${w / 2} L${w / 2 - 14},${h / 2} H${-w / 2 + 14} Z" fill="#dbeafe" stroke="#1e40af" stroke-width="1.5"/><path d="M${-w / 2 + 8},${-h / 2 + 18} q8,-5 16,0 t16,0 t16,0 t16,0 t16,0" fill="none" stroke="#1d4ed8"/><circle cx="${w / 2 - 12}" cy="${-h / 2 + 2}" r="6" fill="#fde047" stroke="#ca8a04"/><path d="M${-w / 2 + 16},${h / 2 - 6} H${w / 2 - 16}" stroke="#92400e" stroke-width="3" opacity=".6"/><text x="-8" y="${h / 2 - 9}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#1e3a8a">${{ fac: 'HỒ TÙY NGHI', aer: 'HỒ SỤC KHÍ', ana: 'HỒ KỴ KHÍ' }[u.p.kind] || 'HỒ'}</text>`
  };
  /* mỗi ngăn: cột nước (khuấy trộn, dòng chảy qua) + lớp bùn đáy (nhận chất rắn lắng với vận tốc vs, trao đổi chất hòa tan với cột nước,
     phân hủy kỵ khí/thiếu khí, nạo vét với tốc độ 1/T_des). Tảo (hồ tùy nghi): quang hợp tạo O₂ + sinh khối (quy XS), lấy CO₂, NH₄, PO₄. */
  UNITX.lagoon = {
    reactor: true,
    ns: (cu, X) => { cu.nSeg = Math.max(1, Math.min(8, Math.round(+cu.p.nCell || 1))); return 2 * X.n * cu.nSeg; },
    init(cu, X) {
      cu.H = Math.max(+cu.p.H, 0.3); cu.Ar = Math.max(+cu.p.A, 1); cu.As = cu.Ar / cu.nSeg; cu.Vt = cu.Ar * cu.H; cu.Vs = cu.Vt / cu.nSeg; cu.V = cu.Vs;
      cu.Vb = cu.As * Math.max(+cu.p.hb || 0.3, 0.05);
      cu.Cs = X.csOf(cu.p.kind === 'aer' ? cu.H : 0); cu.Css = X.csOf(0);
      cu.kset = Math.max(+cu.p.vs || 0, 0) / cu.H; cu.kd = 1 / Math.max(+cu.p.Tdes || 1e6, 10); cu.kex = Math.max(+cu.p.KLb || 0, 0) * cu.As;
      cu.ksurf = cu.p.kind === 'ana' ? 0 : Math.max(+cu.p.KL || 0, 0) / cu.H * Math.pow(1.024, X.pl.T - 20);
      cu.palg = cu.p.kind === 'fac' ? Math.max(+cu.p.Palg || 0, 0) / cu.H : 0;
      // hợp thức tảo: 1 g O₂ sinh ra ↔ 1 g COD sinh khối (quy XS) + CO₂, NH₄, PO₄ theo hàm lượng C, N, P của XS
      const I = X.idx, xs = I.XS, cmp = X.comp;
      cu.alg = { xs, tic: X.iTIC, nh: I[X.m.NH], po: X.m.PO ? I[X.m.PO] : -1 };
      cu.alg.fC = cmp.C && cmp.C[X.iTIC] ? cmp.C[xs] / cmp.C[X.iTIC] : 0;
      cu.alg.fN = cmp.N && cmp.N[cu.alg.nh] ? cmp.N[xs] / cmp.N[cu.alg.nh] : 0;
      cu.alg.fP = cu.alg.po >= 0 && cmp.P && cmp.P[cu.alg.po] ? cmp.P[xs] / cmp.P[cu.alg.po] : 0;
    },
    rows: (cu, F, r) => F.split(cu, r, cu.outs.und, cu.outs.out, 'Q', () => Math.max(+cu.p.Qd || 0, 0.01)),
    out(cu, y, X) {
      const n = X.n, b = cu.off + (cu.nSeg - 1) * 2 * n, qd = X.Qv[cu.outs.und], co = X.C[cu.outs.out], cd = X.C[cu.outs.und];
      for (let k = 0; k < n; k++) {
        co[k] = y[b + k];
        if (!X.isPart[k]) { cd[k] = y[b + k]; continue; }
        let md = 0; for (let j = 0; j < cu.nSeg; j++) md += cu.Vb * Math.max(y[cu.off + j * 2 * n + n + k], 0) * cu.kd;
        cd[k] = qd > 1e-9 ? md / qd + y[b + k] : y[b + k];
      }
    },
    deriv(cu, t, y, dy, X) {
      const n = X.n, q = X.mix(cu, X.cin), D = q / cu.Vs, A = cu.alg;
      for (let j = 0; j < cu.nSeg; j++) {
        const b = cu.off + j * 2 * n, bb = b + n;
        for (let k = 0; k < n; k++) {
          const xw = y[b + k], xb = y[bb + k];
          dy[b + k] = D * ((j === 0 ? X.cin[k] : y[b - 2 * n + k]) - xw);
          if (X.isPart[k]) { const s = cu.kset * xw; dy[b + k] -= s; dy[bb + k] = s * cu.Vs / cu.Vb - cu.kd * xb; }
          else { const J = cu.kex * (xb - xw); dy[b + k] += J / cu.Vs; dy[bb + k] = -J / cu.Vb; }
        }
        const DO = Math.max(y[b + X.iSO], 0);
        dy[b + X.iSO] += cu.ksurf * (cu.Css - DO);
        if (cu.palg > 0) {
          // tảo bị giới hạn khi thiếu N, P hoặc CO₂ (Monod mềm)
          const lim = (i, K) => i >= 0 ? Math.max(y[b + i], 0) / (Math.max(y[b + i], 0) + K) : 1, g = cu.palg * lim(A.nh, 0.1) * lim(A.po, 0.02) * lim(A.tic, 0.05);
          dy[b + X.iSO] += g; dy[b + A.xs] += g; if (A.tic >= 0) dy[b + A.tic] -= g * A.fC; dy[b + A.nh] -= g * A.fN; if (A.po >= 0) dy[b + A.po] -= g * A.fP;
        }
        const kl = cu.p.kind === 'aer' ? X.klaOf(cu, DO) : 0;
        cu.V = cu.Vs; X.bioReact(cu, y, b, dy, kl, X.co2k(kl + cu.ksurf), '_pH' + j);
        cu.V = cu.Vb; X.bioReact(cu, y, bb, dy, 0, 0, '_pHb' + j);   // lớp bùn đáy: không trao đổi khí
      }
    },
    y0(cu, y, X) { for (let j = 0; j < cu.nSeg; j++) { y.set(X.initVector(cu.p.kind !== 'ana', 0.1), cu.off + j * 2 * X.n); y.set(X.initVector(false, 3), cu.off + j * 2 * X.n + X.n); } },
    info(cu, y, info, X) {
      const n = X.n, avg = new Float64Array(n), segs = [];
      let OTR = 0, air = 0, Pb = 0, mass = 0, alg = 0, CO2 = 0;
      for (let j = 0; j < cu.nSeg; j++) {
        const x = y.subarray(cu.off + j * 2 * n, cu.off + j * 2 * n + n), xb = y.subarray(cu.off + j * 2 * n + n, cu.off + (j + 1) * 2 * n);
        const DO = Math.max(x[X.iSO], 0), kl = cu.p.kind === 'aer' ? X.klaOf(cu, DO) : 0;
        OTR += cu.ksurf * (cu.Css - DO) * cu.Vs / 1000; CO2 += X.aerInfo(x, cu.Vs, cu.H, 0, cu.Cs, X.co2k(kl + cu.ksurf)).CO2;
        if (kl > 0) { const ai = X.aerInfo(x, cu.Vs, cu.H, kl, cu.Cs), a = X.aerCalc(ai.OTR, DO, cu.H); OTR += ai.OTR; air += a.air; Pb += a.Pblow; }
        for (let k = 0; k < n; k++) avg[k] += x[k] / cu.nSeg;
        const cc = X.m.composites(x, X.p20, {}), cb = X.m.composites(xb, X.p20, {});
        segs.push({ DO, NH4: cc.NH4, COD: cc.COD, TSS: cc.TSS }); mass += cb.TSS * cu.Vb / 1000 + cc.TSS * cu.Vs / 1000; alg += cu.palg * cu.Vs / 1000;
      }
      const ci = X.m.composites(info.Cin, X.p20, {}), co = X.m.composites(X.C[cu.outs.out], X.p20, {}), cd = X.m.composites(X.C[cu.outs.und], X.p20, {});
      Object.assign(info, { V: cu.Vt, C: avg, OTR, CO2, air, Pblow: Pb, Pmix: 0, segs, HRT: info.Qin > 0 ? cu.Vt / info.Qin : 0, aerated: cu.p.kind !== 'ana', pH: 7,
        OLR: info.Qin * (ci.BOD5 || ci.COD / 2) / 1000 / (cu.Ar / 1e4), CODin: ci.COD, CODout: co.COD, TSSout: co.TSS, sludge: mass, des: X.Qv[cu.outs.und] * cd.TSS / 1000, alg });
    },
    rep: i => [['Thời gian lưu nước', i.HRT, 'ngày'], ['Tải trọng bề mặt (BOD₅)', i.OLR, 'kg/ha·ngđ'], ['COD vào → ra', `${rd(i.CODin)} → ${rd(i.CODout)}`, 'mg/L'], ['TSS ra', i.TSSout, 'mg/L'],
      ['DO theo ngăn', i.segs.map(s => rd(s.DO, 2)).join(' · '), 'mg/L'], ['NH₄-N theo ngăn', i.segs.map(s => rd(s.NH4, 2)).join(' · '), 'mg/L'], ['O₂ quang hợp (tảo)', i.alg, 'kg/d'], ['Chất rắn trong hồ (nước + bùn đáy)', i.sludge, 'kg'], ['Bùn nạo vét (quy đổi)', i.des, 'kg TSS/d']]
  };

  /* ====================================================================== ĐƠN VỊ ĐẶC BIỆT */
  const xf = fn => ({ stateless: true, rows: (cu, F, r) => F.pass(cu, r, cu.outs.out), sep(cu, cin, q, X) { const c = X.C[cu.outs.out]; c.set(cin); cu._rep = fn(cu, c, q, X) || {}; } });

  UT.stripper = {
    label: 'Tháp stripping NH₃ (thổi khí khử amoni)', group: 'Đơn vị đặc biệt', ins: ['in'], outs: ['out'],
    fields: [num('pH', 'pH vận hành (sau nâng pH bằng NaOH / vôi)', '-'), num('T', 'Nhiệt độ nước (0 = nhiệt độ trạm)', '°C'), num('GL', 'Tỷ lệ khí / nước', 'm³/m³'), num('NTU', 'Số đơn vị truyền khối (chiều cao lớp đệm / HTU)', ''),
      num('dP', 'Tổn thất áp quạt', 'Pa', { adv: 1 }), num('Hp', 'Cột áp bơm nước lên tháp', 'm', { adv: 1 })],
    def: () => ({ pH: 11, T: 0, GL: 3000, NTU: 4, dP: 800, Hp: 8 }), geom: { w: 54, h: 80 },
    glyph: (u, w, h) => `<rect class="outline" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="4" fill="#ecfeff" stroke="#0e7490" stroke-width="1.5"/>${[0, 1, 2, 3].map(i => `<path d="M${-w / 2 + 4},${-h / 2 + 20 + i * 12} l${(w - 8) / 4},6 l${(w - 8) / 4},-6 l${(w - 8) / 4},6 l${(w - 8) / 4},-6" fill="none" stroke="#0e7490"/>`).join('')}<text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="9" font-weight="700" fill="#155e75">STR NH₃</text>`
  };
  UNITX.stripper = xf((cu, c, q, X) => {
    const C = cats(X.m), T = +cu.p.T > 0 ? +cu.p.T : X.pl.T, Tk = T + 273.15, pH = +cu.p.pH;
    const pKa = 0.09018 + 2729.92 / Tk, fNH3 = 1 / (1 + Math.pow(10, pKa - pH));
    const Hu = 6.65e-4 * Math.exp(4100 * (1 / 293.15 - 1 / Tk)), S = Math.max(Hu * Math.max(+cu.p.GL, 0) * fNH3, 1e-9), N = Math.max(+cu.p.NTU, 0.1);
    // Kremser (tháp đệm ngược chiều): phần còn lại = (S−1)/(S·e^{N(S−1)/S} − 1)
    const rem = Math.abs(S - 1) < 1e-6 ? 1 / (1 + N) : (S - 1) / (S * Math.exp(N * (S - 1) / S) - 1), eta = clamp01(1 - rem);
    const NH = Math.max(c[C.NH], 0), Nrem = NH * eta;
    c[C.NH] = NH - Nrem;
    if (C.ALK >= 0) c[C.ALK] = Math.max(c[C.ALK] - Nrem / 14.007, 0);
    const alk0 = C.ALK >= 0 ? Math.max(c[C.ALK], 0) : 0, naoh = (alk0 + fNH3 * NH / 14.007) * 40 * q / 1000;   // kg NaOH/d ước tính để nâng pH
    const air = q * Math.max(+cu.p.GL, 0), kW = air / 86400 * Math.max(+cu.p.dP, 0) / 0.6 / 1000 + kWpump(q, +cu.p.Hp || 0, 70);
    return { kW, fNH3: fNH3 * 100, eta: eta * 100, Nrem, NH4in: NH, Ngas: Nrem * q / 1000, air, chem: [{ name: 'NaOH 100 % nâng pH (ước tính)', kg: naoh }] };
  });
  UNITX.stripper.rep = i => [['NH₃ tự do ở pH vận hành', i.fNH3, '%'], ['Hiệu suất khử NH₄', i.eta, '%'], ['NH₄-N vào → khử', `${rd(i.NH4in)} → ${rd(i.Nrem)}`, 'mg/L'], ['N thoát theo khí', i.Ngas, 'kg/d'], ['Lưu lượng khí', i.air / 24, 'm³/h'], ['Điện năng (quạt + bơm)', i.kW, 'kW']];

  UT.heatx = {
    label: 'Gia nhiệt / trao đổi nhiệt', group: 'Đơn vị đặc biệt', ins: ['in'], outs: ['out'],
    fields: [num('Tset', 'Nhiệt độ cần đạt', '°C'), num('Tin', 'Nhiệt độ dòng vào (0 = nhiệt độ trạm)', '°C'), num('rec', 'Thu hồi nhiệt từ dòng ra (trao đổi nhiệt)', '%'), num('eta', 'Hiệu suất lò hơi / gia nhiệt', '%')],
    def: () => ({ Tset: 37, Tin: 0, rec: 50, eta: 85 }), geom: { w: 64, h: 56 },
    glyph: (u, w, h) => box(w, h, '#fee2e2', '#b91c1c', 'GIA NHIỆT', '#991b1b') + `<path d="M${-w / 2 + 8},-8 q8,-10 16,0 t16,0 t16,0" fill="none" stroke="#dc2626" stroke-width="2"/><path d="M${-w / 2 + 8},4 q8,-10 16,0 t16,0 t16,0" fill="none" stroke="#2563eb" stroke-width="2"/>`
  };
  UNITX.heatx = xf((cu, c, q, X) => {
    const Tin = +cu.p.Tin > 0 ? +cu.p.Tin : X.pl.T, dT = Math.max(+cu.p.Tset - Tin, 0);
    const need = q * 1000 * 4.186 * dT / 3600;   // kWh/d
    const heat = need * (1 - clamp01(+cu.p.rec / 100)) / Math.max(clamp01(+cu.p.eta / 100), 0.05);
    return { kW: 0, need, heat, kWth: heat / 24, dT, CH4eq: heat / 9.97 };
  });
  UNITX.heatx.rep = i => [['Tăng nhiệt độ', i.dT, '°C'], ['Nhiệt cần (chưa thu hồi)', i.need, 'kWh/d'], ['Nhiệt cấp (sau thu hồi, hiệu suất)', i.heat, 'kWh/d'], ['Công suất nhiệt', i.kWth, 'kW'], ['CH₄ tương đương', i.CH4eq, 'Nm³/d']];

  UT.pump = {
    label: 'Bơm (năng lượng bơm dòng)', group: 'Đơn vị đặc biệt', ins: ['in'], outs: ['out'],
    fields: [num('H', 'Cột áp', 'm'), num('eta', 'Hiệu suất bơm + động cơ', '%')],
    def: () => ({ H: 10, eta: 65 }), geom: { w: 46, h: 46 },
    glyph: () => `<circle class="outline" cx="0" cy="0" r="20" fill="#eff6ff" stroke="#1e40af" stroke-width="1.5"/><path d="M-9,-11 L13,0 L-9,11 Z" fill="#1e40af"/>`
  };
  UNITX.pump = xf((cu, c, q) => ({ kW: kWpump(q, +cu.p.H, +cu.p.eta), Q: q, kWh: kWpump(q, +cu.p.H, +cu.p.eta) * 24 }));
  UNITX.pump.rep = i => [['Lưu lượng', i.Q / 24, 'm³/h'], ['Công suất điện', i.kW, 'kW'], ['Điện năng', i.kWh, 'kWh/d']];

  /* ====================================================================== LƯU VỰC & SÔNG */
  UT.catchment = {
    label: 'Lưu vực – nước mưa chảy tràn (đô thị / nông thôn)', group: 'Lưu vực & sông', ins: [], outs: ['out'],
    fields: [
      sel('kind', 'Loại lưu vực', [['urban', 'Đô thị (bề mặt không thấm cao)'], ['rural', 'Nông thôn / nông nghiệp']]),
      num('A', 'Diện tích lưu vực', 'ha'), num('imp', 'Tỷ lệ bề mặt không thấm', '%'), num('Cr', 'Hệ số dòng chảy phần thấm', '-'),
      num('i', 'Cường độ mưa thiết kế', 'mm/h'), num('dur', 'Thời gian mưa', 'h'), num('per', 'Chu kỳ lặp trận mưa', 'ngày'), num('t0', 'Giờ bắt đầu mưa', 'h'),
      num('Qb', 'Dòng nền (nước ngầm thấm / nước thải khô)', 'm³/d'),
      num('COD', 'Nồng độ trung bình trận (EMC) – COD', 'mg/L'), num('TSS', 'EMC – TSS', 'mg/L'), num('TKN', 'EMC – TKN', 'mg/L'), num('TP', 'EMC – TP', 'mg/L'),
      num('CODb', 'Dòng nền – COD', 'mg/L', { adv: 1 }), num('TSSb', 'Dòng nền – TSS', 'mg/L', { adv: 1 }), num('TKNb', 'Dòng nền – TKN', 'mg/L', { adv: 1 }), num('TPb', 'Dòng nền – TP', 'mg/L', { adv: 1 })
    ],
    def: () => ({ kind: 'urban', A: 100, imp: 60, Cr: 0.15, i: 25, dur: 2, per: 3, t0: 14, Qb: 300, COD: 120, TSS: 180, TKN: 4, TP: 0.7, CODb: 20, TSSb: 10, TKNb: 1.5, TPb: 0.15 }), geom: { w: 84, h: 62 },
    glyph: (u, w, h) => `<path class="outline" d="M${-w / 2},${h / 2 - 4} Q0,${h / 2 - 22} ${w / 2},${h / 2 - 4} Z" fill="#dcfce7" stroke="#15803d" stroke-width="1.5"/>${u.p.kind === 'rural' ? `<circle cx="-14" cy="0" r="8" fill="#22c55e"/><rect x="-15" y="6" width="2" height="8" fill="#713f12"/><circle cx="10" cy="-4" r="10" fill="#16a34a"/><rect x="9" y="5" width="2" height="9" fill="#713f12"/>` : `<rect x="-24" y="-14" width="14" height="24" fill="#cbd5e1" stroke="#475569"/><rect x="-6" y="-22" width="14" height="32" fill="#e2e8f0" stroke="#475569"/><rect x="12" y="-8" width="12" height="18" fill="#cbd5e1" stroke="#475569"/>`}<path d="M${-w / 2 + 6},${-h / 2 + 6} l-3,7 M${-w / 2 + 16},${-h / 2 + 4} l-3,7 M${w / 2 - 10},${-h / 2 + 6} l-3,7" stroke="#2563eb" stroke-width="1.5"/>`
  };
  UNITX.catchment = {
    init(cu, X) {
      const p = cu.p, mk = (COD, TSS, TKN, TP) => INF.characterize(X.m, X.p20, Object.assign(INF.defaults(), { COD, fSI: 0.1, fSB: 0.12, fSA: 0.3, fXI: 0.3, fXH: 0.02, TKN, fNH4: 0.4, TP, fPO4: 0.3, TSS, Alk: 80, pH: 7, DO: 6 })).x;
      cu._xr = mk(+p.COD, +p.TSS, +p.TKN, +p.TP); cu._xb = mk(+p.CODb, +p.TSSb, +p.TKNb, +p.TPb);
      const C = (clamp01(+p.imp / 100) * 0.9 + (1 - clamp01(+p.imp / 100)) * Math.max(+p.Cr || 0, 0));
      cu._Qr = C * Math.max(+p.i, 0) / 1000 * Math.max(+p.A, 0) * 1e4 * 24;      // m³/d khi đang mưa
      cu._fr = Math.min(Math.max(+p.dur, 0) / 24 / Math.max(+p.per, 0.1), 1);   // phần thời gian có mưa
    },
    rows(cu, F, r, X) {
      const qb = () => Math.max(+cu.p.Qb || 0, 0);
      return F.fixed(r, cu.outs.out, (t) => {
        if (X.steady()) return qb() + cu._Qr * cu._fr;
        const per = Math.max(+cu.p.per, 0.1), ph = ((t - (+cu.p.t0 || 0) / 24) % per + per) % per, d = Math.max(+cu.p.dur, 0) / 24, s = Math.min(d / 20, 0.01);
        const on = 1 / (1 + Math.exp(-ph / Math.max(s, 1e-4) + 3)) * (1 / (1 + Math.exp((ph - d) / Math.max(s, 1e-4))));
        return qb() + cu._Qr * on;
      });
    },
    out(cu, y, X) {
      const Q = X.Qv[cu.outs.out], qb = Math.max(+cu.p.Qb || 0, 0), qr = Math.max(Q - qb, 0), c = X.C[cu.outs.out];
      for (let k = 0; k < X.n; k++) c[k] = Q > 1e-9 ? (qb * cu._xb[k] + qr * cu._xr[k]) / Q : cu._xb[k];
    },
    info(cu, y, info, X) { const Q = X.Q[cu.outs.out]; Object.assign(info, { Q, Qrain: cu._Qr, frain: cu._fr * 100, V: cu._Qr * Math.max(+cu.p.dur, 0) / 24 }); },
    rep: i => [['Lưu lượng hiện tại (trung bình khi ổn định)', i.Q, 'm³/d'], ['Lưu lượng khi mưa', i.Qrain, 'm³/d'], ['Thể tích mỗi trận mưa', i.V, 'm³'], ['Thời gian có mưa', i.frain, '%']]
  };

  UT.cso = {
    plabel: { out: 'về trạm', und: 'tràn' },
    label: 'Tràn tách dòng mưa (CSO / đập tràn)', group: 'Lưu vực & sông', ins: ['in'], outs: ['out', 'und'],
    fields: [num('Qmax', 'Lưu lượng tối đa chuyển về trạm', 'm³/d'), num('fs', 'Độ trơn ngưỡng tràn', '% Qmax', { adv: 1 })],
    def: () => ({ Qmax: 30000, fs: 1 }), geom: { w: 60, h: 50 },
    glyph: (u, w, h) => box(w, h, '#f1f5f9', '#475569', 'TRÀN CSO', '#334155') + `<path d="M${-w / 2 + 6},6 H-4 V-6 H${w / 2 - 6}" fill="none" stroke="#2563eb" stroke-width="2"/><path d="M-4,-6 V${h / 2 - 2}" stroke="#92400e" stroke-width="2" stroke-dasharray="3 2"/>`
  };
  UNITX.cso = {
    stateless: true,
    rows: (cu, F, r) => F.split(cu, r, cu.outs.und, cu.outs.out, 'dyn'),
    qdyn: (cu, cin, q) => { const Qm = Math.max(+cu.p.Qmax || 0, 1), s = Qm * Math.max(+cu.p.fs || 1, 0.1) / 100; const z = (q - Qm) / s; return z > 30 ? q - Qm : s * Math.log1p(Math.exp(z)); },
    sep(cu, cin, q, X) {
      const qu = X.Qv[cu.outs.und] || 0, r = q > 1e-9 ? Math.min(qu / q, 1) : 0, f = fracVec(cu, X, () => r, q);
      const { Qo, Qu } = split(cu, cin, q, X, f, 'out', 'und');
      if (X.wantRep === false) return;
      cu._rep = { Qo, Qu, fov: q > 0 ? Qu / q * 100 : 0, load: Qu * tss(cin, X) / 1000, COD: Qu * X.m.composites(cin, X.p20, {}).COD / 1000 };
    },
    rep: i => [['Về trạm / tràn', `${rd(i.Qo)} / ${rd(i.Qu)}`, 'm³/d'], ['Tỷ lệ tràn', i.fov, '%'], ['Tải tràn TSS / COD', `${rd(i.load)} / ${rd(i.COD)}`, 'kg/d']]
  };

  UT.river = {
    label: 'Đoạn sông (tái thông khí, tự làm sạch)', group: 'Lưu vực & sông', ins: ['in'], outs: ['out'],
    fields: [num('L', 'Chiều dài đoạn sông', 'km'), num('W', 'Bề rộng trung bình', 'm'), num('H', 'Chiều sâu trung bình', 'm'), num('nSeg', 'Số đoạn tính', ''),
      num('k2', 'Hệ số tái thông khí k₂ ở 20 °C (0 = O\'Connor–Dobbins)', '1/d'), num('SOD', 'Nhu cầu O₂ trầm tích', 'g O₂/m²·d')],
    def: () => ({ L: 5, W: 30, H: 2, nSeg: 8, k2: 0, SOD: 1 }), geom: { w: 110, h: 44 },
    glyph: (u, w, h) => `<path class="outline" d="M${-w / 2},${-6} q${w / 8},-14 ${w / 4},0 t${w / 4},0 t${w / 4},0 t${w / 4},0 V${h / 2 - 4} q${-w / 8},-14 ${-w / 4},0 t${-w / 4},0 t${-w / 4},0 t${-w / 4},0 Z" fill="#bfdbfe" stroke="#1d4ed8" stroke-width="1.5"/><text x="0" y="${h / 2 - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#1e3a8a">SÔNG</text>`
  };
  UNITX.river = {
    ns: (cu, X) => { cu.nSeg = Math.max(1, Math.min(30, Math.round(+cu.p.nSeg || 5))); return X.n * cu.nSeg; },
    init(cu, X) {
      cu.H = Math.max(+cu.p.H, 0.1); cu.Ar = Math.max(+cu.p.L, 0.01) * 1000 * Math.max(+cu.p.W, 0.5); cu.Vt = cu.Ar * cu.H; cu.Vs = cu.Vt / cu.nSeg; cu.V = cu.Vs; cu.Css = X.csOf(0);
      cu.sod = Math.max(+cu.p.SOD || 0, 0) / cu.H * Math.pow(1.065, X.pl.T - 20); cu._T = X.pl.T;
    },
    k2(cu, q) {
      if (+cu.p.k2 > 0) return +cu.p.k2 * Math.pow(1.024, cu._T - 20);
      const v = q / 86400 / Math.max(+cu.p.W * cu.H, 0.01);       // m/s
      return 3.93 * Math.sqrt(Math.max(v, 1e-4)) / Math.pow(cu.H, 1.5) * Math.pow(1.024, cu._T - 20);
    },
    rows: (cu, F, r) => F.pass(cu, r, cu.outs.out),
    out(cu, y, X) { const c = X.C[cu.outs.out], b = cu.off + (cu.nSeg - 1) * X.n; for (let k = 0; k < X.n; k++) c[k] = y[b + k]; },
    deriv(cu, t, y, dy, X) {
      const n = X.n, q = X.mix(cu, X.cin), D = q / cu.Vs; cu._T = X.pl.T;
      const k2 = UNITX.river.k2(cu, q);
      for (let j = 0; j < cu.nSeg; j++) {
        const b = cu.off + j * n;
        for (let k = 0; k < n; k++) dy[b + k] = D * ((j === 0 ? X.cin[k] : y[b - n + k]) - y[b + k]);
        const DO = Math.max(y[b + X.iSO], 0);
        dy[b + X.iSO] += k2 * (cu.Css - DO) - cu.sod * DO / (DO + 0.5);
        cu.V = cu.Vs; X.bioReact(cu, y, b, dy, 0, X.co2k(k2), '_pH' + j);
      }
    },
    y0(cu, y, X) { for (let j = 0; j < cu.nSeg; j++) y.set(X.initVector(true, 0.01), cu.off + j * X.n); },
    info(cu, y, info, X) {
      const n = X.n, q = info.Qin, k2 = UNITX.river.k2(cu, q), segs = [], avg = new Float64Array(n);
      let OTR = 0, minDO = Infinity, CO2 = 0;
      for (let j = 0; j < cu.nSeg; j++) {
        const x = y.subarray(cu.off + j * n, cu.off + (j + 1) * n), DO = Math.max(x[X.iSO], 0), cc = X.m.composites(x, X.p20, {});
        OTR += (k2 * (cu.Css - DO) - cu.sod * DO / (DO + 0.5)) * cu.Vs / 1000; CO2 += X.aerInfo(x, cu.Vs, cu.H, k2, cu.Css).CO2; minDO = Math.min(minDO, DO);
        segs.push({ DO, BOD: cc.BOD5, NH4: cc.NH4 }); for (let k = 0; k < n; k++) avg[k] += x[k] / cu.nSeg;
      }
      Object.assign(info, { V: cu.Vt, C: avg, OTR, CO2, segs, minDO, k2, Cs: cu.Css, HRT: q > 0 ? cu.Vt / q * 24 : 0, v: q / 86400 / Math.max(+cu.p.W * cu.H, 0.01) });
    },
    rep: i => [['Vận tốc / thời gian chảy', `${rd(i.v, 2)} m/s · ${rd(i.HRT)} h`, ''], ['k₂ tái thông khí', i.k2, '1/d'], ['DO bão hòa / DO thấp nhất', `${rd(i.Cs)} / ${rd(i.minDO)}`, 'mg/L'],
      ['DO dọc sông', i.segs.map(s => rd(s.DO, 2)).join(' · '), 'mg/L'], ['BOD₅ dọc sông', i.segs.map(s => rd(s.BOD, 2)).join(' · '), 'mg/L'], ['NH₄-N dọc sông', i.segs.map(s => rd(s.NH4, 2)).join(' · '), 'mg/L']]
  };

  /* ====================================================================== MẠNG THOÁT NƯỚC: TRẠM BƠM HỐ THU */
  UT.wetwell = {
    label: 'Trạm bơm hố thu (bơm theo mực nước)', group: 'Mạng thoát nước', ins: ['in'], outs: ['out'],
    fields: [num('Vmax', 'Thể tích hố thu (mực tràn)', 'm³'), num('Vmin', 'Thể tích ở mực dừng bơm', 'm³'), num('Hw', 'Chiều sâu hố', 'm'),
      num('Qp', 'Lưu lượng 1 bơm', 'm³/h'), num('nP', 'Số bơm làm việc', 'bơm'), num('Hp', 'Cột áp bơm', 'm'), num('etaP', 'Hiệu suất bơm + động cơ', '%'), num('lv0', 'Mực nước ban đầu', '% V_max', { adv: 1 })],
    def: () => ({ Vmax: 150, Vmin: 20, Hw: 4, Qp: 400, nP: 2, Hp: 15, etaP: 62, lv0: 50 }), geom: { w: 60, h: 70 },
    glyph: (u, w, h) => `<path class="outline" d="M${-w / 2},${-h / 2} V${h / 2} H${w / 2} V${-h / 2}" fill="#eef2ff" stroke="#3730a3" stroke-width="1.5"/><rect x="${-w / 2 + 2}" y="0" width="${w - 4}" height="${h / 2 - 2}" fill="url(#gW)"/><circle cx="0" cy="${h / 2 - 14}" r="9" fill="#c7d2fe" stroke="#3730a3"/><path d="M-4,${h / 2 - 19} L6,${h / 2 - 14} L-4,${h / 2 - 9} Z" fill="#3730a3"/><text x="0" y="${-h / 2 + 12}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#312e81">HỐ BƠM</text>`
  };
  const EQ = UNITX.eqtank;
  UNITX.wetwell = Object.assign({}, EQ, {
    init(cu, X) { Object.assign(cu.p, { H: +cu.p.Hw, qmode: 'Q', Qset: Math.max(+cu.p.Qp, 0) * Math.max(+cu.p.nP, 1) * 24, aer: 'none', mix: 0 }); EQ.init(cu, X); },
    rows(cu, F, r, X) { Object.assign(cu.p, { qmode: 'Q', Qset: Math.max(+cu.p.Qp, 0) * Math.max(+cu.p.nP, 1) * 24 }); return EQ.rows(cu, F, r, X); },
    redScale(p, N) { p.Vmax = +p.Vmax / N; p.Vmin = +p.Vmin / N; p.Qp = +p.Qp / N; },
    info(cu, y, info, X) { EQ.info(cu, y, info, X); const qo = X.Q[cu.outs.out]; Object.assign(info, { kW: kWpump(qo, +cu.p.Hp, +cu.p.etaP), duty: qo / Math.max((+cu.p.Qp) * (+cu.p.nP) * 24, 1e-9) * 100, Pmix: 0 }); },
    rep: i => [['Thể tích / mực nước', `${rd(i.V)} m³ · ${rd(i.level)} %`, ''], ['Lưu lượng vào → bơm', `${rd(i.Qin)} → ${rd(i.Qout)}`, 'm³/d'], ['Tỷ lệ thời gian bơm chạy', i.duty, '%'], ['Công suất bơm (trung bình)', i.kW, 'kW']]
  });
  Object.assign(ACTUATORS, { cso: [['Qmax', 'Lưu lượng tối đa về trạm (m³/d)']], stripper: [['pH', 'pH vận hành']], lagoon: [['kla', 'kLa (1/d)'], ['DOsp', 'DO đặt (mg/L)']] });
})();
