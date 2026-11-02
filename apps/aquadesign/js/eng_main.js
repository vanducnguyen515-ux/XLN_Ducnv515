/* AquaDesign VN – điều phối tính toán toàn trạm & trạng thái các bước (kiểu "Main Form") */
'use strict';

// định nghĩa các bước theo dây chuyền
ENG.STEPS = {
  CAS: [
    { id: 'load', name: 'Tải lượng', dep: [] },
    { id: 'sst', name: 'Bể lắng II', dep: ['load'] },
    { id: 'bio', name: 'Thông số bùn hoạt tính', dep: ['sst'] },
    { id: 'at', name: 'Bể aerotank', dep: ['bio'] },
    { id: 'aer', name: 'Sục khí', dep: ['at'] },
    { id: 'rs', name: 'Bùn tuần hoàn', dep: ['aer'] },
  ],
  SBR: [
    { id: 'load', name: 'Tải lượng', dep: [] },
    { id: 'sbr', name: 'Thông số & thể tích SBR', dep: ['load'] },
    { id: 'aer', name: 'Sục khí', dep: ['sbr'] },
    { id: 'rs', name: 'Bùn dư', dep: ['aer'] },
  ],
  ICEAS: [
    { id: 'load', name: 'Tải lượng', dep: [] },
    { id: 'iceas', name: 'ICEAS – chu trình & thể tích', dep: ['load'] },
    { id: 'aer', name: 'Sục khí', dep: ['iceas'] },
    { id: 'rs', name: 'Bùn dư', dep: ['aer'] },
  ],
  CTECH: [
    { id: 'load', name: 'Tải lượng', dep: [] },
    { id: 'ctech', name: 'C-Tech – chu kỳ, bể & selector', dep: ['load'] },
    { id: 'aer', name: 'Sục khí', dep: ['ctech'] },
    { id: 'rs', name: 'Bùn tuần hoàn & bùn dư', dep: ['aer'] },
  ],
  MBR: [
    { id: 'load', name: 'Tải lượng', dep: [] },
    { id: 'mbr', name: 'Sinh học & module màng', dep: ['load'] },
    { id: 'at', name: 'Bể aerotank', dep: ['mbr'] },
    { id: 'aer', name: 'Sục khí', dep: ['at'] },
    { id: 'rs', name: 'Tuần hoàn & bùn dư', dep: ['aer'] },
  ],
};

ENG.LINE_NAME = S => ({ CAS: 'Bùn hoạt tính liên tục', SBR: 'SBR', MBR: S.mbr.vendor === 'kubota' ? 'MBR Kubota' : 'MBR', ICEAS: 'ICEAS (Xylem/Sanitaire)', CTECH: 'C-Tech (SFC)' }[S.opt.line]);

