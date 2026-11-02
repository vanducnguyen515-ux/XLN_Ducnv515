'use strict';
/* ==========================================================================
   SimXLNT – Giao diện chính
   ========================================================================== */
const APP = {
  P: null, ss: null, dyn: null, lastY: null, running: false, abortFlag: false, stale: false,
  view: { dataset: 'ss', tIdx: -1, series: [], showStates: false, overlay: true, inputUnit: null },
  limits: { COD: 75, BOD5: 30, TSS: 50, NH4: 5, TN: 20, TP: 4 }
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function fmt(v) {
  if (v === undefined || v === null || typeof v !== 'number' || !isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a < 1e-9) return '0';   // nhiễu làm tròn của bộ giải (vd 5e-15)
  if (a < 0.001) return v.toExponential(2);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3;
  return v.toLocaleString('vi-VN', { maximumFractionDigits: d });
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function curModel() { return MODELS[APP.P.model]; }
function unitById(id) { return APP.P.units.find(u => u.id === id); }
function linkName(l) {
  const a = unitById(l.from[0]), b = unitById(l.to[0]);
  const ps = { eff: ' (tràn)', und: ' (đáy)', ovf: ' (tràn)', a: ' (A)', b: ' (B)' }[l.from[1]] || '';
  return (a ? a.name : '?') + ps + ' → ' + (b ? b.name : '?');
}

/* ---------------------------------------------------------------- lưu trữ */
const LS_KEY = 'simxlnt.project.v1';
let _saveT = null;
function saveLocal() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(APP.P)); } catch (e) { /* bỏ qua */ } }, 400);
}
function loadLocal() { try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function normalizeProject(P) {
  P.params = P.params || {}; P.params.ASM1 = P.params.ASM1 || {}; P.params.ASM2d = P.params.ASM2d || {};
  P.plant = Object.assign(PLANT_DEF(), P.plant || {});
  P.sim = Object.assign({ days: 7, dtOut: 1 / 96, rtol: 1e-4, atol: 1e-3, init: 'ss' }, P.sim || {});
  P.units = (P.units || []).filter(u => UT[u.type]);
  for (const u of P.units) {
    u.p = Object.assign(UT[u.type].def(), u.p || {});
    if (u.type === 'influent') { u.p.inf = Object.assign(INF.defaults(), u.p.inf || {}); u.p.inf.pat = Object.assign(INF.defaults().pat, u.p.inf.pat || {}); u.p.inf.st = u.p.inf.st || {}; }
  }
  P.links = P.links || [];
  P.ctrls = P.ctrls || [];
  P.params.ADM1 = P.params.ADM1 || {};
  for (const id in MODELS) P.params[id] = P.params[id] || {};
  // dự án cũ: bể phân hủy mô hình rút gọn → ADM1
  // dự án cũ: "tỷ lệ theo dòng vào" ≥ 1 (vd retentate 4, IR 3) luôn cho dòng âm – ý định là bội số Q vào trạm → chuyển sang chế độ ×Q
  for (const u of P.units) {
    if ((u.type === 'mbr' || u.type === 'clarifier') && u.p.uMode === 'ratio' && +u.p.uR >= 1) { u.p.uMode = 'rQ'; u.p.uK = +u.p.uR; }
    if (u.type === 'splitter' && u.p.mode === 'frac' && +u.p.frac > 1) { u.p.mode = 'rQ'; u.p.kQ = +u.p.frac; }
  }
  for (const u of P.units) if (u.type === 'digester') { ['kHyd', 'bDig', 'kAc', 'pCO2', 'kLaCO2'].forEach(k => delete u.p[k]); if (!(+u.p.Vgas > 0)) u.p.Vgas = Math.round(+u.p.V * 0.1); }
  if (!MODELS[P.model]) P.model = 'ASM2d';
  return P;
}
function setProject(P) {
  APP.P = normalizeProject(P);
  APP.ss = null; APP.dyn = null; APP.lastY = null; APP.stale = false;
  APP.view.series = []; APP.view.dataset = 'ss'; APP.view.inputUnit = null;
  FS.sel = null; FS.overlay = null; FS.qlabels = null;
  renderAll();
  saveLocal();
}
function changed(what) {
  APP.stale = !!(APP.ss || APP.dyn);
  saveLocal();
  updateFooter();
  if (what !== 'move') renderProps();
}

/* ---------------------------------------------------------------- khởi tạo */
window.addEventListener('DOMContentLoaded', () => {
  const sel = $('#selTpl');
  TEMPLATE_LIST.forEach(([k, n]) => sel.appendChild(el(`<option value="${k}">${n}</option>`)));
  // ví dụ SUMO24 (dữ liệu rút gọn js/sumo_examples.js) – dựng tự động bằng SUMOIMP, kèm bảng đối chiếu kết quả SUMO
  if (typeof SUMO_EX !== 'undefined' && typeof SUMOIMP !== 'undefined') {
    const CAT = { '10 Tutorial plants': 'Hướng dẫn', '20 Nutrient removal plants': 'Khử N, P', '30 Biofilm plants': 'Màng sinh học', '40 SBR plants': 'SBR', '50 Nature-based solutions': 'Hồ / tự nhiên', '60 Controllers': 'Điều khiển', '70 Lab tests': 'Thí nghiệm', '80 Digestion and Energy': 'Phân hủy & năng lượng', '90 Miscellaneous': 'Khác', '95 Advanced simulations': 'Nâng cao' };
    const og = el('<optgroup label="Ví dụ SUMO24 – dựng tự động & đối chiếu kết quả SUMO"></optgroup>');
    SUMO_EX.forEach(e => og.appendChild(el(`<option value="sumo:${e.key}">SUMO · ${CAT[e.cat] || e.cat} · ${esc(e.title)} (${e.model} → ${SUMOIMP.simModel(e.model)}${e.ss && !e.ss.steady ? ', không có trạng thái ổn định' : ''})</option>`)));
    sel.appendChild(og);
  }
  sel.onchange = () => {
    if (!sel.value) return;
    if (APP.P && APP.P.units.length && !confirm('Mở sơ đồ mẫu sẽ thay thế dự án hiện tại. Tiếp tục?')) { sel.value = ''; return; }
    if (sel.value.startsWith('sumo:')) {
      const e = SUMO_EX.find(x => x.key === sel.value.slice(5));
      try { setProject(SUMOIMP.build(e)); showTab('bt'); } catch (err) { alert('Không dựng được sơ đồ từ ví dụ SUMO: ' + err.message); }
    } else setProject(TEMPLATES[sel.value]());
    sel.value = '';
  };
  $('#btnNew').onclick = () => { if (confirm('Tạo dự án trống? Dự án hiện tại sẽ bị thay thế (hãy Lưu trước nếu cần).')) setProject(TEMPLATES.empty()); };
  $('#btnSave').onclick = () => downloadText((APP.P.name || 'du_an').replace(/[^\w\-À-ỹ ]+/g, '_') + '.simxlnt.json', JSON.stringify(APP.P, null, 1), 'application/json');
  $('#btnOpen').onclick = () => $('#fileOpen').click();
  $('#fileOpen').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    if (/\.sumo$/i.test(f.name)) {          // dự án SUMO (Dynamita) → dựng sơ đồ + bảng đối chiếu
      rd.onload = async () => { try { setProject(await SUMOIMP.fromFile(rd.result, f.name)); showTab('bt'); } catch (err) { alert('Không đọc được tệp SUMO: ' + err.message); } };
      rd.readAsArrayBuffer(f); e.target.value = ''; return;
    }
    rd.onload = () => { try { setProject(JSON.parse(rd.result)); } catch (err) { alert('Không đọc được tệp: ' + err.message); } };
    rd.readAsText(f); e.target.value = '';
  };
  $$('#tabs button').forEach(b => (b.onclick = () => showTab(b.dataset.t)));
  // bảng công cụ
  const pal = $('#palette');
  const groups = {};
  for (const k in UT) (groups[UT[k].group] = groups[UT[k].group] || []).push(k);
  for (const g in groups) {
    pal.appendChild(el(`<h4>${g}</h4>`));
    for (const k of groups[g]) {
      const it = el(`<div class="pi" draggable="true" title="Kéo vào sơ đồ hoặc bấm để thêm">${FS.paletteIcon(k)}<span>${UT[k].label}</span></div>`);
      it.addEventListener('dragstart', e => e.dataTransfer.setData('text/unit', k));
      it.addEventListener('click', () => { const w = $('#canvasWrap'); FS.addUnit(k, w.scrollLeft + 140 + Math.random() * 200, w.scrollTop + 120 + Math.random() * 200); });
      pal.appendChild(it);
    }
  }
  pal.appendChild(el(`<p class="small muted" style="margin-top:14px">Kéo từ cửa ra <b>●</b> (đen) tới cửa vào <b>○</b> để nối ống. Chọn rồi nhấn <code>Delete</code> để xóa.</p>`));
  FS.init($('#canvasWrap'), () => APP.P);
  FS.onSelect = () => renderProps();
  FS.onChange = w => changed(w);
  const P = loadLocal();
  setProject(P || TEMPLATES.bsm1());
  if (typeof renderHelp === 'function') renderHelp();
});

