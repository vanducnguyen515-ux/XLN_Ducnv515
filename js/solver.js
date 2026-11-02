'use strict';
/* ==========================================================================
   SimXLNT – Bộ giải số
   - LU đặc (pivot từng phần)
   - Jacobian sai phân hữu hạn
   - ode23s: Rosenbrock cải biên bậc 2 (Shampine & Reichelt 1997), là W-method
     nên có thể dùng lại Jacobian cũ cho nhiều bước → nhanh với hệ cứng.
   - Trạng thái ổn định: "pseudo-transient continuation" (Euler ẩn với Δt tăng dần)
   ========================================================================== */
/* LU đặc có khai thác cấu trúc "biên hàng": mỗi hàng chỉ khác 0 trong [rs, re]
   (ma trận khối-chéo/băng của các bể độc lập → nhanh hơn nhiều lần, kết quả như LU đặc) */
const LA = {
  _rs: null, _re: null,
  lu(A, n, piv, rs, re) {
    if (!rs) { rs = new Int32Array(n); re = new Int32Array(n); }
    for (let i = 0; i < n; i++) {
      const ri = i * n; let a = 0, b = n - 1;
      while (a < n && A[ri + a] === 0) a++;
      while (b > a && A[ri + b] === 0) b--;
      rs[i] = Math.min(a, i); re[i] = Math.max(b, i);
    }
    for (let k = 0; k < n; k++) {
      let p = k, mx = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { if (rs[i] > k) continue; const v = Math.abs(A[i * n + k]); if (v > mx) { mx = v; p = i; } }
      piv[k] = p;
      if (mx === 0) A[k * n + k] = 1e-300;
      if (p !== k) {
        const rk = k * n, rp = p * n, lo = Math.min(rs[k], rs[p]), hi = Math.max(re[k], re[p]);
        for (let j = lo; j <= hi; j++) { const t = A[rk + j]; A[rk + j] = A[rp + j]; A[rp + j] = t; }
        let t = rs[k]; rs[k] = rs[p]; rs[p] = t; t = re[k]; re[k] = re[p]; re[p] = t;
        rs[k] = Math.min(rs[k], k); rs[p] = Math.min(rs[p], p);
      }
      const rk = k * n, akk = A[rk + k], ek = re[k];
      for (let i = k + 1; i < n; i++) {
        if (rs[i] > k) continue;
        const ri = i * n;
        const f = (A[ri + k] /= akk);
        if (f !== 0) {
          for (let j = k + 1; j <= ek; j++) A[ri + j] -= f * A[rk + j];
          if (ek > re[i]) re[i] = ek;
        }
      }
    }
    LA._rs = rs; LA._re = re;
    return { rs, re };
  },
  solve(A, n, piv, b, st) {
    const rs = st ? st.rs : null, re = st ? st.re : null;
    for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = b[k]; b[k] = b[p]; b[p] = t; } }
    for (let i = 0; i < n; i++) { let s = b[i]; const ri = i * n; for (let j = rs ? rs[i] : 0; j < i; j++) s -= A[ri + j] * b[j]; b[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = b[i]; const ri = i * n, e = re ? re[i] : n - 1; for (let j = i + 1; j <= e; j++) s -= A[ri + j] * b[j]; b[i] = s / A[ri + i]; }
  }
};

const SOLVER = {};

/* Jacobian J[i*n+j] = ∂f_i/∂y_j ; dùng cấu trúc thưa theo khối nếu sys.colGroups có */
SOLVER.jacobian = function (sys, t, y, f0, J) {
  const n = sys.n, yy = Float64Array.from(y), fj = sys._fj || (sys._fj = new Float64Array(n));
  const groups = sys.colGroups;
  if (groups) {
    J.fill(0);
    const dl = sys._dl || (sys._dl = new Float64Array(n));
    for (const g of groups) {
      for (const j of g) { dl[j] = 1e-7 * Math.max(Math.abs(y[j]), 1); yy[j] = y[j] + dl[j]; }
      sys.f(t, yy, fj);
      for (const j of g) {
        yy[j] = y[j];
        const rows = sys.colRows[j], d = dl[j];
        for (let k = 0; k < rows.length; k++) {
          const i = rows[k], df = fj[i] - f0[i];
          // bỏ nhiễu làm tròn (vd. lời giải pH lặp) để giữ cấu trúc thưa cho LU
          J[i * n + j] = Math.abs(df) <= 1e-11 * (Math.abs(f0[i]) + 1e-8) ? 0 : df / d;
        }
      }
    }
    return;
  }
  for (let j = 0; j < n; j++) {
    const d = 1e-7 * Math.max(Math.abs(y[j]), 1);
    yy[j] = y[j] + d;
    sys.f(t, yy, fj);
    yy[j] = y[j];
    for (let i = 0; i < n; i++) J[i * n + j] = (fj[i] - f0[i]) / d;
  }
};