ENG.compute1 = function (S) {
  const R = { errors: [] };
  const line = S.opt.line;
  const safe = (k, f) => { try { R[k] = f(); } catch (e) { R.errors.push(k + ': ' + e.message); console.error(e); R[k] = null; } };
  safe('load', () => ENG.load(S));
  if (!R.load) return R;
  if (line === 'CAS') {
    // ghép công trình hiện hữu (Handbook 15.2.1): bể lắng mới cho Q_M − Q_mz; aerotank mới cho phần tải BOD₅ còn lại
    const ex = S.exist || {}, L0 = R.load;
    let RLs = L0, RLb = L0;
    if (ex.sstOn && ex.Qmz > 0) { RLs = Object.assign({}, L0, { Qm: Math.max(0.1 * L0.Qm, L0.Qm - ex.Qmz), Qth: L0.Qth * Math.max(0.1, 1 - ex.Qmz / L0.Qm) }); }
    if (ex.atOn && ex.BOD > 0) {
      const f = U.clamp(1 - ex.BOD / L0.bio.BOD, 0.05, 1);
      RLb = U.clone(L0); RLb.d = L0.d;
      for (const k of ['Qd', 'Qsd', 'Qfd', 'Qth', 'Qm', 'Qavg', 'QtaM']) if (typeof RLb[k] === 'number') RLb[k] *= f;
      for (const o of [RLb.bio, RLb.raw, RLb.sup]) if (o) for (const k in o) if (typeof o[k] === 'number') o[k] *= f;
      R.existF = f;
    }
    safe('sst', () => ENG.sst(S, RLs));
    if (R.sst && RLs !== L0) { R.sst.d.info('Có bể lắng II hiện hữu: bể mới thiết kế cho Q_M − Q_mz = ' + U.fmt(L0.Qm) + ' − ' + U.fmt(ex.Qmz) + ' = ' + U.fmt(RLs.Qm) + ' m³/h.'); R.sst.Qexist = ex.Qmz; }
    if (R.sst) {
      const TS = S.bio.TS > 0 ? S.bio.TS : R.sst.TSmax;
      safe('bio', () => ENG.bio(S, RLb, { TS, TSmax: R.sst.TSmax }));
      if (R.bio && R.existF) R.bio.d.info('Có aerotank hiện hữu xử lý ' + U.fmt(ex.BOD) + ' kg BOD₅/d: bể mới thiết kế cho ' + U.fmt(R.existF * 100, 0) + ' % tải (lưu lượng & tải lượng tỷ lệ). Sục khí, bùn tuần hoàn tính cho phần mới.');
    }
    if (R.bio) safe('tank', () => ENG.tank(S, R.bio, R.sst));
    if (R.tank) {
      const t = R.tank;
      const geo = { V: t.V, H: t.H, n: t.n, Aw: t.Aw, tSS: t.tSS, type: t.type, L: t.L, B: t.B, D: t.D, r: R.bio.r };
      safe('aer', () => ENG.aer(S, R.bio, geo));
    }
    if (R.aer) safe('rs', () => ENG.rs(S, RLs !== L0 ? RLs : RLb, R.sst, R.bio, R.tank));
  } else if (line === 'SBR') {
    safe('sbr', () => ENG.sbr(S, R.load));
    if (R.sbr) {
      R.bio = R.sbr.B;
      const s = R.sbr;
      const geo = { V: s.Vreal, H: S.sbr.H, n: S.sbr.n, Aw: s.Aw, tSS: s.tSS, type: S.sbr.shape === 'circ' ? 'circ' : 'rect', L: s.L, B: s.Bw, D: s.D, r: s.B.r };
      safe('aer', () => ENG.aer(S, R.bio, geo, { tAer: s.tAerDay, SBRf: S.sbr.fOx }));
    }
    if (R.aer) safe('rs', () => ENG.rs(S, R.load, null, R.bio, { n: S.sbr.n }, null));
  } else if (line === 'ICEAS') {
    safe('iceas', () => ENG.iceas(S, R.load));
    if (R.iceas) {
      const c = R.iceas; R.bio = c.B;
      const geo = { V: c.W * c.L * c.TWL * c.nb, H: c.TWL, n: c.nb, Aw: c.W * c.L, tSS: c.MCRT, type: 'rect', L: c.L, B: c.W, r: 0 };
      safe('aer', () => ENG.aer(S, R.bio, geo, { tAer: c.ci.TA, noMix: c.cycle === 'NIT', nBlow: c.nb }));
    }
    if (R.aer) safe('rs', () => ENG.rs(S, R.load, null, R.bio, { n: R.iceas.nb, TSwas: S.ic.SFws * 1000 }, null));
  } else if (line === 'CTECH') {
    safe('ctech', () => ENG.ctech(S, R.load));
    if (R.ctech) {
      const c = R.ctech; R.bio = c.B;
      const geo = { V: c.V, H: c.TWL, n: c.N, Aw: c.A1, tSS: c.tSS, type: 'rect', L: c.L, B: c.Bw, r: 0 };
      // toàn trạm: luôn có n_cấp bể sục khí → nhu cầu O₂ trải đều 24 h; đĩa mỗi bể theo lưu lượng một bể đang sục
      safe('aer', () => ENG.aer(S, R.bio, geo, { tAer: 24, nAer: c.nF, noMix: true, nBlow: Math.round(c.nF) * S.ct.nBl }));
    }
    if (R.aer) safe('rs', () => ENG.rs(S, R.load, null, R.bio, { n: R.ctech.N, TSwas: S.ct.Cs * 1000 }, { Q: R.ctech.QR * R.ctech.N, n: Math.round(R.ctech.N), note: '1 bơm/bể × ' + U.fmt(R.ctech.QR) + ' m³/h (R = ' + S.ct.R + '·Q_b); chạy trong pha F/A, đồng thời ' + U.fmt(R.ctech.QRtot) + ' m³/h' }));
  } else {
    safe('mbr', () => ENG.mbr(S, R.load));
    if (R.mbr) {
      R.bio = R.mbr.B;
      const Bm = Object.assign({}, R.bio, { V: R.mbr.Vbio, Vextra: R.bio.V - R.mbr.Vbio > 0 ? R.bio.V - R.mbr.Vbio : 0 });
      safe('tank', () => ENG.tank(S, Bm, null));
    }
    if (R.tank) {
      const t = R.tank;
      const geo = { V: t.V, H: t.H, n: t.n, Aw: t.Aw, tSS: t.tSS, type: t.type, L: t.L, B: t.B, D: t.D, r: R.bio.r };
      safe('aer', () => ENG.aer(S, R.bio, geo, { O2credit: R.mbr && S.mbr.creditCF && S.mbr.vendor !== 'kubota' ? R.mbr.O2cf : 0 }));
      if (R.aer && R.mbr && !S.mbr.creditCF) R.aer.d.info('MBR: khí rửa màng cung cấp thêm ≈ ' + U.fmt(R.mbr.O2cf) + ' kg O₂/h (chưa trừ – chọn "trừ ôxy khí rửa" trong form MBR).');
    }
    if (R.aer) safe('rs', () => ENG.rs(S, R.load, null, R.bio, R.tank));
  }
  if (S.grit.on) safe('grit', () => ENG.grit(S, R.load));
  if (S.opt.standard === 'MSIG' && R.bio) safe('msig', () => ENG.msig(S, R));
  if (S.hsg && S.hsg.on && R.bio && ENG.hsg) safe('hsg', () => ENG.hsg(S, R.load, R.bio));
  if (R.bio) safe('sludge', () => ENG.sludge(S, R.load, R.bio, R.sst));
  if (R.aer) safe('o2', () => ENG.o2eff(S, R));
  safe('pipes', () => ENG.pipes(S, R));
  if (R.bio) safe('cost', () => ENG.cost(S, R));
  safe('mach', () => ENG.machines(S, R));
  // khối lượng
  R.masses = [];
  try {
    if (R.tank) {
      const t = R.tank, k = t.type === 'ditch' ? 'ditch' : t.type;
      const shp = k === 'ditch' ? { kind: 'rect', B: t.W, L: t.L } : k === 'rect' ? { kind: 'rect', B: t.B, L: t.L } : { kind: k, D: t.D, Di: t.Di };
      R.masses.push(ENG.mass(S, Object.assign(shp, { name: 'Bể aerotank', H: t.H, n: t.n })));
    }
    if (R.sst && R.sst.D && S.at.type !== 'ring') R.masses.push(ENG.mass(S, { name: 'Bể lắng II', kind: 'circ', D: R.sst.D, H: R.sst.hop ? R.sst.Hcyl + R.sst.Hc / 2 : R.sst.H, n: R.sst.n, tw: S.build.tWallST }));
    if (R.sst && R.sst.B) R.masses.push(ENG.mass(S, { name: 'Bể lắng II', kind: 'rect', B: R.sst.B, L: R.sst.L, H: R.sst.H, n: R.sst.n, tw: S.build.tWallST }));
    if (R.iceas) R.masses.push(ENG.mass(S, { name: 'Bể ICEAS', kind: 'rect', B: R.iceas.W, L: R.iceas.L, H: R.iceas.TWL, n: R.iceas.nb }));
    if (R.ctech) R.masses.push(ENG.mass(S, { name: 'Bể C-Tech', kind: 'rect', B: R.ctech.Bw, L: R.ctech.L, H: R.ctech.TWL, n: R.ctech.N }));
    if (R.sbr) R.masses.push(ENG.mass(S, S.sbr.shape === 'circ' ? { name: 'Bể SBR', kind: 'circ', D: R.sbr.D, H: S.sbr.H, n: S.sbr.n } : { name: 'Bể SBR', kind: 'rect', B: R.sbr.Bw, L: R.sbr.L, H: S.sbr.H, n: S.sbr.n }));
  } catch (e) { R.errors.push('mass: ' + e.message); }
  return R;
};

