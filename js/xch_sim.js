'use strict';
/* ==========================================================================
   SimXLNT ⇄ hồ sơ trao đổi (js/xch.js)
   Gửi: sơ đồ hiện tại + kết quả ổn định → thông số thiết kế trung lập (thể tích, SRT, MLSS, DO, R, IR,
        chu kỳ, động học) + kết quả mô phỏng (chất lượng nước ra, bùn dư, O₂, khí, điện).
   Nhận: – có bản tính Excel (từ Thiết kế XLNT) → đúng quy trình "Nhập bản tính" (BT.parse/plan);
         – chỉ có thông số trung lập (AquaDesign, hoặc phần mềm khác) → BT.planFromXch → tab Bản tính
           để xem nguồn từng thông số, bổ sung ô thiếu, dựng sơ đồ và so sánh với kết quả bên gửi.
   ========================================================================== */
BT_SRC.xch = ['Hồ sơ trao đổi', '#0e7490', '#e0f7fa'];

/* ---------- nhận ---------- */
BT.planFromXch = function (r) {
  const tech = BT.TECH_NAME[r.tech] ? r.tech : r.tech === 'KMBR' ? 'MBR' : 'AO';
  const I = r.bioIn || r.inf || {}, d = r.des || {}, a = r.air || {}, ch = r.chem || {}, fr = r.frac || {};
  const notes = Object.assign({}, r.notes || {});
  const vals = {
    Q: r.flow && r.flow.Q, kmax: r.flow && r.flow.kmax, kmin: r.flow && r.flow.kmin,
    T: r.temp && (r.temp.Tdes != null ? r.temp.Tdes : r.temp.Tmin), Tmax: r.temp && r.temp.Tmax,
    COD: I.COD, BOD: I.BOD, TSS: I.TSS, TKN: I.TKN, NH4: I.NH4, NO3: I.NO3, TP: I.TP, Alk: I.Alk, pH: I.pH, VSSr: I.VSSr,
    bCOD: fr.bCOD, rbCOD: fr.rbCOD, nbsCOD: fr.nbsCOD,
    alpha: a.alpha, F: a.F, de: a.de, SOTE: a.SOTE, subm: a.subm, eBlow: a.eBlow, dPloss: a.dPloss,
    DO: d.DO, SVI: d.SVI, SRTd: d.SRT, Al: ch.Al, Fe: ch.Fe, NaOH: ch.NaOH, Cext: ch.Cext,
    // toàn dây chuyền: hóa lý trước/sau sinh học, khử trùng, điều hòa
    PAC1: ch.PACpre, poly1: ch.polyPre, NaOH1: ch.NaOHpre, PAC3: ch.PACpost, poly3: ch.polyPost, NaOH3: ch.NaOHpost, Cl2: ch.Cl2, tCl: ch.tCl, UVd: ch.UVd, Veq: d.Veq, Heq: d.Heq,
    // liên tục
    Vkk: d.Vkk, Vtk: d.Vtk, Vhk: d.Vhk, Vtot: d.Vtot, H: d.H, R: d.R, IR: d.IR, PXTSS: d.PXTSS, XR: d.XR,
    Vmem: d.Vmem, Am: d.Am, SADm: d.SADm, fill: d.fill, SSA: d.SSA, Acl: d.Acl, nCl: d.nCl, Dcl: d.Dcl, Hcl: d.Hcl,
    // bể chu kỳ
    N: d.N, W: d.W, L: d.L, Hmax: d.Hmax, Hmin: d.Hmin, fPre: d.fPre, TSSe: d.TSSe,
    tAer: d.tAer, tMix: d.tMix, tS: d.tS, tD: d.tD, icBatch: d.icFeed === 'batch' ? 1 : d.icFeed === 'cont' ? 0 : undefined, BMOB: d.BMOB, MLSSd: d.MLSSd, dM: d.dM, Vws: d.Vws,
    tF: d.tF, tFm: d.tFm, rRAS: d.rRAS, Cws: d.Cws, VT: d.VT, VF: d.VF, tR: d.tR, tI: d.tI, Vbuf: d.Vbuf
  };
  // hồ sơ vận hành (Thiết kế XLNT tab Vận hành, AquaDesign) có thể thiếu bùn dư / khối bùn: suy ra từ kết quả bên gửi hoặc MLSS·V/SRT
  const Rr = r.res || {}, Vb = +d.Vtot || ((+d.Vkk || 0) + (+d.Vtk || 0) + (+d.Vhk || 0));
  if (!(+vals.PXTSS > 0)) vals.PXTSS = +Rr.PX > 0 ? +Rr.PX : (Vb > 0 && +d.MLSS > 0 && +d.SRT > 0 ? Vb * d.MLSS / 1000 / d.SRT : undefined);
  if (!(+vals.BMOB > 0) && +d.MLSS > 0 && +d.W > 0 && +d.L > 0 && +d.Hmax > 0) vals.BMOB = d.MLSS * d.W * d.L * d.Hmax / 1000;
  if (!(+vals.MLSSd > 0) && +d.MLSS > 0 && +d.Hmax > 0 && +d.Hmin > 0) vals.MLSSd = d.MLSS * d.Hmax / d.Hmin;
  const I0 = r.inf || {};   // nước thải thô (dùng khi dựng toàn dây chuyền)
  Object.assign(vals, { COD0: I0.COD, BOD0: I0.BOD, TSS0: I0.TSS, TKN0: I0.TKN, NH40: I0.NH4, TP0: I0.TP });
  const xn = r.extra && r.extra.nereda;
  if (xn) Object.assign(vals, { WASc: xn.WASc, cakeDS: xn.cakeDS });
  if ((tech === 'SBR' || tech === 'AGS') && d.sbr) Object.assign(vals, { tF: d.sbr.tF, tR: d.sbr.tR, tS: d.sbr.tS, tD: d.sbr.tD, tI: d.sbr.tI, VF: d.sbr.VF });
  const spec = BT.specCommon().concat(BT.specTech(tech));
  const params = [];
  for (const s of spec) {
    const v = vals[s.id];
    const p = { id: s.id, grp: s.grp, l: s.l, u: s.u, note: [s.note, notes[s.id]].filter(Boolean).join(' – '), v: null, src: 'miss', ref: '' };
    if (v != null && v !== '' && isFinite(+v)) { p.v = +v; p.src = 'xch'; p.ref = XCH.APPS[r.from].name; }
    params.push(p);
  }
  const cur = () => Object.fromEntries(params.map(x => [x.id, x.v == null ? (spec.find(y => y.id === x.id).def) : x.v]));
  for (const s of spec) {
    const p = params.find(x => x.id === s.id);
    if (p.src === 'xch') continue;
    let v = null;
    if (s.derive) { try { v = s.derive(cur()); } catch (e) { v = null; } }
    if (v != null && isFinite(v)) { p.v = v; p.src = 'calc'; }
    else if (s.def != null) { p.v = s.def; p.src = 'def'; }
  }
  for (const p of params) if (p.src === 'miss' && BT.TYP[p.id] !== undefined) p.typ = BT.TYP[p.id];
  // chỉ tiêu so sánh: kết quả của bên gửi
  const R = r.res || {}, E = R.eff || {}, L = r.lim || {}, targets = [];
  const T = (k, l, u, v, m, tol, rel, lim, only) => { if (v != null && isFinite(+v)) targets.push({ k, l, u, m, tol, rel, v: +v, lim: lim != null && isFinite(+lim) ? +lim : null, only, ref: XCH.APPS[r.from].name, btName: 'kết quả ' + XCH.APPS[r.from].name, note: '' }); };
  T('COD', 'COD ra', 'mg/L', E.COD, 'eff', 5, null, L.COD); T('BOD5', 'BOD₅ ra', 'mg/L', E.BOD, 'eff', 3, null, L.BOD); T('TSS', 'TSS ra', 'mg/L', E.TSS, 'eff', 3, null, L.TSS);
  T('NH4', 'NH₄-N ra', 'mg/L', E.NH4, 'eff', 1, null, L.NH4); T('NOx', 'NO₃-N ra', 'mg/L', E.NO3, 'eff', 1.5, null, L.NO3); T('TN', 'TN ra', 'mg/L', E.TN, 'eff', 2, null, L.TN);
  T('TP', 'TP ra', 'mg/L', E.TP, 'eff', 0.5, null, L.TP, 'ASM2d');
  T('SRT', 'Tuổi bùn SRT', 'ngày', R.SRT, 'plant', null, 0.1); T('MLSS', 'MLSS', 'mg/L', R.MLSS, 'plant', null, 0.1); T('WAS', 'Bùn dư', 'kgTSS/d', R.PX, 'plant', null, 0.15);
  T('OTR', 'Nhu cầu O₂', 'kgO₂/d', R.OTR, 'plant', null, 0.15); T('air', 'Lượng khí cấp', 'm³/d', R.air, 'plant', null, 0.2); T('Eblow', 'Điện máy thổi', 'kWh/d', R.kWh, 'plant', null, 0.2);
  const name = (r.project && r.project.name) || 'Hồ sơ trao đổi';
  return {
    file: name + ' (' + XCH.APPS[r.from].name + ')', title: name, tech, techName: BT.TECH_NAME[tech] + (r.tech === 'KMBR' ? ' – từ MBR Kubota' : ''), model: tech === 'AGS' ? 'ASM2dG' : 'ASM2d', params, targets,
    chain: [{ n: 'Nguồn', c: XCH.APPS[r.from].long, sim: false }].concat(Array.isArray(r.chain) ? r.chain.filter(x => x && x.n && x.c).map(x => ({ n: String(x.n), c: String(x.c), sim: false })) : [], [{ n: 'Sinh học', c: XCH.TECH[r.tech] || r.tech || '?', sim: true }]), time: new Date().toLocaleString('vi-VN'), xchFrom: r.from
  };
};

