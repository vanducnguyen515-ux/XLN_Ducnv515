/* =====================================================================
   LẬP BỘ BẢN VẼ CÔNG NGHỆ (khổ A1 841 × 594 mm)
   LT00 danh mục & ghi chú · LT01 tổng mặt bằng · LT02 PFD & cân bằng
   LT03 trắc dọc thủy lực · LT04… mặt bằng – mặt cắt công trình · cuối: danh mục thiết bị
   ===================================================================== */
'use strict';

const SHEETS = (() => {
  const W = 841, H = 594, XR = 646, AX0 = 25, AX1 = 638, AY0 = 14, AY1 = 584;
  const SCALES = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];
  const pickScale = need => SCALES.find(s => s >= need) || 2000;
  const f2 = v => fx(v);
  const el = v => (v >= 0 ? '+' : '') + v.toFixed(3).replace('.', ',');
  const WATER = { layer: 'NUOC', w: 0.5 }, SLUDGE = { layer: 'BUN', w: 0.5 }, AIR = { layer: 'KHI', w: 0.4 }, CHEM = { layer: 'HOACHAT', w: 0.35 };
  const WALL = { layer: 'BE', w: 0.5 }, THIN = { layer: 'BE', w: 0.25 };

  /* ---------------- khung & khung tên ---------------- */
  function frame(sh, S, info) {
    sh.rect(10, 10, W - 20, H - 20, { layer: 'KHUNG', w: 0.7 });
    sh.line(XR, 10, XR, H - 10, { layer: 'KHUNG', w: 0.5 });
    const x = XR, w = W - 10 - XR, P = S.project;
    let y = H - 10;
    const box = (hh) => { y -= hh; sh.line(x, y, x + w, y, { layer: 'KHUNG', w: 0.35 }); return y; };
    // số hiệu
    let yy = box(18);
    sh.text(x + 2, yy + 4, 'SỐ HIỆU BẢN VẼ', { h: 1.8 }); sh.text(x + w - 28, yy + 4, 'LẦN SỬA', { h: 1.8 });
    sh.line(x + w - 30, yy, x + w - 30, yy + 18, { layer: 'KHUNG', w: 0.25 });
    sh.text(x + (w - 30) / 2, yy + 12, info.code, { h: 5, an: 'middle', vb: 'middle', bold: true });
    sh.text(x + w - 15, yy + 12, '0', { h: 4.5, an: 'middle', vb: 'middle' });
    yy = box(14);
    [['TỈ LỆ', info.scale || '—'], ['KHỔ GIẤY', 'A1'], ['TỜ', info.no != null && info.total != null ? info.no + '/' + info.total : '—']].forEach(([a, b], i) => {
      const xx = x + i * w / 3; if (i) sh.line(xx, yy, xx, yy + 14, { layer: 'KHUNG', w: 0.25 });
      sh.text(xx + 2, yy + 4, a, { h: 1.8 }); sh.text(xx + 2, yy + 10.5, b, { h: 3 });
    });
    yy = box(36);
    sh.text(x + 2, yy + 4, 'TÊN BẢN VẼ', { h: 1.8 });
    DRW.wrap(info.title, w - 10, 4.2).slice(0, 3).forEach((ln, i, a) => sh.text(x + w / 2, yy + 20 - (a.length - 1) * 3.5 + i * 7, ln, { h: 4.2, an: 'middle', vb: 'middle', bold: true }));
    yy = box(34);
    [['THIẾT KẾ', P.designer], ['KIỂM TRA', P.checker], ['CHỦ TRÌ', ''], ['DUYỆT', '']].forEach(([a, b], i) => {
      const ry = yy + i * 8.5; if (i) sh.line(x, ry, x + w, ry, { layer: 'KHUNG', w: 0.18 });
      sh.text(x + 2, ry + 5.5, a, { h: 2.2 }); sh.text(x + 45, ry + 5.5, b || '', { h: 2.4 });
    });
    sh.line(x + 42, yy, x + 42, yy + 34, { layer: 'KHUNG', w: 0.18 }); sh.line(x + 140, yy, x + 140, yy + 34, { layer: 'KHUNG', w: 0.18 });
    sh.text(x + 142, yy + 5.5, 'CHỮ KÝ', { h: 1.8 });
    yy = box(18);
    sh.text(x + 2, yy + 4, 'GIAI ĐOẠN / MỤC ĐÍCH', { h: 1.8 });
    sh.text(x + 2, yy + 9, P.stage || '', { h: 2.8 }); sh.text(x + 2, yy + 15.2, 'Ngày lập: ' + (P.date || ''), { h: 2.2 });
    yy = box(22);
    sh.text(x + 2, yy + 4, 'HẠNG MỤC', { h: 1.8 });
    sh.text(x + 2, yy + 9, `TRẠM XLNT ${fx(S.input.Q)} m³/ngđ – DÂY CHUYỀN CÔNG NGHỆ`, { h: 2.8 });
    { const al = DRW.wrap(info.altName || '', w - 4, 2.2); sh.text(x + 2, yy + 15.5, al[0] + (al.length > 1 ? '…' : ''), { h: 2.2, en: BI.en(info.altName || '') }); }
    yy = box(24);
    sh.text(x + 2, yy + 4, 'DỰ ÁN', { h: 1.8 });
    DRW.wrap(P.name || '', w - 4, 3).slice(0, 2).forEach((ln, i) => sh.text(x + 2, yy + 10 + i * 4.5, ln, { h: 3 }));
    sh.text(x + 2, yy + 21, P.location || '', { h: 2.4 });
    yy = box(16);
    sh.text(x + 2, yy + 4, 'LẦN SỬA   NGÀY          NỘI DUNG', { h: 1.8 });
    sh.text(x + 4, yy + 10, '0', { h: 2.2 }); sh.text(x + 16, yy + 10, P.date || '', { h: 2.2 }); sh.text(x + 42, yy + 10, 'Phát hành lần đầu', { h: 2.2 });
    // ghi chú
    sh.text(x + 3, 18, 'GHI CHÚ', { h: 3, bold: true });
    let ny = 25;
    (info.notes || []).forEach((n, i) => { ny += sh.para(x + 3, ny, (i + 1) + '. ' + n, w - 6, { h: 2.1 }) + 1.2; });
  }
  function sheetTitle(sh, t, sub, x, y) {
    sh.text(x, y, t, { h: 5, bold: true });
    if (sub) sh.text(x, y + 9, sub, { h: 2.6 });
  }
  const commonNotes = (S) => [
    'Kích thước ghi bằng mm; cao độ ghi bằng m theo hệ TƯƠNG ĐỐI: cốt sân hoàn thiện ±0,000; đáy bể sinh học −1,500 (giả định, hiệu chỉnh theo hồ sơ san nền và khảo sát địa chất).',
    'Kích thước công nghệ lấy từ bản tính chi tiết (M&E 5th; Sanitaire ICEAS 202); chiều dày thành/đáy là sơ bộ, theo thiết kế kết cấu riêng.',
    'Thiết bị chọn sơ bộ theo công suất; kích thước lắp đặt theo hồ sơ nhà cung cấp được phê duyệt.',
  ];

  /* ---------------- LT00: danh mục & ghi chú ---------------- */
  function cover(S, R, list) {
    const sh = new DRW.Sheet(W, H);
    sheetTitle(sh, 'DANH MỤC BẢN VẼ', null, AX0, 26);
    const rows = [['STT', 'SỐ HIỆU', 'TÊN BẢN VẼ']].concat(list.map((s, i) => [i + 1, s.code, s.title]));
    sh.table(AX0, 32, [12, 30, 150], rows, { rh: 6, h: 2.3 });
    sheetTitle(sh, 'GHI CHÚ CHUNG', null, 240, 26);
    const alt = R.alt;
    const notes = [
      `Bản vẽ công nghệ trạm XLNT công suất ${fx(S.input.Q)} m³/ngđ (${S.input.nMod} mô đun), phương án: ${alt.name}.`,
      `Dây chuyền: ${R.units.filter(u => ['nuoc', 'hoaly', 'sinhhoc'].includes(u.grp)).map(u => u.name.split(' – ')[0].split(' (')[0]).join(' → ')} → xả.`,
      `Nước thải đầu vào: COD ${fx(S.input.q.COD)}, BOD₅ ${fx(S.input.q.BOD)}, TSS ${fx(S.input.q.TSS)}, TN ${fx(S.input.q.TN)}, TP ${fx(S.input.q.TP)} mg/L; nước sau xử lý đạt ${R.lim.name}${R.lim.kq ? ` × Kq ${fx(R.lim.kq)} × Kf ${fx(R.lim.kf)}` : ''}.`,
      'Hệ số không điều hòa k_max = ' + fx(S.input.k_max || S.input.kmax) + '; nhiệt độ thiết kế sinh học T = ' + S.input.Tmin + ' °C.',
      ...commonNotes(S),
      'Vật liệu tiếp xúc nước thải: SS304/SS316, HDPE, uPVC; kết cấu BTCT chống thấm, sơn epoxy vùng tiếp xúc khí.',
      'Vận hành tự động PLC/SCADA tại nhà điều hành; mỗi thiết bị có chế độ Tay/Tự động tại tủ.',
    ];
    let y = 34; notes.forEach((n, i) => { y += sh.para(240, y, (i + 1) + '. ' + n, 390, { h: 2.4 }) + 1.5; });
    // cơ sở thiết kế
    y += 6; sheetTitle(sh, 'CƠ SỞ THIẾT KẾ – CHẤT LƯỢNG NƯỚC', null, 240, y); y += 5;
    const st = R.st, L = R.lim.L;
    const qrows = [['CHỈ TIÊU', 'ĐƠN VỊ', 'VÀO', 'SAU SINH HỌC', 'SAU XỬ LÝ', 'GIỚI HẠN', 'ĐÁNH GIÁ']];
    for (const [k, nm, un] of DATA.QPARAMS) {
      if (k === 'Alk') continue;
      const lim = L[k];
      qrows.push([nm, un, fxn(st.st1[k]), fxn(st.st5[k]), fxn(st.st7[k]), lim !== undefined ? fxn(lim) : '—', lim !== undefined ? (st.st7[k] <= lim + 1e-9 ? 'ĐẠT' : 'KHÔNG ĐẠT') : '—']);
    }
    sh.table(240, y, [55, 25, 28, 30, 30, 28, 28], qrows, { rh: 5.5, h: 2.2, align: [0, 'middle', 'end', 'end', 'end', 'end', 'middle'] });
    // ký hiệu
    const ly = 440; sheetTitle(sh, 'KÝ HIỆU', null, AX0, ly);
    const leg = [['BE', 'Kết cấu BTCT / thành bể'], ['NUOC', 'Ống / kênh nước thải – nước sau xử lý'], ['KHI', 'Ống khí'], ['BUN', 'Ống bùn / cát / rác'], ['HOACHAT', 'Ống hóa chất'], ['MUCNUOC', 'Mực nước'], ['DIM', 'Đường kích thước'], ['TRUC', 'Đường cắt']];
    leg.forEach(([l, t], i) => { const yy = ly + 8 + i * 6; sh.line(AX0, yy, AX0 + 22, yy, { layer: l, w: l === 'BE' ? 0.6 : 0.45, dash: l === 'TRUC' ? '6 2 1 2' : null }); sh.text(AX0 + 26, yy + 1, t, { h: 2.3 }); });
    const vy = ly + 8; const vx = 130;
    [['▽', 'Cao độ mực nước'], ['M', 'Máy khuấy chìm'], ['P', 'Bơm chìm / bơm cạn'], ['B', 'Máy thổi khí'], ['⊗', 'Van cổng / van chặn']].forEach(([sym, t], i) => {
      const yy = vy + i * 6; sh.circle(vx + 3, yy, 2.2, { layer: 'THIETBI', w: 0.3 }); sh.text(vx + 3, yy, sym, { h: 2, an: 'middle', vb: 'middle', layer: 'THIETBI' }); sh.text(vx + 9, yy + 1, t, { h: 2.3 });
    });
    frame(sh, S, { title: 'DANH MỤC BẢN VẼ – GHI CHÚ CHUNG', code: list[0].code, notes: ['Xem ghi chú chung trên bản vẽ.'] , altName: R.alt.name });
    return sh;
  }
  const fxn = v => (v === undefined || v === null || isNaN(v)) ? '—' : (Math.abs(v) >= 1e4 ? v.toExponential(1).replace('.', ',') : fx(v));

  /* ---------------- LT02: Sơ đồ công nghệ PFD ---------------- */
  const SHORT = {
    scr: 'SONG CHẮN RÁC THÔ', sump: 'BỂ GOM + BƠM NÂNG', ctdv: 'LƯỚI TINH + LẮNG CÁT', eq: 'BỂ ĐIỀU HÒA',
    mh: 'KẾT TỦA HYDROXIT KIM LOẠI', tdn: 'KHỬ NITRAT BẬC 3', disp: 'BÃI THẤM ÁP LỰC',
    hl: 'pH – KEO TỤ – TẠO BÔNG', hl3: 'pH – KEO TỤ – TẠO BÔNG (BẬC 3)', clar: 'BỂ LẮNG THỨ CẤP', filt: 'LỌC BẬC 3', dis: 'KHỬ TRÙNG',
    thc: 'BỂ NÉN BÙN HÓA LÝ', thb: 'BỂ NÉN BÙN SINH HỌC', gbt: 'CÔ ĐẶC BÙN GBT', sst: 'BỂ CHỨA – TRỘN BÙN', dw: 'KHỬ NƯỚC BÙN',
  };
  function shortName(u, R) {
    if (SHORT[u.id]) return u.id === 'dis' ? (R.alt.c.disinf === 'uv' ? 'KHỬ TRÙNG UV' : 'TIẾP XÚC KHỬ TRÙNG NaOCl') : u.id === 'dw' ? DATA.optName('dewater', R.alt.c.dewater).toUpperCase() : SHORT[u.id];
    if (u.id === 'sep' || u.id === 'sep3') return ({ clarifier: 'BỂ LẮNG HÓA LÝ', lamella: 'LẮNG LAMELLA', daf: 'TUYỂN NỔI DAF' })[R.alt.c.chemSep] + (u.id === 'sep3' ? ' (BẬC 3)' : '');
    if (u.id === 'bio') return R.alt.c.bio === 'LAG' ? 'HỒ SINH HỌC' : R.alt.c.bio === 'TF' ? 'LỌC SINH HỌC NHỎ GIỌT' : 'BỂ ' + DATA.BIO_SHORT[R.alt.c.bio].toUpperCase();
    if (u.id === 'ana') return 'BỂ YẾM KHÍ ' + DATA.ANA[R.alt.c.anaer].short.toUpperCase();
    if (u.id === 'aop') return 'OXY HÓA BẬC 3 – ' + DATA.AOP[R.alt.c.aop].short;
    if (u.id === 'thm') return ({ daf: 'CÔ ĐẶC DAF', centrifuge: 'LY TÂM CÔ ĐẶC', drum: 'CÔ ĐẶC TRỐNG QUAY' })[R.alt.c.thick] || 'CÔ ĐẶC BÙN';
    if (u.id === 'stab') return ({ mad: 'PHÂN HỦY KỴ KHÍ 35 °C', tad: 'PHÂN HỦY KỴ KHÍ 55 °C', aed: 'PHÂN HỦY HIẾU KHÍ', lime: 'ỔN ĐỊNH VÔI' })[R.alt.c.stab] || 'ỔN ĐỊNH BÙN';
    if (u.id === 'dry') return R.alt.c.dry === 'solar' ? 'SẤY MẶT TRỜI' : 'SẤY NHIỆT';
    return u.name.toUpperCase();
  }
  function pfd(S, R) {
    const sh = new DRW.Sheet(W, H), um = R.um, c = R.alt.c;
    sheetTitle(sh, `SƠ ĐỒ CÔNG NGHỆ TOÀN TRẠM – ${fx(S.input.Q)} m³/ngđ`, R.alt.name, AX0, 24);
    const bw = 62, bh = 32, x0 = 28;
    const rowA = ['in', 'scr', 'sump', 'ctdv', 'eq', 'hl', 'sep', 'mh'].filter(k => k === 'in' || um[k]);
    const rowB = ['ana', 'bio', 'clar', 'tdn', 'hl3', 'sep3', 'aop', 'filt', 'dis', 'disp', 'out'].filter(k => k === 'out' || um[k]);
    // khoảng cách khối tự co để dây chuyền dài (yếm khí, hóa lý bậc 3, oxy hóa, lọc) vẫn nằm trong khung bản vẽ
    const pitch = Math.min(84, (AX1 - 8 - x0 - bw) / Math.max(rowA.length - 1, rowB.length - 0.5));
    const yA = 44, yB = 112, yC = 184, yD = 236;
    const pos = {};
    const node = (k, x, y, w, h, title, lines, layer) => {
      sh.rect(x, y, w, h, { layer: layer || 'BE', w: 0.45 });
      sh.text(x + w / 2, y + 6.5, title, { h: 2.6, an: 'middle', bold: true });
      (lines || []).slice(0, 4).forEach((ln, i) => sh.text(x + w / 2, y + 12.5 + i * 4.3, ln, { h: 2.05, an: 'middle' }));
      pos[k] = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    };
    const info = u => { const L = []; DRW.wrap(u.dims || '', bw - 4, 2.05).slice(0, 3).forEach(x => L.push(x)); if (u.hrt) L.push('t = ' + u.hrt); return L; };
    rowA.forEach((k, i) => {
      const x = x0 + i * pitch;
      if (k === 'in') node(k, x, yA, bw, bh, 'NƯỚC THẢI VÀO', [`Q = ${fx(S.input.Q)} m³/ngđ`, `Q max,h = ${fx(R.flow.Qmaxh)} m³/h`, `COD ${fx(S.input.q.COD)} · BOD ${fx(S.input.q.BOD)} mg/L`], 'NUOC');
      else node(k, x, yA, bw, bh, shortName(um[k], R), info(um[k]));
    });
    rowB.forEach((k, i) => {
      const x = x0 + pitch / 2 + i * pitch;
      if (k === 'out') node(k, x, yB, bw, bh, 'XẢ NGUỒN TIẾP NHẬN', [R.lim.name.replace('/BTNMT', ''), R.compliance.every(z => z.ok) ? 'Đạt giới hạn xả' : 'CHƯA đạt – xem bản tính'], 'NUOC');
      else node(k, x, yB, k === 'bio' ? bw : bw, bh, shortName(um[k], R), info(um[k]));
    });
    // dòng nước
    const conn = (a, b) => sh.arrow(pos[a].x + pos[a].w, pos[a].cy, pos[b].x, pos[b].cy, WATER, 3);
    for (let i = 0; i < rowA.length - 1; i++) conn(rowA[i], rowA[i + 1]);
    for (let i = 0; i < rowB.length - 1; i++) conn(rowB[i], rowB[i + 1]);
    const la = pos[rowA[rowA.length - 1]], fb = pos[rowB[0]];
    const gy = (yA + bh + yB) / 2 + 3;
    sh.polyArrow([[la.cx, la.y + la.h], [la.cx, gy], [fb.cx, gy], [fb.cx, fb.y]], WATER, 3);
    // số dòng
    const tag = (x, y, n) => { sh.circle(x, y, 2.6, { layer: 'DUONG', w: 0.3, fill: '#fff6a8' }); sh.text(x, y, String(n), { h: 2.2, an: 'middle', vb: 'middle', bold: true }); };
    tag(pos.in.x + bw + 6, pos.in.cy - 4, 1);
    const afterPre = pos[um.eq ? 'eq' : 'ctdv']; tag(afterPre.x + bw + 6, afterPre.cy - 4, 2);
    tag(fb.cx - 5, fb.y - 5, 3);
    const lastBio = pos[um.clar ? 'clar' : 'bio']; tag(lastBio.x + bw + 6, lastBio.cy - 4, 4);
    tag(pos.out.x - 6, pos.out.cy - 4, 5);
    // khối phụ trợ
    const util = [];
    if (um.mtk) util.push(['mtk', 'NHÀ MÁY THỔI KHÍ', um.bio.nBlower ? `${um.bio.nBlower} máy thổi khí` : '']);
    util.push(['nhc', 'NHÀ HÓA CHẤT', R.chem.filter(x => x.kg > 0).map(x => x.name.split(' –')[0]).filter((v, i, a) => a.indexOf(v) === i).join(', ')]);
    util.forEach(([k, t, s], i) => { const x = x0 + 20 + i * 250, w = 200; sh.rect(x, yC, w, 22, { layer: k === 'mtk' ? 'KHI' : 'HOACHAT', w: 0.45 }); sh.text(x + w / 2, yC + 7, t, { h: 2.6, an: 'middle', bold: true }); DRW.wrap(s, w - 6, 2).slice(0, 2).forEach((ln, j) => sh.text(x + w / 2, yC + 13 + j * 4, ln, { h: 2, an: 'middle' })); pos[k] = { x, y: yC, w, h: 22, cx: x + w / 2 }; });
    let bus = 0;
    const feed = (src, dst, st, lab) => {
      if (!pos[src] || !pos[dst]) return;
      const s = pos[src], d = pos[dst]; bus++;
      const xs = s.x + 10 + (bus * 17) % (s.w - 20), yb = yB + bh + 6 + (bus % 6) * 3.2;
      const xd = d.cx + ((bus % 3) - 1) * 6;
      const pts = [[xs, s.y], [xs, yb], [xd, yb], [xd, d.y + d.h]];
      sh.polyArrow(pts, st, 2.4);
      if (lab) sh.text(xd + 1, d.y + d.h + 4, lab, { h: 1.8, layer: st.layer });
    };
    if (pos.mtk) { feed('mtk', 'bio', AIR, 'Khí'); if (c.grit === 'aerated') feed('mtk', 'ctdv', AIR, 'Khí'); if (um.eq) feed('mtk', 'eq', AIR, 'Khí'); }
    if (um.hl) feed('nhc', 'hl', CHEM, (DATA.COAG[c.coag] || DATA.COAG.pac).name.split(' ')[0] + ', PAM, NaOH');
    const cgN = (DATA.COAG[c.coag] || DATA.COAG.pac).name.split(' ')[0];
    if (um.hl3) feed('nhc', 'hl3', CHEM, cgN + ', PAM, NaOH');
    if (um.aop) feed('nhc', 'aop', CHEM, { fenton: 'H₂O₂, FeSO₄, H₂SO₄, NaOH', o3: 'O₂ lỏng → O₃', o3h2o2: 'O₃, H₂O₂', uvh2o2: 'H₂O₂', clo2: 'NaClO₂, HCl' }[c.aop] || '');
    feed('nhc', 'dis', CHEM, c.disinf === 'uv' ? '' : 'NaOCl');
    if (R.chem.some(x => /đồng thời|Methanol|kiềm/.test(x.name) && x.kg > 0)) feed('nhc', 'bio', CHEM, R.chem.filter(x => /đồng thời|Methanol|kiềm/.test(x.name) && x.kg > 0).map(x => x.name.split(' –')[0]).join(', '));
    // tuyến bùn
    const sl = [];
    if (um.thc) sl.push('thc'); if (um.thb) sl.push('thb'); if (um.gbt) sl.push('gbt'); if (um.thm) sl.push('thm');
    const xs0 = x0 + 60;
    sl.forEach((k, i) => node(k, xs0, yD + i * (sl.length > 1 ? 38 : 0) - (sl.length > 1 ? 10 : 0), bw, bh - 4, shortName(um[k], R), info(um[k]).slice(0, 2), 'BUN'));
    // tuyến bùn sau cô đặc: [ổn định] → bể chứa → khử nước → [làm khô] → bánh bùn / bùn khô
    const chainS = [um.stab ? 'stab' : null, 'sst', 'dw', um.dry ? 'dry' : null, 'cake'].filter(Boolean), stp = Math.min(105, (AX1 - 8 - (xs0 + 100) - bw) / Math.max(chainS.length - 1, 1));
    const gas = R.special.sludgeGas;
    chainS.forEach((k, i) => {
      const x = xs0 + 100 + i * stp;
      if (k === 'cake') node(k, x, yD + 4, bw, bh - 4, um.dry ? 'BÙN KHÔ' : 'BÁNH BÙN', [`${fx(R.sludge.final || R.sludge.cake)} tấn/ngđ · ${fx(R.sludge.finalDS || 0)} % DS`, 'Vận chuyển xử lý'], 'BUN');
      else if (k === 'dw') node(k, x, yD + 4, bw + 6, bh - 4, shortName(um.dw, R), [`${fx(R.sludge.cake)} tấn bánh/ngđ`], 'BUN');
      else if (k === 'stab') node(k, x, yD + 4, bw, bh - 4, shortName(um.stab, R), (gas ? [`Biogas ${fx(gas.Vg, 0)} m³/ngđ`, `CHP ${fx(gas.Eel / 24)} kWe`] : info(um.stab)).slice(0, 2), 'BUN');
      else node(k, x, yD + 4, bw, bh - 4, shortName(um[k], R), info(um[k]).slice(0, 2), 'BUN');
    });
    const first = pos[chainS[0]];
    sl.forEach(k => sh.polyArrow([[pos[k].x + bw, pos[k].cy], [first.x - 10, pos[k].cy], [first.x - 10, first.cy], [first.x, first.cy]], SLUDGE, 2.5));
    for (let i = 0; i < chainS.length - 1; i++) { const a = pos[chainS[i]], b = pos[chainS[i + 1]]; sh.arrow(a.x + a.w, a.cy, b.x, b.cy, SLUDGE, 2.5); }
    if (gas && pos.stab) { const a = pos.stab; sh.arrow(a.cx, a.y, a.cx, a.y - 8, { layer: 'KHI', w: 0.35 }, 2); sh.text(a.cx + 2, a.y - 9, 'Biogas → bồn khí / CHP / đuốc', { h: 1.9, layer: 'KHI' }); }
    // nguồn bùn → bể nén
    const bioSrc = um.clar ? 'clar' : 'bio';
    const sludgeDrop = (src, dstK, yb, n) => {
      if (!pos[src] || !pos[dstK]) return;
      const s = pos[src], d = pos[dstK];
      const xs = s.cx + 12;
      sh.polyArrow([[xs, s.y + s.h], [xs, yb], [d.x - 6, yb], [d.x - 6, d.cy], [d.x, d.cy]], SLUDGE, 2.4);
      if (n) tag(xs + 4, s.y + s.h + 6, n);
    };
    const thB = um.thb ? 'thb' : 'gbt', thC = um.thc ? 'thc' : 'gbt';
    sludgeDrop(bioSrc, thB, yD - 22, 6);
    if (um.ana && R.um.ana.ids.PXa && R.um.ana.ids.PXa.val > 0) sludgeDrop('ana', thB, yD - 18, 0);
    if (pos.ana && R.special.biogas) { const a = pos.ana; sh.arrow(a.cx, a.y, a.cx, a.y - 9, { layer: 'KHI', w: 0.35 }, 2); sh.text(a.cx + 2, a.y - 10, `Biogas ${fx(R.special.biogas.Vg, 0)} m³/ngđ → đuốc / máy phát`, { h: 2, layer: 'KHI' }); }
    if (um.sep) sludgeDrop('sep', thC, yD - 26, 7);
    if (um.sep3) sludgeDrop('sep3', thC, yD - 26, 7);
    tag(pos.dw.x + pos.dw.w + 6, pos.dw.cy - 5, 8);
    // nước tách bùn hoàn lưu
    const rc = um.eq ? pos.eq : pos.sump;
    const yr = yD + bh + 16;
    sh.polyArrow([[pos.dw.cx, pos.dw.y + pos.dw.h], [pos.dw.cx, yr], [18, yr], [18, gy - 6], [rc.cx - 8, gy - 6], [rc.cx - 8, rc.y + rc.h]], { layer: 'NUOC', w: 0.35, dash: '3 1.5' }, 2.4);
    sh.text(40, yr - 1.5, `Nước tách bùn + nước rửa ≈ ${fx(R.sludge.Qrec)} m³/ngđ → ${um.eq ? 'bể điều hòa' : 'bể gom'}`, { h: 2.1, layer: 'NUOC' });
    tag(30, yr, 9);
    // bảng cân bằng
    const ty = 318;
    sh.text(AX0, ty - 3, 'BẢNG CÂN BẰNG VẬT CHẤT', { h: 3.2, bold: true });
    const st = R.st, L = R.lim.L;
    const r = (n, d, q, s) => [n, d, q, fxn(s.COD), fxn(s.BOD), fxn(s.TSS), fxn(s.TN), fxn(s.NH4), fxn(s.NO3), fxn(s.TP)];
    const rows = [['DÒNG', 'MÔ TẢ', 'Q (m³/ngđ)', 'COD', 'BOD₅', 'TSS', 'TN', 'NH₄-N', 'NO₃-N', 'TP'],
      r(1, 'Nước thải vào trạm', fx(S.input.Q) + ` (max ${fx(R.flow.Qmaxh)} m³/h)`, st.st1),
      r(2, 'Sau tiền xử lý' + (um.eq ? ' / điều hòa' : ''), fx(S.input.Q), st.st2),
      ...(st.st3a ? [r('3a', 'Sau yếm khí ' + DATA.ANA[c.anaer].short, fx(S.input.Q), st.st3a)] : []),
      r(3, 'Vào sinh học (kể tăng tải hoàn lưu)', fx(S.input.Q + R.sludge.Qrec), st.st4),
      r(4, 'Sau ' + DATA.BIO_SHORT[c.bio] + (um.clar ? ' + lắng' : ''), fx(S.input.Q), st.st5),
      ...(um.aop ? [r('5b', 'Sau oxy hóa bậc 3 – ' + DATA.AOP[c.aop].short, fx(S.input.Q), st.st6b)] : []),
      r(5, 'Sau xử lý – xả', fx(S.input.Q), st.st7),
      ['', 'Giới hạn xả ' + R.lim.name.replace('/BTNMT', ''), '—', fxn(L.COD), fxn(L.BOD), fxn(L.TSS), fxn(L.TN), fxn(L.NH4), fxn(L.NO3), fxn(L.TP)],
      [6, 'Bùn sinh học dư', '—', '', '', fx(R.sludge.Mbio) + ' kg/ngđ', '', '', '', ''],
      [7, 'Bùn hóa lý', '—', '', '', fx(R.sludge.Mchem) + ' kg/ngđ', '', '', '', ''],
      ...(um.stab ? [['8a', 'Bùn sau ổn định (' + shortName(um.stab, R).toLowerCase() + ')', '—', '', '', fx(um.stab.ids.Mo.val) + ' kg/ngđ', '', '', '', '']] : []),
      [8, 'Bánh bùn ' + (R.S.p['cake_' + c.dewater]) + ' % DS', fx(R.sludge.cake) + ' t/ngđ', '', '', '', '', '', '', ''],
      ...(um.dry ? [['8b', 'Bùn khô sau sấy ' + fx(R.sludge.finalDS) + ' % DS', fx(R.sludge.final) + ' t/ngđ', '', '', '', '', '', '', '']] : []),
      [9, 'Nước tách bùn + nước rửa', fx(R.sludge.Qrec), '', '', '≈ ' + fx(R.sludge.Mrec) + ' kg/ngđ', '', '', '', '']];
    sh.table(AX0, ty, [14, 92, 50, 24, 24, 32, 22, 22, 22, 22], rows, { rh: 6, h: 2.2, align: [0, 0, 0, 'end', 'end', 'end', 'end', 'end', 'end', 'end'] });
    // chú giải
    const lx = 420, lyy = ty + 4;
    [['NUOC', 'Nước thải / nước sau xử lý'], ['BUN', 'Bùn'], ['KHI', 'Khí'], ['HOACHAT', 'Hóa chất']].forEach(([l, t], i) => { sh.line(lx, lyy + i * 6, lx + 18, lyy + i * 6, { layer: l, w: 0.5 }); sh.text(lx + 21, lyy + i * 6 + 1, t, { h: 2.2 }); });
    sh.line(lx, lyy + 24, lx + 18, lyy + 24, { layer: 'NUOC', w: 0.35, dash: '3 1.5' }); sh.text(lx + 21, lyy + 25, 'Nước tách bùn hoàn lưu', { h: 2.2 });
    frame(sh, S, { title: 'SƠ ĐỒ CÔNG NGHỆ (PFD) – CÂN BẰNG VẬT CHẤT', code: 'LT02', notes: ['Sơ đồ không theo tỉ lệ.', 'Số trong vòng tròn là số dòng – lưu lượng, nồng độ xem bảng cân bằng.', 'Nồng độ đơn vị mg/L; coliform MPN/100 mL.', 'Giới hạn xả: ' + R.lim.name + (R.lim.kq ? ` × Kq ${fx(R.lim.kq)} × Kf ${fx(R.lim.kf)}` : '') + '.'], altName: R.alt.name });
    return sh;
  }

  /* ---------------- P&ID: sơ đồ đo lường – điều khiển (giản lược, ký hiệu ISA 5.1) ----------------
     Mỗi công trình: thiết bị chính (bơm, máy khuấy, máy thổi, bơm định lượng) và vòng đo – điều khiển điển hình (FIT, LIT, AIT pH/DO/ORP/NH₄…). */
  function pid(S, R) {
    const sh = new DRW.Sheet(W, H), um = R.um, c = R.alt.c;
    sheetTitle(sh, 'SƠ ĐỒ ĐO LƯỜNG – ĐIỀU KHIỂN (P&ID) TOÀN TRẠM', 'Ký hiệu ISA 5.1 – giản lược; số thiết bị theo danh mục thiết bị, tín hiệu về SCADA/PLC', AX0, 24);
    const seqW = ['scr', 'sump', 'ctdv', 'eq', 'hl', 'sep', 'mh', 'ana', 'bio', 'clar', 'tdn', 'hl3', 'sep3', 'aop', 'filt', 'dis'].filter(k => um[k]);
    const seqS = ['thc', 'thb', 'gbt', 'thm', 'stab', 'sst', 'dw', 'dry'].filter(k => um[k]);
    // vòng đo theo loại công trình: [tag, mô tả]
    const INST = {
      scr: [['LDIT', 'chênh mực nước trước/sau song chắn → tự cào'], ['M', 'máy cào rác']],
      sump: [['LIT', 'mực nước hố bơm → biến tần bơm'], ['FIT', 'lưu lượng nước thải vào (điện từ)'], ['P', 'bơm chìm (n+1)']],
      ctdv: [['M', 'lưới tinh, máy rửa – ép cát'], ['FIT', 'khí lắng cát']],
      eq: [['LIT', 'mực nước bể điều hòa'], ['FIC', 'lưu lượng bơm điều hòa'], ['AIT', 'pH, nhiệt độ'], ['P', 'bơm điều hòa']],
      hl: [['AIC', 'pH bể pH → bơm NaOH'], ['FIC', 'liều chất keo tụ theo Q'], ['M', 'máy khuấy pH / keo tụ / tạo bông']],
      sep: [['LIT', 'lớp bùn / mực váng'], ['P', 'bơm bùn hóa lý']],
      ana: [['AIT', 'pH, ORP, nhiệt độ bể yếm khí'], ['FIT', 'lưu lượng biogas'], ['PIT', 'áp suất khí'], ['AIC', 'pH → bơm NaHCO₃']],
      bio: c.bio === 'TF' ? [['FIC', 'lưu lượng tuần hoàn → bơm tuần hoàn'], ['AIT', 'BOD/COD, NH₄ sau lắng'], ['P', 'bơm tuần hoàn'], ['M', 'hệ phân phối quay']]
        : c.bio === 'LAG' ? [['LIT', 'mực nước từng hồ'], ['AIT', 'DO, pH, nhiệt độ hồ'], ['FIT', 'lưu lượng ra hệ hồ']] : [['AIC', 'DO từng vùng → van khí / biến tần máy thổi'], ['AIT', 'NH₄, NO₃, MLSS'], ['FIT', 'lưu lượng khí'], ['PIC', 'áp suất ống khí (MOV)'], ['B', 'máy thổi khí'], ['P', 'bơm tuần hoàn nội']],
      clar: [['LIT', 'mặt lớp bùn'], ['FIC', 'lưu lượng RAS / WAS'], ['P', 'bơm RAS, WAS']],
      mh: [['AIC', 'pH bể phản ứng → bơm vôi / xút'], ['FIC', 'polymer theo Q'], ['LIT', 'lớp bùn hydroxit'], ['M', 'máy khuấy, cầu gạt']],
      tdn: [['AIT', 'NO₃-N vào / ra'], ['FIC', 'methanol theo tải NO₃'], ['AIC', 'DO bể sục khí lại'], ['M', 'máy khuấy thiếu khí']],
      hl3: [['AIC', 'pH → bơm NaOH'], ['FIC', 'liều keo tụ theo Q'], ['AIT', 'TP / PO₄ online'], ['M', 'máy khuấy']],
      sep3: [['LIT', 'lớp bùn'], ['P', 'bơm bùn hóa lý bậc 3']],
      aop: c.aop === 'fenton' ? [['AIC', 'pH 3 → bơm H₂SO₄'], ['AIC', 'ORP → bơm H₂O₂'], ['FIC', 'FeSO₄ theo Q'], ['AIC', 'pH trung hòa → NaOH']]
        : c.aop === 'clo2' ? [['AIC', 'ClO₂ dư → máy điều chế'], ['AIT', 'clorit']]
          : c.aop === 'uvh2o2' ? [['AIT', 'UVT, cường độ UV'], ['FIC', 'H₂O₂ theo Q']]
            : [['AIC', 'O₃ dư trong nước → máy tạo O₃'], ['AIT', 'O₃ khí thải'], ['FIT', 'khí O₂/O₃']],
      filt: [['PDIT', 'tổn thất áp lọc → rửa lọc'], ['LIT', 'mực nước bể lọc'], ['P', 'bơm rửa lọc']],
      dis: c.disinf === 'uv' ? [['AIT', 'cường độ UV'], ['FIT', 'lưu lượng xả']] : [['AIC', 'clo dư → bơm NaOCl'], ['FIT', 'lưu lượng xả']],
      thc: [['LIT', 'lớp bùn'], ['P', 'bơm bùn đặc']], thb: [['LIT', 'lớp bùn'], ['P', 'bơm bùn đặc']], gbt: [['FIC', 'polymer theo bùn'], ['M', 'GBT']], thm: [['FIC', 'polymer theo bùn'], ['M', 'thiết bị cô đặc']],
      stab: c.stab === 'mad' || c.stab === 'tad' ? [['TIC', 'nhiệt độ bể phân hủy'], ['PIT', 'áp suất khí'], ['FIT', 'biogas → CHP / đuốc'], ['AIT', 'CH₄, H₂S']] : c.stab === 'aed' ? [['AIC', 'DO → van khí'], ['FIT', 'khí']] : [['AIC', 'pH ≥ 12 → bơm vôi']],
      sst: [['LIT', 'mực bùn'], ['M', 'máy khuấy']], dw: [['FIC', 'bùn cấp máy'], ['FIC', 'polymer theo bùn'], ['WIT', 'cân bánh bùn']], dry: [['TIC', 'nhiệt độ sấy / ẩm'], ['M', 'đảo bùn / băng tải']]
    };
    const bw = 44, bh = 22, n = seqW.length, pitch = Math.min(70, (AX1 - AX0 - 20 - bw) / Math.max(n - 1, 1)), y1 = 110, y2 = 330;
    const pos = {};
    const tagN = {}; const tagOf = (t, area) => { tagN[area] = (tagN[area] || 0) + 1; return `${t}-${area}${String(tagN[area]).padStart(2, '0')}`; };
    const bubble = (x, y, t, nr) => { sh.circle(x, y, 5.2, { layer: 'DIEUKHIEN', w: 0.3, fill: '#fff' }); sh.line(x - 5.2, y, x + 5.2, y, { layer: 'DIEUKHIEN', w: 0.2 }); sh.text(x, y - 1.2, t, { h: 1.9, an: 'middle', bold: true }); sh.text(x, y + 2.8, nr, { h: 1.5, an: 'middle' }); };
    const draw = (list, y0, layer, flow) => list.forEach((k, i) => {
      const u = um[k], x = AX0 + 10 + i * (list === seqW ? pitch : Math.min(80, (AX1 - AX0 - 20 - bw) / Math.max(list.length - 1, 1)));
      sh.rect(x, y0, bw, bh, { layer: 'BE', w: 0.45 });
      sh.text(x + bw / 2, y0 + 6, u.code, { h: 2.6, an: 'middle', bold: true });
      DRW.wrap(shortName(u, R), bw - 3, 1.7).slice(0, 2).forEach((ln, j) => sh.text(x + bw / 2, y0 + 11 + j * 3.6, ln, { h: 1.7, an: 'middle' }));
      pos[k] = { x, y: y0 };
      const ins = (INST[k] || []).filter(q => !['P', 'M', 'B'].includes(q[0])), eq = (INST[k] || []).filter(q => ['P', 'M', 'B'].includes(q[0]));
      ins.forEach((q, j) => { const bx = x + 6 + (j % 3) * 15, by = y0 - 12 - Math.floor(j / 3) * 14; sh.line(bx, by + 5.2, bx, y0, { layer: 'DIEUKHIEN', w: 0.2, dash: '1.5 1' }); bubble(bx, by, q[0], tagOf('', u.code).slice(1)); });
      eq.forEach((q, j) => { const ex = x + 8 + j * 14, ey = y0 + bh + 9; sh.circle(ex, ey, 4, { layer: layer, w: 0.35 }); sh.text(ex, ey + 1, q[0], { h: 2.2, an: 'middle', bold: true }); sh.line(ex, ey - 4, ex, y0 + bh, { layer: layer, w: 0.25 }); });
      if (i > 0 && flow) { const a = pos[list[i - 1]]; sh.arrow(a.x + bw, a.y + bh / 2, x, y0 + bh / 2, flow, 2.6); }
    });
    draw(seqW, y1, 'NUOC', WATER);
    draw(seqS, y2, 'BUN', SLUDGE);
    // bảng chú giải vòng đo
    const rows = [['CÔNG TRÌNH', 'THIẾT BỊ / VÒNG ĐO – ĐIỀU KHIỂN']];
    for (const k of seqW.concat(seqS)) rows.push([um[k].code + ' – ' + shortName(um[k], R), (INST[k] || []).map(q => q[0] + ': ' + q[1]).join('; ')]);
    sh.table(AX0, 400, [70, 535], rows.slice(0, 26), { rh: 5.6, h: 2, align: [0, 0] });
    const lx = AX0, ly = 380;
    [['FIT/FIC', 'đo / điều khiển lưu lượng'], ['LIT', 'đo mực nước'], ['AIT/AIC', 'phân tích (pH, DO, ORP, NH₄…)'], ['PIT/PIC', 'áp suất'], ['TIC', 'nhiệt độ'], ['PDIT', 'chênh áp'], ['P / M / B', 'bơm / máy khuấy – thiết bị / máy thổi']]
      .forEach(([a, b], i) => sh.text(lx + (i % 4) * 150, ly + Math.floor(i / 4) * 6, `${a}: ${b}`, { h: 2.1 }));
    sh.text(AX0, y2 - 22, 'TUYẾN XỬ LÝ BÙN', { h: 2.6, bold: true, layer: 'BUN' });
    sh.text(AX0, y1 - 40, 'TUYẾN NƯỚC', { h: 2.6, bold: true, layer: 'NUOC' });
    frame(sh, S, { title: 'SƠ ĐỒ ĐO LƯỜNG – ĐIỀU KHIỂN (P&ID)', code: 'LT02b', notes: ['Sơ đồ giản lược, không theo tỉ lệ; vòng đo theo thông lệ thiết kế trạm XLNT – hoàn thiện ở bước thiết kế kỹ thuật.', 'Mọi tín hiệu đo, trạng thái thiết bị về PLC/SCADA; quan trắc tự động nước thải sau xử lý theo quy định hiện hành.'] });
    return sh;
  }

  /* ---------------- vẽ mặt bằng giản lược (tổng mặt bằng) ---------------- */
  function planSimple(v, g, x, y, u, rot) {
    const w = 0.3;
    if (g.type === 'rect' && rot) {
      const Lf = g.L + 2 * w, Bf = g.n * g.B + (g.n + 1) * w;
      v.fill(x, y, Bf, Lf, '#e6e6e6', 'HATCH'); v.rect(x, y, Bf, Lf, WALL);
      for (let j = 0; j < g.n; j++) { const xx = x + w + j * (g.B + w); v.fill(xx, y + w, g.B, g.L, '#ffffff'); v.rect(xx, y + w, g.B, g.L, THIN); }
      let acc = 0; (g.zones || []).slice(0, -1).forEach(z => { acc += z.len; v.line(x + w, y + Lf - w - acc, x + Bf - w, y + Lf - w - acc, THIN); });
    } else if (g.type === 'rect') {
      const Lf = g.L + 2 * w, Bf = g.n * g.B + (g.n + 1) * w;
      v.fill(x, y, Lf, Bf, '#e6e6e6', 'HATCH');
      v.rect(x, y, Lf, Bf, WALL);
      for (let j = 0; j < g.n; j++) { const yy = y + w + j * (g.B + w); v.fill(x + w, yy, g.L, g.B, '#ffffff'); v.rect(x + w, yy, g.L, g.B, THIN); }
      let acc = 0; (g.zones || []).slice(0, -1).forEach(z => { acc += z.len; v.line(x + w + acc, y + w, x + w + acc, y + Bf - w, THIN); });
    } else if (g.type === 'circ') {
      for (let j = 0; j < g.n; j++) { const cx = x + (g.D / 2 + w) + j * (g.D + 2 * w + 3), cy = y + g.D / 2 + w; v.circle(cx, cy, g.D / 2 + w, WALL); v.circle(cx, cy, g.D / 2, THIN); v.circle(cx, cy, Math.max(0.5, g.D * 0.08), THIN); }
    } else if (g.type === 'race') {
      const Wt = 2 * g.Wc + 3 * w;
      for (let j = 0; j < g.n; j++) raceOutline(v, x, y + j * (Wt + 1), g, Wt);
    } else if (g.type === 'bld') {
      v.rect(x, y, g.L, g.B, { layer: 'BE', w: 0.4 });
      v.line(x, y, x + g.L, y + g.B, { layer: 'HATCH', w: 0.18 }); v.line(x, y + g.B, x + g.L, y, { layer: 'HATCH', w: 0.18 });
    }
  }
  function raceOutline(v, x, y, g, Wt) {
    const r = Wt / 2, cx1 = x + r, cx2 = x + r + g.Ls, cy = y + r;
    v.line(cx1, y, cx2, y, WALL); v.line(cx1, y + Wt, cx2, y + Wt, WALL);
    v.arc(cx2, cy, r, -90, 90, WALL); v.arc(cx1, cy, r, 90, 270, WALL);
    const iw = 0.3;
    v.rect(cx1, cy - iw / 2, g.Ls, iw, THIN);
    v.arc(cx2, cy, iw / 2 + g.Wc * 0, -90, 90, THIN);
  }

  /* ---------------- LT01: tổng mặt bằng ---------------- */
  function sitePlan(S, R) {
    const sh = new DRW.Sheet(W, H), um = R.um, p = S.p;
    const rows = [['scr', 'sump', 'ctdv', 'eq', 'hl', 'sep', 'mh', 'ana'], ['bio'], ['clar', 'tdn', 'hl3', 'sep3', 'aop', 'filt', 'dis', 'disp'], ['thc', 'thb', 'gbt', 'thm', 'stab', 'sst', 'dw', 'dry', 'mtk', 'nhc', 'ndh']];
    const gap = 6, road = 10;
    const placed = []; let yCur = 0, maxW = 0;
    for (const row of rows.slice().reverse()) {
      const us = row.map(k => um[k]).filter(u => u && u.geom);
      if (!us.length) continue;
      let x = 0, hmax = 0;
      for (const u of us) {
        const f = ENG.footprint(u.geom), rot = u.geom.type === 'rect' && f.B > f.L * 1.15;
        const L = rot ? f.B : f.L, B = rot ? f.L : f.B;
        placed.push({ u, x, y: yCur, L, B, rot }); x += L + gap; hmax = Math.max(hmax, B);
      }
      // canh giữa theo trục y trong hàng
      placed.filter(q => q.y === yCur).forEach(q => { q.y = yCur + (hmax - q.B) / 2; });
      maxW = Math.max(maxW, x - gap); yCur += hmax + road;
    }
    const siteW = maxW + 2 * road, siteH = yCur - road + 2 * road;
    const areaW = AX1 - AX0 - 10, areaH = 400;
    const scale = pickScale(Math.max(siteW * 1000 / areaW, siteH * 1000 / areaH));
    const k = 1000 / scale;
    const px = AX0 + 5 + (areaW - siteW * k) / 2, py = AY0 + 30 + siteH * k + (areaH - siteH * k) / 2;
    const v = new DRW.View(sh, px, py, scale, -road, -road);
    sheetTitle(sh, 'TỔNG MẶT BẰNG DÂY CHUYỀN CÔNG NGHỆ', `TL 1:${scale} – bố trí sơ bộ theo dây chuyền (hiệu chỉnh theo quy hoạch được duyệt)`, AX0, 24);
    v.rect(-road, -road, siteW, siteH, { layer: 'DUONG', w: 0.5, dash: '8 3' });
    v.rect(-road / 2, -road / 2, siteW - road, siteH - road, { layer: 'DUONG', w: 0.25 });
    // đánh số & vẽ
    const tbl = [['STT', 'HẠNG MỤC', 'KÍCH THƯỚC CHÍNH', 'SL']];
    placed.sort((a, b) => R.units.indexOf(a.u) - R.units.indexOf(b.u));
    placed.forEach((q, i) => {
      planSimple(v, q.u.geom, q.x, q.y, q.u, q.rot);
      const cx = q.x + q.L / 2, cy = q.y + q.B / 2;
      const X = v.X(cx), Y = v.Y(cy);
      sh.circle(X, Y, 3, { layer: 'TEXT', w: 0.3, fill: '#ffffff' }); sh.text(X, Y, String(i + 1), { h: 2.4, an: 'middle', vb: 'middle', bold: true });
      sh.text(X, Y + 6, q.u.code, { h: 2.2, an: 'middle', bold: true });
      tbl.push([i + 1, q.u.name, q.u.dims || '', q.u.geom.n || 1]);
      q.cx = cx; q.cy = cy;
    });
    // đường ống nước
    const seq = ['scr', 'sump', 'ctdv', 'eq', 'hl', 'sep', 'mh', 'ana', 'bio', 'clar', 'tdn', 'hl3', 'sep3', 'filt', 'dis', 'disp'].map(k => placed.find(q => q.u.id === k)).filter(Boolean);
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i], b = seq[i + 1];
      const x1 = a.x + a.L, y1 = a.cy, x2 = b.x, y2 = b.cy;
      if (Math.abs(a.y - b.y) < 0.1 || x2 > x1 + 1) {
        const xm = x2 > x1 ? (x1 + x2) / 2 : x1 + 2;
        v.pl([[x1, y1], [xm, y1], [xm, y2], [x2, y2]], false, WATER);
      } else {
        const ym = (a.y > b.y ? b.y + b.B + (a.y - b.y - b.B) / 2 : a.y + a.B + 3);
        v.pl([[x1, y1], [x1 + 2, y1], [x1 + 2, ym], [x2 - 2, ym], [x2 - 2, y2], [x2, y2]], false, WATER);
      }
    }
    const last = seq[seq.length - 1];
    if (last) { v.arrow(last.x + last.L, last.cy, siteW - road + 2, last.cy, WATER, 3); v.text(siteW - road - 2, last.cy + 2, 'Xả nguồn tiếp nhận', { h: 2, an: 'end', layer: 'NUOC' }); }
    const first = seq[0]; if (first) { v.arrow(-road - 2, first.cy, first.x, first.cy, WATER, 3); v.text(-road + 1, first.cy + 2, 'Cống đến', { h: 2, layer: 'NUOC' }); }
    // ống bùn
    const th = placed.find(q => ['thb', 'thc', 'gbt'].includes(q.u.id));
    ['bio', 'clar', 'sep', 'sep3'].forEach(k => { const a = placed.find(q => q.u.id === k); if (a && th) v.pl([[a.cx, a.y], [a.cx, a.y - 2], [th.cx, a.y - 2], [th.cx, th.y + th.B]], false, SLUDGE); });
    const mt = placed.find(q => q.u.id === 'mtk'), bb = placed.find(q => q.u.id === 'bio');
    if (mt && bb) v.pl([[mt.cx, mt.y + mt.B], [mt.cx, mt.y + mt.B + 3], [bb.x + 2, mt.y + mt.B + 3], [bb.x + 2, bb.y]], false, AIR);
    // mũi tên hướng bắc
    const nx = AX1 - 18, ny = AY0 + 40; sh.circle(nx, ny, 7, { layer: 'TEXT', w: 0.3 }); sh.pl([[nx, ny - 7], [nx - 2.5, ny + 4], [nx, ny + 2], [nx + 2.5, ny + 4]], true, { layer: 'TEXT', w: 0.3, fillC: true }); sh.text(nx, ny - 9, 'B', { h: 3, an: 'middle', bold: true });
    // kích thước khu đất
    v.dimH(-road, siteW - road, -road, -8, fx(siteW, 0) + ' m'); v.dimV(-road, siteH - road, siteW - road, 8, fx(siteH, 0) + ' m');
    // bảng
    const ty = 452;
    const tbRows = tbl.slice(0, 1 + Math.min(tbl.length - 1, 20));
    sh.table(AX0, ty, [10, 120, 150, 12], tbRows.slice(0, 11), { rh: 5.8, h: 2.1, align: [0, 0, 0, 'middle'] });
    if (tbRows.length > 11) sh.table(AX0 + 300, ty, [10, 120, 150, 12], [tbl[0]].concat(tbRows.slice(11)), { rh: 5.8, h: 2.1, align: [0, 0, 0, 'middle'] });
    const K = R.kpi;
    frame(sh, S, { title: 'TỔNG MẶT BẰNG DÂY CHUYỀN CÔNG NGHỆ', code: 'LT01', scale: '1:' + scale, notes: [`Diện tích mặt bằng các công trình ≈ ${fx(K.At, 0)} m²; khu đất bố trí sơ bộ ${fx(siteW, 0)} × ${fx(siteH, 0)} m ≈ ${fx(siteW * siteH, 0)} m².`, 'Đường nội bộ, hành lang công tác lấy ≥ 6 m; khoảng cách giữa các bể ≥ 6 m.', 'Tuyến ống thể hiện sơ đồ, chưa phải tuyến thi công.', 'Vị trí nhà điều hành, trạm biến áp theo quy hoạch tổng thể.'], altName: R.alt.name });
    return sh;
  }

  /* ---------------- LT03: trắc dọc thủy lực ---------------- */
  function hydProfile(S, R) {
    const sh = new DRW.Sheet(W, H), seq = R.hyd.seq;
    sheetTitle(sh, 'TRẮC DỌC THỦY LỰC TOÀN TRẠM', 'Tỉ lệ đứng 1:100 (theo cao độ) – tỉ lệ ngang: không theo tỉ lệ', AX0, 24);
    const n = seq.length, slot = Math.min(56, (AX1 - AX0 - 20) / n);
    let zmin = Math.min(...seq.map(o => o.bot)) - 1, zmax = Math.max(...seq.map(o => o.top)) + 1.5;
    let vs = 100; if ((zmax - zmin) * 10 > 330) vs = 200;
    const kz = 1000 / vs, y0 = 60 + zmax * kz;
    const Y = z => y0 - z * kz;
    // lưới cao độ
    for (let z = Math.ceil(zmin); z <= Math.floor(zmax); z++) { sh.line(AX0, Y(z), AX0 + 4, Y(z), { layer: 'DIM', w: 0.18 }); sh.text(AX0 + 5, Y(z) + 0.8, el(z), { h: 1.8, layer: 'DIM' }); }
    sh.line(AX0 + 20, Y(0), AX1, Y(0), { layer: 'DUONG', w: 0.35, dash: '6 2' }); sh.text(AX1 - 2, Y(0) - 1.5, 'Cốt sân ±0,000', { h: 2, an: 'end', layer: 'DUONG' });
    const xs = i => AX0 + 26 + i * slot;
    const tw = slot * 0.62;
    seq.forEach((o, i) => {
      const x = xs(i);
      const isOut = o.u.id === 'out';
      if (!isOut) {
        sh.fill(x, Y(o.top), tw, Y(o.bot) - Y(o.top), '#f4f4f4');
        sh.pl([[x, Y(o.top)], [x, Y(o.bot)], [x + tw, Y(o.bot)], [x + tw, Y(o.top)]], false, WALL);
        sh.fill(x + 0.5, Y(o.WL), tw - 1, Y(o.bot) - Y(o.WL) - 0.5, '#d8eefb');
        sh.line(x, Y(o.WL), x + tw, Y(o.WL), { layer: 'MUCNUOC', w: 0.35 });
        if (o.BWL !== undefined) { sh.line(x, Y(o.BWL), x + tw, Y(o.BWL), { layer: 'MUCNUOC', w: 0.25, dash: '2 1' }); sh.text(x + tw + 0.5, Y(o.BWL) + 0.8, 'BWL ' + el(o.BWL), { h: 1.6, layer: 'MUCNUOC' }); }
        if (o.LWL !== undefined) { sh.line(x, Y(o.LWL), x + tw, Y(o.LWL), { layer: 'MUCNUOC', w: 0.25, dash: '2 1' }); sh.text(x + tw + 0.5, Y(o.LWL) + 0.8, 'MNTN ' + el(o.LWL), { h: 1.6, layer: 'MUCNUOC' }); }
        // ▽
        const cx = x + tw / 2; sh.pl([[cx, Y(o.WL)], [cx - 1.4, Y(o.WL) - 2.1], [cx + 1.4, Y(o.WL) - 2.1]], true, { layer: 'MUCNUOC', w: 0.25 });
      } else {
        sh.arrow(x - 4, Y(o.WL), x + tw, Y(o.WL), WATER, 2.5); sh.line(x + tw * 0.2, Y(S.p.wl_out), x + tw, Y(S.p.wl_out), { layer: 'MUCNUOC', w: 0.3, dash: '3 1' });
        sh.text(x, Y(S.p.wl_out) + 3.5, 'MN tiếp nhận ' + el(S.p.wl_out), { h: 1.6, layer: 'MUCNUOC' });
      }
      sh.text(x + tw / 2, Y(o.top) - 8, o.u.code, { h: 2.4, an: 'middle', bold: true });
      sh.text(x + tw / 2, Y(o.top) - 3.5, 'MN ' + el(o.WL), { h: 1.8, an: 'middle', layer: 'MUCNUOC' });
      // nối ống
      if (i < n - 1) {
        const q = seq[i + 1], x2 = xs(i + 1);
        if (o.pumpOut) {
          const px = x + tw * 0.5, py = Y((o.LWL !== undefined ? o.LWL : o.bot) + 0.4);
          sh.circle(px, py, 1.8, { layer: 'THIETBI', w: 0.3 }); sh.text(px, py, 'P', { h: 1.8, an: 'middle', vb: 'middle', layer: 'THIETBI' });
          sh.polyArrow([[px, py - 1.8], [px, Y(Math.max(o.top, q.WL) + 0.6)], [x2 + 1, Y(Math.max(o.top, q.WL) + 0.6)], [x2 + 1, Y(q.WL) - 0.5]], WATER, 2);
        } else if (q.u.id !== 'out' || true) {
          const ya = o.BWL !== undefined ? o.BWL - 0.3 : o.WL - 0.1;
          sh.polyArrow([[x + tw, Y(ya)], [x2 - (q.u.id === 'out' ? 4 : 0), Y(q.WL + (q.u.id === 'out' ? 0 : 0.05))]], WATER, 2);
        }
      }
    });
    // bảng cao độ
    const ty = Math.min(470, Y(zmin) + 10);
    const rows = [['', ...seq.map(o => o.u.code)], ['Mực nước (m)', ...seq.map(o => el(o.WL))], ['Đáy (m)', ...seq.map(o => o.u.id === 'out' ? '' : el(o.bot))], ['Đỉnh thành (m)', ...seq.map(o => o.u.id === 'out' ? '' : el(o.top))], ['Tổn thất (m)', ...seq.map(o => o.u.hl ? fx(o.u.hl) : '')]];
    sh.table(AX0, ty, [30, ...seq.map(() => slot)].map((w, i) => i ? Math.min(w, 44) : w), rows, { rh: 6, h: 2, align: rows[0].map((_, i) => i ? 'middle' : 0) });
    const Hy = R.hyd;
    const notes = [`Cột áp hình học bơm bể gom = ${fx(Hy.HgeoSump)} m (MN công trình đầu vào ${el(Hy.nextAfterSump)} − MNTN bể gom ${el(Hy.sumpLWL)}).`, R.um.eq ? `Cột áp hình học bơm sau điều hòa = ${fx(Hy.HgeoEQ)} m.` : 'Không bố trí bể điều hòa – dòng tự chảy từ công trình đầu vào tới cửa xả.', `Mực nước tại cửa xả ${el(Hy.outletWL)}; MN nguồn tiếp nhận ${el(S.p.wl_out)} – ${Hy.outletOK ? 'tự chảy được.' : 'KHÔNG tự chảy, cần bơm.'}`, 'Tổn thất qua công trình lấy sơ bộ; tính chính xác theo tuyến ống ở bước thiết kế kỹ thuật.'];
    frame(sh, S, { title: 'TRẮC DỌC THỦY LỰC', code: 'LT03', scale: '1:' + vs + ' (đứng)', notes, altName: R.alt.name });
    return sh;
  }

  /* ---------------- chi tiết công trình: mặt bằng + mặt cắt ---------------- */
  function unitExtent(u) {
    const g = u.geom, f = ENG.footprint(g);
    const e = u.el || { bot: 0, WL: g.H - (g.fb || 0.5), top: g.H };
    const secH = (Math.max(e.top, e.WL + 0.5) - (e.bot - 0.5)) + 1.5;
    const secL = g.type === 'circ' ? g.D + 1 : g.type === 'race' ? 2 * g.Wc + 1.2 : f.L;
    return { planL: f.L + 4, planB: f.B + 5, secL: secL + 4, secH };
  }
  function drawRectPlan(v, u, R) {
    const g = u.geom, w = 0.3, Lf = g.L + 2 * w, Bf = g.n * g.B + (g.n + 1) * w;
    v.fill(0, 0, Lf, Bf, '#dcdcdc', 'HATCH'); v.rect(0, 0, Lf, Bf, WALL);
    const zones = g.zones && g.zones.length ? g.zones : [{ name: g.label, len: g.L }];
    for (let j = 0; j < g.n; j++) {
      const y = w + j * (g.B + w);
      v.fill(w, y, g.L, g.B, '#ffffff'); v.rect(w, y, g.L, g.B, THIN);
      let acc = 0;
      zones.forEach((z, zi) => {
        const x = w + acc, len = z.len;
        const nm = String(z.name || '');
        if ((/HIẾU KHÍ|PHẢN ỨNG|SBR|ĐIỀU HÒA|LẮNG CÁT|ICEAS/.test(nm) && !/THIẾU KHÍ/.test(nm)) || (u.id === 'eq')) {
          const k = Math.min(6, Math.max(2, Math.round(g.B / 2)));
          for (let i = 1; i <= k; i++) v.line(x + 0.4, y + i * g.B / (k + 1), x + len - 0.4, y + i * g.B / (k + 1), { layer: 'KHI', w: 0.18, dash: '1.5 1' });
        }
        if (/THIẾU KHÍ|KỴ KHÍ|PRE-REACT|TẠO BÔNG|KEO TỤ|^pH$/.test(nm)) {
          const r = Math.min(len, g.B) * 0.12;
          v.circle(x + len / 2, y + g.B * 0.3, Math.max(r, 0.25), { layer: 'THIETBI', w: 0.25 });
          v.text(x + len / 2, y + g.B * 0.3, 'M', { h: 1.8, an: 'middle', vb: 'middle', layer: 'THIETBI' });
        }
        if (g.selN > 1 && /SELECTOR/.test(nm)) {   // ngăn con selector (C-Tech: zig-zag, mỗi ngăn 1 ống xuống khí)
          for (let s = 1; s < g.selN; s++) { const yy = y + s * g.B / g.selN; v.line(x + (s % 2 ? 0 : len * 0.3), yy, x + len - (s % 2 ? len * 0.3 : 0), yy, THIN); }
          for (let s = 0; s < g.selN; s++) v.circle(x + len / 2, y + (s + 0.5) * g.B / g.selN, Math.min(0.2, len * 0.1), { layer: 'KHI', w: 0.2 });
        }
        if (z.smu) {   // SMU Kubota – ký hiệu theo bước lắp (không theo kích thước catalogue)
          const sm = z.smu, uw = sm.pitch * 0.75, ub_ = Math.max(0.6, g.B - 0.8);
          for (let i = 0; i < sm.n; i++) { const xx = x + sm.add / 2 + i * sm.pitch + (sm.pitch - uw) / 2; v.fill(xx, y + (g.B - ub_) / 2, uw, ub_, '#d6e4f5'); v.rect(xx, y + (g.B - ub_) / 2, uw, ub_, { layer: 'THIETBI', w: 0.25 }); }
        }
        const narrow = len < Math.min(6, g.L * 0.25);   // ngăn hẹp: chữ xoay đứng để không chồng lên ngăn kế bên
        if (j === 0 || g.n <= 4) v.text(x + len / 2, y + g.B * (narrow ? 0.5 : 0.62), nm, narrow ? { h: 2.1, an: 'middle', vb: 'middle', rot: -90 } : { h: 2.1, an: 'middle', vb: 'middle' });
        acc += len;
        if (zi < zones.length - 1) { v.fill(w + acc - 0.1, y, 0.2, g.B, '#9a9a9a'); v.line(w + acc - 0.1, y, w + acc - 0.1, y + g.B, THIN); v.line(w + acc + 0.1, y, w + acc + 0.1, y + g.B, THIN); }
      });
      if (g.serp) {
        const pb = (g.B - (g.serp - 1) * 0.2) / g.serp;
        for (let s = 1; s < g.serp; s++) { const yy = y + s * (pb + 0.2) - 0.1; const fromLeft = s % 2 === 1; v.fill(w + (fromLeft ? 0 : 1.2), yy - 0.1, g.L - 1.2, 0.2, '#9a9a9a'); }
      }
      if (g.lamella) { const x1 = w + zones[0].len, x2 = x1 + zones[1].len; for (let xx = x1 + 0.3; xx < x2 - 0.2; xx += Math.max(0.35, (x2 - x1) / 30)) v.line(xx, y + 0.2, xx + 0.25, y + g.B - 0.2, { layer: 'HATCH', w: 0.18 }); }
      if (g.batch && g.decanter) { const xd = w + g.L - 1.2; v.line(xd, y + (g.B - g.decanter) / 2, xd, y + (g.B + g.decanter) / 2, { layer: 'THIETBI', w: 0.5 }); v.text(xd - 0.4, y + g.B / 2, 'DECANTER', { h: 1.6, an: 'middle', rot: -90, layer: 'THIETBI' }); }
      // vào/ra
      v.arrow(-2.2, y + g.B / 2, 0, y + g.B / 2, WATER, 2.4);
      v.arrow(Lf, y + g.B / 2 - (g.serp && g.serp % 2 === 0 ? 0 : 0), Lf + 2.2, y + g.B / 2, WATER, 2.4);
    }
    // kích thước
    v.dimH(0, Lf, 0, -9, DRW.mm(Lf));
    let acc = w; zones.forEach(z => { v.dimH(acc, acc + z.len, Bf, 5, DRW.mm(z.len)); acc += z.len; });
    for (let j = 0; j < g.n; j++) v.dimV(w + j * (g.B + w), w + j * (g.B + w) + g.B, 0, -6, DRW.mm(g.B));
    v.dimV(0, Bf, Lf, 12, DRW.mm(Bf));
    // đường cắt
    const yc = w + g.B / 2;
    v.line(-3.5, yc, -2.5, yc, { layer: 'TRUC', w: 0.5 }); v.line(Lf + 2.5, yc, Lf + 3.5, yc, { layer: 'TRUC', w: 0.5 });
    v.text(-3, yc + 0.8, 'A', { h: 3, an: 'middle', layer: 'TRUC', bold: true }); v.text(Lf + 3, yc + 0.8, 'A', { h: 3, an: 'middle', layer: 'TRUC', bold: true });
    return { L: Lf, B: Bf };
  }
  function drawRectSection(v, u, e) {
    const g = u.geom, w = 0.3, Lf = g.L + 2 * w;
    const bot = e.bot, top = Math.max(e.top, e.WL + 0.3), slab = 0.4;
    v.fill(-0.5, bot - slab, Lf + 1, slab, '#cfcfcf', 'HATCH'); v.rect(-0.5, bot - slab, Lf + 1, slab, WALL);
    v.fill(w, bot, g.L, e.WL - bot, '#e3f3fc');
    v.fill(0, bot, w, top - bot, '#cfcfcf'); v.rect(0, bot, w, top - bot, WALL);
    v.fill(Lf - w, bot, w, top - bot, '#cfcfcf'); v.rect(Lf - w, bot, w, top - bot, WALL);
    const zones = g.zones && g.zones.length ? g.zones : [{ name: g.label, len: g.L }];
    let acc = w;
    zones.forEach((z, i) => {
      if (i < zones.length - 1) {
        acc += z.len;
        const open = /PRE-REACT|THIẾU KHÍ|KỴ KHÍ|SELECTOR/.test(zones[i].name) ? 0.45 : 0;
        v.fill(acc - 0.1, bot + open, 0.2, top - 0.3 - bot - open, '#bdbdbd'); v.rect(acc - 0.1, bot + open, 0.2, top - 0.3 - bot - open, THIN);
      }
    });

    v.line(w, e.WL, Lf - w, e.WL, { layer: 'MUCNUOC', w: 0.35 });
    v.level(w + 0.8, e.WL, 'MNCN ' + el(e.WL));
    if (e.BWL !== undefined) { v.line(w, e.BWL, Lf - w, e.BWL, { layer: 'MUCNUOC', w: 0.25, dash: '3 1.5' }); v.level(w + g.L * 0.45, e.BWL, 'MNTN (BWL) ' + el(e.BWL)); }
    if (e.LWL !== undefined) { v.line(w, e.LWL, Lf - w, e.LWL, { layer: 'MUCNUOC', w: 0.25, dash: '3 1.5' }); v.level(w + g.L * 0.45, e.LWL, 'MNTN ' + el(e.LWL)); }
    if (g.batch && g.SD) { const ys = bot + g.SD; v.line(w, ys, Lf - w, ys, { layer: 'BUN', w: 0.3, dash: '4 1.5' }); v.text(w + g.L * 0.7, ys + 0.25, 'Đỉnh lớp bùn ' + el(ys), { h: 2, layer: 'BUN' }); }
    // đĩa khí
    acc = w;
    zones.forEach(z => {
      const nm = String(z.name || '');
      if ((/HIẾU KHÍ|PHẢN ỨNG|SBR|ĐIỀU HÒA|LẮNG CÁT|ICEAS/.test(nm) && !/THIẾU KHÍ/.test(nm)) || u.id === 'eq') {
        v.line(acc + 0.3, bot + 0.3, acc + z.len - 0.3, bot + 0.3, { layer: 'KHI', w: 0.35 });
        for (let xx = acc + 0.6; xx < acc + z.len - 0.4; xx += Math.max(0.6, z.len / 25)) v.circle(xx, bot + 0.38, 0.07, { layer: 'KHI', w: 0.2 });
      }
      if (z.media && u.fixMod) {   // module giá thể cố định (Organica / Biopolus)
        const fm = u.fixMod, pitch = fm.mL / Math.sqrt(fm.phi), yb = bot + 0.5;
        for (let xx = acc + 0.4; xx + fm.mL <= acc + z.len - 0.3; xx += pitch) { v.fill(xx, yb, fm.mL, fm.mH, '#d8ecd0'); v.rect(xx, yb, fm.mL, fm.mH, { layer: 'THIETBI', w: 0.2 }); }
        v.text(acc + z.len / 2, yb + fm.mH + 0.25, 'Module giá thể ' + fx(fm.mL) + ' × ' + fx(fm.mH) + ' m', { h: 1.8, an: 'middle', layer: 'THIETBI' });
      }
      if (z.smu) {   // SMU: vỏ đĩa khí + vỏ màng, ngập ≥ 0,5 m (Kubota Guidebook 1-4 ③)
        const sm = z.smu, uw = sm.pitch * 0.75;
        for (let i = 0; i < sm.n; i++) { const xx = acc + sm.add / 2 + i * sm.pitch + (sm.pitch - uw) / 2; v.fill(xx, bot + 0.2, uw, sm.uH, '#d6e4f5'); v.rect(xx, bot + 0.2, uw, sm.uH, { layer: 'THIETBI', w: 0.25 }); v.line(xx, bot + 0.2 + sm.uH * 0.35, xx + uw, bot + 0.2 + sm.uH * 0.35, { layer: 'THIETBI', w: 0.18 }); }
        v.text(acc + z.len / 2, bot + 0.2 + sm.uH + 0.25, 'SMU Kubota (H ' + fx(sm.uH) + ' m)', { h: 1.8, an: 'middle', layer: 'THIETBI' });
      }
      if (z.len < Math.min(6, g.L * 0.25)) v.text(acc + z.len / 2, bot + (e.WL - bot) * 0.5, nm, { h: 2.1, an: 'middle', vb: 'middle', rot: -90 });
      else v.text(acc + z.len / 2, bot + ((e.BWL !== undefined ? e.BWL : e.WL) - bot) * (e.BWL !== undefined ? 0.6 : 0.55), nm, { h: 2.1, an: 'middle' });
      acc += z.len;
    });
    if (g.batch && g.decanter) { const xd = Lf - w - 1.2; v.line(xd, e.WL + 0.2, xd, (e.BWL || e.WL - 1) - 0.1, { layer: 'THIETBI', w: 0.5 }); v.circle(xd, (e.BWL || e.WL - 1) - 0.1, 0.25, { layer: 'THIETBI', w: 0.4 }); }
    // cốt sân
    v.line(-3, 0, Lf + 3, 0, { layer: 'DUONG', w: 0.3, dash: '6 2' }); v.text(Lf + 3.2, 0.2, '±0,000', { h: 2, layer: 'DUONG' });
    // kích thước đứng
    v.dimV(bot, e.WL, Lf, 8, DRW.mm(e.WL - bot)); v.dimV(e.WL, top, Lf, 8, DRW.mm(top - e.WL));
    v.text(-0.8, bot + 0.1, 'Đáy ' + el(bot), { h: 2, an: 'end' }); v.text(-0.8, top - 0.1, 'Đỉnh ' + el(top), { h: 2, an: 'end' });
    v.dimH(0, Lf, bot - slab, -6, DRW.mm(Lf));
    return {};
  }
  function drawCircPlan(v, u) {
    const g = u.geom, w = 0.3, R0 = g.D / 2;
    for (let j = 0; j < g.n; j++) {
      const cx = R0 + w + j * (g.D + 2 * w + 3), cy = R0 + w;
      v.circle(cx, cy, R0 + w, WALL); v.circle(cx, cy, R0, THIN);
      v.circle(cx, cy, R0 - 0.6, { layer: 'NUOC', w: 0.25, dash: '2 1' });
      v.circle(cx, cy, Math.max(0.6, g.D * 0.1), THIN); v.circle(cx, cy, 0.35, THIN);
      v.line(cx, cy, cx + R0 + w, cy, { layer: 'THIETBI', w: 0.5 });
      v.text(cx, cy - R0 * 0.45, (u.geom.label || '') + (g.n > 1 ? ' ' + (j + 1) : ''), { h: 2.2, an: 'middle' });
      v.dimH(cx - R0, cx + R0, cy - R0 - w, -6, 'D' + DRW.mm(g.D));
      if (j === 0) { v.line(cx - R0 - 3, cy, cx - R0 - 2, cy, { layer: 'TRUC', w: 0.5 }); v.text(cx - R0 - 2.5, cy + 0.8, 'A', { h: 3, an: 'middle', layer: 'TRUC', bold: true }); v.line(cx + R0 + 2, cy + 0.01, cx + R0 + 3, cy + 0.01, { layer: 'TRUC', w: 0.5 }); v.text(cx + R0 + 2.5, cy + 0.8, 'A', { h: 3, an: 'middle', layer: 'TRUC', bold: true }); }
      v.arrow(cx, cy + R0 + w + 2, cx, cy + 0.8, WATER, 2);
    }
  }
  function drawCircSection(v, u, e) {
    const g = u.geom, w = 0.3, R0 = g.D / 2, bot = e.bot, top = Math.max(e.top, e.WL + 0.3), slope = R0 / 12;
    const x0 = 0, xc = R0 + w, x1 = g.D + 2 * w;
    v.fill(x0, bot, w, top - bot, '#cfcfcf'); v.rect(x0, bot, w, top - bot, WALL);
    v.fill(x1 - w, bot, w, top - bot, '#cfcfcf'); v.rect(x1 - w, bot, w, top - bot, WALL);
    v.pl([[x0, bot - 0.4], [xc - 0.8, bot - slope - 0.4], [xc - 0.8, bot - slope - 1.2], [xc + 0.8, bot - slope - 1.2], [xc + 0.8, bot - slope - 0.4], [x1, bot - 0.4]], false, WALL);
    v.pl([[w, bot], [xc - 0.6, bot - slope], [xc - 0.6, bot - slope - 0.8], [xc + 0.6, bot - slope - 0.8], [xc + 0.6, bot - slope], [x1 - w, bot]], false, THIN);
    v.line(w, e.WL, x1 - w, e.WL, { layer: 'MUCNUOC', w: 0.35 }); v.level(w + 0.6, e.WL, 'MNCN ' + el(e.WL));
    const fw = Math.max(0.6, g.D * 0.1);
    v.rect(xc - fw, e.WL - (e.WL - bot) * 0.45, 2 * fw, (e.WL - bot) * 0.45 + 0.3, { layer: 'BE', w: 0.25, dash: '2 1' });
    v.line(xc, top + 0.3, xc, bot - slope, { layer: 'TRUC', w: 0.2, dash: '6 2 1 2' });
    v.line(w, top + 0.1, x1, top + 0.1, { layer: 'THIETBI', w: 0.5 });
    v.line(-3, 0, x1 + 3, 0, { layer: 'DUONG', w: 0.3, dash: '6 2' }); v.text(x1 + 3.2, 0.2, '±0,000', { h: 2, layer: 'DUONG' });
    v.dimV(bot, e.WL, x1, 8, DRW.mm(e.WL - bot)); v.dimV(e.WL, top, x1, 8, DRW.mm(top - e.WL));
    v.text(-0.8, bot + 0.1, 'Đáy ' + el(bot), { h: 2, an: 'end' }); v.text(-0.8, top - 0.1, 'Đỉnh ' + el(top), { h: 2, an: 'end' });
    v.dimH(0, x1, bot - slope - 1.2, -6, DRW.mm(x1));
  }
  function drawRacePlan(v, u) {
    const g = u.geom, w = 0.3, Wt = 2 * g.Wc + 3 * w;
    for (let j = 0; j < g.n; j++) {
      const y = j * (Wt + 1);
      raceOutline(v, 0, y, g, Wt);
      v.text(Wt / 2 + g.Ls / 2, y + Wt * 0.75, 'MƯƠNG OXY HÓA ' + (j + 1), { h: 2.2, an: 'middle' });
      for (const xr of [Wt / 2 + g.Ls * 0.15, Wt / 2 + g.Ls * 0.65]) { v.line(xr, y + 0.3, xr, y + g.Wc, { layer: 'THIETBI', w: 0.8 }); v.line(xr + g.Ls * 0.1, y + Wt - g.Wc, xr + g.Ls * 0.1, y + Wt - 0.3, { layer: 'THIETBI', w: 0.8 }); }
      v.arrow(Wt / 2 + g.Ls * 0.4, y + g.Wc / 2, Wt / 2 + g.Ls * 0.5, y + g.Wc / 2, WATER, 2);
      v.arrow(Wt / 2 + g.Ls * 0.5, y + Wt - g.Wc / 2, Wt / 2 + g.Ls * 0.4, y + Wt - g.Wc / 2, WATER, 2);
    }
    v.dimH(0, g.Ls + Wt, 0, -7, DRW.mm(g.Ls + Wt)); v.dimV(0, Wt, g.Ls + Wt, 7, DRW.mm(Wt));
    v.dimV(0, g.Wc, 0, -5, DRW.mm(g.Wc));
    v.line(Wt / 2 + g.Ls / 2, -2.5, Wt / 2 + g.Ls / 2, -1.5, { layer: 'TRUC', w: 0.5 }); v.text(Wt / 2 + g.Ls / 2 + 1.5, -2.2, 'A', { h: 3, layer: 'TRUC', bold: true });
  }
  function drawRaceSection(v, u, e) {
    const g = u.geom, w = 0.3, Wt = 2 * g.Wc + 3 * w, bot = e.bot, top = Math.max(e.top, e.WL + 0.3);
    v.fill(-0.5, bot - 0.4, Wt + 1, 0.4, '#cfcfcf', 'HATCH'); v.rect(-0.5, bot - 0.4, Wt + 1, 0.4, WALL);
    [[0], [g.Wc + w], [Wt - w]].forEach(([x]) => { v.fill(x, bot, w, top - bot, '#cfcfcf'); v.rect(x, bot, w, top - bot, WALL); });
    v.line(w, e.WL, Wt - w, e.WL, { layer: 'MUCNUOC', w: 0.35 }); v.level(w + 0.5, e.WL, 'MNCN ' + el(e.WL));
    v.text(w + g.Wc / 2, bot + 1, 'NHÁNH 1', { h: 2, an: 'middle' }); v.text(Wt - w - g.Wc / 2, bot + 1, 'NHÁNH 2', { h: 2, an: 'middle' });
    v.line(-3, 0, Wt + 3, 0, { layer: 'DUONG', w: 0.3, dash: '6 2' });
    v.dimV(bot, e.WL, Wt, 7, DRW.mm(e.WL - bot)); v.dimH(0, Wt, bot - 0.4, -6, DRW.mm(Wt));
    v.text(-0.8, bot + 0.1, 'Đáy ' + el(bot), { h: 2, an: 'end' });
  }

  function detailSheet(S, R, units, code, title) {
    const sh = new DRW.Sheet(W, H);
    sheetTitle(sh, title, R.alt.name, AX0, 24);
    const k = units.length, colW = (AX1 - AX0 - 5) / k;
    const planH = 250, secH = 170, y0 = 40;
    let scaleTxt = [];
    units.forEach((u, i) => {
      const ex = unitExtent(u);
      const sc = pickScale(Math.max(ex.planL * 1000 / (colW - 30), ex.planB * 1000 / (planH - 25)));
      const sc2 = pickScale(Math.max(ex.secL * 1000 / (colW - 34), ex.secH * 1000 / (secH - 30)));
      scaleTxt.push('1:' + sc, '1:' + sc2);
      const kk = 1000 / sc, kk2 = 1000 / sc2, x0 = AX0 + i * colW + 18;
      const e = u.el || { bot: 0, WL: u.geom.H - (u.geom.fb || 0.5), top: u.geom.H };
      sh.text(AX0 + i * colW + colW / 2, y0 - 2, 'MẶT BẰNG ' + u.code + ' – ' + u.name.toUpperCase().slice(0, 60), { h: 2.8, an: 'middle', bold: true });
      sh.text(AX0 + i * colW + colW / 2, y0 + 2.5, 'TL 1:' + sc, { h: 2.2, an: 'middle' });
      const g = u.geom, f = ENG.footprint(g);
      const pv = new DRW.View(sh, x0 + ((colW - 30) - f.L * kk) / 2 + 4, y0 + 12 + (planH - 25) / 2 + f.B * kk / 2, sc, 0, 0);
      const sv = new DRW.View(sh, x0 + ((colW - 30) - ex.secL * kk2) / 2 + 6, 0, sc2, 0, 0);
      // canh sv: đáy ở cuối vùng
      sv.py = y0 + planH + secH - 16 + (e.bot - 0.8) * kk2;
      if (g.type === 'rect') { drawRectPlan(pv, u, R); drawRectSection(sv, u, e); }
      else if (g.type === 'circ') { drawCircPlan(pv, u); drawCircSection(sv, u, e); }
      else if (g.type === 'race') { drawRacePlan(pv, u); drawRaceSection(sv, u, e); }
      sh.text(AX0 + i * colW + colW / 2, y0 + planH + 12, 'MẶT CẮT A-A – ' + u.code, { h: 2.8, an: 'middle', bold: true });
      sh.text(AX0 + i * colW + colW / 2, y0 + planH + 16.5, 'TL 1:' + sc2, { h: 2.2, an: 'middle' });
      if (i) sh.line(AX0 + i * colW, y0 - 8, AX0 + i * colW, AY1 - 50, { layer: 'VIEN', w: 0.18, dash: '4 2' });
    });
    // bảng thông số
    const rows = [['CÔNG TRÌNH', 'KÍCH THƯỚC / THÔNG SỐ', 'THỂ TÍCH (m³)', 'THỜI GIAN LƯU', 'ĐÁY', 'MN', 'ĐỈNH']];
    units.forEach(u => { const e = u.el || {}; rows.push([u.code + ' – ' + u.name, u.dims || '', u.V ? fx(u.V, 0) : '—', u.hrt || '—', e.bot !== undefined ? el(e.bot) : '', e.WL !== undefined ? el(e.WL) : '', e.top !== undefined ? el(e.top) : '']); });
    sh.table(AX0, AY1 - 8 - rows.length * 6, [150, 200, 30, 30, 22, 22, 22], rows, { rh: 6, h: 2.1, align: [0, 0, 'end', 'middle', 'end', 'end', 'end'] });
    const notes = commonNotes(S).concat(units.flatMap(u => {
      const o = [];
      if (u.id === 'bio' && u.ct) o.push(`C-Tech: ${u.ct.N} bể, chu kỳ F/A ${fx(u.ct.TFA)} h – lắng ${fx(u.ct.TS)} h – gạn ${fx(u.ct.TD)} h (${fx(u.ct.ncy)} chu kỳ/ngày); TWL ${fx(u.ct.TWL)} m, BWL ${fx(u.ct.BWL)} m; selector ${fx(u.ct.Wsel)} m × ${u.ct.nsel} ngăn, RAS ${fx(u.ct.QR)} m³/h/bể; decanter ${fx(u.ct.Qd1, 0)} m³/h; ${u.ct.nd} đĩa khí/bể.`);
      if (u.id === 'bio' && u.fixMod) o.push(`${DATA.BIO_SHORT[R.alt.c.bio]} (${u.fixed.hyb ? 'lai IFAS, có tuần hoàn bùn' : 'màng bám thuần'}): ${u.fixMod.nmod} module giá thể cố định, tổng ${fx(u.fixMod.Amed, 0)} m²; ngăn thiếu khí có máy khuấy chìm, ngăn hiếu khí sục khí bọt mịn dưới module.`);
      if (u.id === 'bio' && R.alt.c.bio === 'ICEAS') o.push(`ICEAS: ${u.ic.nb} bể, chu trình ${u.ic.cycleName} ${fx(u.ic.NCT)} h (Air-On ${u.ic.ph.on}/Off ${u.ic.ph.off}/Lắng ${u.ic.ph.set}/Chắt ${u.ic.ph.dec} phút); decanter ${fx(u.ic.DL)} m; ${u.ic.nd} đĩa/bể.`);
      if (u.id === 'bio' && u.IR) o.push(`Tuần hoàn nội IR = ${fx(u.IR)}·Q; tuần hoàn bùn R = ${fx(u.RAS)}·Q.`);
      if (u.id === 'bio' && u.mbr) o.push(`Màng MBR${u.mbr.model ? ' Kubota ' + u.mbr.model + ' × ' + u.mbr.nU + ' SMU' : ''}: ${fx(u.mbr.Am, 0)} m²; khí rửa màng ${fx(u.mbr.SAD)} m³/phút.`);
      return o;
    }));
    frame(sh, S, { title, code, scale: [...new Set(scaleTxt)].join('; '), notes, altName: R.alt.name });
    return sh;
  }

  /* ---------------- danh mục thiết bị ---------------- */
  function equipSheet(S, R, code) {
    const sh = new DRW.Sheet(W, H);
    sheetTitle(sh, 'DANH MỤC THIẾT BỊ CÔNG NGHỆ CHÍNH', R.alt.name, AX0, 24);
    const rows = R.equip.map((e, i) => [i + 1, e.u, e.name, e.spec, e.qty, e.note]);
    const half = Math.ceil(rows.length / 2), cw = [9, 60, 70, 90, 12, 35];
    const hdr = ['STT', 'CÔNG TRÌNH', 'THIẾT BỊ', 'THÔNG SỐ CHỌN', 'SL', 'GHI CHÚ'];
    if (rows.length <= 40) sh.table(AX0, 34, cw.map(x => x * 1.1), [hdr].concat(rows), { rh: 6.5, h: 2.1, align: [0, 0, 0, 0, 'middle', 0] });
    else { sh.table(AX0, 34, cw, [hdr].concat(rows.slice(0, half)), { rh: 6.2, h: 1.9, align: [0, 0, 0, 0, 'middle', 0] }); }
    if (rows.length > 40) sh.table(AX0 + 285, 34, cw.map(x => x * 1.1).map((x, i) => i === 3 ? x - 6 : x), [hdr].concat(rows.slice(half)), { rh: 6.2, h: 1.9, align: [0, 0, 0, 0, 'middle', 0] });
    frame(sh, S, { title: 'DANH MỤC THIẾT BỊ CÔNG NGHỆ CHÍNH', code, notes: ['Thông số chọn sơ bộ; model cụ thể theo hồ sơ nhà cung cấp.', 'Số lượng ghi gồm cả thiết bị dự phòng.'], altName: R.alt.name });
    return sh;
  }

  /* ---------------- lắp bộ bản vẽ ---------------- */
  function build(S, R) {
    const um = R.um;
    const groups = [
      [['scr', 'sump'], 'BỂ GOM + SONG CHẮN RÁC THÔ – MẶT BẰNG, MẶT CẮT'],
      [['ctdv'], 'CÔNG TRÌNH ĐẦU VÀO (LƯỚI TINH – LẮNG CÁT) – MẶT BẰNG, MẶT CẮT'],
      [['eq'], 'BỂ ĐIỀU HÒA – MẶT BẰNG, MẶT CẮT'],
      [['hl', 'sep'], 'CỤM HÓA LÝ TRƯỚC SINH HỌC – MẶT BẰNG, MẶT CẮT'],
      [['bio'], (R.alt.c.bio === 'LAG' ? 'HỒ SINH HỌC' : R.alt.c.bio === 'TF' ? 'LỌC SINH HỌC NHỎ GIỌT' : 'BỂ SINH HỌC ' + DATA.BIO_SHORT[R.alt.c.bio].toUpperCase()) + ' – MẶT BẰNG, MẶT CẮT'],
      [['mh'], 'KẾT TỦA HYDROXIT KIM LOẠI – MẶT BẰNG, MẶT CẮT'],
      [['clar'], 'BỂ LẮNG THỨ CẤP – MẶT BẰNG, MẶT CẮT'],
      [['tdn'], 'KHỬ NITRAT BẬC 3 – MẶT BẰNG, MẶT CẮT'],
      [['hl3', 'sep3'], 'CỤM HÓA LÝ BẬC 3 – MẶT BẰNG, MẶT CẮT'],
      [['aop'], 'XỬ LÝ BẬC 3 – OXY HÓA ' + (R.alt.c.aop && DATA.AOP[R.alt.c.aop] ? DATA.AOP[R.alt.c.aop].short : '') + ' – MẶT BẰNG, MẶT CẮT'],
      [['filt', 'dis'], (um.filt ? 'LỌC BẬC 3 + ' : '') + 'CÔNG TRÌNH KHỬ TRÙNG – MẶT BẰNG, MẶT CẮT'],
      [['disp'], 'BÃI THẤM ÁP LỰC – MẶT BẰNG'],
      [['thc', 'thb', 'thm', 'sst'], 'XỬ LÝ BÙN: CÔ ĐẶC – BỂ CHỨA BÙN – MẶT BẰNG, MẶT CẮT'],
      [['stab', 'dw'], 'XỬ LÝ BÙN: ỔN ĐỊNH BÙN' + (R.alt.c.dewater === 'beds' ? ' – SÂN PHƠI BÙN' : '') + ' – MẶT BẰNG, MẶT CẮT'],
    ];
    const list = [{ code: 'LT00', title: 'DANH MỤC BẢN VẼ – GHI CHÚ CHUNG' }, { code: 'LT01', title: 'TỔNG MẶT BẰNG DÂY CHUYỀN CÔNG NGHỆ' }, { code: 'LT02', title: 'SƠ ĐỒ CÔNG NGHỆ (PFD) – CÂN BẰNG VẬT CHẤT' }, { code: 'LT02b', title: 'SƠ ĐỒ ĐO LƯỜNG – ĐIỀU KHIỂN (P&ID)' }, { code: 'LT03', title: 'TRẮC DỌC THỦY LỰC' }];
    const det = [];
    let n = 4;
    for (const [ids, t] of groups) {
      const us = ids.map(k => um[k]).filter(u => u && u.geom && u.geom.type !== 'bld');
      if (!us.length) continue;
      const code = 'LT' + String(n).padStart(2, '0'); n++;
      list.push({ code, title: t }); det.push([us, code, t]);
    }
    const eqCode = 'LT' + String(n).padStart(2, '0');
    list.push({ code: eqCode, title: 'DANH MỤC THIẾT BỊ CÔNG NGHỆ CHÍNH' });
    const out = [];
    const total = list.length;
    const ctx = [];
    ctx.push(() => cover(S, R, list));
    ctx.push(() => sitePlan(S, R));
    ctx.push(() => pfd(S, R));
    ctx.push(() => pid(S, R));
    ctx.push(() => hydProfile(S, R));
    det.forEach(([us, code, t]) => ctx.push(() => detailSheet(S, R, us, code, t)));
    ctx.push(() => equipSheet(S, R, eqCode));
    ctx.forEach((fn, i) => {
      let sh;
      try { sh = fn(); } catch (e) { console.error(e); sh = new DRW.Sheet(W, H); sh.text(40, 60, 'Lỗi lập bản vẽ: ' + e.message, { h: 5 }); }
      // cập nhật số tờ
      for (const it of sh.items) if (it.t === 't' && /^\d+\/\d+$/.test(it.s) === false && it.s === (undefined)) { /* noop */ }
      out.push({ code: list[i].code, title: list[i].title, sh });
    });
    // ghi số tờ vào khung tên
    out.forEach((o, i) => { o.sh.items.forEach(it => { if (it.t === 't' && it.s === 'undefined/undefined') it.s = `${String(i + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`; }); });
    return out;
  }

  return { build, pfd, pid, W, H };
})();
