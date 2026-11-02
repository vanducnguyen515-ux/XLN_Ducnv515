'use strict';
/* ==========================================================================
   XLNuoc – kiến thức chọn công nghệ và bộ khuyến cáo phương án tối ưu.
   Nguồn: MWH Water Treatment 3rd ed. (Ch. 9 – 12, 17, 21), TCXDVN 33:2006, QCVN 01-1:2018/BYT và bài học đã chốt trong CLAUDE.md
   (§10 so sánh 4 phương án: kiểu bể lắng quyết định CAPEX + mặt bằng, kiểu bể lọc quyết định OPEX; §13 lamen kém chịu sốc độ đục,
   lọc áp lực chỉ đáng khi Q < ~5.000 m³/ngđ, Texler rộng > 17 m cần Leopold + CFD).
   recommend(P, w) dựng và tính toàn bộ các dây chuyền khả thi bằng cùng một bộ module (XLNG) → so sánh giá thành, vốn đầu tư,
   diện tích, độ an toàn vận hành và số chỉ tiêu chưa đạt; trả về bảng xếp hạng + lý do cho từng khâu.
   ========================================================================== */
const XLNK = (() => {
  const TECH = XLNG.TECH;
  const vn = (x, d) => (+x).toLocaleString('vi-VN', { maximumFractionDigits: d === undefined ? 0 : d });

  /* ---------- ưu / nhược (hiển thị trong bảng khuyến cáo) ---------- */
  const PROS = {
    presed: ['Cắt đỉnh độ đục mùa lũ, bảo vệ bể lắng lamen (CLAUDE §13)', 'Thêm một công trình và diện tích; bùn cát thô cần nạo vét'],
    aer: ['Khử Fe²⁺, CO₂, tăng pH không cần hóa chất (TCXDVN 33:2006)', 'Mn²⁺ cần oxy hóa mạnh (KMnO₄ / Cl₂) + vật liệu lọc xúc tác MnO₂'],
    texler: ['Tấm lớn 55°, tải trọng bề mặt tới 4,2 m/h, thu bùn CT2 liên tục, giới hạn thiết kế rõ (Leopold P9.007)', 'Thiết bị độc quyền; bể rộng > 17 m cần Leopold xác nhận + CFD; tấm là vật tư 10 – 15 năm'],
    lamella: ['Diện tích bằng ~½ lắng ngang, vốn đầu tư thấp nhất (CLAUDE §10 – PA3)', 'Kém chịu sốc độ đục > 500 NTU (lưu nước ~1 h); module ống là vật tư tiêu hao 10 – 15 năm; phải xả bùn liên tục'],
    horiz: ['Chịu sốc độ đục tốt (lưu nước 1,5 – 4 h), BTCT bền 50 năm, vận hành đơn giản', 'Diện tích lớn nhất (~2× lamen), vốn đầu tư cao hơn (CLAUDE §10 – PA1)'],
    daf: ['Hiệu quả nhất với tảo, độ màu, độ đục thấp; bùn nổi đặc 2 – 3 % (MWH §10-9)', 'Tốn điện bơm tuần hoàn bão hòa khí; không hợp nước độ đục cao (> 100 NTU) hay lũ'],
    none: ['Không có bể lắng: rẻ nhất, gọn nhất, ít bùn', 'Chỉ khi nước nguồn ổn định: độ đục ≤ 10 – 15 NTU, màu ≤ 20, tảo thấp (MWH §11)'],
    xa: ['Đan XA rửa gió + nước đồng thời, phân phối ±4 %, cát thô sâu chu kỳ dài (Leopold P9.016)', 'Thiết bị độc quyền, chi phí đan + IMS 200'],
    rgf: ['Phổ biến, theo TCXDVN 33:2006, vật liệu và thi công trong nước', 'Vận tốc lọc thấp (5 – 8,5 m/h) → diện tích lọc lớn hơn'],
    dual: ['Vận tốc lọc cao 8 – 12 m/h, chứa cặn sâu, chu kỳ dài (MWH Bảng 11-11)', 'Than antraxit đắt, dễ trôi khi rửa – không rửa gió + nước đồng thời'],
    press: ['Gọn, lắp theo module, không cần đào sâu – hợp nền yếu / nước ngầm cao', 'Dây chuyền phải có bơm trung gian (tốn điện); không quan sát được VLL; chỉ kinh tế khi Q < ~5.000 m³/ngđ (CLAUDE §10)'],
    uf: ['Rào cản vi sinh tuyệt đối (Giardia, Crypto ≥ 4-log), độ đục ra < 0,1 NTU ổn định, nhỏ gọn (MWH Ch.12)', 'Vốn đầu tư và chi phí vận hành cao nhất; thay màng 5 – 10 năm; cần bơm cấp màng'],
    slow: ['Không cần hóa chất keo tụ, vận hành đơn giản, khử vi sinh tốt', 'Diện tích rất lớn; chỉ cho nước nguồn ≤ 10 NTU và quy mô nhỏ'],
    gac: ['Khử mùi vị, TOC, tiền chất THM, thuốc BVTV', 'Phải thay / hoàn nguyên than định kỳ'],
    ro: ['Khử mặn – đưa TDS về ≤ 1.000 mg/L (QCVN 01-1:2018)', 'Tốn điện 0,5 – 1 kWh/m³, thải 15 – 25 % nước muối đậm đặc, tiền xử lý nghiêm ngặt']
  };

  /* ---------- dây chuyền ứng viên ---------- */
  function candidates(P) {
    const q = P.q, Q = P.Q, gw = P.src === 'ngam', out = [];
    const sl = Q >= 50000 ? 'centri' : Q >= 8000 ? 'belt' : 'bed';
    const adv = [];
    if (q.TDS > 1000) adv.push('ro');
    if (q.TOC > 4 || q.algae > 20000 || P.taste) adv.push('gac');
    const dis = P.uv ? 'uv' : 'naocl';
    const add = (o, why) => out.push({ ch: Object.assign({ pre: 'none', mix: 'mech', floc: 'mech', adv: adv.slice(), dis, sl }, o), why: why || '' });
    if (gw) {
      const cls = q.Fe > 5 ? ['lamella', 'none'] : ['none'];
      for (const clar of cls) for (const filt of ['rgf', 'dual', ...(Q <= 10000 ? ['press'] : [])]) add({ pre: 'aer', clar, filt, mix: clar === 'none' ? 'mech' : 'mech' }, '');
      return out;
    }
    const shock = q.NTU > 500, flood = q.NTU > 1000;
    const clars = [];
    if (Q >= 10000) clars.push('texler');
    clars.push('lamella');
    if (Q >= 15000) clars.push('horiz');
    if (q.NTU <= 100) clars.push('daf');
    if (q.NTU <= 15 && q.color <= 30 && q.algae < 5000) clars.push('none');
    const filts = ['rgf', 'dual'];
    if (Q >= 10000) filts.push('xa');
    if (Q <= 10000) filts.push('press');
    if (q.NTU <= 10 && Q <= 5000) filts.push('slow');
    filts.push('uf');
    for (const clar of clars) for (const filt of filts) {
      if (clar === 'none' && filt === 'slow') continue;
      const pres = flood || (shock && (clar === 'lamella' || clar === 'texler')) ? ['presed'] : ['none'];
      if (shock && !flood && (clar === 'lamella' || clar === 'texler')) pres.push('none');
      for (const pre of pres) {
        add({ pre, clar, filt });
        if (Q <= 30000 && clar !== 'none') add({ pre, clar, filt, floc: 'hyd' });
      }
    }
    return out;
  }

  /* ---------- độ an toàn vận hành theo chất lượng nguồn (0 – 1) ---------- */
  function robust(ch, q) {
    let r = 1;
    const shock = q.NTU > 500, alg = q.algae > 5000, low = q.NTU < 10;
    const C = { horiz: [1, 0.5, 0.75], texler: [0.65, 0.65, 0.8], lamella: [0.55, 0.6, 0.75], daf: [0.15, 1, 1], none: [0.1, 0.3, 1] }[ch.clar] || [1, 1, 1];
    if (shock) r *= ch.pre === 'presed' ? Math.min(1, C[0] + 0.3) : C[0];
    if (alg) r *= C[1];
    if (low) r *= C[2];
    if (ch.clar === 'daf' && q.NTU > 50) r *= 0.7;            // DAF kém với độ đục > 50 NTU (bông nặng)
    if (ch.clar === 'none' && q.NTU > 10) r *= 0.7;
    if (ch.pre === 'aer' && ch.clar === 'none' && q.Fe > 5) r *= q.Fe > 10 ? 0.5 : 0.7;   // nhiều bông Fe(OH)₃ → chu kỳ lọc ngắn khi không lắng
    r *= { uf: 1, xa: 0.95, dual: 0.9, rgf: 0.88, press: 0.75, slow: 0.8 }[ch.filt] || 0.85;
    if (ch.floc === 'hyd') r *= 0.95;          // không điều chỉnh được G theo mùa
    if (ch.mix === 'stat') r *= 0.97;
    return r;
  }

  /* ---------- xếp hạng ---------- */
  // w: trọng số {cost: giá thành đầy đủ, capex, area, robust} (tổng tùy ý, tự chuẩn hóa)
  function recommend(P, w) {
    w = Object.assign({ cost: 35, capex: 25, area: 15, robust: 25 }, w || {});
    const sw = w.cost + w.capex + w.area + w.robust || 1;
    const C = candidates(P), R = [];
    for (const c of C) {
      let M;
      try { M = XLNG.run(Object.assign({}, P, { chain: c.ch, ov: {} })); } catch (e) { console.warn('XLNK', e); continue; }
      const g = k => { const t = M.keys[k]; return t ? M.book.get(t[0], t[1]) : NaN; };
      const fails = M.checks.filter(x => !String(M.vals[x.sheet][x.addr]).startsWith('ĐẠT')).map(x => x.l + ': ' + M.vals[x.sheet][x.addr]);
      let area = 0;   // diện tích công trình ≈ Σ dung tích xây dựng / chiều cao (xấp xỉ 5 m), riêng sân phơi và lọc chậm theo diện tích
      for (const k of ['ps_Vc', 'ae_Vc', 'mx_Vc', 'fl_Vc', 'cl_Vc', 'f_Vc', 'bw_Vc', 'gac_Vc', 'ds_Vc', 'sl_Vc']) { const v = g(k); if (isFinite(v)) area += v / (k === 'ds_Vc' ? 5.5 : k === 'f_Vc' ? (c.ch.filt === 'slow' ? 2.8 : 6) : 5); }
      if (isFinite(g('sl_Ab'))) area += g('sl_Ab');
      if (c.ch.filt === 'press' || c.ch.filt === 'uf') area += g('f_At') ? (c.ch.filt === 'uf' ? g('f_At') / 400 : g('f_At') * 1.6) : 0;
      R.push({ ch: c.ch, txt: M.chainTxt, cost: g('op_full'), opex: g('op_u'), capex: g('cp_TM'), sE: g('op_sE'), area, rob: robust(c.ch, P.q), fails, nChk: M.checks.length, leo: XLNG.isLeopold(c.ch) });
    }
    if (!R.length) return { list: [], notes: [] };
    const min = k => Math.min(...R.map(r => r[k]).filter(isFinite));
    const mc = min('cost'), mk = min('capex'), ma = min('area');
    for (const r of R) {
      const pc = (r.cost / mc - 1), pk = (r.capex / mk - 1), pa = (r.area / ma - 1);
      r.score = 100 - (w.cost * Math.min(pc, 1.5) * 100 + w.capex * Math.min(pk, 1.5) * 100 + w.area * Math.min(pa, 1.5) * 60 + w.robust * (1 - r.rob) * 100) / sw - r.fails.length * 6;
    }
    R.sort((a, b) => b.score - a.score);
    return { list: R, notes: stageNotes(P, R[0]) };
  }

  /* ---------- giải thích từng khâu ---------- */
  // mỗi mục: [tiêu đề VI, tiêu đề EN, nội dung VI, nội dung EN]
  function stageNotes(P, best) {
    const q = P.q, Q = P.Q, N = [];
    const gw = P.src === 'ngam';
    const en = (x, d) => (+x).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 0 : d });
    const add = (tv, te, v, e) => N.push([tv, te, v, e]);
    if (gw) {
      add('Tiền xử lý', 'Pre-treatment',
        `Nước ngầm Fe = ${vn(q.Fe, 2)} mg/L, Mn = ${vn(q.Mn, 2)} mg/L → làm thoáng (giàn mưa) + bể tiếp xúc để oxy hóa Fe²⁺, khử CO₂.` + (q.Mn > 0.1 ? ' Mn > 0,1 mg/L: thêm KMnO₄ (1,92 mg/mg Mn) và vật liệu lọc phủ MnO₂.' : '') + (q.NH4 > 0.3 ? ` NH₄ = ${vn(q.NH4, 2)} mg/L > 0,3: clo hóa điểm đột biến (7,6 mg Cl₂/mg N) hoặc lọc sinh học.` : ''),
        `Groundwater Fe = ${en(q.Fe, 2)} mg/L, Mn = ${en(q.Mn, 2)} mg/L → aeration (tray aerator) + contact tank to oxidise Fe²⁺ and strip CO₂.` + (q.Mn > 0.1 ? ' Mn > 0.1 mg/L: add KMnO₄ (1.92 mg/mg Mn) and MnO₂-coated media.' : '') + (q.NH4 > 0.3 ? ` NH₄ = ${en(q.NH4, 2)} mg/L > 0.3: breakpoint chlorination (7.6 mg Cl₂/mg N) or biological filtration.` : ''));
      add('Lắng', 'Clarification', q.Fe > 5 ? 'Fe > 5 mg/L: lượng bông cặn lớn – nên có bể lắng (lamen) trước lọc để kéo dài chu kỳ lọc.' : 'Fe ≤ 5 mg/L: lọc trực tiếp sau bể tiếp xúc, không cần bể lắng.',
        q.Fe > 5 ? 'Fe > 5 mg/L: heavy floc load – a clarifier (tube settler) ahead of the filters lengthens filter runs.' : 'Fe ≤ 5 mg/L: direct filtration after the contact tank, no clarifier needed.');
    } else {
      add('Tiền xử lý', 'Pre-treatment',
        q.NTU > 1000 ? `Độ đục lũ ${vn(q.NTU)} NTU > 1.000 → bắt buộc bể lắng sơ bộ (MWH Bảng 10-2).` : q.NTU > 500 ? `Độ đục lũ ${vn(q.NTU)} NTU > 500: lamen kém chịu sốc (CLAUDE §13) → có bể lắng sơ bộ hoặc chọn lắng ngang; bắt buộc đo độ đục online sau lắng + châm PAC tự động.` : `Độ đục lớn nhất ${vn(q.NTU)} NTU ≤ 500 – không cần lắng sơ bộ.`,
        q.NTU > 1000 ? `Flood turbidity ${en(q.NTU)} NTU > 1,000 → presedimentation required (MWH Table 10-2).` : q.NTU > 500 ? `Flood turbidity ${en(q.NTU)} NTU > 500: lamella settlers tolerate shocks poorly (CLAUDE §13) → add presedimentation or use horizontal settlers; online turbidity after settling + automatic PAC dosing required.` : `Maximum turbidity ${en(q.NTU)} NTU ≤ 500 – no presedimentation needed.`);
      const pac = Math.max(10, Math.round((5.6 * Math.pow(Math.max(q.NTU, 1), 0.33) + 0.1 * Math.max(0, q.color - 15)) / 5) * 5);
      add('Keo tụ – tạo bông', 'Coagulation – flocculation',
        `PAC lớn nhất ≈ ${vn(pac)} mg/L (GIẢ ĐỊNH – phải Jar-test). Trộn cơ khí G 600 – 1000 1/s, 30 – 120 s; phản ứng 3 buồng G 60 → 25 1/s, 15 – 30 phút (MWH Bảng 9-11).` + (Q <= 30000 ? ' Trạm nhỏ có thể dùng phản ứng thủy lực vách ngăn (không động cơ) – kém linh hoạt khi đổi mùa.' : '') + (Q >= 300000 ? ' Trạm rất lớn: cân nhắc trộn tĩnh trên ống để tiết kiệm điện máy khuấy.' : ''),
        `Maximum PAC ≈ ${en(pac)} mg/L (ASSUMED – jar tests required). Mechanical rapid mix G 600 – 1000 1/s, 30 – 120 s; 3-stage flocculation G 60 → 25 1/s, 15 – 30 min (MWH Table 9-11).` + (Q <= 30000 ? ' Small plants may use hydraulic baffled flocculation (no motors) – less flexible between seasons.' : '') + (Q >= 300000 ? ' Very large plants: consider in-line static mixing to save mixer power.' : ''));
      const cv = [], ce = [];
      if (q.algae > 5000 || (q.NTU <= 50 && q.color >= 30)) { cv.push('nước nhiều tảo / màu, độ đục thấp → DAF cho hiệu quả cao nhất (MWH §10-9)'); ce.push('algae / colour with low turbidity → DAF is the most effective (MWH §10-9)'); }
      if (q.NTU <= 15 && q.color <= 30) { cv.push('độ đục ≤ 15 NTU → có thể lọc trực tiếp (bỏ bể lắng)'); ce.push('turbidity ≤ 15 NTU → direct filtration possible (no clarifier)'); }
      if (q.NTU > 500) { cv.push('độ đục lũ cao → lắng ngang chịu sốc tốt nhất; lamen/Texler cần lắng sơ bộ'); ce.push('high flood turbidity → horizontal settlers tolerate shocks best; lamella/Texler need presedimentation'); }
      cv.push('kiểu bể lắng quyết định vốn đầu tư và mặt bằng (CLAUDE §10: lamen + lọc trọng lực là phương án rẻ nhất ở trạm 20.000)'); ce.push('the clarifier type governs capital cost and footprint (CLAUDE §10: tube settlers + gravity filters were the cheapest option at the 20,000 plant)');
      if (Q >= 10000) { cv.push('Texler + CT2 (Leopold) cho tải trọng cao, thu bùn liên tục – phù hợp trạm từ ~10.000 m³/ngđ'); ce.push('Texler + CT2 (Leopold) gives high loading and continuous sludge removal – suitable from ~10,000 m³/d'); }
      add('Lắng / tuyển nổi', 'Clarification / flotation', cv.join('; ') + '.', ce.join('; ') + '.');
    }
    const nmin = Math.max(2, Math.ceil(1.2 * Math.sqrt(Q * 1.05 / 3785.41)));
    add('Lọc', 'Filtration',
      `Kiểu bể lọc quyết định chi phí vận hành (CLAUDE §10). Lọc trọng lực rẻ điện hơn lọc áp lực (một lần bơm). Số bể tối thiểu N = 1,2·√Q(MGD) = ${nmin} (Kawamura).` + (Q <= 5000 ? ' Q ≤ 5.000: lọc áp lực chấp nhận được nếu nền yếu / nước ngầm cao / cần phân kỳ module.' : ' Q > 5.000: không nên dùng lọc áp lực.') + (q.NTU <= 10 && Q <= 5000 ? ' Nguồn ≤ 10 NTU: lọc chậm khả thi (không hóa chất).' : ''),
      `The filter type governs operating cost (CLAUDE §10). Gravity filters use less power than pressure filters (single pumping). Minimum number of filters N = 1.2·√Q(MGD) = ${nmin} (Kawamura).` + (Q <= 5000 ? ' Q ≤ 5,000: pressure filters acceptable for weak soil / high groundwater / modular phasing.' : ' Q > 5,000: pressure filters not recommended.') + (q.NTU <= 10 && Q <= 5000 ? ' Source ≤ 10 NTU: slow sand filtration feasible (no chemicals).' : ''));
    if (q.TDS > 1000) add('Khử mặn', 'Desalting', `TDS = ${vn(q.TDS)} mg/L > 1.000 (QCVN 01-1:2018) → RO xử lý một phần dòng rồi hòa trộn; tiền xử lý SDI < 3 – 5.`, `TDS = ${en(q.TDS)} mg/L > 1,000 (QCVN 01-1:2018) → RO on part of the flow, then blending; pre-treatment to SDI < 3 – 5.`);
    if (q.TOC > 4 || q.algae > 20000) add('Xử lý nâng cao', 'Advanced treatment', `TOC = ${vn(q.TOC, 1)} mg/L / tảo ${vn(q.algae)} tb/mL → lọc GAC (EBCT 10 – 20 min) khử mùi vị, tiền chất THM.`, `TOC = ${en(q.TOC, 1)} mg/L / algae ${en(q.algae)} cells/mL → GAC filtration (EBCT 10 – 20 min) for taste & odour and THM precursors.`);
    add('Khử trùng', 'Disinfection', 'NaOCl, clo dư 0,2 – 1,0 mg/L (QCVN 01-1:2018), CT theo USEPA SWTR với BF bể chứa 0,5; UV bổ sung khi cần rào cản Cryptosporidium.', 'NaOCl, residual chlorine 0.2 – 1.0 mg/L (QCVN 01-1:2018), CT per USEPA SWTR with tank BF 0.5; add UV when a Cryptosporidium barrier is needed.');
    add('Xử lý bùn', 'Sludge treatment',
      `Bể cô đặc trọng lực 20 – 80 kg/m²·ngđ (MWH Bảng 21-13) → ${Q >= 50000 ? 'ly tâm (bánh 20 – 25 %)' : Q >= 8000 ? 'ép băng tải (bánh 15 – 30 %, MWH Bảng 21-16)' : 'sân phơi bùn (trạm nhỏ, có đất)'}; nước tách bùn + nước rửa lọc thu hồi tuần hoàn về đầu trạm.`,
      `Gravity thickener 20 – 80 kg/m²·d (MWH Table 21-13) → ${Q >= 50000 ? 'centrifuge (cake 20 – 25 %)' : Q >= 8000 ? 'belt press (cake 15 – 30 %, MWH Table 21-16)' : 'drying beds (small plant, land available)'}; supernatant + recovered backwash water recycled to the plant inlet.`);
    if (best) {
      const be = typeof BI !== 'undefined' && BI.en(best.txt) || best.txt;
      add('Phương án đề xuất', 'Recommended option', best.txt + (best.leo ? ' – trùng dây chuyền của file mẫu: xuất Excel đúng cấu trúc 21 sheet của file mẫu.' : ''), be + (best.leo ? ' – same train as the template: Excel export keeps the exact 21-sheet template structure.' : ''));
    }
    return N;
  }

  /* ---------- đầu bài mẫu ---------- */
  const QV = { NTU: 300, NTUavg: 80, SS: 300, color: 50, pH: 7, T: 20, alk: 75, Fe: 0.3, Mn: 0.05, NH4: 0.1, TDS: 250, hard: 100, TOC: 2.5, algae: 500 };
  const SAMPLES = [
    { id: 'vin500', vi: 'Vinhomes – Thép Hà Tĩnh 500.000 m³/ngđ (file mẫu gốc, Leopold)', en: 'Vinhomes 500,000 m³/d (original template, Leopold)',
      P: { name: 'Trạm XLNC 500.000 m³/ngđ – Vinhomes Thép Hà Tĩnh', src: 'song', srcName: 'Sông Trí + Sông Rào Trổ', Q: 500000, Kh: 1.5, H2: 45, MNTN: -8, nIntake: 2, q: Object.assign({}, QV, { Fe: 0, Mn: 0, NH4: 0 }) },
      chain: { pre: 'none', mix: 'mech', floc: 'mech', clar: 'texler', filt: 'xa', adv: [], dis: 'naocl', sl: 'centri' }, auto: false },
    { id: 'song80', vi: 'Nhà máy nước sông 80.000 m³/ngđ – độ đục lũ 400 NTU', en: 'River WTP 80,000 m³/d – flood turbidity 400 NTU',
      P: { name: 'Nhà máy nước 80.000 m³/ngđ', src: 'song', srcName: 'Sông Lam', Q: 80000, Kh: 1.4, H2: 42, MNTN: -4, nIntake: 1, q: Object.assign({}, QV, { NTU: 400, NTUavg: 60, SS: 380 }) }, auto: true },
    { id: 'ho30', vi: 'Hồ chứa 30.000 m³/ngđ – nhiều tảo, độ màu cao', en: 'Reservoir 30,000 m³/d – algae, high colour',
      P: { name: 'Trạm cấp nước hồ 30.000 m³/ngđ', src: 'ho', srcName: 'Hồ chứa', Q: 30000, Kh: 1.5, H2: 40, MNTN: -6, nIntake: 1, q: Object.assign({}, QV, { NTU: 35, NTUavg: 12, SS: 30, color: 45, TOC: 4.8, algae: 25000 }) }, auto: true },
    { id: 'song10', vi: 'Sông nhỏ 10.000 m³/ngđ – độ đục 150 NTU', en: 'Small river 10,000 m³/d – 150 NTU',
      P: { name: 'Trạm cấp nước 10.000 m³/ngđ', src: 'song', srcName: 'Sông', Q: 10000, Kh: 1.6, H2: 35, MNTN: -3, nIntake: 1, q: Object.assign({}, QV, { NTU: 150, NTUavg: 40, SS: 150, color: 30 }) }, auto: true },
    { id: 'ngam5', vi: 'Nước ngầm 5.000 m³/ngđ – Fe 8 mg/L, Mn 0,6 mg/L, NH₄ 1,2 mg/L', en: 'Groundwater 5,000 m³/d – Fe 8, Mn 0.6, NH₄ 1.2 mg/L',
      P: { name: 'Trạm cấp nước ngầm 5.000 m³/ngđ', src: 'ngam', srcName: 'Giếng khoan', Q: 5000, Kh: 1.7, H2: 32, MNTN: -20, nIntake: 1, q: Object.assign({}, QV, { NTU: 8, NTUavg: 5, SS: 10, color: 15, pH: 6.4, alk: 90, Fe: 8, Mn: 0.6, NH4: 1.2, TOC: 1.5, algae: 0 }) }, auto: true },
    { id: 'lo3', vi: 'Nước ngầm lợ ven biển 3.000 m³/ngđ – TDS 3.000 mg/L', en: 'Brackish groundwater 3,000 m³/d – TDS 3,000',
      P: { name: 'Trạm cấp nước ven biển 3.000 m³/ngđ', src: 'ngam', srcName: 'Giếng nước lợ', Q: 3000, Kh: 1.8, H2: 30, MNTN: -15, nIntake: 1, q: Object.assign({}, QV, { NTU: 5, NTUavg: 3, SS: 8, color: 10, pH: 7.2, alk: 180, Fe: 1.5, Mn: 0.15, NH4: 0.4, TDS: 3000, hard: 450, TOC: 1.5, algae: 0 }) }, auto: true }
  ];
  return { recommend, candidates, robust, stageNotes, PROS, SAMPLES, TECH };
})();
if (typeof module !== 'undefined') module.exports = XLNK;
