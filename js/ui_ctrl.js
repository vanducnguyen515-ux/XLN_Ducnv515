'use strict';
/* ==========================================================================
   SimXLNT – Tab Điều khiển: bộ PID (đo trên đường ống hoặc trong bể),
   gợi ý bộ điều khiển hợp lý theo sơ đồ, giá trị mặc định & kiểm tra cấu hình.
   ========================================================================== */
const BIO_UNITS = ['cstr', 'mbr', 'mbbr', 'sbr', 'iceas', 'ctech'];
const isAer = u => ['cstr', 'mbr', 'mbbr'].includes(u.type) ? u.p.aer !== 'none' : CYC.has(u.type);
const qInf = P => P.units.filter(u => u.type === 'influent').reduce((a, u) => a + (+u.p.Q || 0), 0) || 10000;
const outLinks = (P, id) => P.links.filter(l => l.from[0] === id);
const unitOf = (P, id) => P.units.find(u => u.id === id);

/* dấu Kp đúng theo cặp (biến đo, đại lượng tác động): + nếu tăng u làm tăng giá trị đo */
function ctrlSign(v, act, au) {
  const k = v + '|' + act;
  const T = { 'DO|kla': 1, 'DO|DOsp': 1, 'SO|kla': 1, 'SO|DOsp': 1, 'NH4|DOsp': -1, 'NH4|kla': -1, 'SNH|DOsp': -1, 'SNH4|DOsp': -1, 'TN|DOsp': -1,
    'TSS|SRTw': 1, 'TSS|Vwas': -1, 'TSS|uQ': -1, 'VSS|SRTw': 1, 'PO4|mass': -1, 'TP|mass': -1, 'Alk|mass': 1, 'pH|mass': 1, 'DO|Psp': 1 };
  if (T[k] !== undefined) return T[k];
  if ((v === 'NOx' || v === 'SNO' || v === 'SNO3') && act === 'Q') return 1;           // tuần hoàn nội → NO3 bể thiếu khí tăng
  if ((v === 'NOx' || v === 'TN') && act === 'mass' && au && au.p.kind === 'carbon') return -1;
  if (v === 'TSS' && act === 'Q') return -1;                                              // lưu lượng xả bùn → MLSS giảm
  return 0;
}
/* giá trị hiện hành của đại lượng tác động */
function actNow(au, act) { return au ? +au.p[act] : 0; }
/* khoảng hợp lý của đại lượng tác động */
function actRange(au, act, P) {
  const Q = qInf(P), cur = actNow(au, act);
  switch (act) {
    case 'kla': return [0, +au.p.klaMax || 600];
    case 'DOsp': return [0.5, 3];
    case 'Psp': return [30, +au.p.Pr || 90];
    case 'SRTw': return [3, 60];
    case 'Vwas': return [0, Math.max(cur * 4, 1)];
    case 'Q': { const toWas = P.links.some(l => l.from[0] === au.id && l.from[1] === 'a' && (unitOf(P, l.to[0]) || {}).type === 'sludge'); return toWas ? [0, Math.max(cur * 3, 0.03 * Q)] : [0, 5 * Q]; }
    case 'uQ': return [0, Math.max(2 * Q, cur * 3)];
    case 'mass': return [0, Math.max(cur * 5, au.p.kind === 'carbon' ? 20 * Q / 1000 : au.p.kind === 'alk' ? 200 * Q / 1000 : 30 * Q / 1000)];
  }
  return [0, Math.max(cur * 5, 1)];
}
/* thông số chỉnh định mặc định cho một cặp (đo, tác động) */
function ctrlDefaults(c, P) {
  const au = unitOf(P, c.unit), Q = qInf(P), cur = actNow(au, c.act);
  const [umin, umax] = actRange(au, c.act, P);
  const s = ctrlSign(c.v, c.act, au) || 1;
  let Kp, Ti, tau = 5;
  if (c.act === 'kla') { Kp = 300; Ti = 0.003; tau = 1; }
  else if (c.act === 'DOsp' && ['DO', 'SO'].includes(c.v)) { Kp = 1; Ti = 0.01; tau = 1; }
  else if (c.act === 'DOsp') { Kp = -0.4; Ti = 0.04; tau = 10; }
  else if (c.act === 'Q' && s > 0) { Kp = 0.8 * Q; Ti = 0.05; tau = 5; }
  else if (c.act === 'Q' || c.act === 'uQ') { Kp = -Math.max(cur, Q * 0.01) / (0.25 * Math.max(+c.sp || 3000, 1)); Ti = 3; tau = 30; }
  else if (c.act === 'SRTw') { Kp = Math.max(cur, 10) / (0.5 * Math.max(+c.sp || 3000, 1)); Ti = 5; tau = 30; }
  else if (c.act === 'Vwas') { Kp = -Math.max(cur, 1) / (0.25 * Math.max(+c.sp || 3000, 1)); Ti = 3; tau = 30; }
  else if (c.act === 'mass' && au && au.p.kind === 'metal') { Kp = -Math.max(cur, 5 * Q / 1000); Ti = 0.1; tau = 15; }
  else if (c.act === 'mass' && au && au.p.kind === 'carbon') { Kp = -5 * Q / 1000; Ti = 0.1; tau = 10; }
  else if (c.act === 'mass' && au && au.p.kind === 'alk') { Kp = Q / 1000; Ti = 0.1; tau = 10; }
  else if (c.act === 'Psp') { Kp = 5; Ti = 0.01; tau = 2; }
  else { Kp = s * 0.5 * (umax - umin) / Math.max(Math.abs(+c.sp) || 1, 1); Ti = 0.05; }
  return { Kp: +Kp.toPrecision(3), Ti, tau, umin: +umin.toPrecision(4), umax: +umax.toPrecision(4), u0: +Math.min(Math.max(cur, umin), umax).toPrecision(5) };
}

