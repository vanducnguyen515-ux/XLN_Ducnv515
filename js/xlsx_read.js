'use strict';
/* ==========================================================================
   Bộ đọc tệp .xlsx tối giản (không thư viện ngoài): giải nén ZIP bằng
   DecompressionStream('deflate-raw'), đọc sharedStrings + các sheet,
   lấy GIÁ TRỊ ĐÃ TÍNH (cached value) của ô.  Trả về:
   { order: [tên sheet], sheets: { tên: { cells: { 'A1': giá trị }, maxRow } } }
   ========================================================================== */
const XLSX_READ = {};

XLSX_READ.unzip = async function (buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Không phải tệp ZIP/XLSX hợp lệ');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {}, dec = new TextDecoder('utf-8');
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Thư mục ZIP hỏng');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    files[name] = { method, csize, off };
    p += 46 + nl + xl + cl;
  }
  const get = async name => {
    const f = files[name]; if (!f) return null;
    const ln = dv.getUint16(f.off + 26, true), le = dv.getUint16(f.off + 28, true);
    const data = u8.subarray(f.off + 30 + ln + le, f.off + 30 + ln + le + f.csize);
    if (f.method === 0) return dec.decode(data);
    if (f.method !== 8) throw new Error('Kiểu nén ZIP không hỗ trợ: ' + f.method);
    if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt không hỗ trợ giải nén (cần Chrome/Edge/Firefox mới)');
    const ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(ds).text();
  };
  return { names: Object.keys(files), get };
};

XLSX_READ.read = async function (buf) {
  const z = await XLSX_READ.unzip(buf);
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (el, tag) => Array.from(el.getElementsByTagNameNS('*', tag));
  // chuỗi dùng chung
  const ss = [];
  const sst = await z.get('xl/sharedStrings.xml');
  if (sst) for (const si of kids(xml(sst).documentElement, 'si')) ss.push(kids(si, 't').map(t => t.textContent).join(''));
  // danh sách sheet & đường dẫn
  const wb = xml(await z.get('xl/workbook.xml'));
  const relsTxt = await z.get('xl/_rels/workbook.xml.rels');
  const rels = {};
  if (relsTxt) for (const r of kids(xml(relsTxt).documentElement, 'Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  const out = { order: [], sheets: {} };
  for (const s of kids(wb.documentElement, 'sheet')) {
    const name = s.getAttribute('name');
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
    let target = rels[rid] || '';
    target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    const txt = await z.get('xl/' + target);
    if (!txt) continue;
    const cells = {}; let maxRow = 0;
    for (const c of kids(xml(txt).documentElement, 'c')) {
      const ref = c.getAttribute('r'), t = c.getAttribute('t');
      const vEl = kids(c, 'v')[0];
      let v = null;
      if (t === 's') v = vEl ? ss[+vEl.textContent] : null;
      else if (t === 'inlineStr') v = kids(c, 't').map(x => x.textContent).join('');
      else if (t === 'str' || t === 'e') v = vEl ? vEl.textContent : null;
      else if (t === 'b') v = vEl ? vEl.textContent === '1' : null;
      else if (vEl) { const x = +vEl.textContent; v = isFinite(x) ? x : vEl.textContent; }
      if (v === null || v === '') continue;
      cells[ref] = v;
      const rn = +ref.replace(/^[A-Z]+/, ''); if (rn > maxRow) maxRow = rn;
    }
    out.order.push(name);
    out.sheets[name] = { name, cells, maxRow };
  }
  return out;
};
