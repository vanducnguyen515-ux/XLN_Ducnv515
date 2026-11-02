'use strict';
/* ==========================================================================
   Giới hạn xả theo QCVN 2025 (hiệu lực 01/9/2025, thay QCVN 14:2008 & QCVN 40:2011) – dùng chung cho SimXLNT, NEREDA, SimNước.
   – QCVN 14:2025/BTNMT (TT 05/2025/TT-BTNMT): Bảng 1 nước thải đô thị, khu dân cư tập trung (theo lưu lượng xả F);
     Bảng 2 nước thải sinh hoạt của dự án đầu tư, cơ sở.
   – QCVN 40:2025/BTNMT (TT 06/2025/TT-BTNMT): Bảng 1 BOD₅, COD, TSS theo F; Bảng 2 thông số khác.
   Cột A/B/C = phân vùng xả theo nguồn tiếp nhận (Mức A/B QCVN 08:2023 hoặc quy định UBND tỉnh); không còn hệ số K, Kq, Kf.
   Chưa xác định phân vùng xả → áp dụng Cột B. T-P tách nguồn tiếp nhận là hồ (ao, đầm) / sông (suối, kênh, rạch, vùng biển).
   Số liệu trùng apps/thietke/js/data.js (qcvn14_2025, qcvn14_2025b, qcvn40_2025).
   ========================================================================== */
const QCVN = (() => {
  const REG = {
    q14b1: {
      name: 'QCVN 14:2025/BTNMT Bảng 1 – nước thải đô thị, KDC tập trung', short: 'QCVN 14:2025 B1', tiers: [2000, 20000],
      t: {
        BOD: [[30, 40, 50], [25, 30, 35], [20, 25, 30]], COD: [[80, 90, 110], [60, 80, 90], [50, 60, 80]], TSS: [[50, 60, 70], [40, 50, 60], [30, 40, 50]],
        NH4: [[4, 8, 10], [4, 8, 10], [4, 8, 8]], TN: [[25, 30, 30], [25, 30, 30], [20, 25, 25]]
      },
      TP: { ho: [[2, 2.5, 3], [2, 2.5, 3], [1.5, 2.5, 3]], song: [[4, 6, 10], [3, 5, 7], [2, 4, 6]] }
    },
    q14b2: {
      name: 'QCVN 14:2025/BTNMT Bảng 2 – nước thải sinh hoạt của dự án, cơ sở', short: 'QCVN 14:2025 B2', tiers: [],
      t: { BOD: [30, 35, 40], COD: [80, 90, 100], TSS: [50, 60, 70], NH4: [6, 8, 10], TN: [25, 30, 40] },
      TP: { ho: [2, 2.5, 3], song: [4, 6, 10] }
    },
    q40: {
      name: 'QCVN 40:2025/BTNMT – nước thải công nghiệp', short: 'QCVN 40:2025', tiers: [2000],
      t: { BOD: [[40, 60, 80], [30, 50, 60]], COD: [[65, 90, 130], [60, 70, 90]], TSS: [[40, 80, 120], [30, 60, 80]], NH4: [5, 10, 12], TN: [20, 40, 60] },
      TP: { ho: [2, 2.5, 3], song: [4, 6, 10] },
      // Bảng 2 – thông số khác dùng cho nước cấp / tái sử dụng (SimNước)
      x: { F: [3, 15, 15], Fe: [2, 10, 10], Mn: [2, 10, 10], Cl: [500, 1000, 1000], Cl2: [1, 2, 2] }
    }
  };
  const COLS = ['A', 'B', 'C'];
  const tierOf = (r, F) => { let i = 0; while (i < r.tiers.length && +F > r.tiers[i]) i++; return i; };
  const pick = (a, tier, col) => (Array.isArray(a[0]) ? a[tier] : a)[col];
  const tierName = (r, i) => !r.tiers.length ? '' : i === 0 ? `F ≤ ${r.tiers[0].toLocaleString('vi-VN')} m³/ngđ` : i === r.tiers.length ? `F > ${r.tiers[i - 1].toLocaleString('vi-VN')} m³/ngđ` : `${r.tiers[i - 1].toLocaleString('vi-VN')} < F ≤ ${r.tiers[i].toLocaleString('vi-VN')} m³/ngđ`;
  // giới hạn một tổ hợp: reg 'q14b1'|'q14b2'|'q40', col 0|1|2 (A/B/C), F m³/ngày (chọn bậc), rcv 'song'|'ho'
  function limits(reg, col, F, rcv) {
    const r = REG[reg], tier = tierOf(r, F || 0), o = {};
    for (const [k, a] of Object.entries(r.t)) o[k] = pick(a, tier, col);
    o.TP = pick(r.TP[rcv === 'ho' ? 'ho' : 'song'], tier, col);
    if (r.x) for (const [k, a] of Object.entries(r.x)) o[k] = a[col];
    o.name = `${r.short} cột ${COLS[col]}${r.tiers.length ? ' · ' + tierName(r, tier) : ''} · nguồn tiếp nhận ${rcv === 'ho' ? 'hồ' : 'sông'}`;
    return o;
  }
  // danh sách tổ hợp (bậc lưu lượng chọn theo F; F không có → liệt kê mọi bậc)
  function list(F, regs) {
    const out = [];
    for (const reg of regs || Object.keys(REG)) {
      const r = REG[reg], tiers = F != null ? [tierOf(r, F)] : r.tiers.length ? [...Array(r.tiers.length + 1).keys()] : [0];
      for (const tr of tiers) for (const rcv of ['song', 'ho']) for (let c = 0; c < 3; c++) {
        const Fx = F != null ? F : tr === 0 ? 0 : r.tiers[tr - 1] + 1;
        out.push({ id: `${reg}_${COLS[c]}_${rcv}${F != null ? '' : '_t' + tr}`, reg, col: c, rcv, tier: tr, v: limits(reg, c, Fx, rcv) });
      }
    }
    return out;
  }
  return { REG, COLS, limits, list, tierOf, tierName };
})();
