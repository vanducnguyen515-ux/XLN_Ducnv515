'use strict';
/* ==========================================================================
   SimXLNT – Thông tin mô hình động học & khuyến cáo chọn mô hình theo sơ đồ.
   MODEL_INFO[id]: tóm tắt, ưu điểm, nhược điểm, phạm vi phù hợp.
   ADVISOR.recommend(P): phân tích sơ đồ (vùng kỵ khí, châm kim loại, giới hạn P,
   dòng phụ NH₄ cao / nitrit hóa / anammox, DO thấp, bùn hạt, nguồn SUMO, BSM1…)
   → { best, why[], alts[{id, why}], feat } – mô hình nên dùng và lý do.
   ========================================================================== */
const MODEL_INFO = {
  ASM1: {
    short: 'ASM1 – C, N (chuẩn IWA)',
    sum: 'Mô hình chuẩn IWA (Henze et al., 1987/2000): oxy hóa COD, nitrat hóa và khử nitrat một bước; 8 quá trình, 13 biến (+ N₂ hòa tan, chất rắn vô cơ). Phân hủy theo khái niệm “chết – tái sinh”, N hữu cơ theo SND/XND.',
    pros: ['Chuẩn tham chiếu quốc tế – BSM1 định nghĩa bằng ASM1, kết quả so sánh trực tiếp với tài liệu', 'Ít tham số, dễ hiệu chỉnh, tính nhanh và ổn định số', 'Rất nhiều bộ tham số đã hiệu chỉnh được công bố'],
    cons: ['Không có phospho (không khử P sinh học, không kết tủa hóa học)', 'Không có lên men/VFA – không đánh giá được nguồn carbon cho khử nitrat ở vùng kỵ khí', 'Phân hủy như nhau trong mọi điều kiện → bùn dư, nhu cầu O₂ lệch khi tỷ lệ vùng thiếu khí lớn', 'Không mô phỏng nitrit'],
    use: 'Benchmark BSM1, trạm chỉ yêu cầu COD/N, nghiên cứu đối chứng'
  },
  ASM1N: {
    short: 'ASM1N – nitrat hóa 2 bước, anammox (C, N)',
    sum: 'ASM1 mở rộng: nitrat hóa hai bước (AOB → NO₂, NOB → NO₃), khử nitrat hai bước, anammox và comammox; ức chế bởi NH₃ tự do (FA) và HNO₂ tự do (FNA) theo Anthonisen; mặc định bật ức chế pH.',
    pros: ['Mô phỏng tích lũy nitrit, nitrite shunt, deammonification (PN/A)', 'Có ức chế FA/FNA và pH – cần cho dòng phụ NH₄ cao (nước tách bùn)', 'Thích hợp SHARON, DEMON, ANITA Mox, cụm anammox + cyclone'],
    cons: ['Không có phospho', 'Tham số AOB/NOB/AMX và hằng số ức chế cần hiệu chỉnh theo số liệu', 'Nhạy với pH, nhiệt độ và DO – cần số liệu kiểm chứng'],
    use: 'Xử lý nước tách bùn (dòng phụ), nitrit hóa – anammox'
  },
  ASM1N2O: {
    short: 'ASM1N2O – phát thải N₂O (C, N)',
    sum: 'ASM1N bổ sung hydroxylamin, NO, N₂O: con đường AOB (khử nitrit bởi AOB và oxy hóa NH₂OH) và khử nitrat dị dưỡng 4 bước; N₂O, NO thoát ra theo trao đổi khí.',
    pros: ['Ước tính phát thải N₂O/NO và dấu chân carbon (CFP)', 'Đánh giá ảnh hưởng của DO, tải lượng, chu kỳ sục khí tới N₂O'],
    cons: ['Nhiều tham số còn bất định trong tài liệu – kết quả N₂O chỉ định hướng', 'Không có phospho', 'Nhiều biến hơn → tính chậm hơn'],
    use: 'Kiểm kê khí nhà kính, tối ưu DO giảm N₂O'
  },
  ASM3: {
    short: 'ASM3 – tích trữ XSTO (C, N)',
    sum: 'Mô hình IWA thế hệ 3 (Gujer et al., 1999): dị dưỡng tích trữ cơ chất thành XSTO rồi sinh trưởng; hô hấp nội sinh thay “chết – tái sinh”, khác nhau giữa hiếu khí và thiếu khí.',
    pros: ['Phân biệt hấp thụ nhanh và sinh trưởng – tốt cho tải cao, chế độ “no – đói” (SBR)', 'Hô hấp nội sinh thiếu khí thấp hơn hiếu khí – bùn dư, O₂ hợp lý hơn ASM1', 'Phù hợp phân tích thí nghiệm hô hấp kế (OUR)'],
    cons: ['Không có phospho', 'Bộ tham số khác ASM1, khó so sánh trực tiếp', 'XSTO khó đo kiểm'],
    use: 'Hệ tải trọng cao, SBR feast–famine, phân tích OUR'
  },
  ASM2d: {
    short: 'ASM2d – C, N, P (chuẩn IWA)',
    sum: 'Mô hình chuẩn IWA (Henze et al., 1999) cho khử C, N, P: lên men SF → VFA, PAO (lưu trữ PHA/PP, sinh trưởng hiếu khí và thiếu khí), kết tủa – hòa tan phosphat kim loại; nitrat hóa một bước.',
    pros: ['Chuẩn công bố, nhiều tài liệu và bộ tham số', 'Khử P sinh học và hóa học, kể cả khử P thiếu khí', 'Thích hợp khi cần so với kết quả tài liệu dùng ASM2d'],
    cons: ['Phân hủy PAO như nhau mọi vùng (bPAO = bPP = bPHA 0,2) → PAO dễ bị rửa trôi với tham số mặc định', 'Dị dưỡng chia VFA theo SA/(SF+SA) → PAO giành VFA ở vùng thiếu khí thiếu nitrat (bio-P “ảo” trong MLE)', 'Nitrat hóa 1 bước, không có sản phẩm nội sinh tách riêng', 'Đối chiếu 28 trạm SUMO24: 66 % chỉ tiêu đạt (mô hình kiểu Sumo: 91 %)'],
    use: 'So sánh với tài liệu ASM2d, đào tạo'
  },
  ASM2dS: {
    short: 'ASM2dS – kiểu Sumo1 (C, N, P) – khuyến cáo chung',
    sum: 'Tự cài đặt theo chức năng và tham số mặc định thư viện Sumo1 (SUMO24) trên nền biến ASM2d: sản phẩm nội sinh XE và cơ chất từ phân hủy sinh khối XB,e (thủy phân chậm), phân hủy giảm khi thiếu/kỵ khí, dị dưỡng ưu tiên VFA, sản lượng riêng theo cơ chất và điều kiện, lên men có sinh trưởng, PAO kiểu CASTO, VSS/tro theo từng nhóm chất.',
    pros: ['Khớp nhất với SUMO24: 91 % chỉ tiêu của 28 trạm bùn hoạt tính trong sai số (MLE, A²O, Bardenpho, UCT, mương oxy hóa, MBR, IFAS…)', 'MLSS, bùn dư, OTR sát hơn nhờ XE, XB,e và tro sinh khối', 'Bio-P ổn định với tham số mặc định; không sinh bio-P “ảo” trong sơ đồ không có vùng kỵ khí', 'Dùng chung dòng vào, ADM1, hóa chất với ASM2d – đổi qua lại không phải sửa sơ đồ'],
    cons: ['Nitrat hóa 1 bước (không có NO₂ – dùng ASM2dS2 khi DO thấp/nitrit)', 'COD keo gộp vào XS/XI – lắng sơ cấp tách lý tưởng giữ cả keo', 'Không có GAO, chuyển mạch ORP của PAO, kết tủa khoáng (struvite, HFO)', 'Hấp thụ P thiếu khí nhanh hơn Sumo (nước ra vẫn khớp)', 'Không phải mô hình chuẩn công bố – khi đối chiếu tài liệu IWA nên dùng ASM2d'],
    use: 'Mặc định cho trạm đô thị khử C/N/P và trạm chỉ khử C/N'
  },
  ASM2dS2: {
    short: 'ASM2dS2 – kiểu Sumo2: N 2 bước + anammox (C, N, P)',
    sum: 'ASM2dS mở rộng: nitrat hóa hai bước (AOB, NOB, NO₂), khử nitrat hai bước cho dị dưỡng và PAO, anammox; tham số AOB/NOB/AMX theo Sumo2.',
    pros: ['Mô phỏng NO₂ ở DO thấp, nitrit hóa đồng thời – khử nitrit, nitrite shunt', 'Đối chiếu SUMO ví dụ giảm năng lượng sục khí DO 0,1–1: 30/38 chỉ tiêu đạt (ASM2d: 9/38)', 'Giữ đầy đủ khử P sinh học – dùng cho dòng chính khi có dòng tuần hoàn từ cụm anammox/nitrit hóa'],
    cons: ['24 biến, tính chậm hơn ASM2dS khoảng 20 %', 'Chưa có ức chế FA/FNA (bể dòng phụ NH₄ rất cao nên dùng ASM1N)', 'Hệ số khử nitrat 2 bước đã chuẩn hóa để cùng năng lực như 1 bước – cần hiệu chỉnh khi có số liệu NO₂'],
    use: 'Sục khí DO thấp, tối ưu năng lượng, nitrite shunt; trạm có cụm anammox dòng phụ'
  },
  ASM3P: {
    short: 'ASM3P – ASM3 + Bio-P EAWAG (C, N, P)',
    sum: 'ASM3 kèm mô-đun khử P sinh học EAWAG (Rieger et al., 2001): dị dưỡng tích trữ XSTO, PAO lưu trữ PHA từ mọi cơ chất dễ phân hủy, PP; hô hấp nội sinh; thêm kết tủa P hóa học.',
    pros: ['Bio-P ổn định, ít tham số hơn ASM2d', 'Hô hấp nội sinh theo điều kiện – hợp lý cho SRT dài', 'Thích hợp so sánh với nghiên cứu dùng ASM3-BioP (Thụy Sĩ, Đức)'],
    cons: ['Không có lên men – PAO dùng cả SF như VFA → có thể đánh giá cao bio-P khi nước thải ít VFA', 'Nitrat hóa 1 bước', 'Ít được kiểm chứng rộng hơn ASM2d'],
    use: 'So sánh với ASM3-BioP, trạm tải cao có bio-P'
  },
  ASM1G: {
    short: 'ASM1G – bùn hạt (C, N)',
    sum: 'ASM1 với bản sao “trong hạt” của sinh khối: hằng số bán bão hòa nhân hệ số cản khuếch tán, chuyển hóa bông ⇄ hạt; dùng với cyclone và lắng nhanh hạt.',
    pros: ['Mô phỏng bùn hạt/bùn đặc (densified), cyclone chọn lọc', 'Thể hiện nitrat hóa – khử nitrat đồng thời trong hạt'],
    cons: ['Không có phospho', 'Hệ số cản khuếch tán và tốc độ hạt hóa là tham số hiệu chỉnh', 'Số biến tăng ~40 %'],
    use: 'Bùn hạt khử C/N'
  },
  ASM2dG: {
    short: 'ASM2dG – bùn hạt (C, N, P)',
    sum: 'ASM2d với phần sinh khối, PHA, PP, XI “trong hạt” (cản khuếch tán, chuyển hóa bông ⇄ hạt); dùng cho Nereda/AGS, inDENSE (cyclone).',
    pros: ['Duy nhất mô phỏng bùn hạt có khử P sinh học', 'Thể hiện PAO/khử nitrat trong hạt, phân bố bông – hạt (Fg)'],
    cons: ['Kế thừa nhược điểm PAO của ASM2d', 'Tham số hạt cần hiệu chỉnh; tính chậm hơn'],
    use: 'Nereda/AGS, cyclone densified sludge'
  }
};

