'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface DataPoint {
  date: string;
  tokens: number;
  cost: number;
}

export function TokenChart({ data }: { data: DataPoint[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Consommation tokens</CardTitle>
        <CardDescription>30 derniers jours</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)}
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.2 }}
              contentStyle={{
                borderRadius: 'var(--radius)',
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--popover))',
                color: 'hsl(var(--popover-foreground))',
                boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
                fontSize: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}
              formatter={(v: number, key: string) =>
                key === 'cost' ? `$${v.toFixed(4)}` : v.toLocaleString()
              }
            />
            <Line
              type="monotone"
              dataKey="tokens"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
