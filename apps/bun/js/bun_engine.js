'use strict';
/* ==========================================================================
   THIẾT KẾ XỬ LÝ BÙN THẢI – mã tính (Metcalf & Eddy 5th Ed. Ch.13 – 14)
   Dòng bùn (sơ cấp / sinh học / hóa lý / yếm khí) → cô đặc → ổn định (phân hủy kỵ khí ấm / nóng,
   phân hủy hiếu khí, ổn định vôi) → khử nước → làm khô → bánh bùn; cân bằng chất rắn, nước tách quay về,
   khí sinh học & cân bằng nhiệt, hóa chất, điện năng.
   Hệ số điển hình theo các bảng M&E 5th Ch.13 – 14 (dải ghi kèm từng thông số – chỉnh ở bảng thông số).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BUN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PI = Math.PI;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ceilTo = (x, s) => Math.ceil(x / s - 1e-9) * s;

  /* loại bùn: nồng độ, VSS/TSS điển hình & tải trọng bể nén trọng lực (M&E 5th Ch.13 – bảng cô đặc trọng lực) */
  const KIND = {
    prim: { vi: 'Bùn sơ cấp', en: 'Primary sludge', C: 5, fVS: 0.75, SLR: 120, HLR: 24, Cu: 6 },
    bio: { vi: 'Bùn sinh học dư (WAS)', en: 'Waste activated sludge', C: 0.8, fVS: 0.75, SLR: 30, HLR: 6, Cu: 2.5 },
    chem: { vi: 'Bùn hóa lý (PAC/FeCl₃)', en: 'Chemical sludge', C: 1.5, fVS: 0.40, SLR: 40, HLR: 8, Cu: 3 },
    ana: { vi: 'Bùn dư yếm khí', en: 'Anaerobic excess sludge', C: 4, fVS: 0.70, SLR: 60, HLR: 10, Cu: 5 },
    gran: { vi: 'Bùn hạt hiếu khí (AGS)', en: 'Aerobic granular sludge', C: 1.2, fVS: 0.75, SLR: 50, HLR: 10, Cu: 4 }
  };
  const THICK = {
    none: { vi: 'Không cô đặc', en: 'No thickening' },
    gravity: { vi: 'Bể nén trọng lực', en: 'Gravity thickener', cap: 90, poly: 0 },
    gbt: { vi: 'Cô đặc băng tải (GBT)', en: 'Gravity belt thickener', cap: 95, Cu: 5, poly: 4, hl: 600, kWm: 1.5 },
    daf: { vi: 'Tuyển nổi DAF', en: 'DAF thickener', cap: 95, Cu: 4, poly: 2, slr: 4, kWh: 0.25 },
    centrifuge: { vi: 'Ly tâm cô đặc', en: 'Thickening centrifuge', cap: 92, Cu: 5, poly: 2, kWh: 1.0 },
    drum: { vi: 'Cô đặc trống quay', en: 'Rotary drum thickener', cap: 93, Cu: 6, poly: 5, kWh: 0.15 }
  };
  const STAB = {
    none: { vi: 'Không ổn định', en: 'No stabilisation' },
    mad: { vi: 'Phân hủy kỵ khí ấm (35 °C)', en: 'Mesophilic anaerobic digestion', T: 35 },
    tad: { vi: 'Phân hủy kỵ khí nóng (55 °C)', en: 'Thermophilic anaerobic digestion', T: 55 },
    aed: { vi: 'Phân hủy hiếu khí', en: 'Aerobic digestion' },
    lime: { vi: 'Ổn định bằng vôi (pH ≥ 12)', en: 'Lime stabilisation' }
  };
  const DEW = {
    none: { vi: 'Không khử nước', en: 'No dewatering' },
    belt: { vi: 'Ép băng tải', en: 'Belt filter press', cake: 20, cap: 93, poly: 5, load: 250, kWh: 15 },
    screw: { vi: 'Ép trục vít', en: 'Screw press', cake: 19, cap: 95, poly: 6, load: 150, kWh: 10 },
    centrifuge: { vi: 'Ly tâm khử nước', en: 'Dewatering centrifuge', cake: 23, cap: 95, poly: 8, load: 400, kWh: 60 },
    press: { vi: 'Ép khung bản', en: 'Plate & frame press', cake: 32, cap: 98, poly: 4, load: 0, kWh: 25 },
    beds: { vi: 'Sân phơi bùn', en: 'Sludge drying beds', cake: 40, cap: 95, poly: 0, load: 120, kWh: 0 }
  };
  const DRY = {
    none: { vi: 'Không làm khô', en: 'No drying' },
    solar: { vi: 'Nhà sấy năng lượng mặt trời', en: 'Solar drying', DS: 75 },
    thermal: { vi: 'Sấy nhiệt', en: 'Thermal drying', DS: 90 }
  };
  const DEFAULTS = {
    Q: 10000, TKN: 40, T: 20, Tair: 20, Tground: 20,
    streams: [{ name: 'Bùn sinh học dư', kind: 'bio', M: 1500, C: 0.8, fVS: 0.75 }],
    thick: 'gravity', stab: 'mad', dew: 'belt', dry: 'none', chpOn: 1,
    // cô đặc
    th_cap: 0, th_Cu: 0, th_SLR: 0, th_H: 3.5, th_n: 2, th_poly: 0, th_h: 24, th_days: 7,
    // phân hủy kỵ khí
    ad_SRT: 20, ad_n: 2, ad_HD: 0.6, ad_gas: 0.9, ad_fCH4: 0.65, ad_U: 0.7, ad_Uroof: 1.0, ad_mix: 6, ad_eBoil: 0.85, ad_eCHPe: 0.35, ad_eCHPt: 0.45, ad_fN: 0.07, ad_VSmax: 3.2,
    // phân hủy hiếu khí
    ae_DD: 900, ae_SRT: 0, ae_O2: 2.3, ae_air: 30, ae_H: 5, ae_n: 2, ae_eBl: 0.7,
    // vôi
    li_dose: 0, li_t: 2,
    // khử nước
    dw_cake: 0, dw_cap: 0, dw_poly: 0, dw_h: 8, dw_days: 5, dw_n: 2, dw_load: 0,
    // làm khô
    dr_DS: 0, dr_evap: 900, dr_heat: 0.85, dr_el: 0.07,
    // chung
    truck: 10, p_kwh: 2000, p_poly: 65000, p_lime: 3000, p_haul: 400000
  };

  /* thông số mỗi bước – chỉnh ở bảng thông số; 0 = theo công nghệ */
  function compute(inp) {
    const s = Object.assign({}, DEFAULTS, inp || {});
    const W = [], warn = (lvl, vi, en) => W.push({ lvl, vi, en: en || vi });
    const st = (s.streams || []).filter(x => +x.M > 0).map(x => Object.assign({}, KIND[x.kind] || KIND.bio, x, { M: +x.M, C: +x.C > 0 ? +x.C : (KIND[x.kind] || KIND.bio).C, fVS: +x.fVS > 0 ? +x.fVS : (KIND[x.kind] || KIND.bio).fVS }));
    if (!st.length) return { ok: false, W: [{ lvl: 'crit', vi: 'Chưa có dòng bùn nào (khối lượng > 0).', en: 'No sludge stream with mass > 0.' }] };
    const R = { s, steps: [], rec: [], chem: [], power: [], equip: [] };
    const M0 = st.reduce((a, x) => a + x.M, 0), VS0 = st.reduce((a, x) => a + x.M * x.fVS, 0);
    const Qs0 = st.reduce((a, x) => a + x.M / (x.C * 10), 0);   // m³/d (C % → kg/m³ = 10·C)
    R.feed = { M: M0, VS: VS0, Q: Qs0, C: M0 / Qs0 / 10, fVS: VS0 / M0, streams: st.map(x => ({ name: x.name, kind: x.kind, M: x.M, C: x.C, fVS: x.fVS, Q: x.M / (x.C * 10) })) };
    const pw = (vi, en, kW, h) => { if (kW > 0) R.power.push({ vi, en, kW, h, kWh: kW * h }); };
    let M = M0, VS = VS0, Q = Qs0;          // dòng hiện tại (kg DS/d, kg VS/d, m³/d)
    const step = (key, o) => { R.steps.push(Object.assign({ key }, o)); };
    const recyc = (vi, en, q, tss, nh4) => R.rec.push({ vi, en, Q: q, TSS: tss, NH4: nh4 || 0 });

    /* ---------- 1. Cô đặc (M&E 5th mục 13-? cô đặc trọng lực, GBT, DAF, ly tâm, trống quay) ---------- */
    const TH = THICK[s.thick] || THICK.none;
    if (s.thick !== 'none') {
      const o = { vi: TH.vi, en: TH.en, Min: M, Qin: Q, Cin: M / Q / 10, rows: [] };
      const row = (vi, en, v, u, note) => o.rows.push({ vi, en, v, u, note: note || '' });
      let cap = (s.th_cap > 0 ? +s.th_cap : TH.cap) / 100, Cu;
      if (s.thick === 'gravity') {
        // nồng độ & tải trọng theo hỗn hợp (trung bình khối lượng)
        const SLRmix = M / st.reduce((a, x) => a + x.M / x.SLR, 0), Cmix = M / st.reduce((a, x) => a + x.M / x.Cu, 0), HLRmix = st.reduce((a, x) => a + x.M * x.HLR, 0) / M;
        const SLR = s.th_SLR > 0 ? +s.th_SLR : SLRmix; Cu = s.th_Cu > 0 ? +s.th_Cu : Cmix;
        const A = M / SLR, n = Math.max(1, Math.round(s.th_n)), D = ceilTo(Math.sqrt(4 * A / n / PI), 0.5);
        row('Tải trọng chất rắn thiết kế', 'Design solids loading', SLR, 'kg/m²·ngđ', 'M&E: sơ cấp 90 – 144; WAS 12 – 36; hỗn hợp 25 – 70');
        row('Diện tích bể nén', 'Thickener area', A, 'm²', 'A = M/SLR');
        row('Số bể × đường kính', 'Number × diameter', `${n} × Ø ${D}`, 'm', '');
        row('Tải trọng thủy lực', 'Hydraulic loading', Q / (n * PI * D * D / 4), 'm³/m²·ngđ', `≤ ${HLRmix.toFixed(0)} (M&E)`);
        if (Q / (n * PI * D * D / 4) > HLRmix * 1.2) warn('warn', 'Bể nén: tải trọng thủy lực vượt khuyến cáo – bùn loãng, cân nhắc GBT/DAF cho bùn sinh học.', 'Thickener: hydraulic loading above recommended – dilute sludge, consider GBT/DAF for WAS.');
        row('Chiều sâu công tác', 'Side water depth', s.th_H, 'm', '3 – 4 m');
        o.V = n * PI * D * D / 4 * s.th_H; o.A = n * PI * D * D / 4; o.dims = `${n} × Ø ${D} m, H ${s.th_H} m`;
        R.equip.push({ vi: 'Bể nén bùn trọng lực + cầu gạt', en: 'Gravity thickener + scraper', spec: `Ø ${D} m`, n });
        pw('Cầu gạt bể nén', 'Thickener scraper', 0.75 * n, 24);
      } else {
        Cu = s.th_Cu > 0 ? +s.th_Cu : TH.Cu;
        const h = s.th_h * s.th_days / 7;
        if (s.thick === 'gbt') {
          const Bw = ceilTo(Q / h * 1000 / 60 / TH.hl, 0.5);
          row('Chiều rộng băng (tải thủy lực ' + TH.hl + ' L/m·phút)', 'Belt width (hydraulic ' + TH.hl + ' L/m·min)', Bw, 'm', 'M&E: 400 – 800 L/m·phút');
          R.equip.push({ vi: 'Thiết bị cô đặc băng tải', en: 'Gravity belt thickener', spec: `B = ${Bw} m`, n: 1 });
          pw('Cô đặc băng tải', 'GBT', TH.kWm * Bw + 2, h);
        } else if (s.thick === 'daf') {
          const A = M / 24 / TH.slr;
          row('Diện tích DAF (tải ' + TH.slr + ' kg/m²·h, có polymer)', 'DAF area (' + TH.slr + ' kg/m²·h with polymer)', A, 'm²', 'M&E: 2 – 4 (không hóa chất); đến 10 (có polymer)');
          R.equip.push({ vi: 'Bể DAF cô đặc + bơm hồi lưu bão hòa', en: 'DAF thickener + pressurised recycle', spec: `${A.toFixed(1)} m²`, n: 1 });
          pw('DAF cô đặc', 'DAF thickener', TH.kWh * Q / 24 * 24 / 24 + 3, 24);
        } else {
          const n = Math.max(1, Math.round(s.th_n));
          row('Lưu lượng cấp mỗi máy', 'Feed per unit', Q / h / n, 'm³/h', '');
          R.equip.push({ vi: TH.vi, en: TH.en, spec: `${(Q / h / n).toFixed(1)} m³/h`, n: n + 1 });
          pw(TH.vi, TH.en, TH.kWh * Q / h, h);
        }
      }
      const poly = s.th_poly > 0 ? +s.th_poly : TH.poly;
      if (poly > 0) { R.chem.push({ vi: 'Polymer cô đặc', en: 'Thickening polymer', kg: poly * M / 1000, price: s.p_poly }); row('Polymer', 'Polymer', poly, 'kg/t DS', ''); }
      const Mo = M * cap, Qo = Mo / (Cu * 10), Qr = Math.max(0, Q - Qo);
      row('Hiệu suất thu hồi chất rắn', 'Solids capture', cap * 100, '%', '');
      row('Nồng độ bùn sau cô đặc', 'Thickened sludge concentration', Cu, '% DS', '');
      recyc('Nước tách bể cô đặc', 'Thickener overflow / filtrate', Qr, Qr > 0 ? M * (1 - cap) * 1000 / Qr : 0, 0);
      VS = VS * cap; M = Mo; Q = Qo;
      Object.assign(o, { Mout: M, Qout: Q, Cout: Cu });
      step('thick', o);
    }

    /* ---------- 2. Ổn định bùn ---------- */
    const SB = STAB[s.stab] || STAB.none;
    let gas = null, heat = null;
    if (s.stab === 'mad' || s.stab === 'tad') {
      const o = { vi: SB.vi, en: SB.en, Min: M, Qin: Q, Cin: M / Q / 10, rows: [] };
      const row = (vi, en, v, u, note) => o.rows.push({ vi, en, v, u, note: note || '' });
      const T = SB.T, SRT = +s.ad_SRT, n = Math.max(1, Math.round(s.ad_n));
      if (Q / Math.max(M, 1) * 1000 > 40) warn('warn', 'Bùn vào bể phân hủy loãng (< 2,5 % DS) – thể tích lớn, nên cô đặc trước.', 'Digester feed is dilute (< 2.5 % DS) – large volume, thicken first.');
      const V = Q * SRT, VSL = VS / V;
      row('SRT = HRT thiết kế', 'Design SRT = HRT', SRT, 'ngày', s.stab === 'mad' ? 'M&E: 15 – 20 ngày ở 35 °C (tối thiểu 10)' : 'M&E: 10 – 15 ngày ở 55 °C');
      row('Thể tích bể phân hủy', 'Digester volume', V, 'm³', 'V = Q_bùn·SRT');
      row('Tải trọng VS', 'Volatile solids loading', VSL, 'kg VS/m³·ngđ', 'M&E: 1,6 – 4,8 (thường ≤ ' + s.ad_VSmax + ')');
      if (VSL > s.ad_VSmax) warn('warn', 'Tải trọng VS bể phân hủy cao – tăng SRT hoặc số bể.', 'Digester VS loading high – increase SRT or number of tanks.');
      if (s.stab === 'mad' && SRT < 15) warn('warn', 'SRT < 15 ngày ở 35 °C: nguy cơ ổn định chưa đạt Class B (M&E).', 'SRT < 15 d at 35 °C: Class B stabilisation may not be achieved.');
      const Vd = clamp(13.7 * Math.log(SRT) + 18.9 + (s.stab === 'tad' ? 5 : 0), 30, 70) / 100;
      row('Mức phân hủy VS', 'VS destruction', Vd * 100, '%', 'V_d = 13,7·ln(SRT) + 18,9 (M&E, phân hủy ấm)' + (s.stab === 'tad' ? ' + 5 % (nóng)' : ''));
      const VSd = VS * Vd;
      const Vg = VSd * s.ad_gas, VCH4 = Vg * s.ad_fCH4;
      row('Khí sinh học', 'Biogas', Vg, 'm³/ngđ', s.ad_gas + ' m³/kg VS phân hủy (M&E: 0,75 – 1,12)');
      row('CH₄', 'Methane', VCH4, 'm³/ngđ', 'f_CH₄ = ' + s.ad_fCH4);
      const Egas = VCH4 * 35.85 / 3.6;     // kWh/d (LHV CH₄ 35,85 MJ/m³)
      row('Năng lượng hóa học CH₄', 'Methane energy', Egas, 'kWh/ngđ', '35,85 MJ/m³ CH₄');
      // nhiệt
      const D = ceilTo(Math.pow(4 * (V / n) / (PI * s.ad_HD), 1 / 3), 0.5), Hd = ceilTo(V / n / (PI * D * D / 4), 0.1);
      row('Kích thước mỗi bể', 'Size per tank', `${n} × Ø ${D} × H ${Hd.toFixed(1)}`, 'm', 'H/D ≈ ' + s.ad_HD);
      const Qheat = Q * 1000 * 4.186 * (T - s.T) / 86400;            // kW
      const Awall = n * PI * D * Hd, Aroof = n * PI * D * D / 4, Afloor = Aroof;
      const Qloss = (s.ad_U * Awall * (T - s.Tair) + s.ad_Uroof * Aroof * (T - s.Tair) + 0.6 * Afloor * (T - s.Tground)) / 1000;
      const Qneed = Math.max(0, Qheat) + Math.max(0, Qloss);
      row('Nhiệt gia nhiệt bùn', 'Sludge heating', Qheat, 'kW', 'Q·ρ·c_p·ΔT (M&E VD 13-?)');
      row('Tổn thất nhiệt qua thành – mái – đáy', 'Heat loss walls/roof/floor', Qloss, 'kW', `U = ${s.ad_U} / ${s.ad_Uroof} / 0,6 W/m²·K`);
      const chp = +s.chpOn > 0;
      const Hav = Egas / 24 * (chp ? s.ad_eCHPt : s.ad_eBoil), Eel = chp ? Egas * s.ad_eCHPe : 0;
      row(chp ? 'Nhiệt thu hồi từ máy phát (CHP)' : 'Nhiệt từ lò hơi biogas', chp ? 'Recovered CHP heat' : 'Boiler heat from biogas', Hav, 'kW', chp ? 'η_nhiệt = ' + s.ad_eCHPt : 'η = ' + s.ad_eBoil);
      if (chp) row('Điện phát từ biogas', 'Electricity from biogas', Eel, 'kWh/ngđ', 'η_điện = ' + s.ad_eCHPe);
      if (Hav < Qneed) warn('warn', 'Nhiệt từ biogas không đủ gia nhiệt bể phân hủy – cần nhiên liệu bổ sung hoặc cô đặc bùn hơn.', 'Biogas heat is insufficient for digester heating – add fuel or thicken more.');
      pw('Khuấy trộn bể phân hủy', 'Digester mixing', s.ad_mix * V / 1000, 24);
      pw('Bơm tuần hoàn gia nhiệt', 'Heat exchanger recirculation', 3 * n, 24);
      R.equip.push({ vi: 'Bể phân hủy kỵ khí (mái cố định/nổi) + khuấy', en: 'Anaerobic digester + mixing', spec: `Ø ${D} × ${Hd} m`, n });
      R.equip.push({ vi: chp ? 'Máy phát điện biogas (CHP)' : 'Lò hơi biogas + trao đổi nhiệt', en: chp ? 'Biogas CHP engine' : 'Biogas boiler + heat exchanger', spec: chp ? `${(Eel / 20).toFixed(0)} kWe` : `${Qneed.toFixed(0)} kW`, n: 1 });
      R.equip.push({ vi: 'Bồn chứa khí + đuốc + khử H₂S', en: 'Gas holder + flare + H₂S removal', spec: `${(Vg / 24 * 4).toFixed(0)} m³ (4 h)`, n: 1 });
      // N giải phóng → nước tách
      const NH4rel = VSd * s.ad_fN;   // kg N/d
      row('N giải phóng (NH₄) theo nước tách', 'NH₄-N released to reject water', NH4rel, 'kg N/ngđ', s.ad_fN + ' kg N/kg VS phân hủy');
      gas = { Vg, VCH4, Egas, Eel, NH4rel };
      heat = { Qheat, Qloss, Qneed, Hav };
      VS -= VSd; M -= VSd;
      Object.assign(o, { V, A: Aroof, dims: `${n} × Ø ${D} m, H ${Hd.toFixed(1)} m`, Mout: M, Qout: Q, Cout: M / Q / 10 });
      step('stab', o);
    } else if (s.stab === 'aed') {
      const o = { vi: SB.vi, en: SB.en, Min: M, Qin: Q, Cin: M / Q / 10, rows: [] };
      const row = (vi, en, v, u, note) => o.rows.push({ vi, en, v, u, note: note || '' });
      const Td = Math.max(s.T, 10), SRT = s.ae_SRT > 0 ? +s.ae_SRT : Math.max(s.ae_DD / Td, 15);
      row('SRT thiết kế', 'Design SRT', SRT, 'ngày', `Nhiệt độ × SRT ≥ ${s.ae_DD} ngày·°C (M&E: Class B 40 ngày ở 20 °C, 60 ngày ở 15 °C)`);
      const Vd = clamp(7.2 * Math.log(Td * SRT) - 7, 20, 50) / 100;
      row('Mức phân hủy VS', 'VS destruction', Vd * 100, '%', 'Theo đồ thị VS giảm – ngày·°C (M&E Ch.13)');
      const V = Q * SRT, VSd = VS * Vd, O2 = VSd * s.ae_O2;
      row('Thể tích bể phân hủy hiếu khí', 'Aerobic digester volume', V, 'm³', 'Q·SRT');
      row('Nhu cầu oxy', 'Oxygen requirement', O2, 'kg O₂/ngđ', s.ae_O2 + ' kg O₂/kg VS phân hủy (kể nitrat hóa)');
      const airO2 = O2 / (0.232 * 1.2 * 0.15 * 0.6) / 1440, airMix = s.ae_air * V / 1000;   // m³/phút; SOTE 15 %, α·F 0,6
      const air = Math.max(airO2, airMix);
      row('Khí cấp (max theo O₂ / khuấy trộn ' + s.ae_air + ' m³/10³ m³·phút)', 'Air supply (max of O₂ / mixing)', air, 'm³/phút', airMix > airO2 ? 'Khuấy trộn khống chế' : 'Oxy khống chế');
      // M&E PT (5-77): P = w·R·T₁/(29,7·n·e)·[(p₂/p₁)^0,283 − 1], w = khối lượng khí (kg/s)
      const w = air / 60 * 1.2, p2 = 101.3 + 9.81 * s.ae_H + 15;
      const kW = w * 8.314 * 293.15 / (28.97 * 0.283 * s.ae_eBl) * (Math.pow(p2 / 101.3, 0.283) - 1);
      pw('Máy thổi khí bể phân hủy hiếu khí', 'Aerobic digester blowers', kW, 24);
      row('Công suất máy thổi', 'Blower power', kW, 'kW', '');
      const n = Math.max(1, Math.round(s.ae_n)), A1 = V / s.ae_H / n, B = ceilTo(Math.sqrt(A1 / 2), 0.5), L = ceilTo(A1 / B, 0.5);
      R.equip.push({ vi: 'Bể phân hủy hiếu khí + đĩa khí', en: 'Aerobic digester + diffusers', spec: `${L} × ${B} × ${s.ae_H} m`, n });
      VS -= VSd; M -= VSd;
      Object.assign(o, { V, A: L * B * n, dims: `${n} × (${L} × ${B} × H ${s.ae_H} m)`, Mout: M, Qout: Q, Cout: M / Q / 10 });
      step('stab', o);
    } else if (s.stab === 'lime') {
      const o = { vi: SB.vi, en: SB.en, Min: M, Qin: Q, Cin: M / Q / 10, rows: [] };
      const row = (vi, en, v, u, note) => o.rows.push({ vi, en, v, u, note: note || '' });
      const dose = s.li_dose > 0 ? +s.li_dose : st.reduce((a, x) => a + x.M * ({ prim: 120, bio: 300, chem: 150, ana: 150, gran: 250 }[x.kind] || 200), 0) / M0;
      row('Liều vôi Ca(OH)₂', 'Lime dose Ca(OH)₂', dose, 'g/kg DS', 'M&E: sơ cấp 60 – 170; WAS 210 – 430');
      const Ml = dose * M / 1000;
      row('Vôi tiêu thụ', 'Lime consumption', Ml, 'kg/ngđ', '');
      R.chem.push({ vi: 'Vôi Ca(OH)₂ ổn định bùn', en: 'Lime for stabilisation', kg: Ml, price: s.p_lime });
      const V = Q * s.li_t / 24;
      row('Bể trộn – tiếp xúc (pH ≥ 12, ' + s.li_t + ' h)', 'Mixing/contact tank (pH ≥ 12)', V, 'm³', 'Class B: pH ≥ 12 trong 2 h');
      M += 0.9 * Ml;   // vôi chuyển thành CaCO₃ / Ca(OH)₂ trong bùn
      R.equip.push({ vi: 'Silo vôi + máy pha + bể trộn', en: 'Lime silo, slaker, mixing tank', spec: `${Ml.toFixed(0)} kg/ngđ`, n: 1 });
      pw('Khuấy trộn vôi', 'Lime mixing', Math.max(1, 0.03 * V), 24);
      Object.assign(o, { V, Mout: M, Qout: Q, Cout: M / Q / 10 });
      step('stab', o);
    }

    /* ---------- 3. Khử nước ---------- */
    const DW = DEW[s.dew] || DEW.none;
    let cake = null;
    if (s.dew !== 'none') {
      const o = { vi: DW.vi, en: DW.en, Min: M, Qin: Q, Cin: M / Q / 10, rows: [] };
      const row = (vi, en, v, u, note) => o.rows.push({ vi, en, v, u, note: note || '' });
      const digested = s.stab === 'mad' || s.stab === 'tad';
      const cakeDS = s.dw_cake > 0 ? +s.dw_cake : DW.cake - (digested && s.dew !== 'beds' ? 1 : 0);
      const cap = (s.dw_cap > 0 ? +s.dw_cap : DW.cap) / 100, poly = s.dw_poly > 0 ? +s.dw_poly : DW.poly;
      const h = s.dw_h * s.dw_days / 7;
      if (s.dew === 'beds') {
        const A = M * 365 / (s.dw_load > 0 ? +s.dw_load : DW.load);
        row('Tải trọng sân phơi', 'Bed loading', s.dw_load > 0 ? +s.dw_load : DW.load, 'kg DS/m²·năm', 'M&E: 100 – 160 (bùn đã phân hủy)');
        row('Diện tích sân phơi', 'Drying bed area', A, 'm²', '');
        o.A = A;
        if (!digested) warn('warn', 'Sân phơi bùn chưa ổn định gây mùi – nên ổn định bùn trước.', 'Drying beds with unstabilised sludge cause odour – stabilise first.');
      } else if (s.dew === 'press') {
        const Vc = M / (cakeDS * 10) / 1.1 / 3;   // m³ buồng/mẻ, 3 mẻ/ngày làm việc
        row('Thể tích buồng ép mỗi mẻ (3 mẻ/ngày)', 'Chamber volume per cycle (3 cycles/d)', Vc * 7 / s.dw_days, 'm³', '');
        R.equip.push({ vi: DW.vi, en: DW.en, spec: `${(Vc * 7 / s.dw_days).toFixed(1)} m³/mẻ`, n: Math.max(1, Math.round(s.dw_n)) });
      } else {
        const load = s.dw_load > 0 ? +s.dw_load : DW.load, n = Math.max(1, Math.round(s.dw_n));
        const Mh = M * 7 / s.dw_days / s.dw_h;
        row('Bùn khô cấp mỗi giờ vận hành', 'Dry solids feed per operating hour', Mh, 'kg DS/h', `${s.dw_h} h/ngày × ${s.dw_days} ngày/tuần`);
        if (s.dew === 'belt') { const Bw = ceilTo(Mh / load / n, 0.5); row('Chiều rộng băng mỗi máy (' + load + ' kg/m·h)', 'Belt width per unit', Bw, 'm', 'M&E: 90 – 680 kg/m·h'); R.equip.push({ vi: DW.vi, en: DW.en, spec: `B = ${Bw} m`, n }); recyc('Nước rửa băng ép', 'Belt wash water', 6 * Bw * n * h, 0, 0); }
        else { const cu = Mh / n; row('Công suất mỗi máy', 'Capacity per unit', cu, 'kg DS/h', ''); R.equip.push({ vi: DW.vi, en: DW.en, spec: `${cu.toFixed(0)} kg DS/h`, n: n + (s.dew === 'centrifuge' ? 1 : 0) }); }
      }
      if (poly > 0) { R.chem.push({ vi: 'Polymer khử nước', en: 'Dewatering polymer', kg: poly * M / 1000, price: s.p_poly }); row('Polymer', 'Polymer', poly, 'kg/t DS', ''); }
      pw(DW.vi, DW.en, DW.kWh * M / 1000 / h * 7 / 7, h);
      const Mo = M * cap, Wcake = Mo / (cakeDS / 100) / 1000;   // tấn/ngđ
      row('Hiệu suất thu hồi', 'Solids capture', cap * 100, '%', '');
      row('Độ khô bánh bùn', 'Cake dry solids', cakeDS, '% DS', digested ? 'Bùn đã phân hủy' : '');
      row('Bánh bùn ướt', 'Wet cake', Wcake, 't/ngđ', 'M·η/%DS');
      const Qf = Math.max(0, Q - Wcake / 1.05);
      recyc(s.dew === 'centrifuge' ? 'Nước ly tâm (centrate)' : 'Nước lọc khử nước (filtrate)', s.dew === 'centrifuge' ? 'Centrate' : 'Filtrate', Qf, Qf > 0 ? M * (1 - cap) * 1000 / Qf : 0, gas ? gas.NH4rel * 0.9 : 0);
      M = Mo; Q = Wcake / 1.05;
      cake = { DS: cakeDS, t: Wcake, M: Mo };
      Object.assign(o, { Mout: M, Qout: Q, Cout: cakeDS });
      step('dew', o);
    } else if (gas) recyc('Nước tách bể phân hủy', 'Digester supernatant', 0, 0, gas.NH4rel);

    /* ---------- 4. Làm khô ---------- */
    const DR = DRY[s.dry] || DRY.none;
    if (s.dry !== 'none' && cake) {
      const o = { vi: DR.vi, en: DR.en, Min: M, Qin: Q, Cin: cake.DS, rows: [] };
      const row = (vi, en, v, u, note) => o.rows.push({ vi, en, v, u, note: note || '' });
      const DSo = s.dr_DS > 0 ? +s.dr_DS : DR.DS;
      const Wo = M / (DSo / 100) / 1000, evap = Math.max(0, cake.t - Wo) * 1000;   // kg nước/ngđ
      row('Độ khô sau làm khô', 'Dried solids content', DSo, '% DS', '');
      row('Lượng nước bay hơi', 'Water evaporated', evap, 'kg/ngđ', '');
      if (s.dry === 'solar') { const A = evap * 365 / s.dr_evap; row('Diện tích nhà sấy (' + s.dr_evap + ' kg/m²·năm)', 'Greenhouse area', A, 'm²', 'Khí hậu nhiệt đới 700 – 1.000 kg/m²·năm'); o.A = A; R.equip.push({ vi: 'Nhà sấy năng lượng mặt trời + máy đảo bùn', en: 'Solar dryer + turner', spec: `${A.toFixed(0)} m²`, n: 1 }); pw('Máy đảo bùn, quạt', 'Turner, fans', Math.max(2, A / 1000 * 3), 12); }
      else { const Qth = evap * s.dr_heat; row('Nhiệt cần sấy', 'Drying heat', Qth, 'kWh nhiệt/ngđ', s.dr_heat + ' kWh/kg nước (≈ 3 MJ/kg)'); pw('Máy sấy (điện phụ trợ)', 'Dryer auxiliaries', evap * s.dr_el / 24, 24); R.equip.push({ vi: 'Máy sấy bùn (băng tải / trống)', en: 'Thermal dryer', spec: `${(evap / 24).toFixed(0)} kg H₂O/h`, n: 1 }); o.heat = Qth; }
      cake = { DS: DSo, t: Wo, M, dried: true };
      Q = Wo;
      Object.assign(o, { Mout: M, Qout: Wo, Cout: DSo });
      step('dry', o);
    }

    // tổng hợp
    const recQ = R.rec.reduce((a, x) => a + x.Q, 0), recTSSkg = R.rec.reduce((a, x) => a + x.Q * x.TSS / 1000, 0), recN = R.rec.reduce((a, x) => a + x.NH4, 0);
    R.recTot = { Q: recQ, TSS: recQ > 0 ? recTSSkg * 1000 / recQ : 0, kgTSS: recTSSkg, NH4: recN, NH4conc: recQ > 0 ? recN * 1000 / recQ : 0, Nfrac: s.Q > 0 && s.TKN > 0 ? recN / (s.Q * s.TKN / 1000) : 0 };
    if (R.recTot.Nfrac > 0.15) warn('info', `Nước tách quay về mang ${(R.recTot.Nfrac * 100).toFixed(0)} % tải lượng N đầu vào – cân nhắc xử lý dòng phụ (SHARON/anammox) hoặc điều hòa nước tách.`, `Reject water returns ${(R.recTot.Nfrac * 100).toFixed(0)} % of the influent N load – consider sidestream treatment (SHARON/anammox) or equalising reject water.`);
    R.gas = gas; R.heat = heat;
    R.final = { M, t: cake ? cake.t : M / 1000 / Math.max(M / Q / 1000, 1e-6), DS: cake ? cake.DS : M / Q / 10, m3: cake ? cake.t / (cake.dried ? 0.75 : 1.05) : Q, trucks: cake ? cake.t / s.truck : Q / s.truck };
    R.final.year = R.final.t * 365;
    R.kWhd = R.power.reduce((a, x) => a + x.kWh, 0) - (gas ? gas.Eel : 0);
    R.kWhGross = R.power.reduce((a, x) => a + x.kWh, 0);
    R.chemKg = R.chem.reduce((a, x) => a + x.kg, 0);
    // điện thuần âm (CHP phát dư) bù trừ điện năng của trạm XLNT → khoản tiết kiệm (chi phí âm)
    R.cost = { elec: R.kWhd * s.p_kwh, chem: R.chem.reduce((a, x) => a + x.kg * x.price, 0), haul: R.final.t * s.p_haul };
    R.cost.tot = R.cost.elec + R.cost.chem + R.cost.haul;
    R.cost.perTDS = R.cost.tot / (M0 / 1000);
    R.W = W; R.ok = true;
    return R;
  }
  return { KIND, THICK, STAB, DEW, DRY, DEFAULTS, compute };
});
