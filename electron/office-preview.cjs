// Office 文档应用内预览：Excel(xlsx/xls) → HTML 表格，Word(docx) → HTML。
// 独立成模块，便于主进程使用与纯 Node 回归验证。
// 防御性引入：任一库缺失都不能拖垮主进程（对应格式回退为“暂不支持在线预览”）。
let XLSX = null, mammoth = null;
try { XLSX = require("xlsx"); } catch (e) { console.warn("[office-preview] xlsx 不可用:", String(e).slice(0, 120)); }
try { mammoth = require("mammoth"); } catch (e) { console.warn("[office-preview] mammoth 不可用:", String(e).slice(0, 120)); }

const PREVIEW_STYLE = `<style>
.doc-preview{background:var(--surface,#fff);color:var(--text-2,#1f2937);padding:18px 22px;font-size:13px;line-height:1.65;max-width:1100px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
.doc-preview h1,.doc-preview h2,.doc-preview h3,.doc-preview h4{color:var(--text,#111827);margin:.8em 0 .4em;line-height:1.3}
.doc-preview p{margin:.4em 0}
.doc-preview table{border-collapse:collapse;width:100%;margin:8px 0 18px;font-size:12px}
.doc-preview th,.doc-preview td{border:1px solid var(--border,#d1d5db);padding:5px 8px;text-align:left;vertical-align:top;white-space:pre-wrap;word-break:break-word}
.doc-preview th{background:var(--surface-2,#f3f4f6);font-weight:600;color:var(--text,#111827)}
.doc-preview .rowno{color:var(--text-3,#9ca3af);width:34px;text-align:right;user-select:none}
.doc-preview .sheet-name{font-weight:700;color:var(--brand,#2563eb);margin:16px 0 6px;padding-bottom:5px;border-bottom:2px solid var(--brand,#2563eb)}
.doc-preview img{max-width:100%;height:auto}
.doc-preview .truncated{color:var(--text-3,#9ca3af);font-size:11px;margin:6px 0 14px}
</style>`;

function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Excel → HTML 表格（多工作表，单表最多 1000 行 / 60 列，防止超大文件卡死渲染）
function xlsxToHtml(filePath) {
  if (!XLSX) throw new Error("xlsx 库不可用");
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const MAX_ROWS = 1000, MAX_COLS = 60;
  let html = `<div class="doc-preview">`;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false });
    html += `<div class="sheet-name">📄 ${escHtml(name)}</div><table>`;
    const shown = rows.slice(0, MAX_ROWS);
    shown.forEach((row, ri) => {
      const cells = row.slice(0, MAX_COLS).map((v) => {
        const s = v instanceof Date ? v.toLocaleDateString() : v;
        return ri === 0 ? `<th>${escHtml(s)}</th>` : `<td>${escHtml(s)}</td>`;
      });
      html += `<tr><td class="rowno">${ri + 1}</td>${cells.join("")}</tr>`;
    });
    html += `</table>`;
    if (rows.length > MAX_ROWS) html += `<div class="truncated">（共 ${rows.length} 行，仅预览前 ${MAX_ROWS} 行）</div>`;
    if (rows.some((r) => r.length > MAX_COLS)) html += `<div class="truncated">（部分行超过 ${MAX_COLS} 列，已截断显示）</div>`;
  }
  return PREVIEW_STYLE + html + `</div>`;
}

// Word(docx) → HTML（mammoth 会把文档内图片转成内嵌 data URL，一并显示）
async function docxToHtml(filePath) {
  if (!mammoth) throw new Error("mammoth 库不可用");
  const result = await mammoth.convertToHtml({ path: filePath });
  return PREVIEW_STYLE + `<div class="doc-preview">${result.value || "（文档为空）"}</div>`;
}

module.exports = { xlsxToHtml, docxToHtml, available: { xlsx: !!XLSX, mammoth: !!mammoth } };
