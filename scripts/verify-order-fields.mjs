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
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

const fields = () => page.evaluate(() => (document.querySelector(".maplibregl-map")?.dataset?.detailFields || "").split("|").filter(Boolean));
// 下钻到城市层看订单明细
const drillToCity = async () => {
  const clickRank = (l) => page.evaluate((lb) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(lb) && ((x.textContent || "").includes("单") || (x.textContent || "").includes("kg")));
    if (b) { b.click(); return true; } return false;
  }, l);
  await clickRank("美国"); await sleep(1800);
  await clickRank("California"); await sleep(1800);
  await clickRank("Los Angeles"); await sleep(1800);
};
// 打开字段面板：已是 toggle，先检测
const openFieldsPanel = () => page.evaluate(() => {
  const open = (document.body.textContent || "").includes("订单明细字段");
  if (!open) [...document.querySelectorAll("button")].find((b) => (b.title || "") === "订单明细字段设置")?.click();
});
const toggleField = (label) => page.evaluate((lb) => {
  const row = [...document.querySelectorAll("div")].find((d) => {
    const t = (d.textContent || "").trim();
    return d.querySelector('input[type="checkbox"]') && (t === lb || (t.startsWith(lb) && t.length < lb.length + 6));
  });
  const cb = row?.querySelector('input[type="checkbox"]');
  if (cb) { cb.click(); return true; } return false;
}, label);

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const orders = [];
  for (let i = 0; i < 3; i++) orders.push({
    id: "o" + i, orderNo: "ORD" + i, platform: "TikTok Shop", skuId: "SKU-" + i,
    qty: 2, amount: 123.45 + i, weight: 2.8, status: "已签收", city: "Los Angeles",
    state: "California", country: "美国", countryCode: "US", lng: -118 + i * 0.01, lat: 34,
    date: "2026-08-24", warehouseId: "LAX仓", returnRisk: 0.1, zip: "90001",
    commission: 10, firstMile: 5, lastMile: 4, returnLoss: 1, otherCost: 2,
  });
  await page.evaluate((os) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem("cbh_order_fields_v1");
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(os));
  }, orders);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2200);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图"))?.click());
  await sleep(3200);
  await page.waitForFunction(() => document.querySelector(".maplibregl-map")?.dataset?.detailFields !== undefined, { timeout: 12000 }).catch(() => {});

  // 默认字段
  let f = await fields();
  check("默认字段为订单号/金额/平台/数量/重量/日期/状态", ["orderNo", "amount", "platform", "qty", "weight", "date", "status"].every((k) => f.includes(k)), f.join(","));

  await drillToCity();
  let body = await page.evaluate(() => document.body.textContent || "");
  check("默认显示订单号", body.includes("ORD0"));
  check("默认显示平台/重量", body.includes("TikTok Shop") && body.includes("2.8"));

  // 打开字段面板，勾选 SKU 与 邮编
  await openFieldsPanel(); await sleep(400);
  check("字段面板含分组标题", (await page.evaluate(() => document.body.textContent || "")).includes("费用"));

  await toggleField("SKU"); await sleep(300);
  await toggleField("邮编"); await sleep(300);
  f = await fields();
  check("勾选后 SKU/邮编加入字段", f.includes("skuId") && f.includes("zip"), f.join(","));
  body = await page.evaluate(() => document.body.textContent || "");
  check("列表出现 SKU 值", body.includes("SKU-0"));
  check("列表出现邮编值", body.includes("90001"));

  // 点订单卡片 → 弹窗显示所选字段
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("ORD0")); if (b) b.click(); });
  await sleep(600);
  // 弹窗在 maplibre popup 容器内
  const popup = await page.evaluate(() => [...document.querySelectorAll(".maplibregl-popup")].map((p) => p.textContent).join(" | "));
  check("弹窗显示订单号", popup.includes("ORD0"), popup.slice(0, 120));
  check("弹窗显示勾选的 SKU/邮编", popup.includes("SKU-0") && popup.includes("90001"), popup.slice(0, 200));

  // 取消金额字段 → 列表不应再显示金额值（123.45）
  await openFieldsPanel(); await sleep(300);
  await toggleField("金额"); await sleep(300);
  f = await fields();
  check("取消后金额移出字段", !f.includes("amount"), f.join(","));
  body = await page.evaluate(() => document.body.textContent || "");
  check("列表不再显示金额值", !body.includes("123.45"), body.includes("123.45") ? "still there" : "gone");

  // 全选
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "全选")?.click());
  await sleep(300);
  f = await fields();
  check("全选后包含费用字段", f.includes("commission") && f.includes("lastMile") && f.length === 20, `count=${f.length}`);

  // 恢复默认
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("恢复默认"))?.click());
  await sleep(300);
  f = await fields();
  check("恢复默认字段", f.length === 7 && f.includes("orderNo") && !f.includes("commission"), f.join(","));

  // 持久化：勾选 SKU 后 reload，仍保留
  await toggleField("SKU"); await sleep(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2200);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图"))?.click());
  await sleep(3000);
  await page.waitForFunction(() => document.querySelector(".maplibregl-map")?.dataset?.detailFields !== undefined, { timeout: 12000 }).catch(() => {});
  f = await fields();
  check("刷新后字段配置持久化", f.includes("skuId"), f.join(","));

  check("全程无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 600)); fail++;
} finally {
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
}
