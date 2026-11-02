'use strict';
/* ==========================================================================
   SimXLNT – Nhập dự án SUMO (.sumo, Dynamita SUMO24) để đối chiếu.
   Tệp .sumo là ZIP: sumoproject.plant (XML sơ đồ: đơn vị + ống nối) và storages
   (bảng TSV, hàng sau "maptoic" = kết quả trạng thái ổn định). Chỉ đọc SỐ LIỆU
   (cấu hình, lưu lượng, nồng độ) – không dùng mã mô hình đã biên dịch của SUMO.

   SUMOIMP.parsePlant(xml) / parseStorages(tsv) / compact(plant, vals): rút gọn
   SUMOIMP.build(cx)  → dự án SimXLNT + P.design (bảng đối chiếu kết quả SUMO)
   SUMOIMP.fromFile(arrayBuffer) → dự án

   Quy đổi đơn vị:
   - CSTR (DO đặt / DO tính, cả sidestream) → cstr; DO tính có sục khí → DO đặt = DO SUMO tính được
   - Side pump / bộ chia tỷ lệ → splitter (lưu lượng nhánh bơm = lưu lượng ổn định của SUMO)
   - bộ gộp dòng → nối trực tiếp (SimXLNT cho phép nhiều ống vào một cửa)
   - bể lắng không thể tích / 3 ngăn (TSS ra cố định) → tách lý tưởng, TSS nước tràn cố định
   - lắng sơ cấp, nén, tách nước → tách lý tưởng, hiệu suất giữ TSS và lưu lượng bùn theo kết quả SUMO
   - bể phân hủy có pha khí → digester (ADM1); MBR → mbr
   - dòng vào, hóa chất châm, và mọi đơn vị chưa hỗ trợ → "biên": dòng ra của chúng thành dòng vào
     trạng thái (state) lấy nguyên kết quả SUMO; dòng vào của chúng thành điểm xả.
   ========================================================================== */
const SUMOIMP = {};

SUMOIMP.STATE = ['SVFA', 'SB', 'SB_mono', 'SB_poly', 'SMEOL', 'CB', 'XB', 'XB_e', 'XSTO', 'SU', 'CU', 'XU', 'XPHA_PAO', 'XPHA_GAO', 'XE', 'XE_ana',
  'XOHO', 'XAHO', 'XCASTO', 'XMEOLO', 'XNITO', 'XAOB', 'XNOB', 'XAMX', 'XAMETO', 'XHMETO', 'XASRO', 'XHSRO', 'XSOO', 'XALGAE',
  'SNHx', 'SNH2OH', 'SNOx', 'SNO2', 'SNO3', 'SN2O', 'SNO', 'SN2', 'SN_B', 'XN_B', 'XN_Be', 'XN_U', 'SPO4', 'XPP', 'SP_B', 'XP_B', 'XP_Be', 'XP_U',
  'SO2', 'SCO2', 'SALK', 'XINORG', 'XSTR', 'XACP', 'XCaCO3', 'XBSH', 'XVivi', 'XFeS', 'XS',
  'XHFO_H', 'XHFO_L', 'XHFO_old', 'XHFO_H_P', 'XHFO_L_P', 'XHFO_H_P_old', 'XHFO_L_P_old',
  'XHAO_H', 'XHAO_L', 'XHAO_old', 'XHAO_H_P', 'XHAO_L_P', 'XHAO_H_P_old', 'XHAO_L_P_old', 'XFeOH', 'XFeP', 'XAlOH', 'XAlP'];
SUMOIMP.COMP = ['Q', 'T', 'pH', 'TCOD', 'SCOD', 'TBOD_5', 'XTSS', 'XVSS', 'TKN', 'TN', 'TP', 'TIN'];
SUMOIMP.RES = ['SO2', 'HRT', 'M_XTSSforSRT', 'OTR', 'Qair_NTP', 'kLaGO2', 'Qpumped', 'V', 'Vliq', 'pH', 'T', 'Qgas_NTP', 'Qbiogas_NTP', 'QCH4_NTP'];
SUMOIMP.KIN = {      // tham số động học SUMO → tham số mô hình SimXLNT (kiểu Sumo) khi khác mặc định
  muOHO: 'muH', bOHO: 'bH', etaOHO_anox: 'etaNOH', KSB_AS: 'KF', KVFA_AS: 'KAH', KO2_OHO_AS: 'KO2H',
  qPAO_PHA: 'qPHA', bCASTO: 'bPAO', muCASTO: 'muPAO', bPP_ana: 'bPPana', etaCASTO_anox: 'etaNOP',
  muNITO: 'muA', bNITO: 'bA', KNHx_NITO_AS: 'KNH4A', KO2_NITO_AS: 'KO2A',
  muAOB: 'muA', bAOB: 'bA', KNHx_AOB_AS: 'KNH4A', KO2_AOB_AS: 'KO2A', muNOB: 'muNOB', bNOB: 'bNOB', KNO2_NOB_AS: 'KNO2N', KO2_NOB_AS: 'KO2N',
  muAMX: 'muAMX', bAMX: 'bAMX', qHYD_XB: 'kh', KHYD_AS: 'KX', etaHYD_anox: 'etaNOh', etaHYD_ana: 'etafe', etab_anox: 'etabax', etab_ana: 'etabana', fE: 'fXI'
};

const _r5 = v => { if (!isFinite(v)) return v; if (v === 0) return 0; const a = Math.abs(v); return +v.toPrecision(a < 1e-30 ? 1 : 5); };

/* ---------------------------------------------------------------- đọc XML sơ đồ (regex – chạy được cả trong Node) */
SUMOIMP.parsePlant = function (xml) {
  const attr = (s, k) => { const m = s.match(new RegExp('\\s' + k + '="([^"]*)"')); return m ? m[1] : ''; };
  const ent = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const units = [], pipes = [];
  for (const m of xml.matchAll(/<procunit\s[^>]*>/g)) {
    const s = m[0];
    units.push({ id: attr(s, 'id'), name: ent(attr(s, 'name')), label: ent(attr(s, 'label')), cls: ent(attr(s, 'class')), x: +attr(s, 'centerx') || 0, y: +attr(s, 'centery') || 0 });
  }
  for (const m of xml.matchAll(/<pipe\s[^>]*>/g)) {
    const s = m[0];
    pipes.push({ id: attr(s, 'id'), name: ent(attr(s, 'name')), label: ent(attr(s, 'label')), dst: attr(s, 'inputunit'), dconn: attr(s, 'inputconn'), src: attr(s, 'outputunit'), sconn: attr(s, 'outputconn') });
  }
  const gm = xml.match(/<plantdefinition\s[^>]*globalmodel="([^"]*)"/);
  return { model: gm ? gm[1] : '', units, pipes };
};

