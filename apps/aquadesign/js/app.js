/* AquaDesign VN – giao diện chính */
'use strict';
const APP = { S: null, R: null };
const $ = s => document.querySelector(s);

/* ---------- ví dụ ---------- */
APP.examples = {
  ex50k: { name: 'Ví dụ 50.000 PE – DWA-A 131, N/DN gián đoạn, ổn định bùn', make: () => DEF.project() },
  vn20k: {
    name: 'Đô thị nhiệt đới 20.000 m³/d – 27 °C, tiền khử nitrat, lắng sơ cấp', make: () => {
      const S = DEF.project();
      Object.assign(S.project, { name: 'Đô thị 20.000 m³/d (27 °C)', place: 'Việt Nam' });
      S.load.mode = 'abs'; S.load.abs = { Qd: 20000, Qh: 1250, Qm: 1500, conc: { BOD: 180, COD: 380, TSS: 200, TKN: 40, P: 5.5, NO3: 0 } };
      S.load.prim.on = true; S.load.prim.tR = 1.0;
      S.opt.dn = 'pre'; S.opt.stab = false; S.bio.T = 27; S.bio.NO3e = 8; S.bio.pChem = true; S.bio.Pe = 1.5; S.bio.SKS = 5;
      S.sst.tE = 2.0; S.sst.ISV = 120; S.sst.n = 4; S.at.n = 4; S.aer.Tmin = 24; S.aer.Tmax = 32;
      S.grit.on = true; S.sludge.thick.on = true; S.sludge.dig.on = true; S.sludge.tank.on = false; S.sludge.dew.on = true;
      return S;
    },
  },
  sbr10k: {
    name: 'SBR 10.000 PE – 25 °C, 2 bể, chu kỳ 6 h', make: () => {
      const S = DEF.project();
      Object.assign(S.project, { name: 'SBR 10.000 PE (25 °C)' });
      S.opt.line = 'SBR'; S.load.PE = 10000; S.load.xQ = 12; S.bio.T = 25; S.opt.stab = false; S.bio.NO3e = 8;
      S.aer.Tmin = 22; S.aer.Tmax = 30; S.sbr.buffer = true; S.sludge.dew.on = true; S.bio.pChem = true;
      return S;
    },
  },
  iceas15k: {
    name: 'ICEAS 15.000 m³/d – 27 °C, KCN (chu trình tự chọn)', make: () => {
      const S = DEF.project();
      Object.assign(S.project, { name: 'ICEAS 15.000 m³/d (27 °C)', place: 'Việt Nam' });
      S.opt.line = 'ICEAS'; S.opt.stab = false;
      S.load.mode = 'abs'; S.load.abs = { Qd: 15000, Qh: 937.5, Qm: 1250, conc: { BOD: 250, COD: 500, TSS: 220, TKN: 45, P: 6, NO3: 0 } };
      S.bio.T = 27; S.bio.NO3e = 8; S.bio.pChem = true; S.bio.SKS = 5; S.ic.nb = 4; S.sst.ISV = 150; S.aer.Tmin = 24; S.aer.Tmax = 32;
      S.grit.on = true; S.sludge.dew.on = true; S.sludge.tank.on = false;
      return S;
    },
  },
  ctech50: {
    name: 'C-Tech 50.000 m³/d – 4 bể (kiểu BEP SFC)', make: () => {
      const S = DEF.project();
      Object.assign(S.project, { name: 'C-Tech 50.000 m³/d' });
      S.opt.line = 'CTECH'; S.opt.stab = false;
      S.load.mode = 'abs'; S.load.abs = { Qd: 50000, Qh: 3125, Qm: 4700, conc: { BOD: 200, COD: 400, TSS: 220, TKN: 40, P: 6, NO3: 0 } };
      S.bio.T = 25; S.bio.NO3e = 6; S.bio.pChem = true; S.bio.SKS = 5; S.ct.L = 45; S.aer.Tmin = 22; S.aer.Tmax = 30;
      S.grit.on = true; S.sludge.thick.on = true; S.sludge.dew.on = true; S.sludge.tank.on = false;
      return S;
    },
  },
  kub5k: {
    name: 'MBR Kubota 5.000 m³/d – RW400, lọc trọng lực', make: () => {
      const S = DEF.project();
      Object.assign(S.project, { name: 'MBR Kubota 5.000 m³/d' });
      S.opt.line = 'MBR'; S.mbr.vendor = 'kubota'; S.opt.dn = 'pre'; S.opt.stab = false;
      S.load.mode = 'abs'; S.load.abs = { Qd: 5000, Qh: 312.5, Qm: 450, conc: { BOD: 250, COD: 500, TSS: 220, TKN: 45, P: 6, NO3: 0 } };
      S.bio.T = 25; S.bio.pChem = true; S.bio.NO3e = 6; S.at.n = 2; S.at.H = 5; S.aer.Tmin = 22; S.aer.Tmax = 30;
      S.comp.screenF = true; S.grit.on = true; S.sludge.dew.on = true; S.sludge.tank.on = false;
      return S;
    },
  },
  mbr30k: {
    name: 'MBR 30.000 PE – tiền khử nitrat, bể màng riêng', make: () => {
      const S = DEF.project();
      Object.assign(S.project, { name: 'MBR 30.000 PE' });
      S.opt.line = 'MBR'; S.load.PE = 30000; S.opt.dn = 'pre'; S.opt.stab = false; S.bio.T = 15; S.at.n = 2; S.at.H = 5.5;
      S.comp.screenF = true; S.grit.on = true; S.sludge.dew.on = true; S.bio.pChem = true;
      return S;
    },
  },
};

APP.markAllDone = S => { for (const s of ENG.STEPS[S.opt.line]) S.done[s.id] = true; };

/* ---------- lưu trữ ---------- */
APP.save = () => { try { localStorage.setItem('adv_project', JSON.stringify(APP.S)); } catch (e) { /* bỏ qua */ } };
APP.loadStored = () => {
  try { const s = localStorage.getItem('adv_project'); if (s) return U.fill(JSON.parse(s), DEF.project()); } catch (e) { /* bỏ qua */ }
  return null;
};
APP.toast = (t, ms = 2200) => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(APP._tt); APP._tt = setTimeout(() => e.classList.remove('on'), ms); };

/* ---------- vẽ màn hình chính ---------- */
APP.render = function () {
  const S = APP.S;
  APP.R = ENG.compute(S);
  const R = APP.R;
  $('#pname').textContent = S.project.name + (S.project.place ? ' – ' + S.project.place : '');
  document.querySelectorAll('#lineSeg button').forEach(b => b.classList.toggle('on', b.dataset.line === S.opt.line));
  $('#chipStd').textContent = 'Tiêu chuẩn: ' + ({ DWA: 'DWA', ME: 'M&E', MSIG: 'MSIG' }[S.opt.standard]);
  $('#chipProc').textContent = ENG.PROC_NAME[S.opt.process] + (S.opt.process === 'ND' ? ' · ' + ENG.DN_NAME[S.opt.dn] : '') + (S.opt.stab ? ' · ổn định bùn' : '') + ' · T = ' + S.bio.T + ' °C';
  APP.renderDiagram();
  // tóm tắt
  const rows = ENG.summary(S, R);
  $('#summary').innerHTML = '<table>' + rows.map(r => `<tr><td>${U.esc(r[0])}</td><td class="v">${U.esc(U.fmt(r[1]))}</td><td class="u">${U.esc(r[2])}</td></tr>`).join('') + '</table>';
  APP.renderMsgs($('#msgs'), S, R, APP.commitFix);
  APP.buildMenu();
  APP.save();
};

/* ---------- thông báo + nút sửa ----------
   el: <ul> đích; S, R: dự án & kết quả hiện tại; commit(S2): ghi nhận dự án đã sửa (màn hình chính hoặc form đang mở) */
APP.renderMsgs = function (el, S, R, commit, opt = {}) {
  const list = FIX.list(R).filter(m => !opt.keys || opt.keys.includes(m.key));
  const nFix = list.filter(m => m.lvl !== 'info' && m.fix.length).length;
  const h = [];
  if (nFix && !opt.noAuto) h.push(`<li class="fixbar"><button class="btn pri sm" data-auto="1">⚙ Tự sửa tất cả (${nFix})</button> <span class="note">thử từng phương án, giữ phương án giảm cảnh báo nhiều nhất, lặp đến khi không cải thiện</span></li>`);
  list.forEach((m, i) => {
    const btns = m.fix.map((f, j) => `<button class="btn sm fixb" data-m="${i}" data-f="${j}" title="Xem trước rồi áp dụng">${U.esc(f.l)}</button>`).join('');
    h.push(`<li class="${m.lvl}">${opt.noTitle ? '' : `<b>${U.esc(m.title)}:</b> `}${U.esc(m.t)}${btns ? `<div class="fixrow">${btns}</div>` : ''}</li>`);
  });
  for (const e of R.errors || []) h.push(`<li class="err">Lỗi tính: ${U.esc(e)}</li>`);
  el.innerHTML = h.join('') || '<li class="info">Không có cảnh báo.</li>';
  el.querySelectorAll('.fixb').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); const m = list[+b.dataset.m]; APP.previewFix(S, R, m, m.fix[+b.dataset.f], commit); }));
  const ab = el.querySelector('[data-auto]');
  if (ab) ab.addEventListener('click', ev => { ev.stopPropagation(); APP.autoFix(S, commit); });
};