/* gợi ý bộ điều khiển theo sơ đồ */
function ctrlSuggest(P) {
  const S = [], Q = qInf(P);
  const D = P.design;
  const tgt = k => D && D.targets ? (D.targets.find(t => t.k === k) || {}) : {};
  const blower = P.units.find(u => u.type === 'blower');
  const aer = P.units.filter(u => isAer(u) && !CYC.has(u.type));
  const cyc = P.units.filter(u => CYC.has(u.type));
  const eff = P.links.filter(l => (unitOf(P, l.to[0]) || {}).type === 'effluent');
  const last = aer.find(u => outLinks(P, u.id).some(l => ['clarifier', 'splitter', 'mbr'].includes((unitOf(P, l.to[0]) || {}).type))) || aer[aer.length - 1];
  const mk = (title, why, c, prep) => { const cc = Object.assign({ on: true, src: 'unit', link: '', munit: '', mtank: -1, tau: 5, Td: 0 }, c); S.push({ title, why, c: cc, prep }); };
  // 0. trạm máy thổi khí
  if (!blower && (aer.length || cyc.length)) S.push({ title: 'Trạm máy thổi khí cấp cho các bể sục khí', why: 'Thay bộ điều khiển DO lý tưởng của từng bể bằng vòng DO → lưu lượng khí thực, có giới hạn năng lực/turndown, áp suất đường ống, số máy chạy và điện năng.', blower: true });
  // 1. NH4 → DO đặt (điều khiển tầng)
  const nhMeas = cyc[0] || last;
  if (nhMeas) {
    let au = nhMeas, prep = null;
    if (blower) { au = blower; prep = () => { if (blower.p.doMode !== 'common') { blower.p.DOsp = +(nhMeas.p.DOsp || 2); blower.p.doMode = 'common'; } }; }
    else if (!CYC.has(nhMeas.type) && nhMeas.p.aer !== 'do') prep = () => { nhMeas.p.aer = 'do'; nhMeas.p.DOsp = nhMeas.p.DOsp || 2; };
    const lim = tgt('NH4').lim;
    mk('Điều khiển tầng NH₄ → DO đặt', `Đo NH₄-N trong ${nhMeas.name} (máy phân tích, trễ 10 phút), điều chỉnh DO đặt ${blower ? 'chung của trạm máy thổi' : 'của ' + nhMeas.name} trong khoảng 0,5–3 mg/L: NH₄ cao → tăng DO, NH₄ thấp → giảm DO tiết kiệm điện. Kp âm.`,
      { name: 'NH₄ → DO đặt', munit: nhMeas.id, v: 'NH4', sp: lim ? Math.min(1, lim * 0.4) : 1, unit: au.id, act: 'DOsp' }, prep);
  }
  // 2. NO3 bể thiếu khí → tuần hoàn nội
  for (const sp of P.units.filter(u => u.type === 'splitter')) {
    const la = outLinks(P, sp.id).find(l => l.from[1] === 'a'), dst = la && unitOf(P, la.to[0]);
    const src = P.links.find(l => l.to[0] === sp.id), from = src && unitOf(P, src.from[0]);
    if (dst && dst.type === 'cstr' && dst.p.aer === 'none' && from && isAer(from)) {
      mk('Tuần hoàn nội theo NO₃ bể thiếu khí', `Đo NO₃-N trong ${dst.name}, điều chỉnh lưu lượng tuần hoàn nội (${sp.name}) để NO₃ cuối vùng thiếu khí ≈ 1 mg/L: tận dụng tối đa khả năng khử nitrat, không mang quá nhiều O₂ về vùng thiếu khí. Kp dương.`,
        { name: 'NO₃ thiếu khí → Qa', munit: dst.id, v: 'NOx', sp: 1, unit: sp.id, act: 'Q' }, () => { if (sp.p.mode !== 'Q') { sp.p.Q = Math.round(3 * Q); sp.p.mode = 'Q'; } });
    }
  }
  // 3. MLSS → xả bùn
  const wsp = P.units.find(u => u.type === 'splitter' && outLinks(P, u.id).some(l => l.from[1] === 'a' && (unitOf(P, l.to[0]) || {}).type === 'sludge'));
  const mlssD = tgt('MLSS').v || 3500;
  if (wsp && last) mk('MLSS → lưu lượng xả bùn', `Đo MLSS (TSS) trong ${last.name}, điều chỉnh lưu lượng bùn xả (${wsp.name}) để giữ MLSS ≈ giá trị thiết kế – ổn định SRT khi tải thay đổi. Phản ứng chậm (Ti vài ngày). Kp âm.`,
    { name: 'MLSS → xả bùn', munit: last.id, v: 'TSS', sp: Math.round(mlssD / 50) * 50, unit: wsp.id, act: 'Q', tau: 30 }, () => { if (wsp.p.mode !== 'Q') { wsp.p.Q = Math.round(0.01 * Q); wsp.p.mode = 'Q'; } });
  for (const c of cyc) {
    const tw = tgt('MLSS'), spv = tw.v2 ? (tw.v + tw.v2) / 2 : tw.v || 4000;
    if (c.p.wasMode === 'srt') mk('MLSS → tuổi bùn mục tiêu (xả bùn)', `Đo MLSS trung bình các bể ${c.name}, điều chỉnh tuổi bùn mục tiêu của chế độ xả theo SRT. MLSS thấp → tăng SRT (xả ít). Kp dương.`,
      { name: 'MLSS → SRT xả', munit: c.id, v: 'TSS', sp: Math.round(spv / 50) * 50, unit: c.id, act: 'SRTw', tau: 30 });
    else mk('MLSS → thể tích bùn xả mỗi chu kỳ', `Đo MLSS trung bình ${c.name}, điều chỉnh thể tích xả bùn mỗi chu kỳ. Kp âm.`,
      { name: 'MLSS → bùn xả', munit: c.id, v: 'TSS', sp: Math.round(spv / 50) * 50, unit: c.id, act: 'Vwas', tau: 30 });
  }
  // 4–6. hóa chất theo nước ra
  const effL = eff[0];
  for (const d of P.units.filter(u => u.type === 'dose')) {
    if (!effL) break;
    if (d.p.kind === 'metal') mk(`PO₄ nước ra → liều ${d.name}`, 'Đo PO₄-P nước ra, điều chỉnh liều muối kim loại khử P hóa học: tránh châm thừa (tốn hóa chất, tăng bùn) hoặc thiếu (TP vượt). Chỉ có ý nghĩa với ASM2d. Kp âm.',
      { name: 'PO₄ → liều kim loại', src: 'link', link: effL.id, v: 'PO4', sp: 0.5, unit: d.id, act: 'mass', tau: 15 });
    if (d.p.kind === 'carbon') mk(`NO₃ nước ra → liều ${d.name}`, 'Đo NO₃-N nước ra, điều chỉnh liều nguồn carbon ngoài cho khử nitrat: chỉ châm khi NO₃ vượt giá trị đặt. Kp âm.',
      { name: 'NO₃ → liều carbon', src: 'link', link: effL.id, v: 'NOx', sp: 4, unit: d.id, act: 'mass', tau: 10 });
    if (d.p.kind === 'alk') mk(`Độ kiềm nước ra → liều ${d.name}`, 'Đo độ kiềm nước ra, châm NaOH giữ kiềm dư ≥ 70–80 mg CaCO₃/L để nitrat hóa ổn định. Kp dương.',
      { name: 'Kiềm → NaOH', src: 'link', link: effL.id, v: 'Alk', sp: 80, unit: d.id, act: 'mass', tau: 10 });
  }
  for (const s of S) if (s.c) Object.assign(s.c, ctrlDefaults(s.c, P), { tau: s.c.tau });
  return S;
}

