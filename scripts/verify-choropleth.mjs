import puppeteer from "puppeteer-core";
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
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1800);
  // 注入多国多州订单：美国(CA/TX/NY/FL)、德国、英国、日本
  const orders = [];
  const mk = (id, cc, country, state, city, lng, lat, n) => {
    for (let i = 0; i < n; i++) orders.push({ id: `${id}-${i}`, orderNo: `${id}${i}`, platform: "Amazon", skuId: "s1", qty: 1, amount: 50, weight: 1, status: "已发货", city, state, country, countryCode: cc, lng: lng + i * 0.01, lat: lat + i * 0.01, date: "2026-11-18", warehouseId: "", returnRisk: 0.1 });
  };
  mk("us-ca", "US", "美国", "California", "Los Angeles", -118, 34, 120);
  mk("us-tx", "US", "美国", "Texas", "Houston", -95, 30, 45);
  mk("us-ny", "US", "美国", "NY", "New York", -74, 40, 30);
  mk("us-fl", "US", "美国", "Florida", "Miami", -80, 25, 12);
  mk("de", "DE", "德国", "", "Berlin", 13, 52, 20);
  mk("gb", "GB", "英国", "", "London", -0.1, 51, 9);
  mk("jp", "JP", "日本", "", "Tokyo", 139, 35, 5);
  await page.evaluate((os) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(os));
  }, orders);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2500);
  // 进入地图
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => b.textContent?.includes("地图下钻分析"))?.click());
  await sleep(3000);

  // 世界视角：国家 fill 图层可见、数字标签存在、订单点位默认隐藏
  const world = await page.evaluate(() => {
    const ml = document.querySelector(".maplibregl-map");
    return {
      labels: document.querySelectorAll(".choro-label").length,
      labelTexts: [...document.querySelectorAll(".choro-label")].slice(0, 10).map((e) => e.textContent),
      map: !!ml,
    };
  });
  check(`世界视角：数字标签出现（${world.labels} 个：${world.labelTexts.join(",")}）`, world.labels >= 4);
  check("世界视角：地图实例存在", world.map);
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/choro-world.png" });

  // 检查 country-fill 有非空数据（通过 maplibre 内部不便，改用点击国家验证下钻）
  // 点击美国附近（用左侧下钻列表更稳）
  const drilled = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("美国"));
    if (b) { b.click(); return true; } return false;
  });
  await sleep(2500);
  check("下钻美国：左侧列表有美国", drilled);
  const stateView = await page.evaluate(() => ({
    labels: document.querySelectorAll(".choro-label").length,
    texts: [...document.querySelectorAll(".choro-label")].slice(0, 12).map((e) => e.textContent),
    body: document.body.textContent || "",
  }));
  check(`下钻美国：州数字标签出现（${stateView.labels} 个：${stateView.texts.join(",")}）`, stateView.labels >= 3);
  check("下钻美国：显示州层级列表（California/Texas 等）", stateView.body.includes("California") || stateView.body.includes("Texas"));
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/choro-state.png" });

  check("全程无页面/控制台错误", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 6).join(" | "));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 400)); fail++;
} finally { await browser.close(); process.exit(fail ? 1 : 0); }
