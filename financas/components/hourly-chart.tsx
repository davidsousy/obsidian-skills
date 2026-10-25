"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type HourlyPoint = { label: string; bruto: number; liquido: number };

const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function HourlyChart({ data }: { data: HourlyPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
          <YAxis
            tickFormatter={(v: number) => `R$ ${Math.round(v / 100)}`}
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip formatter={(v) => brl(Number(v))} labelStyle={{ color: "#0f172a" }} />
          <Legend formatter={(v) => (v === "bruto" ? "Bruto por hora" : "Líquido por hora (descontado o carro)")} />
          <Line type="monotone" dataKey="bruto" stroke="#334155" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="liquido" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