// xem trước một phương án: thông số đổi, thông báo gốc còn/hết, số cảnh báo trước → sau, chỉ tiêu chính
APP.previewFix = function (S, R, msg, fx, commit) {
  const t = FIX.trial(S, R, msg, fx);
  if (!t.changes.length) { APP.toast('Phương án không làm thay đổi thông số nào (đã ở giá trị đề xuất).'); return; }
  const sum = (s, r) => Object.fromEntries(ENG.summary(s, r).map(x => [x[0], x]));
  const a = sum(S, R), b = sum(t.S2, t.R2);
  const rows = Object.keys(b).filter(k => a[k] && String(a[k][1]) !== String(b[k][1])).map(k => `<tr><td>${U.esc(k)}</td><td class="c">${U.esc(U.fmt(a[k][1]))}</td><td class="c"><b>${U.esc(U.fmt(b[k][1]))}</b></td><td>${U.esc(b[k][2])}</td></tr>`).join('');
  const neu = FIX.list(t.R2).filter(m => m.lvl !== 'info' && !FIX.list(R).some(o => o.t === m.t));
  const html = `<section class="rep"><h2>Áp dụng: ${U.esc(fx.l)}</h2><p><b>Thông báo:</b> ${U.esc(msg.t)}</p>
    <h3>Thông số thay đổi</h3><ul>${t.changes.map(([p, o, v]) => `<li>${U.esc(FIX.label(p))}: ${U.esc(FIX.fmtV(o))} → <b>${U.esc(FIX.fmtV(v))}</b></li>`).join('')}</ul>
    <h3>Kết quả tính lại</h3><p>${t.resolved ? '<span class="ok">✔ Thông báo này đã hết.</span>' : '<span class="bad">✖ Thông báo này vẫn còn – có thể cần thêm phương án khác.</span>'} Cảnh báo + lỗi: ${t.nBefore} → <b>${t.nAfter}</b>.${t.crash ? ' <span class="bad">Có lỗi tính mới.</span>' : ''}</p>
    ${neu.length ? '<p class="note">Thông báo mới phát sinh:</p><ul class="msgs">' + neu.map(m => `<li class="${m.lvl}">${U.esc(m.title)}: ${U.esc(m.t)}</li>`).join('') + '</ul>' : ''}
    ${rows ? '<h3>Chỉ tiêu chính thay đổi</h3><table class="grid"><thead><tr><th>Chỉ tiêu</th><th>Trước</th><th>Sau</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : ''}</section>`;
  APP.openFixDlg('Phương án sửa', html, [['Áp dụng & tính lại', () => { commit(t.S2); APP.toast('Đã áp dụng: ' + fx.l + ' – ' + t.nBefore + ' → ' + t.nAfter + ' cảnh báo.'); }, true]]);
};

APP.autoFix = function (S, commit) {
  const r = FIX.auto(S);
  if (!r.log.length) { APP.toast('Không tìm được phương án nào giảm cảnh báo – cần chỉnh tay.'); return; }
  const n0 = r.log[0].nBefore, n1 = r.log[r.log.length - 1].nAfter;
  const left = FIX.list(r.R).filter(m => m.lvl !== 'info');
  const html = `<section class="rep"><h2>Tự sửa – ${r.log.length} bước, cảnh báo + lỗi ${n0} → ${n1}</h2>
    <table class="grid"><thead><tr><th>#</th><th>Thông báo</th><th>Phương án</th><th>Thông số thay đổi</th><th>Cảnh báo</th></tr></thead><tbody>${r.log.map((l, i) => `<tr><td class="c">${i + 1}</td><td>${U.esc(l.title)}: ${U.esc(l.msg)}</td><td>${U.esc(l.fx)}</td><td>${U.esc(FIX.changeText(l.changes))}</td><td class="c">${l.nBefore} → ${l.nAfter}</td></tr>`).join('')}</tbody></table>
    ${left.length ? '<h3>Còn lại (cần xem xét / chỉnh tay)</h3><ul class="msgs">' + left.map(m => `<li class="${m.lvl}">${U.esc(m.title)}: ${U.esc(m.t)}</li>`).join('') + '</ul>' : '<p class="ok">✔ Không còn cảnh báo/lỗi.</p>'}
    <p class="note">Các phương án là gợi ý kỹ thuật theo DWA/nhà cung cấp; kiểm tra lại thông số trước khi dùng cho hồ sơ. Có thể hoàn tác bằng "Hoàn tác sửa" trong menu Tùy chọn.</p></section>`;
  APP.openFixDlg('Tự sửa thông số', html, [['Áp dụng tất cả', () => { commit(r.S); APP.toast('Đã áp dụng ' + r.log.length + ' bước sửa – ' + n0 + ' → ' + n1 + ' cảnh báo.'); }, true]]);
};

// ghi nhận sửa ở màn hình chính: lưu bản trước để hoàn tác; đổi dây chuyền thì xóa trạng thái các bước
APP.undo = [];
APP.commitFix = function (S2) {
  APP.undo.push(U.clone(APP.S)); if (APP.undo.length > 20) APP.undo.shift();
  if (S2.opt.line !== APP.S.opt.line) S2.done = { load: !!APP.S.done.load };
  APP.S = S2; APP.render();
};
APP.undoFix = function () {
  if (!APP.undo.length) { APP.toast('Không có thao tác sửa để hoàn tác.'); return; }
  APP.S = APP.undo.pop(); APP.render(); APP.toast('Đã hoàn tác lần sửa gần nhất.');
};

// hộp thoại xếp chồng (không đóng form đang mở)
APP.openFixDlg = function (title, html, actions) {
  let m = $('#fixModal');
  if (!m) { m = document.createElement('div'); m.id = 'fixModal'; m.className = 'modal top'; m.innerHTML = '<div class="dlg wide" id="fixDlg"></div>'; document.body.appendChild(m); }
  const dlg = m.querySelector('#fixDlg'), close = () => m.classList.remove('on');
  dlg.innerHTML = `<header><b>${U.esc(title)}</b><button class="x" data-a="close">×</button></header><div class="body one docview">${html}</div>
  <footer><span class="sp"></span><button class="btn" data-a="close">Hủy</button>${actions.map((a, i) => `<button class="btn${a[2] ? ' pri' : ''}" data-i="${i}">${U.esc(a[0])}</button>`).join('')}</footer>`;
  dlg.querySelectorAll('[data-a=close]').forEach(b => b.addEventListener('click', close));
  dlg.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { close(); actions[+b.dataset.i][1](); }));
  m.classList.add('on');
};

