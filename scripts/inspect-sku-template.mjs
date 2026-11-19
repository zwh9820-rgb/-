import xlsx from "xlsx";
const f = "D:/跨境全链路数据中控台/SKU导入模板.xlsx";
const wb = xlsx.readFile(f, { type: "file" });
console.log("Sheets:", wb.SheetNames.join(" | "));
const sn = wb.SheetNames[0];
const rows = xlsx.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
console.log("Sheet:", sn, "| 行数:", rows.length);
console.log("表头:", JSON.stringify(rows[0]));
for (let i = 1; i < Math.min(5, rows.length); i++) console.log(`行${i}:`, JSON.stringify(rows[i]));
