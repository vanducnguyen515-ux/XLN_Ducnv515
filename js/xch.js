'use strict';
/* ==========================================================================
   BỘ PHẦN MỀM XLNT – HỒ SƠ TRAO ĐỔI DỮ LIỆU (dùng chung cho mọi phần mềm của bộ)
     thietke : Thiết kế trạm XLNT (M&E 5th · QCVN · ICEAS/C-Tech/Kubota)
     aqua    : AquaDesign VN (DWA-A 131)
     iceas   : ICEAS Design Studio (ICEAS / SBR / C-Tech – trình tự Xylem/ABJ, máy khuấy, cấp khí)
     nereda  : NEREDA® – bùn hạt hiếu khí AGS (định cỡ bể SBR nạp-xả đồng thời)
     sim     : SimXLNT (mô phỏng động ASM)
     aer     : Aeration Design – hệ thống cấp khí (AOR/SOR, đĩa, ống, máy thổi)
     bun     : Thiết kế xử lý bùn (M&E 5th Ch.13 – 14)
     khi     : KhíSạch Studio – khí thải & khử mùi (M&E 5th Ch.16)
     xlnuoc  : XLNuoc – thiết kế trạm xử lý nước cấp (bảng tính 21 sheet kiểu Leopold / dây chuyền tổng quát)
     nuoc    : SimNước – mô phỏng nước cấp (nhận bản tính XLNuoc qua trường xlsx)
   Hồ sơ là một đối tượng JSON trung lập (schema 'xlnt-xch'), không phụ thuộc cấu trúc
   nội bộ của phần mềm nào. Mỗi phần mềm có bộ chuyển đổi riêng: tạo hồ sơ từ dự án của mình
   (XCH.init → build) và nhận hồ sơ (receive) – khi nhận luôn hiện bảng "giá trị hiện tại → giá trị mới"
   để người dùng chọn thông số áp dụng (không ghi đè ngầm).
   Truyền: trong khung bộ phần mềm (suite.html) qua postMessage, tự chuyển sang tab đích;
   chạy riêng lẻ: tải tệp *.xlnt.json rồi mở bằng "Nhận từ tệp…" ở phần mềm kia
   (cùng nguồn gốc trình duyệt thì có thêm "Nhận hồ sơ gửi gần nhất").

   Cấu trúc hồ sơ (mọi trường đều tùy chọn trừ schema/ver/from):
   { schema:'xlnt-xch', ver:1, from, to, time, project:{name, code, location},
     tech: 'ICEAS'|'CTECH'|'SBR'|'CAS'|'AO'|'AAO'|'OD'|'MBR'|'KMBR'|'MBBR'|'ORG'|'BIOP'|'AGS',
     flow:{Q m³/d, kmax, kmin, Qpk m³/h}, temp:{Tmin, Tmax, Tdes °C},
     inf:{COD,BOD,TSS,TKN,NH4,NO3,TP,Alk mgCaCO₃/L,pH, VSSr}   – nước thải thô (đầu bài)
     bioIn:{…cùng khóa}                                           – nước vào cụm sinh học (sau tiền xử lý, gồm nước tách bùn)
     lim:{COD,BOD,TSS,NH4,NO3,TN,TP}, limName                     – giới hạn xả
     des:{ DO, SVI, SRT d (tuổi bùn TỔNG = khối bùn hệ / bùn rời hệ), SRTaer d (tuổi bùn hiếu khí), MLSS mg/L, TSSe mg/L, H m, N bể, Vkk, Vtk, Vhk, Vtot, Vmem m³, Am m², SADm,
           R, IR (× Q), PXTSS kg/d, XR, W, L, Hmax, Hmin, tAer,tMix,tS,tD (phút – bể chu kỳ ICEAS),
           sbr:{tF,tR,tS,tD,tI h, VF}, ct:{TFA,TS,TD h, R}, fPre, SVIdes },
     air:{alpha, F, SOTE, subm, eBlow, dPloss, Qair m³/h},
     chem:{Al kg/d, Fe kg/d, NaOH kg/d (bổ sung kiềm sinh học), Cext kgCOD/d (carbon ngoài),
           PACpre/PACpost, polyPre/polyPost mg/L (hóa lý trước/bậc 3), NaOHpre/NaOHpost kg/d (chỉnh pH hóa lý), Cl2 mg/L, tCl phút, UVd mJ/cm²},
     des.Veq m³, des.Heq m – bể điều hòa,
     kin:{muH, bH, YH, muA, bA, KNH (20 °C)},
     res:{ eff:{…}, SRT (tổng), SRTaer, MLSS, PX kgTSS/d, OTR kgO₂/d, air m³/d, kWh kWh/d, note },  – kết quả của bên gửi
     xlsx: base64 bản tính Excel (Thiết kế XLNT → SimXLNT dùng bộ nhập bản tính đầy đủ),
     sludge:{streams:[{name, kind: prim|bio|chem|ana|gran, M kg DS/d, C % DS, fVS}], thick, dew} – dòng bùn cho phần mềm Xử lý bùn,
     extra.aer:{AORmin/avg/pk kgO₂/d, Qmin/Qavg/Qpk Sm³/h toàn trạm, tech, blower, nDuty, nStby, kWavg, kWhY, sote %} – Aeration Design,
     extra.khi:{Qodor m³/h, H2S ppmv, kWhY, ngY m³/năm, tCO2e/năm} – KhíSạch Studio,
     extra:{…} }
   ========================================================================== */
