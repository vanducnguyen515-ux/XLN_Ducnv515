'use strict';
/* ==========================================================================
   SimNước – Bộ giải sơ đồ: tuần tự theo mô-đun, lặp dòng xé (tear) cho vòng
   tuần hoàn; bộ điều khiển (ổn định: tìm nghiệm; theo thời gian: PI);
   mô phỏng giả động (bước thời gian, trạng thái đơn vị: lọc, màng, IX, bể chứa).
   ========================================================================== */
const WSIM = {};

WSIM.compile = function (P) {
  const errors = [], warns = [];
  const units = P.units.filter(u => WU[u.type]);
  const byId = {}; units.forEach(u => (byId[u.id] = u));
  const links = P.links.filter(l => byId[l.from[0]] && byId[l.to[0]]);
  const inL = {}, outL = {};
  for (const u of units) { inL[u.id] = {}; outL[u.id] = {}; WU[u.type].ins.forEach(p => (inL[u.id][p] = [])); }
  for (const l of links) {
    if (!inL[l.to[0]][l.to[1]]) { errors.push(`Cửa vào "${l.to[1]}" của ${byId[l.to[0]].name} không tồn tại`); continue; }
    inL[l.to[0]][l.to[1]].push(l);
    outL[l.from[0]][l.from[1]] = l;
  }
  for (const u of units) {
    const d = WU[u.type];
    if (u.type === 'mixer') { if (!Object.values(inL[u.id]).some(a => a.length)) errors.push(`${u.name}: chưa có dòng vào`); }
    else for (const p of d.ins) if (!inL[u.id][p].length) errors.push(`${u.name}: cửa vào chưa nối`);
    for (const p of d.outs) if (!outL[u.id][p]) warns.push(`${u.name}: cửa ra "${WRES_LBL[p] || p}" chưa nối (dòng bị bỏ qua)`);
  }
  if (!units.some(u => WU[u.type].ins.length === 0)) errors.push('Sơ đồ chưa có nguồn nước');
  // thứ tự tính & dòng xé
  const done = new Set(), known = new Set(), order = [], tears = [];
  const remaining = units.slice();
  while (remaining.length) {
    let idx = remaining.findIndex(u => Object.values(inL[u.id]).every(a => a.every(l => known.has(l.id))));
    if (idx < 0) {
      // chọn đơn vị có ít dòng vào chưa biết nhất, ưu tiên đơn vị có ít nhất một dòng vào đã biết
      let best = -1, bs = Infinity;
      remaining.forEach((u, i) => {
        const all = Object.values(inL[u.id]).flat(), unk = all.filter(l => !known.has(l.id)).length, kn = all.length - unk;
        const sc = unk - (kn > 0 ? 0.5 : 0);
        if (sc < bs) { bs = sc; best = i; }
      });
      idx = best;
      const u = remaining[idx];
      Object.values(inL[u.id]).flat().filter(l => !known.has(l.id)).forEach(l => { tears.push(l.id); known.add(l.id); });
    }
    const u = remaining.splice(idx, 1)[0];
    order.push(u); done.add(u.id);
    Object.values(outL[u.id]).forEach(l => known.add(l.id));
  }
  return { P, units, byId, links, inL, outL, order, tears, errors, warns };
};

const W_ZERO = T => WQ.make({ Q: 0, T: T || 20 });

