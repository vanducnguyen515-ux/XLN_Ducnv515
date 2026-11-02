'use strict';
/* ==========================================================================
   SimXLNT – Hiệu chỉnh mô hình theo số liệu vận hành (thẻ Công cụ)
   CSV: cột đầu t (ngày, tùy chọn) + các cột đo: COD, TSS, NH4, NOx, NO3, TN, TP, PO4 (nước ra, mg/L), MLSS (mg/L, TB bể hiếu khí),
        WAS (kgTSS/ngày), air (Nm³/h), SRT (ngày). Ngăn cách , ; hoặc tab; dấu thập phân . hoặc ,.
   ① Đánh giá: trung bình đo ↔ trạng thái ổn định; khi có cột t: mô phỏng động theo thời gian số liệu → RMSE, NSE, độ lệch.
      (Dòng vào theo thời gian đặt ở tab Đầu vào – mẫu CSV cùng khoảng thời gian.)
   ② Hiệu chỉnh: tối đa 3 thông số (cùng danh sách thông số thẻ Độ nhạy), khoảng [min, max]; cực tiểu
      Σ ((mô phỏng − đo TB) / đo TB)² ở trạng thái ổn định bằng Nelder–Mead có chặn; áp dụng giá trị tốt nhất vào dự án.
   ========================================================================== */
