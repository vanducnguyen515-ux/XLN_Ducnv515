'use strict';
/* ==========================================================================
   SimNước – Giao diện chính
   ========================================================================== */
const WAPP = { P: null, ss: null, dyn: null, running: false, abort: false, stale: false, view: { ds: 'ss', tIdx: -1, series: [], overlay: true, src: null, full: false, std: {} } };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function fmt(v) {
  if (v === undefined || v === null || typeof v !== 'number' || !isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a < 1e-6) return '0';
  if (a < 0.001) return v.toExponential(1).replace('.', ',');
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3;
  return v.toLocaleString('vi-VN', { maximumFractionDigits: d });
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function kpi(k, v, u, cls = '') { return `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v">${typeof v === 'string' ? v : fmt(v)}<small>${u || ''}</small></div></div>`; }
function downloadText(name, txt, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function wUnit(id) { return WAPP.P.units.find(u => u.id === id); }
function wLinkName(l) {
  const a = wUnit(l.from[0]), b = wUnit(l.to[0]);
  const d = a && WU[a.type], ps = d && d.outs.length > 1 ? ' (' + (WRES_LBL[l.from[1]] || l.from[1]) + ')' : '';
  return (a ? a.name : '?') + ps + ' → ' + (b ? b.name : '?');
}
const fmtLog = v => v <= -8.9 ? 'không phát hiện' : '10^' + fmt(Math.round(v * 100) / 100).replace('-', '−');

/* ---------------------------------------------------------------- lưu trữ */
const WLS = 'simnuoc.project.v1';
let _wsT = null;
function wSave() { clearTimeout(_wsT); _wsT = setTimeout(() => { try { localStorage.setItem(WLS, JSON.stringify(WAPP.P)); } catch (e) { /* bỏ qua */ } }, 400); }
function wLoad() { try { const s = localStorage.getItem(WLS); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function wNormalize(P) {
  P.app = 'simnuoc';
  P.units = (P.units || []).filter(u => WU[u.type]);
  for (const u of P.units) {
    const d = WU[u.type].def();
    u.p = Object.assign(d, u.p || {});
    if (u.type === 'source') u.p.wq = Object.assign(W_PRESETS.river.wq(), u.p.wq || {});
    if (u.type === 'wwtp') u.p.bg = Object.assign(d.bg, u.p.bg || {});
  }
  P.links = (P.links || []).filter(l => P.units.some(u => u.id === l.from[0]) && P.units.some(u => u.id === l.to[0]));
  P.ctrls = P.ctrls || []; P.events = P.events || [];
  P.sim = Object.assign({ hours: 72, dt: 0.25 }, P.sim || {});
  return P;
}
function wSetProject(P) {
  WAPP.P = wNormalize(P); WAPP.ss = null; WAPP.dyn = null; WAPP.stale = false;
  WAPP.view.series = []; WAPP.view.ds = 'ss'; WAPP.view.src = null;
  FS.sel = null; FS.overlay = null; FS.qlabels = null;
  wRenderAll(); wSave();
  // sơ đồ rộng hơn vùng vẽ → thu nhỏ vừa khung
  setTimeout(() => { if (FS.wrap && FS.wrap.clientWidth > 50 && FS.W * (FS.scale || 1) > FS.wrap.clientWidth + 40) FS.fit(); }, 0);
}
function wChanged(what) {
  WAPP.stale = !!(WAPP.ss || WAPP.dyn);
  wSave(); wFooter();
  if (what !== 'move') wRenderProps();
}

/* ---------------------------------------------------------------- khởi tạo */
window.addEventListener('DOMContentLoaded', () => {
  wConfigFS();
  const sel = $('#selTpl');
  WT_LIST.forEach(([k, n]) => sel.appendChild(el(`<option value="${k}">${n}</option>`)));
  sel.onchange = () => {
    if (!sel.value) return;
    if (WAPP.P && WAPP.P.units.length && !confirm('Mở sơ đồ mẫu sẽ thay thế dự án hiện tại. Tiếp tục?')) { sel.value = ''; return; }
    wSetProject(WT[sel.value]()); sel.value = '';
    wRunSteady(true);
  };
  $('#btnNew').onclick = () => { if (confirm('Tạo dự án trống?')) wSetProject(WT.empty()); };
  $('#btnSave').onclick = () => downloadText((WAPP.P.name || 'du_an').replace(/[^\w\-À-ỹ ]+/g, '_') + '.simnuoc.json', JSON.stringify(WAPP.P, null, 1), 'application/json');
  $('#btnOpen').onclick = () => $('#fileOpen').click();
  $('#fileOpen').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const P = JSON.parse(rd.result); if (P.model && !P.app) { alert('Đây là tệp dự án SimXLNT – hãy mở bằng SimXLNT.'); return; } wSetProject(P); } catch (err) { alert('Không đọc được tệp: ' + err.message); } };
    rd.readAsText(f); e.target.value = '';
  };
  $$('#tabs button').forEach(b => (b.onclick = () => wShowTab(b.dataset.t)));
  const pal = $('#palette');
  for (const g of WU_GROUPS) {
    pal.appendChild(el(`<h4>${g}</h4>`));
    for (const k in WU) if (WU[k].group === g) {
      const it = el(`<div class="pi" draggable="true" title="Kéo vào sơ đồ hoặc bấm để thêm">${FS.paletteIcon(k)}<span>${WU[k].label}</span></div>`);
      it.addEventListener('dragstart', e => e.dataTransfer.setData('text/unit', k));
      it.addEventListener('click', () => { const w = $('#canvasWrap'); FS.addUnit(k, w.scrollLeft + 140 + Math.random() * 200, w.scrollTop + 120 + Math.random() * 200); });
      pal.appendChild(it);
    }
  }
  pal.appendChild(el(`<p class="small muted" style="margin-top:14px">Kéo từ cửa ra <b>●</b> tới cửa vào <b>○</b> để nối ống. Chọn rồi nhấn <code>Delete</code> để xóa.</p>`));
  FS.init($('#canvasWrap'), () => WAPP.P);
  FS.onSelect = () => wRenderProps();
  FS.onChange = w => wChanged(w);
  const P = wLoad();
  wSetProject(P || WT.conv());
  wRenderHelp();
  // nhận dữ liệu SimXLNT gửi sang (cùng trình duyệt)
  window.addEventListener('storage', e => { if (e.key === 'simxlnt.bridge') wFooter(); });
  if (location.hash === '#import') setTimeout(wImportBridgePrompt, 300);
  // trong bộ phần mềm (suite.html): khung chứa gửi lệnh nhập dữ liệu nước ra từ SimXLNT
  window.addEventListener('message', ev => { if (ev.data && ev.data.xch === 'cmd' && ev.data.cmd === 'bridgeImport') { wFooter(); setTimeout(wImportBridgePrompt, 100); } });
  if (window.parent !== window) window.parent.postMessage({ xch: 'hello', app: 'nuoc' }, '*');
});

function wShowTab(t) {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $$('section.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
  if (t === 'src') wRenderSrc();
  if (t === 'ctrl') wRenderCtrl();
  if (t === 'sim') wRenderSim();
  if (t === 'res') wRenderRes();
  if (t === 'tools') wRenderTools();
  if (t === 'bt' && typeof wRenderBT === 'function') wRenderBT();
  if (t === 'fs') { wOverlay(); FS.render(); }
}
function wRenderAll() {
  $('#hdrName').textContent = WAPP.P.name || '';
  wOverlay(); FS.render(); wRenderProps(); wFooter();
  const on = $('#tabs button.on').dataset.t;
  if (on !== 'fs') wShowTab(on);
}
function wFooter() {
  let s = WAPP.ss ? 'Có kết quả ổn định' : 'Chưa tính';
  if (WAPP.dyn) s += ' · có kết quả theo thời gian ' + fmt(WAPP.dyn.snaps[WAPP.dyn.snaps.length - 1].t) + ' h';
  if (WAPP.stale) s += ' · ⚠ sơ đồ/thông số đã thay đổi sau lần tính cuối';
  $('#ftState').textContent = s;
  let b = null; try { b = JSON.parse(localStorage.getItem('simxlnt.bridge') || 'null'); } catch (e) { /* */ }
  $('#ftBridge').textContent = b ? 'Dữ liệu SimXLNT sẵn có: ' + b.name + ' (' + b.time + ')' : '';
  $('#hdrName').textContent = WAPP.P.name || '';
}

/* ---------------------------------------------------------------- biểu mẫu */
function wForm(fields, obj, onChange, opts = {}) {
  const box = el(`<div class="frm${opts.wide ? ' wide' : ''}"></div>`);
  const adv = el(`<details class="adv full"><summary>Thông số nâng cao</summary><div class="frm"></div></details>`);
  let hasAdv = false;
  for (const f of fields) {
    if (f.show && !f.show(obj)) continue;
    const tgt = f.adv ? adv.querySelector('.frm') : box;
    if (f.adv) hasAdv = true;
    tgt.appendChild(el(`<label title="${f.k}"${f.t === 'text' ? ' class="full-row"' : ''}>${f.l}${f.u ? `<span class="u">${f.u}</span>` : ''}</label>`));
    let inp;
    if (f.t === 'sel') {
      inp = el(`<select>${f.opts.map(o => `<option value="${o[0]}"${String(obj[f.k]) === String(o[0]) ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`);
      inp.onchange = () => { obj[f.k] = inp.value; onChange(f.k, true); };
    } else if (f.t === 'text') {
      inp = el(`<input type="text" class="full-row">`); inp.value = obj[f.k] || '';
      inp.onchange = () => { obj[f.k] = inp.value; onChange(f.k, false); };
    } else {
      inp = el(`<input type="number" step="any">`); inp.value = obj[f.k];
      inp.onchange = () => { const v = parseFloat(inp.value); if (isFinite(v)) { obj[f.k] = v; onChange(f.k, false); } else inp.value = obj[f.k]; };
    }
    tgt.appendChild(inp);
  }
  if (hasAdv) box.appendChild(adv);
  return box;
}

/* ---------------------------------------------------------------- thuộc tính */
function wCur() {
  if (WAPP.view.ds === 'dyn' && WAPP.dyn) {
    const n = WAPP.dyn.snaps.length, i = WAPP.view.tIdx < 0 ? n - 1 : Math.min(WAPP.view.tIdx, n - 1);
    return { sys: WAPP.dyn.sys, r: WAPP.dyn.snaps[i].r, t: WAPP.dyn.snaps[i].t };
  }
  if (WAPP.ss) return { sys: WAPP.ss.sys, r: WAPP.ss };
  return null;
}
function wRenderProps() {
  const box = $('#props'); box.innerHTML = '';
  const P = WAPP.P, s = FS.sel;
  if (s && s.kind === 'unit') {
    const u = wUnit(s.id); if (!u) { FS.sel = null; return wRenderProps(); }
    const d = WU[u.type];
    box.appendChild(el(`<h3>${esc(u.name)}</h3>`));
    box.appendChild(el(`<div class="sub">${d.label} · mã ${u.id}</div>`));
    box.appendChild(wForm([{ k: 'name', l: 'Tên', t: 'text' }], u, () => { FS.render(); wChanged('name'); }));
    box.appendChild(el('<div style="height:8px"></div>'));
    box.appendChild(wForm(d.fields, u.p, (k, re) => { FS.render(); wChanged(k); if (re) wRenderProps(); }));
    if (u.type === 'source') {
      const b = el(`<button class="pri" style="margin-top:10px">Phân tích nước nguồn →</button>`);
      b.onclick = () => { WAPP.view.src = u.id; wShowTab('src'); };
      box.appendChild(b);
    }
    if (u.type === 'wwtp') box.appendChild(wBridgeBox(u));
    const c = wCur();
    if (c && c.r.info[u.id]) box.appendChild(el(`<div class="card" style="margin-top:12px;padding:10px"><b>Kết quả</b>${wUnitInfoHTML(u, c.r.info[u.id])}</div>`));
    const del = el(`<div class="btnrow"><button class="danger">Xóa đơn vị</button><button>Nhân bản</button></div>`);
    del.children[0].onclick = () => FS.deleteSel();
    del.children[1].onclick = () => {
      const cu = JSON.parse(JSON.stringify(u)); let i = 1;
      while (P.units.some(x => x.id === u.id + '_' + i)) i++;
      cu.id = u.id + '_' + i; cu.name = u.name + ' (bản sao)'; cu.x += 40; cu.y += 40;
      P.units.push(cu); FS.sel = { kind: 'unit', id: cu.id }; FS.render(); wChanged('add');
    };
    box.appendChild(del);
  } else if (s && s.kind === 'link') {
    const l = P.links.find(x => x.id === s.id); if (!l) { FS.sel = null; return wRenderProps(); }
    box.appendChild(el(`<h3>Đường ống ${l.id}</h3>`));
    box.appendChild(el(`<div class="sub">${esc(wLinkName(l))}</div>`));
    const c = wCur();
    if (c && c.r.S[l.id]) {
      const w = c.r.S[l.id], so = WQ.solve(w);
      box.appendChild(el(`<table class="t">${WQ.SUMMARY.map(v => `<tr><td class="l">${v[1]}</td><td>${W_MIC.includes(v[0]) ? fmtLog(w[v[0]]) : fmt(WQ.value(w, v[0], so))} <span class="small muted">${v[2]}</span></td></tr>`).join('')}</table>`));
    }
    const b = el(`<div class="btnrow"><button class="danger">Xóa đường ống</button></div>`);
    b.firstChild.onclick = () => FS.deleteSel();
    box.appendChild(b);
  } else {
    box.appendChild(el(`<h3>Dự án</h3>`));
    box.appendChild(el(`<div class="sub">Chọn một đơn vị hoặc đường ống để sửa thông số</div>`));
    box.appendChild(wForm([{ k: 'name', l: 'Tên dự án', t: 'text' }], P, () => { wFooter(); wSave(); }));
    const ta = el(`<textarea rows="5" style="width:100%;margin-top:6px" placeholder="Ghi chú"></textarea>`);
    ta.value = P.desc || ''; ta.onchange = () => { P.desc = ta.value; wSave(); };
    box.appendChild(ta);
    const sys = WSIM.compile(P);
    const msgs = el('<div style="margin-top:10px"></div>');
    sys.errors.forEach(e => msgs.appendChild(el(`<div class="msg err">${esc(e)}</div>`)));
    sys.warns.forEach(e => msgs.appendChild(el(`<div class="msg warn">${esc(e)}</div>`)));
    if (!sys.errors.length) msgs.appendChild(el(`<div class="msg ok">Sơ đồ hợp lệ: ${P.units.length} đơn vị, ${P.links.length} đường ống${sys.tears.length ? ', ' + sys.tears.length + ' vòng tuần hoàn' : ''}.</div>`));
    box.appendChild(msgs);
    const b = el(`<div class="btnrow"><button class="pri">▶ Tính ổn định</button><button title="Giãn khoảng cách ngang giữa các đơn vị (khi nhãn bị chồng)">↔ Giãn sơ đồ</button><button title="Thu hẹp khoảng cách ngang">→← Thu sơ đồ</button></div>`);
    b.children[0].onclick = () => wRunSteady(true);
    const scaleX = k => { const x0 = Math.min(...P.units.map(u => u.x)); P.units.forEach(u => (u.x = Math.round((x0 + (u.x - x0) * k) / 10) * 10)); FS.render(); wChanged('move'); };
    b.children[1].onclick = () => scaleX(1.25);
    b.children[2].onclick = () => scaleX(0.8);
    box.appendChild(b);
  }
}

/* thông tin kết quả tóm tắt của đơn vị */
function wUnitInfoHTML(u, i) {
  const row = (k, v, un = '') => `<tr><td class="l">${k}</td><td>${typeof v === 'string' ? v : fmt(v)} <span class="small muted">${un}</span></td></tr>`;
  let h = '<table class="t">';
  const w = i._in;
  if (w) h += row('Lưu lượng vào', w.Q, 'm³/d');
  switch (u.type) {
    case 'source': h += row('Lưu lượng', i.Q, 'm³/d') + row('Sai số cân bằng ion (phân tích)', i.err, '%') + row('Ion bù cân bằng', i.balIon || '–') + row('Lượng bù', i.balDelta, 'mg/L'); break;
    case 'wwtp': h += row('Lưu lượng', i.Q, 'm³/d') + row('Nguồn dữ liệu', esc(i.src || '')); break;
    case 'dose': h += row('Hóa chất', esc(i.chem || '')) + row('Liều', i.dose, 'mg/L') + row('Tiêu thụ (tinh khiết)', i.kgd, 'kg/d') + row('Thương phẩm', i.kgProd, 'kg/d') + row('pH sau châm', i.pH); break;
    case 'coag': h += row('pH keo tụ', i.pH) + row('Kết tủa kim loại', i.M, 'mmol/L') + row('DOC loại bỏ', i.DOCrem, 'mgC/L') + row('Mức keo tụ', i.cond) + row('Gt', i.Gt) + row('Tiêu hao độ kiềm', i.alkUse, 'mgCaCO₃/L'); break;
    case 'settler': h += row('Tải bề mặt', i.SOR, 'm/h') + row('Tốc độ lắng/nổi bông', i.vs, 'm/h') + row('Hiệu suất tách rắn', i.E, '%') + row('Độ đục ra', i.turbOut, 'NTU') + row('Bùn', i.solids, 'kg/d') + row('Lưu lượng bùn', i.Qs, 'm³/d') + (i.CaF2out > 1e-3 ? row('CaF₂ lơ lửng ra', i.CaF2out, 'mg/L') : ''); break;
    case 'soften': h += row('Liều vôi', i.lime, 'mg/L') + row('Độ cứng vào/ra', fmt(i.hardIn) + ' / ' + fmt(i.hardOut), 'mgCaCO₃/L') + row('CaCO₃ kết tủa', i.CaCO3, 'mg/L') + row('Mg(OH)₂', i.MgOH2, 'mg/L') + row('pH', i.pH) + row('Bùn', i.solids, 'kg/d'); break;
    case 'filter': h += row('Tốc độ lọc', i.vf, 'm/h') + row('Hiệu suất giữ hạt', i.E, '%') + row('Độ đục ra', i.turbOut, 'NTU') + row('Tổn thất sạch / trung bình', fmt(i.h0) + ' / ' + fmt(i.H), 'm') + row('Chu kỳ lọc', i.run, 'h') + row('Nước rửa lọc', i.bwFrac, '%') + row('EBCT', i.EBCT, 'min') + (i.nitr ? row('Nitrat hóa', i.nitr, 'mgN/L') : ''); break;
    case 'gac': h += row('EBCT', i.EBCT, 'min') + row('Thể tích than', i.Vbed, 'm³') + row('BV50 DOC', i.BV50doc) + row('BV50 vi chất', i.BV50mp) + row('BV50 PFOA / PFOS', fmt(i.BV50pfoa) + ' / ' + fmt(i.BV50pfos)) + row('Thời gian tới tiêu chí', i.daysTgt, 'ngày') + row('Suất tiêu hao than CUR', i.CUR, 'g/m³') + row('Than tiêu hao', i.kgd, 'kg/d'); break;
    case 'ix': h += row('Tải ion', i.load, 'meq/L') + row('Chu kỳ làm việc', i.BVrun, 'BV') + row('', i.hrs, 'giờ') + row('Hóa chất tái sinh', i.regenKgd, 'kg/d ' + (i.regen || '')) + row('Nước thải tái sinh', i.QB, 'm³/d') + row('Độ cứng ra', i.hardOut, 'mgCaCO₃/L') + row('Độ dẫn ra', i.EC, 'µS/cm'); break;
    case 'precip': h += row('Thời gian lưu', i.HRT, 'phút') + row('F⁻ vào / ra', fmt(i.Fin) + ' / ' + fmt(i.Fout), 'mg/L') + row('CaF₂ kết tủa', i.CaF2, 'mg/L') + row('CaF₂ keo tụ thành bông', i.coag, 'mg/L') + row('CaF₂ keo / bông ra', fmt(i.CaF2c) + ' / ' + fmt(i.CaF2s), 'mg/L') + row('SI fluorit ra', i.SIflu) + (i.CaCO3 ? row('CaCO₃ kết tủa', i.CaCO3, 'mg/L') : '') + row('pH', i.pH); break;
    case 'ufs': h += row('Thu hồi', i.rec, '%') + row('Nước thấm / thải', fmt(i.Qp) + ' / ' + fmt(i.QB), 'm³/d') + row('Bơm cấp / rửa ngược / sục khí', fmt(i.kWfeed) + ' / ' + fmt(i.kWbw) + ' / ' + fmt(i.kWair), 'kW') + row('Khí sục rửa TB', i.air, 'Nm³/d') + row('Điện năng riêng', i.kWh, 'kWh/m³') + row('Độ đục thấm', i.turbOut, 'NTU'); break;
    case 'mf': h += row('Diện tích màng', i.Am, 'm²') + row('TMP', i.TMP, 'bar') + row('TMP quy về 20 °C', i.TMP20, 'bar') + row('Thu hồi', i.rec, '%') + row('Điện năng', i.kWh, 'kWh/m³') + row('Độ đục thấm', i.turbOut, 'NTU'); break;
    case 'ro': h += row('Áp suất cấp', i.Pf, 'bar') + row('Áp suất đặc', i.Pc, 'bar') + row('Thu hồi', i.rec, '%') + row('Thông lượng TB / max', fmt(i.Javg) + ' / ' + fmt(i.Jmax), 'L/m²/h') + row('Điện năng riêng', i.kWh, 'kWh/m³') + row('TDS thấm', i.TDSp, 'mg/L') + row('Loại TDS', i.rejTDS, '%') + row('Loại bo', i.rejB, '%') + row('LSI dòng đặc', i.LSIc) + row('Silica dòng đặc', i.Sipct, '% bão hòa'); break;
    case 'edi': h += row('Độ dẫn thấm', i.EC, 'µS/cm') + row('Điện trở suất', i.res, 'MΩ·cm') + row('Thu hồi', i.rec, '%'); break;
    case 'tank': h += row('Thời gian lưu', i.HRT, 'h') + row('Clo tự do / tổng ra', fmt(i.Cl2f) + ' / ' + fmt(i.Cl2tot), 'mg/L') + row('CT clo tự do', i.CTfree, 'mg·min/L') + row('CT cloramin', i.CTcam, 'mg·min/L') + (i.credit ? row('Giardia / virus (tín chỉ CT)', fmt(i.credit.Giardia) + ' / ' + fmt(i.credit.Virus), 'log') : '') + row('pH ra', i.pH) + row('THM ra', i.THM, 'µg/L'); break;
    case 'ozone': h += row('Nhu cầu tức thời', i.ID, 'mg/L') + row('O₃ dư đầu / cuối', fmt(i.C0) + ' / ' + fmt(i.Cout), 'mg/L') + row('CT', i.CT, 'mg·min/L') + (i.credit ? row('Crypto / Giardia / virus', fmt(i.credit.Crypto) + ' / ' + fmt(i.credit.Giardia) + ' / ' + fmt(i.credit.Virus), 'log') : '') + row('Bromat tạo thành', i.BrO3, 'µg/L') + row('Khử vi chất', i.lMP, 'log') + row('O₃ sản xuất', i.kgO3, 'kg/d'); break;
    case 'uv': h += row('UVT', i.UVT, '%') + row('Liều hiệu dụng', i.D, 'mJ/cm²') + (i.logs ? row('Crypto / Giardia / virus', fmt(i.logs.Crypto) + ' / ' + fmt(i.logs.Giardia) + ' / ' + fmt(i.logs.Virus), 'log') : '') + row('Khử vi chất', i.lMP, 'log'); break;
    case 'stripper': h += row('pH vào / ra', fmt(i.pHin) + ' / ' + fmt(i.pHout)) + row('CO₂ vào / ra', fmt(i.CO2in) + ' / ' + fmt(i.CO2out), 'mg/L') + row('O₂ ra', i.O2, 'mg/L'); break;
    case 'remin': h += row('CaCO₃ hòa tan', i.CaCO3, 'mg/L') + row('LSI ra', i.LSI) + row('CCPP ra', i.CCPP, 'mg/L') + row('Độ kiềm / độ cứng', fmt(i.alk) + ' / ' + fmt(i.hard)) + row('pH', i.pH); break;
    case 'evap': h += row('TDS đặc', i.TDSc, 'mg/L') + row('LSI / SI thạch cao', fmt(i.LSIc) + ' / ' + fmt(i.SIgyp)); break;
    case 'dewater': h += row('Chất rắn vào', i.kgDS, 'kg/d') + row('Bánh bùn', i.cakeT, 't/d') + row('Polymer', i.polyKg, 'kg/d'); break;
    case 'splitter': h += row('Sang A / B', fmt(i.Qa) + ' / ' + fmt(i.Qb), 'm³/d'); break;
    case 'hx': h += row('ΔT', i.dT, '°C'); break;
  }
  if (i.kW > 0) h += row('Công suất điện', i.kW, 'kW');
  return h + '</table>';
}

/* ---------------------------------------------------------------- cầu nối SimXLNT */
function wBridgeBox(u) {
  const b = el(`<div class="card" style="margin-top:10px;padding:10px"><b>Dữ liệu từ SimXLNT</b><div class="small muted" id="brInfo"></div>
    <div class="btnrow"><button class="pri" id="brImp">Nhập từ SimXLNT (bộ nhớ trình duyệt)</button><button id="brFile">Nhập tệp .bridge.json…</button><button id="brOpen">Mở SimXLNT ↗</button></div>
    <details class="adv"><summary>Thành phần nền (SimXLNT không mô phỏng): ion chính, vi sinh, vi chất</summary><div id="brBg"></div></details></div>`);
  const s = u.p.snap;
  b.querySelector('#brInfo').innerHTML = s ? `Đã nhập: <b>${esc(s.name)}</b> lúc ${esc(s.time)} – Q = ${fmt(s.avg.Q)} m³/d, NH₄ ${fmt(s.avg.NH4)}, NOx ${fmt(s.avg.NOx)}, COD hòa tan ${fmt(s.avg.sCOD)} mg/L, pH ${fmt(s.avg.pH)}${s.series ? ', có chuỗi động ' + s.series.t.length + ' điểm' : ''}` : 'Chưa nhập – đang dùng nước thải thứ cấp điển hình. Trong SimXLNT: tab Kết quả → "Gửi nước ra sang SimNước".';
  b.querySelector('#brImp').onclick = () => {
    let d = null; try { d = JSON.parse(localStorage.getItem('simxlnt.bridge') || 'null'); } catch (e) { /* */ }
    if (!d) { alert('Chưa có dữ liệu. Trong SimXLNT, mở tab Kết quả và bấm "Gửi nước ra sang SimNước" (cùng trình duyệt), hoặc dùng "Nhập tệp".'); return; }
    u.p.snap = d; wChanged('snap'); wRenderProps();
  };
  b.querySelector('#brFile').onclick = () => {
    const inp = el('<input type="file" accept=".json" hidden>'); document.body.appendChild(inp);
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(rd.result); if (!d.avg) throw new Error('không phải tệp cầu nối'); u.p.snap = d; wChanged('snap'); wRenderProps(); } catch (e) { alert('Lỗi: ' + e.message); } inp.remove(); }; rd.readAsText(f); };
    inp.click();
  };
  b.querySelector('#brOpen').onclick = () => window.open(document.querySelector('#lnkX').href, '_blank');
  const bgF = Object.keys(u.p.bg).map(k => ({ k, l: k === 'UVspec' ? 'UV254 riêng (1/cm per mgC/L)' : (WQ.D[k] ? WQ.D[k].name : k), u: k === 'UVspec' ? '' : (WQ.D[k] ? WQ.D[k].u : '') }));
  b.querySelector('#brBg').appendChild(wForm(bgF, u.p.bg, () => wChanged('bg')));
  return b;
}
function wImportBridgePrompt() {
  const u = WAPP.P.units.find(x => x.type === 'wwtp');
  if (!u) { if (confirm('Dữ liệu SimXLNT đã sẵn sàng. Mở mẫu "Chuỗi SimXLNT → UF – RO – AOP" để dùng?')) { wSetProject(WT.chain()); wImportBridgePrompt(); } return; }
  let d = null; try { d = JSON.parse(localStorage.getItem('simxlnt.bridge') || 'null'); } catch (e) { /* */ }
  if (d) { u.p.snap = d; wChanged('snap'); FS.sel = { kind: 'unit', id: u.id }; wRenderProps(); wRunSteady(true); }
  history.replaceState(null, '', location.pathname);
}

/* ---------------------------------------------------------------- tab Nước nguồn */
const SRC_GROUPS = [
  ['Chung', [['T', 'Nhiệt độ', '°C'], ['pH', 'pH', '-'], ['alk', 'Độ kiềm', 'mgCaCO₃/L'], ['turb', 'Độ đục', 'NTU']]],
  ['Cation', ['Ca', 'Mg', 'Na', 'K', 'NH4', 'Fe2', 'Mn', 'Ba', 'Sr']], ['Anion', ['Cl', 'SO4', 'NO3', 'NO2', 'F', 'Br']],
  ['Chất khác', ['PO4', 'SiO2', 'B', 'Fe3', 'Al', 'O2', 'CH4', 'H2S', 'Cl2f', 'NH2Cl']], ['Hữu cơ', ['DOC', 'BDOC', 'POC', 'UV254']],
  ['Vi sinh (log₁₀; −9 = không có)', ['Ecoli', 'Giardia', 'Crypto', 'Virus']], ['Vi chất ô nhiễm', ['MP', 'PFOA', 'PFOS']]
];
function wRenderSrc() {
  const box = $('#tab-src'); box.innerHTML = '';
  const srcs = WAPP.P.units.filter(u => u.type === 'source');
  if (!srcs.length) { box.appendChild(el(`<div class="card"><h2>Nước nguồn</h2><p>Sơ đồ chưa có đơn vị "Nguồn nước".</p></div>`)); return; }
  if (!srcs.some(u => u.id === WAPP.view.src)) WAPP.view.src = srcs[0].id;
  const u = wUnit(WAPP.view.src), a = u.p.wq;
  const head = el(`<div class="card"><div class="row"><label>Nguồn <select id="sSel">${srcs.map(s => `<option value="${s.id}"${s.id === u.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label>Nạp mẫu nước <select id="sPre"><option value="">—</option>${Object.keys(W_PRESETS).map(k => `<option value="${k}">${W_PRESETS[k].n}</option>`).join('')}</select></label>
    <button id="sCsv">Xuất phân tích CSV</button></div></div>`);
  box.appendChild(head);
  head.querySelector('#sSel').onchange = e => { WAPP.view.src = e.target.value; wRenderSrc(); };
  head.querySelector('#sPre').onchange = e => { if (!e.target.value) return; u.p.wq = W_PRESETS[e.target.value].wq(); wChanged('wq'); wRenderSrc(); };
  const grid = el(`<div class="grid2"></div>`);
  const left = el(`<div class="card"><h2>Phân tích nước</h2><div id="sGroups"></div></div>`);
  const right = el(`<div class="card"><h2>Đặc tính tính toán</h2><div id="sCalc"></div></div>`);
  grid.appendChild(left); grid.appendChild(right); box.appendChild(grid);
  const g = left.querySelector('#sGroups');
  for (const [name, keys] of SRC_GROUPS) {
    g.appendChild(el(`<h3>${name}</h3>`));
    const f = keys.map(k => Array.isArray(k) ? { k: k[0], l: k[1], u: k[2] } : { k, l: WQ.D[k].name, u: WQ.D[k].u });
    f.forEach(x => { if (a[x.k] === undefined) a[x.k] = 0; });
    g.appendChild(wForm(f, a, () => { wChanged('wq'); calc(); }, { wide: true }));
  }
  const calc = () => {
    const r = wCharacterize(u.p), w = r.w, s = WQ.solve(w);
    const ib = WQ.ionBalance(Object.assign(WQ.copy(w), { Na: +a.Na, Cl: +a.Cl }), +a.pH);
    right.querySelector('#sCalc').innerHTML = `<div class="kpis">${kpi('pH tính (sau cân bằng)', s.pH, '')}${kpi('Sai số cân bằng ion', ib.err, '%', Math.abs(ib.err) < 5 ? 'ok' : 'bad')}
      ${kpi('Ion bù', r.ion === 'none' ? 'không' : r.ion, fmt(r.delta) + ' mg/L')}${kpi('Lực ion', s.I * 1000, 'mmol/L')}${kpi('TDS', s.TDS, 'mg/L')}${kpi('EC (25 °C)', s.EC, 'µS/cm')}
      ${kpi('Độ cứng', s.hard, 'mgCaCO₃/L')}${kpi('Độ kiềm', s.alk, 'mgCaCO₃/L')}${kpi('CO₂ tự do', s.CO2, 'mg/L')}${kpi('TIC', w.TIC, 'mmol/L')}
      ${kpi('LSI', s.LSI, '', s.LSI > -0.5 && s.LSI < 0.5 ? 'ok' : '')}${kpi('RSI', s.RSI, '')}${kpi('CCPP', WQ.ccpp(w), 'mgCaCO₃/L')}${kpi('Áp suất thẩm thấu', s.osm, 'bar')}
      ${kpi('SUVA', s.SUVA, 'L/mg·m')}${kpi('UVT', s.UVT, '%')}${kpi('TSS ước tính', s.TSS, 'mg/L')}${kpi('NH₃ tự do', s.NH3, 'mgN/L')}</div>
      <h3>Chỉ số bão hòa</h3><table class="t" style="max-width:520px"><tr><th class="l">Khoáng</th><th>SI = log(IAP/Ksp)</th></tr>
      <tr><td class="l">Calcit CaCO₃</td><td>${fmt(s.SIcal)}</td></tr><tr><td class="l">Thạch cao CaSO₄·2H₂O</td><td>${fmt(s.SIgyp)}</td></tr><tr><td class="l">Barit BaSO₄</td><td>${fmt(s.SIbar)}</td></tr>
      <tr><td class="l">Celestit SrSO₄</td><td>${fmt(s.SIcel)}</td></tr><tr><td class="l">Fluorit CaF₂</td><td>${fmt(s.SIflu)}</td></tr><tr><td class="l">Brucit Mg(OH)₂</td><td>${fmt(s.SIbru)}</td></tr>
      <tr><td class="l">Silica vô định hình</td><td>${fmt(s.silicaPct)} % bão hòa</td></tr></table>
      <p class="small muted">TIC được tính từ pH và độ kiềm; điện tích được cân bằng bằng ion đã chọn ở thuộc tính đơn vị nguồn. Hoạt độ theo Davies, có xét cặp ion CaSO₄°, MgSO₄°, NaSO₄⁻, CaCO₃°, CaHCO₃⁺… khi tính chỉ số bão hòa.</p>`;
  };
  calc();
  head.querySelector('#sCsv').onclick = () => downloadText('phan_tich_nuoc.csv', '﻿Chi tieu,Gia tri,Don vi\n' + Object.keys(a).map(k => `"${WQ.D[k] ? WQ.D[k].name : k}",${a[k]},"${WQ.D[k] ? WQ.D[k].u : ''}"`).join('\n'), 'text/csv');
}

/* ---------------------------------------------------------------- tab Điều khiển & kịch bản */
function wNumFields(u) { return WU[u.type].fields.filter(f => !f.t).map(f => [f.k, f.l]); }
function wRefOptions(sel) {
  return WAPP.P.links.map(l => `<option value="${l.id}"${sel === l.id ? ' selected' : ''}>Ống: ${esc(wLinkName(l))}</option>`).join('') +
    WAPP.P.units.filter(u => WU[u.type].ins.length).map(u => `<option value="U:${u.id}"${sel === 'U:' + u.id ? ' selected' : ''}>Vào/KQ đơn vị: ${esc(u.name)}</option>`).join('');
}
const W_MEAS = WQ.SUMMARY.filter(v => v[0] !== 'Q' || true).map(v => [v[0], v[1] + ' [' + v[2] + ']']).concat([['NH2Cl', 'Monocloramin [mgCl₂/L]'], ['O3', 'Ozone dư [mg/L]'], ['O2', 'Oxy hòa tan [mg/L]'], ['SiO2', 'Silica [mg/L]'], ['MP', 'Vi chất [ng/L]'], ['Pf', 'Áp suất RO (KQ đơn vị) [bar]'], ['CTfree', 'CT clo tự do (KQ) [mg·min/L]'], ['credit', '—']]).filter(v => v[0] !== 'credit');
function wRenderCtrl() {
  const box = $('#tab-ctrl'); box.innerHTML = '';
  const P = WAPP.P;
  const c1 = el(`<div class="card"><h2>Bộ điều khiển</h2><p class="small muted">Ở trạng thái ổn định: tìm giá trị thông số tác động (trong khoảng [min, max]) để biến đo đạt giá trị đặt. Khi chạy theo thời gian: bộ PI với Kp, Ti (giờ).</p><div class="tscroll"><table class="t" id="cTab"></table></div><div class="btnrow"><button class="pri" id="cSug">Gợi ý bộ điều khiển phù hợp sơ đồ</button><button id="cAdd">+ Thêm bộ điều khiển</button><button id="cChk">Kiểm tra bộ điều khiển</button></div><div id="cSugBox"></div><div id="cChkBox"></div></div>`);
  box.appendChild(c1);
  // gợi ý & kiểm tra (js/w_ctrl.js): nhận dạng cặp tác động – đo theo sơ đồ, thử số để chọn chiều, Kp, kiểm tra giá trị đặt
  if (typeof WCTL !== 'undefined') {
    c1.querySelector('#cSug').onclick = () => WCTL.suggestUI(c1.querySelector('#cSugBox'), n => { wChanged('ctrl'); wRenderCtrl(); const b = $('#cSugBox'); if (b) b.innerHTML = `<div class="msg ok">Đã thêm ${n} bộ điều khiển (chiều tác động, Kp theo thử số trên sơ đồ). Sang tab Mô phỏng → "Tính ổn định" để tìm giá trị tác động.</div>`; });
    c1.querySelector('#cChk').onclick = () => WCTL.checkUI(c1.querySelector('#cChkBox'));
    if (P.ctrls.length) WCTL.checkUI(c1.querySelector('#cChkBox'));
  } else { c1.querySelector('#cSug').remove(); c1.querySelector('#cChk').remove(); }
  const tb = c1.querySelector('#cTab');
  const draw = () => {
    tb.innerHTML = `<tr><th class="l">Bật</th><th class="l">Tên</th><th class="l">Đơn vị tác động</th><th class="l">Thông số</th><th class="l">Điểm đo</th><th class="l">Biến đo</th><th>Đặt</th><th>Min</th><th>Max</th><th>Kp</th><th>Ti h</th><th>Chiều</th><th>KQ</th><th></th></tr>`;
    P.ctrls.forEach((c, i) => {
      const u = wUnit(c.unit);
      const tr = el(`<tr><td><input type="checkbox"${c.on !== false ? ' checked' : ''}></td><td><input type="text" style="width:130px" value="${esc(c.name || '')}"></td>
        <td><select>${P.units.filter(x => wNumFields(x).length).map(x => `<option value="${x.id}"${x.id === c.unit ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
        <td><select>${u ? wNumFields(u).map(f => `<option value="${f[0]}"${f[0] === c.param ? ' selected' : ''}>${f[1]}</option>`).join('') : ''}</select></td>
        <td><select style="max-width:240px">${wRefOptions(c.ref)}</select></td>
        <td><select>${W_MEAS.map(v => `<option value="${v[0]}"${v[0] === c.v ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></td>
        <td><input type="number" step="any" value="${c.sp}"></td><td><input type="number" step="any" value="${c.lo}"></td><td><input type="number" step="any" value="${c.hi}"></td>
        <td><input type="number" step="any" value="${c.kp}"></td><td><input type="number" step="any" value="${c.ti}"></td>
        <td><select><option value="dir"${c.dir !== 'rev' ? ' selected' : ''}>thuận</option><option value="rev"${c.dir === 'rev' ? ' selected' : ''}>nghịch</option></select></td>
        <td>${c.out !== undefined ? fmt(c.out) : ''}</td><td><button>✕</button></td></tr>`);
      const f = tr.querySelectorAll('input,select');
      f[0].onchange = e => { c.on = e.target.checked; wChanged('ctrl'); };
      f[1].onchange = e => { c.name = e.target.value; wSave(); };
      f[2].onchange = e => { c.unit = e.target.value; const nu = wUnit(c.unit); c.param = wNumFields(nu)[0][0]; wChanged('ctrl'); draw(); };
      f[3].onchange = e => { c.param = e.target.value; wChanged('ctrl'); };
      f[4].onchange = e => { c.ref = e.target.value; wChanged('ctrl'); };
      f[5].onchange = e => { c.v = e.target.value; wChanged('ctrl'); };
      ['sp', 'lo', 'hi', 'kp', 'ti'].forEach((k, j) => (f[6 + j].onchange = e => { c[k] = +e.target.value; wChanged('ctrl'); }));
      f[11].onchange = e => { c.dir = e.target.value; wChanged('ctrl'); };
      tr.querySelector('button').onclick = () => { P.ctrls.splice(i, 1); wChanged('ctrl'); draw(); };
      tb.appendChild(tr);
    });
  };
  draw();
  c1.querySelector('#cAdd').onclick = () => {
    const u = P.units.find(x => x.type === 'dose') || P.units.find(x => wNumFields(x).length);
    if (!u) { alert('Chưa có đơn vị có thông số số.'); return; }
    let i = 1; while (P.ctrls.some(c => c.id === 'C' + i)) i++;
    P.ctrls.push({ id: 'C' + i, name: 'Bộ ĐK ' + i, on: true, unit: u.id, param: wNumFields(u)[0][0], ref: P.links.length ? P.links[P.links.length - 1].id : '', v: 'Cl2f', sp: 0.5, lo: 0, hi: 10, kp: 0.5, ti: 2 });
    wChanged('ctrl'); draw();
  };
  // kịch bản
  const c2 = el(`<div class="card"><h2>Kịch bản theo thời gian</h2><p class="small muted">Thay đổi thông số tại thời điểm t (giờ) khi chạy mô phỏng theo thời gian, ví dụ: sự cố đục tăng, dừng bơm hóa chất, đổi liều.</p><table class="t" id="eTab" style="max-width:900px"></table><div class="btnrow"><button id="eAdd">+ Thêm sự kiện</button></div></div>`);
  box.appendChild(c2);
  const et = c2.querySelector('#eTab');
  const drawE = () => {
    et.innerHTML = `<tr><th>t (h)</th><th class="l">Đơn vị</th><th class="l">Thông số</th><th>Giá trị mới</th><th></th></tr>`;
    P.events.forEach((e, i) => {
      const u = wUnit(e.unit);
      const tr = el(`<tr><td><input type="number" step="any" value="${e.t}"></td><td><select>${P.units.filter(x => wNumFields(x).length).map(x => `<option value="${x.id}"${x.id === e.unit ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
        <td><select>${u ? wNumFields(u).map(f => `<option value="${f[0]}"${f[0] === e.param ? ' selected' : ''}>${f[1]}</option>`).join('') : ''}</select></td><td><input type="number" step="any" value="${e.value}"></td><td><button>✕</button></td></tr>`);
      const f = tr.querySelectorAll('input,select');
      f[0].onchange = x => { e.t = +x.target.value; wSave(); };
      f[1].onchange = x => { e.unit = x.target.value; e.param = wNumFields(wUnit(e.unit))[0][0]; wSave(); drawE(); };
      f[2].onchange = x => { e.param = x.target.value; wSave(); };
      f[3].onchange = x => { e.value = +x.target.value; wSave(); };
      tr.querySelector('button').onclick = () => { P.events.splice(i, 1); wSave(); drawE(); };
      et.appendChild(tr);
    });
  };
  drawE();
  c2.querySelector('#eAdd').onclick = () => {
    const u = P.units.find(x => wNumFields(x).length); if (!u) return;
    P.events.push({ t: 24, unit: u.id, param: wNumFields(u)[0][0], value: +u.p[wNumFields(u)[0][0]] }); wSave(); drawE();
  };
  // nguồn: kịch bản chất lượng nước nguồn (độ đục)
  box.appendChild(el(`<div class="card"><p class="small muted">Gợi ý: để mô phỏng biến động nước nguồn, đặt "Biên độ dao động lưu lượng/nhiệt độ" ở thuộc tính đơn vị Nguồn nước (nâng cao); các thành phần nước nguồn có thể đổi qua sự kiện bằng cách thêm một đơn vị "Châm hóa chất" hoặc thay đổi lưu lượng nguồn thứ hai hòa trộn.</p></div>`));
}

/* ---------------------------------------------------------------- tab Mô phỏng */
function wLog(msg) { const l = $('#simLog'); if (l) { l.textContent += msg + '\n'; l.scrollTop = 1e9; } }
function wRenderSim() {
  const box = $('#tab-sim'); box.innerHTML = '';
  const P = WAPP.P;
  const c = el(`<div class="grid2"><div class="card"><h2>Trạng thái ổn định</h2>
    <p class="small muted">Giải tuần tự theo mô-đun; vòng tuần hoàn (nước rửa lọc, nước đặc RO thu hồi…) được lặp tới hội tụ; bộ điều khiển được giải bằng tìm nghiệm.</p>
    <div class="btnrow"><button class="pri" id="bSS">▶ Tính trạng thái ổn định</button></div></div>
    <div class="card"><h2>Mô phỏng theo thời gian</h2>
    <p class="small muted">Giả động: mỗi bước giải lại sơ đồ với trạng thái của lọc (tổn thất áp lực, rửa lọc), màng (TMP, CIP), RO (bám bẩn), trao đổi ion (cạn kiệt, tái sinh), GAC (tuổi than so le), bể chứa (trộn, phân hủy clo), nguồn dao động & kịch bản.</p>
    <div class="frm"><label>Thời gian mô phỏng<span class="u">giờ</span></label><input type="number" id="dH" step="any" value="${P.sim.hours}"><label>Bước thời gian<span class="u">giờ</span></label><input type="number" id="dDt" step="any" value="${P.sim.dt}"></div>
    <div class="btnrow"><button class="pri" id="bDyn">▶ Chạy theo thời gian</button><button id="bStop" disabled>■ Dừng</button></div>
    <div class="progress" style="margin-top:10px"><div id="prog"></div></div></div></div>
    <div class="card"><h2>Nhật ký</h2><pre class="log" id="simLog"></pre></div>`);
  box.appendChild(c);
  $('#dH').onchange = e => { P.sim.hours = +e.target.value; wSave(); };
  $('#dDt').onchange = e => { P.sim.dt = +e.target.value; wSave(); };
  $('#bSS').onclick = () => wRunSteady(false);
  $('#bDyn').onclick = () => wRunDyn();
  $('#bStop').onclick = () => { WAPP.abort = true; };
}
function wRunSteady(quiet) {
  const t0 = performance.now();
  const r = WSIM.steady(WAPP.P, { prevS: WAPP.ss && !WAPP.stale ? WAPP.ss.S : null });
  if (r.errors) { if (!quiet) wLog('✖ Lỗi sơ đồ: ' + r.errors.join('; ')); else alert('Lỗi sơ đồ: ' + r.errors.join('; ')); return; }
  WAPP.ss = r; WAPP.stale = false; WAPP.view.ds = 'ss';
  wLog(`✔ Ổn định: ${r.iters} lượt, ${((performance.now() - t0)).toFixed(0)} ms${r.conv ? '' : ' (CHƯA HỘI TỤ)'}`);
  r.log.forEach(m => wLog('  ĐK: ' + m));
  r.ctrls.forEach(c => wLog(`  ${c.name || c.id}: thông số = ${fmt(c.x)}, đo = ${fmt(c.meas)} (đặt ${fmt(c.sp)})`));
  r.warns.forEach(m => wLog('  ⚠ ' + m));
  wOverlay(); FS.render(); wFooter(); wRenderProps();
  if (!quiet) wShowTab('res');
}
async function wRunDyn() {
  if (WAPP.running) return;
  WAPP.running = true; WAPP.abort = false;
  $('#bDyn').disabled = true; $('#bStop').disabled = false;
  const t0 = performance.now();
  try {
    const r = await WSIM.dynamic(WAPP.P, { hours: WAPP.P.sim.hours, dt: WAPP.P.sim.dt, onProgress: f => { const p = $('#prog'); if (p) p.style.width = (f * 100).toFixed(1) + '%'; }, abort: () => WAPP.abort });
    if (r.errors) wLog('✖ ' + r.errors.join('; '));
    else { WAPP.dyn = r; WAPP.view.ds = 'dyn'; WAPP.view.tIdx = -1; WAPP.stale = false; wLog(`✔ Theo thời gian: ${r.snaps.length} bước, ${((performance.now() - t0) / 1000).toFixed(1)} s`); }
  } catch (e) { wLog('✖ ' + e.message); console.error(e); }
  WAPP.running = false;
  const b = $('#bDyn'); if (b) { b.disabled = false; $('#bStop').disabled = true; $('#prog').style.width = '100%'; }
  wOverlay(); FS.render(); wFooter();
  if (WAPP.dyn) wShowTab('res');
}

/* ---------------------------------------------------------------- chú thích trên sơ đồ */
function wOverlay() {
  const c = WAPP.view.overlay ? wCur() : null;
  if (!c) { FS.overlay = null; FS.qlabels = null; return; }
  FS.qlabels = {};
  for (const l of WAPP.P.links) { const w = c.r.S[l.id]; if (w) FS.qlabels[l.id] = fmt(w.Q); }
  FS.overlay = {};
  for (const u of WAPP.P.units) {
    const i = c.r.info[u.id]; if (!i) continue;
    const L = [];
    const w = i._in;
    switch (u.type) {
      case 'product': if (w) { const s = WQ.solve(w); L.push('pH ' + fmt(s.pH) + ' · TDS ' + fmt(s.TDS), 'Độ đục ' + fmt(s.turb) + ' NTU', 'Clo ' + fmt(s.Cl2tot) + ' · LSI ' + fmt(s.LSI)); } break;
      case 'waste': if (w) L.push('TSS ' + fmt(WQ.tss(w)) + ' · TDS ' + fmt(WQ.solve(w).TDS)); break;
      case 'dose': L.push(fmt(i.dose) + ' mg/L'); break;
      case 'ro': L.push(fmt(i.Pf) + ' bar · ' + fmt(i.rec) + ' %', fmt(i.kWh) + ' kWh/m³'); break;
      case 'filter': L.push('E ' + fmt(i.E) + ' % · ' + fmt(i.run) + ' h'); break;
      case 'settler': L.push(fmt(i.turbOut) + ' NTU'); break;
      case 'tank': L.push(i.Cl2tot > 0.01 ? 'Cl ' + fmt(i.Cl2tot) + ' · CT ' + fmt(i.CTfree + i.CTcam) : 'HRT ' + fmt(i.HRT) + ' h · pH ' + fmt(i.pH)); break;
      case 'ozone': L.push('CT ' + fmt(i.CT) + ' · BrO₃ ' + fmt(i.BrO3)); break;
      case 'uv': L.push(fmt(i.D) + ' mJ/cm²'); break;
      case 'mf': L.push('TMP ' + fmt(i.TMP) + ' bar'); break;
      case 'gac': L.push(fmt(i.CUR) + ' g/m³'); break;
      case 'ix': L.push(fmt(i.hrs) + ' h/chu kỳ'); break;
      case 'soften': L.push('cứng ' + fmt(i.hardOut)); break;
      case 'stripper': L.push('pH ' + fmt(i.pHout)); break;
    }
    if (L.length) FS.overlay[u.id] = L;
  }
}

/* ---------------------------------------------------------------- tab Kết quả */
function wRenderRes() {
  const box = $('#tab-res'); box.innerHTML = '';
  if (!WAPP.ss && !WAPP.dyn) { box.appendChild(el(`<div class="card"><h2>Kết quả</h2><p>Chưa có kết quả. Bấm <b>▶ Tính ổn định</b> (thuộc tính dự án) hoặc vào tab <b>Mô phỏng</b>.</p></div>`)); return; }
  if (WAPP.view.ds === 'dyn' && !WAPP.dyn) WAPP.view.ds = 'ss';
  if (WAPP.view.ds === 'ss' && !WAPP.ss) WAPP.view.ds = 'dyn';
  const bar = el(`<div class="card"><div class="row"><label>Bộ kết quả <select id="rDs">${WAPP.ss ? '<option value="ss">Trạng thái ổn định</option>' : ''}${WAPP.dyn ? '<option value="dyn">Theo thời gian</option>' : ''}</select></label><span id="rT" class="row"></span>
    <label><input type="checkbox" id="rOv"${WAPP.view.overlay ? ' checked' : ''}> Hiện kết quả trên sơ đồ</label><label><input type="checkbox" id="rFull"${WAPP.view.full ? ' checked' : ''}> Bảng dòng đầy đủ thành phần</label>
    <button id="rCsv">Xuất bảng dòng CSV</button>${WAPP.stale ? '<span class="msg warn" style="margin:0">Thông số đã thay đổi – kết quả có thể chưa cập nhật</span>' : ''}</div></div>`);
  box.appendChild(bar);
  $('#rDs').value = WAPP.view.ds;
  $('#rDs').onchange = e => { WAPP.view.ds = e.target.value; wOverlay(); wRenderRes(); };
  $('#rOv').onchange = e => { WAPP.view.overlay = e.target.checked; wOverlay(); };
  $('#rFull').onchange = e => { WAPP.view.full = e.target.checked; wRenderResBody(); };
  if (WAPP.view.ds === 'dyn') {
    const n = WAPP.dyn.snaps.length, i = WAPP.view.tIdx < 0 ? n - 1 : WAPP.view.tIdx;
    const rt = $('#rT');
    rt.innerHTML = `<label>t = <b id="rTv">${fmt(WAPP.dyn.snaps[i].t)}</b> h <input type="range" min="0" max="${n - 1}" value="${i}" style="width:260px"></label>`;
    rt.querySelector('input').oninput = e => { WAPP.view.tIdx = +e.target.value; $('#rTv').textContent = fmt(WAPP.dyn.snaps[WAPP.view.tIdx].t); wRenderResBody(); };
  }
  box.appendChild(el(`<div id="resBody"></div>`));
  $('#rCsv').onclick = () => wExportCSV();
  wRenderResBody();
  if (WAPP.view.ds === 'dyn') wRenderDynCharts(box);
}
function wRenderResBody() {
  const box = $('#resBody'); if (!box) return;
  const c = wCur(), sys = c.sys, r = c.r;
  wOverlay();
  const S = WSIM.summary(sys, r);
  let h = '';
  // nước thành phẩm
  for (const p of S.prod) {
    const w = p.w, s = WQ.solve(w), std = WAPP.view.std[p.u.id] || p.u.p.std;
    const rows = WSIM.compliance(w, std);
    h += `<div class="card"><h2>Nước thành phẩm – ${esc(p.u.name)} <span class="small muted">(Q = ${fmt(w.Q)} m³/d)</span></h2><div class="kpis">
      ${kpi('pH', s.pH)}${kpi('Độ đục', s.turb, 'NTU')}${kpi('TDS', s.TDS, 'mg/L')}${kpi('EC', s.EC, 'µS/cm')}${kpi('Độ cứng', s.hard, 'mgCaCO₃/L')}${kpi('Độ kiềm', s.alk, 'mgCaCO₃/L')}
      ${kpi('Clo tự do', w.Cl2f, 'mg/L')}${kpi('Clo tổng', s.Cl2tot, 'mg/L')}${kpi('TOC', s.TOC, 'mgC/L')}${kpi('LSI', s.LSI, '', s.LSI >= -0.5 && s.LSI <= 0.5 ? 'ok' : 'bad')}${kpi('CCPP', WQ.ccpp(w), 'mg/L')}${kpi('THM', w.THM, 'µg/L')}</div>
      <h3>So sánh tiêu chuẩn <select data-std="${p.u.id}">${Object.keys(WSTD).map(k => `<option value="${k}"${k === std ? ' selected' : ''}>${WSTD[k].n}</option>`).join('')}</select></h3>
      <table class="t" style="max-width:760px"><tr><th class="l">Chỉ tiêu</th><th>Giá trị</th><th>Giới hạn</th><th class="l">Đơn vị</th><th class="l">Đánh giá</th></tr>
      ${rows.map(x => `<tr><td class="l">${(WQ.SUMMARY.find(v => v[0] === x.k) || [0, WQ.D[x.k] ? WQ.D[x.k].name : x.k])[1]}</td><td>${x.mic ? fmtLog(x.v) : fmt(x.v)}</td><td>${x.lim}</td><td class="l small muted">${(WQ.SUMMARY.find(v => v[0] === x.k) || [0, 0, WQ.D[x.k] ? WQ.D[x.k].u : ''])[2]}</td><td class="l" style="color:${x.ok ? 'var(--ok)' : 'var(--bad)'}">${x.ok ? 'đạt' : 'không đạt'}</td></tr>`).join('')}</table>
      <p class="small muted">Giới hạn chỉ để tham khảo nhanh – cần đối chiếu văn bản quy chuẩn gốc. Vi sinh lưu ở dạng log₁₀ nồng độ; "không phát hiện" = loại bỏ ≥ 9 log so với nguồn.</p></div>`;
  }
  h += '<div id="fxBox"></div>';     // gợi ý xử lý chỉ tiêu chưa đạt (js/w_fix.js)
  // toàn trạm
  h += `<div class="card"><h2>Toàn trạm ${c.t !== undefined ? '<span class="small muted">(t = ' + fmt(c.t) + ' h)</span>' : ''}</h2><div class="kpis">
    ${kpi('Nước nguồn', S.Qin, 'm³/d')}${kpi('Nước thành phẩm', S.Qprod, 'm³/d')}${kpi('Hiệu suất thu hồi', S.rec, '%')}${kpi('Dòng thải', S.Qwaste, 'm³/d')}
    ${kpi('Công suất điện', S.kW, 'kW')}${kpi('Suất điện năng', S.kWh, 'kWh/m³')}${kpi('Chi phí hóa chất', S.cost / 1e6, 'tr.đ/d')}</div>
    <h3>Hóa chất & vật liệu tiêu hao</h3><table class="t" style="max-width:900px"><tr><th class="l">Hóa chất</th><th class="l">Tại</th><th>Liều mg/L</th><th>kg/d (tinh khiết)</th><th>kg/d thương phẩm</th></tr>
    ${S.chem.map(x => `<tr><td class="l">${esc(x.name)}</td><td class="l">${esc(x.unit)}</td><td>${fmt(x.dose)}</td><td>${fmt(x.kgd)}</td><td>${fmt(x.kgProd)}</td></tr>`).join('') || '<tr><td class="l" colspan="5">—</td></tr>'}</table>
    <h3>Điện năng theo đơn vị</h3><table class="t" style="max-width:600px"><tr><th class="l">Đơn vị</th><th>kW</th><th>kWh/d</th></tr>${S.energyBy.map(e => `<tr><td class="l">${esc(e[0])}</td><td>${fmt(e[1])}</td><td>${fmt(e[1] * 24)}</td></tr>`).join('') || '<tr><td class="l" colspan="3">—</td></tr>'}</table>
    ${S.waste.length ? `<h3>Dòng thải</h3><table class="t" style="max-width:900px"><tr><th class="l">Dòng</th><th>Q m³/d</th><th>TSS mg/L</th><th>Chất rắn kg/d</th><th>TDS mg/L</th></tr>${S.waste.map(x => `<tr><td class="l">${esc(x.u.name)}</td><td>${fmt(x.w.Q)}</td><td>${fmt(WQ.tss(x.w))}</td><td>${fmt(WQ.tss(x.w) * x.w.Q / 1000)}</td><td>${fmt(WQ.solve(x.w).TDS)}</td></tr>`).join('')}</table>` : ''}
    ${r.warns && r.warns.length ? '<h3>Cảnh báo</h3>' + r.warns.map(m => `<div class="msg warn">${esc(m)}</div>`).join('') : ''}</div>`;
  // RO chi tiết
  for (const u of sys.units.filter(x => x.type === 'ro')) {
    const i = r.info[u.id]; if (!i || !i.els) continue;
    h += `<div class="card"><h2>RO/NF – ${esc(u.name)}</h2><div class="kpis">${kpi('Áp suất cấp', i.Pf, 'bar')}${kpi('Áp suất đặc', i.Pc, 'bar')}${kpi('Thu hồi', i.rec, '%')}${kpi('Thông lượng TB', i.Javg, 'L/m²/h')}${kpi('Thông lượng max', i.Jmax, 'L/m²/h')}
      ${kpi('Điện năng', i.kWh, 'kWh/m³')}${kpi('TDS thấm', i.TDSp, 'mg/L')}${kpi('pH thấm', i.pHp)}${kpi('Loại TDS', i.rejTDS, '%')}${kpi('Loại bo', i.rejB, '%')}${kpi('Áp suất thẩm thấu cấp', i.pif, 'bar')}${kpi('Số phần tử', i.nEl, '')}</div>
      <div class="grid2"><div><h3>Cáu cặn dòng đặc ${(i._in && i._in.AS > 0.5) ? '(có chống cáu cặn)' : '(không chống cáu cặn)'}</h3><table class="t"><tr><th class="l">Chỉ số</th><th>Giá trị</th></tr>
      <tr><td class="l">LSI</td><td>${fmt(i.LSIc)}</td></tr><tr><td class="l">SI thạch cao</td><td>${fmt(i.SIgyp)}</td></tr><tr><td class="l">SI BaSO₄</td><td>${fmt(i.SIbar)}</td></tr><tr><td class="l">SI SrSO₄</td><td>${fmt(i.SIcel)}</td></tr><tr><td class="l">SI CaF₂</td><td>${fmt(i.SIflu)}</td></tr><tr><td class="l">Silica</td><td>${fmt(i.Sipct)} %</td></tr><tr><td class="l">TDS đặc</td><td>${fmt(i.TDSc)} mg/L</td></tr></table>
      ${(i.warns || []).map(m => `<div class="msg warn">${esc(m)}</div>`).join('')}</div>
      <div><h3>Từng phần tử</h3><div class="tscroll" style="max-height:300px"><table class="t"><tr><th>Bậc</th><th>PT</th><th>Áp suất bar</th><th>Q vào/ống m³/h</th><th>Thu hồi %</th><th>Thông lượng</th><th>β (CP)</th><th>ΔP bar</th></tr>
      ${i.els.map(e => `<tr><td>${e.st}</td><td>${e.el}</td><td>${fmt(e.P)}</td><td>${fmt(e.qf)}</td><td>${fmt(e.r)}</td><td>${fmt(e.J)}</td><td>${fmt(e.cpf)}</td><td>${fmt(e.dP)}</td></tr>`).join('')}</table></div></div></div></div>`;
  }
  // khử trùng
  const dis = sys.units.filter(x => ['tank', 'ozone', 'uv'].includes(x.type));
  if (dis.length) {
    h += `<div class="card"><h2>Khử trùng & oxy hóa</h2><div class="tscroll"><table class="t"><tr><th class="l">Đơn vị</th><th>CT clo tự do</th><th>CT cloramin</th><th>CT O₃</th><th>Liều UV</th><th>Giardia (CT)</th><th>Virus (CT)</th><th>Crypto (CT)</th><th>Giardia thực</th><th>Virus thực</th><th>Crypto thực</th><th>THM ra</th><th>BrO₃ tạo</th></tr>`;
    for (const u of dis) {
      const i = r.info[u.id] || {}, cr = i.credit || i.logs || {}, lg = i.logs || {};
      h += `<tr><td class="l">${esc(u.name)}</td><td>${fmt(i.CTfree)}</td><td>${fmt(i.CTcam)}</td><td>${fmt(i.CT)}</td><td>${fmt(i.D)}</td><td>${fmt(cr.Giardia)}</td><td>${fmt(cr.Virus)}</td><td>${fmt(cr.Crypto)}</td><td>${fmt(lg.Giardia)}</td><td>${fmt(lg.Virus)}</td><td>${fmt(lg.Crypto)}</td><td>${fmt(i.THM)}</td><td>${fmt(i.BrO3)}</td></tr>`;
    }
    h += `</table></div><p class="small muted">"CT" = tín chỉ quy ước (nồng độ dư đầu ra × T10, bảng EPA nội suy); "thực" = bất hoạt tính theo phơi nhiễm tích phân trong bể. CT đơn vị mg·min/L, log₁₀.</p>`;
    const prof = dis.map(u => [u, r.info[u.id]]).find(([u, i]) => i && i.profile && i.profile.length);
    if (prof) h += `<h3>Diễn biến trong ${esc(prof[0].name)}</h3><div class="chartBox" style="height:280px"><canvas id="profC"></canvas></div>`;
    h += `</div>`;
  }
  // bảng tóm tắt các đơn vị khác
  const others = sys.units.filter(x => ['coag', 'settler', 'soften', 'filter', 'gac', 'ix', 'mf', 'edi', 'stripper', 'remin', 'evap', 'dewater'].includes(x.type));
  if (others.length) {
    h += `<div class="card"><h2>Các đơn vị xử lý</h2><div class="grid2">`;
    for (const u of others) h += `<div><h3>${esc(u.name)} <span class="small muted">${WU[u.type].label}</span></h3>${wUnitInfoHTML(u, r.info[u.id] || {})}</div>`;
    h += `</div></div>`;
  }
  // bảng dòng
  const links = WAPP.P.links.filter(l => r.S[l.id]);
  const vars = WAPP.view.full ? WQ.DEF.map(d => [d[0], d[1], d[2]]) : WQ.SUMMARY;
  const sols = links.map(l => WQ.solve(r.S[l.id]));
  h += `<div class="card"><h2>Bảng các dòng</h2><div class="tscroll"><table class="t"><tr><th class="l">Chỉ tiêu</th><th class="l">Đơn vị</th>${links.map(l => `<th style="white-space:normal;min-width:90px">${esc(wLinkName(l))}</th>`).join('')}</tr>`;
  if (WAPP.view.full) h += `<tr><td class="l"><b>Q</b></td><td class="l small">m³/d</td>${links.map(l => `<td><b>${fmt(r.S[l.id].Q)}</b></td>`).join('')}</tr><tr><td class="l">pH</td><td></td>${sols.map(s => `<td>${fmt(s.pH)}</td>`).join('')}</tr>`;
  for (const v of vars) h += `<tr><td class="l">${v[1]}</td><td class="l small">${v[2]}</td>${links.map((l, j) => `<td>${W_MIC.includes(v[0]) ? fmtLog(r.S[l.id][v[0]]) : fmt(WAPP.view.full ? r.S[l.id][v[0]] : WQ.value(r.S[l.id], v[0], sols[j]))}</td>`).join('')}</tr>`;
  h += `</table></div></div>`;
  box.innerHTML = h;
  box.querySelectorAll('[data-std]').forEach(s => (s.onchange = e => { WAPP.view.std[s.dataset.std] = e.target.value; wRenderResBody(); }));
  const fx = $('#fxBox');
  if (fx && typeof WFIX !== 'undefined') {
    if (c.t === undefined && !WAPP.stale) WFIX.card(fx, WAPP.P, r, pid => WAPP.view.std[pid] || (WAPP.P.units.find(u => u.id === pid) || { p: {} }).p.std || 'none');
    else if (c.t !== undefined && S.prod.some(p => WSIM.compliance(p.w, WAPP.view.std[p.u.id] || p.u.p.std).some(x => !x.ok)))
      fx.innerHTML = '<div class="msg warn">Có chỉ tiêu chưa đạt tại thời điểm này – chọn bộ kết quả "Trạng thái ổn định" để xem gợi ý xử lý và thử biện pháp.</div>';
  }
  const pc = $('#profC');
  if (pc) {
    const pr = dis.map(u => r.info[u.id]).find(i => i && i.profile && i.profile.length).profile;
    const xs = pr.map(p => p.t);
    new LineChart(pc, { xlabel: 'Thời gian (phút)', ylabel: 'mg/L' }).set(['Cl2f', 'NH2Cl', 'NHCl2', 'NCl3', 'NH4', 'O3'].filter(k => pr.some(p => p[k] > 1e-3)).map(k => ({ label: { Cl2f: 'Clo tự do', NH2Cl: 'NH₂Cl', NHCl2: 'NHCl₂', NCl3: 'NCl₃', NH4: 'NH₃-N', O3: 'O₃' }[k], x: xs, y: pr.map(p => p[k]) })));
  }
}
function wExportCSV() {
  const c = wCur(); if (!c) return;
  const links = WAPP.P.links.filter(l => c.r.S[l.id]);
  const lines = ['"Chi tieu","Don vi",' + links.map(l => '"' + wLinkName(l) + '"').join(',')];
  lines.push('pH,-,' + links.map(l => WQ.solve(c.r.S[l.id]).pH.toFixed(3)).join(','));
  lines.push('Q,m3/d,' + links.map(l => c.r.S[l.id].Q.toPrecision(6)).join(','));
  for (const d of WQ.DEF) lines.push(`"${d[1]}","${d[2]}",` + links.map(l => (+c.r.S[l.id][d[0]]).toPrecision(6)).join(','));
  downloadText('bang_dong_simnuoc.csv', '﻿' + lines.join('\n'), 'text/csv');
}

/* đồ thị theo thời gian */
function wSeriesCatalog() {
  const sys = WAPP.dyn.sys, out = [];
  const lv = WQ.SUMMARY.concat(WQ.DEF.filter(d => !WQ.SUMMARY.some(s => s[0] === d[0])).map(d => [d[0], d[1], d[2]]));
  WAPP.P.links.forEach(l => out.push({ key: 'L:' + l.id, name: 'Ống ' + wLinkName(l), vars: lv }));
  for (const u of sys.units) {
    const last = WAPP.dyn.snaps[WAPP.dyn.snaps.length - 1].r.info[u.id] || {};
    const ks = Object.keys(last).filter(k => typeof last[k] === 'number');
    if (ks.length) out.push({ key: 'U:' + u.id, name: 'Đơn vị ' + u.name, vars: ks.map(k => [k, k, '']) });
  }
  WAPP.dyn.ctrls.forEach((c, j) => out.push({ key: 'K:' + j, name: 'Bộ ĐK ' + (c.name || c.id), vars: [['x', 'Tín hiệu tác động (' + c.param + ')', '']] }));
  return out;
}
function wSeriesData(spec) {
  const [kind, id] = spec.key.split(/:(.*)/s);
  return WAPP.dyn.snaps.map(s => {
    if (kind === 'L') { const w = s.r.S[id]; if (!w) return NaN; return W_MIC.includes(spec.v) ? w[spec.v] : WQ.value(w, spec.v); }
    if (kind === 'U') { const i = s.r.info[id]; return i ? i[spec.v] : NaN; }
    if (kind === 'K') return s.cv[+id];
    return NaN;
  });
}
function wRenderDynCharts(box) {
  const cat = wSeriesCatalog();
  const card = el(`<div class="card"><h2>Đồ thị theo thời gian</h2><div class="row"><select id="sObj">${cat.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('')}</select><select id="sVar"></select><button id="sAdd">+ Thêm đường</button><button id="sClr">Xóa hết</button><button id="sPre">Nước thành phẩm</button><button id="sCsv">Xuất CSV</button></div>
    <div class="series-list" id="sList"></div><div class="chartBox" style="height:420px"><canvas id="dynChart"></canvas></div></div>`);
  box.appendChild(card);
  const sObj = card.querySelector('#sObj'), sVar = card.querySelector('#sVar');
  const fill = () => { const c = cat[+sObj.value]; sVar.innerHTML = c.vars.map(v => `<option value="${v[0]}">${v[1]}${v[2] ? ' [' + v[2] + ']' : ''}</option>`).join(''); };
  sObj.onchange = fill; fill();
  const ch = new LineChart(card.querySelector('#dynChart'), { xlabel: 'Thời gian (giờ)', zero: false });
  const xs = WAPP.dyn.snaps.map(s => s.t);
  const redraw = () => {
    const list = card.querySelector('#sList'); list.innerHTML = '';
    WAPP.view.series.forEach((s, i) => {
      const chip = el(`<span class="chip"><b style="background:${PALETTE[i % PALETTE.length]}"></b>${esc(s.label)}<button title="Bỏ">✕</button></span>`);
      chip.querySelector('button').onclick = () => { WAPP.view.series.splice(i, 1); redraw(); };
      list.appendChild(chip);
    });
    ch.set(WAPP.view.series.map(s => ({ label: s.label, x: xs, y: wSeriesData(s) })), { ylabel: [...new Set(WAPP.view.series.map(s => s.u))].join(' · ') });
  };
  const add = (key, v) => { const c = cat.find(x => x.key === key); if (!c) return; const vv = c.vars.find(x => x[0] === v); if (!vv || WAPP.view.series.some(s => s.key === key && s.v === v)) return; WAPP.view.series.push({ key, v, u: vv[2], label: c.name + ' · ' + vv[1] }); };
  card.querySelector('#sAdd').onclick = () => { add(cat[+sObj.value].key, sVar.value); redraw(); };
  card.querySelector('#sClr').onclick = () => { WAPP.view.series = []; redraw(); };
  card.querySelector('#sPre').onclick = () => {
    WAPP.view.series = [];
    WAPP.P.links.filter(l => (wUnit(l.to[0]) || {}).type === 'product').forEach(l => ['turb', 'Cl2tot', 'pH'].forEach(v => add('L:' + l.id, v)));
    redraw();
  };
  card.querySelector('#sCsv').onclick = () => {
    if (!WAPP.view.series.length) return;
    const cols = WAPP.view.series.map(s => wSeriesData(s));
    const lines = ['t_gio,' + WAPP.view.series.map(s => '"' + s.label + '"').join(',')];
    xs.forEach((t, i) => lines.push([t].concat(cols.map(c => +(+c[i]).toPrecision(6))).join(',')));
    downloadText('theo_thoi_gian.csv', '﻿' + lines.join('\n'), 'text/csv');
  };
  if (!WAPP.view.series.length) card.querySelector('#sPre').click(); else redraw();
}

/* ---------------------------------------------------------------- tab Công cụ */
function wRenderTools() {
  const box = $('#tab-tools'); box.innerHTML = '';
  const P = WAPP.P;
  // 1. Quét thông số
  const sw = P.sweep || (P.sweep = { unit: (P.units.find(u => u.type === 'dose') || P.units[0] || {}).id, param: 'dose', from: 0, to: 10, n: 21, ref: P.links.length ? P.links[P.links.length - 1].id : '', vars: ['Cl2tot', 'Cl2f'] });
  const c1 = el(`<div class="card"><h2>Quét thông số (độ nhạy)</h2><p class="small muted">Giải trạng thái ổn định cho dãy giá trị một thông số (bộ điều khiển tạm tắt). Ví dụ đường cong clo hóa điểm đột biến: mẫu "Hướng dẫn: clo hóa điểm đột biến".</p>
    <div class="row"><label>Đơn vị <select id="wU">${P.units.filter(u => wNumFields(u).length).map(u => `<option value="${u.id}"${u.id === sw.unit ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
    <label>Thông số <select id="wP"></select></label><label>Từ <input type="number" step="any" id="wF" value="${sw.from}" style="width:80px"></label><label>Đến <input type="number" step="any" id="wT" value="${sw.to}" style="width:80px"></label><label>Số điểm <input type="number" id="wN" value="${sw.n}" style="width:60px"></label></div>
    <div class="row" style="margin-top:6px"><label>Điểm đo <select id="wR" style="max-width:320px">${wRefOptions(sw.ref)}</select></label><label>Biến <select id="wV" multiple size="5" style="min-width:240px">${W_MEAS.map(v => `<option value="${v[0]}"${sw.vars.includes(v[0]) ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></label><button class="pri" id="wGo">▶ Quét</button></div>
    <div class="chartBox" style="height:360px;margin-top:10px"><canvas id="wC"></canvas></div><div id="wTab"></div></div>`);
  box.appendChild(c1);
  const fillP = () => { const u = wUnit(c1.querySelector('#wU').value); c1.querySelector('#wP').innerHTML = u ? wNumFields(u).map(f => `<option value="${f[0]}"${f[0] === sw.param ? ' selected' : ''}>${f[1]}</option>`).join('') : ''; };
  c1.querySelector('#wU').onchange = fillP; fillP();
  const chart = new LineChart(c1.querySelector('#wC'), { xlabel: 'Giá trị thông số', zero: true });
  c1.querySelector('#wGo').onclick = () => {
    sw.unit = c1.querySelector('#wU').value; sw.param = c1.querySelector('#wP').value; sw.from = +c1.querySelector('#wF').value; sw.to = +c1.querySelector('#wT').value; sw.n = Math.max(2, Math.min(200, +c1.querySelector('#wN').value));
    sw.ref = c1.querySelector('#wR').value; sw.vars = [...c1.querySelector('#wV').selectedOptions].map(o => o.value);
    wSave();
    const sys = WSIM.compile(P); if (sys.errors.length) { alert(sys.errors.join('\n')); return; }
    const u = sys.byId[sw.unit], old = u.p[sw.param];
    const xs = [], ys = sw.vars.map(() => []);
    let prev = null;
    for (let k = 0; k < sw.n; k++) {
      const x = sw.from + (sw.to - sw.from) * k / (sw.n - 1); u.p[sw.param] = x;
      const r = WSIM.solve(sys, { prevS: prev }); prev = r.S;
      xs.push(x); sw.vars.forEach((v, j) => ys[j].push(WSIM.measure(sys, r, sw.ref, v)));
    }
    u.p[sw.param] = old;
    const pn = (wNumFields(u).find(f => f[0] === sw.param) || [0, sw.param])[1];
    chart.set(sw.vars.map((v, j) => ({ label: (W_MEAS.find(m => m[0] === v) || [0, v])[1], x: xs, y: ys[j], marks: true })), { xlabel: u.name + ' · ' + pn });
    c1.querySelector('#wTab').innerHTML = `<div class="tscroll" style="max-height:260px;margin-top:8px"><table class="t"><tr><th>${esc(pn)}</th>${sw.vars.map(v => `<th>${(W_MEAS.find(m => m[0] === v) || [0, v])[1]}</th>`).join('')}</tr>${xs.map((x, i) => `<tr><td>${fmt(x)}</td>${ys.map(y => `<td>${fmt(y[i])}</td>`).join('')}</tr>`).join('')}</table></div>`;
  };
  // 2. Máy tính hóa nước & liều hóa chất
  const c2 = el(`<div class="card"><h2>Máy tính hóa học nước – liều hóa chất đạt pH / ổn định CaCO₃</h2>
    <div class="row"><label>Mẫu nước <select id="qS">${WAPP.ss ? WAPP.P.links.filter(l => WAPP.ss.S[l.id]).map(l => `<option value="${l.id}">Ống: ${esc(wLinkName(l))}</option>`).join('') : ''}${P.units.filter(u => u.type === 'source').map(u => `<option value="S:${u.id}">Nguồn: ${esc(u.name)}</option>`).join('')}</select></label>
    <label>Hóa chất <select id="qC">${Object.keys(WCHEM).filter(k => WCHEM[k].acid || WCHEM[k].base).map(k => `<option value="${k}">${WCHEM[k].n}</option>`).join('')}</select></label><label>pH mục tiêu <input type="number" step="any" id="qP" value="8.0" style="width:70px"></label><button class="pri" id="qGo">Tính</button></div><div id="qOut"></div></div>`);
  box.appendChild(c2);
  c2.querySelector('#qGo').onclick = () => {
    const sv = c2.querySelector('#qS').value; if (!sv) return;
    const w = sv.startsWith('S:') ? WQ.copy(wCharacterize(wUnit(sv.slice(2)).p).w) : WQ.copy(WAPP.ss.S[sv]);
    const ch = WCHEM[c2.querySelector('#qC').value], tgt = +c2.querySelector('#qP').value;
    const s0 = WQ.solve(w);
    const x = WQ.solveDose(w, (y, xx) => ch.add(y, xx), tgt, 50);
    const w1 = WQ.copy(w); ch.add(w1, x); const s1 = WQ.solve(w1);
    const row = (n, a, b, u) => `<tr><td class="l">${n}</td><td>${fmt(a)}</td><td>${fmt(b)}</td><td class="l small">${u}</td></tr>`;
    c2.querySelector('#qOut').innerHTML = `<div class="kpis" style="margin-top:10px">${kpi('Liều cần', x * ch.M, 'mg/L')}${kpi('Theo mol', x, 'mmol/L')}</div>
      <table class="t" style="max-width:640px;margin-top:8px"><tr><th class="l">Chỉ tiêu</th><th>Trước</th><th>Sau</th><th class="l"></th></tr>
      ${row('pH', s0.pH, s1.pH, '')}${row('Độ kiềm', s0.alk, s1.alk, 'mgCaCO₃/L')}${row('Độ cứng', s0.hard, s1.hard, 'mgCaCO₃/L')}${row('CO₂ tự do', s0.CO2, s1.CO2, 'mg/L')}${row('LSI', s0.LSI, s1.LSI, '')}${row('RSI', s0.RSI, s1.RSI, '')}${row('CCPP', WQ.ccpp(w), WQ.ccpp(w1), 'mgCaCO₃/L')}${row('TDS', s0.TDS, s1.TDS, 'mg/L')}${row('EC', s0.EC, s1.EC, 'µS/cm')}</table>`;
  };
}

/* ---------------------------------------------------------------- Hướng dẫn */
function wRenderHelp() {
  $('#tab-help').innerHTML = `<div class="card"><h2>SimNước – mô phỏng xử lý nước cấp, tái sử dụng và nước siêu sạch</h2>
  <p>Công cụ nghiên cứu cá nhân, chức năng tương tự nhóm phần mềm mô phỏng nước sạch thương mại: sơ đồ công nghệ kéo-thả, mô hình hóa học nước đầy đủ ion, các quá trình vật lý – hóa học – sinh học, tính trạng thái ổn định có vòng tuần hoàn và bộ điều khiển, mô phỏng theo thời gian, công cụ quét thông số. Mô hình được tự xây dựng từ tài liệu công bố; không sao chép mã hay dữ liệu của phần mềm thương mại.</p>
  <h3>Quy trình</h3><ol><li><b>Sơ đồ</b>: kéo đơn vị từ thanh bên, nối cửa ra ● với cửa vào ○, sửa thông số ở khung bên phải. Có thể mở <b>Sơ đồ mẫu</b>.</li>
  <li><b>Nước nguồn</b>: nhập phân tích (ion chính, pH, độ kiềm, hữu cơ, vi sinh, vi chất); chương trình tính TIC, cân bằng điện tích, chỉ số bão hòa.</li>
  <li><b>Gợi ý xử lý chỉ tiêu chưa đạt</b> (tab Kết quả, trạng thái ổn định): khi nước thành phẩm vượt tiêu chuẩn đang chọn, chương trình nêu nguyên nhân thường gặp và đề xuất biện pháp vận hành (giá trị đặt, chế độ pH tự động, tỷ lệ thu hồi RO, liều UV…), hóa chất (châm clo + bộ điều khiển, NaOH/axit, KMnO₄, cloramin, keo tụ tăng cường…), công trình (chèn UF, GAC, trao đổi ion khử nitrat/làm mềm/mixed bed/PFAS, RO, UV trước nước thành phẩm – kích thước sơ bộ). Mỗi biện pháp được thử trên bản sao dự án (ổn định có bộ điều khiển): chỉ tiêu trước → sau, chỉ tiêu mới vượt, Δ điện, Δ hóa chất, Δ thu hồi; phương án kết hợp nhiều bước (lập lại biện pháp trên sơ đồ đã sửa, ví dụ RO rồi mixed bed). Nút "Áp dụng" ghi vào dự án và tính lại.</li>
  <li><b>Điều khiển</b>: bộ điều khiển (ví dụ giữ clo dư bằng liều NaOCl, pH bằng axit) và kịch bản theo thời gian. Nút <b>Gợi ý bộ điều khiển phù hợp sơ đồ</b> đọc sơ đồ và đề xuất các vòng thông dụng: clo dư sau bể tiếp xúc/nước thành phẩm (clo tổng khi có cloramin), clo hóa sơ bộ trước RO, pH keo tụ (theo loại phèn), liều keo tụ theo độ đục nước lắng, khử clo NaHSO₃ trước RO, pH nước cấp RO, độ kiềm sau tái khoáng CO₂ – calcit, ổn định nước thành phẩm (LSI/pH), độ cứng sau làm mềm vôi, ozone dư, mangan – KMnO₄, florua, phosphat ức chế ăn mòn, F sau kết tủa CaF₂, TDS sau pha trộn dòng tắt quanh RO/IX, tỷ lệ thu hồi RO theo LSI nước đặc (tối ưu hóa). Mỗi đề xuất được <i>thử số trên chính sơ đồ</i> (giải ổn định ở min, giữa, max): chiều tác động thuận/nghịch, Kp = 0,25/hệ số khuếch đại, Ti ≥ 4 bước thời gian, giá trị đặt có đạt được không, quan hệ có đơn điệu không (ví dụ liều keo tụ đang ở mức tối ưu thì không nên điều khiển theo độ đục). Nút <b>Kiểm tra bộ điều khiển</b> áp dụng cùng phép thử cho các bộ đã có (chiều sai, Ti quá ngắn, giá trị đặt ngoài tầm, đơn vị châm không ở chế độ liều cố định…) kèm nút sửa nhanh.</li>
  <li><b>Mô phỏng</b>: trạng thái ổn định hoặc chạy theo thời gian.</li><li><b>Kết quả</b>: chất lượng nước thành phẩm so với tiêu chuẩn, năng lượng, hóa chất, RO từng phần tử, CT khử trùng, bảng dòng; đồ thị theo thời gian.</li></ol>
  <h3>Liên kết với SimXLNT (chuỗi công nghệ)</h3><ol><li>Trong SimXLNT, tính ổn định (hoặc chạy động) sơ đồ trạm xử lý nước thải.</li><li>Tab Kết quả → <b>Gửi nước ra sang SimNước</b> (chọn dòng nước ra). Dữ liệu (trung bình và chuỗi động nếu có) được lưu vào bộ nhớ trình duyệt và có thể tải tệp <code>.bridge.json</code>.</li>
  <li>Trong SimNước, dùng đơn vị <b>Nước ra từ SimXLNT</b> (mẫu "Chuỗi SimXLNT → UF – RO – AOP") và bấm <b>Nhập từ SimXLNT</b>. Các thành phần SimXLNT không mô phỏng (Ca, Mg, Na, Cl, SO₄, vi sinh, vi chất) lấy từ "thành phần nền" chỉnh được; điện tích được cân bằng theo pH của SimXLNT.</li>
  <li>Khi chạy theo thời gian, nguồn này lặp lại chuỗi động của SimXLNT (theo ngày).</li></ol>
  <h3>Mô hình chính</h3><ul>
  <li><b>Hóa học nước</b>: cân bằng điện tích đầy đủ (Ca, Mg, Na, K, NH₄/NH₃, Fe²⁺, Mn²⁺, Ba, Sr, Cl, SO₄, NO₃, NO₂, F, Br, cacbonat, phosphat, silicat, borat, HOCl/OCl⁻, H₂S/HS⁻); hằng số theo nhiệt độ (Plummer & Busenberg 1982 cho hệ cacbonat); hoạt độ Davies; cặp ion cho chỉ số bão hòa; LSI, RSI, CCPP, SI calcit/thạch cao/barit/celestit/fluorit/brucit, silica; áp suất thẩm thấu; EC ước tính.</li>
  <li><b>Keo tụ</b>: kết tủa Fe(OH)₃/Al(OH)₃ theo độ hòa tan; loại NOM theo Edwards (1997) (phần không hấp phụ theo SUVA, hấp phụ Langmuir phụ thuộc pH); hấp phụ P lên bông; "mức keo tụ" quyết định hiệu suất lắng/lọc.</li>
  <li><b>Lắng/DAF/lamella</b>: hiệu suất theo tỉ số tốc độ lắng của bông/tải bề mặt. <b>Lọc nhanh</b>: hệ số lọc λ, tổn thất áp lực Carman–Kozeny + tích lũy cặn, chu kỳ lọc, nước rửa; lọc sinh học (BDOC, nitrat hóa, H₂S, Mn trên MnOx).</li>
  <li><b>Làm mềm vôi–soda</b>: kết tủa cân bằng CaCO₃ (quá bão hòa dư), Mg(OH)₂, đồng loại bỏ silica/NOM; liều vôi theo pH sau kết tủa.</li>
  <li><b>Kết tủa fluorit CaF₂</b> (bể phản ứng kết tủa, CSTR nối tiếp): F⁻/HF theo pH (pKa 3,17), Ksp CaF₂ = 10⁻¹⁰·⁵ hiệu chỉnh nhiệt độ (ΔH = 8 kJ/mol); tốc độ kết tủa q·DF² với DF = ((a_Ca·a_F²)^⅓ − Ksp^⅓)/Ksp^⅓, keo mới tạo hòa tan lại khi chưa bão hòa; keo CaF₂ lắng rất kém (≈ 0,05 m/h) và chỉ thành bông dễ lắng khi gặp Al(OH)₃/Fe(OH)₃/polymer (keo tụ tỉ lệ với lượng bông kim loại). Mỗi ngăn giải cân bằng khối lượng ổn định → số ngăn và thời gian lưu ảnh hưởng mạnh. Mẫu "Nước thải công nghiệp: kết tủa fluorit CaF₂"; so sánh QCVN 40:2011 cột A/B (tham khảo).</li>
  <li><b>Nhập bảng tính thiết kế (tab Bảng tính)</b>: kéo-thả tệp .xlsx của bảng tính công nghệ trạm xử lý nước mặt (sheet 01_DauVao, 02_CanBang, 03_HoaChat, 04_BeTron, 05_TaoBong, 06_Lang…, 07_BeLoc, 09_RuaLoc, 10_KhuTrung, 11_Bun, 14_DanhSachBe, 16_CanBangNuoc, 20_ChiPhiVanHanh). Thông số tra theo tên (cột B) và giá trị đã tính (cột D); liệt kê nguồn từng thông số (bảng tính / suy ra / mặc định / thiếu), cho sửa tay. Tự dựng sơ đồ: bơm cấp I → PAC (quy đổi % Al₂O₃ → mg Al) → clo sơ bộ → polymer → trộn + phản ứng → lắng (lamella: hệ số diện tích = diện tích lắng hiệu dụng / mặt bằng) → lọc → vôi (CaO → Ca(OH)₂) → clo chính (bộ điều khiển giữ clo dư thiết kế) → bể chứa → bơm cấp II; nước rửa lọc qua bể thu hồi tuần hoàn, bùn cô đặc + ly tâm, nước tách tuần hoàn. So sánh: nước phát ra, tải trọng lắng, hiệu suất lắng, nước xả bùn, vận tốc lọc, tổn thất lọc sạch, chu kỳ lọc, nước rửa, bùn khô/bánh bùn/polymer, clo dư, CT, lượng hóa chất, điện bơm cấp I/II, và độ đục/pH/nhôm nước thành phẩm theo QCVN 01-1:2018.</li>
  <li><b>UF đơn giản</b>: tách tức thời theo % giữ chất rắn và % giữ keo, thu hồi cho trước (lọc chặn đầu 92,5 % / dòng chéo 95 %), năng lượng bơm cấp theo áp suất & hiệu suất bơm, bơm rửa ngược (kWh/m³) và sục khí rửa (khí mỗi dàn × phần thời gian sục × tỉ lệ rửa ngược). Dùng khi chỉ cần cân bằng khối lượng – năng lượng; cần TMP/CIP thì dùng "Màng MF / UF".</li>
  <li><b>Hóa chất</b>: HCl, H₂SO₄, HNO₃, CO₂, NaOH, Ca(OH)₂, Mg(OH)₂, Na₂CO₃, NaHCO₃, NH₄HCO₃, CaCl₂, MgCl₂, KNO₃, KNO₂, FeCl₃, Fe₂(SO₄)₃, FeCl₂, FeSO₄, phèn nhôm, AlCl₃, PACl, NaOCl, Cl₂, NH₄Cl, (NH₄)₂SO₄, NH₃, KMnO₄, NaHSO₃, H₂O₂, NaF, H₃PO₄, chống cáu cặn, polymer, than bột.</li>
  <li><b>GAC/BAC</b>: dung lượng Freundlich, đường cong thoát dạng logistic theo số thể tích lớp (BV), cạnh tranh DOC, nhiều bể so le, suất tiêu hao than (CUR); BAC phân hủy BDOC, nitrat hóa; khử clo/ozone trên than.</li>
  <li><b>Trao đổi ion</b>: SAC-Na, SAC-H, WAC-H, SBA-OH, SBA-Cl, mixed bed, nhựa PFAS; chu kỳ làm việc từ dung lượng/tải ion, hóa chất tái sinh, nước thải tái sinh; mô phỏng thời gian có cạn kiệt và tái sinh.</li>
  <li><b>MF/UF</b>: LRV, trở lực nối tiếp (màng + bánh + không thuận nghịch), TMP, CIP. <b>RO/NF</b>: mô hình hòa tan–khuếch tán theo từng phần tử (A, B theo nhóm ion, hiệu chỉnh nhiệt độ, phân cực nồng độ β = e^0,7r, tổn thất áp, áp suất thẩm thấu), tìm áp suất cấp theo hiệu suất thu hồi, bơm tăng áp giữa bậc, thu hồi năng lượng, chỉ số cáu cặn dòng đặc, CO₂/NH₃/B(OH)₃ đi qua màng, bám bẩn theo thời gian. <b>EDI</b>, <b>cô đặc bay hơi</b>.</li>
  <li><b>Clo/cloramin</b>: HOCl + NH₃ → NH₂Cl, NH₂Cl + HOCl → NHCl₂, NHCl₂ + NH₂Cl → N₂ (điểm đột biến ~7,6 mg Cl₂/mg N), NCl₃, phân ly NH₂Cl; nhu cầu clo nhanh và chậm của NOM; oxy hóa Fe²⁺, Mn²⁺, NO₂⁻, H₂S; THM theo lượng clo phản ứng với NOM; bể dòng đẩy hoặc khuấy trộn (mô hình dòng phân tách); CT và tín chỉ bất hoạt theo bảng EPA nội suy.</li>
  <li><b>Ozone</b>: nhu cầu tức thời, phân hủy bậc nhất phụ thuộc DOC/pH, CT, log bất hoạt theo công thức LT2, bromat (Amy và cs., 1994), phơi nhiễm OH (Rct) cho vi chất, peroxone. <b>UV/UV-AOP</b>: liều theo UVT, bảng liều – log bất hoạt, khử vi chất qua quang phân + OH.</li>
  <li><b>Khử khí/làm thoáng</b>: tháp đệm ngược chiều (hệ số tách S = H·G/L, NTU) hoặc giàn mưa, CO₂/H₂S/CH₄/NH₃/O₂/THM với cân bằng pH theo từng đoạn. <b>Tái khoáng</b>: hòa tan calcit tới cân bằng (CCPP).</li></ul>
  <h3>Giới hạn</h3><p class="small">Đây là mô hình đơn giản hóa phục vụ nghiên cứu, cần hiệu chỉnh bằng số liệu thực tế. Các hệ số (λ lọc, Freundlich, B của màng, động học clo…) là giá trị điển hình, chỉnh được ở phần thông số nâng cao. Giới hạn tiêu chuẩn chỉ để tham khảo nhanh.</p></div>`;
}
