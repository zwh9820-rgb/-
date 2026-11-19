import puppeteer from "puppeteer-core";
import fs from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-gl=swiftshader", "--enable-webgl", "--window-size=1600,1000"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("[pageerror] " + String(e).slice(0, 200)));

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

// 首页 3D 地球
await page.screenshot({ path: `${OUT}/01-globe.png` });
console.log("✓ 首页 3D 地球");

// 侧栏导航项
const navLabels = ["地图下钻分析", "订单分析", "海外仓库存", "海运头程", "SKU 区域分析", "价卡与仓配测算", "报表中心", "异常预警", "系统设置"];
const fileMap = {
  "地图下钻分析": "02-map", "订单分析": "03-orders", "海外仓库存": "04-inventory",
  "海运头程": "05-shipping", "SKU 区域分析": "06-sku", "价卡与仓配测算": "07-pricecard",
  "报表中心": "08-reports", "异常预警": "09-alerts", "系统设置": "10-settings",
};

for (const label of navLabels) {
  try {
    const clicked = await page.evaluate((lbl) => {
      const btns = [...document.querySelectorAll("nav button")];
      const b = btns.find((x) => x.textContent?.trim().includes(lbl));
      if (b) { b.click(); return true; }
      return false;
    }, label);
    if (!clicked) { console.log(`✗ 未找到导航: ${label}`); continue; }
    await new Promise((r) => setTimeout(r, 1800));
    await page.screenshot({ path: `${OUT}/${fileMap[label]}.png` });
    console.log(`✓ ${label}`);
  } catch (e) {
    console.log(`✗ ${label}: ${String(e).slice(0, 120)}`);
  }
}

// 暗色主题测试
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("header button")];
  const themeBtn = btns.find((b) => b.getAttribute("title") === "切换主题");
  if (themeBtn) themeBtn.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/11-dark.png` });
console.log("✓ 暗色主题");

console.log("\n--- 控制台错误 ---");
if (errors.length === 0) console.log("无错误");
else errors.slice(0, 20).forEach((e) => console.log(e));

await browser.close();
