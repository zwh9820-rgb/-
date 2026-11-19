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
const check = (n, ok) => { console.log(`${ok ? "✓" : "✗"} ${n}`); ok ? pass++ : fail++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text().slice(0, 200)); });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const orders = [];
  const mk = (id, cc, country, state, city, lng, lat, n, date) => {
    for (let i = 0; i < n; i++) orders.push({ id: `${id}-${i}`, orderNo: `${id}${i}`, platform: "Amazon", skuId: "s1", qty: 1, amount: 50, weight: 1, status: "已发货", city, state, country, countryCode: cc, lng: lng + i * 0.01, lat: lat + i * 0.01, date, warehouseId: "", returnRisk: 0.1 });
  };
  mk("us-ca", "US", "美国", "California", "Los Angeles", -118, 34, 120, "2026-11-18");
  mk("us-tx", "US", "美国", "Texas", "Houston", -95, 30, 45, "2026-11-18");
  mk("us-ny", "US", "美国", "NY", "New York", -74, 40, 30, "2026-11-18");
  mk("de", "DE", "德国", "", "Berlin", 13, 52, 20, "2026-11-18");
  mk("gb", "GB", "英国", "", "London", -0.1, 51, 9, "2026-11-18");
  mk("jp", "JP", "日本", "", "Tokyo", 139, 35, 5, "2026-11-18");
  mk("us-oct", "US", "美国", "California", "Los Angeles", -118, 34, 50, "2026-10-05");
  mk("de-oct", "DE", "德国", "", "Berlin", 13, 52, 10, "2026-10-05");
  await page.evaluate((os) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(os));
  }, orders);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2200);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图"))?.click());
  await sleep(3200);

  const base = await page.evaluate(() => ({
    body: document.body.textContent || "",
    labels: document.querySelectorAll(".choro-label").length,
    markers: document.querySelectorAll(".maplibregl-marker").length,
    map: !!document.querySelector(".maplibregl-map"),
  }));
  check("地图实例存在", base.map);
  check("左侧数据栏标题存在", base.body.includes("区域数据看板"));
  check("月份筛选显示 2026-11 / 2026-10", base.body.includes("2026-11") && base.body.includes("2026-10"));
  check("默认全部：总订单 289", base.body.includes("289"));
  check("排行榜显示国家（美国/德国/英国/日本）", ["美国", "德国", "英国", "日本"].every((c) => base.body.includes(c)));
  check("已移除满屏数字标签（choro-label = 0）", base.labels === 0);
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/region-world.png" });

  // 切换月份 2026-10 → KPI 应变为 60
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "2026-10");
    if (b) b.click();
  });
  await sleep(1200);
  const oct = await page.evaluate(() => document.body.textContent || "");
  check("切换 2026-10：总订单变为 60", oct.includes("60"));
  check("切换 2026-10：仍显示美国/德国", oct.includes("美国") && oct.includes("德国"));

  // 切回全部，点击排行榜美国行 → 详情卡 + 气泡
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "全部");
    if (b) b.click();
  });
  await sleep(800);
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => (x.textContent || "").includes("美国") && (x.textContent || "").includes("单"));
    if (!b) return false;
    b.click(); return true;
  });
  await sleep(1800);
  const sel = await page.evaluate(() => ({
    body: document.body.textContent || "",
    markers: document.querySelectorAll(".maplibregl-marker").length,
    markerText: [...document.querySelectorAll(".maplibregl-marker")].map((e) => e.textContent).join(" | "),
  }));
  check("点击排行榜美国行成功", clicked);
  check("左侧详情显示选中区域订单与销售额", sel.body.includes("覆盖城市") && sel.body.includes("销售额"));
  check("地图出现唯一信息气泡（含订单数/销售额）", sel.markers >= 1 && /\d+\s*单/.test(sel.markerText) && /\$/.test(sel.markerText));

  // 下钻到州层：排行榜应显示 California / Texas
  await sleep(600);
  const stateClicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => (x.textContent || "").includes("Texas"));
    if (!b) return false; b.click(); return true;
  });
  await sleep(1800);
  const st = await page.evaluate(() => document.body.textContent || "");
  check("下钻州层：点击 Texas 成功", stateClicked);
  check("下钻州层：显示州/城市信息", st.includes("Texas") || st.includes("Houston"));

  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/region-dashboard.png" });
  check("全程无页面/控制台错误", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 6).join(" | "));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 500)); fail++;
} finally {
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
