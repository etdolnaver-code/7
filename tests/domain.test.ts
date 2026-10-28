import test from 'node:test';
import assert from 'node:assert/strict';
import {
  refinedBasic,
  signatureSchema,
  passwordSchema,
  youtubeId,
  registrationSchema,
} from '../lib/domain.ts';
const basic = {
  startDate: '2026-10-15',
  endDate: '2026-10-16',
  company: '테스트업체',
  name: '시험작업자',
  phone: '010-1234-5678',
  team: '안전팀',
  contact: '시험담당자',
  purpose: '점검',
  otherPurpose: '',
  educationCompleted: false,
  educationDate: '2099-01-01',
  educationCertificateContact: '',
};
test('기본정보와 연락처/날짜 검증', () => {
  assert.ok(refinedBasic.safeParse(basic).success);
  assert.equal(refinedBasic.safeParse({ ...basic, endDate: '2026-10-14' }).success, false);
  assert.equal(refinedBasic.safeParse({ ...basic, startDate: '2026-02-30' }).success, false);
  assert.equal(refinedBasic.safeParse({ ...basic, phone: 'abc' }).success, false);
  assert.equal(refinedBasic.safeParse({ ...basic, purpose: '기타' }).success, false);
});
test('교육 이수일과 본인 확인 검증', () => {
  assert.equal(refinedBasic.safeParse({ ...basic, educationDate: '' }).success, false);
  assert.equal(refinedBasic.safeParse({ ...basic, educationCompleted: true }).success, false);
  assert.equal(
    refinedBasic.safeParse({ ...basic, educationCompleted: true, educationDate: '2099-01-01' })
      .success,
    false,
  );
  assert.equal(refinedBasic.safeParse({ ...basic, educationCertificateContact: '시험담당자' }).success, false);
  assert.ok(refinedBasic.safeParse({ ...basic, educationCompleted: true, educationDate: '2026-01-01', educationCertificateContact: '시험담당자' }).success);
});
test('빈 서명, 점만 찍기, 범위 밖 좌표 거부', () => {
  assert.equal(signatureSchema.safeParse([]).success, false);
  assert.equal(
    signatureSchema.safeParse([
      [
        { x: 0.1, y: 0.1 },
        { x: 0.1, y: 0.1 },
      ],
    ]).success,
    false,
  );
  assert.equal(
    signatureSchema.safeParse([
      [
        { x: -1, y: 0 },
        { x: 0.9, y: 0.8 },
      ],
    ]).success,
    false,
  );
  assert.ok(
    signatureSchema.safeParse([
      [
        { x: 0.1, y: 0.2 },
        { x: 0.7, y: 0.8 },
      ],
    ]).success,
  );
});
test('동의 거부 또는 서약 미확인 등록 거부', () => {
  const payload = {
    basic,
    pledge: true,
    consent: true,
    educationAttested: false,
    signature: [
      [
        { x: 0.1, y: 0.2 },
        { x: 0.7, y: 0.8 },
      ],
    ],
    requestId: crypto.randomUUID(),
  };
  assert.ok(registrationSchema.safeParse(payload).success);
  assert.equal(registrationSchema.safeParse({ ...payload, consent: false }).success, false);
  assert.equal(registrationSchema.safeParse({ ...payload, pledge: false }).success, false);
});
test('비밀번호 정책', () => {
  for (const p of ['1111', '11111111', '12345678', '87654321', '12121212', '12341234'])
    assert.equal(passwordSchema.safeParse(p).success, false, p);
  assert.ok(passwordSchema.safeParse('48296173').success);
});
test('YouTube URL만 허용, 유사 도메인/프로토콜 거부', () => {
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  for (const u of [
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'http://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ',
    'https://localhost/',
    'https://youtu.be/short',
  ])
    assert.equal(youtubeId(u), null);
});
