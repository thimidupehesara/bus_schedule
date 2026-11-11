#!/usr/bin/env tsx
/**
 * validate-sample.ts
 * Runs the ScheduleDocument validator against sample-schedule.json.
 * Used by: npm run validate:sample
 */

import { createRequire } from 'node:module';
import { validateScheduleDocument } from '../src/index.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const sample: unknown = require('../src/sample-schedule.json');

const result = validateScheduleDocument(sample);

if (result.ok) {
  console.log('✅ sample-schedule.json is VALID');
  console.log(`   schemaVersion=${result.data.schemaVersion} version=${result.data.version}`);
  console.log(`   services=${result.data.services.length}`);
  process.exit(0);
} else {
  console.error('❌ sample-schedule.json is INVALID');
  for (const err of result.errors) {
    console.error(`   • ${err}`);
  }
  process.exit(1);
}