APP.renderDiagram = function () {
  const S = APP.S, R = APP.R, st = ENG.stepState(S, R);
  const steps = ENG.STEPS[S.opt.line];
  const W = 760, bw = 300, bh = 40, x0 = 120, gap = 22;
  const out = [];
  let y = 14;
  const box = (id, label, sub, state, x, yy, w = bw, h = bh, cls = '') => {
    out.push(`<g class="step ${state} ${cls}" data-id="${id}"><rect x="${x}" y="${yy}" width="${w}" height="${h}" rx="6"></rect><text x="${x + w / 2}" y="${yy + (sub ? h / 2 - 3 : h / 2 + 4)}" text-anchor="middle" font-weight="600">${U.esc(label)}</text>${sub ? `<text x="${x + w / 2}" y="${yy + h / 2 + 13}" text-anchor="middle" font-size="11.5" opacity=".85">${U.esc(sub)}</text>` : ''}</g>`);
  };
  const sub = {
    load: R.load ? `Q_d ${U.fmt(R.load.Qd, 0)} m³/d · Q_M ${U.fmt(R.load.Qm, 0)} m³/h` : '',
    sst: R.sst ? `${R.sst.n} × ${R.sst.D ? 'D ' + U.fmt(R.sst.D) : U.fmt(R.sst.B) + '×' + U.fmt(R.sst.L)} m · TS_max ${U.fmt(R.sst.TSmax)} kg/m³` : '',
    bio: R.bio ? `t_TS ${U.fmt(R.bio.tSS, 1)} d · V_min ${U.fmt(R.bio.V, 0)} m³` + (S.opt.process === 'ND' ? ` · V_D/V ${U.fmt(R.bio.r, 2)}` : '') : '',
    at: R.tank ? `${R.tank.n} × ${ENG.TANK_NAME[R.tank.type].split(' (')[0]} · V ${U.fmt(R.tank.V, 0)} m³` : '',
    aer: R.aer ? `SOTR ${U.fmt(R.aer.SOTR, 0)} kg/h` + (R.aer.QL ? ` · ${U.fmt(R.aer.QL, 0)} Nm³/h` : '') : '',
    rs: R.rs ? `Q_RS ${U.fmt(R.rs.QRS, 0)} m³/h · bùn dư ${U.fmt(R.bio ? R.bio.US : 0, 0)} kg/d` : '',
    sbr: R.sbr ? `${S.sbr.n} × ${U.fmt(R.sbr.V1, 0)} m³ · f_A ${U.fmt(R.sbr.fA, 2)} · t_TS ${U.fmt(R.sbr.B.tSS, 1)} d` : '',
    mbr: R.mbr ? (R.mbr.kub ? `${R.mbr.nFE} × Kubota ${R.mbr.mod.id.replace('KB-', '')} · ` : '') + `${U.fmt(R.mbr.Areal, 0)} m² màng · J ${U.fmt(R.mbr.fluxDes, 1)} l/(m²·h)` : '',
    iceas: R.iceas ? `${R.iceas.nb} × ${U.fmt(R.iceas.W)}×${U.fmt(R.iceas.L)} m · ${R.iceas.cycle} · SRT ${U.fmt(R.iceas.SRT, 1)} d · F/M ${U.fmt(R.iceas.FM, 3)}` : '',
    ctech: R.ctech ? `${R.ctech.N} × ${U.fmt(R.ctech.L)}×${U.fmt(R.ctech.Bw)} m · TWL ${U.fmt(R.ctech.TWL)} m · t_TS ${U.fmt(R.ctech.tSS, 1)} d` : '',
  };
  // chuỗi chính
  const ys = {};
  steps.forEach((s, i) => {
    if (S.opt.line === 'CAS' && s.id === 'bio') {
      // bể kỵ khí/selector thông tin
    }
    ys[s.id] = y;
    let label = s.name;
    if (s.id === 'sst') label = 'Bể lắng II ' + (S.opt.standard === 'ME' ? '(M&E)' : (S.sst.flow === 'vt' ? 'dòng đứng' : 'dòng ngang'));
    if (s.id === 'at') label = 'Bể aerotank';
    box(s.id, label, sub[s.id], st[s.id], x0, y);
    if (i < steps.length - 1) out.push(`<path class="conn" d="M${x0 + bw / 2} ${y + bh} L${x0 + bw / 2} ${y + bh + gap}" marker-end="url(#ar)"/>`);
    y += bh + gap;
  });
  const yEnd = y;
  // phụ trợ (bên phải)
  const ax = x0 + bw + 70, aw = 220, ah = 34;
  const aux = [
    ['grit', 'Bể lắng cát', !!R.grit],
    ['sludge', 'Xử lý bùn', !!R.sludge],
    ['comp', 'Thành phần & điểm đo', true],
    ['cost', 'Chi phí vận hành', !!R.cost],
    ['drawings', 'Bản vẽ & sơ đồ', ENG.complete(S)],
    ['report', 'Bản tính & thuyết minh', ENG.complete(S)],
  ];
  let ay = 14;
  out.push(`<text x="${ax}" y="${ay - 2}" font-size="11" fill="var(--muted)">Công trình & công cụ bổ sung</text>`);
  ay += 6;
  const loadOk = st.load === 'green';
  for (const [id, label, ok] of aux) {
    const state = !loadOk ? 'grey' : ok ? 'green' : 'white';
    box(id, label, '', state, ax, ay, aw, ah, 'aux');
    ay += ah + 12;
  }
  // các mũi tên phụ
  if (S.opt.line === 'CAS' && R.tank && (R.tank.an || R.tank.sel)) {
    const t = [R.tank.an ? 'Bể kỵ khí ' + U.fmt(R.tank.an.V, 0) + ' m³' : '', R.tank.sel ? 'Selector ' + U.fmt(R.tank.sel.V, 0) + ' m³' : ''].filter(Boolean).join(' · ');
    out.push(`<text x="${x0 - 8}" y="${ys.at + bh / 2 + 4}" text-anchor="end" font-size="11.5" fill="var(--muted)">${U.esc(t)}</text>`);
  }
  if (S.load.prim.on && ys.load !== undefined) out.push(`<text x="${x0 - 8}" y="${ys.load + bh / 2 + 4}" text-anchor="end" font-size="11.5" fill="var(--muted)">+ lắng sơ cấp</text>`);
  if (ENG.complete(S)) out.push(`<text x="${x0 + bw / 2}" y="${yEnd + 4}" text-anchor="middle" font-size="12.5" fill="var(--green)" font-weight="600">✓ Hoàn thành tính toán dây chuyền nước</text>`);
  const H = Math.max(yEnd + 20, ay + 10);
  $('#diagram').innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="var(--muted)"/></marker></defs>${out.join('')}</svg>`;
  $('#diagram').querySelectorAll('.step').forEach(g => g.addEventListener('click', () => APP.stepClick(g.dataset.id, g.classList.contains('grey'))));
};

APP.stepClick = function (id, grey) {
  if (grey) { APP.toast('Hãy hoàn thành các bước phía trước (ô màu trắng).'); return; }
  if (id === 'drawings') return APP.openDrawings();
  if (id === 'report') return APP.openReport('dim');
  if (id === 'at' && APP.S.opt.line === 'MBR') return APP.openForm('at');
  APP.openForm(id);
};

/* ---------- hộp thoại biểu mẫu ---------- */
APP.openForm = function (id, opt = {}) {
  const def = FORMS[id];
  if (!def) return;
  const W = U.clone(APP.S);
  const dlg = $('#dlg');
  dlg.className = 'dlg';
  const isStep = ENG.STEPS[W.opt.line].some(s => s.id === id);
  dlg.innerHTML = `<header><b>${U.esc(def.title)}</b><button class="x" data-a="cancel">×</button></header>
  <div class="body"><div class="frm"></div><div class="res"></div></div>
  <footer>${def.draw ? '<button class="btn" data-a="pic">Hình kiểm tra</button>' : ''}${id === 'aer' ? '<button class="btn" data-a="cases">Biến động tải</button>' : ''}<span class="sp"></span><button class="btn" data-a="cancel">Hủy</button><button class="btn pri" data-a="ok">OK</button></footer>`;
  const frm = dlg.querySelector('.frm'), res = dlg.querySelector('.res');
  let visKey = '';
  const renderFields = () => {
    const fs = def.fields(W);
    const vis = fs.filter(f => !f.show || f.show(W));
    visKey = vis.map(f => f.p || f.t).join('|');
    const h = [];
    let open = false;
    for (const f of vis) {
      if (f.k === 'h') { if (open) h.push('</fieldset>'); h.push(`<fieldset><legend>${U.esc(f.t)}</legend>`); open = true; continue; }
      if (!open) { h.push('<fieldset>'); open = true; }
      const v = U.get(W, f.p || '');
      const hint = f.hint ? `<div class="hint">${U.esc(f.hint)}</div>` : '';
      if (f.k === 'n') h.push(`<div class="fr"><label>${U.esc(f.l)}</label><input type="number" data-p="${f.p}" value="${v ?? ''}" step="${f.step || 'any'}"${f.min !== undefined ? ' min="' + f.min + '"' : ''}><span class="u">${U.esc(f.u || '')}</span>${hint}</div>`);
      else if (f.k === 't') h.push(`<div class="fr wide"><label>${U.esc(f.l)}</label><input type="text" data-p="${f.p}" value="${U.esc(v ?? '')}">${hint}</div>`);
      else if (f.k === 's') h.push(`<div class="fr${f.wide ? ' wide' : ' wide'}"><label>${U.esc(f.l)}</label><select data-p="${f.p}" data-t="${typeof f.opts[0][0]}">${f.opts.map(o => `<option value="${U.esc(o[0])}"${String(o[0]) === String(v) ? ' selected' : ''}>${U.esc(o[1])}</option>`).join('')}</select>${hint}</div>`);
      else if (f.k === 'c') h.push(`<div class="fr chk"><input type="checkbox" data-p="${f.p}"${v ? ' checked' : ''}><label>${U.esc(f.l)}</label>${hint}</div>`);
      else if (f.k === 'note') h.push(`<p class="note">${U.esc(f.t)}</p>`);
      else if (f.k === 'btn') h.push(`<button class="btn" data-btn="${fs.indexOf(f)}" style="margin:4px 0">${U.esc(f.t)}</button>`);
    }
    if (open) h.push('</fieldset>');
    frm.innerHTML = h.join('');
    frm.querySelectorAll('[data-btn]').forEach(b => b.addEventListener('click', () => { fs[+b.dataset.btn].fn(W); renderFields(); renderRes(); }));
  };
  const renderRes = () => {
    const RW = ENG.compute(W);
    let html = '';
    if (def.key && RW[def.key] && RW[def.key].d) html = REP.repHTML(RW[def.key].d);
    if (id === 'sbr' && RW.sbr) html += REP.repHTML(RW.sbr.B.d);
    if (id === 'mbr' && RW.mbr) html += REP.repHTML(RW.mbr.B.d);
    if (id === 'iceas' && RW.iceas) html += REP.repHTML(RW.iceas.B.d);
    if (id === 'ctech' && RW.ctech) html += REP.repHTML(RW.ctech.B.d);
    if (id === 'cost' && RW.cost) html = REP.repHTML(RW.cost.d);
    if (id === 'pipes' && RW.pipes) html = REP.repHTML(RW.pipes.d);
    if (id === 'build') html = (RW.masses || []).map(m => REP.repHTML(m.d)).join('') || '<p class="note">Chưa có bể để tính.</p>';
    if (id === 'verify') html = REP.repHTML(ENG.verifySST(W.verify).d);
    if (id === 'comp' && RW.mach) html = REP.machinesHTML(W, RW);
    if (id === 'process') html = '<h2>Tóm tắt</h2>' + REP.short(W, RW);
    if (!html) html = '<p class="note">Chưa đủ dữ liệu để tính (hoàn thành các bước trước).</p>';
    // thông báo của bước này kèm nút sửa: sửa bản nháp W của form, chỉ ghi vào dự án khi bấm OK
    const keys = APP.FORM_KEYS[id] || (def.key ? [def.key] : []);
    res.innerHTML = '<div class="fixbox"><h3>Thông báo & phương án sửa</h3><ul class="msgs" id="fmsgs"></ul></div>' + html.replace(/<ul class="msgs">[\s\S]*?<\/ul>/g, '');
    APP.renderMsgs(res.querySelector('#fmsgs'), W, RW, S2 => { for (const k of Object.keys(W)) delete W[k]; Object.assign(W, S2); renderFields(); renderRes(); }, { keys, noTitle: keys.length < 2 });
    APP._RW = RW;
  };
  const readInput = el => {
    const p = el.dataset.p;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') { v = el.value === '' ? 0 : parseFloat(el.value); if (!isFinite(v)) return; }
    else if (el.tagName === 'SELECT') { const t = el.dataset.t; v = t === 'number' ? Number(el.value) : t === 'boolean' ? el.value === 'true' : el.value; }
    else v = el.value;
    U.set(W, p, v);
  };
  frm.addEventListener('input', e => { if (e.target.dataset.p) { readInput(e.target); clearTimeout(APP._ti); APP._ti = setTimeout(renderRes, 120); } });
  frm.addEventListener('change', e => {
    if (!e.target.dataset.p) return;
    readInput(e.target);
    const fs = def.fields(W).filter(f => !f.show || f.show(W)).map(f => f.p || f.t).join('|');
    if (fs !== visKey || e.target.tagName === 'SELECT') renderFields();   // select có thể đổi danh sách lựa chọn phụ thuộc (vd. loại đĩa → sản phẩm)
    renderRes();
  });
  dlg.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.a;
    if (a === 'cancel') APP.closeModal();
    else if (a === 'pic') APP.openDrawings(def.draw, W, APP._RW);
    else if (a === 'cases') APP.openLoadCases(APP._RW);
    else if (a === 'ok') {
      const strip = o => { const c = U.clone(o); delete c.done; delete c.variants; return JSON.stringify(c); };
      const changed = strip(W) !== strip(APP.S);
      const lineChanged = W.opt.line !== APP.S.opt.line;
      const procChanged = JSON.stringify(W.opt) !== JSON.stringify(APP.S.opt);
      APP.S = W;
      if (lineChanged) APP.S.done = { load: !!APP.S.done.load };
      else if (procChanged && !isStep) { const keep = { load: APP.S.done.load, sst: APP.S.done.sst }; APP.S.done = {}; for (const k in keep) if (keep[k]) APP.S.done[k] = true; }
      if (isStep) { if (changed) ENG.invalidateAfter(APP.S, id); APP.S.done[id] = true; }
      APP.closeModal(); APP.render();
      if (opt.after) opt.after();
    }
  }));
  renderFields(); renderRes();
  $('#modal').classList.add('on');
};

// thông báo hiển thị trong từng form (khóa kết quả)
APP.FORM_KEYS = { load: ['load'], sst: ['sst'], bio: ['bio'], at: ['tank'], aer: ['aer'], rs: ['rs'], sbr: ['sbr'], mbr: ['mbr'], iceas: ['iceas'], ctech: ['ctech'], grit: ['grit'], sludge: ['sludge'], process: FIX.KEYS, consts: ['load', 'bio', 'msig'] };

APP.closeModal = () => { $('#modal').classList.remove('on'); $('#dlg').innerHTML = ''; };

/* ---------- trình xem tài liệu ---------- */
APP.openDoc = function (title, html, actions = []) {
  const dlg = $('#dlg');
  dlg.className = 'dlg wide';
  dlg.innerHTML = `<header><b>${U.esc(title)}</b><button class="x" data-a="close">×</button></header><div class="body one docview">${html}</div>
  <footer>${actions.map((a, i) => `<button class="btn" data-i="${i}">${U.esc(a[0])}</button>`).join('')}<span class="sp"></span><button class="btn pri" data-a="close">Đóng</button></footer>`;
  dlg.querySelectorAll('[data-a=close]').forEach(b => b.addEventListener('click', APP.closeModal));
  dlg.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => actions[+b.dataset.i][1]()));
  $('#modal').classList.add('on');
};

APP.fname = ext => (APP.S.project.name || 'duan').replace(/[^\p{L}\p{N}_-]+/gu, '_') + ext;

APP.openReport = function (kind) {
  const S = APP.S, R = APP.R;
  if (!R.load) return;
  let title, html;
  if (kind === 'desc') { title = 'Thuyết minh công nghệ'; html = REP.description(S, R); }
  else if (kind === 'dim') { title = 'Bản tính công nghệ'; html = REP.dimensioning(S, R); }
  else if (kind === 'short') { title = 'Tóm tắt'; html = REP.short(S, R) + (R.mach ? REP.machinesHTML(S, R) : ''); }
  else if (kind === 'grit') { title = 'Bản tính bể lắng cát'; html = R.grit ? REP.repHTML(R.grit.d) : '<p>Chưa chọn bể lắng cát (Bổ sung > Thành phần hoặc Lựa chọn > Bể lắng cát).</p>'; }
  else if (kind === 'mach') { title = 'Danh mục thiết bị & điểm đo'; html = REP.machinesHTML(S, R); }
  else if (kind === 'machAD') { title = 'Danh mục máy & điểm đo (mã đặt hàng)'; html = REP.machinesADHTML(S, R); }
  else if (kind === 'hsg') { title = 'Thuật toán HSG – đối chiếu'; html = R.hsg && R.hsg.d ? REP.repHTML(R.hsg.d) : '<p>Bật "Đối chiếu thuật toán HSG" trong Tùy chọn > Quy trình.</p>'; }
  else if (kind === 'msig') { title = 'Kiểm tra theo MSIG'; html = R.msig ? REP.repHTML(R.msig.d) : '<p>Chọn tiêu chuẩn MSIG trong Tùy chọn > Quy trình.</p>'; }
  else if (kind === 'cost') { title = 'Chi phí vận hành'; html = R.cost ? REP.repHTML(R.cost.d) : ''; }
  else if (kind === 'sludge') { title = 'Xử lý bùn'; html = R.sludge ? REP.repHTML(R.sludge.d) : ''; }
  else if (kind === 'o2') { title = 'Hiệu suất ôxy'; html = R.o2 ? REP.repHTML(R.o2.d) : ''; }
  else if (kind === 'single') { title = 'Kết quả từng bước'; html = REP.order(R, S).map(d => REP.repHTML(d)).join(''); }
  const acts = [
    ['In / PDF', () => REP.print(title, html)],
    ['Xuất Word (.doc)', () => REP.word(title, html, APP.fname('_' + kind + '.doc'))],
  ];
  if (kind === 'dim' || kind === 'single') acts.push(['Xuất Excel', () => REP.xls(REP.calcSheets(S, R), APP.fname('_bantinh.xls'))]);
  if (kind === 'machAD') acts.push(['Xuất Excel (Máy + Điểm đo)', () => REP.xls([{ name: 'Machine List', header: true, rows: REP.machRowsAD(R) }, { name: 'Measuring List', header: true, rows: REP.measRowsAD(R) }], APP.fname('_machinelist.xls'))]);
  if (kind === 'mach' || kind === 'short') {
    acts.push(['Excel danh mục', () => REP.xls([{ name: 'Thiết bị', header: true, rows: [['Mã', 'Thiết bị', 'Làm việc', 'Dự phòng', 'Thông số', 'kW', 'Nguồn']].concat(R.mach.M.map(r => [r.tag, r.name, r.n, r.sb, r.spec, r.kW, r.src])) }, { name: 'Điểm đo', header: true, rows: [['Mã', 'Đại lượng', 'Vị trí']].concat(R.mach.P.map(r => [r.tag, r.name, r.loc])) }], APP.fname('_thietbi.xls'))]);
    acts.push(['XML danh mục', () => U.download(APP.fname('_thietbi.xml'), REP.machXML(S, R), 'application/xml')]);
    acts.push(['CSV', () => U.download(APP.fname('_thietbi.csv'), REP.csv([['Mã', 'Thiết bị', 'Làm việc', 'Dự phòng', 'Thông số', 'kW']].concat(R.mach.M.map(r => [r.tag, r.name, r.n, r.sb, r.spec, r.kW]))), 'text/csv;charset=utf-8')]);
  }
  APP.openDoc(title, html, acts);
};

/* ---------- bản vẽ ---------- */
APP.openDrawings = function (key, W, RW) {
  const S = W || APP.S, R = RW || APP.R;
  const list = DRW.list(S, R);
  if (!list.length) { APP.toast('Chưa có bản vẽ – hoàn thành tính toán trước.'); return; }
  let cur = Math.max(0, list.findIndex(l => l[0] === key));
  const dlg = $('#dlg');
  dlg.className = 'dlg wide';
  dlg.innerHTML = `<header><b>Bản vẽ đúng tỷ lệ</b><button class="x" data-a="close">×</button></header>
  <div class="body one" style="padding:10px"><div class="dwgwrap"><div class="side"><div class="tabs" id="dtabs"></div><div class="note">Lăn chuột để phóng to/thu nhỏ, kéo để di chuyển, nhấp đúp để vừa khung. Tọa độ & kích thước theo mét; DXF xuất theo mm.</div><div id="dinfo" class="note"></div></div><div class="canvas" id="dcanvas"></div></div></div>
  <footer><button class="btn" data-a="dxf">Xuất DXF</button><button class="btn" data-a="svg">Xuất SVG</button><button class="btn" data-a="png">Xuất PNG</button><button class="btn" data-a="print">In</button><span class="sp"></span><button class="btn pri" data-a="close">Đóng</button></footer>`;
  let g;
  const show = () => {
    g = list[cur][2]();
    dlg.querySelector('#dtabs').innerHTML = list.map((l, i) => `<button class="${i === cur ? 'on' : ''}" data-k="${i}">${U.esc(l[1])}</button>`).join('');
    dlg.querySelectorAll('#dtabs button').forEach(b => b.addEventListener('click', () => { cur = +b.dataset.k; show(); }));
    const c = dlg.querySelector('#dcanvas');
    c.innerHTML = g.svg({ id: 'dsvg' });
    const b = g.bounds();
    dlg.querySelector('#dinfo').textContent = `Phạm vi: ${U.fmt(b.x1 - b.x0, 1)} × ${U.fmt(b.y1 - b.y0, 1)} m · ${g.e.length} đối tượng`;
    APP.panZoom(c.querySelector('svg'));
  };
  dlg.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', () => {
    const a = btn.dataset.a, nm = APP.fname('_' + list[cur][0]);
    if (a === 'close') APP.closeModal();
    else if (a === 'dxf') U.download(nm + '.dxf', g.dxf(), 'application/dxf');
    else if (a === 'svg') U.download(nm + '.svg', g.svg().replace(/var\(--ink\)/g, '#111'), 'image/svg+xml');
    else if (a === 'png') APP.svgToPng(g.svg().replace(/var\(--ink\)/g, '#111'), nm + '.png');
    else if (a === 'print') REP.print(g.title, `<h2>${U.esc(g.title)} – ${U.esc(S.project.name)}</h2>` + g.svg());
  }));
  show();
  $('#modal').classList.add('on');
};

APP.panZoom = function (svg) {
  if (!svg) return;
  const vb0 = svg.getAttribute('viewBox').split(' ').map(Number);
  let vb = vb0.slice();
  const set = () => svg.setAttribute('viewBox', vb.map(v => v.toFixed(3)).join(' '));
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = svg.getBoundingClientRect(), k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const sc = Math.max(vb[2] / r.width, vb[3] / r.height);
    const ox = (r.width - vb[2] / sc) / 2, oy = (r.height - vb[3] / sc) / 2;
    const mx = vb[0] + (e.clientX - r.left - ox) * sc, my = vb[1] + (e.clientY - r.top - oy) * sc;
    vb = [mx - (mx - vb[0]) * k, my - (my - vb[1]) * k, vb[2] * k, vb[3] * k]; set();
  }, { passive: false });
  let drag = null;
  svg.addEventListener('mousedown', e => { drag = [e.clientX, e.clientY, vb[0], vb[1]]; svg.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup', () => { drag = null; svg.style.cursor = 'grab'; });
  svg.addEventListener('mousemove', e => {
    if (!drag) return;
    const r = svg.getBoundingClientRect(), sc = Math.max(vb[2] / r.width, vb[3] / r.height);
    vb[0] = drag[2] - (e.clientX - drag[0]) * sc; vb[1] = drag[3] - (e.clientY - drag[1]) * sc; set();
  });
  svg.addEventListener('dblclick', () => { vb = vb0.slice(); set(); });
};

APP.svgToPng = function (svgText, name) {
  const vb = /viewBox="([^"]+)"/.exec(svgText)[1].split(' ').map(Number);
  const scale = 2400 / Math.max(vb[2], vb[3]);
  const w = Math.round(vb[2] * scale), h = Math.round(vb[3] * scale);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgText.replace('<svg ', `<svg width="${w}" height="${h}" `)], { type: 'image/svg+xml' }));
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    c.toBlob(b => U.download(name, b), 'image/png'); URL.revokeObjectURL(url);
  };
  img.src = url;
};

/* ---------- biến động tải ---------- */
APP.openLoadCases = function (RW) {
  const R = RW || APP.R, a = R.aer;
  if (!a) return;
  const unit = a.blow && a.blow.item ? a.blow.item.Q : 0;
  const rows = a.cases.map(c => {
    const QL = a.SSOTR ? c.SOTR * 1000 / (a.SSOTR * a.hD) : 0;
    const Q1 = a.blow ? QL * a.blow.Q1 / a.QL : 0;
    return `<tr${a.des === c ? ' style="font-weight:600"' : ''}><td>${c.T} °C</td><td>${c.lab}</td><td class="c">${U.fmt((c.load || 1) * 100, 0)}</td><td class="c">${c.no === 3 && !c.fc ? '3a' : U.fmt(c.fc)}</td><td class="c">${c.no === 3 && !c.fn ? '3a' : U.fmt(c.fn)}</td><td class="c">${U.fmt(c.Cx ?? 2, 1)}</td><td class="c">${U.fmt(c.alpha ?? a.alpha, 2)}</td><td class="c">${U.fmt(c.r || 0, 2)}</td><td class="c">${U.fmt(c.tA ?? a.tA, 1)}</td><td class="c">${U.fmt(c.OVh)}</td><td class="c">${U.fmt(c.SOTR)}</td><td class="c">${QL ? U.fmt(QL, 0) : '–'}</td><td class="c">${unit ? Math.ceil(Q1 / unit - 1e-9) : '–'}</td></tr>`;
  }).join('');
  const html = `<section class="rep"><h2>Biến động tải – nhu cầu ôxy & lưu lượng khí (DWA-M 229-1)</h2><table class="grid"><thead><tr><th>T</th><th>Trường hợp</th><th>Tải %</th><th>f_C</th><th>f_N</th><th>C_x</th><th>α</th><th>V_D/V_BB</th><th>t_N h/d</th><th>OV_h kg/h</th><th>SOTR kg/h</th><th>Q_L Nm³/h</th><th>Số máy thổi chạy</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="note">Trường hợp thiết kế (in đậm): T = ${a.des.T} °C, ${a.des.lab}. DWA-M 229-1: trường hợp 2 quyết định sục khí & khuấy trộn, trường hợp 3 quyết định phân cấp máy thổi; tải &lt; 30 % → f_C = f_N = 1. Tải nhỏ ≈ ${U.fmt(a.QLmin || 0, 0)} Nm³/h: chọn máy thổi có dải điều chỉnh phù hợp (biến tần / nhiều máy nhỏ).</p></section>`;
  APP.openDoc('Biến động tải', html, [['In', () => REP.print('Biến động tải', html)]]);
};

/* ---------- ngân hàng thiết bị ---------- */
APP.openDB = function (cat = 'blower') {
  const cats = { blower: 'Máy thổi khí', cent: 'Bơm ly tâm', screw: 'Bơm trục vít', mixer: 'Máy khuấy', diffuser: 'Đĩa/ống/tấm phân phối khí', membrane: 'Module màng', perm: 'Bơm nước thấm MBR', surf: 'Sục khí bề mặt' };
  const dlg = $('#dlg');
  dlg.className = 'dlg wide';
  let filt = '';
  const draw = () => {
    const all = DB.data[cat] || [];
    const cols = [...new Set(all.flatMap(r => Object.keys(r)))];
    const f = filt.trim().toLowerCase();
    const idx = all.map((r, i) => i).filter(i => !f || cols.some(c => String(all[i][c] ?? '').toLowerCase().includes(f)));
    dlg.innerHTML = `<header><b>Ngân hàng thiết bị</b><button class="x" data-a="close">×</button></header>
    <div class="body one docview"><div class="tabs">${Object.entries(cats).map(([k, v]) => `<button class="${k === cat ? 'on' : ''}" data-c="${k}">${v}</button>`).join('')}</div>
    <p class="note">Danh mục mẫu (dải điển hình, không phải catalogue hãng). Toàn bộ bản ghi hiển thị dạng danh sách – lọc theo từ khóa để so sánh và chọn; sửa trực tiếp trong bảng, dữ liệu lưu trong trình duyệt. Tiêu chí gợi ý: máy thổi – áp lực rồi lưu lượng; bơm – cột áp rồi lưu lượng; máy khuấy – công suất định mức; đĩa/ống – SSOTR & dải tải.</p>
    <div class="fr wide"><label>Lọc</label><input type="text" id="dbFilt" value="${U.esc(filt)}" placeholder="vd. Turbo, 800, EPDM…"><span class="u">${idx.length}/${all.length} bản ghi</span></div>
    <table class="grid"><thead><tr><th>#</th>${cols.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>${idx.map(i => { const r = all[i]; return `<tr><td class="c">${i + 1}</td>${cols.map(c => `<td><input data-r="${i}" data-c="${c}" value="${U.esc(r[c] ?? '')}"></td>`).join('')}<td><button class="btn" data-del="${i}">✕</button></td></tr>`; }).join('')}</tbody></table></div>
    <footer><button class="btn" data-a="add">Thêm dòng</button><button class="btn" data-a="csv">Xuất CSV</button><button class="btn" data-a="reset">Khôi phục mặc định</button><span class="sp"></span><button class="btn pri" data-a="close">Lưu & đóng</button></footer>`;
    const fi = dlg.querySelector('#dbFilt');
    fi.addEventListener('change', () => { filt = fi.value; draw(); });
    fi.addEventListener('keydown', e => { if (e.key === 'Enter') { filt = fi.value; draw(); } });
    dlg.querySelectorAll('[data-c]').forEach(b => { if (b.tagName === 'BUTTON') b.addEventListener('click', () => { cat = b.dataset.c; filt = ''; draw(); }); });
    dlg.querySelectorAll('input[data-r]').forEach(inp => inp.addEventListener('change', () => {
      const r = DB.data[cat][+inp.dataset.r], c = inp.dataset.c;
      r[c] = typeof r[c] === 'number' ? parseFloat(inp.value) : inp.value; DB.save();
    }));
    dlg.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { DB.data[cat].splice(+b.dataset.del, 1); DB.save(); draw(); }));
    dlg.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'close') { DB.save(); APP.closeModal(); APP.render(); }
      else if (a === 'csv') { const L = DB.data[cat], cols = [...new Set(L.flatMap(r => Object.keys(r)))]; U.download('nganhang_' + cat + '.csv', REP.csv([cols].concat(L.map(r => cols.map(c => r[c] ?? '')))), 'text/csv;charset=utf-8'); }
      else if (a === 'add') { const L = DB.data[cat]; const n = Object.assign({}, L[L.length - 1] || {}); n.id = 'U' + Date.now().toString(36); n.name = 'Thiết bị mới'; L.push(n); DB.save(); draw(); }
      else if (a === 'reset') { if (confirm('Khôi phục toàn bộ ngân hàng thiết bị về mặc định?')) { DB.reset(); draw(); } }
    }));
  };
  draw();
  $('#modal').classList.add('on');
};

/* ---------- phương án ---------- */
/* ---------- ngân hàng dự án (Handbook 9): lưu dự án + kết quả chính theo tên dự án ---------- */
APP.projDB = {
  get() { try { return JSON.parse(localStorage.getItem('adv_projdb') || '[]'); } catch (e) { return []; } },
  set(a) { try { localStorage.setItem('adv_projdb', JSON.stringify(a)); return true; } catch (e) { APP.toast('Không lưu được vào trình duyệt (bộ nhớ đầy hoặc bị chặn) – dùng "Xuất JSON".'); return false; } },
  key(S, R) {
    const L = R.load || {}, B = R.bio || {}, a = R.aer || {}, c = R.cost || {};
    return { PE: S.load.PE, Qd: L.Qd, line: S.opt.line, proc: S.opt.process, V: B.V, tSS: B.tSS, US: B.US, Asst: R.sst && R.sst.Atot, SOTR: a.SOTR, QL: a.QL, kWha: c.kWha, cost: c.total, warn: Object.keys(R).reduce((n, k) => n + (R[k] && R[k].d ? R[k].d.msgs.filter(m => m.lvl !== 'info').length : 0), 0) };
  },
};
APP.openProjects = function () {
  const draw = () => {
    const db = APP.projDB.get(), f = (v, n = 0) => (typeof v === 'number' && isFinite(v) ? U.fmt(v, n) : '–');
    const rows = db.map((p, i) => `<tr><td><b>${U.esc(p.name)}</b><br><span class="note">${U.esc(p.date)}</span></td><td>${U.esc(p.k.line + ' / ' + p.k.proc)}</td><td class="c">${f(p.k.PE)}</td><td class="c">${f(p.k.Qd)}</td><td class="c">${f(p.k.V)}</td><td class="c">${f(p.k.tSS, 1)}</td><td class="c">${f(p.k.US)}</td><td class="c">${f(p.k.Asst)}</td><td class="c">${f(p.k.SOTR)}</td><td class="c">${f(p.k.kWha)}</td><td class="c">${f(p.k.cost)}</td><td class="c">${p.k.warn}</td><td><button class="btn" data-open="${i}">Mở</button> <button class="btn" data-del="${i}">Xóa</button></td></tr>`).join('');
    const html = `<section class="rep"><h2>Ngân hàng dự án</h2><p class="note">Lưu dữ liệu nhập và kết quả chính theo tên dự án (Tải lượng > Tên dự án). Lưu trong trình duyệt này – dùng "Xuất JSON" để sao lưu / chuyển máy.</p>
      <table class="grid"><thead><tr><th>Dự án</th><th>Dây chuyền</th><th>PE</th><th>Q_d m³/d</th><th>V_BB m³</th><th>t_TS d</th><th>ÜS kg/d</th><th>A lắng m²</th><th>SOTR kg/h</th><th>Điện kWh/a</th><th>Chi phí /a</th><th>Cảnh báo</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="13">Chưa có dự án.</td></tr>'}</tbody></table></section>`;
    APP.openDoc('Ngân hàng dự án', html, [
      ['Thêm / cập nhật dự án hiện tại', () => {
        const db = APP.projDB.get(), S = APP.S, R = APP.R || ENG.compute(S);
        let name = S.project.name || 'Dự án', i = db.findIndex(p => p.name === name);
        if (i >= 0 && !confirm('Đã có dự án "' + name + '". Ghi đè? (Hủy = đổi tên)')) { name = prompt('Tên mới:', name + ' (2)'); if (!name) return; i = db.findIndex(p => p.name === name); }
        const d = U.clone(S); delete d.variants;
        const rec = { name, date: new Date().toISOString().slice(0, 16).replace('T', ' '), data: d, k: APP.projDB.key(S, R) };
        if (i >= 0) db[i] = rec; else db.push(rec);
        if (APP.projDB.set(db)) { APP.toast('Đã lưu vào ngân hàng dự án.'); draw(); }
      }],
      ['Xuất CSV (đánh giá)', () => { const db = APP.projDB.get(); U.download('ngan_hang_du_an.csv', REP.csv([['Dự án', 'Ngày', 'Dây chuyền', 'Quy trình', 'PE', 'Q_d', 'V_BB', 't_TS', 'ÜS', 'A_lắng', 'SOTR', 'Q_L', 'kWh/a', 'Chi phí/a', 'Cảnh báo']].concat(db.map(p => [p.name, p.date, p.k.line, p.k.proc, p.k.PE, p.k.Qd, p.k.V, p.k.tSS, p.k.US, p.k.Asst, p.k.SOTR, p.k.QL, p.k.kWha, p.k.cost, p.k.warn]))), 'text/csv;charset=utf-8'); }],
      ['Xuất JSON', () => U.download('ngan_hang_du_an.json', JSON.stringify(APP.projDB.get(), null, 1), 'application/json')],
      ['Nhập JSON', () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = () => { const fr = new FileReader(); fr.onload = () => { try { const a = JSON.parse(fr.result); if (!Array.isArray(a)) throw new Error('sai định dạng'); const db = APP.projDB.get(); for (const p of a) if (p && p.name && p.data) { const i = db.findIndex(x => x.name === p.name); if (i >= 0) db[i] = p; else db.push(p); } APP.projDB.set(db); draw(); } catch (e) { alert('Không đọc được tệp: ' + e.message); } }; fr.readAsText(inp.files[0]); }; inp.click(); }],
    ]);
    $('#dlg').querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { const p = APP.projDB.get()[+b.dataset.open]; if (!p || !confirm('Mở dự án "' + p.name + '" thay cho dự án hiện tại?')) return; const n = U.fill(U.clone(p.data), DEF.project()); APP.markAllDone(n); APP.S = n; APP.closeModal(); APP.render(); APP.toast('Đã mở dự án.'); }));
    $('#dlg').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { const db = APP.projDB.get(), i = +b.dataset.del; if (!confirm('Xóa "' + db[i].name + '" khỏi ngân hàng dự án?')) return; db.splice(i, 1); APP.projDB.set(db); draw(); }));
  };
  draw();
};

