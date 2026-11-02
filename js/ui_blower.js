'use strict';
/* ==========================================================================
   SimXLNT – Trạm máy thổi khí: chọn vùng cấp khí, thẻ kết quả, đường đặc tính
   ========================================================================== */
const AERATED = u => ['cstr', 'mbr', 'mbbr'].includes(u.type) ? u.p.aer !== 'none' : CYC.has(u.type);

function blowerZonesUI(u) {
  const P = APP.P, box = el(`<div class="card" style="margin-top:10px;padding:10px"><b>Các bể được cấp khí</b>
    <p class="small muted" style="margin:4px 0">Không chọn bể nào = tự cấp cho mọi bể đang sục khí. DO của mỗi bể được giữ bằng vòng PI điều chỉnh lưu lượng khí (thay cho bộ điều khiển DO lý tưởng của bể); tổng khí bị giới hạn bởi năng lực các máy làm việc và lưu lượng tối thiểu (turndown).</p><div class="zl"></div>
    <div class="btnrow"><button class="sz">Tự định cỡ máy thổi theo kết quả hiện có</button></div></div>`);
  const zl = box.querySelector('.zl');
  const cand = P.units.filter(x => ['cstr', 'mbr', 'mbbr', 'sbr', 'iceas', 'ctech'].includes(x.type));
  if (!Array.isArray(u.p.zones)) u.p.zones = [];
  const other = new Set(P.units.filter(b => b.type === 'blower' && b !== u).flatMap(b => b.p.zones || []));
  for (const z of cand) {
    const on = u.p.zones.includes(z.id), dis = other.has(z.id);
    const row = el(`<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox"${on ? ' checked' : ''}${dis ? ' disabled' : ''}> ${esc(z.name)} <span class="small muted">${AERATED(z) ? '' : '(không sục khí)'}${dis ? '(thuộc trạm khác)' : ''}</span></label>`);
    row.querySelector('input').onchange = e => {
      u.p.zones = u.p.zones.filter(id => id !== z.id);
      if (e.target.checked) u.p.zones.push(z.id);
      FS.render(); changed('zones');
    };
    zl.appendChild(row);
  }
  box.querySelector('.sz').onclick = () => {
    const d = currentDet();
    if (!d) { alert('Cần có kết quả mô phỏng (tính ổn định) để định cỡ.'); return; }
    // nhu cầu khí lớn nhất: khí thực các bể ×1,3 (đỉnh tải) – từ kết quả hiện hành
    const S = plantSummary(d.sys, d.det), zIds = u.p.zones.length ? u.p.zones : P.units.filter(AERATED).map(x => x.id);
    let air = 0; for (const r of S.reactors) if (zIds.includes(r.cu.id)) air += r.info.air || 0;
    if (!(air > 0)) { alert('Chưa có lưu lượng khí trong kết quả.'); return; }
    const peak = air / 24 * 1.3, n = Math.max(+u.p.nDuty, 1);
    u.p.Qr = Math.ceil(peak / n / 50) * 50;
    let sub = 0; for (const id of zIds) { const z = P.units.find(x => x.id === id); if (z) sub = Math.max(sub, (+z.p.H || +z.p.Hmax || 5) - 0.3); }
    u.p.Pr = Math.ceil((9.81 * sub + (+u.p.dPpipe) + 8) / 5) * 5;
    changed('size'); renderProps();
    alert(`Đã đặt: ${n} máy × ${u.p.Qr} Nm³/h (nhu cầu trung bình ${fmt(air / 24)} Nm³/h, dự phòng đỉnh 1,3), áp suất tối đa ${u.p.Pr} kPa.`);
  };
  return box;
}

