/* AquaDesign VN – báo cáo: thuyết minh, bản tính, tóm tắt, danh mục thiết bị; xuất Word / Excel / XML / CSV */
'use strict';
const REP = {};

REP.repHTML = function (rep, opt = {}) {
  if (!rep) return '';
  const h = [`<section class="rep"><h2>${U.esc(rep.title)}</h2>`];
  let open = false;
  const close = () => { if (open) { h.push('</tbody></table>'); open = false; } };
  for (const r of rep.rows) {
    if (r.h) { close(); h.push(`<h3>${U.esc(r.h)}</h3>`); continue; }
    if (r.f) { close(); h.push(`<p class="f">${U.esc(r.f)}</p>`); continue; }
    if (r.c) {
      if (open !== 'c') { close(); h.push('<table class="rt cmp"><thead><tr><th class="l">Thông số</th><th class="s">Ký hiệu</th><th class="v">Giá trị</th><th class="u">Đơn vị</th><th class="n">Dải khuyến cáo / tiêu chí DWA-A 131</th><th>Đánh giá</th><th class="n">Giải thích</th></tr></thead><tbody>'); open = 'c'; }
      const st = r.ok === true ? '<span class="ok">✔ Trong dải</span>' : r.ok === false ? '<span class="bad">✖ Ngoài dải</span>' : '<span class="ref">tham khảo</span>';
      h.push(`<tr><td class="l">${U.esc(r.l)}</td><td class="s">${U.esc(r.sym || '')}</td><td class="v">${U.esc(U.fmt(r.v, r.d))}</td><td class="u">${U.esc(r.u || '')}</td><td class="n">${U.esc(r.rng || '')}</td><td class="st">${st}</td><td class="n">${U.esc(r.ex || '')}</td></tr>`);
      continue;
    }
    if (open === 'c') close();
    if (!open) { h.push('<table class="rt"><tbody>'); open = true; }
    h.push(`<tr><td class="l">${U.esc(r.l)}</td><td class="s">${U.esc(r.sym || '')}</td><td class="v">${U.esc(U.fmt(r.v, r.d))}</td><td class="u">${U.esc(r.u || '')}</td><td class="n">${U.esc(r.note || '')}</td></tr>`);
  }
  close();
  if (rep.msgs.length && !opt.noMsg) h.push('<ul class="msgs">' + rep.msgs.map(m => `<li class="${m.lvl}">${U.esc(m.t)}</li>`).join('') + '</ul>');
  h.push('</section>');
  return h.join('');
};

// thứ tự bản tính; S.settings.doc[k] = false bỏ mục khỏi báo cáo (Handbook 15.2.3)
REP.KEYS = ['load', 'grit', 'sst', 'sbr', 'iceas', 'ctech', 'mbr', 'bio', 'tank', 'aer', 'rs', 'msig', 'hsg', 'sludge', 'pipes', 'o2'];
REP.on = (S, k) => !(S && S.settings && S.settings.doc && S.settings.doc[k] === false);
REP.order = (R, S) => REP.KEYS.filter(k => R[k] && R[k].d && REP.on(S, k === 'sbr' || k === 'iceas' || k === 'ctech' || k === 'mbr' ? 'line' : k)).map(k => R[k].d);

REP.cover = (S, title) => `<div class="cover"><div class="brand">AquaDesign VN</div><h1>${U.esc(title)}</h1><p class="pn">${U.esc(S.project.name)}</p>
<p>${U.esc(S.project.place || '')}</p><p>Người lập: ${U.esc(S.project.author || '–')} · Ngày: ${U.esc(S.project.date)}</p>
<p class="small">Cơ sở: DWA-A 131 (2016), DWA-M 229-1, DWA-M 210, DWA-M 227, DWA-A 198, DWA-M 368, Metcalf &amp; Eddy (5th), MSIG. Kết quả dùng cho nghiên cứu / thiết kế sơ bộ.</p></div>`;

