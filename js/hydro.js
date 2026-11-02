'use strict';
/* ==========================================================================
   Trắc dọc thủy lực toàn trạm (khung bộ phần mềm – Σ Tổng hợp → Trắc dọc thủy lực)
   Dây chuyền công trình nối tiếp (thượng lưu → hạ lưu). Tính ngược từ mực nước cửa xả ở lưu lượng giờ lớn nhất:
     – nối ống: MN thượng = MN hạ + hf + Σξ·v²/2g; hf Hazen–Williams 10,67·L·Q^1,852 / (C^1,852·D^4,87)
     – tràn tự do (máng/ngưỡng chữ nhật thành mỏng, Francis): h = (Q / (1,84·L))^(2/3); MN thượng = MN hạ + độ rơi tự do + h
     – trạm bơm: mực nước bể hút do người dùng đặt; cột áp bơm = MN cần ở hạ lưu − MN bể hút + tổn thất.
   Cỡ ống gợi ý: DN nhỏ nhất có v ≤ 1,2 m/s (trong 0,6 – 1,5 m/s). Đáy bể = MN − chiều sâu nước; đỉnh tường = MN + chiều cao an toàn.
   Kết quả: bảng cao độ, hình trắc dọc (SVG), xuất DXF (R12, đơn vị m), lưu cùng hồ sơ dự án chung.
   ========================================================================== */