APP.openVariants = function () {
  const S = APP.S;
  const draw = () => {
    const vs = S.variants;
    const cols = vs.map(v => { const s = U.fill(U.clone(v.data), DEF.project()); return { v, s, r: ENG.compute(s) }; });
    const cur = { v: { name: '(hiện tại)' }, s: S, r: APP.R };
    const all = [cur, ...cols];
    const keys = ENG.summary(S, APP.R).map(r => r[0]);
    const allRows = [...new Set(all.flatMap(c => ENG.summary(c.s, c.r).map(r => r[0])))];
    const tbl = `<table class="grid"><thead><tr><th>Chỉ tiêu</th>${all.map((c, i) => `<th>${U.esc(c.v.name)}${i ? ` <button class="btn" data-load="${i - 1}">Mở</button> <button class="btn" data-del="${i - 1}">✕</button>` : ''}</th>`).join('')}</tr></thead><tbody>` +
      allRows.map(k => `<tr><td>${U.esc(k)}</td>${all.map(c => { const r = ENG.summary(c.s, c.r).find(x => x[0] === k); return `<td class="c">${r ? U.esc(U.fmt(r[1])) + ' ' + U.esc(r[2]) : '–'}</td>`; }).join('')}</tr>`).join('') + '</tbody></table>';
    APP.openDoc('So sánh phương án', `<p class="note">Lưu phương án hiện tại rồi thay đổi quy trình/kích thước để so sánh (thể tích, năng lượng, chi phí…). ${keys.length ? '' : ''}</p>${tbl}`, [
      ['Lưu phương án hiện tại', () => { const name = prompt('Tên phương án:', S.project.name + ' – PA' + (S.variants.length + 1)); if (!name) return; const d = U.clone(S); delete d.variants; S.variants.push({ name, data: d }); APP.save(); draw(); }],
    ]);
    $('#dlg').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { S.variants.splice(+b.dataset.del, 1); APP.save(); draw(); }));
    $('#dlg').querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => { if (!confirm('Mở phương án này thay cho dự án hiện tại? (danh sách phương án được giữ)')) return; const v = S.variants[+b.dataset.load]; const n = U.fill(U.clone(v.data), DEF.project()); n.variants = S.variants; APP.S = n; APP.closeModal(); APP.render(); }));
  };
  draw();
};

