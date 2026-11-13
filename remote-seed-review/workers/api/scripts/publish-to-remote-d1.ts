import sample from '../../../packages/shared/src/sample-schedule.json' with { type: 'json' };
import { validateScheduleDocument } from '@bus-schedule/shared';
import { makeEtag, sortServices, validateDocument } from '../src/schedule.js';
import { executeSql, quoteSql as q } from './local-tools.js';

const parsed = validateScheduleDocument(sample);
if (!parsed.ok) {
  throw new Error('Sample schema is invalid: ' + JSON.stringify(parsed.errors));
}

const document = {
  ...parsed.data,
  version: 2,
  publishedAt: new Date().toISOString(),
  services: sortServices(parsed.data.services),
};

const validation = validateDocument(document);
if (!validation.validation.ok) {
  throw new Error('Strict validation failed: ' + JSON.stringify(validation.validation.errors));
}

const body = JSON.stringify(document);
const etag = await makeEtag(2, body);
const now = document.publishedAt;

console.log('Document validated successfully.');
console.log('Station:', document.station.name.si);
console.log('Services count:', document.services.length);
console.log('ETag:', etag);

const sql = `
INSERT INTO snapshots(version, published_at, published_by, kind, body, etag)
VALUES(2, ${q(now)}, 'owner', 'PUBLISH', ${q(body)}, ${q(etag)});

INSERT INTO live_pointer(id, version)
VALUES(1, 2)
ON CONFLICT(id) DO UPDATE SET version = 2;

INSERT INTO audit_log(at, login_id, action, detail)
VALUES(${q(now)}, 'owner', 'PUBLISH', 'Updated schedule with 146 real services');
`;

console.log('Executing SQL against remote D1 database...');
executeSql(sql, true);
console.log('Successfully published version 2 to remote D1!');

