import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const proc = spawn(ELECTRON, ["--remote-debugging-port=9241", "--no-sandbox"], { env, stdio: "ignore" });
let browser;
try {
  let ok = false;
  for (let i = 0; i < 40; i++) { await sleep(500); try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9241", defaultViewport: null }); ok = true; break; } catch {} }
  const page = (await browser.pages())[0];
  const data = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("cbh_"));
    const out = {};
    for (const k of keys) {
      try {
        const v = JSON.parse(localStorage.getItem(k));
        if (Array.isArray(v) && k.includes("orders")) {
          out[k] = { count: v.length, sample: v[0], missingLng: v.filter(o => o.lng === undefined || o.lng === null).length, missingLat: v.filter(o => o.lat === undefined || o.lat === null).length, missingAmount: v.filter(o => o.amount === undefined || o.amount === null).length };
        } else if (Array.isArray(v)) out[k] = { count: v.length, sample: v[0] };
        else out[k] = v;
      } catch { out[k] = localStorage.getItem(k)?.slice(0,100); }
    }
    return out;
  });
  console.log(JSON.stringify(data, null, 2).slice(0, 4000));
} catch (e) { console.log("EXC", String(e).slice(0,200)); }
finally { try { await browser?.disconnect(); } catch {}; try { proc.kill("SIGKILL"); } catch {} }
