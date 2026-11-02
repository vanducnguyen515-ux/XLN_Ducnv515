'use strict';
/* ==========================================================================
   SimXLNT – Giao diện kết quả cho SBR, MBR, MBBR/IFAS, bể phân hủy; tab Điều khiển (PID)
   ========================================================================== */

function extraUnitCards(sys, det, d) {
  const m = sys.m, p = sys.p20;
  let h = '';
  // SBR
  for (const cu of sys.units.filter(c => CYC.has(c.type))) {
    const info = det.U[cu.id], q = cu.p;
    const title = { sbr: 'SBR', iceas: 'ICEAS (Xylem)', ctech: 'C-Tech (SFC)' }[cu.type];
    const aerT = cu.phases.filter(x => x.aer).reduce((a, x) => a + x.t1 - x.t0, 0);
    const Qd = info.Qin || 0, dV = cu.Vmax - cu.Vmin;
    const cyc = d.kind === 'ss' && APP.ss && APP.ss.cycle ? APP.ss.cycle : null;
    // lớp bùn – mức nước khi gạn (thấp nhất trong chu kỳ, bể 1)
    let clr = NaN, effTSSmax = NaN, xwas = NaN;
    if (cyc) {
      const dd = cyc.snaps.map(s => s.U[cu.id].tanks[0]).filter(t => t.phase === 'decant');
      if (dd.length) { clr = Math.min(...dd.map(t => t.clr)); effTSSmax = Math.max(...dd.map(t => t.TSSe)); xwas = dd.reduce((a, t) => a + t.Xwas, 0) / dd.length; }
    }
    h += `<div class="card"><h2>${title} – ${esc(cu.u.name)}</h2><div class="kpis">
      ${kpi('Số bể', cu.N, '')}${kpi('Chu kỳ', cu.Tc * 24, 'h')}${kpi('Số chu kỳ/ngày/bể', 1 / cu.Tc, '')}${kpi('Thời gian sục khí', aerT / cu.Tc * 100, '% chu kỳ')}
      <div class="kpi"><div class="k">Mực nước TWL / BWL</div><div class="v">${fmt(cu.H)} / ${fmt(cu.Vmin / cu.A)}<small>m</small></div></div>${kpi('ΔH gạn thiết kế', dV / cu.A, 'm')}${kpi('Tỷ lệ gạn', dV / cu.Vmax * 100, '%')}${kpi('Thể tích gạn/chu kỳ/bể', dV, 'm³')}
      ${kpi('Lưu lượng gạn cần thiết/chu kỳ/bể', Qd * cu.Tc / cu.N, 'm³')}${kpi('MLSS trung bình', m.composites(info.C, p, {}).TSS, 'mg/L')}
      ${cu.Vp > 0 ? kpi(cu.type === 'iceas' ? 'Ngăn tiền phản ứng' : 'Ngăn chọn lọc', cu.Vp, 'm³/bể') : ''}
      ${cu.svi > 0 ? kpi('SVI', cu.svi, 'mL/g') : ''}
      ${cu.svi > 0 && isFinite(clr) ? `<div class="kpi ${clr >= 0.6 ? 'ok' : 'bad'}"><div class="k">Khoảng cách lớp bùn – mặt nước khi gạn (nhỏ nhất)</div><div class="v">${fmt(clr)}<small>m (khuyến nghị ≥ 0,6)</small></div></div>` : ''}
      ${cu.svi > 0 && isFinite(effTSSmax) ? kpi('TSS nước gạn lớn nhất', effTSSmax, 'mg/L') : ''}
      ${cu.wasThick && isFinite(xwas) ? kpi('TSS bùn xả (rút đáy)', xwas, 'mg/L') : ''}</div>`;
    if (Qd * cu.Tc / cu.N > dV * 1.02) h += `<div class="msg warn">Thể tích gạn thiết kế (${fmt(dV)} m³/bể) nhỏ hơn lượng nước vào mỗi chu kỳ (${fmt(Qd * cu.Tc / cu.N)} m³/bể) → mực nước sẽ dâng dần quá TWL. Tăng diện tích/ΔH hoặc giảm chu kỳ.</div>`;
    if (!det.avg) {
      h += `<table class="t" style="max-width:1000px;margin-top:10px"><tr><th class="l">Bể</th><th class="l">Pha</th><th>V m³</th><th>Mực nước m</th><th>Lớp bùn m</th><th>kLa</th><th>DO</th><th>MLSS</th><th>NH₄</th><th>NOx</th>${m.fam === 'ASM2d' ? '<th>PO₄</th>' : ''}<th>pH</th></tr>`;
      info.tanks.forEach((t, k) => { const c = m.composites(t.C, p, {}); h += `<tr><td class="l">${k + 1}</td><td class="l">${SBR_PHASE[t.phase]}</td><td>${fmt(t.V)}</td><td>${fmt(t.hw)}</td><td>${fmt(t.hb)}</td><td>${fmt(t.kla)}</td><td>${fmt(c.DO)}</td><td>${fmt(c.TSS)}</td><td>${fmt(c.NH4)}</td><td>${fmt(c.NOx)}</td>${m.fam === 'ASM2d' ? `<td>${fmt(c.PO4)}</td>` : ''}<td>${fmt(t.pH)}</td></tr>`; });
      h += '</table>';
    }
    if (cyc) h += `<h3>Diễn biến một chu kỳ ở trạng thái tuần hoàn (bể 1)</h3><div class="grid2"><div class="chartBox" style="height:280px"><canvas id="sbrC_${cu.id}"></canvas></div><div class="chartBox" style="height:280px"><canvas id="sbrV_${cu.id}"></canvas></div></div>`;
    const note = {
      sbr: `Gạn với TSS nước gạn cố định ${q.TSSe} mg/L (tách lý tưởng). ${q.feed === 'cont' ? 'Nạp liên tục vào mọi bể.' : 'Nạp theo mẻ: chỉ bể đang ở pha nạp nhận nước.'}`,
      iceas: `${q.feed === 'batch' ? `Nạp gián đoạn như SBR: mỗi bể nhận toàn bộ dòng vào trong Tc/N, luân phiên giữa ${cu.N} bể (nạp khuấy thiếu khí rồi nạp sục khí), không nạp khi lắng/gạn; nước qua ngăn tiền phản ứng (${fmt(+q.fPre * 100)} % diện tích) khi nạp.` : `Nạp liên tục vào ngăn tiền phản ứng (${fmt(+q.fPre * 100)} % diện tích, không sục khí) rồi tràn qua vách ngăn sang vùng chính, kể cả khi lắng/gạn.`} Chu kỳ ${q.mode === 'custom' ? 'tự đặt' : q.mode}: ${cu.phases.map(x => SBR_PHASE[x.k] + ' ' + fmt((x.t1 - x.t0) * 1440) + '′').join(' → ')}.`,
      ctech: `Nạp theo mẻ vào ngăn chọn lọc (${fmt(+q.fSel * 100)} % diện tích) cùng bùn hồi lưu ${fmt(+q.rRAS * 100)} % dòng nạp bơm từ vùng chính; chu kỳ: ${cu.phases.map(x => SBR_PHASE[x.k] + ' ' + fmt((x.t1 - x.t0) * 1440) + '′').join(' → ')}.`
    }[cu.type];
    if (cu.layered && cyc) h += `<h3>Mặt cắt TSS theo chiều sâu (bể 1) – cuối pha lắng & cuối pha gạn</h3><div class="chartBox" style="height:260px"><canvas id="sbrP_${cu.id}"></canvas></div>`;
    if (cu.layered) h += `<p class="small muted">Mô hình lắng phân tầng: ${cu.nL} lớp TSS co giãn theo mực nước; lắng Takács (v₀ = ${fmt(cu.tk.v0 / 24)} m/h, r_h = ${cu.tk.rh.toExponential(2)}, r_p = ${cu.tk.rp.toExponential(2)} m³/g, f_ns = ${cu.tk.fns}) từ SVI ${fmt(cu.svi)}, giới hạn nén ${fmt(1.2e6 / cu.svi)} mg/L; nước vào và rút bùn ở lớp đáy, gạn ở lớp mặt (TSS nước gạn = lớp mặt). Thành phần bùn coi như đồng nhất theo chiều sâu.</p>`;
    h += `<p class="small muted">${note} ${!cu.layered && cu.svi > 0 ? 'Lắng: vận tốc lắng vùng theo SVI (tương quan Daigger 1995, M&amp;E 5th), lớp bùn hạ dần tới chiều cao bùn nén (khối lượng × SVI); ống gạn hút lớp nước trên cùng – khi lớp bùn cách mặt nước &lt; 0,6 m, TSS nước gạn tăng dần tới MLSS. Bùn xả rút đáy trong pha gạn với nồng độ cô đặc theo lớp bùn.' : ''} Phản ứng sinh học vẫn diễn ra khi lắng/gạn.</p></div>`;
  }
  // MBR
  const mbrs = sys.units.filter(c => c.type === 'mbr');
  if (mbrs.length) {
    h += `<div class="card"><h2>Bể màng MBR</h2><table class="t" style="max-width:1000px"><tr><th class="l">Bể</th><th>Diện tích màng m²</th><th>Thông lượng L/m²/h</th><th>Khí rửa màng Nm³/h</th><th>kLa từ khí rửa 1/d</th><th>Công suất rửa màng kW</th><th>MLSS</th><th>Retentate m³/d</th></tr>`;
    for (const cu of mbrs) {
      const i = det.U[cu.id];
      h += `<tr><td class="l">${esc(cu.u.name)}</td><td>${fmt(+cu.p.Am)}</td><td>${fmt(i.flux)}</td><td>${fmt(i.scourAir / 24)}</td><td>${fmt(cu.klaScour)}</td><td>${fmt(i.Pscour)}</td><td>${fmt(m.composites(i.C, p, {}).TSS)}</td><td>${fmt(det.Q[cu.outs.und])}</td></tr>`;
    }
    h += `</table><p class="small muted">Màng giữ lại toàn bộ chất rắn (TSS nước thấm = 0), chất hòa tan đi qua. Thông lượng thiết kế điển hình 15–25 L/m²/h (trung bình).</p></div>`;
  }
  // MBBR / IFAS
  for (const cu of sys.units.filter(c => c.type === 'mbbr')) {
    const i = det.U[cu.id];
    h += `<div class="card"><h2>Màng sinh học – ${esc(cu.u.name)}</h2><div class="kpis">
      ${kpi('Diện tích màng', i.Af, 'm²')}${kpi('Sinh khối bám dính', i.attached, 'kg TSS')}${kpi('Tải NH₄ bề mặt', i.SALR_NH, 'g N/m²/d')}${kpi('Thông lượng O₂', i.SALR_O2, 'g/m²/d')}
      ${kpi('Tải COD dễ PH', i.SALR_COD, 'g/m²/d')}${kpi('NO₃ màng thải ra (+) / hấp thụ (−)', -i.SALR_NO, 'g N/m²/d')}</div>
      <div class="grid2"><div class="chartBox" style="height:280px"><canvas id="bf_${cu.id}"></canvas></div><div>
      <table class="t"><tr><th>Lớp (từ giá thể)</th><th>TSS</th><th>Dị dưỡng %</th><th>Nitrat hóa %</th><th>Trơ %</th><th>DO</th><th>NH₄</th><th>NOx</th></tr>
      ${i.layers.map((l, j) => { const t = l.TSS || 1, tf = sys.tssF; const f = id => tf[m.idx[id]] * l.C[m.idx[id]] / t * 100; const inert = m.fam === 'ASM1' ? f('XP') + f('XI') : f('XI') + (m.idx.XE !== undefined ? f('XE') : 0); return `<tr><td>${j + 1}</td><td>${fmt(l.TSS)}</td><td>${fmt(f(m.HET))}</td><td>${fmt(f(m.AUT))}</td><td>${fmt(inert)}</td><td>${fmt(l.DO)}</td><td>${fmt(l.NH4)}</td><td>${fmt(l.NOx)}</td></tr>`; }).join('')}</table>
      <p class="small muted">Mô hình màng một chiều ${i.nLay} lớp × ${fmt(i.Lf / i.nLay)} µm, khuếch tán Fick + lớp biên, mật độ chất rắn giữ ≈ ${fmt(+cu.p.XfTSS)} g/m³ (phần sinh ra dư bị bong tróc vào nước).</p></div></div></div>`;
  }
  // bể phân hủy
  // bể kỵ khí tốc độ cao (xử lý nước thải)
  const anrs = sys.units.filter(c => c.type === 'anr');
  if (anrs.length) {
    h += `<div class="card"><h2>Bể kỵ khí tốc độ cao (ADM1, lưu giữ bùn)</h2><div class="tscroll"><table class="t"><tr><th class="l">Bể</th><th class="l">Công nghệ</th><th>V m³</th><th>T °C</th><th>HRT h</th><th>SRT ngày</th><th>OLR kg COD/m³·ngđ</th><th>COD vào</th><th>COD ra</th><th>sCOD ra</th><th>Khử COD %</th><th>TSS ra</th><th>pH</th><th>VFA mg COD/L</th><th>CH₄ Nm³/d</th><th>Biogas Nm³/d</th><th>% CH₄</th><th>CH₄ m³/kg COD khử</th><th>Bùn dư kg/d</th></tr>`;
    for (const cu of anrs) {
      const i = det.U[cu.id];
      h += `<tr><td class="l">${esc(cu.u.name)}</td><td class="l">${esc(cu.p.kind || '')}</td><td>${fmt(i.V)}</td><td>${fmt(+cu.p.T)}</td><td>${fmt(i.HRTh)}</td><td>${fmt(i.SRT)}</td><td>${fmt(i.OLR)}</td><td>${fmt(i.CODin)}</td><td>${fmt(i.CODout)}</td><td>${fmt(i.sCODout)}</td><td>${fmt(i.Eff)}</td><td>${fmt(i.TSSe)}</td><td>${fmt(i.pH)}</td><td>${fmt(i.VFA)}</td><td>${fmt(i.CH4)}</td><td>${fmt(i.biogas)}</td><td>${fmt(i.pCH4)}</td><td>${fmt(i.yCH4, 3)}</td><td>${fmt(i.Mw)}</td></tr>`;
    }
    h += `</table></div><p class="small muted">ADM1 (BSM2) cho cả bể; chất hạt (sinh khối kỵ khí, chất trơ) được giữ lại với tuổi bùn SRT ≫ HRT – rời bể với tốc độ V·X/SRT, phần "bùn dư" rút đáy theo lưu lượng đặt, phần còn lại trôi theo nước ra. Động học ADM1 ở 35 °C (không hiệu chỉnh nhiệt độ tốc độ) – với nước thải 20–30 °C nên đặt SRT dài và kiểm tra lại hiệu suất theo thực tế. Khí CH₄ hòa tan trong nước ra coi như thoát ra.</p></div>`;
  }
  const digs = sys.units.filter(c => c.type === 'digester');
  if (digs.length) {
    h += `<div class="card"><h2>Bể phân hủy kỵ khí (ADM1)</h2><div class="tscroll"><table class="t"><tr><th class="l">Bể</th><th>V lỏng/khí m³</th><th>T °C</th><th>HRT ngày</th><th>pH</th><th>CH₄ Nm³/d</th><th>CO₂ Nm³/d</th><th>Biogas Nm³/d</th><th>% CH₄</th><th>P khí bar</th><th>Phân hủy VSS %</th><th>NH₄ mgN/L</th>${m.fam === 'ASM2d' ? '<th>PO₄ mgP/L</th>' : ''}<th>Điện CHP kWh/d</th></tr>`;
    for (const cu of digs) {
      const i = det.U[cu.id], c = m.composites(i.C, p, {});
      h += `<tr><td class="l">${esc(cu.u.name)}</td><td>${fmt(i.V)} / ${fmt(i.Vgas)}</td><td>${fmt(+cu.p.T)}</td><td>${fmt(i.HRT)}</td><td>${fmt(i.pH)}</td><td>${fmt(i.CH4)}</td><td>${fmt(i.CO2Nm3)}</td><td>${fmt(i.biogas)}</td><td>${fmt(i.pCH4)}</td><td>${fmt(i.Pgas)}</td><td>${fmt(i.VSSdes)}</td><td>${fmt(c.NH4)}</td>${m.fam === 'ASM2d' ? `<td>${fmt(c.PO4)}</td>` : ''}<td>${fmt(i.kWh)}</td></tr>`;
    }
    h += `</table></div>`;
    for (const cu of digs) {
      const i = det.U[cu.id], xd = i.xd, A = ADM.I, g = id => xd[A[id]];
      const ok = v => v > 0.9 ? 'ok' : v > 0.6 ? '' : 'bad';
      h += `<h3>${esc(cu.u.name)} – trạng thái ADM1 & chỉ số ổn định</h3><div class="kpis">
        <div class="kpi"><div class="k">VFA tổng</div><div class="v">${fmt(i.VFA)}<small>mg COD/L</small></div></div>
        <div class="kpi"><div class="k">Acetat / Propionat</div><div class="v">${fmt(g('Sac'))} / ${fmt(g('Spro'))}<small>mg COD/L</small></div></div>
        <div class="kpi"><div class="k">Độ kiềm bicarbonat</div><div class="v">${fmt(i.alkHCO3)}<small>mg CaCO₃/L</small></div></div>
        <div class="kpi"><div class="k">VFA / độ kiềm</div><div class="v">${fmt(i.VFA * 50 / 60 / Math.max(i.alkHCO3, 1))}<small>(&lt; 0,3 ổn định)</small></div></div>
        <div class="kpi"><div class="k">NH₃ tự do</div><div class="v">${fmt(i.Snh3)}<small>mg N/L</small></div></div>
        <div class="kpi"><div class="k">H₂ hòa tan</div><div class="v">${(g('Sh2') / 1000).toExponential(2)}<small>kg COD/m³</small></div></div>
        <div class="kpi ${ok(i.IpHac)}"><div class="k">Hệ số ức chế pH – methan acetat</div><div class="v">${fmt(i.IpHac)}</div></div>
        <div class="kpi ${ok(i.Inh3)}"><div class="k">Hệ số ức chế NH₃ – methan acetat</div><div class="v">${fmt(i.Inh3)}</div></div>
        <div class="kpi ${ok(i.Ih2pro)}"><div class="k">Hệ số ức chế H₂ – propionat</div><div class="v">${fmt(i.Ih2pro)}</div></div>
        <div class="kpi"><div class="k">pCH₄ / pCO₂ / pH₂</div><div class="v">${fmt(i.pch4)} / ${fmt(i.pco2)} / ${i.ph2.toExponential(1)}<small>bar</small></div></div></div>
        <details class="adv"><summary>Toàn bộ biến trạng thái ADM1</summary><table class="t" style="max-width:700px"><tr><th class="l">Biến</th><th class="l">Tên</th><th>Giá trị</th><th class="l">Đơn vị</th></tr>
        ${ADM.ids.map((id, k) => `<tr><td class="l"><code>${id}</code></td><td class="l small">${ADM.names[id]}</td><td>${fmt(xd[k] / (k <= 23 || (k >= 26 && k <= 27) ? 1000 : (k <= 28 ? 1000 : 1)))}</td><td class="l small muted">${k === 9 || k === 10 || k === 24 || k === 25 || k === 28 ? 'kmol/m³' : k <= 27 ? 'kg COD/m³' : 'g/m³'}</td></tr>`).join('')}</table></details>`;
    }
    h += `<p class="small muted">ADM1 (Batstone et al. 2002) theo hiệu chỉnh BSM2 (Rosen &amp; Jeppsson 2006): 19 quá trình sinh hóa, trao đổi khí H₂/CH₄/CO₂, pH giải đại số, ức chế pH/H₂/NH₃/thiếu N. Dòng vào ASM được quy đổi sang ADM1 (nhu cầu O₂/NO₃ trừ vào COD dễ phân hủy; hữu cơ hạt phân hủy được → carbohydrat/protein/lipid theo tỷ lệ giao diện; phần trơ → XI; N, C, P dư → dạng vô cơ; polyP → phosphat); dòng ra quy đổi ngược về ASM, bảo toàn COD, N, P, C và điện tích. Tham số sửa ở tab Mô hình.</p></div>`;
  }
  h += blowerCards(sys, det);
  // bộ điều khiển
  if (sys.ctrls && sys.ctrls.length && det.CT) {
    h += `<div class="card"><h2>Bộ điều khiển</h2><table class="t" style="max-width:900px"><tr><th class="l">Tên</th><th class="l">Đo</th><th>Đặt</th><th>Đo được</th><th class="l">Tác động</th><th>Tín hiệu</th><th>Giới hạn</th></tr>`;
    for (const k of sys.ctrls) {
      const ct = det.CT[k.c.id];
      const act = (ACTUATORS[k.au.type] || []).find(a => a[0] === k.c.act);
      h += `<tr><td class="l">${esc(k.c.name || k.c.id)}</td><td class="l small">${k.mu ? esc(k.mu.u.name) + ' (trong bể)' : esc(linkName(sys.links[k.li]))} · ${k.v}</td><td>${fmt(k.sp)}</td><td>${fmt(ct.meas)}</td><td class="l small">${esc(k.au.u.name)} · ${act ? act[1] : k.c.act}</td><td>${fmt(ct.u)}</td><td>${(ct.u <= k.umin + 1e-9 || ct.u >= k.umax - 1e-9) ? '<b style="color:var(--bad)">bão hòa</b>' : 'trong khoảng'}</td></tr>`;
    }
    h += `</table></div>`;
  }
  h += nitroCard(sys, det);
  h += extUnitsCard(sys, det);
  return h;
}

