/* =====================================================================
   SONG NGỮ VIỆT – ANH: tiếng Việt giữ nguyên, tiếng Anh hiện bên dưới (chữ nhỏ, mờ)
   BI.en(text)      → bản tiếng Anh ('' nếu không cần / không dịch được)
   BI.decorate(el)  → gắn dòng tiếng Anh vào giao diện HTML
   BI.html(str)     → trả chuỗi HTML đã gắn song ngữ (bản tính xuất file)
   Bản dịch theo từ điển I18N_DICT (khớp nguyên chuỗi, sau đó ghép theo cụm dài nhất)
   ===================================================================== */
'use strict';

const BI = (() => {
  const D = typeof I18N_DICT !== 'undefined' ? I18N_DICT : {};
  const VI = /[À-ÃÈ-ÊÌÍÒ-ÕÙÚÝà-ãè-êìíò-õùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;   // chữ cái tiếng Việt (không gồm ×, chữ Hy Lạp)
  const LET = /[\p{L}]/u;
  const keys = Object.keys(D).map(k => k.trim()).filter(k => k && VI.test(k)).sort((a, b) => b.length - a.length);
  const DT = {}; for (const k of Object.keys(D)) DT[k.trim()] = D[k];
  // bản chữ HOA (tiêu đề bản vẽ, tên công trình viết hoa)
  const DTU = {}; for (const k of keys) { const u = k.toUpperCase(); if (DTU[u] === undefined) DTU[u] = (DT[k] || '').toUpperCase(); }
  const keysU = Object.keys(DTU).sort((a, b) => b.length - a.length);
  const cache = new Map();
  const missing = new Map();
  let enabled = true;

  function segReplace(s, upper) {
    let out = s;
    const K = upper ? keysU : keys, M = upper ? DTU : DT;
    for (const k of K) {
      if (!VI.test(out)) break;
      let from = 0, i;
      while ((i = out.indexOf(k, from)) >= 0) {
        const b = out[i - 1], a = out[i + k.length];
        const okB = !LET.test(k[0]) || !b || !LET.test(b);
        const okA = !LET.test(k[k.length - 1]) || !a || !LET.test(a);
        if (okB && okA) { const rep = M[k] || ''; out = out.slice(0, i) + rep + out.slice(i + k.length); from = i + rep.length; }
        else from = i + k.length;
      }
    }
    return out;
  }

  function en(text) {
    if (!enabled || text === undefined || text === null) return '';
    const s = String(text);
    if (!VI.test(s)) return '';
    if (cache.has(s)) return cache.get(s);
    const t = s.replace(/\s+/g, ' ').trim();
    let r;
    const isUp = t === t.toUpperCase() && /[A-ZÀ-Ỹ]/.test(t);
    if (DT[t] !== undefined) r = DT[t];
    else if (isUp && DTU[t] !== undefined) r = DTU[t];
    else {
      r = isUp ? segReplace(t, true) : segReplace(t, false);
      if (VI.test(r)) r = isUp ? segReplace(r, false) : r;
      if (VI.test(r)) {
        const left = (r.match(/[\p{L}]+/gu) || []).filter(w => VI.test(w));
        missing.set(t, left.join(' '));
        // còn sót nhiều chữ tiếng Việt → không hiện dòng tiếng Anh
        const nw = (r.match(/[\p{L}]+/gu) || []).length;
        if (left.length > Math.max(1, 0.15 * nw)) r = '';
      }
    }
    r = (r || '').replace(/\s+([,.;:)])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    cache.set(s, r);
    return r;
  }

  /* ---------- HTML ---------- */
  const INLINE = new Set(['B', 'I', 'EM', 'STRONG', 'SUB', 'SUP', 'SMALL', 'U', 'CODE', 'SPAN', 'A', 'BR', 'ABBR']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'svg', 'TEXTAREA', 'OPTION', 'OPTGROUP', 'SELECT', 'INPUT', 'CANVAS', 'IFRAME']);
  const FORM = 'input,select,textarea,button,svg,table,ul,ol,li,div,p,h1,h2,h3,h4,details,summary,section,tr,td,th,label,a[data-tab]';
  function textOf(el) {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1) {
        if (n.classList && (n.classList.contains('en') || n.classList.contains('n'))) continue;
        if (n.tagName === 'BR') { s += ' '; continue; }
        s += (/^(SMALL|DIV|P|SPAN)$/.test(n.tagName) && s && !/\s$/.test(s) ? ' ' : '') + textOf(n);
      }
    }
    return s;
  }
  function mk(doc, t, tag) { const e = doc.createElement(tag || 'span'); e.className = 'en'; e.textContent = t; return e; }
  function decorate(root) {
    if (!enabled || !root) return root;
    const doc = root.ownerDocument || document;
    const all = root.querySelectorAll('*');
    for (const el of all) {
      if (SKIP.has(el.tagName) || el.dataset.bi || el.classList.contains('en') || el.closest('.en,svg,[data-nobi]')) continue;
      const leaf = !el.querySelector(FORM);
      if (leaf) {
        // phần tử lá (chỉ chứa chữ và thẻ định dạng): gắn một dòng tiếng Anh cho cả khối
        el.dataset.bi = '1'; el.querySelectorAll('*').forEach(x => { x.dataset.bi = '1'; });
        const t = en(textOf(el));
        if (t) el.appendChild(mk(doc, t));
        continue;
      }
      // phần tử có ô nhập/khối con: gắn tiếng Anh cho từng đoạn chữ trực tiếp
      for (const n of [...el.childNodes]) {
        if (n.nodeType !== 3 || !VI.test(n.nodeValue)) continue;
        const t = en(n.nodeValue);
        if (!t) continue;
        const w = doc.createElement('span'); w.className = 'bi'; w.dataset.bi = '1'; w.textContent = n.nodeValue; w.appendChild(mk(doc, t));
        el.replaceChild(w, n);
      }
    }
    // select: tiếng Anh của lựa chọn đang chọn ngay dưới ô chọn
    for (const s of root.querySelectorAll('select')) {
      if (s.parentElement && s.parentElement.classList.contains('selw')) continue;
      const o = s.options[s.selectedIndex]; const t = o ? en(o.textContent) : '';
      if (t) {
        // bọc ô chọn + dòng tiếng Anh thành một khối để không làm lệch lưới nhãn/ô nhập
        const w = doc.createElement('span'); w.className = 'selw'; w.dataset.bi = '1';
        s.parentNode.insertBefore(w, s); w.appendChild(s);
        const e = mk(doc, t, 'span'); e.classList.add('en-sel'); w.appendChild(e);
      }
      for (const op of s.options) { const te = en(op.textContent); if (te && !op.title) op.title = te; }
    }
    return root;
  }
  const CSS = '.en{display:block;font-size:.78em;line-height:1.25;opacity:.6;font-weight:400;font-style:normal;margin-top:1px;letter-spacing:0}' +
    '.en-sel{display:block;font-size:.74em;opacity:.6;margin-top:2px}.bi{display:inline-block}.selw{display:inline-block;min-width:0;max-width:100%}.selw>select{max-width:100%}' +
    'th .en,.badge .en,button .en{opacity:.72}';
  function html(str) {
    if (!enabled || typeof DOMParser === 'undefined') return str;
    const doc = new DOMParser().parseFromString('<!doctype html><html><body><div id="__r">' + str + '</div></body></html>', 'text/html');
    const r = doc.getElementById('__r');
    decorate(r);
    return r.innerHTML;
  }
  return { en, decorate, html, CSS, missing, set on(v) { enabled = !!v; cache.clear(); }, get on() { return enabled; } };
})();