/* kiểm tra cấu hình một bộ điều khiển */
function ctrlCheck(c, P) {
  const w = [], au = unitOf(P, c.unit);
  if (!au) return ['Chưa chọn thiết bị tác động'];
  if (c.src !== 'unit') {
    const l = P.links.find(x => x.id === c.link);
    if (!l) w.push('Chưa chọn đường ống đo');
    else if ((unitOf(P, l.from[0]) || {}).type === 'influent') w.push('Đang đo trên dòng nước thải vào – giá trị này không chịu tác động của cơ cấu chấp hành, bộ điều khiển sẽ bão hòa.');
    else if ((unitOf(P, l.from[0]) || {}).type === 'dose') w.push('Đang đo trên đường châm hóa chất – không có ý nghĩa điều khiển.');
  } else if (!unitOf(P, c.munit)) w.push('Chưa chọn bể để đo');
  const s = ctrlSign(c.v, c.act, au);
  if (s && Math.sign(+c.Kp) !== s && +c.Kp !== 0) w.push(`Dấu Kp có vẻ ngược: với cặp ${c.v} ↔ ${c.act} nên dùng Kp ${s > 0 ? 'dương' : 'âm'}.`);
  if (!s) w.push(`Cặp ${c.v} ↔ ${c.act} không có trong bảng cặp quen thuộc – kiểm tra lại quan hệ nhân quả và dấu Kp.`);
  const [lo, hi] = actRange(au, c.act, P);
  if (+c.umax > hi * 2 || +c.umin < lo - Math.abs(hi) || +c.umax <= +c.umin) w.push(`Giới hạn tác động [${fmt(+c.umin)}; ${fmt(+c.umax)}] bất thường (khoảng hợp lý ≈ [${fmt(lo)}; ${fmt(hi)}]).`);
  if (c.act === 'DOsp' && +c.umax > 6) w.push('DO đặt tối đa > 6 mg/L là không thực tế.');
  if (+c.u0 < +c.umin || +c.u0 > +c.umax) w.push('u₀ nằm ngoài giới hạn.');
  if (c.act === 'DOsp' && au.type === 'cstr' && au.p.aer !== 'do' && !P.units.some(b => b.type === 'blower')) w.push(au.name + ' phải đặt "Điều khiển DO" để DO đặt có tác dụng.');
  if (c.act === 'DOsp' && au.blower) {}
  if (c.act === 'DOsp' && P.units.some(b => b.type === 'blower' && (b.p.zones || []).includes(au.id)) && P.units.find(b => b.type === 'blower').p.doMode === 'common') w.push('Trạm máy thổi đang dùng DO đặt chung – DO đặt của bể không có tác dụng; hãy tác động vào DO đặt của trạm máy thổi.');
  if (c.act === 'DOsp' && au.type === 'blower' && au.p.doMode !== 'common') w.push('Trạm máy thổi phải chọn "DO đặt chung" để DO đặt của trạm có tác dụng.');
  if (c.act === 'Psp' && au.p.ctl !== 'pressure') w.push('Áp suất đặt chỉ có tác dụng khi trạm máy thổi ở chế độ "Áp suất đường ống cố định".');
  if ((c.act === 'Q') && au.type === 'splitter' && au.p.mode !== 'Q') w.push(au.name + ' phải ở chế độ "Lưu lượng cố định".');
  if (c.act === 'uQ' && au.p.uMode !== 'Q') w.push(au.name + ' phải đặt dòng đáy "Lưu lượng cố định".');
  if (c.act === 'SRTw' && au.p.wasMode !== 'srt') w.push(au.name + ' phải chọn cách xả bùn "Theo tuổi bùn mục tiêu".');
  if (c.act === 'Vwas' && au.p.wasMode === 'srt') w.push(au.name + ' đang xả theo SRT – Vwas không có tác dụng.');
  if (!(+c.Ti > 0)) w.push('Ti = 0: chỉ điều khiển P, sẽ còn sai lệch tĩnh.');
  return w;
}