/* một lượt giải toàn sơ đồ (đã có thông số) */
WSIM.solve = function (sys, opt = {}) {
  const S = {}, info = {}, nstate = {}, warns = [];
  const mode = opt.mode || 'steady';
  for (const id of sys.tears) S[id] = opt.prevS && opt.prevS[id] ? WQ.copy(opt.prevS[id]) : W_ZERO();
  const keyF = ['Q', 'Ca', 'Na', 'Cl', 'TIC', 'DOC', 'SSi', 'FeOH3', 'AlOH3', 'Cl2f', 'NH4', 'NH2Cl'];
  let it = 0, conv = !sys.tears.length, maxIt = opt.maxIt || 300;
  for (it = 0; it < maxIt; it++) {
    const old = {}; for (const id of sys.tears) old[id] = S[id];
    warns.length = 0;
    for (const u of sys.order) {
      const d = WU[u.type], inp = {};
      let qin = 0;
      for (const p of d.ins) { const ls = sys.inL[u.id][p]; inp[p] = ls.length ? WQ.mix(ls.map(l => S[l.id] || W_ZERO())) : W_ZERO(); qin += inp[p].Q; }
      const ctx = { mode, t: opt.t || 0, dt: opt.dt || 0, st: opt.state ? opt.state[u.id] : undefined, ns: undefined, warn: m => warns.push(m) };
      let res;
      if (d.ins.length && !(qin > 1e-9)) res = { o: {}, info: { Q: 0, idle: true } };
      else {
        try { res = d.calc(u, inp, ctx); }
        catch (e) { warns.push(`${u.name}: lỗi tính toán – ${e.message}`); res = { o: {}, info: { err: e.message } }; }
      }
      info[u.id] = res.info || {};
      info[u.id]._in = d.ins.length ? (d.ins.length === 1 ? inp[d.ins[0]] : WQ.mix(Object.values(inp))) : null;
      for (const p of d.outs) { const l = sys.outL[u.id][p]; if (l) { const w = res.o[p] || W_ZERO(inp.in ? inp.in.T : 20); S[l.id] = w; } }
      if (ctx.ns !== undefined) nstate[u.id] = ctx.ns;
    }
    if (!sys.tears.length) { conv = true; break; }
    let err = 0;
    for (const id of sys.tears) {
      const a = old[id], b = S[id];
      for (const k of keyF) { const sc = Math.abs(b[k]) + Math.abs(a[k]) + (k === 'Q' ? 1 : 1e-3); err = Math.max(err, Math.abs(b[k] - a[k]) / sc); }
    }
    if (err < 1e-7 && it > 0) { conv = true; break; }
  }
  if (!conv) warns.push('Vòng tuần hoàn chưa hội tụ sau ' + maxIt + ' lượt');
  return { S, info, nstate, warns: [...new Set(warns)], iters: it + 1, conv };
};

/* đo một biến: link (id) hoặc đầu vào đơn vị (U:id) */
WSIM.measure = function (sys, r, ref, v) {
  let w = null;
  if (ref.startsWith('U:')) { const i = r.info[ref.slice(2)]; if (!i) return NaN; if (i[v] !== undefined && typeof i[v] === 'number') return i[v]; w = i._in; }
  else w = r.S[ref];
  if (!w) return NaN;
  return WQ.value(w, v);
};

/* trạng thái ổn định với bộ điều khiển (tìm nghiệm lần lượt, Gauss–Seidel) */
WSIM.steady = function (P, opt = {}) {
  const sys = WSIM.compile(P);
  if (sys.errors.length) return { sys, errors: sys.errors };
  const ctrls = (P.ctrls || []).filter(c => c.on !== false && sys.byId[c.unit] && (c.ref));
  let r = WSIM.solve(sys, { prevS: opt.prevS });
  const log = [];
  for (let round = 0; round < (ctrls.length > 1 ? 6 : 1) && ctrls.length; round++) {
    let maxRel = 0;
    for (const c of ctrls) {
      const u = sys.byId[c.unit], sp = +c.sp, lo = +c.lo, hi = +c.hi;
      const f = x => { u.p[c.param] = x; r = WSIM.solve(sys, { prevS: r.S }); return WSIM.measure(sys, r, c.ref, c.v) - sp; };
      const x0 = +u.p[c.param];
      let flo = f(lo), fhi = f(hi), x;
      if (!isFinite(flo) || !isFinite(fhi)) { log.push(`${c.name || c.id}: không đo được biến`); f(x0); continue; }
      if (flo * fhi > 0) { x = Math.abs(flo) < Math.abs(fhi) ? lo : hi; log.push(`${c.name || c.id}: không đạt giá trị đặt trong khoảng [${lo}, ${hi}] → ${x}`); }
      else {
        let a = lo, b = hi, fa = flo, fb = fhi;
        for (let k = 0; k < 50; k++) {
          let m = b - fb * (b - a) / (fb - fa);                     // regula falsi (Illinois)
          if (!(m > Math.min(a, b) && m < Math.max(a, b))) m = 0.5 * (a + b);
          const fm = f(m);
          if (Math.abs(fm) < 1e-6 * Math.max(Math.abs(sp), 1e-3) || Math.abs(b - a) < 1e-9 * Math.max(Math.abs(hi), 1)) { a = b = m; fa = fb = fm; break; }
          if (fm * fb < 0) { a = b; fa = fb; } else fa *= 0.5;
          b = m; fb = fm;
        }
        x = 0.5 * (a + b);
      }
      maxRel = Math.max(maxRel, Math.abs(x - x0) / Math.max(Math.abs(x0), 1e-6));
      f(x); c.out = x;
    }
    if (maxRel < 1e-4) break;
  }
  r.sys = sys; r.log = log; r.ctrls = ctrls.map(c => ({ id: c.id, name: c.name, x: +sys.byId[c.unit].p[c.param], meas: WSIM.measure(sys, r, c.ref, c.v), sp: +c.sp }));
  return r;
};

