'use strict';
/* ==========================================================================
   KhíSạch – Thuyết minh tính toán: Excel công thức sống · Word (.docx) · PDF (in)
   Mỗi module có "phiếu tính": số liệu đầu vào, thông số tra bảng theo lựa chọn, trình tự tính (ký hiệu, tên, biểu thức,
   đơn vị, diễn giải, nguồn MC5). Biểu thức viết một lần theo cú pháp chung:
     – đánh giá trong JS (giá trị trình bày, đối chiếu với kết quả module),
     – đổi sang công thức Excel tham chiếu tên vùng <module>_<ký hiệu> (ô nhập đổi → Excel tính lại),
     – hiển thị công thức dạng toán trong Word/PDF.
   Hàm dùng được: max, min, exp, ln, sqrt, pow, abs, iff(điều kiện, a, b), PI. Module có bảng nhiều dòng (gen, vent) dựng riêng.
   ========================================================================== */
const CD = (() => {
  const FN = { max: Math.max, min: Math.min, exp: Math.exp, ln: Math.log, sqrt: Math.sqrt, pow: Math.pow, abs: Math.abs, iff: (c, a, b) => (c ? a : b), PI: Math.PI };
  const XLF = { max: 'MAX', min: 'MIN', exp: 'EXP', ln: 'LN', sqrt: 'SQRT', pow: 'POWER', abs: 'ABS', iff: 'IF' };
  const strip = s => String(s == null ? '' : s).replace(/<sub>(.*?)<\/sub>/g, '$1').replace(/<sup>(.*?)<\/sup>/g, '$1').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const fm = v => (typeof v === 'number' ? (isFinite(v) ? (Number.isInteger(v) && Math.abs(v) < 1e6 ? f(v, 0) : f(v)) : '–') : String(v));
  const sy = s => OOXML.symRuns(s);
  const RT = 'R = 0,082057 L·atm/(mol·K)';
  // bước: [khóa, tên đại lượng, ký hiệu, đơn vị, biểu thức, công thức hiển thị, diễn giải/nguồn, kết quả chính?]
  const VM = (T, note) => ['Vm', 'Thể tích mol khí ở 1 atm', 'Vₘ', 'L/mol', `0.082057*(${T}+273.15)`, 'Vₘ = R·(T + 273,15)', note || 'MC5 PT 2-44; ' + RT];
  const RHO = (T, k) => [k || 'rho', 'Khối lượng riêng không khí', 'ρ', 'kg/m³', `101.325*28.97/(8.314*(${T}+273.15))`, 'ρ = P·M_kk / (R·T) = 101,325·28,97 / (8,314·(T + 273,15))', 'khí lý tưởng, 1 atm'];
  const FAN = (Q, dP, eta, hr) => [['kW', 'Công suất quạt', 'P_q', 'kW', `(${Q}/3600)*${dP}/(${eta}*1000)`, 'P_q = (Q/3600)·ΔP / (η·1000)', 'công suất trên trục; chưa gồm hiệu suất động cơ'],
    ['MWh', 'Điện năng tiêu thụ', 'E', 'MWh/năm', `kW*${hr}/1000`, 'E = P_q·t_vh / 1000', '', 1]];

  const SPEC = {
    sel: v => ({
      consts: [['Tg', 'Nhiệt độ quy đổi', 'T', 25, '°C', 'điều kiện tham chiếu'], ['MW', 'Khối lượng phân tử H₂S', 'M', 34.08, 'g/mol', '']],
      steps: [VM('Tg'), ['cH', 'Nồng độ khối lượng H₂S trung bình', 'C', 'mg/m³', 'H2S*MW/Vm', 'C = ppmv·M / Vₘ', 'MC5 PT 2-45'],
        ['cPk', 'Nồng độ H₂S đỉnh', 'C_đỉnh', 'g/m³', 'H2Smax*MW/Vm/1000', 'C_đỉnh = ppmv_đỉnh·M / (1000·Vₘ)', 'so với dải 0,01–0,5 g/m³ của lọc sinh học (MC5 Bảng 16-11)'],
        ['LH', 'Tải lượng H₂S', 'L', 'kg/ngày', 'Q*cH*24/1e6', 'L = Q·C·24 / 10⁶', '', 1],
        ['kp', 'Hệ số đỉnh / trung bình', 'k', '×', 'H2Smax/max(H2S,0.01)', 'k = H₂S_đỉnh / H₂S_TB', 'k > 3: tải dao động mạnh, ưu tiên tháp hấp thụ hóa chất'],
        ['fr', 'Tỉ lệ khí mùi / khí cấp bể sục khí', 'f', '%', 'iff(Qproc>0,Q/Qproc*100,0)', 'f = Q / Q_{khí cấp} · 100', 'khuếch tán vào bể bùn hoạt tính khả thi khi f ≤ 100 % (MC5 Bảng 16-6)']],
      post: () => {
        const d = new DOMParser().parseFromString(MOD.sel.calc(v).html, 'text/html');
        return { title: 'Xếp hạng công nghệ (định tính theo MC5 Bảng 16-6, 16-8, 16-11)', head: ['Hạng', 'Công nghệ', 'Điểm (0–100)'],
          rows: [...d.querySelectorAll('.rk')].map((x, i) => [i + 1, strip((x.querySelector('h3 .kbi>span') || x.querySelector('h3')).textContent), +x.querySelector('.sc').textContent.replace(',', '.')]) };
      }
    }),
    disp: v => {
      const o = ODOR[+v.cmp], s = SIG[v.stab];
      return {
        consts: [['MW', `Khối lượng phân tử ${o[0]} (${o[1]})`, 'M', o[2], 'g/mol', 'MC5 Bảng 16-3'], ['thr', 'Ngưỡng mùi của chất', 'C_ng', o[3], 'ppmv', 'MC5 Bảng 16-3'],
          ['ay', `Hệ số σy – cấp ổn định ${v.stab}`, 'a_y', s[0][0], '–', 'Briggs (1973), nông thôn'], ['by', 'Hệ số σy', 'b_y', s[0][1], '1/m', ''], ['cy', 'Số mũ σy', 'c_y', s[0][2], '–', ''],
          ['az', `Hệ số σz – cấp ổn định ${v.stab}`, 'a_z', s[1][0], '–', 'Briggs (1973), nông thôn'], ['bz', 'Hệ số σz', 'b_z', s[1][1], '1/m', ''], ['cz', 'Số mũ σz', 'c_z', s[1][2], '–', '']],
        steps: [VM('T'), ['mg', 'Nồng độ khối lượng chất mùi', 'C', 'mg/m³', 'ppm*MW/Vm', 'C = ppmv·M / Vₘ', 'MC5 PT 2-45'],
          ['mult', 'Số lần vượt ngưỡng mùi (đơn chất)', 'n', '×', 'ppm/thr', 'n = ppmv / C_ng', 'chỉ đúng cho một chất; hỗn hợp phải đo bằng hội đồng mùi (ASTM E679)'],
          ['OER', 'Tốc độ phát thải mùi', 'OER', 'OU/s', 'Q/3600*DT', 'OER = (Q/3600)·D/T', ''],
          ['sy', 'Hệ số phân tán ngang tại x', 'σy', 'm', 'ay*x*pow(1+by*x,cy)', 'σy = a_y·x·(1 + b_y·x)^c_y', 'Briggs (1973)'],
          ['sz', 'Hệ số phân tán đứng tại x', 'σz', 'm', 'az*x*pow(1+bz*x,cz)', 'σz = a_z·x·(1 + b_z·x)^c_z', 'Briggs (1973)'],
          ['ue', 'Tốc độ gió tính toán', 'u', 'm/s', 'max(u,0.5)', 'u = max(u_đo; 0,5)', 'giới hạn dưới tránh chia cho 0 khi lặng gió'],
          ['Cr', 'Nồng độ mùi mặt đất tại điểm nhạy cảm', 'D/T(x)', 'D/T', 'pm*OER/(PI*sy*sz*ue)*exp(-Hs*Hs/(2*sz*sz))', 'D/T = k_đỉnh·OER / (π·σy·σz·u) · exp(−H²/(2σz²))', 'mô hình Gauss nguồn điểm, trên trục gió, mặt đất (sàng lọc; hồ sơ chính thức dùng AERMOD – MC5)', 1]],
        post: () => {
          const C = x => { if (x <= 1) return 0; const sy = s[0][0] * x * Math.pow(1 + s[0][1] * x, s[0][2]), sz = s[1][0] * x * Math.pow(1 + s[1][1] * x, s[1][2]); return v.pm * (v.Q / 3600 * v.DT) / (Math.PI * sy * sz * Math.max(v.u, 0.5)) * Math.exp(-v.Hs * v.Hs / (2 * sz * sz)); };
          const xmax = Math.max(v.x * 3, 500); let best = [0, 0]; const xs = [];
          for (let i = 1; i <= 160; i++) { const x = xmax * i / 160, c = C(x); xs.push([x, c]); if (c > best[1]) best = [x, c]; }
          let xok = null; for (let i = xs.length - 1; i >= 0; i--) if (xs[i][1] > v.lim) { xok = i < xs.length - 1 ? xs[i + 1][0] : null; break; }
          if (best[1] <= v.lim) xok = 0;
          return { title: 'Kết quả quét theo khoảng cách (160 điểm, 0 – ' + f(xmax, 0) + ' m)', head: ['Đại lượng', 'Giá trị', 'Đơn vị'],
            rows: [['D/T lớn nhất trên mặt đất', best[1], 'D/T'], ['Vị trí D/T lớn nhất', best[0], 'm'], ['Khoảng cách từ đó D/T ≤ giới hạn', xok === null ? '> ' + f(xmax, 0) : xok === 0 ? 'mọi khoảng cách' : xok, 'm']] };
        }
      };
    },
    liq: v => {
      const x = LIQ[v.ch];
      return {
        consts: [['rT', `Tỉ lệ liều điển hình – ${x[0]}`, 'r₀', x[1], 'kg/kg H₂S', strip(x[3])], ['cT', 'Nồng độ thương phẩm mặc định', 'c₀', x[5], '%', ''], ['rhoT', 'Khối lượng riêng mặc định', 'ρ₀', x[6], 'kg/L', '']],
        steps: [['r_', 'Tỉ lệ liều áp dụng', 'r', 'kg/kg H₂S', 'iff(r>0,r,rT)', 'r = r_nhập nếu > 0, ngược lại r₀', `dải thực tế ${x[2]} mg/mg H₂S`],
          ['c_', 'Nồng độ dung dịch áp dụng', 'c', '%', 'iff(c>0,c,cT)', 'c = c_nhập nếu > 0, ngược lại c₀', ''], ['rho_', 'Khối lượng riêng áp dụng', 'ρ', 'kg/L', 'iff(rho>0,rho,rhoT)', 'ρ = ρ_nhập nếu > 0, ngược lại ρ₀', ''],
          ['Sk', 'Lượng sulfua cần xử lý', 'S_xl', 'kg/ngày', 'Q*S/1000*eff/100', 'S_xl = Q·S/1000·η/100', ''],
          ['kg', 'Lượng hóa chất (100 %)', 'G', 'kg/ngày', 'Sk*r_', 'G = S_xl·r', 'MC5 PT 16-1 → 16-7', 1],
          ['L', 'Lưu lượng dung dịch thương phẩm', 'V_dd', 'L/ngày', 'kg/(c_/100)/rho_', 'V_dd = G / (c/100) / ρ', '', 1],
          ['Vt', 'Dung tích bồn chứa', 'V_b', 'm³', 'L*days/1000', 'V_b = V_dd·t_dt / 1000', ''],
          ['dose', 'Liều tính theo nước thải', 'D', 'mg/L', 'kg/Q*1000', 'D = G·1000 / Q', '']]
      };
    },
    scr: v => ({
      consts: [['st', 'Số cấp tháp (theo cấu hình)', 'N_c', +v.cfg, 'cấp', 'MC5 Hình 16-8'], ['kmk', `Nước bổ sung ở pH ${v.pH}`, 'k_nb', v.pH === '11' ? 0.075 : 0.004, 'L/s per kg/h sulfua', 'MC5 Bảng 16-9']],
      steps: [['Qs', 'Lưu lượng khí', 'Q_s', 'm³/s', 'Q/3600', 'Q_s = Q / 3600', ''],
        ['vel', 'Vận tốc khí qua tiết diện', 'v', 'm/s', 'Z/t', 'v = Z / t', 'MC5 Bảng 16-9: t = 1,3–2,0 s'],
        ['A', 'Tổng tiết diện tháp', 'A', 'm²', 'Qs/vel', 'A = Q_s / v', ''], ['Ai', 'Tiết diện mỗi tháp', 'Aᵢ', 'm²', 'A/n', 'Aᵢ = A / n', ''],
        ['D', 'Đường kính mỗi tháp', 'D', 'm', 'sqrt(4*Ai/PI)', 'D = √(4·Aᵢ / π)', '', 1],
        VM('T'), ['cH', 'Nồng độ H₂S', 'C_H₂S', 'g/m³', 'H2S*34.08/Vm/1000', 'C = ppmv·34,08 / (1000·Vₘ)', 'MC5 PT 2-45'],
        ['kgH', 'Tải lượng H₂S cần xử lý', 'L_H₂S', 'kg/ngày', 'Q*cH*24/1000', 'L = Q·C·24 / 1000', 'MC5 VD 16-1: 40,8 kg/ngày'],
        RHO('T'), ['Lkg', 'Lưu lượng lỏng tuần hoàn (khối lượng)', 'L_m', 'kg/h', 'Q*rho*LG', 'L_m = Q·ρ·(L/G)', 'MC5 Bảng 16-9: L/G = 1,5–2,5 kg/kg'],
        ['Lm3h', 'Lưu lượng dung dịch tuần hoàn', 'L_v', 'm³/h', 'Lkg/1000', 'L_v = L_m / 1000', 'MC5 VD 16-1: 2,1 m³/phút'],
        ['LperQ', 'Tỉ lệ lỏng/khí theo thể tích', 'L/G', 'L/s per m³/s', '(Lm3h/3.6)/Qs', 'L/G = (L_v/3,6) / Q_s', 'MC5 Bảng 16-9: 2–3'],
        ['kgOCl', 'NaOCl (100 %)', 'G_NaOCl', 'kg/ngày', 'kgH*rOCl', 'G_NaOCl = L_H₂S·r_NaOCl', 'MC5 PT 16-3: 8,74 kg/kg; VD 16-1: 356,6 kg/ngày', 1],
        ['kgOH', 'NaOH (100 %)', 'G_NaOH', 'kg/ngày', 'kgH*rOH', 'G_NaOH = L_H₂S·r_NaOH', 'MC5 PT 16-3: 2,35 kg/kg; VD 16-1: 95,9 kg/ngày', 1],
        ['LOCl', 'Dung dịch NaOCl thương phẩm', 'V_NaOCl', 'L/ngày', 'kgOCl/(cOCl/100)/dOCl', 'V = G / (c/100) / ρ', ''],
        ['LOH', 'Dung dịch NaOH thương phẩm', 'V_NaOH', 'L/ngày', 'kgOH/(cOH/100)/dOH', 'V = G / (c/100) / ρ', 'MC5 VD 16-1: 126,2 L/ngày'],
        ['cN', 'Nồng độ NH₃', 'C_NH₃', 'g/m³', 'NH3*17.03/Vm/1000', 'C = ppmv·17,03 / (1000·Vₘ)', ''],
        ['kgN', 'Tải lượng NH₃', 'L_NH₃', 'kg/ngày', 'Q*cN*24/1000', 'L = Q·C·24 / 1000', ''],
        ['kgSA', 'H₂SO₄ (100 %) cho tháp axit', 'G_H₂SO₄', 'kg/ngày', 'iff(abs(st-2)<0.5,kgN*98.08/(2*17.03),0)', 'G = L_NH₃·98,08/(2·17,03) khi có tháp axit', 'MC5 PT 16-9: 2NH₃ + H₂SO₄ → (NH₄)₂SO₄'],
        ['LSA', 'Dung dịch H₂SO₄ 98 %', 'V_H₂SO₄', 'L/ngày', 'kgSA/0.98/1.84', 'V = G / 0,98 / 1,84', ''],
        ['VOCl', 'Dung tích bồn NaOCl', 'V_b1', 'm³', 'LOCl*days/1000', 'V_b = V·t_dt / 1000', ''], ['VOH', 'Dung tích bồn NaOH', 'V_b2', 'm³', 'LOH*days/1000', 'V_b = V·t_dt / 1000', ''],
        ['mk', 'Nước bổ sung', 'Q_nb', 'm³/h', 'kmk*kgH/24*3.6', 'Q_nb = k_nb·(L_H₂S/24)·3,6', 'MC5 Bảng 16-9'],
        ['eHt', 'Hiệu suất khử H₂S tổng', 'η_H₂S', '–', 'iff(st>2.5,1-(1-eH/100)*(1-eH/100),eH/100)', 'η = 1 − (1 − η₁)² với 2 cấp oxy hóa nối tiếp; η = η₁ nếu 1 cấp', 'MC5 Bảng 16-8'],
        ['outH', 'H₂S sau xử lý', 'H₂S_ra', 'ppmv', 'H2S*(1-eHt)', 'H₂S_ra = H₂S·(1 − η)', '', 1],
        ['outN', 'NH₃ sau xử lý', 'NH₃_ra', 'ppmv', 'iff(abs(st-2)<0.5,NH3*(1-eN/100),NH3*(1-0.5*eN/100))', 'NH₃_ra = NH₃·(1 − η_N) (có tháp axit) ; NH₃·(1 − 0,5·η_N) (không)', ''],
        ['outR', 'Mercaptan sau xử lý', 'RSH_ra', 'ppmv', 'RSH*(1-iff(st>2.5,1-pow(1-eR/100,2),eR/100))', 'RSH_ra = RSH·(1 − η_R)', 'MC5 Bảng 16-8: 85–92 %/cấp'],
        ...FAN('Q', 'dP*st', 'eta', 'hr')]
    }),
    gac: v => ({
      consts: [['capT', `Dung lượng hấp phụ H₂S điển hình – ${GACT[v.typ][0]}`, 'q₀', GACT[v.typ][1], 'g/g', 'thông lệ ngành; nên lấy theo nhà cung cấp']],
      steps: [['cap_', 'Dung lượng hấp phụ H₂S áp dụng', 'q_H₂S', 'g/g', 'iff(cap>0,cap,capT)', 'q = q_nhập nếu > 0, ngược lại q₀', ''],
        ['Qs', 'Lưu lượng khí', 'Q_s', 'm³/s', 'Q/3600', 'Q_s = Q / 3600', ''], ['A', 'Tiết diện lớp than', 'A', 'm²', 'Qs/vel', 'A = Q_s / v', ''],
        ['D', 'Đường kính mỗi bình', 'D', 'm', 'sqrt(4*A/n/PI)', 'D = √(4·A / (n·π))', '', 1], ['V', 'Thể tích than', 'V', 'm³', 'A*Z', 'V = A·Z', ''],
        ['ebrt', 'Thời gian tiếp xúc tầng rỗng', 'EBRT', 's', 'Z/vel', 'EBRT = Z / v = V / Q_s', 'MC5 PT 16-13; thông lệ 2–6 s'],
        ['Mc', 'Khối lượng than', 'M', 'kg', 'V*rho', 'M = V·ρ_đ', '', 1], VM('T'),
        ['kgH', 'Tải H₂S', 'L_H₂S', 'kg/ngày', 'Q*(H2S*34.08/Vm)*24/1e6', 'L = Q·(ppmv·34,08/Vₘ)·24 / 10⁶', ''],
        ['kgO', 'Tải chất hữu cơ', 'L_hc', 'kg/ngày', 'Q*org*24/1e6', 'L = Q·C_hc·24 / 10⁶', 'than ưu tiên hấp phụ hydrocacbon'],
        ['useH', 'Than tiêu hao cho H₂S', 'm_H', 'kg/ngày', 'kgH/cap_', 'm = L_H₂S / q_H₂S', ''], ['useO', 'Than tiêu hao cho chất hữu cơ', 'm_O', 'kg/ngày', 'kgO/capO', 'm = L_hc / q_hc', ''],
        ['life', 'Tuổi thọ lớp than', 't_tt', 'tháng', 'Mc*ut/(useH+useO)/30.4', 't = M·φ / (m_H + m_O) / 30,4', 'φ – hệ số sử dụng (vùng chuyển khối)', 1],
        ['cons', 'Tiêu hao than năm', 'm_năm', 'tấn/năm', '(useH+useO)*365/1000', 'm_năm = (m_H + m_O)·365 / 1000', ''],
        ...FAN('Q', 'dP', 'eta', 'hr')]
    }),
    bio: v => ({
      consts: [['isBT', 'Biotrickling (1) / biofilter (0)', 'k_BT', v.typ === 'bt' ? 1 : 0, '–', '']],
      steps: [['A', 'Diện tích lọc', 'A', 'm²', 'Q/SLR', 'A = Q / SLR', 'MC5 VD 16-2: 13,3 m²', 1], ['V', 'Thể tích vật liệu', 'V', 'm³', 'A*Z', 'V = A·Z', ''],
        ['EBRT', 'Thời gian tiếp xúc tầng rỗng', 'EBRT', 's', 'V/Q*3600', 'EBRT = V / Q·3600', 'MC5 PT 16-13; Bảng 16-11: 30–60 s', 1],
        ['RT', 'Thời gian lưu thực', 'RT', 's', 'EBRT*por', 'RT = EBRT·α', 'MC5 PT 16-14'], ['VLR', 'Tải thể tích', 'VLR', 'm³/m³·h', 'Q/V', 'VLR = Q / V', 'MC5 PT 16-17'],
        VM('T'), ['c', 'Nồng độ H₂S vào', 'C₀', 'g/m³', 'H2S*34.08/Vm/1000', 'C₀ = ppmv·34,08 / (1000·Vₘ)', 'MC5 VD 16-2: 0,057 g/m³'],
        ['Ms', 'Tải lưu huỳnh', 'M_S', 'g S/h', 'Q*c*32/34.08', 'M_S = Q·C₀·32/34,08', 'MC5 VD 16-2: 64,2 g S/h'],
        ['Ld', 'Tải thể tích lưu huỳnh', 'L_S', 'g S/m³·h', 'Ms/V', 'L_S = M_S / V', '', 1], ['Vreq', 'Thể tích cần theo EC thiết kế', 'V_yc', 'm³', 'Ms/EC', 'V_yc = M_S / EC_tk', 'MC5 VD 16-2: 0,99 m³'],
        ['Ce', 'Nồng độ H₂S ra', 'Cₑ', 'g/m³', 'c*(1-RE/100)', 'Cₑ = C₀·(1 − RE)', ''], ['ECa', 'Năng lực khử', 'EC', 'g S/m³·h', 'Q*(c-Ce)*32/34.08/V', 'EC = Q·(C₀ − Cₑ)·(32/34,08) / V', 'MC5 PT 16-20'],
        ['SLRm', 'Tải khối lượng bề mặt', 'SLR_m', 'g/m²·h', 'Q*c/A', 'SLR_m = Q·C₀ / A', 'MC5 PT 16-16'],
        ['Ai', 'Diện tích mỗi ngăn', 'Aᵢ', 'm²', 'A/cells', 'Aᵢ = A / n', ''], ['W', 'Chiều rộng ngăn', 'W', 'm', 'sqrt(Ai/LW)', 'W = √(Aᵢ / (L/W))', ''], ['Lc', 'Chiều dài ngăn', 'L', 'm', 'W*LW', 'L = W·(L/W)', ''],
        ['kgY', 'H₂S xử lý mỗi năm', 'M_năm', 'kg/năm', 'Q*c*24*365/1000', 'M = Q·C₀·24·365 / 1000', 'MC5 VD 16-2: 599,2 kg/năm'],
        ['lime', 'Ca(OH)₂ cho tuổi thọ vật liệu', 'G_vôi', 'kg', 'kgY*74.09/34.08*life*bf', 'G = M_năm·(74,09/34,08)·t·k_dư', 'MC5: k_dư = 1,25–1,5', 1],
        RHO('T'), ['p1', 'Áp suất hơi bão hòa', 'p_s', 'kPa', '0.61094*exp(17.625*T/(T+243.04))', 'p_s = 0,61094·exp(17,625·T / (T + 243,04))', 'công thức Magnus'],
        ['w100', 'Độ chứa ẩm bão hòa', 'x_s', 'kg/kg', '0.622*p1/(101.325-p1)', 'x_s = 0,622·p_s / (101,325 − p_s)', ''],
        ['wRH', 'Độ chứa ẩm khí vào', 'x', 'kg/kg', '0.622*(p1*RH/100)/(101.325-p1*RH/100)', 'x = 0,622·φ·p_s / (101,325 − φ·p_s)', ''],
        ['water', 'Nước làm ẩm tới RH 100 %', 'Q_n', 'm³/ngày', 'Q*rho*max(0,w100-wRH)*24/1000', 'Q_n = Q·ρ·(x_s − x)·24 / 1000', 'cân bằng ẩm'],
        ['irr', 'Lưu lượng tưới tuần hoàn (biotrickling)', 'Q_t', 'm³/ngày', 'isBT*A*liq', 'Q_t = A·q_t', 'MC5: 0,75–1,25 m³/m²·d'],
        ...FAN('Q', 'dP', 'eta', 'hr')]
    }),
    asd: v => ({
      consts: [],
      steps: [['fr', 'Tỉ lệ khí mùi / khí cấp nhỏ nhất', 'f', '–', 'Q/Qp', 'f = Q / Q_{khí cấp,min}', 'khả thi khi f ≤ 1'], ['frp', 'Tỉ lệ phần trăm', 'f', '%', 'fr*100', 'f% = 100·f', '', 1],
        ['mix', 'H₂S sau hòa trộn vào đường hút máy thổi', 'C_hh', 'ppmv', 'H2S*min(1,fr)', 'C_hh = H₂S·min(1; f)', '', 1], VM('25'),
        ['kg', 'Tải H₂S đưa vào bể', 'L', 'kg/ngày', 'Q*(H2S*34.08/Vm)*24/1e6', 'L = Q·(ppmv·34,08/Vₘ)·24 / 10⁶', '']]
    }),
    thr: v => {
      const t = THR[v.typ];
      return {
        consts: [['TcT', `Nhiệt độ buồng đốt điển hình – ${t[0]}`, 'T_c0', t[1], '°C', 'MC5 §16-3, 16-4'], ['epsT', 'Hiệu suất thu hồi nhiệt điển hình', 'ε₀', t[2], '–', ''],
          ['cp', 'Nhiệt dung riêng khí', 'c_p', 1.08, 'kJ/kg·K', ''], ['HV', 'Nhiệt trị nhiên liệu bổ sung', 'H_nl', v.fuel === 'ng' ? 38300 : 22400, 'kJ/m³', v.fuel === 'ng' ? 'khí tự nhiên' : 'biogas'],
          ['isCO', 'Oxy hóa xúc tác (1/0)', 'k_xt', v.typ === 'co' ? 1 : 0, '–', ''], ['isNG', 'Nhiên liệu khí tự nhiên (1/0)', 'k_ng', v.fuel === 'ng' ? 1 : 0, '–', '']],
        steps: [['Tc_', 'Nhiệt độ buồng đốt', 'T_c', '°C', 'iff(Tc>0,Tc,TcT)', 'T_c = T_nhập nếu > 0, ngược lại T_c0', ''], ['eps_', 'Hiệu suất thu hồi nhiệt', 'ε', '–', 'iff(eps>=0,eps,epsT)', 'ε = ε_nhập nếu ≥ 0, ngược lại ε₀', ''],
          RHO('20', 'rho20'), ['m', 'Lưu lượng khối lượng khí', 'ṁ', 'kg/s', 'Q*rho20/3600', 'ṁ = Q·ρ₂₀ / 3600', ''],
          ['Tpre', 'Nhiệt độ khí sau gia nhiệt sơ bộ', 'T_p', '°C', 'Tin+eps_*(Tc_-Tin)', 'T_p = T_vào + ε·(T_c − T_vào)', 'MC5 PT 16-10'],
          ['need', 'Nhiệt cần bổ sung', 'Φ', 'kW', 'max(0,m*cp*(Tc_-Tpre)/(1-loss/100)-Q/3600*Hg)', 'Φ = ṁ·c_p·(T_c − T_p)/(1 − tổn thất) − (Q/3600)·H_k', 'cân bằng nhiệt (MC5 PT 16-11)', 1],
          ['fuel', 'Nhiên liệu bổ sung', 'Q_nl', 'm³/h', 'need*3600/HV', 'Q_nl = Φ·3600 / H_nl', '', 1], ['fuelY', 'Nhiên liệu năm', 'V_nl', 'm³/năm', 'fuel*hr', 'V_nl = Q_nl·t_vh', ''],
          ['Qhot', 'Lưu lượng khí ở nhiệt độ buồng đốt', 'Q_c', 'm³/h', 'Q*(Tc_+273.15)/(Tin+273.15)', 'Q_c = Q·(T_c + 273,15)/(T_vào + 273,15)', ''],
          ['Vch', 'Thể tích buồng đốt', 'V_c', 'm³', 'Qhot/3600*tr', 'V_c = (Q_c/3600)·t_l', '≥ 0,3 s ở ≥ 850 °C (MC5 §16-5)'],
          ['Vcat', 'Thể tích xúc tác', 'V_xt', 'm³', 'isCO*Q/SV', 'V_xt = Q / SV (oxy hóa xúc tác)', ''],
          ['selfP', 'Tỉ lệ nhiệt tự cung', 'k_tc', '%', 'iff(Hg>0,(Q*Hg/3600)/(m*cp*(Tc_-Tin))*100,0)', 'k = (Q·H_k/3600) / (ṁ·c_p·(T_c − T_vào))', 'tự duy trì khi ≈ 50 % (MC5)'],
          ['GJ', 'Năng lượng nhiên liệu', 'E', 'GJ/năm', 'fuelY*HV/1e6', 'E = V_nl·H_nl / 10⁶', ''],
          ['co2', 'CO₂ hóa thạch', 'CO₂', 't/năm', 'isNG*GJ*50253/1e6', 'CO₂ = E·50 253 / 10⁶ (khí tự nhiên)', 'MC5 VD 16-5: 50 253 g/GJ']]
      };
    },
    voc: v => {
      const c = VOC[+v.cmp];
      return {
        consts: [['Hc', `Hằng số Henry – ${c[0]}`, 'H', c[4], 'm³·atm/mol', 'MC5 Bảng 16-12'], ['isD', 'Sục khí khuếch tán (1/0)', 'k_d', v.mode === 'd' ? 1 : 0, '–', ''], ['isS', 'Sục khí bề mặt (1/0)', 'k_s', v.mode === 's' ? 1 : 0, '–', '']],
        steps: [['Hu', 'Hằng số Henry không thứ nguyên', 'H_u', '–', 'Hc/(0.000082057*(T+273.15))', 'H_u = H / (R·T)', 'MC5 VD 16-3: 0,487'],
          ['KLv', 'Hệ số chuyển khối VOC', '(K_La)_VOC', '1/h', 'KLa*pow(Dv/Do,n)', '(K_La)_VOC = (K_La)_O₂·(D_VOC/D_O₂)ⁿ', 'MC5 PT 16-22'],
          ['Qm', 'Lưu lượng nước thải', 'Q', 'm³/phút', 'Q/1440', 'Q = Q_ngày / 1440', ''],
          ['Qg', 'Lưu lượng khí ở giữa chiều sâu', 'Q_g', 'm³/phút', 'Qa*10.33/(10.33+H/2)', 'Q_g = Q_a·10,33 / (10,33 + H/2)', 'MC5 VD 16-3: 38,7'],
          ['phi', 'Thông số bão hòa', 'φ', '–', '(KLv/60)*V/(Hu*Qg)', 'φ = (K_La)_VOC·V / (H_u·Q_g)', 'MC5 PT 16-30'],
          ['frD', 'Phần stripping – sục khí khuếch tán', 'f_d', '–', '1-1/(1+Qg/Qm*Hu*(1-exp(-phi)))', 'f = 1 − 1/[1 + (Q_g/Q)·H_u·(1 − e^(−φ))]', 'MC5 PT 16-33'],
          ['tau', 'Thời gian lưu', 'τ', 'h', 'iff(isS>0.5,V/Q*24,30/3600)', 'τ = V/Q (sục khí bề mặt) ; 30 s (máng tràn)', ''],
          ['frS', 'Phần stripping – bề mặt / máng tràn', 'f_s', '–', '1-1/(1+KLv*tau)', 'f = 1 − 1/(1 + (K_La)_VOC·τ)', 'MC5 PT 16-27'],
          ['fr', 'Phần VOC bị stripping', 'f', '%', 'iff(isD>0.5,frD,frS)*100', 'f = f_d (khuếch tán) hoặc f_s', 'MC5 VD 16-3: 87 %', 1],
          ['gd', 'VOC phát thải ra khí', 'E', 'g/ngày', 'Q*Ci/1e6*fr/100*1000', 'E = Q·C_i·f / 1000', '', 1], ['Cout', 'VOC còn lại trong nước', 'C_e', 'µg/L', 'Ci*(1-fr/100)', 'C_e = C_i·(1 − f)', '']]
      };
    },
    cmb: v => {
      const e = AP42[+v.cat], u = e.u === 'ng' ? 'kg/10⁶ m³' : e.u === 'oil' ? 'kg/m³' : 'kg/GJ';
      return {
        consts: [['isNG', 'Nhiên liệu khí (1/0)', 'k_khí', e.u === 'ng' ? 1 : 0, '–', `${e.g} · ${e.n}`], ['isOil', 'Nhiên liệu dầu (1/0)', 'k_dầu', e.u === 'oil' ? 1 : 0, '–', ''],
          ['efm', 'Hệ số đổi đơn vị EF', 'k_EF', e.u === 'ng' ? 1e-6 : 1, '–', ''], ['EFN', 'EF NOx', 'EF_NOx', e.NOx, u, 'MC5 Bảng 16-15 (AP-42)'], ['EC', 'EF CO', 'EF_CO', e.CO, u, 'AP-42'],
          ['Sa', 'EF SO₂ – hằng số', 'a', e.so2[0], u, 'AP-42'], ['Sb', 'EF SO₂ – hệ số × S₁', 'b', e.so2[1], u, ''], ['Sc', 'EF SO₂ – hệ số × S₂', 'c', e.so2[2], u, ''],
          ['EPf', 'EF bụi lọc được', 'EF_PMf', e.PMf, u, 'AP-42'], ['EPc', 'EF bụi ngưng tụ', 'EF_PMc', e.PMc, u, 'AP-42']],
        steps: [['A', 'Mức hoạt động', 'A', e.u === 'ng' ? 'm³ khí/năm' : e.u === 'oil' ? 'm³ dầu/năm' : 'GJ/năm', 'iff(isNG>0.5,P/HVg*hr,iff(isOil>0.5,P/HVo*hr,P/1000*hr))', 'A = P·t_vh / H (khí, dầu) ; P·t_vh/1000 (GJ)', 'MC5 VD 16-4: 11,82·10⁶ m³/năm'],
          ['ES', 'EF SO₂', 'EF_SO₂', u, 'Sa+Sb*S1+Sc*S2', 'EF_SO₂ = a + b·S₁ + c·S₂', ''],
          ['NOx', 'Phát thải NOx', 'E_NOx', 't/năm', 'A*efm*EFN*(1-eN/100)/1000', 'E = A·EF·(1 − ER/100) / 1000', 'MC5 PT 16-34', 1], ['CO', 'Phát thải CO', 'E_CO', 't/năm', 'A*efm*EC*(1-eC/100)/1000', 'E = A·EF·(1 − ER/100) / 1000', '', 1],
          ['SO2', 'Phát thải SO₂', 'E_SO₂', 't/năm', 'A*efm*ES*(1-eS/100)/1000', 'E = A·EF·(1 − ER/100) / 1000', ''],
          ['PMf', 'Bụi lọc được', 'E_PMf', 't/năm', 'A*efm*EPf*(1-eP/100)/1000', 'E = A·EF·(1 − ER/100) / 1000', ''], ['PMc', 'Bụi ngưng tụ', 'E_PMc', 't/năm', 'A*efm*EPc*(1-eP/100)/1000', 'E = A·EF·(1 − ER/100) / 1000', ''],
          ['PM', 'Tổng bụi', 'E_PM', 't/năm', 'PMf+PMc', 'E_PM = E_PMf + E_PMc', '']]
      };
    },
    flr: v => ({
      consts: [['G1', `GWP CH₄ – ${GWP[v.gw][3]}`, 'GWP', GWP[v.gw][1], '–', 'MC5 §16-6']],
      steps: [['x', 'Phần mol CH₄', 'x', '–', 'ch4/100', 'x = %CH₄ / 100', ''], ['st', 'Không khí lý thuyết', 'A₀', 'm³/m³', 'x*2/0.21', 'A₀ = 2x / 0,21', 'MC5 PT 16-35: CH₄ + 2O₂ → CO₂ + 2H₂O'],
        ['air', 'Không khí thực tế', 'A', 'm³/m³', 'st*(1+ea/100)', 'A = A₀·(1 + e/100)', 'MC5: e = 150–200 %', 1], ['Qh', 'Lưu lượng biogas trung bình', 'Q_b', 'm³/h', 'Qy/hr', 'Q_b = Q_năm / t', ''],
        ['Qa', 'Lưu lượng không khí', 'Q_a', 'm³/h', 'Qh*air', 'Q_a = Q_b·A', ''], ['ch4f', 'CH₄ không cháy ở đuốc', 'M_f', 't/năm', 'Qy*x*unb/100*656/1e6', 'M = Q·x·k_kc·0,656 / 1000', 'ρ_CH₄ = 656 g/m³; MC5 VD 16-5: 1,143'],
        ['ch4v', 'CH₄ xả thẳng', 'M_v', 't/năm', 'Qv*x*656/1e6', 'M = Q_xả·x·0,656 / 1000', 'MC5 VD 16-5: 0,945'],
        ['co2e', 'CO₂ tương đương', 'CO₂e', 't/năm', '(ch4f+ch4v)*G1', 'CO₂e = (M_f + M_v)·GWP', '', 1], ['co2b', 'CO₂ sinh học từ đuốc', 'CO₂_sh', 't/năm', 'Qy*0.0224*49353/1e6', 'CO₂ = Q·0,0224 GJ/m³·49 353 g/GJ / 10⁶', 'MC5 VD 16-5: 321,2'],
        VM('20'), ['so2', 'SO₂ từ H₂S', 'M_SO₂', 'kg/năm', 'Qy*h2s*1e-6/Vm*64.06', 'M = Q·H₂S·10⁻⁶ / Vₘ·64,06', 'H₂S + 1,5O₂ → SO₂ + H₂O']]
    }),
    ghg: v => {
      const G = GWP[v.gw];
      return {
        consts: [['g0', 'GWP CO₂', 'GWP_CO₂', G[0], '–', G[3]], ['g1', 'GWP CH₄', 'GWP_CH₄', G[1], '–', G[3]], ['g2', 'GWP N₂O', 'GWP_N₂O', G[2], '–', G[3]],
          ['pc', 'Hệ số N₂O quá trình theo dân số', 'EF_P', v.nit === '1' ? 7 : 3.2, 'g N₂O/người·năm', 'LGO; MC5 Bảng 16-17']],
        steps: [['ngGJ', 'Năng lượng khí tự nhiên', 'E_ng', 'GJ/năm', '(ng+ngO)*eNG', 'E = V·H', ''], ['oGJ', 'Năng lượng dầu', 'E_dầu', 'GJ/năm', 'oil*eOil', 'E = V·H', ''],
          ['dGJ', 'Năng lượng biogas sử dụng', 'E_bg', 'GJ/năm', 'dgU*eDG', 'E = V·H', ''], ['fGJ', 'Năng lượng biogas đốt đuốc', 'E_đ', 'GJ/năm', 'dgF*eDG', 'E = V·H', ''],
          ['Eng', 'Khí tự nhiên', 'P_ng', 't CO₂e/năm', 'ngGJ*(50253*g0+0.948*g1+0.0948*g2)*1e-6', 'P = E·(50 253·GWP_CO₂ + 0,948·GWP_CH₄ + 0,0948·GWP_N₂O)·10⁻⁶', 'MC5 Bảng 16-16; VD 16-5: 33,3'],
          ['Eoil', 'Dầu số 2', 'P_dầu', 't CO₂e/năm', 'oGJ*(70100*g0+2.844*g1+0.569*g2)*1e-6', 'P = E·(70 100·GWP_CO₂ + 2,844·GWP_CH₄ + 0,569·GWP_N₂O)·10⁻⁶', 'VD 16-5: 1054,2'],
          ['Edg', 'Biogas sử dụng (CH₄, N₂O)', 'P_bg', 't CO₂e/năm', 'dGJ*(3.033*g1+0.597*g2)*1e-6', 'P = E·(3,033·GWP_CH₄ + 0,597·GWP_N₂O)·10⁻⁶', 'VD 16-5: 4,21'],
          ['Efl', 'Biogas đốt đuốc (CH₄ không cháy)', 'P_đ', 't CO₂e/năm', 'dgF*ch4/100*unb/100*656*1e-6*g1', 'P = V_đ·x·k_kc·656·10⁻⁶·GWP_CH₄', 'VD 16-5: 24,0'],
          ['Ev', 'Biogas xả', 'P_x', 't CO₂e/năm', 'dgV*ch4/100*656*1e-6*g1', 'P = V_x·x·656·10⁻⁶·GWP_CH₄', 'VD 16-5: 19,8'],
          ['n2oP', 'N₂O quá trình xử lý', 'P_N₂O,P', 't CO₂e/năm', 'pop*fic*pc*1e-6*g2', 'P = dân số·F_CN·EF_P·10⁻⁶·GWP_N₂O', 'VD 16-5: 1166,4'],
          ['n2oE', 'N₂O nguồn tiếp nhận', 'P_N₂O,E', 't CO₂e/năm', 'TNe*Q*efEff*365.25*44/28*1e-6*g2', 'P = TN·Q·EF·365,25·(44/28)·10⁻⁶·GWP_N₂O', 'VD 16-5: 738,4'],
          ['s1', 'Tổng Scope 1', 'S₁', 't CO₂e/năm', 'Eng+Eoil+Edg+Efl+Ev+n2oP+n2oE', 'S₁ = Σ nguồn trực tiếp', 'VD 16-5: 3040', 1],
          ['s2', 'Điện mua (Scope 2)', 'S₂', 't CO₂e/năm', '(el+elO)*efE*1e-6', 'S₂ = (E_điện + E_{khử mùi})·EF_lưới·10⁻⁶', 'VD 16-5: 10 152', 1],
          ['tot', 'Tổng Scope 1 + 2', 'S', 't CO₂e/năm', 's1+s2', 'S = S₁ + S₂', 'VD 16-5: 13 192', 1],
          ['bio', 'CO₂ sinh học (báo cáo riêng)', 'CO₂_sh', 't/năm', '(dGJ+fGJ)*49353*1e-6', 'CO₂ = (E_bg + E_đ)·49 353·10⁻⁶', 'VD 16-5: 1156'],
          ['inten', 'Cường độ phát thải', 'I', 'kg CO₂e/m³', 'tot*1e6/(Q*365)/1000', 'I = S·10³ / (Q·365)', ''], ['pcap', 'Phát thải theo dân số', 'p', 'kg CO₂e/người·năm', 'tot*1000/pop', 'p = S·1000 / dân số', '']]
      };
    }
  };

  /* ---------- đánh giá phiếu tính ---------- */
  function tokens(ex) { return ex.match(/\d+\.?\d*(?:[eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|>=|<=|\S/g) || []; }
  function evalExpr(ex, sc) {
    const ks = Object.keys(sc).filter(k => !(k in FN));
    return Function(...ks, ...Object.keys(FN), `return (${ex});`)(...ks.map(k => sc[k]), ...Object.values(FN));
  }
  function toExcel(ex, nm) {
    return tokens(ex).map(t => {
      if (/^[A-Za-z_]/.test(t)) { if (t === 'PI') return 'PI()'; if (XLF[t]) return XLF[t]; return nm(t); }
      if (/^\d/.test(t)) return t.replace(/e/, 'E');
      return t;
    }).join('');
  }
  function sheetOf(id) {
    const m = MOD[id], v = vals(m), sp = SPEC[id](v);
    const inputs = (m.inputs || []).filter(i => i.id).map(i => ({ id: i.id, l: i.l, u: i.u || '', sel: !!i.o, val: i.o ? ((i.o.find(o => String(o[0]) === String(v[i.id])) || [])[1] || v[i.id]) : +v[i.id] }));
    const sc = {};
    for (const i of inputs) if (!i.sel) sc[i.id] = i.val;
    for (const c of sp.consts) sc[c[0]] = c[3];
    const steps = sp.steps.map(s => { let val; try { val = evalExpr(s[4], sc); } catch (e) { val = NaN; } sc[s[0]] = val; return { k: s[0], l: s[1], sym: s[2], u: s[3], ex: s[4], eq: s[5], note: s[6], key: !!s[7], val }; });
    let r = {}; try { r = m.calc(v) || {}; } catch (e) { r = {}; }
    return { id, m, v, inputs, consts: sp.consts, steps, post: sp.post ? sp.post() : null, checks: (r.checks || []).map(c => ({ s: c.s, t: strip(c.t) })), sum: r.sum || '' };
  }

  /* ---------- module có bảng: khí phát sinh theo công đoạn, nguồn khí & thông gió ---------- */
  function genData() { const v = vals(MOD.gen), r = genCalc(v); let c = {}; try { c = MOD.gen.calc(v); } catch (e) { /* */ } return { v, r, checks: (c.checks || []).map(x => ({ s: x.s, t: strip(x.t) })) }; }
  function ventData() { const r = ventCalc(); return { r, checks: [] }; }

  /* ======================= EXCEL ======================= */
  function excel(ids) {
    const sheets = [], names = {}, keys = [];
    const nf = OOXML.nfOf;
    const num = (pre, v) => pre + '_' + nf(v);
    const sumS = new OOXML.Sheet('00 Tổng hợp', [6, 46, 16, 16, 40]);
    sheets.push(sumS);
    let no = 0;
    for (const id of ids) {
      no++;
      const nm0 = `${String(no).padStart(2, '0')} ${MOD[id].title}`;
      if (id === 'gen') { sheets.push(genSheet(nm0, names, keys)); continue; }
      if (id === 'vent') { sheets.push(ventSheet(nm0, names, keys)); continue; }
      const D = sheetOf(id), sh = new OOXML.Sheet(nm0, [11, 40, 15, 13, 46, 44]);
      // tên vùng phân biệt hoa/thường không được trong Excel → thêm hậu tố khi trùng
      const seen = {};
      const nameFor = {};
      const reg = k => { let n = `${id}_${k}`, low = n.toLowerCase(), j = 2; while (seen[low] && seen[low] !== k) { n = `${id}_${k}_${j++}`; low = n.toLowerCase(); } seen[low] = k; nameFor[k] = n; return n; };
      const nmx = k => nameFor[k] || reg(k);
      const ref = (r, c) => `'${sh.name.replace(/'/g, "''")}'!$${OOXML.col(c)}$${r}`;
      sh.add([{ v: D.m.title + (EN[D.m.title] ? ' · ' + EN[D.m.title] : ''), s: 'title' }], 22);
      sh.add([{ v: strip(D.m.ref), s: 'sub' }]);
      sh.add([{ v: 'Ô vàng: số liệu nhập (sửa được) · ô xanh lá: công thức sống · ô xám xanh: thông số tra bảng. Tên vùng dạng ' + id + '_<ký hiệu> dùng được trong công thức khác.', s: 'note' }]);
      sh.add([]);
      sh.add([{ v: '1. SỐ LIỆU ĐẦU VÀO', s: 'sec' }, { v: '', s: 'sec' }, { v: '', s: 'sec' }, { v: '', s: 'sec' }, { v: '', s: 'sec' }, { v: '', s: 'sec' }]);
      sh.add(['Ký hiệu', 'Đại lượng', 'Giá trị', 'Đơn vị', 'Ghi chú', ''].map(x => ({ v: x, s: 'hdr' })));
      for (const i of D.inputs) {
        if (i.sel) { sh.add([{ v: i.id, s: 'sym' }, { v: i.l, s: 'txt' }, { v: strip(i.val), s: 'txt' }, { v: '', s: 'txt' }, { v: 'lựa chọn trong phần mềm', s: 'note' }]); continue; }
        const r = sh.add([{ v: i.id, s: 'sym' }, { v: i.l, s: 'txt' }, { v: i.val, s: num('in', i.val) }, { v: i.u, s: 'txt' }, { v: '', s: 'txt' }]);
        names[nmx(i.id)] = ref(r, 2);
      }
      if (D.consts.length) {
        sh.add([]);
        sh.add([{ v: '2. THÔNG SỐ TRA BẢNG / THEO LỰA CHỌN', s: 'sec' }, ...Array(5).fill({ v: '', s: 'sec' })]);
        sh.add(['Ký hiệu', 'Đại lượng', 'Giá trị', 'Đơn vị', 'Nguồn', ''].map(x => ({ v: x, s: 'hdr' })));
        for (const c of D.consts) { const r = sh.add([{ v: c[2], s: 'sym' }, { v: c[1], s: 'txt' }, { v: c[3], s: num('val', c[3]) }, { v: c[4], s: 'txt' }, { v: c[5], s: 'note' }]); names[nmx(c[0])] = ref(r, 2); }
      }
      sh.add([]);
      sh.add([{ v: (D.consts.length ? '3' : '2') + '. TRÌNH TỰ TÍNH TOÁN', s: 'sec' }, ...Array(5).fill({ v: '', s: 'sec' })]);
      sh.add(['Ký hiệu', 'Đại lượng', 'Giá trị', 'Đơn vị', 'Công thức', 'Diễn giải / nguồn'].map(x => ({ v: x, s: 'hdr' })));
      const r0 = sh.rows.length;
      // đặt tên trước để công thức tham chiếu được bước sau
      D.steps.forEach((s, j) => { names[nmx(s.k)] = ref(r0 + j + 1, 2); });
      for (const s of D.steps) {
        const fx = toExcel(s.ex, k => nameFor[k] || nmx(k));
        sh.add([{ v: s.sym, s: 'sym' }, { v: s.l, s: s.key ? 'lbl' : 'txt' }, { f: fx, v: s.val, s: num(s.key ? 'key' : 'res', s.val) }, { v: s.u, s: 'txt' }, { v: OOXML.eqPlain(s.eq), s: 'eq' }, { v: strip(s.note), s: 'note' }]);
        if (s.key) keys.push({ mod: D.m.title, l: s.l, u: s.u, name: nameFor[s.k], val: s.val });
      }
      if (D.post) {
        sh.add([]); sh.add([{ v: D.post.title, s: 'sec' }, ...Array(5).fill({ v: '', s: 'sec' })]);
        sh.add(D.post.head.map(x => ({ v: x, s: 'hdr' })));
        for (const row of D.post.rows) sh.add(row.map(c => (typeof c === 'number' ? { v: c, s: num('val', c) } : { v: c, s: 'txt' })));
      }
      if (D.checks.length) {
        sh.add([]); sh.add([{ v: 'KIỂM TRA', s: 'sec' }, ...Array(5).fill({ v: '', s: 'sec' })]);
        for (const c of D.checks) { const r = sh.add([{ v: BADGE[c.s][0], s: c.s === 'ok' ? 'ok' : c.s === 'info' ? 'note' : 'warn' }, { v: c.t, s: 'txt' }]); sh.merge(r, 1, 5); }
      }
      sh.freeze = 0;
      sheets.push(sh);
    }
    // trang tổng hợp: công thức tham chiếu kết quả chính của từng module
    sumS.add([{ v: 'THUYẾT MINH TÍNH TOÁN KIỂM SOÁT MÙI & KHÍ THẢI – BẢNG TỔNG HỢP', s: 'title' }], 22);
    sumS.add([{ v: `Dự án: ${S.name || '—'} · Ngày: ${new Date().toLocaleDateString('vi-VN')} · KhíSạch Studio v${typeof XLNT_VERSION !== 'undefined' ? XLNT_VERSION : ''} (XLN_Ducnv515)`, s: 'sub' }]);
    sumS.add([{ v: 'Cơ sở: Metcalf & Eddy, Wastewater Engineering 5th ed. (2014), Chương 16; LGO Protocol; U.S. EPA AP-42. Các ô kết quả là công thức liên kết tới từng trang tính – sửa số liệu nhập ở trang module, tổng hợp tự cập nhật.', s: 'note' }]);
    sumS.add([]);
    sumS.add(['TT', 'Kết quả chính', 'Giá trị', 'Đơn vị', 'Module'].map(x => ({ v: x, s: 'hdr' })));
    keys.forEach((k, i) => sumS.add([{ v: i + 1, s: 'txt' }, { v: k.l, s: 'lbl' }, { f: k.name, v: k.val, s: num('key', k.val) }, { v: k.u, s: 'txt' }, { v: k.mod, s: 'txt' }]));
    sumS.freeze = 5;
    return OOXML.xlsx(sheets, names, { title: 'KhíSạch – thuyết minh tính toán', desc: 'Bảng tính sống' });
  }
  function genSheet(nm0, names, keys) {
    const { v, r } = genData(), nf = OOXML.nfOf;
    const sh = new OOXML.Sheet(nm0, [34, 8, 10, 8, 7, 7, 8, 8, 6, 10, 10, 10, 11, 8, 10, 10, 11, 10, 10, 9, 10, 10, 10, 10, 10]);
    const ref = (rw, c) => `'${sh.name.replace(/'/g, "''")}'!$${OOXML.col(c)}$${rw}`;
    const t = GEN_TECH[v.tech];
    sh.add([{ v: 'Khí phát sinh theo công đoạn · Off-gas generation by process stage', s: 'title' }], 22);
    sh.add([{ v: strip(MOD.gen.ref), s: 'sub' }]);
    sh.add([{ v: 'Ô vàng: số liệu nhập / định cỡ (sửa được) · ô xanh lá: công thức sống. Công đoạn: 1 = che kín & hút đi xử lý, 0 = để hở (chỉ tính phát thải).', s: 'note' }]);
    sh.add([]);
    sh.add([{ v: '1. SỐ LIỆU ĐẦU VÀO VÀ THÔNG SỐ CHUNG', s: 'sec' }, ...Array(5).fill({ v: '', s: 'sec' })]);
    sh.add(['Ký hiệu', 'Đại lượng', 'Giá trị', 'Đơn vị', 'Công thức / ghi chú'].map(x => ({ v: x, s: 'hdr' })));
    const P = {};
    const put = (k, l, val, u, fx, note, kind) => { const rw = sh.add([{ v: k, s: 'sym' }, { v: l, s: 'txt' }, fx ? { f: fx, v: val, s: (kind || 'res') + '_' + nf(val) } : { v: val, s: 'in_' + nf(val) }, { v: u, s: 'txt' }, { v: note || '', s: fx ? 'eq' : 'note' }]); names['gen_' + k] = ref(rw, 2); P[k] = 'gen_' + k; };
    put('Q', 'Lưu lượng trung bình', +v.Q, 'm³/ngày'); put('kmax', 'Hệ số giờ lớn nhất', +v.kmax, '×'); put('T', 'Nhiệt độ nước thải', +v.T, '°C'); put('pH', 'pH', +v.pH, '–');
    put('BOD', 'BOD₅', +v.BOD, 'mg/L'); put('TSS', 'TSS', +v.TSS, 'mg/L'); put('TKN', 'TKN', +v.TKN, 'mg/L'); put('NH4', 'NH₄-N', +v.NH4, 'mg/L'); put('S', 'Sulfua hòa tan đầu vào', +v.S, 'mg/L');
    put('H', 'Chiều sâu bể sinh học', +v.H, 'm'); put('Qin', 'Khí cấp nhập (0 = ước tính)', +v.Qair, 'Nm³/h'); put('PXin', 'Bùn dư nhập (0 = ước tính)', +v.PX, 'kgTSS/ngày');
    put('HRT', `HRT – ${t[0]}`, t[1], 'h', null, 'theo công nghệ'); put('fA', 'Phần thể tích thiếu/kỵ khí', t[2], '–', null, 'theo công nghệ'); put('Yobs', 'Hệ số sinh bùn quan sát', t[3], 'kgTSS/kgBOD', null, 'theo công nghệ');
    put('prim', 'Có lắng sơ cấp (1/0)', v.prim === '1' && v.tech !== 'MBR' ? 1 : 0, '–'); put('dn', 'Có khử nitrat (1/0)', t[2] > 0 || v.tech === 'ICEAS' || v.tech === 'AGS' || v.tech === 'OD' ? 1 : 0, '–');
    put('kG', 'Hệ số chuyển khối pha khí', +v.kG, 'm/h'); put('phi', 'Mức cân bằng H₂S trong bọt khí', +v.phi, '–'); put('sf', 'Hệ số dự phòng', +v.sf, '%');
    put('Ts', 'Nhiệt độ tính', Math.max(+v.T, 5), '°C', 'MAX(gen_T,5)', 'T_tính = max(T; 5)');
    put('HH', 'Henry H₂S (không thứ nguyên)', r.HH, '–', '1/(0.1*EXP(2100*(1/(gen_Ts+273.15)-1/298.15))*0.083145*(gen_Ts+273.15))', 'H = 1/(k_H·exp(2100·(1/T − 1/298,15))·R·T), k_H = 0,1 mol/L·bar (Sander 2015)');
    put('HN', 'Henry NH₃ (không thứ nguyên)', r.HN, '–', '1/(59*EXP(4200*(1/(gen_Ts+273.15)-1/298.15))*0.083145*(gen_Ts+273.15))', 'k_H = 59 mol/L·bar, 4200 K');
    put('pK1', 'pK₁ của H₂S', 7.0 - 0.01 * (Math.max(+v.T, 5) - 25), '–', '7-0.01*(gen_Ts-25)', 'pK₁ ≈ 7,0 − 0,01·(T − 25)');
    put('pKa', 'pKa của NH₄⁺', 0.09018 + 2729.92 / (Math.max(+v.T, 5) + 273.15), '–', '0.09018+2729.92/(gen_Ts+273.15)', 'pKa = 0,09018 + 2729,92/T (Emerson 1975)');
    put('Vm', 'Thể tích mol khí', 0.082057 * (+v.T + 273.15), 'L/mol', '0.082057*(gen_T+273.15)', 'Vₘ = R·(T + 273,15)');
    put('Vb', 'Thể tích bể sinh học', r.Vb, 'm³', 'gen_Q*gen_HRT/24', 'V = Q·HRT/24'); put('Ab', 'Diện tích bể sinh học', r.Ab, 'm²', 'gen_Vb/gen_H', 'A = V/H');
    put('dBOD', 'BOD₅ bị khử', Math.max(+v.BOD * (v.prim === '1' && v.tech !== 'MBR' ? 0.7 : 1) - 10, 0), 'mg/L', 'MAX(gen_BOD*IF(gen_prim=1,0.7,1)-10,0)', 'ΔBOD = BOD·(0,7 nếu có lắng sơ cấp) − 10');
    put('PXb', 'Bùn dư sinh học', r.PXb, 'kgTSS/ngày', 'IF(gen_PXin>0,gen_PXin,gen_Q/1000*(gen_Yobs*gen_dBOD+0.35*gen_TSS*IF(gen_prim=1,0.4,1)))', 'P_X = Q/1000·(Y_obs·ΔBOD + 0,35·TSS_sh)');
    put('AOR', 'Nhu cầu oxy', r.AOR, 'kgO₂/ngày', 'gen_Q/1000*(gen_dBOD+4.57*0.8*gen_TKN-IF(gen_dn=1,2.86*0.6*0.8*gen_TKN,0))', 'AOR = Q/1000·(ΔBOD + 4,57·N_n − 2,86·0,6·N_n), N_n = 0,8·TKN');
    put('OTE', 'Hiệu suất truyền oxy hiện trường', Math.min(0.06 * Math.max(+v.H, 1), 0.4) * 0.5, '–', 'MIN(0.06*MAX(gen_H,1),0.4)*0.5', 'OTE = min(6 %/m·H; 40 %)·0,5');
    put('Qair', 'Khí cấp bể sục khí', r.Qair, 'Nm³/h', 'IF(gen_Qin>0,gen_Qin,gen_AOR/24/(0.279*gen_OTE))', 'Q_khí = AOR / (24·0,279·OTE)');
    sh.add([]);
    sh.add([{ v: '2. KHÍ PHÁT SINH TỪNG CÔNG ĐOẠN', s: 'sec' }, ...Array(24).fill({ v: '', s: 'sec' })]);
    sh.add([{ v: 'K = 1/(1/k_L + 1/(H·k_G)); C_g = K·A·C_l / (Q + K·A/H) (che kín); C_g = φ·H·C_l (khí thoát bể sục khí); để hở: phát thải K·A·C_l. ppmv = C_g·1000·Vₘ/M.', s: 'note' }]);
    const H = ['Công đoạn', 'Che kín', 'A m²', 'h m', 'ACH', 'k_L m/h', 'S²⁻ mg/L', 'NH₄ mg/L', 'pH', 'Hút chụp m³/h', 'Khí thoát m³/h', 'V khoảng trống m³', 'Q hút m³/h',
      'f H₂S', 'C_l H₂S g/m³', 'K H₂S m/h', 'C_g H₂S g/m³', 'H₂S ppmv', 'H₂S kg/ngày', 'f NH₃', 'C_l NH₃ g/m³', 'K NH₃ m/h', 'C_g NH₃ g/m³', 'NH₃ ppmv', 'NH₃ kg/ngày'];
    sh.add(H.map(x => ({ v: x, s: 'hdr' })), 30);
    const first = sh.rows.length + 1;
    const kG = Math.max(+v.kG, 0.1), pKa = 0.09018 + 2729.92 / (Math.max(+v.T, 5) + 273.15);
    for (const s of r.st) {
      const rw = sh.rows.length + 1, c = j => OOXML.col(j) + rw;
      const fH = `1/(1+10^(${c(8)}-gen_pK1))`;
      // giá trị lưu sẵn (cùng công thức) – hiển thị đúng cả khi phần mềm bảng tính không tự tính lại lúc mở
      const KH = 1 / (1 / Math.max(s.kL, 1e-6) + 1 / (r.HH * kG)), KN = 1 / (1 / Math.max(s.kL, 1e-6) + 1 / (r.HN * kG)), ClH = s.Sd * s.fH;
      const fN = 1 / (1 + Math.pow(10, pKa - s.pH)), ClN = s.NH4 * fN * 17 / 14, q = Math.max(s.Q, 1e-9);
      const gH = s.off > 0 ? +v.phi * r.HH * ClH : s.cov ? KH * s.A * ClH / (q + KH * s.A / r.HH) : 0, gN = s.off > 0 ? +v.phi * r.HN * ClN : s.cov ? KN * s.A * ClN / (q + KN * s.A / r.HN) : 0;
      const cells = [{ v: s.n + ' — ' + s.note, s: 'txt' }, { v: s.cov ? 1 : 0, s: 'in_n0' }, { v: s.A, s: 'in_' + nf(s.A) }, { v: s.hs, s: 'in_' + nf(s.hs) }, { v: s.ach, s: 'in_n0' }, { v: s.kL, s: 'in_' + nf(s.kL) },
        { v: s.Sd, s: 'in_' + nf(s.Sd) }, { v: s.NH4, s: 'in_' + nf(s.NH4) }, { v: s.pH, s: 'in_n2' }, { v: s.extra, s: 'in_n0' }, s.off > 0 ? { f: 'gen_Qair', v: s.off, s: 'res_n0' } : { v: 0, s: 'in_n0' },
        { f: `${c(2)}*${c(3)}`, v: s.Vh, s: 'res_' + nf(s.Vh) }, { f: `IF(${c(1)}=1,${c(11)}*${c(4)}+${c(9)}+${c(10)},0)`, v: s.Q, s: 'res_' + nf(s.Q) },
        { f: fH, v: s.fH, s: 'res_n3' }, { f: `${c(6)}*${c(13)}`, v: ClH, s: 'res_n3' }, { f: `1/(1/MAX(${c(5)},1E-6)+1/(gen_HH*gen_kG))`, v: KH, s: 'res_n3' },
        { f: `IF(${c(10)}>0,gen_phi*gen_HH*${c(14)},IF(${c(1)}=1,${c(15)}*${c(2)}*${c(14)}/(MAX(${c(12)},1E-9)+${c(15)}*${c(2)}/gen_HH),0))`, v: gH, s: 'res_ne' },
        { f: `IF(${c(1)}=1,${c(16)}*1000*gen_Vm/34.08,0)`, v: isFinite(s.H2S) ? s.H2S : 0, s: 'res_n2' },
        { f: `IF(${c(10)}>0,${c(16)}*${c(10)},IF(${c(1)}=1,${c(16)}*${c(12)},${c(15)}*${c(2)}*${c(14)}))*24/1000`, v: s.eH, s: 'res_n3' },
        { f: `1/(1+10^(gen_pKa-${c(8)}))`, v: fN, s: 'res_ne' }, { f: `${c(7)}*${c(19)}*17/14`, v: ClN, s: 'res_n3' }, { f: `1/(1/MAX(${c(5)},1E-6)+1/(gen_HN*gen_kG))`, v: KN, s: 'res_ne' },
        { f: `IF(${c(10)}>0,gen_phi*gen_HN*${c(20)},IF(${c(1)}=1,${c(21)}*${c(2)}*${c(20)}/(MAX(${c(12)},1E-9)+${c(21)}*${c(2)}/gen_HN),0))`, v: gN, s: 'res_ne' },
        { f: `IF(${c(1)}=1,${c(22)}*1000*gen_Vm/17.03,0)`, v: isFinite(s.NH3) ? s.NH3 : 0, s: 'res_n2' },
        { f: `IF(${c(10)}>0,${c(22)}*${c(10)},IF(${c(1)}=1,${c(22)}*${c(12)},${c(21)}*${c(2)}*${c(20)}))*24/1000`, v: s.eN, s: 'res_n3' }];
      sh.add(cells);
    }
    const last = sh.rows.length, rg = j => `${OOXML.col(j)}${first}:${OOXML.col(j)}${last}`;
    sh.add([]);
    sh.add([{ v: '3. TỔNG HỢP KHÍ CẦN XỬ LÝ', s: 'sec' }, ...Array(5).fill({ v: '', s: 'sec' })]);
    sh.add(['Ký hiệu', 'Đại lượng', 'Giá trị', 'Đơn vị', 'Công thức'].map(x => ({ v: x, s: 'hdr' })));
    const tot = (k, l, val, u, fx, eq) => { const rw = sh.add([{ v: k, s: 'sym' }, { v: l, s: 'lbl' }, { f: fx, v: val, s: 'key_' + nf(val) }, { v: u, s: 'txt' }, { v: eq, s: 'eq' }]); names['gen_' + k] = ref(rw, 2); keys.push({ mod: 'Khí phát sinh theo công đoạn', l, u, name: 'gen_' + k, val }); };
    tot('Qt', 'Tổng lưu lượng hút', r.Qt, 'm³/h', `SUM(${rg(12)})`, 'Q = Σ Q_i (công đoạn che kín)');
    tot('Qd', 'Lưu lượng khí cần xử lý (gồm dự phòng)', r.Qd, 'm³/h', 'gen_Qt*(1+gen_sf/100)', 'Q_tk = Q·(1 + dự phòng)');
    tot('H2S', 'H₂S hỗn hợp', r.H2S, 'ppmv', `IF(gen_Qt>0,SUMPRODUCT(${rg(12)},${rg(17)})/gen_Qt,0)`, 'C = Σ(Q_i·C_i)/Q');
    tot('NH3', 'NH₃ hỗn hợp', r.NH3, 'ppmv', `IF(gen_Qt>0,SUMPRODUCT(${rg(12)},${rg(23)})/gen_Qt,0)`, 'C = Σ(Q_i·C_i)/Q');
    tot('LH', 'Tải H₂S thu về xử lý', r.LH, 'kg/ngày', `SUMIF(${rg(1)},1,${rg(18)})`, 'Σ phát thải công đoạn che kín');
    tot('open', 'Phát thải H₂S từ công đoạn để hở', r.open, 'kg/ngày', `SUMIF(${rg(1)},0,${rg(18)})`, 'nguồn diện');
    sh.freeze = 0;
    return sh;
  }
  function ventSheet(nm0, names, keys) {
    const { r } = ventData(), nf = OOXML.nfOf;
    const sh = new OOXML.Sheet(nm0, [34, 30, 10, 10, 8, 10, 10, 12, 12, 12, 10]);
    const ref = (rw, c) => `'${sh.name.replace(/'/g, "''")}'!$${OOXML.col(c)}$${rw}`;
    sh.add([{ v: 'Nguồn khí & thông gió · Odor sources & ventilation', s: 'title' }], 22); sh.add([{ v: strip(MOD.vent.ref), s: 'sub' }]); sh.add([]);
    sh.add(['Công trình', 'Loại (MC5 Bảng 16-4)', 'A m²', 'h m', 'ACH 1/h', 'H₂S ppmv', 'NH₃ ppmv', 'V = A·h m³', 'q = V·ACH m³/h', 'Mức mùi', 'Vùng đệm m'].map(x => ({ v: x, s: 'hdr' })), 30);
    const first = sh.rows.length + 1;
    for (const x of r.rows) {
      const rw = sh.rows.length + 1, c = j => OOXML.col(j) + rw;
      sh.add([{ v: x.n, s: 'txt' }, { v: x.u[0], s: 'txt' }, { v: x.A, s: 'in_' + nf(x.A) }, { v: x.h, s: 'in_' + nf(x.h) }, { v: x.ach, s: 'in_' + nf(x.ach) }, { v: x.h2s, s: 'in_' + nf(x.h2s) }, { v: x.nh3, s: 'in_' + nf(x.nh3) },
        { f: `${c(2)}*${c(3)}`, v: x.V, s: 'res_' + nf(x.V) }, { f: `${c(7)}*${c(4)}`, v: x.q, s: 'res_' + nf(x.q) }, { v: x.u[1], s: 'txt' }, { v: x.u[2] == null ? '–' : x.u[2], s: 'txt' }]);
    }
    const last = sh.rows.length, rg = j => `${OOXML.col(j)}${first}:${OOXML.col(j)}${last}`;
    sh.add([]);
    const rs = sh.add([{ v: 'Hệ số dự phòng (%)', s: 'lbl' }, { v: '', s: 'txt' }, { v: r.sf, s: 'in_n0' }]); names.vent_sf = ref(rs, 2);
    const tot = (k, l, val, u, fx) => { const rw = sh.add([{ v: l, s: 'lbl' }, { v: k, s: 'sym' }, { f: fx, v: val, s: 'key_' + nf(val) }, { v: u, s: 'txt' }]); names['vent_' + k] = ref(rw, 2); keys.push({ mod: 'Nguồn khí & thông gió', l, u, name: 'vent_' + k, val }); };
    tot('Q', 'Tổng lưu lượng hút', r.Q, 'm³/h', `SUM(${rg(8)})`); tot('Qd', 'Lưu lượng thiết kế', r.Qd, 'm³/h', 'vent_Q*(1+vent_sf/100)');
    tot('H2S', 'H₂S hỗn hợp', r.H2S, 'ppmv', `IF(vent_Q>0,SUMPRODUCT(${rg(8)},${rg(5)})/vent_Q,0)`); tot('NH3', 'NH₃ hỗn hợp', r.NH3, 'ppmv', `IF(vent_Q>0,SUMPRODUCT(${rg(8)},${rg(6)})/vent_Q,0)`);
    return sh;
  }

  /* ======================= MÔ HÌNH TÀI LIỆU (Word + PDF) ======================= */
  function model(ids) {
    const B = [], ver = typeof XLNT_VERSION !== 'undefined' ? XLNT_VERSION : '', date = new Date().toLocaleDateString('vi-VN');
    B.push({ t: 'title', x: 'THUYẾT MINH TÍNH TOÁN\nHỆ THỐNG KIỂM SOÁT MÙI VÀ KHÍ THẢI\nTRẠM XỬ LÝ NƯỚC THẢI' });
    B.push({ t: 'subtitle', x: `Dự án: ${S.name || '—'}` }, { t: 'subtitle', x: `Ngày lập: ${date}` });
    B.push({ t: 'subtitle', x: `Phần mềm: KhíSạch Studio – bộ XLN_Ducnv515 v${ver}` });
    B.push({ t: 'subtitle', x: 'Cơ sở: Metcalf & Eddy, Wastewater Engineering: Treatment and Resource Recovery, 5th ed. (2014), Chương 16; LGO Protocol; U.S. EPA AP-42' });
    B.push({ t: 'pb' }, { t: 'toc', x: 'MỤC LỤC' });
    // quy ước
    B.push({ t: 'h1', x: '1. Quy ước và phương pháp trình bày', pb: 1 });
    B.push({ t: 'p', x: 'Thuyết minh trình bày cho từng hạng mục: (i) số liệu đầu vào, (ii) thông số tra bảng theo lựa chọn công nghệ, (iii) trình tự tính toán – mỗi đại lượng gồm công thức tổng quát, giá trị tính và diễn giải/nguồn, (iv) kiểm tra so với khoảng khuyến nghị. Phương trình được đánh số (mục.thứ tự).' });
    B.push({ t: 'bullets', items: ['Điều kiện khí: áp suất 1 atm; thể tích mol Vₘ = R·(T + 273,15), R = 0,082057 L·atm/(mol·K); nồng độ khối lượng C (mg/m³) = ppmv·M / Vₘ (MC5 PT 2-44, 2-45).',
      'Lưu lượng khí Q tính bằng m³/h ở điều kiện vận hành, trừ khi ghi khác; tải lượng tính theo ngày (kg/ngày) hoặc năm.',
      'Ký hiệu nguồn: "MC5 PT x-y" – phương trình trong Metcalf & Eddy 5th ed.; "Bảng", "VD" – bảng, ví dụ tương ứng. Thông số ngoài MC5 được ghi rõ nguồn.',
      'Bảng tính Excel kèm theo dùng cùng công thức: ô vàng là số liệu nhập, ô xanh là công thức sống; sửa ô vàng thì kết quả tự cập nhật.'] });
    // tóm tắt
    B.push({ t: 'h1', x: '2. Tóm tắt kết quả' });
    const sumRows = [];
    let no = 2;
    const secs = [];
    for (const id of ids) {
      no++;
      const m = MOD[id], title = `${no}. ${m.title}`;
      const blocks = [{ t: 'h1', x: title + (EN[m.title] ? ' (' + EN[m.title] + ')' : ''), pb: 1 }, { t: 'note', x: 'Cơ sở: ' + strip(m.ref) }, { t: 'p', x: strip(m.intro) }];
      if (id === 'gen' || id === 'vent') { const g = id === 'gen' ? genBlocks(no) : ventBlocks(no); blocks.push(...g.blocks); sumRows.push(...g.sum.map(s => [m.title, ...s])); secs.push(blocks); continue; }
      const D = sheetOf(id);
      blocks.push({ t: 'h2', x: `${no}.1. Số liệu đầu vào` });
      blocks.push({ t: 'table', head: ['Ký hiệu', 'Đại lượng', 'Giá trị', 'Đơn vị'], w: [1.2, 4.6, 1.6, 1.6], num: [2], rows: D.inputs.map(i => [sy(i.id), i.l, i.sel ? strip(i.val) : fm(i.val), i.u]) });
      let sub = 2;
      if (D.consts.length) {
        blocks.push({ t: 'h2', x: `${no}.${sub++}. Thông số tra bảng theo lựa chọn` });
        blocks.push({ t: 'table', head: ['Ký hiệu', 'Đại lượng', 'Giá trị', 'Đơn vị', 'Nguồn'], w: [1.2, 3.6, 1.4, 1.4, 2.4], num: [2], rows: D.consts.map(c => [sy(c[2]), c[1], fm(c[3]), c[4], c[5]]) });
      }
      blocks.push({ t: 'h2', x: `${no}.${sub++}. Trình tự tính toán` });
      D.steps.forEach((s, j) => {
        blocks.push({ t: 'p', r: [[`${j + 1}) ${s.l}`, { b: 1 }], [s.key ? '  – kết quả chính' : '', { i: 1, col: '1E4E8C' }]] });
        blocks.push({ t: 'eq', m: `${s.eq} = ${fm(s.val)}`, u: s.u === '–' ? '' : s.u, n: `(${no}.${j + 1})` });
        if (s.note) blocks.push({ t: 'note', x: strip(s.note) });
        if (s.key) sumRows.push([m.title, s.l, fm(s.val), s.u]);
      });
      if (D.post) { blocks.push({ t: 'h2', x: `${no}.${sub++}. ${D.post.title}` }); blocks.push({ t: 'table', head: D.post.head, rows: D.post.rows.map(r => r.map(fm)), num: [D.post.head[0] === 'Hạng' ? 2 : 1], w: D.post.head[0] === 'Hạng' ? [0.8, 6, 1.6] : [5, 2, 2] }); }
      if (D.checks.length) { blocks.push({ t: 'h2', x: `${no}.${sub++}. Kiểm tra và nhận xét` }); blocks.push({ t: 'bullets', items: D.checks.map(c => [[`[${BADGE[c.s][0]}] `, { b: 1, col: c.s === 'ok' ? '15803D' : c.s === 'info' ? '1E4E8C' : 'B45309' }], [c.t]]) }); }
      secs.push(blocks);
    }
    B.push({ t: 'table', head: ['Hạng mục', 'Kết quả chính', 'Giá trị', 'Đơn vị'], w: [2.6, 4, 1.6, 1.8], num: [2], rows: sumRows });
    B.push({ t: 'note', x: 'Các giá trị là kết quả tính theo số liệu nhập tại thời điểm lập thuyết minh. Thiết kế chính thức cần đối chiếu số liệu đo đạc tại hiện trường và thông số nhà cung cấp thiết bị.' });
    secs.forEach(s => B.push(...s));
    B.push({ t: 'h1', x: `${no + 1}. Tài liệu tham khảo`, pb: 1 });
    B.push({ t: 'bullets', items: ['Metcalf & Eddy | AECOM (2014). Wastewater Engineering: Treatment and Resource Recovery, 5th ed., McGraw-Hill – Chương 16: Air Emissions from Wastewater Treatment Facilities and Their Control.',
      'ICLEI, CARB, CCAR, The Climate Registry (2010). Local Government Operations Protocol (LGO), v1.1.', 'U.S. EPA (1995–2010). AP-42, Compilation of Air Pollutant Emission Factors, Vol. I.',
      'Sander, R. (2015). Compilation of Henry’s law constants for water as solvent, Atmos. Chem. Phys. 15, 4399–4981.', 'Emerson, K. et al. (1975). Aqueous ammonia equilibrium calculations, J. Fish. Res. Board Can. 32, 2379–2383.',
      'Briggs, G. A. (1973). Diffusion estimation for small emissions, ATDL Contribution 79, NOAA.', 'NFPA 820 (2020). Standard for Fire Protection in Wastewater Treatment and Collection Facilities; WEF MOP 25 (2004). Control of Odors and Emissions from Wastewater Treatment Plants.'] });
    return B;
  }
  function genBlocks(no) {
    const { v, r, checks } = genData(), t = GEN_TECH[v.tech], b = [], sum = [];
    b.push({ t: 'h2', x: `${no}.1. Số liệu đầu vào` });
    b.push({ t: 'table', head: ['Đại lượng', 'Giá trị', 'Đơn vị'], w: [5, 2, 2], num: [1], rows: MOD.gen.inputs.filter(i => i.id).map(i => [i.l, i.o ? strip((i.o.find(o => String(o[0]) === String(v[i.id])) || [])[1] || v[i.id]) : fm(+v[i.id]), i.u || '']) });
    b.push({ t: 'h2', x: `${no}.2. Phương pháp tính` });
    const E = [['Lưu lượng hút công đoạn che kín', 'Qᵢ = V_kt·ACH + Q_chụp + Q_{khí thoát}', 'm³/h'], ['Phần H₂S không phân ly', 'f_H₂S = 1 / (1 + 10^(pH − pK₁)), pK₁ ≈ 7,0 − 0,01·(T − 25)', '–'],
      ['Phần NH₃ tự do', 'f_NH₃ = 1 / (1 + 10^(pKa − pH)), pKa = 0,09018 + 2729,92 / T(K)', '–'], ['Hằng số Henry không thứ nguyên', 'H = 1 / (k_H·exp(C·(1/T − 1/298,15))·R·T)', '–'],
      ['Hệ số chuyển khối tổng', 'K = 1 / (1/k_L + 1/(H·k_G))', 'm/h'], ['Nồng độ khí khoảng trống (che kín)', 'C_g = K·A·C_l / (Q + K·A/H)', 'g/m³'],
      ['Khí thoát qua bọt khí (bể sục khí)', 'C_g = φ·H·C_l', 'g/m³'], ['Phát thải công đoạn để hở', 'E = K·A·C_l', 'g/h'], ['Quy đổi nồng độ', 'ppmv = C_g·1000·Vₘ / M', 'ppmv'],
      ['Nhu cầu oxy', 'AOR = Q/1000·(ΔBOD + 4,57·N_n − 2,86·0,6·N_n), N_n = 0,8·TKN', 'kgO₂/ngày'], ['Khí cấp ước tính', 'Q_khí = AOR / (24·0,279·OTE), OTE = min(6 %/m·H; 40 %)·0,5', 'Nm³/h'],
      ['Lưu lượng khí cần xử lý', 'Q_tk = Σ Qᵢ·(1 + dự phòng/100)', 'm³/h'], ['Nồng độ hỗn hợp', 'C_hh = Σ(Qᵢ·Cᵢ) / Σ Qᵢ', 'ppmv']];
    E.forEach((e, j) => { b.push({ t: 'p', r: [[`${j + 1}) ${e[0]}`, { b: 1 }]] }); b.push({ t: 'eq', m: e[1], u: e[2] === '–' ? '' : e[2], n: `(${no}.${j + 1})` }); });
    b.push({ t: 'note', x: `Hằng số Henry không thứ nguyên ở ${f(+v.T, 0)} °C: H₂S ${f(r.HH, 3)}; NH₃ ${f(r.HN, -1)} (Sander 2015 – H₂S: kH = 0,1 mol/(L·bar), C = 2100 K; NH₃: kH = 59 mol/(L·bar), C = 4200 K). Công nghệ ${t[0]}: HRT ${t[1]} h, phần thể tích thiếu/kỵ khí ${f(t[2] * 100, 0)} %, hệ số sinh bùn quan sát ${t[3]} kgTSS/kgBOD.` });
    b.push({ t: 'h2', x: `${no}.3. Các đại lượng trung gian` });
    b.push({ t: 'table', head: ['Đại lượng', 'Giá trị', 'Đơn vị'], w: [5, 2, 2], num: [1], rows: [['Thể tích bể sinh học', fm(r.Vb), 'm³'], ['Diện tích bể sinh học', fm(r.Ab), 'm²'], ['Nhu cầu oxy AOR', fm(r.AOR), 'kgO₂/ngày'],
      ['Khí cấp bể sục khí', fm(r.Qair), 'Nm³/h'], ['Bùn dư sinh học', fm(r.PXb), 'kgTSS/ngày'], ['Bùn sơ cấp', fm(r.Pp), 'kgTSS/ngày'], ['Bùn sau ổn định', fm(r.dg ? r.Md : r.M0), 'kgTSS/ngày'], ['Biogas', fm(r.biogas), 'm³/ngày']] });
    b.push({ t: 'h2', x: `${no}.4. Khí phát sinh từng công đoạn` });
    b.push({ t: 'table', head: ['Công đoạn', 'Che kín', 'A m²', 'V_kt m³', 'ACH', 'Q hút m³/h', 'H₂S ppmv', 'NH₃ ppmv', 'H₂S kg/ngày'], w: [3.4, 0.9, 0.9, 1, 0.7, 1.1, 1, 1, 1.1], num: [2, 3, 4, 5, 6, 7, 8],
      rows: r.st.map(s => [s.n, s.cov ? 'có' : 'hở', fm(s.A), fm(s.Vh), s.ach || '–', s.cov ? fm(s.Q) : '–', s.cov ? fm(s.H2S) : '–', s.cov ? fm(s.NH3) : '–', fm(s.eH)]).concat([['Tổng khí cần xử lý', '', '', '', '', fm(r.Qt), fm(r.H2S), fm(r.NH3), fm(r.LH)]]) });
    b.push({ t: 'note', x: 'Giả thiết định cỡ: ' + r.st.map(s => `${s.n}: ${s.note}`).join('; ') + '.' });
    b.push({ t: 'p', r: [['Kết luận: ', { b: 1 }], [`lưu lượng khí cần xử lý Q_tk = ${f(r.Qd, 0)} m³/h (gồm dự phòng ${f(+v.sf, 0)} %), H₂S hỗn hợp ${f(r.H2S, 1)} ppmv, NH₃ ${f(r.NH3, 1)} ppmv, tải H₂S ${f(r.LH, 2)} kg/ngày.`]] });
    if (checks.length) { b.push({ t: 'h2', x: `${no}.5. Kiểm tra và nhận xét` }); b.push({ t: 'bullets', items: checks.map(c => [[`[${BADGE[c.s][0]}] `, { b: 1 }], [c.t]]) }); }
    sum.push(['Lưu lượng khí cần xử lý', fm(r.Qd), 'm³/h'], ['H₂S hỗn hợp', fm(r.H2S), 'ppmv'], ['Tải H₂S', fm(r.LH), 'kg/ngày']);
    return { blocks: b, sum };
  }
  function ventBlocks(no) {
    const { r } = ventData(), b = [];
    b.push({ t: 'h2', x: `${no}.1. Phương pháp tính` });
    [['Thể tích khoảng trống', 'V = A·h', 'm³'], ['Lưu lượng hút', 'q = V·ACH', 'm³/h'], ['Lưu lượng thiết kế', 'Q_tk = Σq·(1 + dự phòng/100)', 'm³/h'], ['Nồng độ hỗn hợp', 'C_hh = Σ(qᵢ·Cᵢ)/Σqᵢ', 'ppmv']]
      .forEach((e, j) => { b.push({ t: 'p', r: [[`${j + 1}) ${e[0]}`, { b: 1 }]] }); b.push({ t: 'eq', m: e[1], u: e[2], n: `(${no}.${j + 1})` }); });
    b.push({ t: 'h2', x: `${no}.2. Bảng tính các công trình` });
    b.push({ t: 'table', head: ['Công trình', 'A m²', 'h m', 'ACH', 'V m³', 'q m³/h', 'H₂S ppmv', 'NH₃ ppmv', 'Vùng đệm m'], w: [3.2, 0.9, 0.8, 0.7, 1, 1.1, 1, 1, 1], num: [1, 2, 3, 4, 5, 6, 7, 8],
      rows: r.rows.map(x => [x.n, fm(x.A), fm(x.h), fm(x.ach), fm(x.V), fm(x.q), fm(x.h2s), fm(x.nh3), x.u[2] == null ? '–' : x.u[2]]).concat([['Tổng', '', '', '', '', fm(r.Q), fm(r.H2S), fm(r.NH3), '']]) });
    b.push({ t: 'p', r: [['Kết luận: ', { b: 1 }], [`Q_tk = ${f(r.Qd, 0)} m³/h (dự phòng ${f(r.sf, 0)} %), H₂S ${f(r.H2S, 1)} ppmv, NH₃ ${f(r.NH3, 1)} ppmv; vùng đệm lớn nhất ${r.buf ? f(r.buf, 0) + ' m (' + r.bufN + ')' : '–'} (MC5 Bảng 16-7).`]] });
    return { blocks: b, sum: [['Lưu lượng thiết kế', fm(r.Qd), 'm³/h'], ['H₂S hỗn hợp', fm(r.H2S), 'ppmv']] };
  }

  /* ---------- PDF: trang in HTML cùng nội dung ---------- */
  function html(B) {
    const e = s => OOXML.esc(s), rr = b => b.r ? b.r.map(x => { const o = x[1] || {}; let s = e(x[0]); if (o.b) s = `<b>${s}</b>`; if (o.i) s = `<i>${s}</i>`; if (o.sub) s = `<sub>${s}</sub>`; if (o.sup) s = `<sup>${s}</sup>`; return o.col ? `<span style="color:#${o.col}">${s}</span>` : s; }).join('') : e(b.x || '').replace(/\n/g, '<br>');
    let toc = '', body = '', n = 0;
    for (const b of B) {
      if (b.t === 'h1' || b.t === 'h2') { n++; toc += `<div class="t${b.t[1]}"><a href="#s${n}">${e(b.x)}</a></div>`; body += `<${b.t} id="s${n}"${b.pb ? ' class="pb"' : ''}>${e(b.x)}</${b.t}>`; continue; }
      if (b.t === 'title') body += `<div class="cover"><h1 class="ti">${rr(b)}</h1>`;
      else if (b.t === 'subtitle') body += `<p class="st">${rr(b)}</p>`;
      else if (b.t === 'pb') body += '</div><div class="pbk"></div>';
      else if (b.t === 'toc') body += `<h1 class="toch">${e(b.x)}</h1><div class="toc">@@TOC@@</div>`;
      else if (b.t === 'p') body += `<p>${rr(b)}</p>`;
      else if (b.t === 'note') body += `<p class="note">${rr(b)}</p>`;
      else if (b.t === 'eq') body += `<div class="eq"><span class="m">${OOXML.eqHtml(b.m)}</span>${b.u ? ` <span class="u">${e(b.u)}</span>` : ''}<span class="n">${e(b.n || '')}</span></div>`;
      else if (b.t === 'bullets') body += `<ul>${b.items.map(it => `<li>${Array.isArray(it) ? rr({ r: it }) : e(it)}</li>`).join('')}</ul>`;
      else if (b.t === 'table') body += `<table><thead><tr>${b.head.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map((c, i) => `<td${(b.num || []).includes(i) ? ' class="r"' : ''}>${Array.isArray(c) ? rr({ r: c }) : e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    body = body.replace('@@TOC@@', toc);
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Thuyết minh tính toán – ${e(S.name || 'KhíSạch')}</title><style>
      @page{size:A4;margin:18mm 16mm 18mm 20mm}
      body{font:11pt/1.45 "Times New Roman",serif;color:#111;max-width:180mm;margin:10mm auto}
      .cover{text-align:center;padding-top:60mm}.ti{font-size:21pt;color:#14325c;line-height:1.35;margin-bottom:14mm}.st{font-size:12.5pt;color:#334155;margin:3mm 0}
      .pbk,.pb{page-break-before:always}h1{font-size:15pt;color:#14325c;border-bottom:1.5px solid #14325c;padding-bottom:2pt;margin:16pt 0 8pt}h2{font-size:12.5pt;color:#1e4e8c;margin:12pt 0 5pt;page-break-after:avoid}
      p{margin:4pt 0;text-align:justify}.note{font-size:9.5pt;color:#5f6b7a;font-style:italic;margin:1pt 0 6pt 10mm}
      .eq{display:flex;align-items:baseline;gap:6pt;margin:3pt 0 2pt 10mm;page-break-inside:avoid}.eq .m{font-family:"Cambria Math","Cambria",serif}.eq sub,.eq sup{font-size:75%}.eq .u{color:#334155}.eq .n{margin-left:auto}
      table{border-collapse:collapse;width:100%;font-size:9.5pt;margin:4pt 0 8pt;page-break-inside:auto}th{background:#14325c;color:#fff;font-weight:bold;padding:3pt 4pt;border:1px solid #9aa5b4;text-align:left}
      td{border:1px solid #9aa5b4;padding:2pt 4pt;vertical-align:top}td.r{text-align:right;white-space:nowrap}tr{page-break-inside:avoid}thead{display:table-header-group}
      ul{margin:3pt 0 6pt;padding-left:8mm}li{margin:1.5pt 0}.toch{border:0}.toc a{color:#111;text-decoration:none}.toc .t1{font-weight:bold;margin-top:4pt}.toc .t2{margin-left:8mm;font-size:10pt}
      @media screen{body{background:#eef1f5}body>*{background:#fff}}
    </style></head><body>${body}</body></html>`;
  }

  /* ---------- giao diện (module Báo cáo tổng hợp) ---------- */
  const ALL = () => MODS.filter(m => !['ref', 'rep'].includes(m.id)).map(m => m.id);
  function chosen() { const a = Array.isArray(S.cdSel) ? S.cdSel.filter(id => MOD[id]) : ALL(); return ALL().filter(id => a.includes(id)); }
  function panel() {
    const sel = chosen();
    return `<div class="cdp"><h3 class="sec-t">${bl(['Xuất thuyết minh tính toán', 'Export calculation report'])}</h3>
      <p class="hint">${bl(['Excel: mỗi module một trang tính – ô vàng là số liệu nhập, ô xanh là công thức sống (sửa số liệu → kết quả tự tính lại), trang Tổng hợp liên kết kết quả chính. Word/PDF: bìa, mục lục, quy ước, tóm tắt kết quả, từng module gồm số liệu, thông số tra bảng, công thức có đánh số, giá trị, diễn giải, nguồn MC5 và kiểm tra.',
        'Excel: one sheet per module – yellow cells are inputs, green cells are live formulas (edit inputs → results recalculate); the Summary sheet links the key results. Word/PDF: cover, contents, conventions, summary, and per module: inputs, table parameters, numbered equations with values, explanations, MC5 references and checks.'])}</p>
      <div class="cdm">${ALL().map(id => `<label><input type="checkbox" data-cdm="${id}"${sel.includes(id) ? ' checked' : ''}> ${T(MOD[id].title)}</label>`).join('')}</div>
      <div class="row-act"><button class="btn pri" id="cdXlsx">${btn('⬇ Excel – công thức sống (.xlsx)', 'Excel – live formulas')}</button><button class="btn pri" id="cdDocx">${btn('⬇ Word – thuyết minh (.docx)', 'Word report')}</button>
        <button class="btn" id="cdPdf">${btn('🖨 PDF – in / lưu PDF', 'PDF – print / save')}</button><button class="btn" id="cdAll">${btn('Chọn tất cả', 'Select all')}</button></div></div>`;
  }
  const fname = ext => (S.name || 'KhiSach').replace(/[^\wÀ-ỹ\- ]+/g, '_').trim().replace(/\s+/g, '_').slice(0, 50) + '_ThuyetMinh_' + new Date().toISOString().slice(0, 10) + ext;
  function exportXlsx() { const ids = chosen(); if (!ids.length) return toast('Chưa chọn module · No module selected'); OOXML.save(fname('.xlsx'), excel(ids), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); toast('Đã xuất Excel · Excel exported'); }
  function exportDocx() {
    const ids = chosen(); if (!ids.length) return toast('Chưa chọn module · No module selected');
    const ver = typeof XLNT_VERSION !== 'undefined' ? XLNT_VERSION : '';
    OOXML.save(fname('.docx'), OOXML.docx(model(ids), { title: 'Thuyết minh tính toán kiểm soát mùi và khí thải', header: 'Thuyết minh tính toán kiểm soát mùi & khí thải – ' + (S.name || ''), headerR: 'KhíSạch Studio v' + ver, footer: 'Metcalf & Eddy 5th ed., Ch.16 · XLN_Ducnv515' }),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    toast('Đã xuất Word · Word exported');
  }
  function exportPdf() {
    const ids = chosen(); if (!ids.length) return toast('Chưa chọn module · No module selected');
    const w = window.open('', '_blank'); if (!w) { toast('Trình duyệt chặn cửa sổ mới · Pop-up blocked'); return; }
    w.document.write(html(model(ids))); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* */ } }, 500);
  }
  document.getElementById('main').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'cdXlsx') exportXlsx(); else if (t.id === 'cdDocx') exportDocx(); else if (t.id === 'cdPdf') exportPdf();
    else if (t.id === 'cdAll') { S.cdSel = ALL(); save(); show('rep'); }
  });
  document.getElementById('main').addEventListener('change', e => {
    const c = e.target.closest('[data-cdm]'); if (!c) return;
    const s = new Set(chosen()); if (c.checked) s.add(c.dataset.cdm); else s.delete(c.dataset.cdm); S.cdSel = ALL().filter(id => s.has(id)); save();
  });
  return { SPEC, sheetOf, excel, model, html, panel, chosen, toExcel, genData };
})();
