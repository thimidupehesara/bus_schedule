import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { validEmail } from '../src/auth.js';
import { executeSql, quoteSql as q } from './local-tools.js';
async function main(): Promise<void> {
  const args = process.argv.slice(2),
    remote = args.includes('--remote');
  if (
    args.some((a) => a.startsWith('--') && a !== '--remote' && a !== '--local') ||
    (remote && args.includes('--local'))
  )
    throw new Error('Use --local (default) or --remote.');
  const [command, email, name, role, ...extra] = args.filter(
    (a) => a !== '--remote' && a !== '--local',
  );
  if (!['create', 'list', 'disable', 'enable'].includes(command ?? '') || extra.length)
    throw new Error(
      'Usage: user:create email "Display Name" ADMIN|EDITOR [--local|--remote], or user:list / user:disable email / user:enable email.',
    );
  if (command !== 'list' && !validEmail(email))
    throw new Error('A valid email address is required.');
  if ((command === 'list' && email) || (command !== 'create' && (name || role)))
    throw new Error('Unexpected arguments.');
  if (
    command === 'create' &&
    (!name ||
      name.trim() !== name ||
      name.length > 80 ||
      [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
      !['ADMIN', 'EDITOR'].includes(role ?? ''))
  )
    throw new Error('Provide a display name (1–80 characters) and role ADMIN or EDITOR.');
  if (remote) {
    const input = createInterface({ input: stdin, output: stdout });
    try {
      if ((await input.question('This changes the REMOTE database. Type YES: ')) !== 'YES')
        throw new Error('Cancelled.');
    } finally {
      input.close();
    }
  }
  const now = q(new Date().toISOString()),
    login = q(email?.toLowerCase() ?? '');
  const audit = (action: string) =>
    `INSERT INTO audit_log(at,login_id,action,detail) VALUES(${now},'owner-cli',${q(action)},${login});`;
  let sql =
    'SELECT id,login_id,display_name,role,disabled,created_at,last_login_at FROM users ORDER BY login_id;';
  if (command === 'create')
    sql = `INSERT INTO users(login_id,display_name,role,created_at) VALUES(${login},${q(name!)},${q(role!)},${now}); ${audit('CLI_USER_CREATE')}`;
  if (command === 'disable' || command === 'enable')
    sql = `UPDATE users SET disabled=${command === 'disable' ? 1 : 0} WHERE login_id=${login}; ${audit(command === 'disable' ? 'CLI_USER_DISABLE' : 'CLI_USER_ENABLE')}`;
  executeSql(sql, remote);
}
main().catch(() => {
  console.error(
    'User command failed. Check the arguments, user limits and last-admin rule. No credentials are required.',
  );
  process.exitCode = 1;
});
