'use strict';
/* ==========================================================================
   SimXLNT – Kịch bản sự cố (thẻ Công cụ): mô phỏng động theo đoạn từ trạng thái ổn định của dự án.
   Mỗi đoạn dùng bản sao dự án đã sửa thông số (lưu lượng / nồng độ / cấp khí / nhiệt độ), trạng thái cuối đoạn trước
   làm điều kiện đầu đoạn sau (cùng cấu trúc biến). Đánh giá nước ra theo thời gian so với giới hạn xả (FIX.limits):
   giá trị lớn nhất, số giờ vượt, % thời gian đạt, thời gian phục hồi sau sự cố.
   ========================================================================== */
const SCEN = (() => {
  const TYPES = {
    rain: { n: 'Mưa lớn – lưu lượng tăng, nước thải loãng', f: [['k', 'Hệ số lưu lượng mưa', 2.5, '× Q'], ['t0', 'Bắt đầu', 1, 'ngày'], ['dur', 'Thời gian mưa', 8, 'giờ'], ['ff', 'Xả đầu TSS (first flush)', 1.5, '× TSS loãng']] },
    shock: { n: 'Tải sốc – nồng độ chất ô nhiễm tăng', f: [['k', 'Hệ số nồng độ', 2, '× COD, TKN, TP, TSS'], ['t0', 'Bắt đầu', 1, 'ngày'], ['dur', 'Thời gian', 12, 'giờ']] },
    blower: { n: 'Mất điện / hỏng máy thổi – ngừng sục khí', f: [['frac', 'Năng lực cấp khí còn lại', 0, '0 – 1'], ['t0', 'Bắt đầu', 1, 'ngày'], ['dur', 'Thời gian', 4, 'giờ']] },
    cold: { n: 'Nhiệt độ thấp – nước thải lạnh kéo dài', f: [['T', 'Nhiệt độ nước', 15, '°C'], ['t0', 'Bắt đầu', 1, 'ngày'], ['dur', 'Thời gian', 48, 'giờ']] }
  };
  const KEYS = [['COD', 'COD'], ['TSS', 'TSS'], ['NH4', 'NH₄-N'], ['NOx', 'NOx-N'], ['TN', 'TN'], ['TP', 'TP'], ['PO4', 'PO₄-P']];
  const COL = { COD: '#0f62c9', TSS: '#7c3aed', NH4: '#dc2626', NOx: '#0891b2', TN: '#ea580c', TP: '#15803d', PO4: '#65a30d' };
  const clone = o => JSON.parse(JSON.stringify(o));
  let last = null;

  function cfg(P) {
    P.scen = P.scen || { type: 'rain', days: 3, v: {} };
    return P.scen;
  }
  const val = (c, k) => { const v = c.v[c.type] && c.v[c.type][k]; return v != null && isFinite(+v) ? +v : TYPES[c.type].f.find(x => x[0] === k)[2]; };

  // bản sao dự án trong thời gian sự cố
  function eventProject(P, c) {
    const Q = clone(P), t = c.type;
    for (const u of Q.units) {
      const inf = u.type === 'influent' && u.p.inf;
      if (t === 'rain' && u.type === 'influent') {
        const k = Math.max(val(c, 'k'), 0.01);
        u.p.Q = +u.p.Q * k;
        if (inf && inf.mode !== 'state') { for (const x of ['COD', 'TKN', 'TP', 'Alk']) if (isFinite(+inf[x])) inf[x] = +inf[x] / k; if (isFinite(+inf.TSS)) inf.TSS = +inf.TSS / k * val(c, 'ff'); }
      }
      if (t === 'shock' && inf && inf.mode !== 'state') for (const x of ['COD', 'TKN', 'TP', 'TSS']) if (isFinite(+inf[x])) inf[x] = +inf[x] * val(c, 'k');
      if (t === 'blower') {
        const f = Math.min(Math.max(val(c, 'frac'), 0), 1);
        if (u.p.aer === 'kla') u.p.kla = +u.p.kla * f;
        if (u.p.aer === 'do' || ['sbr', 'iceas', 'ctech'].includes(u.type)) u.p.klaMax = +u.p.klaMax * f;
        if (u.type === 'blower') u.p.Qr = +u.p.Qr * Math.max(f, 1e-3);
      }
    }
    if (t === 'cold') Q.plant.T = val(c, 'T');
    return Q;
  }

  async function segment(P, y, t0, t1, sig, tOut, out) {
    const sys = compilePlant(P);
    if (sys.errors.length) throw new Error(sys.errors.join('; '));
    if (sig && sys.layoutSig !== sig) throw new Error('cấu trúc biến thay đổi giữa các đoạn – kịch bản không áp dụng được cho sơ đồ này');
    sys.setSteady(false);
    const pts = tOut.filter(t => t >= t0 - 1e-9 && t <= t1 + 1e-9);
    const r = await SOLVER.ode23s(sys, t0, t1, y, {
      rtol: +(P.sim.rtol || 1e-4), atol: +(P.sim.atol || 1e-3), hmax: Math.min(0.02, (t1 - t0) / 10, sys.hmax || Infinity), tOut: pts,
      onOut: (t, yy) => {
        const S = plantSummary(sys, sys.detail(t, yy)), e = S.sinks.find(s => s.cu.type === 'effluent');
        if (out.length && Math.abs(out[out.length - 1].t - t) < 1e-9) out.pop();     // điểm nối hai đoạn: giữ giá trị của đoạn sau
        out.push({ t, c: e ? Object.assign({}, e.c) : {} });
      },
      onProgress: t => prog(t / tOut[tOut.length - 1]), abort: () => APP.abortFlag
    });
    return { y: Float64Array.from(r.y), sig: sys.layoutSig };
  }

  async function run() {
    if (APP.running) return;
    const P = APP.P, c = cfg(P), days = Math.max(+c.days || 3, 0.5);
    const t0 = Math.min(Math.max(val(c, 't0'), 0), days), t1 = Math.min(t0 + val(c, 'dur') / 24, days);
    const msg = $('#scMsg'); setRunning(true); APP.abortFlag = false; prog(0);
    const T0 = performance.now();
    try {
      const sys = compilePlant(P);
      if (sys.errors.length) throw new Error('Lỗi sơ đồ: ' + sys.errors.join('; '));
      if (!sys.units.some(u => u.type === 'effluent')) throw new Error('sơ đồ không có đầu ra nước sau xử lý (effluent)');
      let y;
      if (APP.ss && !APP.stale && APP.ss.sys.layoutSig === sys.layoutSig && APP.ss.y) { y = Float64Array.from(APP.ss.y); msg.textContent = 'Điều kiện đầu: trạng thái ổn định đã tính.'; }
      else { msg.textContent = 'Đang tính trạng thái ổn định làm điều kiện đầu…'; const r = await solveSteady(sys, 'last'); y = Float64Array.from(r.y); }
      const dt = 1 / 96, tOut = []; for (let k = 0; k * dt <= days + 1e-9; k++) tOut.push(+(k * dt).toFixed(10));
      const out = [], base = [], y00 = Float64Array.from(y); let sig = sys.layoutSig;
      msg.textContent = 'Đang mô phỏng kịch bản…';
      const PE = eventProject(P, c);
      if (t0 > 0) ({ y, sig } = await segment(P, y, 0, t0, sig, tOut, out));
      if (t1 > t0) ({ y, sig } = await segment(PE, y, t0, t1, sig, tOut, out));
      if (days > t1) ({ y } = await segment(P, y, t1, days, sig, tOut, out));
      // chạy đối chứng không sự cố (cùng dòng vào theo thời gian) → phục hồi = so với đối chứng tại cùng thời điểm
      msg.textContent = 'Đang mô phỏng đối chứng (không sự cố)…';
      await segment(P, y00, 0, days, sig, tOut, base);
      last = { days, t0, t1, out, base, L: FIX.limits(P), fam: MODELS[P.model].fam, type: c.type, ms: performance.now() - T0, name: TYPES[c.type].n };
      msg.textContent = `Xong trong ${((performance.now() - T0) / 1000).toFixed(1)} s.`;
    } catch (e) { msg.textContent = '✖ ' + e.message; last = null; }
    setRunning(false); prog(1);
    draw();
  }

  // đánh giá tuân thủ theo thời gian (điểm cách đều 15 phút)
  function assess(R) {
    const rows = [];
    for (const [k, l] of KEYS) {
      if ((k === 'TP' || k === 'PO4') && R.fam !== 'ASM2d') continue;
      const v = R.out.map(o => o.c[k]).filter(x => isFinite(x));
      if (!v.length) continue;
      const lim = R.L[k] != null && isFinite(+R.L[k]) ? +R.L[k] : null;
      const bv = (R.base || []).map(o => o.c[k]).filter(x => isFinite(x));
      const b0 = bv.length ? bv.reduce((a, x) => a + x, 0) / bv.length : v[0];
      const bAt = i => (R.base && R.base[i] && isFinite(R.base[i].c[k]) ? R.base[i].c[k] : b0);
      let over = 0, lastOver = -1;
      if (lim != null) R.out.forEach((o, i) => { if (o.c[k] > lim) { over++; lastOver = o.t; } });
      const dt = R.out.length > 1 ? (R.out[R.out.length - 1].t - R.out[0].t) / (R.out.length - 1) : 1 / 96;
      const vmax = Math.max(...v), tmax = R.out[v.indexOf(vmax)] ? R.out[v.indexOf(vmax)].t : null;
      // phục hồi: lần cuối lệch > 10 % so với đối chứng cùng thời điểm, tính từ lúc kết thúc sự cố
      let rec = null; R.out.forEach((o, i) => { const b = bAt(i); if (o.t >= R.t1 && Math.abs(o.c[k] - b) > 0.1 * Math.max(b, 0.5)) rec = o.t; });
      rows.push({ k, l, lim, b0, vmax, tmax, hOver: over * dt * 24, pct: lim != null ? 100 * (1 - over / R.out.length) : null, lastOver, rec: rec == null ? 0 : (rec - R.t1) * 24, recOpen: rec != null && rec >= R.days - 2 * dt });
    }
    return rows;
  }

  function draw() {
    const box = $('#scRes'); if (!box) return;
    if (!last) { box.innerHTML = ''; return; }
    const A = assess(last), f = v => v == null || !isFinite(v) ? '–' : fmt(+v.toPrecision(3));
    const bad = A.filter(a => a.hOver > 0);
    box.innerHTML = `<h3 style="margin:6px 0">${esc(last.name)} – ${f((last.t1 - last.t0) * 24)} h từ ngày ${f(last.t0)}, mô phỏng ${f(last.days)} ngày</h3>
      <div class="msg ${bad.length ? 'warn' : 'ok'}">${bad.length ? 'Vượt giới hạn xả: ' + bad.map(a => `${a.l} ${f(a.hOver)} h (lớn nhất ${f(a.vmax)} / giới hạn ${f(a.lim)} mg/L)`).join('; ') : 'Nước ra đạt giới hạn xả trong suốt kịch bản.'}</div>
      <div class="tw"><table class="tbl"><tr><th>Chỉ tiêu</th><th>Không sự cố (TB)</th><th>Lớn nhất</th><th>Lúc (ngày)</th><th>Giới hạn</th><th>Số giờ vượt</th><th>% thời gian đạt</th><th>Phục hồi sau sự cố (h)</th></tr>
      ${A.map(a => `<tr><td>${a.l}</td><td>${f(a.b0)}</td><td${a.lim != null && a.vmax > a.lim ? ' style="color:#b91c1c;font-weight:600"' : ''}>${f(a.vmax)}</td><td>${f(a.tmax)}</td><td>${f(a.lim)}</td><td>${a.lim == null ? '–' : f(a.hOver)}</td><td>${a.pct == null ? '–' : f(a.pct) + ' %'}</td><td>${a.recOpen ? '> ' + f((last.days - last.t1) * 24) + ' (chưa phục hồi)' : f(a.rec)}</td></tr>`).join('')}</table></div>
      <div class="chartBox" style="height:320px;margin-top:8px"><canvas id="scChart"></canvas></div>
      <p class="small muted">Nồng độ nước ra (mg/L) theo thời gian; đường nét đứt: giới hạn xả; vùng sự cố từ ${f(last.t0)} đến ${f(last.t1)} ngày. Đối chứng: cùng dự án, không sự cố. Phục hồi: lần cuối lệch quá 10 % so với đối chứng tại cùng thời điểm.</p>`;
    const S = [];
    const x = last.out.map(o => o.t);
    for (const a of A) {
      S.push({ label: a.l, x, y: last.out.map(o => o.c[a.k]), color: COL[a.k] });
      if (a.lim != null) S.push({ label: a.l + ' giới hạn', x: [0, last.days], y: [a.lim, a.lim], color: COL[a.k], dash: [5, 4], nolegend: true });
    }
    new LineChart($('#scChart'), { xlabel: 'Thời gian (ngày)', ylabel: 'mg/L' }).set(S);
  }

  function card(box) {
    const P = APP.P, c = cfg(P), T = TYPES[c.type];
    const el2 = el(`<div class="card"><h2>Kịch bản sự cố</h2>
      <p class="small muted">Mô phỏng động từ trạng thái ổn định của dự án: sự cố xảy ra trong khoảng thời gian chọn, sau đó trở lại bình thường. Đánh giá nước ra theo
      giới hạn xả của dự án (đặt ở tab Kết quả – Gợi ý xử lý; chọn nhanh QCVN 14:2025 / 40:2025).</p>
      <div class="row"><label>Kịch bản <select id="scType">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${k === c.type ? ' selected' : ''}>${t.n}</option>`).join('')}</select></label>
      ${T.f.map(([k, l, d, u]) => `<label>${l} <input type="number" step="any" data-sv="${k}" value="${val(c, k)}" style="width:70px"> <span class="small muted">${u}</span></label>`).join('')}
      <label>Mô phỏng <input type="number" step="any" id="scDays" value="${c.days}" style="width:55px"> ngày</label>
      <button class="pri" id="scRun">▶ Chạy kịch bản</button></div><div id="scMsg" class="small muted" style="margin-top:6px"></div><div id="scRes"></div></div>`);
    box.appendChild(el2);
    $('#scType').onchange = e => { c.type = e.target.value; saveLocal(); renderTools(); };
    el2.querySelectorAll('[data-sv]').forEach(i => (i.onchange = () => { c.v[c.type] = c.v[c.type] || {}; c.v[c.type][i.dataset.sv] = +i.value; saveLocal(); }));
    $('#scDays').onchange = e => { c.days = Math.max(0.5, +e.target.value || 3); saveLocal(); };
    $('#scRun').onclick = run;
    draw();
  }
  return { TYPES, card, run, eventProject, assess, get last() { return last; } };
})();
