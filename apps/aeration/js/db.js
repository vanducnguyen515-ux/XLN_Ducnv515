// Aeration Design Tool – cơ sở dữ liệu kỹ thuật
// Nguồn: Sanitaire Diffused Air Design Guide; Xylem Aeration Handbook 2018; Sanitaire Aeration
// Products 460; Sanitaire TurboMAX data sheet 2468; TurboLIGHT 2628; Xylem Blower Technology
// Comparison 2021; Xylem Guide to Blowers; Metcalf & Eddy (vận tốc ống khí). Giá trị "tham khảo"
// cần được nhà sản xuất xác nhận cho từng dự án.
'use strict';
var DB = {};

// ---- Loại nước thải: alpha theo công nghệ, beta, ghi chú (tham khảo) ----
DB.water = {
  dom:   { name: 'Nước thải sinh hoạt / đô thị', en: 'Domestic / municipal wastewater', a_fb: 0.55, a_cb: 0.75, a_me: 0.85, beta: 0.95,
           note: 'Sanitaire: α bọt mịn 0,5–0,6; bọt thô 0,7–0,8; cơ khí 0,7–0,95; β 0,95–0,99.' },
  mix:   { name: 'Đô thị có nước thải công nghiệp', en: 'Municipal with industrial wastewater', a_fb: 0.50, a_cb: 0.70, a_me: 0.85, beta: 0.95, note: 'Giá trị tham khảo.' },
  food:  { name: 'CN thực phẩm / bia / sữa', en: 'Food / brewery / dairy industry', a_fb: 0.45, a_cb: 0.70, a_me: 0.80, beta: 0.95, note: 'Giá trị tham khảo – nên đo off-gas.' },
  tex:   { name: 'CN dệt nhuộm (TDS cao)', en: 'Textile dyeing (high TDS)', a_fb: 0.40, a_cb: 0.65, a_me: 0.80, beta: 0.90, note: 'Giá trị tham khảo – chất hoạt động bề mặt giảm α.' },
  paper: { name: 'CN giấy / bột giấy', en: 'Pulp & paper industry', a_fb: 0.40, a_cb: 0.60, a_me: 0.80, beta: 0.95, note: 'Sanitaire: α bọt thô thấp tới 0,5 ở nước thải giấy tải cao.' },
  leach: { name: 'Nước rỉ rác / mặn', en: 'Landfill leachate / saline', a_fb: 0.40, a_cb: 0.60, a_me: 0.80, beta: 0.85, note: 'Giá trị tham khảo – β giảm theo TDS.' },
  sludge:{ name: 'Bùn – phân hủy hiếu khí', en: 'Sludge – aerobic digestion', a_fb: 0.40, a_cb: 0.60, a_me: 0.80, beta: 0.95, note: 'Giá trị tham khảo – nên dùng đĩa LP / bọt thô.' },
  eq:    { name: 'Bể điều hòa / tiền sục khí', en: 'Equalization / pre-aeration tank', a_fb: 0.60, a_cb: 0.80, a_me: 0.90, beta: 0.95, note: 'Giá trị tham khảo.' },
  clean: { name: 'Nước sạch (thử nghiệm)', en: 'Clean water (test)', a_fb: 1.0, a_cb: 1.0, a_me: 1.0, beta: 1.0, note: 'Điều kiện nước sạch.' }
};

// ---- Loại công trình / quá trình: hệ số kg O2/kg BOD (Sanitaire/Xylem handbook) ----
DB.process = {
  cas:   { name: 'Bùn hoạt tính khuấy trộn hoàn toàn (CAS)', en: 'Complete-mix activated sludge (CAS)', kBOD: 1.1, cont: true },
  pf:    { name: 'Bùn hoạt tính dòng đẩy (plug flow)', en: 'Plug-flow activated sludge', kBOD: 1.1, cont: true },
  ea:    { name: 'Sục khí kéo dài / mương oxy hóa', en: 'Extended aeration / oxidation ditch', kBOD: 1.5, cont: true },
  sbr:   { name: 'SBR / ICEAS (mực nước thay đổi)', en: 'SBR / ICEAS (variable water level)', kBOD: 1.4, cont: false },
  mbbr:  { name: 'MBBR / IFAS', en: 'MBBR / IFAS', kBOD: 1.1, cont: true },
  lagoon:{ name: 'Hồ sục khí (đáy đất)', en: 'Aerated lagoon (earthen bottom)', kBOD: 1.3, cont: true },
  dig:   { name: 'Phân hủy bùn hiếu khí', en: 'Aerobic sludge digestion', kBOD: 1.0, cont: true },
  eq:    { name: 'Bể điều hòa / chống lắng', en: 'Equalization / anti-settling tank', kBOD: 0.3, cont: true }
};