const ADVISOR = (() => {
  const isAer = u => (['cstr', 'mbr', 'mbbr', 'baf'].includes(u.type) && u.p.aer && u.p.aer !== 'none');
  const isReac = u => ['cstr', 'mbr', 'mbbr', 'baf', 'sbr', 'iceas', 'ctech'].includes(u.type);
  const PASS = new Set(['splitter', 'psep', 'pclar', 'screen', 'grit', 'eqtank', 'dose', 'pump', 'wetwell', 'sewer']);

  function analyze(P) {
    const U = Object.fromEntries(P.units.map(u => [u.id, u])), L = P.links || [];
    const out = id => L.filter(l => l.from[0] === id).map(l => U[l.to[0]]).filter(Boolean);
    const inn = id => L.filter(l => l.to[0] === id).map(l => U[l.from[0]]).filter(Boolean);
    // bể nhận nước vào (đi xuôi từ dòng vào qua các đơn vị trung gian không phản ứng)
    const feed = new Set(), seen = new Set();
    const walk = id => { for (const v of out(id)) { if (seen.has(v.id)) continue; seen.add(v.id); if (isReac(v)) feed.add(v.id); else if (PASS.has(v.type)) walk(v.id); } };
    P.units.filter(u => u.type === 'influent').forEach(u => walk(u.id));
    // bể không sục nhận trực tiếp dòng từ bể sục khí (qua bộ chia) = thiếu khí (có nitrat)
    const srcReac = (id, s = new Set()) => inn(id).flatMap(v => { if (s.has(v.id)) return []; s.add(v.id); return v.type === 'splitter' ? srcReac(v.id, s) : [v]; });
    const unaer = P.units.filter(u => u.type === 'cstr' && u.p.aer === 'none');
    const anaer = unaer.filter(u => /kỵ khí|ky khi|anaer/i.test(u.name) || (feed.has(u.id) && !srcReac(u.id).some(isAer)));
    const anox = unaer.filter(u => !anaer.includes(u));
    const aer = P.units.filter(isAer);
    const cyc = P.units.filter(u => ['sbr', 'iceas', 'ctech'].includes(u.type));
    const metal = P.units.some(u => (u.type === 'dose' && u.p.kind === 'metal') || u.type === 'chem');
    const gran = P.units.some(u => u.type === 'cyclone') || /nereda|bùn hạt|granul|AGS/i.test(P.name || '');
    const digest = P.units.some(u => ['digester', 'anr'].includes(u.type));
    const side = P.units.filter(u => isReac(u) && /anammox|nitrit|deammon|sharon|demon|anita|dòng phụ|sidestream|PN\/?A/i.test(u.name));
    // dòng vào NH₄ rất cao (nước tách bùn, công nghiệp)
    let tknMax = 0;
    for (const u of P.units.filter(x => x.type === 'influent')) {
      const inf = u.p.inf || {};
      let tkn = +inf.TKN || 0;
      if (inf.mode === 'state' && inf.st) { const s = inf.st[P.model] || Object.values(inf.st)[0] || {}; tkn = Math.max(tkn, (+s.SNH4 || +s.SNH || 0)); }
      tknMax = Math.max(tknMax, tkn);
    }
    const lowDO = aer.filter(u => u.p.aer === 'do' && +u.p.DOsp > 0 && +u.p.DOsp <= 0.6);
    let needP = anaer.length > 0 || metal || cyc.length > 0;
    let lim = {};
    try { if (typeof FIX !== 'undefined') lim = FIX.limits(P) || {}; } catch (e) { lim = {}; }
    const pLimit = lim.TP != null || lim.PO4 != null;
    const bsm = /BSM|benchmark/i.test(P.name || '');
    const sumo = P.sumoSrc && P.sumoSrc.model;
    const txt = (P.name || '') + ' ' + (P.desc || '');
    const n2o = /N₂O|N2O/i.test(P.name || '');
    const cmx = /comammox/i.test(txt);
    const film = P.units.filter(u => ['mbbr', 'baf'].includes(u.type));
    return { n2o, cmx, film, anaer, anox, aer, cyc, metal, gran, digest, side, tknMax, lowDO, needP: needP || pLimit, pLimit, bsm, sumo };
  }

  function recommend(P) {
    const f = analyze(P), why = [], alts = [];
    let best;
    const names = a => a.map(u => u.name).join(', ');
    if (f.bsm && !f.anaer.length && !f.metal) {
      best = 'ASM1';
      why.push('Sơ đồ benchmark BSM1 được định nghĩa bằng ASM1 – dùng ASM1 để kết quả so sánh trực tiếp được với tài liệu (Alex et al., 2008).');
      alts.push({ id: 'ASM2dS', why: 'khi muốn dự báo sát thực tế hơn (bùn dư, O₂) thay vì so benchmark' });
    } else if (f.gran) {
      best = f.needP ? 'ASM2dG' : 'ASM1G';
      why.push('Sơ đồ có bùn hạt / cyclone chọn lọc – cần mô hình có phần sinh khối “trong hạt” và cản khuếch tán.');
      if (f.needP) why.push('Có yêu cầu/điều kiện khử P (vùng kỵ khí, chu kỳ, châm hóa chất hoặc giới hạn TP) → bản bùn hạt có P.');
      alts.push({ id: 'ASM2dS', why: 'nếu tỷ lệ bùn hạt nhỏ, chỉ cần cân bằng bùn – P tổng thể' });
    } else if (f.n2o) {
      best = 'ASM1N2O';
      why.push('Mục tiêu sơ đồ là phát thải N₂O – chỉ ASM1N2O có NH₂OH, NO, N₂O (con đường AOB và khử nitrat 4 bước) và N₂O thoát khí.');
      alts.push({ id: 'ASM2dS2', why: 'khi cần cả khử P và NO₂ nhưng không cần N₂O' });
    } else if (f.cmx) {
      best = 'ASM1N';
      why.push('Sơ đồ khảo sát comammox (Nitrospira oxy hóa NH₄ → NO₃ một bước) – chỉ ASM1N có nhóm comammox cạnh tranh với AOB/NOB.');
      alts.push({ id: 'ASM2dS2', why: 'khi cần thêm P (không có comammox)' });
    } else if (f.side.length && !f.aer.some(u => !f.side.includes(u))) {
      best = 'ASM1N';
      why.push(`Sơ đồ là cụm xử lý dòng phụ (${names(f.side)}) – cần nitrat hóa 2 bước, anammox và ức chế FA/FNA, pH.`);
      alts.push({ id: 'ASM2dS2', why: 'nếu cần thêm P, hoặc mô phỏng chung với dòng chính' });
    } else if (f.side.length || f.tknMax > 150 || f.lowDO.length || f.sumo && /^Sumo(2|2S|2C|4N)$/.test(f.sumo)) {
      best = 'ASM2dS2';
      if (f.side.length) why.push(`Có bể nitrit hóa/anammox (${names(f.side)}) – cần NO₂, AOB/NOB/AMX riêng.`);
      if (f.tknMax > 150) why.push(`NH₄/TKN dòng vào rất cao (≈ ${Math.round(f.tknMax)} mg/L) – nitrit dễ tích lũy, cần nitrat hóa 2 bước.`);
      if (f.lowDO.length) why.push(`Bể sục khí DO thấp (${names(f.lowDO)} ≤ 0,6 mg/L) – AOB/NOB cạnh tranh O₂ khác nhau, NO₂ tích lũy; mô hình 1 bước đánh giá sai NH₄ (ví dụ SUMO giảm năng lượng sục khí: ASM2dS2 30/38 chỉ tiêu đạt, ASM2d 9/38).`);
      if (f.sumo) why.push(`Dự án nhập từ SUMO mô hình ${f.sumo} (nitrat hóa 2 bước).`);
      why.push('Vẫn giữ khử P sinh học/hóa học và các cải tiến kiểu Sumo của ASM2dS.');
      alts.push({ id: 'ASM2dS', why: 'tính nhanh hơn khi không quan tâm NO₂ (DO ≥ 1,5)' });
      if (!f.needP) alts.push({ id: 'ASM1N2O', why: 'khi cần ước tính phát thải N₂O' });
    } else {
      best = 'ASM2dS';
      if (!f.anaer.length && f.anox.length) why.push(`Sơ đồ khử N (vùng thiếu khí: ${names(f.anox)}): ASM2dS ưu tiên VFA cho dị dưỡng nên không tạo bio-P “ảo” ở vùng thiếu khí như ASM2d gốc; MLSS, bùn dư, O₂ sát thực tế nhờ XE, XB,e và tro sinh khối.`);
      if (f.anaer.length) why.push(`Có vùng kỵ khí (${names(f.anaer)}) → khử P sinh học: cần PAO, lên men VFA; ASM2dS giữ PAO ổn định với tham số mặc định (ASM2d gốc dễ rửa trôi PAO).`);
      if (f.metal) why.push('Có châm muối kim loại → cần mô hình có P và kết tủa hóa học.');
      if (f.cyc.length) why.push(`Bể chu kỳ (${names(f.cyc)}): luân phiên hiếu/thiếu/kỵ khí – cần phân hủy theo điều kiện (XE, ηb) và P sinh học.`);
      if (f.film.length) why.push(`Có màng sinh học (${names(f.film)}): dùng chung mô hình sinh khối lơ lửng; phân hủy theo điều kiện hợp với lớp màng sâu thiếu khí.`);
      if (P.units.some(u => u.type === 'lagoon')) why.push('Hồ sinh học: vùng nước mặt hiếu khí, đáy thiếu/kỵ khí, SRT rất dài – phân hủy giảm theo điều kiện và sản phẩm nội sinh XE của ASM2dS cho bùn tích lũy, nhu cầu O₂ hợp lý hơn ASM1.');
      if (!why.length) why.push('Trạm bùn hoạt tính thông thường: ASM2dS là mô hình khớp nhất với SUMO24 (91 % chỉ tiêu của 28 trạm), dự báo MLSS, bùn dư, OTR tốt hơn ASM1/ASM2d.');
      if (f.pLimit && !f.anaer.length && !f.metal) why.push('Giới hạn xả có TP/PO₄ → mô hình có P cho phép kiểm tra TP (ASM1/ASM3 không có P).');
      why.push('Đối chiếu 28 trạm SUMO24: 91 % chỉ tiêu đạt (ASM2d gốc 66 %).');
      alts.push({ id: 'ASM2dS2', why: 'khi vận hành DO thấp (< 0,7 mg/L) hoặc quan tâm nitrit' });
      alts.push({ id: 'ASM2d', why: 'khi cần so sánh với tài liệu dùng ASM2d chuẩn' });
      if (!f.needP) alts.push({ id: 'ASM1', why: 'mô hình gọn nhất khi chỉ quan tâm COD/N' });
    }
    if (f.digest) why.push('Bể phân hủy dùng ADM1 với giao diện ASM ⇄ ADM tự động (mọi mô hình họ ASM2d giữ được cân bằng P).');
    return { best, why, alts: alts.filter(a => MODELS[a.id] && a.id !== best), f };
  }

  /* hộp khuyến cáo (HTML) – dùng ở tab Mô hình và khung thuộc tính sơ đồ */
  function adviceHTML(P, compact) {
    const r = recommend(P), cur = P.model, ok = cur === r.best;
    const inf = MODEL_INFO[r.best] || {};
    if (compact) return `<div class="msg ${ok ? 'ok' : 'warn'}" style="margin-top:6px">${ok ? '✔ Đang dùng mô hình khuyến cáo' : 'Khuyến cáo'}: <b>${r.best}</b>${ok ? '' : ` <button data-use="${r.best}">Dùng ${r.best}</button>`}<br><span class="small">${esc(r.why[0] || '')}</span></div>`;
    return `<div class="msg ${ok ? 'ok' : 'warn'}" style="margin-top:10px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>${ok ? '✔ Mô hình đang dùng là mô hình khuyến cáo cho sơ đồ này' : 'Khuyến cáo mô hình chính xác nhất cho sơ đồ này'}: ${r.best}</b>
      ${ok ? '' : `<button class="pri" data-use="${r.best}">Dùng ${r.best}</button>`}</div>
      <div class="small">${esc(inf.short || '')}</div>
      <ul style="margin:6px 0 0 18px">${r.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
      ${r.alts.length ? `<div class="small" style="margin-top:4px">Lựa chọn khác: ${r.alts.map(a => `<b>${a.id}</b> – ${esc(a.why)}`).join('; ')}.</div>` : ''}
    </div>`;
  }

  /* mô tả mô hình: tóm tắt, ưu, nhược, phù hợp */
  function infoHTML(id) {
    const i = MODEL_INFO[id];
    if (!i) return '';
    return `<div class="grid2" style="margin-top:8px">
      <div><h3>Tóm tắt</h3><p class="small">${esc(i.sum)}</p><p class="small"><b>Phù hợp:</b> ${esc(i.use)}</p></div>
      <div><h3>Ưu điểm</h3><ul class="small" style="margin:0 0 8px 18px">${i.pros.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3>Nhược điểm</h3><ul class="small" style="margin:0 0 0 18px">${i.cons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;
  }

  /* bảng so sánh mọi mô hình */
  function compareHTML(cur, best) {
    return `<details style="margin-top:10px"><summary>So sánh tất cả mô hình</summary><div class="tscroll"><table class="t" style="margin-top:6px">
      <tr><th class="l">Mô hình</th><th class="l">Nội dung</th><th class="l">Ưu điểm chính</th><th class="l">Nhược điểm chính</th><th class="l">Phù hợp</th></tr>
      ${Object.keys(MODEL_INFO).filter(id => MODELS[id]).map(id => { const i = MODEL_INFO[id]; return `<tr${id === cur ? ' style="background:#eef5ff"' : ''}><td class="l"><b>${id}</b>${id === best ? ' ★' : ''}${id === cur ? '<br><span class="small muted">đang dùng</span>' : ''}</td><td class="l small">${esc(i.sum)}</td><td class="l small">${esc(i.pros[0])}</td><td class="l small">${esc(i.cons[0])}</td><td class="l small">${esc(i.use)}</td></tr>`; }).join('')}
    </table></div><p class="small muted">★ = khuyến cáo cho sơ đồ hiện tại.</p></details>`;
  }

  return { analyze, recommend, adviceHTML, infoHTML, compareHTML };
})();
