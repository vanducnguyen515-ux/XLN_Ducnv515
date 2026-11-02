/* AquaDesign VN – dự án mặc định & hằng số chung (Tùy chọn > Hằng số) */
'use strict';
const DEF = {};

DEF.project = () => ({
  cat: { carbon: DEF.carbon.map(c => Object.assign({}, c)), prec: { Fe: Object.assign({}, DEF.prec.Fe), Al: Object.assign({}, DEF.prec.Al), FeSO4: Object.assign({}, DEF.prec.FeSO4) } },   // danh mục sửa được (Tùy chọn > Hằng số)
  ver: 1,
  project: { name: 'Ví dụ 50.000 PE', author: '', place: '', date: new Date().toISOString().slice(0, 10), note: '' },
  // Tùy chọn > Quy trình
  opt: {
    standard: 'DWA',        // DWA | ME | MSIG (tải lượng, lắng sơ cấp, bể lắng II)
    line: 'CAS',            // CAS (dòng liên tục) | SBR | MBR
    process: 'ND',          // C | N | ND
    dn: 'int',              // pre | int | sim | casc | comb
    nCasc: 2, cascMode: 'eq', combPre: 0.2, guide: 'A131',
    stab: true,             // ổn định bùn hiếu khí đồng thời
    anaerobic: false,       // bể kỵ khí riêng (bio-P)
    selector: false,        // selector hiếu khí dòng lên
    aeration: 'diff',       // diff (khí nén – đĩa/ống màng) | surf (cơ khí bề mặt)
    mixing: 'sep',          // sep (khuấy và sục khí riêng) | comb (kết hợp)
    multiline: true,
    sewer: 'sep',           // sep (riêng) | comb (chung)
  },
  load: {
    mode: 'spec',           // spec | abs
    PE: 50000, xQ: 14.27, ws: 125, infPct: 50, fSQM: 0,   // f_S,QM = 0: tự tính 2·24/x_Qmax (cống chung)
    sp: { BOD: 60, COD: 120, TSS: 70, TKN: 11, P: 1.8, NO3: 0 },
    abs: { Qd: 9375, Qh: 568.19, Qm: 568.19, conc: { BOD: 320, COD: 640, TSS: 373.3, TKN: 58.67, P: 9.6, NO3: 0 } },
    ind: { on: false, Qd: 0, x: 16, conc: { BOD: 0, COD: 0, TSS: 0, TKN: 0, P: 0, NO3: 0 } },
    trade: { on: false, Qd: 0, x: 14, conc: { BOD: 0, COD: 0, TSS: 0, TKN: 0, P: 0, NO3: 0 } },
    qG: 0, AEG: 0,   // nước thải khu thương mại theo diện tích (l/(s·ha), ha) – A 198
    sup: { on: false, mode: 'pct', pct: { BOD: 2, COD: 3, TSS: 3, TKN: 12, P: 8, NO3: 0 }, Qd: 0, conc: { BOD: 500, COD: 1500, TSS: 800, TKN: 600, P: 60, NO3: 0 }, WSbod: 1.0, TS0: 8, TS1: 60, TS2: 250, conc2: { BOD: 690, COD: 2196, TSS: 300, TKN: 1025, P: 86, NO3: 0 }, conc1: { BOD: 4000, COD: 8000, TSS: 300, TKN: 550, P: 12, NO3: 0 } },
    prim: { on: false, tR: 1.0, n: 2, shape: 'rect', H: 3.0, SOR: 40, Lb: 4 },
    peakME: 2.5,
  },
  sst: {
    flow: 'hz',             // hz (dòng ngang) | vt (dòng đứng)
    shape: 'circ',          // circ | rect
    ISV: 100, RV: 0.75, tE: 2.0, rRS: 0.7, qSVmax: 500, qAmax: 1.6, hVhH: 0.4,
    n: 2, D: 0, Dinlet: 0, Htot: 0, slope: 1 / 15, cone: 60, hz226: 1.0, Lin: 0, outlet: 'weir', nPipes: 4, dHole: 0.03,   // bể phễu: góc phễu (°), chiều cao trụ A 226 (m)
    B: 0, L: 0, Hrect: 0,
    gap: 0.5, vE: 1.0, ME_SOR: 16, ME_SLR: 5, // M&E: m3/m2/d, kg/m2/h
    weir: 'two', // one | two
  },
  bio: {
    T: 12,                  // nhiệt độ thiết kế (°C)
    TS: 0,                  // 0 = lấy theo bể lắng II
    tSSfix: 0,              // 0 = tự tính
    SKS: 8, NH4e: 0, NO3e: 6, NorgE: 2, Pe: 1.0,
    PF: 0, fNsel: 0, SNH4ctl: 5,
    fA: 0.3, fB: 0, fCOD: 0.25, Y: 0.67, b: 0.17, fS: 0.05,   // f_B = 0: tự chọn 0,3 / 0,2 (có lắng sơ cấp) – A 131:2016
    pChem: false, prec: 'Fe', beta: 1.5, pBio: false, XPBM: 0.005, XPBio: 0,   // 0 = tự chọn theo A 131 (0,01 có bể kỵ khí; 0,005 không)
    fMil: 1, anShape: 'rect',
    extC: false, extType: 0, cDWA: false, dosPt: 'post', dnMax: 0.6, dnFix: 0,   // dnFix > 0: V_D/V_BB chọn (≥ yêu cầu)
    tRan: 1.0, nAn: 1,
    selBR: 10, nSel: 1,   // Handbook 7.9.2: 10 kg BOD₅/(m³·d)
    fiStab: 0.2, fBstab: 0.62,
  },
  at: {
    type: 'rect',           // rect | circ | ring (bể kết hợp quanh bể lắng) | ditch (mương ôxy hóa / carrousel)
    n: 2, H: 5.0, B: 0, L: 0, D: 0, W: 0, tWall: 0.3, dWL: 0.1, lanes: 2,
  },
  aer: {
    diff: 'disc',           // disc | tube | plate
    alpha: 0, beta: 1.0, Cx: 2.0, hNN: 50, Tmin: 10, Tmax: 20,
    // trường hợp tải DWA-M 229-1 (Handbook 7.9.6): 0 thiết kế, 1 trung bình, 2 lớn nhất (quyết định), 3 nhỏ nhất, 4 dự báo, 5 tự do; T = 0 → tự động (T_tk / (T_min+T_max)/2 / T_max / … / T_min); Cx, α = 0 → giá trị chung
    lcMode: 'M229', lc3: 'a', lc: [0, 1, 2, 3, 4, 5].map(i => ({ on: i !== 5, T: 0, load: [1, 0.8, 1, 0.8, 1, 1][i], Cx: 0, alpha: 0 })), dz: 0.3, dpLoss: 150,
    SSOTR: 19, qDiff: 0, nBlow: 0, nBlowSb: 1, blowerId: '', nMix: 0, mixId: '', wMix: 2.5,
    surfSAE: 1.8, surfType: 'sae', OB226: 0, SSOTRop: 0, nSurf: 0, fsel: true, dpSuction: 20, Tair: 30, phi: 0.6, dTroom: 10,
    lattices: 0, latDist: 1.0, nHeader: 0, grade: 0, spacing: 0, wallDist: 0.5, tubeSeg: 2.0, mixGroup: 1, diffId: '', ssotrSrc: 'manual',   // Handbook 7.9.7; ssotrSrc: manual | db (SSOTR theo sản phẩm đĩa/ống – AD 9.2)
  },
  rs: {
    type: 'cent',           // cent | screw | air
    nP: 0, nSb: 1, pumpId: '', H: 4.0, nRZ: 0, RZsel: 0, rzPumpId: '',
    esH: 8, esNP: 0, esPumpId: '', esHours: 16,
  },
  sbr: {
    n: 2, tZ: 6, tZrain: 4, H: 5.5, TS: 4.0, tFill: 0.5, tAn: 0, tSed: 1.0, tDec: 1.0, tIdle: 0,
    hSafe: 0.5, shape: 'rect', B: 0, L: 0, D: 0, nFeed: 1, buffer: false, mode: 'std', fOx: 1.15, settle: 'M210', tFlock: 0.17,   // settle: M210 (đường lắng hàm mũ, lớp nước trong ≥ 0,15·H_W & ≥ 0,4 m) | simple
  },
  mbr: {
    TS: 10, place: 'ext',   // ext (bể màng riêng) | in (đặt trong bể)
    flux: 18, moduleId: '', nTrains: 2, SADm: 0.3, TMP: 0.25, Hmb: 3.5, recir: 4, alpha: 0.55, activeMB: true,
    O2cfSp: 2.5, creditCF: false, hAbove: 0.10, hBelow: 0.30, hTrans: 2.0, hLoss: 0.5,   // Handbook 7.10: O₂ khí rửa 2,5 g/(Nm³·m); nước trên/dưới màng; cột áp vận chuyển & tổn thất bơm thấm
    cfBlowerId: '', permPumpId: '', nPermSb: 1, tFilt: 9, tRelax: 1,   // AD 9.1: máy thổi khí rửa & bơm thấm từ ngân hàng; chu kỳ lọc – nghỉ (phút)
    vendor: 'generic',      // generic | kubota
    tSSmin: 15,             // tuổi bùn tối thiểu MBR (d)
    kub: { model: 'KB-RW400', fluxAvg: 20, fluxPk: 35, tOn: 9, tOff: 1, mode: 'gravity', hG: 1.5, TMPk: 10, SADm: 0, cipL: 5, cipN: 4, cipC: 5000, gap: 0.6, perRow: 0, MLSS: 12 },
  },
  // ICEAS (Sanitaire/Xylem) – thiết kế theo SRT, trình tự 10 bước (cùng Thiết kế XLNT); bùn & N theo DWA-A 131
  ic: {
    nb: 2, feed: 'cont', cycle: 'auto', on: 96, off: 72, set: 60, dec: 60, on_s: 72, off_s: 54, set_s: 45, dec_s: 45,
    SRT: 0, SRTset: 5, MLSSmax: 5000, kw: 0, fAmin: 0.3, TWL: 5.0, BZ: 0.9, LW: 2, WLR: 1.86, WLRs: 2.32, SFws: 0.0085, SPT: 10,
    MI: 2.3, HL: 6.9, pre: 0.15, TESS: 10, Pmix: 8,
  },
  // C-Tech (SFC Environmental) – trình tự Basic Engineering Package
  ct: {
    N: 4, MLSS: 4500, FM: 0.135, VR: 0.7, TFA: 1.5, TS: 0.75, TD: 0.75, dH: 2.4, L: 0, TWLmax: 5.7, LB: 1.36, fb: 0.5,
    R: 0.25, tsel: 55, nsel: 6, selFMmin: 1, selFMmax: 6, kw: 0, TFA_s: 0, TS_s: 0, TD_s: 0, Y: 0.59, kO: 1.2, eDN: 0.75, hd: 0.25, hsup: 0.5, nBl: 2, nBlSb: 2, BODout: 20, tSAS: 10, Cs: 0.008,
  },
  grit: { on: false, type: 'aer', n: 2, vh: 0.2, tR: 10, BT: 0.8, grease: true, qAir: 0.8, airMode: 'atv', slopeDeg: 40, sandSp: 20, greaseSp: 6, Dv: 0, dSump: 0.8, tRdry: 40, tRrain: 25, vIn: 0.6, vOut: 0.5, extract: 'airlift', qExt: 30, qClass: 30, hLift: 1.5, lLift: 10 },
  sludge: {
    thick: { on: false, tR: 2, TS: 50, n: 1, H: 4, mode: 'mix', TSps: 60, TSus: 60, drive: 'rake', pcPump: false },   // Handbook 11.1: t_R 2,0 d; TS 5 %
    tank: { on: true, t: 90, TS: 50, n: 1, D: 0, wMix: 30 },
    dig: { on: false, tR: 20, T: 37, gasSp: 0.45, oTS: 0.67, deg: 0.45, kWhgas: 6.5, etaEl: 0.33, etaTh: 0.50, heatSelf: 0.3, down: 0.05, H2D: 1.0 },   // Handbook 11.3
    aerob: { on: false, mode: 'meso', tR: 20, TS: 35, OC: 2.2, alpha: 0.3 },
    dew: { on: false, TS: 32 },
    balance: { remover: 'scraper' },
  },
  comp: { inletPS: true, intPS: false, scum: true, channelClean: false, ventilation: true, screenC: true, screenF: true, grit: true, primary: false, flowMeter: true, uv: false, dewat: false, chem: true, opBuilding: true,
    meas: { DO: true, NH4: true, NO3: true, PO4: false, MLSS: true, Q: true, level: true, pH: true, temp: true } },
  // MSIG (Malaysia) – giới hạn bể lắng tham khảo (sửa trong Hằng số; đối chiếu MSIG Vol. IV 2009)
  // MSIG Vol. IV (3rd ed. 2009, SPAN) – theo trích đoạn bảng thiết kế (tìm 10/2026): lắng II SOR ≤ 30 m³/(m²·d) & HRT ≥ 2 h ở Q_peak; lắng sơ cấp SOR < 45 m³/(m²·d), máng tràn < 150 m³/(m·d) ở Q_peak.
  // SLR, máng tràn lắng II và HRT lắng sơ cấp chưa tìm được trong nguồn – giá trị tham khảo, cần đối chiếu bản gốc. kPeak: hệ số công thức đỉnh 4,7·(PE/1000)^−0,11 (MSIG 2009; bản 2025 được cho là 3,4 – chưa xác nhận)
  msig: { sstSOR: 30, sstSLR: 150, sstHRT: 2.0, sstWLR: 150, primSOR: 45, primHRTmin: 1.5, primHRTmax: 2.5, primWLR: 150, kPeak: 4.7 },
  cost: {
    el: 2000, // đ/kWh
    hInlet: 8, Qinlet: 0, etaP: 0.65, pumpType: 'cent', nR: 0.3, otherkWhPE: 3, blowMode: 'mean',   // Handbook 12.2: bơm ly tâm 65 %, trục vít 75 %, airlift 45 %; n_R tần suất mưa (cống chung)
    // thiết bị phụ – công suất kW & giờ chạy h/d (Handbook 12.2)
    mach: { screen: { P: 1.5, h: 6 }, gritBlow: { h: 12 }, airlift: { P: 1.5, h: 2 }, classifier: { P: 0.75, h: 2 }, grease: { P: 0.37, h: 2 }, scraper: { P: 0.75, h: 3 }, sMix: { h: 2 }, sPump: { P: 1.5, h: 0.5 },
      primScr: { P: 0.75, h: 24 }, sstScr: { P: 0.75, h: 24 }, scum: { P: 1.1, h: 2 } },
    // AD 9.1: tính bơm theo năng lượng riêng e_SPEZ [Wh/(m³·m)] (ly tâm 4–6,5; trục vít 5–6,5) và cột áp vận chuyển; nén/tách nước theo Wh/kg TS
    pumpCalc: 'espez',      // espez | power
    espez: { inlet: 4, inter: 6.5, screw: 5, ras: 4, recirc: 4, was: 6.5, ps: 5, raw: 6.5, sup: 5, perm: 5.5, mth: 140, dew: 60 },
    hInter: 7, hRecirc: 0.5, hPS: 5, hRaw: 8, hSup: 5,
    screenPress: true,
    sludgePrice: 600000, screenPrice: 800000, gritPrice: 500000, greasePrice: 800000, screenSp: 16, gritSp: 16, greaseSp: 6,
    staff: 0, salary: 180000000, hd: 8,
    FePrice: 6000, CPrice: 9000, heatPrice: 600, elSell: 1500,
    currency: 'đ',
  },
  build: { above: 0.5, tSlab: 0.4, tWallAT: 0.35, tWallST: 0.3, free: 0.5, spur: 0.5, slope: 60, work: 1.0, gamma: 25, gammaSoil: 18, gammaW: 10, ground: 0.0, phi: 30, eta: 1.1 },
  pipes: { vW: 1.0, vSludge: 1.0, vAir: 12, vSiphon: 0.5 },
  verify: { guide: 'A131', comb: false, shape: 'circ', flow: 'hz', n: 2, D: 30, Din: 5, hEdge: 3.5, slope: 1 / 15, B: 8, L: 40, A: 500, H: 4.0, hCyl: 2.5, hCone: 6, inflowDepth: 0, TS: 3.5, RV: 0.75, ISV: 120, rRS: 0.7 },
  exist: { sstOn: false, Qmz: 0, atOn: false, BOD: 0 },
  // cài đặt báo cáo & chi phí (Handbook 15.2.3)
  settings: { doc: { load: true, grit: true, sst: true, line: true, bio: true, tank: true, aer: true, rs: true, msig: true, hsg: true, sludge: true, pipes: true, o2: true, masses: true, cost: true }, cost: { energy: true, sludge: true, prec: true, staff: true, prod: true } },
  // thuật toán Hochschulgruppe (HSG) – hằng số Handbook 7.7.6 (chỉ i_p, rx thường thay đổi)
  hsg: { on: false, SS: 0, NH4p: 0, NH4m: 1.5, NO3e: 10, calcOut: true, Nanorg: 18, Sf: 0, tC: 5,
    fs: 1.25, fD: 0.75, fi: 0.20, thA: 1.103, thbA: 1.090, thbH: 1.073, fp: 0.60, eta: 0.95, rx: 0, bA: 0.05, bH: 0.17, iB: 0.12, iI: 0.01, ip: 0.03, KN: 0.70, muA: 0.52, yH: 0.75, yA: 0.15 },   // công trình hiện hữu (Handbook 15.2.1)
  done: {},
  variants: [],
});

