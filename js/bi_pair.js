/* =====================================================================
   SONG NGỮ CHO PHẦN MỀM CÓ SẴN CẶP "Việt + <… class="en">English</…>"
   (AerationDesign, ICEAS Design Studio, KhíSạch Studio) – nối vào hệ song ngữ chung (js/i18n_core.js):
   - bọc phần chữ Việt đứng trước mỗi phần tử tiếng Anh vào <span class="vi"> (hoặc gắn lớp .vi cho khối đứng trước)
     → ba chế độ VI + EN · VI · EN của bộ phần mềm hoạt động như ở các phần mềm khác;
   - thay bản tiếng Anh bằng THUẬT NGỮ CHUẨN của bộ phần mềm (I18N_TERMS, sinh từ i18n/thuat_ngu_chuan.json)
     khi phần chữ Việt trùng nguyên văn một thuật ngữ chuẩn → cùng một khái niệm dịch giống nhau ở mọi phần mềm;
   - hộp thoại/menu ⇄ Trao đổi (tiếng Việt) được gắn bản tiếng Anh theo từ điển chung;
   - nội dung vẽ lại được xử lý tự động (MutationObserver).
   BIP.boot({ en: '.en,.h2en', switchIn: element })
   ===================================================================== */
'use strict';
const BIP = (() => {
  const W = window;
  let T = typeof I18N_TERMS !== 'undefined' ? I18N_TERMS : null;
  try { if (!T && W.parent && W.parent !== W && W.parent.I18N_TERMS) T = W.parent.I18N_TERMS; } catch (e) { /* khác nguồn gốc */ }
  T = T || {};
  let SEL = '.en', mo = null, sched = false, queue = new Set();
  const INLINE = /^(SPAN|B|I|EM|STRONG|SMALL|SUB|SUP|A|CODE|U|ABBR|BR|MARK|Q|TIME|WBR)$/;
  const BLOCK = /^(P|DIV|H[1-6]|LI|TD|TH|DT|DD|LABEL|SECTION|ARTICLE)$/;
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const isEn = n => n.nodeType === 1 && n.matches(SEL);
  const isVi = n => n.nodeType === 1 && n.classList.contains('vi');

  function pairOne(e) {
    if (e.dataset.bip || e.closest('svg,[data-nobi],textarea,option,select')) return;
    e.dataset.bip = '1';
    // phần Việt: các nút đứng ngay trước (chữ + phần tử nội dòng), dừng ở phần tử tiếng Anh/Việt khác hoặc ô nhập
    const run = []; let n = e.previousSibling;
    while (n && !isEn(n) && !isVi(n)) {
      if (n.nodeType === 1 && (!INLINE.test(n.tagName) || (!norm(n.textContent) && n.tagName !== 'BR'))) break;   // phần tử trang trí không chữ (núm gạt, biểu tượng) không thuộc phần Việt
      if (n.nodeType !== 1 && n.nodeType !== 3) { n = n.previousSibling; continue; }
      run.unshift(n); n = n.previousSibling;
    }
    let viText = '';
    if (run.some(x => norm(x.textContent))) {
      const s = e.ownerDocument.createElement('span'); s.className = 'vi';
      e.parentNode.insertBefore(s, run[0]); run.forEach(x => s.appendChild(x));
      viText = s.textContent;
    } else if (n && n.nodeType === 1 && BLOCK.test(n.tagName) && !isEn(n) && !n.querySelector('input,select,textarea,table') && norm(n.textContent)) {
      // khối tiếng Việt đứng trước khối tiếng Anh (đoạn giới thiệu, tiêu đề + dòng tiếng Anh)
      n.classList.add('vi'); viText = n.textContent;
    }
    // thuật ngữ chuẩn
    const k = norm(viText);
    if (k && T[k] && norm(e.textContent) !== T[k] && !e.querySelector('*')) e.textContent = T[k];
  }
  function pair(root) {
    if (!root || root.nodeType !== 1) return;
    if (W.__bipNoSel) { if (root.tagName === 'SELECT') root.setAttribute('data-nobi', ''); W.__bipNoSel(root); }
    if (root.matches && root.matches(SEL)) pairOne(root);
    root.querySelectorAll(SEL).forEach(pairOne);
    // menu, hộp thoại ⇄ Trao đổi và thông báo dùng chung: gắn tiếng Anh theo từ điển chung
    if (typeof BI !== 'undefined') {
      const X = '.xch-menu,.xch-ov,.xch-toast';
      [root, ...root.querySelectorAll(X)].forEach(x => { if (x.matches && x.matches(X)) BI.decorate(x); });
    }
  }
  function flush() { sched = false; const q = queue; queue = new Set(); q.forEach(el => { if (el.isConnected) pair(el); }); if (mo) mo.takeRecords(); }
  function onMut(ms) {
    for (const m of ms) for (const a of m.addedNodes) {
      if (a.nodeType === 1) queue.add(a.closest && a.closest('.xch-menu,.xch-ov') || a);
      else if (a.nodeType === 3 && a.parentElement) queue.add(a.parentElement);
    }
    if (queue.size && !sched) { sched = true; setTimeout(flush, 0); }   // setTimeout: requestAnimationFrame dừng khi khung ẩn (tab khác của bộ phần mềm)
  }
  // chế độ EN: phần tử tiếng Anh hiển thị như chữ chính (bỏ cỡ nhỏ, mờ, dấu "· " đứng trước)
  const CSS = 'html.lang-en .en:not(p):not(div):not(li){display:inline!important}' +
    'html.lang-en .en,html.lang-en .h2en{font-size:inherit!important;opacity:1!important;margin:0!important;color:inherit!important;font-weight:inherit!important;letter-spacing:inherit!important}' +
    'html.lang-en .en::before,html.lang-vi .en::before{content:none!important}html.lang-vi .h2en{display:none!important}' +
    'html.in-frame .bip-sw{display:none}' +
    // chữ song ngữ trong nút/thẻ bấm không nhận chuột: lần bấm luôn rơi vào chính nút (phần mềm kiểm tra ev.target.id / dataset)
    'button .vi,button .en,button .h2en,a .vi,a .en,[role=tab] .vi,[role=tab] .en,summary .vi,summary .en{pointer-events:none}';
  function boot(o) {
    o = o || {};
    if (o.en) SEL = o.en;
    // ô chọn: các phần mềm này tự song ngữ phần lựa chọn → không để bộ song ngữ chung bọc thêm khung + dòng tiếng Anh
    const noSel = r => r.querySelectorAll && r.querySelectorAll('select:not([data-nobi])').forEach(x => x.setAttribute('data-nobi', ''));
    noSel(document);
    W.__bipNoSel = noSel;
    if (typeof BI !== 'undefined') {
      BI.boot({ auto: false });
      if (o.switchIn) { const sw = BI.mountSwitch(o.switchIn, { auto: false }); if (sw) sw.classList.add('bip-sw'); }
    }
    if (!document.getElementById('bipCss')) { const s = document.createElement('style'); s.id = 'bipCss'; s.textContent = CSS; document.head.appendChild(s); }
    pair(document.body);
    if (!mo && typeof MutationObserver !== 'undefined') { mo = new MutationObserver(onMut); mo.observe(document.body, { childList: true, subtree: true }); }
  }
  return { boot, pair, get terms() { return T; } };
})();
