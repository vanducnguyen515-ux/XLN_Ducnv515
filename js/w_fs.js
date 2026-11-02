'use strict';
/* ==========================================================================
   SimNước – hình vẽ đơn vị cho trình vẽ sơ đồ dùng chung (flowsheet.js)
   ========================================================================== */
const WGEOM = {
  source: { w: 64, h: 36 }, wwtp: { w: 84, h: 40 }, product: { w: 64, h: 36 }, waste: { w: 64, h: 36 },
  mixer: { w: 30, h: 30 }, splitter: { w: 28, h: 28 }, pump: { w: 34, h: 34 }, hx: { w: 50, h: 40 },
  dose: { w: 44, h: 44 }, coag: { w: 80, h: 56 }, settler: { w: 100, h: 62 }, soften: { w: 90, h: 62 }, filter: { w: 74, h: 62 },
  gac: { w: 48, h: 70 }, ix: { w: 46, h: 70 }, mf: { w: 78, h: 50 }, ro: { w: 96, h: 50 }, edi: { w: 60, h: 52 },
  tank: { w: 86, h: 54 }, ozone: { w: 72, h: 60 }, uv: { w: 80, h: 40 }, stripper: { w: 42, h: 78 }, remin: { w: 48, h: 66 },
  evap: { w: 64, h: 70 }, dewater: { w: 64, h: 48 }, cs: { w: 60, h: 44 }, precip: { w: 72, h: 54 }, ufs: { w: 78, h: 50 }
};
function wPortPos(u, port) {
  const g = WGEOM[u.type], d = WU[u.type], x = u.x, y = u.y, w = g.w, h = g.h;
  const ii = d.ins.indexOf(port);
  if (ii >= 0) {
    const n = d.ins.length, dy = n > 1 ? (ii - (n - 1) / 2) * Math.min(14, h / n) : 0;
    return { x: x - w / 2, y: y + dy, dx: -1, dy: 0 };
  }
  const oi = d.outs.indexOf(port);
  if (oi === 0) return { x: x + w / 2, y, dx: 1, dy: 0 };
  if (oi === 1) return { x, y: y + h / 2, dx: 0, dy: 1 };
  return { x: x + w / 2, y: y + h / 3, dx: 1, dy: 0 };
}
const WCOL = { water: '#d6ebfb', line: '#3b5b85', dark: '#1e3a5f' };
function wGlyph(u) {
  const g = WGEOM[u.type], w = g.w, h = g.h, hw = w / 2, hh = h / 2, L = WCOL.line;
  const arrow = (fill, stroke, txt, tc) => `<polygon class="outline" points="${-hw},${-hh} ${hw - 14},${-hh} ${hw},0 ${hw - 14},${hh} ${-hw},${hh}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><text x="-6" y="4" text-anchor="middle" font-size="10.5" fill="${tc}">${txt}</text>`;
  const box = (fill = WCOL.water, rx = 4) => `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${L}" stroke-width="1.5"/>`;
  const cyl = (fill) => `<path class="outline" d="M${-hw},${-hh + 8} Q0,${-hh - 4} ${hw},${-hh + 8} V${hh - 8} Q0,${hh + 4} ${-hw},${hh - 8} Z" fill="${fill}" stroke="${L}" stroke-width="1.5"/>`;
  const txt = (t, y = 4, s = 10, c = WCOL.dark) => `<text x="0" y="${y}" text-anchor="middle" font-size="${s}" font-weight="600" fill="${c}">${t}</text>`;
  switch (u.type) {
    case 'source': return arrow('#dbeafe', '#3b6aa0', 'NGUỒN', '#1e3a8a');
    case 'wwtp': return arrow('#efe3c8', '#8a6a2f', 'XLNT', '#5b4211') + `<text x="-8" y="${hh - 4}" text-anchor="middle" font-size="7.5" fill="#5b4211">SimXLNT</text>`;
    case 'product': return arrow('#dcfce7', '#3a8a55', 'SẠCH', '#14532d');
    case 'waste': return arrow('#f3e3c3', '#9a7536', 'THẢI', '#6b4f1d');
    case 'mixer': return `<circle class="outline" r="15" fill="#fff" stroke="${L}" stroke-width="1.5"/><path d="M-8,-6 L0,0 L-8,6 M0,0 H9" stroke="${L}" stroke-width="1.6" fill="none"/>`;
    case 'splitter': return `<circle class="outline" r="14" fill="#fff" stroke="${L}" stroke-width="1.5"/><path d="M-8,0 H0 M0,0 L7,-6 M0,0 L7,6" stroke="${L}" stroke-width="1.6" fill="none"/>`;
    case 'pump': return `<circle class="outline" r="17" fill="#e2e8f0" stroke="${L}" stroke-width="1.5"/><polygon points="-7,-9 10,0 -7,9" fill="${L}"/>`;
    case 'hx': return box('#fde2e2') + `<path d="M${-hw + 6},0 l6,-10 l6,20 l6,-20 l6,20 l6,-20 l6,20 l6,-10" stroke="#b91c1c" stroke-width="1.6" fill="none"/>`;
    case 'dose': {
      const c = WCHEM[u.p.chem] || {};
      const ab = { HCl: 'HCl', H2SO4: 'H₂SO₄', CO2: 'CO₂', NaOH: 'NaOH', lime: 'vôi', soda: 'soda', NaHCO3: 'NaHCO₃', CaCl2: 'CaCl₂', FeCl3: 'FeCl₃', Fe2SO43: 'Fe³⁺', alum: 'phèn', PACl: 'PAC', NaOCl: 'Cl₂', Cl2: 'Cl₂', NH4Cl: 'NH₃', NH42SO4: 'NH₃', NH3: 'NH₃', KMnO4: 'KMnO₄', NaHSO3: 'SBS', H2O2: 'H₂O₂', NaF: 'F', H3PO4: 'PO₄', AS: 'AS', poly: 'poly', PAC: 'PAC', HNO3: 'HNO₃', MgOH2: 'Mg(OH)₂', NH4HCO3: 'NH₄⁺', MgCl2: 'MgCl₂', KNO3: 'KNO₃', KNO2: 'KNO₂', AlCl3: 'AlCl₃', FeCl2: 'FeCl₂', FeSO4: 'FeSO₄' }[u.p.chem] || '?';
      const col = c.ox ? '#bbf7d0' : c.coag ? '#fde68a' : c.acid ? '#fecaca' : c.base ? '#e9d5ff' : '#fef3c7';
      return `<path class="outline" d="M${-hw + 5},${-hh} h${w - 10} v${h * 0.55} l${-(w - 10) / 2},${h * 0.45} l${-(w - 10) / 2},${-h * 0.45} z" fill="${col}" stroke="#a16207" stroke-width="1.5"/>` + txt(ab, -2, 9.5, '#713f12');
    }
    case 'coag': return box() + `<rect x="${-hw + 3}" y="${-hh + 10}" width="${w - 6}" height="${h - 13}" fill="url(#gW)"/><line x1="0" y1="${-hh - 6}" x2="0" y2="${hh - 12}" stroke="#334155" stroke-width="2"/><path d="M-12,${hh - 12} h24 M-12,${hh - 22} h24" stroke="#334155" stroke-width="3"/>` +
      Array.from({ length: 8 }, (_, i) => `<circle cx="${-hw + 10 + (i * 23) % (w - 20)}" cy="${-hh + 18 + (i * 13) % (h - 28)}" r="2.2" fill="#a16207" opacity=".7"/>`).join('');
    case 'settler': {
      const k = u.p.kind;
      let s = `<path class="outline" d="M${-hw},${-hh} H${hw} V${hh * 0.2} L8,${hh} H-8 L${-hw},${hh * 0.2} Z" fill="#e0effa" stroke="${L}" stroke-width="1.5"/>`;
      if (k === 'daf') s += Array.from({ length: 12 }, (_, i) => `<circle cx="${-hw + 10 + (i * 17) % (w - 20)}" cy="${-hh + 12 + (i * 11) % (h * 0.5)}" r="1.8" fill="#fff" stroke="#64748b" stroke-width=".6"/>`).join('') + `<rect x="${-hw + 2}" y="${-hh + 2}" width="${w - 4}" height="6" fill="#c9a66b" opacity=".8"/>`;
      else s += `<path d="M${-hw + 14},${hh * 0.25} L-6,${hh - 4} H6 L${hw - 14},${hh * 0.25} Z" fill="#c9a66b" opacity=".75"/>`;
      if (k === 'lam') for (let i = 0; i < 6; i++) s += `<line x1="${-hw + 18 + i * 12}" y1="${-hh + 8}" x2="${-hw + 30 + i * 12}" y2="${-hh + 26}" stroke="#475569" stroke-width="1.4"/>`;
      return s;
    }
    case 'soften': return `<path class="outline" d="M${-hw},${-hh} H${hw} V${hh * 0.2} L8,${hh} H-8 L${-hw},${hh * 0.2} Z" fill="#eef2ff" stroke="${L}" stroke-width="1.5"/><path d="M${-hw + 14},${hh * 0.25} L-6,${hh - 4} H6 L${hw - 14},${hh * 0.25} Z" fill="#e5e7eb" stroke="#9ca3af"/>` + txt('Ca(OH)₂', -hh + 16, 9.5, '#4338ca');
    case 'filter': return box('#e0effa', 2) + `<rect x="${-hw + 3}" y="${-hh + 4}" width="${w - 6}" height="${h * 0.38}" fill="url(#gW)"/><rect x="${-hw + 3}" y="${-hh + 4 + h * 0.38}" width="${w - 6}" height="${h * 0.3}" fill="#e8d6a8"/>` +
      `<rect x="${-hw + 3}" y="${-hh + 4 + h * 0.68}" width="${w - 6}" height="${h * 0.22}" fill="#9a8a6a"/>` + (u.p.bio === 'yes' ? txt('BIO', -hh + 14, 9, '#166534') : '');
    case 'gac': return cyl('#e5e7eb') + Array.from({ length: 22 }, (_, i) => `<circle cx="${-hw + 8 + (i * 13) % (w - 16)}" cy="${-hh + 16 + Math.floor(i / 3) * 6.5}" r="2.4" fill="#111827"/>`).join('') + txt(u.p.bio === 'yes' ? 'BAC' : 'GAC', -hh + 10, 9, '#111827');
    case 'ix': return cyl('#fef9c3') + Array.from({ length: 24 }, (_, i) => `<circle cx="${-hw + 8 + (i * 11) % (w - 16)}" cy="${-hh + 18 + Math.floor(i / 4) * 7}" r="2.6" fill="${(IX_TYPES[u.p.type] || {}).regen === 'NaOH' ? '#60a5fa' : '#f59e0b'}" opacity=".85"/>`).join('') + txt('IX', -hh + 11, 9);
    case 'mf': { let s = box(); for (let i = 0; i < 9; i++) s += `<line x1="${-hw + 9 + i * 7.5}" y1="${-hh + 7}" x2="${-hw + 9 + i * 7.5}" y2="${hh - 7}" stroke="#64748b" stroke-width="2"/>`; return s + txt(u.p.kind || 'UF', 4, 11, '#0f172a'); }
    case 'ufs': { let s = box('#ecfeff'); for (let i = 0; i < 9; i++) s += `<line x1="${-hw + 9 + i * 7.5}" y1="${-hh + 7}" x2="${-hw + 9 + i * 7.5}" y2="${hh - 7}" stroke="#0e7490" stroke-width="2" stroke-dasharray="${u.p.mode === 'cross' ? '0' : '5 2'}"/>`; return s + txt('UF', 4, 11, '#164e63'); }
    case 'precip': return box() + `<rect x="${-hw + 3}" y="${-hh + 8}" width="${w - 6}" height="${h - 11}" fill="url(#gW)"/><line x1="0" y1="${-hh - 6}" x2="0" y2="${hh - 12}" stroke="#334155" stroke-width="2"/><path d="M-11,${hh - 12} h22" stroke="#334155" stroke-width="3"/>` +
      Array.from({ length: 10 }, (_, i) => `<rect x="${-hw + 8 + (i * 19) % (w - 16)}" y="${-hh + 14 + (i * 11) % (h - 26)}" width="3.2" height="3.2" fill="#7c3aed" opacity=".7"/>`).join('') + txt('CaF₂', -hh + 17, 9, '#5b21b6');
    case 'ro': { let s = `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="6" fill="#f1f5f9" stroke="${L}" stroke-width="1.5"/>`; for (let i = 0; i < 3; i++) s += `<rect x="${-hw + 6}" y="${-hh + 6 + i * 13}" width="${w - 12}" height="10" rx="5" fill="#cbd5e1" stroke="#475569" stroke-width=".8"/>`; return s + txt(String(u.p.mem || 'RO').startsWith('NF') ? 'NF' : 'RO', 4, 11, '#0f172a'); }
    case 'edi': { let s = box('#ede9fe'); for (let i = 0; i < 7; i++) s += `<line x1="${-hw + 8 + i * 7.3}" y1="${-hh + 6}" x2="${-hw + 8 + i * 7.3}" y2="${hh - 6}" stroke="${i % 2 ? '#7c3aed' : '#0891b2'}" stroke-width="1.6"/>`; return s + txt('EDI', 4, 10, '#3b0764'); }
    case 'tank': {
      let s = box() + `<rect x="${-hw + 3}" y="${-hh + 8}" width="${w - 6}" height="${h - 11}" fill="url(#gW)"/>`;
      if (u.p.flow === 'plug') for (let i = 1; i < 5; i++) s += `<line x1="${-hw + i * w / 5}" y1="${i % 2 ? -hh + 8 : -hh + 22}" x2="${-hw + i * w / 5}" y2="${i % 2 ? hh - 14 : hh}" stroke="#334155" stroke-width="1.6"/>`;
      if (+u.p.kla > 0) s += `<line x1="${-hw + 8}" y1="${hh - 4}" x2="${hw - 8}" y2="${hh - 4}" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="4 3"/>`;
      return s;
    }
    case 'ozone': { let s = box('#e0f2fe') + `<rect x="${-hw + 3}" y="${-hh + 8}" width="${w - 6}" height="${h - 11}" fill="url(#gW)"/>`; for (let i = 0; i < 10; i++) s += `<circle cx="${-hw + 8 + (i * 17) % (w - 16)}" cy="${hh - 8 - (i * 9) % (h - 22)}" r="2" fill="#fff"/>`; return s + txt('O₃', -2, 13, '#075985'); }
    case 'uv': { let s = `<rect class="outline" x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="${hh}" fill="#ede9fe" stroke="${L}" stroke-width="1.5"/>`; for (let i = 0; i < 3; i++) s += `<rect x="${-hw + 12}" y="${-hh + 8 + i * 9}" width="${w - 24}" height="4" rx="2" fill="#a855f7"/>`; return s + txt('UV', 4, 10, '#4c1d95'); }
    case 'stripper': return box('#f1f5f9', 3) + `<path d="M${-hw + 4},${-hh + 14} l${w - 8},10 M${-hw + 4},${-hh + 24} l${w - 8},10 M${-hw + 4},${-hh + 34} l${w - 8},10 M${-hw + 4},${-hh + 44} l${w - 8},10" stroke="#94a3b8" stroke-width="2"/>` + `<path d="M0,${-hh} v-7" stroke="${L}" stroke-width="2" marker-end="url(#arr)"/>` + txt('khí', hh - 4, 8.5);
    case 'remin': return cyl('#fafaf9') + Array.from({ length: 18 }, (_, i) => `<rect x="${-hw + 8 + (i * 11) % (w - 16)}" y="${-hh + 20 + Math.floor(i / 4) * 7}" width="5" height="4" fill="#d6d3d1" stroke="#a8a29e" stroke-width=".5"/>`).join('') + txt('CaCO₃', -hh + 13, 8.5);
    case 'evap': return `<path class="outline" d="M${-hw},${-hh + 18} Q0,${-hh - 8} ${hw},${-hh + 18} V${hh} H${-hw} Z" fill="#fff7ed" stroke="${L}" stroke-width="1.5"/><rect x="${-hw + 3}" y="${hh - 22}" width="${w - 6}" height="20" fill="#fdba74" opacity=".6"/>` + txt('MVC', -4, 10, '#9a3412');
    case 'dewater': return `<ellipse class="outline" cx="0" cy="0" rx="${hw}" ry="${hh}" fill="#efe3c8" stroke="#6b4f1d" stroke-width="1.5"/><path d="M${-hw + 10},0 H${hw - 10}" stroke="#6b4f1d" stroke-width="3"/>` + txt(u.p.kind === 'press' ? 'ép' : u.p.kind === 'thick' ? 'cô đặc' : 'ly tâm', -8, 9, '#4a3412');
    case 'cs': return box('#f8fafc') + txt('A | B', 4, 10);
  }
  return box();
}
function wConfigFS() {
  FS.tabId = 'tab-fs';
  FS.geom = t => WGEOM[t];
  FS.glyph = wGlyph;
  FS.portPos = wPortPos;
  FS.types = () => WU;
  FS.prefix = { source: 'SRC', wwtp: 'WW', product: 'PR', waste: 'W', mixer: 'MX', splitter: 'SP', pump: 'PU', hx: 'HX', dose: 'D', coag: 'CO', settler: 'SE', soften: 'SO', filter: 'FI', gac: 'GAC', ix: 'IX', mf: 'UF', ro: 'RO', edi: 'EDI', tank: 'TK', ozone: 'OZ', uv: 'UV', stripper: 'ST', remin: 'RM', evap: 'EV', dewater: 'DW', cs: 'CS', precip: 'PT', ufs: 'UF' };
  FS.portLabel = (u, p) => WRES_LBL[p] || p;
  FS.isWaste = (l, P) => ['sludge', 'bw', 'regen', 'conc', 'waste', 'cake'].includes(l.from[1]) || (P.units.find(u => u.id === l.to[0]) || {}).type === 'waste';
}
