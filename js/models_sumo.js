'use strict';
/* ==========================================================================
   SimXLNT – Thư viện mô hình bổ sung, đối chiếu thư viện mô hình SUMO24 (Dynamita).
   TỰ CÀI ĐẶT: chỉ tham khảo chức năng (danh sách quá trình, cơ chế chuyển mạch) và giá trị
   tham số mặc định được công bố trong thư viện SUMO24; phương trình tốc độ viết lại theo
   dạng ASM (Monod / chuyển mạch ức chế), KHÔNG sao chép mã nguồn hay ma trận của Dynamita.
   Các mô hình dùng tên biến của ASM2d (fam 'ASM2d') để tương thích dòng vào, giao diện ADM1,
   hóa chất kết tủa P, giao diện người dùng và các công cụ chẩn đoán.

   ASM2dS  – "kiểu Sumo1": ASM2d + sản phẩm phân hủy nội sinh XE (fE), phân hủy sinh khối giảm
             khi thiếu/kỵ khí (ηb), sản lượng riêng theo cơ chất/điều kiện, lên men có sinh trưởng,
             PAO: duy trì kỵ khí trên PP, tham số động học mặc định Sumo1.
   ASM2dS2 – "kiểu Sumo2": ASM2dS + nitrat hóa 2 bước (AOB/NOB, NO₂), khử nitrat 2 bước, anammox.
   ASM3P   – ASM3 + Bio-P EAWAG (Rieger et al. 2001), mô hình "bảo tàng" của SUMO.
   ========================================================================== */
