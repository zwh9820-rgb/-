// 验证 SKU 模板导入：SKU ID/编码双列、名称、重量正确，且与订单 skuId 关联
import xlsx from "xlsx";
import { execSync } from "node:child_process";
import fs from "node:fs"; import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
fs.rmSync("scripts/.tmp-skuv",{recursive:true,force:true});
execSync('npx tsc lib/import-mapper.ts lib/geo-resolve.ts lib/mock-data.ts lib/types.ts lib/store.tsx --outDir scripts/.tmp-skuv --module commonjs --target es2020 --jsx react-jsx --esModuleInterop --skipLibCheck --moduleResolution node',{stdio:"pipe"});
const m=require("./.tmp-skuv/import-mapper.js");
let pass=0,fail=0;const check=(n,ok,d)=>{console.log(`${ok?"✓":"✗"} ${n}${d?" — "+d:""}`);ok?pass++:fail++};

const f="D:/跨境全链路数据中控台/SKU导入模板.xlsx";
const wb=xlsx.readFile(f,{type:"file"});const rows=xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
const h=rows[0].map(String),d=rows.slice(1).map(r=>r.map(v=>String(v??"")));

const det=m.detectEntity(h);
check("自动识别为 SKU", det[0].entity==="skus", `最佳=${det[0].entity}`);
const r=m.mapRows("skus",h,d);
check("SKU ID 列映射", r.matched.id==="SKU ID", `列=${r.matched.id}`);
check("名称列映射", r.matched.name==="商品名称", `列=${r.matched.name}`);
check("重量列映射", r.matched.weight==="重量(kg)", `列=${r.matched.weight}`);
check("无未识别字段", r.unmatched.length===0, `unmatched=${r.unmatched.join(",")}`);
const rec=r.records[0];
check("SKU ID 正确", rec.id==="TMY.A001", `id=${rec.id}`);
check("SKU 编码空时回填为 ID", rec.sku==="TMY.A001", `sku=${rec.sku}`);
check("商品名称正确", rec.name==="TJ97-06 前保险杠", `name=${rec.name}`);
check("重量正确", rec.weight===24.5, `weight=${rec.weight}`);
check("记录数正确", r.records.length===202, `${r.records.length} 条`);

// 与订单关联：订单模板的 SKU ID 值应能在 SKU 主数据 id 中找到
const oWb=xlsx.readFile("D:/跨境全链路数据中控台/订单导入模板.xlsx",{type:"file"});
const oRows=xlsx.utils.sheet_to_json(oWb.Sheets[oWb.SheetNames[0]],{header:1,defval:""});
const oR=m.mapRows("orders",oRows[0].map(String),oRows.slice(1).map(x=>x.map(v=>String(v??""))));
const skuIds=new Set(r.records.map(x=>x.id));
const linked=oR.records.filter(o=>skuIds.has(o.skuId)).length;
check("订单 SKU 与 SKU 主数据可关联", linked>0, `${linked}/${oR.records.length} 单可关联`);

fs.rmSync("scripts/.tmp-skuv",{recursive:true,force:true});
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);process.exit(fail?1:0);