// ---- Đĩa / ống / tấm phân phối khí ----
// q* = lưu lượng mỗi phần tử Sm³/h (20 °C, 1 atm); a = diện tích màng hoạt động m²
// SOTE (%/m ngập) = s × (ATAD_ref/ATAD)^b × (q/q_ref)^c  (hiệu chỉnh theo bản in ADA trong handbook)
// DWP (kPa) = d0 + d1·q
DB.diff = {
  disc9:  { name: 'Sanitaire Silver Series II – đĩa màng EPDM 9"', en: 'Sanitaire Silver Series II – 9" EPDM membrane disc', kind: 'fb', a: 0.0383, qmin: 0.85, qmax: 6.8, qpk: 11.9, qdes: 4.5,
            s: 7.0, ATADref: 11.4, qref: 2.23, b: 0.16, c: -0.15, smax: 0.45, d0: 3.0, d1: 0.35, ATADmin: 4, ATADmax: 40,
            sp: 0.33, hs: [0.6, 3.0], len: 0.229, life: 'Màng EPDM 10+ năm (đô thị)', lifeEn: 'EPDM membrane 10+ yr (municipal)', src: 'Handbook tr.33–34; Products 460 tr.6' },
  disc7:  { name: 'Sanitaire Silver Series II – đĩa màng EPDM 7"', en: 'Sanitaire Silver Series II – 7" EPDM membrane disc', kind: 'fb', a: 0.024, qmin: 0.6, qmax: 5.1, qpk: 8.2, qdes: 3.4,
            s: 6.8, ATADref: 11.4, qref: 1.4, b: 0.16, c: -0.15, smax: 0.44, d0: 3.2, d1: 0.45, ATADmin: 4, ATADmax: 40,
            sp: 0.28, hs: [0.5, 3.0], len: 0.178, life: 'Màng EPDM 10+ năm', lifeEn: 'EPDM membrane 10+ yr', src: 'Handbook tr.33' },
  disc9lp:{ name: 'Sanitaire Silver Series II LP – đĩa 9" áp thấp (bùn)', en: 'Sanitaire Silver Series II LP – 9" low-pressure disc (sludge)', kind: 'fb', a: 0.0383, qmin: 1.7, qmax: 20.4, qpk: 42.5, qdes: 12,
            s: 5.6, ATADref: 11.4, qref: 5.0, b: 0.16, c: -0.15, smax: 0.38, d0: 2.2, d1: 0.10, ATADmin: 4, ATADmax: 60,
            sp: 0.33, hs: [0.6, 3.0], len: 0.229, life: 'Phù hợp bùn, ứng dụng nặng', lifeEn: 'Suits sludge, heavy duty', src: 'Handbook tr.33' },
  ceram9: { name: 'Sanitaire đĩa gốm 9" (ceramic)', en: 'Sanitaire 9" ceramic disc', kind: 'fb', a: 0.041, qmin: 0.5, qmax: 5.1, qpk: 8.5, qdes: 3.4,
            s: 6.8, ATADref: 11.4, qref: 1.7, b: 0.16, c: -0.15, smax: 0.44, d0: 2.0, d1: 0.30, ATADmin: 4, ATADmax: 40,
            sp: 0.33, hs: [0.6, 3.0], len: 0.229, life: 'Gốm 20+ năm, làm sạch bằng khí HCl tại chỗ', lifeEn: 'Ceramic 20+ yr, in-situ HCl gas cleaning', src: 'Products 460 tr.7' },
  gold:   { name: 'Sanitaire Gold Series – ống/tấm PU mật độ cao 2286 mm', en: 'Sanitaire Gold Series – 2286 mm high-density PU tube/panel', kind: 'fb', a: 0.30, qmin: 1.1, qmax: 11.0, qpk: 14.0, qdes: 6.0,
            fluxmin: 3.66, fluxmax: 36.6, s: 8.5, ATADref: 6.0, qref: 3.6, b: 0.16, c: -0.12, smax: 0.55, d0: 3.5, d1: 0.20,
            ATADmin: 2.6, ATADmax: 18, sp: 2.45, hs: [0.45, 1.6], len: 2.286, life: 'Màng PU, HDLF', lifeEn: 'PU membrane, HDLF', src: 'Handbook tr.30, 33–34; Products 460 tr.5' },
  tube:   { name: 'Ống màng EPDM 1 m (chung, Ø65)', en: '1 m EPDM membrane tube (generic, Ø65)', kind: 'fb', a: 0.20, qmin: 2.0, qmax: 12.0, qpk: 15.0, qdes: 8.0,
            s: 5.5, ATADref: 15, qref: 6.0, b: 0.16, c: -0.15, smax: 0.38, d0: 3.5, d1: 0.20, ATADmin: 4, ATADmax: 40,
            sp: 1.15, hs: [0.6, 2.5], len: 1.0, life: 'Lưu ý co màng làm lệch kẹp', lifeEn: 'Beware membrane shrinkage shifting clamps', src: 'Handbook tr.28 (mô tả); thông số tham khảo' },
  coarse: { name: 'Sanitaire bọt thô inox wide-band D-24 (610 mm)', en: 'Sanitaire stainless wide-band coarse bubble D-24 (610 mm)', kind: 'cb', a: 0.05, qmin: 17, qmax: 68, qpk: 80, qdes: 45,
            s: 2.0, ATADref: 40, qref: 34, b: 0.05, c: -0.10, smax: 0.15, d0: 0.8, d1: 0.015, ATADmin: 5, ATADmax: 400,
            sp: 0.75, hs: [0.6, 3.0], len: 0.61, life: 'Inox 304/316, không tắc', lifeEn: 'Stainless 304/316, non-clogging', src: 'Products 460 tr.10 (1,6–2,5 %/m)' }
};

