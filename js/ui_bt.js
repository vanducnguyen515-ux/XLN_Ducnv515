'use strict';
/* ==========================================================================
   SimXLNT – Tab "Bản tính": nhập .xlsx (nút hoặc kéo-thả), danh sách thông số
   (nguồn: bản tính / suy ra / mặc định / thiếu), dựng sơ đồ, so sánh kết quả.
   ========================================================================== */
BT.TYP = { Q: 10000, COD: 400, BOD: 200, TSS: 220, TKN: 45, NH4: 30, TP: 6, N: 4, W: 20, L: 40, Hmax: 5.5, Hmin: 4.2, Vws: 150, VT: 5000,
  Vkk: 1500, Vtk: 3000, Vhk: 6000, PXTSS: 2000, Acl: 1000, Vmem: 2000, Am: 30000 };
const BT_SRC = { bt: ['Bản tính', '#15803d', '#e6f5ea'], calc: ['Suy ra', '#1d4ed8', '#e8f0fc'], def: ['Mặc định phần mềm', '#b45309', '#fdf3e1'], typ: ['Giá trị điển hình', '#b45309', '#fdf3e1'], user: ['Nhập tay', '#7c3aed', '#f3e8ff'], miss: ['THIẾU', '#b91c1c', '#fde8e8'] };

/* nhập tệp */
async function btImportFile(file) {
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) { alert('Chỉ nhận tệp bản tính .xlsx'); return; }
  try {
    const wb = await XLSX_READ.read(await file.arrayBuffer());
    const doc = BT.parse(wb, file.name);
    const D = BT.plan(doc);
    for (const p of D.params) if (p.src === 'miss' && BT.TYP[p.id] !== undefined) p.typ = BT.TYP[p.id];
    APP.btPlan = D;
    showTab('bt');
  } catch (e) { alert('Không đọc được bản tính: ' + e.message); console.error(e); }
}
window.addEventListener('DOMContentLoaded', () => {
  const hdr = document.querySelector('header');
  const b = el(`<button id="btnBT" title="Nhập bản tính thiết kế .xlsx (hoặc kéo-thả tệp vào cửa sổ)">Nhập bản tính…</button>`);
  const fi = el(`<input type="file" id="fileBT" accept=".xlsx" hidden>`);
  hdr.insertBefore(b, $('#btnNew')); hdr.appendChild(fi);
  b.onclick = () => fi.click();
  fi.onchange = e => { btImportFile(e.target.files[0]); e.target.value = ''; };
  // kéo-thả tệp .xlsx vào bất kỳ chỗ nào
  window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
  window.addEventListener('dragleave', e => { if (e.target === document.documentElement || !e.relatedTarget) document.body.classList.remove('dropping'); });
  window.addEventListener('drop', e => {
    document.body.classList.remove('dropping');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /\.xlsx$/i.test(f.name)) { e.preventDefault(); btImportFile(f); }
  });
});

function btDesign() { return APP.btPlan || (APP.P && APP.P.design) || null; }

