{
  const C = window.APP_CONFIG || {};
  const api = window.TripAPI;
  const U = window.TripUtil;
  const REGIONS = window.REGIONS;
  const RBY = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
  const $ = (s) => document.querySelector(s);

  let room = null, teacherKey = null, picks = [], unsub = null;
  let seen = new Set(), firstLoad = true, openRegion = null;
  let borders = null;

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
      if (!firstLoad) fresh.forEach((p) => toast(p.nickname, RBY[p.region]));
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
  function textW(t, size, weight) {
    measureCtx.font = (weight || 400) + " " + size + 'px "Noto Sans KR", sans-serif';
    return measureCtx.measureText(t).width;
  }
  let land = null;
  const MAIN = { type: "MultiPoint", coordinates: [[129.2, 30.9], [145.9, 45.6]] };   // 본토
  const OKI = { type: "MultiPoint", coordinates: [[126.65, 25.95], [128.4, 26.95]] };  // 오키나와 인셋

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
          const geoms = topo.objects.countries.geometries.filter((g) => String(g.id) === "392");
          if (!geoms.length) continue;
          land = topojson.merge(topo, geoms);
          borders = null;
        } else {
          const key = Object.keys(topo.objects)[0];
          land = topojson.merge(topo, topo.objects[key].geometries);
          borders = topojson.mesh(topo, topo.objects[key], (a, b) => a !== b);
        }
        drawMap();
        return;
      } catch (e) { /* 다음 소스 시도 */ }
    }
    $("#mapNote").textContent = "지도 모양을 불러오지 못했어요. 핀과 이름표는 정상 표시됩니다.";
  }

  function drawMap() {
    const box = $("#mapBox");
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    const narrow = W < 760;
    const laneW = Math.round(narrow ? Math.max(118, W * 0.27) : Math.min(230, W * 0.2));
    const pad = 14;
    const proj = d3.geoMercator().fitExtent([[laneW + pad * 2, pad + 6], [W - laneW - pad * 2, H - pad - 6]], MAIN);
    const path = d3.geoPath(proj);
    const [mx0, my0] = proj([129.2, 45.6]);
    const [mx1, my1] = proj([145.9, 30.9]);
    const iw = Math.max(120, (mx1 - mx0) * 0.3), ih = iw * 0.78;
    const ix = mx1 - iw, iy = my1 - ih;
    const iproj = d3.geoMercator().fitExtent([[ix + 14, iy + 28], [ix + iw - 14, iy + ih - 14]], OKI);
    const ipath = d3.geoPath(iproj);
    const at = (r) => (r.inset ? iproj : proj)([r.lon, r.lat]);
    const depth = narrow ? 4 : 7;

    svg.attr("viewBox", "0 0 " + W + " " + H);
    svg.selectAll("*").remove();

    // ----- defs : 빛, 그림자, 핀 구슬 -----
    const defs = svg.append("defs");
    const lg = defs.append("linearGradient").attr("id", "landTop").attr("x1", 0).attr("y1", 0).attr("x2", 1).attr("y2", 1);
    [["0%", "#fffaf0"], ["50%", "#f4ecdc"], ["100%", "#ddcfb3"]].forEach(([o, c]) => lg.append("stop").attr("offset", o).attr("stop-color", c));
    const blur = defs.append("filter").attr("id", "landShadow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
    blur.append("feGaussianBlur").attr("stdDeviation", narrow ? 6 : 11);
    const cs = defs.append("filter").attr("id", "cardShadow").attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "170%");
    cs.append("feDropShadow").attr("dx", 0).attr("dy", 10).attr("stdDeviation", 12).attr("flood-color", "#000").attr("flood-opacity", .5);
    for (const r of REGIONS) {
      const rg = defs.append("radialGradient").attr("id", "pg-" + r.id).attr("cx", "35%").attr("cy", "30%").attr("r", "75%");
      rg.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", .95);
      rg.append("stop").attr("offset", "22%").attr("stop-color", d3.color(r.color).brighter(.6).formatHex());
      rg.append("stop").attr("offset", "62%").attr("stop-color", r.color);
      rg.append("stop").attr("offset", "100%").attr("stop-color", d3.color(r.color).darker(1.3).formatHex());
    }
    if (land) {
      defs.append("path").attr("id", "landM").attr("d", path(land));
      defs.append("path").attr("id", "landI").attr("d", ipath(land));
    }
    defs.append("clipPath").attr("id", "insetClip").append("rect")
      .attr("x", ix).attr("y", iy).attr("width", iw).attr("height", ih).attr("rx", 16);

    // ----- 바다 격자 -----
    svg.append("path").attr("class", "grat")
      .attr("d", path(d3.geoGraticule().extent([[118, 18], [156, 52]]).step([2, 2])()));

    // ----- 입체 지형 -----
    const sideCol = d3.interpolateRgb("#cdb995", "#6f5d42");
    function terrain(parent, ref, pth, d, shadowScale) {
      if (!land) return;
      const g = parent.append("g");
      g.append("use").attr("href", ref).attr("fill", "#000").attr("opacity", .6)
        .attr("filter", "url(#landShadow)").attr("transform", "translate(" + d * shadowScale + "," + d * 2.4 * shadowScale + ")");
      for (let k = d; k >= 1; k--) g.append("use").attr("href", ref).attr("fill", sideCol(k / d)).attr("transform", "translate(0," + k + ")");
      g.append("use").attr("href", ref).attr("fill", "url(#landTop)");
      if (borders) g.append("path").attr("class", "pref").attr("d", pth(borders));
      g.append("use").attr("href", ref).attr("class", "coast");
    }
    terrain(svg, "#landM", path, depth, 1);

    // 나침반
    const cp = svg.append("g").attr("class", "compass").attr("transform", "translate(" + (mx0 + 30) + "," + (my0 + 40) + ")");
    cp.append("circle").attr("r", 17).attr("fill", "rgba(255,255,255,.03)").attr("stroke", "rgba(216,184,120,.45)");
    cp.append("path").attr("d", "M0,-13L4,0L0,13L-4,0Z").attr("fill", "rgba(216,184,120,.35)");
    cp.append("path").attr("d", "M0,-13L4,0L-4,0Z").attr("fill", "#d8b878");
    cp.append("text").attr("y", -23).attr("text-anchor", "middle").text("N");

    // 오키나와 인셋
    const ins = svg.append("g");
    ins.append("rect").attr("x", ix).attr("y", iy).attr("width", iw).attr("height", ih).attr("rx", 16)
      .attr("fill", "rgba(6,20,30,.45)").attr("stroke", "rgba(216,184,120,.35)").attr("stroke-dasharray", "3 4");
    const insIn = ins.append("g").attr("clip-path", "url(#insetClip)");
    terrain(insIn, "#landI", ipath, Math.max(3, depth - 2), .6);
    ins.append("text").attr("class", "inset-title").attr("x", ix + 14).attr("y", iy + 19).text("오키나와 · 확대");

    // ----- 데이터 -----
    const g = grouped();
    const fs = narrow ? 12 : 14;
    const rowH = fs + 11, headH = fs + 20, cpad = 10, gap = 10;

    // 빈 지역: 땅 위의 작은 표식
    const marks = svg.append("g");
    for (const r of REGIONS) {
      if (g.get(r.id).length) continue;
      const [x, y] = at(r);
      marks.append("ellipse").attr("cx", x).attr("cy", y).attr("rx", 5).attr("ry", 2.4)
        .attr("fill", r.color).attr("fill-opacity", .35).attr("stroke", d3.color(r.color).darker(1).formatHex()).attr("stroke-width", 1.2);
      const side = r.pin || "r";
      marks.append("text").attr("class", "pin-label")
        .attr("x", side === "l" ? x - 9 : (side === "b" || side === "t") ? x : x + 9)
        .attr("y", side === "b" ? y + 17 : side === "t" ? y - 9 : y + 4)
        .attr("text-anchor", side === "l" ? "end" : (side === "b" || side === "t") ? "middle" : "start")
        .text(r.name);
    }

    // 이름표 카드 배치 (좌/우 레인, 위→아래)
    const cards = [];
    for (const lane of ["L", "R"]) {
      const items = REGIONS.filter((r) => r.side === lane && g.get(r.id).length)
        .map((r) => ({ r, p: at(r), list: g.get(r.id) }))
        .sort((a, b) => a.p[1] - b.p[1]);
      if (!items.length) continue;
      const n = items.length;
      const avail = H - pad * 2 - n * (headH + cpad * 2 + gap);
      const maxRows = Math.max(1, Math.min(8, Math.floor(avail / (n * rowH))));
      const inner = laneW - cpad * 2;
      for (const it of items) {
        const placed = []; let row = 0, x = 0;
        for (let i = 0; i < it.list.length; i++) {
          const w = Math.min(inner, Math.ceil(textW(it.list[i].nickname, fs)) + 24);
          if (x > 0 && x + w > inner) { row++; x = 0; }
          if (row >= maxRows) break;
          placed.push({ p: it.list[i], row, x, w });
          x += w + 5;
        }
        let rest = it.list.length - placed.length;
        if (rest > 0) {
          let more = null;
          while (!more) {
            const label = "+" + rest + "명";
            const w = Math.ceil(textW(label, fs, 700)) + 14;
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
        it.h = headH + it.rows * rowH + cpad * 2 - 6;
        it.w = laneW;
        it.x = lane === "L" ? pad : W - pad - laneW;
        it.lane = lane;
      }
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

    // 받침 원판 + 연결선
    const pinR = narrow ? 4.2 : 5.8, pinH = narrow ? 11 : 16, spread = narrow ? 5 : 6.6;
    const under = svg.append("g"), lines = svg.append("g");
    for (const c of cards) {
      const rad = spread * Math.sqrt(Math.max(0, c.list.length - 1)) + pinR + 5;
      under.append("ellipse").attr("cx", c.p[0]).attr("cy", c.p[1]).attr("rx", rad).attr("ry", rad * .45)
        .attr("fill", c.r.color).attr("fill-opacity", .22).attr("stroke", c.r.color).attr("stroke-opacity", .7).attr("stroke-width", 1);
      const ex = c.lane === "L" ? c.x + c.w : c.x;
      const ey = c.y + cpad + headH / 2 - 3;
      const kx = ex + (c.lane === "L" ? 16 : -16);
      lines.append("path").attr("d", "M" + ex + "," + ey + "L" + kx + "," + ey + "L" + c.p[0] + "," + c.p[1])
        .attr("fill", "none").attr("stroke", c.r.color).attr("stroke-width", 1.3).attr("stroke-opacity", .9);
      lines.append("circle").attr("cx", kx).attr("cy", ey).attr("r", 2.2).attr("fill", c.r.color);
    }

    // 3D 핀 (바닥면을 납작하게 → 원근감, 뒤에서 앞으로 그리기)
    const pins = [];
    for (const c of cards) {
      c.list.forEach((p, i) => {
        const a = i * 2.39996, rr = spread * Math.sqrt(i);
        pins.push({ r: c.r, p, x: c.p[0] + rr * Math.cos(a), y: c.p[1] + rr * Math.sin(a) * .45 });
      });
    }
    pins.sort((a, b) => a.y - b.y);
    const pinG = svg.append("g");
    for (const q of pins) {
      pinG.append("ellipse").attr("cx", q.x + 1.5).attr("cy", q.y + .5).attr("rx", pinR * .85).attr("ry", pinR * .32)
        .attr("fill", "#000").attr("opacity", .35);
      const one = pinG.append("g").attr("class", "pin" + (newIds.has(q.p.id) ? " pop" : ""));
      one.append("line").attr("x1", q.x).attr("y1", q.y).attr("x2", q.x).attr("y2", q.y - pinH)
        .attr("stroke", d3.color(q.r.color).darker(1.6).formatHex()).attr("stroke-width", 1.7).attr("stroke-linecap", "round");
      one.append("circle").attr("cx", q.x).attr("cy", q.y - pinH).attr("r", pinR)
        .attr("fill", "url(#pg-" + q.r.id + ")").attr("stroke", "rgba(0,0,0,.25)").attr("stroke-width", .6);
      one.append("title").text(q.p.nickname + " · " + q.r.name);
    }

    // 유리 질감 이름표 카드
    const cg = svg.append("g");
    for (const c of cards) {
      const g1 = cg.append("g").attr("transform", "translate(" + c.x + "," + c.y + ")");
      g1.append("rect").attr("width", c.w).attr("height", c.h).attr("rx", 14)
        .attr("fill", "rgba(9,27,39,.88)").attr("stroke", "rgba(255,255,255,.13)").attr("filter", "url(#cardShadow)");
      g1.append("rect").attr("x", 1).attr("y", 1).attr("width", c.w - 2).attr("height", headH + cpad - 4).attr("rx", 13)
        .attr("fill", c.r.color).attr("fill-opacity", .07);
      const hy = cpad + headH / 2 - 3;
      g1.append("circle").attr("cx", cpad + 7).attr("cy", hy).attr("r", 7).attr("fill", "url(#pg-" + c.r.id + ")");
      g1.append("text").attr("class", "card-name").attr("x", cpad + 21).attr("y", hy + fs * .4)
        .attr("font-size", fs + 3).attr("fill", "#f6f1e6").text(c.r.name);
      g1.append("text").attr("x", c.w - cpad).attr("y", hy + fs * .4).attr("text-anchor", "end")
        .attr("class", "card-name").attr("font-size", fs + 4).attr("fill", c.r.color).text(c.list.length + "명");
      const top0 = cpad + headH - 2;
      for (const ch of c.chips) {
        const cy = top0 + ch.row * rowH, hh = rowH - 5;
        const isNew = newIds.has(ch.p.id);
        g1.append("rect").attr("x", cpad + ch.x).attr("y", cy).attr("width", ch.w).attr("height", hh).attr("rx", hh / 2)
          .attr("fill", c.r.color).attr("fill-opacity", isNew ? .38 : .15)
          .attr("stroke", c.r.color).attr("stroke-opacity", isNew ? .9 : .3);
        g1.append("circle").attr("cx", cpad + ch.x + 10).attr("cy", cy + hh / 2).attr("r", 3.3).attr("fill", c.r.color);
        g1.append("text").attr("x", cpad + ch.x + 18).attr("y", cy + hh / 2 + fs * .36)
          .attr("font-size", fs).attr("fill", "#f6f1e6").text(fitText(ch.p.nickname, ch.w - 24, fs));
      }
      if (c.more) {
        const cy = top0 + c.more.row * rowH;
        g1.append("text").attr("x", cpad + c.more.x + 6).attr("y", cy + (rowH - 5) / 2 + fs * .36)
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
  function toast(msg, region) {
    const t = document.createElement("div");
    t.className = "toast";
    if (region) {
      const dot = document.createElement("i");
      dot.style.background = region.color;
      const em = document.createElement("em");
      em.textContent = "→ " + region.name;
      t.append(dot, document.createTextNode(msg), em);
    } else t.textContent = msg;
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 3800);
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
