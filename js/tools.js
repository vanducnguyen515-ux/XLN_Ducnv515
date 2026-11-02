'use strict';
/* ==========================================================================
   SimXLNT – Công cụ: phân tích độ nhạy / kịch bản (1 thông số, lưới 2 thông số, kịch bản nhiều thông số;
   chạy song song nhiều luồng), phân tích thông lượng chất rắn (SPA)
   ========================================================================== */
const TOOLS = { sens: null };

function knobList(P) {
  const m = MODELS[P.model], L = [];
  L.push({ key: 'plant.T', name: 'Nhiệt độ nước', u: '°C' });
  L.push({ key: 'plant.alpha', name: 'Hệ số α truyền khí', u: '-' });
  // bể phân hủy / ADM1 (khi sơ đồ có bể phân hủy) – tham số ADM1 sửa được như tham số ASM
  const hasAD = P.units.some(u => u.type === 'digester');
  if (hasAD && typeof ADM !== 'undefined' && ADM.params) for (const d of ADM.params) L.push({ key: 'adm.' + d.id, name: 'ADM1 ' + d.id + ' – ' + (d.d || ''), u: d.u || '' });
  for (const u of P.units) {
    for (const f of UT[u.type].fields) if (f.t === 'num' && (!f.show || f.show(u.p))) L.push({ key: 'u.' + u.id + '.' + f.k, name: u.name + ': ' + f.l, u: f.u || '' });
    if (u.type === 'influent' && u.p.inf.mode === 'frac')
      for (const f of INF.fracFields) if (!f[3] || f[3] === m.fam) L.push({ key: 'i.' + u.id + '.' + f[0], name: u.name + ': ' + f[1], u: f[2] });
  }
  for (const c of P.ctrls || []) L.push({ key: 'c.' + c.id + '.sp', name: 'Giá trị đặt bộ ĐK ' + (c.name || c.id), u: '' });
  for (const d of m.params) L.push({ key: 'par.' + d.id, name: 'Tham số ' + d.id + ' – ' + d.d, u: d.u });
  return L;
}
function knobGet(P, key) {
  const [k, a, b] = key.split('.');
  const m = MODELS[P.model];
  if (k === 'plant') return +P.plant[a];
  if (k === 'u') {
    const u = P.units.find(x => x.id === a); if (!u) return NaN;
    // nhiệt độ riêng của bể: trống/0 = theo nhà máy → giá trị hiệu dụng là nhiệt độ nhà máy
    if (b === 'Tloc' && !(+u.p[b] > 0)) return +P.plant.T;
    const v = +u.p[b]; return isFinite(v) ? v : 0;
  }
  if (k === 'i') { const u = P.units.find(x => x.id === a); return u ? +u.p.inf[b] : NaN; }
  if (k === 'c') { const c = (P.ctrls || []).find(x => x.id === a); return c ? +c[b] : NaN; }
  if (k === 'par') { const v = (P.params[m.id] || {})[a]; return v !== undefined ? v : m.defaults[a]; }
  if (k === 'adm') { const v = (P.params.ADM1 || {})[a]; if (v !== undefined) return +v; const d = typeof ADM !== 'undefined' && ADM.params ? ADM.params.find(x => x.id === a) : null; return d ? +d.v : NaN; }
  return NaN;
}
function knobSet(P, key, v) {
  const [k, a, b] = key.split('.');
  if (k === 'plant') P.plant[a] = v;
  if (k === 'u') P.units.find(u => u.id === a).p[b] = v;
  if (k === 'i') P.units.find(u => u.id === a).p.inf[b] = v;
  if (k === 'c') P.ctrls.find(c => c.id === a)[b] = v;
  if (k === 'par') (P.params[P.model] || (P.params[P.model] = {}))[a] = v;
  if (k === 'adm') (P.params.ADM1 || (P.params.ADM1 = {}))[a] = v;
}
function outputList(P) {
  const m = MODELS[P.model];
  return m.compVars.filter(v => v[0] !== 'DO').map(v => ({ key: 'eff.' + v[0], name: 'Nước ra: ' + v[1], short: v[1], u: v[2] })).concat([
    { key: 'S.SRT', name: 'Tuổi bùn SRT', u: 'd' }, { key: 'S.SRTcl', name: 'SRT kể cả bùn bể lắng (định nghĩa SUMO)', u: 'd' }, { key: 'S.SRTaer', name: 'SRT hiếu khí', u: 'd' }, { key: 'S.MLSS', name: 'MLSS TB bể hiếu khí', u: 'mg/L' },
    { key: 'S.WAS', name: 'Bùn dư', u: 'kgTSS/d' }, { key: 'S.airh', name: 'Lưu lượng khí', u: 'Nm³/h' }, { key: 'S.OTR', name: 'O₂ cấp', u: 'kg/d' },
    { key: 'S.Eday', name: 'Điện năng', u: 'kWh/d' }, { key: 'S.kWhm3', name: 'Suất điện năng', u: 'kWh/m³' }, { key: 'S.N2', name: 'N khử thành N₂', u: 'kgN/d' },
    { key: 'S.CH4', name: 'CH₄ từ bể phân hủy', u: 'Nm³/d' }, { key: 'S.Enet', name: 'Điện năng ròng (trừ CHP)', u: 'kWh/d' }, { key: 'S.pHmin', name: 'pH thấp nhất các bể', u: '-' },
    { key: 'S.GHG', name: 'Khí nhà kính (N₂O + điện)', u: 'kgCO₂e/d' }
  ]).concat(outputExtra(m)).map(o => Object.assign({ short: o.name }, o));
}
// chỉ tiêu riêng theo mô hình: N₂O (ASM1N2O), quần thể nitơ AOB/NOB/AMX/CMX (ASM1N, ASM2dS2…), bùn hạt Fg, polyme lưu trữ XSTO, VFA bể kỵ khí
function outputExtra(m) {
  const L = [];
  if ((m.strip || []).length) L.push({ key: 'S.N2O', name: 'N₂O phát thải', u: 'kgN/d' }, { key: 'S.EFN2O', name: 'Hệ số phát thải N₂O (/TN vào)', u: '%' }, { key: 'S.NOgas', name: 'NO phát thải', u: 'kgN/d' });
  for (const [k, n] of POPS) if (popIdx(m, k).length) L.push({ key: 'R.' + k, name: 'Sinh khối ' + n + ' TB bể sinh học', u: 'mgCOD/L' });
  if (m.gran) L.push({ key: 'R.Fg', name: 'Phần bùn hạt TB bể sinh học', u: '%' });
  return L;
}
// quần thể → biến trạng thái (gồm bản "trong hạt" của mô hình bùn hạt). ASM1N: XBA là AOB; ASM2dS2: XAUT là AOB (có XNOB riêng)
const POPS = [['AOB', 'AOB (oxy hóa amoni)'], ['NOB', 'NOB (oxy hóa nitrit)'], ['AUT', 'tự dưỡng nitrat hóa'], ['AMX', 'anammox'], ['CMX', 'comammox'], ['PAO', 'PAO'], ['STO', 'polyme lưu trữ XSTO']];
function popIdx(m, k) {
  const ids = (m.comps || []).map(s => s.id), two = ids.includes('XNOB');
  const cand = { AOB: two ? ['XBA', 'XAUT', 'XAUTg', 'XBAg'] : [], NOB: ['XNOB'], AUT: two ? [] : ['XBA', 'XAUT', 'XBAg', 'XAUTg'], AMX: ['XAMX'], CMX: ['XCMX'], PAO: ['XPAO', 'XPAOg'], STO: ['XSTO'] }[k] || [];
  return cand.map(x => ids.indexOf(x)).filter(i => i >= 0);
}
function outputsOf(sys, det) {
  const S = plantSummary(sys, det), o = {};
  const eff = S.sinks.filter(s => s.cu.type === 'effluent');
  let q = 0; const acc = {};
  for (const e of eff) { q += e.Q; for (const k in e.c) acc[k] = (acc[k] || 0) + e.Q * e.c[k]; }
  for (const k in acc) o['eff.' + k] = q > 0 ? acc[k] / q : NaN;
  const aer = S.reactors.filter(r => r.aerated);
  o['S.MLSS'] = aer.length ? aer.reduce((a, r) => a + r.c.TSS * r.info.V, 0) / aer.reduce((a, r) => a + r.info.V, 0) : NaN;
  o['S.CH4'] = S.CH4; o['S.Enet'] = S.Enet;
  o['S.pHmin'] = S.reactors.length ? Math.min(...S.reactors.map(r => r.info.pH)) : NaN;
  o['S.SRT'] = S.SRT; o['S.SRTcl'] = S.SRTcl; o['S.SRTaer'] = S.SRTaer; o['S.WAS'] = S.WAS; o['S.airh'] = S.air / 24; o['S.OTR'] = S.OTR;
  o['S.Eday'] = S.Eday; o['S.kWhm3'] = S.kWhm3; o['S.N2'] = S.N2;
  o['S.GHG'] = S.GHG ? S.GHG.total : NaN;
  if (S.N2O != null) { o['S.N2O'] = S.N2O; o['S.NOgas'] = S.NOgas; o['S.EFN2O'] = S.GHG && S.GHG.efN2O != null ? S.GHG.efN2O : NaN; }
  // trung bình theo thể tích các bể sinh học (bể có biến trạng thái)
  const m = sys.m, rs = S.reactors.filter(r => r.info && r.info.C && r.info.V > 0), Vt = rs.reduce((a, r) => a + r.info.V, 0);
  if (Vt > 0) {
    for (const [k] of POPS) { const ix = popIdx(m, k); if (ix.length) o['R.' + k] = rs.reduce((a, r) => a + ix.reduce((s, i) => s + (r.info.C[i] || 0), 0) * r.info.V, 0) / Vt; }
    if (m.gran) o['R.Fg'] = rs.reduce((a, r) => a + (r.c.Fg || 0) * r.info.V, 0) / Vt * 100;   // Fg = TSS hạt / TSS (0–1) → %
  }
  return o;
}