const HYDRO = (() => {
  const DN = [100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000];
  const LSK = 'xlnt_hub_hydro';
  const num = v => v != null && v !== '' && isFinite(+v);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const f2 = v => (num(v) ? (+v).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
  const f3 = v => (num(v) ? (+v).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '–');
  let H = null;

  // dây chuyền mặc định theo công nghệ; H: chiều sâu nước, fb: chiều cao an toàn, Lx: chiều dài vẽ (m)
  // link: liên kết từ công trình này sang công trình kế tiếp
  const ST = (name, h, fb, lx, link) => ({ name, H: h, fb, Lx: lx, link });
  const PIPE = (Lp, K, D) => ({ type: 'pipe', Lp, K, D: D || 0, C: 120, n: 1, extra: 0 });
  const WEIR = (Lw, drop) => ({ type: 'weir', Lw, drop, n: 1, extra: 0 });
  function defaults(R) {
    const base = ['thietke', 'aqua', 'iceas', 'nereda', 'sim'].map(k => R && R[k]).find(r => r && r.flow && num(r.flow.Q)) || {};
    const d = base.des || {}, tech = base.tech || 'AO';
    const Q = num(base.flow && base.flow.Q) ? +base.flow.Q : 10000, kmax = num(base.flow && base.flow.kmax) ? +base.flow.kmax : 1.5;
    const Hb = num(d.Hmax) ? +d.Hmax : num(d.H) ? +d.H : 5, Hc = num(d.Hcl) ? +d.Hcl : 4;
    let chain;
    if (['ICEAS', 'SBR', 'CTECH', 'AGS'].includes(tech)) chain = [
      ST('Mương song chắn rác', 1.0, 0.5, 8, PIPE(15, 1.5)), ST('Bể lắng cát', 2.5, 0.5, 10, PIPE(30, 2.0)),
      ST(tech === 'AGS' ? 'Bể NEREDA®' : tech === 'CTECH' ? 'Bể C-Tech' : 'Bể ICEAS / SBR', Hb, 0.6, 30, { type: 'pipe', Lp: 40, K: 3.0, D: 0, C: 120, n: 1, extra: 0.3, note: 'gạn: tổn thất máng gạn ~0,3 m' }),
      ST('Bể khử trùng', 3.0, 0.5, 12, WEIR(4, 0.15)), ST('Cửa xả', 1.0, 0.5, 6, null)];
    else if (['MBR', 'KMBR'].includes(tech)) chain = [
      ST('Mương song chắn rác + lưới tinh', 1.0, 0.5, 8, PIPE(15, 1.5)), ST('Bể thiếu khí', Hb, 0.5, 20, WEIR(8, 0.1)), ST('Bể hiếu khí', Hb, 0.5, 25, PIPE(20, 2.0)),
      ST('Bể màng MBR (hút thấm – bơm)', Hb, 0.5, 15, { type: 'pump', wl: 0, Lp: 40, K: 5, D: 0, C: 120, n: 1, extra: 0 }), ST('Bể chứa nước sau xử lý', 3.0, 0.5, 10, WEIR(3, 0.15)), ST('Cửa xả', 1.0, 0.5, 6, null)];
    else chain = [
      ST('Mương song chắn rác', 1.0, 0.5, 8, PIPE(15, 1.5)), ST('Bể lắng cát', 2.5, 0.5, 10, PIPE(25, 2.0)),
      ...(tech === 'AAO' ? [ST('Bể kỵ khí', Hb, 0.5, 15, WEIR(8, 0.1))] : []),
      ST('Bể thiếu khí', Hb, 0.5, 20, WEIR(8, 0.1)), ST('Bể hiếu khí', Hb, 0.5, 30, PIPE(40, 2.5)),
      ST('Bể lắng thứ cấp', Hc, 0.5, 25, { type: 'weir', Lw: 50, drop: 0.15, n: 1, extra: 0.15, note: 'máng thu răng cưa + ống ra: thêm 0,15 m' }),
      ST('Bể khử trùng', 3.0, 0.5, 12, WEIR(4, 0.15)), ST('Cửa xả', 1.0, 0.5, 6, null)];
    return { Q, kmax, outWL: 0, ground: 1.0, tech, chain, src: base.from || '' };
  }
  function load(R) {
    if (H) return H;
    try { H = JSON.parse(localStorage.getItem(LSK) || 'null'); } catch (e) { H = null; }
    if (!H || !H.chain) H = defaults(R);
    return H;
  }
  const save = () => { try { localStorage.setItem(LSK, JSON.stringify(H)); } catch (e) { /* */ } };

  function pipeLoss(q, l) {
    const n = Math.max(+l.n || 1, 1), qi = q / n;
    let D = num(l.D) && +l.D > 0 ? +l.D : DN.find(d => qi / (Math.PI * (d / 1000) ** 2 / 4) <= 1.2) || DN[DN.length - 1];
    const Dm = D / 1000, A = Math.PI * Dm * Dm / 4, v = qi / A, C = +l.C || 120;
    const hf = 10.67 * (+l.Lp || 0) * Math.pow(qi, 1.852) / (Math.pow(C, 1.852) * Math.pow(Dm, 4.87));
    const hm = (+l.K || 0) * v * v / 19.62;
    return { D, v, hf, hm, auto: !(num(l.D) && +l.D > 0), loss: hf + hm + (+l.extra || 0) };
  }
  // tính ngược từ cửa xả
  function calc() {
    const q = H.Q * H.kmax / 86400, n = H.chain.length, out = new Array(n);
    let wl = +H.outWL || 0;
    out[n - 1] = { WL: wl };
    for (let i = n - 2; i >= 0; i--) {
      const l = H.chain[i].link || PIPE(10, 1);
      const r = { link: l.type };
      if (l.type === 'weir') {
        const qi = q / Math.max(+l.n || 1, 1), h = Math.pow(qi / (1.84 * Math.max(+l.Lw || 1, 0.1)), 2 / 3);
        r.h = h; r.loss = (+l.drop || 0) + h + (+l.extra || 0); r.crest = wl + (+l.drop || 0);
        wl = wl + r.loss;
      } else if (l.type === 'pump') {
        const p = pipeLoss(q, l); Object.assign(r, p);
        const need = wl + p.loss; wl = +l.wl || 0; r.head = need - wl; r.loss = 0;
      } else { const p = pipeLoss(q, l); Object.assign(r, p); wl = wl + p.loss; }
      out[i] = Object.assign(r, { WL: wl });
    }
    return out.map((o, i) => { const s = H.chain[i]; return Object.assign(o, { bottom: o.WL - (+s.H || 0), top: o.WL + (+s.fb || 0) }); });
  }

  /* ---------- hình trắc dọc (SVG) & DXF ---------- */
  function geom(res) {
    const G = [], T = [];
    let x = 0;
    H.chain.forEach((s, i) => {
      const r = res[i], w = Math.max(+s.Lx || 8, 2);
      G.push({ k: 'wall', x0: x, x1: x + w, y0: r.bottom, y1: r.top }); G.push({ k: 'wl', x0: x, x1: x + w, y0: r.WL, y1: r.WL });
      T.push({ x: x + w / 2, y: r.top + 0.35, t: s.name, a: 'c' }); T.push({ x: x + w / 2, y: r.WL + 0.12, t: 'MN ' + f2(r.WL), a: 'c', s: 1 });
      T.push({ x: x + w / 2, y: r.bottom - 0.35, t: 'Đáy ' + f2(r.bottom), a: 'c', s: 1 });
      if (i < H.chain.length - 1) { const gap = 4, n2 = res[i + 1]; G.push({ k: 'link', x0: x + w, x1: x + w + gap, y0: r.WL - 0.3, y1: n2.WL - 0.3 }); x += w + gap; } else x += w;
    });
    G.push({ k: 'ground', x0: -2, x1: x + 2, y0: +H.ground || 0, y1: +H.ground || 0 });
    return { G, T, W: x };
  }
  function svg(res) {
    const { G, T, W } = geom(res);
    const ys = G.flatMap(g => [g.y0, g.y1]), y0 = Math.min(...ys) - 1.2, y1 = Math.max(...ys) + 1.2;
    const PW = 1000, sx = PW / (W + 6), sy = Math.min(40, 360 / (y1 - y0)), PH = (y1 - y0) * sy + 20;
    const X = x => (x + 3) * sx, Y = y => (y1 - y) * sy + 10;
    let s = `<svg viewBox="0 0 ${PW} ${PH}" style="width:100%;max-width:${PW}px;background:#fff;border:1px solid #e2e8f0" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">`;
    for (const g of G) {
      if (g.k === 'wall') s += `<rect x="${X(g.x0)}" y="${Y(g.y1)}" width="${X(g.x1) - X(g.x0)}" height="${Y(g.y0) - Y(g.y1)}" fill="#f1f5f9" stroke="#334155" stroke-width="1.5"/>`;
      if (g.k === 'wl') s += `<line x1="${X(g.x0)}" x2="${X(g.x1)}" y1="${Y(g.y0)}" y2="${Y(g.y1)}" stroke="#0f62c9" stroke-width="2.5"/>`;
      if (g.k === 'link') s += `<line x1="${X(g.x0)}" x2="${X(g.x1)}" y1="${Y(g.y0)}" y2="${Y(g.y1)}" stroke="#64748b" stroke-width="4" stroke-linecap="round"/>`;
      if (g.k === 'ground') s += `<line x1="${X(g.x0)}" x2="${X(g.x1)}" y1="${Y(g.y0)}" y2="${Y(g.y1)}" stroke="#92400e" stroke-dasharray="8 5"/><text x="${X(g.x1) - 4}" y="${Y(g.y0) + 13}" font-size="11" fill="#92400e" text-anchor="end">Mặt đất ${f2(g.y0)}</text>`;
    }
    for (const t of T) s += `<text x="${X(t.x)}" y="${Y(t.y)}" font-size="${t.s ? 10 : 11.5}" text-anchor="middle" fill="${t.s ? '#334155' : '#0f172a'}"${t.s ? '' : ' font-weight="600"'}>${esc(t.t)}</text>`;
    return s + '</svg>';
  }
  function dxf(res) {
    const { G, T } = geom(res);
    const L = ['0', 'SECTION', '2', 'ENTITIES'];
    const line = (lay, x0, y0, x1, y1) => L.push('0', 'LINE', '8', lay, '10', x0.toFixed(3), '20', y0.toFixed(3), '30', '0', '11', x1.toFixed(3), '21', y1.toFixed(3), '31', '0');
    for (const g of G) {
      if (g.k === 'wall') { line('CONG_TRINH', g.x0, g.y0, g.x1, g.y0); line('CONG_TRINH', g.x0, g.y0, g.x0, g.y1); line('CONG_TRINH', g.x1, g.y0, g.x1, g.y1); }
      else line(g.k === 'wl' ? 'MUC_NUOC' : g.k === 'link' ? 'DUONG_ONG' : 'MAT_DAT', g.x0, g.y0, g.x1, g.y1);
    }
    for (const t of T) L.push('0', 'TEXT', '8', 'CHU', '10', t.x.toFixed(3), '20', t.y.toFixed(3), '30', '0', '40', t.s ? '0.18' : '0.25', '1', t.t, '72', '1', '11', t.x.toFixed(3), '21', t.y.toFixed(3), '31', '0');
    L.push('0', 'ENDSEC', '0', 'EOF');
    return L.join('\r\n');
  }

  /* ---------- bảng ---------- */
  function table(res, forReport) {
    const q = H.Q * H.kmax / 86400;
    let h = `<div class="hub-tw"><table class="hub-t"><thead><tr><th>Công trình</th><th>Chiều sâu nước (m)</th><th>MN (m)</th><th>Đáy (m)</th><th>Đỉnh tường (m)</th><th>Nối sang công trình sau</th><th>Tổn thất / cột áp (m)</th></tr></thead><tbody>`;
    H.chain.forEach((s, i) => {
      const r = res[i], l = s.link;
      let link = '–', loss = '–';
      if (l && r.link === 'weir') { link = `Tràn tự do L = ${f2(l.Lw)} m${+l.n > 1 ? ' × ' + l.n : ''}: h = ${f3(r.h)} m, rơi ${f2(l.drop)} m${+l.extra ? ', thêm ' + f2(l.extra) : ''}`; loss = f3(r.loss); }
      else if (l && (r.link === 'pipe' || r.link === 'pump')) {
        link = `${r.link === 'pump' ? 'Bơm + ống' : 'Ống'} DN${r.D}${r.auto ? ' (gợi ý)' : ''}${+l.n > 1 ? ' × ' + l.n : ''}, L = ${f2(l.Lp)} m, v = ${f2(r.v)} m/s${r.v > 1.5 || r.v < 0.6 ? ' ⚠' : ''}: hf ${f3(r.hf)} + cục bộ ${f3(r.hm)}${+l.extra ? ' + ' + f2(l.extra) : ''}`;
        loss = r.link === 'pump' ? `cột áp ${f2(r.head)}` : f3(r.loss);
      }
      const above = r.top > (+H.ground || 0) + 4 ? ' ⚠ cao hơn mặt đất > 4 m' : r.bottom < (+H.ground || 0) - 8 ? ' ⚠ đáy sâu > 8 m dưới mặt đất' : '';
      h += `<tr><td>${esc(s.name)}</td><td class="n">${f2(s.H)}</td><td class="n"><b>${f2(r.WL)}</b></td><td class="n">${f2(r.bottom)}</td><td class="n">${f2(r.top)}${above ? `<br><small style="color:#b45309">${above}</small>` : ''}</td><td>${link}${l && l.note ? `<br><small>${esc(l.note)}</small>` : ''}</td><td class="n">${loss}</td></tr>`;
    });
    h += `</tbody></table></div><p class="hub-note">Lưu lượng tính toán Qmax = ${f2(H.Q)} × ${f2(H.kmax)} = ${f2(H.Q * H.kmax)} m³/ngày = ${f3(q)} m³/s; MN cửa xả ${f2(H.outWL)} m; mặt đất ${f2(H.ground)} m.
      Tổng chênh mực nước đầu – cuối ${f2(res[0].WL - res[res.length - 1].WL)} m. ⚠: vận tốc ống ngoài 0,6 – 1,5 m/s hoặc cao độ bất thường so với mặt đất.</p>`;
    return h;
  }
  function editor() {
    const inp = (k, v, i, w, t) => `<input data-hk="${k}" data-hi="${i}" type="${t || 'number'}" step="any" value="${esc(v)}" style="width:${w || 64}px">`;
    let h = `<details class="hyd-ed"><summary><b>Sửa dây chuyền công trình</b> (thượng lưu → hạ lưu)</summary><div class="hub-tw"><table class="hub-t"><thead><tr><th>#</th><th>Công trình</th><th>Sâu nước</th><th>An toàn</th><th>Dài vẽ</th>
      <th>Nối sang sau</th><th>L ống / L tràn</th><th>ξ / độ rơi</th><th>DN (0 = tự chọn)</th><th>Số tuyến</th><th>Thêm (m)</th><th>MN bể hút (bơm)</th><th></th></tr></thead><tbody>`;
    H.chain.forEach((s, i) => {
      const l = s.link, last = i === H.chain.length - 1;
      h += `<tr><td>${i + 1}</td><td>${inp('name', s.name, i, 190, 'text')}</td><td>${inp('H', s.H, i, 55)}</td><td>${inp('fb', s.fb, i, 50)}</td><td>${inp('Lx', s.Lx, i, 50)}</td>
        <td>${last ? '–' : `<select data-hk="ltype" data-hi="${i}"><option value="pipe"${l.type === 'pipe' ? ' selected' : ''}>Ống</option><option value="weir"${l.type === 'weir' ? ' selected' : ''}>Tràn tự do</option><option value="pump"${l.type === 'pump' ? ' selected' : ''}>Bơm</option></select>`}</td>
        <td>${last ? '' : inp(l.type === 'weir' ? 'Lw' : 'Lp', l.type === 'weir' ? l.Lw : l.Lp, i, 55)}</td><td>${last ? '' : inp(l.type === 'weir' ? 'drop' : 'K', l.type === 'weir' ? l.drop : l.K, i, 50)}</td>
        <td>${last || l.type === 'weir' ? '' : inp('D', l.D, i, 60)}</td><td>${last ? '' : inp('n', l.n || 1, i, 40)}</td><td>${last ? '' : inp('extra', l.extra || 0, i, 50)}</td><td>${!last && l.type === 'pump' ? inp('wl', l.wl, i, 60) : ''}</td>
        <td><button data-ha="add" data-hi="${i}" title="Thêm công trình sau">＋</button><button data-ha="del" data-hi="${i}" title="Xóa">✕</button></td></tr>`;
    });
    return h + `</tbody></table></div></details>`;
  }
  function render(host, R) {
    load(R);
    const res = calc();
    host.innerHTML = `<div class="hyd-top"><label>Q TB <input id="hyQ" type="number" step="any" value="${H.Q}" style="width:90px"> m³/ngày</label>
      <label>Hệ số giờ max <input id="hyK" type="number" step="any" value="${H.kmax}" style="width:60px"></label>
      <label>MN cửa xả (lũ thiết kế) <input id="hyO" type="number" step="any" value="${H.outWL}" style="width:70px"> m</label>
      <label>Mặt đất <input id="hyG" type="number" step="any" value="${H.ground}" style="width:70px"> m</label>
      <button id="hyDef" title="Dựng lại dây chuyền theo công nghệ và số liệu hiện tại của các phần mềm">Dựng lại theo hồ sơ phần mềm</button><button id="hyDxf">⬇ Xuất DXF</button></div>
      ${H.src ? `<p class="hub-note">Số liệu ban đầu lấy từ ${esc(H.src)} (công nghệ ${esc(H.tech)}). Sửa trực tiếp các ô; kết quả cập nhật ngay.</p>` : ''}
      ${svg(res)}${table(res)}${editor()}`;
    const re = () => { save(); render(host, R); };
    host.querySelector('#hyQ').onchange = e => { H.Q = +e.target.value || H.Q; re(); };
    host.querySelector('#hyK').onchange = e => { H.kmax = +e.target.value || H.kmax; re(); };
    host.querySelector('#hyO').onchange = e => { H.outWL = +e.target.value || 0; re(); };
    host.querySelector('#hyG').onchange = e => { H.ground = +e.target.value || 0; re(); };
    host.querySelector('#hyDef').onclick = () => { if (confirm('Dựng lại dây chuyền mặc định theo hồ sơ phần mềm? Các sửa đổi hiện tại sẽ mất.')) { H = defaults(R); re(); } };
    host.querySelector('#hyDxf').onclick = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([dxf(res)], { type: 'application/dxf' })); a.download = 'TracDocThuyLuc.dxf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    host.querySelectorAll('[data-hk]').forEach(el => el.onchange = () => {
      const i = +el.dataset.hi, k = el.dataset.hk, s = H.chain[i], v = el.type === 'number' ? +el.value : el.value;
      if (k === 'ltype') s.link = v === 'weir' ? WEIR(4, 0.15) : v === 'pump' ? { type: 'pump', wl: res[i].WL - 3, Lp: 30, K: 5, D: 0, C: 120, n: 1, extra: 0 } : PIPE(20, 2);
      else if (['name', 'H', 'fb', 'Lx'].includes(k)) s[k] = v; else s.link[k] = v;
      const open = host.querySelector('.hyd-ed').open; re(); host.querySelector('.hyd-ed').open = open;
    });
    host.querySelectorAll('[data-ha]').forEach(b => b.onclick = () => {
      const i = +b.dataset.hi;
      if (b.dataset.ha === 'del') { if (H.chain.length > 2) H.chain.splice(i, 1); if (!H.chain[H.chain.length - 1].link) { /* */ } H.chain[H.chain.length - 1].link = null; }
      else { H.chain.splice(i + 1, 0, ST('Công trình mới', 3, 0.5, 10, PIPE(20, 2))); if (!H.chain[i].link) H.chain[i].link = PIPE(20, 2); H.chain[H.chain.length - 1].link = null; }
      re(); host.querySelector('.hyd-ed').open = true;
    });
  }
  function report(R) { load(R); const res = calc(); return svg(res) + table(res, true); }
  return { render, report, calc, defaults, get data() { return H; }, set data(v) { H = v; save(); }, LSK };
})();
