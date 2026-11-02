/* =====================================================================
   ENGINE TÍNH TOÁN CÔNG NGHỆ TRẠM XLNT
   Metcalf & Eddy 5th Ed. (2014) — Ch.3, 5, 6, 7, 8, 9, 11, 12, 13, 14
   Bể ICEAS: Sanitaire ICEAS 202 Detailed Design (như bảng tính mẫu, sheet IC_)
   Mỗi dòng tính mang công thức Excel dạng mẫu: [id] = ô cùng hạng mục, [unit.id] = ô hạng mục khác,
   [@TÊN] = ô tổng của bảng phụ (thiết bị, hóa chất, điện, nhân công, vật tư). Khi xuất Excel các mẫu
   được thay bằng địa chỉ ô → công thức sống.
   ===================================================================== */
'use strict';

const ENG = (() => {
  const PI = Math.PI;
  const ceilTo = (x, s) => Math.ceil(x / s - 1e-9) * s;
  const roundTo = (x, s) => Math.round(x / s) * s;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pickUp = (x, list) => list.find(v => v >= x - 1e-9) || list[list.length - 1];
  const QK = ['COD', 'BOD', 'TSS', 'TN', 'TKN', 'NH4', 'NO3', 'TP', 'OG', 'Color', 'Alk', 'Coli'];
  const DNS = [100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500, 2800, 3000];
  const autoId = s => String(s || '').replace(/[^A-Za-z0-9_]/g, '');
  /* Cân bằng NO₃ của bể mẻ (M&E 5th mục 8-6 SBR, 8-7 khử nitrat): NO₃ chỉ được khử khi tiếp xúc với bùn.
     Q·NOx·(1 − η_SND) = Q·C_e + D_trộn + min(D_nội bào; C_e·V_bùn,ngày) + min(Q_sel·C_e; D_sel)   [kg/ngđ; C mg/L]
     D_trộn: pha không sục khí có khuấy (cả bể tiếp xúc, carbon nước vào trong pha); D_nội bào: pha lắng + gạn, chỉ NO₃ trong lớp bùn
     (thể tích lớp bùn × số chu kỳ × số bể = V_bùn,ngày), tốc độ phân hủy nội bào; selector: NO₃ theo dòng bùn tuần hoàn, giới hạn bởi rbCOD.
     Lớp nước trong phía trên lớp bùn bị gạn ra với nồng độ C_e. Giải C_e bằng chia đôi (hàm đơn điệu). */
  const batchNO3 = ({ Q, NOx, snd = 0, dMix = 0, dEnd = 0, Vbld = 0, Qsel = 0, dSel = 0 }) => {
    const NOa = Math.max(0, NOx) * (1 - snd), load = Q * NOa / 1000, mix = Math.min(dMix, load);
    const f = c => Q * c / 1000 + mix + Math.min(dEnd, c * Vbld / 1000) + Math.min(Qsel * c / 1000, dSel) - load;
    let Ce = 0;
    if (f(0) < 0) { let lo = 0, hi = NOa; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; } Ce = (lo + hi) / 2; }
    return { Ce, NOa, mix, end: Math.min(dEnd, Ce * Vbld / 1000), sel: Math.min(Qsel * Ce / 1000, dSel), snd: Q * Math.max(0, NOx) * snd / 1000 };
  };
  const TOK = /\[(@?[A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?\]/g;

  /* ---------------- Cấu trúc kết quả ---------------- */
  class Sec {
    constructor(R, u, t) { this.R = R; this.u = u; this.t = t; this.rows = []; }
    add(row, x, id) {
      if (x) row.xp = this.u.parseX(x);
      const key = id === undefined ? autoId(row.sym) : id;
      if (key) { row.id = key; this.u.ids[key] = row; }
      row.u = this.u;
      this.rows.push(row); return row;
    }
    i(sym, name, val, unit, f, src, id) { this.add({ sym, name, val, unit: unit || '', f: f || '', src: src || '', kind: 'in' }, null, id); return val; }
    o(sym, name, val, unit, f, src, x, id) { this.add({ sym, name, val, unit: unit || '', f: f || '', src: src || '', kind: 'res' }, x, id); return val; }
    t2(name, text, f, src) { this.rows.push({ sym: '', name, val: text, unit: '-', f: f || '', src: src || '', kind: 'txt' }); }
    /* kiểm tra: cond = biểu thức Excel logic (dạng mẫu) */
    chk(name, ok, okT, failT, src, soft, cond) {
      okT = okT || 'ĐẠT'; failT = failT || 'KHÔNG ĐẠT';
      const text = ok ? okT : failT;
      const row = { sym: '', name, val: text, unit: '-', f: '', src: src || '', kind: 'chk', ok };
      this.add(row, cond ? `IF(${cond},"${okT}","${failT}")` : null, '');
      if (!this.u.noCheck) this.R.checks.push({ unit: this.u.name, code: this.u.code, uid: this.u.id, name, ok, text, soft: !!soft });
      return ok;
    }
    note(text) { this.rows.push({ kind: 'note', val: text }); }
  }
  class Unit {
    constructor(R, id, code, name, grp) {
      Object.assign(this, { R, id, code, name, grp, secs: [], ids: {}, geom: null, V: 0, A: 0, n: 1, kW: 0, dims: '', hrt: '', hl: 0, H: 0 });
      R.units.push(this); R.um[id] = this;
    }
    sec(t) { const s = new Sec(this.R, this, t); this.secs.push(s); return s; }
    /* phân tích mẫu công thức → mảng [chuỗi | row | {sp}] */
    parseX(x) {
      const parts = []; let last = 0, m;
      TOK.lastIndex = 0;
      while ((m = TOK.exec(x))) {
        parts.push(x.slice(last, m.index)); last = TOK.lastIndex;
        let row = null;
        if (m[1][0] === '@') { parts.push({ sp: m[1].slice(1) }); continue; }
        if (m[2]) { const U = this.R.um[m[1]]; row = U && U.ids[m[2]]; }
        else row = this.ids[m[1]] || (this.R.um.info && this.R.um.info.ids[m[1]]) || (this.R.um.bal && this.R.um.bal.ids[m[1]]);
        if (!row) { this.R.xerr.push(`${this.id}: không tìm thấy ${m[0]} trong "${x}"`); parts.push('0'); }
        else parts.push(row);
      }
      parts.push(x.slice(last));
      return parts;
    }
  }

  /* ---------------- Tiêu chuẩn áp dụng ---------------- */
  function limits(S) {
    const st = DATA.STANDARDS[S.std.id] || DATA.STANDARDS.qcvn40_A;
    if (st.kind === 'q2025') {
      const Qd = +S.input.Q, tier = st.tiers.filter(x => Qd > x).length;
      const col = ['A', 'B', 'C'].includes(S.std.col) ? S.std.col : 'A', ci = 'ABC'.indexOf(col);
      const recv = S.std.recv === 'ho' ? 'ho' : 'song';
      const pick = a => (Array.isArray(a[0]) ? a[tier] : a)[ci];
      const L = {};
      for (const [key, a] of Object.entries(st.t)) L[key] = pick(a);
      const tpg = recv === 'ho' ? 'ho' : (st.TP.songTS && S.std.tpGroup === 'aqua' ? 'songTS' : 'song');
      L.TP = pick(st.TP[tpg]);
      const tierName = st.tierNames[tier];
      const tpName = recv === 'ho' ? 'nguồn tiếp nhận là hồ' : tpg === 'songTS' ? 'sông/biển – nhóm thủy sản, tinh bột sắn, cao su' : 'sông/biển';
      const short = st.name.split(' – ')[0];
      return { L, k: 1, kq: null, kf: null, name: `${short} – Cột ${col} (${tierName})`, full: st.name, pH: st.pH, note: st.note, kind: 'q2025', base: L, col, tier, tierName, recv, tpName };
    }
    let k = 1, kq = null, kf = null;
    if (st.kind === 'qcvn40') { kq = +S.std.Kq; kf = S.std.Kf === 'auto' ? DATA.kfOf(S.input.Q) : +S.std.Kf; k = kq * kf; }
    else if (st.kind === 'qcvn14') k = +S.std.K14;
    const v = st.kind === 'custom' ? S.std.custom : st.v;
    const L = {};
    for (const key of QK) {
      const x = v[key];
      if (x === undefined || x === null || x === '' || isNaN(+x)) continue;
      L[key] = (key === 'Color' || key === 'Coli' || st.kind === 'custom') ? +x : +x * k;
    }
    return { L, k, kq, kf, name: st.name, pH: st.pH, note: st.note, kind: st.kind, base: v };
  }

  /* ================================================================ */
  /* Quy tắc R08 – vòng ngoài: tính, đọc kết quả, hiệu chỉnh các thông số tự giải (SRT, MLSS CAS, hệ số hoàn lưu TSS) rồi tính lại.
     Các thông số bị hiệu chỉnh được truyền qua p.__ov = { khóa: giá trị gốc } để dòng tính ghi chú "tự điều chỉnh". */
  const SRT_KEY = { CAS: 'cas_SRT', AO: 'ao_SRT', AAO: 'aao_SRT', SBR: 'sbr_SRT', OD: 'od_SRT', MBR: 'mbr_SRT', ORG: 'org_SRT', BIOP: 'bp_SRT' };
  const CAS_REG = { cm: { name: 'khuấy trộn hoàn toàn (CMAS)', tau: [3, 6], mlss: [1500, 4000] }, ea: { name: 'sục khí kéo dài', tau: [20, 30], mlss: [2000, 5000] } };
  function run(S, alt) {
    // chế độ tự giải / tự hiệu chỉnh R08 chọn theo từng phương án (tab 3); dự án cũ chưa có → theo thông số chung p.autoFit
    if (alt && alt.c && alt.c.autoFit != null) S = Object.assign({}, S, { p: Object.assign({}, S.p, { autoFit: +alt.c.autoFit ? 1 : 0 }) });
    if (+S.p.autoFit === 0) return runOnce(S, alt);
    const bio = alt.c.bio, ov = {}, orig = {}, log = [];
    const MAN = k => !!(S.pMan && S.pMan[k]), keep = [];   // ô nhập tay: không tự điều chỉnh, ghi cảnh báo
    let rec = null, R = null, recN = null, recP = null;
    const val = (u, k) => R.um[u] && R.um[u].ids[k] ? +R.um[u].ids[k].val : NaN;
    for (let it = 0; it < 6; it++) {
      // hệ số tăng tải do nước tách bùn: TSS (khử nước), NH₄/TKN/TN và TP (nước tách bể phân hủy bùn)
      const effOv = () => {
        const e = Object.assign({}, S.eff);
        if (rec !== null) e.TSS = Object.assign({}, S.eff.TSS, { rec });
        if (recN !== null) for (const k of ['NH4', 'TKN', 'TN']) e[k] = Object.assign({}, S.eff[k], { rec: Math.max(S.eff[k].rec, recN) });
        if (recP !== null) e.TP = Object.assign({}, S.eff.TP, { rec: recP });
        return e;
      };
      const S2 = Object.keys(ov).length || rec !== null || recN !== null || recP !== null ? Object.assign({}, S, { p: Object.assign({}, S.p, ov, { __ov: orig }), eff: effOv() }) : S;
      R = runOnce(S2, alt);
      let chg = false;
      // (1) SRT hiếu khí ≥ SF·SRT_min (R01)
      const kS = SRT_KEY[bio], srtReq = val('bio', 'SRTreq'), srt = val('bio', 'SRT');
      if (kS && MAN(kS) && isFinite(srtReq) && srt < srtReq - 1e-9 && !keep.includes(kS)) keep.push(kS);
      if (kS && !MAN(kS) && !(bio === 'ORG' || bio === 'BIOP') && isFinite(srtReq) && srt < srtReq - 1e-9 && R.um.bio.ids.SRT.kind === 'in') {
        const to = Math.ceil(srtReq * 2 - 1e-9) / 2;
        if (!(kS in orig)) orig[kS] = S.p[kS];
        ov[kS] = to; chg = true;
      }
      // (2) CAS: chế độ theo SRT, MLSS trong dải để τ trong dải (M&E Bảng 8-19)
      if (bio === 'CAS' && !chg && !MAN('cas_MLSS')) {
        const tau = val('bio', 'taer'), srtN = val('bio', 'SRT'), X = val('bio', 'MLSS'), rg = CAS_REG[srtN > 15 ? 'ea' : 'cm'];
        if (isFinite(tau) && isFinite(X)) {
          let Xn = Math.min(rg.mlss[1], Math.max(rg.mlss[0], X));
          const t2 = tau * X / Xn;
          if (t2 > rg.tau[1]) Xn = Math.min(rg.mlss[1], Math.ceil(X * tau / rg.tau[1] / 50) * 50);
          else if (t2 < rg.tau[0]) Xn = Math.max(rg.mlss[0], Math.floor(X * tau / rg.tau[0] / 50) * 50);
          if (Math.abs(Xn - X) > 1e-6) { if (!('cas_MLSS' in orig)) orig.cas_MLSS = S.p.cas_MLSS; ov.cas_MLSS = Xn; chg = true; }
          // CMAS: MLSS đã ở cận trên mà τ vẫn > 6 h → giảm SRT (không thấp hơn SRT yêu cầu nitrat hóa, ≥ 3 ngày)
          else if (srtN <= 15 && tau > rg.tau[1] + 1e-9 && Xn >= rg.mlss[1] - 1e-6) {
            const to = Math.max(Math.ceil(srtReq * 2 - 1e-9) / 2, 3, Math.floor(srtN * rg.tau[1] / tau * 2) / 2);
            if (to < srtN - 1e-9 && !MAN('cas_SRT')) { if (!('cas_SRT' in orig)) orig.cas_SRT = S.p.cas_SRT; ov.cas_SRT = to; chg = true; }
          }
        }
      }
      // (3) hệ số tăng tải TSS do nước tách bùn ≥ giá trị tính
      const ratio = val('dw', 'ratio'), recNow = rec === null ? S.eff.TSS.rec : rec;
      if (isFinite(ratio) && recNow < ratio - 0.5) { if (MAN('eff.TSS.rec')) { if (!keep.includes('eff.TSS.rec')) keep.push('eff.TSS.rec'); } else { rec = Math.ceil(ratio); chg = true; } }
      // (4) NH₄, TP giải phóng ở bể phân hủy bùn quay về theo nước tách
      const rN = val('stab', 'ratioN'), rP = val('stab', 'ratioP');
      if (isFinite(rN) && (recN === null ? S.eff.NH4.rec : recN) < rN - 0.5 && !MAN('eff.NH4.rec')) { recN = Math.ceil(rN); chg = true; }
      if (isFinite(rP) && (recP === null ? S.eff.TP.rec : recP) < rP - 0.5 && !MAN('eff.TP.rec')) { recP = Math.ceil(rP); chg = true; }
      if (!chg) break;
    }
    for (const k of Object.keys(orig)) if (ov[k] !== orig[k]) {
      const nm = DATA.P[k] ? DATA.P[k][1] : k, un = DATA.P[k] ? DATA.P[k][2] : '';
      log.push({ code: 'SH', what: nm, from: orig[k], to: ov[k], unit: un, why: /SRT/.test(k) ? (ov[k] > orig[k] ? `SRT nhập < SRT yêu cầu nitrat hóa SF·SRT_min = ${fx(val('bio', 'SRTreq'))} ngày (quy tắc R01)` : `CMAS: MLSS đã ở cận trên 4 000 mg/L, giảm SRT (vẫn ≥ SRT yêu cầu ${fx(val('bio', 'SRTreq'))} ngày) để τ ≤ 6 h`) : `τ vào dải chế độ ${CAS_REG[val('bio', 'SRT') > 15 ? 'ea' : 'cm'].name} (M&E Bảng 8-19)` });
    }
    if (recN !== null && recN !== S.eff.NH4.rec) log.push({ code: 'ODB', what: 'Hệ số tăng tải NH₄, TKN, TN do nước tách bể phân hủy bùn', from: S.eff.NH4.rec, to: recN, unit: '%', why: 'NH₄ giải phóng khi phân hủy VS quay về đầu dây chuyền (M&E mục 14-7)' });
    if (recP !== null && recP !== S.eff.TP.rec) log.push({ code: 'ODB', what: 'Hệ số tăng tải TP do nước tách bể phân hủy bùn', from: S.eff.TP.rec, to: recP, unit: '%', why: 'PO₄ giải phóng khi phân hủy VS quay về đầu dây chuyền' });
    if (rec !== null && rec !== S.eff.TSS.rec) log.push({ code: 'EB', what: 'Hệ số tăng tải TSS do nước tách bùn (tab 4 – hiệu suất, cột hoàn lưu)', from: S.eff.TSS.rec, to: rec, unit: '%', why: 'Giả định phải ≥ tỷ lệ tăng tải TSS tính từ cụm khử nước bùn (M&E mục 14-7)' });
    R.auto = log.concat(R.auto);
    // giá trị nhập tay ngoài khuyến cáo của vòng R08: giữ nguyên, cảnh báo kèm giá trị phần mềm sẽ chọn
    for (const k of keep) {
      if (k === 'eff.TSS.rec') R.warns.push(`Hệ số tăng tải TSS do nước tách bùn nhập tay ${fx(S.eff.TSS.rec)} % < tỷ lệ tính được ${fx(val('dw', 'ratio'))} % – giữ giá trị nhập (R08 không tự chỉnh ô nhập tay).`);
      else R.warns.push(`${DATA.P[k] ? DATA.P[k][1] : k} nhập tay ${fx(S.p[k])} ngày < SRT yêu cầu nitrat hóa ${fx(val('bio', 'SRTreq'))} ngày (R01) – giữ giá trị nhập.`);
    }
    return R;
  }
  function runOnce(S, alt) {
    const p = S.p, c = alt.c, I = S.input, E = S.eff;
    const OP = S.opex || DATA.defaultOpex();
    const R = { S, alt, units: [], um: {}, checks: [], warns: [], chem: [], power: [], equip: [], info: [], xerr: [], special: {}, auto: [] };
    const warn = t => R.warns.push(t);
    /* Quy tắc R08: tự điều chỉnh đại lượng tự giải / tự định cỡ vào dải khuyến cáo – ghi lại mọi điều chỉnh */
    const AF = +p.autoFit !== 0;
    // ô người dùng đã nhập tay (tab 4): R08 không ghi đè – giữ giá trị nhập, chỉ cảnh báo khi ngoài dải khuyến cáo
    const MAN = k => !!(S.pMan && S.pMan[k]);
    const fit = (code, what, from, to, unit, why) => { R.auto.push({ code, what, from, to, unit, why }); };
    const bio = c.bio;
    const T = +I.Tmin;

    /* ---------- 0. Lưu lượng ---------- */
    const Q = +I.Q, nMod = Math.max(1, +I.nMod | 0);
    const Qh = Q / 24, Qmaxh = Qh * I.kmax, Qminh = Qh * I.kmin, Qmaxs = Qmaxh / 3600;
    const patm = 101.325 * Math.pow(1 - 0.0000225577 * I.z, 5.2559);
    R.flow = { Q, Qh, Qmaxh, Qminh, Qmaxs, nMod, T, patm };
    const lim = R.lim = limits(S);
    const L = lim.L;

    const u0 = new Unit(R, 'info', '00', 'Số liệu đầu vào & đặc trưng nước thải', 'info');
    {
      const s = u0.sec('1. Lưu lượng thiết kế');
      s.i('Q_tb', 'Lưu lượng trung bình ngày', Q, 'm³/ngđ', 'Đầu bài', '', 'Q');
      s.i('n', 'Số mô đun vận hành song song', nMod, 'mô đun', '', '', 'nMod');
      s.i('k_max', 'Hệ số không điều hòa lớn nhất', I.kmax, '-', '', 'M&E Ch.3 mục 3-4', 'kmax');
      s.i('k_min', 'Hệ số không điều hòa nhỏ nhất', I.kmin, '-', '', '', 'kmin');
      s.o('Q_h', 'Lưu lượng trung bình giờ', Qh, 'm³/h', 'Q_h = Q/24', '', '[Q]/24', 'Qh');
      s.o('Q_max,h', 'Lưu lượng lớn nhất giờ', Qmaxh, 'm³/h', 'Q_max,h = k_max·Q_h', 'M&E Ch.3', '[Qh]*[kmax]', 'Qmaxh');
      s.o('Q_min,h', 'Lưu lượng nhỏ nhất giờ', Qminh, 'm³/h', 'Q_min,h = k_min·Q_h', '', '[Qh]*[kmin]', 'Qminh');
      s.o('Q_max,s', 'Lưu lượng lớn nhất giây', Qmaxs, 'm³/s', 'Q_max,h/3600', '', '[Qmaxh]/3600', 'Qmaxs');
      s.i('T_min', 'Nhiệt độ nước thải thấp nhất (thiết kế sinh học)', T, '°C', 'Bất lợi cho nitrat hóa', 'M&E Bảng 8-14', 'T');
      s.i('T_max', 'Nhiệt độ nước thải cao nhất (cấp khí)', I.Tmax, '°C', '', '', 'Tmax');
      s.i('z', 'Cao độ khu vực', I.z, 'm', '', '', 'z');
      s.o('p_atm', 'Áp suất khí quyển tại cao độ z', patm, 'kPa', '101,325·(1 − 2,25577·10⁻⁵·z)^5,2559', 'M&E Ch.5', '101.325*(1-0.0000225577*[z])^5.2559', 'patm');
    }

    /* ---------- Cân bằng: hiệu suất & nước thô ---------- */
    const ub0 = new Unit(R, 'bal', 'CB', 'Cân bằng chất lượng nước qua từng công đoạn', 'info2');
    const q = I.q;
    const st1 = { COD: +q.COD, BOD: +q.BOD, TSS: +q.TSS, TN: +q.TN, TKN: +q.TKN, NH4: +q.NH4, NO3: Math.max(0, q.TN - q.TKN), TP: +q.TP, OG: +q.OG, Color: +q.Color, Alk: +q.Alk, Coli: +q.Coli };
    const qName = k => DATA.QPARAMS.find(x => x[0] === k);
    {
      const s = ub0.sec('0. Hiệu suất tách chất ô nhiễm giả định theo công đoạn (%)');
      for (const k of DATA.EFF_ROWS) for (const [cc, cn] of DATA.EFF_COLS) s.i(`η_${k}`, `${cn} – ${k}`, E[k][cc], '%', DATA.EFF_NOTE[cc].split(':')[0], cc === 'cept' ? 'M&E VD 6-1' : cc === 'hw' ? 'M&E mục 5-5' : '', `e_${k}_${cc}`);
      const s1 = ub0.sec('① Nước thải thô (đầu bài)');
      for (const k of QK) {
        const [, nm, un] = qName(k);
        if (k === 'NO3') s1.o('NO₃-N₁', nm, st1.NO3, un, 'NO₃ = TN − TKN', '', 'MAX(0,[TN1]-[TKN1])', 'NO31');
        else s1.i(k + '₁', nm, st1[k], un, 'Số liệu phân tích / ĐTM', 'Đầu bài', k + '1');
      }
    }
    const stageRows = (n, title, st, xf, srcF) => {
      const s = ub0.sec(title);
      for (const k of QK) { const [, nm, un] = qName(k); s.o(k + n, nm, st[k], un, srcF ? srcF(k) : '', '', xf(k), k + n); }
    };

    /* ---------- Đặc trưng nước thải ---------- */
    let ch;
    {
      const s = u0.sec('2. Đặc trưng nước thải phục vụ thiết kế sinh học — M&E Ch.8, Ví dụ 8-3');
      s.i('bCOD/BOD', 'Tỷ lệ bCOD/BOD₅', p.bcod_bod, 'g/g', 'M&E VD 8-3: 1,6 (sinh hoạt)', 'M&E VD 8-3', 'rBOD');
      s.i('sBOD/BOD', 'Tỷ lệ sBOD/BOD₅', p.sbod_bod, 'g/g', '', '', 'rsBOD');
      s.i('sCOD/COD', 'Tỷ lệ sCOD/COD', p.scod_cod, 'g/g', '', '', 'rsCOD');
      s.i('rbCOD/bCOD', 'Tỷ lệ rbCOD/bCOD nước thô', p.rb_b, 'g/g', '', 'M&E VD 8-3', 'rrb');
      s.i('VSS/TSS', 'Tỷ lệ VSS/TSS', p.vss_tss, 'g/g', '', '', 'rVSS');
      const bCOD = s.o('bCOD', 'COD phân hủy sinh học', p.bcod_bod * st1.BOD, 'mg/L', 'bCOD = (bCOD/BOD)·BOD', 'M&E VD 8-3 bước 1a', '[rBOD]*[bal.BOD1]', 'bCOD');
      const nbCOD = s.o('nbCOD', 'COD không phân hủy sinh học', st1.COD - bCOD, 'mg/L', 'nbCOD = COD − bCOD', 'PT (8-12)', '[bal.COD1]-[bCOD]', 'nbCOD');
      const sBOD = s.o('sBOD', 'BOD hòa tan', p.sbod_bod * st1.BOD, 'mg/L', '', '', '[rsBOD]*[bal.BOD1]', 'sBOD');
      const sCOD = s.o('sCOD', 'COD hòa tan', p.scod_cod * st1.COD, 'mg/L', '', '', '[rsCOD]*[bal.COD1]', 'sCOD');
      const sbCOD = s.o('sbCOD', 'bCOD hòa tan', p.bcod_bod * sBOD, 'mg/L', '', '', '[rBOD]*[sBOD]', 'sbCOD');
      const nbsCOD = s.o('nbsCOD', 'COD hòa tan không phân hủy (sàn của COD ra)', sCOD - sbCOD, 'mg/L', 'nbsCOD = sCOD − (bCOD/BOD)·sBOD', 'M&E VD 8-3 bước 1c', '[sCOD]-[sbCOD]', 'nbsCOD');
      const rbCOD = s.o('rbCOD', 'COD phân hủy nhanh', p.rb_b * bCOD, 'mg/L', '', '', '[rrb]*[bCOD]', 'rbCOD');
      const pCOD = s.o('pCOD', 'COD dạng hạt', st1.COD - sCOD, 'mg/L', '', '', '[bal.COD1]-[sCOD]', 'pCOD');
      const bpCOD = s.o('bpCOD', 'COD hạt phân hủy được', bCOD - sbCOD, 'mg/L', '', '', '[bCOD]-[sbCOD]', 'bpCOD');
      const bp_p = pCOD > 0 ? bpCOD / pCOD : 0.9;
      s.o('bpCOD/pCOD', 'Tỷ lệ bpCOD/pCOD', bp_p, '-', '', 'PT (8-7)…(8-9)', 'IF([pCOD]>0,[bpCOD]/[pCOD],0.9)', 'bpp');
      s.chk('Kiểm tra nbsCOD > 0 và nbCOD > 0', nbsCOD > 0 && nbCOD > 0, 'Nhất quán', 'Bộ tỷ lệ bCOD/BOD, sBOD/BOD, sCOD/COD không nhất quán', 'M&E VD 8-3', false, 'AND([nbsCOD]>0,[nbCOD]>0)');
      const s2 = u0.sec('3. Sàng lọc khả năng xử lý sinh học');
      const r1 = s2.o('BOD/COD', 'Khả năng phân hủy sinh học', st1.BOD / st1.COD, 'g/g', '> 0,5: dễ xử lý', 'M&E mục 8-2', '[bal.BOD1]/[bal.COD1]', 'r1');
      s2.chk('BOD/COD ≥ 0,5', r1 >= 0.5, 'Dễ xử lý sinh học', 'Cần xem xét tiền xử lý / hóa lý', '', true, '[r1]>=0.5');
      const r2 = s2.o('COD/TN', 'Carbon cho khử nitrat', st1.COD / st1.TN, 'g/g', '≥ 8 – 10 (thông lệ)', '', '[bal.COD1]/[bal.TN1]', 'r2');
      s2.chk('COD/TN ≥ 8', r2 >= 8, 'Đủ carbon', 'Nguy cơ thiếu carbon – xem khử nitrat', '', true, '[r2]>=8');
      const r3 = s2.o('BOD/TP', 'Khả năng khử P sinh học', st1.BOD / st1.TP, 'g/g', '≥ 30', 'M&E Bảng 8-30', '[bal.BOD1]/[bal.TP1]', 'r3');
      const r4 = s2.o('rbCOD/TP', '', rbCOD / st1.TP, 'g/g', '≥ 18', 'M&E Bảng 8-30', '[rbCOD]/[bal.TP1]', 'r4');
      s2.chk('Khả năng EBPR (BOD/TP ≥ 30; rbCOD/TP ≥ 18)', r3 >= 30 && r4 >= 18, 'EBPR khả thi', 'EBPR không đủ – cần khử P hóa học', '', true, 'AND([r3]>=30,[r4]>=18)');
      ch = { bCOD, nbCOD, sBOD, sCOD, nbsCOD, rbCOD, pCOD, bpCOD, bp_p };
    }
    R.char = ch;

    /* ---------- Kiểm tra logic & mức phù hợp của bộ số liệu đầu vào ---------- */
    {
      const ic = R.inChk = INF.check(S);
      const s = u0.sec(`3b. Kiểm tra logic & mức phù hợp số liệu đầu vào — đối chiếu: ${ic.T.name}${ic.sel === 'auto' ? ' (tự nhận dạng)' : ''}`);
      s.i('pH', 'pH nước thải đầu vào', +I.q.pH, '-', '', 'Đầu bài', 'pH');
      s.t2('Mức phù hợp với ' + ic.T.short, fx(ic.tScore, 0) + ' %', 'Tỷ lệ chỉ tiêu nằm trong khoảng thường gặp (có trọng số)', ic.T.src);
      s.t2('Xếp hạng mức phù hợp', ic.scores.slice(0, 4).map(x => `${x.name} ${fx(x.score, 0)} %`).join(' · '), '', '');
      const push = (it, row) => { R.checks.push({ unit: u0.name, code: u0.code, uid: u0.id, name: it.name, ok: it.st === 'ok', text: it.text, soft: it.st !== 'bad', inp: true, why: it.why, check: it.check }); return row; };
      for (const it of ic.items) {
        let ref;
        if (it.grp === 'data') { push(it, s.add({ sym: '', name: it.name, val: it.text, unit: '-', f: '', src: 'Đầu bài', kind: 'chk', ok: false }, null, '')); continue; }
        if (it.grp === 'range') ref = it.x;
        else { s.o(it.sym, it.name, it.val, it.unit, it.f || '', it.src, it.x, it.id); ref = '[' + it.id + ']'; }
        push(it, s.add({ sym: '', name: it.grp === 'range' ? it.name + ': ' + it.typ : 'Đánh giá – ' + it.range, val: it.text, unit: '-', f: '', src: it.grp === 'range' ? ic.T.short : '', kind: 'chk', ok: it.st === 'ok' }, INF.statusX(ref, it.bad, it.warn), ''));
        if (it.st !== 'ok') s.note(`${it.st === 'bad' ? '✖' : '⚠'} ${it.sym || it.name}: ${it.why}. Cần kiểm tra: ${it.check}.`);
      }
      ic.notes.forEach(t => s.note('• ' + t));
      if (ic.T.note) s.note('Lưu ý ngành: ' + ic.T.note);
    }

    /* ---------- Giới hạn ---------- */
    {
      const s = u0.sec('4. Yêu cầu chất lượng nước sau xử lý — ' + lim.name);
      if (lim.kq !== null) { s.i('K_q', 'Hệ số nguồn tiếp nhận', lim.kq, '-', '', 'QCVN 40:2011 mục 2.3', 'Kq'); s.i('K_f', 'Hệ số lưu lượng nguồn thải', lim.kf, '-', 'Q > 5000 → 0,9; 500 – 5000 → 1,0; 50 – 500 → 1,1; ≤ 50 → 1,2', 'QCVN 40:2011 mục 2.4', 'Kf'); }
      else if (lim.kind === 'qcvn14') s.i('K', 'Hệ số loại hình cơ sở', lim.k, '-', '', 'QCVN 14:2008 mục 2.3', 'K14');
      if (lim.kind === 'q2025') s.note(`${lim.full}: Cột ${lim.col}; bậc lưu lượng xả theo Q thiết kế ${fx(Q)} m³/ngđ → ${lim.tierName}; T-P theo ${lim.tpName}. ${lim.note}`);
      const kx = lim.kind === 'qcvn40' ? '*[Kq]*[Kf]' : lim.kind === 'qcvn14' ? '*[K14]' : '';
      for (const [key, nm, un] of DATA.QPARAMS) {
        if (L[key] === undefined) continue;
        if (lim.kind === 'custom') { s.i(key + '_gh', nm + ' tối đa cho phép', L[key], un, 'Nhập trực tiếp', lim.name, 'L_' + key); continue; }
        if (lim.kind === 'q2025') { s.i(key + '_gh', nm + ' tối đa cho phép', L[key], un, key === 'TP' ? `Cột ${lim.col}; ${lim.tpName}` : (lim.tier !== undefined && /BOD|COD|TSS/.test(key) || lim.full.includes('Bảng 1') ? `Cột ${lim.col}; ${lim.tierName}` : `Cột ${lim.col}`), lim.full, 'L_' + key); continue; }
        s.i('C_' + key, nm + ' – giá trị C theo cột quy chuẩn', +lim.base[key], un, '', lim.name, 'C_' + key);
        const nok = key === 'Color' || key === 'Coli';
        s.o(key + '_gh', nm + ' tối đa cho phép', L[key], un, nok ? 'C (không nhân hệ số)' : 'C × ' + (lim.kind === 'qcvn40' ? 'Kq × Kf' : 'K'), lim.name, `[C_${key}]` + (nok ? '' : kx), 'L_' + key);
      }
      s.t2('pH', lim.pH, '', lim.name);
    }

    /* ======================= TIỀN XỬ LÝ ======================= */
    {
      const u = new Unit(R, 'scr', 'SCR', 'Mương song chắn rác thô', 'nuoc');
      const s = u.sec('1. Song chắn rác thô ' + (c.screen === 'mech' ? 'cơ giới' : 'thủ công') + ' — M&E 5th mục 5-2, Bảng 5-4, PT (5-1)');
      s.o('Q_max,s', 'Lưu lượng tính toán', Qmaxs, 'm³/s', '', '', '[info.Qmaxs]', 'Q');
      const b = s.i('b', 'Khe hở giữa các thanh', p.bar_b, 'mm', c.screen === 'mech' ? 'Cơ giới: 15 – 75 mm' : 'Thủ công: 25 – 50 mm', 'M&E 5th Bảng 5-4', 'b');
      const sb = s.i('s', 'Bề dày thanh', p.bar_s, 'mm', '5 – 15 mm', 'M&E 5th Bảng 5-4', 's');
      const v = s.i('v_khe', 'Vận tốc qua khe ở Q_max', c.screen === 'mech' ? p.bar_v : Math.min(p.bar_v, 0.6), 'm/s', c.screen === 'mech' ? '0,6 – 1,0 m/s' : '0,3 – 0,6 m/s', 'M&E 5th Bảng 5-4', 'v');
      // R08: chọn h₁ (0,15 – 1,5 m) để v_mương = 0,4 – 0,9 m/s khi mương đạt bề rộng tối thiểu 0,3 m
      const geoS = hh => { const n = Math.ceil(Qmaxs / v / (b / 1000 * hh) - 1e-9), B = Math.max(0.3, n * b / 1000 + (n - 1) * sb / 1000); return Qmaxs / (B * hh); };
      let h1u = p.bar_h1;
      if (AF && MAN('bar_h1')) { const v0 = geoS(h1u); if (v0 < 0.4 || v0 > 0.9) warn(`Song chắn: h₁ nhập tay ${fx(h1u)} m cho vận tốc mương ${fx(v0)} m/s ngoài 0,4 – 0,9 m/s – giữ giá trị nhập (R08 không tự chỉnh ô nhập tay).`); }
      else if (AF) { const v0 = geoS(h1u); if (v0 < 0.4 || v0 > 0.9) { let best = null; for (let hh = 1.5; hh >= 0.25 - 1e-9; hh -= 0.05) { const vv = geoS(hh), d = vv < 0.4 ? 0.4 - vv : vv > 0.9 ? vv - 0.9 : 0; const sc = d * 10 + Math.abs(hh - p.bar_h1) * 0.01; if (!best || sc < best.sc) best = { hh: Math.round(hh * 100) / 100, sc }; } if (best && Math.abs(best.hh - h1u) > 1e-9) { fit('SCR', 'Chiều sâu nước trước song chắn h₁', h1u, best.hh, 'm', `v_mương ${fx(v0)} m/s ngoài 0,4 – 0,9 m/s → v = ${fx(geoS(best.hh))} m/s`); h1u = best.hh; } } }
      const h1 = s.i('h₁', 'Chiều sâu nước trước song chắn', h1u, 'm', h1u !== p.bar_h1 ? `Tự điều chỉnh từ ${fx(p.bar_h1)} m để v_mương trong 0,4 – 0,9 m/s` : '', h1u !== p.bar_h1 ? 'Quy tắc R08' : '', 'h1');
      const Ak = s.o('A_khe', 'Tổng diện tích khe yêu cầu', Qmaxs / v, 'm²', 'A = Q/v', '', '[Q]/[v]', 'Ak');
      const nk = s.o('n', 'Số khe', Math.ceil(Ak / (b / 1000 * h1) - 1e-9), 'khe', 'n = A/(b·h₁), làm tròn lên', '', 'ROUNDUP([Ak]/([b]/1000*[h1]),0)', 'nk');
      const Bm = s.o('B_mương', 'Chiều rộng mương', Math.max(0.3, nk * b / 1000 + (nk - 1) * sb / 1000), 'm', 'B = n·b + (n−1)·s (≥ 0,3 m)', '', 'MAX(0.3,[nk]*[b]/1000+([nk]-1)*[s]/1000)', 'Bm');
      const vm = s.o('v_mương', 'Vận tốc trong mương', Qmaxs / (Bm * h1), 'm/s', 'v = Q/(B·h₁)', 'M&E 5th Bảng 5-4', '[Q]/([Bm]*[h1])', 'vm');
      if (AF && vm < 0.4 && Bm <= 0.3 + 1e-9 && h1 <= 0.25 + 1e-9) s.note('Lưu lượng nhỏ: mương bề rộng tối thiểu 0,3 m và h₁ tối thiểu 0,25 m vẫn cho v_mương < 0,4 m/s – bố trí song chắn/giỏ rác trong hố thu hoặc vệ sinh lắng cặn định kỳ.');
      s.chk('Vận tốc mương 0,4 – 0,9 m/s', vm >= 0.4 && vm <= 0.9, 'ĐẠT', 'KIỂM TRA LẠI chiều rộng mương / h₁', 'M&E 5th Bảng 5-4', true, 'AND([vm]>=0.4,[vm]<=0.9)');
      const hL = s.o('h_L', 'Tổn thất qua song chắn sạch (C = 0,7)', (1 / 0.7) * ((v * v - vm * vm) / 19.62), 'm', 'h_L = (1/C)·(v² − v_m²)/2g', 'PT (5-1)', '(1/0.7)*(([v]^2-[vm]^2)/19.62)', 'hL');
      s.o('h_L,tắc', 'Tổn thất khi bị tắc (C = 0,6)', (1 / 0.6) * ((v * v - vm * vm) / 19.62), 'm', '', 'PT (5-1)', '(1/0.6)*(([v]^2-[vm]^2)/19.62)', 'hL2');
      const nch = s.i('n_mương', 'Số mương (kể dự phòng)', p.bar_n, 'mương', '1 làm việc + 1 dự phòng', '', 'nch');
      s.i('m_r', 'Suất rác thô', p.scr_rate, 'kg/m³', '', 'Lựa chọn thiết kế', 'mr');
      const Mr = s.o('M_rác', 'Khối lượng rác thô', p.scr_rate * Q, 'kg/ngđ', 'M = m·Q', '', '[mr]*[info.Q]', 'Mr');
      u.geom = { type: 'rect', L: 5, B: roundTo(Math.max(Bm, 0.5), 0.1), H: h1 + 0.4, fb: 0.4, n: nch, label: 'SCR' };
      u.dims = `${nch} mương × B ${fx(u.geom.B)} m`; u.hl = 0.15 + hL; u.H = h1;
      u.kW = c.screen === 'mech' ? 1.5 * (nch - 1 || 1) + 1.1 : 0;
      R.equip.push({ u: u.name, name: c.screen === 'mech' ? 'Song chắn rác thô cơ giới' : 'Song chắn rác thủ công', spec: `B = ${fx(Bm)} m; khe ${b} mm`, qty: nch, note: 'M&E 5th Bảng 5-4' });
      if (c.screen === 'mech') R.equip.push({ u: u.name, name: 'Băng tải rác + thùng chứa', spec: `${fx(Mr)} kg/ngđ`, qty: 1, note: '' });
    }
    const sump = new Unit(R, 'sump', 'BG', 'Bể gom & trạm bơm nâng', 'nuoc');
    {
      const u = sump, s = u.sec('1. Bể gom — M&E Ch.3, Ch.5');
      s.o('Q_max,h', 'Lưu lượng tính toán', Qmaxh, 'm³/h', '', '', '[info.Qmaxh]', 'Q');
      const t = s.i('t', 'Thời gian lưu', p.sump_t, 'phút', '10 – 20 phút (chu kỳ bật/tắt bơm)', 'Lựa chọn thiết kế', 't');
      const V = s.o('V', 'Thể tích công tác yêu cầu', Qmaxh * t / 60, 'm³', 'V = Q_max,h·t/60', '', '[Q]*[t]/60', 'V');
      // R08: bể nhỏ – làm tròn kích thước 0,5 m có thể làm t vượt 20 phút → giảm bước làm tròn, rồi giảm chiều sâu (≥ 1,5 m)
      const ttOf = (hh, st) => { const a = Qmaxh * t / 60 / hh, bb = ceilTo(Math.sqrt(a / p.sump_LB), st), ll = ceilTo(a / bb, st); return ll * bb * hh / Qmaxh * 60; };
      let Hs = p.sump_H, stp = 0.5;
      if (AF && MAN('sump_H') && ttOf(Hs, stp) > 20.5) warn(`Bể gom: H nhập tay ${fx(Hs)} m cho thời gian lưu ${fx(ttOf(Hs, stp))} phút > 20 phút – giữ giá trị nhập.`);
      else if (AF && ttOf(Hs, stp) > 20.5) {
        for (const st_ of [0.5, 0.2, 0.1]) { stp = st_; if (ttOf(Hs, stp) <= 20.5) break; }
        while (ttOf(Hs, stp) > 20.5 && Hs > 1.5 + 1e-9) Hs = Math.round((Hs - 0.1) * 10) / 10;
        fit('BG', 'Bể gom – chiều sâu H / bước làm tròn kích thước', `H ${fx(p.sump_H)}; làm tròn 0,5`, `H ${fx(Hs)}; làm tròn ${fx(stp)}`, 'm', `t thực tế ${fx(ttOf(p.sump_H, 0.5))} phút > 20 phút → làm tròn ${fx(stp)} m, H = ${fx(Hs)} m, t = ${fx(ttOf(Hs, stp))} phút`);
      }
      const H = s.i('H_ct', 'Chiều sâu công tác', Hs, 'm', Hs !== p.sump_H ? `Tự điều chỉnh từ ${fx(p.sump_H)} m (t ≤ 20 phút)` : '', Hs !== p.sump_H ? 'Quy tắc R08' : '', 'H');
      s.i('L/B', 'Tỷ lệ L/B', p.sump_LB, '-', '', '', 'LB');
      const A = s.o('A', 'Diện tích yêu cầu', V / H, 'm²', 'A = V/H', '', '[V]/[H]', 'A');
      const B = s.o('B', 'Chiều rộng chọn', ceilTo(Math.sqrt(A / p.sump_LB), stp), 'm', `B = √(A/(L/B)), làm tròn ${fx(stp)} m`, stp !== 0.5 ? 'Quy tắc R08' : '', `CEILING(SQRT([A]/[LB]),${stp})`, 'B');
      const Lx = s.o('L', 'Chiều dài chọn', ceilTo(A / B, stp), 'm', `L = A/B, làm tròn ${fx(stp)} m`, '', `CEILING([A]/[B],${stp})`, 'L');
      const Vt = s.o('V_tt', 'Thể tích công tác thực tế', Lx * B * H, 'm³', 'V = L·B·H', '', '[L]*[B]*[H]', 'Vt');
      const tt = s.o('t_tt', 'Thời gian lưu thực tế', Vt / Qmaxh * 60, 'phút', 't = V/Q·60', '', '[Vt]/[Q]*60', 'tt');
      s.chk('t = 10 – 20 phút', tt >= 10 && tt <= 20.5, 'ĐẠT', 'KIỂM TRA LẠI', '', true, 'AND([tt]>=10,[tt]<=20.5)');
      u.geom = { type: 'rect', L: Lx, B, H: H + 0.5, fb: 0.5, n: 1, label: 'BỂ GOM' };
      u.V = Lx * B * (H + 0.5 + p.fb); u.A = Lx * B; u.dims = `${fx(Lx)} × ${fx(B)} × ${fx(H)} m`; u.hrt = `${fx(tt)} phút`; u.H = H;
    }

    const ctdv = new Unit(R, 'ctdv', 'CTDV', 'Công trình đầu vào (lưới tinh – lắng cát)', 'nuoc');
    let airGrit = 0;
    {
      const u = ctdv; let Lfs = 0, Bfs = 0, Lg = 0, Bg = 0, hl = 0.1, zones = [];
      if (c.fine !== 'none') {
        const s = u.sec('1. Lưới lọc rác tinh ' + (c.fine === 'drum' ? 'trống quay' : 'dạng bậc thang') + ' — M&E mục 5-3, Bảng 5-6, 5-7');
        const bt = s.i('b_t', 'Kích thước khe lưới', (bio === 'MBR' || bio === 'KMBR') ? Math.min(p.fs_b, 1) : p.fs_b, 'mm', (bio === 'MBR' || bio === 'KMBR') ? 'MBR: tự chọn ≤ 1 mm bảo vệ màng' : '0,25 – 6 mm', 'Bảng 5-6', 'bt');
        if (bio === 'MBR' || bio === 'KMBR') s.chk('MBR yêu cầu lưới tinh ≤ 1 mm (bảo vệ màng)', bt <= 1, 'ĐẠT', 'KHÔNG ĐẠT – giảm khe lưới xuống ≤ 1 mm', 'M&E mục 8-9 (MBR)', false, '[bt]<=1');
        const qq = s.i('q', 'Tải trọng thủy lực trên diện tích lưới', p.fs_q, 'm³/m²·h', '', 'Catalogue', 'q');
        const A = s.o('A', 'Diện tích lưới yêu cầu', Qmaxh / qq, 'm²', 'A = Q_max,h/q', '', '[info.Qmaxh]/[q]', 'Afs');
        const n = s.i('n', 'Số máy (kể 1 dự phòng)', p.fs_n, 'máy', '', '', 'nfs');
        s.o('A_1', 'Diện tích lưới 1 máy', A / Math.max(1, n - 1), 'm²', 'A/(n − 1)', '', '[Afs]/MAX(1,[nfs]-1)', 'A1');
        s.i('m_t', 'Suất rác tinh', p.fs_rate, 'kg/m³', '', 'Lựa chọn thiết kế', 'mt');
        s.o('M', 'Khối lượng rác tinh', p.fs_rate * Q, 'kg/ngđ', 'M = m·Q', '', '[mt]*[info.Q]', 'Mfs');
        R.equip.push({ u: u.name, name: c.fine === 'drum' ? 'Máy lưới rác tinh trống quay' : 'Lưới rác tinh bậc thang', spec: `A = ${fx(A / Math.max(1, n - 1))} m²/máy; khe ${bt} mm`, qty: n, note: 'Bảng 5-6, 5-7', spare: 'screen' });
        Lfs = 4; Bfs = n * 1.2 + (n - 1) * 0.3; hl += 0.3; zones.push({ name: 'LƯỚI TINH', len: Lfs });
      }
      if (c.grit !== 'none') {
        const s = u.sec('2. ' + DATA.optName('grit', c.grit) + ' — M&E 5th mục 5-5, Bảng 5-16, 5-17, 5-18');
        const n = s.i('n', 'Số đơn nguyên', p.grit_n, 'ngăn', '', '', 'ng');
        if (c.grit === 'aerated') {
          const t = s.i('t', 'Thời gian lưu ở Q_max', p.grit_t, 'phút', '2 – 5 phút (3)', 'M&E 5th Bảng 5-17', 'tg');
          const V = s.o('V', 'Thể tích yêu cầu', Qmaxh * t / 60, 'm³', 'V = Q_max,h·t/60', '', '[info.Qmaxh]*[tg]/60', 'Vg');
          // R08: chọn W, H (bước 0,1 m) gần giá trị nhập nhất sao cho L:W = 3 – 5 và W:H = 1 – 5
          const okG = (w, h) => { const l = ceilTo(V / n / (w * h), 0.5); return l / w >= 3 && l / w <= 5.01 && w / h >= 1 && w / h <= 5; };
          let Wg = p.grit_W, Hgv = p.grit_H;
          if (AF && (MAN('grit_W') || MAN('grit_H')) && !okG(Wg, Hgv)) warn(`Lắng cát thổi khí: W × H nhập tay ${fx(Wg)} × ${fx(Hgv)} m ngoài tỷ lệ L:W = 3 – 5, W:H = 1 – 5 (M&E Bảng 5-17) – giữ giá trị nhập.`);
          else if (AF && !okG(Wg, Hgv)) {
            let best = null;
            for (let h = 0.5; h <= 5 + 1e-9; h += 0.1) for (let w = 0.5; w <= 7 + 1e-9; w += 0.1) {
              const hh = Math.round(h * 10) / 10, ww = Math.round(w * 10) / 10; if (!okG(ww, hh)) continue;
              const sc = Math.abs(Math.log(ww / p.grit_W)) + Math.abs(Math.log(hh / p.grit_H));
              if (!best || sc < best.sc) best = { ww, hh, sc };
            }
            if (best) { fit('CTDV', 'Lắng cát thổi khí – W × H', `${fx(Wg)} × ${fx(Hgv)}`, `${fx(best.ww)} × ${fx(best.hh)}`, 'm', 'L:W = 3 – 5 và W:H = 1 – 5 (M&E Bảng 5-17)'); Wg = best.ww; Hgv = best.hh; }
          }
          const H = s.i('H', 'Chiều sâu', Hgv, 'm', Hgv !== p.grit_H ? `Tự điều chỉnh từ ${fx(p.grit_H)} m` : '2 – 5 m', Hgv !== p.grit_H ? 'Quy tắc R08' : 'M&E 5th Bảng 5-17', 'Hg');
          const W = s.i('W', 'Chiều rộng 1 ngăn', Wg, 'm', Wg !== p.grit_W ? `Tự điều chỉnh từ ${fx(p.grit_W)} m` : '2,5 – 7 m', Wg !== p.grit_W ? 'Quy tắc R08' : 'M&E 5th Bảng 5-17', 'Wg');
          const Lr = s.o('L', 'Chiều dài 1 ngăn', V / n / (W * H), 'm', 'L = V/(n·W·H)', '', '[Vg]/[ng]/([Wg]*[Hg])', 'Lg');
          const Ls = s.o('L_chọn', 'Chiều dài chọn', ceilTo(Lr, 0.5), 'm', 'Làm tròn 0,5 m', '', 'CEILING([Lg],0.5)', 'Lgs');
          s.chk('L:W = 3 – 5 và W:H = 1 – 5', Ls / W >= 3 && Ls / W <= 5.01 && W / H >= 1 && W / H <= 5, 'ĐẠT', 'ĐIỀU CHỈNH W, H', 'M&E 5th Bảng 5-17', true, 'AND([Lgs]/[Wg]>=3,[Lgs]/[Wg]<=5.01,[Wg]/[Hg]>=1,[Wg]/[Hg]<=5)');
          const qa = s.i('q_khí', 'Suất cấp khí trên 1 m dài', p.grit_qair, 'L/m·s', '3,3 – 8,3 (0,2 – 0,5 m³/m·phút)', 'M&E 5th Bảng 5-17', 'qa');
          airGrit = s.o('Q_khí', 'Lưu lượng khí', qa * Lr * n * 60 / 1000, 'm³/phút', 'Q = q·L·n·60/1000', 'M&E 5th Bảng 5-17', '[qa]*[Lg]*[ng]*60/1000', 'Qag');
          R.equip.push({ u: u.name, name: 'Máy thổi khí lắng cát', spec: `${fx(airGrit)} m³/phút × 35 kPa; 5,5 kW`, qty: 2, note: '1 + 1' });
          R.equip.push({ u: u.name, name: 'Cầu hút cát + phân loại cát, gạt dầu', spec: `${n} ngăn ${fx(W)} × ${fx(Ls)} m`, qty: 1, note: '' });
          Lg = Ls; Bg = n * W + (n - 1) * 0.3; u.gritH = H; u.V += V; zones.push({ name: 'LẮNG CÁT – TÁCH DẦU', len: Lg });
          u.gritDims = `${n} × (${fx(W)} × ${fx(H)} × ${fx(Ls)} m)`;
        } else if (c.grit === 'vortex') {
          const t = s.i('t', 'Thời gian lưu ở lưu lượng trung bình', p.vortex_t, 'giây', '20 – 30 s ở Q_TB', 'M&E 5th Bảng 5-18', 'tv');
          const V = s.o('V_1', 'Thể tích 1 bể', Q / 86400 * t / n, 'm³', 'V = Q_TB,s·t/n', 'M&E 5th Bảng 5-18', '[info.Q]/86400*[tv]/[ng]', 'Vv');
          const D = s.o('D', 'Đường kính buồng xoáy (H ≈ D)', ceilTo(Math.cbrt(4 * V / PI), 0.1), 'm', 'D = ∛(4V/π)', '', 'CEILING((4*[Vv]/PI())^(1/3),0.1)', 'Dv');
          Lg = D + 1; Bg = n * (D + 0.6); u.gritH = D; zones.push({ name: 'LẮNG CÁT XOÁY', len: Lg });
          R.equip.push({ u: u.name, name: 'Bộ cánh khuấy lắng cát xoáy + bơm cát', spec: `D = ${fx(D)} m`, qty: n, note: 'Catalogue' });
          u.gritDims = `${n} × D ${fx(D)} m`;
        } else {
          const v = s.i('v_h', 'Vận tốc ngang', p.hgrit_v, 'm/s', '0,25 – 0,4 (0,3)', 'M&E 5th Bảng 5-16', 'vh');
          const t = s.i('t', 'Thời gian lưu', p.hgrit_t, 'giây', '45 – 90 (60)', 'M&E 5th Bảng 5-16', 'th');
          const H = s.i('H', 'Chiều sâu nước', p.hgrit_H, 'm', '', '', 'Hh');
          const B = s.o('B', 'Chiều rộng 1 mương', ceilTo(Qmaxs / v / n / H, 0.1), 'm', 'B = Q/(v·n·H)', '', 'CEILING([info.Qmaxs]/[vh]/[ng]/[Hh],0.1)', 'Bh');
          const Lx = s.o('L', 'Chiều dài mương', ceilTo(v * t, 0.5), 'm', 'L = v·t', '', 'CEILING([vh]*[th],0.5)', 'Lh');
          Lg = Lx; Bg = n * B + (n - 1) * 0.3; u.gritH = H; zones.push({ name: 'MƯƠNG LẮNG CÁT', len: Lg });
          R.equip.push({ u: u.name, name: 'Bơm / vít tải cát', spec: '', qty: n, note: '' });
          u.gritDims = `${n} × (${fx(B)} × ${fx(Lx)} m)`;
        }
        s.i('m_c', 'Suất cát', p.grit_rate, 'kg/m³', '', 'Lựa chọn thiết kế', 'mc');
        s.o('M_cát', 'Khối lượng cát', p.grit_rate * Q, 'kg/ngđ', 'M = m·Q', '', '[mc]*[info.Q]', 'Mc');
        if (c.grit === 'aerated') s.note('M&E mục 5-5: bể lắng cát thổi khí nước thải công nghiệp phát tán VOC, H₂S – nên che kín và thu khí về hệ khử mùi.');
        hl += 0.15;
      }
      zones.push({ name: 'HỘP CHIA', len: 2.5 });
      const Ltot = zones.reduce((a, z) => a + z.len, 0);
      const Bt = Math.max(Bfs, Bg, 2);
      u.geom = { type: 'rect', L: Ltot, B: roundTo(Bt, 0.1), H: (u.gritH || 1.5) + 0.2, fb: 0.5, n: 1, zones, label: 'CTĐV' };
      u.A = Ltot * Bt; u.V = Ltot * Bt * ((u.gritH || 1.5) + 0.7); u.hl = hl; u.H = u.gritH || 1.5;
      u.dims = `${fx(Ltot)} × ${fx(Bt)} m` + (u.gritDims ? `; lắng cát ${u.gritDims}` : '');
      u.kW = p.hw_kW;
      if (!u.secs.length) { const s = u.sec('Không bố trí lưới tinh và lắng cát'); s.note('Chỉ còn hộp chia nước.'); }
    }

    /* ---------- ② sau tiền xử lý ---------- */
    const st2 = { ...st1 };
    const hwOn = c.grit !== 'none' || c.fine !== 'none';
    const ogF = c.grit === 'aerated' ? 1 : c.grit === 'none' ? 0 : 0.25;
    for (const k of ['COD', 'BOD', 'TSS', 'TN', 'TKN', 'NH4', 'TP', 'Color']) st2[k] = st1[k] * (1 - (hwOn ? E[k].hw : 0) / 100);
    st2.OG = st1.OG * (1 - ogF * E.OG.hw / 100);
    stageRows(2, '② Sau tiền xử lý (song chắn, lưới tinh, lắng cát – tách dầu)', st2, k => {
      if (k === 'OG') return `[OG1]*(1-${ogF}*[e_OG_hw]/100)`;
      if (DATA.EFF_ROWS.includes(k) && hwOn) return `[${k}1]*(1-[e_${k}_hw]/100)`;
      return `[${k}1]`;
    });

    /* ---------- Bể điều hòa ---------- */
    const hasEQ = c.eq === 'yes' || (c.eq === 'auto' && !!DATA.CONTINUOUS[bio]);
    let Qeq = 0, airEQ = 0;
    if (hasEQ) {
      const u = new Unit(R, 'eq', 'DH', 'Bể điều hòa lưu lượng & nồng độ', 'nuoc');
      const s = u.sec('1. Thể tích bể — M&E Ch.3 mục 3-7');
      s.t2('Lý do bố trí', c.eq === 'auto' ? 'Công nghệ ' + DATA.BIO_SHORT[bio] + ' dòng chảy liên tục – điều hòa lưu lượng & nồng độ' : 'Chọn bố trí', '', 'M&E mục 3-7');
      const t = s.i('t', 'Thời gian lưu thiết kế', p.eq_t, 'h', '6 – 12 h (khi chưa có đường cong tích lũy)', 'M&E mục 3-7', 't');
      const V0 = s.o('V_lt', 'Thể tích theo thời gian lưu', Qh * t, 'm³', 'V = Q_h·t', '', '[info.Qh]*[t]', 'V0');
      const kd = s.i('k_dp', 'Hệ số dự phòng', p.eq_kdp, '-', '+10 – 20 %', 'M&E mục 3-7', 'kd');
      const V = s.o('V', 'Thể tích thiết kế', V0 * kd, 'm³', 'V = V_lt·k_dp', '', '[V0]*[kd]', 'V');
      const H = s.i('H', 'Chiều sâu công tác', p.eq_H, 'm', '1,5 – 6 m', 'M&E mục 3-7', 'H');
      const n = s.i('n', 'Số ngăn', p.eq_n, 'ngăn', '', '', 'n');
      const A1 = V / H / n;
      const B = s.o('B', 'Chiều rộng 1 ngăn', ceilTo(Math.sqrt(A1 / 1.25), 0.5), 'm', 'L/B ≈ 1,25', '', 'CEILING(SQRT([V]/[H]/[n]/1.25),0.5)', 'B');
      const Lx = s.o('L', 'Chiều dài 1 ngăn', ceilTo(A1 / B, 0.5), 'm', '', '', 'CEILING([V]/[H]/[n]/[B],0.5)', 'L');
      const Vt = s.o('V_tt', 'Thể tích thực tế', Lx * B * H * n, 'm³', 'V = L·B·H·n', '', '[L]*[B]*[H]*[n]', 'Vt');
      s.o('t_tt', 'Thời gian lưu thực tế', Vt / Qh, 'h', '', '', '[Vt]/[info.Qh]', 'tt');
      const s2 = u.sec('2. Khuấy trộn bằng khí nén & bơm');
      const qa = s2.i('q_khí', 'Suất khí khuấy trộn', p.eq_qair, 'm³/m³·phút', '0,010 – 0,015', 'M&E mục 3-7', 'qa');
      airEQ = s2.o('Q_khí', 'Lưu lượng khí', qa * Vt, 'm³/phút', 'Q = q·V', 'M&E mục 3-7', '[qa]*[Vt]', 'Qa');
      Qeq = s2.o('Q_bơm', 'Lưu lượng bơm ra (điều hòa + 10 %)', Qh * 1.1, 'm³/h', 'Q = 1,1·Q_h', '', '1.1*[info.Qh]', 'Qp');
      u.geom = { type: 'rect', L: Lx, B, H, fb: p.fb, n, label: 'BỂ ĐIỀU HÒA' };
      u.V = Lx * B * (H + p.fb) * n; u.A = Lx * B * n; u.n = n; u.dims = `${n} × (${fx(Lx)} × ${fx(B)} × ${fx(H)} m)`; u.hrt = `${fx(Vt / Qh)} h`; u.H = H;
      R.equip.push({ u: u.name, name: 'Ống phân phối khí khuấy trộn (bọt thô)', spec: `${fx(airEQ)} m³/phút`, qty: 1, note: 'Khí từ nhà máy thổi khí' });
    }
    const Qpk_eff = hasEQ ? Qeq : Qmaxh;
    const QpkRef = hasEQ ? '[eq.Qp]' : '[info.Qmaxh]';

    /* ======================= CỤM HÓA LÝ ======================= */
    function chemCluster(tag, Qd, QdX, nIn, nOut, stIn, stOut, label) {
      const pre = tag === 'pre';
      const id = pre ? 'hl' : 'hl3', code = pre ? 'HL' : 'HL3';
      const u = new Unit(R, id, code, pre ? 'Cụm hóa lý trước sinh học (pH – keo tụ – tạo bông)' : 'Cụm hóa lý bậc 3 (pH – keo tụ – tạo bông)', 'hoaly');
      const s0 = u.sec('0. Số liệu nước vào cụm hóa lý');
      s0.o('Q_tt', 'Lưu lượng tính thể tích bể', Qd, 'm³/h', label, '', QdX, 'Qd');
      s0.o('TSS_vào', 'TSS vào', stIn.TSS, 'mg/L', 'Cân bằng cột ' + nIn, '', `[bal.TSS${nIn}]`, 'TSSin');
      s0.o('TP_vào', 'TP vào', stIn.TP, 'mg/L', '', '', `[bal.TP${nIn}]`, 'TPin');
      s0.o('TP_ra', 'TP mục tiêu ra', stOut.TP, 'mg/L', '', '', `[bal.TP${nOut}]`, 'TPout');
      s0.o('TSS_ra', 'TSS ra', stOut.TSS, 'mg/L', '', '', `[bal.TSS${nOut}]`, 'TSSout');
      const mu = s0.i('μ', 'Độ nhớt động lực', p.mu, 'N·s/m²', '25 °C: 0,89·10⁻³', 'M&E Phụ lục C', 'mu');
      const s1 = u.sec('1. Bể điều chỉnh pH');
      const tp = s1.i('t', 'Thời gian lưu', p.ph_t, 'phút', '', 'M&E Bảng 6-24', 'tp');
      const Vp = s1.o('V', 'Thể tích', Qd * tp / 60, 'm³', 'V = Q·t/60', '', '[Qd]*[tp]/60', 'Vp');
      const Hp = s1.i('H', 'Chiều sâu', p.ph_H, 'm', '', '', 'Hp');
      const ap = s1.o('L = B', 'Cạnh bể vuông', ceilTo(Math.sqrt(Vp / Hp), 0.1), 'm', 'L = √(V/H)', '', 'CEILING(SQRT([Vp]/[Hp]),0.1)', 'ap');
      const Gp = s1.i('G', 'Gradient vận tốc', p.ph_G, '1/s', '100 – 1000', 'M&E 5th Bảng 5-9', 'Gp');
      const Pp = s1.o('P', 'Công suất khuấy', Gp * Gp * mu * Vp / 1000, 'kW', 'P = G²·μ·V', 'PT (5-3)', '[Gp]^2*[mu]*[Vp]/1000', 'Pp');
      const cN = s1.i('C_NaOH', 'Liều NaOH 100 %', p.NaOH_ph, 'mg/L', 'Chuẩn độ thực tế', 'M&E mục 6-5', 'cN');
      const MN = s1.o('M_NaOH', 'NaOH 100 % tiêu thụ', cN * Q / 1000, 'kg/ngđ', 'M = C·Q/1000', '', '[cN]*[info.Q]/1000', 'MN');
      const s2 = u.sec('2. Bể keo tụ – khuấy trộn nhanh');
      const tc = s2.i('t', 'Thời gian khuấy trộn', p.coag_t, 'phút', '5 – 30 s (0,08 – 0,5 phút)', 'M&E 5th Bảng 5-9, 6-24', 'tc');
      const Vc = s2.o('V', 'Thể tích', Qd * tc / 60, 'm³', '', '', '[Qd]*[tc]/60', 'Vc');
      const Hc = s2.i('H', 'Chiều sâu', p.coag_H, 'm', '', '', 'Hc');
      const ac = s2.o('L = B', 'Cạnh bể vuông', ceilTo(Math.sqrt(Vc / Hc), 0.1), 'm', '', '', 'CEILING(SQRT([Vc]/[Hc]),0.1)', 'ac');
      const Gc = s2.i('G', 'Gradient', p.coag_G, '1/s', '500 – 1500', 'M&E 5th Bảng 5-9', 'Gc');
      const Pc = s2.o('P', 'Công suất khuấy', Gc * Gc * mu * Vc / 1000, 'kW', 'P = G²·μ·V', 'PT (5-3)', '[Gc]^2*[mu]*[Vc]/1000', 'Pc');
      s2.o('G·t', 'Tích số G·t', Gc * tc * 60, '-', '', 'PT (5-4)', '[Gc]*[tc]*60', 'Gtc');
      s2.note('M&E 5th Bảng 6-24 (tr.544): phèn/FeCl₃ keo tụ hấp phụ – trung hòa cần trộn < 1 s (trộn tĩnh inline); keo tụ quét 1 – 10 s; bể keo tụ chỉ là bể back-mix.');
      const s3 = u.sec('3. Bể tạo bông 3 ngăn');
      const tf = s3.i('t', 'Tổng thời gian tạo bông', p.floc_t, 'phút', '30 – 60', 'M&E 5th Bảng 5-9', 'tf');
      const Vf = s3.o('V', 'Tổng thể tích 3 ngăn', Qd * tf / 60, 'm³', '', '', '[Qd]*[tf]/60', 'Vf');
      const Hf = s3.i('H', 'Chiều sâu', p.floc_H, 'm', '', '', 'Hf');
      const af = s3.o('L = B', 'Cạnh 1 ngăn', ceilTo(Math.sqrt(Vf / 3 / Hf), 0.1), 'm', '', '', 'CEILING(SQRT([Vf]/3/[Hf]),0.1)', 'af');
      s3.i('G₁', 'Gradient ngăn 1', p.floc_G1, '1/s', '50 – 100', 'M&E 5th Bảng 5-9', 'G1');
      s3.i('G₂', 'Gradient ngăn 2', p.floc_G2, '1/s', '50 – 100', 'M&E 5th Bảng 5-9', 'G2');
      s3.i('G₃', 'Gradient ngăn 3', p.floc_G3, '1/s', '50 – 100', 'M&E 5th Bảng 5-9', 'G3');
      const Pf = s3.o('ΣP', 'Tổng công suất khuấy', (p.floc_G1 ** 2 + p.floc_G2 ** 2 + p.floc_G3 ** 2) * mu * Vf / 3 / 1000, 'kW', 'P = ΣGᵢ²·μ·V_ngăn', 'PT (5-3), Bảng 5-9', '([G1]^2+[G2]^2+[G3]^2)*[mu]*[Vf]/3/1000', 'Pf');
      s3.o('G·t', 'Tích số G·t trung bình', (p.floc_G1 + p.floc_G2 + p.floc_G3) / 3 * tf * 60, '-', '', 'Bảng 5-9', '([G1]+[G2]+[G3])/3*[tf]*60', 'Gtf');
      const s4 = u.sec('4. Liều hóa chất & khử photpho — M&E mục 6-2, 6-4, Ví dụ 6-1');
      // chất keo tụ theo lựa chọn phương án: PAC / FeCl₃ / FeCl₂ / phèn nhôm (kim loại Me = Al hoặc Fe)
      const CG = DATA.COAG[c.coag] || DATA.COAG.pac, Me = CG.me, Mm = CG.M, isFe = Me === 'Fe', MP = isFe ? 150.82 : 121.95, MOH = isFe ? 106.87 : 78.0;
      s4.t2('Chất keo tụ', DATA.optName('coag', c.coag || 'pac'), '', c.coag === 'fecl2' ? 'Fe²⁺ phải được oxy hóa thành Fe³⁺ (sục khí bể pH / keo tụ) trước khi kết tủa P và tạo bông Fe(OH)₃' : 'M&E mục 6-2');
      const dP = s4.o('ΔP', 'Lượng P cần kết tủa', Math.max(0, stIn.TP - stOut.TP), 'mg/L', 'TP_vào − TP_ra', '', 'MAX(0,[TPin]-[TPout])', 'dP');
      const AlP = s4.i(Me + ':P', 'Tỷ lệ mol ' + Me + '/P', p[CG.MeP], 'mol/mol', isFe ? '2,0 – 3,5' : '1,5 – 3,0', 'M&E mục 6-4', 'AlP');
      const MAlP = s4.o('M_' + Me + ',P', Me + ' cần cho kết tủa P', AlP * dP / 31 * Mm * Q / 1000, 'kg ' + Me + '/ngđ', `(${Me}:P)·(ΔP/31)·${Mm}·Q/1000`, 'M&E mục 6-4', `[AlP]*[dP]/31*${Mm}*[info.Q]/1000`, 'MAlP');
      const pal = s4.i('%' + Me, 'Hàm lượng ' + Me + ' trong ' + CG.name, CG.frac(p), 'kg/kg', '', 'Chứng chỉ sản phẩm', 'pal');
      const PACreq = s4.o('C_PAC,P', `Liều ${CG.name} tối thiểu để đủ ${Me} khử P`, MAlP / pal / Q * 1000, 'mg/L', `C = M_${Me},P/(%${Me})/Q`, '', '[MAlP]/[pal]/[info.Q]*1000', 'PACreq');
      const d0 = +p[CG.dose];
      s4.i('C_PAC,0', `Liều ${CG.name} chọn theo Jartest`, d0, 'mg/L', '', 'Jartest', 'PAC0');
      const PAC = s4.o('C_PAC', `Liều ${CG.name} áp dụng`, Math.max(d0, PACreq), 'mg/L', 'max(liều Jartest; liều khử P)', 'Jartest', 'MAX([PAC0],[PACreq])', 'PAC');
      if (PAC > d0 + 0.01) s4.note(`Liều ${CG.name} tự nâng từ ${d0} lên ${fx(PAC)} mg/L để đủ ${Me} cho kết tủa P (${Me}:P = ${AlP}).`);
      const MPAC = s4.o('M_PAC', `${CG.name} tiêu thụ`, PAC * Q / 1000, 'kg/ngđ', 'M = C·Q/1000', '', '[PAC]*[info.Q]/1000', 'MPAC');
      const MAl = s4.o('M_' + Me, Me + (isFe ? '' : '³⁺') + ' châm vào', MPAC * pal, 'kg ' + Me + '/ngđ', 'M·%' + Me, '', '[MPAC]*[pal]', 'MAl');
      s4.o('ΔAlk', 'Độ kiềm tiêu thụ do thủy phân muối kim loại', MAl / Mm * 3 * 50 / Q * 1000, 'mg CaCO₃/L', '3 đương lượng / mol ' + Me, 'M&E mục 6-3', `[MAl]/${Mm}*3*50/[info.Q]*1000`, 'dAlk');
      if (c.coag === 'fecl2') s4.o('O₂ oxy hóa Fe²⁺', 'Nhu cầu O₂ oxy hóa Fe²⁺ → Fe³⁺', MAl * 32 / (4 * Mm), 'kg O₂/ngđ', '4Fe²⁺ + O₂ → 4Fe³⁺', '', `[MAl]*32/(4*${Mm})`, 'O2fe');
      const cpol = s4.i('C_poly', 'Liều polymer anion', p.poly_c, 'mg/L', '0,5 – 2,0', 'M&E mục 6-2', 'cpol');
      const Mpol = s4.o('M_poly', 'Polymer tiêu thụ', cpol * Q / 1000, 'kg/ngđ', '', '', '[cpol]*[info.Q]/1000', 'Mpol');
      const s5 = u.sec('5. Bùn hóa lý phát sinh');
      const MTSS = s5.o('M_TSS', 'Bùn từ TSS tách được', Math.max(0, stIn.TSS - stOut.TSS) * Q / 1000, 'kg DS/ngđ', '(TSS_vào − TSS_ra)·Q', '', 'MAX(0,[TSSin]-[TSSout])*[info.Q]/1000', 'MTSS');
      const MAlPO4 = s5.o(`M_${Me}PO₄`, `Bùn ${Me}PO₄`, dP / 31 * MP * Q / 1000, 'kg/ngđ', `1 mol P → 1 mol ${Me}PO₄`, 'M&E VD 6-1', `[dP]/31*${MP}*[info.Q]/1000`, 'MAlPO4');
      const MAlOH = s5.o(`M_${Me}(OH)₃`, `Bùn ${Me}(OH)₃ từ ${Me} dư`, Math.max(0, MAl - dP / 31 * Mm * Q / 1000) / Mm * MOH, 'kg/ngđ', '', 'M&E VD 6-1', `MAX(0,[MAl]-[dP]/31*${Mm}*[info.Q]/1000)/${Mm}*${MOH}`, 'MAlOH');
      const Ms = s5.o('ΣM', 'Tổng bùn hóa lý khô', MTSS + MAlPO4 + MAlOH + Mpol, 'kg DS/ngđ', '', '', '[MTSS]+[MAlPO4]+[MAlOH]+[Mpol]', 'Ms');
      const Cds = s5.i('C_DS', 'Nồng độ bùn xả đáy', p.chem_DS, '% DS', '1 – 3 %', 'M&E VD 6-1', 'Cds');
      const Vs = s5.o('V_bùn', 'Lưu lượng bùn xả đáy', Ms / (1.03 * 1000 * Cds / 100), 'm³/ngđ', 'V = M/(SG·1000·%DS)', '', '[Ms]/(1.03*1000*[Cds]/100)', 'Vs');
      const zones = [{ name: 'pH', len: ap }, { name: 'KEO TỤ', len: ac }, { name: 'TẠO BÔNG 1', len: af }, { name: 'TẠO BÔNG 2', len: af }, { name: 'TẠO BÔNG 3', len: af }];
      u.geom = { type: 'rect', L: ap + ac + 3 * af + 0.8, B: Math.max(ap, af), H: Math.max(Hp, Hf), fb: p.fb, n: 1, zones, label: pre ? 'CỤM HÓA LÝ' : 'CỤM HÓA LÝ BẬC 3' };
      u.V = Vp + Vc + Vf; u.A = ap * ap + ac * ac + 3 * af * af; u.H = Hf; u.hl = 0.3;
      u.dims = `pH ${fx(ap)}×${fx(ap)}; keo tụ ${fx(ac)}×${fx(ac)}; tạo bông 3×(${fx(af)}×${fx(af)}) m`;
      u.hrt = `${fx(tp + tc + tf)} phút`;
      u.kW = Pp + Pc + Pf; u.sludge = Ms; u.sludgeV = Vs;
      const tg = pre ? 'CEPT' : 'bậc 3';
      R.chem.push({ name: `${CG.name} – keo tụ & khử P (${tg})`, dose: PAC, kg: MPAC, unit: 'kg sản phẩm', price: CG.price, note: 'Jartest (M&E Hình 6-7)', ref: u.ids.MPAC, sol: CG.sol ? p[CG.sol] : 1, rho: CG.rho ? p[CG.rho] : isFe ? 1.4 : 1.25 });
      R.chem.push({ name: `Polymer anion – trợ lắng (${tg})`, dose: cpol, kg: Mpol, unit: 'kg sản phẩm', price: 'p_poly', note: 'M&E mục 6-2', ref: u.ids.Mpol, sol: p.sol_poly, rho: 1 });
      R.chem.push({ name: `NaOH 100 % – chỉnh pH (${tg})`, dose: cN, kg: MN, unit: 'kg quy 100 %', price: 'p_NaOH', note: 'Chuẩn độ', ref: u.ids.MN, sol: p.sol_NaOH, rho: p.rho_NaOH });
      R.equip.push({ u: u.name, name: 'Máy khuấy bể pH', spec: `${fx(Pp)} kW; G = ${Gp} s⁻¹`, qty: 1, note: 'PT (5-3)' });
      R.equip.push({ u: u.name, name: 'Máy khuấy nhanh bể keo tụ', spec: `${fx(Pc)} kW; G = ${Gc} s⁻¹`, qty: 1, note: '+ trộn tĩnh inline' });
      R.equip.push({ u: u.name, name: 'Máy khuấy chậm tạo bông', spec: `${fx(Pf / 3)} kW/máy`, qty: 3, note: 'Bảng 5-9' });
      R.equip.push({ u: u.name, name: `Bơm định lượng ${CG.name} / polymer / NaOH`, spec: 'Theo liều bảng hóa chất', qty: 6, note: '3 + 3 dự phòng, biến tần' });

      const us = new Unit(R, pre ? 'sep' : 'sep3', pre ? 'LHL' : 'LHL3', (pre ? 'Tách pha hóa lý – ' : 'Tách pha hóa lý bậc 3 – ') + DATA.optName('chemSep', c.chemSep), 'hoaly');
      const ss = us.sec('1. ' + DATA.optName('chemSep', c.chemSep));
      ss.o('Q_tt', 'Lưu lượng đỉnh tính toán', Qd, 'm³/h', '', '', `[${id}.Qd]`, 'Qd');
      if (c.chemSep === 'clarifier') {
        const SOR = ss.i('SOR', 'Tải trọng bề mặt thiết kế', p.sepc_SOR, 'm³/m²·ngđ', 'Lắng sau châm hóa chất: 24 – 32', 'Bảng 8-34', 'SOR');
        const A = ss.o('A', 'Diện tích yêu cầu', Math.max(Q / SOR, Qd * 24 / 80), 'm²', 'A = max(Q/SOR; Q_đỉnh·24/80)', 'PT (8-80)', 'MAX([info.Q]/[SOR],[Qd]*24/80)', 'A');
        const n = ss.i('n', 'Số bể', p.sepc_n, 'bể', '', '', 'n');
        const D = ss.o('D', 'Đường kính 1 bể', ceilTo(Math.sqrt(4 * A / n / PI), 0.5), 'm', 'D = √(4A/nπ), làm tròn 0,5 m', '', 'CEILING(SQRT(4*[A]/[n]/PI()),0.5)', 'D');
        const H = ss.i('H', 'Chiều sâu công tác', p.sepc_H, 'm', '3 – 4,9', 'Bảng 5-19', 'H');
        const At = ss.o('A_tt', 'Diện tích thực tế', n * PI * D * D / 4, 'm²', 'n·π·D²/4', '', '[n]*PI()*[D]^2/4', 'At');
        ss.o('t', 'Thời gian lưu', At * H / Q * 24, 'h', '', 'Bảng 5-19: 1,5 – 2,5 h', '[At]*[H]/[info.Q]*24', 't');
        const SORp = ss.o('SOR_đỉnh', 'Tải trọng bề mặt ở lưu lượng đỉnh', Qd * 24 / At, 'm³/m²·ngđ', '', 'Bảng 5-19: 80 – 120', '[Qd]*24/[At]', 'SORp');
        ss.chk('SOR đỉnh ≤ 80 m³/m²·ngđ', SORp <= 80.01, 'ĐẠT', 'VƯỢT', 'Bảng 5-19', false, '[SORp]<=80.01');
        ss.o('q_máng', 'Tải trọng máng tràn', Q / (n * PI * D), 'm³/m·ngđ', 'q = Q/(n·π·D)', 'Bảng 5-19', '[info.Q]/([n]*PI()*[D])', 'qw');
        us.geom = { type: 'circ', D, H, fb: p.fb, n, label: 'LẮNG' }; us.V = At * H; us.A = At; us.n = n; us.H = H;
        us.dims = `${n} × D ${fx(D)} m, H ${fx(H)} m`; us.kW = 0.75 * n;
        R.equip.push({ u: us.name, name: 'Cầu gạt bùn bể lắng ly tâm', spec: `D = ${fx(D)} m; 0,75 kW`, qty: n, note: '' });
        R.equip.push({ u: us.name, name: 'Bơm bùn hóa lý', spec: `${fx(Vs / 8 / n)} m³/h`, qty: n + 1, note: '' });
      } else if (c.chemSep === 'lamella') {
        const vs = ss.i('v_s', 'Vận tốc lắng thiết kế', p.lam_vs, 'm/h', 'Cột lắng', 'M&E mục 5-7', 'vs');
        const th = ss.i('θ', 'Góc nghiêng tấm', p.lam_ang, 'độ', '45 – 60°', 'PT (5-33)', 'th');
        const d = ss.i('d', 'Khoảng cách tấm', p.lam_d, 'mm', '', 'PT (5-35)', 'd');
        const Lp = ss.i('L_tấm', 'Chiều dài tấm', p.lam_L, 'm', '', '', 'Lp');
        const w = ss.i('w', 'Chiều rộng tấm', p.lam_w, 'm', '', '', 'w');
        const rad = th * PI / 180;
        const uu = ss.o('u', 'Vận tốc cho phép giữa 2 tấm', vs * (Lp * Math.cos(rad) + d / 1000 * Math.sin(rad)) / (d / 1000), 'm/h', 'u = v_s·(L·cosθ + d·sinθ)/d', 'PT (5-33)…(5-36)', '[vs]*([Lp]*COS(RADIANS([th]))+[d]/1000*SIN(RADIANS([th])))/([d]/1000)', 'uu');
        const N = ss.o('N', 'Số khe yêu cầu', Math.ceil(Qd / (uu * d / 1000 * w) - 1e-9), 'khe', 'N = Q/(u·d·w)', 'PT (5-36)', 'ROUNDUP([Qd]/([uu]*[d]/1000*[w]),0)', 'N');
        ss.o('A_chiếu', 'Diện tích chiếu bằng bó tấm', N * Lp * w * Math.cos(rad), 'm²', 'A = N·L·w·cosθ', 'PT (5-34)', '[N]*[Lp]*[w]*COS(RADIANS([th]))', 'Ach');
        const k = ss.i('k', 'Số hàng module', p.lam_k, 'hàng', '', '', 'k');
        const Lr = ss.o('L_hàng', 'Chiều dài 1 hàng bó tấm', (N / k) * d / 1000 / Math.sin(rad) + Lp * Math.cos(rad), 'm', 'L = (N/k)·d/sinθ + L·cosθ', '', '([N]/[k])*[d]/1000/SIN(RADIANS([th]))+[Lp]*COS(RADIANS([th]))', 'Lr');
        const Amb = ss.o('A_mb', 'Diện tích bó tấm', k * w * Lr, 'm²', 'k·w·L_hàng', '', '[k]*[w]*[Lr]', 'Amb');
        ss.o('SOR_dn', 'SOR danh nghĩa trên mặt bằng', Q / Amb, 'm³/m²·ngđ', '', '', '[info.Q]/[Amb]', 'SORd');
        const H = p.lam_H; const Bt = k * (w + 0.1); const Lt = ceilTo(Lr + 2.5, 0.5);
        us.geom = { type: 'rect', L: Lt, B: roundTo(Bt, 0.1), H, fb: p.fb, n: 1, zones: [{ name: 'VÀO', len: 1.5 }, { name: 'BÓ TẤM LAMELLA', len: Lt - 2.5 }, { name: 'RA', len: 1 }], label: 'LAMELLA', lamella: true };
        us.V = Lt * Bt * H; us.A = Lt * Bt; us.H = H; us.dims = `${fx(Lt)} × ${fx(Bt)} × ${fx(H)} m; ${N} khe`; us.kW = 2.2;
        ss.note('M&E mục 5-4: bắt buộc có lưới rác tinh phía trước và hệ xối rửa tấm.');
        R.equip.push({ u: us.name, name: 'Bó tấm lắng lamella', spec: `${N} khe; tấm ${Lp}×${w} m; θ = ${th}°`, qty: k, note: 'module' });
      } else {
        const AS = ss.i('A/S', 'Tỷ lệ khí/chất rắn', p.daf_AS, 'mL/mg', '0,005 – 0,06', 'PT (5-47)', 'AS');
        const sa = ss.i('s_a', 'Độ hòa tan không khí', p.daf_sa, 'mL/L', '20 °C: 18,7', 'PT (5-47)', 'sa');
        const pp = ss.i('p', 'Áp suất dư bão hòa', p.daf_p, 'kPa', '275 – 500', 'M&E VD 5-11', 'pp');
        const Pa = ss.o('P', 'Áp suất tuyệt đối', (pp + 101.35) / 101.35, 'atm', '(p + 101,35)/101,35', '', '([pp]+101.35)/101.35', 'Pa');
        const Rr = ss.o('R_lt', 'Hồi lưu bão hòa theo A/S', AS * stIn.TSS * Q / (1.3 * sa * (0.5 * Pa - 1)), 'm³/ngđ', 'R = (A/S)·S_a·Q/[1,3·s_a·(f·P − 1)]', 'PT (5-48)', `[AS]*[${id}.TSSin]*[info.Q]/(1.3*[sa]*(0.5*[Pa]-1))`, 'Rr');
        ss.i('R_min', 'Tỷ lệ hồi lưu tối thiểu', p.daf_Rmin, '-', '', 'M&E VD 5-11', 'Rmin');
        const Rq = ss.o('R', 'Hồi lưu áp dụng', Math.max(p.daf_Rmin * Q, Rr), 'm³/ngđ', 'max(R_lt; R_min·Q)', '', 'MAX([Rmin]*[info.Q],[Rr])', 'Rq');
        const qb = ss.i('q_bm', 'Tải trọng bề mặt', p.daf_q, 'L/m²·phút', '', 'M&E 5th tr.406 – 408', 'qb');
        const A = ss.o('A', 'Diện tích DAF', (Qd * 24 + Rq) * 1000 / (qb * 1440), 'm²', 'A = (Q_đỉnh + R)·10³/(q·1440)', 'M&E VD 5-11', '([Qd]*24+[Rq])*1000/([qb]*1440)', 'A');
        const H = ss.i('H', 'Chiều sâu', p.daf_H, 'm', '', '', 'H');
        const Pw = ss.o('N_bơm', 'Công suất bơm hồi lưu áp lực', 9.81 * (Rq / 86400) * (pp / 9.81) / 0.65, 'kW', 'ρgQH/η, η = 0,65', '', '9.81*([Rq]/86400)*([pp]/9.81)/0.65', 'Pw');
        const B = ceilTo(Math.sqrt(A / 3), 0.5), Lx = ceilTo(A / B, 0.5);
        us.geom = { type: 'rect', L: Lx, B, H, fb: 0.5, n: 1, zones: [{ name: 'TIẾP XÚC', len: Math.min(2, Lx * 0.2) }, { name: 'TUYỂN NỔI', len: Lx - Math.min(2, Lx * 0.2) }], label: 'DAF' };
        us.V = A * H; us.A = Lx * B; us.H = H; us.dims = `${fx(Lx)} × ${fx(B)} × ${fx(H)} m`; us.kW = Pw + 5.5;
        R.equip.push({ u: us.name, name: 'Bộ DAF (bơm hồi lưu, bình bão hòa, gạt váng)', spec: `A = ${fx(A)} m²; R = ${fx(Rq / 24)} m³/h`, qty: 1, note: '' });
      }
      us.hl = 0.35;
      return { u, us, Ms, Vs, PAC, MPAC, coag: c.coag || 'pac' };
    }

    /* ======================= XỬ LÝ BẬC 3 – OXY HÓA (Fenton, O₃, O₃/H₂O₂, UV/H₂O₂, ClO₂) =======================
       Hiệu suất khử COD trơ còn lại sau sinh học & hóa lý bậc 3 theo công nghệ (DATA.AOP, chỉnh ở tab 4); liều chất oxy hóa theo
       tỷ lệ với COD khử (Fenton: H₂O₂ ≈ 2,1 g/g; O₃ ≈ 3 g/g) – M&E 5th mục 6-8 (Advanced oxidation), 11-? (Ozone), 12-? (ClO₂). */
    function aopUnit(tech, Qd, sIn, sOut) {
      const A = DATA.AOP[tech];
      const u = new Unit(R, 'aop', 'OXH', 'Xử lý bậc 3 – oxy hóa ' + A.name, 'hoaly');
      const s0 = u.sec('0. Nước vào & hiệu suất — M&E 5th mục 6-8');
      s0.o('Q_tt', 'Lưu lượng đỉnh tính toán', Qd, 'm³/h', '', '', '[bio.Qpk3]', 'Qd');
      const CODi = s0.o('COD_vào', 'COD vào', sIn.COD, 'mg/L', 'Cột ⑥a', '', '[bal.COD6a]', 'CODin');
      const Ee = s0.i('η_COD', 'Hiệu suất khử COD', p.aop_E > 0 ? p.aop_E : A.E, '%', `${A.name}: điển hình ${A.E} %`, 'Thí nghiệm pilot / Jartest', 'E');
      s0.i('η_BOD', 'Thay đổi BOD₅ (âm = tăng do cắt mạch)', A.Ebod, '%', '', 'M&E mục 6-8', 'Ebod');
      s0.i('η_màu', 'Hiệu suất khử màu', A.Ecol, '%', '', '', 'Ecol');
      s0.i('η_TSS', 'Hiệu suất khử TSS', A.Etss, '%', tech === 'fenton' ? 'Lắng bùn sắt sau trung hòa' : '', '', 'Etss');
      s0.i('η_TP', 'Hiệu suất khử TP', A.Etp, '%', tech === 'fenton' ? 'Fe³⁺ kết tủa PO₄' : '', '', 'Etp');
      s0.i('log', 'Bất hoạt coliform', p.aop_log > 0 ? p.aop_log : A.log, 'log', '', 'M&E Ch.12', 'log');
      const dC = s0.o('ΔCOD', 'COD bị oxy hóa', CODi * Ee / 100, 'mg/L', 'COD_vào·η', '', '[CODin]*[E]/100', 'dC');
      const t = s0.i('t', 'Thời gian phản ứng / tiếp xúc', p.aop_t > 0 ? p.aop_t : A.t, 'phút', '', 'M&E mục 6-8', 't');
      Object.assign(sOut, {
        COD: sIn.COD * (1 - Ee / 100), BOD: Math.min(sIn.BOD * (1 - A.Ebod / 100), sIn.COD * (1 - Ee / 100) * 0.6), Color: sIn.Color * (1 - A.Ecol / 100),
        TSS: sIn.TSS * (1 - A.Etss / 100), TP: sIn.TP * (1 - A.Etp / 100), Coli: sIn.Coli * Math.pow(10, -(p.aop_log > 0 ? p.aop_log : A.log))
      });
      const X = { COD: '[aop.CODin]*(1-[aop.E]/100)', BOD: 'MIN([BOD6a]*(1-[aop.Ebod]/100),[aop.CODin]*(1-[aop.E]/100)*0.6)', Color: '[Color6a]*(1-[aop.Ecol]/100)', TSS: '[TSS6a]*(1-[aop.Etss]/100)', TP: '[TP6a]*(1-[aop.Etp]/100)', Coli: '[Coli6a]*10^(-[aop.log])' };
      let kW = 0, Ms = 0, Vs = 0, geom, dims;
      const box = (V, H) => { const a = ceilTo(Math.sqrt(V / H), 0.1); return a; };
      if (tech === 'fenton') {
        const s1 = u.sec('1. Phản ứng Fenton (pH 3)');
        const rH = s1.i('H₂O₂/ΔCOD', 'Tỷ lệ H₂O₂ / COD khử', p.fen_r, 'g/g', 'Tỷ lượng 2,125', 'Fenton', 'rH');
        const H2 = s1.o('C_H₂O₂', 'Liều H₂O₂ (100 %)', rH * dC, 'mg/L', 'r·ΔCOD', '', '[rH]*[dC]', 'H2O2');
        const FeH = s1.i('H₂O₂:Fe', 'Tỷ lệ khối lượng H₂O₂ : Fe²⁺', p.fen_FeH, 'g/g', '3 – 10', '', 'FeH');
        const Fe = s1.o('C_Fe²⁺', 'Liều Fe²⁺', H2 / FeH, 'mg/L', 'H₂O₂/(H₂O₂:Fe)', '', '[H2O2]/[FeH]', 'Fe');
        const FS = s1.o('C_FeSO₄', 'Liều FeSO₄·7H₂O', Fe * 278.0 / 55.85, 'mg/L', 'Fe·278/55,85', '', '[Fe]*278/55.85', 'FeSO4');
        const ac = s1.i('C_H₂SO₄', 'H₂SO₄ hạ pH về 3', p.fen_acid, 'mg/L', 'Chuẩn độ', '', 'acid');
        const Vr = s1.o('V_pư', 'Thể tích bể phản ứng', Qd * t / 60, 'm³', 'Q·t/60', '', '[Qd]*[t]/60', 'Vr');
        const s2 = u.sec('2. Trung hòa – keo tụ – lắng bùn sắt');
        const ba = s2.i('C_NaOH', 'NaOH trung hòa về pH 7,5', p.fen_base, 'mg/L', 'Chuẩn độ', '', 'base');
        const Vn = s2.o('V_TH', 'Thể tích bể trung hòa + tạo bông (20 phút)', Qd * 20 / 60, 'm³', 'Q·20/60', '', '[Qd]*20/60', 'Vn');
        const SOR = s2.i('SOR', 'Tải trọng bề mặt lắng bùn sắt', p.fen_SOR, 'm³/m²·ngđ', '16 – 24', 'Bảng 5-19', 'SOR');
        const As = s2.o('A_lắng', 'Diện tích lắng', Q / SOR, 'm²', 'Q/SOR', '', '[info.Q]/[SOR]', 'As');
        Ms = s2.o('M_bùn', 'Bùn Fe(OH)₃ + chất rắn tách', (Fe * 106.87 / 55.85 + sIn.TSS * A.Etss / 100) * Q / 1000, 'kg DS/ngđ', '(Fe·106,9/55,85 + ΔTSS)·Q', '', '([Fe]*106.87/55.85+[bal.TSS6a]*[Etss]/100)*[info.Q]/1000', 'Ms');
        Vs = s2.o('V_bùn', 'Lưu lượng bùn xả (2 % DS)', Ms / (1.03 * 1000 * 0.02), 'm³/ngđ', '', '', '[Ms]/(1.03*1000*0.02)', 'Vs');
        const H = 4, aR = box(Vr, H), aN = box(Vn, H), Ls = ceilTo(As / Math.max(aR, 3), 0.5);
        geom = { type: 'rect', L: aR + aN + Ls + 0.6, B: Math.max(aR, aN, 3), H: H + p.fb, fb: p.fb, n: 1, zones: [{ name: 'FENTON pH 3', len: aR }, { name: 'TRUNG HÒA', len: aN }, { name: 'LẮNG BÙN SẮT', len: Ls }], label: 'FENTON' };
        dims = `phản ứng ${fx(aR)}×${fx(aR)}; trung hòa ${fx(aN)}×${fx(aN)}; lắng ${fx(Ls)}×${fx(Math.max(aR, 3))} m`;
        kW = 0.03 * (Vr + Vn) + 1.5;
        R.chem.push({ name: 'H₂O₂ 50 % – Fenton', dose: H2 / 0.5, kg: H2 / 0.5 * Q / 1000, unit: 'kg dung dịch', price: 'p_H2O2', note: 'Jartest Fenton', ref: u.ids.H2O2, sol: 1, rho: 1.2 });
        R.chem.push({ name: 'FeSO₄·7H₂O – Fenton', dose: FS, kg: FS * Q / 1000, unit: 'kg sản phẩm', price: 'p_FeSO4', note: '', ref: u.ids.FeSO4, sol: 0.15, rho: 1.15 });
        R.chem.push({ name: 'H₂SO₄ 98 % – hạ pH Fenton', dose: ac / 0.98, kg: ac / 0.98 * Q / 1000, unit: 'kg sản phẩm', price: 'p_H2SO4', note: 'Chuẩn độ', ref: u.ids.acid, sol: 1, rho: 1.84 });
        R.chem.push({ name: 'NaOH 100 % – trung hòa sau Fenton', dose: ba, kg: ba * Q / 1000, unit: 'kg quy 100 %', price: 'p_NaOH', note: 'Chuẩn độ', ref: u.ids.base, sol: p.sol_NaOH, rho: p.rho_NaOH });
        R.equip.push({ u: u.name, name: 'Bơm định lượng H₂O₂ / FeSO₄ / H₂SO₄ / NaOH', spec: 'Theo liều bảng hóa chất; điều khiển pH, ORP', qty: 8, note: '4 + 4 dự phòng' });
        R.equip.push({ u: u.name, name: 'Máy khuấy bể Fenton / trung hòa', spec: `${fx(kW - 1.5)} kW`, qty: 3, note: '' });
        R.equip.push({ u: u.name, name: 'Cầu gạt + bơm bùn sắt', spec: `${fx(Vs / 8)} m³/h`, qty: 2, note: '1 + 1' });
      } else if (tech === 'o3' || tech === 'o3h2o2') {
        const s1 = u.sec('1. Ozone – liều, máy tạo O₃, tháp tiếp xúc');
        const r3 = s1.i('O₃/ΔCOD', 'Tỷ lệ O₃ / COD khử', p.o3_r, 'g/g', '2 – 4', 'M&E mục 6-8', 'rO3');
        const O3 = s1.o('C_O₃', 'Liều O₃ hòa tan', r3 * dC, 'mg/L', 'r·ΔCOD', '', '[rO3]*[dC]', 'O3');
        const MO3 = s1.o('M_O₃', 'O₃ tiêu thụ', O3 * Q / 1000, 'kg/ngđ', 'C·Q/1000', '', '[O3]*[info.Q]/1000', 'MO3');
        const G = s1.o('G_O₃', 'Công suất máy tạo O₃ (lưu lượng đỉnh, hiệu suất hấp thụ 90 %)', O3 * Qd / 1000 / 0.9, 'kg O₃/h', 'C·Q_đỉnh/0,9', '', '[O3]*[Qd]/1000/0.9', 'G');
        const e3 = s1.i('e', 'Điện năng tạo O₃', p.o3_kWh, 'kWh/kg O₃', '8 – 12 (từ oxy)', 'Catalogue', 'eO3');
        const wt = s1.i('%O₃', 'Nồng độ O₃ trong khí cấp', p.o3_wt, '% kl', '8 – 12', '', 'wt');
        const LOX = s1.o('M_O₂', 'Oxy lỏng cấp máy ozone', MO3 / 0.9 / (wt / 100), 'kg/ngđ', 'M_O₃/0,9/%O₃', '', '[MO3]/0.9/([wt]/100)', 'LOX');
        const V = s1.o('V_tx', 'Thể tích tháp tiếp xúc', Qd * t / 60, 'm³', 'Q·t/60', '', '[Qd]*[t]/60', 'V');
        const H = s1.i('H', 'Chiều cao tháp', p.o3_H, 'm', '5 – 7', '', 'H');
        kW = MO3 / 0.9 * e3 / 24 + 1.5;
        if (tech === 'o3h2o2') { const H2 = s1.o('C_H₂O₂', 'Liều H₂O₂ (100 %)', p.o3_h2o2 * O3, 'mg/L', '(H₂O₂/O₃)·O₃', '', `${p.o3_h2o2}*[O3]`, 'H2O2'); R.chem.push({ name: 'H₂O₂ 50 % – peroxone', dose: H2 / 0.5, kg: H2 / 0.5 * Q / 1000, unit: 'kg dung dịch', price: 'p_H2O2', note: '', ref: u.ids.H2O2, sol: 1, rho: 1.2 }); }
        const a = box(V, H);
        geom = { type: 'rect', L: a * 2 + 0.3, B: a, H: H + 0.5, fb: 0.5, n: 1, zones: [{ name: 'TIẾP XÚC O₃ 1', len: a }, { name: 'TIẾP XÚC O₃ 2', len: a }], label: 'OZONE' };
        dims = `2 ngăn ${fx(a)}×${fx(a)} m, H ${fx(H)} m`;
        R.chem.push({ name: 'Oxy lỏng (LOX) – máy tạo ozone', dose: LOX / Q * 1000, kg: LOX, unit: 'kg', price: 'p_LOX', note: '', ref: u.ids.LOX, sol: 1, rho: 1.14 });
        R.equip.push({ u: u.name, name: 'Máy tạo ozone (nguồn oxy)', spec: `${fx(G)} kg O₃/h; ${fx(G * e3)} kW`, qty: 2, note: '1 + 1' });
        R.equip.push({ u: u.name, name: 'Đĩa khuếch tán ozone + bộ phân hủy O₃ dư', spec: '', qty: 1, note: 'Khí thải O₃ < 0,1 ppm' });
      } else if (tech === 'uvh2o2') {
        const s1 = u.sec('1. UV/H₂O₂');
        const H2 = s1.i('C_H₂O₂', 'Liều H₂O₂ (100 %)', p.uv_h2o2, 'mg/L', '10 – 50', 'M&E mục 6-8', 'H2O2');
        const eU = s1.i('E_UV', 'Điện năng riêng', p.uv_kWh, 'kWh/m³', 'EEO', 'Catalogue', 'eUV');
        const n = s1.o('n', 'Số lò phản ứng UV (150 m³/h/lò) + 1 dự phòng', Math.ceil(Qd / 150 - 1e-9) + 1, 'lò', '', '', 'ROUNDUP([Qd]/150,0)+1', 'n');
        kW = eU * Q / 24;
        geom = { type: 'rect', L: Math.max(6, n * 1.6 + 3), B: 3, H: 2.5, fb: 0.3, n: 1, zones: [{ name: 'LÒ UV/H₂O₂', len: Math.max(6, n * 1.6 + 3) }], label: 'UV/H₂O₂' };
        dims = `${n} lò UV kín; H₂O₂ ${fx(H2)} mg/L`;
        R.chem.push({ name: 'H₂O₂ 50 % – UV/H₂O₂', dose: H2 / 0.5, kg: H2 / 0.5 * Q / 1000, unit: 'kg dung dịch', price: 'p_H2O2', note: '', ref: u.ids.H2O2, sol: 1, rho: 1.2 });
        R.equip.push({ u: u.name, name: 'Lò phản ứng UV áp suất trung bình', spec: `150 m³/h/lò; ${fx(kW / Math.max(n - 1, 1))} kW`, qty: n, note: '', spare: 'uvlamp' });
      } else {
        const s1 = u.sec('1. ClO₂ điều chế từ NaClO₂ + HCl');
        const d = s1.i('C_ClO₂', 'Liều ClO₂', p.clo2_dose, 'mg/L', '2 – 10', 'M&E mục 12-5', 'ClO2');
        const pur = s1.i('%NaClO₂', 'Độ tinh khiết NaClO₂', p.clo2_pur, 'kg/kg', '', '', 'pur');
        const Na = s1.o('C_NaClO₂', 'Liều NaClO₂ thương phẩm', d * 1.675 / pur, 'mg/L', '5NaClO₂ + 4HCl → 4ClO₂: 1,675 g/g', 'M&E mục 12-5', '[ClO2]*1.675/[pur]', 'NaClO2');
        const HC = s1.o('C_HCl', 'Liều HCl 33 %', d * 0.54 / 0.33, 'mg/L', '0,54 g HCl/g ClO₂', '', '[ClO2]*0.54/0.33', 'HCl');
        s1.o('ClO₂⁻', 'Clorit sinh ra (ước tính 60 % liều)', d * 0.6, 'mg/L', 'Kiểm soát sản phẩm phụ', 'M&E mục 12-5', '[ClO2]*0.6', 'chlorite');
        const V = s1.o('V_tx', 'Thể tích bể tiếp xúc', Qd * t / 60, 'm³', 'Q·t/60', '', '[Qd]*[t]/60', 'V');
        const H = 3, a = box(V, H);
        geom = { type: 'rect', L: a * 1.5, B: a / 1.5, H: H + p.fb, fb: p.fb, n: 1, serp: 3, zones: [{ name: 'TIẾP XÚC ClO₂', len: a * 1.5 }], label: 'ClO₂' };
        dims = `${fx(a * 1.5)} × ${fx(a / 1.5)} × ${fx(H)} m`; kW = 1.5;
        R.chem.push({ name: 'NaClO₂ 80 % – điều chế ClO₂', dose: Na, kg: Na * Q / 1000, unit: 'kg sản phẩm', price: 'p_NaClO2', note: '', ref: u.ids.NaClO2, sol: 0.25, rho: 1.2 });
        R.chem.push({ name: 'HCl 33 % – điều chế ClO₂', dose: HC, kg: HC * Q / 1000, unit: 'kg dung dịch', price: 'p_HCl', note: '', ref: u.ids.HCl, sol: 1, rho: 1.16 });
        R.equip.push({ u: u.name, name: 'Máy điều chế ClO₂ (NaClO₂ + HCl)', spec: `${fx(d * Qd / 1000)} kg ClO₂/h`, qty: 2, note: '1 + 1' });
      }
      u.geom = geom; u.dims = dims; u.hrt = `${fx(t)} phút`; u.kW = kW; u.hl = 0.3; u.H = geom.H - geom.fb;
      u.A = geom.L * geom.B; u.V = u.A * u.H; u.sludge = Ms; u.sludgeV = Vs;
      return { u, X, Ms, Vs };
    }

    /* ======================= XỬ LÝ YẾM KHÍ CẤP 1 — M&E 5th Ch.10 =======================
       Công nghệ huyền phù (Complete-mix, ACP, ASBR): SRT theo động học methane hóa (μ, b, K_s – M&E Ch.10, Ch.7), SRT = SF·SRT_min;
       công nghệ bùn hạt / màng bám (UASB, EGSB, IC, ABR, AMBR, AF): tải trọng hữu cơ thể tích theo công nghệ & nhiệt độ (M&E Ch.10),
       vận tốc nước dâng, chiều cao bể; hiệu suất khử bCOD hòa tan điển hình giảm khi nhiệt độ < 25 °C.
       Khí CH₄: 0,35 L/g COD ở 0 °C, 1 atm (M&E PT 10-?) · COD_CH₄ = ΔbCOD − 1,42·P_X,bio − 0,67·SO₄ khử; CH₄ hòa tan thất thoát theo nước ra.
       Độ kiềm bicarbonat yêu cầu theo cân bằng CO₂: [HCO₃⁻] = K₁·K_H·p_CO₂/[H⁺] (M&E VD 10-?). */
    function anaerobic(tech, sIn) {
      const A = DATA.ANA[tech], susp = A.kind === 'susp';
      const u = new Unit(R, 'ana', 'YK', 'Xử lý sinh học yếm khí cấp 1 – ' + A.name, 'sinhhoc');
      const Ta = p.ana_T > 0 ? +p.ana_T : T, heat = Ta > T + 0.05;
      const s0 = u.sec('1. Nước thải vào & tải lượng — M&E 5th Ch.10');
      s0.o('Q', 'Lưu lượng', Q, 'm³/ngđ', '', '', '[info.Q]', 'Q');
      const COD = s0.o('COD_vào', 'COD vào', sIn.COD, 'mg/L', 'Cột ③', '', '[bal.COD3]', 'CODin');
      const BOD = s0.o('BOD_vào', 'BOD₅ vào', sIn.BOD, 'mg/L', '', '', '[bal.BOD3]', 'BODin');
      const TSS = s0.o('TSS_vào', 'TSS vào', sIn.TSS, 'mg/L', '', '', '[bal.TSS3]', 'TSSin');
      s0.o('TKN_vào', 'TKN vào', sIn.TKN, 'mg/L', '', '', '[bal.TKN3]', 'TKNin');
      s0.o('Alk_vào', 'Độ kiềm vào', sIn.Alk, 'mg/L CaCO₃', '', '', '[bal.Alk3]', 'Alkin');
      const Lc = s0.o('L_COD', 'Tải lượng COD', Q * COD / 1000, 'kg COD/ngđ', 'Q·COD', '', '[Q]*[CODin]/1000', 'LCOD');
      s0.i('T', 'Nhiệt độ vận hành bể yếm khí', Ta, '°C', heat ? `Gia nhiệt từ ${fx(T)} °C` : 'Nhiệt độ nước thải thấp nhất (không gia nhiệt)', 'M&E Ch.10', 'Ta');
      if (COD < 1000 && !['UASB', 'AF', 'ABR'].includes(tech)) warn(`Yếm khí ${A.short}: COD vào ${fx(COD)} mg/L thấp – công nghệ phù hợp với nước thải COD > 1.500 – 2.000 mg/L (M&E Ch.10); cân nhắc UASB hoặc bỏ cấp yếm khí.`);
      if (Ta < 20) warn(`Yếm khí ${A.short}: nhiệt độ ${fx(Ta)} °C thấp – tải trọng giảm mạnh, cân nhắc gia nhiệt (thông số "Nhiệt độ vận hành" ở tab 4).`);
      // phân đoạn COD (M&E Ch.8 – cùng tỷ lệ tab 4)
      const sf = u.sec('2. Phân đoạn COD & chất rắn');
      const bCOD = sf.o('bCOD', 'COD phân hủy sinh học', Math.min(COD, p.bcod_bod * BOD), 'mg/L', '(bCOD/BOD)·BOD', 'M&E VD 8-3', 'MIN([CODin],[info.rBOD]*[BODin])', 'bCOD');
      const sCOD = Math.min(COD, p.scod_cod * COD), nbsCOD = Math.min(Math.max(0, ch.nbsCOD), sCOD);
      const bsCOD = sf.o('bsCOD', 'bCOD hòa tan', Math.max(0, Math.min(bCOD, sCOD - nbsCOD)), 'mg/L', 'sCOD − nbsCOD', '', null, 'bsCOD');
      const bpCOD = sf.o('bpCOD', 'bCOD dạng hạt', Math.max(0, bCOD - bsCOD), 'mg/L', 'bCOD − bsCOD', '', '[bCOD]-[bsCOD]', 'bpCOD');
      sf.o('nbsCOD', 'COD hòa tan không phân hủy', nbsCOD, 'mg/L', '', 'M&E VD 8-3', null, 'nbsCOD');
      const VSS = TSS * p.vss_tss, iTSS = TSS - VSS, bpVSS = Math.min(VSS, bpCOD / 1.42), nbVSS = Math.max(0, VSS - bpVSS);
      sf.o('nbVSS', 'VSS không phân hủy', nbVSS, 'mg/L', 'VSS − bpCOD/1,42', '', null, 'nbVSS');
      sf.o('iTSS', 'Chất rắn vô cơ', iTSS, 'mg/L', 'TSS·(1 − VSS/TSS)', '', null, 'iTSS');
      // động học methane hóa (M&E Ch.10: μ_max = 0,30 1/ngày ở 35 °C, θ = 1,07; b = 0,03; Y = 0,08 g VSS/g COD)
      const sk = u.sec('3. Động học & tuổi bùn (SRT) — M&E 5th Ch.10');
      const Y = sk.i('Y', 'Hệ số sản lượng sinh khối yếm khí', p.ana_Y, 'g VSS/g COD', '0,05 – 0,10', 'M&E Bảng 10-?', 'Y');
      const muT = sk.o('μ_max,T', 'Tốc độ sinh trưởng cực đại vi khuẩn methane (ở T)', p.ana_mu * Math.pow(1.07, Ta - 35), '1/ngày', 'μ₃₅·1,07^(T−35)', 'M&E Ch.10', null, 'muT');
      const bT = sk.o('b_T', 'Hệ số phân hủy nội bào (ở T)', p.ana_b * Math.pow(1.04, Ta - 35), '1/ngày', 'b₃₅·1,04^(T−35)', 'M&E Ch.10', null, 'bT');
      const Ks = sk.i('K_s', 'Hằng số bán bão hòa', p.ana_Ks, 'mg COD/L', '', 'M&E Ch.10', 'Ks');
      const SRTmin = sk.o('SRT_min', 'SRT tối thiểu', 1 / Math.max(muT - bT, 1e-3), 'ngày', '1/(μ − b)', 'M&E PT (7-71)', '1/([muT]-[bT])', 'SRTmin');
      sk.i('SF', 'Hệ số an toàn SRT', p.ana_SF, '-', '2 – 4', 'M&E Ch.10', 'SF');
      let SRT;
      if (susp) SRT = sk.o('SRT', 'SRT thiết kế', Math.max(p.ana_SRT > 0 ? +p.ana_SRT : p.ana_SF * SRTmin, tech === 'CSTR' ? 10 : 5), 'ngày', p.ana_SRT > 0 ? 'Nhập (tab 4)' : 'SF·SRT_min (≥ 10 ngày bể khuấy trộn)', 'M&E Ch.10, 13', null, 'SRT');
      else if (tech === 'UASB') {
        // SRT theo cân bằng khối bùn: X_VSS·V_pư = P_X,VSS(SRT)·SRT (bảng tính UASB dùng Goal Seek; phần mềm giải chia đôi)
        const fT0 = clamp(Math.pow(1.11, Ta - 30), 0.15, 1.35), OLR0 = p.ana_OLR > 0 ? +p.ana_OLR : A.OLR * fT0;
        const Hp0 = p.ana_H > 0 ? +p.ana_H : A.H, v0 = p.ana_vup > 0 ? +p.ana_vup : A.vup;
        const Vp0 = Math.max(Q * COD / 1000 / OLR0, Q / 24 / v0 * Hp0, Qpk_eff / (A.vupPk || 2 * v0) * Hp0);
        const E0 = p.ana_E > 0 ? p.ana_E / 100 : A.E * (1 - 0.015 * Math.max(0, 25 - Ta)), kh0 = 0.10 * Math.pow(1.04, Ta - 35);
        const Mof = S => { const f_ = kh0 * S / (1 + kh0 * S), d_ = bsCOD * E0 + bpCOD * A.cap * f_; return (Y * Q * d_ / 1000 / (1 + bT * S) * (1 + p.ana_fd * bT * S) + (nbVSS + bpVSS * (1 - f_)) * A.cap * Q / 1000) * S; };
        const Xg = sk.i('X_VSS', 'VSS trung bình trong thể tích phản ứng', p.ana_Xg, 'mg/L', 'M&E: 35.000 – 40.000; bảng tính mẫu 30.000', 'M&E VD 10-2', 'Xg');
        const Mx = sk.o('M_VSS', 'Khối VSS giữ trong bể (X_VSS·V_pư)', Xg * Vp0 / 1000, 'kg VSS', 'V_pư tính ở mục 5', 'M&E VD 10-2', null, 'MVSS');
        let lo = 0.5, hi = 5000;
        for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); if (Mof(m) > Mx) hi = m; else lo = m; }
        SRT = sk.o('SRT', 'SRT theo cân bằng khối bùn (X·V = P_X,VSS·SRT)', Math.sqrt(lo * hi), 'ngày', 'Giải chia đôi – thay Goal Seek của bảng tính', 'M&E VD 10-2; bảng tính UASB', null, 'SRT');
      }
      else SRT = sk.i('SRT', 'Tuổi bùn hạt / màng bám (ước tính)', p.ana_SRTg, 'ngày', 'Bùn hạt giữ lại > 50 – 100 ngày', 'M&E Ch.10', 'SRT');
      sk.chk('SRT ≥ SF·SRT_min', SRT >= p.ana_SF * SRTmin - 1e-6, 'ĐẠT', 'SRT thấp – nguy cơ rửa trôi vi khuẩn methane', 'M&E Ch.10', !susp, '[SRT]>=[SF]*[SRTmin]');
      const kh = 0.10 * Math.pow(1.04, Ta - 35), fh = kh * SRT / (1 + kh * SRT);
      sk.o('f_h', 'Phần bCOD dạng hạt bị thủy phân', fh, '-', 'k_h·SRT/(1 + k_h·SRT), k_h = 0,10·1,04^(T−35)', 'M&E Ch.10, 13', null, 'fh');
      // tải trọng & hiệu suất
      const sl = u.sec('4. Tải trọng hữu cơ thiết kế & hiệu suất');
      const fT = clamp(Math.pow(1.11, Ta - 30), 0.15, 1.35);
      const OLR = sl.o('OLR', 'Tải trọng hữu cơ thể tích thiết kế', p.ana_OLR > 0 ? +p.ana_OLR : A.OLR * fT, 'kg COD/m³·ngđ', p.ana_OLR > 0 ? 'Nhập (tab 4)' : `${fx(A.OLR)} (30 °C) × 1,11^(T−30); dải ${A.OLRr[0]} – ${A.OLRr[1]}`, 'M&E 5th Ch.10 (bảng tải trọng)', null, 'OLR');
      let Se, E;
      if (susp) {
        Se = sl.o('S_e', 'bCOD hòa tan còn lại', Math.min(bsCOD, Ks * (1 + bT * SRT) / Math.max(SRT * (muT - bT) - 1, 1e-3)), 'mg/L', 'K_s(1 + b·SRT)/[SRT(μ − b) − 1]', 'M&E PT (7-46)', null, 'Se');
        E = bsCOD > 0 ? 1 - Se / bsCOD : 1;
      } else {
        E = p.ana_E > 0 ? p.ana_E / 100 : A.E * (1 - 0.015 * Math.max(0, 25 - Ta));
        sl.o('E_s', 'Hiệu suất khử bCOD hòa tan', E * 100, '%', p.ana_E > 0 ? 'Nhập (tab 4)' : `${fx(A.E * 100)} % × (1 − 1,5 %/°C dưới 25 °C)`, 'M&E Ch.10', null, 'Es');
        Se = sl.o('S_e', 'bCOD hòa tan còn lại', bsCOD * (1 - E), 'mg/L', 'bsCOD·(1 − E)', '', '[bsCOD]*(1-[Es]/100)', 'Se');
      }
      const fcap = tech === 'CSTR' ? 0 : A.cap;
      sl.o('f_giữ', 'Phần chất rắn được giữ lại trong bể', fcap, '-', tech === 'CSTR' ? 'Bể khuấy trộn: chất rắn ra theo nước (HRT = SRT)' : 'Lắng / lớp bùn / giá thể', 'M&E Ch.10', null, 'fcap');
      const dB = sl.o('ΔbCOD', 'bCOD được chuyển hóa', (bsCOD - Se) + bpCOD * (tech === 'CSTR' ? fh : fcap * fh), 'mg/L', '(bsCOD − S_e) + bpCOD·f_giữ·f_h', '', null, 'dB');
      const Pbio = sl.o('P_X,bio', 'Sinh khối yếm khí sinh ra', Y * Q * dB / 1000 / (1 + bT * SRT) * (1 + p.ana_fd * bT * SRT), 'kg VSS/ngđ', 'Y·Q·ΔbCOD/(1 + b·SRT)·(1 + f_d·b·SRT)', 'M&E PT (8-15) áp dụng yếm khí', null, 'Pbio');
      // kích thước
      const sv = u.sec('5. Kích thước bể — ' + A.name);
      const n = Math.max(1, Math.round(p.ana_n));
      sv.i('n', 'Số bể / đơn nguyên', n, 'bể', '', '', 'n');
      const H = sv.i('H', tech === 'UASB' ? 'Chiều cao thể tích phản ứng (lớp bùn)' : 'Chiều cao công tác bể', p.ana_H > 0 ? +p.ana_H : A.H, 'm', p.ana_H > 0 ? 'Nhập (tab 4)' : `Điển hình ${A.Hr}`, tech === 'UASB' ? 'M&E Bảng 10-17' : 'M&E Ch.10', 'H');
      const Hx = tech === 'UASB' ? sv.o('H_tổng', 'Tổng chiều cao bể (phản ứng + nước trong + GSS)', H + p.ana_Hcl + p.ana_Hgss, 'm', `H + ${fx(p.ana_Hcl)} + ${fx(p.ana_Hgss)}`, 'M&E VD 10-2', `[H]+${p.ana_Hcl}+${p.ana_Hgss}`, 'Ht') : H;
      const V_OLR = sv.o('V_OLR', 'Thể tích theo tải trọng hữu cơ', Lc / OLR, 'm³', 'L_COD/OLR', 'M&E Ch.10', '[LCOD]/[OLR]', 'VOLR');
      let V = V_OLR, Asec = 0, vup = 0, Qrec = 0, gov = 'tải trọng hữu cơ', extra = {};
      const Qh = Q / 24, Qpk = Qpk_eff;
      if (tech === 'CSTR') {
        const Vs = sv.o('V_SRT', 'Thể tích theo SRT (HRT = SRT)', Q * SRT, 'm³', 'Q·SRT', 'M&E Ch.10', '[Q]*[SRT]', 'VSRT');
        if (Vs > V) { V = Vs; gov = 'SRT (HRT = SRT)'; }
        sv.o('P_khuấy', 'Công suất khuấy trộn (5 – 8 W/m³)', 6 * V / 1000, 'kW', '6 W/m³·V', 'M&E Ch.13', null, 'Pmix');
      } else if (tech === 'ACP' || tech === 'ASBR') {
        const X = sv.i('X_VSS', 'Nồng độ VSS trong bể', p.ana_X, 'mg/L', tech === 'ACP' ? '4.000 – 8.000' : '5.000 – 15.000', 'M&E Ch.10', 'X');
        const Mvss = Pbio + (nbVSS + bpVSS * (1 - fh)) * fcap * Q / 1000;
        const Vs = sv.o('V_SRT', 'Thể tích theo khối bùn (P_X,VSS·SRT/X)', Mvss * SRT * 1000 / X, 'm³', 'P_X,VSS·SRT/X', 'M&E PT (7-57)', null, 'VSRT');
        if (Vs > V) { V = Vs; gov = 'khối bùn (SRT)'; }
        const Vh = Q * A.HRTmin / 24;
        if (Vh > V) { V = Vh; gov = 'thời gian lưu tối thiểu ' + A.HRTmin + ' h'; }
        if (tech === 'ACP') {
          const SOR = sv.i('SOR', 'Tải trọng bề mặt bể lắng sau khử khí', p.ana_SOR, 'm/h', '0,5 – 1,0', 'M&E Ch.10', 'SOR');
          const Acl = sv.o('A_lắng', 'Diện tích bể lắng', Qpk / SOR, 'm²', 'Q_đỉnh/SOR', '', null, 'Acl');
          const Rr = sv.i('R', 'Tỷ lệ tuần hoàn bùn', p.ana_R, '× Q', '0,5 – 1,5', 'M&E Ch.10', 'Rr');
          extra.Acl = Acl; extra.RAS = Rr * Q;
          sv.note('Bể tiếp xúc khuấy trộn → thiết bị khử khí (chân không / sục) → bể lắng; bùn tuần hoàn về bể tiếp xúc (M&E Ch.10).');
        } else {
          const nc = sv.i('n_c', 'Số chu kỳ / ngày', p.ana_nc, 'chu kỳ', '2 – 6 (nạp – phản ứng – lắng – xả)', 'M&E Ch.10', 'nc');
          const VF = sv.o('V_F/V', 'Tỷ lệ thể tích nạp mỗi chu kỳ', Q / nc / V, '-', 'Q/(n_c·V)', '', null, 'VF');
          sv.chk('V_F/V ≤ 0,5 (giữ lớp bùn khi xả)', VF <= 0.5 + 1e-6, 'ĐẠT', 'Tăng thể tích / số chu kỳ', 'M&E Ch.10', true);
          extra.nc = nc;
        }
      } else {
        const vmax = p.ana_vup > 0 ? +p.ana_vup : A.vup;
        if (tech === 'EGSB' || tech === 'IC') {
          Asec = V / Math.max(H, 1);
          vup = vmax; Qrec = Math.max(0, vmax * Asec - Qh) * 24;
          sv.o('A', 'Tiết diện bể (theo V_OLR/H)', Asec, 'm²', 'V/H', '', null, 'A');
          sv.o('v_lên', 'Vận tốc nước dâng thiết kế', vmax, 'm/h', `${A.vupR} m/h`, 'M&E Ch.10', null, 'vup');
          sv.o('Q_tuần hoàn', tech === 'IC' ? 'Tuần hoàn ngoài bổ sung (ngoài tuần hoàn nội do khí)' : 'Lưu lượng tuần hoàn để đạt v_lên', Qrec, 'm³/ngđ', 'v·A − Q', 'M&E Ch.10', null, 'Qrec');
          if (tech === 'IC') sv.note('IC: 2 tầng (ngăn dưới tải cao + ngăn trên đánh bóng); khí ở tầng dưới đẩy hỗn hợp lên ống dâng → bình tách khí → ống hồi xuống đáy (tuần hoàn nội không tốn năng lượng).');
        } else {
          const Ar = sv.o('A_v', 'Tiết diện theo vận tốc nước dâng', Qh / vmax, 'm²', `Q_h/v_lên (${A.vupR} m/h)`, 'M&E Ch.10', null, 'Av');
          const Apk = Qpk / (A.vupPk || vmax * 2);
          const Hr = tech === 'UASB' ? H : Math.max(H - 0.5, 1);
          Asec = Math.max(V_OLR / Hr, Ar, Apk);
          if (Asec > V_OLR / Hr + 1e-6) gov = Asec === Apk ? 'vận tốc nước dâng giờ cao điểm' : 'vận tốc nước dâng';
          if (tech === 'ABR' || tech === 'AMBR') {
            const nc = Math.max(3, Math.round(p.ana_comp));
            sv.i('n_ngăn', 'Số ngăn nối tiếp', nc, 'ngăn', '4 – 8', 'M&E Ch.10', 'ncomp');
            Asec = Math.max(V_OLR / Hr, Qh / vmax * nc * 1.3, Qpk / (vmax * 2) * nc * 1.3);   // mỗi ngăn: phần dòng lên + ống/ngăn xuống (~30 %)
            sv.note(tech === 'ABR' ? 'ABR: các ngăn vách hướng dòng lên – xuống nối tiếp, bùn giữ lại theo từng ngăn (không cần tách khí – lắng riêng).' : 'AMBR: các ngăn nối tiếp có khuấy cơ khí chậm, đổi chiều dòng định kỳ để lớp bùn di chuyển và không tích tụ ở ngăn cuối.');
          }
          V = Asec * H; if (V > V_OLR / Hr * H + 1e-6 && gov === 'tải trọng hữu cơ') gov = 'vận tốc nước dâng';
          vup = Qh / (tech === 'ABR' || tech === 'AMBR' ? Asec / (Math.max(3, Math.round(p.ana_comp)) * 1.3) : Asec);
          sv.o('A', 'Tổng tiết diện bể', Asec, 'm²', 'max(V_OLR/H_pư; Q/v)', '', null, 'A');
          sv.o('v_lên', 'Vận tốc nước dâng trung bình', vup, 'm/h', `≤ ${fx(vmax)} m/h`, 'M&E Ch.10', null, 'vup');
          if (tech === 'UASB') {
            const nIn = Math.ceil(Asec / p.ana_aIn);
            sv.o('n_vào', 'Số điểm phân phối nước vào', nIn, 'điểm', `1 điểm / ${fx(p.ana_aIn)} m²`, 'M&E Ch.10', null, 'nIn');
            sv.note(`UASB: V_pư = max(Q·H/v; Q·COD/OLR); trên vùng phản ứng là vùng nước trong ${fx(p.ana_Hcl)} m và bộ tách khí – lỏng – rắn (GSS) ${fx(p.ana_Hgss)} m; vận tốc qua khe vào ngăn lắng ≤ 0,7 – 1,0 m/h; nước ra qua máng răng cưa.`);
            extra.nIn = nIn;
          }
          if (tech === 'AF') {
            const Vm = sv.o('V_giá thể', 'Thể tích giá thể', V * 0.8, 'm³', '80 % chiều cao bể', 'M&E Ch.10', null, 'Vm');
            sv.o('A_giá thể', 'Diện tích bề mặt giá thể', Vm * p.ana_aspec, 'm²', 'a = ' + p.ana_aspec + ' m²/m³', 'M&E Ch.10', null, 'Am');
            extra.Vm = Vm;
          }
        }
        if (V < V_OLR) V = V_OLR;
      }
      const Vd = sv.o('V', 'Thể tích bể thiết kế (tổng)', V, 'm³', 'Lớn nhất của các tiêu chí – theo ' + gov, '', null, 'Vd');
      const HRT = sv.o('HRT', 'Thời gian lưu nước', V / Q * 24, 'h', 'V/Q', '', '[Vd]/[Q]*24', 'HRT');
      sv.o('OLR_tt', 'Tải trọng hữu cơ thực tế', Lc / V, 'kg COD/m³·ngđ', '', '', '[LCOD]/[Vd]', 'OLRa');
      sv.chk(`OLR thực tế trong dải ${A.OLRr[0]} – ${A.OLRr[1]} kg COD/m³·ngđ (30 °C)`, Lc / V <= A.OLRr[1] * Math.max(fT, 0.5) + 1e-6, 'ĐẠT', 'Vượt tải – tăng thể tích', 'M&E Ch.10', true);
      const round = tech === 'CSTR' || tech === 'EGSB' || tech === 'IC';
      const A1 = V / H / n, Dd = round ? ceilTo(Math.sqrt(4 * A1 / PI), 0.5) : 0, B = round ? 0 : ceilTo(Math.sqrt(A1 / (tech === 'ABR' || tech === 'AMBR' ? 3 : tech === 'UASB' ? Math.max(1, p.ana_LW) : 1)), 0.5), Lb = round ? 0 : ceilTo(A1 / B, 0.5);
      if (round) sv.o('D', 'Đường kính mỗi bể', Dd, 'm', '√(4V/(π·H·n))', '', null, 'D');
      else { sv.o('B', 'Chiều rộng mỗi bể', B, 'm', '', '', null, 'B'); sv.o('L', 'Chiều dài mỗi bể', Lb, 'm', '', '', null, 'L'); }
      // nước ra
      const so = u.sec('6. Chất lượng nước sau xử lý yếm khí');
      const pSol = (nbVSS + bpVSS * (1 - (tech === 'CSTR' ? fh : fh))) * (1 - fcap);
      const Xe = tech === 'CSTR' ? Pbio * 1000 / Q : Pbio * 1000 / Q * (1 - fcap);
      let TSSo = iTSS * (1 - fcap) + pSol + Xe / 0.85;
      const TSSp = p.ana_TSSe > 0 ? +p.ana_TSSe : null;
      if (TSSp !== null && tech !== 'CSTR') TSSo = Math.min(TSSo, TSSp) === TSSo ? TSSo : TSSp;
      const VSSo = Math.min(TSSo, pSol + Xe);
      const st = { ...sIn };
      st.TSS = so.o('TSS_ra', 'TSS ra', TSSo, 'mg/L', tech === 'CSTR' ? 'Bể khuấy trộn: chất rắn ra theo nước' : 'iTSS·(1 − f_giữ) + VSS còn lại + sinh khối trôi ra', 'M&E Ch.10', null, 'TSS_ra');
      st.COD = so.o('COD_ra', 'COD ra', Math.min(COD, nbsCOD + Se + 1.42 * VSSo), 'mg/L', 'nbsCOD + S_e + 1,42·VSS_ra', 'M&E Ch.10', null, 'COD_ra');
      st.BOD = so.o('BOD_ra', 'BOD₅ ra', Math.min(BOD, (Se + 0.6 * 1.42 * VSSo) / p.bcod_bod), 'mg/L', '(S_e + 0,6·1,42·VSS_ra)/(bCOD/BOD)', '', null, 'BOD_ra');
      const Nup = 0.12 * Pbio * (tech === 'CSTR' ? 0 : fcap) * 1000 / Q + 0.07 * (nbVSS + bpVSS * (1 - fh)) * fcap;
      st.TKN = so.o('TKN_ra', 'TKN ra', Math.max(0, sIn.TKN - Nup), 'mg/L', 'TKN − N trong bùn giữ lại', '', null, 'TKN_ra');
      st.NH4 = so.o('NH4_ra', 'NH₄-N ra (amoni hóa N hữu cơ)', Math.min(st.TKN, Math.max(sIn.NH4, st.TKN - 0.12 * VSSo - 1.5)), 'mg/L', 'TKN_ra − N hữu cơ còn lại', 'M&E Ch.10', null, 'NH4_ra');
      st.NO3 = so.o('NO3_ra', 'NO₃-N ra', 0, 'mg/L', 'Bị khử trong môi trường yếm khí', '', null, 'NO3_ra');
      st.TN = so.o('TN_ra', 'Tổng N ra', st.TKN, 'mg/L', '', '', '[TKN_ra]+[NO3_ra]', 'TN_ra');
      st.TP = so.o('TP_ra', 'TP ra', Math.max(0.1, sIn.TP - (0.02 * Pbio * (tech === 'CSTR' ? 0 : fcap) * 1000 / Q + 0.01 * (nbVSS + bpVSS * (1 - fh)) * fcap)), 'mg/L', 'TP − P trong bùn giữ lại', '', null, 'TP_ra');
      st.OG = so.o('OG_ra', 'Dầu mỡ ra', sIn.OG * 0.6, 'mg/L', '60 % (phân hủy / giữ lại một phần)', 'Giả thiết', null, 'OG_ra');
      st.Color = so.o('Color_ra', 'Độ màu ra', sIn.Color, 'Pt/Co', 'Không đổi', '', '[bal.Color3]', 'Color_ra');
      st.Coli = so.o('Coli_ra', 'Coliform ra', sIn.Coli * 0.3, 'MPN/100mL', '≈ 0,5 log', 'Giả thiết', null, 'Coli_ra');
      // khí sinh học
      const sg = u.sec('7. Khí sinh học (biogas) & năng lượng — M&E Ch.10, 13');
      const SO4 = sg.i('SO₄', 'Sulfat trong nước thải', p.ana_SO4, 'mg/L', 'Nhập theo phân tích (0 = không xét)', '', 'SO4');
      const SO4r = Math.min(SO4 * 0.9, dB / 0.67);
      const CODs = sg.o('COD_SO₄', 'COD tiêu thụ cho khử sulfat', 0.67 * SO4r * Q / 1000, 'kg/ngđ', '0,67 g COD/g SO₄ khử', 'M&E Ch.10', null, 'CODs');
      const CODm = sg.o('COD_CH₄', 'COD chuyển thành CH₄', Math.max(0, Q * dB / 1000 - 1.42 * Pbio - CODs), 'kg/ngđ', 'Q·ΔbCOD − 1,42·P_X,bio − COD_SO₄', 'M&E VD 10-?', '[Q]*[dB]/1000-1.42*[Pbio]-[CODs]', 'CODm');
      const vT = 0.35 * (273.15 + Ta) / 273.15;
      sg.o('y_CH₄', 'Thể tích CH₄ / g COD ở T', vT, 'L/g COD', '0,35·(273,15 + T)/273,15', 'M&E PT (10-?)', null, 'yCH4');
      const CH4d = sg.i('CH₄_hòa tan', 'CH₄ hòa tan theo nước ra', p.ana_CH4d, 'mg/L', '≈ 15 – 20 mg/L ở 25 – 35 °C (bão hòa)', 'M&E Ch.10', 'CH4d');
      const VCH4 = sg.o('V_CH₄', 'Thể tích CH₄ thu được', Math.max(0, CODm - 4 * CH4d * Q / 1000) * vT, 'm³/ngđ', '(COD_CH₄ − 4·CH₄_ht·Q)·y', 'M&E VD 10-?', '([CODm]-4*[CH4d]*[Q]/1000)*[yCH4]', 'VCH4');
      const fC = sg.i('f_CH₄', 'Tỷ lệ CH₄ trong biogas', p.ana_fCH4, '-', '0,60 – 0,75', 'M&E Ch.10', 'fCH4');
      const Vg = sg.o('V_biogas', 'Lưu lượng biogas', VCH4 / fC, 'm³/ngđ', 'V_CH₄/f_CH₄', '', '[VCH4]/[fCH4]', 'Vg');
      const VCH4s = VCH4 * 273.15 / (273.15 + Ta);
      const Ekwh = sg.o('E_biogas', 'Năng lượng hóa học CH₄', VCH4s * 35.85 / 3.6, 'kWh/ngđ', 'V_CH₄,0°C·35,85 MJ/m³', 'M&E Ch.13', null, 'Eg');
      const Eel = sg.o('E_điện', 'Điện năng phát được (máy phát biogas)', Ekwh * p.ana_eCHP, 'kWh/ngđ', 'η_điện = ' + p.ana_eCHP, 'M&E Ch.17', '[Eg]*' + p.ana_eCHP, 'Eel');
      if (SO4 > 0) {
        const H2S = 0.5 * SO4r * 32 / 96 * Q / 1000 / 34 * 22.4;   // m³ H₂S/ngđ, 50 % vào pha khí
        sg.o('H₂S', 'H₂S trong biogas (ước tính 50 % S khử vào pha khí)', H2S / Math.max(Vg, 1e-6) * 1e6, 'ppm', '', 'M&E Ch.10', null, 'H2S');
        if (H2S / Math.max(Vg, 1e-6) > 0.002) warn(`Yếm khí ${A.short}: H₂S trong biogas cao (> 2.000 ppm) – cần khử H₂S (sinh học / oxit sắt) trước máy phát; COD/SO₄ = ${fx(COD / SO4)}.`);
      }
      let Ph = 0;
      if (heat) {
        Ph = sg.o('P_nhiệt', 'Nhiệt cần gia nhiệt nước thải (+10 % tổn thất)', Q * 1000 * 4.186 * (Ta - T) / 86400 * 1.1, 'kW nhiệt', 'Q·ρ·c_p·ΔT·1,1', 'M&E Ch.13', null, 'Ph');
        const Pav = Ekwh / 24 * p.ana_eBoil;
        sg.o('P_biogas', 'Nhiệt từ đốt biogas (lò hơi)', Pav, 'kW nhiệt', 'η = ' + p.ana_eBoil, '', null, 'Pav');
        sg.chk('Biogas đủ gia nhiệt', Pav >= Ph, 'ĐỦ', 'THIẾU NHIỆT – cần nhiên liệu bổ sung hoặc giảm nhiệt độ vận hành', 'M&E Ch.13', true);
      }
      // độ kiềm
      const sa = u.sec('8. Độ kiềm bicarbonat & pH — M&E Ch.10');
      const pH = sa.i('pH', 'pH vận hành tối thiểu', p.ana_pH, '-', '6,6 – 7,0', 'M&E Ch.10', 'pH');
      const KH = 0.0339 * Math.exp(2400 * (1 / (Ta + 273.15) - 1 / 298.15)), K1 = Math.pow(10, -6.35) * (1 + 0.012 * (Ta - 25));
      const pCO2 = 1 - fC;
      const Alkreq = sa.o('Alk_yc', 'Độ kiềm bicarbonat yêu cầu', p.ana_Alk > 0 ? +p.ana_Alk : K1 * KH * pCO2 / Math.pow(10, -pH) * 50000, 'mg/L CaCO₃', p.ana_Alk > 0 ? 'Nhập (tab 4)' : `K₁·K_H·p_CO₂/[H⁺]·50.000; p_CO₂ = ${fx(pCO2)} atm, K_H = ${fx(KH, 4)} mol/L·atm`, 'M&E VD 10-?', null, 'Alkreq');
      const Alkav = sa.o('Alk_có', 'Độ kiềm sẵn có (vào + amoni hóa)', sIn.Alk + 3.57 * Math.max(0, st.NH4 - sIn.NH4), 'mg/L CaCO₃', 'Alk_vào + 3,57·ΔNH₄', 'M&E Ch.10', null, 'Alkav');
      if (tech === 'UASB') {
        const t = DATA.ALK_UASB, Tc = clamp(Ta, 20, 40), cc = clamp(pCO2, 0.25, 0.4);
        const ti = Math.min(3, Math.floor((Tc - 20) / 5)), ci = Math.min(2, Math.floor((cc - 0.25) / 0.05 + 1e-9)), ft = (Tc - t.T[ti]) / 5, fc = (cc - t.co2[ci]) / 0.05;
        const v = (1 - ft) * ((1 - fc) * t.v[ti][ci] + fc * t.v[ti][ci + 1]) + ft * ((1 - fc) * t.v[ti + 1][ci] + fc * t.v[ti + 1][ci + 1]);
        sa.o('Alk_B10-7', 'Đối chiếu: độ kiềm tối thiểu giữ pH 7,0 (M&E Bảng 10-7)', v, 'mg/L CaCO₃', `Nội suy theo T = ${fx(Tc)} °C, CO₂ = ${fx(cc * 100)} %`, 'M&E Bảng 10-7; bảng tính UASB', null, 'AlkT');
      }
      const dAlk = sa.o('ΔAlk', 'Độ kiềm cần bổ sung', Math.max(0, Alkreq - Alkav), 'mg/L CaCO₃', '', '', 'MAX(0,[Alkreq]-[Alkav])', 'dAlk');
      let MNaHCO3 = 0;
      if (dAlk > 0) {
        MNaHCO3 = sa.o('M_NaHCO₃', 'NaHCO₃ bổ sung', dAlk * 1.68 * Q / 1000, 'kg/ngđ', '1 mg CaCO₃ ≈ 1,68 mg NaHCO₃', 'M&E Ch.10', '[dAlk]*1.68*[Q]/1000', 'MNaHCO3');
        R.chem.push({ name: 'NaHCO₃ – bổ sung kiềm bể yếm khí', dose: dAlk * 1.68, kg: MNaHCO3, unit: 'kg', price: 'p_NaHCO3', note: 'M&E Ch.10', ref: u.ids.MNaHCO3, sol: 0.08, rho: 1.06 });
        sa.note('Có thể giảm hóa chất bằng tuần hoàn nước ra (độ kiềm đã tăng) hoặc vận hành pH 6,6 – 6,8; tránh NaOH/vôi liều cao (tạo kết tủa, độc Na⁺ > 3.500 mg/L).');
      }
      st.Alk = so.o('Alk_ra', 'Độ kiềm ra', Alkav + dAlk, 'mg/L CaCO₃', '', '', '[Alkav]+[dAlk]', 'Alk_ra');
      // bùn dư
      const sb = u.sec('9. Bùn dư yếm khí');
      const Px = sb.o('P_X,TSS', 'Bùn dư (đưa về xử lý bùn)', tech === 'CSTR' ? 0 : (Pbio / 0.85 + (iTSS + nbVSS + bpVSS * (1 - fh)) * Q / 1000) * fcap, 'kg TSS/ngđ', tech === 'CSTR' ? 'Bể khuấy trộn: bùn ra theo nước' : '(P_X,bio/0,85 + chất rắn giữ lại)·f_giữ', 'M&E Ch.10', null, 'PXa');
      sb.i('C_bùn', 'Nồng độ bùn dư', p.ana_DS, '% DS', tech === 'UASB' || tech === 'EGSB' || tech === 'IC' ? 'Bùn hạt 4 – 8 %' : '2 – 4 %', 'M&E Ch.10', 'DSa');
      sb.o('Q_bùn', 'Lưu lượng bùn dư', Px / (10 * p.ana_DS), 'm³/ngđ', 'P_X/(10·%DS)', '', '[PXa]/(10*[DSa])', 'Qwa');
      // hình học & thiết bị
      u.V = V; u.A = V / H; u.n = n; u.H = Hx; u.hl = 0.3;
      u.geom = round ? { type: 'circ', D: Dd, H: H + 0.5, fb: 0.5, n, label: A.short } : { type: 'rect', L: Lb, B, H: Hx + 0.5, fb: 0.5, n, zones: tech === 'ABR' || tech === 'AMBR' ? Array.from({ length: Math.max(3, Math.round(p.ana_comp)) }, (_, i) => ({ name: 'N' + (i + 1), len: Lb / Math.max(3, Math.round(p.ana_comp)) })) : [{ name: A.short, len: Lb }], label: A.short };
      u.dims = round ? `${n} × Ø ${fx(Dd)} m, H ${fx(H)} m` : `${n} × (${fx(Lb)} × ${fx(B)} × ${fx(Hx)} m)`;
      u.hrt = HRT >= 48 ? `${fx(HRT / 24)} ngày` : `${fx(HRT)} h`;
      const kWmix = tech === 'CSTR' || tech === 'ACP' ? 6 * V / 1000 : tech === 'AMBR' ? 3 * V / 1000 : tech === 'ASBR' ? 4 * V / 1000 : 0;
      const kWrec = Qrec > 0 ? 9.81 * Qrec / 86400 * 6 / 0.65 : 0;
      const kWfeed = 9.81 * Q / 86400 * (H + 3) / 0.65;
      u.kW = kWmix + kWrec + kWfeed;
      R.equip.push({ u: u.name, name: 'Bơm cấp nước vào bể yếm khí', spec: `${fx(Qpk, 0)} m³/h; ${fx(H + 3)} m`, qty: 2, note: '1 + 1' });
      if (kWmix) R.equip.push({ u: u.name, name: tech === 'ASBR' || tech === 'AMBR' ? 'Máy khuấy chậm' : 'Máy khuấy / bơm trộn tuần hoàn', spec: `${fx(kWmix)} kW tổng`, qty: n * (tech === 'AMBR' ? Math.max(3, Math.round(p.ana_comp)) : 1), note: '' });
      if (Qrec > 0) R.equip.push({ u: u.name, name: 'Bơm tuần hoàn (đạt vận tốc nước dâng)', spec: `${fx(Qrec / 24, 0)} m³/h`, qty: n + 1, note: '' });
      if (tech === 'UASB' || tech === 'EGSB' || tech === 'IC') R.equip.push({ u: u.name, name: tech === 'UASB' ? 'Bộ tách 3 pha GSS + máng thu nước' : 'Bình tách khí – lỏng – rắn (tầng trên) + hệ phân phối đáy', spec: `${n} bể`, qty: n, note: 'Theo nhà cung cấp' });
      if (tech === 'AF') R.equip.push({ u: u.name, name: 'Giá thể lọc kỵ khí (PP/PVC dạng khối)', spec: `${fx(extra.Vm || 0)} m³; ${p.ana_aspec} m²/m³`, qty: 1, note: '' });
      if (tech === 'ACP') R.equip.push({ u: u.name, name: 'Thiết bị khử khí chân không + bể lắng + bơm bùn tuần hoàn', spec: `A lắng ${fx(extra.Acl)} m²; RAS ${fx(extra.RAS / 24)} m³/h`, qty: 1, note: '' });
      R.equip.push({ u: u.name, name: 'Đuốc đốt biogas dư (flare)', spec: `${fx(Vg / 24 * 1.5, 0)} m³/h`, qty: 1, note: '1,5 × lưu lượng TB' });
      R.equip.push({ u: u.name, name: 'Túi / bồn chứa khí (2 – 4 h)', spec: `${fx(Vg / 24 * 3, 0)} m³`, qty: 1, note: '' });
      if (SO4 > 0) R.equip.push({ u: u.name, name: 'Thiết bị khử H₂S biogas', spec: `${fx(Vg / 24, 0)} m³/h`, qty: 1, note: '' });
      R.equip.push({ u: u.name, name: 'Bơm bùn dư yếm khí', spec: `${fx(Px / (10 * p.ana_DS) / 4, 1)} m³/h`, qty: 2, note: '1 + 1' });
      R.special.biogas = { Vg, VCH4, Ekwh, Eel, Ph };
      return { u, st, Px, kW: u.kW, Vg, Eel, Ekwh, tech, V, HRT, SRT, OLR: Lc / V };
    }

    /* ---------- ③ Hóa lý trước sinh học ---------- */
    const st3 = { ...st2 };
    let cept = null;
    const ceptK = ['COD', 'BOD', 'TSS', 'TN', 'TKN', 'NH4', 'TP', 'OG', 'Color'];
    if (c.chemPos === 'pre') for (const k of ceptK) st3[k] = st2[k] * (1 - E[k].cept / 100);
    stageRows(3, '③ Sau hóa lý trước sinh học (CEPT)' + (c.chemPos === 'pre' ? '' : ' – không bố trí, giữ nguyên'), st3, k => c.chemPos === 'pre' && ceptK.includes(k) ? `[${k}2]*(1-[e_${k}_cept]/100)` : `[${k}2]`);
    if (c.chemPos === 'pre') cept = chemCluster('pre', Qpk_eff, QpkRef, 2, 3, st2, st3, hasEQ ? 'Sau bể điều hòa: Q bơm điều hòa' : 'Q_max,h');

    /* ---------- ③b Kết tủa hydroxit kim loại nặng (bảng tính "Metal Hydroxide Precipitation-SI") ----------
       Độ tan theo pH: đường cong độ tan của từng hydroxit (nội suy log-tuyến tính, DATA.METALS); nồng độ ra = độ tan·SF;
       hóa chất theo hóa trị: n mol OH⁻/mol kim loại (bảng tính gốc lấy 1 mol hóa chất/mol kim loại – thiếu một nửa với NaOH). */
    let mh = null;
    if (c.metal && c.metal !== 'none') {
      const u = new Unit(R, 'mh', 'KT-KL', 'Kết tủa hydroxit kim loại nặng – ' + (c.metal === 'lime' ? 'vôi Ca(OH)₂' : 'xút NaOH'), 'hoaly');
      const lime = c.metal === 'lime', MWc = lime ? 74.09 : 40.00, nOH = lime ? 2 : 1, colA = lim.col ? lim.col === 'A' : /_A$|cột A/i.test(S.std.id + ' ' + lim.name);
      const s0 = u.sec('1. Số liệu vào & lựa chọn — bảng tính Metal Hydroxide Precipitation (EngineeringExcelTemplates)');
      s0.o('Q', 'Lưu lượng', Q, 'm³/ngđ', '', '', '[info.Q]', 'Q');
      const pH = s0.i('pH_tk', 'pH thiết kế bể phản ứng', p.mh_pH, '-', 'Chọn theo kim loại khó kết tủa nhất', 'Bảng tính mẫu', 'pH');
      const SF = s0.i('SF', 'Hệ số an toàn', p.mh_SF, '-', 'Nồng độ ra = độ tan·SF; hóa chất × SF', 'Bảng tính mẫu', 'SF');
      s0.i('M_hc', lime ? 'Khối lượng mol Ca(OH)₂' : 'Khối lượng mol NaOH', MWc, 'g/mol', lime ? '1 mol cấp 2 OH⁻' : '1 mol cấp 1 OH⁻', '', 'MWc');
      const pct = s0.i('C_dd', lime ? 'Nồng độ sữa vôi' : 'Nồng độ dung dịch xút', p.mh_pct, 'kg/kg', '', '', 'pct');
      const fxs = s0.i('k_nền', 'Hệ số dư hóa chất trung hòa nền', p.mh_fx, '-', 'Jar-test', '', 'fx');
      const s1 = u.sec('2. Cân bằng từng kim loại — độ tan hydroxit theo pH (nội suy đường cong độ tan)');
      let Ms = 0, Mc = 0, nM = 0;
      const tabX = [], solX = [];
      for (const [k, M] of Object.entries(DATA.METALS)) {
        const C0 = +p['mh_' + k];
        if (!(C0 > 0)) continue;
        nM++;
        s1.i(k + '₀', M.name + ' vào', C0, 'mg/L', '', 'Đầu bài', k + '0');
        const sol = s1.o('S_' + k, `Độ tan ${M.hyd} ở pH thiết kế`, DATA.metalSol(k, pH), 'mg/L', 'Nội suy log10 đường cong độ tan', 'heienv.com (bảng tính mẫu)', null, 'sol' + k);
        const Ce = s1.o(k + '_ra', M.name + ' ra ước tính', Math.min(C0, sol * SF), 'mg/L', 'min(C₀; S·SF)', 'Bảng tính mẫu', `MIN([${k}0],[sol${k}]*[SF])`, k + 'e');
        const rem = s1.o('ΔM_' + k, M.name + ' – lượng tách ra', Q * (C0 - Ce) / 1000, 'kg/ngđ', 'Q·(C₀ − C_ra)', '', `[Q]*([${k}0]-[${k}e])/1000`, 'rem' + k);
        const sl = s1.o('X_' + k, `Bùn ${M.hyd}`, rem * M.M / M.A, 'kg/ngđ', `ΔM·${fx(M.M)}/${fx(M.A)}`, '', `[rem${k}]*${M.M}/${M.A}`, 'xs' + k);
        const ch_ = s1.o('M_hc,' + k, M.name + (lime ? ' – vôi cần' : ' – xút cần'), rem / M.A * M.n / nOH * MWc * SF * fxs, 'kg/ngđ', `ΔM/A·${M.n}/${nOH}·M_hc·SF·k`, 'Tỷ lượng hóa học', `[rem${k}]/${M.A}*${M.n}/${nOH}*[MWc]*[SF]*[fx]`, 'mc' + k);
        const Lm = M.lim[colA ? 0 : 1];
        s1.chk(`${M.name} ra ≤ ${fx(Lm)} mg/L (QCVN 40:2011 cột ${colA ? 'A' : 'B'}, tham khảo)`, Ce <= Lm + 1e-9, 'ĐẠT', k === 'Pb' ? 'KHÔNG ĐẠT – Pb(OH)₂ tan nhiều (≥ 8 mg/L): dùng kết tủa carbonat / sulfua' : 'KHÔNG ĐẠT – đổi pH thiết kế hoặc thêm kết tủa sulfua', 'QCVN 40:2011/BTNMT', false, `[${k}e]<=${Lm}`);
        Ms += sl; Mc += ch_; tabX.push(`[xs${k}]`); solX.push(`[mc${k}]`);
      }
      if (!nM) { s1.note('Chưa nhập nồng độ kim loại vào (tab 4 – nhóm "Kết tủa hydroxit kim loại nặng").'); tabX.push('0'); solX.push('0'); }
      const s2 = u.sec('3. Hóa chất & bùn hydroxit');
      Mc = s2.o('M_hc', lime ? 'Vôi Ca(OH)₂ (100 %)' : 'NaOH (100 %)', Mc, 'kg/ngđ', 'Σ theo kim loại', '', tabX.length ? solX.join('+') : '0', 'Mc');
      s2.o('M_dd', lime ? 'Sữa vôi' : 'Dung dịch xút', Mc / pct, 'kg/ngđ', 'M/C_dd', '', '[Mc]/[pct]', 'Mdd');
      Ms = s2.o('M_bùn', 'Bùn hydroxit khô', Ms, 'kg DS/ngđ', 'Σ hydroxit', '', tabX.join('+'), 'Ms');
      const Vs = s2.o('V_bùn', 'Thể tích bùn lắng (1 % DS)', Ms / 10, 'm³/ngđ', 'M/(10 kg/m³)', 'M&E mục 6-?', '[Ms]/10', 'Vs');
      const s3 = u.sec('4. Bể phản ứng pH – tạo bông & bể lắng hydroxit');
      s3.o('Q_đỉnh', 'Lưu lượng tính toán', Qpk_eff, 'm³/h', hasEQ ? 'Sau điều hòa' : 'Q_max,h', '', QpkRef, 'Qd');
      const t = s3.i('t', 'Thời gian phản ứng – tạo bông', p.mh_t, 'phút', '20 – 40', 'M&E mục 6-3', 't');
      const V = s3.o('V_pư', 'Thể tích bể phản ứng (2 ngăn)', Qpk_eff * t / 60, 'm³', 'Q·t/60', '', '[Qd]*[t]/60', 'V');
      const SOR = s3.i('SOR', 'Tải trọng bề mặt bể lắng', p.mh_SOR, 'm/h', '0,6 – 1,2', 'M&E mục 6-3', 'SOR');
      const Al = s3.o('A_lắng', 'Diện tích bể lắng', Qpk_eff / SOR, 'm²', 'Q/SOR', '', '[Qd]/[SOR]', 'A');
      const D = s3.o('D', 'Đường kính bể lắng', ceilTo(Math.sqrt(4 * Al / PI), 0.5), 'm', '√(4A/π), làm tròn 0,5 m', '', 'CEILING(SQRT(4*[A]/PI()),0.5)', 'D');
      const a = ceilTo(Math.sqrt(V / 2 / 3), 0.1);
      s3.note(`Trình tự: chỉnh pH (${lime ? 'sữa vôi' : 'xút'}, điều khiển theo pH-met) → tạo bông (polymer anion 0,5 – 1 mg/L) → lắng → nước trong sang xử lý tiếp; Cr(VI) phải khử về Cr(III) (NaHSO₃, pH 2 – 3) và CN⁻ phải oxy hóa trước bể này. Kim loại tạo phức (EDTA, NH₃) cần phá phức.`);
      if (p.mh_Pb > 0) s3.note('Chì: độ tan Pb(OH)₂ nhỏ nhất ≈ 8 mg/L ở pH 9,9 – kết tủa hydroxit không đạt quy chuẩn, cần kết tủa carbonat (Na₂CO₃) hoặc sulfua.');
      u.geom = { type: 'rect', L: 2 * a + D + 1, B: Math.max(a, D), H: 3.5, fb: 0.5, n: 1, zones: [{ name: 'PHẢN ỨNG pH', len: a }, { name: 'TẠO BÔNG', len: a }, { name: 'LẮNG', len: D + 1 }], label: 'KẾT TỦA KL' };
      u.V = V + Al * 3.5; u.A = footprintArea(u.geom); u.H = 3; u.hl = 0.4; u.kW = 0.04 * V + 1.5;
      u.dims = `Phản ứng ${fx(V)} m³; lắng D ${fx(D)} m`; u.hrt = `${fx(t)} phút`;
      R.chem.push({ name: lime ? 'Vôi Ca(OH)₂ – kết tủa hydroxit kim loại' : 'NaOH – kết tủa hydroxit kim loại', dose: Mc / Q * 1000, kg: Mc, unit: 'kg', price: lime ? 'p_lime' : 'p_NaOH', note: 'Tỷ lượng hóa học × SF', ref: u.ids.Mc });
      R.equip.push({ u: u.name, name: lime ? 'Bồn pha sữa vôi + bơm định lượng' : 'Bồn xút + bơm định lượng', spec: `${fx(Mc / pct / 24)} kg/h dung dịch`, qty: 2, note: '1 + 1' });
      R.equip.push({ u: u.name, name: 'Máy khuấy bể phản ứng pH / tạo bông', spec: `${fx(0.04 * V / 2 + 0.2)} kW`, qty: 2, note: '' });
      R.equip.push({ u: u.name, name: 'Bộ điều khiển pH (pH-met + PLC)', spec: 'pH 0 – 14', qty: 1, note: '', unitPrice: 60 });
      R.equip.push({ u: u.name, name: 'Cầu gạt bùn bể lắng hydroxit', spec: `D = ${fx(D)} m; 0,75 kW`, qty: 1, note: '' });
      mh = { u, Ms, Vs, kW: u.kW };
    }

    /* ---------- ③a Xử lý sinh học yếm khí cấp 1 (tiền xử lý nước thải tải lượng hữu cơ cao) — M&E 5th Ch.10 ---------- */
    let ana = null, st3a = st3;
    if (c.anaer && c.anaer !== 'none' && DATA.ANA[c.anaer]) {
      ana = anaerobic(c.anaer, st3);
      st3a = ana.st;
      stageRows('3a', '③a Sau xử lý yếm khí cấp 1 – ' + DATA.ANA[c.anaer].short, st3a, k => `[ana.${k}_ra]`);
    }

    /* ---------- ④ vào sinh học ---------- */
    const st4 = { ...st3a }, s3k = ana ? '3a' : '3';
    const recK = ['COD', 'BOD', 'TSS', 'TN', 'TKN', 'NH4', 'TP'];
    for (const k of recK) st4[k] = st3a[k] * (1 + E[k].rec / 100);
    stageRows(4, '④ Vào cụm sinh học (cộng tăng tải nước tách bùn hoàn lưu)', st4, k => recK.includes(k) ? `[${k}${s3k}]*(1+[e_${k}_rec]/100)` : `[${k}${s3k}]`);

    /* ======================= CỤM SINH HỌC ======================= */
    const ub = new Unit(R, 'bio', 'SH', 'Cụm sinh học – ' + DATA.optName('bio', bio), 'sinhhoc');
    const kin = {
      muAOB_T: p.muAOB * Math.pow(1.072, T - 20), bAOB_T: p.bAOB * Math.pow(1.029, T - 20),
      bH_T: p.bH * Math.pow(1.04, T - 20), muH_T: p.muH * Math.pow(1.07, T - 20),
    };
    // TSS ra thiết kế dùng chung (quy tắc R04): bể mẻ có decanter / có lắng thứ cấp / MBR
    const isDec = bio === 'SBR' || bio === 'ICEAS' || bio === 'CTECH' || bio === 'AGS';
    const tsseTech = (bio === 'MBR' || bio === 'KMBR') ? 1 : isDec ? p.TSSe_dec : p.TSSe_cl;
    // DO bão hòa theo nhiệt độ (APHA 4500-O, Benson–Krause), 1 atm – dùng chung mọi phương án (quy tắc R05)
    const doSat = t => { const k = t + 273.15; return Math.exp(-139.34411 + 1.575701e5 / k - 6.642308e7 / k ** 2 + 1.2438e10 / k ** 3 - 8.621949e11 / k ** 4); };
    const doSatX = t => `EXP(-139.34411+157570.1/(${t}+273.15)-66423080/(${t}+273.15)^2+12438000000/(${t}+273.15)^3-862194900000/(${t}+273.15)^4)`;
    const NH4e = Math.min(p.NH4e_des, L.NH4 !== undefined ? 0.5 * L.NH4 : 99);
    const TKNe_est = NH4e + p.Norg + p.fN * 0.85 * tsseTech;
    let NO3t = p.NO3e_des;
    if (L.TN !== undefined) NO3t = Math.min(NO3t, Math.max(2, 0.9 * L.TN - TKNe_est));
    if (L.NO3 !== undefined) NO3t = Math.min(NO3t, 0.8 * L.NO3);
    NO3t = Math.max(2, NO3t);
    const SRTMLSS = {
      CAS: [p.cas_SRT, p.cas_MLSS], AO: [p.ao_SRT, p.ao_MLSS], AAO: [p.aao_SRT, p.aao_MLSS], SBR: [p.sbr_SRT, p.sbr_MLSS],
      ICEAS: [22, 4000], OD: [p.od_SRT, p.od_MLSS], MBBR: [p.mbbr_SRT, 3000], MBR: [p.mbr_SRT, p.mbr_MLSS], ORG: [p.org_SRT, 0], BIOP: [p.bp_SRT, 0],
    }[bio];

    /** Động học chung (sheet 10_SinhHoc_Chung) */
    function bioCommon(u, SRT, MLSS, opts) {
      opts = opts || {};
      // opts.tt(tiêu đề) → tiêu đề mục mới (vd. đánh số theo trình tự thiết kế ICEAS)
      if (opts.tt) { const u0 = u; u = { sec: t => u0.sec(opts.tt(t)) }; }
      const K = {};
      const s = u.sec('1. Nước thải vào cụm sinh học (cột ④ cân bằng) — M&E Bảng 8-15 bước 1');
      s.o('Q', 'Lưu lượng thiết kế', Q, 'm³/ngđ', '', '', '[info.Q]', 'Q');
      K.BOD = s.o('BOD', 'BOD₅ vào', st4.BOD, 'mg/L', '', '', '[bal.BOD4]', 'BOD');
      K.COD = s.o('COD', 'COD vào', st4.COD, 'mg/L', '', '', '[bal.COD4]', 'COD');
      K.TSS = s.o('TSS', 'TSS vào', st4.TSS, 'mg/L', '', '', '[bal.TSS4]', 'TSS');
      K.TKN = s.o('TKN', 'TKN vào', st4.TKN, 'mg/L', '', '', '[bal.TKN4]', 'TKN');
      s.o('NH₄-N', 'Amoni vào', st4.NH4, 'mg/L', '', '', '[bal.NH44]', 'NH4');
      K.TP = s.o('TP', 'TP vào', st4.TP, 'mg/L', '', '', '[bal.TP4]', 'TP');
      K.Alk = s.o('Alk', 'Độ kiềm vào', st4.Alk, 'mg/L CaCO₃', '', '', '[bal.Alk4]', 'Alk');
      K.S0 = s.o('S₀ = bCOD', 'bCOD vào', p.bcod_bod * K.BOD, 'mg/L', 'S₀ = (bCOD/BOD)·BOD', 'M&E VD 8-3 bước 1a', '[info.rBOD]*[BOD]', 'S0');
      s.i('rbCOD/bCOD', 'Tỷ lệ rbCOD/bCOD nước vào sinh học', p.rb_bio, 'g/g', 'Sau hóa lý CEPT tỷ lệ này tăng', 'M&E mục 8-2', 'rbb');
      K.rbCOD = s.o('rbCOD', 'rbCOD vào', p.rb_bio * K.S0, 'mg/L', '', '', '[rbb]*[S0]', 'rbCOD');
      K.nbsCOD = s.o('nbsCOD', 'COD hòa tan trơ (sàn COD ra)', Math.max(0, ch.nbsCOD), 'mg/L', 'Giữ như nước thô', 'M&E VD 8-3 bước 1c', 'MAX(0,[info.nbsCOD])', 'nbsCOD');
      K.VSS = K.TSS * p.vss_tss;
      K.nbVSS = s.o('nbVSS', 'VSS không phân hủy', (1 - ch.bp_p) * K.VSS, 'mg/L', 'nbVSS = (1 − bpCOD/pCOD)·VSS', 'PT (8-9)', '(1-[info.bpp])*[TSS]*[info.rVSS]', 'nbVSS');
      K.iTSS = s.o('iTSS', 'Chất rắn vô cơ trơ', K.TSS - K.VSS, 'mg/L', 'iTSS = TSS − VSS', 'PT (8-10)', '[TSS]-[TSS]*[info.rVSS]', 'iTSS');
      const sk = u.sec('2. Hằng số động học (M&E Bảng 8-14, 20 °C) & thông số chung');
      sk.i('μ_max,H', 'Tốc độ sinh trưởng cực đại dị dưỡng', p.muH, '1/ngày', 'θ = 1,07', 'Bảng 8-14', 'muH');
      sk.i('K_s', 'Hằng số bán bão hòa', p.Ks, 'mg bCOD/L', '', 'Bảng 8-14', 'Ks');
      sk.i('Y_H', 'Hệ số sản lượng dị dưỡng', p.YH, 'gVSS/g bCOD', '', 'Bảng 8-14', 'YH');
      sk.i('b_H', 'Hệ số phân hủy dị dưỡng', p.bH, '1/ngày', 'θ = 1,04', 'Bảng 8-14', 'bH');
      sk.i('f_d', 'Phần mảnh tế bào', p.fd, '-', '', 'Bảng 8-14', 'fd');
      sk.i('μ_max,AOB', 'Tốc độ sinh trưởng cực đại AOB', p.muAOB, '1/ngày', 'θ = 1,072', 'Bảng 8-14', 'muA');
      sk.i('K_NH4', 'Hằng số bán bão hòa amoni', p.KNH4, 'mg/L', '', 'Bảng 8-14', 'KNH4');
      sk.i('Y_AOB', 'Hệ số sản lượng nitrat hóa', p.YAOB, 'gVSS/gN', '', 'Bảng 8-14', 'YA');
      sk.i('b_AOB', 'Hệ số phân hủy AOB', p.bAOB, '1/ngày', 'θ = 1,029', 'Bảng 8-14', 'bA');
      sk.i('K_O2,AOB', 'Hằng số bán bão hòa oxy AOB', p.KOA, 'mg/L', '', 'Bảng 8-14', 'KOA');
      sk.i('DO', 'DO vùng hiếu khí', p.DO, 'mg/L', '≥ 2,0', 'M&E Bảng 8-15', 'DO');
      sk.i('SF', 'Hệ số an toàn SRT', p.SF, '-', '1,3 – 2,0', 'M&E Bảng 8-15', 'SF');
      sk.i('f_N', 'Hàm lượng N trong sinh khối', p.fN, 'gN/gVSS', '', 'PT (8-24)', 'fN');
      const bHT = sk.o('b_H,T', 'b_H tại T', kin.bH_T, '1/ngày', 'b_H·1,04^(T−20)', 'PT (1-44)', '[bH]*1.04^([info.T]-20)', 'bHT');
      const muHT = sk.o('μ_max,H,T', 'μmax,H tại T', kin.muH_T, '1/ngày', 'μ·1,07^(T−20)', 'PT (1-44)', '[muH]*1.07^([info.T]-20)', 'muHT');
      const s2 = u.sec('3. Mục tiêu xử lý của cụm sinh học (tự suy từ tiêu chuẩn xả)');
      s2.i('N_e,max', 'NH₄-N thiết kế tối đa', p.NH4e_des, 'mg/L', '', '', 'Nemax');
      K.Ne = s2.o('N_e', 'NH₄-N thiết kế ra', NH4e, 'mg/L', 'min(N_e,max; 0,5·NH₄ giới hạn)', 'M&E Bảng 8-15 bước 2', L.NH4 !== undefined ? 'MIN([Nemax],0.5*[info.L_NH4])' : '[Nemax]', 'Ne');
      K.NO3t = s2.i('NO₃-N_t', 'NO₃-N mục tiêu ra', NO3t, 'mg/L', L.TN !== undefined ? `min(${p.NO3e_des}; 0,9·TN_gh − TKN_e ước tính), ≥ 2` : 'Thông số nhập', 'M&E tr.809', 'NO3t');
      K.TSSe = s2.i('TSS_e', 'TSS ra thiết kế (cân bằng bùn, N gắn SS ra)', tsseTech, 'mg/L', (bio === 'MBR' || bio === 'KMBR') ? 'Nước qua màng' : isDec ? 'Chung cho bể mẻ có decanter (quy tắc R04)' : 'Chung cho công nghệ có lắng thứ cấp', 'M&E VD 8-3', 'TSSe');
      if (opts.hookA) opts.hookA(K);   // chèn mục riêng của công nghệ (vd. Bước 1 – chu kỳ ICEAS) trước mục SRT
      const s3 = u.sec('4. Động học nitrat hóa và SRT — PT (7-94), (7-98)');
      s3.o('μ_max,AOB,T', 'μmax AOB tại T', kin.muAOB_T, '1/ngày', 'μ·1,072^(T−20)', 'Bảng 8-14, PT (1-44)', '[muA]*1.072^([info.T]-20)', 'muAT');
      s3.o('b_AOB,T', 'b AOB tại T', kin.bAOB_T, '1/ngày', 'b·1,029^(T−20)', 'Bảng 8-14', '[bA]*1.029^([info.T]-20)', 'bAT');
      const mu = s3.o('μ_AOB', 'Tốc độ sinh trưởng thực', kin.muAOB_T * (K.Ne / (K.Ne + p.KNH4)) * (p.DO / (p.DO + p.KOA)) - kin.bAOB_T, '1/ngày', 'μ = μmax·[N/(N+K_N)]·[DO/(DO+K_O)] − b', 'PT (7-94)', '[muAT]*([Ne]/([Ne]+[KNH4]))*([DO]/([DO]+[KOA]))-[bAT]', 'muAOB');
      K.SRTmin = s3.o('SRT_min', 'SRT tối thiểu', 1 / mu, 'ngày', 'SRT = 1/μ', 'PT (7-98)', '1/[muAOB]', 'SRTmin');
      K.SRTreq = s3.o('SRT_yc', 'SRT yêu cầu', K.SRTmin * p.SF, 'ngày', 'SF·SRT_min', 'M&E Bảng 8-15 bước 7', '[SRTmin]*[SF]', 'SRTreq');
      if (opts.hookB) opts.hookB(K, s3);   // chèn các dòng chọn SRT thiết kế (dùng SRT_yc) trước dòng SRT
      if (opts.srtX) K.SRT = s3.o('SRT', opts.srtName, SRT, 'ngày', opts.srtNote, '', opts.srtX, 'SRT');
      else { const o = p.__ov && SRT_KEY[bio] in p.__ov ? p.__ov[SRT_KEY[bio]] : null; K.SRT = s3.i('SRT', opts.srtName || 'SRT hiếu khí thiết kế', SRT, 'ngày', o !== null ? (SRT > o ? `Tự nâng từ ${fx(o)} ngày = ⌈SRT_yc⌉₀,₅` : `Tự giảm từ ${fx(o)} ngày (CMAS: τ ≤ 6 h, vẫn ≥ SRT_yc)`) : opts.srtNote || 'Bảng 8-19 / 8-29', o !== null ? 'Quy tắc R01, R08' : 'Bảng 8-19', 'SRT'); }
      if (opts.noMLSS) K.MLSS = MLSS;
      else if (opts.mlssX) K.MLSS = s3.o('X_TSS', 'MLSS', MLSS, 'mg/L', '', '', opts.mlssX, 'MLSS');
      else { const o = bio === 'CAS' && p.__ov && 'cas_MLSS' in p.__ov ? p.__ov.cas_MLSS : null; K.MLSS = s3.i('X_TSS', 'MLSS thiết kế', MLSS, 'mg/L', o !== null ? `Tự điều chỉnh từ ${fx(o)} mg/L để τ trong dải chế độ vận hành` : '', o !== null ? 'Quy tắc R08' : 'Bảng 8-19', 'MLSS'); }
      if (!opts.noSRTcheck) s3.chk('SRT thiết kế ≥ SRT yêu cầu cho nitrat hóa', SRT >= K.SRTreq, 'ĐẠT', 'KHÔNG ĐẠT — tăng SRT', 'M&E Bảng 8-15', false, '[SRT]>=[SRTreq]');
      const s4 = u.sec('5. Cơ chất hòa tan còn lại — PT (7-46)');
      K.S = s4.o('S', 'bCOD hòa tan còn lại', p.Ks * (1 + kin.bH_T * SRT) / (SRT * (kin.muH_T - kin.bH_T) - 1), 'mg/L', 'S = K_s(1 + b·SRT)/[SRT(μmax − b) − 1]', 'PT (7-46)', '[Ks]*(1+[bHT]*[SRT])/([SRT]*([muHT]-[bHT])-1)', 'S');
      K.sBODe = s4.o('sBOD_e', 'BOD hòa tan còn lại', K.S / p.bcod_bod, 'mg/L', 'S/(bCOD/BOD)', 'M&E VD 8-3 bước 17', '[S]/[info.rBOD]', 'sBODe');
      const s5 = u.sec('6. Sinh khối và cân bằng nitơ — PT (8-20), (8-21), (8-24), giải lặp 5 vòng');
      K.A = s5.o('A', 'Sinh khối dị dưỡng', Q * p.YH * (K.S0 - K.S) / (1 + kin.bH_T * SRT) / 1000, 'kg VSS/ngđ', 'A = Q·Y_H(S₀ − S)/(1 + b_H·SRT)', 'PT (8-20)', '[Q]*[YH]*([S0]-[S])/(1+[bHT]*[SRT])/1000', 'Ab');
      K.B = s5.o('B', 'Mảnh tế bào', p.fd * kin.bH_T * SRT * K.A, 'kg VSS/ngđ', 'B = f_d·b_H·SRT·A', 'PT (8-20)', '[fd]*[bHT]*[SRT]*[Ab]', 'Bb');
      let NOx = s5.o('NOx⁽⁰⁾', 'NOx khởi tạo (80 % TKN)', 0.8 * K.TKN, 'mg/L', 'Giá trị mồi', 'VD 8-3 bước 9', '0.8*[TKN]', 'NOx0'), Cn = 0, PXbio = 0;
      for (let it = 1; it <= 5; it++) {
        Cn = s5.o(`C⁽${it}⁾`, `Sinh khối nitrat hóa – vòng ${it}`, Q * p.YAOB * NOx / (1 + kin.bAOB_T * SRT) / 1000, 'kg VSS/ngđ', 'C = Q·Y_n·NOx/(1 + b_n·SRT)', 'PT (8-20)', `[Q]*[YA]*[NOx${it - 1}]/(1+[bAT]*[SRT])/1000`, 'C' + it);
        PXbio = s5.o(`P_X⁽${it}⁾`, `Sinh khối tổng – vòng ${it}`, K.A + K.B + Cn, 'kg VSS/ngđ', 'A + B + C', 'PT (8-20)', `[Ab]+[Bb]+[C${it}]`, 'PX' + it);
        NOx = s5.o(`NOx⁽${it}⁾`, `N bị oxy hóa – vòng ${it}`, Math.max(0, K.TKN - K.Ne - p.fN * PXbio * 1000 / Q), 'mg/L', 'NOx = TKN − N_e − f_N·P_X,bio/Q', 'PT (8-24)', `MAX(0,[TKN]-[Ne]-[fN]*[PX${it}]*1000/[Q])`, 'NOx' + it);
      }
      K.C = Cn; K.PXbio = PXbio;
      K.NOx = s5.o('NOx', 'N bị oxy hóa (hội tụ)', NOx, 'mg/L', '', 'PT (8-24)', '[NOx5]', 'NOx');
      s5.o('P_X,bio', 'Sinh khối sinh ra', PXbio, 'kg VSS/ngđ', '', '', '[PX5]', 'PXbio');
      K.PXVSS = s5.o('P_X,VSS', 'Bùn dư theo VSS', PXbio + Q * K.nbVSS / 1000, 'kg VSS/ngđ', 'P_X,bio + Q·nbVSS', 'PT (8-20)', '[PXbio]+[Q]*[nbVSS]/1000', 'PXVSS');
      K.PXTSS = s5.o('P_X,TSS', 'Bùn dư theo TSS', PXbio / 0.85 + Q * K.nbVSS / 1000 + Q * K.iTSS / 1000, 'kg TSS/ngđ', 'P_X,bio/0,85 + Q·nbVSS + Q·iTSS', 'PT (8-21)', '[PXbio]/0.85+[Q]*[nbVSS]/1000+[Q]*[iTSS]/1000', 'PXTSS');
      s5.o('Y_obs', 'Hệ số sản lượng quan trắc', K.PXTSS / (Q * K.BOD / 1000), 'gTSS/gBOD', '', 'PT (8-19)', '[PXTSS]/([Q]*[BOD]/1000)', 'Yobs');
      if (!opts.noVolume) {
        const s6 = u.sec('7. Thể tích vùng hiếu khí — M&E Bảng 8-15 bước 10, 11');
        K.M = s6.o('M_TSS', 'Khối lượng bùn lưu giữ', K.PXTSS * SRT, 'kg TSS', 'M = P_X,TSS·SRT', 'VD 8-3 bước 10', '[PXTSS]*[SRT]', 'Mtss');
        K.Vaer = s6.o('V_hk', 'Thể tích hiếu khí yêu cầu', K.M * 1000 / MLSS, 'm³', 'V = M·10³/X_TSS', 'VD 8-3 bước 11', '[Mtss]*1000/[MLSS]', 'Vaer');
        s6.o('τ_hk', 'Thời gian lưu hiếu khí', K.Vaer / Q * 24, 'h', '', '', '[Vaer]/[Q]*24', 'taer');
        K.XVSS = s6.o('X_VSS', 'MLVSS', MLSS * K.PXVSS / K.PXTSS, 'mg/L', 'X_TSS·P_X,VSS/P_X,TSS', 'VD 8-3', '[MLSS]*[PXVSS]/[PXTSS]', 'XVSS');
        K.XH = s6.o('X_H', 'Sinh khối dị dưỡng hoạt động', K.A * 1000 / K.Vaer * SRT, 'mg VSS/L', 'X_H = A·SRT/V', 'PT (7-42)', '[Ab]*1000/[Vaer]*[SRT]', 'XH');
        K.FM = s6.o('F/M', 'Tỷ số F/M', Q * K.BOD / 1000 / (K.XVSS / 1000 * K.Vaer), 'kgBOD/kgMLVSS·d', '', 'Bảng 8-19', '[Q]*[BOD]/1000/([XVSS]/1000*[Vaer])', 'FM');
        K.Lv = s6.o('L_v', 'Tải trọng thể tích', Q * K.BOD / 1000 / K.Vaer, 'kgBOD/m³·d', '', 'Bảng 8-19', '[Q]*[BOD]/1000/[Vaer]', 'Lv');
      }
      K.Ynet = s5.o('Y_net', 'Hệ số sản lượng thực', p.YH / (1 + kin.bH_T * SRT), 'gVSS/g bCOD', 'Y_H/(1 + b_H·SRT)', 'PT (8-68)', '[YH]/(1+[bHT]*[SRT])', 'Ynet');
      K.gCODN = s5.o('g bCOD/g N', 'bCOD tiêu thụ cho 1 g NO₃-N', 2.86 / (1 - 1.42 * K.Ynet), 'g/g', '2,86/(1 − 1,42·Y_net)', 'PT (8-65), (8-68)', '2.86/(1-1.42*[Ynet])', 'gCODN');
      return K;
    }

    /** Nhu cầu oxy, cấp khí M&E (sheet 18) */
    function aerationME(u, K, NO3denId, NO3den, cfg) {
      cfg = cfg || {};
      const s = u.sec((cfg.title || 'Nhu cầu oxy & hệ thống cấp khí') + ' — PT (8-23), M&E mục 5-11');
      s.o('NO₃ khử (SH)', 'NO₃-N khử bằng carbon nội tại', NO3den, 'mg/L', 'Chỉ tín dụng oxy phần khử nitrat sinh học', '', NO3denId, 'NO3dO');
      const R0 = s.o('R₀', 'Nhu cầu oxy thực tế (AOR)', Math.max(0, Q * (K.S0 - K.S) / 1000 - 1.42 * K.PXbio + 4.57 * Q * K.NOx / 1000 - 2.86 * Q * NO3den / 1000), 'kgO₂/ngđ', 'R₀ = Q(S₀−S) − 1,42·P_X,bio + 4,57·Q·NOx − 2,86·Q·NO₃ khử', 'PT (8-23), (8-65)', 'MAX(0,[Q]*([S0]-[S])/1000-1.42*[PXbio]+4.57*[Q]*[NOx]/1000-2.86*[Q]*[NO3dO]/1000)', 'R0');
      const pk = s.i('k_đỉnh', 'Hệ số đỉnh', p.O2peak, '-', '', 'VD 8-3 bước 14', 'pk');
      const fa = s.i('f_sục', 'Phân suất thời gian sục khí', cfg.fAer || 1, '-', cfg.fAer ? 'Bể mẻ: t_sục/t_chu kỳ' : 'Liên tục', '', 'fa');
      const AOR = s.o('AOR_max', 'Nhu cầu oxy giờ cao điểm (trong thời gian sục khí)', R0 / 24 / fa * pk, 'kgO₂/h', 'R₀/(24·f)·k', '', '[R0]/24/[fa]*[pk]', 'AOR');
      const Cs20 = s.o('C*₂₀', 'DO bão hòa 20 °C, 1 atm', doSat(20), 'mg/L', 'APHA 4500-O (Benson–Krause)', 'M&E Phụ lục E', doSatX(20), 'Cs20');
      const CsT = s.o('C_s,T', 'DO bão hòa ở T_max (nhiệt độ nước cao nhất)', doSat(I.Tmax), 'mg/L', 'APHA 4500-O tại T_max – chung mọi phương án', 'M&E Phụ lục E', doSatX('[info.Tmax]'), 'CsT');
      if (cfg.surface) {
        s.i('α', 'Hệ số α', p.air_alpha, '-', '', '', 'al'); s.i('β', 'Hệ số β', p.air_beta, '-', '', '', 'be'); s.i('F', 'Hệ số bám bẩn', 1, '-', 'Guồng bề mặt', '', 'Ff');
        s.o('Ω', 'Hệ số hiệu chỉnh áp suất', patm / 101.325, '-', 'P_b/P_s', 'M&E 5th PT (5-70)', '[info.patm]/101.325', 'Om');
        const SOTR = s.o('SOTR', 'Nhu cầu oxy tiêu chuẩn', AOR * (Cs20 / (p.air_beta * CsT * patm / 101.325 - p.DO)) * Math.pow(1.024, 20 - I.Tmax) / p.air_alpha, 'kgO₂/h', 'AOR·C*s,20/(β·Ω·C*s,T − C)·1,024^(20−T_max)/(α·F), F = 1', 'M&E 5th PT (5-70)', '[AOR]*([Cs20]/([be]*[CsT]*[Om]-[DO]))*1.024^(20-[info.Tmax])/([al]*[Ff])', 'SOTR');
        const SAE = s.i('SAE', 'Hiệu suất guồng khí', p.od_SAE, 'kgO₂/kWh', '1,5 – 2,2', 'Catalogue', 'SAE');
        const P = s.o('N_guồng', 'Công suất guồng khí', SOTR / SAE, 'kW', 'N = SOTR/SAE', '', '[SOTR]/[SAE]', 'Pw');
        R.equip.push({ u: u.name, name: 'Guồng khí bề mặt (rotor)', spec: `${fx(P / Math.max(2, Math.ceil(P / 55)))} kW/máy`, qty: Math.max(2, Math.ceil(P / 55)), note: '' });
        u.airP = P; u.airH = 24 * (cfg.fAer || 1); u.SOTR = SOTR; u.R0 = R0; u.airRow = u.ids.Pw;
        return;
      }
      const aMan = MAN('air_alpha');   // α nhập tay (tab 4) áp cho mọi phương án, kể cả công nghệ có α riêng (MBR, giá thể)
      s.i('α', 'Hệ số α', aMan ? p.air_alpha : cfg.alpha || p.air_alpha, '-', cfg.alpha && aMan ? `Nhập tay (α riêng công nghệ ${fx(cfg.alpha)})` : 'M&E VD 8-3: 0,5 – 0,65', 'M&E VD 8-3', 'al');
      s.i('β', 'Hệ số β', p.air_beta, '-', '', 'M&E VD 8-3', 'be');
      s.i('F', 'Hệ số bám bẩn đĩa', p.air_F, '-', '', 'M&E VD 8-3', 'Ff');
      s.i('D_f', 'Chiều sâu đặt đĩa (độ ngập)', p.air_de, 'm', '', 'M&E 5th PT (5-70)', 'de');
      s.i('d_e', 'Hệ số hiệu chỉnh giữa cột nước', p.air_dmid, '-', '0,25 – 0,45 (0,40)', 'M&E 5th tr.420', 'dmid');
      const Cinf = s.o('C*∞,20', 'DO bão hòa ở độ ngập, 20 °C, mực nước biển', Cs20 * (1 + p.air_dmid * p.air_de / 10.33), 'mg/L', 'C*s,20·[1 + d_e·(D_f/P_s)], P_s = 10,33 m', 'M&E 5th PT (5-70)', '[Cs20]*(1+[dmid]*[de]/10.33)', 'Cinf');
      const tau = s.o('τ', 'Hệ số hiệu chỉnh nhiệt độ của DO bão hòa', CsT / Cs20, '-', 'C*s,T/C*s,20', 'M&E 5th PT (5-70)', '[CsT]/[Cs20]', 'tau');
      const Om = s.o('Ω', 'Hệ số hiệu chỉnh áp suất', patm / 101.325, '-', 'P_b/P_s', 'M&E 5th PT (5-70)', '[info.patm]/101.325', 'Om');
      const alpha = aMan ? p.air_alpha : cfg.alpha || p.air_alpha;
      const SOTR = s.o('SOTR', 'Nhu cầu oxy tiêu chuẩn', AOR * Cinf / (tau * p.air_beta * Om * Cinf - p.DO) * Math.pow(1.024, 20 - I.Tmax) / (alpha * p.air_F), 'kgO₂/h', 'SOTR = AOR·C*∞,20/(τ·β·Ω·C*∞,20 − C)·1,024^(20−T_max)/(α·F)', 'M&E 5th PT (5-70)', '[AOR]*[Cinf]/([tau]*[be]*[Om]*[Cinf]-[DO])*1.024^(20-[info.Tmax])/([al]*[Ff])', 'SOTR');
      const SOTE = s.i('SOTE', 'Hiệu suất chuyển khối oxy tiêu chuẩn', cfg.SOTE || p.air_SOTE, '-', cfg.SOTE ? 'Hệ khí bọt vừa (giá thể)' : 'Đĩa bọt mịn', 'Catalogue', 'SOTE');
      const Qair = s.o('Q_khí', 'Lưu lượng khí công nghệ', SOTR / (1.2 * 0.2318 * SOTE) / 60, 'm³/phút', 'Q = SOTR/(ρ·%O₂·SOTE)', 'VD 8-3 bước 14', '[SOTR]/(1.2*0.2318*[SOTE])/60', 'Qair');
      const extra = (cfg.extraAir || 0) + (airGrit + airEQ);
      s.o('Q_khác', 'Khí sục rửa màng + lắng cát + điều hòa', extra, 'm³/phút', '', '', `${cfg.extraAir ? '[mbrSAD]+' : ''}${R.um.ctdv.ids.Qag ? '[ctdv.Qag]' : '0'}+${R.um.eq ? '[eq.Qa]' : '0'}`, 'Qx');
      const Qtot = s.o('ΣQ_khí', 'Tổng lưu lượng khí máy thổi', Qair + extra, 'm³/phút', '', '', '[Qair]+[Qx]', 'Qtot');
      let ndisk = 0;
      if (!cfg.SOTE) { s.i('q_đĩa', 'Lưu lượng khí mỗi đĩa', p.air_qd, 'm³/h·đĩa', '', 'Catalogue', 'qd'); ndisk = s.o('n_đĩa', 'Số đĩa phân phối khí', Math.ceil(Qair * 60 / p.air_qd - 1e-9), 'đĩa', 'n = Q/q_đĩa', 'Catalogue', 'ROUNDUP([Qair]*60/[qd],0)', 'nd'); }
      s.i('Δp', 'Tổn thất áp qua đĩa + ống', p.air_dp, 'kPa', '', '', 'dp');
      const p2 = s.o('p₂', 'Áp suất đẩy', patm + 9.81 * p.air_de + p.air_dp, 'kPa', 'p_atm + ρg·d + Δp', 'PT (5-77)', '[info.patm]+9.81*[de]+[dp]', 'p2');
      s.i('e', 'Hiệu suất máy thổi', p.air_e, '-', '0,70 – 0,80', 'PT (5-77)', 'e');
      const P = s.o('P_w', 'Công suất trục máy thổi', Qtot / 60 * 1.2 * 8.314 * 293.15 / (28.97 * 0.283 * p.air_e) * (Math.pow(p2 / patm, 0.283) - 1), 'kW', 'P = wRT₁/(28,97·0,283·e)·[(p₂/p₁)^0,283 − 1]', 'PT (5-77)', '[Qtot]/60*1.2*8.314*293.15/(28.97*0.283*[e])*(([p2]/[info.patm])^0.283-1)', 'Pw');
      const nb = s.i('n_máy', 'Số máy thổi làm việc', p.air_nb, 'máy', '+ 1 dự phòng, biến tần', '', 'nb');
      s.o('P_1', 'Công suất 1 máy (động cơ, η = 0,95)', P / nb / 0.95, 'kW', '', '', '[Pw]/[nb]/0.95', 'P1');
      s.o('SAE', 'Hiệu suất năng lượng', SOTR / Math.max(P, 1e-6), 'kgO₂/kWh', 'Đối chiếu 1,8 – 3,0', '', '[SOTR]/[Pw]', 'SAE');
      R.equip.push({ u: 'Nhà máy thổi khí', name: 'Máy thổi khí', spec: `${fx(Qtot / nb)} m³/phút × ${fx(p2 - patm)} kPa; ${fx(ceilTo(P / nb / 0.95, 0.5))} kW`, qty: nb + 1, note: nb + ' + 1 dự phòng' });
      if (ndisk) R.equip.push({ u: u.name, name: 'Đĩa phân phối khí bọt mịn', spec: `${p.air_qd} m³/h·đĩa`, qty: ndisk, note: '', spare: 'diffuser' });
      u.airP = P; u.airQ = Qtot; u.airH = 24 * fa; u.SOTR = SOTR; u.R0 = R0; u.nBlower = nb + 1; u.airRow = u.ids.Pw;
    }

    /** Độ kiềm (VD 8-3 bước 15) */
    function alkalinity(u, NOxO, NOxId, NO3den, NO3denId, titlePrefix, chemAlk) {
      const s = u.sec((titlePrefix || '') + 'Cân bằng độ kiềm — M&E Ví dụ 8-3 bước 15');
      s.o('N_ox', 'N bị nitrat hóa', NOxO, 'mg/L', '', '', NOxId, 'NoxA');
      s.o('N_dn', 'N được khử nitrat', NO3den, 'mg/L', '', '', NO3denId, 'NdnA');
      const cons = s.o('Alk_tt', 'Độ kiềm tiêu thụ do nitrat hóa', 7.14 * NOxO, 'mg/L CaCO₃', '7,14·NOx', 'VD 8-3 bước 15', '7.14*[NoxA]', 'Alkc');
      const ret = s.o('Alk_ht', 'Độ kiềm hoàn trả do khử nitrat', 3.57 * NO3den, 'mg/L CaCO₃', '3,57·NO₃ khử', 'M&E mục 8-7', '3.57*[NdnA]', 'Alkr');
      // chemAlk = { v, x }: độ kiềm tiêu thụ do muối kim loại khử P đồng thời trong bể sinh học (M&E mục 6-3)
      const cch = chemAlk ? s.o('Alk_hc', 'Độ kiềm tiêu thụ do muối kim loại (khử P đồng thời)', chemAlk.v, 'mg/L CaCO₃', '3 đương lượng / mol kim loại', 'M&E mục 6-3', chemAlk.x, 'AlkCh2') : 0;
      const res = s.o('Alk_dư', 'Độ kiềm còn lại', st4.Alk - cons + ret - cch, 'mg/L CaCO₃', 'Alk_vào − tiêu thụ + hoàn trả' + (chemAlk ? ' − hóa chất' : ''), '', '[bal.Alk4]-[Alkc]+[Alkr]' + (chemAlk ? '-[AlkCh2]' : ''), 'Alkres');
      s.i('Alk_yc', 'Độ kiềm dư yêu cầu', p.alk_res, 'mg/L CaCO₃', '70 – 80', 'VD 8-3 bước 15', 'Alkreq');
      const need = s.o('ΔAlk', 'Độ kiềm cần bổ sung', Math.max(0, p.alk_res - res), 'mg/L CaCO₃', '', '', 'MAX(0,[Alkreq]-[Alkres])', 'dAlk');
      // liều chọn tùy ý (tab 4 – nhóm "Hóa chất – liều chọn") thay cho liều theo cân bằng kiềm
      const set = p.naoh_set > 0, dN = set ? p.naoh_set : need * 0.8;
      if (set) s.i('C_NaOH,chọn', 'Liều NaOH 100 % chọn (tùy chọn)', p.naoh_set, 'mg/L', `Theo cân bằng kiềm: ${fx(need * 0.8)} mg/L`, 'Lựa chọn vận hành', 'cNaOHs');
      const M = s.o('M_NaOH', 'NaOH 100 % bổ sung', dN * Q / 1000, 'kg/ngđ', set ? 'M = C_chọn·Q/1000' : '1 mg CaCO₃ ≈ 0,8 mg NaOH', '', set ? '[cNaOHs]*[info.Q]/1000' : '[dAlk]*[info.Q]/1000*0.8', 'MNaOHb');
      if (M > 0) s.o('Q_dd', `Dung dịch NaOH ${fx(p.sol_NaOH * 100)} %`, M / p.sol_NaOH / p.rho_NaOH / 24, 'L/h', 'M/(C_dd·ρ)/24', '', `[MNaOHb]/${p.sol_NaOH}/${p.rho_NaOH}/24`, 'QNaOHb');
      const out = set ? res + dN / 0.8 : Math.max(res, p.alk_res);
      s.o('Alk_ra', 'Độ kiềm nước ra', out, 'mg/L CaCO₃', set ? 'Alk_dư + C_chọn/0,8' : '', '', set ? '[Alkres]+[cNaOHs]/0.8' : 'MAX([Alkres],[Alkreq])', 'Alkout');
      s.chk('Độ kiềm', need <= 0, 'ĐỦ KIỀM', 'THIẾU KIỀM — châm NaOH ' + fx(need * 0.8) + ' mg/L', '', true, '[dAlk]<=0');
      if (set) s.chk('Độ kiềm theo liều chọn', out >= p.alk_res - 0.5, 'ĐẠT', 'Liều NaOH chọn thấp hơn cân bằng kiềm – độ kiềm dư < yêu cầu', 'VD 8-3 bước 15', true, '[Alkout]>=[Alkreq]-0.5');
      if (M > 0) R.chem.push({ name: 'NaOH 100 % – bổ sung kiềm cho nitrat hóa', dose: dN, kg: M, unit: 'kg quy 100 %', price: 'p_NaOH', note: 'VD 8-3 bước 15' + (set ? ' – liều chọn' : ''), ref: u.ids.MNaOHb, sol: p.sol_NaOH, rho: p.rho_NaOH });
      return out;
    }

    /** Carbon ngoài: deficitX mẫu kg N/ngđ; codX mẫu kg COD thiếu */
    function extCarbon(s, deficitN, defNX, defC, defCX) {
      const CODn = 2.86 / (1 - 1.42 * 0.3);
      const need = Math.max(deficitN * CODn, defC || 0), set = p.meoh_set > 0;
      if (need <= 0 && !set) return { M: 0, sl: 0 };
      s.o('COD_ngoài', 'COD cần bổ sung từ nguồn ngoài', need, 'kg COD/ngđ', `max(thiếu hụt N × ${fx(CODn)}; thiếu carbon nội tại)`, 'M&E PT (8-69); Bảng 8-26', `MAX(${defNX || 0}*2.86/(1-1.42*0.3),${defCX || 0})`, 'CODext');
      // liều chọn tùy ý (tab 4) thay cho liều theo thiếu hụt
      let cod = need, codX = '[CODext]';
      if (set) {
        s.i('C_MeOH,chọn', 'Liều methanol chọn (tùy chọn)', p.meoh_set, 'mg/L', `Theo tính toán: ${fx(need / 1.5 / Q * 1000)} mg/L`, 'Lựa chọn vận hành', 'cMeOHs');
        cod = p.meoh_set * 1.5 * Q / 1000; codX = '[cMeOHs]*1.5*[info.Q]/1000';
        s.chk('Carbon ngoài theo liều chọn', cod >= need - 1e-6, 'ĐỦ', 'Liều methanol chọn thấp hơn nhu cầu – khử nitrat chưa đạt thiết kế', 'M&E PT (8-69)', true, codX + '>=[CODext]');
      }
      const M = s.o('M_MeOH', 'Methanol tiêu thụ', cod / 1.5, 'kg/ngđ', '1 g methanol ≈ 1,5 g COD', '', codX + '/1.5', 'MMeOH');
      s.o('Q_dd', 'Methanol thương phẩm', M / p.sol_MeOH / p.rho_MeOH / 24, 'L/h', 'M/(C_dd·ρ)/24', '', `[MMeOH]/${p.sol_MeOH}/${p.rho_MeOH}/24`, 'QMeOH');
      const sl = s.o('ΔX', 'Bùn sinh thêm do carbon ngoài', 0.3 * cod / 0.85, 'kg TSS/ngđ', 'Y_H·COD/0,85 (Y = 0,3)', 'M&E PT (8-69)', '0.3*' + codX + '/0.85', 'Xext');
      R.chem.push({ name: 'Methanol – carbon ngoài khử nitrat', dose: M / Q * 1000, kg: M, unit: 'kg', price: 'p_MeOH', note: 'M&E PT (8-69), Bảng 8-26' + (set ? ' – liều chọn' : ''), ref: s.u.ids.MMeOH, sol: p.sol_MeOH, rho: p.rho_MeOH });
      return { M, sl };
    }

    const bioRes = { NO3e: 0, TPe: st4.TP, TSSe: tsseTech, NO3den: 0, Vtot: 0 };
    let K = null, RAS = 0, Qdec = 0;
    const needClar = !!DATA.NEED_CLARIFIER[bio];
    let fAer = 1;

    /* Khử nitrat chung cho bể mẻ (F14): SDNR theo F/M trên sinh khối dị dưỡng hoạt tính – M&E 5th PT (8-56) – (8-58), Bảng 8-22 */
    const DNB = (() => {
      const pctB = clamp(p.rb_bio * 100, 10, 50), tb = [[10, .186, .078], [20, .213, .118], [30, .235, .141], [40, .242, .152], [50, .27, .162]];
      let b0 = .213, b1 = .118;
      for (let i = 0; i < 4; i++) if (pctB >= tb[i][0] && pctB <= tb[i + 1][0]) { const f = (pctB - tb[i][0]) / 10; b0 = tb[i][1] + f * (tb[i + 1][1] - tb[i][1]); b1 = tb[i][2] + f * (tb[i + 1][2] - tb[i][2]); }
      const sdnrOf = fmb => (fmb <= 0.5 ? 0.24 * fmb : b0 + b1 * Math.log(fmb)) * Math.pow(1.026, T - 20);
      // khối sinh khối dị dưỡng hoạt tính M_Xb (kg VSS) cho lưu lượng q, BOD vào bod, SRT srt – M&E PT (7-42), (7-46)
      const xbOf = (q, bod, srt) => { const S0 = p.bcod_bod * bod, S = p.Ks * (1 + kin.bH_T * srt) / (srt * (kin.muH_T - kin.bH_T) - 1); return q * p.YH * (S0 - S) * srt / (1 + kin.bH_T * srt) / 1000; };
      return { pctB, b0, b1, sdnrOf, xbOf };
    })();

    /* Sinh khối & bùn sinh ra ở SRT cho trước theo hệ số động học (b_H, μ_H, b_AOB) – cùng công thức bioCommon mục 5, 6 (dùng để giải lặp) */
    const bioAtT = (srt, bH, muH, bA) => {
      const S0 = p.bcod_bod * st4.BOD, VSS = st4.TSS * p.vss_tss, nbVSS = (1 - ch.bp_p) * VSS, iTSS = st4.TSS - VSS;
      const S = p.Ks * (1 + bH * srt) / (srt * (muH - bH) - 1), A = Q * p.YH * (S0 - S) / (1 + bH * srt) / 1000, B = p.fd * bH * srt * A;
      let nox = 0.8 * st4.TKN, px = 0;
      for (let it = 1; it <= 5; it++) { const Cn = Q * p.YAOB * nox / (1 + bA * srt) / 1000; px = A + B + Cn; nox = Math.max(0, st4.TKN - NH4e - p.fN * px * 1000 / Q); }
      return { S, A, B, PXbio: px, NOx: nox, PXVSS: px + Q * nbVSS / 1000, PXTSS: px / 0.85 + Q * nbVSS / 1000 + Q * iTSS / 1000, nbVSS, iTSS };
    };
    const kinX = { bH: p.bH * Math.pow(1.04, I.Tmax - 20), muH: p.muH * Math.pow(1.07, I.Tmax - 20), bA: p.bAOB * Math.pow(1.029, I.Tmax - 20) };

    /* Nhu cầu oxy ở nhiệt độ nước cao nhất (M&E 5th: cấp khí tính ở T_max) – cùng SRT, cùng công thức PT (7-46), (8-20), (8-24), (8-23).
       Dùng các dòng của bioCommon trong cùng hạng mục; dn/dnX: NO₃-N khử bằng carbon nội tại (mg/L) lấy theo T_min (thiên an toàn) */
    function o2Tmax(s, Kc, dn, dnX, idRo) {
      const Tx = +I.Tmax, srt = Kc.SRT;
      const bHx = s.o('b_H,Tmax', 'b_H tại T_max', p.bH * Math.pow(1.04, Tx - 20), '1/ngày', 'b_H·1,04^(T_max−20)', 'PT (1-44)', '[bH]*1.04^([info.Tmax]-20)', 'bHx');
      const muHx = s.o('μ_max,H,Tmax', 'μmax,H tại T_max', p.muH * Math.pow(1.07, Tx - 20), '1/ngày', 'μ·1,07^(T_max−20)', 'PT (1-44)', '[muH]*1.07^([info.Tmax]-20)', 'muHx');
      const bAx = s.o('b_AOB,Tmax', 'b_AOB tại T_max', p.bAOB * Math.pow(1.029, Tx - 20), '1/ngày', 'b·1,029^(T_max−20)', 'Bảng 8-14', '[bA]*1.029^([info.Tmax]-20)', 'bAx');
      const S = s.o('S_Tmax', 'bCOD hòa tan còn lại ở T_max (cùng SRT)', p.Ks * (1 + bHx * srt) / (srt * (muHx - bHx) - 1), 'mg/L', 'K_s(1 + b·SRT)/[SRT(μmax − b) − 1]', 'PT (7-46)', '[Ks]*(1+[bHx]*[SRT])/([SRT]*([muHx]-[bHx])-1)', 'Sx');
      const A = s.o('A_Tmax', 'Sinh khối dị dưỡng ở T_max', Q * p.YH * (Kc.S0 - S) / (1 + bHx * srt) / 1000, 'kg VSS/ngđ', 'Q·Y_H(S₀ − S)/(1 + b_H·SRT)', 'PT (8-20)', '[Q]*[YH]*([S0]-[Sx])/(1+[bHx]*[SRT])/1000', 'Abx');
      const B = s.o('B_Tmax', 'Mảnh tế bào ở T_max', p.fd * bHx * srt * A, 'kg VSS/ngđ', 'f_d·b_H·SRT·A', 'PT (8-20)', '[fd]*[bHx]*[SRT]*[Abx]', 'Bbx');
      let nox = s.o('NOx⁽⁰⁾,Tmax', 'NOx khởi tạo (80 % TKN)', 0.8 * Kc.TKN, 'mg/L', 'Giá trị mồi', '', '0.8*[TKN]', 'NOxx0'), px = 0;
      for (let it = 1; it <= 5; it++) {
        const Cn = s.o(`C⁽${it}⁾,Tmax`, `Sinh khối nitrat hóa ở T_max – vòng ${it}`, Q * p.YAOB * nox / (1 + bAx * srt) / 1000, 'kg VSS/ngđ', 'Q·Y_n·NOx/(1 + b_n·SRT)', 'PT (8-20)', `[Q]*[YA]*[NOxx${it - 1}]/(1+[bAx]*[SRT])/1000`, 'Cx' + it);
        px = s.o(`P_X⁽${it}⁾,Tmax`, `Sinh khối tổng ở T_max – vòng ${it}`, A + B + Cn, 'kg VSS/ngđ', 'A + B + C', 'PT (8-20)', `[Abx]+[Bbx]+[Cx${it}]`, 'PXx' + it);
        nox = s.o(`NOx⁽${it}⁾,Tmax`, `N bị oxy hóa ở T_max – vòng ${it}`, Math.max(0, Kc.TKN - Kc.Ne - p.fN * px * 1000 / Q), 'mg/L', 'TKN − N_e − f_N·P_X,bio/Q', 'PT (8-24)', `MAX(0,[TKN]-[Ne]-[fN]*[PXx${it}]*1000/[Q])`, 'NOxx' + it);
      }
      s.o('P_X,bio,Tmax', 'Sinh khối sinh ra ở T_max', px, 'kg VSS/ngđ', '', 'PT (8-20)', '[PXx5]', 'PXbx');
      s.o('NOx_Tmax', 'N bị oxy hóa ở T_max', nox, 'mg/L', '', 'PT (8-24)', '[NOxx5]', 'NOxx');
      const d = s.o('NO₃ khử (SH),Tmax', 'NO₃-N khử bằng carbon nội tại (lấy theo T_min, ≤ NOx)', Math.min(dn, nox), 'mg/L', 'Thiên an toàn: SDNR ở T_min thấp hơn', '', `MIN(${dnX},[NOxx])`, 'dnx');
      const Ro = s.o('R₀', 'Nhu cầu oxy thực tế trung bình ngày ở T_max', Math.max(0, Q * (Kc.S0 - S) / 1000 - 1.42 * px + 4.57 * Q * nox / 1000 - 2.86 * Q * d / 1000), 'kgO₂/ngđ', 'R₀ = Q(S₀ − S) − 1,42·P_X,bio + 4,57·Q·NOx − 2,86·Q·NO₃ khử', 'PT (8-23); VD 8-7 bước 9', 'MAX(0,[Q]*([S0]-[Sx])/1000-1.42*[PXbx]+4.57*[Q]*[NOxx]/1000-2.86*[Q]*[dnx]/1000)', idRo);
      return { Ro, PXbio: px, NOx: nox, S };
    }

    if (bio === 'ICEAS') {
      /* ======== ICEAS – trình tự thiết kế theo SRT (M&E 5th): Bước 0 số liệu → 1 chu kỳ → 2 SRT → 3 bùn sinh ra → 4 khối bùn, F/M
         → 5 kích thước bể → 6 khử nitrat (vòng lặp với Bước 2) → 7 khử P (bùn hóa chất cộng vào Bước 3) → 8 oxy & sục khí (T_max)
         → 9 thủy lực & thiết bị → 10 kiểm tra T_min / T_max, xả bùn theo mùa. Chu trình NIT / NDN(P) của Sanitaire dùng làm cấu trúc chu kỳ. ======== */
      const u = ub;
      const nb = (+p.ic_nb) * nMod, Qb = Q / nb, icB = c.icFeed === 'batch';
      if (icB && nb < 2) warn('ICEAS nạp gián đoạn cần ≥ 2 bể (hoặc bể điều hòa) để luôn có bể nhận nước.');
      const kw = +p.ic_kw > 0 ? +p.ic_kw : +I.kmax, PDWF = Qb * I.kmax, PWWF = Qb * kw;
      const TWL = +p.ic_TWL, BZ = +p.ic_BZ, Xmax = +p.ic_MLSSmax;
      // SRT hiếu khí yêu cầu ở T_min – cùng công thức bioCommon mục 4 (PT 7-94, 7-98, SF chung)
      const SRTreqA = p.SF / (kin.muAOB_T * (NH4e / (NH4e + p.KNH4)) * (p.DO / (p.DO + p.KOA)) - kin.bAOB_T);
      const stabReq = c.stab === 'none' && +p.ic_stab > 0 ? +p.ic_SRTstab : 0;
      const SRTman = +p.ic_SRT > 0 ? +p.ic_SRT : 0;
      const TPtg = L.TP !== undefined ? L.TP * p.tp_margin : null;
      const needChem = TPtg !== null && c.chemP === 'auto' && c.chemPos !== 'post';
      const CG = DATA.COAG[c.coag] || DATA.COAG.pac, Me = CG.me, Mm = CG.M, MP = Me === 'Fe' ? 150.82 : 121.95, MOH = Me === 'Fe' ? 106.87 : 78.0;
      // khử P: đồng hóa sinh học, phần còn lại bằng muối kim loại (Me:P theo mol) → bùn MePO₄ + Me(OH)₃ – M&E mục 6-4, VD 6-1
      const pChem = PXVSS => {
        const Pass = p.fP * PXVSS * 1000 / Q, TPb = Math.max(0, st4.TP - Pass);
        if (!needChem || TPb <= TPtg) return { Pass, TPb, TPe: TPb, dP: 0, MMe: 0, X: 0, alk: 0 };
        const dP = TPb - TPtg, MMe = p[CG.MeP] * dP / 31 * Mm * Q / 1000;
        return { Pass, TPb, TPe: TPtg, dP, MMe, X: dP / 31 * MP * Q / 1000 + Math.max(0, MMe - dP / 31 * Mm * Q / 1000) / Mm * MOH, alk: MMe / Mm * 3 * 50 / Q * 1000 };
      };
      // hệ số chuyển AOR → SOTR (M&E 5th PT 5-70) ở T_max, độ ngập đĩa ic_sub
      const Cs20v = doSat(20), CsTv = doSat(I.Tmax), Cinfv = Cs20v * (1 + p.air_dmid * p.ic_sub / 10.33), Omv = patm / 101.325;
      const kSOTR = Cinfv / (CsTv / Cs20v * p.air_beta * Omv * Cinfv - p.DO) * Math.pow(1.024, 20 - I.Tmax) / (p.air_alpha * p.air_F);
      const S0v = p.bcod_bod * st4.BOD;
      /* ước lượng nhanh một chu kỳ v = [on, off, set, dec, on_bão, off_bão, set_bão, dec_bão] (phút) – cùng công thức các dòng tính bên dưới */
      const design = v => {
        const NCT = (v[0] + v[1] + v[2] + v[3]) / 60, SCT = (v[4] + v[5] + v[6] + v[7]) / 60, cyc = 24 / NCT, TA = v[0] * cyc / 60, ART = (v[1] + v[2] + v[3]) * cyc / 60;
        const fA = TA / 24, fN = ART / 24, SRTn = SRTreqA / fA, SRTo = Math.max(SRTn, +p.ic_SRTset, stabReq), SRT = SRTman > 0 ? SRTman : SRTo;
        const b = bioAtT(SRT, kin.bH_T, kin.muH_T, kin.bAOB_T), P = pChem(b.PXVSS);
        const Mt = (b.PXTSS + P.X) * SRT, Mb = Mt / nb, Vsl = Mb * p.SVI / 1000;
        const MVAB = icB ? Math.max(PDWF * NCT, PWWF * SCT) / 24 : Math.max(PDWF * (NCT - v[3] / 60), PWWF * (SCT - v[7] / 60)) / 24;
        // BA₁: lớp bùn + vùng đệm tối thiểu + thể tích nạp vừa TWL; BA₂: dùng hết TWL và MLSS tại BWL = MLSS_max (vùng đệm thực tế lớn hơn BZ)
        const BA1 = (Vsl + MVAB) / (TWL - BZ), BA2 = (Mb * 1000 / Xmax + MVAB) / TWL, BA = AF ? Math.max(BA1, BA2) : BA1;
        const DD = MVAB / BA, BWL = TWL - DD, W = ceilTo(Math.sqrt(BA / p.ic_LW), 0.5), Lb = ceilTo(BA / Math.sqrt(BA / p.ic_LW), 0.5);
        // Bước 6 – cân bằng NO₃ bể mẻ: Air-Off khuấy (cả bể tiếp xúc, nước vào liên tục mang carbon) + lớp bùn khi lắng/chắt (nội bào)
        const fOff = v[1] * cyc / 60 / 24, fSD = (v[2] + v[3]) * cyc / 60 / 24, MXb = b.A * SRT, FMb = Q * st4.BOD / 1000 / MXb;
        const capMix = fOff > 0 ? DNB.sdnrOf(FMb) * MXb * fOff : 0, capEnd = (1 - p.fd) * 1.42 * kin.bH_T * p.dn_eta * MXb * fSD / 2.86, Vbld = Vsl * cyc * nb;
        const BN = batchNO3({ Q, NOx: b.NOx, snd: +p.ic_SND || 0, dMix: capMix, dEnd: capEnd, Vbld });
        const req = Q * Math.max(0, b.NOx - NO3t) / 1000, cap = BN.mix + BN.end + BN.snd, dnB = cap * 1000 / Q, NO3e = Math.max(NO3t, BN.Ce), NO3den = b.NOx - NO3e;
        // carbon ngoài chỉ có tác dụng trong pha Air-Off khuấy (NIT không có pha này)
        const defC = fOff > 0 ? Math.max(0, Q * BN.NOa / 1000 - Q * NO3t / 1000 - Math.min(capEnd, NO3t * Vbld / 1000) - BN.mix) : 0;
        const NaOH = Math.max(0, p.alk_res - (st4.Alk - 7.14 * b.NOx + 3.57 * NO3den - P.alk)) * 0.8;
        const bx = bioAtT(SRT, kinX.bH, kinX.muH, kinX.bA);
        const Ro = Math.max(0, Q * (S0v - bx.S) / 1000 - 1.42 * bx.PXbio + 4.57 * Q * bx.NOx / 1000 - 2.86 * Q * Math.min(dnB, bx.NOx) / 1000);
        const SOTR = Ro * p.O2peak / TA / nb * kSOTR, Pair = SOTR / (1.201 * 0.232 * p.air_SOTE), BUC = Math.max(Pair, p.ic_MI * W * Lb);
        const pd = (BWL + DD) * 9.772 + p.ic_HL, Pw = BUC * 1.201 / 3600 * 0.287 * (32 + 273.15) / (0.283 * p.air_e) * (Math.pow((patm + pd) / patm, 0.283) - 1);
        const Emix = v[1] > 0 ? p.ic_mixW * W * Lb * TWL * nb / 1000 * v[1] * cyc / 60 : 0;
        const qin = icB ? 0 : 1, PDR = MVAB / v[3] + qin * PDWF / 1440, PWR = MVAB / v[7] + qin * PWWF / 1440, nOver = Math.max(1, Math.ceil(nb * (v[7] / 60) / SCT - 1e-9));
        return { ph: { on: v[0], off: v[1], set: v[2], dec: v[3], on_s: v[4], off_s: v[5], set_s: v[6], dec_s: v[7] }, NCT, SCT, cyc, TA, ART, fA, SRTn, SRTo, SRT, srtOK: SRT * fA >= SRTreqA - 1e-9,
          Mt, FM: Q * st4.BOD / 1000 / Mt, BA, W, Lb, BWL, DD, MVAB, MLSSb: Mb * 1000 / (BWL * BA), MLSSt: Mb * 1000 / (TWL * BA), HRT: BA * TWL / Qb * 24, Vtot: W * Lb * TWL * nb,
          req, cap, Ce: BN.Ce, deficit: defC, dnOK: BN.Ce <= NO3t + 1e-6, NO3e, TNe: NO3e + TKNe_est, NaOH, MeOH: defC * (2.86 / (1 - 1.42 * 0.3)) / 1.5,
          DL: ceilTo(Math.max(PDR / p.ic_WLR, PWR / p.ic_WLRs), 0.5), Qdec: PWR * 60 * nOver, BUC, Etot: Pw / 0.95 * TA * nb * p.air_LF + Emix };
      };
      /* ---- chu trình: NIT / NDN(P) chuẩn Sanitaire hoặc tự nhập; khuyến cáo theo yêu cầu khử nitrat và độ kiềm ---- */
      const CYC = { N: [120, 0, 60, 60, 90, 0, 45, 45], D: [96, 72, 60, 60, 72, 54, 45, 45], C: [p.ic_on, p.ic_off, p.ic_set, p.ic_dec, p.ic_on_s, p.ic_off_s, p.ic_set_s, p.ic_dec_s].map(Number) };
      const dN = design(CYC.N), dD = design(CYC.D), needDN = dN.req > 1e-6;
      const alkBetter = dN.NaOH > 0.5 && dD.NaOH < dN.NaOH - 0.5;
      const rec = !needDN ? (alkBetter ? 'D' : 'N') : (dN.dnOK && !alkBetter ? 'N' : 'D');
      const recName = rec === 'N' ? 'NIT' : 'NDN(P)', sel = c.icCycle || 'auto';
      const use = sel === 'auto' ? rec : sel === 'NIT' ? 'N' : sel === 'NDN' ? 'D' : 'C';
      const useName = use === 'N' ? 'NIT' : use === 'D' ? 'NDN(P)' : 'Tự nhập';
      const reasons = [];
      reasons.push(`NOx sinh ra ${fx(dN.req * 1000 / Q + NO3t)} mg/L, NO₃-N mục tiêu ${fx(NO3t)} mg/L → ${needDN ? `cần khử ${fx(dN.req)} kg N/ngđ` : 'không bắt buộc khử nitrat chủ động'}.`);
      if (needDN) reasons.push(`NIT chỉ khử nitrat trong lớp bùn khi lắng + chắt → NO₃-N nước chắt ${fx(dN.Ce)} mg/L (${dN.dnOK ? 'đạt' : 'vượt'} mục tiêu ${fx(NO3t)}); NDN(P) thêm pha Air-Off khuấy (cả bể tiếp xúc, nước vào mang carbon) → ${fx(dD.Ce)} mg/L (${dD.dnOK ? 'đạt' : 'thiếu ' + fx(dD.deficit) + ' kg N/ngđ – carbon ngoài hoặc tăng Air-Off'}).`);
      reasons.push(`SRT thiết kế (Bước 2): NIT ${fx(dN.SRT)} ngày (f_hk ${fx(dN.fA, 3)}), NDN(P) ${fx(dD.SRT)} ngày (f_hk ${fx(dD.fA, 3)}); thể tích ${fx(dN.Vtot, 0)} so với ${fx(dD.Vtot, 0)} m³.`);
      if (alkBetter) reasons.push(`Khử nitrat hoàn trả kiềm: NaOH ${fx(dD.NaOH)} mg/L (NDN(P)) so với ${fx(dN.NaOH)} mg/L (NIT).`);
      if (L.TP !== undefined) reasons.push(st4.BOD / st4.TP >= 30 ? 'BOD/TP ≥ 30: NDN(P) tạo điều kiện kỵ khí – thiếu khí hỗ trợ khử P sinh học; phần mềm chỉ tính P đồng hóa (thiên an toàn).' : `BOD/TP = ${fx(st4.BOD / st4.TP)} < 30: khử P sinh học hạn chế – khử P hóa học bổ trợ.`);
      /* ---- Bước 6 ↔ Bước 2: thiếu năng lực khử nitrat → tăng Air-Off, giảm Air-On (giữ thời gian chu kỳ); f_hk giảm nên SRT tính lại ---- */
      const v = CYC[use].slice(), v0 = v.slice();
      let dM_ = design(v);
      if (AF && needDN && !(use === 'C' && (MAN('ic_on') || MAN('ic_off')))) {
        // giới hạn: f_hk ≥ ic_fAmin và SRT ≤ 30 ngày (40 khi ổn định bùn) – M&E Bảng 8-19; vượt thì giữ bước trước, phần thiếu bù bằng carbon ngoài
        for (let it = 0; it < 30 && !dM_.dnOK; it++) {
          const w = v.slice(); w[0] -= 12; w[1] += 12; if (w[4] - 9 >= 9) { w[4] -= 9; w[5] += 9; }
          const t = design(w);
          if (t.fA < +p.ic_fAmin - 1e-9 || t.SRT > (stabReq > 0 ? 40 : 30)) break;
          v.splice(0, 8, ...w); dM_ = t;
        }
        if (v[1] !== v0[1]) fit('SH', 'ICEAS – Air-On / Air-Off chu kỳ thường', `${v0[0]}/${v0[1]}`, `${v[0]}/${v[1]}`, 'phút', `Bước 6: năng lực khử nitrat < yêu cầu → tăng Air-Off (giữ chu kỳ ${fx(dM_.NCT)} h); f_hk ${fx(design(v0).fA, 3)} → ${fx(dM_.fA, 3)}, SRT tính lại ở Bước 2`);
      }
      const adj = v[1] !== v0[1];
      const fA = dM_.fA, SRT = dM_.SRT;
      /* ================= các dòng tính (công thức sống) theo trình tự Bước 0 … 10 ================= */
      const s0 = u.sec('Bước 0. Số liệu đầu vào – lưu lượng, nhiệt độ, chế độ nạp');
      s0.i('N_mđ', 'Số bể ICEAS mỗi mô đun', +p.ic_nb, 'bể', '', '', 'nbm');
      s0.o('N', 'Tổng số bể ICEAS', nb, 'bể', 'N_mđ × số mô đun', '', '[nbm]*[info.nMod]', 'nb');
      s0.o('Q_b', 'Lưu lượng trung bình / bể', Qb, 'm³/ngđ', 'Q_tb/N', '', '[info.Q]/[nb]', 'Qb');
      s0.o('PDWF', 'Lưu lượng cao điểm mùa khô / bể', PDWF, 'm³/ngđ', 'Q_b·k_max', 'M&E Ch.3', '[Qb]*[info.kmax]', 'PDWF');
      s0.i('k_mưa', 'Hệ số cao điểm mùa mưa (so với Q_tb)', kw, '-', +p.ic_kw > 0 ? 'Nhập (tab 4)' : 'Chưa có số liệu mùa mưa → lấy bằng k_max', 'Số liệu đo / quy hoạch thoát nước', 'kw');
      s0.o('PWWF', 'Lưu lượng cao điểm mùa mưa / bể', PWWF, 'm³/ngđ', 'Q_b·k_mưa', '', '[Qb]*[kw]', 'PWWF');
      s0.o('T_min', 'Nhiệt độ nước thấp nhất – nitrat hóa, bùn sinh ra (Bước 2, 3)', T, '°C', '', 'M&E Bảng 8-14', '[info.T]', 'Tlo');
      s0.o('T_max', 'Nhiệt độ nước cao nhất – nhu cầu oxy (Bước 8)', +I.Tmax, '°C', '', 'M&E mục 5-11', '[info.Tmax]', 'Thi');
      s0.t2('Chế độ nạp nước', icB ? 'Gián đoạn theo mẻ như SBR – luân phiên giữa các bể, mỗi bể nạp Tc/N, không nạp khi lắng/gạn' : 'Liên tục – nước vào ngăn tiền phản ứng cả khi lắng/gạn (ICEAS chuẩn)', '', icB ? 'M&E 5th mục 8-5 (SBR)' : 'Sanitaire ICEAS');
      s0.note(`bCOD = ${fx(p.bcod_bod)}·BOD (1,6 với nước thải sinh hoạt; chọn theo loại hình nước thải – tab 4, M&E 5th mục 8-2). Tải lượng BOD, TKN, TP, TSS, VSS, nbVSS, iTSS và chất lượng nước ra (kể giới hạn TN, TP) ở các mục ngay sau.`);
      let s1 = null;
      const TT = t => /^1\./.test(t) ? 'Bước 0 (tiếp). Nước thải vào cụm sinh học (cột ④) – tải lượng — M&E Bảng 8-15 bước 1'
        : /^2\./.test(t) ? 'Bước 0 (tiếp). Hằng số động học (M&E 5th Bảng 8-14, 20 °C)'
        : /^3\./.test(t) ? 'Bước 0 (tiếp). Chất lượng nước ra yêu cầu (từ tiêu chuẩn xả)'
        : /^4\./.test(t) ? 'Bước 2. SRT thiết kế = max(nitrat hóa ở T_min; lắng tốt; ổn định bùn) — M&E PT (7-94), (7-98), Bảng 8-14'
        : /^5\./.test(t) ? 'Bước 3. Bùn sinh ra ở SRT thiết kế, nhiệt độ T_min — M&E PT (7-46)'
        : /^6\./.test(t) ? 'Bước 3 (tiếp). Sinh khối dị dưỡng, mảnh tế bào (f_d), vi khuẩn nitrat hóa, nbVSS, iTSS — M&E PT (8-20), (8-21), (8-24)' : t;
      const ph = dM_.ph;
      K = bioCommon(u, SRT, dM_.MLSSb, {
        noVolume: true, noSRTcheck: true, noMLSS: true, tt: TT, srtName: 'Tuổi bùn thiết kế SRT (toàn chu kỳ)', srtNote: SRTman > 0 ? 'Nhập tay (tab 4)' : 'max(SRT_N; SRT_lắng; SRT_ổn định)',
        srtX: SRTman > 0 ? '[SRTman]' : '[SRTo]',
        hookA: () => {
          s1 = u.sec('Bước 1. Cấu trúc chu kỳ – chu trình ' + useName + (sel === 'auto' ? ' (theo khuyến cáo)' : '') + (adj ? ' – đã tăng Air-Off ở Bước 6' : ''));
          const src = use === 'C' && !adj ? 'Tự nhập (tab 4)' : adj ? 'Bước 6 – tự điều chỉnh (R08)' : 'Sanitaire Cycle Charts';
          [['ton', 'Air-On (thường)', ph.on], ['toff', 'Air-Off có khuấy (thường)', ph.off], ['tset', 'Lắng (thường)', ph.set], ['tdec', 'Chắt (thường)', ph.dec],
           ['tons', 'Air-On (mùa mưa)', ph.on_s], ['toffs', 'Air-Off (mùa mưa)', ph.off_s], ['tsets', 'Lắng (mùa mưa)', ph.set_s], ['tdecs', 'Chắt (mùa mưa)', ph.dec_s]]
            .forEach(([k, n, x]) => s1.i(k.replace('t', 't_'), n, x, 'phút', '', src, k));
          s1.o('NCT', 'Thời gian chu kỳ thường', dM_.NCT, 'h', 'Σ pha/60', '', '([ton]+[toff]+[tset]+[tdec])/60', 'NCT');
          s1.o('SCT', 'Thời gian chu kỳ mùa mưa', dM_.SCT, 'h', '', '', '([tons]+[toffs]+[tsets]+[tdecs])/60', 'SCT');
          s1.o('n_ck', 'Số chu kỳ / ngày', dM_.cyc, 'chu kỳ', '24/NCT', '', '24/[NCT]', 'cyc');
          s1.o('TA', 'Thời gian sục khí / ngày', dM_.TA, 'h/ngày', 'Air-On·n_ck/60', '', '[ton]*[cyc]/60', 'TA');
          s1.o('ART', 'Thời gian không sục khí / ngày (Air-Off + lắng + chắt)', dM_.ART, 'h/ngày', '(Air-Off + Lắng + Chắt)·n_ck/60', 'Quy tắc R02', '([toff]+[tset]+[tdec])*[cyc]/60', 'ART');
          s1.o('f_hk', 'Tỷ lệ thời gian hiếu khí', fA, '-', 'f_hk = TA/24', 'M&E 5th mục 8-6', '[TA]/24', 'fhk');
          s1.o('f_tk', 'Tỷ lệ thời gian thiếu khí (không sục khí)', dM_.ART / 24, '-', 'ART/24', 'M&E 5th mục 8-6', '[ART]/24', 'ftk');
          if (icB) {
            const tF = dM_.NCT * 60 / nb, tFs = dM_.SCT * 60 / nb;
            s1.o('t_nạp', 'Thời gian nạp mỗi bể / chu kỳ thường', tF, 'phút', 'NCT/N', 'M&E mục 8-5', '[NCT]*60/[nb]', 'tF');
            s1.chk('Nạp gián đoạn: t_nạp ≤ Air-On + Air-Off', tF <= ph.on + ph.off + 1e-6, 'ĐẠT', 'KHÔNG ĐẠT – tăng số bể hoặc bố trí bể điều hòa', 'M&E mục 8-5', false, '[tF]<=[ton]+[toff]');
            s1.o('t_nạp,mưa', 'Thời gian nạp mỗi bể / chu kỳ mùa mưa', tFs, 'phút', 'SCT/N', '', '[SCT]*60/[nb]', 'tFs');
            s1.chk('Nạp gián đoạn (mùa mưa): t_nạp ≤ Air-On + Air-Off', tFs <= ph.on_s + ph.off_s + 1e-6, 'ĐẠT', 'KHÔNG ĐẠT – bố trí bể điều hòa', 'M&E mục 8-5', true, '[tFs]<=[tons]+[toffs]');
          }
          const cmp = [['f_hk / SRT thiết kế (ngày)', `${fx(dN.fA, 3)} / ${fx(dN.SRT)}`, `${fx(dD.fA, 3)} / ${fx(dD.SRT)}`], ['Thể tích công tác (m³)', fx(dN.Vtot, 0), fx(dD.Vtot, 0)],
            ['NO₃-N nước chắt (mg/L) / khử SH (kg N/ngđ)', `${fx(dN.Ce)} / ${fx(dN.cap)}`, `${fx(dD.Ce)} / ${fx(dD.cap)}`], ['NaOH (mg/L)', fx(dN.NaOH), fx(dD.NaOH)], ['Điện năng cụm ICEAS (kWh/ngđ)', fx(dN.Etot, 0), fx(dD.Etot, 0)]];
          cmp.forEach(([n, a, b2]) => s1.t2(n, `NIT: ${a}   |   NDN(P): ${b2}`, '', ''));
          s1.t2('Chu trình khuyến cáo', recName, '', 'Sanitaire ICEAS Cycle Charts; M&E 5th');
          reasons.forEach(t => s1.note('• ' + t));
          if (sel !== 'auto' && use !== 'C' && use !== rec) s1.note(`Lưu ý: chu trình khuyến cáo theo chất lượng nước là ${recName}.`);
        },
        hookB: (Kc, s3) => {
          s3.o('SRT_N', 'SRT tổng theo nitrat hóa ở T_min', Kc.SRTreq / fA, 'ngày', 'SRT_N = SRT_yc,hk/f_hk', 'M&E 5th mục 8-6', '[SRTreq]/[fhk]', 'SRTn');
          s3.i('SRT_lắng', 'SRT tối thiểu để bùn lắng tốt', +p.ic_SRTset, 'ngày', '3 – 5 ngày trở lên', 'M&E 5th mục 8-3', 'SRTset');
          const stX = stabReq > 0 ? (s3.i('SRT_ổđ', 'SRT ổn định bùn (sục khí kéo dài, không có công trình phân hủy bùn)', stabReq, 'ngày', '20 – 30 ngày', 'M&E Bảng 8-19', 'SRTstab'), ',[SRTstab]') : '';
          if (!stX) s3.t2('Ổn định bùn', c.stab !== 'none' ? 'Có công trình ổn định bùn (' + DATA.optName('stab', c.stab) + ') – không đặt SRT ổn định' : 'Không yêu cầu (tab 4: ic_stab = 0)', '', '');
          s3.o('SRT_yc,tk', 'SRT thiết kế yêu cầu', dM_.SRTo, 'ngày', 'max(SRT_N; SRT_lắng' + (stX ? '; SRT_ổđ' : '') + ')', 'Trình tự thiết kế theo SRT', `MAX([SRTn],[SRTset]${stX})`, 'SRTo');
          if (SRTman > 0) s3.i('SRT_nhập', 'SRT thiết kế nhập tay', SRTman, 'ngày', '0 = tự chọn theo SRT_yc,tk', 'Tab 4', 'SRTman');
        }
      });
      const sk2 = u.sec('Bước 2 (kiểm tra). SRT hiếu khí và các giới hạn SRT');
      const SRTae = sk2.o('SRT_hk', 'SRT hiếu khí thực tế', SRT * fA, 'ngày', 'SRT·f_hk', 'M&E 5th mục 8-6', '[SRT]*[fhk]', 'SRTae');
      sk2.chk('SRT hiếu khí ≥ SRT yêu cầu nitrat hóa ở T_min', SRTae >= K.SRTreq - 1e-9, 'ĐẠT', 'KHÔNG ĐẠT — tăng SRT hoặc tăng Air-On', 'M&E Bảng 8-15', false, '[SRTae]>=[SRTreq]-0.000000001');
      sk2.chk('SRT ≥ SRT tối thiểu cho lắng tốt', SRT >= +p.ic_SRTset - 1e-9, 'ĐẠT', 'KHÔNG ĐẠT — bùn lắng kém', 'M&E 5th mục 8-3', false, '[SRT]>=[SRTset]-0.000000001');
      if (stabReq > 0) sk2.chk('SRT ≥ SRT ổn định bùn', SRT >= stabReq - 1e-9, 'ĐẠT', 'BÙN CHƯA ỔN ĐỊNH — tăng SRT hoặc bố trí phân hủy bùn', 'M&E Bảng 8-19', true, '[SRT]>=[SRTstab]-0.000000001');
      sk2.chk('SRT trong khoảng 12 – 30 ngày (bể mẻ gạn nước; ≤ 40 ngày khi ổn định bùn kiểu sục khí kéo dài)', SRT >= 12 && SRT <= (stabReq > 0 ? 40 : 30), 'ĐẠT', 'NGOÀI KHOẢNG – xem lại', 'M&E Bảng 8-19', true, 'AND([SRT]>=12,[SRT]<=' + (stabReq > 0 ? 40 : 30) + ')');
      if (use !== 'N' && L.TP !== undefined) sk2.chk('Có khử P sinh học: SRT không quá dài (≤ 30 ngày)', SRT <= 30, 'ĐẠT', 'SRT DÀI – giảm hiệu quả khử P sinh học, dự phòng hóa chất', 'M&E Bảng 8-29', true, '[SRT]<=30');
      if (SRTman > 0 && SRTman < dM_.SRTo - 1e-9) warn(`ICEAS: SRT nhập tay ${fx(SRTman)} ngày < SRT yêu cầu ${fx(dM_.SRTo)} ngày – giữ giá trị nhập.`);

      /* Bước 3 (tiếp) + Bước 7: khử P – đồng hóa sinh học, phần còn lại bằng muối kim loại; bùn hóa chất cộng vào bùn sinh ra */
      const P = pChem(K.PXVSS);
      const sp = u.sec('Bước 3 (tiếp). Phốt pho & bùn hóa chất khử P đồng thời (chi tiết liều ở Bước 7) — M&E mục 6-4, VD 6-1, 8-13');
      sp.i('f_P', 'P đồng hóa trong sinh khối', p.fP, 'gP/gVSS', 'Chung mọi phương án (F15)', 'M&E VD 8-13', 'fPi');
      sp.o('P_đh', 'P khử bằng đồng hóa sinh học', P.Pass, 'mg/L', 'f_P·P_X,VSS/Q', 'M&E VD 8-13', '[fPi]*[PXVSS]*1000/[Q]', 'Passi');
      sp.o('TP_SH', 'TP còn lại sau khử sinh học', P.TPb, 'mg/L', 'max(0; TP − P_đh)', '', 'MAX(0,[TP]-[Passi])', 'TPbi');
      if (needChem) {
        sp.i('k_TP', 'Hệ số TP mục tiêu', p.tp_margin, '× giới hạn', '', '', 'tpmI');
        sp.o('TP_mt', 'TP mục tiêu', TPtg, 'mg/L', 'TP_gh × k', '', '[info.L_TP]*[tpmI]', 'TPti');
        sp.o('ΔP', 'P cần kết tủa hóa học', P.dP, 'mg/L', 'max(0; TP_SH − TP_mt)', '', 'MAX(0,[TPbi]-[TPti])', 'dPi');
        sp.i(Me + ':P', `Tỷ lệ mol ${Me}/P (${CG.name})`, p[CG.MeP], 'mol/mol', Me === 'Fe' ? '2,0 – 3,5' : '1,5 – 3,0', 'M&E mục 6-4', 'MePi');
        sp.o('M_' + Me, Me + ' cần cho kết tủa P', P.MMe, 'kg/ngđ', `(${Me}:P)·ΔP/31·${Mm}·Q`, 'M&E mục 6-4', `[MePi]*[dPi]/31*${Mm}*[Q]/1000`, 'MMei');
        sp.o('ΔX_hc', `Bùn hóa chất (${Me}PO₄ + ${Me}(OH)₃)`, P.X, 'kg TSS/ngđ', `ΔP/31·${MP} + (M_${Me} − ΔP/31·${Mm})/${Mm}·${MOH}`, 'M&E VD 6-1', `[dPi]/31*${MP}*[Q]/1000+MAX(0,[MMei]-[dPi]/31*${Mm}*[Q]/1000)/${Mm}*${MOH}`, 'Xch');
        sp.o('TP_e', 'TP ra sau khử P', P.TPe, 'mg/L', 'min(TP_SH; TP_mt)', '', 'MIN([TPbi],[TPti])', 'TPbio');
      } else {
        sp.o('ΔX_hc', 'Bùn hóa chất', 0, 'kg TSS/ngđ', needChem ? '' : 'Không khử P hóa học trong bể sinh học', '', '0', 'Xch');
        sp.o('TP_e', 'TP ra sau khử sinh học', P.TPe, 'mg/L', '', '', '[TPbi]', 'TPbio');
      }
      const PXtot = sp.o('P_X,TSS,tổng', 'Bùn sinh ra tổng ở T_min (sinh học + hóa chất)', K.PXTSS + P.X, 'kg TSS/ngđ', 'P_X,TSS + ΔX_hc', 'M&E Bảng 8-10', '[PXTSS]+[Xch]', 'PXtot');

      const s4 = u.sec('Bước 4. Khối lượng bùn trong bể và F/M kiểm tra');
      const Mt = s4.o('M_TSS', 'Khối lượng bùn cần giữ trong hệ', PXtot * SRT, 'kg TSS', 'M = P_X,TSS·SRT', 'M&E VD 8-3 bước 10', '[PXtot]*[SRT]', 'Mtss');
      const BMOB = s4.o('BMOB', 'Khối lượng bùn mỗi bể', Mt / nb, 'kg/bể', 'M/N', '', '[Mtss]/[nb]', 'BMOB');
      const dMb = s4.o('ΔM', 'Khối lượng bùn sinh ra mỗi bể (bùn xả)', PXtot / nb, 'kg/ngđ/bể', 'P_X,TSS,tổng/N', 'Quy tắc R06', '[PXtot]/[nb]', 'dM');
      const FM = s4.o('F/M', 'Tỷ số F/M (theo MLSS)', Q * st4.BOD / 1000 / Mt, 'kgBOD/kgMLSS·d', 'Q·BOD/M', 'M&E Bảng 8-19', '[Q]*[BOD]/1000/[Mtss]', 'FMi');
      s4.o('f_VSS', 'Tỷ lệ VSS/TSS của bùn', K.PXVSS / PXtot, '-', 'P_X,VSS/P_X,TSS,tổng', '', '[PXVSS]/[PXtot]', 'vssi');
      s4.o('F/M_VSS', 'Tỷ số F/M theo MLVSS (so sánh với C-Tech)', FM / (K.PXVSS / PXtot), 'kgBOD/kgMLVSS·d', 'F/M/f_VSS', 'Quy tắc F02', '[FMi]/[vssi]', 'FMvi');
      s4.chk('F/M trong khoảng 0,04 – 0,10 (kiểm tra; SRT chi phối)', FM >= 0.04 && FM <= 0.1, 'ĐẠT', 'NGOÀI KHOẢNG – SRT đã chọn ở Bước 2 quyết định', 'M&E Bảng 8-19', true, 'AND([FMi]>=0.04,[FMi]<=0.1)');

      const s5 = u.sec('Bước 5. Kích thước bể (thể tích bể, mực nước, MLSS tại BWL)');
      s5.i('SVI', 'SVI thiết kế', p.SVI, 'mL/g', 'Khoảng 150 mL/g (an toàn)', 'Quy tắc R03', 'SVIi');
      const Vsl = s5.o('V_bùn', 'Thể tích lớp bùn mỗi bể', BMOB * p.SVI / 1000, 'm³/bể', 'BMOB·SVI/1000', 'M&E PT (8-50)', '[BMOB]*[SVIi]/1000', 'Vbio');
      s5.o('MVAB', icB ? 'Thể tích nạp lớn nhất mỗi chu kỳ (nạp gián đoạn)' : 'Thể tích nạp giữa hai lần xả (lớn hơn của mùa khô / mùa mưa)', dM_.MVAB, 'm³/bể', icB ? 'max(PDWF·NCT; PWWF·SCT)/24' : 'max(PDWF·(NCT − t_chắt); PWWF·(SCT − t_chắt,mưa))/24', icB ? 'M&E mục 8-5' : 'Sanitaire ICEAS',
        icB ? 'MAX([PDWF]*[NCT]/24,[PWWF]*[SCT]/24)' : 'MAX([PDWF]*([NCT]-[tdec]/60)/24,[PWWF]*([SCT]-[tdecs]/60)/24)', 'MVAB');
      s5.i('TWL', 'Mực nước đỉnh', TWL, 'm', '', 'Sanitaire ICEAS', 'TWL');
      s5.i('BZ', 'Vùng đệm trên lớp bùn', BZ, 'm', '0,6 – 1,0', 'Sanitaire ICEAS', 'BZ');
      s5.i('MLSS_max', 'MLSS tối đa tại mực nước đáy', Xmax, 'mg/L', '4.500 – 5.000', 'M&E Bảng 8-19', 'Xmax');
      s5.o('BA₁', 'Diện tích theo thể tích (bùn + nạp) trong TWL − BZ', (Vsl + dM_.MVAB) / (TWL - BZ), 'm²/bể', '(V_bùn + MVAB)/(TWL − BZ)', '', '([Vbio]+[MVAB])/([TWL]-[BZ])', 'BA1');
      s5.o('BA₂', 'Diện tích để MLSS tại BWL = MLSS_max khi dùng hết TWL', (BMOB * 1000 / Xmax + dM_.MVAB) / TWL, 'm²/bể', '(BMOB/MLSS_max + MVAB)/TWL', '', '([BMOB]*1000/[Xmax]+[MVAB])/[TWL]', 'BA2');
      const BA = s5.o('BA', 'Diện tích bể yêu cầu', dM_.BA, 'm²/bể', AF ? 'max(BA₁; BA₂)' : 'BA₁ (R08 tắt – chỉ kiểm tra MLSS)', AF ? 'Quy tắc R08' : '', AF ? 'MAX([BA1],[BA2])' : '[BA1]', 'BA');
      const DD = s5.o('DD', 'Chiều cao chắt nước (mực đỉnh − mực đáy)', dM_.DD, 'm', 'MVAB/BA', '', '[MVAB]/[BA]', 'DD');
      const BWL = s5.o('BWL', 'Mực nước đáy', dM_.BWL, 'm', 'TWL − DD', '', '[TWL]-[DD]', 'BWL');
      const SD = s5.o('SD', 'Chiều sâu lớp bùn', Vsl / BA, 'm', 'V_bùn/BA', '', '[Vbio]/[BA]', 'SD');
      s5.o('BZ_tt', 'Vùng đệm thực tế trên lớp bùn', BWL - SD, 'm', 'BWL − SD', '', '[BWL]-[SD]', 'BZtt');
      s5.chk('Vùng đệm thực tế ≥ vùng đệm tối thiểu', BWL - SD >= BZ - 1e-6, 'ĐẠT', 'THIẾU – cuốn bùn khi xả', 'Sanitaire ICEAS', false, '[BZtt]>=[BZ]-0.000001');
      const MLSSb = s5.o('MLSS_BWL', 'MLSS tại mực nước đáy', dM_.MLSSb, 'mg/L', 'BMOB/(BWL·BA)', 'Sanitaire ICEAS', '[BMOB]*1000/([BWL]*[BA])', 'MLSSb');
      s5.chk('MLSS tại BWL ≤ MLSS tối đa', MLSSb <= Xmax + 1e-6, 'ĐẠT', 'VƯỢT – tăng diện tích bể (bật R08) hoặc giảm SRT', 'M&E Bảng 8-19', false, '[MLSSb]<=[Xmax]+0.000001');
      s5.o('MLSS_TWL', 'MLSS tại mực nước đỉnh (so sánh với C-Tech)', dM_.MLSSt, 'mg/L', 'BMOB/(TWL·BA)', 'F17', '[BMOB]*1000/([TWL]*[BA])', 'MLSSt');
      s5.i('L:W', 'Tỷ lệ dài/rộng', p.ic_LW, '-', '', '', 'LW');
      const W = s5.o('W', 'Chiều rộng bể (trong lòng)', dM_.W, 'm', '√(BA/(L:W)), làm tròn 0,5 m', '', 'CEILING(SQRT([BA]/[LW]),0.5)', 'W');
      const Lb = s5.o('L', 'Chiều dài bể (trong lòng)', dM_.Lb, 'm', 'BA/√(BA/(L:W)), làm tròn 0,5 m', '', 'CEILING([BA]/SQRT([BA]/[LW]),0.5)', 'Lb');
      const HRT = s5.o('HRT', 'Thời gian lưu nước', dM_.HRT, 'h', 'BA·TWL/Q_b', 'M&E Bảng 8-19', '[BA]*[TWL]/[Qb]*24', 'HRT');
      s5.chk('HRT trong khoảng 20 – 40 h (bể mẻ gạn nước)', HRT >= 20 && HRT <= 40, 'ĐẠT', 'NGOÀI KHOẢNG – xem lại', 'M&E Bảng 8-19', true, 'AND([HRT]>=20,[HRT]<=40)');
      s5.o('V_tổng', 'Tổng thể tích công tác (TWL)', dM_.Vtot, 'm³', 'W·L·TWL·N', '', '[W]*[Lb]*[TWL]*[nb]', 'Vtot');

      /* Bước 6. Khử nitrat – vòng lặp với Bước 2 (đã giải ở trên: thiếu thì tăng Air-Off, f_hk giảm, SRT tính lại) */
      const s6 = u.sec('Bước 6. Kiểm tra khử nitrat (vòng lặp với Bước 2) — cân bằng NO₃ bể mẻ, M&E 5th mục 8-6, 8-7, PT (8-56) – (8-58)');
      s6.note('NO₃ chỉ được khử khi tiếp xúc với bùn: pha Air-Off có khuấy – cả bể, nước vào liên tục mang carbon (SDNR theo F/M_b); pha lắng + chắt – chỉ NO₃ trong lớp bùn, khử nitrat nội bào; lớp nước trong phía trên lớp bùn được chắt ra với nồng độ cuối pha sục khí C_e. Khử nitrat đồng thời SND chỉ tính khi có số liệu (ic_SND, mặc định 0).');
      const reqN = s6.o('NO_r,yc', 'N cần khử (cân bằng N: NOx − NO₃-N mục tiêu)', dM_.req, 'kg N/ngđ', 'Q·max(0; NOx − NO₃_t)', 'M&E PT (8-24)', '[Q]*MAX(0,[NOx]-[NO3t])/1000', 'reqDN');
      const MXb = s6.o('M_Xb', 'Sinh khối dị dưỡng hoạt tính trong hệ', K.A * SRT, 'kg VSS', 'A·SRT', 'M&E PT (7-42)', '[Ab]*[SRT]', 'MXb');
      const fOff = s6.o('f_off', 'Tỷ lệ thời gian Air-Off có khuấy', ph.off * dM_.cyc / 60 / 24, '-', 'Air-Off·n_ck/(60·24)', '', '[toff]*[cyc]/60/24', 'foff');
      const fSD = s6.o('f_lắng+chắt', 'Tỷ lệ thời gian lắng + chắt', (ph.set + ph.dec) * dM_.cyc / 60 / 24, '-', '(Lắng + Chắt)·n_ck/(60·24)', '', '([tset]+[tdec])*[cyc]/60/24', 'fsd');
      const FMb = s6.o('F/M_b', 'F/M trên sinh khối hoạt tính (nước vào trong pha Air-Off / sinh khối tiếp xúc)', Q * st4.BOD / 1000 / MXb, 'g/g·d', '(Q·BOD·f_off)/(M_Xb·f_off) = Q·BOD/M_Xb', 'M&E PT (8-56)', '[Q]*[BOD]/1000/[MXb]', 'FMb');
      s6.i('b₀', 'Hệ số b₀ (nội suy theo %rbCOD = ' + fx(DNB.pctB) + ')', DNB.b0, '-', '', 'M&E Bảng 8-22', 'b0'); s6.i('b₁', 'Hệ số b₁', DNB.b1, '-', '', 'M&E Bảng 8-22', 'b1');
      s6.o('SDNR_b', 'SDNR ở T_min', DNB.sdnrOf(FMb), 'g/g·d', 'F/M ≤ 0,5: 0,24·F/M (8-58); > 0,5: b₀ + b₁·ln(F/M) (8-57); × 1,026^(T−20)', 'M&E 5th tr.806, 808', 'IF([FMb]<=0.5,0.24*[FMb],[b0]+[b1]*LN([FMb]))*1.026^([info.T]-20)', 'SDNRb');
      const capMix = s6.o('D_trộn', 'Năng lực khử nitrat pha Air-Off khuấy', DNB.sdnrOf(FMb) * MXb * fOff, 'kg N/ngđ', 'SDNR_b·M_Xb·f_off', 'M&E PT (8-52)', '[SDNRb]*[MXb]*[foff]', 'capMix');
      s6.i('η', 'Hệ số tốc độ thiếu khí so với hiếu khí', p.dn_eta, '-', 'ASM1 0,8 (khoảng 0,6 – 0,8) – M&E không cho giá trị riêng; hiệu chỉnh bằng thí nghiệm NUR / số liệu NO₃ (tab 4: dn_eta)', 'IWA ASM1; M&E 5th mục 8-7', 'etaN');
      const capEnd = s6.o('D_nội bào', 'Năng lực khử nitrat nội bào pha lắng + chắt', (1 - p.fd) * 1.42 * kin.bH_T * p.dn_eta * MXb * fSD / 2.86, 'kg N/ngđ', '(1 − f_d)·1,42·b_H·η·M_Xb·f_lắng+chắt/2,86', 'M&E PT (8-20), (8-65)', '(1-[fd])*1.42*[bHT]*[etaN]*[MXb]*[fsd]/2.86', 'capEnd');
      const Vbld = s6.o('V_bùn,ngày', 'Thể tích lớp bùn × số chu kỳ × số bể', Vsl * dM_.cyc * nb, 'm³/ngđ', 'V_bùn·n_ck·N', 'M&E PT (8-50)', '[Vbio]*[cyc]*[nb]', 'Vbld');
      s6.i('η_SND', 'Khử nitrat đồng thời trong pha sục khí (phần NOx)', +p.ic_SND || 0, '-', '0 khi thiết kế; chỉ đặt khi có số liệu điều khiển DO', 'M&E 5th mục 8-7', 'icSND');
      const NOxa = s6.o('NOx_SND', 'NOx sau khử nitrat đồng thời', K.NOx * (1 - (+p.ic_SND || 0)), 'mg/L', 'NOx·(1 − η_SND)', '', '[NOx]*(1-[icSND])', 'NOxa');
      const BN = batchNO3({ Q, NOx: K.NOx, snd: +p.ic_SND || 0, dMix: capMix, dEnd: capEnd, Vbld });
      const Ce = s6.i('C_e', 'NO₃-N cuối pha sục khí (= nước chắt) – giải cân bằng NO₃', BN.Ce, 'mg/L', 'Q·NOx_SND = Q·C_e + min(D_trộn; Q·NOx_SND) + min(D_nội bào; C_e·V_bùn,ngày) – giải chia đôi', 'M&E 5th mục 8-6', 'Ce');
      const dMix = s6.o('ΔN_trộn', 'NO₃ khử trong pha Air-Off khuấy', Math.min(capMix, Q * NOxa / 1000), 'kg/ngđ', 'min(D_trộn; Q·NOx_SND)', '', 'MIN([capMix],[Q]*[NOxa]/1000)', 'dnMix');
      const dEnd = s6.o('ΔN_lắng', 'NO₃ khử trong lớp bùn (lắng + chắt)', Math.min(capEnd, Ce * Vbld / 1000), 'kg/ngđ', 'min(D_nội bào; C_e·V_bùn,ngày)', '', 'MIN([capEnd],[Ce]*[Vbld]/1000)', 'dnEnd');
      const dSnd = s6.o('ΔN_SND', 'NO₃ khử đồng thời trong pha sục khí', Q * K.NOx * (+p.ic_SND || 0) / 1000, 'kg/ngđ', 'Q·NOx·η_SND', '', '[Q]*[NOx]*[icSND]/1000', 'dnSnd');
      const res6 = s6.o('Sai số cân bằng', 'Q·NOx_SND − (Q·C_e + ΔN_trộn + ΔN_lắng)', Q * NOxa / 1000 - Q * Ce / 1000 - dMix - dEnd, 'kg/ngđ', '≈ 0', '', '[Q]*[NOxa]/1000-[Q]*[Ce]/1000-[dnMix]-[dnEnd]', 'Nbal');
      s6.chk('Cân bằng NO₃ hội tụ', Math.abs(res6) <= 1e-3 * Math.max(1, Q * NOxa / 1000), 'ĐẠT', 'CHƯA HỘI TỤ', '', false, 'ABS([Nbal])<=0.001*MAX(1,[Q]*[NOxa]/1000)');
      const cap = s6.o('NO_r,kn', 'NO₃ khử bằng carbon nội tại (Air-Off + lớp bùn + SND)', dMix + dEnd + dSnd, 'kg N/ngđ', 'ΔN_trộn + ΔN_lắng + ΔN_SND', '', '[dnMix]+[dnEnd]+[dnSnd]', 'cap');
      if (adj) s6.note(`Bước 6 → Bước 2: chu trình ban đầu ${v0[0]}/${v0[1]}/${v0[2]}/${v0[3]} phút không đủ khử nitrat → tăng Air-Off còn ${v[0]}/${v[1]}/${v[2]}/${v[3]} phút; f_hk giảm nên SRT_N và bùn sinh ra (Bước 3) được tính lại.`);
      // carbon ngoài: châm trong pha Air-Off khuấy để NO₃ nước chắt = mục tiêu (chu trình NIT không có pha này → không có tác dụng)
      const defN = s6.o('ΔN_thiếu', 'NO₃ cần khử thêm bằng carbon ngoài trong pha Air-Off', ph.off > 0 ? Math.max(0, Q * NOxa / 1000 - Q * NO3t / 1000 - Math.min(capEnd, NO3t * Vbld / 1000) - dMix) : 0, 'kg N/ngđ', ph.off > 0 ? 'max(0; Q·NOx_SND − Q·NO₃_t − min(D_nội bào; NO₃_t·V_bùn,ngày) − ΔN_trộn)' : 'NIT: không có pha Air-Off khuấy', '', ph.off > 0 ? 'MAX(0,[Q]*[NOxa]/1000-[Q]*[NO3t]/1000-MIN([capEnd],[NO3t]*[Vbld]/1000)-[dnMix])' : '0', 'defN');
      s6.chk('NO₃-N nước chắt ≤ mục tiêu ' + fx(NO3t) + ' mg/L (không carbon ngoài)', Ce <= NO3t + 1e-6, 'ĐẠT', ph.off > 0 ? (c.carbon === 'auto' ? 'THIẾU — bổ sung carbon ngoài trong pha Air-Off (tự động)' : 'THIẾU — tăng Air-Off hoặc carbon ngoài') : 'THIẾU — chu trình NIT chỉ khử nitrat trong lớp bùn: dùng NDN(P)', 'M&E 5th mục 8-6, 8-7', c.carbon === 'auto' && ph.off > 0, '[Ce]<=[NO3t]+0.000001');
      let carbon = { M: 0, sl: 0 }, useC = false;
      if ((defN > 1e-6 || p.meoh_set > 0) && c.carbon === 'auto' && ph.off > 0) { carbon = extCarbon(s6, defN, '[defN]'); useC = true; }
      const NO3e = s6.o('NO₃_e', 'NO₃-N ra', Math.max(NO3t, useC ? NO3t : Ce), 'mg/L', useC ? 'NO₃_t (đủ carbon ngoài)' : 'max(NO₃_t; C_e)', '', useC ? '[NO3t]' : 'MAX([NO3t],[Ce])', 'NO3e');
      if (Ce > NO3t + 1e-6 && !useC) warn(`ICEAS: NO₃-N nước chắt ${fx(Ce)} mg/L > mục tiêu ${fx(NO3t)} mg/L – ${ph.off > 0 ? 'tăng Air-Off hoặc bật carbon ngoài' : 'chu trình NIT chỉ khử nitrat trong lớp bùn khi lắng – dùng NDN(P)'}.`);
      const NO3den = s6.o('NO₃_dn', 'NO₃-N được khử', K.NOx - NO3e, 'mg/L', 'NOx − NO₃_e', '', '[NOx]-[NO3e]', 'NO3den');
      const NO3dnB = s6.o('NO₃_dn,SH', 'NO₃-N khử bằng carbon nội tại', Math.min(NO3den, cap * 1000 / Q), 'mg/L', 'min(NO₃_dn; NO_r,kn/Q)', '', 'MIN([NO3den],[cap]*1000/[Q])', 'NO3dnB');
      s6.i('μDN', 'Tốc độ khử nitrat Sanitaire ở 20 °C (chỉ đối chiếu)', p.ic_muDN, 'gNO₃/gMLVSS·h', 'θ = 1,09', 'Sanitaire ICEAS', 'muDN');
      s6.o('NO_r,San', 'Công suất khử nitrat theo μDN Sanitaire (đối chiếu)', p.ic_muDN * Math.pow(1.09, T - 20) * K.PXVSS / PXtot * Mt * dM_.ART, 'kg N/ngđ', 'μDN(T)·VSS/TSS·M·ART', 'Sanitaire ICEAS', '[muDN]*1.09^([info.T]-20)*[vssi]*[Mtss]*[ART]', 'capSan');

      /* Bước 7. Khử phốt pho: liều hóa chất theo mol Me:P (bùn hóa chất đã cộng vào Bước 3) */
      const s7 = u.sec('Bước 7. Khử phốt pho – P sinh học & liều hóa chất (bùn hóa chất cộng vào Bước 3) — M&E mục 6-4');
      s7.o('P_SH', 'P khử bằng sinh học (đồng hóa)', P.Pass, 'mg/L', 'Bước 3', 'M&E VD 8-13', '[Passi]', 'Pbio7');
      let chemAlk = null;
      if (needChem && P.dP > 0) {
        s7.t2('Hóa chất', DATA.optName('coag', c.coag || 'pac'), '', 'Tab 3 – Hóa chất keo tụ');
        const fr = s7.i('%' + Me, 'Hàm lượng ' + Me + ' trong ' + CG.name, CG.frac(p), 'kg/kg', '', 'Chứng chỉ sản phẩm', 'fMe7');
        const dose = s7.o('C_hc', `Liều ${CG.name} (sản phẩm)`, P.MMe / fr / Q * 1000, 'mg/L', `M_${Me}/(%${Me})/Q`, 'M&E mục 6-4', '[MMei]/[fMe7]/[Q]*1000', 'cChi');
        const Mch = s7.o('M_hc', `${CG.name} tiêu thụ`, dose * Q / 1000, 'kg/ngđ', 'C·Q/1000', '', '[cChi]*[Q]/1000', 'Mchi');
        chemAlk = { v: P.alk, x: `[MMei]/${Mm}*3*50/[Q]*1000` };
        s7.o('ΔAlk_hc', 'Độ kiềm tiêu thụ do thủy phân muối kim loại', P.alk, 'mg CaCO₃/L', '3 đương lượng / mol ' + Me, 'M&E mục 6-3', chemAlk.x, 'dAlk7');
        s7.note(`Bùn hóa chất ${fx(P.X)} kg/ngđ đã cộng vào bùn sinh ra (Bước 3) → khối bùn, thể tích bể (Bước 4, 5) tính với tổng này.`);
        R.chem.push({ name: `${CG.name} – khử P đồng thời trong bể ICEAS`, dose, kg: Mch, unit: 'kg sản phẩm', price: CG.price, note: 'M&E mục 6-4', ref: u.ids.Mchi, sol: CG.sol ? p[CG.sol] : 1, rho: CG.rho ? p[CG.rho] : Me === 'Fe' ? 1.4 : 1.25 });
      } else s7.note(TPtg === null ? 'Tiêu chuẩn xả không khống chế TP.' : P.TPb <= TPtg ? 'TP sau khử sinh học đạt mục tiêu – không cần hóa chất.' : 'Khử P hóa học không đặt trong bể sinh học (xem lựa chọn "Khử P hóa học" / hóa lý bậc 3).');
      s7.o('TP_ra', 'TP ra sau cụm ICEAS', P.TPe, 'mg/L', '', '', '[TPbio]', 'TP7');

      /* Bước 8. Nhu cầu oxy ở T_max, hệ số tải đỉnh, SOTR, lưu lượng khí, khuấy trộn tối thiểu */
      const s8 = u.sec('Bước 8. Nhu cầu oxy (nhiệt độ cao nhất) & hệ thống sục khí — M&E PT (8-23), (5-70), (5-77a)');
      const OX = o2Tmax(s8, K, NO3dnB, '[NO3dnB]', 'R0');
      const pk = s8.i('k_đỉnh', 'Hệ số tải đỉnh nhu cầu oxy', p.O2peak, '-', '1,5 – 2,0', 'M&E VD 8-3 bước 13', 'pk');
      s8.o('AOR', 'Tổng nhu cầu oxy thực tế mỗi bể (trung bình ngày)', OX.Ro / nb, 'kgO₂/ngđ/bể', 'R₀/N', '', '[R0]/[nb]', 'AORt');
      const AORh = s8.o('AOR_h', 'Tốc độ cấp oxy giờ cao điểm mỗi bể (trong giờ sục khí)', OX.Ro * pk / dM_.TA / nb, 'kgO₂/h/bể', 'R₀·k_đỉnh/(TA·N)', '', '[R0]*[pk]/[TA]/[nb]', 'AORh');
      const C20 = s8.o('C*s,20', 'DO bão hòa 20 °C, 1 atm', Cs20v, 'mg/L', 'APHA 4500-O', 'M&E Phụ lục E', doSatX(20), 'C20');
      const CTm = s8.o('C*s,T', 'DO bão hòa ở T_max', CsTv, 'mg/L', 'APHA 4500-O tại T_max', 'M&E Phụ lục E', doSatX('[info.Tmax]'), 'CT');
      s8.i('D_f', 'Độ ngập đĩa', p.ic_sub, 'm', '', '', 'sub'); s8.i('d_e', 'Hệ số hiệu chỉnh giữa cột nước', p.air_dmid, '-', '0,25 – 0,45 (0,40)', 'M&E 5th tr.420', 'dmidA');
      const Cinf = s8.o('C*∞,20', 'DO bão hòa ở độ ngập, 20 °C', Cinfv, 'mg/L', 'C*s,20·[1 + d_e·D_f/10,33]', 'M&E 5th PT (5-70)', '[C20]*(1+[dmidA]*[sub]/10.33)', 'Cinf');
      s8.o('τ', 'Hệ số hiệu chỉnh nhiệt độ DO bão hòa', CTm / C20, '-', 'C*s,T/C*s,20', 'M&E 5th PT (5-70)', '[CT]/[C20]', 'tauA');
      s8.o('Ω', 'Hệ số hiệu chỉnh áp suất', Omv, '-', 'P_b/P_s', 'M&E 5th PT (5-70)', '[info.patm]/101.325', 'OmA');
      s8.i('α', 'Hệ số α', p.air_alpha, '-', '', 'Quy tắc R05', 'alA'); s8.i('β', 'Hệ số β', p.air_beta, '-', '0,95 – 0,98', 'M&E 5th tr.420', 'beA'); s8.i('F', 'Hệ số bám bẩn', p.air_F, '-', '', 'Quy tắc R05', 'FfA');
      s8.i('DO', 'DO vận hành', p.DO, 'mg/L', '', '', 'DOi');
      const SOTR = s8.o('SOTR', 'Tốc độ truyền oxy tiêu chuẩn mỗi bể', AORh * kSOTR, 'kgO₂/h/bể', 'AOR_h·C*∞,20/(τ·β·Ω·C*∞,20 − DO)·1,024^(20−T_max)/(α·F)', 'M&E 5th PT (5-70)', '[AORh]*[Cinf]/([tauA]*[beA]*[OmA]*[Cinf]-[DOi])*1.024^(20-[info.Tmax])/([alA]*[FfA])', 'SOTRi');
      s8.i('SOTE', 'Hiệu suất truyền oxy tiêu chuẩn', p.air_SOTE, '-', 'Catalogue', 'Quy tắc R05', 'SOTEi');
      const Pair = s8.o('Q_khí,CN', 'Lưu lượng khí công nghệ mỗi bể', SOTR / (1.201 * 0.232 * p.air_SOTE), 'm³/h', 'SOTR/(ρ·%O₂·SOTE), khí chuẩn 20 °C', 'M&E VD 8-3 bước 14', '[SOTRi]/(1.201*0.232*[SOTEi])', 'Pair');
      s8.i('MI', 'Cường độ khí khuấy trộn tối thiểu', p.ic_MI, 'm³/h·m²', '', 'Sanitaire ICEAS', 'MI');
      const Mix = s8.o('Q_khí,trộn', 'Lưu lượng khí tối thiểu cho khuấy trộn', p.ic_MI * W * Lb, 'm³/h', 'MI·W·L', '', '[MI]*[W]*[Lb]', 'Mix');
      s8.chk('Khí công nghệ ≥ khí khuấy trộn tối thiểu', Pair >= Mix, 'ĐẠT', 'KHÔNG – khí chọn theo khuấy trộn', 'M&E mục 5-11', true, '[Pair]>=[Mix]');
      const BUC = s8.o('BUC', 'Lưu lượng khí máy thổi mỗi bể', Math.max(Pair, Mix), 'm³/h', 'max(khí CN; khí trộn)', '', 'MAX([Pair],[Mix])', 'BUC');
      s8.i('q_đĩa', 'Lưu lượng khí mỗi đĩa', p.air_qd, 'm³/h·đĩa', 'Catalogue, 1 – 8', 'Quy tắc R05', 'qdi');
      const nd = s8.o('n_đĩa', 'Số đĩa / bể', Math.ceil(BUC / p.air_qd - 1e-9), 'đĩa', 'BUC/q_đĩa', '', 'ROUNDUP([BUC]/[qdi],0)', 'ndi');
      const dens = s8.o('mật độ', 'Mật độ đĩa', nd / (W * Lb), 'đĩa/m²', '1 – 6', 'F10', '[ndi]/([W]*[Lb])', 'dens');
      s8.chk('Mật độ đĩa 1 – 6 đĩa/m²', dens >= 1 && dens <= 6, 'ĐẠT', 'NGOÀI DẢI – xem lại q_đĩa / bố trí đĩa', 'F10', true, 'AND([dens]>=1,[dens]<=6)');
      s8.i('HL', 'Tổn thất áp đường ống + đĩa', p.ic_HL, 'kPa', '', '', 'HLi');
      const pd = s8.o('p_đẩy', 'Áp suất máy thổi', (BWL + DD) * 9.772 + p.ic_HL, 'kPa', '(BWL + DD)·9,772 + HL', 'M&E PT (5-77a)', '([BWL]+[DD])*9.772+[HLi]', 'pdi');
      s8.i('η', 'Hiệu suất máy thổi', p.air_e, '-', '0,70 – 0,90', 'M&E 5th tr.434', 'etai');
      const Pw = s8.o('P', 'Công suất trục máy thổi / bể', BUC * 1.201 / 3600 * 0.287 * (32 + 273.15) / (0.283 * p.air_e) * (Math.pow((patm + pd) / patm, 0.283) - 1), 'kW', 'ṁ·R·T₁/(0,283·η)·[(p₂/p₁)^0,283 − 1]', 'M&E PT (5-77a)', '[BUC]*1.201/3600*0.287*(32+273.15)/(0.283*[etai])*((([info.patm]+[pdi])/[info.patm])^0.283-1)', 'Pwi');
      s8.o('P_tổng', 'Công suất trục máy thổi toàn trạm', Pw * nb, 'kW', 'P·N', '', '[Pwi]*[nb]', 'Pwt');
      s8.i('LF', 'Hệ số tải TB máy thổi', p.air_LF, '-', '1,0 = cơ sở', 'Quy tắc R05', 'LFi');
      const Ebl = s8.o('E_thổi', 'Điện năng máy thổi toàn trạm', Pw / 0.95 * dM_.TA * nb * p.air_LF, 'kWh/ngđ', 'P/0,95·TA·N·LF', 'Quy tắc R05', '[Pwi]/0.95*[TA]*[nb]*[LFi]', 'Ebl');

      /* Bước 9. Thủy lực & thiết bị */
      const s9 = u.sec('Bước 9. Thủy lực & thiết bị – decanter, bơm bùn dư, độ kiềm, máy khuấy');
      const qin = icB ? 0 : 1;
      const PDR = s9.o('PDR', 'Lưu lượng xả nước (decant) – mùa khô', dM_.MVAB / ph.dec + qin * PDWF / 1440, 'm³/phút', icB ? 'MVAB/t_chắt' : 'MVAB/t_chắt + PDWF/1440', 'Sanitaire ICEAS', icB ? '[MVAB]/[tdec]' : '[MVAB]/[tdec]+[PDWF]/1440', 'PDR');
      const PWR = s9.o('PWR', 'Lưu lượng xả nước (decant) – mùa mưa', dM_.MVAB / ph.dec_s + qin * PWWF / 1440, 'm³/phút', icB ? 'MVAB/t_chắt,mưa' : 'MVAB/t_chắt,mưa + PWWF/1440', 'Sanitaire ICEAS', icB ? '[MVAB]/[tdecs]' : '[MVAB]/[tdecs]+[PWWF]/1440', 'PWR');
      s9.i('WLR', 'Tải trọng máng decanter – thường', p.ic_WLR, 'm³/phút·m', '', 'Sanitaire', 'WLR'); s9.i('WLR_s', 'Tải trọng máng decanter – mùa mưa', p.ic_WLRs, 'm³/phút·m', '', 'Sanitaire', 'WLRs');
      s9.o('DL', 'Chiều dài máng xả (decanter) yêu cầu', Math.max(PDR / p.ic_WLR, PWR / p.ic_WLRs), 'm', 'max(PDR/WLR; PWR/WLR_s)', 'Sanitaire', 'MAX([PDR]/[WLR],[PWR]/[WLRs])', 'DLr');
      const DL = s9.o('DL_chọn', 'Chiều dài máng xả chọn', dM_.DL, 'm', 'Làm tròn 0,5 m', '', 'CEILING([DLr],0.5)', 'DL');
      s9.chk('Chiều dài máng xả ≤ chiều rộng bể', DL <= W + 1e-9, 'ĐẠT', 'VƯỢT – bố trí 2 decanter hoặc tăng W', '', true, '[DL]<=[W]+0.000000001');
      const nOver = Math.max(1, Math.ceil(nb * (ph.dec_s / 60) / dM_.SCT - 1e-9));
      s9.o('n_chắt', 'Số bể xả nước đồng thời (lệch pha)', nOver, 'bể', 'ROUNDUP(N·t_chắt,mưa/SCT)', '', 'MAX(1,ROUNDUP([nb]*[tdecs]/60/[SCT],0))', 'nOver');
      const QdecR = s9.o('Q_chắt,đỉnh', 'Lưu lượng xả đỉnh ra công trình sau', PWR * 60 * nOver, 'm³/h', 'PWR·60·n_chắt', '', '[PWR]*60*[nOver]', 'Qdec');
      s9.i('SF_ws', 'Nồng độ chất rắn bùn dư (rút đáy khi lắng)', p.ic_SFws, '-', '0,6 – 1,0 %', 'Sanitaire ICEAS', 'SFws');
      const Vws = s9.o('V_ws', 'Thể tích bùn dư mỗi bể', dMb / (p.ic_SFws * 1000), 'm³/ngđ/bể', 'ΔM/(SF_ws·1000)', '', '[dM]/([SFws]*1000)', 'Vws');
      s9.i('SPT', 'Thời gian bơm bùn / chu kỳ', p.ic_SPT, 'phút', '', '', 'SPT');
      const WSP = s9.o('WSP', 'Công suất bơm bùn dư', Vws * 1000 * dM_.NCT / (24 * p.ic_SPT), 'L/phút', 'V_ws·NCT/(24·SPT)', 'Sanitaire ICEAS', '[Vws]*1000*[NCT]/(24*[SPT])', 'WSP');
      s9.i('w_khuấy', 'Suất công suất máy khuấy chìm (pha Air-Off)', p.ic_mixW, 'W/m³', '3 – 8', 'M&E mục 5-? / catalogue', 'mixW');
      const Pmix = s9.o('P_khuấy', 'Công suất máy khuấy chìm / bể', ph.off > 0 ? p.ic_mixW * W * Lb * TWL / 1000 : 0, 'kW/bể', 'w·W·L·TWL', 'Catalogue', ph.off > 0 ? '[mixW]*[W]*[Lb]*[TWL]/1000' : '0', 'Pmix');
      const Emix = s9.o('E_khuấy', 'Điện năng máy khuấy pha Air-Off', Pmix * nb * ph.off * dM_.cyc / 60, 'kWh/ngđ', 'P_khuấy·N·Air-Off·n_ck', '', '[Pmix]*[nb]*[toff]*[cyc]/60', 'Emix');
      const Etot = s9.o('E_SH', 'Điện năng cụm ICEAS (thổi khí + khuấy)', Ebl + Emix, 'kWh/ngđ', '', '', '[Ebl]+[Emix]', 'Etot');
      alkalinity(u, K.NOx, '[NOx]', NO3den, '[NO3den]', 'Bước 9 (tiếp). ', chemAlk);

      /* Bước 10. Kiểm tra ở T_min và T_max – chế độ xả bùn theo mùa để giữ SRT mục tiêu */
      const s10 = u.sec('Bước 10. Kiểm tra ở nhiệt độ thấp nhất & cao nhất – chế độ xả bùn theo mùa');
      const muX = s10.o('μ_AOB,Tmax', 'Tốc độ sinh trưởng thực AOB ở T_max', p.muAOB * Math.pow(1.072, I.Tmax - 20) * (NH4e / (NH4e + p.KNH4)) * (p.DO / (p.DO + p.KOA)) - kinX.bA, '1/ngày', 'PT (7-94) tại T_max', 'M&E PT (7-94)', '[muA]*1.072^([info.Tmax]-20)*([Ne]/([Ne]+[KNH4]))*([DO]/([DO]+[KOA]))-[bAx]', 'muAx');
      const SRTnX = s10.o('SRT_N,Tmax', 'SRT tổng theo nitrat hóa ở T_max', p.SF / muX / fA, 'ngày', 'SF/μ_AOB,Tmax/f_hk', 'M&E PT (7-98)', '[SF]/[muAx]/[fhk]', 'SRTnx');
      const SRThot = Math.max(SRTnX, +p.ic_SRTset, stabReq), bH = bioAtT(SRThot, kinX.bH, kinX.muH, kinX.bA);
      const SRTs = s10.o('SRT_nóng', 'SRT tối thiểu mùa nóng (T_max)', SRThot, 'ngày', 'max(SRT_N,Tmax; SRT_lắng' + (stabReq > 0 ? '; SRT_ổđ' : '') + ')', 'Trình tự thiết kế theo SRT', `MAX([SRTnx],[SRTset]${stabReq > 0 ? ',[SRTstab]' : ''})`, 'SRThot');
      const PXx = s10.o('P_X,TSS,Tmax', 'Bùn sinh ra ở T_max với SRT thiết kế', OX.PXbio / 0.85 + Q * K.nbVSS / 1000 + Q * K.iTSS / 1000 + P.X, 'kg TSS/ngđ', 'P_X,bio,Tmax/0,85 + Q·nbVSS + Q·iTSS + ΔX_hc', 'M&E PT (8-21)', '[PXbx]/0.85+[Q]*[nbVSS]/1000+[Q]*[iTSS]/1000+[Xch]', 'PXx');
      const MLx = s10.o('MLSS_BWL,Tmax', 'MLSS tại BWL ở T_max nếu giữ SRT thiết kế', PXx * SRT / nb * 1000 / (BWL * BA), 'mg/L', 'P_X,Tmax·SRT/N/(BWL·BA)', '', '[PXx]*[SRT]/[nb]*1000/([BWL]*[BA])', 'MLSSbx');
      s10.chk('MLSS tại BWL ở T_max ≥ 2.000 mg/L', MLx >= 2000, 'ĐẠT', 'THẤP – giữ SRT dài hơn trong mùa nóng', 'M&E Bảng 8-19', true, '[MLSSbx]>=2000');
      const PXh = bH.PXTSS + P.X;
      s10.o('P_X,TSS,nóng', 'Bùn xả mùa nóng ở SRT_nóng (tối thiểu)', PXh, 'kg TSS/ngđ', 'Bước 3 tại T_max, SRT_nóng (phần mềm giải)', 'M&E PT (8-20), (8-21)', null, 'PXhot');
      s10.o('MLSS_BWL,nóng', 'MLSS tại BWL ở SRT_nóng', PXh * SRThot / nb * 1000 / (BWL * BA), 'mg/L', '', '', '[PXhot]*[SRThot]/[nb]*1000/([BWL]*[BA])', 'MLSShot');
      const R0lo = s10.o('R₀,Tmin', 'Nhu cầu oxy trung bình ở T_min (đối chiếu)', Math.max(0, Q * (K.S0 - K.S) / 1000 - 1.42 * K.PXbio + 4.57 * Q * K.NOx / 1000 - 2.86 * Q * NO3dnB / 1000), 'kgO₂/ngđ', 'PT (8-23) với hệ số ở T_min', 'M&E PT (8-23)', 'MAX(0,[Q]*([S0]-[S])/1000-1.42*[PXbio]+4.57*[Q]*[NOx]/1000-2.86*[Q]*[NO3dnB]/1000)', 'R0lo');
      s10.chk('Nhu cầu oxy ở T_max (dùng chọn máy thổi) ≥ nhu cầu ở T_min', OX.Ro >= R0lo - 1e-9, 'ĐẠT', 'T_min CẦN NHIỀU OXY HƠN – kiểm tra lại máy thổi', 'M&E mục 5-11', true, '[R0]>=[R0lo]-0.000000001');
      const sch = [['Mùa lạnh (T_min = ' + fx(T) + ' °C)', SRT, PXtot, MLSSb], ['Mùa nóng – giữ SRT thiết kế (T_max = ' + fx(+I.Tmax) + ' °C)', SRT, PXx, MLx], ['Mùa nóng – SRT tối thiểu', SRThot, PXh, PXh * SRThot / nb * 1000 / (BWL * BA)]];
      sch.forEach(([n, a, b2, m]) => s10.t2(n, `SRT ${fx(a)} ngày · xả ${fx(b2, 0)} kg TSS/ngđ (${fx(b2 / nb / (p.ic_SFws * 1000))} m³/ngđ/bể ở SF_ws) · MLSS_BWL ${fx(m, 0)} mg/L`, '', 'Chế độ xả bùn'));
      s10.note('Xả bùn theo khối lượng (kg/ngđ = khối bùn trong bể / SRT mục tiêu), không theo thể tích cố định. Khi nhiệt độ tăng, bùn sinh ra giảm: giữ SRT thiết kế cho vận hành ổn định (MLSS thấp hơn), chỉ hạ SRT tới SRT_nóng khi cần giảm nhu cầu oxy.');

      /* ---- kết quả dùng chung ---- */
      fAer = fA; Qdec = QdecR;
      u.airP = Pw * nb; u.airH = dM_.TA; u.nBlower = nb + 1; u.airQ = BUC * nb / 60; u.airRow = u.ids.Pwt;
      R.equip.push({ u: 'Nhà máy thổi khí', name: 'Máy thổi khí ICEAS (1 máy/bể + 1 dự phòng)', spec: `${fx(BUC / 60)} m³/phút; ${fx(pd)} kPa; ${fx(ceilTo(Pw / 0.95, 0.5))} kW`, qty: nb + 1, qtyX: '{{ref:bio.nb}}+1', note: 'Biến tần' });
      R.equip.push({ u: u.name, name: 'Đĩa phân phối khí bọt mịn', spec: `${p.air_qd} m³/h·đĩa; SOTE ${fx(p.air_SOTE * 100)} %`, qty: nd * nb, qtyX: '{{ref:bio.ndi}}*{{ref:bio.nb}}', note: '', spare: 'diffuser' });
      R.equip.push({ u: u.name, name: 'Decanter (cơ cấu điện)', spec: `L = ${fx(DL)} m; ${fx(PWR)} m³/phút; 1,5 kW`, qty: nb, qtyX: '{{ref:bio.nb}}', note: '', spare: 'decanter' });
      if (Pmix > 0) R.equip.push({ u: u.name, name: 'Máy khuấy chìm (pha Air-Off)', spec: `${fx(ceilTo(Pmix / 2, 0.5))} kW/máy`, qty: 2 * nb, note: 'Bắt buộc với NDN(P)' });
      R.equip.push({ u: u.name, name: 'Bơm bùn dư', spec: `${fx(WSP * 60 / 1000)} m³/h; 5,5 kW`, qty: nb, note: '' });
      K.bioOut = { NO3: '[NO3e]', TP: '[TPbio]', Alk: '[Alkout]' };
      bioRes.NO3e = NO3e; bioRes.NO3den = NO3den; bioRes.TPe = P.TPe;
      bioRes.sludge = PXtot + carbon.sl; bioRes.sludgeX = '[bio.PXtot]' + (carbon.sl ? '+[bio.Xext]' : '');
      bioRes.VtotX = '[bio.Vtot]'; bioRes.AX = '[bio.W]*[bio.Lb]*[bio.nb]';
      bioRes.Vtot = W * Lb * TWL * nb; bioRes.A = W * Lb * nb;
      const pre = Math.min(p.ic_pre, Lb * 0.2);
      ub.geom = { type: 'rect', L: Lb, B: W, H: TWL + 0.5, fb: 0.5, n: nb, zones: [{ name: 'PRE-REACT', len: pre }, { name: 'VÙNG PHẢN ỨNG CHÍNH', len: Lb - pre }], label: 'ICEAS', batch: true, TWL, BWL, SD, decanter: DL };
      ub.dims = `${nb} bể × (${fx(W)} × ${fx(Lb)} × H ${fx(TWL + 0.5)} m), TWL ${fx(TWL)} m; chu trình ${useName}`;
      ub.hrt = `${fx(HRT)} h`; ub.n = nb; ub.H = TWL; ub.batch = { TWL, BWL, SD, DD, NCT: dM_.NCT, cyc: dM_.cyc, TA: dM_.TA };
      ub.mixH = (ph.off / 60) * dM_.cyc; ub.mixkW = Pmix * nb;
      ub.ic = { W, Lb, BA, MVAB: dM_.MVAB, SD, DD, BWL, TWL, MLSSb, SRT, HRT, DL, PDR, PWR, WSP, BUC, nd, dM: dMb, NCT: dM_.NCT, SCT: dM_.SCT, cyc: dM_.cyc, TA: dM_.TA, ART: dM_.ART, cap, reqDN: reqN, Pw, pd, nb, ph, cycleName: useName };
      // N, D: hai chu trình chuẩn (so sánh); M: chu trình áp dụng sau vòng lặp Bước 6 (có thể đã tăng Air-Off)
      R.icRec = { rec, recName, reasons, use, useName, sel, N: dN, D: dD, M: dM_, adj, needDN, reqDN: dN.req, MCRT: SRT };
    } else if (bio === 'AGS') {
      /* ======== NEREDA® – bùn hạt hiếu khí (AGS), SBR nạp-xả đồng thời – định cỡ bể, chu kỳ, cấp khí theo phương pháp
         phần mềm NEREDA của bộ (apps/nereda/js/engine.js, cùng một mã tính); động học, bùn dư, kiềm, carbon theo M&E chung ======== */
      const u = ub, NE = typeof NeredaEngine !== 'undefined' ? NeredaEngine : null;
      if (!NE) throw new Error('Thiếu mã tính NEREDA (apps/nereda/js/engine.js)');
      const nr = Object.assign({}, NE.DEFAULTS, {
        Q, PFh: Math.max(1, +I.kmax || 1.5), Frwf: Math.max(+p.ags_Frwf, 1),
        COD: st4.COD, BOD: st4.BOD, TSS: st4.TSS, TKN: st4.TKN, NH4: st4.NH4, TP: st4.TP, Alk: st4.Alk, Tmin: T, Tmax: Math.max(T, +I.Tmax || T), pH: +I.q.pH || 7.2,
        bcodBod: p.bcod_bod, nbsCOD: Math.max(0, ch.nbsCOD), rbFrac: clamp(p.rb_bio * p.bcod_bod * st4.BOD / Math.max(st4.COD, 1), 0.02, 0.6), vssTss: p.vss_tss,
        tBOD: L.BOD || 0, tCOD: L.COD || 0, tTSS: L.TSS || 0, tNH4: L.NH4 || 0, tNO3: L.NO3 || 0, tTN: L.TN || 0, tTP: 0, sfEff: p.ags_sfEff,
        TSSe: tsseTech, ONsol: p.Norg, Nr: Math.max(1, Math.round(+p.ags_Nr)), H: +p.ags_H, shape: 'rect', LW: +p.ags_LW, tc: +p.ags_tc, tcRwf: +p.ags_tcRwf, ts: +p.ags_ts, tidle: +p.ags_tidle,
        tAnMin: +p.ags_tAnMin, tAerMinRwf: +p.ags_tAerMinRwf, buffer: +p.ags_buffer > 0, tF: +p.ags_tF, X: +p.ags_X, SVI: +p.ags_SVI, VERdwf: +p.ags_VERdwf, VERrwf: +p.ags_VERrwf,
        vUpMax: +p.ags_vUpMax, vSettle: +p.ags_vSettle, SFn: p.SF, SRTmin: +p.ags_SRTmin, DO: p.DO, KO: p.KOA, muN: p.muAOB, bN: p.bAOB, KN: p.KNH4, Yn: p.YAOB,
        muH: p.muH, Ks: p.Ks, YH: p.YH, bH: p.bH, fd: p.fd, alpha: p.air_alpha, beta: p.air_beta, Ff: p.air_F, sotePerM: +p.ags_sotePerM, dPloss: p.air_dp, eBlower: p.air_e,
        AlkMin: p.alk_res, WASc: +p.ags_WASc, seed: 'granule'
      });
      const r = NE.compute(nr);
      if (!r.ok) { const w = (r.warnings || []).filter(x => x.lvl === 'crit').map(x => x.msg).join(' '); throw new Error('NEREDA: ' + (w || 'không tính được – kiểm tra thông số nhóm NEREDA ở tab 4')); }
      for (const w of r.warnings) if (w.lvl !== 'info') warn('NEREDA: ' + w.msg);
      const Rr = r.reactor, Cy = r.cycle, A = r.air, Nr = nr.Nr, H = nr.H;
      const s = u.sec('A. Số liệu & thông số thiết kế NEREDA® — phương pháp phần mềm NEREDA của bộ');
      s.o('Q', 'Lưu lượng trung bình', Q, 'm³/ngđ', '', '', '[info.Q]', 'agsQ');
      s.o('Q_mưa', 'Lưu lượng mùa mưa', Q * nr.Frwf, 'm³/ngđ', 'Q × hệ số mùa mưa', '', null, 'Qrwf');
      s.i('N', 'Số bể NEREDA', Nr, 'bể', nr.buffer ? 'Có bể điều hòa – nạp theo mẻ' : '≥ 3 bể – luôn có 1 bể nhận nước', 'NEREDA (Epe)', 'nb');
      s.i('H', 'Chiều sâu nước', H, 'm', '5 – 11,3 m', 'NEREDA', 'Hb');
      s.i('X', 'MLSS bùn hạt thiết kế', nr.X, 'kg/m³', '8 – 15', 'NEREDA', 'agsX');
      s.i('SVI', 'SVI₃₀ bùn hạt', nr.SVI, 'mL/g', '30 – 50', 'NEREDA', 'agsSVI');
      s.i('t_c', 'Chu kỳ mùa khô', nr.tc, 'h', 'NEREDA 6 h', 'NEREDA', 'tcD'); s.i('t_c,mưa', 'Chu kỳ mùa mưa', nr.tcRwf, 'h', '', 'NEREDA', 'tcR');
      s.i('VER_khô', 'Trao đổi thể tích tối đa mùa khô', nr.VERdwf, '-', '0,15 – 0,60', 'NEREDA', 'VERd'); s.i('VER_mưa', 'Trao đổi thể tích tối đa mùa mưa', nr.VERrwf, '-', '', 'NEREDA', 'VERr');
      const sk = u.sec('B. Tuổi bùn (SRT) — nitrat hóa & ổn định bùn hạt');
      sk.o('SRT_hk,yc', 'SRT hiếu khí yêu cầu nitrat hóa', r.kin.SRTaerReq, 'ngày', 'SF/(μ_N·f_DO − b_N)', 'M&E PT (7-94), (7-98)', null, 'SRTaerReq');
      sk.o('f_hk', 'Phần thời gian sục khí trong chu kỳ', r.kin.fAer, '-', 't_sục khí / t_c', '', null, 'agsfA');
      sk.o('SRT_N', 'SRT tổng theo nitrat hóa', r.kin.SRTbyN, 'ngày', 'SRT_hk,yc / f_hk', '', '[SRTaerReq]/[agsfA]', 'SRTbyN');
      sk.i('SRT_min', 'SRT tối thiểu ổn định bùn hạt', +p.ags_SRTmin, 'ngày', '', 'NEREDA', 'SRTgr');
      const SRT = sk.o('SRT', 'SRT tổng thiết kế', r.kin.SRT, 'ngày', `max(SRT_N; SRT_min) – theo ${r.kin.SRTgov}`, '', 'MAX([SRTbyN],[SRTgr])', 'agsSRT');
      sk.o('SRT_hk', 'SRT hiếu khí', r.kin.SRTa, 'ngày', 'SRT·f_hk', '', '[agsSRT]*[agsfA]', 'agsSRTa');
      const sv = u.sec('C. Thể tích bể — lớn nhất của các tiêu chí (khối lượng bùn, trao đổi thể tích khô/mưa, vận tốc nạp)');
      const Vup = Math.max(Rr.QfeedD, Rr.QfeedR) / nr.vUpMax * H * Nr;
      const crit = [['bio', 'V_bùn', 'Khối lượng bùn M/MLSS', Rr.Vbio], ['dwf', 'V_khô', `Trao đổi thể tích mùa khô (≤ ${fx(nr.VERdwf * 100)} %)`, Rr.VhydD], ['rwf', 'V_mưa', `Trao đổi thể tích mùa mưa (≤ ${fx(nr.VERrwf * 100)} %)`, Rr.VhydR], ['up', 'V_nạp', `Vận tốc nạp đi lên (≤ ${fx(nr.vUpMax)} m/h)`, Vup]];
      sv.o('M', 'Khối lượng bùn cần giữ', Rr.M, 'kg TSS', 'P_X·SRT (phương pháp NEREDA)', '', null, 'agsM');
      for (const [k, sym, nm, v] of crit) sv.o(sym, nm + (k === Rr.govKey ? ' ← KHỐNG CHẾ' : ''), v, 'm³', '', 'NEREDA', null, 'Vc_' + k);
      const VR = sv.o('V_T', 'Thể tích mỗi bể', Rr.VR, 'm³', 'max(tiêu chí)/N', '', null, 'VR');
      const Vtot = sv.o('V_tổng', 'Tổng thể tích bể NEREDA', Rr.Vtot, 'm³', 'N·V_bể', '', '[nb]*[VR]', 'Vtot');
      const Lb = Rr.dims.L, W = Rr.dims.W;
      sv.o('L', 'Chiều dài 1 bể', Lb, 'm', `L/B = ${fx(nr.LW)}`, '', null, 'Lb'); sv.o('B', 'Chiều rộng 1 bể', W, 'm', '', '', null, 'W');
      sv.o('A_bể', 'Diện tích 1 bể', Rr.A, 'm²', 'V_bể/H', '', '[VR]/[Hb]', 'Ab1');
      const Xact = sv.o('X_tt', 'MLSS thực tế ở thể tích chọn', Rr.Xact, 'kg/m³', 'M/V_tổng', '', '[agsM]/[Vtot]', 'Xact');
      sv.o('HRT', 'Thời gian lưu nước', Rr.HRT, 'h', 'V_tổng/Q', '', '[Vtot]/[agsQ]*24', 'HRT');
      sv.o('OLR', 'Tải trọng hữu cơ', Rr.OLR, 'kg COD/m³·ngđ', '', '', null, 'OLR');
      if (Rr.Vbuf > 0) sv.o('V_đh', 'Bể điều hòa đầu vào NEREDA', Rr.Vbuf, 'm³', '', 'NEREDA', null, 'Vbuf');
      K = bioCommon(u, SRT, Rr.Xact * 1000, { noVolume: true, noSRTcheck: true, srtName: 'SRT tổng (NEREDA)', srtNote: 'Mục B', srtX: '[agsSRT]', mlssX: '[Xact]*1000' });
      const sh = u.sec('D. Thủy lực & lắng bùn hạt');
      const VF = sh.o('V_F/V_T', 'Tỷ lệ trao đổi thể tích mùa khô', Rr.VERd, '-', 'V_nạp/V_bể', '', null, 'VF');
      sh.o('VER_mưa', 'Tỷ lệ trao đổi thể tích mùa mưa', Rr.VERr, '-', '', '', null, 'VFr');
      sh.o('Q_nạp', 'Lưu lượng nạp mùa khô', Rr.QfeedD, 'm³/h', '', '', null, 'QfD'); sh.o('Q_nạp,mưa', 'Lưu lượng nạp mùa mưa', Rr.QfeedR, 'm³/h', '', '', null, 'QfR');
      sh.o('v_lên', 'Vận tốc nạp đi lên mùa khô', Rr.vUpD, 'm/h', `≤ ${fx(nr.vUpMax)} m/h`, '', null, 'vUpD'); sh.o('v_lên,mưa', 'Vận tốc nạp đi lên mùa mưa', Rr.vUpR, 'm/h', '', '', null, 'vUpR');
      sh.o('H_bùn', 'Lớp bùn hạt sau lắng', Rr.Hb, 'm', '', '', null, 'Hbed'); sh.o('H_trong', 'Lớp nước trong phía trên', Rr.clear, 'm', '', '', null, 'Hclr');
      sh.o('t_lắng,yc', 'Thời gian lắng yêu cầu', Rr.tsReq * 60, 'phút', `≤ ${fx(nr.ts * 60)} phút chọn`, '', null, 'tsReq');
      sh.chk('Lắng: thời gian lắng chọn ≥ yêu cầu', nr.ts >= Rr.tsReq - 1e-6, 'ĐẠT', 'Tăng thời gian lắng', 'NEREDA', false);
      sh.chk('Vận tốc nạp đi lên ≤ giới hạn', Math.max(Rr.vUpD, Rr.vUpR) <= nr.vUpMax + 1e-6, 'ĐẠT', 'Tăng số bể / diện tích', 'NEREDA', true);
      const sc = u.sec('E. Chu kỳ vận hành (mỗi bể)');
      const ph = (nm, tD, tR) => sc.t2(nm, `Khô ${fx(tD * 60, 0)} phút  |  Mưa ${fx(tR * 60, 0)} phút`, '', 'NEREDA');
      ph('Nạp kỵ khí + xả nước (đồng thời)', Cy.tF, Cy.tFr);
      if (Cy.tW > 0 || Cy.tWr > 0) ph('Chờ kỵ khí bổ sung', Cy.tW, Cy.tWr);
      ph('Sục khí (phản ứng – nitrat hóa, khử nitrat đồng thời SND)', Cy.tA, Cy.tAr);
      ph('Lắng', Cy.tS, Cy.tS);
      ph('Chờ / xả bùn dư', Cy.tI, Cy.tI);
      // pha cho mô hình SBR của SimXLNT: nạp (kỵ khí) – sục khí – lắng – xả – chờ (như hồ sơ phần mềm NEREDA)
      const rest = Cy.tW + Cy.tI, tD = Math.max(0.1, Math.min(0.25, rest)), tR = rest >= tD ? Cy.tA : Math.max(Cy.tA - (tD - rest), 0.25);
      sc.o('t_nạp', 'Nạp kỵ khí (mùa khô)', Cy.tF, 'h', '', 'NEREDA', null, 'tFn');
      sc.o('t_sục', 'Sục khí (mùa khô)', tR, 'h', '', 'NEREDA', null, 'tAn');
      sc.o('t_lắng', 'Lắng', Cy.tS, 'h', '', 'NEREDA', null, 'tSn');
      sc.o('t_xả', 'Xả bùn dư / ổn định (mô hình hóa như pha xả)', tD, 'h', '', '', null, 'tDn');
      sc.o('t_chờ', 'Chờ còn lại', Math.max(rest - tD, 0), 'h', '', '', null, 'tIn');
      sc.o('t_c', 'Chu kỳ mùa khô', Cy.tc, 'h', '', '', null, 'tc');
      sc.o('n_c', 'Số mẻ mỗi bể', 24 / Cy.tc, 'mẻ/ngày', '24/t_c', '', '24/[tc]', 'nc');
      sc.t2('Số bể sục khí đồng thời tối đa', `Khô ${Cy.kAer} bể  |  Mưa ${Cy.kAerR} bể`, '', 'NEREDA');
      if (!nr.buffer) sc.note('Nạp liên tục luân phiên: luôn có một bể nhận nước, nước sau xử lý được đẩy ra qua máng tràn khi nạp từ đáy (nạp-xả đồng thời) – không cần decanter.');
      const sa = u.sec('F. Nhu cầu oxy & cấp khí (đĩa bọt mịn ở đáy bể sâu)');
      sa.o('O₂_C', 'O₂ cho khử carbon', A.o2C, 'kg/ngđ', '', 'M&E PT (8-17)', null, 'o2C');
      sa.o('O₂_N', 'O₂ cho nitrat hóa', A.o2N, 'kg/ngđ', '4,57·NOx·Q', 'M&E PT (8-17)', null, 'o2N');
      sa.o('O₂_DN', 'O₂ hoàn trả do khử nitrat', A.o2D, 'kg/ngđ', '−2,86·NO₃ khử·Q', '', null, 'o2D');
      sa.o('AOR', 'Nhu cầu oxy thực (ở T max)', A.R0, 'kg O₂/ngđ', '', '', null, 'AOR');
      sa.o('SOTE', 'SOTE ở độ ngập thiết kế', A.SOTE, '-', `${fx(nr.sotePerM)} %/m × ${fx(A.hd)} m`, 'Catalogue đĩa', null, 'SOTEa');
      sa.o('Q_khí,TB', 'Lưu lượng khí trung bình mỗi bể khi sục', A.airAvgR, 'Sm³/h', '', '', null, 'airAvg');
      sa.o('Q_khí,TK', 'Năng lực máy thổi thiết kế (tổng)', A.airTot, 'Sm³/h', 'đỉnh × số bể sục đồng thời', '', null, 'airTot');
      sa.o('p₂', 'Áp suất đẩy máy thổi', A.p2, 'kPa', 'p_atm + ρgH + tổn thất', '', null, 'p2');
      const Pw = sa.o('P_TK', 'Công suất trục máy thổi thiết kế', A.kWdesign, 'kW', '', 'M&E PT (5-77)', null, 'Pw');
      sa.o('E_khí', 'Điện năng cấp khí', A.Eday, 'kWh/ngđ', '', '', null, 'Eair');
      sa.o('n_đĩa', 'Số đĩa khí mỗi bể', A.nDisc, 'đĩa', `${fx(A.discDens)} đĩa/m²`, '', null, 'ndi');
      const sn = u.sec('G. Khử nitrat đồng thời (SND) & photpho sinh học (EBPR) trong bùn hạt');
      let carbon = { M: 0, sl: 0 };
      const needC = r.carbon.carbonCOD > 1e-6;
      if ((needC || p.meoh_set > 0) && c.carbon === 'auto') carbon = extCarbon(sn, 0, '0', r.carbon.carbonCOD * Q / 1000, String(+(r.carbon.carbonCOD * Q / 1000).toFixed(6)));
      const useC = carbon.M > 0;
      const NO3e = sn.o('NO₃-N_e', 'NO₃-N ra', useC ? r.eff.fin.NO3 : r.eff.bio.NO3, 'mg/L', useC ? 'Có carbon ngoài' : 'Năng lực SND theo bCOD dùng cho khử nitrat', 'NEREDA', null, 'NO3e');
      if (needC && !useC) warn('NEREDA: năng lực khử nitrat nội tại không đủ cho TN giới hạn – bật bổ sung carbon ngoài (tab 3) hoặc tăng phần bCOD cho khử nitrat.');
      const NO3den = sn.o('NO₃_khử', 'N được khử nitrat', Math.max(0, K.NOx - NO3e), 'mg/L', 'NOx − NO₃_e', '', 'MAX(0,[NOx]-[NO3e])', 'NO3den');
      const TPe = sn.o('TP_e', 'TP ra sau sinh học (đồng hóa + EBPR + P trong SS ra)', r.phos.TPbio, 'mg/L', `P_EBPR ${fx(r.phos.Pebpr)} mg/L; P hạt ${fx(r.phos.Ppart)} mg/L`, 'NEREDA', null, 'TPbio');
      alkalinity(u, K.NOx, '[NOx]', NO3den, '[NO3den]', 'H. ');
      const sl = u.sec('I. Bùn dư bùn hạt');
      sl.i('C_bùn dư', 'Nồng độ bùn dư rút', +p.ags_WASc, 'kg/m³', 'Bùn hạt đặc – có thể bỏ bể nén', 'NEREDA', 'WASc');
      sl.o('P_X,TSS', 'Bùn dư (phương pháp chung M&E – dùng cho xử lý bùn)', K.PXTSS, 'kg TSS/ngđ', 'Mục 6 (PT 8-21)', 'Quy tắc R06', '[PXTSS]', 'PXrep');
      sl.o('P_X,NEREDA', 'Bùn dư theo phương pháp NEREDA (đối chiếu)', r.sludge.PxTSS, 'kg TSS/ngđ', '', 'NEREDA', null, 'PXnr');
      sl.o('Q_bùn dư', 'Lưu lượng bùn dư', (K.PXTSS + carbon.sl) / +p.ags_WASc, 'm³/ngđ', 'P_X/C', '', '([PXTSS]' + (carbon.sl ? '+[Xext]' : '') + ')/[WASc]', 'Qwas');
      bioRes.NO3e = NO3e; bioRes.NO3den = NO3den; bioRes.TPe = TPe;
      bioRes.sludge = K.PXTSS + carbon.sl; bioRes.sludgeX = '[bio.PXTSS]' + (carbon.sl ? '+[bio.Xext]' : '');
      bioRes.Vtot = Vtot; bioRes.VtotX = '[bio.Vtot]'; bioRes.A = Rr.A * Nr; bioRes.AX = '[bio.Ab1]*[bio.nb]';
      fAer = r.kin.fAer;
      const BWL = H * (1 - VF);
      ub.geom = { type: 'rect', L: Lb, B: W, H: H + 0.5, fb: 0.5, n: Nr, zones: [{ name: 'BÙN HẠT NEREDA', len: Lb }], label: 'NEREDA', batch: true, TWL: H, BWL, SD: Rr.Hb };
      ub.dims = `${Nr} bể × (${fx(Lb)} × ${fx(W)} × H ${fx(H + 0.5)} m), nước ${fx(H)} m; chu kỳ ${fx(Cy.tc)} h`;
      ub.hrt = `${fx(Rr.HRT)} h`; ub.n = Nr; ub.H = H; ub.batch = { TWL: H, BWL, SD: Rr.Hb, cyc: 24 / Cy.tc, TA: Cy.tA * 24 / Cy.tc };
      ub.airP = A.kWdesign; ub.airH = A.Eday / Math.max(A.kWdesign, 1e-6); ub.nBlower = r.equip.blowerDuty + r.equip.blowerStby; ub.airQ = A.airTot / 60; ub.airRow = u.ids.Pw;
      ub.ags = { r, nr, Nr, H, VR, Lb, W, BWL, VF, Xact, SRT, SRTa: r.kin.SRTa, fAer: r.kin.fAer, tc: Cy.tc, tA: Cy.tA, tF: Cy.tF, tS: Cy.tS, tI: Cy.tI };
      const E2 = r.equip;
      R.equip.push({ u: 'Nhà máy thổi khí', name: 'Máy thổi khí NEREDA (điều khiển DO, biến tần)', spec: `${fx(E2.blowerQ / 60)} m³/phút; ${fx(A.p2 - 101.3)} kPa; ${fx(ceilTo(E2.blowerKW / 0.95, 0.5))} kW`, qty: E2.blowerDuty + E2.blowerStby, note: `${E2.blowerDuty} + ${E2.blowerStby} dự phòng` });
      R.equip.push({ u: u.name, name: 'Đĩa phân phối khí bọt mịn (đáy bể)', spec: `${fx(nr.discQ || 6)} Sm³/h·đĩa`, qty: Math.round(A.nDisc * Nr), note: '', spare: 'diffuser' });
      R.equip.push({ u: u.name, name: 'Hệ ống nạp phân phối đáy bể (nạp đẩy kỵ khí)', spec: `${fx(Math.max(Rr.QfeedD, Rr.QfeedR), 0)} m³/h/bể; v ≤ ${fx(nr.vUpMax)} m/h`, qty: Nr, note: 'Nạp từ đáy, xả qua máng tràn đồng thời' });
      R.equip.push({ u: u.name, name: 'Máng thu nước ra (tràn)', spec: `${fx(E2.weirLen / Nr)} m/bể`, qty: Nr, note: '' });
      R.equip.push({ u: u.name, name: 'Van tự động nạp / xả / khí (điều khiển chu kỳ)', spec: 'Van bướm điện', qty: 4 * Nr, note: 'Hệ điều khiển Aquasuite NEREDA' });
      if (E2.wasPumps) R.equip.push({ u: u.name, name: 'Bơm bùn dư bùn hạt', spec: `${fx(E2.wasPumps.Q)} m³/h`, qty: E2.wasPumps.duty + E2.wasPumps.stby, note: '' });
      R.equip.push({ u: u.name, name: 'Đầu đo DO / NH₄ / NO₃ / mực nước / MLSS', spec: 'Điều khiển theo tải', qty: Nr, note: '' });
      K.bioOut = { NO3: '[NO3e]', TP: '[TPbio]', Alk: '[Alkout]' };
    } else if (bio === 'CTECH') {
      /* ======== C-Tech – SFC Environmental (Cyclic Activated Sludge, SBR thế hệ 4) – trình tự Basic Engineering Package
         (BEP Vellore 50 MLD D-631, 2019; BEP Sangola 8 MLD D-1104, 2024); kiểm tra theo M&E 5th Sec. 8-6 (Table 8-17, Ex. 8-5) ======== */
      const u = ub;
      const sa = u.sec('A. Lưu lượng & tải lượng vào bể C-Tech — BEP SFC mục 1–3');
      const Qd = sa.o('Q_d', 'Lưu lượng trung bình ngày', Q, 'm³/ngđ', '', 'Đầu bài', '[info.Q]', 'cQd');
      const Qhc = sa.o('Q_h', 'Lưu lượng trung bình giờ', Q / 24, 'm³/h', 'Q_d/24', '', '[cQd]/24', 'cQh');
      const PF = sa.o('PF', 'Hệ số đỉnh', I.kmax, '-', 'BEP SFC dùng 2,25 (CPHEEO); VN theo TCVN 7957 / số liệu đo', 'BEP SFC', '[info.kmax]', 'cPF');
      const Qmx = sa.o('Q_max', 'Lưu lượng giờ lớn nhất', Qhc * PF, 'm³/h', 'Q_h·PF', '', '[cQh]*[cPF]', 'cQmax');
      const BODi = sa.o('BOD₅', 'BOD₅ vào bể (cột ④)', st4.BOD, 'mg/L', '', '', '[bal.BOD4]', 'cBOD');
      const TKNi = sa.o('TKN', 'TKN vào bể', st4.TKN, 'mg/L', '', '', '[bal.TKN4]', 'cTKN');
      const TPi = sa.o('TP', 'TP vào bể', st4.TP, 'mg/L', '', '', '[bal.TP4]', 'cTP');
      const OGi = sa.o('O&G', 'Dầu mỡ vào bể', st4.OG, 'mg/L', 'SFC yêu cầu < 10 mg/L', 'BEP SFC', '[bal.OG4]', 'cOG');
      sa.chk('Dầu mỡ vào bể C-Tech < 10 mg/L', OGi < 10, 'ĐẠT', 'CẦN TÁCH DẦU trước bể', 'BEP SFC', true, '[cOG]<10');
      const BODo = sa.o('BOD_ra', 'BOD₅ ra thiết kế', L.BOD !== undefined ? L.BOD : 20, 'mg/L', 'Giới hạn xả', '', L.BOD !== undefined ? '[info.L_BOD]' : '20', 'cBODo');

      const sb = u.sec('B. Chu kỳ vận hành C-Tech — BEP SFC mục 5; CPHEEO tr.5-198');
      const N = sb.i('N', 'Số bể C-Tech', +p.ct_N, 'bể', 'Nên chẵn – luân phiên theo cặp', 'BEP SFC', 'cN');
      const TFA = sb.i('t_FA', 'Pha cấp nước + sục khí (Fill/Aeration)', p.ct_TFA, 'h', '', 'BEP SFC', 'cTFA');
      const TS = sb.i('t_S', 'Pha lắng', p.ct_TS, 'h', '', 'BEP SFC', 'cTS');
      const TD = sb.i('t_D', 'Pha gạn nước', p.ct_TD, 'h', '', 'BEP SFC', 'cTD');
      const TC = sb.o('T_C', 'Tổng thời gian chu kỳ', TFA + TS + TD, 'h', 't_FA + t_S + t_D', 'CPHEEO 2,5 – 6 h', '[cTFA]+[cTS]+[cTD]', 'cTC');
      sb.chk('Chu kỳ trong khoảng 2,5 – 6 h', TC >= 2.5 && TC <= 6, 'ĐẠT', 'XEM LẠI chu kỳ', 'CPHEEO', true, 'AND([cTC]>=2.5,[cTC]<=6)');
      const ncy = sb.o('n_ck', 'Số chu kỳ / ngày / bể', 24 / TC, 'chu kỳ', '24/T_C', '', '24/[cTC]', 'cncy');
      const TA = sb.o('t_sục', 'Số giờ sục khí / ngày / bể', TFA * ncy, 'h', 't_FA·n_ck', '', '[cTFA]*[cncy]', 'cTA');
      const nF = sb.o('n_cấp', 'Số bể nhận nước (sục khí) đồng thời', N * TFA / TC, 'bể', 'N·t_FA/T_C', 'BEP SFC', '[cN]*[cTFA]/[cTC]', 'cnF');
      sb.chk('Số bể nhận nước đồng thời là số nguyên', Math.abs(nF - Math.round(nF)) < 1e-9, 'ĐẠT', 'CHỈNH chu kỳ / số bể', 'BEP SFC', false, 'ABS([cnF]-ROUND([cnF],0))<0.000000001');
      const nDs = sb.o('n_gạn', 'Số bể gạn nước đồng thời', Math.ceil(N * TD / TC - 1e-9), 'bể', 'ROUNDUP(N·t_D/T_C)', '', 'ROUNDUP([cN]*[cTD]/[cTC],0)', 'cnD');
      const Qb = sb.o('Q_b', 'Lưu lượng TB cấp vào mỗi bể (khi đang cấp)', Qhc / nF, 'm³/h', 'Q_h/n_cấp', '', '[cQh]/[cnF]', 'cQb');

      const sc = u.sec('C. Thể tích, kích thước bể & HRT — BEP SFC mục 6');
      /* F03: SVI chung – nếu tỷ lệ gạn không đạt với MLSS nhập thì tự hạ MLSS tại TWL (làm tròn xuống 50 mg/L) và tính lại V */
      let dHu = p.ct_dH;
      /* M&E 5th: thể tích theo SRT – SRT tổng yêu cầu = SRT hiếu khí yêu cầu (T_min, SF chung) / f_sục; V_SRT = P_X,TSS(SRT)·SRT/MLSS.
         Thể tích bể = max(V theo F/M của SFC; V_SRT) */
      const fAc = TFA / TC, SRTdc = p.SF / (kin.muAOB_T * (NH4e / (NH4e + p.KNH4)) * (p.DO / (p.DO + p.KOA)) - kin.bAOB_T) / fAc;
      const PXdc = bioAtT(SRTdc, kin.bH_T, kin.muH_T, kin.bAOB_T).PXTSS, VsrtOf = m => PXdc * SRTdc * 1000 / m;
      const twlOf = m => {
        const vf = Qmx / nF * TFA, v1 = Math.max(Qd * BODi / (m * p.ct_VR * p.ct_FM), VsrtOf(m), +p.ct_rDmax > 0 ? vf / +p.ct_rDmax * N : 0) / N, a = Math.max(vf / dHu, v1 / p.ct_TWLmax);
        const l = p.ct_L > 0 ? p.ct_L : ceilTo(Math.sqrt(a * p.ct_LB), 0.5), b = ceilTo(a / l, 0.5);
        return ceilTo(v1 / (l * b), 0.1);
      };
      const mlssMax = twl => Math.floor((1 - dHu / twl - p.ct_hsup / twl) * 1e6 / p.SVI / 50) * 50;
      // R08: không hạ MLSS dưới 3 500 mg/L (CPHEEO); nếu vẫn không đạt tỷ lệ gạn thì giảm chiều sâu gạn ΔH (bước 0,05 m, ≥ 1,0 m)
      const mlssFloor = AF ? 3500 : 1000;
      let MLSSuse = p.ct_MLSS;
      if (MAN('ct_MLSS')) { if (MLSSuse > mlssMax(twlOf(MLSSuse))) warn(`C-Tech: MLSS nhập tay ${fx(MLSSuse)} mg/L > MLSS tối đa đạt tỷ lệ gạn ${fx(mlssMax(twlOf(MLSSuse)))} mg/L với SVI ${fx(p.SVI)} mL/g – giữ giá trị nhập.`); }
      else for (let it = 0; it < 20; it++) { const mx = mlssMax(twlOf(MLSSuse)); if (MLSSuse <= mx) break; MLSSuse = Math.max(mlssFloor, mx); }
      if (AF && !MAN('ct_MLSS') && !MAN('ct_dH') && MLSSuse > mlssMax(twlOf(MLSSuse))) {
        while (dHu > 1.0 + 1e-9 && MLSSuse > mlssMax(twlOf(MLSSuse))) dHu = Math.round((dHu - 0.05) * 100) / 100;
        fit('SH', 'C-Tech – chiều sâu gạn ΔH', p.ct_dH, dHu, 'm', `MLSS đã hạ tới ${fx(MLSSuse)} mg/L (cận dưới CPHEEO) vẫn không đạt tỷ lệ gạn với SVI ${fx(p.SVI)} mL/g (M&E PT 8-50)`);
      }
      if (AF && MLSSuse < p.ct_MLSS) fit('SH', 'C-Tech – MLSS tại TWL', p.ct_MLSS, MLSSuse, 'mg/L', `Tỷ lệ gạn ΔH/TWL ≤ 1 − MLSS·SVI/10⁶ − h_sup/TWL với SVI ${fx(p.SVI)} mL/g (quy tắc R03)`);
      const lowered = MLSSuse < p.ct_MLSS;
      if (lowered) sc.t2('MLSS nhập', fx(p.ct_MLSS) + ' mg/L – không đạt tỷ lệ gạn với SVI ' + fx(p.SVI) + ' mL/g → hạ tự động', 'F03', 'M&E PT (8-50)');
      const MLSS = sc.i('MLSS', 'Nồng độ bùn tại TWL', MLSSuse, 'mg/L', lowered ? `Hạ tự động = ⌊(1 − ΔH/TWL − h_sup/TWL)·10⁶/SVI⌋₅₀ (SVI ${fx(p.SVI)})` : 'CPHEEO 3 500 – 5 000', lowered ? 'Quy tắc R03' : 'BEP SFC', 'MLSSc');
      sc.chk('MLSS trong khoảng 3 500 – 5 000 mg/L', MLSS >= 3500 && MLSS <= 5000, 'ĐẠT', 'XEM LẠI', 'CPHEEO', true, 'AND([MLSSc]>=3500,[MLSSc]<=5000)');
      const FM = sc.i('F/M', 'Tỷ số F/M (theo MLVSS)', p.ct_FM, '1/ngày', 'CPHEEO 0,05 – 0,3', 'BEP SFC', 'cFM');
      sc.i('MLVSS/MLSS', 'Tỷ lệ MLVSS/MLSS', p.ct_VR, '-', '', 'BEP SFC', 'cVR');
      sc.o('F/M_MLSS', 'Tỷ số F/M quy về MLSS (để so sánh với ICEAS)', FM * p.ct_VR, 'kgBOD/kgMLSS·d', 'F/M·MLVSS/MLSS', 'Quy tắc F02', '[cFM]*[cVR]', 'cFMs');
      const MLVSS = sc.o('MLVSS', 'Nồng độ MLVSS', MLSS * p.ct_VR, 'mg/L', 'MLSS·tỷ lệ', '', '[MLSSc]*[cVR]', 'cMLVSS');
      sc.o('V_F/M', 'Tổng thể tích theo F/M (SFC)', Qd * BODi / (MLVSS * FM), 'm³', 'Q_d·BOD₅/(MLVSS·F/M)', 'BEP SFC', '[cQd]*[cBOD]/([cMLVSS]*[cFM])', 'cVfm');
      sc.i('SRT_N', 'SRT tổng yêu cầu theo nitrat hóa ở T_min', SRTdc, 'ngày', 'SF/μ_AOB(T_min)/f_sục – giải trong phần mềm, kiểm tra ở mục H', 'M&E PT (7-94), (7-98)', 'cSRTn');
      sc.i('P_X,TSS(SRT_N)', 'Bùn sinh ra ở SRT_N, T_min', PXdc, 'kg TSS/ngđ', 'PT (8-20), (8-21) – giải trong phần mềm', 'M&E 5th Bảng 8-10', 'cPXn');
      sc.o('V_SRT', 'Tổng thể tích theo SRT (M&E)', VsrtOf(MLSS), 'm³', 'P_X,TSS·SRT_N/MLSS', 'M&E VD 8-3 bước 10, 11', '[cPXn]*[cSRTn]*1000/[MLSSc]', 'cVsrt');
      const Vreq = sc.o('V_yc', 'Tổng thể tích bể yêu cầu', Math.max(Qd * BODi / (MLVSS * FM), VsrtOf(MLSS)), 'm³', 'max(V_F/M; V_SRT)', 'BEP SFC; M&E 5th', 'MAX([cVfm],[cVsrt])', 'cVreq');
      const V1r = sc.o('V_1,yc', 'Thể tích 1 bể yêu cầu', Vreq / N, 'm³', 'V/N', '', '[cVreq]/[cN]', 'cV1r');
      const Qbmx = sc.o('Q_b,max', 'Lưu lượng đỉnh vào mỗi bể', Qmx / nF, 'm³/h', 'Q_max/n_cấp', '', '[cQmax]/[cnF]', 'cQbmx');
      const Vfill = sc.o('V_cấp', 'Thể tích cấp mỗi chu kỳ ở lưu lượng đỉnh', Qbmx * TFA, 'm³', 'Q_b,max·t_FA', 'BEP SFC', '[cQbmx]*[cTFA]', 'cVfill');
      const dH = sc.i('ΔH', 'Chiều sâu gạn thiết kế (TWL − BWL)', dHu, 'm', dHu !== p.ct_dH ? `Tự giảm từ ${fx(p.ct_dH)} m để đạt tỷ lệ gạn ở MLSS ≥ 3 500 mg/L` : 'SFC 2,4 m', dHu !== p.ct_dH ? 'Quy tắc R08' : 'BEP SFC', 'cdH');
      const A1q = sc.o('A_yc,1', 'Diện tích theo thể tích cấp đỉnh', Vfill / dH, 'm²', 'V_cấp/ΔH', 'BEP SFC', '[cVfill]/[cdH]', 'cAreq1');
      sc.i('TWL_max', 'Chiều sâu nước công tác tối đa', p.ct_TWLmax, 'm', 'SFC 5,5 – 5,7 m', 'BEP SFC', 'cTWLmax');
      const A2q = sc.o('A_yc,2', 'Diện tích theo thể tích bể / TWL tối đa', V1r / p.ct_TWLmax, 'm²', 'V_1/TWL_max', '', '[cV1r]/[cTWLmax]', 'cAreq2');
      // M&E 5th Bảng 8-17, Hình 8-21: cố định TWL_max, chọn diện tích để phân suất gạn ΔH/TWL ≤ r_max (0 = không áp dụng – cách SFC)
      const rDm = +p.ct_rDmax > 0 ? +p.ct_rDmax : 0;
      let A3q = 0;
      if (rDm > 0) {
        sc.i('r_gạn,max', 'Phân suất gạn tối đa ΔH/TWL (M&E)', rDm, '-', '0,25 – 0,30 (Hình 8-21 theo SVI, MLSS)', 'M&E 5th Bảng 8-17, tr.774', 'crDm');
        // TWL = V_1/A giảm khi A tăng → điều kiện V_cấp/A ≤ r·V_1/A tương đương V_1 ≥ V_cấp/r: tăng thể tích bể (giữ TWL_max)
        const V1m = Vfill / rDm;
        sc.o('V_1,gạn', 'Thể tích 1 bể để phân suất gạn ≤ r_gạn,max', V1m, 'm³', 'V_cấp/r_gạn,max', 'M&E 5th Bảng 8-17, PT (8-50)', '[cVfill]/[crDm]', 'cV1g');
        A3q = sc.o('A_yc,3', 'Diện tích tương ứng ở TWL_max', V1m / p.ct_TWLmax, 'm²', 'V_1,gạn/TWL_max', 'M&E 5th Bảng 8-17', '[cV1g]/[cTWLmax]', 'cAreq3');
      }
      const Areq = sc.o('A_yc', 'Diện tích mặt 1 bể yêu cầu', Math.max(A1q, A2q, A3q), 'm²', rDm > 0 ? 'max(A_yc,1; A_yc,2; A_yc,3)' : 'max(A_yc,1; A_yc,2)', 'BEP SFC' + (rDm > 0 ? '; M&E Bảng 8-17' : ''), rDm > 0 ? 'MAX([cAreq1],[cAreq2],[cAreq3])' : 'MAX([cAreq1],[cAreq2])', 'cAreq');
      const Lauto = !(p.ct_L > 0);
      let Lc;
      if (Lauto) { sc.i('L/B', 'Tỷ lệ dài/rộng (chọn tự động)', p.ct_LB, '-', '', 'Vellore 45/33', 'cLB'); Lc = sc.o('L', 'Chiều dài bể chọn', ceilTo(Math.sqrt(Areq * p.ct_LB), 0.5), 'm', '√(A·L/B), làm tròn 0,5 m', '', 'CEILING(SQRT([cAreq]*[cLB]),0.5)', 'cL'); }
      else Lc = sc.i('L', 'Chiều dài bể chọn', p.ct_L, 'm', '', 'BEP SFC', 'cL');
      sc.o('B_yc', 'Chiều rộng bể yêu cầu', Areq / Lc, 'm', 'A/L', '', '[cAreq]/[cL]', 'cBr');
      const Bc = sc.o('B', 'Chiều rộng bể chọn', ceilTo(Areq / Lc, 0.5), 'm', 'làm tròn lên 0,5 m', 'BEP SFC', 'CEILING([cAreq]/[cL],0.5)', 'cB');
      const A1 = sc.o('A_1', 'Diện tích 1 bể thực tế', Lc * Bc, 'm²', 'L·B', '', '[cL]*[cB]', 'cA1');
      const SWDr = rDm > 0
        ? sc.o('SWD_yc', 'Chiều sâu nước yêu cầu', Math.max(V1r, Vfill / rDm) / A1, 'm', 'max(V_1; V_1,gạn)/A', 'BEP SFC; M&E Bảng 8-17', 'MAX([cV1r],[cV1g])/[cA1]', 'cSWDr')
        : sc.o('SWD_yc', 'Chiều sâu nước yêu cầu', V1r / A1, 'm', 'V_1/A', 'BEP SFC', '[cV1r]/[cA1]', 'cSWDr');
      const TWL = sc.o('TWL', 'Chiều sâu nước công tác chọn (TWL)', ceilTo(SWDr, 0.1), 'm', 'làm tròn lên 0,1 m', 'SFC 5,5 – 5,7 m', 'CEILING([cSWDr],0.1)', 'TWL');
      sc.chk('TWL trong khoảng 4,5 – 7,5 m (sục khí khuếch tán)', TWL >= 4.5 && TWL <= 7.5, 'ĐẠT', 'XEM LẠI chiều sâu', 'M&E 5th tr.887', true, 'AND([TWL]>=4.5,[TWL]<=7.5)');
      const BWL = sc.o('BWL', 'Mực nước thấp nhất (BWL)', TWL - dH, 'm', 'TWL − ΔH', 'BEP SFC', '[TWL]-[cdH]', 'BWL');
      sc.o('MLSS_BWL', 'MLSS tại mực nước thấp nhất (so sánh với ICEAS)', MLSS * TWL / BWL, 'mg/L', 'MLSS·TWL/BWL', 'F17', '[MLSSc]*[TWL]/[BWL]', 'cMLSSb');
      sc.i('freeboard', 'Chiều cao an toàn', p.ct_fb, 'm', 'SFC 0,5 m', 'M&E 5th tr.887', 'cfb');
      sc.o('H_xd', 'Chiều cao xây dựng bể', TWL + p.ct_fb, 'm', 'TWL + freeboard', '', '[TWL]+[cfb]', 'cHxd');
      sc.o('ΔH_đỉnh', 'Chiều sâu gạn thực tế ở lưu lượng đỉnh', Vfill / (Lc * Bc), 'm', 'V_cấp/A_1 (≤ ΔH; nhỏ hơn khi diện tích do thể tích quyết định)', 'M&E 5th Bảng 8-17', '[cVfill]/([cL]*[cB])', 'cdHpk');
      const V1 = sc.o('V_1', 'Thể tích 1 bể thực tế (gồm cả selector)', Lc * Bc * TWL, 'm³', 'L·B·TWL', 'Selector nằm trong bể (BEP SFC)','[cL]*[cB]*[TWL]', 'cV1');
      const Vtot = sc.o('V', 'Tổng thể tích bể sinh học thực tế (gồm cả selector)', V1 * N, 'm³', 'V_1·N', 'Dùng cho F/M, HRT, SRT','[cV1]*[cN]', 'cVtot');
      sc.chk('Thể tích thực tế ≥ thể tích yêu cầu theo F/M', Vtot >= Vreq - 1e-6, 'ĐẠT', 'THIẾU THỂ TÍCH', 'BEP SFC', false, '[cVtot]>=[cVreq]-0.000001');
      const HRT = sc.o('HRT', 'Thời gian lưu nước', Vtot / Qd * 24, 'h', 'V/Q_d·24', 'Vellore 16,25 h', '[cVtot]/[cQd]*24', 'cHRT');
      const FMa = sc.o('F/M_tt', 'F/M thực tế', Qd * BODi / (Vtot * MLVSS), '1/ngày', 'Q_d·BOD₅/(V·MLVSS)', '', '[cQd]*[cBOD]/([cVtot]*[cMLVSS])', 'cFMa');
      sc.chk('F/M thực tế trong khoảng 0,05 – 0,3', FMa >= 0.05 && FMa <= 0.3, 'ĐẠT', 'XEM LẠI', 'CPHEEO', true, 'AND([cFMa]>=0.05,[cFMa]<=0.3)');
      const Vavg = sc.o('V_cấp,TB', 'Thể tích cấp mỗi chu kỳ ở lưu lượng TB', Qhc * TFA / nF, 'm³', 'Q_h·t_FA/n_cấp', '', '[cQh]*[cTFA]/[cnF]', 'cVavg');
      const dHavg = sc.o('ΔH_TB', 'Chiều sâu gạn ở lưu lượng TB', Vavg / A1, 'm', 'V_cấp,TB/A', '', '[cVavg]/[cA1]', 'cdHa');
      sc.chk('Chiều sâu gạn ở Q TB ≤ ΔH', dHavg <= dH + 1e-9, 'ĐẠT', 'VƯỢT ΔH', 'BEP SFC', false, '[cdHa]<=[cdH]+0.000000001');

      const sd = u.sec('D. Tuần hoàn bùn (RAS) & ngăn selector — BEP SFC mục 7; M&E 5th Sec. 8-4');
      sd.i('R', 'Tỷ lệ tuần hoàn (so với lưu lượng cấp mỗi bể)', p.ct_R, '-', 'SFC 25 %', 'BEP SFC', 'cR');
      const QRr = sd.o('Q_RAS,yc', 'Lưu lượng tuần hoàn yêu cầu', Qb * p.ct_R, 'm³/h', 'Q_b·R', '', '[cQb]*[cR]', 'cQRr');
      const QR = sd.o('Q_RAS', 'Công suất bơm RAS chọn (mỗi bể)', ceilTo(QRr, 5), 'm³/h', 'làm tròn lên 5 m³/h; cột áp ~5 m', 'BEP SFC', 'CEILING([cQRr],5)', 'cQR');
      const Qsel = sd.o('Q_sel', 'Lưu lượng qua selector', Qb + QR, 'm³/h', 'Q_b + Q_RAS', '', '[cQb]+[cQR]', 'cQsel');
      const tsel = sd.i('t_sel', 'Thời gian lưu selector', p.ct_tsel, 'phút', '30 – 60 phút', 'M&E 5th tr.738', 'ctsel');
      sd.chk('Thời gian lưu selector 30 – 60 phút', tsel >= 30 && tsel <= 60, 'ĐẠT', 'XEM LẠI', 'M&E 5th tr.738', true, 'AND([ctsel]>=30,[ctsel]<=60)');
      const Vselr = sd.o('V_sel,yc', 'Thể tích selector yêu cầu', Qsel * tsel / 60, 'm³', 'Q_sel·t/60', 'BEP SFC', '[cQsel]*[ctsel]/60', 'cVselr');
      sd.i('n_sel', 'Số ngăn con selector mỗi bể', p.ct_nsel, 'ngăn', 'van ống xuống khí cho mỗi ngăn', 'BEP SFC', 'cnsel');
      const Wselr = sd.o('W_sel,yc', 'Chiều rộng selector yêu cầu (chạy hết chiều dài L)', Vselr / (Lc * TWL), 'm', 'V_sel/(L·TWL)', 'BEP SFC', '[cVselr]/([cL]*[TWL])', 'cWselr');
      // R08: bể nhỏ – làm tròn 0,5 m làm selector vượt 20 % → giảm bước làm tròn; nếu < 10 % thì nâng tới 10 % thể tích bể
      let wSt = 0.5, Wsel0 = ceilTo(Wselr, 0.5);
      if (AF) {
        const rOf = w => Lc * w * TWL / V1;
        for (const st_ of [0.5, 0.25, 0.1]) { wSt = st_; Wsel0 = ceilTo(Wselr, st_); if (rOf(Wsel0) <= 0.2) break; }
        if (rOf(Wsel0) < 0.1) { Wsel0 = ceilTo(0.1 * V1 / (Lc * TWL), 0.1); wSt = 0.1; }
        if (Math.abs(Wsel0 - ceilTo(Wselr, 0.5)) > 1e-9) fit('SH', 'C-Tech – chiều rộng selector', ceilTo(Wselr, 0.5), Wsel0, 'm', 'Selector 10 – 20 % thể tích bể (SFC/Grundfos)');
      }
      const Wsel = sd.o('W_sel', 'Chiều rộng selector chọn', Wsel0, 'm', wSt === 0.5 && Math.abs(Wsel0 - ceilTo(Wselr, 0.5)) < 1e-9 ? 'làm tròn lên 0,5 m' : 'Tự điều chỉnh: selector 10 – 20 % thể tích bể', wSt === 0.5 && Math.abs(Wsel0 - ceilTo(Wselr, 0.5)) < 1e-9 ? '' : 'Quy tắc R08', Math.abs(Wsel0 - ceilTo(Wselr, wSt)) < 1e-9 ? `CEILING([cWselr],${wSt})` : String(Wsel0), 'cWsel');
      const Vsel = sd.o('V_sel', 'Thể tích selector thực tế', Lc * Wsel * TWL, 'm³', 'L·W_sel·TWL', '', '[cL]*[cWsel]*[TWL]', 'cVsel');
      const rsel = sd.o('V_sel/V_1', 'Tỷ lệ selector / thể tích bể', Vsel / V1, '-', 'Tài liệu C-Tech: ≈ 15 %', 'SFC/Grundfos', '[cVsel]/[cV1]', 'crsel');
      sd.o('V_pư', 'Thể tích vùng phản ứng 1 bể (không kể selector)', V1 - Vsel, 'm³', 'V_1 − V_sel', '', '[cV1]-[cVsel]', 'cVre');
      sd.chk('Selector chiếm 10 – 20 % thể tích bể', rsel >= 0.1 && rsel <= 0.2, 'ĐẠT', 'XEM LẠI', 'SFC/Grundfos', true, 'AND([crsel]>=0.1,[crsel]<=0.2)');
      // selector theo tải trọng cơ chất trên khối bùn (M&E 5th mục 8-4): bùn trong selector = RAS lấy từ lớp bùn (≈ 10⁶/SVI) pha loãng bởi nước vào
      sd.i('SVI', 'SVI thiết kế (chung)', p.SVI, 'mL/g', '', 'Quy tắc R03', 'cSVId');
      const XRb = sd.o('X_RAS', 'Nồng độ bùn tuần hoàn (lấy từ lớp bùn)', 1e6 / p.SVI, 'mg/L', '≈ 10⁶/SVI', 'M&E PT (8-50)', '1000000/[cSVId]', 'cXRb');
      const Xsel = sd.o('X_sel', 'MLSS trong selector', p.ct_R / (1 + p.ct_R) * XRb, 'mg/L', 'R/(1 + R)·X_RAS', 'M&E 5th mục 8-4', '[cR]/(1+[cR])*[cXRb]', 'cXsel');
      const FMselD = sd.o('F/M_sel', 'Tải trọng F/M toàn selector', Qb * 24 * BODi / (Vsel * Xsel), 'kgBOD/kgMLSS·d', 'Q_b·24·BOD/(V_sel·X_sel)', 'M&E 5th mục 8-4', '[cQb]*24*[cBOD]/([cVsel]*[cXsel])', 'cFMsel');
      const FMs1 = sd.o('F/M_sel,1', 'Tải trọng F/M ngăn đầu selector', FMselD * p.ct_nsel, 'kgBOD/kgMLSS·d', 'F/M_sel·n_sel', 'M&E 5th mục 8-4', '[cFMsel]*[cnsel]', 'cFMs1');
      sd.i('F/M_min', 'Cận dưới F/M selector (tham khảo, chỉnh được)', p.ct_selFMmin, 'kgBOD/kgMLSS·d', 'WEF MOP 35 / Jenkins', 'Tab 4', 'cFMsmin'); sd.i('F/M_max', 'Cận trên F/M selector (tham khảo, chỉnh được)', p.ct_selFMmax, 'kgBOD/kgMLSS·d', '', 'Tab 4', 'cFMsmax');
      sd.chk('Tải trọng F/M selector trong khoảng thiết kế', FMselD >= p.ct_selFMmin && FMselD <= p.ct_selFMmax, 'ĐẠT', FMselD < p.ct_selFMmin ? 'THẤP – selector quá lớn: giảm t_sel (ct_tsel) hoặc tăng tuần hoàn (ct_R)' : 'CAO – selector quá nhỏ: tăng t_sel (ct_tsel) hoặc tăng tuần hoàn (ct_R)', 'M&E 5th mục 8-4', true, 'AND([cFMsel]>=[cFMsmin],[cFMsel]<=[cFMsmax])');

      const se = u.sec('E. Bùn sinh ra & tuổi bùn theo SFC (đối chiếu) — BEP SFC mục 8');
      se.note('Bùn dư báo cáo, bơm SAS và xử lý bùn dùng P_X,TSS theo M&E (có SS trơ) – chung mọi phương án (quy tắc R06, mục N). Công thức Y·ΔBOD của SFC chỉ để đối chiếu.');
      const dBOD = se.o('ΔBOD', 'BOD₅ bị khử', Math.max(0, BODi - BODo), 'mg/L', 'BOD vào − BOD ra', '', 'MAX(0,[cBOD]-[cBODo])', 'cdBOD');
      const LBOD = se.o('L_BOD', 'Tải lượng BOD₅ bị khử', Qd * dBOD / 1000, 'kg/ngđ', 'Q_d·ΔBOD/1000', '', '[cQd]*[cdBOD]/1000', 'cLBOD');
      const Y = se.i('Y', 'Hệ số sinh bùn biểu kiến', p.ct_Y, 'kg/kg BOD', 'CPHEEO 0,6 – 1,2', 'BEP SFC', 'cY');
      se.chk('Y trong khoảng 0,6 – 1,2 (CPHEEO)', Y >= 0.6 && Y <= 1.2, 'ĐẠT', 'XEM LẠI (dưới khoảng CPHEEO)', 'CPHEEO', true, 'AND([cY]>=0.6,[cY]<=1.2)');
      const Xs = se.o('X_SFC', 'Bùn sinh học theo SFC (đối chiếu)', Y * LBOD, 'kg/ngđ', 'Y·L_BOD', 'BEP SFC', '[cY]*[cLBOD]', 'cX');
      const SRTs = se.o('SRT_SFC', 'Tuổi bùn (cách SFC, đối chiếu)', Vtot * MLSS / (Xs * 1000), 'ngày', 'V·MLSS/(X·1000)', 'CPHEEO ≥ 10 ngày', '[cVtot]*[MLSSc]/([cX]*1000)', 'cSRTs');
      se.chk('Tuổi bùn cách SFC ≥ 10 ngày (CPHEEO – đối chiếu; tiêu chí chính là SRT M&E ở mục G, O)', SRTs >= 10, 'ĐẠT', '< 10 NGÀY', 'CPHEEO', true, '[cSRTs]>=10');

      /* --- F: khử nitrat trong pha lắng + gạn (không sục khí) & carbon ngoài – kiểm tra theo M&E (VD 8-9) --- */
      const sf = u.sec('F. Thời gian không sục khí (lắng + gạn – khử nitrat nội bào trong lớp bùn, mục I)');
      const fax = sf.o('f_tk', 'Phân suất thời gian không sục khí', (TS + TD) / TC, '-', '(t_S + t_D)/T_C', 'Quy tắc R02', '([cTS]+[cTD])/[cTC]', 'cfax');

      /* --- G: SRT theo cân bằng bùn M&E (giải lặp trong phần mềm), rồi động học M&E chung --- */
      const S0m = p.bcod_bod * st4.BOD, nbVSSm = (1 - ch.bp_p) * st4.TSS * p.vss_tss, iTSSm = st4.TSS - st4.TSS * p.vss_tss;
      const pxOf = srt => {
        const Sm = p.Ks * (1 + kin.bH_T * srt) / (srt * (kin.muH_T - kin.bH_T) - 1);
        const Ah = Q * p.YH * (S0m - Sm) / (1 + kin.bH_T * srt) / 1000, Bh = p.fd * kin.bH_T * srt * Ah;
        let nox = 0.8 * st4.TKN, px = 0;
        for (let it = 1; it <= 5; it++) { const Cn = Q * p.YAOB * nox / (1 + kin.bAOB_T * srt) / 1000; px = Ah + Bh + Cn; nox = Math.max(0, st4.TKN - NH4e - p.fN * px * 1000 / Q); }
        return px / 0.85 + Q * nbVSSm / 1000 + Q * iTSSm / 1000;
      };
      let srtM = SRTs;
      for (let it = 0; it < 60; it++) srtM = Vtot * MLSS / (pxOf(srtM) * 1000);
      const sg = u.sec('G. Tuổi bùn theo cân bằng bùn M&E — (P_X,TSS)·SRT = V·MLSS, PT (8-20), (8-21), (8-24)');
      sg.i('SRT_M&E', 'SRT hội tụ (phần mềm giải lặp điểm cố định 60 vòng)', srtM, 'ngày', 'Kiểm tra tại mục "Cân bằng bùn" bên dưới', 'M&E 5th Ex. 8-5', 'cSRTme');
      sg.chk('SRT trong khoảng 12 – 30 ngày (batch decant)', srtM >= 12 && srtM <= 30, 'ĐẠT', 'NGOÀI 12 – 30 NGÀY', 'M&E 5th Bảng 8-19', true, 'AND([cSRTme]>=12,[cSRTme]<=30)');
      K = bioCommon(u, srtM, MLSS, { noVolume: true, noSRTcheck: true, srtName: 'SRT (cân bằng bùn M&E)', srtNote: 'Lấy từ mục G', srtX: '[cSRTme]', mlssX: '[MLSSc]' });
      const sh = u.sec('H. Kiểm tra theo M&E 5th Sec. 8-6 (SBR: Table 8-17, Ex. 8-5)');
      const bal = sh.o('Cân bằng bùn', 'P_X,TSS·SRT/(V·MLSS) (≈ 1 nếu hội tụ)', K.PXTSS * srtM * 1000 / (Vtot * MLSS), '-', '', 'PT (8-21)', '[PXTSS]*[SRT]*1000/([cVtot]*[MLSSc])', 'cbal');
      sh.chk('Cân bằng bùn hội tụ (sai số ≤ 1 %)', Math.abs(bal - 1) <= 0.01, 'ĐẠT', 'CHƯA HỘI TỤ', 'M&E 5th', false, 'ABS([cbal]-1)<=0.01');
      sh.o('Y_obs', 'Hệ số sinh bùn biểu kiến theo M&E', K.PXTSS / LBOD, 'kg TSS/kg BOD', 'P_X,TSS/L_BOD', 'Ex. 8-5: 0,75', '[PXTSS]/[cLBOD]', 'cYme');
      const fA = sh.o('f_sục', 'Tỷ lệ thời gian sục khí', TFA / TC, '-', 't_FA/T_C', '', '[cTFA]/[cTC]', 'cfA');
      const SRTa = sh.o('SRT_hk', 'SRT hiếu khí hiệu dụng của C-Tech', srtM * TFA / TC, 'ngày', 'SRT·t_FA/T_C', 'M&E tr.773', '[SRT]*[cfA]', 'cSRTa');
      sh.chk('SRT hiếu khí ≥ SRT yêu cầu nitrat hóa', SRTa >= K.SRTreq, 'ĐẠT', 'THIẾU SRT – giảm F/M hoặc tăng t_FA', 'M&E Bảng 8-15', false, '[cSRTa]>=[SRTreq]');
      const VL = sh.o('L_v', 'Tải trọng thể tích BOD', Qd * BODi / 1000 / Vtot, 'kg BOD/m³·d', 'Q·BOD/V', 'M&E Bảng 8-19: 0,1 – 0,3', '[cQd]*[cBOD]/1000/[cVtot]', 'cVL');
      sh.chk('Tải trọng thể tích BOD 0,1 – 0,3 kg/m³·d (M&E)', VL >= 0.1 && VL <= 0.3, 'ĐẠT', 'NGOÀI KHOẢNG (SFC chấp nhận cao hơn)', 'M&E 5th Bảng 8-19', true, 'AND([cVL]>=0.1,[cVL]<=0.3)');
      // nitrat hóa theo mẻ (Eq. 8-49)
      const bnc = sh.o('b_n,TB', 'b_AOB trung bình theo chu kỳ', kin.bAOB_T * TFA / TC + 0.07 * Math.pow(1.029, T - 20) * (1 - TFA / TC), '1/ngày', 'b_hk·t_FA/T_C + b_tk·(1 − t_FA/T_C)', 'M&E Ex. 8-5', '[bAT]*[cfA]+0.07*1.029^([info.T]-20)*(1-[cfA])', 'cbn');
      const Xn = sh.o('X_n', 'Nồng độ vi khuẩn nitrat hóa', Q * p.YAOB * K.NOx * srtM / ((1 + bnc * srtM) * Vtot), 'mg/L', 'Q·Y_n·NOx·SRT/[(1 + b_n·SRT)·V]', 'M&E Ex. 8-5', '[Q]*[YA]*[NOx]*[SRT]/((1+[cbn]*[SRT])*[cVtot])', 'cXn');
      const No = sh.o('N_o', 'NH₄-N đầu pha phản ứng (sau khi cấp)', (Vavg * K.NOx + (V1 - Vavg) * K.Ne) / V1, 'mg/L', '[V_cấp·NOx + (V − V_cấp)·N_e]/V', 'M&E Ex. 8-5', '([cVavg]*[NOx]+([cV1]-[cVavg])*[Ne])/[cV1]', 'cNo');
      const tN = sh.o('t_N', 'Thời gian sục khí cần cho nitrat hóa', (p.KNH4 * Math.log(Math.max(No, K.Ne * 1.0001) / K.Ne) + (No - K.Ne)) / (Math.max(Xn, 1e-6) * kin.muAOB_T / p.YAOB * p.DO / (p.KOA + p.DO)) * 24, 'h', '[K_N·ln(N_o/N_t) + (N_o − N_t)]/[X_n·(μ/Y_n)·DO/(K_o + DO)]', 'M&E PT (8-49)', '([KNH4]*LN(MAX([cNo],[Ne]*1.0001)/[Ne])+([cNo]-[Ne]))/(MAX([cXn],0.000001)*[muAT]/[YA]*[DO]/([KOA]+[DO]))*24', 'ctN');
      sh.chk('Thời gian sục khí cần cho nitrat hóa ≤ t_FA', tN <= TFA, 'ĐẠT', 't_FA CHƯA ĐỦ', 'M&E PT (8-49)', false, '[ctN]<=[cTFA]');
      // cùng kiểm tra ở lưu lượng đỉnh (thể tích cấp V_cấp) – NH₄ đầu pha cao hơn
      const NoP = sh.o('N_o,đỉnh', 'NH₄-N đầu pha phản ứng ở lưu lượng đỉnh', (Vfill * K.NOx + (V1 - Vfill) * K.Ne) / V1, 'mg/L', '[V_cấp·NOx + (V − V_cấp)·N_e]/V', 'M&E Ex. 8-5', '([cVfill]*[NOx]+([cV1]-[cVfill])*[Ne])/[cV1]', 'cNoP');
      const tNP = sh.o('t_N,đỉnh', 'Thời gian sục khí cần cho nitrat hóa ở lưu lượng đỉnh', (p.KNH4 * Math.log(Math.max(NoP, K.Ne * 1.0001) / K.Ne) + (NoP - K.Ne)) / (Math.max(Xn, 1e-6) * kin.muAOB_T / p.YAOB * p.DO / (p.KOA + p.DO)) * 24, 'h', 'PT (8-49) với N_o,đỉnh', 'M&E PT (8-49)', '([KNH4]*LN(MAX([cNoP],[Ne]*1.0001)/[Ne])+([cNoP]-[Ne]))/(MAX([cXn],0.000001)*[muAT]/[YA]*[DO]/([KOA]+[DO]))*24', 'ctNP');
      sh.chk('Nitrat hóa ở lưu lượng đỉnh: t_N,đỉnh ≤ t_FA', tNP <= TFA, 'ĐẠT', 'NH₄ RA TĂNG GIỜ CAO ĐIỂM – tăng t_FA hoặc bể điều hòa', 'M&E PT (8-49)', true, '[ctNP]<=[cTFA]');
      // tỷ lệ gạn theo SVI (Eq. 8-50)
      sh.i('SVI', 'SVI thiết kế (chung mọi phương án)', p.SVI, 'mL/g', 'Cơ sở 100; độ nhạy 150', 'Quy tắc R03', 'cSVI');
      sh.i('h_sup', 'Lớp nước trong tối thiểu dưới decanter', p.ct_hsup, 'm', '0,2 – 0,5 m', 'M&E tr.773', 'chsup');
      const FVT = sh.o('F(V_T)', 'Tỷ lệ thể tích bùn lắng', MLSS * p.SVI / 1e6, '-', 'MLSS·SVI/10⁶', 'M&E PT (8-50)', '[MLSSc]*[cSVI]/1000000', 'cFVT');
      const rDmax = sh.o('ΔH/TWL_max', 'Tỷ lệ gạn tối đa cho phép', 1 - FVT - p.ct_hsup / TWL, '-', '1 − F(V_T) − h_sup/TWL', 'M&E PT (8-50)', '1-[cFVT]-[chsup]/[TWL]', 'crDmax');
      // tỷ lệ gạn theo chiều sâu gạn thực tế ở lưu lượng đỉnh V_cấp/A_1 (= ΔH khi diện tích do ΔH quyết định)
      const dHe = Vfill / A1;
      const rD = sh.o('ΔH/TWL', 'Tỷ lệ gạn thiết kế ở lưu lượng đỉnh', dHe / TWL, '-', 'ΔH_đỉnh/TWL', 'M&E tr.774: thường ≤ 0,25', '[cdHpk]/[TWL]', 'crD');
      sh.chk('Tỷ lệ gạn ≤ tỷ lệ cho phép theo SVI', rD <= rDmax, 'ĐẠT', 'RỦI RO CUỐN BÙN – giảm ΔH hoặc MLSS', 'M&E PT (8-50)', false, '[crD]<=[crDmax]');

      /* --- I: khử nitrat & NO3 ra – cân bằng NO₃ bể mẻ (batchNO3): C-Tech chỉ cấp nước trong pha F/A (sục khí) nên pha lắng + gạn
         không có carbon nước vào: khử nitrat nội bào, chỉ NO₃ trong lớp bùn; selector khử NO₃ theo dòng bùn tuần hoàn bằng rbCOD --- */
      const si = u.sec('I. Cân bằng nitrat & NO₃-N ra — NO₃ chỉ được khử khi tiếp xúc với bùn (M&E 5th mục 8-6, 8-7)');
      si.note('Pha lắng + gạn: không có nước vào (C-Tech cấp nước trong pha F/A) → khử nitrat nhờ phân hủy nội bào, chỉ phần NO₃ nằm trong lớp bùn; lớp nước trong phía trên bị gạn ra với nồng độ cuối pha sục khí C_e. Selector: NO₃ theo dòng bùn tuần hoàn được khử bằng rbCOD nước vào. Khử nitrat đồng thời (SND) trong pha F/A chỉ tính khi có số liệu (ct_SND, mặc định 0).');
      const reqN = si.o('NO_r,yc', 'Nitrat phải khử để đạt NO₃-N mục tiêu', Q * Math.max(0, K.NOx - K.NO3t) / 1000, 'kg/ngđ', 'Q·(NOx − NO₃_t)', '', '[Q]*MAX(0,[NOx]-[NO3t])/1000', 'creqN');
      const MXbc = si.o('M_Xb', 'Sinh khối dị dưỡng hoạt tính', K.A * srtM, 'kg VSS', 'A·SRT = Q·Y_H(S₀ − S)·SRT/(1 + b_H·SRT)', 'M&E PT (7-42)', '[Ab]*[SRT]', 'cMXb');
      si.i('η', 'Hệ số tốc độ thiếu khí so với hiếu khí', p.dn_eta, '-', 'ASM1 0,8 (khoảng 0,6 – 0,8) – M&E không cho giá trị riêng; hiệu chỉnh bằng thí nghiệm NUR / số liệu NO₃ (tab 4: dn_eta)', 'IWA ASM1; M&E 5th mục 8-7', 'ceta');
      const capE = si.o('D_nội bào', 'Năng lực khử nitrat nội bào pha lắng + gạn', (1 - p.fd) * 1.42 * kin.bH_T * p.dn_eta * MXbc * fax / 2.86, 'kg N/ngđ', '(1 − f_d)·1,42·b_H·η·M_Xb·f_tk/2,86', 'M&E PT (8-20), (8-65)', '(1-[fd])*1.42*[bHT]*[ceta]*[cMXb]*[cfax]/2.86', 'ccapE');
      const Vbl = si.o('V_bùn', 'Thể tích lớp bùn khi lắng (1 bể)', FVT * V1, 'm³', 'F(V_T)·V_1 = MLSS·SVI/10⁶·V_1', 'M&E PT (8-50)', '[cFVT]*[cV1]', 'cVbl');
      const Vbld = si.o('V_bùn,ngày', 'Thể tích lớp bùn × số chu kỳ × số bể', Vbl * ncy * N, 'm³/ngđ', 'V_bùn·n_ck·N', '', '[cVbl]*[cncy]*[cN]', 'cVbld');
      const QRd = si.o('Q_RAS,ngày', 'Lưu lượng bùn tuần hoàn về selector', QR * nF * 24, 'm³/ngđ', 'Q_RAS·n_cấp·24 (bơm trong pha F/A)', 'BEP SFC', '[cQR]*[cnF]*24', 'cQRd');
      const selC = si.o('D_sel,max', 'Năng lực khử nitrat của selector theo rbCOD nước vào', Q * K.rbCOD / K.gCODN / 1000, 'kg N/ngđ', 'Q·rbCOD/(g bCOD/g N)', 'M&E PT (8-65), (8-68)', '[Q]*[rbCOD]/[gCODN]/1000', 'cselC');
      si.i('η_SND', 'Khử nitrat đồng thời trong pha F/A (phần NOx)', p.ct_SND, '-', '0 khi thiết kế; SFC 0,75 chỉ dùng khi có số liệu vận hành / kịch bản độ nhạy', 'M&E 5th mục 8-7', 'cSND');
      const NOxa = si.o('NOx_SND', 'NOx sau khử nitrat đồng thời', K.NOx * (1 - p.ct_SND), 'mg/L', 'NOx·(1 − η_SND)', '', '[NOx]*(1-[cSND])', 'cNOxa');
      const B0 = batchNO3({ Q, NOx: K.NOx, snd: p.ct_SND, dEnd: capE, Vbld, Qsel: QRd, dSel: selC });
      const Ce = si.i('C_e', 'NO₃-N cuối pha sục khí (= nước gạn) – giải cân bằng NO₃', B0.Ce, 'mg/L', 'Q·NOx_SND = Q·C_e + min(D_nội bào; C_e·V_bùn,ngày) + min(Q_RAS·C_e; D_sel,max) – giải chia đôi', 'M&E 5th mục 8-6', 'cCe');
      const DNs = si.o('ΔN_lắng', 'NO₃ khử trong lớp bùn (pha lắng + gạn)', Math.min(capE, Ce * Vbld / 1000), 'kg/ngđ', 'min(D_nội bào; C_e·V_bùn,ngày)', '', 'MIN([ccapE],[cCe]*[cVbld]/1000)', 'cDNs');
      const DNsel = si.o('ΔN_sel', 'NO₃ khử ở selector', Math.min(QRd * Ce / 1000, selC), 'kg/ngđ', 'min(Q_RAS·C_e; D_sel,max)', '', 'MIN([cQRd]*[cCe]/1000,[cselC])', 'cDNsel');
      const DNsnd = si.o('ΔN_SND', 'NO₃ khử đồng thời trong pha F/A', Q * K.NOx * p.ct_SND / 1000, 'kg/ngđ', 'Q·NOx·η_SND', '', '[Q]*[NOx]*[cSND]/1000', 'cDNsnd');
      const res0 = si.o('Sai số cân bằng', 'Q·NOx_SND − (Q·C_e + ΔN_lắng + ΔN_sel)', Q * NOxa / 1000 - Q * Ce / 1000 - DNs - DNsel, 'kg/ngđ', '≈ 0', '', '[Q]*[cNOxa]/1000-[Q]*[cCe]/1000-[cDNs]-[cDNsel]', 'cNbal');
      si.chk('Cân bằng NO₃ hội tụ', Math.abs(res0) <= 1e-3 * Math.max(1, Q * NOxa / 1000), 'ĐẠT', 'CHƯA HỘI TỤ', '', false, 'ABS([cNbal])<=0.001*MAX(1,[Q]*[cNOxa]/1000)');
      const capN = si.o('NO_r,kn', 'NO₃ khử bằng carbon nội tại (lắng + selector + SND)', DNs + DNsel + DNsnd, 'kg/ngđ', 'ΔN_lắng + ΔN_sel + ΔN_SND', '', '[cDNs]+[cDNsel]+[cDNsnd]', 'ccapN');
      // carbon ngoài châm vào selector: chỉ khử được NO₃ theo dòng bùn tuần hoàn (Q_RAS·C_e)
      let carbon = { M: 0, sl: 0 }, useC = false, CeF = Ce, CeX = '[cCe]';
      if ((Ce > K.NO3t + 1e-6 || p.meoh_set > 0) && c.carbon === 'auto') {
        const dSel2 = p.meoh_set > 0 ? selC + p.meoh_set * 1.5 * Q / 1000 / (2.86 / (1 - 1.42 * 0.3)) : 1e12;
        const B1 = batchNO3({ Q, NOx: K.NOx, snd: p.ct_SND, dEnd: capE, Vbld, Qsel: QRd, dSel: dSel2 });
        CeF = si.i('C_e,carbon', 'NO₃-N nước gạn khi châm carbon ngoài vào selector', B1.Ce, 'mg/L', 'Cùng cân bằng, selector không giới hạn carbon', 'M&E Bảng 8-26', 'cCe2'); CeX = '[cCe2]';
        const defN = si.o('ΔN_carbon', 'NO₃ khử thêm bằng carbon ngoài ở selector', Math.max(0, QRd * CeF / 1000 - selC), 'kg/ngđ', 'max(0; Q_RAS·C_e − D_sel,max)', '', 'MAX(0,[cQRd]*[cCe2]/1000-[cselC])', 'defN');
        if (defN > 1e-6 || p.meoh_set > 0) { carbon = extCarbon(si, defN, '[defN]'); useC = true; }
      }
      const NO3e = si.o('NO₃-N_e', 'NO₃-N ra', Math.max(K.NO3t, CeF), 'mg/L', 'max(NO₃_t; C_e)', '', `MAX([NO3t],${CeX})`, 'NO3e_c');
      si.chk('NO₃-N ra ≤ mục tiêu ' + fx(K.NO3t) + ' mg/L', CeF <= K.NO3t + 1e-6, 'ĐẠT', 'KHÔNG ĐẠT — tăng tuần hoàn bùn về selector (ct_R), giảm tỷ lệ gạn (tăng V_bùn/V_cấp) hoặc dùng SND có điều khiển DO (cần số liệu); hoặc chọn công nghệ có pha thiếu khí khuấy (ICEAS NDN(P), A²O)', 'M&E 5th mục 8-6', true, `${CeX}<=[NO3t]+0.000001`);
      if (CeF > K.NO3t + 1e-6) warn(`C-Tech: NO₃-N nước gạn ${fx(CeF)} mg/L > mục tiêu ${fx(K.NO3t)} mg/L – khử nitrat chỉ trong lớp bùn khi lắng + selector${useC ? ' (đã châm carbon vào selector)' : ''}; tăng ct_R, giảm tỷ lệ gạn hoặc tính SND khi có số liệu (ct_SND).`);
      const NO3den = si.o('NO₃_dn', 'NO₃-N được khử', K.NOx - NO3e, 'mg/L', '', '', '[NOx]-[NO3e_c]', 'cNO3dn');
      const NO3bio = si.o('NO₃_dn,SH', 'NO₃-N khử bằng carbon nội tại', Math.min(NO3den, capN * 1000 / Q), 'mg/L', 'min(NO₃_dn; NO_r,kn/Q)', '', 'MIN([cNO3dn],[ccapN]*1000/[Q])', 'cNO3dnB');

      /* --- J: nhu cầu oxy (SFC) + đối chiếu M&E --- */
      const sj = u.sec('J. Nhu cầu oxy AOTR — BEP SFC mục 9; đối chiếu M&E PT (8-23)');
      sj.i('k_O₂', 'kg O₂ / kg BOD khử', p.ct_kO, '-', 'SFC 1,2 (kinh nghiệm)', 'BEP SFC', 'ckO');
      const O2b = sj.o('O₂_BOD', 'O₂ cho khử BOD', p.ct_kO * LBOD, 'kg/ngđ', 'k_O₂·L_BOD', 'BEP SFC', '[ckO]*[cLBOD]', 'cO2b');
      const Nass = sj.o('N_đh', 'N đồng hóa khi khử BOD', 0.05 * dBOD, 'mg/L', '5 %·ΔBOD', 'BEP SFC', '0.05*[cdBOD]', 'cNass');
      const Nnit = sj.o('N_nit', 'NH₃-N bị nitrat hóa', Math.max(0, TKNi - K.Ne - Nass), 'mg/L', 'TKN − NH₄ ra − N đồng hóa', 'BEP SFC', 'MAX(0,[cTKN]-[Ne]-[cNass])', 'cNnit');
      const LN = sj.o('L_N', 'Tải lượng NH₃-N nitrat hóa', Qd * Nnit / 1000, 'kg/ngđ', 'Q_d·N_nit/1000', '', '[cQd]*[cNnit]/1000', 'cLN');
      const O2n = sj.o('O₂_N', 'O₂ cho nitrat hóa', 4.57 * LN, 'kg/ngđ', '4,57·L_N', 'M&E PT (8-23)', '4.57*[cLN]', 'cO2n');
      sj.i('η_SND', 'Hiệu suất khử nitrat đồng thời (tín dụng O₂)', p.ct_eDN, '-', 'SFC 75 %', 'BEP SFC', 'ceDN');
      const NO3dnS = sj.o('NO₃_khử', 'NO₃-N được khử (tín dụng O₂)', p.ct_eDN * Math.max(0, LN - Qd * NO3e / 1000), 'kg/ngđ', 'η_SND·(L_N − Q·NO₃ ra)', 'BEP SFC', '[ceDN]*MAX(0,[cLN]-[cQd]*[NO3e_c]/1000)', 'cNO3dS');
      const O2dn = sj.o('O₂_DN', 'O₂ thu hồi do khử nitrat', 2.86 * NO3dnS, 'kg/ngđ', '2,86·NO₃ khử', 'M&E VD 8-7 bước 9', '2.86*[cNO3dS]', 'cO2dn');
      const AOTR = sj.o('AOTR', 'Tổng nhu cầu oxy thực tế', O2b + O2n - O2dn, 'kg O₂/ngđ', 'O₂_BOD + O₂_N − O₂_DN', 'BEP SFC', '[cO2b]+[cO2n]-[cO2dn]', 'cAOTR');
      // M&E 5th: nhu cầu oxy tính với động học ở nhiệt độ nước cao nhất (cùng SRT); tín dụng khử nitrat chỉ phần carbon nội tại
      const Ro = o2Tmax(sj, K, NO3bio, '[cNO3dnB]', 'cRo').Ro;
      const rRo = sj.o('R₀/AOTR', 'Tỷ số O₂ M&E / O₂ SFC', Ro / AOTR, '-', '', '', '[cRo]/[cAOTR]', 'crRo');
      sj.chk('Nhu cầu O₂ SFC đủ so với M&E (tỷ số ≤ 1,1)', rRo <= 1.1, 'ĐẠT', 'SFC THIẾU O₂ – dùng R₀ M&E', 'M&E PT (8-23)', true, '[crRo]<=1.1');
      const AOR = sj.o('AOR_tk', 'Nhu cầu oxy dùng thiết kế cấp khí', Math.max(AOTR, Ro), 'kg O₂/ngđ', 'max(AOTR SFC; R₀ M&E)', '', 'MAX([cAOTR],[cRo])', 'cAOR');

      /* --- K: SOTR theo M&E 5th PT (5-70) & máy thổi khí (thay cho M&E 4th PT 5-55 của BEP SFC) --- */
      const sk = u.sec('K. Nhu cầu oxy tiêu chuẩn SOTR & máy thổi khí — M&E 5th PT (5-70); BEP SFC mục 10–13 (nhiệt độ nước cao nhất)');
      const CsTc = sk.o('C*s,T', 'DO bão hòa bề mặt tại T_max', doSat(I.Tmax), 'mg/L', 'APHA 4500-O tại T_max – chung mọi phương án (F06)', 'M&E 5th App. E', doSatX('[info.Tmax]'), 'cCsT');
      const Cs20c = sk.o('C*s,20', 'DO bão hòa bề mặt 20 °C, 1 atm', doSat(20), 'mg/L', 'APHA 4500-O', 'M&E 5th App. E', doSatX(20), 'cCs20');
      const Om = sk.o('Ω', 'Hệ số hiệu chỉnh áp suất', patm / 101.325, '-', 'P_b/P_s', 'M&E 5th PT (5-70); App. B', '[info.patm]/101.325', 'cOm');
      const tauC = sk.o('τ', 'Hệ số hiệu chỉnh nhiệt độ của DO bão hòa', CsTc / Cs20c, '-', 'C*s,T/C*s,20', 'M&E 5th PT (5-70)', '[cCsT]/[cCs20]', 'ctau');
      sk.i('h_đĩa', 'Cao độ đặt đĩa so với đáy', p.ct_hd, 'm', '', 'BEP SFC', 'chd');
      const Heff = sk.o('D_f', 'Độ ngập đĩa trung bình chu kỳ', (TWL + BWL) / 2 - p.ct_hd, 'm', '(TWL + BWL)/2 − h_đĩa', 'BEP SFC', '([TWL]+[BWL])/2-[chd]', 'cHeff');
      sk.i('d_e', 'Hệ số hiệu chỉnh giữa cột nước', p.air_dmid, '-', '0,25 – 0,45 (0,40)', 'M&E 5th tr.420', 'cdmid');
      const Cp = sk.o('C*∞,20', 'DO bão hòa ở độ ngập, 20 °C, mực nước biển', Cs20c * (1 + p.air_dmid * Heff / 10.33), 'mg/L', 'C*s,20·[1 + d_e·(D_f/P_s)], P_s = 10,33 m', 'M&E 5th PT (5-70)', '[cCs20]*(1+[cdmid]*[cHeff]/10.33)', 'cCp');
      sk.i('α', 'Hệ số α', p.air_alpha, '-', 'M&E 5th tr.424: 0,3 – 1,2 (khuếch tán 0,4 – 0,8); tr.885: 0,53 – 0,65 theo SRT 10 – 30 ngày', 'M&E 5th', 'cal');
      sk.i('β', 'Hệ số β', p.air_beta, '-', '0,95 – 0,98', 'M&E 5th tr.420', 'cbe');
      sk.i('F', 'Hệ số bám bẩn', p.air_F, '-', '0,65 – 0,9', 'M&E 5th tr.420', 'cFf');
      sk.i('C', 'DO vận hành', p.DO, 'mg/L', '', '', 'cDO');
      const SOTR = sk.o('SOTR', 'Nhu cầu oxy tiêu chuẩn', AOR * Cp / (tauC * p.air_beta * Om * Cp - p.DO) * Math.pow(1.024, 20 - I.Tmax) / (p.air_alpha * p.air_F), 'kg O₂/ngđ', 'AOR·C*∞,20/(τ·β·Ω·C*∞,20 − C)·1,024^(20−T)/(α·F)', 'M&E 5th PT (5-70)', '[cAOR]*[cCp]/([ctau]*[cbe]*[cOm]*[cCp]-[cDO])*1.024^(20-[info.Tmax])/([cal]*[cFf])', 'cSOTR');
      sk.i('k_đỉnh', 'Hệ số tải đỉnh nhu cầu oxy', p.O2peak, '-', '1,5 – 2,0 (chung mọi phương án)', 'M&E VD 8-3 bước 13', 'cpk');
      const SOTRh = sk.o('SOTR_b,h', 'SOTR mỗi bể mỗi giờ sục khí (giờ cao điểm)', SOTR * p.O2peak / N / TA, 'kg O₂/h·bể', 'SOTR·k_đỉnh/N/t_sục', '', '[cSOTR]*[cpk]/[cN]/[cTA]', 'cSOTRh');
      sk.i('SOTE', 'Hiệu suất truyền oxy tiêu chuẩn (cùng loại đĩa mọi phương án)', p.air_SOTE, '-', 'Catalogue', 'Quy tắc R05', 'cSOTE');
      const Airh = sk.o('Q_khí,b', 'Lưu lượng khí mỗi bể khi sục', SOTRh / (p.air_SOTE * 0.2318 * 1.293), 'Nm³/h·bể', 'SOTR_b,h/(SOTE·0,2318·1,293)', 'BEP SFC', '[cSOTRh]/([cSOTE]*0.2318*1.293)', 'cAirh');
      sk.i('P', 'Số máy thổi khí chạy cho mỗi bể', p.ct_P, 'máy', '', 'BEP SFC', 'cP');
      const Qbl = sk.o('Q_máy', 'Lưu lượng 1 máy thổi khí chọn', ceilTo(Airh / p.ct_P, 50), 'Nm³/h', 'làm tròn lên 50', 'BEP SFC', 'CEILING([cAirh]/[cP],50)', 'cQbl');
      const nRun = sk.o('n_chạy', 'Số máy thổi khí vận hành', p.ct_P * nF, 'máy', 'P·n_cấp', 'BEP SFC', '[cP]*[cnF]', 'cnRun');
      sk.i('n_dp', 'Số máy thổi khí dự phòng', p.ct_Pst, 'máy', '', 'BEP SFC', 'cnSt');
      sk.o('MI', 'Cường độ khí trên mặt bằng bể', Airh / A1, 'Nm³/m²·h', '≥ 2,2 để duy trì xáo trộn', '', '[cAirh]/[cA1]', 'cMI');
      sk.i('q_đĩa', 'Lưu lượng khí mỗi đĩa (cùng loại đĩa mọi phương án)', p.air_qd, 'Nm³/h·đĩa', 'Catalogue, 1 – 8', 'Quy tắc R05', 'cqd');
      sk.chk('q_đĩa trong dải catalogue 1 – 8 m³/h·đĩa', p.air_qd >= 1 && p.air_qd <= 8, 'ĐẠT', 'NGOÀI DẢI CATALOGUE', 'F10', true, 'AND([cqd]>=1,[cqd]<=8)');
      const nd = sk.o('n_đĩa', 'Số đĩa khí mỗi bể', Math.ceil(Airh / p.air_qd - 1e-9), 'đĩa/bể', 'Q_khí,b/q_đĩa', '', 'ROUNDUP([cAirh]/[cqd],0)', 'cnd');
      const densC = sk.o('mật độ', 'Mật độ đĩa', nd / A1, 'đĩa/m²', '1 – 6', 'F10', '[cnd]/[cA1]', 'cdens');
      sk.chk('Mật độ đĩa 1 – 6 đĩa/m²', densC >= 1 && densC <= 6, 'ĐẠT', 'NGOÀI DẢI – xem lại q_đĩa / bố trí đĩa', 'F10', true, 'AND([cdens]>=1,[cdens]<=6)');
      sk.i('Δh_đĩa', 'Tổn thất qua đĩa khí', p.ct_dpd, 'm', '', 'NSX', 'cdpd'); sk.i('Δh_ống', 'Tổn thất ống, van, lọc + dự phòng', p.ct_dpp, 'm', '', '', 'cdpp');
      const p2 = sk.o('p₂', 'Áp suất đẩy máy thổi khí', patm + 9.81 * (TWL - p.ct_hd + p.ct_dpd + p.ct_dpp), 'kPa', 'p_atm + ρg·(TWL − h_đĩa + Δh)', 'M&E PT (5-77)', '[info.patm]+9.81*([TWL]-[chd]+[cdpd]+[cdpp])', 'cp2');
      sk.i('e', 'Hiệu suất máy thổi khí', p.air_e, '-', '0,70 – 0,90', 'M&E 5th tr.434', 'ce');
      const Pw1 = sk.o('P_w', 'Công suất trục 1 máy', Qbl * 1.293 / 3600 * 8.314 * 293.15 / (28.97 * 0.283 * p.air_e) * (Math.pow(p2 / patm, 0.283) - 1), 'kW', 'wRT₁/(28,97·0,283·e)·[(p₂/p₁)^0,283 − 1]', 'M&E PT (5-77a)', '[cQbl]*1.293/3600*8.314*293.15/(28.97*0.283*[ce])*(([cp2]/[info.patm])^0.283-1)', 'cPw');
      sk.i('LF', 'Hệ số tải TB máy thổi (chung; 1,0 = cơ sở)', p.air_LF, '-', 'SFC: OUR tiết kiệm 30 – 40 % → kịch bản độ nhạy LF 0,8', 'Quy tắc R05', 'cLF');
      const Eb = sk.o('E_thổi', 'Điện năng máy thổi khí', Pw1 / 0.95 * nRun * 24 * p.air_LF, 'kWh/ngđ', 'P_w/0,95·n_chạy·24·LF', '', '[cPw]/0.95*[cnRun]*24*[cLF]', 'cEb');

      /* --- L: decanter --- */
      const sl = u.sec('L. Gạn nước (decanter) — BEP SFC mục 14');
      const Vdec = sl.o('V_gạn', 'Thể tích gạn mỗi bể mỗi chu kỳ (Q TB)', Vavg, 'm³', '= V_cấp,TB', 'BEP SFC', '[cVavg]', 'cVdec');
      const Qd1 = sl.o('Q_gạn', 'Lưu lượng gạn mỗi bể', Vdec / TD, 'm³/h', 'V_gạn/t_D', 'BEP SFC', '[cVdec]/[cTD]', 'cQdec');
      sl.i('n_dec', 'Số decanter mỗi bể', p.ct_ndec, 'bộ', '', '', 'cndec');
      const QdecPk = sl.o('Q_gạn,đỉnh', 'Lưu lượng gạn khi gạn hết ΔH (kiểm tra ống ra)', Vfill / TD, 'm³/h', 'V_cấp/t_D', 'BEP SFC', '[cVfill]/[cTD]', 'cQdecp');
      sl.o('Q_ra,đỉnh', 'Lưu lượng gạn đỉnh ra công trình sau', QdecPk * nDs, 'm³/h', 'Q_gạn,đỉnh·n_gạn', '', '[cQdecp]*[cnD]', 'Qdec');
      sl.o('q_máng', 'Tải trọng máng decanter (Q TB, máng chạy hết chiều rộng)', Qd1 / p.ct_ndec / Bc, 'm³/m·h', 'Q_gạn/(n_dec·B)', '', '[cQdec]/[cndec]/[cB]', 'cqw');
      /* --- L2: chu kỳ mùa mưa (SFC storm mode) – kiểm tra chiều sâu gạn, tỷ lệ gạn, decanter ở lưu lượng mùa mưa --- */
      {
        const sw = u.sec('L2. Chu kỳ mùa mưa (SFC storm mode) – kiểm tra gạn & decanter ở lưu lượng mùa mưa');
        const kw = sw.i('k_mưa', 'Hệ số cao điểm mùa mưa so với Q_tb', +p.ct_kw > 0 ? +p.ct_kw : I.kmax, '-', +p.ct_kw > 0 ? 'Nhập (tab 4: ct_kw)' : 'Chưa có số liệu mùa mưa → lấy bằng k_max', 'Số liệu đo', 'ckw');
        const Qww = sw.o('Q_mưa', 'Lưu lượng giờ mùa mưa', Qhc * kw, 'm³/h', 'Q_h·k_mưa', '', '[cQh]*[ckw]', 'cQww');
        const TFAs = sw.i('t_FA,mưa', 'Pha F/A mùa mưa', +p.ct_TFA_s > 0 ? +p.ct_TFA_s : TFA, 'h', +p.ct_TFA_s > 0 ? 'ct_TFA_s' : 'Như chu kỳ thường', 'BEP SFC', 'cTFAs');
        const TSs = sw.i('t_S,mưa', 'Pha lắng mùa mưa', +p.ct_TS_s > 0 ? +p.ct_TS_s : TS, 'h', +p.ct_TS_s > 0 ? 'ct_TS_s' : 'Như chu kỳ thường', 'BEP SFC', 'cTSs');
        const TDs = sw.i('t_D,mưa', 'Pha gạn mùa mưa', +p.ct_TD_s > 0 ? +p.ct_TD_s : TD, 'h', +p.ct_TD_s > 0 ? 'ct_TD_s' : 'Như chu kỳ thường', 'BEP SFC', 'cTDs');
        const TCs = sw.o('T_C,mưa', 'Chu kỳ mùa mưa', TFAs + TSs + TDs, 'h', 't_FA + t_S + t_D', '', '[cTFAs]+[cTSs]+[cTDs]', 'cTCs');
        const nFs = sw.o('n_cấp,mưa', 'Số bể nhận nước đồng thời mùa mưa', N * TFAs / TCs, 'bể', 'N·t_FA/T_C', 'BEP SFC', '[cN]*[cTFAs]/[cTCs]', 'cnFs');
        sw.chk('Mùa mưa: số bể nhận nước đồng thời là số nguyên', Math.abs(nFs - Math.round(nFs)) < 1e-9, 'ĐẠT', 'CHỈNH chu kỳ mùa mưa (ct_TFA_s, ct_TS_s, ct_TD_s)', 'BEP SFC', true, 'ABS([cnFs]-ROUND([cnFs],0))<0.000000001');
        sw.chk('Mùa mưa: thời gian lắng ≥ 0,5 h', TSs >= 0.5 - 1e-9, 'ĐẠT', 'LẮNG QUÁ NGẮN – tăng ct_TS_s', 'M&E Bảng 8-17', true, '[cTSs]>=0.5-0.000000001');
        const Vfs = sw.o('V_cấp,mưa', 'Thể tích cấp mỗi chu kỳ mùa mưa', Qww / nFs * TFAs, 'm³', 'Q_mưa/n_cấp·t_FA', 'BEP SFC', '[cQww]/[cnFs]*[cTFAs]', 'cVfs');
        const dHs = sw.o('ΔH_mưa', 'Chiều sâu gạn mùa mưa', Vfs / A1, 'm', 'V_cấp,mưa/A_1', '', '[cVfs]/[cA1]', 'cdHs');
        sw.chk('Mùa mưa: ΔH ≤ hành trình decanter ΔH thiết kế', dHs <= dH + 1e-6, 'ĐẠT', 'VƯỢT – rút ngắn chu kỳ mùa mưa (ct_TFA_s), tăng số bể (ct_N) hoặc tăng ΔH (ct_dH)', 'BEP SFC', false, '[cdHs]<=[cdH]+0.000001');
        sw.chk('Mùa mưa: tỷ lệ gạn ≤ tỷ lệ cho phép theo SVI', dHs / TWL <= rDmax + 1e-9, 'ĐẠT', 'RỦI RO CUỐN BÙN – rút ngắn chu kỳ mùa mưa, giảm MLSS (ct_MLSS) hoặc tăng diện tích bể', 'M&E PT (8-50)', false, '[cdHs]/[TWL]<=[crDmax]+0.000000001');
        const Qds = sw.o('Q_gạn,mưa', 'Lưu lượng gạn mỗi bể mùa mưa', Vfs / TDs, 'm³/h', 'V_cấp,mưa/t_D,mưa', 'BEP SFC', '[cVfs]/[cTDs]', 'cQdecs');
        sw.chk('Mùa mưa: lưu lượng gạn ≤ công suất decanter (Q_gạn,đỉnh)', Qds <= QdecPk + 1e-6, 'ĐẠT', 'VƯỢT – chọn decanter theo Q_gạn,mưa hoặc tăng t_D,mưa (ct_TD_s)', 'BEP SFC', true, '[cQdecs]<=[cQdecp]+0.000001');
      }

      // độ kiềm, photpho, kết quả
      alkalinity(u, K.NOx, '[NOx]', NO3den, '[cNO3dn]', 'M. ');
      /* --- N: bùn dư (M&E – chung), bơm SAS & photpho --- */
      const sn = u.sec('N. Bùn dư, bơm SAS & photpho (phương pháp chung M&E; tín dụng bio-P của SFC tách riêng)');
      const PX = sn.o('P_X,TSS', 'Bùn dư (M&E, có SS trơ) – dùng cho cụm bùn', K.PXTSS, 'kg TSS/ngđ', 'Mục 6 (PT 8-21)', 'Quy tắc R06', '[PXTSS]', 'cPX');
      sn.o('X_SFC/P_X', 'Tỷ số bùn theo SFC / M&E (đối chiếu)', Xs / PX, '-', '', 'F08', '[cX]/[cPX]', 'cXr');
      const Xc = sn.o('X_ck', 'Bùn xả mỗi bể mỗi chu kỳ', PX / N / ncy, 'kg/chu kỳ', 'P_X,TSS/N/n_ck', '', '[cPX]/[cN]/[cncy]', 'cXc');
      sn.i('C_SAS', 'Nồng độ bùn xả', p.ct_Cs, 'phần khối lượng', 'SFC ~0,8 %', 'BEP SFC', 'cCs');
      const Vsas = sn.o('V_SAS', 'Thể tích bùn xả mỗi bể mỗi chu kỳ', Xc / (p.ct_Cs * 1.05 * 1000), 'm³', 'X_ck/(C·1,05·1000)', 'BEP SFC', '[cXc]/([cCs]*1.05*1000)', 'cVsas');
      sn.i('t_SAS', 'Thời gian chạy bơm SAS mỗi chu kỳ', p.ct_tSAS, 'phút', 'trong pha gạn', 'BEP SFC', 'ctSAS');
      const QSr = sn.o('Q_SAS,yc', 'Công suất bơm SAS yêu cầu', Vsas * 60 / p.ct_tSAS, 'm³/h', 'V_SAS·60/t', '', '[cVsas]*60/[ctSAS]', 'cQSr');
      const QS = sn.o('Q_SAS', 'Công suất bơm SAS chọn', ceilTo(QSr, 5), 'm³/h', 'làm tròn lên 5 m³/h; cột áp ~10 m', 'BEP SFC', 'CEILING([cQSr],5)', 'cQS');
      sn.i('f_P', 'P đồng hóa cơ bản trong sinh khối', p.fP, 'gP/gVSS', 'Chung mọi phương án (F15)', 'M&E VD 8-13', 'cfPb');
      const Pass = sn.o('P_đh', 'P đồng hóa cơ bản', p.fP * K.PXVSS * 1000 / Q, 'mg/L', 'f_P·P_X,VSS/Q', 'M&E VD 8-13', '[cfPb]*[PXVSS]*1000/[Q]', 'cPass');
      sn.i('f_P,SFC', 'P khử sinh học tổng theo SFC (gồm bio-P nhờ selector)', p.ct_fP, 'phần ΔBOD', 'SFC 2,5 %; 0 = không tín dụng', 'BEP SFC', 'cfP');
      const Pcr = sn.o('P_bioP', 'Tín dụng bio-P do selector (phần vượt P đồng hóa)', Math.max(0, p.ct_fP * dBOD - Pass), 'mg/L', 'max(0; f_P,SFC·ΔBOD − P_đh)', 'BEP SFC – cần SFC xác nhận', 'MAX(0,[cfP]*[cdBOD]-[cPass])', 'cPbio');
      const TPe = sn.o('TP_e', 'TP còn lại sau khử sinh học', Math.max(0, TPi - Pass - Pcr), 'mg/L', 'max(0; TP − P_đh − P_bioP)', '', 'MAX(0,[cTP]-[cPass]-[cPbio])', 'TPbio');
      /* --- O: đối chiếu MC5 – mỗi điểm phương pháp SFC/CPHEEO khác M&E 5th: so sánh, cảnh báo, cách điều chỉnh --- */
      const so = u.sec('O. Đối chiếu phương pháp C-Tech (SFC/CPHEEO) với M&E 5th – cảnh báo & điều chỉnh');
      so.note('Mỗi dòng kiểm tra dưới đây là một điểm phương pháp nhà cung cấp khác M&E 5th. "LỆCH" nghĩa là kết quả SFC không bảo đảm theo M&E – xem gợi ý ở cột kết quả hoặc nút "Áp dụng" ở tab 3 (bấm nhãn lỗi).');
      const ctW = [];
      // 1. thể tích: F/M (SFC) hay SRT (M&E) chi phối
      const VfmV = Qd * BODi / (MLVSS * FM), VsrV = VsrtOf(MLSS);
      so.o('V_SRT/V_F/M', 'Tỷ số thể tích theo SRT (M&E) / theo F/M (SFC)', VsrV / VfmV, '-', '> 1: F/M của SFC cho bể nhỏ hơn yêu cầu nitrat hóa', 'M&E 5th mục 8-6; Bảng 8-15', '[cVsrt]/[cVfm]', 'cmVr');
      if (VsrV > VfmV * 1.001) ctW.push(`thể tích theo F/M ${fx(FM, 3)} (SFC) nhỏ hơn thể tích theo SRT nitrat hóa ${fx(VsrV, 0)} m³ – phần mềm đã lấy V_SRT; muốn khớp F/M thì giảm F/M (ct_FM ≈ ${fx(FM * VfmV / VsrV, 3)}) hoặc tăng t_FA`);
      so.chk('Thể tích theo F/M của SFC đủ cho SRT nitrat hóa ở T_min (M&E)', VsrV <= VfmV * 1.001, 'ĐẠT', `LỆCH – V_SRT chi phối; đặt F/M ≤ ${fx(FM * VfmV / VsrV, 3)} hoặc tăng t_FA`, 'M&E 5th mục 8-6', true, '[cVsrt]<=[cVfm]*1.001');
      // 2. tuổi bùn SFC (Y·ΔBOD) so với SRT cân bằng bùn M&E
      so.o('SRT_SFC/SRT_M&E', 'Tỷ số tuổi bùn cách SFC / SRT cân bằng bùn M&E', SRTs / srtM, '-', 'SFC bỏ qua nbVSS, iTSS, mảnh tế bào → SRT ảo cao hơn', 'M&E PT (8-20), (8-21)', '[cSRTs]/[cSRTme]', 'cmSr');
      if (SRTs > srtM * 1.15) ctW.push(`tuổi bùn tính theo SFC ${fx(SRTs)} ngày cao hơn SRT thật ${fx(srtM)} ngày (M&E) – mọi kiểm tra SRT dùng giá trị M&E`);
      so.chk('Tuổi bùn cách SFC lệch ≤ 15 % so với M&E', SRTs <= srtM * 1.15, 'ĐẠT', 'LỆCH – không dùng SRT_SFC để vận hành xả bùn; dùng SRT_M&E (mục G)', 'M&E PT (8-21)', true, '[cSRTs]<=[cSRTme]*1.15');
      so.chk('SRT_M&E ≥ 10 ngày (thay cho kiểm tra CPHEEO theo SRT_SFC)', srtM >= 10, 'ĐẠT', 'DƯỚI 10 NGÀY – tăng thể tích hoặc MLSS', 'M&E Bảng 8-19', false, '[cSRTme]>=10');
      // 3. hệ số sinh bùn
      const YoME = K.PXTSS / LBOD;
      so.o('Y_SFC/Y_obs,M&E', 'Tỷ số hệ số sinh bùn SFC / Y_obs M&E', Y / YoME, '-', 'M&E VD 8-5: Y_obs ≈ 0,75 g TSS/g BOD', 'M&E VD 8-5', '[cY]/[cYme]', 'cmYr');
      if (Y < YoME * 0.85) ctW.push(`Y = ${fx(Y)} của SFC thấp hơn Y_obs M&E ${fx(YoME)} – bùn dư, bơm SAS, xử lý bùn đã dùng P_X,TSS M&E; đặt ct_Y ≈ ${fx(YoME)} để phần đối chiếu SFC khớp`);
      so.chk('Y của SFC ≥ 85 % Y_obs M&E', Y >= YoME * 0.85, 'ĐẠT', `LỆCH – bùn dư SFC thiếu; đặt ct_Y ≈ ${fx(YoME)} (đã dùng P_X,TSS M&E cho bùn)`, 'M&E PT (8-21)', true, '[cY]>=[cYme]*0.85');
      // 4. MLVSS/MLSS
      const fvME = K.PXVSS / K.PXTSS;
      so.o('f_VSS,M&E', 'Tỷ lệ MLVSS/MLSS theo bùn sinh ra M&E', fvME, '-', 'P_X,VSS/P_X,TSS', 'M&E PT (8-20), (8-21)', '[PXVSS]/[PXTSS]', 'cmfv');
      if (Math.abs(p.ct_VR - fvME) > 0.05) ctW.push(`MLVSS/MLSS nhập ${fx(p.ct_VR)} khác giá trị suy từ bùn sinh ra ${fx(fvME)} – F/M theo MLVSS và V_F/M lệch tương ứng; đặt ct_VR ≈ ${fx(fvME)}`);
      so.chk('MLVSS/MLSS nhập khớp bùn sinh ra M&E (± 0,05)', Math.abs(p.ct_VR - fvME) <= 0.05, 'ĐẠT', `LỆCH – đặt ct_VR ≈ ${fx(fvME)}`, 'M&E PT (8-21)', true, `ABS([cVR]-[cmfv])<=0.05`);
      // 5. nhu cầu oxy
      so.o('AOTR/R₀', 'Tỷ số nhu cầu oxy SFC / M&E (T_max)', AOTR / Ro, '-', 'SFC: 1,2 kg O₂/kg BOD, N đồng hóa 5 %·ΔBOD, SND 75 %', 'M&E PT (8-23)', '[cAOTR]/[cRo]', 'cmOr');
      so.t2('Tín dụng khử nitrat đồng thời SND', fx(p.ct_eDN * 100, 0) + ' % (SFC) – M&E chỉ tính phần khử nitrat có thời gian thiếu khí (mục I)', '', 'M&E VD 8-7 bước 9');
      if (AOTR < Ro * 0.95) ctW.push(`nhu cầu oxy theo SFC ${fx(AOTR, 0)} kg/ngđ thấp hơn M&E ${fx(Ro, 0)} kg/ngđ – cấp khí đã lấy max; giảm ct_eDN hoặc tăng ct_kO để phần SFC khớp`);
      so.chk('Nhu cầu oxy SFC ≥ 95 % R₀ M&E', AOTR >= Ro * 0.95, 'ĐẠT', 'LỆCH – SFC thiếu oxy; máy thổi đã chọn theo R₀ M&E', 'M&E PT (8-23)', true, '[cAOTR]>=[cRo]*0.95');
      // 6. bio-P nhờ selector
      const rbP = TPi > 0 ? K.rbCOD / TPi : 99;
      so.o('rbCOD/TP', 'Tỷ số rbCOD/TP vào', rbP, 'g/g', 'Khử P sinh học cần ≥ 18 (Bảng 8-30)', 'M&E Bảng 8-30', 'IF([cTP]>0,[rbCOD]/[cTP],99)', 'cmrbP');
      const bioPok = Pcr <= 1e-9 || rbP >= 18;
      if (Pcr > 1e-9) ctW.push(rbP >= 18 ? `tín dụng bio-P ${fx(Pcr)} mg/L của SFC chưa được M&E xác nhận (selector chỉ thiếu khí/kỵ khí ngắn) – cần SFC bảo đảm; đặt ct_fP = 0 để tính thiên an toàn` : `tín dụng bio-P ${fx(Pcr)} mg/L nhưng rbCOD/TP = ${fx(rbP)} < 18 – M&E không đủ điều kiện khử P sinh học; đặt ct_fP = 0`);
      so.chk('Tín dụng bio-P chỉ dùng khi rbCOD/TP ≥ 18', bioPok, 'ĐẠT', 'LỆCH – đặt ct_fP về 0 (khử P bằng hóa chất)', 'M&E Bảng 8-30', false, Pcr > 1e-9 ? '[cmrbP]>=18' : 'TRUE');
      // 7. selector: khử nitrat theo dòng bùn tuần hoàn (mục I), tải trọng ngăn đầu (mục D)
      so.o('F/M_sel,1', 'Tải trọng F/M ngăn đầu selector (mục D – MLSS selector = R/(1+R)·10⁶/SVI)', FMs1, 'kgBOD/kgMLSS·d', 'F/M_sel·n_sel', 'M&E 5th mục 8-4', '[cFMs1]', 'cmFMs');
      so.t2('Khử nitrat trong selector', 'Có tính: NO₃ theo dòng bùn tuần hoàn Q_RAS·C_e, giới hạn bởi rbCOD nước vào (mục I)', '', 'M&E 5th mục 8-4, 8-7');
      // 8. tỷ lệ gạn so với Hình 8-21
      so.chk('Tỷ lệ gạn ΔH/TWL ≤ 0,30 (thường dùng, M&E Hình 8-21)', dHe / TWL <= 0.3 + 1e-9, 'ĐẠT', `LỆCH – ΔH/TWL ${fx(dHe / TWL, 3)}; đặt phân suất gạn tối đa ct_rDmax 0,30 (giữ TWL, tăng diện tích)`, 'M&E 5th tr.774', true, '[crD]<=0.300000001');
      if (dHe / TWL > 0.3 + 1e-9) ctW.push(`tỷ lệ gạn ${fx(dHe / TWL, 3)} > 0,30 (SFC định diện tích theo ΔH ${fx(dH)} m) – M&E Bảng 8-17 thường ≤ 0,25 – 0,30; đặt ct_rDmax 0,30 để giữ TWL và tăng diện tích bể`);
      so.t2('Kết luận', ctW.length ? `${ctW.length} điểm lệch so với M&E 5th (xem cảnh báo)` : 'Thiết kế C-Tech khớp các tiêu chí M&E 5th', '', 'M&E 5th');
      for (const w of ctW) warn('C-Tech so với M&E 5th: ' + w + '.');
      R.ctMe = ctW;

      /* --- Q: Bước 10 – kiểm tra T_max & chế độ xả bùn theo mùa (cùng cách ICEAS) --- */
      {
        const sq = u.sec('Q. Kiểm tra T_max & chế độ xả bùn theo mùa');
        const fAq = TFA / TC, Tx = +I.Tmax;
        const muX = p.muAOB * Math.pow(1.072, Tx - 20) * (NH4e / (NH4e + p.KNH4)) * (p.DO / (p.DO + p.KOA)) - p.bAOB * Math.pow(1.029, Tx - 20);
        const SRTax = sq.o('SRT_yc,hk(T_max)', 'SRT hiếu khí yêu cầu ở T_max', p.SF / muX, 'ngày', 'SF/μ_AOB(T_max)', 'M&E PT (7-94), (7-98)', `[SF]/([muA]*1.072^([info.Tmax]-20)*([Ne]/([Ne]+[KNH4]))*([DO]/([DO]+[KOA]))-[bA]*1.029^([info.Tmax]-20))`, 'cSRTax');
        sq.chk('SRT hiếu khí ở T_max ≥ yêu cầu', srtM * fAq >= SRTax - 1e-9, 'ĐẠT', 'KHÔNG ĐẠT', 'M&E Bảng 8-15', false, '[cSRTa]>=[cSRTax]-0.000000001');
        const SRTw = Math.min(srtM, Math.max(SRTax / fAq, 10));
        const PXw = bioAtT(SRTw, kinX.bH, kinX.muH, kinX.bA).PXTSS, PXk = bioAtT(srtM, kinX.bH, kinX.muH, kinX.bA).PXTSS;
        sq.o('SRT_mùa nóng', 'SRT tối thiểu mùa nóng (≥ 10 ngày, ≤ SRT thiết kế)', SRTw, 'ngày', 'min(SRT; max(SRT_yc,hk(T_max)/f_sục; 10))', 'M&E Bảng 8-19', `MIN([SRT],MAX([cSRTax]/[cfA],10))`, 'cSRTw');
        const Vc = sq.o('V_SAS,lạnh', 'Bùn xả mùa lạnh (giữ SRT thiết kế)', K.PXTSS / (p.ct_Cs * 1.05 * 1000), 'm³/ngđ', 'P_X,TSS(T_min)/(C_SAS·1,05·1000)', 'BEP SFC', '[PXTSS]/([cCs]*1.05*1000)', 'cVwc');
        sq.o('V_SAS,nóng', 'Bùn xả mùa nóng – giữ SRT thiết kế', PXk / (p.ct_Cs * 1.05 * 1000), 'm³/ngđ', 'P_X,TSS(T_max; SRT) – giải trong phần mềm', 'M&E PT (8-20), (8-21)', null, 'cVwk');
        sq.o('V_SAS,nóng,min', 'Bùn xả mùa nóng – SRT tối thiểu', PXw / (p.ct_Cs * 1.05 * 1000), 'm³/ngđ', 'P_X,TSS(T_max; SRT_mùa nóng) – giải trong phần mềm', 'M&E PT (8-20), (8-21)', null, 'cVww');
        sq.o('MLSS_nóng,min', 'MLSS mùa nóng ở SRT tối thiểu', PXw * SRTw * 1000 / Vtot, 'mg/L', 'P_X,TSS·SRT/V', '', null, 'cMLw');
        sq.note(`Mùa lạnh (${fx(T)} °C) giữ SRT ${fx(srtM)} ngày; mùa nóng (${fx(Tx)} °C) có thể giảm dần SRT tới ${fx(SRTw)} ngày (tăng xả bùn trong vài tuần, theo dõi NH₄ ra) để giảm MLSS và điện thổi khí; chuyển lại trước mùa lạnh.`);
      }
      fAer = TFA / TC;
      bioRes.NO3e = NO3e; bioRes.NO3den = NO3den; bioRes.TPe = TPe;
      bioRes.sludge = PX + carbon.sl; bioRes.sludgeX = '[bio.cPX]' + (carbon.sl ? '+[bio.Xext]' : '');
      bioRes.VtotX = '[bio.cVtot]'; bioRes.AX = '[bio.cA1]*[bio.cN]';
      bioRes.Vtot = Vtot; bioRes.A = A1 * N;
      // hình học: trục bể dọc theo hướng dòng (B) – selector ở đầu cấp nước chạy hết chiều dài L
      ub.geom = { type: 'rect', L: Bc, B: Lc, H: TWL + p.ct_fb, fb: p.ct_fb, n: N, zones: [{ name: 'SELECTOR', len: Wsel }, { name: 'PHẢN ỨNG C-TECH', len: Bc - Wsel }], label: 'C-TECH', batch: true, TWL, BWL, decanter: Math.max(Lc - 2, Lc * 0.8), selN: Math.max(1, Math.round(p.ct_nsel)) };
      ub.dims = `${N} bể × (${fx(Lc)} × ${fx(Bc)} × H ${fx(TWL + p.ct_fb)} m), TWL ${fx(TWL)} m; selector ${fx(Wsel)} m nằm trong bể`;
      ub.hrt = `${fx(HRT)} h`; ub.n = N; ub.H = TWL; ub.batch = { TWL, BWL, TC, cyc: ncy, TA };
      ub.ct = { N, L: Lc, B: Bc, TWL, BWL, dH, Wsel, Vsel, nsel: p.ct_nsel, TFA, TS, TD, TC, ncy, TA, nF, nDs, QR, QS, Qd1, Qbl, nRun, nSt: p.ct_Pst, Pw: Pw1, Eb, nd, SRT: srtM, SRTs, MLSS, FM: FMa, HRT, Airh };
      u.airP = Pw1 * nRun; u.airH = 24 * p.air_LF; u.nBlower = nRun + p.ct_Pst; u.airQ = Qbl * nRun / 60; u.airRow = u.ids.cPw;
      R.equip.push({ u: u.name, name: 'Cửa phai tự động cấp nước vào bể', spec: 'Auto gate', qty: N, qtyX: '{{ref:bio.cN}}', note: '' });
      R.equip.push({ u: 'Nhà máy thổi khí', name: 'Máy thổi khí C-Tech', spec: `${fx(Qbl)} Nm³/h @ ${fx((p2 - patm) / 98.0665)} kg/cm²; ${fx(ceilTo(Pw1 / 0.95 * 1.15, 0.5))} kW`, qty: nRun + p.ct_Pst, qtyX: '{{ref:bio.cnRun}}+{{ref:bio.cnSt}}', note: `${nRun} + ${p.ct_Pst} dự phòng; ½ số máy chạy có biến tần` });
      R.equip.push({ u: u.name, name: 'Đĩa phân phối khí bọt mịn (màng PU)', spec: `SOTE ${fx(p.air_SOTE * 100)} %; ${p.air_qd} Nm³/h·đĩa`, qty: nd * N, qtyX: '{{ref:bio.cnd}}*{{ref:bio.cN}}', note: '', spare: 'diffuser' });
      R.equip.push({ u: u.name, name: 'Decanter kèm bộ định vị & truyền động (biến tần)', spec: `${fx(Qd1 / p.ct_ndec, 0)} m³/h; hành trình ${fx(dH)} m; 2,2 kW`, qty: N * p.ct_ndec, qtyX: '{{ref:bio.cN}}*{{ref:bio.cndec}}', note: 'Inox', spare: 'decanter' });
      R.equip.push({ u: u.name, name: 'Bơm RAS (selector)', spec: `${fx(QR)} m³/h × 5 m; ${fx(ceilTo(9.81 * QR / 3600 * 5 / 0.6 * 1.2, 0.5))} kW`, qty: N + Math.ceil(N / 2), note: `${N} + ${Math.ceil(N / 2)} dự phòng kho` });
      R.equip.push({ u: u.name, name: 'Bơm SAS (bùn dư)', spec: `${fx(QS)} m³/h × 10 m; ${fx(ceilTo(9.81 * QS / 3600 * 10 / 0.6 * 1.2, 0.5))} kW`, qty: N + Math.ceil(N / 2), note: 'Cột áp theo vị trí hố bùn' });
      R.equip.push({ u: u.name, name: 'Van bướm tự động ống khí chính & ống khí selector', spec: 'Auto butterfly', qty: 2 * N, note: '' });
      R.equip.push({ u: u.name, name: 'Van bi ống khí xuống selector', spec: 'Manual ball', qty: N * p.ct_nsel, note: '' });
      R.equip.push({ u: u.name, name: 'Van dao điện xả bùn SAS', spec: 'Motorised knife gate', qty: N, note: '' });
      R.equip.push({ u: u.name, name: 'Đầu đo DO quang học & đầu đo mức thủy tĩnh', spec: 'Điều khiển OUR/DO', qty: 2 * N, note: '' });
      R.equip.push({ u: u.name, name: 'PLC & tủ điều khiển C-Tech', spec: 'Điều khiển chu kỳ, OUR', qty: 1, note: '' });
      K.bioOut = { NO3: '[NO3e_c]', TP: '[TPbio]', Alk: '[Alkout]' };
      if (nF !== Math.round(nF)) warn('C-Tech: số bể nhận nước đồng thời N·t_FA/T_C không nguyên – lịch luân phiên không khép kín.');
    } else if (bio === 'KMBR') {
      /* ======== MBR Kubota – màng tấm phẳng (Kubota Submerged Membrane Unit) – trình tự Kubota Design Guidebook KE-04-001-3 (2007)
         và Preliminary Study (PVFC – EK400, 2016; SEA180903 – FS200, 2018); kiểm tra theo M&E 5th (PT 8-20, 8-21, 8-23, 8-61) ======== */
      const u = ub, KB = DATA.KUBOTA;
      const sa = u.sec('A. Lưu lượng & tải lượng vào cụm MBR — Kubota Preliminary Study mục 2');
      const Qd = sa.o('Q', 'Lưu lượng trung bình ngày', Q, 'm³/ngđ', 'Kubota: lưu lượng ổn định qua bể điều hòa', 'Đầu bài', '[info.Q]', 'kQ');
      const kd = sa.i('k_ngày', 'Hệ số lưu lượng ngày lớn nhất / trung bình', p.kb_kd, '-', 'Có điều hòa: theo lưu lượng bơm; không điều hòa: Q_max = 2,5(Q − 100) + 300', 'Kubota Guidebook 1-2', 'kkd');
      const Qmx = sa.o('Q_max', 'Lưu lượng ngày lớn nhất vào bể màng', Qd * kd, 'm³/ngđ', 'Q·k_ngày', 'Kubota Guidebook 1-2', '[kQ]*[kkd]', 'kQmx');
      const BODi = sa.o('BOD₅', 'BOD₅ vào (cột ④)', st4.BOD, 'mg/L', '', '', '[bal.BOD4]', 'kBOD');
      const TNi = sa.o('T-N', 'Tổng nitơ vào', st4.TN, 'mg/L', '', '', '[bal.TN4]', 'kTN');
      sa.o('T-P', 'Tổng photpho vào', st4.TP, 'mg/L', '', '', '[bal.TP4]', 'kTP');
      const OGi = sa.o('FOG', 'Dầu mỡ vào', st4.OG, 'mg/L', 'FOG > 15 % BOD cần tiền xử lý tách dầu', 'Kubota PS 2018', '[bal.OG4]', 'kOG');
      sa.chk('Dầu mỡ ≤ 15 % BOD (không cần tách dầu riêng trước MBR)', OGi <= 0.15 * BODi, 'ĐẠT', 'CẦN TÁCH DẦU trước MBR', 'Kubota PS 2018', true, '[kOG]<=0.15*[kBOD]');
      const LBOD = sa.o('L_BOD', 'Tải lượng BOD', Qd * BODi / 1000, 'kg/ngđ', 'Q·BOD/1000', 'Kubota PS 7.1.2', '[kQ]*[kBOD]/1000', 'kLBOD');
      const LN = sa.o('L_TN', 'Tải lượng T-N', Qd * TNi / 1000, 'kg N/ngđ', 'Q·T-N/1000', 'Kubota PS 7.1.2', '[kQ]*[kTN]/1000', 'kLN');

      /* --- B: màng & SMU --- */
      const sb = u.sec('B. Màng lọc & cụm SMU — Kubota Design Guidebook 1-2, 1-3; Preliminary Study mục 4.1');
      const Nreq0 = Math.max(Q / (0.8 * p.kb_F), Q * p.kb_kd / (0.8 * p.kb_Fmax));
      const auto = !c.kbModel || c.kbModel === 'auto' || !KB[c.kbModel];
      const mk = !auto ? c.kbModel : (p.kb_H >= 4.0 && Nreq0 > 800 ? 'EK400' : ['ES200', 'ES150', 'ES125', 'ES100', 'ES75'].find(m => Math.ceil(Nreq0 / KB[m].n) >= p.kb_nT) || 'ES75');
      const M = KB[mk];
      sb.t2('Model SMU', `${mk} – ${M.n} tấm × ${fx(M.S)} m², ${M.deck > 1 ? '2 tầng' : '1 tầng'}`, auto ? 'Tự chọn: EK400 khi bể sâu ≥ 4 m và > 800 tấm; ngược lại ES lớn nhất cho ≥ 1 SMU/bể' : 'Chọn ở tab 3', M.src ? 'Kubota ' + M.src : 'Kubota Guidebook Bảng 1-3');
      const S = sb.i('S', 'Diện tích màng hiệu dụng mỗi tấm', M.S, 'm²/tấm', 'Tấm loại 510: 490 × 1.000 mm; CPE, lỗ danh định 0,4 µm', 'Kubota Guidebook Bảng 1-2', 'kS');
      const F = sb.i('F', 'Thông lượng thiết kế trung bình', p.kb_F, 'm³/m²·ngđ', 'Sinh hoạt 0,6; công nghiệp 0,4 (pilot)', 'Kubota Guidebook 2-4', 'kF');
      const Fmx = sb.i('F_max', 'Thông lượng tối đa', p.kb_Fmax, 'm³/m²·ngđ', '', 'Kubota Guidebook 1-2', 'kFmx');
      const N1 = sb.o('N₁', 'Số tấm theo lưu lượng trung bình', Q / (S * F), 'tấm', 'N = Q/(S·F)', 'Kubota Guidebook 1-2', '[kQ]/([kS]*[kF])', 'kN1');
      const N2 = sb.o('N₂', 'Số tấm theo lưu lượng ngày lớn nhất', Qmx / (S * Fmx), 'tấm', 'N = Q_max/(S·F_max)', 'Kubota Guidebook 1-2', '[kQmx]/([kS]*[kFmx])', 'kN2');
      const Nr = sb.o('N_yc', 'Số tấm màng yêu cầu', Math.max(N1, N2), 'tấm', 'max(N₁; N₂)', '', 'MAX([kN1],[kN2])', 'kNr');
      const nT = sb.i('n_bể', 'Số bể màng (dây chuyền)', p.kb_nT, 'bể', 'Mỗi bể cùng model & số SMU', 'Kubota Guidebook 1-4 ①', 'knT');
      const np = sb.i('n_tấm', 'Số tấm mỗi SMU ' + mk, M.n, 'tấm/SMU', M.deck > 1 ? '2 tầng (trên : dưới = 5,5 : 4,5 lưu lượng)' : '1 tầng', 'Kubota Guidebook Bảng 1-3', 'knp');
      const nUt = sb.o('n_SMU/bể', 'Số SMU mỗi bể', Math.ceil(Nr / (np * nT) - 1e-9), 'SMU', 'ROUNDUP(N_yc/(n_tấm·n_bể))', '', 'ROUNDUP([kNr]/([knp]*[knT]),0)', 'knU');
      const nU = sb.o('n_SMU', 'Tổng số SMU', nUt * nT, 'SMU', 'n_SMU/bể·n_bể', '', '[knU]*[knT]', 'knUt');
      const Nc = sb.o('N', 'Tổng số tấm màng lắp đặt', nU * np, 'tấm', 'n_SMU·n_tấm', '', '[knUt]*[knp]', 'kN');
      const Am = sb.o('A_màng', 'Tổng diện tích màng', Nc * S, 'm²', 'N·S', '', '[kN]*[kS]', 'kAm');
      const Fa = sb.o('F_TB', 'Thông lượng thực tế ở lưu lượng trung bình', Q / Am, 'm³/m²·ngđ', 'Q/A', '', '[kQ]/[kAm]', 'kFa');
      sb.o('J_TB', 'Thông lượng trung bình quy đổi', Fa * 1000 / 24, 'L/m²·h', 'F·1000/24', '', '[kFa]*1000/24', 'kJ');
      const Fpk = sb.o('F_đỉnh', 'Thông lượng ở lưu lượng ngày lớn nhất', Qmx / Am, 'm³/m²·ngđ', 'Q_max/A', '', '[kQmx]/[kAm]', 'kFpk');
      sb.chk('F_TB ≤ F thiết kế và F ở Q_max ≤ F_max', Fa <= F * 1.0001 && Fpk <= Fmx * 1.0001, 'ĐẠT', 'VƯỢT THÔNG LƯỢNG – tăng số SMU', 'Kubota Guidebook 1-2', false, 'AND([kFa]<=[kF]*1.0001,[kFpk]<=[kFmx]*1.0001)');
      sb.o("k′", 'Hệ số điều hòa lưu lượng k′ = N·S·F/Q', Nc * S * F / Q, '-', 'K = min(k′; 1,5) dùng tính bể điều hòa V = (Q/T − K·Q/24)·T', 'Kubota Guidebook 2-3', '[kN]*[kS]*[kF]/[kQ]', 'kkp');
      sb.t2('Chế độ lọc', 'Hút 9 phút – nghỉ 1 phút; khí rửa màng liên tục; TMP ≤ 20 kPa (vận hành ≤ 10 kPa); có thể lọc trọng lực/xi-phông', '', 'Kubota PS 2018 mục 1.3');
      // khí rửa màng: nếu không có bể tiền sục khí và thiếu O₂, tăng tới mức tối đa (Bảng 1-3) trước khi phải bố trí bể tiền sục khí
      const q0 = p.kb_qa > 0 ? p.kb_qa : M.qa;

      /* --- C: bể màng --- */
      const sc = u.sec('C. Bể màng (bể nitrat hóa) — Kubota Guidebook 1-4 ②③, Bảng 1-4');
      const Hu = sc.i('H_SMU', 'Chiều cao SMU (vỏ màng + vỏ đĩa khí)', M.H, 'm', '', 'Kubota Guidebook Bảng 1-3', 'kHu');
      sc.i('H_chọn', 'Chiều sâu nước chọn', p.kb_H, 'm', '', '', 'kHc');
      const Hm = sc.o('H', 'Chiều sâu nước các bể', Math.max(p.kb_H, Hu + 0.5), 'm', 'max(H_chọn; H_SMU + 0,5)', 'Guidebook 1-4 ③: ngập ≥ 500 mm trên SMU', 'MAX([kHc],[kHu]+0.5)', 'kH');
      sc.i('B_min', 'Chiều rộng bể màng tối thiểu', M.Bmin, 'm', '', 'Kubota Guidebook Bảng 1-4', 'kBmin');
      const Bm = sc.o('B', 'Chiều rộng bể màng', ceilTo(M.Bmin, 0.5), 'm', 'làm tròn lên 0,5 m', '', 'CEILING([kBmin],0.5)', 'kB');
      sc.i('a', 'Bước lắp SMU dọc bể', M.pitch, 'm/SMU', 'Guidebook: C = (1,0 – 1,3)·n + 0,3', 'Kubota Guidebook Bảng 1-4', 'kpit');
      sc.i('a₀', 'Khoảng hở đầu bể', M.add, 'm', '', 'Kubota Guidebook Bảng 1-4', 'kadd');
      const Lm = sc.o('L', 'Chiều dài 1 bể màng', ceilTo(M.pitch * nUt + M.add, 0.5), 'm', 'a·n_SMU/bể + a₀, làm tròn 0,5 m', '', 'CEILING([kpit]*[knU]+[kadd],0.5)', 'kL');
      const Vm = sc.o('V_màng', 'Thể tích bể màng', Lm * Bm * Hm * nT, 'm³', 'L·B·H·n_bể', 'Kubota PS 7.1.2', '[kL]*[kB]*[kH]*[knT]', 'kVm');
      const X = sc.i('MLSS', 'MLSS bể màng', p.kb_MLSS, 'mg/L', 'PS: 10.000 – 15.000; tối đa 20.000', 'Kubota', 'kX');
      sc.chk('MLSS bể màng 8.000 – 20.000 mg/L', X >= 8000 && X <= 20000, 'ĐẠT', 'NGOÀI KHOẢNG KUBOTA', 'Kubota Guidebook 2-4', true, 'AND([kX]>=8000,[kX]<=20000)');

      /* --- D: tải N, bể thiếu khí, bể tiền sục khí --- */
      const sd = u.sec('D. Tải lượng nitơ, bể thiếu khí & bể tiền sục khí — Kubota PS 7.1.2; Guidebook 4-3, Bảng 4-3');
      const ys = sd.i('y_s', 'Tỷ lệ bùn dư theo BOD vào', p.kb_ys, 'kg SS/kg BOD', '0,40 – 0,50', 'Kubota PS', 'kys');
      const Xs = sd.o('X_dư', 'Bùn dư (cách Kubota, đối chiếu)', ys * LBOD, 'kg SS/ngđ', 'y_s·L_BOD', 'Kubota PS', '[kys]*[kLBOD]', 'kXs');
      sd.i('f_N', 'Hàm lượng N trong bùn dư', p.kb_fN, 'kg N/kg SS', '6 – 7,5 %', 'Kubota PS', 'kfN');
      const NinX = sd.o('N_bùn', 'N theo bùn dư', Xs * p.kb_fN, 'kg N/ngđ', 'X_dư·f_N', 'Kubota PS', '[kXs]*[kfN]', 'kNs');
      const Nnit = sd.o('N_nit', 'Tải N cần nitrat hóa', Math.max(0, LN - NinX), 'kg N/ngđ', 'L_TN − N_bùn', 'Kubota PS', 'MAX(0,[kLN]-[kNs])', 'kNn');
      // NO₃-N cho phép theo giới hạn TN (Kubota chọn r theo hiệu suất khử N cần thiết η = r/(r + 1), Guidebook 4-3)
      const NO3al = sd.i('NO₃_cp', 'NO₃-N ra cho phép (theo giới hạn TN)', L.TN !== undefined ? Math.max(2, 0.9 * L.TN - TKNe_est) : L.NO3 !== undefined ? 0.8 * L.NO3 : p.NO3e_des, 'mg/L', L.TN !== undefined ? `max(2; 0,9·TN_gh − TKN_e ước tính ${fx(TKNe_est)})` : 'Không giới hạn TN: NO₃ thiết kế', 'Kubota Guidebook 4-3', 'kNO3a');
      const eta = Nnit > 0 ? Math.max(0, 1 - NO3al * Q / 1000 / Nnit) : 0;
      const rreq = sd.o('r_yc', 'Tỷ lệ tuần hoàn theo hiệu suất khử N yêu cầu', eta / Math.max(1e-6, 1 - eta), '× Q', 'η/(1 − η), η = 1 − NO₃_cp·Q/N_nit', 'Kubota Guidebook 4-3', 'MAX(0,1-[kNO3a]*[kQ]/1000/[kNn])/MAX(0.000001,MIN(1,[kNO3a]*[kQ]/1000/[kNn]))', 'krr');
      sd.i('r_min', 'Tỷ lệ tuần hoàn tối thiểu', p.kb_r, '× Q', 'Kubota 3 – 4', 'Kubota PS', 'krmin');
      const r = sd.o('r', 'Tỷ lệ tuần hoàn bể màng → thiếu khí áp dụng', Math.min(6, Math.max(p.kb_r, rreq)), '× Q', 'min(6; max(r_min; r_yc))', 'Kubota Guidebook 4-3', 'MIN(6,MAX([krmin],[krr]))', 'kr');
      const Ndn = sd.o('N_dn', 'Tải N khử nitrat', Nnit * r / (r + 1), 'kg N/ngđ', 'N_nit·r/(r + 1)', 'Kubota PS 7.1.2', '[kNn]*[kr]/([kr]+1)', 'kNd');
      const rateDN = DATA.interp(DATA.KUBOTA_RATE, T, 1) * p.kb_kN, rateN = DATA.interp(DATA.KUBOTA_RATE, T, 3) * p.kb_kN;
      const kDN = sd.i('k_DN', 'Tốc độ khử nitrat ở T', rateDN, 'kg N/kg SS·d', `Nội suy Bảng 4-3 theo T = ${fx(T)} °C (× ${fx(p.kb_kN)})`, 'Kubota Guidebook Bảng 4-3', 'kkDN');
      const kN = sd.i('k_N', 'Tốc độ nitrat hóa ở T', rateN, 'kg N/kg SS·d', `Nội suy Bảng 4-3 theo T = ${fx(T)} °C (× ${fx(p.kb_kN)})`, 'Kubota Guidebook Bảng 4-3', 'kkN');
      const Xan = sd.o('MLSS_tk', 'MLSS bể thiếu khí & tiền sục khí', X * r / (r + 1), 'mg/L', 'MLSS·r/(r + 1)', 'Kubota Guidebook Bảng 4-4', '[kX]*[kr]/([kr]+1)', 'kXa');
      const Vanr = sd.o('V_tk,yc', 'Thể tích bể thiếu khí yêu cầu', Ndn / (kDN * Xan / 1000), 'm³', 'N_dn/(k_DN·MLSS_tk)', 'Kubota PS 7.1.2', '[kNd]/([kkDN]*[kXa]/1000)', 'kVanr');
      const BODa = sd.o('L_BOD,hk', 'BOD còn lại cho vùng hiếu khí', Math.max(0, LBOD - 2.8 * Ndn), 'kg/ngđ', 'L_BOD − 2,8·N_dn', 'Kubota PS (2,8 kg BOD/kg N)', 'MAX(0,[kLBOD]-2.8*[kNd])', 'kBa');
      const kB = sd.i('k_BOD', 'Tốc độ khử BOD theo MLSS (20 °C)', p.kb_rBOD, 'kg BOD/kg SS·d', '', 'Kubota PS', 'kkB');
      const capB = sd.o('C_BOD,màng', 'Năng lực khử BOD của bể màng', kB * X / 1000 * Vm, 'kg/ngđ', 'k_BOD·MLSS·V_màng', 'Kubota PS', '[kkB]*[kX]/1000*[kVm]', 'kcB');
      const capN = sd.o('C_N,màng', 'Năng lực nitrat hóa của bể màng', kN * X / 1000 * Vm, 'kg N/ngđ', 'k_N·MLSS·V_màng', 'Kubota PS', '[kkN]*[kX]/1000*[kVm]', 'kcN');
      const VpB = sd.o('V_tsk,BOD', 'Thể tích tiền sục khí theo BOD', Math.max(0, BODa - capB) / (kB * Xan / 1000), 'm³', 'max(0; L_BOD,hk − C_BOD)/(k_BOD·MLSS_tk)', 'Kubota PS', 'MAX(0,[kBa]-[kcB])/([kkB]*[kXa]/1000)', 'kVpB');
      const VpN = sd.o('V_tsk,N', 'Thể tích tiền sục khí theo nitrat hóa', Math.max(0, Nnit - capN) / (kN * Xan / 1000), 'm³', 'max(0; N_nit − C_N)/(k_N·MLSS_tk)', 'Kubota PS', 'MAX(0,[kNn]-[kcN])/([kkN]*[kXa]/1000)', 'kVpN');
      const Vp0 = sd.o('V_tsk,0', 'Thể tích tiền sục khí theo động học', Math.max(VpB, VpN), 'm³', 'max(V_tsk,BOD; V_tsk,N)', '', 'MAX([kVpB],[kVpN])', 'kVp0');

      /* --- E: nhu cầu oxy & cấp khí --- */
      const se = u.sec('E. Nhu cầu oxy & cấp khí — Kubota PS 7.2; Guidebook 1-7, Bảng 1-8, 1-9');
      se.note('Kubota không cho đặt thêm đĩa khí trong bể màng ngoài đĩa của SMU (Guidebook 4-2 b): phần oxy thiếu cấp bằng đĩa bọt mịn ở bể tiền sục khí.');
      const aO = se.i('a', 'Hệ số O₂ khử BOD', p.kb_aO, 'kg O₂/kg BOD', '', 'Kubota PS', 'kaO');
      const O2B = se.o('O₂_BOD', 'O₂ cho khử BOD', aO * LBOD, 'kg O₂/ngđ', 'a·L_BOD', 'Kubota PS 7.2.4', '[kaO]*[kLBOD]', 'kO2B');
      const O2N = se.o('O₂_N', 'O₂ cho nitrat hóa', 64 / 14 * Nnit, 'kg O₂/ngđ', '64/14·N_nit', 'Kubota PS 7.2.4', '64/14*[kNn]', 'kO2N');
      const cE = se.i('c', 'Hệ số hô hấp nội bào', p.kb_cEnd, 'g O₂/g VSS·d', '', 'Kubota PS', 'kc');
      const vr = se.i('MLVSS/MLSS', 'Tỷ lệ MLVSS/MLSS', p.kb_vss, '-', '', 'Kubota PS', 'kvss');
      const OTE = se.i('OTE_màng', 'Hiệu suất truyền oxy nước sạch của khí rửa màng (độ sâu H)', DATA.interp(DATA.KUBOTA_OTE, Hm - 0.2) / 100, '-', `Bảng 1-8 nội suy theo độ ngập đĩa ≈ H − 0,2 = ${fx(Hm - 0.2)} m`, 'Kubota Guidebook Bảng 1-8', 'kOTE');
      const alM = se.i('α_màng', 'Hệ số α theo nồng độ bùn', DATA.interp(DATA.KUBOTA_ALPHA, X / 10000), '-', `Bảng 1-9 nội suy theo MLSS = ${fx(X / 10000, 2)} %`, 'Kubota Guidebook Bảng 1-9', 'kalM');
      const SFo = se.i('SF', 'Hệ số an toàn', p.kb_SFo, '-', '', 'Kubota PS 2016', 'kSF');
      const O2mOf = q => Nc * q / 1000 * 1440 * 0.277 * OTE * alM * SFo;
      const endo = vp => cE * vr * (X * Vm + Xan * vp) / 1000;
      let qa = q0, VpO = 0;
      if (Vp0 <= 1e-9) {
        const need0 = O2B + O2N + endo(0);
        if (O2mOf(q0) < need0) {
          qa = Math.min(M.qmax, q0 * need0 / O2mOf(q0));
          if (O2mOf(qa) < need0 - 1e-6) VpO = Math.max(0, (need0 - O2mOf(qa)) / (p.kb_OURmax - cE * vr * Xan / 1000));
        }
      }
      const qaR = se.i('q_khí', 'Khí rửa màng mỗi tấm', qa, 'L/phút·tấm', qa > q0 + 1e-9 ? `Tăng từ ${fx(q0)} để cấp đủ O₂ (không có bể tiền sục khí); tối đa ${M.qmax}` : `Tối thiểu ${M.qa}; tối đa ${M.qmax}`, 'Kubota Guidebook Bảng 1-3', 'kqa');
      se.chk('Khí rửa màng trong giới hạn Kubota', qaR >= M.qa - 1e-9 && qaR <= M.qmax + 1e-9, 'ĐẠT', 'NGOÀI GIỚI HẠN – hỏng màng/tắc màng', 'Kubota Guidebook Bảng 1-3', false, `AND([kqa]>=${M.qa}-0.000000001,[kqa]<=${M.qmax}+0.000000001)`);
      const Amem = se.o('Q_khí,màng', 'Lưu lượng khí rửa màng', Nc * qaR / 1000, 'Nm³/phút', 'N·q/1000', 'Kubota Guidebook 1-7', '[kN]*[kqa]/1000', 'kAirM');
      se.o('SADm', 'Khí rửa màng riêng', Amem * 60 / Am, 'Nm³/m²·h', '', 'M&E mục 8-9', '[kAirM]*60/[kAm]', 'kSAD');
      se.o('SADp', 'Khí rửa màng trên 1 m³ nước lọc', Amem * 1440 / Q, 'Nm³/m³', '', '', '[kAirM]*1440/[kQ]', 'kSADp');
      const O2m = se.o('O₂_màng', 'O₂ cấp từ khí rửa màng', O2mOf(qaR), 'kg O₂/ngđ', 'Q_khí·1440·0,277·OTE·α·SF', 'Kubota PS 7.2.4', '[kAirM]*1440*0.277*[kOTE]*[kalM]*[kSF]', 'kO2m');
      se.i('OUR_max', 'Tải oxy tối đa bể tiền sục khí', p.kb_OURmax, 'kg O₂/m³·ngđ', 'Giả thiết', '', 'kOUR');
      const Vpr = se.o('V_tsk,yc', 'Thể tích bể tiền sục khí yêu cầu', Math.max(Vp0, VpO), 'm³', 'max(V_tsk,0; (O₂ thiếu)/(OUR_max − c·VSS·MLSS_tk)) khi không cần theo động học', '', `MAX([kVp0],IF([kVp0]>0,0,MAX(0,([kO2B]+[kO2N]+[kc]*[kvss]*[kX]*[kVm]/1000-[kO2m])/([kOUR]-[kc]*[kvss]*[kXa]/1000))))`, 'kVpr');
      const O2E = se.o('O₂_nb', 'O₂ cho hô hấp nội bào', endo(Vpr), 'kg O₂/ngđ', 'c·VSS·(MLSS·V_màng + MLSS_tk·V_tsk)', 'Kubota PS 7.2.4', '[kc]*[kvss]*([kX]*[kVm]+[kXa]*[kVpr])/1000', 'kO2E');
      const O2K = se.o('O₂_tổng', 'Tổng nhu cầu oxy (Kubota)', O2B + O2N + O2E, 'kg O₂/ngđ', 'O₂_BOD + O₂_N + O₂_nb', 'Kubota PS 7.2.1', '[kO2B]+[kO2N]+[kO2E]', 'kO2K');
      const O2f = se.o('O₂_đĩa', 'O₂ cần cấp bằng đĩa bọt mịn (bể tiền sục khí)', Math.max(0, O2K - O2m), 'kg O₂/ngđ', 'max(0; O₂_tổng − O₂_màng)', 'Kubota PS 7.2.2', 'MAX(0,[kO2K]-[kO2m])', 'kO2f');
      se.i('OTE_đĩa', 'Hiệu suất truyền oxy hiệu dụng đĩa bọt mịn', p.kb_OTEfb, '-', 'PS 2016: 6 %', 'Kubota PS 2016', 'kOTEf');
      const Afb = se.o('Q_khí,đĩa', 'Lưu lượng khí đĩa bọt mịn', O2f / (0.277 * p.kb_OTEfb) / 1440, 'Nm³/phút', 'O₂_đĩa/(0,277·OTE)/1440', 'Kubota PS 7.2.3', '[kO2f]/(0.277*[kOTEf])/1440', 'kAirF');
      se.chk('Có bể tiền sục khí khi cần đĩa bọt mịn', !(O2f > 1e-6 && Vpr <= 1e-9), 'ĐẠT', 'THIẾU BỂ TIỀN SỤC KHÍ', 'Kubota Guidebook 4-2 b', false, 'OR([kO2f]<=0.000001,[kVpr]>0.000000001)');

      /* --- F: kích thước các bể (bố trí sơ bộ: n_bể dây chuyền thiếu khí → tiền sục khí → bể màng, cùng bề rộng B) --- */
      const sf = u.sec('F. Kích thước các bể (bố trí sơ bộ theo dây chuyền) — Kubota PS mục 4.2');
      const Lan = sf.o('L_tk', 'Chiều dài ngăn thiếu khí', ceilTo(Vanr / (nT * Bm * Hm), 0.5), 'm', 'V_tk,yc/(n_bể·B·H), làm tròn 0,5 m', '', 'CEILING([kVanr]/([knT]*[kB]*[kH]),0.5)', 'kLan');
      const Van = sf.o('V_tk', 'Thể tích bể thiếu khí', Lan * Bm * Hm * nT, 'm³', 'L·B·H·n_bể', '', '[kLan]*[kB]*[kH]*[knT]', 'kVan');
      const Lpre = sf.o('L_tsk', 'Chiều dài ngăn tiền sục khí', Vpr > 0 ? ceilTo(Vpr / (nT * Bm * Hm), 0.5) : 0, 'm', 'V_tsk,yc/(n_bể·B·H), làm tròn 0,5 m', '', 'IF([kVpr]>0,CEILING([kVpr]/([knT]*[kB]*[kH]),0.5),0)', 'kLp');
      const Vpre = sf.o('V_tsk', 'Thể tích bể tiền sục khí', Lpre * Bm * Hm * nT, 'm³', 'L·B·H·n_bể', '', '[kLp]*[kB]*[kH]*[knT]', 'kVp');
      sf.o('H', 'Chiều sâu nước bể sinh học (trắc dọc thủy lực)', Hm, 'm', '', '', '[kH]', 'Hb');
      const Vtot = sf.o('V', 'Tổng thể tích cụm MBR', Van + Vpre + Vm, 'm³', 'V_tk + V_tsk + V_màng', '', '[kVan]+[kVp]+[kVm]', 'kVtot');
      const HRT = sf.o('HRT', 'Thời gian lưu nước', Vtot / Q * 24, 'h', 'V/Q·24', '', '[kVtot]/[kQ]*24', 'kHRT');
      sf.o('L_v', 'Tải trọng BOD trên toàn cụm', LBOD / Vtot, 'kg BOD/m³·d', 'L_BOD/V', 'Guidebook Bảng 2-3: ≤ 1,5 (bể sục khí)', '[kLBOD]/[kVtot]', 'kLv');

      /* --- G: M&E – SRT theo cân bằng bùn, động học chung --- */
      const Mt = (Xan * (Van + Vpre) + X * Vm) / 1000;
      const S0m = p.bcod_bod * st4.BOD, nbVSSm = (1 - ch.bp_p) * st4.TSS * p.vss_tss, iTSSm = st4.TSS - st4.TSS * p.vss_tss;
      const pxOf = srt => {
        const Sm = p.Ks * (1 + kin.bH_T * srt) / (srt * (kin.muH_T - kin.bH_T) - 1);
        const Ah = Q * p.YH * (S0m - Sm) / (1 + kin.bH_T * srt) / 1000, Bh = p.fd * kin.bH_T * srt * Ah;
        let nox = 0.8 * st4.TKN, px = 0;
        for (let it = 1; it <= 5; it++) { const Cn = Q * p.YAOB * nox / (1 + kin.bAOB_T * srt) / 1000; px = Ah + Bh + Cn; nox = Math.max(0, st4.TKN - NH4e - p.fN * px * 1000 / Q); }
        return px / 0.85 + Q * nbVSSm / 1000 + Q * iTSSm / 1000;
      };
      let srtM = Mt / Math.max(1e-6, Xs);
      for (let it = 0; it < 80; it++) srtM = Mt / pxOf(srtM);
      const sg = u.sec('G. Tuổi bùn theo cân bằng bùn M&E — (P_X,TSS)·SRT = Σ MLSS·V, PT (8-20), (8-21), (8-24)');
      sg.o('M_bùn', 'Khối bùn lưu giữ', Mt, 'kg SS', 'MLSS_tk·(V_tk + V_tsk) + MLSS·V_màng', '', '([kXa]*([kVan]+[kVp])+[kX]*[kVm])/1000', 'kMt');
      const Xavg = sg.o('MLSS_TB', 'MLSS trung bình toàn cụm', Mt * 1000 / Vtot, 'mg/L', 'M/V', '', '[kMt]*1000/[kVtot]', 'kXavg');
      sg.i('SRT_M&E', 'SRT hội tụ (giải lặp điểm cố định 80 vòng)', srtM, 'ngày', 'Kiểm tra cân bằng bùn ở mục H', 'M&E 5th Ex. 8-5', 'kSRT');
      K = bioCommon(u, srtM, Xavg, { noVolume: true, noSRTcheck: true, srtName: 'SRT (cân bằng bùn M&E)', srtNote: 'Lấy từ mục G', srtX: '[kSRT]', mlssX: '[kXavg]' });
      const sh = u.sec('H. Kiểm tra theo M&E 5th (Sec. 8-6, 8-7, 8-9)');
      const bal = sh.o('Cân bằng bùn', 'P_X,TSS·SRT/M (≈ 1 nếu hội tụ)', K.PXTSS * srtM / Mt, '-', '', 'PT (8-21)', '[PXTSS]*[SRT]/[kMt]', 'kbal');
      sh.chk('Cân bằng bùn hội tụ (sai số ≤ 1 %)', Math.abs(bal - 1) <= 0.01, 'ĐẠT', 'CHƯA HỘI TỤ', 'M&E 5th', false, 'ABS([kbal]-1)<=0.01');
      const fA = sh.o('f_hk', 'Phân suất khối bùn hiếu khí', (Xan * Vpre + X * Vm) / 1000 / Mt, '-', '(MLSS_tk·V_tsk + MLSS·V_màng)/M', '', '([kXa]*[kVp]+[kX]*[kVm])/1000/[kMt]', 'kfA');
      const SRTa = sh.o('SRT_hk', 'SRT hiếu khí', srtM * fA, 'ngày', 'SRT·f_hk', 'M&E mục 8-7', '[SRT]*[kfA]', 'kSRTa');
      sh.chk('SRT hiếu khí ≥ SRT yêu cầu nitrat hóa', SRTa >= K.SRTreq, 'ĐẠT', 'THIẾU SRT – tăng MLSS / bể tiền sục khí', 'M&E Bảng 8-15', false, '[kSRTa]>=[SRTreq]');
      sh.o('Y_obs', 'Hệ số sinh bùn quan trắc (M&E)', K.PXTSS / LBOD, 'kg TSS/kg BOD', 'P_X,TSS/L_BOD', 'Kubota y_s 0,40 – 0,50', '[PXTSS]/[kLBOD]', 'kYme');
      sh.o('X_Kubota/P_X', 'Tỷ số bùn dư Kubota / M&E (đối chiếu)', Xs / K.PXTSS, '-', '', 'Quy tắc R06', '[kXs]/[PXTSS]', 'kXr');

      /* --- I: nitrat & carbon --- */
      const si = u.sec('I. Cân bằng nitrat & NO₃-N ra — M&E PT (8-61); năng lực theo Kubota Bảng 4-3');
      const NO3IR = si.o('NO₃_IR', 'NO₃-N ra theo cân bằng tuần hoàn', K.NOx / (1 + r), 'mg/L', 'NOx/(1 + r)', 'PT (8-61); Guidebook 4-3: η = r/(r + 1)', '[NOx]/(1+[kr])', 'kNO3IR');
      const capK = si.o('C_DN', 'Năng lực khử nitrat bể thiếu khí (Kubota)', kDN * Xan / 1000 * Van, 'kg N/ngđ', 'k_DN·MLSS_tk·V_tk', 'Kubota Bảng 4-3', '[kkDN]*[kXa]/1000*[kVan]', 'kcapK');
      const reqN = si.o('NO_r,yc', 'Nitrat cần khử', Q * (K.NOx - NO3IR) / 1000, 'kg N/ngđ', 'Q·(NOx − NO₃_IR)', '', '[Q]*([NOx]-[kNO3IR])/1000', 'kreqN');
      const defN = si.o('ΔN_thiếu', 'Thiếu hụt năng lực khử nitrat', Math.max(0, reqN - capK), 'kg N/ngđ', '', '', 'MAX(0,[kreqN]-[kcapK])', 'defN');
      const bNeed = si.o('BOD/N', 'Tỷ số BOD/N vào', LBOD / Math.max(LN, 1e-6), 'g/g', 'Guidebook 2-4: < 2 – 3 cần methanol', 'Kubota Guidebook 2-4, 4-4', '[kLBOD]/[kLN]', 'kBN');
      const defC = si.o('ΔBOD_thiếu', 'Thiếu BOD cho khử nitrat', Math.max(0, 2.8 * reqN - LBOD) , 'kg BOD/ngđ', 'max(0; 2,8·NO_r − L_BOD)', 'Kubota PS (2,8 kg BOD/kg N)', 'MAX(0,2.8*[kreqN]-[kLBOD])', 'defC');
      si.chk('Năng lực khử nitrat & carbon nội tại', defN <= 1e-6 && defC <= 1e-6, 'ĐẠT', c.carbon === 'auto' ? 'THIẾU — bổ sung methanol (tự động)' : 'THIẾU — tăng bể thiếu khí / bổ sung carbon', 'Kubota Guidebook 4-4', c.carbon === 'auto', 'AND([defN]<=0.000001,[defC]<=0.000001)');
      let carbon = { M: 0, sl: 0 }, useC = false;
      if (((defN > 1e-6 || defC > 1e-6) || p.meoh_set > 0) && c.carbon === 'auto') { carbon = extCarbon(si, Math.max(defN, defC / 2.8), `MAX([defN],[defC]/2.8)`); useC = true; }
      const den = useC ? reqN : Math.min(reqN, capK, LBOD / 2.8);
      const NO3e = si.o('NO₃-N_e', 'NO₃-N ra', K.NOx - den * 1000 / Q, 'mg/L', 'NOx − NO_r khử/Q', '', useC ? '[NOx]-[kreqN]*1000/[Q]' : '[NOx]-MIN([kreqN],[kcapK],[kLBOD]/2.8)*1000/[Q]', 'kNO3e');
      const NO3den = si.o('NO₃_dn', 'NO₃-N được khử', K.NOx - NO3e, 'mg/L', '', '', '[NOx]-[kNO3e]', 'kNO3dn');
      si.o('NO₃_dn,SH', 'NO₃-N khử bằng carbon nội tại', Math.min(reqN, capK, LBOD / 2.8) * 1000 / Q, 'mg/L', '', '', 'MIN([kreqN],[kcapK],[kLBOD]/2.8)*1000/[Q]', 'kNO3dnB');
      const Ro = sh.o('R₀', 'Nhu cầu O₂ theo M&E (PT 8-23, trừ khử nitrat)', Q * (K.S0 - K.S) / 1000 - 1.42 * K.PXbio + 4.57 * Q * K.NOx / 1000 - 2.86 * Q * NO3den / 1000, 'kg O₂/ngđ', 'Q(S₀ − S) − 1,42·P_X,bio + 4,57·Q·NOx − 2,86·Q·NO₃ khử', 'M&E PT (8-23)', '[Q]*([S0]-[S])/1000-1.42*[PXbio]+4.57*[Q]*[NOx]/1000-2.86*[Q]*[kNO3dn]/1000', 'kRo');
      sh.o('O₂_Kubota/R₀', 'Tỷ số O₂ Kubota / M&E', O2K / Ro, '-', '', '', '[kO2K]/[kRo]', 'kRr');
      sh.chk('O₂ thiết kế theo Kubota ≥ nhu cầu M&E', O2K >= Ro * 0.98, 'ĐẠT', 'KUBOTA THẤP HƠN M&E – kiểm tra cấp khí', 'M&E PT (8-23)', true, '[kO2K]>=[kRo]*0.98');

      /* --- J: máy thổi khí, bơm hút màng, tuần hoàn, rửa màng --- */
      const sj = u.sec('J. Máy thổi khí, bơm hút màng & tuần hoàn — Guidebook 1-6, 1-7; PS 2018 mục 5.1, 5.3');
      sj.i('Δp_màng', 'Tổn thất ống khí màng (giả thiết)', 5, 'kPa', '', 'Kubota PS 2018', 'kdpm');
      const p2m = sj.o('p₂,màng', 'Áp suất đẩy máy thổi khí màng', patm + 9.81 * Hm + 5, 'kPa', 'p_atm + ρg·H + Δp', 'M&E PT (5-77)', '[info.patm]+9.81*[kH]+[kdpm]', 'kp2m');
      sj.i('e', 'Hiệu suất máy thổi khí', p.air_e, '-', '0,70 – 0,90', 'M&E 5th tr.434', 'ke');
      const pwOf = (qm3min, p2) => qm3min / 60 * 1.293 * 8.314 * 293.15 / (28.97 * 0.283 * p.air_e) * (Math.pow(p2 / patm, 0.283) - 1);
      const Pm = sj.o('P_w,màng', 'Công suất trục máy thổi khí màng (1 máy/bể)', pwOf(Amem / nT, p2m), 'kW', 'wRT₁/(28,97·0,283·e)·[(p₂/p₁)^0,283 − 1]', 'M&E PT (5-77a)', '[kAirM]/[knT]/60*1.293*8.314*293.15/(28.97*0.283*[ke])*(([kp2m]/[info.patm])^0.283-1)', 'kPm');
      const p2f = sj.o('p₂,đĩa', 'Áp suất đẩy máy thổi khí đĩa bọt mịn', patm + 9.81 * (Hm - 0.3) + p.air_dp, 'kPa', 'p_atm + ρg·(H − 0,3) + Δp', 'M&E PT (5-77)', '[info.patm]+9.81*([kH]-0.3)+' + p.air_dp, 'kp2f');
      const nfb = Afb > 1e-9 ? Math.max(1, p.air_nb) : 0;
      const Pf = sj.o('P_w,đĩa', 'Công suất trục máy thổi khí đĩa bọt mịn (mỗi máy)', nfb ? pwOf(Afb / nfb, p2f) : 0, 'kW', '', 'M&E PT (5-77a)', nfb ? `[kAirF]/${nfb}/60*1.293*8.314*293.15/(28.97*0.283*[ke])*(([kp2f]/[info.patm])^0.283-1)` : '0', 'kPf');
      sj.o('P_w', 'Tổng công suất trục máy thổi khí', Pm * nT + Pf * nfb, 'kW', 'P_màng·n_bể + P_đĩa·n_máy', '', `[kPm]*[knT]+[kPf]*${nfb}`, 'Pw');
      const Qp = sj.o('Q_hút', 'Lưu lượng 1 bơm hút màng (lọc 9/10 thời gian, ở Q_max)', Qmx / nT / 24 * 10 / 9, 'm³/h', 'Q_max/n_bể/24·10/9', 'Kubota Guidebook 1-6', '[kQmx]/[knT]/24*10/9', 'kQp');
      const Hp = sj.i('H_bơm', 'Cột áp bơm hút màng', p.kb_head, 'm', 'Bơm tự mồi; TMP ≤ 20 kPa', 'Kubota Guidebook 1-6', 'kHp');
      const Pp1 = sj.o('N_bơm hút', 'Công suất 1 bơm hút màng', 9.81 * Qp / 3600 * Hp / 0.6, 'kW', 'ρgQH/η (η = 0,6)', '', '9.81*[kQp]/3600*[kHp]/0.6', 'kPp');
      const Qrc = sj.o('Q_tuần hoàn', 'Lưu lượng bơm chuyển thiếu khí → bể màng (kiểu tiêu chuẩn)', (r + 1) * Q / 24, 'm³/h', '(r + 1)·Q/24; bể màng tràn về thiếu khí r·Q', 'Kubota Guidebook 4-1 ③', '([kr]+1)*[kQ]/24', 'kQrc');
      /* rửa màng tại chỗ */
      const sk = u.sec('K. Rửa màng hóa chất tại chỗ (CIP) & rửa đĩa khí — Guidebook 1-8 ④; PS 2018 mục 5.4');
      sk.i('V_CIP', 'Thể tích dung dịch mỗi tấm', 3, 'L/tấm', 'Rót trọng lực ≤ 10 kPa, ~10 phút', 'Kubota Guidebook 1-8', 'kVc1');
      const VC = sk.o('V_CIP,bể', 'Thể tích dung dịch mỗi lần rửa 1 bể', Nc / nT * 3 / 1000, 'm³', 'N/n_bể·3 L', 'Kubota PS 2018', '[kN]/[knT]*[kVc1]/1000', 'kVC');
      sk.i('C_Cl', 'Nồng độ NaOCl', p.kb_Cl, 'mg/L Cl', 'Hữu cơ; vô cơ: axit oxalic 10.000 mg/L', 'Kubota PS 2018', 'kCl');
      sk.i('n_CIP', 'Số lần rửa / năm', p.kb_nCIP, 'lần/năm', '3 tháng/lần; tối thiểu 2 lần/năm', 'Kubota', 'knC');
      const MCl = sk.o('M_NaOCl', 'NaOCl 12 % tiêu thụ trung bình', Nc * 3 * p.kb_Cl / 1e6 / 0.12 * p.kb_nCIP / 365, 'kg/ngđ', 'N·3 L·C/0,12·n_CIP/365', '', '[kN]*[kVc1]*[kCl]/1000000/0.12*[knC]/365', 'kMCl');
      sk.t2('Rửa đĩa khí', 'Mở van rửa đĩa ≥ 5 phút/lần, ≥ 1 lần/ngày (tối thiểu 2 tuần/lần); dừng lọc khi rửa đĩa', '', 'Kubota PS 2018 mục 1.3');
      R.chem.push({ name: 'NaOCl 12 % – rửa màng CIP Kubota', dose: MCl / Q * 1000, kg: MCl, unit: 'kg dung dịch', price: 'p_NaOCl', note: `${fx(p.kb_nCIP)} lần/năm × ${fx(Nc * 3 / 1000, 1)} m³`, ref: u.ids.kMCl });

      alkalinity(u, K.NOx, '[NOx]', NO3den, '[kNO3dn]', 'L. ');
      /* --- M: bùn dư & photpho (phương pháp chung M&E) --- */
      const sn = u.sec('M. Bùn dư & photpho (phương pháp chung M&E – quy tắc R06)');
      const PX = sn.o('P_X,TSS', 'Bùn dư (M&E, có SS trơ) – dùng cho cụm bùn', K.PXTSS, 'kg TSS/ngđ', 'PT (8-21)', 'Quy tắc R06', '[PXTSS]', 'kPX');
      sn.o('Q_w', 'Lưu lượng bùn dư (xả từ bể màng)', (PX + carbon.sl) * 1000 / X, 'm³/ngđ', 'P_X/MLSS', 'Kubota: bùn dư 1,0 – 2,0 %', carbon.sl ? '([kPX]+[Xext])*1000/[kX]' : '[kPX]*1000/[kX]', 'kQw');
      sn.i('f_P', 'P đồng hóa cơ bản trong sinh khối', p.fP, 'gP/gVSS', 'Chung mọi phương án (F15)', 'M&E VD 8-13', 'kfP');
      const Pass = sn.o('P_đh', 'P đồng hóa cơ bản', p.fP * K.PXVSS * 1000 / Q, 'mg/L', 'f_P·P_X,VSS/Q', 'M&E VD 8-13', '[kfP]*[PXVSS]*1000/[Q]', 'kPass');
      const TPe = sn.o('TP_e', 'TP còn lại sau sinh học', Math.max(0, st4.TP - Pass), 'mg/L', 'max(0; TP − P_đh); PAC theo Guidebook 4-4 ③ nếu cần', '', 'MAX(0,[kTP]-[kPass])', 'TPbio');

      bioRes.NO3e = NO3e; bioRes.NO3den = NO3den; bioRes.TPe = TPe;
      bioRes.sludge = PX + carbon.sl; bioRes.sludgeX = '[bio.kPX]' + (carbon.sl ? '+[bio.Xext]' : '');
      bioRes.Vtot = Vtot; bioRes.VtotX = '[bio.kVtot]';
      RAS = r;
      const zs = [{ name: 'THIẾU KHÍ', len: Lan }];
      if (Lpre > 0) zs.push({ name: 'TIỀN SỤC KHÍ (HIẾU KHÍ)', len: Lpre });
      zs.push({ name: 'BỂ MÀNG ' + mk, len: Lm, smu: { n: nUt, uH: Hu, pitch: M.pitch, add: M.add } });
      ub.geom = { type: 'rect', L: Lan + Lpre + Lm, B: Bm, H: Hm + p.fb, fb: p.fb, n: nT, zones: zs, label: 'MBR KUBOTA' };
      ub.dims = `${nT} dây chuyền × (B ${fx(Bm)} m; thiếu khí ${fx(Lan)} m${Lpre > 0 ? `; tiền sục khí ${fx(Lpre)} m` : ''}; bể màng ${fx(Lm)} m) × H ${fx(Hm)} m; ${nU} SMU ${mk}`;
      ub.hrt = `${fx(HRT)} h`; ub.n = nT; ub.H = Hm;
      ub.mixkW = Van / 1000 * 5; ub.mixH = 24;
      u.mbr = { Am, Vmem: Vm, SAD: Amem, Pp: Pp1 * nT, model: mk, nU, Nc };
      u.kb = { mk, M, nT, nUt, nU, Nc, Am, Fa, qa: qaR, Amem, Afb, nfb, Pm, Pf, Qp, Qrc, r, Vm, Van, Vpre, Lm, Bm, Hm, O2K, O2m, VC };
      u.airP = Pm * nT + Pf * nfb; u.airQ = Amem + Afb; u.airH = 24; u.nBlower = nT + 1 + (nfb ? nfb + 1 : 0); u.airRow = u.ids.Pw;
      R.equip.push({ u: u.name, name: `Cụm màng Kubota SMU ${mk} (màng tấm phẳng CPE 0,4 µm)`, spec: `${M.n} tấm × ${fx(M.S)} m² = ${fx(M.n * M.S)} m²/SMU; tổng ${fx(Am, 0)} m²; F = ${fx(Fa, 2)} m³/m²·ngđ`, qty: nU, qtyX: '{{ref:bio.knUt}}', note: `${nT} bể × ${nUt} SMU`, spare: 'membrane' });
      R.equip.push({ u: 'Nhà máy thổi khí', name: 'Máy thổi khí rửa màng (riêng cho từng bể màng)', spec: `${fx(Amem / nT)} Nm³/phút × ${fx(p2m - patm)} kPa; ${fx(ceilTo(Pm / 0.95 * 1.15, 0.5))} kW`, qty: nT + 1, note: `${nT} + 1 dự phòng` });
      if (nfb) {
        R.equip.push({ u: 'Nhà máy thổi khí', name: 'Máy thổi khí bể tiền sục khí (đĩa bọt mịn)', spec: `${fx(Afb / nfb)} Nm³/phút × ${fx(p2f - patm)} kPa; ${fx(ceilTo(Pf / 0.95 * 1.15, 0.5))} kW`, qty: nfb + 1, note: `${nfb} + 1 dự phòng` });
        R.equip.push({ u: u.name, name: 'Đĩa phân phối khí bọt mịn bể tiền sục khí', spec: `${p.air_qd} Nm³/h·đĩa`, qty: Math.ceil(Afb * 60 / p.air_qd - 1e-9), note: '', spare: 'diffuser' });
      }
      R.equip.push({ u: u.name, name: 'Bơm hút màng (tự mồi, biến tần) + van điều chỉnh lưu lượng', spec: `${fx(Qp)} m³/h × ${fx(Hp)} m; ${fx(ceilTo(Pp1 * 1.2, 0.5))} kW`, qty: nT + 1, note: `${nT} + 1 dự phòng; lọc 9 phút/nghỉ 1 phút` });
      R.equip.push({ u: u.name, name: 'Bơm chuyển thiếu khí → bể màng (r + 1)Q', spec: `${fx(Qrc / nT)} m³/h × 2 m`, qty: nT + 1, note: `r = ${fx(r)}; bể màng tràn về thiếu khí` });
      R.equip.push({ u: u.name, name: 'Máy khuấy chìm bể thiếu khí', spec: `${fx(Van / 1000 * 5 / nT)} kW/máy`, qty: nT, note: '5 W/m³' });
      R.equip.push({ u: u.name, name: 'Van rửa đĩa khí SMU (tự động)', spec: '≥ 5 phút/ngày', qty: nU, note: 'Guidebook 1-8 ⑥' });
      R.equip.push({ u: u.name, name: 'Đồng hồ áp (số) + lưu lượng kế điện từ trên ống hút', spec: 'Áp −100 ÷ +100 kPa', qty: nT, note: 'Theo dõi TMP' });
      R.equip.push({ u: u.name, name: 'Bồn & bơm hóa chất rửa màng CIP', spec: `${fx(VC, 1)} m³/lần/bể; NaOCl ${fx(p.kb_Cl)} mg/L`, qty: 1, note: 'Rót trọng lực ≤ 1 m' });
      R.equip.push({ u: u.name, name: 'Pa lăng nâng SMU (ray dọc trục SMU)', spec: M.wt ? `≥ ${fx(M.wt)} kg` : 'Theo khối lượng Kubota cung cấp', qty: nT, note: 'Guidebook 1-5' });
      K.bioOut = { NO3: '[kNO3e]', TP: '[TPbio]', Alk: '[Alkout]' };
      if (OGi > 0.15 * BODi) warn('MBR Kubota: dầu mỡ vượt 15 % BOD – cần tách dầu trước MBR (Kubota PS 2018).');
    } else if (bio === 'TF') {
      /* ======== Lọc sinh học nhỏ giọt – công thức NRC (M&E 5th mục 9-2; bảng tính "Trickling Filter Design-NRC Formula_SI units")
         E = 1/(1 + K·(W/VF)^0,5), F = (1 + R)/(1 + 0,1R)²; bậc 2: E₂ = 1/(1 + K/(1 − E₁)·(W₂/V₂F₂)^0,5) (M&E – bảng tính gốc bỏ thừa số 1/(1 − E₁));
         hiệu chỉnh nhiệt độ E_T = E₂₀·θ^(T−20). Nitrat hóa ước tính theo tải trọng BOD thể tích (M&E 5th Bảng 9-2). ======== */
      const u = ub, two = c.tfStage === '2';
      const s1 = u.sec('1. Nước thải vào & mục tiêu — M&E 5th mục 9-2');
      s1.o('Q', 'Lưu lượng (sau lắng sơ cấp)', Q, 'm³/ngđ', '', '', '[info.Q]', 'Q');
      const S0 = s1.o('S₀', 'BOD₅ vào lọc sinh học', st4.BOD, 'mg/L', 'Cột ④', '', '[bal.BOD4]', 'BOD');
      const TSSi = s1.o('TSS', 'TSS vào', st4.TSS, 'mg/L', '', '', '[bal.TSS4]', 'TSS');
      const TKN = s1.o('TKN', 'TKN vào', st4.TKN, 'mg/L', '', '', '[bal.TKN4]', 'TKN');
      s1.o('NH₄-N', 'Amoni vào', st4.NH4, 'mg/L', '', '', '[bal.NH44]', 'NH4');
      s1.o('TP', 'TP vào', st4.TP, 'mg/L', '', '', '[bal.TP4]', 'TP');
      const Alk = s1.o('Alk', 'Độ kiềm vào', st4.Alk, 'mg/L CaCO₃', '', '', '[bal.Alk4]', 'Alk');
      s1.o('nbsCOD', 'COD hòa tan trơ', Math.max(0, ch.nbsCOD), 'mg/L', 'Giữ như nước thô', 'M&E VD 8-3', 'MAX(0,[info.nbsCOD])', 'nbsCOD');
      const SeT = p.tf_Se > 0 ? +p.tf_Se : L.BOD !== undefined ? 0.8 * L.BOD : 20;
      const Se = s1.i('S_e', 'BOD₅ ra mục tiêu (sau lắng thứ cấp)', Math.min(SeT, 0.95 * S0), 'mg/L', p.tf_Se > 0 ? 'Nhập (tab 4)' : L.BOD !== undefined ? '0,8 × BOD giới hạn xả' : 'Mặc định 20 mg/L', 'Bảng tính mẫu', 'Se');
      const E = s1.o('E', 'Hiệu suất khử BOD yêu cầu', (S0 - Se) / S0, '-', '(S₀ − S_e)/S₀', 'M&E mục 9-2', '([BOD]-[Se])/[BOD]', 'E');
      const s2 = u.sec('2. Hệ số tuần hoàn & hiệu chỉnh nhiệt độ');
      const Rr = s2.i('R', 'Tỷ lệ tuần hoàn (mỗi bậc)', p.tf_R, '× Q', '0,5 – 4', 'M&E Bảng 9-2', 'R');
      const F = s2.o('F', 'Hệ số tuần hoàn', (1 + Rr) / Math.pow(1 + 0.1 * Rr, 2), '-', 'F = (1 + R)/(1 + 0,1R)²', 'M&E PT (9-?) – NRC', '(1+[R])/(1+0.1*[R])^2', 'F');
      const Kn = s2.i('K', 'Hệ số công thức NRC (hệ SI)', p.tf_K, '-', 'W kg/ngđ, V m³', 'NRC (1946); M&E mục 9-2', 'K');
      const th = s2.i('θ', 'Hệ số nhiệt độ', p.tf_theta, '-', '1,035', 'M&E mục 9-2', 'th');
      const E20 = s2.o('E₂₀', 'Hiệu suất yêu cầu quy về 20 °C', Math.min(0.97, E / Math.pow(th, T - 20)), '-', 'E/θ^(T−20) (≤ 0,97)', 'M&E mục 9-2', 'MIN(0.97,[E]/[th]^([info.T]-20))', 'E20');
      const H = s2.i('H', 'Chiều sâu lớp vật liệu lọc', p.tf_H, 'm', 'Đá 0,9 – 2,5; nhựa 4 – 12', 'M&E Bảng 9-2', 'H');
      const n = Math.max(1, Math.round(p.tf_n));
      s2.i('n', 'Số bể song song (mỗi bậc)', n, 'bể', '', '', 'n');
      const W = S0 * Q / 1000;
      const nrcV = (w, e, k) => w / (F * Math.pow((1 / e - 1) / k, 2));   // thể tích theo NRC cho hiệu suất e
      let V1, V2 = 0, E1 = E20, S1 = Se;
      if (!two) {
        const s3 = u.sec('3. Lọc sinh học nhỏ giọt 1 bậc — công thức NRC');
        s3.o('W', 'Tải trọng BOD áp dụng', W, 'kg/ngđ', 'Q·S₀', '', '[Q]*[BOD]/1000', 'W');
        const WVF = s3.o('W/VF', 'Tham số NRC yêu cầu', Math.pow((1 / E20 - 1) / Kn, 2), 'kg/m³·ngđ', '[(1/E − 1)/K]²', 'E = 1/(1 + K·(W/VF)^0,5)', '((1/[E20]-1)/[K])^2', 'WVF');
        V1 = s3.o('V', 'Thể tích vật liệu lọc yêu cầu', W / (WVF * F), 'm³', 'W/(W/VF·F)', 'Bảng tính mẫu', '[W]/([WVF]*[F])', 'Vreq');
      } else {
        // bậc 1 và bậc 2 cùng thể tích: chia đôi theo E₁ để V₁ = V₂ (thay Goal Seek của bảng tính)
        const tgt = 1 - E20;
        const f = e1 => { const s1_ = S0 * (1 - e1), e2 = 1 - S0 * tgt / s1_; if (e2 <= 0) return 1e9; return nrcV(W, e1, Kn) - (Q * s1_ / 1000) / (F * Math.pow((1 - e1) * (1 / e2 - 1) / Kn, 2)); };
        let lo = 1e-4, hi = E20 - 1e-4;
        for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
        E1 = (lo + hi) / 2; S1 = S0 * (1 - E1);
        const s3 = u.sec('3. Bậc 1 — công thức NRC');
        s3.o('W₁', 'Tải trọng BOD bậc 1', W, 'kg/ngđ', 'Q·S₀', '', '[Q]*[BOD]/1000', 'W');
        s3.o('E₁', 'Hiệu suất bậc 1 (giải V₁ = V₂)', E1, '-', 'Chia đôi – thay Goal Seek', 'Bảng tính mẫu (sheet Hai bậc)', null, 'E1');
        V1 = s3.o('V₁', 'Thể tích vật liệu lọc bậc 1', nrcV(W, E1, Kn), 'm³', 'W₁/(F·[(1/E₁ − 1)/K]²)', 'NRC', '[W]/([F]*((1/[E1]-1)/[K])^2)', 'Vreq');
        S1 = s3.o('S₁', 'BOD₅ ra bậc 1', S1, 'mg/L', 'S₀(1 − E₁)', '', '[BOD]*(1-[E1])', 'S1');
        const s4 = u.sec('4. Bậc 2 — công thức NRC bậc 2 (M&E)');
        const W2 = s4.o('W₂', 'Tải trọng BOD bậc 2', Q * S1 / 1000, 'kg/ngđ', 'Q·S₁', '', '[Q]*[S1]/1000', 'W2');
        const E2 = s4.o('E₂', 'Hiệu suất bậc 2', 1 - S0 * (1 - E20) / S1, '-', '1 − S_e,20/S₁', '', '1-[BOD]*(1-[E20])/[S1]', 'E2');
        V2 = s4.o('V₂', 'Thể tích vật liệu lọc bậc 2', W2 / (F * Math.pow((1 - E1) * (1 / E2 - 1) / Kn, 2)), 'm³', 'W₂/(F·[(1 − E₁)(1/E₂ − 1)/K]²)', 'M&E – NRC bậc 2', '[W2]/([F]*((1-[E1])*(1/[E2]-1)/[K])^2)', 'V2');
        s4.note('Bảng tính gốc tính bậc 2 bằng E₂ = 1/(1 + 0,4432·(W₂/V₂F₂)^0,5) (bỏ thừa số 1/(1 − E₁) của M&E) nên thể tích nhỏ hơn nhiều – phần mềm dùng công thức đầy đủ của M&E.');
      }
      const ss = u.sec((two ? '5' : '4') + '. Kích thước bể lọc & tải trọng');
      const Dd = ss.o('D', 'Đường kính mỗi bể (làm tròn 0,5 m)', ceilTo(Math.sqrt(4 * V1 / n / (PI * H)), 0.5), 'm', '√(4V/(n·π·H))', 'Bảng tính mẫu', 'CEILING(SQRT(4*[Vreq]/[n]/(PI()*[H])),0.5)', 'D');
      const A1 = PI * Dd * Dd / 4;
      const Vb = ss.o('V_tt', 'Thể tích vật liệu lọc thực tế mỗi bậc', n * A1 * H, 'm³', 'n·π·D²/4·H', '', '[n]*PI()*[D]^2/4*[H]', 'Vb');
      const nSt = two ? 2 : 1, Vtot = Vb * nSt;
      ss.o('V_tổng', 'Tổng thể tích vật liệu lọc', Vtot, 'm³', two ? '2 bậc' : '', '', two ? '2*[Vb]' : '[Vb]', 'Vtot');
      const Lv = ss.o('L_BOD', 'Tải trọng BOD thể tích (toàn hệ)', W / Vtot, 'kg BOD/m³·ngđ', 'Q·S₀/V', 'M&E Bảng 9-2', '[Q]*[BOD]/1000/[Vtot]', 'Lv');
      const qh = ss.o('q', 'Tải trọng thủy lực (kể tuần hoàn)', Q * (1 + Rr) / (n * A1), 'm³/m²·ngđ', 'Q(1 + R)/A', 'M&E Bảng 9-2', '[Q]*(1+[R])/([n]*PI()*[D]^2/4)', 'q');
      ss.o('q₀', 'Tải trọng thủy lực không kể tuần hoàn', Q / (n * A1), 'm³/m²·ngđ', 'Q/A (như bảng tính mẫu)', 'Bảng tính mẫu', '[Q]/([n]*PI()*[D]^2/4)', 'q0');
      ss.i('q_min', 'Tải trọng thủy lực tối thiểu', p.tf_qmin, 'm³/m²·ngđ', 'Làm ướt đều vật liệu', 'M&E Bảng 9-2', 'qmin');
      ss.chk('Tải trọng thủy lực ≥ q_min (làm ướt vật liệu)', qh >= p.tf_qmin - 1e-9, 'ĐẠT', 'Tăng tỷ lệ tuần hoàn R', 'M&E Bảng 9-2', true, '[q]>=[qmin]');
      ss.chk('Tải trọng BOD trong dải 0,07 – 4,8 kg/m³·ngđ', Lv >= 0.07 && Lv <= 4.8, 'ĐẠT', 'Ngoài dải lọc nhỏ giọt (M&E Bảng 9-2)', 'M&E Bảng 9-2', true, 'AND([Lv]>=0.07,[Lv]<=4.8)');
      // hiệu suất thực tế của bể đã làm tròn
      const s5 = u.sec((two ? '6' : '5') + '. Hiệu suất kiểm tra theo kích thước chọn — sheet "Hiệu suất"');
      const e1a = 1 / (1 + Kn * Math.sqrt(W / (Vb * F)));
      s5.o('E₁,tt', two ? 'Hiệu suất bậc 1 (20 °C)' : 'Hiệu suất (20 °C)', e1a, '-', '1/(1 + K·(W/VF)^0,5)', 'NRC', '1/(1+[K]*([W]/([Vb]*[F]))^0.5)', 'Ea1');
      let E20a = e1a, X20 = '[Ea1]';
      if (two) {
        const s1a = S0 * (1 - e1a), e2a = 1 / (1 + Kn / (1 - e1a) * Math.sqrt(Q * s1a / 1000 / (Vb * F)));
        s5.o('E₂,tt', 'Hiệu suất bậc 2 (20 °C)', e2a, '-', '1/(1 + K/(1 − E₁)·(W₂/V₂F)^0,5)', 'M&E – NRC bậc 2', '1/(1+[K]/(1-[Ea1])*([Q]*[BOD]*(1-[Ea1])/1000/([Vb]*[F]))^0.5)', 'Ea2');
        E20a = 1 - (1 - e1a) * (1 - e2a); X20 = '(1-(1-[Ea1])*(1-[Ea2]))';
      }
      const ET = s5.o('E_T', 'Hiệu suất tổng ở T_min', Math.min(0.98, E20a * Math.pow(th, T - 20)), '-', 'E₂₀·θ^(T−20)', 'M&E mục 9-2', `MIN(0.98,${X20}*[th]^([info.T]-20))`, 'ET');
      const BODe = s5.o('S_e,tt', 'BOD₅ ra sau lắng thứ cấp', S0 * (1 - ET), 'mg/L', 'S₀(1 − E_T)', 'NRC', '[BOD]*(1-[ET])', 'BODe');
      s5.chk('BOD₅ ra ≤ mục tiêu', BODe <= Se + 0.05, 'ĐẠT', 'Tăng thể tích / số bậc', 'NRC', false, '[BODe]<=[Se]+0.05');
      // nitrat hóa, bùn, photpho
      const s6 = u.sec((two ? '7' : '6') + '. Nitơ, bùn sinh ra & photpho');
      const tsse = s6.i('TSS_e', 'TSS ra sau lắng thứ cấp', tsseTech, 'mg/L', 'Chung cho công nghệ có lắng thứ cấp', 'Quy tắc R04', 'TSSe');
      const Yt = s6.i('Y_obs', 'Chất rắn sinh ra (bong tróc)', p.tf_Y, 'kg TSS/kg BOD khử', '0,6 – 1,0', 'M&E mục 9-2', 'Y');
      const VSS = TSSi * p.vss_tss, nbVSS = (1 - ch.bp_p) * VSS, iTSS = TSSi - VSS;
      const PXT = s6.o('P_X,TSS', 'Bùn dư (chất rắn bong tróc + SS trơ vào)', Yt * Q * (S0 - BODe) / 1000 + Q * (iTSS + nbVSS) / 1000, 'kg TSS/ngđ', 'Y·Q·ΔBOD + Q·(iTSS + nbVSS)', 'M&E mục 9-2', '[Y]*[Q]*([BOD]-[BODe])/1000+[Q]*([TSS]-[TSS]*[info.rVSS]+(1-[info.bpp])*[TSS]*[info.rVSS])/1000', 'PXTSS');
      const PXV = s6.o('P_X,VSS', 'Bùn dư theo VSS', 0.8 * Yt * Q * (S0 - BODe) / 1000 + Q * nbVSS / 1000, 'kg VSS/ngđ', '0,8·Y·Q·ΔBOD + Q·nbVSS', '', '0.8*[Y]*[Q]*([BOD]-[BODe])/1000+[Q]*(1-[info.bpp])*[TSS]*[info.rVSS]/1000', 'PXVSS');
      const fNit = s6.o('f_nit', 'Mức nitrat hóa ước tính', clamp((0.45 - Lv) / 0.3, 0, 1) * 0.85, '-', 'Tải thấp ≤ 0,15: nitrat hóa tốt; ≥ 0,45: hầu như không', 'M&E Bảng 9-2', 'MAX(0,MIN(1,(0.45-[Lv])/0.3))*0.85', 'fnit');
      const Nav = s6.o('N_có', 'N có thể nitrat hóa', Math.max(0, TKN - p.Norg - p.fN * PXV * 1000 / Q), 'mg/L', 'TKN − N_org − f_N·P_X,VSS/Q', 'M&E PT (8-24)', `MAX(0,[TKN]-${p.Norg}-${p.fN}*[PXVSS]*1000/[Q])`, 'Nav');
      const NOx = s6.o('NOx', 'NO₃-N tạo thành', fNit * Nav, 'mg/L', 'f_nit·N_có', '', '[fnit]*[Nav]', 'NOx');
      const Ne = s6.o('N_e', 'NH₄-N ra', Nav - NOx, 'mg/L', 'N_có − NOx', '', '[Nav]-[NOx]', 'Ne');
      s6.o('sBOD_e', 'BOD hòa tan ra', Math.max(0, BODe - p.bod_tss * tsse), 'mg/L', 'S_e − f·TSS_e', 'M&E VD 8-3 bước 17', `MAX(0,[BODe]-${p.bod_tss}*[TSSe])`, 'sBODe');
      s6.o('Alk_ra', 'Độ kiềm ra', Math.max(0, Alk - 7.14 * NOx), 'mg/L CaCO₃', 'Alk − 7,14·NOx', 'M&E PT (8-?)', 'MAX(0,[Alk]-7.14*[NOx])', 'Alkout');
      s6.i('f_P', 'Hàm lượng P trong sinh khối', p.fP, 'gP/gVSS', '', 'M&E VD 8-13', 'fPb');
      s6.i('f_N', 'Hàm lượng N trong sinh khối', p.fN, 'gN/gVSS', '', 'PT (8-24)', 'fN');
      s6.o('H_tl', 'Chiều cao mực nước tính thủy lực (đáy bể → máng phân phối)', H + 0.6, 'm', 'H + 0,6', '', '[H]+0.6', 'Hb');
      const TPb = s6.o('TP_e', 'TP ra', Math.max(0, st4.TP - p.fP * PXV * 1000 / Q), 'mg/L', 'TP − f_P·P_X,VSS/Q', 'M&E VD 8-13', 'MAX(0,[TP]-[fPb]*[PXVSS]*1000/[Q])', 'TPbio');
      s6.o('R_bùn', 'Tuần hoàn bùn về lọc', 0, '-', 'Không tuần hoàn bùn (tuần hoàn nước sau lọc)', '', '0', 'RAS');
      if (L.NH4 !== undefined && Ne > L.NH4) s6.note(`NH₄-N ra ${fx(Ne)} mg/L > giới hạn ${fx(L.NH4)} mg/L: lọc nhỏ giọt tải BOD ${fx(Lv)} kg/m³·ngđ nitrat hóa kém – giảm tải (tăng thể tích/bậc 2 tải thấp) hoặc thêm bậc nitrat hóa (M&E mục 9-3).`);
      // thiết bị & hình học
      const Qrec = Rr * Q, kWp = 9.81 * Q * (1 + Rr) / 86400 * (H + 2.5) / 0.65 * nSt;
      R.equip.push({ u: u.name, name: 'Hệ phân phối quay (rotary distributor)', spec: `D = ${fx(Dd)} m`, qty: n * nSt, note: 'Quay bằng phản lực tia nước', unitPrice: 180 + 18 * Dd });
      R.equip.push({ u: u.name, name: H > 3 ? 'Vật liệu lọc nhựa dạng khối (cross-flow)' : 'Vật liệu lọc đá dăm 50 – 100 mm', spec: `${fx(Vtot)} m³`, qty: Math.ceil(Vtot), note: 'Đơn giá theo m³', unitPrice: H > 3 ? 3.2 : 0.6 });
      R.equip.push({ u: u.name, name: 'Bơm tuần hoàn nước lọc sinh học', spec: `${fx(Q * (1 + Rr) / 24 / n)} m³/h × ${fx(H + 2.5)} m`, qty: n * nSt + 1, note: `R = ${fx(Rr)}` });
      R.equip.push({ u: u.name, name: 'Sàn đỡ – thoát nước đáy & thông gió tự nhiên', spec: `${n * nSt} bể`, qty: n * nSt, note: '', unitPrice: 25 * A1 / 10 });
      u.geom = { type: 'circ', D: Dd, H: H + 1.2, fb: 0.6, n: n * nSt, label: 'LỌC NHỎ GIỌT' };
      u.V = Vtot; u.A = n * nSt * A1; u.n = n * nSt; u.H = H + 0.6; u.hl = H + 1;
      u.dims = `${nSt > 1 ? '2 bậc × ' : ''}${n} × Ø ${fx(Dd)} m, vật liệu cao ${fx(H)} m`; u.hrt = '-';
      u.kW = kWp; u.tfKW = kWp; u.tf = { two, n, Dd, H, Rr, Lv, Qrec };
      K = { Ne, sBODe: Math.max(0, BODe - p.bod_tss * tsse), nbsCOD: Math.max(0, ch.nbsCOD), PXTSS: PXT, PXVSS: PXV, NOx, SRT: 0, MLSS: 0, bioOut: { NO3: '[NOx]', TP: '[TPbio]', Alk: '[Alkout]' } };
      bioRes.NO3e = NOx; bioRes.NO3den = 0; bioRes.TPe = TPb; bioRes.TSSe = tsse;
      bioRes.sludge = PXT; bioRes.sludgeX = '[bio.PXTSS]';
      bioRes.Vtot = Vtot; bioRes.VtotX = '[bio.Vtot]'; bioRes.A = u.A;
    } else if (bio === 'LAG') {
      /* ======== Hồ sinh học ổn định (bảng tính "Wastewater Lagoon Design_S.I."): bốc hơi Penman; hồ kỵ khí theo tải trọng thể tích (Mara);
         hồ tùy nghi theo tải trọng bề mặt L_s = 350(1,107 − 0,002T)^(T−25) (Mara 1998); hồ hoàn thiện theo HRT; coliform N = N₀/(1 + k_T·HRT),
         k_T = 2,6·1,19^(T−20) (Marais); NH₄ hồ tùy nghi theo Pano & Middlebrooks (1982); thể tích hồ hình thang (công thức lăng trụ cụt). ======== */
      const u = ub, Ta = p.lg_Tair > 0 ? +p.lg_Tair : T, Z = p.lg_Z, LW = p.lg_LW;
      const s1 = u.sec('1. Nước thải vào hồ');
      s1.o('Q', 'Lưu lượng', Q, 'm³/ngđ', '', '', '[info.Q]', 'Q');
      const S0 = s1.o('S₀', 'BOD₅ vào', st4.BOD, 'mg/L', 'Cột ④', '', '[bal.BOD4]', 'BOD');
      s1.o('TSS', 'TSS vào', st4.TSS, 'mg/L', '', '', '[bal.TSS4]', 'TSS');
      const TKN = s1.o('TKN', 'TKN vào', st4.TKN, 'mg/L', '', '', '[bal.TKN4]', 'TKN');
      s1.o('TP', 'TP vào', st4.TP, 'mg/L', '', '', '[bal.TP4]', 'TP');
      const Alk = s1.o('Alk', 'Độ kiềm vào', st4.Alk, 'mg/L CaCO₃', '', '', '[bal.Alk4]', 'Alk');
      s1.o('nbsCOD', 'COD hòa tan trơ', Math.max(0, ch.nbsCOD), 'mg/L', 'Giữ như nước thô', 'M&E VD 8-3', 'MAX(0,[info.nbsCOD])', 'nbsCOD');
      const N0 = s1.o('N₀', 'Coliform vào', st4.Coli, 'MPN/100mL', '', '', '[bal.Coli4]', 'N0');
      s1.i('T_kk', 'Nhiệt độ không khí TB tháng lạnh nhất', Ta, '°C', p.lg_Tair > 0 ? 'Nhập (tab 4)' : 'Lấy T_min nước thải', 'Bảng tính mẫu', 'Ta');
      // bốc hơi (Penman)
      const se = u.sec('2. Tốc độ bốc hơi ròng — phương trình Penman (sheet "Tốc độ bốc hơi")');
      const ea = se.o('e_a', 'Áp suất hơi bão hòa', 4.7e-6 * Ta ** 4 + 0.000108 * Ta ** 3 + 0.0117 * Ta ** 2 + 0.3294 * Ta + 4.5667, 'mm Hg', 'Đa thức theo T', 'Penman', '0.0000047*[Ta]^4+0.000108*[Ta]^3+0.0117*[Ta]^2+0.3294*[Ta]+4.5667', 'ea');
      const RH = se.i('RH', 'Độ ẩm tương đối', p.lg_RH, '-', '', '', 'RH');
      const ed = se.o('e_d', 'Áp suất hơi thực tế', ea * RH, 'mm Hg', 'e_a·RH', '', '[ea]*[RH]', 'ed');
      const lat = se.i('L', 'Vĩ độ', p.lg_lat, 'độ', 'Bắc +, nam −', '', 'lat'), La = Math.abs(lat), nN = se.i('n/N', 'Chỉ số độ trong', p.lg_nN, '-', '', 'NASA SSE', 'nN');
      const Ra = se.o('R_a', 'Bức xạ mặt trời đến (tháng lạnh nhất)', lat >= 0 ? 2e-5 * La ** 3 - 0.0024 * La ** 2 - 0.1587 * La + 14.304 : 3e-5 * La ** 3 - 0.0039 * La ** 2 - 0.0692 * La + 13.443, 'mm/ngày', lat >= 0 ? 'Bắc bán cầu (tháng 12)' : 'Nam bán cầu (tháng 6)', 'Penman', lat >= 0 ? '0.00002*ABS([lat])^3-0.0024*ABS([lat])^2-0.1587*ABS([lat])+14.304' : '0.00003*ABS([lat])^3-0.0039*ABS([lat])^2-0.0692*ABS([lat])+13.443', 'Ra');
      const Ro = se.o('R_o', 'Bức xạ đi ra', 2e-9 * (273.15 + Ta) ** 4 * (0.56 - 0.09 * Math.sqrt(ed)) * (0.1 + 0.9 * nN), 'mm/ngày', 'σT⁴(0,56 − 0,09√e_d)(0,10 + 0,90·n/N)', 'Penman', '0.000000002*(273.15+[Ta])^4*(0.56-0.09*[ed]^0.5)*(0.1+0.9*[nN])', 'Ro');
      const Hn = se.o('H', 'Bức xạ thuần', 0.95 * Ra * (0.18 + 0.55 * nN) - Ro, 'mm/ngày', '0,95·R_a(0,18 + 0,55·n/N) − R_o', 'Penman', '0.95*[Ra]*(0.18+0.55*[nN])-[Ro]', 'Hn');
      const U = se.i('U', 'Tốc độ gió', p.lg_U, 'm/s', '', '', 'U');
      const Ea_ = se.o('E_a', 'Thành phần khí động', 0.35 * (0.5 + U * 86400 / 1609 / 100) * (ea - ed), 'mm/ngày', '0,35(0,5 + U[dặm/ngày]/100)(e_a − e_d)', 'Penman', '0.35*(0.5+([U]*3600*24/1609)/100)*([ea]-[ed])', 'Ea');
      const Dg = se.o('Δ/γ', 'Hệ số thực nghiệm', 0.0021 * Ta ** 2 + 0.0345 * Ta + 0.7102, '-', '0,0021T² + 0,0345T + 0,7102', 'Penman', '0.0021*[Ta]^2+0.0345*[Ta]+0.7102', 'Dg');
      const Eo = se.o('E₀', p.lg_Eloc > 0 ? 'Tốc độ bốc hơi (số đo địa phương)' : 'Tốc độ bốc hơi ước tính', p.lg_Eloc > 0 ? +p.lg_Eloc : (Dg * Hn + Ea_) / (Dg + 1), 'mm/ngày', p.lg_Eloc > 0 ? 'Nhập (tab 4)' : '(Δ/γ·H + E_a)/(Δ/γ + 1)', 'Penman', p.lg_Eloc > 0 ? String(+p.lg_Eloc) : '([Dg]*[Hn]+[Ea])/([Dg]+1)', 'Eo');
      const rain = se.o('P_ngày', 'Lượng mưa trung bình ngày', p.lg_rain / (lat >= 0 ? 31 : 30), 'mm/ngày', 'mưa tháng/31', '', `${p.lg_rain}/${lat >= 0 ? 31 : 30}`, 'rain');
      const Enet = se.o('E_ròng', 'Tốc độ bốc hơi ròng', Math.max(0, Eo - rain), 'mm/ngày', 'E₀ − P', 'Bảng tính mẫu', 'MAX(0,[Eo]-[rain])', 'Enet');
      const kT = 2.6 * Math.pow(1.19, Ta - 20);
      const trap = (V, Hh) => { const a = 3 * LW, b = -3 * Z * Hh * (1 + LW), c0 = 4 * Z * Z * Hh * Hh - 3 * V / Hh; const Wt = (-b + Math.sqrt(b * b - 4 * a * c0)) / (2 * a); return { W: Wt, L: LW * Wt, A: LW * Wt * Wt }; };
      const trapX = (Vx, Hx) => `((3*[Z]*${Hx}*(1+[LW])+((3*[Z]*${Hx}*(1+[LW]))^2-4*3*[LW]*(4*[Z]^2*${Hx}^2-3*${Vx}/${Hx}))^0.5)/(2*3*[LW]))`;
      const sg = u.sec('3. Hình học hồ chung');
      sg.i('L:W', 'Tỷ lệ L:W mặt hồ', LW, '-', '', 'Bảng tính mẫu', 'LW');
      sg.i('Z', 'Độ dốc mái trong (H:V)', Z, '-', '3:1', 'USEPA 2011', 'Z');
      sg.note('Thể tích hồ hình thang: V = [W·L + W_b·L_b + (W_b·L + W·L_b)/2]·H/3 với W = W_b + 2ZH, L = L_b + 2ZH; giải ngược W từ V: 3(L:W)W² − 3ZH(1 + L:W)W + 4Z²H² − 3V/H = 0.');
      const zones = [], units = [];
      let Sin = S0, Qin = Q, Ncur = N0, Atot = 0, Vall = 0, Van = 0, SinX = '[BOD]', NX = '[N0]';
      // hồ kỵ khí
      if (c.lagAn !== 'no') {
        const sa = u.sec('4. Hồ kỵ khí — sheet "Kỵ khí" (Mara & Pearson 1998; von Sperling 2007)');
        const Lv = sa.o('L_v', 'Tải trọng BOD thể tích thiết kế', Ta < 10 ? 0.1 : Ta < 20 ? 0.02 * Ta - 0.1 : Ta < 25 ? 0.01 * Ta + 0.1 : 0.35, 'kg/m³·ngđ', '< 10 °C: 0,1; 10 – 20: 0,02T − 0,1; 20 – 25: 0,01T + 0,1; > 25: 0,35', 'Mara 1998', 'IF([Ta]<10,0.1,IF([Ta]<20,0.02*[Ta]-0.1,IF([Ta]<25,0.01*[Ta]+0.1,0.35)))', 'Lvan');
        const Er = sa.o('E_BOD', 'Hiệu suất khử BOD', Ta < 10 ? 0.4 : Ta < 25 ? 0.4 + 0.02 * (Ta - 10) : 0.7, '-', '< 10 °C: 40 %; 10 – 25: 2T + 20 %; > 25: 70 %', 'Mara 1998', 'IF([Ta]<10,0.4,IF([Ta]<25,0.4+0.02*([Ta]-10),0.7))', 'Ean');
        const nA = sa.i('n', 'Số hồ kỵ khí (song song)', Math.max(1, Math.round(p.lg_nAn)), 'hồ', '≥ 2', 'USEPA 2011', 'nan');
        const Ha = sa.i('H', 'Chiều sâu hồ', p.lg_Han, 'm', '3 – 5', 'Mara 1998', 'Han');
        const Vlv = sa.o('V_Lv', 'Thể tích theo tải trọng', Q * S0 / 1000 / Lv, 'm³', 'Q·S₀/L_v', 'Bảng tính mẫu', '[Q]*[BOD]/1000/[Lvan]', 'VanL');
        const HRTm = sa.i('HRT_min', 'HRT tối thiểu', p.lg_HRTan, 'ngày', '≥ 1', 'Mara 1998', 'HRTan');
        Van = sa.o('V', 'Tổng thể tích hồ kỵ khí', Math.max(Vlv, Q * HRTm), 'm³', 'max(V_Lv; Q·HRT_min)', '', 'MAX([VanL],[Q]*[HRTan])', 'Van');
        const HRT = sa.o('HRT', 'Thời gian lưu', Van / Q, 'ngày', 'V/Q', '', '[Van]/[Q]', 'HRTa');
        const g = trap(Van / nA, Ha);
        sa.o('W', 'Chiều rộng mặt hồ', g.W, 'm', 'nghiệm phương trình bậc hai', 'Bảng tính mẫu', trapX('[Van]/[nan]', '[Han]'), 'Wan');
        sa.o('L', 'Chiều dài mặt hồ', g.L, 'm', '(L:W)·W', '', '[LW]*[Wan]', 'Lan');
        sa.o('A', 'Diện tích mặt mỗi hồ', g.A, 'm²', 'W·L', '', '[Wan]*[Lan]', 'Aan');
        Sin = sa.o('S_ra', 'BOD₅ ra hồ kỵ khí', S0 * (1 - Er), 'mg/L', 'S₀(1 − E)', '', '[BOD]*(1-[Ean])', 'San');
        Ncur = sa.o('N_ra', 'Coliform ra hồ kỵ khí', N0 / (1 + kT * HRT), 'MPN/100mL', 'N₀/(1 + k_T·HRT); k_T = 2,6·1,19^(T−20)', 'Marais; Mara 1998', '[N0]/(1+2.6*1.19^([Ta]-20)*[HRTa])', 'Nan');
        sa.note('Bảng tính gốc tính coliform hồ kỵ khí theo HRT tối thiểu (1 ngày) – phần mềm dùng HRT thực tế. Váng nổi trên hồ kỵ khí hạn chế bốc hơi nên không trừ bốc hơi (bảng tính mẫu).');
        Atot += nA * g.A; Vall += Van; SinX = '[San]'; NX = '[Nan]';
        zones.push({ name: 'HỒ KỴ KHÍ', len: g.L }); units.push([nA, g]);
      }
      // hồ tùy nghi
      const sf = u.sec(`${c.lagAn !== 'no' ? 5 : 4}. Hồ tùy nghi — sheet "Tùy nghi" (Mara 1998)`);
      const Ls = sf.o('L_s', 'Tải trọng BOD bề mặt thiết kế', 350 * Math.pow(1.107 - 0.002 * Ta, Ta - 25), 'kg/ha·ngđ', '350(1,107 − 0,002T)^(T−25)', 'Mara 1998', '350*(1.107-0.002*[Ta])^([Ta]-25)', 'Ls');
      sf.o('S_vào', 'BOD₅ vào hồ tùy nghi', Sin, 'mg/L', '', '', SinX, 'Sfi');
      const Af = sf.o('A_tổng', 'Tổng diện tích mặt hồ tùy nghi', Q * Sin / 1000 / Ls, 'ha', 'Q·S/L_s', 'Bảng tính mẫu', '[Q]*[Sfi]/1000/[Ls]', 'Af');
      const nF = Math.max(1, Math.round(p.lg_nFac)), nP = nF >= 3 ? 2 : 1, fP = nF === 1 ? 1 : p.lg_fPrim;
      sf.i('n', 'Số hồ tùy nghi', nF, 'hồ', '3 = 2 sơ cấp song song + 1 thứ cấp', 'USEPA 2011', 'nfa');
      sf.i('f_sơ cấp', 'Tỷ lệ diện tích sơ cấp', fP, '-', '', 'Bảng tính mẫu', 'fP');
      const Hf = sf.i('H', 'Chiều sâu hồ', p.lg_Hfac, 'm', '1,2 – 2,4', 'Mara 1998', 'Hf');
      const Ap = sf.o('A_sc', 'Diện tích mỗi hồ sơ cấp', Af * fP / nP, 'ha', 'A·f/n_sc', '', `[Af]*[fP]/${nP}`, 'Ap');
      const As = nF > 1 ? sf.o('A_tc', 'Diện tích hồ thứ cấp', Af - Ap * nP, 'ha', 'A − n_sc·A_sc', '', `[Af]-[Ap]*${nP}`, 'As') : 0;
      const box = (Aha, Hh) => { const Wt = Math.sqrt(Aha * 10000 / LW), Lt = LW * Wt, Wb = Math.max(0.1, Wt - 2 * Z * Hh), Lb = Math.max(0.1, Lt - 2 * Z * Hh); return { W: Wt, L: Lt, A: Wt * Lt, V: (Wt * Lt + Wb * Lb + (Wb * Lt + Wt * Lb) / 2) * Hh / 3 }; };
      const gp = box(Ap, Hf);
      sf.t2('Kích thước mặt hồ sơ cấp W × L', `${fx(gp.W)} × ${fx(gp.L)} m`, 'W = √(A/(L:W)); L = (L:W)·W', 'Bảng tính mẫu');
      const Vp = sf.o('V_sc', 'Thể tích các hồ sơ cấp', nP * gp.V, 'm³', 'n·[W·L + W_b·L_b + (W_b·L + W·L_b)/2]·H/3', 'Bảng tính mẫu', null, 'Vp');
      const Qp = sf.o('Q_sau sc', 'Lưu lượng sau hồ sơ cấp (trừ bốc hơi)', Q - nP * Ap * 10000 * Enet / 1000, 'm³/ngđ', 'Q − A·E_ròng', 'Bảng tính mẫu', `[Q]-${nP}*[Ap]*10000*[Enet]/1000`, 'Qp');
      const HRTp = sf.o('HRT_sc', 'HRT hồ sơ cấp', Vp / Q, 'ngày', 'V/Q', '', '[Vp]/[Q]', 'HRTp');
      sf.i('HRT_min', 'HRT tối thiểu hồ sơ cấp', p.lg_HRTfac, 'ngày', '', 'Bảng tính mẫu', 'HRTfm');
      sf.chk('HRT hồ sơ cấp ≥ HRT tối thiểu', HRTp >= p.lg_HRTfac - 1e-9, 'ĐẠT', 'Giảm tải trọng L_s (tăng diện tích) hoặc tăng chiều sâu', 'Bảng tính mẫu', true, '[HRTp]>=[HRTfm]');
      Ncur = sf.o('N_sc', 'Coliform ra hồ sơ cấp', Ncur / (1 + kT * HRTp), 'MPN/100mL', 'N/(1 + k_T·HRT)', 'Marais', `${NX}/(1+2.6*1.19^([Ta]-20)*[HRTp])`, 'Np'); NX = '[Np]';
      Qin = Qp; Atot += nP * gp.A; Vall += Vp; zones.push({ name: 'HỒ TÙY NGHI SƠ CẤP', len: gp.L }); units.push([nP, gp]);
      let AfacM2 = nP * gp.A;
      if (nF > 1) {
        const gs = box(As, Hf);
        sf.t2('Kích thước mặt hồ thứ cấp W × L', `${fx(gs.W)} × ${fx(gs.L)} m`, '', 'Bảng tính mẫu');
        const Vs = sf.o('V_tc', 'Thể tích hồ thứ cấp', gs.V, 'm³', '', 'Bảng tính mẫu', null, 'Vs');
        Qin = sf.o('Q_sau tc', 'Lưu lượng sau hồ thứ cấp', Qp - As * 10000 * Enet / 1000, 'm³/ngđ', '', 'Bảng tính mẫu', '[Qp]-[As]*10000*[Enet]/1000', 'Qs');
        const HRTs = sf.o('HRT_tc', 'HRT hồ thứ cấp', Vs / Q, 'ngày', '', '', '[Vs]/[Q]', 'HRTs');
        Ncur = sf.o('N_tc', 'Coliform ra hồ thứ cấp', Ncur / (1 + kT * HRTs), 'MPN/100mL', '', 'Marais', '[Np]/(1+2.6*1.19^([Ta]-20)*[HRTs])', 'Ns'); NX = '[Ns]';
        Atot += gs.A; Vall += Vs; AfacM2 += gs.A; zones.push({ name: 'HỒ TÙY NGHI THỨ CẤP', len: gs.L }); units.push([1, gs]);
      }
      sf.o('S_ra,lọc', 'BOD₅ ra (mẫu đã lọc tảo)', 0.1 * Sin, 'mg/L', '0,1·S', 'Mara 1998', '0.1*[Sfi]', 'Sff');
      const fB = sf.i('f_BOD', 'BOD ra chưa lọc / BOD vào', p.lg_fBOD, '-', '0,2 – 0,3', 'Mara 1998', 'fB');
      const BODe = sf.o('S_ra', 'BOD₅ ra (mẫu chưa lọc – có tảo)', fB * Sin, 'mg/L', 'f·S', 'Bảng tính mẫu', '[fB]*[Sfi]', 'BODe');
      const pH = sf.i('pH', 'pH nước hồ', p.lg_pH, '-', '7,5 – 8,5', '', 'pHl');
      const Ni = Math.max(0, TKN - p.Norg);
      const NeV = Ta <= 20 ? Ni / (1 + AfacM2 / Q * (0.0038 + 0.000134 * Ta) * Math.exp((1.041 + 0.044 * Ta) * (pH - 6.6))) : Ni / (1 + 5.035e-3 * AfacM2 / Q * Math.exp(1.54 * (pH - 6.6)));
      const Ne = sf.o('N_e', 'NH₄-N ra hồ tùy nghi', NeV, 'mg/L', Ta <= 20 ? 'Pano & Middlebrooks, T ≤ 20 °C' : 'C/[1 + 5,035·10⁻³(A/Q)·e^(1,540(pH − 6,6))], T > 20 °C', 'Pano & Middlebrooks 1982', null, 'Ne');
      // hồ hoàn thiện
      const nM = Math.max(0, Math.round(p.lg_nMat));
      if (nM > 0) {
        const sm = u.sec(`${c.lagAn !== 'no' ? 6 : 5}. Hồ hoàn thiện — sheet "Ao hoàn thiện"`);
        sm.o('Q_vào', 'Lưu lượng vào', Qin, 'm³/ngđ', '', '', nF > 1 ? '[Qs]' : '[Qp]', 'Qm');
        const HRTm = sm.i('HRT', 'HRT thiết kế tổng', p.lg_HRTmat, 'ngày', '', 'Bảng tính mẫu', 'HRTm');
        sm.i('n', 'Số hồ nối tiếp', nM, 'hồ', '≥ 2', 'Bảng tính mẫu', 'nm');
        const Hm = sm.i('H', 'Chiều sâu', p.lg_Hmat, 'm', '0,9 – 1,5', 'Mara 1998', 'Hm');
        const Vm = sm.o('V', 'Tổng thể tích', Qin * HRTm, 'm³', 'Q·HRT', 'Bảng tính mẫu', '[Qm]*[HRTm]', 'Vm');
        const g = trap(Vm / nM, Hm);
        sm.o('W', 'Chiều rộng mặt mỗi hồ', g.W, 'm', '', 'Bảng tính mẫu', trapX('[Vm]/[nm]', '[Hm]'), 'Wm');
        sm.o('L', 'Chiều dài mặt mỗi hồ', g.L, 'm', '', '', '[LW]*[Wm]', 'Lm');
        sm.o('A', 'Diện tích mặt mỗi hồ', g.A, 'm²', '', '', '[Wm]*[Lm]', 'Am');
        let NmX = NX;
        for (let i = 1; i <= nM; i++) { Ncur = sm.o('N_' + i, `Coliform ra hồ hoàn thiện ${i}`, Ncur / (1 + kT * HRTm / nM), 'MPN/100mL', 'N/(1 + k_T·HRT/n)', 'Marais', `${NmX}/(1+2.6*1.19^([Ta]-20)*[HRTm]/[nm])`, 'Nm' + i); NmX = '[Nm' + i + ']'; }
        NX = NmX;
        sm.note('Hồ hoàn thiện chủ yếu khử vi khuẩn: BOD ra ≈ BOD vào; bảng tính gốc tính hồ thứ hai bằng nhiệt độ ô trống (C23) – phần mềm dùng cùng nhiệt độ thiết kế.');
        Atot += nM * g.A; Vall += Vm; zones.push({ name: 'HỒ HOÀN THIỆN', len: g.L }); units.push([nM, g]);
      }
      const so = u.sec('Chất lượng nước ra & bùn tích lũy');
      so.o('N_ra', 'Coliform ra hệ hồ', Ncur, 'MPN/100mL', '', 'Marais', NX, 'Ncl');
      const tsse = so.i('TSS_e', 'TSS ra (tảo)', p.lg_TSSe, 'mg/L', '40 – 100', 'USEPA 2011', 'TSSe');
      so.o('sBOD_e', 'BOD hòa tan ra', Math.max(0, BODe - p.bod_tss * tsse), 'mg/L', 'S − f·TSS_e', '', `MAX(0,[BODe]-${p.bod_tss}*[TSSe])`, 'sBODe');
      so.o('NO₃_e', 'NO₃-N ra', 0.5, 'mg/L', 'Tảo hấp thụ; nitrat hóa yếu', 'Giả thiết', '0.5', 'NO3e');
      so.o('Alk_ra', 'Độ kiềm ra', Alk, 'mg/L CaCO₃', '≈ vào', '', '[Alk]', 'Alkout');
      const TPb = so.o('TP_e', 'TP ra', st4.TP * 0.7, 'mg/L', 'Khử 30 % (lắng, tảo)', 'Giả thiết – USEPA 2011: 20 – 40 %', '[TP]*0.7', 'TPbio');
      const slv = so.i('q_bùn', 'Tích lũy bùn', p.lg_sl, 'm³/1.000 m³', '≈ 0,04 m³/người·năm', 'Mara 1998', 'qsl');
      const PXT = so.o('P_X,TSS', 'Bùn tích lũy quy đổi trung bình (12 % DS)', slv * Q / 1000 * 1.1 * 120, 'kg DS/ngđ', 'q·Q·1,1·120', '', '[qsl]*[Q]/1000*1.1*120', 'PXTSS');
      so.o('P_X,VSS', 'Bùn theo VSS', 0.55 * PXT, 'kg VSS/ngđ', 'Bùn đã phân hủy một phần (VS 55 %)', '', '0.55*[PXTSS]', 'PXVSS');
      if (Van > 0) so.o('t_nạo vét', 'Chu kỳ nạo vét hồ kỵ khí (bùn đầy 1/3 thể tích)', Van / 3 / Math.max(1e-6, slv * Q / 1000 * 365), 'năm', 'V/3/(q·Q·365)', 'Mara 1998', '[Van]/3/([qsl]*[Q]/1000*365)', 'tds');
      so.o('R_bùn', 'Tuần hoàn bùn', 0, '-', '', '', '0', 'RAS');
      so.i('f_N', 'Hàm lượng N trong tảo / sinh khối ra', p.fN, 'gN/gVSS', '', 'PT (8-24)', 'fN');
      so.o('H_tl', 'Chiều sâu hồ tùy nghi (tính thủy lực)', p.lg_Hfac, 'm', '', '', '[Hf]', 'Hb');
      so.note('Bùn hồ được nạo vét định kỳ (2 – 5 năm hồ kỵ khí; 10 – 20 năm hồ tùy nghi) – dây chuyền xử lý bùn tính theo khối lượng trung bình năm (có thể dùng thiết bị khử nước di động). Đáy hồ phải chống thấm (đất sét đầm / màng HDPE).');
      so.o('A_hồ', 'Tổng diện tích mặt hồ', Atot, 'm²', '', '', null, 'Atot');
      so.o('V_hồ', 'Tổng thể tích hồ', Vall, 'm³', '', '', null, 'Vtot');
      if (L.TSS !== undefined && tsse > L.TSS) so.note(`TSS ra (tảo) ${fx(tsse)} mg/L > giới hạn ${fx(L.TSS)} mg/L – cần lọc tảo (lọc đá, lọc cát) hoặc hóa lý bậc 3 sau hồ.`);
      // hình học: các hồ xếp nối tiếp theo chiều dài
      const Bmax = Math.max(...units.map(([k, g]) => k * g.W + (k - 1) * 4));
      ub.geom = { type: 'rect', L: zones.reduce((a, z) => a + z.len, 0) + 4 * (zones.length - 1), B: Bmax, H: Math.max(p.lg_Hfac, c.lagAn !== 'no' ? p.lg_Han : 0) + 0.8, fb: 0.8, n: 1, zones, label: 'HỒ SINH HỌC' };
      u.V = Vall; u.A = Atot; u.n = units.reduce((a, [k]) => a + k, 0); u.H = p.lg_Hfac; u.hl = 0.5;
      u.dims = `${units.reduce((a, [k]) => a + k, 0)} hồ sinh học – ${fx(Atot / 10000, 2)} ha`;
      u.pondList = units.map(([k, g], i) => `${zones[i].name.toLowerCase()} ${k} × ${fx(g.W, 0)} × ${fx(g.L, 0)} m`).join('; ');
      so.t2('Bố trí các hồ', u.pondList, 'n × W × L mặt nước', '');
      u.hrt = `${fx(Vall / Q)} ngày`; u.kW = 0;
      R.equip.push({ u: u.name, name: 'Màng chống thấm HDPE 1,5 mm (đáy + mái hồ)', spec: `${fx(Atot * 1.15, 0)} m²`, qty: Math.ceil(Atot * 1.15), note: 'Đơn giá theo m²', unitPrice: 0.12 });
      R.equip.push({ u: u.name, name: 'Hộp chia dòng nhiều cửa ra + cửa xả có vách chặn váng', spec: `${zones.length} hồ/cụm hồ`, qty: zones.length, note: '', unitPrice: 60 });
      K = { Ne, sBODe: Math.max(0, BODe - p.bod_tss * tsse), nbsCOD: Math.max(0, ch.nbsCOD), PXTSS: PXT, PXVSS: 0.55 * PXT, NOx: 0.5, SRT: 0, MLSS: 0, bioOut: { NO3: '[NO3e]', TP: '[TPbio]', Alk: '[Alkout]' } };
      bioRes.NO3e = 0.5; bioRes.NO3den = 0; bioRes.TPe = TPb; bioRes.TSSe = tsse; bioRes.Coli = Ncur;
      bioRes.sludge = PXT; bioRes.sludgeX = '[bio.PXTSS]';
      bioRes.Vtot = Vall; bioRes.VtotX = '[bio.Vtot]'; bioRes.A = Atot;
    } else {
      /* ======== các công nghệ theo M&E ======== */
      const [SRT, MLSS0] = SRTMLSS;
      const isMBBR = bio === 'MBBR';
      /* Organica FCR / Biopolus MNR: màng bám trên module giá thể cố định → phương pháp sinh khối tương đương (IFAS) */
      const fxK = DATA.FIXED[bio];
      let MLSS = MLSS0, fixM = null;
      if (fxK) {
        const P_ = k => p[fxK + '_' + k];
        const mode = c.fixMode && c.fixMode !== 'auto' ? c.fixMode : (bio === 'ORG' ? 'hyb' : 'pure');
        const hyb = mode === 'hyb';
        const tn = bio === 'ORG' ? 'Organica FCR' : 'Biopolus MNR';
        const s0 = ub.sec(`0. Giá thể cố định & sinh khối tương đương — ${tn} (${hyb ? 'lai IFAS, có tuần hoàn bùn' : 'màng bám thuần, không tuần hoàn bùn'})`);
        s0.note(`Phương pháp: bể nhiều ngăn nối tiếp, sinh khối chủ yếu bám trên module giá thể cố định (${bio === 'ORG' ? 'rễ cây + biofiber Organica' : 'rễ nhân tạo ARP Biopolus'}). Thể tích vùng hiếu khí tính theo khối bùn cần lưu cho SRT thiết kế (M&E PT 8-20, 8-21) chia cho sinh khối tương đương X_tđ = X_lơ lửng + φ·X_bám (cách tiếp cận IFAS, M&E Ch.9). Thông số mặc định hiệu chỉnh theo dự án Organica Cam Ranh 2.200 m³/ngđ, BV Cần Thơ 500 m³/ngđ và thiết kế đối chứng STOWA 2018-45 – cần nhà cung cấp xác nhận bằng mô phỏng.`);
        const Xatt = s0.i('X_bám', 'Sinh khối bám trên module (theo thể tích module)', P_('Xatt'), 'kg TSS/m³', bio === 'ORG' ? 'Organica: 8 – 15 kg/m³' : 'Biopolus: 8 – 18 kg/m³', bio === 'ORG' ? 'Organica TD' : 'Biopolus', 'Xatt');
        const phi = s0.i('φ', 'Tỷ lệ thể tích module / thể tích ngăn có giá thể', P_('phi'), '-', bio === 'ORG' ? '0,5 – 0,7' : 'STOWA: 0,515 – 0,534', bio === 'ORG' ? 'Organica TD' : 'STOWA 2018-45', 'phi');
        const Xsus = s0.i('X_ll', hyb ? 'MLSS lơ lửng (chế độ lai)' : 'TSS lơ lửng (màng bám thuần)', hyb ? P_('Xsh') : P_('Xsp'), 'mg/L', hyb ? 'Duy trì bằng tuần hoàn bùn' : 'Bùn bong tróc, không tuần hoàn', 'STOWA 2018-45', 'Xsus');
        MLSS = s0.o('X_tđ', 'Sinh khối tương đương ngăn có giá thể', Xsus + phi * Xatt * 1000, 'mg/L', 'X_tđ = X_ll + φ·X_bám', 'M&E Ch.9 (IFAS)', '[Xsus]+[phi]*[Xatt]*1000', 'Xeq');
        s0.chk('X_tđ trong khoảng nhà cung cấp 6.000 – 15.000 mg/L', MLSS >= 6000 && MLSS <= 15000, 'ĐẠT', 'NGOÀI KHOẢNG – xem lại φ, X_bám', 'Organica TD; Biopolus', true, 'AND([Xeq]>=6000,[Xeq]<=15000)');
        fixM = { hyb, Xsus, P_, tn };
        ub.fixed = { hyb, Xsus, mode };
      }
      K = bioCommon(ub, SRT, MLSS, isMBBR ? { srtName: 'SRT tương đương (tính bùn & oxy)', srtNote: 'MBBR – sinh khối bám dính', noSRTcheck: true } : fxK ? { srtName: 'SRT tương đương thiết kế', srtNote: 'Sinh khối bám dính – tuổi bùn dài', mlssX: '[Xeq]' } : {});
      const u = ub;
      const sr = u.sec('8. Tuần hoàn bùn');
      const SVI = sr.i('SVI', 'Chỉ số thể tích bùn', p.SVI, 'mL/g', '', 'M&E mục 8-10', 'SVI');
      const XR = sr.o('X_R', 'Nồng độ bùn tuần hoàn', bio === 'MBR' ? MLSS * 1.25 : 1e6 / SVI, 'mg/L', bio === 'MBR' ? 'Bể màng ≈ 1,25·MLSS' : 'X_R ≈ 10⁶/SVI', 'M&E mục 8-10', bio === 'MBR' ? '1.25*[MLSS]' : '1000000/[SVI]', 'XR');
      RAS = sr.o('R', 'Tỷ lệ tuần hoàn bùn', (bio === 'SBR' || isMBBR || (fixM && !fixM.hyb)) ? 0 : bio === 'MBR' ? 4 : fixM ? fixM.Xsus / (XR - fixM.Xsus) : MLSS / (XR - MLSS), '-', bio === 'MBR' ? 'Tuần hoàn bể màng → thiếu khí (3 – 5)' : (bio === 'SBR' || isMBBR || (fixM && !fixM.hyb)) ? 'Không tuần hoàn' : fixM ? 'R = X_ll/(X_R − X_ll) – chỉ phần lơ lửng' : 'R = X/(X_R − X)', 'M&E VD 8-11', (bio === 'SBR' || isMBBR || (fixM && !fixM.hyb)) ? '0' : bio === 'MBR' ? '4' : fixM ? '[Xsus]/([XR]-[Xsus])' : '[MLSS]/([XR]-[MLSS])', 'RAS');
      let Vtot = K.Vaer, zones = [], nU = 2, H = 5, B = 12, NO3e = K.NOx, NO3den = 0, NO3denBio = 0, carbon = { M: 0, sl: 0 };
      let VtotX = '[Vaer]', NO3eX = '[NOx]', NO3denX = '0', NO3denBioX = '0';

      function preAnoxic(sx, SDNR20, tmin, tmax, IRmax, xv) {
        const XV = xv ? sx.o('X_VSS,tk', 'Sinh khối hoạt động ngăn thiếu khí', xv.v, 'mg VSS/L', xv.f, '', xv.x, 'XVan') : K.XVSS, XVx = xv ? '[XVan]' : '[XVSS]';
        sx.i('IR_max', 'Tỷ lệ tuần hoàn nội tối đa', IRmax, '-', 'M&E tr.809', 'M&E tr.809', 'IRmax');
        const IRr = Math.max(0, K.NOx / K.NO3t - 1 - RAS);
        const IR = sx.o('IR', 'Tỷ lệ tuần hoàn nội áp dụng', Math.min(IRmax, IRr), '-', 'IR = min(NOx/N_e − 1 − R; IR_max)', 'PT (8-62)', 'MIN([IRmax],MAX(0,[NOx]/[NO3t]-1-[RAS]))', 'IR');
        if (IRr > IRmax) sx.note(`IR yêu cầu ${fx(IRr)} vượt ${IRmax} → giới hạn; NO₃-N ra tăng (cân nhắc Bardenpho 4 bậc / thiếu khí sau).`);
        const NO3IR = sx.o('NO₃-N_IR', 'NO₃-N ra theo cân bằng tuần hoàn', K.NOx / (1 + IR + RAS), 'mg/L', 'NOx/(1 + IR + R)', 'PT (8-61)', '[NOx]/(1+[IR]+[RAS])', 'NO3IR');
        const Qir = sx.o('Q_IR', 'Lưu lượng tuần hoàn nội', IR * Q, 'm³/ngđ', '', '', '[IR]*[Q]', 'Qir');
        const NOr = sx.o('NO_r,yc', 'Nitrat phải khử', Q * (K.NOx - NO3IR) / 1000, 'kg N/ngđ', 'Q·(NOx − NO₃_IR)', '', '[Q]*([NOx]-[NO3IR])/1000', 'NOr');
        sx.i('SDNR₂₀', 'SDNR ở 20 °C', SDNR20, 'g/g·d', 'Thí nghiệm mẻ; M&E tr.803: 0,04 – 0,42', 'M&E tr.803', 'SDNR20');
        const sd = sx.o('SDNR_T', 'SDNR ở T', SDNR20 * Math.pow(1.026, T - 20), 'g/g·d', 'θ = 1,026', 'M&E tr.808', '[SDNR20]*1.026^([info.T]-20)', 'SDNRT');
        const treq = sx.o('τ_tk,yc', 'τ thiếu khí yêu cầu', NOr * 1000 / (sd * XV) / Q * 24, 'h', 'τ = NO_r/(SDNR·MLVSS)/Q', 'PT (8-52)', `[NOr]*1000/([SDNRT]*${XVx})/[Q]*24`, 'treq');
        sx.i('τ_min', 'τ thiếu khí tối thiểu', tmin, 'h', '', 'Bảng 8-29', 'tmin'); sx.i('τ_max', 'τ thiếu khí tối đa (vượt → carbon ngoài)', tmax, 'h', '', '', 'tmax');
        const tuse = sx.o('τ_tk', 'τ thiếu khí áp dụng', clamp(treq, tmin, tmax), 'h', 'giới hạn [τ_min; τ_max]', 'Bảng 8-29', 'MAX([tmin],MIN([tmax],[treq]))', 'tuse');
        const Van = sx.o('V_tk', 'Thể tích thiếu khí', Q * tuse / 24, 'm³', 'Q·τ/24', '', '[Q]*[tuse]/24', 'Van');
        const cap = sx.o('NO_r,kn', 'Khả năng khử nitrat', Van * sd * XV / 1000, 'kg N/ngđ', 'V·SDNR·MLVSS', 'PT (8-52)', `[Van]*[SDNRT]*${XVx}/1000`, 'capA');
        const bNeed = sx.o('bCOD_cần', 'bCOD cần cho khử nitrat', K.gCODN * (K.NOx - NO3IR), 'mg/L', 'g bCOD/g N·ΔNO₃', 'PT (8-65), (8-68)', '[gCODN]*([NOx]-[NO3IR])', 'bNeed');
        sx.o('tỷ lệ', 'bCOD dùng cho khử N / bCOD vào', bNeed / K.S0, '-', 'ngưỡng 0,6', 'Quy ước', '[bNeed]/[S0]', 'bRat');
        const defN = sx.o('ΔN_thiếu', 'Thiếu hụt khử nitrat theo SDNR', Math.max(0, NOr - cap), 'kg N/ngđ', '', '', 'MAX(0,[NOr]-[capA])', 'defN');
        const defC = sx.o('ΔCOD_thiếu', 'Thiếu carbon nội tại', Math.max(0, bNeed - 0.6 * K.S0) * Q / 1000, 'kg COD/ngđ', 'max(0; bCOD_cần − 0,6·bCOD)·Q', '', 'MAX(0,[bNeed]-0.6*[S0])*[Q]/1000', 'defC');
        sx.chk('Năng lực vùng thiếu khí & carbon nội tại', defN <= 1e-6 && defC <= 1e-6, 'ĐẠT', 'THIẾU — ' + (c.carbon === 'auto' ? 'bổ sung carbon ngoài (tự động)' : 'tăng τ_tk hoặc bổ sung carbon'), '', c.carbon === 'auto', 'AND([defN]<=0.000001,[defC]<=0.000001)');
        let den = Math.min(NOr, cap), useC = false;
        if (((defN > 1e-6 || defC > 1e-6) || p.meoh_set > 0) && c.carbon === 'auto') { carbon = extCarbon(sx, defN, '[defN]', defC, '[defC]'); den = NOr; useC = true; }
        const NO3out = sx.o('NO₃-N_e', 'NO₃-N ra', Math.max(NO3IR, K.NOx - den * 1000 / Q), 'mg/L', 'max(NO₃_IR; NOx − NO_r khử/Q)', '', useC ? 'MAX([NO3IR],[NOx]-[NOr]*1000/[Q])' : 'MAX([NO3IR],[NOx]-MIN([NOr],[capA])*1000/[Q])', 'NO3o');
        sx.o('NO₃_dn', 'NO₃-N được khử', K.NOx - NO3out, 'mg/L', '', '', '[NOx]-[NO3o]', 'NO3dn');
        sx.o('NO₃_dn,SH', 'NO₃-N khử bằng carbon nội tại', Math.min(NOr, cap) * 1000 / Q, 'mg/L', '', '', 'MIN([NOr],[capA])*1000/[Q]', 'NO3dnB');
        NO3denBio = Math.min(NOr, cap) * 1000 / Q;
        return { IR, Qir, Van, NO3out, den: K.NOx - NO3out };
      }

      if (bio === 'CAS') {
        const s = u.sec('9. Kích thước bể Aeroten — M&E mục 8-6');
        nU = s.i('n', 'Số bể', p.cas_n, 'bể', '', '', 'nU'); H = s.i('H', 'Chiều sâu', p.cas_H, 'm', '', 'M&E VD 8-3: 4,9 m', 'Hb'); B = s.i('B', 'Chiều rộng 1 bể (0 = tự động)', p.cas_B, 'm', '', '', 'Bin');
        const tau = s.o('τ', 'Thời gian lưu', Vtot / Q * 24, 'h', '', 'Bảng 8-19: 3 – 6 h', '[Vaer]/[Q]*24', 'tau');
        if (+p.autoFit !== 0 && K.SRT > 15) {
          // R08: SRT > 15 ngày → chế độ sục khí kéo dài (M&E Bảng 8-19: SRT 20 – 40 ngày, τ 20 – 30 h, MLSS 2 000 – 5 000 mg/L)
          s.t2('Chế độ vận hành', 'Sục khí kéo dài (SRT ' + fx(K.SRT) + ' > 15 ngày)', 'Quy tắc R08', 'M&E Bảng 8-19');
          s.chk('τ theo Bảng 8-19 – sục khí kéo dài 20 – 30 h', tau >= 20 - 1e-9 && tau <= 30 + 1e-9, 'ĐẠT', 'NGOÀI KHOẢNG – MLSS đã ở biên 2 000 – 5 000 mg/L', 'Bảng 8-19', true, 'AND([tau]>=20,[tau]<=30)');
        } else s.chk('τ theo Bảng 8-19 (3 – 6 h CMAS; > 6 h là sục khí kéo dài)', tau >= 3 && tau <= 6, 'ĐẠT', 'NGOÀI KHOẢNG CMAS (vận hành như sục khí kéo dài)', 'Bảng 8-19', true, 'AND([tau]>=3,[tau]<=6)');
        zones = [{ name: 'HIẾU KHÍ', f: 1 }];
        s.note('CAS chỉ nitrat hóa, không khử nitơ — NO₃-N ra bằng NOx.');
        s.o('NO₃_dn', 'NO₃-N được khử', 0, 'mg/L', 'Không có vùng thiếu khí', '', '0', 'NO3dn');
        s.o('NO₃-N_e', 'NO₃-N ra', K.NOx, 'mg/L', '= NOx', '', '[NOx]', 'NO3o');
        NO3eX = '[NO3o]'; NO3denX = '[NO3dn]'; NO3denBioX = '[NO3dn]';
      } else if (bio === 'AO' || bio === 'MBR') {
        const isMBR = bio === 'MBR';
        const sx = u.sec('9. Tuần hoàn nội & vùng thiếu khí — PT (8-51), (8-52), (8-61), (8-62)');
        const r = preAnoxic(sx, isMBR ? p.mbr_SDNR : p.ao_SDNR, isMBR ? 1 : p.ao_tanox, isMBR ? p.mbr_tanox_max : p.ao_tanox_max, isMBR ? 6 : p.ao_IRmax);
        NO3e = r.NO3out; NO3den = r.den; u.IR = r.IR; u.Qir = r.Qir;
        NO3eX = '[NO3o]'; NO3denX = '[NO3dn]'; NO3denBioX = '[NO3dnB]';
        let Vmem = 0;
        if (isMBR) {
          const sm = u.sec('10. Bể màng MBR — M&E mục 8-9');
          const J = sm.i('J', 'Thông lượng trung bình (net)', p.mbr_flux, 'L/m²·h', '15 – 25', 'M&E mục 8-9', 'J');
          sm.i('J_đỉnh', 'Thông lượng đỉnh cho phép', p.mbr_fluxp, 'L/m²·h', '', '', 'Jp');
          sm.o('Q_đỉnh', 'Lưu lượng đỉnh qua màng', Qpk_eff, 'm³/h', '', '', QpkRef, 'Qpkm');
          const Am = sm.o('A_màng', 'Diện tích màng yêu cầu', Math.max(Qh * 1000 / J, Qpk_eff * 1000 / p.mbr_fluxp), 'm²', 'max(Q_h/J; Q_đỉnh/J_đỉnh)', 'M&E mục 8-9', 'MAX([info.Qh]*1000/[J],[Qpkm]*1000/[Jp])', 'Am');
          sm.i('ρ_màng', 'Mật độ màng trong bể', p.mbr_pack, 'm²/m³', '', '', 'pack');
          Vmem = sm.o('V_màng', 'Thể tích bể màng', Am / p.mbr_pack, 'm³', 'A/mật độ', '', '[Am]/[pack]', 'Vmem');
          sm.i('SADm', 'Khí sục rửa màng riêng', p.mbr_SAD, 'Nm³/m²·h', '', '', 'SADm');
          const SAD = sm.o('Q_rửa', 'Khí sục rửa màng', Am * p.mbr_SAD / 60, 'm³/phút', 'SADm·A/60', '', '[Am]*[SADm]/60', 'mbrSAD');
          sm.i('H_hút', 'Cột áp bơm hút màng', p.mbr_TMP, 'm', '', '', 'TMP');
          const Pp = sm.o('N_bơm hút', 'Công suất bơm hút màng', 9.81 * Qh / 3600 * p.mbr_TMP / 0.65 * 1.3, 'kW', 'ρgQH/η·1,3 (rửa ngược)', '', '9.81*[info.Qh]/3600*[TMP]/0.65*1.3', 'Ppm');
          u.mbr = { Am, Vmem, SAD, Pp };
          R.equip.push({ u: u.name, name: 'Module màng MBR (sợi rỗng/tấm phẳng)', spec: `Tổng ${fx(Am)} m²; J = ${J} LMH`, qty: Math.ceil(Am / 1500), note: 'cassette ≈ 1.500 m²', spare: 'membrane' });
          R.equip.push({ u: u.name, name: 'Bơm hút màng (permeate)', spec: `${fx(Qpk_eff / p.mbr_n)} m³/h × ${p.mbr_TMP} m`, qty: p.mbr_n + 1, note: '' });
          R.chem.push({ name: 'NaOCl – rửa màng CIP (ước tính)', dose: 0, kg: Am * 0.005, unit: 'kg', price: 'p_NaOCl', note: 'Theo nhà cung cấp màng' });
          VtotX = '[Van]+[Vaer]+[Vmem]';
        } else VtotX = '[Van]+[Vaer]';
        Vtot = r.Van + K.Vaer + Vmem;
        const s = u.sec((isMBR ? '11' : '10') + '. Tổng hợp cụm ' + (isMBR ? 'AO-MBR' : 'AO'));
        s.o('V_tổng', 'Tổng thể tích', Vtot, 'm³', 'V_tk + V_hk' + (isMBR ? ' + V_màng' : ''), '', VtotX, 'Vtot');
        s.o('τ', 'Tổng thời gian lưu', Vtot / Q * 24, 'h', '', '', '[Vtot]/[Q]*24', 'tau');
        s.o('SRT_hệ', 'SRT toàn hệ', SRT * Vtot / K.Vaer, 'ngày', 'SRT·V_tổng/V_hk', 'M&E mục 8-7', '[SRT]*[Vtot]/[Vaer]', 'SRTs');
        nU = s.i('n', 'Số đơn nguyên', isMBR ? p.mbr_n : p.ao_n, 'đơn nguyên', '', '', 'nU'); H = s.i('H', 'Chiều sâu', isMBR ? p.mbr_H : p.ao_H, 'm', '', '', 'Hb'); B = s.i('B', 'Chiều rộng (0 = tự động)', isMBR ? p.mbr_B : p.ao_B, 'm', '', '', 'Bin');
        zones = [{ name: 'THIẾU KHÍ', f: r.Van / Vtot }, { name: 'HIẾU KHÍ', f: K.Vaer / Vtot }];
        if (isMBR) zones.push({ name: 'BỂ MÀNG', f: Vmem / Vtot });
        u.mixkW = r.Van / 1000 * 5; VtotX = '[Vtot]';
      } else if (bio === 'AAO') {
        const sx = u.sec('9. Vùng thiếu khí — PT (8-51), (8-52), (8-62)');
        const r = preAnoxic(sx, p.aao_SDNR, p.aao_tanox, p.aao_tanox_max, p.ao_IRmax);
        NO3e = r.NO3out; NO3den = r.den; u.IR = r.IR; u.Qir = r.Qir;
        NO3eX = '[NO3o]'; NO3denX = '[NO3dn]'; NO3denBioX = '[NO3dnB]';
        const sa = u.sec('10. Vùng kỵ khí & khử P sinh học EBPR — M&E mục 8-8, VD 8-13');
        const tana = sa.i('τ_kk', 'τ kỵ khí', p.aao_tana, 'h', '0,5 – 1,5', 'Bảng 8-29', 'tana');
        const Vana = sa.o('V_kk', 'Thể tích kỵ khí', Q * tana / 24, 'm³', 'Q·τ/24', '', '[Q]*[tana]/24', 'Vana');
        const rbUsed = sa.o('rbCOD_NO₃', 'rbCOD tiêu thụ bởi NO₃ theo RAS', 5.2 * RAS * Q * NO3e / 1000, 'kg/ngđ', '5,2·R·Q·NO₃', 'VD 8-13', '5.2*[RAS]*[Q]*[NO3o]/1000', 'rbU');
        const rbIn = sa.o('rbCOD_vào', 'rbCOD vào vùng kỵ khí', Q * K.rbCOD / 1000, 'kg/ngđ', '', 'VD 8-13', '[Q]*[rbCOD]/1000', 'rbIn');
        const rbAv = sa.o('rbCOD_kd', 'rbCOD khả dụng cho PAO', Math.max(0, rbIn - rbUsed), 'kg/ngđ', '', 'VD 8-13', 'MAX(0,[rbIn]-[rbU])', 'rbAv');
        sa.i('rbCOD:P', 'Tỷ lệ rbCOD:P', p.aao_rbP, 'g/g', '', 'Bảng 8-30', 'rbP');
        const dPE = sa.o('ΔP_EBPR', 'P khử nhờ EBPR', rbAv * 1000 / p.aao_rbP / Q, 'mg/L', 'rbCOD_kd/(rbCOD:P)/Q', 'Bảng 8-30', '[rbAv]*1000/[rbP]/[Q]', 'dPE');
        u.dPE = dPE;
        Vtot = Vana + r.Van + K.Vaer;
        const s = u.sec('11. Tổng hợp cụm A²O');
        s.o('V_tổng', 'Tổng thể tích', Vtot, 'm³', 'V_kk + V_tk + V_hk', '', '[Vana]+[Van]+[Vaer]', 'Vtot'); s.o('τ', 'Tổng thời gian lưu', Vtot / Q * 24, 'h', '', 'Bảng 8-29', '[Vtot]/[Q]*24', 'tau');
        s.o('SRT_hệ', 'SRT toàn hệ', SRT * Vtot / K.Vaer, 'ngày', 'SRT·V_tổng/V_hk (cùng định nghĩa AO)', 'M&E mục 8-7', '[SRT]*[Vtot]/[Vaer]', 'SRTs');
        nU = s.i('n', 'Số đơn nguyên', p.aao_n, 'đơn nguyên', '', '', 'nU'); H = s.i('H', 'Chiều sâu', p.aao_H, 'm', '', '', 'Hb'); B = s.i('B', 'Chiều rộng (0 = tự động)', p.aao_B, 'm', '', '', 'Bin');
        zones = [{ name: 'KỴ KHÍ', f: Vana / Vtot }, { name: 'THIẾU KHÍ', f: r.Van / Vtot }, { name: 'HIẾU KHÍ', f: K.Vaer / Vtot }];
        u.mixkW = (Vana + r.Van) / 1000 * 5; VtotX = '[Vtot]';
      } else if (bio === 'SBR') {
        const s = u.sec('9. Chu kỳ & thể tích SBR — M&E Bảng 8-16, 8-17, PT (8-50)');
        nU = s.i('n', 'Số bể', p.sbr_n, 'bể', '≥ 2', 'Bảng 8-17', 'nU');
        s.i('t_nạp', 'Nạp (khuấy)', p.sbr_fill, 'h', '', 'Bảng 8-16', 'tfill'); s.i('t_sục', 'Sục khí', p.sbr_react, 'h', '2 – 4', 'M&E tr.773', 'treact');
        s.i('t_lắng', 'Lắng', p.sbr_settle, 'h', '', 'Bảng 8-16', 'tsettle'); s.i('t_xả', 'Xả nước', p.sbr_decant, 'h', '', '', 'tdec'); s.i('t_chờ', 'Chờ', p.sbr_idle, 'h', '', '', 'tidle');
        const tc = s.o('t_ck', 'Thời gian chu kỳ', p.sbr_fill + p.sbr_react + p.sbr_settle + p.sbr_decant + p.sbr_idle, 'h', 'Σ pha', 'Bảng 8-17', '[tfill]+[treact]+[tsettle]+[tdec]+[tidle]', 'tc');
        const ncy = s.o('n_ck', 'Tổng số chu kỳ toàn trạm / ngày', 24 / tc * nU, 'chu kỳ', '24/t_ck·n', '', '24/[tc]*[nU]', 'ncy');
        const Vf = s.o('V_nạp', 'Thể tích nạp / chu kỳ', Q / ncy, 'm³', 'Q/n_ck', 'Bảng 8-17 bước 4', '[Q]/[ncy]', 'Vf');
        const FVT = s.o('F(V_T)', 'Phần thể tích khối bùn lắng', MLSS * p.SVI / 1e6, '-', 'MLSS·SVI/10⁶', 'PT (8-50)', '[MLSS]*[SVI]/1000000', 'FVT');
        const VF = s.i('V_F/V_T', 'Phân suất nạp', p.sbr_VF, '-', '≤ 0,25 – 0,3', 'Hình 8-21', 'VF');
        s.chk('Phân suất nạp ≤ 1 − F(V_T) − 0,1', VF <= 1 - FVT - 0.1, 'ĐẠT', 'GIẢM phân suất nạp hoặc MLSS', 'Hình 8-21', false, '[VF]<=1-[FVT]-0.1');
        s.chk('Phân suất nạp ở lưu lượng đỉnh', hasEQ || VF * I.kmax <= 1 - FVT - 0.1, 'ĐẠT', 'KHÔNG ĐẠT ở Q_max – tăng số bể / bố trí điều hòa', 'PT (8-50)', false, hasEQ ? 'TRUE' : '[VF]*[info.kmax]<=1-[FVT]-0.1');
        fAer = s.o('f_sục', 'Phân suất thời gian sục khí', p.sbr_react / tc, '-', 't_sục/t_ck', '', '[treact]/[tc]', 'fAer');
        const VT1 = Vf / VF, VT2 = K.Vaer / fAer / nU;
        const VT = s.o('V_T', 'Thể tích 1 bể', Math.max(VT1, VT2), 'm³', 'max(V_nạp/phân suất; V_hk/(n·f_sục))', 'Bảng 8-17 bước 5', 'MAX([Vf]/[VF],[Vaer]/[fAer]/[nU])', 'VT');
        H = s.i('H', 'Chiều sâu nước cao nhất', p.sbr_H, 'm', '', '', 'Hb');
        s.i('L/B', 'Tỷ lệ L/B', p.sbr_LW, '-', '', '', 'LWs');
        B = s.o('B', 'Chiều rộng 1 bể', ceilTo(Math.sqrt(VT / H / p.sbr_LW), 0.5), 'm', '√(V/H/(L/B))', '', 'CEILING(SQRT([VT]/[Hb]/[LWs]),0.5)', 'Bs');
        const Lb = s.o('L', 'Chiều dài 1 bể', ceilTo(VT / H / B, 0.5), 'm', '', '', 'CEILING([VT]/[Hb]/[Bs],0.5)', 'Ls');
        Vtot = s.o('V_tổng', 'Tổng thể tích', B * Lb * H * nU, 'm³', 'B·L·H·n', '', '[Bs]*[Ls]*[Hb]*[nU]', 'Vtot');
        s.o('τ', 'Thời gian lưu danh nghĩa', Vtot / Q * 24, 'h', '', 'Bảng 8-19: 15 – 40 h', '[Vtot]/[Q]*24', 'tau');
        s.o('SRT_hệ', 'SRT toàn hệ (khối bùn cả bể / bùn xả)', SRT * Vtot / K.Vaer, 'ngày', 'SRT_hk·V_tổng/V_hk – tương đương MCRT bể mẻ', 'M&E mục 8-7', '[SRT]*[Vtot]/[Vaer]', 'SRTs');
        const hx = s.o('h_xả', 'Chiều sâu lớp xả', H * VF, 'm', 'H·V_F/V_T', '', '[Hb]*[VF]', 'hx');
        const nOver = Math.max(1, Math.ceil(nU * p.sbr_decant / tc - 1e-9));
        s.o('n_xả', 'Số bể xả đồng thời', nOver, 'bể', '', '', 'MAX(1,ROUNDUP([nU]*[tdec]/[tc],0))', 'nOver');
        Qdec = s.o('Q_xả', 'Lưu lượng decanter (đỉnh)', Vf / p.sbr_decant * nOver, 'm³/h', 'V_nạp/t_xả·n', 'Bảng 8-17 bước 10', '[Vf]/[tdec]*[nOver]', 'Qdec');
        const sx = u.sec('10. Khử nitrat trong pha nạp có khuấy — M&E VD 8-9');
        sx.i('SDNR₂₀', 'SDNR pha nạp', p.sbr_SDNR, 'g/g·d', '', 'M&E tr.803', 'SDNR20');
        const sd = sx.o('SDNR_T', 'SDNR ở T', p.sbr_SDNR * Math.pow(1.026, T - 20), 'g/g·d', 'θ = 1,026', '', '[SDNR20]*1.026^([info.T]-20)', 'SDNRT');
        const XVSSs = sx.o('X_VSS', 'MLVSS', K.XVSS, 'mg/L', '', '', '[XVSS]', 'XVSSs');
        const cap = sx.o('NO_r', 'Nitrat khử được', Vtot * sd * XVSSs / 1000 * p.sbr_fill / tc, 'kg/ngđ', 'V·SDNR·MLVSS·(t_nạp/t_ck)', 'PT (8-52)', '[Vtot]*[SDNRT]*[XVSSs]/1000*[tfill]/[tc]', 'capS');
        const req = sx.o('NO_r,yc', 'Nitrat phải khử', Q * Math.max(0, K.NOx - K.NO3t) / 1000, 'kg/ngđ', 'Q·(NOx − NO₃_t)', '', '[Q]*MAX(0,[NOx]-[NO3t])/1000', 'reqS');
        const def = sx.o('ΔN_thiếu', 'Thiếu hụt', Math.max(0, req - cap), 'kg/ngđ', '', '', 'MAX(0,[reqS]-[capS])', 'defN');
        sx.chk('Năng lực khử nitrat', def <= 1e-6, 'ĐẠT', c.carbon === 'auto' ? 'THIẾU — bổ sung carbon ngoài (tự động)' : 'THIẾU — kéo dài t_nạp', '', c.carbon === 'auto', '[defN]<=0.000001');
        let useC = false;
        if ((def > 1e-6 || p.meoh_set > 0) && c.carbon === 'auto') { carbon = extCarbon(sx, def, '[defN]'); useC = true; }
        NO3denBio = Math.min(req, cap) * 1000 / Q;
        NO3e = sx.o('NO₃-N_e', 'NO₃-N ra', Math.max(2, K.NOx - (useC ? req : Math.min(req, cap)) * 1000 / Q), 'mg/L', 'max(2; NOx − NO_r/Q)', '', useC ? 'MAX(2,[NOx]-[reqS]*1000/[Q])' : 'MAX(2,[NOx]-MIN([reqS],[capS])*1000/[Q])', 'NO3o');
        NO3den = sx.o('NO₃_dn', 'NO₃-N được khử', K.NOx - NO3e, 'mg/L', '', '', '[NOx]-[NO3o]', 'NO3dn');
        sx.o('NO₃_dn,SH', 'NO₃-N khử bằng carbon nội tại', NO3denBio, 'mg/L', '', '', 'MIN([reqS],[capS])*1000/[Q]', 'NO3dnB');
        NO3eX = '[NO3o]'; NO3denX = '[NO3dn]'; NO3denBioX = '[NO3dnB]';
        u.sbr = { VT, B, Lb, H, VF, hx, tc, nOver };
        u.mixkW = Vtot / 1000 * 5; u.mixH = p.sbr_fill / tc * 24;
        R.equip.push({ u: u.name, name: 'Decanter', spec: `${fx(Vf / p.sbr_decant)} m³/h; 1,5 kW`, qty: nU, note: '', spare: 'decanter' });
        R.equip.push({ u: u.name, name: 'Máy khuấy chìm (pha nạp)', spec: `${fx(Vtot / nU / 1000 * 5 / 2)} kW/máy`, qty: 2 * nU, note: '' });
        R.equip.push({ u: u.name, name: 'Bơm bùn dư', spec: '4 kW', qty: nU, note: '' });
        u.geom = { type: 'rect', L: Lb, B, H: H + p.fb, fb: p.fb, n: nU, zones: [{ name: 'SBR', len: Lb }], label: 'SBR', batch: true, TWL: H, BWL: H * (1 - VF) };
        u.batch = { TWL: H, BWL: H * (1 - VF) };
        VtotX = '[Vtot]';
      } else if (bio === 'OD') {
        const s = u.sec('9. Phân chia vùng & khử nitrat — PT (8-66)…(8-68), giải lặp');
        const NOr = s.o('NO_r,yc', 'Nitrat phải khử', Q * Math.max(0, K.NOx - K.NO3t) / 1000, 'kg/ngđ', 'Q·(NOx − NO₃_t)', '', '[Q]*MAX(0,[NOx]-[NO3t])/1000', 'NOr');
        s.i('f_min', 'Phân suất thiếu khí tối thiểu', p.od_ftk, '-', '', 'M&E mục 8-7', 'fmin'); s.i('f_max', 'Phân suất thiếu khí tối đa', p.od_ftk_max, '-', '', '', 'fmax');
        let f = p.od_ftk, SRTs = SRT, SDNRb = 0, prev = '[SRT]';
        for (let it = 1; it <= 4; it++) {
          // PT (8-67): A_n = 1 − 1,42·Y_H + 1,42·b_H·Y_H·SRT/(1 + b_H·SRT) – chỉ số hạng cuối chia (1 + b·SRT) (M&E 5th tr.836, VD 8-11: A_n = 0,82)
          const An = 1 - 1.42 * p.YH + 1.42 * kin.bH_T * p.YH * SRTs / (1 + kin.bH_T * SRTs), Yn = p.YH / (1 + kin.bH_T * SRTs);
          SDNRb = s.o(`SDNR_b⁽${it}⁾`, `Tốc độ khử nitrat riêng – vòng ${it}`, 0.175 * An / (Yn * SRTs), 'g/g·d', 'SDNR_b = 0,175·A_n/(Y_net·SRT); A_n = 1 − 1,42Y + 1,42·b·Y·SRT/(1 + b·SRT)', 'PT (8-66), (8-67), (8-68)', `0.175*(1-1.42*[YH]+1.42*[bHT]*[YH]*${prev}/(1+[bHT]*${prev}))/(([YH]/(1+[bHT]*${prev}))*${prev})`, 'SDNRb' + it);
          const z = NOr * 1000 / (K.Vaer * SDNRb * K.XH);
          f = s.o(`f⁽${it}⁾`, `Phân suất thiếu khí – vòng ${it}`, clamp(z / (1 + z), p.od_ftk, p.od_ftk_max), '-', 'f = z/(1+z); z = NO_r/(V_hk·SDNR_b·X_H)', '', `MAX([fmin],MIN([fmax],([NOr]*1000/([Vaer]*[SDNRb${it}]*[XH]))/(1+[NOr]*1000/([Vaer]*[SDNRb${it}]*[XH]))))`, 'f' + it);
          SRTs = s.o(`SRT⁽${it}⁾`, `SRT toàn hệ – vòng ${it}`, SRT / (1 - f), 'ngày', 'SRT/(1 − f)', '', `[SRT]/(1-[f${it}])`, 'SRTs' + it);
          prev = `[SRTs${it}]`;
        }
        Vtot = s.o('V_tổng', 'Tổng thể tích mương', K.Vaer / (1 - f), 'm³', 'V_hk/(1 − f)', '', '[Vaer]/(1-[f4])', 'Vtot');
        const cap = s.o('NO_r', 'Nitrat khử được', Vtot * f * SDNRb * K.XH / 1000, 'kg/ngđ', 'V·f·SDNR_b·X_H', 'PT (8-52)', '[Vtot]*[f4]*[SDNRb4]*[XH]/1000', 'capO');
        const def = s.o('ΔN_thiếu', 'Thiếu hụt', Math.max(0, NOr - cap), 'kg/ngđ', '', '', 'MAX(0,[NOr]-[capO])', 'defN');
        s.chk('Năng lực khử nitrat', def <= 1e-6, 'ĐẠT', c.carbon === 'auto' ? 'THIẾU — bổ sung carbon ngoài (tự động)' : 'THIẾU — tăng f_tk', '', c.carbon === 'auto', '[defN]<=0.000001');
        let useC = false;
        if ((def > 1e-6 || p.meoh_set > 0) && c.carbon === 'auto') { carbon = extCarbon(s, def, '[defN]'); useC = true; }
        NO3denBio = Math.min(NOr, cap) * 1000 / Q;
        NO3e = s.o('NO₃-N_e', 'NO₃-N ra', Math.max(K.NO3t, K.NOx - (useC ? NOr : Math.min(NOr, cap)) * 1000 / Q), 'mg/L', '', '', useC ? 'MAX([NO3t],[NOx]-[NOr]*1000/[Q])' : 'MAX([NO3t],[NOx]-MIN([NOr],[capO])*1000/[Q])', 'NO3o');
        NO3den = s.o('NO₃_dn', 'NO₃-N được khử', K.NOx - NO3e, 'mg/L', '', '', '[NOx]-[NO3o]', 'NO3dn');
        s.o('NO₃_dn,SH', 'NO₃-N khử bằng carbon nội tại', NO3denBio, 'mg/L', '', '', 'MIN([NOr],[capO])*1000/[Q]', 'NO3dnB');
        NO3eX = '[NO3o]'; NO3denX = '[NO3dn]'; NO3denBioX = '[NO3dnB]';
        s.o('τ', 'Thời gian lưu', Vtot / Q * 24, 'h', '', 'Bảng 8-19: 15 – 30 h', '[Vtot]/[Q]*24', 'tau');
        const sg = u.sec('10. Hình học mương');
        nU = sg.i('n', 'Số mương', p.od_n, 'mương', '', '', 'nU'); H = sg.i('H', 'Chiều sâu', p.od_H, 'm', '3 – 4,5', '', 'Hb'); B = sg.i('B', 'Chiều rộng 1 nhánh', p.od_B, 'm', '', '', 'Bin');
        const Lloop = sg.o('L_vòng', 'Chiều dài tim dòng 1 mương', Vtot / (nU * B * H), 'm', 'L = V/(n·B·H)', '', '[Vtot]/([nU]*[Bin]*[Hb])', 'Lloop');
        const rc = (B + p.wall) / 2;
        const Ls = sg.o('L_thẳng', 'Chiều dài đoạn thẳng', Math.max(B, (Lloop - 2 * PI * (rc + B / 2)) / 2), 'm', '(L − 2π·r_tim)/2', '', `MAX([Bin],([Lloop]-2*PI()*(([Bin]+${p.wall})/2+[Bin]/2))/2)`, 'Ls');
        sg.i('v', 'Vận tốc dòng vòng', p.od_v, 'm/s', '0,25 – 0,35', '', 'vv');
        const Qv = sg.o('Q_vòng/Q', 'Bội số tuần hoàn nội tại', p.od_v * B * H * 86400 / (Q / nU), 'lần', '', 'M&E tr.793', '[vv]*[Bin]*[Hb]*86400/([Q]/[nU])', 'Qv');
        sg.chk('Bội số tuần hoàn ≥ 20', Qv >= 20, 'ĐẠT', 'Tăng vận tốc / mặt cắt', '', true, '[Qv]>=20');
        u.geom = { type: 'race', Ls: ceilTo(Ls, 0.5), Wc: B, H: H + p.fb, fb: p.fb, n: nU, label: 'MƯƠNG OXY HÓA' };
        u.mixkW = Vtot / 1000 * 3; VtotX = '[Vtot]';
        R.equip.push({ u: u.name, name: 'Máy khuấy tạo dòng (propeller)', spec: `${fx(Vtot / 1000 * 3 / (2 * nU))} kW/máy`, qty: 2 * nU, note: '' });
      } else if (isMBBR) {
        const s = u.sec('9. Bể MBBR hiếu khí (BOD + nitrat hóa) — M&E Ch.9');
        const SSA = s.i('SSA', 'Diện tích riêng giá thể', p.mbbr_SSA, 'm²/m³', '', 'Catalogue', 'SSA');
        const fill = s.i('f', 'Tỷ lệ nạp giá thể', p.mbbr_fill, '-', '≤ 0,67', 'M&E Ch.9', 'fill');
        const sBOD = s.i('SALR_BOD', 'Tải trọng BOD bề mặt', p.mbbr_SALR_BOD, 'g/m²·d', '', 'M&E Ch.9', 'SALRb');
        s.i('SALR_N,20', 'Tốc độ nitrat hóa 20 °C', p.mbbr_SALR_N, 'g/m²·d', '', 'M&E Ch.9', 'SALRn20');
        const sN = s.o('SALR_N,T', 'Tốc độ nitrat hóa ở T', p.mbbr_SALR_N * Math.pow(1.058, T - 20), 'g/m²·d', '·1,058^(T−20)', 'M&E Ch.9', '[SALRn20]*1.058^([info.T]-20)', 'SALRn');
        const A1 = s.o('A_BOD', 'Diện tích giá thể giai đoạn BOD', Q * K.BOD / sBOD, 'm²', 'Q·BOD/SALR', '', '[Q]*[BOD]/[SALRb]', 'A1');
        const A2 = s.o('A_N', 'Diện tích giá thể nitrat hóa', Q * K.NOx / sN, 'm²', 'Q·NOx/SALR_N', '', '[Q]*[NOx]/[SALRn]', 'A2');
        const Vaer = s.o('V_hk', 'Thể tích bể hiếu khí', (A1 + A2) / SSA / fill, 'm³', 'A/(SSA·f)', '', '([A1]+[A2])/[SSA]/[fill]', 'VaerM');
        const sx = u.sec('10. Bể MBBR thiếu khí (tiền khử nitrat)');
        sx.i('IR_max', 'Tuần hoàn nội tối đa', p.mbbr_IRmax, '-', '', '', 'IRmax');
        const IR = sx.o('IR', 'Tuần hoàn nội', Math.min(p.mbbr_IRmax, Math.max(0, K.NOx / K.NO3t - 1)), '-', 'min(NOx/N_e − 1; IR_max)', 'PT (8-62)', 'MIN([IRmax],MAX(0,[NOx]/[NO3t]-1))', 'IR');
        const NO3IR = sx.o('NO₃_IR', 'NO₃-N ra', K.NOx / (1 + IR), 'mg/L', 'NOx/(1 + IR)', 'PT (8-61)', '[NOx]/(1+[IR])', 'NO3o');
        const NOr = sx.o('NO_r', 'Nitrat phải khử', Q * (K.NOx - NO3IR) / 1000, 'kg/ngđ', '', '', '[Q]*([NOx]-[NO3o])/1000', 'NOr');
        sx.i('SALR_DN', 'Tốc độ khử nitrat bề mặt 20 °C', p.mbbr_SALR_DN, 'g/m²·d', '', 'M&E Ch.9', 'SALRdn');
        const Adn = sx.o('A_DN', 'Diện tích giá thể thiếu khí', NOr * 1000 / (p.mbbr_SALR_DN * Math.pow(1.08, T - 20)), 'm²', 'NO_r/(SALR_DN·1,08^(T−20))', 'M&E Ch.9', '[NOr]*1000/([SALRdn]*1.08^([info.T]-20))', 'Adn');
        const Van = sx.o('V_tk', 'Thể tích bể thiếu khí', Adn / SSA / fill, 'm³', '', '', '[Adn]/[SSA]/[fill]', 'Van');
        const bNeed = sx.o('bCOD_cần', 'bCOD cần cho khử nitrat', K.gCODN * (K.NOx - NO3IR), 'mg/L', '', 'PT (8-65)', '[gCODN]*([NOx]-[NO3o])', 'bNeed');
        const defC = sx.o('ΔCOD_thiếu', 'Thiếu carbon nội tại', Math.max(0, bNeed - 0.6 * K.S0) * Q / 1000, 'kg COD/ngđ', '', '', 'MAX(0,[bNeed]-0.6*[S0])*[Q]/1000', 'defC');
        if ((defC > 0 || p.meoh_set > 0) && c.carbon === 'auto') carbon = extCarbon(sx, 0, '0', defC, '[defC]');
        NO3e = NO3IR; NO3den = K.NOx - NO3e; NO3denBio = defC > 0 && c.carbon === 'auto' ? NO3den * 0.6 : NO3den;
        sx.o('NO₃_dn', 'NO₃-N được khử', NO3den, 'mg/L', '', '', '[NOx]-[NO3o]', 'NO3dn');
        sx.o('NO₃_dn,SH', 'NO₃-N khử bằng carbon nội tại', NO3denBio, 'mg/L', '', '', defC > 0 && c.carbon === 'auto' ? '0.6*[NO3dn]' : '[NO3dn]', 'NO3dnB');
        NO3eX = '[NO3o]'; NO3denX = '[NO3dn]'; NO3denBioX = '[NO3dnB]';
        u.IR = IR; u.Qir = IR * Q;
        Vtot = Van + Vaer; K.Vaer = Vaer;
        const Vmedia = sx.o('V_giá thể', 'Tổng thể tích giá thể', (A1 + A2 + Adn) / SSA, 'm³', '', '', '([A1]+[A2]+[Adn])/[SSA]', 'Vmedia');
        const sg = u.sec('11. Tổng hợp cụm MBBR');
        sg.o('V_tổng', 'Tổng thể tích', Vtot, 'm³', '', '', '[Van]+[VaerM]', 'Vtot'); sg.o('τ', 'Thời gian lưu', Vtot / Q * 24, 'h', '', '', '[Vtot]/[Q]*24', 'tau');
        nU = sg.i('n', 'Số dây chuyền', p.mbbr_n, 'dây chuyền', '', '', 'nU'); H = sg.i('H', 'Chiều sâu', p.mbbr_H, 'm', '', '', 'Hb'); B = sg.i('B', 'Chiều rộng (0 = tự động)', p.mbbr_B, 'm', '', '', 'Bin');
        zones = [{ name: 'MBBR THIẾU KHÍ', f: Van / Vtot }, { name: 'MBBR HIẾU KHÍ', f: Vaer / Vtot }];
        u.media = Vmedia; u.mixkW = Van / 1000 * 8; VtotX = '[Vtot]';
        R.equip.push({ u: u.name, name: 'Giá thể MBBR (m³)', spec: `SSA ${SSA} m²/m³`, qty: Math.ceil(Vmedia), note: 'm³', spare: 'media' });
        R.equip.push({ u: u.name, name: 'Lưới chắn giá thể cửa ra', spec: 'SS316', qty: nU * 2, note: '' });
      } else if (fxK) {
        const { hyb, Xsus, P_, tn } = fixM;
        const anMedia = !(bio === 'ORG' && hyb);   // Organica lai: giá thể chỉ ở ngăn hiếu khí (STOWA 2018-45)
        const sx = u.sec('9. Ngăn thiếu khí & tuần hoàn nội — PT (8-51), (8-52), (8-61), (8-62)');
        const r = preAnoxic(sx, P_('SDNR'), P_('tanox'), P_('tanox_max'), P_('IRmax'), anMedia ? null : { v: Xsus * K.XVSS / MLSS, x: '[Xsus]*[XVSS]/[MLSS]', f: 'Không có giá thể: chỉ phần lơ lửng X_ll·VSS/TSS' });
        NO3e = r.NO3out; NO3den = r.den; u.IR = r.IR; u.Qir = r.Qir;
        NO3eX = '[NO3o]'; NO3denX = '[NO3dn]'; NO3denBioX = '[NO3dnB]';
        if (bio === 'BIOP') sx.note('Biopolus: chia ~15 – 20 % dòng vào ngăn thiếu khí thứ 2 (step-feed) để phân phối carbon, giảm lưu lượng tuần hoàn nội (STOWA 2018-45: IR ≈ 1,1 – 1,4 Q).');
        const sm = u.sec('10. Module giá thể & thể tích cụm ' + tn + ' — 2 tiêu chí: SRT (sinh khối tương đương) và tải trọng BOD trên module');
        const mL = sm.i('L_m', 'Module – dài', P_('modL'), 'm', '', bio === 'ORG' ? 'Bảng tính Bắc Giang 2019' : 'Báo giá GETECH 2019', 'mL');
        const mB = sm.i('B_m', 'Module – rộng', P_('modB'), 'm', '', '', 'mB');
        const mH = sm.i('H_m', 'Module – cao', P_('modH'), 'm', '', '', 'mH');
        const mA = sm.i('A_m', 'Diện tích bề mặt / module', P_('modA'), 'm²', bio === 'ORG' ? 'Biofiber' : 'Theo nhà cung cấp (500 m²/m³)', '', 'mA');
        const Vm = sm.o('V_m', 'Thể tích 1 module', mL * mB * mH, 'm³', 'L·B·H', '', '[mL]*[mB]*[mH]', 'Vm');
        const V1 = sm.o('V_gt,SRT', 'Thể tích ngăn có giá thể theo SRT', anMedia ? r.Van + K.Vaer : K.Vaer, 'm³', anMedia ? 'V_tk + V_hk(SRT)' : 'V_hk(SRT) – ngăn thiếu khí không có giá thể', 'M&E PT (8-20), (8-21)', anMedia ? '[Van]+[Vaer]' : '[Vaer]', 'V1');
        sm.i('B_m,20', 'Tải trọng BOD trên thể tích module ở 20 °C', P_('Bm'), 'kgBOD/m³·d', bio === 'ORG' ? 'Cam Ranh 1,18 @25 °C; STOWA 0,49 @10 °C → 0,88 @20 °C' : 'STOWA 0,65 @8 °C → 1,3 @20 °C (ngoại suy)', bio === 'ORG' ? 'Organica TD; STOWA 2018-45' : 'STOWA 2018-45', 'Bm20');
        const BmT = sm.o('B_m,T', 'Tải trọng BOD trên module ở T', P_('Bm') * Math.pow(1.06, T - 20), 'kgBOD/m³·d', 'B_m,20·1,06^(T−20)', 'θ hiệu chỉnh theo 2 dự án đối chứng', '[Bm20]*1.06^([info.T]-20)', 'BmT');
        const V2 = sm.o('V_gt,tải', 'Thể tích ngăn có giá thể theo tải trọng module', Q * K.BOD / 1000 / BmT / P_('phi'), 'm³', 'Q·BOD/(B_m,T·φ)', '', '[Q]*[BOD]/1000/[BmT]/[phi]', 'V2');
        const Vmz = sm.o('V_gt', 'Thể tích ngăn có giá thể thiết kế', Math.max(V1, V2), 'm³', 'max(theo SRT; theo tải trọng)', '', 'MAX([V1],[V2])', 'Vmz');
        sm.t2('Tiêu chí khống chế', V2 > V1 ? 'Tải trọng BOD trên module' : 'SRT – sinh khối tương đương', '', '');
        const VaerD = sm.o('V_hk,tk', 'Thể tích hiếu khí thiết kế', anMedia ? Math.max(K.Vaer, Vmz - r.Van) : Vmz, 'm³', anMedia ? 'max(V_hk; V_gt − V_tk)' : '= V_gt', '', anMedia ? 'MAX([Vaer],[Vmz]-[Van])' : '[Vmz]', 'VaerD');
        sm.o('SRT_tt', 'SRT thực tế tương ứng', SRT * VaerD / K.Vaer, 'ngày', 'SRT·V_hk,tk/V_hk', '', '[SRT]*[VaerD]/[Vaer]', 'SRTact');
        const nmod = sm.o('n_m', 'Số module giá thể', Math.ceil(P_('phi') * Vmz / Vm - 1e-9), 'module', 'n = φ·V_gt/V_m', '', 'ROUNDUP([phi]*[Vmz]/[Vm],0)', 'nmod');
        const Amed = sm.o('A_gt', 'Tổng diện tích bề mặt giá thể', nmod * mA, 'm²', 'n·A_m', '', '[nmod]*[mA]', 'Amed');
        sm.o('a_r', 'Diện tích giá thể / m³ ngăn có giá thể', Amed / Vmz, 'm²/m³', bio === 'ORG' ? 'Cam Ranh 13,6; Cần Thơ 19,8; STOWA 18,1' : '', bio === 'ORG' ? 'Organica TD' : '', '[Amed]/[Vmz]', 'ar');
        sm.o('SALR_BOD', 'Tải trọng BOD trên bề mặt giá thể', Q * K.BOD / Amed, 'gBOD/m²·d', 'Q·BOD/A_gt', bio === 'ORG' ? 'Cam Ranh 44,6 @25 °C; STOWA 18,7 @10 °C' : '', '[Q]*[BOD]/[Amed]', 'SALR');
        sm.o('SALR_N', 'Tải trọng N nitrat hóa trên bề mặt giá thể', Q * K.NOx / Amed, 'gN/m²·d', 'Q·NOx/A_gt', '', '[Q]*[NOx]/[Amed]', 'SALRN');
        K.Vaer = VaerD;
        Vtot = r.Van + VaerD;
        sm.o('V_tổng', 'Tổng thể tích cụm', Vtot, 'm³', 'V_tk + V_hk,tk', '', '[Van]+[VaerD]', 'Vtot');
        sm.o('τ', 'Tổng thời gian lưu', Vtot / Q * 24, 'h', 'Cam Ranh 7,3 h; Cần Thơ 11,8 h', 'Organica TD', '[Vtot]/[Q]*24', 'tau');
        nU = sm.i('n', 'Số dây chuyền', P_('n'), 'dây chuyền', '', '', 'nU');
        H = sm.i('H', 'Chiều sâu nước', P_('H'), 'm', '', bio === 'ORG' ? 'Organica TD: 5 m' : 'STOWA: 6 m', 'Hb');
        sm.chk('Chiều sâu nước ≥ chiều cao module + 0,8 m (ống khí đáy + lớp nước trên)', H >= mH + 0.8 - 1e-9, 'ĐẠT', 'KHÔNG ĐẠT – tăng H hoặc giảm chiều cao module', '', false, '[Hb]>=[mH]+0.8-0.000000001');
        const nz = sm.i('n_ngăn', 'Số ngăn nối tiếp mỗi dây chuyền', P_('nz'), 'ngăn', '', '', 'nz');
        const zA = sm.o('n_tk', 'Số ngăn thiếu khí', Math.max(1, Math.round(nz * r.Van / Vtot)), 'ngăn', 'làm tròn n·V_tk/V', '', 'MAX(1,ROUND([nz]*[Van]/[Vtot],0))', 'zA');
        sm.o('n_hk', 'Số ngăn hiếu khí', nz - zA, 'ngăn', '', '', '[nz]-[zA]', 'zH');
        B = 0;
        zones = [{ name: `THIẾU KHÍ (${zA} ngăn)`, f: r.Van / Vtot, media: anMedia }, { name: `HIẾU KHÍ + GIÁ THỂ (${nz - zA} ngăn)`, f: VaerD / Vtot, media: true }];
        u.mixkW = r.Van / 1000 * 8; VtotX = '[Vtot]'; u.fixMod = { nmod, Amed, Vm, mL, mH, phi: P_('phi') };
        R.equip.push({ u: u.name, name: bio === 'ORG' ? 'Module giá thể biofiber Organica' : 'Module giá thể ARP Biopolus', spec: `${fx(mL)} × ${fx(mB)} × ${fx(mH)} m; ${fx(mA)} m²/module`, qty: nmod, note: 'Giá thể cố định, tuổi thọ ~30 năm', unitPrice: bio === 'ORG' ? p.c_orgmod : p.c_bpmod });
        if (bio === 'ORG') sm.note('Organica: mặt bể phủ giàn cây (plant racks) – rễ cây làm giá thể lớp trên 0,5 – 1 m, biofiber ở lớp dưới; thường có nhà kính che phủ. Cần Thơ: 1,8 m² giàn cây/ngăn.');
        else sm.note('Biopolus: ngăn thiếu khí dùng ARP Model 2, ngăn hiếu khí ARP Model 1; có thể phủ cây/biofilter trên mặt ngăn thiếu khí để khử mùi.');
        if (!hyb) sm.note('Màng bám thuần: không tuần hoàn bùn; tách pha bằng bể lắng (SOR ≈ 30 m³/m²·ngđ) hoặc lọc đĩa/lọc trống trực tiếp theo nhà cung cấp.');
      }
      if (!u.geom) {
        const s = u.secs[u.secs.length - 1];
        const Bauto = !(B > 0);
        if (Bauto) B = s.o('B', 'Chiều rộng 1 đơn nguyên (tự động, L ≈ 4B)', ceilTo(Math.sqrt(Vtot / (nU * H) / 4), 0.5), 'm', 'B = √(V/(n·H)/4)', '', `CEILING(SQRT(${VtotX}/([nU]*[Hb])/4),0.5)`, 'Bu');
        else s.o('B', 'Chiều rộng 1 đơn nguyên', B, 'm', '', '', '[Bin]', 'Bu');
        const Lb = s.o('L', 'Chiều dài 1 đơn nguyên', ceilTo(Vtot / (nU * B * H), 0.5), 'm', 'L = V/(n·B·H), làm tròn 0,5 m', '', `CEILING(${VtotX}/([nU]*[Bu]*[Hb]),0.5)`, 'Lu');
        const zs = zones.map(z => ({ name: z.name, len: z.f * Lb, media: z.media }));
        u.geom = { type: 'rect', L: Lb, B, H: H + p.fb, fb: p.fb, n: nU, zones: zs, label: DATA.BIO_SHORT[bio] };
      }
      // oxy & cấp khí
      if (bio === 'OD') aerationME(u, K, NO3denBioX, NO3denBio, { surface: true, title: '11. Nhu cầu oxy & guồng khí' });
      else if (isMBBR) aerationME(u, K, NO3denBioX, NO3denBio, { SOTE: p.mbbr_SOTE, alpha: 0.6, title: '12. Nhu cầu oxy & cấp khí' });
      else if (fxK) aerationME(u, K, NO3denBioX, NO3denBio, { alpha: fixM.P_('alpha'), title: '11. Nhu cầu oxy & cấp khí' });
      else if (bio === 'MBR') aerationME(u, K, NO3denBioX, NO3denBio, { alpha: 0.5, extraAir: u.mbr.SAD, title: '12. Nhu cầu oxy & cấp khí' });
      else aerationME(u, K, NO3denBioX, NO3denBio, { fAer, title: 'Nhu cầu oxy & cấp khí' });
      alkalinity(u, K.NOx, '[NOx]', NO3den, NO3denX, '');
      // bùn dư
      {
        const s = u.sec('Bùn dư');
        s.o('P_X', 'Bùn sinh học dư (kể carbon ngoài)', K.PXTSS + carbon.sl, 'kg TSS/ngđ', '', '', carbon.sl ? '[PXTSS]+[Xext]' : '[PXTSS]', 'PXout');
        if (!isMBBR && !(fixM && !fixM.hyb)) s.o('Q_w', 'Lưu lượng bùn dư', (K.PXTSS + carbon.sl) * 1000 / XR, 'm³/ngđ', 'P_X/X_R', 'M&E VD 8-3', '[PXout]*1000/[XR]', 'Qw');
        if (RAS > 0) { s.o('Q_R', 'Lưu lượng tuần hoàn bùn', RAS * Q, 'm³/ngđ', '', '', '[RAS]*[Q]', 'QR'); R.equip.push({ u: u.name, name: 'Bơm tuần hoàn bùn (RAS)', spec: `${fx(RAS * Qh / nU)} m³/h × 6 m`, qty: nU + 1, note: '' }); }
        if (u.Qir) R.equip.push({ u: u.name, name: 'Bơm tuần hoàn nội (IR)', spec: `${fx(u.Qir / 24 / nU)} m³/h × 1,5 m`, qty: nU + 1, note: 'Bơm hướng trục' });
        if (u.mixkW && bio !== 'SBR' && bio !== 'OD') R.equip.push({ u: u.name, name: 'Máy khuấy chìm vùng thiếu khí / kỵ khí', spec: `${fx(u.mixkW / (2 * nU))} kW/máy`, qty: 2 * nU, note: '' });
      }
      const sp = u.sec('Photpho sau cụm sinh học');
      sp.i('f_P', 'Hàm lượng P trong sinh khối thường', p.fP, 'gP/gVSS', '', 'M&E VD 8-13', 'fPb');
      let TPb = sp.o('TP_tổng hợp', 'TP sau tổng hợp sinh khối', Math.max(0, st4.TP - p.fP * K.PXVSS * 1000 / Q), 'mg/L', 'TP − f_P·P_X,VSS/Q', 'M&E VD 8-13', 'MAX(0,[TP]-[fPb]*[PXVSS]*1000/[Q])', 'TPs');
      if (bio === 'AAO') TPb = sp.o('TP_e', 'TP ra sau EBPR', Math.max(0.3, TPb - u.dPE), 'mg/L', 'max(0,3; TP − ΔP_EBPR)', 'Bảng 8-30', 'MAX(0.3,[TPs]-[dPE])', 'TPbio');
      else sp.o('TP_e', 'TP ra', TPb, 'mg/L', '', '', '[TPs]', 'TPbio');
      bioRes.NO3e = NO3e; bioRes.NO3den = NO3den; bioRes.TPe = TPb;
      bioRes.sludge = K.PXTSS + carbon.sl; bioRes.sludgeX = '[bio.PXout]';
      bioRes.Vtot = Vtot;
      const g = u.geom;
      u.dims = g.type === 'race' ? `${g.n} mương; nhánh ${fx(g.Wc)} m; đoạn thẳng ${fx(g.Ls)} m; H ${fx(H)} m` : `${g.n} × (${fx(g.B)} × ${fx(g.L)} × ${fx(H)} m)`;
      u.hrt = `${fx(Vtot / Q * 24)} h`; u.n = nU; u.H = H;
      K.bioOut = { NO3: NO3eX, TP: '[TPbio]', Alk: '[Alkout]' };
    }
    ub.V = bioRes.Vtot; ub.A = bioRes.A || footprintArea(ub.geom);
    ub.K = K; ub.RAS = RAS;

    /* ---------- Khử P hóa học đồng thời ---------- */
    const TPtarget = L.TP !== undefined ? L.TP * p.tp_margin : null;
    let simulSludge = 0;
    const pacSet = p.pacSim_set > 0 && c.chemPos !== 'post';
    if ((TPtarget !== null && bioRes.TPe > TPtarget && c.chemP === 'auto' && c.chemPos !== 'post') || pacSet) {
      const s = ub.sec('Khử P hóa học đồng thời (châm PAC vào bể sinh học) — M&E mục 6-4');
      const TPt = TPtarget !== null ? TPtarget : bioRes.TPe;
      if (TPtarget !== null) {
        s.i('k_TP', 'Hệ số TP mục tiêu', p.tp_margin, '× giới hạn', '', '', 'tpm');
        s.o('TP_mt', 'TP mục tiêu', TPtarget, 'mg/L', 'TP_gh × k', '', '[info.L_TP]*[tpm]', 'TPt');
      }
      const dP = s.o('ΔP', 'Lượng P cần khử bổ sung', Math.max(0, bioRes.TPe - TPt), 'mg/L', 'TP_sinh học − TP mục tiêu', '', TPtarget !== null ? `MAX(0,${K.bioOut.TP}-[TPt])` : '0', 'dPs');
      s.i('Al:P', 'Tỷ lệ mol Al/P', p.AlP, 'mol/mol', '', 'M&E mục 6-4', 'AlPs'); s.i('%Al₂O₃', 'Al₂O₃ trong PAC', p.PAC_al, 'kg/kg', '', '', 'pals');
      let MAl, MPAC, dPr = dP, dPrX = '[dPs]';
      if (!pacSet) {
        MAl = s.o('M_Al', 'Al cần', p.AlP * dP / 31 * 27 * Q / 1000, 'kg Al/ngđ', '(Al:P)·ΔP/31·27·Q', 'M&E mục 6-4', '[AlPs]*[dPs]/31*27*[info.Q]/1000', 'MAls');
        MPAC = s.o('M_PAC', 'PAC tương đương', MAl / (p.PAC_al * 54 / 102), 'kg/ngđ', 'M_Al/(%Al₂O₃·54/102)', '', '[MAls]/([pals]*54/102)', 'MPACs');
      } else {
        // liều chọn tùy ý (tab 4): P kết tủa theo Al châm và tỷ lệ Al:P
        s.o('C_PAC,yc', 'Liều PAC theo khử P', p.AlP * dP / 31 * 27 / (p.PAC_al * 54 / 102), 'mg/L', '(Al:P)·ΔP/31·27/(%Al₂O₃·54/102)', 'M&E mục 6-4', '[AlPs]*[dPs]/31*27/([pals]*54/102)', 'cPACr');
        s.i('C_PAC,chọn', 'Liều PAC chọn (tùy chọn)', p.pacSim_set, 'mg/L', '', 'Lựa chọn vận hành', 'cPACs');
        MPAC = s.o('M_PAC', 'PAC tiêu thụ', p.pacSim_set * Q / 1000, 'kg/ngđ', 'M = C·Q/1000', '', '[cPACs]*[info.Q]/1000', 'MPACs');
        MAl = s.o('M_Al', 'Al³⁺ châm vào', MPAC * p.PAC_al * 54 / 102, 'kg Al/ngđ', 'M·%Al₂O₃·54/102', '', '[MPACs]*[pals]*54/102', 'MAls');
        dPr = s.o('ΔP_kt', 'P kết tủa theo liều chọn', Math.min(MAl / p.AlP / 27 * 31 / Q * 1000, Math.max(0, bioRes.TPe - 0.1)), 'mg/L', 'min(M_Al/(Al:P)/27·31/Q; TP − 0,1)', 'M&E mục 6-4', `MIN([MAls]/[AlPs]/27*31/[info.Q]*1000,MAX(0,${K.bioOut.TP}-0.1))`, 'dPr');
        dPrX = '[dPr]';
        s.chk('TP theo liều PAC chọn', dPr >= dP - 1e-3, 'ĐẠT', 'Liều PAC chọn thấp hơn nhu cầu khử P', 'M&E mục 6-4', true, '[dPr]>=[dPs]');
      }
      s.o('Q_dd', `Dung dịch PAC ${fx(p.sol_PAC * 100)} %`, MPAC / p.sol_PAC / p.rho_PAC / 24, 'L/h', 'M/(C_dd·ρ)/24', '', `[MPACs]/${p.sol_PAC}/${p.rho_PAC}/24`, 'QPACs');
      simulSludge = s.o('ΔX_hóa', 'Bùn hóa học sinh thêm', dPr / 31 * 122 * Q / 1000 + Math.max(0, MAl - dPr / 31 * 27 * Q / 1000) / 27 * 78, 'kg/ngđ', 'AlPO₄ + Al(OH)₃', 'M&E VD 6-1', `${dPrX}/31*122*[info.Q]/1000+MAX(0,[MAls]-${dPrX}/31*27*[info.Q]/1000)/27*78`, 'Xsim');
      R.chem.push({ name: 'PAC – khử P đồng thời trong bể sinh học', dose: MPAC / Q * 1000, kg: MPAC, unit: 'kg sản phẩm', price: 'p_PAC', note: 'M&E mục 6-4' + (pacSet ? ' – liều chọn' : ''), ref: ub.ids.MPACs, sol: p.sol_PAC, rho: p.rho_PAC });
      if (!pacSet) { bioRes.TPe = TPtarget; K.bioOut.TP = '[TPt]'; }
      else { bioRes.TPe = s.o('TP_ra', 'TP sau khử P đồng thời', bioRes.TPe - dPr, 'mg/L', 'TP_sinh học − ΔP_kt', '', `${K.bioOut.TP}-[dPr]`, 'TPsim'); K.bioOut.TP = '[TPsim]'; }
    }

    /* ---------- ⑤ Sau sinh học ---------- */
    const st5 = { ...st4 };
    {
      const s = ub.sec('Chất lượng nước sau cụm sinh học — M&E Ví dụ 8-3 bước 17');
      s.i('f_BOD', 'Quy đổi BOD từ TSS ra', p.bod_tss, 'gBOD/gTSS', '', 'Lựa chọn thiết kế', 'fbt');
      s.i('f_COD', 'Quy đổi COD từ TSS ra', p.cod_tss, 'gCOD/gTSS', '', 'Lựa chọn thiết kế', 'fct');
      s.i('N_org', 'N hữu cơ hòa tan còn lại', p.Norg, 'mg/L', '1 – 2', 'VD 8-3 bước 17', 'Norg');
      st5.TSS = s.o('TSS_e', 'TSS ra', bioRes.TSSe, 'mg/L', '', '', '[TSSe]', 'TSSout');
      st5.BOD = s.o('BOD_e', 'BOD₅ ra', K.sBODe + p.bod_tss * st5.TSS, 'mg/L', 'sBOD_e + f·TSS_e', 'VD 8-3 bước 17', '[sBODe]+[fbt]*[TSSout]', 'BODout5');
      st5.COD = s.o('COD_e', 'COD ra', K.nbsCOD + p.bcod_bod * K.sBODe + p.cod_tss * st5.TSS, 'mg/L', 'nbsCOD + (bCOD/BOD)·sBOD + f·TSS_e', 'VD 8-3 bước 17', '[nbsCOD]+[info.rBOD]*[sBODe]+[fct]*[TSSout]', 'CODout5');
      st5.NH4 = s.o('NH₄_e', 'NH₄-N ra', K.Ne, 'mg/L', '', '', '[Ne]', 'NH4out');
      st5.TKN = s.o('TKN_e', 'TKN ra', K.Ne + p.Norg + p.fN * 0.85 * st5.TSS, 'mg/L', 'N_e + N_org + f_N·0,85·TSS_e', 'VD 8-3 bước 17', '[Ne]+[Norg]+[fN]*0.85*[TSSout]', 'TKNout');
      st5.NO3 = s.o('NO₃_e', 'NO₃-N ra', bioRes.NO3e, 'mg/L', '', '', K.bioOut.NO3, 'NO3out');
      st5.TN = s.o('TN_e', 'Tổng N ra', st5.TKN + st5.NO3, 'mg/L', 'TKN + NO₃', '', '[TKNout]+[NO3out]', 'TNout');
      st5.TP = s.o('TP_e', 'Tổng P ra', bioRes.TPe, 'mg/L', '', 'M&E VD 8-13', K.bioOut.TP, 'TPout');
      st5.OG = s.o('O&G_e', 'Dầu mỡ ra', st4.OG * 0.2, 'mg/L', '20 % của vào', 'Lựa chọn', '[bal.OG4]*0.2', 'OGout');
      st5.Color = s.o('Màu_e', 'Độ màu ra', st4.Color * 0.7, 'Pt/Co', '70 % của vào', 'Lựa chọn', '[bal.Color4]*0.7', 'Colorout');
      st5.Alk = s.o('Alk_e', 'Độ kiềm ra', ub.ids.Alkout.val, 'mg/L CaCO₃', '', '', K.bioOut.Alk, 'Alkout5');
      st5.Coli = bio === 'LAG' ? s.o('Coli_e', 'Coliform sau hệ hồ sinh học', bioRes.Coli, 'MPN/100mL', 'N₀/Π(1 + k_T·HRT)', 'Marais', '[Ncl]', 'Coliout') : s.i('Coli_e', 'Coliform sau sinh học', p.coli_bio, 'MPN/100mL', '10⁴ – 10⁶', 'Giả thiết', 'Coliout');
    }
    const o5 = { COD: 'CODout5', BOD: 'BODout5', TSS: 'TSSout', TN: 'TNout', TKN: 'TKNout', NH4: 'NH4out', NO3: 'NO3out', TP: 'TPout', OG: 'OGout', Color: 'Colorout', Alk: 'Alkout5', Coli: 'Coliout' };
    stageRows(5, '⑤ Sau cụm sinh học' + (needClar ? ' + lắng thứ cấp' : ''), st5, k => `[bio.${o5[k]}]`);

    /* ---------- Bể lắng thứ cấp ---------- */
    if (needClar) {
      const u = new Unit(R, 'clar', 'LT2', 'Bể lắng thứ cấp' + (c.clar === 'rect' ? ' (lắng ngang)' : ' (ly tâm)'), 'sinhhoc');
      const s = u.sec('1. Tải trọng thiết kế — M&E mục 8-10, 8-11; PT (8-80)…(8-82); Bảng 8-34');
      const pureF = !!(ub.fixed && !ub.fixed.hyb), hybF = !!(ub.fixed && ub.fixed.hyb), noRAS = bio === 'MBBR' || bio === 'TF' || pureF;
      const X = s.o('X', 'MLSS vào bể lắng', noRAS ? st4.TSS + K.PXTSS * 1000 / Q : hybF ? ub.fixed.Xsus : SRTMLSS[1], 'mg/L', noRAS ? 'TSS vào + sinh khối bong tróc' : hybF ? 'Phần lơ lửng X_ll' : 'MLSS', '', noRAS ? '[bal.TSS4]+[bio.PXTSS]*1000/[info.Q]' : hybF ? '[bio.Xsus]' : '[bio.MLSS]', 'X');
      const Qpk = s.o('Q_đỉnh', 'Lưu lượng đỉnh vào bể lắng', Qpk_eff, 'm³/h', hasEQ ? 'Sau điều hòa' : 'Q_max,h', '', QpkRef, 'Qpk');
      s.o('R', 'Tỷ lệ tuần hoàn bùn', RAS, '-', '', '', '[bio.RAS]', 'R');
      const SOR = s.i('SOR', 'Tải trọng bề mặt thiết kế', noRAS ? 30 : p.sc_SOR, 'm³/m²·ngđ', 'Bảng 8-34', 'Bảng 8-34', 'SOR');
      s.i('SOR_đỉnh,max', 'Tải trọng bề mặt đỉnh cho phép', p.sc_SORpk, 'm³/m²·ngđ', '40 – 64', 'Bảng 8-34', 'SORpk');
      s.i('SLR_max', 'Tải trọng chất rắn đỉnh cho phép', p.sc_SLRpk, 'kg/m²·h', '≤ 10', 'Bảng 8-34', 'SLRpk');
      const A = s.o('A', 'Diện tích yêu cầu', Math.max(Q / SOR, Qpk * 24 / p.sc_SORpk, (Qpk * 24 + RAS * Q) * X / 1000 / 24 / p.sc_SLRpk), 'm²', 'max(Q/SOR; Q_đỉnh/SOR_đỉnh; (Q_đỉnh + Q_R)·X/SLR)', 'PT (8-80), (8-82)', 'MAX([info.Q]/[SOR],[Qpk]*24/[SORpk],([Qpk]*24+[R]*[info.Q])*[X]/1000/24/[SLRpk])', 'A');
      const n = s.i('n', 'Số bể', p.sc_n, 'bể', '≥ 2', 'M&E mục 8-11', 'n');
      const H = s.i('H', 'Chiều sâu công tác', p.sc_H, 'm', '4,0 – 5,5', 'Bảng 8-34', 'H');
      let At, g;
      if (c.clar === 'rect') {
        s.i('L/B', 'Tỷ lệ L/B', p.sc_LB, '-', '', '', 'LB');
        const Bc = s.o('B', 'Chiều rộng 1 bể', ceilTo(Math.sqrt(A / n / p.sc_LB), 0.5), 'm', '√(A/n/(L/B))', '', 'CEILING(SQRT([A]/[n]/[LB]),0.5)', 'Bc');
        const Lc = s.o('L', 'Chiều dài 1 bể', ceilTo(A / n / Bc, 0.5), 'm', '', '', 'CEILING([A]/[n]/[Bc],0.5)', 'Lc');
        At = s.o('A_tt', 'Diện tích thực tế', Bc * Lc * n, 'm²', '', '', '[Bc]*[Lc]*[n]', 'At');
        g = { type: 'rect', L: Lc, B: Bc, H: H + p.fb, fb: p.fb, n, zones: [{ name: 'LẮNG NGANG', len: Lc }], label: 'LẮNG II' };
        u.dims = `${n} × (${fx(Bc)} × ${fx(Lc)} × ${fx(H)} m)`;
      } else {
        const D = s.o('D', 'Đường kính 1 bể', ceilTo(Math.sqrt(4 * A / n / PI), 0.5), 'm', '√(4A/nπ), làm tròn 0,5 m', '', 'CEILING(SQRT(4*[A]/[n]/PI()),0.5)', 'D');
        At = s.o('A_tt', 'Diện tích thực tế', n * PI * D * D / 4, 'm²', 'n·π·D²/4', '', '[n]*PI()*[D]^2/4', 'At');
        g = { type: 'circ', D, H: H + p.fb, fb: p.fb, n, label: 'LẮNG II' };
        s.o('q_máng', 'Tải trọng máng tràn', Q / (n * PI * D), 'm³/m·ngđ', 'Q/(n·π·D)', 'M&E mục 8-11', '[info.Q]/([n]*PI()*[D])', 'qw');
        u.dims = `${n} × D ${fx(D)} m, H ${fx(H)} m`;
      }
      const SORp = s.o('SOR_đỉnh', 'Tải trọng bề mặt đỉnh', Qpk * 24 / At, 'm³/m²·ngđ', 'Q_đỉnh·24/A', 'Bảng 8-34', '[Qpk]*24/[At]', 'SORp');
      s.chk('SOR đỉnh ≤ ' + p.sc_SORpk, SORp <= p.sc_SORpk + 0.01, 'ĐẠT', 'VƯỢT', 'Bảng 8-34', false, '[SORp]<=[SORpk]+0.01');
      const SLR = s.o('SLR_đỉnh', 'Tải trọng chất rắn đỉnh', (Qpk * 24 + RAS * Q) * X / 1000 / 24 / At, 'kg/m²·h', '(Q_đỉnh + Q_R)·X/A', 'PT (8-82)', '([Qpk]*24+[R]*[info.Q])*[X]/1000/24/[At]', 'SLR');
      s.chk('SLR đỉnh ≤ ' + p.sc_SLRpk + ' kg/m²·h', SLR <= p.sc_SLRpk + 0.01, 'ĐẠT', 'VƯỢT', 'Bảng 8-34', false, '[SLR]<=[SLRpk]+0.01');
      s.o('t', 'Thời gian lưu', At * H / Q * 24, 'h', '', '', '[At]*[H]/[info.Q]*24', 't');
      if (bio === 'MBBR') s.note('MBBR không tuần hoàn bùn; có thể thay bằng lamella hoặc DAF để giảm diện tích.');
      if (bio === 'TF') s.note('Lọc sinh học nhỏ giọt: bể lắng thứ cấp (bể lắng mùn) tách chất rắn bong tróc, không tuần hoàn bùn; tuần hoàn nước lấy từ giếng thu sau lọc.');
      if (pureF) s.note('Màng bám thuần (Organica/Biopolus): không tuần hoàn bùn; nhà cung cấp có thể thay bể lắng bằng lọc đĩa/lọc trống trực tiếp (Cần Thơ: drum filter; STOWA: microfiltration).');
      u.geom = g; u.V = At * H; u.A = At; u.n = n; u.H = H; u.hl = 0.4; u.kW = 1.5 * n;
      R.equip.push({ u: u.name, name: 'Cầu gạt bùn / thanh gạt bể lắng', spec: u.dims + '; 1,5 kW', qty: n, note: '' });
    }


    /* ---------- ⑤b Khử nitrat bậc 3 – bể thiếu khí hậu đặt khuấy trộn hoàn toàn + methanol (bảng tính "CMAS Tertiary Denitrification Design-SI";
       M&E 5th mục 8-8, hệ số động học khử nitrat bằng methanol ở 10 & 20 °C, nội suy tuyến tính theo nhiệt độ như bảng tính) ---------- */
    let tdn = null;
    const st5b = { ...st5 };
    if (c.tdn && c.tdn !== 'none') {
      const u = new Unit(R, 'tdn', 'KNB3', 'Khử nitrat bậc 3 – bể thiếu khí hậu đặt + methanol', 'sinhhoc');
      const s1 = u.sec('1. Số liệu vào — nước đã nitrat hóa sau lắng thứ cấp');
      s1.o('Q', 'Lưu lượng', Q, 'm³/ngđ', '', '', '[info.Q]', 'Q');
      const NO = s1.o('NO₃-N₀', 'NO₃-N vào', st5.NO3, 'mg/L', 'Cột ⑤', '', '[bal.NO35]', 'NO0');
      const TSSo = s1.o('TSS₀', 'TSS vào', st5.TSS, 'mg/L', '', '', '[bal.TSS5]', 'TSS0');
      const Tw = s1.o('T', 'Nhiệt độ bể thiếu khí', T, '°C', 'T_min', '', '[info.T]', 'Tw');
      const Ne = s1.i('N_e', 'NO₃-N ra mục tiêu', Math.min(p.tdn_Ne, NO), 'mg/L', L.TN !== undefined ? `TN giới hạn ${fx(L.TN)} mg/L` : '', 'Bảng tính mẫu', 'Ne');
      const SRT = s1.i('SRT', 'SRT thiết kế', p.tdn_SRT, 'ngày', '3 – 8', 'M&E mục 8-8', 'SRT');
      const fd = s1.i('f_d', 'Phần sinh khối dư', p.tdn_fd, '-', '0,15', 'M&E Bảng 8-14', 'fd');
      const sk = u.sec('2. Hệ số động học khử nitrat bằng methanol (10 °C → 20 °C, nội suy tuyến tính) — M&E 5th Bảng 8-27');
      const ip = (a10, a20) => a10 + (a20 - a10) * (Tw - 10) / 10, ipX = (a10, a20) => `${a10}+(${a20}-${a10})*([Tw]-10)/10`;
      const kd = sk.o('k_d', 'Hệ số phân hủy nội bào', ip(0.04, 0.05), 'g VSS/g VSS·ngày', '0,04 (10 °C) – 0,05 (20 °C)', 'M&E Bảng 8-27', ipX(0.04, 0.05), 'kd');
      const Y = sk.o('Y_D', 'Hệ số sản lượng', ip(0.17, 0.18), 'g VSS/g bCOD', '0,17 – 0,18', 'M&E Bảng 8-27', ipX(0.17, 0.18), 'Y');
      const k = sk.o('k', 'Tốc độ sử dụng cơ chất riêng cực đại', ip(3.1, 10.3), 'g bCOD/g VSS·ngày', '3,1 – 10,3', 'M&E Bảng 8-27', ipX(3.1, 10.3), 'k');
      const Ks = sk.o('K_s', 'Hằng số bán bão hòa', ip(12.6, 9.1), 'mg/L', '12,6 – 9,1', 'M&E Bảng 8-27', ipX(12.6, 9.1), 'Ks');
      const sm = u.sec('3. Nhu cầu methanol');
      const S = sm.o('S', 'Methanol dư trong nước ra (theo COD)', Ks * (1 + kd * SRT) / (SRT * (Y * k - kd) - 1), 'mg/L', 'K_s(1 + k_d·SRT)/[SRT(Y·k − k_d) − 1]', 'M&E PT (7-46)', '[Ks]*(1+[kd]*[SRT])/([SRT]*([Y]*[k]-[kd])-1)', 'S');
      const Yn = sm.o('Y_n', 'Hệ số sản lượng thực', Y / (1 + kd * SRT), 'g VSS/g bCOD', 'Y/(1 + k_d·SRT)', 'M&E PT (8-68)', '[Y]/(1+[kd]*[SRT])', 'Yn');
      const r = sm.o('bCOD/NO₃-N', 'bCOD tiêu thụ / NO₃-N khử', 2.86 / (1 - 1.42 * Yn), 'g/g', '2,86/(1 − 1,42·Y_n)', 'M&E PT (8-65)', '2.86/(1-1.42*[Yn])', 'r');
      const dCOD = sm.o('C_COD', 'Liều methanol theo COD', r * Math.max(0, NO - Ne) + S, 'mg/L COD', '(bCOD/N)(NO₃ − N_e) + S', 'Bảng tính mẫu', '[r]*MAX(0,[NO0]-[Ne])+[S]', 'dCOD');
      const dM = sm.o('C_MeOH', 'Liều methanol', dCOD / 1.5, 'mg/L', '1,5 g COD/g CH₃OH', 'M&E Bảng 8-26', '[dCOD]/1.5', 'dM');
      const MM = sm.o('M_MeOH', 'Methanol cần hằng ngày', dM * Q / 1000, 'kg/ngđ', 'C·Q', '', '[dM]*[Q]/1000', 'MM');
      const sv = u.sec('4. Thể tích, kích thước & thời gian lưu bể thiếu khí');
      const PX = sv.o('P_X,TSS', 'Bùn sinh ra (kể TSS vào)', (Q * Y * dCOD / (1 + kd * SRT) / 0.85 + fd * kd * SRT * Q * Y * dCOD / (1 + kd * SRT) / 0.85 + Q * TSSo) / 1000, 'kg/ngđ', 'Q·Y·C/[(1 + k_d·SRT)·0,85]·(1 + f_d·k_d·SRT) + Q·TSS₀', 'M&E PT (8-21)', '([Q]*[Y]*[dCOD]/(1+[kd]*[SRT])/0.85+[fd]*[kd]*[SRT]*[Q]*[Y]*[dCOD]/(1+[kd]*[SRT])/0.85+[Q]*[TSS0])/1000', 'PX');
      const X = sv.i('MLSS', 'MLSS thiết kế', p.tdn_MLSS, 'mg/L', '', 'Bảng tính mẫu', 'X');
      const Vmin = sv.o('V_min', 'Thể tích tối thiểu', PX * SRT / X * 1000, 'm³', 'P_X·SRT/MLSS', 'M&E VD 8-3 bước 10', '[PX]*[SRT]/[X]*1000', 'Vmin');
      sv.note('Bảng tính gốc ghi P_X,TSS = 139.442 "kg/ngày" – thực chất là g/ngày (thiếu /1000); thể tích V_min tính đúng.');
      const n = Math.max(1, Math.round(p.tdn_n)), H = p.tdn_H;
      sv.i('n', 'Số bể', n, 'bể', '', '', 'n'); sv.i('H', 'Chiều sâu nước', H, 'm', '', '', 'H'); sv.i('L:W', 'Tỷ lệ L:W', p.tdn_LW, '-', '', '', 'LW');
      const Wd = sv.o('W', 'Chiều rộng bể (làm tròn 0,5 m)', ceilTo(Math.sqrt(Vmin / n / H / p.tdn_LW), 0.5), 'm', '√(V/(n·H·L:W))', 'Bảng tính mẫu', 'CEILING(SQRT([Vmin]/[n]/[H]/[LW]),0.5)', 'W');
      const Ld = sv.o('L', 'Chiều dài bể (làm tròn 0,5 m)', ceilTo(Vmin / n / H / Wd, 0.5), 'm', '', '', 'CEILING([Vmin]/[n]/[H]/[W],0.5)', 'L');
      const V1 = sv.o('V_tt', 'Thể tích thực tế mỗi bể', Wd * Ld * H, 'm³', 'W·L·H', '', '[W]*[L]*[H]', 'V1');
      sv.o('t', 'Thời gian lưu thiếu khí', V1 * n * 24 / Q, 'h', 'n·V/Q', '', '[V1]*[n]*24/[Q]', 'HRT');
      const Pm = sv.o('P_khuấy', 'Công suất khuấy trộn', V1 * n * p.tdn_mix / 1000, 'kW', `${p.tdn_mix} kW/10³ m³`, 'M&E Bảng 5-?', `[V1]*[n]*${p.tdn_mix}/1000`, 'Pm');
      const sr = u.sec('5. Bể sục khí lại (oxy hóa methanol dư, giải phóng N₂)');
      const tr = sr.i('t_sk', 'Thời gian sục khí lại', p.tdn_treaer, 'phút', '15 – 30', 'Bảng tính mẫu', 'tr');
      const Vr = sr.o('V_sk', 'Thể tích bể sục khí lại', Q * tr / 1440, 'm³', 'Q·t', '', '[Q]*[tr]/1440', 'Vr');
      const Lr = sr.o('L_sk', 'Chiều dài mỗi bể (cùng W, H)', ceilTo(Vr / n / Wd / H, 0.1), 'm', 'V/(n·W·H)', '', 'CEILING([Vr]/[n]/[W]/[H],0.1)', 'Lr');
      const sq = u.sec('6. Bùn tuần hoàn & bùn thải; bể lắng sau khử nitrat');
      const Xw = sq.i('TSS_w', 'Nồng độ bùn tuần hoàn / thải', p.tdn_TSSw, 'mg/L', '', 'Bảng tính mẫu', 'Xw');
      const TSSe = sq.o('TSS_e', 'TSS ra', Math.min(TSSo, tsseTech), 'mg/L', 'min(TSS₀; TSS_e chung)', 'Quy tắc R04', `MIN([TSS0],${tsseTech})`, 'TSSe');
      const Qr = sq.o('Q_R', 'Lưu lượng bùn tuần hoàn', Q * (X - TSSo) / (Xw - X), 'm³/ngđ', 'Q(MLSS − TSS₀)/(TSS_w − MLSS)', 'Bảng tính mẫu', '[Q]*([X]-[TSS0])/([Xw]-[X])', 'Qr');
      const Qw = sq.o('Q_w', 'Lưu lượng bùn thải', Math.max(0, (n * V1 * X / SRT - Q * TSSe) / (Xw - TSSe)), 'm³/ngđ', '(n·V·MLSS/SRT − Q·TSS_e)/(TSS_w − TSS_e)', 'Bảng tính mẫu', 'MAX(0,([n]*[V1]*[X]/[SRT]-[Q]*[TSSe])/([Xw]-[TSSe]))', 'Qw');
      const Acl = sq.o('A_lắng', 'Diện tích bể lắng (SOR thứ cấp)', Q / p.sc_SOR, 'm²', 'Q/SOR', 'M&E Bảng 8-34', `[Q]/${p.sc_SOR}`, 'Acl');
      const Dcl = sq.o('D_lắng', 'Đường kính bể lắng (2 bể)', ceilTo(Math.sqrt(2 * Acl / PI), 0.5), 'm', '', '', 'CEILING(SQRT(2*[Acl]/PI()),0.5)', 'Dcl');
      const so = u.sec('7. Nước ra');
      st5b.NO3 = so.o('NO₃_ra', 'NO₃-N ra', Math.min(NO, Ne), 'mg/L', '', '', 'MIN([NO0],[Ne])', 'NO3o');
      st5b.TN = so.o('TN_ra', 'Tổng N ra', st5.TKN + st5b.NO3, 'mg/L', 'TKN + NO₃', '', '[bal.TKN5]+[NO3o]', 'TNo');
      st5b.TSS = TSSe;
      st5b.Alk = so.o('Alk_ra', 'Độ kiềm ra', st5.Alk + 3.57 * Math.max(0, NO - st5b.NO3), 'mg/L CaCO₃', 'Alk + 3,57·ΔNO₃', 'M&E mục 8-8', '[bal.Alk5]+3.57*MAX(0,[NO0]-[NO3o])', 'Alko');
      if (NO <= Ne + 1e-6) so.note('NO₃-N sau lắng thứ cấp đã ≤ mục tiêu – bậc khử nitrat 3 chỉ dự phòng (liều methanol = methanol dư S).');
      R.chem.push({ name: 'Methanol – khử nitrat bậc 3', dose: dM, kg: MM, unit: 'kg', price: 'p_MeOH', note: 'M&E Bảng 8-26', ref: u.ids.MM, sol: p.sol_MeOH, rho: p.rho_MeOH });
      R.equip.push({ u: u.name, name: 'Máy khuấy chìm bể thiếu khí bậc 3', spec: `${fx(Pm / n)} kW/máy`, qty: n, note: '' });
      R.equip.push({ u: u.name, name: 'Bơm định lượng methanol (phòng nổ)', spec: `${fx(MM / p.rho_MeOH / 24)} L/h`, qty: 2, note: '1 + 1' });
      R.equip.push({ u: u.name, name: 'Bơm tuần hoàn bùn bậc 3', spec: `${fx(Qr / 24 / n)} m³/h × 5 m`, qty: n + 1, note: '' });
      R.equip.push({ u: u.name, name: 'Đĩa phân phối khí bể sục khí lại', spec: `${fx(Vr)} m³`, qty: Math.ceil(Vr / 2), note: '' });
      R.equip.push({ u: u.name, name: 'Cầu gạt bể lắng sau khử nitrat bậc 3', spec: `D = ${fx(Dcl)} m; 0,75 kW`, qty: 2, note: '' });
      u.geom = { type: 'rect', L: Ld + Lr, B: Wd, H: H + p.fb, fb: p.fb, n, zones: [{ name: 'THIẾU KHÍ B3', len: Ld }, { name: 'SỤC KHÍ LẠI', len: Lr }], label: 'KHỬ NITRAT B3' };
      u.V = n * (V1 + Lr * Wd * H) + Acl * 4; u.A = footprintArea(u.geom) + Acl; u.n = n; u.H = H; u.hl = 0.3;
      u.dims = `${n} × (${fx(Wd)} × ${fx(Ld)} + ${fx(Lr)} m) × ${fx(H)} m; lắng 2 × D ${fx(Dcl)} m`; u.hrt = `${fx(V1 * n * 24 / Q)} h`;
      u.kW = Pm + 9.81 * Qr / 86400 * 5 / 0.6 + 1.5 + Vr * 0.03;
      tdn = { u, PX: PX - Q * TSSo / 1000 + Q * Math.max(0, TSSo - TSSe) / 1000, kW: u.kW };
      tdn.PX = so.o('P_X,thải', 'Bùn thải bậc 3 (sinh khối + TSS giữ lại)', tdn.PX, 'kg TSS/ngđ', 'P_X − Q·TSS₀ + Q·(TSS₀ − TSS_e)', '', '[PX]-[Q]*[TSS0]/1000+[Q]*MAX(0,[TSS0]-[TSSe])/1000', 'PXw');
    }
    if (tdn) stageRows('5b', '⑤b Sau khử nitrat bậc 3', st5b, k => k === 'NO3' ? '[tdn.NO3o]' : k === 'TN' ? '[tdn.TNo]' : k === 'TSS' ? '[tdn.TSSe]' : k === 'Alk' ? '[tdn.Alko]' : `[${k}5]`);
    const s5k = tdn ? '5b' : '5';

    /* ---------- Lưu lượng đỉnh sau sinh học ---------- */
    const Qpk3 = Math.max(Qpk_eff, Qdec || 0);
    {
      const s = ub.sec('Lưu lượng đỉnh ra công trình sau sinh học');
      s.o('Q_đỉnh,3', 'max(Q đỉnh vào; lưu lượng chắt/xả đỉnh)', Qpk3, 'm³/h', '', '', Qdec ? `MAX(${QpkRef},[Qdec])` : QpkRef, 'Qpk3');
    }

    /* ---------- ⑥ Hóa lý bậc 3 + lọc ---------- */
    const st6a = { ...st5b };
    const tertK = ['COD', 'BOD', 'TSS', 'Color'];
    const tpToLim = TPtarget !== null && st5b.TP > TPtarget && c.chemP === 'auto';
    let tert = null;
    if (c.chemPos === 'post') {
      for (const k of tertK) st6a[k] = st5b[k] * (1 - E[k].tert / 100);
      st6a.TP = tpToLim ? TPtarget : st5b.TP * (1 - E.TP.tert / 100);
    }
    stageRows('6a', '⑥a Sau hóa lý bậc 3' + (c.chemPos === 'post' ? '' : ' – không bố trí, giữ nguyên'), st6a, k => {
      if (c.chemPos !== 'post') return `[${k}${s5k}]`;
      if (tertK.includes(k)) return `[${k}${s5k}]*(1-[e_${k}_tert]/100)`;
      if (k === 'TP') return tpToLim ? `[info.L_TP]*${p.tp_margin}` : `[TP${s5k}]*(1-[e_TP_tert]/100)`;
      return `[${k}${s5k}]`;
    });
    if (c.chemPos === 'post') tert = chemCluster('post', Qpk3, '[bio.Qpk3]', s5k, '6a', st5b, st6a, Qdec ? 'max(Q đỉnh; lưu lượng chắt đỉnh bể mẻ)' : 'Lưu lượng đỉnh sau sinh học');
    /* ---------- ⑥b Xử lý bậc 3 – oxy hóa ---------- */
    const st6b = { ...st6a };
    const aop = c.aop && c.aop !== 'none' && DATA.AOP[c.aop] ? aopUnit(c.aop, Qpk3, st6a, st6b) : null;
    stageRows('6b', '⑥b Sau oxy hóa bậc 3' + (aop ? ' – ' + DATA.AOP[c.aop].name : ' – không bố trí, giữ nguyên'), st6b, k => aop && aop.X[k] ? aop.X[k] : `[${k}6a]`);
    const st6 = { ...st6b };
    if (c.filt !== 'none') {
      const u = new Unit(R, 'filt', 'LOC', c.filt === 'disc' ? 'Lọc đĩa vải' : 'Bể lọc cát nhanh', 'nuoc');
      const s = u.sec('1. ' + u.name + ' — M&E Ch.11');
      const dT = st6b.TSS * E.TSS.filt / 100;
      st6.TSS = st6b.TSS - dT; st6.BOD = Math.max(0, st6b.BOD - p.bod_tss * dT); st6.COD = Math.max(0, st6b.COD - p.cod_tss * dT); st6.TP = st6b.TP * (1 - E.TP.filt / 100);
      s.o('Q_tt', 'Lưu lượng đỉnh', Qpk3, 'm³/h', '', '', '[bio.Qpk3]', 'Qd');
      if (c.filt === 'disc') {
        const v = s.i('v', 'Tốc độ lọc', p.filt_disc_q, 'm/h', '8 – 16', 'M&E Ch.11', 'v');
        const A = s.o('A', 'Diện tích lọc', Qpk3 / v, 'm²', 'Q/v', '', '[Qd]/[v]', 'A');
        const n = s.o('n', 'Số module (≈ 60 m²/module) + 1 dự phòng', Math.ceil(A / 60 - 1e-9) + 1, 'module', '', '', 'ROUNDUP([A]/60,0)+1', 'n');
        u.geom = { type: 'rect', L: 6, B: n * 2.6, H: 2.8, fb: 0.4, n: 1, zones: [{ name: 'LỌC ĐĨA', len: 6 }], label: 'LỌC ĐĨA' };
        u.dims = `${n} module; A = ${fx(A)} m²`; u.kW = 1.5 * n; u.hl = 0.5; u.H = 2.4;
        R.equip.push({ u: u.name, name: 'Module lọc đĩa vải', spec: '≈ 60 m²/module; 1,5 kW', qty: n, note: '' });
      } else {
        const v = s.i('v', 'Tốc độ lọc', p.filt_sand_q, 'm/h', '5 – 10', 'M&E Ch.11', 'v');
        const n = s.i('n', 'Số bể', p.filt_sand_n, 'bể', '', '', 'n');
        const A1 = s.o('A_1', 'Diện tích 1 bể (1 bể rửa)', Qpk3 / v / (n - 1), 'm²', 'Q/(v·(n−1))', '', '[Qd]/[v]/([n]-1)', 'A1');
        const Bf = s.o('B', 'Chiều rộng 1 bể', ceilTo(Math.sqrt(A1 / 1.5), 0.5), 'm', '', '', 'CEILING(SQRT([A1]/1.5),0.5)', 'Bf');
        const Lf = s.o('L', 'Chiều dài 1 bể', ceilTo(A1 / Bf, 0.5), 'm', '', '', 'CEILING([A1]/[Bf],0.5)', 'Lf');
        s.i('%rửa', 'Nước rửa lọc', p.filt_bw, '% Q', '', '', 'bw');
        s.o('Q_rửa', 'Nước rửa lọc', Q * p.filt_bw / 100, 'm³/ngđ', '', '', '[info.Q]*[bw]/100', 'Qbw');
        u.geom = { type: 'rect', L: Lf, B: Bf, H: 4, fb: 0.5, n, zones: [{ name: 'LỌC CÁT', len: Lf }], label: 'LỌC CÁT' };
        u.dims = `${n} × (${fx(Bf)} × ${fx(Lf)} m)`; u.kW = 15; u.hl = 2.0; u.H = 3.5;
        R.equip.push({ u: u.name, name: 'Bơm rửa lọc + máy thổi rửa', spec: '15 kW', qty: 2, note: '' });
      }
      u.V = footprintArea(u.geom) * (u.geom.H); u.A = footprintArea(u.geom);
    }
    stageRows(6, '⑥ Sau lọc bậc 3' + (c.filt !== 'none' ? '' : ' – không bố trí, giữ nguyên'), st6, k => {
      if (c.filt === 'none') return `[${k}6b]`;
      if (k === 'TSS') return '[TSS6b]*(1-[e_TSS_filt]/100)';
      if (k === 'BOD') return `MAX(0,[BOD6b]-[bio.fbt]*[TSS6b]*[e_TSS_filt]/100)`;
      if (k === 'COD') return `MAX(0,[COD6b]-[bio.fct]*[TSS6b]*[e_TSS_filt]/100)`;
      if (k === 'TP') return '[TP6b]*(1-[e_TP_filt]/100)';
      return `[${k}6b]`;
    });

    /* ---------- Khử trùng ---------- */
    const st7 = { ...st6 };
    {
      const u = new Unit(R, 'dis', 'KT', c.disinf === 'naocl' ? 'Bể tiếp xúc khử trùng NaOCl' : 'Kênh khử trùng UV', 'nuoc');
      const s = u.sec('1. ' + DATA.optName('disinf', c.disinf) + ' — M&E Ch.12');
      const Qd = s.o('Q_tt', 'Lưu lượng tính toán', Qpk3, 'm³/h', Qdec ? 'max(Q_max,h; lưu lượng chắt đỉnh)' : '', '', '[bio.Qpk3]', 'Qd');
      if (c.disinf === 'naocl') {
        const t = s.i('t', 'Thời gian tiếp xúc', p.cl_t, 'phút', '≥ 30 phút ở lưu lượng đỉnh', 'M&E mục 12-6', 't');
        const V = s.o('V', 'Thể tích bể', Qd * t / 60, 'm³', 'Q·t/60', '', '[Qd]*[t]/60', 'V');
        // R08: L:W ≥ 20 → giảm bề rộng hành lang (≥ 0,5 m, bước 0,05 m) rồi chiều sâu (≥ 1,0 m)
        let Bc = p.cl_B, Hc = p.cl_H; const Vc = Qd * t / 60;
        if (AF && (MAN('cl_B') || MAN('cl_H')) && Vc / (Bc * Hc) / Bc < 20) warn(`Bể tiếp xúc khử trùng: B × H nhập tay ${fx(Bc)} × ${fx(Hc)} m cho L:W = ${fx(Vc / (Bc * Hc) / Bc)} < 20 – giữ giá trị nhập.`);
        else if (AF && Vc / (Bc * Hc) / Bc < 20) {
          Bc = Math.max(0.5, Math.floor(Math.sqrt(Vc / (20 * Hc)) / 0.05) * 0.05);
          while (Vc / (Bc * Hc) / Bc < 20 && Hc > 0.8 + 1e-9) Hc = Math.round((Hc - 0.1) * 10) / 10;
          fit('KT', 'Bể tiếp xúc – bề rộng hành lang × chiều sâu', `${fx(p.cl_B)} × ${fx(p.cl_H)}`, `${fx(Bc)} × ${fx(Hc)}`, 'm', `L:W = ${fx(Vc / (p.cl_B * p.cl_H) / p.cl_B)} < 20 → ${fx(Vc / (Bc * Hc) / Bc)}`);
        }
        const H = s.i('H', 'Chiều sâu', Hc, 'm', Hc !== p.cl_H ? `Tự điều chỉnh từ ${fx(p.cl_H)} m` : '', Hc !== p.cl_H ? 'Quy tắc R08' : '', 'H'); const B = s.i('B', 'Chiều rộng hành lang', Bc, 'm', Bc !== p.cl_B ? `Tự điều chỉnh từ ${fx(p.cl_B)} m (L:W ≥ 20)` : '', Bc !== p.cl_B ? 'Quy tắc R08' : '', 'B');
        const Lt = s.o('L_tổng', 'Tổng chiều dài hành lang', V / (B * H), 'm', 'V/(B·H)', '', '[V]/([B]*[H])', 'Lt');
        s.chk('L:W ≥ 20', Lt / B >= 20, 'ĐẠT', 'Tăng số hành lang', 'M&E mục 12-6', true, '[Lt]/[B]>=20');
        s.i('L_1', 'Chiều dài mỗi hành lang định hướng', p.cl_Lpass, 'm', '', '', 'Lpass');
        const n = s.o('n', 'Số hành lang', Math.max(2, Math.ceil(Lt / p.cl_Lpass - 1e-9)), 'hành lang', '', '', 'MAX(2,ROUNDUP([Lt]/[Lpass],0))', 'n');
        const Lp = s.o('L_hl', 'Chiều dài 1 hành lang', ceilTo(Lt / n, 0.5), 'm', '', '', 'CEILING([Lt]/[n],0.5)', 'Lp');
        const dose = s.i('C', 'Liều clo hoạt tính', p.cl_dose, 'mg/L', 'Đường cong nhu cầu clo', 'M&E mục 12-4', 'dose');
        s.i('C_dư', 'Clo dư cuối bể', p.cl_res, 'mg/L', '', 'M&E tr.1331', 'res');
        s.o('CT', 'Giá trị CT', p.cl_res * t, 'mg·phút/L', 'C_dư·t', 'M&E mục 12-2', '[res]*[t]', 'CT');
        const MCl = s.o('M_Cl₂', 'Clo hoạt tính', dose * Q / 1000, 'kg/ngđ', 'C·Q/1000', '', '[dose]*[info.Q]/1000', 'MCl');
        s.i('%Cl', 'Hàm lượng Cl₂ trong NaOCl', p.cl_conc, 'kg/kg', '8 – 12 %', 'Chứng chỉ sản phẩm', 'conc');
        const MN = s.o('M_NaOCl', 'Dung dịch NaOCl', MCl / p.cl_conc, 'kg/ngđ', 'M_Cl₂/%Cl', '', '[MCl]/[conc]', 'MNaOCl');
        R.chem.push({ name: 'NaOCl thương phẩm – khử trùng', dose, kg: MN, unit: 'kg dung dịch', price: 'p_NaOCl', note: 'M&E mục 12-4', ref: u.ids.MNaOCl, sol: 1, rho: p.rho_NaOCl });
        u.geom = { type: 'rect', L: Lp, B: n * B + (n - 1) * 0.2, H: H + p.fb, fb: p.fb, n: 1, serp: n, zones: [{ name: 'TIẾP XÚC CLO', len: Lp }], label: 'TIẾP XÚC' };
        u.V = Lp * n * B * H; u.A = Lp * (n * B + (n - 1) * 0.2); u.dims = `${n} hành lang ${fx(B)} × ${fx(Lp)} m, H ${fx(H)} m`; u.hrt = `${fx(t)} phút`; u.kW = 1.5; u.H = H; u.hl = 0.3;
        R.equip.push({ u: u.name, name: 'Bơm định lượng NaOCl', spec: `${fx(MN / 1.15 / 24)} L/h`, qty: 2, note: '1 + 1' });
      } else {
        s.i('D_UV', 'Liều UV thiết kế', 30, 'mJ/cm²', 'Bioassay', 'M&E mục 12-8', 'DUV');
        s.i('UVT', 'Độ truyền qua UV 254 nm', 60, '%', 'Đo thực tế', 'M&E mục 12-8', 'UVT');
        const qm = s.i('q_module', 'Công suất 1 module', p.uv_q, 'm³/h', '', 'Catalogue', 'qm');
        const n = s.o('n', 'Số module (kể 1 dự phòng)', Math.ceil(Qd / qm - 1e-9) + 1, 'module', 'ROUNDUP(Q/q) + 1', '', 'ROUNDUP([Qd]/[qm],0)+1', 'n');
        s.i('P_1', 'Điện 1 module', p.uv_kW, 'kW', '', 'Catalogue', 'P1');
        const P = s.o('N', 'Công suất điện', n * p.uv_kW, 'kW', 'n·P₁', '', '[n]*[P1]', 'P');
        u.geom = { type: 'rect', L: Math.max(8, n * 1.5 + 4), B: 1.5, H: 1.5, fb: 0.4, n: 1, zones: [{ name: 'KÊNH UV', len: Math.max(8, n * 1.5 + 4) }], label: 'UV' };
        u.V = u.geom.L * 1.5 * 1.2; u.A = u.geom.L * 1.5 + 40; u.dims = `Kênh ${fx(u.geom.L)} × 1,5 m; ${n} module`; u.kW = P; u.H = 1.1; u.hl = 0.3;
        R.equip.push({ u: u.name, name: 'Module UV kênh hở', spec: `${qm} m³/h/module; ${p.uv_kW} kW`, qty: n, note: '', spare: 'uvlamp' });
      }
      s.i('log', 'Mức giảm coliform', p.logred, 'log', '3 – 4 log', 'M&E Ch.12', 'logred');
      st7.Coli = s.o('Coli_ra', 'Coliform sau khử trùng', st6.Coli * Math.pow(10, -p.logred), 'MPN/100mL', 'Coli·10^(−log)', '', '[bal.Coli6]*10^(-[logred])', 'Coli7');
    }
    stageRows(7, '⑦ Sau khử trùng – xả nguồn tiếp nhận', st7, k => k === 'Coli' ? '[dis.Coli7]' : `[${k}6]`);

    /* ---------- ⑧ Bãi thấm áp lực – phân phối nước thải ngầm (bảng tính "Subsurface WW Distribution Calculations-S.I.";
       Massachusetts DEP – Pressure Distribution; USEPA Onsite WW Treatment Systems Manual 2002) ---------- */
    if (c.disp && c.disp !== 'none') {
      const ctr = c.disp === 'center';
      const u = new Unit(R, 'disp', 'BT', 'Bãi thấm áp lực – ống phân phối cấp ' + (ctr ? 'ở giữa' : 'ở đầu'), 'nuoc');
      const PVC = [[25, 26.6], [32, 35.1], [40, 40.9], [50, 52.5], [65, 62.7], [80, 77.9], [90, 90.1], [100, 102.3], [125, 128.2], [150, 154.1], [200, 202.7], [250, 254.5], [300, 303.2]];
      const pick = d => (PVC.find(x => x[1] >= d - 1e-9) || PVC[PVC.length - 1]);
      const s1 = u.sec('1. Bố trí ống nhánh & lưu lượng — Qo = 0,1246·Do²·hd^0,5');
      const QD = s1.o('Q_D', 'Lưu lượng nước thải ngày', Q * 1000, 'L/ngđ', '', '', '[info.Q]*1000', 'QD');
      const Ll = s1.i('L_nhánh', 'Chiều dài ống nhánh', p.dr_Llat, 'm', '', 'Bảng tính mẫu', 'Ll');
      const sL = s1.i('s_nhánh', 'Khoảng cách giữa các ống nhánh', p.dr_sLat, 'm', '', 'Bảng tính mẫu', 'sL');
      const NL = s1.i('N_L', 'Số ống nhánh', Math.max(ctr ? 4 : 2, Math.round(p.dr_NL)), 'ống', '', 'Bảng tính mẫu', 'NL');
      const Do = s1.i('D_o', 'Đường kính lỗ', p.dr_Do, 'mm', '3,2 – 6,4', 'Mass. DEP', 'Do');
      const sO = s1.i('s_lỗ', 'Khoảng cách giữa các lỗ', p.dr_sO, 'm', '0,6 – 1,8', 'Mass. DEP', 'sO');
      const hd = s1.i('h_d', 'Áp suất đầu cuối mục tiêu', p.dr_hd, 'm', '0,6 – 1,5', 'Mass. DEP', 'hd');
      const Qo = s1.o('Q_o', 'Lưu lượng mỗi lỗ', 0.1246 * Do * Do * Math.sqrt(hd), 'L/phút', '0,1246·D_o²·h_d^0,5', 'Mass. DEP', '0.1246*[Do]^2*[hd]^0.5', 'Qo');
      const no = s1.o('n_lỗ', 'Số lỗ mỗi ống nhánh', Ll / sO, 'lỗ/ống', 'L/s', 'Bảng tính mẫu', '[Ll]/[sO]', 'no');
      const QL = s1.o('Q_L', 'Lưu lượng mỗi ống nhánh', Qo * no, 'L/phút', '', '', '[Qo]*[no]', 'QL');
      const QT = s1.o('Q_T', 'Tổng lưu lượng bơm', QL * NL, 'L/phút', '', '', '[QL]*[NL]', 'QT');
      const s2 = u.sec('2. Đường kính ống nhánh — Hazen-Williams D = 115,5(Q/C)^0,38(ΔP/L)^−0,205');
      const C = s2.i('C', 'Hệ số Hazen-Williams', p.dr_C, '-', 'PVC 150', '', 'C');
      const dP = s2.o('ΔP', 'Tổn thất áp cho phép (10 % h_d)', 0.1 * hd * 9.81, 'kPa', '0,1·h_d·9,81', 'Bảng tính mẫu', '0.1*[hd]*9.81', 'dP');
      const LHW = s2.o('L_HW', 'Chiều dài ống nhánh đến lỗ cuối', Ll - sO / 2, 'm', 'L − s/2', '', '[Ll]-[sO]/2', 'LHW');
      const DLm = s2.o('D_L,min', 'Đường kính ống nhánh tối thiểu', 115.5 * Math.pow(QL * 60 / 1000 / C, 0.38) * Math.pow(dP / LHW, -0.205), 'mm', '115,5(Q/C)^0,38·(ΔP/L)^−0,205', 'Hazen-Williams', '115.5*(([QL]*60/1000)/[C])^0.38*([dP]/[LHW])^(-0.205)', 'DLm');
      const DL = s2.o('D_L', 'Ống nhánh chọn – PVC Sch.40 (ID)', pick(DLm)[1], 'mm', `DN${pick(DLm)[0]}`, 'PVC Sch.40', null, 'DL');
      const s3 = u.sec('3. Đường kính ống phân phối — D_m = 25,4[L_i·ΣF_i/(f·h_d)]^0,21; F_i = 8,351·10⁻⁵·Q_i^1,85');
      const nseg = s3.o('n_đoạn', 'Số đoạn ống phân phối', ctr ? Math.max(1, (NL - 2) / 2) : NL - 1, 'đoạn ống', ctr ? '(N_L − 2)/2 (cấp ở giữa)' : 'N_L − 1 (cấp ở đầu)', 'Bảng tính mẫu', ctr ? 'MAX(1,([NL]-2)/2)' : '[NL]-1', 'nseg');
      let SF = 0; for (let i = 1; i <= Math.round(nseg); i++) SF += 8.351e-5 * Math.pow(i * QL, 1.85);
      s3.o('ΣF_i', 'Tổng F_i các đoạn', SF, '-', 'Σ 8,351·10⁻⁵·(i·Q_L)^1,85', 'Bảng tính mẫu', null, 'SF');
      const f = s3.i('f', 'Phần tổn thất h_d cho ống phân phối', p.dr_f, '-', '0,1', 'Mass. DEP', 'f');
      const Li = s3.i('L_i', 'Chiều dài đoạn ống phân phối', p.dr_Li, 'm', '', '', 'Li');
      const DMm = s3.o('D_M,min', 'Đường kính ống phân phối tối thiểu', 25.4 * Math.pow(Li * SF / (f * hd), 0.21), 'mm', '25,4[L_i·ΣF_i/(f·h_d)]^0,21', 'Mass. DEP', '25.4*([Li]*[SF]/([f]*[hd]))^0.21', 'DMm');
      const DM = s3.o('D_M', 'Ống phân phối chọn – PVC Sch.40 (ID)', pick(DMm)[1], 'mm', `DN${pick(DMm)[0]}`, 'PVC Sch.40', null, 'DM');
      const s4 = u.sec('4. Thể tích liều nạp & số liều mỗi ngày');
      const VL = s4.o('V_nhánh', 'Tổng thể tích ống nhánh', Ll * NL * PI * Math.pow(DL / 2000, 2) * 1000, 'L', 'L·N·π·D²/4', '', '[Ll]*[NL]*PI()*([DL]/2000)^2*1000', 'VL');
      const nd = s4.i('n_liều', 'Số liều nạp / ngày', p.dr_dose, 'liều', '', 'Bảng tính mẫu', 'nd');
      const Vd = s4.o('V_liều', 'Thể tích mỗi liều', QD / nd, 'L', 'Q_D/n', '', '[QD]/[nd]', 'Vd');
      s4.chk('Thể tích liều nạp = 5 – 10 lần thể tích ống nhánh', Vd >= 5 * VL - 1e-6 && Vd <= 10 * VL + 1e-6, 'ĐẠT', `Chọn số liều trong khoảng ${fx(QD / (10 * VL), 1)} – ${fx(QD / (5 * VL), 1)} liều/ngày`, 'Mass. DEP', true, 'AND([Vd]>=5*[VL],[Vd]<=10*[VL])');
      const s5 = u.sec('5. Tổn thất cột nước & bơm định lượng');
      const Dm = s5.i('D_chính', 'Ống chính áp lực (ID)', p.dr_Dmain, 'mm', '', '', 'Dmain');
      const Lm = s5.i('L_chính', 'Chiều dài ống chính áp lực', p.dr_Lmain, 'm', '', '', 'Lmain');
      const hm = s5.o('h_m', 'Tổn thất ống chính', 6.076e6 * Lm * Math.pow(QT / (C * Math.pow(Dm, 2.63)), 1.85), 'm', '6,076·10⁶·L(Q/(C·D^2,63))^1,85', 'Hazen-Williams', '6076000*[Lmain]*([QT]/([C]*[Dmain]^2.63))^1.85', 'hm');
      const hf = s5.i('h_pk', 'Tổn thất qua phụ kiện', p.dr_hf, 'm', '', '', 'hf');
      const hs = s5.i('h_tĩnh', 'Chênh cao đáy ống nhánh trên cửa ra bơm', p.dr_hst, 'm', '', '', 'hst');
      const hn = s5.o('h_mạng', 'Tổn thất mạng phân phối', 1.31 * hd, 'm', '1,31·h_d', 'Mass. DEP', '1.31*[hd]', 'hn');
      const Hp = s5.o('H_bơm', 'Cột áp bơm yêu cầu', hf + hs + hm + hn, 'm', 'h_pk + h_tĩnh + h_m + h_mạng', 'Bảng tính mẫu', '[hf]+[hst]+[hm]+[hn]', 'Hp');
      s5.o('Q_bơm', 'Lưu lượng bơm', QT, 'L/phút', '= Q_T', '', '[QT]', 'Qp');
      const s6 = u.sec('6. Bể bơm định lượng & tải trọng thấm');
      const Vdb = s6.o('V_hồi', 'Thể tích nước hồi (ống phân phối + ống chính)', nseg * Li * PI * Math.pow(DM / 2000, 2) * 1000 + Lm * PI * Math.pow(Dm / 2000, 2) * 1000, 'L', '', 'Bảng tính mẫu', '[nseg]*[Li]*PI()*([DM]/2000)^2*1000+[Lmain]*PI()*([Dmain]/2000)^2*1000', 'Vdb');
      const Vt = s6.o('V_bể', 'Thể tích bể bơm (liều + hồi + dự phòng 1 ngày)', Vd + Vdb + QD, 'L', '', 'Bảng tính mẫu', '[Vd]+[Vdb]+[QD]', 'Vt');
      const Ab = s6.o('A_thấm', 'Diện tích bãi thấm', NL * sL * Ll, 'm²', 'N_L·s·L', '', '[NL]*[sL]*[Ll]', 'Ab');
      const LT = s6.i('LTAR', 'Tải trọng thấm dài hạn cho phép', p.dr_LTAR, 'L/m²·ngđ', 'Theo thí nghiệm thấm', 'USEPA 2002 Bảng 4-3', 'LTAR');
      const qa = s6.o('q_thấm', 'Tải trọng thấm thực tế', QD / Ab, 'L/m²·ngđ', 'Q_D/A', '', '[QD]/[Ab]', 'qa');
      s6.chk('Tải trọng thấm ≤ LTAR', qa <= LT + 1e-9, 'ĐẠT', 'Tăng diện tích bãi thấm (số / chiều dài ống nhánh)', 'USEPA 2002', false, '[qa]<=[LTAR]');
      if (QD > 7500) s6.note('Lưu lượng > 7.500 L/ngđ: bố trí 2 bơm chạy luân phiên (Mass. DEP).');
      s6.note('Cao độ đỉnh ống phân phối thấp hơn đáy ống nhánh để nước tự hồi về bể bơm sau mỗi liều; lớp đá đệm dưới ống nhánh ≥ 0,15 m, mực nước ngầm cao nhất cách đáy bãi thấm ≥ 0,6 – 1,2 m.');
      const B = ctr ? NL / 2 * sL : NL * sL, Lg = ctr ? 2 * Ll + 1 : Ll + 1;
      u.geom = { type: 'rect', L: Lg, B, H: 0.9, fb: 0.3, n: 1, zones: [{ name: 'BÃI THẤM', len: Lg }], label: 'BÃI THẤM' };
      u.V = Vt / 1000; u.A = Ab; u.H = 0.6; u.hl = 0; u.kW = 9.81 * QT / 60000 * Hp / 0.5;
      u.dims = `${NL} ống nhánh × ${fx(Ll)} m (DN${pick(DLm)[0]}); ống phân phối DN${pick(DMm)[0]}; A ${fx(Ab, 0)} m²`; u.hrt = `${fx(nd, 0)} liều/ngày`;
      R.equip.push({ u: u.name, name: 'Bơm chìm định lượng bãi thấm', spec: `${fx(QT * 60 / 1000)} m³/h × ${fx(Hp)} m`, qty: QD > 7500 ? 2 : 1, note: QD > 7500 ? 'Chạy luân phiên' : '' });
      R.equip.push({ u: u.name, name: 'Ống nhánh PVC khoan lỗ + ống phân phối + đá đệm', spec: `${fx(NL * Ll)} m ống nhánh`, qty: Math.ceil(NL * Ll), note: 'Đơn giá theo m', unitPrice: 0.35 });
      R.equip.push({ u: u.name, name: 'Bể bơm định lượng + phao điều khiển liều', spec: `${fx(Vt / 1000)} m³`, qty: 1, note: '', unitPrice: 40 + 3 * Vt / 1000 });
      R.special.disp = { Ab, qa, Hp };
    }

    /* ======================= XỬ LÝ BÙN ======================= */
    const Mchem = (cept ? cept.Ms : 0) + (tert ? tert.Ms : 0) + (aop ? aop.Ms : 0) + (mh ? mh.Ms : 0);
    const Mbio = bioRes.sludge + simulSludge + (ana ? ana.Px : 0) + (tdn ? tdn.PX : 0);
    const Mtot = Mchem + Mbio;
    const sl = { Mchem, Mbio, Mtot };
    const u0s = new Unit(R, 'sl0', 'BUN', 'Khối lượng bùn phát sinh', 'info2');
    {
      const s = u0s.sec('1. Khối lượng bùn — M&E Ch.13, 14');
      s.o('M_hóa lý', 'Bùn hóa lý khô', Mchem, 'kg DS/ngđ', 'Σ bùn cụm hóa lý', 'M&E VD 6-1', [cept ? '[hl.Ms]' : '', tert ? '[hl3.Ms]' : '', aop && aop.Ms > 0 ? '[aop.Ms]' : '', mh ? '[mh.Ms]' : ''].filter(Boolean).join('+') || '0', 'Mchem');
      s.o('M_sinh học', 'Bùn sinh học dư' + (simulSludge ? ' (kể bùn hóa học khử P đồng thời)' : ''), Mbio, 'kg DS/ngđ', 'P_X,TSS (M&E, có SS trơ) – chung mọi phương án', 'Quy tắc R06', bioRes.sludgeX + (simulSludge ? '+[bio.Xsim]' : '') + (ana ? '+[ana.PXa]' : '') + (tdn ? '+[tdn.PXw]' : ''), 'Mbio');
      s.o('ΣM', 'Tổng bùn khô', Mtot, 'kg DS/ngđ', '', '', '[Mchem]+[Mbio]', 'Mtot');
      s.o('m', 'Suất phát sinh bùn khô', Mtot / Q * 1000, 'g DS/m³', '', '', '[Mtot]/[info.Q]*1000', 'msp');
    }
    let thVX = [];
    let thV = 0;
    if (c.thick === 'gravity') {
      const mk = (id, code, name, M, MX, SLR, C, SG) => {
        const u = new Unit(R, id, code, name, 'bun');
        const s = u.sec('1. ' + name + ' — M&E Bảng 13-19, mục 13-6');
        s.o('M', 'Khối lượng bùn khô', M, 'kg DS/ngđ', '', '', MX, 'M');
        const sl_ = s.i('SLR', 'Tải trọng chất rắn', SLR, 'kg/m²·ngđ', '', 'Bảng 13-19', 'SLR');
        const A = s.o('A', 'Diện tích bể nén', M / sl_, 'm²', 'A = M/SLR', 'M&E VD 13-4', '[M]/[SLR]', 'A');
        const D = s.o('D', 'Đường kính', Math.max(3, ceilTo(Math.sqrt(4 * A / PI), 0.5)), 'm', 'làm tròn 0,5 m (≥ 3 m)', '', 'MAX(3,CEILING(SQRT(4*[A]/PI()),0.5))', 'D');
        const H = s.i('H', 'Chiều sâu', p.th_H, 'm', '', 'M&E mục 13-6', 'H');
        const Cc = s.i('C_nén', 'Nồng độ bùn sau nén', C, '% DS', '', 'Bảng 13-19', 'C');
        const V = s.o('V_bùn', 'Lưu lượng bùn sau nén', M / (SG * 1000 * Cc / 100), 'm³/ngđ', 'M/(SG·1000·%DS)', '', `[M]/(${SG}*1000*[C]/100)`, 'Vb');
        u.geom = { type: 'circ', D, H: H + p.fb, fb: p.fb, n: 1, label: 'NÉN BÙN', cone: true };
        u.V = PI * D * D / 4 * H; u.A = PI * D * D / 4; u.dims = `D ${fx(D)} m, H ${fx(H)} m`; u.kW = 1.5; u.H = H;
        R.equip.push({ u: u.name, name: 'Cầu gạt bể nén bùn', spec: `D = ${fx(D)} m; 1,5 kW`, qty: 1, note: '' });
        thVX.push(`[${id}.Vb]`);
        return V;
      };
      if (Mchem > 0) thV += mk('thc', 'NB-HL', 'Bể nén bùn hóa lý', Mchem, '[sl0.Mchem]', p.th_SLR_chem, p.th_C_chem, 1.03);
      if (Mbio > 0) thV += mk('thb', 'NB-SH', 'Bể nén bùn sinh học', Mbio, '[sl0.Mbio]', p.th_SLR_bio, p.th_C_bio, 1.005);
    } else if (c.thick !== 'gbt') {
      // DAF / ly tâm / trống quay cô đặc (M&E 5th Bảng 13-19)
      const nm = DATA.optName('thick', c.thick);
      const u = new Unit(R, 'thm', 'NB-CK', nm, 'bun');
      const s = u.sec('1. ' + nm + ' — M&E mục 13-6');
      s.i('h', 'Giờ vận hành', 24, 'h', 'Liên tục', '', 'h');
      const Mh = s.o('M_h', 'Bùn khô cấp / giờ', Mtot / 24, 'kg DS/h', '', '', '[sl0.Mtot]/24', 'Mh');
      const cap = s.i('η', 'Hiệu suất thu hồi chất rắn', p.th2_cap, '%', '90 – 98', 'M&E Bảng 13-19', 'eta');
      const C = s.i('C', 'Nồng độ sau cô đặc', p.th2_C, '% DS', '4 – 6', 'M&E Bảng 13-19', 'C');
      thV = s.o('V_bùn', 'Lưu lượng bùn sau cô đặc', Mtot * cap / 100 / (1.02 * 1000 * C / 100), 'm³/ngđ', 'M·η/(SG·1000·%DS)', '', '[sl0.Mtot]*[eta]/100/(1.02*1000*[C]/100)', 'Vb');
      const pol = s.i('c_poly', 'Polymer', p.th2_poly, 'kg/tấn DS', '', '', 'cp');
      const kWh = s.i('e', 'Điện năng', p.th2_kWh, 'kWh/tấn DS', '', 'Catalogue', 'e');
      thVX.push('[thm.Vb]');
      if (c.thick === 'daf') { const A = Mh / 4; s.o('A', 'Diện tích DAF (tải 4 kg/m²·h có polymer)', A, 'm²', '', 'M&E mục 13-6', '[Mh]/4', 'A'); const B = ceilTo(Math.sqrt(A / 3), 0.5); u.geom = { type: 'rect', L: ceilTo(A / B, 0.5) + 1, B, H: 3, fb: 0.5, n: 1, label: 'DAF CÔ ĐẶC' }; }
      else u.geom = { type: 'bld', L: 8, B: 6, label: 'CÔ ĐẶC' };
      u.A = u.geom.L * u.geom.B; u.dims = c.thick === 'daf' ? `${fx(u.geom.L)} × ${fx(u.geom.B)} m` : `${fx(Mh)} kg DS/h`; u.kW = kWh * Mtot / 1000 / 24;
      if (pol > 0) R.chem.push({ name: 'Polymer – cô đặc bùn', dose: pol * Mtot / 1000 / Q * 1000, kg: pol * Mtot / 1000, unit: 'kg sản phẩm', price: 'p_poly', note: '', ref: u.ids.cp });
      R.equip.push({ u: u.name, name: nm, spec: `${fx(Mh)} kg DS/h; ${fx(u.kW)} kW`, qty: 2, note: '1 + 1' });
    } else {
      const u = new Unit(R, 'gbt', 'GBT', 'Cô đặc bùn băng tải (GBT)', 'bun');
      const s = u.sec('1. Thiết bị cô đặc băng tải — M&E mục 13-6');
      s.i('h', 'Giờ vận hành', p.dw_h, 'h', '', '', 'h'); s.i('ngày', 'Ngày vận hành/tuần', p.dw_days, 'ngày', '', '', 'd');
      const Mh = s.o('M_h', 'Bùn khô cấp / giờ', Mtot * 7 / p.dw_days / p.dw_h, 'kg DS/h', 'M·7/ngày/h', '', '[sl0.Mtot]*7/[d]/[h]', 'Mh');
      const BL = s.i('BL', 'Tải trọng trên 1 m băng', p.gbt_BL, 'kg DS/m·h', '200 – 600', 'M&E mục 13-6', 'BL');
      s.o('W_yc', 'Bề rộng băng yêu cầu', Mh / BL, 'm', '', '', '[Mh]/[BL]', 'Wr');
      const W = s.i('W', 'Bề rộng băng chọn', pickUp(Mh / BL, [1, 1.5, 2, 2.5, 3]), 'm', 'Cỡ tiêu chuẩn 1 – 3 m', 'Catalogue', 'W');
      s.i('C', 'Nồng độ sau cô đặc', p.gbt_C, '% DS', '', '', 'C');
      thV = s.o('V_bùn', 'Lưu lượng bùn sau cô đặc', Mtot / (1.02 * 1000 * p.gbt_C / 100), 'm³/ngđ', '', '', '[sl0.Mtot]/(1.02*1000*[C]/100)', 'Vb');
      thVX.push('[gbt.Vb]');
      u.geom = { type: 'bld', L: 6, B: 4, label: 'GBT' }; u.A = 24; u.dims = `W = ${fx(W)} m`; u.kW = 4;
      R.equip.push({ u: u.name, name: 'Thiết bị cô đặc băng tải', spec: `W = ${fx(W)} m; 4 kW`, qty: 2, note: '1 + 1' });
    }
    /* ---------- Ổn định bùn (M&E 5th Ch.13): phân hủy kỵ khí ấm/nóng, phân hủy hiếu khí, vôi ---------- */
    let Mdw = Mtot, MdwX = '[sl0.Mtot]', stabR = null;
    const fVSmix = Mtot > 0 ? (Mbio * Math.min(0.85, Math.max(0.55, +(R.um.bio && R.um.bio.ids.PXVSS && R.um.bio.ids.PXTSS ? R.um.bio.ids.PXVSS.val / R.um.bio.ids.PXTSS.val : 0.75))) + Mchem * 0.4) / Mtot : 0.7;
    if (c.stab && c.stab !== 'none' && Mtot > 0) {
      const u = new Unit(R, 'stab', 'ODB', 'Ổn định bùn – ' + DATA.optName('stab', c.stab), 'bun');
      const s = u.sec('1. Bùn vào — M&E 5th Ch.13');
      s.o('M', 'Bùn khô vào', Mtot, 'kg DS/ngđ', '', '', '[sl0.Mtot]', 'M');
      const fv = s.i('VS/TS', 'Tỷ lệ chất rắn bay hơi', fVSmix, '-', 'Bùn sinh học 0,7 – 0,8; hóa lý 0,3 – 0,45', 'M&E Bảng 13-?', 'fVS');
      const VS = s.o('VS', 'Chất rắn bay hơi vào', Mtot * fv, 'kg VS/ngđ', '', '', '[M]*[fVS]', 'VS');
      const Qs = s.o('Q_bùn', 'Lưu lượng bùn sau cô đặc', thV, 'm³/ngđ', '', '', thVX.join('+') || '0', 'Qs');
      let Mo = Mtot, MoX = '[M]', NH4 = 0, PO4 = 0, kW = 0;
      const T = +I.Tmin;
      if (c.stab === 'mad' || c.stab === 'tad') {
        const hot = c.stab === 'tad', Td = hot ? 55 : 35;
        const s2 = u.sec('2. Bể phân hủy kỵ khí ' + (hot ? 'nóng 55 °C' : 'ấm 35 °C'));
        const byVS = p.ad_LVS > 0;
        let SRT, V;
        if (byVS) {
          const LVd = s2.i('L_VS,tk', 'Tải trọng VS thiết kế (tiêu chí định cỡ)', +p.ad_LVS, 'kg VS/m³·ngđ', '1,6 – 4,8', 'M&E Bảng 13-?; bảng tính Anaerobic Digester', 'LVSd');
          V = s2.o('V', 'Thể tích công tác', VS / LVd, 'm³', 'VS/L_VS', 'Bảng tính Anaerobic Digester', '[VS]/[LVSd]', 'V');
          SRT = s2.o('SRT', 'Thời gian lưu SRT = HRT (bể khuấy trộn hoàn toàn)', V / Math.max(Qs, 1e-6), 'ngày', 'V/Q_bùn', 'M&E mục 13-9', '[V]/[Qs]', 'SRT');
        } else {
          SRT = s2.i('SRT', 'Thời gian lưu SRT = HRT', hot ? p.ad_SRTt : p.ad_SRT, 'ngày', hot ? '10 – 15' : '15 – 20', 'M&E mục 13-9; bảng tính Anaerobic Digester', 'SRT');
          V = s2.o('V', 'Thể tích công tác', Qs * SRT, 'm³', 'Q·SRT', 'M&E mục 13-9', '[Qs]*[SRT]', 'V');
        }
        const n = s2.i('n', 'Số bể', p.ad_n, 'bể', '', '', 'n');
        const swd = p.ad_SWD > 0;
        const D = swd ? s2.o('D', 'Đường kính 1 bể (theo chiều sâu thành bể)', ceilTo(Math.sqrt(4 * V / n / PI / p.ad_SWD), 0.1), 'm', '√(4V/(n·π·SWD)), làm tròn 0,1 m', 'Bảng tính Anaerobic Digester', `CEILING(SQRT(4*[V]/[n]/PI()/${p.ad_SWD}),0.1)`, 'D')
          : s2.o('D', 'Đường kính 1 bể', ceilTo(Math.cbrt(4 * V / n / PI / p.ad_HD), 0.5), 'm', 'V = n·π·D²/4·(H/D)·D', '', `CEILING((4*[V]/[n]/PI()/${p.ad_HD})^(1/3),0.5)`, 'D');
        const H = s2.o('H', 'Chiều cao nước', ceilTo(V / n / (PI * D * D / 4), 0.1), 'm', '', '', 'CEILING([V]/[n]/(PI()*[D]^2/4),0.1)', 'H');
        s2.o('L_VS', 'Tải trọng chất rắn bay hơi', VS / V, 'kg VS/m³·ngđ', '1,6 – 4,8', 'M&E Bảng 13-?', '[VS]/[V]', 'LVS');
        s2.chk('SWD 7,5 – 15 m; D 6 – 38 m', H >= 7.5 - 1e-6 && H <= 15 + 1e-6 && D >= 6 - 1e-6 && D <= 38 + 1e-6, 'ĐẠT', 'Ngoài dải kích thước thông dụng – đổi số bể / chiều sâu', 'Bảng tính Anaerobic Digester', true, 'AND([H]>=7.5,[H]<=15,[D]>=6,[D]<=38)');
        s2.chk('Tải trọng VS 1,6 – 4,8 kg/m³·ngđ', VS / V >= 1.6 - 1e-6 && VS / V <= 4.8 + 1e-6, 'ĐẠT', 'Ngoài dải bể khuấy trộn tải cao', 'M&E Bảng 13-?', true, 'AND([LVS]>=1.6,[LVS]<=4.8)');
        const Vd = s2.o('V_d', 'Mức phân hủy VS', Math.min(70, Math.max(30, 13.7 * Math.log(SRT) + 18.9 + (hot ? 5 : 0))), '%', 'V_d = 13,7·ln(SRT) + 18,9' + (hot ? ' + 5' : ''), 'M&E PT (13-?)', `MIN(70,MAX(30,13.7*LN([SRT])+18.9${hot ? '+5' : ''}))`, 'Vd');
        const VSd = s2.o('VS_pH', 'VS bị phân hủy', VS * Vd / 100, 'kg VS/ngđ', '', '', '[VS]*[Vd]/100', 'VSd');
        const s3 = u.sec('3. Biogas & năng lượng');
        const G = s3.o('V_biogas', 'Biogas', VSd * p.ad_gas, 'm³/ngđ', '0,75 – 1,12 m³/kg VS phân hủy', 'M&E mục 13-9', `[VSd]*${p.ad_gas}`, 'Vg');
        const CH4 = s3.o('V_CH₄', 'CH₄', G * p.ad_fCH4, 'm³/ngđ', '', '', `[Vg]*${p.ad_fCH4}`, 'VCH4');
        const E = s3.o('E_điện', 'Điện phát CHP', CH4 * 9.97 * p.ad_eCHP, 'kWh/ngđ', 'CH₄·9,97·η_điện', '', `[VCH4]*9.97*${p.ad_eCHP}`, 'Eel');
        const Hs = s3.o('Q_gia nhiệt', 'Nhiệt nâng nhiệt độ bùn + tổn thất 15 %', Qs * 1000 * 4.186 * Math.max(Td - T, 0) / 3600 * 1.15, 'kWh/ngđ', 'Q·ρ·c·ΔT·1,15', 'M&E VD 13-?', `[Qs]*1000*4.186*MAX(${Td}-[info.T],0)/3600*1.15`, 'Qh');
        const Hr = s3.o('Q_thu hồi', 'Nhiệt thu hồi CHP', CH4 * 9.97 * p.ad_eHeat, 'kWh/ngđ', '', '', `[VCH4]*9.97*${p.ad_eHeat}`, 'Qr');
        s3.chk('Nhiệt thu hồi ≥ nhiệt gia nhiệt', Hr >= Hs, 'ĐỦ (tự cân bằng nhiệt)', 'THIẾU – cần lò hơi phụ / nhiên liệu bổ sung', 'M&E mục 13-9', true, '[Qr]>=[Qh]');
        NH4 = s3.o('N_hl', 'NH₄-N giải phóng theo nước tách', VSd * p.ad_fN, 'kg N/ngđ', `${p.ad_fN} kg N/kg VS`, 'M&E mục 14-7', `[VSd]*${p.ad_fN}`, 'NH4');
        PO4 = s3.o('P_hl', 'PO₄-P giải phóng theo nước tách', VSd * p.ad_fP, 'kg P/ngđ', `${p.ad_fP} kg P/kg VS`, '', `[VSd]*${p.ad_fP}`, 'PO4');
        Mo = Mtot - VSd; MoX = '[M]-[VSd]';
        u.geom = { type: 'circ', D, H: H + 1, fb: 1, n, label: 'PHÂN HỦY KỴ KHÍ' }; u.V = V; u.A = n * PI * D * D / 4; u.n = n; u.H = H;
        u.dims = `${n} × D ${fx(D)} m, H ${fx(H)} m`; u.hrt = `${fx(SRT)} ngày`; kW = 0.006 * V + 3;
        R.special.sludgeGas = { Vg: G, CH4, Eel: E, heat: Hs, rec: Hr };
        R.equip.push({ u: u.name, name: 'Khuấy trộn bể phân hủy (khí nén biogas / cơ khí)', spec: `${fx(0.006 * V)} kW`, qty: n, note: '' });
        R.equip.push({ u: u.name, name: 'Trao đổi nhiệt bùn – nước nóng', spec: `${fx(Hs / 24)} kW nhiệt`, qty: 1, note: '' });
        R.equip.push({ u: u.name, name: 'Bồn chứa khí + đuốc đốt + máy phát CHP', spec: `${fx(G / 24)} m³/h biogas; ${fx(E / 24)} kWe`, qty: 1, note: 'Bộ' });
      } else if (c.stab === 'aed') {
        const s2 = u.sec('2. Bể phân hủy hiếu khí');
        const DD = s2.i('T·SRT', 'Nhiệt độ × SRT yêu cầu', p.ae_DD, 'ngày·°C', 'Class B', 'M&E Hình 13-?', 'DD');
        const SRT = s2.o('SRT', 'SRT thiết kế', Math.max(DD / Math.max(T, 10), 15), 'ngày', 'max(T·SRT/T; 15)', '', 'MAX([DD]/MAX([info.T],10),15)', 'SRT');
        const V = s2.o('V', 'Thể tích', Qs * SRT, 'm³', 'Q·SRT', '', '[Qs]*[SRT]', 'V');
        const Vd = s2.o('V_d', 'Mức phân hủy VS', Math.min(50, Math.max(20, 7.2 * Math.log(Math.max(T, 10) * SRT) - 7)), '%', 'Theo T·SRT', 'M&E Hình 13-?', 'MIN(50,MAX(20,7.2*LN(MAX([info.T],10)*[SRT])-7))', 'Vd');
        const VSd = s2.o('VS_pH', 'VS bị phân hủy', VS * Vd / 100, 'kg VS/ngđ', '', '', '[VS]*[Vd]/100', 'VSd');
        const O2 = s2.o('O₂', 'Nhu cầu O₂', VSd * p.ae_O2, 'kg O₂/ngđ', `${p.ae_O2} kg O₂/kg VS`, 'M&E mục 13-?', `[VSd]*${p.ae_O2}`, 'O2');
        const air = s2.o('Q_khí', 'Lưu lượng khí (SOTE 8 %)', O2 / (0.279 * 0.08) / 1440, 'm³/phút', '', '', '[O2]/(0.279*0.08)/1440', 'air');
        Mo = Mtot - VSd; MoX = '[M]-[VSd]'; kW = air * 60 * 0.03;
        const H = 5, a = ceilTo(Math.sqrt(V / H / 2), 0.5);
        u.geom = { type: 'rect', L: 2 * a, B: a, H: H + p.fb, fb: p.fb, n: 1, label: 'PHÂN HỦY HIẾU KHÍ' }; u.V = V; u.A = 2 * a * a; u.H = H; u.dims = `${fx(2 * a)} × ${fx(a)} × ${H} m`; u.hrt = `${fx(SRT)} ngày`;
        R.equip.push({ u: u.name, name: 'Đĩa phân phối khí bể phân hủy hiếu khí', spec: `${fx(air)} m³/phút`, qty: 1, note: 'Khí từ nhà máy thổi khí' });
      } else {
        const s2 = u.sec('2. Ổn định bằng vôi (pH ≥ 12, ≥ 2 h)');
        const dl = s2.i('c_vôi', 'Liều Ca(OH)₂', p.lime_dose, 'kg/kg DS', '0,1 – 0,3', 'M&E mục 13-?', 'dl');
        const ML = s2.o('M_vôi', 'Vôi tiêu thụ', Mtot * dl, 'kg/ngđ', '', '', '[M]*[dl]', 'ML');
        const V = s2.o('V', 'Bể trộn vôi (2 h)', Math.max(Qs * 2 / 24, 5), 'm³', '', '', 'MAX([Qs]*2/24,5)', 'V');
        Mo = Mtot + ML * 0.7; MoX = '[M]+[ML]*0.7'; kW = 0.02 * V + 2;
        const a = ceilTo(Math.sqrt(V / 3), 0.1);
        u.geom = { type: 'rect', L: a, B: a, H: 3 + p.fb, fb: p.fb, n: 1, label: 'TRỘN VÔI' }; u.V = V; u.A = a * a; u.H = 3; u.dims = `${fx(a)} × ${fx(a)} × 3 m`;
        R.chem.push({ name: 'Vôi Ca(OH)₂ – ổn định bùn', dose: ML / Q * 1000, kg: ML, unit: 'kg sản phẩm', price: 'p_lime', note: '', ref: u.ids.ML });
      }
      const so = u.sec('4. Bùn sau ổn định');
      Mdw = so.o('M_ra', 'Bùn khô sau ổn định', Mo, 'kg DS/ngđ', '', '', MoX, 'Mo'); MdwX = '[stab.Mo]';
      u.kW = kW; u.hl = 0.3;
      stabR = { NH4, PO4, Mo, ratioN: 0, ratioP: 0 };
      if (NH4 > 0) {
        stabR.ratioN = so.o('ΔNH₄/NH₄', 'Tăng tải NH₄ do nước tách bể phân hủy', NH4 * 1000 / Q / Math.max(1, st3.NH4) * 100, '%', `so với giả định ${E.NH4.rec} % ở cân bằng`, '', '[NH4]*1000/[info.Q]/MAX(1,[bal.NH43])*100', 'ratioN');
        stabR.ratioP = so.o('ΔTP/TP', 'Tăng tải TP do nước tách bể phân hủy', PO4 * 1000 / Q / Math.max(0.1, st3.TP) * 100, '%', `so với giả định ${E.TP.rec} %`, '', '[PO4]*1000/[info.Q]/MAX(0.1,[bal.TP3])*100', 'ratioP');
        so.chk('Giả định tăng tải NH₄ do hoàn lưu ≥ tính toán', E.NH4.rec >= stabR.ratioN - 0.5, 'ĐẠT', 'Giả định thấp – tự nâng hệ số (quy tắc R08)', 'M&E mục 14-7', true, '[bal.e_NH4_rec]>=[ratioN]-0.5');
      }
    }
    {
      const u = new Unit(R, 'sst', 'BCB', 'Bể chứa – trộn bùn', 'bun');
      const s = u.sec('1. Bể chứa – trộn bùn — M&E mục 14-7');
      const Vb = s.o('V_bùn', 'Lưu lượng bùn hỗn hợp', thV, 'm³/ngđ', '', '', thVX.join('+') || '0', 'Vb');
      s.o('C', 'Nồng độ bùn hỗn hợp', Mdw / (Vb * 1.02 * 1000) * 100, '% DS', 'M/(V·SG·1000)', 'M&E VD 13-4', MdwX + '/([Vb]*1.02*1000)*100', 'C');
      const t = s.i('t', 'Thời gian lưu', p.sst_t, 'h', '12 – 24', 'M&E mục 14-7', 't');
      const V = s.o('V', 'Thể tích', Math.max(10, Vb * t / 24), 'm³', 'max(10; V·t/24)', '', 'MAX(10,[Vb]*[t]/24)', 'V');
      const H = s.i('H', 'Chiều sâu', p.sst_H, 'm', '', '', 'H');
      const a = s.o('L = B', 'Cạnh bể', ceilTo(Math.sqrt(V / H), 0.1), 'm', '√(V/H)', '', 'CEILING(SQRT([V]/[H]),0.1)', 'a');
      u.geom = { type: 'rect', L: a, B: a, H: H + p.fb, fb: p.fb, n: 1, label: 'CHỨA BÙN' };
      u.V = V; u.A = a * a; u.dims = `${fx(a)} × ${fx(a)} × ${fx(H)} m`; u.kW = 3; u.H = H;
      R.equip.push({ u: u.name, name: 'Máy khuấy chìm bể chứa bùn', spec: '3 kW', qty: 1, note: '' });
      sl.Vmix = Vb;
    }
    {
      const u = new Unit(R, 'dw', 'EB', 'Nhà khử nước bùn – ' + DATA.optName('dewater', c.dewater), 'bun');
      const s = u.sec('1. Khử nước bùn — M&E mục 13-6, Ch.14');
      const h = s.i('h', 'Giờ vận hành / ngày', p.dw_h, 'h', '', '', 'h');
      s.i('ngày', 'Số ngày vận hành / tuần', p.dw_days, 'ngày', '', '', 'd');
      const Mh = s.o('M_h', 'Bùn khô cấp / giờ', Mdw * 7 / p.dw_days / h, 'kg DS/h', 'Quy đổi 7 ngày về ca vận hành', '', MdwX + '*7/[d]/[h]', 'Mh');
      const n = s.i('n', 'Số máy (kể 1 dự phòng)', p.dw_n, 'máy', '', '', 'n');
      const duty = s.o('n_lv', 'Số máy làm việc', Math.max(1, n - 1), 'máy', '', '', 'MAX(1,[n]-1)', 'duty');
      let kW = 0, wash = 0, cake = p['cake_' + c.dewater], poly = p.dw_poly, spec = '', washX = '0';
      if (c.dewater === 'belt') {
        const BL = s.i('BL', 'Tải trọng trên 1 m băng', p.belt_BL, 'kg DS/m·h', 'Thử ép', 'M&E mục 13-6', 'BL');
        const Wr = s.o('W', 'Bề rộng băng yêu cầu', Mh / BL / duty, 'm', 'M_h/(BL·n_lv)', '', '[Mh]/[BL]/[duty]', 'Wr');
        const W = s.i('W_chọn', 'Bề rộng băng chọn', pickUp(Wr, [1, 1.5, 2, 2.5, 3]), 'm', 'Bảng 13-21: 1,0 – 3,0 m', 'Bảng 13-21', 'W');
        wash = s.o('Q_rửa', 'Nước rửa băng', 6 * W * duty, 'm³/h', '≈ 6 m³/h·m băng', 'Catalogue', '6*[W]*[duty]', 'wash');
        kW = (3 + 1.5 * W) * duty + 7.5; spec = `W = ${fx(W)} m; ${fx((3 + 1.5 * W))} kW`; washX = '[wash]';
      } else if (c.dewater === 'screw') {
        const cap = s.i('Cap', 'Công suất 1 máy (model)', pickUp(Mh / duty, [50, 100, 150, 200, 300, 400, 600, 800]), 'kg DS/h', '≥ M_h/n_lv', 'Catalogue', 'cap');
        wash = s.o('Q_rửa', 'Nước rửa', 0.5 * duty, 'm³/h', '', '', '0.5*[duty]', 'wash'); washX = '[wash]';
        kW = (0.5 + cap * 0.012) * duty + 5.5; spec = `${cap} kg DS/h; ${fx(0.5 + cap * 0.012)} kW`;
      } else if (c.dewater === 'centrifuge') {
        const cap = s.i('Cap', 'Công suất 1 máy (model)', pickUp(Mh / duty, [100, 200, 300, 500, 800, 1200, 1800]), 'kg DS/h', '≥ M_h/n_lv', 'Catalogue', 'cap');
        poly = p.dw_poly * 1.4; kW = (0.12 * cap + 7.5) * duty + 5.5; spec = `${cap} kg DS/h; ${fx(0.12 * cap + 7.5)} kW`;
      } else if (c.dewater === 'beds') {
        const ld = s.i('L_sân', 'Tải trọng chất rắn sân phơi', p.beds_load, 'kg DS/m²·năm', '100 – 160 (khí hậu nóng)', 'M&E mục 14-?', 'ld');
        const Ab = s.o('A_sân', 'Diện tích sân phơi', Mdw * 365 / ld, 'm²', 'M·365/L', '', MdwX + '*365/[ld]', 'Ab');
        s.o('n_ô', 'Số ô sân phơi (≈ 300 m²/ô)', Math.max(4, Math.ceil(Ab / 300 - 1e-9)), 'ô', '', '', 'MAX(4,ROUNDUP([Ab]/300,0))', 'nb');
        poly = 0; kW = 2; spec = `${fx(Ab)} m² sân phơi có lớp lọc cát – sỏi, ống thu nước`;
      } else {
        const Vcake = s.o('V_bánh', 'Thể tích bánh bùn / mẻ (3 mẻ/ngày)', Mdw * 7 / p.dw_days / 3 / (1150 * cake / 100), 'm³', 'M·7/ngày/3/(ρ·%DS)', '', `${MdwX}*7/[d]/3/(1150*${cake}/100)`, 'Vcake');
        const nch = s.o('n_buồng', 'Số buồng / máy (60 L/buồng)', Math.ceil(Vcake / 0.06 / duty - 1e-9), 'buồng', '', '', 'ROUNDUP([Vcake]/0.06/[duty],0)', 'nch');
        kW = 15 * duty + 7.5; spec = `${nch} buồng, tấm 1,5 m; 15 kW`;
      }
      const cap_ = s.i('η', 'Hiệu suất thu hồi chất rắn', p.capture, '%', '90 – 98', 'M&E mục 13-6', 'eta');
      const Cc = s.i('C_bánh', 'Độ khô bánh bùn', cake, '% DS', 'Thử ép mẫu thực tế', '', 'Cc');
      const Mc = s.o('M_bánh', 'Bánh bùn ướt', Mdw * cap_ / 100 / (Cc / 100) / 1000, 'tấn/ngđ', 'M·η/%DS', '', MdwX + '*[eta]/100/([Cc]/100)/1000', 'Mc');
      s.o('M_tháng', 'Bánh bùn / tháng', Mc * 30, 'tấn/tháng', '', '', '[Mc]*30', 'Mcm');
      s.i('c_poly', 'Liều polymer khử nước', poly, 'kg/tấn DS', '3 – 7', 'M&E mục 13-6', 'cp');
      const Mp = s.o('M_polymer', 'Polymer khử nước', Mdw / 1000 * poly, 'kg/ngđ', 'M/1000·c', 'M&E mục 13-6', MdwX + '/1000*[cp]', 'Mp');
      R.chem.push({ name: 'Polymer cation – khử nước bùn', dose: Mp / Q * 1000, kg: Mp, unit: 'kg sản phẩm', price: 'p_poly', note: 'M&E mục 13-6', ref: u.ids.Mp });
      R.equip.push({ u: u.name, name: DATA.optName('dewater', c.dewater), spec, qty: n, note: `${duty} + ${n - duty}`, spare: c.dewater === 'belt' ? 'belt' : null });
      R.equip.push({ u: u.name, name: 'Hệ pha & định lượng polymer', spec: `${fx(Mp)} kg/ngđ`, qty: 2, note: '' });
      R.equip.push({ u: u.name, name: 'Bơm bùn cấp máy khử nước', spec: `${fx(sl.Vmix / h * 7 / p.dw_days / duty)} m³/h`, qty: n, note: '' });
      const s2 = u.sec('2. Nước tách bùn hoàn lưu — M&E mục 14-7');
      const Cwas = bio === 'AGS' ? +p.ags_WASc : bio === 'KMBR' ? p.kb_MLSS / 1000 : bio === 'CTECH' ? p.ct_Cs * 1000 : bio === 'ICEAS' ? p.ic_SFws * 1000 : bio === 'MBR' ? p.mbr_MLSS * 1.25 / 1000 : bio === 'LAG' ? 100 : (bio === 'MBBR' || bio === 'TF' || (ub.fixed && !ub.fixed.hyb)) ? 10 : 1000 / p.SVI;
      const CwasX = bio === 'AGS' ? '[bio.WASc]' : bio === 'KMBR' ? '[bio.kX]/1000' : bio === 'CTECH' ? '[bio.cCs]*1000' : bio === 'ICEAS' ? '[bio.SFws]*1000' : bio === 'MBR' ? '[bio.XR]/1000' : bio === 'LAG' ? '100' : (bio === 'MBBR' || bio === 'TF' || (ub.fixed && !ub.fixed.hyb)) ? '10' : '[bio.XR]/1000';
      s2.o('C_bùn SH', 'Nồng độ bùn sinh học thô', Cwas, 'kg/m³', '', '', CwasX, 'Cwas');
      const Vraw = s2.o('V_bùn thô', 'Lưu lượng bùn thô (sinh học + hóa lý)', Mbio / Cwas + (cept ? cept.Vs : 0) + (tert ? tert.Vs : 0), 'm³/ngđ', 'M_SH/C + V_hóa lý', '', '[sl0.Mbio]/[Cwas]' + (cept ? '+[hl.Vs]' : '') + (tert ? '+[hl3.Vs]' : ''), 'Vraw');
      const Qr = s2.o('Q_hl', 'Lưu lượng nước tách bùn + nước rửa', Math.max(0, Vraw - Mc) + wash * h, 'm³/ngđ', 'V_bùn thô − V_bánh + nước rửa·h', 'M&E mục 14-7', `MAX(0,[Vraw]-[Mc])+${washX}*[h]`, 'Qr');
      const Mr = s2.o('M_TSS,hl', 'Chất rắn theo nước hoàn lưu', Mdw * (1 - cap_ / 100), 'kg DS/ngđ', 'M·(1 − η)', '', MdwX + '*(1-[eta]/100)', 'Mr');
      const dT = s2.o('ΔTSS', 'Mức tăng TSS nước thải', Mr * 1000 / Q, 'mg/L', '', '', '[Mr]*1000/[info.Q]', 'dT');
      const ratio = s2.o('ΔTSS/TSS', 'Tỷ lệ tăng tải TSS thực tế', dT / Math.max(1, st3.TSS) * 100, '%', `so với giả định ${E.TSS.rec} % ở cân bằng`, '', '[dT]/MAX(1,[bal.TSS3])*100', 'ratio');
      s2.chk('Giả định tăng tải TSS do hoàn lưu ≥ tính toán', E.TSS.rec >= ratio - 0.5, 'ĐẠT (thiên an toàn)', 'Giả định thấp hơn thực tế — tăng hệ số tăng tải TSS', '', true, '[bal.e_TSS_rec]>=[ratio]-0.5');
      if (c.dewater === 'beds') { const Ab = u.ids.Ab.val, Bb = ceilTo(Math.sqrt(Ab / 2), 1); u.geom = { type: 'rect', L: ceilTo(Ab / Bb, 1), B: Bb, H: 1.2, fb: 0.3, n: 1, label: 'SÂN PHƠI BÙN' }; u.A = Ab; u.dims = `${fx(u.geom.L)} × ${fx(Bb)} m`; u.kW = kW; }
      else { u.geom = { type: 'bld', L: 18, B: 12, label: 'NHÀ ÉP BÙN' }; u.A = 216; u.dims = '18 × 12 m'; u.kW = kW; }
      sl.cake = Mc; sl.poly = Mp; sl.Qrec = Qr; sl.Mrec = Mr; sl.final = Mc; sl.finalDS = Cc;
    }
    /* ---------- Làm khô bùn sau khử nước (M&E 5th Ch.14) ---------- */
    if (c.dry && c.dry !== 'none' && sl.cake > 0) {
      const sol = c.dry === 'solar', u = new Unit(R, 'dry', 'SB', sol ? 'Nhà sấy bùn năng lượng mặt trời' : 'Sấy nhiệt bùn', 'bun');
      const s = u.sec('1. ' + u.name + ' — M&E 5th mục 14-?');
      const Mi = s.o('M_vào', 'Bánh bùn vào', sl.cake, 'tấn/ngđ', '', '', '[dw.Mc]', 'Mi');
      const Ci = s.o('DS_vào', 'Độ khô bánh bùn', sl.finalDS, '% DS', '', '', '[dw.Cc]', 'Ci');
      const Co = s.i('DS_ra', 'Độ khô sản phẩm', sol ? p.dry_DS_solar : p.dry_DS_th, '% DS', sol ? '60 – 80' : '85 – 95', 'M&E mục 14-?', 'Co');
      const Mp2 = s.o('M_ra', 'Bùn khô sản phẩm', Mi * Ci / Co, 'tấn/ngđ', 'M·DS_vào/DS_ra', '', '[Mi]*[Ci]/[Co]', 'Mp');
      const W = s.o('W', 'Nước bay hơi', (Mi - Mi * Ci / Co) * 1000, 'kg/ngđ', '', '', '([Mi]-[Mp])*1000', 'W');
      if (sol) {
        const ev = s.i('e', 'Tốc độ bay hơi', p.dry_evap, 'kg/m²·ngđ', 'Nhiệt đới 2,5 – 4', 'M&E mục 14-?', 'ev');
        const A = s.o('A', 'Diện tích nhà sấy', W / ev, 'm²', 'W/e', '', '[W]/[ev]', 'A');
        const B = ceilTo(Math.sqrt(A / 3), 1);
        u.geom = { type: 'bld', L: ceilTo(A / B, 1), B, label: 'NHÀ SẤY MẶT TRỜI' }; u.A = A; u.dims = `${fx(u.geom.L)} × ${fx(B)} m`; u.kW = 0.02 * A;
        R.equip.push({ u: u.name, name: 'Robot đảo bùn + quạt thông gió nhà sấy', spec: `${fx(0.02 * A)} kW`, qty: 1, note: '' });
      } else {
        const eT = s.i('e', 'Nhiệt tiêu thụ', p.dry_eTh, 'kWh/kg nước', '0,8 – 1,0', 'M&E mục 14-?', 'eT');
        const Hq = s.o('Q_nhiệt', 'Nhiệt cần', W * eT, 'kWh/ngđ', '', '', '[W]*[eT]', 'Hq');
        s.o('P_nhiệt', 'Công suất nhiệt (20 h/ngày)', Hq / 20, 'kW', '', '', '[Hq]/20', 'Ph');
        u.geom = { type: 'bld', L: 15, B: 10, label: 'NHÀ SẤY' }; u.A = 150; u.dims = '15 × 10 m'; u.kW = 0.05 * W / 20 + 10;
        R.equip.push({ u: u.name, name: 'Máy sấy trống quay / băng tải + lò nhiệt + xử lý khí thải', spec: `${fx(W / 20)} kg nước/h; ${fx(Hq / 20)} kW nhiệt`, qty: 1, note: '' });
      }
      sl.final = Mp2; sl.finalDS = Co; sl.dryW = W;
    }
    R.sludge = sl;

    /* ---------- Nhà phụ trợ ---------- */
    const blowers = ub.nBlower || 0;
    if (blowers || airGrit || airEQ) {
      const nbw = blowers || 3;
      const u = new Unit(R, 'mtk', 'MTK', 'Nhà máy thổi khí', 'phutro');
      u.geom = { type: 'bld', L: Math.max(12, nbw * 4.5 + 4), B: 10, label: 'NHÀ MÁY THỔI KHÍ' };
      u.A = u.geom.L * u.geom.B; u.dims = `${fx(u.geom.L)} × ${fx(u.geom.B)} m`;
      u.sec('1. Bố trí').t2('Số máy thổi', `${nbw} máy (kể dự phòng)`, '', '');
    }
    {
      const nchem = R.chem.filter(x => x.kg > 0).length;
      const u = new Unit(R, 'nhc', 'NHC', 'Nhà hóa chất', 'phutro');
      u.geom = { type: 'bld', L: Math.max(12, 4 * nchem + 6), B: 10, label: 'NHÀ HÓA CHẤT' };
      u.A = u.geom.L * u.geom.B; u.dims = `${fx(u.geom.L)} × ${fx(u.geom.B)} m`;
      u.sec('1. Bố trí').t2('Số loại hóa chất', `${nchem} loại – bồn chứa ≥ 15 ngày`, '', '');
    }
    {
      const u = new Unit(R, 'ndh', 'NDH', 'Nhà điều hành – PTN', 'phutro');
      u.geom = { type: 'bld', L: 20, B: 10, label: 'NHÀ ĐIỀU HÀNH – PTN' }; u.A = 200; u.dims = '20 × 10 m';
      u.sec('1. Bố trí').t2('Chức năng', 'Phòng điều khiển SCADA, PTN, văn phòng', '', '');
    }

    /* ======================= CÂN BẰNG & ĐÁNH GIÁ ======================= */
    R.stages = [
      { k: 's1', name: '① Nước thô', v: st1 },
      { k: 's2', name: '② Sau tiền xử lý', v: st2 },
      { k: 's3', name: '③ Sau hóa lý (CEPT)', v: st3, skip: c.chemPos !== 'pre' },
      { k: 's4', name: '④ Vào sinh học', v: st4 },
      { k: 's5', name: '⑤ Sau sinh học', v: st5 },
      { k: 's6', name: '⑥ Sau hóa lý bậc 3 / lọc', v: st6, skip: c.chemPos !== 'post' && c.filt === 'none' },
      { k: 's7', name: '⑦ Sau khử trùng (xả)', v: st7 },
    ];
    R.eff = st7;
    R.compliance = [];
    {
      const s = ub0.sec('Đánh giá chất lượng nước sau xử lý so với ' + lim.name);
      for (const [key, nm, un] of DATA.QPARAMS) {
        if (L[key] === undefined) continue;
        const v = st7[key], ok = v <= L[key] + 1e-9;
        R.compliance.push({ key, nm, un, v, lim: L[key], ok });
        s.chk(nm + ' ≤ ' + fx(L[key]) + ' ' + un + ' (đạt ' + fx(v) + ')', ok, 'ĐẠT', 'KHÔNG ĐẠT', lim.name, false, `[${key}7]<=[info.L_${key}]+0.000000001`);
        const last = R.checks[R.checks.length - 1]; last.unit = 'Chất lượng nước sau xử lý'; last.code = 'OUT'; last.key = key; last.v = v; last.lim = L[key];
        last.name = nm + ' ≤ ' + fx(L[key]) + ' ' + un; last.text = ok ? 'ĐẠT (' + fx(v) + ')' : 'KHÔNG ĐẠT (' + fx(v) + ')';
      }
    }
    if (L.TN !== undefined && st7.TN > L.TN) warn('Tổng N sau xử lý vượt giới hạn — xem năng lực khử nitrat, carbon ngoài hoặc công nghệ khử N (AO/A²O/ICEAS).');

    /* ======================= THỦY LỰC, BƠM ======================= */
    hydraulics(R, S, p, c, hasEQ, { Qmaxh, Qpk_eff, Qpk3, Qeq, QpkRef });
    {
      const u = sump, s = u.sec('2. Trạm bơm nâng (bơm chìm trong bể gom)');
      const nw = s.i('n_lv', 'Số bơm làm việc', p.pump_nw, 'cái', '', '', 'nw');
      s.i('n_dp', 'Số bơm dự phòng', p.pump_ns, 'cái', '', '', 'ns');
      const Q1 = s.o('Q_bơm', 'Lưu lượng 1 bơm', Qmaxh / nw, 'm³/h', 'Q_max,h/n_lv', '', '[Q]/[nw]', 'Q1');
      const Hg = s.o('H_hh', 'Cột áp hình học (trắc dọc thủy lực)', R.hyd.HgeoSump, 'm', 'MN công trình đầu vào − MNTN bể gom', 'Tab Thủy lực', '[hydc.Hgs]', 'Hg');
      const hm = s.o('h_ống', 'Tổn thất ống đẩy (Hazen-Williams + cục bộ)', R.hyd.linkLoss.sump || 0, 'm', 'Bảng tính thủy lực', 'Hazen-Williams', R.hyd.linkRef.sump || '0', 'hm');
      const hw = s.i('h_tr', 'Tổn thất trong trạm bơm (ống góp, van)', p.pump_hw, 'm', '', '', 'hw');
      const hd = s.i('h_dp', 'Cột áp dự phòng', p.pump_hdp, 'm', '', '', 'hd');
      const Hb = s.o('H', 'Cột áp bơm yêu cầu', Hg + hm + hw + hd, 'm', 'H = H_hh + h_ống + h_tr + h_dp', 'M&E Ch.5', '[Hg]+[hm]+[hw]+[hd]', 'Hb');
      const eta = s.i('η', 'Hiệu suất tổ bơm', p.pump_eta, '-', '', 'Catalogue', 'eta');
      const N = s.o('N', 'Công suất trục 1 bơm', 9.81 * Q1 / 3600 * Hb / eta, 'kW', 'N = ρgQH/η', '', '9.81*[Q1]/3600*[Hb]/[eta]', 'N');
      s.o('ΣN', 'Công suất bơm làm việc', N * nw, 'kW', '', '', '[N]*[nw]', 'Nt');
      u.kW = N * nw; u.pump = { Q1, Hb, N, n: nw + p.pump_ns }; u.pumpRow = u.ids.Nt;
      R.equip.push({ u: u.name, name: 'Bơm chìm nước thải', spec: `${fx(Q1)} m³/h × ${fx(Hb)} m; ${fx(ceilTo(N * 1.15, 0.5))} kW`, qty: nw + p.pump_ns, note: `${nw} + ${p.pump_ns}` });
    }
    if (hasEQ) {
      const u = R.um.eq, s = u.sec('3. Bơm sau bể điều hòa');
      const Hg = s.o('H_hh', 'Cột áp hình học (trắc dọc)', R.hyd.HgeoEQ, 'm', '', 'Tab Thủy lực', '[hydc.Hge]', 'Hg');
      const hm = s.o('h_ống', 'Tổn thất ống đẩy', R.hyd.linkLoss.eq || 0, 'm', '', 'Hazen-Williams', R.hyd.linkRef.eq || '0', 'hm');
      s.i('h_tr', 'Tổn thất trong trạm bơm', p.pump_hw, 'm', '', '', 'hw'); s.i('h_dp', 'Cột áp dự phòng', p.pump_hdp, 'm', '', '', 'hd');
      // cột áp nhập tay (tab 4 – bể điều hòa) thay cho giá trị tính theo trắc dọc
      const Hb = S.pMan && S.pMan.eq_Hp ? s.i('H', 'Cột áp bơm (nhập tay)', p.eq_Hp, 'm', `Theo trắc dọc: ${fx(Hg + hm + p.pump_hw + p.pump_hdp)} m`, 'Tab 4', 'Hb')
        : s.o('H', 'Cột áp bơm', Hg + hm + p.pump_hw + p.pump_hdp, 'm', '', '', '[Hg]+[hm]+[hw]+[hd]', 'Hb');
      const N = s.o('N', 'Công suất 1 bơm (2 làm việc, η = 0,72)', 9.81 * (Qeq / 2) / 3600 * Hb / 0.72, 'kW', '', '', '9.81*([Qp]/2)/3600*[Hb]/0.72', 'N');
      s.o('ΣN', 'Công suất bơm làm việc', N * 2, 'kW', '', '', '[N]*2', 'Nt');
      u.kW = N * 2; u.pumpRow = u.ids.Nt;
      R.equip.push({ u: u.name, name: 'Bơm nước thải sau điều hòa', spec: `${fx(Qeq / 2)} m³/h × ${fx(Hb)} m; ${fx(ceilTo(N * 1.15, 0.5))} kW`, qty: 3, note: '2 + 1' });
    }

    /* ======================= ĐIỆN NĂNG ======================= */
    // fx: công thức sống cho sheet DienNang {kW, h, k} dạng '{{ref:unit.id}}' (F07, F16)
    const pw = (name, kW, h, k, note, ref, fx) => { if (kW > 0) R.power.push({ name, kW, h, k: k === undefined ? 1 : k, kWh: kW * h * (k === undefined ? 1 : k), note: note || '', ref, fx }); };
    pw('Bơm nâng bể gom', sump.kW, 24, 1, `${p.pump_nw} làm việc`, sump.pumpRow);
    pw('Song chắn rác cơ giới', R.um.scr.kW, 8);
    pw('Thiết bị tiền xử lý (lưới tinh, cầu hút cát, máy thổi lắng cát)', ctdv.kW, 12);
    if (hasEQ) pw('Bơm sau bể điều hòa', R.um.eq.kW, 24, 1, '', R.um.eq.pumpRow);
    if (cept) { pw('Máy khuấy cụm hóa lý trước SH', cept.u.kW, 24); pw('Thiết bị tách pha (CEPT)', cept.us.kW, 24); }
    if (bio === 'ICEAS') {
      pw('Máy thổi khí ICEAS (theo giờ sục khí)', ub.airP / 0.95, ub.airH, p.air_LF, 'Công suất trục/η động cơ 0,95; hệ số tải ' + p.air_LF, null, { kW: '{{ref:bio.Pwt}}/0.95', h: '{{ref:bio.TA}}', k: '{{ref:bio.LFi}}' });
      pw('Máy khuấy chìm ICEAS (pha Air-Off)', ub.mixkW, ub.mixH, 1, '', null, { kW: '{{ref:bio.Pmix}}*{{ref:bio.nb}}', h: '{{ref:bio.toff}}*{{ref:bio.cyc}}/60' });   // mixkW = 0 khi NIT → không ghi dòng
      pw('Bơm bùn dư ICEAS', 5.5 * ub.ic.nb, p.ic_SPT / 60 * ub.ic.cyc);
      pw('Decanter ICEAS', 1.5 * ub.ic.nb, ub.ic.ph.dec / 60 * ub.ic.cyc);
    } else if (bio === 'AGS') {
      const ag = ub.ags, A = ag.r.air;
      pw('Máy thổi khí NEREDA (điều khiển DO, biến tần)', A.kWdesign / 0.95, A.Eday / Math.max(A.kWdesign, 1e-6), p.air_LF, `${ag.r.equip.blowerDuty} máy chạy; điện năng theo AOR từng pha`, ub.ids.Pw);
      pw('Bơm bùn dư bùn hạt', 3 * ag.Nr, 2);
      pw('Van điều khiển & đo đạc NEREDA', 0.5 * ag.Nr, 24);
    } else if (bio === 'CTECH') {
      const ct = ub.ct;
      pw('Máy thổi khí C-Tech (điều khiển DO/OUR)', ct.Pw / 0.95 * ct.nRun, 24, p.air_LF, `${ct.nRun} máy chạy; hệ số tải ${p.air_LF}`, null, { kW: '{{ref:bio.cPw}}*{{ref:bio.cnRun}}/0.95', k: '{{ref:bio.cLF}}' });
      pw('Bơm RAS C-Tech (chạy trong pha F/A)', 9.81 * ct.QR / 3600 * 5 / 0.6 * ct.N, ct.TA);
      pw('Bơm SAS C-Tech', 9.81 * ct.QS / 3600 * 10 / 0.6 * ct.N, p.ct_tSAS / 60 * ct.ncy);
      pw('Decanter C-Tech', 2.2 * ct.N * p.ct_ndec, ct.TD * ct.ncy);
    } else {
      if (ub.airP) pw(bio === 'OD' ? 'Guồng khí mương oxy hóa' : 'Máy thổi khí (bể sinh học + phụ trợ)', ub.airP / (bio === 'OD' ? 1 : 0.95), ub.airH || 24, p.air_LF, 'Hệ số tải ' + p.air_LF, null, ub.ids.Pw ? { kW: '{{ref:bio.Pw}}' + (bio === 'OD' ? '' : '/0.95') } : null);
      if (ub.mixkW) pw('Máy khuấy vùng thiếu khí / kỵ khí', ub.mixkW, ub.mixH || 24);
      if (ub.RAS > 0 && bio !== 'SBR') pw('Bơm tuần hoàn bùn', 9.81 * ub.RAS * Qh / 3600 * 6 / 0.7, 24);
      if (ub.Qir) pw('Bơm tuần hoàn nội', 9.81 * ub.Qir / 24 / 3600 * 1.5 / 0.6, 24);
      if (bio === 'MBR') pw('Bơm hút màng MBR', ub.mbr.Pp, 22);
      if (bio === 'KMBR') pw('Bơm hút màng Kubota (lọc 9/nghỉ 1 phút)', ub.mbr.Pp, 24 * 0.9 / p.kb_kd);
      if (bio === 'SBR') pw('Decanter & bơm bùn SBR', 3 * ub.n, 6);
      if (bio === 'TF') pw('Bơm tuần hoàn lọc sinh học nhỏ giọt', ub.tfKW, 24);
    }
    if (R.um.clar) pw('Cầu gạt bể lắng thứ cấp', R.um.clar.kW, 24);
    if (tert) { pw('Máy khuấy cụm hóa lý bậc 3', tert.u.kW, 24); pw('Thiết bị tách pha bậc 3', tert.us.kW, 24); }
    if (R.um.filt) pw('Lọc bậc 3', R.um.filt.kW, 24);
    if (ana) pw('Xử lý yếm khí cấp 1 (bơm cấp, khuấy, tuần hoàn)', ana.kW, 24);
    if (mh) pw('Kết tủa hydroxit kim loại (khuấy, cầu gạt, định lượng)', mh.kW, 24);
    if (tdn) pw('Khử nitrat bậc 3 (khuấy, tuần hoàn bùn, sục khí lại)', tdn.kW, 24);
    if (R.um.disp) pw('Bơm định lượng bãi thấm', R.um.disp.kW, Math.max(0.5, Q / 24 / Math.max(1e-6, R.um.disp.ids.QT.val * 60 / 1000)));
    pw('Hệ khử trùng', R.um.dis.kW, 24);
    pw('Dây chuyền bùn (nén, bơm, khuấy)', ['thc', 'thb', 'gbt', 'sst'].reduce((a, k) => a + (R.um[k] ? R.um[k].kW : 0), 0), 24);
    pw('Thiết bị khử nước bùn', R.um.dw.kW, p.dw_h * p.dw_days / 7);
    pw('Bơm định lượng hóa chất', 6, 24);
    pw('Chiếu sáng, điều khiển, khử mùi, phụ trợ', 25, 24, 0.6);
    R.kWinst = R.power.reduce((a, x) => a + x.kW, 0);
    R.kWhd = R.power.reduce((a, x) => a + x.kWh, 0);

    /* ======================= CHI PHÍ ======================= */
    R.bioRes = bioRes;
    costs(R, S, p, OP);
    const tanks = R.units.filter(u => ['nuoc', 'hoaly', 'sinhhoc', 'bun'].includes(u.grp) && u.geom && u.geom.type !== 'bld');
    const Vt = tanks.reduce((a, u) => a + (u.V || 0), 0);
    const At = R.units.filter(u => u.geom).reduce((a, u) => a + (u.A || footprintArea(u.geom)), 0);
    const bld = R.units.filter(u => u.geom && u.geom.type === 'bld').reduce((a, u) => a + u.A, 0);
    R.kpi = {
      Vt, At, Asite: At * 2.2, bld, kWinst: R.kWinst, kWhd: R.kWhd, kWhm3: R.kWhd / Q,
      Mtot: sl.Mtot, cake: sl.cake, chemKg: R.chem.reduce((a, x) => a + x.kg, 0), Vbio: bioRes.Vtot, HRTbio: bioRes.Vtot / Q * 24,
      // nFail: lỗi thiết kế (không tính chỉ tiêu xả – đếm riêng ở nOut để không trùng); nWarn: lưu ý (kể kiểm tra số liệu đầu vào)
      nFail: R.checks.filter(x => !x.ok && !x.soft && x.code !== 'OUT').length, nWarn: R.checks.filter(x => !x.ok && x.soft).length,
      nOut: R.compliance.filter(x => !x.ok).length, comply: R.compliance.every(x => x.ok),
    };
    for (const x of R.checks) if (!x.ok && !x.soft) warn(`${x.code} – ${x.name}: ${x.text}`);
    if (!hasEQ && DATA.CONTINUOUS[bio]) warn('Công nghệ dòng liên tục nhưng không bố trí bể điều hòa — nước thải KCN biến động nồng độ; kiểm tra lại.');
    if (c.chemPos === 'pre' && bio !== 'CAS') warn('Hóa lý đặt TRƯỚC sinh học làm giảm carbon cho khử nitrat — kiểm tra kết quả khử N và carbon ngoài.');
    if (hasEQ && c.chemPos === 'pre') R.info.push('Bể điều hòa đặt trước cụm hóa lý (M&E mục 3-7) để liều hóa chất ổn định theo lưu lượng đều.');
    R.st = { st1, st2, st3, st3a: ana ? st3a : null, st4, st5, st5b: tdn ? st5b : null, st6a, st6b, st6, st7 };
    if (R.xerr.length) console.warn('Lỗi tham chiếu công thức:', R.xerr);
    return R;
  }

  /* ---------------- Thủy lực đường ống + trắc dọc ---------------- */
  function hydraulics(R, S, p, c, hasEQ, F) {
    const um = R.um, OV = (S.opex && S.opex.hydOv) || {};
    const uh = new Unit(R, 'hydc', 'TL', 'Tính toán thủy lực – đường ống & cao độ mực nước', 'info2');
    const seqIds = ['ctdv', hasEQ ? 'eq' : null, 'hl', 'sep', 'mh', 'bio', 'clar', 'tdn', 'hl3', 'sep3', 'aop', 'filt', 'dis'].filter(k => k && um[k]);
    const idxBio = seqIds.indexOf('bio'), idxEQ = seqIds.indexOf('eq');
    const s0 = uh.sec('0. Thông số chung — Hazen-Williams: h_f = 10,67·L·Q^1,852/(C^1,852·D^4,87); h_m = Σξ·v²/2g');
    s0.i('v_max,tc', 'Vận tốc tối đa ống tự chảy', p.hyd_vg_max, 'm/s', '', 'TCVN 7957:2023', 'vgmax');
    s0.i('v_min,tc', 'Vận tốc tối thiểu ống tự chảy', p.hyd_vg_min, 'm/s', 'chống lắng cặn', 'TCVN 7957:2023', 'vgmin');
    s0.i('v_max,đ', 'Vận tốc tối đa ống đẩy', p.hyd_vp_max, 'm/s', '', 'M&E Ch.5', 'vpmax');
    s0.i('z_đáy SH', 'Cao độ đáy bể sinh học (neo trắc dọc)', p.bio_bot, 'm', 'sân ±0,000', '', 'bioBot');
    s0.i('Z_cống', 'Cao độ đáy cống đến', p.inv_in, 'm', '', 'Giả định', 'inv');
    s0.i('MN_tn', 'Mực nước nguồn tiếp nhận', p.wl_out, 'm', '', '', 'wlout');
    // tuyến
    const links = [];
    const addLink = (key, from, to, kind, Q, QX, name) => links.push({ key, from, to, kind, Q, QX, name });
    addLink('sump', 'sump', seqIds[0], 'p', F.Qmaxh, '[info.Qmaxh]', 'Ống đẩy bơm bể gom → ' + um[seqIds[0]].code);
    for (let i = 0; i < seqIds.length; i++) {
      const a = seqIds[i], b = seqIds[i + 1] || 'out';
      const afterBio = i >= idxBio;
      let Q = afterBio ? F.Qpk3 : (idxEQ >= 0 && i > idxEQ ? F.Qpk_eff : F.Qmaxh);
      let QX = afterBio ? '[bio.Qpk3]' : (idxEQ >= 0 && i > idxEQ ? F.QpkRef : '[info.Qmaxh]');
      if (a === 'eq') { addLink('eq', 'eq', b, 'p', F.Qeq, '[eq.Qp]', 'Ống đẩy bơm điều hòa → ' + (um[b] ? um[b].code : 'XẢ')); continue; }
      if (a === 'ctdv' && idxEQ >= 0) { Q = F.Qmaxh; QX = '[info.Qmaxh]'; }
      addLink(a + '_' + b, a, b, 'g', Q, QX, 'Ống tự chảy ' + um[a].code + ' → ' + (um[b] ? um[b].code : 'CỬA XẢ'));
    }
    R.hyd = { links, linkLoss: {}, linkRef: {} };
    let n = 0;
    for (const lk of links) {
      n++;
      const ov = OV[lk.key] || {};
      const vmax = lk.kind === 'p' ? p.hyd_vp_max : p.hyd_vg_max;
      const vOf = d => lk.Q / 3600 / (PI * (d / 1000) ** 2 / 4);
      let DNauto = DNS.find(d => vOf(d) <= vmax) || DNS[DNS.length - 1];
      // R08: ống tự chảy – ưu tiên DN cho v trong [v_min; v_max]; không có thì chọn DN lệch dải ít nhất (DN tối thiểu 100)
      if (lk.kind === 'g' && +p.autoFit !== 0 && vOf(DNauto) < p.hyd_vg_min) {
        const inR = DNS.filter(d => vOf(d) >= p.hyd_vg_min && vOf(d) <= vmax);
        if (inR.length) DNauto = inR[inR.length - 1];
        else { const dev = d => { const v = vOf(d); return v > vmax ? v / vmax - 1 : v < p.hyd_vg_min ? p.hyd_vg_min / v - 1 : 0; }; DNauto = DNS.slice().sort((a, b) => dev(a) - dev(b))[0]; }
      }
      const DN = +ov.DN > 0 ? +ov.DN : DNauto;
      const Lm = +ov.L > 0 ? +ov.L : (lk.kind === 'p' ? p.hyd_Lp : p.hyd_L);
      const C = +ov.C > 0 ? +ov.C : p.hyd_C;
      const xi = ov.xi !== undefined && ov.xi !== '' && !isNaN(+ov.xi) ? +ov.xi : (lk.kind === 'p' ? p.hyd_xi_p : p.hyd_xi_g);
      const s = uh.sec(`${n}. ${lk.name} (${lk.kind === 'p' ? 'áp lực' : 'tự chảy'})`);
      const id = 'L' + n;
      const Qm = s.o('Q', 'Lưu lượng tính toán', lk.Q, 'm³/h', '', '', lk.QX, id + 'Q');
      s.i('DN', 'Đường kính ống chọn', DN, 'mm', +ov.DN > 0 ? 'Nhập tay' : lk.kind === 'g' && +p.autoFit !== 0 ? `Tự chọn: v trong ${p.hyd_vg_min} – ${vmax} m/s (R08)` : `Tự chọn nhỏ nhất có v ≤ ${vmax} m/s`, 'TCVN 7957:2023', id + 'DN');
      s.i('L', 'Chiều dài tuyến', Lm, 'm', +ov.L > 0 ? 'Nhập tay' : 'Mặc định – hiệu chỉnh theo tổng mặt bằng', '', id + 'L');
      s.i('C', 'Hệ số Hazen-Williams', C, '-', '', 'Hazen-Williams', id + 'C');
      s.i('Σξ', 'Tổng hệ số tổn thất cục bộ', xi, '-', '', 'M&E Ch.5', id + 'xi');
      const A = s.o('A', 'Tiết diện ống', PI * (DN / 1000) ** 2 / 4, 'm²', 'π·D²/4', '', `PI()*([${id}DN]/1000)^2/4`, id + 'A');
      const v = s.o('v', 'Vận tốc', Qm / 3600 / A, 'm/s', 'Q/A', '', `[${id}Q]/3600/[${id}A]`, id + 'v');
      if (lk.kind === 'p') s.chk('Vận tốc ống đẩy ≤ ' + p.hyd_vp_max + ' m/s', v <= p.hyd_vp_max + 1e-9, 'ĐẠT', 'VƯỢT – tăng DN', 'M&E Ch.5', true, `[${id}v]<=[vpmax]+0.000000001`);
      else if (+p.autoFit !== 0 && !(+ov.DN > 0) && DN === DNS[0] && v < p.hyd_vg_min) s.chk(`Vận tốc tự chảy ${p.hyd_vg_min} – ${p.hyd_vg_max} m/s (DN tối thiểu ${DNS[0]})`, true, 'ĐẠT (DN tối thiểu – lưu lượng nhỏ; đặt độ dốc i ≥ 1/D để tự làm sạch)', '', 'TCVN 7957:2023 mục 8; Quy tắc R08', true, 'TRUE');
      else s.chk(`Vận tốc tự chảy ${p.hyd_vg_min} – ${p.hyd_vg_max} m/s`, v <= p.hyd_vg_max + 1e-9 && v >= p.hyd_vg_min - 1e-9, 'ĐẠT', v > p.hyd_vg_max ? 'VƯỢT – tăng DN' : 'THẤP – nguy cơ lắng cặn, giảm DN', 'TCVN 7957:2023', true, `AND([${id}v]<=[vgmax]+0.000000001,[${id}v]>=[vgmin]-0.000000001)`);
      const hf = s.o('h_f', 'Tổn thất dọc đường', 10.67 * Lm * (Qm / 3600) ** 1.852 / (C ** 1.852 * (DN / 1000) ** 4.87), 'm', 'h_f = 10,67·L·Q^1,852/(C^1,852·D^4,87)', 'Hazen-Williams', `10.67*[${id}L]*([${id}Q]/3600)^1.852/([${id}C]^1.852*([${id}DN]/1000)^4.87)`, id + 'hf');
      const hm = s.o('h_m', 'Tổn thất cục bộ', xi * v * v / 19.62, 'm', 'Σξ·v²/2g', 'M&E Ch.5', `[${id}xi]*[${id}v]^2/19.62`, id + 'hm');
      const h = s.o('h', 'Tổng tổn thất tuyến', hf + hm, 'm', 'h_f + h_m', '', `[${id}hf]+[${id}hm]`, id + 'h');
      lk.DN = DN; lk.L = Lm; lk.C = C; lk.xi = xi; lk.v = v; lk.hf = hf; lk.hm = hm; lk.h = h; lk.id = id; lk.DNauto = DNauto;
      if (lk.kind === 'p') { R.hyd.linkLoss[lk.from] = h; R.hyd.linkRef[lk.from] = `[hydc.${id}h]`; }
    }
    // cao độ mực nước
    const sw = uh.sec(`${n + 1}. Cao độ mực nước theo trắc dọc (neo tại bể sinh học)`);
    const bio = um.bio, isBatch = !!bio.batch;
    const hu = {}; // tổn thất trong công trình
    for (const k of seqIds) hu[k] = sw.i('h_' + um[k].code, 'Tổn thất qua ' + um[k].code + ' (máng tràn, cửa phân phối)', um[k].hl || 0.2, 'm', 'Ước tính', '', 'hu_' + k);
    const lkOf = (a) => links.find(l => l.from === a && l.kind === 'g');
    const WL = {}, WLX = {};
    const bioTop = isBatch ? bio.batch.TWL : bio.H;
    const isIC = c.bio === 'ICEAS' || c.bio === 'CTECH';
    WL.bio = sw.o('MN_SH', 'Mực nước cao nhất bể sinh học', p.bio_bot + bioTop, 'm', 'z_đáy + ' + (isBatch ? 'TWL' : 'H'), '', `[bioBot]+${isIC ? '[bio.TWL]' : '[bio.Hb]'}`, 'WL_bio');
    for (let i = idxBio - 1; i > idxEQ; i--) {
      const k = seqIds[i], nx = seqIds[i + 1], L1 = lkOf(k);
      WL[k] = sw.o('MN_' + um[k].code, 'Mực nước ' + um[k].name, WL[nx] + L1.h + hu[k], 'm', 'MN sau + h_ống + h_công trình', '', `[WL_${nx}]+[${L1.id}h]+[hu_${k}]`, 'WL_' + k);
    }
    // xuôi dòng
    let refV = isBatch ? p.bio_bot + bio.batch.BWL - 0.3 : WL.bio - hu.bio;
    let refX = isBatch ? (isIC ? '[bioBot]+[bio.BWL]-0.3' : '[bioBot]+[bio.Hb]*(1-[bio.VF])-0.3') : '[WL_bio]-[hu_bio]';
    sw.o('MN_ra SH', 'Mực nước ra khỏi bể sinh học', refV, 'm', isBatch ? 'BWL − 0,3 (decanter)' : 'MN − h_công trình', '', refX, 'WLo_bio');
    let prev = 'bio';
    for (let i = idxBio + 1; i < seqIds.length; i++) {
      const k = seqIds[i], L1 = lkOf(prev);
      WL[k] = sw.o('MN_' + um[k].code, 'Mực nước ' + um[k].name, refV - L1.h, 'm', 'MN ra công trình trước − h_ống', '', `[WLo_${prev}]-[${L1.id}h]`, 'WL_' + k);
      refV = sw.o('MN_ra ' + um[k].code, 'Mực nước ra ' + um[k].code, WL[k] - hu[k], 'm', '', '', `[WL_${k}]-[hu_${k}]`, 'WLo_' + k);
      prev = k;
    }
    const Lout = lkOf(prev);
    const outletWL = sw.o('MN_xả', 'Mực nước tại cửa xả', refV - Lout.h, 'm', '', '', `[WLo_${prev}]-[${Lout.id}h]`, 'WLout');
    sw.chk('Tự chảy ra nguồn tiếp nhận (dư ≥ 0,2 m)', outletWL >= p.wl_out + 0.2, 'ĐẠT', 'KHÔNG tự chảy — bố trí trạm bơm nước sau xử lý hoặc nâng cao độ bể sinh học', '', true, '[WLout]>=[wlout]+0.2');
    // bể điều hòa & công trình trước
    let eqInfo = null;
    if (idxEQ >= 0) {
      const eq = um.eq;
      const HWL = sw.o('MN_DH', 'Mực nước cao bể điều hòa (đỉnh +0,5 so với sân)', 0.5 - p.fb, 'm', '0,5 − chiều cao bảo vệ', '', `0.5-${p.fb}`, 'WL_eq');
      const LWL = sw.o('MNTN_DH', 'Mực nước thấp bể điều hòa', 0.5 - p.fb - eq.H + 0.5, 'm', 'đáy + 0,5', '', `[WL_eq]-[eq.H]+0.5`, 'LWL_eq');
      WL.eq = HWL; eqInfo = { HWL, LWL, bot: HWL - eq.H };
      for (let i = idxEQ - 1; i >= 0; i--) {
        const k = seqIds[i], nx = seqIds[i + 1], L1 = lkOf(k);
        WL[k] = sw.o('MN_' + um[k].code, 'Mực nước ' + um[k].name, WL[nx] + L1.h + hu[k], 'm', '', '', `[WL_${nx}]+[${L1.id}h]+[hu_${k}]`, 'WL_' + k);
      }
      const nx = seqIds[idxEQ + 1];
      sw.o('H_hh,DH', 'Cột áp hình học bơm điều hòa', WL[nx] - LWL, 'm', 'MN công trình sau − MNTN', '', `[WL_${nx}]-[LWL_eq]`, 'Hge');
    }
    const sumpHWL = sw.o('MNCN_BG', 'Mực nước cao bể gom', p.inv_in - 0.2, 'm', 'Z_cống − 0,2', '', '[inv]-0.2', 'HWLs');
    const sumpLWL = sw.o('MNTN_BG', 'Mực nước thấp bể gom', p.inv_in - 0.2 - um.sump.H, 'm', 'MNCN − H_ct', '', '[HWLs]-[sump.H]', 'LWLs');
    const first = seqIds[0];
    sw.o('H_hh,BG', 'Cột áp hình học bơm bể gom', WL[first] - sumpLWL, 'm', 'MN ' + um[first].code + ' − MNTN bể gom', '', `[WL_${first}]-[LWLs]`, 'Hgs');
    // đối tượng cho bản vẽ
    const out = [];
    out.push({ u: um.scr, WL: p.inv_in + p.bar_h1 * 0.6, bot: p.inv_in - 0.1, top: 0.3 });
    out.push({ u: um.sump, WL: sumpHWL, LWL: sumpLWL, bot: sumpLWL - 0.8, top: 0.3, pumpOut: true });
    for (const k of seqIds) {
      const u = um[k];
      const H = k === 'bio' && isBatch ? bio.batch.TWL : (u.H || 3);
      let bot = WL[k] - H;
      if (k === 'bio') bot = p.bio_bot;
      if (k === 'eq') bot = eqInfo.bot;
      if (k === 'ctdv') bot = WL[k] - (u.H || 1.5);
      const o = { u, WL: WL[k], bot, top: WL[k] + p.fb };
      if (k === 'bio' && isBatch) { o.BWL = p.bio_bot + bio.batch.BWL; o.TWL = WL.bio; }
      if (k === 'eq') { o.LWL = eqInfo.LWL; o.pumpOut = true; }
      out.push(o);
    }
    out.push({ u: { id: 'out', code: 'XẢ', name: 'Cửa xả ra nguồn tiếp nhận' }, WL: outletWL, bot: outletWL - 0.5, top: outletWL + 0.5 });
    for (const o of out) o.u.el = o;
    Object.assign(R.hyd, {
      seq: out, sumpLWL, nextAfterSump: WL[first], HgeoSump: WL[first] - sumpLWL,
      HgeoEQ: idxEQ >= 0 ? WL[seqIds[idxEQ + 1]] - eqInfo.LWL : 0, outletWL, outletOK: outletWL >= p.wl_out + 0.2,
    });
  }

  /* ---------------- Chi phí đầu tư & vận hành ---------------- */
  function costs(R, S, p, OP) {
    const Q = R.flow.Q;
    // thiết bị
    for (const e of R.equip) {
      e.key = e.u + '|' + e.name;
      e.est = DATA.estEquipPrice(e);
      e.price = OP.equipPrice && OP.equipPrice[e.key] !== undefined && OP.equipPrice[e.key] !== '' ? +OP.equipPrice[e.key] : e.est;
      e.total = e.price * e.qty;
    }
    const EQ = R.equip.reduce((a, e) => a + e.total, 0);
    // hóa chất
    for (const x of R.chem) { x.Lh = x.sol > 0 && x.rho > 0 ? x.kg / x.sol / x.rho / 24 : undefined; x.month = x.kg * 30; x.unitPrice = p[x.price] || 0; x.costD = x.kg * x.unitPrice; }
    const CHEM = R.chem.reduce((a, x) => a + x.costD, 0);
    // nhân công
    const labor = (OP.labor || []).map(r => ({ name: r.name, n: +r.n || 0, sal: +r.sal || 0, month: (+r.n || 0) * (+r.sal || 0) * p.labor_k }));
    const LABOR = labor.reduce((a, r) => a + r.month, 0);
    // vật tư thay thế
    const spares = [];
    const addSp = (key, qtyBase, note, baseX) => {
      const d = DATA.SPARES[key]; const ov = (OP.spareOv || {})[key] || {};
      const qty = ov.qty !== undefined && ov.qty !== '' ? +ov.qty : qtyBase / d[2];
      const price = ov.price !== undefined && ov.price !== '' ? +ov.price : (key === 'membrane' ? p.c_mem : key === 'media' ? p.c_media : d[3]);
      spares.push({ key, name: d[0], unit: d[1], life: d[2], base: qtyBase, baseX, qty, price, year: qty * price, note });
    };
    const eqKey = k => R.equip.filter(e => e.spare === k).reduce((a, e) => a + e.qty, 0);
    // công thức số lượng cơ sở liên kết sheet tính (F16) – khi mọi thiết bị cùng loại có qtyX
    const eqKeyX = k => { const es = R.equip.filter(e => e.spare === k); return es.length && es.every(e => e.qtyX) ? es.map(e => '(' + e.qtyX + ')').join('+') : null; };
    if (eqKey('diffuser')) addSp('diffuser', eqKey('diffuser'), 'Tuổi thọ màng đĩa ~7 năm', eqKeyX('diffuser'));
    if (R.um.bio.mbr) addSp('membrane', R.um.bio.mbr.Am, 'Tuổi thọ màng ~8 năm');
    if (eqKey('uvlamp')) addSp('uvlamp', eqKey('uvlamp') * 8, '8 bóng/module; ~12.000 h');
    if (R.um.bio.media) addSp('media', R.um.bio.media, 'Hao hụt ~2 %/năm');
    if (eqKey('belt')) addSp('belt', eqKey('belt'), 'Thay băng ~2 năm');
    if (eqKey('screen')) addSp('screen', eqKey('screen'), '');
    if (eqKey('decanter')) addSp('decanter', eqKey('decanter'), '', eqKeyX('decanter'));
    const custom = (OP.custom || []).map(r => ({ name: r.name, unit: r.unit || '', qty: +r.qty || 0, price: +r.price || 0, year: (+r.qty || 0) * (+r.price || 0) }));
    const MAINT = EQ * p.maint_pct / 100;
    const SPARE = spares.reduce((a, r) => a + r.year, 0) + custom.reduce((a, r) => a + r.year, 0) + MAINT;
    R.special = Object.assign(R.special || {}, { EQ, CHEM, KWHD: R.kWhd, LABOR, SPARE });
    R.labor = labor; R.spares = spares; R.customSp = custom; R.maint = MAINT;
    // đơn vị cost (công thức)
    const tanks = R.units.filter(u => ['nuoc', 'hoaly', 'sinhhoc', 'bun'].includes(u.grp) && u.geom && u.geom.type !== 'bld');
    const Vt = tanks.reduce((a, u) => a + (u.V || 0), 0);
    const bld = R.units.filter(u => u.geom && u.geom.type === 'bld').reduce((a, u) => a + u.A, 0);
    const uc = new Unit(R, 'cost', 'CP', 'Suất đầu tư & chi phí vận hành sơ bộ', 'info2');
    const s1 = uc.sec('1. Suất đầu tư sơ bộ (tr.đ)');
    // F16: thể tích / diện tích bể sinh học liên kết sống với sheet tính (các công trình khác cộng dạng hằng số)
    const ubio = R.um.bio, br = R.bioRes || {};
    const bioLive = ubio && tanks.includes(ubio) && br.VtotX;
    const Vo = Vt - (bioLive ? ubio.V : 0);
    if (bioLive) s1.o('V_bể', 'Tổng thể tích xây dựng bể công nghệ', Vt, 'm³', 'V_bể sinh học (sheet SH) + các công trình khác ' + fx(Vo, 0) + ' m³', 'Sheet SH, TongHop', `${Vo}+${br.VtotX}`, 'Vt');
    else s1.i('V_bể', 'Tổng thể tích xây dựng bể công nghệ', Vt, 'm³', 'Tổng hợp công trình', '', 'Vt');
    const At = R.units.filter(u => u.geom).reduce((a, u) => a + (u.A || footprintArea(u.geom)), 0);
    if (bioLive && br.AX) { const Ao = At - ubio.A; s1.o('A_CT', 'Tổng diện tích công trình', At, 'm²', 'A bể sinh học + các công trình khác ' + fx(Ao, 0) + ' m²', 'Sheet SH, TongHop', `${Ao}+${br.AX}`, 'At'); }
    else s1.i('A_CT', 'Tổng diện tích công trình', At, 'm²', 'Tổng hợp công trình', '', 'At');
    s1.i('c_bể', 'Suất đầu tư bể BTCT', p.c_tank, 'tr.đ/m³', '', 'Suất vốn đầu tư', 'ct');
    const C1 = s1.o('G_XD bể', 'Chi phí xây dựng bể', Vt * p.c_tank, 'tr.đ', 'V·c', '', '[Vt]*[ct]', 'C1');
    s1.i('A_nhà', 'Diện tích nhà công nghệ', bld, 'm²', '', '', 'Ab');
    s1.i('c_nhà', 'Suất đầu tư nhà', p.c_bld, 'tr.đ/m²', '', '', 'cb');
    const C2 = s1.o('G_XD nhà', 'Chi phí xây dựng nhà', bld * p.c_bld, 'tr.đ', 'A·c', '', '[Ab]*[cb]', 'C2');
    const C3 = s1.o('G_TB', 'Chi phí thiết bị (theo danh mục)', EQ, 'tr.đ', 'Σ SL·đơn giá', 'Sheet ThietBi', '[@EQ]', 'C3');
    s1.i('%LĐ', 'Lắp đặt, đường ống, điện – điều khiển', p.c_inst, '% G_TB', '', '', 'pinst');
    const C4 = s1.o('G_LĐ', 'Chi phí lắp đặt, đường ống, điện', EQ * p.c_inst / 100, 'tr.đ', 'G_TB·%', '', '[C3]*[pinst]/100', 'C4');
    const capex = s1.o('G', 'TỔNG SUẤT ĐẦU TƯ SƠ BỘ', C1 + C2 + C3 + C4, 'tr.đ', '', '', '[C1]+[C2]+[C3]+[C4]', 'capex');
    s1.o('g', 'Suất đầu tư trên 1 m³/ngđ', capex / Q, 'tr.đ/(m³/ngđ)', '', '', '[capex]/[info.Q]', 'capq');
    const s2 = uc.sec('2. Chi phí vận hành (đ/ngày)');
    s2.o('E', 'Điện năng tiêu thụ', R.kWhd, 'kWh/ngđ', 'Tổng sheet DienNang', 'Sheet DienNang', '[@KWHD]', 'kwh');
    s2.i('p_E', 'Giá điện', p.p_kwh, 'đ/kWh', '', '', 'pkwh');
    const o1 = s2.o('CP_điện', 'Chi phí điện', R.kWhd * p.p_kwh, 'đ/ngđ', 'E·p', '', '[kwh]*[pkwh]', 'o1');
    const o2 = s2.o('CP_hóa chất', 'Chi phí hóa chất', CHEM, 'đ/ngđ', 'Σ kg·đơn giá', 'Sheet HoaChat', '[@CHEM]', 'o2');
    if (R.um.dry && R.um.dry.ids.Mp) s2.o('M_bánh', 'Bùn khô sau sấy', R.sludge.final, 'tấn/ngđ', 'Sheet làm khô bùn', '', '[dry.Mp]', 'cake');
    else if (R.um.dw && R.um.dw.ids.Mc) s2.o('M_bánh', 'Bánh bùn', R.sludge.cake, 'tấn/ngđ', 'Sheet khử nước bùn', '', '[dw.Mc]', 'cake');
    else s2.i('M_bánh', 'Bánh bùn', R.sludge.cake, 'tấn/ngđ', '', '', 'cake');
    s2.i('p_bùn', 'Đơn giá vận chuyển – xử lý bùn', p.p_sludge, 'đ/tấn', '', '', 'psl');
    const o3 = s2.o('CP_bùn', 'Chi phí xử lý bùn', (R.sludge.final || R.sludge.cake) * p.p_sludge, 'đ/ngđ', '', '', '[cake]*[psl]', 'o3');
    const o4 = s2.o('CP_nhân công', 'Chi phí nhân công', LABOR * 1e6 / 30, 'đ/ngđ', 'Σ lương tháng·hệ số/30', 'Sheet NhanCong', '[@LABOR]*1000000/30', 'o4');
    const o5 = s2.o('CP_vật tư', 'Vật tư thay thế, bảo dưỡng', SPARE * 1e6 / 365, 'đ/ngđ', 'Σ chi phí năm/365', 'Sheet VatTu', '[@SPARE]*1000000/365', 'o5');
    const opexD = s2.o('CP_VH', 'TỔNG CHI PHÍ VẬN HÀNH', o1 + o2 + o3 + o4 + o5, 'đ/ngđ', '', '', '[o1]+[o2]+[o3]+[o4]+[o5]', 'opexD');
    const perM3 = s2.o('c_m³', 'Chi phí vận hành trên 1 m³', opexD / Q, 'đ/m³', '', '', '[opexD]/[info.Q]', 'perM3');
    s2.o('CP_năm', 'Chi phí vận hành năm', opexD * 365 / 1e6, 'tr.đ/năm', '', '', '[opexD]*365/1000000', 'opexY');
    R.cost = { tank: C1, bld: C2, eq: C3, inst: C4, capex, elec: o1, chem: o2, sludge: o3, labor: o4, spare: o5, opexD, perM3 };
  }

  function footprintArea(g) { if (!g) return 0; const f = footprint(g); return f.L * f.B; }
  function footprint(g, w) {
    w = w === undefined ? 0.3 : w;
    if (g.type === 'rect') return { L: g.L + 2 * w, B: g.n * g.B + (g.n + 1) * w };
    if (g.type === 'circ') return { L: g.n * (g.D + 2 * w) + (g.n - 1) * 3, B: g.D + 2 * w };
    if (g.type === 'race') { const Wt = 2 * g.Wc + 3 * w; return { L: g.Ls + Wt, B: g.n * Wt + (g.n - 1) * 1 }; }
    if (g.type === 'bld') return { L: g.L, B: g.B };
    return { L: 1, B: 1 };
  }

  /* ---------------- kiểm tra công thức: tính lại mẫu Excel bằng JS ---------------- */
  const XF = {
    IF: (a, b, c) => (a ? b : c), MAX: (...a) => Math.max(...a), MIN: (...a) => Math.min(...a), SQRT: Math.sqrt, PI: () => Math.PI,
    CEILING: (x, s) => Math.ceil(x / s - 1e-9) * s, ROUNDUP: (x, d) => { const f = 10 ** d; return Math.ceil(x * f - 1e-9) / f; },
    ROUND: (x, d) => Math.round(x * 10 ** d) / 10 ** d, POWER: Math.pow, LN: Math.log, EXP: Math.exp, ABS: Math.abs,
    AND: (...a) => a.every(Boolean), OR: (...a) => a.some(Boolean), COS: Math.cos, SIN: Math.sin, RADIANS: x => x * Math.PI / 180, TRUE: true,
  };
  function evalRow(row, R) {
    let s = '';
    for (const part of row.xp) {
      if (typeof part === 'string') s += part;
      else if (part.sp) s += '(' + R.special[part.sp] + ')';
      else s += typeof part.val === 'number' ? '(' + part.val + ')' : JSON.stringify(part.val);
    }
    // chỉ đổi toán tử Excel ở phần biểu thức, giữ nguyên chuỗi "…" (vd. "M&E" trong câu báo kiểm tra)
    const js = s.split(/("(?:[^"\\]|\\.)*")/).map((t, i) => i % 2 ? t : t.replace(/\^/g, '**').replace(/<>/g, '!=').replace(/([^<>!=])=([^=])/g, '$1==$2').replace(/&/g, '+').replace(/\bTRUE\b/g, 'true')).join('');
    return Function(...Object.keys(XF), '"use strict";return (' + js + ');')(...Object.values(XF));
  }
  function verify(R) {
    const bad = [];
    for (const u of R.units) for (const s of u.secs) for (const r of s.rows) {
      if (!r.xp) continue;
      let v;
      try { v = evalRow(r, R); } catch (e) { bad.push({ u: u.id, sym: r.sym, name: r.name, err: e.message }); continue; }
      const ok = typeof r.val === 'number' ? Math.abs(v - r.val) <= 1e-6 * Math.max(1, Math.abs(r.val)) : v === r.val;
      if (!ok) bad.push({ u: u.id, sym: r.sym, name: r.name, val: r.val, got: v });
    }
    return bad.concat(R.xerr.map(e => ({ err: e })));
  }

  function fx(v, d) {
    if (typeof v !== 'number') return v;
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (d === undefined) d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 3 : a === 0 ? 0 : 4;
    return v.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  return { run, limits, fx, footprint, footprintArea, QK, verify, DNS, batchNO3 };
})();
const fx = ENG.fx;