/* ---------------- cấu hình (lưu cùng dự án) ---------------- */
function sensCfg(P) {
  const m = MODELS[P.model], c = P.sensCfg || (P.sensCfg = {});
  const knobs = knobList(P), ok = k => k && knobs.some(x => x.key === k);
  const mkp = (key, n) => { const [a, b] = sensRange(P, key); return { key, from: a, to: b, n }; };
  c.mode = c.mode || '1';
  if (!c.p1 || !ok(c.p1.key)) c.p1 = mkp('plant.T', 8);
  if (!c.p2 || !ok(c.p2.key)) { const k = (knobs.find(x => /\.DOsp$/.test(x.key)) || knobs.find(x => /^u\..*\.Q$/.test(x.key)) || knobs[1]).key; c.p2 = mkp(k, 4); }
  if (!c.sc) c.sc = { keys: [c.p1.key, c.p2.key], rows: [] };
  c.sc.keys = c.sc.keys.filter(ok);
  if (!c.sc.rows.length) {
    c.sc.rows = [{ name: 'Cơ sở', vals: c.sc.keys.map(k => +(+knobGet(P, k)).toPrecision(5)) },
      { name: 'Kịch bản 1', vals: c.sc.keys.map(k => +(+knobGet(P, k) * 0.8).toPrecision(5)) },
      { name: 'Kịch bản 2', vals: c.sc.keys.map(k => +(+knobGet(P, k) * 1.2).toPrecision(5)) }];
  }
  const outs = outputList(P).map(o => o.key);
  c.outs = (c.outs || ['eff.NH4', 'eff.NOx', 'eff.TN'].concat(m.fam === 'ASM2d' ? ['eff.TP'] : [])).filter(k => outs.includes(k));
  if (!c.outs.length) c.outs = ['eff.NH4'];
  if (!outs.includes(c.main)) c.main = c.outs[0];
  c.axis = c.axis || 'auto'; c.nW = c.nW || 'auto'; c.acc = c.acc || 'std';
  return c;
}
// khoảng quét mặc định: nhiệt độ 12–32 °C; giá trị 0 → 0…1 (tránh khoảng rỗng); còn lại ±50 %
function sensRange(P, key) {
  if (key === 'plant.T' || /\.Tloc$/.test(key)) return [12, 32];
  const v = +knobGet(P, key);
  if (!isFinite(v) || Math.abs(v) < 1e-12) return [0, 1];
  return [+(v * 0.5).toPrecision(4), +(v * 1.5).toPrecision(4)];
}
const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => +(n === 1 ? a : a + (b - a) * i / (n - 1)).toPrecision(8));

