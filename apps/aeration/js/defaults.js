// Aeration Design Tool – dữ liệu mặc định (ví dụ: trạm 10.000 m³/ngày, 2 bể hiếu khí)
'use strict';
var DEF = {
  proj: { name: 'Trạm XLNT – Hệ thống cấp khí bể hiếu khí', code: 'AER-01', client: '', loc: 'Việt Nam', by: '', rev: 'A', date: '' },
  site: { elev: 10, Tair_max: 40, Tair_avg: 28, RH: 80, Tw_sum: 30, Tw_win: 22 },
  water: { type: 'dom', a_fb: 0.55, a_cb: 0.75, a_me: 0.85, F: 0.9, beta: 0.95, theta: 1.024, DO_avg: 2.0, DO_pk: 1.0,
           de_fb: 0.40, de_cb: 0.25, de_jet: 0.30, rhoRel: 1.0 },
  process: 'cas',
  load: { mode: 'loads', Q: 10000, BODin: 220, BODout: 10, TKNin: 40, NH4out: 2, fNsyn: 0.05, sideBOD: 0, sideN: 0,
          kBOD: 1.1, kN: 4.57, dnCredit: true, NO3dn: 15, kDN: 2.86, other: 0, fPk: 1.5, fMin: 0.6,
          AOR_avg: 300, AOR_pk: 450, AOR_min: 180, SOTR_min: 150, SOTR_avg: 300, SOTR_pk: 450 },
  tank: { nBasin: 2, nAerSim: 2, L: 36, W: 12, H: 5.5, Hbwl: 5.5, hDiff: 0.25, freeboard: 0.6, aerHours: 24, wall: 0.3 },
  op: { wMin: 0.25, wAvg: 0.60, wPk: 0.15 },
  grid: { qTarget: 0, Nfix: 0, nGrid: 0, gridLen: 12, gridMaxDiff: 400, wallClr: 0.5, latMin: 0.6, mixFB: 2.2, mixCB: 1.2, gridLoss: 1.0 },
  pipe: { L_bl: 6, K_bl: 3.0, L_main: 40, K_main: 2.5, L_br: 12, K_br: 3.5, dropExtra: 1.5, dropMat: 'Inox 304',
          v_bl: 20, v_main: 18, v_br: 15, v_drop: 15, v_man: 12, v_lat: 10, dpValves: 1.5, dpFoul: 3.0, dnFix: {} },
  blower: { tech: 'turbo', nDuty: 0, nStby: 1, dpInlet: 1.0, airMargin: 1.10 },
  mech: { etaMot: 0.92, vfd: true, lagoon: false },
  heat: { U: 12, Uroom: 10, Lroom: 15, Troom: 40, dTroom: 8, radFrac: 0.03, alphaSS: 17.3e-6, Tinst: 25, jointStroke: 50 },
  econ: { price: 1900, cur: 'đ', co2: 0.6766, hoursNote: '' },
  sel: { tech: 'disc9' }
};
if (typeof module !== 'undefined') module.exports = DEF;