async function simXchReceive(r) {
  if (APP.running) { alert('Đang tính – nhận hồ sơ sau khi tính xong.'); return; }
  if (r.from === 'bun') { simBunAttach(r); return; }
  let D;
  if (r.xlsx) {
    const wb = await XLSX_READ.read(XCH.unb64(r.xlsx));
    D = BT.plan(BT.parse(wb, ((r.project && (r.project.code || r.project.name)) || 'BanTinh') + '.xlsx'));
    for (const p of D.params) if (p.src === 'miss' && BT.TYP[p.id] !== undefined) p.typ = BT.TYP[p.id];
    D.xchFrom = r.from;
  } else D = BT.planFromXch(r);
  if (r.tert) D.tert = r.tert; if (r.sludge && r.sludge.thick) D.sl = r.sludge;
  if (r.anaer && +r.anaer.V > 0) D.anaer = r.anaer;     // xử lý yếm khí cấp 1 → bể kỵ khí tốc độ cao (ADM1) trước sinh học
  APP.btPlan = D;
  showTab('bt');
  XCH.toast(`Đã nhận hồ sơ từ ${XCH.APPS[r.from].name} – kiểm tra thông số ở tab Bản tính rồi bấm "Dựng sơ đồ".`);
}

/* ---------- nhận từ phần mềm Xử lý bùn: gắn dây chuyền xử lý bùn vào sơ đồ hiện tại ----------
   Bùn dư sinh học / sơ cấp / hóa lý / yếm khí của sơ đồ đang mở (các đầu ra vào "Bùn thải" hoặc vào thiết bị xử lý bùn cũ)
   → [nén] → [phân hủy kỵ khí ADM1 / hiếu khí] → [tách nước] → [sấy] → bánh bùn; nước tách quay về đầu dây chuyền.
   Thiết bị xử lý bùn cũ được thay thế. Chưa có sơ đồ trạm (không có dòng bùn) → báo cần dựng sơ đồ XLNT trước. */
