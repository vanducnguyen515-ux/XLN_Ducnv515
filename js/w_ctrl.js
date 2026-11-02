'use strict';
/* ==========================================================================
   SimNước – GỢI Ý & KIỂM TRA BỘ ĐIỀU KHIỂN
   1. Đọc sơ đồ, nhận dạng các cặp "tác động – đo" thông dụng trong xử lý nước cấp/tái sử dụng/nước sạch:
      clo dư, pH keo tụ, liều keo tụ theo độ đục nước lắng, khử clo trước RO, pH nước cấp RO, ổn định nước sau RO
      (CO₂ + calcit, kiềm cuối), làm mềm vôi, ozone dư, flo hóa, ức chế ăn mòn phosphat, KMnO₄ – mangan,
      kết tủa CaF₂, pha trộn dòng tắt qua RO, tỷ lệ thu hồi RO theo LSI nước đặc.
   2. Thử số trên chính sơ đồ (giải ổn định ở min, max và quanh giá trị hiện tại): chiều tác động (thuận/nghịch),
      hệ số khuếch đại → Kp, giá trị đặt có đạt được trong [min, max] không, biến đo có chịu tác động không.
   3. Kiểm tra các bộ điều khiển đã có theo cùng cách.
   ========================================================================== */
const WCTL = (() => {
  const CL = new Set(['NaOCl', 'Cl2']), AMM = new Set(['NH4Cl', 'NH42SO4', 'NH3']);
  const BASE = new Set(['NaOH', 'lime', 'soda', 'NaHCO3', 'MgOH2']), ACID = new Set(['HCl', 'H2SO4', 'CO2', 'HNO3']);
  const COAG = { alum: 6.5, PACl: 7.0, AlCl3: 7.0, FeCl3: 6.5, Fe2SO43: 6.5 };      // pH keo tụ tối ưu thường dùng
  const MAIN = new Set(['out', 'perm', 'a', 'b', 'dist']);                           // cửa ra theo dòng chính
  const PASS = new Set(['pump', 'hx', 'mixer', 'dose']);                             // đơn vị "đi qua" khi tìm công trình kế tiếp

  /* ---------- đồ thị ---------- */
  function graph(P) {
    const by = {}, out = {}, inn = {};
    P.units.forEach(u => { by[u.id] = u; out[u.id] = []; inn[u.id] = []; });
    for (const l of P.links) { if (out[l.from[0]] && inn[l.to[0]]) { out[l.from[0]].push(l); inn[l.to[0]].push(l); } }
    // các đơn vị phía sau theo dòng chính (BFS) kèm đường ống dẫn tới
    const down = (id, ports = MAIN) => {
      const seen = new Set([id]), q = [id], res = [];
      while (q.length) {
        const x = q.shift();
        for (const l of out[x]) {
          if (!(x === id ? ports.has(l.from[1]) : MAIN.has(l.from[1]))) continue;   // từ đơn vị gốc: theo các cửa chỉ định; sau đó: dòng chính
          const y = l.to[0]; if (seen.has(y)) continue;
          seen.add(y); q.push(y); res.push({ u: by[y], via: l });
        }
      }
      return res;
    };
    const outLink = (id, port) => (out[id] || []).find(l => !port || l.from[1] === port);
    const inLink = id => (inn[id] || [])[0];
    const nextReal = id => down(id).find(d => !PASS.has(d.u.type));
    const ups = id => {      // các đơn vị phía trước theo dòng chính
      const seen = new Set([id]), q = [id], res = [];
      while (q.length) { const x = q.shift(); for (const l of inn[x]) { const y = l.from[0]; if (seen.has(y) || !MAIN.has(l.from[1])) continue; seen.add(y); q.push(y); res.push(by[y]); } }
      return res;
    };
    return { by, out, inn, down, outLink, inLink, nextReal, ups };
  }
  const stdLim = (P, k) => {
    const pr = P.units.find(u => u.type === 'product'), s = pr && WSTD[pr.p.std];
    const v = s && s.lim ? s.lim[k] : undefined;
    return Array.isArray(v) ? v : (typeof v === 'number' ? v : undefined);
  };
  const r2 = v => +(+v).toPrecision(2);

  /* ---------- 1. ứng viên theo quy tắc ---------- */
  function candidates(P) {
    const G = graph(P), C = [];
    const dtSim = +(P.sim && P.sim.dt) || 0.25;   // Ti ≥ 4 bước thời gian mô phỏng (tích phân không vượt nhịp)
    const add = (o) => { const c = Object.assign({ on: true, kp: 0.5, ti: 1, dir: 'dir', prep: null }, o); c.ti = +Math.max(c.ti, 4 * dtSim).toPrecision(2); C.push(c); };
    const doses = P.units.filter(u => u.type === 'dose');
    const nm = u => u.name || u.id;
    const refOut = (u, port) => { const l = G.outLink(u.id, port); return l ? l.id : null; };
    const refIn = u => { const l = G.inLink(u.id); return l ? l.id : 'U:' + u.id; };
    const hasAmm = doses.some(d => AMM.has(d.p.chem));
    for (const d of doses) {
      const chem = d.p.chem, ch = (WCHEM[chem] && WCHEM[chem].name) || chem, x0 = +d.p.dose || 0;
      const mode = d.p.mode || 'fixed';
      const fix = mode === 'fixed' ? null : () => { d.p.mode = 'fixed'; };
      const dn = G.down(d.id), nx = G.nextReal(d.id);
      // clo dư
      if (CL.has(chem)) {
        if (mode === 'ratio') continue;
        const ro = dn.find(x => x.u.type === 'ro');
        const tank = dn.find(x => x.u.type === 'tank'), prod = dn.find(x => x.u.type === 'product');
        const v = hasAmm ? 'Cl2tot' : 'Cl2f';
        if (ro && (!tank || dn.indexOf(ro) < dn.indexOf(tank))) {
          const pre = dn.find(x => ['filter', 'mf', 'ufs', 'gac'].includes(x.u.type) && dn.indexOf(x) < dn.indexOf(ro));
          if (pre) add({ key: 'clpre', title: 'Clo dư sau tiền xử lý (clo hóa sơ bộ trước RO)', why: `Liều ${ch} ở ${nm(d)} giữ clo tự do 0,3 mg/L sau ${nm(pre.u)} – kiểm soát bám bẩn sinh học trước màng; clo dư phải được khử trước RO.`,
            unit: d.id, param: 'dose', ref: refOut(pre.u, pre.u.type === 'filter' ? 'out' : (WU[pre.u.type].outs[0])), v: 'Cl2f', sp: 0.3, lo: 0, hi: Math.max(8, 4 * x0), ti: 1, prep: fix });
          continue;
        }
        const at = tank ? tank.u : prod ? prod.u : null; if (!at) continue;
        const sp = tank ? 0.8 : 0.5;
        add({ key: 'cl', title: (hasAmm ? 'Clo tổng (cloramin)' : 'Clo dư') + (tank ? ' sau bể tiếp xúc' : ' nước thành phẩm'),
          why: `Liều ${ch} ở ${nm(d)} giữ ${hasAmm ? 'clo tổng' : 'clo tự do'} ${XF(sp)} mg/L ${tank ? 'ở đầu ra ' + nm(at) + ' (CT khử trùng đủ, còn dư cho mạng lưới)' : 'trong nước thành phẩm'} – QCVN 01-1:2018 clo dư 0,2 – 1,0 mg/L. Ti dài vì trễ thời gian lưu bể.`,
          unit: d.id, param: 'dose', ref: tank ? refOut(at, 'out') : refIn(at), v, sp, lo: 0, hi: Math.max(10, 5 * x0), ti: tank ? 2 : 1, prep: fix });
        continue;
      }
      if (mode !== 'fixed' && !(BASE.has(chem) || ACID.has(chem))) continue;
      // axit / bazơ
      if (BASE.has(chem) || ACID.has(chem)) {
        if (mode === 'pH') continue;      // đã là điều chỉnh pH lý tưởng của đơn vị châm
        const acid = ACID.has(chem), t = nx ? nx.u.type : '';
        const coagD = [...G.ups(d.id).slice(0, 4), ...dn.slice(0, 4).map(x => x.u)].find(u => u.type === 'dose' && COAG[u.p.chem] !== undefined);
        const hi = Math.max(chem === 'CO2' ? 60 : 50, 4 * x0);
        if (t === 'coag' || t === 'settler') {
          const tgt = nx.u, sp = coagD ? COAG[coagD.p.chem] : 6.8;
          add({ key: 'phc', title: 'pH keo tụ', why: `${ch} ở ${nm(d)} giữ pH sau ${nm(tgt)} = ${XF(sp)}${coagD ? ' – vùng tối ưu cho ' + ((WCHEM[coagD.p.chem] || {}).name || coagD.p.chem) : ''}: hiệu quả keo tụ và nhôm/sắt dư phụ thuộc mạnh vào pH.`,
            unit: d.id, param: 'dose', ref: refOut(tgt, 'out'), v: 'pH', sp, lo: 0, hi, ti: 0.5 });
        } else if (t === 'ro' && acid) {
          add({ key: 'phro', title: 'pH nước cấp RO', why: `${ch} ở ${nm(d)} hạ pH nước cấp RO về 6,5 – giảm LSI nước đặc (cáu cặn CaCO₃), cho phép tỷ lệ thu hồi cao hơn.`,
            unit: d.id, param: 'dose', ref: refIn(nx.u), v: 'pH', sp: 6.5, lo: 0, hi, ti: 0.5 });
        } else if (t === 'remin' && chem === 'CO2') {
          add({ key: 'remin', title: 'Độ kiềm sau tái khoáng', why: `CO₂ ở ${nm(d)} quyết định lượng calcit hòa tan trong ${nm(nx.u)} → giữ độ kiềm sau bể calcit 80 mgCaCO₃/L (nước sau RO ổn định, ít ăn mòn).`,
            unit: d.id, param: 'dose', ref: refOut(nx.u, 'out'), v: 'alk', sp: 80, lo: 0, hi, ti: 1 });
        } else if (t === 'precip' || t === 'soften') {
          continue;
        } else {
          const prod = dn.find(x => x.u.type === 'product');
          const lowTDS = G.ups(d.id).some(u => ['ro', 'edi', 'ix', 'evap', 'remin'].includes(u.type));
          if (prod) add({ key: 'phf', title: lowTDS ? 'Ổn định nước thành phẩm (LSI)' : 'pH nước thành phẩm',
            why: lowTDS ? `${ch} ở ${nm(d)} điều chỉnh nước sau màng/khử khoáng tới LSI ≈ 0 (không ăn mòn, không đóng cặn) – tham chiếu thêm CCPP 0 – 4 mgCaCO₃/L.` : `${ch} ở ${nm(d)} giữ pH nước thành phẩm 7,5 (QCVN 01-1: 6,0 – 8,5; giảm ăn mòn đường ống).`,
            unit: d.id, param: 'dose', ref: refIn(prod.u), v: lowTDS ? 'LSI' : 'pH', sp: lowTDS ? 0 : 7.5, lo: 0, hi, ti: 0.5 });
        }
        continue;
      }
      // keo tụ
      if (COAG[chem] !== undefined) {
        const st = dn.find(x => x.u.type === 'settler'), fl = dn.find(x => x.u.type === 'filter' || x.u.type === 'mf');
        const at = st ? st.u : fl ? fl.u : null; if (!at) continue;
        const sp = st ? 1.5 : 0.3;
        add({ key: 'coag', title: 'Liều keo tụ theo độ đục ' + (st ? 'nước lắng' : 'nước lọc'),
          why: `Liều ${ch} ở ${nm(d)} giữ độ đục sau ${nm(at)} ≈ ${XF(sp)} NTU khi nước nguồn biến động. Khoảng liều giới hạn quanh liều hiện tại (0,3 – 3 lần) vì quan hệ liều – độ đục không đơn điệu (tái ổn định khi quá liều) – nên kiểm chứng bằng Jartest.`,
          unit: d.id, param: 'dose', ref: refOut(at, 'out'), v: 'turb', sp, lo: r2(0.3 * x0 || 1), hi: r2(Math.max(3 * x0, 10)), ti: 1 });
        continue;
      }
      if (chem === 'NaHSO3') {
        const ro = dn.find(x => x.u.type === 'ro'); if (!ro) continue;
        add({ key: 'dechl', title: 'Khử clo trước RO', why: `NaHSO₃ ở ${nm(d)} giữ clo tự do vào ${nm(ro.u)} ≤ 0,02 mg/L – màng polyamit bị oxy hóa bởi clo. Thực tế đo ORP; dư bisulfit nhẹ là chấp nhận được.`,
          unit: d.id, param: 'dose', ref: refIn(ro.u), v: 'Cl2f', sp: 0.02, lo: 0, hi: Math.max(10, 4 * x0), ti: 0.25 });
        continue;
      }
      if (chem === 'KMnO4') {
        const fl = dn.find(x => ['filter', 'settler', 'mf'].includes(x.u.type)); if (!fl) continue;
        add({ key: 'mn', title: 'Mangan sau lọc', why: `KMnO₄ ở ${nm(d)} oxy hóa Mn²⁺ → giữ Mn tổng sau ${nm(fl.u)} 0,02 mg/L (QCVN 01-1: ≤ 0,1); quá liều gây nước hồng.`,
          unit: d.id, param: 'dose', ref: refOut(fl.u, 'out'), v: 'Mn', sp: 0.02, lo: 0, hi: Math.max(5, 4 * x0), ti: 1 });
        continue;
      }
      if (chem === 'NaF') {
        const prod = dn.find(x => x.u.type === 'product'); if (!prod) continue;
        add({ key: 'f', title: 'Florua nước thành phẩm', why: `NaF ở ${nm(d)} giữ florua 0,7 mg/L (mức khuyến cáo phòng sâu răng; QCVN 01-1 ≤ 1,5 mg/L).`,
          unit: d.id, param: 'dose', ref: refIn(prod.u), v: 'F', sp: 0.7, lo: 0, hi: 3, ti: 1 });
        continue;
      }
      if (chem === 'H3PO4') {
        const prod = dn.find(x => x.u.type === 'product'); if (!prod) continue;
        add({ key: 'po4', title: 'Phosphat ức chế ăn mòn', why: `Ortho-phosphat ở ${nm(d)} giữ 0,8 mgP/L trong nước thành phẩm (giảm hòa tan chì/đồng từ đường ống).`,
          unit: d.id, param: 'dose', ref: refIn(prod.u), v: 'PO4', sp: 0.8, lo: 0, hi: 5, ti: 1 });
        continue;
      }
      if ((chem === 'CaCl2' || chem === 'lime') && dn.some(x => x.u.type === 'precip')) {
        const st = dn.find(x => x.u.type === 'settler') || dn.find(x => x.u.type === 'precip');
        const lim = stdLim(P, 'F'), sp = typeof lim === 'number' ? r2(0.8 * lim) : 5;
        add({ key: 'caf2', title: 'Florua sau kết tủa CaF₂', why: `${ch} ở ${nm(d)} cấp Ca²⁺ cho kết tủa CaF₂ → giữ F sau ${nm(st.u)} = ${XF(sp)} mg/L (80 % giới hạn xả).`,
          unit: d.id, param: 'dose', ref: refOut(st.u, 'out'), v: 'F', sp, lo: 0, hi: Math.max(3 * x0, 500), ti: 1 });
      }
    }
    // làm mềm vôi liều cố định
    for (const s of P.units.filter(u => u.type === 'soften' && u.p.mode === 'fixed'))
      add({ key: 'soft', title: 'Độ cứng sau làm mềm', why: `Liều vôi ở ${s.name} giữ độ cứng tổng sau làm mềm 120 mgCaCO₃/L (cân bằng giữa hiệu quả và bùn/vôi tiêu thụ).`,
        unit: s.id, param: 'lime', ref: refOut(s, 'out'), v: 'hard', sp: 120, lo: 0, hi: Math.max(3 * (+s.p.lime || 100), 300), ti: 1 });
    // ozone dư
    for (const o of P.units.filter(u => u.type === 'ozone'))
      add({ key: 'o3', title: 'Ozone dư sau bể tiếp xúc', why: `Liều ozone ở ${o.name} giữ ozone dư 0,2 mg/L ở đầu ra (đủ CT khử trùng/oxy hóa, hạn chế bromat và tiêu thụ điện).`,
        unit: o.id, param: 'dose', ref: refOut(o, 'out'), v: 'O3', sp: 0.2, lo: 0.2, hi: Math.max(10, 3 * (+o.p.dose || 2)), ti: 0.25 });
    // RO: tỷ lệ thu hồi theo LSI nước đặc (tối ưu hóa – mặc định không chọn)
    for (const ro of P.units.filter(u => u.type === 'ro')) {
      const as = G.ups(ro.id).some(u => u.type === 'dose' && u.p.chem === 'AS'), sp = as ? 1.8 : 0.5;
      const ref = refOut(ro, 'conc'); if (!ref) continue;
      add({ key: 'rorec', on: false, title: 'Tỷ lệ thu hồi RO tối đa theo LSI nước đặc', why: `Tối ưu hóa: tăng tỷ lệ thu hồi của ${ro.name} tới khi LSI nước đặc = ${XF(sp)} (${as ? 'có chất chống cáu cặn – giới hạn thường 1,8 – 2,5' : 'không có chất chống cáu cặn'}). Đây là bài toán thiết kế/vận hành, không phải vòng điều khiển nhanh.`,
        unit: ro.id, param: 'rec', ref, v: 'LSI', sp, lo: 40, hi: 90, ti: 4 });
    }
    // pha trộn dòng tắt qua màng/khử khoáng
    for (const sp of P.units.filter(u => u.type === 'splitter' && (u.p.mode || 'frac') === 'frac')) {
      const la = G.outLink(sp.id, 'a'), lb = G.outLink(sp.id, 'b'); if (!la || !lb) continue;
      const pathA = [G.by[la.to[0]], ...G.down(la.to[0]).map(x => x.u)], pathB = [G.by[lb.to[0]], ...G.down(lb.to[0]).map(x => x.u)];
      const mix = pathA.find(u => u.type === 'mixer' && pathB.includes(u)); if (!mix) continue;
      const treat = u => ['ro', 'edi', 'ix', 'evap', 'soften'].includes(u.type);
      const upto = (path) => path.slice(0, path.indexOf(mix));
      const ta = upto(pathA).some(treat), tb = upto(pathB).some(treat);
      if (ta === tb) continue;
      const lim = stdLim(P, 'TDS'), tds = typeof lim === 'number' ? Math.min(500, r2(0.5 * lim)) : 300;
      add({ key: 'blend', title: 'Pha trộn dòng tắt (TDS sau hòa trộn)', why: `Tỷ lệ chia ở ${sp.name} (nhánh ${tb ? 'A' : 'B'} là dòng tắt không qua ${ta ? upto(pathA).find(treat).name : upto(pathB).find(treat).name}) giữ TDS sau ${mix.name} = ${XF(tds)} mg/L – tăng sản lượng, giảm điện; kiểm tra thêm NO₃, F, B nhánh tắt.`,
        unit: sp.id, param: 'frac', ref: refOut(mix, 'out'), v: 'TDS', sp: tds, lo: 0, hi: 100, ti: 1 });
    }
    return C.filter(c => c.ref);
  }
  const XF = v => (typeof fmt === 'function' ? fmt(v) : String(v));

  /* ---------- 2. thử số trên sơ đồ ---------- */
  function probe(P, c) {
    const Pc = JSON.parse(JSON.stringify(P)); Pc.ctrls = [];
    const sys = WSIM.compile(Pc);
    if (sys.errors.length) return { err: sys.errors[0] };
    const u = sys.byId[c.unit]; if (!u) return { err: 'không tìm thấy đơn vị tác động' };
    if (c.prep) { if (u.type === 'dose') u.p.mode = 'fixed'; }
    if (u.type === 'dose' && u.p.mode !== 'fixed' && c.param === 'dose') u.p.mode = 'fixed';
    let prevS = null;
    const m = x => { u.p[c.param] = x; const r = WSIM.solve(sys, { prevS }); prevS = r.S; return WSIM.measure(sys, r, c.ref, c.v); };
    const x0 = +u.p[c.param], lo = +c.lo, hi = +c.hi;
    const ml = m(lo), mh = m(hi), m0 = m(Math.min(Math.max(x0, lo), hi));
    if (![ml, mh, m0].every(isFinite)) return { err: 'không đo được biến tại điểm đo' };
    const span = Math.abs(mh - ml), scale = Math.max(Math.abs(ml), Math.abs(mh), Math.abs(+c.sp), 1e-3);
    if (span < 1e-6 * scale) return { insens: true, ml, mh, m0 };
    const K = (mh - ml) / (hi - lo);
    const lo2 = Math.min(ml, mh), hi2 = Math.max(ml, mh);
    // tính đơn điệu (thô): giá trị giữa khoảng
    const mm = m(0.5 * (lo + hi));
    const mono = (mm - ml) * (mh - mm) >= -1e-9 * scale;
    // Kp = 0,25/|K|: quá trình trong mô hình phản hồi gần như tức thời (đo của bước trước) → khuếch đại vòng mỗi bước ≈ 0,25·(1 + dt/Ti), ổn định không dao động
    return { ml, mh, m0, mm, K, dir: K > 0 ? 'dir' : 'rev', reach: +c.sp >= lo2 - 1e-9 && +c.sp <= hi2 + 1e-9, mono, kp: r2(0.25 / Math.abs(K)) };
  }

  /* ---------- 3. kiểm tra bộ điều khiển đã có ---------- */
  function check(P, c) {
    const out = [], G = graph(P), u = G.by[c.unit];
    if (!u) return [['err', 'đơn vị tác động không còn trong sơ đồ']];
    if (!(+c.lo < +c.hi)) out.push(['err', 'min phải nhỏ hơn max']);
    if (u.type === 'dose' && c.param === 'dose' && (u.p.mode || 'fixed') !== 'fixed') out.push(['err', `đơn vị châm đang ở chế độ "${u.p.mode === 'pH' ? 'điều chỉnh pH' : 'tỉ lệ Cl₂:N'}" – liều do đơn vị tự tính, bộ điều khiển không có tác dụng (đổi chế độ sang "Liều cố định")`]);
    const refU = c.ref && c.ref.startsWith('U:') ? c.ref.slice(2) : (P.links.find(l => l.id === c.ref) || { from: [] }).from[0];
    if (refU && refU !== c.unit && !G.down(c.unit, new Set(WU[u.type].outs)).some(x => x.u.id === refU))
      out.push(['warn', 'điểm đo không nằm phía sau đơn vị tác động theo dòng chảy – có thể không chịu tác động (trừ khi qua dòng tuần hoàn)']);
    if (!out.some(x => x[0] === 'err')) {
      const pr = probe(P, c);
      if (pr.err) out.push(['err', pr.err]);
      else if (pr.insens) out.push(['err', `biến đo không thay đổi khi ${c.param} chạy từ ${XF(c.lo)} đến ${XF(c.hi)} – chọn điểm đo/biến đo khác`]);
      else {
        if (!pr.reach) out.push(['warn', `giá trị đặt ${XF(c.sp)} nằm ngoài khoảng đạt được ${XF(Math.min(pr.ml, pr.mh))} – ${XF(Math.max(pr.ml, pr.mh))} (ứng với min – max) → bộ điều khiển sẽ bão hòa`]);
        if ((c.dir || 'dir') !== pr.dir) out.push(['err', `chiều tác động sai: tăng ${c.param} làm biến đo ${pr.K > 0 ? 'tăng' : 'giảm'} → chọn "${pr.dir === 'dir' ? 'thuận' : 'nghịch'}" (sai chiều thì PI khi chạy theo thời gian sẽ đẩy ra xa giá trị đặt)`, { dir: pr.dir }]);
        if (!pr.mono) out.push(['warn', 'quan hệ tác động – đo không đơn điệu trong [min, max] – thu hẹp khoảng quanh điểm làm việc']);
        const kpOk = +c.kp > 0 && +c.kp <= 5 * pr.kp && +c.kp >= 0.05 * pr.kp;
        if (!kpOk) out.push(['warn', `Kp = ${XF(c.kp)} khác nhiều mức gợi ý ${XF(pr.kp)} (= 0,25 / hệ số khuếch đại ${XF(Math.abs(pr.K))})`, { kp: pr.kp }]);
        const dtSim = +(P.sim && P.sim.dt) || 0.25;
        if (+c.ti < 2 * dtSim) out.push(['warn', `Ti = ${XF(c.ti)} h ngắn so với bước thời gian mô phỏng ${XF(dtSim)} h – tích phân vượt nhịp, dễ dao động (nên ≥ ${XF(4 * dtSim)} h)`, { ti: +(4 * dtSim).toPrecision(2) }]);
      }
    }
    return out;
  }

  /* ---------- giao diện ---------- */
  function refName(P, ref) {
    if (!ref) return '–';
    if (ref.startsWith('U:')) { const u = P.units.find(x => x.id === ref.slice(2)); return 'vào ' + (u ? u.name : ref); }
    const l = P.links.find(x => x.id === ref); return l ? wLinkName(l) : ref;
  }
  const vName = v => { const m = W_MEAS.find(x => x[0] === v); return m ? m[1] : v; };

  function suggestUI(host, onAdd) {
    const P = WAPP.P;
    host.innerHTML = '<div class="msg">Đang đọc sơ đồ và thử số từng phương án…</div>';
    setTimeout(() => {
      let C = candidates(P).filter(c => !P.ctrls.some(x => x.unit === c.unit && x.param === c.param));
      const res = C.map(c => {
        let pr; try { pr = probe(P, c); } catch (e) { pr = { err: e.message }; }
        if (!pr.err && !pr.insens && !pr.mono) {
          const vals = [pr.ml, pr.mm, pr.mh, pr.m0], mn = Math.min(...vals), mx = Math.max(...vals);
          const ext = pr.m0 <= mn + 1e-12 ? 'nhỏ nhất' : pr.m0 >= mx - 1e-12 ? 'lớn nhất' : null;
          c.why += ext ? ` Kết quả thử: biến đo ${ext} (${XF(pr.m0)}) ở gần giá trị tác động hiện tại – điểm làm việc đang ở cực trị, bộ điều khiển phản hồi không xác định được hướng tác động; giữ giá trị cố định (theo Jartest) hoặc thu hẹp [min, max] về một phía.`
            : ' Kết quả thử: quan hệ không đơn điệu trong [min, max] – thu hẹp khoảng tác động trước khi dùng.';
          c.on = false;
        }
        if (!pr.err && !pr.insens && !pr.reach && pr.mono) {
          const lo2 = Math.min(pr.ml, pr.mh), hi2 = Math.max(pr.ml, pr.mh);
          // mục tiêu "giữ hiệu quả hiện có" (độ đục nước lắng, TDS hòa trộn): đặt bằng giá trị hiện tại khi mức chuẩn không đạt được
          if (['coag', 'blend'].includes(c.key) && pr.m0 >= lo2 && pr.m0 <= hi2) {
            c.why += ` Mức ${XF(c.sp)} không đạt được trong khoảng tác động (${XF(lo2)} – ${XF(hi2)}) → đặt bằng giá trị hiện tại ${XF(r2(pr.m0))} để giữ hiệu quả đang có khi nước nguồn biến động.`;
            c.sp = r2(pr.m0); pr.reach = true;
          }
          if (c.key === 'rorec' && +c.sp > hi2) c.why += ` Kết quả thử: LSI nước đặc chỉ ${XF(hi2)} ở thu hồi ${XF(c.hi)} % – cáu cặn CaCO₃ không phải giới hạn; thu hồi bị giới hạn bởi áp suất, silica, thông lượng hoặc chất lượng nước thấm.`;
        }
        return { c, pr };
      });
      if (!res.length) {
        host.innerHTML = `<div class="msg warn">Không tìm thấy cặp tác động – đo phù hợp chưa có bộ điều khiển. Gợi ý cần: đơn vị châm hóa chất (clo, axit/bazơ, keo tụ, NaHSO₃, KMnO₄, NaF, phosphat, CaCl₂) có công trình phía sau, làm mềm vôi liều cố định, ozone, RO, hoặc bộ chia – hòa trộn quanh RO/IX.${P.ctrls.length ? ' Các cặp đã có bộ điều khiển được bỏ qua.' : ''}</div>`;
        return;
      }
      const sym = r => r.pr.err ? `<span style="color:var(--bad)">✖ ${esc(r.pr.err)}</span>` : r.pr.insens ? '<span style="color:var(--bad)">✖ biến đo không chịu tác động</span>'
        : `${r.pr.reach ? '<span style="color:var(--ok)">✔ đạt được</span>' : '<span style="color:var(--warn)">⚠ ngoài khoảng ' + XF(Math.min(r.pr.ml, r.pr.mh)) + ' – ' + XF(Math.max(r.pr.ml, r.pr.mh)) + '</span>'}${r.pr.mono ? '' : ' <span style="color:var(--warn)">· không đơn điệu</span>'}<br><span class="muted">hiện tại ${XF(r.pr.m0)} · chiều ${r.pr.dir === 'dir' ? 'thuận' : 'nghịch'} · Kp ${XF(r.pr.kp)}</span>`;
      const ok = r => !r.pr.err && !r.pr.insens;
      const box = el(`<div style="margin-top:10px"><table class="t"><tr><th></th><th class="l">Bộ điều khiển gợi ý</th><th class="l">Mục đích & cách hoạt động</th><th class="l">Tác động → đo</th><th class="l">Thử trên sơ đồ</th></tr></table>
        <div class="btnrow"><button class="pri" id="sgAdd">Thêm các mục đã chọn</button><span class="small muted">Chiều tác động và Kp lấy theo thử số trên sơ đồ; Ti theo trễ công trình. Sau khi thêm: "Tính ổn định" để tìm giá trị tác động.</span></div></div>`);
      const t = box.querySelector('table');
      res.forEach((r, i) => {
        const c = r.c, u = P.units.find(x => x.id === c.unit);
        const on = ok(r) && c.on && r.pr.reach !== false;
        t.appendChild(el(`<tr><td><input type="checkbox" data-i="${i}"${on ? ' checked' : ''}${ok(r) ? '' : ' disabled'}></td><td class="l"><b>${esc(c.title)}</b></td>
          <td class="l small" style="white-space:normal;max-width:460px">${esc(c.why)}</td>
          <td class="l small" style="white-space:normal;max-width:300px">${esc(u ? u.name : c.unit)} · ${esc(c.param)} ∈ [${XF(c.lo)}; ${XF(c.hi)}]<br>→ ${esc(vName(c.v))} tại ${esc(refName(P, c.ref))}, đặt <b>${XF(c.sp)}</b> · Ti ${XF(c.ti)} h</td>
          <td class="l small" style="white-space:normal">${sym(r)}</td></tr>`));
      });
      box.querySelector('#sgAdd').onclick = () => {
        const picked = [...t.querySelectorAll('input:checked')].map(x => res[+x.dataset.i]);
        for (const { c, pr } of picked) {
          if (c.prep) c.prep();
          const u = P.units.find(x => x.id === c.unit); if (u && u.type === 'dose' && c.param === 'dose') u.p.mode = 'fixed';
          let i = 1; while (P.ctrls.some(x => x.id === 'C' + i)) i++;
          P.ctrls.push({ id: 'C' + i, name: c.title, on: true, unit: c.unit, param: c.param, ref: c.ref, v: c.v, sp: c.sp, lo: c.lo, hi: c.hi, kp: pr.kp || c.kp, ti: c.ti, dir: pr.dir || c.dir });
        }
        if (picked.length) onAdd(picked.length);
      };
      host.innerHTML = ''; host.appendChild(box);
    }, 30);
  }

  function checkUI(host) {
    const P = WAPP.P;
    if (!P.ctrls.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="msg">Đang kiểm tra bộ điều khiển…</div>';
    setTimeout(() => {
      const rows = [];
      for (const c of P.ctrls) { let r; try { r = check(P, c); } catch (e) { r = [['err', e.message]]; } rows.push({ c, r }); }
      host.innerHTML = '';
      const bad = rows.filter(x => x.r.length);
      if (!bad.length) { host.appendChild(el(`<div class="msg ok">${P.ctrls.length} bộ điều khiển: chiều tác động, khoảng tác động, giá trị đặt và Kp hợp lý (thử trên sơ đồ).</div>`)); return; }
      for (const { c, r } of bad) for (const [lv, txt, fix] of r) {
        const m = el(`<div class="msg ${lv === 'err' ? 'err' : 'warn'}"><b>${esc(c.name || c.id)}:</b> ${esc(txt)} ${fix ? '<button style="margin-left:8px">Sửa</button>' : ''}</div>`);
        if (fix) m.querySelector('button').onclick = () => { Object.assign(c, fix); wChanged('ctrl'); wRenderCtrl(); };
        host.appendChild(m);
      }
    }, 30);
  }
  return { candidates, probe, check, suggestUI, checkUI, graph };
})();
