import puppeteer from "puppeteer-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve("out");
const M = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".woff2":"font/woff2" };
const server = http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(ROOT,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200,{"Content-Type":M[path.extname(f)]||"application/octet-stream"});r.end(d);}})});
await new Promise(r=>server.listen(3000,"127.0.0.1",r));
const browser = await puppeteer.launch({ executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe", headless:"new", args:["--no-sandbox","--use-gl=swiftshader"] });
const page = await browser.newPage(); await page.setViewport({width:1600,height:1000});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const errors=[];
const check=(n,ok,d)=>{console.log(`${ok?"✓":"✗"} ${n}${d?" — "+d:""}`);ok?pass++:fail++;};
page.on("pageerror",e=>errors.push(String(e).slice(0,200)));
const hl=()=>page.evaluate(()=>{const el=document.querySelector(".maplibregl-map");return {c:el?.dataset?.highlightCountry||"",s:el?.dataset?.highlightState||""};});
const clickRank=lb=>page.evaluate(l=>{const h=[...document.querySelectorAll("button")].find(b=>{const t=(b.textContent||"").trim();return t.includes(l)&&(t.includes("单")||t.includes("kg"))});if(h){h.click();return true}return false},lb);

try{
  await page.goto("http://127.0.0.1:3000/",{waitUntil:"domcontentloaded"});await sleep(1400);
  const od=[];let id=0;
  const add=(cc,co,st,ci,n)=>{for(let i=0;i<n;i++)od.push({id:"o"+id,orderNo:"ORD"+id,platform:"Amazon",skuId:"s1",qty:2,amount:50,weight:1,status:"已签收",city:ci,state:st,country:co,countryCode:cc,lng:-118,lat:34,date:"2026-11-10",warehouseId:"",returnRisk:.1,stateAbbr:""});id++};
  add("US","美国","California","Los Angeles",10); add("US","美国","Texas","Houston",8); add("DE","德国","","Berlin",6);
  await page.evaluate(os=>{Object.keys(localStorage).filter(k=>k.startsWith("cbh_")).forEach(k=>localStorage.removeItem(k));localStorage.setItem("cbh_data_orders_v1",JSON.stringify(os));},od);
  await page.reload({waitUntil:"domcontentloaded"});await sleep(2000);
  await page.evaluate(()=>[...document.querySelectorAll("nav button")].find(b=>(b.textContent||"").includes("地图下钻分析"))?.click());await sleep(3000);
  // 等地图 load 完成、dataset 就绪后再操作（软件渲染下 load 可能偏慢）
  await page.waitForFunction(()=>document.querySelector(".maplibregl-map")?.dataset?.highlightCountry!==undefined,{timeout:12000}).catch(()=>{});

  let h=await hl();
  check("世界层无高亮",h.c===""&&h.s==="",JSON.stringify(h));

  // 点德国（非美国）→ 应高亮国家 DE
  await clickRank("德国");await sleep(1500);
  h=await hl();
  check("点德国后高亮国家 DE",h.c==="DE",JSON.stringify(h));

  // 回世界，点美国 → 应高亮国家 US，且州无高亮（关键修复点）
  await page.evaluate(()=>[...document.querySelectorAll("button")].find(b=>b.title==="重置视图")?.click());await sleep(1500);
  await clickRank("美国");await sleep(1500);
  h=await hl();
  check("点美国后高亮国家 US（不再消失）",h.c==="US",JSON.stringify(h));
  check("点美国后州层未误高亮",h.s==="",JSON.stringify(h));

  // 点 California 州 → 应高亮州 California
  await clickRank("California");await sleep(1500);
  h=await hl();
  check("点 California 州后高亮州",h.s==="California",JSON.stringify(h));
  check("州层国家高亮仍保留 US",h.c==="US",JSON.stringify(h));

  await page.screenshot({path:"D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/highlight-state.png"});

  // 返回上一级 → 国家高亮恢复，州高亮清除
  await page.evaluate(()=>[...document.querySelectorAll("button")].find(b=>(b.textContent||"").includes("返回上一级"))?.click());await sleep(1500);
  h=await hl();
  check("返回后州高亮清除",h.s==="",JSON.stringify(h));
  check("返回后国家高亮为 US",h.c==="US",JSON.stringify(h));

  check("全程无页面错误",errors.length===0,errors.slice(0,2).join(" | "));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
}catch(e){console.log("EXCEPTION:",String(e).slice(0,600));fail++;}finally{await browser.close();server.close();process.exit(fail?1:0);}
