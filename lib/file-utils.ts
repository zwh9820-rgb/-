// 兼容 File.text() 不可用的环境，用 FileReader 读取文本文件
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsText(file, "utf-8");
  });
}

// 读取文件为 ArrayBuffer（xlsx 用）
export function readFileBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}

// 从 xlsx 读取为二维数组（取指定工作表或第一个工作表）
export async function readXlsx(file: File, sheetName?: string): Promise<{ headers: string[]; rows: string[][]; sheets: string[] }> {
  const XLSX = await import("xlsx");
  const buf = await readFileBuffer(file);
  const wb = XLSX.read(buf, { type: "array" });
  const sheets = wb.SheetNames;
  const ws = wb.Sheets[sheetName && sheets.includes(sheetName) ? sheetName : sheets[0]];
  if (!ws) return { headers: [], rows: [], sheets };
  const arr = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: "", raw: false });
  const clean = (v: any) => String(v ?? "").replace(/\r?\n/g, " ").trim();
  const headers = (arr[0] || []).map(clean);
  const rows = arr.slice(1).filter((r) => r.some((c) => c !== "" && c !== null && c !== undefined)).map((r) => r.map(clean));
  return { headers, rows, sheets };
}

// 判断文件是否为 Excel
export function isExcel(file: File): boolean {
  return /\.xlsx?$/i.test(file.name);
}

// 解析 CSV（支持引号包裹、逗号转义）
export function parseCsv(text: string): string[][] {
  return text.replace(/^\ufeff/, "").trim().split(/\r?\n/).map((line) => {
    const out: string[] = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}
