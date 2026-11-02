# ICEAS Design Studio

Công cụ thiết kế bể ICEAS / SBR / C-Tech chạy trên trình duyệt: bản tính và tự giải theo khuyến cáo, thư viện dự án mẫu, đối chiếu MC5, dấu chân cacbon, chọn máy khuấy Flygt, thiết kế cấp khí, bản vẽ PDF/DXF, xuất Excel/Word.

Mở trực tiếp: https://vanducnguyen515-ux.github.io/iceas-design-studio/

Cần kết nối internet để tải font và thư viện xuất PDF/Excel. Dữ liệu nhập lưu trong trình duyệt của từng người dùng (localStorage), không gửi về máy chủ. Kết quả là tính toán sơ bộ, cần kỹ sư kiểm tra trước khi dùng.

## Cấu trúc thư mục

| Thư mục / file | Nội dung |
|---|---|
| `index.html` | Trang web (GitHub Pages) và cũng là file chạy offline – **được sinh ra bởi `src/build.js`, không sửa trực tiếp** |
| `src/` | Mã nguồn: `app_wizard.html` (giao diện, CSS, luồng thiết kế) và các module `*.js` |
| `src/build.js` | Gộp các module vào `app_wizard.html` → `index.html`, `build/ICEAS_Design_Studio/index.html`, `dist/artifact.html` |
| `tests/` | Kiểm tra bằng Node (bộ máy ICEAS, C-Tech, máy khuấy, case studies, Excel) |
| `tools/` | Script phụ trợ: tạo thư viện case study / chu trình Xylem, đọc Excel/Word/PowerPoint, kiểm tra công thức Excel |
| `build/` | Gói cài đặt (CaiDat.cmd + index.html) |
| `ref/` | Dữ liệu trích từ tài liệu gốc (Xylem/Sanitaire, SFC, Flygt) – chỉ lưu trên máy, không đưa lên GitHub |
| `dist/` | File tạm của bản build (không đưa lên GitHub) |

## Module chính (`src/`)

- `engine.js` – bộ máy tính ICEAS / SBR (trình tự ABJ/Xylem); `optimize.js` – tự giải theo khuyến cáo (TCVN 7957, MC5, ABJ)
- `ctech.js`, `ctech_ui.js`, `ctech_draw.js` – phương án C-Tech (BEP SFC, kiểm tra M&E 5th, tự giải, bản vẽ A3)
- `mc5.js` – đối chiếu Metcalf & Eddy 5th; `carbon.js` – dấu chân cacbon Phạm vi 1-2-3
- `mixer.js`, `mixer_draw.js`, `mixer_ui.js` – chọn máy khuấy Flygt; `aeration.js` – tab Cấp khí
- `case_studies.js`, `training_projects.js`, `xylem_cycles.js` – thư viện dự án mẫu và chu trình chuẩn Xylem
- `xlsx_export.js` – xuất Excel công thức sống; `tools.js` – công cụ tính riêng; `i18n.js` – từ điển Việt → Anh

## Làm việc

```bash
npm install        # lần đầu: thư viện exceljs cho các bài kiểm tra
npm run build      # sinh lại index.html sau khi sửa src/
npm test           # kiểm tra C-Tech, máy khuấy, case studies
```

Xem nhanh: `python -m http.server 8803` rồi mở http://localhost:8803/index.html.
