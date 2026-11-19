// 验证示例数据：加载后 7 类数据写入正确、各模块可渲染、无控制台错误
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };
const proc = spawn(ELECTRON, ["--remote-debugging-port=9280", "--no-sandbox"], { env, stdio: "ignore" });
let b;
try {
  for (let i = 0; i < 40; i++) { await sleep(500); try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9280", defaultViewport: null }); break; } catch {} }
  if (!b) throw new Error("CDP fail");
  await sleep(4000);
  const page = (await b.pages()).find((p) => p.url().includes("127.0.0.1")) || (await b.pages())[0];
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text().slice(0, 150)); });
  // 清空数据
  await page.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k)); });
  await page.reload({ waitUntil: "domcontentloaded" }); await sleep(2000);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes("数据中心"))?.click());
  await sleep(1200);
  // 点加载示例数据
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("加载示例数据"));
    if (b) { b.click(); return true; } return false;
  });
  check("找到并点击加载示例数据按钮", clicked);
  await sleep(2500);
  // 验证各集合
  const store = await page.evaluate(() => {
    const o = {};
    ["warehouses", "orders", "skus", "inventory", "containers", "priceCards", "alerts"].forEach((k) => {
      try {
        // priceCards 的存储键是全小写 pricecards，其余为驼峰；两种都试
        const raw = localStorage.getItem(`cbh_data_${k}_v1`) ?? localStorage.getItem(`cbh_data_${k.toLowerCase()}_v1`) ?? "[]";
        o[k] = JSON.parse(raw || "[]");
      } catch { o[k] = null; }
    });
    return o;
  });
  check("仓库 3 条", store.warehouses?.length === 3, `实际 ${store.warehouses?.length}`);
  check("SKU 8 条", store.skus?.length === 8, `实际 ${store.skus?.length}`);
  check("订单 120 条", store.orders?.length === 120, `实际 ${store.orders?.length}`);
  check("库存 >20 条", store.inventory?.length > 20, `实际 ${store.inventory?.length}`);
  check("海运 3 条", store.containers?.length === 3, `实际 ${store.containers?.length}`);
  check("价卡 4 条", store.priceCards?.length === 4, `实际 ${store.priceCards?.length}`);
  check("预警 5 条", store.alerts?.length === 5, `实际 ${store.alerts?.length}`);
  // 关联校验：订单 skuId 都能对上 SKU，warehouseId 都能对上仓库
  const skuIds = new Set((store.skus || []).map((s) => s.id));
  const whIds = new Set((store.warehouses || []).map((w) => w.id));
  const badSku = (store.orders || []).filter((o) => !skuIds.has(o.skuId)).length;
  const badWh = (store.orders || []).filter((o) => !whIds.has(o.warehouseId)).length;
  check("订单 SKU 全部关联", badSku === 0, `失联 ${badSku}`);
  check("订单仓库全部关联", badWh === 0, `失联 ${badWh}`);
  // 各模块渲染无错误
  for (const mod of ["dashboard", "globe", "map", "orders", "inventory", "sku", "pricecard", "shipping", "profit", "trend", "turnover", "alerts"]) {
    await page.evaluate((m) => {
      const labels = { dashboard: "经营驾驶舱", globe: "3D 地球", map: "地图下钻", orders: "订单分析", inventory: "海外仓库存", sku: "SKU 区域", pricecard: "价卡", shipping: "海运头程", profit: "利润与费用", trend: "趋势与目标", turnover: "库存周转", alerts: "异常预警" };
      [...document.querySelectorAll("nav button")].find((x) => (x.textContent || "").trim().includes(labels[m]))?.click();
    }, mod);
    await sleep(500);
    const body = await page.evaluate(() => document.body.innerText || "");
    check(`模块渲染: ${mod}`, !body.includes("Application error") && body.length > 50);
  }
  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  // 清空验证
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes("数据中心"))?.click());
  await sleep(1000);
  page.once("dialog", async (d) => { await d.accept(); });
  const clearClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("清空全部数据"));
    if (b) { b.click(); return true; } return false;
  });
  await sleep(1500);
  const after = await page.evaluate(() => {
    const o = {}; ["warehouses", "orders", "skus"].forEach((k) => { o[k] = JSON.parse(localStorage.getItem(`cbh_data_${k}_v1`) || "[]").length; }); return o;
  });
  check("一键清空生效", clearClicked && after.warehouses === 0 && after.orders === 0 && after.skus === 0, JSON.stringify(after));
  await page.evaluate(() => window.close()); await sleep(800);
} catch (e) { check("示例数据验证", false, String(e).slice(0, 300)); }
finally { try { await b?.disconnect(); } catch {}; try { proc.kill("SIGKILL"); } catch {} }
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`); process.exit(fail ? 1 : 0);
