import puppeteer from "puppeteer-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
let pass = 0, fail = 0;
const check = (n, ok) => { console.log(`${ok ? "✓" : "✗"} ${n}`); ok ? pass++ : fail++; };
const goto = async (l) => { await page.evaluate((x) => [...document.querySelectorAll("nav button")].find((b) => b.textContent?.includes(x))?.click(), l); await sleep(1200); };
try {
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await sleep(2000);
  // 注入一条仓库 + 一条订单 + 一条海运到 localStorage，重载
  await page.evaluate(() => {
    localStorage.setItem("cbh_data_warehouses_v1", JSON.stringify([
      { id: "wh-x", name: "联动测试仓", code: "US-X", country: "美国", countryCode: "US", state: "加州", city: "洛杉矶", lng: -118.24, lat: 34.05, capacity: 10000, used: 3000, health: "healthy", skuCount: 50, dailyOutbound: 200 },
    ]));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify([
      { id: "o-x", orderNo: "LINK001", platform: "Amazon", skuId: "sku-1", qty: 1, amount: 50, weight: 1, status: "已发货", city: "洛杉矶", state: "加州", country: "美国", countryCode: "US", lng: -118.24, lat: 34.05, date: "2026-11-18", warehouseId: "wh-x", returnRisk: 0.1 },
    ]));
    localStorage.setItem("cbh_data_containers_v1", JSON.stringify([
      { id: "c-x", containerNo: "LINK123", originPort: "上海", originLng: 121.85, originLat: 30.62, destPort: "洛杉矶港", destLng: -118.26, destLat: 33.74, destCountry: "美国", status: "在途", progress: 0.5, etd: "2026-11-01", eta: "2026-11-25", cargoValue: 100000, volume: 40, skuCount: 3, items: [] },
    ]));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2500);

  // v0.1.7 起默认页为驾驶舱，KPI 在 3D 地球页；主动进入后读取
  await goto("3D 地球");
  const kpi = await page.evaluate(() => document.body.textContent || "");
  check("首页 KPI 反映录入数据（累计订单 1）", /累计订单\s*1\s*单/.test(kpi));
  check("首页 KPI 反映录入数据（海外仓 1）", /海外仓\s*1\s*个/.test(kpi));
  check("首页无空数据引导", !kpi.includes("等待你的数据"));

  // 2D 地图：检查 canvas 渲染且无错误
  await goto("地图下钻分析");
  const canvas = await page.evaluate(() => {
    const c = document.querySelector("canvas.maplibregl-canvas");
    return c ? { w: c.width, h: c.height } : null;
  });
  check("2D 地图 canvas 正常渲染", !!canvas && canvas.h > 400);
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/linkage-map.png" });

  // 订单模块联动
  await goto("订单分析");
  check("订单模块显示录入的订单号", (await page.evaluate(() => document.body.textContent || "")).includes("LINK001"));

  // 海运模块联动
  await goto("海运头程");
  check("海运模块显示录入的柜号", (await page.evaluate(() => document.body.textContent || "")).includes("LINK123"));

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300)); fail++;
} finally { await browser.close(); process.exit(fail ? 1 : 0); }