function simBunAttach(r) {
  const P = JSON.parse(JSON.stringify(APP.P)), sl = r.sludge || {}, ln = sl.line || {};
  const SLT = new Set(['thicken', 'dewater', 'digester', 'aerdig', 'thp', 'dryer', 'stank']);
  const byId = id => P.units.find(u => u.id === id);
  const isWaste = u => u && u.type === 'sludge' && !/rác|cát|screen|grit|bánh|cake/i.test(u.name || '');
  const entries = P.links.filter(l => { const a = byId(l.from[0]), b = byId(l.to[0]); return a && b && !SLT.has(a.type) && (SLT.has(b.type) || isWaste(b)); });
  if (!entries.length) {
    alert('Sơ đồ SimXLNT hiện tại chưa có dòng bùn thải (bùn dư, bùn sơ cấp…) để gắn dây chuyền xử lý bùn.\n\nHãy dựng sơ đồ trạm XLNT trước (nhận hồ sơ từ Thiết kế XLNT / AquaDesign / NEREDA, hoặc chọn sơ đồ mẫu), sau đó nhận lại hồ sơ từ phần mềm Xử lý bùn.');
    return;
  }
  // nơi nhận nước tách: nơi nước tách cũ quay về, nếu không có thì đơn vị đầu tiên sau dòng vào (bể điều hòa / bể sinh học)
  let rej = P.links.map(l => [byId(l.from[0]), l]).find(([a, l]) => a && SLT.has(a.type) && l.from[1] === 'out' && !SLT.has((byId(l.to[0]) || {}).type));
  rej = rej ? rej[1].to.slice() : null;
  if (!rej) { const inf = P.units.find(u => u.type === 'influent'), li = inf && P.links.find(l => l.from[0] === inf.id); rej = li ? li.to.slice() : null; }
  // tránh vòng lặp đại số: nước tách không quay về đơn vị không thể tích (lắng sơ cấp, song chắn, chia dòng…) – đi tiếp tới bể đầu tiên
  for (let k = 0; rej && k < 12; k++) {
    const u = byId(rej[0]); if (!u || !['psep', 'screen', 'grit', 'splitter', 'cyclone', 'chem', 'filter', 'pclar'].includes(u.type)) break;
    const nx = P.links.find(l => l.from[0] === u.id && ['out', 'ovf', 'eff', 'b'].includes(l.from[1])); rej = nx ? nx.to.slice() : null;
  }
  const names = { gravity: 'Bể nén bùn trọng lực', gbt: 'Cô đặc băng tải (GBT)', daf: 'Nén tuyển nổi DAF', centrifuge: 'Ly tâm cô đặc', drum: 'Cô đặc trống quay' };
  const msg = `Gắn dây chuyền xử lý bùn từ phần mềm Xử lý bùn vào sơ đồ hiện tại "${P.name}":\n• dòng bùn vào: ${entries.map(l => (byId(l.from[0]).name || l.from[0]) + ' (' + l.from[1] + ')').join(', ')}\n• ${[sl.thick !== 'none' && names[sl.thick], sl.stab === 'mad' || sl.stab === 'tad' ? 'phân hủy kỵ khí ' + (sl.stab === 'tad' ? '55' : '35') + ' °C' : sl.stab === 'aed' ? 'phân hủy hiếu khí' : null, sl.dew && sl.dew !== 'none' ? 'tách nước' : null, sl.dry && sl.dry !== 'none' ? 'sấy' : null].filter(Boolean).join(' → ')} → bánh bùn\n• nước tách quay về ${rej ? (byId(rej[0]) || {}).name || rej[0] : '–'}\nCác thiết bị xử lý bùn đang có trong sơ đồ sẽ được thay thế. Tiếp tục?`;
  if (!confirm(msg)) return;
  // xóa thiết bị xử lý bùn cũ và các "Bùn thải" chỉ nhận từ chúng / từ đầu vào bùn
  const kill = new Set(P.units.filter(u => SLT.has(u.type)).map(u => u.id));
  for (const l of entries) if (isWaste(byId(l.to[0]))) kill.add(l.to[0]);
  for (const u of P.units) if (u.type === 'sludge' && P.links.filter(l => l.to[0] === u.id).every(l => kill.has(l.from[0]))) { if (P.links.some(l => l.to[0] === u.id)) kill.add(u.id); }
  const src = entries.map(l => l.from.slice());
  P.units = P.units.filter(u => !kill.has(u.id)); P.links = P.links.filter(l => !kill.has(l.from[0]) && !kill.has(l.to[0]));
  if (rej && kill.has(rej[0])) rej = null;
  if (!rej) { alert('Không tìm được nơi đưa nước tách bùn quay về – nối tay đầu ra "nước tách" sau khi gắn.'); }
  // dựng dây chuyền mới phía dưới sơ đồ
  const used = new Set(P.units.map(u => u.id)), uid = b => { let i = '', k = 1; while (used.has(b + i)) i = String(++k); used.add(b + i); return b + i; };
  let lk = P.links.reduce((a, l) => Math.max(a, +String(l.id).replace(/\D/g, '') || 0), 0);
  const link = (a, b) => P.links.push({ id: 'L' + (++lk), from: a, to: b });
  const y0 = Math.max(...P.units.map(u => u.y)) + 170; let x = Math.min(...P.units.map(u => u.x)) + 80;
  const mk = (type, name, p) => { const u = { id: uid(FS.prefix[type] || type.toUpperCase().slice(0, 3)), type, name, x, y: y0, p: Object.assign(UT[type].def(), p || {}) }; P.units.push(u); x += 170; return u; };
  let head = null, prev = null;
  const chain = (u, inP, outP) => { if (prev) link(prev, [u.id, inP || 'in']); else head = u; prev = [u.id, outP]; };
  const thK = { gravity: 'gravity', gbt: 'belt', daf: 'daf', centrifuge: 'centrifuge', drum: 'drum' }[sl.thick];
  if (thK) { const t = ln.thick || {}, u = mk('thicken', names[sl.thick], { kind: thK, capt: +sl.thCap > 0 ? +sl.thCap : THK[thK][1], DS: +(+t.C || THK[thK][2]).toFixed(2), poly: THK[thK][3], kWh: THK[thK][4] }); chain(u, 'in', 'und'); if (rej) link([u.id, 'out'], rej); }
  if (sl.stab === 'mad' || sl.stab === 'tad') { const s = ln.stab || {}, V = Math.max(+s.V || 0, 50); chain(mk('digester', 'Phân hủy kỵ khí ' + (sl.stab === 'tad' ? 'nóng 55' : 'ấm 35') + ' °C', { V: Math.round(V), Vgas: Math.round(V * 0.1), T: +sl.T || (sl.stab === 'tad' ? 55 : 35) }), 'in', 'out'); }
  else if (sl.stab === 'aed') { const s = ln.stab || {}, V = Math.max(+s.V || 0, 50); chain(mk('aerdig', 'Phân hủy bùn hiếu khí', { V: Math.round(V), H: 5 }), 'in', 'out'); }
  const dwK = { belt: 'belt', screw: 'screw', centrifuge: 'centrifuge', press: 'press', beds: 'press' }[sl.dew];
  if (dwK) { const d = ln.dew || {}, u = mk('dewater', sl.dew === 'beds' ? 'Sân phơi bùn (xấp xỉ bằng ép khung bản)' : 'Tách nước bùn', { kind: dwK, capt: +sl.dwCap > 0 ? +sl.dwCap : DWT[dwK][1], DS: +(+d.C || DWT[dwK][2]).toFixed(1), poly: DWT[dwK][3], kWh: DWT[dwK][4] }); chain(u, 'in', 'und'); if (rej) link([u.id, 'out'], rej); }
  if (sl.dry && sl.dry !== 'none') { const d = ln.dry || {}, u = mk('dryer', sl.dry === 'solar' ? 'Nhà sấy năng lượng mặt trời' : 'Sấy nhiệt', { DS: +(+d.C || (sl.dry === 'solar' ? 75 : 90)).toFixed(0) }); chain(u, 'in', 'und'); const v = mk('effluent', 'Hơi nước', {}); link([u.id, 'out'], [v.id, 'in']); }
  const cake = mk('sludge', 'Bánh bùn', {});
  if (prev) link(prev, [cake.id, 'in']); else head = cake;
  for (const s of src) link(s, [head.id, 'in']);
  P.desc = (P.desc || '') + ` Dây chuyền xử lý bùn nhận từ phần mềm Xử lý bùn (${(r.project && r.project.name) || ''}).`;
  setProject(P);
  showTab('fs');
  XCH.toast('Đã gắn dây chuyền xử lý bùn vào sơ đồ – bấm "Ổn định" để mô phỏng.');
}