function renderBT() {
  const box = $('#tab-bt'); box.innerHTML = '';
  const D = btDesign();
  if (!D) {
    box.appendChild(el(`<div class="card"><h2>Nhập bản tính thiết kế</h2>
      <p>Thả tệp bản tính <b>.xlsx</b> (xuất từ phần mềm thiết kế XLNT) vào cửa sổ này, hoặc bấm nút bên dưới. Chương trình sẽ đọc các sheet <code>01_DauVao</code>, <code>02_CanBang</code>, <code>06_SH</code>, <code>LT2</code>… để tự dựng sơ đồ, gán thông số bể/thiết bị, liệt kê thông số còn thiếu và so sánh kết quả mô phỏng với kết quả tính toán.</p>
      <div class="dropzone" id="btDrop">Kéo-thả tệp .xlsx vào đây<br><button class="pri" style="margin-top:10px">Chọn tệp…</button></div>
      <p class="small muted">Công nghệ hỗ trợ: ICEAS, C-Tech, SBR, CAS, AO, A²O, mương oxy hóa, AO-MBR, AO-MBBR (Organica/Biopolus xấp xỉ bằng IFAS). Song chắn, lắng cát, khử trùng, xử lý bùn chưa mô phỏng – nước vào lấy ở cột ④ của bảng cân bằng (đã gồm tải nước tách bùn hoàn lưu).</p></div>`));
    box.querySelector('#btDrop button').onclick = () => $('#fileBT').click();
    return;
  }
  // bộ số liệu đối chiếu (ví dụ kết quả SUMO): chỉ so sánh, không dựng lại sơ đồ
  if (D.ref) {
    box.appendChild(el(`<div class="card"><h2>Đối chiếu: ${esc(D.title || D.file)}</h2>
      <div class="kpis">${kpiTxt('Nguồn', D.file)}${kpiTxt('Công nghệ / mô hình gốc', D.techName)}${kpiTxt('Số chỉ tiêu đối chiếu', String(D.targets.length))}</div>
      ${D.note ? `<div class="small" style="margin-top:8px;max-width:1000px">${D.note}</div>` : ''}
      ${D.chain && D.chain.length ? `<h3>Dây chuyền trong mô hình gốc</h3><table class="t" style="max-width:900px"><tr><th class="l">Công đoạn</th><th class="l">Trong mô hình gốc</th><th class="l">Trong sơ đồ SimXLNT này</th></tr>${D.chain.map(c => `<tr><td class="l">${esc(c.n)}</td><td class="l">${esc(c.c)}</td><td class="l">${c.sim ? '<b style="color:var(--ok)">' + esc(c.sim === true ? 'có' : c.sim) + '</b>' : '<span class="muted">không (dòng hồi lưu lấy theo kết quả gốc)</span>'}</td></tr>`).join('')}</table>` : ''}</div>`));
    if (APP.P.sumoCx && typeof SUMOIMP !== 'undefined') {
      const o = APP.P.sumoOpt || {}, cur = APP.P.model;
      const fams = Object.values(MODELS).filter(m => m.id !== 'ADM1' && !m.gran).map(m => `<option value="${m.id}"${m.id === cur ? ' selected' : ''}>${m.id} – ${esc(m.name)}</option>`).join('');
      const rb = el(`<div class="card"><h2>Dựng lại sơ đồ từ dự án SUMO</h2>
        <div class="row"><label>Mô hình SimXLNT <select id="suModel">${fams}</select></label>
        <label><input type="checkbox" id="suPrim"${o.primary === 'sim' ? ' checked' : ''}> Mô phỏng lắng sơ cấp (tách lý tưởng)</label>
        <label><input type="checkbox" id="suFull"${o.scope === 'full' ? ' checked' : ''}> Mô phỏng cả dây chuyền bùn (nén, phân hủy ADM1, tách nước, bể dòng phụ)</label>
        <label><input type="checkbox" id="suFit"${o.fitComp !== false ? ' checked' : ''}> Hệ số N, P thành phần theo dòng vào SUMO</label>
        <button class="pri" id="suBuild">Dựng lại & tính ổn định</button></div>
        <p class="small muted">Mặc định: dây chuyền nước với nước sau lắng sơ cấp và các dòng tuần hoàn từ dây chuyền bùn lấy theo kết quả SUMO – so sánh tách bạch mô hình bùn hoạt tính. Mô hình đề xuất: ${SUMOIMP.simModel(APP.P.sumoCx.model)} cho ${esc(APP.P.sumoCx.model)}.</p></div>`);
      box.appendChild(rb);
      rb.querySelector('#suBuild').onclick = async () => {
        const opt = { model: rb.querySelector('#suModel').value, primary: rb.querySelector('#suPrim').checked ? 'sim' : '', scope: rb.querySelector('#suFull').checked ? 'full' : '', fitComp: rb.querySelector('#suFit').checked };
        try { setProject(SUMOIMP.build(APP.P.sumoCx, opt)); } catch (e) { alert('Không dựng được sơ đồ: ' + e.message); return; }
        showTab('bt'); await runSteady(); renderBT();
      };
    }
    if (APP.ss && !APP.stale) box.appendChild(btCompareCard(D));
    else {
      box.appendChild(el(`<div class="card"><h2>So sánh</h2><p>${APP.stale ? 'Sơ đồ/thông số đã thay đổi – ' : ''}Chưa có kết quả ổn định. <button class="pri" id="btRun">▶ Tính ổn định</button></p></div>`));
      const br = $('#btRun'); br.onclick = async () => { const iv = setInterval(() => { const f = $('#ftState'); if (f) br.textContent = f.textContent; }, 500); await runSteady(); clearInterval(iv); renderBT(); };
    }
    return;
  }
  const pending = D === APP.btPlan;
  const miss = BT.missing(D);
  const head = el(`<div class="card"><h2>Bản tính: ${esc(D.title || D.file)}</h2>
    <div class="kpis">${kpiTxt('Tệp', D.file)}${kpiTxt('Công nghệ sinh học', D.techName)}${kpiTxt('Nhập lúc', D.time)}${kpiTxt('Thông số', D.params.length + ' (' + D.params.filter(p => p.src === 'bt').length + ' từ bản tính)')}${kpiTxt('Còn thiếu', String(miss.length), miss.length ? 'bad' : 'ok')}</div>
    <h3>Dây chuyền công nghệ trong bản tính</h3><table class="t" style="max-width:900px"><tr><th class="l">Công đoạn</th><th class="l">Lựa chọn</th><th class="l">Mô phỏng</th></tr>
    ${D.chain.map(c => `<tr><td class="l">${esc(c.n)}</td><td class="l">${esc(c.c)}</td><td class="l">${c.sim || (D.scope === 'full' && !/^Không/i.test(c.c) && ['Song chắn rác thô', 'Lưới lọc rác tinh', 'Lắng cát – tách dầu', 'Bể điều hòa', 'Hóa lý', 'Lọc bậc 3', 'Khử trùng', 'Nén bùn', 'Khử nước bùn'].includes(c.n)) ? '<b style="color:var(--ok)">có</b>' : '<span class="muted">không (chỉ đối chiếu)</span>'}</td></tr>`).join('')}</table>
    <div class="row" style="margin-top:12px"><label>Mô hình động học <select id="btModel"><option value="ASM2d">ASM2d (C, N, P sinh học & hóa học)</option><option value="ASM1">ASM1 (C, N)</option><option value="ASM2dG">ASM2dG (ASM2d + bùn hạt)</option><option value="ASM1G">ASM1G (ASM1 + bùn hạt)</option></select></label>
    <label>Phạm vi sơ đồ <select id="btScope"><option value="bio">Cụm sinh học (nước vào cột ④)</option><option value="full">Toàn dây chuyền: tiền xử lý · hóa lý · lọc · khử trùng · xử lý bùn (nước thô cột ①)</option></select></label>
    <button class="pri" id="btBuild">${pending ? 'Dựng sơ đồ' : 'Dựng lại sơ đồ'}</button><button class="pri" id="btBuildRun">${pending ? 'Dựng sơ đồ & tính ổn định' : 'Dựng lại & tính ổn định'}</button>
    <button id="btNew">Nhập bản tính khác…</button><span class="small muted" id="btStat"></span></div>
    ${miss.length ? `<div class="msg err">Còn ${miss.length} thông số thiếu: ${miss.map(p => esc(p.l)).join('; ')}. Nhập tay ở bảng dưới hoặc bấm "Dùng giá trị điển hình".</div>` : '<div class="msg ok">Đủ thông số để dựng sơ đồ.</div>'}
    ${!pending ? '<p class="small muted">Sơ đồ hiện tại được dựng từ bản tính này. Sửa thông số ở bảng dưới rồi bấm "Dựng lại" (thay thế sơ đồ, các chỉnh sửa tay trên sơ đồ sẽ mất).</p>' : ''}</div>`);
  box.appendChild(head);
  head.querySelector('#btModel').value = D.model || 'ASM2d';
  head.querySelector('#btModel').onchange = e => { D.model = e.target.value; if (!pending) saveLocal(); };
  head.querySelector('#btScope').value = D.scope || 'bio';
  head.querySelector('#btScope').onchange = e => { D.scope = e.target.value; if (!pending) saveLocal(); renderBT(); };
  head.querySelector('#btNew').onclick = () => $('#fileBT').click();
  const doBuild = async run => {
    const m = BT.missing(D);
    if (m.length) { alert('Còn thiếu: ' + m.map(p => p.l).join('; ')); return; }
    const P = BT.build(D);
    APP.btPlan = null;
    setProject(P);
    showTab('bt');
    if (run) { const st = $('#btStat'); if (st) st.textContent = 'Đang tính trạng thái ổn định…'; const iv = setInterval(() => { const s = $('#btStat'), f = $('#ftState'); if (s && f) s.textContent = f.textContent; }, 500); await runSteady(); clearInterval(iv); renderBT(); }
  };
  head.querySelector('#btBuild').onclick = () => doBuild(false);
  head.querySelector('#btBuildRun').onclick = () => doBuild(true);
  // bảng so sánh
  if (!pending && APP.ss && !APP.stale) box.appendChild(btCompareCard(D));
  else if (!pending) box.appendChild(el(`<div class="card"><h2>So sánh với bản tính</h2><p>${APP.stale ? 'Sơ đồ/thông số đã thay đổi – ' : ''}Chưa có kết quả ổn định. <button class="pri" id="btRun">▶ Tính ổn định</button></p></div>`));
  const br = $('#btRun'); if (br) br.onclick = async () => { const iv = setInterval(() => { const s = br.parentElement, f = $('#ftState'); if (f) br.textContent = f.textContent; }, 500); await runSteady(); clearInterval(iv); renderBT(); };
  // bảng thông số
  const grps = [...new Set(D.params.map(p => p.grp))];
  const card = el(`<div class="card"><h2>Thông số ánh xạ từ bản tính</h2>
    <div class="row" style="margin-bottom:8px"><button id="btTyp">Dùng giá trị điển hình cho ô thiếu</button><label><input type="checkbox" id="btOnlyMiss"> Chỉ hiện ô thiếu / mặc định</label>
    <span class="small muted">Màu nguồn: ${Object.values(BT_SRC).map(s => `<span class="badge" style="color:${s[1]};background:${s[2]}">${s[0]}</span>`).join(' ')}</span></div><div id="btTab"></div></div>`);
  box.appendChild(card);
  const drawTab = () => {
    const only = card.querySelector('#btOnlyMiss').checked;
    let h = `<div class="tscroll" style="max-height:none"><table class="t"><tr><th class="l">Nhóm</th><th class="l">Thông số</th><th>Giá trị dùng</th><th class="l">Đơn vị</th><th class="l">Nguồn</th><th class="l">Trong bản tính / ghi chú</th></tr>`;
    for (const g of grps) for (const p of D.params.filter(x => x.grp === g)) {
      if (only && !['miss', 'def', 'typ'].includes(p.src)) continue;
      const s = BT_SRC[p.src] || BT_SRC.def;
      h += `<tr${p.src === 'miss' ? ' style="background:#fff5f5"' : ''}><td class="l small">${esc(g)}</td><td class="l">${esc(p.l)}</td><td><input type="number" step="any" data-p="${p.id}" value="${p.v == null ? '' : +(+p.v).toPrecision(6)}" placeholder="${p.typ != null ? 'điển hình ' + p.typ : ''}"></td>
        <td class="l small">${esc(p.u)}</td><td class="l"><span class="badge" style="color:${s[1]};background:${s[2]}">${s[0]}</span></td>
        <td class="l small">${p.ref ? `<code>${esc(p.ref)}</code> ${esc(p.btName || '')}${p.btUnit && p.btUnit !== p.u ? ' [' + esc(p.btUnit) + ']' : ''}` : ''}${p.note ? ' <span class="muted">' + esc(p.note) + '</span>' : ''}</td></tr>`;
    }
    card.querySelector('#btTab').innerHTML = h + '</table></div>';
    card.querySelectorAll('input[data-p]').forEach(inp => (inp.onchange = () => {
      // nhập tay + tính lại các thông số suy ra phụ thuộc (vd SRT → bùn dư, SVI → X_R, số bể × đường kính → diện tích lắng)
      const x = parseFloat(inp.value);
      if (isFinite(x)) BT.setParam(D, inp.dataset.p, x); else if (inp.value === '') BT.setParam(D, inp.dataset.p, null);
      if (!pending) saveLocal();
      renderBT();
    }));
  };
  card.querySelector('#btOnlyMiss').onchange = drawTab;
  card.querySelector('#btTyp').onclick = () => { for (const p of D.params) if (p.src === 'miss' && p.typ != null) { p.v = p.typ; p.src = 'typ'; } if (!pending) saveLocal(); renderBT(); };
  drawTab();
}
function kpiTxt(k, v, cls = '') { return `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v" style="font-size:15px">${esc(v || '–')}</div></div>`; }

