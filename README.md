# 우리 반 일본 여행지 지도 (실시간)

교사 화면에 일본 지도를 띄우고 **[여행지 선택]** 버튼을 누르면 QR 코드가 나옵니다.
학생이 QR을 찍어 **닉네임 + 지역**을 고르면, 교사 화면 지도에 **색 점과 닉네임 이름표**가 실시간으로 나타납니다.

- 구성: **Supabase**(DB + Realtime) · **GitHub**(코드) · **Vercel**(배포)
- 빌드 없는 정적 사이트 (HTML/CSS/JS). `npm install` 필요 없음

---

## 1. 구조

```
학생 휴대폰 (join.html)                 교사 화면 (index.html)
  닉네임 + 지역 선택                       일본 지도 + 점 + 이름표 + 순위
        │  rpc('submit_pick')                     ▲
        ▼                                          │ Realtime(postgres_changes)
 ┌──────────────── Supabase ─────────────────┐     │ → 변경 시 목록 다시 읽기
 │ rooms  (code, teacher_key_hash)           │     │   (+20초마다 자동 갱신 보조)
 │ picks  (room, client_id, nickname, region)├─────┘
 │ RLS: 읽기만 허용 / 쓰기는 함수로만           │
 └───────────────────────────────────────────┘
        ▲
 GitHub 저장소 ──push──▶ Vercel 자동 배포 (https://<프로젝트>.vercel.app)
```

| 파일 | 역할 |
|---|---|
| `index.html`, `assets/teacher.js` | 교사 메인 화면: 지도, QR, 순위, 학생 삭제/초기화 |
| `join.html`, `assets/student.js` | 학생 화면: 닉네임 입력 + 지역 카드 선택 |
| `assets/regions.js` | 고를 수 있는 지역 12곳 (이름·좌표·색) — 여기만 고치면 지역 변경 |
| `assets/api.js` | Supabase 호출 / 설정이 비어 있으면 데모 모드 |
| `config.js` | Supabase URL·공개 키 입력 |
| `supabase/schema.sql` | 테이블·보안 규칙·함수·Realtime 설정 (한 번 실행) |

**동작 방식**
- 교사 화면을 처음 열면 **방 코드(예: `K7P3M`)** 가 자동으로 만들어지고, 그 브라우저에 교사 키가 저장됩니다. 반마다 [새 방]을 누르면 따로 관리할 수 있어요.
- QR은 `https://<사이트>/join.html?room=K7P3M` 주소를 담습니다.
- 학생 기기마다 고유 ID가 있어 **다시 고르면 점이 새로 생기지 않고 옮겨집니다.**
- 같은 지역을 고른 학생 점은 해바라기 모양으로 모이고, 바다 쪽 이름표 카드에 닉네임이 표시됩니다. 많으면 `+N명`으로 줄이고 오른쪽 순위에서 전체 명단을 볼 수 있어요.
- 교사는 순위에서 지역을 눌러 부적절한 닉네임을 ×로 지우거나 [초기화]할 수 있습니다 (방을 만든 브라우저에서만).

---

## 2. Supabase 설정 (5분)