/* tiền xử lý, hóa lý, thiết bị tách, xử lý bùn, AOP, BAF, PFR, điều hòa (js/units_ext.js) */
function extUnitsCard(sys, det) {
  if (typeof UNITX === 'undefined') return '';
  const bad = v => v == null || (typeof v === 'number' && !isFinite(v)) || (typeof v === 'string' && /undefined|NaN/.test(v));
  const list = sys.units.filter(cu => (UNITX[cu.type] && UNITX[cu.type].rep) || cu.type === 'baf');
  if (!list.length) {
    // chỉ có đơn vị "Châm hóa chất": vẫn hiện bảng hóa chất tiêu thụ (liều, dung dịch, L/h)
    const S = sys.units.some(cu => cu.type === 'dose') ? plantSummary(sys, det) : null;
    return S && S.chem.length ? `<div class="card"><h2>Hóa chất châm</h2>${chemTable(S)}</div>` : '';
  }
  let h = `<div class="card"><h2>Tiền xử lý · hóa lý · thiết bị tách · xử lý bùn · AOP</h2><div class="tscroll"><table class="t"><tr><th class="l">Thiết bị</th><th class="l">Chỉ tiêu</th><th>Giá trị</th><th class="l">Đơn vị</th></tr>`;
  for (const cu of list) {
    const info = det.U[cu.id] || {};
    let rows = [];
    try { rows = cu.type === 'baf' ? UNITX_REP_BAF(info) : UNITX[cu.type].rep(info); } catch (e) { rows = []; }
    rows = rows.filter(r => !bad(r[1]));
    if (info.kW > 0) rows.push(['Công suất điện', info.kW, 'kW']);
    if (info.Qin != null) rows.unshift(['Lưu lượng vào', info.Qin, 'm³/d']);
    const lab = (UT[cu.type] && UT[cu.type].label) || cu.type;
    rows.forEach((r, i) => {
      h += `<tr>${i === 0 ? `<td class="l" rowspan="${rows.length}"><b>${esc(cu.u.name)}</b><br><span class="small muted">${esc(lab)}</span></td>` : ''}<td class="l">${esc(r[0])}</td><td>${typeof r[1] === 'number' ? fmt(r[1]) : esc(r[1])}</td><td class="l small muted">${esc(r[2] || '')}</td></tr>`;
    });
  }
  h += '</table></div>';
  const S = plantSummary(sys, det);
  if (S.chem && S.chem.length) h += chemTable(S);

  if (S.Pext > 0) h += `<p class="small muted">Điện năng các thiết bị trên: ${fmt(S.Pext)} kW (${fmt(S.Pext * 24)} kWh/d) – đã cộng vào điện năng toàn nhà máy.</p>`;
  return h + '</div>';
}