/* ghép nước tách bùn với kết quả xử lý bùn (Handbook 11 / 15.4.4): lặp tải → sinh học → bùn → nước tách đến khi hội tụ */
ENG.compute = function (S) {
  if (!(S.load && S.load.sup && S.load.sup.on && S.load.sup.mode === 'sludge')) { delete S.__sup; return ENG.compute1(S); }
  delete S.__sup;
  let R = ENG.compute1(S), it = 0;
  for (; it < 8 && R.sludge; it++) {
    const q1 = R.sludge.supT || 0, q2 = R.sludge.supD || 0, p = S.__sup;
    if (p && Math.abs(q1 - p.q1) + Math.abs(q2 - p.q2) < 0.01 * Math.max(1, q1 + q2)) break;
    S.__sup = { q1, q2, it: it + 1 };
    R = ENG.compute1(S);
  }
  R.supIter = it;
  delete S.__sup;
  return R;
};

// trạng thái bước: 'grey' (chưa sẵn), 'white' (có thể làm), 'green' (đã xác nhận)
ENG.stepState = function (S, R) {
  const st = {};
  for (const s of ENG.STEPS[S.opt.line]) {
    const depsOk = s.dep.every(dp => st[dp] === 'green');
    st[s.id] = !depsOk ? 'grey' : (S.done[s.id] ? 'green' : 'white');
  }
  return st;
};

