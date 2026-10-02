import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { initializePlugin } from './lib/plugin-runtime';
import './styles/app.css';

type Log = Record<string, unknown>;

function Probe() {
  const [dataMartId, setDataMartId] = useState('');
  const [dimension, setDimension] = useState('');
  const [metric, setMetric] = useState('');
  const [timestampColumn, setTimestampColumn] = useState('');
  const [log, setLog] = useState<Log>({});
  const note = (key: string, value: unknown) => setLog((prev) => ({ ...prev, [key]: value }));

  async function run() {
    const ctx = await initializePlugin();
    const owox = ctx.owox;
    // 1 + 3: automatic aggregation and run id on an ad-hoc query
    const traversal = await owox.dataMarts.traverseData(dataMartId, { column: [dimension, metric], limit: 5 });
    note('3_runId', traversal.runId ?? null);
    const rows: Record<string, unknown>[] = [];
    for await (const chunk of traversal.rowChunks()) rows.push(...chunk);
    note('1_rowKeys', rows[0] ? Object.keys(rows[0]) : []);
    // 2: totals on the run, immediately and after 3 s
    if (traversal.runId) {
      const path = `/api/data-marts/${dataMartId}/runs/${traversal.runId}`;
      note('2_totals_now', (await owox.getJson<{ totals?: unknown }>(path)).totals ?? null);
      await new Promise((r) => setTimeout(r, 3000));
      note('2_totals_3s', (await owox.getJson<{ totals?: unknown }>(path)).totals ?? null);
    }
    // 6: Google Sheets destinations visible to this member
    note('6_destinations', await owox.getJson('/api/data-destinations/by-type/GOOGLE_SHEETS'));
    // 7: between with date bounds on a TIMESTAMP column vs relative "today"
    if (timestampColumn) {
      const today = new Date().toISOString().slice(0, 10);
      const count = async (filter: unknown[]) => {
        const t = await owox.dataMarts.traverseData(dataMartId, {
          column: [timestampColumn],
          aggregation: [{ column: timestampColumn, function: 'COUNT' }],
          filter: filter as never,
          limit: 1,
        });
        const out: Record<string, unknown>[] = [];
        for await (const chunk of t.rowChunks()) out.push(...chunk);
        return out[0] ?? null;
      };
      note('7_between_today', await count([{ column: timestampColumn, operator: 'between', value: { from: today, to: today } }]));
      note('7_relative_today', await count([{ column: timestampColumn, operator: 'relative_date', value: { kind: 'today' } }]));
    }
    // 8: graph aliasPath values equal blendable-schema aliasPath values
    const schema = await owox.getJson<{ availableSources: { aliasPath: string }[] }>(`/api/data-marts/${dataMartId}/blendable-schema`);
    const graph = await owox.getJson<{ nodes: { aliasPath: string }[] }>(`/api/data-marts/${dataMartId}/relationships/graph`);
    note('8_schemaPaths', schema.availableSources.map((s) => s.aliasPath).sort());
    note('8_graphPaths', graph.nodes.map((n) => n.aliasPath).sort());
  }

  function testCopy() {
    // 5: Clipboard API is blocked (allow=''); does the legacy path work?
    const area = document.createElement('textarea');
    area.value = 'smart-data-reports copy probe';
    document.body.append(area);
    area.select();
    note('5_execCommandCopy', document.execCommand('copy'));
    area.remove();
  }

  return (
    <main className='flex flex-col gap-2 p-6 text-sm'>
      <h1 className='text-xl font-medium'>Host probe</h1>
      {[
        ['Data mart id', dataMartId, setDataMartId],
        ['Dimension column', dimension, setDimension],
        ['Metric column', metric, setMetric],
        ['TIMESTAMP column (optional)', timestampColumn, setTimestampColumn],
      ].map(([label, value, set]) => (
        <label key={label as string} className='flex flex-col gap-1'>
          {label as string}
          <input className='rounded-md border px-2 py-1' value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} />
        </label>
      ))}
      <div className='flex gap-2'>
        <button className='rounded-md border px-3 py-1' onClick={() => void run().catch((e) => note('error', String(e)))}>Run checks</button>
        <button className='rounded-md border px-3 py-1' onClick={testCopy}>Test copy</button>
      </div>
      <pre className='overflow-auto rounded-md bg-muted p-3 text-xs'>{JSON.stringify(log, null, 2)}</pre>
    </main>
  );
}

export function runProbe() {
  createRoot(document.getElementById('root')!).render(<Probe />);
}
