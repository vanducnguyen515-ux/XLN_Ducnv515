'use strict';
/* ==========================================================================
   KhíSạch Studio (khí thải & khử mùi – M&E 5th Ch.16) ⇄ hồ sơ trao đổi của Bộ phần mềm XLNT (../../js/xch.js)
   Nhận: tên dự án, lưu lượng nước thải (châm hóa chất pha lỏng, kiểm kê KNK), TN nước ra (N₂O nguồn tiếp nhận),
         khí cấp nhỏ nhất của bể sục khí (khuếch tán khí mùi vào bể – từ Aeration Design), điện năng của bên gửi
         và biogas sử dụng (Xử lý bùn) cho kiểm kê khí nhà kính.
   Gửi: lưu lượng khí mùi, H₂S/NH₃ hỗn hợp, tải H₂S đưa vào bể sục khí (Aeration Design cộng nhu cầu O₂),
        điện & khí đốt của hệ khử mùi, phát thải KNK (extra.khi).
   Dùng các biến toàn cục của KhíSạch: S (số liệu), MOD, vals(), save(), show(), toast().
   ========================================================================== */
(() => {
  const num = XCH.num;
  const pf = s => { const x = parseFloat(String(s).replace(/\./g, '').replace(',', '.')); return isFinite(x) ? x : undefined; };   // số định dạng vi-VN → số
  const v = (m, k) => vals(MOD[m])[k];
  const setv = (m, k, x) => { S.v[m] = S.v[m] || {}; S.v[m][k] = x; };

  function receive(rec) {
    const items = [], ch = [];
    const it = (grp, l, u, cur, nv, fn, x) => { if (nv !== undefined && nv !== null && (typeof nv !== 'number' || isFinite(nv))) items.push(Object.assign({ grp, l, u, cur, nv, set: y => ch.push(() => fn(y)) }, x || {})); };
    const g0 = 'Dự án', g1 = 'Châm hóa chất pha lỏng', g2 = 'Khuếch tán khí mùi vào bể sục khí', g3 = 'Kiểm kê khí nhà kính';
    if (rec.project && rec.project.name) it(g0, 'Tên dự án', '', S.name, rec.project.name, y => { S.name = y; const e = document.querySelector('#projName'); if (e) e.value = y; }, { fmt: y => y });
    const Q = rec.flow && num(rec.flow.Q) ? Math.round(+rec.flow.Q) : undefined;
    if (num(Q)) {
      it(g1, 'Lưu lượng nước thải', 'm³/ngày', v('liq', 'Q'), Q, y => setv('liq', 'Q', y));
      it(g3, 'Lưu lượng trung bình', 'm³/ngày', v('ghg', 'Q'), Q, y => setv('ghg', 'Q', y));
    }
    const E = (rec.res && rec.res.eff) || {}, TN = num(E.TN) ? E.TN : rec.lim && rec.lim.TN;
    if (num(TN)) it(g3, 'TN sau xử lý', 'mg/L', v('ghg', 'TNe'), +(+TN).toFixed(2), y => setv('ghg', 'TNe', y), { note: num(E.TN) ? 'kết quả bên gửi' : 'giới hạn xả' });
    const xa = rec.extra && rec.extra.aer, Qa = xa && num(xa.Qmin) ? xa.Qmin : rec.air && num(rec.air.Qair) ? rec.air.Qair * 0.6 : undefined;
    if (num(Qa)) it(g2, 'Lưu lượng khí cấp bể sục khí (min)', 'm³/h', v('asd', 'Qp'), Math.round(Qa), y => setv('asd', 'Qp', y), { note: xa && num(xa.Qmin) ? 'khí nhỏ nhất toàn trạm (Aeration Design)' : 'ước tính 0,6 × khí TB' });
    const kWhY = xa && num(xa.kWhY) ? xa.kWhY : rec.res && num(rec.res.kWh) ? rec.res.kWh * 365 : undefined;
    if (num(kWhY)) it(g3, 'Điện mua', 'kWh/năm', v('ghg', 'el'), Math.round(kWhY), y => setv('ghg', 'el', y),
      { on: false, note: (xa ? 'điện hệ cấp khí' : 'điện bên gửi tính') + ' – chỉ một phần điện của trạm; mặc định không thay' });
    const xb = rec.extra && rec.extra.bun;
    if (xb && num(xb.biogas) && xb.biogas > 0) it(g3, 'Biogas sử dụng', 'm³/năm', v('ghg', 'dgU'), Math.round(xb.biogas * 365), y => setv('ghg', 'dgU', y), { note: `${XCH.fmt(xb.biogas)} m³/ngày từ bể phân hủy` });
    // khí phát sinh theo công đoạn: đầu bài trạm, công nghệ, khí cấp, bùn, dây chuyền bùn
    const g4 = 'Khí phát sinh theo công đoạn', gv = k => v('gen', k), sg = k => y => setv('gen', k, y);
    const W = rec.inf && Object.keys(rec.inf).length ? rec.inf : rec.bioIn || {}, Fl = rec.flow || {}, Tp = rec.temp || {}, D = rec.des || {}, Rr = rec.res || {};
    const TECHMAP = { ICEAS: 'ICEAS', CTECH: 'ICEAS', SBR: 'ICEAS', AGS: 'AGS', CAS: 'CAS', AO: 'AO', AAO: 'AAO', OD: 'OD', MBR: 'MBR', KMBR: 'MBR', MBBR: 'MBBR', ORG: 'AO', BIOP: 'AO' };
    const nm = (o, k) => (o[k] || k), sel = o => ({ fmt: y => nm(o, y) });
    if (num(Fl.Q)) it(g4, 'Lưu lượng trung bình', 'm³/ngày', gv('Q'), Math.round(+Fl.Q), sg('Q'));
    if (num(Fl.kmax)) it(g4, 'Hệ số lưu lượng giờ lớn nhất', '×', gv('kmax'), +(+Fl.kmax).toFixed(2), sg('kmax'));
    const Tw = num(Tp.Tmax) ? +Tp.Tmax : num(Tp.Tdes) ? +Tp.Tdes : undefined;
    if (num(Tw)) it(g4, 'Nhiệt độ nước thải', '°C', gv('T'), Tw, sg('T'), { note: num(Tp.Tmax) ? 'nhiệt độ cao nhất – H₂S bay hơi mạnh nhất' : '' });
    for (const [k, l, u] of [['pH', 'pH', '–'], ['BOD', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['TKN', 'TKN', 'mg/L'], ['NH4', 'NH₄-N', 'mg/L']])
      if (num(W[k])) it(g4, l, u, gv(k), +(+W[k]).toFixed(2), sg(k), { note: W === rec.inf ? 'nước thải thô' : 'nước vào cụm sinh học' });
    if (rec.tech && TECHMAP[rec.tech]) it(g4, 'Công nghệ sinh học', '', gv('tech'), TECHMAP[rec.tech], sg('tech'), Object.assign(sel(Object.fromEntries(Object.entries(GEN_TECH).map(([k, x]) => [k, x[0]]))), { note: XCH.TECH[rec.tech] || rec.tech }));
    const Hd = num(D.Hmax) ? +D.Hmax : num(D.H) ? +D.H : undefined;
    if (num(Hd)) it(g4, 'Chiều sâu nước bể sinh học', 'm', gv('H'), +Hd.toFixed(2), sg('H'));
    const xa2 = rec.extra && rec.extra.aer;
    const Qa2 = xa2 && num(xa2.Qavg) ? xa2.Qavg : rec.air && num(rec.air.Qair) ? rec.air.Qair : num(Rr.air) ? Rr.air / 24 : undefined;
    if (num(Qa2)) it(g4, 'Khí cấp bể sục khí', 'Nm³/h', gv('Qair'), Math.round(Qa2), sg('Qair'), { note: xa2 ? 'khí TB (Aeration Design)' : 'kết quả bên gửi' });
    const st = (rec.sludge && rec.sludge.streams) || [], bio = st.filter(s => s.kind === 'bio' || s.kind === 'gran').reduce((a, s) => a + (+s.M || 0), 0);
    const PX = num(Rr.PX) ? +Rr.PX : num(D.PXTSS) ? +D.PXTSS : bio > 0 ? bio : undefined;
    if (num(PX)) it(g4, 'Bùn dư sinh học', 'kgTSS/ngày', gv('PX'), Math.round(PX), sg('PX'));
    if (st.length) it(g4, 'Bể lắng sơ cấp', '', gv('prim'), st.some(s => s.kind === 'prim') ? '1' : '0', sg('prim'), sel({ 1: 'Có', 0: 'Không' }));
    const sl = rec.sludge || {};
    if (sl.thick && GEN_THK[sl.thick]) it(g4, 'Cô đặc bùn', '', gv('thk'), sl.thick, sg('thk'), sel(GEN_THK));
    if (sl.stab && GEN_STB[sl.stab]) it(g4, 'Ổn định bùn', '', gv('dig'), sl.stab, sg('dig'), sel(GEN_STB));
    if (sl.dew && GEN_DEW[sl.dew]) it(g4, 'Khử nước bùn', '', gv('dew'), sl.dew, sg('dew'), sel(GEN_DEW));
    XCH.review({
      title: '⇄ Nhận hồ sơ từ ' + XCH.APPS[rec.from].long, items,
      intro: XCH.header(rec) + '<div class="msg">Các giá trị được chọn ghi vào module tương ứng; mở module để xem kết quả tính lại.</div>',
      info: XCH.resTable(rec),
      onApply: sel => { if (!sel.length) return; ch.forEach(f => f()); save(); show(S.act); toast('Đã nhận ' + sel.length + ' mục từ ' + XCH.APPS[rec.from].name + ' · Received ' + sel.length + ' items'); }
    });
  }

  function build() {
    const c = (m) => { try { return MOD[m].calc(vals(MOD[m])) || {}; } catch (e) { return {}; } };
    let kWhY = 0, ngY = 0;
    for (const m of ['scr', 'gac', 'bio', 'thr']) { const o = c(m).out || {}; kWhY += o.kWh || 0; ngY += o.ng || 0; }
    const vent = typeof ventCalc === 'function' ? ventCalc() : null;
    const asd = vals(MOD.asd), H2Skg = asd.Q * ppm2mg(asd.H2S, 34.08, 25) * 24 / 1e6;
    const gk = c('ghg').kpi || [], s1 = gk[0] ? pf(gk[0][1]) : undefined, s2 = gk[1] ? pf(gk[1][1]) : undefined;
    return XCH.make('khi', {
      project: { name: S.name || 'KhíSạch Studio' },
      flow: { Q: v('ghg', 'Q') },
      res: { kWh: kWhY / 365, note: `Khí mùi ${vent ? XCH.fmt(vent.Qd) : '–'} m³/h (H₂S ${vent ? XCH.fmt(vent.H2S) : '–'} ppmv); hệ khử mùi ${XCH.fmt(kWhY / 1000)} MWh/năm; KNK ${num(s1) && num(s2) ? XCH.fmt(s1 + s2) : '–'} t CO₂e/năm` },
      extra: { khi: { Qodor: vent ? vent.Qd : undefined, H2S: vent ? vent.H2S : undefined, NH3: vent ? vent.NH3 : undefined, buffer: vent ? vent.buf : undefined,
        asdQ: asd.Q, asdH2S: asd.H2S, H2Skg, kWhY, ngY, tCO2e: num(s1) && num(s2) ? s1 + s2 : undefined, scope1: s1, scope2: s2 } }
    });
  }

  const top = document.querySelector('header.top');
  XCH.button(top, document.querySelector('#btnReset'));
  if (typeof STATE !== 'undefined') { const rs = document.querySelector('#btnReset'); STATE.projectMenu(top, rs, [rs], 'btn'); }   // 📁 Dự án ▾: khôi phục ví dụ · mở · lưu
  XCH.init('khi', { store: { keys: /^khisach-studio-v1$/, name: () => S.name }, build, receive, toast: t => toast(t) });
  if (typeof BIP !== 'undefined') BIP.boot({ en: '.en,.h2en', switchIn: top });
})();