/* ---------------------------------------------------------------- đọc storages: hàng có cờ Sumo__InSteady = 1 (ưu tiên hàng sau "maptoic");
   nếu tệp không lưu trạng thái ổn định (ví dụ chỉ chạy động: SBR, hồ, lưu vực…) → hàng cuối mô phỏng động dài nhất, đánh dấu __steady = 0 */
SUMOIMP.parseStorages = function (txt) {
  const L = txt.split(/\r?\n/), hdr = L[0].split('\t').map(h => h.split('|')[0]);
  const iT = hdr.indexOf('Sumo__Time'), iS = hdr.indexOf('Sumo__InSteady');
  const rows = []; let lab = '';
  for (let i = 1; i < L.length; i++) {
    const c = L[i].split('\t');
    if (c.length < hdr.length / 2) { lab = c[0].trim(); continue; }
    rows.push({ lab, c, t: iT >= 0 ? +c[iT] / 86400000 : 0, ss: iS >= 0 && +c[iS] === 1 });
  }
  if (!rows.length) throw new Error('Tệp storages không có kết quả');
  const row = rows.find(r => r.ss && r.lab === 'maptoic') || rows.find(r => r.ss) ||
    rows.filter(r => r.lab !== 'startbutton' && r.lab !== 'maptoic').sort((a, b) => b.t - a.t)[0] || rows[0];
  const v = {};
  for (let i = 0; i < hdr.length && i < row.c.length; i++) { const x = parseFloat(row.c[i]); if (isFinite(x)) v[hdr[i]] = x; }
  v.__steady = row.ss ? 1 : 0; v.__t = row.t;
  return v;
};

/* ---------------------------------------------------------------- rút gọn: chỉ giữ số liệu cần cho dựng sơ đồ & đối chiếu */
SUMOIMP.compact = function (plant, vals, meta) {
  const ST = new Set(SUMOIMP.STATE), CO = new Set(SUMOIMP.COMP), RS = new Set(SUMOIMP.RES);
  const byName = {};
  for (const k in vals) {
    if (!k.startsWith('Sumo__Plant__')) continue;
    const rest = k.slice(13), i = rest.indexOf('__');
    if (i < 0) continue;
    (byName[rest.slice(0, i)] = byName[rest.slice(0, i)] || []).push([rest.slice(i + 2), vals[k]]);
  }
  const pipeIds = new Set(plant.pipes.map(p => p.id));
  const units = [], pipes = [];
  for (const u of plant.units) {
    if (pipeIds.has(u.id) || +u.id < 0) continue;
    const L = byName[u.name] || [], p = {}, r = {};
    for (const [k, v] of L) {
      if (k.includes('param__')) {
        const kk = k.replace('param__', '');
        if (/_0$/.test(kk) || /^Sumo|__Sumo/.test(kk) || /^(a\d|coeff|pow|div|exp|SSOTE|G[A-Z0-9]+_|e(size|flow|solids)|Price|hcal|Qcal)/.test(kk)) continue;
        p[kk] = _r5(v);
      } else {
        const seg = k.split('__'), last = seg[seg.length - 1], want = RS.has(last) || ST.has(last) || CO.has(last);
        if (seg.length === 1 && want) r[k] = _r5(v);
        else if (last === 'M_XTSSforSRT') r.M_XTSSforSRT = (r.M_XTSSforSRT || 0) + v;          // khối bùn các vùng con (bể lắng 3 ngăn, MBR)
        else if (seg.length === 2 && seg[0] === 'BioReactor' && want && r[last] == null) r[last] = _r5(v);
      }
    }
    if (r.M_XTSSforSRT != null) r.M_XTSSforSRT = _r5(r.M_XTSSforSRT);
    units.push({ id: u.id, name: u.name, label: u.label, cls: u.cls, x: Math.round(u.x), y: Math.round(u.y), p, r });
  }
  for (const pp of plant.pipes) {
    const L = byName[pp.name] || [], c = {};
    for (const [k, v] of L) if (!k.includes('__') && (ST.has(k) || CO.has(k)) && Math.abs(v) > 1e-12) c[k] = _r5(v);
    pipes.push({ name: pp.name, label: pp.label, src: pp.src, sconn: pp.sconn, dst: pp.dst, dconn: pp.dconn, c });
  }
  const kin = {}, mdl = plant.model;
  for (const [k, v] of byName[mdl] || []) { const kk = k.replace(/^param__/, ''); if (SUMOIMP.KIN[kk]) kin[kk] = _r5(v); }
  const pl = {};
  for (const k of ['SRT1', 'SRT2', 'SRT3']) if (isFinite(vals['Sumo__Plant__' + k])) pl[k] = _r5(vals['Sumo__Plant__' + k]);
  return Object.assign({ model: mdl, plant: pl, kin, units, pipes, ss: { steady: vals.__steady !== 0, t: _r5(vals.__t || 0) } }, meta || {});
};

SUMOIMP.fromZip = async function (buf, meta) {
  if (typeof XLSX_READ === 'undefined') throw new Error('Thiếu bộ giải nén ZIP');
  const z = await XLSX_READ.unzip(buf);
  const xml = await z.get('sumoproject.plant'), st = await z.get('storages');
  if (!xml) throw new Error('Tệp .sumo không có sumoproject.plant');
  if (!st) throw new Error('Tệp .sumo chưa có kết quả mô phỏng (storages) – hãy chạy trạng thái ổn định trong SUMO rồi lưu lại');
  return SUMOIMP.compact(SUMOIMP.parsePlant(xml), SUMOIMP.parseStorages(st), meta);
};

