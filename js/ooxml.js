'use strict';
/* ==========================================================================
   OOXML dùng chung cho Bộ phần mềm XLN_Ducnv515: ghi .xlsx (công thức sống, tên vùng, giá trị lưu sẵn) và .docx (tiêu đề có cấp
   cho mục lục, công thức OMML, bảng, đầu/chân trang có số trang) – không cần thư viện ngoài. ZIP kiểu STORE (không nén).
   ========================================================================== */
const OOXML = (() => {
  /* ---------- ZIP ---------- */
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const utf8 = s => new TextEncoder().encode(s);
  function zip() { throw new Error('removed'); }
  function save() { throw new Error('removed'); }
  const X = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  /* ---------- XLSX ---------- */
  // kiểu ô: tên → chỉ số cellXfs; ô số có 5 dạng hiển thị theo độ lớn (n0 #,##0 · n1 #,##0.0 · n2 0.00 · n3 0.000 · ne 0.00E+00)
  const NF = ['n0', 'n1', 'n2', 'n3', 'ne'];
  const XS = { def: 0, title: 1, sub: 2, hdr: 3, sec: 4, txt: 5, lbl: 6, note: 7, sym: 8, warn: 9, ok: 10, eq: 11 };
  NF.forEach((k, i) => { XS['in_' + k] = 12 + i; XS['res_' + k] = 17 + i; XS['val_' + k] = 22 + i; XS['key_' + k] = 27 + i; });
  const nfOf = v => { const a = Math.abs(v); return !isFinite(v) || v === 0 ? 'n2' : a >= 1000 ? 'n0' : a >= 100 ? 'n1' : a >= 1 ? 'n2' : a >= 0.001 ? 'n3' : 'ne'; };
  function stylesXlsx() { throw new Error('removed'); }
  // c: {v, f, s} – f công thức (không có '='), v giá trị lưu sẵn (số/chuỗi), s tên kiểu
  function cellXml(ref, c) {
    if (c == null || c === '') return '';
    if (typeof c !== 'object') c = { v: c };
    const s = c.s != null ? ` s="${typeof c.s === 'number' ? c.s : XS[c.s] || 0}"` : '';
    if (c.f != null) {
      const v = typeof c.v === 'number' && isFinite(c.v) ? `<v>${c.v}</v>` : '';
      return typeof c.v === 'string' ? `<c r="${ref}"${s} t="str"><f>${X(c.f)}</f><v>${X(c.v)}</v></c>` : `<c r="${ref}"${s}><f>${X(c.f)}</f>${v}</c>`;
    }
    if (typeof c.v === 'number' && isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
    if (c.v == null || c.v === '') return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${X(c.v)}</t></is></c>`;
  }
  class Sheet {
    constructor(name, widths) { this.name = name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31); this.rows = []; this.widths = widths || []; this.merges = []; this.freeze = 0; }
    add(cells, ht) { this.rows.push({ cells: cells || [], ht }); return this.rows.length; }   // số hàng 1-based
    merge(r, c0, c1) { this.merges.push(`${col(c0)}${r}:${col(c1)}${r}`); }
    xml() {
      let o = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`;
      o += `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">${this.freeze ? `<pane ySplit="${this.freeze}" topLeftCell="A${this.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews>`;
      if (this.widths.length) o += '<cols>' + this.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
      o += '<sheetData>' + this.rows.map((r, i) => `<row r="${i + 1}"${r.ht ? ` ht="${r.ht}" customHeight="1"` : ''}>` + r.cells.map((c, j) => cellXml(col(j) + (i + 1), c)).join('') + '</row>').join('') + '</sheetData>';
      if (this.merges.length) o += `<mergeCells count="${this.merges.length}">${this.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
      return o + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
        `<headerFooter><oddFooter>&amp;L&amp;8 ${X(this.name)}&amp;R&amp;8 Trang &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
    }
  }
  function xlsx() { throw new Error('removed'); }
  function core() { throw new Error('removed'); }

  /* ---------- DOCX ----------
     khối: {t:'title'|'subtitle'|'h1'|'h2'|'p'|'note'|'eq'|'table'|'bullets'|'toc'|'pb', ...}
     eq: {m: chuỗi công thức (OMML tuyến tính), u: đơn vị, n: số hiệu "(3.2)"}
     table: {head:[...], rows:[[...]], w:[tỉ lệ cột], num:[chỉ số cột canh phải]}  · p: {r:[[text, {b,i,sup,sub,col}]...]} hoặc {x: text} */
  const run = (t, o) => {
    o = o || {};
    const rp = (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + (o.col ? `<w:color w:val="${o.col}"/>` : '') + (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '') + (o.sup ? '<w:vertAlign w:val="superscript"/>' : o.sub ? '<w:vertAlign w:val="subscript"/>' : '');
    return String(t).split('\n').map((s, i) => `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ''}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${X(s)}</w:t></w:r>`).join('');
  };
  const para = (style, inner, ppr) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${ppr || ''}</w:pPr>${inner}</w:p>`;
  const runs = b => b.r ? b.r.map(x => run(x[0], x[1])).join('') : run(b.x || '', b.o);
  /* công thức tuyến tính → cây: X_y chỉ số dưới, X^y chỉ số trên; X_{nhiều chữ}, X^(nhóm) – ngoặc của nhóm làm chỉ số được bỏ.
     Biến một chữ cái in nghiêng, tên nhiều chữ (exp, min, max, ACH…) và số in đứng (quy ước ISO 80000-2). */
  function eqParse(s) {
    const T = String(s).match(/\{|\}|\(|\)|_|\^|\s+|[\p{L}\p{M}₀-₉ᵢₘₑₙ'%°]+|\d+(?:[.,]\d+)*|./gu) || [];
    let i = 0;
    const seq = stop => { const out = []; while (i < T.length && T[i] !== stop) out.push(item()); if (i < T.length) i++; return out; };
    function atom() {
      const t = T[i++];
      if (t === '(') return { g: seq(')'), p: 1 };
      if (t === '{') return { g: seq('}'), p: 0 };
      return { t };
    }
    function item() {
      const b = atom();
      if (b.t && /^\s+$/.test(b.t)) return b;
      while (i < T.length && (T[i] === '_' || T[i] === '^')) { const k = T[i++] === '_' ? 'sub' : 'sup'; if (i >= T.length) break; const x = item(); if (x.g) x.p = 0; b[k] = x; }
      return b;
    }
    const out = []; while (i < T.length) out.push(item()); return out;
  }
  const isVar = t => /^[\p{L}][₀-₉ᵢₘₑₙ']*$/u.test(t) && !/^[·×−+=∑Σ√π]$/.test(t);   // π là hằng số – in đứng
  function ommlOf(n) {
    if (Array.isArray(n)) return n.map(ommlOf).join('');
    let base;
    if (n.g) base = (n.p ? mr('(', 1) : '') + ommlOf(n.g) + (n.p ? mr(')', 1) : '');
    else base = mr(n.t, !isVar(n.t));
    if (n.sub && n.sup) return `<m:sSubSup><m:e>${base}</m:e><m:sub>${ommlOf(n.sub)}</m:sub><m:sup>${ommlOf(n.sup)}</m:sup></m:sSubSup>`;
    if (n.sub) return `<m:sSub><m:e>${base}</m:e><m:sub>${ommlOf(n.sub)}</m:sub></m:sSub>`;
    if (n.sup) return `<m:sSup><m:e>${base}</m:e><m:sup>${ommlOf(n.sup)}</m:sup></m:sSup>`;
    return base;
  }
  const mr = (t, plain) => `<m:r>${plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : ''}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">${X(t)}</m:t></m:r>`;
  function htmlOf(n) {
    if (Array.isArray(n)) return n.map(htmlOf).join('');
    let b = n.g ? (n.p ? '(' : '') + htmlOf(n.g) + (n.p ? ')' : '') : isVar(n.t) ? `<i>${X(n.t)}</i>` : X(n.t);
    if (n.sub) b += `<sub>${htmlOf(n.sub)}</sub>`;
    if (n.sup) b += `<sup>${htmlOf(n.sup)}</sup>`;
    return b;
  }
  const eqHtml = s => htmlOf(eqParse(s));
  const eqPlain = s => String(s).replace(/_\{([^}]*)\}/g, '_$1').replace(/\^\{([^}]*)\}/g, '^$1');
  // ký hiệu trong bảng: X_abc → [[X, nghiêng], [abc, chỉ số dưới]]
  const symRuns = s => { s = eqPlain(s); const k = s.indexOf('_'); return k < 0 ? [[s, { i: isVar(s) ? 1 : 0 }]] : [[s.slice(0, k), { i: isVar(s.slice(0, k)) ? 1 : 0 }], [s.slice(k + 1), { sub: 1 }]]; };
  const omath = s => `<m:oMath>${ommlOf(eqParse(s))}</m:oMath>`;
  function tableXml(b) {
    const W = 9638, w = b.w || b.head.map(() => 1), tw = w.reduce((a, x) => a + x, 0), cw = w.map(x => Math.round(W * x / tw));
    const cell = (t, i, hdr) => `<w:tc><w:tcPr><w:tcW w:w="${cw[i]}" w:type="dxa"/>${hdr ? '<w:shd w:val="clear" w:color="auto" w:fill="14325C"/>' : ''}</w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/>${!hdr && (b.num || []).includes(i) ? '<w:jc w:val="right"/>' : ''}</w:pPr>${hdr ? run(t, { b: 1, col: 'FFFFFF' }) : Array.isArray(t) ? t.map(x => run(x[0], x[1])).join('') : run(t)}</w:p></w:tc>`;
    return `<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblW w:w="${W}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cw.map(x => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.head.map((h, i) => cell(h, i, 1)).join('')}</w:tr>` + b.rows.map((r, k) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, i, 0)).join('')}</w:tr>`).join('') + `</w:tbl>` + para('Spacer', '');
  }
  function blockXml(b) {
    switch (b.t) {
      case 'title': return para('Title', runs(b));
      case 'subtitle': return para('Subtitle', runs(b));
      case 'h1': return para('Heading1', runs(b), b.pb ? '<w:pageBreakBefore/>' : '');
      case 'h2': return para('Heading2', runs(b));
      case 'h3': return para('Heading3', runs(b));
      case 'note': return para('Note', runs(b));
      case 'pb': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      case 'eq': return para('Equation', omath(b.m) + (b.u ? run('  ' + b.u) : '') + (b.n ? `<w:r><w:tab/></w:r>${run(b.n)}` : ''));
      case 'bullets': return b.items.map(it => para('Bullet', Array.isArray(it) ? it.map(x => run(x[0], x[1])).join('') : run(it))).join('');
      case 'table': return tableXml(b);
      case 'toc': return `<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr>${run(b.x || 'Mục lục')}</w:p><w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('(Mục lục được cập nhật khi mở tệp – nếu chưa hiện, bấm chuột phải → Update Field)', { i: 1, col: '5F6B7A' })}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
      default: return para(null, runs(b));
    }
  }
  function stylesDocx() { throw new Error('removed'); }
  function docx() { throw new Error('removed'); }
  const __x = function(){ if (window.__PUB) window.__PUB.toast('Bản phát hành v11.00: chức năng xuất tệp này đã được loại bỏ – chỉ xuất PDF có watermark.'); throw new Error('Bản phát hành: chức năng đã loại bỏ'); };
  return { zip: __x, save: __x, xlsx: __x, docx: __x, Sheet, XS, nfOf, col, esc: X, eqParse, eqHtml, eqPlain, symRuns };
})();