const CALIB = (() => {
  const MAP = { COD: ['eff.COD', 'COD ra'], TSS: ['eff.TSS', 'TSS ra'], NH4: ['eff.NH4', 'NH₄-N ra'], NOx: ['eff.NOx', 'NOx-N ra'], NO3: ['eff.NOx', 'NO₃-N ra (≈ NOx)'],
    TN: ['eff.TN', 'TN ra'], TP: ['eff.TP', 'TP ra'], PO4: ['eff.PO4', 'PO₄-P ra'], MLSS: ['S.MLSS', 'MLSS bể hiếu khí'], WAS: ['S.WAS', 'Bùn dư (kgTSS/ngày)'],
    air: ['S.airh', 'Khí cấp (Nm³/h)'], SRT: ['S.SRT', 'Tuổi bùn SRT (ngày)'] };
  const clone = o => JSON.parse(JSON.stringify(o));
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  let data = null, evalRes = null, fit = null;

  function cfg(P) { return P.calib || (P.calib = { csv: '', knobs: [], maxEval: 30 }); }
  function parse(txt) {
    const d = INF.parseCSV(txt);
    if (!d) return null;
    const hasT = /^t$/i.test(d.head[0]);
    const cols = d.head.map((h, j) => [h.trim(), j]).filter(([h, j]) => MAP[h] && !(hasT && j === 0));
    if (!cols.length) return null;
    const t = hasT ? d.rows.map(r => r[0]) : null, t0 = t ? Math.min(...t) : 0;
    const M = {};
    for (const [h, j] of cols) M[h] = d.rows.map((r, i) => ({ t: t ? t[i] - t0 : i, v: r[j] })).filter(x => isFinite(x.v));
    return { hasT, span: t ? Math.max(...t) - t0 : 0, M, n: d.rows.length };
  }

  async function steadyOut(P, yWarm) {
    const sys = compilePlant(P);
    if (sys.errors.length) throw new Error(sys.errors.join('; '));
    sys.setSteady(true);
    let maxT = 2000; if (sys.units.some(u => u.type === 'mbbr' || u.type === 'baf')) maxT = 8000; if (P.sim && +P.sim.ssMax > maxT) maxT = +P.sim.ssMax;
    const y0 = yWarm && yWarm.sig === sys.layoutSig ? Float64Array.from(yWarm.y) : sys.y0Default();
    const r = await steadyAuto(P, sys, y0, { maxT, tol: 5e-4, abort: () => APP.abortFlag });
    let det = sys.detail(r.simT, r.y);
    if (sys.period > 0) det = (await cycleRun(sys, r.simT, r.y)).avg;
    sys.setSteady(false);
    return { o: outputsOf(sys, det), y: { sig: sys.layoutSig, y: Array.from(r.y) }, conv: r.converged };
  }

  // ① đánh giá
  async function evaluate() {
    if (APP.running || !data) return;
    const P = APP.P, msg = $('#caMsg');
    setRunning(true); APP.abortFlag = false; prog(0);
    try {
      msg.textContent = 'Đang tính trạng thái ổn định…';
      const ss = await steadyOut(P, APP.lastY);
      const rows = [];
      for (const [h, pts] of Object.entries(data.M)) rows.push({ h, l: MAP[h][1], meas: mean(pts.map(p => p.v)), sim: ss.o[MAP[h][0]], n: pts.length });
      let dyn = null;
      if (data.hasT && data.span > 0) {
        msg.textContent = `Đang mô phỏng động ${fmt(data.span)} ngày theo thời gian số liệu…`;
        const sys = compilePlant(P); sys.setSteady(false);
        const T = [...new Set(Object.values(data.M).flatMap(a => a.map(p => +p.t.toFixed(6))))].sort((a, b) => a - b);
        const sim = {};
        await SOLVER.ode23s(sys, 0, data.span, Float64Array.from(ss.y.y), {
          rtol: +(P.sim.rtol || 1e-4), atol: +(P.sim.atol || 1e-3), hmax: Math.min(0.05, data.span / 20, sys.hmax || Infinity), tOut: T,
          onOut: (t, y) => { sim[+t.toFixed(6)] = outputsOf(sys, sys.detail(t, y)); }, onProgress: t => prog(t / data.span), abort: () => APP.abortFlag
        });
        dyn = {};
        for (const [h, pts] of Object.entries(data.M)) {
          const pr = pts.map(p => [p.v, (sim[+p.t.toFixed(6)] || {})[MAP[h][0]]]).filter(([o, s]) => isFinite(o) && isFinite(s));
          if (pr.length < 2) continue;
          const om = mean(pr.map(x => x[0])), se = pr.reduce((a, [o, s]) => a + (o - s) ** 2, 0), sv = pr.reduce((a, [o]) => a + (o - om) ** 2, 0);
          dyn[h] = { n: pr.length, rmse: Math.sqrt(se / pr.length), nse: sv > 0 ? 1 - se / sv : null, bias: mean(pr.map(([o, s]) => s - o)), t: pts.map(p => p.t), o: pts.map(p => p.v), s: pts.map(p => (sim[+p.t.toFixed(6)] || {})[MAP[h][0]]) };
        }
      }
      evalRes = { rows, dyn, conv: ss.conv };
      msg.textContent = 'Xong.' + (ss.conv ? '' : ' (trạng thái ổn định chưa đạt dung sai)');
    } catch (e) { msg.textContent = '✖ ' + e.message; }
    setRunning(false); prog(1); draw();
  }

  // ② hiệu chỉnh tự động (Nelder–Mead trên không gian chuẩn hóa [0,1]^n, kẹp biên)
  async function calibrate() {
    if (APP.running || !data) return;
    const P = APP.P, c = cfg(P), KL = knobList(P);
    const K = c.knobs.filter(k => k.key && k.min !== '' && k.max !== '' && isFinite(+k.min) && isFinite(+k.max) && +k.max > +k.min).slice(0, 3)
      .map(k => ({ key: k.key, min: +k.min, max: +k.max, name: (KL.find(x => x.key === k.key) || {}).name || k.key }));
    const msg = $('#caMsg');
    if (!K.length) { msg.textContent = 'Chọn ít nhất một thông số và khoảng [min, max].'; return; }
    const targets = Object.entries(data.M).map(([h, pts]) => ({ h, k: MAP[h][0], m: mean(pts.map(p => p.v)) })).filter(t => Math.abs(t.m) > 1e-9);
    setRunning(true); APP.abortFlag = false; prog(0);
    const maxE = Math.max(6, +c.maxEval || 30); let nE = 0, warm = APP.lastY, best = null;
    const toX = u => K.map((k, i) => +k.min + Math.min(Math.max(u[i], 0), 1) * (+k.max - +k.min));
    const f = async u => {
      const x = toX(u), Pc = clone(P);
      K.forEach((k, i) => knobSet(Pc, k.key, x[i]));
      let r; try { r = await steadyOut(Pc, warm); } catch (e) { return 1e9; }
      warm = r.y; nE++; prog(nE / maxE);
      const J = targets.reduce((a, t) => { const s = r.o[t.k]; return a + (isFinite(s) ? ((s - t.m) / t.m) ** 2 : 10); }, 0);
      if (!best || J < best.J) best = { J, x, o: r.o };
      msg.textContent = `Lần tính ${nE}/${maxE} – sai số tốt nhất ${best.J.toPrecision(3)} (${K.map((k, i) => k.name.split(':').pop().trim() + ' = ' + fmt(+best.x[i].toPrecision(4))).join(', ')})`;
      return J;
    };
    try {
      const n = K.length, u0 = K.map(k => { const v = knobGet(P, k.key); return isFinite(v) ? Math.min(Math.max((v - k.min) / (k.max - k.min), 0), 1) : 0.5; });
      const J0 = await f(u0), start = { J: J0, x: toX(u0), o: best.o };
      let S = [[u0, J0]];
      for (let i = 0; i < n; i++) { const u = u0.slice(); u[i] = u[i] + (u[i] < 0.75 ? 0.25 : -0.25); S.push([u, await f(u)]); }
      while (nE < maxE && !APP.abortFlag) {
        S.sort((a, b) => a[1] - b[1]);
        if (S[n][1] - S[0][1] < 1e-6 * (1 + S[0][1]) && Math.max(...S.map(s => Math.max(...s[0].map((v, i) => Math.abs(v - S[0][0][i]))))) < 1e-3) break;
        const cen = Array.from({ length: n }, (_, i) => mean(S.slice(0, n).map(s => s[0][i])));
        const pt = a => cen.map((v, i) => Math.min(Math.max(v + a * (S[n][0][i] - v), 0), 1));
        const xr = pt(-1), Jr = await f(xr);
        if (Jr < S[0][1]) { const xe = pt(-2), Je = nE < maxE ? await f(xe) : Infinity; S[n] = Je < Jr ? [xe, Je] : [xr, Jr]; }
        else if (Jr < S[n - 1][1]) S[n] = [xr, Jr];
        else {
          const xc = pt(Jr < S[n][1] ? -0.5 : 0.5), Jc = await f(xc);
          if (Jc < Math.min(Jr, S[n][1])) S[n] = [xc, Jc];
          else for (let j = 1; j <= n && nE < maxE; j++) { const u = S[j][0].map((v, i) => S[0][0][i] + 0.5 * (v - S[0][0][i])); S[j] = [u, await f(u)]; }
        }
      }
      fit = { K, start, best, targets, nE };
      msg.textContent = `Xong sau ${nE} lần tính trạng thái ổn định. Sai số: ${start.J.toPrecision(3)} → ${best.J.toPrecision(3)}.`;
    } catch (e) { msg.textContent = '✖ ' + e.message; }
    setRunning(false); prog(1); draw();
  }
  function apply() {
    if (!fit) return;
    fit.K.forEach((k, i) => knobSet(APP.P, k.key, +fit.best.x[i].toPrecision(5)));
    APP.stale = true; changed('calib'); fit.applied = true;
    log('✔ Hiệu chỉnh: ' + fit.K.map((k, i) => k.name + ' = ' + fmt(+fit.best.x[i].toPrecision(5))).join('; '));
    draw();
  }

  function draw() {
    const box = $('#caRes'); if (!box) return;
    const f = v => v == null || !isFinite(v) ? '–' : fmt(+(+v).toPrecision(3));
    let h = '';
    if (data) h += `<p class="small muted">Số liệu: ${data.n} dòng, ${Object.keys(data.M).length} chỉ tiêu (${Object.keys(data.M).join(', ')})${data.hasT ? `, ${f(data.span)} ngày` : ' – không có cột t (chỉ so trung bình)'}.</p>`;
    if (evalRes) {
      h += `<h3 style="margin:8px 0 4px">Đánh giá mô hình</h3><div class="tw"><table class="tbl"><tr><th>Chỉ tiêu</th><th>Đo (TB)</th><th>Mô phỏng ổn định</th><th>Lệch</th>${evalRes.dyn ? '<th>RMSE (động)</th><th>NSE</th><th>Độ lệch TB</th>' : ''}</tr>` +
        evalRes.rows.map(r => { const d = evalRes.dyn && evalRes.dyn[r.h], e = isFinite(r.sim) && r.meas ? (r.sim - r.meas) / r.meas * 100 : null;
          return `<tr><td>${r.l}</td><td>${f(r.meas)}</td><td>${f(r.sim)}</td><td${e != null && Math.abs(e) > 20 ? ' style="color:#b91c1c"' : ''}>${e == null ? '–' : f(e) + ' %'}</td>${evalRes.dyn ? `<td>${d ? f(d.rmse) : '–'}</td><td>${d && d.nse != null ? f(d.nse) : '–'}</td><td>${d ? f(d.bias) : '–'}</td>` : ''}</tr>`; }).join('') + `</table></div>`;
      if (evalRes.dyn && Object.keys(evalRes.dyn).length) h += `<div class="chartBox" style="height:300px;margin-top:8px"><canvas id="caChart"></canvas></div><p class="small muted">Nét liền: mô phỏng; nét đứt: số liệu đo. NSE (Nash–Sutcliffe): 1 = trùng khớp, &gt; 0,5 chấp nhận được, &lt; 0 kém hơn dùng giá trị trung bình.</p>`;
    }
    if (fit) {
      h += `<h3 style="margin:10px 0 4px">Kết quả hiệu chỉnh (${fit.nE} lần tính)</h3><div class="tw"><table class="tbl"><tr><th>Thông số</th><th>Ban đầu</th><th>Hiệu chỉnh</th><th>Khoảng</th></tr>` +
        fit.K.map((k, i) => `<tr><td>${esc(k.name)}</td><td>${f(fit.start.x[i])}</td><td><b>${f(fit.best.x[i])}</b></td><td>${f(k.min)} – ${f(k.max)}</td></tr>`).join('') +
        `</table></div><div class="tw"><table class="tbl" style="margin-top:6px"><tr><th>Chỉ tiêu</th><th>Đo (TB)</th><th>Trước</th><th>Sau</th></tr>` +
        fit.targets.map(t => `<tr><td>${MAP[t.h][1]}</td><td>${f(t.m)}</td><td>${f(fit.start.o[t.k])}</td><td><b>${f(fit.best.o[t.k])}</b></td></tr>`).join('') + `</table></div>
        <p>${fit.applied ? '<span class="msg ok">Đã áp dụng vào dự án – chạy lại tính ổn định / động để xem kết quả.</span>' : '<button class="pri" id="caApply">Áp dụng giá trị hiệu chỉnh vào dự án</button>'}</p>`;
    }
    box.innerHTML = h;
    const ap = $('#caApply'); if (ap) ap.onclick = apply;
    if (evalRes && evalRes.dyn && $('#caChart')) {
      const S = [], cols = ['#0f62c9', '#dc2626', '#15803d', '#7c3aed', '#ea580c', '#0891b2'];
      Object.entries(evalRes.dyn).forEach(([hh, d], i) => { const col = cols[i % cols.length]; S.push({ label: MAP[hh][1], x: d.t, y: d.s, color: col }); S.push({ label: MAP[hh][1] + ' (đo)', x: d.t, y: d.o, color: col, dash: [4, 3] }); });
      new LineChart($('#caChart'), { xlabel: 'Thời gian (ngày)', ylabel: 'giá trị' }).set(S);
    }
  }

  function card(box) {
    const P = APP.P, c = cfg(P), knobs = knobList(P);
    if (c.csv && !data) data = parse(c.csv);
    const opt = sel => `<option value="">—</option>` + knobs.map(k => `<option value="${k.key}"${k.key === sel ? ' selected' : ''}>${esc(k.name)}${k.u ? ' [' + k.u + ']' : ''}</option>`).join('');
    while (c.knobs.length < 3) c.knobs.push({ key: '', min: '', max: '' });
    const e = el(`<div class="card"><h2>Hiệu chỉnh theo số liệu vận hành</h2>
      <p class="small muted">Dán số liệu CSV (cột đầu <b>t</b> ngày – tùy chọn; các cột: ${Object.keys(MAP).join(', ')}). Dòng vào theo thời gian đặt ở tab Đầu vào (mẫu CSV cùng khoảng thời gian) để đánh giá động.</p>
      <textarea id="caCsv" rows="5" style="width:100%;font:12px monospace" placeholder="t;COD;NH4;TN;MLSS&#10;0;42;1,2;9,5;3500&#10;1;45;0,8;10,1;3450">${esc(c.csv)}</textarea>
      <div class="row"><input type="file" id="caFile" accept=".csv,.txt"><button id="caEval">① Đánh giá mô hình</button></div>
      <div style="margin-top:8px"><b>② Hiệu chỉnh tự động</b> <span class="small muted">(tối đa 3 thông số; khớp trung bình số liệu ở trạng thái ổn định)</span>
      ${c.knobs.slice(0, 3).map((k, i) => `<div class="row" style="margin-top:4px"><select data-ck="${i}" style="max-width:420px">${opt(k.key)}</select>
        <label>min <input type="number" step="any" data-cm="${i}" value="${k.min}" style="width:80px"></label><label>max <input type="number" step="any" data-cx="${i}" value="${k.max}" style="width:80px"></label></div>`).join('')}
      <div class="row" style="margin-top:6px"><label>Số lần tính tối đa <input type="number" id="caMax" value="${c.maxEval}" style="width:60px"></label><button class="pri" id="caRun">▶ Hiệu chỉnh</button><button id="caStop">■ Dừng</button></div></div>
      <div id="caMsg" class="small muted" style="margin-top:6px"></div><div id="caRes"></div></div>`);
    box.appendChild(e);
    const setCsv = t => { c.csv = t; data = parse(t); evalRes = null; saveLocal(); if (!data && t.trim()) $('#caMsg').textContent = 'Không đọc được CSV: cần dòng tiêu đề với cột đo hợp lệ.'; else $('#caMsg').textContent = ''; draw(); };
    $('#caCsv').onchange = ev => setCsv(ev.target.value);
    $('#caFile').onchange = ev => { const fl = ev.target.files[0]; if (!fl) return; const rd = new FileReader(); rd.onload = () => { $('#caCsv').value = rd.result; setCsv(rd.result); }; rd.readAsText(fl); };
    e.querySelectorAll('[data-ck]').forEach(s => (s.onchange = () => {
      const k = c.knobs[+s.dataset.ck]; k.key = s.value; k.name = (knobs.find(x => x.key === s.value) || {}).name || '';
      const v = knobGet(P, s.value); if (isFinite(v) && v !== 0) { k.min = +(v * 0.5).toPrecision(3); k.max = +(v * 1.5).toPrecision(3); }
      saveLocal(); renderTools();
    }));
    e.querySelectorAll('[data-cm]').forEach(i => (i.onchange = () => { c.knobs[+i.dataset.cm].min = +i.value; saveLocal(); }));
    e.querySelectorAll('[data-cx]').forEach(i => (i.onchange = () => { c.knobs[+i.dataset.cx].max = +i.value; saveLocal(); }));
    $('#caMax').onchange = ev => { c.maxEval = Math.max(6, +ev.target.value || 30); saveLocal(); };
    $('#caEval').onclick = evaluate; $('#caRun').onclick = calibrate; $('#caStop').onclick = () => (APP.abortFlag = true);
    draw();
  }
  return { card, parse, evaluate, calibrate, apply, get fit() { return fit; }, get evalRes() { return evalRes; } };
})();
