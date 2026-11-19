import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const proc = spawn(ELECTRON, ["--remote-debugging-port=9242", "--no-sandbox", "--user-data-dir=C:/Users/24209/AppData/Local/Temp/cbh-clean-test"], { env, stdio: "ignore" });
let browser;
try {
  let ok = false;
  for (let i = 0; i < 40; i++) { await sleep(500); try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9242", defaultViewport: null }); ok = true; break; } catch {} }
  const page = (await browser.pages())[0];
  const logs=[]; page.on("pageerror",e=>logs.push("PAGEERR:"+(e.stack||String(e)).slice(0,300))); page.on("console",m=>{if(m.type()==="error")logs.push("CONSOLE:"+m.text().slice(0,300))});
  await page.reload({waitUntil:"domcontentloaded"}).catch(()=>{});
  await sleep(3500);
  const body = await page.evaluate(() => (document.body?.innerText||"").slice(0,150)).catch(()=>"N/A");
  console.log("空数据 BODY:", body.replace(/\n/g," | "));
  console.log("错误数:", logs.length); logs.forEach(l=>console.log(l));
} catch(e){console.log("EXC",String(e).slice(0,200))}
finally { try{await browser?.disconnect()}catch{}; try{proc.kill("SIGKILL")}catch{} }
