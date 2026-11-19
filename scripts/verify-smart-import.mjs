// 核心逻辑验证（Node 端）：用真实文件跑 detectEntity + mapRows
import xlsx from "xlsx";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// 用 tsc 把需要的 TS 模块编译成 CommonJS 到临时目录
fs.rmSync("scripts/.tmp-cjs", { recursive: true, force: true });
execSync('npx tsc lib/import-mapper.ts lib/geo-resolve.ts lib/mock-data.ts lib/types.ts lib/store.tsx --outDir scripts/.tmp-cjs --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --moduleResolution node', { stdio: "pipe" });
const mapper = require("./.tmp-cjs/import-mapper.js");
const geo = require("./.tmp-cjs/geo-resolve.js");

let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok?"✓":"✗"} ${n}${d?" — "+d:""}`); ok?pass++:fail++; };

const files = {
  "订单出库": "D:/跨境全链路数据中控台/OutboundOrderDetail-19000466-20261118140432/订单出库.xlsx",
  "库存": "D:/跨境全链路数据中控台/inventorySellerPortalExport-19000466-20261117173254053/海外仓库存_US仓库级别_20261117173253476.xlsx",
  "SKU": "D:/跨境全链路数据中控台/ITEM_DATA_OPC_ALL_EXPORT_20261118141404/产品SKU信息.xlsx",
};
const parsed = {};
for (const [name, path] of Object.entries(files)) {
  const wb = xlsx.readFile(path, { type: "file" });
  const sn = wb.SheetNames[0];
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
  parsed[name] = { headers: rows[0].map(String), rows: rows.slice(1).map(r=>r.map(v=>String(v??""))) };
}

// 1. 自动识别文件类型
const dOrder = mapper.detectEntity(parsed["订单出库"].headers);
const dInv = mapper.detectEntity(parsed["库存"].headers);
const dSku = mapper.detectEntity(parsed["SKU"].headers);
check("订单文件识别为 orders", dOrder[0].entity === "orders", `最佳=${dOrder[0].entity} 分数=${dOrder[0].score}`);
check("库存文件识别为 inventory", dInv[0].entity === "inventory", `最佳=${dInv[0].entity} 分数=${dInv[0].score}`);
check("SKU文件识别为 skus", dSku[0].entity === "skus", `最佳=${dSku[0].entity} 分数=${dSku[0].score}`);

// 2. 订单映射：检查关键字段
const r = mapper.mapRows("orders", parsed["订单出库"].headers, parsed["订单出库"].rows);
check("映射出订单号", !!r.matched.orderNo, `列=${r.matched.orderNo}`);
check("映射出平台", !!r.matched.platform, `列=${r.matched.platform}`);
check("映射出金额", !!r.matched.amount, `列=${r.matched.amount}`);
check("映射出邮编", !!r.matched.zip, `列=${r.matched.zip}`);
check("解析出记录", r.records.length > 800, `${r.records.length} 条`);

// 3. 地理解析：州归一化 + 邮编补全 + 坐标
const recs = r.records;
const withState = recs.filter(x => x.state).length;
const withZip = recs.filter(x => x.zip).length;
const withValidCenter = recs.filter(x => x.lng && x.lat && !(x.lng===0&&x.lat===0)).length;
const stateAbbrSet = new Set(recs.map(x=>x.stateAbbr).filter(Boolean));
check("州用英文全称(GeoJSON可匹配)", recs.some(x=>x.state==="California"||x.state==="Florida"||x.state==="Texas"), `样例=${recs.find(x=>x.state)?.state}`);
check("州缩写已生成", stateAbbrSet.size > 10, `${stateAbbrSet.size} 个州`);
check("邮编补全州生效", recs.filter(x=>x.geoSource?.includes("邮编")).length > 0, `${recs.filter(x=>x.geoSource?.includes("邮编")).length} 条靠邮编补州`);
check("坐标全部有效(无原点)", withValidCenter === recs.length, `${withValidCenter}/${recs.length}`);

// 4. 邮编解析准确性
check("91789 → California", geo.stateFromZip("91789") === "CA", `结果=${geo.stateFromZip("91789")}`);
check("07036 → New Jersey", geo.stateFromZip("07036") === "NJ", `结果=${geo.stateFromZip("07036")}`);
check("33142 → Florida", geo.stateFromZip("33142-3237") === "FL", `结果=${geo.stateFromZip("33142-3237")}`);
check("77041 → Texas", geo.stateFromZip("77041") === "TX", `结果=${geo.stateFromZip("77041")}`);

// 5. 脏州名归一化
check("New Jersey 归一化", geo.normalizeState("New Jersey") === "NJ");
check("FL 归一化", geo.normalizeState("FL") === "FL");
check("California 归一化", geo.normalizeState("California") === "CA");

// 6. 用户覆盖映射
const override = { orderNo: "订单号", amount: "" }; // 改订单号列，忽略金额
const r2 = mapper.mapRows("orders", parsed["订单出库"].headers, parsed["订单出库"].rows.slice(0,5), 1, override);
check("用户覆盖：订单号改用订单号列", r2.matched.orderNo === "订单号", `列=${r2.matched.orderNo}`);
check("用户覆盖：金额被忽略", !r2.matched.amount, `已忽略=${!r2.matched.amount}`);

fs.rmSync("scripts/.tmp-esm", { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