// ---- Công nghệ máy thổi khí ----
// eta = hiệu suất dây-tới-khí tại thiết kế (Xylem Technology Comparison 2021: PD 42–62 %, IG 56–68 %,
// maglev 61–70 %, multistage 48–62 %, air bearing 67–71 %); etaSlope: thay đổi theo (p2/p1 − 1);
// kpl: suy giảm hiệu suất tải từng phần η·(1 − kpl·(1−f)²); td = tỷ lệ giảm tải tối thiểu (Qmin/Qmax);
// isen = hiệu suất nén nội bộ dùng tính nhiệt độ khí ra; drive = hiệu suất động cơ+biến tần+truyền động.
DB.blower = {
  lobe:  { name: 'Root PD 3 thùy (rotary lobe) + biến tần', en: '3-lobe rotary PD blower + VFD', eta: 0.62, etaSlope: -0.20, kpl: 0.10, td: 0.40, pmax: 100, qmaxU: 8000,
           isen: 0.60, drive: 0.88, margin: 1.15, noise: 'Cao – cần buồng cách âm', maint: 'Trung bình–nhiều (dầu, dây đai)', capex: 'Thấp nhất',
           noiseEn: 'High – acoustic enclosure needed', maintEn: 'Medium–high (oil, belts)', capexEn: 'Lowest' },
  screw: { name: 'Trục vít PD (screw) + biến tần', en: 'Rotary screw PD blower + VFD', eta: 0.66, etaSlope: -0.08, kpl: 0.12, td: 0.25, pmax: 150, qmaxU: 12000,
           isen: 0.70, drive: 0.90, margin: 1.10, noise: 'Trung bình–cao', maint: 'Trung bình', capex: 'Trung bình',
           noiseEn: 'Medium–high', maintEn: 'Medium', capexEn: 'Medium' },
  ms:    { name: 'Ly tâm nhiều cấp (multistage) – tiết lưu', en: 'Multistage centrifugal – throttled', eta: 0.55, etaSlope: 0, kpl: 0.60, td: 0.60, pmax: 100, qmaxU: 30000,
           isen: 0.70, drive: 0.93, margin: 1.10, noise: 'Trung bình', maint: 'Thấp–trung bình', capex: 'Trung bình',
           noiseEn: 'Medium', maintEn: 'Low–medium', capexEn: 'Medium' },
  ig:    { name: 'Ly tâm 1 cấp hộp số (IGV/VD)', en: 'Single-stage geared centrifugal (IGV/VD)', eta: 0.64, etaSlope: 0, kpl: 0.25, td: 0.45, pmax: 150, qmaxU: 80000,
           isen: 0.80, drive: 0.92, margin: 1.10, noise: 'Cao – cần vỏ cách âm', maint: 'Nhiều (dầu, nước làm mát)', capex: 'Cao',
           noiseEn: 'High – acoustic hood needed', maintEn: 'High (oil, cooling water)', capexEn: 'High' },
  maglev:{ name: 'Turbo tốc độ cao – ổ từ (magnetic bearing)', en: 'High-speed turbo – magnetic bearing', eta: 0.66, etaSlope: 0, kpl: 0.35, td: 0.50, pmax: 150, qmaxU: 45000,
           isen: 0.80, drive: 0.92, margin: 1.05, noise: 'Thấp (có vỏ)', maint: 'Thấp (cần UPS/điều khiển ổ từ)', capex: 'Cao',
           noiseEn: 'Low (enclosed)', maintEn: 'Low (needs UPS/bearing control)', capexEn: 'High' },
  turbo: { name: 'Turbo tốc độ cao – ổ khí (Sanitaire TurboMAX/TurboLIGHT)', en: 'High-speed turbo – air bearing (Sanitaire TurboMAX/TurboLIGHT)', eta: 0.69, etaSlope: 0, kpl: 0.35, td: 0.50, pmax: 150, qmaxU: 45000,
           isen: 0.80, drive: 0.92, margin: 1.05, noise: 'Thấp 68–85 dB(A)', maint: 'Tối thiểu (không dầu)', capex: 'Cao',
           noiseEn: 'Low 68–85 dB(A)', maintEn: 'Minimal (oil-free)', capexEn: 'High' }
};