function btCompareCard(D) {
  const ss = APP.ss, C = BT.compare(D, ss.sys, ss.det);
  const ST = { ok: ['khớp', 'var(--ok)'], near: ['gần', 'var(--warn)'], off: ['lệch', 'var(--bad)'], ref: ['tham khảo', 'var(--mute)'] };
  const fmtD = r => r.des2 != null ? fmt(Math.min(r.des, r.des2)) + ' – ' + fmt(Math.max(r.des, r.des2)) : fmt(r.des);
  const nOk = C.rows.filter(r => r.st === 'ok').length;
  const card = el(`<div class="card"><h2>So sánh kết quả mô phỏng với ${D.ref ? 'mô hình gốc' : 'bản tính'} <span class="small muted">(${ss.cycle ? 'trung bình một chu kỳ, ' : ''}T = ${fmt(+APP.P.plant.T)} °C)</span></h2>
    <div class="kpis">${kpiTxt('Chỉ tiêu khớp', nOk + ' / ' + C.rows.length, nOk === C.rows.length ? 'ok' : '')}${kpiTxt('Gần (trong 2× sai số cho phép)', String(C.rows.filter(r => r.st === 'near').length))}${kpiTxt('Lệch', String(C.rows.filter(r => r.st === 'off').length), C.rows.some(r => r.st === 'off') ? 'bad' : '')}</div>
    <div class="tscroll" style="margin-top:10px;max-height:none"><table class="t"><tr><th class="l">Chỉ tiêu</th><th class="l">Đơn vị</th><th>${D.ref ? 'Mô hình gốc' : 'Bản tính'}</th><th>Mô hình</th><th>Chênh lệch</th><th>%</th><th class="l">Đánh giá</th><th>Giới hạn xả</th><th class="l">Mô hình so với giới hạn</th><th class="l">${D.ref ? 'Nguồn' : 'Ô bản tính'}</th><th class="l">Cách quy đổi</th></tr>
    ${C.rows.map(r => `<tr><td class="l">${esc(r.l)}</td><td class="l small">${esc(r.u)}</td><td>${fmtD(r)}</td><td><b>${fmt(r.mod)}</b></td><td>${fmt(r.d)}</td><td>${isFinite(r.dr) ? (r.dr * 100).toFixed(1) + ' %' : '–'}</td>
      <td class="l" style="color:${ST[r.st][1]};font-weight:600">${ST[r.st][0]}</td><td>${r.lim != null ? fmt(r.lim) : ''}</td><td class="l">${r.limOk == null ? '' : r.limOk ? '<span style="color:var(--ok)">đạt</span>' : '<span style="color:var(--bad)">không đạt</span>'}</td><td class="l small"><code>${esc(r.ref)}</code></td><td class="l small" style="white-space:normal;min-width:240px">${esc(r.note || '')}</td></tr>`).join('')}</table></div>
    <div id="btBar"></div>
    <h3>Nhận xét & gợi ý hiệu chỉnh</h3><div id="btSug"></div>
    <div class="btnrow"><button id="btCsv">Xuất bảng so sánh CSV</button></div>
    <p class="small muted">${D.ref ? 'Số liệu gốc lấy từ kết quả ổn định của mô hình khác (xem ghi chú phía trên); cùng tiêu chí sai số. ' : ''}Bản tính dùng phương pháp trạng thái ổn định M&E/Sanitaire (hệ số động học M&E Bảng 8-14, SDNR thực nghiệm); mô hình dùng ${APP.P.model} động với chu kỳ thực. Sai số cho phép: nồng độ ra ±max(10 %, ngưỡng tuyệt đối), SRT/MLSS ±10 %, bùn/oxy ±15 %, khí/điện ±20 %.</p></div>`);
  const sug = card.querySelector('#btSug');
  if (!C.sug.length) sug.appendChild(el('<div class="msg ok">Kết quả mô phỏng phù hợp với bản tính trong giới hạn sai số.</div>'));
  for (const s of C.sug) {
    const d = el(`<div class="msg warn">${esc(s.txt)}${s.k === 'srt' ? ' <button class="pri" style="margin-left:8px">Tự hiệu chỉnh xả bùn để SRT = thiết kế</button>' : ''}</div>`);
    if (s.k === 'srt') d.querySelector('button').onclick = () => btCalibSRT(d.querySelector('button'));
    sug.appendChild(d);
  }
  card.querySelector('#btCsv').onclick = () => {
    const L = ['"Chi tieu","Don vi","Ban tinh","Mo hinh","Chenh lech","%","Danh gia","O ban tinh"'];
    C.rows.forEach(r => L.push(`"${r.l}","${r.u}",${r.des},${r.mod},${r.d},${isFinite(r.dr) ? (r.dr * 100).toFixed(2) : ''},"${r.st}","${r.ref}"`));
    downloadText('so_sanh_ban_tinh.csv', '﻿' + L.join('\n'), 'text/csv');
  };
  card.querySelector('#btBar').outerHTML = btBars(C.rows.filter(r => r.u === 'mg/L'));
  return card;
}

