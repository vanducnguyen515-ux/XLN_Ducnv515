/* XLCALC – bộ tính công thức Excel thu gọn cho bảng tính mẫu (XLNuoc).
   Hỗ trợ: + − × ÷ ^ & so sánh, −/−− một ngôi, %, tham chiếu ô/vùng, 'Sheet'!$A$1, chuỗi, TRUE/FALSE,
   mảng (vùng trong phép toán → tính theo phần tử, như SUMPRODUCT(--(LEFT(D58:D117,3)="ĐẠT"))).
   Hàm: IF IFERROR AND OR NOT SUM MIN MAX AVERAGE ABS SQRT PI ROUND ROUNDUP ROUNDDOWN CEILING FLOOR INT MOD
        INDEX MATCH SUMPRODUCT LEFT RIGHT LEN TEXT COS SIN TAN ATAN RADIANS DEGREES EXP LN LOG10 POWER.
   const book = XLCALC.book(cells)  // cells: {sheet:{A1:['n'|'s'|'b'|'f', giá trị/công thức]}}
   book.set(sheet, addr, v) · book.get(sheet, addr) · book.recalc() */
const XLCALC = (() => {
  const ERR = e => ({ err: e });
  const isErr = v => v && typeof v === 'object' && 'err' in v;
  const isArr = v => Array.isArray(v);

  /* ---------- tách từ ---------- */
  function lex(s) {
    const T = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') { i++; continue; }
      if (c === '"') { let j = i + 1, t = ''; for (;;) { if (s[j] === '"') { if (s[j + 1] === '"') { t += '"'; j += 2; continue; } break; } if (j >= s.length) throw Error('chuỗi chưa đóng'); t += s[j++]; } T.push({ t: 'str', v: t }); i = j + 1; continue; }
      let m;
      const rest = s.slice(i);
      // tham chiếu: ['Sheet'!|Sheet!] $A$1[:$B$2]
      if ((m = rest.match(/^(?:'((?:[^']|'')+)'!|([A-Za-z_][\w.]*)!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?(?![\w(])/))) {
        T.push({ t: 'ref', sh: m[1] ? m[1].replace(/''/g, "'") : (m[2] || null), a: m[3].replace(/\$/g, ''), b: m[4] ? m[4].replace(/\$/g, '') : null });
        i += m[0].length; continue;
      }
      if ((m = rest.match(/^\d+(\.\d*)?([eE][+-]?\d+)?|^\.\d+([eE][+-]?\d+)?/))) { T.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = rest.match(/^([A-Za-z_][\w.]*)\s*\(/))) { T.push({ t: 'fn', v: m[1].toUpperCase() }); i += m[0].length; continue; }
      if ((m = rest.match(/^(TRUE|FALSE)(?![\w(])/i))) { T.push({ t: 'bool', v: m[1].toUpperCase() === 'TRUE' }); i += m[0].length; continue; }
      if ((m = rest.match(/^(<=|>=|<>)/))) { T.push({ t: 'op', v: m[1] }); i += 2; continue; }
      if ('+-*/^&=<>%(),;'.includes(c)) { T.push({ t: c === '(' || c === ')' || c === ',' || c === ';' ? c.replace(';', ',') : 'op', v: c }); i++; continue; }
      throw Error('ký tự lạ "' + c + '" trong ' + s);
    }
    return T;
  }

  /* ---------- phân tích cú pháp (ưu tiên toán tử như Excel) ---------- */
  function parse(src) {
    const T = lex(src); let p = 0;
    const peek = () => T[p], next = () => T[p++];
    const isOp = (...o) => T[p] && T[p].t === 'op' && o.includes(T[p].v);
    function cmp() { let l = cat(); while (isOp('=', '<', '>', '<=', '>=', '<>')) { const o = next().v; l = { k: 'bin', o, l, r: cat() }; } return l; }
    function cat() { let l = add(); while (isOp('&')) { next(); l = { k: 'bin', o: '&', l, r: add() }; } return l; }
    function add() { let l = mul(); while (isOp('+', '-')) { const o = next().v; l = { k: 'bin', o, l, r: mul() }; } return l; }
    function mul() { let l = pow(); while (isOp('*', '/')) { const o = next().v; l = { k: 'bin', o, l, r: pow() }; } return l; }
    function pow() { let l = una(); while (isOp('^')) { next(); l = { k: 'bin', o: '^', l, r: una() }; } return l; }
    function una() { if (isOp('-', '+')) { const o = next().v; const e = una(); return o === '-' ? { k: 'neg', e } : { k: 'pos', e }; } return pct(); }
    function pct() { let e = atom(); while (isOp('%')) { next(); e = { k: 'bin', o: '/', l: e, r: { k: 'num', v: 100 } }; } return e; }
    function atom() {
      const t = next();
      if (!t) throw Error('thiếu toán hạng');
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'str') return { k: 'str', v: t.v };
      if (t.t === 'bool') return { k: 'bool', v: t.v };
      if (t.t === 'ref') return { k: 'ref', sh: t.sh, a: t.a, b: t.b };
      if (t.t === '(') { const e = cmp(); if (!peek() || next().t !== ')') throw Error('thiếu )'); return e; }
      if (t.t === 'fn') {
        const args = [];
        if (peek() && peek().t === ')') { next(); return { k: 'fn', n: t.v, args }; }
        for (;;) {
          if (peek() && (peek().t === ',' || peek().t === ')')) args.push({ k: 'blank' }); else args.push(cmp());
          const s = next(); if (!s) throw Error('thiếu )');
          if (s.t === ')') break; if (s.t !== ',') throw Error('mong đợi , hoặc )');
        }
        return { k: 'fn', n: t.v, args };
      }
      throw Error('không hiểu "' + (t.v || t.t) + '"');
    }
    const e = cmp(); if (p < T.length) throw Error('thừa ký tự ở ' + src);
    return e;
  }

  /* ---------- tiện ích địa chỉ ---------- */
  const colNum = s => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const colStr = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  const split = a => { const m = a.match(/^([A-Z]+)(\d+)$/); return [colNum(m[1]), +m[2]]; };

  /* ---------- ép kiểu ---------- */
  function num(v) {
    if (isErr(v)) throw v;
    if (isArr(v)) v = v[0][0];
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const x = Number(String(v).trim()); if (String(v).trim() !== '' && isFinite(x)) return x;
    throw ERR('#VALUE!');
  }
  function str(v) {
    if (isErr(v)) throw v;
    if (isArr(v)) v = v[0][0];
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return fmtGeneral(v);
    return String(v);
  }
  function bool(v) {
    if (isErr(v)) throw v;
    if (isArr(v)) v = v[0][0];
    if (typeof v === 'boolean') return v;
    if (v === null || v === undefined || v === '') return false;
    if (typeof v === 'number') return v !== 0;
    const u = String(v).toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false;
    throw ERR('#VALUE!');
  }
  function fmtGeneral(x) {
    if (!isFinite(x)) return '#NUM!';
    if (Number.isInteger(x)) return String(x);
    const a = Math.abs(x);
    if (a >= 1e11 || a < 1e-9) return x.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E');
    const d = Math.max(0, 10 - Math.floor(Math.log10(a)) - 1);
    return String(+x.toFixed(Math.min(d, 15)));
  }
  // làm tròn kiểu Excel (nửa xa 0), chống sai số nhị phân
  function xround(x, d) { const f = Math.pow(10, d); const y = Math.abs(x) * f; const r = Math.round(+y.toPrecision(15)); return Math.sign(x) * r / f; }
  // TEXT(x, fmt): hỗ trợ 0 / 0.0… / #,##0[.00] / 0% – dấu thập phân '.', ngăn nghìn ',' (như Excel lưu trong file mẫu)
  function TEXT(x, f) {
    if (typeof x !== 'number') { try { x = num(x); } catch (e) { return str(x); } }
    let pct = false; if (/%$/.test(f)) { pct = true; f = f.slice(0, -1); x *= 100; }
    const m = f.match(/^([#,0]*)(?:\.(0+))?$/);
    if (!m) return fmtGeneral(x);
    const dec = m[2] ? m[2].length : 0, thou = m[1].includes(',');
    const r = xround(x, dec);
    let [ip, fp] = Math.abs(r).toFixed(dec).split('.');
    if (thou) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (r < 0 ? '-' : '') + ip + (dec ? '.' + fp : '') + (pct ? '%' : '');
  }

  /* ---------- sổ tính ---------- */
  function book(cells) {
    const sheets = {};
    for (const sh in cells) { sheets[sh] = {}; for (const a in cells[sh]) sheets[sh][a] = cells[sh][a].slice(); }
    const ast = {}, val = {}, busy = {};
    let curSheet = null;

    function cellVal(sh, a) {
      const S = sheets[sh]; if (!S) return ERR('#REF!');
      const c = S[a]; if (!c) return null;
      if (c[0] !== 'f') return c[1];
      const key = sh + '!' + a;
      if (key in val) return val[key];
      if (busy[key]) return ERR('#CIRC!');
      busy[key] = 1;
      let r;
      try {
        if (!ast[key]) ast[key] = parse(c[1]);
        const prev = curSheet; curSheet = sh;
        try { r = ev(ast[key]); } finally { curSheet = prev; }
        if (isArr(r)) r = r[0][0];
        if (typeof r === 'number' && !isFinite(r)) r = ERR('#NUM!');
      } catch (e) { r = isErr(e) ? e : ERR('#ERR: ' + (e.message || e)); }
      delete busy[key];
      val[key] = r === undefined ? null : r;
      return val[key];
    }
    function range(sh, a, b) {
      const [c1, r1] = split(a), [c2, r2] = split(b);
      const out = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
        const row = [];
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) row.push(cellVal(sh, colStr(c) + r));
        out.push(row);
      }
      return out;
    }
    const flat = v => isArr(v) ? [].concat(...v) : [v];
    // phép toán theo phần tử khi có mảng
    function map2(a, b, f) {
      if (!isArr(a) && !isArr(b)) return f(a, b);
      const A = isArr(a) ? a : [[a]], B = isArr(b) ? b : [[b]];
      const R = Math.max(A.length, B.length), C = Math.max(A[0].length, B[0].length);
      const out = [];
      for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) { const x = A[A.length === 1 ? 0 : i] ? A[A.length === 1 ? 0 : i][A[0].length === 1 ? 0 : j] : ERR('#N/A'); const y = B[B.length === 1 ? 0 : i] ? B[B.length === 1 ? 0 : i][B[0].length === 1 ? 0 : j] : ERR('#N/A'); try { row.push(f(x, y)); } catch (e) { row.push(isErr(e) ? e : ERR('#VALUE!')); } } out.push(row); }
      return out;
    }
    const map1 = (a, f) => isArr(a) ? a.map(r => r.map(x => { try { return f(x); } catch (e) { return isErr(e) ? e : ERR('#VALUE!'); } })) : f(a);
    function compare(x, y) {
      if (isErr(x)) throw x; if (isErr(y)) throw y;
      const tx = x === null ? (typeof y === 'string' ? 's' : typeof y === 'boolean' ? 'b' : 'n') : typeof x === 'number' ? 'n' : typeof x === 'boolean' ? 'b' : 's';
      const ty = y === null ? tx : typeof y === 'number' ? 'n' : typeof y === 'boolean' ? 'b' : 's';
      if (x === null) x = tx === 's' ? '' : tx === 'b' ? false : 0;
      if (y === null) y = ty === 's' ? '' : ty === 'b' ? false : 0;
      const rank = { n: 0, s: 1, b: 2 };
      if (tx !== ty) return rank[tx] - rank[ty];
      if (tx === 's') { const a = x.toLowerCase(), b = y.toLowerCase(); return a < b ? -1 : a > b ? 1 : 0; }
      return (+x) - (+y);
    }

    function ev(n) {
      switch (n.k) {
        case 'num': case 'str': case 'bool': return n.v;
        case 'blank': return null;
        case 'ref': { const sh = n.sh || curSheet; return n.b ? range(sh, n.a, n.b) : cellVal(sh, n.a); }
        case 'neg': return map1(ev(n.e), x => -num(x));
        case 'pos': return ev(n.e);
        case 'bin': {
          const l = ev(n.l), r = ev(n.r);
          switch (n.o) {
            case '+': return map2(l, r, (a, b) => num(a) + num(b));
            case '-': return map2(l, r, (a, b) => num(a) - num(b));
            case '*': return map2(l, r, (a, b) => num(a) * num(b));
            case '/': return map2(l, r, (a, b) => { const d = num(b); if (d === 0) throw ERR('#DIV/0!'); return num(a) / d; });
            case '^': return map2(l, r, (a, b) => Math.pow(num(a), num(b)));
            case '&': return map2(l, r, (a, b) => str(a) + str(b));
            case '=': return map2(l, r, (a, b) => compare(a, b) === 0);
            case '<>': return map2(l, r, (a, b) => compare(a, b) !== 0);
            case '<': return map2(l, r, (a, b) => compare(a, b) < 0);
            case '>': return map2(l, r, (a, b) => compare(a, b) > 0);
            case '<=': return map2(l, r, (a, b) => compare(a, b) <= 0);
            case '>=': return map2(l, r, (a, b) => compare(a, b) >= 0);
          }
        }
        case 'fn': return call(n.n, n.args);
      }
      throw Error('nút lạ');
    }
    const nums = vals => { const o = []; for (const v of vals) for (const x of flat(v)) { if (isErr(x)) throw x; if (typeof x === 'number') o.push(x); else if (typeof x === 'boolean' && !isArr(v)) o.push(+x); else if (typeof x === 'string' && !isArr(v)) o.push(num(x)); } return o; };

    function call(f, A) {
      const E = i => ev(A[i]);
      switch (f) {
        case 'IF': { const c = bool(E(0)); return c ? (A.length > 1 ? E(1) : true) : (A.length > 2 ? E(2) : false); }
        case 'IFERROR': { let v; try { v = E(0); } catch (e) { if (isErr(e)) return E(1); throw e; } return isErr(v) ? E(1) : v; }
        case 'AND': { let r = true; for (const a of A) for (const x of flat(ev(a))) { if (isErr(x)) throw x; if (x !== null && x !== '') r = r && bool(x); } return r; }
        case 'OR': { let r = false; for (const a of A) for (const x of flat(ev(a))) { if (isErr(x)) throw x; if (x !== null && x !== '') r = r || bool(x); } return r; }
        case 'NOT': return !bool(E(0));
        case 'SUM': return nums(A.map(ev)).reduce((s, x) => s + x, 0);
        case 'AVERAGE': { const v = nums(A.map(ev)); if (!v.length) throw ERR('#DIV/0!'); return v.reduce((s, x) => s + x, 0) / v.length; }
        case 'MIN': { const v = nums(A.map(ev)); return v.length ? Math.min(...v) : 0; }
        case 'MAX': { const v = nums(A.map(ev)); return v.length ? Math.max(...v) : 0; }
        case 'ABS': return map1(E(0), x => Math.abs(num(x)));
        case 'SQRT': return map1(E(0), x => { x = num(x); if (x < 0) throw ERR('#NUM!'); return Math.sqrt(x); });
        case 'PI': return Math.PI;
        case 'INT': return Math.floor(num(E(0)));
        case 'MOD': { const a = num(E(0)), b = num(E(1)); if (b === 0) throw ERR('#DIV/0!'); return a - b * Math.floor(a / b); }
        case 'ROUND': return xround(num(E(0)), num(E(1)));
        case 'ROUNDUP': case 'ROUNDDOWN': {
          const x = num(E(0)), d = A.length > 1 ? num(E(1)) : 0, k = Math.pow(10, d), y = +(Math.abs(x) * k).toPrecision(15);
          return Math.sign(x) * (f === 'ROUNDUP' ? Math.ceil(y) : Math.floor(y)) / k;
        }
        case 'CEILING': case 'FLOOR': {
          const x = num(E(0)), s = A.length > 1 ? num(E(1)) : 1; if (s === 0) return 0;
          if (x > 0 && s < 0) throw ERR('#NUM!');
          const q = +(x / s).toPrecision(15);
          return (f === 'CEILING' ? (x < 0 && s > 0 ? Math.trunc(q) : Math.ceil(q)) : Math.floor(q)) * s;
        }
        case 'POWER': return Math.pow(num(E(0)), num(E(1)));
        case 'EXP': return Math.exp(num(E(0)));
        case 'LN': return Math.log(num(E(0)));
        case 'LOG10': return Math.log10(num(E(0)));
        case 'COS': return Math.cos(num(E(0)));
        case 'SIN': return Math.sin(num(E(0)));
        case 'TAN': return Math.tan(num(E(0)));
        case 'ATAN': return Math.atan(num(E(0)));
        case 'RADIANS': return num(E(0)) * Math.PI / 180;
        case 'DEGREES': return num(E(0)) * 180 / Math.PI;
        case 'LEFT': { const n = A.length > 1 ? num(E(1)) : 1; return map1(E(0), x => [...str(x)].slice(0, n).join('')); }
        case 'RIGHT': { const n = A.length > 1 ? num(E(1)) : 1; return map1(E(0), x => { const c = [...str(x)]; return c.slice(Math.max(0, c.length - n)).join(''); }); }
        case 'LEN': return map1(E(0), x => [...str(x)].length);
        case 'TEXT': return TEXT(E(0), str(E(1)));
        case 'SUMPRODUCT': {
          const arrs = A.map(a => { const v = ev(a); return isArr(v) ? v : [[v]]; });
          let s = 0;
          for (let i = 0; i < arrs[0].length; i++) for (let j = 0; j < arrs[0][0].length; j++) {
            let p = 1;
            for (const M of arrs) { const x = M[i] ? M[i][j] : 0; if (isErr(x)) throw x; p *= typeof x === 'number' ? x : typeof x === 'boolean' && arrs.length === 1 ? 0 : 0; }
            s += p;
          }
          return s;
        }
        case 'INDEX': {
          const R = E(0), M = isArr(R) ? R : [[R]];
          let r = num(E(1)), c = A.length > 2 ? num(E(2)) : 1;
          if (M.length === 1 && A.length === 2) { c = r; r = 1; }
          r = Math.trunc(r); c = Math.trunc(c);
          if (r < 1 || c < 1 || r > M.length || c > M[0].length) throw ERR('#REF!');
          return M[r - 1][c - 1];
        }
        case 'MATCH': {
          const v = E(0), L = flat(E(1)), t = A.length > 2 ? num(E(2)) : 1;
          if (isErr(v)) throw v;
          if (t === 0) { for (let i = 0; i < L.length; i++) if (L[i] !== null && compare(L[i], v) === 0) return i + 1; throw ERR('#N/A'); }
          let k = -1;
          for (let i = 0; i < L.length; i++) {
            if (L[i] === null || isErr(L[i])) continue;
            const c = compare(L[i], v);
            if (t > 0 ? c <= 0 : c >= 0) k = i; else break;
          }
          if (k < 0) throw ERR('#N/A');
          return k + 1;
        }
      }
      throw ERR('#NAME? ' + f);
    }

    return {
      sheets,
      get: (sh, a) => cellVal(sh, a),
      set(sh, a, v) {
        if (!sheets[sh]) sheets[sh] = {};
        sheets[sh][a] = typeof v === 'number' ? ['n', v] : typeof v === 'boolean' ? ['b', v] : v === null || v === undefined || v === '' ? ['s', ''] : ['s', String(v)];
        for (const k in val) delete val[k];
      },
      raw: (sh, a) => sheets[sh] && sheets[sh][a],
      recalc() { for (const k in val) delete val[k]; },
      evalAll() { const out = {}; for (const sh in sheets) { out[sh] = {}; for (const a in sheets[sh]) if (sheets[sh][a][0] === 'f') out[sh][a] = cellVal(sh, a); } return out; },
      formula(sh, src) { const prev = curSheet; curSheet = sh; try { const r = ev(parse(src)); return isArr(r) ? r[0][0] : r; } catch (e) { return isErr(e) ? e : ERR(String(e.message || e)); } finally { curSheet = prev; } }
    };
  }
  return { book, parse, TEXT, isErr, colStr, colNum };
})();
if (typeof module !== 'undefined') module.exports = XLCALC;
