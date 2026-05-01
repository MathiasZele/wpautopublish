'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DataPoint {
  date: string;
  tokens: number;
  cost: number;
}

export function TokenChart({ data }: { data: DataPoint[] }) {
  return (
    <div className="card-premium p-6">
      <h3 className="font-bold text-slate-900 font-outfit mb-6">Consommation tokens — 30 derniers jours</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 10, fill: '#64748b' }} 
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            tick={{ fontSize: 10, fill: '#64748b' }} 
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
          />
          <Tooltip
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
            formatter={(v: number, key: string) =>
              key === 'cost' ? `$${v.toFixed(4)}` : v.toLocaleString()
            }
          />
          <Line 
            type="monotone" 
            dataKey="tokens" 
            stroke="#4466ff" 
            strokeWidth={3} 
            dot={false}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
