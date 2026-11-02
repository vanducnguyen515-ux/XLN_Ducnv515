'use strict';
/* ==========================================================================
   Số phiên bản chung của Bộ phần mềm XLN_Ducnv515 (10 phần mềm dùng chung một số).
   Quy ước: 6.00 = bản lớn 6; mỗi lần sửa nhỏ tăng 0.01 (6.01, 6.02 …) cho đến khi có lệnh nâng bản lớn.
   Nhật ký thay đổi: CHANGELOG.md. Mỗi phần tử [data-ver] trong trang được điền "v6.xx".
   ========================================================================== */
const XLNT_VERSION = '11.00', XLNT_BUILD = '2026-11-02';
// chế độ kiểm thử (?xlnt_test – test_all.html): localStorage tạm trong bộ nhớ → phần mềm mở ở trạng thái mặc định, không đọc/ghi dự án đã lưu của người dùng
if (/[?&]xlnt_test(&|=|$)/.test(location.search)) {
  const m = {}, st = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; },
    clear: () => { for (const k in m) delete m[k]; }, key: i => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } };
  try { Object.defineProperty(window, 'localStorage', { value: st, configurable: true }); } catch (e) { /* */ }
  window.XLNT_TEST = true;
}
// nhật ký lỗi JavaScript của trang (test_all.html đọc để báo lỗi khi mở phần mềm)
window.__xlntErr = window.__xlntErr || [];
addEventListener('error', e => { if (e.message) window.__xlntErr.push(e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno); });
addEventListener('unhandledrejection', e => window.__xlntErr.push('promise: ' + (e.reason && e.reason.message || e.reason)));
/* tự co thanh tiêu đề theo độ rộng thật (cỡ chữ phóng to, chế độ VI + EN…): thêm dần lớp <pre>1 … <pre>n lên <html> cho tới khi
   over(phần tử) = false; tính lại khi đổi kích thước cửa sổ hoặc đổi chế độ ngôn ngữ. CSS của từng phần mềm định nghĩa các mức. */