/* nhường luồng cho giao diện; MessageChannel không bị trình duyệt hãm khi tab ẩn như setTimeout */
const _tick = (() => {
  if (typeof MessageChannel === 'undefined') return () => new Promise(r => setTimeout(r, 0));
  const ch = new MessageChannel(), q = [];
  ch.port1.onmessage = () => { const r = q.shift(); r && r(); };
  return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); });
})();

/* Tích phân động ode23s.  opt: {rtol, atol, h0, hmax, tOut:[...], onOut(t,y), onProgress(t), abort:()=>bool, jacEvery} */
SOLVER.ode23s = async function (sys, t0, tf, y0, opt = {}) {
  const n = sys.n;
  const rtol = opt.rtol || 1e-4, atol = opt.atol || 1e-3, hmax = opt.hmax || (tf - t0) / 10;
  const d = 1 / (2 + Math.SQRT2), e32 = 6 + Math.SQRT2;
  let t = t0, y = Float64Array.from(y0), h = opt.h0 || 1e-4;
  const F0 = new Float64Array(n), F1 = new Float64Array(n), F2 = new Float64Array(n);
  const k1 = new Float64Array(n), k2 = new Float64Array(n), k3 = new Float64Array(n);
  const yt = new Float64Array(n), yn = new Float64Array(n);
  const J = new Float64Array(n * n), W = new Float64Array(n * n), piv = new Int32Array(n);
  const luRs = new Int32Array(n), luRe = new Int32Array(n);
  sys.f(t, y, F0);
  SOLVER.jacobian(sys, t, y, F0, J);
  let jacAge = 0, nSteps = 0, nRej = 0, nJac = 1, rejRun = 0;
  const tOut = opt.tOut || [];
  let iOut = 0;
  while (iOut < tOut.length && tOut[iOut] <= t0 + 1e-12) { opt.onOut && opt.onOut(tOut[iOut], y); iOut++; }
  let lastYield = performance.now();
  const jacEvery = opt.jacEvery || 8;
  while (t < tf - 1e-12) {
    if (opt.abort && opt.abort()) throw new Error('Đã dừng theo yêu cầu');
    h = Math.min(h, hmax, tf - t);
    // dừng đúng tại điểm gián đoạn (chuyển pha) kế tiếp
    let hitBrk = false, hFree = h;
    if (sys.nextBreak) { const tb = sys.nextBreak(t); if (t + h >= tb - 1e-12) { h = tb - t; hitBrk = true; } }
    for (let i = 0; i < n * n; i++) W[i] = -h * d * J[i];
    for (let i = 0; i < n; i++) W[i * n + i] += 1;
    const luS = LA.lu(W, n, piv, luRs, luRe);
    k1.set(F0); LA.solve(W, n, piv, k1, luS);
    for (let i = 0; i < n; i++) yt[i] = y[i] + 0.5 * h * k1[i];
    sys.f(t + 0.5 * h, yt, F1);
    for (let i = 0; i < n; i++) k2[i] = F1[i] - k1[i];
    LA.solve(W, n, piv, k2, luS);
    for (let i = 0; i < n; i++) { k2[i] += k1[i]; yn[i] = y[i] + h * k2[i]; }
    sys.f(t + h, yn, F2);
    for (let i = 0; i < n; i++) k3[i] = F2[i] - e32 * (k2[i] - F1[i]) - 2 * (k1[i] - F0[i]);
    LA.solve(W, n, piv, k3, luS);
    let err = 0, iErr = -1;
    const tsc = sys.tolScale;                     // hệ số nới dung sai theo biến (vd lớp TSS của bể lắng phân tầng)
    for (let i = 0; i < n; i++) {
      const e = h / 6 * Math.abs(k1[i] - 2 * k2[i] + k3[i]);
      const sc = (atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yn[i]))) * (tsc ? tsc[i] : 1);
      const r = e / sc;
      if (r > err) { err = r; iErr = i; }
    }
    SOLVER.lastErrIdx = iErr;
    if (!isFinite(err)) err = 1e10;
    if (err <= 1) {
      // ghi kết quả tại các thời điểm xuất (nội suy liên tục của ode23s)
      while (iOut < tOut.length && tOut[iOut] <= t + h + 1e-12) {
        const s = (tOut[iOut] - t) / h, c1 = s * (1 - s) / (1 - 2 * d), c2 = s * (s - 2 * d) / (1 - 2 * d);
        for (let i = 0; i < n; i++) yt[i] = y[i] + h * (c1 * k1[i] + c2 * k2[i]);
        opt.onOut && opt.onOut(tOut[iOut], yt);
        iOut++;
      }
      t += h; y.set(yn); F0.set(F2); nSteps++; jacAge++;
      // tại điểm gián đoạn ghi cả phía trái (t−ε) và phải (t+ε) để lấy tích phân/trung bình chính xác
      if (opt.onStep) opt.onStep(hitBrk ? t - 1e-9 : t, y);
      if (hitBrk) {
        // sang phía phải của điểm gián đoạn: đánh giá lại f và Jacobian, giữ bước tự do trước đó
        t += 1e-9; sys.f(t, y, F0); SOLVER.jacobian(sys, t, y, F0, J); jacAge = 0; nJac++;
        if (opt.onStep) opt.onStep(t, y);
        rejRun = 0;
        h = Math.max(hFree, h);
        continue;
      }
      if (jacAge >= jacEvery) { SOLVER.jacobian(sys, t, y, F0, J); jacAge = 0; nJac++; }
      rejRun = 0;
    } else {
      nRej++; rejRun++;
      if (opt.onReject) opt.onReject(t, h, iErr, err);
      // W-method: Jacobian cũ vẫn hợp lệ; chỉ tính lại khi bị loại liên tiếp
      if (jacAge > 0 && rejRun >= 2) { SOLVER.jacobian(sys, t, y, F0, J); jacAge = 0; nJac++; }
    }
    h = h * Math.min(5, Math.max(0.1, 0.8 * Math.pow(Math.max(err, 1e-10), -1 / 3)));
    if (h < 1e-12) throw new Error('Bước tích phân quá nhỏ tại t = ' + t.toFixed(5) + ' d');
    if (performance.now() - lastYield > 40) {
      opt.onProgress && opt.onProgress(t, { nSteps, nRej, nJac, h });
      await _tick();
      lastYield = performance.now();
    }
  }
  return { y, t, nSteps, nRej, nJac };
};