/* ---------------------------------------------------------------- quy đổi trạng thái SUMO → biến mô hình SimXLNT */
SUMOIMP.simModel = function (sumoModel) {
  return /^Sumo(2|2S|2C|4N)$/.test(sumoModel) ? 'ASM2dS2' : 'ASM2dS';
};
SUMOIMP.toState = function (c, m, p) {
  const g = k => Math.max(+c[k] || 0, 0);
  const pool = {
    SO2: g('SO2'),
    SA: g('SVFA'), SF: g('SB') + g('SB_mono') + g('SB_poly') + g('SMEOL'), SI: g('SU'),
    XS: g('CB') + g('XB'), XSE: g('XB_e'), XSTO: g('XSTO'), XE: g('XE'),
    XI: g('XU') + g('CU') + g('XE_ana') + g('XAMETO') + g('XHMETO') + g('XALGAE') + g('XASRO') + g('XHSRO') + g('XSOO'),
    XH: g('XOHO') + g('XAHO') + g('XMEOLO'), XPAO: g('XCASTO'), XPP: g('XPP'), XPHA: g('XPHA_PAO') + g('XPHA_GAO'),
    XAUT: g('XNITO') + g('XAOB'), XNOB: g('XNOB'), XAMX: g('XAMX'),
    SNH4: g('SNHx') + g('SNH2OH'), SNO3: c.SNOx != null ? g('SNOx') : g('SNO3'), SNO2: c.SNOx != null ? 0 : g('SNO2') + g('SNO'),
    SN2: g('SN2') + g('SN2O'), SPO4: g('SPO4'),
    XMeOH: 1.913 * (g('XHFO_H') + g('XHFO_L') + g('XHFO_old')) + 2.889 * (g('XHAO_H') + g('XHAO_L') + g('XHAO_old')) + g('XFeOH') + g('XAlOH'),
    XMeP: 2.70 * (g('XHFO_H_P') + g('XHFO_L_P') + g('XHFO_H_P_old') + g('XHFO_L_P_old')) + 4.52 * (g('XHAO_H_P') + g('XHAO_L_P') + g('XHAO_H_P_old') + g('XHAO_L_P_old')) + g('XFeP') + g('XAlP')
  };
  // độ kiềm: SALK (eq/L hoặc mol/m³) nếu có, nếu không ước từ TIC (SCO2, g C/m³) và pH
  const pH = +c.pH > 0 ? +c.pH : 7.0;
  if (c.SALK != null) pool.SALK = g('SALK') < 0.5 ? g('SALK') * 1000 : g('SALK');
  else if (c.SCO2 != null) { const h = Math.pow(10, -pH), K1 = Math.pow(10, -6.35); pool.SALK = g('SCO2') / 12 * K1 / (K1 + h); }
  else pool.SALK = 5;
  const I = m.idx, has = k => I[k] !== undefined, add = (to, v) => { pool[to] = (pool[to] || 0) + v; };
  // gộp các thành phần mô hình không có
  if (!has('XE')) { add(has('XP') ? 'XP' : 'XI', pool.XE); pool.XE = 0; }
  if (!has('XSE')) { add('XS', pool.XSE); pool.XSE = 0; }
  if (!has('XNOB')) { add('XAUT', pool.XNOB + pool.XAMX); pool.XNOB = pool.XAMX = 0; }
  if (!has('SNO2')) { add('SNO3', pool.SNO2); pool.SNO2 = 0; }
  if (!has('XSTO')) { add('XS', pool.XSTO); pool.XSTO = 0; }
  if (m.fam === 'ASM1') {             // họ ASM1 / ASM3 (không có PAO, P): sinh khối PAO → dị dưỡng, PHA → XS (ASM3: XSTO)
    const o = { SO: pool.SO2, SS: pool.SA + pool.SF, SI: pool.SI, XI: pool.XI, XS: pool.XS, XBH: pool.XH + pool.XPAO, XBA: pool.XAUT, XP: pool.XP || 0,
      SNO: pool.SNO3, SNH: pool.SNH4, SN2: pool.SN2, SALK: pool.SALK, SNO2: pool.SNO2, XNOB: pool.XNOB, XAMX: pool.XAMX };
    if (has('XSTO')) o.XSTO = pool.XPHA + pool.XSTO; else o.XS += pool.XPHA;
    // N hữu cơ hòa tan/hạt theo các biến N của SUMO
    o.SND = g('SN_B'); o.XND = g('XN_B') + g('XN_Be');
    Object.assign(pool, o);
  }
  const out = {};
  for (const cp of m.comps) out[cp.id] = pool[cp.id] != null ? pool[cp.id] : 0;
  // chất rắn vô cơ = XINORG + kết tủa khoáng của SUMO, trừ phần tro đã gán cho sinh khối/XE qua hệ số TSS của mô hình
  // (không khớp theo TSS tổng: COD keo CB/CU của SUMO không tính vào TSS nhưng SimXLNT gộp keo vào XS/XI dạng hạt)
  if (has('XISS')) {
    const prec = g('XSTR') + g('XACP') + g('XCaCO3') + g('XBSH') + g('XVivi') + g('XFeS');
    const ash = p.iINORG != null ? p.iINORG * (out.XH + out.XPAO + out.XAUT + (out.XNOB || 0) + (out.XAMX || 0) + (out.XE || 0)) : 0;
    out.XISS = Math.max((c.XINORG != null ? g('XINORG') : g('XTSS') - g('XVSS')) - ash, 0) + prec;
  }
  for (const k in out) out[k] = _r5(out[k]);
  return out;
};

/* ---------------------------------------------------------------- dựng dự án SimXLNT */
SUMOIMP.KIND = function (cls) {
  if (/raw influent|primary effluent|Influent generator/i.test(cls)) return 'src';
  if (/dosage|^FeCl3$|^Caustic$|^Washwater$|^Alum|^Metal/i.test(cls)) return 'dose';
  if (/^(Sidestream )?CSTR with/i.test(cls)) return 'cstr';
  if (/^Side pump$|flow divider/i.test(cls)) return 'split';
  if (/flow combiner|^Sewer combiner$/i.test(cls)) return 'mix';
  if (/^(Volumeless|Three compartment) clarifier|high efficiency clarifier|A-Stage/i.test(cls)) return 'clar';
  if (/primary|thickener|dewatering/i.test(cls)) return 'sep';
  if (/^Digester with gas phase$/i.test(cls)) return 'dig';
  if (/^MBR with input DO$/i.test(cls)) return 'mbr';
  if (/^MBBR/i.test(cls)) return 'mbbr';
  if (/Upflow BAF/i.test(cls)) return 'baf';
  if (/^Plant effluent$/i.test(cls)) return 'eff';
  if (/^(Sludge|Product) output$/i.test(cls)) return 'sink';
  if (/^(Pipe|FakePipe)$/.test(cls)) return 'pipe';
  if (/Icon$|center$|^CFP|^PlantFactory$|controller|Moving average|blower|^Air connector$|^Meteo/i.test(cls)) return 'aux';
  return 'other';
};
const _SRC_CONN = { pumped: 'a', oflow: 'b', outp: 'out', eff: 'ovf', sludge: 'und', uflow: 'und' };
const _SRC_CONN_MBR = { eff: 'eff', sludge: 'und' };
const _SRC_CONN_BAF = { eff: 'out', outp: 'out', sludge: 'und', backwash: 'und', bw: 'und' };
const _GAS = pp => /^(g|bg)/.test(pp.sconn) || /^(g|bg)inp/.test(pp.dconn);

