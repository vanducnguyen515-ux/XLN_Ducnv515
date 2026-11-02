'use strict';
/* ==========================================================================
   Khung bộ phần mềm – các chức năng toàn bộ phần mềm (suite.html, dùng SUITE.pull):
   ① Hồ sơ dự án chung (.xlntproj.json): trạng thái đầy đủ của 9 phần mềm trong một tệp.
   ② So sánh phương án công nghệ: hồ sơ hiện tại của Thiết kế XLNT, AquaDesign, ICEAS, NEREDA, SimXLNT đặt cạnh nhau.
   ③ Dự toán CAPEX / OPEX / chi phí vòng đời (NPV) theo đơn giá người dùng sửa được.
   ④ Báo cáo tổng hợp toàn trạm (Word / in PDF), có mục lục và số phiên bản.
   ⑤ Trắc dọc thủy lực toàn trạm (js/hydro.js).
   ========================================================================== */
const HUB = (() => {
  const S = window.SUITE;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = v => v != null && v !== '' && isFinite(+v);
  const f = (v, d) => {
    if (!num(v)) return '–';
    const a = Math.abs(+v); d = d != null ? d : a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return (+v).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const ver = () => (typeof XLNT_VERSION !== 'undefined' ? XLNT_VERSION : '');
  const NAME = id => (S.APPS.find(a => a.id === id) || { name: id }).name;
  const DESIGN = ['thietke', 'aqua', 'iceas', 'nereda', 'sim'];
  const ALL = ['thietke', 'aqua', 'iceas', 'nereda', 'sim', 'aer', 'bun', 'khi', 'xlnuoc'];
  const TECH = { ICEAS: 'ICEAS', CTECH: 'C-Tech', SBR: 'SBR', CAS: 'Bùn hoạt tính', AO: 'AO (MLE)', AAO: 'A²O', OD: 'Mương oxy hóa', MBR: 'AO-MBR', KMBR: 'MBR Kubota', MBBR: 'AO-MBBR', ORG: 'Organica', BIOP: 'Biopolus', AGS: 'NEREDA® AGS' };
  let R = {}, RT = null, tab = 'cmp';

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/octet-stream' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

  /* ================= ① hồ sơ dự án chung ================= */
  async function projSave() {
    S.toast('Đang thu trạng thái các phần mềm… · Collecting');
    const apps = {}, miss = [];
    for (const a of S.APPS) {
      const r = await S.pull(a.id, 'state');
      if (r.state) apps[a.id] = r.state; else miss.push(a.name + ': ' + (r.err || '?'));
    }
    let name = '';
    try { const r = await S.pull('thietke', 'rec'); name = r.rec && r.rec.project && r.rec.project.name || ''; } catch (e) { /* */ }
    const hub = {}; for (const k of ['xlnt_hub_price', 'xlnt_hub_hydro']) { try { const v = localStorage.getItem(k); if (v) hub[k] = v; } catch (e) { /* */ } }
    const P = { schema: 'xlnt-project', ver: ver(), time: new Date().toISOString(), name, apps, hub };
    download((name || 'DuAn').replace(/[^\w\-À-ỹ]+/g, '_').slice(0, 40) + '_' + stamp() + '.xlntproj.json', JSON.stringify(P), 'application/json');
    S.toast(`Đã lưu hồ sơ dự án chung (${Object.keys(apps).length} phần mềm)` + (miss.length ? ' – thiếu: ' + miss.join('; ') : ''));
  }
  function projOpen() {
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json,.xlntproj';
    fi.onchange = () => {
      const file = fi.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = async () => {
        let P; try { P = JSON.parse(rd.result); } catch (e) { alert('Tệp không đọc được: ' + e.message); return; }
        if (!P || P.schema !== 'xlnt-project' || !P.apps) { alert('Tệp không phải hồ sơ dự án chung của bộ phần mềm (.xlntproj.json).\nHồ sơ trao đổi .xlnt.json mở bằng nút ⇄ Trao đổi trong từng phần mềm.'); return; }
        const ids = Object.keys(P.apps).filter(id => S.APPS.some(a => a.id === id));
        const vn = P.ver && P.ver !== ver() ? `\n\n⚠ Hồ sơ lập bằng phiên bản v${P.ver}, phiên bản đang chạy v${ver()}.` : !P.ver ? '\n\n⚠ Hồ sơ không ghi phiên bản.' : '';
        if (!confirm(`Mở hồ sơ dự án chung "${P.name || file.name}" (${new Date(P.time).toLocaleString('vi-VN')})?\n\nTrạng thái hiện tại của ${ids.length} phần mềm sẽ được thay bằng hồ sơ: ${ids.map(NAME).join(', ')}.${vn}\n\n(Có thể hoàn tác trong từng phần mềm bằng ↶.)`)) return;
        const bad = [];
        for (const id of ids) { const r = await S.pull(id, 'setstate', P.apps[id]); if (!r.ok) bad.push(NAME(id) + ': ' + (r.err || '?')); }
        if (P.hub) for (const [k, v] of Object.entries(P.hub)) if (/^xlnt_hub_/.test(k)) { try { localStorage.setItem(k, v); } catch (e) { /* */ } }
        if (typeof HYDRO !== 'undefined' && P.hub && P.hub.xlnt_hub_hydro) { try { HYDRO.data = JSON.parse(P.hub.xlnt_hub_hydro); } catch (e) { /* */ } }
        R = {}; RT = null;
        S.toast(bad.length ? 'Đã mở, lỗi: ' + bad.join('; ') : `Đã mở hồ sơ dự án chung – ${ids.length} phần mềm được nạp lại`);
      };
      rd.readAsText(file);
    };
    fi.click();
  }

  /* ================= thu hồ sơ các phần mềm ================= */
  async function refresh() {
    $('#hubBody').innerHTML = '<p class="hub-note">⏳ Đang lấy kết quả hiện tại của các phần mềm (mở ngầm phần mềm chưa mở)…</p>';
    R = {};
    for (const id of ALL) { const r = await S.pull(id, 'rec', null, 30000); if (r.rec) R[id] = r.rec; }
    RT = new Date(); draw();
  }

  /* ================= ② so sánh phương án ================= */
  const V = r => num(r.res && r.res.Vbio) ? +r.res.Vbio : num(r.des && r.des.Vtot) ? +r.des.Vtot :
    (r.des && [r.des.Vkk, r.des.Vtk, r.des.Vhk].some(num) ? (+r.des.Vkk || 0) + (+r.des.Vtk || 0) + (+r.des.Vhk || 0) : null);
  const Q = r => r.flow && num(r.flow.Q) ? +r.flow.Q : null;
  const kWh = r => num(r.res && r.res.kWh) ? +r.res.kWh : null;
  const air = r => num(r.res && r.res.air) ? +r.res.air : r.air && num(r.air.Qair) ? r.air.Qair * 24 : null;
  const effOf = (r, k) => r.res && r.res.eff && num(r.res.eff[k]) ? +r.res.eff[k] : null;
  const limOf = (r, k) => r.lim && num(r.lim[k]) ? +r.lim[k] : null;
  function options() { return DESIGN.filter(id => R[id] && (V(R[id]) || (R[id].res && R[id].res.eff))); }
  // [nhãn, đơn vị, hàm, chiều tốt: -1 nhỏ hơn tốt / 0 không xếp hạng]
  const ROWS = [
    ['Công nghệ', '', r => TECH[r.tech] || r.tech || '–', 0, 1],
    ['Lưu lượng Q', 'm³/ngày', Q, 0],
    ['Thể tích sinh học', 'm³', V, -1],
    ['Thời gian lưu nước HRT', 'h', r => V(r) && Q(r) ? V(r) / Q(r) * 24 : null, -1],
    ['Diện tích bể (V/H)', 'm²', r => V(r) && r.des && num(r.des.H) && +r.des.H > 0 ? V(r) / r.des.H : null, -1],
    ['Tuổi bùn SRT', 'ngày', r => r.res && num(r.res.SRT) ? r.res.SRT : r.des && r.des.SRT, 0],
    ['Tuổi bùn hiếu khí', 'ngày', r => r.res && num(r.res.SRTaer) ? r.res.SRTaer : r.des && r.des.SRTaer, 0],
    ['MLSS', 'mg/L', r => r.res && num(r.res.MLSS) ? r.res.MLSS : r.des && r.des.MLSS, 0],
    ['Bùn dư', 'kgTSS/ngày', r => r.res && r.res.PX, 0],
    ['Bùn dư riêng', 'g TSS/m³', r => r.res && num(r.res.PX) && Q(r) ? r.res.PX / Q(r) * 1000 : null, -1],
    ['Nhu cầu O₂', 'kgO₂/ngày', r => r.res && r.res.OTR, 0],
    ['O₂ riêng', 'g O₂/m³', r => r.res && num(r.res.OTR) && Q(r) ? r.res.OTR / Q(r) * 1000 : null, -1],
    ['Khí cấp', 'm³/ngày', air, 0],
    ['Điện máy thổi', 'kWh/ngày', kWh, 0],
    ['Điện máy thổi riêng', 'kWh/m³', r => kWh(r) && Q(r) ? kWh(r) / Q(r) : null, -1],
    ['Hóa chất keo tụ (Al/Fe)', 'kg/ngày', r => r.chem && (num(r.chem.Al) || num(r.chem.Fe)) ? (+r.chem.Al || 0) + (+r.chem.Fe || 0) : null, -1],
    ['Carbon bổ sung', 'kgCOD/ngày', r => r.chem && r.chem.Cext, -1],
    ['Kiềm NaOH', 'kg/ngày', r => r.chem && r.chem.NaOH, -1]
  ];
  const EFF = [['COD', 'COD'], ['BOD', 'BOD₅'], ['TSS', 'TSS'], ['NH4', 'NH₄-N'], ['TN', 'TN'], ['TP', 'TP']];
  function compliance(r) {
    let n = 0, bad = 0;
    for (const [k] of EFF) { const e = effOf(r, k), l = limOf(r, k); if (num(e) && num(l)) { n++; if (e > l * 1.0001) bad++; } }
    return { n, bad };
  }
  function score(ids) {
    // điểm 0–100: trung bình (giá trị tốt nhất / giá trị phương án) trên các dòng có xếp hạng, trừ 10 điểm mỗi chỉ tiêu vượt giới hạn
    const sc = {};
    for (const id of ids) {
      let s = 0, n = 0;
      for (const row of ROWS) {
        if (row[3] !== -1) continue;
        const vals = ids.map(j => row[2](R[j])).filter(x => num(x) && x > 0);
        const v = row[2](R[id]);
        if (vals.length < 2 || !num(v) || v <= 0) continue;
        s += Math.min(...vals) / v; n++;
      }
      const c = compliance(R[id]);
      sc[id] = n ? Math.max(0, Math.round(100 * s / n - 10 * c.bad)) : null;
    }
    return sc;
  }
  function cmpTable(forReport) {
    const ids = options();
    if (!ids.length) return '<p>Chưa có phương án: hãy tính ở Thiết kế XLNT / AquaDesign / ICEAS / NEREDA / SimXLNT rồi bấm ⟳ Cập nhật.</p>';
    const qs = [...new Set(ids.map(id => Math.round(Q(R[id]) || 0)))];
    const sc = score(ids);
    let h = qs.length > 1 ? `<p class="hub-warn">⚠ Các phương án đang tính cho lưu lượng khác nhau (${qs.map(q => f(q, 0)).join(' / ')} m³/ngày) – so sánh theo chỉ tiêu riêng (/m³). Muốn so sánh trực tiếp: gửi cùng một đầu bài từ một phần mềm sang các phần mềm khác bằng ⇄ Trao đổi.</p>` : '';
    h += `<div class="hub-tw"><table class="hub-t"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th>${ids.map(id => `<th>${esc(NAME(id))}<br><small>${esc((R[id].project && R[id].project.name) || '')}</small></th>`).join('')}</tr></thead><tbody>`;
    for (const [l, u, fn, dir, txt] of ROWS) {
      const vals = ids.map(id => { try { return fn(R[id]); } catch (e) { return null; } });
      if (vals.every(v => v == null || v === '–')) continue;
      const nums = vals.filter(v => num(v) && v > 0), best = dir === -1 && nums.length > 1 ? Math.min(...nums) : null;
      h += `<tr><td>${esc(l)}</td><td class="u">${esc(u)}</td>${vals.map(v => `<td class="n${best != null && num(v) && Math.abs(v - best) < 1e-9 ? ' best' : ''}">${txt ? esc(v) : f(v)}</td>`).join('')}</tr>`;
    }
    h += `<tr class="sec"><td colspan="${ids.length + 2}">Chất lượng nước ra (kết quả / giới hạn)</td></tr>`;
    for (const [k, l] of EFF) {
      if (ids.every(id => effOf(R[id], k) == null)) continue;
      h += `<tr><td>${l}</td><td class="u">mg/L</td>${ids.map(id => { const e = effOf(R[id], k), m = limOf(R[id], k); return `<td class="n${num(e) && num(m) && e > m * 1.0001 ? ' over' : ''}">${f(e)}${num(m) ? ' <small>/ ' + f(m) + '</small>' : ''}</td>`; }).join('')}</tr>`;
    }
    h += `<tr class="tot"><td>Điểm tổng hợp</td><td class="u">0–100</td>${ids.map(id => `<td class="n">${sc[id] == null ? '–' : sc[id]}</td>`).join('')}</tr>`;
    h += `</tbody></table></div>`;
    if (!forReport) h += `<p class="hub-note">Ô xanh: tốt nhất trong các phương án (nhỏ hơn tốt hơn). Ô đỏ: vượt giới hạn xả. Điểm tổng hợp = trung bình (giá trị tốt nhất / giá trị phương án) trên các chỉ tiêu xếp hạng
      (thể tích, HRT, diện tích, bùn riêng, O₂ riêng, điện riêng, hóa chất), trừ 10 điểm cho mỗi chỉ tiêu nước ra vượt giới hạn. Đây là gợi ý sàng lọc, cần xem cùng dự toán chi phí và điều kiện mặt bằng.</p>`;
    return h;
  }

  /* ================= ③ dự toán CAPEX / OPEX ================= */
  // đơn giá tham khảo (VNĐ) – người dùng sửa trong bảng, lưu ở trình duyệt
  const PR0 = {
    civ: [3.2e6, 'Bể BTCT (sinh học, lắng)', 'đ/m³ bể'],
    aer: [0.6e6, 'Hệ cấp khí (máy thổi + đĩa + ống)', 'đ/(m³/h khí)'],
    mem: [1.6e6, 'Màng MBR', 'đ/m² màng'],
    mech: [30, 'Cơ điện, đường ống, điều khiển khác', '% phần xây dựng'],
    sl: [1.5e6, 'Xử lý bùn (cô đặc + khử nước)', 'đ/(kgTSS/ngày)'],
    oth: [20, 'Chi phí khác (thiết kế, QLDA, dự phòng)', '% CAPEX'],
    el: [2200, 'Giá điện', 'đ/kWh'],
    elx: [0.12, 'Điện ngoài máy thổi (bơm, khuấy, xử lý bùn)', 'kWh/m³'],
    al: [8000, 'Hóa chất keo tụ (tính theo Al/Fe)', 'đ/kg kim loại'],
    c: [9000, 'Carbon bổ sung', 'đ/kgCOD'],
    naoh: [14000, 'NaOH', 'đ/kg'],
    cake: [700000, 'Vận chuyển, xử lý bánh bùn (20 % DS)', 'đ/tấn bánh'],
    om: [1.5, 'Bảo trì', '% CAPEX/năm'],
    lab: [4, 'Nhân công vận hành (tối thiểu 3 người)', 'người / 10.000 m³/ngày'],
    sal: [150e6, 'Lương bình quân', 'đ/người/năm'],
    yrs: [20, 'Thời gian tính', 'năm'],
    r: [8, 'Lãi suất chiết khấu', '%/năm'],
    esc: [3, 'Trượt giá chi phí vận hành', '%/năm']
  };
  let PR = {};
  function prices() { try { PR = Object.assign({}, JSON.parse(localStorage.getItem('xlnt_hub_price') || '{}')); } catch (e) { PR = {}; } return PR; }
  const p = k => num(PR[k]) ? +PR[k] : PR0[k][0];
  function cost(r) {
    const v = V(r) || 0, q = Q(r) || 0, d = r.des || {};
    const vcl = num(d.Acl) && num(d.Hcl) ? d.Acl * d.Hcl * (d.nCl || 1) : 0;
    const qair = r.air && num(r.air.Qair) ? +r.air.Qair : air(r) ? air(r) / 24 : r.res && num(r.res.OTR) ? r.res.OTR / 24 / 0.0279 / 0.2 : 0;   // ước tính từ O₂ khi không có khí: 27,9 gO₂/m³ × SOTE 20 %
    const amem = num(d.Am) ? +d.Am : 0;
    const PX = r.res && num(r.res.PX) ? +r.res.PX : 0;
    const civ = (v + vcl) * p('civ'), aerC = qair * p('aer'), memC = amem * p('mem');
    const mech = civ * p('mech') / 100, slC = PX * p('sl');
    const sub = civ + aerC + memC + mech + slC, capex = sub * (1 + p('oth') / 100);
    const kwhB = kWh(r) != null ? kWh(r) : r.res && num(r.res.OTR) ? r.res.OTR / 1.6 : 0;   // không có điện: O₂ / 1,6 kgO₂/kWh (hiệu suất hiện trường)
    const elY = (kwhB + p('elx') * q) * 365 * p('el');
    const ch = r.chem || {};
    const chY = (((+ch.Al || 0) + (+ch.Fe || 0)) * p('al') + (+ch.Cext || 0) * p('c') + (+ch.NaOH || 0) * p('naoh')) * 365;
    const slY = PX / 0.2 / 1000 * 365 * p('cake');
    const omY = capex * p('om') / 100, labY = Math.max(3, Math.round(p('lab') * q / 10000)) * p('sal');
    const opex = elY + chY + slY + omY + labY;
    const n = p('yrs'), i = p('r') / 100, e = p('esc') / 100;
    let pv = 0; for (let t = 1; t <= n; t++) pv += opex * Math.pow(1 + e, t - 1) / Math.pow(1 + i, t);
    const npv = capex + pv, crf = i > 0 ? i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1) : 1 / n;
    const unit = q > 0 ? (npv * crf) / (q * 365) : null;
    return { civ, aerC, memC, mech, slC, capex, elY, chY, slY, omY, labY, opex, npv, unit, qair, kwhB, est: kWh(r) == null && !!(r.res && num(r.res.OTR)), nores: kWh(r) == null && !(r.res && num(r.res.OTR)) };
  }
  function costTable(forReport) {
    prices();
    const ids = options();
    if (!ids.length) return '<p>Chưa có phương án để dự toán.</p>';
    const C = Object.fromEntries(ids.map(id => [id, cost(R[id])]));
    const ty = v => num(v) ? f(v / 1e9, 2) : '–', tr = v => num(v) ? f(v / 1e6, 0) : '–';
    const rows = [['sec', 'CAPEX – vốn đầu tư (tỷ đồng)'], ['civ', 'Bể BTCT', ty], ['aerC', 'Hệ cấp khí', ty], ['memC', 'Màng MBR', ty], ['mech', 'Cơ điện, đường ống khác', ty], ['slC', 'Xử lý bùn', ty], ['capex', 'Tổng CAPEX (gồm chi phí khác)', ty, 1],
      ['sec', 'OPEX – chi phí vận hành năm đầu (triệu đồng/năm)'], ['elY', 'Điện', tr], ['chY', 'Hóa chất', tr], ['slY', 'Bánh bùn', tr], ['omY', 'Bảo trì', tr], ['labY', 'Nhân công', tr], ['opex', 'Tổng OPEX', tr, 1],
      ['sec', 'Chi phí vòng đời'], ['npv', `Giá trị hiện tại ${p('yrs')} năm (tỷ đồng)`, ty, 1], ['unit', 'Chi phí quy đổi (đ/m³ nước thải)', v => f(v, 0), 1]];
    let h = `<div class="hub-tw"><table class="hub-t"><thead><tr><th>Hạng mục</th>${ids.map(id => `<th>${esc(NAME(id))}<br><small>${esc(TECH[R[id].tech] || R[id].tech || '')}</small></th>`).join('')}</tr></thead><tbody>`;
    for (const [k, l, fm, tot] of rows) {
      if (k === 'sec') { h += `<tr class="sec"><td colspan="${ids.length + 1}">${esc(l)}</td></tr>`; continue; }
      const vals = ids.map(id => C[id][k]);
      if (vals.every(v => !v)) continue;
      const nz = vals.filter(v => num(v) && v > 0), best = tot && nz.length > 1 ? Math.min(...nz) : null;
      h += `<tr${tot ? ' class="tot"' : ''}><td>${esc(l)}</td>${vals.map(v => `<td class="n${best != null && v === best ? ' best' : ''}">${fm(v)}</td>`).join('')}</tr>`;
    }
    h += `</tbody></table></div>`;
    const est = ids.filter(id => C[id].est);
    if (est.length) h += `<p class="hub-note">* ${est.map(NAME).join(', ')}: chưa có điện máy thổi trong hồ sơ – ước tính từ nhu cầu O₂ (1,6 kgO₂/kWh).</p>`;
    const nr = ids.filter(id => C[id].nores);
    if (nr.length) h += `<p class="hub-warn">⚠ ${nr.map(NAME).join(', ')}: chưa có kết quả O₂ / bùn dư (vd. SimXLNT chưa chạy mô phỏng) – dự toán chỉ gồm phần xây dựng và điện ngoài máy thổi, chưa so sánh được.</p>`;
    if (!forReport) {
      h += `<h4>Đơn giá (tham khảo – sửa theo dự án; lưu ở trình duyệt này)</h4><div class="hub-tw"><table class="hub-t hub-pr"><tbody>` +
        Object.entries(PR0).map(([k, [v0, l, u]]) => `<tr><td>${esc(l)}</td><td><input data-pr="${k}" type="number" step="any" value="${num(PR[k]) ? PR[k] : v0}"></td><td class="u">${esc(u)}</td></tr>`).join('') +
        `</tbody></table></div><p><button type="button" id="hubPr0">Về đơn giá mặc định</button></p>
        <p class="hub-note">Dự toán sơ bộ (±30 %) để so sánh phương án: CAPEX theo thể tích bể (sinh học + lắng), khí cấp, diện tích màng, bùn dư; OPEX gồm điện (máy thổi + phần ngoài máy thổi),
        hóa chất, bánh bùn 20 % DS, bảo trì, nhân công; giá trị hiện tại = CAPEX + Σ OPEX·(1+trượt giá)^(t−1)/(1+r)^t; chi phí quy đổi = giá trị hiện tại × hệ số hoàn vốn / (Q × 365).</p>`;
    }
    return h;
  }

  /* ================= ④ báo cáo tổng hợp ================= */
  function appChapter(id, r) {
    const kv = [];
    const add = (l, v, u) => { if (v != null && v !== '' && !(typeof v === 'number' && !isFinite(v))) kv.push([l, typeof v === 'number' ? f(v) : esc(v), u || '']); };
    add('Dự án', r.project && r.project.name); add('Công nghệ', TECH[r.tech] || r.tech); add('Lưu lượng Q', Q(r), 'm³/ngày');
    if (r.temp) { add('Nhiệt độ thấp nhất', r.temp.Tmin, '°C'); add('Nhiệt độ thiết kế', r.temp.Tdes, '°C'); }
    add('Thể tích sinh học', V(r), 'm³');
    const d = r.des || {}; add('Số bể', d.N); add('Chiều sâu nước', d.H, 'm'); if (num(d.L)) add('Kích thước bể L × W', f(d.L) + ' × ' + f(d.W), 'm');
    const s = r.res || {}; add('Tuổi bùn SRT', s.SRT, 'ngày'); add('MLSS', s.MLSS, 'mg/L'); add('Bùn dư', s.PX, 'kgTSS/ngày'); add('Nhu cầu O₂', s.OTR, 'kgO₂/ngày'); add('Khí cấp', air(r), 'm³/ngày'); add('Điện máy thổi', s.kWh, 'kWh/ngày');
    const x = r.extra || {};
    if (x.aer) { add('Thiết bị phân phối khí', x.aer.techName); add('Số đĩa', x.aer.nDiff); add('Máy thổi', x.aer.blower); add('Số máy chạy / dự phòng', x.aer.nDuty + ' / ' + x.aer.nStby); add('Khí TB / max', f(x.aer.Qavg) + ' / ' + f(x.aer.Qpk), 'Nm³/h'); add('Điện năng hệ cấp khí', x.aer.kWhY, 'kWh/năm'); }
    if (x.bun) { add('Bánh bùn', x.bun.cake_t, 'tấn DS/ngày'); add('Độ khô bánh bùn', x.bun.cakeDS, '%'); add('Biogas', x.bun.biogas, 'm³/ngày'); add('Nước tách bùn', x.bun.rejectQ, 'm³/ngày'); add('NH₄-N nước tách', x.bun.rejectNH4, 'mg/L'); }
    if (x.khi) { add('Lưu lượng khí mùi', x.khi.Qodor, 'm³/h'); add('H₂S hỗn hợp', x.khi.H2S, 'ppmv'); add('Điện hệ khử mùi', x.khi.kWhY, 'kWh/năm'); add('Phát thải KNK', x.khi.tCO2e, 't CO₂e/năm'); }
    if (x.xlnuoc) { add('Tổng mức đầu tư sơ bộ', x.xlnuoc.capex, 'tỷ đ'); add('Suất đầu tư', x.xlnuoc.sCapex, 'tr.đ/(m³/ngđ)'); add('Chi phí vận hành', x.xlnuoc.opex, 'đ/m³'); add('Giá thành đầy đủ', x.xlnuoc.full, 'đ/m³'); add('Suất tiêu thụ điện', x.xlnuoc.kWhm3, 'kWh/m³'); add('Bùn khô', x.xlnuoc.DS, 'kg DS/ngày'); add('Chỉ tiêu đạt', x.xlnuoc.checksOK + ' / ' + x.xlnuoc.checks); }
    let h = kv.length ? `<table class="kv">${kv.map(([l, v, u]) => `<tr><td>${esc(l)}</td><td class="n">${v}</td><td>${esc(u)}</td></tr>`).join('')}</table>` : '';
    if (s.eff) h += `<p><b>Nước ra:</b> ${EFF.filter(([k]) => num(s.eff[k])).map(([k, l]) => `${l} ${f(s.eff[k])}${limOf(r, k) != null ? ' (giới hạn ' + f(limOf(r, k)) + ')' : ''}`).join(' · ')} mg/L</p>`;
    if (s.note) h += `<p class="note">${esc(s.note)}</p>`;
    return h;
  }
  function reportHtml() {
    const first = ALL.map(id => R[id]).find(r => r && r.project && r.project.name) || {};
    const pname = (first.project && first.project.name) || 'Dự án';
    const ch = [];
    const base = R.thietke || R.aqua || R.iceas || R.nereda || first;
    let info = '';
    if (base && base.flow) {
      const inf = base.inf || {};
      info = `<table class="kv"><tr><td>Lưu lượng trung bình</td><td class="n">${f(Q(base))}</td><td>m³/ngày</td></tr>${base.flow.kmax ? `<tr><td>Hệ số lưu lượng giờ lớn nhất</td><td class="n">${f(base.flow.kmax)}</td><td></td></tr>` : ''}
        ${base.temp ? `<tr><td>Nhiệt độ nước thấp nhất / cao nhất</td><td class="n">${f(base.temp.Tmin)} / ${f(base.temp.Tmax)}</td><td>°C</td></tr>` : ''}</table>`;
      const ks = ['COD', 'BOD', 'TSS', 'TKN', 'NH4', 'TP'].filter(k => num(inf[k]));
      if (ks.length) info += `<table class="grid"><tr><th>Chỉ tiêu</th>${ks.map(k => `<th>${k}</th>`).join('')}</tr><tr><td>Nước thải vào (mg/L)</td>${ks.map(k => `<td class="n">${f(inf[k])}</td>`).join('')}</tr>
        ${base.lim ? `<tr><td>Giới hạn xả (mg/L)${base.limName ? ' – ' + esc(base.limName) : ''}</td>${ks.map(k => `<td class="n">${num(base.lim[k]) ? f(base.lim[k]) : '–'}</td>`).join('')}</tr>` : ''}</table>`;
    }
    ch.push(['Thông tin dự án và đầu bài', info || '<p>–</p>']);
    ch.push(['So sánh phương án công nghệ', cmpTable(true)]);
    ch.push(['Dự toán sơ bộ CAPEX / OPEX', costTable(true)]);
    if (typeof HYDRO !== 'undefined') ch.push(['Trắc dọc thủy lực toàn trạm', HYDRO.report(R)]);
    for (const id of ALL) if (R[id]) ch.push([NAME(id), appChapter(id, R[id])]);
    const toc = ch.map((c, i) => `<li><a href="#c${i + 1}">${i + 1}. ${esc(c[0])}</a></li>`).join('');
    const body = ch.map((c, i) => `<h2 id="c${i + 1}">${i + 1}. ${esc(c[0])}</h2>${c[1]}`).join('');
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo tổng hợp – ${esc(pname)}</title><style>
      body{font:11pt "Times New Roman",serif;color:#000;max-width:190mm;margin:12mm auto;line-height:1.35}
      h1{font-size:18pt;text-align:center;margin:0 0 4pt}h2{font-size:13pt;margin:16pt 0 6pt;border-bottom:1px solid #999;page-break-after:avoid}h4{font-size:11pt}
      .sub{text-align:center;color:#444;margin:0 0 14pt}table{border-collapse:collapse;width:100%;margin:4pt 0 8pt;font-size:10pt}
      td,th{border:1px solid #999;padding:2pt 5pt;vertical-align:top}th{background:#eef2f7}td.n{text-align:right;white-space:nowrap}td.u{color:#555}
      tr.sec td{background:#f3f4f6;font-weight:bold}tr.tot td{font-weight:bold}td.best{background:#dcfce7}td.over{color:#b91c1c;font-weight:bold}
      .kv td:first-child{width:55%}.note,.hub-note{color:#444;font-size:9.5pt}.hub-warn{color:#b45309}ol{margin:4pt 0}a{color:#000;text-decoration:none}
      .foot{margin-top:18pt;border-top:1px solid #999;padding-top:4pt;font-size:9pt;color:#555}small{color:#555}
      @media print{body{margin:0 auto}h2{page-break-after:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}}
    </style></head><body>
      <h1>BÁO CÁO TỔNG HỢP TRẠM XỬ LÝ NƯỚC THẢI</h1><p class="sub"><b>${esc(pname)}</b><br>Lập bằng bộ phần mềm XLN_Ducnv515 v${ver()} – ${new Date().toLocaleString('vi-VN')}</p>
      <h2 style="border:0">Mục lục</h2><ol style="list-style:none;padding-left:0">${toc}</ol>${body}
      <p class="foot">Số liệu lấy từ trạng thái hiện tại của từng phần mềm lúc ${RT ? RT.toLocaleString('vi-VN') : ''}. Dự toán là ước tính sơ bộ theo đơn giá người dùng nhập.
      Kết quả cần được kỹ sư có chuyên môn kiểm tra trước khi sử dụng. XLN_Ducnv515 v${ver()}.</p></body></html>`;
  }
  function reportWord() {
    const html = reportHtml().replace('<html lang="vi">', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="vi">');
    download('BaoCaoTongHop_' + stamp() + '.doc', '﻿' + html, 'application/msword');
  }
  function reportPrint() {
    const w = window.open('', '_blank');
    if (!w) { alert('Trình duyệt chặn cửa sổ mới – cho phép cửa sổ bật lên rồi thử lại.'); return; }
    w.document.write(reportHtml()); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* */ } }, 400);
  }

  /* ================= khung giao diện ================= */
  function draw() {
    const b = $('#hubBody'); if (!b) return;
    document.querySelectorAll('#hub .hub-tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === tab));
    const head = `<p class="hub-note">${RT ? `Số liệu lấy lúc ${RT.toLocaleTimeString('vi-VN')} từ ${Object.keys(R).length} phần mềm.` : ''} Bấm ⟳ Cập nhật sau khi tính lại trong các phần mềm.</p>`;
    if (tab === 'cmp') b.innerHTML = head + cmpTable();
    else if (tab === 'cost') b.innerHTML = head + costTable();
    else if (tab === 'hyd') { b.innerHTML = head + '<div id="hydBox"></div>'; HYDRO.render($('#hydBox'), R); }
    else b.innerHTML = head + `<p>Báo cáo gồm: thông tin dự án & đầu bài, so sánh phương án, dự toán CAPEX/OPEX, và một chương cho mỗi phần mềm có kết quả
      (${ALL.filter(id => R[id]).map(NAME).join(', ') || 'chưa có'}), có mục lục và số phiên bản.</p>
      <p><button type="button" id="hubWord">⬇ Tải báo cáo Word (.doc)</button> <button type="button" id="hubPdf">🖨 In / lưu PDF</button> <button type="button" id="hubPrev">Xem trước</button></p><div id="hubPv"></div>`;
    b.querySelectorAll('[data-pr]').forEach(i => i.onchange = () => { prices(); PR[i.dataset.pr] = +i.value; try { localStorage.setItem('xlnt_hub_price', JSON.stringify(PR)); } catch (e) { /* */ } draw(); });
    const z = $('#hubPr0'); if (z) z.onclick = () => { try { localStorage.removeItem('xlnt_hub_price'); } catch (e) { /* */ } draw(); };
    const w = $('#hubWord'); if (w) w.onclick = reportWord;
    const pd = $('#hubPdf'); if (pd) pd.onclick = reportPrint;
    const pv = $('#hubPrev'); if (pv) pv.onclick = () => { const fr = document.createElement('iframe'); fr.className = 'hub-pv'; fr.srcdoc = reportHtml(); $('#hubPv').innerHTML = ''; $('#hubPv').appendChild(fr); };
  }
  function open(t) {
    if (t) tab = t;
    $('#hub').classList.add('on');
    if (!RT) refresh(); else draw();
  }
  function mount() {
    const css = document.createElement('style');
    css.textContent = `#hub{position:absolute;top:52px;left:0;right:0;bottom:0;background:#f3f5f8;z-index:4;display:none;flex-direction:column}#hub.on{display:flex}
      #hub .hub-hd{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 14px;background:#fff;border-bottom:1px solid #cbd5e1}
      #hub .hub-hd b{font-size:15px;margin-right:10px}#hub .hub-tabs{display:flex;gap:4px;flex-wrap:wrap}
      #hub button{font:600 12.5px system-ui,sans-serif;padding:6px 11px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;color:#0f172a}
      #hub .hub-tabs button.on{background:#0f62c9;border-color:#0f62c9;color:#fff}#hub .sp{flex:1}
      #hubBody{overflow:auto;padding:12px 16px 30px;font-size:13.5px}
      .hub-tw{overflow-x:auto;max-width:100%}.hub-t{border-collapse:collapse;background:#fff;font-size:12.5px;min-width:520px}
      .hub-t th,.hub-t td{border:1px solid #e2e8f0;padding:4px 9px;text-align:left;vertical-align:top}.hub-t th{background:#f1f5f9;font-weight:600}
      .hub-t td.n{text-align:right;white-space:nowrap}.hub-t td.u{color:#64748b;white-space:nowrap}.hub-t tr.sec td{background:#f8fafc;font-weight:600;color:#0f62c9}
      .hub-t tr.tot td{font-weight:700}.hub-t td.best{background:#dcfce7}.hub-t td.over{color:#b91c1c;font-weight:700}.hub-t small{color:#64748b;font-weight:400}
      .hub-pr input{width:130px;font:13px system-ui;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;text-align:right}
      .hub-note{color:#64748b;font-size:12.5px;max-width:1000px}.hub-warn{color:#b45309;max-width:1000px}
      .hub-pv{width:100%;height:70vh;border:1px solid #cbd5e1;background:#fff}
      .hyd-top{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:8px}.hyd-top input,.hyd-ed input,.hyd-ed select{font:13px system-ui;padding:2px 5px;border:1px solid #cbd5e1;border-radius:4px}
      .hyd-ed{margin-top:10px}.hyd-ed summary{cursor:pointer;padding:4px 0}.hyd-ed button{padding:2px 7px!important;font-size:12px!important}
      #projMenu{position:absolute;top:50px;right:10px;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.18);z-index:9;padding:6px;display:none;min-width:250px}
      #projMenu.on{display:block}#projMenu button{all:unset;display:block;padding:8px 10px;border-radius:5px;cursor:pointer;font:13px system-ui;color:#0f172a}#projMenu button:hover{background:#f1f5f9}`;
    document.head.appendChild(css);
    const hub = document.createElement('div'); hub.id = 'hub'; hub.setAttribute('data-nobi', '');
    hub.innerHTML = `<div class="hub-hd"><b>Σ Tổng hợp toàn trạm</b><div class="hub-tabs"><button data-t="cmp">So sánh phương án</button><button data-t="cost">Dự toán CAPEX/OPEX</button><button data-t="hyd">Trắc dọc thủy lực</button><button data-t="rep">Báo cáo tổng hợp</button></div>
      <span class="sp"></span><button id="hubRef">⟳ Cập nhật từ các phần mềm</button><button id="hubX">Đóng ✕</button></div><div id="hubBody"></div>`;
    $('#frames').after(hub);
    hub.querySelectorAll('.hub-tabs button').forEach(x => x.onclick = () => { tab = x.dataset.t; draw(); });
    $('#hubRef').onclick = refresh; $('#hubX').onclick = () => hub.classList.remove('on');
    const pm = document.createElement('div'); pm.id = 'projMenu'; pm.setAttribute('data-nobi', '');
    pm.innerHTML = `<button data-a="save">💾 Lưu hồ sơ dự án chung (9 phần mềm)…</button><button data-a="open">📂 Mở hồ sơ dự án chung…</button>`;
    document.body.appendChild(pm);
    pm.onclick = e => { const a = e.target.dataset.a; if (!a) return; pm.classList.remove('on'); if (a === 'save') projSave(); else projOpen(); };
    document.addEventListener('mousedown', e => { if (!pm.contains(e.target) && e.target.id !== 'btnProj') pm.classList.remove('on'); });
    $('#btnProj').onclick = () => pm.classList.toggle('on');
    $('#btnHub').onclick = () => (hub.classList.contains('on') ? hub.classList.remove('on') : open());
  }
  return { mount, open, refresh, projSave, projOpen, reportHtml, cost, cmpTable, get R() { return R; } };
})();
