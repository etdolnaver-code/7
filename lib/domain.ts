import { z } from 'zod';
export const purposes = ['공사·설치', '점검', '재작업', '기타'] as const;
export const safetyRules = [
  '지정된 안전모·안전화 등 개인보호구를 올바르게 착용합니다.',
  '고소작업 시 안전대와 추락방지 시설을 확인합니다.',
  '화기작업 전 허가를 받고 소화기·화재감시 등 안전조치를 이행합니다.',
  '밀폐공간 출입 전 산소·유해가스를 측정하고 감시인과 구조계획을 확보합니다.',
  '설비의 모든 에너지원을 차단하고 잠금·표지(LOTO)를 시행합니다.',
  '작업허가 승인 후 정해진 작업범위와 절차를 준수합니다.',
  '위험상황에서는 즉시 작업을 중지하고 MBCo. 담당자에게 보고합니다.',
];
export const POLICY_VERSION = '2026-10-v1';
export const privacyText =
  '수집·이용 목적: 신원 확인, 출입관리, 안전교육 이력 및 작업이력 관리, 비상연락. 수집 항목: 회사명, 성명, 연락처, 작업기간, 방문 목적, 작업발주 담당자, 교육 이력, 안전서약 기록 및 전자서명. 보유기간: 작업 종료일로부터 1년(운영 전 확정 필요). 동의를 거부할 권리가 있으며, 동의하지 않으면 본 시스템에서 출입등록을 제출할 수 없습니다.';
export const todayKST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const short = z.string().trim().min(1, '필수 항목입니다.').max(100, '100자 이내로 입력하세요.');
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 선택하세요.')
  .refine(
    (v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    '올바른 날짜를 입력하세요.',
  );
export const basicSchema = z.object({
  startDate: day,
  endDate: day,
  company: short,
  name: short,
  phone: z.string().regex(/^010-\d{4}-\d{4}$/, '010-0000-0000 형식으로 입력하세요.'),
  team: short,
  contact: short,
  purpose: z.enum(purposes),
  otherPurpose: z.string().trim().max(300).default(''),
  educationCompleted: z.boolean(),
  educationDate: z.union([day, z.literal('')]),
  educationCertificateContact: z.string().trim().max(100).default(''),
});
export const refinedBasic = basicSchema.superRefine((v, c) => {
  if (v.endDate < v.startDate)
    c.addIssue({ code: 'custom', path: ['endDate'], message: '종료일은 시작일 이후여야 합니다.' });
  if (v.purpose === '기타' && !v.otherPurpose)
    c.addIssue({ code: 'custom', path: ['otherPurpose'], message: '방문 목적을 입력하세요.' });
  if (!v.educationDate || (v.educationCompleted && v.educationDate > todayKST()))
    c.addIssue({
      code: 'custom',
      path: ['educationDate'],
      message: v.educationCompleted ? '오늘까지의 교육일을 입력하세요.' : '교육 예정일을 입력하세요.',
    });
  if (v.educationCompleted && !v.educationCertificateContact)
    c.addIssue({
      code: 'custom',
      path: ['educationCertificateContact'],
      message: '이수증 제출 담당자 성명을 입력하세요.',
    });
  if (!v.educationCompleted && v.educationCertificateContact)
    c.addIssue({ code: 'custom', path: ['educationCertificateContact'], message: '미이수 상태에서는 이수증 제출 담당자를 입력할 수 없습니다.' });
});
export const draftSchema = z.object({
  basic: basicSchema.extend({
    startDate: z.union([day, z.literal('')]),
    endDate: z.union([day, z.literal('')]),
    company: z.string().max(100),
    name: z.string().max(100),
    phone: z.string().max(13).regex(/^[0-9-]*$/),
    team: z.string().max(100),
    contact: z.string().max(100),
  }),
  step: z.number().int().min(0).max(3),
  pledge: z.boolean(),
  attested: z.boolean(),
  consent: z.boolean().nullable(),
  requestId: z.uuid(),
});
export type Draft = z.infer<typeof draftSchema>;
export const signatureSchema = z
  .array(
    z
      .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
      .min(2)
      .max(2500),
  )
  .min(1)
  .max(80)
  .refine((strokes) => {
    let length = 0;
    for (const s of strokes)
      for (let i = 1; i < s.length; i++)
        length += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    return length > 0.15;
  }, '서명란에 직접 서명해 주세요.');
export const registrationSchema = z
  .object({
    basic: refinedBasic,
    pledge: z.literal(true),
    consent: z.literal(true),
    educationAttested: z.boolean(),
    signature: signatureSchema,
    requestId: z.uuid(),
  })
  .superRefine((v, c) => {
    if (v.basic.educationCompleted && !v.educationAttested)
      c.addIssue({
        code: 'custom',
        path: ['educationAttested'],
        message: '교육 이수 사실을 직접 확인해 주세요.',
      });
    if (!v.basic.educationCompleted && v.educationAttested)
      c.addIssue({
        code: 'custom',
        path: ['educationAttested'],
        message: '교육 이수 상태를 확인하세요.',
      });
  });
export const passwordSchema = z
  .string()
  .regex(/^\d{8,16}$/, '새 비밀번호는 숫자 8~16자리여야 합니다.')
  .refine(
    (v) =>
      !(
        /^(\d)\1+$/.test(v) ||
        '01234567890123456789'.includes(v) ||
        '98765432109876543210'.includes(v) ||
        /^(\d{2,4})\1+$/.test(v)
      ),
    '반복·연속 숫자는 사용할 수 없습니다.',
  );
export const videoSchema = z.object({
  title: short,
  url: z.string().url().max(500),
  sortOrder: z.number().int().min(0).max(9999),
  visible: z.boolean(),
});
export function youtubeId(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    let id: string | null = null;
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(u.hostname)) {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/);
        id = m?.[1] ?? null;
      }
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
export type Basic = z.infer<typeof basicSchema>;
export type Signature = z.infer<typeof signatureSchema>;
export type Video = {
  id: string;
  title: string;
  youtubeId: string;
  url: string;
  sortOrder: number;
  visible: boolean;
  deleted?: number;
};
export type Registration = {
  id: string;
  receipt: string;
  createdAt: string;
  pledgeDate: string;
  basic: Basic;
  originalBasic: Basic;
  signature: Signature;
  consent: true;
  pledge: true;
  policyVersion: string;
  policyText: string;
  pledgeText: string[];
  educationAttested: boolean;
  educationVerified: boolean;
  verificationNote: string;
  verifiedAt: string | null;
  viewEvents: { videoId: string; title: string; openedAt: string; completedAt?: string | null }[];
  version: number;
};
