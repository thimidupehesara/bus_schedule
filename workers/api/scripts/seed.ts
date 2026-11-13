import sample from '../../../packages/shared/src/sample-schedule.json' with { type: 'json' };
import { validateScheduleDocument } from '@bus-schedule/shared';
import { makeEtag, sortServices, validateDocument } from '../src/schedule.js';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { apiDirectory, executeSql, quoteSql as q, wrangler } from './local-tools.js';
import { parseSeedArgs, verifySnapshotResult } from './seed-options.js';

const options = parseSeedArgs(process.argv.slice(2));
const publisher = options.remote ? 'remote-seed' : 'local-seed';
const parsed = validateScheduleDocument(sample);
if (!parsed.ok) throw new Error('Sample schema is invalid.');
const document = {
  ...parsed.data,
  ...(options.mobileUrl
    ? { station: { ...parsed.data.station, mobileUrl: options.mobileUrl } }
    : {}),
  version: 1,
  publishedAt: new Date().toISOString(),
  services: sortServices(parsed.data.services),
};
if (!validateDocument(document).validation.ok)
  throw new Error('Sample fails strict validation. Review the sample before seeding.');
if (options.remote) {
  console.log('REMOTE DATABASE: mahiyanganaya-bus-db');
  console.warn(
    '\x1b[1mSAMPLE DATA, NOT AN OFFICIAL TIMETABLE. Replace it from the admin page before real use.\x1b[0m',
  );
  let answer: string | undefined;
  if (process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const abort = new AbortController();
      prompt.once('close', () => abort.abort());
      prompt.once('SIGINT', () => abort.abort());
      answer = await prompt.question('Type YES to seed the remote database: ', {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]),
      });
    } catch {
      // Treat EOF, interruption and timeouts as cancellation.
    } finally {
      prompt.close();
    }
  }
  if (answer !== 'YES') {
    console.error('Cancelled. No changes made.');
    process.exit(1);
  }

  const result = execFileSync(
    process.execPath,
    [
      wrangler,
      'd1',
      'execute',
      'DB',
      '--remote',
      '--command',
      'SELECT COUNT(*) AS n FROM snapshots',
      '--json',
    ],
    {
      cwd: apiDirectory,
      encoding: 'utf8',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  verifySnapshotResult(JSON.parse(result));
}
const body = JSON.stringify(document),
  etag = await makeEtag(1, body);
// Wrangler imports the SQL file in one transaction. Recheck at write time to
// cover a publish that happens after the preliminary count.
const guard = options.remote
  ? 'INSERT INTO mutation_guard(id) VALUES(CASE WHEN NOT EXISTS (SELECT 1 FROM snapshots) THEN 1 ELSE 0 END);\n'
  : '';
executeSql(
  `${guard}INSERT INTO snapshots(version,published_at,published_by,kind,body,etag) VALUES(1,${q(document.publishedAt)},${q(publisher)},'SEED',${q(body)},${q(etag)});
INSERT INTO live_pointer(id,version) VALUES(1,1);
INSERT INTO audit_log(at,login_id,action,detail) VALUES(${q(document.publishedAt)},${q(publisher)},'SEED','Sample data; not an official timetable');${options.remote ? '\nDELETE FROM mutation_guard WHERE id=1;' : ''}`,
  options.remote,
);