/* Trạng thái ổn định: tích phân ode23s với đầu vào không đổi theo từng đoạn,
   dừng khi thay đổi tương đối của mọi biến trong một đoạn < tol.
   (giữ nguyên bảo toàn khối lượng, chịu được hàm không trơn của bể lắng)
   opt: {chunk, maxT, tol, rtol, atol, onProgress(t, change), abort} */
SOLVER.steady = async function (sys, y0, opt = {}) {
  if (sys.period > 0 && opt.extrap !== false) return SOLVER.steadyCyclic(sys, y0, opt);
  const n = sys.n, maxT = opt.maxT || 2000, tol = opt.tol || 2e-4;
  // hệ có chu kỳ (SBR): so sánh trạng thái tại cùng pha của chu kỳ
  const chunk = opt.chunk || (sys.period > 0 ? Math.ceil(40 / sys.period) * sys.period : 40);
  const hmax = Math.min(chunk / 2, sys.hmax || Infinity);
  let y = Float64Array.from(y0), t = 0, ch = Infinity, steps = 0;
  while (t < maxT) {
    const prev = Float64Array.from(y);
    const d = await SOLVER.ode23s(sys, t, t + chunk, y, {
      hmax, rtol: opt.rtol || 1e-3, atol: opt.atol || 1e-2, abort: opt.abort,
      onProgress: tt => opt.onProgress && opt.onProgress(tt, ch)
    });
    y = d.y; t += chunk; steps += d.nSteps;
    ch = 0;
    // thay đổi tương đối; biến nhỏ (< 10 g/m³) xét theo ngưỡng tuyệt đối để bỏ qua nhiễu số quanh 0
    for (let i = 0; i < n; i++) { const v = Math.abs(y[i] - prev[i]) / ((Math.abs(y[i]) + 10) * (sys.tolScale ? sys.tolScale[i] : 1)); if (v > ch) ch = v; }
    opt.onProgress && opt.onProgress(t, ch);
    if (ch < tol) break;
  }
  // chưa hội tụ (mode rất chậm, vd thành phần lớp màng sinh học sát giá thể): ngoại suy mode chậm như hệ chu kỳ, thêm tối đa maxT
  if (ch >= tol && !(sys.period > 0) && opt.extrap !== false && !opt._ext) {
    const r2 = await SOLVER.steadyCyclic(sys, y, Object.assign({}, opt, { _ext: true, chunk }));
    return { y: r2.y, res: r2.res, simT: t + r2.simT, steps: steps + r2.steps, converged: r2.converged, nExt: r2.nExt };
  }
  return { y, res: ch, simT: t, steps, converged: ch < tol };
};

