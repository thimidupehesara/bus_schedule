import sample from '../../../packages/shared/src/sample-schedule.json' with { type: 'json' };
import { validateScheduleDocument } from '@bus-schedule/shared';
import { makeEtag, sortServices, validateDocument } from '../src/schedule.js';
import { executeSql, quoteSql as q } from './local-tools.js';
const parsed = validateScheduleDocument(sample);
if (!parsed.ok) throw new Error('Sample schema is invalid.');
const document = {
  ...parsed.data,
  version: 1,
  publishedAt: new Date().toISOString(),
  services: sortServices(parsed.data.services),
};
if (!validateDocument(document).validation.ok)
  throw new Error('Sample fails strict validation. Review the sample before seeding.');
if (process.argv.length > 2) throw new Error('Seed is local-only and accepts no flags.');
const body = JSON.stringify(document),
  etag = await makeEtag(1, body);
executeSql(`INSERT INTO snapshots(version,published_at,published_by,kind,body,etag) VALUES(1,${q(document.publishedAt)},'local-seed','SEED',${q(body)},${q(etag)});
INSERT INTO live_pointer(id,version) VALUES(1,1);
INSERT INTO audit_log(at,login_id,action,detail) VALUES(${q(document.publishedAt)},'local-seed','SEED','Sample data; not an official timetable');`);
