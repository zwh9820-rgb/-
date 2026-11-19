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
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text().slice(0, 200)); });

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  // 美国 5 个州：加州最多、德州次之、纽约、佛州、华盛顿；德州下 3 个城市
  const orders = [];
  const mk = (id, cc, country, state, city, lng, lat, n, amount, date) => {
    for (let i = 0; i < n; i++) orders.push({ id: `${id}-${i}`, orderNo: `${id}${i}`, platform: "Amazon", skuId: "s1", qty: 1, amount, weight: 1, status: "已发货", city, state, country, countryCode: cc, lng: lng + i * 0.01, lat: lat + i * 0.01, date, warehouseId: "", returnRisk: 0.1 });
  };
  mk("ca", "US", "美国", "California", "Los Angeles", -118, 34, 100, 60, "2026-11-18");
  mk("tx", "US", "美国", "Texas", "Houston", -95, 30, 80, 60, "2026-11-18");
  mk("tx2", "US", "美国", "Texas", "Dallas", -96.8, 32.8, 50, 60, "2026-11-18");
  mk("tx3", "US", "美国", "Texas", "Austin", -97.7, 30.3, 30, 60, "2026-11-18");
  mk("ny", "US", "美国", "NY", "New York", -74, 40, 40, 60, "2026-11-18");
  mk("fl", "US", "美国", "Florida", "Miami", -80, 25, 25, 60, "2026-11-18");
  mk("wa", "US", "美国", "Washington", "Seattle", -122, 47, 15, 60, "2026-11-18");
  mk("de", "DE", "德国", "", "Berlin", 13, 52, 20, 60, "2026-11-18");
  await page.evaluate((os) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(os));
  }, orders);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2200);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图"))?.click());
  await sleep(3200);
  await page.waitForFunction(() => document.querySelector(".maplibregl-map")?.dataset?.heatOn !== undefined, { timeout: 12000 }).catch(() => {});

  const heat = () => page.evaluate(() => {
    const el = document.querySelector(".maplibregl-map");
    return {
      on: el?.dataset?.heatOn || "", topN: el?.dataset?.heatTopN || "", palette: el?.dataset?.heatPalette || "",
      level: el?.dataset?.heatLevel || "", ranks: el?.dataset?.heatRanks || "", cities: el?.dataset?.heatCities || "",
      cityMarks: document.querySelectorAll(".heat-city-mark").length,
      body: document.body.textContent || "",
    };
  });
  const clickBtn = (text) => page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes(t));
    if (b) { b.click(); return true; } return false;
  }, text);
  const clickRank = (label) => page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(l) && ((x.textContent || "").includes("单") || (x.textContent || "").includes("kg")));
    if (b) { b.click(); return true; } return false;
  }, label);

  let h = await heat();
  check("热度默认开启", h.on === "1", `on=${h.on}`);
  check("默认前 3 名", h.topN === "3", `topN=${h.topN}`);
  check("默认蓝色系", h.palette === "blue", `palette=${h.palette}`);
  check("顶部有热度按钮", h.body.includes("热度"));
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/heat-world.png" });

  // 打开热度配置面板
  await clickBtn("热度"); await sleep(500);
  let body = await page.evaluate(() => document.body.textContent || "");
  check("热度面板可配置前几名(3/5/10)", body.includes("前 3 名") && body.includes("前 5 名") && body.includes("前 10 名"));
  check("热度面板显示依据指标", body.includes("按左侧当前指标"));

  // 点进美国 → 州层 Top 3 排名（软件渲染下 flyTo 较慢，多等以确保动画完成）
  await clickRank("美国"); await sleep(4000);
  h = await heat();
  check("进入国家后层级为 state", h.level === "state", `level=${h.level}`);
  check("州层有 Top N 排名标注", h.ranks.includes(":1") && h.ranks.includes(":2") && h.ranks.includes(":3"), `ranks=${h.ranks}`);
  check("Texas 合计160单排第1", h.ranks.includes("Texas:1"), `ranks=${h.ranks}`);
  check("California 100单排第2", h.ranks.includes("California:2"), `ranks=${h.ranks}`);
  check("Top3 恰好 3 个州", h.ranks.split("|").length === 3, `count=${h.ranks.split("|").length}`);
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/heat-state.png" });

  // 切前 5 名 → 5 个州
  await clickBtn("前 5 名"); await sleep(900);
  h = await heat();
  check("切换到前 5 名", h.topN === "5", `topN=${h.topN}`);
  check("前 5 名覆盖 5 个州", h.ranks.split("|").length === 5, `ranks=${h.ranks}`);

  // 切红色系
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.title === "红" || (x.getAttribute("title") || "").includes("红")); if (b) b.click(); });
  await sleep(700);
  h = await heat();
  check("切换到红色系", h.palette === "red", `palette=${h.palette}`);

  // 点进 Texas 州 → 城市 Top N 标注
  await clickRank("Texas"); await sleep(4000);
  h = await heat();
  check("进入州后层级为 city", h.level === "city", `level=${h.level}`);
  check("城市 Top N 标注已显示", h.cityMarks >= 3, `marks=${h.cityMarks}`);
  check("城市标注包含 Houston/Dallas/Austin", h.cities.includes("Houston") && h.cities.includes("Dallas") && h.cities.includes("Austin"), `cities=${h.cities}`);
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/heat-city.png" });

  // 关闭热度 → 标注消失（此时热度面板仍打开）
  await page.evaluate(() => { const cb = [...document.querySelectorAll("input[type=checkbox]")].find((x) => (x.closest("label")?.textContent || "").includes("开启热度标注")); if (cb) cb.click(); });
  await sleep(900);
  h = await heat();
  check("关闭热度后开关为 0", h.on === "0", `on=${h.on}`);
  check("关闭热度后城市标注消失", h.cityMarks === 0, `marks=${h.cityMarks}`);

  check("全程无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 600)); fail++;
} finally {
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
}
