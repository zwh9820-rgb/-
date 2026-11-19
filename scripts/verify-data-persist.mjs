// 验证业务数据在"重启/更新"后保留：两次启动同一 EXE，检查 localStorage 数据仍在同一 origin
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanEnv = { ...process.env }; delete cleanEnv.ELECTRON_RUN_AS_NODE; delete cleanEnv.NODE_OPTIONS;
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };

async function launch() {
  const proc = spawn(ELECTRON, ["--remote-debugging-port=9231", "--no-sandbox"], { env: cleanEnv, stdio: "ignore" });
  let browser;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9231", defaultViewport: null }); break; } catch {}
  }
  if (!browser) throw new Error("CDP 连接失败");
  return { proc, browser };
}

// 第一次启动：写入模拟业务数据
let s1 = await launch();
await sleep(2000);
const page1 = (await s1.browser.pages()).find((p) => p.url().includes("127.0.0.1")) || (await s1.browser.pages())[0];
const origin1 = await page1.evaluate(() => {
  const orders = [{ id: "persist-o1", orderNo: "PERSIST-001", amount: 123.45 }];
  localStorage.setItem("cbh_data_orders_v1", JSON.stringify(orders));
  localStorage.setItem("cbh_persist_marker", "round1");
  return location.origin;
});
check("首次写入业务数据", true, origin1);
// 正常退出：让 Chromium flush localStorage 到磁盘
await page1.evaluate(() => { try { window.close(); } catch {} });
await sleep(1500);
await s1.browser.disconnect();
try { s1.proc.kill("SIGTERM"); } catch {}
await sleep(600);

// 第二次启动（模拟更新后重启）：读取同一份数据
let s2 = await launch();
await sleep(2000);
const page2 = (await s2.browser.pages()).find((p) => p.url().includes("127.0.0.1")) || (await s2.browser.pages())[0];
const result = await page2.evaluate(() => ({
  origin: location.origin,
  marker: localStorage.getItem("cbh_persist_marker"),
  orders: localStorage.getItem("cbh_data_orders_v1"),
}));
check("重启后 origin 不变（数据不丢的关键）", result.origin === origin1, `${origin1} → ${result.origin}`);
check("重启后业务数据仍在", result.marker === "round1" && (result.orders || "").includes("PERSIST-001"), `marker=${result.marker}`);
// 清理测试数据
await page2.evaluate(() => { localStorage.removeItem("cbh_persist_marker"); localStorage.removeItem("cbh_data_orders_v1"); });

await s2.browser.disconnect();
s2.proc.kill("SIGTERM");
await sleep(800);
try { s2.proc.kill("SIGKILL"); } catch {}
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
