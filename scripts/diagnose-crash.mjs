import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const proc = spawn(ELECTRON, ["--remote-debugging-port=9240", "--no-sandbox"], { env, stdio: "ignore" });
let browser;
try {
  let ok = false;
  for (let i = 0; i < 40; i++) { await sleep(500); try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9240", defaultViewport: null }); ok = true; break; } catch {} }
  console.log("CDP:", ok);
  const page = (await browser.pages())[0];
  const logs = [];
  page.on("pageerror", (e) => logs.push("PAGEERROR: " + (e.stack || String(e))));
  page.on("console", (m) => { if (m.type() === "error") logs.push("CONSOLE: " + m.text().slice(0, 500)); });
  page.on("requestfailed", (r) => logs.push("REQFAIL: " + r.url().slice(0, 150) + " " + r.failure()?.errorText));
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(4000);
  const body = await page.evaluate(() => (document.body?.innerText || "").slice(0, 300)).catch(() => "N/A");
  console.log("BODY:", body.replace(/\n/g, " | "));
  console.log("=== ERRORS ===");
  logs.forEach((l) => console.log(l));
} catch (e) { console.log("EXCEPTION:", String(e).slice(0, 300)); }
finally { try { await browser?.disconnect(); } catch {}; try { proc.kill("SIGKILL"); } catch {} }