/* danh sách điểm & các đoạn chạy liên tục (cho song song) */
function sensPlan(P, c, nW) {
  const base = k => +knobGet(P, k);
  if (c.mode === 'sc') {
    const pts = c.sc.rows.map((r, i) => ({ idx: i, kv: c.sc.keys.map((k, j) => [k, +r.vals[j]]).filter(x => isFinite(x[1])) }));
    return { pts, chunks: pts.map(p => [p]), dims: { rows: c.sc.rows.length } };
  }
  const A = linspace(+c.p1.from, +c.p1.to, Math.max(2, Math.round(+c.p1.n))), bA = base(c.p1.key);
  const nrm = (v, p) => (v - p.from) / ((p.to - p.from) || 1);
  let path = [];
  if (c.mode === '1') path = A.map((v, i) => ({ idx: i, kv: [[c.p1.key, v]], xn: [nrm(v, c.p1)], cs: [i] }));
  else {
    const B = linspace(+c.p2.from, +c.p2.to, Math.max(2, Math.round(+c.p2.n)));
    // đường "rắn bò" qua lưới: hàng chẵn A tăng, hàng lẻ A giảm → các điểm liền nhau chỉ khác một bước
    B.forEach((vb, j) => { const row = A.map((va, i) => ({ idx: j * A.length + i, kv: [[c.p1.key, va], [c.p2.key, vb]], xn: [nrm(va, c.p1), nrm(vb, c.p2)], cs: [i, j] })); path = path.concat(j % 2 ? row.reverse() : row); });
  }
  const bx = c.mode === '1' ? [nrm(bA, c.p1)] : [nrm(bA, c.p1), nrm(base(c.p2.key), c.p2)];
  const dist = p => Math.hypot(...p.xn.map((v, k) => v - bx[k]));
  const nCh = Math.max(1, Math.min(nW, path.length));   // dùng hết các luồng; nhiều điểm hơn số luồng → mỗi đoạn đi liên tục, khởi động dự báo
  const size = Math.ceil(path.length / nCh), chunks = [];
  for (let s = 0; s < path.length; s += size) {
    let ch = path.slice(s, s + size);
    if (dist(ch[ch.length - 1]) < dist(ch[0])) ch = ch.reverse();   // bắt đầu từ đầu gần điểm cơ sở
    chunks.push(ch);
  }
  return { pts: path, chunks, dims: { A, B: c.mode === '2' ? linspace(+c.p2.from, +c.p2.to, Math.max(2, Math.round(+c.p2.n))) : null } };
}

