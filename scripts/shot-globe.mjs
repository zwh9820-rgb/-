import puppeteer from "puppeteer-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=path.resolve("out"); const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".woff2":"font/woff2"};
const s=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(ROOT,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200,{"Content-Type":M[path.extname(f)]||"application/octet-stream"});r.end(d);}})});
await new Promise(r=>s.listen(3000,"127.0.0.1",r));
const b=await puppeteer.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:"new",args:["--no-sandbox","--use-gl=swiftshader"]});
const p=await b.newPage(); await p.setViewport({width:1600,height:1000}); const sl=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto("http://127.0.0.1:3000/",{waitUntil:"domcontentloaded"});await sl(2500);
// 点暂停，截暂停态
await p.evaluate(()=>[...document.querySelectorAll("button")].find(x=>(x.textContent||"").includes("暂停旋转"))?.click());await sl(800);
await p.screenshot({path:"D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/globe-paused.png"});
console.log("done, autoRotate=",await p.evaluate(()=>document.querySelector("[data-auto-rotate]")?.getAttribute("data-auto-rotate")));
await b.close();s.close();
