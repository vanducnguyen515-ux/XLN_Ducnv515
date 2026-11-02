/* =====================================================================
   THƯ VIỆN TRÍCH DẪN TÀI LIỆU THAM CHIẾU
   Mỗi mục: t (tên), te (tên EN), loc (vị trí trong tài liệu), d / de (diễn giải VI / EN),
            eq (biểu thức), v (định nghĩa ký hiệu), tb {h: tiêu đề cột, r: hàng} (giá trị bảng)
   Nội dung là tóm tắt / biểu thức / số liệu trích theo tài liệu – không chép nguyên văn.
   DATA.citeFind(chuỗi) → danh sách vị trí mã trích dẫn để gắn liên kết trong bản tính.
   ===================================================================== */
'use strict';
(() => {
DATA.CITE_DOCS = {
  ME: 'Metcalf & Eddy | AECOM (2014). Wastewater Engineering: Treatment and Resource Recovery, 5th Ed. McGraw-Hill.',
  ME4: 'Metcalf & Eddy (2003). Wastewater Engineering: Treatment and Reuse, 4th Ed. – không còn dùng; mọi giá trị đã thay bằng bản 5th (2014).',
  ICEAS: 'Xylem Sanitaire – ICEAS 202 Detailed Design Calculations & Aeration Design Calculations (ICEAS Advanced Training, Malaysia, 04/2016).',
  SFC: 'SFC Environmental Technologies – Basic Engineering Package 50 MLD STP Vellore, SFC-A4-D631-BEP-C-Tech-R0 (05/2019); BEP Sangola 8 MLD D-1104 (2024).',
  CPHEEO: 'CPHEEO (2013). Manual on Sewerage and Sewage Treatment Systems, Part A – Engineering, Ch.5. MoUD, Government of India.',
  WEF: 'WEF Manual of Practice No.8 – Design of Municipal Wastewater Treatment Plants, 4th Ed.',
  TCVN: 'TCVN 7957:2008 / 7957:2023 – Thoát nước. Mạng lưới và công trình bên ngoài. Tiêu chuẩn thiết kế.',
  APHA: 'APHA, AWWA, WEF – Standard Methods 4500-O; Benson & Krause (1984) – độ hòa tan oxy trong nước.',
};

const ME = 'ME';
DATA.CITES = {
  /* ---------------- M&E 5th – bảng (đối chiếu trực tiếp bản 5th 2014; tr. = số trang sách) ---------------- */
  'ME:T3-18': { doc: ME, loc: 'Ch.3, Bảng 3-18, tr.221', t: 'Thành phần nước thải sinh hoạt chưa xử lý (thấp – trung bình – cao)', te: 'Typical composition of untreated domestic wastewater (low – medium – high)',
    d: 'Giá trị điển hình dùng để sàng lọc số liệu đầu vào (tab 1, mục 3b). Mẫu "Sinh hoạt đô thị – M&E trung bình" của phần mềm là bộ số liệu thiết kế riêng (BOD 190, COD 430, TSS 210, TKN 40, NH₄-N 25, TP 7) – nằm trong khoảng thấp – cao của bảng, không phải cột trung bình.',
    de: 'Typical values used to screen influent data (tab 1, item 3b). The software sample "Domestic – M&E medium" is its own design set (BOD 190, COD 430, TSS 210, TKN 40, NH₄-N 25, TP 7) – within the table low – high range, not the medium column.',
    tb: { h: ['Chỉ tiêu (mg/L)', 'Thấp', 'Trung bình', 'Cao'], r: [['TSS', '130', '195', '389'], ['BOD₅', '133', '200', '400'], ['COD', '339', '508', '1.016'], ['TN', '23', '35', '69'], ['NH₄-N', '14', '20', '41'], ['TP', '3,7', '5,6', '11'], ['Dầu mỡ', '51', '76', '153']] } },
  'ME:T5-3': { doc: ME, loc: 'Ch.5, Bảng 5-3, tr.312', t: 'Lượng rác thu được theo khe hở song chắn', te: 'Screenings quantities vs screen opening',
    d: 'Lượng rác phụ thuộc khe hở và hệ thống thoát nước; ví dụ khe 12,5 mm khoảng 44 – 110 L/10³ m³, khe 6 mm khoảng 30 – 60 L/10³ m³ (giá trị trích; thiết kế song chắn xem Bảng 5-4).',
    de: 'Screenings quantity depends on opening size and sewer system; e.g. 12.5 mm opening about 44 – 110 L/10³ m³, 6 mm about 30 – 60 L/10³ m³ (excerpt; bar-screen design see Table 5-4).' },
  'ME:T5-4': { doc: ME, loc: 'Ch.5, Bảng 5-4, tr.313', t: 'Thông số thiết kế song chắn rác thô', te: 'Coarse bar screen design parameters',
    d: 'Song chắn cơ giới: bề dày thanh 5 – 15 mm, khe hở 15 – 75 mm, nghiêng 0 – 30° so với phương đứng, vận tốc qua khe tối đa 0,6 – 1,0 m/s và tối thiểu 0,3 – 0,5 m/s, tổn thất cho phép 150 – 600 mm. Song chắn thủ công: khe 25 – 50 mm, nghiêng 30 – 45°, vận tốc 0,3 – 0,6 m/s. Tổn thất áp tính theo PT (5-1).',
    de: 'Mechanically cleaned: bar width 5 – 15 mm, clear opening 15 – 75 mm, slope 0 – 30° from vertical, approach velocity max 0.6 – 1.0 m/s and min 0.3 – 0.5 m/s, allowable headloss 150 – 600 mm. Manually cleaned: opening 25 – 50 mm, slope 30 – 45°, velocity 0.3 – 0.6 m/s. Headloss per Eq. (5-1).',
    tb: { h: ['Thông số', 'Cơ giới', 'Thủ công'], r: [['Bề dày thanh (mm)', '5 – 15', '5 – 15'], ['Khe hở b (mm)', '15 – 75', '25 – 50'], ['Góc nghiêng so với phương đứng (°)', '0 – 30', '30 – 45'], ['Vận tốc tối đa (m/s)', '0,6 – 1,0', '0,3 – 0,6'], ['Vận tốc tối thiểu (m/s)', '0,3 – 0,5', '–'], ['Tổn thất cho phép (mm)', '150 – 600', '150']] } },
  'ME:T5-6': { doc: ME, loc: 'Ch.5, Bảng 5-6, tr.320 – 322', t: 'Lưới lọc rác tinh – mô tả thiết bị', te: 'Fine screens – device description',
    d: 'Lưới tinh dùng cho tiền xử lý (tĩnh wedgewire, trống quay, băng tải, bậc thang) có khe khoảng 0,2 – 6 mm; tổn thất áp qua lưới khoảng 0,8 – 1,4 m. Trước bể MBR dùng khe ≤ 1 – 2 mm để bảo vệ màng.',
    de: 'Fine screens for preliminary treatment (static wedgewire, rotary drum, travelling belt, step) have openings of about 0.2 – 6 mm; headloss about 0.8 – 1.4 m. Ahead of MBR use ≤ 1 – 2 mm to protect the membranes.' },
  'ME:T5-8': { doc: ME, loc: 'Ch.5, Bảng 5-8, tr.328', t: 'Thời gian khuấy trộn theo loại thiết bị', te: 'Mixing times by device type',
    d: 'Trộn tĩnh inline < 1 s; khuấy turbine/cánh trong bể 2 – 20 s; tạo bông 600 – 1.800 s. Bảng không cho G – giá trị G lấy theo Bảng 5-9.',
    de: 'Inline static mixers < 1 s; turbine/propeller mixing in tanks 2 – 20 s; flocculation 600 – 1,800 s. The table gives no G – G values from Table 5-9.' },
  'ME:T5-9': { doc: ME, loc: 'Ch.5, Bảng 5-9, tr.331', t: 'Thời gian lưu và gradient vận tốc G cho khuấy trộn, tạo bông', te: 'Detention time and velocity gradient G for mixing and flocculation',
    d: 'Khuấy trộn nhanh (keo tụ, chỉnh pH): 5 – 30 s, G 500 – 1.500 s⁻¹. Tạo bông trong xử lý nước thải: 30 – 60 phút, G 50 – 100 s⁻¹ (giảm dần theo ngăn). Công suất P = G²·μ·V (PT 5-3).',
    de: 'Rapid mixing (coagulation, pH adjustment): 5 – 30 s, G 500 – 1,500 s⁻¹. Flocculation in wastewater treatment: 30 – 60 min, G 50 – 100 s⁻¹ (tapered). Power P = G²·μ·V (Eq. 5-3).',
    tb: { h: ['Quá trình', 'Thời gian', 'G (s⁻¹)'], r: [['Khuấy trộn nhanh – keo tụ', '5 – 30 s', '500 – 1.500'], ['Tạo bông (nước thải)', '30 – 60 phút', '50 – 100']] } },
  'ME:T5-16': { doc: ME, loc: 'Ch.5, Bảng 5-16, tr.371', t: 'Thông số bể lắng cát dòng chảy ngang', te: 'Horizontal-flow grit chamber design parameters',
    tb: { h: ['Thông số', 'Khoảng', 'Điển hình'], r: [['Thời gian lưu (s)', '45 – 90', '60'], ['Vận tốc ngang (m/s)', '0,25 – 0,4', '0,3'], ['Cộng thêm chiều dài cho xáo trộn đầu – cuối (%)', '25 – 50', '30']] } },
  'ME:T5-17': { doc: ME, loc: 'Ch.5, Bảng 5-17, tr.374', t: 'Thông số bể lắng cát thổi khí', te: 'Aerated grit chamber design parameters',
    d: 'Thời gian lưu ở lưu lượng đỉnh 2 – 5 phút (3); sâu 2 – 5 m; dài 7,5 – 20 m; rộng 2,5 – 7 m; W:D 1:1 – 5:1 (1,5:1); L:W 3:1 – 5:1 (4:1); cấp khí 0,2 – 0,5 m³/phút trên 1 m dài (= 3,3 – 8,3 L/m·s).',
    de: 'Detention at peak flow 2 – 5 min (3); depth 2 – 5 m; length 7.5 – 20 m; width 2.5 – 7 m; W:D 1:1 – 5:1 (1.5:1); L:W 3:1 – 5:1 (4:1); air 0.2 – 0.5 m³/min per m of length (= 3.3 – 8.3 L/m·s).',
    tb: { h: ['Thông số', 'Khoảng', 'Điển hình'], r: [['Thời gian lưu ở Q đỉnh (phút)', '2 – 5', '3'], ['Chiều sâu (m)', '2 – 5', ''], ['Chiều dài (m)', '7,5 – 20', ''], ['Chiều rộng (m)', '2,5 – 7', ''], ['W:D', '1:1 – 5:1', '1,5:1'], ['L:W', '3:1 – 5:1', '4:1'], ['Khí (m³/phút·m)', '0,2 – 0,5', '']] } },
  'ME:T5-18': { doc: ME, loc: 'Ch.5, Bảng 5-18, tr.379', t: 'Thông số bể lắng cát xoáy', te: 'Vortex grit chamber design parameters',
    d: 'Thời gian lưu 20 – 30 s ở lưu lượng trung bình; kích thước buồng theo catalogue nhà sản xuất cho lưu lượng đỉnh. Phần mềm tính V = Q_TB·t/n và D = ∛(4V/π).',
    de: 'Detention 20 – 30 s at average flow; chamber size per manufacturer for peak flow. The software uses V = Q_avg·t/n and D = ∛(4V/π).' },
  'ME:T5-19': { doc: ME, loc: 'Ch.5, Bảng 5-19, 5-20, tr.394 – 395', t: 'Thông số bể lắng sơ cấp', te: 'Primary sedimentation tank design parameters',
    d: 'Lắng sơ cấp không hóa chất: thời gian lưu 1,5 – 2,5 h; tải trọng bề mặt trung bình 30 – 50 (40), đỉnh 80 – 120 (100) m³/m²·ngđ; tải trọng máng 125 – 500 m³/m·ngđ; sâu bể 3 – 4,9 m (Bảng 5-20).',
    de: 'Primary settling without chemicals: detention 1.5 – 2.5 h; overflow rate average 30 – 50 (40), peak 80 – 120 (100) m³/m²·d; weir loading 125 – 500 m³/m·d; depth 3 – 4.9 m (Table 5-20).' },
  'ME:T5-28': { doc: ME, loc: 'Ch.5, Bảng 5-28, tr.431', t: 'Đặc tính đĩa phân phối khí bọt mịn', te: 'Fine-pore diffuser characteristics',
    d: 'Đĩa sứ/gốm: lưu lượng khí 0,01 – 0,1 m³/phút·đĩa (0,6 – 6 m³/h), SOTE 25 – 35 % ở độ ngập 4,5 m; đĩa/ống màng EPDM tương đương; tấm màng 38 – 43 %. Phần mềm dùng q_đĩa và SOTE của catalogue chung cho mọi phương án (R05).',
    de: 'Ceramic discs: airflow 0.01 – 0.1 m³/min·disc (0.6 – 6 m³/h), SOTE 25 – 35 % at 4.5 m submergence; EPDM membrane discs/tubes similar; membrane panels 38 – 43 %. The software uses catalogue q_disc and SOTE common to all alternatives (R05).' },
  'ME:T6-24': { doc: ME, loc: 'Ch.6, Bảng 6-24, tr.544', t: 'Thời gian khuấy trộn ban đầu cho hóa chất', te: 'Initial mixing times for chemicals',
    d: 'Phèn/FeCl₃ keo tụ hấp phụ – trung hòa điện tích < 1 s (trộn tĩnh inline); keo tụ quét 1 – 10 s; vôi 10 – 30 s; polymer anion 1 – 10 s. Bể phản ứng/chỉnh pH dùng thời gian lưu dài hơn theo nhiệm vụ của bể.',
    de: 'Alum/FeCl₃ adsorption – charge neutralization < 1 s (inline static mixing); sweep floc 1 – 10 s; lime 10 – 30 s; anionic polymer 1 – 10 s. Reaction/pH tanks use longer detention as required.',
    tb: { h: ['Hóa chất / cơ chế', 'Thời gian trộn'], r: [['Phèn, FeCl₃ – hấp phụ, trung hòa', '< 1 s'], ['Phèn, FeCl₃ – keo tụ quét', '1 – 10 s'], ['Vôi', '10 – 30 s'], ['Polymer anion', '1 – 10 s']] } },
  'ME:T8-14': { doc: ME, loc: 'Ch.8, Bảng 8-14, tr.755', t: 'Hệ số động học bùn hoạt tính ở 20 °C', te: 'Activated-sludge kinetic coefficients at 20 °C',
    d: 'Hệ số động học cho vi khuẩn dị dưỡng và nitrat hóa (AOB, NOB) ở 20 °C với hệ số nhiệt θ; k_T = k₂₀·θ^(T−20) (PT 1-44). Là giá trị mặc định nhóm "Hằng số động học" (tab 4) và dùng chung cho mọi phương án, kể cả kiểm tra nitrat hóa ICEAS (thay hệ số bản 4 μnm 0,75 / Kn 0,74 / kdn 0,08 mà Sanitaire dùng).',
    de: 'Kinetic coefficients for heterotrophs and nitrifiers (AOB, NOB) at 20 °C with θ; k_T = k₂₀·θ^(T−20) (Eq. 1-44). Defaults of the "Kinetic constants" group (tab 4), common to all alternatives including the ICEAS nitrification check (replacing the 4th-edition μnm 0.75 / Kn 0.74 / kdn 0.08 used by Sanitaire).',
    tb: { h: ['Hệ số', 'Đơn vị', 'Giá trị 20 °C', 'θ'], r: [
      ['μmax,H', 'g VSS/g VSS·d', '6,0', '1,07'], ['K_s', 'g bCOD/m³', '8,0', '1,00'], ['Y_H', 'g VSS/g bCOD', '0,45', '–'], ['b_H', 'g VSS/g VSS·d', '0,12', '1,04'], ['K_o,H', 'g O₂/m³', '0,20', '1,00'], ['f_d', '–', '0,15', '–'],
      ['μmax,AOB', 'g VSS/g VSS·d', '0,90', '1,072'], ['K_NH4', 'g NH₄-N/m³', '0,50', '1,00'], ['Y_AOB', 'g VSS/g NH₄-N', '0,15', '–'], ['b_AOB', 'g VSS/g VSS·d', '0,17', '1,029'], ['K_o,AOB', 'g O₂/m³', '0,50', '1,00'],
      ['μmax,NOB', 'g VSS/g VSS·d', '1,00', '1,063'], ['K_NO2', 'g NO₂-N/m³', '0,20', '1,00'], ['Y_NOB', 'g VSS/g NO₂-N', '0,05', '–'], ['b_NOB', 'g VSS/g VSS·d', '0,17', '1,029'], ['K_o,NOB', 'g O₂/m³', '0,90', '1,00']] } },
  'ME:T8-15': { doc: ME, loc: 'Ch.8, Bảng 8-15, tr.755', t: 'Trình tự thiết kế bể CMAS khử BOD và nitrat hóa (18 bước)', te: 'Design procedure for CMAS BOD removal and nitrification (18 steps)',
    d: '(1) đặc tính nước thải (bCOD, rbCOD, nbVSS, iTSS…); (2) chọn NH₄-N ra, DO và SF; (3 – 6) hệ số động học ở T, μ_AOB và SRT_min; (7) SRT thiết kế = SF × SRT_min (SF 1,3 – 2,0); (8 – 9) S, P_X,bio và NOx lặp; (10) khối bùn P_X,TSS·SRT; (11) thể tích V = M/X, τ; (12) F/M, tải trọng thể tích; (13) nhu cầu oxy; (14) hệ thống cấp khí; (15) độ kiềm; (16) lắng thứ cấp; (17) chất lượng nước ra; (18) tổng hợp thiết kế.',
    de: '(1) characterization (bCOD, rbCOD, nbVSS, iTSS…); (2) select effluent NH₄-N, DO and SF; (3 – 6) kinetics at T, μ_AOB and SRT_min; (7) design SRT = SF × SRT_min (SF 1.3 – 2.0); (8 – 9) S, P_X,bio and NOx iteration; (10) solids mass P_X,TSS·SRT; (11) volume V = M/X, τ; (12) F/M, volumetric loading; (13) oxygen demand; (14) aeration system; (15) alkalinity; (16) secondary clarifier; (17) effluent quality; (18) design summary.' },
  'ME:T8-16': { doc: ME, loc: 'Ch.8, Bảng 8-16, tr.771', t: 'Các bước vận hành SBR', te: 'SBR operational steps',
    d: 'Nạp: mực nước tăng từ khoảng 75 % lên 100 % thể tích tối đa; với 2 bể thời gian nạp ≈ 50 % chu kỳ; nạp chỉ khuấy ≥ 50 % giúp hạn chế vi khuẩn dạng sợi. Phản ứng: sục khí hoặc xen kẽ sục khí – khuấy để nitrat hóa/khử nitrat. Lắng: tĩnh. Gạn: decanter phao hoặc máng điều chỉnh. Chờ: chuyển bể, dự phòng lưu lượng mưa.',
    de: 'Fill: level rises from about 75 % to 100 % of maximum volume; with 2 tanks fill ≈ 50 % of the cycle; mix-only fill ≥ 50 % helps control filaments. React: aeration or cyclic aeration – mixing for nitrification/denitrification. Settle: quiescent. Decant: floating or adjustable weirs. Idle: tank switching, wet-weather capacity.' },
  'ME:T8-17': { doc: ME, loc: 'Ch.8, Bảng 8-17, tr.774', t: 'Trình tự tính toán SBR', te: 'SBR computation approach',
    d: 'Chọn số bể và thời gian các pha; thể tích nạp mỗi chu kỳ V_F = Q/n_ck; kiểm tra phân suất nạp V_F/V_T theo SVI và MLSS (Hình 8-21, PT 8-50); tính SRT từ cân bằng khối bùn, thời gian sục khí cần cho nitrat hóa (PT 8-49), oxy, khử nitrat trong pha nạp/thiếu khí.',
    de: 'Select number of tanks and phase times; fill volume per cycle V_F = Q/n_cyc; check fill fraction V_F/V_T vs SVI and MLSS (Fig. 8-21, Eq. 8-50); SRT from solids balance, aeration time for nitrification (Eq. 8-49), oxygen, denitrification in fill/anoxic phases.' },
  'ME:T8-19': { doc: ME, loc: 'Ch.8, Bảng 8-19, tr.793', t: 'Thông số thiết kế điển hình các quá trình bùn hoạt tính', te: 'Typical design parameters of commonly used activated-sludge processes',
    tb: { h: ['Quá trình', 'SRT (ngày)', 'F/M (kgBOD/kgMLVSS·d)', 'L_v (kgBOD/m³·d)', 'MLSS (mg/L)', 'τ (h)'], r: [
      ['Thông thường dòng nút', '3 – 15', '0,2 – 0,4', '0,3 – 0,7', '1.000 – 3.000', '4 – 8'],
      ['Nạp bậc (step feed)', '3 – 15', '0,2 – 0,4', '0,7 – 1,0', '1.500 – 4.000', '3 – 5'],
      ['Khuấy trộn hoàn toàn (CMAS)', '3 – 15', '0,2 – 0,6', '0,3 – 1,6', '1.500 – 4.000', '3 – 6'],
      ['Sục khí kéo dài', '20 – 40', '0,04 – 0,1', '0,1 – 0,3', '2.000 – 4.000', '20 – 30'],
      ['Mương oxy hóa', '15 – 30', '0,04 – 0,1', '0,1 – 0,3', '3.000 – 5.000', '15 – 30'],
      ['Mẻ – xả gián đoạn (batch decant: ICEAS, CAAS)', '12 – 30', '0,04 – 0,1', '0,1 – 0,3', '2.000 – 5.000', '20 – 40'],
      ['SBR', '15 – 30', '0,04 – 0,1', '0,1 – 0,3', '2.000 – 5.000', '15 – 40'],
      ['Sục khí ngược dòng (CCAS)', '15 – 30', '0,04 – 0,1', '0,1 – 0,3', '2.000 – 4.000', '15 – 40']] } },
  'ME:T8-22': { doc: ME, loc: 'Ch.8, Bảng 8-22, tr.806', t: 'Hệ số b₀, b₁ tính SDNR theo F/M_b và tỷ lệ rbCOD/bCOD', te: 'Coefficients b₀, b₁ for SDNR vs F/M_b and rbCOD/bCOD',
    d: 'SDNR_b = b₀ + b₁·ln(F/M_b) khi F/M_b > 0,5 (PT 8-57); khi F/M_b ≤ 0,5 dùng SDNR_b = 0,24·F/M_b (PT 8-58); hiệu chỉnh nhiệt 1,026^(T−20). Phần mềm nội suy b₀, b₁ tuyến tính theo % rbCOD/bCOD.',
    de: 'SDNR_b = b₀ + b₁·ln(F/M_b) for F/M_b > 0.5 (Eq. 8-57); for F/M_b ≤ 0.5 use SDNR_b = 0.24·F/M_b (Eq. 8-58); temperature correction 1.026^(T−20). The software interpolates b₀, b₁ linearly by % rbCOD/bCOD.',
    tb: { h: ['rbCOD/bCOD (%)', 'b₀', 'b₁'], r: [['10', '0,186', '0,078'], ['20', '0,213', '0,118'], ['30', '0,235', '0,141'], ['40', '0,242', '0,152'], ['50', '0,270', '0,162']] } },
  'ME:T8-26': { doc: ME, loc: 'Ch.8, Bảng 8-26, tr.850; PT (8-65)', t: 'Động học khử nitrat với nguồn carbon ngoài', te: 'Denitrification kinetics with external carbon sources',
    d: 'Methanol: μmax 1,12 – 1,3 g/g·d (20 °C), θ 1,09 – 1,12; acetate 4,46, θ 1,21; ethanol 3,02, θ 1,1. Nhu cầu COD cho 1 g NO₃-N = 2,86/(1 − 1,42·Y_net) (PT 8-65); với Y ≈ 0,3 g VSS/g COD → ≈ 4,98 g COD/g N; methanol ≈ 1,5 g COD/g CH₃OH; bùn sinh thêm ≈ Y·COD/0,85.',
    de: 'Methanol: μmax 1.12 – 1.3 g/g·d (20 °C), θ 1.09 – 1.12; acetate 4.46, θ 1.21; ethanol 3.02, θ 1.1. COD per g NO₃-N = 2.86/(1 − 1.42·Y_net) (Eq. 8-65); with Y ≈ 0.3 g VSS/g COD → ≈ 4.98 g COD/g N; methanol ≈ 1.5 g COD/g CH₃OH; extra sludge ≈ Y·COD/0.85.',
    tb: { h: ['Nguồn carbon', 'μmax 20 °C (1/ngày)', 'θ'], r: [['Methanol', '1,12 – 1,3', '1,09 – 1,12'], ['Acetate', '4,46', '1,21'], ['Ethanol', '3,02', '1,1']] } },
  'ME:T8-29': { doc: ME, loc: 'Ch.8, Bảng 8-29, tr.873', t: 'Thông số thiết kế các quá trình khử P sinh học', te: 'Design parameters for biological phosphorus removal processes',
    tb: { h: ['Quá trình', 'SRT (ngày)', 'τ kỵ khí (h)', 'τ thiếu khí (h)', 'τ hiếu khí (h)', 'RAS (%Q)', 'Tuần hoàn nội (%Q)'], r: [
      ['A/O', '2 – 5', '0,5 – 1,5', '–', '1 – 3', '25 – 100', '–'],
      ['A²O', '5 – 25', '0,5 – 1,5', '1 – 3', '4 – 8', '25 – 100', '100 – 400'],
      ['SBR', '20 – 40', '1,5 – 3', '1 – 3', '2 – 4', '–', '–']] } },
  'ME:T8-30': { doc: ME, loc: 'Ch.8, Bảng 8-30, tr.873', t: 'Tỷ lệ chất nền/P cần cho khử P sinh học', te: 'Substrate-to-P ratios for biological P removal',
    d: 'Để đạt TP ra thấp cần: VFA:P ≈ 8, rbCOD:P ≈ 18, BOD:P ≈ 30, COD:P ≈ 60 (g/g). Phần mềm sàng lọc BOD/TP ≥ 30 và rbCOD/TP ≥ 18.',
    de: 'To reach low effluent TP: VFA:P ≈ 8, rbCOD:P ≈ 18, BOD:P ≈ 30, COD:P ≈ 60 (g/g). The software screens BOD/TP ≥ 30 and rbCOD/TP ≥ 18.',
    tb: { h: ['Chất nền', 'Tỷ lệ g/g P'], r: [['VFA', '8'], ['rbCOD', '18'], ['BOD', '30'], ['COD', '60']] } },
  'ME:T8-34': { doc: ME, loc: 'Ch.8, Bảng 8-34, tr.890', t: 'Thông số thiết kế bể lắng thứ cấp', te: 'Secondary clarifier design parameters',
    d: 'Chiều sâu 4,0 – 5,5 m. Tải trọng chất rắn trung bình 4 – 6 kg/m²·h (BNR 5 – 8; sục khí kéo dài 1 – 5), đỉnh 10 (sục khí kéo dài 8).',
    de: 'Depth 4.0 – 5.5 m. Solids loading average 4 – 6 kg/m²·h (BNR 5 – 8; extended aeration 1 – 5), peak 10 (extended aeration 8).',
    tb: { h: ['Quá trình', 'SOR TB (m³/m²·ngđ)', 'SOR đỉnh (m³/m²·ngđ)', 'SLR TB (kg/m²·h)', 'SLR đỉnh (kg/m²·h)'], r: [
      ['Bùn hoạt tính (sục khí thông thường)', '16 – 28', '36 – 56', '4 – 6', '10'],
      ['Có selector / BNR', '24 – 32', '40 – 64', '5 – 8', '10'],
      ['Sục khí kéo dài', '8 – 16', '24 – 32', '1 – 5', '8']] } },
  'ME:T12-14': { doc: ME, loc: 'Ch.12, Bảng 12-14, tr.1331', t: 'Liều clo điển hình theo tiêu chuẩn coliform (tiếp xúc 30 phút)', te: 'Typical chlorine dosages vs coliform standard (30 min contact)',
    d: 'Liều clo kết hợp (mg/L) để đạt tổng coliform ra theo từng loại nước; chỉ dùng ước tính ban đầu – cần thí nghiệm hiện trường.',
    de: 'Combined chlorine dose (mg/L) to reach effluent total coliform per wastewater type; initial estimate only – site testing required.',
    tb: { h: ['Loại nước', '1.000 MPN/100 mL', '200', '23', '≤ 2,2'], r: [['Nước sau lắng sơ cấp', '8 – 12', '18 – 24', '', ''], ['Sau bùn hoạt tính', '5,5 – 7,5', '10 – 13', '13 – 17', ''], ['Sau bùn hoạt tính + lọc', '2,5 – 3,5', '5,5 – 7,5', '10 – 13', '13 – 17'], ['Nước đã nitrat hóa (clo tự do)', '', '0,02 – 0,03', '0,03 – 0,04', '0,04 – 0,05']] } },
  'ME:T13-19': { doc: ME, loc: 'Ch.13, Bảng 13-19, tr.1490', t: 'Tải trọng chất rắn bể nén bùn trọng lực', te: 'Solids loading for gravity thickeners',
    d: 'Bùn hoạt tính dư: 20 – 40 kg/m²·ngđ, nồng độ 0,5 – 1,5 % → 2 – 3 %; bùn hóa học sắt/nhôm: 10 – 50 kg/m²·ngđ; bùn sơ cấp 100 – 150 kg/m²·ngđ.',
    de: 'Waste activated sludge: 20 – 40 kg/m²·d, 0.5 – 1.5 % → 2 – 3 %; iron/alum chemical sludge: 10 – 50 kg/m²·d; primary sludge 100 – 150 kg/m²·d.' },
  'ME:T13-21': { doc: ME, loc: 'Ch.13, Bảng 13-21, tr.1495', t: 'Tải trọng thủy lực thiết bị cô đặc băng tải (GBT)', te: 'Hydraulic loading for gravity belt thickeners',
    d: 'Bề rộng băng 1,0 – 3,0 m; tải trọng thủy lực tới khoảng 800 L/m·phút tùy bề rộng; tải trọng chất rắn xác định bằng thử nghiệm (phần mềm dùng 200 – 600 kg DS/m·h).',
    de: 'Belt width 1.0 – 3.0 m; hydraulic loading up to about 800 L/m·min depending on width; solids loading by testing (the software uses 200 – 600 kg DS/m·h).' },
  'ME:F8-21': { doc: ME, loc: 'Ch.8, Hình 8-21, tr.774', t: 'Phân suất nạp/gạn SBR khuyến cáo theo MLSS và SVI', te: 'Recommended SBR fill/decant fraction vs MLSS and SVI',
    d: 'Phân suất nạp/gạn tối đa giảm khi MLSS và SVI tăng. Phần mềm kiểm tra ΔH/TWL ≤ 1 − MLSS·SVI/10⁶ − h_sup/TWL (PT 8-50).',
    de: 'The maximum fill/decant fraction decreases with MLSS and SVI. The software checks ΔH/TWL ≤ 1 − MLSS·SVI/10⁶ − h_sup/TWL (Eq. 8-50).',
    tb: { h: ['MLSS ở TWL (mg/L), SVI 150', '3.000', '3.500', '4.000', '5.000'], r: [['Phân suất nạp/gạn tối đa', '0,34', '0,30', '0,25', '0,16']] } },

  /* ---------------- M&E – phương trình ---------------- */
  'ME:E1-44': { doc: ME, loc: 'Ch.1, PT (1-44), tr.33', t: 'Hiệu chỉnh hệ số theo nhiệt độ', te: 'Temperature correction of rate coefficients', eq: 'k_T = k₂₀·θ^(T − 20)', v: [['k_T, k₂₀', 'hệ số ở T và 20 °C'], ['θ', 'hệ số nhiệt (Bảng 8-14)']] },
  'ME:E5-1': { doc: ME, loc: 'Ch.5, PT (5-1), tr.317', t: 'Tổn thất áp qua song chắn rác', te: 'Headloss through bar screens', eq: 'h_L = (1/C)·(v² − v_m²)/(2g)', v: [['C', '0,7 song sạch; 0,6 khi bị tắc'], ['v', 'vận tốc qua khe (m/s)'], ['v_m', 'vận tốc trong mương trước song (m/s)']] },
  'ME:E5-3': { doc: ME, loc: 'Ch.5, PT (5-3), tr.330', t: 'Gradient vận tốc (Camp & Stein)', te: 'Velocity gradient (Camp & Stein)', eq: 'G = √(P/(μ·V))  ⇔  P = G²·μ·V', v: [['P', 'công suất truyền vào nước (W)'], ['μ', 'độ nhớt động lực (N·s/m², Phụ lục C)'], ['V', 'thể tích bể (m³)']] },
  'ME:E5-4': { doc: ME, loc: 'Ch.5, PT (5-4), tr.330', t: 'Tích số G·t', te: 'G·t product', eq: 'G·τ = (1/Q)·√(P·V/μ)', v: [['τ', 'thời gian lưu V/Q (s)']], d: 'Chỉ số đánh giá mức tạo bông; thường 10⁴ – 10⁵.', de: 'Flocculation index; usually 10⁴ – 10⁵.' },
  'ME:E5-33': { doc: ME, loc: 'Ch.5, PT (5-33) … (5-35), tr.357 – 358', t: 'Lắng ngược chiều giữa hai tấm nghiêng – vận tốc cho phép', te: 'Countercurrent settling between inclined plates – allowable velocity', eq: 't = d/(v_s·cosθ) (5-33);  L = d·(u − v_s·sinθ)/(v_s·cosθ) (5-34);  v_s ≥ u·d/(L·cosθ + d·sinθ) (5-35)  ⇔  u = v_s·(L·cosθ + d·sinθ)/d', v: [['v_s', 'vận tốc lắng thiết kế'], ['L', 'chiều dài tấm'], ['d', 'khoảng cách tấm'], ['θ', 'góc nghiêng 45 – 60°']] },
  'ME:E5-34': { doc: ME, loc: 'Ch.5, PT (5-34), tr.358', t: 'Chiều dài tấm cần thiết; diện tích chiếu bằng bó tấm', te: 'Required plate length; projected area of plate pack', eq: 'L = d·(u − v_s·sinθ)/(v_s·cosθ) (5-34);  diện tích chiếu A = N·L·w·cosθ (hình học, không đánh số trong sách)', v: [['N', 'số tấm/khe'], ['w', 'chiều rộng tấm']] },
  'ME:E5-35': { doc: ME, loc: 'Ch.5, PT (5-35), tr.358', t: 'Điều kiện giữ hạt giữa hai tấm', te: 'Particle capture condition between plates', eq: 'v_s ≥ u·d/(L·cosθ + d·sinθ)', d: 'Mọi hạt có vận tốc lắng ≥ v_s đều bị giữ lại; phần mềm viết ngược thành vận tốc cho phép u. Khoảng cách tấm d thường 50 – 100 mm.', de: 'All particles with settling velocity ≥ v_s are captured; the software inverts it to the allowable velocity u. Plate spacing d usually 50 – 100 mm.' },
  'ME:E5-36': { doc: ME, loc: 'Ch.5, PT (5-36), tr.358', t: 'Vận tốc giữa các tấm – số khe yêu cầu', te: 'Velocity between plates – required number of channels', eq: 'u = Q/(N·d·w)  ⇔  N = Q/(u·d·w)', v: [['Q', 'lưu lượng qua bể lamella']] },
  'ME:E5-47': { doc: ME, loc: 'Ch.5, PT (5-47), (5-48), tr.406 – 407', t: 'Tỷ lệ khí/chất rắn A/S của DAF', te: 'DAF air-to-solids ratio', eq: 'Toàn dòng bão hòa: A/S = 1,3·s_a·(f·P − 1)/S_a (5-47);  chỉ bão hòa dòng hồi lưu: A/S = 1,3·s_a·(f·P − 1)·R/(S_a·Q) (5-48)', v: [['s_a', 'độ hòa tan không khí (mL/L): 0 °C 29,2; 10 °C 22,8; 20 °C 18,7; 30 °C 15,7'], ['f', 'hệ số bão hòa (≈ 0,5)'], ['P', 'áp suất tuyệt đối (atm) = (p + 101,35)/101,35'], ['S_a', 'TSS vào (mg/L)'], ['R, Q', 'lưu lượng hồi lưu và nước vào']] },
  'ME:E5-48': { doc: ME, loc: 'Ch.5, PT (5-48), tr.407', t: 'Lưu lượng hồi lưu bão hòa theo A/S', te: 'Pressurized recycle flow from A/S', eq: 'A/S = 1,3·s_a·(f·P − 1)·R/(S_a·Q)  ⇔  R = (A/S)·S_a·Q/[1,3·s_a·(f·P − 1)]', v: [['f', 'phần khí hòa tan ở áp suất P, thường 0,5']] },

  'ME:E5-70': { doc: ME, loc: 'Ch.5, PT (5-70), tr.420', t: 'Hiệu chỉnh tốc độ truyền oxy hiện trường – SOTR từ AOR', te: 'Field oxygen transfer correction – SOTR from AOR', eq: 'AOTR = SOTR·(τ·β·Ω·C*∞,20 − C)/C*∞,20·1,024^(T−20)·α·F  ⇔  SOTR = AOR·C*∞,20/(τ·β·Ω·C*∞,20 − C)·1,024^(20−T)/(α·F);  C*∞,20 = C*s,20·[1 + d_e·(D_f/P_s)]', v: [['τ', 'hệ số hiệu chỉnh nhiệt độ = C*s,T/C*s,20'], ['β', 'tỷ số DO bão hòa nước thải/nước sạch, 0,95 – 0,98'], ['Ω', 'hệ số hiệu chỉnh áp suất = P_b/P_s (theo cao độ)'], ['C*∞,20', 'DO bão hòa ở độ ngập, 20 °C, 1 atm'], ['d_e', 'hệ số hiệu chỉnh giữa cột nước 0,25 – 0,45 (0,40)'], ['D_f', 'độ ngập đĩa (m); P_s = 10,33 m'], ['C', 'DO vận hành'], ['α, F', 'α: 0,3 – 1,2, khuếch tán 0,4 – 0,8 (tr.424), theo SRT 0,53 – 0,65 (tr.885); F bám bẩn 0,65 – 0,9'], ['T', 'nhiệt độ nước – phần mềm dùng T_max (quy tắc R05)']], d: 'Dùng chung cho mọi phương án có cấp khí khuếch tán (CMAS, AO, A²O, SBR, mương, C-Tech; ICEAS dùng C*∞,20 với cùng d_e). Thay cho cách tính C\'s theo M&E 4th PT (5-55) mà BEP SFC sử dụng.', de: 'Common to all diffused-aeration alternatives (CMAS, AO, A²O, SBR, ditch, C-Tech; ICEAS uses C*∞,20 with the same d_e). Replaces the M&E 4th Eq. (5-55) C\'s method used in the SFC BEP.' },
  'ME:E5-77': { doc: ME, loc: 'Ch.5, PT (5-77a), tr.434', t: 'Công suất máy thổi khí (nén đoạn nhiệt)', te: 'Blower power (adiabatic compression)', eq: 'P_w = w·R·T₁/(28,97·n·e)·[(p₂/p₁)^n − 1],  n = 0,283', v: [['w', 'lưu lượng khối lượng khí (kg/s)'], ['R', '8,314 kJ/kmol·K'], ['T₁', 'nhiệt độ khí vào (K)'], ['p₁, p₂', 'áp suất tuyệt đối vào / ra'], ['n', '(k − 1)/k = 0,283 (k = 1,395, không khí khô)'], ['e', 'hiệu suất máy thổi 0,70 – 0,90 (tr.434)']] },
  'ME:E5-77a': { doc: ME, loc: 'Ch.5, PT (5-77a), tr.434', t: 'Công suất máy thổi – dạng SI', te: 'Blower power – SI form', eq: 'P_w (kW) = w·R·T₁/(28,97·0,283·e)·[(p₂/p₁)^0,283 − 1]' },
  'ME:E7-42': { doc: ME, loc: 'Ch.7, PT (7-42), tr.599', t: 'Nồng độ sinh khối dị dưỡng hoạt động', te: 'Active heterotrophic biomass concentration', eq: 'X_H = (SRT/τ)·Y_H·(S₀ − S)/(1 + b_H·SRT)  ⇔  M_Xb = Q·Y_H·(S₀ − S)·SRT/(1 + b_H·SRT)', v: [['τ', 'thời gian lưu nước V/Q'], ['S₀, S', 'bCOD vào và bCOD hòa tan còn lại']] },
  'ME:E7-46': { doc: ME, loc: 'Ch.7, PT (7-46), tr.600', t: 'Nồng độ cơ chất hòa tan còn lại', te: 'Effluent soluble substrate concentration', eq: 'S = K_s·(1 + b·SRT)/[SRT·(μmax − b) − 1]' },
  'ME:E7-94': { doc: ME, loc: 'Ch.7, PT (7-94), tr.624', t: 'Tốc độ sinh trưởng riêng của vi khuẩn nitrat hóa', te: 'Specific growth rate of nitrifiers', eq: 'μ_AOB = μmax,AOB·[N/(N + K_NH4)]·[DO/(DO + K_o)] − b_AOB', v: [['N', 'NH₄-N ra thiết kế'], ['DO', 'DO vùng hiếu khí'], ['μmax, b', 'đã hiệu chỉnh ở T_min theo PT (1-44)']] },
  'ME:E7-98': { doc: ME, loc: 'Ch.7, PT (7-98), (7-99), tr.625', t: 'Tuổi bùn tối thiểu cho nitrat hóa; NH₄-N ra', te: 'Minimum SRT for nitrification; effluent NH₄-N', eq: 'μ_AOB = 1/SRT (7-98)  ⇒  SRT_min = 1/μ_AOB;  S_NH = K_NH·[1 + b_AOB·SRT]/[SRT·(μmax,AOB,DO − b_AOB) − 1] (7-99);  SRT thiết kế = SF·SRT_min (Bảng 8-15)' },
  'ME:E7-71': { doc: ME, loc: 'Ch.7, PT (7-70), (7-71), tr.608', t: 'Tuổi bùn tối thiểu (rửa trôi)', te: 'Minimum SRT (washout)', eq: '1/SRT_min = Y·k·S₀/(K_s + S₀) − b (7-70);  S₀ ≫ K_s: 1/SRT_min ≈ Y·k − b = μmax − b (7-71)' },
  'ME:E8-7': { doc: ME, loc: 'Ch.8, PT (8-5), (8-6), tr.713', t: 'Tỷ lệ COD hạt phân hủy được', te: 'Biodegradable fraction of particulate COD', eq: 'bpCOD/pCOD = [(bCOD/BOD)·(BOD − sBOD)]/(COD − sCOD) (8-6)', d: 'Bản 5th: PT (8-5), (8-6). PT (8-7) … (8-9) là cách tính thay thế: nbpCOD = TCOD − bCOD − nbsCOD_e, nbVSS = nbpCOD/VSS_COD.', de: '5th ed.: Eqs. (8-5), (8-6). Eqs. (8-7) … (8-9) are the alternative route: nbpCOD = TCOD − bCOD − nbsCOD_e, nbVSS = nbpCOD/VSS_COD.' },
  'ME:E8-9': { doc: ME, loc: 'Ch.8, PT (8-5), tr.713', t: 'VSS không phân hủy sinh học', te: 'Nonbiodegradable VSS', eq: 'nbVSS = (1 − bpCOD/pCOD)·VSS (8-5);  cách khác: nbVSS = nbpCOD/VSS_COD (8-7 … 8-9)' },
  'ME:E8-5': { doc: ME, loc: 'Ch.8, PT (8-5), tr.713', t: 'VSS không phân hủy sinh học', te: 'Nonbiodegradable VSS', eq: 'nbVSS = [1 − bpCOD/pCOD]·VSS' },
  'ME:E8-6': { doc: ME, loc: 'Ch.8, PT (8-6), tr.713', t: 'Tỷ lệ COD hạt phân hủy được', te: 'Biodegradable fraction of particulate COD', eq: 'bpCOD/pCOD = [(bCOD/BOD)·(BOD − sBOD)]/(COD − sCOD)' },
  'ME:E8-10': { doc: ME, loc: 'Ch.8, mục 8-2, tr.711; Ví dụ 8-1', t: 'Chất rắn vô cơ trơ', te: 'Inert inorganic solids', eq: 'iTSS = TSS − VSS', d: 'Bản 5th không đánh số phương trình này (PT 8-10 là hàm lượng N trong VSS: f_N = (TKN − sON − NH₄-N)/VSS).', de: 'Not numbered in the 5th ed. (Eq. 8-10 is the N fraction of VSS: f_N = (TKN − sON − NH₄-N)/VSS).' },
  'ME:E8-12': { doc: ME, loc: 'Ch.8, PT (8-12), (8-13), tr.714', t: 'COD không phân hủy sinh học', te: 'Nonbiodegradable COD', eq: 'TCOD = bCOD + nbCOD (8-12);  bCOD ≈ 1,6·BOD (8-13)' },
  'ME:E8-19': { doc: ME, loc: 'Ch.8, PT (8-19), tr.720', t: 'Hệ số sản lượng quan trắc', te: 'Observed yield', eq: 'P_X,VSS = Y_obs·Q·(S₀ − S)  (sách: theo VSS; phần mềm báo Y_obs = P_X,TSS/(Q·BOD_vào), g TSS/g BOD)' },
  'ME:E8-20': { doc: ME, loc: 'Ch.8, PT (8-20), tr.721', t: 'Sinh khối sinh ra P_X,bio', te: 'Biomass production P_X,bio', eq: 'P_X,bio = Q·Y_H·(S₀ − S)/(1 + b_H·SRT) + f_d·b_H·Q·Y_H·(S₀ − S)·SRT/(1 + b_H·SRT) + Q·Y_n·NOx/(1 + b_n·SRT)', v: [['A', 'sinh khối dị dưỡng'], ['B', 'mảnh tế bào'], ['C', 'sinh khối nitrat hóa'], ['D', 'sách cộng thêm Q·nbVSS để ra P_X,VSS; P_X,bio = A + B + C']] },
  'ME:E8-21': { doc: ME, loc: 'Ch.8, PT (8-21), tr.722', t: 'Bùn dư theo TSS', te: 'Excess sludge as TSS', eq: 'P_X,TSS = P_X,bio/0,85 + Q·nbVSS + Q·(TSS₀ − VSS₀)', d: 'Cân bằng khối bùn: P_X,TSS·SRT = V·MLSS (dùng giải SRT của C-Tech, quy tắc R06).', de: 'Solids balance: P_X,TSS·SRT = V·MLSS (used to solve the C-Tech SRT, rule R06).' },
  'ME:E8-23': { doc: ME, loc: 'Ch.8, PT (8-23), tr.723; Ví dụ 8-7 bước 9, tr.812', t: 'Nhu cầu oxy thực tế', te: 'Actual oxygen requirement', eq: 'R₀ = Q·(S₀ − S) − 1,42·P_X,bio + 4,57·Q·NOx (8-23);  trừ tín dụng khử nitrat 2,86·Q·NO₃,khử (Ví dụ 8-7)', v: [['4,57', 'g O₂/g N nitrat hóa'], ['2,86', 'g O₂ tương đương/g NO₃-N khử']] },
  'ME:E8-24': { doc: ME, loc: 'Ch.8, PT (8-24), tr.723', t: 'Nitơ bị oxy hóa thành nitrat', te: 'Nitrogen oxidized to nitrate', eq: 'NOx = TKN − N_e − 0,12·P_X,bio/Q', v: [['0,12', 'hàm lượng N trong sinh khối f_N (g N/g VSS)']], d: 'Giải lặp cùng PT (8-20) vì P_X,bio phụ thuộc NOx.', de: 'Solved iteratively with Eq. (8-20) since P_X,bio depends on NOx.' },
  'ME:E8-49': { doc: ME, loc: 'Ch.8, PT (8-49), tr.773', t: 'Thời gian sục khí cần cho nitrat hóa theo mẻ', te: 'Batch aeration time for nitrification', eq: 'K_NH4·ln(N₀/N_t) + (N₀ − N_t) = X_n·(μmax,AOB/Y_AOB)·[DO/(K_o,AOB + DO)]·t', v: [['N₀, N_t', 'NH₄-N đầu và cuối pha phản ứng'], ['X_n', 'nồng độ vi khuẩn nitrat hóa']], d: 'Ví dụ 8-5 (SBR) dùng phương trình này để kiểm tra thời gian sục khí trong chu kỳ.', de: 'Example 8-5 (SBR) uses this equation to check aeration time within the cycle.' },
  'ME:E8-50': { doc: ME, loc: 'Ch.8, PT (8-50), tr.773', t: 'Phần thể tích khối bùn lắng trong SBR', te: 'Settled sludge volume fraction in SBR', eq: 'F(V_T) = MLSS·SVI/10⁶;  V_F/V_T ≤ 1 − F(V_T) − khoảng nước trong', d: 'Giới hạn phân suất nạp/gạn để bùn không bị cuốn theo nước xả (quy tắc R03).', de: 'Limits the fill/decant fraction so sludge is not drawn out with the decant (rule R03).' },
  'ME:E8-52': { doc: ME, loc: 'Ch.8, PT (8-51), (8-52), tr.803', t: 'Khả năng khử nitrat của vùng thiếu khí', te: 'Denitrification capacity of the anoxic zone', eq: 'NO_r = V_nox·SDNR·MLVSS', v: [['NO_r', 'NO₃-N khử được (g/ngđ)']] },
  'ME:E8-56': { doc: ME, loc: 'Ch.8, PT (8-56), tr.806', t: 'F/M trên sinh khối hoạt tính vùng thiếu khí', te: 'F/M on active biomass in the anoxic zone', eq: 'F/M_b = Q·S₀/(V_nox·X_b)', d: 'Bể mẻ: V_nox·X_b = M_Xb·f_tk (quy tắc F14).', de: 'Batch reactors: V_nox·X_b = M_Xb·f_na (rule F14).' },
  'ME:E8-57': { doc: ME, loc: 'Ch.8, PT (8-57), tr.806; Bảng 8-22', t: 'SDNR theo F/M_b (F/M_b > 0,5)', te: 'SDNR vs F/M_b (F/M_b > 0.5)', eq: 'SDNR_b = b₀ + b₁·ln(F/M_b)  (b₀, b₁: Bảng 8-22)' },
  'ME:E8-58': { doc: ME, loc: 'Ch.8, PT (8-58), tr.806', t: 'SDNR theo F/M_b (F/M_b ≤ 0,5)', te: 'SDNR vs F/M_b (F/M_b ≤ 0.5)', eq: 'SDNR_b = 0,24·F/M_b;  SDNR_T = SDNR₂₀·1,026^(T − 20)' },
  'ME:E8-61': { doc: ME, loc: 'Ch.8, PT (8-61), tr.808', t: 'NO₃-N ra theo tỷ lệ tuần hoàn (MLE)', te: 'Effluent NO₃-N vs recycle ratio (MLE)', eq: 'Q·NOx = N_e·(Q + IR·Q + R·Q)  ⇔  N_e = NOx/(1 + IR + R)' },
  'ME:E8-62': { doc: ME, loc: 'Ch.8, PT (8-62), tr.808', t: 'Tỷ lệ tuần hoàn nội yêu cầu', te: 'Required internal recycle ratio', eq: 'IR = NOx/N_e − 1 − R' },
  'ME:E8-65': { doc: ME, loc: 'Ch.8, PT (8-69), tr.848 (hệ số 2,86/(1 − 1,42Y) cũng nằm trong PT 8-65, tr.835)', t: 'Tỷ lệ COD tiêu thụ cho khử nitrat CR', te: 'COD consumptive ratio for denitrification', eq: 'CR,NO₃ = 1/E = 2,86/(1 − 1,42·Y)  (g COD/g NO₃-N)', d: 'Sách dùng hệ số sản lượng tổng hợp Y của nguồn carbon; phần mềm dùng Y_net = Y_H/(1 + b_H·SRT) cho carbon nội tại và Y ≈ 0,3 cho methanol (4,98 g COD/g N; sách: methanol 4,0 – 5,0, tr.849). Với NO₂-N thay 2,86 bằng 1,71.', de: 'The book uses the synthesis yield Y of the carbon source; the software uses Y_net = Y_H/(1 + b_H·SRT) for internal carbon and Y ≈ 0.3 for methanol (4.98 g COD/g N; book: methanol 4.0 – 5.0, p.849). For NO₂-N replace 2.86 with 1.71.' },
  'ME:E8-69': { doc: ME, loc: 'Ch.8, PT (8-69), tr.848', t: 'Tỷ lệ COD tiêu thụ cho khử nitrat CR', te: 'COD consumptive ratio for denitrification', eq: 'CR,NO₃ = 1/E = 2,86/(1 − 1,42·Y)' },
  'ME:E8-66': { doc: ME, loc: 'Ch.8, PT (8-66) … (8-68), tr.835 – 836; Ví dụ 8-11', t: 'SDNR theo động học nội sinh / chất nền', te: 'SDNR from kinetics', eq: 'SDNR_b = 0,175·A_n/(Y_net·SRT) (8-66);  A_n = 1 − 1,42·Y_H + 1,42·b_H·Y_H·SRT/(1 + b_H·SRT) (8-67)', d: 'Ví dụ 8-11 (Y_H 0,45; b_H,15 0,099; SRT 25 d): A_n = 0,82 g O₂/g bCOD, Y_net = 0,13.', de: 'Example 8-11 (Y_H 0.45; b_H,15 0.099; SRT 25 d): A_n = 0.82 g O₂/g bCOD, Y_net = 0.13.' },
  'ME:E8-67': { doc: ME, loc: 'Ch.8, PT (8-67), tr.836', t: 'Hệ số A_n', te: 'Coefficient A_n', eq: 'A_n = 1 − 1,42·Y_H + 1,42·b_H·Y_H·SRT/(1 + b_H·SRT)' },
  'ME:E8-68': { doc: ME, loc: 'Ch.8, PT (8-68), tr.836', t: 'Hệ số sản lượng thực', te: 'Net yield', eq: 'Y_net = Y_H/(1 + b_H·SRT)' },
  'ME:E8-80': { doc: ME, loc: 'Ch.8, PT (8-80), tr.890', t: 'Tải trọng bề mặt bể lắng thứ cấp', te: 'Secondary clarifier surface overflow rate', eq: 'SOR = Q/A;  A = max(Q/SOR_TB;  Q_đỉnh/SOR_đỉnh;  (Q_đỉnh + Q_R)·X/SLR)', d: 'Giá trị SOR, SLR theo Bảng 8-34.', de: 'SOR and SLR values per Table 8-34.' },
  'ME:E8-82': { doc: ME, loc: 'Ch.8, PT (8-82), tr.891', t: 'Tải trọng chất rắn bể lắng', te: 'Clarifier solids loading rate', eq: 'SLR = (Q + R·Q)·MLSS/A = (1 + R)·SOR·MLSS' },

  /* ---------------- M&E – ví dụ, mục, phụ lục, trang ---------------- */
  'ME:X8-3': { doc: ME, loc: 'Ch.8, Ví dụ 8-3', t: 'Ví dụ thiết kế CMAS khử BOD và nitrat hóa', te: 'Example: CMAS design for BOD removal and nitrification',
    d: 'Ví dụ theo trình tự Bảng 8-15: bước 1 đặc tính nước thải (bCOD = 1,6·BOD với nước thải sinh hoạt, nbsCOD = sCOD − 1,6·sBOD), bước 9 lặp NOx, bước 10 khối bùn, bước 11 thể tích, bước 14 oxy – khí (α 0,5 – 0,65, F 0,9), bước 15 độ kiềm (7,14 g CaCO₃/g N, dư 70 – 80 mg/L), bước 17 BOD ra = sBOD + BOD của TSS ra.',
    de: 'Worked example following Table 8-15: step 1 characterization (bCOD = 1.6·BOD for domestic wastewater, nbsCOD = sCOD − 1.6·sBOD), step 9 NOx iteration, step 10 solids mass, step 11 volume, step 14 oxygen – air (α 0.5 – 0.65, F 0.9), step 15 alkalinity (7.14 g CaCO₃/g N, residual 70 – 80 mg/L), step 17 effluent BOD = sBOD + BOD of effluent TSS.' },
  'ME:X8-5': { doc: ME, loc: 'Ch.8, Ví dụ 8-5', t: 'Ví dụ thiết kế SBR khử BOD và nitrat hóa', te: 'Example: SBR design for BOD removal and nitrification',
    d: 'Thiết kế SBR theo khối bùn: SRT từ cân bằng P_X,TSS·SRT = V·MLSS, b_n trung bình theo thời gian sục khí/không sục khí, thời gian nitrat hóa theo PT (8-49), tỷ lệ gạn theo PT (8-50) với SVI 150; Y_obs ≈ 0,75 g TSS/g BOD.',
    de: 'SBR design by solids mass: SRT from P_X,TSS·SRT = V·MLSS, time-averaged b_n over aerated/non-aerated periods, nitrification time per Eq. (8-49), decant ratio per Eq. (8-50) with SVI 150; Y_obs ≈ 0.75 g TSS/g BOD.' },
  'ME:X8-6': { doc: ME, loc: 'Ch.8, Ví dụ 8-7 bước 9, tr.812', t: 'Ví dụ tín dụng oxy do khử nitrat (MLE)', te: 'Example: oxygen credit from denitrification (MLE)', d: 'Mỗi g NO₃-N bị khử hoàn trả 2,86 g O₂ – trừ vào nhu cầu oxy.', de: 'Each g NO₃-N denitrified returns 2.86 g O₂ – deducted from the oxygen demand.' },
  'ME:X8-11': { doc: ME, loc: 'Ch.8, PT (8-42), (8-43), tr.731', t: 'Tỷ lệ tuần hoàn bùn', te: 'Return sludge ratio', eq: 'R = Q_R/Q = X/(X_R − X) (8-42);  X_R ≈ 10⁶/SVI (8-43)', d: 'Bản 5th: Ví dụ 8-11 là phân suất thiếu khí mương oxy hóa; quan hệ R – X_R ở PT (8-42), (8-43).', de: '5th ed.: Example 8-11 is the oxidation-ditch anoxic fraction; the R – X_R relation is Eqs. (8-42), (8-43).' },
  'ME:E8-42': { doc: ME, loc: 'Ch.8, PT (8-42), tr.731', t: 'Tỷ lệ tuần hoàn bùn', te: 'Return sludge ratio', eq: 'R = Q_R/Q = X/(X_R − X)' },
  'ME:E8-43': { doc: ME, loc: 'Ch.8, PT (8-43), tr.731', t: 'Nồng độ bùn tuần hoàn theo SVI', te: 'RAS concentration from SVI', eq: 'X_R ≈ 10⁶/SVI' },
  'ME:X8-13': { doc: ME, loc: 'Ch.8, Ví dụ 8-13, tr.881 – 882', t: 'P trong sinh khối thường', te: 'P in ordinary biomass', d: 'Sinh khối dị dưỡng thường chứa khoảng 0,015 – 0,02 g P/g VSS; P khử theo đồng hóa = f_P·P_X,VSS/Q (quy tắc F15).', de: 'Ordinary heterotrophic biomass contains about 0.015 – 0.02 g P/g VSS; P removed by assimilation = f_P·P_X,VSS/Q (rule F15).' },
  'ME:X5-11': { doc: ME, loc: 'Ch.5, Ví dụ 5-11', t: 'Ví dụ thiết kế DAF', te: 'Example: DAF design', d: 'Áp suất bão hòa 275 – 500 kPa, A/S 0,005 – 0,06 mL/mg, tải trọng thủy lực 8 – 160 L/m²·phút tùy dạng; diện tích A = (Q + R)/q.', de: 'Saturation pressure 275 – 500 kPa, A/S 0.005 – 0.06 mL/mg, hydraulic loading 8 – 160 L/m²·min depending on type; area A = (Q + R)/q.' },
  'ME:X6-1': { doc: ME, loc: 'Ch.6, Ví dụ 6-1', t: 'Bùn sinh ra từ kết tủa hóa học (CEPT)', te: 'Chemically enhanced primary treatment (CEPT) efficiency', d: 'Ví dụ tính lượng bùn khi châm FeCl₃ vào lắng sơ cấp (TSS khử 60 % không hóa chất → 85 % có FeCl₃). Khoảng hiệu suất CEPT phần mềm dùng (TSS 60 – 90 %, BOD 40 – 70 %, COD 30 – 60 %, TP 70 – 90 %) là giá trị tổng hợp, không trích từ ví dụ này.', de: 'Settling with aluminium/iron salts: TSS 60 – 90 %, BOD 40 – 70 %, COD 30 – 60 %, TP 70 – 90 % removal.' },
  'ME:X13-4': { doc: ME, loc: 'Ch.13, Ví dụ 13-4, tr.1490', t: 'Ví dụ thiết kế bể nén bùn trọng lực', te: 'Example: gravity thickener design', eq: 'A = M/SLR' },
  'ME:A-E': { doc: ME, loc: 'Phụ lục E, Bảng E-1', t: 'Độ hòa tan oxy trong nước theo nhiệt độ (1 atm)', te: 'Oxygen solubility in water vs temperature (1 atm)', d: 'Phần mềm tính theo công thức APHA 4500-O (Benson–Krause), trùng giá trị bảng: C_s = exp(−139,34411 + 1,575701·10⁵/T_K − 6,642308·10⁷/T_K² + 1,2438·10¹⁰/T_K³ − 8,621949·10¹¹/T_K⁴).', de: 'The software uses the APHA 4500-O (Benson–Krause) equation, identical to the table: C_s = exp(−139.34411 + 1.575701·10⁵/T_K − 6.642308·10⁷/T_K² + 1.2438·10¹⁰/T_K³ − 8.621949·10¹¹/T_K⁴).', gen: 'dosat' },
  'ME:A-C': { doc: ME, loc: 'Phụ lục C, Bảng C-1', t: 'Tính chất vật lý của nước – độ nhớt động lực', te: 'Physical properties of water – dynamic viscosity', tb: { h: ['T (°C)', 'μ (10⁻³ N·s/m²)'], r: [['0', '1,781'], ['10', '1,307'], ['15', '1,139'], ['20', '1,002'], ['25', '0,890'], ['30', '0,798'], ['35', '0,719'], ['40', '0,653']] } },
  'ME:A-B': { doc: ME, loc: 'Phụ lục B-4', t: 'Áp suất khí quyển theo cao độ', te: 'Atmospheric pressure vs elevation', d: 'Sách: P_b/P_s = exp[−g·M·(z_b − z_a)/(R·T)]. Phần mềm dùng công thức khí quyển chuẩn ICAO; chênh lệch dưới 1 % đến 1.500 m.', de: 'Book: P_b/P_s = exp[−g·M·(z_b − z_a)/(R·T)]. The software uses the ICAO standard-atmosphere formula; difference below 1 % up to 1,500 m.', eq: 'p_atm = 101,325·(1 − 2,25577·10⁻⁵·z)^5,2559  (kPa);  Ω = p_atm/101,325', gen: 'patm' },
};
/* mục và trang M&E – tóm tắt nội dung phần mềm lấy từ đó */
const MES = {
  '3-4': ['Hệ số không điều hòa lưu lượng', 'Flow peaking factors', 'Q_max,h = k_max·Q_h; k_max lấy theo số liệu đo hoặc TCVN 7957 (Bảng 2).'],
  '3-7': ['Điều hòa lưu lượng và nồng độ', 'Flow and load equalization', 'Khi chưa có đường cong tích lũy, thời gian lưu bể điều hòa sơ bộ 6 – 12 h; tỷ lệ BOD/COD đánh giá khả năng phân hủy sinh học.'],
  '5-5': ['Tiền xử lý: song chắn, lưới tinh, lắng cát', 'Preliminary treatment', 'Hiệu suất khử của tiền xử lý thường nhỏ (TSS 5 – 15 %, BOD ≈ 5 %), dầu mỡ tách một phần ở bể lắng cát thổi khí.'],
  '5-7': ['Lắng bằng tấm nghiêng', 'Inclined-plate settling', 'Vận tốc lắng thiết kế xác định bằng thí nghiệm cột lắng.'],
  '5-11': ['Cấp khí khuếch tán – truyền oxy', 'Diffused aeration – oxygen transfer', 'DO bão hòa ở độ ngập C*∞,20 = C*s,20·[1 + d_e·(D_f/P_s)], d_e 0,25 – 0,45 (0,40); SOTR theo PT (5-70) (tr.420); α tr.424; hiệu suất máy thổi tr.434.'],
  '6-2': ['Keo tụ – polymer', 'Coagulation – polymers', 'Liều polymer anion trợ lắng thường 0,5 – 2 mg/L.'],
  '6-4': ['Khử photpho bằng hóa chất', 'Chemical phosphorus removal', 'Tỷ lệ mol Al/P (hoặc Fe/P) 1,5 – 3,0 tùy mức TP ra mong muốn.'],
  '6-5': ['Điều chỉnh pH', 'pH adjustment', 'Liều kiềm/axit xác định bằng chuẩn độ.'],
  '8-2': ['Đặc tính nước thải cho thiết kế sinh học', 'Wastewater characterization for biological design', 'BOD/COD > 0,5: dễ xử lý sinh học; rbCOD/bCOD quyết định tốc độ khử nitrat.'],
  '8-5': ['Nitrat hóa – độ kiềm', 'Nitrification – alkalinity', 'Nitrat hóa tiêu thụ 7,14 g CaCO₃/g NH₄-N; cần duy trì kiềm dư ≥ 70 – 80 mg/L.'],
  '8-7': ['Khử nitrat – hoàn trả kiềm', 'Denitrification – alkalinity recovery', 'Khử nitrat hoàn trả 3,57 g CaCO₃/g NO₃-N.'],
  '8-9': ['Bể lọc màng MBR', 'Membrane bioreactors', 'Thông lượng trung bình 15 – 25 L/m²·h; lưới tinh ≤ 1 – 2 mm; tuần hoàn bể màng 3 – 5Q; khí sục rửa theo SADm.'],
  '8-10': ['Lắng bùn hoạt tính – SVI', 'Activated-sludge settleability – SVI', 'SVI < 100 mL/g lắng tốt; 100 – 150 trung bình; > 150 lắng kém. Nồng độ bùn tuần hoàn X_R ≈ 10⁶/SVI.'],
  '8-11': ['Bể lắng thứ cấp', 'Secondary clarifiers', 'Tối thiểu 2 bể; tải trọng máng tràn và bố trí máng theo kích thước bể.'],
  '12-2': ['Khử trùng – giá trị CT', 'Disinfection – CT value', 'CT = C_dư·t quyết định mức giảm vi sinh.'],
  '12-4': ['Liều clo', 'Chlorine dose', 'Liều xác định theo đường cong nhu cầu clo; thường 5 – 15 mg/L với nước thải thứ cấp.'],
  '12-6': ['Bể tiếp xúc clo', 'Chlorine contact basin', 'Thời gian tiếp xúc ≥ 30 phút ở lưu lượng đỉnh; tỷ lệ L:W ≥ 20 (dòng chảy nút).'],
  '12-8': ['Khử trùng UV', 'UV disinfection', 'Liều UV theo bioassay và độ truyền qua UVT 254 nm thực đo.'],
  '13-6': ['Nén – khử nước bùn', 'Sludge thickening and dewatering', 'Hiệu suất thu hồi chất rắn 90 – 98 %; tải trọng thiết bị xác định bằng thử ép.'],
  '14-7': ['Bể chứa – trộn bùn, nước tách bùn', 'Sludge storage – return streams', 'Thời gian lưu 12 – 24 h; nước tách bùn và nước rửa hồi về đầu trạm làm tăng tải.'],
};
for (const [k, v] of Object.entries(MES)) DATA.CITES['ME:S' + k] = { doc: ME, loc: 'Mục ' + k, t: v[0], te: v[1], d: v[2] };
const MEP = {
  '406': ['Tuyển nổi DAF – lưu ý thiết kế', 'Dissolved-air flotation – design considerations', 'Tr.403 – 408: tỷ lệ khí/chất rắn A/S, áp suất bão hòa, tải trọng thủy lực và chất rắn xác định bằng thí nghiệm; ví dụ thiết kế VD 5-11.'],
  '420': ['Truyền oxy hiện trường – PT (5-70)', 'Field oxygen transfer – Eq. (5-70)', 'β 0,95 – 0,98; F 0,65 – 0,9 (bề mặt F = 1); d_e 0,25 – 0,45 (0,40); τ = C*s,T/C*s,20; Ω = P_b/P_s.'],
  '424': ['Hệ số α', 'Alpha factor', 'α thay đổi khoảng 0,3 – 1,2 tùy thiết bị và đặc tính nước; điển hình sục khí khuếch tán 0,4 – 0,8, cơ khí 0,6 – 1,2. Tr.885: α đĩa bọt mịn tăng theo SRT.'],
  '885': ['Hệ số α theo SRT', 'Alpha vs SRT', 'Khảo sát 30 trạm bùn hoạt tính bọt mịn: α trung bình tăng từ khoảng 0,53 (SRT 10 ngày) lên 0,60 (20 ngày) và 0,65 (30 ngày).'],
  '434': ['Hiệu suất máy thổi khí', 'Blower efficiency', 'Hiệu suất máy thổi e khoảng 0,70 – 0,90 (PT 5-77).'],
  '738': ['Selector sinh học', 'Biological selectors', 'Selector ngăn tiếp xúc trước bể phản ứng, thời gian lưu khoảng 30 – 60 phút, giúp hạn chế vi khuẩn dạng sợi.'],
  '773': ['Thiết kế SBR – pha sục khí, gạn', 'SBR design – aeration, decant', 'Pha sục khí 2 – 4 h; lớp nước trong tối thiểu dưới decanter 0,2 – 0,5 m; SRT hiếu khí = SRT × phân suất sục khí.'],
  '774': ['Tỷ lệ gạn SBR (Hình 8-21)', 'SBR decant fraction (Fig. 8-21)', 'Phân suất nạp/gạn thường ≤ 0,25 – 0,3 và giảm khi MLSS, SVI tăng (SVI 150: MLSS 3.000 → 0,34; 4.000 → 0,25; 5.000 → 0,16); kiểm tra theo PT (8-50).'],
  '793': ['Mương oxy hóa – tuần hoàn (Bảng 8-19)', 'Oxidation ditch – circulation (Table 8-19)', 'Lưu lượng tuần hoàn trong mương thường 20 – 30 lần lưu lượng vào nên gần với điều kiện khuấy trộn hoàn toàn; vận tốc 0,25 – 0,35 m/s.'],
  '803': ['SDNR – khoảng giá trị', 'SDNR – range', 'SDNR ở 20 °C khoảng 0,04 – 0,42 g NO₃-N/g MLVSS·d tùy nguồn carbon và F/M_b.'],
  '808': ['SDNR – hiệu chỉnh nhiệt', 'SDNR – temperature correction', 'SDNR_T = SDNR₂₀·1,026^(T−20).'],
  '809': ['Mục tiêu NO₃-N ra & tuần hoàn nội', 'Target effluent NO₃-N & internal recycle', 'NO₃-N ra 5 – 7 mg/L để đạt TN ≤ 10 mg/L; tuần hoàn nội tối đa 3 – 4Q.'],
  '887': ['Bể sục khí – chiều sâu, chiều cao an toàn', 'Aeration basins – depth, freeboard', 'Sục khí khuếch tán: chiều sâu nước 4,5 – 7,5 m; chiều cao an toàn 0,3 – 0,6 m.'],
  '1331': ['Liều clo – Bảng 12-14', 'Chlorine dose – Table 12-14', 'Liều clo kết hợp để đạt coliform ra (tiếp xúc 30 phút): nước sau bùn hoạt tính 5,5 – 7,5 mg/L (1.000 MPN/100 mL), 10 – 13 (200), 13 – 17 (23); duy trì clo dư cuối bể thường 0,5 – 1 mg/L.'],
  '358': ['Lắng tấm nghiêng', 'Inclined-plate settling', 'Tải trọng theo diện tích chiếu của tấm; khoảng cách tấm 50 – 100 mm, góc 45 – 60°.'],
};
for (const [k, v] of Object.entries(MEP)) DATA.CITES['ME:p' + k] = { doc: ME, loc: 'M&E 5th, trang ' + k, t: v[0], te: v[1], d: v[2] };

/* chương M&E và tài liệu chung (khi chỉ ghi "M&E", "M&E Ch.x") */
const MEC = {
  '3': ['Lưu lượng và tải lượng nước thải', 'Wastewater flowrates and constituent loadings', 'Đặc tính nước thải sinh hoạt (Bảng 3-18), hệ số không điều hòa, điều hòa lưu lượng – nồng độ.'],
  '5': ['Các quá trình xử lý vật lý', 'Physical unit processes', 'Song chắn, lưới tinh, lắng cát, khuấy trộn – tạo bông, lắng, lắng tấm nghiêng, tuyển nổi DAF, truyền khí – cấp khí, máy thổi khí.'],
  '6': ['Các quá trình xử lý hóa học', 'Chemical unit processes', 'Keo tụ – tạo bông, khử P hóa học (tỷ lệ Al/P, Fe/P), điều chỉnh pH, bùn hóa học.'],
  '7': ['Cơ sở xử lý sinh học', 'Fundamentals of biological treatment', 'Động học Monod, sinh khối, hệ số sản lượng, nitrat hóa – khử nitrat; 1,42 g COD/g VSS; tỷ lệ dinh dưỡng BOD:N:P ≈ 100:5:1.'],
  '8': ['Bùn hoạt tính lơ lửng', 'Suspended growth biological processes', 'Thiết kế CMAS, MLE, A²O, SBR, mương oxy hóa, MBR; khử N, P sinh học; bể lắng thứ cấp; vi sinh hoạt động tốt ở pH 6 – 9.'],
  '9': ['Màng bám dính và quá trình lai', 'Attached growth and hybrid processes', 'MBBR, IFAS: tải trọng bề mặt giá thể (SALR), tốc độ nitrat hóa/khử nitrat bề mặt, sinh khối tương đương.'],
  '11': ['Xử lý bậc cao', 'Advanced treatment', 'Lọc đĩa vải, lọc cát nhanh, xử lý chất khó phân hủy.'],
  '12': ['Khử trùng', 'Disinfection', 'Clo (CT, bể tiếp xúc), UV (liều, UVT).'],
};
for (const [k, v] of Object.entries(MEC)) DATA.CITES['ME:C' + k] = { doc: ME, loc: 'Chương ' + k, t: v[0], te: v[1], d: v[2] };
DATA.CITES['ME:book'] = { doc: ME, loc: 'Metcalf & Eddy 5th Ed. (2014)', t: 'Tài liệu tham chiếu chính (mọi giá trị M&E theo bản 5th)', te: 'Main reference', d: 'Giáo trình thiết kế xử lý nước thải dùng làm cơ sở phương pháp tính của phần mềm (các chương 3, 5 – 9, 11 – 14).', de: 'Wastewater engineering textbook used as the basis of the calculation methods (chapters 3, 5 – 9, 11 – 14).' };
DATA.CITES['ME4:book'] = { doc: 'ME4', loc: 'Metcalf & Eddy 4th Ed. (đã thay)', t: 'Giá trị bản 4 đã được thay bằng bản 5th', te: '4th-edition values replaced by the 5th edition', d: 'Các công thức nhà cung cấp trích theo bản 4 (Sanitaire: μnm 0,75, Kn 0,74, kdn 0,08; SFC: DO bão hòa trung bình PT 5-55) đã được thay bằng M&E 5th: Bảng 8-14 (μmax,AOB 0,90, K_NH4 0,50, b_AOB 0,17, K_o 0,50) và PT (5-70).', de: 'Formulas the suppliers cite from the 4th edition (Sanitaire μnm 0.75, Kn 0.74, kdn 0.08; SFC mean saturation DO Eq. 5-55) are replaced by M&E 5th Table 8-14 (μmax,AOB 0.90, K_NH4 0.50, b_AOB 0.17, K_o 0.50) and Eq. (5-70).' };

/* ---------------- Tài liệu nhà cung cấp & quy chuẩn ---------------- */
Object.assign(DATA.CITES, {
  'ICEAS202': { doc: 'ICEAS', loc: 'ICEAS 202 Detailed design tr.1 – 11; Air design tr.1 – 4', t: 'Trình tự tính bể ICEAS của Sanitaire', te: 'Sanitaire ICEAS basin calculation procedure',
    d: 'Phần mềm tái lập đúng trình tự của bản tính Sanitaire; bảng dưới là các bước và kết quả ví dụ ICEAS 202 (432 m³/ngđ, 2 bể) để đối chiếu.',
    de: 'The software reproduces the Sanitaire calculation sequence; the table lists the steps and the ICEAS 202 example results (432 m³/d, 2 basins) for comparison.',
    tb: { h: ['Trang', 'Bước / công thức', 'Ví dụ ICEAS 202'], r: [
      ['2', 'BOD_L = Q·BOD/1000; BMOB = BOD_L/(F/M); V_bio = BMOB·SVI', '65 kg/ngđ; 959 kg; 144 m³'],
      ['3', 'MVAB = max(PDWF·(NCT − NDT); PWWF·(SCT − SDT))/24; PDR = MVAB/NDT + PDWF/1440', '44 m³; 0,94 m³/phút'],
      ['4', 'DL = PDR/1,86 hoặc PWR/2,32; BWV = MVAB + V_bio + V_c; BA = BWV/(TWL − BZ); SD = V_bio/BA', '0,9 m; 189 m³; 46 m²; 3,12 m'],
      ['5', 'DD = MVAB/BA; BWL = SD + BZ + V_d; HRT = BA·MAFD/Q', '0,97 m; 4,03 m; 1,02 ngày'],
      ['6', 'MLSS_BWL = BMOB/(BWL·BA); ΔM = [Y(S₀ − S)/(1 + b·θ^(T−20)·SRT) + Zio + Zno]·Q (WEF MOP/8 PT 11.7)', '5.181 mg/L; 45 kg/ngđ'],
      ['7', 'V_ws = (ΔM + C_sludge)/(SF_ws·1000); MCRT = BMOB/[ΔM + (Q − V_ws)·TESS/1000]', '6 m³/ngđ; 20,1 ngày'],
      ['8', 'μn = μnm(T)·N/(N + Kn)·DO/(DO + Ko) − kdn(T) (Sanitaire dùng hệ số M&E 4th; phần mềm thay bằng μ_AOB theo M&E 5th Bảng 8-14, PT 7-94); SRT_hk = SF/μn; SRT_yc = SRT_hk·24/TA', '0,176/ngày; 11,4; 34,1 ngày (hệ số bản 4)'],
      ['9', 'N_Avail = TKN − EDON − NH₃ − N_Assim − N_Part; năng lực = μDN·VSS/TSS·BMOB·ART', '57,8 mg/L; 11 < 12 kg/ngđ'],
      ['10', 'TP_b = TP − Y_obs·(BOD_in − BOD_out)·TP_ps; liều phèn CD = CDt·(TP_b − TP_e)·(1 + SF)', '3,89 mg/L; 50 mg/L'],
      ['Khí 1 – 2', 'AOR = 1,2·Q·BOD + 4,6·TKN_ox − 2,9·NO₃,khử; AOR/SOR = α·θ^(T−20)·(β·C*·P/P_std·C_T/C₂₀ − DO)/C*, C* = C₂₀·(1 + d_e·D_f/10,33) (Sanitaire d_e 0,385; phần mềm d_e chung 0,40 – M&E 5th PT 5-70)', '105; 0,357; SOR 294 kg/ngđ'],
      ['Khí 3 – 4', 'SOTR = SOR/TA; khí CN = SOTR·10⁴/(ρ·SOTE·O_pw); khí trộn = MI·BA; p = MAD·9,772 + HL', '37 kg/h; 463 m³/h; 105 m³/h; 53,8 kPa']] } },
  'ICEAS:cyc': { doc: 'ICEAS', loc: 'Sanitaire ICEAS Cycle Charts (NIT, NDN(P))', t: 'Chu trình chuẩn ICEAS', te: 'Standard ICEAS cycles',
    tb: { h: ['Chu trình', 'Air-On', 'Air-Off (khuấy)', 'Lắng', 'Chắt', 'Tổng'], r: [['NIT – thường', '120', '0', '60', '60', '4,0 h'], ['NIT – bão', '90', '0', '45', '45', '3,0 h'], ['NDN(P) – thường', '96', '72', '60', '60', '4,8 h'], ['NDN(P) – bão', '72', '54', '45', '45', '3,6 h']] },
    d: 'NIT: sục khí liên tục trong pha phản ứng (3 × 40 phút), chỉ nitrat hóa. NDN(P): xen kẽ Air-On 24 phút / Air-Off có khuấy 24 phút để khử nitrat (và hỗ trợ khử P sinh học).',
    de: 'NIT: continuous aeration during react (3 × 40 min), nitrification only. NDN(P): alternating Air-On 24 min / mixed Air-Off 24 min for denitrification (and biological P support).' },
  'SFC': { doc: 'SFC', loc: 'BEP Vellore D-631, mục 1 – 14', t: 'Trình tự tính C-Tech của SFC (Basic Engineering Package)', te: 'SFC C-Tech calculation sequence (Basic Engineering Package)',
    d: 'Phần mềm tái lập trình tự BEP; bảng dưới là các bước và kết quả BEP Vellore 50 MLD để đối chiếu.',
    de: 'The software reproduces the BEP sequence; the table lists the steps and the Vellore 50 MLD BEP results for comparison.',
    tb: { h: ['Mục BEP', 'Bước / công thức', 'Vellore 50 MLD'], r: [
      ['1 – 3', 'Q = 50 MLD, PF 2,25; BOD 287,5, TKN 45, TP 7,5 mg/L; ra BOD 10, TN 10', 'Q_max 4.687,5 m³/h'],
      ['5', 'Chu kỳ 1,5 / 0,75 / 0,75 h (cấp – sục; lắng; gạn); n_cấp = N·t_FA/T_C', '4 bể, 2 bể cấp đồng thời'],
      ['6', 'V = Q·BOD/(MLVSS·F/M); A = V_cấp/ΔH; TWL = V₁/A', 'V 33.858 m³; 45 × 33 m; TWL 5,7 m'],
      ['7', 'RAS = 25 % Q_b; selector lưu 55 phút (Q_b + RAS)', 'RAS 265 m³/h; selector 1.282,5 m³'],
      ['8', 'Bùn X = Y·ΔBOD (Y 0,59); SAS 0,8 %; SRT = V·MLSS/X', 'X 8.186 kg/ngđ; SAS 185 m³/h; SRT 18,7 ngày'],
      ['9', 'AOTR = 1,2·ΔBOD + 4,57·N_nit − 2,86·75 %·NO₃ khử', '≈ 20.650 kg O₂/ngđ'],
      ['10 – 13', 'SOTR: BEP theo M&E 4th PT (5-55); phần mềm thay bằng M&E 5th PT (5-70); khí = SOTR/(SOTE·0,2318·1,293); máy thổi làm tròn 50 Nm³/h', '4 máy chạy'],
      ['14', 'Decanter: Q_gạn = V_cấp/t_D', '']] } },
  'CPHEEO': { doc: 'CPHEEO', loc: 'Part A, Ch.5 (SBR – tr. 5-198)', t: 'Khoảng thiết kế SBR theo CPHEEO', te: 'CPHEEO SBR design ranges',
    tb: { h: ['Thông số', 'Khoảng'], r: [['MLSS (mg/L)', '3.500 – 5.000'], ['F/M (kgBOD/kgMLVSS·d)', '0,05 – 0,3'], ['Chu kỳ (h)', '2,5 – 6'], ['Hệ số sinh bùn Y (kg/kg BOD)', '0,6 – 1,2'], ['SRT (ngày)', '≥ 10']] } },
  'WEF': { doc: 'WEF', loc: 'MOP 8, 4th Ed., tr. 11-11, PT 11.7 (Lawrence – McCarty)', t: 'Bùn sinh ra theo Lawrence – McCarty', te: 'Sludge production (Lawrence – McCarty)', eq: 'ΔM = [Y·(BOD_in − BOD_out)/(1 + b·θ^(T−20)·SRT) + Zio + Zno]·Q/1000', v: [['Y', 'hệ số sản lượng VSS/BOD khử (0,6)'], ['b, θ', '0,07/ngày; 1,04'], ['Zio, Zno', 'SS vô cơ và SS bay hơi trơ vào']] },
  'STOWA': { doc: 'STOWA', loc: 'STOWA 2018-45', t: 'Thiết kế đối chứng Organica FCR / Biopolus MNR', te: 'Reference designs Organica FCR / Biopolus MNR', d: 'Thiết kế đối chứng cho trạm 2.800 và 8.000 m³/ngđ: tỷ lệ thể tích module, MLSS lơ lửng, tải trọng BOD trên module và chiều sâu bể dùng để hiệu chỉnh mặc định nhóm org_/bp_.', de: 'Reference designs for 2,800 and 8,000 m³/d plants: module volume fraction, suspended MLSS, BOD loading on modules and tank depth used to calibrate the org_/bp_ defaults.' },
  'ORG': { doc: 'ORG', loc: 'Organica Technical Description (Cam Ranh 2.200 m³/ngđ; Cần Thơ 500 m³/ngđ)', t: 'Thông số Organica FCR', te: 'Organica FCR parameters', d: 'Sinh khối bám 8 – 15 kg/m³, chiều sâu 5 m, 6 – 8 ngăn nối tiếp; module biofiber 1,6 × 0,57 × 4,2 m.', de: 'Attached biomass 8 – 15 kg/m³, depth 5 m, 6 – 8 zones in series; biofiber module 1.6 × 0.57 × 4.2 m.' },
  'BIOP': { doc: 'BIOP', loc: 'Biopolus MNR Technology Description; báo giá GETECH 2019', t: 'Thông số Biopolus MNR', te: 'Biopolus MNR parameters', d: 'Module ARP 700 × 700 × 4.200 mm, mật độ sinh khối 8 – 18 kg/m³, tỷ lệ thể tích module/ngăn ≈ 0,52.', de: 'ARP module 700 × 700 × 4,200 mm, biomass density 8 – 18 kg/m³, module/zone volume fraction ≈ 0.52.' },
  'TCVN7957': { doc: 'TCVN', loc: 'TCVN 7957:2008, Bảng 2', t: 'Hệ số không điều hòa chung của nước thải sinh hoạt', te: 'Overall peaking factors for domestic wastewater',
    d: 'Nội suy tuyến tính theo lưu lượng trung bình q (L/s); q ≤ 5 L/s lấy k_max = 2,5, k_min = 0,38.', de: 'Linear interpolation by average flow q (L/s); for q ≤ 5 L/s use k_max = 2.5, k_min = 0.38.',
    tb: { h: ['q (L/s)', '5', '10', '20', '50', '100', '300', '500', '1.000', '≥ 5.000'], r: [['k_max', '2,5', '2,1', '1,9', '1,7', '1,6', '1,55', '1,5', '1,47', '1,44'], ['k_min', '0,38', '0,45', '0,5', '0,55', '0,59', '0,62', '0,66', '0,69', '0,71']] } },
  'TCVN7957:2023': { doc: 'TCVN', loc: 'TCVN 7957:2023 – mục 8 và các công trình xử lý', t: 'Yêu cầu thiết kế thoát nước', te: 'Drainage design requirements', d: 'Vận tốc ống tự chảy 0,7 – 4 m/s (chống lắng), độ đầy, chiều sâu đặt ống và yêu cầu chung cho công trình xử lý; phần mềm dùng để giới hạn vận tốc tuyến ống.', de: 'Gravity pipe velocities 0.7 – 4 m/s (self-cleansing), filling ratio, pipe depth and general requirements for treatment works; used to limit pipe velocities.' },
  'QCVN14_2025': { doc: 'QCVN', loc: 'QCVN 14:2025/BTNMT, Bảng 1', t: 'Giới hạn xả nước thải đô thị, khu dân cư tập trung', te: 'Discharge limits for urban / residential wastewater', gen: 'std:qcvn14_2025' },
  'QCVN14_2025b': { doc: 'QCVN', loc: 'QCVN 14:2025/BTNMT, Bảng 2', t: 'Giới hạn xả nước thải sinh hoạt của dự án, cơ sở', te: 'Discharge limits for domestic wastewater of projects', gen: 'std:qcvn14_2025b' },
  'QCVN40_2025': { doc: 'QCVN', loc: 'QCVN 40:2025/BTNMT, Bảng 1 & 2', t: 'Giới hạn xả nước thải công nghiệp', te: 'Industrial wastewater discharge limits', gen: 'std:qcvn40_2025' },
  'HW': { doc: 'ME', loc: 'M&E Ch.5; công thức Hazen – Williams (SI)', t: 'Tổn thất áp đường ống', te: 'Pipe headloss', eq: 'h_f = 10,67·L·Q^1,852/(C^1,852·D^4,87);  h_m = Σξ·v²/(2g)', v: [['C', 'HDPE 140 – 150; thép mới 120 – 130; gang cũ 100'], ['L, D', 'chiều dài, đường kính trong (m)']] },
  'APHA': { doc: 'APHA', loc: 'Standard Methods 4500-O; Benson & Krause (1984)', t: 'Độ hòa tan oxy theo nhiệt độ', te: 'Oxygen solubility vs temperature', d: 'C_s = exp(−139,34411 + 1,575701·10⁵/T_K − 6,642308·10⁷/T_K² + 1,2438·10¹⁰/T_K³ − 8,621949·10¹¹/T_K⁴), T_K = T + 273,15; ở 1 atm, nước ngọt.', de: 'C_s = exp(−139.34411 + 1.575701·10⁵/T_K − 6.642308·10⁷/T_K² + 1.2438·10¹⁰/T_K³ − 8.621949·10¹¹/T_K⁴), T_K = T + 273.15; 1 atm, fresh water.', gen: 'dosat' },
  'CAT': { doc: '', loc: 'Catalogue / dữ liệu nhà sản xuất', t: 'Số liệu nhà sản xuất', te: 'Manufacturer data', d: 'Giá trị lấy theo catalogue thiết bị (đĩa khí, bơm, máy thổi, giá thể, màng…). Cần thay bằng số liệu của thiết bị được chọn khi lập thiết kế kỹ thuật.', de: 'Values from equipment catalogues (diffusers, pumps, blowers, media, membranes…). Replace with data of the selected equipment at detailed design.' },
});

/* ---------------- nhận dạng mã trích dẫn trong chuỗi ---------------- */
DATA.citeFind = s => {
  s = String(s || ''); const out = [];
  const add = (a, b, key) => { if (!DATA.CITES[key]) return; if (out.some(o => a < o.b && b > o.a)) return; out.push({ a, b, key }); };
  // nhiều mã trong một cụm ("Bảng 5-9, 6-24", "tr.406 – 408") → mỗi số một liên kết riêng
  const run = (re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(s))) {
    const ks = [].concat(fn(m) || []);
    if (ks.length < 2) { ks.forEach(x => add(m.index, m.index + m[0].length, x)); continue; }
    let pos = 0;
    ks.forEach((x, i) => { const num = x.replace(/^ME:(?:[A-Z]|p)/, ''), j = m[0].indexOf(num, pos); if (j < 0) return;
      add(i === 0 ? m.index : m.index + j, i === ks.length - 1 ? m.index + m[0].length : m.index + j + num.length, x); pos = j + num.length; });
  } };
  run(/QCVN\s*14:2025[^;,)]*?(?:Bảng 2|dự án, cơ sở)/g, () => 'QCVN14_2025b');
  run(/QCVN\s*14:2025/g, () => 'QCVN14_2025');
  run(/QCVN\s*40:2025/g, () => 'QCVN40_2025');
  run(/TCVN\s*7957:2008(?:\s*Bảng\s*2)?/g, () => 'TCVN7957');
  run(/TCVN\s*7957(?::2023)?/g, () => 'TCVN7957:2023');
  run(/WEF MOP\/8(?:\s*Eq\.\s*11\.7)?/g, () => 'WEF');
  run(/(?:M&E(?:\s*5th)?\s*)?(?:Bảng|Table)\s*(\d+-\d+)((?:\s*(?:,|\/)\s*\d+-\d+)*)/g, m => [m[1], ...[...m[2].matchAll(/\d+-\d+/g)].map(x => x[0])].map(x => 'ME:T' + (x === '5-20' ? '5-19' : x)));
  run(/(?:M&E\s*)?Hình\s*(\d+-\d+)/g, m => 'ME:F' + m[1]);
  run(/(?:M&E\s*)?(?:PT|Eq\.?)\s*\(?(\d+-\d+[a-z]?)\)?(?:\s*(?:,|…|÷)\s*\(?\d+-\d+[a-z]?\)?)*/g, m => {
    const ks = [...m[0].matchAll(/(\d+)-(\d+)([a-z]?)/g)].map(x => [x[1], +x[2], x[3]]);
    const res = [];
    for (let i = 0; i < ks.length; i++) {
      res.push(`ME:E${ks[i][0]}-${ks[i][1]}${ks[i][2]}`);
      if (i + 1 < ks.length && /…|÷/.test(m[0]) && ks[i + 1][0] === ks[i][0]) for (let j = ks[i][1] + 1; j < ks[i + 1][1]; j++) res.push(`ME:E${ks[i][0]}-${j}`);
    }
    return res.map(k => (DATA.CITES[k] ? k : k.replace(/[a-z]$/, ''))).filter(k => DATA.CITES[k]);
  });
  run(/\((\d{1,2}-\d{1,3}[a-z]?)\)/g, m => 'ME:E' + m[1]);
  run(/(?:M&E\s*)?(?:VD|Ex\.|Ví dụ)\s*(\d+-\d+)/g, m => 'ME:X' + m[1]);
  run(/(?:M&E\s*)?mục\s*(\d+-\d+)/g, m => 'ME:S' + m[1]);
  run(/(?:Phụ lục|App\.)\s*([A-E])(?:-\d+)?/g, m => 'ME:A-' + m[1]);
  run(/CPHEEO(?:\s*tr\.\s*\d+-\d+)?/g, () => 'CPHEEO');
  run(/(?:M&E(?:\s*5th)?\s*)?tr\.\s*(\d{3,4})((?:\s*(?:,|–)\s*\d{3,4})*)/g, m => [m[1], ...[...m[2].matchAll(/\d{3,4}/g)].map(x => x[0])].map(x => 'ME:p' + x));
  run(/Sanitaire(?: ICEAS)? Cycle Charts?/g, () => 'ICEAS:cyc');
  run(/ICEAS 202|Sanitaire/g, () => 'ICEAS202');
  run(/BEP SFC|SFC\b/g, () => 'SFC');
  run(/STOWA(?: 2018-45)?/g, () => 'STOWA');
  run(/Organica(?: TD)?/g, () => 'ORG');
  run(/Biopolus|GETECH/g, () => 'BIOP');
  run(/Hazen-Williams/g, () => 'HW');
  run(/APHA(?: 4500-O)?/g, () => 'APHA');
  run(/Catalogue|NSX\b/g, () => 'CAT');
  run(/M&E(?:\s*5th)?\s*Ch\.\s*(\d+)/g, m => 'ME:C' + m[1]);
  run(/M&E 4th/g, () => 'ME4:book');
  run(/M&E(?: 5th)?/g, () => 'ME:book');
  return out.sort((x, y) => x.a - y.a);
};
/* HTML chi tiết của một trích dẫn (dùng cho cửa sổ và chương phụ lục) */
DATA.citeHTML = (key, esc, S) => {
  const c = DATA.CITES[key]; if (!c) return '';
  const tbl = (h, r) => `<table class="calc cite-t"><thead><tr>${h.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${r.map(row => `<tr>${row.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  let h = `<div class="cite-src"><b>${esc(c.loc)}</b>${c.doc && DATA.CITE_DOCS[c.doc] ? ' — ' + esc(DATA.CITE_DOCS[c.doc]) : ''}</div>`;
  if (c.eq) h += `<div class="cite-eq">${esc(c.eq)}</div>`;
  if (c.v) h += `<ul class="cite-v">${c.v.map(x => `<li><b>${esc(x[0])}</b>: ${esc(x[1])}</li>`).join('')}</ul>`;
  if (c.d) h += `<p>${esc(c.d)}</p>`;
  if (c.tb) h += tbl(c.tb.h, c.tb.r);
  if (c.gen === 'dosat') { const f = t => { const k = t + 273.15; return Math.exp(-139.34411 + 1.575701e5 / k - 6.642308e7 / k ** 2 + 1.2438e10 / k ** 3 - 8.621949e11 / k ** 4); }; h += tbl(['T (°C)', ...[0, 5, 10, 15, 20, 25, 30, 35, 40].map(String)], [['C_s (mg/L)', ...[0, 5, 10, 15, 20, 25, 30, 35, 40].map(t => fx(f(t), 2))]]); }
  if (c.gen === 'patm') h += tbl(['z (m)', '0', '250', '500', '1.000', '1.500', '2.000'], [['p_atm (kPa)', ...[0, 250, 500, 1000, 1500, 2000].map(z => fx(101.325 * Math.pow(1 - 2.25577e-5 * z, 5.2559), 1))]]);
  if (c.gen && c.gen.startsWith('std:')) {
    const st = DATA.STANDARDS[c.gen.slice(4)];
    if (st) {
      const nm = k => (DATA.QPARAMS.find(q => q[0] === k) || [k, k])[1];
      const cell = a => Array.isArray(a[0]) ? a.map(x => x.join(' / ')).join(' | ') : a.join(' / ');
      const rows = Object.entries(st.t).map(([k, a]) => [nm(k), cell(a)]);
      for (const [g, a] of Object.entries(st.TP)) rows.push([nm('TP') + (g === 'ho' ? ' – hồ' : g === 'songTS' ? ' – sông (thủy sản…)' : ' – sông'), cell(a)]);
      h += `<p class="small">Giá trị Cột A / B / C${st.tiers.length ? '; các bậc lưu lượng xả cách nhau bằng "|": ' + st.tierNames.join(' | ') : ''}. ${esc(st.note)}</p>` + tbl(['Thông số', 'Giá trị (mg/L; coliform MPN/100 mL)'], rows);
    }
  }
  return h;
};
/* các dòng tính trong kết quả R có trích dẫn key */
DATA.citeRefs = (R, key) => {
  const out = [];
  R.units.forEach(u => u.secs.forEach((s, si) => s.rows.forEach((r, ri) => {
    const txt = r.kind === 'note' ? r.val : (r.f || '') + ' ¦ ' + (r.src || '');
    if (DATA.citeFind(txt).some(x => x.key === key)) out.push({ u, si, ri, r });
  })));
  return out;
};
})();