// TurboMAX – lưu lượng [m³/h @ 1 atm, 20 °C, RH 0 %] theo áp lực xả [kgf/cm²] (data sheet 2468, trang 2)
DB.turbomax = {
  p: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5],
  models: [
    { m: 'MAX20',  kW: 15,  q: [1080, 960, 840, 720, null, null, null, null, null, null, null, null], dim: [800, 1050, 1350], kg: 350 },
    { m: 'MAX30',  kW: 22,  q: [1560, 1380, 1200, 1080, 840, null, null, null, null, null, null, null], dim: [800, 1050, 1350], kg: 350 },
    { m: 'MAX50',  kW: 37,  q: [2820, 2580, 2280, 1980, 1560, 1380, 1260, 1140, null, null, 900, 840], dim: [800, 1100, 1050], kg: 630 },
    { m: 'MAX75',  kW: 56,  q: [4560, 4080, 3300, 2940, 2640, 2400, 2220, 1860, null, null, 1380, 1200], dim: [900, 1500, 1350], kg: 730 },
    { m: 'MAX100', kW: 75,  q: [6420, 5160, 4440, 3960, 3480, 3240, 3000, 2520, 2280, 2220, 2100, 1920], dim: [900, 1500, 1700], kg: 900 },
    { m: 'MAX150', kW: 112, q: [7800, 7320, 6780, 6240, 5520, 4920, 4140, 3720, 3420, 3360, 3180, 2880], dim: [900, 1500, 1700], kg: 950 },
    { m: 'MAX200', kW: 150, q: [10440, 9840, 8880, 7920, 6960, 6480, 5520, 5160, 4560, 4500, 4200, 3840], dim: [1000, 2350, 1900], kg: 1400 },
    { m: 'MAX250', kW: 190, q: [14580, 13020, 11700, 9600, 8700, 8100, 6840, 6240, 5700, 5520, null, null], dim: [1100, 2100, 1950], kg: 1250 },
    { m: 'MAX300', kW: 225, q: [15480, 14520, 13500, 12000, 10800, 9720, 8220, 7500, 6840, 6720, 6360, 5760], dim: [1600, 2300, 2050], kg: 1700 },
    { m: 'MAX400', kW: 300, q: [20880, 19680, 17760, 15840, 13920, 12960, 11040, 10320, 9600, 8700, null, null], dim: [1600, 1900, 2050], kg: 1700 },
    { m: 'MAX500D',kW: 375, q: [29160, 26040, 23400, 19200, 17400, 16200, 13680, 13080, null, null, null, null], dim: [1900, 1900, 2000], kg: 1950 },
    { m: 'MAX600D',kW: 450, q: [30960, 29040, 27000, 24000, 21600, 19440, 16440, 15000, 13680, 13440, 12720, 11520], dim: [2200, 2300, 2250], kg: 3300 },
    { m: 'MAX800D',kW: 600, q: [41760, 39360, 35520, 31680, 27840, 25920, 22080, 20640, null, null, null, null], dim: [2200, 2800, 2250], kg: 3800 }
  ]
};
// TurboLIGHT – lưu lượng [m³/h @ 1 atm, 20 °C, 0 % RH] theo áp lực [barG] (data sheet 2628)
DB.turbolight = {
  p: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  models: [
    { m: 'TLX10', kW: 7.5,   q: [420, 402, 360, 342, 300, null, null], dim: [700, 1150, 1050], kg: 260 },
    { m: 'TLX15', kW: 11.25, q: [780, 750, 660, 570, 480, null, null], dim: [700, 1150, 1050], kg: 260 },
    { m: 'TLX20', kW: 15,    q: [840, 810, 780, 732, 660, null, null], dim: [700, 1150, 1050], kg: 290 },
    { m: 'TLX25', kW: 18.75, q: [1260, 1140, 1050, 960, 810, null, null], dim: [700, 1150, 1050], kg: 290 },
    { m: 'TLX30', kW: 22.5,  q: [1620, 1530, 1440, 1290, 1110, null, null], dim: [700, 1150, 1050], kg: 290 },
    { m: 'TLX40', kW: 30,    q: [2100, 2040, 1920, 1770, 1620, 1320, 1170], dim: [700, 1150, 1050], kg: 300 },
    { m: 'TLX50', kW: 37,    q: [2700, 2580, 2460, 2280, 2070, 1770, 1590], dim: [700, 1150, 1050], kg: 300 }
  ]
};

