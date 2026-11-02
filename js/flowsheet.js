'use strict';
/* ==========================================================================
   SimXLNT – Trình vẽ sơ đồ công nghệ (SVG, kéo-thả, nối ống)
   ========================================================================== */
const FS = {
  svg: null, wrap: null, sel: null, drag: null, linking: null, overlay: null, qlabels: null,
  onSelect: () => {}, onChange: () => {}
};
const NS = 'http://www.w3.org/2000/svg';
const GEOM = {
  influent: { w: 64, h: 36 }, dose: { w: 46, h: 46 }, cstr: { w: 92, h: 62 }, clarifier: { w: 104, h: 70 },
  psep: { w: 80, h: 64 }, splitter: { w: 28, h: 28 }, effluent: { w: 64, h: 36 }, sludge: { w: 64, h: 36 },
  sbr: { w: 100, h: 66 }, iceas: { w: 112, h: 66 }, ctech: { w: 112, h: 66 }, mbr: { w: 96, h: 64 }, mbbr: { w: 92, h: 62 }, digester: { w: 76, h: 76 }, blower: { w: 74, h: 50 },
  cyclone: { w: 46, h: 70 }, sewer: { w: 120, h: 30 }
};

const geomOf = t => GEOM[t] || (typeof UT !== 'undefined' && UT[t] && UT[t].geom) || { w: 80, h: 56 };
function portPos(u, port) {
  const g = geomOf(u.type), x = u.x, y = u.y, w = g.w, h = g.h;
  // thiết bị mở rộng (js/units_ext.js): vào bên trái, ra bên phải, dòng đáy (bùn/rác/rửa lọc) phía dưới
  if (!GEOM[u.type]) return port === 'in' ? { x: x - w / 2, y, dx: -1, dy: 0 } : port === 'und' ? { x, y: y + h / 2, dx: 0, dy: 1 } : { x: x + w / 2, y, dx: 1, dy: 0 };
  switch (u.type) {
    case 'influent': case 'dose': return { x: x + w / 2, y, dx: 1, dy: 0 };
    case 'cstr': case 'mbbr': case 'digester': case 'sewer': return port === 'in' ? { x: x - w / 2, y, dx: -1, dy: 0 } : { x: x + w / 2, y, dx: 1, dy: 0 };
    case 'cyclone':
      if (port === 'in') return { x: x - w / 2, y: y - h / 2 + 10, dx: -1, dy: 0 };
      if (port === 'und') return { x, y: y + h / 2, dx: 0, dy: 1 };
      return { x, y: y - h / 2, dx: 0, dy: -1 };
    case 'sbr': case 'iceas': case 'ctech':
      if (port === 'in') return { x: x - w / 2, y: y - h / 2 + 14, dx: -1, dy: 0 };
      if (port === 'was') return { x, y: y + h / 2, dx: 0, dy: 1 };
      return { x: x + w / 2, y: y - h / 2 + 14, dx: 1, dy: 0 };
    case 'clarifier': case 'psep': case 'mbr':
      if (port === 'in') return { x: x - w / 2, y: y - h / 2 + 14, dx: -1, dy: 0 };
      if (port === 'und') return { x, y: y + h / 2, dx: 0, dy: 1 };
      return { x: x + w / 2, y: y - h / 2 + 14, dx: 1, dy: 0 };
    case 'splitter':
      if (port === 'in') return { x: x - 14, y, dx: -1, dy: 0 };
      if (port === 'a') return { x, y: y + 14, dx: 0, dy: 1 };
      return { x: x + 14, y, dx: 1, dy: 0 };
    default: return { x: x - w / 2, y, dx: -1, dy: 0 };
  }
}

