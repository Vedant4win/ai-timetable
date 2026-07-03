import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function PriorityChart() {
  const [data, setData] = useState([]);

  useEffect(() => {
    // Fetch the data from your new Python route
    fetch('http://localhost:8000/api/analysis/priority-distribution')
      .then(res => res.json())
      .then(data => {
        // Format the data for the chart
        const formattedData = data.map(item => ({
          name: `Priority ${item.priority}`,
          count: item.count,
          priorityLevel: item.priority
        }));
        setData(formattedData);
      })
      .catch(err => console.error("Failed to load analytics", err));
  }, []);

  // Strategic Color Coding: Red for P5 (Urgent), fading to Blue for P1 (Chill)
  const getColor = (priorityLevel) => {
    const colors = {
      5: '#ef4444', // Red
      4: '#f97316', // Orange
      3: '#eab308', // Yellow
      2: '#3b82f6', // Blue
      1: '#64748b'  // Slate
    };
    return colors[priorityLevel] || '#8884d8';
  };

  return (
    <div style={{ height: '300px', width: '100%', backgroundColor: '#1e293b', padding: '20px', borderRadius: '8px' }}>
      <h3 style={{ color: 'white', marginBottom: '20px' }}>Strategic Workload Distribution</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" stroke="#cbd5e1" />
          <YAxis stroke="#cbd5e1" allowDecimals={false} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', border: 'none', color: '#fff' }}
            cursor={{ fill: 'rgba(255,255,255,0.1)' }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.priorityLevel)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}