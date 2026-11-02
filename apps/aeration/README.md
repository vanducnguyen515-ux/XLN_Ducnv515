# Aeration Design Tool

Công cụ tính toán lựa chọn hệ thống cấp khí cho trạm xử lý nước thải (XLNT): nhu cầu oxy AOR/SOR, so sánh công nghệ sục khí, bố trí đĩa, đường ống, máy thổi & điện, nhiệt độ khí; xuất Excel sống, báo cáo Word/PDF và bản vẽ PDF/DXF.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `index.html`, `css/`, `js/` | Mã nguồn ứng dụng (chạy trực tiếp trong trình duyệt) |
| `js/engine.js` | Lõi tính toán (chạy được trong Node) |
| `js/db.js`, `js/defaults.js` | Cơ sở dữ liệu kỹ thuật và số liệu mặc định |
| `js/draw.js`, `js/report.js`, `js/xlsx.js`, `js/zip.js` | Bản vẽ SVG/DXF, báo cáo HTML/DOCX, Excel, ZIP |
| `build_1file.py` | Gộp thành một tệp `AerationDesign.html` chạy offline |
| `test/` | Kiểm thử Node (`t_engine.js`, `t_svg.js`, `t_xlsx.js`) |
| `VD_xuat_mau/` | Ví dụ các tệp xuất |

## Sử dụng

```bash
python build_1file.py
```

```bash
cd test && node t_engine.js
```
