// 验证改名后：① 仍读写原 userData 目录（旧数据不丢）② 品牌显示为 LinkVue ③ 数据持久化正常
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
let pass=0,fail=0;const check=(n,ok,d)=>{console.log(`${ok?"✓":"✗"} ${n}${d?" — "+d:""}`);ok?pass++:fail++};
check("新 EXE 存在", fs.existsSync(ELECTRON));
if(!fs.existsSync(ELECTRON)){console.log("结果: 0/1");process.exit(1)}
const proc=spawn(ELECTRON,["--remote-debugging-port=9246","--no-sandbox"],{env,stdio:"ignore"});
let b;
try{
  for(let i=0;i<40;i++){await sleep(500);try{b=await puppeteer.connect({browserURL:"http://127.0.0.1:9246",defaultViewport:null});break}catch{}}
  if(!b)throw new Error("CDP fail");
  await sleep(4000);
  const page=(await b.pages()).find(p=>p.url().includes("127.0.0.1"))||(await b.pages())[0];
  const body=await page.evaluate(()=>document.body?.innerText||"");
  check("品牌显示 LinkVue 联视", body.includes("LinkVue")&&body.includes("联视"), body.slice(0,60).replace(/\n/g," "));
  check("界面正常渲染（非崩溃）", !body.includes("Application error"));
  // 检查 userData 路径：写一条数据后确认落在 cross-border-data-hub 目录
  await page.evaluate(()=>localStorage.setItem("cbh_rebrand_probe","LINKVUE-OK"));
  await page.evaluate(()=>window.close());await sleep(1500);
  try{await b.disconnect()}catch{};try{proc.kill("SIGTERM")}catch{};await sleep(600);
  const udFile="C:/Users/24209/AppData/Roaming/cross-border-data-hub/Local Storage/leveldb";
  const found=fs.existsSync(udFile)&&fs.readdirSync(udFile).some(f=>{
    try{return fs.readFileSync(path.join(udFile,f)).includes("LINKVUE-OK")}catch{return false}
  });
  check("数据仍落在原 cross-border-data-hub 目录", found);
  // 清理探针
  const proc2=spawn(ELECTRON,["--remote-debugging-port=9246","--no-sandbox"],{env,stdio:"ignore"});
  let b2;for(let i=0;i<40;i++){await sleep(500);try{b2=await puppeteer.connect({browserURL:"http://127.0.0.1:9246",defaultViewport:null});break}catch{}}
  if(b2){await sleep(2000);const pg=(await b2.pages()).find(p=>p.url().includes("127.0.0.1"))||(await b2.pages())[0];
    const v=await pg.evaluate(()=>localStorage.getItem("cbh_rebrand_probe"));
    check("改名后旧数据可读", v==="LINKVUE-OK", `值=${v}`);
    await pg.evaluate(()=>localStorage.removeItem("cbh_rebrand_probe"));
    await pg.evaluate(()=>window.close());await sleep(1200);
    try{await b2.disconnect()}catch{};try{proc2.kill("SIGTERM")}catch{};await sleep(400);
  } else check("改名后旧数据可读",false,"重启失败");
}catch(e){check("改名验证",false,String(e).slice(0,200))}
finally{try{await b?.disconnect()}catch{};try{proc.kill("SIGKILL")}catch{}}
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);process.exit(fail?1:0);