/* ---------- trợ giúp ---------- */
APP.help = function () {
  const html = `<section class="rep"><h2>Hướng dẫn nhanh</h2>
  <p>Trình tự giống phần mềm thiết kế bùn hoạt tính truyền thống: các ô trên sơ đồ chính là các bước; ô <b>trắng</b> là bước có thể làm, ô <b>xanh</b> đã xác nhận (OK), ô <b>xám</b> chưa sẵn sàng. Sửa một bước đã xanh thì các bước sau phải xác nhận lại.</p>
  <ol><li><b>Tùy chọn > Quy trình</b>: chọn tiêu chuẩn (DWA / M&E / MSIG), dây chuyền (liên tục / SBR / MBR), mục tiêu (C, N, N/DN), phương pháp khử nitrat, ổn định bùn, bể kỵ khí, selector, kiểu sục khí.</li>
  <li><b>Tải lượng</b>: theo PE (giá trị riêng) hoặc lưu lượng + nồng độ đo; thêm nước thải công nghiệp, nước tách bùn, lắng sơ cấp.</li>
  <li><b>Bể lắng II</b> (DWA-A 131:2016): ISV, RV, t_E → TS lớn nhất cho aerotank, diện tích, các vùng chiều sâu, công trình vào, máng tràn.</li>
  <li><b>Thông số bùn hoạt tính</b>: phân đoạn COD, tuổi bùn (PF·3,4·1,103^(15−T), ổn định bùn T4/2016), V_D/V_BB, bùn dư, P, kiềm, nhu cầu ôxy.</li>
  <li><b>Bể aerotank</b>: chữ nhật / tròn / kết hợp quanh bể lắng / mương ôxy hóa; kiểm tra tuổi bùn thực.</li>
  <li><b>Sục khí</b> (DWA-M 229-1): trường hợp tải 0 – 5 (thiết kế, trung bình, lớn nhất, nhỏ nhất, dự báo, tự do), SOTR, lưu lượng khí, đĩa/ống/dải, lưới & ống góp, máy thổi, thông gió phòng máy, máy khuấy hoặc xung khí; sục khí bề mặt theo SAE hoặc Pöpel; A 226 với tải ôxy cố định.</li>
  <li><b>Bùn tuần hoàn</b>: bơm ly tâm / trục vít / khí nâng, tuần hoàn nội, bùn dư.</li></ol>
  <p>Sau đó: <b>Xử lý bùn</b> (nén, phân hủy kỵ khí + CHP, ổn định hiếu khí, bể chứa, tách nước, cân bằng bùn bể lắng), <b>Bổ sung</b> (thành phần, chi phí vận hành, biến động tải, đường ống, hiệu suất ôxy, phương án), <b>Bản vẽ</b> (bản vẽ đúng tỷ lệ, sơ đồ công nghệ, xuất DXF/SVG/PNG, khối lượng & đẩy nổi), <b>Kiểm tra</b> (công suất bể lắng hiện hữu), <b>Báo cáo</b> (thuyết minh, bản tính, tóm tắt, danh mục thiết bị → Word/Excel/XML).</p>
  <h3>Công nghệ nhà cung cấp</h3><p><b>ICEAS</b> (Xylem/Sanitaire): thiết kế theo SRT 10 bước – chu kỳ (f_hk) → SRT = max(nitrat hóa/f_hk; lắng; ổn định bùn) → bùn dư DWA ở SRT → khối bùn, F/M kiểm tra → thể tích lớp bùn (SVI), thể tích nạp, diện tích (MLSS tại BWL ≤ giới hạn) → khử nitrat (thiếu thì tăng Air-Off, tính lại SRT) → oxy ở bước Sục khí → decanter, bơm bùn → kiểm tra T_max, xả bùn theo mùa; chu trình NIT / NDN(P) / tự nhập. <b>C-Tech</b> (SFC): trình tự Basic Engineering Package – chu kỳ F/A–lắng–gạn, số bể nhận nước đồng thời, MLSS hạ theo SVI để đạt ΔH gạn, F/M theo MLVSS, selector & RAS, nhu cầu O₂ với tín dụng SND. Cả hai được đối chiếu DWA-A 131 (tuổi bùn hiếu khí, cân bằng N, bùn dư) và bước Sục khí dùng DWA-M 229-1. <b>Kubota MBR</b>: màng tấm phẳng ngập ES/EK (0,8 m²/tấm), RW (1,45 m²/tấm), SP (10 m²/module); thông lượng trung bình/đỉnh với chu kỳ lọc–nghỉ, bố trí bể màng, khí rửa, lọc trọng lực/xi-phông/bơm hút, CIP tại chỗ. Kích thước SMU và SAD trong ngân hàng thiết bị là giá trị tham khảo.</p>
  <h3>Cơ sở tính</h3><p>DWA-A 131 (2016) cơ sở COD; DWA Themen T4/2016 cho 5–30 °C; DWA-M 229-1 (2017) sục khí; DWA-M 210 & A 131 cho SBR; DWA-M 227 cho MBR; DWA-A 198 tải lượng; DWA-A 202 kết tủa P; DWA-M 368 ổn định bùn; báo cáo ATV về bể lắng cát; Metcalf & Eddy (5th) và MSIG cho tải lượng/lắng.</p>
  <h3>Lưu ý</h3><p>Phần mềm phục vụ nghiên cứu cá nhân / thiết kế sơ bộ. Mã nguồn được viết mới từ các tiêu chuẩn công khai, chỉ tham khảo quy trình làm việc của phần mềm thương mại; ngân hàng thiết bị là danh mục mẫu tự sinh. Kiểm tra lại kết quả trước khi dùng cho hồ sơ chính thức.</p></section>`;
  APP.openDoc('Trợ giúp', html);
};