const chemTable = S => `<h3>Hóa chất tiêu thụ</h3><table class="t" style="max-width:720px"><tr><th class="l">Thiết bị</th><th class="l">Hóa chất</th><th>kg/d</th><th>Dung dịch</th><th>L/h</th></tr>${S.chem.filter(c => c.kg > 1e-6).map(c => `<tr><td class="l">${esc(c.unit)}</td><td class="l">${esc(c.name)}</td><td>${fmt(c.kg)}</td><td>${c.sol > 0 ? (c.sol < 1 ? fmt(c.sol * 100) + ' %' : 'thương phẩm') + (c.rho ? ', ρ ' + fmt(c.rho) : '') : '–'}</td><td>${c.sol > 0 ? fmt(c.kg / c.sol / (c.rho || 1) / 24) : '–'}</td></tr>`).join('')}</table>`;

function drawExtraCharts(sys, det, d) {
  const m = sys.m, p = sys.p20;
  drawBlowerCharts(sys, det);
  for (const cu of sys.units.filter(c => c.type === 'mbbr')) {
    const cv = $('#bf_' + cu.id); if (!cv) continue;
    const i = det.U[cu.id], dz = i.Lf / i.nLay;
    const xs = i.layers.map((l, j) => (j + 0.5) * dz);
    const bulk = m.composites(i.C, p, {});
    xs.push(i.Lf + 20);
    const ser = [['DO', 'O₂'], ['NH4', 'NH₄-N'], ['NOx', 'NOx-N']].map(([k, lab]) => ({ label: lab, x: xs, y: i.layers.map(l => l[k]).concat([bulk[k]]), marks: true }));
    new LineChart(cv, { xlabel: 'Khoảng cách từ giá thể (µm) – điểm cuối là nước', ylabel: 'mg/L' }).set(ser);
  }
  if (d.kind === 'ss' && APP.ss && APP.ss.cycle) {
    const cyc = APP.ss.cycle;
    for (const cu of sys.units.filter(c => CYC.has(c.type))) {
      const c1 = $('#sbrC_' + cu.id), c2 = $('#sbrV_' + cu.id); if (!c1) continue;
      const hrs = cyc.times.map(t => t * 24);
      const comp = cyc.snaps.map(s => m.composites(s.U[cu.id].tanks[0].C, p, {}));
      const keys = [['DO', 'DO'], ['NH4', 'NH₄-N'], ['NOx', 'NOx-N']].concat(m.fam === 'ASM2d' ? [['PO4', 'PO₄-P']] : []);
      new LineChart(c1, { xlabel: 'Giờ trong chu kỳ', ylabel: 'mg/L' }).set(keys.map(([k, lab]) => ({ label: lab, x: hrs, y: comp.map(c => c[k]) })));
      const cp = $('#sbrP_' + cu.id);
      if (cp) {
        const tks = cyc.snaps.map(s => s.U[cu.id].tanks[0]);
        const lastOf = ph => { let r = null; tks.forEach(t => { if (t.phase === ph) r = t; }); return r; };
        const ser = [];
        for (const [ph, lab, col] of [['settle', 'Cuối pha lắng', '#9a7536'], ['decant', 'Cuối pha gạn', '#dc2626']]) {
          const t = lastOf(ph); if (!t || !t.prof) continue;
          const dz = t.hw / t.prof.length;
          ser.push({ label: lab + ' (mực nước ' + fmt(t.hw) + ' m)', x: t.prof, y: t.prof.map((v, j) => (j + 0.5) * dz), color: col, marks: true });
        }
        const t0 = tks[0];
        if (t0 && t0.prof) ser.push({ label: 'Đầu chu kỳ (đang khuấy)', x: t0.prof, y: t0.prof.map((v, j) => (j + 0.5) * t0.hw / t0.prof.length), color: '#2563eb', dash: [5, 4] });
        new LineChart(cp, { xlabel: 'TSS (mg/L)', ylabel: 'Cao độ từ đáy (m)' }).set(ser);
      }
      if (cu.svi > 0) {
        // bể 1: mực nước & lớp bùn; mức nước thấp BWL
        const t0s = cyc.snaps.map(s => s.U[cu.id].tanks[0]);
        new LineChart(c2, { xlabel: 'Giờ trong chu kỳ', ylabel: 'Cao độ từ đáy bể (m)', zero: true }).set([
          { label: 'Mực nước', x: hrs, y: t0s.map(t => t.hw), color: '#2563eb' },
          { label: 'Mặt lớp bùn', x: hrs, y: t0s.map(t => t.hb), color: '#9a7536' },
          { label: 'BWL', x: [hrs[0], hrs[hrs.length - 1]], y: [cu.Vmin / cu.A, cu.Vmin / cu.A], color: '#6b7280', dash: [5, 4] },
          { label: 'TSS nước gạn /100 (mg/L)', x: hrs, y: t0s.map(t => t.phase === 'decant' ? t.TSSe / 100 : NaN), color: '#dc2626', width: 1.5 }
        ]);
      } else {
        const vs = [];
        for (let k = 0; k < cu.N; k++) vs.push({ label: 'V bể ' + (k + 1), x: hrs, y: cyc.snaps.map(s => s.U[cu.id].tanks[k].V) });
        new LineChart(c2, { xlabel: 'Giờ trong chu kỳ', ylabel: 'Thể tích (m³)', zero: false }).set(vs);
      }
    }
  }
}