REP.dimensioning = function (S, R) {
  return REP.cover(S, 'BẢN TÍNH CÔNG NGHỆ') + REP.order(R, S).map(d => REP.repHTML(d)).join('') +
    (REP.on(S, 'masses') ? (R.masses || []).map(m => REP.repHTML(m.d)).join('') : '') + (R.cost && REP.on(S, 'cost') ? REP.repHTML(R.cost.d) : '');
};

REP.short = function (S, R) {
  const rows = ENG.summary(S, R);
  return `<section class="rep"><h2>TÓM TẮT THIẾT KẾ – ${U.esc(S.project.name)}</h2><table class="rt"><tbody>` +
    rows.map(r => `<tr><td class="l">${U.esc(r[0])}</td><td class="v">${U.esc(U.fmt(r[1]))}</td><td class="u">${U.esc(r[2])}</td></tr>`).join('') + '</tbody></table></section>';
};

REP.description = function (S, R) {
  const o = S.opt, L = R.load, B = R.bio, p = [];
  const P = t => p.push('<p>' + t + '</p>');
  p.push(REP.cover(S, 'THUYẾT MINH CÔNG NGHỆ'));
  p.push('<section class="rep"><h2>1. Quy mô và cơ sở thiết kế</h2>');
  P(`Trạm xử lý nước thải được thiết kế cho ${S.load.mode === 'spec' ? '<b>' + U.fmt(S.load.PE, 0) + ' PE</b> (dân số tương đương)' : 'lưu lượng và nồng độ đo đạc'} với lưu lượng ngày Q<sub>d</sub> = ${U.fmt(L.Qd, 0)} m³/d và lưu lượng thiết kế Q<sub>M</sub> = ${U.fmt(L.Qm, 1)} m³/h. Tải lượng thiết kế lấy theo ${o.standard === 'DWA' ? 'DWA-A 198 / A 131 (giá trị riêng 85 %)' : o.standard === 'ME' ? 'Metcalf & Eddy' : 'MSIG (Malaysia)'}.`);
  P(`Tải lượng vào bể sinh học: COD ${U.fmt(L.bio.COD, 0)} kg/d, BOD₅ ${U.fmt(L.bio.BOD, 0)} kg/d, TKN ${U.fmt(L.bio.TKN, 0)} kg/d, P ${U.fmt(L.bio.P, 1)} kg/d. ${L.prim.on ? 'Nước thải qua bể lắng sơ cấp với thời gian lưu ' + S.load.prim.tR + ' h.' : 'Không có lắng sơ cấp.'}${S.load.ind.on ? ' Có nước thải công nghiệp ' + U.fmt(S.load.ind.Qd, 0) + ' m³/d.' : ''}`);
  p.push('</section><section class="rep"><h2>2. Xử lý cơ học</h2>');
  const c = S.comp;
  P([c.inletPS ? 'Nước thải được bơm nâng tại trạm bơm đầu vào' : '', c.screenC ? 'qua song chắn rác thô cơ giới' : '', c.screenF ? 'song chắn rác tinh (rác được ép, thải bỏ)' : '', R.grit ? (R.grit.type === 'aer' ? `bể lắng cát thổi khí ${S.grit.n} ngăn dài ${U.fmt(R.grit.L)} m` + (S.grit.grease ? ' kèm ngăn tách mỡ' : '') : 'bể lắng cát xoáy') : ''].filter(Boolean).join(', ') + '.');
  p.push('</section><section class="rep"><h2>3. Xử lý sinh học</h2>');
  if (B) {
    const dn = o.process === 'ND' ? ENG.DN_NAME[o.dn] : '';
    if (o.line === 'CAS') P(`Bậc sinh học là hệ bùn hoạt tính dòng liên tục ${ENG.PROC_NAME[o.process]}${dn ? ' theo phương pháp ' + dn : ''}${o.stab ? ', có ổn định bùn hiếu khí đồng thời (tuổi bùn ≥ ' + U.fmt(B.tStab, 1) + ' d)' : ''}. Thiết kế theo DWA-A 131 (2016) trên cơ sở COD, nhiệt độ thiết kế ${B.T} °C.`);
    if (o.line === 'SBR') P(`Bậc sinh học là bể phản ứng theo mẻ SBR gồm ${S.sbr.n} bể, chu kỳ ${S.sbr.tZ} h (mưa ${S.sbr.tZrain} h), thiết kế theo DWA-A 131 (2016) và DWA-M 210.`);
    if (o.line === 'MBR') P(`Bậc sinh học là hệ bùn hoạt tính màng (MBR) với nồng độ bùn ${S.mbr.vendor === 'kubota' ? S.mbr.kub.MLSS : S.mbr.TS} kg/m³, tách bùn bằng module màng ${R.mbr ? R.mbr.mod.name : ''}, thiết kế theo DWA-M 227.`);
    if (R.mbr && R.mbr.kub) { const K = R.mbr.kub; P(`Màng Kubota tấm phẳng ngập (CPE, lỗ 0,2 µm): ${K.nU} bộ ${K.mod.name}, tổng ${U.fmt(K.A, 0)} m², thông lượng thực trung bình ${U.fmt(K.Jnet, 1)} l/(m²·h), chu kỳ lọc ${S.mbr.kub.tOn}/${S.mbr.kub.tOff} phút, lấy nước thấm bằng ${{ gravity: 'trọng lực', siphon: 'xi-phông', suction: 'bơm hút' }[S.mbr.kub.mode]}. Khí rửa màng ${U.fmt(K.Qair, 0)} Nm³/h; rửa hóa chất tại chỗ ${S.mbr.kub.cipN} lần/năm bằng NaOCl ${S.mbr.kub.cipC} mg/l.`); }
    if (R.iceas) { const c = R.iceas; P(`Bậc sinh học dùng công nghệ ICEAS (bể phản ứng theo mẻ nạp liên tục, Xylem/Sanitaire) gồm ${c.nb} bể ${U.fmt(c.W)} × ${U.fmt(c.L)} m, mực nước cao nhất ${U.fmt(c.TWL)} m, mực nước đáy ${U.fmt(c.BWL)} m; mỗi bể có vùng pre-react (vách có cửa thông đáy) và vùng phản ứng chính. Chu trình ${c.cycle === 'NIT' ? 'NIT' : c.cycle === 'NDN' ? 'NDN(P)' : 'tự chọn'} ${c.ci.v.slice(0, 4).map(x => U.fmt(x, 0)).join('/')} phút (sục khí/không sục khí/lắng/chắt). Thiết kế theo tuổi bùn: SRT = ${U.fmt(c.SRT, 1)} d (tỷ lệ thời gian hiếu khí ${U.fmt(c.fA, 2)}), MLSS tại mực nước đáy ${U.fmt(c.MLSSb, 0)} mg/l, F/M kiểm tra ${U.fmt(c.FM, 3)}. Nước trong được chắt bằng decanter dài ${U.fmt(c.DL)} m mỗi bể.`); }
    if (R.ctech) { const c = R.ctech; P(`Bậc sinh học dùng công nghệ C-Tech (bùn hoạt tính theo chu kỳ, SFC) gồm ${c.N} bể ${U.fmt(c.L)} × ${U.fmt(c.Bw)} m, TWL ${U.fmt(c.TWL)} m, BWL ${U.fmt(c.BWL)} m; chu kỳ ${U.fmt(c.TC)} h (cấp nước + sục khí ${S.ct.TFA} h, lắng ${S.ct.TS} h, gạn ${S.ct.TD} h), ${U.fmt(c.nF)} bể nhận nước đồng thời. Mỗi bể có selector ${S.ct.nsel} ngăn (${U.fmt(c.Vsel, 0)} m³) nhận bùn tuần hoàn ${U.fmt(c.QR)} m³/h. MLSS tại TWL ${U.fmt(c.MLSS, 0)} mg/l, tuổi bùn ${U.fmt(c.tSS, 1)} d.`); }
    P(`Tuổi bùn thiết kế ${U.fmt(B.tSS, 1)} d (hiếu khí ${U.fmt(B.tAer, 1)} d), sản lượng bùn dư ${U.fmt(B.US, 0)} kg TS/d.${o.process === 'ND' ? ' Tỷ lệ thể tích khử nitrat V<sub>D</sub>/V<sub>BB</sub> = ' + U.fmt(B.r, 2) + '.' : ''}${B.Cdos > 0 ? ' Bổ sung nguồn carbon ' + B.ce.name + ' ' + U.fmt(B.Cdos_kg, 0) + ' kg/d.' : ''}`);
    if (R.tank) P(`Bể aerotank: ${R.tank.n} ${ENG.TANK_NAME[R.tank.type]}, ${R.tank.type === 'rect' ? U.fmt(R.tank.B) + ' × ' + U.fmt(R.tank.L) + ' m' : R.tank.type === 'ditch' ? U.fmt(R.tank.W) + ' × ' + U.fmt(R.tank.L) + ' m' : 'D = ' + U.fmt(R.tank.D) + ' m'}, sâu ${U.fmt(R.tank.H)} m, tổng thể tích ${U.fmt(R.tank.V, 0)} m³.${R.tank.an ? ' Trước aerotank là bể kỵ khí ' + U.fmt(R.tank.an.V, 0) + ' m³ cho khử P sinh học.' : ''}${R.tank.sel ? ' Selector hiếu khí ' + U.fmt(R.tank.sel.V, 0) + ' m³ chống bùn khó lắng.' : ''}`);
    if (R.sbr) P(`Thể tích mỗi bể SBR ${U.fmt(R.sbr.V1, 0)} m³ (${R.sbr.D ? 'D = ' + U.fmt(R.sbr.D) : U.fmt(R.sbr.Bw) + ' × ' + U.fmt(R.sbr.L)} m, H = ${S.sbr.H} m), tỷ lệ trao đổi f<sub>A</sub> = ${U.fmt(R.sbr.fA, 2)}; nước trong được xả bằng decanter ${U.fmt(R.sbr.Qdec, 0)} m³/h.`);
    if (R.aer) {
      const a = R.aer;
      if (a.blow) P(`Cấp khí bằng hệ phân phối khí ${a.diff.type.name} (${U.fmt(a.diff.n, 0)} ${a.diff.type.type === 'tube' ? 'm' : 'cái'}), lưu lượng khí ${U.fmt(a.QL, 0)} Nm³/h, SOTR ${U.fmt(a.SOTR, 0)} kg O₂/h theo DWA-M 229-1. Khí do ${a.blow.n} + ${a.blow.sb} máy thổi ${a.blow.item ? a.blow.item.name : ''} cấp, áp lực ${U.fmt(a.blow.dp, 0)} mbar.`);
      if (a.surf) P(`Cấp khí bằng ${a.surf.n} máy sục khí bề mặt ${a.surf.item.name}.`);
      if (a.mix) P(`Khuấy trộn bằng ${a.mix.nTot} máy khuấy chìm ${a.mix.item ? a.mix.item.name : ''}.`);
    }
    if (B.Fe > 0) P(`Khử phốt pho hóa học bằng kết tủa đồng thời với ${B.prec.name}, liều ${U.fmt(B.precL, 0)} l/d (β = ${S.bio.beta}).`);
  }
  if (R.sst) {
    p.push('</section><section class="rep"><h2>4. Bể lắng thứ cấp</h2>');
    P(`Bùn hoạt tính được tách tại ${R.sst.n} bể lắng II ${S.sst.shape === 'circ' ? 'tròn D = ' + U.fmt(R.sst.D) + ' m' : 'chữ nhật ' + U.fmt(R.sst.B) + ' × ' + U.fmt(R.sst.L) + ' m'} dòng ${S.sst.flow === 'vt' ? 'đứng' : 'ngang'}, chiều sâu ${U.fmt(R.sst.H)} m (tại 2/3 đường dòng), tải trọng q<sub>A</sub> = ${U.fmt(R.sst.qA, 2)} m/h, q<sub>SV</sub> = ${U.fmt(R.sst.qSV, 0)} l/(m²·h), ISV = ${S.sst.ISV} ml/g.`);
  }
  if (R.rs && R.rs.QRS > 0) P(`Bùn tuần hoàn ${U.fmt(R.rs.QRS, 0)} m³/h được bơm bằng ${R.rs.n} ${R.rs.type === 'air' ? 'bơm khí nâng' : R.rs.type === 'screw' ? 'bơm trục vít' : 'bơm ly tâm'}${R.rs.rz ? '; tuần hoàn nội ' + U.fmt(R.rs.rz.Q, 0) + ' m³/h bằng bơm chân vịt' : ''}.`);
  if (R.sludge) {
    p.push('</section><section class="rep"><h2>5. Xử lý bùn</h2>');
    const sl = R.sludge, st = [];
    if (sl.thick) st.push('nén trọng lực (' + U.fmt(sl.thick.V, 0) + ' m³)');
    if (sl.dig) st.push('phân hủy kỵ khí ' + U.fmt(sl.dig.V, 0) + ' m³, khí sinh học ' + U.fmt(sl.dig.gas, 0) + ' m³/d');
    if (sl.aerob) st.push((sl.aerob.thermo ? 'ổn định hiếu khí ưa nhiệt ' : 'ổn định hiếu khí riêng ') + U.fmt(sl.aerob.V, 0) + ' m³');
    if (sl.tank) st.push('bể chứa bùn ' + U.fmt(sl.tank.V, 0) + ' m³ (' + S.sludge.tank.t + ' d)');
    if (sl.dew) st.push('tách nước cơ học đến ' + S.sludge.dew.TS + ' % TS');
    P('Bùn dư' + (sl.PS ? ' và bùn sơ cấp' : '') + ' được xử lý: ' + (st.join('; ') || 'thải bỏ trực tiếp') + '. Lượng bùn thải bỏ ≈ ' + U.fmt(sl.disposal, 0) + ' t/năm (ướt).');
  }
  if (R.cost) { p.push('</section><section class="rep"><h2>6. Chi phí vận hành</h2>'); P(`Tổng điện năng ≈ ${U.fmt(R.cost.kWha, 0)} kWh/năm. Tổng chi phí vận hành ≈ ${U.fmt(R.cost.total, 0)} ${S.cost.currency}/năm (${U.fmt(R.cost.total / (S.load.PE || 1), 0)} ${S.cost.currency}/PE·năm).`); }
  p.push('</section>');
  return p.join('');
};

