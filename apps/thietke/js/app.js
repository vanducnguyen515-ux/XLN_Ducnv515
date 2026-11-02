/* =====================================================================
   GIAO DIỆN ỨNG DỤNG
   ===================================================================== */
'use strict';

const APP = (() => {
  const KEY = 'xlnt_design_v1';
  let S, RES = [], tab = 'input', dwgCache = null, dwgIdx = 0, zoom = 1, issueAlt = null, FIXES = [];
  const $ = s => document.querySelector(s);
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const TABS = [
    ['input', 'Đầu bài'], ['std', 'Tiêu chuẩn xả'], ['alts', 'Phương án công nghệ'], ['params', 'Thông số thiết kế'],
    ['results', 'Kết quả & kiểm tra'], ['hyd', 'Thủy lực'], ['cost', 'Thiết bị & chi phí'], ['compare', 'So sánh phương án'],
    ['pfd', 'Sơ đồ công nghệ'], ['report', 'Bản tính chi tiết'], ['dwg', 'Bản vẽ thiết kế'], ['ops', 'Kiểm tra vận hành'],
  ];
  // nhãn ngắn trên thanh thẻ ngang (tên đầy đủ hiện khi rê chuột)
  const TAB_SHORT = { std: 'Tiêu chuẩn', alts: 'Phương án', params: 'Thông số', results: 'Kết quả', cost: 'Thiết bị & CP', compare: 'So sánh', pfd: 'Sơ đồ CN', report: 'Bản tính', dwg: 'Bản vẽ', ops: 'Vận hành' };

  /* ---------------- trạng thái ---------------- */
  function migrate(s) {
    const d = DATA.defaultState();
    s.p = Object.assign(DATA.defaultParams(), s.p || {});
    s.eff = Object.assign(JSON.parse(JSON.stringify(DATA.EFF_DEF)), s.eff || {});
    s.project = Object.assign(d.project, s.project || {});
    s.input = Object.assign(d.input, s.input || {}); s.input.q = Object.assign({}, d.input.q, s.input.q || {});
    s.std = Object.assign(d.std, s.std || {});
    s.opex = Object.assign(DATA.defaultOpex(), s.opex || {});
    s.alts = (s.alts && s.alts.length ? s.alts : d.alts).map(a => ({ name: a.name, note: a.note || '', c: Object.assign(DATA.defaultAlt('', 'ICEAS').c, a.c || {}) }));
    s.cur = Math.min(s.cur || 0, s.alts.length - 1);
    return s;
  }
  function load() {
    try { const t = localStorage.getItem(KEY); if (t) return migrate(JSON.parse(t)); } catch (e) { /* bỏ qua */ }
    return DATA.sample('iceas202');
  }
  let saveT = null;
  function persist() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* bỏ qua */ } }, 300); }
  function recompute() {
    RES = S.alts.map(alt => { try { return { alt, R: ENG.run(S, alt) }; } catch (e) { console.error(e); return { alt, err: e }; } });
    dwgCache = null;
  }
  const cur = () => RES[S.cur];
  function setPath(path, v) {
    const ks = path.split('.'); let o = S;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v;
  }
  function getPath(path) { return path.split('.').reduce((o, k) => o == null ? o : o[k], S); }
  const bil = t => { const e = BI.en(t); return e ? t + '\n' + e : t; };
  function toast(t) { const el = $('#toast'); el.textContent = t; if (BI.en(t)) { const s = document.createElement('span'); s.className = 'en'; s.textContent = BI.en(t); el.appendChild(s); } el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 2200); }
  function download(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const fileBase = () => (S.project.code || 'XLNT').replace(/[^\w\-]+/g, '_') + '_' + Math.round(S.input.Q);
  const altTag = () => 'PA' + (S.cur + 1);

  /* ---------------- khung ---------------- */
  function renderNav() {
    const r = cur();
    const ok = r && r.R ? r.R.kpi.comply : false;
    // thanh thẻ ngang (đồng bộ SimXLNT) + tóm tắt phương án ở thanh trạng thái dưới cùng
    $('#nav').innerHTML = TABS.map(([k, t], i) => `<a data-tab="${k}" class="${k === tab ? 'on' : ''}" title="${esc(t)}"><span class="n">${i + 1}</span>${TAB_SHORT[k] || t}</a>`).join('');
    const sumHtml = r && r.R ? `<span class="sum"><b>${esc(r.alt.name)}</b> ${ok ? '<span class="badge ok">Đạt tiêu chuẩn xả</span>' : '<span class="badge bad">Chưa đạt tiêu chuẩn</span>'}
      <span>Bể sinh học <b>${fx(r.R.kpi.Vbio, 0)}</b> m³</span><span>Điện <b>${fx(r.R.kpi.kWhm3)}</b> kWh/m³</span><span>Bùn <b>${fx(r.R.kpi.cake)}</b> t/ngđ</span>
      <span>Kiểm tra ${r.R.kpi.nFail ? `<span class="badge bad">${r.R.kpi.nFail} lỗi thiết kế</span>` : '<span class="badge ok">0 lỗi thiết kế</span>'} ${r.R.kpi.nWarn ? `<span class="badge warn">${r.R.kpi.nWarn} lưu ý</span>` : ''}</span></span>` : '';
    const ft = $('#foot'); if (ft) ft.innerHTML = sumHtml + '<span class="grow"></span><span>Thiết kế XLNT · M&amp;E 5th · Sanitaire ICEAS 202 · QCVN</span>';
    else $('#nav').insertAdjacentHTML('beforeend', sumHtml);
    $('#projTitle').textContent = S.project.name + (S.project.location ? ' – ' + S.project.location : '');
    $('#altSel').innerHTML = S.alts.map((a, i) => `<option value="${i}" ${i === S.cur ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  }
  function render() {
    FIXES = [];
    renderNav();
    const f = { input: vInput, std: vStd, alts: vAlts, params: vParams, results: vResults, hyd: vHyd, cost: vCost, compare: vCompare, pfd: vPFD, report: vReport, dwg: vDwg, ops: vOps }[tab];
    $('#main').innerHTML = f();
    BI.decorate($('#main')); BI.decorate($('#nav'));
    if (tab === 'dwg') showSheet(dwgIdx);
  }
  function refresh() { recompute(); persist(); render(); }

  /* ---------------- ô nhập ---------------- */
  const num = (path, o) => { o = o || {}; const v = getPath(path); return `<input type="number" step="any" data-path="${path}" value="${v === undefined ? '' : v}" ${o.w ? `style="width:${o.w}px"` : ''}>`; };
  const txt = (path, o) => `<input type="text" data-path="${path}" data-t="s" value="${esc(getPath(path))}" ${o && o.ph ? `placeholder="${o.ph}"` : ''}>`;
  const sel = (path, opts, o) => `<select data-path="${path}" data-t="${(o && o.t) || 's'}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(getPath(path)) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

  /* ---------------- 1. Đầu bài ---------------- */
  function vInput() {
    const I = S.input;
    const ic = INF.check(S);
    const BADGE = { ok: '<span class="badge ok">Hợp lý</span>', warn: '<span class="badge warn">Bất thường</span>', bad: '<span class="badge bad">Lỗi logic</span>' };
    const rgOf = k => ic.items.find(i => i.grp === 'range' && i.key === k) || ic.items.find(i => i.grp === 'data' && i.id === 'miss_' + k);
    const qcell = k => { const it = rgOf(k), b = ic.T.r[k]; return `<td class="n hint">${b ? INF.rng(b) : '—'}</td><td>${it ? BADGE[it.st] : ''}</td>`; };
    const qrows = DATA.QPARAMS.filter(q => q[0] !== 'NO3').map(([k, nm, un]) => `<tr><td>${nm}</td><td>${un}</td><td>${num('input.q.' + k)}</td>${qcell(k)}</tr>`).join('');
    return `<h2 class="tt">1. Đầu bài thiết kế</h2><p class="lead">Nhập thông tin dự án, lưu lượng và chất lượng nước thải đầu vào. Mọi kết quả tự tính lại khi thay đổi.</p>
    ${S.sample ? `<div class="card" style="margin-bottom:12px"><h3>Mẫu tính toán: ${esc(S.sample.name)}</h3><p class="hint"><b>Nguồn:</b> ${esc(S.sample.src)}</p><p>${esc(S.sample.note)}</p></div>` : ''}
    <div class="grid2">
      <div class="card"><h3>Thông tin dự án</h3><div class="form">
        <label>Tên dự án</label>${txt('project.name')}<label>Địa điểm</label>${txt('project.location')}
        <label>Chủ đầu tư</label>${txt('project.owner')}<label>Ký hiệu bản vẽ</label>${txt('project.code')}
        <label>Giai đoạn</label>${txt('project.stage')}<label>Người thiết kế</label>${txt('project.designer')}
        <label>Người kiểm tra</label>${txt('project.checker')}<label>Ngày lập</label><input type="date" data-path="project.date" data-t="s" value="${esc(S.project.date)}">
      </div></div>
      <div class="card"><h3>Lưu lượng & điều kiện thiết kế</h3><div class="form">
        <label>Lưu lượng trung bình Q (m³/ngđ)</label>${num('input.Q')}
        <label>Số mô đun song song</label>${num('input.nMod')}
        <label>Hệ số không điều hòa k_max</label><div class="row">${num('input.kmax')}<span class="hint">Q_max,h = ${fx(I.Q / 24 * I.kmax)} m³/h</span></div>
        <label>Hệ số không điều hòa k_min</label>${num('input.kmin')}
        <label>Nhiệt độ nước thải thấp nhất (°C)</label><div class="row">${num('input.Tmin')}<span class="hint">dùng cho động học sinh học</span></div>
        <label>Nhiệt độ nước thải cao nhất (°C)</label><div class="row">${num('input.Tmax')}<span class="hint">dùng cho cấp khí ICEAS</span></div>
        <label>Cao độ khu vực (m)</label>${num('input.z')}
      </div></div>
    </div>
    <div class="card"><h3>Chất lượng nước thải đầu vào</h3>
      <div class="row" style="margin-bottom:8px"><label>Bộ số liệu mẫu:</label><select id="presetSel">${Object.entries(DATA.INFLUENT_PRESETS).map(([k, v]) => `<option value="${k}" ${I.preset === k ? 'selected' : ''}>${v.name}</option>`).join('')}<option value="custom" ${I.preset === 'custom' ? 'selected' : ''}>Tự nhập</option></select><button id="applyPreset">Nạp bộ số liệu</button><span class="hint">Sửa trực tiếp các ô bên dưới để nhập số liệu phân tích thực tế.</span></div>
      <table class="t" style="max-width:860px"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th><th>Giá trị</th><th>Khoảng thường gặp – ${esc(ic.T.short)}</th><th>Đối chiếu</th></tr></thead><tbody>${qrows}<tr><td>pH</td><td>-</td><td>${num('input.q.pH')}</td>${qcell('pH')}</tr></tbody></table>
      <p class="hint">Các tỷ lệ đặc trưng (bCOD/BOD, sBOD/BOD, sCOD/COD, rbCOD/bCOD, VSS/TSS) chỉnh ở tab 4 – nhóm "Đặc trưng nước thải & sinh học chung".</p>
    </div>
    ${inCheckCard(ic, BADGE)}`;
  }
  /* Kiểm tra sự phù hợp & logic của bộ số liệu đầu vào */
  function inCheckCard(ic, BADGE) {
    const typeOpts = [['auto', 'Tự nhận dạng theo số liệu' + (ic.sel === 'auto' ? ` → ${ic.T.short}` : '')], ...Object.entries(INF.TYPES).map(([k, t]) => [k, t.name])];
    const bars = ic.scores.map(x => `<div class="mbar${x.k === ic.tk ? ' on' : ''}"><span>${esc(x.name)}</span><i style="width:${Math.max(2, x.score).toFixed(0)}%"></i><b>${fx(x.score, 0)} %</b></div>`).join('');
    const logic = ic.items.filter(i => i.grp === 'logic');
    const lrows = logic.map(i => `<tr class="${i.st}"><td>${esc(i.name)}${i.f ? `<div class="hint">${esc(i.f)}</div>` : ''}</td><td class="n">${fx(i.val, i.unit === '-' ? 3 : 2)}</td><td class="hint">${esc(i.range)}</td><td>${BADGE[i.st]}</td></tr>`).join('');
    const issues = ic.items.filter(i => i.st !== 'ok').sort((a, b) => (a.st === 'bad' ? 0 : 1) - (b.st === 'bad' ? 0 : 1));
    const ilist = issues.length ? `<ol class="inissues">${issues.map(i => `<li class="${i.st}">${BADGE[i.st]} <b>${esc(i.grp === 'range' ? i.sym + ' = ' + fx(i.val) + ' ' + i.unit : i.grp === 'data' ? i.name : i.name + ' = ' + fx(i.val, 3))}</b><div>Giải thích sơ bộ: ${esc(i.why || '')}.</div><div class="chk">Cần kiểm tra: ${esc(i.check || '')}.</div></li>`).join('')}</ol>`
      : '<p><span class="badge ok">Bộ số liệu nhất quán</span> Không phát hiện điểm bất thường so với các quan hệ logic và khoảng thường gặp.</p>';
    return `<div class="card" id="inchk"><h3>Kiểm tra sự phù hợp & logic của số liệu đầu vào</h3>
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap;gap:8px"><label>Loại nước thải đối chiếu:</label>${sel('input.wwType', typeOpts)}
        ${ic.nBad ? `<span class="badge bad">${ic.nBad} lỗi logic</span>` : '<span class="badge ok">0 lỗi logic</span>'} ${ic.nWarn ? `<span class="badge warn">${ic.nWarn} điểm bất thường</span>` : ''}
        <span class="hint">Mức phù hợp với "${esc(ic.T.short)}": <b>${fx(ic.tScore, 0)} %</b></span></div>
      <div class="grid2">
        <div><h4>Quan hệ logic & tỷ lệ đặc trưng</h4><table class="t"><thead><tr><th>Kiểm tra</th><th>Giá trị</th><th>Khoảng hợp lý</th><th>Đánh giá</th></tr></thead><tbody>${lrows}</tbody></table></div>
        <div><h4>Bộ số liệu giống loại nước thải nào?</h4><div class="mbars">${bars}</div>
          <p class="hint">Mức phù hợp = tỷ lệ (có trọng số) các chỉ tiêu và tỷ lệ BOD/COD, NH₄/TKN nằm trong khoảng thường gặp; lệch ×4 ngoài khoảng tính 0 điểm.</p>
          ${ic.T.note ? `<p><b>Lưu ý ngành ${esc(ic.T.short)}:</b> ${esc(ic.T.note)}</p>` : ''}
          <p class="hint">Nguồn khoảng tham chiếu: ${esc(ic.T.src)}. Khoảng tham chiếu chỉ để sàng lọc sơ bộ, không thay số liệu quan trắc thực tế.</p></div>
      </div>
      ${ic.notes.map(t => `<p class="warnline">⚠ ${esc(t)}</p>`).join('')}
      <h4>Các điểm cần xem lại</h4>${ilist}
    </div>`;
  }

  /* ---------------- 2. Tiêu chuẩn ---------------- */
  function vStd() {
    const st = DATA.STANDARDS[S.std.id], lim = ENG.limits(S);
    let extra = '';
    if (st.kind === 'qcvn40') extra = `<label>Hệ số nguồn tiếp nhận Kq</label>${sel('std.Kq', DATA.KQ_OPTIONS.map(([v, t]) => [v, v + ' – ' + t]), { t: 'n' })}
      <label>Hệ số lưu lượng Kf</label>${sel('std.Kf', [['auto', 'Tự động theo Q (' + DATA.kfOf(S.input.Q) + ')'], [0.9, '0,9 (Q > 5.000)'], [1.0, '1,0 (500 – 5.000)'], [1.1, '1,1 (50 – 500)'], [1.2, '1,2 (≤ 50)']])}`;
    else if (st.kind === 'qcvn14') extra = `<label>Hệ số K</label>${sel('std.K14', DATA.K14_OPTIONS.map(([v, t]) => [v, v + ' – ' + t]), { t: 'n' })}`;
    else if (st.kind === 'q2025') extra = `<label>Cột (phân vùng xả thải)</label>${sel('std.col', DATA.STD_COLS)}
      <label>Nguồn nước tiếp nhận (cho T-P)</label>${sel('std.recv', DATA.RECV_OPTIONS)}
      ${st.TP.songTS ? `<label>Loại hình (cho T-P xả ra sông/biển)</label>${sel('std.tpGroup', DATA.TPGROUP_OPTIONS)}` : ''}
      <label>Bậc lưu lượng xả F</label><div>${esc(lim.tierName)} <span class="hint">(theo Q thiết kế ${fx(S.input.Q)} m³/ngđ)</span></div>`;
    const colVals = k => { if (st.kind !== 'q2025') return null; const a = k === 'TP' ? st.TP[lim.recv === 'ho' ? 'ho' : (st.TP.songTS && S.std.tpGroup === 'aqua' ? 'songTS' : 'song')] : st.t[k]; if (!a) return '—'; const r = Array.isArray(a[0]) ? a[lim.tier] : a; return r.map((v, i) => 'ABC'[i] === lim.col ? `<b>${fx(v)}</b>` : fx(v)).join(' / '); };
    const rows = DATA.QPARAMS.filter(q => q[0] !== 'Alk').map(([k, nm, un]) => {
      const base = st.kind === 'custom' ? num('std.custom.' + k) : st.kind === 'q2025' ? colVals(k) : (st.v[k] !== undefined ? fx(st.v[k]) : '—');
      return `<tr><td>${nm}</td><td>${un}</td><td class="n">${base}</td><td class="n"><b>${lim.L[k] !== undefined ? fx(lim.L[k]) : '—'}</b></td></tr>`;
    }).join('');
    return `<h2 class="tt">2. Lựa chọn thông số đầu ra</h2><p class="lead">Chọn quy chuẩn xả thải và hệ số áp dụng. Mục tiêu thiết kế của cụm sinh học (NH₄-N, NO₃-N) tự suy từ giới hạn này.</p>
    <div class="grid2"><div class="card"><h3>Quy chuẩn áp dụng</h3><div class="form">
      <label>Tiêu chuẩn</label>${sel('std.id', Object.entries(DATA.STANDARDS).map(([k, v]) => [k, v.name]))}${extra}
      <label>pH cho phép</label><div>${esc(st.pH)}</div></div><p class="hint" style="margin-top:10px">${esc(st.note)}</p>
      ${lim.kq !== null ? `<p><b>Hệ số áp dụng Kq × Kf = ${fx(lim.kq)} × ${fx(lim.kf)} = ${fx(lim.k)}</b></p>` : ''}</div>
    <div class="card"><h3>Giới hạn áp dụng cho thiết kế</h3><table class="t"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th><th>${st.kind === 'q2025' ? 'Cột A / B / C (bậc F hiện tại)' : 'Giá trị C (cột quy chuẩn)'}</th><th>Giới hạn áp dụng</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  /* ---------------- 3. Phương án ---------------- */
  function vAlts() {
    const n = S.alts.length;
    const head = S.alts.map((a, i) => `<th class="hd ${i === S.cur ? 'cur' : ''}"><div class="row" style="margin-bottom:5px"><label><input type="radio" name="curalt" data-cur="${i}" ${i === S.cur ? 'checked' : ''}> Xem</label><button class="sm" data-dup="${i}">Nhân bản</button>${n > 1 ? `<button class="sm danger" data-del="${i}">Xóa</button>` : ''}</div>${txt('alts.' + i + '.name')}</th>`).join('');
    // chế độ tự giải / tự hiệu chỉnh R08 theo từng phương án (nút bật/tắt)
    const afRow = `<tr><td>Tự giải / tự hiệu chỉnh (quy tắc <a class="rule" data-rule="R08" href="#rule-R08">R08</a>)</td>${S.alts.map((a, i) => { const on = afOn(a); return `<td class="${i === S.cur ? 'cur' : ''}"><button class="sm ${on ? 'pri' : ''}" data-af="${i}" title="${on ? 'Đang bật: phần mềm tự giải các đại lượng tự định cỡ (SRT, F/M, MLSS, kích thước…) và chỉnh vào dải khuyến cáo; ô nhập tay vẫn được giữ' : 'Đang tắt: dùng nguyên giá trị nhập, chỉ kiểm tra và cảnh báo'}">${on ? '● BẬT' : '○ TẮT'}</button></td>`; }).join('')}</tr>`;
    const body = DATA.STEPS.map(s => `<tr><td>${s.name}</td>${S.alts.map((a, i) => `<td class="${i === S.cur ? 'cur' : ''}">${sel('alts.' + i + '.c.' + s.key, s.opts)}</td>`).join('')}</tr>`).join('');
    const q = RES.map((r, i) => {
      if (!r.R) return `<td>Lỗi tính: ${esc(r.err && r.err.message)}</td>`;
      const K = r.R.kpi, on = issueAlt === i;
      const nOut = r.R.compliance.filter(x => !x.ok).length;
      return `<td class="${i === S.cur ? 'cur' : ''}">${K.comply ? '<span class="badge ok">Đạt QC xả</span>' : `<span class="badge bad clk" data-issue="${i}" title="Bấm để xem chỉ tiêu chưa đạt và cách xử lý">Chưa đạt: ${nOut} chỉ tiêu ▸</span>`} ${K.nFail ? `<span class="badge bad clk" data-issue="${i}" title="Bấm để xem chi tiết">${K.nFail} lỗi thiết kế ▸</span>` : ''} ${K.nWarn ? `<span class="badge warn clk" data-issue="${i}" title="Bấm để xem chi tiết">${K.nWarn} lưu ý ▸</span>` : ''}${on ? ' <span class="hint">(đang mở bên dưới)</span>' : ''}${r.R.auto && r.R.auto.length ? ` <span class="badge" title="${esc(r.R.auto.map(a => a.what + ': ' + (typeof a.from === 'number' ? fx(a.from) : a.from) + ' → ' + (typeof a.to === 'number' ? fx(a.to) : a.to) + ' ' + a.unit).join('\n'))}">R08: ${r.R.auto.length} điều chỉnh</span>` : ''}<div class="hint" style="margin-top:4px">${r.R.icRec ? `Chu trình ICEAS: <b>${esc(r.R.icRec.useName)}</b>${r.R.icRec.use === r.R.icRec.rec ? ' (đúng khuyến cáo)' : ` – <span style="color:#9c1c28">khuyến cáo ${esc(r.R.icRec.recName)}</span>`}<br>` : ''}Bể SH ${fx(K.Vbio, 0)} m³ · ${fx(K.HRTbio)} h<br>Điện ${fx(K.kWhm3)} kWh/m³ · Bùn ${fx(K.cake)} t/ngđ<br>Đầu tư ≈ ${fx(r.R.cost.capex / 1000, 1)} tỷ · Vận hành ≈ ${fx(r.R.cost.perM3, 0)} đ/m³</div></td>`;
    }).join('');
    return `<h2 class="tt">3. Lựa chọn công nghệ – các phương án</h2><p class="lead">Mỗi cột là một phương án. Chọn công nghệ cho từng công đoạn; có thể tạo nhiều phương án để so sánh (tab 6). Phương án "Xem" được dùng cho kết quả, sơ đồ, bản tính và bản vẽ.</p>
    <div class="card" style="overflow:auto"><table class="alts"><thead><tr><th>Công đoạn</th>${head}</tr></thead><tbody>${body}${afRow}<tr><td>Kết quả nhanh</td>${q}</tr></tbody></table>
    <div class="row" style="margin-top:10px"><button id="addAlt" class="pri">+ Thêm phương án</button><span class="hint">Bấm vào nhãn đỏ/vàng ở dòng "Kết quả nhanh" để xem lỗi chi tiết và gợi ý xử lý. ICEAS/SBR không cần lắng thứ cấp; A²O khử được P sinh học; MBR cho nước ra tốt nhất, chi phí cao.</span></div></div>
    ${issueAlt !== null && RES[issueAlt] ? issuesHTML(issueAlt) : ''}
    <div class="card"><h3>Ghi chú lựa chọn</h3><ul class="warn">
      <li><b>Bể điều hòa "Tự động":</b> bố trí với công nghệ dòng liên tục (CAS, AO, A²O, mương oxy hóa, MBBR, MBR); bỏ qua với SBR/ICEAS (M&E Bảng 8-16 – pha chờ hấp thụ lưu lượng đỉnh).</li>
      <li><b>Hóa lý trước sinh học (CEPT):</b> giảm tải hữu cơ nhưng lấy mất carbon cho khử nitrat – phần mềm tự kiểm tra và bổ sung carbon ngoài nếu chọn "Tự động".</li>
      <li><b>Hóa lý sau sinh học:</b> khử P bậc 3, SS và màu; công trình tính theo lưu lượng chắt đỉnh khi dùng bể mẻ.</li>
      <li><b>Lắng thứ cấp:</b> chỉ bố trí cho CAS, AO, A²O, mương oxy hóa, MBBR, Organica, Biopolus.</li>
      <li><b>Organica FCR / Biopolus MNR:</b> màng bám trên module giá thể cố định; tính theo sinh khối tương đương (IFAS), thông số hiệu chỉnh theo dự án Cam Ranh, Cần Thơ và STOWA 2018-45 (tab 4). Chế độ lai (có tuần hoàn bùn) hoặc màng bám thuần chọn ở dòng "Chế độ Organica / Biopolus".</li></ul></div>${batchNotes()}`;
  }

  /* ghi chú riêng khi có phương án C-Tech / ICEAS: cách tính khử nitrat bể mẻ theo M&E 5th và thông số chỉnh để xử lý cảnh báo */
  function batchNotes() {
    const val = (i, k) => { const r = RES[i] && RES[i].R && RES[i].R.um.bio && RES[i].R.um.bio.ids[k]; return r ? +r.val : NaN; };
    const p = S.p, pv = k => `<i>${esc(DATA.P[k] ? DATA.P[k][1].split(' (')[0] : k)}</i> (<code>${k}</code> = ${fx(+p[k])})`;
    const ct = S.alts.map((a, i) => [a, i]).filter(([a]) => a.c.bio === 'CTECH'), ic = S.alts.map((a, i) => [a, i]).filter(([a]) => a.c.bio === 'ICEAS');
    let h = '';
    if (ct.length) {
      const per = ct.map(([a, i]) => `<li><b>${esc(a.name)}:</b> NO₃-N nước gạn C_e = ${fx(val(i, 'cCe'))} mg/L (mục tiêu ${fx(val(i, 'NO3t'))}), F/M selector = ${fx(val(i, 'cFMsel'), 2)} kgBOD/kgMLSS·d, chiều sâu gạn mùa mưa ${fx(val(i, 'cdHs'))} m / ΔH ${fx(val(i, 'cdH'))} m.</li>`).join('');
      h += `<div class="card"><h3>Ghi chú công nghệ C-Tech (SFC) – cách tính theo M&E 5th</h3><ul class="warn">
        <li><b>Khử nitrat bể mẻ (mục I bản tính):</b> NO₃ chỉ được khử khi tiếp xúc với bùn. C-Tech cấp nước trong pha F/A (sục khí) nên pha lắng + gạn không có carbon nước vào: chỉ NO₃ trong lớp bùn được khử bằng phân hủy nội bào, lớp nước trong phía trên bị gạn ra với nồng độ cuối pha sục khí C_e. Selector khử NO₃ theo dòng bùn tuần hoàn bằng rbCOD nước vào. Khử nitrat đồng thời (SND) trong pha F/A chỉ tính khi đặt ${pv('ct_SND')} (mặc định 0; SFC giả định 0,75).</li>
        <li><b>Selector (mục D):</b> ngoài thời gian lưu 30 – 60 phút, kiểm tra tải trọng F/M selector = Q_b·BOD/(V_sel·X_sel), X_sel = R/(1 + R)·10⁶/SVI, trong khoảng ${pv('ct_selFMmin')} – ${pv('ct_selFMmax')} kgBOD/kgMLSS·d (giá trị tham khảo WEF/Jenkins – M&E không cho số cố định; chỉnh theo hồ sơ nhà cung cấp).</li>
        <li><b>Chu kỳ mùa mưa (mục L2):</b> kiểm tra chiều sâu gạn, tỷ lệ gạn theo SVI và lưu lượng decanter ở lưu lượng mùa mưa ${pv('ct_kw')} (0 = k_max) với chu kỳ mùa mưa ${pv('ct_TFA_s')} / ${pv('ct_TS_s')} / ${pv('ct_TD_s')} h (0 = như chu kỳ thường).</li>
        <li><b>Hệ số η</b> ${pv('dn_eta')}: tỷ lệ tốc độ khử nitrat nội bào thiếu khí so với hiếu khí, lấy theo ASM1 (IWA) vì M&E không cho giá trị riêng. Khoảng thường dùng 0,6 – 0,8; nên hiệu chỉnh bằng thí nghiệm tốc độ khử nitrat (NUR) hoặc số liệu NO₃ ra của trạm tương tự. η nhỏ hơn → khử nitrat trong lớp bùn ít hơn → NO₃ ra cao hơn.</li>
        <li><b>Mục Q:</b> SRT hiếu khí ở T_max và chế độ xả bùn theo mùa; nitrat hóa được kiểm tra thêm ở lưu lượng đỉnh (mục H).</li>
        ${per}</ul>
        <table class="t" style="margin-top:8px"><thead><tr><th>Cảnh báo</th><th>Thông số chỉnh được (tab 4 / tab 3)</th></tr></thead><tbody>
        <tr><td>NO₃-N ra &gt; mục tiêu (mục I)</td><td>${pv('ct_SND')} khi có số liệu điều khiển DO thấp; ${pv('ct_R')} (tăng tuần hoàn về selector); ${pv('ct_MLSS')} (lớp bùn dày hơn, trong giới hạn tỷ lệ gạn); ${pv('dn_eta')} theo số liệu; ${pv('NO3e_des')}; hoặc tab 3 chọn công nghệ có pha thiếu khí khuấy (ICEAS NDN(P), A²O). Carbon ngoài châm vào selector chỉ khử được phần NO₃ theo dòng bùn tuần hoàn.</td></tr>
        <tr><td>F/M selector ngoài khoảng (mục D)</td><td>${pv('ct_tsel')} (30 – 60 phút), ${pv('ct_R')}, ${pv('ct_nsel')}; khoảng kiểm tra ${pv('ct_selFMmin')}, ${pv('ct_selFMmax')}.</td></tr>
        <tr><td>Mùa mưa: ΔH, tỷ lệ gạn, decanter, lắng (mục L2)</td><td>${pv('ct_TFA_s')}, ${pv('ct_TS_s')} (≥ 0,5 h), ${pv('ct_TD_s')}, ${pv('ct_N')}, ${pv('ct_dH')}, ${pv('ct_kw')}.</td></tr>
        <tr><td>Nitrat hóa ở lưu lượng đỉnh (mục H)</td><td>${pv('ct_TFA')} (pha F/A dài hơn), bể điều hòa (tab 3), ${pv('DO')}.</td></tr>
        <tr><td>Tỷ lệ gạn &gt; 0,30 / theo SVI</td><td>${pv('ct_rDmax')}, ${pv('ct_dH')}, ${pv('ct_MLSS')}, ${pv('SVI')}.</td></tr>
        </tbody></table><p class="hint">Bấm nhãn đỏ/vàng ở dòng "Kết quả nhanh" để xem cảnh báo của từng phương án và nút "Áp dụng" gợi ý sửa.</p></div>`;
    }
    if (ic.length) {
      const per = ic.map(([a, i]) => `<li><b>${esc(a.name)}:</b> NO₃-N nước chắt C_e = ${fx(val(i, 'Ce'))} mg/L (mục tiêu ${fx(val(i, 'NO3t'))}); NO₃ khử trong pha Air-Off ${fx(val(i, 'dnMix'))}, trong lớp bùn ${fx(val(i, 'dnEnd'))} kg N/ngđ.</li>`).join('');
      h += `<div class="card"><h3>Ghi chú công nghệ ICEAS – khử nitrat (Bước 6)</h3><ul class="warn">
        <li>Cân bằng NO₃ bể mẻ (M&E 5th mục 8-6, 8-7): pha Air-Off có khuấy – cả bể tiếp xúc, chỉ BOD vào trong pha này (SDNR theo F/M_b); pha lắng + chắt – chỉ NO₃ trong lớp bùn (nội bào). Chu trình NIT không có pha Air-Off nên khử nitrat rất ít. Carbon ngoài chỉ có tác dụng trong pha Air-Off.</li>
        <li>Chỉnh khi NO₃ ra cao: tab 3 chọn chu trình NDN(P) hoặc tự nhập với Air-Off dài hơn (${pv('ic_off')}), bật carbon ngoài tự động, ${pv('ic_SND')} khi có số liệu, ${pv('dn_eta')} theo thí nghiệm NUR (thường 0,6 – 0,8, theo ASM1).</li>
        ${per}</ul></div>`;
    }
    return h;
  }

  /* ---------------- so sánh chu trình ICEAS ---------------- */
  function icCard(R) {
    const I = R.icRec, N = I.N, D = I.D;
    const row = (n, a, b, fmt, better) => {
      const fa = typeof a === 'number' ? fx(a, fmt) : a, fb = typeof b === 'number' ? fx(b, fmt) : b;
      let ca = '', cb = '';
      if (better && typeof a === 'number' && Math.abs(a - b) > 1e-9) { const aBetter = better === 'low' ? a < b : a > b; ca = aBetter ? 'best' : ''; cb = aBetter ? '' : 'best'; }
      return `<tr><td>${n}</td><td class="n ${ca}">${fa}</td><td class="n ${cb}">${fb}</td></tr>`;
    };
    const ok = (x, y) => `<td class="${x ? 'ok' : 'bad'}">${x ? 'ĐẠT' : 'KHÔNG ĐẠT'}</td><td class="${y ? 'ok' : 'bad'}">${y ? 'ĐẠT' : 'KHÔNG ĐẠT'}</td>`;
    const hc = k => I.rec === k ? ' <span class="badge ok">khuyến cáo</span>' : '';
    return `<div class="card"><div class="row" style="justify-content:space-between"><h3>Chu trình ICEAS – tính song song NIT & NDN(P)</h3><span>Đang áp dụng: <b>${esc(I.useName)}</b>${I.sel === 'auto' ? ' (tự động theo khuyến cáo)' : ''} · đổi ở tab 3, dòng "Chu trình ICEAS"</span></div>
      <div class="grid2"><div><table class="t"><thead><tr><th>Chỉ tiêu (MỘT bể)</th><th>NIT 120/0/60/60${hc('N')}</th><th>NDN(P) 96/72/60/60${hc('D')}</th></tr></thead><tbody>
        ${row('Chu kỳ thường / bão (h)', `${fx(N.NCT)} / ${fx(N.SCT)}`, `${fx(D.NCT)} / ${fx(D.SCT)}`)}
        ${row('Số chu kỳ/ngày', N.cyc, D.cyc)}
        ${row('Sục khí TA / thiếu khí ART (h/ngày)', `${fx(N.TA)} / ${fx(N.ART)}`, `${fx(D.TA)} / ${fx(D.ART)}`)}
        ${row('Diện tích bể BA (m²)', N.BA, D.BA, 0, 'low')}
        ${row('Kích thước W × L (m)', `${fx(N.W)} × ${fx(N.Lb)}`, `${fx(D.W)} × ${fx(D.Lb)}`)}
        ${row('HRT (h)', N.HRT, D.HRT)}
        ${row('Tỷ lệ hiếu khí f_hk', N.fA, D.fA, 3)}
        ${row('SRT thiết kế (ngày) – Bước 2', N.SRT, D.SRT, 1, 'low')}
        ${row('F/M kiểm tra (kgBOD/kgMLSS·d)', N.FM, D.FM, 3)}
        ${row('MLSS tại BWL (mg/L)', N.MLSSb, D.MLSSb, 0)}
        <tr><td>Kiểm tra tuổi bùn hiếu khí</td>${ok(N.srtOK, D.srtOK)}</tr>
        ${row('Khử nitrat SH (kg/ngđ) – yêu cầu ' + fx(I.reqDN), N.cap, D.cap, 1, 'high')}
        <tr><td>Kiểm tra khử nitrat (không carbon ngoài)</td>${ok(N.dnOK, D.dnOK)}</tr>
        ${row('NO₃-N ra (mg/L)', N.NO3e, D.NO3e, 2, 'low')}
        ${row('TN ra ước tính (mg/L)', N.TNe, D.TNe, 2, 'low')}
        ${row('NaOH bổ sung kiềm (mg/L)', N.NaOH, D.NaOH, 1, 'low')}
        ${row('Methanol nếu bù thiếu (kg/ngđ)', N.MeOH, D.MeOH, 0, 'low')}
        ${row('Decanter (m) / Q chắt đỉnh (m³/h)', `${fx(N.DL)} / ${fx(N.Qdec, 0)}`, `${fx(D.DL)} / ${fx(D.Qdec, 0)}`)}
        ${row('Khí máy thổi / bể (m³/h)', N.BUC, D.BUC, 0, 'low')}
        ${row('Điện cụm ICEAS toàn trạm (kWh/ngđ)', N.Etot, D.Etot, 0, 'low')}
        ${row('Máy khuấy chìm', 'Không cần', 'Bắt buộc (pha Air-Off)')}
      </tbody></table></div>
      <div><h3>Khuyến cáo: chu trình ${esc(I.recName)}</h3><ul class="warn">${I.reasons.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      ${I.adj ? `<p class="warn">Bước 6 → Bước 2: chu trình áp dụng đã tăng Air-Off thành ${I.M.ph.on}/${I.M.ph.off}/${I.M.ph.set}/${I.M.ph.dec} phút để đủ khử nitrat (f_hk ${fx(I.M.fA, 3)}, SRT ${fx(I.M.SRT)} ngày).</p>` : ''}
      <p class="hint">Trình tự thiết kế theo SRT (M&E 5th): chu kỳ → SRT = max(nitrat hóa ở T_min / f_hk; lắng; ổn định bùn) → bùn sinh ra (Bảng 8-10) → khối bùn = P_X·SRT → thể tích = khối bùn·SVI + vùng đệm + thể tích nạp → khử nitrat SDNR (PT 8-56…8-58, θ 1,026) → khử P → oxy ở T_max. Chu trình NIT / NDN(P) theo Sanitaire ICEAS Cycle Charts. Chi tiết trong bản tính hạng mục SH (Bước 0 – 10).</p></div></div></div>`;
  }

  /* ---------------- bảng lỗi & gợi ý xử lý ---------------- */
  function issuesHTML(ai) {
    const r = RES[ai]; if (!r || !r.R) return '';
    const R = r.R;
    const list = R.checks.filter(x => !x.ok).sort((a, b) => (a.code === 'OUT' ? 0 : a.soft ? 2 : 1) - (b.code === 'OUT' ? 0 : b.soft ? 2 : 1));
    if (!list.length) return `<div class="card"><h3>${esc(r.alt.name)}</h3><span class="badge ok">Tất cả kiểm tra đều đạt</span></div>`;
    const rows = list.map(x => {
      const sug = REM.suggest(x, R, S);
      const lis = sug.map(g => {
        let btn = '';
        if (g.act) { FIXES.push({ ai, fn: g.act.fn, label: g.act.label }); btn = ` <button class="sm pri" data-fix="${FIXES.length - 1}">Áp dụng: ${esc(g.act.label)}</button>`; }
        return `<li>${esc(g.t)}${g.why ? ` <span class="hint">(${esc(g.why)})</span>` : ''}${btn}</li>`;
      }).join('');
      const lvl = x.code === 'OUT' ? 'bad' : x.soft ? 'warn' : 'bad';
      return `<tr><td class="${lvl}" style="white-space:nowrap">${x.code === 'OUT' ? 'Chỉ tiêu xả' : x.soft ? 'Lưu ý' : 'Lỗi'}</td><td><b>${esc(x.code)}</b> – ${esc(x.unit)}</td><td>${esc(x.name)}<br><b>${esc(x.text)}</b></td><td><ul class="warn" style="margin:0">${lis}</ul></td></tr>`;
    }).join('');
    return `<div class="card" id="issues"><div class="row" style="justify-content:space-between"><h3>Lỗi / chỉ tiêu chưa đạt & gợi ý xử lý – ${esc(r.alt.name)}</h3><button class="sm" data-issue="close">Đóng</button></div>
      <p class="hint">Nút "Áp dụng" sửa rồi tính lại ngay. Lựa chọn công nghệ chỉ đổi cho phương án này; thông số thiết kế / hiệu suất dùng chung cho MỌI phương án. Hoàn tác bằng cách sửa lại ở tab 3/4.</p>
      <table class="t"><thead><tr><th>Mức</th><th>Công trình</th><th>Nội dung kiểm tra</th><th>Gợi ý xử lý</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ---------------- 6. Thủy lực ---------------- */
  function vHyd() {
    const r = cur(); if (!r.R) return '<div class="card">Lỗi tính toán.</div>';
    const R = r.R, OV = S.opex.hydOv || {};
    const rows = R.hyd.links.map(l => {
      const ov = OV[l.key] || {};
      const dnSel = `<select data-hyd="${esc(l.key)}" data-f="DN"><option value="">Tự động (DN${l.DNauto})</option>${ENG.DNS.map(d => `<option value="${d}" ${+ov.DN === d ? 'selected' : ''}>DN${d}</option>`).join('')}</select>`;
      const inp = (f, v, w) => `<input type="number" step="any" style="width:${w || 70}px" data-hyd="${esc(l.key)}" data-f="${f}" value="${ov[f] !== undefined && ov[f] !== '' ? ov[f] : ''}" placeholder="${fx(v)}">`;
      const vcls = l.kind === 'p' ? (l.v <= S.p.hyd_vp_max ? 'ok' : 'bad') : (l.v <= S.p.hyd_vg_max && l.v >= S.p.hyd_vg_min ? 'ok' : 'warn');
      return `<tr><td>${esc(l.name)}</td><td>${l.kind === 'p' ? 'Áp lực' : 'Tự chảy'}</td><td class="n">${fx(l.Q)}</td><td>${dnSel}</td><td>${inp('L', l.L)}</td><td>${inp('C', l.C, 60)}</td><td>${inp('xi', l.xi, 60)}</td><td class="n ${vcls}">${fx(l.v)}</td><td class="n">${fx(l.hf, 3)}</td><td class="n">${fx(l.hm, 3)}</td><td class="n"><b>${fx(l.h, 3)}</b></td></tr>`;
    }).join('');
    const el = v => (v >= 0 ? '+' : '') + v.toFixed(3).replace('.', ',');
    const wl = R.hyd.seq.map(o => `<tr><td><b>${esc(o.u.code)}</b></td><td>${esc(o.u.name)}</td><td class="n">${o.u.id === 'out' ? '' : el(o.bot)}</td><td class="n">${el(o.WL)}${o.BWL !== undefined ? ` <span class="hint">(BWL ${el(o.BWL)})</span>` : ''}${o.LWL !== undefined ? ` <span class="hint">(MNTN ${el(o.LWL)})</span>` : ''}</td><td class="n">${o.u.id === 'out' ? '' : el(o.top)}</td></tr>`).join('');
    const H = R.hyd, pm = R.um.sump.pump;
    return `<h2 class="tt">6. Tính toán thủy lực – ${esc(r.alt.name)}</h2><p class="lead">Chọn cỡ ống theo vận tốc (TCVN 7957:2023; M&E Ch.5), tổn thất Hazen-Williams + cục bộ, dựng cao độ mực nước neo tại bể sinh học (đáy ${el(S.p.bio_bot)}). Ô trống = giá trị tự động (hiện mờ); nhập để ghi đè.</p>
      <div class="card" style="overflow:auto"><h3>Đường ống công nghệ</h3><table class="t"><thead><tr><th>Tuyến</th><th>Loại</th><th>Q (m³/h)</th><th>DN</th><th>L (m)</th><th>C</th><th>Σξ</th><th>v (m/s)</th><th>h_f (m)</th><th>h_m (m)</th><th>Σh (m)</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row" style="margin-top:8px"><button class="sm" data-hydreset="1">Khôi phục tự động toàn bộ</button><span class="hint">h_f = 10,67·L·Q^1,852/(C^1,852·D^4,87); h_m = Σξ·v²/2g. Vận tốc tự chảy ${S.p.hyd_vg_min} – ${S.p.hyd_vg_max} m/s; ống đẩy ≤ ${S.p.hyd_vp_max} m/s (sửa ở tab 4 – nhóm Cao độ & thủy lực).</span></div></div>
      <div class="grid2"><div class="card"><h3>Cao độ mực nước các công trình (sân ±0,000)</h3><table class="t"><thead><tr><th>Mã</th><th>Công trình</th><th>Đáy</th><th>Mực nước</th><th>Đỉnh thành</th></tr></thead><tbody>${wl}</tbody></table></div>
      <div class="card"><h3>Cột áp bơm</h3><table class="t"><tbody>
        <tr><td>Bơm bể gom – cột áp hình học</td><td class="n">${fx(H.HgeoSump)} m</td></tr>
        <tr><td>Bơm bể gom – tổn thất ống đẩy</td><td class="n">${fx(H.linkLoss.sump || 0, 3)} m</td></tr>
        <tr><td>Bơm bể gom – cột áp yêu cầu</td><td class="n"><b>${fx(pm.Hb)} m</b> (${fx(pm.Q1)} m³/h/bơm, ${fx(pm.N)} kW)</td></tr>
        ${R.um.eq ? `<tr><td>Bơm sau điều hòa – cột áp hình học</td><td class="n">${fx(H.HgeoEQ)} m</td></tr>` : ''}
        <tr><td>Mực nước tại cửa xả / nguồn tiếp nhận</td><td class="n ${H.outletOK ? 'ok' : 'bad'}">${el(H.outletWL)} / ${el(S.p.wl_out)} – ${H.outletOK ? 'tự chảy' : 'cần bơm'}</td></tr>
      </tbody></table><p class="hint">Trắc dọc thủy lực vẽ ở tờ LT03 (tab Bản vẽ). Bảng tính chi tiết từng tuyến có trong bản tính và sheet Excel "ThuyLuc" (công thức sống).</p></div></div>`;
  }

  /* ---------------- 7. Thiết bị & chi phí ---------------- */
  function vCost() {
    const r = cur(); if (!r.R) return '<div class="card">Lỗi tính toán.</div>';
    const R = r.R, C = R.cost, OP = S.opex, p = S.p;
    const eq = R.equip.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.u)}</td><td>${esc(e.name)}</td><td>${esc(e.spec)}</td><td class="n">${fx(e.qty)}</td><td><input type="number" step="any" style="width:95px" data-eqp="${esc(e.key)}" value="${OP.equipPrice[e.key] !== undefined ? OP.equipPrice[e.key] : ''}" placeholder="${fx(e.est)}"></td><td class="n">${fx(e.total, 0)}</td></tr>`).join('');
    const priceKeys = [...new Set(R.chem.map(x => x.price))];
    const chem = R.chem.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${fx(x.dose)}</td><td class="n">${fx(x.kg)}</td><td>${num('p.' + x.price, { w: 95 })}</td><td class="n">${fx(x.costD, 0)}</td></tr>`).join('');
    const lab = OP.labor.map((l, i) => `<tr><td>${txt('opex.labor.' + i + '.name')}</td><td>${num('opex.labor.' + i + '.n', { w: 60 })}</td><td>${num('opex.labor.' + i + '.sal', { w: 80 })}</td><td class="n">${fx(R.labor[i] ? R.labor[i].month : 0)}</td><td><button class="sm danger" data-labdel="${i}">Xóa</button></td></tr>`).join('');
    const sp = R.spares.map(s => { const ov = OP.spareOv[s.key] || {}; return `<tr><td>${esc(s.name)}</td><td>${esc(s.unit)}</td><td class="n">${fx(s.base)} / ${s.life} năm</td><td><input type="number" step="any" style="width:80px" data-sp="${s.key}" data-f="qty" value="${ov.qty !== undefined ? ov.qty : ''}" placeholder="${fx(s.qty)}"></td><td><input type="number" step="any" style="width:80px" data-sp="${s.key}" data-f="price" value="${ov.price !== undefined ? ov.price : ''}" placeholder="${fx(s.price)}"></td><td class="n">${fx(s.year)}</td><td class="hint">${esc(s.note)}</td><td></td></tr>`; }).join('');
    const cu = OP.custom.map((c2, i) => `<tr><td>${txt('opex.custom.' + i + '.name')}</td><td>${txt('opex.custom.' + i + '.unit')}</td><td></td><td>${num('opex.custom.' + i + '.qty', { w: 80 })}</td><td>${num('opex.custom.' + i + '.price', { w: 80 })}</td><td class="n">${fx(R.customSp[i] ? R.customSp[i].year : 0)}</td><td class="hint">Nhập tay</td><td><button class="sm danger" data-cudel="${i}">Xóa</button></td></tr>`).join('');
    const bar = (l, v) => { const mx = Math.max(C.elec, C.chem, C.sludge, C.labor, C.spare); return `<div class="bar"><span>${l}</span><div class="tr"><div class="fl" style="width:${(v / mx * 100).toFixed(1)}%"></div></div><span class="n">${fx(v / R.flow.Q, 0)} đ/m³</span></div>`; };
    return `<h2 class="tt">7. Thiết bị & chi phí – ${esc(r.alt.name)}</h2><p class="lead">Đơn giá thiết bị, hóa chất, nhân công, vật tư thay thế đều sửa được (ô trống = giá trị ước tính hiện mờ). Dữ liệu giá dùng chung cho mọi phương án và xuất Excel dạng công thức sống.</p>
      <div class="kpis">
        <div class="kpi"><div class="l">Chi phí thiết bị</div><div class="v">${fx(C.eq / 1000, 2)} <span class="u">tỷ đ</span></div></div>
        <div class="kpi"><div class="l">Suất đầu tư sơ bộ</div><div class="v">${fx(C.capex / 1000, 1)} <span class="u">tỷ đ</span></div></div>
        <div class="kpi"><div class="l">Chi phí vận hành</div><div class="v">${fx(C.opexD / 1e6, 1)} <span class="u">tr.đ/ngày</span></div></div>
        <div class="kpi"><div class="l">Giá thành xử lý</div><div class="v">${fx(C.perM3, 0)} <span class="u">đ/m³</span></div></div></div>
      <div class="card"><h3>Cơ cấu chi phí vận hành</h3>${bar('Điện năng', C.elec)}${bar('Hóa chất', C.chem)}${bar('Nhân công', C.labor)}${bar('Vật tư, bảo dưỡng', C.spare)}${bar('Xử lý bùn', C.sludge)}</div>
      <div class="card" style="overflow:auto"><h3>Danh mục thiết bị & đơn giá (tr.đ/cái)</h3><table class="t"><thead><tr><th>TT</th><th>Công trình</th><th>Thiết bị</th><th>Thông số chọn</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>${eq}<tr><td></td><td colspan="5"><b>Tổng thiết bị</b> (+ lắp đặt, đường ống, điện ${p.c_inst} % = ${fx(C.inst, 0)} tr.đ)</td><td class="n"><b>${fx(C.eq, 0)}</b></td></tr></tbody></table>
        <div class="row" style="margin-top:8px"><button class="sm" data-eqreset="1">Xóa đơn giá nhập tay (dùng ước tính)</button><span class="hint">Suất đầu tư = bể ${fx(C.tank, 0)} + nhà ${fx(C.bld, 0)} + thiết bị ${fx(C.eq, 0)} + lắp đặt ${fx(C.inst, 0)} = <b>${fx(C.capex, 0)} tr.đ</b>. Suất bể/nhà, % lắp đặt sửa ở tab 4 – nhóm Đơn giá.</span></div></div>
      <div class="grid2">
        <div class="card"><h3>Điện năng & hóa chất</h3><div class="form" style="margin-bottom:8px"><label>Giá điện (đ/kWh)</label>${num('p.p_kwh')}<label>Xử lý bánh bùn (đ/tấn)</label>${num('p.p_sludge')}</div>
          <p class="hint">Điện ${fx(R.kWhd, 0)} kWh/ngđ → ${fx(C.elec, 0)} đ/ngđ · Bánh bùn ${fx(R.sludge.cake)} t/ngđ → ${fx(C.sludge, 0)} đ/ngđ</p>
          <table class="t"><thead><tr><th>Hóa chất</th><th>Liều mg/L</th><th>kg/ngđ</th><th>Đơn giá đ/kg</th><th>đ/ngđ</th></tr></thead><tbody>${chem}<tr><td colspan="4"><b>Tổng hóa chất</b></td><td class="n"><b>${fx(C.chem, 0)}</b></td></tr></tbody></table>
          <p class="hint">Hóa chất cùng loại dùng chung một đơn giá (${priceKeys.map(k => DATA.P[k][1]).join(', ')}).</p></div>
        <div class="card"><h3>Nhân công</h3><div class="form" style="margin-bottom:8px"><label>Hệ số chi phí theo lương</label>${num('p.labor_k')}</div>
          <table class="t"><thead><tr><th>Vị trí</th><th>Số người</th><th>Lương tr.đ/tháng</th><th>Chi phí tr.đ/tháng</th><th></th></tr></thead><tbody>${lab}<tr><td><b>Tổng</b></td><td class="n">${OP.labor.reduce((a, l) => a + (+l.n || 0), 0)}</td><td></td><td class="n"><b>${fx(R.special.LABOR)}</b></td><td></td></tr></tbody></table>
          <button class="sm" data-labadd="1" style="margin-top:6px">+ Thêm vị trí</button></div></div>
      <div class="card" style="overflow:auto"><h3>Vật tư thay thế & bảo dưỡng (tr.đ/năm)</h3><table class="t"><thead><tr><th>Hạng mục</th><th>Đơn vị</th><th>Cơ sở / tuổi thọ</th><th>SL/năm</th><th>Đơn giá tr.đ</th><th>tr.đ/năm</th><th>Ghi chú</th><th></th></tr></thead><tbody>${sp}${cu}
        <tr><td>Bảo dưỡng, sửa chữa thiết bị</td><td>% giá TB</td><td></td><td>${num('p.maint_pct', { w: 80 })}</td><td class="n">${fx(R.special.EQ, 0)}</td><td class="n">${fx(R.maint)}</td><td class="hint">% giá trị thiết bị/năm</td><td></td></tr>
        <tr><td><b>Tổng</b></td><td colspan="4"></td><td class="n"><b>${fx(R.special.SPARE)}</b></td><td colspan="2"></td></tr></tbody></table>
        <button class="sm" data-cuadd="1" style="margin-top:6px">+ Thêm vật tư / chi phí khác</button></div>`;
  }

  /* ---------------- 4. Thông số ---------------- */
  const afOn = a => a && a.c && a.c.autoFit != null ? +a.c.autoFit !== 0 : +S.p.autoFit !== 0;   // tự giải R08 của phương án
  function usedGroups() {
    const g = new Set(['chung', 'kin', 'hw', 'dose', 'air', 'dis', 'sludge', 'hyd', 'cost']);
    for (const a of S.alts) {
      const c = a.c; g.add({ CAS: 'cas', AO: 'ao', AAO: 'aao', SBR: 'sbr', ICEAS: 'iceas', OD: 'od', MBBR: 'mbbr', MBR: 'mbr', ORG: 'org', BIOP: 'bp', CTECH: 'ct', KMBR: 'kb', AGS: 'ags' }[c.bio]);
      if (c.chemPos !== 'none') { g.add('chem'); g.add('sep'); }
      if (c.anaer && c.anaer !== 'none') g.add('ana');
      if (c.aop && c.aop !== 'none') g.add('aop');
      if (c.eq === 'yes' || (c.eq === 'auto' && DATA.CONTINUOUS[c.bio])) g.add('eq');
      if (DATA.NEED_CLARIFIER[c.bio]) g.add('sc');
      if (c.filt !== 'none') g.add('filt');
      if (c.bio === 'AAO') g.add('ao');   // AAO dùng tỷ lệ tuần hoàn nội tối đa của nhóm AO; MBR/MBBR có nhóm thông số riêng
    }
    return g;
  }
  function vParams() {
    const used = usedGroups(), def = DATA.defaultParams();
    const eff = `<details class="pg" open><summary>Hiệu suất tách chất ô nhiễm theo công đoạn (%)</summary><div class="body"><table class="t"><thead><tr><th>Chỉ tiêu</th>${DATA.EFF_COLS.map(c => `<th title="${esc(DATA.EFF_NOTE[c[0]])}">${c[1]}</th>`).join('')}</tr></thead><tbody>
      ${DATA.EFF_ROWS.map(k => `<tr><td>${k}</td>${DATA.EFF_COLS.map(c => `<td class="${S.eff[k][c[0]] !== DATA.EFF_DEF[k][c[0]] ? 'chg' : ''}">${num('eff.' + k + '.' + c[0], { w: 80 })}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <ul class="hint">${DATA.EFF_COLS.map(c => `<li><b>${c[1]}:</b> ${esc(DATA.EFF_NOTE[c[0]])}</li>`).join('')}</ul><button data-reseteff="1" class="sm">Khôi phục mặc định</button></div></details>`;
    const groups = DATA.PGROUPS.map(([g, t]) => {
      const keys = Object.entries(DATA.P).filter(([k, v]) => v[0] === g && k !== 'autoFit');   // tự giải R08: nút ở tab 3 (theo phương án)
      const nchg = keys.filter(([k]) => S.p[k] !== def[k]).length;
      const on = used.has(g);
      return `<details class="pg ${on ? '' : 'off'}" ${g === 'chung' ? 'open' : ''}><summary>${t} ${on ? '' : '<span class="hint">(chưa dùng trong phương án nào)</span>'} ${nchg ? `<span class="badge warn">${nchg} đã sửa</span>` : ''}</summary><div class="body">
        <table class="t ptab"><thead><tr><th>Thông số</th><th>Giá trị</th><th>Đơn vị</th><th>Mặc định</th><th>Ghi chú / nguồn</th></tr></thead><tbody>
        ${keys.map(([k, v]) => `<tr class="${S.p[k] !== def[k] ? 'chg' : ''}"><td>${esc(v[1])}</td><td>${num('p.' + k)}</td><td>${esc(v[2])}</td><td class="n">${v[3]}</td><td class="hint">${esc(v[4])}</td></tr>`).join('')}
        </tbody></table><button class="sm" data-resetg="${g}">Khôi phục mặc định nhóm</button></div></details>`;
    }).join('');
    return `<h2 class="tt">4. Thông số thiết kế</h2><p class="lead">Giá trị mặc định lấy theo bảng tính mẫu (M&E 5th, Sanitaire ICEAS 202). Ô đã sửa được tô vàng. Thông số dùng chung cho mọi phương án.</p>${eff}${groups}`;
  }

  /* ---------------- 5. Kết quả ---------------- */
  function kpiCards(R) {
    const K = R.kpi;
    const c = (l, v, u) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v} <span class="u">${u || ''}</span></div></div>`;
    return `<div class="kpis">${c('Chất lượng nước xả', K.comply ? '<span class="badge ok">ĐẠT</span>' : '<span class="badge bad">CHƯA ĐẠT</span>', '')}${c('Thể tích bể sinh học', fx(K.Vbio, 0), 'm³')}${c('HRT sinh học', fx(K.HRTbio), 'h')}${c('Tổng thể tích bể', fx(K.Vt, 0), 'm³')}${c('Diện tích công trình', fx(K.At, 0), 'm²')}${c('Khu đất ước tính', fx(K.Asite, 0), 'm²')}${c('Công suất lắp đặt', fx(K.kWinst, 0), 'kW')}${c('Điện năng', fx(K.kWhd, 0), 'kWh/ngđ')}${c('Suất điện năng', fx(K.kWhm3), 'kWh/m³')}${c('Bùn khô', fx(K.Mtot, 0), 'kg DS/ngđ')}${c('Bánh bùn', fx(K.cake), 't/ngđ')}${c('Chi phí vận hành', fx(R.cost.perM3, 0), 'đ/m³')}</div>`;
  }
  /* bảng các điều chỉnh tự động theo quy tắc R08 */
  function autoCard(R) {
    const on = +R.S.p.autoFit !== 0, A = R.auto || [];
    const v = x => typeof x === 'number' ? fx(x, Math.abs(x) < 1 ? 4 : 2) : esc(x);
    if (!on) return `<div class="card"><h3>Điều chỉnh tự động (quy tắc <a class="rule" data-rule="R08" href="#rule-R08">R08</a>)</h3><p class="hint">Đang tắt – phần mềm dùng nguyên giá trị nhập. Bật bằng nút "Tự giải / tự hiệu chỉnh" ở tab 3 – Phương án.</p></div>`;
    if (!A.length) return `<div class="card"><h3>Điều chỉnh tự động (quy tắc <a class="rule" data-rule="R08" href="#rule-R08">R08</a>)</h3><p><span class="badge ok">Không cần điều chỉnh</span> Mọi đại lượng tự giải đã nằm trong dải khuyến cáo với số liệu nhập.</p></div>`;
    return `<div class="card"><h3>Điều chỉnh tự động (quy tắc <a class="rule" data-rule="R08" href="#rule-R08">R08</a>) – ${A.length} mục</h3>
      <p class="hint">Các đại lượng tự giải / tự định cỡ đã được hiệu chỉnh để kết quả nằm trong dải khuyến cáo. Ô người dùng đã nhập tay ở tab 4 được giữ nguyên (chỉ cảnh báo); bản tính, bản vẽ và Excel dùng giá trị sau điều chỉnh. Tắt bằng nút "Tự giải / tự hiệu chỉnh" của phương án ở tab 3 nếu cần dùng nguyên mọi giá trị nhập.</p>
      <table class="t"><thead><tr><th>Công trình</th><th>Đại lượng</th><th>Giá trị nhập / tự tính</th><th>Sau điều chỉnh</th><th>Đơn vị</th><th>Lý do</th></tr></thead><tbody>${A.map(x => `<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.what)}</td><td class="n">${v(x.from)}</td><td class="n"><b>${v(x.to)}</b></td><td>${esc(x.unit)}</td><td class="hint">${esc(x.why)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function vResults() {
    const r = cur(); if (!r.R) return `<div class="card">Lỗi tính toán: ${esc(r.err && r.err.stack)}</div>`;
    const R = r.R, st = R.stages.filter(s => !s.skip), L = R.lim.L;
    const bal = DATA.QPARAMS.map(([k, nm, un]) => {
      const lim = L[k], v = R.st.st7[k], ok = lim === undefined ? null : v <= lim + 1e-9;
      return `<tr><td>${nm}</td><td>${un}</td>${st.map(s => `<td class="n">${k === 'Coli' ? Number(s.v[k]).toExponential(1) : fx(s.v[k])}</td>`).join('')}<td class="n">${lim === undefined ? '—' : fx(lim)}</td><td class="${ok === null ? '' : ok ? 'ok' : 'bad'}">${ok === null ? '—' : ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}</td></tr>`;
    }).join('');
    const bad = R.checks.filter(x => !x.ok);
    const works = R.units.filter(u => u.geom).map((u, i) => `<tr><td>${i + 1}</td><td><b>${u.code}</b> – ${esc(u.name)}</td><td>${esc(u.dims)}</td><td class="n">${u.V ? fx(u.V, 0) : '—'}</td><td class="n">${u.A ? fx(u.A, 0) : '—'}</td><td>${esc(u.hrt || '—')}</td></tr>`).join('');
    return `<h2 class="tt">5. Kết quả tính toán – ${esc(r.alt.name)}</h2><p class="lead">${esc(DATA.optName('bio', r.alt.c.bio))} · ${esc(DATA.optName('chemPos', r.alt.c.chemPos))} · ${esc(DATA.optName('disinf', r.alt.c.disinf))}</p>
    ${kpiCards(R)}
    ${autoCard(R)}
    ${issuesHTML(S.cur)}
    ${R.icRec ? icCard(R) : ''}
    <div class="card"><h3>Cân bằng chất lượng nước qua từng công đoạn</h3><div style="overflow:auto"><table class="t"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th>${st.map(s => `<th>${esc(s.name)}</th>`).join('')}<th>Giới hạn</th><th>Đánh giá</th></tr></thead><tbody>${bal}</tbody></table></div></div>
    <div class="grid2"><div class="card"><h3>Cảnh báo thiết kế (${R.warns.length})</h3>${bad.length ? '' : '<p><span class="badge ok">Tất cả kiểm tra đều đạt</span></p>'}
      ${R.warns.length ? `<ul class="warn">${R.warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="hint">Không có cảnh báo.</p>'}${R.info.length ? `<ul class="hint">${R.info.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>
      <div class="card"><h3>Hóa chất tiêu thụ</h3><table class="t"><thead><tr><th>Hóa chất</th><th>Liều mg/L</th><th>kg/ngđ</th><th>kg/tháng</th><th>Dung dịch châm</th><th>L/h</th></tr></thead><tbody>${R.chem.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${fx(x.dose)}</td><td class="n">${fx(x.kg)}</td><td class="n">${fx(x.month, 0)}</td><td class="n">${x.sol > 0 ? fx(x.sol * 100, x.sol < 0.01 ? 2 : 0) + ' %' + (x.rho ? ', ρ ' + fx(x.rho, 2) : '') : '—'}</td><td class="n">${x.Lh !== undefined ? fx(x.Lh, x.Lh < 10 ? 2 : 1) : '—'}</td></tr>`).join('')}</tbody></table><p class="hint">Liều chọn & nồng độ dung dịch: tab 4, nhóm "Hóa chất – liều chọn (tùy chọn) & dung dịch pha" (0 = theo tính toán khuyến cáo).</p></div></div>
    <div class="card"><h3>Tổng hợp công trình</h3><table class="t"><thead><tr><th>TT</th><th>Công trình</th><th>Kích thước / thông số chính</th><th>V (m³)</th><th>A (m²)</th><th>Thời gian lưu</th></tr></thead><tbody>${works}</tbody></table></div>
    <div class="card"><h3>Điện năng</h3><table class="t"><thead><tr><th>Hạng mục</th><th>kW</th><th>h/ngày</th><th>kWh/ngđ</th></tr></thead><tbody>${R.power.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${fx(x.kW)}</td><td class="n">${fx(x.h)}</td><td class="n">${fx(x.kWh, 0)}</td></tr>`).join('')}<tr><td><b>Tổng</b></td><td class="n"><b>${fx(R.kWinst, 0)}</b></td><td></td><td class="n"><b>${fx(R.kWhd, 0)}</b></td></tr></tbody></table></div>`;
  }

  /* ---------------- 6. So sánh ---------------- */
  const PROS = {
    CAS: ['Đơn giản, vận hành quen thuộc, đầu tư thấp', 'Không khử N, P; cần bể lắng thứ cấp; nhạy sốc tải'],
    AO: ['Khử N tốt, vận hành phổ biến', 'Cần tuần hoàn nội và lắng thứ cấp; không khử P sinh học'],
    AAO: ['Khử đồng thời N và P sinh học', 'Phức tạp, phụ thuộc rbCOD; cần lắng thứ cấp và 2 dòng tuần hoàn'],
    SBR: ['Không cần lắng thứ cấp; linh hoạt; mặt bằng gọn', 'Điều khiển theo mẻ, decanter; xả gián đoạn'],
    ICEAS: ['Nạp liên tục (hoặc gián đoạn theo mẻ như SBR – lựa chọn ở tab 3), không cần lắng thứ cấp, chịu sốc tải tốt', 'Thiết bị chuyên dụng (decanter, điều khiển); thể tích bể lớn'],
    OD: ['Rất ổn định, ít vận hành, bùn ổn định', 'Diện tích lớn nhất; điện guồng khí cao'],
    MBBR: ['Gọn, chịu sốc tải, dễ nâng công suất', 'Chi phí giá thể; vẫn cần lắng/DAF; điện sục khí cao'],
    MBR: ['Nước ra rất tốt (tái sử dụng), diện tích nhỏ', 'Chi phí màng và điện cao; rửa màng; cần lưới tinh ≤ 1 mm'],
    ORG: ['Sinh khối cao (8 – 15 kg/m³) → bể gọn; bùn ít, không trương nở; cảnh quan (giàn cây); có thể lọc đĩa trực tiếp', 'Công nghệ độc quyền, giá module cao; cần nhà kính/giàn cây, chăm sóc cây; thiết kế phải được nhà cung cấp xác nhận'],
    AGS: ['Bùn hạt lắng nhanh (SVI 30 – 50), MLSS 8 – 15 g/L, bể sâu: diện tích ~25 – 50 % CAS, không bể lắng/tuần hoàn bùn/khuấy; khử N, P sinh học đồng thời trong hạt; điện năng thấp', 'Công nghệ bản quyền (Royal HaskoningDHV); khởi động lâu nếu không có hạt mồi; cần rbCOD đủ cho tạo hạt; nước ra TSS cao hơn MBR (thường cần lọc khi TP thấp); điều khiển chu kỳ phức tạp'],
    KMBR: ['Màng tấm phẳng CPE bền, không rửa ngược; rửa hóa chất tại chỗ không cần nhấc màng; MLSS 10 – 20 g/L → bể nhỏ; có thể lọc trọng lực/xi-phông; nước ra cấp thẳng RO', 'Chi phí màng & khí rửa màng cao; bắt buộc lưới tinh ≤ 1 mm, FOG ≤ 15 % BOD; thông lượng công nghiệp cần pilot; thiết kế cần Kubota xác nhận (Preliminary Study)'],
    CTECH: ['SBR thế hệ 4: selector sinh học + điều khiển OUR, không cần lắng thứ cấp; F/M ổn định, SVI thấp (< 100); bể chữ nhật dùng chung tường, mô đun hóa', 'Công nghệ độc quyền (SFC – Áo/Ấn Độ); decanter, PLC điều khiển chu kỳ; HRT ~16 h; thiết kế theo BEP cần SFC xác nhận'],
    BIOP: ['Bể sâu 6 m, nhiều ngăn nối tiếp, sinh khối bám cao; không/ít tuần hoàn bùn; tách pha bằng lọc trống', 'Công nghệ độc quyền (Hungary), ít tham chiếu tại VN; giá module; cần mô phỏng của nhà cung cấp'],
  };
  function vCompare() {
    const list = RES.filter(r => r.R);
    if (!list.length) return '<div class="card">Chưa có phương án hợp lệ.</div>';
    const rows = REP.compareRows(S, list);
    const lowerBetter = /(m³\)|m²\)|kW\)|kWh|kg|tấn|tỷ|đ\/m³|ra \(|lỗi|cảnh báo)/;
    const tb = rows.map(([n, f]) => {
      const vals = list.map(x => f(x));
      const nums = vals.filter(v => typeof v === 'number');
      const best = nums.length > 1 && lowerBetter.test(n) ? Math.min(...nums) : null, worst = nums.length > 1 && lowerBetter.test(n) ? Math.max(...nums) : null;
      return `<tr><td>${esc(n)}</td>${vals.map(v => { const cls = typeof v === 'number' ? (v === best && best !== worst ? 'n best' : v === worst && best !== worst ? 'n worst' : 'n') : v === 'ĐẠT' ? 'ok' : v === 'KHÔNG ĐẠT' ? 'bad' : ''; return `<td class="${cls}">${typeof v === 'number' ? fx(v) : esc(v)}</td>`; }).join('')}</tr>`;
    }).join('');
    const metrics = [['Tổng thể tích bể (m³)', x => x.R.kpi.Vt], ['Diện tích khu đất (m²)', x => x.R.kpi.Asite], ['Suất điện năng (kWh/m³)', x => x.R.kpi.kWhm3], ['Bánh bùn (t/ngđ)', x => x.R.kpi.cake], ['Suất đầu tư sơ bộ (tỷ đ)', x => x.R.cost.capex / 1000], ['Chi phí vận hành (đ/m³)', x => x.R.cost.perM3]];
    const bars = metrics.map(([t, f]) => { const vs = list.map(f), mx = Math.max(...vs), mn = Math.min(...vs); return `<div class="card"><h3>${t}</h3>${list.map((x, i) => `<div class="bar"><span title="${esc(x.alt.name)}">${esc(x.alt.name.slice(0, 24))}</span><div class="tr"><div class="fl ${vs[i] === mn ? 'best' : ''}" style="width:${(vs[i] / mx * 100).toFixed(1)}%"></div></div><span class="n">${fx(vs[i])}</span></div>`).join('')}</div>`; }).join('');
    const pros = list.map(x => `<tr><td>${esc(x.alt.name)}</td><td>${esc(DATA.optName('bio', x.alt.c.bio))}</td><td>${esc(PROS[x.alt.c.bio][0])}</td><td>${esc(PROS[x.alt.c.bio][1])}</td></tr>`).join('');
    // gợi ý
    const ok = list.filter(x => x.R.kpi.comply && !x.R.kpi.nFail);
    let rec = 'Chưa có phương án đạt đầy đủ yêu cầu – xem các kiểm tra chưa đạt.';
    if (ok.length) {
      const score = x => x.R.cost.perM3 / Math.min(...ok.map(y => y.R.cost.perM3)) + x.R.kpi.Asite / Math.min(...ok.map(y => y.R.kpi.Asite)) * 0.5 + x.R.cost.capex / Math.min(...ok.map(y => y.R.cost.capex)) * 0.8;
      const b = ok.slice().sort((a, c) => score(a) - score(c))[0];
      rec = `Theo tiêu chí tổng hợp (chi phí vận hành 1,0 · suất đầu tư 0,8 · diện tích 0,5) trong các phương án đạt yêu cầu, phương án <b>${esc(b.alt.name)}</b> có điểm tốt nhất. Đây là gợi ý định lượng sơ bộ – cần xét thêm điều kiện vận hành, nhà cung cấp và mặt bằng thực tế.`;
    }
    return `<h2 class="tt">8. So sánh các phương án công nghệ</h2><p class="lead">Ô xanh: giá trị tốt nhất, ô đỏ nhạt: kém nhất (với chỉ tiêu càng nhỏ càng tốt). Suất đầu tư và chi phí vận hành là ước tính sơ bộ theo đơn giá ở tab 4 – dùng để so sánh tương đối.</p>
      <div class="row" style="margin-bottom:10px"><button id="xlsCompare" class="pri">Xuất Excel bảng so sánh</button></div>
      <div class="card" style="overflow:auto"><table class="t"><thead><tr><th>Chỉ tiêu</th>${list.map(x => `<th>${esc(x.alt.name)}</th>`).join('')}</tr></thead><tbody>${tb}</tbody></table></div>
      <div class="card"><h3>Nhận xét</h3><p>${rec}</p></div>
      <div class="bars">${bars}</div>
      <div class="card"><h3>Ưu – nhược điểm công nghệ sinh học</h3><table class="t"><thead><tr><th>Phương án</th><th>Công nghệ</th><th>Ưu điểm</th><th>Nhược điểm</th></tr></thead><tbody>${pros}</tbody></table></div>`;
  }

  /* ---------------- 7. PFD ---------------- */
  function vPFD() {
    const r = cur(); if (!r.R) return '<div class="card">Lỗi tính toán.</div>';
    let svg = '';
    try { const sh = SHEETS.pfd(S, r.R); r._pfd = sh; svg = DRW.toSVG(sh, { px: '100%' }); } catch (e) { console.error(e); svg = 'Lỗi vẽ sơ đồ: ' + esc(e.message); }
    return `<h2 class="tt">9. Sơ đồ công nghệ – ${esc(r.alt.name)}</h2><p class="lead">Sơ đồ tự đổi theo lựa chọn công nghệ, kèm bảng cân bằng vật chất.</p>
      <div class="row" style="margin-bottom:10px"><button id="pfdSvg">Tải SVG</button><button id="pfdDxf">Tải DXF (AutoCAD)</button><button id="pfdPrint" class="pri">In / lưu PDF</button></div>
      <div class="svgbox">${svg}</div>`;
  }

  /* ---------------- 8. Bản tính ---------------- */
  function vReport() {
    const r = cur(); if (!r.R) return '<div class="card">Lỗi tính toán.</div>';
    return `<h2 class="tt">10. Bản tính chi tiết – ${esc(r.alt.name)}</h2><p class="lead">Mỗi công thức ghi rõ phương trình / bảng tra / trang tài liệu. In ra PDF (A4) hoặc xuất Excel.</p>
      <div class="row" style="margin-bottom:10px"><button id="repPrint" class="pri">In / lưu PDF</button><button id="repXls">Xuất Excel (.xlsx)</button><button id="repHtml">Tải HTML</button></div>${REP.html(S, r.R)}`;
  }

  /* ---------------- 9. Bản vẽ ---------------- */
  function sheets() { if (!dwgCache) { const r = cur(); dwgCache = r.R ? SHEETS.build(S, r.R) : []; } return dwgCache; }
  function vDwg() {
    const r = cur(); if (!r.R) return '<div class="card">Lỗi tính toán.</div>';
    const sh = sheets();
    return `<h2 class="tt">11. Bản vẽ thiết kế công nghệ – ${esc(r.alt.name)}</h2><p class="lead">Bộ ${sh.length} tờ khổ A1: danh mục, tổng mặt bằng, PFD, trắc dọc thủy lực, mặt bằng – mặt cắt công trình, danh mục thiết bị. Xuất DXF mở bằng AutoCAD (lớp theo loại đường).</p>
      <div class="row" style="margin-bottom:10px"><button id="dwgDxfAll" class="pri">Tải DXF cả bộ</button><button id="dwgDxf">Tải DXF tờ đang xem</button><button id="dwgSvg">Tải SVG tờ đang xem</button>
      <label>Khổ in:</label><select id="paper"><option value="A1">A1</option><option value="A3" selected>A3 (thu nhỏ)</option></select><button id="dwgPrint">In / lưu PDF cả bộ</button>
      <span style="flex:1"></span><button id="zOut">−</button><button id="zFit">Vừa khung</button><button id="zIn">+</button></div>
      <div class="dwg"><div class="thumbs">${sh.map((s, i) => `<div class="thumb ${i === dwgIdx ? 'on' : ''}" data-sheet="${i}"><b>${s.code}</b> – ${esc(s.title)}</div>`).join('')}</div><div class="viewer" id="viewer"></div></div>`;
  }
  function showSheet(i) {
    const sh = sheets(); if (!sh.length) return;
    dwgIdx = Math.max(0, Math.min(i, sh.length - 1));
    document.querySelectorAll('.thumb').forEach((t, k) => t.classList.toggle('on', k === dwgIdx));
    const v = $('#viewer'); if (!v) return;
    v.innerHTML = DRW.toSVG(sh[dwgIdx].sh, { px: String(Math.round((v.clientWidth - 30) * zoom)) });
  }
  /* ---------------- 12. Kiểm tra khả năng vận hành ---------------- */
  function vOps() {
    const o = OPS.ensure(S), bio = o.bio, isB = !!OPS.BATCH[bio], isM = !!OPS.MEDIA[bio], p = S.p;
    const lim = ENG.limits(S), L = lim.L;
    const r = cur();
    const f = (lbl, path, hint) => `<label>${lbl}</label><div class="row">${num(path, { w: 110 })}${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    const head = `<h2 class="tt">12. Kiểm tra khả năng vận hành của hệ thống XLNT</h2>
      <p class="lead">Nhập công nghệ đang áp dụng, chất lượng nước thải vào thực tế, số liệu công trình – thiết bị (thể tích bể, MLSS, máy thổi khí, bể lắng, hóa chất). Phần mềm dự đoán chất lượng nước ra theo mô hình trạng thái ổn định M&E 5th và đề xuất điều kiện vận hành để nước ra đạt tiêu chuẩn.</p>
      <div class="row noprint" style="margin-bottom:10px;flex-wrap:wrap;gap:6px"><button id="opsLoad" class="pri">Nạp số liệu công trình từ phương án thiết kế đang xem${r && r.R ? ' (' + esc(r.alt.name) + ')' : ''}</button><button id="opsQ">Lấy lưu lượng & chất lượng nước vào từ tab 1</button><button id="opsApply">Áp dụng điều kiện khuyến cáo</button><button id="opsXls">Xuất Excel kiểm tra vận hành & hiệu chỉnh</button><button id="opsPrint">In / lưu PDF</button><button id="opsReset" class="danger">Đặt lại</button></div>
      <div class="row noprint xchops" style="margin-bottom:10px;flex-wrap:wrap;gap:6px;align-items:center"><b style="font-size:13px">Trao đổi dữ liệu:</b>
        <button id="opsXchCur" class="xch-btn" title="Gửi số liệu vận hành hiện tại (công trình, MLSS, khí, hóa chất, nước vào, nước ra dự đoán) sang SimXLNT / AquaDesign VN hoặc lưu tệp">⇄ Gửi vận hành hiện tại…</button>
        <button id="opsXchRec" class="xch-btn" title="Gửi điều kiện vận hành khuyến cáo sang SimXLNT / AquaDesign VN (ví dụ để mô phỏng động kiểm chứng)">⇄ Gửi điều kiện khuyến cáo…</button>
        <button id="opsXchIn" class="xch-btn" title="Nhận hồ sơ (vd. kết quả mô phỏng SimXLNT) vào số liệu vận hành">⇄ Nhận vào tab Vận hành…</button>
        <span style="width:12px"></span>
        <button id="opsToDesCur" title="Ghi lưu lượng, chất lượng nước, MLSS, SRT, DO, SVI, thể tích các vùng… của số liệu vận hành hiện tại vào phần tính toán thiết kế rồi tính lại">↻ Chuyển vận hành hiện tại → tính toán thiết kế</button>
        <button id="opsToDesRec" class="pri" title="Ghi điều kiện vận hành khuyến cáo vào phần tính toán thiết kế rồi tính lại">↻ Chuyển điều kiện khuyến cáo → tính toán thiết kế</button></div>`;
    const plant = [];
    if (isB) plant.push(f('Tổng thể tích bể ở mực nước cao TWL (m³)', 'op.Vb'), f('Thể tích selector / vùng kỵ khí trong bể (m³)', 'op.Vana', 'C-Tech: selector; SBR, ICEAS: 0'), f('Phân suất thời gian sục khí trong chu kỳ', 'op.fAer', 't_sục/t_chu kỳ'), f('Phân suất thời gian lắng + gạn', 'op.fSD'), f('Mực nước cao TWL (m)', 'op.TWL'), f('Chiều sâu gạn mỗi chu kỳ ΔH (m)', 'op.dH'));
    else if (bio === 'CAS' || bio === 'OD') plant.push(f(bio === 'OD' ? 'Thể tích mương (m³)' : 'Thể tích bể Aeroten (m³)', 'op.Vaer'), f(bio === 'OD' ? 'Phân suất hiếu khí của mương (1 − phân suất thiếu khí)' : 'Phân suất thời gian sục khí (1 = liên tục)', 'op.fOn'), f('Tỷ lệ tuần hoàn bùn R (× Q)', 'op.R'));
    else {
      if (bio === 'AAO') plant.push(f('Thể tích vùng kỵ khí (m³)', 'op.Vana'));
      plant.push(f('Thể tích vùng thiếu khí (m³)', 'op.Van'), f(isM ? 'Thể tích vùng hiếu khí có giá thể (m³)' : 'Thể tích vùng hiếu khí (m³)', 'op.Vaer'));
      if (bio === 'MBR') plant.push(f('Thể tích bể màng (m³)', 'op.Vmem'), f('Diện tích màng (m²)', 'op.Am'), f('Tuần hoàn bể màng → thiếu khí (× Q)', 'op.R'));
      else plant.push(f('Tỷ lệ tuần hoàn bùn R (× Q)', 'op.R', isM ? '0 = màng bám thuần' : ''), f('Tỷ lệ tuần hoàn nội IR (× Q)', 'op.IR'));
    }
    if (DATA.NEED_CLARIFIER[bio]) plant.push(f('Tổng diện tích bể lắng thứ cấp (m²)', 'op.Acl'));
    plant.push(f(isM ? 'Sinh khối tương đương X_tđ vùng giá thể (mg/L)' : isB ? 'MLSS ở mực nước cao (mg/L)' : 'MLSS vận hành (mg/L)', 'op.MLSS'), f('SVI đo (mL/g)', 'op.SVI'), f('SRT vận hành (ngày)', 'op.SRT', '0 = tự tính từ MLSS'));
    const air = o.aer === 'surf'
      ? [f('Công suất guồng khí đang vận hành (kW)', 'op.kWs'), f('Công suất guồng khí tối đa có thể chạy (kW)', 'op.kWsMax'), f('SAE guồng khí (kgO₂/kWh)', 'op.SAE'), f('Hệ số α', 'op.alpha'), f('DO đặt (mg/L)', 'op.DO')]
      : [f('Lưu lượng khí đang cấp cho bể sinh học (Nm³/h)', 'op.air'), f('Năng lực khí tối đa của các máy thổi làm việc (Nm³/h)', 'op.airMax', 'không tính máy dự phòng'), f('SOTE đĩa ở độ ngập', 'op.SOTE'), f('Độ ngập đĩa D_f (m)', 'op.Df'), f('Hệ số α', 'op.alpha'), f('DO đặt (mg/L)', 'op.DO')];
    const chem = [f('PAC châm vào bể sinh học (mg/L)', 'op.pacSim'), `<label>Cụm hóa lý bậc 3</label>${sel('op.tert', [[0, 'Không có'], [1, 'Có']], { t: 'n' })}`, f('PAC cụm hóa lý bậc 3 (mg/L)', 'op.pacTert'),
      `<label>Lọc bậc 3</label>${sel('op.filt', [[0, 'Không có'], [1, 'Có']], { t: 'n' })}`, f('Methanol (mg/L)', 'op.meoh'), f('NaOH 100 % (mg/L)', 'op.naoh'), f('Polymer trợ lắng (mg/L)', 'op.poly'),
      `<label>Khử trùng</label>${sel('op.disinf', [['naocl', 'NaOCl – clo'], ['uv', 'UV'], ['none', 'Không có']])}`, o.disinf === 'uv' ? f('Liều UV (mJ/cm²)', 'op.uv') : f('Liều clo hoạt tính (mg/L)', 'op.cl')];
    const qrows = DATA.QPARAMS.filter(x => x[0] !== 'NO3').map(([k, nm, un]) => `<tr><td>${nm}</td><td>${un}</td><td>${num('op.q.' + k, { w: 100 })}</td></tr>`).join('');
    const inputs = `<div class="grid2">
      <div class="card"><h3>Công nghệ & điều kiện vận hành</h3><div class="form">
        <label>Công nghệ sinh học</label>${sel('op.bio', DATA.STEPS.find(s => s.key === 'bio').opts)}
        <label>Hóa lý trước sinh học (CEPT)</label>${sel('op.pre', [['none', 'Không có'], ['cept', 'Có (hiệu suất theo tab 4)']])}
        ${f('Lưu lượng thực tế Q (m³/ngđ)', 'op.Q')}${f('Hệ số đỉnh lưu lượng vào cụm sinh học', 'op.kmax', 'sau điều hòa nếu có')}
        ${f('Nhiệt độ nước thấp nhất (°C)', 'op.T', 'động học nitrat hóa')}${f('Nhiệt độ nước cao nhất (°C)', 'op.Tmax', 'khả năng cấp oxy')}
        <label>Tiêu chuẩn xả</label><div>${esc(lim.name)} <span class="hint">(chọn ở tab 2)</span></div>
        ${o.src ? `<label>Nguồn số liệu công trình</label><div class="hint">${esc(o.src)}</div>` : ''}
      </div>
      <h4>Chất lượng nước thải vào thực tế</h4><table class="t"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th><th>Giá trị</th></tr></thead><tbody>${qrows}</tbody></table></div>
      <div class="card"><h3>Công trình & thiết bị hiện hữu</h3><div class="form">${plant.join('')}</div>
        <h4>Cấp khí</h4><div class="form"><label>Kiểu cấp khí</label>${sel('op.aer', [['diff', 'Đĩa phân phối khí + máy thổi'], ['surf', 'Guồng khí bề mặt']])}${isB ? `<label>Chế độ chạy máy thổi khí</label>${sel('op.blowCont', [[0, 'Chỉ chạy trong pha sục khí (mọi bể cùng lúc)'], [1, 'Chạy liên tục, luân phiên cấp cho các bể đang sục khí']], { t: 'n' })}` : ''}${air.join('')}</div>
        <h4>Hóa chất & khử trùng đang dùng</h4><div class="form">${chem.join('')}</div></div>
    </div>`;
    const RP = OPS.report(S, o);
    if (RP.err) return `<div id="ops">${head}${inputs}<div class="card"><p class="warnline">⚠ ${esc(RP.err)}</p></div></div>`;
    const A = RP.A, r0 = A.base, r1 = A.after, d0 = r0.d, d1 = r1.d;
    const vf = (k, v) => k === 'Coli' ? Number(v).toExponential(1) : fx(v);
    const st = (ok) => ok === null ? '<td>—</td>' : `<td class="${ok ? 'ok' : 'bad'}">${ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}</td>`;
    const mrow = k => { const m = o.meas && o.meas[k]; return `<td>${num('op.meas.' + k, { w: 80 })}</td><td class="hint">${m !== undefined && m !== '' && !isNaN(+m) && r0.eff[k] ? (m / r0.eff[k] > 1.3 || m / r0.eff[k] < 0.7 ? '<span class="badge warn">lệch</span>' : '<span class="badge ok">khớp</span>') : ''}</td>`; };
    const qtab = r0.comp.map((c, i) => { const c1 = r1.comp[i]; return `<tr><td>${c.nm}</td><td>${c.un}</td><td class="n">${vf(c.key, r0.st1[c.key])}</td><td class="n"><b>${vf(c.key, c.v)}</b></td><td class="n">${c.lim === undefined ? '—' : fx(c.lim)}</td>${st(c.ok)}<td class="n"><b>${vf(c.key, c1.v)}</b></td>${st(c1.ok)}${mrow(c.key)}</tr>`; }).join('');
    const nOut = r0.comp.filter(x => x.ok === false).length, nOut1 = r1.comp.filter(x => x.ok === false).length;
    const summary = `<div class="kpis">
      <div class="kpi"><div class="l">Với vận hành hiện tại</div><div class="v">${r0.comply ? '<span class="badge ok">ĐẠT</span>' : `<span class="badge bad">${nOut} chỉ tiêu vượt</span>`}</div></div>
      <div class="kpi"><div class="l">Sau khi vận hành theo khuyến cáo</div><div class="v">${r1.comply ? '<span class="badge ok">ĐẠT</span>' : `<span class="badge bad">${nOut1} chỉ tiêu còn vượt</span>`}</div></div>
      <div class="kpi"><div class="l">SRT hiếu khí</div><div class="v">${fx(d0.SRTa)} → ${fx(d1.SRTa)} <span class="u">ngày</span></div></div>
      <div class="kpi"><div class="l">DO thực đạt</div><div class="v">${fx(d0.DO)} → ${fx(d1.DO)} <span class="u">mg/L</span></div></div>
      <div class="kpi"><div class="l">Bùn dư cần xả</div><div class="v">${fx(d0.PXTSS, 0)} → ${fx(d1.PXTSS, 0)} <span class="u">kg/ngđ</span></div></div></div>`;
    const dg = RP.diag.map(x => `<tr><td>${x.n}</td><td>${x.u}</td><td class="n">${typeof x.a === 'number' ? fx(x.a, x.dec) : x.a}</td><td class="n">${typeof x.b === 'number' ? fx(x.b, x.dec) : x.b}</td><td class="hint">${x.crit}</td>${x.ok === null ? '<td></td>' : st(x.ok)}</tr>`);
    const recRows = RP.recs.map(x => `<tr><td>${esc(x.label)}</td><td>${esc(x.unit)}</td><td class="n">${fx(x.from, x.dec)}</td><td class="n"><b>${fx(x.to, x.dec)}</b></td><td>${esc(x.why)}</td></tr>`).join('');
    const c0 = RP.c0, c1 = RP.c1;
    const names = [...new Set([...c0.items, ...c1.items].map(x => x.name))];
    const cRows = names.map(n => { const a = c0.items.find(x => x.name === n), b = c1.items.find(x => x.name === n); return `<tr><td>${esc(n)}</td><td class="n">${a ? fx(a.kg, 1) : '—'}</td><td class="n">${b ? fx(b.kg, 1) : '—'}</td><td class="n">${a ? fx(a.cost / 1000, 0) : '—'}</td><td class="n">${b ? fx(b.cost / 1000, 0) : '—'}</td></tr>`; }).join('')
      + `<tr><td><b>Tổng chi phí hóa chất + điện cấp khí</b></td><td></td><td></td><td class="n"><b>${fx(c0.total / 1000, 0)}</b></td><td class="n"><b>${fx(c1.total / 1000, 0)}</b></td></tr>`;
    const flags = RP.flags.map(t => `<li>${esc(t)}</li>`).join('');
    // hiệu chỉnh theo số liệu đo
    const CAL = RP.cal, QN = k => k === 'PX' ? ['Bùn dư thực tế', 'kg DS/ngđ'] : (DATA.QPARAMS.find(x => x[0] === k) || [k, k, '']).slice(1);
    const fmtv = (k, v) => v === null || v === undefined ? '—' : k === 'Coli' || k === 'coli_bio' ? Number(v).toExponential(2) : fx(v, Math.abs(v) < 1 ? 3 : 2);
    let calCard = `<div class="card" id="opsCal"><h3>Hiệu chỉnh đặc trưng nước thải & hằng số động học theo số liệu đo thực tế</h3>
      <p class="hint">Khi số đo nước ra (cột "Đo thực tế" ở bảng trên) lệch so với dự đoán, phần mềm nội suy ngược các đặc trưng nước thải và hằng số động học sao cho mô hình tái lập đúng số đo, trong điều kiện lúc lấy mẫu. Bấm "Áp dụng" để thay các giá trị này vào thông số thiết kế (tab 4) – mọi phương án thiết kế và phần kiểm tra vận hành tự tính lại.</p>
      <div class="form" style="max-width:640px">${f('Nhiệt độ nước lúc lấy mẫu (°C)', 'op.meas.T', 'trống = nhiệt độ thấp nhất')}${f('DO đo thực tế vùng hiếu khí (mg/L)', 'op.meas.DO', 'trống = tính theo máy thổi')}${f('Bùn dư thực tế (kg DS/ngđ)', 'op.meas.PX', 'từ nhật ký xả bùn – hiệu chỉnh b_H')}</div>`;
    if (!CAL) calCard += `<p class="hint">Chưa có số đo – nhập ít nhất một chỉ tiêu nước ra ở cột "Đo thực tế" hoặc lượng bùn dư thực tế.</p></div>`;
    else if (CAL.err) calCard += `<p class="warnline">⚠ ${esc(CAL.err)}</p></div>`;
    else {
      const ch = OPS.calChanges(CAL);
      calCard += `<h4>Đối chiếu số đo – mô hình (điều kiện lấy mẫu: T = ${fx(CAL.cond.T)} °C${CAL.cond.DO ? `, DO = ${fx(CAL.cond.DO)} mg/L` : ''})</h4>
        <table class="t"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th><th>Đo thực tế</th><th>Mô hình – trước hiệu chỉnh</th><th>Lệch</th><th>Mô hình – sau hiệu chỉnh</th><th>Lệch</th></tr></thead><tbody>${CAL.cmp.map(c => { const q = QN(c.key), e0 = c.meas ? (c.pred0 / c.meas - 1) * 100 : 0, e1 = c.meas ? (c.pred1 / c.meas - 1) * 100 : 0, cls = e => Math.abs(e) <= 10 ? 'ok' : Math.abs(e) <= 30 ? '' : 'bad', lg = v => Math.log10(Math.max(v, 1e-6) / c.meas), clsL = v => cls(lg(v) * 33); if (c.key === 'Coli') return `<tr><td>${q[0]}</td><td>${q[1]}</td><td class="n"><b>${fmtv(c.key, c.meas)}</b></td><td class="n">${fmtv(c.key, c.pred0)}</td><td class="n ${clsL(c.pred0)}">${fx(lg(c.pred0), 2)} log</td><td class="n">${fmtv(c.key, c.pred1)}</td><td class="n ${clsL(c.pred1)}">${fx(lg(c.pred1), 2)} log</td></tr>`; return `<tr><td>${q[0]}</td><td>${q[1]}</td><td class="n"><b>${fmtv(c.key, c.meas)}</b></td><td class="n">${fmtv(c.key, c.pred0)}</td><td class="n ${cls(e0)}">${c.key === 'Coli' ? '' : fx(e0, 0) + ' %'}</td><td class="n">${fmtv(c.key, c.pred1)}</td><td class="n ${cls(e1)}">${c.key === 'Coli' ? '' : fx(e1, 0) + ' %'}</td></tr>`; }).join('')}</tbody></table>
        <h4>Thông số hiệu chỉnh (nội suy ngược)</h4>
        <div style="overflow:auto"><table class="t"><thead><tr><th>Thông số (tab 4)</th><th>Mã</th><th>Đơn vị</th><th>Giá trị hiện tại</th><th>Giá trị hiệu chỉnh</th><th>Thay đổi</th><th>Dựa vào chỉ tiêu đo</th><th>Ghi chú</th></tr></thead><tbody>${CAL.items.map(x => `<tr><td>${esc(x.label)}</td><td><code>${x.k}</code></td><td>${esc(x.unit)}</td><td class="n">${fmtv(x.k, x.from)}</td><td class="n"><b>${fmtv(x.k, x.to)}</b></td><td class="n">${x.from ? fx((x.to / x.from - 1) * 100, 0) + ' %' : '—'}</td><td>${esc(QN(x.by)[0])}</td><td class="${x.status === 'ok' || x.status === 'derived' ? '' : 'hint'}">${esc(OPS.CAL_STATUS[x.status])}${x.warn ? `<div class="badge warn">${esc(x.warn)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="row noprint" style="margin-top:8px"><button id="opsCalApply" class="pri" ${ch.length ? '' : 'disabled'}>${ch.length ? 'Áp dụng ' + ch.length + ' thông số hiệu chỉnh vào thông số thiết kế (tab 4)' : 'Mô hình đã khớp số đo – không còn thông số cần áp dụng'}</button></div>
        ${o.calLog ? `<p class="hint">Lần áp dụng gần nhất: ${esc(o.calLog.date)} – ${o.calLog.items.map(x => `${x.k}: ${fmtv(x.k, x.from)} → ${fmtv(x.k, x.to)}`).join('; ')}.</p>` : ''}
        <p class="hint">Mỗi chỉ tiêu đo hiệu chỉnh một thông số nhạy nhất (giải ngược một chiều, lặp 3 lượt vì các thông số tương tác): TSS → TSS ra cơ sở; bùn dư → b_H; NH₄-N → μmax,AOB (Bảng 8-14); NO₃-N hoặc TN → rbCOD/bCOD (SDNR theo Bảng 8-22) và SDNR₂₀ của công nghệ; TP → f_P, rbCOD:P hoặc Al:P theo cơ chế khử P; COD → sCOD/COD (COD trơ hòa tan); BOD → gBOD/gTSS; Coliform → coliform sau sinh học. Nên dùng số liệu trung bình nhiều ngày ở chế độ ổn định; "Chạm biên" cho thấy sai lệch do nguyên nhân khác (số liệu vận hành, thiết bị) cần kiểm tra lại.</p></div>`;
    }
    return `<div id="ops">${head}${inputs}
      <div class="card"><h3>Dự đoán chất lượng nước ra</h3>${summary}
        <div style="overflow:auto"><table class="t"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th><th>Nước vào</th><th>Dự đoán ra – vận hành hiện tại</th><th>Giới hạn</th><th>Đánh giá</th><th>Dự đoán ra – sau khuyến cáo</th><th>Đánh giá</th><th>Đo thực tế (nếu có)</th><th></th></tr></thead><tbody>${qtab}</tbody></table></div>
        ${flags ? `<h4>Nhận định vận hành hiện tại</h4><ul class="warn">${flags}</ul>` : ''}
        <p class="hint">Nhập kết quả quan trắc nước ra thực tế vào cột "Đo thực tế" để đối chiếu mô hình: lệch > 30 % thì cần hiệu chỉnh các tỷ lệ đặc trưng nước thải (tab 4), SVI, SOTE/α hoặc kiểm tra số liệu vận hành.</p></div>
      ${calCard}
      <div class="card"><h3>Điều kiện vận hành khuyến cáo</h3>
        ${A.recs.length ? `<div style="overflow:auto"><table class="t"><thead><tr><th>Thông số vận hành</th><th>Đơn vị</th><th>Hiện tại</th><th>Khuyến cáo</th><th>Lý do</th></tr></thead><tbody>${recRows}</tbody></table></div>` : `<p><span class="badge ok">Giữ nguyên chế độ vận hành</span> Nước ra dự đoán đạt tiêu chuẩn với biên an toàn 10 %.</p><table class="t"><tbody>${recRows}</tbody></table>`}
        ${A.infra.length ? `<h4>${r1.comply ? 'Lưu ý cải tạo để tăng độ an toàn' : 'Không đạt được chỉ bằng điều chỉnh vận hành – đề xuất cải tạo'}</h4><ul class="warn">${A.infra.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <p class="hint">Khuyến cáo được tìm bằng cách lặp mô hình (${A.iters} vòng) với mục tiêu ≤ 90 % giới hạn xả. Thứ tự ưu tiên: đủ oxy (DO) → độ kiềm → tuổi bùn (MLSS, thời gian sục khí) → tuần hoàn nội / pha thiếu khí → carbon ngoài → hóa chất khử P → kiểm soát bùn lắng → khử trùng. Thay đổi MLSS cần thực hiện từ từ (giảm xả bùn trong 1 – 2 SRT) và theo dõi SVI, DO, NH₄-N.</p></div>
      <div class="card"><h3>Chẩn đoán quá trình</h3><div style="overflow:auto"><table class="t"><thead><tr><th>Thông số</th><th>Đơn vị</th><th>Hiện tại</th><th>Sau khuyến cáo</th><th>Tiêu chí</th><th>Đánh giá</th></tr></thead><tbody>${dg.join('')}</tbody></table></div></div>
      <div class="card"><h3>Hóa chất & điện cấp khí</h3><table class="t"><thead><tr><th>Hạng mục</th><th>Hiện tại (kg hoặc kWh/ngđ)</th><th>Sau khuyến cáo</th><th>Chi phí hiện tại (nghìn đ/ngđ)</th><th>Sau khuyến cáo</th></tr></thead><tbody>${cRows}</tbody></table><p class="hint">Đơn giá theo tab 4 (nhóm chi phí). Điện cấp khí tính theo lượng khí cần để giữ DO đặt (PT 5-77), không vượt lưu lượng khí cấp.</p></div>
      <div class="card"><h3>Cơ sở tính & giới hạn của mô hình</h3><ul class="hint">
        <li>Trạng thái ổn định theo M&E 5th: SRT giải từ khối bùn đang giữ M = MLSS·V = P_X,TSS·SRT (PT 8-20, 8-21); cơ chất còn lại PT (7-46); NH₄-N ra giải ngược PT (7-94) với SRT hiếu khí và DO thực đạt; NOx PT (8-24); nhu cầu oxy PT (8-23).</li>
        <li>DO thực đạt tính từ khả năng truyền oxy của hệ cấp khí ở nhiệt độ nước cao nhất theo PT (5-70); động học nitrat hóa tính ở nhiệt độ thấp nhất – tổ hợp bất lợi.</li>
        <li>Khử nitrat: SDNR theo F/M_b (PT 8-56 – 8-58, Bảng 8-22), giới hạn bởi lượng nitrat được đưa về vùng thiếu khí (PT 8-61) và carbon nội tại; methanol theo Bảng 8-26 (4,98 g COD/g N).</li>
        <li>Photpho: đồng hóa f_P·P_X,VSS; EBPR theo rbCOD:P (Bảng 8-30) trừ rbCOD bị nitrat tuần hoàn tiêu thụ; khử P hóa học theo tỷ lệ mol Al:P (mục 6-4).</li>
        <li>TSS ra: giá trị cơ sở (tab 4) hiệu chỉnh theo chỉ số quá tải bể lắng (Bảng 8-34: SOR, SLR, R cần theo SVI) hoặc tỷ lệ gạn cho phép (PT 8-50) – quan hệ kinh nghiệm, nên hiệu chỉnh theo số liệu đo.</li>
        <li>Coliform: liều clo kết hợp theo Bảng 12-14 (tiếp xúc 30 phút). Kết quả là ước tính kỹ thuật phục vụ vận hành – cần xác nhận bằng quan trắc và thí nghiệm (Jartest, SDNR, OUR).</li></ul></div>
    </div>`;
  }

  function printPages(title, pagesHTML, pageCss) {
    const w = window.open('', '_blank');
    if (!w) { toast('Trình duyệt chặn cửa sổ in – cho phép pop-up.'); return; }
    w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${pageCss}</style></head><body>${pagesHTML}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);
    w.document.close();
  }
  function reportCss() {
    let css = '';
    for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.cssText.includes('.rep') || r.cssText.startsWith(':root')) css += r.cssText + '\n'; } catch (e) { /* bỏ qua */ } }
    return css + BI.CSS + `@page{size:A4 portrait;margin:14mm 12mm 14mm 16mm} body{font:11px Arial,sans-serif;margin:0} .rep{border:none;padding:0;max-width:none} .rep h1{break-after:avoid} .rep h2,.rep h3{break-after:avoid} .rep tr{break-inside:avoid} .rep .cover{min-height:250mm;break-after:page;padding-top:60mm} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
  }

  /* ---------------- sự kiện ---------------- */
  function bind() {
    $('#nav').addEventListener('click', e => { const a = e.target.closest('[data-tab]'); if (a) { tab = a.dataset.tab; render(); $('#main').scrollTop = 0; } });
    $('#altSel').addEventListener('change', e => { S.cur = +e.target.value; dwgCache = null; persist(); render(); });
    $('#btnSave').addEventListener('click', () => { download(fileBase() + '.xlnt.json', JSON.stringify(S, null, 1), 'application/json'); toast('Đã lưu tệp dự án.'); });
    $('#btnOpen').addEventListener('click', () => $('#fileOpen').click());
    $('#fileOpen').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = () => { try { S = migrate(JSON.parse(rd.result)); refresh(); toast('Đã mở dự án: ' + f.name); } catch (err) { alert(bil('Tệp không hợp lệ: ' + err.message)); } };
      rd.readAsText(f); e.target.value = '';
    });
    $('#btnNew').addEventListener('click', () => { if (confirm(bil('Tạo dự án mới? Dữ liệu hiện tại (chưa lưu tệp) sẽ bị thay thế.'))) { S = DATA.defaultState(); tab = 'input'; refresh(); } });
    // mẫu dự án: 2 nút mẫu nhà cung cấp + danh sách thả mẫu bảng tính Excel
    const loadSample = id => {
      const o = DATA.SAMPLES.find(x => x.id === id); if (!o) return;
      if (!confirm(bil('Nạp mẫu? Dữ liệu hiện tại (chưa lưu tệp) sẽ bị thay thế.') + '\n\n' + o.name + '\n' + o.src)) return;
      S = DATA.makeSample(o); tab = 'input'; refresh(); toast('Đã nạp mẫu: ' + o.name);
    };
    document.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => loadSample(b.dataset.sample)));
    const sel = $('#selSample');
    sel.innerHTML = `<option value="">${esc('Mẫu tính ▾')}</option><optgroup label="${esc('Mẫu nhà cung cấp')}"><option value="iceas202">ICEAS 202 – Xylem Sanitaire (432 m³/ngđ)</option><option value="ctech50">C-Tech – BEP SFC Vellore 50 MLD</option><option value="kubota700">MBR Kubota – PVFC 700 m³/ngđ (EK400 × 6)</option></optgroup><optgroup label="${esc('Bảng tính M&E 5th – S.I. units')}">${DATA.SAMPLES.filter(x => x.group === 'excel').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup><optgroup label="${esc('Nước thải tải lượng cao – yếm khí cấp 1 + hiếu khí (M&E 5th Ch.10)')}">${DATA.SAMPLES.filter(x => x.group === 'anaer').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup><optgroup label="${esc('Xử lý bậc 3 (hóa lý, oxy hóa) & lựa chọn xử lý bùn')}">${DATA.SAMPLES.filter(x => x.group === 'tert').map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>${DATA.SAMPLES_NA.length ? `<optgroup label="${esc('Chưa có công nghệ tương ứng (chỉ tra cứu)')}">${DATA.SAMPLES_NA.map(x => `<option value="" disabled>${esc(x[0] + ' – ' + x[1])}</option>`).join('')}</optgroup>` : ''}`;
    sel.addEventListener('change', () => { const id = sel.value; sel.value = ''; if (id) loadSample(id); });
    // diễn giải quy tắc khi bấm vào mã R01…/F01… trong bản tính
    const rb = document.createElement('div'); rb.id = 'ruleBox'; document.body.appendChild(rb);
    const closeRule = () => rb.classList.remove('on');
    const showRule = k => {
      const v = DATA.RULES[k]; if (!v) return;
      const r = cur(), refs = r && r.R ? DATA.ruleRefs(r.R, k) : [];
      const link = s => esc(s).replace(DATA.RULE_RE, m => DATA.RULES[m] ? `<a class="rule" data-rule="${m}" href="#rule-${m}">${m}</a>` : m);
      rb.innerHTML = `<div class="rb rep" data-nobi="1"><h3><span class="code">${k}</span>${esc(v.t)}</h3><div class="hint" style="opacity:.7">${esc(v.te)}</div>
        <p>${link(v.d)}</p><p class="hint" style="opacity:.7">${link(v.de)}</p>
        <div class="refs"><b>Áp dụng tại các dòng tính của phương án "${esc(r ? r.alt.name : '')}":</b> <span class="hint">(Applied in calculation rows)</span>
        ${refs.length ? '<ul>' + refs.map(x => `<li>${esc(x.u)}${x.sym ? ' · <b>' + esc(x.sym) + '</b>' : ''} – ${esc(x.name)}</li>`).join('') + '</ul>' : (v.at ? '<p>' + esc(v.at) + '</p>' : '<p>— (không áp dụng cho phương án này / not applicable to this alternative)</p>')}</div>
        <div class="act"><button data-rulego="${k}">Xem trong bản tính chi tiết</button><button class="pri" data-ruleclose="1">Đóng</button></div></div>`;
      rb.classList.add('on');
    };
    /* trích dẫn tài liệu: nội dung bảng / phương trình / đoạn trích + các dòng tính sử dụng (giá trị) */
    const rowLabel = (u, r) => `${esc(u.code)}${r.sym ? ' · <b>' + esc(r.sym) + '</b>' : ''} – ${esc(r.name || '')}${typeof r.val === 'number' ? ' = <b>' + fx(r.val) + '</b> ' + esc(r.unit || '') : r.val !== undefined && r.kind !== 'note' ? ' = ' + esc(r.val) : ''}`;
    const showCite = k => {
      const c = DATA.CITES[k]; if (!c) return;
      const r = cur(), refs = r && r.R ? DATA.citeRefs(r.R, k) : [];
      rb.innerHTML = `<div class="rb rep" data-nobi="1"><h3><span class="code">${esc(c.loc)}</span>${esc(c.t)}</h3><div class="hint" style="opacity:.7">${esc(c.te || '')}</div>
        ${DATA.citeHTML(k, esc)}${c.de ? `<p class="hint" style="opacity:.7">${esc(c.de)}</p>` : ''}
        <div class="refs"><b>Các dòng tính dùng trích dẫn này – phương án "${esc(r ? r.alt.name : '')}":</b> <span class="hint">(Calculation rows citing this reference)</span>
        ${refs.length ? '<ul>' + refs.map(x => `<li><a href="#" data-gorow="${x.u.id}|${x.si}|${x.ri}">${rowLabel(x.u, x.r)}</a></li>`).join('') + '</ul>' : '<p>—</p>'}</div>
        <div class="act"><button data-citego="${k}">Xem trong bản tính chi tiết</button><button class="pri" data-ruleclose="1">Đóng</button></div></div>`;
      rb.classList.add('on');
    };
    /* chi tiết một dòng tính: công thức, công thức thay số, các trích dẫn */
    const showRow = key => {
      const r0 = cur(); if (!r0 || !r0.R) return;
      const [uid, si, ri] = key.split('|'); const u = r0.R.um[uid]; if (!u) return;
      const row = u.secs[+si] && u.secs[+si].rows[+ri]; if (!row) return;
      const txt = row.kind === 'note' ? row.val : (row.f || '') + ' ¦ ' + (row.src || '');
      const keys = [...new Set(DATA.citeFind(txt).map(x => x.key))];
      const rules = [...new Set((txt.match(DATA.RULE_RE) || []).filter(m => DATA.RULES[m]))];
      let ex = '', sub = '';
      if (row.xp) {
        const nice = s => esc(s.replace(/\*/g, '·').replace(/\^/g, '^').replace(/,/g, '; ').replace(/</g, '<').replace(/>=/g, '≥').replace(/<=/g, '≤'));
        for (const p of row.xp) {
          if (typeof p === 'string') { ex += nice(p); sub += nice(p); continue; }
          if (p.sp) { const v = r0.R.special[p.sp]; ex += `<b>Σ${esc(p.sp)}</b>`; sub += `<span class="xv">${fx(v)}</span>`; continue; }
          const lbl = p.sym || p.id || '?';
          ex += `<span class="xs" title="${esc((p.u ? p.u.code + ' – ' : '') + (p.name || ''))}">${esc(lbl)}</span>`;
          sub += `<span class="xv" title="${esc(lbl + ' – ' + (p.name || ''))}">${typeof p.val === 'number' ? fx(p.val) : esc(p.val)}</span>`;
        }
      }
      const inputs = row.xp ? row.xp.filter(p => p && typeof p === 'object' && !p.sp && p.u) : [];
      rb.innerHTML = `<div class="rb rep" data-nobi="1"><h3>${row.kind === 'note' ? 'Ghi chú' : `${row.sym ? '<span class="code">' + esc(row.sym) + '</span>' : ''}${esc(row.name)}`}</h3>
        ${row.kind !== 'note' ? `<p style="font-size:1.05em">Giá trị: <b>${typeof row.val === 'number' ? fx(row.val) : esc(row.val)}</b> ${esc(row.unit || '')} <span class="hint">(${row.kind === 'in' ? 'ô nhập / lựa chọn thiết kế' : row.kind === 'chk' ? 'kiểm tra tự động' : 'kết quả tính'})</span></p>` : `<p>${esc(row.val)}</p>`}
        ${row.f ? `<p><b>Công thức / cơ sở lựa chọn:</b> ${esc(row.f)}</p>` : ''}
        ${ex ? `<p><b>Biểu thức tính (công thức sống):</b><br><span class="cite-eq">${ex}</span><br><b>Thay số:</b><br><span class="cite-eq">${sub}</span>${typeof row.val === 'number' ? ` = <b>${fx(row.val)}</b> ${esc(row.unit || '')}` : ''}</p>` : ''}
        ${inputs.length ? `<p class="refs"><b>Giá trị dùng trong biểu thức:</b></p><ul class="refs">${[...new Set(inputs)].map(p => `<li>${rowLabel(p.u, p)}${p.src ? ' <span class="hint">[' + esc(p.src) + ']</span>' : ''}</li>`).join('')}</ul>` : ''}
        ${row.src ? `<p><b>Nguồn:</b> ${esc(row.src)}</p>` : ''}
        ${keys.map(k => `<div class="cite-blk"><h4>📖 ${esc(DATA.CITES[k].loc)} – ${esc(DATA.CITES[k].t)}</h4>${DATA.citeHTML(k, esc)}</div>`).join('')}
        ${rules.map(k => `<div class="cite-blk"><h4><span class="code">${k}</span>${esc(DATA.RULES[k].t)}</h4><p>${esc(DATA.RULES[k].d)}</p></div>`).join('')}
        ${!keys.length && !rules.length && !ex ? '<p class="hint">Dòng này không có trích dẫn tài liệu cụ thể (giá trị lựa chọn thiết kế / nhập tay).</p>' : ''}
        <div class="act"><button class="pri" data-ruleclose="1">Đóng</button></div></div>`;
      rb.classList.add('on');
    };
    const goRow = key => {
      closeRule(); if (tab !== 'report') { tab = 'report'; render(); }
      setTimeout(() => { const el = document.querySelector(`tr[data-row="${key}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = '#fff6d6'; setTimeout(() => { el.style.background = ''; }, 2500); } }, 80);
    };
    document.addEventListener('click', e => {
      const a = e.target.closest('a.rule');
      if (a) { e.preventDefault(); showRule(a.dataset.rule); return; }
      const ct = e.target.closest('a.cite');
      if (ct) { e.preventDefault(); showCite(ct.dataset.cite); return; }
      const gr = e.target.closest('[data-gorow]');
      if (gr) { e.preventDefault(); goRow(gr.dataset.gorow); return; }
      const cg = e.target.closest('[data-citego]');
      if (cg) {
        const k = cg.dataset.citego; closeRule(); if (tab !== 'report') { tab = 'report'; render(); }
        setTimeout(() => { const el = document.getElementById('cite-' + k.replace(/[^A-Za-z0-9-]/g, '_')); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.style.background = '#fff6d6'; setTimeout(() => { el.style.background = ''; }, 2500); } }, 80);
        return;
      }
      const cell = e.target.closest('.rep td.f, .rep td.src, .rep td.nt');
      if (cell && !rb.contains(cell)) { const tr = cell.closest('tr[data-row]'); if (tr) { showRow(tr.dataset.row); return; } }
      if (e.target === rb || e.target.closest('[data-ruleclose]')) { closeRule(); return; }
      const go = e.target.closest('[data-rulego]');
      if (go) {
        const k = go.dataset.rulego; closeRule();
        if (tab !== 'report') { tab = 'report'; render(); }
        setTimeout(() => { const el = document.getElementById('rule-' + k); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = '#fff6d6'; setTimeout(() => { el.style.background = ''; }, 2500); } }, 80);
      }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeRule(); });
    const main = $('#main');
    main.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.path) {
        let v = t.value;
        if (t.dataset.path.startsWith('op.meas.') && String(v).trim() === '') { delete S.op.meas[t.dataset.path.slice(8)]; persist(); render(); return; }
        if (t.type === 'number' || t.dataset.t === 'n') { v = parseFloat(String(v).replace(',', '.')); if (isNaN(v)) { render(); return; } }
        if (t.dataset.path === 'std.Kf' && v !== 'auto') v = parseFloat(v);
        setPath(t.dataset.path, v);
        // ô thông số / hiệu suất người dùng nhập tay: quy tắc tự hiệu chỉnh R08 không ghi đè (engine: S.pMan)
        { const pa = t.dataset.path, mk = pa.startsWith('p.') ? pa.slice(2) : /^eff\.[^.]+\.rec$/.test(pa) ? pa : null; if (mk) { S.pMan = S.pMan || {}; S.pMan[mk] = 1; } }
        if (t.dataset.path.startsWith('op.')) { persist(); render(); return; }     // kiểm tra vận hành: không cần tính lại các phương án thiết kế
        if (t.dataset.path.startsWith('input.q.')) S.input.preset = 'custom';
        refresh(); return;
      }
      if (t.dataset.cur !== undefined) { S.cur = +t.dataset.cur; dwgCache = null; persist(); render(); return; }
      const nv = () => { const v = String(t.value).trim().replace(',', '.'); return v === '' ? '' : parseFloat(v); };
      if (t.dataset.eqp !== undefined) { const v = nv(); if (v === '' || isNaN(v)) delete S.opex.equipPrice[t.dataset.eqp]; else S.opex.equipPrice[t.dataset.eqp] = v; refresh(); return; }
      if (t.dataset.hyd !== undefined) { const k = t.dataset.hyd, f = t.dataset.f; S.opex.hydOv[k] = S.opex.hydOv[k] || {}; const v = nv(); if (v === '' || isNaN(v)) delete S.opex.hydOv[k][f]; else S.opex.hydOv[k][f] = v; refresh(); return; }
      if (t.dataset.sp !== undefined) { const k = t.dataset.sp, f = t.dataset.f; S.opex.spareOv[k] = S.opex.spareOv[k] || {}; const v = nv(); if (v === '' || isNaN(v)) delete S.opex.spareOv[k][f]; else S.opex.spareOv[k][f] = v; refresh(); return; }
      if (t.id === 'paper') return;
    });
    main.addEventListener('click', e => {
      const t = e.target.closest('button,[data-sheet],[data-issue]'); if (!t) return;
      const r = cur();
      if (t.dataset.issue !== undefined) {
        issueAlt = t.dataset.issue === 'close' || issueAlt === +t.dataset.issue ? null : +t.dataset.issue;
        render(); const el = document.getElementById('issues'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
      }
      if (t.dataset.fix !== undefined) {
        const fx_ = FIXES[+t.dataset.fix]; if (!fx_) return;
        fx_.fn(S, fx_.ai); refresh(); toast('Đã áp dụng: ' + fx_.label);
        const el = document.getElementById('issues'); if (el) el.scrollIntoView({ block: 'start' }); return;
      }
      if (t.dataset.af !== undefined) { const a = S.alts[+t.dataset.af]; a.c.autoFit = afOn(a) ? 0 : 1; refresh(); toast((afOn(a) ? 'Bật' : 'Tắt') + ' tự giải R08 – ' + a.name); return; }
      if (t.dataset.labadd) { S.opex.labor.push({ name: 'Vị trí mới', n: 1, sal: 8 }); refresh(); return; }
      if (t.dataset.labdel !== undefined) { S.opex.labor.splice(+t.dataset.labdel, 1); refresh(); return; }
      if (t.dataset.cuadd) { S.opex.custom.push({ name: 'Chi phí khác', unit: 'năm', qty: 1, price: 10 }); refresh(); return; }
      if (t.dataset.cudel !== undefined) { S.opex.custom.splice(+t.dataset.cudel, 1); refresh(); return; }
      if (t.dataset.eqreset) { if (confirm(bil('Xóa toàn bộ đơn giá thiết bị nhập tay?'))) { S.opex.equipPrice = {}; refresh(); } return; }
      if (t.dataset.hydreset) { S.opex.hydOv = {}; refresh(); return; }
      if (t.id === 'opsLoad') { if (!r || !r.R) return; if (r.R.alt.c.bio === 'TF' || r.R.alt.c.bio === 'LAG') { toast('Kiểm tra vận hành (mô hình bùn hoạt tính) chưa áp dụng cho lọc sinh học nhỏ giọt / hồ sinh học – chọn phương án bùn hoạt tính.'); return; } const m = (S.op && S.op.meas) || {}; S.op = OPS.fromDesign(S, r.R); S.op.meas = m; persist(); render(); toast('Đã nạp số liệu công trình từ phương án: ' + r.alt.name); return; }
      if (t.id === 'opsQ') { OPS.ensure(S); S.op.q = { ...S.input.q }; S.op.Q = +S.input.Q; S.op.T = +S.input.Tmin; S.op.Tmax = +S.input.Tmax; S.op.kmax = +S.input.kmax; persist(); render(); return; }
      if (t.id === 'opsReset') { if (confirm(bil('Đặt lại toàn bộ số liệu kiểm tra vận hành?'))) { S.op = OPS.defaults(S); persist(); render(); } return; }
      if (t.id === 'opsApply') { const A = OPS.advise(S, OPS.ensure(S)); if (A.o) { const m = S.op.meas; S.op = A.o; S.op.meas = m; persist(); render(); toast('Đã áp dụng các điều kiện vận hành khuyến cáo vào số liệu vận hành.'); } return; }
      if (t.id === 'opsCalApply') {
        const cal = OPS.calibrate(S, OPS.ensure(S)), ch = OPS.calChanges(cal); if (!ch.length) return;
        if (!confirm(bil('Áp dụng các thông số hiệu chỉnh vào thông số thiết kế (tab 4)? Các phương án thiết kế sẽ được tính lại.') + '\n\n' + ch.map(x => `${x.k}: ${x.from} → ${x.to}`).join('\n'))) return;
        for (const x of ch) { S.p[x.k] = x.to; S.pMan = S.pMan || {}; S.pMan[x.k] = 1; }
        S.op.calLog = { date: new Date().toLocaleString('vi-VN'), cond: cal.cond, items: ch.map(x => ({ k: x.k, label: x.label, unit: x.unit, from: x.from, to: x.to, by: x.by })) };
        refresh(); toast('Đã áp dụng ' + ch.length + ' thông số hiệu chỉnh vào thông số thiết kế (tab 4).'); return;
      }
      if (t.id === 'opsXchCur' || t.id === 'opsXchRec') { if (typeof TKX !== 'undefined') TKX.opsMenu(t, t.id === 'opsXchRec' ? 'rec' : 'cur'); return; }
      if (t.id === 'opsXchIn') { if (typeof XCH !== 'undefined') XCH.menu(t, { label: 'Gửi dự án thiết kế (phương án đang xem) sang' }); return; }
      if (t.id === 'opsToDesCur' || t.id === 'opsToDesRec') { if (typeof TKX !== 'undefined') TKX.opsToDesign(t.id === 'opsToDesRec' ? 'rec' : 'cur'); return; }
      if (t.id === 'opsXls') { download(fileBase() + '_KiemTraVanHanh.xlsx', REP.xlsxOps(S)); toast('Đã xuất Excel kiểm tra vận hành & hiệu chỉnh.'); return; }
      if (t.id === 'opsPrint') { let css = ''; for (const sh of document.styleSheets) { try { for (const x of sh.cssRules) css += x.cssText + '\n'; } catch (er) { /* bỏ qua */ } } printPages('Kiểm tra vận hành', `<div id="main">${$('#ops').outerHTML}</div>`, css + '@page{size:A4 portrait;margin:12mm} body{background:#fff} #ops button,.noprint{display:none!important} .card{break-inside:avoid} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}'); return; }
      if (t.id === 'applyPreset') { const k = $('#presetSel').value; if (k !== 'custom') { S.input.q = { ...DATA.INFLUENT_PRESETS[k].v }; S.input.preset = k; if (DATA.INFLUENT_PRESETS[k].type) S.input.wwType = DATA.INFLUENT_PRESETS[k].type; refresh(); } }
      else if (t.id === 'addAlt') { const a = DATA.defaultAlt('PA' + (S.alts.length + 1) + ' – mới', 'AAO'); S.alts.push(a); S.cur = S.alts.length - 1; refresh(); }
      else if (t.dataset.dup !== undefined) { const a = JSON.parse(JSON.stringify(S.alts[+t.dataset.dup])); a.name += ' (bản sao)'; S.alts.splice(+t.dataset.dup + 1, 0, a); refresh(); }
      else if (t.dataset.del !== undefined) { if (confirm(bil('Xóa phương án "' + S.alts[+t.dataset.del].name + '"?'))) { S.alts.splice(+t.dataset.del, 1); S.cur = Math.min(S.cur, S.alts.length - 1); refresh(); } }
      else if (t.dataset.resetg) { const def = DATA.defaultParams(); for (const [k, v] of Object.entries(DATA.P)) if (v[0] === t.dataset.resetg) { S.p[k] = def[k]; if (S.pMan) delete S.pMan[k]; } refresh(); }
      else if (t.dataset.reseteff) { S.eff = JSON.parse(JSON.stringify(DATA.EFF_DEF)); if (S.pMan) for (const k of Object.keys(S.pMan)) if (k.startsWith('eff.')) delete S.pMan[k]; refresh(); }
      else if (t.id === 'xlsCompare') download(fileBase() + '_SoSanhPA.xlsx', REP.xlsxCompare(S, RES.filter(x => x.R)));
      else if (t.id === 'pfdSvg') download(fileBase() + '_' + altTag() + '_PFD.svg', DRW.toSVG(r._pfd), 'image/svg+xml');
      else if (t.id === 'pfdDxf') download(fileBase() + '_' + altTag() + '_PFD.dxf', DRW.toDXF([{ sh: r._pfd }]), 'application/dxf');
      else if (t.id === 'pfdPrint') printPages('PFD', `<div class="pg">${DRW.toSVG(r._pfd, { px: '100%' })}</div>`, '@page{size:A3 landscape;margin:6mm} body{margin:0} .pg svg{width:100%;height:auto}');
      else if (t.id === 'repPrint') printPages('Bản tính ' + r.alt.name, REP.html(S, r.R), reportCss());
      else if (t.id === 'repXls') { download(fileBase() + '_' + altTag() + '_BanTinh.xlsx', REP.xlsx(S, r.R, RES.filter(x => x.R))); toast('Đã xuất Excel bản tính.'); }
      else if (t.id === 'repHtml') download(fileBase() + '_' + altTag() + '_BanTinh.html', `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bản tính</title><style>${reportCss().replace(/@page[^}]*}/, '')}</style></head><body>${REP.html(S, r.R)}</body></html>`, 'text/html');
      else if (t.dataset.sheet !== undefined) showSheet(+t.dataset.sheet);
      else if (t.id === 'dwgDxfAll') { download(fileBase() + '_' + altTag() + '_BanVe.dxf', DRW.toDXF(sheets()), 'application/dxf'); toast('Đã xuất DXF ' + sheets().length + ' tờ (xếp cạnh nhau trong model space).'); }
      else if (t.id === 'dwgDxf') { const s = sheets()[dwgIdx]; download(fileBase() + '_' + s.code + '.dxf', DRW.toDXF([s]), 'application/dxf'); }
      else if (t.id === 'dwgSvg') { const s = sheets()[dwgIdx]; download(fileBase() + '_' + s.code + '.svg', DRW.toSVG(s.sh), 'image/svg+xml'); }
      else if (t.id === 'dwgPrint') { const p = $('#paper').value; const css = p === 'A1' ? '@page{size:841mm 594mm;margin:0} .pg{width:841mm;height:594mm}' : '@page{size:A3 landscape;margin:0} .pg{width:420mm;height:297mm}'; printPages('Bản vẽ', sheets().map(s => `<div class="pg">${DRW.toSVG(s.sh, { px: '100%' })}</div>`).join(''), css + ' body{margin:0} .pg{break-after:page;overflow:hidden} .pg svg{width:100%;height:100%} *{-webkit-print-color-adjust:exact;print-color-adjust:exact}'); }
      else if (t.id === 'zIn') { zoom = Math.min(4, zoom * 1.4); showSheet(dwgIdx); }
      else if (t.id === 'zOut') { zoom = Math.max(0.4, zoom / 1.4); showSheet(dwgIdx); }
      else if (t.id === 'zFit') { zoom = 1; showSheet(dwgIdx); }
    });
    window.addEventListener('resize', () => { if (tab === 'dwg') showSheet(dwgIdx); });
  }

  function init() {
    S = load(); recompute(); bind(); render();
    // song ngữ (js/i18n_core.js dùng chung): VI + EN · VI · EN, tự gắn cho mọi nội dung mới
    BI.boot(); BI.mountSwitch($('#langSw'));
  }
  // refresh/toast/setTab dùng cho bộ chuyển đổi hồ sơ trao đổi (js/xch_tk.js)
  return { init, refresh, toast, setTab: k => { tab = k; render(); $('#main').scrollTop = 0; }, get S() { return S; }, get RES() { return RES; }, get tab() { return tab; } };
})();
document.addEventListener('DOMContentLoaded', APP.init);
