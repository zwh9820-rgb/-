// 数据体检：识别"被错误导入到某个集合"的错位记录。
// 典型场景：在【海外仓】标签导入了订单 Excel，订单数据被按仓库字段映射后存进 warehouses，
// 表现为仓库记录里出现 TikTok Shop/Amazon 等平台值或 SKU 编码。这里给出可解释的检测规则，
// 供界面提示用户清理并重新导入，避免脏数据污染地图与分析。
import type { EntityKey } from "./store";

export type DataIssue = {
  entity: EntityKey;
  count: number;
  reason: string;
  suggestion: string;
};

const PLATFORM_TOKENS = ["amazon", "ebay", "tiktok", "独立站", "shopee", "walmart", "temu"];

function text(v: any): string { return String(v ?? "").trim(); }

/** 判断一条 warehouse 记录是否像"订单被错位导入" */
function looksLikeMisplacedOrderWarehouse(w: any): boolean {
  const id = text(w.id);
  const name = text(w.name);
  const code = text(w.code);
  const country = text(w.country);
  // 平台名出现在本该是仓库编码/名称的字段
  const platformInCode = PLATFORM_TOKENS.some((p) => code.toLowerCase().includes(p));
  // 订单ID通常是很长的纯数字串（>12 位），仓库ID一般是短编码
  const longNumericId = /^\d{12,}$/.test(id);
  // 国家字段是 SKU 编码形态（如 TMY.WG045）
  const skuLikeCountry = /^[A-Z]{2,}\.[A-Z]?\d/.test(country);
  return platformInCode || longNumericId || skuLikeCountry || (platformInCode && name === "");
}

/** 判断一条 order 记录是否像"仓库/SKU 被错位导入" */
function looksLikeMisplacedOrder(o: any): boolean {
  const orderNo = text(o.orderNo);
  const platform = text(o.platform);
  // 订单缺少订单号且平台为空，基本是被别的类型错位填充
  return !orderNo && !platform;
}

/** 扫描所有集合，返回检测到的问题；不修改任何数据 */
export function diagnoseData(data: Record<EntityKey, any[]>): DataIssue[] {
  const issues: DataIssue[] = [];
  const warehouses = data.warehouses || [];
  const orders = data.orders || [];

  const badWh = warehouses.filter(looksLikeMisplacedOrderWarehouse);
  if (badWh.length) {
    issues.push({
      entity: "warehouses", count: badWh.length,
      reason: `检测到 ${badWh.length} 条海外仓记录包含订单特征（平台名/SKU编码/超长订单号），疑似把订单文件导入到了海外仓`,
      suggestion: "建议清空海外仓数据，用「智能导入」重新导入；订单文件应选类型为「订单」",
    });
  }
  const badOrders = orders.filter(looksLikeMisplacedOrder);
  if (badOrders.length && orders.length) {
    issues.push({
      entity: "orders", count: badOrders.length,
      reason: `检测到 ${badOrders.length} 条订单记录缺少订单号与平台，疑似导入时列映射错位`,
      suggestion: "建议在数据中心删除这些记录或用「智能导入」重新导入订单文件",
    });
  }
  return issues;
}
