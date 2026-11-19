// 验证单实例锁：第二个实例应立即退出（exit code 0），第一个保持运行
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;

const p1 = spawn(ELECTRON, ["--no-sandbox"], { env, stdio: "ignore" });
await sleep(7000);
console.log("第一个实例已启动 7 秒，仍存活:", p1.exitCode === null);

let secondExited = false;
let secondExitCode = null;
const p2 = spawn(ELECTRON, ["--no-sandbox"], { env, stdio: "ignore" });
p2.on("exit", (code) => { secondExited = true; secondExitCode = code; });
await sleep(5000);
console.log(`第二个实例 5 秒内退出: ${secondExited} (exit code=${secondExitCode})`);
console.log("第一个实例仍存活:", p1.exitCode === null);

const ok = secondExited && secondExitCode === 0 && p1.exitCode === null;
try { p1.kill("SIGKILL"); } catch {}
try { p2.kill("SIGKILL"); } catch {}
await sleep(500);
console.log(ok ? "✓ 单实例锁生效" : "✗ 单实例锁异常");
process.exit(ok ? 0 : 1);
