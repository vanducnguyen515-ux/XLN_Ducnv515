/* AquaDesign VN – áp dụng phương án sửa cho cảnh báo / lỗi: đổi thông số, tính lại, so sánh trước – sau.
   Phương án (FX) do engine gắn vào d.warn/d.err: { l: nhãn, set: { 'đường.dẫn': giá trị | S => giá trị } }. */
'use strict';
const FIX = {};

// nguồn thông báo theo thứ tự hiển thị (như màn hình chính)
FIX.KEYS = ['load', 'sst', 'sbr', 'iceas', 'ctech', 'mbr', 'bio', 'tank', 'aer', 'rs', 'grit', 'sludge', 'msig', 'hsg', 'pipes', 'cost'];

// danh sách thông báo có id ổn định trong một lần tính: { id, key, title, lvl, t, fix }
FIX.list = function (R) {
  const out = [], seen = new Set();
  for (const k of FIX.KEYS) {
    const d = R[k] && R[k].d; if (!d) continue;
    // báo cáo sinh học lồng trong SBR / MBR / ICEAS / C-Tech (R.bio trỏ cùng đối tượng → bỏ trùng)
    const subs = [d]; if (R[k].B && R[k].B.d && R[k].B.d !== d) subs.push(R[k].B.d);
    subs.forEach((dd, j) => { if (seen.has(dd)) return; seen.add(dd); dd.msgs.forEach((m, i) => out.push({ id: k + '.' + j + '.' + i, key: k, title: dd.title, lvl: m.lvl, t: m.t, fix: m.fix || [] })); });
  }
  return out;
};

FIX.count = R => FIX.list(R).filter(m => m.lvl !== 'info').length;
FIX.score = R => FIX.list(R).reduce((s, m) => s + (m.lvl === 'err' ? 10 : m.lvl === 'warn' ? 1 : 0), 0) + (R.errors || []).length * 20;

// áp dụng một phương án lên bản sao S → { S2, changes: [[path, cũ, mới]] }
FIX.apply = function (S, fx) {
  const S2 = U.clone(S), changes = [];
  for (const [p, v] of Object.entries(fx.set || {})) {
    const old = U.get(S2, p), nv = typeof v === 'function' ? v(S2, old) : v;
    if (nv === undefined || (typeof nv === 'number' && !isFinite(nv))) continue;
    const val = typeof nv === 'number' ? +nv.toPrecision(6) : nv;
    if (JSON.stringify(old) === JSON.stringify(val)) continue;
    U.set(S2, p, val); changes.push([p, old, val]);
  }
  return { S2, changes };
};

// thử phương án: tính lại, so sánh số cảnh báo/lỗi và thông báo gốc còn không
FIX.trial = function (S, R, msg, fx) {
  const { S2, changes } = FIX.apply(S, fx);
  if (!changes.length) return { fx, changes, ok: false, same: true };
  const R2 = ENG.compute(S2);
  const still = FIX.list(R2).some(m => m.key === msg.key && m.t.slice(0, 40) === msg.t.slice(0, 40));
  return { fx, S2, R2, changes, resolved: !still, before: FIX.score(R), after: FIX.score(R2), nBefore: FIX.count(R), nAfter: FIX.count(R2), crash: (R2.errors || []).length > (R.errors || []).length };
};

/* tự sửa: lặp – mỗi vòng thử mọi phương án của mọi lỗi/cảnh báo, chọn phương án giảm điểm nhiều nhất,
   áp dụng, tính lại; dừng khi không còn cải thiện hoặc đủ số vòng. Trả về nhật ký các bước. */
FIX.auto = function (S0, maxIt = 12) {
  let S = U.clone(S0), R = ENG.compute(S);
  const log = [], tried = new Set();
  for (let it = 0; it < maxIt; it++) {
    const msgs = FIX.list(R).filter(m => m.lvl !== 'info' && m.fix.length);
    let best = null;
    for (const m of msgs) for (const fx of m.fix) {
      const key = m.t.slice(0, 60) + '|' + fx.l;
      if (tried.has(key)) continue;
      const t = FIX.trial(S, R, m, fx);
      if (!t.changes.length || t.crash) { tried.add(key); continue; }
      const gain = t.before - t.after;
      if (gain > 0 && (!best || gain > best.gain || (gain === best.gain && t.resolved && !best.resolved))) best = Object.assign(t, { gain, msg: m, key });
    }
    if (!best) {
      // không phương án đơn nào cải thiện: thử tổ hợp 2 bước (vd. đổi chu trình rồi nới NO₃ ra)
      const pair = FIX.pair(S, R, msgs, tried);
      if (!pair) break;
      for (const st of pair) { tried.add(st.key); log.push({ msg: st.msg.t, title: st.msg.title, fx: st.fx.l, changes: st.changes, nBefore: st.nBefore, nAfter: st.nAfter }); }
      S = pair[1].S2; R = pair[1].R2;
      continue;
    }
    tried.add(best.key);
    log.push({ msg: best.msg.t, title: best.msg.title, fx: best.fx.l, changes: best.changes, nBefore: best.nBefore, nAfter: best.nAfter });
    S = best.S2; R = best.R2;
  }
  return { S, R, log };
};

FIX.pair = function (S, R, msgs, tried) {
  const s0 = FIX.score(R);
  let best = null;
  for (const m of msgs) for (const fx of m.fix) {
    const k1 = m.t.slice(0, 60) + '|' + fx.l;
    if (tried.has(k1)) continue;
    const t1 = FIX.trial(S, R, m, fx);
    if (!t1.changes.length || t1.crash || t1.after > s0 + 2) continue;   // bước 1 không được làm xấu nhiều
    for (const m2 of FIX.list(t1.R2).filter(x => x.lvl !== 'info' && x.fix.length)) for (const fx2 of m2.fix) {
      const t2 = FIX.trial(t1.S2, t1.R2, m2, fx2);
      if (!t2.changes.length || t2.crash) continue;
      const gain = s0 - t2.after;
      if (gain > 0 && (!best || gain > best.gain)) best = { gain, st: [Object.assign(t1, { msg: m, key: k1 }), Object.assign(t2, { msg: m2, key: m2.t.slice(0, 60) + '|' + fx2.l })] };
    }
  }
  return best && best.st;
};

// tên hiển thị cho đường dẫn thông số – lấy từ nhãn trong các biểu mẫu
FIX.label = function (p) {
  if (!FIX._lab) {
    FIX._lab = {};
    try {
      const W = DEF.project();
      for (const f of Object.values(FORMS)) for (const x of f.fields(W)) if (x.p && x.l && !FIX._lab[x.p]) FIX._lab[x.p] = x.l + (x.u ? ' [' + x.u + ']' : '');
    } catch (e) { /* bỏ qua */ }
  }
  return FIX._lab[p] || p;
};
FIX.fmtV = v => typeof v === 'boolean' ? (v ? 'có' : 'không') : typeof v === 'number' ? U.fmt(v) : String(v);
FIX.changeText = ch => ch.map(([p, a, b]) => FIX.label(p) + ': ' + FIX.fmtV(a) + ' → ' + FIX.fmtV(b)).join('; ');
