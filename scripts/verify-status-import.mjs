// 验证订单模板的"状态"列被正确识别并转换
import xlsx from "xlsx";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
fs.rmSync("scripts/.tmp-status", { recursive: true, force: true });
execSync('npx tsc lib/import-mapper.ts lib/geo-resolve.ts lib/mock-data.ts lib/types.ts lib/store.tsx --outDir scripts/.tmp-status --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --moduleResolution node', { stdio: "pipe" });
const m = require("./.tmp-status/import-mapper.js");
let pass=0,fail=0;const check=(n,ok,d)=>{console.log(`${ok?"✓":"✗"} ${n}${d?" — "+d:""}`);ok?pass++:fail++};

const f = "D:/跨境全链路数据中控台/订单导入模板.xlsx";
const wb = xlsx.readFile(f, { type: "file" });
const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
const headers = rows[0].map(String);
const data = rows.slice(1).map(r=>r.map(v=>String(v??"")));

const r = m.mapRows("orders", headers, data);
check("状态列被识别", r.matched.status === "状态", `映射到=${r.matched.status}`);
check("不再落在未识别列表", !r.unmatched.includes("status"), `unmatched=${r.unmatched.join(",")}`);
const statuses = [...new Set(r.records.map(x=>x.status))];
check("出库完成→已发货", statuses.includes("已发货"), `状态集合=${statuses.join(",")}`);
const validStatuses = ["待发货","已发货","运输中","已签收","退货中","异常"];
check("所有状态值合法（无空值/未识别）", statuses.length>0 && statuses.every(s=>validStatuses.includes(s)), `状态集合=${statuses.join(",")}`);
const rec0 = r.records[0];
check("首条状态正确", rec0.status === "已发货", `状态=${rec0.status}`);

// 其它关键字段仍正确
check("订单ID保留", rec0.id === "7494299193527207475", `id=${rec0.id}`);
check("订单号正确", rec0.orderNo === "WO12139433220", `orderNo=${rec0.orderNo}`);
check("SKU正确", rec0.skuId === "TMY.WG045", `skuId=${rec0.skuId}`);

fs.rmSync("scripts/.tmp-status", { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);process.exit(fail?1:0);