REP.machinesHTML = function (S, R) {
  const m = R.mach; if (!m) return '';
  return `<section class="rep"><h2>DANH MỤC THIẾT BỊ</h2><table class="grid"><thead><tr><th>Mã</th><th>Thiết bị</th><th>SL làm việc</th><th>Dự phòng</th><th>Thông số</th><th>Động cơ (kW)</th><th>Nguồn</th></tr></thead><tbody>` +
    m.M.map(r => `<tr><td>${r.tag}</td><td>${U.esc(r.name)}</td><td class="c">${r.n}</td><td class="c">${r.sb}</td><td>${U.esc(r.spec)}</td><td class="c">${r.kW ? U.fmt(r.kW) : ''}</td><td>${r.src}</td></tr>`).join('') +
    `</tbody></table><h2>DANH MỤC ĐIỂM ĐO</h2><table class="grid"><thead><tr><th>Mã</th><th>Đại lượng</th><th>Vị trí</th></tr></thead><tbody>` +
    m.P.map(r => `<tr><td>${r.tag}</td><td>${U.esc(r.name)}</td><td>${U.esc(r.loc)}</td></tr>`).join('') + '</tbody></table></section>';
};

// danh mục kiểu AQUA DESIGNER (mỗi thiết bị một dòng, mã đặt hàng M-…/MES-…)
REP.machRowsAD = R => [['Nr', 'Công đoạn', 'Mã đặt hàng', 'Tên', 'Loại / thông số', 'Động cơ [kW]', 'Công suất tiêu thụ [kW]', 'Năng lực', 'Dự phòng']]
  .concat((R.mach.MI || []).map(r => [r.nr, r.stage, r.ord, r.name, r.type, r.kW || '', r.kWc || '', r.cap, r.sb ? 'x' : '']));
