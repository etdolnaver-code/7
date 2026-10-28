import { db, transaction, audit } from '../lib/db.ts';
import { todayKST } from '../lib/domain.ts';
const today = todayKST();
const expired = await db().prepare('SELECT id,end_date FROM registrations').all() as {
  id: string;
  end_date: string;
}[];
function expiry(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y + 1, m - 1, d));
  if (next.getUTCMonth() !== m - 1) next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}
const targets = expired.filter((r) => expiry(r.end_date) < today);
if (!process.argv.includes('--apply')) {
  console.log(
    '삭제 예정: ' +
      targets.length +
      '건. 확정된 보유기간 정책에 따라 --apply로 실행하세요. 개인정보는 출력하지 않습니다.',
  );
  process.exit(0);
}
await transaction(async () => {
  for (const r of targets) {
    await db().prepare('DELETE FROM registrations WHERE id=?').run(r.id);
    await audit('system', 'RETENTION_DELETE', r.id);
  }
  const now = Date.now();
  await db().prepare('DELETE FROM sessions WHERE expires_at<?').run(now);
  await db().prepare('DELETE FROM visitors WHERE expires_at<?').run(now);
  await db().prepare('DELETE FROM visitor_drafts WHERE expires_at<?').run(now);
  await db().prepare('DELETE FROM rate_limits WHERE reset_at<?').run(now);
  await db()
    .prepare('DELETE FROM view_events WHERE opened_at<?')
    .run(new Date(now - 86400000).toISOString());
  await db()
    .prepare('DELETE FROM audit WHERE at<?')
    .run(new Date(now - 366 * 86400000).toISOString());
});
// SQLite WAL 내 삭제된 내용도 정리. 실행 중인 서비스와 경합할 수 있으므로 유지보수 시간에 수행.
if (process.env.STORAGE_BACKEND !== 'postgres') {
  const { DatabaseSync } = await import('node:sqlite');
  const { resolve } = await import('node:path');
  const local = new DatabaseSync(resolve(process.env.DATABASE_PATH ?? './data/mbco.sqlite'));
  local.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  local.close();
}
console.log(
  '보유기간 만료 ' +
    targets.length +
    '건 삭제 완료. 별도 백업도 동일한 보유기간 정책으로 정리하세요.',
);