// khi sửa một bước, các bước phía sau phải xác nhận lại
ENG.invalidateAfter = function (S, id) {
  const steps = ENG.STEPS[S.opt.line];
  const i = steps.findIndex(s => s.id === id);
  if (i < 0) return;
  for (let j = i + 1; j < steps.length; j++) delete S.done[steps[j].id];
};

ENG.complete = (S) => ENG.STEPS[S.opt.line].every(s => S.done[s.id]);

// tóm tắt các chỉ tiêu chính (Short print / so sánh phương án)
ENG.summary = function (S, R) {
  const o = [];
  const L = R.load;
  const P = (k, v, u) => o.push([k, v, u]);
  if (!L) return o;
  P('Dây chuyền', ENG.LINE_NAME(S), '');
  P('Quy trình', ENG.PROC_NAME[S.opt.process] + (S.opt.process === 'ND' ? ' (' + ENG.DN_NAME[S.opt.dn] + ')' : ''), '');
  P('Dân số tương đương', S.load.mode === 'spec' ? S.load.PE : '–', 'PE');
  P('Lưu lượng ngày', L.Qd, 'm³/d');
  P('Lưu lượng thiết kế Q_M', L.Qm, 'm³/h');
  P('Tải lượng COD vào sinh học', L.bio.COD, 'kg/d');
  const B = R.bio;
  if (B) {
    P('Tuổi bùn thiết kế', B.tSS, 'd');
    P('V_D/V_BB', S.opt.process === 'ND' ? B.r : 0, '–');
    P('TS bể sinh học', B.TS, 'kg/m³');
    P('Bùn dư', B.US, 'kg TS/d');
  }
  if (R.tank) { P('Thể tích bể aerotank', R.tank.V, 'm³'); P('Tuổi bùn thực', R.tank.tSS, 'd'); }
  if (R.sbr) { P('Thể tích SBR', R.sbr.Vreal, 'm³'); P('Tỷ lệ trao đổi f_A', R.sbr.fA, '–'); }
  if (R.iceas) { P('ICEAS', R.iceas.nb + ' bể ' + U.fmt(R.iceas.W) + ' × ' + U.fmt(R.iceas.L) + ' m, TWL ' + U.fmt(R.iceas.TWL), ''); P('Chu trình', R.iceas.cycle, ''); P('SRT thiết kế', R.iceas.SRT, 'd'); P('MLSS tại BWL', R.iceas.MLSSb, 'mg/l'); P('Thể tích ICEAS', R.iceas.W * R.iceas.L * R.iceas.TWL * R.iceas.nb, 'm³'); P('Decanter', R.iceas.DL, 'm/bể'); }
  if (R.ctech) { P('C-Tech', R.ctech.N + ' bể ' + U.fmt(R.ctech.L) + ' × ' + U.fmt(R.ctech.Bw) + ' m, TWL ' + U.fmt(R.ctech.TWL), ''); P('Thể tích C-Tech', R.ctech.V, 'm³'); P('Tuổi bùn (A 131)', R.ctech.tSS, 'd'); P('MLSS tại TWL', R.ctech.MLSS, 'mg/l'); }
  if (R.mbr && R.mbr.kub) P('Kubota', R.mbr.nFE + ' × ' + R.mbr.mod.name.split(' (')[0], '');
  if (R.mbr) { P('Diện tích màng', R.mbr.Areal, 'm²'); P('Thông lượng TB năm', R.mbr.fluxAvg, 'l/(m²·h)'); }
  if (R.sst) { P('Bể lắng II', R.sst.n + ' × ' + (R.sst.D ? 'D ' + U.fmt(R.sst.D) : U.fmt(R.sst.B) + '×' + U.fmt(R.sst.L)) + ' m', ''); P('Diện tích lắng', R.sst.Atot, 'm²'); P('q_SV', R.sst.qSV, 'l/(m²·h)'); }
  if (R.aer) { P('SOTR', R.aer.SOTR, 'kg O₂/h'); if (R.aer.QL) P('Lưu lượng khí', R.aer.QL, 'Nm³/h'); }
  if (R.cost) { P('Điện năng', R.cost.kWha, 'kWh/năm'); P('Chi phí vận hành', R.cost.total, S.cost.currency + '/năm'); P('Chi phí riêng', R.cost.total / (S.load.PE || L.Qd / 0.15), S.cost.currency + '/(PE·năm)'); }
  if (R.masses && R.masses.length) P('Bê tông (bể chính)', R.masses.reduce((s, m) => s + m.conc, 0), 'm³');
  return o;
};
