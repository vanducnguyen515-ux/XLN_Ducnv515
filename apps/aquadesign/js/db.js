/* AquaDesign VN – Ngân hàng thiết bị (danh mục mẫu tự sinh, sửa/thêm được, lưu trong trình duyệt)
   Lưu ý: số liệu là dải điển hình để thiết kế sơ bộ, không phải catalogue của hãng cụ thể. */
'use strict';
const DB = {
  KW: [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315, 355, 400, 500],
  motorUp(kw) { return this.KW.find(x => x >= kw * 1.0001) || Math.ceil(kw / 50) * 50; },
  etaMotor(kw) { return U.interp([[0.37, 0.70], [1.5, 0.80], [4, 0.85], [11, 0.89], [45, 0.935], [110, 0.952], [500, 0.968]], kw); },
  // công suất máy thổi đoạn nhiệt (kW) – Q1 m3/h trạng thái hút, p1/p2 hPa
  blowerPower(Q1, p1, dp, eta = 0.62) {
    const k = 1.4, p2 = p1 + dp;
    return (k / (k - 1)) * p1 * 100 * (Q1 / 3600) * (Math.pow(p2 / p1, (k - 1) / k) - 1) / eta / 1000;
  },
  gen() {
    const d = { blower: [], cent: [], screw: [], mixer: [], diffuser: [], membrane: [], surf: [], perm: [] };
    // máy thổi khí: Roots (≤ 900 mbar, 50–6000 m3/h), trục vít (≤ 1000 mbar), turbo (2000–30000 m3/h, ≤ 1000 mbar)
    const Qs = [60, 100, 150, 220, 300, 400, 520, 650, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6300];
    let i = 0;
    for (const Q of Qs) for (const dp of [400, 600, 800]) {
      const P = this.blowerPower(Q, 1013, dp, 0.58);
      d.blower.push({ id: 'RB' + (++i), type: 'Roots', name: `Roots RB-${Q}/${dp}`, Q, dp, P: +P.toFixed(2), Pn: this.motorUp(P * 1.1), price: Math.round(60e6 + 0.9e6 * Math.pow(Q, 0.85) * (dp / 600)) });
    }
    i = 0;
    for (const Q of [800, 1200, 1800, 2500, 3500, 5000, 7000]) for (const dp of [600, 900]) {
      const P = this.blowerPower(Q, 1013, dp, 0.70);
      d.blower.push({ id: 'SC' + (++i), type: 'Trục vít', name: `Trục vít SC-${Q}/${dp}`, Q, dp, P: +P.toFixed(2), Pn: this.motorUp(P * 1.1), price: Math.round(250e6 + 0.8e6 * Math.pow(Q, 0.88)) });
    }
    i = 0;
    for (const Q of [3000, 4500, 6000, 8000, 10000, 13000, 16000, 20000, 25000, 30000]) for (const dp of [700, 1000]) {
      const P = this.blowerPower(Q, 1013, dp, 0.78);
      d.blower.push({ id: 'TB' + (++i), type: 'Turbo', name: `Turbo TB-${Q}/${dp}`, Q, dp, P: +P.toFixed(2), Pn: this.motorUp(P * 1.08), price: Math.round(900e6 + 0.7e6 * Math.pow(Q, 0.9)) });
    }
    // máy nén nhỏ (khí nâng)
    for (const Q of [15, 25, 40]) for (const dp of [400, 700]) {
      const P = this.blowerPower(Q, 1013, dp, 0.45);
      d.blower.push({ id: 'CP' + Q + dp, type: 'Màng/Vòng xoáy', name: `Máy nén nhỏ CP-${Q}/${dp}`, Q, dp, P: +P.toFixed(2), Pn: this.motorUp(P * 1.15), price: Math.round(15e6 + 0.8e6 * Q) });
    }
    // bơm ly tâm chìm
    i = 0;
    for (const Q of [10, 20, 35, 50, 75, 100, 150, 200, 300, 400, 500, 650, 800, 1000, 1300, 1600, 2000, 2600, 3200])
      for (const H of [4, 8, 12, 18, 25]) {
        const eta = U.interp([[10, 0.45], [100, 0.62], [500, 0.75], [3000, 0.82]], Q);
        const P = 1000 * 9.81 * (Q / 3600) * H / eta / 1000;
        d.cent.push({ id: 'CP' + (++i), name: `Bơm chìm ly tâm ${Q} m³/h – ${H} m`, Q, H, eta: +eta.toFixed(2), P: +P.toFixed(2), Pn: this.motorUp(P * 1.12), price: Math.round(25e6 + 1.6e6 * Math.pow(Q * H, 0.6)) });
      }
    // bơm trục vít Archimedes
    i = 0;
    for (const Q of [100, 200, 350, 500, 750, 1000, 1500, 2000, 3000, 4000]) for (const H of [3, 5, 7]) {
      const eta = 0.72, P = 9.81 * (Q / 3600) * H / eta;
      d.screw.push({ id: 'SP' + (++i), name: `Bơm trục vít D${Math.round(400 + 60 * Math.sqrt(Q))} – ${Q} m³/h – ${H} m`, Q, H, eta, P: +P.toFixed(2), Pn: this.motorUp(P * 1.15), price: Math.round(250e6 + 3e6 * Math.pow(Q * H, 0.55)) });
    }
    // máy khuấy chìm: cánh nhỏ tốc độ cao & cánh lớn tốc độ thấp (công suất hữu ích ~ thrust)
    i = 0;
    for (const [D, kw] of [[260, 0.75], [320, 1.5], [400, 2.2], [480, 3], [580, 4], [620, 5.5], [770, 7.5], [1400, 1.5], [1800, 2.2], [2000, 3], [2300, 4], [2500, 5.5], [2500, 7.5], [2600, 11], [2600, 15]]) {
      d.mixer.push({ id: 'MX' + (++i), name: `Máy khuấy chìm D${D} – ${kw} kW`, D, Pn: kw, P: +(kw * 0.85).toFixed(2), thrust: Math.round(kw * (D > 1000 ? 420 : 160)), price: Math.round(40e6 + 18e6 * kw + 12000 * D) });
    }
    // đĩa/ống phân phối khí màng
    // SSOTR: cấp ôxy chuẩn riêng điển hình g O₂/(Nm³·m) ở tải tối ưu, phủ đáy ~ 8–15 % (giá trị tham khảo – xin số liệu hãng)
    d.diffuser = [
      { id: 'D9', type: 'disc', name: 'Đĩa màng EPDM 9"', qmin: 1.5, qopt: 3, qmax: 6, A: 0.037, unit: 'm³/h/đĩa', SSOTE: 6.5, SSOTR: 18.5, price: 650000 },
      { id: 'D12', type: 'disc', name: 'Đĩa màng EPDM 12"', qmin: 2, qopt: 5, qmax: 10, A: 0.062, unit: 'm³/h/đĩa', SSOTE: 6.2, SSOTR: 17.5, price: 950000 },
      { id: 'D9S', type: 'disc', name: 'Đĩa màng silicone 9"', qmin: 1.5, qopt: 3.5, qmax: 7, A: 0.037, unit: 'm³/h/đĩa', SSOTE: 6.8, SSOTR: 19.0, price: 900000 },
      { id: 'T1', type: 'tube', name: 'Ống màng EPDM D63 L=1 m', qmin: 2, qopt: 6, qmax: 10, A: 0.18, unit: 'm³/(m·h)', SSOTE: 6.0, SSOTR: 17.0, price: 1200000 },
      { id: 'T75', type: 'tube', name: 'Ống màng EPDM D90 L=0,75 m', qmin: 2, qopt: 5, qmax: 9, A: 0.21, unit: 'm³/(m·h)', SSOTE: 5.8, SSOTR: 16.5, price: 1300000 },
      { id: 'T2PU', type: 'tube', name: 'Ống màng PU D65 L=2 m', qmin: 2, qopt: 5, qmax: 12, A: 0.20, unit: 'm³/(m·h)', SSOTE: 6.6, SSOTR: 19.0, price: 2400000 },
      { id: 'P1', type: 'plate', name: 'Tấm màng PU 1×0,15 m', qmin: 2, qopt: 7, qmax: 14, A: 0.15, unit: 'm³/h/tấm', SSOTE: 7.5, SSOTR: 21.0, price: 3500000 },
      { id: 'P2', type: 'plate', name: 'Tấm màng PU 2×0,25 m', qmin: 5, qopt: 20, qmax: 40, A: 0.50, unit: 'm³/h/tấm', SSOTE: 7.8, SSOTR: 22.0, price: 9500000 },
      { id: 'S1', type: 'strip', name: 'Dải màng 4 × 0,25 m (1 m²)', qmin: 10, qopt: 25, qmax: 40, A: 1.0, unit: 'm³/h/dải (25 m³/(m²·h))', SSOTE: 7.0, SSOTR: 21.0, price: 9000000 },   // Handbook 7.9.7: B_Strip 25 m³/(m²·h)
    ];
    // bơm nước thấm MBR (bơm ly tâm tự mồi / bơm cánh khế quay thuận-nghịch cho rửa ngược)
    i = 0;
    for (const Q of [5, 10, 20, 35, 50, 75, 100, 150, 200, 300, 400, 600, 800, 1000])
      for (const H of [8, 12, 18]) {
        const lobe = Q <= 150, eta = lobe ? U.interp([[5, 0.40], [50, 0.55], [150, 0.62]], Q) : U.interp([[200, 0.68], [1000, 0.78]], Q);
        const P = 9.81 * (Q / 3600) * H / eta;
        d.perm.push({ id: 'PP' + (++i), type: lobe ? 'Cánh khế (đảo chiều)' : 'Ly tâm tự mồi', name: `Bơm thấm ${lobe ? 'cánh khế' : 'ly tâm tự mồi'} ${Q} m³/h – ${H} m`, Q, H, eta: +eta.toFixed(2), P: +P.toFixed(2), Pn: this.motorUp(P * 1.15), price: Math.round(45e6 + 2.2e6 * Math.pow(Q * H, 0.6)) });
      }
    // module màng MBR (dải điển hình theo M 227 & khảo sát thị trường)
    d.membrane = [
      { id: 'HF1', type: 'Sợi rỗng', name: 'Sợi rỗng PVDF – khối 34 m²×48', Afe: 1650, foot: 2.3, H: 2.6, pack: 70, SADm: 0.25, price: 1.15e9 },
      { id: 'HF2', type: 'Sợi rỗng', name: 'Sợi rỗng PVDF – khối 40 m²×64', Afe: 2560, foot: 3.1, H: 2.8, pack: 75, SADm: 0.22, price: 1.7e9 },
      { id: 'FS1', type: 'Tấm phẳng', name: 'Tấm phẳng PES – 2 tầng 1,25 m²×200', Afe: 500, foot: 1.0, H: 3.4, pack: 45, SADm: 0.35, price: 0.42e9 },
      { id: 'FS2', type: 'Tấm phẳng', name: 'Tấm phẳng PVDF – 2 tầng 1,4 m²×400', Afe: 1120, foot: 2.2, H: 3.6, pack: 40, SADm: 0.32, price: 0.9e9 },
      { id: 'HF3', type: 'Sợi rỗng', name: 'Sợi rỗng PVDF – cụm lớn 2880 m²', Afe: 2880, foot: 3.6, H: 2.9, pack: 72, SADm: 0.20, price: 1.85e9 },
    ];
    // Kubota – màng tấm phẳng ngập (CPE, lỗ TB 0,2 µm). Diện tích tấm theo tài liệu Kubota: ES/EK 0,8 m²/tấm,
    // RM/RW 1,45 m²/tấm, SP 10 m²/module (40 phần tử × 0,25 m²). Kích thước & SAD là giá trị tham khảo – xác nhận với Kubota.
    d.membrane.push(
      { id: 'KB-ES200', type: 'Tấm phẳng', vendor: 'Kubota', name: 'Kubota ES200 (1 tầng, 200 tấm × 0,8 m²)', Afe: 160, plates: 200, deck: 1, foot: 1.1, Lu: 0.62, Wu: 1.80, H: 2.1, pack: 60, SADm: 0.55, price: 0.55e9 },
      { id: 'KB-EK400', type: 'Tấm phẳng', vendor: 'Kubota', name: 'Kubota EK400 (2 tầng, 400 tấm × 0,8 m²)', Afe: 320, plates: 400, deck: 2, foot: 1.2, Lu: 0.65, Wu: 1.85, H: 3.5, pack: 80, SADm: 0.35, price: 1.0e9 },
      { id: 'KB-RW400', type: 'Tấm phẳng', vendor: 'Kubota', name: 'Kubota RW400 (2 tầng, 400 tấm × 1,45 m²)', Afe: 580, plates: 400, deck: 2, foot: 1.9, Lu: 0.85, Wu: 2.25, H: 4.2, pack: 85, SADm: 0.30, price: 1.6e9 },
      { id: 'KB-SP600', type: 'Tấm phẳng (module SP)', vendor: 'Kubota', name: 'Kubota SP600 (60 module × 10 m²)', Afe: 600, plates: 60, deck: 2, foot: 1.6, Lu: 0.85, Wu: 1.90, H: 3.6, pack: 110, SADm: 0.22, price: 1.7e9 },
    );
    // máy sục khí bề mặt
    i = 0;
    for (const kw of [5.5, 7.5, 11, 15, 22, 30, 37, 45, 55, 75, 90, 110])
      d.surf.push({ id: 'SA' + (++i), name: `Máy sục khí bề mặt trục đứng ${kw} kW`, Pn: kw, P: +(kw * 0.9).toFixed(1), SAE: 1.8, price: Math.round(120e6 + 9e6 * kw) });
    return d;
  },
  data: null,
  load() {
    try { const s = localStorage.getItem('adv_db'); if (s) this.data = JSON.parse(s); } catch (e) { /* bỏ qua */ }
    const g = this.gen();
    if (!this.data) this.data = g;
    else {
      U.fill(this.data, g);
      // bổ sung thiết bị mặc định mới (phiên bản sau) mà dữ liệu đã lưu chưa có
      for (const k in g) for (const r of g[k]) {
        const o = this.data[k].find(x => x.id === r.id);
        if (!o) this.data[k].push(r); else for (const f in r) if (o[f] === undefined) o[f] = r[f];   // trường mới cho bản ghi cũ
      }
    }
    return this.data;
  },
  save() { try { localStorage.setItem('adv_db', JSON.stringify(this.data)); } catch (e) { /* bỏ qua */ } },
  reset() { this.data = this.gen(); this.save(); },
  find(cat, id) { return (this.data[cat] || []).find(r => r.id === id); },
  // gợi ý thiết bị theo tiêu chí như mô tả trong sổ tay: máy thổi – áp trước, lưu lượng sau
  pickBlower(Q, dp) {
    const c = this.data.blower.filter(r => r.dp >= dp - 1e-9 && r.Q >= Q - 1e-9);
    c.sort((a, b) => (a.dp - b.dp) || (a.Q - b.Q) || (a.P - b.P));
    return c[0] || null;
  },
  pickPump(cat, Q, H) {
    const c = this.data[cat].filter(r => r.H >= H - 1e-9 && r.Q >= Q - 1e-9);
    c.sort((a, b) => (a.H - b.H) || (a.Q - b.Q));
    return c[0] || null;
  },
  pickMixer(Preq, slow = true) {
    let c = this.data.mixer.filter(r => (slow ? r.D >= 1000 : r.D < 1000));
    if (!c.length) c = this.data.mixer;
    c = c.slice().sort((a, b) => a.Pn - b.Pn);
    return c.find(r => r.Pn >= Preq) || c[c.length - 1];
  },
};
