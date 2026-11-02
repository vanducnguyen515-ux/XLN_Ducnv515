'use strict';
/* ==========================================================================
   XLNuoc – bộ dựng bảng tính theo quy ước của file mẫu (CLAUDE.md §8):
   cột A TT · B Thông số · C Ký hiệu · D Giá trị · E Đơn vị · F Công thức / Ghi chú; tiêu đề 1F4E79, mục 2E75B6,
   hàng tiêu đề D9E2F3, ô nhập chữ xanh nền vàng, liên kết sheet khác chữ xanh lá, kiểm tra "ĐẠT …"/"XEM LẠI …" ở D gộp D:E.
   Đặc tả sheet:
     {name, title, sub, blocks:[ {sec:'A. …', rows:[row…]} | {grid:{head:[…], unit:[…], widths, rows:[[cell…]]}} | {text:[…]} ]}
     row = {k, l, s, u, f | v | t, n, nf, chk, sel}
       f  – công thức, {khóa} trỏ tới ô D của dòng có khóa đó (cùng sheet → $D$r, sheet khác → 'Sheet'!$D$r)
       v  – số nhập (nền vàng) · t – chữ cố định · chk – dòng kiểm tra · sel – kết quả chọn (nền E2EFDA) · nf – định dạng số
   build(spec) → mô hình {sheets, cells{sheet:{A1:[t,v]}}, inputs[], st{sheet:{A1:styleId}}, merges, widths, heights, keys{k:[sheet,addr]}}
   (cùng dạng với XLN_TPL nên giao diện, bộ tính XLCALC và bộ xuất dùng chung).
   ========================================================================== */
