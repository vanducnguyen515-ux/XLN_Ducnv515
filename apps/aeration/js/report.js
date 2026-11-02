// Aeration Design Tool – nội dung báo cáo (một nguồn) → HTML (màn hình/PDF) và DOCX (Word)
'use strict';
var REP = {};
(function () {
  const n = (x, d) => (x == null || !isFinite(x)) ? '–' : Number(x).toLocaleString('vi-VN', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d });
  REP.n = n;
  // Song ngữ: mọi chuỗi dạng 'Tiếng Việt|English' → tiếng Anh in nhỏ, mờ bên dưới
  REP.split = s => { const i = String(s).indexOf('|'); return i < 0 ? [String(s), ''] : [String(s).slice(0, i), String(s).slice(i + 1)]; };
  const bi = (vi, en) => en && en !== vi ? vi + '|' + en : vi;
  // Báo cáo = mảng khối: {h:1|2, t}, {p}, {tbl:{head, rows, w}}, {img: svg}, {warn:[...]}
  REP.blocks = (S, R) => {
    const r = R.sel, A = R.A, t = S.tank, w = S.water, B = [], diff = r.kind === 'fb' || r.kind === 'cb';
    const proj = S.proj, rn = bi(r.name, r.en);
    const C3 = [['Tối thiểu|Minimum', 'min'], ['Trung bình|Average', 'avg'], ['Cực đại|Peak', 'pk']];
    const nm = (o, k) => o[k] ? bi(o[k].name, o[k].en) : k;
    B.push({ cover: true, title: 'THUYẾT MINH TÍNH TOÁN HỆ THỐNG CẤP KHÍ|AERATION SYSTEM DESIGN CALCULATION REPORT', sub: proj.name,
      meta: [['Mã dự án|Project code', proj.code], ['Chủ đầu tư|Client', proj.client || '–'], ['Địa điểm|Location', proj.loc], ['Người lập|Prepared by', proj.by || '–'], ['Phiên bản|Revision', proj.rev], ['Ngày|Date', proj.date || new Date().toLocaleDateString('vi-VN')]] });
    B.push({ h: 1, t: '1. Tóm tắt kết quả|1. Summary of results' });
    const sum = [['Công nghệ cấp khí chọn|Selected aeration technology', rn], ['Nhu cầu oxy AOR trung bình / cực đại|Oxygen demand AOR average / peak', A.avg != null ? `${n(A.avg, 0)} / ${n(A.pk, 0)} kg O₂/ngày|${n(A.avg, 0)} / ${n(A.pk, 0)} kg O₂/d` : 'Nhập trực tiếp SOTR|SOTR entered directly'],
      ['SOTR cực đại mỗi bể|Peak SOTR per basin', `${n(r.SR.pk, 1)} kg O₂/h`]];
    if (diff) {
      const b = r.blower, mdl = b.model ? ' – ' + b.model.fam + ' ' + b.model.m : '';
      sum.push(['Số phần tử phân phối khí|Number of diffuser elements', `${r.N} /bể × ${t.nBasin} bể = ${r.N * t.nBasin}; ${r.lay.nGrid} lưới/bể; AT/AD = ${n(r.atad, 1)}|${r.N} /basin × ${t.nBasin} basins = ${r.N * t.nBasin}; ${r.lay.nGrid} grids/basin; AT/AD = ${n(r.atad, 1)}`],
        ['Lưu lượng khí toàn trạm (TB / max)|Total plant air flow (avg / max)', `${n(r.Qt.avg, 0)} / ${n(r.Qt.pk, 0)} Sm³/h (20 °C, 1 atm)`],
        ['Máy thổi khí|Blowers', `${b.nDuty} chạy + ${b.nStby} dự phòng – ${b.Bk.name}${mdl}|${b.nDuty} duty + ${b.nStby} standby – ${b.Bk.en}${mdl}`],
        ['Điểm thiết kế mỗi máy|Design point per unit', `${n(b.Qu, 0)} Sm³/h (${n(b.QuN, 0)} Nm³/h) @ ${n(r.design.pg, 1)} kPa g`],
        ['Động cơ mỗi máy / công suất điện thiết kế|Motor per unit / design electric power', `${n(b.motor, b.motor < 10 ? 2 : 0)} kW / ${n(b.pElD, 1)} kW`],
        ['Nhiệt độ khí ra máy / đầu ống đứng|Air temperature at blower outlet / dropleg', `${n(b.T2, 0)} °C / ${n(r.heat.Tdrop, 0)} °C`],
        ['Ống góp chính / ống đứng|Main header / dropleg', `DN${r.dn.main} (${n(r.design.segs.main.v, 1)} m/s) / DN${r.dn.drop} (${n(r.design.segs.drop.v, 1)} m/s)`]);
    } else sum.push(['Thiết bị|Equipment', bi(r.units, r.unitsEn)]);
    sum.push(['Công suất điện trung bình|Average electric power', `${n(r.kWavg, 1)} kW`], ['Điện năng năm|Annual energy', `${n(r.kWhY / 1000, 1)} MWh/năm|${n(r.kWhY / 1000, 1)} MWh/yr`],
      ['Chi phí điện năm|Annual energy cost', `${n(r.cost / 1e6, 1)} triệu ${S.econ.cur}/năm (${n(S.econ.price, 0)} ${S.econ.cur}/kWh)|${n(r.cost / 1e6, 1)} million ${S.econ.cur}/yr (${n(S.econ.price, 0)} ${S.econ.cur}/kWh)`], ['Phát thải CO₂|CO₂ emissions', `${n(r.co2, 1)} t CO₂/năm|${n(r.co2, 1)} t CO₂/yr`]);
    B.push({ tbl: { head: ['Hạng mục|Item', 'Giá trị|Value'], rows: sum, w: [45, 55] } });
    const allW = R.W;
    if (allW.length) B.push({ warn: allW });

    B.push({ h: 1, t: '2. Số liệu đầu vào|2. Input data' });
    B.push({ tbl: { head: ['Thông số|Parameter', 'Giá trị|Value', 'Thông số|Parameter', 'Giá trị|Value'], w: [30, 20, 30, 20], rows: [
      ['Cao độ công trình|Site elevation', `${n(S.site.elev, 0)} m`, 'Áp suất khí quyển|Atmospheric pressure', `${n(ENG.patm(S.site.elev), 2)} kPa`],
      ['Nhiệt độ không khí max / TB|Air temperature max / mean', `${n(S.site.Tair_max, 0)} / ${n(S.site.Tair_avg, 0)} °C`, 'Độ ẩm tương đối|Relative humidity', `${n(S.site.RH, 0)} %`],
      ['Nhiệt độ nước nóng / lạnh|Water temperature summer / winter', `${n(S.site.Tw_sum, 0)} / ${n(S.site.Tw_win, 0)} °C`, 'Loại nước|Wastewater type', nm(DB.water, w.type)],
      ['α bọt mịn × F|α fine bubble × F', `${n(w.a_fb, 2)} × ${n(w.F, 2)}`, 'α bọt thô / cơ khí|α coarse / mechanical', `${n(w.a_cb, 2)} / ${n(w.a_me, 2)}`],
      ['β / θ', `${n(w.beta, 2)} / ${n(w.theta, 3)}`, 'DO TB / cực đại|DO average / peak', `${n(w.DO_avg, 1)} / ${n(w.DO_pk, 1)} mg/L`],
      ['Số bể / sục đồng thời|Basins / aerated simultaneously', `${t.nBasin} / ${t.nAerSim}`, 'Kích thước bể L × W|Basin size L × W', `${n(t.L, 1)} × ${n(t.W, 1)} m`],
      ['Mực nước TWL / BWL|Water level TWL / BWL', `${n(t.H, 2)} / ${n(t.Hbwl, 2)} m`, 'Thời gian sục khí|Aeration time', `${n(t.aerHours, 1)} h/ngày|${n(t.aerHours, 1)} h/d`],
      ['Quá trình|Process', nm(DB.process, S.process), 'Thể tích một bể|Volume per basin', `${n(t.L * t.W * t.H, 0)} m³`]] } });

    B.push({ h: 1, t: '3. Nhu cầu oxy thực tế (AOR)|3. Actual oxygen requirement (AOR)' });
    if (A.mode === 'loads') {
      const L = S.load;
      B.push({ p: 'Theo Sanitaire Diffused Aeration Design Guide và Xylem Aeration Handbook, AOR là tổng nhu cầu oxy cho khử BOD, nitrat hóa amoni và các dòng tuần hoàn, trừ phần hoàn trả do khử nitrat (nếu tính).|Per the Sanitaire Diffused Aeration Design Guide and Xylem Aeration Handbook, AOR is the total oxygen demand for BOD removal, ammonia nitrification and sidestreams, less the denitrification credit (if applied).' });
      B.push({ tbl: { head: ['Thành phần|Component', 'Công thức|Formula', 'Kết quả|Result'], w: [32, 44, 24], rows: [
        ['BOD khử|BOD removed', `Q·(BODv − BODr)/1000 + BODtuần hoàn = ${n(L.Q, 0)}·(${L.BODin} − ${L.BODout})/1000 + ${L.sideBOD}|Q·(BODin − BODout)/1000 + BODside = ${n(L.Q, 0)}·(${L.BODin} − ${L.BODout})/1000 + ${L.sideBOD}`, `${n(A.bod, 1)} kg/ngày|${n(A.bod, 1)} kg/d`],
        ['N nitrat hóa|N nitrified', `Q·(TKN − NH₄r)/1000 + Ntuần hoàn − ${L.fNsyn}·BOD|Q·(TKN − NH₄out)/1000 + Nside − ${L.fNsyn}·BOD`, `${n(A.nn, 1)} kg/ngày|${n(A.nn, 1)} kg/d`],
        ['O₂ cho BOD|O₂ for BOD', `${L.kBOD} kg O₂/kg BOD × ${n(A.bod, 1)}`, `${n(A.oBOD, 1)} kg/ngày|${n(A.oBOD, 1)} kg/d`],
        ['O₂ cho nitrat hóa|O₂ for nitrification', `${L.kN} kg O₂/kg N × ${n(A.nn, 1)}`, `${n(A.oN, 1)} kg/ngày|${n(A.oN, 1)} kg/d`],
        ['Hoàn trả khử nitrat|Denitrification credit', L.dnCredit ? `${L.kDN} × Q·NO₃/1000 = ${L.kDN} × ${n(A.dn, 1)}` : 'Không tính (dự phòng an toàn)|Not applied (safety margin)', `−${n(A.oDN, 1)} kg/ngày|−${n(A.oDN, 1)} kg/d`],
        ['Nhu cầu khác|Other demand', '', `${n(A.oOther, 1)} kg/ngày|${n(A.oOther, 1)} kg/d`],
        ['AOR trung bình|AOR average', '', `${n(A.avg, 1)} kg/ngày|${n(A.avg, 1)} kg/d`],
        ['AOR tối thiểu / cực đại|AOR minimum / peak', `× ${L.fMin} / × ${L.fPk}`, `${n(A.min, 0)} / ${n(A.pk, 0)} kg/ngày|${n(A.min, 0)} / ${n(A.pk, 0)} kg/d`]] } });
    } else if (A.mode === 'aor') B.push({ p: `AOR do người dùng nhập: tối thiểu ${n(A.min, 0)}, trung bình ${n(A.avg, 0)}, cực đại ${n(A.pk, 0)} kg O₂/ngày.|AOR entered by user: minimum ${n(A.min, 0)}, average ${n(A.avg, 0)}, peak ${n(A.pk, 0)} kg O₂/d.` });
    else B.push({ p: 'SOTR mỗi bể do người dùng nhập trực tiếp (bỏ qua chuyển đổi AOR/SOR).|SOTR per basin entered directly by user (AOR/SOR conversion skipped).' });

    B.push({ h: 1, t: '4. Chuyển đổi sang điều kiện chuẩn (SOR/SOTR)|4. Conversion to standard conditions (SOR/SOTR)' });
    B.push({ p: 'AOR = SOR · α · θ^(T−20) · (β · Pf/Pmsl · C*∞,T − DO) / C*∞,20 (Sanitaire Eq. 1). C*∞,20 = Cs,20 · (1 + de · Hngập/10,33) cho hệ khuếch tán; cơ khí bề mặt de = 0.|AOR = SOR · α · θ^(T−20) · (β · Pf/Pmsl · C*∞,T − DO) / C*∞,20 (Sanitaire Eq. 1). C*∞,20 = Cs,20 · (1 + de · Hsub/10.33) for diffused systems; surface mechanical de = 0.' });
    const rr = ['min', 'avg', 'pk'].map(k => r.SR.rat[k]);
    B.push({ tbl: { head: ['Đại lượng|Quantity', ...C3.map(c => c[0])], w: [34, 22, 22, 22], rows: [
      ['Nhiệt độ nước T (°C)|Water temperature T (°C)', ...rr.map(x => n(x.T, 1))], ['DO vận hành (mg/L)|Operating DO (mg/L)', ...rr.map(x => n(x.DO, 1))],
      ['α sử dụng|α used', ...rr.map(x => n(x.alpha, 3))], ['θ^(T−20)', ...rr.map(x => n(x.th, 3))], ['C*∞,T (mg/L)', ...rr.map(x => n(x.cT, 2))],
      ['C*∞,20 (mg/L)', ...rr.map(x => n(x.c20, 2))], ['Pf/Pmsl', ...rr.map(x => n(x.Om, 3))], ['AOR/SOR', ...rr.map(x => n(x.ratio, 3))],
      ['AOTR mỗi bể (kg O₂/h)|AOTR per basin (kg O₂/h)', ...['min', 'avg', 'pk'].map(k => n(r.SR.aotr[k], 1))], ['SOTR mỗi bể (kg O₂/h)|SOTR per basin (kg O₂/h)', ...['min', 'avg', 'pk'].map(k => n(r.SR[k], 1))]] } });

    B.push({ h: 1, t: '5. So sánh các công nghệ cấp khí|5. Comparison of aeration technologies' });
    B.push({ p: 'Theo Xylem Aeration Handbook: bọt mịn (đĩa, ống, tấm Gold) hiệu suất cao nhất; bọt thô inox bền, dùng cho bùn/bể lắng cát; jet aerator (bơm chìm + ejector), máy sục khí hút và máy sục khí bề mặt chậm phù hợp trạm nhỏ–vừa và hồ. Tất cả phương án được tính cùng nhu cầu oxy.|Per the Xylem Aeration Handbook: fine bubble (discs, tubes, Gold panels) is the most efficient; stainless coarse bubble is robust, for sludge/grit tanks; jet aerators (submersible pump + ejector), aspirating and low-speed surface aerators suit small–medium plants and lagoons. All options are sized for the same oxygen demand.' });
    const cmp = R.all.filter(x => !x.err).map(x => [(x.key === r.key ? '► ' : '') + bi(x.name, x.en),
      x.N ? `${x.N}/bể; ${x.blower.nDuty}+${x.blower.nStby} × ${x.blower.model ? x.blower.model.m : n(x.blower.motor, 0) + ' kW'}|${x.N}/basin; ${x.blower.nDuty}+${x.blower.nStby} × ${x.blower.model ? x.blower.model.m : n(x.blower.motor, 0) + ' kW'}` : bi(x.units, x.unitsEn),
      n(x.sae, 2), n(x.kWinst, 0), n(x.kWavg, 1), n(x.kWhY / 1000, 0), x.feasible ? 'Đạt|Feasible' : 'Không đạt|Not feasible']);
    B.push({ tbl: { head: ['Công nghệ|Technology', 'Thiết bị|Equipment', 'SAE max kg/kWh', 'kW lắp (chạy)|kW installed (duty)', 'kW TB|kW avg', 'MWh/năm|MWh/yr', 'Kết luận|Verdict'], w: [26, 26, 9, 9, 9, 10, 11], rows: cmp, small: true } });
    B.push({ chart: 'cmp' });

    if (diff) {
      const d = r.d, lay = r.lay, c = r.cond;
      B.push({ h: 1, t: '6. Hệ thống phân phối khí trong bể|6. In-basin air distribution system' });
      B.push({ p: `${d.name}. Diện tích màng ${n(d.a, 4)} m²/phần tử; dải lưu lượng ${d.qmin}–${d.qmax} Sm³/h (ngắn hạn ${d.qpk}); nguồn: ${d.src}. Hiệu suất chuyển hóa SOTE phụ thuộc mật độ (AT/AD), lưu lượng/phần tử và độ ngập (Krall & Pastors – Three Factors).|${d.en}. Membrane area ${n(d.a, 4)} m²/element; flow range ${d.qmin}–${d.qmax} Sm³/h (short-term ${d.qpk}); source: ${d.src.replace(/tr\./g, 'p.')}. Transfer efficiency SOTE depends on density (AT/AD), flow per element and submergence (Krall & Pastors – Three Factors).` });
      B.push({ tbl: { head: ['Thông số|Parameter', 'Giá trị|Value', 'Thông số|Parameter', 'Giá trị|Value'], w: [28, 22, 28, 22], rows: [
        ['Số phần tử mỗi bể|Elements per basin', `${r.N}`, 'Tổng số phần tử|Total elements', `${r.N * t.nBasin}`],
        ['Số ống nhánh × phần tử/ống|Laterals × elements/lateral', `${lay.nLat} × ${lay.nPer}`, 'Số lưới (dropleg)/bể|Grids (droplegs)/basin', `${lay.nGrid}`],
        ['Khoảng cách ống nhánh|Lateral spacing', `${n(lay.pl, 2)} m`, 'Khoảng cách trên ống nhánh|Spacing along lateral', `${n(lay.pd, 2)} m`],
        ['AT/AD', `${n(r.atad, 1)}`, 'Độ phủ sàn|Floor coverage', `${n(100 / r.atad, 1)} %`],
        ['Độ ngập TB|Mean submergence', `${n(r.sub.mean, 2)} m`, 'Khí khuấy trộn tối thiểu|Minimum mixing air', `${n(r.mixRate, 0)} Sm³/h/bể|${n(r.mixRate, 0)} Sm³/h/basin`]] } });
      B.push({ tbl: { head: ['Điều kiện|Condition', 'SOTR kg/h', 'Khí Sm³/h/bể|Air Sm³/h/basin', 'q Sm³/h/pt|q Sm³/h/elem', 'Thông lượng|Flux', 'SOTE %', 'Chi phối|Governed by'], w: [16, 13, 15, 13, 14, 12, 17], rows:
        C3.map(([l, k]) => [l, n(c[k].SOTR, 1), n(c[k].Q, 0), n(c[k].q, 2), n(c[k].flux, 1), n(c[k].sote * 100, 1), bi(c[k].gov, ENG.govEn[c[k].gov])]) } });
      B.push({ h: 1, t: '7. Đường ống khí – vận tốc và tổn thất áp|7. Air piping – velocity and pressure loss' });
      B.push({ p: 'Đường kính chọn theo vận tốc tối đa khuyến nghị (Metcalf & Eddy) tại lưu lượng thiết kế (cực đại × hệ số dự phòng); tổn thất ma sát Darcy–Weisbach, hệ số f theo Swamee–Jain, mật độ khí theo áp suất và nhiệt độ thực.|Diameters are selected for the maximum recommended velocity (Metcalf & Eddy) at design flow (peak × margin); friction loss by Darcy–Weisbach with Swamee–Jain f, air density at actual pressure and temperature.' });
      B.push({ tbl: { head: ['Đoạn ống|Segment', 'Vật liệu|Material', 'DN', 'Q Sm³/h', 'Q thực m³/h|Actual Q m³/h', 'v m/s', 'v max M&E', 'ΔP kPa'], w: [26, 12, 7, 11, 11, 9, 12, 10], small: true,
        rows: r.segDefs.map(s => { const x = r.design.segs[s.id]; return [bi(s.name, s.en), s.mat, 'DN' + x.dn, n(x.Qs, 0), n(x.Qa, 0), n(x.v, 1), `${x.vr[0]}–${x.vr[1]}`, n(x.dp, 2)]; }) } });
      const D = r.design;
      B.push({ tbl: { head: ['Thành phần áp lực xả|Discharge pressure component', 'kPa'], w: [70, 30], rows: [
        ['Áp thủy tĩnh tại TWL|Static head at TWL', n(D.hyd, 2)], ['Tổn thất qua phần tử (DWP)|Element loss (DWP)', n(D.dwp, 2)], ['Lưới phân phối + lỗ điều tiết|Distribution grid + orifices', n(D.grid, 2)],
        ['Van điều khiển + đo lưu lượng|Control valve + flowmeter', n(D.valves, 2)], ['Dự phòng bám bẩn đĩa|Diffuser fouling allowance', n(D.foul, 2)], ['Đường ống (tổng các đoạn)|Piping (sum of segments)', n(D.pipeSum, 2)],
        ['Áp lực xả thiết kế máy thổi|Blower design discharge pressure', n(D.pg, 2)]] } });
      const b = r.blower;
      B.push({ h: 1, t: '8. Lựa chọn máy thổi khí và động cơ|8. Blower and motor selection' });
      B.push({ p: `Công nghệ ${b.Bk.name}: hiệu suất dây-tới-khí ${n(b.Bk.eta * 100, 0)} % (Xylem Blower Technology Comparison 2021), giảm tải tối thiểu ${n(b.Bk.td * 100, 0)} %, tiếng ồn: ${b.Bk.noise}; bảo trì: ${b.Bk.maint}. Công suất đoạn nhiệt: Pad = ṁ · k/(k−1) · R · T₁ · [(p₂/p₁)^((k−1)/k) − 1] (dạng SI của Sanitaire Eq. 2).|Technology ${b.Bk.en}: wire-to-air efficiency ${n(b.Bk.eta * 100, 0)} % (Xylem Blower Technology Comparison 2021), minimum turndown ${n(b.Bk.td * 100, 0)} %, noise: ${b.Bk.noiseEn}; maintenance: ${b.Bk.maintEn}. Adiabatic power: Pad = ṁ · k/(k−1) · R · T₁ · [(p₂/p₁)^((k−1)/k) − 1] (SI form of Sanitaire Eq. 2).` });
      B.push({ tbl: { head: ['Thông số|Parameter', 'Giá trị|Value', 'Thông số|Parameter', 'Giá trị|Value'], w: [28, 22, 28, 22], rows: [
        ['Số máy chạy + dự phòng|Duty + standby units', `${b.nDuty} + ${b.nStby}`, 'Model', b.model ? `${b.model.fam} ${b.model.m}` : 'Theo nhà cung cấp|By supplier'],
        ['Lưu lượng mỗi máy (20 °C)|Flow per unit (20 °C)', `${n(b.Qu, 0)} Sm³/h`, 'Lưu lượng mỗi máy (0 °C)|Flow per unit (0 °C)', `${n(b.QuN, 0)} Nm³/h`],
        ['Lưu lượng tại cửa hút|Inlet flow', `${n(b.Qin, 0)} m³/h`, 'Áp lực xả|Discharge pressure', `${n(r.design.pg, 1)} kPa g`],
        ['Áp hút / áp xả tuyệt đối|Absolute inlet / discharge pressure', `${n(b.p1, 1)} / ${n(b.p2, 1)} kPa`, 'Tỷ số nén|Pressure ratio', n(b.r2, 3)],
        ['Công suất đoạn nhiệt|Adiabatic power', `${n(b.padD, 1)} kW`, 'Hiệu suất dây-tới-khí|Wire-to-air efficiency', `${n(b.etaD * 100, 1)} %`],
        ['Công suất điện thiết kế|Design electric power', `${n(b.pElD, 1)} kW`, 'Công suất trục|Shaft power', `${n(b.shaft, 1)} kW`],
        ['Động cơ chọn|Selected motor', `${n(b.motor, b.motor < 10 ? 2 : 0)} kW`, 'Tổng công suất lắp đặt|Total installed power', `${n(b.motor * (b.nDuty + b.nStby), 0)} kW`],
        ['Nhiệt độ khí hút (thiết kế)|Inlet air temperature (design)', `${n(b.T1, 0)} °C`, 'Nhiệt độ khí ra|Outlet air temperature', `${n(b.T2, 0)} °C`]] } });
      if (b.model) {
        const ds = b.model.fam === 'TurboMAX' ? '2468' : '2628';
        B.push({ p: `Kích thước ${b.model.m} (W × L × H): ${b.model.dim.join(' × ')} mm, khối lượng ≈ ${b.model.kg} kg (data sheet ${ds}). Điều kiện môi trường: cao độ ≤ 1.000 m, áp suất 90–110 kPa, RH ≤ 95 %.|${b.model.m} dimensions (W × L × H): ${b.model.dim.join(' × ')} mm, weight ≈ ${b.model.kg} kg (data sheet ${ds}). Ambient conditions: elevation ≤ 1,000 m, pressure 90–110 kPa, RH ≤ 95 %.` });
      }
      B.push({ h: 1, t: '9. Điện năng tiêu thụ|9. Energy consumption' });
      B.push({ tbl: { head: ['Điều kiện|Condition', 'Q Sm³/h', 'Số máy chạy|Units running', 'Tải %|Load %', 'Áp kPa g|Pressure kPa g', 'η %', 'kW điện|Electric kW', 'SAE kg/kWh'], w: [14, 12, 11, 10, 11, 10, 12, 12],
        rows: C3.map(([l, k]) => { const o = r.ops[k]; return [l, n(o.Q, 0), o.nRun, n(o.f * 100, 0), n(o.pg, 1), n(o.eta * 100, 1), n(o.kW, 1), n(o.SAE, 2)]; }) } });
      B.push({ p: `Giờ vận hành ${n(r.hoursY, 0)} h/năm; tỷ trọng thời gian tối thiểu/trung bình/cực đại = ${S.op.wMin}/${S.op.wAvg}/${S.op.wPk}. Điện năng năm ${n(r.kWhY, 0)} kWh, chi phí ${n(r.cost, 0)} ${S.econ.cur}/năm.|Operating hours ${n(r.hoursY, 0)} h/yr; time weights minimum/average/peak = ${S.op.wMin}/${S.op.wAvg}/${S.op.wPk}. Annual energy ${n(r.kWhY, 0)} kWh, cost ${n(r.cost, 0)} ${S.econ.cur}/yr.` });
      const h = r.heat;
      B.push({ h: 1, t: '10. Tính toán nhiệt|10. Heat calculation' });
      B.push({ p: 'Theo Xylem Aeration Handbook, nhiệt độ khí tăng khoảng 10 °C cho mỗi 10 kPa áp lực xả. Nhiệt độ được tính theo nén đoạn nhiệt chia hiệu suất nén nội; làm nguội dọc ống theo mô hình truyền nhiệt T(x) = Ta + (T₂ − Ta)·exp(−U·π·D·x/(ṁ·cp)).|Per the Xylem Aeration Handbook, air temperature rises about 10 °C per 10 kPa of discharge pressure. Temperature is computed from adiabatic compression divided by internal compression efficiency; cooling along the pipe uses T(x) = Ta + (T₂ − Ta)·exp(−U·π·D·x/(ṁ·cp)).' });
      B.push({ tbl: { head: ['Hạng mục|Item', 'Giá trị|Value', 'Hạng mục|Item', 'Giá trị|Value'], w: [30, 20, 30, 20], rows: [
        ['Nhiệt độ khí ra máy|Blower outlet air temperature', `${n(b.T2, 1)} °C`, 'Nhiệt độ tại đầu ống đứng|Temperature at dropleg', `${n(h.Tdrop, 1)} °C`],
        ['Giới hạn vật liệu ống đứng|Dropleg material limit', `${h.matLim} °C (${S.pipe.dropMat})`, 'Nhiệt nén vào dòng khí|Compression heat to air', `${n(h.Qair, 1)} kW`],
        ['Tổn thất động cơ + biến tần|Motor + VFD losses', `${n(h.loss, 1)} kW`, 'Bức xạ vỏ máy + ống nóng|Casing + hot pipe radiation', `${n(h.rad + h.pipeRoom, 1)} kW`],
        ['Tổng nhiệt thải phòng máy|Total blower room heat load', `${n(h.Qroom, 1)} kW`, `Thông gió (ΔT = ${S.heat.dTroom} K)|Ventilation (ΔT = ${S.heat.dTroom} K)`, `${n(h.vent, 0)} m³/h`],
        ['Khí hút của máy thổi|Blower intake air', `${n(h.Qinlet, 0)} m³/h`, 'Giãn nở ống góp chính|Main header expansion', `${n(h.dL, 0)} mm → ${h.nJoint} khớp|${n(h.dL, 0)} mm → ${h.nJoint} joints`],
        ['Nước ngưng trong lưới|Condensate in grid', `${n(h.condDay, 1)} kg/ngày|${n(h.condDay, 1)} kg/d`, 'Bề mặt ống trần|Bare pipe surface', `${n(h.Tsurf, 0)} °C – cần bọc cách nhiệt/che chắn|${n(h.Tsurf, 0)} °C – insulate/guard required`]] } });
    } else {
      const M = DB.mech[r.key];
      B.push({ h: 1, t: '6. Lựa chọn thiết bị sục khí cơ khí|6. Mechanical aerator selection' });
      B.push({ p: bi(M.note, M.noteEn) });
      const rows = [['Thiết bị mỗi bể|Equipment per basin', bi(r.units, r.unitsEn)], ['SOTR cực đại mỗi bể|Peak SOTR per basin', `${n(r.SR.pk, 1)} kg O₂/h`]];
      if (r.key === 'jet') rows.push(['SOTR 1 máy tại độ ngập|SOTR per unit at submergence', `${n(r.sel.su, 2)} kg O₂/h`], ['Lực đẩy yêu cầu / cung cấp|Thrust required / provided', `${n(r.thrustReq, 0)} / ${n(r.sel.th, 0)} N`]);
      else rows.push(['Công suất cho O₂ / khuấy trộn|Power for O₂ / mixing', `${n(r.sel.kwO2, 1)} / ${n(r.mixKW, 1)} kW`], ['SAE sử dụng|SAE used', `${n(r.sel.sae, 2)} kg O₂/kWh`]);
      rows.push(['Tổng công suất lắp đặt|Total installed power', `${n(r.kWinst, 1)} kW`]);
      B.push({ tbl: { head: ['Hạng mục|Item', 'Giá trị|Value'], w: [45, 55], rows } });
      B.push({ h: 1, t: '7. Điện năng tiêu thụ|7. Energy consumption' });
      B.push({ tbl: { head: ['Điều kiện|Condition', 'kW điện|Electric kW', 'SAE kg/kWh'], w: [40, 30, 30], rows: C3.map(([l, k]) => [l, n(r.ops[k].kW, 1), n(r.ops[k].SAE, 2)]) } });
    }
    B.push({ h: 1, t: (diff ? '11' : '8') + '. Bản vẽ sơ bộ|' + (diff ? '11' : '8') + '. Preliminary drawings' });
    DRW.all(S, r).forEach(m => B.push({ img: m }));
    B.push({ h: 1, t: (diff ? '12' : '9') + '. Tài liệu tham khảo|' + (diff ? '12' : '9') + '. References' });
    B.push({ list: DB.refs });
    B.push({ p: 'Ghi chú: Kết quả là tính toán sơ bộ phục vụ lựa chọn phương án. Hiệu suất SOTE, đường đặc tính máy thổi và lực đẩy thiết bị cơ khí cần được nhà sản xuất xác nhận cho từng dự án.|Note: Results are preliminary calculations for option selection. SOTE, blower curves and mechanical aerator thrust must be confirmed by the manufacturer for each project.' });
    return B;
  };

  // ---- HTML (in → PDF) ----
  REP.html = (S, R) => {
    const B = REP.blocks(S, R), E = ZIP.xml;
    const T = s => { const [vi, en] = REP.split(s); return E(vi) + (en ? `<span class="en">${E(en)}</span>` : ''); };
    let o = '';
    for (const b of B) {
      if (b.cover) o += `<section class="cover"><div class="brand">Aeration Design Tool</div><h1>${T(b.title)}</h1><h2>${E(b.sub)}</h2><table class="meta">${b.meta.map(m => `<tr><td>${T(m[0])}</td><td>${E(m[1])}</td></tr>`).join('')}</table></section>`;
      else if (b.h) o += `<h${b.h + 1}>${T(b.t)}</h${b.h + 1}>`;
      else if (b.p) o += `<p>${T(b.p)}</p>`;
      else if (b.tbl) o += `<table class="rt${b.tbl.small ? ' sm' : ''}"><colgroup>${b.tbl.w.map(x => `<col style="width:${x}%">`).join('')}</colgroup><thead><tr>${b.tbl.head.map(h => `<th>${T(h)}</th>`).join('')}</tr></thead><tbody>${b.tbl.rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="v"' : ''}>${T(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      else if (b.warn) o += `<div class="warns">${b.warn.map(w => `<div class="w ${w[0]}">${w[0] === 'err' ? '✖' : w[0] === 'warn' ? '⚠' : 'ℹ'} ${T(bi(w[1], w[2]))}</div>`).join('')}</div>`;
      else if (b.img) o += `<figure class="dw">${DRW.svg(b.img, 1000, 620)}</figure>`;
      else if (b.chart) o += `<figure>${REP.chartSVG(R, 1000, 300)}</figure>`;
      else if (b.list) o += `<ol class="refs">${b.list.map(x => `<li>${E(x)}</li>`).join('')}</ol>`;
    }
    return o;
  };
  REP.chartSVG = (R, W, H) => {
    const xs = R.all.filter(x => !x.err), mx = Math.max(...xs.map(x => x.kWhY)) / 1000;
    const bw = (W - 220) / xs.length, en = s => `<tspan fill-opacity=".6" font-weight="400" font-size="0.85em"> ${s}</tspan>`;
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" font-family="Roboto, Arial"><rect width="${W}" height="${H}" fill="#fff"/><text x="10" y="18" font-size="13" font-weight="700">Điện năng năm theo công nghệ (MWh/năm)${en('Annual energy by technology (MWh/yr)')}</text>`;
    xs.forEach((x, i) => {
      const v = x.kWhY / 1000, h = (H - 90) * v / mx, X = 200 + i * bw, Y = H - 50 - h;
      const col = x.key === R.sel.key ? '#2563eb' : x.feasible ? '#94a3b8' : '#fca5a5';
      o += `<rect x="${(X + 6).toFixed(1)}" y="${Y.toFixed(1)}" width="${(bw - 12).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}"/>`;
      o += `<text x="${(X + bw / 2).toFixed(1)}" y="${(Y - 4).toFixed(1)}" font-size="11" text-anchor="middle">${Math.round(v).toLocaleString('vi-VN')}</text>`;
      o += `<text x="${(X + bw / 2).toFixed(1)}" y="${H - 34}" font-size="10" text-anchor="middle">${ZIP.xml(x.key)}</text>`;
    });
    o += `<text x="10" y="${H - 34}" font-size="10" fill="#475569">disc9/7 = đĩa 9"/7"${en('disc')}; lp = áp thấp${en('low pressure')};</text><text x="10" y="${H - 20}" font-size="10" fill="#475569">ceram9 = gốm${en('ceramic')}; gold = Gold Series; tube = ống${en('tube')};</text><text x="10" y="${H - 6}" font-size="10" fill="#475569">coarse = bọt thô${en('coarse')}; jet; asp = hút${en('aspirating')}; surf = bề mặt${en('surface')}</text>`;
    return o + '</svg>';
  };

  // ---- DOCX ----
  REP.docx = (S, R) => {
    const B = REP.blocks(S, R), E = ZIP.xml, media = [];
    const run = (t, o) => `<w:r>${o ? `<w:rPr>${o}</w:rPr>` : ''}<w:t xml:space="preserve">${E(t)}</w:t></w:r>`;
    // tiếng Việt, xuống dòng, tiếng Anh nhỏ màu xám (enO = định dạng dòng tiếng Anh)
    const runs = (s, o, enO) => { const [vi, en] = REP.split(s); return run(vi, o) + (en ? '<w:r><w:br/></w:r>' + run(en, enO) : ''); };
    const EN = (sz, color) => `<w:b w:val="0"/><w:color w:val="${color || '808080'}"/><w:sz w:val="${sz}"/>`;
    const para = (t, st, o, enSz) => `<w:p>${st ? `<w:pPr><w:pStyle w:val="${st}"/></w:pPr>` : ''}${runs(t, o, (o || '') + EN(enSz || 16))}</w:p>`;
    const tbl = (head, rows, w, small) => {
      const tw = 9600, ws = w.map(x => Math.round(tw * x / 100)), sz = small ? '<w:sz w:val="16"/>' : '<w:sz w:val="18"/>', enSz = small ? 13 : 15;
      const cell = (t, i, h) => `<w:tc><w:tcPr><w:tcW w:w="${ws[i]}" w:type="dxa"/>${h ? '<w:shd w:val="clear" w:color="auto" w:fill="1F3864"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${i && !h ? '<w:jc w:val="left"/>' : ''}</w:pPr>${runs(t, (h ? '<w:b/><w:color w:val="FFFFFF"/>' : '') + sz, EN(enSz, h ? 'BFC8D9' : '808080'))}</w:p></w:tc>`;
      return `<w:tbl><w:tblPr><w:tblW w:w="${tw}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:color="BFBFBF"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${ws.map(x => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>`
        + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h, i) => cell(h, i, true)).join('')}</w:tr>` + rows.map(r => `<w:tr>${r.map((c, i) => cell(String(c), i, false)).join('')}</w:tr>`).join('') + '</w:tbl><w:p/>';
    };
    const pic = (png, wpx, hpx) => {
      const id = media.length + 1; media.push(png);
      const cx = 6100000, cy = Math.round(cx * hpx / wpx);
      return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Hinh${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="img${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIm${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    };
    return (async () => {
      let body = '';
      for (const b of B) {
        if (b.cover) {
          body += '<w:p><w:pPr><w:spacing w:before="2400"/></w:pPr></w:p>' + para(b.title, 'Title', '', 26) + para(b.sub, 'Subtitle');
          body += tbl(['Thông tin|Information', ''], b.meta, [35, 65]) + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
        } else if (b.h) body += para(b.t, 'Heading' + b.h, '', b.h === 1 ? 20 : 18);
        else if (b.p) body += para(b.p);
        else if (b.tbl) body += tbl(b.tbl.head, b.tbl.rows, b.tbl.w, b.tbl.small);
        else if (b.warn) body += b.warn.map(w => { const ic = w[0] === 'err' ? '✖ ' : w[0] === 'warn' ? '⚠ ' : 'ℹ '; return para(ic + bi(w[1], w[2]), null, w[0] === 'err' ? '<w:color w:val="C00000"/>' : w[0] === 'warn' ? '<w:color w:val="B45309"/>' : '<w:color w:val="1F3864"/>'); }).join('');
        else if (b.img) { const png = await REP.svgToPng(DRW.svg(b.img, 1400, 868), 1400, 868); body += pic(png, 1400, 868); }
        else if (b.chart) { const png = await REP.svgToPng(REP.chartSVG(R, 1400, 420), 1400, 420); body += pic(png, 1400, 420); }
        else if (b.list) body += b.list.map((x, i) => para(`[${i + 1}] ${x}`)).join('');
      }
      const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rFt"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
      const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="600"/></w:pPr><w:rPr><w:color w:val="404040"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:rPr><w:sz w:val="16"/><w:color w:val="808080"/></w:rPr></w:style></w:styles>`;
      const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="right"/></w:pPr>${run(`${S.proj.name} – ${S.proj.code} – Rev ${S.proj.rev} – Trang / Page `)}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
      const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rFt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${media.map((m, i) => `<Relationship Id="rIm${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${i + 1}.png"/>`).join('')}</Relationships>`;
      const files = [
        { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>` },
        { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
        { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/footer1.xml', data: footer },
        { name: 'word/_rels/document.xml.rels', data: rels }
      ];
      media.forEach((m, i) => files.push({ name: `word/media/img${i + 1}.png`, data: m }));
      return ZIP.make(files);
    })();
  };
  // SVG → PNG (trình duyệt)
  REP.svgToPng = (svg, w, h) => new Promise((res, rej) => {
    if (typeof Image === 'undefined') return res(new Uint8Array(0));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      c.toBlob(b => b.arrayBuffer().then(a => res(new Uint8Array(a))), 'image/png');
    };
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
})();
if (typeof module !== 'undefined') module.exports = REP;