1. https://supabase.com 에서 **New project** 생성 (Region: Northeast Asia (Seoul) 추천)
2. 왼쪽 **SQL Editor** → **New query** → `supabase/schema.sql` 내용을 전부 붙여넣고 **Run**
3. **Project Settings → API** (또는 **API Keys**)에서 다음 두 값을 복사
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public 키** (또는 새 형식의 **publishable 키** `sb_publishable_...`)
4. `config.js`에 붙여넣기

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  TITLE: "3학년 2반 일본 수학여행 지도"
};
```

> ⚠️ `service_role` / `secret` 키는 절대 넣지 마세요. anon(publishable) 키는 공개돼도 되는 키이고,
> 실제 보안은 `schema.sql`의 RLS와 함수 검증이 담당합니다.

Realtime이 안 붙는 것 같으면: **Database → Publications → supabase_realtime** 에 `picks` 테이블이 켜져 있는지 확인하세요. (꺼져 있어도 20초마다 자동 갱신은 됩니다.)

## 3. GitHub에 올리기

```bash
cd japan-trip-map
git init
git add .
git commit -m "일본 여행지 실시간 지도"
git branch -M main
git remote add origin https://github.com/<내아이디>/japan-trip-map.git
git push -u origin main
```

(명령어가 낯설면 GitHub 웹에서 새 저장소를 만들고 **Add file → Upload files**로 폴더 내용을 끌어다 놓아도 됩니다.)

## 4. Vercel 배포

1. https://vercel.com → GitHub로 로그인 → **Add New… → Project**
2. 방금 만든 저장소 **Import**
3. Framework Preset: **Other** / Build Command: 비움 / Output Directory: 비움 (루트 그대로)
4. **Deploy** → `https://japan-trip-map-xxxx.vercel.app` 주소가 생깁니다
5. 이후 GitHub에 push할 때마다 자동으로 다시 배포됩니다

## 5. 수업에서 쓰기

1. 교실 PC에서 Vercel 주소를 열고 **[전체 화면]**
2. **[여행지 선택]** → QR을 화면에 띄움 → 학생들이 휴대폰 카메라로 찍기
3. 학생이 닉네임·지역을 고르면 지도에 바로 점이 찍히고, 오른쪽 아래에 "민준 → 도쿄" 알림이 뜹니다
4. 다음 반은 **[새 방]** (이전 방 기록은 남음) 또는 **[초기화]**

---

## 데모 모드로 먼저 확인하기

`config.js`를 비워 둔 채 로컬 서버로 열면, 같은 브라우저의 탭끼리만 공유되는 데모 모드로 동작합니다.

```bash
cd japan-trip-map
python3 -m http.server 8000
# 탭1: http://localhost:8000/            (교사)
# 탭2: QR 아래 주소를 그대로 열기          (학생)
```

## 지도 데이터

지도 모양은 열릴 때 [dataofjapan/land](https://github.com/dataofjapan/land)의 `japan.topojson`(도도부현 경계)을 CDN에서 불러오고,
실패하면 world-atlas의 일본 외곽선을 씁니다. 학교 네트워크에서 CDN이 막히는 경우를 대비하려면 그 파일을 받아
**`assets/japan.topojson`** 으로 저장해 두세요 — 이 파일이 있으면 가장 먼저 사용합니다.
(지도 모양을 못 불러와도 점·이름표는 좌표대로 정상 표시됩니다.)

## 지역 바꾸기

`assets/regions.js`에서 항목을 추가·수정하세요.

```js
{ id: "nara", name: "나라", sub: "사슴공원 · 도다이지", lat: 34.68, lon: 135.83, color: "#be185d", side: "R", pin: "b" }
```

- `id`는 **영문 소문자 2~20자** (DB 검증 규칙)
- `side`: 이름표 카드가 놓일 쪽 (`L` 왼쪽 바다 / `R` 오른쪽 바다)
- `pin`: 아무도 안 골랐을 때 작은 지역명 위치 (`l` `r` `t` `b`)

## 보안·한계

- 학생은 로그인 없이 참여합니다. 쓰기는 `submit_pick` 함수로만 가능하고, 닉네임 1~12자·방 존재·방당 300명 제한을 서버에서 검사합니다.
- 초기화·삭제는 방을 만든 브라우저에 저장된 **교사 키**가 있어야 가능합니다 (DB에는 bcrypt 해시만 저장).
  다른 PC에서 같은 방을 열면 보기만 가능합니다.
- 닉네임은 누구나 읽을 수 있는 공개 데이터입니다. 실명 대신 별명을 쓰도록 안내하세요.
- 학생 화면은 Realtime 연결을 쓰지 않으므로(교사 화면만 연결), Supabase 무료 플랜의 동시 접속 한도에 걸릴 일이 거의 없습니다.
- 오래된 방 정리: `schema.sql` 맨 아래 주석의 SQL을 가끔 실행하세요.