function glyph(u) {
  const g = geomOf(u.type), w = g.w, h = g.h;
  if (!GEOM[u.type]) return UT[u.type] && UT[u.type].glyph ? UT[u.type].glyph(u, w, h) : `<rect class="outline" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5" fill="#f1f5f9" stroke="#334155" stroke-width="1.5"/>`;
  const hw = w / 2, hh = h / 2;
  switch (u.type) {
    case 'influent': return `<polygon class="outline" points="${-hw},${-hh} ${hw - 14},${-hh} ${hw},0 ${hw - 14},${hh} ${-hw},${hh}" fill="#dbeafe" stroke="#3b6aa0" stroke-width="1.5"/>
      <text x="-6" y="4" text-anchor="middle" font-size="11" fill="#1e3a8a">IN</text>`;
    case 'effluent': return `<polygon class="outline" points="${-hw},${-hh} ${hw - 14},${-hh} ${hw},0 ${hw - 14},${hh} ${-hw},${hh}" fill="#dcfce7" stroke="#3a8a55" stroke-width="1.5"/>
      <text x="-6" y="4" text-anchor="middle" font-size="11" fill="#14532d">OUT</text>`;
    case 'sludge': return `<polygon class="outline" points="${-hw},${-hh} ${hw - 14},${-hh} ${hw},0 ${hw - 14},${hh} ${-hw},${hh}" fill="#f3e3c3" stroke="#9a7536" stroke-width="1.5"/>
      <text x="-6" y="4" text-anchor="middle" font-size="11" fill="#6b4f1d">WAS</text>`;
    case 'dose': return `<path class="outline" d="M${-hw + 6},${-hh} h${w - 12} v${h * 0.55} l${-(w - 12) / 2},${h * 0.45} l${-(w - 12) / 2},${-h * 0.45} z" fill="#fde68a" stroke="#a16207" stroke-width="1.5"/>
      <text x="0" y="-2" text-anchor="middle" font-size="10" fill="#713f12">${u.p.kind === 'metal' ? (u.p.metal || 'Fe') : u.p.kind === 'alk' ? 'ALK' : 'C'}</text>`;
    case 'cstr': {
      const aer = u.p.aer !== 'none';
      let s = `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="4" fill="${aer ? '#d6ebfb' : '#e3e7f0'}" stroke="#3b5b85" stroke-width="1.5"/>
        <rect x="${-hw + 3}" y="${-hh + 10}" width="${w - 6}" height="${h - 13}" fill="${aer ? 'url(#gW)' : 'url(#gA)'}" />`;
      if (aer) {
        for (let i = 0; i < 9; i++) { const bx = -hw + 10 + (i * 37) % (w - 20), by = hh - 8 - ((i * 23) % (h - 24)); s += `<circle cx="${bx}" cy="${by}" r="${2 + (i % 3)}" fill="#fff" opacity=".85"/>`; }
        s += `<line x1="${-hw + 8}" y1="${hh - 4}" x2="${hw - 8}" y2="${hh - 4}" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="4 3"/>`;
      } else {
        s += `<line x1="0" y1="${-hh - 6}" x2="0" y2="${hh - 14}" stroke="#334155" stroke-width="2"/><path d="M-10,${hh - 14} q10,-6 20,0 q-10,6 -20,0z" fill="#334155"/>`;
      }
      return s;
    }
    case 'clarifier': return `<path class="outline" d="M${-hw},${-hh} H${hw} V${hh * 0.2} L8,${hh} H-8 L${-hw},${hh * 0.2} Z" fill="#e0effa" stroke="#3b5b85" stroke-width="1.5"/>
      <path d="M${-hw + 14},${hh * 0.25} L-6,${hh - 4} H6 L${hw - 14},${hh * 0.25} Z" fill="#c9a66b" opacity=".75"/>
      <line x1="${-hw + 4}" y1="${-hh + 8}" x2="${hw - 4}" y2="${-hh + 8}" stroke="#6b9ccc" stroke-dasharray="3 3"/>`;
    case 'cyclone': return `<path class="outline" d="M${-hw},${-hh} H${hw} V${-hh * 0.35} L5,${hh} H-5 L${-hw},${-hh * 0.35} Z" fill="#e8eef5" stroke="#3b5b85" stroke-width="1.5"/>
      <path d="M${-hw + 8},${-hh * 0.2} q${hw - 8},8 ${2 * hw - 16},0 M${-hw + 14},${hh * 0.15} q${hw - 14},7 ${2 * hw - 28},0 M-6,${hh * 0.5} q6,5 12,0" stroke="#64748b" stroke-width="1.2" fill="none"/>
      <circle cx="-3" cy="${hh * 0.72}" r="2.6" fill="#8a6a3a"/><circle cx="3" cy="${hh * 0.62}" r="2.2" fill="#8a6a3a"/>`;
    case 'sewer': {
      const pr = u.p.kind === 'pressure';
      return `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="${hh}" fill="${pr ? '#e5e7eb' : '#f1f5f9'}" stroke="#57534e" stroke-width="1.6"/>
      <rect x="${-hw + 3}" y="${pr ? -hh + 3 : -hh + h * 0.42}" width="${w - 6}" height="${pr ? h - 6 : h * 0.58 - 3}" rx="${pr ? hh - 3 : 4}" fill="#a8a29e" opacity=".55"/>
      <text x="0" y="4" text-anchor="middle" font-size="9" font-weight="600" fill="#292524">${pr ? 'ỐNG ÁP LỰC' : 'CỐNG TỰ CHẢY'}</text>`;
    }
    case 'psep': return `<path class="outline" d="M${-hw},${-hh} H${hw} V${-hh * 0.1} L6,${hh} H-6 L${-hw},${-hh * 0.1} Z" fill="#e8eef5" stroke="#3b5b85" stroke-width="1.5"/>
      <path d="M${-hw + 16},${hh * 0.15} L-4,${hh - 4} H4 L${hw - 16},${hh * 0.15} Z" fill="#a98c5f" opacity=".7"/>`;
    case 'sbr': {
      let s = '';
      const n = Math.max(1, Math.min(4, Math.round(+u.p.N || 1))), gw = (w - 4 * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const x0 = -hw + i * (gw + 4);
        s += `<rect class="${i === 0 ? 'outline' : ''}" x="${x0}" y="${-hh}" width="${gw}" height="${h}" rx="3" fill="#e3eefa" stroke="#3b5b85" stroke-width="1.5"/>
          <rect x="${x0 + 2}" y="${-hh + 14}" width="${gw - 4}" height="${h - 30}" fill="url(#gW)"/>
          <rect x="${x0 + 2}" y="${hh - 16}" width="${gw - 4}" height="14" fill="#c9a66b" opacity=".8"/>`;
      }
      return s + `<path d="M${hw - 14},${-hh + 6} l6,6 l6,-6" stroke="#1d4ed8" stroke-width="1.6" fill="none"/>`;
    }
    case 'iceas': case 'ctech': {
      // các bể có ngăn trước (prereact/selector) phía đầu vào
      let s = '';
      const ic = u.type === 'iceas', n = Math.max(1, Math.min(4, Math.round(+u.p.N || 1))), gw = (w - 4 * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const x0 = -hw + i * (gw + 4), pz = Math.max(gw * 0.22, 5);
        s += `<rect class="${i === 0 ? 'outline' : ''}" x="${x0}" y="${-hh}" width="${gw}" height="${h}" rx="3" fill="#e3eefa" stroke="#3b5b85" stroke-width="1.5"/>
          <rect x="${x0 + 2}" y="${-hh + 12}" width="${gw - 4}" height="${h - 28}" fill="url(#gW)"/>
          <rect x="${x0 + 2}" y="${hh - 16}" width="${gw - 4}" height="14" fill="#c9a66b" opacity=".8"/>
          <rect x="${x0 + 2}" y="${-hh + 12}" width="${pz}" height="${h - 14}" fill="${ic ? '#cbd5e1' : '#d9f99d'}" opacity=".9"/>
          <line x1="${x0 + 2 + pz}" y1="${-hh + 8}" x2="${x0 + 2 + pz}" y2="${ic ? hh - 12 : hh - 2}" stroke="#334155" stroke-width="1.6"/>`;
      }
      s += `<text x="0" y="${-hh + 9}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${ic ? '#0b4a8f' : '#3f6212'}">${ic ? 'ICEAS' : 'C-TECH'}</text>`;
      return s;
    }
    case 'mbr': {
      let s = `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="4" fill="#d6ebfb" stroke="#3b5b85" stroke-width="1.5"/>
        <rect x="${-hw + 3}" y="${-hh + 10}" width="${w - 6}" height="${h - 13}" fill="url(#gW)"/>`;
      for (let i = 0; i < 6; i++) s += `<rect x="${-hw + 12 + i * 12}" y="${-hh + 16}" width="6" height="${h - 30}" fill="#f8fafc" stroke="#64748b" stroke-width=".8"/>`;
      return s + `<line x1="${-hw + 8}" y1="${hh - 6}" x2="${hw - 8}" y2="${hh - 6}" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="4 3"/>`;
    }
    case 'mbbr': {
      let s = `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="4" fill="#d6ebfb" stroke="#3b5b85" stroke-width="1.5"/>
        <rect x="${-hw + 3}" y="${-hh + 10}" width="${w - 6}" height="${h - 13}" fill="url(#gW)"/>`;
      for (let i = 0; i < 14; i++) { const cx = -hw + 10 + (i * 29) % (w - 20), cy = -hh + 18 + ((i * 17) % (h - 30)); s += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#fef3c7" stroke="#b45309" stroke-width="1"/><line x1="${cx - 4}" y1="${cy}" x2="${cx + 4}" y2="${cy}" stroke="#b45309" stroke-width=".8"/>`; }
      if (u.p.aer !== 'none') s += `<line x1="${-hw + 8}" y1="${hh - 4}" x2="${hw - 8}" y2="${hh - 4}" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="4 3"/>`;
      return s;
    }
    case 'digester': return `<path class="outline" d="M${-hw},${-hh + 16} Q0,${-hh - 10} ${hw},${-hh + 16} V${hh - 14} Q0,${hh + 6} ${-hw},${hh - 14} Z" fill="#e9dfc9" stroke="#6b4f1d" stroke-width="1.5"/>
      <path d="M${-hw + 4},${-hh + 26} H${hw - 4} V${hh - 16} Q0,${hh + 2} ${-hw + 4},${hh - 16} Z" fill="#8a6a3a" opacity=".55"/>
      <text x="0" y="${-hh + 16}" text-anchor="middle" font-size="9.5" fill="#4a3412">CH₄</text>`;
    case 'blower': {
      const n = Math.max(1, Math.min(4, Math.round(+u.p.nDuty || 1) + Math.round(+u.p.nStby || 0)));
      let s = `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="5" fill="#eef6ff" stroke="#1d4ed8" stroke-width="1.5"/>`;
      const gw = (w - 10) / n;
      for (let i = 0; i < n; i++) {
        const cx = -hw + 5 + gw * (i + 0.5), r = Math.min(gw / 2 - 2, 11), stby = i >= Math.round(+u.p.nDuty || 1);
        s += `<circle cx="${cx}" cy="-2" r="${r}" fill="${stby ? '#e5e7eb' : '#bfdbfe'}" stroke="#1e3a8a" stroke-width="1.2"/><path d="M${cx},-2 l${r * 0.8},${-r * 0.35} M${cx},-2 l${-r * 0.4},${r * 0.75} M${cx},-2 l${-r * 0.4},${-r * 0.75}" stroke="#1e3a8a" stroke-width="1.3"/>`;
      }
      return s + `<text x="0" y="${hh - 4}" text-anchor="middle" font-size="9" fill="#1e3a8a" font-weight="700">MÁY THỔI KHÍ</text>`;
    }
    case 'splitter': return `<circle class="outline" r="14" fill="#fff" stroke="#3b5b85" stroke-width="1.5"/>
      <path d="M-8,0 H0 M0,0 L7,-6 M0,0 L7,6" stroke="#3b5b85" stroke-width="1.6" fill="none"/>`;
  }
  return '';
}

function linkPath(P, l, k) {
  const a = P.units.find(u => u.id === l.from[0]), b = P.units.find(u => u.id === l.to[0]);
  if (!a || !b) return null;
  const p1 = FS.portPos(a, l.from[1]), p2 = FS.portPos(b, l.to[1]);
  const backward = p2.x < p1.x + 30 && !(p1.dy === 1 && p2.y > p1.y + 40 && Math.abs(p2.x - p1.x) < 220);
  if (backward) {
    const lo = Math.min(p1.x, p2.x) - 30, hi = Math.max(p1.x, p2.x) + 30;
    let bottom = Math.max(p1.y, p2.y);
    for (const u of P.units) if (u.x > lo && u.x < hi) bottom = Math.max(bottom, u.y + FS.geom(u.type).h / 2 + 22);
    const yl = bottom + 22 + 14 * (k % 6);
    const sx = p1.x + p1.dx * 18, sy = p1.y + p1.dy * 18, ex = p2.x - 22;
    const d = `M${p1.x},${p1.y} L${sx},${sy} L${sx},${yl} L${ex},${yl} L${ex},${p2.y} L${p2.x},${p2.y}`;
    return { d, mid: { x: (sx + ex) / 2, y: yl - 4 } };
  }
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y), c = Math.max(30, dist / 2.5);
  const d = `M${p1.x},${p1.y} C${p1.x + p1.dx * c},${p1.y + p1.dy * c} ${p2.x + p2.dx * c},${p2.y + p2.dy * c} ${p2.x},${p2.y}`;
  return { d, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 5 } };
}

