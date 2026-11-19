// 验证反经线切分：清洗后所有环不再有相邻顶点经度差 >180
import fs from "node:fs";
import { splitAntimeridian } from "../lib/geo-agg.ts";

const raw = JSON.parse(fs.readFileSync("public/geo/world-countries.geo.json", "utf8"));
function maxJump(geo) {
  let max = 0, count = 0;
  for (const f of geo.features) {
    const g = f.geometry; if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
      const d = Math.abs(ring[i][0] - ring[i-1][0]);
      if (d > max) max = d;
      if (d > 180) count++;
    }
  }
  return { max: max.toFixed(1), count };
}
const before = maxJump(raw);
const cleaned = splitAntimeridian(raw);
const after = maxJump(cleaned);
console.log("清洗前: 最大经度跳变", before.max + "°", "| 跳变数", before.count);
console.log("清洗后: 最大经度跳变", after.max + "°", "| 跳变数", after.count);
console.log("Feature 数:", raw.features.length, "→", cleaned.features.length);
const ok = after.count === 0 && cleaned.features.length === raw.features.length;
console.log(ok ? "PASS 反经线切分正确" : "FAIL 仍有跳变或 Feature 丢失");
if (!ok) process.exitCode = 1;
