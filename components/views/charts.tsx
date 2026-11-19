"use client";

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const PALETTE = ["#3366ff", "#7c3aed", "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#6366f1"];

export function RechartsWrapper({
  type, data, xKey, bars, lines, areas, height = 220, pieKey = "value", nameKey = "name",
}: {
  type: "bar" | "line" | "area" | "pie";
  data: any[];
  xKey?: string;
  bars?: { key: string; color?: string }[];
  lines?: { key: string; color?: string }[];
  areas?: { key: string; color?: string }[];
  height?: number;
  pieKey?: string;
  nameKey?: string;
}) {
  const tooltipStyle = {
    contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--text)" },
    labelStyle: { color: "var(--text)", fontWeight: 600 },
    itemStyle: { color: "var(--text-2)" },
    cursor: { fill: "rgba(128,128,128,.06)" },
  };
  const axis = { fontSize: 11, fill: "var(--text-3)" };

  if (type === "pie") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={pieKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius="72%" innerRadius="46%" paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-2)" }} iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
      <XAxis dataKey={xKey} tick={axis} axisLine={false} tickLine={false} />
      <YAxis tick={axis} axisLine={false} tickLine={false} width={42} />
      <Tooltip {...tooltipStyle} />
      {data[0] && Object.keys(data[0]).filter((k) => k !== xKey).length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={8} />}
    </>
  );

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {common}
          {bars?.map((b, i) => <Bar key={b.key} dataKey={b.key} fill={b.color || PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} maxBarSize={32} />)}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (type === "area") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          {common}
          {areas?.map((a, i) => (
            <Area key={a.key} type="monotone" dataKey={a.key} stroke={a.color || PALETTE[i % PALETTE.length]} fill={a.color || PALETTE[i % PALETTE.length]} fillOpacity={0.12} strokeWidth={2} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        {common}
        {lines?.map((l, i) => <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color || PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}