// ---- Máy sục khí cơ khí (Xylem Aeration Handbook ch.6–8; Products 460 tr.13) ----
// Flygt jet aerator: SOTR tại sâu 4 m (50 Hz), công suất định mức P2; JA112-3085 SOTR cho tại 3 m.
DB.jet = [
  { m: 'JA112-3085', kW: 2.0,  sotr4: 1.83, ej: 1, pump: 'N3085 MT' },
  { m: 'JA112-3102', kW: 3.1,  sotr4: 3.2,  ej: 1, pump: 'N3102 MT' },
  { m: 'JA117-3127', kW: 5.9,  sotr4: 7.5,  ej: 1, pump: 'N3127 MT' },
  { m: 'JA117-3153', kW: 9.0,  sotr4: 11,   ej: 1, pump: 'N3153 MT' },
  { m: 'JA117-3171', kW: 15,   sotr4: 15,   ej: 1, pump: 'N3171 MT' },
  { m: 'JA217-3202', kW: 22,   sotr4: 22,   ej: 2, pump: 'N3202 MT' },
  { m: 'JA317-3202', kW: 37,   sotr4: 40,   ej: 3, pump: 'N3202 LT' }
];
DB.jetDepthExp = 0.7;      // SOTR(h) = SOTR4·(h/4)^0.7 (xấp xỉ đường cong Fig.33–36)
DB.jetThrustPerKW = 33;    // N/kW (handbook: JA112-3085 ≈ 62 N/2 kW; JA117-3153 = 309 N/9 kW)
DB.mechSizes = [1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110];
DB.mech = {
  asp:  { name: 'Máy sục khí hút (aspirating, nổi)', en: 'Aspirating aerator (floating)', sae: 1.0, mix: 20, maxKW: 75, effKW: 22.5, saeLarge: 0.75,
          note: 'Handbook ch.7: 1 kg O2/kWh (≤ 22,5 kW, nước sạch); khuấy trộn 20 W/m³ (bùn hoạt tính).',
          noteEn: 'Handbook ch.7: 1 kg O2/kWh (≤ 22.5 kW, clean water); mixing 20 W/m³ (activated sludge).' },
  surf: { name: 'Máy sục khí bề mặt chậm (Twister)', en: 'Low-speed surface aerator (Twister)', sae: 1.5, mix: 32, maxKW: 110,
          note: 'Handbook ch.8: 1,5–1,8 kg O2/kWh; khuấy trộn 32 W/m³; tạo sol khí, ồn.',
          noteEn: 'Handbook ch.8: 1.5–1.8 kg O2/kWh; mixing 32 W/m³; aerosols, noise.' },
  jet:  { name: 'Flygt jet aerator (bơm chìm + ejector)', en: 'Flygt jet aerator (submersible pump + ejector)', mix: 2.3,
          note: 'Handbook ch.6: SAE 0,5–1,2 kg O2/kWh; lực đẩy yêu cầu ≈ 2,3 N/m³ (suy từ ví dụ MiDS).',
          noteEn: 'Handbook ch.6: SAE 0.5–1.2 kg O2/kWh; required thrust ≈ 2.3 N/m³ (derived from MiDS example).' }
};