/* mô phỏng theo thời gian (giả động) */
WSIM.dynamic = async function (P, opt) {
  const sys = WSIM.compile(P);
  if (sys.errors.length) return { sys, errors: sys.errors };
  const hours = +opt.hours, dt = +opt.dt;
  const ctrls = (P.ctrls || []).filter(c => c.on !== false && sys.byId[c.unit] && c.ref);
  const backup = {}; ctrls.forEach(c => (backup[c.id] = sys.byId[c.unit].p[c.param]));
  const ev = (P.events || []).filter(e => sys.byId[e.unit]).sort((a, b) => a.t - b.t);
  const evBackup = ev.map(e => [e, sys.byId[e.unit].p[e.param]]);
  let state = {}, prevS = null, ie = {};
  const snaps = [];
  // khởi tạo bằng trạng thái ổn định
  const r0 = WSIM.steady(P, {}); prevS = r0.S;
  for (let k = 0, t = 0; t <= hours + 1e-9; k++, t = k * dt) {
    for (const e of ev) if (e.t <= t && !e._done) { sys.byId[e.unit].p[e.param] = e.value; e._done = true; }
    // điều khiển PI theo đo của bước trước
    if (snaps.length) for (const c of ctrls) {
      const u = sys.byId[c.unit], last = snaps[snaps.length - 1];
      const m = WSIM.measure(sys, last.r, c.ref, c.v), e = (+c.sp - m) * (c.dir === 'rev' ? -1 : 1);
      if (!isFinite(m)) continue;
      ie[c.id] = (ie[c.id] || 0) + e * dt;
      const base = c.out !== undefined ? c.out : +backup[c.id];
      const xr = base + (+c.kp || 0) * (e + ie[c.id] / Math.max(+c.ti || 1, 1e-6));
      const x = Math.min(Math.max(xr, +c.lo), +c.hi);
      // chống bão hòa tích phân (tích phân có điều kiện): chỉ dừng tích phân khi sai lệch đẩy sâu thêm vào giới hạn –
      // cách cũ (luôn bỏ khi chạm giới hạn) làm tích phân trôi một chiều khi tín hiệu dao động giữa hai giới hạn
      if ((xr > +c.hi && e > 0) || (xr < +c.lo && e < 0)) ie[c.id] -= e * dt;
      u.p[c.param] = x;
    }
    const r = WSIM.solve(sys, { mode: 'dyn', t, dt, state, prevS });
    Object.assign(state, r.nstate);
    prevS = r.S;
    snaps.push({ t, r: { S: r.S, info: stripInfo(r.info), warns: r.warns }, cv: ctrls.map(c => +sys.byId[c.unit].p[c.param]) });
    if (opt.onProgress && k % 20 === 0) { opt.onProgress(t / hours); await new Promise(res => setTimeout(res, 0)); }
    if (opt.abort && opt.abort()) break;
  }
  // khôi phục thông số
  ctrls.forEach(c => (sys.byId[c.unit].p[c.param] = backup[c.id]));
  evBackup.forEach(([e, v]) => { sys.byId[e.unit].p[e.param] = v; delete e._done; });
  return { sys, snaps, ctrls };
};
function stripInfo(info) {
  const o = {};
  for (const id in info) { const s = {}; for (const k in info[id]) { const v = info[id][k]; if (typeof v === 'number' || k === '_in') s[k] = v; } o[id] = s; }
  return o;
}

