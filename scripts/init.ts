import { db } from '../lib/db.ts';
if (process.env.STORAGE_BACKEND === 'postgres')
  throw new Error('Use npm run db:init:postgres for PostgreSQL');
db();
console.log('MBCo. 데이터베이스와 관리자 계정이 준비되었습니다.');
