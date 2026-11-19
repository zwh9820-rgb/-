// 精确诊断：数据中心 tab 切换后表格显示的数据是否属于当前选中实体
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve("out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => { if (err) { res.writeHead(404); return res.end("404"); } res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" }); res.end(data); });
});
await new Promise((r) => server.listen(3012, "127.0.0.1", r));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
try {
  await page.goto("http://127.0.0.1:3012/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await page.evaluate(() => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_warehouses_v1", JSON.stringify([
      { id: "WH_MARK_A", name: "仓库甲", code: "WHCODE-A", country: "美国", countryCode: "US", state: "CA", city: "LA", lng: -118, lat: 34, capacity: 100, used: 10, health: "healthy", skuCount: 1, dailyOutbound: 1 },
      { id: "WH_MARK_B", name: "仓库乙", code: "WHCODE-B", country: "德国", countryCode: "DE", state: "", city: "Berlin", lng: 13, lat: 52, capacity: 200, used: 20, health: "healthy", skuCount: 2, dailyOutbound: 2 },
    ]));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify([
      { id: "ORDER_MARK_X", orderNo: "ORD-X", platform: "Amazon", skuId: "SKU_MARK_1", qty: 3, amount: 30, weight: 1, status: "已发货", city: "LA", state: "CA", country: "美国", countryCode: "US", zip: "90001", lng: -118, lat: 34, date: "2026-11-01" },
      { id: "ORDER_MARK_Y", orderNo: "ORD-Y", platform: "eBay", skuId: "SKU_MARK_2", qty: 5, amount: 50, weight: 2, status: "已签收", city: "Berlin", state: "", country: "德国", countryCode: "DE", zip: "10115", lng: 13, lat: 52, date: "2026-11-02" },
    ]));
    localStorage.setItem("cbh_data_skus_v1", JSON.stringify([
      { id: "SKU_MARK_1", sku: "SKU_MARK_1", name: "商品甲", category: "3C", price: 10, cost: 5, weight: 1, image: "📦" },
      { id: "SKU_MARK_2", sku: "SKU_MARK_2", name: "商品乙", category: "家居", price: 20, cost: 8, weight: 2, image: "📦" },
    ]));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(1500);
  // 进入数据中心
  const navOk = await page.evaluate(() => {
    const b = [...document.querySelectorAll("nav button, aside button, button")].find((x) => (x.textContent || "").trim().includes("数据中心"));
    if (b) { b.click(); return true; } return false;
  });
  console.log("进入数据中心:", navOk);
  await sleep(1500);

  const readState = async (label) => {
    const s = await page.evaluate(() => {
      // 数据中心 7 个实体卡片是 button.card，文本形如 "🏭海外仓3 条"
      const cards = [...document.querySelectorAll("button.card")];
      const activeCard = cards.find((c) => (c.className || "").includes("ring-2"))?.textContent?.replace(/\s+/g, " ").trim();
      const sectionTitle = [...document.querySelectorAll("*")].map((e) => e.childNodes.length === 1 ? e.textContent?.trim() : "").find((t) => t && /数据$/.test(t) && (t.includes("海外仓") || t.includes("订单") || t.includes("SKU")));
      const rows = [...document.querySelectorAll("tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim());
      const headers = [...document.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      return { activeCard, sectionTitle, headers, rowCount: rows.length, rows: rows.slice(0, 4) };
    });
    console.log(`\n--- ${label} ---`);
    console.log("选中卡片:", s.activeCard);
    console.log("表格标题:", s.sectionTitle);
    console.log("表头:", s.headers.join(" | "));
    console.log("行数:", s.rowCount);
    s.rows.forEach((r) => console.log("  ", r.slice(0, 150)));
    return s;
  };

  const clickCard = async (label) => {
    const ok = await page.evaluate((lb) => {
      const cards = [...document.querySelectorAll("button.card")];
      const c = cards.find((b) => (b.textContent || "").includes(lb));
      if (c) { c.click(); return true; } return false;
    }, label);
    await sleep(800);
    return ok;
  };

  console.log("卡片按钮数量:", await page.evaluate(() => document.querySelectorAll("button.card").length));
  console.log("点击海外仓:", await clickCard("海外仓")); const a = await readState("1. 海外仓");
  console.log("点击订单:", await clickCard("订单")); const b = await readState("2. 订单");
  console.log("点击SKU:", await clickCard("SKU")); const c = await readState("3. SKU");
  console.log("点击海外仓:", await clickCard("海外仓")); const d = await readState("4. 切回海外仓");
  console.log("点击订单:", await clickCard("订单")); const e = await readState("5. 再切订单");

  const verdict = (s, mark, label) => console.log(`${label}: ${s.rows.some((r) => r.includes(mark)) ? "✓ 正确" : "✗ 错误/串台"}`);
  verdict(a, "WH_MARK", "海外仓"); verdict(b, "ORDER_MARK", "订单"); verdict(c, "SKU_MARK", "SKU");
  verdict(d, "WH_MARK", "切回海外仓"); verdict(e, "ORDER_MARK", "再切订单");
} catch (e) { console.log("EXC", String(e).slice(0, 300)); }
finally { await browser.close(); server.close(); }
