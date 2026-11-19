// 版本更新说明：唯一数据源为根目录 changelog.json
// 应用内展示与 GitHub Release 说明都从这份数据生成，保证两处内容一致。
import raw from "@/changelog.json";

export type ChangeEntry = {
  version: string;
  date: string;
  title: string;
  issues: string[];
  fixes: string[];
};

export const CHANGELOG_POLICY: string = raw.policy;

function versionNumber(v: string): number[] {
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

function compareDesc(a: ChangeEntry, b: ChangeEntry): number {
  const av = versionNumber(a.version);
  const bv = versionNumber(b.version);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const d = (bv[i] || 0) - (av[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** 按版本号从新到旧排列 */
export const CHANGELOG: ChangeEntry[] = (raw.versions as ChangeEntry[]).slice().sort(compareDesc);

export function findChangeEntry(version: string): ChangeEntry | undefined {
  const clean = version.replace(/^v/i, "");
  return CHANGELOG.find((e) => e.version === clean);
}

/** 生成与 GitHub Release 一致的说明文本（可用于复制/导出） */
export function formatReleaseNotes(entry: ChangeEntry): string {
  const lines: string[] = [
    `LinkVue ${entry.version}（${entry.date}）`,
    "",
    `## ${entry.title}`,
    "",
    "### 发现的问题",
    ...entry.issues.map((s) => `- ${s}`),
    "",
    "### 解决的问题",
    ...entry.fixes.map((s) => `- ${s}`),
  ];
  return lines.join("\n");
}