const XCH = (() => {
  const SCHEMA = 'xlnt-xch', VER = 1, LSK = 'xlnt_xch_last';
  const APPS = {
    thietke: { name: 'Thiết kế XLNT', long: 'Thiết kế XLNT (M&E 5th · QCVN)', icon: '📐' },
    aqua: { name: 'AquaDesign VN', long: 'AquaDesign VN (DWA-A 131)', icon: '🧮' },
    iceas: { name: 'ICEAS Studio', long: 'ICEAS Design Studio (ICEAS / SBR / C-Tech)', icon: '🔁' },
    nereda: { name: 'NEREDA® AGS', long: 'NEREDA® – bùn hạt hiếu khí (AGS)', icon: '🟤' },
    sim: { name: 'SimXLNT', long: 'SimXLNT (mô phỏng động)', icon: '📈' },
    aer: { name: 'Cấp khí', long: 'Aeration Design – hệ thống cấp khí', icon: '💨' },
    bun: { name: 'Xử lý bùn', long: 'Thiết kế xử lý bùn (M&E 5th Ch.13 – 14)', icon: '🟫' },
    khi: { name: 'KhíSạch', long: 'KhíSạch Studio – khí thải & khử mùi (M&E Ch.16)', icon: '🌫' },
    xlnuoc: { name: 'XLNuoc', long: 'XLNuoc – thiết kế trạm xử lý nước cấp (MWH · TCXDVN 33 · Leopold)', icon: '💧' },
    nuoc: { name: 'SimNước', long: 'SimNước – mô phỏng nước cấp (nhận bản tính XLNuoc)', icon: '🚰' }
  };
  const TECH = {
    ICEAS: 'ICEAS (Xylem)', CTECH: 'C-Tech (SFC)', SBR: 'SBR', CAS: 'Bùn hoạt tính truyền thống', AO: 'AO (MLE)', AAO: 'A²O',
    OD: 'Mương oxy hóa', MBR: 'AO-MBR', KMBR: 'MBR Kubota', MBBR: 'AO-MBBR', ORG: 'Organica FCR', BIOP: 'Biopolus MNR', AGS: 'NEREDA® – bùn hạt hiếu khí (AGS)'
  };
  const QK = [['COD', 'COD', 'mg/L'], ['BOD', 'BOD₅', 'mg/L'], ['TSS', 'TSS', 'mg/L'], ['TKN', 'TKN', 'mgN/L'], ['NH4', 'NH₄-N', 'mgN/L'],
    ['NO3', 'NO₃-N', 'mgN/L'], ['TN', 'Tổng N', 'mgN/L'], ['TP', 'Tổng P', 'mgP/L'], ['Alk', 'Độ kiềm', 'mgCaCO₃/L'], ['pH', 'pH', '-']];
  let me = null, opts = null, suite = false, suiteApps = null, pending = [];

  const num = v => v != null && v !== '' && isFinite(+v);
  const fmt = v => {
    if (!num(v)) return v == null || v === '' ? '–' : String(v);
    const a = Math.abs(+v), d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4;
    return (+v).toLocaleString('vi-VN', { maximumFractionDigits: d });
  };
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // bỏ các trường rỗng/NaN để hồ sơ gọn
  function clean(o) {
    if (Array.isArray(o)) return o.map(clean);
    if (!o || typeof o !== 'object') return o;
    const r = {};
    for (const [k, v] of Object.entries(o)) {
      if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) continue;
      const c = clean(v);
      if (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length) continue;
      r[k] = c;
    }
    return r;
  }
  function make(from, part) { return clean(Object.assign({ schema: SCHEMA, ver: VER, appVer: typeof XLNT_VERSION !== 'undefined' ? XLNT_VERSION : undefined, from, time: new Date().toISOString() }, part || {})); }
  function valid(r) { return r && r.schema === SCHEMA && r.from && APPS[r.from]; }

  /* ---------- base64 cho ArrayBuffer (bản tính xlsx) ---------- */
  function b64(buf) {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }

  /* ---------- truyền ---------- */
  function toast(t) {
    if (opts && opts.toast) { opts.toast(t); return; }
    let el = document.getElementById('xchToast');
    if (!el) { el = document.createElement('div'); el.id = 'xchToast'; el.className = 'xch-toast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 3200);
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const fileName = r => ((r.project && (r.project.code || r.project.name)) || 'XLNT').replace(/[^\w\-]+/g, '_').slice(0, 40) + '_' + r.from + (r.to ? '_den_' + r.to : '') + '.xlnt.json';
  // alt: { build(to), label } – nguồn hồ sơ khác nguồn mặc định (vd. tab Kiểm tra vận hành của Thiết kế XLNT)
  async function send(to, alt) {
    const bf = (alt && alt.build) || (opts && opts.build);
    if (!bf) return;
    let r;
    try { r = await bf(to); } catch (e) { alert('Không tạo được hồ sơ trao đổi: ' + e.message); console.error(e); return; }
    if (!r) return;
    r.to = to || undefined;
    try { localStorage.setItem(LSK, JSON.stringify(r)); } catch (e) { /* quá lớn hoặc bị chặn – bỏ qua */ }
    if (suite && to) { window.parent.postMessage({ xch: 'send', to, rec: r }, '*'); return; }
    download(fileName(r), JSON.stringify(r, null, 1));
    toast(to ? `Đã tải hồ sơ trao đổi – mở ${APPS[to].name}, chọn "⇄ Trao đổi → Nhận từ tệp…"` : 'Đã tải hồ sơ trao đổi (.xlnt.json)');
  }
  function receive(r) {
    if (!valid(r)) { alert('Tệp không phải hồ sơ trao đổi của bộ phần mềm XLNT.'); return; }
    if (!opts || !opts.receive) { pending.push(r); return; }
    try { opts.receive(r); } catch (e) { alert('Lỗi khi nhận hồ sơ: ' + e.message); console.error(e); }
  }
  function openFile() {
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json,.xlnt';
    fi.onchange = () => {
      const f = fi.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try { receive(JSON.parse(rd.result)); } catch (e) { alert('Không đọc được tệp: ' + e.message); } };
      rd.readAsText(f);
    };
    fi.click();
  }
  function lastStored() { try { const t = localStorage.getItem(LSK); return t ? JSON.parse(t) : null; } catch (e) { return null; } }

  window.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || !d.xch) return;
    if (d.xch === 'suite') { suite = true; suiteApps = d.apps || null; document.documentElement.classList.add('in-suite'); }
    else if (d.xch === 'recv' && d.rec) receive(d.rec);
    else if (d.xch === 'pull') pull(d.kind, d.state).then(x => ev.source.postMessage(Object.assign({ xch: 'pulled', id: d.id, app: me }, x), '*'));
  });
  /* khung bộ phần mềm hỏi dữ liệu (không mở hộp thoại): kind 'rec' – hồ sơ trao đổi của trạng thái hiện tại (bảng so sánh, dự toán, báo cáo tổng hợp);
     'state' – toàn bộ trạng thái phần mềm (hồ sơ dự án chung); 'setstate' – nạp lại trạng thái */
  async function pull(kind, state) {
    try {
      if (kind === 'rec') { const r = opts && opts.build ? await opts.build() : null; if (r) delete r.xlsx; return { rec: r }; }
      const st = opts && opts.store && typeof STATE !== 'undefined';
      if (kind === 'state') return opts && opts.getState ? { state: await opts.getState() } : st ? { state: await STATE.get() } : { err: 'không hỗ trợ' };
      if (kind === 'setstate') {
        if (opts && opts.setState) await opts.setState(state); else if (st) STATE.set(state); else return { err: 'không hỗ trợ' };
        return { ok: true };
      }
    } catch (e) { console.error(e); return { err: e.message }; }
    return { err: 'kind?' };
  }

  /* ---------- nút & menu "⇄ Trao đổi" ---------- */
  function css() {
    if (document.getElementById('xchCss')) return;
    const s = document.createElement('style'); s.id = 'xchCss';
    s.textContent = `
.xch-btn{display:inline-flex;align-items:center;gap:4px;cursor:pointer;font:600 13px system-ui,sans-serif;padding:6px 11px;border-radius:6px;border:1px solid #0e7490;background:#0891b2;color:#fff;white-space:nowrap}
.xch-btn:hover{background:#0e7490}
.xch-menu{position:fixed;z-index:10001;background:#fff;color:#111;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:6px;min-width:290px;font:13px system-ui,sans-serif}
.xch-menu button{display:block;width:100%;text-align:left;border:0;background:none;padding:8px 10px;border-radius:6px;cursor:pointer;font:inherit;color:inherit}
.xch-menu button:hover{background:#ecfeff}
.xch-menu .sep{border-top:1px solid #e2e8f0;margin:5px 0}
.xch-menu .hd{font-size:11px;color:#64748b;padding:4px 10px;text-transform:uppercase;letter-spacing:.04em}
.xch-ov{position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}
.xch-dlg{background:#fff;color:#111;border-radius:10px;max-width:980px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3);font:13px system-ui,sans-serif}
.xch-dlg h2{margin:0;padding:14px 18px;font-size:17px;border-bottom:1px solid #e2e8f0;background:#f0f9ff;border-radius:10px 10px 0 0}
.xch-dlg .bd{padding:12px 18px;max-height:68vh;overflow:auto}
.xch-dlg .ft{padding:10px 18px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
.xch-dlg table{border-collapse:collapse;width:100%}
.xch-dlg th,.xch-dlg td{border-bottom:1px solid #eef2f7;padding:4px 6px;text-align:right;vertical-align:top}
.xch-dlg th{background:#f8fafc;position:sticky;top:0;font-weight:600}
.xch-dlg td.l,.xch-dlg th.l{text-align:left}
.xch-dlg tr.g td{background:#f1f5f9;font-weight:600;text-align:left}
.xch-dlg tr.same td{color:#94a3b8}
.xch-dlg .chg{color:#0369a1;font-weight:600}
.xch-dlg .note{color:#64748b;font-size:12px}
.xch-dlg button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}
.xch-dlg button.pri{background:#0891b2;border-color:#0e7490;color:#fff;font-weight:600}
.xch-dlg .msg{padding:8px 10px;border-radius:6px;background:#fffbeb;border:1px solid #fde68a;margin:6px 0}
.xch-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:9px 16px;border-radius:8px;font:13px system-ui,sans-serif;opacity:0;transition:opacity .2s;z-index:10002;pointer-events:none;max-width:90vw}
.xch-toast.on{opacity:1}`;
    document.head.appendChild(s);
  }
  function menu(anchor, alt) {
    css();
    const old = document.querySelector('.xch-menu'); if (old) { old.remove(); return; }
    const m = document.createElement('div'); m.className = 'xch-menu';
    const others = Object.keys(APPS).filter(k => k !== me);
    let h = `<div class="hd">${esc((alt && alt.label) || 'Gửi dự án hiện tại sang')}</div>`;
    for (const k of others) h += `<button data-to="${k}">${APPS[k].icon} ${esc(APPS[k].long)}${suite ? '' : ' <span style="color:#64748b">(tải tệp)</span>'}</button>`;
    h += `<button data-to="">💾 Lưu hồ sơ trao đổi (.xlnt.json)</button><div class="sep"></div><div class="hd">Nhận</div><button data-act="file">📂 Nhận từ tệp hồ sơ…</button>`;
    const last = lastStored();
    if (last && last.from !== me) h += `<button data-act="last">↩ Nhận hồ sơ gửi gần nhất – từ ${esc(APPS[last.from] ? APPS[last.from].name : last.from)}, ${new Date(last.time).toLocaleString('vi-VN')}</button>`;
    m.innerHTML = h;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + 'px';
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
    const close = () => { m.remove(); document.removeEventListener('mousedown', out, true); };
    const out = e => { if (!m.contains(e.target) && e.target !== anchor) close(); };
    setTimeout(() => document.addEventListener('mousedown', out, true));
    m.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      close();
      if (b.dataset.act === 'file') openFile();
      else if (b.dataset.act === 'last') receive(lastStored());
      else send(b.dataset.to || null, alt);
    };
  }
  function button(container, before) {
    css();
    const b = document.createElement('button');
    b.className = 'xch-btn'; b.type = 'button'; b.id = 'xchBtn';
    b.title = 'Trao đổi dữ liệu với các phần mềm khác trong bộ XLNT (' + Object.values(APPS).map(a => a.name).join(' · ') + ')';
    b.dataset.nobi = '1';
    const lbl = () => { b.innerHTML = '<span class="ic">⇄</span><span class="tx"> ' + (typeof BI !== 'undefined' && BI.mode === 'en' ? 'Exchange' : 'Trao đổi') + '</span>'; };
    lbl(); if (typeof BI !== 'undefined' && BI.onMode) BI.onMode(lbl);
    b.onclick = () => menu(b);
    if (before && before.parentNode === container) container.insertBefore(b, before); else container.appendChild(b);
    return b;
  }

  /* ---------- hộp thoại xem trước & chọn thông số áp dụng ----------
     items: [{grp, l, u, cur, nv, on, note, set(v), fmt}] – nv: giá trị mới; set(nv) được gọi khi áp dụng.
     opt: {title, intro (html), info (html cuối), applyLabel, onApply(chosen), onCancel} */
  function review(o) {
    css();
    const items = o.items.filter(it => it.nv !== undefined && it.nv !== null && !(typeof it.nv === 'number' && !isFinite(it.nv)));
    items.forEach((it, i) => {
      it._i = i;
      const same = num(it.cur) && num(it.nv) ? Math.abs(+it.cur - +it.nv) <= 1e-9 * Math.max(1, Math.abs(+it.nv)) : String(it.cur) === String(it.nv);
      it._same = same;
      if (it.on === undefined) it.on = !same;
      if (same) it.on = false;
    });
    const ov = document.createElement('div'); ov.className = 'xch-ov';
    const grps = [...new Set(items.map(x => x.grp || ''))];
    let rows = '';
    for (const g of grps) {
      const its = items.filter(x => (x.grp || '') === g);
      rows += `<tr class="g"><td colspan="6"><label><input type="checkbox" data-g="${esc(g)}"> ${esc(g)}</label></td></tr>`;
      for (const it of its) {
        const f = it.fmt || fmt;
        rows += `<tr class="${it._same ? 'same' : ''}"><td class="l"><input type="checkbox" data-i="${it._i}"${it.on ? ' checked' : ''}${it._same ? ' disabled' : ''}></td><td class="l">${esc(it.l)}</td><td class="l note">${esc(it.u || '')}</td>
          <td>${esc(f(it.cur))}</td><td class="${it._same ? '' : 'chg'}">${esc(f(it.nv))}</td><td class="l note">${esc(it.note || '')}</td></tr>`;
      }
    }
    ov.innerHTML = `<div class="xch-dlg"><h2>${esc(o.title)}</h2><div class="bd">${o.intro || ''}
      ${items.length ? `<table><tr><th class="l"></th><th class="l">Thông số</th><th class="l">Đơn vị</th><th>Hiện tại</th><th>Giá trị nhận</th><th class="l">Ghi chú</th></tr>${rows}</table>` : '<p>Hồ sơ không có thông số nào áp dụng được cho phần mềm này.</p>'}
      ${o.info || ''}</div>
      <div class="ft"><span class="note" id="xchCnt" style="margin-right:auto"></span><button data-a="all">Chọn tất cả thay đổi</button><button data-a="none">Bỏ chọn</button><button data-a="cancel">Đóng</button><button class="pri" data-a="ok">${esc(o.applyLabel || 'Áp dụng thông số đã chọn')}</button></div></div>`;
    document.body.appendChild(ov);
    const cnt = () => { const n = items.filter(x => x.on).length; ov.querySelector('#xchCnt').textContent = `${n}/${items.filter(x => !x._same).length} thay đổi được chọn`; };
    const sync = () => { ov.querySelectorAll('input[data-g]').forEach(c => { const its = items.filter(x => (x.grp || '') === c.dataset.g && !x._same); c.checked = its.length > 0 && its.every(x => x.on); c.indeterminate = its.some(x => x.on) && !c.checked; }); cnt(); };
    ov.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.i !== undefined) items[+t.dataset.i].on = t.checked;
      if (t.dataset.g !== undefined) items.filter(x => (x.grp || '') === t.dataset.g && !x._same).forEach(x => { x.on = t.checked; ov.querySelector(`input[data-i="${x._i}"]`).checked = t.checked; });
      sync();
    });
    ov.addEventListener('click', e => {
      // nút song ngữ: chữ được bọc trong <span class="vi/en"> → lấy nút chứa data-a gần nhất
      const btn = e.target.closest && e.target.closest('[data-a]'), a = btn && btn.dataset.a; if (!a) return;
      if (a === 'all' || a === 'none') { items.forEach(x => { if (!x._same) { x.on = a === 'all'; ov.querySelector(`input[data-i="${x._i}"]`).checked = x.on; } }); sync(); }
      if (a === 'cancel') { ov.remove(); if (o.onCancel) o.onCancel(); }
      if (a === 'ok') {
        const ch = items.filter(x => x.on);
        for (const it of ch) { try { it.set(it.nv); } catch (er) { console.error(er); } }
        ov.remove();
        if (o.onApply) o.onApply(ch);
      }
    });
    sync();
    return ov;
  }
  /* bảng tham khảo (không áp dụng): kết quả bên gửi */
  function resTable(r, title) {
    if (!r || !r.res) return '';
    const R = r.res, rows = [];
    if (R.eff) for (const [k, l, u] of QK) if (num(R.eff[k])) rows.push([l + ' ra', u, R.eff[k], r.lim ? r.lim[k] : null]);
    const add = (l, u, v) => { if (num(v)) rows.push([l, u, v, null]); };
    add('Tuổi bùn SRT (tổng)', 'ngày', R.SRT); add('Tuổi bùn hiếu khí', 'ngày', R.SRTaer); add('MLSS', 'mg/L', R.MLSS); add('Bùn dư', 'kgTSS/ngày', R.PX); add('Nhu cầu O₂', 'kgO₂/ngày', R.OTR);
    add('Khí cấp', 'm³/ngày', R.air); add('Điện máy thổi', 'kWh/ngày', R.kWh); add('Thể tích sinh học', 'm³', R.Vbio);
    if (!rows.length) return '';
    return `<h3 style="margin:14px 0 6px">${esc(title || 'Kết quả của ' + (APPS[r.from] ? APPS[r.from].name : r.from) + ' (tham khảo)')}</h3>
      <table><tr><th class="l">Chỉ tiêu</th><th class="l">Đơn vị</th><th>Giá trị</th><th>Giới hạn</th></tr>${rows.map(x => `<tr><td class="l">${esc(x[0])}</td><td class="l note">${esc(x[1])}</td><td${num(x[3]) && +x[2] > +x[3] ? ' style="color:#b91c1c;font-weight:600"' : ''}>${fmt(x[2])}</td><td>${num(x[3]) ? fmt(x[3]) : ''}</td></tr>`).join('')}</table>${R.note ? `<p class="note">${esc(R.note)}</p>` : ''}`;
  }
  // hồ sơ lập bằng phiên bản khác phiên bản đang chạy → nhắc kiểm tra (khóa dữ liệu có thể đã đổi)
  function verNote(v) {
    const cur = typeof XLNT_VERSION !== 'undefined' ? XLNT_VERSION : null;
    if (!cur) return '';
    if (!v) return `<p class="note" style="color:#b45309">⚠ Hồ sơ không ghi phiên bản (lập trước bản 6.00) – phiên bản hiện tại v${cur}; kiểm tra kỹ các giá trị nhận.</p>`;
    if (v === cur) return '';
    return `<p class="note" style="color:#b45309">⚠ Hồ sơ lập bằng phiên bản v${esc(v)}, phiên bản đang chạy v${cur}${+v > +cur ? ' (cũ hơn hồ sơ – nên cập nhật phần mềm)' : ''}; kiểm tra kỹ các giá trị nhận.</p>`;
  }
  function header(r) {
    const a = APPS[r.from] || { name: r.from };
    return `<p>Hồ sơ từ <b>${esc(a.long || a.name)}</b>${r.project && r.project.name ? ' – dự án <b>' + esc(r.project.name) + '</b>' : ''}${r.tech ? ', công nghệ <b>' + esc(TECH[r.tech] || r.tech) + '</b>' : ''}, lập lúc ${new Date(r.time).toLocaleString('vi-VN')}.</p>` + verNote(r.appVer);
  }

  /* ---------- khởi tạo trong mỗi phần mềm ---------- */
  function init(app, o) {
    me = app; opts = o || {};
    css();
    if (opts.store && typeof STATE !== 'undefined') STATE.init(app, opts.store);   // hoàn tác/làm lại + hồ sơ dự án chung (js/appstate.js)
    if (window.parent !== window) window.parent.postMessage({ xch: 'hello', app }, '*');
    const p = pending; pending = [];
    p.forEach(receive);
  }

  return { SCHEMA, VER, APPS, TECH, QK, init, make, pull, verNote, clean, send, receive, openFile, menu, button, review, resTable, header, b64, unb64, fmt, esc, num, toast,
    get me() { return me; }, get inSuite() { return suite; } };
})();
