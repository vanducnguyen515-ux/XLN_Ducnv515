/* =====================================================================
   GỢI Ý XỬ LÝ CÁC KIỂM TRA CHƯA ĐẠT
   Mỗi gợi ý: { t: mô tả, why: cơ sở, act?: { label, fn(S, ai) } } — act thay đổi dữ liệu rồi tính lại
   ===================================================================== */
'use strict';

const REM = (() => {
  const P = (key, val, label) => ({ label: label || `Đặt ${DATA.P[key] ? DATA.P[key][1] : key} = ${fx(val)}`, fn: S => { S.p[key] = val; } });
  // bật tự giải R08 cho phương án đang xét; bỏ dấu nhập tay của các ô liên quan để R08 được tự chọn
  const AF = (...keys) => ({ label: 'Bật tự giải R08 cho phương án (tab 3)', fn: (S, ai) => { S.alts[ai].c.autoFit = 1; if (S.pMan) for (const k of keys) delete S.pMan[k]; } });
  const A = (key, val, label) => ({ label: label || `${DATA.STEPS.find(s => s.key === key).name}: ${DATA.optName(key, val)}`, fn: (S, ai) => { S.alts[ai].c[key] = val; } });
  const EF = (k, col, val, label) => ({ label: label || `Hiệu suất ${k} (${col}) = ${val} %`, fn: S => { S.eff[k][col] = val; } });
  // F/M ICEAS: giảm 20 % so với giá trị đang dùng (kể cả khi đang tự giải)
  // ICEAS: tăng SRT thiết kế 20 % so với giá trị đang dùng (thể tích bể tăng theo)
  const icFM = (R, p) => { const cur = R.um.bio.ids.SRT ? R.um.bio.ids.SRT.val : 20; return { t: 'Tăng SRT thiết kế ICEAS (tăng khối bùn và thể tích bể).', act: P('ic_SRT', Math.ceil(cur * 1.2)) }; };
  const srtKey = { CAS: 'cas_SRT', AO: 'ao_SRT', AAO: 'aao_SRT', SBR: 'sbr_SRT', OD: 'od_SRT', MBBR: 'mbbr_SRT', MBR: 'mbr_SRT', ORG: 'org_SRT', BIOP: 'bp_SRT' };

  function forOut(x, R, S) {
    const c = R.alt.c, p = Object.assign({}, S.p, { autoFit: R.S.p.autoFit }), out = [], k = x.key, bio = c.bio;   // tự giải R08 theo phương án
    const over = x.v && x.lim ? x.v / x.lim : 1;
    if (k === 'Color') {
      out.push({ t: `Độ màu ra ${fx(x.v)} > ${fx(x.lim)} Pt/Co. Keo tụ PAC khử màu thực tế 50 – 80 % – cần Jartest xác nhận hiệu suất bậc 3.`, why: 'M&E mục 6-2; hiệu suất cụm hóa lý bậc 3', act: c.chemPos === 'post' ? EF('Color', 'tert', Math.min(85, Math.ceil((1 - x.lim * 0.95 / (x.v / (1 - S.eff.Color.tert / 100))) * 100))) : null });
      if (c.chemPos !== 'post') out.push({ t: 'Bố trí cụm hóa lý bậc 3 sau sinh học để khử màu và SS.', act: A('chemPos', 'post') });
      out.push({ t: 'Nếu màu do thuốc nhuộm/hữu cơ khó phân hủy: bổ sung oxy hóa nâng cao (O₃, Fenton) hoặc lọc than hoạt tính sau lọc bậc 3 – lập phương án riêng.', why: 'M&E Ch.11 (xử lý bậc cao)' });
    } else if (k === 'TN' || k === 'NO3') {
      if (bio === 'CAS') { out.push({ t: 'CAS không khử nitrat – chuyển sang công nghệ có vùng thiếu khí.', act: A('bio', 'AO', 'Đổi sang AO (MLE)') }); out.push({ t: 'Hoặc A²O (khử cả N và P sinh học).', act: A('bio', 'AAO', 'Đổi sang A²O') }); }
      if (c.carbon !== 'auto') out.push({ t: 'Bật tự động bổ sung carbon ngoài (methanol) khi thiếu năng lực khử nitrat.', why: 'M&E PT (8-69), Bảng 8-26', act: A('carbon', 'auto', 'Bật carbon ngoài tự động') });
      if (c.chemPos === 'pre') out.push({ t: 'Hóa lý trước sinh học lấy mất carbon cho khử nitrat – chuyển cụm hóa lý ra sau sinh học.', act: A('chemPos', 'post', 'Chuyển hóa lý ra sau sinh học') });
      if (DATA.FIXED[bio]) { const k = DATA.FIXED[bio]; out.push({ t: 'Tăng tuần hoàn nội tối đa (Organica/Biopolus).', act: P(k + '_IRmax', p[k + '_IRmax'] + 1) }); if (R.um.bio.fixed && !R.um.bio.fixed.hyb) out.push({ t: 'Chuyển sang chế độ lai (có tuần hoàn bùn) – tuần hoàn bùn cũng mang NO₃ về ngăn thiếu khí.', act: A('fixMode', 'hyb') }); }
      if (bio === 'AO' || bio === 'AAO') out.push({ t: 'Tăng thời gian lưu thiếu khí tối đa cho phép.', act: P(bio === 'AO' ? 'ao_tanox_max' : 'aao_tanox_max', (bio === 'AO' ? p.ao_tanox_max : p.aao_tanox_max) + 2) });
      if (bio === 'ICEAS' && R.icRec && R.icRec.use !== 'D') out.push({ t: 'ICEAS đang chạy chu trình ' + R.icRec.useName + ' – chuyển sang NDN(P) (có pha Air-Off khuấy để khử nitrat).', why: 'Sanitaire ICEAS NDN(P) Cycle Chart', act: A('icCycle', 'NDN', 'Chu trình ICEAS: NDN(P)') });
      if (bio === 'ICEAS' && R.icRec && R.icRec.use === 'C') out.push({ t: 'Tăng thời gian Air-Off (chu trình tự nhập).', act: P('ic_off', p.ic_off + 18) });
      if (bio === 'CTECH') {
        out.push({ t: 'C-Tech chỉ khử nitrat trong lớp bùn khi lắng và ở selector (M&E 5th mục 8-6): nếu có số liệu vận hành điều khiển DO thấp, tính khử nitrat đồng thời SND trong pha F/A (SFC 0,75 – cần xác nhận).', why: 'M&E 5th mục 8-7', act: P('ct_SND', 0.5, 'SND C-Tech = 0,5 (kịch bản)') });
        out.push({ t: 'Tăng tuần hoàn bùn về selector (NO₃ theo dòng bùn được khử bằng rbCOD).', act: P('ct_R', Math.min(1, +(p.ct_R + 0.25).toFixed(2))) });
        out.push({ t: 'Hoặc dùng công nghệ có pha/vùng thiếu khí khuấy trộn.', act: A('bio', 'ICEAS', 'Đổi sang ICEAS (NDN(P))') });
      }
      out.push({ t: 'Giảm NO₃-N mục tiêu thiết kế (nhỏ hơn giới hạn TN − TKN).', act: P('NO3e_des', Math.max(2, p.NO3e_des - 2)) });
    } else if (k === 'NH4' || k === 'TKN') {
      if (srtKey[bio]) out.push({ t: 'Tăng tuổi bùn (SRT) để nitrat hóa ổn định.', why: 'M&E Bảng 8-15', act: P(srtKey[bio], Math.ceil(p[srtKey[bio]] * 1.3)) });
      if (bio === 'ICEAS') out.push(icFM(R, p));
      out.push({ t: 'Tăng DO vùng hiếu khí lên 2,5 mg/L.', act: P('DO', 2.5) });
      out.push({ t: 'Giảm NH₄-N thiết kế ra bể sinh học.', act: P('NH4e_des', Math.max(0.5, p.NH4e_des * 0.7)) });
    } else if (k === 'TP') {
      if (c.chemP !== 'auto') out.push({ t: 'Bật khử P hóa học bổ trợ (PAC/phèn) khi TP vượt giới hạn.', act: A('chemP', 'auto', 'Bật khử P hóa học tự động') });
      if (c.chemPos === 'none') out.push({ t: 'Bố trí cụm hóa lý bậc 3 sau sinh học (khử P bậc 3).', act: A('chemPos', 'post') });
      if (bio !== 'AAO') out.push({ t: 'Dùng A²O để khử P sinh học (EBPR) – giảm hóa chất.', act: A('bio', 'AAO', 'Đổi sang A²O') });
      out.push({ t: 'Tăng tỷ lệ Al:P lên 2,5 – 3,0.', act: P('AlP', 2.5) });
    } else if (k === 'COD' || k === 'BOD') {
      out.push({ t: `${k} ra vượt giới hạn ${fx((over - 1) * 100, 0)} %. Kiểm tra COD trơ (nbsCOD) – nếu COD hòa tan trơ cao, sinh học không giảm được.`, why: 'M&E VD 8-3 bước 1c' });
      if (c.chemPos !== 'post') out.push({ t: 'Bố trí hóa lý bậc 3 sau sinh học.', act: A('chemPos', 'post') });
      if (c.filt === 'none') out.push({ t: 'Bổ sung lọc bậc 3 (lọc đĩa) để giảm phần BOD/COD dạng hạt.', act: A('filt', 'disc') });
      if (bio !== 'MBR') out.push({ t: 'Chuyển sang MBR (nước ra TSS ≈ 1 mg/L).', act: A('bio', 'MBR', 'Đổi sang AO-MBR') });
      if (srtKey[bio]) out.push({ t: 'Tăng SRT để giảm cơ chất hòa tan còn lại.', act: P(srtKey[bio], Math.ceil(p[srtKey[bio]] * 1.3)) });
    } else if (k === 'TSS') {
      if (c.filt === 'none') out.push({ t: 'Bổ sung lọc bậc 3.', act: A('filt', 'disc') });
      if (c.chemPos !== 'post') out.push({ t: 'Bố trí hóa lý bậc 3 sau sinh học.', act: A('chemPos', 'post') });
    } else if (k === 'Coli') {
      out.push({ t: 'Tăng mức giảm coliform thiết kế (tăng liều clo / thời gian tiếp xúc).', act: P('logred', p.logred + 1, 'Mức giảm coliform = ' + (p.logred + 1) + ' log') });
      if (c.disinf === 'naocl') out.push({ t: 'Hoặc dùng UV (không phát sinh DBP).', act: A('disinf', 'uv') });
    } else if (k === 'OG') {
      if (c.grit !== 'aerated') out.push({ t: 'Dùng bể lắng cát thổi khí kết hợp tách dầu.', act: A('grit', 'aerated') });
      out.push({ t: 'Bổ sung tuyển nổi DAF trước sinh học (CEPT) để tách dầu mỡ.', act: { label: 'CEPT + DAF', fn: (S, ai) => { S.alts[ai].c.chemPos = 'pre'; S.alts[ai].c.chemSep = 'daf'; } } });
    }
    return out;
  }

  function forUnit(x, R, S) {
    const c = R.alt.c, p = Object.assign({}, S.p, { autoFit: R.S.p.autoFit }), n = x.name, out = [], bio = c.bio;
    if (/SRT thiết kế ≥ SRT yêu cầu/.test(n) && srtKey[bio]) {
      const req = R.um.bio.ids.SRTreq ? R.um.bio.ids.SRTreq.val : p[srtKey[bio]] * 1.3;
      out.push({ t: `Tăng SRT lên ≥ ${fx(req)} ngày (SRT yêu cầu × 1,1).`, why: 'M&E Bảng 8-15 bước 7', act: P(srtKey[bio], Math.ceil(req * 1.1)) });
      out.push({ t: 'Tăng DO vùng hiếu khí (giảm SRT yêu cầu).', act: P('DO', 2.5) });
    } else if (/MCRT ≥ SRT yêu cầu|SRT hiếu khí ≥ SRT yêu cầu nitrat hóa \(M&E/.test(n)) {
      if (R.icRec && R.icRec.use === 'D' && !R.icRec.needDN) out.push({ t: 'Không có yêu cầu khử nitrat – chu trình NIT sục khí lâu hơn (SRT yêu cầu thấp hơn).', act: A('icCycle', 'NIT', 'Chu trình ICEAS: NIT') });
      if (p.ic_SRT > 0) out.push({ t: 'Đặt SRT ICEAS = 0 để phần mềm tự chọn SRT theo Bước 2 (nitrat hóa ở T_min / f_hk).', act: P('ic_SRT', 0, 'SRT ICEAS = tự chọn') });
      out.push(icFM(R, p));
      out.push({ t: 'Tăng thời gian Air-On mỗi chu kỳ.', act: P('ic_on', p.ic_on + 12) });
    } else if (bio === 'CTECH' && /F\/M của SFC đủ cho SRT/.test(n)) {
      const r = R.um.bio.ids.cmVr ? +R.um.bio.ids.cmVr.val : 1.2;
      out.push({ t: `Giảm F/M thiết kế để thể tích theo F/M đủ cho SRT nitrat hóa (phần mềm hiện lấy V_SRT).`, why: 'M&E 5th mục 8-6', act: P('ct_FM', Math.floor(p.ct_FM / r * 1000) / 1000) });
      out.push({ t: 'Hoặc tăng pha cấp nước + sục khí t_FA (tăng f_sục, giảm SRT yêu cầu).', act: P('ct_TFA', +(p.ct_TFA + 0.25).toFixed(2)) });
    } else if (bio === 'CTECH' && /Y của SFC/.test(n)) {
      const y = R.um.bio.ids.cYme ? +R.um.bio.ids.cYme.val : 0.75;
      out.push({ t: `Đặt Y của SFC bằng Y_obs M&E ${fx(y)} để phần đối chiếu SFC khớp (bùn dư đã tính theo M&E).`, why: 'M&E PT (8-21)', act: P('ct_Y', Math.round(y * 100) / 100) });
    } else if (bio === 'CTECH' && /MLVSS\/MLSS nhập/.test(n)) {
      const f = R.um.bio.ids.cmfv ? +R.um.bio.ids.cmfv.val : 0.75;
      out.push({ t: `Đặt MLVSS/MLSS = ${fx(f)} theo bùn sinh ra M&E.`, why: 'M&E PT (8-20), (8-21)', act: P('ct_VR', Math.round(f * 100) / 100) });
    } else if (bio === 'CTECH' && /Nhu cầu oxy SFC/.test(n)) {
      out.push({ t: 'Giảm tín dụng khử nitrat đồng thời SND của SFC (M&E chỉ tính phần có thời gian thiếu khí).', why: 'M&E VD 8-7 bước 9', act: P('ct_eDN', Math.max(0, +(p.ct_eDN - 0.25).toFixed(2))) });
      out.push({ t: 'Hoặc tăng hệ số kg O₂/kg BOD của SFC.', act: P('ct_kO', +(p.ct_kO + 0.2).toFixed(2)) });
    } else if (bio === 'CTECH' && /Tín dụng bio-P/.test(n)) {
      out.push({ t: 'Bỏ tín dụng bio-P của selector (khử P bằng hóa chất).', why: 'M&E Bảng 8-30', act: P('ct_fP', 0, 'Tín dụng bio-P C-Tech = 0') });
      if (c.chemP !== 'auto') out.push({ t: 'Bật khử P hóa học tự động.', act: A('chemP', 'auto', 'Bật khử P hóa học tự động') });
    } else if (bio === 'CTECH' && /Tỷ lệ gạn ΔH\/TWL ≤ 0,30/.test(n)) {
      out.push({ t: 'Thiết kế theo M&E: giữ TWL tối đa, tăng diện tích bể để phân suất gạn ΔH/TWL ≤ 0,30 (chỉ giảm ΔH thì diện tích tăng, TWL giảm theo – tỷ lệ không cải thiện).', why: 'M&E 5th Bảng 8-17, Hình 8-21', act: P('ct_rDmax', 0.3, 'Phân suất gạn tối đa C-Tech = 0,30') });
    } else if (bio === 'CTECH' && /SRT_M&E ≥ 10/.test(n)) {
      out.push({ t: 'Tăng MLSS thiết kế (tăng khối bùn).', act: P('ct_MLSS', Math.min(5000, p.ct_MLSS + 500)) });
      out.push({ t: 'Giảm F/M (tăng thể tích).', act: P('ct_FM', Math.round(p.ct_FM * 0.8 * 1000) / 1000) });
    } else if (bio === 'CTECH' && /Tải trọng F\/M selector/.test(n)) {
      const fm = R.um.bio.ids.cFMsel ? +R.um.bio.ids.cFMsel.val : 0, hi = fm > p.ct_selFMmax;
      out.push({ t: hi ? 'Selector quá nhỏ so với tải BOD: tăng thời gian lưu selector.' : 'Selector quá lớn (tải thấp, mất tác dụng chọn lọc): giảm thời gian lưu selector.', why: 'M&E 5th mục 8-4', act: P('ct_tsel', hi ? Math.min(60, p.ct_tsel + 10) : Math.max(30, p.ct_tsel - 10)) });
      out.push({ t: 'Hoặc chỉnh tỷ lệ tuần hoàn bùn về selector (thay đổi MLSS selector).', act: P('ct_R', hi ? Math.min(1, +(p.ct_R + 0.1).toFixed(2)) : Math.max(0.15, +(p.ct_R - 0.05).toFixed(2))) });
      out.push({ t: 'Khoảng F/M selector là giá trị tham khảo (WEF/Jenkins) – chỉnh ct_selFMmin / ct_selFMmax theo hồ sơ nhà cung cấp nếu có.' });
    } else if (bio === 'CTECH' && /Mùa mưa/.test(n)) {
      out.push({ t: 'Đặt chu kỳ mùa mưa ngắn hơn (SFC storm mode) – pha F/A mùa mưa.', why: 'BEP SFC', act: P('ct_TFA_s', Math.max(0.5, +((p.ct_TFA_s || p.ct_TFA) - 0.5).toFixed(2))) });
      if (/lưu lượng gạn/.test(n)) out.push({ t: 'Tăng thời gian gạn mùa mưa.', act: P('ct_TD_s', +((p.ct_TD_s || p.ct_TD) + 0.25).toFixed(2)) });
      if (/lắng/.test(n)) out.push({ t: 'Tăng thời gian lắng mùa mưa.', act: P('ct_TS_s', 0.5) });
      if (/ΔH|tỷ lệ gạn/.test(n)) out.push({ t: 'Tăng số bể C-Tech (giảm thể tích cấp mỗi bể).', act: P('ct_N', +p.ct_N + 2) });
      out.push({ t: 'Kiểm tra hệ số cao điểm mùa mưa theo số liệu đo.', act: P('ct_kw', Math.max(1, +(+p.ct_kw || 0).toFixed(2))) });
    } else if (bio === 'CTECH' && /NO₃-N ra ≤ mục tiêu/.test(n)) {
      out.push({ t: 'Tính khử nitrat đồng thời SND trong pha F/A khi có số liệu điều khiển DO thấp (SFC 0,75).', why: 'M&E 5th mục 8-7', act: P('ct_SND', 0.5, 'SND C-Tech = 0,5 (kịch bản)') });
      out.push({ t: 'Tăng tuần hoàn bùn về selector.', act: P('ct_R', Math.min(1, +(p.ct_R + 0.25).toFixed(2))) });
      out.push({ t: 'Tăng MLSS thiết kế (lớp bùn dày hơn, nhiều NO₃ được khử khi lắng) – trong giới hạn tỷ lệ gạn theo SVI.', act: P('ct_MLSS', Math.min(5000, p.ct_MLSS + 250)) });
      out.push({ t: 'Hệ số η (dn_eta) = ' + fx(p.dn_eta) + ' lấy theo ASM1; nếu có thí nghiệm tốc độ khử nitrat (NUR) hoặc số liệu NO₃ vận hành thì hiệu chỉnh theo số liệu (thường 0,6 – 0,8).', act: null });
    } else if (/khử nitrat|vùng thiếu khí/.test(n)) {
      if (c.carbon !== 'auto') out.push({ t: 'Bật bổ sung carbon ngoài tự động.', act: A('carbon', 'auto', 'Bật carbon ngoài tự động') });
      if (bio === 'ICEAS') out.push({ t: 'Tăng thời gian Air-Off.', act: P('ic_off', p.ic_off + 18) });
      if (bio === 'SBR') out.push({ t: 'Kéo dài pha nạp có khuấy.', act: P('sbr_fill', p.sbr_fill + 1) });
      if (bio === 'OD') out.push({ t: 'Tăng phân suất thiếu khí tối đa.', act: P('od_ftk_max', Math.min(0.6, p.od_ftk_max + 0.1)) });
      if (bio === 'AO' || bio === 'AAO') out.push({ t: 'Tăng τ thiếu khí tối đa.', act: P(bio === 'AO' ? 'ao_tanox_max' : 'aao_tanox_max', (bio === 'AO' ? p.ao_tanox_max : p.aao_tanox_max) + 2) });
      if (c.chemPos === 'pre') out.push({ t: 'Chuyển hóa lý ra sau sinh học để giữ carbon.', act: A('chemPos', 'post') });
    } else if (/SOR đỉnh|SLR đỉnh/.test(n)) {
      if (x.uid === 'clar') { out.push({ t: 'Tăng số bể lắng thứ cấp.', act: P('sc_n', p.sc_n + 1) }); out.push({ t: 'Giảm tải trọng bề mặt thiết kế.', act: P('sc_SOR', Math.max(16, p.sc_SOR - 4)) }); out.push({ t: 'Bố trí bể điều hòa để cắt đỉnh lưu lượng.', act: A('eq', 'yes') }); }
      else { out.push({ t: 'Giảm tải trọng bề mặt bể lắng hóa lý.', act: P('sepc_SOR', Math.max(20, p.sepc_SOR - 4)) }); out.push({ t: 'Dùng lắng lamella.', act: A('chemSep', 'lamella') }); }
    } else if (/lưới tinh ≤ 1 mm/.test(n)) out.push({ t: 'Đặt khe lưới tinh 1 mm.', act: P('fs_b', 1) });
    else if (/Phân suất nạp/.test(n)) {
      out.push({ t: 'Giảm phân suất nạp V_F/V_T.', act: P('sbr_VF', 0.2) });
      out.push({ t: 'Tăng số bể SBR.', act: P('sbr_n', p.sbr_n + 2) });
      out.push({ t: 'Bố trí bể điều hòa.', act: A('eq', 'yes') });
    } else if (bio === 'CTECH' && /SRT hiếu khí|nitrat hóa ≤ t_FA|Tuổi bùn ≥ 10|SRT trong khoảng/.test(n)) {
      out.push({ t: 'Giảm F/M (tăng thể tích bể C-Tech).', act: P('ct_FM', Math.round(p.ct_FM * 0.85 * 1000) / 1000) });
      out.push({ t: 'Tăng pha cấp nước + sục khí t_FA (giữ chu kỳ 3 h: giảm pha lắng/gạn).', act: P('ct_TFA', p.ct_TFA + 0.25) });
    } else if (bio === 'CTECH' && /cuốn bùn|Tỷ lệ gạn/.test(n)) {
      out.push({ t: 'Giảm chiều sâu gạn ΔH.', act: P('ct_dH', Math.max(1.2, p.ct_dH - 0.4)) });
      out.push({ t: 'Giảm MLSS thiết kế.', act: P('ct_MLSS', Math.max(3500, p.ct_MLSS - 500)) });
    } else if (bio === 'CTECH' && /số nguyên/.test(n)) {
      out.push({ t: 'Dùng N = 4 bể với t_FA = T_C/2 (chu kỳ chuẩn 1,5 – 0,75 – 0,75 h).', act: P('ct_N', 4) });
    } else if (bio === 'CTECH' && /Selector chiếm|selector/i.test(n)) {
      out.push({ t: 'Điều chỉnh thời gian lưu selector về 55 phút.', act: P('ct_tsel', 55) });
    } else if (DATA.FIXED[bio] && /X_tđ|Tải trọng BOD bề mặt|chiều cao module/.test(n)) {
      const k = DATA.FIXED[bio];
      if (/chiều cao module/.test(n)) out.push({ t: 'Tăng chiều sâu nước ≥ chiều cao module + 0,8 m.', act: P(k + '_H', Math.ceil((p[k + '_modH'] + 0.8) * 2) / 2) });
      else if (/X_tđ/.test(n)) out.push({ t: 'Đưa tỷ lệ chiếm chỗ module về khoảng khuyến cáo.', act: P(k + '_phi', bio === 'ORG' ? 0.55 : 0.52) });
      else { out.push({ t: 'Tăng SRT thiết kế (tăng thể tích & số module).', act: P(k + '_SRT', Math.ceil(p[k + '_SRT'] * 1.25)) }); out.push({ t: 'Tăng tỷ lệ chiếm chỗ module φ.', act: P(k + '_phi', Math.min(0.7, p[k + '_phi'] + 0.1)) }); }
    } else if (/nbsCOD/.test(n)) out.push({ t: 'Bộ tỷ lệ đặc trưng không nhất quán – giảm sCOD/COD hoặc tăng bCOD/BOD theo số liệu phân tích.', act: P('scod_cod', Math.max(0.3, p.scod_cod - 0.05)) });
    else if (/Tự chảy/.test(n)) { out.push({ t: 'Nâng cao độ đáy bể sinh học 0,5 m.', act: P('bio_bot', p.bio_bot + 0.5) }); out.push({ t: 'Hoặc bố trí trạm bơm nước sau xử lý ra nguồn tiếp nhận.' }); }
    else if (/Vận tốc mương/.test(n)) { out.push({ t: 'Chỉnh chiều sâu nước trước song chắn h₁ để v_mương 0,4 – 0,9 m/s (bật quy tắc R08 để phần mềm tự chọn).', act: +p.autoFit === 0 ? AF('bar_h1') : null }); out.push({ t: 'Lưu lượng rất nhỏ: dùng giỏ chắn rác/song chắn trong hố thu thay cho mương, hoặc chấp nhận vận tốc thấp và vệ sinh cặn định kỳ.' }); }
    else if (/Vận tốc/.test(n)) out.push({ t: 'Đổi cỡ ống (DN) tuyến tương ứng ở tab Thủy lực (ô DN để trống = tự chọn theo dải vận tốc).' });
    else if (/Độ kiềm/.test(n)) out.push({ t: 'Phần mềm đã tính liều NaOH bổ sung (xem bảng hóa chất). Hoặc tăng khử nitrat để hoàn trả kiềm.' });
    else if (/Giả định tăng tải TSS/.test(n)) { const r = R.um.dw.ids.ratio; out.push({ t: 'Tăng hệ số tăng tải TSS do nước tách bùn ở bảng hiệu suất.', act: EF('TSS', 'rec', Math.ceil(r ? r.val + 1 : S.eff.TSS.rec + 5)) }); }
    else if (/t = 10 – 20 phút/.test(n)) out.push({ t: 'Điều chỉnh thời gian lưu bể gom về 12 phút.', act: P('sump_t', 12) });
    else if (/L:W ≥ 20/.test(n)) { out.push({ t: 'Giảm bề rộng hành lang bể tiếp xúc (tăng chiều dài dòng chảy) để L:W ≥ 20.', act: P('cl_B', Math.max(0.5, Math.floor(p.cl_B * 0.7 * 20) / 20)) }); if (+p.autoFit === 0) out.push({ t: 'Hoặc bật quy tắc R08 để phần mềm tự chọn bề rộng hành lang.', act: AF('cl_B', 'cl_H') }); }
    else if (/L:W/.test(n)) { out.push({ t: 'Điều chỉnh chiều rộng/chiều sâu bể lắng cát để L:W = 3 – 5, W:H = 1 – 5.', act: P('grit_W', Math.max(1.5, p.grit_W - 0.5)) }); if (+p.autoFit === 0) out.push({ t: 'Hoặc bật quy tắc R08 để phần mềm tự chọn W, H.', act: AF('grit_W', 'grit_H') }); }
    else if (/τ theo Bảng 8-19/.test(n)) {
      const srt = R.um.bio.ids.SRT ? +R.um.bio.ids.SRT.val : p.cas_SRT, req = R.um.bio.ids.SRTreq ? +R.um.bio.ids.SRTreq.val : 0;
      if (/kéo dài/.test(n)) out.push({ t: `Sục khí kéo dài: MLSS đã ở biên 2 000 – 5 000 mg/L. Điều chỉnh SRT (hiện ${fx(srt)} ngày) hoặc chuyển sang mương oxy hóa (OD) – công nghệ sục khí kéo dài điển hình.`, act: A('bio', 'OD', 'Đổi sang mương oxy hóa') });
      else out.push({ t: `CMAS: SRT ${fx(srt)} ngày (yêu cầu ${fx(req)}), MLSS đã ở cận trên 4 000 mg/L mà τ vẫn > 6 h do tải BOD cao – chấp nhận vận hành như sục khí kéo dài, hoặc dùng AO/A²O (có vùng thiếu khí) để tận dụng thể tích.`, act: A('bio', 'AO', 'Đổi sang AO (MLE)') });
    }
    else if (/Bội số tuần hoàn/.test(n)) out.push({ t: 'Tăng vận tốc dòng vòng.', act: P('od_v', 0.35) });
    else if (/BOD\/COD|COD\/TN|EBPR/.test(n)) out.push({ t: 'Đây là nhận xét đặc trưng nước thải – phần mềm đã xử lý bằng carbon ngoài / khử P hóa học tự động nếu bật.' });
    if (!out.length) out.push({ t: 'Xem mục tính toán công trình ' + x.code + ' trong bản tính chi tiết để điều chỉnh thông số.' });
    return out;
  }
  function forInput(x) {
    return [{ t: 'Giải thích sơ bộ: ' + (x.why || '') + '.', why: 'Kiểm tra logic số liệu đầu vào (tab 1)' }, { t: 'Cần kiểm tra: ' + (x.check || '') + '. Sửa số liệu ở tab 1 "Đầu bài" – mục "Kiểm tra sự phù hợp & logic của số liệu đầu vào".' }];
  }
  function suggest(x, R, S) { return x.inp ? forInput(x) : x.code === 'OUT' ? forOut(x, R, S) : forUnit(x, R, S); }
  return { suggest };
})();
