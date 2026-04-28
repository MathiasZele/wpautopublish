'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DataPoint {
  date: string;
  tokens: number;
  cost: number;
}

export function TokenChart({ data }: { data: DataPoint[] }) {
  return (
    <div className="bg-white rounded-xl border p-6">
      <h3 className="font-semibold mb-4">Consommation tokens — 30 derniers jours</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v: number, key: string) =>
              key === 'cost' ? `$${v.toFixed(4)}` : v.toLocaleString()
            }
          />
          <Line type="monotone" dataKey="tokens" stroke="#2563eb" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