// ---- Ống thép không gỉ SCH10S: DN → [OD, ID] mm ----
DB.dn = [
  [50, 60.3, 54.8], [65, 73.0, 66.9], [80, 88.9, 82.8], [100, 114.3, 108.2], [125, 141.3, 134.5], [150, 168.3, 161.5],
  [200, 219.1, 211.6], [250, 273.0, 264.6], [300, 323.9, 314.8], [350, 355.6, 346.0], [400, 406.4, 396.8],
  [450, 457.0, 447.6], [500, 508.0, 496.9], [600, 610.0, 597.3], [700, 711.0, 698.3], [800, 813.0, 800.3],
  [900, 914.0, 901.3], [1000, 1016.0, 1003.3], [1200, 1219.0, 1206.3]
];
// Vận tốc khí khuyến nghị theo DN (Metcalf & Eddy, Table 5-28): [DN_tới, vmin, vmax] m/s
DB.vel = [[75, 6, 9], [250, 9, 15], [610, 14, 20], [1525, 19, 33]];
DB.motors = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160,
  200, 250, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000];

DB.refs = [
  'Sanitaire – Diffused Aeration Design Guide (AOR/SOR, Eq. 1–2, Fig. 3–8).',
  'Xylem – Aeration Handbook: Guidelines for selecting aeration equipment (2018).',
  'Sanitaire – Aeration products for energy efficient biological treatment (460).',
  'Sanitaire – TurboMAX Technical Data Sheet 2468; TurboLIGHT data sheet 2628.',
  'Xylem – Blower Technology Comparison (Connect 2021); Guide to Blowers.',
  'Krall & Pastors – Three Factors you need to Know when Designing Aeration Systems (Xylem).',
  'Capela et al. – Diffuser arrangement & transfer number NT (Water Sci. Tech.).',
  'ASCE – Aeration: Principles and Practice (WQM Library Vol. 11).',
  'Metcalf & Eddy – Wastewater Engineering (vận tốc ống khí, công suất nén đoạn nhiệt).'
];
if (typeof module !== 'undefined') module.exports = DB;