/* phân loại đơn vị theo lựa chọn dựng sơ đồ: kind (cstr, split, clar, …; 'other' = biên lấy theo kết quả SUMO), prim, sl */
SUMOIMP.classify = function (cx, opt) {
  opt = opt || {};
  const U = {}; cx.units.forEach(u => (U[u.id] = Object.assign({ kind: SUMOIMP.KIND(u.cls) }, u)));
  // lắng sơ cấp: mặc định dùng nguyên nước sau lắng & bùn sơ cấp của SUMO (SUMO chỉ giữ hạt lắng được, COD keo đi qua – bộ tách lý tưởng không phân biệt được)
  if (opt.primary !== 'sim') for (const id in U) if (U[id].kind === 'sep' && /primary/i.test(U[id].cls)) { U[id].kind = 'other'; U[id].prim = 1; }
  // phạm vi mặc định "dây chuyền nước": nén, tách nước, phân hủy và bể xử lý dòng phụ lấy nguyên kết quả SUMO (dòng tuần hoàn về dòng chính
  // là dòng vào trạng thái) → so sánh tách bạch mô hình bùn hoạt tính; opt.scope = 'full' mô phỏng cả dây chuyền bùn (ADM1, tách lý tưởng)
  if (opt.scope !== 'full') {
    // bể "Sidestream CSTR" chỉ thuộc dây chuyền bùn khi nhận dòng (trực tiếp hoặc qua bộ gộp/chia/bể khác) từ nén, tách nước, phân hủy
    const fedBySL = (id, seen) => cx.pipes.some(pp => {
      if (pp.dst !== id || !U[pp.src] || seen.has(pp.src)) return false;
      const s = U[pp.src]; seen.add(s.id);
      if (s.kind === 'dig' || s.kind === 'sep') return true;
      return ['mix', 'split', 'cstr'].includes(s.kind) && fedBySL(s.id, seen);
    });
    const sideSL = new Set(Object.keys(U).filter(id => U[id].kind === 'cstr' && /^Sidestream/i.test(U[id].cls) && fedBySL(id, new Set([id]))));
    for (const id in U) if (U[id].kind === 'dig' || U[id].kind === 'sep' || sideSL.has(id)) { U[id].kind = 'other'; U[id].sl = 1; }
    // lan truyền: đơn vị chỉ nhận dòng từ dây chuyền bùn / dòng phụ (vd. bể lắng của cụm anammox dòng phụ) cũng thuộc dây chuyền bùn
    const srcOf = (pp, seen) => { const s = U[pp.src]; if (!s) return []; if (s.kind !== 'mix' || seen.has(s.id)) return [s]; seen.add(s.id); return cx.pipes.filter(q => q.dst === s.id).flatMap(q => srcOf(q, seen)); };
    for (let it = 0, ch = true; ch && it < 20; it++) {
      ch = false;
      for (const id in U) {
        const u = U[id];
        if (u.sl || !['clar', 'split', 'cstr', 'mbr', 'mbbr', 'baf', 'other'].includes(u.kind)) continue;
        const ss = cx.pipes.filter(pp => pp.dst === id).flatMap(pp => srcOf(pp, new Set()));
        if (ss.length && ss.every(s => s.sl)) { u.kind = 'other'; u.sl = 1; ch = true; }
      }
    }
  }
  return U;
};

