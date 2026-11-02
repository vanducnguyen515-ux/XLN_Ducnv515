'use strict';
/* ==========================================================================
   Thiết kế xử lý bùn ⇄ hồ sơ trao đổi (../../js/xch.js)
   Nhận: sludge.streams (Thiết kế XLNT, NEREDA, SimXLNT) hoặc bùn dư res.PX / des.PXTSS (AquaDesign…),
         lưu lượng, nhiệt độ, TKN nước thải (đánh giá tải N của nước tách).
   Gửi: lưu lượng, nhiệt độ, kết quả xử lý bùn và nước tách quay về (extra.bun) – tham khảo cho các phần mềm khác.
   ========================================================================== */
(() => {
  const num = XCH.num;
  function streamsOf(rec) {
    const sl = rec.sludge || {};
    if (Array.isArray(sl.streams) && sl.streams.length) return sl.streams.filter(x => num(x.M) && +x.M > 0).map(x => ({ name: x.name || 'Bùn', kind: BUN.KIND[x.kind] ? x.kind : 'bio', M: +(+x.M).toFixed(1), C: num(x.C) && +x.C > 0 ? +(+x.C).toFixed(3) : BUN.KIND[x.kind] ? BUN.KIND[x.kind].C : 0.8, fVS: num(x.fVS) && +x.fVS > 0 ? +(+x.fVS).toFixed(3) : 0.75 }));
    const PX = rec.res && num(rec.res.PX) ? +rec.res.PX : rec.des && num(rec.des.PXTSS) ? +rec.des.PXTSS : null;
    if (!(PX > 0)) return [];
    const xn = rec.extra && rec.extra.nereda, ags = rec.tech === 'AGS';
    return [{ name: ags ? 'Bùn dư bùn hạt (AGS)' : 'Bùn sinh học dư', kind: ags ? 'gran' : 'bio', M: +PX.toFixed(1), C: xn && num(xn.WASc) ? +xn.WASc / 10 : ags ? 1.2 : 0.8, fVS: 0.75 }];
  }
  function receive(rec) {
    const S = BUNAPP.S, items = [], set = {};
    const it = (grp, l, u, cur, nv, fn, x) => { if (nv !== undefined && nv !== null && (typeof nv !== 'number' || isFinite(nv))) items.push(Object.assign({ grp, l, u, cur, nv, set: fn }, x || {})); };
    const g1 = 'Đầu bài';
    if (rec.flow && num(rec.flow.Q)) it(g1, 'Lưu lượng nước thải trạm', 'm³/ngđ', S.Q, +rec.flow.Q, v => { set.Q = v; });
    const I = rec.inf || rec.bioIn || {};
    if (num(I.TKN)) it(g1, 'TKN nước thải vào', 'mg/L', S.TKN, +I.TKN, v => { set.TKN = v; });
    if (rec.temp) { const t = num(rec.temp.Tmin) ? rec.temp.Tmin : rec.temp.Tdes; if (num(t)) it(g1, 'Nhiệt độ bùn (= nhiệt độ nước thải thấp nhất)', '°C', S.T, +t, v => { set.T = v; }); }
    const st = streamsOf(rec), g2 = 'Dòng bùn (thay toàn bộ danh sách khi chọn)';
    let pick = null;
    st.forEach((x, i) => it(g2, `${x.name} – ${BUN.KIND[x.kind].vi}`, 'kg DS/ngđ · % DS', i < S.streams.length ? `${(+S.streams[i].M).toFixed(0)} · ${S.streams[i].C}` : '–', `${x.M.toFixed(0)} · ${x.C}`, () => { pick = st; }, { fmt: v => v }));
    const sl = rec.sludge || {};
    if (sl.thick || sl.dew || sl.stab || sl.dry) {
      const nm = (T, k) => k && T[k] ? T[k].vi : (k || '–');
      it('Công nghệ của bên gửi', 'Cô đặc / ổn định / khử nước / làm khô', '', `${nm(BUN.THICK, S.thick)} / ${nm(BUN.STAB, S.stab)} / ${nm(BUN.DEW, S.dew)} / ${nm(BUN.DRY, S.dry)}`,
        `${nm(BUN.THICK, sl.thick || S.thick)} / ${nm(BUN.STAB, sl.stab || S.stab)} / ${nm(BUN.DEW, sl.dew || S.dew)} / ${nm(BUN.DRY, sl.dry || S.dry)}`,
        () => { if (sl.thick && BUN.THICK[sl.thick]) set.thick = sl.thick; if (sl.stab && BUN.STAB[sl.stab]) set.stab = sl.stab; if (sl.dew && BUN.DEW[sl.dew]) set.dew = sl.dew; if (sl.dry && BUN.DRY[sl.dry]) set.dry = sl.dry;
          if (+sl.stabSRT > 0 && (sl.stab === 'mad' || sl.stab === 'tad')) set.ad_SRT = +sl.stabSRT; },
        { fmt: v => v, on: !!(sl.stab && sl.stab !== 'none'), note: 'Chọn để dùng đúng dây chuyền bùn của phương án thiết kế' });
    }
    XCH.review({
      title: '⇄ Nhận hồ sơ từ ' + XCH.APPS[rec.from].long, items,
      intro: XCH.header(rec) + `<div class="msg">${st.length ? 'Các dòng bùn của bên gửi sẽ thay danh sách dòng bùn hiện tại, rồi tính lại dây chuyền xử lý bùn.' : 'Hồ sơ không có dòng bùn – chỉ nhận đầu bài.'}</div>`,
      info: XCH.resTable(rec),
      onApply: ch => {
        if (!ch.length) return;
        if (pick) set.streams = pick;
        set.src = XCH.APPS[rec.from].name + (rec.project && rec.project.name ? ' – ' + rec.project.name : '') + (rec.project && rec.project.alt ? ' (' + rec.project.alt + ')' : '');
        BUNAPP.apply(set);
        BUNAPP.toast('Đã nhận ' + ch.length + ' mục từ ' + XCH.APPS[rec.from].name);
      }
    });
  }
  function build() {
    const S = BUNAPP.S, r = BUNAPP.last;
    if (!r || !r.ok) throw new Error('Chưa tính được dây chuyền xử lý bùn.');
    return XCH.make('bun', {
      project: { name: 'Xử lý bùn – ' + (S.src || 'nhập tay') },
      flow: { Q: S.Q }, temp: { Tmin: S.T },
      sludge: { streams: S.streams, thick: S.thick, stab: S.stab, dew: S.dew, dry: S.dry,
        // thông số dây chuyền cho SimXLNT dựng sơ đồ bùn (nén → ổn định → tách nước → sấy)
        line: Object.fromEntries((r.steps || []).map(x => [x.key, { V: x.V, C: x.Cout, Q: x.Qout, M: x.Mout }])), T: (BUN.STAB[S.stab] || {}).T, adSRT: S.ad_SRT, thCap: S.th_cap, dwCap: S.dw_cap },
      res: { note: `Bánh bùn ${r.final.t.toFixed(2)} t/ngđ (${r.final.DS} % DS); nước tách ${r.recTot.Q.toFixed(0)} m³/ngđ, NH₄-N ${r.recTot.NH4.toFixed(0)} kg/ngđ` },
      extra: { bun: { cake_t: r.final.t, cakeDS: r.final.DS, rejectQ: r.recTot.Q, rejectTSS: r.recTot.TSS, rejectNH4: r.recTot.NH4, biogas: r.gas ? r.gas.Vg : 0, kWhd: r.kWhd } }
    });
  }
  const acts = document.querySelector('#acts');
  if (acts) XCH.button(acts, acts.firstChild);
  XCH.init('bun', { store: { keys: /^xlnt_bun_v1$/ }, build, receive, toast: t => BUNAPP.toast(t) });
})();
