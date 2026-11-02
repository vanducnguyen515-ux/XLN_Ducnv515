'use strict';
/* ==========================================================================
   SimXLNT – Chạy song song phân tích độ nhạy / kịch bản bằng Web Worker.
   Mã tính toán (chem, models, adm1, solver, influent, plant) được ghép thành mã Worker:
   bản nhiều tệp → tải lại các tệp js; bản một tệp (SimXLNT.html) → lấy từ thẻ <script> nội tuyến.
   Mỗi "đoạn" (chunk) là chuỗi điểm liền nhau trên đường quét: điểm đầu khởi động từ trạng thái cơ sở,
   các điểm sau khởi động từ trạng thái dự báo (ngoại suy tuyến tính từ 2 điểm trước – kỹ thuật tiếp nối).
   Không tạo được Worker (vd. mở tệp trực tiếp trên trình duyệt chặn) → chạy tuần tự trên luồng chính.
   ========================================================================== */
// models_sumo: ASM2dS / ASM2dS2 / ASM3P (thiếu tệp này luồng phụ báo "Không có mô hình…"); units_ext: thiết bị mở rộng (song chắn, hóa lý, tách bùn, AOP…)
const SENS = { MODS: ['chem', 'models', 'models_sumo', 'adm1', 'solver', 'influent', 'plant', 'units_ext', 'units_sumo'], _src: null };

/* chạy một đoạn điểm – dùng cả trong Worker và trên luồng chính.
   data = { P, pts: [{idx, kv: [[khóa, giá trị]…], xn: [tọa độ chuẩn hóa]}], y0, sig0, opt: {tol, maxT, NA, wantY} } */
async function SENS_RUN_CHUNK(data, post, abortFn) {
  const { P, pts, y0, sig0, opt } = data;
  const hist = [];
  for (const pt of pts) {
    if (abortFn && abortFn()) break;
    const t0 = performance.now();
    try {
      const Pi = JSON.parse(JSON.stringify(pt.P || P));     // pt.P: dự án đã sửa cấu trúc (gợi ý xử lý – thêm đơn vị châm…)
      for (const [k, v] of pt.kv || []) knobSet(Pi, k, v);
      const sys = compilePlant(Pi);
      if (sys.errors.length) { post({ type: 'pt', idx: pt.idx, err: sys.errors[0] }); continue; }
      sys.setSteady(true);
      // điểm khởi động: dự báo tuyến tính từ 2 điểm trước cùng cấu trúc biến → điểm trước → trạng thái cơ sở → mặc định
      const h = hist.filter(x => x.sig === sys.layoutSig);
      let ys = null, how = 'mặc định';
      if (h.length >= 2 && pt.xn) {
        const a = h[h.length - 2], b = h[h.length - 1];
        let dd = 0, dn = 0;
        for (let k = 0; k < pt.xn.length; k++) { const d1 = b.xn[k] - a.xn[k]; dd += d1 * d1; dn += (pt.xn[k] - b.xn[k]) * d1; }
        const al = dd > 0 ? Math.min(Math.max(dn / dd, 0), 1.5) : 0;
        ys = Float64Array.from(b.y);
        if (al > 0) for (let i = 0; i < ys.length; i++) { const v = b.y[i] + al * (b.y[i] - a.y[i]); ys[i] = v < 0 && b.y[i] >= 0 ? 0.3 * b.y[i] : v; }
        how = 'dự báo';
      } else if (h.length) { ys = Float64Array.from(h[h.length - 1].y); how = 'điểm trước'; }
      else if (y0 && sig0 === sys.layoutSig) { ys = Float64Array.from(y0); how = 'cơ sở'; }
      if (!ys) ys = sys.y0Default();
      let lastP = 0;
      const r = await steadyAuto(Pi, sys, ys, {
        maxT: opt.maxT || 1500, tol: opt.tol || 2e-4, abort: abortFn,
        onProgress: t => { const now = performance.now(); if (now - lastP > 400) { lastP = now; post({ type: 'prog', idx: pt.idx, t }); } }
      });
      const det = sys.period > 0 ? (await cycleRun(sys, 0, r.y, 8, opt.NA || 288)).avg : sys.detail(0, r.y);
      const out = outputsOf(sys, det);
      hist.push({ xn: pt.xn || [], y: r.y, sig: sys.layoutSig }); if (hist.length > 2) hist.shift();
      post({ type: 'pt', idx: pt.idx, out, conv: r.converged, simT: r.simT, ms: performance.now() - t0, start: how, y: opt.wantY ? r.y : null, sig: sys.layoutSig });
    } catch (e) { post({ type: 'pt', idx: pt.idx, err: String((e && e.message) || e) }); }
  }
  post({ type: 'done' });
}

