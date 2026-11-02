'use strict';
/* ==========================================================================
   Trạng thái phần mềm dùng chung (nạp sau xch.js):
   – mỗi phần mềm tự lưu trạng thái vào localStorage dưới các khóa riêng (STATE.init(app, {keys})).
   – STATE.get() / STATE.set(snap): chụp / nạp lại toàn bộ trạng thái → hồ sơ dự án chung của bộ phần mềm (suite: Dự án ▾).
   – Hoàn tác / làm lại (↶ ↷, Ctrl+Z / Ctrl+Y ngoài ô nhập): mỗi lần phần mềm ghi khóa của mình → chụp một mốc (lưu ở sessionStorage
     để còn sau khi tải lại trang); nạp mốc: apply(snap) tại chỗ nếu phần mềm hỗ trợ, nếu không thì tải lại trang.
   o: { keys: RegExp, apply(snap) → true nếu đã nạp tại chỗ, before() – ghi nốt thay đổi đang chờ trước khi chụp }
   ========================================================================== */
const STATE = (() => {
  const MAXN = 30, MAXB = 2.5e6, QUIET = 2500;
  let app = null, o = null, timer = 0, ub = null, rb = null;
  const ss = window.sessionStorage;
  const HK = () => 'xlnt_hist_' + app, QK = () => 'xlnt_hist_quiet_' + app;
  const own = k => o && o.keys.test(k);

  function snap() {
    const keys = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (own(k)) keys[k] = localStorage.getItem(k); }
    return { app, ver: typeof XLNT_VERSION !== 'undefined' ? XLNT_VERSION : undefined, time: new Date().toISOString(), keys };
  }
  async function get() { if (o.before) await o.before(); await new Promise(r => setTimeout(r, 400)); return snap(); }
  // nạp mốc trạng thái; trả về true nếu nạp tại chỗ (không tải lại)
  function set(s, fromHist) {
    if (!s || !s.keys) throw new Error('hồ sơ trạng thái không hợp lệ');
    const cur = []; for (let i = 0; i < localStorage.length; i++) cur.push(localStorage.key(i));
    quiet();
    cur.filter(own).forEach(k => { if (!(k in s.keys)) localStorage.removeItem(k); });
    for (const [k, v] of Object.entries(s.keys)) if (own(k)) localStorage.setItem(k, v);
    if (!fromHist) hist(h => { h.stack = h.stack.slice(0, h.pos + 1); h.stack.push(JSON.stringify(s.keys)); h.pos = h.stack.length - 1; });
    let done = false;
    try { done = !!(o.apply && o.apply(s)); } catch (e) { console.error(e); }
    if (!done) setTimeout(() => location.reload(), 30);
    btns();
    return done;
  }

  /* ---------- lịch sử hoàn tác ---------- */
  function hist(fn) {
    let h; try { h = JSON.parse(ss.getItem(HK()) || 'null'); } catch (e) { h = null; }
    h = h || { stack: [], pos: -1 };
    if (fn) {
      fn(h);
      while (h.stack.length > MAXN || (h.stack.length > 2 && h.stack.reduce((a, x) => a + x.length, 0) > MAXB)) { h.stack.shift(); h.pos--; }
      try { ss.setItem(HK(), JSON.stringify(h)); } catch (e) { /* hết chỗ: bỏ bớt mốc cũ */ h.stack.splice(0, Math.ceil(h.stack.length / 2)); h.pos = h.stack.length - 1; try { ss.setItem(HK(), JSON.stringify(h)); } catch (e2) { /* */ } }
    }
    return h;
  }
  function quiet() { try { ss.setItem(QK(), String(Date.now())); } catch (e) { /* */ } }
  const isQuiet = () => { const t = +(ss.getItem(QK()) || 0); return Date.now() - t < QUIET; };
  function record() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (isQuiet()) return;
      const k = JSON.stringify(snap().keys);
      hist(h => { if (h.stack[h.pos] === k) return; h.stack = h.stack.slice(0, h.pos + 1); h.stack.push(k); h.pos = h.stack.length - 1; });
      btns();
    }, 700);
  }
  function step(d) {
    const h = hist(), p = h.pos + d;
    if (p < 0 || p >= h.stack.length) return;
    hist(x => { x.pos = p; });
    set({ keys: JSON.parse(h.stack[p]) }, true);
    if (typeof XCH !== 'undefined') XCH.toast(d < 0 ? 'Đã hoàn tác · Undone' : 'Đã làm lại · Redone');
  }
  function btns() {
    if (!ub) return;
    const h = hist();
    ub.disabled = h.pos <= 0; rb.disabled = h.pos >= h.stack.length - 1;
    ub.title = `Hoàn tác (Ctrl+Z) · Undo – ${Math.max(h.pos, 0)} bước`; rb.title = `Làm lại (Ctrl+Y) · Redo – ${Math.max(h.stack.length - 1 - h.pos, 0)} bước`;
  }
  // nút ↶ ↷ đặt ngay sau nút ⇄ Trao đổi
  function mount(after) {
    if (!after || ub) return;
    const mk = (t, d) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'xch-btn st-btn'; b.textContent = t; b.setAttribute('data-nobi', ''); b.onclick = () => step(d); return b; };
    ub = mk('↶', -1); rb = mk('↷', 1);
    after.after(ub); ub.after(rb);
    if (!document.getElementById('stCss')) { const s = document.createElement('style'); s.id = 'stCss'; s.textContent = '.st-btn{min-width:30px;padding-left:7px!important;padding-right:7px!important}.st-btn:disabled{opacity:.4;cursor:default}'; document.head.appendChild(s); }
    btns();
  }

  function init(a, opt) {
    app = a; o = opt;
    if (window.XLNT_TEST) return;          // chế độ kiểm thử: localStorage tạm, không ghi lịch sử
    const set0 = Storage.prototype.setItem, rm0 = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) { const r = set0.call(this, k, v); if (this === localStorage && own(k)) record(); return r; };
    Storage.prototype.removeItem = function (k) { const r = rm0.call(this, k); if (this === localStorage && own(k)) record(); return r; };
    setTimeout(() => { if (!isQuiet()) record(); }, 1200);           // mốc đầu tiên = trạng thái lúc mở
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target, ed = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (ed) return;                      // trong ô nhập: để trình duyệt hoàn tác chữ
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); step(-1); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); step(1); }
    });
    const anc = () => document.getElementById('xchBtn') || (o.anchor && document.querySelector(o.anchor));
    if (anc()) mount(anc()); else document.addEventListener('DOMContentLoaded', () => mount(anc()));
  }

  /* ---------- Lưu / mở dự án ra tệp (.json) ----------
     Tệp {schema:'xlnt-app', app, ver, time, name, keys} – toàn bộ khóa lưu trữ của phần mềm. Mở được cả hồ sơ dự án chung
     của bộ phần mềm (.xlntproj.json): lấy phần của phần mềm này. Nạp qua set() → hoàn tác được bằng ↶. */
  const VER = () => (typeof XLNT_VERSION !== 'undefined' ? XLNT_VERSION : '');
  const projName = () => { try { return (o.name && o.name()) || ''; } catch (e) { return ''; } };
  async function saveFile() {
    const s = await get(), n = projName();
    const P = Object.assign({ schema: 'xlnt-app', name: n }, s);
    const fn = ((n || app).replace(/[^\w\-À-ỹ ]+/g, '_').trim().replace(/\s+/g, '_').slice(0, 50) || app) + '.' + app + '.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(P, null, 1)], { type: 'application/json' }));
    a.download = fn; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    if (typeof XCH !== 'undefined') XCH.toast('Đã lưu dự án: ' + fn + ' · Project saved');
  }
  function openFile() {
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json,application/json';
    fi.onchange = () => {
      const file = fi.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => openText(rd.result, file.name);
      rd.readAsText(file);
    };
    fi.click();
  }
  function openText(txt, fname) {
    let P; try { P = JSON.parse(txt); } catch (e) { alert('Không đọc được tệp: ' + e.message); return; }
    let s = null;
    if (P && P.schema === 'xlnt-app' && P.app === app && P.keys) s = P;
    else if (P && P.schema === 'xlnt-project' && P.apps && P.apps[app]) s = Object.assign({ name: P.name, ver: P.ver }, P.apps[app]);
    else if (P && P.schema === 'xlnt-app') { alert(`Tệp này là dự án của phần mềm khác (${P.app}). Hãy mở bằng phần mềm đó.`); return; }
    else if (P && P.schema === 'xlnt-xch') { alert('Đây là hồ sơ trao đổi (.xlnt.json) – mở bằng nút ⇄ Trao đổi → Nhận từ tệp…'); return; }
    else { alert('Tệp không phải dự án của phần mềm này.'); return; }
    const v = s.ver && s.ver !== VER() ? `\n\n⚠ Tệp lập bằng phiên bản v${s.ver}, phiên bản đang chạy v${VER()}.` : '';
    if (!confirm(`Mở dự án "${s.name || fname}"${s.time ? ' (lưu lúc ' + new Date(s.time).toLocaleString('vi-VN') + ')' : ''} thay cho dự án hiện tại?${v}\n\nCó thể quay lại bằng nút ↶ Hoàn tác.`)) return;
    try { set(s); if (typeof XCH !== 'undefined') XCH.toast('Đã mở dự án · Project opened'); } catch (e) { alert('Không mở được dự án: ' + e.message); }
  }
  // nút "Mở dự án" / "Lưu dự án" (nhãn theo chế độ ngôn ngữ của bộ phần mềm); trả về [nút mở, nút lưu]
  function fileButtons(container, before, cls) {
    const L = [['📂 Mở dự án', '📂 Open project', 'Mở tệp dự án (.json) đã lưu – hoặc phần của phần mềm này trong hồ sơ dự án chung', openFile],
      ['💾 Lưu dự án', '💾 Save project', 'Lưu toàn bộ dự án hiện tại ra tệp .json', saveFile]];
    const bs = L.map(([vi, en, t, fn]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = cls || ''; b.title = t; b.setAttribute('data-nobi', ''); b.onclick = fn;
      b._lbl = [vi, en]; container.insertBefore(b, before || null); return b;
    });
    const draw = () => bs.forEach(b => { const t = typeof BI !== 'undefined' && BI.mode === 'en' ? b._lbl[1] : b._lbl[0], k = t.indexOf(' '); b.innerHTML = `<span class="ic">${t.slice(0, k)}</span><span class="tx">${t.slice(k)}</span>`; });
    draw(); if (typeof BI !== 'undefined' && BI.onMode) BI.onMode(draw);
    return bs;
  }

  // nút "📁 Dự án ▾" gom các nút dự án sẵn có của phần mềm (moveEls: Dự án mới / Khôi phục…) + Mở dự án + Lưu dự án – giữ thanh tiêu đề gọn
  function projectMenu(host, before, moveEls, cls) {
    if (!document.getElementById('prjCss')) {
      const st = document.createElement('style'); st.id = 'prjCss';
      st.textContent = '.prj-dd{position:relative;display:inline-flex;flex:none}.prj-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:60;display:flex;flex-direction:column;gap:4px;min-width:190px;padding:6px;background:var(--panel,#fff);border:1px solid var(--line,#cbd5e1);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.18)}.prj-menu[hidden]{display:none}.prj-menu button{text-align:left;white-space:nowrap;width:100%;margin:0}';
      document.head.appendChild(st);
    }
    const dd = document.createElement('span'), b = document.createElement('button'), m = document.createElement('div');
    dd.className = 'prj-dd'; b.type = 'button'; b.className = cls || ''; b.setAttribute('data-nobi', ''); b.title = 'Dự án: mới / mở / lưu · Project: new / open / save';
    m.className = 'prj-menu'; m.hidden = true;
    host.insertBefore(dd, before || null); dd.append(b, m);
    (moveEls || []).filter(Boolean).forEach(e => m.append(e));
    fileButtons(m, null, cls);
    const lbl = () => { b.innerHTML = '<span class="ic">📁</span><span class="tx"> ' + (typeof BI !== 'undefined' && BI.mode === 'en' ? 'Project' : 'Dự án') + '</span> ▾'; };
    lbl(); if (typeof BI !== 'undefined' && BI.onMode) BI.onMode(lbl);
    b.onclick = () => { m.hidden = !m.hidden; };
    m.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(() => { m.hidden = true; }, 0); });
    document.addEventListener('mousedown', e => { if (!dd.contains(e.target)) m.hidden = true; });
    return dd;
  }

  return { init, get, set, snap, step, saveFile, openFile, openText, fileButtons, projectMenu, get app() { return app; } };
})();
