/* =====================================================================
   BẢN TÍNH CHI TIẾT (HTML → in PDF) và XUẤT EXCEL (.xlsx CÓ CÔNG THỨC SỐNG, không cần thư viện)
   ===================================================================== */
'use strict';

const REP = (() => {
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fv = v => typeof v === 'number' ? (Math.abs(v) >= 1e5 && v % 1 !== 0 ? v.toExponential(2).replace('.', ',') : fx(v)) : esc(v);

  /* ======================= HTML ======================= */
  // mã quy tắc (R01…, F01…) → liên kết tới mục diễn giải; trong phần mềm bấm vào mở cửa sổ giải thích
  const ruleLink0 = s => esc(s).replace(DATA.RULE_RE, m => DATA.RULES[m] ? `<a class="rule" data-rule="${m}" href="#rule-${m}" title="${esc(m + ' – ' + DATA.RULES[m].t)}">${m}</a>` : m);
  const citeId = k => 'cite-' + k.replace(/[^A-Za-z0-9-]/g, '_');
  // trích dẫn tài liệu (Bảng, PT, VD, mục, tài liệu nhà cung cấp…) + mã quy tắc → liên kết
  const ruleLink = s => {
    s = String(s === undefined || s === null ? '' : s);
    let out = '', p = 0;
    for (const c of DATA.citeFind(s)) {
      out += ruleLink0(s.slice(p, c.a)) + `<a class="cite" data-cite="${c.key}" href="#${citeId(c.key)}" title="${esc(DATA.CITES[c.key].loc + ' – ' + DATA.CITES[c.key].t)}">${esc(s.slice(c.a, c.b))}</a>`;
      p = c.b;
    }
    return out + ruleLink0(s.slice(p));
  };
  function secTable(sec) {
    const h = ['<table class="calc"><thead><tr><th style="width:9%">Ký hiệu</th><th style="width:31%">Thông số</th><th style="width:11%">Giá trị</th><th style="width:9%">Đơn vị</th><th style="width:26%">Công thức / cơ sở lựa chọn</th><th style="width:14%">Nguồn</th></tr></thead><tbody>'];
    const si = sec.u ? sec.u.secs.indexOf(sec) : -1, uid = sec.u ? sec.u.id : '';
    sec.rows.forEach((r, ri) => {
      const dr = `data-row="${uid}|${si}|${ri}"`;
      if (r.kind === 'note') { h.push(`<tr class="note" ${dr}><td colspan="6" class="nt">${ruleLink(r.val)}</td></tr>`); return; }
      const cls = r.kind === 'in' ? 'in' : r.kind === 'res' ? 'res' : r.kind === 'chk' ? (r.ok ? 'ok' : 'bad') : '';
      h.push(`<tr ${dr}><td class="sym">${esc(r.sym)}</td><td>${esc(r.name)}</td><td class="v ${cls}">${fv(r.val)}</td><td>${esc(r.unit)}</td><td class="f">${ruleLink(r.f)}</td><td class="src">${ruleLink(r.src)}</td></tr>`);
    });
    h.push('</tbody></table>');
    return h.join('');
  }
  // danh sách mã trích dẫn dùng trong kết quả R (theo thứ tự thư viện)
  function citeKeys(R) {
    const set = new Set();
    for (const u of R.units) for (const s of u.secs) for (const r of s.rows) for (const c of DATA.citeFind(r.kind === 'note' ? r.val : (r.f || '') + ' ¦ ' + (r.src || ''))) set.add(c.key);
    return Object.keys(DATA.CITES).filter(k => set.has(k));
  }
  function unitBlock(u, num) {
    let h = `<h2>${num} ${esc(u.code)} – ${esc(u.name)}</h2>`;
    for (const s of u.secs) h += `<h3>${esc(s.t)}</h3>` + secTable(s);
    return h;
  }
  function balanceTable(R) {
    const st = R.stages.filter(s => !s.skip), L = R.lim.L;
    let h = '<table class="bal"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th>' + st.map(s => `<th>${esc(s.name)}</th>`).join('') + '<th>Giới hạn</th><th>Đánh giá</th></tr></thead><tbody>';
    for (const [k, nm, un] of DATA.QPARAMS) {
      const lim = L[k], v7 = R.st.st7[k];
      const ok = lim === undefined ? null : v7 <= lim + 1e-9;
      h += `<tr><td>${nm}</td><td>${un}</td>` + st.map(s => `<td class="n">${fv(s.v[k])}</td>`).join('') + `<td class="n">${lim === undefined ? '—' : fv(lim)}</td><td class="${ok === null ? '' : ok ? 'ok' : 'bad'}">${ok === null ? '—' : ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}</td></tr>`;
    }
    return h + '</tbody></table>';
  }
  function effTable(S) {
    let h = '<table class="bal"><thead><tr><th>Chỉ tiêu</th>' + DATA.EFF_COLS.map(c => `<th>${c[1]} (%)</th>`).join('') + '</tr></thead><tbody>';
    for (const k of DATA.EFF_ROWS) h += `<tr><td>${k}</td>` + DATA.EFF_COLS.map(c => `<td class="n">${fv(S.eff[k][c[0]])}</td>`).join('') + '</tr>';
    return h + '</tbody></table>';
  }
  function simpleTable(head, rows, numCols, totRow) {
    return '<table class="bal"><thead><tr>' + head.map(x => `<th>${esc(x)}</th>`).join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map((c, i) => `<td class="${(numCols || []).includes(i) ? 'n' : ''}">${typeof c === 'number' ? fv(c) : esc(c)}</td>`).join('') + '</tr>').join('') + (totRow ? '<tr class="tot">' + totRow.map((c, i) => `<td class="${(numCols || []).includes(i) ? 'n' : ''}">${typeof c === 'number' ? fv(c) : esc(c)}</td>`).join('') + '</tr>' : '') + '</tbody></table>';
  }
  function worksTable(R) {
    const us = R.units.filter(u => u.geom);
    const K = R.kpi;
    return simpleTable(['TT', 'Công trình', 'Kích thước / thông số chính', 'Thể tích (m³)', 'Diện tích (m²)', 'Thời gian lưu'], us.map((u, i) => [i + 1, u.code + ' – ' + u.name, u.dims, u.V ? Math.round(u.V) : '—', u.A ? Math.round(u.A) : '—', u.hrt || '—']), [3, 4], ['', 'TỔNG', '', Math.round(K.Vt), Math.round(K.At), '']);
  }
  const equipRows = R => R.equip.map((e, i) => [i + 1, e.u, e.name, e.spec, e.qty, e.price, e.total, e.note]);
  function html(S, R) {
    const P = S.project, c = R.alt.c, K = R.kpi, Cc = R.cost;
    let n = 0, h = '';
    h += `<section class="cover"><div class="c1">BẢN TÍNH CÔNG NGHỆ</div><div class="c2">${esc(P.name)}</div><div class="c3">${esc(P.location)}</div>
      <div class="c4">Công suất ${fx(S.input.Q)} m³/ngđ – ${S.input.nMod} mô đun</div>
      <div class="c5">Phương án: <b>${esc(R.alt.name)}</b></div>
      <table class="kv">${DATA.STEPS.map(s => `<tr><td>${s.name}</td><td>${esc(DATA.optName(s.key, c[s.key]))}</td></tr>`).join('')}</table>
      <div class="c6">Cơ sở: Metcalf & Eddy – Wastewater Engineering, 5th Ed. (2014); Sanitaire ICEAS 202 (bể ICEAS); ${esc(R.lim.name)}; TCVN 7957:2023.</div>
      <div class="c7">Thiết kế: ${esc(P.designer)} &nbsp; · &nbsp; Kiểm tra: ${esc(P.checker)} &nbsp; · &nbsp; Ngày lập: ${esc(P.date)}</div>
      <div class="legend"><span class="in">Ô vàng</span> thông số chọn/nhập &nbsp; <span class="res">Ô xanh</span> kết quả tính &nbsp; <span class="ok">ĐẠT</span> / <span class="bad">KHÔNG ĐẠT</span> kiểm tra tự động</div></section>`;
    h += `<h1>${++n}. TÓM TẮT KẾT QUẢ</h1>`;
    h += simpleTable(['Chỉ tiêu', 'Giá trị', 'Đơn vị'], [
      ['Công nghệ sinh học', DATA.optName('bio', c.bio), ''], ['Tổng thể tích bể công nghệ', K.Vt, 'm³'], ['Tổng diện tích các công trình', K.At, 'm²'],
      ['Diện tích khu đất ước tính (× 2,2)', K.Asite, 'm²'], ['Thể tích bể sinh học / HRT', `${fx(K.Vbio, 0)} m³ / ${fx(K.HRTbio)} h`, ''],
      ['Công suất điện lắp đặt', K.kWinst, 'kW'], ['Điện năng tiêu thụ', K.kWhd, 'kWh/ngđ'], ['Suất tiêu thụ điện', K.kWhm3, 'kWh/m³'],
      ['Bùn khô phát sinh', K.Mtot, 'kg DS/ngđ'], ['Bánh bùn', K.cake, 'tấn/ngđ'], ['Hóa chất (tổng khối lượng)', K.chemKg, 'kg/ngđ'],
      ['Suất đầu tư sơ bộ', Cc.capex / 1000, 'tỷ đồng'], ['Chi phí vận hành', Cc.perM3, 'đ/m³'],
      ['Kết luận chất lượng nước xả', K.comply ? 'ĐẠT ' + R.lim.name : 'CHƯA ĐẠT – xem mục kiểm tra', ''],
    ], [1]);
    h += `<h1>${++n}. SỐ LIỆU ĐẦU VÀO VÀ TIÊU CHUẨN XẢ THẢI</h1>`;
    for (const s of R.um.info.secs) h += `<h3>${esc(s.t)}</h3>` + secTable(s);
    h += `<h1>${++n}. CÂN BẰNG CHẤT LƯỢNG NƯỚC QUA TỪNG CÔNG ĐOẠN</h1>`;
    h += '<h3>Hiệu suất giả định theo công đoạn (%)</h3>' + effTable(S);
    h += '<h3>Nồng độ tại từng điểm (mg/L; màu Pt/Co; coliform MPN/100 mL)</h3>' + balanceTable(R);
    h += `<h1>${++n}. TÍNH TOÁN CÁC CÔNG TRÌNH ĐƠN VỊ</h1>`;
    let m = 0;
    for (const u of R.units) if (!['info', 'info2', 'phutro'].includes(u.grp)) h += unitBlock(u, `${n}.${++m}`);
    h += unitBlock(R.um.sl0, `${n}.${++m}`);
    h += `<h1>${++n}. TÍNH TOÁN THỦY LỰC – ĐƯỜNG ỐNG VÀ CAO ĐỘ MỰC NƯỚC</h1>`;
    h += simpleTable(['Tuyến', 'Loại', 'Q (m³/h)', 'DN (mm)', 'L (m)', 'v (m/s)', 'h_f (m)', 'h_m (m)', 'Σh (m)'], R.hyd.links.map(l => [l.name, l.kind === 'p' ? 'Áp lực' : 'Tự chảy', l.Q, l.DN, l.L, l.v, l.hf, l.hm, l.h]), [2, 3, 4, 5, 6, 7, 8]);
    for (const s of R.um.hydc.secs) h += `<h3>${esc(s.t)}</h3>` + secTable(s);
    h += `<h1>${++n}. TỔNG HỢP HÓA CHẤT</h1>` + simpleTable(['TT', 'Hóa chất / mục đích', 'Liều (mg/L)', 'kg/ngđ', 'kg/tháng', 'Đơn giá (đ/kg)', 'Chi phí (đ/ngđ)', 'Cơ sở'], R.chem.map((x, i) => [i + 1, x.name, x.dose, x.kg, x.month, x.unitPrice, x.costD, x.note]), [2, 3, 4, 5, 6], ['', 'TỔNG', '', '', '', '', R.special.CHEM, '']);
    h += `<h1>${++n}. TỔNG HỢP ĐIỆN NĂNG</h1>` + simpleTable(['TT', 'Hạng mục', 'Công suất (kW)', 'Giờ/ngày', 'Hệ số', 'kWh/ngđ', 'Ghi chú'], R.power.map((x, i) => [i + 1, x.name, x.kW, x.h, x.k, x.kWh, x.note]), [2, 3, 4, 5], ['', 'TỔNG CỘNG', R.kWinst, '', '', R.kWhd, fx(R.kpi.kWhm3) + ' kWh/m³']);
    h += `<h1>${++n}. DANH MỤC THIẾT BỊ VÀ ĐƠN GIÁ</h1>` + simpleTable(['TT', 'Công trình', 'Thiết bị', 'Thông số chọn', 'SL', 'Đơn giá (tr.đ)', 'Thành tiền (tr.đ)', 'Ghi chú'], equipRows(R), [4, 5, 6], ['', 'TỔNG', '', '', '', '', R.special.EQ, '']);
    h += `<h1>${++n}. CHI PHÍ VẬN HÀNH – NHÂN CÔNG, VẬT TƯ THAY THẾ</h1>`;
    h += '<h3>Nhân công</h3>' + simpleTable(['Vị trí', 'Số người', 'Lương (tr.đ/tháng)', 'Chi phí có hệ số (tr.đ/tháng)'], R.labor.map(r => [r.name, r.n, r.sal, r.month]), [1, 2, 3], ['TỔNG', R.labor.reduce((a, r) => a + r.n, 0), '', R.special.LABOR]);
    h += '<h3>Vật tư thay thế, bảo dưỡng (tr.đ/năm)</h3>' + simpleTable(['Hạng mục', 'Đơn vị', 'SL/năm', 'Đơn giá (tr.đ)', 'Chi phí năm (tr.đ)', 'Ghi chú'], R.spares.map(r => [r.name, r.unit, r.qty, r.price, r.year, r.note]).concat(R.customSp.map(r => [r.name, r.unit, r.qty, r.price, r.year, 'Nhập tay'])).concat([['Bảo dưỡng, sửa chữa thiết bị', '% G_TB', S.p.maint_pct, R.special.EQ, R.maint, '% giá thiết bị/năm']]), [2, 3, 4], ['TỔNG', '', '', '', R.special.SPARE, '']);
    h += `<h1>${++n}. SUẤT ĐẦU TƯ & CHI PHÍ VẬN HÀNH SƠ BỘ</h1>`;
    for (const s of R.um.cost.secs) h += `<h3>${esc(s.t)}</h3>` + secTable(s);
    h += `<h1>${++n}. BẢNG TỔNG HỢP CÔNG TRÌNH</h1>` + worksTable(R);
    h += `<h1>${++n}. KIỂM TRA VÀ CẢNH BÁO THIẾT KẾ</h1>`;
    h += simpleTable(['Công trình', 'Nội dung kiểm tra', 'Kết quả'], R.checks.map(x => [x.code + ' – ' + x.unit, x.name, (x.ok ? '✔ ' : x.soft ? '⚠ ' : '✖ ') + x.text]));
    if (R.warns.length) h += '<h3>Cảnh báo cần xử lý</h3><ul class="warn">' + R.warns.map(w => `<li>${esc(w)}</li>`).join('') + '</ul>';
    if (R.auto && R.auto.length) h += '<h3>Điều chỉnh tự động theo quy tắc R08 (đại lượng tự giải đưa vào dải khuyến cáo)</h3>' + simpleTable(['Công trình', 'Đại lượng', 'Giá trị nhập / tự tính', 'Sau điều chỉnh', 'Đơn vị', 'Lý do'], R.auto.map(x => [x.code, x.what, x.from, x.to, x.unit, x.why]), [2, 3]);
    h += `<h1>${++n}. DIỄN GIẢI CÁC QUY TẮC TÍNH TOÁN & ĐỒNG NHẤT THÔNG SỐ</h1>`;
    h += '<p class="small">Mã quy tắc ghi ở cột "Công thức / cơ sở lựa chọn" và "Nguồn" của bản tính. R01 – R07: quy tắc đồng nhất thông số chung giữa các phương án; R08: tự điều chỉnh đại lượng tự giải vào dải khuyến cáo; F01 – F17: các điểm đã hiệu chỉnh trong phương pháp tính (đặc tả đồng nhất PA ICEAS – C-Tech, 06/10/2026). Cột cuối liệt kê các dòng tính của phương án này áp dụng quy tắc.</p>';
    h += '<table class="calc rules"><thead><tr><th style="width:6%">Mã</th><th style="width:20%">Quy tắc</th><th style="width:52%">Diễn giải</th><th style="width:22%">Áp dụng tại (phương án này)</th></tr></thead><tbody>';
    for (const [k, v] of Object.entries(DATA.RULES)) {
      const refs = DATA.ruleRefs(R, k);
      h += `<tr id="rule-${k}"><td class="sym"><b>${k}</b></td><td><b>${esc(v.t)}</b></td><td>${ruleLink(v.d)}</td><td class="src" data-nobi="1">${refs.length ? refs.map(x => `<span title="${esc(x.name)}">${esc(x.u + (x.sym ? ' · ' + x.sym : ''))}</span>`).join(', ') : esc(v.at || '—')}</td></tr>`;
    }
    h += '</tbody></table>';
    // trích dẫn chi tiết các tài liệu được dùng trong bản tính của phương án này
    const used = citeKeys(R);
    if (used.length) {
      h += `<h1>${++n}. TRÍCH DẪN CHI TIẾT TÀI LIỆU THAM CHIẾU</h1>`;
      h += '<p class="small">Bảng, phương trình, ví dụ, mục và tài liệu nhà cung cấp được nhắc tới trong cột "Công thức / cơ sở lựa chọn", "Nguồn" và ghi chú của bản tính: vị trí trong tài liệu, biểu thức, giá trị bảng và các dòng tính sử dụng. Nội dung là tóm tắt / số liệu trích theo tài liệu – khi phát hành chính thức đối chiếu với bản gốc.</p>';
      for (const k of used) {
        const c = DATA.CITES[k], refs = DATA.citeRefs(R, k);
        h += `<div class="cite-blk" data-nobi="1" id="${citeId(k)}"><h3>${esc(c.loc)} – ${esc(c.t)}</h3><div data-nobi="1"><div class="en" style="margin-top:-4px">${esc(c.te || '')}</div>${DATA.citeHTML(k, esc)}${c.de ? `<p class="en">${esc(c.de)}</p>` : ''}
          <p class="small"><b>Dùng tại:</b> ${refs.map(x => `<span title="${esc(x.r.name || '')}">${esc(x.u.code + (x.r.sym ? ' · ' + x.r.sym : ''))}</span>`).join(', ') || '—'}</p></div></div>`;
      }
    }
    h += `<h1>${++n}. TÀI LIỆU THAM CHIẾU</h1><ol class="refs">` + DATA.REFS.map(r => `<li><b>${esc(r[0])}</b> – ${esc(r[1])}</li>`).join('') + '</ol>';
    h += '<p class="small">Các giá trị ghi "Lựa chọn thiết kế", "Catalogue", "Thí nghiệm" không phải số liệu của M&E – phải kiểm chứng bằng thí nghiệm/hồ sơ nhà sản xuất trước khi phát hành thiết kế kỹ thuật. Đơn giá là sơ bộ – cập nhật theo báo giá.</p>';
    return BI.html(`<div class="rep">${h}</div>`);
  }

  /* ======================= XLSX writer ======================= */
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      cen.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const csz = cen.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // styles: 0 thường, 1 tiêu đề cột, 2 nhập (vàng), 3 kết quả (xanh), 4 tiêu đề lớn, 5 đạt, 6 không đạt, 7 ghi chú nghiêng, 8 mục (đậm), 9 số thường, 10 công thức chữ nhỏ
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.###"/></numFmts>
<fonts count="6"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF1F4E79"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF595959"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF1F4E79"/><name val="Arial"/></font><font><sz val="9"/><color rgb="FF33475B"/><name val="Arial"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFC6EFCE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="14">
<xf fontId="0" fillId="0" borderId="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf fontId="0" fillId="3" borderId="1" numFmtId="164" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="center"/></xf>
<xf fontId="1" fillId="4" borderId="1" numFmtId="164" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="center"/></xf>
<xf fontId="2" fillId="0" borderId="0" applyFont="1"/>
<xf fontId="1" fillId="5" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
<xf fontId="1" fillId="6" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
<xf fontId="3" fillId="0" borderId="0" applyFont="1"><alignment wrapText="0"/></xf>
<xf fontId="4" fillId="0" borderId="0" applyFont="1"/>
<xf fontId="0" fillId="0" borderId="1" numFmtId="164" applyBorder="1" applyNumberFormat="1"><alignment vertical="center"/></xf>
<xf fontId="5" fillId="0" borderId="1" applyFont="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
<xf fontId="2" fillId="0" borderId="0" applyFont="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="3" fillId="0" borderId="0" applyFont="1"><alignment vertical="top" wrapText="1"/></xf>
<xf fontId="4" fillId="0" borderId="0" applyFont="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs></styleSheet>`;

  /* ô:
     giá trị thường | {v, s} | {row: rowObj, s}  → ô công thức theo row.xp (hoặc hằng số nếu ô nhập)
     {ref: rowObj, s} → "=địa chỉ ô của row" ; {f: 'C5*D5', v, s} → công thức trực tiếp (dùng {{sp:NAME}} cho ô tổng) */
  function buildWorkbook(sheets, specials, R) {
    // 1. tên duy nhất
    const names = [];
    sheets.forEach(s => { let n = s.name.replace(/[\\/?*\[\]:]/g, '').slice(0, 31); let k = 2; while (names.includes(n)) n = n.slice(0, 28) + '_' + k++; names.push(n); s.fname = n; });
    // 2. gán địa chỉ
    const spAddr = {};
    const q = n => `'${n.replace(/'/g, "''")}'`;
    sheets.forEach(sh => sh.rows.forEach((row, ri) => row.forEach((cell, ci) => {
      if (cell && typeof cell === 'object' && cell.row) cell.row.addr = `${q(sh.fname)}!$${colName(ci)}$${ri + 1}`;
      if (cell && typeof cell === 'object' && cell.sp) spAddr[cell.sp] = `${q(sh.fname)}!$${colName(ci)}$${ri + 1}`;
    })));
    const numLit = v => (typeof v === 'number' && isFinite(v) ? String(v) : '0');
    const fOfRow = r => r.xp.map(pt => typeof pt === 'string' ? pt : pt.sp ? (spAddr[pt.sp] || numLit(specials[pt.sp])) : (pt.addr || (typeof pt.val === 'number' ? numLit(pt.val) : JSON.stringify(String(pt.val))))).join('');
    // 3. XML
    const sheetXML = sh => {
      const o = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"' + (sh.freeze ? '><pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView>' : '/>') + '</sheetViews>'];
      if (sh.cols) o.push('<cols>' + sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>');
      o.push('<sheetData>');
      const W = sh.cols || [];
      const merges = [];
      sh.rows.forEach((row, ri) => {
        // song ngữ: chiều cao hàng theo số dòng VI + EN của ô dài nhất; hàng 1 ô (tiêu đề/ghi chú/mục) gộp hết bề rộng sheet
        const txt = c => (c && typeof c === 'object' ? (c.row || c.ref || c.f || c.nobi ? null : c.v) : c);
        const filled = row.map((c, i) => [c, i]).filter(([c]) => c !== undefined && c !== null && c !== '');
        const sty = c => (c && typeof c === 'object' && c.s !== undefined ? c.s : null);
        const single = filled.length === 1 && filled[0][1] === 0 && [4, 7, 8].includes(sty(filled[0][0])) && W.length > 1;
        let ht = 0;
        for (const [c, i] of filled) {
          const v = txt(c); if (typeof v !== 'string') continue;
          const e = BI.en(v); if (!e) continue;
          const cw = single ? W.reduce((a, b) => a + b, 0) : (W[i] || 10);
          const s = sty(c), big = s === 4 ? 18 : s === 8 ? 15 : 12.75;
          const nl = str => str.split('\n').reduce((a, p) => a + Math.max(1, Math.ceil(p.length / Math.max(4, cw * 1.05))), 0);
          ht = Math.max(ht, nl(v) * big + nl(e) * 10.5 + 3);
        }
        if (single && ht) merges.push(`A${ri + 1}:${colName(W.length - 1)}${ri + 1}`);
        o.push(ht ? `<row r="${ri + 1}" ht="${ht.toFixed(1)}" customHeight="1">` : `<row r="${ri + 1}">`);
        row.forEach((cell, ci) => {
          if (cell === undefined || cell === null || cell === '') return;
          const ref = colName(ci) + (ri + 1);
          let v = cell, s = null, f = null;
          if (typeof cell === 'object') {
            s = cell.s === undefined ? null : cell.s;
            if (cell.row) { v = cell.row.val; if (cell.row.xp && cell.row.kind !== 'in') f = fOfRow(cell.row); }
            else if (cell.ref) { v = cell.ref.val; f = cell.ref.addr ? cell.ref.addr : null; }
            else if (cell.f) { v = cell.v; f = cell.f.replace(/\{\{sp:(\w+)\}\}/g, (m, k) => spAddr[k] || numLit(specials[k])).replace(/\{\{ref:(\w+)\.(\w+)\}\}/g, (m, a, b) => { const rw = R && R.um[a] && R.um[a].ids[b]; return rw ? (rw.addr || numLit(rw.val)) : '0'; }); }
            else v = cell.v;
          }
          if (v === undefined || v === null || (v === '' && !f)) { if (s !== null) o.push(`<c r="${ref}" s="${s}"/>`); return; }
          if (f) {
            if (typeof v === 'number' && isFinite(v)) o.push(`<c r="${ref}" s="${s === null ? 9 : s}"><f>${xesc(f)}</f><v>${v}</v></c>`);
            else o.push(`<c r="${ref}" t="str" s="${s === null ? 0 : s}"><f>${xesc(f)}</f><v>${xesc(v)}</v></c>`);
          } else if (typeof v === 'number' && isFinite(v)) o.push(`<c r="${ref}" s="${s === null ? 9 : s}"><v>${v}</v></c>`);
          else {
            const e = cell && cell.nobi ? '' : BI.en(v);
            let st = s === null ? 0 : s;
            if (e && ci === 0 && merges.length && merges[merges.length - 1].startsWith(ref + ':')) st = st === 4 ? 11 : st === 7 ? 12 : st === 8 ? 13 : st;
            if (e) o.push(`<c r="${ref}" t="inlineStr" s="${st}"><is><r><t xml:space="preserve">${xesc(v)}</t></r><r><rPr><sz val="8"/><color rgb="FF8C8C8C"/><rFont val="Arial"/></rPr><t xml:space="preserve">&#10;${xesc(e)}</t></r></is></c>`);
            else o.push(`<c r="${ref}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`);
          }
        });
        o.push('</row>');
      });
      o.push('</sheetData>' + (merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') + '<pageMargins left="0.5" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>');
      return o.join('');
    };
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: STYLES },
    ];
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXML(s) }));
    return zip(files);
  }
  const H = t => ({ v: t, s: 1 });
  const T = t => ({ v: t, s: 4 });
  const NOTE = t => ({ v: t, s: 7 });

  function unitSheet(name, u, extraTop) {
    const rows = [[T(u.code + ' – ' + u.name)], [NOTE('Cột C: ô vàng = thông số nhập (sửa được, bảng tự tính lại); ô xanh = công thức sống tham chiếu các ô khác; xanh lá/đỏ = kiểm tra tự động. Cột E: công thức dạng chữ; cột F: tài liệu tham chiếu.')]];
    if (extraTop) rows.push(...extraTop);
    rows.push([]);
    for (const s of u.secs) {
      rows.push([{ v: s.t, s: 8 }]);
      rows.push([H('Ký hiệu'), H('Thông số'), H('Giá trị'), H('Đơn vị'), H('Công thức / cơ sở lựa chọn'), H('Nguồn tham chiếu')]);
      for (const r of s.rows) {
        if (r.kind === 'note') { rows.push([NOTE(r.val)]); continue; }
        const st = r.kind === 'in' ? 2 : r.kind === 'res' ? 3 : r.kind === 'chk' ? (r.ok ? 5 : 6) : (typeof r.val === 'number' ? 9 : 0);
        rows.push([r.sym, r.name, r.xp || r.kind === 'in' || r.id ? { row: r, s: st } : { v: r.val, s: st }, r.unit, { v: r.f, s: 10 }, { v: r.src, s: 10 }]);
      }
      rows.push([]);
    }
    return { name, cols: [13, 46, 15, 13, 48, 24], rows, freeze: 0 };
  }

  function xlsx(S, R, altsResults) {
    const P = S.project, K = R.kpi, sheets = [];
    const sp = R.special;
    // tổng quan
    sheets.push({ name: 'TONG_QUAN', cols: [44, 62, 16], rows: [
      [T('BẢN TÍNH CÔNG NGHỆ ' + P.name)], [P.location], [`Công suất ${fx(S.input.Q)} m³/ngđ – phương án: ${R.alt.name}`], [],
      [H('Công đoạn'), H('Lựa chọn công nghệ')], ...DATA.STEPS.map(s => [s.name, DATA.optName(s.key, R.alt.c[s.key])]), [],
      [H('Chỉ tiêu tổng hợp'), H('Giá trị'), H('Đơn vị')],
      ['Tổng thể tích bể công nghệ', R.um.cost.ids.Vt ? { ref: R.um.cost.ids.Vt, s: 3 } : { v: K.Vt, s: 3 }, 'm³'], ['Tổng diện tích công trình', R.um.cost.ids.At ? { ref: R.um.cost.ids.At, s: 3 } : { v: K.At, s: 3 }, 'm²'],
      ['Công suất điện lắp đặt', { f: '{{sp:KWINST}}', v: K.kWinst, s: 3 }, 'kW'], ['Điện năng', { f: '{{sp:KWHD}}', v: K.kWhd, s: 3 }, 'kWh/ngđ'],
      ['Bùn khô', { ref: R.um.sl0.ids.Mtot, s: 3 }, 'kg DS/ngđ'], ['Bánh bùn', { ref: R.um.dw.ids.Mc, s: 3 }, 'tấn/ngđ'],
      ['Suất đầu tư sơ bộ', { ref: R.um.cost.ids.capex, s: 3 }, 'tr.đ'], ['Chi phí vận hành', { ref: R.um.cost.ids.perM3, s: 3 }, 'đ/m³'],
      ['Kết luận', { v: K.comply ? 'ĐẠT ' + R.lim.name : 'CHƯA ĐẠT', s: K.comply ? 5 : 6 }], [],
      [NOTE('Toàn bộ các sheet dùng CÔNG THỨC SỐNG: sửa ô vàng (thông số) ở bất kỳ sheet nào, Excel tự tính lại (Ctrl+Alt+F9 để tính lại toàn bộ).')],
      [NOTE('Một số lựa chọn rời rạc (chọn DN ống, model thiết bị, số chu kỳ lặp) là ô nhập – khi thay đổi lớn nên chạy lại phần mềm để chọn lại.')],
      [NOTE('Tài liệu tham chiếu: xem sheet TaiLieu.')],
    ] });
    sheets.push(unitSheet('01_DauVao', R.um.info));
    sheets.push(unitSheet('02_CanBang', R.um.bal));
    // ma trận cân bằng tham chiếu
    const stN = [['①', '1'], ['②', '2'], ['③', '3'], ...(R.um.bal.ids.COD3a ? [['③a', '3a']] : []), ['④', '4'], ['⑤', '5'], ['⑥a', '6a'], ['⑥b', '6b'], ['⑥', '6'], ['⑦', '7']];
    const cL = n => String.fromCharCode(65 + n), cLast = cL(1 + stN.length), cLim = cL(2 + stN.length);   // cột ⑦ và cột giới hạn
    const mt = [[T('BẢNG CÂN BẰNG CHẤT LƯỢNG NƯỚC (tham chiếu sheet 02_CanBang)')], [], [H('Chỉ tiêu'), H('Đơn vị'), ...stN.map(x => H(x[0])), H('Giới hạn'), H('Đánh giá')]];
    for (const [k, nm, un] of DATA.QPARAMS) {
      const lr = R.um.info.ids['L_' + k], r7 = R.um.bal.ids[k + '7'];
      mt.push([nm, un, ...stN.map(x => ({ ref: R.um.bal.ids[k + x[1]], s: 9 })), lr ? { ref: lr, s: 9 } : '—', lr ? { f: `IF(${cLast + (mt.length + 1)}<=${cLim + (mt.length + 1)},"ĐẠT","KHÔNG ĐẠT")`, v: r7.val <= lr.val + 1e-9 ? 'ĐẠT' : 'KHÔNG ĐẠT', s: r7.val <= lr.val + 1e-9 ? 5 : 6 } : '—']);
    }
    sheets.push({ name: '02b_BangCanBang', cols: [22, 12, ...stN.map(() => 11), 11, 12], rows: mt });
    let i = 3;
    for (const u of R.units) if (!['info', 'info2', 'phutro'].includes(u.grp)) sheets.push(unitSheet(String(i++).padStart(2, '0') + '_' + u.code, u));
    sheets.push(unitSheet(String(i++).padStart(2, '0') + '_Bun', R.um.sl0));
    // thủy lực
    const tl = unitSheet('ThuyLuc', R.um.hydc, [[NOTE('Hazen-Williams (SI): h_f = 10,67·L·Q^1,852/(C^1,852·D^4,87); h_m = Σξ·v²/2g. DN, L, C, Σξ là ô nhập – sửa để kiểm tra phương án tuyến ống.')]]);
    sheets.push(tl);
    // hóa chất
    const hc = [[T('TỔNG HỢP HÓA CHẤT & CHI PHÍ')], [NOTE('Cột D tham chiếu công thức ở sheet công trình; cột G (đơn giá) là ô nhập.')], [H('TT'), H('Hóa chất / mục đích'), H('Liều mg/L'), H('kg/ngđ'), H('kg/tháng'), H('Đơn vị'), H('Đơn giá đ/kg'), H('Chi phí đ/ngđ'), H('Cơ sở')]];
    const hc0 = hc.length + 1;
    R.chem.forEach((x, j) => { const r = hc.length + 1; hc.push([j + 1, x.name, x.dose, x.ref ? { ref: x.ref, s: 3 } : { v: x.kg, s: 3 }, { f: `D${r}*30`, v: x.month }, x.unit, { v: x.unitPrice, s: 2 }, { f: `D${r}*G${r}`, v: x.costD, s: 3 }, x.note]); });
    const hcT = hc.length + 1;
    hc.push(['', { v: 'TỔNG', s: 8 }, '', { f: `SUM(D${hc0}:D${hcT - 1})`, v: K.chemKg, s: 3 }, '', '', '', { f: `SUM(H${hc0}:H${hcT - 1})`, v: sp.CHEM, s: 3, sp: 'CHEM' }, '']);
    sheets.push({ name: 'HoaChat', cols: [5, 48, 11, 13, 13, 14, 13, 15, 26], rows: hc });
    // điện
    const dn = [[T('TỔNG HỢP ĐIỆN NĂNG')], [], [H('TT'), H('Hạng mục'), H('Công suất kW'), H('Giờ/ngày'), H('Hệ số'), H('kWh/ngđ'), H('Ghi chú')]];
    const dn0 = dn.length + 1;
    // F07/F16: công suất, giờ chạy, hệ số tải liên kết sống với sheet tính khi có công thức (x.fx)
    const fxc = (x, k, v, s) => (x.fx && x.fx[k] ? { f: x.fx[k], v, s: 3 } : { v, s });
    R.power.forEach((x, j) => { const r = dn.length + 1; dn.push([j + 1, x.name, x.fx && x.fx.kW ? fxc(x, 'kW', x.kW) : x.ref ? { ref: x.ref, s: 3 } : { v: x.kW, s: 2 }, fxc(x, 'h', x.h, 2), fxc(x, 'k', x.k, 2), { f: `C${r}*D${r}*E${r}`, v: x.kWh, s: 3 }, x.note]); });
    const dnT = dn.length + 1;
    dn.push(['', { v: 'TỔNG', s: 8 }, { f: `SUM(C${dn0}:C${dnT - 1})`, v: R.kWinst, s: 3, sp: 'KWINST' }, '', '', { f: `SUM(F${dn0}:F${dnT - 1})`, v: R.kWhd, s: 3, sp: 'KWHD' }, '']);
    dn.push(['', 'Suất điện năng', '', '', '', { f: `F${dnT}/{{ref:info.Q}}`, v: K.kWhm3, s: 3 }, 'kWh/m³']);
    sheets.push({ name: 'DienNang', cols: [5, 52, 14, 10, 9, 14, 30], rows: dn });
    // thiết bị
    const tb = [[T('DANH MỤC THIẾT BỊ & ĐƠN GIÁ')], [NOTE('Đơn giá (cột F) là ô nhập – mặc định ước tính sơ bộ, thay bằng giá chào của nhà cung cấp.')], [H('TT'), H('Công trình'), H('Thiết bị'), H('Thông số chọn'), H('SL'), H('Đơn giá tr.đ'), H('Thành tiền tr.đ'), H('Ghi chú')]];
    const tb0 = tb.length + 1;
    R.equip.forEach((e, j) => { const r = tb.length + 1; tb.push([j + 1, e.u, e.name, e.spec, e.qtyX ? { f: e.qtyX, v: e.qty, s: 3 } : { v: e.qty, s: 2 },{ v: e.price, s: 2 }, { f: `E${r}*F${r}`, v: e.total, s: 3 }, e.note]); });
    const tbT = tb.length + 1;
    tb.push(['', { v: 'TỔNG', s: 8 }, '', '', '', '', { f: `SUM(G${tb0}:G${tbT - 1})`, v: sp.EQ, s: 3, sp: 'EQ' }, '']);
    sheets.push({ name: 'ThietBi', cols: [5, 30, 38, 44, 7, 12, 15, 20], rows: tb });
    // nhân công
    const nc = [[T('CHI PHÍ NHÂN CÔNG')], [], ['Hệ số chi phí theo lương (BHXH, BHYT, phụ cấp)', '', { v: S.p.labor_k, s: 2 }], [], [H('Vị trí'), H('Số người'), H('Lương tr.đ/tháng'), H('Chi phí tr.đ/tháng')]];
    const nc0 = nc.length + 1;
    R.labor.forEach(r => { const rr = nc.length + 1; nc.push([r.name, { v: r.n, s: 2 }, { v: r.sal, s: 2 }, { f: `B${rr}*C${rr}*$C$3`, v: r.month, s: 3 }]); });
    const ncT = nc.length + 1;
    nc.push([{ v: 'TỔNG', s: 8 }, { f: `SUM(B${nc0}:B${ncT - 1})`, v: R.labor.reduce((a, r) => a + r.n, 0) }, '', { f: `SUM(D${nc0}:D${ncT - 1})`, v: sp.LABOR, s: 3, sp: 'LABOR' }]);
    sheets.push({ name: 'NhanCong', cols: [40, 12, 18, 20], rows: nc });
    // vật tư
    const vt = [[T('VẬT TƯ THAY THẾ & BẢO DƯỠNG (tr.đ/năm)')], [], [H('Hạng mục'), H('Đơn vị'), H('SL cơ sở'), H('Tuổi thọ năm'), H('SL/năm'), H('Đơn giá tr.đ'), H('Chi phí tr.đ/năm'), H('Ghi chú')]];
    const vt0 = vt.length + 1;
    R.spares.forEach(r => { const rr = vt.length + 1; const ovq = S.opex.spareOv && S.opex.spareOv[r.key] && S.opex.spareOv[r.key].qty !== undefined && S.opex.spareOv[r.key].qty !== ''; vt.push([r.name, r.unit, r.baseX ? { f: r.baseX, v: r.base, s: 3 } : { v: r.base, s: 2 },{ v: r.life, s: 2 }, ovq ? { v: r.qty, s: 2 } : { f: `C${rr}/D${rr}`, v: r.qty }, { v: r.price, s: 2 }, { f: `E${rr}*F${rr}`, v: r.year, s: 3 }, r.note]); });
    R.customSp.forEach(r => { const rr = vt.length + 1; vt.push([r.name, r.unit, '', '', { v: r.qty, s: 2 }, { v: r.price, s: 2 }, { f: `E${rr}*F${rr}`, v: r.year, s: 3 }, 'Nhập tay']); });
    { const rr = vt.length + 1; vt.push(['Bảo dưỡng, sửa chữa thiết bị', '% giá TB', '', '', { v: S.p.maint_pct, s: 2 }, { f: '{{sp:EQ}}', v: sp.EQ }, { f: `E${rr}/100*F${rr}`, v: R.maint, s: 3 }, '% giá trị thiết bị/năm']); }
    const vtT = vt.length + 1;
    vt.push([{ v: 'TỔNG', s: 8 }, '', '', '', '', '', { f: `SUM(G${vt0}:G${vtT - 1})`, v: sp.SPARE, s: 3, sp: 'SPARE' }, '']);
    sheets.push({ name: 'VatTu', cols: [44, 10, 11, 11, 11, 12, 16, 26], rows: vt });
    sheets.push(unitSheet('ChiPhi', R.um.cost));
    sheets.push({ name: 'TongHop', cols: [6, 50, 50, 14, 14, 14], rows: [[T('BẢNG TỔNG HỢP CÔNG TRÌNH')], [], [H('TT'), H('Công trình'), H('Kích thước'), H('Thể tích m³'), H('Diện tích m²'), H('Thời gian lưu')], ...R.units.filter(u => u.geom).map((u, j) => [j + 1, u.code + ' – ' + u.name, u.dims, u.V || '', u.A || '', u.hrt || ''])] });
    sheets.push({ name: 'KiemTra', cols: [34, 60, 40], rows: [[T('KIỂM TRA & CẢNH BÁO')], [NOTE('Các ô kiểm tra ở sheet công trình là công thức IF sống; bảng này là tổng hợp tại thời điểm xuất.')], [H('Công trình'), H('Nội dung'), H('Kết quả')], ...R.checks.map(x => [x.code + ' – ' + x.unit, x.name, { v: x.text, s: x.ok ? 5 : 6 }]), [], ...R.warns.map(w => [NOTE('⚠ ' + w)])] });
    sheets.push({ name: 'QuyTac', cols: [8, 40, 100, 50], rows: [[T('DIỄN GIẢI CÁC QUY TẮC TÍNH TOÁN & ĐỒNG NHẤT THÔNG SỐ')], [NOTE('Mã quy tắc ghi ở cột E (công thức) và F (nguồn) của các sheet công trình. R01 – R07: quy tắc đồng nhất thông số chung; R08: tự điều chỉnh vào dải khuyến cáo; F01 – F17: điểm hiệu chỉnh phương pháp tính.')], [H('Mã'), H('Quy tắc'), H('Diễn giải'), H('Áp dụng tại (phương án này)')],
      ...Object.entries(DATA.RULES).map(([k, v]) => { const refs = DATA.ruleRefs(R, k); return [{ v: k, s: 8 }, v.t, v.d, refs.length ? refs.map(x => x.u + (x.sym ? ' · ' + x.sym : '')).join(', ') : (v.at || '—')]; })] });
    {
      const flat = c => [c.eq || '', (c.v || []).map(x => x[0] + ': ' + x[1]).join('; '), c.d || '', c.tb ? c.tb.h.join(' | ') + '\n' + c.tb.r.map(r => r.join(' | ')).join('\n') : ''].filter(Boolean).join('\n');
      sheets.push({ name: 'TrichDan', cols: [26, 44, 90, 70, 34], rows: [[T('TRÍCH DẪN CHI TIẾT TÀI LIỆU THAM CHIẾU')], [NOTE('Các bảng, phương trình, ví dụ, mục và tài liệu được nhắc tới trong cột E (công thức) và F (nguồn) của các sheet công trình.')], [H('Vị trí'), H('Nội dung'), H('Biểu thức / diễn giải / giá trị bảng'), H('Content (EN)'), H('Dùng tại')],
        ...citeKeys(R).map(k => { const c = DATA.CITES[k], N = v => ({ v, s: 0, nobi: true }); return [{ v: c.loc, s: 8, nobi: true }, N(c.t), N(flat(c)), N((c.te || '') + (c.de ? '\n' + c.de : '')), N(DATA.citeRefs(R, k).map(x => x.u.code + (x.r.sym ? ' · ' + x.r.sym : '')).join(', '))]; })] });
    }
    sheets.push({ name: 'TaiLieu',cols: [18, 120], rows: [[T('TÀI LIỆU THAM CHIẾU')], [], [H('Ký hiệu'), H('Tài liệu')], ...DATA.REFS.map(r => [{ v: r[0], s: 8 }, r[1]])] });
    if (altsResults && altsResults.length > 1) sheets.push(compareSheet(S, altsResults, R));
    sheets.push(...opsSheets(S));
    const specials = Object.assign({ KWINST: R.kWinst }, sp);
    return buildWorkbook(sheets, specials, R);
  }
  /* ---------------- báo cáo kiểm tra vận hành & hiệu chỉnh (tab 12) ---------------- */
  const OPF = [
    ['Q', 'Lưu lượng thực tế Q (m³/ngđ)'], ['kmax', 'Hệ số đỉnh lưu lượng vào cụm sinh học'], ['T', 'Nhiệt độ nước thấp nhất (°C)'], ['Tmax', 'Nhiệt độ nước cao nhất (°C)'],
    ['Vana', 'Thể tích vùng kỵ khí (m³)'], ['Van', 'Thể tích vùng thiếu khí (m³)'], ['Vaer', 'Thể tích vùng hiếu khí (m³)'], ['Vmem', 'Thể tích bể màng (m³)'], ['Am', 'Diện tích màng (m²)'],
    ['Vb', 'Tổng thể tích bể ở mực nước cao TWL (m³)'], ['fAer', 'Phân suất thời gian sục khí trong chu kỳ'], ['fSD', 'Phân suất thời gian lắng + gạn'], ['TWL', 'Mực nước cao TWL (m)'], ['dH', 'Chiều sâu gạn mỗi chu kỳ ΔH (m)'],
    ['fOn', 'Phân suất thời gian sục khí (1 = liên tục)'], ['MLSS', 'MLSS vận hành (mg/L)'], ['SVI', 'SVI đo (mL/g)'], ['SRT', 'SRT vận hành (ngày)'], ['Acl', 'Tổng diện tích bể lắng thứ cấp (m²)'],
    ['R', 'Tỷ lệ tuần hoàn bùn R (× Q)'], ['IR', 'Tỷ lệ tuần hoàn nội IR (× Q)'], ['air', 'Lưu lượng khí đang cấp cho bể sinh học (Nm³/h)'], ['airMax', 'Năng lực khí tối đa của các máy thổi làm việc (Nm³/h)'],
    ['SOTE', 'SOTE đĩa ở độ ngập'], ['Df', 'Độ ngập đĩa D_f (m)'], ['kWs', 'Công suất guồng khí đang vận hành (kW)'], ['kWsMax', 'Công suất guồng khí tối đa có thể chạy (kW)'], ['alpha', 'Hệ số α'], ['DO', 'DO đặt (mg/L)'],
    ['pacSim', 'PAC châm vào bể sinh học (mg/L)'], ['pacTert', 'PAC cụm hóa lý bậc 3 (mg/L)'], ['meoh', 'Methanol (mg/L)'], ['naoh', 'NaOH 100 % (mg/L)'], ['poly', 'Polymer trợ lắng (mg/L)'], ['cl', 'Liều clo hoạt tính (mg/L)'], ['uv', 'Liều UV (mJ/cm²)'],
  ];
  function opsSheets(S) {
    if (typeof OPS === 'undefined' || !S.op) return [];
    const o = S.op, RP = OPS.report(S, o);
    if (RP.err) return [];
    const A = RP.A, r0 = A.base, r1 = A.after, P = S.project;
    const ST = ok => ok === null || ok === undefined ? '—' : { v: ok ? 'ĐẠT' : 'KHÔNG ĐẠT', s: ok ? 5 : 6 };
    const num = v => (typeof v === 'number' && isFinite(v) ? { v: +v.toPrecision(4), s: 3 } : v);
    const rows = [[T('KIỂM TRA KHẢ NĂNG VẬN HÀNH HỆ THỐNG XLNT – ' + P.name)], [P.location || ''],
      [`Công nghệ: ${DATA.optName('bio', o.bio)}; tiêu chuẩn: ${r0.lim.name}`], o.src ? [`Nguồn số liệu công trình: ${o.src}`] : [], [],
      [{ v: '1. Số liệu vận hành nhập', s: 8 }], [H('Thông số'), H('Giá trị'), H('Thông số'), H('Giá trị')]];
    const fl = OPF.filter(([k]) => typeof o[k] === 'number' && (o[k] !== 0 || ['meoh', 'naoh', 'pacSim', 'SRT'].includes(k)) && !(o.aer === 'surf' ? ['air', 'airMax', 'SOTE', 'Df'] : ['kWs', 'kWsMax']).includes(k) && !(k === 'uv' && o.disinf !== 'uv') && !(k === 'cl' && o.disinf !== 'naocl'));
    for (let i = 0; i < fl.length; i += 2) rows.push([fl[i][1], { v: o[fl[i][0]], s: 2 }, fl[i + 1] ? fl[i + 1][1] : '', fl[i + 1] ? { v: o[fl[i + 1][0]], s: 2 } : '']);
    rows.push([], [{ v: '2. Dự đoán chất lượng nước ra', s: 8 }],
      [H('Chỉ tiêu'), H('Đơn vị'), H('Nước vào'), H('Dự đoán ra – vận hành hiện tại'), H('Giới hạn'), H('Đánh giá'), H('Dự đoán ra – sau khuyến cáo'), H('Đánh giá'), H('Đo thực tế (nếu có)')]);
    r0.comp.forEach((c, i) => { const c1 = r1.comp[i], m = o.meas && o.meas[c.key]; rows.push([c.nm, c.un, num(r0.st1[c.key]), num(c.v), c.lim === undefined ? '—' : num(c.lim), ST(c.ok), num(c1.v), ST(c1.ok), m !== undefined && m !== '' ? num(+m) : '']); });
    rows.push([], [{ v: r0.comply ? 'Với vận hành hiện tại: ĐẠT' : `Với vận hành hiện tại: ${r0.comp.filter(x => x.ok === false).length} chỉ tiêu vượt`, s: r0.comply ? 5 : 6 }, '', '', { v: r1.comply ? 'Sau khi vận hành theo khuyến cáo: ĐẠT' : `Sau khi vận hành theo khuyến cáo: ${r1.comp.filter(x => x.ok === false).length} chỉ tiêu còn vượt`, s: r1.comply ? 5 : 6 }]);
    if (RP.flags.length) { rows.push([{ v: 'Nhận định vận hành hiện tại', s: 8 }]); RP.flags.forEach(t => rows.push([NOTE('• ' + t)])); }
    rows.push([], [{ v: '3. Điều kiện vận hành khuyến cáo', s: 8 }], [H('Thông số vận hành'), H('Đơn vị'), H('Hiện tại'), H('Khuyến cáo'), H('Lý do')]);
    RP.recs.forEach(x => rows.push([x.label, x.unit, num(x.from), { v: +(+x.to).toPrecision(4), s: 5 }, { v: x.why, s: 10 }]));
    if (A.infra.length) { rows.push([{ v: r1.comply ? 'Lưu ý cải tạo để tăng độ an toàn' : 'Không đạt được chỉ bằng điều chỉnh vận hành – đề xuất cải tạo', s: 8 }]); A.infra.forEach(t => rows.push([NOTE('• ' + t)])); }
    rows.push([], [{ v: '4. Chẩn đoán quá trình', s: 8 }], [H('Thông số'), H('Đơn vị'), H('Hiện tại'), H('Sau khuyến cáo'), H('Tiêu chí'), H('Đánh giá')]);
    RP.diag.forEach(x => rows.push([x.n, x.u, num(x.a), num(x.b), { v: x.crit, s: 10 }, x.ok === null ? '' : ST(x.ok)]));
    rows.push([], [{ v: '5. Hóa chất & điện cấp khí', s: 8 }], [H('Hạng mục'), H('Hiện tại (kg hoặc kWh/ngđ)'), H('Sau khuyến cáo'), H('Chi phí hiện tại (nghìn đ/ngđ)'), H('Sau khuyến cáo')]);
    [...new Set([...RP.c0.items, ...RP.c1.items].map(x => x.name))].forEach(n => { const a = RP.c0.items.find(x => x.name === n), b = RP.c1.items.find(x => x.name === n); rows.push([n, a ? num(a.kg) : '—', b ? num(b.kg) : '—', a ? num(a.cost / 1000) : '—', b ? num(b.cost / 1000) : '—']); });
    rows.push(['Tổng chi phí hóa chất + điện cấp khí', '', '', num(RP.c0.total / 1000), num(RP.c1.total / 1000)]);
    rows.push([], [NOTE('Mô hình trạng thái ổn định M&E 5th: SRT giải từ khối bùn đang giữ (PT 8-20, 8-21), NH₄-N theo PT (7-94) với DO thực đạt theo PT (5-70), khử nitrat SDNR (PT 8-56 – 8-58, Bảng 8-22), P theo VD 8-13, Bảng 8-30, mục 6-4; TSS theo Bảng 8-34 / PT (8-50); clo theo Bảng 12-14. Giá trị là kết quả tính tại thời điểm xuất (không phải công thức sống).')]);
    const sh1 = { name: 'KiemTraVH', cols: [52, 14, 14, 18, 14, 13, 18, 13, 14], rows };
    // hiệu chỉnh
    const CAL = RP.cal, log = o.calLog;
    const r2 = [[T('HIỆU CHỈNH ĐẶC TRƯNG NƯỚC THẢI & HẰNG SỐ ĐỘNG HỌC THEO SỐ LIỆU ĐO THỰC TẾ')], [NOTE('Nội suy ngược: mỗi chỉ tiêu đo hiệu chỉnh một thông số nhạy nhất (chia đôi, lặp 3 lượt). TSS → TSS ra cơ sở; bùn dư → b_H; NH₄-N → μmax,AOB; NO₃-N/TN → rbCOD/bCOD và SDNR₂₀; TP → f_P / rbCOD:P / Al:P; COD → sCOD/COD; BOD → gBOD/gTSS; Coliform → coliform sau sinh học.')], []];
    const QN = k => k === 'PX' ? ['Bùn dư thực tế', 'kg DS/ngđ'] : (DATA.QPARAMS.find(x => x[0] === k) || [k, k, '']).slice(1);
    if (CAL && !CAL.err) {
      r2.push([{ v: `Điều kiện lấy mẫu: T = ${fx(CAL.cond.T)} °C` + (CAL.cond.DO ? `; DO = ${fx(CAL.cond.DO)} mg/L` : '') + (CAL.cond.PX ? `; bùn dư ${fx(CAL.cond.PX, 0)} kg DS/ngđ` : ''), s: 8 }], [],
        [H('Chỉ tiêu'), H('Đơn vị'), H('Đo thực tế'), H('Mô hình – trước hiệu chỉnh'), H('Lệch %'), H('Mô hình – sau hiệu chỉnh'), H('Lệch %')]);
      CAL.cmp.forEach(c => { const q = QN(c.key); r2.push([q[0], q[1], num(c.meas), num(c.pred0), c.meas ? num((c.pred0 / c.meas - 1) * 100) : '', num(c.pred1), c.meas ? num((c.pred1 / c.meas - 1) * 100) : '']); });
      r2.push([], [H('Thông số (tab 4)'), H('Mã'), H('Đơn vị'), H('Giá trị hiện tại'), H('Giá trị hiệu chỉnh'), H('Thay đổi %'), H('Dựa vào chỉ tiêu đo'), H('Ghi chú')]);
      CAL.items.forEach(x => r2.push([x.label, { v: x.k, nobi: true }, x.unit, num(x.from), { v: x.to, s: x.status === 'insens' ? 3 : 5 }, x.from ? num((x.to / x.from - 1) * 100) : '', QN(x.by)[0], { v: OPS.CAL_STATUS[x.status] + (x.warn ? '. ' + x.warn.charAt(0).toUpperCase() + x.warn.slice(1) : ''), s: x.warn ? 6 : 10 }]));
    } else r2.push([NOTE('Chưa có số đo thực tế – nhập ở cột "Đo thực tế" của tab 12.')]);
    if (log) { r2.push([], [{ v: 'Đã áp dụng vào thông số thiết kế: ' + log.date, s: 8 }], [H('Thông số (tab 4)'), H('Mã'), H('Đơn vị'), H('Trước'), H('Sau')]); log.items.forEach(x => r2.push([x.label, { v: x.k, nobi: true }, x.unit || '', num(x.from), num(x.to)])); }
    return [sh1, { name: 'HieuChinh', cols: [46, 14, 16, 16, 16, 12, 22, 60], rows: r2 }];
  }
  function xlsxOps(S) { return buildWorkbook(opsSheets(S), {}); }

  function compareRows(S, list) {
    const L = list[0].R.lim.L;
    return [
      ['Công nghệ sinh học', x => DATA.BIO_SHORT[x.alt.c.bio]],
      ['Chu trình ICEAS (áp dụng / khuyến cáo)', x => x.R.icRec ? x.R.icRec.useName + ' / ' + x.R.icRec.recName : '—'],
      ['Organica / Biopolus: chế độ – số module giá thể', x => x.R.um.bio.fixMod ? (x.R.um.bio.fixed.hyb ? 'Lai (IFAS)' : 'Màng bám thuần') + ' – ' + fx(x.R.um.bio.fixMod.nmod, 0) + ' module' : '—'],
      ['Vị trí hóa lý', x => DATA.optName('chemPos', x.alt.c.chemPos)],
      ['Tách pha hóa lý', x => x.alt.c.chemPos === 'none' ? '—' : DATA.optName('chemSep', x.alt.c.chemSep)],
      ['Khử trùng', x => DATA.optName('disinf', x.alt.c.disinf)],
      ['Thể tích bể sinh học (m³)', x => x.R.kpi.Vbio], ['HRT sinh học (h)', x => x.R.kpi.HRTbio],
      ['Tổng thể tích bể (m³)', x => x.R.kpi.Vt], ['Diện tích công trình (m²)', x => x.R.kpi.At], ['Diện tích khu đất ước tính (m²)', x => x.R.kpi.Asite],
      ['Công suất lắp đặt (kW)', x => x.R.kpi.kWinst], ['Điện năng (kWh/ngđ)', x => x.R.kpi.kWhd], ['Suất điện (kWh/m³)', x => x.R.kpi.kWhm3],
      ['Bùn khô (kg DS/ngđ)', x => x.R.kpi.Mtot], ['Bánh bùn (tấn/ngđ)', x => x.R.kpi.cake], ['Hóa chất (kg/ngđ)', x => x.R.kpi.chemKg],
      ['Chi phí thiết bị (tỷ đ)', x => x.R.cost.eq / 1000], ['Suất đầu tư sơ bộ (tỷ đ)', x => x.R.cost.capex / 1000],
      ['CP điện (đ/m³)', x => x.R.cost.elec / x.R.flow.Q], ['CP hóa chất (đ/m³)', x => x.R.cost.chem / x.R.flow.Q], ['CP nhân công (đ/m³)', x => x.R.cost.labor / x.R.flow.Q],
      ['CP vật tư, bảo dưỡng (đ/m³)', x => x.R.cost.spare / x.R.flow.Q], ['CP xử lý bùn (đ/m³)', x => x.R.cost.sludge / x.R.flow.Q], ['Chi phí vận hành (đ/m³)', x => x.R.cost.perM3],
      ...['COD', 'BOD', 'TSS', 'NH4', 'TN', 'TP', 'Color'].filter(k => L[k] !== undefined).map(k => [`${DATA.QPARAMS.find(q => q[0] === k)[1]} ra (≤ ${fx(L[k])})`, x => x.R.st.st7[k]]),
      ['Đạt tiêu chuẩn xả', x => x.R.kpi.comply ? 'ĐẠT' : 'KHÔNG ĐẠT'], ['Số chỉ tiêu xả chưa đạt', x => x.R.kpi.nOut], ['Số lỗi thiết kế (kiểm tra không đạt)', x => x.R.kpi.nFail], ['Số cảnh báo', x => x.R.kpi.nWarn], ['Số điều chỉnh tự động (R08)', x => (x.R.auto || []).length],
    ];
  }
  function compareSheet(S, list, R) {
    // F16: cột của phương án đang xuất liên kết sống với các sheet của chính file; các phương án khác là giá trị lúc xuất
    const cur = R ? list.findIndex(x => x.R === R || (x.alt.name === R.alt.name && x.alt.c.bio === R.alt.c.bio)) : -1;
    const vx = R && R.bioRes && R.bioRes.VtotX ? R.bioRes.VtotX.replace(/\[(\w+)\.(\w+)\]/g, '{{ref:$1.$2}}') : null;
    const LIVE = {
      'Thể tích bể sinh học (m³)': vx, 'Tổng thể tích bể (m³)': '{{ref:cost.Vt}}', 'Diện tích công trình (m²)': '{{ref:cost.At}}',
      'Công suất lắp đặt (kW)': '{{sp:KWINST}}', 'Điện năng (kWh/ngđ)': '{{sp:KWHD}}', 'Bùn khô (kg DS/ngđ)': '{{ref:sl0.Mtot}}', 'Bánh bùn (tấn/ngđ)': '{{ref:dw.Mc}}',
      'Chi phí thiết bị (tỷ đ)': '{{sp:EQ}}/1000', 'Suất đầu tư sơ bộ (tỷ đ)': '{{ref:cost.capex}}/1000', 'CP điện (đ/m³)': '{{ref:cost.o1}}/{{ref:info.Q}}',
      'CP hóa chất (đ/m³)': '{{ref:cost.o2}}/{{ref:info.Q}}', 'CP nhân công (đ/m³)': '{{ref:cost.o4}}/{{ref:info.Q}}', 'CP vật tư, bảo dưỡng (đ/m³)': '{{ref:cost.o5}}/{{ref:info.Q}}',
      'CP xử lý bùn (đ/m³)': '{{ref:cost.o3}}/{{ref:info.Q}}', 'Chi phí vận hành (đ/m³)': '{{ref:cost.perM3}}',
    };
    const out = [[T('SO SÁNH CÁC PHƯƠNG ÁN CÔNG NGHỆ')], [NOTE(cur >= 0 ? `Cột "${list[cur].alt.name}" là công thức sống liên kết các sheet của file này; các cột khác là giá trị tại thời điểm xuất từ phần mềm.` : 'Giá trị tại thời điểm xuất từ phần mềm.')], [H('Chỉ tiêu'), ...list.map(x => H(x.alt.name))]];
    compareRows(S, list).forEach(([n, f]) => out.push([n, ...list.map((x, i) => { const v = f(x); if (i === cur && LIVE[n] && typeof v === 'number') return { f: LIVE[n], v, s: 3 }; return typeof v === 'number' ? { v, s: 9 } : (v === 'ĐẠT' ? { v, s: 5 } : v === 'KHÔNG ĐẠT' ? { v, s: 6 } : v); })]));
    return { name: 'SoSanhPA', cols: [36, ...list.map(() => 26)], rows: out };
  }
  function xlsxCompare(S, list) { return buildWorkbook([compareSheet(S, list)], {}); }

  return { html, xlsx, xlsxCompare, xlsxOps, compareRows };
})();