REP.measRowsAD = R => [['Nr', 'Công đoạn', 'Mã đặt hàng', 'Điểm đo']].concat((R.mach.PI || []).map(p => [p.nr, p.stage, p.ord, p.what]));
REP.machinesADHTML = function (S, R) {
  const m = R.mach; if (!m || !m.MI) return '';
  const tb = (rows, cls) => '<table class="grid"><thead><tr>' + rows[0].map(h => `<th>${U.esc(h)}</th>`).join('') + '</tr></thead><tbody>' +
    rows.slice(1).map(r => '<tr>' + r.map((v, i) => `<td${cls[i] ? ' class="c"' : ''}>${U.esc(typeof v === 'number' ? U.fmt(v, i === 0 ? 0 : undefined) : v)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
  const kW = m.MI.reduce((s, r) => s + (r.sb ? 0 : r.kW || 0), 0);
  return `<section class="rep"><h2>DANH MỤC MÁY (kiểu AQUA DESIGNER)</h2><p class="note">Mỗi thiết bị một dòng; mã đặt hàng M-&lt;công đoạn&gt;-&lt;loại&gt;.&lt;bể&gt;.&lt;số&gt; dùng chung cho danh mục, danh mục điểm đo và sơ đồ công nghệ. Tổng công suất lắp đặt (không tính dự phòng) ≈ ${U.fmt(kW, 1)} kW.</p>${tb(REP.machRowsAD(R), [1, 0, 0, 0, 0, 1, 1, 1, 1])}
  <h2>DANH MỤC ĐIỂM ĐO</h2>${tb(REP.measRowsAD(R), [1, 0, 0, 0])}</section>`;
};

REP.css = `body{font:11pt "Segoe UI",Arial,sans-serif;color:#111;margin:18mm}
h1{font-size:20pt;margin:0 0 6mm} h2{font-size:13pt;border-bottom:1.5px solid #333;padding-bottom:2px;margin:9mm 0 3mm} h3{font-size:11pt;margin:5mm 0 2mm;color:#234}
table{border-collapse:collapse;width:100%} .rt td{padding:2px 6px;border-bottom:1px solid #ddd;vertical-align:top}
.rt .s{font-style:italic;color:#345;white-space:nowrap} .rt .v{text-align:right;font-weight:600;white-space:nowrap} .rt .u{white-space:nowrap;color:#444} .rt .n{color:#555;font-size:9.5pt}
.grid th,.grid td{border:1px solid #999;padding:3px 5px;font-size:10pt} .grid th{background:#e8eef5} .c{text-align:center}
.msgs li.warn{color:#9a5b00} .msgs li.err{color:#b00020} .msgs li.info{color:#246}
.cover{page-break-after:always;padding-top:40mm} .cover .brand{font-weight:700;color:#1d5fa8;letter-spacing:.05em} .cover .pn{font-size:15pt;font-weight:600} .small{font-size:9pt;color:#555}
.dwg{width:100%;max-height:240mm;border:1px solid #ccc} .f{font-style:italic;color:#444}
@media print{body{margin:12mm} section{page-break-inside:auto} h2{page-break-after:avoid}}`;

REP.wrap = (title, body) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${U.esc(title)}</title><style>${REP.css}</style></head><body>${body}</body></html>`;

REP.print = function (title, body) {
  const w = window.open('', '_blank');
  if (!w) { alert('Trình duyệt chặn cửa sổ in – cho phép pop-up.'); return; }
  w.document.write(REP.wrap(title, body.replace(/var\(--ink\)/g, '#111')));
  w.document.close();
  setTimeout(() => w.print(), 400);
};

REP.word = function (title, body, fname) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${U.esc(title)}</title><style>${REP.css.replace(/margin:18mm/, 'margin:0')}</style></head><body>${body.replace(/var\(--ink\)/g, '#111')}</body></html>`;
  U.download(fname || 'baocao.doc', '﻿' + html, 'application/msword');
};

// Excel 2003 XML (SpreadsheetML) – nhiều sheet, không cần thư viện
REP.xls = function (sheets, fname) {
  const x = s => U.esc(String(s));
  const cell = v => (typeof v === 'number' && isFinite(v)) ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${x(v == null ? '' : v)}</Data></Cell>`;
  let o = `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E8EEF5" ss:Pattern="Solid"/></Style></Styles>\n`;
  for (const sh of sheets) {
    o += `<Worksheet ss:Name="${x(sh.name.slice(0, 31))}"><Table>\n`;
    sh.rows.forEach((r, i) => { o += (i === 0 && sh.header ? '<Row ss:StyleID="h">' : '<Row>') + r.map(cell).join('') + '</Row>\n'; });
    o += '</Table></Worksheet>\n';
  }
  o += '</Workbook>';
  U.download(fname, o, 'application/vnd.ms-excel');
};

REP.calcSheets = function (S, R) {
  const sh = [];
  for (const d of REP.order(R, S)) {
    const rows = [['Hạng mục', 'Ký hiệu', 'Giá trị', 'Đơn vị', 'Ghi chú / công thức']];
    for (const r of d.rows) rows.push(r.h ? ['== ' + r.h + ' =='] : r.f ? [r.f] : r.c ? [r.l, r.sym || '', typeof r.v === 'number' ? +r.v.toPrecision(6) : r.v, r.u || '', 'Khuyến cáo: ' + (r.rng || '') + ' → ' + (r.ok === true ? 'Trong dải' : r.ok === false ? 'NGOÀI DẢI' : 'tham khảo') + (r.ex ? ' · ' + r.ex : '')] : [r.l, r.sym || '', typeof r.v === 'number' ? +r.v.toPrecision(6) : r.v, r.u || '', r.note || '']);
    for (const m of d.msgs) rows.push(['[' + m.lvl + '] ' + m.t]);
    sh.push({ name: d.title.replace(/[\\/?*\[\]:]/g, ''), rows, header: true });
  }
  return sh;
};

REP.machXML = function (S, R) {
  const m = R.mach, x = s => U.esc(String(s));
  let o = `<?xml version="1.0" encoding="UTF-8"?>\n<plant name="${x(S.project.name)}" generator="AquaDesign VN" date="${S.project.date}">\n <machines>\n`;
  for (const r of m.M) o += `  <machine tag="${x(r.tag)}" name="${x(r.name)}" duty="${r.n}" standby="${r.sb}" motor_kW="${r.kW}" spec="${x(r.spec)}"/>\n`;
  o += ' </machines>\n <instruments>\n';
  for (const r of m.P) o += `  <instrument tag="${x(r.tag)}" name="${x(r.name)}" location="${x(r.loc)}"/>\n`;
  return o + ' </instruments>\n</plant>\n';
};

REP.csv = rows => '﻿' + rows.map(r => r.map(v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
