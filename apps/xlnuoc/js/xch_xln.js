'use strict';
/* ==========================================================================
   XLNuoc ⇄ hồ sơ trao đổi (../../js/xch.js)
   Gửi: công suất, nhiệt độ, dây chuyền, kết quả chính (CAPEX, OPEX, điện), dòng bùn hóa lý (PAC + cặn) cho Xử lý bùn,
        và bản tính Excel (base64, trường xlsx) khi gửi sang SimNước – SimNước nhập vào tab "Bản tính" để dựng sơ đồ mô phỏng.
   Nhận: tên dự án, công suất (luôn hiện bảng "hiện tại → nhận" để chọn, không ghi đè ngầm).
   ========================================================================== */
(() => {
  const num = XCH.num;
  async function build(to) {
    const A = XLNAPP, S = A.S, M = A.M, G = A.G;
    if (!M || M.err) throw new Error('Chưa tính được bảng tính XLNuoc.');
    const tpl = M.kind === 'tpl', c = A.checks();
    const DS = G('sl_DS'), rDS = tpl ? M.book.get('01_DauVao', 'D204') : G('rDS'), C1 = tpl ? M.book.get('01_DauVao', 'D146') : G('sl_C1');
    const dew = tpl || S.chain.sl === 'centri' ? 'centrifuge' : S.chain.sl === 'belt' ? 'belt' : 'beds';
    const r = XCH.make('xlnuoc', {
      project: { name: S.P.name, alt: M.chainTxt },
      flow: { Q: S.P.Q, kmax: S.P.Kh, Qpk: G('Qmax2') }, temp: { Tdes: S.P.q.T, Tmin: S.P.q.T },
      sludge: { streams: num(DS) ? [{ name: 'Bùn nhà máy nước (PAC + cặn) – trung bình năm', kind: 'chem', M: +(DS * (num(rDS) ? rDS : 0.4)).toFixed(1), C: num(C1) ? C1 : 1.5, fVS: 0.25 }] : [], thick: 'gravity', dew },
      res: { kWh: G('op_E'), PX: DS, note: `${M.chainTxt}. ${G('th_end')}. TMĐT ${(+G('cp_TM')).toFixed(1)} tỷ đ; giá thành ${Math.round(G('op_full'))} đ/m³; điện ${(+G('op_sE')).toFixed(3)} kWh/m³.` },
      extra: { xlnuoc: { chain: S.chain, template: tpl, capex: G('cp_TM'), sCapex: G('cp_s'), opex: G('op_u'), full: G('op_full'), kWhm3: G('op_sE'), DS, cake: G('sl_cake'), checksOK: c.filter(x => x.ok).length, checks: c.length,
        Vstore: G('ds_V'), nFilter: G('f_N'), Afilter: G('f_At'), q: S.P.q } }
    });
    if (to === 'nuoc' || !to) r.xlsx = await A.xlsxB64();
    return r;
  }
  function receive(rec) {
    const S = XLNAPP.S, items = [], set = {};
    const it = (grp, l, u, cur, nv, fn, x) => { if (nv !== undefined && nv !== null && (typeof nv !== 'number' || isFinite(nv))) items.push(Object.assign({ grp, l, u, cur, nv, set: fn }, x || {})); };
    const own = rec.from === 'xlnuoc';
    if (rec.project && rec.project.name) it('Dự án', 'Tên dự án', '', S.P.name, rec.project.name, v => { set.name = v; }, { fmt: v => v, on: own });
    if (rec.flow && num(rec.flow.Q)) it('Dự án', own ? 'Công suất hữu ích' : 'Lưu lượng của phần mềm gửi (nước thải – chỉ tham khảo)', 'm³/ngđ', S.P.Q, +rec.flow.Q, v => { set.Q = v; }, { on: own });
    if (own && rec.extra && rec.extra.xlnuoc && rec.extra.xlnuoc.q) it('Dự án', 'Chất lượng nước nguồn (14 chỉ tiêu)', '', '–', 'theo hồ sơ', () => { set.q = Object.assign({}, S.P.q, rec.extra.xlnuoc.q); }, { fmt: v => v, on: true });
    XCH.review({
      title: '⇄ Nhận hồ sơ từ ' + XCH.APPS[rec.from].long, items,
      intro: XCH.header(rec) + (own ? '' : '<div class="msg">XLNuoc thiết kế trạm xử lý nước cấp – hồ sơ của phần mềm nước thải chỉ dùng tham khảo tên dự án.</div>'),
      info: XCH.resTable(rec),
      onApply: ch => { if (!ch.length) return; XLNAPP.apply(set); XLNAPP.toast('Đã nhận ' + ch.length + ' mục từ ' + XCH.APPS[rec.from].name); }
    });
  }
  const acts = document.querySelector('#acts');
  if (acts) {
    XCH.button(acts, acts.firstChild);
    if (typeof STATE !== 'undefined' && STATE.projectMenu) STATE.projectMenu(acts, document.querySelector('#btnXlsx'), [document.querySelector('#btnNew')], '');
  }
  XCH.init('xlnuoc', { store: { keys: /^xlnt_xlnuoc_v1$/, apply: () => XLNAPP.reload(), name: () => XLNAPP.S && XLNAPP.S.P.name }, build, receive, toast: t => XLNAPP.toast(t) });
})();
