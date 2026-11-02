/* =====================================================================
   SONG NGỮ VIỆT – ANH dùng chung cho cả bộ phần mềm (Thiết kế XLNT, AquaDesign, NEREDA, SimXLNT, SimNước)
   Ba chế độ hiển thị (nút chuyển "VI+EN · VI · EN", lưu trong trình duyệt, đồng bộ qua bộ phần mềm):
     bi : tiếng Việt + dòng tiếng Anh nhỏ, mờ bên dưới (mặc định)
     vi : chỉ tiếng Việt
     en : chỉ tiếng Anh (chuỗi chưa có bản dịch giữ tiếng Việt)
   BI.en(text)      → bản tiếng Anh ('' nếu không cần / không dịch được)
   BI.decorate(el)  → gắn bản tiếng Anh vào phần tử (tự động cho mọi nội dung mới nhờ MutationObserver)
   BI.html(str)     → chuỗi HTML đã gắn song ngữ (bản tính xuất file)
   BI.mode / BI.setMode(m), BI.mountSwitch(container)
   Dịch theo từ điển I18N_DICT (js/i18n_dict.js): khớp nguyên chuỗi, sau đó ghép theo cụm dài nhất.
   Trong bộ phần mềm, từ điển chỉ nạp một lần ở khung ngoài – các phần mềm con dùng chung (cùng nguồn gốc).
   ===================================================================== */
'use strict';

