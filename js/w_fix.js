'use strict';
/* ==========================================================================
   SimNước – GỢI Ý XỬ LÝ CHỈ TIÊU CHƯA ĐẠT
   1. Chẩn đoán: chỉ tiêu nào của nước thành phẩm vượt/thiếu so với tiêu chuẩn đang chọn, nguyên nhân thường gặp.
   2. Biện pháp theo quy tắc kỹ thuật nước cấp/tái sử dụng/nước siêu sạch – ba nhóm:
        vận hành (đổi thông số/giá trị đặt), hóa chất (thêm/tăng châm, bộ điều khiển), công trình (chèn thêm đơn vị).
   3. Thử từng biện pháp trên bản sao dự án (giải ổn định có bộ điều khiển) → chỉ tiêu trước/sau, chỉ tiêu mới bị vượt,
      thay đổi điện năng, chi phí hóa chất, hiệu suất thu hồi; phương án kết hợp (tham lam) cho nhiều chỉ tiêu.
   4. Áp dụng biện pháp đã chọn vào dự án thật.
   ========================================================================== */
const WFIX = (() => {
  const CL = new Set(['NaOCl', 'Cl2']), BASE = new Set(['NaOH', 'lime', 'soda', 'NaHCO3']), ACID = new Set(['HCl', 'H2SO4', 'CO2']);
  const COAG = new Set(['alum', 'PACl', 'AlCl3', 'FeCl3', 'Fe2SO43']);
  const MICRO = new Set(['Ecoli', 'Crypto', 'Giardia', 'Virus']);
  const KIND = { vh: ['Vận hành', '#0f62c9'], hc: ['Hóa chất', '#b45309'], ct: ['Công trình', '#7c3aed'] };
  const clone = o => JSON.parse(JSON.stringify(o));
  const r2 = v => +(+v).toPrecision(2);
  const nameOf = k => { const s = WQ.SUMMARY.find(v => v[0] === k); return s ? s[1] : (WQ.D[k] ? WQ.D[k].name : k); };
  const unitOf = k => { const s = WQ.SUMMARY.find(v => v[0] === k); return s ? s[2] : (WQ.D[k] ? WQ.D[k].u : ''); };

  /* ---------- sửa sơ đồ trên bản sao ---------- */
  function newId(P, pre) { let i = 1; while (P.units.some(u => u.id === pre + i)) i++; return pre + i; }
  function newLink(P, from, to) { let i = P.links.length + 1; while (P.links.some(l => l.id === 'L' + i)) i++; const l = { id: 'L' + i, from, to }; P.links.push(l); return l; }
  /* chèn đơn vị vào đường ống đi vào cửa "in" của đơn vị đích; cửa ra phụ (nước đặc, tái sinh, thải) nối sang dòng thải mới */
  function insertBefore(P, targetId, type, name, p) {
    const l = P.links.find(x => x.to[0] === targetId && x.to[1] === 'in'); if (!l) return null;
    const tu = P.units.find(u => u.id === targetId), fu = P.units.find(u => u.id === l.from[0]) || tu;
    const id = newId(P, (typeof FS !== 'undefined' && FS.prefix && FS.prefix[type]) || type.toUpperCase());
    const x = Math.round(((fu.x + tu.x) / 2) / 10) * 10, y = tu.y + 90;
    P.units.push({ id, type, name, x, y, p: Object.assign(WU[type].def(), p || {}) });
    const to = l.to; l.to = [id, 'in'];
    newLink(P, [id, WU[type].outs[0]], to);
    WU[type].outs.slice(1).forEach((port, j) => {
      const wid = newId(P, 'W'); P.units.push({ id: wid, type: 'waste', name: name + ' – ' + (WRES_LBL && WRES_LBL[port] || port), x: x + 40 * j, y: y + 90, p: WU.waste.def() });
      newLink(P, [id, port], [wid, 'in']);
    });
    return id;
  }
  const insertAfter = (P, unitId, type, name, p) => { const l = P.links.find(x => x.from[0] === unitId && x.from[1] === WU[P.units.find(u => u.id === unitId).type].outs[0]); return l ? insertBefore(P, l.to[0], type, name, p) : null; };
  const U = (P, id) => P.units.find(u => u.id === id);
  const mul = (id, k, f, lo, hi) => P => { const u = U(P, id); if (u) u.p[k] = Math.min(Math.max(+u.p[k] * f, lo ?? -Infinity), hi ?? Infinity); };
  const setp = (id, o) => P => { const u = U(P, id); if (u) Object.assign(u.p, o); };
  const addCtrl = (o) => P => { let i = 1; while (P.ctrls.some(c => c.id === 'C' + i)) i++; P.ctrls.push(Object.assign({ id: 'C' + i, on: true, lo: 0, hi: 10, kp: 0.5, ti: 1, dir: 'dir' }, o)); };
  const seq = (...fs) => P => fs.forEach(f => f && f(P));

  /* ---------- 1. đánh giá tuân thủ ---------- */
  function fails(sys, r, stdOf) {
    const out = [];
    for (const u of sys.units.filter(x => x.type === 'product')) {
      const w = r.info[u.id] && r.info[u.id]._in; if (!w || !(w.Q > 0)) continue;
      for (const x of WSIM.compliance(w, stdOf(u.id))) if (!x.ok) {
        const lim = (WSTD[stdOf(u.id)] || {}).lim[x.k];
        out.push({ pid: u.id, pname: u.name, k: x.k, v: x.v, lim, limTxt: x.lim, mic: x.mic, low: Array.isArray(lim) && x.v < lim[0] });
      }
    }
    return out;
  }
  function evaluate(P, apply, stdOf) {
    const Pc = clone(P);
    try { if (apply) apply(Pc); } catch (e) { return { err: 'không áp dụng được: ' + e.message }; }
    const r = WSIM.steady(Pc);
    if (r.errors) return { err: r.errors[0] };
    const S = WSIM.summary(r.sys, r), F = fails(r.sys, r, stdOf);
    const val = {};
    for (const u of r.sys.units.filter(x => x.type === 'product')) { const w = r.info[u.id] && r.info[u.id]._in; if (w) for (const x of WSIM.compliance(w, stdOf(u.id))) val[u.id + ':' + x.k] = x.v; }
    return { S, F, val, conv: r.conv, P: Pc };
  }

  /* ---------- 2. chẩn đoán & biện pháp theo quy tắc ---------- */
  function diagnose(f, P, r) {
    const G = WCTL.graph(P), ups = G.ups(f.pid), has = t => ups.some(u => u.type === t);
    const doses = ups.filter(u => u.type === 'dose'), chemUp = c => doses.some(d => c.has(d.p.chem));
    switch (f.k) {
      case 'Cl2f': return f.low ? (chemUp(CL) ? 'Clo bị tiêu thụ trước khi tới điểm dùng (NH₄, NOM, Fe²⁺/Mn²⁺, thời gian tiếp xúc dài) hoặc liều chưa đủ.' : 'Không có châm clo phía trước nước thành phẩm – nước không có clo dư bảo vệ mạng lưới.') : 'Liều clo cao hơn nhu cầu.';
      case 'pH': return f.low ? 'Nước có tính axit (sau RO, trao đổi ion H⁺, châm phèn/clo khí, CO₂ tự do cao).' : 'pH cao (làm mềm vôi, châm kiềm dư, quang hợp/khử khí CO₂).';
      case 'turb': case 'TSS': return 'Chất rắn lơ lửng chưa được giữ lại: keo tụ chưa tối ưu, tải lắng/lọc cao' + (has('filter') ? '' : ', không có công đoạn lọc') + '.';
      case 'TOC': case 'DOC': return 'Chất hữu cơ hòa tan (NOM, chất hữu cơ nước thải) ít bị khử bởi lắng – lọc; cần keo tụ tăng cường, hấp phụ than, oxy hóa sinh học hoặc màng RO.';
      case 'THM': return 'THM hình thành khi clo phản ứng với NOM – càng nhiều clo tự do, NOM, thời gian và pH cao thì càng nhiều' + (doses.some(d => CL.has(d.p.chem) && ups.indexOf(d) > ups.findIndex(u => ['coag', 'settler', 'filter'].includes(u.type)) && ups.findIndex(u => ['coag', 'settler', 'filter'].includes(u.type)) >= 0) ? ' (có clo hóa sơ bộ trước khi khử NOM)' : '') + '.';
      case 'NO3': case 'TN': return 'Nitrat không bị khử bởi xử lý thông thường (keo tụ, lọc, clo); nitrat hóa trong lọc sinh học còn làm tăng NO₃ – cần trao đổi ion chọn lọc nitrat, RO/NF hoặc pha loãng.';
      case 'NO2': return 'Nitrit do nitrat hóa chưa hoàn toàn hoặc khử nitrat; bị clo oxy hóa nhanh.';
      case 'NH4': return 'Amoni cần clo hóa điểm đột biến (≈ 7,6 mg Cl₂/mg N) hoặc nitrat hóa sinh học trong lọc.';
      case 'Fe': return 'Fe²⁺ cần được oxy hóa (làm thoáng, clo, KMnO₄) thành Fe(OH)₃ rồi lọc giữ lại.';
      case 'Mn': return 'Mn²⁺ oxy hóa chậm bằng oxy – cần KMnO₄/clo hoặc vật liệu lọc phủ MnOₓ.';
      case 'Al': return 'Nhôm dư do pH keo tụ lệch vùng tối ưu (6 – 7) hoặc quá liều phèn nhôm.';
      case 'hard': return 'Độ cứng (Ca, Mg) chỉ giảm khi làm mềm vôi, trao đổi cation hoặc NF/RO.';
      case 'TDS': case 'Cl': case 'SO4': case 'Na': case 'EC': return 'Muối hòa tan chỉ giảm bằng khử khoáng (RO/NF, EDI, trao đổi ion) hoặc pha loãng.';
      case 'SiO2': return 'Silica hòa tan cần RO + trao đổi anion bazơ mạnh/mixed bed.';
      case 'F': return 'Florua cần kết tủa CaF₂ (nồng độ cao), nhôm oxit hoạt hóa hoặc RO.';
      case 'BrO3': return 'Bromat sinh ra khi ozone hóa nước có bromua – tăng theo liều ozone và pH.';
      case 'PFOA': case 'PFOS': case 'MP': return 'Vi chất bền (PFAS, vi chất hữu cơ) cần GAC thời gian tiếp xúc dài, nhựa chọn lọc hoặc RO.';
      default: return MICRO.has(f.k) ? 'Chưa đủ hàng rào khử trùng/loại bỏ vi sinh (log) – Cryptosporidium/Giardia kháng clo, cần lọc tốt, UV hoặc ozone.' : '';
    }
  }

  function actions(P, r, F) {
    const G = WCTL.graph(P), A = [], seen = new Set();
    const add = a => { if (seen.has(a.key)) { const o = A.find(x => x.key === a.key); a.fixes.forEach(k => { if (!o.fixes.includes(k)) o.fixes.push(k); }); return; } seen.add(a.key); A.push(a); };
    for (const f of F) {
      const ups = G.ups(f.pid), pid = f.pid, prod = U(P, pid);
      const Qp = (r.info[pid] && r.info[pid]._in && r.info[pid]._in.Q) || 1000;
      const doses = ups.filter(u => u.type === 'dose'), first = t => ups.slice().reverse().find(u => u.type === t), last = t => ups.find(u => u.type === t);
      const clD = doses.find(d => CL.has(d.p.chem)), coagD = doses.find(d => COAG.has(d.p.chem));
      const ctrlOn = d => (P.ctrls || []).find(c => c.unit === d.id && c.on !== false);
      const lim = f.lim, k = f.k;
      const roSize = () => { const area = Qp / 24 * 1000 / 18, nv = Math.max(2, Math.ceil(area / (37.2 * 7))); return { mem: 'BWLE', rec: 80, nSt: '2', v1: Math.ceil(nv * 0.65), v2: Math.max(1, nv - Math.ceil(nv * 0.65)), nE: 7 }; };
      const ixSize = type => ({ type, V: r2(Math.max(Qp / 24 / 16, 0.5)), nCol: 2 });
      const fix = [k];
      if (k === 'Cl2f') {
        const tgt = Array.isArray(lim) ? Math.min(Math.max(0.5, lim[0] + 0.2), (lim[0] + lim[1]) / 2) : 0.5;
        const inL = P.links.find(l => l.to[0] === pid && l.to[1] === 'in');
        if (clD) {
          const c = ctrlOn(clD);
          if (c) add({ key: 'clsp', kind: 'vh', fixes: fix, title: `Đổi giá trị đặt bộ ĐK "${c.name || c.id}"`, desc: `${c.v === 'Cl2tot' ? 'clo tổng' : 'clo tự do'} đặt ${fmt(c.sp)} → ${fmt(f.low ? c.sp + (tgt - f.v) : Math.max(c.sp - (f.v - tgt), 0.2))} mg/L`,
            apply: P2 => { const cc = P2.ctrls.find(x => x.id === c.id); cc.sp = r2(f.low ? cc.sp + (tgt - f.v) : Math.max(cc.sp - (f.v - tgt), 0.2)); } });
          else add({ key: 'clctl', kind: 'hc', fixes: fix, title: 'Bộ điều khiển clo dư nước thành phẩm', desc: `liều ${clD.name} tự điều chỉnh để clo tự do vào ${prod.name} = ${fmt(tgt)} mg/L`,
            apply: seq(setp(clD.id, { mode: 'fixed' }), addCtrl({ name: 'Clo dư nước thành phẩm', unit: clD.id, param: 'dose', ref: inL ? inL.id : 'U:' + pid, v: 'Cl2f', sp: tgt, hi: Math.max(15, 5 * clD.p.dose), kp: 0.5, ti: 1 })) });
        } else if (f.low) add({ key: 'cladd', kind: 'hc', fixes: fix, title: 'Thêm châm Javen (NaOCl) + bộ điều khiển clo dư', desc: `chèn đơn vị châm NaOCl trước ${prod.name}, liều tự điều chỉnh để clo tự do = ${fmt(tgt)} mg/L (nên có bể tiếp xúc ≥ 30 phút)`,
          apply: P2 => { const id = insertBefore(P2, pid, 'dose', 'Châm NaOCl (clo dư)', { chem: 'NaOCl', mode: 'fixed', dose: 1 }); const l = P2.links.find(x => x.from[0] === id); addCtrl({ name: 'Clo dư nước thành phẩm', unit: id, param: 'dose', ref: l.id, v: 'Cl2f', sp: tgt, hi: 15, kp: 0.5, ti: 1 })(P2); } });
      }
      else if (k === 'pH') {
        const tgt = Array.isArray(lim) ? Math.min(Math.max(7.5, lim[0] + 0.3), lim[1] - 0.3) : 7.5;
        const near = doses.slice(0, 3).find(d => (f.low ? BASE : ACID).has(d.p.chem));
        if (near) add({ key: 'phset', kind: 'vh', fixes: fix, title: `${near.name}: chuyển sang điều chỉnh pH tự động`, desc: `chế độ "Điều chỉnh tới pH đặt" = ${fmt(tgt)}`, apply: setp(near.id, { mode: 'pH', pHset: tgt }) });
        else add({ key: 'phadd', kind: 'hc', fixes: fix, title: `Thêm châm ${f.low ? 'xút NaOH' : 'axit H₂SO₄'} điều chỉnh pH`, desc: `chèn đơn vị châm trước ${prod.name}, pH đặt ${fmt(tgt)}`,
          apply: P2 => insertBefore(P2, pid, 'dose', f.low ? 'Châm NaOH (ổn định pH)' : 'Châm H₂SO₄ (hạ pH)', { chem: f.low ? 'NaOH' : 'H2SO4', mode: 'pH', pHset: tgt, dose: 5 }) });
      }
      else if (k === 'turb' || k === 'TSS') {
        if (coagD) add({ key: 'coagUp', kind: 'hc', fixes: fix, title: `Tăng liều keo tụ ${coagD.name} 50 %`, desc: `${fmt(coagD.p.dose)} → ${fmt(coagD.p.dose * 1.5)} mg/L (kiểm chứng Jartest)`, apply: mul(coagD.id, 'dose', 1.5) });
        const fl = last('filter'); if (fl) add({ key: 'filtA', kind: 'ct', fixes: fix, title: `Giảm tốc độ lọc ${fl.name} (tăng diện tích 50 %)`, desc: `diện tích lọc ${fmt(fl.p.A)} → ${fmt(fl.p.A * 1.5)} m²`, apply: mul(fl.id, 'A', 1.5) });
        const st = last('settler'); if (st) add({ key: 'setA', kind: 'ct', fixes: fix, title: `Tăng diện tích lắng ${st.name} 50 %`, desc: `${fmt(st.p.A)} → ${fmt(st.p.A * 1.5)} m²`, apply: mul(st.id, 'A', 1.5) });
        if (!ups.some(u => ['mf', 'ufs', 'ro'].includes(u.type))) add({ key: 'ufAdd', kind: 'ct', fixes: fix, title: 'Thêm màng UF (lọc tinh)', desc: `chèn UF trước ${prod.name} – độ đục < 0,1 NTU, hàng rào vi sinh`, apply: P2 => insertBefore(P2, pid, 'ufs', 'UF lọc tinh') });
      }
      else if (['TOC', 'DOC', 'THM'].includes(k)) {
        if (k === 'THM' && clD) {
          const preIdx = ups.findIndex(u => ['coag', 'settler', 'filter'].includes(u.type));
          const pre = doses.filter(d => CL.has(d.p.chem) && preIdx >= 0 && ups.indexOf(d) > preIdx);
          for (const d of pre) add({ key: 'preCl' + d.id, kind: 'vh', fixes: fix, title: `Giảm clo hóa sơ bộ ${d.name} 70 %`, desc: `${fmt(d.p.dose)} → ${fmt(d.p.dose * 0.3)} mg/L – clo hóa sau khi đã khử NOM`, apply: mul(d.id, 'dose', 0.3) });
          add({ key: 'chloram', kind: 'hc', fixes: fix, title: 'Chuyển sang cloramin (thêm NH₄Cl tỉ lệ Cl₂:N = 4,5)', desc: `chèn châm NH₄Cl ngay sau ${clD.name}, liều theo tỉ lệ – cloramin tạo rất ít THM`,
            apply: P2 => insertAfter(P2, clD.id, 'dose', 'Châm NH₄Cl (cloramin)', { chem: 'NH4Cl', mode: 'ratio', ratio: 4.5, dose: 0.5 }) });
        }
        if (coagD) add({ key: 'coagEnh', kind: 'hc', fixes: fix, title: `Keo tụ tăng cường: ${coagD.name} +80 %`, desc: `${fmt(coagD.p.dose)} → ${fmt(coagD.p.dose * 1.8)} mg/L (khử NOM; thường kèm hạ pH keo tụ)`, apply: mul(coagD.id, 'dose', 1.8) });
        const gac = last('gac');
        if (gac) add({ key: 'gacEBCT', kind: 'ct', fixes: fix, title: `Tăng EBCT ${gac.name} gấp đôi`, desc: `${fmt(gac.p.EBCT)} → ${fmt(gac.p.EBCT * 2)} phút; than mới hơn (tuổi ${fmt(gac.p.age)} → ${fmt(gac.p.age / 2)} ngày)`, apply: seq(mul(gac.id, 'EBCT', 2), mul(gac.id, 'age', 0.5)) });
        else add({ key: 'gacAdd', kind: 'ct', fixes: fix, title: 'Thêm lọc than hoạt tính GAC', desc: `chèn GAC (EBCT 15 phút) trước ${prod.name}`, apply: P2 => insertBefore(P2, pid, 'gac', 'Lọc than GAC', { EBCT: 15, bio: 'no', tgt: 'DOC', age: 60 }) });
        if (k !== 'THM' && !ups.some(u => u.type === 'ro')) add({ key: 'roAdd', kind: 'ct', fixes: fix, title: 'Thêm RO (áp thấp)', desc: `chèn RO BWLE thu hồi 80 % trước ${prod.name} (nước đặc ra dòng thải)`, apply: P2 => insertBefore(P2, pid, 'ro', 'RO khử hữu cơ/khoáng', roSize()) });
        if (k !== 'THM' && ups.some(u => u.type === 'ro')) add({ key: 'mbTOC', kind: 'ct', fixes: fix, title: 'Thêm RO lần 2', desc: `chèn RO thứ hai (BWLE) trước ${prod.name}`, apply: P2 => insertBefore(P2, pid, 'ro', 'RO lần 2', roSize()) });
      }
      else if (k === 'NO3' || k === 'TN') {
        const ix = ups.find(u => u.type === 'ix' && u.p.type === 'SBACl');
        if (ix) add({ key: 'ixV', kind: 'ct', fixes: fix, title: `Tăng thể tích nhựa ${ix.name} 50 %`, desc: `${fmt(ix.p.V)} → ${fmt(ix.p.V * 1.5)} m³`, apply: mul(ix.id, 'V', 1.5) });
        else add({ key: 'ixNO3', kind: 'ct', fixes: fix, title: 'Thêm trao đổi ion khử nitrat (anion bazơ mạnh dạng Cl)', desc: `chèn cột IX SBA-Cl ${fmt(ixSize('SBACl').V)} m³ nhựa trước ${prod.name}; nước muối tái sinh ra dòng thải`, apply: P2 => insertBefore(P2, pid, 'ix', 'IX khử nitrat', ixSize('SBACl')) });
        if (!ups.some(u => u.type === 'ro')) add({ key: 'roAdd', kind: 'ct', fixes: fix, title: 'Thêm RO (áp thấp)', desc: `chèn RO BWLE thu hồi 80 % trước ${prod.name}`, apply: P2 => insertBefore(P2, pid, 'ro', 'RO khử nitrat/khoáng', roSize()) });
        const bf = ups.filter(u => (u.type === 'filter' || u.type === 'gac') && u.p.bio === 'yes');
        if (bf.length) add({ key: 'noNit', kind: 'vh', fixes: fix, title: 'Tắt nitrat hóa sinh học trong lọc', desc: `${bf.map(u => u.name).join(', ')}: NH₄ → NO₃ trong lọc sinh học làm tăng nitrat (cần xử lý NH₄ bằng clo điểm đột biến)`, apply: P2 => bf.forEach(u => setp(u.id, { bio: 'no' })(P2)) });
      }
      else if (k === 'NH4' || k === 'NO2') {
        if (clD) add({ key: 'bp', kind: 'hc', fixes: fix, title: 'Clo hóa điểm đột biến (bộ ĐK clo tự do 0,5 mg/L)', desc: `liều ${clD.name} tự tăng tới khi có clo tự do – oxy hóa hết NH₄/NO₂`,
          apply: P2 => { setp(clD.id, { mode: 'fixed' })(P2); const c = P2.ctrls.find(x => x.unit === clD.id); const inL = P2.links.find(l => l.to[0] === pid && l.to[1] === 'in'); if (c) Object.assign(c, { v: 'Cl2f', sp: Math.max(c.sp, 0.5), on: true, hi: Math.max(c.hi, 60) }); else addCtrl({ name: 'Clo điểm đột biến', unit: clD.id, param: 'dose', ref: inL.id, v: 'Cl2f', sp: 0.5, hi: 60 })(P2); } });
        const fl = ups.find(u => u.type === 'filter' && u.p.bio !== 'yes');
        if (fl && k === 'NH4') add({ key: 'bioF', kind: 'vh', fixes: fix, title: `Nitrat hóa sinh học trong ${fl.name}`, desc: 'bật chế độ lọc sinh học (không clo hóa trước lọc, đủ oxy)', apply: setp(fl.id, { bio: 'yes' }) });
      }
      else if (k === 'Fe' || k === 'Mn') {
        const fl = first('filter') || first('settler');
        if (fl && k === 'Mn') add({ key: 'kmno4', kind: 'hc', fixes: fix, title: `Châm KMnO₄ trước ${fl.name}`, desc: 'oxy hóa Mn²⁺ → MnO₂, giữ lại trên lọc (liều ≈ 1,9 × Mn)', apply: P2 => insertBefore(P2, fl.id, 'dose', 'Châm KMnO₄', { chem: 'KMnO4', mode: 'fixed', dose: r2(Math.max(2 * f.v, 0.5)) }) });
        if (fl && fl.type === 'filter' && k === 'Mn' && fl.p.mnox !== 'yes') add({ key: 'mnox', kind: 'vh', fixes: fix, title: `Vật liệu lọc phủ MnOₓ (${fl.name})`, desc: 'lọc xúc tác giữ Mn²⁺ bằng hấp phụ – oxy hóa', apply: setp(fl.id, { mnox: 'yes' }) });
        if (fl && k === 'Fe') add({ key: 'feOx', kind: 'hc', fixes: fix, title: `Châm clo oxy hóa sắt trước ${fl.name}`, desc: 'NaOCl ≈ 0,64 mg/mg Fe²⁺ + dư', apply: P2 => insertBefore(P2, fl.id, 'dose', 'Châm NaOCl (oxy hóa Fe)', { chem: 'NaOCl', mode: 'fixed', dose: r2(Math.max(1 * f.v + 0.5, 1)) }) });
        if (fl && fl.type === 'filter') add({ key: 'filtA', kind: 'ct', fixes: fix, title: `Giảm tốc độ lọc ${fl.name} (tăng diện tích 50 %)`, desc: `${fmt(fl.p.A)} → ${fmt(fl.p.A * 1.5)} m²`, apply: mul(fl.id, 'A', 1.5) });
      }
      else if (k === 'Al') {
        if (coagD) add({ key: 'coagDn', kind: 'hc', fixes: fix, title: `Giảm liều ${coagD.name} 25 %`, desc: `${fmt(coagD.p.dose)} → ${fmt(coagD.p.dose * 0.75)} mg/L`, apply: mul(coagD.id, 'dose', 0.75) });
        const co = last('coag'); if (co) add({ key: 'coagPH', kind: 'hc', fixes: fix, title: 'Điều chỉnh pH keo tụ về 6,8', desc: `chèn châm xút/axit tự động trước ${co.name}`, apply: P2 => insertBefore(P2, co.id, 'dose', 'Điều chỉnh pH keo tụ', { chem: 'NaOH', mode: 'pH', pHset: 6.8, dose: 5 }) });
      }
      else if (k === 'hard') add({ key: 'ixSoft', kind: 'ct', fixes: fix, title: 'Thêm làm mềm trao đổi cation (SAC dạng Na)', desc: `chèn cột IX SAC-Na ${fmt(ixSize('SACNa').V)} m³ trước ${prod.name}; nước muối tái sinh ra dòng thải`, apply: P2 => insertBefore(P2, pid, 'ix', 'IX làm mềm', ixSize('SACNa')) });
      else if (['TDS', 'Cl', 'SO4', 'Na', 'EC', 'SiO2'].includes(k)) {
        const ro = ups.find(u => u.type === 'ro');
        const pure = ['EC', 'SiO2', 'Na', 'Cl'].includes(k) && ro;
        if (pure) add({ key: 'mb', kind: 'ct', fixes: fix, title: 'Thêm trao đổi ion hỗn hợp (mixed bed) đánh bóng', desc: `chèn cột MB ${fmt(ixSize('MB').V)} m³ trước ${prod.name}`, apply: P2 => insertBefore(P2, pid, 'ix', 'Mixed bed đánh bóng', ixSize('MB')) });
        if (ro) add({ key: 'roRec', kind: 'vh', fixes: fix, title: `Giảm tỷ lệ thu hồi ${ro.name}`, desc: `${fmt(ro.p.rec)} → ${fmt(Math.max(ro.p.rec - 10, 40))} % (nước thấm sạch hơn, nhiều nước đặc hơn)`, apply: setp(ro.id, { rec: Math.max(+ro.p.rec - 10, 40) }) });
        else add({ key: 'roAdd', kind: 'ct', fixes: fix, title: 'Thêm RO khử khoáng', desc: `chèn RO BWLE thu hồi 80 % trước ${prod.name}`, apply: P2 => insertBefore(P2, pid, 'ro', 'RO khử khoáng', roSize()) });
      }
      else if (k === 'F') {
        const ca = doses.find(d => d.p.chem === 'CaCl2' || d.p.chem === 'lime');
        if (ca && ups.some(u => u.type === 'precip')) add({ key: 'caUp', kind: 'hc', fixes: fix, title: `Tăng ${ca.name} 50 %`, desc: `${fmt(ca.p.dose)} → ${fmt(ca.p.dose * 1.5)} mg/L – dư Ca²⁺ đẩy kết tủa CaF₂`, apply: mul(ca.id, 'dose', 1.5) });
        else if (!ups.some(u => u.type === 'ro')) add({ key: 'roAdd', kind: 'ct', fixes: fix, title: 'Thêm RO khử florua', desc: `chèn RO BWLE trước ${prod.name}`, apply: P2 => insertBefore(P2, pid, 'ro', 'RO khử florua', roSize()) });
      }
      else if (k === 'BrO3') {
        const oz = ups.find(u => u.type === 'ozone');
        if (oz) {
          add({ key: 'o3dn', kind: 'vh', fixes: fix, title: `Giảm liều ozone ${oz.name} 40 %`, desc: `${fmt(oz.p.dose)} → ${fmt(oz.p.dose * 0.6)} mg/L`, apply: mul(oz.id, 'dose', 0.6) });
          add({ key: 'o3pH', kind: 'hc', fixes: fix, title: `Hạ pH trước ${oz.name} về 6,5`, desc: 'chèn châm H₂SO₄ tự động – bromat giảm mạnh khi pH thấp', apply: P2 => insertBefore(P2, oz.id, 'dose', 'Hạ pH trước ozone', { chem: 'H2SO4', mode: 'pH', pHset: 6.5, dose: 5 }) });
        }
      }
      else if (['PFOA', 'PFOS', 'MP'].includes(k)) {
        const gac = last('gac');
        if (gac) add({ key: 'gacEBCT', kind: 'ct', fixes: fix, title: `Tăng EBCT ${gac.name} gấp đôi, than mới`, desc: `${fmt(gac.p.EBCT)} → ${fmt(gac.p.EBCT * 2)} phút`, apply: seq(mul(gac.id, 'EBCT', 2), mul(gac.id, 'age', 0.5)) });
        add({ key: 'ixPFAS', kind: 'ct', fixes: fix, title: 'Thêm nhựa chọn lọc PFAS', desc: `chèn cột IX PFAS trước ${prod.name}`, apply: P2 => insertBefore(P2, pid, 'ix', 'IX chọn lọc PFAS', ixSize('PFAS')) });
      }
      else if (MICRO.has(k)) {
        const uv = ups.find(u => u.type === 'uv');
        if (uv) add({ key: 'uvUp', kind: 'vh', fixes: fix, title: `Tăng liều UV ${uv.name}`, desc: `${fmt(uv.p.D0)} → ${fmt(Math.max(uv.p.D0 * 2.5, 100))} mJ/cm²`, apply: setp(uv.id, { D0: Math.max(uv.p.D0 * 2.5, 100) }) });
        else add({ key: 'uvAdd', kind: 'ct', fixes: fix, title: 'Thêm khử trùng UV', desc: `chèn UV ${k === 'Virus' ? 186 : 40} mJ/cm² trước ${prod.name}`, apply: P2 => insertBefore(P2, pid, 'uv', 'Khử trùng UV', { D0: k === 'Virus' ? 186 : 40 }) });
        const tk = last('tank'); if (tk && clD) add({ key: 'tankV', kind: 'ct', fixes: fix, title: `Tăng thể tích ${tk.name} gấp đôi (CT clo)`, desc: `${fmt(tk.p.V)} → ${fmt(tk.p.V * 2)} m³`, apply: mul(tk.id, 'V', 2) });
        if (!clD && k !== 'Crypto' && k !== 'Giardia') add({ key: 'cladd', kind: 'hc', fixes: fix, title: 'Thêm châm Javen (NaOCl) + bộ điều khiển clo dư', desc: `chèn châm NaOCl trước ${prod.name}, clo tự do 0,5 mg/L`,
          apply: P2 => { const id = insertBefore(P2, pid, 'dose', 'Châm NaOCl (clo dư)', { chem: 'NaOCl', mode: 'fixed', dose: 1 }); const l = P2.links.find(x => x.from[0] === id); addCtrl({ name: 'Clo dư nước thành phẩm', unit: id, param: 'dose', ref: l.id, v: 'Cl2f', sp: 0.5, hi: 15 })(P2); } });
      }
    }
    return A;
  }

  /* ---------- 3. thử & xếp hạng ---------- */
  async function run(P, stdOf, onProg) {
    const base = evaluate(P, null, stdOf);
    if (base.err) return { err: base.err };
    const F0 = base.F; if (!F0.length) return { base, F0, rows: [] };
    const r0 = WSIM.steady(clone(P));
    const A = actions(P, r0, F0), rows = [];
    for (let i = 0; i < A.length; i++) {
      if (onProg) onProg(i, A.length, A[i].title);
      await new Promise(res => setTimeout(res, 0));
      const ev = evaluate(P, A[i].apply, stdOf);
      rows.push(score(A[i], ev, base, F0));
    }
    rows.sort((a, b) => (b.nFixed - a.nFixed) || (a.nNew - b.nNew) || (b.improve - a.improve) || (a.dCost + a.dkW * 24 * 2000 / 1e6 - b.dCost - b.dkW * 24 * 2000 / 1e6));
    // phương án kết hợp nhiều bước (tham lam): sau mỗi biện pháp được chọn, lập lại danh sách biện pháp trên sơ đồ ĐÃ sửa
    // cho các chỉ tiêu còn vượt (ví dụ: thêm RO xong mới xuất hiện "mixed bed sau RO")
    const best = rows.find(x => !x.err && x.improve > 0);
    if (best && best.nFixed < F0.length) {
      const chosen = [best.a]; let cur = best.ev;
      for (let stage = 1; stage < 4 && cur.F.length; stage++) {
        if (onProg) onProg(rows.length + stage, rows.length + 4, 'kết hợp – bước ' + (stage + 1));
        await new Promise(res => setTimeout(res, 0));
        const Pcur = cur.P, rcur = WSIM.steady(clone(Pcur));
        const acts = actions(Pcur, rcur, cur.F).filter(a => !chosen.some(c => c.key === a.key && c.key !== 'roAdd'));
        let pick = null, pickEv = null, pickSc = null;
        for (const a of acts) {
          const ev = evaluate(Pcur, a.apply, stdOf); if (ev.err) continue;
          const sc = score(a, ev, cur, cur.F);
          if (sc.improve > 0 && (!pickSc || sc.nFixed > pickSc.nFixed || (sc.nFixed === pickSc.nFixed && sc.nNew < pickSc.nNew) || (sc.nFixed === pickSc.nFixed && sc.nNew === pickSc.nNew && sc.improve > pickSc.improve))) { pick = a; pickEv = ev; pickSc = sc; }
        }
        if (!pick) break;
        chosen.push(pick); cur = pickEv;
      }
      if (chosen.length > 1) {
        const a = { key: 'combo', kind: chosen.some(c => c.kind === 'ct') ? 'ct' : chosen.some(c => c.kind === 'hc') ? 'hc' : 'vh', fixes: [...new Set(chosen.flatMap(c => c.fixes))],
          title: 'Kết hợp: ' + chosen.map(c => c.title).join(' → '), desc: 'áp dụng lần lượt; mỗi bước chọn biện pháp tốt nhất cho các chỉ tiêu còn vượt sau bước trước', apply: seq(...chosen.map(c => c.apply)) };
        const ev = evaluate(P, a.apply, stdOf);   // tính lại từ dự án gốc để chắc chắn chuỗi áp dụng tái lập được
        rows.unshift(Object.assign(score(a, ev, base, F0), { combo: true }));
      }
    }
    return { base, F0, rows };
  }
  function score(a, ev, base, F0) {
    if (ev.err) return { a, err: ev.err, nFixed: -1, nNew: 99, improve: -1, dkW: 0, dCost: 0 };
    const key = f => f.pid + ':' + f.k, now = new Set(ev.F.map(key));
    const fixed = F0.filter(f => !now.has(key(f)));
    const newF = ev.F.filter(f => !F0.some(g => key(g) === key(f)));
    // mức cải thiện tương đối của các chỉ tiêu đang vượt (log cho vi sinh)
    let improve = 0;
    for (const f of F0) {
      const v1 = ev.val[key(f)]; if (v1 === undefined) continue;
      const L = Array.isArray(f.lim) ? (f.low ? f.lim[0] : f.lim[1]) : (typeof f.lim === 'number' ? f.lim : 0);
      const d0 = f.low ? L - f.v : f.v - L, d1 = f.low ? L - v1 : v1 - L;
      improve += f.mic ? (d0 - d1) : (Math.abs(d0) > 1e-12 ? (d0 - d1) / Math.abs(d0) : 0);
    }
    return { a, ev, fixed, newF, nFixed: fixed.length, nNew: newF.length, improve, dkW: ev.S.kW - base.S.kW, dCost: (ev.S.cost - base.S.cost) / 1e6, dRec: ev.S.rec - base.S.rec };
  }

  /* ---------- 4. giao diện (tab Kết quả) ---------- */
  function card(host, P, r, stdOf) {
    const F = fails(r.sys, r, stdOf);
    if (!F.length) { host.innerHTML = ''; return; }
    const diag = F.map(f => `<li><b>${esc(f.pname)} – ${esc(nameOf(f.k))}</b> = ${f.mic ? fmtLog(f.v) : fmt(f.v)} ${esc(unitOf(f.k))} (giới hạn ${esc(String(f.limTxt))}${f.low ? ', thấp hơn mức tối thiểu' : ''}): <span class="muted">${esc(diagnose(f, P, r))}</span></li>`).join('');
    host.innerHTML = `<div class="card" style="border-left:4px solid var(--bad)"><h2>Gợi ý xử lý chỉ tiêu chưa đạt</h2><ul style="margin:4px 0 10px;padding-left:20px">${diag}</ul>
      <div class="btnrow"><button class="pri" id="fxRun">Tìm & thử biện pháp trên mô hình</button><span class="small muted" id="fxMsg">Mỗi biện pháp được áp dụng vào bản sao dự án và tính lại trạng thái ổn định (kể cả bộ điều khiển) để xem chỉ tiêu có đạt không và tác dụng phụ.</span></div><div id="fxRes"></div></div>`;
    host.querySelector('#fxRun').onclick = async () => {
      const btn = host.querySelector('#fxRun'), msg = host.querySelector('#fxMsg'); btn.disabled = true;
      const t0 = performance.now();
      const res = await run(P, stdOf, (i, n, t) => { msg.textContent = `Đang thử ${i + 1}/${n}: ${t}…`; });
      btn.disabled = false;
      if (res.err) { msg.textContent = '✖ ' + res.err; return; }
      msg.textContent = `Đã thử ${res.rows.length} biện pháp trong ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
      drawRows(host.querySelector('#fxRes'), res, P);
    };
  }
  function drawRows(box, res, P) {
    if (!res.rows.length) { box.innerHTML = '<div class="msg warn">Không tìm được biện pháp tự động cho các chỉ tiêu này – xem chẩn đoán ở trên.</div>'; return; }
    const F0 = res.F0, key = f => f.pid + ':' + f.k;
    const head = F0.map(f => `<th style="white-space:normal">${esc(nameOf(f.k))}<br><span class="muted small">${f.mic ? fmtLog(f.v) : fmt(f.v)} → ?</span></th>`).join('');
    let h = `<div class="tscroll" style="margin-top:10px;max-height:none"><table class="t"><tr><th class="l">Biện pháp</th><th class="l">Loại</th>${head}<th class="l">Chỉ tiêu mới vượt</th><th>Δ điện kW</th><th>Δ hóa chất tr.đ/d</th><th>Δ thu hồi %</th><th></th></tr>`;
    res.rows.forEach((x, i) => {
      const kd = KIND[x.a.kind] || KIND.vh;
      h += `<tr${x.combo ? ' style="background:#f0f9ff"' : ''}><td class="l" style="white-space:normal;max-width:380px"><b>${esc(x.a.title)}</b><br><span class="small muted">${esc(x.a.desc || '')}</span></td>
        <td class="l"><span class="badge" style="color:${kd[1]};background:${kd[1]}1a">${kd[0]}</span></td>`;
      if (x.err) { h += `<td colspan="${F0.length + 4}" class="l" style="color:var(--bad)">✖ ${esc(x.err)}</td><td></td></tr>`; return; }
      for (const f of F0) {
        const v = x.ev.val[key(f)], ok = !x.ev.F.some(g => key(g) === key(f));
        h += `<td style="color:${ok ? 'var(--ok)' : 'var(--bad)'};font-weight:600">${v === undefined ? '–' : (f.mic ? fmtLog(v) : fmt(v))} ${ok ? '✔' : '✖'}</td>`;
      }
      h += `<td class="l small" style="white-space:normal;color:var(--bad)">${x.newF.map(g => esc(nameOf(g.k)) + ' ' + fmt(g.v)).join(', ') || '<span class="muted">–</span>'}</td>
        <td>${fmt(x.dkW)}</td><td>${fmt(x.dCost)}</td><td>${fmt(x.dRec)}</td><td><button data-ap="${i}">Áp dụng</button></td></tr>`;
    });
    box.innerHTML = h + '</table></div><p class="small muted">Biện pháp "công trình" chèn đơn vị mới vào sơ đồ (kích thước sơ bộ) – kiểm tra lại thông số đơn vị sau khi áp dụng. Biện pháp hóa chất cần kiểm chứng Jartest/thí nghiệm. Áp dụng xong chương trình tính lại trạng thái ổn định.</p>';
    box.querySelectorAll('[data-ap]').forEach(b => (b.onclick = () => {
      const x = res.rows[+b.dataset.ap];
      if (!confirm('Áp dụng vào dự án: ' + x.a.title + '?\n(Lưu dự án trước nếu muốn giữ bản cũ.)')) return;
      x.a.apply(WAPP.P);
      wChanged('all'); FS.render(); wRunSteady(true); wShowTab('res');
    }));
  }
  return { fails, evaluate, actions, run, card, diagnose, insertBefore };
})();