const XLNB = (() => {
  const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  // chỉ số kiểu ô trong styles.xml của file mẫu
  const S = { title: 74, info: 10, sec: 73, hdr: 11, hdrW: 51, tt: 12, lbl: 13, sym: 12, unit: 12, note: 15, chk: 75, sel: 80, plain: 2, bold: 1,
    thHdr: 4, thTxt: 2, thC: 48, thV: 33, thChk: 83, thEnd: 84, txtW: 76, gLbl: 58, gTxt: 53 };
  const NF_IN = { '0': 17, '0.0': 18, '0.00': 16, '0.000': 20, '#,##0': 14, '0.00000': 21, '0.000000': 19, '0.0%': 71 };
  const NF_F = { '0': 26, '0.0': 37, '0.00': 39, '0.000': 24, '#,##0': 23, '0.00000': 45, '0.000E+00': 41, '0.0%': 46, '#,##0.0': 47, '#,##0.00': 64 };
  const NF_X = { '0': 25, '0.0': 44, '0.00': 38, '0.000': 43, '#,##0': 22, '#,##0.00': 72, '0.000E+00': 41, '0.0%': 46, '#,##0.0': 34, '0.00000': 45 };
  const NF_G = { '0': 52, '0.00': 32, '#,##0': 29, '0.0': 68, '#,##0.0': 31, '#,##0.00': 59, '0.000': 66 };
  function nfAuto(v) {
    if (typeof v !== 'number' || !isFinite(v) || v === 0) return '0.00';
    const a = Math.abs(v);
    if (Number.isInteger(v) && a < 1e6) return a >= 1000 ? '#,##0' : '0';
    return a >= 100 ? '#,##0' : a >= 10 ? '0.0' : a >= 1 ? '0.00' : a >= 0.01 ? '0.000' : a >= 1e-4 ? '0.00000' : '0.000E+00';
  }

  function build(spec) {
    const M = { sheets: [], cells: {}, inputs: [], st: {}, merges: {}, widths: {}, heights: {}, freeze: {}, keys: {}, rowsOf: {}, checks: [], meta: spec.meta || {} };
    const pend = [];   // [sheet, addr, rawFormula, nf, kind]
    // lượt 1: xếp hàng, ghi chữ, ghi số nhập, giữ công thức thô
    for (const sh of spec.sheets) {
      const nm = sh.name; M.sheets.push(nm);
      const C = M.cells[nm] = {}, ST = M.st[nm] = {}, MG = M.merges[nm] = [], HT = M.heights[nm] = {};
      const ncol = sh.ncol || 6;
      M.widths[nm] = sh.widths || [5, 52, 12, 14, 14, 62];
      M.freeze[nm] = sh.freeze === undefined ? 3 : sh.freeze;
      let r = 0;
      const put = (a, t, v, s) => { if (v !== undefined && v !== null && v !== '') C[a] = [t, v]; if (s !== undefined) ST[a] = s; };
      const band = (row, txt, s) => { put('A' + row, 's', txt, s); for (let c = 2; c <= ncol; c++) ST[colL(c) + row] = s; MG.push(`A${row}:${colL(ncol)}${row}`); };
      r++; band(r, sh.title, S.title); HT[r] = 21.75;
      if (sh.sub) { r++; put('A' + r, 's', sh.sub, S.info); }
      if (sh.sub2) { r++; put('A' + r, 's', sh.sub2, S.info); }
      while (r < 3) r++;
      for (const b of sh.blocks) {
        if (b.sec !== undefined) {
          r++; if (r > 4) r++;     // một dòng trống giữa các mục
          if (b.sec) { band(r, b.sec, S.sec); r++; }
          const th = sh.kind === 'th';
          const H = b.head || ['TT', 'Thông số', 'Ký hiệu', 'Giá trị', 'Đơn vị', b.noteHead || 'Công thức / Ghi chú'];
          H.forEach((x, i) => put(colL(i + 1) + r, 's', x, th ? S.thHdr : S.hdr));
          let tt = 0;
          for (const row of b.rows) {
            if (!row) continue;
            r++; tt++;
            const R = r;
            put('A' + R, 'n', row.tt !== undefined ? row.tt : tt, th ? S.thTxt : S.tt);
            put('B' + R, 's', row.l, th ? S.thTxt : S.lbl);
            put('C' + R, 's', row.s || '', th ? S.thC : S.sym);
            put('E' + R, 's', row.u || '', th ? S.thTxt : S.unit);
            put('F' + R, 's', row.n || '', th ? S.thC : S.note);
            if (row.k) { if (M.keys[row.k]) throw new Error('trùng khóa ' + row.k); M.keys[row.k] = [nm, 'D' + R]; }
            (M.rowsOf[nm] = M.rowsOf[nm] || []).push(R);
            if (row.chk !== undefined || (row.f !== undefined && row.chk)) {
              pend.push([nm, 'D' + R, row.chk !== true ? row.chk : row.f, null, th ? 'thchk' : 'chk']);
              ST['E' + R] = th ? S.thChk : S.chk;
              if (th) { ST['F' + R] = S.thChk; MG.push(`D${R}:F${R}`); C['F' + R] = undefined; delete C['F' + R]; } else MG.push(`D${R}:E${R}`);
              if (!th) M.checks.push({ sheet: nm, addr: 'D' + R, l: row.l, k: row.k }); else (M.thRows = M.thRows || []).push(R);
              if (!th) delete C['E' + R];
            } else if (row.f !== undefined) {
              pend.push([nm, 'D' + R, row.f, row.nf, row.sel ? 'sel' : th ? 'th' : 'f']);
              if (row.sel && !th) { MG.push(`D${R}:E${R}`); ST['E' + R] = S.sel; delete C['E' + R]; }   // kết quả chọn dạng chữ: gộp D:E như dòng kiểm tra
            }
            else if (row.v !== undefined) {
              const nf = row.nf || nfAuto(row.v);
              put('D' + R, 'n', row.v, NF_IN[nf] || 16);
              M.inputs.push({ s: nm, a: 'D' + R, v: row.v, sec: b.sec, label: row.l, sym: row.s || '', unit: row.u || '', note: row.n || '', k: row.k, tt });
            } else if (row.t !== undefined) put('D' + R, 's', row.t, row.sel ? S.sel : S.plain);
          }
        } else if (b.grid) {
          const G = b.grid; r++; if (r > 4) r++;
          if (G.sec) { band(r, G.sec, S.sec); r++; }
          G.head.forEach((x, i) => put(colL(i + 1) + r, 's', x, S.hdrW));
          if (G.unit) { r++; G.unit.forEach((x, i) => put(colL(i + 1) + r, 's', x, S.hdrW)); }
          for (const cells of G.rows) {
            r++;
            cells.forEach((c, i) => {
              if (c === null || c === undefined) return;
              const a = colL(i + 1) + r;
              if (typeof c === 'number') { put(a, 'n', c, i === 0 ? S.plain : NF_IN[nfAuto(c)] || 16); if (i > 0) M.inputs.push({ s: nm, a, v: c, sec: G.sec || '', label: cells[1], col: G.head[i] }); return; }
              if (typeof c === 'string') { put(a, 's', c, i === 1 ? S.gLbl : S.gTxt); return; }
              if (c.k) M.keys[c.k] = [nm, a];
              if (c.f !== undefined) pend.push([nm, a, c.f, c.nf, 'g']);
              else if (c.v !== undefined) { put(a, 'n', c.v, 55); M.inputs.push({ s: nm, a, v: c.v, sec: G.sec || '', label: cells[1], col: G.head[i], k: c.k }); }
            });
          }
        } else if (b.text) {
          r++;
          for (const tx of b.text) { r++; put('B' + r, 's', tx, S.txtW); MG.push(`B${r}:F${r}`); for (let c = 3; c <= 6; c++) ST[colL(c) + r] = S.txtW; }
        } else if (b.end) {   // kết luận sheet tổng hợp
          r += 2; put('B' + r, 's', b.end.l, S.bold); pend.push([nm, 'D' + r, b.end.f, null, 'end']); ST['E' + r] = S.thEnd; ST['F' + r] = S.thEnd; MG.push(`D${r}:F${r}`);
          if (b.end.k) M.keys[b.end.k] = [nm, 'D' + r];
        }
      }
      M.maxRow = M.maxRow || {}; M.maxRow[nm] = r;
    }
    // lượt 2: dịch {khóa} → địa chỉ ô
    const ref = (from, k) => {
      const t = M.keys[k]; if (!t) throw new Error(`công thức ở ${from} dùng khóa chưa có: {${k}}`);
      const a = t[1].replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
      return t[0] === from ? a : `'${t[0]}'!${a}`;
    };
    for (const [nm, a, raw, nf, kind] of pend) {
      const f = String(raw).replace(/^=/, '').replace(/\{([\w.]+)\}/g, (m, k) => ref(nm, k));
      M.cells[nm][a] = ['f', f];
      M._fmt = M._fmt || []; M._fmt.push([nm, a, nf, kind, /^'[^']+'!\$[A-Z]+\$\d+$/.test(f)]);
    }
    return M;
  }

  // gán kiểu ô cho công thức theo giá trị đã tính (định dạng tự động theo độ lớn)
  function styleFormulas(M, vals) {
    for (const [nm, a, nf, kind, cross] of M._fmt || []) {
      const v = vals[nm] && vals[nm][a];
      if (kind === 'chk') {
        M.st[nm][a] = S.chk;
        // ô gộp D:E không tự giãn chiều cao trong Excel → đặt chiều cao dòng theo độ dài chữ
        const n = typeof v === 'string' ? Math.ceil(v.length / 27) : 1, r = +a.slice(1);
        if (n > 1) M.heights[nm][r] = Math.max(M.heights[nm][r] || 0, 14.5 * n);
        continue;
      }
      if (kind === 'thchk') { M.st[nm][a] = S.thChk; continue; }
      if (kind === 'end') { M.st[nm][a] = S.thEnd; continue; }
      const f = nf || nfAuto(typeof v === 'number' ? v : 0);
      if (kind === 'sel') { M.st[nm][a] = S.sel; continue; }
      if (typeof v === 'string') { M.st[nm][a] = kind === 'g' ? S.gLbl : S.chk; continue; }
      if (kind === 'g') { M.st[nm][a] = NF_G[f] || 32; continue; }
      if (kind === 'th') { M.st[nm][a] = S.thV; continue; }
      M.st[nm][a] = (cross ? NF_X[f] : NF_F[f]) || (cross ? 38 : 39);
    }
  }

  /* ---------- XML sheet ---------- */
  const X = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = v => { if (!isFinite(v)) return '0'; const s = String(v); return s; };
  function sheetXml(M, nm, vals) {
    const C = M.cells[nm], ST = M.st[nm], HT = M.heights[nm] || {};
    const rows = {};
    const all = new Set([...Object.keys(C), ...Object.keys(ST)]);
    for (const a of all) { const m = a.match(/^([A-Z]+)(\d+)$/); if (!m) continue; (rows[+m[2]] = rows[+m[2]] || []).push(a); }
    const cn = a => { let n = 0; for (const ch of a.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
    let o = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    const fz = M.freeze[nm];
    o += `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView zoomScaleNormal="100" workbookViewId="0"${nm === M.sheets[0] ? ' tabSelected="1"' : ''}>${fz ? `<pane ySplit="${fz}" topLeftCell="A${fz + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="14.5"/>`;
    o += '<cols>' + M.widths[nm].map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols><sheetData>';
    for (const r of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
      o += `<row r="${r}"${HT[r] ? ` ht="${HT[r]}" customHeight="1"` : ''}>`;
      for (const a of rows[r].sort((x, y) => cn(x) - cn(y))) {
        const c = C[a], s = ST[a] !== undefined ? ` s="${ST[a]}"` : '';
        if (!c) { o += `<c r="${a}"${s}/>`; continue; }
        if (c[0] === 'f') {
          const v = vals && vals[nm] ? vals[nm][a] : undefined;
          const F = `<f>${X(c[1])}</f>`;
          if (typeof v === 'number' && isFinite(v)) o += `<c r="${a}"${s}>${F}<v>${num(v)}</v></c>`;
          else if (typeof v === 'boolean') o += `<c r="${a}"${s} t="b">${F}<v>${v ? 1 : 0}</v></c>`;
          else if (v && typeof v === 'object' && v.err) o += `<c r="${a}"${s} t="e">${F}<v>${X(String(v.err).split(' ')[0])}</v></c>`;
          else o += `<c r="${a}"${s} t="str">${F}<v>${X(v == null ? '' : v)}</v></c>`;
        } else if (c[0] === 'n') o += `<c r="${a}"${s}><v>${num(c[1])}</v></c>`;
        else if (c[0] === 'b') o += `<c r="${a}"${s} t="b"><v>${c[1] ? 1 : 0}</v></c>`;
        else o += `<c r="${a}"${s} t="inlineStr"><is><t xml:space="preserve">${X(c[1])}</t></is></c>`;
      }
      o += '</row>';
    }
    o += '</sheetData>';
    const mg = M.merges[nm] || [];
    if (mg.length) o += `<mergeCells count="${mg.length}">${mg.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
    o += '<pageMargins left="0.6" right="0.5" top="0.7" bottom="0.7" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>';
    o += `<headerFooter><oddFooter>&amp;L&amp;8 ${X(nm)}&amp;R&amp;8 Trang &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
    return o;
  }

  /* ---------- gói .xlsx: dùng lại styles + theme của file mẫu ---------- */
  async function tplPart(name) {
    if (!XLNB._z) XLNB._z = await XLSX_READ.unzip(XLCALC_b64(XLN_TPL.xlsx));
    return XLNB._z.get(name);
  }
  async function xlsx(M, vals, meta) {
    const styles = await tplPart('xl/styles.xml'), theme = await tplPart('xl/theme/theme1.xml');
    const n = M.sheets.length, d = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${M.sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(meta && meta.title)}</dc:title><dc:creator>XLNuoc – XLN_Ducnv515</dc:creator><dc:description>${X(meta && meta.desc)}</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${d}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${d}</dcterms:modified></cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000"/></bookViews><sheets>${M.sheets.map((s, i) => `<sheet name="${X(s)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${M.sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/theme/theme1.xml', data: theme },
      { name: 'xl/styles.xml', data: styles },
      ...M.sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(M, s, vals) }))
    ];
    return OOXML.zip(files);
  }
  return { build, styleFormulas, sheetXml, xlsx, tplPart, nfAuto, S, colL };
})();
// base64 → ArrayBuffer (dùng chung)
function XLCALC_b64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
if (typeof module !== 'undefined') module.exports = XLNB;
