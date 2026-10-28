# Vercel 운영 저장소 전환

이 프로젝트의 운영 데이터는 Vercel Marketplace에서 연결한 **Neon PostgreSQL**에 저장합니다. Neon은 외부 업체가 운영하는 DB이며, Vercel 대시보드는 연결과 환경변수 설정을 제공합니다. Vercel 함수의 로컬 파일은 영구 공용 저장소가 아닙니다. 로컬 개발과 기존 데이터 원본은 SQLite를 유지합니다.

현재 앱은 첨부파일 업로드 기능이 없습니다. 서명은 등록정보의 암호화된 `data` 필드에 포함됩니다. 향후 민감한 첨부파일을 추가할 때는 Vercel Blob의 private store와 관리자 인증을 거치는 서버 다운로드 API를 사용해야 합니다. Blob을 관계형 DB나 세션 저장소로 사용하지 않습니다.

## 1. Vercel 연결

1. Vercel 프로젝트의 Storage/Marketplace에서 Neon PostgreSQL을 새로 연결합니다. 요금제, 저장 지역, 백업 정책을 확인합니다.
2. Marketplace가 넣은 연결 문자열을 `DATABASE_URL`로 사용할 수 있게 설정합니다. 제공 변수가 `POSTGRES_URL`이면 코드에서 그대로 인식하지만, `DATABASE_URL`로 통일하는 편이 명확합니다. 값은 서버 전용 환경변수로 유지합니다.
3. Production 환경에 `STORAGE_BACKEND=postgres`, `APP_ORIGIN=https://safe-kohl-tau.vercel.app`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, 기존 데이터와 같은 `DATA_ENCRYPTION_KEY`를 설정합니다. 새 DB일 때만 비기본값 `INITIAL_ADMIN_PASSWORD`를 설정합니다. 비밀값은 저장소나 빌드 로그에 넣지 않습니다.
4. 동일 설정을 로컬 `.env.local`에 일시적으로 준비하되, 원본 SQLite의 `DATABASE_PATH`는 유지합니다. 운영 DB 연결이 허용되는 관리 PC에서 `npm run db:init:postgres`를 실행합니다. 이 명령은 테이블을 만들고, 비어 있으면 초기 관리자 계정을 생성합니다.
5. 데이터 이전·검증 뒤 Vercel 재배포를 진행합니다. 환경변수 변경은 기존 배포에 자동 적용되지 않으므로 새 배포가 필요합니다.

`STORAGE_BACKEND` 또는 연결 문자열이 누락되면 저장을 성공으로 표시하지 않습니다. API는 오류 번호를 사용자에게 반환하고 같은 번호, 경로, 오류 종류와 DB 오류 코드를 서버 로그에 남깁니다. 로그에서 비밀값과 개인정보는 제외합니다.

## 2. 기존 SQLite 데이터 이전

1. 서비스 쓰기를 잠시 중지하고 SQLite 원본 파일과 WAL/SHM 파일을 함께 비공개 위치에 백업합니다. 백업을 복원할 수 있는지 확인합니다.
2. 기존 `DATA_ENCRYPTION_KEY`를 유지합니다. 키가 다르면 이전 도구는 암호문 검증 단계에서 실패합니다.
3. 새 PostgreSQL DB에 `npm run db:init:postgres`를 실행합니다.
4. `npm run db:migrate:postgres`로 원본 테이블 건수를 확인합니다. 개인별 데이터는 출력하지 않습니다.
5. 대상 DB가 초기 관리자 외에는 비어 있는지 확인하고 `npm run db:migrate:postgres -- --apply`를 실행합니다. 전체 이전은 한 트랜잭션으로 처리하며 건수 불일치나 중복 데이터가 있으면 롤백합니다. 원본 SQLite는 수정하거나 삭제하지 않습니다.
6. 이전 완료 뒤 관리자 로그인, 등록정보 복호화/조회, 영상 목록, 등록·수정·삭제·감사로그를 점검합니다. 기존 관리자 해시와 세션도 이전되므로 필요하면 기존 세션을 운영 절차에 따라 무효화합니다.

원본이 이 저장소의 SQLite가 아니라 다른 배포의 Supabase라면 이 도구를 그대로 실행할 수 없습니다. 그 배포의 실제 스키마와 데이터 덤프를 먼저 확보하고 별도 변환 절차를 작성해야 합니다.

## 3. 배포 확인 및 복구

배포 후 새 브라우저에서 등록한 데이터가 새로고침·재접속·다른 브라우저의 관리자 조회 후에도 유지되는지 확인합니다. 비인증 등록 상세·내보내기 접근은 401/403, 잘못된 Origin의 변경 요청은 403이어야 합니다. 배포본에서 문제가 나면 쓰기를 중지하고 이전 배포로 롤백합니다. 이전 배포가 SQLite 기반이면 이미 PostgreSQL에 저장된 새 데이터가 보이지 않으므로, 운영 데이터 복원 시점과 경로를 정한 뒤 전환해야 합니다. PostgreSQL 복구는 Neon 백업/복원 기능과 별도 검증된 백업에 의존합니다.

## 4. 현재 검증 경계

로컬 타입 검사, 빌드, SQLite 통합 테스트와 SQLite 원본의 이전 예행 점검은 수행할 수 있습니다. Neon 연결, PostgreSQL 마이그레이션 실제 실행, Vercel 로그의 기존 오류 번호 조회, 여러 브라우저·재배포 후 영속성은 계정 연결과 배포 후에 확인해야 합니다.
