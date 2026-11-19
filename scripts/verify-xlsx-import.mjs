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

const clickEntity = async (label) => {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes(l) && x.parentElement?.textContent?.includes("条"));
    b?.click();
  }, label);
  await sleep(300);
};
const bodyHas = (t) => page.evaluate((x) => document.body.textContent || "", t).then((s) => s.includes(t));

const FILES = {
  order: "D:/跨境全链路数据中控台/OutboundOrderDetail-19000466-20261118140432/订单出库.xlsx",
  inv: "D:/跨境全链路数据中控台/inventorySellerPortalExport-19000466-20261117173254053/海外仓库存_US仓库级别_20261117173253476.xlsx",
  sku: "D:/跨境全链路数据中控台/ITEM_DATA_OPC_ALL_EXPORT_20261118141404/产品SKU信息.xlsx",
};

try {
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
  await sleep(2000);
  // 清空业务数据
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k)));
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => b.textContent?.includes("数据中心"))?.click());
  await sleep(600);

  // ===== 1. SKU 导入 =====
  await clickEntity("SKU");
  let fi = await page.$('input[type="file"]');
  await fi.uploadFile(FILES.sku);
  await sleep(1500);
  check("SKU xlsx：映射预览弹窗出现", await bodyHas("导入预览"));
  check("SKU xlsx：识别到商品编码/中文名称列", await bodyHas("商品编码") && await bodyHas("中文名称"));
  // 确认追加
  const addBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("追加到现有数据"));
    if (b) { b.click(); return true; } return false;
  });
  await sleep(800);
  check("SKU xlsx：确认导入按钮可点击", addBtn);
  let skuCount = await page.evaluate(() => JSON.parse(localStorage.getItem("cbh_data_skus_v1") || "[]").length);
  check(`SKU xlsx：导入条数=${skuCount}（应为344）`, skuCount === 344);
  let skuSample = await page.evaluate(() => JSON.parse(localStorage.getItem("cbh_data_skus_v1") || "[]")[0]);
  check(`SKU xlsx：字段映射正确（编码=${skuSample?.sku}, 名称=${skuSample?.name?.slice(0,6)}, 重量=${skuSample?.weight}）`, !!skuSample?.sku && !!skuSample?.name && skuSample?.weight > 0);

  // ===== 2. 库存导入 =====
  await clickEntity("库存");
  fi = await page.$('input[type="file"]');
  await fi.uploadFile(FILES.inv);
  await sleep(1500);
  check("库存 xlsx：映射预览出现并检查仓库/商品编号列", await bodyHas("导入预览") && await bodyHas("商品编号"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("追加到现有数据"))?.click());
  await sleep(800);
  let invCount = await page.evaluate(() => JSON.parse(localStorage.getItem("cbh_data_inventory_v1") || "[]").length);
  check(`库存 xlsx：导入条数=${invCount}（应为460）`, invCount === 460);
  let invSample = await page.evaluate(() => JSON.parse(localStorage.getItem("cbh_data_inventory_v1") || "[]")[0]);
  check(`库存 xlsx：字段映射正确（仓库=${invSample?.warehouseId}, 商品=${invSample?.skuId}）`, !!invSample?.warehouseId && !!invSample?.skuId);

  // ===== 3. 订单导入 =====
  await clickEntity("订单");
  fi = await page.$('input[type="file"]');
  await fi.uploadFile(FILES.order);
  await sleep(1800);
  check("订单 xlsx：映射预览出现", await bodyHas("导入预览"));
  check("订单 xlsx：识别卖家订单号/重量列", await bodyHas("卖家订单号") && await bodyHas("重量(kg)"));
  // 检查多工作表切换提示（订单有6个sheet）
  check("订单 xlsx：显示工作表切换", await bodyHas("出库单数据") && await bodyHas("商品信息"));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("追加到现有数据"))?.click());
  await sleep(1000);
  let orderCount = await page.evaluate(() => JSON.parse(localStorage.getItem("cbh_data_orders_v1") || "[]").length);
  check(`订单 xlsx：导入条数=${orderCount}（应为851）`, orderCount === 851);
  let oSample = await page.evaluate(() => JSON.parse(localStorage.getItem("cbh_data_orders_v1") || "[]")[0]);
  check(`订单 xlsx：平台标准化（${oSample?.platform}）`, ["Amazon","eBay","TikTok Shop","Walmart","Temu"].includes(oSample?.platform));
  check(`订单 xlsx：状态映射（${oSample?.status}）`, ["已签收","已发货","运输中","异常","待发货"].includes(oSample?.status));
  // 坐标补全：真实文件有 107 行城市为空，只验证有城市的记录是否补全
  const coord = await page.evaluate(() => {
    const os = JSON.parse(localStorage.getItem("cbh_data_orders_v1") || "[]");
    const withCity = os.filter((o) => o.city);
    const ok = withCity.filter((o) => o.lng && o.lat);
    return { total: os.length, withCity: withCity.length, ok: ok.length, sample: ok[0] };
  });
  check(`订单 xlsx：城市坐标补全（${coord.withCity}条有城市，${coord.ok}条补全；样例 ${coord.sample?.city}=${coord.sample?.lng},${coord.sample?.lat}）`, coord.ok > 0 && coord.ok / coord.withCity > 0.3);

  // 刷新持久化
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(1800);
  const persisted = await page.evaluate(() => ({
    sku: JSON.parse(localStorage.getItem("cbh_data_skus_v1") || "[]").length,
    inv: JSON.parse(localStorage.getItem("cbh_data_inventory_v1") || "[]").length,
    order: JSON.parse(localStorage.getItem("cbh_data_orders_v1") || "[]").length,
  }));
  check(`刷新后持久化（SKU ${persisted.sku}/库存 ${persisted.inv}/订单 ${persisted.order}）`, persisted.sku === 344 && persisted.inv === 460 && persisted.order === 851);

  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => b.textContent?.includes("数据中心"))?.click());
  await sleep(600);
  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/xlsx-import-result.png" });

  check("全程无页面/控制台错误", errors.length === 0);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 6).join(" | "));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 400)); fail++;
} finally { await browser.close(); process.exit(fail ? 1 : 0); }