(function () {
  const NPQ = [['SNH4', 'N'], ['SPO4', 'P'], ['SALK', 'Q']];
  const NOD = { SNO3: 1, SN2: -1 };        // NO₃ → N₂ (1 bước)
  const NO32 = { SNO3: 1, SNO2: -1 };      // NO₃ → NO₂
  const NO2D = { SNO2: 1, SN2: -1 };       // NO₂ → N₂

  /* ------------------------------------------------------------------------
     Họ "kiểu Sumo" (ASM2dS / ASM2dS2)
     ------------------------------------------------------------------------ */
  function defineSumoType(two) {
    const comps = [
      { id: 'SO2', name: 'Oxy hòa tan', u: 'g O₂/m³' },
      { id: 'SF', name: 'Cơ chất dễ phân hủy không phải VFA (SB)', u: 'g COD/m³' },
      { id: 'SA', name: 'Axit béo bay hơi (VFA)', u: 'g COD/m³' },
      { id: 'SI', name: 'COD hòa tan không phân hủy (SU)', u: 'g COD/m³' },
      { id: 'SNH4', name: 'Amoni', u: 'g N/m³' },
      { id: 'SN2', name: 'Khí N₂ hòa tan', u: 'g N/m³' },
      { id: 'SNO3', name: two ? 'Nitrat' : 'Nitrat + nitrit (NOx)', u: 'g N/m³' }
    ].concat(two ? [{ id: 'SNO2', name: 'Nitrit', u: 'g N/m³' }] : []).concat([
      { id: 'SPO4', name: 'Phosphat', u: 'g P/m³' },
      { id: 'SALK', name: 'Độ kiềm', u: 'mol/m³' },
      { id: 'STIC', name: 'Carbon vô cơ tổng (TIC)', u: 'mol C/m³' },
      { id: 'XI', name: 'COD hạt không phân hủy (XU, gồm keo CU)', u: 'g COD/m³', part: 1 },
      { id: 'XS', name: 'Cơ chất chậm phân hủy (XB, gồm keo CB)', u: 'g COD/m³', part: 1 },
      { id: 'XSE', name: 'Cơ chất chậm phân hủy từ phân hủy sinh khối (XB,e)', u: 'g COD/m³', part: 1 },
      { id: 'XE', name: 'Sản phẩm phân hủy nội sinh XE', u: 'g COD/m³', part: 1 },
      { id: 'XH', name: 'Dị dưỡng thông thường (OHO)', u: 'g COD/m³', part: 1 },
      { id: 'XPAO', name: 'Sinh vật tích trữ C/P (PAO – CASTO)', u: 'g COD/m³', part: 1 },
      { id: 'XPP', name: 'Poly-phosphat', u: 'g P/m³', part: 1 },
      { id: 'XPHA', name: 'PHA nội bào', u: 'g COD/m³', part: 1 },
      { id: 'XAUT', name: two ? 'Vi khuẩn oxy hóa amoni (AOB)' : 'Vi khuẩn nitrat hóa (NITO)', u: 'g COD/m³', part: 1 }
    ]).concat(two ? [
      { id: 'XNOB', name: 'Vi khuẩn oxy hóa nitrit (NOB)', u: 'g COD/m³', part: 1 },
      { id: 'XAMX', name: 'Vi khuẩn anammox (AMX)', u: 'g COD/m³', part: 1 }
    ] : []).concat([
      { id: 'XMeOH', name: 'Hydroxit kim loại', u: 'g TSS/m³', part: 1 },
      { id: 'XMeP', name: 'Phosphat kim loại', u: 'g TSS/m³', part: 1 },
      { id: 'XISS', name: 'Chất rắn vô cơ (ISS)', u: 'g TSS/m³', part: 1 }
    ]);
    const BIO = ['XH', 'XPAO', 'XAUT'].concat(two ? ['XNOB', 'XAMX'] : []);
    const ORG = ['SF', 'SA', 'SI', 'XI', 'XS', 'XSE', 'XE', 'XPHA'].concat(BIO);

    const params = [
      // hợp thức
      { id: 'fSI', v: 0, u: '-', d: 'Phần SI sinh ra khi thủy phân', g: 'Hợp thức' },
      { id: 'YH', v: 0.67, u: 'g COD/g COD', d: 'Sản lượng OHO trên SB, hiếu khí', g: 'Hợp thức' },
      { id: 'YHA', v: 0.60, u: 'g COD/g COD', d: 'Sản lượng OHO trên VFA, hiếu khí', g: 'Hợp thức' },
      { id: 'YHax', v: 0.54, u: 'g COD/g COD', d: 'Sản lượng OHO trên SB, thiếu khí', g: 'Hợp thức' },
      { id: 'YHAax', v: 0.45, u: 'g COD/g COD', d: 'Sản lượng OHO trên VFA, thiếu khí', g: 'Hợp thức' },
      { id: 'YFE', v: 0.10, u: 'g COD/g COD', d: 'Sản lượng OHO khi lên men SB → VFA (kỵ khí)', g: 'Hợp thức' },
      { id: 'fXI', v: 0.08, u: '-', d: 'Phần sản phẩm nội sinh XE khi phân hủy sinh khối (fE)', g: 'Hợp thức' },
      { id: 'YPAO', v: 0.639, u: 'g COD/g COD', d: 'Sản lượng PAO trên PHA, hiếu khí', g: 'Hợp thức' },
      { id: 'YPAOax', v: 0.52, u: 'g COD/g COD', d: 'Sản lượng PAO trên PHA, thiếu khí', g: 'Hợp thức' },
      { id: 'YPO4', v: 0.40, u: 'g P/g COD', d: 'P giải phóng / VFA lưu trữ (kỵ khí)', g: 'Hợp thức' },
      { id: 'YPHA', v: 0.20, u: 'g COD/g P', d: 'PHA tiêu thụ / PP lưu trữ', g: 'Hợp thức' },
      { id: 'YA', v: two ? 0.15 : 0.24, u: 'g COD/g N', d: two ? 'Sản lượng AOB trên NH₄' : 'Sản lượng NITO trên NH₄', g: 'Hợp thức' }
    ].concat(two ? [
      { id: 'YNOB', v: 0.09, u: 'g COD/g N', d: 'Sản lượng NOB trên NO₂', g: 'Hợp thức' },
      { id: 'YAMX', v: 0.159, u: 'g COD/g NH₄-N', d: 'Sản lượng anammox', g: 'Hợp thức' },
      { id: 'rNO2X', v: 1.32, u: 'g N/g N', d: 'NO₂-N tiêu thụ / NH₄-N của anammox', g: 'Hợp thức' }
    ] : []).concat([
      // thành phần
      { id: 'iNSI', v: 0.01, u: 'g N/g COD', d: 'N trong SI (SU)', g: 'Thành phần' },
      { id: 'iNSF', v: 0.04, u: 'g N/g COD', d: 'N trong SF (SB)', g: 'Thành phần' },
      { id: 'iNXI', v: 0.01, u: 'g N/g COD', d: 'N trong XI (XU)', g: 'Thành phần' },
      { id: 'iNXS', v: 0.03, u: 'g N/g COD', d: 'N trong XS (XB)', g: 'Thành phần' },
      { id: 'iNXSE', v: 0.07, u: 'g N/g COD', d: 'N trong XB,e', g: 'Thành phần' },
      { id: 'iNXE', v: 0.06, u: 'g N/g COD', d: 'N trong XE', g: 'Thành phần' },
      { id: 'iNBM', v: 0.07, u: 'g N/g COD', d: 'N trong sinh khối', g: 'Thành phần' },
      { id: 'iPSI', v: 0.002, u: 'g P/g COD', d: 'P trong SI', g: 'Thành phần' },
      { id: 'iPSF', v: 0.01, u: 'g P/g COD', d: 'P trong SF', g: 'Thành phần' },
      { id: 'iPXI', v: 0.001, u: 'g P/g COD', d: 'P trong XI', g: 'Thành phần' },
      { id: 'iPXS', v: 0.003, u: 'g P/g COD', d: 'P trong XS', g: 'Thành phần' },
      { id: 'iPXSE', v: 0.02, u: 'g P/g COD', d: 'P trong XB,e', g: 'Thành phần' },
      { id: 'iPXE', v: 0, u: 'g P/g COD', d: 'P trong XE', g: 'Thành phần' },
      { id: 'iPBM', v: 0.02, u: 'g P/g COD', d: 'P trong sinh khối', g: 'Thành phần' },
      { id: 'iCVXI', v: 1.3, u: 'g COD/g VSS', d: 'COD/VSS của XI', g: 'Thành phần' },
      { id: 'iCVXS', v: 1.8, u: 'g COD/g VSS', d: 'COD/VSS của XS', g: 'Thành phần' },
      { id: 'iCVBM', v: 1.42, u: 'g COD/g VSS', d: 'COD/VSS của sinh khối', g: 'Thành phần' },
      { id: 'iCVXSE', v: 1.42, u: 'g COD/g VSS', d: 'COD/VSS của XB,e', g: 'Thành phần' },
      { id: 'iCVXE', v: 1.42, u: 'g COD/g VSS', d: 'COD/VSS của XE', g: 'Thành phần' },
      { id: 'iCVPHA', v: 1.67, u: 'g COD/g VSS', d: 'COD/VSS của PHA', g: 'Thành phần' },
      { id: 'iINORG', v: 0.11, u: 'g TSS/g COD', d: 'Chất vô cơ đi kèm sinh khối và XE (tính vào TSS)', g: 'Thành phần' },
      { id: 'iTSSPP', v: 3.516, u: 'g TSS/g P', d: 'TSS/P của XPP', g: 'Thành phần' },
      { id: 'YBOD', v: 0.95, u: 'g O₂/g COD', d: 'BOD cuối / COD phân hủy được', g: 'Biến tổng hợp' },
      { id: 'fSBOD', v: 0.9, u: '-', d: 'BOD₅/BOD cuối – cơ chất hòa tan', g: 'Biến tổng hợp' },
      { id: 'fXBOD', v: 0.5, u: '-', d: 'BOD₅/BOD cuối – cơ chất dạng hạt', g: 'Biến tổng hợp' },
      // thủy phân
      { id: 'kh', v: 3.0, u: '1/d', d: 'Tốc độ thủy phân XB', th: 1.03, g: 'Thủy phân' },
      { id: 'khE', v: 1.0, u: '1/d', d: 'Tốc độ thủy phân XB,e (sản phẩm phân hủy sinh khối)', th: 1.03, g: 'Thủy phân' },
      { id: 'KX', v: 0.05, u: 'g XS/g X', d: 'Bán bão hòa XS/(OHO+PAO)', g: 'Thủy phân' },
      { id: 'etaNOh', v: 0.5, u: '-', d: 'Hệ số thủy phân thiếu khí ηHYD,anox', g: 'Thủy phân' },
      { id: 'etafe', v: 0.2, u: '-', d: 'Hệ số thủy phân kỵ khí ηHYD,ana', g: 'Thủy phân' },
      { id: 'kXE', v: 0.007, u: '1/d', d: 'Tốc độ chuyển hóa chậm XE → XB,e', th: 1.03, g: 'Thủy phân' },
      // dị dưỡng
      { id: 'muH', v: 4.0, u: '1/d', d: 'Sinh trưởng cực đại OHO μOHO', th: 1.04, g: 'Dị dưỡng' },
      { id: 'bH', v: 0.62, u: '1/d', d: 'Phân hủy OHO bOHO', th: 1.03, g: 'Dị dưỡng' },
      { id: 'muFE', v: 0.3, u: '1/d', d: 'Sinh trưởng lên men OHO μFERM', th: 1.04, g: 'Dị dưỡng' }
    ]).concat(two ? [
      { id: 'etaNO3H', v: 0.24, u: '-', d: 'Hệ số thiếu khí OHO bước NO₃ → NO₂ (2/5 của ηanox = 0,6 – cùng năng lực khử như 1 bước)', g: 'Dị dưỡng' },
      { id: 'etaNO2H', v: 0.6, u: '-', d: 'Hệ số thiếu khí OHO bước NO₂ → N₂', g: 'Dị dưỡng' }
    ] : [
      { id: 'etaNOH', v: 0.6, u: '-', d: 'Hệ số sinh trưởng thiếu khí OHO ηOHO,anox', g: 'Dị dưỡng' }
    ]).concat([
      { id: 'KF', v: 5, u: 'g COD/m³', d: 'Bán bão hòa SB (OHO)', g: 'Dị dưỡng' },
      { id: 'KAH', v: 0.5, u: 'g COD/m³', d: 'Bán bão hòa VFA (OHO)', g: 'Dị dưỡng' },
      { id: 'Kfe', v: 5, u: 'g COD/m³', d: 'Bán bão hòa SB khi lên men', g: 'Dị dưỡng' },
      { id: 'KO2H', v: 0.15, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (OHO)', g: 'Dị dưỡng' },
      { id: 'KNO3H', v: two ? 0.1 : 0.03, u: 'g N/m³', d: two ? 'Bán bão hòa NO₃ (OHO)' : 'Bán bão hòa NOx (OHO)', g: 'Dị dưỡng' }
    ]).concat(two ? [{ id: 'KNO2H', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa NO₂ (OHO)', g: 'Dị dưỡng' }] : []).concat([
      { id: 'KNH4H', v: 0.005, u: 'g N/m³', d: 'Bán bão hòa NH₄ (dinh dưỡng)', g: 'Dị dưỡng' },
      { id: 'KPH', v: 0.002, u: 'g P/m³', d: 'Bán bão hòa PO₄ (dinh dưỡng)', g: 'Dị dưỡng' },
      { id: 'KALKH', v: 0.1, u: 'mol/m³', d: 'Bán bão hòa độ kiềm', g: 'Dị dưỡng' },
      { id: 'etabax', v: 0.5, u: '-', d: 'Hệ số giảm phân hủy thiếu khí ηb,anox', g: 'Dị dưỡng' },
      { id: 'etabana', v: 0.25, u: '-', d: 'Hệ số giảm phân hủy kỵ khí ηb,ana', g: 'Dị dưỡng' },
      // PAO
      { id: 'qPHA', v: 7.0, u: 'g PHA/(g PAO·d)', d: 'Tốc độ lưu trữ VFA thành PHA', th: 1.04, g: 'PAO' },
      { id: 'qPP', v: 1.5, u: 'g PP/(g PAO·d)', d: 'Tốc độ lưu trữ PP', th: 1.04, g: 'PAO' },
      { id: 'muPAO', v: 1.0, u: '1/d', d: 'Sinh trưởng cực đại PAO μCASTO', th: 1.04, g: 'PAO' },
      { id: 'bPAO', v: 0.08, u: '1/d', d: 'Phân hủy PAO bCASTO (kéo theo PP, PHA cùng tốc độ)', th: 1.03, g: 'PAO' },
      { id: 'bPPana', v: 0.005, u: '1/d', d: 'Duy trì kỵ khí trên PP (cắt PP) bPP,ana', th: 1.03, g: 'PAO' }
    ]).concat(two ? [
      { id: 'etaNO3P', v: 0.26, u: '-', d: 'Hệ số thiếu khí PAO bước NO₃ → NO₂', g: 'PAO' },
      { id: 'etaNO2P', v: 0.66, u: '-', d: 'Hệ số thiếu khí PAO bước NO₂ → N₂', g: 'PAO' },
      { id: 'KNO2P', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa NO₂ (PAO)', g: 'PAO' }
    ] : [
      { id: 'etaNOP', v: 0.66, u: '-', d: 'Hệ số thiếu khí PAO ηCASTO,anox', g: 'PAO' }
    ]).concat([
      { id: 'KO2P', v: 0.05, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (PAO)', g: 'PAO' },
      { id: 'KNO3P', v: 0.03, u: 'g N/m³', d: two ? 'Bán bão hòa NO₃ (PAO)' : 'Bán bão hòa NOx (PAO)', g: 'PAO' },
      { id: 'KAP', v: 5, u: 'g COD/m³', d: 'Bán bão hòa VFA khi lưu trữ PHA', g: 'PAO' },
      { id: 'KPS', v: 0.15, u: 'g P/m³', d: 'Bán bão hòa PO₄ khi lưu trữ PP', g: 'PAO' },
      { id: 'KPP', v: 0.002, u: 'g P/m³', d: 'Bán bão hòa PO₄ (sinh trưởng PAO)', g: 'PAO' },
      { id: 'KALKP', v: 0.1, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (PAO)', g: 'PAO' },
      { id: 'KPPr', v: 0.01, u: 'g PP/g PAO', d: 'Bán bão hòa tỷ lệ XPP/XPAO', g: 'PAO' },
      { id: 'KMAX', v: 0.35, u: 'g PP/g PAO', d: 'Tỷ lệ XPP/XPAO cực đại', g: 'PAO' },
      { id: 'KIPP', v: 0.02, u: 'g PP/g PAO', d: 'Hằng số ức chế lưu trữ PP', g: 'PAO' },
      { id: 'KPHA', v: 0.01, u: 'g PHA/g PAO', d: 'Bán bão hòa tỷ lệ PHA/PAO', g: 'PAO' },
      // nitrat hóa
      { id: 'muA', v: 0.9, u: '1/d', d: two ? 'Sinh trưởng cực đại AOB μAOB' : 'Sinh trưởng cực đại NITO μNITO', th: 1.072, g: 'Tự dưỡng' },
      { id: 'bA', v: 0.17, u: '1/d', d: two ? 'Phân hủy AOB' : 'Phân hủy NITO', th: 1.03, g: 'Tự dưỡng' },
      { id: 'KO2A', v: 0.5, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (AOB/NITO)', g: 'Tự dưỡng' },
      { id: 'KNH4A', v: 0.7, u: 'g N/m³', d: 'Bán bão hòa NH₄ (AOB/NITO)', g: 'Tự dưỡng' },
      { id: 'KALKA', v: 0.5, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (tự dưỡng)', g: 'Tự dưỡng' },
      { id: 'KPA', v: 0.002, u: 'g P/m³', d: 'Bán bão hòa PO₄ (tự dưỡng)', g: 'Tự dưỡng' }
    ]).concat(two ? [
      { id: 'muNOB', v: 0.65, u: '1/d', d: 'Sinh trưởng cực đại NOB', th: 1.06, g: 'NOB' },
      { id: 'bNOB', v: 0.15, u: '1/d', d: 'Phân hủy NOB', th: 1.03, g: 'NOB' },
      { id: 'KO2N', v: 0.5, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (NOB)', g: 'NOB' },
      { id: 'KNO2N', v: 0.1, u: 'g N/m³', d: 'Bán bão hòa NO₂ (NOB)', g: 'NOB' },
      { id: 'muAMX', v: 0.1, u: '1/d', d: 'Sinh trưởng cực đại anammox', th: 1.01, g: 'Anammox' },
      { id: 'bAMX', v: 0.019, u: '1/d', d: 'Phân hủy anammox', th: 1.03, g: 'Anammox' },
      { id: 'KNHX', v: 2, u: 'g N/m³', d: 'Bán bão hòa NH₄ (anammox)', g: 'Anammox' },
      { id: 'KNO2X', v: 1, u: 'g N/m³', d: 'Bán bão hòa NO₂ (anammox)', g: 'Anammox' },
      { id: 'KIOX', v: 0.4, u: 'g O₂/m³', d: 'Hằng số ức chế O₂ (anammox)', g: 'Anammox' }
    ] : []).concat([
      { id: 'kPRE', v: 1.0, u: 'm³/(g Fe(OH)₃·d)', d: 'Tốc độ kết tủa kPRE', g: 'Kết tủa P' },
      { id: 'kRED', v: 0.6, u: '1/d', d: 'Tốc độ hòa tan lại kRED', g: 'Kết tủa P' },
      { id: 'KALKpr', v: 0.5, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (kết tủa)', g: 'Kết tủa P' }
    ]).concat(PH_PARAMS);

    const hyd = p => ({ XS: -1, SF: 1 - p.fSI, SI: p.fSI });
    const lysis = k => p => ({ [k]: -1, XE: p.fXI, XSE: 1 - p.fXI });
    const ax = (n3, n2) => two ? [n3, n2] : [n3];
    const procs = [
      { id: 'h1', name: 'Thủy phân hiếu khí XB → SB', st: hyd, unk: NPQ, rate: 'kh·XS/(KX·XBIO+XS)·SO2/(KO2+SO2)·XBIO (XBIO = OHO+PAO)' },
      { id: 'h2', name: 'Thủy phân thiếu khí', st: hyd, unk: NPQ, rate: 'kh·ηHYD,anox·KO2/(KO2+SO2)·NOx/(KNO+NOx)·…' },
      { id: 'h3', name: 'Thủy phân kỵ khí', st: hyd, unk: NPQ, rate: 'kh·ηHYD,ana·KO2/(KO2+SO2)·KNO/(KNO+NOx)·…' },
      { id: 'h4', name: 'Thủy phân XB,e → SB (hiếu/thiếu/kỵ khí)', st: p => ({ XSE: -1, SF: 1 - p.fSI, SI: p.fSI }), unk: NPQ, rate: 'khE·XBe/(KX·XBIO+XBe)·[ox + ηHYD,anox·anox + ηHYD,ana·ana]·XBIO' },
      { id: 'h5', name: 'Chuyển hóa chậm XE → XB,e', st: () => ({ XE: -1, XSE: 1 }), unk: NPQ, rate: 'kXE·XE' },
      { id: 'o1', name: 'OHO sinh trưởng hiếu khí trên SB', st: p => ({ SF: -1 / p.YH, XH: 1 }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μOHO·SB/(KSB+SB)·KVFA/(KVFA+VFA)·SO2/(KO2+SO2)·dinh dưỡng·XH' },
      { id: 'o2', name: 'OHO sinh trưởng hiếu khí trên VFA', st: p => ({ SA: -1 / p.YHA, XH: 1 }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μOHO·VFA/(KVFA+VFA)·SO2/(KO2+SO2)·…·XH' }
    ].concat(two ? [
      { id: 'o3', name: 'OHO trên SB: khử NO₃ → NO₂', st: p => ({ SF: -1 / p.YHax, XH: 1 }), unk: [[NO32, 'COD'], ...NPQ], rate: 'μOHO·ηNO3·KO2/(KO2+SO2)·NO3/(KNO3+NO3)·…·XH' },
      { id: 'o4', name: 'OHO trên SB: khử NO₂ → N₂', st: p => ({ SF: -1 / p.YHax, XH: 1 }), unk: [[NO2D, 'COD'], ...NPQ], rate: 'μOHO·ηNO2·KO2/(KO2+SO2)·NO2/(KNO2+NO2)·…·XH' },
      { id: 'o5', name: 'OHO trên VFA: khử NO₃ → NO₂', st: p => ({ SA: -1 / p.YHAax, XH: 1 }), unk: [[NO32, 'COD'], ...NPQ], rate: 'μOHO·ηNO3·…·VFA/(KVFA+VFA)·XH' },
      { id: 'o6', name: 'OHO trên VFA: khử NO₂ → N₂', st: p => ({ SA: -1 / p.YHAax, XH: 1 }), unk: [[NO2D, 'COD'], ...NPQ], rate: 'μOHO·ηNO2·…·VFA/(KVFA+VFA)·XH' }
    ] : [
      { id: 'o3', name: 'OHO sinh trưởng thiếu khí trên SB', st: p => ({ SF: -1 / p.YHax, XH: 1 }), unk: [[NOD, 'COD'], ...NPQ], rate: 'μOHO·ηanox·KO2/(KO2+SO2)·NOx/(KNOx+NOx)·…·XH' },
      { id: 'o4', name: 'OHO sinh trưởng thiếu khí trên VFA', st: p => ({ SA: -1 / p.YHAax, XH: 1 }), unk: [[NOD, 'COD'], ...NPQ], rate: 'μOHO·ηanox·…·VFA/(KVFA+VFA)·XH' }
    ]).concat([
      { id: 'o7', name: 'OHO lên men SB → VFA (kỵ khí)', st: p => ({ SF: -1 / p.YFE, XH: 1 }), unk: [['SA', 'COD'], ...NPQ], rate: 'μFERM·KO2/(KO2+SO2)·KNO/(KNO+NOx)·SB/(Kfe+SB)·…·XH' },
      { id: 'o8', name: 'Phân hủy OHO (→ XE + XB)', st: lysis('XH'), unk: NPQ, rate: 'bOHO·[ox + ηb,anox·anox + ηb,ana·ana]·XH' },
      { id: 'c1', name: 'PAO lưu trữ VFA → PHA, giải phóng P', st: p => ({ SA: -1, XPHA: 1, XPP: -p.YPO4 }), unk: [['SPO4', 'P'], ['SALK', 'Q']], rate: 'qPHA·VFA/(KVFA+VFA)·(XPP/XPAO)/(KPP+XPP/XPAO)·XPAO' },
      { id: 'c2', name: 'PAO lưu trữ PP hiếu khí', st: p => ({ XPHA: -p.YPHA, XPP: 1 }), unk: [['SO2', 'COD'], ['SPO4', 'P'], ['SALK', 'Q']], rate: 'qPP·SO2/(KO2+SO2)·PO4/(KPS+PO4)·(XPHA/XPAO)/(KPHA+…)·(KMAX−XPP/XPAO)/(KIPP+KMAX−XPP/XPAO)·XPAO' }
    ]).concat(ax(
      { id: 'c3', name: two ? 'PAO lưu trữ PP thiếu khí (NO₃ → NO₂)' : 'PAO lưu trữ PP thiếu khí', st: p => ({ XPHA: -p.YPHA, XPP: 1 }), unk: [[two ? NO32 : NOD, 'COD'], ['SPO4', 'P'], ['SALK', 'Q']], rate: 'ρc2·η·KO2/SO2·NO3/(KNO3+NO3)' },
      { id: 'c3b', name: 'PAO lưu trữ PP thiếu khí (NO₂ → N₂)', st: p => ({ XPHA: -p.YPHA, XPP: 1 }), unk: [[NO2D, 'COD'], ['SPO4', 'P'], ['SALK', 'Q']], rate: 'ρc2·ηNO2·KO2/SO2·NO2/(KNO2+NO2)' }
    )).concat([
      { id: 'c4', name: 'PAO sinh trưởng hiếu khí trên PHA', st: p => ({ XPHA: -1 / p.YPAO, XPAO: 1 }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μPAO·SO2/(KO2+SO2)·NH4·PO4·(XPHA/XPAO)/(KPHA+XPHA/XPAO)·XPAO' }
    ]).concat(ax(
      { id: 'c5', name: two ? 'PAO sinh trưởng thiếu khí (NO₃ → NO₂)' : 'PAO sinh trưởng thiếu khí', st: p => ({ XPHA: -1 / p.YPAOax, XPAO: 1 }), unk: [[two ? NO32 : NOD, 'COD'], ...NPQ], rate: 'μPAO·η·KO2/(KO2+SO2)·NO3/(KNO3+NO3)·…' },
      { id: 'c5b', name: 'PAO sinh trưởng thiếu khí (NO₂ → N₂)', st: p => ({ XPHA: -1 / p.YPAOax, XPAO: 1 }), unk: [[NO2D, 'COD'], ...NPQ], rate: 'μPAO·ηNO2·KO2/(KO2+SO2)·NO2/(KNO2+NO2)·…' }
    )).concat([
      { id: 'c6', name: 'Phân hủy PAO (→ XE + XB)', st: lysis('XPAO'), unk: NPQ, rate: 'bCASTO·[ox + ηb,anox·anox + ηb,ana·ana]·XPAO' },
      { id: 'c7', name: 'Phân giải XPP (theo phân hủy PAO + duy trì kỵ khí)', st: () => ({ XPP: -1 }), unk: [['SPO4', 'P'], ['SALK', 'Q']], rate: '(bCASTO·f_b + bPP,ana·ana)·XPP' },
      { id: 'c8', name: 'Phân giải XPHA (theo phân hủy PAO)', st: () => ({ XPHA: -1, SA: 1 }), unk: [['SALK', 'Q']], rate: 'bCASTO·f_b·XPHA' },
      { id: 'n1', name: two ? 'AOB: nitrit hóa NH₄ → NO₂' : 'NITO: nitrat hóa NH₄ → NO₃', st: p => ({ XAUT: 1, [two ? 'SNO2' : 'SNO3']: 1 / p.YA }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μA·SO2/(KO2A+SO2)·NH4/(KNH4A+NH4)·PO4·ALK·XAUT' },
      { id: 'n2', name: two ? 'Phân hủy AOB' : 'Phân hủy NITO', st: lysis('XAUT'), unk: NPQ, rate: 'bA·[ox + ηb,anox·anox + ηb,ana·ana]·XAUT' }
    ]).concat(two ? [
      { id: 'n3', name: 'NOB: nitrat hóa NO₂ → NO₃', st: p => ({ XNOB: 1, SNO3: 1 / p.YNOB, SNO2: -1 / p.YNOB }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μNOB·SO2/(KO2N+SO2)·NO2/(KNO2N+NO2)·…·XNOB' },
      { id: 'n4', name: 'Phân hủy NOB', st: lysis('XNOB'), unk: NPQ, rate: 'bNOB·[ox + ηb,anox·anox + ηb,ana·ana]·XNOB' },
      { id: 'n5', name: 'Anammox NH₄ + 1,32 NO₂ → N₂ + 0,26 NO₃', st: p => ({ XAMX: 1, SNH4: -1 / p.YAMX, SNO2: -p.rNO2X / p.YAMX }), unk: [['SNO3', 'COD'], ['SN2', 'N'], ['SPO4', 'P'], ['SALK', 'Q']], rate: 'μAMX·NH4/(KNHX+NH4)·NO2/(KNO2X+NO2)·KIOX/(KIOX+SO2)·XAMX' },
      { id: 'n6', name: 'Phân hủy anammox', st: lysis('XAMX'), unk: NPQ, rate: 'bAMX·XAMX' }
    ] : []).concat([
      { id: 'k1', name: 'Kết tủa phosphat', st: () => ({ SPO4: -1, XMeOH: -3.45, XMeP: 4.87 }), unk: [['SALK', 'Q']], rate: 'kPRE·SPO4·XMeOH' },
      { id: 'k2', name: 'Hòa tan lại', st: () => ({ SPO4: 1, XMeOH: 3.45, XMeP: -4.87 }), unk: [['SALK', 'Q']], rate: 'kRED·XMeP·SALK/(KALK+SALK)' }
    ]);

    defineModel({
      id: two ? 'ASM2dS2' : 'ASM2dS', fam: 'ASM2d', sumo: two ? 'Sumo2' : 'Sumo1',
      name: two ? 'Kiểu Sumo2 – C/N/P, nitrat hóa & khử nitrat 2 bước, anammox (tự cài đặt)' : 'Kiểu Sumo1 – C/N/P toàn trạm, XE, phân hủy theo điều kiện (tự cài đặt)',
      ref: 'Tự cài đặt theo chức năng và tham số mặc định của thư viện ' + (two ? 'Sumo2' : 'Sumo1') + ' (SUMO24, Dynamita) trên nền ASM2d (Henze et al. 1999); phân hủy "chết – tái sinh" có hệ số giảm thiếu/kỵ khí → XE (fE = 0,08) + XB,e thủy phân chậm (1/d)'
        + (two ? '; nitrat hóa 2 bước (AOB/NOB), khử nitrat 2 bước, anammox (Strous 1998).' : '.') + ' Gộp: CB vào XS, CU/XE,ana vào XI, MEOLO vào OHO; không có GAO, methanogen, tảo, kết tủa khoáng (struvite, ACP, HFO).',
      cons: ['COD', 'N', 'P', 'Q', 'C'],
      SO: 'SO2', NO: 'SNO3', NH: 'SNH4', ALK: 'SALK', PO: 'SPO4', RB: 'SA', AUT: 'XAUT', HET: 'XH',
      NO2: two ? 'SNO2' : undefined,
      extraBio: two ? ['XNOB', 'XAMX'] : [], extraInert: ['XE'], extraDeg: ['XSE'],
      comps, params, procs,
      composition(p) {
        const n = this.n, I = this.idx, z = () => new Float64Array(n);
        const COD = z(), N = z(), P = z(), Q = z(), C = z();
        ORG.forEach(k => { COD[I[k]] = 1; C[I[k]] = p.iCorg / 12; });
        C[I.SA] = 0.375 / 12; C[I.XPHA] = 0.333 / 12; C[I.STIC] = 1;
        COD[I.SO2] = -1; COD[I.SN2] = -24 / 14; COD[I.SNO3] = -64 / 14;
        N[I.SNH4] = 1; N[I.SN2] = 1; N[I.SNO3] = 1;
        if (two) { COD[I.SNO2] = -48 / 14; N[I.SNO2] = 1; Q[I.SNO2] = -1 / 14; }
        N[I.SF] = p.iNSF; N[I.SI] = p.iNSI; N[I.XI] = p.iNXI; N[I.XS] = p.iNXS; N[I.XSE] = p.iNXSE; N[I.XE] = p.iNXE;
        P[I.SPO4] = 1; P[I.XPP] = 1; P[I.XMeP] = 1 / 4.87;
        P[I.SF] = p.iPSF; P[I.SI] = p.iPSI; P[I.XI] = p.iPXI; P[I.XS] = p.iPXS; P[I.XSE] = p.iPXSE; P[I.XE] = p.iPXE;
        BIO.forEach(k => { N[I[k]] = p.iNBM; P[I[k]] = p.iPBM; });
        Q[I.SA] = -1 / 64; Q[I.SNH4] = 1 / 14; Q[I.SNO3] = -1 / 14; Q[I.SPO4] = -1.5 / 31; Q[I.SALK] = -1; Q[I.XPP] = -1 / 31;
        return { COD, N, P, Q, C };
      },
      makeRates() {
        const I = this.idx;
        const iO = I.SO2, iF = I.SF, iA = I.SA, iNH = I.SNH4, iNO = I.SNO3, iN2 = two ? I.SNO2 : -1, iPO = I.SPO4, iALK = I.SALK,
          iXS = I.XS, iXSE = I.XSE, iXE = I.XE, iXH = I.XH, iPAO = I.XPAO, iPP = I.XPP, iPHA = I.XPHA, iAUT = I.XAUT,
          iNOB = two ? I.XNOB : -1, iAMX = two ? I.XAMX : -1, iMeOH = I.XMeOH, iMeP = I.XMeP;
        return function (x, p, r) {
          const so = Math.max(x[iO], 0), sf = Math.max(x[iF], 0), sa = Math.max(x[iA], 0), snh = Math.max(x[iNH], 0), spo = Math.max(x[iPO], 0), alk = Math.max(x[iALK], 0);
          const no3 = Math.max(x[iNO], 0), no2 = two ? Math.max(x[iN2], 0) : 0, nox = no3 + no2;
          const xs = Math.max(x[iXS], 0), xh = Math.max(x[iXH], 0), xpao = Math.max(x[iPAO], 0), xpp = Math.max(x[iPP], 0), xpha = Math.max(x[iPHA], 0), xaut = Math.max(x[iAUT], 0);
          const pf = phFactor(p);
          // chuyển mạch điều kiện (OHO)
          const oH = so / (p.KO2H + so), ioH = p.KO2H / (p.KO2H + so);
          const nH = nox / (p.KNO3H + nox), inH = p.KNO3H / (p.KNO3H + nox);
          const fbH = oH + ioH * (p.etabax * nH + p.etabana * inH);
          let k = 0;
          // thủy phân (bề mặt, theo OHO + PAO)
          const xb = xh + xpao, hyd = p.kh * xs / (p.KX * xb + xs + 1e-12) * xb;
          r[k++] = hyd * oH;
          r[k++] = hyd * p.etaNOh * ioH * nH;
          r[k++] = hyd * p.etafe * ioH * inH;
          const xse = Math.max(x[iXSE], 0);
          r[k++] = p.khE * xse / (p.KX * xb + xse + 1e-12) * xb * (oH + ioH * (p.etaNOh * nH + p.etafe * inH));
          r[k++] = p.kXE * Math.max(x[iXE], 0);
          // OHO
          const nutH = snh / (p.KNH4H + snh) * spo / (p.KPH + spo) * alk / (p.KALKH + alk);
          // ưu tiên VFA: OHO dùng VFA theo Monod đầy đủ, sinh trưởng trên SB bị VFA ức chế (không chia theo tỷ lệ SA/(SF+SA) như ASM2d)
          const gF = sf / (p.KF + sf) * p.KAH / (p.KAH + sa), gA = sa / (p.KAH + sa);
          const muX = p.muH * nutH * xh;
          r[k++] = muX * oH * gF;
          r[k++] = muX * oH * gA;
          if (two) {
            const a3 = ioH * no3 / (p.KNO3H + no3), a2 = ioH * no2 / (p.KNO2H + no2);
            r[k++] = muX * p.etaNO3H * a3 * gF;
            r[k++] = muX * p.etaNO2H * a2 * gF;
            r[k++] = muX * p.etaNO3H * a3 * gA;
            r[k++] = muX * p.etaNO2H * a2 * gA;
          } else {
            const a1 = ioH * no3 / (p.KNO3H + no3);
            r[k++] = muX * p.etaNOH * a1 * gF;
            r[k++] = muX * p.etaNOH * a1 * gA;
          }
          r[k++] = p.muFE * ioH * inH * sf / (p.Kfe + sf) * nutH * xh;
          r[k++] = p.bH * fbH * xh;
          // PAO
          const alkP = alk / (p.KALKP + alk);
          const oP = so / (p.KO2P + so), ioP = p.KO2P / (p.KO2P + so);
          const nP = nox / (p.KNO3P + nox), inP = p.KNO3P / (p.KNO3P + nox);
          r[k++] = p.qPHA * sa / (p.KAP + sa) * alkP * xpp / (p.KPPr * xpao + xpp + 1e-12) * xpao;
          const phr = xpha / (p.KPHA * xpao + xpha + 1e-12);
          const rpp = xpao > 1e-9 ? xpp / xpao : 0, room = Math.max(p.KMAX - rpp, 0);
          const pp = p.qPP * spo / (p.KPS + spo) * alkP * phr * room / (p.KIPP + room) * xpao;
          const gP = p.muPAO * snh / (p.KNH4H + snh) * spo / (p.KPP + spo) * alkP * phr * xpao;
          r[k++] = pp * oP;
          if (two) {
            const b3 = ioP * no3 / (p.KNO3P + no3), b2 = ioP * no2 / (p.KNO2P + no2);
            r[k++] = pp * p.etaNO3P * b3; r[k++] = pp * p.etaNO2P * b2;
            r[k++] = gP * oP;
            r[k++] = gP * p.etaNO3P * b3; r[k++] = gP * p.etaNO2P * b2;
          } else {
            const b1 = ioP * no3 / (p.KNO3P + no3);
            r[k++] = pp * p.etaNOP * b1;
            r[k++] = gP * oP;
            r[k++] = gP * p.etaNOP * b1;
          }
          const fbP = oP + ioP * (p.etabax * nP + p.etabana * inP);
          r[k++] = p.bPAO * fbP * xpao;
          r[k++] = (p.bPAO * fbP + p.bPPana * ioP * inP) * xpp;
          r[k++] = p.bPAO * fbP * xpha;
          // nitrat hóa
          const oA = so / (p.KO2A + so), ioA = p.KO2A / (p.KO2A + so);
          const fbA = oA + ioA * (p.etabax * nH + p.etabana * inH);
          const nutA = spo / (p.KPA + spo) * alk / (p.KALKA + alk);
          r[k++] = p.muA * oA * snh / (p.KNH4A + snh) * nutA * xaut * pf;
          r[k++] = p.bA * fbA * xaut;
          if (two) {
            const xnob = Math.max(x[iNOB], 0), xamx = Math.max(x[iAMX], 0);
            const oN = so / (p.KO2N + so), fbN = oN + (1 - oN) * (p.etabax * nH + p.etabana * inH);
            r[k++] = p.muNOB * oN * no2 / (p.KNO2N + no2) * nutA * xnob * pf;
            r[k++] = p.bNOB * fbN * xnob;
            r[k++] = p.muAMX * snh / (p.KNHX + snh) * no2 / (p.KNO2X + no2) * p.KIOX / (p.KIOX + so) * nutA * xamx * pf;
            r[k++] = p.bAMX * xamx;
          }
          // kết tủa hóa học
          r[k++] = p.kPRE * spo * Math.max(x[iMeOH], 0);
          r[k++] = p.kRED * Math.max(x[iMeP], 0) * alk / (p.KALKpr + alk);
        };
      },
      tssFactors(p) {
        const f = new Float64Array(this.n), I = this.idx;
        f[I.XI] = 1 / p.iCVXI; f[I.XS] = 1 / p.iCVXS; f[I.XSE] = 1 / p.iCVXSE; f[I.XE] = 1 / p.iCVXE + p.iINORG;
        BIO.forEach(k => (f[I[k]] = 1 / p.iCVBM + p.iINORG));
        f[I.XPP] = p.iTSSPP; f[I.XPHA] = 1 / p.iCVPHA;
        f[I.XMeOH] = 1; f[I.XMeP] = 1; f[I.XISS] = 1;
        return f;
      },
      compVars: [
        ['COD', 'COD', 'mg/L'], ['sCOD', 'COD hòa tan', 'mg/L'], ['BOD5', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['VSS', 'VSS', 'mg/L'],
        ['TKN', 'TKN', 'mgN/L'], ['NH4', 'NH₄-N', 'mgN/L']
      ].concat(two ? [['NO2', 'NO₂-N', 'mgN/L'], ['NO3', 'NO₃-N', 'mgN/L']] : []).concat([
        ['NOx', 'NOx-N', 'mgN/L'], ['TN', 'TN', 'mgN/L'],
        ['TP', 'TP', 'mgP/L'], ['PO4', 'PO₄-P', 'mgP/L'], ['VFA', 'VFA', 'mgCOD/L'], ['DO', 'DO', 'mg/L'], ['Alk', 'Độ kiềm', 'mgCaCO₃/L'], ['pH', 'pH', '-']
      ]),
      composites(x, p, o) {
        const I = this.idx;
        let bm = 0; for (const k of BIO) bm += x[I[k]];
        o.pH = CHEM.pH(this, x, p.T_ !== undefined ? p.T_ : 20);
        o.COD = x[I.SF] + x[I.SA] + x[I.SI] + x[I.XI] + x[I.XS] + x[I.XSE] + x[I.XE] + bm + x[I.XPHA];
        o.sCOD = x[I.SF] + x[I.SA] + x[I.SI];
        o.BOD5 = p.YBOD * (p.fSBOD * (x[I.SF] + x[I.SA]) + p.fXBOD * (x[I.XS] + x[I.XSE] + x[I.XPHA] + (1 - p.fXI) * bm));
        o.VSS = x[I.XI] / p.iCVXI + x[I.XS] / p.iCVXS + x[I.XSE] / p.iCVXSE + x[I.XE] / p.iCVXE + bm / p.iCVBM + x[I.XPHA] / p.iCVPHA;
        o.TSS = o.VSS + p.iINORG * (bm + x[I.XE]) + p.iTSSPP * x[I.XPP] + x[I.XMeOH] + x[I.XMeP] + x[I.XISS];
        o.NH4 = x[I.SNH4];
        o.TKN = x[I.SNH4] + p.iNSF * x[I.SF] + p.iNSI * x[I.SI] + p.iNXI * x[I.XI] + p.iNXS * x[I.XS] + p.iNXSE * x[I.XSE] + p.iNXE * x[I.XE] + p.iNBM * bm;
        if (two) { o.NO2 = x[I.SNO2]; o.NO3 = x[I.SNO3]; o.NOx = o.NO2 + o.NO3; } else o.NOx = x[I.SNO3];
        o.TN = o.TKN + o.NOx;
        o.PO4 = x[I.SPO4];
        o.TP = x[I.SPO4] + p.iPSF * x[I.SF] + p.iPSI * x[I.SI] + p.iPXI * x[I.XI] + p.iPXS * x[I.XS] + p.iPXSE * x[I.XSE] + p.iPXE * x[I.XE] + p.iPBM * bm + x[I.XPP] + x[I.XMeP] / 4.87;
        o.VFA = x[I.SA];
        o.DO = x[I.SO2];
        o.Alk = x[I.SALK] * 50;
        if (two) { o.AOB = x[I.XAUT]; o.NOB = x[I.XNOB]; o.AMX = x[I.XAMX]; }
        return o;
      }
    });
  }
  defineSumoType(false);
  defineSumoType(true);

  /* ------------------------------------------------------------------------
     ASM3 + Bio-P (EAWAG) – Rieger L., Koch G., Kühni M., Gujer W., Siegrist H. (2001)
     The EAWAG Bio-P module for activated sludge model No. 3. Wat. Res. 35(16), 3887-3903.
     Cơ chất SS của bản gốc = SF + SA (hai bể cùng động học, tốc độ chia theo tỷ lệ) để dùng
     chung dòng vào ASM2d. Hô hấp nội sinh (không có phân hủy kỵ khí). Thêm kết tủa P hóa học.
     ------------------------------------------------------------------------ */
  const C3 = [
    { id: 'SO2', name: 'Oxy hòa tan', u: 'g O₂/m³' },
    { id: 'SF', name: 'Cơ chất dễ phân hủy (phần không phải VFA của SS)', u: 'g COD/m³' },
    { id: 'SA', name: 'Cơ chất dễ phân hủy – VFA (phần của SS)', u: 'g COD/m³' },
    { id: 'SI', name: 'COD hòa tan trơ', u: 'g COD/m³' },
    { id: 'SNH4', name: 'Amoni', u: 'g N/m³' },
    { id: 'SN2', name: 'Khí N₂ hòa tan', u: 'g N/m³' },
    { id: 'SNO3', name: 'Nitrat + nitrit', u: 'g N/m³' },
    { id: 'SPO4', name: 'Phosphat', u: 'g P/m³' },
    { id: 'SALK', name: 'Độ kiềm', u: 'mol/m³' },
    { id: 'STIC', name: 'Carbon vô cơ tổng (TIC)', u: 'mol C/m³' },
    { id: 'XI', name: 'COD hạt trơ', u: 'g COD/m³', part: 1 },
    { id: 'XS', name: 'Cơ chất chậm phân hủy', u: 'g COD/m³', part: 1 },
    { id: 'XH', name: 'Sinh khối dị dưỡng', u: 'g COD/m³', part: 1 },
    { id: 'XSTO', name: 'Chất dự trữ của dị dưỡng XSTO', u: 'g COD/m³', part: 1 },
    { id: 'XPAO', name: 'Sinh khối PAO', u: 'g COD/m³', part: 1 },
    { id: 'XPP', name: 'Poly-phosphat', u: 'g P/m³', part: 1 },
    { id: 'XPHA', name: 'PHA nội bào', u: 'g COD/m³', part: 1 },
    { id: 'XAUT', name: 'Sinh khối nitrat hóa', u: 'g COD/m³', part: 1 },
    { id: 'XMeOH', name: 'Hydroxit kim loại', u: 'g TSS/m³', part: 1 },
    { id: 'XMeP', name: 'Phosphat kim loại', u: 'g TSS/m³', part: 1 },
    { id: 'XISS', name: 'Chất rắn vô cơ (ISS)', u: 'g TSS/m³', part: 1 }
  ];
  const P3 = [
    { id: 'kH', v: 9, u: 'g COD/(g COD·d)', d: 'Tốc độ thủy phân kH', th: 1.04, g: 'Thủy phân' },
    { id: 'KX', v: 1, u: 'g XS/g XH', d: 'Bán bão hòa thủy phân KX', g: 'Thủy phân' },
    { id: 'kSTO', v: 12.5, u: 'g COD/(g COD·d)', d: 'Tốc độ tích trữ kSTO', th: 1.072, g: 'Dị dưỡng' },
    { id: 'KSTO', v: 0.1, u: 'g XSTO/g XH', d: 'Bán bão hòa XSTO/XH', g: 'Dị dưỡng' },
    { id: 'bSTO', v: 0.3, u: '1/d', d: 'Hô hấp XSTO bSTO', th: 1.072, g: 'Dị dưỡng' },
    { id: 'muH', v: 3, u: '1/d', d: 'Sinh trưởng cực đại dị dưỡng μH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'etaNOH', v: 0.8, u: '-', d: 'Hệ số thiếu khí ηNO,H', g: 'Dị dưỡng' },
    { id: 'KSH', v: 10, u: 'g COD/m³', d: 'Bán bão hòa SS (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'bH', v: 0.3, u: '1/d', d: 'Hô hấp nội sinh dị dưỡng bH', th: 1.072, g: 'Dị dưỡng' },
    { id: 'etaNOendH', v: 0.33, u: '-', d: 'Hệ số hô hấp nội sinh thiếu khí ηNO,end,H', g: 'Dị dưỡng' },
    { id: 'KO2H', v: 0.2, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KNO3H', v: 0.5, u: 'g N/m³', d: 'Bán bão hòa NOx (dị dưỡng)', g: 'Dị dưỡng' },
    { id: 'KNH4H', v: 0.01, u: 'g N/m³', d: 'Bán bão hòa NH₄ (dinh dưỡng)', g: 'Dị dưỡng' },
    { id: 'KPH', v: 0.01, u: 'g P/m³', d: 'Bán bão hòa PO₄ (dinh dưỡng)', g: 'Dị dưỡng' },
    { id: 'KALKH', v: 0.1, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (HCO₃)', g: 'Dị dưỡng' },
    { id: 'qPHA', v: 6, u: 'g COD/(g PAO·d)', d: 'Tốc độ lưu trữ PHA qPHA', th: 1.04, g: 'PAO' },
    { id: 'qPP', v: 1.5, u: 'g P/(g PAO·d)', d: 'Tốc độ lưu trữ PP qPP', th: 1.04, g: 'PAO' },
    { id: 'KPPr', v: 0.05, u: 'g P/g PAO', d: 'Bán bão hòa XPP/XPAO', g: 'PAO' },
    { id: 'KMAX', v: 0.2, u: 'g P/g PAO', d: 'Tỷ lệ XPP/XPAO cực đại', g: 'PAO' },
    { id: 'KIPP', v: 0.05, u: 'g P/g PAO', d: 'Hằng số ức chế lưu trữ PP', g: 'PAO' },
    { id: 'muPAO', v: 1, u: '1/d', d: 'Sinh trưởng cực đại PAO', th: 1.041, g: 'PAO' },
    { id: 'etaNOP', v: 0.6, u: '-', d: 'Hệ số thiếu khí PAO', g: 'PAO' },
    { id: 'KPHA', v: 0.1, u: 'g PHA/g PAO', d: 'Bán bão hòa XPHA/XPAO', g: 'PAO' },
    { id: 'bPAO', v: 0.2, u: '1/d', d: 'Hô hấp nội sinh PAO', th: 1.072, g: 'PAO' },
    { id: 'etaNOendP', v: 0.33, u: '-', d: 'Hệ số hô hấp nội sinh thiếu khí PAO', g: 'PAO' },
    { id: 'bPP', v: 0.2, u: '1/d', d: 'Phân giải XPP', th: 1.072, g: 'PAO' },
    { id: 'etaNOlysPP', v: 0.33, u: '-', d: 'Hệ số phân giải PP thiếu khí', g: 'PAO' },
    { id: 'bPHA', v: 0.2, u: '1/d', d: 'Hô hấp XPHA', th: 1.072, g: 'PAO' },
    { id: 'etaNOrespPHA', v: 0.33, u: '-', d: 'Hệ số hô hấp PHA thiếu khí', g: 'PAO' },
    { id: 'KSP', v: 10, u: 'g COD/m³', d: 'Bán bão hòa SS (PAO)', g: 'PAO' },
    { id: 'KO2P', v: 0.2, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (PAO)', g: 'PAO' },
    { id: 'KNO3P', v: 0.5, u: 'g N/m³', d: 'Bán bão hòa NOx (PAO)', g: 'PAO' },
    { id: 'KNH4P', v: 0.05, u: 'g N/m³', d: 'Bán bão hòa NH₄ (PAO)', g: 'PAO' },
    { id: 'KPS', v: 0.2, u: 'g P/m³', d: 'Bán bão hòa PO₄ khi lưu trữ PP', g: 'PAO' },
    { id: 'KPP', v: 0.01, u: 'g P/m³', d: 'Bán bão hòa PO₄ (sinh trưởng PAO)', g: 'PAO' },
    { id: 'KALKP', v: 0.1, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (PAO)', g: 'PAO' },
    { id: 'muA', v: 0.9, u: '1/d', d: 'Sinh trưởng cực đại tự dưỡng μA', th: 1.111, g: 'Tự dưỡng' },
    { id: 'bA', v: 0.2, u: '1/d', d: 'Hô hấp nội sinh tự dưỡng bA', th: 1.116, g: 'Tự dưỡng' },
    { id: 'etaNOendA', v: 0.5, u: '-', d: 'Hệ số hô hấp nội sinh thiếu khí tự dưỡng', g: 'Tự dưỡng' },
    { id: 'KO2A', v: 0.5, u: 'g O₂/m³', d: 'Bán bão hòa O₂ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KNH4A', v: 1, u: 'g N/m³', d: 'Bán bão hòa NH₄ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KPA', v: 0.01, u: 'g P/m³', d: 'Bán bão hòa PO₄ (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'KALKA', v: 0.5, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (tự dưỡng)', g: 'Tự dưỡng' },
    { id: 'YH', v: 0.8, u: 'g COD/g COD', d: 'Sản lượng dị dưỡng hiếu khí YH,O2 (trên XSTO)', g: 'Hợp thức' },
    { id: 'YHax', v: 0.65, u: 'g COD/g COD', d: 'Sản lượng dị dưỡng thiếu khí YH,NO', g: 'Hợp thức' },
    { id: 'YSTO', v: 0.8, u: 'g COD/g COD', d: 'Sản lượng tích trữ hiếu khí YSTO,O2', g: 'Hợp thức' },
    { id: 'YSTOax', v: 0.7, u: 'g COD/g COD', d: 'Sản lượng tích trữ thiếu khí YSTO,NO', g: 'Hợp thức' },
    { id: 'YPAO', v: 0.6, u: 'g COD/g COD', d: 'Sản lượng PAO hiếu khí', g: 'Hợp thức' },
    { id: 'YPAOax', v: 0.5, u: 'g COD/g COD', d: 'Sản lượng PAO thiếu khí', g: 'Hợp thức' },
    { id: 'YPHA', v: 0.2, u: 'g COD/g P', d: 'PHA tiêu thụ / PP lưu trữ', g: 'Hợp thức' },
    { id: 'YPO4', v: 0.35, u: 'g P/g COD', d: 'P giải phóng / PHA lưu trữ', g: 'Hợp thức' },
    { id: 'YA', v: 0.24, u: 'g COD/g N', d: 'Sản lượng tự dưỡng', g: 'Hợp thức' },
    { id: 'fSI', v: 0, u: '-', d: 'Phần SI khi thủy phân', g: 'Hợp thức' },
    { id: 'fXI', v: 0.2, u: '-', d: 'Phần XI từ hô hấp nội sinh', g: 'Hợp thức' },
    { id: 'iNSF', v: 0.03, u: 'g N/g COD', d: 'N trong SS', g: 'Thành phần' },
    { id: 'iNSI', v: 0.01, u: 'g N/g COD', d: 'N trong SI', g: 'Thành phần' },
    { id: 'iNXI', v: 0.03, u: 'g N/g COD', d: 'N trong XI', g: 'Thành phần' },
    { id: 'iNXS', v: 0.035, u: 'g N/g COD', d: 'N trong XS', g: 'Thành phần' },
    { id: 'iNBM', v: 0.07, u: 'g N/g COD', d: 'N trong sinh khối', g: 'Thành phần' },
    { id: 'iPSF', v: 0, u: 'g P/g COD', d: 'P trong SS', g: 'Thành phần' },
    { id: 'iPSI', v: 0, u: 'g P/g COD', d: 'P trong SI', g: 'Thành phần' },
    { id: 'iPXI', v: 0.01, u: 'g P/g COD', d: 'P trong XI', g: 'Thành phần' },
    { id: 'iPXS', v: 0.005, u: 'g P/g COD', d: 'P trong XS', g: 'Thành phần' },
    { id: 'iPBM', v: 0.014, u: 'g P/g COD', d: 'P trong sinh khối', g: 'Thành phần' },
    { id: 'iTSSXI', v: 0.75, u: 'g TSS/g COD', d: 'TSS/COD của XI', g: 'Thành phần' },
    { id: 'iTSSXS', v: 0.75, u: 'g TSS/g COD', d: 'TSS/COD của XS', g: 'Thành phần' },
    { id: 'iTSSSTO', v: 0.6, u: 'g TSS/g COD', d: 'TSS/COD của XSTO, XPHA', g: 'Thành phần' },
    { id: 'iTSSBM', v: 0.9, u: 'g TSS/g COD', d: 'TSS/COD của sinh khối', g: 'Thành phần' },
    { id: 'iTSSPP', v: 3.23, u: 'g TSS/g P', d: 'TSS/P của XPP', g: 'Thành phần' },
    { id: 'iCV', v: 1.48, u: 'g COD/g VSS', d: 'COD hạt hữu cơ / VSS', g: 'Biến tổng hợp' },
    { id: 'fBOD', v: 0.67, u: '-', d: 'BOD₅ / BOD cuối', g: 'Biến tổng hợp' },
    { id: 'kPRE', v: 1.0, u: 'm³/(g Fe(OH)₃·d)', d: 'Tốc độ kết tủa kPRE', g: 'Kết tủa P' },
    { id: 'kRED', v: 0.6, u: '1/d', d: 'Tốc độ hòa tan lại kRED', g: 'Kết tủa P' },
    { id: 'KALKpr', v: 0.5, u: 'mol/m³', d: 'Bán bão hòa độ kiềm (kết tủa)', g: 'Kết tủa P' }
  ].concat(PH_PARAMS);
  const resp = (k, f) => p => ({ [k]: -1, XI: f ? p.fXI : 0 });
  const S2 = (s) => s === 'SF' ? 'SB' : 'VFA';
  const PR3 = [
    { id: 'p1', name: 'Thủy phân XS → SS', st: p => ({ XS: -1, SF: 1 - p.fSI, SI: p.fSI }), unk: NPQ, rate: 'kH·(XS/XH)/(KX+XS/XH)·XH' }
  ].concat(['SF', 'SA'].map(s => ({ id: 'p2' + s, name: 'Tích trữ hiếu khí ' + S2(s) + ' → XSTO', st: p => ({ [s]: -1, XSTO: p.YSTO }), unk: [['SO2', 'COD'], ...NPQ], rate: 'kSTO·SO2/(KO+SO2)·SS/(KS+SS)·' + s + '/SS·XH' })))
    .concat(['SF', 'SA'].map(s => ({ id: 'p3' + s, name: 'Tích trữ thiếu khí ' + S2(s) + ' → XSTO', st: p => ({ [s]: -1, XSTO: p.YSTOax }), unk: [[NOD, 'COD'], ...NPQ], rate: 'kSTO·ηNO·KO/(KO+SO2)·NO/(KNO+NO)·SS/(KS+SS)·' + s + '/SS·XH' })))
    .concat([
      { id: 'p4', name: 'Sinh trưởng hiếu khí XH trên XSTO', st: p => ({ XSTO: -1 / p.YH, XH: 1 }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μH·SO2/(KO+SO2)·NH4·PO4·HCO3·(XSTO/XH)/(KSTO+XSTO/XH)·XH' },
      { id: 'p5', name: 'Sinh trưởng thiếu khí XH (khử nitrat)', st: p => ({ XSTO: -1 / p.YHax, XH: 1 }), unk: [[NOD, 'COD'], ...NPQ], rate: 'μH·ηNO·KO/(KO+SO2)·NO/(KNO+NO)·…·XH' },
      { id: 'p6', name: 'Hô hấp nội sinh hiếu khí XH', st: resp('XH', 1), unk: [['SO2', 'COD'], ...NPQ], rate: 'bH·SO2/(KO+SO2)·XH' },
      { id: 'p7', name: 'Hô hấp nội sinh thiếu khí XH', st: resp('XH', 1), unk: [[NOD, 'COD'], ...NPQ], rate: 'bH·ηNO,end·KO/(KO+SO2)·NO/(KNO+NO)·XH' },
      { id: 'p8', name: 'Hô hấp hiếu khí XSTO', st: resp('XSTO'), unk: [['SO2', 'COD']], rate: 'bSTO·SO2/(KO+SO2)·XSTO' },
      { id: 'p9', name: 'Hô hấp thiếu khí XSTO', st: resp('XSTO'), unk: [[NOD, 'COD'], ['SALK', 'Q']], rate: 'bSTO·ηNO,end·KO/(KO+SO2)·NO/(KNO+NO)·XSTO' }
    ])
    .concat(['SF', 'SA'].map(s => ({ id: 'p10' + s, name: 'PAO lưu trữ PHA từ ' + S2(s), st: p => ({ [s]: -1, XPHA: 1, XPP: -p.YPO4 }), unk: [['SPO4', 'P'], ['SNH4', 'N'], ['SALK', 'Q']], rate: 'qPHA·SS/(KS,PAO+SS)·' + s + '/SS·HCO3·(XPP/XPAO)/(KPP+XPP/XPAO)·XPAO' })))
    .concat([
      { id: 'p11', name: 'Lưu trữ PP hiếu khí', st: p => ({ XPHA: -p.YPHA, XPP: 1 }), unk: [['SO2', 'COD'], ['SPO4', 'P'], ['SALK', 'Q']], rate: 'qPP·SO2/(KO+SO2)·PO4/(KPS+PO4)·HCO3·(XPHA/XPAO)/(KPHA+…)·(KMAX−XPP/XPAO)/(KIPP+KMAX−XPP/XPAO)·XPAO' },
      { id: 'p12', name: 'Lưu trữ PP thiếu khí', st: p => ({ XPHA: -p.YPHA, XPP: 1 }), unk: [[NOD, 'COD'], ['SPO4', 'P'], ['SALK', 'Q']], rate: 'ρ11·ηNO·KO/SO2·NO/(KNO+NO)' },
      { id: 'p13', name: 'Sinh trưởng PAO hiếu khí', st: p => ({ XPHA: -1 / p.YPAO, XPAO: 1 }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μPAO·SO2/(KO+SO2)·NH4·PO4·HCO3·(XPHA/XPAO)/(KPHA+XPHA/XPAO)·XPAO' },
      { id: 'p14', name: 'Sinh trưởng PAO thiếu khí', st: p => ({ XPHA: -1 / p.YPAOax, XPAO: 1 }), unk: [[NOD, 'COD'], ...NPQ], rate: 'ρ13·ηNO·KO/SO2·NO/(KNO+NO)' },
      { id: 'p15', name: 'Hô hấp nội sinh hiếu khí PAO', st: resp('XPAO', 1), unk: [['SO2', 'COD'], ...NPQ], rate: 'bPAO·SO2/(KO+SO2)·XPAO' },
      { id: 'p16', name: 'Hô hấp nội sinh thiếu khí PAO', st: resp('XPAO', 1), unk: [[NOD, 'COD'], ...NPQ], rate: 'bPAO·ηNO,end·KO/(KO+SO2)·NO/(KNO+NO)·XPAO' },
      { id: 'p17', name: 'Phân giải XPP hiếu khí', st: () => ({ XPP: -1 }), unk: [['SPO4', 'P'], ['SALK', 'Q']], rate: 'bPP·SO2/(KO+SO2)·XPP' },
      { id: 'p18', name: 'Phân giải XPP thiếu khí', st: () => ({ XPP: -1 }), unk: [['SPO4', 'P'], ['SALK', 'Q']], rate: 'bPP·ηNO,lys·KO/(KO+SO2)·NO/(KNO+NO)·XPP' },
      { id: 'p19', name: 'Hô hấp XPHA hiếu khí', st: () => ({ XPHA: -1 }), unk: [['SO2', 'COD']], rate: 'bPHA·SO2/(KO+SO2)·XPHA' },
      { id: 'p20', name: 'Hô hấp XPHA thiếu khí', st: () => ({ XPHA: -1 }), unk: [[NOD, 'COD'], ['SALK', 'Q']], rate: 'bPHA·ηNO,resp·KO/(KO+SO2)·NO/(KNO+NO)·XPHA' },
      { id: 'p21', name: 'Sinh trưởng tự dưỡng (nitrat hóa)', st: p => ({ XAUT: 1, SNO3: 1 / p.YA }), unk: [['SO2', 'COD'], ...NPQ], rate: 'μA·SO2/(KO,A+SO2)·NH4/(KNH,A+NH4)·PO4·HCO3·XA' },
      { id: 'p22', name: 'Hô hấp nội sinh hiếu khí XA', st: resp('XAUT', 1), unk: [['SO2', 'COD'], ...NPQ], rate: 'bA·SO2/(KO,A+SO2)·XA' },
      { id: 'p23', name: 'Hô hấp nội sinh thiếu khí XA', st: resp('XAUT', 1), unk: [[NOD, 'COD'], ...NPQ], rate: 'bA·ηNO,end,A·KO,A/(KO,A+SO2)·NO/(KNO+NO)·XA' },
      { id: 'p24', name: 'Kết tủa phosphat', st: () => ({ SPO4: -1, XMeOH: -3.45, XMeP: 4.87 }), unk: [['SALK', 'Q']], rate: 'kPRE·SPO4·XMeOH' },
      { id: 'p25', name: 'Hòa tan lại', st: () => ({ SPO4: 1, XMeOH: 3.45, XMeP: -4.87 }), unk: [['SALK', 'Q']], rate: 'kRED·XMeP·SALK/(KALK+SALK)' }
    ]);
  defineModel({
    id: 'ASM3P', fam: 'ASM2d', sumo: 'ASM3_BioP',
    name: 'ASM3 + Bio-P EAWAG (Rieger 2001) – C, N, P',
    ref: 'Rieger L., Koch G., Kühni M., Gujer W., Siegrist H. (2001) The EAWAG Bio-P module for activated sludge model No. 3. Wat. Res. 35(16), 3887-3903 (mô hình "bảo tàng" trong SUMO24). Tự cài đặt; SS = SF + SA để dùng chung dòng vào ASM2d; thêm kết tủa P hóa học (ASM2d).',
    cons: ['COD', 'N', 'P', 'Q', 'C'],
    SO: 'SO2', NO: 'SNO3', NH: 'SNH4', ALK: 'SALK', PO: 'SPO4', RB: 'SA', AUT: 'XAUT', HET: 'XH',
    extraDeg: ['XSTO'],
    comps: C3, params: P3, procs: PR3,
    composition(p) {
      const n = this.n, I = this.idx, z = () => new Float64Array(n);
      const COD = z(), N = z(), P = z(), Q = z(), C = z();
      ['SF', 'SA', 'SI', 'XI', 'XS', 'XH', 'XSTO', 'XPAO', 'XPHA', 'XAUT'].forEach(k => { COD[I[k]] = 1; C[I[k]] = p.iCorg / 12; });
      C[I.SA] = 0.375 / 12; C[I.XPHA] = 0.333 / 12; C[I.XSTO] = 0.333 / 12; C[I.STIC] = 1;
      COD[I.SO2] = -1; COD[I.SN2] = -24 / 14; COD[I.SNO3] = -64 / 14;
      N[I.SNH4] = 1; N[I.SN2] = 1; N[I.SNO3] = 1;
      N[I.SF] = p.iNSF; N[I.SI] = p.iNSI; N[I.XI] = p.iNXI; N[I.XS] = p.iNXS;
      N[I.XH] = N[I.XPAO] = N[I.XAUT] = p.iNBM;
      P[I.SPO4] = 1; P[I.XPP] = 1; P[I.XMeP] = 1 / 4.87;
      P[I.SF] = p.iPSF; P[I.SI] = p.iPSI; P[I.XI] = p.iPXI; P[I.XS] = p.iPXS;
      P[I.XH] = P[I.XPAO] = P[I.XAUT] = p.iPBM;
      Q[I.SA] = -1 / 64; Q[I.SNH4] = 1 / 14; Q[I.SNO3] = -1 / 14; Q[I.SPO4] = -1.5 / 31; Q[I.SALK] = -1; Q[I.XPP] = -1 / 31;
      return { COD, N, P, Q, C };
    },
    makeRates() {
      const I = this.idx;
      const iO = I.SO2, iF = I.SF, iA = I.SA, iNH = I.SNH4, iNO = I.SNO3, iPO = I.SPO4, iALK = I.SALK,
        iXS = I.XS, iXH = I.XH, iSTO = I.XSTO, iPAO = I.XPAO, iPP = I.XPP, iPHA = I.XPHA, iAUT = I.XAUT, iMeOH = I.XMeOH, iMeP = I.XMeP;
      return function (x, p, r) {
        const so = Math.max(x[iO], 0), sf = Math.max(x[iF], 0), sa = Math.max(x[iA], 0), snh = Math.max(x[iNH], 0), no = Math.max(x[iNO], 0),
          spo = Math.max(x[iPO], 0), alk = Math.max(x[iALK], 0);
        const xs = Math.max(x[iXS], 0), xh = Math.max(x[iXH], 0), xsto = Math.max(x[iSTO], 0), xpao = Math.max(x[iPAO], 0),
          xpp = Math.max(x[iPP], 0), xpha = Math.max(x[iPHA], 0), xa = Math.max(x[iAUT], 0);
        const ss = sf + sa, fF = ss > 1e-12 ? sf / ss : 0.5, fA = 1 - fF;
        const oH = so / (p.KO2H + so), ioH = p.KO2H / (p.KO2H + so), nH = no / (p.KNO3H + no);
        const hco = alk / (p.KALKH + alk);
        r[0] = p.kH * xs / (p.KX * xh + xs + 1e-12) * xh;
        const sto = p.kSTO * ss / (p.KSH + ss) * xh;
        r[1] = sto * oH * fF; r[2] = sto * oH * fA;
        r[3] = sto * p.etaNOH * ioH * nH * fF; r[4] = sto * p.etaNOH * ioH * nH * fA;
        const gH = p.muH * snh / (p.KNH4H + snh) * spo / (p.KPH + spo) * hco * xsto / (p.KSTO * xh + xsto + 1e-12) * xh;
        r[5] = gH * oH;
        r[6] = gH * p.etaNOH * ioH * nH;
        r[7] = p.bH * oH * xh;
        r[8] = p.bH * p.etaNOendH * ioH * nH * xh;
        r[9] = p.bSTO * oH * xsto;
        r[10] = p.bSTO * p.etaNOendH * ioH * nH * xsto;
        const alkP = alk / (p.KALKP + alk);
        const pha = p.qPHA * ss / (p.KSP + ss) * alkP * xpp / (p.KPPr * xpao + xpp + 1e-12) * xpao;
        r[11] = pha * fF; r[12] = pha * fA;
        const oP = so / (p.KO2P + so), ioP = p.KO2P / (p.KO2P + so), nP = no / (p.KNO3P + no);
        const phr = xpha / (p.KPHA * xpao + xpha + 1e-12);
        const rpp = xpao > 1e-9 ? xpp / xpao : 0, room = Math.max(p.KMAX - rpp, 0);
        const pp = p.qPP * spo / (p.KPS + spo) * alkP * phr * room / (p.KIPP + room) * xpao;
        r[13] = pp * oP;
        r[14] = pp * p.etaNOP * ioP * nP;
        const gP = p.muPAO * snh / (p.KNH4P + snh) * spo / (p.KPP + spo) * alkP * phr * xpao;
        r[15] = gP * oP;
        r[16] = gP * p.etaNOP * ioP * nP;
        r[17] = p.bPAO * oP * xpao;
        r[18] = p.bPAO * p.etaNOendP * ioP * nP * xpao;
        r[19] = p.bPP * oP * xpp;
        r[20] = p.bPP * p.etaNOlysPP * ioP * nP * xpp;
        r[21] = p.bPHA * oP * xpha;
        r[22] = p.bPHA * p.etaNOrespPHA * ioP * nP * xpha;
        const oA = so / (p.KO2A + so), ioA = p.KO2A / (p.KO2A + so);
        r[23] = p.muA * oA * snh / (p.KNH4A + snh) * spo / (p.KPA + spo) * alk / (p.KALKA + alk) * xa * phFactor(p);
        r[24] = p.bA * oA * xa;
        r[25] = p.bA * p.etaNOendA * ioA * nH * xa;
        r[26] = p.kPRE * spo * Math.max(x[iMeOH], 0);
        r[27] = p.kRED * Math.max(x[iMeP], 0) * alk / (p.KALKpr + alk);
      };
    },
    tssFactors(p) {
      const f = new Float64Array(this.n), I = this.idx;
      f[I.XI] = p.iTSSXI; f[I.XS] = p.iTSSXS;
      f[I.XH] = f[I.XPAO] = f[I.XAUT] = p.iTSSBM;
      f[I.XSTO] = f[I.XPHA] = p.iTSSSTO; f[I.XPP] = p.iTSSPP;
      f[I.XMeOH] = 1; f[I.XMeP] = 1; f[I.XISS] = 1;
      return f;
    },
    compVars: [
      ['COD', 'COD', 'mg/L'], ['sCOD', 'COD hòa tan', 'mg/L'], ['BOD5', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['VSS', 'VSS', 'mg/L'],
      ['TKN', 'TKN', 'mgN/L'], ['NH4', 'NH₄-N', 'mgN/L'], ['NOx', 'NOx-N', 'mgN/L'], ['TN', 'TN', 'mgN/L'],
      ['TP', 'TP', 'mgP/L'], ['PO4', 'PO₄-P', 'mgP/L'], ['VFA', 'VFA', 'mgCOD/L'], ['XSTO', 'Chất dự trữ XSTO', 'mgCOD/L'], ['DO', 'DO', 'mg/L'], ['Alk', 'Độ kiềm', 'mgCaCO₃/L'], ['pH', 'pH', '-']
    ],
    composites(x, p, o) {
      const I = this.idx;
      const bm = x[I.XH] + x[I.XPAO] + x[I.XAUT];
      o.pH = CHEM.pH(this, x, p.T_ !== undefined ? p.T_ : 20);
      o.COD = x[I.SF] + x[I.SA] + x[I.SI] + x[I.XI] + x[I.XS] + bm + x[I.XSTO] + x[I.XPHA];
      o.sCOD = x[I.SF] + x[I.SA] + x[I.SI];
      o.BOD5 = p.fBOD * (x[I.SF] + x[I.SA] + x[I.XS] + x[I.XSTO] + x[I.XPHA] + (1 - p.fXI) * bm);
      o.TSS = p.iTSSXI * x[I.XI] + p.iTSSXS * x[I.XS] + p.iTSSBM * bm + p.iTSSSTO * (x[I.XSTO] + x[I.XPHA]) + p.iTSSPP * x[I.XPP] + x[I.XMeOH] + x[I.XMeP] + x[I.XISS];
      o.VSS = Math.min(o.TSS, (x[I.XI] + x[I.XS] + bm + x[I.XSTO] + x[I.XPHA]) / p.iCV);
      o.NH4 = x[I.SNH4];
      o.TKN = x[I.SNH4] + p.iNSF * x[I.SF] + p.iNSI * x[I.SI] + p.iNXI * x[I.XI] + p.iNXS * x[I.XS] + p.iNBM * bm;
      o.NOx = x[I.SNO3];
      o.TN = o.TKN + o.NOx;
      o.PO4 = x[I.SPO4];
      o.TP = x[I.SPO4] + p.iPSF * x[I.SF] + p.iPSI * x[I.SI] + p.iPXI * x[I.XI] + p.iPXS * x[I.XS] + p.iPBM * bm + x[I.XPP] + x[I.XMeP] / 4.87;
      o.VFA = x[I.SA];
      o.XSTO = x[I.XSTO];
      o.DO = x[I.SO2];
      o.Alk = x[I.SALK] * 50;
      return o;
    }
  });
})();
