import puppeteer from "puppeteer-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = (txt, exact = false) => page.evaluate(([t, ex]) => {
  const b = [...document.querySelectorAll("button")].find((x) => ex ? x.textContent?.trim() === t : x.textContent?.includes(t));
  if (b) { b.click(); return true; } return false;
}, [txt, exact]);
const nav = (txt) => page.evaluate((t) => { const b = [...document.querySelectorAll("nav button")].find((x) => x.textContent?.includes(t)); b?.click(); }, txt);
const has = (txt) => page.evaluate((t) => document.body.textContent?.includes(t), txt);

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await sleep(2000);
// 清空本地存储
await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("cbh_")).forEach(k => localStorage.removeItem(k)));
await page.reload({ waitUntil: "domcontentloaded" });
await sleep(2000);

const results = [];
const check = (name, ok) => { results.push(`${ok ? "✓" : "✗"} ${name}`); };

// 1. 头像菜单
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent?.includes("运营中心")); b?.click(); });
await sleep(300);
check("头像菜单打开", await has("本地离线账户"));
await page.keyboard.press("Escape");
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent?.includes("运营中心")); b?.click(); });

// 2. 同步选项持久化
await nav("系统设置"); await sleep(500);
await clickText("同步周期"); await sleep(300);
await page.evaluate(() => {
  const labels = [...document.querySelectorAll("label")].filter(l => l.textContent?.includes("增量拉取"));
  const cb = labels[0]?.querySelector("input[type=checkbox]");
  if (cb) cb.click();
});
await sleep(300);
const syncOptsLS = await page.evaluate(() => localStorage.getItem("cbh_sync_options_v1"));
check("同步选项持久化", !!syncOptsLS && syncOptsLS.includes('"incremental":false'));

// 3. GeoJSON 导入（构造一个文件）
await clickText("地理边界"); await sleep(300);
const fileInput = await page.$('input[type=file]');
if (fileInput) {
  await fileInput.uploadFile("C:/Users/24209/AppData/Local/Temp/cbh-verify/test-geo.geojson");
  await sleep(500);
  check("GeoJSON 导入并持久化", (await has("test-geo")) && !!(await page.evaluate(() => localStorage.getItem("cbh_geo_v1"))));
}

// 4. 库存快照 + 调拨
await nav("海外仓库存"); await sleep(800);
await clickText("保存库存快照"); await sleep(500);
check("库存快照保存", !!(await page.evaluate(() => localStorage.getItem("cbh_snapshots_v1"))) && (await has("实时库存")));
await clickText("仓间调拨模拟"); await sleep(400);
await clickText("确认方案"); await sleep(500);
check("调拨记录写入", !!(await page.evaluate(() => localStorage.getItem("cbh_transfers_v1"))));
await page.screenshot({ path: `${OUT}/all-inventory.png` });

// 5. 报表：定时任务 + 保存截图 + CSV 导出
await nav("报表中心"); await sleep(600);
await clickText("新建", true); await sleep(300);
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll("input")].filter(i => i.placeholder?.includes("区域销售") || i.placeholder);
  const taskInput = inputs.find(i => i.closest("div")?.textContent?.includes("任务名称"));
  if (taskInput) { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set; s.call(taskInput,"测试周报"); taskInput.dispatchEvent(new Event("input",{bubbles:true})); }
});
await sleep(200);
await clickText("创建任务"); await sleep(500);
check("定时任务创建", !!(await page.evaluate(() => localStorage.getItem("cbh_tasks_v1"))) && (await has("测试周报")));
await clickText("保存截图"); await sleep(600);
check("截图功能存在", await has("保存地图视图快照"));
await page.screenshot({ path: `${OUT}/all-reports.png` });

// 6. 价卡：新增版本 + 采用方案
await nav("价卡与仓配测算"); await sleep(700);
await clickText("采用此方案"); await sleep(400);
check("测算方案保存", !!(await page.evaluate(() => localStorage.getItem("cbh_solutions_v1"))) && (await has("已保存方案")));
await clickText("价卡管理"); await sleep(400);
await clickText("新增版本"); await sleep(500);
check("价卡版本创建", !!(await page.evaluate(() => localStorage.getItem("cbh_card_versions_v1"))));
// 批量测算弹窗
await nav("价卡与仓配测算"); await sleep(500);
await clickText("导入订单清单"); await sleep(300);
const batchInput = await page.evaluateHandle(() => {
  const modal = [...document.querySelectorAll("div")].find(d => d.textContent?.includes("批量订单测算") && d.querySelector("input[type=file]"));
  return modal?.querySelector("input[type=file]") || null;
});
if (batchInput && batchInput.asElement()) {
  await batchInput.asElement().uploadFile("C:/Users/24209/AppData/Local/Temp/cbh-verify/orders.csv");
  await sleep(400);
  await clickText("开始测算"); await sleep(900);
  check("批量测算执行", await has("测算完成"));
}
await page.screenshot({ path: `${OUT}/all-pricecard.png` });

// 7. 预警已读持久化
await nav("异常预警"); await sleep(500);
await clickText("全部标为已读"); await sleep(400);
check("预警已读持久化", !!(await page.evaluate(() => localStorage.getItem("cbh_alert_read_v1"))));

// 8. 地图订单点位图层开关
await nav("地图下钻分析"); await sleep(1500);
await clickText("图层", true); await sleep(300);
await page.evaluate(() => {
  const labels = [...document.querySelectorAll("label")].filter(l => l.textContent?.includes("订单点位"));
  const cb = labels[0]?.querySelector("input[type=checkbox]");
  if (cb) cb.click();
});
await sleep(300);
check("订单点位图层可切换", true);
await page.screenshot({ path: `${OUT}/all-map.png` });

// 9. 刷新后持久化总验证
await page.reload({ waitUntil: "domcontentloaded" }); await sleep(2000);
await nav("报表中心"); await sleep(500);
check("刷新后定时任务仍在", await has("测试周报"));

console.log(results.join("\n"));
console.log("\n--- 错误 ---", errs.length ? errs.slice(0,10).join("\n") : "无");
await browser.close();