FS.init = function (wrap, getP) {
  FS.wrap = wrap; FS.getP = getP;
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'fsvg';
  wrap.appendChild(svg);
  FS.svg = svg;
  // thu phóng: nút nổi góc trên trái vùng vẽ + Ctrl/⌘ + cuộn chuột
  const zc = document.createElement('div'); zc.className = 'fszoom';
  zc.innerHTML = '<button data-z="pal" title="Ẩn/hiện bảng đơn vị bên trái">◧</button><button data-z="in" title="Phóng to">+</button><b>100 %</b><button data-z="out" title="Thu nhỏ">−</button><button data-z="fit" title="Vừa khung (hiện toàn bộ sơ đồ)">⤢ Vừa khung</button><button data-z="one" title="Cỡ thật 100 %">1:1</button><button data-z="props" title="Ẩn/hiện khung thông số bên phải">◨</button>';
  wrap.insertBefore(zc, svg);
  try { const t = document.getElementById(FS.tabId); if (localStorage.getItem('fs.hide.pal')) t.classList.add('noPal'); if (localStorage.getItem('fs.hide.props')) t.classList.add('noProps'); } catch (e) { /* */ }
  zc.addEventListener('pointerdown', e => e.stopPropagation());
  zc.querySelectorAll('button').forEach(b => (b.onclick = () => { const z = b.dataset.z; if (z === 'pal' || z === 'props') { const t = document.getElementById(FS.tabId); t.classList.toggle(z === 'pal' ? 'noPal' : 'noProps'); try { localStorage.setItem('fs.hide.' + z, t.classList.contains(z === 'pal' ? 'noPal' : 'noProps') ? '1' : ''); } catch (e) { /* */ } return; } if (z === 'fit') FS.fit(); else FS.setScale(z === 'one' ? 1 : (FS.scale || 1) * (z === 'in' ? 1.2 : 1 / 1.2)); }));
  wrap.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); FS.setScale((FS.scale || 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
  svg.addEventListener('pointerdown', FS._down);
  window.addEventListener('pointermove', FS._move);
  window.addEventListener('pointerup', FS._up);
  wrap.addEventListener('dragover', e => e.preventDefault());
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/unit');
    if (!type) return;
    const pt = FS.toSvg(e.clientX, e.clientY);
    FS.addUnit(type, pt.x, pt.y);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const t = document.activeElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (!document.getElementById(FS.tabId).classList.contains('on')) return;
    FS.deleteSel();
  });
};

