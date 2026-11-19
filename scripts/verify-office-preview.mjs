// 纯 Node 验证 Office 应用内预览解析：xlsx→HTML 表格、docx→HTML 正文。
// 不依赖 Electron/CDP，可在任意环境稳定运行。
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import os from "node:os";

const require = createRequire(import.meta.url);
const office = require("../electron/office-preview.cjs");
const XLSX = require("xlsx");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
};

console.log("库可用:", JSON.stringify(office.available));

// 1) 生成真实 xlsx（多 sheet + 中文 + 数字 + 特殊字符转义测试）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lv-office-"));
const xlsxPath = path.join(tmp, "螺丝清单.xlsx");
const wb = XLSX.utils.book_new();
const ws1 = XLSX.utils.aoa_to_sheet([
  ["SKU编码", "品名", "数量", "单价"],
  ["M3-001", "螺丝 <M3>", 120, 0.35],
  ["M4-002", "螺母 &垫片", 80, 0.5],
]);
XLSX.utils.book_append_sheet(wb, ws1, "螺丝清单");
const ws2 = XLSX.utils.aoa_to_sheet([["月份", "销售额"], ["1月", 12000], ["2月", 15000]]);
XLSX.utils.book_append_sheet(wb, ws2, "销售汇总");
XLSX.writeFile(wb, xlsxPath);

try {
  const html = office.xlsxToHtml(xlsxPath);
  check("xlsx 返回 HTML 文档", html.includes("<div class=\"doc-preview\">") && html.includes("<style>"));
  check("xlsx 含两个工作表名", html.includes("螺丝清单") && html.includes("销售汇总"));
  check("xlsx 含表格数据", html.includes("M3-001") && html.includes("12000"));
  check("xlsx 特殊字符已转义(不破坏HTML)", html.includes("&lt;M3&gt;") && html.includes("&amp;垫片"), "无原始 <M3>/& 注入");
} catch (e) {
  check("xlsx 解析执行", false, String(e).slice(0, 200));
}

// 2) 用 mammoth 自带的真实 docx 样本验证
const docxCandidates = [
  "node_modules/mammoth/test/test-data/tables.docx",
  "node_modules/mammoth/test/test-data/single-paragraph.docx",
  "node_modules/mammoth/test/test-data/simple-list.docx",
];
const docxPath = docxCandidates.find((p) => fs.existsSync(p));
if (docxPath) {
  try {
    const html = await office.docxToHtml(docxPath);
    check("docx 返回 HTML 文档", html.includes("<div class=\"doc-preview\">") && html.includes("<style>"));
    const bodyHtml = html.replace(/<style>[\s\S]*?<\/style>/, "");
    const text = bodyHtml.replace(/<[^>]+>/g, "").trim();
    check("docx 提取出正文文字", text.length > 10, `正文字符数=${text.length}`);
    if (docxPath.includes("tables")) check("docx 表格被解析", html.includes("<table"));
  } catch (e) {
    check("docx 解析执行", false, String(e).slice(0, 200));
  }
} else {
  check("docx 测试样本存在", false, "未找到 mammoth 测试 docx");
}

// 清理
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

console.log(`结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
