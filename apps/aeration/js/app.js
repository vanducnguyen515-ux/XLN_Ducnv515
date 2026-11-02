// Aeration Design Tool – giao diện
'use strict';
var APP = {};
(function () {
  const $ = s => document.querySelector(s), n = REP.n, E = ZIP.xml;
  const KEY = 'aerationdesign.v1';
  let S, R, tab = 'sum';
  const clone = o => JSON.parse(JSON.stringify(o));
  const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else a[k] = b[k]; } return a; };
  APP.load = () => { try { const j = localStorage.getItem(KEY); return j ? merge(clone(DEF), JSON.parse(j)) : clone(DEF); } catch (e) { return clone(DEF); } };
  APP.persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* bộ nhớ đầy */ } };

  // ---- song ngữ: tiếng Việt, tiếng Anh nhỏ/mờ bên dưới; chuỗi dạng 'Việt|English' ----
  const T2 = (vi, en) => E(vi) + (en && en !== vi ? `<span class="en">${E(en)}</span>` : '');
  const T = s => { const [vi, en] = String(s).split('|'); return T2(vi, en); };
  const TN = o => T2(o.name, o.en);

  // ---- mô tả form: [path, nhãn, đơn vị, kiểu/opts, gợi ý] ----
  const opt = o => Object.keys(o).map(k => [k, o[k].name + (o[k].en ? '|' + o[k].en : '')]);
  const F = () => [
    ['Dự án|Project', [
      ['proj.name', 'Tên dự án|Project name', '', 'text'], ['proj.code', 'Mã|Code', '', 'text'], ['proj.client', 'Chủ đầu tư|Client', '', 'text'],
      ['proj.loc', 'Địa điểm|Location', '', 'text'], ['proj.by', 'Người lập|Prepared by', '', 'text'], ['proj.rev', 'Phiên bản|Revision', '', 'text']], true],
    ['Địa điểm & khí hậu|Site & climate', [
      ['site.elev', 'Cao độ công trình|Site elevation', 'm'], ['site.Tair_max', 'Nhiệt độ không khí max|Max air temperature', '°C'], ['site.Tair_avg', 'Nhiệt độ không khí TB năm|Annual mean air temperature', '°C'],
      ['site.RH', 'Độ ẩm tương đối|Relative humidity', '%'], ['site.Tw_sum', 'Nhiệt độ nước – mùa nóng|Water temperature – summer', '°C'], ['site.Tw_win', 'Nhiệt độ nước – mùa lạnh|Water temperature – winter', '°C']]],
    ['Loại nước & hệ số|Wastewater & factors', [
      ['water.type', 'Loại nước thải|Wastewater type', '', opt(DB.water), 'Chọn loại nước sẽ nạp α, β mặc định|Selecting a type loads default α, β'],
      ['process', 'Loại công trình|Process type', '', opt(DB.process), 'Nạp hệ số kg O₂/kg BOD|Loads kg O₂/kg BOD factor'],
      ['water.a_fb', 'α bọt mịn (đĩa mới)|α fine bubble (new)', ''], ['water.F', 'F bám bẩn (bọt mịn)|F fouling (fine bubble)', ''], ['water.a_cb', 'α bọt thô|α coarse bubble', ''], ['water.a_me', 'α cơ khí|α mechanical', ''],
      ['water.beta', 'β', ''], ['water.theta', 'θ', ''], ['water.DO_avg', 'DO vận hành TB|Average operating DO', 'mg/L'], ['water.DO_pk', 'DO khi tải cực đại|DO at peak load', 'mg/L'],
      ['water.de_fb', 'de bọt mịn (bão hòa sâu)|de fine bubble (depth saturation)', ''], ['water.de_cb', 'de bọt thô|de coarse bubble', ''], ['water.de_jet', 'de jet', '']]],
    ['Nhu cầu oxy|Oxygen demand', [
      ['load.mode', 'Cách nhập|Input mode', '', [['loads', 'Từ tải lượng ô nhiễm|From pollutant loads'], ['aor', 'Nhập AOR (kg O₂/ngày)|Enter AOR (kg O₂/d)'], ['sotr', 'Nhập SOTR mỗi bể (kg O₂/h)|Enter SOTR per basin (kg O₂/h)']]],
      ['load.Q', 'Lưu lượng Q|Flow Q', 'm³/d', 0, '', 'loads'], ['load.BODin', 'BOD₅ vào|Influent BOD₅', 'mg/L', 0, '', 'loads'], ['load.BODout', 'BOD₅ ra|Effluent BOD₅', 'mg/L', 0, '', 'loads'],
      ['load.TKNin', 'TKN vào|Influent TKN', 'mg/L', 0, '', 'loads'], ['load.NH4out', 'NH₄-N ra|Effluent NH₄-N', 'mg/L', 0, '', 'loads'],
      ['load.sideBOD', 'BOD dòng tuần hoàn|Sidestream BOD', 'kg/d', 0, '', 'loads'], ['load.sideN', 'N dòng tuần hoàn|Sidestream N', 'kg/d', 0, '', 'loads'],
      ['load.kBOD', 'kg O₂/kg BOD', '', 0, '1,0–1,1 (SRT 5–10 d); 1,25–1,8 sục khí kéo dài|1.0–1.1 (SRT 5–10 d); 1.25–1.8 extended aeration', 'loads'], ['load.kN', 'kg O₂/kg N nitrat hóa|kg O₂/kg N nitrified', '', 0, '', 'loads'],
      ['load.dnCredit', 'Tính hoàn trả khử nitrat|Apply denitrification credit', '', 'bool', '', 'loads'], ['load.NO3dn', 'NO₃-N được khử|NO₃-N denitrified', 'mg/L', 0, '', 'loads'],
      ['load.other', 'Nhu cầu khác (H₂S…)|Other demand (H₂S…)', 'kg/d', 0, '', 'loads'], ['load.fPk', 'Hệ số tải cực đại|Peak load factor', '', 0, '', 'loads'], ['load.fMin', 'Hệ số tải tối thiểu|Minimum load factor', '', 0, '', 'loads'],
      ['load.AOR_min', 'AOR tối thiểu|AOR minimum', 'kg/d', 0, '', 'aor'], ['load.AOR_avg', 'AOR trung bình|AOR average', 'kg/d', 0, '', 'aor'], ['load.AOR_pk', 'AOR cực đại|AOR peak', 'kg/d', 0, '', 'aor'],
      ['load.SOTR_min', 'SOTR tối thiểu/bể|SOTR minimum/basin', 'kg/h', 0, '', 'sotr'], ['load.SOTR_avg', 'SOTR trung bình/bể|SOTR average/basin', 'kg/h', 0, '', 'sotr'], ['load.SOTR_pk', 'SOTR cực đại/bể|SOTR peak/basin', 'kg/h', 0, '', 'sotr']]],
    ['Kích thước bể|Basin dimensions', [
      ['tank.nBasin', 'Tổng số bể|Total basins', 'bể|basins'], ['tank.nAerSim', 'Số bể sục khí đồng thời|Basins aerated simultaneously', 'bể|basins', 0, 'SBR/ICEAS: số bể ở pha sục khí|SBR/ICEAS: basins in aeration phase'],
      ['tank.L', 'Chiều dài|Length', 'm'], ['tank.W', 'Chiều rộng|Width', 'm'], ['tank.H', 'Mực nước cao TWL|Top water level TWL', 'm'], ['tank.Hbwl', 'Mực nước thấp BWL|Bottom water level BWL', 'm', 0, 'Bể liên tục: = TWL|Continuous basin: = TWL'],
      ['tank.hDiff', 'Cao độ đĩa so với đáy|Diffuser height above floor', 'm'], ['tank.freeboard', 'Chiều cao an toàn|Freeboard', 'm'], ['tank.wall', 'Chiều dày thành|Wall thickness', 'm'], ['tank.aerHours', 'Giờ sục khí mỗi bể|Aeration hours per basin', 'h/d'],
      ['op.wMin', 'Tỷ trọng TG tối thiểu|Time weight – minimum', ''], ['op.wAvg', 'Tỷ trọng TG trung bình|Time weight – average', ''], ['op.wPk', 'Tỷ trọng TG cực đại|Time weight – peak', '']]],
    ['Công nghệ & thiết bị|Technology & equipment', [
      ['sel.tech', 'Công nghệ thiết kế|Design technology', '', [...opt(DB.diff), ...['jet', 'asp', 'surf'].map(k => [k, DB.mech[k].name + '|' + DB.mech[k].en])]],
      ['blower.tech', 'Công nghệ máy thổi khí|Blower technology', '', opt(DB.blower)], ['blower.nDuty', 'Số máy chạy (0 = tự chọn)|Duty units (0 = auto)', ''], ['blower.nStby', 'Số máy dự phòng|Standby units', ''],
      ['blower.airMargin', 'Dự phòng lưu lượng khí|Air flow margin', '×'], ['blower.dpInlet', 'Tổn thất lọc hút|Inlet filter loss', 'kPa'],
      ['grid.qTarget', 'q mục tiêu/phần tử (0 = mặc định)|Target q/element (0 = default)', 'Sm³/h'], ['grid.Nfix', 'Số phần tử cố định (0 = tự)|Fixed element count (0 = auto)', ''], ['grid.nGrid', 'Số lưới/bể (0 = tự)|Grids per basin (0 = auto)', ''],
      ['grid.wallClr', 'Khoảng cách tới tường|Wall clearance', 'm'], ['grid.latMin', 'Khoảng cách ống nhánh min|Min lateral spacing', 'm'], ['grid.mixFB', 'Khí khuấy trộn bọt mịn|Fine bubble mixing air', 'Sm³/h/m²'],
      ['grid.mixCB', 'Khí khuấy trộn bọt thô|Coarse bubble mixing air', 'Sm³/h/m³'], ['grid.gridLoss', 'Tổn thất lưới + lỗ điều tiết|Grid + orifice loss', 'kPa'],
      ['mech.etaMot', 'Hiệu suất động cơ (cơ khí)|Motor efficiency (mechanical)', ''], ['mech.lagoon', 'Hồ đáy đất/lót (giới hạn ≤ 11 kW)|Earthen/lined lagoon (≤ 11 kW limit)', '', 'bool']]],
    ['Đường ống khí|Air piping', [
      ['pipe.L_bl', 'L ống đẩy mỗi máy|Discharge pipe length per blower', 'm'], ['pipe.L_main', 'L ống góp chính|Main header length', 'm'], ['pipe.L_br', 'L ống nhánh vào bể|Basin branch length', 'm'],
      ['pipe.K_main', 'ΣK ống góp chính|ΣK main header', ''], ['pipe.K_br', 'ΣK ống nhánh|ΣK branch', ''], ['pipe.v_main', 'v max ống góp|Max header velocity', 'm/s'], ['pipe.v_drop', 'v max ống đứng|Max dropleg velocity', 'm/s'],
      ['pipe.dropMat', 'Vật liệu ống đứng|Dropleg material', '', [['Inox 304', 'Inox 304|Stainless 304'], ['Inox 316', 'Inox 316|Stainless 316'], ['uPVC', 'uPVC'], ['CPVC', 'CPVC']]],
      ['pipe.dpValves', 'Tổn thất van + đo lưu lượng|Valve + flowmeter loss', 'kPa'], ['pipe.dpFoul', 'Dự phòng bám bẩn|Fouling allowance', 'kPa']]],
    ['Nhiệt & kinh tế|Heat & economics', [
      ['heat.U', 'U ống góp ngoài trời|U outdoor header', 'W/m²K'], ['heat.Troom', 'Nhiệt độ phòng máy max|Max blower room temperature', '°C'], ['heat.dTroom', 'ΔT thông gió|Ventilation ΔT', 'K'], ['heat.Lroom', 'L ống nóng trong phòng|Hot pipe length in room', 'm'],
      ['econ.price', 'Đơn giá điện|Electricity price', 'đ/kWh|VND/kWh'], ['econ.co2', 'Hệ số CO₂ lưới điện|Grid CO₂ factor', 'kg/kWh']]]
  ];
  const get = p => p.split('.').reduce((o, k) => o == null ? o : o[k], S);
  const set = (p, v) => { const ks = p.split('.'); let o = S; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; };

  APP.form = () => {
    let h = '';
    for (const [title, rows, closed] of F()) {
      h += `<details${closed ? '' : ' open'}><summary>${T(title)}</summary>`;
      for (const [p, l, u, ty, hint, only] of rows) {
        if (only && S.load.mode !== only) continue;
        const id = 'f_' + p.replace(/\./g, '_'), v = get(p);
        if (Array.isArray(ty)) {
          // <option> không chứa được HTML: chỉ hiện tiếng Việt, tiếng Anh của mục đang chọn hiện dưới ô chọn
          const cur = (ty.find(o => String(o[0]) === String(v)) || ty[0])[1].split('|')[1];
          h += `<div class="fr wide"><label for="${id}">${T(l)}</label><div><select id="${id}" data-p="${p}">${ty.map(o => `<option value="${E(o[0])}"${String(o[0]) === String(v) ? ' selected' : ''}>${E(o[1].split('|')[0])}</option>`).join('')}</select>${cur ? `<span class="en">${E(cur)}</span>` : ''}</div></div>`;
        }
        else if (ty === 'text') h += `<div class="fr wide"><label for="${id}">${T(l)}</label><input id="${id}" data-p="${p}" data-t="s" value="${E(v)}"></div>`;
        else if (ty === 'bool') h += `<div class="fr"><label for="${id}">${T(l)}</label><input id="${id}" type="checkbox" data-p="${p}" data-t="b"${v ? ' checked' : ''}><span></span></div>`;
        else h += `<div class="fr"><label for="${id}">${T(l)}</label><input id="${id}" type="number" step="any" data-p="${p}" value="${v}"><span class="u">${T(u)}</span></div>`;
        if (hint) h += `<div class="hint">${T(hint)}</div>`;
      }
      h += '</details>';
    }
    const box = $('#inputs'), open = [...box.querySelectorAll('details')].map(d => d.open);
    box.innerHTML = h;
    if (open.length) box.querySelectorAll('details').forEach((d, i) => { if (open[i] != null) d.open = open[i]; });
  };
  APP.onInput = e => {
    const el = e.target, p = el.dataset.p; if (!p) return;
    let v = el.dataset.t === 's' ? el.value : el.dataset.t === 'b' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
    if (el.tagName === 'SELECT' && /^-?\d+(\.\d+)?$/.test(v) && p !== 'pipe.dropMat') v = parseFloat(v);
    if (typeof v === 'number' && !isFinite(v)) return;
    set(p, v);
    let reform = el.tagName === 'SELECT';   // cập nhật dòng tiếng Anh dưới ô chọn
    if (p === 'water.type') { const w = DB.water[v]; Object.assign(S.water, { a_fb: w.a_fb, a_cb: w.a_cb, a_me: w.a_me, beta: w.beta }); reform = true; }
    if (p === 'process') { S.load.kBOD = DB.process[v].kBOD; if (!DB.process[v].cont && S.tank.aerHours >= 24) S.tank.aerHours = 16; reform = true; }
    if (p === 'load.mode') reform = true;
    if (p === 'tank.H' && S.tank.Hbwl > v) { S.tank.Hbwl = v; reform = true; }
    APP.run(); if (reform) APP.form();
  };
  APP.run = () => {
    try { R = ENG.compute(S); } catch (e) { $('#view').innerHTML = `<div class="w err">${T2('Lỗi tính toán: ' + e.message, 'Calculation error: ' + e.message)}</div>`; console.error(e); return; }
    APP.persist(); APP.show();
  };
  APP.pick = k => { S.sel.tech = k; APP.form(); APP.run(); };

  // ---- các trang kết quả ----
  const card = (k, v, s) => `<div class="card"><div class="k">${T(k)}</div><div class="v">${v}</div><div class="s">${T(s || '')}</div></div>`;
  const msgs = W => W.length ? `<div class="msgs">${W.map(w => `<div class="w ${w[0]}">${T2(w[1], w[2])}</div>`).join('')}</div>` : `<div class="msgs"><div class="w ok">${T('Không có cảnh báo cho phương án đang chọn.|No warnings for the selected option.')}</div></div>`;
  const tbl = (head, rows, numFrom) => `<table class="t"><thead><tr>${head.map(h => `<th>${T(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.cls ? ` class="${r.cls}"` : ''}>${(r.c || r).map((c, i) => `<td${i >= (numFrom == null ? 1 : numFrom) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const pickBtn = k => `<button class="pick" type="button" data-pick="${k}">${T('Chọn|Select')}</button>`;
  const CONDS = [['Tối thiểu|Minimum', 'min'], ['Trung bình|Average', 'avg'], ['Cực đại|Peak', 'pk']];
  const diffSel = () => R.sel && (R.sel.kind === 'fb' || R.sel.kind === 'cb');
  const V = {};
  V.sum = () => {
    const r = R.sel, A = R.A;
    let h = `<h2>${T2('Tổng quan – ' + r.name, 'Overview – ' + (r.en || r.name))}</h2><div class="cards">`;
    const pk = A.pk != null ? n(A.pk, 0) : '–';
    h += card('AOR trung bình|AOR average', A.avg != null ? n(A.avg, 0) : '–', `kg O₂/ngày; cực đại ${pk}|kg O₂/d; peak ${pk}`);
    h += card('SOTR cực đại / bể|SOTR peak / basin', n(r.SR.pk, 1), `kg O₂/h; AOR/SOR TB ${n(r.SR.rat.avg.ratio, 3)}|kg O₂/h; avg AOR/SOR ${n(r.SR.rat.avg.ratio, 3)}`);
    if (diffSel()) {
      const b = r.blower;
      h += card('Phần tử phân phối|Diffuser elements', r.N + ' /bể', `${r.lay.nGrid} lưới/bể · AT/AD ${n(r.atad, 1)}|${r.lay.nGrid} grids/basin · AT/AD ${n(r.atad, 1)}`);
      h += card('Khí toàn trạm|Total plant air', n(r.Qt.avg, 0), `Sm³/h TB · max ${n(r.Qt.pk, 0)}|Sm³/h avg · max ${n(r.Qt.pk, 0)}`);
      h += card('Máy thổi khí|Blowers', `${b.nDuty}+${b.nStby}`, (b.model ? b.model.fam + ' ' + b.model.m : b.Bk.name) + ` · ${n(b.motor, b.motor < 10 ? 2 : 0)} kW` + (b.model ? '' : '|' + b.Bk.en + ` · ${n(b.motor, b.motor < 10 ? 2 : 0)} kW`));
      h += card('Điểm thiết kế / máy|Design point / unit', n(b.Qu, 0) + ' Sm³/h', `@ ${n(r.design.pg, 1)} kPa g`);
      h += card('Nhiệt độ khí ra|Discharge air temperature', n(b.T2, 0) + ' °C', `đầu ống đứng ${n(r.heat.Tdrop, 0)} °C|at dropleg ${n(r.heat.Tdrop, 0)} °C`);
      h += card('Ống góp chính|Main header', 'DN' + r.dn.main, `v = ${n(r.design.segs.main.v, 1)} m/s`);
    } else h += card('Thiết bị|Equipment', E(r.units), '|' + r.unitsEn);
    h += card('Công suất điện TB|Average power', n(r.kWavg, 1) + ' kW', `lắp đặt (chạy) ${n(r.kWinst, 0)} kW|installed (duty) ${n(r.kWinst, 0)} kW`);
    h += card('Điện năng năm|Annual energy', n(r.kWhY / 1000, 0) + ' MWh', `${n(r.cost / 1e6, 0)} triệu ${S.econ.cur} · ${n(r.co2, 0)} t CO₂|${n(r.cost / 1e6, 0)} million ${S.econ.cur} · ${n(r.co2, 0)} t CO₂`);
    h += card('SAE cực đại|Peak SAE', n(r.sae, 2), 'kg O₂/kWh (chuẩn)|kg O₂/kWh (standard)');
    h += '</div>' + msgs(R.W);
    if (R.best && R.best.key !== r.key) h += `<p class="note">Phương án tiêu thụ điện thấp nhất: <b>${E(R.best.name)}</b> (${n(R.best.kWhY / 1000, 0)} MWh/năm). ${pickBtn(R.best.key)}<span class="en">Lowest-energy option: <b>${E(R.best.en || R.best.name)}</b> (${n(R.best.kWhY / 1000, 0)} MWh/yr).</span></p>`;
    h += `<h3>${T('Bản vẽ mặt bằng|Layout plan')}</h3><div class="drw">${DRW.svg(DRW.plan(S, r), 1100, 520)}</div>`;
    return h;
  };
  V.cmp = () => {
    const rows = R.all.filter(x => !x.err).map(x => ({ cls: x.key === R.sel.key ? 'sel' : x.feasible ? '' : 'bad', c: [
      TN(x), x.N ? `${x.N}/bể · ${x.blower.nDuty}+${x.blower.nStby} × ${E(x.blower.model ? x.blower.model.m : n(x.blower.motor, 0) + ' kW')}` : T2(x.units, x.unitsEn),
      n(x.SR.pk, 1), x.design ? n(x.design.pg, 1) : '–', x.Qt ? n(x.Qt.pk, 0) : '–', n(x.sae, 2), n(x.kWinst, 0), n(x.kWavg, 1), n(x.kWhY / 1000, 0), n(x.cost / 1e6, 0),
      x.feasible ? (x.key === R.sel.key ? T('Đang chọn|Selected') : pickBtn(x.key)) : T('Không đạt|Not feasible')] }));
    return `<h2>${T('So sánh công nghệ cấp khí (cùng nhu cầu oxy)|Aeration technology comparison (same oxygen demand)')}</h2>` + tbl(['Công nghệ|Technology', 'Thiết bị|Equipment', 'SOTR max/bể kg/h|Peak SOTR/basin kg/h', 'Áp xả kPa|Discharge kPa', 'Khí max Sm³/h|Peak air Sm³/h', 'SAE kg/kWh', 'kW lắp (chạy)|kW installed (duty)', 'kW TB|kW avg', 'MWh/năm|MWh/yr', 'Triệu đ/năm|Million VND/yr', ''], rows, 2)
      + `<figure class="drw">${REP.chartSVG(R, 1100, 300)}</figure>`
      + `<p class="note">${T('Bọt mịn: mô hình SOTE theo mật độ, lưu lượng/đĩa và độ ngập (Sanitaire); máy thổi theo hiệu suất dây-tới-khí từng công nghệ (Xylem 2021). Cơ khí: SAE nhà sản xuất – jet 0,5–1,2; hút 1,0; bề mặt 1,5 kg O₂/kWh (handbook Xylem). SOTR của từng công nghệ khác nhau vì α và độ bão hòa sâu khác nhau.|Fine bubble: SOTE model by density, flow per disc and submergence (Sanitaire); blowers by wire-to-air efficiency of each technology (Xylem 2021). Mechanical: manufacturer SAE – jet 0.5–1.2; aspirating 1.0; surface 1.5 kg O₂/kWh (Xylem handbook). SOTR differs between technologies because α and depth saturation differ.')}</p>`;
  };
  V.oxy = () => {
    const A = R.A, r = R.sel, L = S.load;
    let h = `<h2>${T('Nhu cầu oxy AOR và chuyển đổi SOR|Oxygen demand AOR and SOR conversion')}</h2>`;
    if (A.mode === 'loads') h += tbl(['Thành phần|Component', 'Giá trị|Value', 'Đơn vị|Unit'], [
      [T('BOD khử|BOD removed'), n(A.bod, 1), T('kg/ngày|kg/d')], [T('N nitrat hóa|N nitrified'), n(A.nn, 1), T('kg N/ngày|kg N/d')], [T(`O₂ cho BOD (${L.kBOD} kg/kg)|O₂ for BOD (${L.kBOD} kg/kg)`), n(A.oBOD, 1), T('kg/ngày|kg/d')],
      [T(`O₂ cho nitrat hóa (${L.kN} kg/kg)|O₂ for nitrification (${L.kN} kg/kg)`), n(A.oN, 1), T('kg/ngày|kg/d')], [T('Hoàn trả khử nitrat|Denitrification credit'), '−' + n(A.oDN, 1), T('kg/ngày|kg/d')], [T('Nhu cầu khác|Other demand'), n(A.oOther, 1), T('kg/ngày|kg/d')],
      [T('AOR tối thiểu / TB / cực đại|AOR minimum / average / peak'), `${n(A.min, 0)} / ${n(A.avg, 0)} / ${n(A.pk, 0)}`, T('kg O₂/ngày|kg O₂/d')]]);
    const rr = ['min', 'avg', 'pk'].map(k => r.SR.rat[k]);
    h += `<h3>${T2('Hệ số AOR/SOR – ' + r.name, 'AOR/SOR ratio – ' + (r.en || r.name))}</h3>` + tbl(['Đại lượng|Quantity', 'Tối thiểu|Minimum', 'Trung bình|Average', 'Cực đại|Peak'], [
      [T('T nước °C|Water T °C'), ...rr.map(x => n(x.T, 1))], ['DO mg/L', ...rr.map(x => n(x.DO, 1))], ['α', ...rr.map(x => n(x.alpha, 3))], ['θ^(T−20)', ...rr.map(x => n(x.th, 3))],
      [T('Độ ngập TB m|Mean submergence m'), ...rr.map(x => n(x.Hsub, 2))], ['C*∞,20 mg/L', ...rr.map(x => n(x.c20, 2))], ['C*∞,T mg/L', ...rr.map(x => n(x.cT, 2))], ['Pf/Pmsl', ...rr.map(x => n(x.Om, 3))],
      ['AOR/SOR', ...rr.map(x => '<b>' + n(x.ratio, 3) + '</b>')], [T('AOTR/bể kg/h|AOTR/basin kg/h'), ...['min', 'avg', 'pk'].map(k => n(r.SR.aotr[k], 1))], [T('SOTR/bể kg/h|SOTR/basin kg/h'), ...['min', 'avg', 'pk'].map(k => '<b>' + n(r.SR[k], 1) + '</b>')]]);
    h += `<p class="note">${T('AOR = SOR·α·θ^(T−20)·(β·Pf/Pmsl·C*∞,T − DO)/C*∞,20 (Sanitaire Design Guide, Eq. 1). Quy tắc nhanh: AOR/SOR ≈ 0,33 bọt mịn, 0,50 bọt thô.|AOR = SOR·α·θ^(T−20)·(β·Pf/Pmsl·C*∞,T − DO)/C*∞,20 (Sanitaire Design Guide, Eq. 1). Rule of thumb: AOR/SOR ≈ 0.33 fine bubble, 0.50 coarse bubble.')}</p>`;
    return h;
  };
  V.diff = () => {
    if (!diffSel()) return `<h2>${T('Đĩa & bố trí|Diffusers & layout')}</h2><p>${T('Phương án đang chọn là thiết bị cơ khí – xem tab Tổng quan và Bản vẽ.|The selected option is mechanical equipment – see the Overview and Drawings tabs.')}</p>`;
    const r = R.sel, d = r.d, l = r.lay, c = r.cond;
    let h = `<h2>${TN(d)}</h2>` + tbl(['Thông số|Parameter', 'Giá trị|Value'], [
      [T('Diện tích màng / phần tử|Membrane area / element'), n(d.a, 4) + ' m²'], [T('Dải lưu lượng (ngắn hạn)|Flow range (short-term)'), `${d.qmin}–${d.qmax} (${d.qpk}) Sm³/h`], [T('Số phần tử / bể · toàn trạm|Elements / basin · plant'), `${r.N} · ${r.N * S.tank.nBasin}`],
      [T('Ống nhánh × phần tử/ống|Laterals × elements/lateral'), `${l.nLat} × ${l.nPer}`], [T('Bước ống nhánh / trên ống|Lateral spacing / along lateral'), `${n(l.pl, 2)} m / ${n(l.pd, 2)} m`], [T('Số lưới / bể|Grids / basin'), T(`${l.nGrid} (${l.latPerGrid.join(' + ')} ống nhánh)|${l.nGrid} (${l.latPerGrid.join(' + ')} laterals)`)],
      [T('AT/AD · độ phủ sàn|AT/AD · floor coverage'), `${n(r.atad, 1)} · ${n(100 / r.atad, 1)} %`], [T('Độ ngập TB / max / min|Submergence mean / max / min'), `${n(r.sub.mean, 2)} / ${n(r.sub.max, 2)} / ${n(r.sub.min, 2)} m`],
      [T('Khí khuấy trộn tối thiểu|Minimum mixing air'), T(`${n(r.mixRate, 0)} Sm³/h/bể|${n(r.mixRate, 0)} Sm³/h/basin`)], [T('Nguồn|Source'), T2(d.src + ' · ' + d.life, d.src.replace(/tr\./g, 'p.') + ' · ' + d.lifeEn)]]);
    h += tbl(['Điều kiện|Condition', 'SOTR kg/h', 'Khí O₂ Sm³/h|O₂ air Sm³/h', 'Khí chọn Sm³/h|Selected air Sm³/h', 'q Sm³/h/pt|q Sm³/h/elem', 'Thông lượng|Flux', 'SOTE %', 'Chi phối|Governed by'],
      CONDS.map(([lb, k]) => [T(lb), n(c[k].SOTR, 1), n(c[k].Qo2, 0), n(c[k].Q, 0), n(c[k].q, 2), n(c[k].flux, 1), n(c[k].sote * 100, 1), T2(c[k].gov, ENG.govEn[c[k].gov])]));
    h += `<div class="drw">${DRW.svg(DRW.plan(S, r), 1100, 520)}</div>`;
    return h;
  };
  V.pipe = () => {
    if (!diffSel()) return `<h2>${T('Đường ống|Piping')}</h2><p>${T('Không áp dụng cho thiết bị cơ khí.|Not applicable to mechanical equipment.')}</p>`;
    const r = R.sel, D = r.design;
    let h = `<h2>${T('Đường ống khí – vận tốc & tổn thất (thiết kế)|Air piping – velocity & losses (design)')}</h2>` + tbl(['Đoạn|Segment', 'Vật liệu|Material', 'DN', 'Q Sm³/h', 'Q thực m³/h|Actual Q m³/h', 'T °C', 'v m/s', 'v khuyến nghị|Recommended v', 'Re', 'ΔP kPa'],
      r.segDefs.map(s => { const x = D.segs[s.id]; const bad = x.v > x.vr[1]; return { cls: bad ? 'bad' : '', c: [TN(s), E(s.mat), 'DN' + x.dn, n(x.Qs, 0), n(x.Qa, 0), n(x.T, 0), (bad ? '⚠ ' : '') + n(x.v, 1), `${x.vr[0]}–${x.vr[1]}`, n(x.Re, 0), n(x.dp, 3)] }; }), 2);
    h += tbl(['Thành phần áp lực xả|Discharge pressure component', 'kPa'], [[T('Thủy tĩnh tại TWL|Static head at TWL'), n(D.hyd, 2)], [T('DWP qua phần tử|Element DWP'), n(D.dwp, 2)], [T('Lưới + lỗ điều tiết|Grid + orifices'), n(D.grid, 2)], [T('Van + đo lưu lượng|Valves + flowmeter'), n(D.valves, 2)],
      [T('Dự phòng bám bẩn|Fouling allowance'), n(D.foul, 2)], [T('Đường ống|Piping'), n(D.pipeSum, 2)], ['<b>' + T('Áp lực xả thiết kế|Design discharge pressure') + '</b>', '<b>' + n(D.pg, 2) + '</b>']]);
    return h + `<p class="note">${T('Darcy–Weisbach + Swamee–Jain; khí thực theo áp suất/nhiệt độ; vận tốc khuyến nghị Metcalf & Eddy (DN25–75: 6–9; 100–250: 9–15; 300–600: 14–20; 750–1500: 19–33 m/s).|Darcy–Weisbach + Swamee–Jain; actual air at pressure/temperature; recommended velocities per Metcalf & Eddy (DN25–75: 6–9; 100–250: 9–15; 300–600: 14–20; 750–1500: 19–33 m/s).')}</p>`;
  };
  V.blow = () => {
    const r = R.sel;
    if (!diffSel()) return `<h2>${T('Điện năng|Energy')}</h2>` + tbl(['Điều kiện|Condition', 'kW điện|Electric kW', 'SAE kg/kWh'], CONDS.map(([l, k]) => [T(l), n(r.ops[k].kW, 1), n(r.ops[k].SAE, 2)]));
    const b = r.blower;
    let h = `<h2>${T2('Máy thổi khí – ' + b.Bk.name, 'Blowers – ' + b.Bk.en)}</h2>` + tbl(['Thông số|Parameter', 'Giá trị|Value', 'Thông số|Parameter', 'Giá trị|Value'], [
      [T('Số máy|Units'), T(`${b.nDuty} chạy + ${b.nStby} dự phòng|${b.nDuty} duty + ${b.nStby} standby`), 'Model', b.model ? `${b.model.fam} ${b.model.m} (${b.model.kW} kW)` : T('Theo nhà cung cấp|By supplier')],
      [T('Lưu lượng/máy|Flow/unit'), `${n(b.Qu, 0)} Sm³/h · ${n(b.QuN, 0)} Nm³/h`, T('Tại cửa hút|At inlet'), `${n(b.Qin, 0)} m³/h`],
      [T('Áp hút / xả tuyệt đối|Absolute inlet / discharge'), `${n(b.p1, 1)} / ${n(b.p2, 1)} kPa`, T('Tỷ số nén|Pressure ratio'), n(b.r2, 3)], [T('Công suất đoạn nhiệt|Adiabatic power'), `${n(b.padD, 1)} kW`, T('η dây-tới-khí|Wire-to-air η'), `${n(b.etaD * 100, 1)} %`],
      [T('Công suất điện/máy|Electric power/unit'), `${n(b.pElD, 1)} kW`, T('Động cơ|Motor'), `${n(b.motor, b.motor < 10 ? 2 : 0)} kW`], [T('Giảm tải tối thiểu|Minimum turndown'), `${n(b.Bk.td * 100, 0)} %`, T('Định mức/máy|Rating/unit'), `${n(b.cap, 0)} Sm³/h`],
      [T('Tiếng ồn|Noise'), T2(b.Bk.noise, b.Bk.noiseEn), T('Bảo trì / CAPEX|Maintenance / CAPEX'), T2(b.Bk.maint + ' / ' + b.Bk.capex, b.Bk.maintEn + ' / ' + b.Bk.capexEn)]], 9);
    h += `<h3>${T('Vận hành & điện năng (khí hút TB năm)|Operation & energy (annual mean inlet air)')}</h3>` + tbl(['Điều kiện|Condition', 'Q Sm³/h', 'Máy chạy|Units running', 'Tải %|Load %', 'Áp kPa g|Pressure kPa g', 'η %', 'kW điện|Electric kW', 'SAE', 'T ra °C|Outlet T °C'],
      CONDS.map(([l, k]) => { const o = r.ops[k]; return [T(l), n(o.Q, 0), o.nRun, n(o.f * 100, 0), n(o.pg, 1), n(o.eta * 100, 1), n(o.kW, 1), n(o.SAE, 2), n(o.T2, 0)]; }));
    h += `<p>Điện năng năm: <b>${n(r.kWhY, 0)} kWh</b> · chi phí <b>${n(r.cost, 0)} ${S.econ.cur}</b> · ${n(r.co2, 1)} t CO₂ · ${n(r.hoursY, 0)} h vận hành/năm.<span class="en">Annual energy: <b>${n(r.kWhY, 0)} kWh</b> · cost <b>${n(r.cost, 0)} ${S.econ.cur}</b> · ${n(r.co2, 1)} t CO₂ · ${n(r.hoursY, 0)} operating h/yr.</span></p>`;
    h += `<h3>${T('So sánh công nghệ máy thổi (cùng hệ phân phối)|Blower technology comparison (same diffuser system)')}</h3>`;
    const rows = Object.keys(DB.blower).map(k => { const S2 = clone(S); S2.blower.tech = k; S2.blower.nDuty = 0; const x = ENG.runDiffused(S2, r.key, R.A, { selected: true }); return { cls: k === S.blower.tech ? 'sel' : '', c: [TN(DB.blower[k]), `${x.blower.nDuty}+${x.blower.nStby}`, x.blower.model ? x.blower.model.m : n(x.blower.motor, 0) + ' kW', n(x.ops.avg.kW, 1), n(x.kWhY / 1000, 0), n(x.kWhY * S.econ.price / 1e6, 0), T2(DB.blower[k].maint, DB.blower[k].maintEn)] }; });
    return h + tbl(['Công nghệ|Technology', 'Số máy|Units', 'Model/động cơ|Model/motor', 'kW TB|kW avg', 'MWh/năm|MWh/yr', 'Triệu đ/năm|Million VND/yr', 'Bảo trì|Maintenance'], rows, 3);
  };
  V.heat = () => {
    if (!diffSel()) return `<h2>${T('Nhiệt|Heat')}</h2><p>${T('Không áp dụng.|Not applicable.')}</p>`;
    const r = R.sel, h0 = r.heat, b = r.blower;
    const pts = []; for (let x = 0; x <= h0.Lrun; x += h0.Lrun / 20) pts.push([x, h0.Tx(x)]);
    const W = 900, H = 230, mx = h0.Lrun, Tmax = b.T2 + 5, Tmin = S.site.Tair_max - 5;
    const X = x => 50 + x / mx * (W - 70), Y = t => H - 30 - (t - Tmin) / (Tmax - Tmin) * (H - 50);
    const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%"><rect width="${W}" height="${H}" fill="#fff"/><polyline fill="none" stroke="#dc2626" stroke-width="2" points="${pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}"/>
      <line x1="50" y1="${Y(h0.matLim)}" x2="${W - 20}" y2="${Y(h0.matLim)}" stroke="#7c3aed" stroke-dasharray="5 4"/><text x="${W - 22}" y="${Y(h0.matLim) - 4}" font-size="11" text-anchor="end" fill="#7c3aed">giới hạn ${E(S.pipe.dropMat)} ${h0.matLim} °C <tspan fill-opacity=".6" font-size="9">${E(S.pipe.dropMat)} limit</tspan></text>
      <line x1="50" y1="${H - 30}" x2="${W - 20}" y2="${H - 30}" stroke="#94a3b8"/><line x1="50" y1="15" x2="50" y2="${H - 30}" stroke="#94a3b8"/>
      <text x="50" y="${H - 12}" font-size="11">0 m (máy thổi) <tspan fill-opacity=".6" font-size="9">blower</tspan></text><text x="${W - 20}" y="${H - 12}" font-size="11" text-anchor="end">${n(mx, 0)} m (đầu ống đứng) <tspan fill-opacity=".6" font-size="9">dropleg</tspan></text>
      <text x="56" y="${Y(b.T2) + 12}" font-size="11">${n(b.T2, 0)} °C</text><text x="${W - 24}" y="${Y(h0.Tdrop) - 6}" font-size="11" text-anchor="end">${n(h0.Tdrop, 0)} °C</text></svg>`;
    return `<h2>${T('Tính toán nhiệt|Heat calculation')}</h2>` + tbl(['Hạng mục|Item', 'Giá trị|Value', 'Hạng mục|Item', 'Giá trị|Value'], [
      [T('Nhiệt độ khí hút thiết kế|Design inlet air temperature'), n(b.T1, 0) + ' °C', T('Nhiệt độ khí ra máy|Blower discharge temperature'), n(b.T2, 1) + ' °C'], [T('Nhiệt độ tại đầu ống đứng|Temperature at dropleg'), n(h0.Tdrop, 1) + ' °C', T('Giới hạn vật liệu ống đứng|Dropleg material limit'), `${h0.matLim} °C`],
      [T('Nhiệt nén vào dòng khí|Compression heat to air'), n(h0.Qair, 1) + ' kW', T('Tổn thất động cơ + biến tần|Motor + VFD losses'), n(h0.loss, 1) + ' kW'], [T('Bức xạ vỏ máy|Casing radiation'), n(h0.rad, 1) + ' kW', T('Tỏa nhiệt ống trong phòng|Pipe heat in room'), n(h0.pipeRoom, 1) + ' kW'],
      ['<b>' + T('Nhiệt thải phòng máy|Blower room heat load') + '</b>', '<b>' + n(h0.Qroom, 1) + ' kW</b>', '<b>' + T('Thông gió|Ventilation') + '</b>', `<b>${n(h0.vent, 0)} m³/h</b>`], [T('Khí hút máy thổi (nếu hút trong phòng)|Blower intake air (if drawn from room)'), n(h0.Qinlet, 0) + ' m³/h', T('Tổng gió cấp vào phòng|Total supply air to room'), n(h0.vent + h0.Qinlet, 0) + ' m³/h'],
      [T('Giãn nở ống góp|Header expansion'), n(h0.dL, 0) + ' mm', T('Số khớp giãn nở|Expansion joints'), h0.nJoint], [T('Nước ngưng trong lưới|Condensate in grid'), T(`${n(h0.condDay, 1)} kg/ngày|${n(h0.condDay, 1)} kg/d`), T('Quy tắc handbook|Handbook rule'), '≈ 10 °C / 10 kPa']], 9)
      + `<h3>${T('Nhiệt độ khí dọc ống góp|Air temperature along header')}</h3><div class="drw">${svg}</div>`;
  };
  V.drw = () => {
    const ms = DRW.all(S, R.sel);
    return `<h2>${T('Bản vẽ sơ bộ|Preliminary drawings')}</h2><p class="note">${T('Xuất PDF (khổ A3 ngang qua hộp thoại in) hoặc DXF R12 mở được bằng AutoCAD/LibreCAD – lớp AER_*, đơn vị m.|Export PDF (A3 landscape via print dialog) or DXF R12 for AutoCAD/LibreCAD – layers AER_*, units m.')}</p>` + ms.map(m => `<div class="drw">${DRW.svg(m, 1100, 640)}</div>`).join('');
  };
  V.rep = () => `<div class="rep repv">${REP.html(S, R)}</div>`;

  APP.show = () => {
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.t === tab ? 'true' : 'false'));
    $('#view').innerHTML = V[tab]();
  };

  // ---- xuất ----
  const fname = ext => (S.proj.code || 'AER').replace(/[^\w\-]+/g, '_') + '_' + (R.sel.key) + '.' + ext;
  APP.printHTML = (html, cls, landscape) => {
    const p = $('#print'); p.className = 'print ' + cls; p.innerHTML = html;
    let st = document.getElementById('pgsz'); if (!st) { st = document.createElement('style'); st.id = 'pgsz'; document.head.appendChild(st); }
    st.textContent = `@media print { @page { size: ${landscape ? 'A3 landscape' : 'A4 portrait'}; } }`;
    const t = document.title; document.title = fname('pdf').replace(/\.pdf$/, '');
    setTimeout(() => { window.print(); document.title = t; }, 60);
  };
  APP.pdfReport = () => APP.printHTML(`<div class="rep">${REP.html(S, R)}</div>`, 'rep', false);
  APP.pdfDrawings = () => {
    const ms = DRW.all(S, R.sel), d = S.proj.date || new Date().toLocaleDateString('vi-VN');
    APP.printHTML(ms.map((m, i) => `<figure>${DRW.svg(m, 1500, 960)}<div class="tb"><div><b>${T(m.title)}</b>${E(S.proj.name)}</div><div>${T(`Bản vẽ AER-${String(i + 1).padStart(2, '0')}|Drawing AER-${String(i + 1).padStart(2, '0')}`)}</div><div>Rev ${E(S.proj.rev)} · ${E(d)}</div><div>${T('Lập: ' + (S.proj.by || '') + '|Prepared by: ' + (S.proj.by || ''))}${T('Sơ bộ – không theo tỷ lệ|Preliminary – not to scale')}</div></div></figure>`).join(''), 'dwg', true);
  };
  APP.dxf = () => ZIP.save(fname('dxf'), DRW.dxf(DRW.all(S, R.sel), { proj: S.proj.name, rev: S.proj.rev, date: S.proj.date || new Date().toLocaleDateString('vi-VN') }), 'application/dxf');
  APP.xlsx = () => ZIP.save(fname('xlsx'), XLS.workbook(S, R), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  APP.docx = async () => { const b = $('#bDocx'); b.disabled = true; try { ZIP.save(fname('docx'), await REP.docx(S, R), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); } finally { b.disabled = false; } };

  APP.init = () => {
    S = APP.load();
    APP.form();
    $('#inputs').addEventListener('change', APP.onInput);
    // nút có dòng tiếng Anh (span) bên trong → lấy phần tử có data-* gần nhất
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; APP.show(); } });
    $('#view').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) APP.pick(b.dataset.pick); });
    $('#bNew').onclick = () => { if (confirm('Khôi phục toàn bộ số liệu mặc định?\nRestore all default values?')) { S = clone(DEF); APP.form(); APP.run(); } };
    $('#bSave').onclick = () => ZIP.save((S.proj.code || 'du_an') + '.aer.json', JSON.stringify(S, null, 1), 'application/json');
    $('#bOpen').onclick = () => $('#fOpen').click();
    $('#fOpen').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { S = merge(clone(DEF), JSON.parse(t)); APP.form(); APP.run(); } catch (er) { alert('Tệp không hợp lệ / Invalid file: ' + er.message); } }); e.target.value = ''; };
    $('#bXlsx').onclick = APP.xlsx; $('#bDocx').onclick = APP.docx; $('#bPdfR').onclick = APP.pdfReport; $('#bPdfD').onclick = APP.pdfDrawings; $('#bDxf').onclick = APP.dxf;
    APP.run();
  };
  APP.state = () => ({ S, R });
  document.addEventListener('DOMContentLoaded', APP.init);
})();
