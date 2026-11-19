import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(3000, "127.0.0.1", r));

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
let pass = 0, fail = 0;
const errors = [];
const check = (n, ok, detail) => { console.log(`${ok ? "✓" : "✗"} ${n}${detail ? " — " + detail : ""}`); ok ? pass++ : fail++; };
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text().slice(0, 200)); });
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) errors.push(`HTTP ${r.status()} ${r.url()}`); });

const nav = async (label) => {
  await page.evaluate((lb) => {
    const b = [...document.querySelectorAll("nav button")].find((x) => (x.textContent || "").includes(lb));
    if (b) b.click();
  }, label);
  await sleep(1400);
};
const body = () => page.evaluate(() => document.body.textContent || "");

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);

  // 注入完整业务数据
  const now = Date.now();
  const orders = [], skus = [], inventory = [], warehouses = [], containers = [];
  const mkSku = (id, name, cost, price) => skus.push({ id, sku: id, name, category: "3C", price, cost, weight: 1, image: "📦" });
  mkSku("sku-1", "无线耳机", 20, 60); mkSku("sku-2", "智能手环", 35, 90); mkSku("sku-3", "充电宝", 15, 45);
  warehouses.push({ id: "wh-1", name: "洛杉矶仓", code: "US-LAX", country: "美国", countryCode: "US", state: "CA", city: "Los Angeles", lng: -118, lat: 34, capacity: 10000, used: 6000, health: "healthy", skuCount: 3, dailyOutbound: 200 });
  const platforms = ["Amazon", "eBay", "TikTok Shop", "独立站"];
  const countries = [["US", "美国", "California", "Los Angeles", -118, 34], ["US", "美国", "Texas", "Houston", -95, 30], ["DE", "德国", "", "Berlin", 13, 52], ["GB", "英国", "", "London", -0.1, 51]];
  let oi = 0;
  for (const month of ["2026-10", "2026-11"]) {
    countries.forEach(([cc, country, state, city, lng, lat], ci) => {
      for (let k = 0; k < 12; k++) {
        const sku = skus[(oi + ci) % 3];
        orders.push({
          id: `o-${oi}`, orderNo: `ORD${String(oi).padStart(5, "0")}`, platform: platforms[oi % 4],
          skuId: sku.id, qty: 2, amount: sku.price * 2, weight: 2, status: "已签收",
          city, state, country, countryCode: cc, lng: lng + (k % 3) * 0.01, lat: lat + (k % 3) * 0.01,
          date: `${month}-${String(5 + (k % 20)).padStart(2, "0")}`, warehouseId: "wh-1", returnRisk: 0.1,
          commission: 5, firstMile: 3, lastMile: 4, returnLoss: 1, otherCost: 0,
        });
        oi++;
      }
    });
  }
  skus.forEach((s, i) => inventory.push({ id: `inv-${i}`, warehouseId: "wh-1", skuId: s.id, available: [10, 500, 200][i], reserved: 2, total: [12, 502, 202][i], safetyStock: 50, ageDays: [30, 100, 20][i] }));
  containers.push({ id: "c-1", containerNo: "MSCU1234567", originPort: "上海港", originLng: 121.8, originLat: 30.6, destPort: "洛杉矶港", destLng: -118.2, destLat: 33.7, destCountry: "美国", status: "在途", progress: 0.6, etd: "2026-11-01", eta: "2026-11-25", cargoValue: 50000, volume: 60, skuCount: 3, items: [{ skuId: "sku-1", qty: 100 }] });
  const alerts = [{ id: "a-1", type: "库存", level: "high", title: "sku-1 库存不足", detail: "可售低于安全库存", time: "今天", module: "inventory", read: false }];

  await page.evaluate((data) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(data.orders));
    localStorage.setItem("cbh_data_skus_v1", JSON.stringify(data.skus));
    localStorage.setItem("cbh_data_inventory_v1", JSON.stringify(data.inventory));
    localStorage.setItem("cbh_data_warehouses_v1", JSON.stringify(data.warehouses));
    localStorage.setItem("cbh_data_containers_v1", JSON.stringify(data.containers));
    localStorage.setItem("cbh_data_alerts_v1", JSON.stringify(data.alerts));
    localStorage.setItem("cbh_cost_rates_v1", JSON.stringify({ commissionRate: 10, firstMileRate: 0, lastMileRate: 0, returnRate: 0, otherRate: 0 }));
    localStorage.setItem("cbh_targets_v1", JSON.stringify({ "2026-11": 5000 }));
  }, { orders, skus, inventory, warehouses, containers, alerts });
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2200);

  // 1. 全部导航项可点击、无报错
  const modules = ["经营驾驶舱", "3D 地球概览", "地图下钻分析", "订单分析", "趋势与目标", "利润与费用", "海外仓库存", "库存周转补货", "海运头程", "SKU 区域分析", "价卡与仓配测算", "报表中心", "异常预警", "数据中心", "系统设置"];
  let navOk = 0;
  for (const m of modules) {
    const before = errors.length;
    await nav(m);
    const txt = await body();
    const ok = errors.length === before && txt.length > 200;
    if (ok) navOk++;
    else console.log(`   -> 模块 ${m} 有异常`);
  }
  check(`15 个导航模块均可正常打开（${navOk}/15）`, navOk === 15);

  // 2. 驾驶舱 KPI
  await nav("经营驾驶舱");
  const dash = await body();
  check("驾驶舱显示销售总额/毛利/在途货柜", dash.includes("销售总额") && dash.includes("毛利") && dash.includes("在途货柜"));
  check("驾驶舱显示国家排行与库存风险", dash.includes("国家销售排行") && dash.includes("库存风险"));

  // 3. 利润核算
  await nav("利润与费用");
  const prof = await body();
  check("利润模块显示毛利/毛利率/成本构成", prof.includes("毛利") && prof.includes("毛利率") && prof.includes("成本构成"));
  check("利润明细标注费用来源", prof.includes("费用来源") || prof.includes("实际") || prof.includes("含估算"));
  const profitNum = await page.evaluate(() => document.body.textContent.match(/毛利率([\d.]+)%/)?.[1]);
  check("利润数值真实计算得出", profitNum !== undefined && parseFloat(profitNum) > 0, `毛利率 ${profitNum}%`);

  // 4. 库存周转
  await nav("库存周转补货");
  const turn = await body();
  check("周转模块显示可售天数/建议补货", turn.includes("可售天数") && turn.includes("建议补货"));
  check("识别出断货风险 SKU", turn.includes("断货风险"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "断货风险")?.click());
  await sleep(500);
  check("断货风险筛选可用", (await body()).includes("sku-1") || (await body()).includes("无线耳机"));

  // 5. 趋势与目标
  await nav("趋势与目标");
  const trend = await body();
  check("趋势模块显示平台占比/月度目标", trend.includes("平台销售占比") && trend.includes("月度目标"));
  check("月度目标完成度已计算", trend.includes("2026-11") && trend.includes("%"));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "日");
    if (b) b.click();
  });
  await sleep(500);
  check("日/周/月切换可用", (await body()).includes("销售趋势"));

  // 6. 地图下钻（回归上轮改造）
  await nav("地图下钻分析");
  const map = await body();
  check("地图仍显示月份筛选与区域数据栏", map.includes("统计月份") && map.includes("区域数据看板"));

  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/full-app-dashboard.png" });
  check("全程无页面/控制台错误", errors.length === 0, errors.length ? errors.slice(0, 4).join(" | ") : "");

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 600)); fail++;
} finally {
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
