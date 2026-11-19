// 验证：模板导入时用户填的 ID 不被覆盖，且订单/库存的 skuId 能与 SKU 主数据 id 对上
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
fs.rmSync("scripts/.tmp-link", { recursive: true, force: true });
execSync('npx tsc lib/import-mapper.ts lib/geo-resolve.ts lib/mock-data.ts lib/types.ts lib/store.tsx --outDir scripts/.tmp-link --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --moduleResolution node', { stdio: "pipe" });
const m = require("./.tmp-link/import-mapper.js");

let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };

// 系统模板表头（来自 data-schema 的中文 label）
const orderH = ["订单ID", "订单号", "平台", "SKU ID", "数量", "金额", "城市", "州/省", "国家", "国家代码", "日期"];
const orderR = [
  ["order-u001", "SO-1001", "Amazon", "SKU-A1", "2", "99.9", "Los Angeles", "California", "美国", "US", "2026-11-18"],
  ["order-u002", "SO-1002", "eBay", "SKU-B2", "1", "45.0", "Houston", "Texas", "美国", "US", "2026-11-17"],
];
const skuH = ["SKU ID", "SKU 编码", "商品名称", "类目", "售价", "重量(kg)", "采购成本"];
const skuR = [
  ["SKU-A1", "CODE-A1", "无线耳机", "电子", "59.9", "0.5", "20"],
  ["SKU-B2", "CODE-B2", "智能手环", "电子", "89.0", "0.3", "35"],
];
const invH = ["记录ID", "仓库ID", "SKU ID", "可售", "预留", "总库存", "安全库存"];
const invR = [
  ["inv-001", "wh-1", "SKU-A1", "100", "5", "105", "50"],
  ["inv-002", "wh-1", "SKU-B2", "8", "2", "10", "50"],
];

const orders = m.mapRows("orders", orderH, orderR).records;
const skus = m.mapRows("skus", skuH, skuR).records;
const inv = m.mapRows("inventory", invH, invR).records;

// 1. 用户填的 ID 被保留
check("订单ID 使用用户填的值", orders[0].id === "order-u001" && orders[1].id === "order-u002", orders.map(o => o.id).join(","));
check("订单号 使用用户填的值", orders[0].orderNo === "SO-1001", orders[0].orderNo);
check("SKU主数据ID 使用用户填的值", skus[0].id === "SKU-A1" && skus[1].id === "SKU-B2", skus.map(s => s.id).join(","));
check("库存记录ID 使用用户填的值", inv[0].id === "inv-001", inv[0].id);
check("无系统生成ID残留", ![...orders, ...skus, ...inv].some(r => /-(orders|skus|inventory)-\d+-\d+/.test(r.id)));

// 2. SKU 编码正确匹配（不被 SKU ID 抢占）
check("SKU编码列正确匹配", skus[0].sku === "CODE-A1", skus[0].sku);
check("订单SKU ID 使用用户填的值", orders[0].skuId === "SKU-A1", orders[0].skuId);
check("库存SKU ID 使用用户填的值", inv[0].skuId === "SKU-A1", inv[0].skuId);

// 3. 三表关联对上（全应用按 s.id === o.skuId / i.skuId 关联）
const skuIds = new Set(skus.map(s => s.id));
check("订单skuId 能对上SKU主数据id", orders.every(o => skuIds.has(o.skuId)), orders.map(o => o.skuId).join(","));
check("库存skuId 能对上SKU主数据id", inv.every(i => skuIds.has(i.skuId)), inv.map(i => i.skuId).join(","));

// 4. 其他字段无错位
check("州/省正确匹配", orders[0].state === "California", orders[0].state);
check("日期正确匹配", orders[0].date === "2026-11-18", orders[0].date);
check("可售库存正确匹配", inv[0].available === 100, String(inv[0].available));
check("采购成本正确匹配", skus[0].cost === 20, String(skus[0].cost));
check("金额字段未被平台列误占", orders[0].commission === 0, String(orders[0].commission));

// 5. 无 ID 列时合理兜底（真实原生文件场景）
const skuNoId = m.mapRows("skus", ["商品编码", "中文名称", "售价"], [["CODE-X", "测试品", "10"]]).records[0];
const orderNoId = m.mapRows("orders", ["卖家订单号", "商品编码", "平台"], [["SO-X", "CODE-X", "Amazon"]]).records[0];
check("SKU无ID列时用编码兜底", skuNoId.id === "CODE-X", skuNoId.id);
check("订单无ID列时用订单号兜底", orderNoId.id === "SO-X", orderNoId.id);
check("兜底也能三表关联", orderNoId.skuId === skuNoId.id, `${orderNoId.skuId} vs ${skuNoId.id}`);

fs.rmSync("scripts/.tmp-link", { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
