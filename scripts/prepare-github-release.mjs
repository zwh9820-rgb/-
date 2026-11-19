// 一键准备 GitHub Release 发布包
// 用法：node scripts/prepare-github-release.mjs [新版本号 如 0.2.0]
// 作用：把 dist 里的安装版复制成 latest.yml 引用的英文文件名，连同 latest.yml 一起放进
//       dist/github-release/ 目录。你只需把这个目录里的文件上传到 GitHub 仓库的 Release。
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const OUT = path.join(DIST, "github-release");
const latestPath = path.join(DIST, "latest.yml");

if (!fs.existsSync(latestPath)) {
  console.error("✗ 未找到 dist/latest.yml，请先执行打包：npm run dist");
  process.exit(1);
}

// 从 package.json 读版本
const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
const requested = process.argv[2] || pkg.version;
console.log(`准备发布包：目标版本 ${requested}（package.json 当前 ${pkg.version}）`);

// 解析 latest.yml 里引用的安装版文件名
const yml = fs.readFileSync(latestPath, "utf8");
const urlMatch = yml.match(/url:\s*(.+)/);
const referenced = urlMatch ? urlMatch[1].trim() : "cross-border-data-hub-setup-" + pkg.version + ".exe";

// 找中文名安装版 EXE；dist 里可能同时存在多个历史版本，必须按目标版本精确匹配
const setupCandidates = fs.readdirSync(DIST).filter((f) => /Setup .+\.exe$/i.test(f));
const escapedVersion = requested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const versionPattern = new RegExp(`Setup\\s+${escapedVersion}\\.exe$`, "i");
const setupExe =
  setupCandidates.find((f) => versionPattern.test(f)) ||
  setupCandidates.sort((a, b) => fs.statSync(path.join(DIST, b)).mtimeMs - fs.statSync(path.join(DIST, a)).mtimeMs)[0];
if (!setupExe) {
  console.error("✗ 未找到安装版 EXE（形如 *Setup*.exe），请先打包");
  process.exit(1);
}
if (!versionPattern.test(setupExe)) {
  console.error(`✗ 未找到版本 ${requested} 的安装版，实际找到 ${setupExe}，请先重新打包`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
// 清空旧发布包
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });

// 复制安装版 → latest.yml 引用的英文名
fs.copyFileSync(path.join(DIST, setupExe), path.join(OUT, referenced));
// 复制 latest.yml
fs.copyFileSync(latestPath, path.join(OUT, "latest.yml"));

console.log("✓ 发布包已生成：dist/github-release/");
for (const f of fs.readdirSync(OUT)) {
  const kb = Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
  console.log(`   ${f}  (${(kb / 1024).toFixed(1)} MB)`);
}
console.log("\n下一步：");
console.log("1. 在 GitHub 仓库创建 Release，tag 用版本号（如 v" + requested + "）");
console.log("2. 把上面两个文件上传为该 Release 的附件");
console.log("3. 程序内填好 owner/repo 后即可检测到新版本");
if (requested !== pkg.version) {
  console.log(`\n⚠ 提醒：package.json 版本仍是 ${pkg.version}。发布新版本请先改版本号重新打包，latest.yml 才会正确标记 ${requested}。`);
}
