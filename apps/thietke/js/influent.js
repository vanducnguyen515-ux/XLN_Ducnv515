/* =====================================================================
   KIỂM TRA SỰ PHÙ HỢP & LOGIC CỦA BỘ SỐ LIỆU NƯỚC THẢI ĐẦU VÀO
   - Quan hệ bắt buộc giữa các chỉ tiêu (BOD ≤ COD, NH₄-N ≤ TKN ≤ TN, …)
   - Tỷ lệ đặc trưng (BOD/COD, NH₄/TKN, TSS/COD, dinh dưỡng BOD:N:P, kiềm cho nitrat hóa)
   - Đối chiếu khoảng nồng độ thường gặp theo loại nước thải (sinh hoạt, KCN, một số ngành)
   Khoảng tham chiếu là giá trị tổng hợp để sàng lọc sơ bộ (M&E 5th Bảng 3-18; WB/IFC EHS Guidelines
   theo ngành; TCVN 7957:2008; tài liệu XLNT trong nước) — không thay cho số liệu quan trắc thực tế.
   ===================================================================== */
'use strict';

const INF = (() => {
  /* ---------- Hồ sơ nước thải tham chiếu ----------
     r: khoảng thường gặp [thấp, cao]; rt: tỷ lệ đặc trưng; kTCVN: dùng bảng hệ số không điều hòa TCVN 7957 */
  const TYPES = {
    sh: {
      name: 'Nước thải sinh hoạt (đô thị, khu dân cư)', short: 'Sinh hoạt', kTCVN: true,
      r: { COD: [150, 800], BOD: [80, 400], TSS: [80, 400], TN: [20, 85], TKN: [20, 85], NH4: [12, 60], TP: [3, 15], OG: [0, 10], Color: [20, 150], Alk: [100, 350], Coli: [1e5, 1e9], pH: [6.5, 8.0] },
      rt: { BOD_COD: [0.4, 0.7], NH4_TKN: [0.5, 0.85], TSS_COD: [0.3, 1.0], TP_COD: 0.04 },
      src: 'M&E 5th Bảng 3-18 (loãng – đặc); nước thải cống chung ở VN thường ở cận dưới (qua bể phốt, pha loãng nước mưa)',
      note: 'Nước thải qua bể tự hoại và cống chung ở Việt Nam thường loãng (COD 150 – 350 mg/L) và NH₄/TKN cao.',
    },
    kcn: {
      name: 'KCN tập trung (đã tiền xử lý cục bộ theo tiêu chuẩn đấu nối)', short: 'KCN tập trung',
      r: { COD: [150, 800], BOD: [80, 400], TSS: [50, 400], TN: [15, 80], TKN: [15, 80], NH4: [5, 50], TP: [2, 15], OG: [0, 20], Color: [50, 500], Alk: [100, 400], Coli: [1e3, 1e7], pH: [5.5, 9] },
      rt: { BOD_COD: [0.3, 0.65], NH4_TKN: [0.4, 0.9], TSS_COD: [0.15, 1.0], TP_COD: 0.05 },
      src: 'Tổng hợp số liệu ĐTM/quan trắc các KCN đa ngành; tiêu chuẩn đấu nối thường ≈ QCVN 40:2011 cột B hoặc quy định riêng của KCN',
      note: 'Nồng độ phụ thuộc cơ cấu ngành và tiêu chuẩn đấu nối của KCN – số liệu vượt tiêu chuẩn đấu nối cho thấy doanh nghiệp chưa tiền xử lý đạt, cần làm rõ trước khi chọn làm số liệu thiết kế.',
    },
    benhvien: {
      name: 'Nước thải y tế (bệnh viện)', short: 'Y tế', kTCVN: true,
      r: { COD: [150, 600], BOD: [80, 300], TSS: [50, 250], TN: [20, 70], TKN: [20, 70], NH4: [10, 50], TP: [3, 10], OG: [0, 10], Color: [20, 100], Alk: [100, 300], Coli: [1e5, 1e8], pH: [6.5, 8.5] },
      rt: { BOD_COD: [0.4, 0.7], NH4_TKN: [0.5, 0.85], TSS_COD: [0.2, 1.0], TP_COD: 0.04 },
      src: 'Tổng hợp số liệu quan trắc bệnh viện; quy chuẩn xả QCVN 28:2010/BTNMT',
      note: 'Tính chất gần nước thải sinh hoạt; ngoài ra cần khử trùng triệt để và kiểm soát chất thải lây nhiễm, phóng xạ (nếu có). Quy chuẩn xả áp dụng: QCVN 28.',
    },
    detnhuom: {
      name: 'Dệt nhuộm', short: 'Dệt nhuộm',
      r: { COD: [500, 3000], BOD: [150, 900], TSS: [50, 500], TN: [10, 80], TKN: [10, 80], NH4: [2, 30], TP: [1, 10], OG: [0, 20], Color: [300, 5000], Alk: [200, 1500], Coli: [0, 1e4], pH: [7, 11] },
      rt: { BOD_COD: [0.2, 0.45], NH4_TKN: [0.2, 0.8], TSS_COD: [0.03, 0.5], TP_COD: 0.02 },
      src: 'WB/IFC EHS Guidelines – Textile Manufacturing; QCVN 13-MT:2015/BTNMT',
      note: 'Màu và COD khó phân hủy cao, pH kiềm → thường cần trung hòa, keo tụ/ oxy hóa nâng cao; kiểm tra thêm AOX, kim loại theo QCVN 13-MT.',
    },
    thuysan: {
      name: 'Chế biến thủy sản', short: 'Thủy sản',
      r: { COD: [800, 5000], BOD: [500, 3000], TSS: [200, 1500], TN: [80, 400], TKN: [80, 400], NH4: [30, 200], TP: [10, 60], OG: [0, 20], Color: [50, 300], Alk: [200, 800], Coli: [1e4, 1e7], pH: [6, 8] },
      rt: { BOD_COD: [0.5, 0.75], NH4_TKN: [0.2, 0.7], TSS_COD: [0.15, 0.6], TP_COD: 0.03 },
      src: 'WB/IFC EHS Guidelines – Fish Processing; QCVN 11-MT:2015/BTNMT',
      note: 'N hữu cơ (protein) và dầu mỡ động thực vật cao → tách mỡ/ tuyển nổi trước sinh học, tải lượng N lớn cần khử nitrat mạnh.',
    },
    bia: {
      name: 'Bia – nước giải khát', short: 'Bia – NGK',
      r: { COD: [1500, 6000], BOD: [900, 4000], TSS: [200, 1000], TN: [20, 100], TKN: [20, 100], NH4: [5, 40], TP: [5, 40], OG: [0, 10], Color: [50, 300], Alk: [200, 1000], Coli: [0, 1e5], pH: [4, 12] },
      rt: { BOD_COD: [0.55, 0.75], NH4_TKN: [0.1, 0.6], TSS_COD: [0.05, 0.3], TP_COD: 0.02 },
      src: 'WB/IFC EHS Guidelines – Breweries; Beverages',
      note: 'Hữu cơ dễ phân hủy nồng độ cao, pH dao động mạnh (CIP axit/xút) → điều hòa – trung hòa, thường xử lý kỵ khí (UASB/IC) trước hiếu khí; có thể thiếu N.',
    },
    thucpham: {
      name: 'Chế biến thực phẩm – tinh bột', short: 'Thực phẩm',
      r: { COD: [2000, 15000], BOD: [1200, 9000], TSS: [300, 3000], TN: [50, 400], TKN: [50, 400], NH4: [10, 100], TP: [10, 80], OG: [0, 20], Color: [50, 500], Alk: [100, 1000], Coli: [1e3, 1e7], pH: [4, 7] },
      rt: { BOD_COD: [0.5, 0.75], NH4_TKN: [0.1, 0.6], TSS_COD: [0.05, 0.4], TP_COD: 0.02 },
      src: 'WB/IFC EHS Guidelines – Food & Beverage Processing; tài liệu XLNT chế biến tinh bột sắn',
      note: 'Nồng độ rất cao, pH axit (tinh bột sắn có CN⁻) → xử lý kỵ khí trước; phần mềm hiện tính theo sơ đồ hiếu khí nên cần giảm tải trước khi áp dụng.',
    },
    giay: {
      name: 'Giấy – bột giấy tái chế', short: 'Giấy',
      r: { COD: [1000, 6000], BOD: [300, 2000], TSS: [300, 3000], TN: [5, 30], TKN: [5, 30], NH4: [1, 15], TP: [0.5, 5], OG: [0, 10], Color: [200, 2000], Alk: [100, 800], Coli: [0, 1e4], pH: [6.5, 9] },
      rt: { BOD_COD: [0.3, 0.5], NH4_TKN: [0.1, 0.6], TSS_COD: [0.2, 1.0], TP_COD: 0.005 },
      src: 'WB/IFC EHS Guidelines – Pulp and Paper Mills; QCVN 12-MT:2015/BTNMT',
      note: 'Thiếu N, P dinh dưỡng (cần bổ sung urê, H₃PO₄), TSS xơ sợi cao, màu (lignin).',
    },
    channuoi: {
      name: 'Chăn nuôi heo (sau biogas)', short: 'Chăn nuôi',
      r: { COD: [800, 5000], BOD: [400, 2500], TSS: [300, 3000], TN: [200, 1000], TKN: [200, 1000], NH4: [150, 800], TP: [20, 100], OG: [0, 10], Color: [200, 2000], Alk: [1000, 5000], Coli: [1e5, 1e8], pH: [7, 8.5] },
      rt: { BOD_COD: [0.35, 0.6], NH4_TKN: [0.6, 0.95], TSS_COD: [0.2, 1.0], TP_COD: 0.15 },
      src: 'Tổng hợp số liệu trang trại heo sau biogas ở VN; QCVN 62-MT:2016/BTNMT',
      note: 'N rất cao, C/N thấp sau biogas → khử N cần carbon ngoài hoặc công nghệ riêng (Anammox, stripping); kiềm cao.',
    },
    xima: {
      name: 'Cơ khí – xi mạ, điện tử', short: 'Xi mạ – điện tử',
      r: { COD: [50, 400], BOD: [20, 150], TSS: [50, 300], TN: [5, 60], TKN: [5, 60], NH4: [1, 40], TP: [0.5, 10], OG: [5, 100], Color: [10, 100], Alk: [50, 300], Coli: [0, 1e3], pH: [2, 11] },
      rt: { BOD_COD: [0.15, 0.45], NH4_TKN: [0.3, 0.95], TSS_COD: [0.3, 2.0], TP_COD: 0.05 },
      src: 'WB/IFC EHS Guidelines – Metal, Plastic, Rubber Products; Semiconductors & Electronics',
      note: 'Chỉ tiêu quyết định là kim loại nặng, Cr⁶⁺, CN⁻, F⁻ – phải xử lý hóa lý riêng từng dòng (khử Cr⁶⁺, oxy hóa CN⁻, kết tủa) trước khi vào sinh học; phần mềm không tính các chỉ tiêu này.',
    },
  };

  /* ---------- Nguyên nhân thường gặp & việc cần kiểm tra theo chỉ tiêu ---------- */
  const CAUSE = {
    COD: { hi: 'nguồn thải nồng độ cao chưa tiền xử lý (công nghiệp, hút bể phốt, nước rỉ rác), mẫu đơn lấy lúc cao điểm', lo: 'pha loãng do nước mưa/ nước ngầm thấm vào cống, mẫu lấy sau mưa hoặc giờ thấp điểm' },
    BOD: { hi: 'nguồn hữu cơ dễ phân hủy nồng độ cao (thực phẩm, đồ uống), mẫu đơn lúc cao điểm', lo: 'pha loãng; hoặc mẫu có chất ức chế (clo dư, kim loại, pH lệch) làm BOD₅ đo thấp giả' },
    TSS: { hi: 'đất cát theo nước mưa chảy tràn, xả cặn bể/ nạo vét cống, lấy mẫu sát đáy', lo: 'mẫu lấy ở lớp nước trong hoặc sau bể lắng/ bể tự hoại' },
    TN: { hi: 'nguồn giàu N (bể phốt, chăn nuôi, thủy sản, nước rỉ rác, sản xuất phân bón)', lo: 'pha loãng; ngành nghèo dinh dưỡng (giấy, dệt, đồ uống)' },
    TKN: { hi: 'nguồn giàu N hữu cơ/ amoni', lo: 'pha loãng; ngành nghèo dinh dưỡng' },
    NH4: { hi: 'nước thải đã phân hủy lâu (bể phốt, biogas, nước rỉ rác); ghi nhầm NH₄⁺ thay NH₄⁺-N (NH₄⁺ = 1,29 × NH₄-N)', lo: 'N chủ yếu ở dạng hữu cơ (nước thải tươi, protein) hoặc pha loãng' },
    TP: { hi: 'chất tẩy rửa chứa phosphat, thực phẩm/ thủy sản; ghi nhầm PO₄³⁻ thay P (PO₄³⁻ = 3,07 × P)', lo: 'pha loãng; ngành nghèo P (giấy, dệt); chỉ đo PO₄³⁻ hòa tan thay vì tổng P' },
    OG: { hi: 'xưởng cơ khí, gara, trạm xăng dầu, bếp ăn chưa có bể tách dầu mỡ', lo: '' },
    Color: { hi: 'nguồn dệt nhuộm, giấy, mực in, chế biến gỗ', lo: '' },
    Alk: { hi: 'nguồn kiềm (dệt nhuộm – NaOH, Na₂CO₃; chăn nuôi – NH₄HCO₃)', lo: 'nguồn nước cấp mềm, nước thải có axit; ghi nhầm đơn vị (mmol/L thay mg CaCO₃/L)' },
    Coli: { hi: 'nguồn phân, nước thải bệnh viện chưa khử trùng', lo: 'mẫu có clo dư, bảo quản sai/ quá thời gian; nhầm đơn vị MPN/100 mL' },
    pH: { hi: 'nguồn kiềm (xút, vôi, nhuộm)', lo: 'nguồn axit (xi mạ, tẩy rửa, lên men)' },
  };
  const CHECK = {
    COD: 'phiếu kết quả (SMEWW 5220), mẫu tổ hợp 24 h theo lưu lượng, thời điểm lấy mẫu; đối chiếu số liệu ĐTM/ quan trắc nhiều đợt',
    BOD: 'tỷ lệ pha loãng, cấy vi sinh, khử clo dư mẫu khi đo BOD₅ (SMEWW 5210B); so với COD cùng mẫu',
    TSS: 'vị trí lấy mẫu (trước/ sau song chắn, bể tự hoại), phương pháp lọc (SMEWW 2540D)',
    TN: 'TN = TKN + NO₃-N + NO₂-N, tính theo N',
    TKN: 'TKN (Kjeldahl) và NH₄-N đo cùng mẫu, tính theo N',
    NH4: 'đơn vị NH₄⁺ hay NH₄⁺-N (× 0,78 để đổi NH₄⁺ → NH₄-N)',
    TP: 'đơn vị P hay PO₄³⁻ (× 0,326 để đổi PO₄³⁻ → P); tổng P sau vô cơ hóa hay PO₄³⁻ hòa tan',
    OG: 'dầu mỡ khoáng hay tổng dầu mỡ động thực vật (QCVN 40 chỉ quy định dầu mỡ khoáng)',
    Color: 'phương pháp đo màu (Pt-Co, TCVN 6185) và độ pha loãng',
    Alk: 'đơn vị mg CaCO₃/L (1 mmol/L = 50 mg CaCO₃/L; 1 mg HCO₃⁻ = 0,82 mg CaCO₃)',
    Coli: 'đơn vị MPN/100 mL, thời gian bảo quản mẫu ≤ 24 h, clo dư trong mẫu',
    pH: 'đo pH tại hiện trường, dao động theo ca sản xuất',
  };

  /* ---------- TCVN 7957:2008 Bảng 2 – hệ số không điều hòa chung (q_tb, L/s) ---------- */
  const KTAB = [[5, 2.5, 0.38], [10, 2.1, 0.45], [20, 1.9, 0.5], [50, 1.7, 0.55], [100, 1.6, 0.59], [300, 1.55, 0.62], [500, 1.5, 0.66], [1000, 1.47, 0.69], [5000, 1.44, 0.71]];
  function kTCVN(Q) {
    const q = Q / 86.4;
    if (q <= KTAB[0][0]) return { q, kmax: KTAB[0][1], kmin: KTAB[0][2] };
    for (let i = 1; i < KTAB.length; i++) if (q <= KTAB[i][0]) {
      const [a, b] = [KTAB[i - 1], KTAB[i]], t = (q - a[0]) / (b[0] - a[0]);
      return { q, kmax: a[1] + t * (b[1] - a[1]), kmin: a[2] + t * (b[2] - a[2]) };
    }
    return { q, kmax: 1.44, kmin: 0.71 };
  }

  const NAMES = { COD: 'COD', BOD: 'BOD₅', TSS: 'TSS', TN: 'Tổng nitơ', TKN: 'TKN', NH4: 'NH₄-N', TP: 'Tổng P', OG: 'Dầu mỡ khoáng', Color: 'Độ màu', Alk: 'Độ kiềm', Coli: 'Coliform', pH: 'pH' };
  const UNITS = { Color: 'Pt/Co', Alk: 'mg CaCO₃/L', Coli: 'MPN/100mL', pH: '-' };
  const REQ = ['COD', 'BOD', 'TSS', 'TN', 'TKN', 'NH4', 'TP'];

  /* mức phù hợp (0 – 100 %) của bộ số liệu với một loại nước thải */
  function score(q, T) {
    let s = 0, w = 0, c = 0;
    const one = (v, [lo, hi], wt) => {
      if (!(v > 0)) return;
      let d = 0;
      if (lo > 0 && v < lo) d = Math.log(lo / v); else if (v > hi) d = Math.log(v / Math.max(hi, 1e-9));
      s += wt * Math.max(0, 1 - d / Math.log(4)); w += wt;
      c += wt * Math.abs(Math.log(v / Math.sqrt(Math.max(lo, hi / 20) * hi)));
    };
    for (const k of ['COD', 'BOD', 'TSS', 'TN', 'NH4', 'TP', 'Color', 'Alk']) if (T.r[k]) one(+q[k], T.r[k], k === 'COD' || k === 'BOD' ? 1.5 : 1);
    if (q.COD > 0 && q.BOD > 0) one(q.BOD / q.COD, T.rt.BOD_COD, 2);
    if (q.TKN > 0 && q.NH4 > 0) one(q.NH4 / q.TKN, T.rt.NH4_TKN, 1);
    return w ? { s: 100 * s / w, c: c / w } : { s: 0, c: 99 };
  }

  /* trạng thái theo biên: bad = [lo, hi] lỗi logic, warn = [lo, hi] bất thường (null = không xét) */
  function status(v, bad, warn) {
    const out = (b) => b && ((b[0] !== null && b[0] !== undefined && v < b[0]) || (b[1] !== null && b[1] !== undefined && v > b[1]));
    if (out(bad)) return 'bad';
    if (out(warn)) return 'warn';
    return 'ok';
  }
  /* biểu thức Excel dạng mẫu tương ứng status() */
  function condX(ref, b) {
    const p = [];
    if (b && b[0] !== null && b[0] !== undefined) p.push(`${ref}<${b[0]}`);
    if (b && b[1] !== null && b[1] !== undefined) p.push(`${ref}>${b[1]}`);
    return p.length ? `OR(${p.join(',')})` : 'FALSE';
  }
  function statusX(ref, bad, warn) {
    const cw = condX(ref, warn);
    const wx = cw === 'FALSE' ? '"HỢP LÝ"' : `IF(${cw},"BẤT THƯỜNG","HỢP LÝ")`;
    return bad ? `IF(${condX(ref, bad)},"LỖI LOGIC",${wx})` : wx;
  }
  const rng = b => !b ? '' : (b[0] !== null && b[0] !== undefined && b[1] !== null && b[1] !== undefined) ? `${fx(b[0])} – ${fx(b[1])}` : (b[0] !== null && b[0] !== undefined) ? `≥ ${fx(b[0])}` : `≤ ${fx(b[1])}`;
  const TXT = { ok: 'HỢP LÝ', warn: 'BẤT THƯỜNG', bad: 'LỖI LOGIC' };

  function check(S) {
    const I = S.input, q = I.q, p = S.p;
    const scores = Object.entries(TYPES).map(([k, T]) => { const r = score(q, T); return { k, name: T.short, score: r.s, c: r.c }; }).sort((a, b) => (b.score - a.score) || (a.c - b.c));
    const sel = I.wwType && TYPES[I.wwType] ? I.wwType : 'auto';
    const tk = sel === 'auto' ? scores[0].k : sel;
    const T = TYPES[tk];
    const tScore = scores.find(x => x.k === tk).score;
    const items = [];
    const add = it => { it.st = it.st || status(it.val, it.bad, it.warn); it.text = TXT[it.st]; it.range = [it.bad ? 'lỗi nếu ngoài ' + rng(it.bad) : '', it.warn ? 'thường ' + rng(it.warn) : ''].filter(Boolean).join('; '); items.push(it); return it; };
    const dirOf = (v, b) => b && b[0] !== null && b[0] !== undefined && v < b[0] ? 'lo' : 'hi';

    /* 1. Số liệu thiếu */
    const miss = REQ.filter(k => !(+q[k] > 0));
    miss.forEach(k => add({ grp: 'data', id: 'miss_' + k, name: `${NAMES[k]} phải có giá trị > 0`, val: +q[k] || 0, st: 'bad', why: 'thiếu số liệu – các bước tính cân bằng, sinh học sẽ sai', check: 'bổ sung kết quả phân tích ' + NAMES[k] }));
    const has = k => +q[k] > 0;

    /* 2. Quan hệ logic & tỷ lệ đặc trưng */
    if (has('BOD') && has('COD')) {
      const v = q.BOD / q.COD, bad = [null, 1], warn = T.rt.BOD_COD;
      const it = add({ grp: 'logic', id: 'lg_BC', sym: 'BOD/COD', name: 'Tỷ lệ BOD₅/COD', unit: '-', val: v, bad, warn, x: '[bal.BOD1]/[bal.COD1]', src: 'M&E mục 3-7, 8-2' });
      if (it.st === 'bad') { it.why = 'BOD₅ không thể lớn hơn COD (COD oxy hóa gần như toàn bộ chất hữu cơ, BOD₅ chỉ là phần phân hủy sinh học trong 5 ngày)'; it.check = 'hai chỉ tiêu có đo cùng một mẫu, có nhầm cột/ nhầm đơn vị; ' + CHECK.BOD; }
      else if (it.st === 'warn' && dirOf(v, warn) === 'lo') { it.why = `tỷ lệ thấp hơn thường gặp của ${T.short} (${rng(warn)}): chất hữu cơ khó phân hủy (thuốc nhuộm, dung môi, chất hoạt động bề mặt) hoặc chất ức chế làm BOD₅ đo thấp`; it.check = 'thử độc tính/ BOD dài ngày, nguồn thải công nghiệp đặc thù; nếu đúng → cân nhắc tiền xử lý hóa lý/ oxy hóa nâng cao, hiệu suất COD sinh học sẽ thấp'; }
      else if (it.st === 'warn') { it.why = `tỷ lệ cao hơn thường gặp của ${T.short} (${rng(warn)}): COD có thể đo thấp (mẫu không đồng nhất, để lắng trước khi đo) hoặc BOD₅ đo cao`; it.check = CHECK.COD + '; ' + CHECK.BOD; }
    }
    if (has('NH4') && has('TKN')) {
      const v = q.NH4 / q.TKN, bad = [null, 1.02], warn = T.rt.NH4_TKN;
      const it = add({ grp: 'logic', id: 'lg_NK', sym: 'NH₄/TKN', name: 'Tỷ lệ NH₄-N/TKN', unit: '-', val: v, bad, warn, x: '[bal.NH41]/[bal.TKN1]', src: 'M&E Bảng 3-18' });
      if (it.st === 'bad') { it.why = 'TKN = N hữu cơ + NH₄-N nên NH₄-N không thể lớn hơn TKN'; it.check = CHECK.NH4 + '; ' + CHECK.TKN; }
      else if (it.st === 'warn' && dirOf(v, warn) === 'lo') { it.why = `N chủ yếu ở dạng hữu cơ (protein – thủy sản, thực phẩm, lò mổ) hoặc NH₄-N đo thấp; thường ${rng(warn)} với ${T.short}`; it.check = CHECK.NH4 + '; ' + CHECK.TKN; }
      else if (it.st === 'warn') { it.why = `gần như toàn bộ N ở dạng NH₄ – nước thải đã phân hủy lâu (bể tự hoại, biogas, nước rỉ rác); thường ${rng(warn)} với ${T.short}`; it.check = CHECK.TKN; }
    }
    if (has('TKN') && has('TN')) {
      const v = q.TKN / q.TN, bad = [null, 1.02], warn = [0.8, null];
      const it = add({ grp: 'logic', id: 'lg_KT', sym: 'TKN/TN', name: 'Tỷ lệ TKN/TN', unit: '-', val: v, bad, warn, x: '[bal.TKN1]/[bal.TN1]', src: 'TN = TKN + NO₃-N + NO₂-N' });
      if (it.st === 'bad') { it.why = 'TKN là một phần của TN nên không thể lớn hơn TN'; it.check = CHECK.TN; }
      else if (it.st === 'warn') { it.why = `NO₃ + NO₂ chiếm ${fx((1 - v) * 100, 0)} % TN – bất thường với nước thải thô (môi trường yếm khí trong cống khử gần hết NO₃): có thể do nguồn công nghiệp chứa nitrat, nước ngầm nhiễm nitrat, hoặc TKN đo thiếu`; it.check = 'đo riêng NO₃-N, NO₂-N; ' + CHECK.TN; }
    }
    if (has('TSS') && has('COD')) {
      const v = q.TSS / q.COD, warn = T.rt.TSS_COD;
      const it = add({ grp: 'logic', id: 'lg_SC', sym: 'TSS/COD', name: 'Tỷ lệ TSS/COD', unit: '-', val: v, warn, x: '[bal.TSS1]/[bal.COD1]', src: 'M&E Bảng 3-18' });
      if (it.st === 'warn' && dirOf(v, warn) === 'hi') { it.why = 'TSS lớn so với COD → nhiều cặn vô cơ (cát, đất): cần lắng cát tốt, tỷ lệ VSS/TSS thực tế thấp hơn giả định'; it.check = CHECK.TSS + '; phân tích VSS'; }
      else if (it.st === 'warn') { it.why = 'chất ô nhiễm chủ yếu ở dạng hòa tan (đồ uống, dệt nhuộm) – TSS thấp so với COD'; it.check = CHECK.TSS; }
      const v2 = 1.42 * p.vss_tss * q.TSS / q.COD;
      const it2 = add({ grp: 'logic', id: 'lg_VC', sym: '1,42·VSS/COD', name: 'COD quy đổi từ VSS so với COD tổng', unit: '-', val: v2, bad: [null, 1.1], warn: [null, 0.8], x: '1.42*[rVSS]*[bal.TSS1]/[bal.COD1]', src: '1,42 g COD/g VSS (M&E Ch.7)' });
      if (it2.st !== 'ok') { it2.why = it2.st === 'bad' ? 'COD của riêng phần hữu cơ dạng hạt (1,42 × VSS) lớn hơn COD tổng – vô lý' : 'phần hữu cơ dạng hạt chiếm gần hết COD – ít COD hòa tan, bất thường'; it2.check = `tỷ lệ VSS/TSS ở tab 4 (đang ${fx(p.vss_tss)}), số liệu TSS và COD`; }
    }
    if (has('TKN') && has('BOD')) {
      const v = q.TKN / q.BOD;
      const it = add({ grp: 'logic', id: 'lg_NB', sym: 'TKN/BOD', name: 'Dinh dưỡng N (BOD:N = 100:5)', unit: '-', val: v, warn: [0.05, null], x: '[bal.TKN1]/[bal.BOD1]', src: 'BOD:N:P ≈ 100:5:1 (M&E Ch.7)' });
      if (it.st === 'warn') { it.why = 'thiếu N cho sinh trưởng vi sinh (bùn khó lắng, hiệu suất thấp) – thường gặp ở giấy, đồ uống, thực phẩm'; it.check = 'số liệu TKN; nếu đúng → bổ sung urê/ amoni (phần mềm chưa tự tính liều)'; }
    }
    if (has('TP') && has('BOD')) {
      const v = q.TP / q.BOD;
      const it = add({ grp: 'logic', id: 'lg_PB', sym: 'TP/BOD', name: 'Dinh dưỡng P (BOD:P = 100:1)', unit: '-', val: v, warn: [0.01, null], x: '[bal.TP1]/[bal.BOD1]', src: 'BOD:N:P ≈ 100:5:1' });
      if (it.st === 'warn') { it.why = 'thiếu P cho vi sinh – thường gặp ở giấy, dệt nhuộm'; it.check = CHECK.TP + '; nếu đúng → bổ sung H₃PO₄/ DAP'; }
    }
    if (has('TP') && has('COD')) {
      const v = q.TP / q.COD;
      const it = add({ grp: 'logic', id: 'lg_PC', sym: 'TP/COD', name: 'Tỷ lệ TP/COD', unit: '-', val: v, bad: [null, 0.3], warn: [null, T.rt.TP_COD], x: '[bal.TP1]/[bal.COD1]', src: '' });
      if (it.st !== 'ok') { it.why = `TP cao bất thường so với chất hữu cơ (thường ≤ ${fx(T.rt.TP_COD)} với ${T.short}) – hay gặp khi ghi PO₄³⁻ thay cho P`; it.check = CHECK.TP; }
    }
    if (has('TKN') && has('BOD') && +q.Alk > 0) {
      const need = 7.14 * Math.max(0, q.TKN - 0.05 * q.BOD) + 70, v = q.Alk / need;
      const it = add({ grp: 'logic', id: 'lg_AK', sym: 'Alk/Alk_yc', name: 'Kiềm so với nhu cầu nitrat hóa (không khử nitrat)', unit: '-', val: v, warn: [1, null], x: '[bal.Alk1]/(7.14*MAX(0,[bal.TKN1]-0.05*[bal.BOD1])+70)', src: 'M&E mục 8-5: 7,14 g CaCO₃/g N; dư ≥ 70 mg/L' });
      it.f = 'Alk_yc = 7,14·(TKN − 0,05·BOD) + 70 = ' + fx(need) + ' mg/L';
      if (it.st === 'warn') { it.why = 'kiềm không đủ cho nitrat hóa hoàn toàn nếu không khử nitrat → phải khử nitrat (hoàn trả 3,57 g/g N) hoặc châm NaOH (phần mềm đã tự tính liều)'; it.check = CHECK.Alk; }
    }
    /* pH, nhiệt độ, hệ số không điều hòa */
    {
      const v = +q.pH;
      const it = add({ grp: 'logic', id: 'lg_pH', sym: 'pH', name: 'pH nước thải', unit: '-', val: v, bad: [2, 12.5], warn: [6, 9], x: '[pH]', src: 'M&E Ch.8: vi sinh hoạt động tốt ở pH 6 – 9' });
      if (it.st !== 'ok') { it.why = it.st === 'bad' ? 'pH cực đoan – nguồn axit/ kiềm đặc hoặc lỗi đo' : `pH ngoài 6 – 9: ${v < 6 ? CAUSE.pH.lo : CAUSE.pH.hi} → cần bể trung hòa trước sinh học`; it.check = CHECK.pH; }
    }
    {
      const it = add({ grp: 'logic', id: 'lg_dT', sym: 'T_max − T_min', name: 'Nhiệt độ cao nhất ≥ thấp nhất', unit: '°C', val: I.Tmax - I.Tmin, bad: [0, null], x: '[Tmax]-[T]', src: '' });
      if (it.st !== 'ok') { it.why = 'nhiệt độ thấp nhất lớn hơn cao nhất'; it.check = 'hai ô nhiệt độ ở mục Lưu lượng & điều kiện thiết kế'; }
      const it2 = add({ grp: 'logic', id: 'lg_T', sym: 'T_min', name: 'Nhiệt độ thấp nhất (thiết kế sinh học)', unit: '°C', val: +I.Tmin, bad: [4, 45], warn: [12, 32], x: '[T]', src: 'M&E Bảng 8-14' });
      if (it2.st !== 'ok') { it2.why = I.Tmin < 12 ? 'nhiệt độ thấp – nitrat hóa rất chậm, bể sẽ rất lớn; nước thải ở Việt Nam hiếm khi < 15 °C' : 'nhiệt độ thấp nhất cao bất thường'; it2.check = 'số liệu nhiệt độ nước thải mùa đông (không phải nhiệt độ không khí)'; }
      const it3 = add({ grp: 'logic', id: 'lg_Tx', sym: 'T_max', name: 'Nhiệt độ cao nhất (cấp khí)', unit: '°C', val: +I.Tmax, bad: [null, 50], warn: [null, 38], x: '[Tmax]', src: '' });
      if (it3.st !== 'ok') { it3.why = 'nhiệt độ cao làm giảm oxy hòa tan, ức chế vi sinh – nguồn nước làm mát, nhuộm nóng'; it3.check = 'số liệu nhiệt độ; cân nhắc tháp giải nhiệt'; }
    }
    {
      const kt = kTCVN(+I.Q);
      const warn = T.kTCVN ? [Math.round(kt.kmax * 0.85 * 100) / 100, 3.5] : [1.1, 3.5];
      const it = add({ grp: 'logic', id: 'lg_km', sym: 'k_max', name: 'Hệ số không điều hòa lớn nhất', unit: '-', val: +I.kmax, bad: [1, null], warn, x: '[kmax]', src: T.kTCVN ? `TCVN 7957:2008 Bảng 2 (q = ${fx(kt.q)} L/s → k_max ≈ ${fx(kt.kmax)})` : 'M&E mục 3-4' });
      if (it.st === 'bad') { it.why = 'k_max < 1 vô lý (lưu lượng giờ lớn nhất nhỏ hơn trung bình)'; it.check = 'ô k_max'; }
      else if (it.st === 'warn' && I.kmax < warn[0]) { it.why = T.kTCVN ? `thấp hơn TCVN 7957 (≈ ${fx(kt.kmax)}) – công trình theo lưu lượng giờ (song chắn, lắng, ống) có thể bị thiết kế thiếu` : 'lưu lượng coi như không dao động – chỉ hợp lý khi có bể điều hòa trước trạm hoặc số liệu đo lưu lượng liên tục xác nhận'; it.check = 'số liệu đo lưu lượng theo giờ, hồ sơ quy hoạch thoát nước'; }
      else if (it.st === 'warn') { it.why = 'k_max rất lớn – kiểm tra lại nguồn số liệu (có thể là lưu lượng mưa)'; it.check = 'số liệu đo lưu lượng theo giờ'; }
      const it2 = add({ grp: 'logic', id: 'lg_kn', sym: 'k_min', name: 'Hệ số không điều hòa nhỏ nhất', unit: '-', val: +I.kmin, bad: [0, 1], warn: [0.2, null], x: '[kmin]', src: T.kTCVN ? `TCVN 7957:2008 (k_min ≈ ${fx(kt.kmin)})` : '' });
      if (it2.st !== 'ok') { it2.why = it2.st === 'bad' ? 'k_min phải nằm trong 0 – 1' : 'k_min rất nhỏ – bơm/ công trình phải vận hành được ở lưu lượng rất thấp'; it2.check = 'ô k_min'; }
    }
    if (+q.OG > 0) {
      const it = add({ grp: 'logic', id: 'lg_OG', sym: 'Dầu mỡ', name: 'Dầu mỡ khoáng vào sinh học', unit: 'mg/L', val: +q.OG, warn: [null, 20], x: '[bal.OG1]', src: 'bùn hoạt tính chịu ≤ 20 – 50 mg/L' });
      if (it.st === 'warn') { it.why = 'dầu mỡ bao bọc bông bùn, gây nổi bọt, giảm truyền oxy → cần bể tách dầu/ tuyển nổi DAF trước sinh học'; it.check = CHECK.OG; }
    }

    /* 3. Đối chiếu khoảng thường gặp theo loại nước thải */
    for (const k of ['COD', 'BOD', 'TSS', 'TN', 'TKN', 'NH4', 'TP', 'OG', 'Color', 'Alk', 'Coli', 'pH']) {
      const b = T.r[k]; if (!b) continue;
      const v = +q[k]; if (!(v >= 0) || (REQ.includes(k) && !(v > 0))) continue;
      const warn = [b[0] > 0 ? b[0] : null, b[1]];
      const it = add({ grp: 'range', id: 'rg_' + k, key: k, sym: NAMES[k], name: `${NAMES[k]} so với khoảng thường gặp (${T.short})`, unit: UNITS[k] || 'mg/L', val: v, warn, x: k === 'pH' ? '[pH]' : `[bal.${k}1]`, typ: rng(b) });
      if (it.st !== 'ok') { const d = dirOf(v, warn); it.dir = d; it.why = `${d === 'hi' ? 'cao' : 'thấp'} hơn khoảng thường gặp ${rng(b)}${CAUSE[k] && CAUSE[k][d] ? ': ' + CAUSE[k][d] : ''}`; it.check = CHECK[k] || ''; }
    }
    const best = scores[0];
    const notes = [];
    if (sel !== 'auto' && best.k !== tk && best.score - tScore >= 15) notes.push(`Bộ số liệu giống "${TYPES[best.k].short}" (${fx(best.score, 0)} %) hơn loại đã chọn "${T.short}" (${fx(tScore, 0)} %) – kiểm tra lại loại hình nước thải/ nguồn số liệu.`);
    const near = scores.filter(x => x.score >= best.score - 5);
    if (sel === 'auto' && near.length > 1) notes.push(`Số liệu phù hợp tương đương với: ${near.map(x => x.name).join(', ')} (các loại này có khoảng nồng độ chồng lấn) – nên chọn loại hình theo nguồn thải thực tế ở ô "Loại nước thải đối chiếu".`);
    if (tScore < 50) notes.push(`Mức phù hợp với "${T.short}" chỉ ${fx(tScore, 0)} % – nhiều chỉ tiêu nằm ngoài khoảng thường gặp; nên có số liệu quan trắc thực tế nhiều đợt trước khi chốt số liệu thiết kế.`);
    const nBad = items.filter(i => i.st === 'bad').length, nWarn = items.filter(i => i.st === 'warn').length;
    return { sel, tk, T, tScore, scores, items, notes, nBad, nWarn };
  }

  return { TYPES, check, status, statusX, rng, kTCVN };
})();