/* tổng hợp toàn trạm */
WSIM.summary = function (sys, r) {
  const S = { kW: 0, chem: [], cost: 0, prod: [], waste: [], Qin: 0, Qprod: 0, Qwaste: 0, energyBy: [] };
  for (const u of sys.units) {
    const i = r.info[u.id] || {};
    if (i.kW > 0) { S.kW += i.kW; S.energyBy.push([u.name, i.kW]); }
    if (u.type === 'dose' && i.kgd > 0) { S.chem.push({ name: i.chem, unit: u.name, dose: i.dose, kgd: i.kgd, kgProd: i.kgProd, cost: i.cost }); S.cost += i.cost || 0; }
    if (u.type === 'soften' && i.limeKg > 0) S.chem.push({ name: 'Vôi Ca(OH)₂ (làm mềm)', unit: u.name, dose: i.lime, kgd: i.limeKg, kgProd: i.limeKg, cost: 0 });
    if (u.type === 'ix' && i.regenKgd > 0) S.chem.push({ name: 'Hóa chất tái sinh ' + i.regen, unit: u.name, dose: NaN, kgd: i.regenKgd, kgProd: i.regenKgd, cost: 0 });
    if (u.type === 'ozone' && i.kgO3 > 0) S.chem.push({ name: 'Ozone (sản xuất)', unit: u.name, dose: +u.p.dose, kgd: i.kgO3, kgProd: i.kgO3, cost: 0 });
    if (u.type === 'gac' && i.kgd > 0) S.chem.push({ name: 'Than GAC tiêu hao (CUR)', unit: u.name, dose: i.CUR, kgd: i.kgd, kgProd: i.kgd, cost: 0 });
    if (u.type === 'remin' && i.kgd > 0) S.chem.push({ name: 'Calcit hòa tan', unit: u.name, dose: i.CaCO3, kgd: i.kgd, kgProd: i.kgd, cost: 0 });
    if (WU[u.type].ins.length === 0) S.Qin += (i.Q || 0);
    if (u.type === 'product' && i._in) { S.prod.push({ u, w: i._in }); S.Qprod += i._in.Q; }
    if (u.type === 'waste' && i._in) { S.waste.push({ u, w: i._in }); S.Qwaste += i._in.Q; }
  }
  S.rec = S.Qin > 0 ? S.Qprod / S.Qin * 100 : NaN;
  S.kWh = S.Qprod > 0 ? S.kW * 24 / S.Qprod : NaN;
  return S;
};

/* đánh giá tuân thủ tiêu chuẩn */
WSIM.compliance = function (w, stdKey) {
  const std = WSTD[stdKey] || WSTD.none, s = WQ.solve(w), rows = [];
  for (const k in std.lim) {
    const lim = std.lim[k];
    let v = WQ.value(w, k, s);
    if (k === 'Ecoli' || k === 'Crypto' || k === 'Virus' || k === 'Giardia') {
      const ok = w[k] <= (typeof lim === 'number' ? lim : 0) + 1e-9 || w[k] <= -2;
      rows.push({ k, v: w[k], lim: '< 1 (log ≤ 0)', ok, mic: true }); continue;
    }
    let ok;
    if (Array.isArray(lim)) ok = v >= lim[0] - 1e-9 && v <= lim[1] + 1e-9; else ok = v <= lim + 1e-12;
    rows.push({ k, v, lim: Array.isArray(lim) ? fmt(lim[0]) + ' – ' + fmt(lim[1]) : fmt(lim), ok });
  }
  return rows;
};
