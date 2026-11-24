{
  const C = window.APP_CONFIG || {};
  const api = window.TripAPI;
  const U = window.TripUtil;
  const REGIONS = window.REGIONS;
  const RBY = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
  const $ = (s) => document.querySelector(s);

  let room = null, teacherKey = null, picks = [], unsub = null;
  let seen = new Set(), firstLoad = true, openRegion = null;
  let geo = null, borders = null;

  if (C.TITLE) { $("#title").textContent = C.TITLE; document.title = C.TITLE + " · 교사 화면"; }

  // ---------- 방 ----------
  function joinUrl() {
    const u = new URL("join.html", location.href);
    u.search = "?room=" + encodeURIComponent(room);
    return u.toString();
  }
  function setRoomUrl() {
    const u = new URL(location.href);
    u.searchParams.set("room", room);
    try { history.replaceState(null, "", u); } catch (e) {}
    $("#roomCode").textContent = room;
    $("#clearBtn").hidden = !teacherKey;
  }
  async function newRoom() {
    for (let i = 0; i < 5; i++) {
      const code = U.randomString(5);
      const key = U.randomString(32, "abcdefghijkmnopqrstuvwxyz0123456789ABCDEFGHJKLMNPQRSTUVWXYZ");
      try {
        await api.createRoom(code, key);
        room = code; teacherKey = key;
        U.ls("jt_room", room); U.ls("jt_key_" + room, key);
        return;
      } catch (e) {
        if (!String(e.message).includes("ROOM_TAKEN")) throw e;
      }
    }
    throw new Error("방을 만들지 못했어요. 새로고침해 주세요.");
  }
  async function openRoom(code) {
    room = code; teacherKey = U.ls("jt_key_" + code);
    U.ls("jt_room", room);
  }

  // ---------- 데이터 ----------
  let loading = false, again = false;
  async function refresh() {
    if (!room) return;
    if (loading) { again = true; return; }
    loading = true;
    try {
      const list = await api.listPicks(room);
      const fresh = list.filter((p) => !seen.has(p.id + p.updated_at));
      picks = list;
      render(firstLoad ? new Set() : new Set(fresh.map((p) => p.id)));
      if (!firstLoad) fresh.forEach((p) => toast(p.nickname + " → " + (RBY[p.region] ? RBY[p.region].name : p.region)));
      seen = new Set(list.map((p) => p.id + p.updated_at));
      firstLoad = false;
    } catch (e) {
      setStatus(e.message, "bad");
    } finally {
      loading = false;
      if (again) { again = false; refresh(); }
    }
  }
  function startLive() {
    if (unsub) unsub();
    firstLoad = true; seen = new Set();
    unsub = api.subscribe(room, () => refresh(), (s) => {
      if (s === "SUBSCRIBED") setStatus("실시간 연결됨", "ok");
      else if (s === "DEMO") setStatus("데모 모드 · 이 브라우저 안에서만 공유", "warn");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("재연결 중… (20초마다 자동 갱신)", "warn");
    });
    refresh();
  }
  setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });

  function setStatus(text, kind) {
    const s = $("#status");
    s.textContent = text;
    s.className = "status " + (kind || "");
  }

  // ---------- 렌더 ----------
  function grouped() {
    const g = new Map(REGIONS.map((r) => [r.id, []]));
    for (const p of picks) if (g.has(p.region)) g.get(p.region).push(p);
    return g;
  }
  let newIds = new Set();
  function render(newOnes) {
    newIds = newOnes || new Set();
    drawMap();
    renderSide();
    $("#empty").hidden = picks.length > 0;
  }

  function renderSide() {
    const g = grouped();
    const rows = REGIONS.map((r) => ({ r, list: g.get(r.id) }))
      .sort((a, b) => b.list.length - a.list.length || REGIONS.indexOf(a.r) - REGIONS.indexOf(b.r));
    const max = Math.max(1, ...rows.map((x) => x.list.length));
    $("#total").textContent = picks.length;
    $("#top").textContent = rows[0].list.length ? rows[0].r.name : "-";

    const ul = $("#rank");
    ul.replaceChildren();
    for (const { r, list } of rows) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "rank-row" + (list.length ? "" : " zero");
      btn.setAttribute("aria-expanded", String(openRegion === r.id));
      btn.innerHTML = '<i class="sw"></i><span class="nm"></span><span class="bar"><i></i></span><span class="ct"></span>';
      btn.querySelector(".sw").style.background = r.color;
      btn.querySelector(".nm").textContent = r.name;
      const bar = btn.querySelector(".bar i");
      bar.style.width = (list.length / max * 100) + "%";
      bar.style.background = r.color;
      btn.querySelector(".ct").textContent = list.length;
      btn.addEventListener("click", () => { openRegion = openRegion === r.id ? null : r.id; renderSide(); });
      li.append(btn);
      if (openRegion === r.id) {
        const box = document.createElement("div");
        box.className = "names";
        for (const p of list) {
          const chip = document.createElement("span");
          chip.className = "chip" + (teacherKey ? "" : " ro");
          chip.append(document.createTextNode(p.nickname));
          if (teacherKey) {
            const x = document.createElement("button");
            x.textContent = "×";
            x.setAttribute("aria-label", p.nickname + " 삭제");
            x.addEventListener("click", async () => {
              if (!(await ask("학생 삭제", "'" + p.nickname + "' 님의 선택을 지울까요?"))) return;
              try { await api.deletePick(room, teacherKey, p.id); refresh(); } catch (e) { toast(e.message); }
            });
            chip.append(x);
          }
          box.append(chip);
        }
        li.append(box);
      }
      ul.append(li);
    }
    $("#hint").textContent = teacherKey
      ? "지역을 누르면 학생 이름이 펼쳐지고, ×로 지울 수 있어요."
      : "지역을 누르면 고른 학생 이름이 펼쳐져요.";
  }

  // ---------- 지도 ----------
  const svg = d3.select("#map");
  const measureCtx = document.createElement("canvas").getContext("2d");
  function textW(t, size, font) {
    measureCtx.font = size + "px " + (font || '"Noto Sans KR", sans-serif');
    return measureCtx.measureText(t).width;
  }

  async function loadShape() {
    const sources = [
      ["assets/japan.topojson", "pref"],
      ["https://cdn.jsdelivr.net/gh/dataofjapan/land@master/japan.topojson", "pref"],
      ["https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json", "world"]
    ];
    for (const [url, kind] of sources) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const topo = await res.json();
        if (kind === "world") {
          const fc = topojson.feature(topo, topo.objects.countries);
          geo = { type: "FeatureCollection", features: fc.features.filter((f) => String(f.id) === "392") };
          borders = null;
        } else {
          const key = Object.keys(topo.objects)[0];
          geo = topojson.feature(topo, topo.objects[key]);
          borders = topojson.mesh(topo, topo.objects[key], (a, b) => a !== b);
        }
        if (geo.features && geo.features.length) { drawMap(); return; }
      } catch (e) { /* 다음 소스 시도 */ }
    }
    $("#mapNote").textContent = "지도 모양을 불러오지 못했어요. 점과 이름표는 정상 표시됩니다.";
  }

  function drawMap() {
    const box = $("#mapBox");
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    const narrow = W < 760;
    const laneW = Math.round(narrow ? Math.max(118, W * 0.27) : Math.min(240, W * 0.21));
    const pad = 12;
    const proj = d3.geoMercator().fitExtent(
      [[laneW + pad * 2, pad + 6], [W - laneW - pad * 2, H - pad - 6]],
      { type: "MultiPoint", coordinates: [[127.4, 25.9], [145.9, 45.6]] }
    );
    const path = d3.geoPath(proj);
    svg.attr("viewBox", "0 0 " + W + " " + H);
    svg.selectAll("*").remove();

    if (geo) {
      svg.append("g").selectAll("path").data(geo.features).join("path").attr("class", "land").attr("d", path);
      if (borders) svg.append("path").attr("class", "pref").attr("d", path(borders));
    }

    const g = grouped();
    const fs = narrow ? 12 : 14;
    const rowH = fs + 10, headH = fs + 16, cpad = 8, gap = 8;

    // 빈 지역: 작은 고리 + 이름
    const pins = svg.append("g");
    for (const r of REGIONS) {
      if (g.get(r.id).length) continue;
      const [x, y] = proj([r.lon, r.lat]);
      pins.append("circle").attr("cx", x).attr("cy", y).attr("r", 4.5)
        .attr("fill", "#fff").attr("stroke", r.color).attr("stroke-width", 2);
      const side = r.pin || "r";
      pins.append("text").attr("class", "pin-label")
        .attr("x", side === "l" ? x - 8 : (side === "b" || side === "t") ? x : x + 8)
        .attr("y", side === "b" ? y + 18 : side === "t" ? y - 10 : y + 4)
        .attr("text-anchor", side === "l" ? "end" : (side === "b" || side === "t") ? "middle" : "start")
        .text(r.name);
    }

    // 이름표 카드 배치 (좌/우 레인에 위→아래로 쌓기)
    const cards = [];
    for (const lane of ["L", "R"]) {
      const items = REGIONS.filter((r) => r.side === lane && g.get(r.id).length)
        .map((r) => ({ r, p: proj([r.lon, r.lat]), list: g.get(r.id) }))
        .sort((a, b) => a.p[1] - b.p[1]);
      if (!items.length) continue;
      const n = items.length;
      const avail = H - pad * 2 - n * (headH + cpad * 2 + gap);
      const maxRows = Math.max(1, Math.min(8, Math.floor(avail / (n * rowH))));
      const inner = laneW - cpad * 2;

      for (const it of items) {
        // 닉네임 칩 흐름 배치
        const chipW = (t) => Math.ceil(textW(t, fs)) + 22;
        const placed = []; let row = 0, x = 0;
        let i = 0;
        for (; i < it.list.length; i++) {
          const w = Math.min(inner, chipW(it.list[i].nickname));
          if (x > 0 && x + w > inner) { row++; x = 0; }
          if (row >= maxRows) break;
          placed.push({ p: it.list[i], row, x, w });
          x += w + 5;
        }
        let rest = it.list.length - placed.length;
        if (rest > 0) {
          // 마지막 줄에 "+N명" 자리 확보
          let more = null;
          while (!more) {
            const label = "+" + rest + "명";
            const w = Math.ceil(textW(label, fs)) + 14;
            const last = placed[placed.length - 1];
            if (!last) { more = { label, row: 0, x: 0, w }; break; }
            const endX = last.x + last.w + 5;
            if (endX + w <= inner) more = { label, row: last.row, x: endX, w };
            else if (last.row + 1 < maxRows) more = { label, row: last.row + 1, x: 0, w };
            else { placed.pop(); rest++; }
          }
          it.more = more;
        }
        it.chips = placed;
        it.rows = Math.max(1, ...placed.map((c) => c.row + 1), it.more ? it.more.row + 1 : 0);
        it.h = headH + it.rows * rowH + cpad * 2 - 4;
        it.w = laneW;
        it.x = lane === "L" ? pad : W - pad - laneW;
        it.lane = lane;
      }
      // 겹치지 않게 위→아래, 넘치면 아래→위로 밀기
      let bottom = pad;
      for (const it of items) { it.y = Math.max(it.p[1] - it.h / 2, bottom); bottom = it.y + it.h + gap; }
      let limit = H - pad;
      for (let k = items.length - 1; k >= 0; k--) {
        const it = items[k];
        if (it.y + it.h > limit) it.y = limit - it.h;
        it.y = Math.max(pad, it.y);
        limit = it.y - gap;
      }
      cards.push(...items);
    }

    // 연결선
    const lines = svg.append("g");
    for (const c of cards) {
      const ex = c.lane === "L" ? c.x + c.w : c.x;
      const ey = c.y + headH / 2 + 2;
      const kx = ex + (c.lane === "L" ? 14 : -14);
      lines.append("path").attr("d", "M" + ex + "," + ey + "L" + kx + "," + ey + "L" + c.p[0] + "," + c.p[1])
        .attr("fill", "none").attr("stroke", c.r.color).attr("stroke-width", 1.6).attr("opacity", .75);
    }

    // 점 (해바라기 배열)
    const dots = svg.append("g");
    for (const c of cards) {
      c.list.forEach((p, i) => {
        const a = i * 2.39996, rr = 5.4 * Math.sqrt(i);
        dots.append("circle")
          .attr("class", "dot" + (newIds.has(p.id) ? " pop" : ""))
          .attr("cx", c.p[0] + rr * Math.cos(a)).attr("cy", c.p[1] + rr * Math.sin(a))
          .attr("r", narrow ? 4 : 5).attr("fill", c.r.color)
          .append("title").text(p.nickname);
      });
    }

    // 카드
    const cg = svg.append("g");
    for (const c of cards) {
      const g1 = cg.append("g").attr("transform", "translate(" + c.x + "," + c.y + ")");
      g1.append("rect").attr("width", c.w).attr("height", c.h).attr("rx", 12)
        .attr("fill", "#fff").attr("stroke", c.r.color).attr("stroke-width", 1.6);
      g1.append("circle").attr("cx", cpad + 6).attr("cy", cpad + headH / 2 - 2).attr("r", 6).attr("fill", c.r.color);
      g1.append("text").attr("class", "card-name").attr("x", cpad + 17).attr("y", cpad + headH / 2 + fs * 0.38)
        .attr("font-size", fs + 3).attr("fill", "#13222a").text(c.r.name);
      g1.append("text").attr("x", c.w - cpad).attr("y", cpad + headH / 2 + fs * 0.38).attr("text-anchor", "end")
        .attr("font-size", fs + 1).attr("font-weight", 700).attr("fill", c.r.color).text(c.list.length + "명");
      const top0 = cpad + headH;
      for (const ch of c.chips) {
        const cy = top0 + ch.row * rowH;
        const isNew = newIds.has(ch.p.id);
        g1.append("rect").attr("x", cpad + ch.x).attr("y", cy).attr("width", ch.w).attr("height", rowH - 4).attr("rx", (rowH - 4) / 2)
          .attr("fill", c.r.color).attr("fill-opacity", isNew ? .28 : .12);
        g1.append("circle").attr("cx", cpad + ch.x + 9).attr("cy", cy + (rowH - 4) / 2).attr("r", 3.5).attr("fill", c.r.color);
        const label = fitText(ch.p.nickname, ch.w - 22, fs);
        g1.append("text").attr("x", cpad + ch.x + 16).attr("y", cy + (rowH - 4) / 2 + fs * 0.36)
          .attr("font-size", fs).attr("fill", "#13222a").text(label);
      }
      if (c.more) {
        const cy = top0 + c.more.row * rowH;
        g1.append("text").attr("x", cpad + c.more.x + 6).attr("y", cy + (rowH - 4) / 2 + fs * 0.36)
          .attr("font-size", fs).attr("font-weight", 700).attr("fill", c.r.color).text(c.more.label);
      }
    }
  }
  function fitText(t, maxW, fs) {
    if (textW(t, fs) <= maxW) return t;
    let s = t;
    while (s.length > 1 && textW(s + "…", fs) > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  const ro = new ResizeObserver(() => drawMap());
  ro.observe($("#mapBox"));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawMap());

  // ---------- UI ----------
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 3500);
    while ($("#toasts").children.length > 4) $("#toasts").firstChild.remove();
  }
  function ask(title, text) {
    return new Promise((resolve) => {
      const d = $("#askDlg");
      $("#askTitle").textContent = title; $("#askText").textContent = text;
      const done = (v) => { d.close(); $("#askYes").onclick = $("#askNo").onclick = null; resolve(v); };
      $("#askYes").onclick = () => done(true);
      $("#askNo").onclick = () => done(false);
      d.onclose = () => resolve(false);
      d.showModal();
    });
  }

  $("#qrBtn").addEventListener("click", () => {
    const url = joinUrl();
    const box = $("#qr");
    box.replaceChildren();
    new QRCode(box, { text: url, width: 512, height: 512, correctLevel: QRCode.CorrectLevel.M });
    $("#qrCode").textContent = "방 코드 " + room;
    $("#qrUrl").textContent = url;
    $("#qrDlg").showModal();
  });
  $("#qrClose").addEventListener("click", () => $("#qrDlg").close());
  $("#copyBtn").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(joinUrl()); $("#copyBtn").textContent = "복사됨!"; }
    catch (e) { $("#copyBtn").textContent = "복사 실패 – 직접 복사해 주세요"; }
    setTimeout(() => { $("#copyBtn").textContent = "링크 복사"; }, 2000);
  });
  $("#fsBtn").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {}
  });
  $("#clearBtn").addEventListener("click", async () => {
    if (!(await ask("전체 초기화", "학생들의 선택을 모두 지울까요? 되돌릴 수 없어요."))) return;
    try { await api.clearRoom(room, teacherKey); refresh(); } catch (e) { toast(e.message); }
  });
  $("#newBtn").addEventListener("click", async () => {
    if (!(await ask("새 방 만들기", "새 방 코드를 만들어요. 지금 방은 그대로 남고, 새 QR을 다시 보여 주어야 해요."))) return;
    try { await newRoom(); setRoomUrl(); picks = []; render(); startLive(); } catch (e) { setStatus(e.message, "bad"); }
  });

  // ---------- 시작 ----------
  (async () => {
    if (api.mode === "demo") setStatus("데모 모드 · 이 브라우저 안에서만 공유", "warn");
    try {
      const fromUrl = (new URL(location.href).searchParams.get("room") || "").toUpperCase();
      const candidate = fromUrl || U.ls("jt_room");
      if (candidate && (await api.roomExists(candidate))) await openRoom(candidate);
      else await newRoom();
      setRoomUrl();
      render();
      startLive();
    } catch (e) {
      setStatus(e.message, "bad");
    }
    loadShape();
  })();
}
