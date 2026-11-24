{
  const api = window.TripAPI;
  const U = window.TripUtil;
  const REGIONS = window.REGIONS;
  const $ = (s) => document.querySelector(s);

  const room = (new URL(location.href).searchParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let region = null, busy = false;

  // 기기별 고유 ID: 다시 제출하면 새 점이 아니라 내 점이 옮겨짐
  let clientId = U.ls("jt_client");
  if (!clientId) {
    clientId = U.randomString(24, "abcdefghijklmnopqrstuvwxyz0123456789");
    U.ls("jt_client", clientId);
  }

  $("#roomCode").textContent = room || "-----";
  $("#demoBanner").hidden = api.mode !== "demo";

  // 지역 카드
  const grid = $("#grid");
  for (const r of REGIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "reg";
    b.dataset.id = r.id;
    b.style.setProperty("--c", r.color);
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = "<b><i></i><span></span></b><span></span>";
    b.querySelector("b i").style.background = r.color;
    b.querySelector("b span").textContent = r.name;
    b.lastElementChild.textContent = r.sub;
    b.addEventListener("click", () => { region = r.id; sync(); });
    grid.append(b);
  }

  const nick = $("#nick");
  nick.value = U.ls("jt_nick") || "";
  nick.addEventListener("input", sync);

  function sync() {
    const n = nick.value.trim();
    $("#nickCount").textContent = nick.value.length;
    for (const b of grid.children) b.setAttribute("aria-pressed", String(b.dataset.id === region));
    const r = REGIONS.find((x) => x.id === region);
    const ok = n.length > 0 && !!r;
    $("#submit").disabled = !ok || busy;
    $("#submit").textContent = busy ? "보내는 중…"
      : ok ? r.name + "(으)로 선택하기"
      : !n.length ? "닉네임을 써 주세요" : "지역을 골라 주세요";
    $("#err").textContent = "";
  }

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = nick.value.trim();
    const r = REGIONS.find((x) => x.id === region);
    if (!n || !r || busy) return;
    busy = true; sync();
    try {
      await api.submitPick(room, clientId, n, r.id);
      U.ls("jt_nick", n);
      $("#doneView").style.setProperty("--c", r.color);
      $("#doneBadge").textContent = r.name;
      $("#doneTitle").textContent = n + " 님은 " + r.name + "!";
      $("#formView").hidden = true;
      $("#doneView").hidden = false;
      window.scrollTo(0, 0);
    } catch (err) {
      $("#err").textContent = err.message;
    } finally {
      busy = false; sync();
    }
  });

  $("#again").addEventListener("click", () => {
    $("#doneView").hidden = true;
    $("#formView").hidden = false;
  });

  (async () => {
    if (!room) { $("#badView").hidden = false; return; }
    try {
      if (await api.roomExists(room)) { $("#formView").hidden = false; sync(); }
      else $("#badView").hidden = false;
    } catch (e) {
      $("#badText").textContent = e.message;
      $("#badView").hidden = false;
    }
  })();
}
