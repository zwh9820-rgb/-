// 数据体检：错位数据检测规则验证 + 阈值边界
import { diagnoseData } from "../lib/data-doctor.ts";
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };
const empty = { warehouses: [], orders: [], skus: [], inventory: [], containers: [], priceCards: [], alerts: [] };

// 1. 干净数据：无告警
const clean = { ...empty,
  warehouses: [{ id: "wh-la", name: "洛杉矶仓", code: "US-LAX-01", country: "美国", lng: -118, lat: 34 }],
  orders: [{ id: "o1", orderNo: "ORD001", platform: "Amazon", amount: 30 }],
};
check("干净数据无告警", diagnoseData(clean).length === 0);

// 2. 订单错位进仓库（截图场景：平台名/超长订单号/SKU编码）
const dirty = { ...empty,
  warehouses: [
    { id: "7494299193527207475", name: "WO12139433220", code: "TikTok Shop", country: "TMY.WG045", lng: 0, lat: 0 },
    { id: "7494213652550289124", name: "WO12144971503", code: "TikTok Shop", country: "TMY.WG044-1", lng: 0, lat: 0 },
  ],
};
const d = diagnoseData(dirty);
check("订单错位进仓库被检测", d.length === 1 && d[0].entity === "warehouses" && d[0].count === 2, JSON.stringify(d));
check("给出修复建议", /重新导入|智能导入/.test(d[0]?.suggestion || ""));

// 3. 只是平台名出现在仓库编码
const p = diagnoseData({ ...empty, warehouses: [{ id: "wh1", name: "美西仓", code: "Amazon FBA 仓", country: "美国" }] });
check("平台名出现在仓库编码被检测", p.length === 1 && p[0].count === 1);

// 4. 正常仓库不被误报
const ok = diagnoseData({ ...empty, warehouses: [
  { id: "wh1", name: "美西仓", code: "USWC5", country: "美国", lng: -117, lat: 34 },
  { id: "wh2", name: "德国仓", code: "DE-HH", country: "德国", lng: 10, lat: 53 },
] });
check("正常仓库不误报", ok.length === 0);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`); process.exit(fail ? 1 : 0);