/* ---------- gửi ---------- */
function simTechOf(P) {
  const D = P.design;
  if (D && D.tech) return D.tech;
  const t = new Set(P.units.map(u => u.type));
  if (t.has('iceas')) return 'ICEAS'; if (t.has('ctech')) return 'CTECH'; if (t.has('sbr')) return 'SBR';
  if (t.has('mbr')) return 'MBR'; if (t.has('mbbr')) return 'MBBR';
  const cs = P.units.filter(u => u.type === 'cstr'), un = cs.filter(u => u.p.aer === 'none');
  if (!un.length) return 'CAS';
  return un.some(u => /kỵ khí|anaer|^AN/i.test(u.name + ' ' + u.id)) ? 'AAO' : 'AO';
}
function simXchBuild(to) {
  const P = APP.P, D = P.design, tech = simTechOf(P);
  const ss = APP.ss && !APP.stale ? APP.ss : null;
  const S = ss ? plantSummary(ss.sys, ss.det) : null;
  const U = P.units, by = t => U.filter(u => u.type === t);
  const infs = by('influent'), Q = infs.reduce((s, u) => s + (+u.p.Q || 0), 0);
  const pat = infs[0] && infs[0].p.inf && infs[0].p.inf.pat;
  const des = {}, res = {}, chem = {};
  const r = { project: { name: P.name }, tech, flow: { Q }, temp: { Tdes: +P.plant.T } };
  if (pat && pat.type === 'diurnal') r.flow.kmax = 1 + (+pat.aQ);   // k_min không suy được từ dạng dao động hình sin của mô hình – không gửi
  // nước vào sinh học (thành phần tổng hợp của dòng vào)
  if (S) {
    const src = S.srcs.find(s => s.cu.type === 'influent');
    if (src) {
      const c = ss.sys.m.composites(ss.det.C[src.li], ss.sys.p20, {});
      r.bioIn = { COD: c.COD, BOD: c.BOD5, TSS: c.TSS, TKN: c.TKN, NH4: c.NH4, NO3: c.NOx, TP: c.TP, Alk: c.Alk, pH: infs[0].p.inf.pH };
    }
  } else if (infs[0]) { const f = infs[0].p.inf; r.bioIn = { COD: f.COD, TSS: f.TSS, TKN: f.TKN, NH4: f.TKN * f.fNH4, NO3: f.NO3, TP: f.TP, Alk: f.Alk, pH: f.pH }; }
  // giới hạn xả (sơ đồ dựng từ bản tính)
  if (D && D.targets) { r.lim = {}; for (const t of D.targets) if (t.lim != null) r.lim[{ BOD5: 'BOD', NOx: 'NO3' }[t.k] || t.k] = t.lim; }
  // bể
  const reac = U.filter(u => ['cstr', 'mbbr', 'mbr'].includes(u.type));
  const aer = reac.filter(u => u.p.aer !== 'none'), unaer = reac.filter(u => u.p.aer === 'none');
  const isAn = u => /kỵ khí|anaer|^AN\d*$/i.test(u.name) || /^AN\d*$/.test(u.id);
  const sumV = a => a.reduce((s, u) => s + (+u.p.V || 0), 0);
  if (reac.length) {
    des.Vkk = sumV(unaer.filter(isAn)); des.Vtk = sumV(unaer.filter(u => !isAn(u)));
    des.Vhk = sumV(aer.filter(u => u.type !== 'mbr')); des.Vmem = sumV(by('mbr'));
    des.Vtot = des.Vkk + des.Vtk + des.Vhk + des.Vmem; des.H = +reac[0].p.H;
    const doU = aer.find(u => u.p.aer === 'do'); if (doU) des.DO = +doU.p.DOsp;
  }
  const mb = by('mbr')[0]; if (mb) { des.Am = +mb.p.Am; des.SADm = +mb.p.SADm; }
  const mbb = by('mbbr')[0]; if (mbb) { des.fill = +mbb.p.fill; des.SSA = +mbb.p.SSA; }
  const cl = by('clarifier'); if (cl.length) { des.Acl = cl.reduce((s, u) => s + (+u.p.A || 0), 0); des.nCl = cl.length; des.Hcl = +cl[0].p.H; }
  const cy = U.find(u => ['iceas', 'ctech', 'sbr'].includes(u.type));
  if (cy) {
    const p = cy.p;
    Object.assign(des, { N: +p.N, DO: +p.DOsp, SVI: +p.SVI, TSSe: +p.TSSe });
    if (cy.type === 'sbr') { Object.assign(des, { VT: +p.Vmax, H: +p.H, VF: 1 - p.Vmin / p.Vmax }); des.sbr = { tF: +p.tF, tR: +p.tR, tS: +p.tS, tD: +p.tD, tI: +p.tI, VF: des.VF }; des.Vtot = p.Vmax * p.N; }
    else {
      const A = +p.A, ar = 1 + (cy.type === 'iceas' ? 0 : 0);
      Object.assign(des, { Hmax: +p.Hmax, Hmin: +p.Hmin, H: +p.Hmax, Abasin: A * ar, Vtot: A * p.Hmax * p.N, fPre: cy.type === 'iceas' ? +p.fPre : +p.fSel });
      if (cy.type === 'iceas') Object.assign(des, { tAer: +p.tAer, tMix: +p.tMix, tS: +p.tS, tD: +p.tD, cycle: p.mode, icFeed: p.feed === 'batch' ? 'batch' : 'cont' });
      else Object.assign(des, { tF: +p.tF, tFm: +p.tFm, tS: +p.tS, tD: +p.tD, rRAS: +p.rRAS, ct: { TFA: p.tF / 60, TS: p.tS / 60, TD: p.tD / 60, R: +p.rRAS } });
    }
  }
  if (cl.length && cl[0].p.SVI) des.SVI = +cl[0].p.SVI;
  if (des.SVI == null && D) { const v = BT.val(D, 'SVI'); if (isFinite(v)) des.SVI = v; }
  // tuần hoàn từ kết quả lưu lượng
  if (ss && Q > 0) {
    const L = P.links, Qof = (id, port) => { const i = L.findIndex(l => l.from[0] === id && l.from[1] === port); return i >= 0 ? ss.det.Q[i] : NaN; };
    const sep = U.find(u => u.type === 'clarifier' || u.type === 'mbr');
    if (sep) { const qu = Qof(sep.id, 'und'); if (isFinite(qu)) des.R = qu / Q; }
    const toUn = new Set(unaer.map(u => u.id)), fromAer = new Set(aer.map(u => u.id));
    for (const sp of by('splitter')) {
      const li = L.find(l => l.to[0] === sp.id), la = L.find(l => l.from[0] === sp.id && l.from[1] === 'a'), lb = L.find(l => l.from[0] === sp.id && l.from[1] === 'b');
      if (!li || !fromAer.has(li.from[0])) continue;
      const leg = la && toUn.has(la.to[0]) ? 'a' : lb && toUn.has(lb.to[0]) ? 'b' : null;
      if (leg) { const q = Qof(sp.id, leg); if (isFinite(q)) des.IR = (des.IR || 0) + q / Q; }
    }
  }
  // hóa chất
  for (const u of by('dose')) {
    if (u.p.dmode && u.p.dmode !== 'mass') DOSE.sync(u.p, Q);
    const m = +u.p.mass || 0;
    if (u.p.kind === 'metal') chem[u.p.metal === 'Al' ? 'Al' : 'Fe'] = (chem[u.p.metal === 'Al' ? 'Al' : 'Fe'] || 0) + m;
    else if (u.p.kind === 'alk') chem.NaOH = (chem.NaOH || 0) + m * 0.8;
    else if (u.p.kind === 'carbon') chem.Cext = (chem.Cext || 0) + m;
  }
  for (const u of by('chem')) {
    // keo tụ: trước sinh học (CEPT) / bậc 3 – phân biệt theo tên hoặc mã thiết bị
    const post = /bậc 3|tertiary|CHT/i.test(u.name + ' ' + u.id);
    if ((u.p.coag || 'pac') === 'pac' && +u.p.dose > 0) chem[post ? 'PACpost' : 'PACpre'] = +u.p.dose;
    if (+u.p.poly > 0) chem['poly' + (post ? 'Post' : 'Pre')] = +u.p.poly;
  }
  for (const u of by('aop')) if (u.p.kind === 'naocl') { chem.Cl2 = +u.p.Cl2; if (Q > 0 && +u.p.V > 0) chem.tCl = u.p.V / Q * 1440; }
  const eqU = by('eqtank')[0]; if (eqU) { des.Veq = +eqU.p.Vmax; des.Heq = +eqU.p.H; }
  // khí
  const pl = P.plant;
  r.air = { alpha: +pl.alpha, F: +pl.F, de: +pl.de, eBlow: +pl.eBlow, dPloss: +pl.dPloss };
  // động học ở 20 °C
  const prm = Object.assign({}, MODELS[P.model].defaults || {}, P.params[P.model] || {});
  const pk = ks => { for (const k of ks) if (prm[k] != null && isFinite(+prm[k])) return +prm[k]; return undefined; };
  r.kin = { muH: pk(['muH']), bH: pk(['bH', 'bHO2']), YH: pk(['YH', 'YHO2']), muA: pk(['muA', 'muAUT', 'muAOB']), bA: pk(['bA', 'bAUT', 'bAO2', 'bAOB']), KNH: pk(['KNH4A', 'KNH', 'KANH4', 'KNHA']) };
  // kết quả mô phỏng
  if (S) {
    const eff = S.sinks.find(s => s.cu.type === 'effluent');
    if (eff) { const c = eff.c, z = v => Math.max(0, v); res.eff = { COD: z(c.COD), BOD: z(c.BOD5), TSS: z(c.TSS), TKN: z(c.TKN), NH4: z(c.NH4), NO3: z(c.NOx), TN: z(c.TN), TP: z(c.TP), Alk: c.Alk }; }
    const ar = S.reactors.filter(x => x.aerated && x.cu.type !== 'mbr'), vol = ar.reduce((a, x) => a + x.info.V, 0);
    Object.assign(res, { SRT: isFinite(S.SRT) ? S.SRT : undefined, SRTaer: isFinite(S.SRTaer) ? S.SRTaer : undefined, MLSS: vol > 0 ? ar.reduce((a, x) => a + x.c.TSS * x.info.V, 0) / vol : undefined,
      PX: S.WAS, OTR: S.OTR, air: S.air, kWh: S.Pblow * 24, Vbio: S.Vtot, note: 'Trạng thái ổn định SimXLNT, ' + MODELS[P.model].name + ', T = ' + P.plant.T + ' °C' });
    des.SRT = res.SRT; des.SRTaer = res.SRTaer; des.MLSS = res.MLSS; des.PXTSS = S.WAS;   // quy ước hồ sơ: SRT = tuổi bùn TỔNG, SRTaer = hiếu khí
  } else res.note = 'Chưa có kết quả trạng thái ổn định – chỉ gửi thông số sơ đồ.';
  // dòng bùn ra (đơn vị "Bùn") cho phần mềm Xử lý bùn
  if (S) {
    const streams = [];
    for (const k of S.sinks) if (k.cu.type === 'sludge' && k.Q > 0 && k.c && k.c.TSS > 0) {
      const nm = k.cu.u.name || k.cu.id, kind = /cát|rác|grit|screen/i.test(nm) ? null : /sơ cấp|primary/i.test(nm) ? 'prim' : /hóa|chem/i.test(nm) ? 'chem' : P.model === 'ASM2dG' ? 'gran' : 'bio';
      if (!kind || /bánh|cake/i.test(nm) || k.c.TSS > 80000) continue;   // bánh bùn đã khử nước: không gửi lại
      streams.push({ name: nm, kind, M: k.Q * k.c.TSS / 1000, C: k.c.TSS / 1e4, fVS: k.c.VSS > 0 ? Math.min(0.95, k.c.VSS / k.c.TSS) : 0.75 });
    }
    if (streams.length) r.sludge = { streams };
  }
  r.des = des; r.res = res; r.chem = chem;
  r.notes = { bioIn: 'Dòng vào của SimXLNT là nước vào cụm sinh học (sau tiền xử lý, gồm nước tách bùn) – khác nước thải thô của đầu bài.' };
  if (!S && to) XCH.toast('Chưa có kết quả ổn định – hồ sơ chỉ gồm thông số sơ đồ (bấm "Ổn định" trước để gửi cả kết quả mô phỏng).');
  return XCH.make('sim', r);
}