FS.scale = 1;
FS.toSvg = function (cx, cy) {
  const r = FS.svg.getBoundingClientRect(), k = FS.scale || 1;
  return { x: (cx - r.left) / k, y: (cy - r.top) / k };
};

FS.addUnit = function (type, x, y) {
  const P = FS.getP();
  let i = 1; const prefix = FS.prefix[type] || type.toUpperCase(), T = FS.types();
  while (P.units.some(u => u.id === prefix + i)) i++;
  const u = { id: prefix + i, type, name: T[type].label + ' ' + i, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, p: T[type].def() };
  P.units.push(u);
  FS.sel = { kind: 'unit', id: u.id };
  FS.onChange('add'); FS.render(); FS.onSelect(FS.sel);
};

FS.deleteSel = function () {
  const P = FS.getP(), s = FS.sel;
  if (!s) return;
  if (s.kind === 'unit') {
    P.units = P.units.filter(u => u.id !== s.id);
    P.links = P.links.filter(l => l.from[0] !== s.id && l.to[0] !== s.id);
  } else if (s.kind === 'link') P.links = P.links.filter(l => l.id !== s.id);
  FS.sel = null;
  FS.onChange('delete'); FS.render(); FS.onSelect(null);
};

FS._down = function (e) {
  const P = FS.getP();
  const portEl = e.target.closest('.port');
  if (portEl && portEl.dataset.io === 'out') {
    const u = P.units.find(x => x.id === portEl.dataset.u), pp = FS.portPos(u, portEl.dataset.p);
    FS.linking = { from: [u.id, portEl.dataset.p], x0: pp.x, y0: pp.y };
    const ln = document.createElementNS(NS, 'path');
    ln.setAttribute('class', 'link'); ln.setAttribute('stroke-dasharray', '5 4'); ln.id = 'tmpLink';
    ln.style.pointerEvents = 'none';
    (FS.svg.querySelector('#fsg') || FS.svg).appendChild(ln);
    e.preventDefault(); return;
  }
  const lk = e.target.closest('.linkHit');
  if (lk) { FS.sel = { kind: 'link', id: lk.dataset.l }; FS.render(); FS.onSelect(FS.sel); return; }
  const ue = e.target.closest('.unit');
  if (ue) {
    const u = P.units.find(x => x.id === ue.dataset.u);
    const pt = FS.toSvg(e.clientX, e.clientY);
    FS.drag = { u, dx: pt.x - u.x, dy: pt.y - u.y, moved: false };
    FS.sel = { kind: 'unit', id: u.id };
    FS.render(); FS.onSelect(FS.sel);
    e.preventDefault(); return;
  }
  FS.sel = null; FS.render(); FS.onSelect(null);
};
FS._move = function (e) {
  if (FS.drag) {
    const pt = FS.toSvg(e.clientX, e.clientY);
    FS.drag.u.x = Math.max(40, Math.round((pt.x - FS.drag.dx) / 10) * 10);
    FS.drag.u.y = Math.max(40, Math.round((pt.y - FS.drag.dy) / 10) * 10);
    FS.drag.moved = true;
    FS.render();
  } else if (FS.linking) {
    const pt = FS.toSvg(e.clientX, e.clientY);
    const ln = document.getElementById('tmpLink');
    if (ln) ln.setAttribute('d', `M${FS.linking.x0},${FS.linking.y0} L${pt.x},${pt.y}`);
    FS.svg.querySelectorAll('.port.hot').forEach(p => p.classList.remove('hot'));
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const pe = el && el.closest && el.closest('.port');
    if (pe && pe.dataset.io === 'in') pe.classList.add('hot');
  }
};
FS._up = function (e) {
  if (FS.drag) { const moved = FS.drag.moved; FS.drag = null; if (moved) FS.onChange('move'); }
  if (FS.linking) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const pe = el && el.closest && el.closest('.port');
    const tmp = document.getElementById('tmpLink'); if (tmp) tmp.remove();
    if (pe && pe.dataset.io === 'in' && pe.dataset.u !== FS.linking.from[0]) {
      const P = FS.getP();
      P.links = P.links.filter(l => !(l.from[0] === FS.linking.from[0] && l.from[1] === FS.linking.from[1]));
      let i = 1; while (P.links.some(l => l.id === 'L' + i)) i++;
      P.links.push({ id: 'L' + i, from: FS.linking.from, to: [pe.dataset.u, pe.dataset.p] });
      FS.onChange('link');
    }
    FS.linking = null;
    FS.render();
  }
};