function renderCtrl() {
  const box = $('#tab-ctrl'), P = APP.P;
  P.ctrls = P.ctrls || [];
  box.innerHTML = '';
  const intro = el(`<div class="card"><h2>Bộ điều khiển</h2>
    <p class="small">Mỗi bộ điều khiển PID đo một chỉ tiêu <b>trên đường ống</b> hoặc <b>trong bể</b> (cảm biến có trễ bậc 1), so với giá trị đặt và điều chỉnh một cơ cấu chấp hành:
    <code>u = u₀ + Kp·[e + (1/Ti)∫e dt − Td·d(đo)/dt]</code>, e = đặt − đo, giới hạn [u_min, u_max], chống bão hòa tích phân. Bộ điều khiển hoạt động cả khi tính trạng thái ổn định và khi chạy động.
    DO của bể sục khí đã có bộ điều khiển lý tưởng sẵn (chế độ "Điều khiển DO") hoặc vòng DO → khí của <b>trạm máy thổi khí</b>.</p>
    <div class="btnrow"><button class="pri" id="cSug">Gợi ý bộ điều khiển phù hợp sơ đồ</button><button id="cAdd">+ Thêm bộ điều khiển</button></div><div id="cSugBox"></div></div>`);
  box.appendChild(intro);
  intro.querySelector('#cSug').onclick = () => renderSuggest(intro.querySelector('#cSugBox'));
  intro.querySelector('#cAdd').onclick = () => {
    const sug = ctrlSuggest(P).filter(s => s.c);
    let i = 1; while (P.ctrls.some(c => c.id === 'C' + i)) i++;
    let c;
    if (sug.length) { c = Object.assign({}, sug[0].c, { id: 'C' + i, name: sug[0].c.name }); if (sug[0].prep) sug[0].prep(); }
    else {
      const au = P.units.find(u => ACTUATORS[u.type]);
      c = { id: 'C' + i, name: 'Bộ ĐK ' + i, on: true, src: 'link', link: (P.links.find(l => (unitOf(P, l.to[0]) || {}).type === 'effluent') || P.links[0] || {}).id || '', munit: '', mtank: -1, v: 'NH4', unit: au ? au.id : '', act: au ? ACTUATORS[au.type][0][0] : '', sp: 1, Td: 0, tau: 5 };
      Object.assign(c, ctrlDefaults(c, P));
    }
    P.ctrls.push(c); changed('ctrl'); renderCtrl();
  };
  const m = curModel();
  const varsAll = [['Q', 'Lưu lượng']].concat(m.compVars.map(v => [v[0], v[1] + ' [' + v[2] + ']'])).concat(m.comps.map(c => [c.id, c.id + ' (biến trạng thái)']));
  const d = currentDet();
  for (const c of P.ctrls) {
    if (!c.src) c.src = 'link';
    if (c.mtank === undefined) c.mtank = -1;
    const card = el(`<div class="card"></div>`);
    const head = el(`<div class="row"><label><input type="checkbox"${c.on !== false ? ' checked' : ''}> Bật</label><label>Tên <input type="text" style="width:220px"></label><button data-b="def">Đặt thông số chỉnh định mặc định</button><button class="danger" data-b="del">Xóa</button></div>`);
    head.querySelector('input[type=checkbox]').onchange = e => { c.on = e.target.checked; changed('ctrl'); renderCtrl(); };
    const nm = head.querySelector('input[type=text]'); nm.value = c.name || ''; nm.onchange = () => { c.name = nm.value; changed('ctrl'); };
    head.querySelector('[data-b=del]').onclick = () => { if (confirm('Xóa bộ điều khiển "' + (c.name || c.id) + '"?')) { P.ctrls = P.ctrls.filter(x => x !== c); changed('ctrl'); renderCtrl(); } };
    head.querySelector('[data-b=def]').onclick = () => { Object.assign(c, ctrlDefaults(c, P)); changed('ctrl'); renderCtrl(); };
    card.appendChild(head);
    const actUnits = P.units.filter(u => ACTUATORS[u.type]);
    const au = unitOf(P, c.unit), mu = unitOf(P, c.munit);
    const bioU = P.units.filter(u => BIO_UNITS.includes(u.type));
    const vars = c.src === 'unit' ? varsAll.filter(v => v[0] !== 'Q') : varsAll;
    const g = el(`<div class="grid2" style="margin-top:10px"><div class="frm wide">
      <label>Điểm đo</label><select data-k="src"><option value="link"${c.src !== 'unit' ? ' selected' : ''}>Trên đường ống</option><option value="unit"${c.src === 'unit' ? ' selected' : ''}>Trong bể (cảm biến đặt trong bể)</option></select>
      ${c.src === 'unit' ? `<label>Bể đo</label><select data-k="munit"><option value="">—</option>${bioU.map(u => `<option value="${u.id}"${u.id === c.munit ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
        ${mu && CYC.has(mu.type) ? `<label>Bể trong cụm</label><select data-k="mtank"><option value="-1">Trung bình các bể</option>${Array.from({ length: Math.round(+mu.p.N || 1) }, (_, k) => `<option value="${k}"${+c.mtank === k ? ' selected' : ''}>Bể ${k + 1}</option>`).join('')}</select>` : ''}`
      : `<label>Đường ống đo</label><select data-k="link">${P.links.map(l => `<option value="${l.id}"${l.id === c.link ? ' selected' : ''}>${esc(linkName(l))}</option>`).join('')}</select>`}
      <label>Chỉ tiêu đo</label><select data-k="v">${vars.map(v => `<option value="${v[0]}"${v[0] === c.v ? ' selected' : ''}>${v[1]}</option>`).join('')}</select>
      <label>Hằng số thời gian cảm biến<span class="u">phút</span></label><input type="number" step="any" data-k="tau">
      <label>Giá trị đặt</label><input type="number" step="any" data-k="sp">
      </div><div class="frm wide">
      <label>Thiết bị tác động</label><select data-k="unit"><option value="">—</option>${actUnits.map(u => `<option value="${u.id}"${u.id === c.unit ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <label>Đại lượng tác động</label><select data-k="act">${(au ? ACTUATORS[au.type] : []).map(a => `<option value="${a[0]}"${a[0] === c.act ? ' selected' : ''}>${a[1]}</option>`).join('')}</select>
      <label>Kp</label><input type="number" step="any" data-k="Kp">
      <label>Ti<span class="u">ngày (${fmt(+c.Ti * 1440)} phút)</span></label><input type="number" step="any" data-k="Ti">
      <label>Td<span class="u">ngày</span></label><input type="number" step="any" data-k="Td">
      <label>u₀ (giá trị nền)<span class="u">hiện tại ${au ? fmt(actNow(au, c.act)) : '–'}</span></label><input type="number" step="any" data-k="u0">
      <label>u_min</label><input type="number" step="any" data-k="umin">
      <label>u_max</label><input type="number" step="any" data-k="umax">
      </div></div>`);
    g.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k;
      if (inp.tagName === 'INPUT') inp.value = c[k] === undefined ? '' : c[k];
      inp.onchange = () => {
        if (inp.tagName === 'SELECT') c[k] = k === 'mtank' ? +inp.value : inp.value; else { const v = parseFloat(inp.value); if (isFinite(v)) c[k] = v; }
        if (k === 'unit') { const u2 = unitOf(P, c.unit); c.act = u2 ? ACTUATORS[u2.type][0][0] : ''; }
        if (k === 'unit' || k === 'act') Object.assign(c, ctrlDefaults(c, P));
        if (k === 'src' && c.src === 'unit' && !c.munit) { const lst = P.units.filter(u => BIO_UNITS.includes(u.type)); c.munit = lst.length ? lst[lst.length - 1].id : ''; }
        changed('ctrl'); if (['unit', 'act', 'src', 'munit'].includes(k)) renderCtrl();
      };
    });
    card.appendChild(g);
    // trạng thái từ kết quả hiện hành
    const ct = d && d.det.CT && d.det.CT[c.id];
    if (ct) card.appendChild(el(`<div class="kpis" style="margin-top:8px">${kpi('Giá trị đo (cảm biến)', ct.meas, '')}${kpi('Giá trị đặt', ct.sp, '')}${kpi('Tín hiệu tác động', ct.u, '')}<div class="kpi ${(ct.u <= +c.umin + 1e-9 || ct.u >= +c.umax - 1e-9) ? 'bad' : 'ok'}"><div class="k">Trạng thái</div><div class="v" style="font-size:15px">${(ct.u <= +c.umin + 1e-9 || ct.u >= +c.umax - 1e-9) ? 'BÃO HÒA (chạm giới hạn)' : 'trong khoảng'}</div></div></div>`));
    for (const w of ctrlCheck(c, P)) card.appendChild(el(`<div class="msg warn">${esc(w)}</div>`));
    box.appendChild(card);
  }
  const sys = compilePlant(P);
  const msgs = el('<div class="card"><h2>Kiểm tra</h2></div>');
  const ce = (sys.errors || []).filter(e => e.startsWith('Bộ điều khiển'));
  ce.forEach(e => msgs.appendChild(el(`<div class="msg err">${esc(e)}</div>`)));
  if (!ce.length) msgs.appendChild(el(`<div class="msg ok">${P.ctrls.filter(c => c.on !== false).length} bộ điều khiển đang bật, cấu hình biên dịch được. Sau khi thay đổi hãy tính lại trạng thái ổn định hoặc chạy động.</div>`));
  box.appendChild(msgs);
}

function renderSuggest(host) {
  const P = APP.P, sug = ctrlSuggest(P);
  if (!sug.length) { host.innerHTML = '<div class="msg warn">Không tìm thấy cặp đo – tác động phù hợp trong sơ đồ (cần bể sục khí, bộ chia tuần hoàn/xả bùn hoặc đơn vị châm hóa chất).</div>'; return; }
  host.innerHTML = '';
  const tb = el(`<div style="margin-top:10px"><table class="t"><tr><th></th><th class="l">Bộ điều khiển gợi ý</th><th class="l">Mục đích & cách hoạt động</th><th class="l">Thông số đề xuất</th></tr></table><div class="btnrow"><button class="pri">Thêm các mục đã chọn</button></div></div>`);
  const t = tb.querySelector('table');
  sug.forEach((s, i) => {
    const c = s.c;
    const par = c ? `đặt ${fmt(c.sp)} · Kp ${fmt(c.Kp)} · Ti ${fmt(c.Ti * 1440)} phút · u ∈ [${fmt(c.umin)}; ${fmt(c.umax)}]` : 'tự định cỡ theo kết quả';
    t.appendChild(el(`<tr><td><input type="checkbox" data-i="${i}" checked></td><td class="l"><b>${esc(s.title)}</b></td><td class="l small" style="white-space:normal;max-width:520px">${esc(s.why)}</td><td class="l small" style="white-space:normal">${esc(par)}</td></tr>`));
  });
  tb.querySelector('button').onclick = () => {
    const picked = [...t.querySelectorAll('input:checked')].map(x => sug[+x.dataset.i]);
    for (const s of picked) {
      if (s.blower) { addBlowerStation(P); continue; }
      if (s.prep) s.prep();
      let i = 1; while (P.ctrls.some(c => c.id === 'C' + i)) i++;
      P.ctrls.push(Object.assign({}, s.c, { id: 'C' + i }));
    }
    changed('ctrl'); FS.render(); renderCtrl();
  };
  host.appendChild(tb);
}

/* thêm trạm máy thổi khí tự định cỡ theo kết quả hiện có (hoặc ước tính) */
function addBlowerStation(P) {
  if (P.units.some(u => u.type === 'blower')) return;
  const aer = P.units.filter(isAer);
  let air = 0;
  const d = currentDet();
  if (d) { const S = plantSummary(d.sys, d.det); for (const r of S.reactors) if (aer.some(a => a.id === r.cu.id)) air += r.info.air || 0; }
  const est = !(air > 0);
  if (est) air = qInf(P) * 12;                                // ≈ 12 m³ khí / m³ nước thải (có nitrat hóa) – định cỡ lại sau khi có kết quả
  if (est) setTimeout(() => alert('Trạm máy thổi được định cỡ sơ bộ theo 12 m³ khí/m³ nước thải. Sau khi tính ổn định, chọn trạm máy thổi và bấm "Tự định cỡ máy thổi theo kết quả hiện có".'), 50);
  // bể chu kỳ: khí chỉ cấp trong pha sục khí → lưu lượng đỉnh = trung bình / phần thời gian sục khí
  const cy = aer.find(u => CYC.has(u.type)); if (cy) air /= 0.5;
  const peak = air / 24 * 1.3, nD = peak > 20000 ? 4 : peak > 6000 ? 3 : 2;
  let sub = 0; for (const z of aer) sub = Math.max(sub, (+z.p.H || +z.p.Hmax || 5) - 0.3);
  const xs = aer.map(u => u.x), ys = aer.map(u => u.y);
  const p = Object.assign(UT.blower.def(), { nDuty: nD, nStby: 1, Qr: Math.ceil(peak / nD / 50) * 50, Pr: Math.ceil((9.81 * sub + 14) / 5) * 5, zones: aer.map(u => u.id) });
  let i = 1; while (P.units.some(u => u.id === 'BL' + i)) i++;
  P.units.push({ id: 'BL' + i, type: 'blower', name: 'Trạm máy thổi khí', x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2 / 10) * 10, y: Math.max(60, Math.min(...ys) - 140), p });
}
