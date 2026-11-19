import xlsx from "xlsx";
import { execSync } from "node:child_process";
import fs from "node:fs"; import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
fs.rmSync("scripts/.tmp-mm",{recursive:true,force:true});
execSync('npx tsc lib/import-mapper.ts lib/geo-resolve.ts lib/mock-data.ts lib/types.ts lib/store.tsx --outDir scripts/.tmp-mm --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --moduleResolution node',{stdio:"pipe"});
const m=require("./.tmp-mm/import-mapper.js");
// 用订单模板的表头，但强制当 skus 导入
const f="D:/跨境全链路数据中控台/订单导入模板.xlsx";
const wb=xlsx.readFile(f,{type:"file"});const rows=xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
const h=rows[0].map(String),d=rows.slice(1,4).map(r=>r.map(v=>String(v??"")));
const r=m.mapRows("skus",h,d);
console.log("matched:",JSON.stringify(r.matched));
console.log("record0:",JSON.stringify(r.records[0]));
fs.rmSync("scripts/.tmp-mm",{recursive:true,force:true});
