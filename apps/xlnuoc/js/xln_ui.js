'use strict';
/* ==========================================================================
   XLNuoc – giao diện: ① Đầu bài · ② Khuyến cáo công nghệ · ③ Thông số thiết kế · ④ Bảng tính · ⑤ Kiểm tra & tổng hợp · ⑥ Xuất file.
   Trạng thái lưu ở localStorage 'xlnt_xlnuoc_v1' (hoàn tác ↶ ↷, hồ sơ dự án chung qua js/appstate.js).
   ========================================================================== */
const XLNAPP = (() => {
  const STORE = 'xlnt_xlnuoc_v1';
  const $ = s => document.querySelector(s);
  const mode = () => (typeof BI !== 'undefined' ? BI.mode : 'bi');
  const L = (vi, en) => mode() === 'en' ? en : mode() === 'vi' || vi === en ? vi : `${vi}<span class="en">${en}</span>`;
  const T1 = (vi, en) => mode() === 'en' ? en : vi;
  // chuỗi dữ liệu (nhãn bảng tính, công nghệ, kết quả kiểm tra, ghi chú…) dịch theo từ điển chung của bộ phần mềm (js/i18n_dict.js)
  // từ ngữ riêng của XLNuoc khác nghĩa trong từ điển chung (vd. "tấm" = plate, không phải cartridge)
  const LOC = { 'tấm': 'plates', 'tấm/bể': 'plates/tank', 'bể': 'tanks', 'máng': 'troughs', 'dãy': 'trains', 'hệ': 'systems', 'kíp': 'crews', 'lỗ': 'orifices', 'sân': 'yard',
    'bồn': 'tanks', 'tầng': 'floors', 'tr.đ': 'M VND', 'bộ': 'sets', 'tấn': 't', 'cái': 'pcs', 'máy': 'units', 'L/suất': 'L/meal', 'Người/ca': 'Persons/shift', 'TMĐT': 'CAPEX', 'ngăn': 'cells', 'người': 'persons' };
  // số kiểu Việt trong chuỗi kết quả → kiểu Anh (4,2 → 4.2; 5.000 → 5,000)
  const numEn = t => t.replace(/(\d)\.(\d{3})(?!\d)/g, (m, x, y, o, str) => /(^|[^\d.])0$/.test(str.slice(0, o + 1)) ? m : x + ',' + y).replace(/(\d),(\d)(?!\d{2}(?!\d))/g, '$1.$2');
  const HEAD = { 'ĐẠT': 'PASS', 'XEM LẠI': 'REVIEW', 'VƯỢT P9': 'EXCEEDS P9', 'NGOÀI P9': 'OUTSIDE P9', 'THAM KHẢO': 'REFERENCE', 'KHÔNG ĐỦ': 'INSUFFICIENT' };
  const enPart = t => { const e = typeof BI !== 'undefined' ? BI.en(t) : ''; return numEn(e || t); };
  // kết quả kiểm tra: "ĐẠT (…)" / "XEM LẠI – …" / "TẤT CẢ n CHỈ TIÊU ĐỀU ĐẠT" – dịch theo cấu trúc
  function enStatus(v) {
    let m = v.match(/^TẤT CẢ (\d+) CHỈ TIÊU ĐỀU ĐẠT$/); if (m) return `ALL ${m[1]} CHECKS PASSED`;
    m = v.match(/^CÓ (\d+) CHỈ TIÊU CẦN XEM LẠI \/ THAM KHẢO$/); if (m) return `${m[1]} CHECK(S) TO REVIEW / REFERENCE`;
    m = v.match(/^(ĐẠT|XEM LẠI|VƯỢT P9|NGOÀI P9|THAM KHẢO|KHÔNG ĐỦ)\s*(.*)$/); if (!m) return '';
    const r = m[2].trim();
    if (!r) return HEAD[m[1]];
    if (/^\(.*\)$/.test(r)) { const inner = r.slice(1, -1).replace(/^yêu cầu\s*/, ''); return HEAD[m[1]] + ' (' + (/^yêu cầu/.test(r.slice(1)) ? 'required ' : '') + enPart(inner) + ')'; }
    return HEAD[m[1]] + ' – ' + enPart(r.replace(/^[–-]\s*/, ''));
  }
  const ten = s => { if (s == null || s === '') return ''; const v = String(s); if (LOC[v]) return LOC[v]; const e = typeof BI !== 'undefined' ? BI.en(v) : ''; if (e && !/[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/.test(e)) return /^(ĐẠT|XEM LẠI|VƯỢT|NGOÀI|THAM KHẢO|KHÔNG ĐỦ)/.test(v) ? numEn(e) : e; return enStatus(v) || e || ''; };
  const TR = s => { if (s == null || s === '') return ''; const v = String(s), e = ten(v); return mode() === 'en' ? esc(e || v) : mode() === 'vi' || !e ? esc(v) : esc(v) + '<span class="en">' + esc(e) + '</span>'; };
  const TP = s => { const v = String(s == null ? '' : s); return mode() === 'en' ? (ten(v) || v) : v; };   // chữ thuần (option, title, Word)
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const isNum = v => typeof v === 'number' && isFinite(v);
  const fx = (v, d) => {
    if (!isNum(v)) return v == null || v === '' ? '–' : esc(v && v.err ? v.err : v);
    const a = Math.abs(v); if (d === undefined) d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 5;
    return v.toLocaleString(mode() === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: d });
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const SMP = XLNK.SAMPLES;
  function fromSample(x) {
    return { v: 1, sample: x.id, P: Object.assign({ chem: {}, taste: false, uv: false }, clone(x.P)), chain: clone(x.chain || { pre: 'none', mix: 'mech', floc: 'mech', clar: 'texler', filt: 'xa', adv: [], dis: 'naocl', sl: 'centri' }),
      auto: x.auto !== false, ovT: {}, ov: {}, w: { cost: 35, capex: 25, area: 15, robust: 25 }, tab: S0tab(), sheet: null, recDone: false };
  }
  const S0tab = () => (S && S.tab) || 'brief';
  let S = null, M = null, REC = null, timer = 0;
  function load() { try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.P && s.chain) return s; } catch (e) { /* */ } return null; }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* */ } }
  function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { e.hidden = true; }, 3200); }
  const leo = () => XLNG.isLeopold(S.chain);
  const chKey = c => [c.pre, c.mix, c.floc, c.clar, c.filt, (c.adv || []).slice().sort().join('+'), c.dis, c.sl].join('|');

  /* ---------- tính ---------- */
  function compute() {
    try {
      M = leo() ? XLNL.run(Object.assign({}, S.P, { auto: S.auto, ovT: S.ovT })) : XLNG.run(Object.assign({}, S.P, { chain: S.chain, ov: S.ov }));
      M.err = null;
    } catch (e) { console.error(e); M = { err: e.message }; }
  }
  const G = k => { if (!M || M.err) return undefined; const t = M.keys[k]; return t ? M.book.get(t[0], t[1]) : undefined; };
  const checks = () => M && !M.err ? M.checks.map(c => { const t = M.vals[c.sheet][c.addr]; return { l: c.l, t: t && t.err ? t.err : t, ok: typeof t === 'string' && t.startsWith('ĐẠT'), sheet: c.sheet, addr: c.addr }; }) : [];
  function recalc(rerender) { compute(); save(); drawBar(); if (rerender !== false) drawTab(); }
  function later(fn) { clearTimeout(timer); timer = setTimeout(fn, 350); }

  /* ---------- khung ---------- */
  const TABS = [['brief', 'Đầu bài', 'Brief'], ['rec', 'Khuyến cáo công nghệ', 'Technology advice'], ['par', 'Thông số thiết kế', 'Design inputs'], ['sheet', 'Bảng tính', 'Workbook'], ['sum', 'Kiểm tra & tổng hợp', 'Checks & summary'], ['exp', 'Xuất file', 'Export']];
  function drawStatic() {
    document.documentElement.lang = mode() === 'en' ? 'en' : 'vi';
    $('#hP').innerHTML = T1('Thiết kế trạm xử lý nước cấp – MWH · TCXDVN 33:2006 · QCVN 01-1:2018 · Leopold P9; bảng tính Excel công thức sống', 'Water treatment plant design – MWH · TCXDVN 33 · QCVN 01-1 · Leopold P9; live-formula Excel workbook');
    $('#selSample').innerHTML = `<option value="">${esc(T1('Mẫu đầu bài ▾', 'Sample briefs ▾'))}</option>` + SMP.map(x => `<option value="${x.id}">${esc(T1(x.vi, x.en))}</option>`).join('');
    $('#btnNew').innerHTML = '<span class="ic">🆕</span><span class="tx"> ' + T1('Dự án mới', 'New project') + '</span>';
    $('#btnXlsx').innerHTML = '<span class="ic">📊</span><span class="tx"> ' + T1('Xuất Excel', 'Export Excel') + '</span>';
    $('#tabs').innerHTML = TABS.map((t, i) => `<button data-t="${t[0]}" class="${S.tab === t[0] ? 'on' : ''}"><span class="n">${i + 1}</span>${esc(T1(t[1], t[2]))}</button>`).join('');
  }
  function drawBar() {
    const c = checks(), ok = c.filter(x => x.ok).length;
    const pill = M && M.err ? `<span class="pill bad">${esc(M.err)}</span>` : `<span class="pill ${ok === c.length ? 'ok' : 'bad'}">${ok}/${c.length} ${T1('chỉ tiêu ĐẠT', 'checks OK')}</span>`;
    $('#bar').innerHTML = `<span class="ch"><b>${esc(S.P.name || '')}</b> · ${fx(S.P.Q, 0)} m³/${T1('ngđ', 'd')} · ${TR(M && M.chainTxt || XLNG.chainText(S.chain))}</span>${leo() ? `<span class="pill tpl" title="${esc(T1('Cùng dây chuyền với file mẫu – xuất Excel đúng cấu trúc 21 sheet của file mẫu', 'Same train as the template – Excel export keeps the template structure'))}">${T1('Cấu trúc file mẫu 21 sheet', 'Template structure')}${S.auto ? '' : ' · ' + T1('cấu hình gốc', 'original sizing')}</span>` : ''}${pill}
      <span>${T1('TMĐT', 'CAPEX')} <b>${fx(G('cp_TM'), 0)}</b> ${T1('tỷ đ', 'bn VND')}</span><span>${T1('Giá thành', 'Unit cost')} <b>${fx(G('op_full'), 0)}</b> ${T1('đ/m³', 'VND/m³')}</span>`;
  }
  function drawTab() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
    const f = { brief: tBrief, rec: tRec, par: tPar, sheet: tSheet, sum: tSum, exp: tExp }[S.tab] || tBrief;
    const y = scrollY; $('#out').innerHTML = f(); bind(); if (drawTab.keep) scrollTo(0, y); drawTab.keep = false;
  }

  /* ---------- ① đầu bài ---------- */
  const QP = [['NTU', 'Độ đục lớn nhất (mùa lũ)', 'Max turbidity (flood)', 'NTU', 2, ''], ['NTUavg', 'Độ đục trung bình năm', 'Annual mean turbidity', 'NTU', null, ''],
    ['SS', 'Cặn lơ lửng', 'Suspended solids', 'mg/L', null, ''], ['color', 'Độ màu', 'Colour', 'Pt-Co', 15, ''], ['pH', 'pH', 'pH', '–', [6, 8.5], ''], ['T', 'Nhiệt độ thiết kế (thấp nhất)', 'Design temperature (min)', '°C', null, ''],
    ['alk', 'Độ kiềm', 'Alkalinity', 'mg/L CaCO₃', null, ''], ['Fe', 'Sắt tổng', 'Total iron', 'mg/L', 0.3, ''], ['Mn', 'Mangan tổng', 'Total manganese', 'mg/L', 0.1, ''],
    ['NH4', 'Amoni (theo N)', 'Ammonium (as N)', 'mg/L', 0.3, ''], ['TDS', 'Tổng chất rắn hòa tan', 'TDS', 'mg/L', 1000, ''], ['hard', 'Độ cứng tổng', 'Total hardness', 'mg/L CaCO₃', 300, ''],
    ['TOC', 'Tổng cacbon hữu cơ', 'TOC', 'mg/L', null, ''], ['algae', 'Mật độ tảo', 'Algae', 'tb/mL', null, '']];
  function flagOf(k, v) {
    const q = S.P.q;
    switch (k) {
      case 'NTU': return v > 1000 ? T1('> 1.000: bắt buộc lắng sơ bộ', '> 1000: presedimentation') : v > 500 ? T1('> 500: lamen cần lắng sơ bộ', '> 500: lamella needs presettling') : v <= 15 ? T1('≤ 15: có thể lọc trực tiếp', '≤ 15: direct filtration possible') : '';
      case 'Fe': return v > 0.3 ? T1('> 0,3: cần khử sắt', '> 0.3: iron removal') : '';
      case 'Mn': return v > 0.1 ? T1('> 0,1: oxy hóa KMnO₄ + lọc xúc tác', '> 0.1: KMnO₄ + catalytic media') : '';
      case 'NH4': return v > 0.3 ? T1('> 0,3: clo hóa điểm đột biến', '> 0.3: breakpoint chlorination') : '';
      case 'TDS': return v > 1000 ? T1('> 1.000: cần RO', '> 1000: RO needed') : '';
      case 'hard': return v > 300 ? T1('> 300: cân nhắc làm mềm / RO', '> 300: softening / RO') : '';
      case 'TOC': return v > 4 ? T1('> 4: GAC / keo tụ tăng cường', '> 4: GAC / enhanced coagulation') : '';
      case 'algae': return v > 5000 ? T1('> 5.000: ưu tiên DAF', '> 5000: DAF preferred') : '';
      case 'color': return v > 30 ? T1('màu cao: tăng PAC, DAF', 'high colour: more PAC, DAF') : '';
      default: void q; return '';
    }
  }
  const inp = (id, v, t) => `<input data-b="${id}" type="${t || 'number'}" step="any" value="${esc(v == null ? '' : v)}">`;
  function tBrief() {
    const P = S.P, q = P.q;
    const fl = (id, vi, en, v, u, t) => `<div class="f${t === 'text' ? ' w' : ''}"><label>${L(vi, en)}</label>${inp(id, v, t)}${t === 'text' ? '' : `<span class="u">${TR(u || '')}</span>`}</div>`;
    let h = `<div class="grid2"><section class="card"><h2>${L('Dự án và nguồn nước', 'Project and source')}</h2><div class="fl">
      ${fl('name', 'Tên dự án', 'Project name', P.name, '', 'text')}${fl('srcName', 'Tên nguồn nước', 'Source name', P.srcName, '', 'text')}
      <div class="f"><label>${L('Loại nguồn', 'Source type')}</label><select data-b="src"><option value="song"${P.src === 'song' ? ' selected' : ''}>${T1('Nước mặt – sông', 'Surface – river')}</option><option value="ho"${P.src === 'ho' ? ' selected' : ''}>${T1('Nước mặt – hồ chứa', 'Surface – reservoir')}</option><option value="ngam"${P.src === 'ngam' ? ' selected' : ''}>${T1('Nước ngầm', 'Groundwater')}</option></select><span></span></div>
      ${fl('nIntake', 'Số công trình thu', 'Number of intakes', P.nIntake, '')}${fl('MNTN', 'Mực nước thấp nhất tại công trình thu', 'Lowest water level at intake', P.MNTN, 'm')}
      </div></section><section class="card"><h2>${L('Lưu lượng', 'Flow')}</h2><div class="fl">
      ${fl('Q', 'Công suất hữu ích (nước phát vào mạng)', 'Net capacity (to network)', P.Q, 'm³/ngđ')}${fl('Kh', 'Hệ số dùng nước giờ lớn nhất', 'Peak hour factor', P.Kh, '–')}
      ${fl('H2', 'Cột áp bơm cấp II (theo mạng lưới)', 'High-lift pump head', P.H2, 'm')}
      ${fl('PAC', 'Liều PAC lớn nhất (để trống = tự ước tính)', 'Max PAC dose (blank = estimate)', P.chem && P.chem.PAC != null ? P.chem.PAC : '', 'mg/L')}
      <p class="hint">${L('Hệ số dùng nước bản thân a được tự nâng khi nước rửa lọc + xả bùn vượt giả thiết (sheet 02).', 'Self-use factor a is raised automatically when wash + sludge water exceeds it (sheet 02).')}</p>
      </div></section></div>
      <section class="card"><h2>${L('Chất lượng nước nguồn (GIẢ ĐỊNH – thay bằng quan trắc tối thiểu 1 năm)', 'Raw water quality (ASSUMED – replace with ≥ 1 year monitoring)')}</h2><div class="tw"><table class="qtab"><thead><tr><th>${L('Chỉ tiêu', 'Parameter')}</th><th class="n">${L('Giá trị', 'Value')}</th><th>${L('Đơn vị', 'Unit')}</th><th>${L('QCVN 01-1:2018 (nước thành phẩm)', 'QCVN 01-1:2018 (finished)')}</th><th>${L('Ảnh hưởng tới chọn công nghệ', 'Effect on process selection')}</th></tr></thead><tbody>`;
    for (const [k, vi, en, u, lim] of QP) {
      const v = q[k], over = Array.isArray(lim) ? v < lim[0] || v > lim[1] : lim != null && v > lim;
      h += `<tr><td>${L(vi, en)}</td><td class="n">${inp('q.' + k, v)}</td><td class="u">${TR(u)}</td><td class="lim">${lim == null ? '–' : Array.isArray(lim) ? lim.join(' ÷ ') : '≤ ' + fx(lim)}</td><td class="flag${over ? ' over' : ''}">${esc(flagOf(k, v))}</td></tr>`;
    }
    h += `</tbody></table></div></section>
      <section class="card"><h2>${L('Tùy chọn và tiêu chí khuyến cáo', 'Options and ranking weights')}</h2><div class="grid2"><div class="fl">
        <label><input type="checkbox" data-b="taste"${P.taste ? ' checked' : ''}> ${L('Yêu cầu khử mùi vị / thuốc BVTV (thêm GAC)', 'Taste & odour / pesticide removal (add GAC)')}</label>
        <label><input type="checkbox" data-b="uv"${P.uv ? ' checked' : ''}> ${L('Thêm khử trùng UV (rào cản Cryptosporidium)', 'Add UV disinfection (Cryptosporidium barrier)')}</label>
        <p class="hint">${L('Trọng số dùng để xếp hạng phương án ở bước ②. Mọi phương án được dựng và tính bằng cùng bộ module, cùng đơn giá.', 'Weights used to rank options in step ②. All options use the same modules and unit prices.')}</p></div><div class="fl">
        ${[['cost', 'Giá thành nước đầy đủ (VH + khấu hao)', 'Full water cost'], ['capex', 'Vốn đầu tư', 'CAPEX'], ['area', 'Diện tích công trình', 'Footprint'], ['robust', 'An toàn vận hành theo chất lượng nguồn', 'Operational robustness']].map(([k, vi, en]) => `<div class="rng"><span>${L(vi, en)}</span><input type="range" min="0" max="60" step="5" data-w="${k}" value="${S.w[k]}"><b>${S.w[k]}</b></div>`).join('')}
      </div></div><p style="margin:12px 0 0"><button class="pri" data-go="rec">② ${T1('Phân tích & khuyến cáo công nghệ →', 'Analyse & recommend →')}</button></p></section>`;
    return h;
  }

  /* ---------- ② khuyến cáo ---------- */
  const ST = [['pre', 'Tiền xử lý', 'Pre-treatment'], ['mix', 'Trộn nhanh', 'Rapid mix'], ['floc', 'Tạo bông', 'Flocculation'], ['clar', 'Lắng / tuyển nổi', 'Clarification'], ['filt', 'Lọc', 'Filtration'], ['dis', 'Khử trùng', 'Disinfection'], ['sl', 'Xử lý bùn', 'Sludge']];
  function tRec() {
    if (!REC) { REC = XLNK.recommend(S.P, S.w); }
    const cur = chKey(S.chain);
    let h = `<section class="card"><h2>${L('Khuyến cáo theo từng khâu', 'Stage-by-stage advice')}</h2><ul class="w">${REC.notes.map(n => mode() === 'en' ? `<li><b>${esc(n[1])}:</b> ${esc(n[3])}</li>` : mode() === 'vi' ? `<li><b>${esc(n[0])}:</b> ${esc(n[2])}</li>` : `<li><b>${esc(n[0])}:</b> ${esc(n[2])}<span class="en"><b>${esc(n[1])}:</b> ${esc(n[3])}</span></li>`).join('')}</ul></section>`;
    h += `<section class="card"><h2>${L('Xếp hạng các dây chuyền khả thi', 'Ranking of feasible trains')} <small class="hint">(${REC.list.length} ${T1('phương án, đã dựng và tính đầy đủ', 'options fully sized and costed')})</small></h2><div class="tw"><table><thead><tr><th>#</th><th>${L('Dây chuyền', 'Treatment train')}</th><th class="n">${L('Giá thành đầy đủ', 'Full cost')}<br>${T1('đ/m³', 'VND/m³')}</th><th class="n">${L('Chi phí VH', 'OPEX')}<br>${T1('đ/m³', 'VND/m³')}</th><th class="n">${T1('TMĐT', 'CAPEX')}<br>${T1('tỷ đ', 'bn VND')}</th><th class="n">${L('Diện tích ≈', 'Area ≈')}<br>m²</th><th class="n">kWh/m³</th><th class="n">${L('An toàn', 'Robust')}</th><th class="n">${L('Chưa đạt', 'Fails')}</th><th class="n">${L('Điểm', 'Score')}</th><th></th></tr></thead><tbody>`;
    REC.list.slice(0, 14).forEach((r, i) => {
      const isCur = chKey(r.ch) === cur;
      h += `<tr class="${i === 0 ? 'best' : ''}${isCur ? ' cur' : ''}"><td>${i + 1}</td><td>${TR(r.txt)}${r.leo ? ` <span class="pill tpl">${T1('đúng cấu trúc file mẫu', 'template structure')}</span>` : ''}${r.fails.length ? `<div class="hint" title="${esc(r.fails.map(TP).join('\n'))}">⚠ ${r.fails.slice(0, 2).map(TR).join(' · ')}${r.fails.length > 2 ? ' …' : ''}</div>` : ''}</td>
        <td class="n">${fx(r.cost, 0)}</td><td class="n">${fx(r.opex, 0)}</td><td class="n">${fx(r.capex, 1)}</td><td class="n">${fx(r.area, 0)}</td><td class="n">${fx(r.sE, 3)}</td><td class="n">${fx(r.rob * 100, 0)} %</td><td class="n">${r.fails.length}</td><td class="n"><b>${fx(r.score, 1)}</b></td>
        <td>${isCur ? '<span class="pill ok">✔</span>' : `<button data-pick="${i}">${T1('Chọn', 'Use')}</button>`}</td></tr>`;
    });
    h += `</tbody></table></div><p class="hint">${L('Giá thành đầy đủ = chi phí vận hành + khấu hao (XD 25 năm, TB 12 năm). Diện tích ≈ tổng dung tích xây dựng / chiều cao công trình. An toàn: mức chịu sốc độ đục, tảo, nước nguồn trong (CLAUDE §13, MWH). Đơn giá là GIẢ ĐỊNH – sửa ở bước ③.', 'Full cost = OPEX + depreciation. Area ≈ built volume / height. Robustness reflects turbidity shocks, algae, low turbidity. Unit prices are assumptions – edit in step ③.')}</p></section>`;
    // dây chuyền đang chọn
    h += `<section class="card"><h2>${L('Dây chuyền đang chọn – chỉnh tay từng khâu', 'Selected train – manual edit')}</h2><div class="stage">`;
    for (const [k, vi, en] of ST) h += `<div class="f"><label>${L(vi, en)}</label><select data-ch="${k}">${Object.entries(XLNG.TECH[k]).map(([id, t]) => `<option value="${id}"${S.chain[k] === id ? ' selected' : ''}>${esc(TP(t))}</option>`).join('')}</select></div>`;
    h += `<div class="f"><label>${L('Xử lý nâng cao', 'Advanced')}</label><span>${Object.entries(XLNG.TECH.adv).map(([id, t]) => `<label style="display:block"><input type="checkbox" data-adv="${id}"${(S.chain.adv || []).includes(id) ? ' checked' : ''}> ${TR(t)}</label>`).join('')}</span></div></div>`;
    const used = [S.chain.pre, S.chain.clar, S.chain.filt, ...(S.chain.adv || [])].filter(x => x && x !== 'none' || x === 'none' && S.chain.clar === 'none');
    h += `<h3>${L('Ưu – nhược điểm', 'Pros – cons')}</h3><div class="tw"><table><thead><tr><th>${L('Công nghệ', 'Technology')}</th><th>${L('Ưu điểm', 'Pros')}</th><th>${L('Hạn chế', 'Cons')}</th></tr></thead><tbody>${[...new Set(used)].filter(k => XLNK.PROS[k]).map(k => `<tr><td>${TR((XLNG.TECH.clar[k] || XLNG.TECH.filt[k] || XLNG.TECH.pre[k] || XLNG.TECH.adv[k] || k))}</td><td>${TR(XLNK.PROS[k][0])}</td><td>${TR(XLNK.PROS[k][1])}</td></tr>`).join('')}</tbody></table></div>`;
    h += leo() ? `<p class="note">✔ ${L('Dây chuyền trùng file mẫu (Leopold Texler + CT2 + Type XA / IMS 200): bảng tính Excel xuất ra giữ <b>y hệt cấu trúc 21 sheet</b>, công thức của file mẫu; chỉ thay số liệu nhập.', 'Same train as the template: the exported workbook keeps the exact 21-sheet structure and formulas.')}</p>`
      : `<p class="note">${L('Dây chuyền khác file mẫu: bảng tính xuất ra theo cùng quy ước trình bày (sheet 00 – 01 – 02 – 03 – công trình – khử trùng – bùn – cao trình – chi phí – tổng hợp), công thức sống.', 'Train differs from the template: workbook uses the same layout conventions with live formulas.')}</p>`;
    return h + '</section>';
  }

  /* ---------- ③ thông số thiết kế ---------- */
  function tPar() {
    if (!M || M.err) return `<section class="card"><p class="chk-bad">${esc(M && M.err)}</p></section>`;
    const tpl = M.kind === 'tpl';
    let h = `<section class="card"><h2>${L('Thông số thiết kế (ô nhập của bảng tính)', 'Design inputs (workbook input cells)')}</h2>`;
    if (tpl) h += `<label><input type="checkbox" id="cbAuto"${S.auto ? ' checked' : ''}> <b>${L('Tự chọn kích thước theo công suất (khuyến cáo)', 'Auto-size to capacity (recommended)')}</b></label>
      <p class="hint">${L('Bật: phần mềm chọn số bể, kích thước bể trộn, phản ứng, Texler, CT2, bể lọc XA, bơm, bể chứa, bùn, rồi quy đổi các bảng danh sách thiết bị, nhân lực, đường ống, đơn giá theo công suất sao cho 60 chỉ tiêu đều đạt. Tắt: dùng nguyên cấu hình của file mẫu (chỉ thay đầu bài).', 'On: sizes all units and scales auxiliary tables so that all 60 checks pass. Off: keeps the template configuration.')}</p>`;
    h += `<p><button id="btnClr">↺ ${T1('Xóa các giá trị đã sửa tay', 'Clear manual edits')}</button> <span class="hint">${L('Ô viền xanh = bạn đã sửa; nhãn "tự chọn" = phần mềm tính; "mẫu" = giá trị file mẫu / mặc định.', 'Blue outline = edited; "auto" = sized by the app; "template" = default.')}</span></p></section>`;
    const ovs = tpl ? S.ovT : S.ov;
    const groups = {};
    for (const i of M.inputs) {
      const sh = i.s, g = sh === '01_DauVao' || /DauVao/.test(sh) ? (i.sec || sh) : sh + (i.sec ? ' – ' + i.sec : '');
      (groups[g] = groups[g] || []).push(i);
    }
    let n = 0;
    for (const [g, list] of Object.entries(groups)) {
      if (/^00_/.test(g)) continue;
      n++;
      h += `<details class="g"${n <= 3 ? ' open' : ''}><summary>${TR(g)} <small class="hint">(${list.length})</small></summary><div class="tw"><table class="inp"><thead><tr><th>${L('Thông số', 'Parameter')}</th><th>${L('Ký hiệu', 'Symbol')}</th><th class="n">${L('Giá trị', 'Value')}</th><th>${L('Đơn vị', 'Unit')}</th><th></th><th>${L('Ghi chú', 'Note')}</th><th>${L('Ô', 'Cell')}</th></tr></thead><tbody>`;
      for (const i of list) {
        const key = tpl ? i.s + '!' + i.a : i.k, cur = M.book.get(i.s, i.a);
        if (!isNum(cur) && typeof cur !== 'number') continue;
        const user = key && ovs[key] !== undefined, au = tpl ? M.set[key] !== undefined && M.set[key] !== XLNL.DEF[key] : key && M.auto && M.auto[key] !== undefined;
        h += `<tr><td>${TR(i.label)}${i.col ? ` <small class="hint">· ${TR(i.col)}</small>` : ''}</td><td>${esc(i.sym || '')}</td><td class="n"><input data-in="${esc(key || '')}" ${key ? '' : 'disabled'} class="${user ? 'user' : ''}" type="number" step="any" value="${cur}"></td><td class="u">${TR(i.unit || '')}</td>
          <td>${user ? `<span class="src user">${T1('đã sửa', 'edited')}</span> <button data-rs="${esc(key)}" title="${esc(T1('Trả về giá trị tự chọn / mẫu', 'Reset'))}">↺</button>` : au ? `<span class="src auto">${T1('tự chọn', 'auto')}</span>` : `<span class="src tpl">${T1(tpl ? 'mẫu' : 'mặc định', 'default')}</span>`}</td><td class="nt">${TR(i.note || '')}</td><td class="nt">${esc(i.s.replace(/^\d+_/, '') + '!' + i.a)}</td></tr>`;
      }
      h += '</tbody></table></div></details>';
    }
    return h;
  }

  /* ---------- ④ bảng tính ---------- */
  const STY = (() => {
    const m = {};
    const set = (cls, ids) => ids.forEach(i => { m[i] = cls; });
    set('ti', [74]); set('se', [73, 3, 27]); set('hd', [11, 4, 51, 57]); set('in', [5, 14, 16, 17, 18, 19, 20, 21, 54, 55, 60, 61, 67, 71]);
    set('xr', [8, 22, 25, 28, 30, 33, 34, 38, 43, 44, 49, 50, 72]); set('ck', [75, 83]); set('sl', [80, 65, 9]); set('en', [84]); set('nt', [15, 36, 53]); set('inf', [10, 79]);
    return m;
  })();
  const NFS = (() => {
    const m = {}, set = (f, ids) => ids.forEach(i => { m[i] = f; });
    set(0, [17, 25, 26, 49, 52, 54, 62, 65]); set(1, [18, 30, 37, 44, 61, 68, 31, 34, 35, 47]); set(2, [16, 28, 32, 38, 39, 55, 59, 60, 63, 64, 72, 80, 81]); set(3, [20, 24, 43, 50, 66]); set(5, [21, 45]); set(6, [19]);
    set('g', [14, 22, 23, 29, 33, 56, 67]); set('p', [46, 71, 40]); set('e', [41, 69, 42]); set(4, [70]);
    return m;
  })();
  function cellTxt(v, sid) {
    if (!isNum(v)) return v && v.err ? v.err : v == null ? '' : String(v);
    const f = NFS[sid], LC = mode() === 'en' ? 'en-US' : 'vi-VN';
    if (f === 'g') return v.toLocaleString(LC, { maximumFractionDigits: 0 });
    if (f === 'p') return (v * 100).toLocaleString(LC, { maximumFractionDigits: 1 }) + ' %';
    if (f === 'e') return v.toExponential(2).replace('.', LC === 'vi-VN' ? ',' : '.');
    if (typeof f === 'number') return v.toLocaleString(LC, { minimumFractionDigits: f, maximumFractionDigits: f });
    return fx(v);
  }
  function tSheet() {
    if (!M || M.err) return `<section class="card"><p class="chk-bad">${esc(M && M.err)}</p></section>`;
    if (!S.sheet || !M.sheets.includes(S.sheet)) S.sheet = M.sheets.find(s => /TongHop/.test(s)) || M.sheets[0];
    const sh = S.sheet, tpl = M.kind === 'tpl';
    const C = tpl ? M.cells[sh] : M.cells[sh], st = tpl ? XLN_TPL.st[sh] : M.st[sh], mg = tpl ? XLN_TPL.merges[sh] : M.merges[sh], wd = tpl ? XLN_TPL.widths[sh] : M.widths[sh];
    const cn = a => { let n = 0; for (const ch of a.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
    let maxR = 0, maxC = 0;
    for (const a of Object.keys(C)) { const r = +a.match(/\d+$/)[0], c = cn(a); if (r > maxR) maxR = r; if (c > maxC) maxC = c; }
    maxC = Math.min(Math.max(maxC, 6), 18);
    const span = {}, skip = {};
    for (const m of mg || []) {
      const [a, b] = m.split(':'); if (!b) continue;
      const r1 = +a.match(/\d+/)[0], c1 = cn(a), r2 = +b.match(/\d+/)[0], c2 = cn(b);
      span[a] = [r2 - r1 + 1, c2 - c1 + 1];
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) skip[XLNB.colL(c) + r] = 1;
    }
    let h = `<section class="card"><div class="sheets">${M.sheets.map(s => `<button data-sh="${esc(s)}" class="${s === sh ? 'on' : ''}">${esc(s)}</button>`).join('')}</div>
      <p class="hint">${L('Ô vàng chữ xanh = số nhập (sửa ở bước ③); chữ xanh lá = liên kết sheet khác; dòng kiểm tra tô xanh / đỏ. Giá trị do bộ tính công thức của XLNuoc tính – trùng với Excel.', 'Yellow = inputs (edit in step ③); green = cross-sheet links. Values computed by the built-in formula engine (identical to Excel).')}</p>
      <div class="xs"><table><colgroup><col style="width:34px">${Array.from({ length: maxC }, (_, i) => `<col style="width:${Math.round((wd && wd[i] || 9) * 7.2)}px">`).join('')}</colgroup><tbody>`;
    for (let r = 1; r <= maxR; r++) {
      h += `<tr><td class="rn">${r}</td>`;
      for (let c = 1; c <= maxC; c++) {
        const a = XLNB.colL(c) + r; if (skip[a]) continue;
        const x = C[a], sid = st ? st[a] : undefined;
        const v = x ? (x[0] === 'f' ? M.vals[sh][a] : x[1]) : '';
        let cls = STY[sid] || '';
        const txt = cellTxt(v, sid);
        if (cls === 'ck' || (x && x[0] === 'f' && typeof v === 'string' && /^(ĐẠT|XEM LẠI|VƯỢT|KHÔNG|THAM KHẢO|NGOÀI)/.test(v))) cls = 'ck ' + (/^ĐẠT/.test(v) ? 'ok' : 'bad');
        if (isNum(v)) cls += ' num';
        let sp = span[a] ? ` rowspan="${span[a][0]}" colspan="${span[a][1]}"` : '';
        // chữ tràn sang các ô trống bên phải như Excel
        if (!sp && typeof v === 'string' && v && !isNum(v)) {
          let k = c + 1; while (k <= maxC && !C[XLNB.colL(k) + r] && !skip[XLNB.colL(k) + r] && !span[XLNB.colL(k) + r]) k++;
          if (k > c + 1) { sp = ` colspan="${k - c}"`; for (let j = c + 1; j < k; j++) skip[XLNB.colL(j) + r] = 1; }
        }
        h += `<td class="${cls}"${sp}${x && x[0] === 'f' ? ` title="=${esc(x[1])}"` : ''}>${isNum(v) || (c === 3 && /_/.test(txt)) ? esc(txt) : TR(txt)}</td>`;
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div></section>';
  }

  /* ---------- ⑤ kiểm tra & tổng hợp ---------- */
  function notesOf() {
    if (M.kind !== 'tpl') return M.notes || [];
    const C = XLN_TPL.cells['00_HuongDan'], out = [];
    for (let r = 36; r <= 42; r++) if (C['B' + r] && C['B' + r][0] === 's' && /^\d\./.test(C['B' + r][1])) out.push(C['B' + r][1].replace(/^\d\.\s*/, ''));
    return out;
  }
  function tSum() {
    if (!M || M.err) return `<section class="card"><p class="chk-bad">${esc(M && M.err)}</p></section>`;
    const c = checks(), ok = c.filter(x => x.ok).length;
    const k = (vi, en, v, u, d) => `<div class="kpi"><span>${L(vi, en)}</span><b>${fx(v, d)}</b><small>${TR(u)}</small></div>`;
    let h = `<section class="card"><h2>${L('Kết quả chính', 'Key results')}</h2><div class="kpis">
      ${k('Công suất thiết kế', 'Design capacity', G('Qtk'), 'm³/ngđ', 0)}${k('Tổng mức đầu tư', 'Total investment', G('cp_TM'), 'tỷ đ', 1)}${k('Suất đầu tư', 'Specific CAPEX', G('cp_s'), 'tr.đ/(m³/ngđ)', 2)}
      ${k('Chi phí vận hành', 'OPEX', G('op_u'), 'đ/m³', 0)}${k('Giá thành đầy đủ', 'Full cost', G('op_full'), 'đ/m³', 0)}${k('Suất điện năng', 'Specific energy', G('op_sE'), 'kWh/m³', 3)}
      ${k('Bùn khô', 'Dry solids', G('sl_DS'), 'kg DS/ngđ', 0)}${k('Chỉ tiêu đạt', 'Checks passed', ok, '/ ' + c.length, 0)}</div>
      <h3>${L('Công trình chính', 'Main units')}</h3><div class="tw"><table><tbody>${(M.dims || []).map(d => `<tr><td>${TR(d[0])}</td><td class="n">${fx(G(d[1]), 0)}</td><td>${TR(G(d[2]))}</td></tr>`).join('')}</tbody></table></div>
      <h3>${L('Thông số tổng hợp', 'Summary values')}</h3><div class="tw"><table><tbody>${(M.keyRes || []).map(x => `<tr><td>${TR(x[0])}</td><td class="n">${isNum(G(x[1])) ? fx(G(x[1])) : TR(G(x[1]))}</td><td class="u">${TR(x[2])}</td></tr>`).join('')}</tbody></table></div></section>`;
    h += `<section class="card"><h2>${L('Bảng kiểm tra tổng hợp', 'Design check list')} – <span class="${ok === c.length ? 'chk-ok' : 'chk-bad'}">${TR(G('th_end'))}</span></h2><div class="tw"><table><thead><tr><th>#</th><th>${L('Chỉ tiêu', 'Check')}</th><th>${L('Kết quả', 'Result')}</th><th>${L('Sheet', 'Sheet')}</th></tr></thead><tbody>
      ${c.map((x, i) => `<tr><td>${i + 1}</td><td>${TR(x.l)}</td><td class="${x.ok ? 'chk-ok' : 'chk-bad'}">${TR(x.t)}</td><td class="nt"><a href="#" data-goto="${esc(x.sheet)}">${esc(x.sheet + '!' + x.addr)}</a></td></tr>`).join('')}</tbody></table></div></section>`;
    h += `<section class="card"><h2>${L('Giả định cần xác nhận', 'Assumptions to confirm')}</h2><ul class="w">${notesOf().map(n => `<li class="warn">${TR(n)}</li>`).join('')}</ul></section>`;
    return h;
  }

  /* ---------- ⑥ xuất file ---------- */
  function tExp() {
    return `<section class="card"><h2>${L('Xuất file', 'Export')}</h2><div class="fl" style="max-width:820px">
      <p><button class="pri" data-x="xlsx">📊 ${T1('Bảng tính Excel (.xlsx) – công thức sống', 'Excel workbook (.xlsx) – live formulas')}</button><br><span class="hint">${leo() ? L('Cùng dây chuyền với file mẫu → giữ nguyên cấu trúc 21 sheet, định dạng, 1.094 công thức của file mẫu; thay số liệu nhập và giá trị lưu sẵn. Mở bằng Excel sẽ tự tính lại toàn bộ.', 'Template train → keeps the 21-sheet template; inputs and cached values replaced.') : L('Dây chuyền khác file mẫu → bảng tính theo cùng quy ước trình bày, công thức sống, sheet Tổng hợp gom toàn bộ kiểm tra.', 'Other train → same layout conventions, live formulas.')}</span></p>
      <p><button data-x="docx">📄 ${T1('Thuyết minh tóm tắt (.docx)', 'Summary report (.docx)')}</button><br><span class="hint">${L('Đầu bài, lý do chọn công nghệ, xếp hạng phương án, kết quả, bảng kiểm tra, chi phí, giả định.', 'Brief, process selection, ranking, results, checks, cost, assumptions.')}</span></p>
      <p><button data-x="nuoc">🚰 ${T1('Gửi bản tính sang SimNước (mô phỏng)', 'Send workbook to SimNước')}</button> <button data-x="bun">🟫 ${T1('Gửi bùn sang Xử lý bùn', 'Send sludge to Sludge app')}</button><br><span class="hint">${L('SimNước đọc bản tính (tab Bản tính) để dựng sơ đồ mô phỏng và đối chiếu kết quả; Xử lý bùn nhận dòng bùn hóa lý (PAC + cặn).', 'SimNước imports the workbook to build and verify a simulation; the sludge app receives the chemical sludge stream.')}</span></p>
      <p><button data-x="json">💾 ${T1('Lưu dự án (.json)', 'Save project (.json)')}</button></p></div></section>`;
  }
  async function exportXlsx() {
    if (!M || M.err) return;
    $('#out').classList.add('busy');
    try {
      const data = M.kind === 'tpl' ? await XLNL.xlsx(M, S.P) : await XLNB.xlsx(M, M.vals, { title: S.P.name, desc: M.chainTxt });
      const nm = `XLNC${Math.round(S.P.Q)}_Bang-tinh-chi-tiet${M.kind === 'tpl' ? '' : '_' + S.chain.clar + '-' + S.chain.filt}.xlsx`;
      OOXML.save(nm, data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast(T1('Đã xuất ', 'Exported ') + nm);
    } catch (e) { console.error(e); alert(T1('Không xuất được Excel: ', 'Excel export failed: ') + e.message); }
    $('#out').classList.remove('busy');
  }
  async function xlsxB64() { const d = M.kind === 'tpl' ? await XLNL.xlsx(M, S.P) : await XLNB.xlsx(M, M.vals, { title: S.P.name }); return XCH.b64(d.buffer || d); }
  function exportDocx() {
    if (!M || M.err) return;
    if (!REC) REC = XLNK.recommend(S.P, S.w);
    const c = checks(), q = S.P.q, E = mode() === 'en', H = (vi, en) => E ? en : vi, X = v => E ? TP(v) : String(v == null ? '' : v);
    const B = [{ t: 'title', x: H('THUYẾT MINH TÍNH TOÁN CÔNG NGHỆ TRẠM XỬ LÝ NƯỚC CẤP', 'WATER TREATMENT PLANT – PROCESS DESIGN REPORT') }, { t: 'subtitle', x: (S.P.name || '') + ' – ' + fx(S.P.Q, 0) + H(' m³/ngđ', ' m³/d') },
      { t: 'subtitle', x: H('Lập bằng XLNuoc – bộ phần mềm XLN_Ducnv515 v', 'Prepared with XLNuoc – XLN_Ducnv515 suite v') + XLNT_VERSION + ' – ' + new Date().toLocaleDateString(E ? 'en-GB' : 'vi-VN') }, { t: 'toc', x: H('Mục lục', 'Contents') }, { t: 'pb' },
      { t: 'h1', x: H('1. Đầu bài', '1. Design brief') },
      { t: 'p', x: E ? `Source: ${S.P.srcName || ''} (${S.P.src === 'ngam' ? 'groundwater' : 'surface water'}). Net capacity ${fx(S.P.Q, 0)} m³/d, peak hour factor ${fx(S.P.Kh)}.` : `Nguồn nước: ${S.P.srcName || ''} (${S.P.src === 'ngam' ? 'nước ngầm' : 'nước mặt'}). Công suất hữu ích ${fx(S.P.Q, 0)} m³/ngđ, hệ số giờ lớn nhất ${fx(S.P.Kh)}.` },
      { t: 'table', head: [H('Chỉ tiêu', 'Parameter'), H('Giá trị', 'Value'), H('Đơn vị', 'Unit'), 'QCVN 01-1:2018'], w: [4, 1.5, 1.5, 2], num: [1], rows: QP.map(([k, vi, en, u, lim]) => [H(vi, en), fx(q[k]), X(u), lim == null ? '–' : Array.isArray(lim) ? lim.join(' ÷ ') : '≤ ' + fx(lim)]) },
      { t: 'h1', x: H('2. Lựa chọn công nghệ', '2. Process selection') }, { t: 'p', x: H('Dây chuyền chọn: ', 'Selected train: ') + X(M.chainTxt) }, { t: 'bullets', items: REC.notes.map(n => E ? n[1] + ': ' + n[3] : n[0] + ': ' + n[2]) },
      { t: 'h2', x: H('2.1. Xếp hạng các dây chuyền khả thi', '2.1. Ranking of feasible trains') }, { t: 'table', head: ['#', H('Dây chuyền', 'Treatment train'), H('Giá thành đ/m³', 'Full cost VND/m³'), H('TMĐT tỷ đ', 'CAPEX bn VND'), H('Điểm', 'Score')], w: [0.5, 6, 1.5, 1.3, 1], num: [2, 3, 4], rows: REC.list.slice(0, 8).map((r, i) => [String(i + 1), X(r.txt), fx(r.cost, 0), fx(r.capex, 1), fx(r.score, 1)]) },
      { t: 'h1', x: H('3. Kết quả thiết kế', '3. Design results') }, { t: 'table', head: [H('Công trình', 'Unit'), H('Số lượng', 'Number'), H('Kích thước', 'Size')], w: [3, 1, 4], num: [1], rows: (M.dims || []).map(d => [X(d[0]), fx(G(d[1]), 0), X(G(d[2]) || '')]) },
      { t: 'table', head: [H('Thông số', 'Parameter'), H('Giá trị', 'Value'), H('Đơn vị', 'Unit')], w: [5, 2, 2], num: [1], rows: (M.keyRes || []).map(x => [X(x[0]), isNum(G(x[1])) ? fx(G(x[1])) : X(G(x[1])), X(x[2])]) },
      { t: 'h1', x: H('4. Bảng kiểm tra', '4. Check list') }, { t: 'p', x: X(G('th_end') || '') }, { t: 'table', head: ['#', H('Chỉ tiêu', 'Check'), H('Kết quả', 'Result')], w: [0.5, 4, 5], rows: c.map((x, i) => [String(i + 1), X(x.l), X(x.t)]) },
      { t: 'h1', x: H('5. Chi phí sơ bộ', '5. Preliminary cost') }, { t: 'table', head: [H('Chỉ tiêu', 'Item'), H('Giá trị', 'Value'), H('Đơn vị', 'Unit')], w: [5, 2, 2], num: [1], rows: [[H('Tổng mức đầu tư', 'Total investment'), fx(G('cp_TM'), 1), H('tỷ đ', 'bn VND')], [H('Suất đầu tư', 'Specific investment'), fx(G('cp_s'), 2), H('tr.đ/(m³/ngđ)', 'M VND/(m³/d)')], [H('Suất tiêu thụ điện', 'Specific energy'), fx(G('op_sE'), 3), 'kWh/m³'], [H('Chi phí vận hành', 'Operating cost'), fx(G('op_u'), 0), H('đ/m³', 'VND/m³')], [H('Giá thành đầy đủ', 'Full production cost'), fx(G('op_full'), 0), H('đ/m³', 'VND/m³')]] },
      { t: 'h1', x: H('6. Giả định cần xác nhận', '6. Assumptions to confirm') }, { t: 'bullets', items: notesOf().map(X) },
      { t: 'note', x: H('Bảng tính chi tiết: tệp Excel xuất kèm (công thức sống). Kết quả cần kỹ sư có chuyên môn kiểm tra trước khi sử dụng.', 'Detailed calculations: the exported Excel workbook (live formulas). Results must be checked by a qualified engineer before use.') }];
    const data = OOXML.docx(B, { title: H('Thuyết minh – ', 'Report – ') + S.P.name, header: 'XLNuoc – ' + (S.P.name || ''), footer: 'XLN_Ducnv515 v' + XLNT_VERSION });
    OOXML.save(H('ThuyetMinh_XLNC', 'Report_WTP') + Math.round(S.P.Q) + '.docx', data, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }

  /* ---------- sự kiện ---------- */
  function setB(id, v) {
    const P = S.P;
    if (id.startsWith('q.')) P.q[id.slice(2)] = v === '' ? 0 : +v;
    else if (id === 'PAC') { P.chem = P.chem || {}; P.chem.PAC = v === '' ? null : +v; }
    else if (['name', 'srcName', 'src'].includes(id)) P[id] = v;
    else P[id] = v === '' ? null : +v;
    REC = null;
  }
  function bind() {
    const O = $('#out');
    O.querySelectorAll('[data-b]').forEach(e => e.addEventListener('change', () => {
      const id = e.dataset.b; setB(id, e.type === 'checkbox' ? e.checked : e.value);
      if (id === 'Q' && leo() && !S.auto && +e.value !== XLNL.Q0) { S.auto = true; toast(T1('Đổi công suất → bật tự chọn kích thước', 'Capacity changed → auto-sizing on')); }
      later(() => { recalc(false); drawTab.keep = true; drawTab(); });
    }));
    O.querySelectorAll('[data-w]').forEach(e => e.addEventListener('input', () => { S.w[e.dataset.w] = +e.value; e.nextElementSibling.textContent = e.value; REC = null; save(); }));
    O.querySelectorAll('[data-go]').forEach(e => e.addEventListener('click', () => go(e.dataset.go)));
    O.querySelectorAll('[data-pick]').forEach(e => e.addEventListener('click', () => {
      const r = REC.list[+e.dataset.pick]; S.chain = JSON.parse(JSON.stringify(r.ch)); S.ov = {};
      if (XLNG.isLeopold(S.chain)) S.auto = !(S.sample === 'vin500' && S.P.Q === XLNL.Q0) || S.auto;
      recalc(false); drawTab.keep = true; drawTab(); toast(T1('Đã chọn: ', 'Selected: ') + TP(r.txt).slice(0, 100));
    }));
    O.querySelectorAll('[data-ch]').forEach(e => e.addEventListener('change', () => { S.chain[e.dataset.ch] = e.value; S.ov = {}; if (leo() && S.P.Q !== XLNL.Q0) S.auto = true; recalc(false); drawTab.keep = true; drawTab(); }));
    O.querySelectorAll('[data-adv]').forEach(e => e.addEventListener('change', () => { const a = new Set(S.chain.adv || []); if (e.checked) a.add(e.dataset.adv); else a.delete(e.dataset.adv); S.chain.adv = [...a]; S.ov = {}; recalc(false); drawTab.keep = true; drawTab(); }));
    O.querySelectorAll('[data-in]').forEach(e => e.addEventListener('change', () => {
      const k = e.dataset.in; if (!k) return;
      const o = M.kind === 'tpl' ? S.ovT : S.ov;
      if (e.value === '') delete o[k]; else o[k] = +e.value;
      recalc(false); drawTab.keep = true; drawTab();
    }));
    O.querySelectorAll('[data-rs]').forEach(e => e.addEventListener('click', () => { const o = M.kind === 'tpl' ? S.ovT : S.ov; delete o[e.dataset.rs]; recalc(false); drawTab.keep = true; drawTab(); }));
    const ca = $('#cbAuto'); if (ca) ca.addEventListener('change', () => { S.auto = ca.checked; recalc(false); drawTab.keep = true; drawTab(); });
    const bc = $('#btnClr'); if (bc) bc.addEventListener('click', () => { if (M.kind === 'tpl') S.ovT = {}; else S.ov = {}; recalc(); toast(T1('Đã xóa các giá trị sửa tay', 'Manual edits cleared')); });
    O.querySelectorAll('[data-sh]').forEach(e => e.addEventListener('click', () => { S.sheet = e.dataset.sh; save(); drawTab(); }));
    O.querySelectorAll('[data-goto]').forEach(e => e.addEventListener('click', ev => { ev.preventDefault(); S.sheet = e.dataset.goto; go('sheet'); }));
    O.querySelectorAll('[data-x]').forEach(e => e.addEventListener('click', () => {
      const x = e.dataset.x;
      if (x === 'xlsx') exportXlsx(); else if (x === 'docx') exportDocx(); else if (x === 'json') STATE.saveFile();
      else if (typeof XCH !== 'undefined') XCH.send(x);
    }));
  }
  function go(t) { S.tab = t; save(); drawTab(); scrollTo(0, 0); }
  function newProject() {
    S = fromSample(SMP[1]); S.sample = ''; S.P.name = T1('Dự án mới', 'New project'); REC = null; recalc(); go('brief');
  }
  function applySample(id) {
    const x = SMP.find(s => s.id === id); if (!x) return;
    const tab = S.tab; S = fromSample(x); S.tab = tab;
    if (x.chain) S.chain = clone(x.chain);
    else { const r = XLNK.recommend(S.P, S.w); REC = r; if (r.list[0]) S.chain = clone(r.list[0].ch); }
    if (!x.chain) S.recDone = true; else REC = null;
    recalc(); toast(T1('Đã nạp mẫu: ', 'Sample loaded: ') + T1(x.vi, x.en));
  }
  function renderAll() { drawStatic(); drawBar(); drawTab(); }
  function init() {
    S = load() || fromSample(SMP[0]);
    if (typeof BI !== 'undefined') { BI.boot(); BI.mountSwitch($('#acts')); BI.onMode(() => renderAll()); }
    compute();
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.t); });
    $('#selSample').addEventListener('change', e => { const v = e.target.value; e.target.value = ''; if (v) applySample(v); });
    $('#btnNew').addEventListener('click', newProject);
    $('#btnXlsx').addEventListener('click', exportXlsx);
    renderAll();
    if (typeof XLNT_FIT === 'function') XLNT_FIT('#hin', 3, 'fit');
  }
  return {
    init, toast, renderAll, get S() { return S; }, get M() { return M; }, G, checks, xlsxB64, exportXlsx, exportDocx,
    apply(o) { Object.assign(S.P, o); REC = null; recalc(); }, reload() { S = load() || fromSample(SMP[0]); REC = null; compute(); renderAll(); return true; }
  };
})();