/* ASM1N: quần thể vi sinh chuyển hóa nitơ (AOB, NOB, anammox, comammox) và các dạng N trung gian */
function nitroCard(sys, det) {
  const m = sys.m; if (!m.nitro) return '';
  const S = plantSummary(sys, det);
  const rows = S.reactors.map(r => {
    const c = m.composites(r.info.C, Object.assign({}, sys.p20, r.cu.Tl ? { T_: r.cu.Tl } : {}), {});
    const tot = c.AOB + c.NOB + c.AMX + c.CMX, pc = v => tot > 1e-9 ? fmt(v / tot * 100) : '–';
    return `<tr><td class="l">${esc(r.cu.u.name)}</td><td>${fmt(r.cu.Tl || sys.pl.T)}</td><td>${fmt(c.DO)}</td><td>${fmt(c.pH)}</td><td>${fmt(c.NH4)}</td><td>${fmt(c.NO2)}</td><td>${fmt(c.NO3)}</td><td>${fmt(c.FA)}</td><td>${fmt(c.FNA * 1000)}</td>
      <td>${fmt(c.AOB)}</td><td>${fmt(c.NOB)}</td><td>${fmt(c.AMX)}</td><td>${fmt(c.CMX)}</td><td class="small">${pc(c.AOB)} / ${pc(c.NOB)} / ${pc(c.AMX)} / ${pc(c.CMX)}</td></tr>`;
  }).join('');
  if (!rows) return '';
  const eff = S.sinks.filter(s => s.cu.type === 'effluent').map(s => `${esc(s.cu.u.name)}: NH₄ ${fmt(s.c.NH4)} · NO₂ ${fmt(s.c.NO2)} · NO₃ ${fmt(s.c.NO3)} · TN ${fmt(s.c.TN)} mg/L`).join('<br>');
  return `<div class="card"><h2>Quần thể vi sinh chuyển hóa nitơ (ASM1N)</h2><div class="tscroll"><table class="t"><tr><th class="l">Bể</th><th>T °C</th><th>DO</th><th>pH</th><th>NH₄-N</th><th>NO₂-N</th><th>NO₃-N</th><th>FA mgN/L</th><th>FNA µgN/L</th>
    <th>AOB</th><th>NOB</th><th>Anammox</th><th>Comammox</th><th>Tỷ lệ AOB/NOB/AMX/CMX %</th></tr>${rows}</table></div>
    <p class="small muted">Sinh khối tính bằng mg COD/L. FA = amoniac tự do, FNA = axit nitrơ tự do (Anthonisen 1976) – ức chế NOB khi FA &gt; 1 mg/L hoặc FNA &gt; 0,2 mg/L. Nitrit hóa tắt (NOB bị loại) khi NO₂ tích lũy và NOB ≈ 0; PN/A hoạt động khi AMX chiếm ưu thế và NO₂ thấp.</p>
    ${eff ? `<p class="small">${eff}</p>` : ''}</div>`;
}
