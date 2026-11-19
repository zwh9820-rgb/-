import puppeteer from "puppeteer-core";
import fs from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? "✓" : "✗"} ${name}`); ok ? pass++ : fail++; };

// 准备 CSV 测试文件（Windows 绝对路径）
const tmp = "C:/Users/24209/AppData/Local/Temp/cbh-dc";
fs.mkdirSync(tmp, { recursive: true });
const whCsv = `${tmp}/warehouses.csv`;
fs.writeFileSync(whCsv, "\uFEFF仓库ID,仓库名称,仓库编码,国家,国家代码,州/省,城市,经度,纬度,总库容,已用库容,库存状态,SKU 数,日均出库\n" +
  "wh-test,测试洛杉矶仓,US-LAX-99,美国,US,加利福尼亚州,洛杉矶,-118.24,34.05,50000,20000,healthy,100,800\n", "utf8");
const orderCsv = `${tmp}/orders.csv`;
fs.writeFileSync(orderCsv, "\uFEFF订单ID,订单号,平台,SKU ID,数量,金额,重量,状态,城市,州/省,国家,国家代码,经度,纬度,日期,履约仓库ID,退货风险(0-1)\n" +
  "o-t1,AMZ001,Amazon,sku-1,2,99.8,0.9,已发货,洛杉矶,加利福尼亚州,美国,US,-118.24,34.05,2026-11-18,wh-test,0.1\n", "utf8");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push("console: " + m.text().slice(0, 150)); });

const gotoModule = async (label) => {
  await page.evaluate((l) => [...document.querySelectorAll("nav button")].find((b) => b.textContent?.includes(l))?.click(), label);
  await sleep(700);
};
const clickText = async (text) => {
  return await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim().includes(t));
    if (b) { b.click(); return true; } return false;
  }, text);
};
const bodyHas = (t) => page.evaluate((x) => document.body.textContent?.includes(x), t);

try {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await sleep(2000);

  // 清空所有业务数据 localStorage，模拟全新用户
  await page.evaluate(() => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2200);

  const lsKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")));
  check("全新状态：无预置业务数据（localStorage 为空）", lsKeys.length === 0);

  // 首页应有"等待你的数据"引导
  check("首页显示空数据引导", await bodyHas("等待你的数据") || await bodyHas("前往数据中心录入"));

  // 进入数据中心
  await gotoModule("数据中心");
  check("数据中心可进入", await bodyHas("所有业务数据由你手动录入"));

  // 订单模块空状态
  await gotoModule("订单分析");
  check("订单模块显示空状态", await bodyHas("暂无订单数据"));
  // 海运空状态
  await gotoModule("海运头程");
  check("海运模块显示空状态", await bodyHas("暂无海运集装箱数据"));
  // 库存空状态
  await gotoModule("海外仓库存");
  check("库存模块显示空状态", await bodyHas("暂无海外仓数据"));
  // 预警空状态
  await gotoModule("异常预警");
  check("预警模块显示空状态", await bodyHas("暂无预警数据"));

  // 回到数据中心，手动新增一个仓库
  await gotoModule("数据中心");
  await clickText("手动录入第一条");
  await sleep(400);
  check("手动录入弹窗打开", await bodyHas("新增海外仓"));
  // 填表：通过 label 顺序找 input
  const filled = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input.field, select.field, textarea.field")];
    const set = (idx, val) => { if (inputs[idx]) { const el = inputs[idx]; const proto = el.tagName === "INPUT" ? HTMLInputElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLTextAreaElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set; setter?.call(el, val); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } };
    // 字段顺序：id,name,code,country,countryCode,state,city,lng,lat,capacity,used,health(select),skuCount,dailyOutbound
    set(0, "wh-manual-1"); set(1, "手动录入仓"); set(2, "US-TEST-01");
    set(3, "美国"); set(4, "US"); set(5, "加州"); set(6, "洛杉矶");
    set(7, "-118.24"); set(8, "34.05"); set(9, "10000"); set(10, "3000");
    set(11, "healthy"); set(12, "50"); set(13, "200");
    return inputs.length;
  });
  await sleep(200);
  await clickText("保存");
  await sleep(700);
  check("手动新增仓库成功（表格出现名称）", await bodyHas("手动录入仓"));

  // CSV 导入仓库（切到 warehouses 仍激活，点导入）
  const fileInput = await page.$('input[type="file"][accept*="csv"]');
  if (fileInput) {
    await fileInput.uploadFile(whCsv);
    await sleep(800);
    check("CSV 导入仓库成功", await bodyHas("成功导入 1 条海外仓数据") || await bodyHas("测试洛杉矶仓"));
  } else check("CSV 导入文件输入框存在", false);

  // 刷新持久化
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
  await gotoModule("数据中心");
  check("刷新后手动录入的仓库仍在", await bodyHas("手动录入仓") && await bodyHas("测试洛杉矶仓"));

  // 切到订单，CSV 导入
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => x.textContent?.includes("订单") && x.parentElement?.textContent?.includes("条"));
    b?.click();
  });
  await sleep(400);
  const fileInput2 = await page.$('input[type="file"][accept*="csv"]');
  if (fileInput2) {
    await fileInput2.uploadFile(orderCsv);
    await sleep(800);
  }
  // 验证订单模块现在有数据
  await gotoModule("订单分析");
  check("导入订单后订单模块显示数据", await bodyHas("AMZ001") || await bodyHas("1 单") || await bodyHas("筛选订单"));

  // 模板下载：回到数据中心点模板，检查触发下载（这里只验证按钮存在且无报错）
  await gotoModule("数据中心");
  check("模板下载按钮存在", await clickText("模板"));

  check("全程无页面/控制台错误", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 5).join(" | "));
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/datacenter-filled.png" });
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 300));
  fail++;
} finally {
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
}