/* ---------------- giao diện ---------------- */
function renderTools() {
  const box = $('#tab-tools'); if (APP.running && box.childElementCount) return;
  box.innerHTML = '';
  const P = APP.P, c = sensCfg(P), maxW = SENS.maxWorkers();
  const c1 = el(`<div class="card"><h2>Phân tích độ nhạy / kịch bản</h2>
    <p class="small muted">Tính trạng thái ổn định cho từng điểm. Chạy song song trên nhiều luồng (mỗi luồng một đoạn liên tục của đường quét, khởi động từ trạng thái dự báo theo các điểm trước). Kiểu "Hai thông số" quét lưới và vẽ họ đường cong / bản đồ màu; kiểu "Kịch bản" đổi nhiều thông số cùng lúc.</p>
    <div class="row"><label>Kiểu phân tích <select id="sMode"><option value="1">Một thông số</option><option value="2">Hai thông số (lưới)</option><option value="sc">Kịch bản – nhiều thông số đổi cùng lúc</option></select></label><span class="small muted" id="sCount"></span></div>
    <div id="sCfg" style="margin-top:8px"></div>
    <div class="row" style="margin-top:10px"><label>Luồng tính song song <select id="sW"><option value="auto">Tự động (${maxW})</option>${Array.from({ length: maxW }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
    <label>Độ chính xác <select id="sAcc"><option value="std">Chuẩn (dung sai 2·10⁻⁴)</option><option value="fast">Nhanh (dung sai 10⁻³)</option></select></label>
    <button class="pri" id="kRun">▶ Chạy</button><button id="kStop" disabled>■ Dừng</button></div>
    <div class="progress" style="margin:10px 0"><div id="kProg"></div></div><div id="kMsg" class="small muted"></div></div>`);
  box.appendChild(c1);
  const save = () => { saveLocal(); };
  const mode = $('#sMode'); mode.value = c.mode;
  mode.onchange = () => { c.mode = mode.value; save(); renderSensCfg(); };
  $('#sW').value = c.nW; $('#sW').onchange = e => { c.nW = e.target.value; save(); };
  $('#sAcc').value = c.acc; $('#sAcc').onchange = e => { c.acc = e.target.value; save(); };
  $('#kRun').onclick = () => runSensAll();
  $('#kStop').onclick = () => (APP.abortFlag = true);
  renderSensCfg();
  box.appendChild(el(`<div class="card" id="sRes"></div>`));
  drawSensAll();

  // ---------------- SPA
  const cls = P.units.filter(u => u.type === 'clarifier');
  const c2 = el(`<div class="card"><h2>Phân tích thông lượng chất rắn (State Point Analysis) – bể lắng</h2>
    ${cls.length ? `<div class="row"><label>Bể lắng <select id="spaU">${cls.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label><span class="small muted">Số liệu lấy từ kết quả ổn định (nếu có) và thông số lắng Takács của bể; có thể sửa để thử.</span></div>
    <div class="frm wide" id="spaF" style="max-width:640px;margin-top:10px"></div><div id="spaRes" style="margin-top:10px"></div>
    <div class="grid2"><div class="chartBox" style="height:340px"><canvas id="spaChart"></canvas></div><div class="chartBox" style="height:340px"><canvas id="vsChart"></canvas></div></div>` : '<p>Sơ đồ chưa có bể lắng thứ cấp.</p>'}</div>`);
  box.appendChild(c2);
  if (cls.length) { $('#spaU').onchange = () => spaInit(); spaInit(); }
  if (typeof SCEN !== 'undefined') SCEN.card(box);           // kịch bản sự cố (js/scen.js)
  if (typeof CALIB !== 'undefined') CALIB.card(box);         // hiệu chỉnh theo số liệu vận hành (js/calib.js)
}

function renderSensCfg() {
  const P = APP.P, c = sensCfg(P), knobs = knobList(P), box = $('#sCfg');
  const opts = sel => knobs.map(k => `<option value="${k.key}"${k.key === sel ? ' selected' : ''}>${esc(k.name)}${k.u ? ' [' + k.u + ']' : ''}</option>`).join('');
  const count = () => { const n = c.mode === 'sc' ? c.sc.rows.length : c.mode === '1' ? Math.round(+c.p1.n) : Math.round(+c.p1.n) * Math.round(+c.p2.n); $('#sCount').textContent = 'Tổng ' + n + ' điểm tính' + (n > 120 ? ' – nhiều, sẽ lâu' : ''); };
  if (c.mode !== 'sc') {
    const row = (p, lab, id) => `<div class="row" style="margin-bottom:6px"><b style="min-width:150px">${lab}</b><select data-p="${id}" data-k="key" style="max-width:420px">${opts(p.key)}</select>
      <label>từ <input type="number" step="any" data-p="${id}" data-k="from" value="${p.from}" style="width:100px"></label><label>đến <input type="number" step="any" data-p="${id}" data-k="to" value="${p.to}" style="width:100px"></label>
      <label>số điểm <input type="number" data-p="${id}" data-k="n" value="${p.n}" style="width:60px"></label><span class="small muted">hiện tại ${fmt(knobGet(P, p.key))}</span></div>`;
    box.innerHTML = row(c.p1, c.mode === '2' ? 'Thông số 1 (trục hoành)' : 'Thông số', 'p1') + (c.mode === '2' ? row(c.p2, 'Thông số 2 (họ đường cong)', 'p2') : '');
    box.querySelectorAll('[data-p]').forEach(inp => (inp.onchange = () => {
      const p = c[inp.dataset.p], k = inp.dataset.k;
      if (k === 'key') { p.key = inp.value; [p.from, p.to] = sensRange(P, p.key); saveLocal(); renderSensCfg(); return; }
      p[k] = +inp.value; saveLocal(); count();
    }));
  } else {
    const keys = c.sc.keys;
    let h = `<div class="row" style="margin-bottom:6px"><label>Thêm thông số thay đổi <select id="scAdd" style="max-width:420px">${opts('')}</select></label><button id="scAddB">+ Thêm cột</button></div>
      <div class="tscroll"><table class="t" id="scTab"><tr><th class="l">Kịch bản</th>${keys.map((k, j) => { const kn = knobs.find(x => x.key === k); return `<th style="white-space:normal;min-width:110px">${esc(kn ? kn.name : k)}${kn && kn.u ? ' [' + kn.u + ']' : ''} <a href="#" data-del="${j}" title="Bỏ cột">✕</a></th>`; }).join('')}<th></th></tr>`;
    c.sc.rows.forEach((r, i) => { h += `<tr><td><input type="text" data-r="${i}" data-n="1" value="${esc(r.name)}" style="width:130px"></td>${keys.map((k, j) => `<td><input type="number" step="any" data-r="${i}" data-j="${j}" value="${r.vals[j] ?? ''}" style="width:100px"></td>`).join('')}<td><a href="#" data-rm="${i}" title="Xóa kịch bản">✕</a></td></tr>`; });
    h += `<tr><td class="small muted">hiện tại</td>${keys.map(k => `<td class="small muted">${fmt(knobGet(P, k))}</td>`).join('')}<td></td></tr></table></div>
      <div class="btnrow"><button id="scRow">+ Thêm kịch bản</button><button id="scDup">Nhân bản dòng cuối</button><button id="scCur">Thêm dòng = giá trị hiện tại</button></div>`;
    box.innerHTML = h;
    box.querySelector('#scAddB').onclick = () => { const k = box.querySelector('#scAdd').value; if (!keys.includes(k)) { keys.push(k); c.sc.rows.forEach(r => r.vals.push(+(+knobGet(P, k)).toPrecision(5))); } saveLocal(); renderSensCfg(); };
    box.querySelectorAll('[data-del]').forEach(a => (a.onclick = e => { e.preventDefault(); const j = +a.dataset.del; keys.splice(j, 1); c.sc.rows.forEach(r => r.vals.splice(j, 1)); saveLocal(); renderSensCfg(); }));
    box.querySelectorAll('[data-rm]').forEach(a => (a.onclick = e => { e.preventDefault(); c.sc.rows.splice(+a.dataset.rm, 1); saveLocal(); renderSensCfg(); }));
    box.querySelectorAll('input[data-r]').forEach(inp => (inp.onchange = () => { const r = c.sc.rows[+inp.dataset.r]; if (inp.dataset.n) r.name = inp.value; else r.vals[+inp.dataset.j] = inp.value === '' ? null : +inp.value; saveLocal(); }));
    box.querySelector('#scRow').onclick = () => { c.sc.rows.push({ name: 'Kịch bản ' + c.sc.rows.length, vals: keys.map(k => +(+knobGet(P, k)).toPrecision(5)) }); saveLocal(); renderSensCfg(); };
    box.querySelector('#scDup').onclick = () => { const l = c.sc.rows[c.sc.rows.length - 1]; c.sc.rows.push({ name: (l ? l.name : 'Kịch bản') + ' (2)', vals: l ? l.vals.slice() : keys.map(k => knobGet(P, k)) }); saveLocal(); renderSensCfg(); };
    box.querySelector('#scCur').onclick = () => { c.sc.rows.push({ name: 'Hiện tại', vals: keys.map(k => +(+knobGet(P, k)).toPrecision(6)) }); saveLocal(); renderSensCfg(); };
  }
  count();
}

/* ---------------- chạy ---------------- */
async function runSensAll() {
  if (APP.running) return;
  const P0 = normalizeProject(JSON.parse(JSON.stringify(APP.P))), c = sensCfg(APP.P);
  const nW = c.nW === 'auto' ? SENS.maxWorkers() : Math.max(1, +c.nW);
  const plan = sensPlan(P0, c, nW);
  const n = plan.pts.length;
  if (!n) return;
  const t0 = performance.now();
  const S = TOOLS.sens = { cfg: JSON.parse(JSON.stringify(c)), plan, res: new Array(n).fill(null), base: null, prog: {}, done: 0, t0, P: P0 };
  // nút có thể chưa có (thẻ Công cụ chưa mở / đã vẽ lại) – không để lỗi giao diện làm kẹt APP.running
  const btn = (id, v) => { const b = $(id); if (b) b.disabled = v; };
  APP.running = true; APP.abortFlag = false; btn('#kRun', true); btn('#kStop', false);
  const msg = t => { const m = $('#kMsg'); if (m) m.textContent = t; };
  const bar = () => { const p = $('#kProg'); if (!p) return; let s = S.done; for (const k in S.prog) s += S.prog[k]; p.style.width = Math.min(100, s / n * 100) + '%'; };
  const common = { P: P0, y0: null, sig0: null, opt: { tol: c.acc === 'fast' ? 1e-3 : 2e-4, maxT: 1500, NA: 288 } };
  try {
    // điểm cơ sở: dùng kết quả ổn định hiện có, nếu không thì tính trước (để khởi động nóng mọi đoạn và làm mốc so sánh)
    const sys0 = compilePlant(P0);
    if (sys0.errors.length) throw new Error(sys0.errors[0]);
    if (APP.ss && !APP.stale && APP.ss.sys.layoutSig === sys0.layoutSig) {
      S.base = outputsOf(APP.ss.sys, APP.ss.det); common.y0 = Float64Array.from(APP.ss.y); common.sig0 = sys0.layoutSig;
    } else {
      msg('Tính trạng thái ổn định cơ sở (làm điểm khởi động cho các luồng)…');
      await SENS.run([[{ idx: -1, kv: [] }]], Object.assign({}, common, { opt: Object.assign({}, common.opt, { wantY: true }) }), 1, m => {
        if (m.type === 'prog') { S.prog.base = Math.min(0.99, m.t / 300); bar(); }
        if (m.type === 'pt' && !m.err) { S.base = m.out; common.y0 = m.y; common.sig0 = m.sig; }
        if (m.type === 'pt' && m.err) S.baseErr = m.err;
      }, () => APP.abortFlag);
      delete S.prog.base;
      if (S.baseErr) msg('⚠ Điểm cơ sở không tính được (' + S.baseErr + ') – các điểm khởi động từ trạng thái mặc định.');
    }
    let lastDraw = 0;
    msg(`Đang tính ${n} điểm…`);
    const r = await SENS.run(plan.chunks, common, nW, m => {
      if (m.type === 'prog') { S.prog[m.idx] = Math.min(0.95, m.t / 300); bar(); return; }
      delete S.prog[m.idx];
      S.res[m.idx] = m.err ? { _err: m.err } : Object.assign(m.out, { _conv: m.conv, _ms: m.ms, _start: m.start });
      S.done++; bar();
      const el_ = (performance.now() - t0) / 1000, eta = S.done ? el_ / S.done * (n - S.done) : NaN;
      msg(`${S.done}/${n} điểm xong · ${el_.toFixed(0)} s${S.done < n ? ' · còn khoảng ' + eta.toFixed(0) + ' s' : ''}${m.err ? ' · ⚠ điểm ' + (m.idx + 1) + ': ' + m.err : ''}`);
      if (performance.now() - lastDraw > 700) { lastDraw = performance.now(); drawSensAll(); }
    }, () => APP.abortFlag);
    const dt = (performance.now() - t0) / 1000;
    S.time = dt; S.mode = r.mode; S.nW = r.workers || 1;
    msg((r.aborted ? 'Đã dừng – ' : 'Hoàn tất – ') + `${S.done}/${n} điểm trong ${dt.toFixed(1)} s · ${r.mode === 'worker' ? r.workers + ' luồng song song' : 'luồng chính (tuần tự)' + (SENS.lastErr ? ' – không tạo được luồng phụ: ' + SENS.lastErr : '')} · ${(S.done / dt * 60).toFixed(1)} điểm/phút`);
  } catch (e) { msg('✖ ' + e.message); }
  APP.running = false; APP.abortFlag = false;
  btn('#kRun', false); btn('#kStop', true);
  bar(); try { drawSensAll(); } catch (e) { msg('✖ vẽ kết quả: ' + e.message); }
}

/* ---------------- đồ thị & bảng ---------------- */
function sensLimits(P) {
  const L = {};
  if (typeof FIX !== 'undefined') { const F = FIX.limits(P); for (const k in F) L['eff.' + k] = +F[k]; return L; }   // cùng giới hạn với tab Kết quả
  const D = P.design;
  if (D && D.targets) for (const t of D.targets) if (t.lim != null && t.m === 'eff') L['eff.' + t.k] = +t.lim;
  return L;
}
function drawSensAll() {
  const box = $('#sRes'); if (!box) return;
  const S = TOOLS.sens, P = APP.P, c = sensCfg(P), outs = outputList(P), knobs = knobList(P);
  if (!S || !S.res.some(Boolean)) { box.innerHTML = '<h2>Kết quả</h2><p class="muted">Chưa có kết quả – bấm "▶ Chạy".</p>'; return; }
  const sc = S.cfg, mode = sc.mode, lims = sensLimits(P);
  const oOf = k => outs.find(o => o.key === k) || { key: k, name: k, short: k, u: '' };
  const kn = k => knobs.find(x => x.key === k) || { name: k, u: '' };
  const selOuts = c.outs.map(oOf);
  // khung
  if (!box._built || box._mode !== mode) {
    box._built = true; box._mode = mode;
    box.innerHTML = `<h2>Kết quả</h2>
      <div class="row" style="align-items:flex-start"><div><b>Chỉ tiêu hiển thị</b> <span class="small muted">(chọn nhiều)</span><div id="sOuts" style="display:flex;flex-wrap:wrap;gap:4px 10px;max-width:860px;max-height:96px;overflow:auto;margin-top:4px"></div></div></div>
      <div class="row" style="margin-top:6px"><label>Trục tung <select id="sAxis"><option value="auto">Tự động – 2 trục theo đơn vị (giá trị thật)</option><option value="pct">% so với điểm cơ sở</option><option value="mm">Chuẩn hóa 0–1 (nhỏ nhất – lớn nhất)</option></select></label>
      ${mode === '2' ? `<label>Lát cắt theo ${esc(kn(sc.p2.key).name)} = <select id="sSlice"></select></label>` : ''}</div>
      <h3>${mode === 'sc' ? 'So sánh các kịch bản – nhiều chỉ tiêu trên một biểu đồ' : 'Nhiều chỉ tiêu trên một biểu đồ'}</h3><div class="chartBox" style="height:360px"><canvas id="kChart"></canvas></div><div id="kNote" class="small muted"></div>
      ${mode === '2' ? `<h3>Đa thông số – họ đường cong & bản đồ màu</h3><div class="row"><label>Chỉ tiêu <select id="sMain">${outs.map(o => `<option value="${o.key}">${esc(o.name)} [${o.u}]</option>`).join('')}</select></label><span class="small muted">Ô viền đỏ: vượt giới hạn xả (nếu sơ đồ dựng từ bản tính).</span></div>
        <div class="grid2"><div class="chartBox" style="height:360px"><canvas id="kFam"></canvas></div><div class="chartBox" style="height:360px"><canvas id="kHeat"></canvas></div></div>` : ''}
      ${mode === 'sc' ? `<h3>Thông số thay đổi trong các kịch bản (% so với giá trị hiện tại)</h3><div class="chartBox" style="height:280px"><canvas id="kScP"></canvas></div>` : ''}
      <div class="row" style="margin-top:8px"><button id="kCsv">Xuất CSV</button></div>
      <div id="kTable" class="tscroll" style="margin-top:8px;max-height:360px"></div>`;
    const so = box.querySelector('#sOuts');
    so.innerHTML = outs.map(o => `<label class="small" style="white-space:nowrap"><input type="checkbox" value="${o.key}"${c.outs.includes(o.key) ? ' checked' : ''}> ${esc(o.short)}</label>`).join('');
    so.querySelectorAll('input').forEach(i => (i.onchange = () => { c.outs = [...so.querySelectorAll('input:checked')].map(x => x.value); if (!c.outs.length) { c.outs = [i.value]; i.checked = true; } saveLocal(); drawSensAll(); }));
    box.querySelector('#sAxis').value = c.axis; box.querySelector('#sAxis').onchange = e => { c.axis = e.target.value; saveLocal(); drawSensAll(); };
    if (mode === '2') { box.querySelector('#sMain').value = c.main; box.querySelector('#sMain').onchange = e => { c.main = e.target.value; saveLocal(); drawSensAll(); }; }
    box.querySelector('#kCsv').onclick = () => sensCsv();
    TOOLS.chart = mode === 'sc' ? new BarChart(box.querySelector('#kChart')) : new LineChart(box.querySelector('#kChart'), { zero: false, headroom: 0.04 });
    if (mode === '2') { TOOLS.fam = new LineChart(box.querySelector('#kFam'), { zero: false, headroom: 0.04 });TOOLS.heat = new HeatMap(box.querySelector('#kHeat')); }
    if (mode === 'sc') TOOLS.scp = new BarChart(box.querySelector('#kScP'));
  }
  // giá trị theo kiểu trục
  const base = S.base || {};
  const tf = (o, ys) => {
    if (c.axis === 'pct') { const b = base[o.key]; return ys.map(v => isFinite(b) && Math.abs(b) > 1e-12 ? v / b * 100 : NaN); }
    if (c.axis === 'mm') { const f = ys.filter(isFinite), a = Math.min(...f), b = Math.max(...f); return ys.map(v => b > a ? (v - a) / (b - a) : 0.5); }
    return ys;
  };
  // nhóm trục: mọi nồng độ (mg/L, mgN/L, mgP/L, mgCOD/L…) chung trục trái, đại lượng khác sang trục phải
  const ug = u => /^mg/i.test(u) ? 'mg/L' : u;
  const groups = [...new Set(selOuts.map(o => ug(o.u)))], u1 = groups[0], u2 = groups.find(u => u !== u1);
  const units = [...new Set(selOuts.map(o => o.u))];
  const unitsOf = g => [...new Set(selOuts.filter(o => ug(o.u) === g).map(o => o.u))].join(', ');
  const yl = c.axis === 'pct' ? '% so với điểm cơ sở' : c.axis === 'mm' ? 'Chuẩn hóa 0–1' : unitsOf(u1);
  const val = (i, k) => S.res[i] ? S.res[i][k] : NaN;
  if (mode === '1' || mode === '2') {
    const A = S.plan.dims.A, nA = A.length;
    let j = 0;
    if (mode === '2') {
      const B = S.plan.dims.B, ss = box.querySelector('#sSlice');
      if (ss.options.length !== B.length) ss.innerHTML = B.map((v, k) => `<option value="${k}">${fmt(v)}</option>`).join('');
      j = Math.min(+(ss.value || 0), B.length - 1); ss.value = j; ss.onchange = () => drawSensAll();
    }
    const series = [];
    selOuts.forEach((o, k) => {
      const raw = A.map((_, i) => val(j * nA + i, o.key)), y = tf(o, raw), col = PALETTE[k % PALETTE.length];
      const y2 = c.axis === 'auto' && ug(o.u) !== u1;
      series.push({ label: o.short + (c.axis === 'auto' ? ' [' + o.u + ']' : ''), x: A, y, marks: true, color: col, y2, raw, rawU: o.u });
      const lim = lims[o.key];
      if (lim != null && c.axis !== 'mm') { const ly = c.axis === 'pct' ? (isFinite(base[o.key]) ? lim / base[o.key] * 100 : NaN) : lim; if (isFinite(ly)) series.push({ label: 'Giới hạn ' + o.short, x: [A[0], A[nA - 1]], y: [ly, ly], dash: [6, 4], color: col, width: 1.2, y2 }); }
    });
    // điểm cơ sở (nếu nằm trong khoảng quét)
    const bx = +knobGet(S.P, sc.p1.key);
    if (S.base && bx >= Math.min(A[0], A[nA - 1]) && bx <= Math.max(A[0], A[nA - 1]) && (mode === '1')) selOuts.forEach((o, k) => series.push({ label: 'cơ sở', x: [bx], y: tf(o, [S.base[o.key]]), points: true, r: 5, color: PALETTE[k % PALETTE.length], nolegend: true, y2: c.axis === 'auto' && ug(o.u) !== u1 }));
    TOOLS.chart.set(series, { xlabel: kn(sc.p1.key).name + (kn(sc.p1.key).u ? ' [' + kn(sc.p1.key).u + ']' : '') + (mode === '2' ? ` · ${kn(sc.p2.key).name} = ${fmt(S.plan.dims.B[j])}` : ''), ylabel: yl, y2label: c.axis === 'auto' && u2 ? groups.slice(1).map(unitsOf).join(', ') : '', zero: c.axis === 'auto' ? false : false });
    if (mode === '2') {
      const B = S.plan.dims.B, o = oOf(c.main), lim = lims[o.key];
      const fam = B.map((vb, jj) => ({ label: kn(sc.p2.key).name.split(': ').pop() + ' = ' + fmt(vb), x: A, y: A.map((_, i) => val(jj * nA + i, o.key)), marks: true }));
      if (lim != null) fam.push({ label: 'Giới hạn', x: [A[0], A[nA - 1]], y: [lim, lim], dash: [6, 4], color: '#111', width: 1.2 });
      TOOLS.fam.set(fam, { xlabel: kn(sc.p1.key).name + (kn(sc.p1.key).u ? ' [' + kn(sc.p1.key).u + ']' : ''), ylabel: o.name + ' [' + o.u + ']' });
      TOOLS.heat.set({ xs: A, ys: B, z: B.map((_, jj) => A.map((_, i) => val(jj * nA + i, o.key))), xlabel: kn(sc.p1.key).name, ylabel: kn(sc.p2.key).name, zlabel: o.short + ' [' + o.u + ']', lim });
    }
  } else {
    // kịch bản: cột nhóm (thang chung) – khác đơn vị ở chế độ "tự động" → chuyển sang % so với kịch bản đầu
    const rows = sc.sc.rows, cats = rows.map(r => r.name);
    let ax = c.axis;
    if (ax === 'auto' && groups.length > 1) ax = 'pct0';
    const ser = selOuts.map((o, k) => {
      const raw = rows.map((_, i) => val(i, o.key));
      let v = raw;
      if (ax === 'pct0') { const b = raw[0]; v = raw.map(x => isFinite(b) && Math.abs(b) > 1e-12 ? x / b * 100 : NaN); }
      else if (ax !== 'auto') v = tf(o, raw);
      return { label: o.short + (ax === 'auto' ? ' [' + o.u + ']' : ''), v, raw, rawU: o.u, color: PALETTE[k % PALETTE.length] };
    });
    const ylab = ax === 'pct0' ? '% so với "' + (rows[0] ? rows[0].name : '') + '"' :ax === 'auto' ? unitsOf(u1) : yl;
    TOOLS.chart.set({ cats, series: ser }, { ylabel: ylab, ref: ax === 'pct0' || ax === 'pct' ? 100 : undefined });
    box.querySelector('#kNote').textContent = ax === 'pct0' ? `Các chỉ tiêu đã chọn có đơn vị khác nhau (${units.join('; ')}) nên cột được quy về % so với kịch bản đầu tiên; giá trị thật xem khi rê chuột hoặc trong bảng.` : '';
    const keys = sc.sc.keys;
    TOOLS.scp.set({ cats, series: keys.map((k, j) => { const b = +knobGet(S.P, k); const raw = rows.map(r => +r.vals[j]); return { label: kn(k).name.split(': ').pop(), v: raw.map(x => isFinite(b) && b !== 0 ? x / b * 100 : NaN), raw, rawU: kn(k).u }; }) }, { ylabel: '% so với giá trị hiện tại', ref: 100 });
  }
  // bảng
  const pk = mode === 'sc' ? sc.sc.keys : mode === '1' ? [sc.p1.key] : [sc.p1.key, sc.p2.key];
  let h = `<table class="t"><tr>${mode === 'sc' ? '<th class="l">Kịch bản</th>' : ''}${pk.map(k => `<th style="white-space:normal">${esc(kn(k).name)}</th>`).join('')}${outs.map(x => `<th title="${x.u}" style="white-space:normal">${x.short} <span class="muted">${x.u}</span></th>`).join('')}<th>s</th></tr>`;
  if (S.base) h += `<tr style="background:#f1f5f9">${mode === 'sc' ? '<td class="l"><i>hiện tại (cơ sở)</i></td>' : ''}${pk.map(k => `<td><i>${fmt(knobGet(S.P, k))}</i></td>`).join('')}${outs.map(x => `<td><i>${fmt(S.base[x.key])}</i></td>`).join('')}<td></td></tr>`;
  const order = mode === 'sc' ? S.plan.pts.map(p => p.idx) : S.plan.pts.map(p => p.idx).sort((a, b) => a - b);
  for (const i of order) {
    const p = S.plan.pts.find(q => q.idx === i), r = S.res[i];
    const pv = mode === 'sc' ? pk.map((k, j) => sc.sc.rows[i].vals[j]) : p.kv.map(x => x[1]);
    h += `<tr>${mode === 'sc' ? `<td class="l">${esc(sc.sc.rows[i].name)}</td>` : ''}${pv.map(v => `<td><b>${fmt(v)}</b></td>`).join('')}`;
    if (!r) h += `<td colspan="${outs.length + 1}" class="muted l">…</td>`;
    else if (r._err) h += `<td colspan="${outs.length + 1}" class="l" style="color:var(--bad)">✖ ${esc(r._err)}</td>`;
    else h += outs.map(x => { const lim = lims[x.key], v = r[x.key]; return `<td${lim != null && v > lim ? ' style="color:var(--bad);font-weight:600"' : ''}>${fmt(v)}</td>`; }).join('') + `<td class="small muted" title="khởi động: ${r._start}">${(r._ms / 1000).toFixed(1)}${r._conv ? '' : ' ⚠'}</td>`;
    h += '</tr>';
  }
  box.querySelector('#kTable').innerHTML = h + '</table>';
}
function sensCsv() {
  const S = TOOLS.sens; if (!S) return;
  const P = APP.P, outs = outputList(P), knobs = knobList(P), sc = S.cfg, mode = sc.mode;
  const kn = k => (knobs.find(x => x.key === k) || { name: k }).name;
  const pk = mode === 'sc' ? sc.sc.keys : mode === '1' ? [sc.p1.key] : [sc.p1.key, sc.p2.key];
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [(mode === 'sc' ? [q('Kịch bản')] : []).concat(pk.map(k => q(kn(k)))).concat(outs.map(o => q(o.name + ' [' + o.u + ']'))).join(',')];
  S.plan.pts.slice().sort((a, b) => a.idx - b.idx).forEach(p => {
    const r = S.res[p.idx] || {};
    const pv = mode === 'sc' ? pk.map((k, j) => sc.sc.rows[p.idx].vals[j]) : p.kv.map(x => x[1]);
    lines.push((mode === 'sc' ? [q(sc.sc.rows[p.idx].name)] : []).concat(pv).concat(outs.map(o => r[o.key] != null && isFinite(r[o.key]) ? +(+r[o.key]).toPrecision(6) : '')).join(','));
  });
  downloadText(mode === 'sc' ? 'kich_ban.csv' : 'do_nhay.csv', '﻿' + lines.join('\n'), 'text/csv');
}

/* ---------------- SPA ---------------- */
function spaInit() {
  const id = $('#spaU').value, u = unitById(id);
  const st = { A: +u.p.A, Qin: 20000, Qu: 10000, Xf: 3500, v0: +u.p.v0, v0max: +u.p.v0max, rh: +u.p.rh, rp: +u.p.rp, fns: +u.p.fns };
  const d = APP.ss && APP.ss.sys.byId[id] ? APP.ss : null;
  if (d) { const info = d.det.U[id], cu = d.sys.byId[id]; st.Qin = info.Qin; st.Qu = d.det.Q[cu.outs.und]; st.Xf = info.TSSin; }
  else { const Qi = APP.P.units.filter(x => x.type === 'influent').reduce((s, x) => s + (+x.p.Q || 0), 0); st.Qu = u.p.uMode === 'Q' ? +u.p.uQ : u.p.uMode === 'rQ' ? (+u.p.uK) * Qi : st.Qin * (+u.p.uR); }
  TOOLS.spa = st;
  const f = $('#spaF'); f.innerHTML = '';
  f.appendChild(buildForm([
    { k: 'A', l: 'Diện tích', u: 'm²', t: 'num' }, { k: 'Qin', l: 'Lưu lượng vào bể lắng', u: 'm³/d', t: 'num' }, { k: 'Qu', l: 'Lưu lượng dòng đáy', u: 'm³/d', t: 'num' },
    { k: 'Xf', l: 'MLSS cấp vào', u: 'mg/L', t: 'num' }, { k: 'v0', l: 'v₀', u: 'm/d', t: 'num' }, { k: 'v0max', l: "v₀'", u: 'm/d', t: 'num' },
    { k: 'rh', l: 'r_h', u: 'm³/g', t: 'num' }, { k: 'rp', l: 'r_p', u: 'm³/g', t: 'num' }
  ], st, () => spaDraw(), { wide: true }));
  spaDraw();
}
function spaDraw() {
  const s = TOOLS.spa, Xmin = s.fns * s.Xf;
  const vs = X => Math.max(0, Math.min(s.v0max, s.v0 * (Math.exp(-s.rh * (X - Xmin)) - Math.exp(-s.rp * (X - Xmin)))));
  const Xmax = Math.max(15000, s.Xf * 3);
  const xs = [], G = [], V = [], Jt = [];
  const vu = s.Qu / s.A, vo = (s.Qin - s.Qu) / s.A; // m/d
  for (let i = 0; i <= 400; i++) {
    const X = Xmax * i / 400; xs.push(X / 1000);
    const g = vs(X) * X / 1000 / 24; G.push(g); V.push(vs(X) / 24); Jt.push(g + vu * X / 1000 / 24);
  }
  const SF = s.Qin * s.Xf / 1000 / s.A / 24;                 // tải chất rắn áp dụng kg/m²/h
  let ipk = 0; G.forEach((g, i) => { if (g > G[ipk]) ipk = i; });
  let JL = Infinity, XL = NaN;
  for (let i = ipk + 1; i < Jt.length - 1; i++) if (Jt[i] <= Jt[i - 1] && Jt[i] <= Jt[i + 1] && Jt[i] < JL) { JL = Jt[i]; XL = xs[i]; }
  const Xu = s.Qu > 0 ? s.Qin * s.Xf / s.Qu : NaN;
  const ov = xs.map(x => vo * x / 24), un = xs.map(x => SF - vu * x / 24);
  // kiểm tra: đường dòng đáy có cắt đường cong thông lượng trọng lực không (quá tải nén)
  let thick = 'Đạt';
  for (let i = 0; i < xs.length; i++) if (xs[i] * 1000 > s.Xf && un[i] > G[i] + 1e-9 && un[i] > 0 && i > ipk) { thick = 'Quá tải nén (đường dòng đáy nằm trên đường cong)'; break; }
  const clar = vo / 24 < V[Math.min(V.length - 1, Math.round(s.Xf / Xmax * 400))] ? 'Đạt' : 'Quá tải lắng trong (tải bề mặt > vận tốc lắng tại MLSS)';
  $('#spaRes').innerHTML = `<div class="kpis">
    ${kpi('Tải bề mặt (tràn)', vo / 24, 'm/h')}${kpi('Vận tốc dòng đáy', vu / 24, 'm/h')}${kpi('Tải chất rắn áp dụng', SF, 'kg/m²/h')}
    ${kpi('Thông lượng giới hạn', JL, 'kg/m²/h')}${kpi('Tỷ lệ tải / giới hạn', isFinite(JL) ? SF / JL * 100 : NaN, '%')}${kpi('TSS dòng đáy (cân bằng)', Xu, 'mg/L')}
    </div><div class="msg ${clar === 'Đạt' ? 'ok' : 'err'}">Vùng lắng trong: ${clar}</div><div class="msg ${thick === 'Đạt' ? 'ok' : 'err'}">Vùng nén: ${thick}</div>`;
  const cv = $('#spaChart'); if (!cv._ch) cv._ch = new LineChart(cv, {});
  const ymax = Math.max(SF * 1.6, Math.max(...G) * 1.2);
  cv._ch.set([
    { label: 'Thông lượng trọng lực G(X)', x: xs, y: G },
    { label: 'Đường tràn (Qe/A)·X', x: xs, y: ov, dash: [6, 4] },
    { label: 'Đường dòng đáy', x: xs, y: un, dash: [6, 4] },
    { label: 'Điểm trạng thái', x: [s.Xf / 1000], y: [vo * s.Xf / 1000 / 24], points: true, r: 6, color: '#111' }
  ], { xlabel: 'Nồng độ chất rắn X (kg/m³)', ylabel: 'Thông lượng (kg/m²/h)', ymin: 0, ymax });
  const cv2 = $('#vsChart'); if (!cv2._ch) cv2._ch = new LineChart(cv2, {});
  cv2._ch.set([{ label: 'Vận tốc lắng Takács vs(X)', x: xs, y: V, color: '#7c3aed' }], { xlabel: 'X (kg/m³)', ylabel: 'vs (m/h)' });
}