window.XLNT_FIT = (sel, n, pre, over) => {
  pre = pre || 'fit'; over = over || (el => el.scrollWidth > el.clientWidth + 1);
  const h = document.documentElement;
  const run = () => {
    const el = document.querySelector(sel); if (!el || !el.offsetParent && el !== document.body) return;
    for (let i = 1; i <= n; i++) h.classList.remove(pre + i);
    for (let i = 1; i <= n && over(el); i++) h.classList.add(pre + i);
  };
  let t = 0, lang = '';
  const sched = () => { clearTimeout(t); t = setTimeout(run, 80); };
  addEventListener('resize', sched);
  // khung đang ẩn (display:none trong bộ phần mềm) không nhận sự kiện resize – theo dõi kích thước phần tử khi được hiện lại
  const el0 = document.querySelector(sel); if (el0 && window.ResizeObserver) new ResizeObserver(sched).observe(el0);
  new MutationObserver(() => { const l = (h.className.match(/lang-\w+/) || [''])[0]; if (l !== lang) { lang = l; sched(); } }).observe(h, { attributes: true, attributeFilter: ['class'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sched); else sched();
  setTimeout(run, 600); setTimeout(run, 2000);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sched);
  return run;
};
// nhật ký thay đổi: dòng dưới do build_1file.py sinh lại từ CHANGELOG.md (đừng sửa tay)
const XLNT_CHANGELOG = "# Nhật ký phiên bản – Bộ phần mềm XLN_Ducnv515 (bản phát hành)\n\n## 11.00 – 2026-11-02 · Bản phát hành\n- 10 phần mềm: Thiết kế XLNT, AquaDesign VN, ICEAS Studio, NEREDA® AGS, SimXLNT, Cấp khí, SimNước, Xử lý bùn, KhíSạch, XLNuoc.\n- Chỉ xuất PDF; mỗi trang PDF là ảnh có watermark bản quyền “Nguyễn Văn Đức 0989 660 396, ducnv515@gmail.com”.\n- Không có xuất Excel (công thức sống), Word/DOC, AutoCAD/DXF và các tệp dữ liệu khác.\n";
(() => {
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // markdown tối giản của CHANGELOG.md: #, ##, ###, -, **đậm**, `mã`, ---
  const md = t => {
    let h = '', ul = false;
    const inl = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
    for (const ln of t.split(/\r?\n/)) {
      const li = /^\s*[-*] (.*)/.exec(ln);
      if (!li && ul) { h += '</ul>'; ul = false; }
      if (li) { if (!ul) { h += '<ul>'; ul = true; } h += '<li>' + inl(li[1]) + '</li>'; }
      else if (/^### /.test(ln)) h += '<h4>' + inl(ln.slice(4)) + '</h4>';
      else if (/^## /.test(ln)) h += '<h3>' + inl(ln.slice(3)) + '</h3>';
      else if (/^# /.test(ln)) h += '<h2>' + inl(ln.slice(2)) + '</h2>';
      else if (/^---/.test(ln)) h += '<hr>';
      else if (ln.trim()) h += '<p>' + inl(ln) + '</p>';
    }
    return h + (ul ? '</ul>' : '');
  };
  function showLog() {
    if (document.getElementById('xverOv')) return;
    const ov = document.createElement('div'); ov.id = 'xverOv';
    ov.innerHTML = `<div class="box"><div class="hd"><b>XLN_Ducnv515 · v${XLNT_VERSION}</b><span>${XLNT_BUILD}</span><button type="button">✕</button></div>
      <div class="bd">${XLNT_CHANGELOG ? md(XLNT_CHANGELOG) : '<p>Chưa có nhật ký thay đổi.</p>'}</div></div>`;
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    ov.onclick = e => { if (e.target === ov || e.target.closest('.hd button')) close(); };
    document.addEventListener('keydown', key);
    document.body.appendChild(ov);
  }
  const fill = () => {
    if (!document.getElementById('xverCss')) {
      const s = document.createElement('style'); s.id = 'xverCss';
      s.textContent = '.xver{display:inline-block;margin-left:.45em;padding:1px 6px;border-radius:9px;font:600 11px/1.5 system-ui,sans-serif;letter-spacing:.02em;' +
        'vertical-align:middle;white-space:nowrap;font-style:normal;background:rgba(127,127,127,.16);color:inherit;opacity:.85;text-transform:none;cursor:pointer}' +
        '.xver:hover{opacity:1;background:rgba(127,127,127,.3)}' +
        '#xverOv{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px}' +
        '#xverOv .box{background:#fff;color:#0f172a;border-radius:10px;box-shadow:0 20px 50px rgba(0,0,0,.3);width:min(760px,100%);max-height:85vh;display:flex;flex-direction:column;font:14px/1.5 system-ui,"Segoe UI",sans-serif;text-align:left}' +
        '#xverOv .hd{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid #e2e8f0}#xverOv .hd span{color:#64748b;font-size:12px;flex:1}' +
        '#xverOv .hd button{border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:2px 9px;cursor:pointer;font-size:13px;color:#0f172a}' +
        '#xverOv .bd{overflow:auto;padding:4px 18px 14px}#xverOv h2{font-size:17px;margin:12px 0 6px}#xverOv h3{font-size:15px;margin:16px 0 4px;color:#0f62c9}#xverOv h4{font-size:13.5px;margin:10px 0 2px}' +
        '#xverOv p{margin:4px 0}#xverOv ul{margin:2px 0 6px;padding-left:20px}#xverOv li{margin:1px 0}#xverOv code{background:#f1f5f9;padding:0 4px;border-radius:3px;font-size:12.5px}#xverOv hr{border:0;border-top:1px solid #e2e8f0;margin:12px 0}';
      document.head.appendChild(s);
    }
    document.querySelectorAll('[data-ver]').forEach(e => {
      e.classList.add('xver'); e.textContent = 'v' + XLNT_VERSION; e.title = 'Phiên bản ' + XLNT_VERSION + ' · ' + XLNT_BUILD + ' – bấm để xem nhật ký thay đổi';
      if (!e._xv) { e._xv = 1; e.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); showLog(); }); }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
  window.XLNT_SHOWLOG = showLog;
})();
