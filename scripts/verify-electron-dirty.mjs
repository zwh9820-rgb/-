import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const UD = "C:/Users/24209/AppData/Local/Temp/cbh-dirty-ud";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
let pass=0,fail=0;const check=(n,ok,d)=>{console.log(`${ok?"✓":"✗"} ${n}${d?" — "+d:""}`);ok?pass++:fail++};
async function launch(){
  const proc=spawn(ELECTRON,["--remote-debugging-port=9245","--no-sandbox",`--user-data-dir=${UD}`],{env,stdio:"ignore"});
  for(let i=0;i<40;i++){await sleep(500);try{const b=await puppeteer.connect({browserURL:"http://127.0.0.1:9245",defaultViewport:null});return{proc,b}}catch{}}
  throw new Error("CDP fail");
}
try{
  // 第一次：写入脏数据（用干净应用，此时能正常操作）
  let s=await launch(); await sleep(2500);
  let pages=await s.b.pages(); let page=pages.find(p=>p.url().includes("127.0.0.1"))||pages[0];
  await page.evaluate(()=>{
    localStorage.setItem("cbh_data_orders_v1",JSON.stringify([
      {id:"o1",orderNo:"D1",platform:"Amazon",skuId:"s1",qty:1,amount:undefined,weight:undefined,status:"已签收",city:"LA",state:"CA",country:"美国",countryCode:"US",lng:undefined,lat:undefined,date:"2026-11-01",warehouseId:"",returnRisk:undefined},
      {id:"o2",orderNo:"D2",platform:"eBay",skuId:"s2",qty:2,amount:50,weight:1,status:"已签收",city:"NY",state:"NY",country:"美国",countryCode:"US",lng:-74,lat:40,date:"2026-11-02",warehouseId:"",returnRisk:.1}
    ]));
  });
  await page.evaluate(()=>window.close()); await sleep(1500);
  await s.b.disconnect(); try{s.proc.kill("SIGTERM")}catch{} await sleep(600);
  // 第二次：重启，读取脏数据，确认不崩
  s=await launch(); await sleep(3000);
  pages=await s.b.pages(); page=pages.find(p=>p.url().includes("127.0.0.1"))||pages[0];
  const errs=[];page.on("pageerror",e=>errs.push(String(e).slice(0,150)));
  const body=await page.evaluate(()=>document.body?.innerText||"").catch(()=>"");
  check("真实Electron脏数据不崩溃", !body.includes("Application error"), body.slice(0,50).replace(/\n/g," "));
  check("地球页正常", body.includes("3D 地球概览"));
  check("无页面错误", errs.length===0, errs.join("|"));
  await s.b.disconnect(); try{s.proc.kill("SIGTERM")}catch{} await sleep(500);
}catch(e){check("Electron脏数据验证",false,String(e).slice(0,200))}
finally{}
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);process.exit(fail?1:0);