function showTab(t) {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $$('section.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + t));
  if (t === 'model') renderModel();
  if (t === 'input') renderInput();
  if (t === 'sim') renderSim();
  if (t === 'res') renderRes();
  if (t === 'tools' && typeof renderTools === 'function') renderTools();
  if (t === 'ctrl') renderCtrl();
  if (t === 'bt') renderBT();
  if (t === 'fs') { updateOverlay(); FS.render(); }
}
function renderAll() {
  $('#hdrName').textContent = APP.P.name || '';
  updateOverlay(); FS.render(); renderProps(); updateFooter();
  const on = $('#tabs button.on').dataset.t;
  if (on !== 'fs') showTab(on);
}
function updateFooter() {
  const m = curModel();
  $('#ftModel').textContent = 'Mô hình: ' + m.id + ' · ' + m.n + ' biến · ' + m.np + ' quá trình';
  let s = APP.ss ? 'Có kết quả ổn định' : 'Chưa mô phỏng';
  if (APP.dyn) s += ' · có kết quả động ' + fmt(APP.dyn.times[APP.dyn.times.length - 1]) + ' ngày';
  if (APP.stale) s += ' · ⚠ sơ đồ/thông số đã thay đổi sau lần chạy cuối';
  $('#ftState').textContent = s;
  $('#hdrName').textContent = APP.P.name || '';
}

/* ---------------------------------------------------------------- biểu mẫu */
function buildForm(fields, obj, onChange, opts = {}) {
  const box = el(`<div class="frm${opts.wide ? ' wide' : ''}"></div>`);
  const adv = el(`<details class="adv full"><summary>Thông số nâng cao</summary><div class="frm"></div></details>`);
  let hasAdv = false;
  for (const f of fields) {
    if (f.show && !f.show(obj)) continue;
    if (f.only && f.only !== opts.model) continue;
    const tgt = f.adv ? adv.querySelector('.frm') : box;
    if (f.adv) hasAdv = true;
    const unit = f.hint ? f.hint(obj) : f.u;
    const lab = el(`<label title="${f.k}">${f.l}${unit ? `<span class="u">${unit}</span>` : ''}</label>`);
    let inp;
    if (f.t === 'ro') {
      const v = +obj[f.k];
      inp = el(`<output class="ro">${isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(1) : +v.toPrecision(4)) : '–'}</output>`);
    } else if (f.t === 'sel') {
      const opts = f.optsFn ? f.optsFn(obj) : f.opts;
      if (f.optsFn && opts.length && !opts.some(o => o[0] === obj[f.k])) obj[f.k] = opts[0][0];
      inp = el(`<select>${opts.map(o => `<option value="${o[0]}"${obj[f.k] === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>`);
      inp.onchange = () => { obj[f.k] = inp.value; onChange(f.k, true); };
    } else if (f.t === 'text') {
      inp = el(`<input type="text">`); inp.value = obj[f.k] || '';
      inp.onchange = () => { obj[f.k] = inp.value; onChange(f.k, false); };
    } else {
      inp = el(`<input type="number" step="any">`); inp.value = obj[f.k];
      inp.onchange = () => { const v = parseFloat(inp.value); if (isFinite(v)) { obj[f.k] = v; onChange(f.k, false); } else inp.value = obj[f.k]; };
    }
    tgt.appendChild(lab); tgt.appendChild(inp);
  }
  if (hasAdv) box.appendChild(adv);
  return box;
}

/* ---------------------------------------------------------------- bảng thuộc tính */
function renderProps() {
  const box = $('#props'); box.innerHTML = '';
  const P = APP.P, s = FS.sel;
  if (s && s.kind === 'unit') {
    const u = unitById(s.id); if (!u) { FS.sel = null; return renderProps(); }
    box.appendChild(el(`<h3>${esc(u.name)}</h3>`));
    box.appendChild(el(`<div class="sub">${UT[u.type].label} · mã ${u.id}</div>`));
    const nf = buildForm([{ k: 'name', l: 'Tên', t: 'text' }], u, () => { FS.render(); changed('name'); });
    box.appendChild(nf);
    box.appendChild(el('<div style="height:8px"></div>'));
    box.appendChild(buildForm(UT[u.type].fields, u.p, (k, re) => {
      // châm hóa chất theo nồng độ / dung dịch: tính lại kg/d hoạt chất ngay để hiển thị
      if (u.type === 'dose' && u.p.dmode && u.p.dmode !== 'mass') { DOSE.sync(u.p, DOSE.Qinf(P)); re = true; }
      FS.render(); changed(k); if (re) renderProps();
    }, { model: P.model }));
    if (u.type === 'influent') {
      const b = el(`<button class="pri" style="margin-top:10px">Đặc tính nước thải & biến động →</button>`);
      b.onclick = () => { APP.view.inputUnit = u.id; showTab('input'); };
      box.appendChild(b);
    }
    if (u.type === 'cstr' && u.p.aer === 'do') box.appendChild(el(`<p class="small muted">Bộ điều khiển DO lý tưởng: kLa = ${AER_KP}·(DO đặt − DO), giới hạn [0, kLa tối đa].</p>`));
    if (u.type === 'blower') box.appendChild(blowerZonesUI(u));
    if (u.type === 'clarifier') box.appendChild(el(`<p class="small muted">Mô hình lắng một chiều Takács et al. (1991), ${u.p.nL} lớp; chất hòa tan xáo trộn hoàn toàn trong bể; không phản ứng sinh học.${MODELS[P.model] && MODELS[P.model].gran ? ' Bùn hạt lắng riêng với vận tốc v_hạt (không cản trở).' : ''}</p>`));
    if (u.type === 'cyclone') box.appendChild(el(`<p class="small muted">Thiết bị tách điểm (không thể tích). Đặt trên đường bùn dư: dòng đáy giàu hạt quay về bể sinh học, dòng tràn (bông) thải → chọn lọc bùn hạt. ${MODELS[P.model] && MODELS[P.model].gran ? '' : '<b>Để mô phỏng bùn hạt, chọn mô hình ASM1G/ASM2dG ở khung Dự án.</b>'}</p>`));
    if (u.type === 'sewer') box.appendChild(el(`<p class="small muted">Ống chia ${u.p.nSeg} đoạn khuấy trộn nối tiếp; phản ứng ASM trong nước thải; cống tự chảy: tiết diện ướt theo Manning, thông khí Parkhurst–Pomeroy; ống áp lực: đầy ống, không thông khí. Sulfua ước tính theo tốc độ tạo trên thành ống (Hvitved-Jacobsen) khi kỵ khí – chỉ để tham khảo, không đưa vào mô hình ASM.</p>`));
    const info = unitResultHTML(u);
    if (info) box.appendChild(el(`<div class="card" style="margin-top:12px;padding:10px"><b>Kết quả</b>${info}</div>`));
    const del = el(`<div class="btnrow"><button class="danger">Xóa đơn vị</button><button>Nhân bản</button></div>`);
    del.children[0].onclick = () => FS.deleteSel();
    del.children[1].onclick = () => {
      const c = JSON.parse(JSON.stringify(u)); let i = 1;
      while (P.units.some(x => x.id === u.id + '_' + i)) i++;
      c.id = u.id + '_' + i; c.name = u.name + ' (bản sao)'; c.x += 40; c.y += 40;
      P.units.push(c); FS.sel = { kind: 'unit', id: c.id }; FS.render(); changed('add');
    };
    box.appendChild(del);
  } else if (s && s.kind === 'link') {
    const l = P.links.find(x => x.id === s.id); if (!l) { FS.sel = null; return renderProps(); }
    box.appendChild(el(`<h3>Đường ống ${l.id}</h3>`));
    box.appendChild(el(`<div class="sub">${esc(linkName(l))}</div>`));
    const d = currentDet();
    if (d) {
      const li = d.sys.links.findIndex(x => x.id === l.id);
      if (li >= 0) {
        const c = d.sys.m.composites(d.det.C[li], d.sys.p20, {});
        box.appendChild(el(`<table class="t"><tr><td class="l">Q</td><td>${fmt(d.det.Q[li])} m³/d</td></tr>${d.sys.m.compVars.map(v => `<tr><td class="l">${v[1]}</td><td>${fmt(c[v[0]])} ${v[2]}</td></tr>`).join('')}</table>`));
      }
    }
    const b = el(`<div class="btnrow"><button class="danger">Xóa đường ống</button></div>`);
    b.firstChild.onclick = () => FS.deleteSel();
    box.appendChild(b);
  } else {
    box.appendChild(el(`<h3>Dự án</h3>`));
    box.appendChild(el(`<div class="sub">Chọn một đơn vị hoặc đường ống để sửa thông số</div>`));
    const f = buildForm([{ k: 'name', l: 'Tên dự án', t: 'text' }], P, () => { updateFooter(); saveLocal(); });
    box.appendChild(f);
    const ta = el(`<textarea rows="4" style="width:100%;margin-top:6px" placeholder="Ghi chú"></textarea>`);
    ta.value = P.desc || ''; ta.onchange = () => { P.desc = ta.value; saveLocal(); };
    box.appendChild(ta);
    const ms = el(`<div class="frm" style="margin-top:8px"><label>Mô hình động học</label><select>${Object.values(MODELS).map(m => `<option value="${m.id}"${m.id === P.model ? ' selected' : ''}>${m.id}${m.gran ? ' – bùn hạt' : ''}</option>`).join('')}</select></div>`);
    ms.querySelector('select').onchange = e => setModel(e.target.value, renderProps);
    if (typeof ADVISOR !== 'undefined') {
      const adv = el(`<div>${ADVISOR.adviceHTML(P, true)}<div class="small" style="margin-top:4px"><a href="#" id="advMore">Chi tiết, ưu nhược điểm các mô hình → tab Mô hình</a></div></div>`);
      adv.querySelectorAll('[data-use]').forEach(b => (b.onclick = () => setModel(b.dataset.use, renderProps)));
      adv.querySelector('#advMore').onclick = ev => { ev.preventDefault(); showTab('model'); };
      ms.appendChild(adv);
    }
    box.appendChild(ms);
    box.appendChild(el(`<h3 style="margin-top:16px">Thông số chung nhà máy</h3>`));
    box.appendChild(buildForm(PLANT_FIELDS, P.plant, (k, re) => { changed(k); if (re) renderProps(); }));
    const sys = compilePlant(P);
    const msgs = el('<div style="margin-top:10px"></div>');
    (sys.errors || []).forEach(e => msgs.appendChild(el(`<div class="msg err">${esc(e)}</div>`)));
    (sys.warns || []).forEach(e => msgs.appendChild(el(`<div class="msg warn">${esc(e)}</div>`)));
    if (!sys.errors.length) msgs.appendChild(el(`<div class="msg ok">Sơ đồ hợp lệ: ${P.units.length} đơn vị, ${P.links.length} đường ống, ${sys.n} biến trạng thái.</div>`));
    box.appendChild(msgs);
    const rb = el(`<div class="btnrow"><button class="pri">▶ Tính ổn định</button><button>Mô phỏng động…</button></div>`);
    rb.children[0].onclick = () => { showTab('sim'); runSteady(); };
    rb.children[1].onclick = () => showTab('sim');
    box.appendChild(rb);
    if (P.desc) box.appendChild(el(`<p class="small muted">${esc(P.desc)}</p>`));
  }
}

const SBR_PHASE = { fill: 'nạp', fillA: 'nạp+sục', react: 'sục khí', mix: 'khuấy TK', settle: 'lắng', decant: 'gạn', idle: 'chờ' };
function unitResultHTML(u) {
  const d = currentDet(); if (!d) return '';
  const cu = d.sys.byId[u.id]; if (!cu) return '';
  const info = d.det.U[u.id], m = d.sys.m, p = d.sys.p20;
  if (!info || cu.type !== u.type) return '';
  const rows = [];
  if (info.Qin !== undefined) rows.push(['Q vào', fmt(info.Qin), 'm³/d']);
  if (['cstr', 'mbr', 'mbbr'].includes(u.type) || CYC.has(u.type)) {
    const c = m.composites(info.C, p, {});
    rows.push(['MLSS', fmt(c.TSS), 'mg/L'], ['MLVSS', fmt(c.VSS), 'mg/L'], ['DO', fmt(c.DO), 'mg/L'], ['NH₄-N', fmt(c.NH4), 'mg/L'], ['NOx-N', fmt(c.NOx), 'mg/L']);
    if (m.fam === 'ASM2d') rows.push(['PO₄-P', fmt(c.PO4), 'mg/L']);
    rows.push(['pH', fmt(info.pH), ''], ['HRT', fmt(info.HRT), 'h']);
    if (!CYC.has(u.type)) rows.push(['OUR', fmt(info.OUR / 24), 'mg/L/h'], ['kLa', fmt(info.kla), '1/d']);
    rows.push(['OTR', fmt(info.OTR), 'kg O₂/d'], ['Khí cấp', fmt(info.air / 24), 'Nm³/h'], ['Công suất thổi khí', fmt(info.Pblow), 'kW']);
    if (u.type === 'mbr') rows.push(['Thông lượng màng', fmt(info.flux), 'L/m²/h'], ['Khí rửa màng', fmt(info.scourAir / 24), 'Nm³/h']);
    if (u.type === 'mbbr') rows.push(['Diện tích màng sinh học', fmt(info.Af), 'm²'], ['Sinh khối bám dính', fmt(info.attached), 'kg TSS'], ['Tải NH₄ bề mặt', fmt(info.SALR_NH), 'g N/m²/d'], ['Tải COD dễ PH bề mặt', fmt(info.SALR_COD), 'g/m²/d']);
    if (CYC.has(u.type)) info.tanks.forEach((t, k) => rows.push(['Bể ' + (k + 1) + ': V / pha', fmt(t.V) + ' / ' + SBR_PHASE[t.phase], 'm³']));
  } else if (u.type === 'blower') {
    rows.push(['Khí cấp trung bình', fmt(info.airTot / 24), 'm³/h'], ['Máy đang chạy', fmt(info.nRun) + ' / ' + fmt(info.nDuty), 'máy'], ['Tải mỗi máy', fmt(info.load), '%'],
      ['Áp suất đường ống / yêu cầu', fmt(info.pHead) + ' / ' + fmt(info.pNeed), 'kPa'], ['Hiệu suất', fmt(info.eta), '%'], ['Công suất điện', fmt(info.Pblow), 'kW'], ['Điện năng', fmt(info.Pblow * 24), 'kWh/d'], ['Suất điện năng', fmt(info.kWhkgO2), 'kWh/kg O₂']);
    if (info.short > 0.005) rows.push(['Máy chạy hết công suất', fmt(info.short * 100), '% thời gian']);
    if (info.excess > 0.5) rows.push(['⚠ Dư khí', 'dưới lưu lượng tối thiểu', '']);
    if (info.overP > 0.5) rows.push(['⚠ Áp suất', 'vượt áp suất máy', '']);
  } else if (u.type === 'anr') {
    rows.push(['HRT / SRT', fmt(info.HRTh) + ' h / ' + fmt(info.SRT), 'ngày'], ['Tải COD (OLR)', fmt(info.OLR), 'kg COD/m³·ngđ'], ['Hiệu suất khử COD', fmt(info.Eff), '%'], ['COD / sCOD ra', fmt(info.CODout) + ' / ' + fmt(info.sCODout), 'mg/L'],
      ['TSS ra', fmt(info.TSSe), 'mg/L'], ['pH', fmt(info.pH), ''], ['VFA', fmt(info.VFA), 'mg COD/L'], ['CH₄ / biogas', fmt(info.CH4) + ' / ' + fmt(info.biogas), 'Nm³/d'], ['% CH₄', fmt(info.pCH4), '%'],
      ['Bùn dư rút đáy', fmt(info.Mw) + ' kg/d · ' + fmt(info.Cw), '% DS'], ['TSS trung bình trong bể', fmt(info.Xbed), 'mg/L']);
  } else if (u.type === 'digester') {
    rows.push(['HRT', fmt(info.HRT), 'ngày'], ['pH', fmt(info.pH), ''], ['CH₄', fmt(info.CH4), 'Nm³/d'], ['Biogas', fmt(info.biogas), 'Nm³/d'], ['% CH₄', fmt(info.pCH4), '%'],
      ['Phân hủy VSS', fmt(info.VSSdes), '%'], ['Điện CHP', fmt(info.kWh), 'kWh/d']);
  } else if (u.type === 'clarifier') {
    rows.push(['TSS vào', fmt(info.TSSin), 'mg/L'], ['Tải bề mặt', fmt(info.SOR), 'm³/m²/d'], ['Tải chất rắn', fmt(info.SLR), 'kg/m²/h'], ['Bùn trong bể', fmt(info.mass), 'kg']);
    const ce = m.composites(d.det.C[cu.outs.eff], p, {}), cu2 = m.composites(d.det.C[cu.outs.und], p, {});
    rows.push(['TSS nước tràn', fmt(ce.TSS), 'mg/L'], ['TSS dòng đáy', fmt(cu2.TSS), 'mg/L']);
    if (m.gran) rows.push(['Tỷ lệ bùn hạt vào / dòng đáy', fmt(m.composites(info.Cin, p, {}).Fg * 100) + ' / ' + fmt(cu2.Fg * 100), '%']);
  } else if (u.type === 'sewer') {
    const ci = m.composites(info.Cin, p, {}), co = m.composites(info.C, p, {});
    rows.push(['Chiều dài / đường kính', fmt(info.L) + ' m / ' + fmt(info.D), 'mm'], ['Vận tốc', fmt(info.v), 'm/s'], [info.grav ? 'Độ đầy h/D' : 'Chế độ', info.grav ? (info.full ? 'đầy ống (quá tải)' : fmt(info.yD)) : 'đầy ống (áp lực)', ''],
      ['Thời gian lưu', fmt(info.HRT), 'h'], ['Thể tích nước trong ống', fmt(info.V), 'm³'], ['kLa thông khí', fmt(info.kla), '1/d'], ['O₂ hấp thụ', fmt(info.OTR), 'kg/d'],
      ['DO vào → ra', fmt(Math.max(ci.DO, 0)) + ' → ' + fmt(Math.max(co.DO, 0)), 'mg/L'], ['COD hòa tan vào → ra', fmt(ci.sCOD) + ' → ' + fmt(co.sCOD), 'mg/L'], ['NH₄-N vào → ra', fmt(ci.NH4) + ' → ' + fmt(co.NH4), 'mg/L']);
    if (m.fam === 'ASM2d') rows.push(['VFA vào → ra', fmt(ci.VFA) + ' → ' + fmt(co.VFA), 'mgCOD/L']);
    rows.push(['Sulfua hòa tan ước tính ở cuối ống', fmt(info.H2S), 'mgS/L']);
  } else if (u.type === 'cyclone') {
    rows.push(['Dòng đáy / dòng tràn', fmt(info.Qu) + ' / ' + fmt(info.Qo), 'm³/d'], ['TSS vào / đáy / tràn', fmt(info.TSSin) + ' / ' + fmt(info.TSSu) + ' / ' + fmt(info.TSSo), 'mg/L'],
      ['Chất rắn giữ lại / thải', fmt(info.kgU) + ' / ' + fmt(info.kgO), 'kg TSS/d']);
    if (m.gran) rows.push(['Tỷ lệ bùn hạt vào / đáy / tràn', fmt(info.Fgin * 100) + ' / ' + fmt(info.Fgu * 100) + ' / ' + fmt(info.Fgo * 100), '%']);
  } else if (info.Cin) {
    const c = m.composites(info.Cin, p, {});
    m.compVars.forEach(v => rows.push([v[1], fmt(c[v[0]]), v[2]]));
  }
  return `<table class="t">${rows.map(r => `<tr><td class="l">${r[0]}</td><td>${r[1]}</td><td class="l muted small">${r[2]}</td></tr>`).join('')}</table>`;
}

/* ---------------------------------------------------------------- kết quả hiện hành */
function currentDet() {
  if (APP.view.dataset === 'dyn' && APP.dyn) {
    const i = APP.view.tIdx < 0 ? APP.dyn.snaps.length - 1 : Math.min(APP.view.tIdx, APP.dyn.snaps.length - 1);
    return { sys: APP.dyn.sys, det: APP.dyn.snaps[i], t: APP.dyn.times[i], kind: 'dyn' };
  }
  if (APP.ss) return { sys: APP.ss.sys, det: APP.ss.det, kind: 'ss' };
  if (APP.dyn) return { sys: APP.dyn.sys, det: APP.dyn.snaps[APP.dyn.snaps.length - 1], t: APP.dyn.times[APP.dyn.times.length - 1], kind: 'dyn' };
  return null;
}
function updateOverlay() {
  const d = currentDet();
  if (!d || !APP.view.overlay) { FS.overlay = null; FS.qlabels = null; return; }
  const m = d.sys.m, p = d.sys.p20, ov = {}, ql = {};
  d.sys.links.forEach((l, i) => (ql[l.id] = Math.round(d.det.Q[i]).toLocaleString('vi-VN')));
  for (const cu of d.sys.units) {
    const info = d.det.U[cu.id];
    if (!info) continue;
    if (cu.type === 'blower') { ov[cu.id] = [fmt(info.nRun) + '/' + fmt(info.nDuty) + ' máy · ' + fmt(info.load) + ' %', fmt(info.airTot / 24) + ' Nm³/h · ' + fmt(info.pHead) + ' kPa', fmt(info.Pblow) + ' kW' + (info.short > 0.4 ? ' · THIẾU KHÍ' : info.excess > 0.5 ? ' · dư khí' : '')]; continue; }
    if (['cstr', 'mbr', 'mbbr'].includes(cu.type) || CYC.has(cu.type)) {
      const c = m.composites(info.C, p, {});
      ov[cu.id] = ['MLSS ' + fmt(c.TSS) + ' pH ' + fmt(info.pH), 'DO ' + fmt(c.DO) + ' NH4 ' + fmt(c.NH4), 'NOx ' + fmt(c.NOx) + (m.fam === 'ASM2d' ? ' PO4 ' + fmt(c.PO4) : '')];
      if (cu.type === 'mbr') ov[cu.id].push('Flux ' + fmt(info.flux) + ' LMH');
      if (cu.type === 'mbbr') ov[cu.id].push('Màng ' + fmt(info.attached) + ' kg');
      if (CYC.has(cu.type)) ov[cu.id].push(info.tanks.map((t, k) => 'B' + (k + 1) + ':' + SBR_PHASE[t.phase]).join(' '));
      if (m.gran) ov[cu.id].push('Bùn hạt ' + fmt(c.Fg * 100) + ' %');
    } else if (cu.type === 'sewer') {
      const c = m.composites(info.C, p, {});
      ov[cu.id] = [fmt(info.HRT) + ' h · ' + fmt(info.v) + ' m/s', 'DO ' + fmt(Math.max(c.DO, 0)) + ' sCOD ' + fmt(c.sCOD), 'H₂S ≈ ' + fmt(info.H2S) + ' mgS/L'];
    } else if (cu.type === 'cyclone') {
      ov[cu.id] = ['giữ ' + fmt(info.kgU) + ' kg/d', m.gran ? 'hạt ' + fmt(info.Fgu * 100) + '% | ' + fmt(info.Fgo * 100) + '%' : 'TSS ' + fmt(info.TSSu) + ' | ' + fmt(info.TSSo)];
    } else if (cu.type === 'anr') {
      ov[cu.id] = ['COD ' + fmt(info.CODin) + '→' + fmt(info.CODout) + ' (' + fmt(info.Eff) + '%)', 'CH₄ ' + fmt(info.CH4) + ' Nm³/d · pH ' + fmt(info.pH)];
    } else if (cu.type === 'digester') {
      ov[cu.id] = ['CH₄ ' + fmt(info.CH4) + ' Nm³/d', 'pH ' + fmt(info.pH) + ' VSS−' + fmt(info.VSSdes) + '%'];
    } else if (cu.type === 'clarifier') {
      const ce = m.composites(d.det.C[cu.outs.eff], p, {}), cu2 = m.composites(d.det.C[cu.outs.und], p, {});
      ov[cu.id] = ['TSS ra ' + fmt(ce.TSS), 'RAS ' + fmt(cu2.TSS)];
    } else if (cu.type === 'effluent') {
      const c = m.composites(info.Cin, p, {});
      ov[cu.id] = ['COD ' + fmt(c.COD) + ' BOD ' + fmt(c.BOD5), 'TSS ' + fmt(c.TSS) + ' NH4 ' + fmt(c.NH4), 'TN ' + fmt(c.TN) + (m.fam === 'ASM2d' ? ' TP ' + fmt(c.TP) : '')];
    } else if (cu.type === 'sludge') {
      const c = m.composites(info.Cin, p, {});
      ov[cu.id] = [fmt(info.Qin * c.TSS / 1000) + ' kgTSS/d', 'TSS ' + fmt(c.TSS)];
    }
  }
  FS.overlay = ov; FS.qlabels = ql;
}

/* ---------------------------------------------------------------- tab Mô hình */
/* đổi mô hình động học của dự án (xóa kết quả cũ) */
function setModel(id, after) {
  const P = APP.P; P.model = id; P.params[id] = P.params[id] || {};
  APP.ss = APP.dyn = APP.lastY = null; FS.overlay = FS.qlabels = null; FS.render(); changed('model');
  if (after) after();
}
function renderModel() {
  const box = $('#tab-model'), P = APP.P, m = curModel();
  const pv = P.params[m.id];
  box.innerHTML = '';
  const ADV = typeof ADVISOR !== 'undefined', best = ADV ? ADVISOR.recommend(P).best : null;
  const head = el(`<div class="card"><h2>Mô hình động học: ${m.name}</h2><p class="small muted">${m.ref}</p>
    <div class="row"><label>Chọn mô hình <select id="mSel">${Object.values(MODELS).map(x => `<option value="${x.id}"${x.id === m.id ? ' selected' : ''}>${ADV && MODEL_INFO[x.id] ? esc(MODEL_INFO[x.id].short) : x.id}${x.id === best ? ' ★ khuyến cáo' : ''}</option>`).join('')}</select></label>
    <button id="mReset">Khôi phục giá trị mặc định</button><span class="small muted">Các giá trị đã sửa hiển thị màu xanh. Tham số có θ được hiệu chỉnh nhiệt độ k(T) = k₂₀·θ^(T−20), T = ${P.plant.T} °C.</span></div>
    ${ADV ? ADVISOR.adviceHTML(P) + `<h3 style="margin-top:12px">Về mô hình ${m.id}</h3>` + ADVISOR.infoHTML(m.id) + ADVISOR.compareHTML(m.id, best) : ''}</div>`);
  box.appendChild(head);
  head.querySelector('#mSel').onchange = e => setModel(e.target.value, renderModel);
  head.querySelectorAll('[data-use]').forEach(b => (b.onclick = () => setModel(b.dataset.use, renderModel)));
  head.querySelector('#mReset').onclick = () => { if (confirm('Khôi phục toàn bộ tham số ' + m.id + ' về mặc định?')) { P.params[m.id] = {}; changed('param'); renderModel(); } };
  // tham số
  const groups = {};
  m.params.forEach(d => (groups[d.g] = groups[d.g] || []).push(d));
  const card = el(`<div class="card"><h2>Tham số động học & hợp thức (tại 20 °C)</h2><div class="grid2 pgrid"></div></div>`);
  const g2 = card.querySelector('.grid2');
  for (const g in groups) {
    const t = el(`<div><h3>${g}</h3><table class="t"><tr><th class="l">Ký hiệu</th><th class="l">Mô tả</th><th>Giá trị</th><th>Mặc định</th><th class="l">Đơn vị</th><th>θ</th></tr></table></div>`);
    const tb = t.querySelector('table');
    for (const d of groups[g]) {
      const v = pv[d.id] !== undefined ? pv[d.id] : d.v;
      const tr = el(`<tr><td class="l"><code>${d.id}</code></td><td class="l small wrap">${d.d}</td><td${pv[d.id] !== undefined ? ' class="mod"' : ''}><input type="number" step="any"></td><td class="muted">${fmt(d.v)}</td><td class="l small muted">${d.u}</td><td class="small">${d.th || ''}</td></tr>`);
      const inp = tr.querySelector('input'); inp.value = +v.toPrecision(8);
      inp.onchange = () => {
        const x = parseFloat(inp.value);
        if (!isFinite(x)) { inp.value = v; return; }
        if (Math.abs(x - d.v) < 1e-12 * Math.max(1, Math.abs(d.v))) delete pv[d.id]; else pv[d.id] = x;
        tr.children[2].classList.toggle('mod', pv[d.id] !== undefined);
        changed('param'); renderMatrix();
      };
      tb.appendChild(tr);
    }
    g2.appendChild(t);
  }
  box.appendChild(card);
  box.appendChild(el(`<div class="card" id="matCard"></div>`));
  renderMatrix();
}
function renderMatrix() {
  const m = curModel(), P = APP.P, box = $('#matCard'); if (!box) return;
  let sto;
  try { sto = computeStoich(m, P.params[m.id]); } catch (e) { box.innerHTML = `<div class="msg err">${e.message}</div>`; return; }
  const cmp = sto.comp;
  let h = `<h2>Ma trận Gujer (hệ số hợp thức ν)</h2><p class="small muted">Hệ số chưa biết (O₂/NO₃, NH₄, PO₄, độ kiềm, XND…) được giải tự động từ các phương trình bảo toàn ${m.cons.map(c => CONS_LABEL[c]).join(', ')}. Cột cuối là sai số bảo toàn của từng quá trình (phải ≈ 0).</p>
    <div class="tscroll"><table class="t matrix"><tr><th class="l">#</th><th class="l">Quá trình</th>${m.comps.map(c => `<th title="${c.name} [${c.u}]">${c.id}</th>`).join('')}${m.cons.map(c => `<th>Σ${CONS_LABEL[c]}</th>`).join('')}<th class="l">Tốc độ ρ</th></tr>`;
  m.procs.forEach((pr, i) => {
    h += `<tr><td class="l">${i + 1}</td><td class="l">${pr.name}</td>`;
    sto.nu[i].forEach(v => (h += `<td class="${v === 0 ? 'z' : v > 0 ? 'pos' : 'neg'}">${v === 0 ? '·' : (+v.toPrecision(4)).toLocaleString('vi-VN', { maximumFractionDigits: 4 })}</td>`));
    m.cons.forEach(c => (h += `<td class="small">${Math.abs(sto.resid[i][c]) < 1e-12 ? '0' : sto.resid[i][c].toExponential(1)}</td>`));
    h += `<td class="rate">${pr.rate}</td></tr>`;
  });
  h += `</table></div><h3>Ma trận thành phần (hệ số chuyển đổi bảo toàn)</h3><div class="tscroll"><table class="t"><tr><th class="l">Bảo toàn</th>${m.comps.map(c => `<th>${c.id}</th>`).join('')}</tr>`;
  m.cons.forEach(c => { h += `<tr><td class="l">${CONS_LABEL[c]}</td>${[...cmp[c]].map(v => `<td class="${v === 0 ? 'muted' : ''}">${v === 0 ? '·' : (+v.toPrecision(4)).toLocaleString('vi-VN', { maximumFractionDigits: 4 })}</td>`).join('')}</tr>`; });
  h += `</table></div><h3>Biến trạng thái</h3><table class="t"><tr><th class="l">Ký hiệu</th><th class="l">Tên</th><th class="l">Đơn vị</th><th class="l">Dạng</th></tr>${m.comps.map(c => `<tr><td class="l"><code>${c.id}</code></td><td class="l">${c.name}</td><td class="l">${c.u}</td><td class="l">${c.part ? 'hạt (lắng được)' : 'hòa tan'}</td></tr>`).join('')}</table>`;
  box.innerHTML = h;
  if (!$('#admCard')) renderAdmParams($('#tab-model'));
  return;
  box.innerHTML = h;
}

/* tham số ADM1 (bể phân hủy) – lưu tại P.params.ADM1 */
function renderAdmParams(box) {
  const P = APP.P; P.params.ADM1 = P.params.ADM1 || {};
  const pv = P.params.ADM1;
  const card = el(`<div class="card" id="admCard"><h2>ADM1 – mô hình bể phân hủy kỵ khí (35 °C)</h2>
    <p class="small muted">Batstone et al. (2002), IWA STR No.13; giá trị mặc định theo BSM2 (Rosen &amp; Jeppsson 2006). Áp dụng cho mọi “Bể phân hủy kỵ khí” trong sơ đồ. Hằng số hóa lý (Ka, KH, Kw, áp suất hơi nước) tự hiệu chỉnh theo nhiệt độ bể.</p>
    <div class="btnrow" style="margin-bottom:8px"><button id="admReset">Khôi phục mặc định ADM1</button></div><div class="grid2 pgrid"></div></div>`);
  card.querySelector('#admReset').onclick = () => { P.params.ADM1 = {}; changed('param'); renderModel(); };
  const groups = {};
  ADM.params.forEach(d => (groups[d.g] = groups[d.g] || []).push(d));
  const g2 = card.querySelector('.grid2');
  for (const g in groups) {
    const t = el(`<div><h3>${g}</h3><table class="t"><tr><th class="l">Ký hiệu</th><th class="l">Mô tả</th><th>Giá trị</th><th>Mặc định</th><th class="l">Đơn vị</th></tr></table></div>`);
    const tb = t.querySelector('table');
    for (const d of groups[g]) {
      const v = pv[d.id] !== undefined ? pv[d.id] : d.v;
      const tr = el(`<tr><td class="l"><code>${d.id}</code></td><td class="l small wrap">${d.d}</td><td${pv[d.id] !== undefined ? ' class="mod"' : ''}><input type="number" step="any"></td><td class="muted">${+d.v.toPrecision(4)}</td><td class="l small muted">${d.u}</td></tr>`);
      const inp = tr.querySelector('input'); inp.value = +v.toPrecision(8);
      inp.onchange = () => {
        const x = parseFloat(inp.value);
        if (!isFinite(x)) { inp.value = v; return; }
        if (Math.abs(x - d.v) < 1e-12 * Math.max(1, Math.abs(d.v))) delete pv[d.id]; else pv[d.id] = x;
        tr.children[2].classList.toggle('mod', pv[d.id] !== undefined);
        changed('param');
      };
      tb.appendChild(tr);
    }
    g2.appendChild(t);
  }
  box.appendChild(card);
}

/* ---------------------------------------------------------------- tab Đầu vào */
function renderInput() {
  const box = $('#tab-input'), P = APP.P, m = curModel();
  box.innerHTML = '';
  const infs = P.units.filter(u => u.type === 'influent');
  if (!infs.length) { box.appendChild(el(`<div class="card"><h2>Đầu vào</h2><p>Sơ đồ chưa có đơn vị “Dòng vào”. Hãy thêm ở tab Sơ đồ.</p></div>`)); return; }
  if (!infs.some(u => u.id === APP.view.inputUnit)) APP.view.inputUnit = infs[0].id;
  const u = unitById(APP.view.inputUnit), inf = u.p.inf;
  const top = el(`<div class="card"><div class="row"><label>Dòng vào <select>${infs.map(x => `<option value="${x.id}"${x.id === u.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label>Q trung bình <input type="number" step="any" style="width:120px" value="${u.p.Q}"> m³/d</label>
    <label>Cách nhập <select><option value="frac"${inf.mode === 'frac' ? ' selected' : ''}>Chỉ tiêu đo + phân đoạn</option><option value="state"${inf.mode === 'state' ? ' selected' : ''}>Nhập trực tiếp biến trạng thái</option></select></label></div></div>`);
  const [sU, iQ, sM] = top.querySelectorAll('select, input');
  sU.onchange = () => { APP.view.inputUnit = sU.value; renderInput(); };
  iQ.onchange = () => { const v = parseFloat(iQ.value); if (isFinite(v)) { u.p.Q = v; changed('Q'); renderInput(); } };
  sM.onchange = () => {
    if (sM.value === 'state') { // khởi tạo bằng kết quả phân đoạn hiện tại
      const x = INF.characterize(m, P.params[m.id], Object.assign({}, inf, { mode: 'frac' })).x;
      inf.st[m.id] = inf.st[m.id] || {};
      if (!Object.keys(inf.st[m.id]).length) m.comps.forEach((c, i) => (inf.st[m.id][c.id] = +x[i].toPrecision(6)));
    }
    inf.mode = sM.value; changed('inf'); renderInput();
  };
  box.appendChild(top);
  const g = el(`<div class="grid2"></div>`);
  // nhập liệu
  const c1 = el(`<div class="card"><h2>${inf.mode === 'frac' ? 'Chỉ tiêu & phân đoạn' : 'Biến trạng thái (' + m.id + ')'}</h2></div>`);
  if (inf.mode === 'frac') {
    const fields = INF.fracFields.filter(f => !f[3] || f[3] === m.fam).map(f => ({ k: f[0], l: f[1], u: f[2], t: 'num' }));
    c1.appendChild(buildForm(fields, inf, () => { changed('inf'); renderInputResult(); }, { wide: true }));
    c1.appendChild(el(`<p class="small muted">RBCOD gồm ${m.fam === 'ASM2d' ? 'SF + SA' : 'SS'}; XS = COD − SI − RBCOD − XI − sinh khối. ${m.fam === 'ASM1' ? 'N hữu cơ = TKN − NH₄ − iXB·(XBH+XBA) − iXP·XI, chia SND/XND.' : 'N, P hữu cơ suy ra từ hệ số iN, iP của mô hình (tab Mô hình).'} ISS = TSS − phần hữu cơ.</p>`));
  } else {
    inf.st[m.id] = inf.st[m.id] || {};
    const st = inf.st[m.id];
    const fields = m.comps.map(c => ({ k: c.id, l: c.id + ' – ' + c.name, u: c.u, t: 'num' }));
    m.comps.forEach(c => { if (st[c.id] === undefined) st[c.id] = 0; });
    c1.appendChild(buildForm(fields, st, () => { changed('inf'); renderInputResult(); }, { wide: true }));
  }
  g.appendChild(c1);
  g.appendChild(el(`<div class="card" id="infRes"></div>`));
  box.appendChild(g);
  // biến động
  const pat = inf.pat;
  const c3 = el(`<div class="card"><h2>Biến động theo thời gian (dùng cho mô phỏng động)</h2>
    <div class="row"><label>Kiểu <select id="patT"><option value="const">Không đổi</option><option value="diurnal">Dao động ngày đêm (hình sin)</option><option value="csv">Chuỗi số liệu (CSV)</option></select></label></div><div id="patBody" style="margin-top:10px"></div>
    <div class="chartBox" style="height:260px;margin-top:10px"><canvas id="patChart"></canvas></div>
    <p class="small muted">Tính trạng thái ổn định luôn dùng giá trị trung bình (Q và chỉ tiêu ở khung trên).</p></div>`);
  box.appendChild(c3);
  const pt = c3.querySelector('#patT'); pt.value = pat.type;
  pt.onchange = () => { pat.type = pt.value; changed('pat'); renderPat(u); };
  renderPat(u);
  renderInputResult();
}
function renderPat(u) {
  const pat = u.p.inf.pat, body = $('#patBody'); body.innerHTML = '';
  if (pat.type === 'diurnal') {
    body.appendChild(buildForm([
      { k: 'aQ', l: 'Biên độ lưu lượng (±, so với TB)', u: '-', t: 'num' }, { k: 'pQ', l: 'Giờ cao điểm lưu lượng', u: 'h', t: 'num' },
      { k: 'aC', l: 'Biên độ nồng độ (±)', u: '-', t: 'num' }, { k: 'pC', l: 'Giờ cao điểm nồng độ', u: 'h', t: 'num' }
    ], pat, () => { changed('pat'); drawPat(u); }, { wide: true }));
  } else if (pat.type === 'csv') {
    const b = el(`<div><p class="small">Cột đầu là <code>t</code> (ngày), các cột khác có thể là: <code>Q</code>, <code>COD</code>, <code>TKN</code>, <code>NH4</code>, <code>TP</code>, <code>PO4</code>, <code>TSS</code>, <code>Alk</code>, <code>NO3</code> hoặc tên biến trạng thái (vd <code>${curModel().comps[1].id}</code>). Phân cách bằng dấu phẩy, chấm phẩy hoặc tab; nội suy tuyến tính.</p>
      <textarea rows="8" style="width:100%;font-family:var(--mono);font-size:12px"></textarea>
      <div class="btnrow"><label><input type="checkbox"> Lặp lại chuỗi theo chu kỳ</label><button>Nạp tệp CSV…</button><button>Chèn ví dụ 1 ngày</button><input type="file" accept=".csv,.txt" hidden></div></div>`);
    const ta = b.querySelector('textarea'), cb = b.querySelector('input[type=checkbox]'), [bl, bx] = b.querySelectorAll('button'), fi = b.querySelector('input[type=file]');
    ta.value = pat.csv || ''; cb.checked = !!pat.loop;
    ta.onchange = () => { pat.csv = ta.value; changed('pat'); drawPat(u); };
    cb.onchange = () => { pat.loop = cb.checked; changed('pat'); drawPat(u); };
    bl.onclick = () => fi.click();
    fi.onchange = () => { const f = fi.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { ta.value = r.result; ta.onchange(); }; r.readAsText(f); };
    bx.onclick = () => {
      const Q = u.p.Q, inf = u.p.inf, lines = ['t,Q,COD,TKN,TSS'];
      const fQ = [0.55, 0.5, 0.45, 0.45, 0.5, 0.65, 0.9, 1.15, 1.3, 1.35, 1.3, 1.25, 1.2, 1.2, 1.15, 1.1, 1.1, 1.15, 1.2, 1.2, 1.15, 1.0, 0.85, 0.7];
      const fC = [0.7, 0.65, 0.6, 0.6, 0.65, 0.75, 0.9, 1.05, 1.2, 1.25, 1.25, 1.2, 1.15, 1.1, 1.1, 1.05, 1.05, 1.1, 1.15, 1.15, 1.1, 1.0, 0.9, 0.8];
      for (let h = 0; h <= 24; h++) { const i = h % 24; lines.push([(h / 24).toFixed(4), Math.round(Q * fQ[i]), Math.round(inf.COD * fC[i]), (inf.TKN * fC[i]).toFixed(1), Math.round(inf.TSS * fC[i])].join(',')); }
      ta.value = lines.join('\n'); ta.onchange();
    };
    body.appendChild(b);
  } else body.appendChild(el(`<p class="muted small">Lưu lượng và nồng độ không đổi theo thời gian.</p>`));
  drawPat(u);
}
function drawPat(u) {
  const cv = $('#patChart'); if (!cv) return;
  const m = curModel();
  const s = INF.makeSource(m, APP.P.params[m.id], u);
  const span = u.p.inf.pat.type === 'csv' && s.csvSpan > 0 ? s.csvSpan : 1;
  const xs = [], q = [], cod = [], nh = [], buf = new Float64Array(m.n);
  for (let i = 0; i <= 200; i++) {
    const t = span * i / 200; xs.push(t * (span <= 2 ? 24 : 1));
    const Q = s.src(t, buf, false); const c = m.composites(buf, Object.assign({}, m.defaults, APP.P.params[m.id]), {});
    q.push(Q / (u.p.Q || 1)); cod.push(c.COD / (c0(u, m).COD || 1)); nh.push(c.NH4 / (c0(u, m).NH4 || 1));
  }
  if (!cv._ch) cv._ch = new LineChart(cv);
  cv._ch.set([{ label: 'Q / Q_TB', x: xs, y: q }, { label: 'COD / COD_TB', x: xs, y: cod }, { label: 'NH₄ / NH₄_TB', x: xs, y: nh, dash: [5, 3] }],
    { xlabel: span <= 2 ? 'Giờ' : 'Ngày', ylabel: 'Hệ số', zero: true });
}
function c0(u, m) { return m.composites(INF.characterize(m, APP.P.params[m.id], u.p.inf).x, Object.assign({}, m.defaults, APP.P.params[m.id]), {}); }
function renderInputResult() {
  const box = $('#infRes'); if (!box) return;
  const m = curModel(), u = unitById(APP.view.inputUnit), p = Object.assign({}, m.defaults, APP.P.params[m.id]);
  const r = INF.characterize(m, p, u.p.inf), c = m.composites(r.x, p, {});
  let h = `<h2>Kết quả đặc tính hóa</h2>${r.warn.map(w => `<div class="msg warn">${esc(w)}</div>`).join('')}
    <h3>Chỉ tiêu tổng hợp</h3><table class="t"><tr><th class="l">Chỉ tiêu</th><th>Giá trị</th><th class="l">Đơn vị</th><th>Tải lượng kg/d</th></tr>
    ${m.compVars.map(v => `<tr><td class="l">${v[1]}</td><td>${fmt(c[v[0]])}</td><td class="l small muted">${v[2]}</td><td>${v[0] === 'DO' || v[0] === 'Alk' ? '' : fmt(c[v[0]] * u.p.Q / 1000)}</td></tr>`).join('')}
    </table><h3>Biến trạng thái</h3><table class="t"><tr><th class="l">Biến</th><th class="l">Tên</th><th>Giá trị</th><th class="l">Đơn vị</th><th>% COD</th></tr>`;
  const comp = computeStoich(m, APP.P.params[m.id]).comp.COD;
  m.comps.forEach((cc, i) => (h += `<tr><td class="l"><code>${cc.id}</code></td><td class="l small">${cc.name}</td><td>${fmt(r.x[i])}</td><td class="l small muted">${cc.u}</td><td class="small">${comp[i] === 1 && c.COD > 0 ? fmt(r.x[i] / c.COD * 100) : ''}</td></tr>`));
  h += `</table>`;
  box.innerHTML = h;
}

/* ---------------------------------------------------------------- tab Mô phỏng */
function renderSim() {
  const box = $('#tab-sim'), P = APP.P;
  if (APP.running) return; // giữ nguyên khi đang chạy
  box.innerHTML = '';
  const sys = compilePlant(P);
  const chk = el(`<div class="card"><h2>Kiểm tra sơ đồ</h2></div>`);
  (sys.errors || []).forEach(e => chk.appendChild(el(`<div class="msg err">${esc(e)}</div>`)));
  (sys.warns || []).forEach(e => chk.appendChild(el(`<div class="msg warn">${esc(e)}</div>`)));
  if (typeof FIX !== 'undefined' && FIX.consistency) { try { for (const x of FIX.consistency(P, APP.ss && !APP.stale ? APP.ss.S : null)) chk.appendChild(el(`<div class="msg ${x.lvl === 'info' ? 'ok' : x.lvl}">${x.lvl === 'info' ? 'ℹ ' : ''}${esc(x.t)}</div>`)); } catch (e) { console.error(e); } }
  if (!sys.errors.length) chk.appendChild(el(`<div class="msg ok">Hợp lệ – ${sys.n} biến trạng thái, Jacobian thưa ${sys.colGroups.length} nhóm cột. Mô hình ${P.model}, T = ${P.plant.T} °C.</div>`));
  box.appendChild(chk);
  const g = el(`<div class="grid2"></div>`);
  const c1 = el(`<div class="card"><h2>Trạng thái ổn định</h2>
    <p class="small muted">Tích phân đầu vào trung bình không đổi đến khi mọi biến thay đổi &lt; dung sai trong một đoạn 40 ngày (Rosenbrock ode23s, bảo toàn khối lượng).</p>
    <div class="frm"><label>Thời gian mô phỏng tối đa<span class="u">ngày</span></label><input type="number" id="ssMax" value="2000"><label>Dung sai thay đổi tương đối</label><input type="number" id="ssTol" value="0.0002" step="any">
    <label>Điểm xuất phát</label><select id="ssInit"><option value="last">Kết quả gần nhất (nếu cùng sơ đồ)</option><option value="default">Giá trị khởi tạo mặc định</option></select>
    <label>Bộ điều khiển (sơ đồ có bể chu kỳ)</label><select id="ssCtl"><option value="outer">Giải trực tiếp điều kiện ổn định của PI (nhanh)</option><option value="direct">Mô phỏng vòng PI đến khi ổn định (chậm)</option></select></div>
    ${P.ctrls && P.ctrls.some(c => c.on !== false) && sys.period > 0 ? '<p class="small muted">Sơ đồ có bộ điều khiển và bể chu kỳ: ở trạng thái ổn định PI chưa bão hòa luôn cho trung bình chu kỳ giá trị đo = giá trị đặt (không phụ thuộc Kp, Ti), nên chương trình tìm trực tiếp giá trị tác động bằng Newton–Broyden, mỗi lần giải ổn định không có bộ điều khiển (dùng được bể đại diện), rồi chạy PI thật vài ngày để có diễn biến trong chu kỳ.</p>' : ''}
    <div class="btnrow"><button class="pri" id="btnSS">▶ Tính ổn định</button></div></div>`);
  const c2 = el(`<div class="card"><h2>Mô phỏng động</h2>
    <div class="frm"><label>Thời gian mô phỏng<span class="u">ngày</span></label><input type="number" id="dDays" step="any">
    <label>Bước xuất kết quả<span class="u">phút</span></label><input type="number" id="dOut" step="any">
    <label>Điều kiện ban đầu</label><select id="dInit"><option value="ss">Trạng thái ổn định (tính lại nếu cần)</option><option value="last">Trạng thái cuối của lần chạy trước</option><option value="default">Giá trị khởi tạo mặc định</option></select>
    <label>Sai số tương đối rtol</label><input type="number" id="dRtol" step="any"><label>Sai số tuyệt đối atol<span class="u">g/m³</span></label><input type="number" id="dAtol" step="any"></div>
    <div class="btnrow"><button class="pri" id="btnDyn">▶ Chạy động</button></div></div>`);
  g.appendChild(c1); g.appendChild(c2); box.appendChild(g);
  $('#dDays').value = P.sim.days; $('#dOut').value = +(P.sim.dtOut * 1440).toFixed(3); $('#dInit').value = P.sim.init; $('#dRtol').value = P.sim.rtol; $('#dAtol').value = P.sim.atol;
  $('#dDays').onchange = e => { P.sim.days = Math.max(0.01, +e.target.value || 1); saveLocal(); };
  $('#dOut').onchange = e => { P.sim.dtOut = Math.max(1, +e.target.value || 15) / 1440; saveLocal(); };
  $('#dInit').onchange = e => { P.sim.init = e.target.value; saveLocal(); };
  $('#dRtol').onchange = e => { P.sim.rtol = +e.target.value || 1e-4; saveLocal(); };
  $('#dAtol').onchange = e => { P.sim.atol = +e.target.value || 1e-3; saveLocal(); };
  $('#btnSS').onclick = () => runSteady();
  $('#btnDyn').onclick = () => runDynamic();
  const c3 = el(`<div class="card"><h2>Tiến trình</h2><div class="row"><div class="progress" style="flex:1"><div id="prog"></div></div><button id="btnStop" disabled>■ Dừng</button></div><pre class="log" id="simLog"></pre></div>`);
  box.appendChild(c3);
  $('#btnStop').onclick = () => (APP.abortFlag = true);
  $('#simLog').textContent = APP._log || '';
}
function log(s) { APP._log = (APP._log || '') + s + '\n'; const l = $('#simLog'); if (l) { l.textContent = APP._log; l.scrollTop = l.scrollHeight; } }
function setRunning(on) {
  APP.running = on; APP.abortFlag = false;
  const b1 = $('#btnSS'), b2 = $('#btnDyn'), bs = $('#btnStop');
  if (b1) b1.disabled = on; if (b2) b2.disabled = on; if (bs) bs.disabled = !on;
}
function prog(f) { const p = $('#prog'); if (p) p.style.width = Math.max(0, Math.min(100, f * 100)) + '%'; }

async function solveSteady(sys, initMode) {
  let y0 = sys.y0Default();
  if (initMode !== 'default' && APP.lastY && APP.lastY.sig === sys.layoutSig) y0 = Float64Array.from(APP.lastY.y);
  sys.setSteady(true);
  let maxT = +(($('#ssMax') || {}).value) || 2000; const tol = +(($('#ssTol') || {}).value) || 2e-4;
  // màng sinh học (MBBR/IFAS/BAF): chất trơ trong màng tích lũy rất chậm – để mặc định 2000 d thì tự nới tới 8000 d
  if (maxT === 2000 && sys.units.some(u => u.type === 'mbbr' || u.type === 'baf')) maxT = 8000;
  // sơ đồ mẫu có quần thể sinh trưởng rất chậm (anammox): mẫu tự khai báo thời gian tối đa
  if (maxT <= 8000 && APP.P.sim && +APP.P.sim.ssMax > maxT && +(($('#ssMax') || {}).value || 2000) === 2000) maxT = +APP.P.sim.ssMax;
  STEADY_CTRL_OUTER = (($('#ssCtl') || {}).value || 'outer') !== 'direct';
  const r = await steadyAuto(APP.P, sys, y0, {
    maxT, tol, abort: () => APP.abortFlag,
    onCtrl: msg => log('  [bộ điều khiển] ' + msg),
    onProgress: (t, ch) => { prog(Math.min(1, t / Math.min(maxT, 400))); const f = $('#ftState'); if (f) f.textContent = 'Đang tính ổn định… t = ' + t.toFixed(1) + ' d, Δ = ' + (isFinite(ch) ? ch.toExponential(1) : '–'); }
  });
  sys.setSteady(false);
  return r;
}
/* kết quả ổn định: hệ liên tục → điểm cân bằng; hệ có chu kỳ (SBR) → trung bình một chu kỳ tuần hoàn */
async function steadyResult(sys, r) {
  sys.setSteady(true);
  let det, cycle = null;
  if (sys.period > 0) {
    const c = await cycleRun(sys, 0, r.y);
    det = c.avg; cycle = { snaps: c.snaps, times: c.times };
  } else det = sys.detail(0, r.y);
  sys.setSteady(false);
  return { sys, y: r.y, det, S: plantSummary(sys, det), cycle };
}
async function runSteady() {
  if (APP.running) return;
  const sys = compilePlant(APP.P);
  if (sys.errors.length) { log('✖ Lỗi sơ đồ: ' + sys.errors.join('; ')); renderSim(); return; }
  setRunning(true); prog(0);
  const t0 = performance.now();
  log('— Tính trạng thái ổn định (' + APP.P.model + ', ' + sys.n + ' biến)…');
  try {
    let r = await solveSteady(sys, ($('#ssInit') || {}).value || 'last');
    // lời giải có giá trị không hữu hạn (NaN/∞ – vd. khởi động từ trạng thái cũ không phù hợp): tính lại từ điều kiện đầu mặc định
    const bad = y => { for (let i = 0; i < y.length; i++) if (!isFinite(y[i])) return true; return false; };
    if (bad(r.y)) { log('⚠ Lời giải có giá trị không hữu hạn (NaN) – tính lại từ điều kiện đầu mặc định…'); APP.lastY = null; r = await solveSteady(sys, 'default'); }
    if (bad(r.y)) throw new Error('lời giải trạng thái ổn định không hữu hạn (NaN) – kiểm tra lưu lượng, thể tích bể, liều hóa chất và các dòng tuần hoàn trong sơ đồ');
    APP.ss = await steadyResult(sys, r);
    if (APP.ss.cycle) log('  Hệ có chu kỳ (SBR ' + fmt(sys.period * 24) + ' h): kết quả là trung bình một chu kỳ ở trạng thái tuần hoàn.');
    APP.lastY = { sig: sys.layoutSig, y: Array.from(r.y) };
    APP.stale = false; APP.view.dataset = 'ss';
    if (r.ctrlStage) {
      const c = r.ctrlStage;
      log('  Bộ điều khiển: giải trực tiếp điều kiện ổn định của PI (trung bình chu kỳ giá trị đo = giá trị đặt) – ' + c.evals + ' lần giải, ' + (c.ms / 1000).toFixed(1) + ' s' + (c.ok ? '' : ' (chưa đạt dung sai)') + ':');
      c.names.forEach((nm, i) => log('    ' + nm + ': ' + c.acts[i] + ' = ' + fmt(c.u[i]) + ', sai lệch TB ' + fmt(c.e[i]) + (c.sat[i] ? ' – BÃO HÒA (chạm giới hạn)' : c.flat[i] ? ' – không ảnh hưởng tới giá trị đo' : '')));
    }
    if (r.torn) log('  Cụm bể chu kỳ có dòng tuần hoàn quay về (nước tách bùn / rửa lọc): giải bằng "xé dòng" – ' + r.torn.n + ' dòng, ' + r.torn.iter + ' vòng lặp, thay đổi cuối ' + (r.torn.change * 100).toFixed(2) + ' %.');
    log((r.converged ? '✔ Hội tụ' : '⚠ Chưa đạt dung sai') + ' sau ' + Math.round(r.simT) + ' ngày mô phỏng (' + r.steps + ' bước, Δ = ' + r.res.toExponential(1) + ', ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s).');
    const S = APP.ss.S;
    log('  SRT = ' + fmt(S.SRT) + ' d · HRT = ' + fmt(S.HRT) + ' h · bùn dư = ' + fmt(S.WAS) + ' kgTSS/d · khí = ' + fmt(S.air / 24) + ' Nm³/h · sai số cân bằng COD = ' + S.bal.COD.rel.toExponential(1) + ' %');
    prog(1);
  } catch (e) { log('✖ ' + e.message); }
  setRunning(false);
  updateOverlay(); FS.render(); updateFooter(); renderProps();
  if ($('#tab-res').classList.contains('on')) renderRes();
}
async function runDynamic() {
  if (APP.running) return;
  const P = APP.P, sys = compilePlant(P);
  if (sys.errors.length) { log('✖ Lỗi sơ đồ: ' + sys.errors.join('; ')); return; }
  setRunning(true); prog(0);
  try {
    let y0;
    if (P.sim.init === 'last' && APP.lastY && APP.lastY.sig === sys.layoutSig) { y0 = Float64Array.from(APP.lastY.y); log('— Điều kiện đầu: trạng thái cuối lần chạy trước'); }
    else if (P.sim.init === 'default') { y0 = sys.y0Default(); log('— Điều kiện đầu: giá trị mặc định'); }
    else {
      if (APP.ss && !APP.stale && APP.ss.sys.layoutSig === sys.layoutSig) { y0 = Float64Array.from(APP.ss.y); log('— Điều kiện đầu: trạng thái ổn định đã tính'); }
      else {
        log('— Tính trạng thái ổn định làm điều kiện đầu…');
        const r = await solveSteady(sys, 'last'); y0 = r.y;
        APP.ss = await steadyResult(sys, r); APP.stale = false;
        log('  ổn định: ' + r.simT + ' ngày, Δ = ' + r.res.toExponential(1));
      }
    }
    const days = +P.sim.days, dt = +P.sim.dtOut, tOut = [];
    for (let k = 0; k * dt <= days + 1e-9; k++) tOut.push(+(k * dt).toFixed(10));
    const snaps = [], times = [];
    const t0 = performance.now();
    log('— Mô phỏng động ' + days + ' ngày, xuất ' + tOut.length + ' điểm…');
    sys.setSteady(false);
    const r = await SOLVER.ode23s(sys, 0, days, y0, {
      rtol: +P.sim.rtol, atol: +P.sim.atol, hmax: Math.min(0.05, days / 20, sys.hmax || Infinity), tOut,
      onOut: (t, y) => { snaps.push(sys.detail(t, y)); times.push(t); },
      onProgress: (t, st) => { prog(t / days); const f = $('#ftState'); if (f) f.textContent = 'Đang mô phỏng động… t = ' + t.toFixed(3) + ' / ' + days + ' d, h = ' + st.h.toExponential(1); },
      abort: () => APP.abortFlag
    });
    APP.dyn = { sys, snaps, times };
    APP.lastY = { sig: sys.layoutSig, y: Array.from(r.y) };
    APP.view.dataset = 'dyn'; APP.view.tIdx = -1; APP.stale = false;
    log('✔ Xong: ' + r.nSteps + ' bước, ' + r.nRej + ' bước loại, ' + r.nJac + ' Jacobian, ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s.');
    prog(1);
  } catch (e) { log('✖ ' + e.message); }
  setRunning(false);
  updateOverlay(); FS.render(); updateFooter(); renderProps();
  if (APP.dyn) showTab('res');
}

/* ---------------------------------------------------------------- tab Kết quả */
function renderRes() {
  const box = $('#tab-res'); box.innerHTML = '';
  if (!APP.ss && !APP.dyn) { box.appendChild(el(`<div class="card"><h2>Kết quả</h2><p>Chưa có kết quả. Vào tab <b>Mô phỏng</b> để tính trạng thái ổn định hoặc chạy động.</p></div>`)); return; }
  if (APP.view.dataset === 'dyn' && !APP.dyn) APP.view.dataset = 'ss';
  if (APP.view.dataset === 'ss' && !APP.ss) APP.view.dataset = 'dyn';
  const bar = el(`<div class="card"><div class="row">
    <label>Bộ kết quả <select id="rDs">${APP.ss ? '<option value="ss">Trạng thái ổn định</option>' : ''}${APP.dyn ? '<option value="dyn">Mô phỏng động</option>' : ''}</select></label>
    <span id="rT" class="row"></span>
    <label><input type="checkbox" id="rOv"${APP.view.overlay ? ' checked' : ''}> Hiện kết quả trên sơ đồ</label>
    <label><input type="checkbox" id="rSt"${APP.view.showStates ? ' checked' : ''}> Hiện biến trạng thái trong bảng dòng</label>
    <button id="rCsv">Xuất bảng dòng CSV</button><button id="rBridge" title="Chuyển chất lượng nước ra sang phần mềm nước cấp SimNước để ghép chuỗi công nghệ">→ Gửi nước ra sang SimNước</button>${APP.stale ? '<span class="msg warn" style="margin:0">Sơ đồ/thông số đã thay đổi – kết quả có thể chưa cập nhật</span>' : ''}</div></div>`);
  box.appendChild(bar);
  $('#rDs').value = APP.view.dataset;
  $('#rDs').onchange = e => { APP.view.dataset = e.target.value; updateOverlay(); renderRes(); };
  $('#rOv').onchange = e => { APP.view.overlay = e.target.checked; updateOverlay(); };
  $('#rSt').onchange = e => { APP.view.showStates = e.target.checked; renderRes(); };
  if (APP.view.dataset === 'dyn') {
    const n = APP.dyn.snaps.length, i = APP.view.tIdx < 0 ? n - 1 : APP.view.tIdx;
    const rt = $('#rT');
    rt.innerHTML = `<label>t = <b id="rTv">${fmt(APP.dyn.times[i])}</b> d <input type="range" min="0" max="${n - 1}" value="${i}" style="width:260px"></label>`;
    rt.querySelector('input').oninput = e => { APP.view.tIdx = +e.target.value; $('#rTv').textContent = fmt(APP.dyn.times[APP.view.tIdx]); renderResBody(); };
  }
  box.appendChild(el(`<div id="resBody"></div>`));
  $('#rCsv').onclick = () => exportStreamCSV();
  $('#rBridge').onclick = () => bridgeToWater();
  renderResBody();
  if (APP.view.dataset === 'dyn') renderDynCharts(box);
}
function renderResBody() {
  const box = $('#resBody'); if (!box) return;
  const d = currentDet(), sys = d.sys, det = d.det, m = sys.m, p = sys.p20;
  const S = plantSummary(sys, det);
  updateOverlay();
  let h = '';
  // KPI nước ra
  const eff = S.sinks.filter(s => s.cu.type === 'effluent');
  const L = typeof FIX !== 'undefined' ? FIX.limits(APP.P) : APP.limits;   // giới hạn xả lưu cùng dự án (js/fix.js)
  for (const e of eff) {
    const keys = [['COD', 'COD'], ['BOD5', 'BOD₅'], ['TSS', 'TSS'], ['NH4', 'NH₄-N'], ['TN', 'TN']].concat(m.fam === 'ASM2d' ? [['TP', 'TP'], ['PO4', 'PO₄-P']] : []).concat([['NOx', 'NOx-N']]).concat(m.nitro ? [['NO2', 'NO₂-N'], ['NO3', 'NO₃-N']] : []);
    const noFlow = d.kind === 'dyn' && !(e.Q > 0);
    h += `<div class="card"><h2>Chất lượng nước ra – ${esc(e.cu.u.name)} <span class="small muted">(Q = ${fmt(e.Q)} m³/d${d.kind === 'dyn' ? ', tức thời tại t = ' + fmt(d.t) + ' d' : ''})</span></h2>${noFlow ? '<p class="small muted">Không có dòng ra tại thời điểm này (bể chu kỳ ngoài pha gạn) – nồng độ là của nước trong đường ống ra; giá trị trung bình theo lưu lượng cả kỳ ở bảng dưới đồ thị.</p>' : ''}<div class="kpis">`;
    for (const [k, lab] of keys) {
      const lim = L[k], v = e.c[k], cls = lim ? (v <= lim ? 'ok' : 'bad') : '';
      h += `<div class="kpi ${cls}"><div class="k">${lab}${lim ? ' · giới hạn ' + lim : ''}</div><div class="v">${fmt(v)}<small>mg/L</small></div></div>`;
    }
    h += `</div><details class="adv"${APP.view.limOpen ? ' open' : ''} id="limDet"><summary>Giới hạn xả so sánh: ${esc(Object.entries(L).map(([k, v]) => k + ' ' + v).join(' · ') || 'chưa đặt')}</summary><div id="limRow"></div></details></div>`;
  }
  if (eff.length) h += '<div id="fxBox"></div>';     // gợi ý xử lý chỉ tiêu chưa đạt (js/fix.js)
  if (d.kind !== 'dyn') h += '<div id="volBox"></div>';   // khuyến cáo thể tích bể phản ứng sinh học (js/fix.js)
  if (typeof FIX !== 'undefined' && FIX.consistencyHTML) { try { h += FIX.consistencyHTML(APP.P, d.kind !== 'dyn' ? S : null); } catch (e) { console.error(e); } }
  // KPI nhà máy
  const aerR = S.reactors.filter(r => r.aerated);
  const mlss = aerR.length ? aerR.reduce((a, r) => a + r.c.TSS * r.info.V, 0) / aerR.reduce((a, r) => a + r.info.V, 0) : NaN;
  const note = d.kind === 'dyn' ? '<span class="small muted">(tức thời tại t = ' + fmt(d.t) + ' d)</span>' : det.avg ? '<span class="small muted">(trung bình một chu kỳ ở trạng thái tuần hoàn)</span>' : '';
  // SRT tức thời không xác định khi không có bùn rời hệ (bể chu kỳ ngoài pha gạn/xả bùn) – dùng SRT trung bình cả kỳ mô phỏng
  let SRTv = S.SRT, SRTav = S.SRTaer, srtU = 'd';
  if (d.kind === 'dyn' && !isFinite(S.SRT)) { const a = dynPlantAvg(); if (a) { SRTv = a.SRT; SRTav = a.SRTaer; srtU = 'd (TB cả kỳ)'; } }
  h += `<div class="card"><h2>Chỉ tiêu vận hành toàn nhà máy ${note}</h2><div class="kpis">
    ${kpi('Tuổi bùn SRT', SRTv, srtU)}${S.massCl > 0 && isFinite(S.SRTcl) && d.kind !== 'dyn' ? `<div class="kpi" title="SRT = (bùn trong bể sinh học + ${fmt(S.massCl)} kg bùn lưu trong bể lắng) / bùn rời hệ – cùng định nghĩa 'Plant SRT' của SUMO; SRT bên trái chỉ tính bùn trong bể sinh học"><div class="k">SRT kể cả bùn bể lắng</div><div class="v">${fmt(S.SRTcl)}<small>d</small></div></div>` : ''}${kpi('SRT hiếu khí', SRTav, srtU)}${kpi('HRT bể sinh học', S.HRT, 'h')}${kpi('MLSS TB bể hiếu khí', mlss, 'mg/L')}
    ${kpi('Bùn dư (WAS)', S.WAS, 'kgTSS/d')}${kpi('Lưu lượng bùn dư', S.WASQ, 'm³/d')}${kpi('Lưu lượng khí', S.air / 24, 'Nm³/h')}${kpi('O₂ cấp (OTR)', S.OTR, 'kg/d')}
    ${kpi('Công suất máy thổi', S.Pblow, 'kW')}${kpi('Khuấy trộn', S.Pmix, 'kW')}${kpi('Điện năng tiêu thụ', S.Eday, 'kWh/d')}${kpi('Suất tiêu thụ', S.kWhm3, 'kWh/m³')}
    ${kpi('Chi phí điện', S.cost / 1e6, 'tr.đ/d')}${kpi('N₂ khử nitrat', S.N2, 'kgN/d')}${kpi('CO₂ thoát ra', S.CO2 * 44, 'kg/d')}
    ${S.GHG && S.GHG.n2o != null ? kpi('N₂O phát thải', S.N2O, 'kgN/d') + kpi('Hệ số phát thải N₂O', S.GHG.efN2O, '% TN vào') + kpi('N₂O quy đổi', S.GHG.n2o / 1000, 't CO₂e/d') : ''}${S.GHG ? kpi('CO₂e điện năng ròng', S.GHG.energy / 1000, 't CO₂e/d') + kpi('Tổng khí nhà kính', S.GHG.total / 1000, 't CO₂e/d') : ''}
    ${S.digesters.length ? kpi('CH₄', S.CH4, 'Nm³/d') + kpi('Điện từ biogas', S.Egen, 'kWh/d') + kpi('Điện năng ròng', S.Enet, 'kWh/d') + kpi('Bánh bùn/bùn ra', S.sludgeOut, 'kgTSS/d') : ''}</div>`;
  h += `<h3>Cân bằng vật chất ${d.kind === 'dyn' ? '<span class="small muted">(chỉ đóng kín ở trạng thái ổn định)</span>' : det.avg ? '<span class="small muted">(trung bình chu kỳ – sai số tích phân thường &lt; 1 %)</span>' : ''}</h3><table class="t" style="max-width:860px"><tr><th class="l">Đại lượng</th><th>Vào</th><th>O₂ cấp</th><th>Khí thoát (CH₄/CO₂)</th><th>Ra theo dòng</th><th>Sai số</th><th>%</th></tr>
    ${m.cons.map(c => `<tr><td class="l">${CONS_LABEL[c]} <span class="small muted">${c === 'Q' ? 'kmol/d' : c === 'C' ? 'kmol C/d' : 'kg/d'}</span></td><td>${fmt(S.bal[c].inp)}</td><td>${c === 'COD' ? fmt(S.bal[c].o2) : ''}</td><td>${S.bal[c].gas ? fmt(S.bal[c].gas) : ''}</td><td>${fmt(S.bal[c].outp)}</td><td>${fmt(S.bal[c].err)}</td><td>${S.bal[c].rel.toExponential(1)}</td></tr>`).join('')}</table></div>`;
  // bể phản ứng
  h += `<div class="card"><h2>Bể sinh học</h2><div class="tscroll"><table class="t"><tr><th class="l">Bể</th><th>V m³</th><th>HRT h</th><th>MLSS</th><th>MLVSS</th><th>DO</th><th>NH₄</th><th>NOx</th>${m.fam === 'ASM2d' ? '<th>PO₄</th><th>VFA</th>' : ''}<th>pH</th><th>OUR mg/L/h</th><th>kLa 1/d</th><th>OTR kg/d</th><th>Khí Nm³/h</th><th>kW</th></tr>`;
  for (const r of S.reactors) h += `<tr><td class="l">${esc(r.cu.u.name)}</td><td>${fmt(r.info.V)}</td><td>${fmt(r.info.HRT)}</td><td>${fmt(r.c.TSS)}</td><td>${fmt(r.c.VSS)}</td><td>${fmt(r.c.DO)}</td><td>${fmt(r.c.NH4)}</td><td>${fmt(r.c.NOx)}</td>${m.fam === 'ASM2d' ? `<td>${fmt(r.c.PO4)}</td><td>${fmt(r.c.VFA)}</td>` : ''}<td>${fmt(r.info.pH)}</td><td>${CYC.has(r.cu.type) ? '' : fmt(r.info.OUR / 24)}</td><td>${CYC.has(r.cu.type) ? '' : fmt(r.info.kla)}</td><td>${fmt(r.info.OTR)}</td><td>${fmt(r.info.air / 24)}</td><td>${fmt(r.info.Pblow + r.info.Pmix)}</td></tr>`;
  h += `</table></div><details class="adv"><summary>Phân bố hóa học (pH, CO₂, NH₃ tự do, độ kiềm thực)</summary><table class="t" style="max-width:820px"><tr><th class="l">Bể</th><th>pH</th><th>CO₂ tự do mg/L</th><th>HCO₃⁻ mg/L</th><th>NH₃ tự do mgN/L</th><th>Độ kiềm thực mgCaCO₃/L</th><th>TIC mmol/L</th></tr>
    ${S.reactors.map(r => { const sp = CHEM.speciate(m, r.info.C, sys.pl.T); return `<tr><td class="l">${esc(r.cu.u.name)}</td><td>${fmt(sp.pH)}</td><td>${fmt(sp.CO2)}</td><td>${fmt(sp.HCO3)}</td><td>${fmt(sp.NH3)}</td><td>${fmt(sp.alkReal)}</td><td>${fmt(r.info.C[m.idx.STIC])}</td></tr>`; }).join('')}</table></details></div>`;
  h += extraUnitCards(sys, det, d);
  // bể lắng
  const cls = sys.units.filter(c => c.type === 'clarifier');
  if (cls.length) {
    h += `<div class="card"><h2>Bể lắng thứ cấp</h2><div class="grid2"><div><table class="t"><tr><th class="l">Bể</th><th>TSS vào</th><th>Tải bề mặt m/d</th><th>Tải chất rắn kg/m²/h</th><th>TSS ra</th><th>TSS đáy</th><th>Bùn trong bể kg</th></tr>`;
    for (const c of cls) {
      const i = det.U[c.id], ce = m.composites(det.C[c.outs.eff], p, {}), cu = m.composites(det.C[c.outs.und], p, {});
      h += `<tr><td class="l">${esc(c.u.name)}</td><td>${fmt(i.TSSin)}</td><td>${fmt(i.SOR)}</td><td>${fmt(i.SLR)}</td><td>${fmt(ce.TSS)}</td><td>${fmt(cu.TSS)}</td><td>${fmt(i.mass)}</td></tr>`;
    }
    h += `</table><p class="small muted">Biểu đồ: phân bố TSS theo chiều sâu (lớp 1 = mặt). Công cụ phân tích thông lượng chất rắn ở tab Công cụ.</p></div><div class="chartBox" style="height:260px"><canvas id="clProf"></canvas></div></div></div>`;
  }
  // bảng dòng
  h += `<div class="card"><h2>Bảng các dòng (đường ống)</h2><div class="tscroll"><table class="t"><tr><th class="l">Chỉ tiêu</th><th class="l">Đơn vị</th>${sys.links.map(l => `<th title="${esc(linkName(l))}" style="white-space:normal;min-width:90px">${esc(linkName(l))}</th>`).join('')}</tr>`;
  const comps = sys.links.map((l, i) => m.composites(det.C[i], p, {}));
  h += `<tr><td class="l"><b>Q</b></td><td class="l small">m³/d</td>${sys.links.map((l, i) => `<td><b>${fmt(det.Q[i])}</b></td>`).join('')}</tr>`;
  for (const v of m.compVars) h += `<tr><td class="l">${v[1]}</td><td class="l small">${v[2]}</td>${comps.map(c => `<td>${fmt(c[v[0]])}</td>`).join('')}</tr>`;
  if (APP.view.showStates) m.comps.forEach((c, k) => (h += `<tr><td class="l"><code>${c.id}</code></td><td class="l small">${c.u}</td>${sys.links.map((l, i) => `<td>${fmt(det.C[i][k])}</td>`).join('')}</tr>`));
  h += `</table></div></div>`;
  box.innerHTML = h;
  drawExtraCharts(sys, det, d);
  // giới hạn
  const lr = $('#limRow');
  if (lr && typeof FIX !== 'undefined') {
    FIX.limitsUI(lr, () => renderResBody());
    $('#limDet').ontoggle = e => { APP.view.limOpen = e.target.open; };
  }
  const fx = $('#fxBox');
  if (fx && typeof FIX !== 'undefined') {
    if (d.kind !== 'dyn') FIX.card(fx);
    else fx.innerHTML = '<div class="small muted">Gợi ý xử lý chỉ tiêu chưa đạt dùng kết quả trạng thái ổn định – chọn bộ kết quả "Trạng thái ổn định".</div>';
  }
  if (typeof FIX !== 'undefined' && FIX.volCard && d.kind !== 'dyn') {
    try { FIX.volCard($('#volBox')); } catch (e) { console.error(e); }
  }
  const cp = $('#clProf');
  if (cp) {
    const ser = cls.map(c => { const lay = det.U[c.id].layers; return { label: c.u.name, x: lay.map((v, j) => j + 1), y: lay, marks: true }; });
    new LineChart(cp, { xlabel: 'Lớp (1 = mặt)', ylabel: 'TSS (mg/L)' }).set(ser);
  }
}
function kpi(k, v, u) { return `<div class="kpi"><div class="k">${k}</div><div class="v">${isFinite(v) || typeof v !== 'number' ? fmt(v) : '—'}<small>${u}</small></div></div>`; }
/* SRT trung bình cả kỳ mô phỏng động = khối bùn TB / bùn rời hệ TB (tích phân hình thang theo thời gian) */
function dynPlantAvg() {
  const run = APP.dyn; if (!run || run.snaps.length < 2) return null;
  if (run._avg) return run._avg;
  const sys = run.sys, T = run.times, bs = bioSubsystem(sys), m = sys.m, p = sys.p20;
  let mR = 0, mA = 0, ex = 0, tt = 0;
  const one = det => { const S = plantSummary(sys, det); let e = 0; for (const li of bs.exits) e += det.Q[li] * m.composites(det.C[li], p, {}).TSS / 1000; return [S.massR, isFinite(S.SRTaer) && isFinite(S.SRT) && S.SRT > 0 ? S.massR * S.SRTaer / S.SRT : null, e]; };
  let prev = one(run.snaps[0]);
  for (let i = 1; i < run.snaps.length; i++) {
    const cur = one(run.snaps[i]), dt = T[i] - T[i - 1];
    mR += (prev[0] + cur[0]) / 2 * dt; ex += (prev[2] + cur[2]) / 2 * dt; tt += dt; prev = cur;
  }
  // khối bùn hiếu khí: lấy theo tỷ lệ bể hiếu khí của bản ổn định nếu có, ngược lại của điểm có SRT xác định
  let fA = null; for (const det of run.snaps) { const S = plantSummary(sys, det); if (isFinite(S.SRT) && isFinite(S.SRTaer) && S.SRT > 0) { fA = S.SRTaer / S.SRT; break; } }
  run._avg = ex > 0 ? { SRT: mR / ex, SRTaer: fA !== null ? mR / ex * fA : NaN } : null;
  return run._avg;
}

/* danh sách biến để vẽ đồ thị động */
function seriesCatalog(sys) {
  const m = sys.m, out = [];
  sys.links.forEach(l => out.push({ grp: 'Dòng', key: 'L:' + l.id, name: linkName(l), vars: [['Q', 'Lưu lượng', 'm³/d']].concat(m.compVars).concat(m.comps.map(c => [c.id, c.id, c.u])) }));
  for (const cu of sys.units) {
    const op = [['kla', 'kLa', '1/d'], ['OTR', 'OTR', 'kg/d'], ['OUR', 'OUR', 'g/m³/d'], ['air', 'Khí', 'Nm³/d'], ['Pblow', 'Công suất thổi', 'kW'], ['pH', 'pH', '-']];
    if (cu.type === 'cstr') out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name + ' (vận hành)', vars: op });
    if (cu.type === 'mbr') out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name + ' (MBR)', vars: op.concat([['flux', 'Thông lượng màng', 'L/m²/h']]) });
    if (cu.type === 'mbbr') out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name + ' (MBBR)', vars: op.concat([['attached', 'Sinh khối bám dính', 'kg'], ['SALR_NH', 'Tải NH₄ bề mặt', 'gN/m²/d'], ['SALR_O2', 'Thông lượng O₂ vào màng', 'g/m²/d']]) });
    if (CYC.has(cu.type)) {
      out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name + ' (tổng)', vars: [['V', 'Thể tích tổng', 'm³'], ['OTR', 'OTR', 'kg/d'], ['air', 'Khí', 'Nm³/d'], ['Pblow', 'Công suất thổi', 'kW']] });
      for (let k = 0; k < cu.N; k++) out.push({ grp: 'Bể', key: 'S:' + cu.id + ':' + k, name: cu.u.name + ' – bể ' + (k + 1), vars: [['V', 'Thể tích', 'm³'], ['hw', 'Mực nước', 'm'], ['hb', 'Mặt lớp bùn', 'm'], ['clr', 'Lớp bùn cách mặt nước', 'm'], ['TSSe', 'TSS nước gạn', 'mg/L'], ['kla', 'kLa', '1/d'], ['pH', 'pH', '-']].concat(m.compVars) });
    }
    if (cu.type === 'anr') out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name + ' (kỵ khí)', vars: [['CODout', 'COD ra', 'mg/L'], ['sCODout', 'sCOD ra', 'mg/L'], ['Eff', 'Hiệu suất khử COD', '%'], ['OLR', 'Tải COD', 'kg/m³/d'], ['CH4', 'CH₄', 'Nm³/d'], ['biogas', 'Biogas', 'Nm³/d'], ['pH', 'pH', '-'], ['VFA', 'VFA tổng', 'mg COD/L'], ['alkHCO3', 'Độ kiềm bicarbonat', 'mgCaCO₃/L'], ['TSSe', 'TSS ra', 'mg/L'], ['Xbed', 'TSS trong bể', 'mg/L'], ['Mw', 'Bùn dư', 'kg/d'], ['IpHac', 'Ức chế pH (acetat)', '-']] });
    if (cu.type === 'digester') out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name, vars: [['CH4', 'CH₄', 'Nm³/d'], ['biogas', 'Biogas', 'Nm³/d'], ['pCH4', '% CH₄', '%'], ['pH', 'pH', '-'], ['VSSdes', 'Phân hủy VSS', '%'],
      ['VFA', 'VFA tổng', 'mg COD/L'], ['VFAac', 'Acetat', 'mg COD/L'], ['VFApro', 'Propionat', 'mg COD/L'], ['alkHCO3', 'Độ kiềm bicarbonat', 'mgCaCO₃/L'],
      ['Snh3', 'NH₃ tự do', 'mgN/L'], ['Pgas', 'Áp suất khí', 'bar'], ['IpHac', 'Ức chế pH (acetat)', '-'], ['Inh3', 'Ức chế NH₃', '-']] });
    if (cu.type === 'blower') out.push({ grp: 'Thiết bị', key: 'U:' + cu.id, name: cu.u.name, vars: [['airTot', 'Khí cấp', 'Nm³/d'], ['airDem', 'Nhu cầu khí các vùng', 'Nm³/d'], ['nRun', 'Số máy đang chạy', 'máy'], ['load', 'Tải mỗi máy', '%'], ['pHead', 'Áp suất đường ống', 'kPa'], ['pNeed', 'Áp suất yêu cầu', 'kPa'], ['Pblow', 'Công suất điện', 'kW'], ['eta', 'Hiệu suất máy', '%'], ['kWhkgO2', 'Suất điện năng', 'kWh/kg O₂'], ['short', 'Thiếu khí (1 = có)', '-'], ['excess', 'Dư khí (1 = có)', '-']] });
    if (cu.type === 'clarifier') out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name + ' (lắng)', vars: [['SOR', 'Tải bề mặt', 'm/d'], ['SLR', 'Tải chất rắn', 'kg/m²/h'], ['mass', 'Bùn trong bể', 'kg'], ['TSSin', 'TSS vào', 'mg/L']] });
    if (cu.type === 'sewer') out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name + ' (cống)', vars: [['HRT', 'Thời gian lưu', 'h'], ['v', 'Vận tốc', 'm/s'], ['yD', 'Độ đầy h/D', '-'], ['kla', 'kLa thông khí', '1/d'], ['OTR', 'O₂ hấp thụ', 'kg/d'], ['H2S', 'Sulfua ước tính', 'mgS/L']] });
    if (cu.type === 'cyclone') out.push({ grp: 'Bể', key: 'U:' + cu.id, name: cu.u.name + ' (cyclone)', vars: [['kgU', 'Chất rắn giữ lại', 'kg/d'], ['kgO', 'Chất rắn thải', 'kg/d'], ['Fgin', 'Tỷ lệ hạt vào', '-'], ['Fgu', 'Tỷ lệ hạt dòng đáy', '-'], ['Fgo', 'Tỷ lệ hạt dòng tràn', '-']] });
  }
  for (const k of sys.ctrls || []) out.push({ grp: 'Điều khiển', key: 'K:' + k.c.id, name: 'Bộ ĐK ' + (k.c.name || k.c.id), vars: [['meas', 'Giá trị đo', ''], ['sp', 'Giá trị đặt', ''], ['u', 'Tín hiệu điều khiển', '']] });
  out.push({ grp: 'Nhà máy', key: 'P:', name: 'Toàn nhà máy', vars: [['SRT', 'SRT', 'd'], ['WAS', 'Bùn dư', 'kgTSS/d'], ['air', 'Tổng khí', 'Nm³/d'], ['Eday', 'Điện năng', 'kWh/d'], ['massR', 'Bùn trong bể sinh học', 'kg']] });
  return out;
}
function seriesData(run, spec) {
  const sys = run.sys, m = sys.m, p = sys.p20;
  const ys = [];
  const [kind, id] = spec.key.split(/:(.*)/s);
  let li = -1; if (kind === 'L') li = sys.links.findIndex(l => l.id === id);
  for (const det of run.snaps) {
    let v = NaN;
    if (kind === 'L' && li >= 0) {
      if (spec.v === 'Q') v = det.Q[li];
      else if (m.idx[spec.v] !== undefined) v = det.C[li][m.idx[spec.v]];
      else v = m.composites(det.C[li], p, {})[spec.v];
    } else if (kind === 'U') v = det.U[id] ? det.U[id][spec.v] : NaN;
    else if (kind === 'S') {
      const [uid, k] = id.split(':'), tk = det.U[uid] && det.U[uid].tanks ? det.U[uid].tanks[+k] : null;
      if (tk) v = tk[spec.v] !== undefined ? tk[spec.v] : (m.idx[spec.v] !== undefined ? tk.C[m.idx[spec.v]] : m.composites(tk.C, p, {})[spec.v]);
    }
    else if (kind === 'K') v = det.CT && det.CT[id] ? det.CT[id][spec.v] : NaN;
    else if (kind === 'P') { v = plantSummary(sys, det)[spec.v]; if (v === Infinity) v = NaN; }   // SRT tức thời ∞ khi không xả bùn → bỏ điểm (đứt nét)
    ys.push(v);
  }
  return ys;
}
function renderDynCharts(box) {
  const run = APP.dyn, sys = run.sys, cat = seriesCatalog(sys);
  const card = el(`<div class="card"><h2>Đồ thị mô phỏng động</h2>
    <div class="row"><select id="sObj">${cat.map((c, i) => `<option value="${i}">${c.grp}: ${esc(c.name)}</option>`).join('')}</select><select id="sVar"></select><button id="sAdd">+ Thêm đường</button>
    <button id="sClr">Xóa hết</button><span class="small muted">Mẫu nhanh:</span><button data-pre="eff">Nước ra N</button><button data-pre="do">DO các bể</button><button data-pre="mlss">MLSS</button><button data-pre="air">Khí cấp</button><button id="sCsv">Xuất CSV</button></div>
    <div class="series-list" id="sList"></div><div class="chartBox" style="height:420px"><canvas id="dynChart"></canvas></div>
    <h3>Giá trị trung bình theo lưu lượng toàn kỳ mô phỏng</h3><div id="dynAvg"></div></div>`);
  box.appendChild(card);
  const sObj = card.querySelector('#sObj'), sVar = card.querySelector('#sVar');
  const fillVars = () => { const c = cat[+sObj.value]; sVar.innerHTML = c.vars.map(v => `<option value="${v[0]}">${v[1]} [${v[2]}]</option>`).join(''); };
  sObj.onchange = fillVars; fillVars();
  const ch = new LineChart(card.querySelector('#dynChart'), { xlabel: 'Thời gian (ngày)', zero: false });
  const redraw = () => {
    const list = card.querySelector('#sList'); list.innerHTML = '';
    APP.view.series.forEach((s, i) => {
      const chip = el(`<span class="chip"><b style="background:${PALETTE[i % PALETTE.length]}"></b>${esc(s.label)}<button title="Bỏ">✕</button></span>`);
      chip.querySelector('button').onclick = () => { APP.view.series.splice(i, 1); redraw(); };
      list.appendChild(chip);
    });
    const units = [...new Set(APP.view.series.map(s => s.u))];
    ch.set(APP.view.series.map(s => ({ label: s.label, x: run.times, y: seriesData(run, s) })), { ylabel: units.join(' · ') });
  };
  const add = (key, v) => {
    const c = cat.find(x => x.key === key); if (!c) return;
    const vv = c.vars.find(x => x[0] === v); if (!vv) return;
    if (APP.view.series.some(s => s.key === key && s.v === v)) return;
    APP.view.series.push({ key, v, u: vv[2], label: c.name + ' · ' + vv[1] });
  };
  card.querySelector('#sAdd').onclick = () => { const c = cat[+sObj.value]; add(c.key, sVar.value); redraw(); };
  card.querySelector('#sClr').onclick = () => { APP.view.series = []; redraw(); };
  card.querySelectorAll('[data-pre]').forEach(b => (b.onclick = () => {
    APP.view.series = [];
    const pre = b.dataset.pre;
    const effL = sys.links.filter(l => (sys.byId[l.to[0]] || {}).type === 'effluent');
    if (pre === 'eff') effL.forEach(l => ['NH4', 'NOx', 'TN'].concat(sys.m.fam === 'ASM2d' ? ['PO4'] : []).forEach(v => add('L:' + l.id, v)));
    if (pre === 'do' || pre === 'mlss') {
      // MBR: dòng đáy (retentate) mang nồng độ bùn trong bể; nước qua màng không có TSS
      sys.units.filter(c => c.type === 'cstr' || c.type === 'mbr' || c.type === 'mbbr').forEach(c => { const o = c.outs.out !== undefined ? c.outs.out : c.outs.und; if (o !== undefined) add('L:' + sys.links[o].id, pre === 'do' ? 'DO' : 'TSS'); });
      // bể chu kỳ (SBR/ICEAS/C-Tech): nồng độ trong từng bể con
      sys.units.filter(c => CYC.has(c.type)).forEach(c => { for (let k = 0; k < c.N; k++) add('S:' + c.id + ':' + k, pre === 'do' ? 'DO' : 'TSS'); });
    }
    if (pre === 'air') sys.units.filter(c => (c.type === 'cstr' && c.p.aer !== 'none') || c.type === 'mbr' || c.type === 'mbbr' || CYC.has(c.type)).forEach(c => add('U:' + c.id, 'air'));
    redraw();
  }));
  card.querySelector('#sCsv').onclick = () => {
    if (!APP.view.series.length) { alert('Chưa chọn đường nào'); return; }
    const cols = APP.view.series.map(s => seriesData(run, s));
    const lines = ['t_ngay,' + APP.view.series.map(s => '"' + s.label + ' [' + s.u + ']"').join(',')];
    run.times.forEach((t, i) => lines.push([t.toFixed(5)].concat(cols.map(c => +c[i].toPrecision(6))).join(',')));
    downloadText('dong_thoi_gian.csv', lines.join('\n'), 'text/csv');
  };
  if (!APP.view.series.length) card.querySelector('[data-pre="eff"]').click(); else redraw();
  // trung bình theo lưu lượng
  const m = sys.m, p = sys.p20;
  const sinks = sys.units.filter(c => c.type === 'effluent' || c.type === 'sludge');
  let h = `<table class="t" style="max-width:900px"><tr><th class="l">Dòng</th><th>Q TB m³/d</th>${m.compVars.filter(v => v[0] !== 'DO' && v[0] !== 'Alk').map(v => `<th>${v[1]}</th>`).join('')}</tr>`;
  // tích phân hình thang theo thời gian (bước xuất có thể không đều; điểm đầu/cuối trọng số ½)
  const T = run.times, nS = run.snaps.length, tw = T.map((t, i) => ((i < nS - 1 ? T[i + 1] : t) - (i > 0 ? T[i - 1] : t)) / 2), tSpan = T[nS - 1] - T[0];
  for (const s of sinks) {
    let qs = 0; const acc = {};
    run.snaps.forEach((det, j) => { const i = det.U[s.id], w = tw[j] * (i.Qin || 0); if (!(w > 0)) return; const c = m.composites(i.Cin, p, {}); qs += w; for (const k in c) acc[k] = (acc[k] || 0) + w * c[k]; });
    h += `<tr><td class="l">${esc(s.u.name)}</td><td>${fmt(tSpan > 0 ? qs / tSpan : NaN)}</td>${m.compVars.filter(v => v[0] !== 'DO' && v[0] !== 'Alk').map(v => `<td>${qs > 0 ? fmt(acc[v[0]] / qs) : '—'}</td>`).join('')}</tr>`;
  }
  card.querySelector('#dynAvg').innerHTML = h + '</table>';
}

function exportStreamCSV() {
  const d = currentDet(); if (!d) return;
  const sys = d.sys, det = d.det, m = sys.m, p = sys.p20;
  const lines = ['"Chi tieu","Don vi",' + sys.links.map(l => '"' + linkName(l) + '"').join(',')];
  lines.push('Q,m3/d,' + sys.links.map((l, i) => det.Q[i].toPrecision(6)).join(','));
  const comps = sys.links.map((l, i) => m.composites(det.C[i], p, {}));
  m.compVars.forEach(v => lines.push(`"${v[1]}","${v[2]}",` + comps.map(c => (+c[v[0]].toPrecision(6))).join(',')));
  m.comps.forEach((c, k) => lines.push(`${c.id},"${c.u}",` + sys.links.map((l, i) => +det.C[i][k].toPrecision(6)).join(',')));
  downloadText('bang_dong.csv', '﻿' + lines.join('\n'), 'text/csv');
}
function downloadText(name, txt, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------------------------------------------------------- cầu nối sang SimNước */
const SIMNUOC_URL = 'nuoc.html';
function bridgeComp(sys, C) {
  const m = sys.m, p = sys.p20, I = m.idx, c = m.composites(C, p, {});
  const ss = I.SS !== undefined ? C[I.SS] : (C[I.SF] || 0) + (C[I.SA] || 0);
  return { T: sys.pl.T, pH: c.pH, sCOD: c.sCOD, SS: ss, COD: c.COD, TSS: c.TSS, VSS: c.VSS, NH4: c.NH4, NOx: c.NOx, PO4: c.PO4 || 0, TIC: I.STIC !== undefined ? C[I.STIC] : 0, DO: c.DO, Alk: c.Alk };
}
function bridgeToWater() {
  const d = currentDet(); if (!d) return;
  const sys = d.sys;
  const effs = sys.units.filter(c => c.type === 'effluent');
  if (!effs.length) { alert('Sơ đồ không có đơn vị "Nước ra".'); return; }
  let e = effs[0];
  if (effs.length > 1) {
    const k = prompt('Chọn dòng nước ra:\n' + effs.map((c, i) => (i + 1) + '. ' + c.u.name).join('\n'), '1');
    if (!k) return; e = effs[Math.max(0, Math.min(effs.length - 1, (+k || 1) - 1))];
  }
  const ss = APP.ss || d, li = ss.sys.links.findIndex(l => l.to[0] === e.id);
  const avg = Object.assign({ Q: ss.det.Q[li] }, bridgeComp(ss.sys, ss.det.C[li]));
  const B = { app: 'simxlnt', name: (APP.P.name || 'SimXLNT') + ' – ' + e.u.name, time: new Date().toLocaleString('vi-VN'), model: sys.m.id, avg };
  if (APP.dyn) {
    const run = APP.dyn, n = run.snaps.length, step = Math.max(1, Math.ceil(n / 1500)), li2 = run.sys.links.findIndex(l => l.to[0] === e.id);
    if (li2 >= 0) {
      const t = [], v = {};
      for (let i = 0; i < n; i += step) {
        const det = run.snaps[i], o = Object.assign({ Q: det.Q[li2] }, bridgeComp(run.sys, det.C[li2]));
        t.push(run.times[i]); for (const k in o) (v[k] = v[k] || []).push(+o[k].toPrecision(6));
      }
      B.series = { t, v };
    }
  }
  try { localStorage.setItem('simxlnt.bridge', JSON.stringify(B)); } catch (err) { alert('Không lưu được vào bộ nhớ trình duyệt: ' + err.message); }
  const go = confirm('Đã chuẩn bị dữ liệu nước ra "' + e.u.name + '" (Q = ' + fmt(avg.Q) + ' m³/d' + (B.series ? ', kèm chuỗi động ' + B.series.t.length + ' điểm' : '') + ').\n\nOK: mở SimNước và nhập ngay.\nCancel: tải tệp .bridge.json để nhập thủ công.');
  if (go && typeof XCH !== 'undefined' && XCH.inSuite) window.parent.postMessage({ xch: 'goto', app: 'nuoc', cmd: 'bridgeImport' }, '*');   // trong bộ phần mềm: chuyển tab SimNước
  else if (go) window.open(SIMNUOC_URL + '#import', '_blank');
  else downloadText((APP.P.name || 'simxlnt').replace(/[^\w\-À-ỹ ]+/g, '_') + '.bridge.json', JSON.stringify(B), 'application/json');
}