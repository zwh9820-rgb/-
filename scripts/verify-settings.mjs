import puppeteer from "puppeteer-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 2000));
// 清空本地数据，从头测试
await page.evaluate(() => { Object.keys(localStorage).filter(k => k.startsWith("cbh_")).forEach(k => localStorage.removeItem(k)); });
await page.reload({ waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 2000));

// 进入系统设置
await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent?.includes("系统设置"))?.click());
await new Promise((r) => setTimeout(r, 800));

// === 测试1：仓库编辑 ===
await page.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent?.trim() === "海外仓信息")?.click());
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${OUT}/settings-warehouse-before.png` });
// 点第一个"编辑"
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => x.textContent?.trim() === "编辑");
  b?.click();
});
await new Promise((r) => setTimeout(r, 500));
const dialogOpen = await page.evaluate(() => !!document.body.textContent?.includes("编辑仓库"));
console.log("仓库编辑弹窗打开:", dialogOpen);
await page.screenshot({ path: `${OUT}/settings-warehouse-edit.png` });
// 修改名称字段（第一个 text input 是仓库名称）
await page.evaluate(() => {
  const dlg = [...document.querySelectorAll("div")].find(d => d.className?.includes?.("rounded-2xl") && d.textContent?.includes("编辑仓库"));
  const inputs = dlg?.querySelectorAll("input[type='text']") || [];
  if (inputs[0]) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(inputs[0], "测试仓库-已编辑");
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
  }
});
await new Promise((r) => setTimeout(r, 300));
// 保存
await page.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent?.includes("保存仓库"))?.click());
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/settings-warehouse-after.png` });
const tableHasNew = await page.evaluate(() => document.body.textContent?.includes("测试仓库-已编辑"));
console.log("表格显示新名称:", tableHasNew);
// 检查 localStorage
const ls = await page.evaluate(() => localStorage.getItem("cbh_warehouses_v1"));
console.log("localStorage 已写入:", !!ls, ls?.includes("测试仓库-已编辑"));

// === 测试2：联动到库存看板 ===
await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent?.includes("海外仓库存"))?.click());
await new Promise((r) => setTimeout(r, 1000));
const inventoryHasNew = await page.evaluate(() => document.body.textContent?.includes("测试仓库-已编辑"));
console.log("库存看板联动显示新名称:", inventoryHasNew);
await page.screenshot({ path: `${OUT}/settings-link-inventory.png` });

// === 测试3：API 配置加密保存 ===
await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent?.includes("系统设置"))?.click());
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent?.trim() === "API 密钥")?.click());
await new Promise((r) => setTimeout(r, 500));
// 点 eBay 的配置
await page.evaluate(() => {
  const rows = [...document.querySelectorAll("div")].filter(d => d.textContent?.includes("eBay API") && d.querySelector("button"));
  const cfg = rows.reverse().find(r => [...r.querySelectorAll("button")].some(b => b.textContent?.includes("配置")));
  const b = cfg ? [...cfg.querySelectorAll("button")].find(b => b.textContent?.includes("配置")) : null;
  b?.click();
});
await new Promise((r) => setTimeout(r, 500));
const apiDialogOpen = await page.evaluate(() => document.body.textContent?.includes("App Key") && document.body.textContent?.includes("保存配置"));
console.log("API 配置弹窗打开:", apiDialogOpen);
await page.screenshot({ path: `${OUT}/settings-api-edit.png` });
// 填 key/secret
await page.evaluate(() => {
  const dlg = [...document.querySelectorAll("div")].find(d => d.className?.includes?.("rounded-2xl") && d.textContent?.includes("App Key"));
  const inputs = dlg?.querySelectorAll("input") || [];
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  if (inputs[2]) { setter.call(inputs[2], "test_app_key_12345"); inputs[2].dispatchEvent(new Event("input", { bubbles: true })); }
  if (inputs[3]) { setter.call(inputs[3], "test_secret_abcdefg"); inputs[3].dispatchEvent(new Event("input", { bubbles: true })); }
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent?.includes("保存配置"))?.click());
await new Promise((r) => setTimeout(r, 1200));
const apiLS = await page.evaluate(() => localStorage.getItem("cbh_api_configs_v1"));
console.log("API 配置已加密存储:", !!apiLS, apiLS?.includes("AES:"), "明文未泄漏:", !apiLS?.includes("test_app_key_12345"));
await page.screenshot({ path: `${OUT}/settings-api-after.png` });

// 刷新持久化验证
await page.reload({ waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => [...document.querySelectorAll("nav button")].find(x => x.textContent?.includes("系统设置"))?.click());
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => [...document.querySelectorAll("button")].find(x => x.textContent?.trim() === "海外仓信息")?.click());
await new Promise((r) => setTimeout(r, 400));
const persisted = await page.evaluate(() => document.body.textContent?.includes("测试仓库-已编辑"));
console.log("刷新后仓库修改持久化:", persisted);

console.log("\n--- 错误 ---", errs.length ? errs.join("\n") : "无");
await browser.close();