// danh mục nguồn carbon ngoài – A131 bảng 4 (chất phổ biến)
DEF.carbon = [
  { name: 'Methanol', rho: 790, COD: 1.50, Ydos: 0.45, cap: 0.30, price: 9000 },   // cap: năng lực khử nitrat kg N/kg COD (Handbook 7.5.4)
  { name: 'Ethanol', rho: 780, COD: 2.09, Ydos: 0.42, cap: 0.20, price: 15000 },
  { name: 'Axit axetic', rho: 1060, COD: 1.07, Ydos: 0.42, cap: 0.20, price: 12000 },
  { name: 'Glycerin thô', rho: 1200, COD: 1.10, Ydos: 0.42, cap: 0.20, price: 7000 },
  { name: 'Axit citric', rho: 1240, COD: 0.726, Ydos: 0.42, cap: 0.20, price: 20000 },   // 900 kg COD/m³ (Handbook 7.5.4; Y_dos chưa có trong A 131 Bảng 4 – lấy 0,42)
];

// chất keo tụ – A202
DEF.prec = {
  Fe: { name: 'FeCl3 40 %', M: 55.85, pct: 0.138, rho: 1500, sludge: 6.8 }, // tỉ lệ Fe trong dd (kg Fe/kg dd); ρ 1,50 kg/l (Handbook 15.4)
  Al: { name: 'AlCl3 40 % / PAC', M: 26.98, pct: 0.081, rho: 1500, sludge: 5.3 },   // AlCl3 40 %: 0,4·26,98/133,34
  FeSO4: { name: 'FeSO4 45 %', M: 55.85, pct: 0.165, rho: 1230, sludge: 6.8 },     // 0,45·55,85/151,9
};