/* biểu đồ cột nhóm (SVG) – nồng độ nước ra: bản tính vs mô hình (+ giới hạn) */
function btBars(rows) {
  if (!rows.length) return '';
  const W = Math.max(520, rows.length * 90), H = 230, pl = 44, pb = 38, pt = 18, cw = (W - pl - 10) / rows.length;
  const mx = Math.max(...rows.map(r => Math.max(r.des || 0, r.mod || 0, r.lim || 0))) * 1.12 || 1;
  const ticks = niceTicks(0, mx, 5), top = ticks[ticks.length - 1], y = v => pt + (H - pt - pb) * (1 - v / top);
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;margin-top:12px" font-size="11">`;
  for (const t of ticks) s += `<line x1="${pl}" x2="${W - 10}" y1="${y(t)}" y2="${y(t)}" stroke="#e8ecf2"/><text x="${pl - 5}" y="${y(t) + 4}" text-anchor="end" fill="#5b6577">${fmtTick(t)}</text>`;
  rows.forEach((r, i) => {
    const x0 = pl + i * cw + cw * 0.15, bw = cw * 0.33;
    s += `<rect x="${x0}" y="${y(r.des)}" width="${bw}" height="${y(0) - y(r.des)}" fill="#94a3b8"><title>Bản tính: ${fmt(r.des)}</title></rect>`;
    s += `<rect x="${x0 + bw + 2}" y="${y(r.mod)}" width="${bw}" height="${Math.max(0, y(0) - y(r.mod))}" fill="${r.st === 'ok' ? '#16a34a' : r.st === 'near' ? '#d97706' : '#dc2626'}"><title>Mô hình: ${fmt(r.mod)}</title></rect>`;
    if (r.lim != null) s += `<line x1="${x0 - 3}" x2="${x0 + 2 * bw + 5}" y1="${y(r.lim)}" y2="${y(r.lim)}" stroke="#0f172a" stroke-dasharray="4 2"><title>Giới hạn ${fmt(r.lim)}</title></line>`;
    s += `<text x="${x0 + bw}" y="${H - pb + 14}" text-anchor="middle" fill="#172033">${esc(r.l.replace(/ ra$/, ''))}</text>`;
  });
  s += `<rect x="${pl}" y="${H - 14}" width="10" height="9" fill="#94a3b8"/><text x="${pl + 14}" y="${H - 6}">Bản tính</text><rect x="${pl + 80}" y="${H - 14}" width="10" height="9" fill="#16a34a"/><text x="${pl + 94}" y="${H - 6}">Mô hình (xanh khớp / cam gần / đỏ lệch)</text><line x1="${pl + 340}" x2="${pl + 362}" y1="${H - 10}" y2="${H - 10}" stroke="#0f172a" stroke-dasharray="4 2"/><text x="${pl + 366}" y="${H - 6}">Giới hạn xả</text>`;
  return s + '</svg>';
}
/* tự hiệu chỉnh lượng xả bùn để SRT mô hình = SRT thiết kế (secant trên log, có kẹp khoảng) */
function btWasActs() {
  const U = APP.P.units, out = [];
  for (const u of U) {
    if (['iceas', 'ctech', 'sbr'].includes(u.type)) out.push([u, u.p.wasMode === 'srt' ? 'SRTw' : 'Vwas']);
    else if (u.type === 'splitter' && u.id === 'SPW') out.push([u, 'Q']);
  }
  if (!out.length) { const cl = U.find(u => u.type === 'clarifier'); if (cl) out.push([cl, 'uQ']); }
  return out;
}
async function btCalibSRT(btn) {
  const D = APP.P.design; if (!D || !APP.ss) return;
  const acts = btWasActs(); if (!acts.length) { alert('Không tìm thấy đơn vị xả bùn để hiệu chỉnh.'); return; }
  const tgt = D.targets.find(t => t.k === 'SRT'); if (!tgt) return;
  const des = +tgt.v, base = acts.map(([u, k]) => +u.p[k]);
  const setF = f => acts.forEach(([u, k], i) => (u.p[k] = +(base[i] * f).toPrecision(5)));
  const srtNow = () => plantSummary(APP.ss.sys, APP.ss.det).SRT;
  let f = 1, s = srtNow(), lo = null, hi = null, prev = null;   // lo: f cho SRT > des (xả ít), hi: f cho SRT < des
  const say = t => { if (btn) btn.textContent = t; log('  [hiệu chỉnh SRT] ' + t); };
  for (let it = 0; it < 9; it++) {
    const e = Math.log(s / des);
    say(`lượt ${it}: hệ số xả ${f.toFixed(3)} → SRT ${fmt(s)} d (mục tiêu ${fmt(des)})`);
    if (Math.abs(e) < 0.03) break;
    if (s > des) lo = f; else hi = f;
    let fn;
    if (prev && Math.abs(Math.log(f / prev.f)) > 1e-6) { const k = (Math.log(s) - Math.log(prev.s)) / (Math.log(f) - Math.log(prev.f)); fn = Math.abs(k) > 0.05 ? f * Math.exp(-e / k) : NaN; }
    else fn = f * Math.exp((acts[0][1] === 'SRTw' ? -1 : 1) * Math.max(Math.min(e, Math.log(2)), -Math.log(2)));
    if (lo != null && hi != null && !(fn > Math.min(lo, hi) && fn < Math.max(lo, hi))) fn = Math.sqrt(lo * hi);
    if (!isFinite(fn)) fn = lo != null && hi != null ? Math.sqrt(lo * hi) : f * ((s > des) === (acts[0][1] !== 'SRTw') ? 1.5 : 0.67);
    prev = { f, s }; f = fn;
    setF(f); changed('was');
    await runSteady();
    if (!APP.ss) break;
    s = srtNow();
  }
  renderBT();
}