/* Trạng thái tuần hoàn cho hệ có chu kỳ (SBR/ICEAS/C-Tech): tích phân từng đoạn ~2 ngày (bội số chu kỳ),
   ước lượng tỉ số suy giảm r của mode chậm (tích lũy bùn theo SRT) từ hai đoạn liên tiếp và ngoại suy
   y∞ ≈ y + Δ·r/(1−r) (phương pháp lũy thừa/Aitken véc-tơ), rồi tích phân tiếp để xác nhận.
   Hội tụ khi phần thay đổi còn lại ước tính (|Δ|·r/(1−r)) < tol. */
SOLVER.steadyCyclic = async function (sys, y0, opt = {}) {
  const n = sys.n, maxT = opt.maxT || 2000, tol = opt.tol || 2e-4;
  const chunk = sys.period > 0 ? Math.max(1, Math.round(2 / sys.period)) * sys.period : (opt.chunk || 40);
  const hmax = Math.min(chunk / 2, sys.hmax || Infinity);
  let y = Float64Array.from(y0), t = 0, steps = 0, ch = Infinity, nExt = 0;
  let dPrev = null, fCap = 40, lastExt = 0;
  const w = new Float64Array(n);
  while (t < maxT) {
    const prev = Float64Array.from(y);
    const d = await SOLVER.ode23s(sys, t, t + chunk, y, {
      // hệ chu kỳ có nhiều gián đoạn: dung sai chặt để tránh sai lệch tích lũy qua các chu kỳ
      hmax, rtol: opt.rtol || 1e-4, atol: opt.atol || 1e-3, abort: opt.abort,
      onProgress: tt => opt.onProgress && opt.onProgress(tt, ch)
    });
    y = d.y; t += chunk; steps += d.nSteps;
    const dl = new Float64Array(n);
    let mx = 0;
    const ts = sys.tolScale;
    for (let i = 0; i < n; i++) { w[i] = 1 / ((Math.abs(y[i]) + 10) * (ts ? ts[i] : 1)); dl[i] = y[i] - prev[i]; mx = Math.max(mx, Math.abs(dl[i]) * w[i]); }
    let r = 0;
    // tỉ số suy giảm của mode chậm: ưu tiên đại lượng vô hướng tổng khối lượng bùn (ít nhiễu), dự phòng theo véc-tơ
    if (dPrev) {
      // biến "hình dạng" (lớp TSS phân tầng, tolScale > 1) bị loại khỏi ước lượng vì dao động theo chu kỳ
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) { if (ts && ts[i] > 1) continue; const wi = w[i] * w[i]; a += dl[i] * dPrev[i] * wi; b += dPrev[i] * dPrev[i] * wi; }
      r = b > 0 ? a / b : 0;
    }
    // hệ không chu kỳ (nhánh dự phòng): mode có thể rất chậm (tỉ số mỗi đoạn 40 ngày > 0,995) → cho phép ngoại suy tới 0,9995
    const rMax = opt._ext ? 0.9995 : 0.995;
    const rr = Math.min(Math.max(r, 0), rMax);
    // ước tính thay đổi còn lại: theo mode chậm 1/(1−r), không nhỏ hơn mức trôi tuyến tính trong 40 ngày
    // (nhánh dự phòng hệ không chu kỳ: cùng tiêu chí với SOLVER.steady – thay đổi mỗi đoạn; ngoại suy chỉ để tăng tốc)
    ch = opt._ext ? mx : mx * Math.max(rr > 0 ? 1 / (1 - rr) : 1, 5);
    opt.onProgress && opt.onProgress(t, ch);
    if (dPrev && ch < tol) break;
    // ngoại suy làm xấu đi (thay đổi sau ngoại suy lớn hơn trước) → giảm giới hạn hệ số ngoại suy
    if (lastExt && mx > 2 * lastExt) fCap = Math.max(fCap * 0.4, 1);
    lastExt = 0;
    if (dPrev && r > 0.2 && r < rMax && mx > tol * 0.1 && fCap > 1.01) {
      // ngoại suy (giảm chấn 0,9, có giới hạn thích nghi), giữ không âm
      const f = Math.min(0.9 * r / (1 - r), fCap);
      lastExt = mx;
      for (let i = 0; i < n; i++) { if (ts && ts[i] > 1) continue; const v = y[i] + f * dl[i]; y[i] = v < 0 ? Math.max(y[i] * 0.2, 0) : v; }
      nExt++; dPrev = null;
      continue;
    }
    dPrev = dl;
  }
  return { y, res: ch, simT: t, steps, converged: ch < tol, nExt };
};