/* thẻ kết quả trong tab Kết quả */
function blowerCards(sys, det) {
  let h = '';
  for (const cu of sys.units.filter(c => c.type === 'blower')) {
    const i = det.U[cu.id]; if (!i) continue;
    const warn = [];
    const cycZ = i.zones.some(z => z.nt > 1);
    if (i.short > 0.005) warn.push((cycZ && i.short < 0.4) ? `Có máy chạy hết công suất ${fmt(i.short * 100)} % thời gian – chủ yếu đầu pha sục khí khi DO tăng từ 0 lên giá trị đặt (bình thường với bể chu kỳ; kiểm tra bảng DO các vùng).` : `Nhu cầu khí vượt năng lực máy ${fmt(i.short * 100)} % thời gian → DO không đạt giá trị đặt (tăng số máy/định mức, hoặc giảm DO đặt).`);
    if (i.excess > 0.5) warn.push('Nhu cầu khí thấp hơn lưu lượng tối thiểu của 1 máy (turndown) → dư khí, DO vượt giá trị đặt, lãng phí điện (dùng máy nhỏ hơn/máy turndown sâu hơn).');
    if (i.overP > 0.5) warn.push('Áp suất đường ống vượt áp suất đẩy tối đa của máy.');
    const thr = i.Pblow > 0 ? (i.Pblow - i.Pideal) / i.Pblow * 100 : 0;
    h += `<div class="card"><h2>Trạm máy thổi khí – ${esc(cu.u.name)}</h2><div class="kpis">
      ${kpi('Khí cấp bể sinh học (TB)', i.airTot / 24, 'm³/h')}${i.airAux > 0 ? kpi('Khí phụ trợ (lắng cát, điều hòa…)', i.airAux / 24, 'm³/h') : ''}${kpi('Thời gian máy chạy hết công suất', i.short * 100, '%')}${kpi('Máy đang chạy', i.nRun, '/ ' + i.nDuty)}${kpi('Tải mỗi máy', i.load, '%')}
      ${kpi('Áp suất đường ống', i.pHead, 'kPa')}${kpi('Áp suất yêu cầu (tĩnh + tổn thất)', i.pNeed, 'kPa')}${kpi('Hiệu suất máy', i.eta, '%')}${kpi('Công suất điện', i.Pblow, 'kW')}
      ${kpi('Điện năng', i.Pblow * 24, 'kWh/d')}${kpi('Chi phí điện', i.Pblow * 24 * (+cu.p.price || 0) / 1e6, 'tr.đ/d')}${kpi('Suất điện năng', i.kWhkgO2, 'kWh/kg O₂')}${kpi('Tổn thất do điều khiển áp/xả khí', thr, '%')}</div>
      ${warn.map(w => `<div class="msg warn">${esc(w)}</div>`).join('')}
      <div class="grid2" style="margin-top:10px"><div><h3>Các vùng cấp khí</h3><table class="t"><tr><th class="l">Bể</th><th>DO đặt</th><th>DO</th><th>kLa 1/d</th><th>Khí Nm³/h</th><th>Tỷ lệ</th><th>OTR kg/d</th></tr>`;
    for (const z of i.zones) for (let k = 0; k < z.nt; k++) {
      const j = z.bz + k;
      h += `<tr><td class="l">${esc(z.name)}${z.nt > 1 ? ' – bể ' + (k + 1) : ''}</td><td>${fmt(i.zSp[j])}</td><td>${fmt(i.zDO[j])}</td><td>${fmt(i.zKla[j])}</td><td>${fmt(i.zAir[j] / 24)}</td><td>${fmt(i.airTot > 0 ? i.zAir[j] / i.airTot * 100 : 0)} %</td><td>${fmt(i.zOTR[j])}</td></tr>`;
    }
    h += `</table><p class="small muted">${det.avg || (APP.ss && APP.ss.cycle) ? 'Bể chu kỳ: giá trị trung bình một chu kỳ (kể cả pha không sục khí).' : ''} Áp suất tĩnh ${fmt(i.pStat)} kPa, tổn thất ${fmt(i.pLoss)} kPa.</p></div>
      <div><h3>Đường đặc tính trạm (ở áp suất hiện hành)</h3><div class="chartBox" style="height:260px"><canvas id="blC_${cu.id}"></canvas></div></div></div></div>`;
  }
  return h;
}
function drawBlowerCharts(sys, det) {
  for (const cu of sys.units.filter(c => c.type === 'blower')) {
    const cv = $('#blC_' + cu.id), i = det.U[cu.id]; if (!cv || !i) continue;
    const p = cu.p, Qr = +p.Qr, nD = Math.max(Math.round(+p.nDuty), 1), kind = BLOWER_KIND[p.kind] || BLOWER_KIND.turbo;
    const etaR = (+p.etaMax || 70) / 100, pg = i.pHead;
    const kw = (qh, eta) => qh * 1.204 / 3600 * 8.314 * 293.15 / (28.97 * 0.283 * eta) * (Math.pow((101.325 + pg) / 101.325, 0.283) - 1);
    const xs = [], ys = [], ye = [];
    const qmin = (+p.tdn || kind.tdn) / 100 * Qr;
    for (let k = 0; k <= 80; k++) {
      const Q = qmin + (nD * Qr - qmin) * k / 80, n = Math.min(Math.max(Math.ceil(Q / Qr - 1e-9), 1), nD), ld = Q / (n * Qr);
      const eta = p.vfd === 'no' ? etaR : etaR * Math.max(1 - kind.c * Math.pow(1 - ld, 2), 0.3);
      xs.push(Q); ys.push(p.vfd === 'no' ? n * kw(Qr, etaR) : n * kw(Q / n, eta)); ye.push(kw(Q, etaR));
    }
    new LineChart(cv, { xlabel: 'Lưu lượng khí (Nm³/h)', ylabel: 'kW', zero: true }).set([
      { label: 'Công suất (đóng/cắt máy theo nhu cầu)', x: xs, y: ys },
      { label: 'Lý tưởng (hiệu suất định mức)', x: xs, y: ye, dash: [5, 4] },
      { label: 'Điểm vận hành', x: [i.airTot / 24], y: [i.Pblow], marks: true, color: '#dc2626' }
    ]);
  }
}