window.addEventListener('DOMContentLoaded', () => {
  const hdr = document.querySelector('header');
  XCH.button(hdr, document.getElementById('btnBT'));
  XCH.init('sim', { store: { keys: /^simxlnt\.project\.v1$/, apply: s => { const t = s.keys[LS_KEY]; if (!t) return false; setProject(JSON.parse(t)); return true; } }, build: simXchBuild, receive: r => { simXchReceive(r).catch(e => { alert('Không nhận được hồ sơ: ' + e.message); console.error(e); }); } });
  // trong bộ phần mềm: liên kết SimNước chuyển tab thay vì mở cửa sổ mới
  const lw = document.getElementById('lnkW');
  if (lw) lw.addEventListener('click', e => { if (XCH.inSuite) { e.preventDefault(); window.parent.postMessage({ xch: 'goto', app: 'nuoc' }, '*'); } });
});
// nhãn nút thống nhất với các phần mềm khác trong bộ: 📂 Mở dự án · 💾 Lưu dự án (chức năng lưu/mở .json, .sumo giữ nguyên)
(() => {
  // nhãn "biểu tượng + chữ": khi thanh tiêu đề thiếu chỗ (XLNT_FIT mức 4) chỉ còn biểu tượng, tên đầy đủ ở chú thích
  const lbl = (id, ic, vi, en) => { const b = document.getElementById(id); if (!b) return; b.setAttribute('data-nobi', ''); b.title = b.title || vi;
    const d = () => { b.innerHTML = `<span class="ic">${ic}</span><span class="tx"> ${typeof BI !== 'undefined' && BI.mode === 'en' ? en : vi}</span>`; }; d(); if (typeof BI !== 'undefined' && BI.onMode) BI.onMode(d); };
  // nút Nhập bản tính do ui_bt.js tạo lúc DOMContentLoaded → gán nhãn sau khi trang dựng xong
  const go = () => { lbl('btnNew', '🆕', 'Mới', 'New'); lbl('btnOpen', '📂', 'Mở dự án', 'Open project'); lbl('btnSave', '💾', 'Lưu dự án', 'Save project'); lbl('btnBT', '📥', 'Nhập bản tính…', 'Import workbook…'); };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(go, 0)); else go();
  if (window.XLNT_FIT) XLNT_FIT('#app > header', 5);
})();
