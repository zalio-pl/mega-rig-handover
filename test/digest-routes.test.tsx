import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
const app = createApp({ ...base, runsDir: dir });

const line = (job: string, status: string, owner: string | null, n: number, error?: string) =>
  JSON.stringify({ at: `2026-10-29T01:0${n}:00+01:00`, job, status, owner, ...(error ? { error } : {}) });

const normal = [
  line('alpha', 'retry', 'rook', 1),
  line('alpha', 'retry', 'rook', 2),
  line('alpha', 'retry', 'rook', 3),
  line('alpha', 'ok', 'rook', 4),
  line('beta', 'retry', 'rook', 1),
  line('beta', 'retry', 'rook', 2),
  line('beta', 'ok', 'rook', 3),
  line('gamma', 'fail', null, 1, 'quota exceeded'),
];

beforeAll(() => {
  writeFileSync(join(dir, '2026-11-01.jsonl'), normal.join('\n') + '\n');
  writeFileSync(join(dir, '2026-11-02.jsonl'), '');
  writeFileSync(join(dir, '2026-11-03.jsonl'), [line('alpha', 'ok', 'rook', 1), '{not json', line('beta', 'ok', 'rook', 2)].join('\n') + '\n');
});

const page = (night: string) => app.request(`/digest/${night}`);
const json = (night: string) => app.request(`/api/digest/${night}`);

describe('GET /digest/:night', () => {
  it('renders a normal night', async () => {
    const res = await page('2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest 2026-11-01');
    expect(html).toMatch(/alpha<\/td><td>rook<\/td><td>4<\/td>/);
    expect(html).not.toContain('could not be read');
  });

  it('marks retries of 3 or more and a fail last status as warn', async () => {
    const html = await (await page('2026-11-01')).text();
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td class="warn">fail</td>');
    expect(html).toContain('<td>2</td>');
    expect(html).not.toContain('<td class="warn">2</td>');
    expect(html).not.toContain('<td class="warn">ok</td>');
  });

  it('renders a null owner as —', async () => {
    const html = await (await page('2026-11-01')).text();
    expect(html).toMatch(/gamma<\/td><td>—<\/td>/);
  });

  it('404s for a night with no file', async () => {
    const res = await page('2026-01-01');
    expect(res.status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await page('2026-11-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('reports a bad line and still renders the good rows', async () => {
    const html = await (await page('2026-11-03')).text();
    expect(html).toContain('1 line could not be read');
    expect(html).toContain('alpha');
    expect(html).toContain('beta');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns a normal night', async () => {
    const res = await json('2026-11-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-11-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'beta', 'gamma']);
    expect(body.rows[0]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', owner: 'rook' });
    expect(body.rows[2]).toMatchObject({ owner: null, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('404s with a JSON error for a night with no file', async () => {
    const res = await json('2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns no rows and no bad lines for an empty night', async () => {
    const res = await json('2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-11-02', rows: [], badLines: 0 });
  });

  it('counts a bad line and keeps the good rows', async () => {
    const body = (await (await json('2026-11-03')).json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'beta']);
  });
});

describe('real night 2026-10-28', () => {
  it('lists jobs in the same order on the page and in the JSON', async () => {
    const real = createApp({ ...base, runsDir: 'runs' });
    const body = (await (await real.request('/api/digest/2026-10-28')).json()) as Night;
    const html = await (await real.request('/digest/2026-10-28')).text();
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toHaveLength(5);
    const positions = jobs.map((j) => html.indexOf(`<td>${j}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