FS.render = function () {
  const P = FS.getP(), svg = FS.svg;
  if (!svg) return;
  let W = 1200, H = 620;
  for (const u of P.units) { W = Math.max(W, u.x + 200); H = Math.max(H, u.y + 220); }
  FS.W = W; FS.H = H;
  const k = FS.scale || 1;
  svg.setAttribute('width', Math.round(W * k)); svg.setAttribute('height', Math.round(H * k));
  let s = `<defs>
    <linearGradient id="gW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0fb"/><stop offset="1" stop-color="#8fbfe9"/></linearGradient>
    <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4dbe6"/><stop offset="1" stop-color="#a9b6c9"/></linearGradient>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4b6584"/></marker>
    <marker id="arrS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#9a7536"/></marker>
  </defs><g id="fsg" transform="scale(${k})">`;
  // ống
  let kBack = 0;
  for (const l of P.links) {
    const lp = linkPath(P, l, kBack);
    if (!lp) continue;
    if (lp.d.includes(' L') && !lp.d.includes('C')) kBack++;
    const sludge = FS.isWaste(l, P);
    const sel = FS.sel && FS.sel.kind === 'link' && FS.sel.id === l.id;
    s += `<path class="link${sludge ? ' sludge' : ''}${sel ? ' sel' : ''}" d="${lp.d}" marker-end="url(#${sludge ? 'arrS' : 'arr'})"/>`;
    s += `<path class="linkHit" data-l="${l.id}" d="${lp.d}"/>`;
    if (FS.qlabels && FS.qlabels[l.id] !== undefined) s += `<text class="qlbl" x="${lp.mid.x}" y="${lp.mid.y}" text-anchor="middle">${FS.qlabels[l.id]}</text>`;
  }
  if (FS.extra) s += FS.extra(P);
  // đơn vị
  for (const u of P.units) {
    const g = FS.geom(u.type), sel = FS.sel && FS.sel.kind === 'unit' && FS.sel.id === u.id, T = FS.types();
    s += `<g class="unit${sel ? ' sel' : ''}" data-u="${u.id}" transform="translate(${u.x},${u.y})"><g class="body">${FS.glyph(u)}</g>`;
    s += `<text class="lbl" x="0" y="${g.h / 2 + 15}" text-anchor="middle" font-weight="600">${esc(u.name)}</text>`;
    s += `</g>`;
    // cửa
    for (const p of T[u.type].ins) { const pp = FS.portPos(u, p); s += `<g class="port" data-u="${u.id}" data-p="${p}" data-io="in"><circle cx="${pp.x}" cy="${pp.y}" r="5"/></g>`; }
    for (const p of T[u.type].outs) {
      const pp = FS.portPos(u, p);
      s += `<g class="port" data-u="${u.id}" data-p="${p}" data-io="out"><circle cx="${pp.x}" cy="${pp.y}" r="5" style="fill:#4b5563"/></g>`;
      if (T[u.type].outs.length > 1) s += `<text x="${pp.x + (pp.dy ? 7 : 4)}" y="${pp.y + (pp.dy ? -4 : -7)}" class="plbl">${FS.portLabel(u, p)}</text>`;
    }
    // chú thích kết quả
    if (FS.overlay && FS.overlay[u.id] && FS.overlay[u.id].length) {
      const lines = FS.overlay[u.id], bw = Math.max(...lines.map(t => t.length)) * 6.3 + 10, bh = lines.length * 13 + 6;
      const by = u.y + g.h / 2 + 22;
      s += `<rect class="annBg" x="${u.x - bw / 2}" y="${by}" width="${bw}" height="${bh}" rx="3"/>`;
      lines.forEach((t, i) => (s += `<text class="ann" x="${u.x - bw / 2 + 5}" y="${by + 13 + i * 13}">${esc(t)}</text>`));
    }
  }
  svg.innerHTML = s + '</g>';
  const zl = FS.wrap && FS.wrap.querySelector('.fszoom b'); if (zl) zl.textContent = Math.round(k * 100) + ' %';
};

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

