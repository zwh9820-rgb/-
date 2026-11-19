// 验证：下钻到城市后，左侧订单明细只包含当前国家/州/城市的订单，
// 不混入其他地区的同名城市订单（groupKey 城市键带 nation|state 限定的回归）。
// 同时验证订单详情弹窗已紧凑化（宽度明显小于旧版 300px）。
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(3000, "127.0.0.1", r));

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const errors = [];
const check = (n, ok, detail) => { console.log(`${ok ? "✓" : "✗"} ${n}${detail ? " — " + detail : ""}`); ok ? pass++ : fail++; };
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const body = () => page.evaluate(() => document.body.textContent || "");
const clickRank = (label) => page.evaluate((lb) => {
  const hit = [...document.querySelectorAll("button")].find((b) => {
    const t = (b.textContent || "").trim();
    return t.includes(lb) && (t.includes("单") || t.includes("kg"));
  });
  if (hit) { hit.click(); return true; }
  return false;
}, label);

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);

  // 三地同名城市 Springfield：CA 3单(ORD0-2)、NY 5单(ORD3-7)、德国 2单(ORD8-9)
  const orders = [];
  let id = 0;
  const add = (cc, country, state, city, n) => {
    for (let i = 0; i < n; i++) {
      orders.push({
        id: `o${id}`, orderNo: `ORD${String(id).padStart(4, "0")}`, platform: "eBay", skuId: "SKU-A",
        qty: 1, amount: 10 + id, weight: 2, status: "已签收", city, state, country, countryCode: cc,
        lng: -118 + (id % 5) * 0.2, lat: 34 + (id % 5) * 0.1, date: `2026-11-${String(5 + i % 20).padStart(2, "0")}`,
        warehouseId: "", returnRisk: 0.1,
      });
      id++;
    }
  };
  add("US", "美国", "CA", "Springfield", 3);
  add("US", "美国", "NY", "Springfield", 5);
  add("DE", "德国", "", "Springfield", 2);
  await page.evaluate((os) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(os));
  }, orders);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图下钻分析"))?.click());
  await sleep(3000);

  check("进入地图世界层", (await body()).includes("国家 / 地区"));

  // 下钻美国 → CA → Springfield
  check("下钻美国", await clickRank("美国")); await sleep(1600);
  let txt = await body();
  check("进入州层(CA/NY)", txt.includes("CA") && txt.includes("NY"));

  // CA 州层可能有多个城市，此时 Springfield 只有一个（CA 的 3 单）
  check("下钻 CA 州", await clickRank("CA")); await sleep(1600);
  txt = await body();
  check("CA 州层出现 Springfield 城市", txt.includes("Springfield"), (txt.match(/Springfield\d+ 单/) || [])[0]);

  check("下钻 Springfield 城市", await clickRank("Springfield")); await sleep(1800);
  txt = await body();
  check("进入订单明细(标题带下钻路径)", txt.includes("订单明细") && txt.includes("美国"), txt.match(/[^\n]*订单明细/)?.[0]?.slice(0, 60));

  // 诊断：dump 左侧看板 topN/level 与所有含 ORD 的元素
  const diag = await page.evaluate(() => {
    const map = document.querySelector(".maplibregl-map");
    const all = [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").includes("ORD"));
    return {
      heatLevel: map?.dataset?.heatLevel || "",
      orderBtns: all.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50)),
      popupText: (document.querySelector(".maplibregl-popup")?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
    };
  });
  console.log("  [诊断] heatLevel=" + diag.heatLevel + " | ORDER按钮=" + JSON.stringify(diag.orderBtns) + " | popup=" + diag.popupText);

  // 收集左侧订单明细里的订单号（只取左侧看板区域内的，排除地图 popup）
  const orderNos = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").match(/ORD\d{4}/));
    return [...new Set(btns.map((b) => (b.textContent || "").match(/ORD\d{4}/)[0]))].sort();
  });
  check("订单明细含 CA 的 3 笔(ORD0000-0002)", ["ORD0000", "ORD0001", "ORD0002"].every((x) => orderNos.includes(x)), orderNos.join(","));
  check("不混入 NY 同名城市订单(ORD0003-0007)", !orderNos.some((x) => ["ORD0003", "ORD0004", "ORD0005", "ORD0006", "ORD0007"].includes(x)), orderNos.join(","));
  check("不混入德国同名城市订单(ORD0008-0009)", !orderNos.some((x) => ["ORD0008", "ORD0009"].includes(x)), orderNos.join(","));
  check("订单明细恰好 3 笔", orderNos.length === 3, `count=${orderNos.length} ${orderNos.join(",")}`);

  // 点击第一笔订单 → 弹窗紧凑（宽度 <= 240px）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("ORD0000"));
    b?.click();
  });
  await sleep(1200);
  const popup = await page.evaluate(() => {
    const pc = document.querySelector(".maplibregl-popup-content");
    const inner = pc?.firstElementChild;
    return { exists: !!pc, width: inner ? inner.getBoundingClientRect().width : 0, text: (pc?.textContent || "").slice(0, 120) };
  });
  check("点击订单弹出详情", popup.exists && popup.text.includes("ORD0000"), popup.text.slice(0, 60));
  check("订单弹窗已紧凑(内容宽<=240px)", popup.width > 0 && popup.width <= 240, `width=${popup.width}px`);

  // 点 X 关闭弹窗 → 触发其他 UI 变化 → 弹窗不应重建（验证 selectedFeature 状态已同步清除）
  await page.evaluate(() => { (document.querySelector(".maplibregl-popup-close-button"))?.click(); });
  await sleep(600);
  const afterClose = await page.evaluate(() => !!document.querySelector(".maplibregl-popup"));
  check("点 X 关闭后弹窗消失", !afterClose);
  // 触发一次无关的 UI 重渲染（开关图层面板）
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "") === "图层控制"); b?.click(); });
  await sleep(700);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("title") || "") === "图层控制"); b?.click(); });
  await sleep(500);
  const afterRerender = await page.evaluate(() => !!document.querySelector(".maplibregl-popup"));
  check("关闭后重渲染不再重建弹窗(无残留)", !afterRerender);

  check("全程无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
} catch (e) {
  check("执行过程无异常", false, String(e).slice(0, 200));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
