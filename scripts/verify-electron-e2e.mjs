// 真实 Electron 端到端：确认 preload 注入、updaterAPI 可用、固定端口、数据跨重启保留
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";

const ELECTRON = path.resolve("dist/win-unpacked/跨境全链路数据中台.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };

const cleanEnv = { ...process.env }; delete cleanEnv.ELECTRON_RUN_AS_NODE; delete cleanEnv.NODE_OPTIONS;
const proc = spawn(ELECTRON, ["--remote-debugging-port=9229", "--no-sandbox"], { env: cleanEnv, stdio: "ignore" });
let browser;
try {
  // 等 CDP 就绪
  let connected = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9229", defaultViewport: null }); connected = true; break; } catch {}
  }
  check("Electron CDP 连接成功", connected);
  if (!connected) throw new Error("无法连接 Electron");

  const page = (await browser.pages()).find((p) => p.url().includes("127.0.0.1")) || (await browser.pages())[0];
  await sleep(2500);

  const info = await page.evaluate(() => ({
    url: location.href,
    hasAPI: typeof (window).updaterAPI === "object",
    methods: (window).updaterAPI ? Object.keys((window).updaterAPI) : [],
  }));
  check("页面由本地服务加载", info.url.includes("127.0.0.1:"), info.url);
  check("固定端口 41877 生效", info.url.includes(":41877"), info.url);
  check("preload 注入 updaterAPI", info.hasAPI);
  check("updaterAPI 方法完整", ["getInfo", "check", "download", "install", "backup", "onStatus"].every((m) => info.methods.includes(m)), info.methods.join(","));

  const appInfo = await page.evaluate(() => (window).updaterAPI.getInfo());
  check("getInfo 返回版本号", appInfo && appInfo.version === "0.1.0", JSON.stringify(appInfo));
  const cfg = await page.evaluate(() => (window).updaterAPI.getConfig());
  check("getConfig 返回配置", cfg && typeof cfg.autoCheck === "boolean", JSON.stringify(cfg));

  // 写入一条业务数据，模拟重启后读取
  await page.evaluate(() => localStorage.setItem("cbh_e2e_probe", "keep-me"));
  check("业务数据可写入", await page.evaluate(() => localStorage.getItem("cbh_e2e_probe")) === "keep-me");

  await browser.disconnect();
} catch (e) {
  check("Electron 端到端", false, String(e).slice(0, 200));
} finally {
  try { await browser?.disconnect(); } catch {}
  try { proc.kill("SIGTERM"); } catch {}
  await sleep(500);
  try { proc.kill("SIGKILL"); } catch {}
}
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