FS.paletteIcon = function (type) {
  const g = FS.geom(type), sc = Math.min(30 / g.w, 26 / g.h, 1);
  const u = { type, p: FS.types()[type].def() };
  return `<svg width="34" height="30" viewBox="-17 -15 34 30"><g transform="scale(${sc})">${FS.glyph(u)}</g></svg>`;
};

/* cấu hình mặc định (SimXLNT) – module khác (SimNước) ghi đè các hàm này */
FS.tabId = 'tab-fs';
FS.geom = t => geomOf(t);
FS.glyph = glyph;
FS.portPos = portPos;
FS.types = () => UT;
FS.prefix = { influent: 'INF', dose: 'DOS', cstr: 'R', clarifier: 'CL', psep: 'PS', splitter: 'SP', effluent: 'EFF', sludge: 'WAS', sbr: 'SBR', iceas: 'IC', ctech: 'CT', mbr: 'MBR', mbbr: 'MB', digester: 'AD', blower: 'BL', cyclone: 'CY', sewer: 'SW' };
FS.portLabel = (u, p) => (UT[u.type] && UT[u.type].plabel && UT[u.type].plabel[p]) || ({ eff: u.type === 'mbr' ? 'thấm' : CYC.has(u.type) ? 'gạn' : 'tràn', und: u.type === 'mbr' ? 'tuần hoàn' : 'đáy', ovf: 'tràn', a: 'A', b: 'B', was: 'bùn' }[p] || p);
FS.isWaste = (l, P) => l.from[1] === 'und' || l.from[1] === 'was' || (P.units.find(u => u.id === l.to[0]) || {}).type === 'sludge';
/* đường ống khí từ trạm máy thổi tới các bể được cấp khí (nét đứt xanh) */
FS.extra = P => {
  let s = '';
  for (const b of P.units.filter(u => u.type === 'blower')) {
    let ids = Array.isArray(b.p.zones) && b.p.zones.length ? b.p.zones : P.units.filter(u => ['cstr', 'mbr', 'mbbr', 'sbr', 'iceas', 'ctech'].includes(u.type) && (['sbr', 'iceas', 'ctech'].includes(u.type) || u.p.aer !== 'none')).map(u => u.id);
    for (const id of ids) {
      const z = P.units.find(u => u.id === id); if (!z) continue;
      const gz = FS.geom(z.type) || { h: 60 }, x2 = z.x, y2 = z.y + (b.y < z.y ? -gz.h / 2 : gz.h / 2) + (b.y < z.y ? -2 : 2);
      const y1 = b.y + (b.y < z.y ? 25 : -25), ym = (y1 + y2) / 2;
      s += `<path d="M${b.x},${y1} L${b.x},${ym} L${x2},${ym} L${x2},${y2}" fill="none" stroke="#60a5fa" stroke-width="1.6" stroke-dasharray="6 4" style="pointer-events:none"/>`;
    }
  }
  // đường biogas (nét đứt cam): bể phân hủy / bể kỵ khí tốc độ cao → bồn khí → CHP / đuốc
  const gs = P.units.filter(u => ['gasholder', 'chp', 'flare'].includes(u.type));
  if (gs.length) {
    const src = P.units.filter(u => u.type === 'digester' || u.type === 'anr'), hub = gs.find(u => u.type === 'gasholder') || gs[0];
    const ln = (a, b) => { const ym = (a.y + b.y) / 2; s += `<path d="M${a.x},${a.y} L${a.x},${ym} L${b.x},${ym} L${b.x},${b.y}" fill="none" stroke="#f59e0b" stroke-width="1.6" stroke-dasharray="5 4" style="pointer-events:none" opacity=".8"/>`; };
    for (const d of src) ln(d, hub);
    for (const g of gs) if (g !== hub) ln(hub, g);
  }
  return s;
};
/* thu phóng sơ đồ */
FS.setScale = function (k) {
  FS.scale = Math.min(Math.max(k, 0.3), 2.5);
  try { localStorage.setItem('fs.scale.' + FS.tabId + location.pathname, FS.scale); } catch (e) { /* bỏ qua */ }
  FS.render();
};
FS.fit = function () {
  const P = FS.getP(); if (!P || !P.units.length || !FS.wrap) return;
  let x0 = Infinity, x1 = 0, y1 = 0;
  for (const u of P.units) { const g = FS.geom(u.type) || { w: 80, h: 60 }; x0 = Math.min(x0, u.x - g.w / 2); x1 = Math.max(x1, u.x + g.w / 2 + 90); y1 = Math.max(y1, u.y + g.h / 2 + 90); }
  const k = Math.max(Math.min((FS.wrap.clientWidth - 30) / x1, (FS.wrap.clientHeight - 30) / y1, 1.2), 0.5);
  FS.setScale(k);
  FS.wrap.scrollLeft = 0; FS.wrap.scrollTop = 0;
};