/* mã nguồn Worker */
SENS.workerSource = async function () {
  if (SENS._src) return SENS._src;
  const parts = [];
  for (const name of SENS.MODS) {
    let txt = null;
    for (const s of document.scripts) {
      if (s.src && new RegExp('/' + name + '\\.js(\\?|$)').test(s.src)) { const r = await fetch(s.src); if (!r.ok) throw new Error('không tải được ' + name + '.js'); txt = await r.text(); break; }
      if (!s.src && s.textContent.slice(0, 300).includes('/* ' + name + '.js */')) { txt = s.textContent; break; }
    }
    if (txt == null) throw new Error('không tìm thấy mã ' + name + '.js');
    parts.push(txt);
  }
  // hàm & hằng dùng trong outputsOf/knobSet phải được ghép theo (mỗi lần thêm hàm phụ ở tools.js cần liệt kê ở đây)
  parts.push(knobSet.toString(), outputsOf.toString(), popIdx.toString(), 'const POPS = ' + JSON.stringify(POPS) + ';', SENS_RUN_CHUNK.toString(),
    'let _ab = false; self.onmessage = ev => { if (ev.data && ev.data.ping) { self.postMessage({ type: \'pong\' }); return; } if (ev.data && ev.data.abort) { _ab = true; return; } SENS_RUN_CHUNK(ev.data, m => self.postMessage(m), () => _ab); };');
  SENS._src = parts.join('\n;\n');
  return SENS._src;
};
SENS.maxWorkers = () => Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));

/* chạy danh sách đoạn với n luồng; onMsg(msg) cho từng kết quả/tiến độ. Trả về {mode: 'worker'|'main', aborted} */
SENS.run = async function (chunks, common, n, onMsg, abortFn) {
  let url = null, workers = [];
  if (n >= 1 && typeof Worker !== 'undefined') {   // kể cả 1 luồng: chạy trong Worker để giao diện không bị chặn/hãm
    try {
      const src = await SENS.workerSource();
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      for (let i = 0; i < Math.min(n, chunks.length); i++) workers.push(new Worker(url));
      // thử một luồng: có trình duyệt (mở tệp trực tiếp file://) tạo được Worker nhưng lỗi khi nạp mã → chuyển về luồng chính
      if (!SENS._pingOk) {
        const ok = await new Promise(res => {
          const w = workers[0], tm = setTimeout(() => res(false), 15000);
          w.onmessage = ev => { if (ev.data && ev.data.type === 'pong') { clearTimeout(tm); res(true); } };
          w.onerror = ev => { ev.preventDefault(); clearTimeout(tm); res(false); };
          w.postMessage({ ping: true });
        });
        if (!ok) throw new Error('luồng phụ không nạp được mã tính');
        SENS._pingOk = true;
      }
    } catch (e) { workers.forEach(w => w.terminate()); workers = []; SENS.lastErr = e.message; }
  }
  if (!workers.length) {
    // luồng chính, tuần tự
    for (const ch of chunks) { if (abortFn()) break; await SENS_RUN_CHUNK(Object.assign({}, common, { pts: ch }), m => { if (m.type !== 'done') onMsg(m); }, abortFn); }
    return { mode: 'main', aborted: abortFn() };
  }
  const queue = chunks.slice();
  const res = await new Promise(resolve => {
    let live = workers.length, stopped = false;
    const iv = setInterval(() => { if (abortFn() && !stopped) { stopped = true; workers.forEach(w => w.terminate()); clearInterval(iv); resolve({ aborted: true }); } }, 200);
    const next = w => {
      if (stopped) return;
      const ch = queue.shift();
      if (!ch) { w.terminate(); if (--live === 0) { clearInterval(iv); resolve({ aborted: false }); } return; }
      w._cur = ch;
      w.postMessage(Object.assign({}, common, { pts: ch }));
    };
    for (const w of workers) {
      w.onmessage = ev => { const m = ev.data; if (m.type === 'done') next(w); else onMsg(m); };
      w.onerror = ev => { ev.preventDefault(); (w._cur || []).forEach(pt => onMsg({ type: 'pt', idx: pt.idx, err: 'Lỗi luồng tính: ' + (ev.message || '') })); next(w); };
      next(w);
    }
  });
  if (url) URL.revokeObjectURL(url);
  return { mode: 'worker', workers: workers.length, aborted: res.aborted };
};