SUMOIMP.build = function (cx, opt) {
  opt = opt || {};
  const model = opt.model || SUMOIMP.simModel(cx.model), m = MODELS[model];
  const p20 = Object.assign({}, m.defaults);
  const U = SUMOIMP.classify(cx, opt);
  const pipes = cx.pipes.filter(pp => U[pp.src] && U[pp.dst] && !_GAS(pp));
  const outP = id => pipes.filter(pp => pp.src === id), inP = id => pipes.filter(pp => pp.dst === id);
  const Qof = pp => +pp.c.Q || 0;
  const tss = c => +c.XTSS || 0;
  const vol = p => (+p.Ntrain || 1) * (+p.L_Vtrain || +p.L_VTV || +p.V || 0);
  // tọa độ: co giãn khung SUMO vào vùng vẽ ~ 1150 × 520
  const vis = cx.units.filter(u => !['pipe', 'aux'].includes(U[u.id].kind));
  const xs = vis.map(u => u.x), ys = vis.map(u => u.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = x1 > x0 ? 1100 / (x1 - x0) : 1, sy = y1 > y0 ? 460 / (y1 - y0) : 1, sc = Math.min(sx, sy * 1.6, 2.5);
  const pos = u => [Math.round(60 + (u.x - x0) * sc), Math.round(90 + (u.y - y0) * Math.min(sc, sy))];
  const units = [], links = [], chain = [], notes = [];
  const sid = s => s.replace(/[^A-Za-z0-9_]/g, '').slice(0, 24) || 'U';
  const ids = new Set(), uid = base => { let k = sid(base), i = 2; while (ids.has(k)) k = sid(base) + i++; ids.add(k); return k; };
  const SIMID = {};             // id SUMO → id SimXLNT
  const st = c => ({ [model]: SUMOIMP.toState(c, m, p20) });
  const srcPipes = [];
  const mkState = (name, label, pp, xy) => {
    const id = uid(name); srcPipes.push(pp);
    const c = pp.c, Q = Qof(pp);
    units.push([id, 'influent', label, xy[0], xy[1], { Q: _r5(Q), inf: { mode: 'state', pH: +c.pH > 0 ? +c.pH : 7.2, COD: _r5(+c.TCOD || 0), TKN: _r5(+c.TKN || 0), TP: _r5(+c.TP || 0), TSS: _r5(tss(c)), st: st(c) } }]);
    return id;
  };
  // 1) đơn vị chuyển đổi trực tiếp
  for (const u of cx.units) {
    const k = U[u.id].kind, p = u.p, xy = pos(u), nm = u.label || u.name;
    if (k === 'cstr') {
      const V = vol(p), aerIn = /input DO/i.test(u.cls), qair = +p.Qair_NTP || 0;
      const par = { V: _r5(V), H: +p.htank || 5 };
      if (aerIn) { const sp = +p.DOSP || 0; Object.assign(par, sp > 0 ? { aer: 'do', DOsp: sp, klaMax: 3000 } : { aer: 'none' }); }
      else if (qair > 0) { Object.assign(par, { aer: 'do', DOsp: _r5(Math.max(+u.r.SO2 || 0, 0.02)), klaMax: 3000 }); notes.push(`${nm}: SUMO cấp khí cố định ${fmtN(qair)} Nm³/d, DO tính được ${fmtN(+u.r.SO2)} mg/L → SimXLNT dùng DO đặt bằng giá trị này.`); }
      else par.aer = 'none';
      SIMID[u.id] = uid(u.name); units.push([SIMID[u.id], 'cstr', nm, xy[0], xy[1], par]);
      chain.push({ n: nm, c: `${u.cls}; V = ${fmtN(V)} m³` + (aerIn ? `, DO đặt ${fmtN(+p.DOSP)}` : qair > 0 ? `, khí ${fmtN(qair)} Nm³/d` : ', không sục khí'), sim: 'cstr' });
    } else if (k === 'split') {
      const pump = outP(u.id).find(pp => pp.sconn === 'pumped'), ofl = outP(u.id).find(pp => pp.sconn === 'oflow');
      const qp = pump ? Qof(pump) : +p.Qpumped_target || 0, qo = ofl ? Qof(ofl) : 0;
      SIMID[u.id] = uid(u.name);
      // toàn bộ dòng sang nhánh bơm (nhánh tràn = 0) → chia theo tỷ lệ 1 để không phát sinh lưu lượng âm do sai số
      units.push([SIMID[u.id], 'splitter', nm, xy[0], xy[1], qp > 0 && qo <= 1e-6 * qp ? { mode: 'frac', frac: 1 } : { mode: 'Q', Q: _r5(qp) }]);
      chain.push({ n: nm, c: `${u.cls}; nhánh bơm ${fmtN(pump ? Qof(pump) : +p.Qpumped_target)} m³/d`, sim: 'chia dòng (Q cố định)' });
    } else if (k === 'clar' || k === 'sep' || k === 'mbr') {
      const ins = inP(u.id), outs = outP(u.id);
      const ov = outs.find(pp => pp.sconn === 'eff'), ud = outs.find(pp => pp.sconn === 'sludge' || pp.sconn === 'uflow');
      const qin = ins.reduce((a, pp) => a + Qof(pp), 0), min = ins.reduce((a, pp) => a + Qof(pp) * tss(pp.c), 0);
      const qu = ud ? Qof(ud) : +p.Qsludge_target || 0;
      SIMID[u.id] = uid(u.name);
      if (k === 'mbr') {
        const V = (+p.BioReactor_Ntrain || 1) * (+p.BioReactor_L_Vtrain || 0), sp = +p.BioReactor_DOSP || 2;
        units.push([SIMID[u.id], 'mbr', nm, xy[0], xy[1], { V: _r5(V), H: +p.BioReactor_htank || 5, aer: 'do', DOsp: sp, uMode: 'Q', uQ: _r5(qu) }]);
        chain.push({ n: nm, c: `MBR: V = ${fmtN(V)} m³, DO ${fmtN(sp)}`, sim: 'mbr' });
      } else if (k === 'clar' || (ov && /fixed effluent solids/.test(u.cls))) {
        const e = +p.XTSS_eff_target || (ov ? tss(ov.c) : 10);
        units.push([SIMID[u.id], 'psep', nm, xy[0], xy[1], { rmode: 'eTSS', eTSS: _r5(e), uMode: 'Q', uQ: _r5(qu) }]);
        chain.push({ n: nm, c: `${u.cls}; TSS ra ${fmtN(e)} mg/L, dòng đáy ${fmtN(qu)} m³/d`, sim: 'tách lý tưởng (TSS ra cố định, không thể tích – không phản ứng)' });
      } else {
        const mu = ud ? Qof(ud) * tss(ud.c) : 0, rem = min > 0 ? 100 * mu / min : +p.fXTSS_sludge * 100 || 60;
        units.push([SIMID[u.id], 'psep', nm, xy[0], xy[1], { rmode: 'rem', rem: _r5(Math.min(rem, 100)), uMode: 'Q', uQ: _r5(qu) }]);
        chain.push({ n: nm, c: `${u.cls}; giữ ${fmtN(rem)} % TSS, bùn ${fmtN(qu)} m³/d`, sim: 'tách lý tưởng (hiệu suất theo SUMO; COD keo bị giữ như hạt)' });
      }
    } else if (k === 'mbbr') {
      const V = vol(p), sp = +p.DOSP || 0;
      SIMID[u.id] = uid(u.name);
      units.push([SIMID[u.id], 'mbbr', nm, xy[0], xy[1], Object.assign({ V: _r5(V), H: +p.htank || 5, fill: +p.icarrier || 0.5, SSA: +p.Asp_carrier || 500,
        Lf: _r5((+p.zF || 3e-4) * 1e6), nLay: Math.max(2, Math.round(+p.n || 4)), Lbl: _r5((+p.zBL || 3e-5) * 1e6), XfTSS: _r5((+p.XTSS_spec || 10) / (+p.zF || 3e-4)) },   // mật độ màng = khối lượng riêng theo diện tích / bề dày
        sp > 0 ? { aer: 'do', DOsp: sp, klaMax: 3000 } : { aer: 'none' })]);
      chain.push({ n: nm, c: `MBBR: V = ${fmtN(V)} m³, giá thể ${fmtN((+p.icarrier || 0.5) * 100)} %, ${fmtN(+p.Asp_carrier || 500)} m²/m³, màng ${fmtN((+p.zF || 3e-4) * 1e6)} µm, DO ${fmtN(sp)}`, sim: 'mbbr (màng sinh học nhiều lớp)' });
    } else if (k === 'baf') {
      const V = (+p.Ntrain || 1) * (+p.L_VTV || 0), H = +p.htank || 5, qin = inP(u.id).reduce((a, pp) => a + Qof(pp), 0);
      SIMID[u.id] = uid(u.name);
      units.push([SIMID[u.id], 'baf', nm, xy[0], xy[1], { kind: 'baf', V: _r5(V), H, Hm: _r5(H * (+p.fBV_TV || 0.7)), fill: +p.fBV_TV || 0.6, SSA: +p.Asp_carrier || 500,   // diện tích màng = V·(V lớp vật liệu / V tổng)·diện tích riêng
        cap: _r5((+p.fXTSS_sludge || 0.8) * 100), bw: _r5(qin > 0 ? 100 * (+p.Qbackwash || 0) / qin : 5), aer: (+p.DOSP || 0) > 0 ? 'do' : 'none', DOsp: +p.DOSP || 3, klaMax: 3000,
        Lf: _r5((+p.zF_Top || 2e-4) * 1e6), nLay: Math.max(2, Math.round(+p.Top__n || 4)), Lbl: _r5((+p.zBL_Top || 2e-5) * 1e6), XfTSS: _r5((+p.XTSS_spec_Top || 5) / (+p.zF_Top || 2e-4)) }]);
      chain.push({ n: nm, c: `BAF: V = ${fmtN(V)} m³, DO ${fmtN(+p.DOSP)}`, sim: 'baf (màng sinh học + giữ chất rắn)' });
    } else if (k === 'dig') {
      const V = vol(p), Vg = (+p.Ntrain || 1) * (+p.G_Vheadspace_train || V * 0.1);
      SIMID[u.id] = uid(u.name);
      units.push([SIMID[u.id], 'digester', nm, xy[0], xy[1], { V: _r5(V), Vgas: _r5(Vg), T: +p.T || 35 }]);
      chain.push({ n: nm, c: `Bể phân hủy ${fmtN(V)} m³, ${fmtN(+p.T || 35)} °C`, sim: 'ADM1 (giao diện ASM/ADM của SimXLNT)' });
    } else if (k === 'eff' || k === 'sink') {
      SIMID[u.id] = uid(u.name);
      units.push([SIMID[u.id], k === 'eff' ? 'effluent' : 'sludge', nm, xy[0], xy[1], {}]);
    }
  }
  // 2) biên: dòng vào/hóa chất/đơn vị chưa hỗ trợ → dòng vào trạng thái; dòng vào của đơn vị chưa hỗ trợ → điểm xả
  const resolveDst = (pp, seen) => {             // đích cuối (bỏ qua bộ gộp dòng)
    const d = U[pp.dst];
    if (d.kind === 'mix') { if (seen.has(d.id)) return []; seen.add(d.id); const o = outP(d.id)[0]; return o ? resolveDst(o, seen) : []; }
    return [pp];
  };
  const dstPort = pp => {
    const d = U[pp.dst];
    if (SIMID[d.id]) return SIMID[d.id] + '.in';
    if (!d._sink) {                                // đơn vị chưa hỗ trợ: dòng vào → điểm xả
      d._sink = uid(d.name + '_in');
      const xy = pos(d);
      // điểm xả: dây chuyền bùn / lắng sơ cấp → "bùn thải"; xử lý bậc ba trên đường nước (lọc, khử trùng…) → "nước ra"
      units.push([d._sink, d.sl || d.prim || /sludge|was|uflow/i.test(pp.dconn) ? 'sludge' : 'effluent', (d.label || d.name) + ' (vào – chưa mô phỏng)', xy[0] - 30, xy[1] + 40, {}]);
      if (!chain.some(c => c.n === (d.label || d.name))) chain.push({ n: d.label || d.name, c: d.cls + (d.prim ? ' – dùng nước sau lắng và bùn sơ cấp tính bởi SUMO' : d.sl ? ' – dây chuyền bùn/dòng phụ: dòng ra lấy theo SUMO' : ''), sim: false });
    }
    return d._sink + '.in';
  };
  for (const pp of pipes) {
    const s = U[pp.src];
    if (s.kind === 'mix' || s.kind === 'aux' || s.kind === 'pipe') continue;
    let from;
    if (SIMID[s.id] && !['src', 'dose', 'other'].includes(s.kind)) from = SIMID[s.id] + '.' + ((s.kind === 'mbr' ? _SRC_CONN_MBR : s.kind === 'baf' ? _SRC_CONN_BAF : _SRC_CONN)[pp.sconn] || 'out');
    else {
      // dòng từ biên chỉ cần khi đi vào phần được mô phỏng (bỏ dòng biên → biên, vd. nén → phân hủy đều lấy theo SUMO)
      if (!resolveDst(pp, new Set()).some(fp => SIMID[fp.dst] && !['eff', 'sink'].includes(U[fp.dst].kind))) continue;
      const xy = pos(s), k = s._nsrc = (s._nsrc || 0) + 1;
      const sl = /sludge|uflow|was/i.test(pp.sconn) ? 'bùn' : 'nước';
      const lab = s.kind === 'src' ? 'Dòng vào – ' + (s.label || s.name) : s.kind === 'dose' ? 'Châm – ' + (s.label || s.name)
        : s.prim ? 'Nước sau lắng sơ cấp (SUMO)' : (s.label || s.name) + ' – dòng ' + sl + ' (SUMO)';
      from = mkState(s.name + '_' + pp.sconn, lab, pp, [xy[0] + 20, xy[1] - 40 + 90 * (k - 1)]) + '.out';
      if (s.kind === 'other' && !s._noted) { s._noted = 1; if (!chain.some(c => c.n === (s.label || s.name))) chain.push({ n: s.label || s.name, c: s.cls + (s.prim ? ' – dùng nước sau lắng và bùn sơ cấp tính bởi SUMO' : s.sl ? ' – dây chuyền bùn/dòng phụ: dòng ra lấy theo SUMO' : ''), sim: false }); }
    }
    for (const fp of resolveDst(pp, new Set())) {
      const d = U[fp.dst];
      if (d.kind === 'aux' || d.kind === 'pipe') continue;
      links.push([from, dstPort(fp)]);
    }
  }
  // điểm xả không còn dòng vào (vd. bùn sơ cấp khi lắng sơ cấp lấy theo SUMO) → bỏ
  for (let i = units.length - 1; i >= 0; i--) {
    const [id, type] = units[i];
    if ((type === 'effluent' || type === 'sludge') && !links.some(l => l[1].split('.')[0] === id)) units.splice(i, 1);
  }
  // 3) mục tiêu đối chiếu
  const steady = !cx.ss || cx.ss.steady;
  const T = (k, l, u, v, mm, o) => Object.assign({ k, l, u, v: _r5(v), m: mm, ref: 'SUMO24', btName: steady ? 'kết quả ổn định SUMO24' : 'SUMO24 – cuối mô phỏng động' }, o || {}, steady ? {} : { refOnly: true });
  const targets = [];
  const effU = cx.units.find(u => U[u.id].kind === 'eff');
  let effP = effU ? inP(effU.id)[0] : null, effSink = null, effVia = '';
  // nước ra đi qua đơn vị chưa mô phỏng (lọc bậc ba…): đối chiếu tại dòng vào đơn vị đó (ra khỏi phần được mô phỏng)
  if (effP) {
    let s0 = U[effP.src], pp0 = effP;
    while (s0 && s0.kind === 'mix') { const q = inP(s0.id)[0]; if (!q) break; pp0 = q; s0 = U[q.src]; }
    if (s0 && s0.kind === 'other' && s0._sink) {
      const ip = inP(s0.id).reduce((a, q) => (!a || Qof(q) > Qof(a) ? q : a), null);
      if (ip) { effP = ip; effSink = s0._sink; effVia = ' (vào ' + (s0.label || s0.name) + ')'; }
    }
  }
  if (effP) {
    const c = effP.c, nox = (c.SNOx != null ? +c.SNOx : (+c.SNO3 || 0) + (+c.SNO2 || 0));
    const add = (k, l, u, v, o) => { if (isFinite(v)) targets.push(T(k, l, u, v, 'eff', o)); };
    const lb = effVia;
    add('COD', 'COD ra' + lb, 'mg/L', +c.TCOD, { tol: 5 }); add('BOD5', 'BOD₅ ra', 'mg/L', +c.TBOD_5, { tol: 3 }); add('TSS', 'TSS ra', 'mg/L', tss(c), { tol: 3 });
    add('NH4', 'NH₄-N ra', 'mg/L', (+c.SNHx || 0) + (+c.SNH2OH || 0), { tol: 1 }); add('NOx', 'NOx-N ra', 'mg/L', nox, { tol: 1.5 }); add('TKN', 'TKN ra', 'mg/L', +c.TKN, { tol: 1 });
    add('TN', 'TN ra', 'mg/L', +c.TN, { tol: 2 });
    if (m.fam === 'ASM2d') { add('PO4', 'PO₄-P ra', 'mg/L', +c.SPO4, { tol: 0.5 }); add('TP', 'TP ra', 'mg/L', +c.TP, { tol: 0.5 }); }
  }
  // SRT theo cùng định nghĩa SimXLNT: khối bùn các bể phản ứng (CSTR, MBR) / TSS rời hệ sinh học (bùn dư + nước ra), từ kết quả SUMO
  // hệ bùn hoạt tính = bể phản ứng, bể lắng/MBR + bộ chia nhận dòng từ chúng (bộ chia chỉ nhận dòng biên, vd. tuần hoàn của bể dòng phụ, không tính)
  const BASE = new Set(['clar', 'mbr', 'cstr', 'mbbr', 'baf']);
  const ups = (pp, seen) => { const s = U[pp.src]; if (s.kind !== 'mix' || seen.has(s.id)) return [s]; seen.add(s.id); return inP(s.id).flatMap(q => ups(q, seen)); };
  const ASid = new Set(cx.units.filter(u => BASE.has(U[u.id].kind)).map(u => u.id));
  for (let it = 0, ch = true; ch && it < 20; it++) {
    ch = false;
    for (const u of cx.units) if (U[u.id].kind === 'split' && !ASid.has(u.id) && inP(u.id).some(pp => ups(pp, new Set()).some(s => ASid.has(s.id)))) { ASid.add(u.id); ch = true; }
  }
  const isAS = d => ASid.has(d.id);
  const fin = pp => resolveDst(pp, new Set()).map(fp => U[fp.dst]);
  const sludgeDst = d => d.kind === 'sink' || (d.kind === 'other' && (d.sl || d.prim));
  const mBio = cx.units.filter(u => ['cstr', 'mbr', 'mbbr', 'baf'].includes(U[u.id].kind)).reduce((a, u) => a + (+u.r.M_XTSSforSRT || 0), 0);
  const exitK = pipes.filter(pp => isAS(U[pp.src]) && fin(pp).some(d => !isAS(d))).reduce((a, pp) => a + Qof(pp) * tss(pp.c), 0);
  if (mBio > 0 && exitK > 0 && mBio / exitK > 0.5) targets.push(T('SRT', 'SRT bể sinh học (khối bùn bể / bùn rời hệ, theo kết quả SUMO)' + (cx.plant.SRT1 ? ` – SRT1 SUMO ${fmtN(cx.plant.SRT1)} d` : ''), 'ngày', mBio / exitK, 'plant', { rel: 0.1 }));
  const aerU = cx.units.filter(u => ['cstr', 'mbbr', 'baf'].includes(U[u.id].kind) && (/input DO/.test(u.cls) || U[u.id].kind !== 'cstr' ? +u.p.DOSP > 0 : +u.p.Qair_NTP > 0));
  const Vaer = aerU.reduce((a, u) => a + vol(u.p), 0);
  if (Vaer > 0 && aerU.every(u => u.r.XTSS != null)) targets.push(T('MLSS', 'MLSS bể hiếu khí (TB theo thể tích)', 'mg/L', aerU.reduce((a, u) => a + vol(u.p) * +u.r.XTSS, 0) / Vaer, 'plant', { rel: 0.1 }));
  if (Vaer > 0 && aerU.every(u => u.r.XVSS != null)) targets.push(T('MLVSS', 'MLVSS bể hiếu khí', 'mg/L', aerU.reduce((a, u) => a + vol(u.p) * +u.r.XVSS, 0) / Vaer, 'plant', { rel: 0.1 }));
  const otr = cx.units.filter(u => ['cstr', 'mbbr', 'baf'].includes(U[u.id].kind)).reduce((a, u) => a + Math.max(+u.r.OTR || 0, 0), 0) / 1000;
  if (otr > 0) targets.push(T('OTR', 'O₂ cấp (OTR) các bể', 'kgO₂/d', otr, 'plant', { rel: 0.15 }));
  // bùn dư rời hệ sinh học (ống từ bộ chia/bể lắng/bể phản ứng tới điểm xả bùn hoặc dây chuyền bùn) – không kể bùn sơ cấp
  const wasP = pipes.filter(pp => isAS(U[pp.src]) && fin(pp).some(d => !isAS(d) && sludgeDst(d)));
  const was = wasP.reduce((a, pp) => a + Qof(pp) * tss(pp.c) / 1000, 0);
  if (was > 0) targets.push(T('WAS', 'Bùn dư (rời hệ sinh học)', 'kgTSS/d', was, 'plant', { rel: 0.15, note: 'ống SUMO: ' + wasP.map(pp => (pp.label || pp.name) + ' (' + fmtN(Qof(pp)) + ' m³/d)').join(', ') }));
  for (const u of cx.units) {
    if (!['cstr', 'mbr', 'mbbr', 'baf'].includes(U[u.id].kind) || !SIMID[u.id]) continue;
    const r = u.r, nm = u.label || u.name, o = { unit: SIMID[u.id] };
    const aer = /input DO/.test(u.cls) || ['mbbr', 'baf'].includes(U[u.id].kind) ? +u.p.DOSP > 0 : +u.p.Qair_NTP > 0;
    if (r.XTSS != null) targets.push(T('TSS', 'MLSS – ' + nm, 'mg/L', +r.XTSS, 'unit', Object.assign({ rel: 0.1 }, o)));
    if (r.SNHx != null) targets.push(T('NH4', 'NH₄ – ' + nm, 'mg/L', (+r.SNHx || 0) + (+r.SNH2OH || 0), 'unit', Object.assign({ tol: 1 }, o)));
    const nox = r.SNOx != null ? +r.SNOx : (r.SNO3 != null ? +r.SNO3 + (+r.SNO2 || 0) : NaN);
    if (isFinite(nox)) targets.push(T('NOx', 'NOx – ' + nm, 'mg/L', nox, 'unit', Object.assign({ tol: 1 }, o)));
    if (m.fam === 'ASM2d' && r.SPO4 != null) targets.push(T('PO4', 'PO₄ – ' + nm, 'mg/L', +r.SPO4, 'unit', Object.assign({ tol: 0.5 }, o)));
    if (!aer && r.SVFA != null && +r.SVFA > 1) targets.push(T('VFA', 'VFA – ' + nm, 'mgCOD/L', +r.SVFA, 'unit', Object.assign({ tol: 3 }, o)));
  }
  // nhiệt độ: theo dòng vào chính
  const src = cx.units.find(u => U[u.id].kind === 'src'), srcP = src ? outP(src.id)[0] : null;
  const Tp = srcP && +srcP.c.T > 0 ? +srcP.c.T : 20;
  const hs = cx.units.filter(u => U[u.id].kind === 'cstr').map(u => +u.p.htank || 5), hAvg = hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 5;
  // tham số động học thay đổi so với mặc định
  const prm = {};
  // Sumo2C: dị dưỡng có tích trữ (XSTO) – động học OHO không tương đương, không chuyển
  for (const k in cx.kin) { if (cx.model === 'Sumo2C' && /OHO/.test(k)) continue; const id = SUMOIMP.KIN[k]; if (m.pById[id] && Math.abs(cx.kin[k] - m.defaults[id]) > 1e-9 * Math.max(1, Math.abs(m.defaults[id]))) prm[id] = cx.kin[k]; }
  // hệ số N, P thành phần theo dòng vào chính (lớn nhất) của SUMO: N/P hữu cơ là biến riêng trong Sumo, cố định theo COD trong ASM2d
  if (opt.fitComp !== false && m.fam === 'ASM2d' && srcPipes.length) {
    const c = srcPipes.reduce((a, pp) => (Qof(pp) > Qof(a) ? pp : a)).c, g = k => Math.max(+c[k] || 0, 0);
    const fit = (id, num, den, lim) => { if (den > lim && m.pById[id]) { const v = num / den; if (v >= 0 && v < 0.15) prm[id] = _r5(v); } };
    const sb = g('SB') + g('SB_mono') + g('SB_poly') + g('SMEOL'), xb = g('XB') + g('CB'), xu = g('XU') + g('CU');
    if (c.SN_B != null) fit('iNSF', g('SN_B'), sb, 2); if (c.SP_B != null) fit('iPSF', g('SP_B'), sb, 2);
    if (c.XN_B != null) fit('iNXS', g('XN_B'), xb, 5); if (c.XP_B != null) fit('iPXS', g('XP_B'), xb, 5);
    if (c.XN_U != null) fit('iNXI', g('XN_U'), xu, 5); if (c.XP_U != null) fit('iPXI', g('XP_U'), xu, 5);
  }
  const title = cx.title || cx.file || 'Dự án SUMO';
  const P = _mk({
    name: 'SUMO24: ' + title, model,
    desc: `Nhập từ dự án SUMO (${cx.model}) – ${cx.file || ''}. Mô hình SimXLNT ${model} (${m.name}). Dòng vào và các dòng từ phần chưa mô phỏng lấy nguyên kết quả trạng thái ổn định của SUMO; ` +
      'kết quả SUMO để đối chiếu ở tab Bản tính.' + (notes.length ? ' ' + notes.join(' ') : ''),
    plant: { T: _r5(Tp), kLaSurfO2: _r5(7.6 / hAvg) },   // SUMO: kL,GO2,sur = 7,6 m/d trên mặt thoáng mọi bể → kLa = kL/h
    params: { [model]: prm },
    units, links
  });
  P.design = {
    ref: true, file: cx.file || '', title: 'SUMO24 – ' + title, tech: 'SUMO', techName: (cx.cat ? cx.cat + ' · ' : '') + 'mô hình SUMO ' + cx.model + ' → SimXLNT ' + model,
    model, params: [], time: '', effUnit: effSink,
    note: (steady ? 'Số liệu đối chiếu lấy từ kết quả trạng thái ổn định lưu trong tệp SUMO (bảng storages). '
      : '<b>Tệp SUMO không lưu trạng thái ổn định</b> – số liệu là trạng thái cuối mô phỏng động (t = ' + fmtN(cx.ss.t) + ' ngày, dòng vào động) nên chỉ để tham khảo (không chấm đạt/không đạt). ') +
      'SimXLNT chạy mô hình tự cài đặt ' + model + ' với tham số mặc định kiểu ' + m.sumo + (Object.keys(prm).length ? ' (đã áp dụng tham số khác mặc định của SUMO: ' + Object.entries(prm).map(([k, v]) => k + ' = ' + v).join(', ') + ')' : '') + '. ' +
      'Bể lắng không thể tích của SUMO được thay bằng bộ tách lý tưởng có TSS ra cố định; lắng sơ cấp/nén/tách nước giữ TSS theo hiệu suất SUMO (SUMO chỉ giữ hạt lắng được, COD keo đi qua). ' +
      'Khác biệt cấu trúc mô hình: SUMO có COD keo + keo tụ, GAO, chuyển mạch ORP của PAO, methylotroph, kết tủa khoáng (struvite, HFO); SimXLNT gộp các nhóm này (xem mô tả mô hình).',
    chain, targets
  };
  P.sumoSrc = { file: cx.file || '', model: cx.model, key: cx.key || '' };
  P.sumoCx = cx; P.sumoOpt = Object.assign({}, opt);          // giữ số liệu SUMO trong dự án để dựng lại với lựa chọn khác
  return P;
};
function fmtN(v) { return typeof fmt === 'function' ? fmt(v) : String(_r5(v)); }

SUMOIMP.fromFile = async function (buf, name) {
  const cx = await SUMOIMP.fromZip(buf, { file: name || '', title: (name || '').replace(/\.sumo$/i, '') });
  return SUMOIMP.build(cx);
};

if (typeof module !== 'undefined') module.exports = SUMOIMP;
