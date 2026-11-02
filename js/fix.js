'use strict';
/* ==========================================================================
   SimXLNT – GIỚI HẠN XẢ & GỢI Ý XỬ LÝ CHỈ TIÊU CHƯA ĐẠT
   - Giới hạn xả lưu cùng dự án (P.limits) với bộ chọn nhanh QCVN 40:2011 A/B, QCVN 14:2008 A/B, theo bản tính, tự nhập.
   - Chẩn đoán nguyên nhân từ trạng thái mô hình (SRT hiếu khí so với yêu cầu, DO, pH/kiềm, NOx thiếu khí, VFA,
     PO₄ bể kỵ khí, tải bể lắng…).
   - Biện pháp vận hành / hóa chất / công trình, thử song song bằng luồng tính (SENS.run) từ trạng thái ổn định hiện có,
     so sánh chỉ tiêu trước – sau, chỉ tiêu mới vượt, điện năng, bùn dư, khí; phương án kết hợp nhiều bước; áp dụng.
   ========================================================================== */
const FIX = (() => {
  const LIM_PRESETS = {
    q40A: { n: 'QCVN 40:2011/BTNMT cột A (Kq = Kf = 1) – hết hiệu lực 01/9/2025', v: { COD: 75, BOD5: 30, TSS: 50, NH4: 5, TN: 20, TP: 4 } },
    q40B: { n: 'QCVN 40:2011/BTNMT cột B (Kq = Kf = 1) – hết hiệu lực 01/9/2025', v: { COD: 150, BOD5: 50, TSS: 100, NH4: 10, TN: 40, TP: 6 } },
    q14A: { n: 'QCVN 14:2008/BTNMT cột A (K = 1) – hết hiệu lực 01/9/2025', v: { BOD5: 30, TSS: 50, NH4: 5, NOx: 6.8, PO4: 2 } },
    q14B: { n: 'QCVN 14:2008/BTNMT cột B (K = 1) – hết hiệu lực 01/9/2025', v: { BOD5: 50, TSS: 100, NH4: 10, NOx: 11.3, PO4: 3.3 } }
  };
  const KEYS = [['COD', 'COD'], ['BOD5', 'BOD₅'], ['TSS', 'TSS'], ['NH4', 'NH₄-N'], ['NOx', 'NOx-N'], ['TN', 'TN'], ['TP', 'TP'], ['PO4', 'PO₄-P']];
  const LBL = Object.fromEntries(KEYS);
  const KIND = { vh: ['Vận hành', '#0f62c9'], hc: ['Hóa chất', '#b45309'], ct: ['Công trình', '#7c3aed'] };
  const clone = o => JSON.parse(JSON.stringify(o));
  const r2 = v => +(+v).toPrecision(2);

  /* ---------- giới hạn ---------- */
  // QCVN 2025 (js/qcvn.js): bậc lưu lượng F theo tổng lưu lượng vào trạm của dự án
  const Qplant = P => (P.units || []).filter(u => u.type === 'influent').reduce((a, u) => a + (+u.p.Q || 0), 0);
  function q25(P) {
    if (typeof QCVN === 'undefined') return [];
    return QCVN.list(Qplant(P)).map(o => ({ k: 'q25:' + o.id, n: o.v.name, v: { COD: o.v.COD, BOD5: o.v.BOD, TSS: o.v.TSS, NH4: o.v.NH4, TN: o.v.TN, TP: o.v.TP } }));
  }
  function fromDesign(P) {
    const D = P.design, L = {};
    if (D && D.targets) for (const t of D.targets) if (t.m === 'eff' && t.lim != null && isFinite(+t.lim)) L[t.k] = +t.lim;
    return Object.keys(L).length ? L : null;
  }
  function limits(P) {
    if (P.limits && P.limits.v) return P.limits.v;
    return fromDesign(P) || Object.assign({}, APP.limits);
  }
  function limitsSrc(P) { return P.limits && P.limits.src ? P.limits.src : fromDesign(P) ? 'design' : 'default'; }
  function limitsUI(host, onChange) {
    const P = APP.P, L = limits(P), src = limitsSrc(P), m = MODELS[P.model];
    const keys = KEYS.filter(k => m.fam === 'ASM2d' || !['TP', 'PO4'].includes(k[0])), Q25 = q25(P);
    host.innerHTML = `<div class="row" style="margin-bottom:6px"><label>Giới hạn xả <select id="limPre">
      <option value="">— chọn nhanh —</option>${Q25.length ? `<optgroup label="QCVN 2025 – hiệu lực từ 01/9/2025 (bậc lưu lượng theo Q trạm = ${Math.round(Qplant(P)).toLocaleString('vi-VN')} m³/ngđ)">${Q25.map(o => `<option value="${o.k}"${src === o.k ? ' selected' : ''}>${o.n}</option>`).join('')}</optgroup>` : ''}
      <optgroup label="QCVN cũ (dự án trước 01/9/2025)">${Object.entries(LIM_PRESETS).map(([k, p]) => `<option value="${k}"${src === k ? ' selected' : ''}>${p.n}</option>`).join('')}</optgroup>
      ${fromDesign(P) ? `<option value="design"${src === 'design' ? ' selected' : ''}>Theo bản tính thiết kế</option>` : ''}<option value="custom"${src === 'custom' || src === 'default' ? ' selected' : ''}>Tự nhập</option></select></label>
      <span class="small muted">Để trống ô = không xét. QCVN 2025: không còn hệ số K; cột A/B/C theo phân vùng xả (chưa xác định → cột B). QCVN cũ: nhập giá trị đã nhân Kq, Kf, K.</span></div>
      <div class="row">${keys.map(([k, l]) => `<label>${l} <input type="number" step="any" data-lk="${k}" style="width:72px" value="${L[k] ?? ''}"></label>`).join('')}</div>`;
    host.querySelector('#limPre').onchange = e => {
      const v = e.target.value; if (!v) return;
      const q = Q25.find(o => o.k === v);
      if (q) P.limits = { src: v, v: Object.assign({}, q.v) };
      else if (LIM_PRESETS[v]) P.limits = { src: v, v: Object.assign({}, LIM_PRESETS[v].v) };
      else if (v === 'design') P.limits = { src: 'design', v: fromDesign(P) };
      else P.limits = { src: 'custom', v: Object.assign({}, limits(P)) };
      saveLocal(); onChange();
    };
    host.querySelectorAll('[data-lk]').forEach(i => (i.onchange = () => {
      const v = Object.assign({}, limits(P)); const x = parseFloat(i.value);
      if (isFinite(x)) v[i.dataset.lk] = x; else delete v[i.dataset.lk];
      P.limits = { src: 'custom', v }; saveLocal(); onChange();
    }));
  }

  /* ---------- tìm phần tử sơ đồ ---------- */
  function topo(P) {
    const by = Object.fromEntries(P.units.map(u => [u.id, u])), L = P.links;
    const reac = P.units.filter(u => ['cstr', 'mbbr', 'mbr'].includes(u.type));
    const aer = reac.filter(u => u.p.aer !== 'none'), unaer = reac.filter(u => u.p.aer === 'none');
    const isAn = u => /kỵ khí|anaer/i.test(u.name) || /^AN\d*$/.test(u.id);
    const anaer = unaer.filter(isAn), anox = unaer.filter(u => !isAn(u));
    const cyc = P.units.find(u => ['iceas', 'sbr', 'ctech'].includes(u.type));
    const sludge = new Set(P.units.filter(u => u.type === 'sludge').map(u => u.id));
    // phần tử xả bùn: bộ chia có nhánh tới bùn thải; hoặc bể lắng/màng xả thẳng ra bùn thải
    let was = null;
    for (const sp of P.units.filter(u => u.type === 'splitter')) for (const port of ['a', 'b']) { const l = L.find(x => x.from[0] === sp.id && x.from[1] === port); if (l && sludge.has(l.to[0])) was = { u: sp, port }; }
    if (!was) for (const c of P.units.filter(u => ['clarifier', 'mbr'].includes(u.type))) { const l = L.find(x => x.from[0] === c.id && x.from[1] === 'und'); if (l && sludge.has(l.to[0])) was = { u: c, port: 'und' }; }
    // tuần hoàn nội: bộ chia nhận từ bể sục khí, một nhánh về bể không sục
    const aerS = new Set(aer.map(u => u.id)), unS = new Set(unaer.map(u => u.id));
    let ir = null;
    for (const sp of P.units.filter(u => u.type === 'splitter')) {
      if (was && was.u.id === sp.id) continue;           // bộ chia RAS/WAS (có nhánh bùn thải) không phải tuần hoàn nội
      const li = L.find(x => x.to[0] === sp.id); if (!li || !aerS.has(li.from[0])) continue;
      for (const port of ['a', 'b']) { const l = L.find(x => x.from[0] === sp.id && x.from[1] === port); if (l && unS.has(l.to[0])) ir = { u: sp, port }; }
    }
    const clar = P.units.filter(u => u.type === 'clarifier');
    const blower = P.units.find(u => u.type === 'blower');
    const Q = P.units.filter(u => u.type === 'influent').reduce((s, u) => s + (+u.p.Q || 0), 0);
    return { by, reac, aer, unaer, anaer, anox, cyc, was, ir, clar, blower, Q };
  }
  const ctrlOn = (P, unit, act) => (P.ctrls || []).find(c => c.on !== false && c.unit === unit && c.act === act);
  const U = (P, id) => P.units.find(u => u.id === id);
  function newDose(P, target, name, p) {
    let i = 1; while (P.units.some(u => u.id === 'D' + i)) i++;
    const id = 'D' + i, t = U(P, target);
    P.units.push({ id, type: 'dose', name, x: t.x - 20, y: t.y - 110, p: Object.assign(UT.dose.def(), p) });
    let j = P.links.length + 1; while (P.links.some(l => l.id === 'L' + j)) j++;
    P.links.push({ id: 'L' + j, from: [id, 'out'], to: [target, 'in'] });
    return id;
  }
  /* thay đổi dòng xả bùn theo hệ số f (< 1: tăng SRT) */
  function wasScale(P, T, f) {
    if (T.cyc) {
      const c = U(P, T.cyc.id);
      if (c.p.wasMode === 'srt') c.p.SRTw = +(c.p.SRTw / f).toPrecision(3); else c.p.Vwas = +(c.p.Vwas * f).toPrecision(3);
      return;
    }
    if (!T.was) return;
    const u = U(P, T.was.u.id);
    if (u.type === 'splitter') {
      const toA = T.was.port === 'a';
      if (u.p.mode === 'Q') { if (toA) u.p.Q = +(u.p.Q * f).toPrecision(4); else u.p.Q = +(u.p.Q / f).toPrecision(4); }   // nhánh A là bùn thải → nhân; nhánh B → Q nhánh A (tuần hoàn) – xấp xỉ
      else if (u.p.mode === 'rQ') u.p.kQ = +(u.p.kQ * (toA ? f : 1 / f)).toPrecision(4);
      else u.p.frac = Math.min(1, +(toA ? u.p.frac * f : 1 - (1 - u.p.frac) * f).toPrecision(4));
    } else {
      if (u.p.uMode === 'Q') u.p.uQ = +(u.p.uQ * f).toPrecision(4); else if (u.p.uMode === 'rQ') u.p.uK = +(u.p.uK * f).toPrecision(4); else u.p.uR = +(u.p.uR * f).toPrecision(4);
    }
  }
  const wasDesc = (T, f) => T.cyc ? (T.cyc.p.wasMode === 'srt' ? `SRT xả ${fmt(T.cyc.p.SRTw)} → ${fmt(T.cyc.p.SRTw / f)} d` : `bùn xả ${fmt(T.cyc.p.Vwas)} → ${fmt(T.cyc.p.Vwas * f)} m³/bể/chu kỳ`) : T.was ? `lưu lượng bùn xả × ${fmt(f)} (${T.was.u.name})` : '';
  const hasWAS = T => !!(T.cyc || T.was);

  /* ---------- chẩn đoán ---------- */
  function diagnose(k, P, S, out) {
    const T = topo(P), Tc = +P.plant.T, rs = S.reactors;
    const aerR = rs.filter(r => r.aerated), anR = rs.filter(r => !r.aerated);
    const DOav = aerR.length ? aerR.reduce((a, r) => a + r.c.DO * r.info.V, 0) / aerR.reduce((a, r) => a + r.info.V, 0) : NaN;
    const pHmin = rs.length ? Math.min(...rs.map(r => r.info.pH)) : NaN;
    const m = MODELS[P.model], prm = Object.assign({}, m.defaults, P.params[m.id] || {});
    const AL = m.nitrAlias || (m.nitro ? { muA: 'muAOB', bA: 'bAOB', KOA: 'KOAOB', KNH: 'KNHA' } : {});   // ASM1N: nitrat hóa giới hạn bởi AOB; ASM3: tên tham số riêng
    for (const [a, b] of Object.entries(AL)) prm[a] = prm[b];
    const th = id => +((m.params.find(p => p.id === (AL[id] || id)) || {}).th || 1);
    const c = [];
    const L0 = limits(P);
    if (k === 'TN' && out['eff.NH4'] > 2 && L0.NH4 != null && out['eff.NH4'] > L0.NH4) return [`TN cao chủ yếu do NH₄ chưa được nitrat hóa (${fmt(out['eff.NH4'])} mg/L) – xem chẩn đoán NH₄ ở trên; sau khi nitrat hóa đủ, NOx ra hiện tại ${fmt(out['eff.NOx'])} mg/L`];
    if (k === 'NH4' || (k === 'TN' && out['eff.NH4'] > 2)) {
      // cân bằng sinh trưởng tự dưỡng theo chính động học của mô hình tại điều kiện các bể sục khí
      const muT = +prm.muA * Math.pow(th('muA'), Tc - 20), bT = +prm.bA * Math.pow(th('bA'), Tc - 20);
      const KO = +(prm.KO2A ?? prm.KOA ?? 0.4), KN = +(prm.KNH4A ?? prm.KNH ?? 1), KP = prm.KPA != null ? +prm.KPA : null, KA = prm.KALKA != null ? +prm.KALKA : null;
      const Vt = aerR.reduce((a, r) => a + r.info.V, 0) || 1, avg = f => aerR.reduce((a, r) => a + f(r.c) * r.info.V, 0) / Vt;
      const fDO = avg(x => x.DO / (KO + x.DO)), fP = KP != null ? avg(x => Math.max(x.PO4, 0) / (KP + Math.max(x.PO4, 0))) : 1, fA = KA != null ? avg(x => (x.Alk / 50) / (KA + x.Alk / 50)) : 1;
      const Lnh = limits(P).NH4, Nt = Math.max(0.3, (Lnh != null ? 0.5 * Lnh : 1)), fN = Nt / (KN + Nt);
      // phân hủy diễn ra cả ở vùng không sục khí, giảm theo ηb,A (etabA < 1: ASM1N, ASM2dS…; ASM3 có bANO riêng)
      const eta = prm.etabA != null ? +prm.etabA : prm.bANOX != null && +prm.bAO2 > 0 ? +prm.bANOX / +prm.bAO2 : 1;
      const fNon = isFinite(S.SRT) && S.SRTaer > 0 ? Math.max(0, S.SRT / S.SRTaer - 1) : 0;
      const bEff = bT * (1 + eta * fNon);
      const net = muT * fDO * fP * fA * fN - bEff, need = net > 0 ? 1 / net : Infinity;
      c.push(`Ở ${fmt(Tc)} °C: μA = ${fmt(muT)} 1/d; hệ số DO ${fmt(fDO)}, PO₄ ${fmt(fP)}, kiềm ${fmt(fA)}; phân hủy hiệu dụng ${fmt(bEff)} 1/d → để NH₄ ra ≈ ${fmt(Nt)} mg/L cần SRT hiếu khí ≥ ${isFinite(need) ? fmt(need) + ' d' : '∞ (không đạt được chỉ bằng tăng SRT)'}; hiện có ${fmt(S.SRTaer)} d`);
      if (S.SRTaer < need) c.push('SRT hiếu khí chưa đủ – vi khuẩn nitrat hóa bị rửa trôi một phần');
      // bể chu kỳ: giá trị trung bình chu kỳ gồm cả pha không sục khí → hệ số DO không đại diện; nguyên nhân thường gặp là NH₄ vào trong pha không sục khí
      if (T.cyc) {
        const p = T.cyc.p, m0 = T.cyc.type === 'iceas' ? (ICEAS_MODES[p.mode] || [p.tAer, p.tMix, p.tS, p.tD]) : null;
        if (m0) { const fr = (m0[2] + m0[3]) / (m0[0] + m0[1] + m0[2] + m0[3]); c.push(`ICEAS nạp liên tục: ≈ ${fmt(fr * 100)} % thời gian chu kỳ là lắng + gạn – NH₄ đi vào trong các pha này chỉ được pha loãng, không nitrat hóa trước khi gạn; ${S.SRTaer >= need ? 'SRT hiếu khí đã đủ nên đây là nguyên nhân chính' : ''} (rút ngắn lắng/gạn, tăng ngăn tiền phản ứng hoặc tăng thể tích pha loãng)`); }
        else if (T.cyc.type === 'ctech') c.push('C-Tech: NH₄ còn lại cuối pha sục khí đi thẳng ra nước gạn – kéo dài sục khí sau nạp hoặc giảm phần nạp không sục');
      }
      const lim = [['DO', T.cyc ? 1 : fDO, `DO bể sục khí thấp (TB ${fmt(DOav)} mg/L)`], ['PO₄', fP, 'PO₄ trong bể hiếu khí gần cạn (khử P sinh học/hóa học mạnh) – hạn chế cả vi khuẩn nitrat hóa'], ['kiềm', fA, `độ kiềm thấp (pH min ${fmt(pHmin)})`]].filter(x => x[1] < 0.75).sort((a, b) => a[1] - b[1]);
      for (const x of lim) c.push('Yếu tố hạn chế: ' + x[2] + ` (hệ số ${fmt(x[1])})`);
      if (!isFinite(need)) c.push('Ở nhiệt độ này tốc độ sinh trưởng tối đa không bù được phân hủy tại NH₄ mục tiêu – cần tăng DO, kéo dài pha/vùng hiếu khí (giảm phân hủy hiệu dụng) hoặc kiểm tra tham số động học/nhiệt độ thiết kế');
    }
    if (k === 'NOx' || (k === 'TN' && !(out['eff.NH4'] > 2))) {
      const anx = anR.filter(r => !/kỵ khí|anaer/i.test(r.cu.u.name));
      if (anx.length && anx.every(r => r.c.NOx < 1)) c.push(`NOx trong bể thiếu khí đã thấp (${anx.map(r => fmt(r.c.NOx)).join(', ')} mg/L) – năng lực khử nitrat còn dư, thiếu nitrat được đưa về → tăng tuần hoàn nội`);
      else if (anx.length) c.push(`NOx trong bể thiếu khí còn cao (${anx.map(r => fmt(r.c.NOx)).join(', ')} mg/L) – thiếu carbon dễ phân hủy hoặc thể tích thiếu khí nhỏ`);
      else if (!T.cyc) c.push('Sơ đồ không có bể thiếu khí – không khử nitrat');
      if (T.cyc) c.push('Bể chu kỳ: khử nitrat diễn ra trong pha không sục khí/khuấy và lắng – thời gian không sục khí ngắn hoặc thiếu carbon');
    }
    if (k === 'TP' || k === 'PO4') {
      if (MODELS[P.model].fam !== 'ASM2d') c.push('Mô hình ASM1 không mô phỏng khử P – chuyển sang ASM2d');
      const an = anR.filter(r => /kỵ khí|anaer/i.test(r.cu.u.name));
      if (!an.length && !T.cyc) c.push('Không có bể kỵ khí – không có khử P sinh học tăng cường');
      for (const r of an) { if (r.c.NOx > 1) c.push(`Bể kỵ khí ${r.cu.u.name} có NOx ${fmt(r.c.NOx)} mg/L (nitrat theo bùn tuần hoàn) – VFA bị dùng cho khử nitrat`); if (r.c.VFA < 2) c.push(`VFA trong bể kỵ khí thấp (${fmt(r.c.VFA)} mg/L) – PAO thiếu cơ chất`); }
      if (k === 'TP' && out['eff.TSS'] > 15) c.push(`TSS ra ${fmt(out['eff.TSS'])} mg/L mang theo P dạng hạt`);
      if (!c.length) c.push('P sinh học chưa đủ – bổ sung kết tủa hóa học bằng muối Fe/Al');
    }
    if (k === 'TSS' || ((k === 'COD' || k === 'BOD5') && out['eff.TSS'] > 20)) {
      for (const cl of S.reactors.length ? P.units.filter(u => u.type === 'clarifier') : []) c.push(`${cl.name}: tải bề mặt / tải chất rắn – xem bảng bể lắng (MLSS cao, SVI lớn hoặc diện tích nhỏ làm TSS ra tăng)`);
      if (T.cyc) c.push('Bể chu kỳ: lớp bùn gần mặt nước khi gạn (MLSS × SVI lớn, thời gian lắng ngắn)');
    }
    if (k === 'COD') { const si = out['eff.COD'] - (out['eff.BOD5'] || 0) * 1.6; if (si > 0.5 * out['eff.COD']) c.push(`Phần lớn COD ra là COD trơ (hòa tan khó phân hủy ≈ ${fmt(si)} mg/L) – không giảm được bằng sinh học; cần hóa lý/hấp phụ hoặc kiểm tra phân đoạn SI của nước vào`); }
    if (k === 'BOD5' && !c.length) c.push('BOD ra cao: DO hoặc SRT thấp, hoặc BOD dạng hạt theo TSS ra');
    return c;
  }

  /* ---------- biện pháp ---------- */
  function actions(P, F, out) {
    const T = topo(P), A = [], seen = new Set(), fam = MODELS[P.model].fam, Q = T.Q || 1000;
    const add = a => { if (seen.has(a.key)) { const o = A.find(x => x.key === a.key); for (const k of a.fixes) if (!o.fixes.includes(k)) o.fixes.push(k); return; } seen.add(a.key); A.push(a); };
    const ks = new Set(F.map(f => f.k));
    const nhBad = ks.has('NH4') || (ks.has('TN') && out['eff.NH4'] > 2) || ((ks.has('BOD5') || ks.has('COD')) && out['eff.NH4'] > 5);
    const noBad = ks.has('NOx') || (ks.has('TN') && !(out['eff.NH4'] > 2));
    const pBad = (ks.has('TP') || ks.has('PO4')) && fam === 'ASM2d';
    const sBad = ks.has('TSS') || ((ks.has('COD') || ks.has('BOD5') || ks.has('TP')) && out['eff.TSS'] > 20);
    const bodBad = ks.has('BOD5') || ks.has('COD');
    const lim = limits(P);
    // DO
    const doAct = (fixes) => {
      const nhC = (P.ctrls || []).find(c => c.on !== false && c.act === 'DOsp' && c.v === 'NH4');
      if (nhC) { add({ key: 'nhsp', kind: 'vh', fixes, title: `Hạ giá trị đặt NH₄ của bộ ĐK "${nhC.name || nhC.id}"`, desc: `${fmt(nhC.sp)} → ${fmt(Math.max(0.3, nhC.sp * 0.5))} mg/L (DO đặt tự tăng)`, apply: P2 => { const c = P2.ctrls.find(x => x.id === nhC.id); c.sp = r2(Math.max(0.3, c.sp * 0.5)); } }); return; }
      if (T.blower && T.blower.p.doMode === 'common') { add({ key: 'do', kind: 'vh', fixes, title: 'Tăng DO đặt chung của trạm máy thổi', desc: `${fmt(T.blower.p.DOsp)} → ${fmt(Math.max(+T.blower.p.DOsp + 1, 2.5))} mg/L`, apply: P2 => { const b = U(P2, T.blower.id); b.p.DOsp = Math.max(+b.p.DOsp + 1, 2.5); } }); return; }
      const tgts = (T.cyc ? [T.cyc] : T.aer.filter(u => u.p.aer === 'do')).filter(u => !ctrlOn(P, u.id, 'DOsp'));
      if (tgts.length) add({ key: 'do', kind: 'vh', fixes, title: 'Tăng DO đặt các bể sục khí', desc: tgts.map(u => `${u.name} ${fmt(u.p.DOsp)} → ${fmt(Math.max(+u.p.DOsp + 1, 2.5))}`).join('; ') + ' mg/L', apply: P2 => tgts.forEach(u => { const x = U(P2, u.id); x.p.DOsp = Math.max(+x.p.DOsp + 1, 2.5); }) });
    };
    if (nhBad || bodBad) {
      const fx = [...ks].filter(k => ['NH4', 'TN', 'BOD5', 'COD'].includes(k));
      doAct(fx);
      if (hasWAS(T)) add({ key: 'srtUp', kind: 'vh', fixes: fx, title: 'Tăng tuổi bùn (giảm xả bùn 30 %)', desc: wasDesc(T, 0.7) + ' – MLSS tăng, kiểm tra bể lắng', apply: P2 => wasScale(P2, topo(P2), 0.7) });
      if (T.cyc && T.cyc.type === 'iceas') add({ key: 'icAer', kind: 'vh', fixes: fx, title: 'Kéo dài pha sục khí ICEAS 25 %', desc: 'Air-On × 1,25, giảm khuấy không sục tương ứng (chu kỳ tự nhập)', apply: P2 => { const c = U(P2, T.cyc.id), m = ICEAS_MODES[c.p.mode]; if (m) { [c.p.tAer, c.p.tMix, c.p.tS, c.p.tD] = m; c.p.mode = 'custom'; } const dt = c.p.tAer * 0.25; c.p.tAer = Math.round(c.p.tAer + dt); c.p.tMix = Math.max(0, Math.round(c.p.tMix - dt)); } });
      if (T.cyc && T.cyc.type === 'sbr') add({ key: 'sbrAer', kind: 'vh', fixes: fx, title: 'Kéo dài pha sục khí SBR 30 %', desc: `pha phản ứng ${fmt(T.cyc.p.tR)} → ${fmt(T.cyc.p.tR * 1.3)} h`, apply: P2 => { const c = U(P2, T.cyc.id); c.p.tR = +(c.p.tR * 1.3).toFixed(2); } });
      if (T.cyc && T.cyc.type === 'ctech') add({ key: 'ctAer', kind: 'vh', fixes: fx, title: 'Giảm phần nạp không sục khí C-Tech', desc: `nạp khuấy ${fmt(T.cyc.p.tFm)} → ${fmt(T.cyc.p.tFm * 0.5)} phút`, apply: P2 => { const c = U(P2, T.cyc.id); c.p.tFm = Math.round(c.p.tFm * 0.5); } });
      if (!T.cyc && T.aer.length) add({ key: 'vAer', kind: 'ct', fixes: fx, title: 'Tăng thể tích bể hiếu khí 30 %', desc: T.aer.filter(u => u.type !== 'mbr').map(u => `${u.name} ${fmt(u.p.V)} → ${fmt(u.p.V * 1.3)} m³`).join('; '), apply: P2 => T.aer.filter(u => u.type !== 'mbr').forEach(u => { U(P2, u.id).p.V = Math.round(u.p.V * 1.3); }) });
      if (nhBad && (out['S.pHmin'] < 6.9 || out['eff.Alk'] < 60)) {
        const ex = P.units.find(u => u.type === 'dose' && u.p.kind === 'alk');
        const first = T.reac[0] || T.cyc;
        const mass = r2(Math.max(80 - (out['eff.Alk'] || 0), 30) * Q / 1000);
        if (ex) add({ key: 'alkUp', kind: 'hc', fixes: fx, title: `Tăng châm kiềm ${ex.name}`, desc: `${fmt(ex.p.mass)} → ${fmt(+ex.p.mass + mass)} kg CaCO₃/d`, apply: P2 => { Object.assign(U(P2, ex.id).p, { dmode: 'mass', mass: +ex.p.mass + mass }); } });
        else if (first) add({ key: 'alkAdd', kind: 'hc', fixes: fx, title: 'Bổ sung kiềm (NaOH)', desc: `châm ${fmt(mass)} kg CaCO₃/d vào ${first.name} (giữ độ kiềm ra ≈ 80 mg/L, pH ≥ 7)`, apply: P2 => newDose(P2, first.id, 'NaOH bổ sung kiềm', { kind: 'alk', mass, Q: 1 }) });
      }
    }
    if (noBad) {
      const fx = [...ks].filter(k => ['NOx', 'TN'].includes(k));
      const target = lim.NOx != null ? 0.7 * lim.NOx : lim.TN != null ? 0.6 * lim.TN : 5;
      const excess = Math.max((out['eff.NOx'] || 0) - target, 1);
      if (T.ir) {
        const sp = T.ir.u, c = ctrlOn(P, sp.id, 'Q');
        if (c) add({ key: 'irSp', kind: 'vh', fixes: fx, title: `Hạ giá trị đặt NO₃ cuối thiếu khí (bộ ĐK "${c.name || c.id}")`, desc: `${fmt(c.sp)} → ${fmt(Math.max(0.3, c.sp * 0.5))} mg/L`, apply: P2 => { const cc = P2.ctrls.find(x => x.id === c.id); cc.sp = r2(Math.max(0.3, cc.sp * 0.5)); } });
        else add({ key: 'irUp', kind: 'vh', fixes: fx, title: `Tăng tuần hoàn nội ${sp.name} 50 %`, desc: sp.p.mode === 'Q' ? `${fmt(sp.p.Q)} → ${fmt(sp.p.Q * 1.5)} m³/d` : sp.p.mode === 'rQ' ? `${fmt(sp.p.kQ)}Q → ${fmt(sp.p.kQ * 1.5)}Q` : `tỷ lệ × 1,5`,
          apply: P2 => { const u = U(P2, sp.id), toA = T.ir.port === 'a'; if (u.p.mode === 'Q') u.p.Q = Math.round(u.p.Q * (toA ? 1.5 : 1 / 1.5)); else if (u.p.mode === 'rQ') u.p.kQ = +(u.p.kQ * (toA ? 1.5 : 1 / 1.5)).toFixed(2); else u.p.frac = toA ? Math.min(0.95, u.p.frac * 1.5) : Math.max(0.05, u.p.frac / 1.5); } });
      }
      // MLE–MBR: dòng retentate về thiếu khí đóng vai trò tuần hoàn nội
      const mb = P.units.find(u => u.type === 'mbr');
      if ((T.ir || (mb && T.anox.length)) && !nhBad) {
        const last = T.aer.filter(u => u.p.aer === 'do' && u.type !== 'mbr').slice(-1)[0];
        if (last && +last.p.DOsp > 1.2 && !ctrlOn(P, last.id, 'DOsp')) add({ key: 'doLast', kind: 'vh', fixes: fx, title: `Hạ DO bể hiếu khí cuối (${last.name})`, desc: `${fmt(last.p.DOsp)} → ${fmt(Math.max(1, last.p.DOsp - 0.8))} mg/L – giảm O₂ theo dòng tuần hoàn về thiếu khí`, apply: P2 => { const u = U(P2, last.id); u.p.DOsp = Math.max(1, +u.p.DOsp - 0.8); } });
      }
      if (!T.ir && mb && T.anox.length && !ctrlOn(P, mb.id, 'uQ')) add({ key: 'retUp', kind: 'vh', fixes: fx, title: `Tăng dòng retentate ${mb.name} (tuần hoàn về thiếu khí)`,
        desc: mb.p.uMode === 'rQ' ? `${fmt(mb.p.uK)}Q → ${fmt(mb.p.uK * 1.5)}Q` : mb.p.uMode === 'Q' ? `${fmt(mb.p.uQ)} → ${fmt(mb.p.uQ * 1.5)} m³/d` : `phần dòng vào ${fmt(mb.p.uR)} → ${fmt(Math.min(0.9, mb.p.uR * 1.15))}`,
        apply: P2 => { const u = U(P2, mb.id); if (u.p.uMode === 'rQ') u.p.uK = +(u.p.uK * 1.5).toFixed(2); else if (u.p.uMode === 'Q') u.p.uQ = Math.round(u.p.uQ * 1.5); else u.p.uR = Math.min(0.9, +(u.p.uR * 1.15).toFixed(3)); } });
      const ax = T.anox[0] || T.cyc;
      if (ax) {
        const exC = P.units.find(u => u.type === 'dose' && u.p.kind === 'carbon');
        const mass = r2(5 * excess * Q / 1000);
        if (exC) add({ key: 'cUp', kind: 'hc', fixes: fx, title: `Tăng nguồn carbon ${exC.name}`, desc: `${fmt(exC.p.mass)} → ${fmt(+exC.p.mass + mass)} kg COD/d (≈ 5 g COD/g NO₃-N cần khử thêm)`, apply: P2 => { Object.assign(U(P2, exC.id).p, { dmode: 'mass', mass: +exC.p.mass + mass }); } });
        else add({ key: 'cAdd', kind: 'hc', fixes: fx, title: 'Bổ sung nguồn carbon ngoài', desc: `châm ${fmt(mass)} kg COD/d vào ${ax.name} (≈ 5 g COD/g NO₃-N; methanol/axetat)`, apply: P2 => newDose(P2, ax.id, 'Carbon ngoài (khử nitrat)', { kind: 'carbon', mass, Q: 1 }) });
      }
      if (T.anox.length) add({ key: 'vAnox', kind: 'ct', fixes: fx, title: 'Tăng thể tích bể thiếu khí 30 %', desc: T.anox.map(u => `${u.name} ${fmt(u.p.V)} → ${fmt(u.p.V * 1.3)} m³`).join('; '), apply: P2 => T.anox.forEach(u => { U(P2, u.id).p.V = Math.round(u.p.V * 1.3); }) });
      if (T.cyc && T.cyc.type === 'iceas') add({ key: 'icMix', kind: 'vh', fixes: fx, title: 'Tăng pha khuấy không sục khí ICEAS', desc: 'Air-Off +30 phút, Air-On −15 phút (chu kỳ tự nhập)', apply: P2 => { const c = U(P2, T.cyc.id), m = ICEAS_MODES[c.p.mode]; if (m) { [c.p.tAer, c.p.tMix, c.p.tS, c.p.tD] = m; c.p.mode = 'custom'; } c.p.tMix = Math.round(+c.p.tMix + 30); c.p.tAer = Math.max(30, Math.round(c.p.tAer - 15)); } });
      if (T.cyc && T.cyc.type === 'ctech') add({ key: 'ctMix', kind: 'vh', fixes: fx, title: 'Tăng phần nạp không sục khí C-Tech', desc: `nạp khuấy ${fmt(T.cyc.p.tFm)} → ${fmt(+T.cyc.p.tFm + 20)} phút`, apply: P2 => { const c = U(P2, T.cyc.id); c.p.tFm = Math.min(+c.p.tF - 10, +c.p.tFm + 20); } });
    }
    if (pBad) {
      const fx = [...ks].filter(k => ['TP', 'PO4'].includes(k));
      const tgtP = lim.PO4 != null ? 0.6 * lim.PO4 : lim.TP != null ? 0.5 * lim.TP : 1;
      const exP = Math.max((out['eff.PO4'] || out['eff.TP'] || 0) - tgtP, 0.5);
      const exM = P.units.find(u => u.type === 'dose' && u.p.kind === 'metal');
      const tgtU = T.cyc || T.aer.filter(u => u.type !== 'mbr').slice(-1)[0] || T.reac.slice(-1)[0];
      const mass = r2(2 * exP * Q / 1000 * 55.85 / 30.97);
      if (exM) { const c = ctrlOn(P, exM.id, 'mass'); if (c) add({ key: 'mSp', kind: 'vh', fixes: fx, title: `Hạ giá trị đặt PO₄ (bộ ĐK "${c.name || c.id}")`, desc: `${fmt(c.sp)} → ${fmt(Math.max(0.1, c.sp * 0.5))} mg/L`, apply: P2 => { const cc = P2.ctrls.find(x => x.id === c.id); cc.sp = r2(Math.max(0.1, cc.sp * 0.5)); } });
        else add({ key: 'mUp', kind: 'hc', fixes: fx, title: `Tăng liều muối kim loại ${exM.name}`, desc: `${fmt(exM.p.mass)} → ${fmt(+exM.p.mass + mass)} kg Me/d`, apply: P2 => { Object.assign(U(P2, exM.id).p, { dmode: 'mass', mass: +exM.p.mass + mass }); } }); }
      else if (tgtU) add({ key: 'mAdd', kind: 'hc', fixes: fx, title: 'Khử P hóa học bằng FeCl₃ (đồng kết tủa)', desc: `châm ${fmt(mass)} kg Fe/d vào ${tgtU.name} (β ≈ 2 mol Fe/mol P cần khử)`, apply: P2 => newDose(P2, tgtU.id, 'FeCl₃ khử P', { kind: 'metal', metal: 'Fe', mass, Q: 1 }) });
      if (T.anaer.length) add({ key: 'vfa', kind: 'hc', fixes: fx, title: 'Bổ sung VFA (axetat) vào bể kỵ khí', desc: `châm ${fmt(r2(20 * Q / 1000))} kg COD/d vào ${T.anaer[0].name} – cơ chất cho PAO`, apply: P2 => newDose(P2, T.anaer[0].id, 'Axetat cho bio-P', { kind: 'carbon', mass: r2(20 * Q / 1000), Q: 1 }) });
    }
    if (sBad) {
      const fx = [...ks].filter(k => ['TSS', 'COD', 'BOD5', 'TP'].includes(k));
      for (const cl of T.clar) add({ key: 'clA' + cl.id, kind: 'ct', fixes: fx, title: `Tăng diện tích ${cl.name} 30 %`, desc: `${fmt(cl.p.A)} → ${fmt(cl.p.A * 1.3)} m²`, apply: P2 => { U(P2, cl.id).p.A = Math.round(cl.p.A * 1.3); } });
      if (hasWAS(T) && !nhBad) add({ key: 'srtDn', kind: 'vh', fixes: fx, title: 'Giảm MLSS (tăng xả bùn 30 %)', desc: wasDesc(T, 1.3) + ' – giảm tải chất rắn bể lắng; kiểm tra nitrat hóa', apply: P2 => wasScale(P2, topo(P2), 1.3) });
      if (T.cyc && T.cyc.type === 'iceas') add({ key: 'icSet', kind: 'vh', fixes: fx, title: 'Kéo dài pha lắng ICEAS 15 phút', desc: 'Lắng +15, Air-On −15 phút', apply: P2 => { const c = U(P2, T.cyc.id), m = ICEAS_MODES[c.p.mode]; if (m) { [c.p.tAer, c.p.tMix, c.p.tS, c.p.tD] = m; c.p.mode = 'custom'; } c.p.tS = +c.p.tS + 15; c.p.tAer = Math.max(30, c.p.tAer - 15); } });
      if (T.cyc && T.cyc.type === 'sbr') add({ key: 'sbrSet', kind: 'vh', fixes: fx, title: 'Kéo dài pha lắng SBR 0,25 h', desc: `${fmt(T.cyc.p.tS)} → ${fmt(+T.cyc.p.tS + 0.25)} h`, apply: P2 => { const c = U(P2, T.cyc.id); c.p.tS = +c.p.tS + 0.25; } });
    }
    return A;
  }

  /* ---------- đánh giá song song ---------- */
  function failsOf(out, L, fam) {
    const F = [];
    for (const [k] of KEYS) { if (L[k] == null || !isFinite(+L[k])) continue; if ((k === 'TP' || k === 'PO4') && fam !== 'ASM2d') continue; const v = out['eff.' + k]; if (isFinite(v) && v > +L[k]) F.push({ k, v, lim: +L[k] }); }
    return F;
  }
  async function runBatch(Pbase, list, y0, sig0, onMsg) {
    const nW = SENS.maxWorkers(), res = new Array(list.length).fill(null);
    const common = { P: Pbase, y0, sig0, opt: { tol: 2e-4, maxT: 1500, NA: 288 } };
    const chunks = list.map((P2, i) => [{ idx: i, kv: [], P: P2 }]);
    const r = await SENS.run(chunks, common, nW, m => { if (m.type === 'pt') { res[m.idx] = m.err ? { err: m.err } : { out: m.out, conv: m.conv }; if (onMsg) onMsg(res.filter(Boolean).length, list.length); } }, () => APP.abortFlag);
    return { res, mode: r.mode, workers: r.workers };
  }
  function score(a, ev, base, F0, L, fam) {
    if (!ev || ev.err) return { a, err: ev ? ev.err : 'không có kết quả', nFixed: -1, nNew: 99, improve: -1 };
    const F = failsOf(ev.out, L, fam), now = new Set(F.map(f => f.k));
    const fixed = F0.filter(f => !now.has(f.k)), newF = F.filter(f => !F0.some(g => g.k === f.k));
    let improve = 0; for (const f of F0) { const v = ev.out['eff.' + f.k]; if (isFinite(v)) improve += (f.v - v) / Math.max(f.v - f.lim, 1e-6); }
    const d = k => (ev.out[k] ?? NaN) - (base[k] ?? NaN);
    return { a, out: ev.out, conv: ev.conv, F, fixed, newF, nFixed: fixed.length, nNew: newF.length, allFixed: fixed.length === F0.length, improve, dE: d('S.Eday'), dWAS: d('S.WAS'), dAir: d('S.airh') };
  }
  // xếp hạng: số chỉ tiêu đạt ↑, chỉ tiêu mới vượt ↓; cùng đạt hết → ưu tiên vận hành < hóa chất < công trình rồi điện năng; còn lại → mức cải thiện
  const KR = { vh: 0, hc: 1, ct: 2 };
  const better = (x, y) => {
    if (!y) return true;
    if (x.nFixed !== y.nFixed) return x.nFixed > y.nFixed;
    if (x.nNew !== y.nNew) return x.nNew < y.nNew;
    if (x.allFixed && y.allFixed) { const a = (x.combo ? 3 : KR[x.a.kind]), b = (y.combo ? 3 : KR[y.a.kind]); if (a !== b) return a < b; return (x.dE || 0) < (y.dE || 0); }
    return x.improve > y.improve;
  };
  async function run(P, onProg) {
    const ss = APP.ss, base = outputsOf(ss.sys, ss.det), L = limits(P), fam = MODELS[P.model].fam;
    const F0 = failsOf(base, L, fam); if (!F0.length) return { F0, rows: [], base };
    const y0 = Float64Array.from(ss.y), sig0 = ss.sys.layoutSig, P0 = normalizeProject(clone(P));
    const A = actions(P0, F0, base);
    const mk = a => { const P2 = clone(P0); a.apply(P2); return P2; };
    const t0 = performance.now();
    if (onProg) onProg(`Đang thử ${A.length} biện pháp song song…`);
    const b1 = await runBatch(P0, A.map(mk), y0, sig0, (n, N) => onProg && onProg(`Đã tính ${n}/${N} biện pháp…`));
    const rows = A.map((a, i) => score(a, b1.res[i], base, F0, L, fam));
    rows.sort((x, y) => better(x, y) ? -1 : better(y, x) ? 1 : 0);
    // kết hợp nhiều bước
    const best = rows.find(x => !x.err && x.improve > 0);
    if (best && best.nFixed < F0.length && !APP.abortFlag) {
      const chosen = [best.a]; let cur = best, Pcur = mk(best.a);
      for (let st = 1; st < 3 && cur.F.length && !APP.abortFlag; st++) {
        const acts = actions(Pcur, cur.F, cur.out).filter(a => !chosen.some(c => c.key === a.key));
        if (!acts.length) break;
        if (onProg) onProg(`Kết hợp – bước ${st + 1}: thử ${acts.length} biện pháp…`);
        const list = acts.map(a => { const P2 = clone(Pcur); a.apply(P2); return P2; });
        const b = await runBatch(Pcur, list, y0, sig0);
        let pick = null;
        acts.forEach((a, i) => { const s = score(a, b.res[i], cur.out, cur.F, L, fam); if (!s.err && s.improve > 0 && better(s, pick)) pick = s; });
        if (!pick) break;
        chosen.push(pick.a); Pcur = list[acts.indexOf(pick.a)];
        cur = Object.assign(score(pick.a, { out: pick.out, conv: pick.conv }, base, F0, L, fam));
      }
      if (chosen.length > 1) {
        const a = { key: 'combo', kind: chosen.some(c => c.kind === 'ct') ? 'ct' : chosen.some(c => c.kind === 'hc') ? 'hc' : 'vh', fixes: [...new Set(chosen.flatMap(c => c.fixes))],
          title: 'Kết hợp: ' + chosen.map(c => c.title).join(' → '), desc: 'áp dụng lần lượt; mỗi bước chọn biện pháp tốt nhất cho chỉ tiêu còn vượt', apply: P2 => chosen.forEach(c => c.apply(P2)) };
        rows.unshift(Object.assign(score(a, { out: cur.out, conv: cur.conv }, base, F0, L, fam), { combo: true }));
      }
    }
    return { F0, rows, base, sec: (performance.now() - t0) / 1000, mode: b1.mode, workers: b1.workers };
  }

  /* ---------- giao diện ---------- */
  function card(host) {
    const P = APP.P;
    if (!APP.ss || APP.stale) { host.innerHTML = ''; return; }
    const base = outputsOf(APP.ss.sys, APP.ss.det), L = limits(P), fam = MODELS[P.model].fam, F = failsOf(base, L, fam);
    if (!F.length) { host.innerHTML = Object.keys(L).length ? `<div class="msg ok">Nước ra đạt mọi giới hạn đang xét (${Object.keys(L).map(k => LBL[k] || k).join(', ')}).</div>` : ''; return; }
    const S = plantSummary(APP.ss.sys, APP.ss.det);
    const diag = F.map(f => { const c = diagnose(f.k, P, S, base); return `<li><b>${esc(LBL[f.k] || f.k)}</b> = ${fmt(f.v)} mg/L > giới hạn ${fmt(f.lim)}${c.length ? ':<ul style="margin:2px 0 4px;padding-left:18px">' + c.map(x => `<li class="muted">${esc(x)}</li>`).join('') + '</ul>' : ''}</li>`; }).join('');
    host.innerHTML = `<div class="card" style="border-left:4px solid var(--bad)"><h2>Gợi ý xử lý chỉ tiêu chưa đạt</h2><ul style="margin:4px 0 10px;padding-left:20px">${diag}</ul>
      <div class="btnrow"><button class="pri" id="fxRun">Tìm & thử biện pháp trên mô hình</button><button id="fxStop" disabled>■ Dừng</button><span class="small muted" id="fxMsg">Mỗi biện pháp được áp dụng vào bản sao dự án và tính trạng thái ổn định song song nhiều luồng, khởi động từ kết quả hiện tại.</span></div><div id="fxRes"></div></div>`;
    host.querySelector('#fxStop').onclick = () => { APP.abortFlag = true; };
    host.querySelector('#fxRun').onclick = async () => {
      if (APP.running) return;
      const msg = host.querySelector('#fxMsg'), b = host.querySelector('#fxRun'), st = host.querySelector('#fxStop');
      APP.running = true; APP.abortFlag = false; b.disabled = true; st.disabled = false;
      let res;
      try { res = await run(P, t => { msg.textContent = t; }); } catch (e) { msg.textContent = '✖ ' + e.message; console.error(e); }
      APP.running = false; APP.abortFlag = false; b.disabled = false; st.disabled = true;
      if (!res) return;
      msg.textContent = `Đã thử ${res.rows.length} phương án trong ${res.sec.toFixed(1)} s · ${res.mode === 'worker' ? res.workers + ' luồng song song' : 'luồng chính'}.`;
      drawRows(host.querySelector('#fxRes'), res);
    };
  }
  function drawRows(box, res) {
    if (!res.rows.length) { box.innerHTML = '<div class="msg warn">Không tìm được biện pháp tự động – xem chẩn đoán ở trên.</div>'; return; }
    const F0 = res.F0;
    let h = `<div class="tscroll" style="margin-top:10px;max-height:none"><table class="t"><tr><th class="l">Biện pháp</th><th class="l">Loại</th>${F0.map(f => `<th style="white-space:normal">${esc(LBL[f.k] || f.k)}<br><span class="small muted">${fmt(f.v)} (≤ ${fmt(f.lim)})</span></th>`).join('')}<th class="l">Chỉ tiêu mới vượt</th><th>Δ điện kWh/d</th><th>Δ bùn dư kg/d</th><th>Δ khí Nm³/h</th><th></th></tr>`;
    res.rows.forEach((x, i) => {
      const kd = KIND[x.a.kind] || KIND.vh;
      h += `<tr${x.combo ? ' style="background:#f0f9ff"' : ''}><td class="l" style="white-space:normal;max-width:400px"><b>${esc(x.a.title)}</b><br><span class="small muted">${esc(x.a.desc || '')}</span></td><td class="l"><span class="badge" style="color:${kd[1]};background:${kd[1]}1a">${kd[0]}</span></td>`;
      if (x.err) { h += `<td colspan="${F0.length + 4}" class="l" style="color:var(--bad)">✖ ${esc(x.err)}</td><td></td></tr>`; return; }
      for (const f of F0) { const v = x.out['eff.' + f.k], ok = v <= f.lim; h += `<td style="color:${ok ? 'var(--ok)' : 'var(--bad)'};font-weight:600">${fmt(v)} ${ok ? '✔' : '✖'}</td>`; }
      h += `<td class="l small" style="white-space:normal;color:var(--bad)">${x.newF.map(g => esc(LBL[g.k] || g.k) + ' ' + fmt(g.v)).join(', ') || '<span class="muted">–</span>'}${x.conv === false ? ' <span class="muted">(chưa hội tụ)</span>' : ''}</td>
        <td>${fmt(x.dE)}</td><td>${fmt(x.dWAS)}</td><td>${fmt(x.dAir)}</td><td><button data-ap="${i}">Áp dụng</button></td></tr>`;
    });
    box.innerHTML = h + '</table></div><p class="small muted">Thông số đề xuất là bước điều chỉnh sơ bộ (±30 – 50 %) – có thể tinh chỉnh tiếp bằng tab Công cụ (độ nhạy/kịch bản). Biện pháp hóa chất cần kiểm chứng thí nghiệm; biện pháp công trình làm thay đổi thể tích/diện tích thiết kế (có thể gửi ngược về phần mềm thiết kế bằng ⇄ Trao đổi).</p>';
    box.querySelectorAll('[data-ap]').forEach(b => (b.onclick = async () => {
      const x = res.rows[+b.dataset.ap];
      if (!confirm('Áp dụng vào dự án: ' + x.a.title + '?\n(Lưu dự án trước nếu muốn giữ bản cũ.) Sau đó tính lại trạng thái ổn định.')) return;
      x.a.apply(APP.P);
      changed('all'); FS.render();
      await runSteady();
      showTab('res');
    }));
  }
  /* ---------- khuyến cáo thể tích bể phản ứng sinh học ----------
     Từ kết quả ổn định: SRT hiếu khí yêu cầu cho nitrat hóa (động học của chính mô hình, hệ số an toàn SF) so với SRT hiếu khí hiện có;
     khối bùn hiếu khí cần = SRT_hk,yc × bùn rời hệ; nếu MLSS cần vượt MLSS tối đa cho phép (bể lắng / màng / tỷ lệ gạn) → tăng thể tích.
     Khử nitrat: NOx ra > mục tiêu và bể thiếu khí còn NOx → thể tích thiếu khí thêm = NO₃ cần khử thêm / tốc độ khử hiện tại. */
  const VR = { SF: 1.5, mlssMax: null };
  function volAssess(P, S, sys) {
    const T = topo(P), m = MODELS[P.model], prm = Object.assign({}, m.defaults, P.params[m.id] || {});
    const AL = m.nitrAlias || (m.nitro ? { muA: 'muAOB', bA: 'bAOB', KOA: 'KOAOB', KNH: 'KNHA' } : {});   // ASM1N: nitrat hóa giới hạn bởi AOB; ASM3: tên tham số riêng
    for (const [a, b] of Object.entries(AL)) prm[a] = prm[b];
    const th = id => +((m.params.find(q => q.id === (AL[id] || id)) || {}).th || 1), Tc = +P.plant.T, L = limits(P);
    const rs = S.reactors, aerR = rs.filter(r => r.aerated), anR = rs.filter(r => !r.aerated);
    const cyc = rs.find(r => CYC.has(r.cu.type));
    if (!rs.length || !isFinite(S.SRT) || !(S.SRT > 0)) return { err: 'Chưa có bể sinh học hoặc chưa xác định được tuổi bùn (không có dòng bùn rời hệ).' };
    if (MODELS[P.model].nitro && P.units.some(u => u.type === 'influent' && u.p.inf && +u.p.inf.TKN > 300)) return { err: 'Sơ đồ xử lý nitơ dòng phụ (nước tách bùn NH₄ cao): đánh giá theo tải N (kg N/m³·d), tỷ lệ NO₂/NH₄ và quần thể AOB/NOB/anammox ở thẻ "Quần thể vi sinh chuyển hóa nitơ" – không áp dụng khuyến cáo thể tích theo nitrat hóa toàn phần.' };
    if (rs.some(r => r.cu.type === 'mbbr')) return { err: 'Sơ đồ có bể giá thể (MBBR/IFAS): nitrat hóa chủ yếu do màng vi sinh – thể tích đánh giá theo tải trọng bề mặt giá thể (g N/m²·d, xem bảng bể giá thể) thay cho tuổi bùn.' };
    const exitTSS = S.massR / S.SRT;                                       // kg TSS/d rời hệ sinh học (bùn dư + nước ra)
    const Vaer = aerR.reduce((a, r) => a + (CYC.has(r.cu.type) ? r.cu.N * (r.cu.Vmax + (r.cu.Vp || 0)) : r.info.V), 0);
    const mlss = aerR.length ? aerR.reduce((a, r) => a + r.c.TSS * r.info.V, 0) / aerR.reduce((a, r) => a + r.info.V, 0) : NaN;
    // DO hiệu dụng: bể chu kỳ dùng DO đặt (trung bình chu kỳ gồm pha không sục khí); dòng liên tục dùng DO thực TB bể sục khí
    const DOsp = cyc ? +cyc.cu.p.DOsp || 2 : aerR.length ? aerR.reduce((a, r) => a + Math.max(r.c.DO, 0) * r.info.V, 0) / aerR.reduce((a, r) => a + r.info.V, 0) : 2;
    const muT = +prm.muA * Math.pow(th('muA'), Tc - 20), bT = +prm.bA * Math.pow(th('bA'), Tc - 20);
    const KO = +(prm.KO2A ?? prm.KOA ?? 0.4), KN = +(prm.KNH4A ?? prm.KNH ?? 1);
    const Nt = Math.max(0.3, L.NH4 != null ? 0.5 * L.NH4 : 1), fDO = DOsp / (KO + DOsp), fN = Nt / (KN + Nt);
    const bEff = bT * (S.SRTaer > 0 ? S.SRT / S.SRTaer : 1);
    const net = muT * fDO * fN - bEff, SRTmin = net > 0 ? 1 / net : Infinity, SRTreq = VR.SF * SRTmin;
    // MLSS tối đa cho phép
    let mx = VR.mlssMax, mxWhy = 'nhập tay';
    if (!(mx > 0)) {
      if (rs.some(r => r.cu.type === 'mbr')) { mx = 12000; mxWhy = 'MBR: 8 000 – 12 000 mg/L (rửa màng, độ nhớt)'; }
      else if (cyc) {
        const q = cyc.cu.p, Hx = +q.Hmax || +q.H || 5, Hn = +q.Hmin || (q.Vmin && q.Vmax ? Hx * q.Vmin / q.Vmax : Hx * 0.7), svi = +q.SVI || 120;
        mx = Math.min(5000, Math.floor((1 - (Hx - Hn) / Hx - 0.5 / Hx) * 1e6 / svi / 50) * 50); mxWhy = `bể chu kỳ: tỷ lệ gạn ΔH/H ≤ 1 − MLSS·SVI/10⁶ − 0,5/H (M&E PT 8-50, SVI ${fmt(svi)}), tối đa 5 000`;
      } else if (T.clar.length) { mx = 4000; mxWhy = 'có bể lắng thứ cấp: 3 000 – 4 000 mg/L (tải chất rắn bể lắng)'; }
      else { mx = 4000; mxWhy = 'mặc định'; }
    }
    const R = { Tc, muT, bT, bEff, fDO, fN, DOsp, Nt, SRTmin, SRTreq, SRTaer: S.SRTaer, SRT: S.SRT, exitTSS, Vaer, mlss, mx, mxWhy, cyc: !!cyc, recs: [] };
    if (!isFinite(SRTreq)) { R.status = 'imp'; R.recs.push(`Ở ${fmt(Tc)} °C và DO ${fmt(DOsp)} mg/L, tốc độ sinh trưởng tối đa của vi khuẩn nitrat hóa không bù được phân hủy – tăng DO đặt hoặc kiểm tra nhiệt độ/tham số động học trước khi tính thể tích.`); return R; }
    // MLSS cần để SRT hiếu khí = yêu cầu với thể tích hiện có (khối bùn ∝ SRT; xấp xỉ bùn rời hệ không đổi)
    const k = SRTreq / Math.max(S.SRTaer, 1e-6);
    R.k = k; R.mlssNeed = mlss * k;
    if (R.mlssNeed > mx * 1.02) { R.status = 'vol'; R.Vreq = Vaer * R.mlssNeed / mx; R.dV = R.Vreq - Vaer; R.fV = R.Vreq / Vaer; }
    else if (k > 1) { R.status = 'mlss'; R.fWas = 1 / k; }
    else if (mlss > mx * 1.02) { R.status = 'wasUp'; R.fWas = mlss / mx; R.margin = (1 / k - 1) * 100; }     // SRT dư, MLSS vượt mức → tăng xả bùn
    else { R.status = 'ok'; R.margin = (1 / k - 1) * 100; }
    // khử nitrat (dòng liên tục có bể thiếu khí)
    const eff = S.sinks.find(x => x.cu.type === 'effluent');
    if (eff && !cyc) {
      const tgtNOx = L.NOx != null ? 0.8 * L.NOx : L.TN != null ? Math.max(1, 0.8 * (L.TN - (eff.c.TKN || 0))) : null;
      const anx = anR.filter(r => !/kỵ khí|anaer/i.test(r.cu.u.name) && r.info.Qin > 0);
      if (tgtNOx != null && eff.c.NOx > tgtNOx && anx.length) {
        const cv = c => sys.m.composites(c, sys.p20, {});
        const den = anx.reduce((a, r) => a + r.info.Qin * Math.max(0, cv(r.info.Cin).NOx - r.c.NOx) / 1000, 0), Van = anx.reduce((a, r) => a + r.info.V, 0);
        const rate = Van > 0 ? den / Van : 0, need = (eff.c.NOx - tgtNOx) * S.Qinf / 1000;
        const noxLeft = anx.reduce((a, r) => a + r.c.NOx * r.info.V, 0) / Van;
        R.dn = { tgtNOx, NOx: eff.c.NOx, den, Van, rate, need, noxLeft };
        if (noxLeft < 1) R.dn.status = 'ir';                               // thiếu khí đã cạn NO₃ → tăng tuần hoàn nội, không phải thể tích
        else if (rate > 0) { R.dn.status = 'vol'; R.dn.dV = need / rate; R.dn.fV = (Van + R.dn.dV) / Van; }
      }
    }
    return R;
  }
  function volCard(host) {
    if (!host) return;
    if (!APP.ss || APP.stale) { host.innerHTML = ''; return; }
    const P = APP.P, S = plantSummary(APP.ss.sys, APP.ss.det), A = volAssess(P, S, APP.ss.sys);
    if (A.err) { host.innerHTML = `<div class="card"><h2>Khuyến cáo thể tích bể phản ứng sinh học</h2><p class="muted">${esc(A.err)}</p></div>`; return; }
    const st = { ok: ['ok', 'Thể tích hiếu khí ĐỦ cho nitrat hóa' + (A.dn && A.dn.status === 'vol' ? ' – nhưng cần thêm thể tích thiếu khí (xem dưới)' : '')], mlss: ['warn', 'Chưa đủ SRT hiếu khí – xử lý được bằng tăng MLSS (giảm xả bùn), chưa cần tăng thể tích'], vol: ['bad', 'CẦN TĂNG THỂ TÍCH bể phản ứng sinh học'], imp: ['bad', 'Không đạt nitrat hóa chỉ bằng thể tích'], wasUp: ['warn', 'Thể tích ĐỦ – MLSS đang vượt mức tối đa, tăng xả bùn (SRT vẫn ≥ yêu cầu)'] }[A.status];
    let h = `<div class="card" style="border-left:4px solid var(--${st[0] === 'ok' ? 'ok' : st[0] === 'warn' ? 'warn' : 'bad'})"><h2>Khuyến cáo thể tích bể phản ứng sinh học</h2>
      <div class="msg ${st[0] === 'bad' ? 'err' : st[0]}"><b>${st[1]}</b></div>
      <div class="row" style="gap:12px;margin:6px 0"><label>Hệ số an toàn SRT <input type="number" step="0.1" id="vrSF" value="${VR.SF}" style="width:60px"></label>
        <label>MLSS tối đa cho phép <input type="number" step="50" id="vrMx" value="${VR.mlssMax || ''}" placeholder="${fmt(A.mx)}" style="width:80px"> mg/L</label><span class="small muted">${esc(A.mxWhy)}</span></div>
      <table class="t" style="max-width:900px"><tr><th class="l">Đại lượng</th><th>Giá trị</th><th class="l">Cơ sở</th></tr>
        <tr><td class="l">μA tại ${fmt(A.Tc)} °C · hệ số DO · hệ số NH₄</td><td>${fmt(A.muT)} · ${fmt(A.fDO)} · ${fmt(A.fN)}</td><td class="l small muted">động học mô hình ${esc(P.model)}; DO ${fmt(A.DOsp)} mg/L; NH₄ mục tiêu ${fmt(A.Nt)} mg/L (= 0,5 × giới hạn)</td></tr>
        <tr><td class="l">Phân hủy hiệu dụng b_A·SRT/SRT_hk</td><td>${fmt(A.bEff)} 1/d</td><td class="l small muted">phân hủy diễn ra cả trong vùng/pha không sục khí</td></tr>
        <tr><td class="l">SRT hiếu khí tối thiểu · yêu cầu (× SF ${fmt(VR.SF)})</td><td>${fmt(A.SRTmin)} · <b>${fmt(A.SRTreq)}</b> d</td><td class="l small muted">1/(μA·f_DO·f_NH₄ − b_hd)</td></tr>
        <tr><td class="l">SRT hiếu khí hiện có · SRT tổng</td><td><b>${fmt(A.SRTaer)}</b> · ${fmt(A.SRT)} d</td><td class="l small muted">kết quả ổn định (bể chu kỳ: × phân suất thời gian sục khí)</td></tr>
        <tr><td class="l">Thể tích hiếu khí${A.cyc ? ' (cả bể chu kỳ)' : ''} · MLSS TB</td><td>${fmt(A.Vaer)} m³ · ${fmt(A.mlss)} mg/L</td><td class="l small muted">bùn rời hệ ${fmt(A.exitTSS)} kg TSS/d</td></tr>`;
    if (A.status === 'mlss') h += `<tr><td class="l">MLSS cần để đạt SRT yêu cầu</td><td><b>${fmt(A.mlssNeed)}</b> mg/L</td><td class="l small muted">≤ MLSS tối đa ${fmt(A.mx)} → giảm xả bùn còn ≈ ${fmt(A.fWas * 100)} %</td></tr>`;
    if (A.status === 'vol') h += `<tr><td class="l">Thể tích hiếu khí cần (ở MLSS tối đa)</td><td><b>${fmt(A.Vreq)}</b> m³</td><td class="l small muted">V_hk·(SRT_yc/SRT_hk)·(MLSS/MLSS_max) → tăng <b>${fmt(A.dV)} m³ (× ${fmt(A.fV)})</b></td></tr>`;
    if (A.dn) {
      const d = A.dn;
      h += `<tr><td class="l">Khử nitrat: NOx ra · mục tiêu</td><td>${fmt(d.NOx)} · ${fmt(d.tgtNOx)} mg/L</td><td class="l small muted">mục tiêu = 0,8 × giới hạn NOx (hoặc TN − TKN ra)</td></tr>
        <tr><td class="l">Tốc độ khử nitrat hiện tại vùng thiếu khí</td><td>${fmt(d.rate * 1000)} g N/m³·d</td><td class="l small muted">${fmt(d.den)} kg N/d trong ${fmt(d.Van)} m³; NOx còn lại TB ${fmt(d.noxLeft)} mg/L</td></tr>`;
      if (d.status === 'vol') h += `<tr><td class="l">Thể tích thiếu khí cần thêm</td><td><b>${fmt(d.dV)}</b> m³</td><td class="l small muted">NO₃ cần khử thêm ${fmt(d.need)} kg N/d ÷ tốc độ hiện tại (× ${fmt(d.fV)}) – nếu thiếu carbon thì bổ sung carbon ngoài hiệu quả hơn</td></tr>`;
      if (d.status === 'ir') h += `<tr><td class="l">Khử nitrat</td><td>–</td><td class="l small muted">vùng thiếu khí đã cạn NO₃ → tăng tuần hoàn nội thay vì tăng thể tích</td></tr>`;
    }
    h += '</table><ul class="small" style="margin:6px 0">';
    if (A.status === 'ok') h += `<li>SRT hiếu khí dư ${fmt(A.margin)} % so với yêu cầu – không cần tăng thể tích bể hiếu khí.</li>`;
    for (const t of A.recs) h += `<li>${esc(t)}</li>`;
    if (A.status === 'mlss') h += `<li>Giảm xả bùn để SRT hiếu khí tăng ${fmt((A.k - 1) * 100)} % (MLSS ≈ ${fmt(A.mlssNeed)} mg/L); kiểm tra tải chất rắn bể lắng / tỷ lệ gạn sau khi áp dụng.</li>`;
    if (A.status === 'vol') h += `<li>Tăng thể tích bể hiếu khí${A.cyc ? ' (diện tích bể chu kỳ)' : ''} thêm ${fmt(A.dV)} m³ (× ${fmt(A.fV)}) và vận hành MLSS ≈ ${fmt(A.mx)} mg/L; hoặc tăng DO / kiểm tra nhiệt độ thiết kế bất lợi nếu có cơ sở.</li>`;
    if (A.status === 'wasUp') h += `<li>SRT hiếu khí dư ${fmt(A.margin)} % nhưng MLSS ${fmt(A.mlss)} mg/L > ${fmt(A.mx)} mg/L (${esc(A.mxWhy)}): tăng xả bùn × ${fmt(A.fWas)} để MLSS ≈ ${fmt(A.mx)} mg/L – không cần tăng thể tích.</li>`;
    h += '</ul><div class="btnrow">';
    if (A.status === 'mlss' || A.status === 'vol') h += `<button id="vrWas">Giảm xả bùn ${A.status === 'vol' ? 'tới MLSS tối đa' : '(tăng SRT)'} rồi tính lại</button>`;
    if (A.status === 'wasUp') h += `<button id="vrWas">Tăng xả bùn × ${fmt(A.fWas)} rồi tính lại</button>`;
    if (A.status === 'vol') h += `<button class="pri" id="vrVol">Tăng thể tích hiếu khí × ${fmt(A.fV)} rồi tính lại</button>`;
    if (A.dn && A.dn.status === 'vol') h += `<button id="vrAnx">Tăng thể tích thiếu khí × ${fmt(A.dn.fV)} rồi tính lại</button>`;
    h += '<span class="small muted">Thay đổi áp dụng vào dự án; có thể gửi thể tích mới về phần mềm thiết kế bằng ⇄ Trao đổi.</span></div></div>';
    host.innerHTML = h;
    const redo = () => volCard(host);
    host.querySelector('#vrSF').onchange = e => { VR.SF = Math.max(1, +e.target.value || 1.5); redo(); };
    host.querySelector('#vrMx').onchange = e => { const v = +e.target.value; VR.mlssMax = v > 0 ? v : null; redo(); };
    const go = async (label, fn) => { if (APP.running) return; if (!confirm('Áp dụng: ' + label + '?\n(Lưu dự án trước nếu muốn giữ bản cũ.) Sau đó tính lại trạng thái ổn định.')) return; fn(APP.P); changed('all'); FS.render(); await runSteady(); showTab('res'); };
    const bW = host.querySelector('#vrWas'); if (bW) bW.onclick = () => go(A.status === 'wasUp' ? 'tăng xả bùn' : 'giảm xả bùn', P2 => wasScale(P2, topo(P2), Math.max(0.2, A.status === 'vol' ? Math.min(1, A.mlss / A.mx) : A.fWas)));
    const bV = host.querySelector('#vrVol'); if (bV) bV.onclick = () => go('tăng thể tích hiếu khí × ' + fmt(A.fV), P2 => scaleAer(P2, A.fV));
    const bA = host.querySelector('#vrAnx'); if (bA) bA.onclick = () => go('tăng thể tích thiếu khí × ' + fmt(A.dn.fV), P2 => { for (const u of topo(P2).anox) u.p.V = Math.round(u.p.V * A.dn.fV); });
  }
  // tăng thể tích hiếu khí: bể liên tục có sục khí (trừ bể màng) × f; bể chu kỳ: diện tích (ICEAS/C-Tech) hoặc V (SBR) × f
  function scaleAer(P2, f) {
    const T = topo(P2);
    if (T.cyc) { const c = U(P2, T.cyc.id); if (c.type === 'sbr') { c.p.Vmax = Math.round(c.p.Vmax * f); c.p.Vmin = Math.round(c.p.Vmin * f); } else c.p.A = Math.round(c.p.A * f); return; }
    for (const u of T.aer) if (u.type !== 'mbr') U(P2, u.id).p.V = Math.round(u.p.V * f);
  }
  /* ---------- kiểm tra đồng nhất thông số giữa các phần (sơ đồ ↔ bản tính thiết kế ↔ máy thổi ↔ bộ điều khiển ↔ kết quả) ---------- */
  function consistency(P, S) {
    const out = [], D = P.design, dv = id => { const x = D && D.params && D.params.find(q => q.id === id); return x && x.v != null && isFinite(+x.v) ? +x.v : null; };
    const W = (t, lvl) => out.push({ lvl: lvl || 'warn', t });
    const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
    const by = Object.fromEntries(P.units.map(u => [u.id, u]));
    const cycU = P.units.filter(u => CYC.has(u.type)), aerU = P.units.filter(u => ['cstr', 'mbr', 'mbbr'].includes(u.type) && u.p.aer === 'do');
    const Qin = P.units.filter(u => u.type === 'influent').reduce((a, u) => a + (+u.p.Q || 0), 0);
    // máy thổi khí: DO chung ghi đè DO đặt của từng bể
    for (const b of P.units.filter(u => u.type === 'blower')) {
      const zs = (b.p.zones || []).map(id => by[id]).filter(Boolean);
      if (b.p.doMode === 'common') { const diff = zs.filter(z => z.p.DOsp != null && Math.abs(+z.p.DOsp - +b.p.DOsp) > 0.05); if (diff.length) W(`${b.name}: điều khiển DO chung ${fmt(b.p.DOsp)} mg/L – DO đặt riêng của ${diff.map(z => z.name + ' (' + fmt(z.p.DOsp) + ')').join(', ')} không được dùng.`, 'info'); }
    }
    // bộ điều khiển trùng tác động / giá trị đặt khác thông số bể
    const acts = {};
    for (const c of (P.ctrls || []).filter(c => c.on !== false)) { const k = c.unit + '|' + c.act; (acts[k] = acts[k] || []).push(c); }
    for (const [k, cs] of Object.entries(acts)) if (cs.length > 1) W(`${cs.length} bộ điều khiển cùng tác động "${k.split('|')[1]}" của ${(by[k.split('|')[0]] || {}).name || k.split('|')[0]} (${cs.map(c => c.name || c.id).join(', ')}) – chỉ nên giữ một.`, 'err');
    for (const c of (P.ctrls || []).filter(c => c.on !== false && c.v === 'DO' && c.act !== 'DOsp')) { const u = by[c.munit || c.unit]; if (u && u.p.aer === 'do' && u.p.DOsp != null && Math.abs(+u.p.DOsp - +c.sp) > 0.05) W(`Bộ điều khiển "${c.name || c.id}" giữ DO = ${fmt(c.sp)} mg/L tại ${u.name}, trong khi bể đặt DO ${fmt(u.p.DOsp)} mg/L (chế độ "Điều khiển DO") – hai giá trị đặt chồng nhau.`); }
    // so với bản tính thiết kế
    if (D) {
      const tag = ' (bản tính: ' + (D.title || D.file || 'thiết kế') + ')';
      if (dv('T') != null && Math.abs(dv('T') - +P.plant.T) > 0.5) W(`Nhiệt độ mô phỏng ${fmt(P.plant.T)} °C khác nhiệt độ thiết kế sinh học ${fmt(dv('T'))} °C${tag} – SRT, nitrat hóa và kết quả so sánh không cùng điều kiện.`);
      if (dv('Q') != null && Qin > 0 && rel(Qin, dv('Q')) > 0.02) W(`Lưu lượng vào sơ đồ ${fmt(Qin)} m³/d khác lưu lượng thiết kế ${fmt(dv('Q'))} m³/d${tag}.`);
      if (dv('DO') != null) { const ds = cycU.concat(aerU).filter(u => u.p.DOsp != null && Math.abs(+u.p.DOsp - dv('DO')) > 0.05); if (ds.length) W(`DO đặt ${ds.map(u => u.name + ' ' + fmt(u.p.DOsp)).join(', ')} mg/L khác DO thiết kế ${fmt(dv('DO'))} mg/L${tag}.`, 'info'); }
      if (dv('SVI') != null) { const ds = cycU.filter(u => u.p.SVI != null && Math.abs(+u.p.SVI - dv('SVI')) > 1); if (ds.length) W(`SVI mô hình lắng ${ds.map(u => u.name + ' ' + fmt(u.p.SVI)).join(', ')} mL/g khác SVI thiết kế ${fmt(dv('SVI'))} mL/g${tag}.`, 'info'); }
      if (dv('N') != null) { const ds = cycU.filter(u => +u.p.N !== Math.round(dv('N'))); if (ds.length) W(`Số bể ${ds.map(u => u.name + ' ' + u.p.N).join(', ')} khác bản tính (${Math.round(dv('N'))} bể).`); }
      if (dv('TSSe') != null) { const ds = cycU.filter(u => u.p.TSSe != null && u.p.sm === 'ideal' && Math.abs(+u.p.TSSe - dv('TSSe')) > 0.5); if (ds.length) W(`TSS gạn ${ds.map(u => u.name + ' ' + fmt(u.p.TSSe)).join(', ')} mg/L khác TSS ra thiết kế ${fmt(dv('TSSe'))} mg/L${tag}.`, 'info'); }
      if (S && dv('SRTd') != null && isFinite(S.SRT) && rel(S.SRT, dv('SRTd')) > 0.1) W(`Tuổi bùn mô hình ${fmt(S.SRT)} d lệch ${fmt(rel(S.SRT, dv('SRTd')) * 100)} % so với tuổi bùn thiết kế ${fmt(dv('SRTd'))} d${tag} – dùng "Tự hiệu chỉnh xả bùn để SRT = thiết kế" ở tab Bản tính.`);
    }
    // tuổi bùn: định nghĩa & quan hệ giữa các chỉ số
    for (const u of cycU.filter(u => u.p.wasMode === 'srt')) {
      if (S && isFinite(S.SRT)) {
        if (S.SRT > +u.p.SRTw * 1.02) W(`${u.name}: SRT hệ ${fmt(S.SRT)} d lớn hơn SRT xả mục tiêu ${fmt(u.p.SRTw)} d – không hợp lý (SRT hệ = khối bùn/(bùn xả + bùn theo nước ra) ≤ SRT xả); kiểm tra lại kết quả ổn định.`, 'err');
        else W(`${u.name}: SRT xả mục tiêu ${fmt(u.p.SRTw)} d (khối bùn / bùn xả) ↔ SRT hệ ${fmt(S.SRT)} d (tính cả bùn theo nước gạn) ↔ SRT hiếu khí ${fmt(S.SRTaer)} d (× phân suất thời gian sục khí). Ba chỉ số khác nhau theo định nghĩa – SRT hệ tương ứng MCRT của bản tính Sanitaire/M&E.`, 'info');
      }
    }
    if (S && isFinite(S.SRT) && S.SRTaer > S.SRT * 1.0001) W(`SRT hiếu khí ${fmt(S.SRTaer)} d > SRT tổng ${fmt(S.SRT)} d – không hợp lý.`, 'err');
    // giới hạn xả: theo bản tính hay tự đặt
    if (D && P.limits && P.limits.src && P.limits.src !== 'design') { const fd = fromDesign(P); if (fd) { const dif = Object.keys(fd).filter(k => P.limits.v[k] != null && Math.abs(P.limits.v[k] - fd[k]) > 1e-6); if (dif.length) W(`Giới hạn xả đang dùng (${P.limits.src}) khác giới hạn của bản tính thiết kế ở ${dif.join(', ')} – kết quả "Đạt/Không đạt" và gợi ý xử lý theo giới hạn đang dùng.`, 'info'); } }
    return out;
  }
  function consistencyHTML(P, S) {
    const L = consistency(P, S); if (!L.length) return '';
    const cls = { err: 'err', warn: 'warn', info: 'ok' };
    return `<div class="card"><h2>Kiểm tra đồng nhất thông số giữa các phần</h2>${L.map(x => `<div class="msg ${cls[x.lvl]}">${x.lvl === 'info' ? 'ℹ ' : ''}${esc(x.t)}</div>`).join('')}</div>`;
  }
  return { LIM_PRESETS, limits, limitsUI, failsOf, diagnose, actions, run, card, topo, volAssess, volCard, consistency, consistencyHTML };
})();