/* ký hiệu & thuật ngữ (Handbook AQUA DESIGNER chương 16 – trích) */
APP.glossary = function () {
  const T = [
    ['A_NB', 'diện tích bể lắng II', 'm²'], ['B_d,BOD5 / B_d,COD', 'tải lượng BOD₅ / COD ngày', 'kg/d'], ['B_TS', 'tải trọng bùn', 'kg BOD₅/(kg TS·d)'], ['C_x', 'nồng độ O₂ vận hành', 'mg/l'],
    ['C_S,T', 'nồng độ O₂ bão hòa ở T', 'mg/l'], ['D_D (D_E)', 'đường kính công trình vào bể lắng', 'm'], ['f_A, f_A,max', 'tỷ lệ trao đổi thể tích SBR', '–'], ['f_C, f_N', 'hệ số đỉnh tải C / N', '–'],
    ['f_d', 'hệ số chiều sâu thổi khí 1 + h_D/20,7', '–'], ['FS', 'quãng đường dòng chảy bể lắng', 'm'], ['h₁ … h₄', 'vùng nước trong / tách / dòng mật độ & chứa / cô đặc', 'm'], ['h_D', 'chiều sâu thổi khí', 'm'],
    ['h_S', 'mực bùn (SBR)', 'm'], ['h_t / h_z', 'chiều cao phễu / phần trụ (bể phễu)', 'm'], ['ISV', 'chỉ số thể tích bùn (SVI)', 'ml/g'], ['LD', 'mật độ công suất sục khí bề mặt', 'W/m³'],
    ['n_R', 'tần suất mưa (tỷ lệ ngày mưa)', '–'], ['OB, OB_mittel', 'tải ôxy có / không hệ số đỉnh', 'kg O₂/h'], ['OC_A', 'khả năng cấp ôxy theo thể tích', 'g O₂/(m³·h)'], ['ON10', 'hiệu suất ôxy máy sục bề mặt', 'kg O₂/kWh'],
    ['OV_C, OV_d,C', 'nhu cầu ôxy khử C (riêng / ngày)', 'mg/l, kg/d'], ['OV_d,N / OV_d,D', 'nhu cầu ôxy nitrat hóa / ôxy thu hồi khử nitrat', 'kg O₂/d'], ['OV_h', 'nhu cầu ôxy giờ', 'kg O₂/h'], ['PF', 'hệ số quá trình (tuổi bùn hiếu khí)', '–'],
    ['P_n / G_a / t_d', 'số nhân sự / lương năm / giờ làm ngày', '– / tiền / h'], ['q_A', 'tải trọng bề mặt', 'm/h'], ['q_SV', 'tải trọng thể tích bùn', 'l/(m²·h)'], ['Q_M', 'lưu lượng thiết kế (mưa)', 'm³/h'],
    ['Q_mz', 'lưu lượng cho phép của bể lắng hiện hữu', 'm³/h'], ['Q_T,aM', 'lưu lượng mùa khô trung bình năm', 'm³/h'], ['RV', 'tỷ lệ bùn tuần hoàn', '–'], ['RZ', 'tỷ lệ tuần hoàn nội', '–'],
    ['S_NO3,D', 'NO₃-N cần khử', 'mg/l'], ['SOTR', 'khả năng cấp ôxy chuẩn (nước sạch, 20 °C)', 'kg O₂/h'], ['SSOTR', 'cấp ôxy chuẩn riêng theo chiều sâu', 'g O₂/(Nm³·m)'], ['t_E', 'thời gian cô đặc bùn ở bể lắng', 'h'],
    ['t_L, t_L,dim', 'thời gian chạy máy thổi / thời gian sục khí thiết kế', 'h/d'], ['t_TS, t_TS,aer', 'tuổi bùn / tuổi bùn hiếu khí', 'd'], ['t_Z', 'thời gian chu kỳ SBR', 'h'], ['TS_BB / TS_BS / TS_RS', 'nồng độ bùn aerotank / đáy bể lắng / bùn tuần hoàn', 'kg/m³'],
    ['ÜS_d', 'bùn dư ngày', 'kg TS/d'], ['V_D/V_BB', 'tỷ lệ thể tích khử nitrat', '–'], ['V_U', 'thể tích bể lắng dưới đáy aerotank (trạm kết hợp)', 'm³'], ['VSV', 'thể tích bùn so sánh TS·ISV', 'l/m³'],
    ['X_P,BioP / X_P,Fäll', 'P khử sinh học tăng cường / bằng kết tủa', 'mg/l'], ['α, β', 'hệ số truyền ôxy nước thải/nước sạch; hệ số muối', '–'], ['α_DB', 'số mũ tiền khử nitrat theo nhiệt độ', '–'],
  ];
  const html = '<section class="rep"><h2>Ký hiệu & thuật ngữ</h2><table class="grid"><thead><tr><th>Ký hiệu</th><th>Ý nghĩa</th><th>Đơn vị</th></tr></thead><tbody>' + T.map(r => '<tr><td><b>' + U.esc(r[0]) + '</b></td><td>' + U.esc(r[1]) + '</td><td>' + U.esc(r[2]) + '</td></tr>').join('') + '</tbody></table><p class="note">Theo ký hiệu DWA (A 131, M 229-1, M 210, M 227) và Handbook AQUA DESIGNER chương 16 (trích).</p></section>';
  APP.openDoc('Ký hiệu & thuật ngữ', html, [['In', () => REP.print('Ký hiệu & thuật ngữ', html)]]);
};

