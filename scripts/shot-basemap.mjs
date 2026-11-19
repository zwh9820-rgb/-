import puppeteer from "puppeteer-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=path.resolve("out"); const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".woff2":"font/woff2"};
const s=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(ROOT,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200,{"Content-Type":M[path.extname(f)]||"application/octet-stream"});r.end(d);}})});
await new Promise(r=>s.listen(3000,"127.0.0.1",r));
const b=await puppeteer.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:"new",args:["--no-sandbox","--use-gl=swiftshader"]});
const p=await b.newPage(); await p.setViewport({width:1600,height:1000}); const sl=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto("http://127.0.0.1:3000/",{waitUntil:"domcontentloaded"});await sl(1500);
await p.evaluate(()=>[...document.querySelectorAll("nav button")].find(x=>(x.textContent||"").includes("地图"))?.click());await sl(3000);
// 打开面板并切到影像
await p.evaluate(()=>[...document.querySelectorAll("button")].find(b=>b.title==="底图切换")?.click());await sl(300);
await p.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>(x.textContent||"").trim()==="影像"&&x.querySelector("svg"));if(b)b.click()});
// 等加载完成
for(let i=0;i<80;i++){const l=await p.evaluate(()=>document.querySelector(".maplibregl-map")?.dataset?.basemapLoading);if(l==="0")break;await sl(200);}
await sl(3000);
await p.screenshot({path:"D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/basemap-satellite.png"});
console.log("done", await p.evaluate(()=>document.querySelector(".maplibregl-map")?.dataset?.basemap));
await b.close();s.close();
