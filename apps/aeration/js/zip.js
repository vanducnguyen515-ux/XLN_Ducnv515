// Bản phát hành v11.00: bộ ghi ZIP/XLSX/DOCX đã được loại bỏ
'use strict';
var ZIP = {
  utf8: function (s) { return new TextEncoder().encode(s); },
  xml: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
  crc: function(){ if (window.__PUB) window.__PUB.toast('Bản phát hành v11.00: chức năng xuất tệp này đã được loại bỏ – chỉ xuất PDF có watermark.'); throw new Error('Bản phát hành: chức năng đã loại bỏ'); }, make: function(){ if (window.__PUB) window.__PUB.toast('Bản phát hành v11.00: chức năng xuất tệp này đã được loại bỏ – chỉ xuất PDF có watermark.'); throw new Error('Bản phát hành: chức năng đã loại bỏ'); }, save: function(){ if (window.__PUB) window.__PUB.toast('Bản phát hành v11.00: chức năng xuất tệp này đã được loại bỏ – chỉ xuất PDF có watermark.'); throw new Error('Bản phát hành: chức năng đã loại bỏ'); }
};