/* ---------- menu ---------- */
APP.buildMenu = function () {
  const S = APP.S, R = APP.R, done = ENG.complete(S), loadOk = !!S.done.load;
  const M = [
    ['Tệp', [
      ['Mới', () => { if (confirm('Tạo dự án mới? Dữ liệu chưa lưu sẽ mất.')) { APP.S = DEF.project(); APP.S.done = {}; APP.render(); } }],
      ['Mở…', () => $('#fileOpen').click()],
      ['Lưu (.adv)', () => U.download(APP.fname('.adv'), JSON.stringify(APP.S, null, 1), 'application/json')],
      ['Ngân hàng dự án…', () => APP.openProjects()],
      '-',
      ...Object.entries(APP.examples).map(([k, e]) => ['Ví dụ: ' + e.name, () => { const s = U.fill(e.make(), DEF.project()); APP.markAllDone(s); APP.S = s; APP.render(); APP.toast('Đã nạp ví dụ.'); }]),
    ]],
    ['Lựa chọn', [
      ['Dây chuyền: bùn hoạt tính liên tục', () => APP.setLine('CAS')],
      ['Dây chuyền: SBR', () => APP.setLine('SBR')],
      ['Dây chuyền: ICEAS (Xylem/Sanitaire)', () => APP.setLine('ICEAS')],
      ['Dây chuyền: C-Tech (SFC)', () => APP.setLine('CTECH')],
      ['Dây chuyền: MBR', () => APP.setLine('MBR')],
      ['Dây chuyền: MBR Kubota', () => { APP.S.mbr.vendor = 'kubota'; if (APP.S.opt.line !== 'MBR') APP.setLine('MBR'); else { delete APP.S.done.mbr; APP.render(); } }],
      '-',
      ['Bể lắng cát & tách mỡ…', () => APP.openForm('grit'), !loadOk],
    ]],
    ['Báo cáo', [
      ['Thuyết minh', () => APP.openReport('desc'), !done],
      ['Bản tính', () => APP.openReport('dim'), !loadOk],
      ['Bản tính bể lắng cát', () => APP.openReport('grit'), !R.grit],
      ['Kiểm tra theo MSIG (Malaysia)', () => APP.openReport('msig'), !R.msig],
      ['Đối chiếu thuật toán HSG', () => APP.openReport('hsg'), !R.hsg],
      ['Tóm tắt (1 trang)', () => APP.openReport('short'), !loadOk],
      ['Kết quả từng bước', () => APP.openReport('single'), !loadOk],
      '-',
      ['Danh mục thiết bị & điểm đo (Excel / XML)', () => APP.openReport('mach'), !done],
      ['Danh mục máy & điểm đo – mã đặt hàng M-/MES- (Excel)', () => APP.openReport('machAD'), !done],
    ]],
    ['Xử lý bùn', [
      ['Nén / phân hủy / ổn định / bể chứa / tách nước…', () => APP.openForm('sludge'), !R.bio],
      ['Kết quả xử lý bùn & cân bằng bùn', () => APP.openReport('sludge'), !R.sludge],
    ]],
    ['Bổ sung', [
      ['Thành phần công trình & điểm đo…', () => APP.openForm('comp')],
      ['Chi phí vận hành…', () => APP.openForm('cost'), !R.bio],
      ['Biến động tải (sục khí)', () => APP.openLoadCases(), !R.aer],
      ['Đường ống…', () => APP.openForm('pipes'), !loadOk],
      ['Hiệu suất ôxy', () => APP.openReport('o2'), !R.o2],
      ['Bể điều hòa SBR', () => APP.openForm('sbr'), S.opt.line !== 'SBR'],
      '-',
      ['So sánh phương án…', () => APP.openVariants(), !loadOk],
    ]],
    ['Bản vẽ', [
      ['Bản vẽ đúng tỷ lệ…', () => APP.openDrawings(), !R.load],
      ['Sơ đồ công nghệ', () => APP.openDrawings('flow'), !R.load],
      ['Sơ đồ dây chuyền bùn', () => APP.openDrawings('flowS'), !R.sludge],
      ['Khối lượng & đẩy nổi…', () => APP.openForm('build'), !(R.tank || R.sbr || R.iceas || R.ctech)],
    ]],
    ['Kiểm tra', [
      ['Bể lắng II hiện hữu…', () => APP.openForm('verify')],
    ]],
    ['Tùy chọn', [
      ['Quy trình…', () => APP.openForm('process')],
      ['Hằng số…', () => APP.openForm('consts')],
      ['Cài đặt báo cáo & chi phí…', () => APP.openForm('settings')],
      ['Ngân hàng dự án…', () => APP.openProjects()],
      ['Ngân hàng thiết bị…', () => APP.openDB()],
      '-',
      ['Tự sửa cảnh báo / lỗi…', () => APP.autoFix(APP.S, APP.commitFix), !R.load],
      ['Hoàn tác sửa (' + APP.undo.length + ')', () => APP.undoFix(), !APP.undo.length],
      '-',
      ['Xóa dữ liệu lưu tạm trình duyệt', () => { if (confirm('Xóa dự án lưu tạm và ngân hàng thiết bị đã sửa?')) { localStorage.removeItem('adv_project'); localStorage.removeItem('adv_db'); location.reload(); } }],
    ]],
    ['Trợ giúp', [
      ['Hướng dẫn & cơ sở tính', () => APP.help()],
      ['Ký hiệu & thuật ngữ', () => APP.glossary()],
      ['Kiểm thử engine', () => window.open('test_engine.html', '_blank')],
    ]],
  ];
  const nav = $('#menubar');
  nav.innerHTML = M.map((m, i) => `<div class="menu" data-m="${i}"><button>${m[0]}</button><div class="dd">${m[1].map((it, j) => it === '-' ? '<hr>' : `<button data-j="${j}"${it[2] ? ' disabled' : ''}>${U.esc(it[0])}</button>`).join('')}</div></div>`).join('');
  nav.querySelectorAll('.menu').forEach(el => {
    const m = M[+el.dataset.m];
    el.querySelector(':scope > button').addEventListener('click', e => { e.stopPropagation(); const was = el.classList.contains('open'); nav.querySelectorAll('.menu').forEach(x => x.classList.remove('open')); if (!was) el.classList.add('open'); });
    el.querySelector(':scope > button').addEventListener('mouseenter', () => { if (nav.querySelector('.menu.open') && !el.classList.contains('open')) { nav.querySelectorAll('.menu').forEach(x => x.classList.remove('open')); el.classList.add('open'); } });
    el.querySelectorAll('.dd button').forEach(b => b.addEventListener('click', () => { el.classList.remove('open'); m[1][+b.dataset.j][1](); }));
  });
};

APP.setLine = function (line) {
  if (APP.S.opt.line === line) return;
  APP.S.opt.line = line;
  APP.S.done = { load: !!APP.S.done.load };
  APP.render();
};

/* ---------- khởi động ---------- */
document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open')));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').classList.contains('on')) APP.closeModal(); });
$('#fileOpen').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try { APP.S = U.fill(JSON.parse(rd.result), DEF.project()); APP.render(); APP.toast('Đã mở ' + f.name); } catch (er) { alert('Không đọc được tệp: ' + er.message); } };
  rd.readAsText(f); e.target.value = '';
});
document.querySelectorAll('#lineSeg button').forEach(b => b.addEventListener('click', () => APP.setLine(b.dataset.line)));
$('#btnTheme').addEventListener('click', () => {
  const r = document.documentElement, cur = r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  r.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('adv_theme', r.dataset.theme); } catch (e) { /* bỏ qua */ }
});
try { const t = localStorage.getItem('adv_theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* bỏ qua */ }
DB.load();
APP.S = APP.loadStored() || (() => { const s = DEF.project(); s.done = {}; return s; })();
APP.render();