/* (dự phòng) pseudo-transient continuation */
SOLVER.steadyPTC = async function (sys, y0, opt = {}) {
  const n = sys.n;
  const maxIt = opt.maxIt || 400, tol = opt.tol || 1e-7;
  let y = Float64Array.from(y0), dt = opt.dt0 || 0.05;
  const F = new Float64Array(n), Ft = new Float64Array(n), dy = new Float64Array(n), yt = new Float64Array(n);
  const J = new Float64Array(n * n), A = new Float64Array(n * n), piv = new Int32Array(n);
  const resid = (Fv, yv) => { let r = 0; for (let i = 0; i < n; i++) { const v = Math.abs(Fv[i]) / (Math.abs(yv[i]) + 1); if (v > r) r = v; } return r; };
  sys.f(0, y, F);
  let res = resid(F, y), it = 0, lastYield = performance.now(), simT = 0;
  for (it = 0; it < maxIt; it++) {
    if (opt.abort && opt.abort()) throw new Error('Đã dừng theo yêu cầu');
    if (res < tol && dt > 1e3) break;
    SOLVER.jacobian(sys, 0, y, F, J);
    let accepted = false;
    for (let tries = 0; tries < 12 && !accepted; tries++) {
      for (let i = 0; i < n * n; i++) A[i] = -J[i];
      for (let i = 0; i < n; i++) A[i * n + i] += 1 / dt;
      LA.lu(A, n, piv);
      dy.set(F); LA.solve(A, n, piv, dy);
      for (let i = 0; i < n; i++) { const v = y[i] + dy[i]; yt[i] = (opt.nonneg !== false && v < 0) ? 0 : v; }
      sys.f(0, yt, Ft);
      const rt = resid(Ft, yt);
      if (isFinite(rt) && (rt < 3 * res || dt < 1e-3)) {
        y.set(yt); F.set(Ft); simT += dt;
        const ratio = rt > 0 ? res / rt : 10;
        dt = Math.min(1e9, dt * Math.min(10, Math.max(0.5, ratio)));
        if (rt < res && dt < 1e9) dt *= 1.5;
        res = rt; accepted = true;
      } else dt /= 4;
    }
    if (!accepted) dt = Math.max(dt, 1e-3);
    if (performance.now() - lastYield > 40) {
      opt.onProgress && opt.onProgress(it, res, dt);
      await _tick();
      lastYield = performance.now();
    }
  }
  return { y, res, it, converged: res < tol * 10, simT };
};
