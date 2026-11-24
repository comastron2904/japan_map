// 학생이 고를 수 있는 지역 목록.
// id : 영문 소문자만 (DB 검증 규칙), side : 교사 지도에서 이름표 카드가 놓일 쪽 (L=왼쪽, R=오른쪽)
// inset : true면 오른쪽 아래 확대 박스(인셋)에 표시 — 오키나와처럼 멀리 떨어진 섬용
// pin : 아무도 안 고른 지역의 작은 이름 위치 (l 왼쪽, r 오른쪽, t 위, b 아래)
// 지역을 바꾸거나 추가하려면 이 배열만 고치면 됩니다.
window.REGIONS = [
  { id: "hokkaido",  name: "홋카이도",     sub: "삿포로 · 오타루 · 눈축제",      lat: 43.06, lon: 141.35, color: "#60a5fa", side: "L", pin: "r" },
  { id: "tohoku",    name: "도호쿠",       sub: "센다이 · 아오모리 · 온천",      lat: 38.27, lon: 140.87, color: "#a3e635", side: "R", pin: "r" },
  { id: "tokyo",     name: "도쿄",         sub: "시부야 · 아사쿠사 · 스카이트리", lat: 35.68, lon: 139.77, color: "#f87171", side: "R", pin: "r" },
  { id: "hakone",    name: "후지산·하코네", sub: "후지산 · 온천 · 아시호수",      lat: 35.30, lon: 138.90, color: "#e879f9", side: "R", pin: "b" },
  { id: "kanazawa",  name: "가나자와",     sub: "겐로쿠엔 · 히가시차야 거리",    lat: 36.56, lon: 136.65, color: "#facc15", side: "L", pin: "r" },
  { id: "nagoya",    name: "나고야",       sub: "나고야성 · 미소카츠",          lat: 35.18, lon: 136.91, color: "#22d3ee", side: "R", pin: "t" },
  { id: "kyoto",     name: "교토",         sub: "기요미즈데라 · 후시미이나리",    lat: 35.01, lon: 135.77, color: "#f472b6", side: "L", pin: "l" },
  { id: "osaka",     name: "오사카",       sub: "도톤보리 · 오사카성 · 테마파크", lat: 34.69, lon: 135.50, color: "#fb923c", side: "R", pin: "b" },
  { id: "hiroshima", name: "히로시마",     sub: "평화기념공원 · 미야지마",       lat: 34.39, lon: 132.46, color: "#4ade80", side: "L", pin: "l" },
  { id: "shikoku",   name: "시코쿠",       sub: "다카마쓰 우동 · 도고온천",      lat: 33.80, lon: 133.40, color: "#a78bfa", side: "R", pin: "b" },
  { id: "fukuoka",   name: "후쿠오카",     sub: "하카타 라멘 · 다자이후",        lat: 33.59, lon: 130.40, color: "#93c5fd", side: "L", pin: "l" },
  { id: "okinawa",   name: "오키나와",     sub: "나하 · 에메랄드 바다 · 수족관",  lat: 26.21, lon: 127.68, color: "#5eead4", side: "R", pin: "b", inset: true }
];
