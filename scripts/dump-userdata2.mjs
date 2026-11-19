import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const proc = spawn(ELECTRON, ["--remote-debugging-port=9243", "--no-sandbox"], { env, stdio: "ignore" });
let browser;
try {
  let ok = false;
  for (let i = 0; i < 40; i++) { await sleep(500); try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9243", defaultViewport: null }); ok = true; break; } catch {} }
  const page = (await browser.pages())[0];
  // 即使页面崩了，用 CDP session 在 isolated world 读取 localStorage
  const client = await page.target().createCDPSession();
  const res = await client.send("Runtime.evaluate", {
    expression: `(() => { const o={}; for(const k of Object.keys(localStorage)){ if(!k.startsWith('cbh_'))continue; try{ const v=JSON.parse(localStorage.getItem(k)); if(Array.isArray(v)){ o[k]={n:v.length, sample:v[0], badLng:v.filter(x=>x.lng==null).length, badLat:v.filter(x=>x.lat==null).length, badAmt:v.filter(x=>x.amount==null).length}; } else o[k]=v; }catch(e){o[k]='parse-err'} } return JSON.stringify(o); })()`,
    returnByValue: true,
  });
  console.log((res.result.value || "EMPTY").slice(0, 5000));
} catch(e){console.log("EXC",String(e).slice(0,300))}
finally { try{await browser?.disconnect()}catch{}; try{proc.kill("SIGKILL")}catch{} }
