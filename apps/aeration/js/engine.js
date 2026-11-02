// Aeration Design Tool – lõi tính toán (không phụ thuộc giao diện; chạy được trong Node để kiểm thử)
'use strict';
var ENG = {};
(function () {
  const DBx = (typeof DB !== 'undefined') ? DB : require('./db.js');
  const g = 9.80665, R = 287.05, P0 = 101.325, RHOS = 1.2041, WO2 = 0.2314, O2S = RHOS * WO2;
  const CP = 1.006, KX = 0.2832, KF = 3.531;           // (k−1)/k và k/(k−1) với k = 1,395
  ENG.C = { g, R, P0, RHOS, WO2, O2S, CP, KX, KF, NM: 273.15 / 293.15 };

  // ---------- hàm cơ bản ----------
  ENG.patm = z => P0 * Math.pow(1 - 2.25577e-5 * z, 5.25588);             // kPa theo cao độ (m)
  ENG.cs = T => {                                                          // DO bão hòa 1 atm (Benson–Krause), mg/L
    const K = T + 273.15;
    return Math.exp(-139.34411 + 1.575701e5 / K - 6.642308e7 / K ** 2 + 1.2438e10 / K ** 3 - 8.621949e11 / K ** 4);
  };
  ENG.psat = T => 0.61094 * Math.exp(17.625 * T / (T + 243.04));          // kPa (Magnus)
  ENG.hum = (T, RH, p) => { const pv = RH / 100 * ENG.psat(T); return 0.622 * pv / (p - pv); };  // kg nước/kg KK khô
  ENG.stdMotor = kw => { for (const m of DBx.motors) if (m >= kw - 1e-9) return m; return Math.ceil(kw / 50) * 50; };
  ENG.dnRow = dn => DBx.dn.find(r => r[0] === dn) || DBx.dn[DBx.dn.length - 1];
  ENG.velRange = dn => { for (const r of DBx.vel) if (dn <= r[0]) return [r[1], r[2]]; return DBx.vel[DBx.vel.length - 1].slice(1); };
  const ceil = Math.ceil, max = Math.max, min = Math.min, pow = Math.pow;

  // ---------- 1. Nhu cầu oxy thực tế AOR ----------
  ENG.aor = S => {
    const L = S.load, o = { mode: L.mode };
    if (L.mode === 'loads') {
      o.bod = L.Q * (L.BODin - L.BODout) / 1000 + L.sideBOD;
      o.nsyn = L.fNsyn * o.bod;
      o.nn = max(0, L.Q * (L.TKNin - L.NH4out) / 1000 + L.sideN - o.nsyn);
      o.dn = L.dnCredit ? L.Q * L.NO3dn / 1000 : 0;
      o.oBOD = L.kBOD * o.bod; o.oN = L.kN * o.nn; o.oDN = L.kDN * o.dn; o.oOther = L.other;
      o.avg = o.oBOD + o.oN - o.oDN + o.oOther;
      o.pk = o.avg * L.fPk; o.min = o.avg * L.fMin;
    } else if (L.mode === 'aor') {
      o.avg = L.AOR_avg; o.pk = L.AOR_pk; o.min = L.AOR_min;
    } else { o.avg = o.pk = o.min = null; }
    return o;
  };

  // Hệ số AOR/SOR (Sanitaire Eq.1): AOR = SOR·α·θ^(T−20)·(β·Pf/Pmsl·C*sat,T − DO)/C*sat,20
  ENG.ratio = (S, kind, T, DO, Hsub) => {
    const w = S.water, Pf = ENG.patm(S.site.elev);
    const alpha = kind === 'fb' ? w.a_fb * w.F : kind === 'cb' ? w.a_cb : w.a_me;
    const de = { fb: w.de_fb, cb: w.de_cb, jet: w.de_jet, asp: 0, surf: 0 }[kind];
    const c20 = ENG.cs(20) * (1 + de * Hsub / 10.33);
    const cT = c20 * ENG.cs(T) / ENG.cs(20);
    const th = pow(w.theta, T - 20);
    const ratio = alpha * th * (w.beta * Pf / P0 * cT - DO) / c20;
    return { alpha, de, c20, cT, th, Pf, Om: Pf / P0, ratio, T, DO, Hsub };
  };

  ENG.govEn = { 'O₂': 'O₂', 'Khuấy trộn': 'Mixing', 'q tối thiểu/phần tử': 'Min q/element' };

  // Điều kiện thiết kế
  ENG.conds = S => [
    { k: 'min', name: 'Tối thiểu', en: 'Minimum', T: S.site.Tw_win, DO: S.water.DO_avg, w: S.op.wMin },
    { k: 'avg', name: 'Trung bình', en: 'Average', T: S.site.Tw_sum, DO: S.water.DO_avg, w: S.op.wAvg },
    { k: 'pk', name: 'Cực đại', en: 'Peak', T: S.site.Tw_sum, DO: S.water.DO_pk, w: S.op.wPk }
  ];

  // Nhu cầu oxy cho một bể đang sục khí, kg O2/h
  ENG.basinAOTR = (S, A) => {
    const t = S.tank, r = {};
    for (const k of ['min', 'avg', 'pk']) r[k] = A[k] == null ? null : A[k] / (t.nBasin * t.aerHours);
    return r;
  };
  ENG.subm = (S, kind) => {
    const t = S.tank, Hm = (t.H + t.Hbwl) / 2;
    if (kind === 'fb' || kind === 'cb') return { mean: Hm - t.hDiff, max: t.H - t.hDiff, min: t.Hbwl - t.hDiff };
    if (kind === 'jet') return { mean: Hm - 0.5, max: t.H - 0.5, min: t.Hbwl - 0.5 };
    return { mean: 0, max: 0, min: 0 };
  };
  // SOTR yêu cầu của 1 bể (kg/h) theo loại công nghệ
  ENG.sotrReq = (S, kind, A) => {
    const sub = ENG.subm(S, kind), out = { rat: {} };
    const ab = ENG.basinAOTR(S, A);
    for (const c of ENG.conds(S)) {
      const r = ENG.ratio(S, kind, c.T, c.DO, sub.mean);
      out.rat[c.k] = r;
      if (S.load.mode === 'sotr') out[c.k] = S.load['SOTR_' + c.k];
      else out[c.k] = ab[c.k] / r.ratio;
    }
    out.aotr = ab;
    return out;
  };

  // ---------- 2. Đĩa/ống phân phối khí ----------
  // SOTE = min(smax, s·H·(ATADref/ATAD)^b·(q/qref)^c); khí Q (Sm³/h) giải dạng đóng
  ENG.airFor = (d, H, N, A, SOTR) => {
    const atad = A / (N * d.a);
    const K = d.s / 100 * H * pow(d.ATADref / atad, d.b);
    let Q = pow(SOTR / (O2S * K) * pow(N * d.qref, d.c), 1 / (1 + d.c));
    let sote = K * pow(Q / N / d.qref, d.c), cap = false;
    if (sote > d.smax) { sote = d.smax; Q = SOTR / (O2S * sote); cap = true; }
    return { Q, sote, atad, K, cap };
  };
  ENG.soteAt = (d, H, N, A, q) => min(d.smax, d.s / 100 * H * pow(d.ATADref / (A / (N * d.a)), d.b) * pow(q / d.qref, d.c));

  // Bố trí lưới: ống nhánh (lateral) chạy theo chiều rộng, xếp dọc theo chiều dài
  ENG.layout = (d, L, W, N, o) => {
    const c = o.wallClr, Ll = L - 2 * c, Wl = W - 2 * c;
    const lin = d.len > 0.5;                 // ống / tấm dài
    const pdMin = lin ? d.len + 0.1 : d.sp, plMin = o.latMin;
    const nPerMax = lin ? max(1, Math.floor((Wl + 0.1) / pdMin)) : Math.floor(Wl / pdMin) + 1;
    const nLatMax = Math.floor(Ll / plMin) + 1;
    const s = Math.sqrt(Ll * Wl / max(N, 1));
    let nPer = lin ? nPerMax : min(nPerMax, max(1, Math.round(Wl / max(s, pdMin)) + 1));
    let nLat = ceil(N / nPer);
    if (nLat > nLatMax) { nLat = nLatMax; nPer = min(nPerMax, ceil(N / nLat)); }
    const Nlay = nLat * nPer;
    const pl = nLat > 1 ? Ll / (nLat - 1) : 0;
    const pd = lin ? (Wl / nPer) : (nPer > 1 ? Wl / (nPer - 1) : 0);
    let nGrid = o.nGrid > 0 ? o.nGrid : max(1, ceil(L / o.gridLen), ceil(Nlay / o.gridMaxDiff));
    nGrid = min(nGrid, nLat);
    const latPerGrid = []; for (let i = 0; i < nGrid; i++) latPerGrid.push(Math.floor(nLat / nGrid) + (i < nLat % nGrid ? 1 : 0));
    return { c, Ll, Wl, nPer, nLat, N: Nlay, pl, pd, nGrid, latPerGrid, lin, limited: Nlay < N, Ngeo: nPerMax * nLatMax };
  };

  // ---------- 3. Đường ống khí ----------
  ENG.fric = (Re, eps, D) => Re < 2300 ? 64 / max(Re, 1) : 0.25 / pow(Math.log10(eps / (3.7 * D) + 5.74 / pow(Re, 0.9)), 2);
  ENG.mu = T => 1.458e-6 * pow(T + 273.15, 1.5) / (T + 273.15 + 110.4);   // Sutherland, Pa·s
  ENG.segCalc = (seg, dn, Qs, T, pabs) => {
    const row = ENG.dnRow(dn), D = row[2] / 1000;
    const Qa = Qs * (P0 / pabs) * ((T + 273.15) / 293.15) / 3600;       // m³/s thực
    const A = Math.PI * D * D / 4, v = Qa / A;
    const rho = pabs * 1000 / (R * (T + 273.15));
    const Re = rho * v * D / ENG.mu(T);
    const f = ENG.fric(Re, seg.eps, D);
    const dyn = rho * v * v / 2;
    const dp = ((f * seg.L / D) * seg.dist + seg.K) * dyn / 1000;        // kPa
    const vr = ENG.velRange(dn);
    return { dn, D, OD: row[1], Qs, Qa: Qa * 3600, v, rho, Re, f, dp, vr, T, pabs };
  };
  ENG.pickDN = (seg, Qs, T, pabs) => {
    for (const r of DBx.dn) {
      if (r[0] < seg.minDN) continue;
      const c = ENG.segCalc(seg, r[0], Qs, T, pabs);
      if (c.v <= min(seg.vmax, c.vr[1])) return r[0];
    }
    return DBx.dn[DBx.dn.length - 1][0];
  };

  // ---------- 4. Máy thổi khí ----------
  ENG.padKW = (mdot, T1, r) => mdot * KF * R / 1000 * (T1 + 273.15) * (pow(r, KX) - 1);   // kW đoạn nhiệt
  ENG.tCap = (fam, m, pg, T1, p1) => {                                     // công suất model tại áp pg (kPa g)
    const unit = fam === 'max' ? 98.0665 : 100, p = pg / unit, P = fam === 'max' ? DBx.turbomax.p : DBx.turbolight.p;
    const q = m.q;
    let lo = -1;
    for (let i = 0; i < P.length; i++) if (P[i] <= p + 1e-9) lo = i;
    let qq;
    if (lo < 0) qq = q[0];
    else if (lo === P.length - 1 || q[lo + 1] == null) qq = (Math.abs(P[lo] - p) < 1e-6 ? q[lo] : null);
    else qq = (q[lo] == null) ? null : q[lo] + (q[lo + 1] - q[lo]) * (p - P[lo]) / (P[lo + 1] - P[lo]);
    if (qq == null) return null;
    return qq * (293.15 / (T1 + 273.15)) * (p1 / P0);
  };
  ENG.turboModels = (Qu, pg, T1, p1) => {
    const out = [];
    for (const m of DBx.turbolight.models) { const c = ENG.tCap('tl', m, pg, T1, p1); if (c) out.push({ fam: 'TurboLIGHT', m: m.m, kW: m.kW, cap: c, dim: m.dim, kg: m.kg }); }
    for (const m of DBx.turbomax.models) { const c = ENG.tCap('max', m, pg, T1, p1); if (c) out.push({ fam: 'TurboMAX', m: m.m, kW: m.kW, cap: c, dim: m.dim, kg: m.kg }); }
    return out.filter(x => x.cap >= Qu).sort((a, b) => a.kW - b.kW);
  };
  ENG.blowerDim = (kW, tech) => {                                         // kích thước tham khảo khi không có catalogue
    const f = tech === 'lobe' || tech === 'screw' ? 1.25 : tech === 'ig' || tech === 'ms' ? 1.6 : 1.0;
    const L = (1.1 + 0.55 * Math.sqrt(kW / 10)) * f, Wd = (0.8 + 0.3 * Math.sqrt(kW / 10)) * f;
    return [Math.round(Wd * 1000 / 50) * 50, Math.round(L * 1000 / 50) * 50, Math.round((1.1 + 0.25 * Math.sqrt(kW / 10)) * 1000 / 50) * 50];
  };

  // ---------- 5. Hệ sục khí khuếch tán (bọt mịn / bọt thô) ----------
  ENG.runDiffused = (S, dk, A, opts) => {
    opts = opts || {};
    const d = DBx.diff[dk], kind = d.kind, t = S.tank, G = S.grid, W = [];
    const sel = opts.selected;
    const Af = t.L * t.W, V = Af * t.H;
    const sub = ENG.subm(S, kind), H = sub.mean;
    const SR = ENG.sotrReq(S, kind, A);
    const qT = (sel && G.qTarget > 0) ? G.qTarget : d.qdes;
    // số phần tử theo lưu lượng mục tiêu ở điều kiện cực đại
    let N = max(1, ceil(Af / (d.a * 20)));
    for (let i = 0; i < 60; i++) { const r = ENG.airFor(d, H, N, Af, SR.pk); const Nn = max(1, ceil(r.Q / qT)); if (Nn === N) break; N = Nn; }
    const NmaxAt = Math.floor(Af / (d.a * d.ATADmin));
    if (N > NmaxAt) { W.push(['warn', `Số phần tử yêu cầu (${N}) vượt mật độ tối đa (AT/AD ≥ ${d.ATADmin}); giới hạn ở ${NmaxAt} – lưu lượng/phần tử sẽ cao hơn mục tiêu.`, `Required element count (${N}) exceeds maximum density (AT/AD ≥ ${d.ATADmin}); limited to ${NmaxAt} – flow per element will exceed target.`]); N = NmaxAt; }
    const NminAt = ceil(Af / (d.a * d.ATADmax));
    if (N < NminAt) N = NminAt;
    if (sel && G.Nfix > 0) N = G.Nfix;
    const lay = ENG.layout(d, t.L, t.W, N, { wallClr: G.wallClr, latMin: G.latMin, nGrid: sel ? G.nGrid : 0, gridLen: G.gridLen, gridMaxDiff: G.gridMaxDiff });
    if (lay.limited) W.push(['warn', `Bể chỉ bố trí được ${lay.N} phần tử (${lay.nLat} ống nhánh × ${lay.nPer}) < ${N} theo lưu lượng mục tiêu – lưu lượng/phần tử tăng tương ứng.`, `Basin fits only ${lay.N} elements (${lay.nLat} laterals × ${lay.nPer}) < ${N} at target flow – flow per element increases accordingly.`]);
    N = lay.N;
    const atad = Af / (N * d.a);
    const mixRate = kind === 'fb' ? G.mixFB * Af : G.mixCB * V;     // Sm³/h
    const cond = {};
    for (const c of ENG.conds(S)) {
      const r = ENG.airFor(d, H, N, Af, SR[c.k]);
      const Qmin = N * d.qmin;
      let Q = r.Q, gov = 'O₂';
      if (mixRate > Q) { Q = mixRate; gov = 'Khuấy trộn'; }
      if (Qmin > Q) { Q = Qmin; gov = 'q tối thiểu/phần tử'; }
      const q = Q / N, sote = ENG.soteAt(d, H, N, Af, q);
      cond[c.k] = { SOTR: SR[c.k], Qo2: r.Q, Q, q, sote, soteO2: r.sote, gov, flux: q / d.a, cap: r.cap, SOTRdel: Q * O2S * sote };
    }
    if (cond.pk.q > d.qmax * 1.0001) {
      if (cond.pk.q <= d.qpk) W.push(['warn', `Lưu lượng/phần tử ở cực đại ${cond.pk.q.toFixed(2)} Sm³/h vượt dải thường (${d.qmax}) – chỉ chấp nhận ngắn hạn (≤ ${d.qpk}).`, `Peak flow per element ${cond.pk.q.toFixed(2)} Sm³/h exceeds normal range (${d.qmax}) – short-term only (≤ ${d.qpk}).`]);
      else W.push(['err', `Lưu lượng/phần tử ở cực đại ${cond.pk.q.toFixed(2)} Sm³/h vượt giới hạn ${d.qpk} Sm³/h.`, `Peak flow per element ${cond.pk.q.toFixed(2)} Sm³/h exceeds limit ${d.qpk} Sm³/h.`]);
    }
    if (cond.min.gov !== 'O₂') W.push(['info', `Ở điều kiện tối thiểu lưu lượng khí bị chi phối bởi “${cond.min.gov}” (${cond.min.Q.toFixed(0)} Sm³/h) – DO sẽ cao hơn điểm đặt.`, `At minimum conditions air flow is governed by “${ENG.govEn[cond.min.gov] || cond.min.gov}” (${cond.min.Q.toFixed(0)} Sm³/h) – DO will exceed setpoint.`]);
    if (cond.avg.gov === 'Khuấy trộn') W.push(['warn', 'Ở điều kiện trung bình khí khuấy trộn lớn hơn khí cấp O₂ – cân nhắc máy khuấy chìm riêng hoặc bể nông hơn.', 'At average conditions mixing air exceeds O₂ air – consider separate submersible mixers or a shallower basin.']);
    // lưu lượng toàn hệ (các bể sục đồng thời)
    const nA = t.nAerSim;
    const Qt = {}; for (const k in cond) Qt[k] = cond[k].Q * nA;
    // --- ống: chọn DN ở cực đại × hệ số dự phòng
    const P = S.pipe, Pf = ENG.patm(S.site.elev);
    const Bk = DBx.blower[S.blower.tech];
    const margin = S.blower.airMargin;
    const latLen = lay.Wl + 0.3, manLen = lay.Ll + 0.5, dropL = t.H + P.dropExtra;
    const segDefs = [
      { id: 'bl', name: 'Ống đẩy máy thổi (mỗi máy)', en: 'Blower discharge (each)', L: P.L_bl, K: P.K_bl, eps: 4.5e-5, dist: 1, vmax: P.v_bl, minDN: 50, mat: 'Inox 304' },
      { id: 'main', name: 'Ống góp chính', en: 'Main header', L: P.L_main, K: P.K_main, eps: 4.5e-5, dist: 1, vmax: P.v_main, minDN: 65, mat: 'Inox 304' },
      { id: 'br', name: 'Ống nhánh vào bể (mỗi bể)', en: 'Basin branch (each)', L: P.L_br, K: P.K_br, eps: 4.5e-5, dist: 1, vmax: P.v_br, minDN: 65, mat: 'Inox 304' },
      { id: 'drop', name: 'Ống đứng (dropleg)', en: 'Dropleg', L: dropL, K: 1.2, eps: 4.5e-5, dist: 1, vmax: P.v_drop, minDN: 65, mat: P.dropMat },
      { id: 'man', name: 'Ống phân phối chính (manifold)', en: 'Manifold', L: manLen / lay.nGrid, K: 0.5, eps: 1.5e-6, dist: 1 / 3, vmax: P.v_man, minDN: 100, mat: 'uPVC/Inox' },
      { id: 'lat', name: 'Ống nhánh mang đĩa (lateral)', en: 'Lateral', L: latLen / 2, K: 0.3, eps: 1.5e-6, dist: 1 / 3, vmax: P.v_lat, minDN: 100, mat: 'uPVC' }
    ];
    // nhiệt độ thiết kế cho chọn DN
    const site = S.site, B = S.blower;
    const p1 = Pf - B.dpInlet;
    const nGridTot = lay.nGrid;
    const flows = (Qtot, Qunit) => ({ bl: Qunit, main: Qtot, br: Qtot / nA, drop: Qtot / nA / nGridTot, man: Qtot / nA / nGridTot, lat: Qtot / nA / lay.nLat });
    // áp lực (lặp do mật độ phụ thuộc áp lực/nhiệt độ)
    const hyd = 1000 * g * (t.H - t.hDiff) / 1000 * S.water.rhoRel;    // kPa tại TWL
    const dwp = q => d.d0 + d.d1 * q;
    const staticPart = q => hyd + dwp(q) + G.gridLoss + P.dpValves;
    let dn = {};
    const designQt = Qt.pk * margin;
    // chọn số máy và công suất
    const T1d = site.Tair_max;
    const pressAt = (Qtot, Qunit, q, T2, dnMap) => {
      const fl = flows(Qtot, Qunit);
      let pg = staticPart(q) + P.dpFoul, segs = {};
      for (let it = 0; it < 3; it++) {
        const p2 = Pf + pg;
        let sum = 0;
        for (const s of segDefs) {
          const Ts = (s.id === 'man' || s.id === 'lat') ? S.site.Tw_sum : T2;
          segs[s.id] = ENG.segCalc(s, dnMap[s.id], fl[s.id], Ts, p2);
          sum += segs[s.id].dp;
        }
        pg = staticPart(q) + P.dpFoul + sum;
      }
      return { pg, segs, pipeSum: Object.values(segs).reduce((a, x) => a + x.dp, 0) };
    };
    // ước lượng ban đầu
    let pg0 = staticPart(cond.pk.q) + P.dpFoul + 6;
    let T2g = T1d + (T1d + 273.15) * (pow((Pf + pg0) / p1, KX) - 1) / Bk.isen;
    // số máy
    const nAuto = () => {
      let best = null;
      for (let n = 1; n <= 8; n++) {
        const Qu = designQt / n;
        let cap = Qu, model = null;
        if (S.blower.tech === 'turbo') { const ms = ENG.turboModels(Qu, pg0, T1d, p1); if (!ms.length) continue; model = ms[0]; cap = model.cap; }
        else if (Qu > Bk.qmaxU) continue;
        const okTd = Qt.min >= Bk.td * cap - 1e-6;
        const cand = { n, Qu, cap, model, okTd };
        if (okTd) return cand;
        if (!best) best = cand;
      }
      return best || { n: 8, Qu: designQt / 8, cap: designQt / 8, model: null, okTd: false };
    };
    let nDuty = (sel && B.nDuty > 0) ? B.nDuty : nAuto().n;
    const Qu = designQt / nDuty;
    // DN
    for (let it = 0; it < 2; it++) {
      const fl = flows(designQt, Qu), p2 = Pf + pg0;
      for (const s of segDefs) {
        const Ts = (s.id === 'man' || s.id === 'lat') ? S.site.Tw_sum : T2g;
        dn[s.id] = (sel && P.dnFix && P.dnFix[s.id] > 0) ? P.dnFix[s.id] : ENG.pickDN(s, fl[s.id], Ts, p2);
      }
      const pr = pressAt(designQt, Qu, cond.pk.q * margin, T2g, dn);
      pg0 = pr.pg; T2g = T1d + (T1d + 273.15) * (pow((Pf + pg0) / p1, KX) - 1) / Bk.isen;
    }
    const design = pressAt(designQt, Qu, cond.pk.q * margin, T2g, dn);
    const pgD = design.pg;
    // model
    let model = null, cap = Qu;
    if (S.blower.tech === 'turbo') {
      const ms = ENG.turboModels(Qu, pgD, T1d, p1);
      if (ms.length) { model = ms[0]; cap = model.cap; }
      else W.push(['err', `Không có model TurboLIGHT/TurboMAX đáp ứng ${Qu.toFixed(0)} Sm³/h @ ${pgD.toFixed(1)} kPa – tăng số máy chạy.`, `No TurboLIGHT/TurboMAX model meets ${Qu.toFixed(0)} Sm³/h @ ${pgD.toFixed(1)} kPa – increase number of duty units.`]);
    }
    if (pgD > Bk.pmax) W.push(['err', `Áp lực xả ${pgD.toFixed(1)} kPa vượt giới hạn công nghệ máy thổi (${Bk.pmax} kPa).`, `Discharge pressure ${pgD.toFixed(1)} kPa exceeds blower technology limit (${Bk.pmax} kPa).`]);
    if (S.blower.tech !== 'turbo' && Qu > Bk.qmaxU) W.push(['warn', `Lưu lượng mỗi máy ${Qu.toFixed(0)} Sm³/h lớn so với dải thông dụng của công nghệ này (${Bk.qmaxU}).`, `Flow per unit ${Qu.toFixed(0)} Sm³/h is large for this technology's usual range (${Bk.qmaxU}).`]);
    // công suất thiết kế (ngày nóng)
    const x1 = ENG.hum(T1d, site.RH, p1);
    const mdot = Q => Q * RHOS / 3600 * (1 + x1);
    const r2 = (Pf + pgD) / p1;
    const etaAt = (r, f) => {
      let e = Bk.eta * (1 + Bk.etaSlope * (r - 1.5));
      if (f != null) e *= (1 - Bk.kpl * pow(1 - min(1, f), 2));
      return e;
    };
    const padD = ENG.padKW(mdot(Qu), T1d, r2);
    const etaD = etaAt(r2, 1);
    const pElD = padD / etaD, shaft = pElD * Bk.drive;
    let motor = ENG.stdMotor(shaft * Bk.margin);
    if (model && model.kW < shaft) W.push(['warn', `Công suất trục ${shaft.toFixed(1)} kW vượt công suất danh định ${model.m} (${model.kW} kW).`, `Shaft power ${shaft.toFixed(1)} kW exceeds ${model.m} rating (${model.kW} kW).`]);
    if (model) motor = model.kW;
    const T2 = T1d + (T1d + 273.15) * (pow(r2, KX) - 1) / Bk.isen;
    // vận hành theo điều kiện (nhiệt độ khí vào trung bình năm)
    const T1o = site.Tair_avg, p1o = p1, x1o = ENG.hum(T1o, site.RH, p1o);
    const capO = cap;   // giả thiết công suất định mức
    const ops = {};
    let kWhY = 0;
    const hoursY = 365 * t.aerHours * t.nBasin / nA;
    for (const c of ENG.conds(S)) {
      const Qc = Qt[c.k];
      const nRun = min(nDuty, max(1, ceil(Qc / capO - 1e-9)));
      let f = Qc / (nRun * capO), waste = 0;
      if (f < Bk.td) { waste = (Bk.td - f) * nRun * capO; f = Bk.td; }
      const pr = pressAt(Qc, Qc / nRun, cond[c.k].q, T2, dn);
      const r = (Pf + pr.pg) / p1o;
      const qRun = f * capO;
      const pad = ENG.padKW(qRun * RHOS / 3600 * (1 + x1o), T1o, r);
      const eta = etaAt(r, f);
      const kW = nRun * pad / eta;
      const T2c = T1o + (T1o + 273.15) * (pow(r, KX) - 1) / Bk.isen;
      ops[c.k] = { Q: Qc, nRun, f, waste, pg: pr.pg, r, pad: pad * nRun, eta, kW, T2: T2c, pipeSum: pr.pipeSum, segs: pr.segs,
        kgO2kWh: S.load.mode !== 'sotr' && A[c.k] ? (A[c.k] / (t.nBasin * t.aerHours) * nA) / kW : null, SAE: cond[c.k].SOTR * nA / kW };
      if (waste > 1) W.push(['warn', `Điều kiện ${c.name}: 1 máy ở mức giảm tải tối thiểu ${(Bk.td * 100).toFixed(0)} % vẫn dư ${waste.toFixed(0)} Sm³/h – cần máy nhỏ hơn/thêm máy.`, `${c.en} conditions: one unit at minimum turndown ${(Bk.td * 100).toFixed(0)} % still has ${waste.toFixed(0)} Sm³/h surplus – use smaller/more units.`]);
      kWhY += kW * hoursY * c.w;
    }
    const wsum = S.op.wMin + S.op.wAvg + S.op.wPk; kWhY /= wsum;
    // nhiệt
    const heat = ENG.heat(S, { Qu, nDuty, T1: T1d, T2, p2: Pf + pgD, padD, pElD, dnMain: dn.main, x1, mdotU: mdot(Qu), dropMat: P.dropMat, Bk });
    if (heat.Tdrop > heat.matLim && /PVC/i.test(P.dropMat)) W.push(['err', `Nhiệt độ khí tại đầu ống đứng ≈ ${heat.Tdrop.toFixed(0)} °C vượt giới hạn ${P.dropMat} (${heat.matLim} °C) – dùng ống đứng inox hoặc kéo dài/làm mát ống góp.`, `Air temperature at dropleg ≈ ${heat.Tdrop.toFixed(0)} °C exceeds ${P.dropMat} limit (${heat.matLim} °C) – use stainless dropleg or lengthen/cool the header.`]);
    // kiểm tra vận tốc
    for (const s of segDefs) {
      const c = design.segs[s.id];
      if (c.v > c.vr[1] * 1.0001) W.push(['warn', `${s.name}: v = ${c.v.toFixed(1)} m/s > ${c.vr[1]} m/s (khuyến nghị M&E cho DN${c.dn}).`, `${s.en}: v = ${c.v.toFixed(1)} m/s > ${c.vr[1]} m/s (M&E recommendation for DN${c.dn}).`]);
    }
    const sae = cond.pk.SOTR * nA / ops.pk.kW;
    return {
      key: dk, d, kind, name: d.name, en: d.en, Af, V, sub, SR, N, atad, lay, cond, Qt, mixRate, design: { Qt: designQt, Qu, pg: pgD, segs: design.segs, pipeSum: design.pipeSum, hyd, dwp: dwp(cond.pk.q * margin), grid: G.gridLoss, valves: P.dpValves, foul: P.dpFoul, inlet: B.dpInlet },
      dn, segDefs, blower: { tech: S.blower.tech, Bk, nDuty, nStby: B.nStby, Qu, QuN: Qu * ENG.C.NM, cap, model, padD, etaD, pElD, shaft, motor, T1: T1d, T2, p1, p2: Pf + pgD, r2, Qin: Qu * (P0 / (p1 - site.RH / 100 * ENG.psat(T1d))) * ((T1d + 273.15) / 293.15), x1 },
      ops, hoursY, kWhY, heat, sae, W,
      kWinst: motor * nDuty, kWavg: ops.avg.kW
    };
  };

  // ---------- 6. Tính toán nhiệt ----------
  ENG.heat = (S, b) => {
    const H = S.heat, site = S.site;
    const row = ENG.dnRow(b.dnMain), Dm = row[1] / 1000;
    const mT = b.mdotU * b.nDuty;                                    // kg/s toàn hệ
    const Ta = site.Tair_max;
    const Tx = x => Ta + (b.T2 - Ta) * Math.exp(-H.U * Math.PI * Dm * x / (mT * CP * 1000));
    const Lrun = S.pipe.L_main + S.pipe.L_br;
    const Tdrop = Tx(Lrun);
    const Qair = mT * CP * (b.T2 - b.T1);                              // kW nhiệt vào dòng khí
    const loss = b.pElD * (1 - b.Bk.drive) * b.nDuty;                   // tổn thất động cơ/biến tần trong phòng
    const rad = H.radFrac * b.pElD * b.nDuty;
    const Dbl = ENG.dnRow(b.dnMain).length ? row[1] / 1000 : 0.2;
    const pipeRoom = H.Uroom * Math.PI * Dbl * H.Lroom * (b.T2 - H.Troom) / 1000;
    const Qroom = loss + rad + max(0, pipeRoom);
    const dTr = H.dTroom;
    const rhoA = ENG.patm(site.elev) * 1000 / (R * (Ta + 273.15));
    const vent = Qroom / (rhoA * CP * dTr) * 3600;                     // m³/h
    const Qinlet = b.Qu * b.nDuty * (P0 / ENG.patm(site.elev)) * ((Ta + 273.15) / 293.15);
    const dL = H.alphaSS * S.pipe.L_main * 1000 * (b.T2 - H.Tinst);    // mm
    const nJoint = max(0, ceil(dL / H.jointStroke));
    // nước ngưng khi khí nóng ẩm nguội tới nhiệt độ nước
    const xs = ENG.hum(S.site.Tw_win, 100, b.p2);
    const cond = max(0, (b.x1 - xs)) * (mT / (1 + b.x1)) * 3600;       // kg/h
    const matLim = /CPVC/i.test(b.dropMat) ? 82 : /PVC/i.test(b.dropMat) ? 60 : /HDPE|PP/i.test(b.dropMat) ? 50 : 400;
    const Tsurf = b.T2;
    return { Tdrop, Tx, Qair, loss, rad, pipeRoom, Qroom, vent, Qinlet, dL, nJoint, cond, condDay: cond * 24, matLim, Tsurf, Lrun, Dm };
  };

  // ---------- 7. Thiết bị cơ khí ----------
  ENG.runJet = (S, A) => {
    const t = S.tank, W = [], V = t.L * t.W * t.H, nA = t.nAerSim;
    const SR = ENG.sotrReq(S, 'jet', A), h = ENG.subm(S, 'jet').mean;
    const thrustReq = DBx.mech.jet.mix * V;
    let best = null;
    for (const m of DBx.jet) {
      const su = m.sotr4 * pow(h / 4, DBx.jetDepthExp);
      const n = ceil(SR.pk / su);
      const th = n * DBx.jetThrustPerKW * m.kW;
      const gap = max(0, thrustReq - th);
      const mixKW = gap > 0 ? ENG.mixerKW(gap) : 0;
      const kWinst = n * m.kW + mixKW;
      const score = kWinst * (1 + 0.04 * n);              // ưu tiên ít thiết bị
      const cand = { m, su, n, th, gap, mixKW, kWinst, score };
      if (!best || score < best.score - 1e-9) best = cand;
    }
    const b = best, ops = {}; let kWhY = 0;
    const hoursY = 365 * t.aerHours * t.nBasin / nA;
    for (const c of ENG.conds(S)) {
      const nRun = min(b.n, max(1, ceil(SR[c.k] / b.su - 1e-9)));
      const kW = (nRun * b.m.kW / S.mech.etaMot + b.mixKW / S.mech.etaMot) * nA;
      ops[c.k] = { nRun, kW, SAE: SR[c.k] * nA / kW, kgO2kWh: S.load.mode !== 'sotr' ? A[c.k] / (t.nBasin * t.aerHours) * nA / kW : null };
      kWhY += kW * hoursY * c.w;
    }
    kWhY /= (S.op.wMin + S.op.wAvg + S.op.wPk);
    if (h < 3) W.push(['warn', 'Độ ngập < 3 m: hiệu suất jet aerator thấp (handbook ch.6).', 'Submergence < 3 m: low jet aerator efficiency (handbook ch.6).']);
    if (b.gap > 0) W.push(['info', `Thiếu lực đẩy ${b.gap.toFixed(0)} N – bổ sung máy khuấy chìm ≈ ${b.mixKW.toFixed(1)} kW/bể (như ví dụ MiDS).`, `Thrust shortfall ${b.gap.toFixed(0)} N – add submersible mixer ≈ ${b.mixKW.toFixed(1)} kW/basin (as in MiDS example).`]);
    return { key: 'jet', kind: 'jet', name: DBx.mech.jet.name, en: DBx.mech.jet.en, SR, h, V, thrustReq, sel: b, ops, kWhY, hoursY, W,
      kWinst: (b.n * b.m.kW + b.mixKW) * nA, kWavg: ops.avg.kW, units: `${b.n} × ${b.m.m} (${b.m.kW} kW)` + (b.mixKW ? ` + khuấy ${b.mixKW.toFixed(1)} kW` : '') + ' /bể',
      unitsEn: `${b.n} × ${b.m.m} (${b.m.kW} kW)` + (b.mixKW ? ` + mixer ${b.mixKW.toFixed(1)} kW` : '') + ' /basin',
      sae: SR.pk * nA / ops.pk.kW };
  };
  ENG.mixerKW = gapN => { const k = gapN / 180; for (const s of [1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15]) if (s >= k) return s; return Math.ceil(k); };
  ENG.runMech = (S, A, key) => {
    const t = S.tank, W = [], M = DBx.mech[key], V = t.L * t.W * t.H, nA = t.nAerSim;
    const SR = ENG.sotrReq(S, key, A);
    const mixKW = M.mix * V / 1000;
    const nMin = (t.L / t.W > 1.6) ? 2 : 1;
    const saeOf = s => (key === 'asp' && s > M.effKW) ? M.saeLarge : M.sae;
    let best = null;
    for (const s of DBx.mechSizes) {
      if (s > M.maxKW) continue;
      if (S.mech.lagoon && s > 11) continue;
      const kwO2 = SR.pk / saeOf(s);
      const req = max(kwO2, mixKW);
      const n = max(nMin, ceil(req / s - 1e-9));
      const tot = n * s;
      const score = tot * (1 + 0.04 * n);
      if (!best || score < best.score - 1e-9) best = { s, n, tot, kwO2, req, sae: saeOf(s), score };
    }
    const b = best, ops = {}; let kWhY = 0;
    const hoursY = 365 * t.aerHours * t.nBasin / nA;
    for (const c of ENG.conds(S)) {
      const pReq = max(SR[c.k] / b.sae, mixKW);
      const kW = min(b.tot, pReq) * (S.mech.vfd ? 1 : 1) / S.mech.etaMot * nA;
      const kWc = S.mech.vfd ? kW : b.tot / S.mech.etaMot * nA * min(1, ceil(pReq / b.s - 1e-9) / b.n);
      ops[c.k] = { kW: kWc, SAE: SR[c.k] * nA / kWc, kgO2kWh: S.load.mode !== 'sotr' ? A[c.k] / (t.nBasin * t.aerHours) * nA / kWc : null };
      kWhY += kWc * hoursY * c.w;
    }
    kWhY /= (S.op.wMin + S.op.wAvg + S.op.wPk);
    if (mixKW > b.kwO2) W.push(['info', `Công suất do khuấy trộn chi phối (${mixKW.toFixed(1)} kW > ${b.kwO2.toFixed(1)} kW cho O₂).`, `Power governed by mixing (${mixKW.toFixed(1)} kW > ${b.kwO2.toFixed(1)} kW for O₂).`]);
    if (key === 'surf') W.push(['info', 'Máy sục khí bề mặt tạo sol khí và tiếng ồn – cân nhắc vị trí gần khu dân cư (handbook ch.8).', 'Surface aerators create aerosols and noise – consider proximity to residential areas (handbook ch.8).']);
    return { key, kind: key, name: M.name, en: M.en, SR, V, mixKW, sel: b, ops, kWhY, hoursY, W,
      kWinst: b.tot * nA, kWavg: ops.avg.kW, units: `${b.n} × ${b.s} kW /bể`, unitsEn: `${b.n} × ${b.s} kW /basin`, sae: SR.pk * nA / ops.pk.kW };
  };

  // ---------- 8. Tổng hợp ----------
  ENG.compute = S => {
    const W = [];
    const A = ENG.aor(S);
    const t = S.tank;
    if (t.nAerSim > t.nBasin) W.push(['err', 'Số bể sục khí đồng thời lớn hơn tổng số bể.', 'Simultaneously aerated basins exceed total basins.']);
    if (t.Hbwl > t.H) W.push(['err', 'Mực nước thấp (BWL) lớn hơn mực nước cao (TWL).', 'Bottom water level (BWL) is above top water level (TWL).']);
    if (t.hDiff >= t.Hbwl) W.push(['err', 'Cao độ đĩa ≥ mực nước thấp.', 'Diffuser elevation ≥ bottom water level.']);
    if (S.load.mode !== 'sotr' && !(A.avg > 0)) W.push(['err', 'Nhu cầu oxy AOR ≤ 0 – kiểm tra tải lượng.', 'Oxygen demand AOR ≤ 0 – check loads.']);
    const all = [];
    for (const dk of Object.keys(DBx.diff)) {
      try { all.push(ENG.runDiffused(S, dk, A, { selected: S.sel.tech === dk })); } catch (e) { all.push({ key: dk, name: DBx.diff[dk].name, en: DBx.diff[dk].en, err: String(e) }); }
    }
    all.push(ENG.runJet(S, A));
    all.push(ENG.runMech(S, A, 'asp'));
    all.push(ENG.runMech(S, A, 'surf'));
    const price = S.econ.price, ef = S.econ.co2;
    for (const r of all) {
      if (r.err) continue;
      r.cost = r.kWhY * price; r.co2 = r.kWhY * ef / 1000;
      r.feasible = !r.W.some(w => w[0] === 'err');
    }
    const ok = all.filter(r => !r.err && r.feasible);
    const best = ok.slice().sort((a, b) => a.kWhY - b.kWhY)[0];
    const sel = all.find(r => r.key === S.sel.tech) || best;
    return { A, all, best, sel, W: W.concat(sel ? sel.W : []), when: new Date() };
  };
})();
if (typeof module !== 'undefined') module.exports = ENG;
