// 验证脏数据（缺坐标/金额/重量）不再导致客户端崩溃
import puppeteer from "puppeteer-core";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=path.resolve("out"); const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".woff2":"font/woff2"};
const s=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";const f=path.join(ROOT,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();}else{r.writeHead(200,{"Content-Type":M[path.extname(f)]||"application/octet-stream"});r.end(d);}})});
await new Promise(r=>s.listen(0,"127.0.0.1",r));const port=s.address().port;
let pass=0,fail=0;const check=(n,ok,d)=>{console.log(`${ok?"✓":"✗"} ${n}${d?" — "+d:""}`);ok?pass++:fail++};
const b=await puppeteer.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:"new",args:["--no-sandbox","--use-gl=swiftshader"]});
try{
  const page=await b.newPage();await page.setViewport({width:1600,height:1000});const sl=ms=>new Promise(r=>setTimeout(r,ms));
  const errs=[];page.on("pageerror",e=>errs.push(String(e).slice(0,200)));page.on("console",m=>{if(m.type()==="error")errs.push(m.text().slice(0,200))});
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:"domcontentloaded"});await sl(1200);
  // 注入各种脏数据：缺坐标、null、字符串、缺金额
  const dirty=[
    {id:"o1",orderNo:"D1",platform:"Amazon",skuId:"s1",qty:1,amount:undefined,weight:undefined,status:"已签收",city:"LA",state:"CA",country:"美国",countryCode:"US",lng:undefined,lat:undefined,date:"2026-11-01",warehouseId:"",returnRisk:undefined},
    {id:"o2",orderNo:"D2",platform:"eBay",skuId:"s2",qty:"2",amount:"99.5",weight:"1.2",status:"已签收",city:"NY",state:"NY",country:"美国",countryCode:"US",lng:null,lat:null,date:"2026-11-02",warehouseId:"",returnRisk:null},
    {id:"o3",orderNo:"D3",platform:"TikTok Shop",skuId:"s1",qty:3,amount:50,weight:1,status:"已签收",city:"",state:"",country:"美国",countryCode:"US",lng:-98,lat:39,date:"2026-11-03",warehouseId:"",returnRisk:.1},
  ];
  const dirtyWh=[{id:"w1",name:"测试仓",code:"T1",country:"美国",countryCode:"US",state:"",city:"",lng:undefined,lat:undefined,capacity:undefined,used:null,health:"healthy",skuCount:undefined,dailyOutbound:undefined}];
  const dirtyCn=[{id:"c1",containerNo:"C1",originPort:"A",originLng:undefined,originLat:undefined,destPort:"B",destLng:null,destLat:null,destCountry:"美国",status:"在途",progress:undefined,etd:"",eta:"",cargoValue:undefined,volume:undefined,skuCount:undefined,items:undefined}];
  await page.evaluate(([o,w,c])=>{
    Object.keys(localStorage).filter(k=>k.startsWith("cbh_")).forEach(k=>localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1",JSON.stringify(o));
    localStorage.setItem("cbh_data_warehouses_v1",JSON.stringify(w));
    localStorage.setItem("cbh_data_containers_v1",JSON.stringify(c));
  },[dirty,dirtyWh,dirtyCn]);
  await page.reload({waitUntil:"domcontentloaded"});await sl(3000);
  const body=await page.evaluate(()=>(document.body?.innerText||""));
  check("脏数据下无客户端崩溃", !body.includes("Application error"), body.slice(0,60).replace(/\n/g," "));
  check("默认地球页正常渲染", body.includes("3D 地球概览")||body.includes("Cross-Border"));
  check("无 JS 错误", errs.length===0, errs.join(" | ").slice(0,200));
  // 逐个模块点开，确认都不崩
  const mods=["订单分析","海外仓库存","海运头程","利润与费用","经营驾驶舱"];
  for(const m of mods){
    await page.evaluate(lb=>[...document.querySelectorAll("nav button")].find(b=>(b.textContent||"").includes(lb))?.click(),m);
    await sl(600);
    const t=await page.evaluate(()=>document.body?.innerText||"");
    check(`模块「${m}」脏数据不崩`, !t.includes("Application error"));
  }
}catch(e){check("脏数据验证",false,String(e).slice(0,200))}
finally{await b.close();s.close()}
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);process.exit(fail?1:0);
