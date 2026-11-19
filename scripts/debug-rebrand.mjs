import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const E=path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sl=ms=>new Promise(r=>setTimeout(r,ms));const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
const p=spawn(E,["--remote-debugging-port=9247","--no-sandbox"],{env,stdio:"ignore"});
let b;try{
 for(let i=0;i<40;i++){await sl(500);try{b=await puppeteer.connect({browserURL:"http://127.0.0.1:9247",defaultViewport:null});break}catch{}}
 await sl(4000);
 const pages=await b.pages();console.log("pages:",pages.map(x=>x.url()));
 const pg=pages.find(x=>x.url().includes("127.0.0.1"))||pages[0];
 const body=await pg.evaluate(()=>document.body?.innerText||"");
 console.log("BODY:",body.slice(0,300).replace(/\n/g," | "));
 console.log("has LinkVue:",body.includes("LinkVue"),"has 联视:",body.includes("联视"));
}catch(e){console.log("EXC",String(e).slice(0,200))}finally{try{await b?.disconnect()}catch{};try{p.kill("SIGKILL")}catch{}}
