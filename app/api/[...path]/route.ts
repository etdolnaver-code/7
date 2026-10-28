import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { get, mutate } from '@/lib/service';
import { HttpError, json } from '@/lib/security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    return req.method === 'GET' ? await get(req, path) : await mutate(req, path);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError)
      return json(
        { error: e.issues[0]?.message ?? '입력값을 확인하세요.', fields: e.flatten() },
        400,
      );
    const errorId = randomUUID();
    console.error('API failure', {
      errorId,
      route: req.nextUrl.pathname,
      method: req.method,
      name: e instanceof Error ? e.name : 'UnknownError',
      code: typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : undefined,
      configuration: e instanceof Error && /^(DATABASE_URL|DATA_ENCRYPTION_KEY|STORAGE_BACKEND)/.test(e.message)
        ? e.message : undefined,
    });
    return json({ error: '서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요. (오류 번호: ' + errorId + ')' }, 500);
  }
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