const BI = (() => {
  const W = typeof window !== 'undefined' ? window : {};
  let D = typeof I18N_DICT !== 'undefined' ? I18N_DICT : null;
  try { if (!D && W.parent && W.parent !== W && W.parent.I18N_DICT) D = W.parent.I18N_DICT; } catch (e) { /* khác nguồn gốc */ }
  D = D || {};
  const VI = /[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;   // chữ cái tiếng Việt (không gồm ×, chữ Hy Lạp)
  const LET = /[\p{L}]/u;
  const keys = Object.keys(D).map(k => k.trim()).filter(k => k && VI.test(k)).sort((a, b) => b.length - a.length);
  const DT = {}; for (const k of Object.keys(D)) DT[k.trim()] = D[k];
  const DTU = {}; for (const k of keys) { const u = k.toUpperCase(); if (DTU[u] === undefined) DTU[u] = (DT[k] || '').toUpperCase(); }
  const keysU = Object.keys(DTU).sort((a, b) => b.length - a.length);
  // chỉ mục theo ký tự đầu → ghép cụm nhanh hơn
  const byFirst = new Map(), byFirstU = new Map();
  for (const k of keys) { const c = k[0]; if (!byFirst.has(c)) byFirst.set(c, []); byFirst.get(c).push(k); }
  for (const k of keysU) { const c = k[0]; if (!byFirstU.has(c)) byFirstU.set(c, []); byFirstU.get(c).push(k); }
  const cache = new Map();
  const missing = new Map();
  const LS = 'xlnt_lang';
  let mode = 'bi';
  try {
    const v = localStorage.getItem(LS);
    if (v === 'bi' || v === 'vi' || v === 'en') mode = v;
    else if (localStorage.getItem('xlnt_bi') === '0') mode = 'vi';     // khóa cũ của Thiết kế XLNT
  } catch (e) { /* bỏ qua */ }

  function segReplace(s, upper) {
    const M = upper ? DTU : DT, idx = upper ? byFirstU : byFirst;
    let out = '', i = 0;
    while (i < s.length) {
      const c = s[i];
      let hit = null;
      if (VI.test(c) || LET.test(c) || /[^\s]/.test(c)) {
        const cand = idx.get(c);
        if (cand) {
          const b = s[i - 1];
          for (const k of cand) {
            if (!s.startsWith(k, i)) continue;
            const a = s[i + k.length];
            const okB = !LET.test(k[0]) || !b || !LET.test(b);
            const okA = !LET.test(k[k.length - 1]) || !a || !LET.test(a);
            if (okB && okA) { hit = k; break; }
          }
        }
      }
      if (hit) { out += M[hit] || ''; i += hit.length; } else { out += c; i++; }
    }
    return out;
  }

  function en(text) {
    if (text === undefined || text === null) return '';
    const s = String(text);
    if (!VI.test(s)) return '';
    if (cache.has(s)) return cache.get(s);
    const t = s.replace(/\s+/g, ' ').trim();
    let r;
    const isUp = t === t.toUpperCase() && /[A-ZÀ-Ỹ]/.test(t);
    if (DT[t] !== undefined) r = DT[t];
    else if (isUp && DTU[t] !== undefined) r = DTU[t];
    else {
      // số định dạng Việt Nam giữ nguyên; ghép theo cụm dài nhất
      r = isUp ? segReplace(t, true) : segReplace(t, false);
      if (VI.test(r)) r = isUp ? segReplace(r, false) : r;
      if (VI.test(r)) {
        const left = (r.match(/[\p{L}]+/gu) || []).filter(w => VI.test(w));
        missing.set(t, left.join(' '));
        const nw = (r.match(/[\p{L}]+/gu) || []).length;
        if (left.length > Math.max(1, 0.15 * nw)) r = '';
      }
    }
    r = (r || '').replace(/\s+([,.;:)])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    cache.set(s, r);
    return r;
  }

  /* ---------- gắn vào DOM ---------- */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'svg', 'TEXTAREA', 'OPTION', 'OPTGROUP', 'SELECT', 'INPUT', 'CANVAS', 'IFRAME', 'PRE', 'CODE', 'NOSCRIPT', 'TITLE', 'HEAD']);
  const FORM = 'input,select,textarea,button,svg,canvas,table,ul,ol,li,div,p,h1,h2,h3,h4,details,summary,section,tr,td,th,label,a[data-tab],nav,header,main,aside,form,fieldset,figure';
  const ours = n => n.nodeType === 1 && n.classList && (n.classList.contains('en') || n.classList.contains('vi') || n.classList.contains('bi') || n.classList.contains('en-sel') || n.classList.contains('selw'));
  const keep = n => n.nodeType === 1 && n.classList && (n.classList.contains('n') || n.classList.contains('nobi') || n.hasAttribute('data-nobi'));
  function textOf(el) {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1) {
        if (n.classList && (n.classList.contains('en') || n.classList.contains('n') || n.classList.contains('en-sel'))) continue;
        if (n.tagName === 'BR') { s += ' '; continue; }
        s += (/^(SMALL|DIV|P|SPAN|B|STRONG|EM|I|LABEL|A|H[1-6])$/.test(n.tagName) && s && !/\s$/.test(s) ? ' ' : '') + textOf(n);
      }
    }
    return s;
  }
  function mk(doc, t, tag) { const e = doc.createElement(tag || 'span'); e.className = 'en'; e.textContent = t; return e; }
  function skipEl(el) {
    return SKIP.has(el.tagName) || el.isContentEditable || (el.closest && el.closest('svg,[data-nobi],.nobi,.en,.en-sel,.vi,textarea,pre,code'));
  }
  function decorateEl(el, doc) {
    if (el.dataset.bi || ours(el) || skipEl(el)) return;
    const leaf = !el.querySelector(FORM);
    if (leaf) {
      el.dataset.bi = '1'; el.querySelectorAll('*').forEach(x => { x.dataset.bi = '1'; });
      const src = textOf(el);
      if (!VI.test(src)) return;
      const t = en(src);
      if (!t) return;
      // phần tử lá: bọc phần chữ gốc vào .vi, thêm .en (giữ nguyên huy hiệu số .n)
      const vi = doc.createElement('span'); vi.className = 'vi';
      for (const n of [...el.childNodes]) { if (keep(n) || ours(n)) continue; vi.appendChild(n); }
      el.appendChild(vi); el.appendChild(mk(doc, t));
      return;
    }
    for (const n of [...el.childNodes]) {
      if (n.nodeType !== 3 || !VI.test(n.nodeValue)) continue;
      const t = en(n.nodeValue);
      if (!t) continue;
      const w = doc.createElement('span'); w.className = 'bi'; w.dataset.bi = '1';
      const vi = doc.createElement('span'); vi.className = 'vi'; vi.textContent = n.nodeValue;
      w.appendChild(vi); w.appendChild(mk(doc, t));
      el.replaceChild(w, n);
    }
  }
  function decorateSelect(s, doc) {
    for (const op of s.options) {
      if (op.dataset.vi === undefined) {
        const txt = op.textContent;
        if (!VI.test(txt)) { op.dataset.vi = ''; continue; }
        op.dataset.vi = txt; op.dataset.en = en(txt) || '';
        if (op.dataset.en && !op.title) op.title = op.dataset.en;
      }
      if (!op.dataset.vi) continue;
      const want = mode === 'en' && op.dataset.en ? op.dataset.en : op.dataset.vi;
      if (op.textContent !== want) op.textContent = want;
    }
    // dòng tiếng Anh của lựa chọn đang chọn (chế độ song ngữ)
    const o = s.options[s.selectedIndex], t = o && o.dataset.en ? o.dataset.en : '';
    let w = s.parentElement && s.parentElement.classList.contains('selw') ? s.parentElement : null;
    if (!w && t && s.parentNode) {
      w = doc.createElement('span'); w.className = 'selw'; w.dataset.bi = '1';
      s.parentNode.insertBefore(w, s); w.appendChild(s);
      if (!s._biL) { s._biL = true; s.addEventListener('change', () => decorateSelect(s, s.ownerDocument)); }
    }
    if (w) {
      let e = w.querySelector(':scope > .en-sel');
      if (!e) { e = doc.createElement('span'); e.className = 'en-sel'; w.appendChild(e); }
      e.textContent = t;
    }
  }
  function decorateTitle(el) {
    for (const a of ['title', 'placeholder']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v || !VI.test(v) || el.dataset['bi' + a]) continue;
      const t = en(v); el.dataset['bi' + a] = '1';
      if (t) { el.dataset['vi' + a] = v; el.dataset['en' + a] = t; el.setAttribute(a, mode === 'en' ? t : mode === 'bi' && a === 'title' ? v + '\n' + t : v); }
    }
  }
  function decorate(root) {
    if (!root || root.nodeType !== 1) return root;
    const doc = root.ownerDocument || document;
    const all = [root, ...root.querySelectorAll('*')];
    for (const el of all) {
      if (el.tagName === 'SELECT') { if (!el.closest('[data-nobi]')) decorateSelect(el, doc); continue; }
      if (el.hasAttribute && (el.hasAttribute('title') || el.hasAttribute('placeholder'))) decorateTitle(el);
      decorateEl(el, doc);
    }
    return root;
  }
  const CSS = '.en{display:block;font-size:.78em;line-height:1.25;opacity:.6;font-weight:400;font-style:normal;margin-top:1px;letter-spacing:0;text-transform:none}' +
    '.en-sel{display:block;font-size:.74em;opacity:.6;margin-top:2px;line-height:1.2}.bi{display:inline-block}.selw{display:inline-block;min-width:0;max-width:100%;vertical-align:middle}.selw>select{max-width:100%}' +
    'th .en,.badge .en,button .en{opacity:.72}' +
    'html.lang-vi .en,html.lang-vi .en-sel{display:none!important}' +
    'html.lang-en .vi{display:none!important}html.lang-en .en-sel{display:none!important}html.lang-en .bi{display:inline}' +
    'html.lang-en .en{display:inline;font-size:inherit;opacity:1;margin:0;line-height:inherit;font-weight:inherit;letter-spacing:inherit}' +
    '.langsw{display:inline-flex;border:1px solid rgba(127,127,127,.45);border-radius:6px;overflow:hidden;font:600 11px system-ui,sans-serif;vertical-align:middle;flex:none}' +
    '.langsw button{border:0;background:transparent;color:inherit;padding:5px 8px;cursor:pointer;font:inherit;line-height:1}.langsw button.on{background:#0891b2;color:#fff}' +
    '.langsw.fixed{position:fixed;right:10px;bottom:10px;z-index:9999;background:#fff;color:#0f172a;box-shadow:0 2px 8px rgba(0,0,0,.18)}' +
    'html.in-suite .langsw.auto,html.in-frame .langsw.auto{display:none}';
  function html(str) {
    if (typeof DOMParser === 'undefined') return str;
    const doc = new DOMParser().parseFromString('<!doctype html><html><body><div id="__r">' + str + '</div></body></html>', 'text/html');
    const r = doc.getElementById('__r');
    decorate(r);
    return r.innerHTML;
  }

  /* ---------- chế độ hiển thị ---------- */
  const subs = [];
  function applyMode() {
    if (typeof document === 'undefined') return;
    const h = document.documentElement;
    h.classList.remove('lang-bi', 'lang-vi', 'lang-en'); h.classList.add('lang-' + mode);
    h.setAttribute('lang', mode === 'en' ? 'en' : 'vi');
    for (const s of document.querySelectorAll('select')) if (!s.closest('[data-nobi]')) decorateSelect(s, document);
    for (const el of document.querySelectorAll('[data-vititle],[data-viplaceholder]')) {
      for (const a of ['title', 'placeholder']) { const v = el.dataset['vi' + a]; if (v === undefined) continue; el.setAttribute(a, mode === 'en' ? el.dataset['en' + a] : mode === 'bi' && a === 'title' ? v + '\n' + el.dataset['en' + a] : v); }
    }
    document.querySelectorAll('.langsw').forEach(sw => sw.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === mode)));
    subs.forEach(f => { try { f(mode); } catch (e) { /* */ } });
  }
  function setMode(m, fromParent) {
    if (!['bi', 'vi', 'en'].includes(m)) return;
    mode = m;
    try { localStorage.setItem(LS, m); } catch (e) { /* */ }
    applyMode();
    // khung bộ phần mềm: truyền xuống các phần mềm con
    if (!fromParent && typeof document !== 'undefined') for (const f of document.querySelectorAll('iframe')) { try { f.contentWindow.postMessage({ xch: 'lang', mode: m }, '*'); } catch (e) { /* */ } }
    if (!fromParent && W.parent && W.parent !== W) { try { W.parent.postMessage({ xch: 'lang', mode: m, up: 1 }, '*'); } catch (e) { /* */ } }
  }
  const LABEL = { bi: 'VI + EN', vi: 'VI', en: 'EN' };
  function mountSwitch(container, opt) {
    if (typeof document === 'undefined') return null;
    const sw = document.createElement('span'); sw.className = 'langsw' + (opt && opt.auto === false ? '' : ' auto') + (container ? '' : ' fixed');
    sw.dataset.nobi = '1'; sw.title = 'Ngôn ngữ hiển thị / Display language';
    for (const m of ['bi', 'vi', 'en']) { const b = document.createElement('button'); b.type = 'button'; b.dataset.m = m; b.textContent = LABEL[m]; b.onclick = () => setMode(m); sw.appendChild(b); }
    (container || document.body).appendChild(sw);
    applyMode();
    return sw;
  }

  /* ---------- tự động gắn cho nội dung mới ---------- */
  let queue = new Set(), sched = false, mo = null;
  function flush() {
    sched = false;
    const q = queue; queue = new Set();
    for (const el of q) if (el.isConnected) decorate(el);
    if (mo) mo.takeRecords();      // bỏ các thay đổi do chính bộ song ngữ tạo ra
  }
  function host(n) {
    // phần tử lá đã gắn song ngữ mà ứng dụng sửa nội dung bên trong → gỡ và gắn lại
    const vi = n.closest && n.closest('.vi');
    if (vi && vi.parentElement && !vi.parentElement.classList.contains('bi')) return vi.parentElement;
    return null;
  }
  function undo(el) {
    const vi = el.querySelector(':scope > .vi');
    if (vi) { while (vi.firstChild) el.insertBefore(vi.firstChild, vi); vi.remove(); }
    el.querySelectorAll(':scope > .en').forEach(e => e.remove());
    delete el.dataset.bi;
  }
  function onMut(ms) {
    for (const m of ms) {
      let t = m.type === 'characterData' ? m.target.parentElement : m.target;
      if (!t || t.nodeType !== 1) continue;
      if (t.closest('.en,.en-sel,svg,[data-nobi]')) continue;
      const h = host(t);
      if (h) { undo(h); queue.add(h); continue; }
      if (m.type === 'childList') {
        let txt = false;
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) { if (!ours(n)) queue.add(n); }
          else if (n.nodeType === 3 && VI.test(n.nodeValue)) txt = true;
        }
        if (txt || (t.dataset.bi && !t.querySelector(':scope > .vi'))) { if (t.dataset.bi && !t.classList.contains('bi')) undo(t); queue.add(t); }
        if (t.tagName === 'SELECT') queue.add(t);
      } else if (m.type === 'characterData' && VI.test(m.target.nodeValue)) { if (t.dataset.bi) undo(t); queue.add(t); }
    }
    if (queue.size && !sched) { sched = true; (W.requestAnimationFrame || setTimeout)(flush); }
  }
  function auto(root) {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const r = root || document.body;
    decorate(r);
    if (!mo) { mo = new MutationObserver(onMut); mo.observe(r, { childList: true, subtree: true, characterData: true }); }
  }
  function boot(opt) {
    if (typeof document === 'undefined') return;
    try { if (W.parent && W.parent !== W) document.documentElement.classList.add('in-frame'); } catch (e) { /* */ }   // trong bộ phần mềm: nút chuyển ở khung ngoài
    if (!document.getElementById('biCss')) { const st = document.createElement('style'); st.id = 'biCss'; st.textContent = CSS; document.head.appendChild(st); }
    applyMode();
    if (opt && opt.auto === false) return;
    auto(document.body);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('message', ev => { const d = ev.data; if (d && d.xch === 'lang' && d.mode && !d.up) setMode(d.mode, true); });
  }
  return {
    en, decorate, html, CSS, missing, boot, auto, setMode, mountSwitch, onMode: f => subs.push(f),
    get mode() { return mode; },
    // tương thích Thiết kế XLNT: on = có hiện tiếng Anh
    set on(v) { setMode(v ? 'bi' : 'vi'); }, get on() { return mode !== 'vi'; }
  };
})();
