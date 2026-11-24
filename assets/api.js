// 데이터 계층: Supabase(실서비스) 또는 데모 모드(같은 브라우저 탭끼리 공유)
(function () {
  const C = window.APP_CONFIG || {};
  const configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);

  const ERR = {
    ROOM_NOT_FOUND: "방을 찾을 수 없어요. 선생님 화면의 QR을 다시 찍어 주세요.",
    BAD_NICKNAME: "닉네임은 1~12글자로 써 주세요.",
    BAD_REGION: "지역을 다시 골라 주세요.",
    ROOM_FULL: "이 방은 인원이 가득 찼어요.",
    NOT_TEACHER: "이 기기에서 만든 방이 아니라서 관리할 수 없어요.",
    ROOM_TAKEN: "ROOM_TAKEN"
  };
  function friendly(error) {
    const m = (error && (error.message || String(error))) || "알 수 없는 오류";
    for (const k in ERR) if (m.includes(k)) return new Error(ERR[k]);
    return new Error("서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요. (" + m + ")");
  }

  // ---------- Supabase ----------
  function liveApi() {
    if (!window.supabase || !window.supabase.createClient) {
      const fail = async () => { throw new Error("Supabase 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인해 주세요."); };
      return { mode: "error", roomExists: fail, createRoom: fail, submitPick: fail, listPicks: fail,
               subscribe: () => () => {}, deletePick: fail, clearRoom: fail };
    }
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
    const rpc = async (fn, args) => {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw friendly(error);
      return data;
    };
    return {
      mode: "live",
      roomExists: async (code) => (await rpc("room_exists", { p_code: code })) === true,
      createRoom: (code, key) => rpc("create_room", { p_code: code, p_key: key }),
      submitPick: (room, client, nickname, region) =>
        rpc("submit_pick", { p_room: room, p_client: client, p_nickname: nickname, p_region: region }),
      listPicks: async (room) => {
        const { data, error } = await sb.from("picks")
          .select("id,nickname,region,created_at,updated_at")
          .eq("room", room).order("updated_at", { ascending: true });
        if (error) throw friendly(error);
        return data || [];
      },
      // 변경이 생기면 onChange() 호출 → 화면에서 목록을 다시 읽음
      subscribe: (room, onChange, onStatus) => {
        const ch = sb.channel("picks-" + room)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "picks", filter: "room=eq." + room }, onChange)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "picks", filter: "room=eq." + room }, onChange)
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "picks" }, onChange) // DELETE는 필터 미지원
          .subscribe((status) => onStatus && onStatus(status));
        return () => sb.removeChannel(ch);
      },
      deletePick: (room, key, id) => rpc("teacher_delete_pick", { p_room: room, p_key: key, p_id: id }),
      clearRoom: (room, key) => rpc("teacher_clear_room", { p_room: room, p_key: key })
    };
  }

  // ---------- 데모 모드 ----------
  function demoApi() {
    const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
    const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    let bc = null;
    try { bc = new BroadcastChannel("jt-demo"); } catch (e) {}
    const ping = (room) => { if (bc) bc.postMessage({ room }); };
    const rooms = () => get("jt_demo_rooms", {});
    const picksOf = (room) => get("jt_demo_picks_" + room, []);
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());

    return {
      mode: "demo",
      roomExists: async (code) => !!rooms()[code],
      createRoom: async (code, key) => { const r = rooms(); r[code] = key; set("jt_demo_rooms", r); },
      submitPick: async (room, client, nickname, region) => {
        if (!rooms()[room]) throw new Error(ERR.ROOM_NOT_FOUND);
        const nick = String(nickname).trim();
        if (nick.length < 1 || nick.length > 12) throw new Error(ERR.BAD_NICKNAME);
        const list = picksOf(room);
        const now = new Date().toISOString();
        const old = list.find((p) => p.client_id === client);
        if (old) Object.assign(old, { nickname: nick, region, updated_at: now });
        else list.push({ id: uid(), client_id: client, nickname: nick, region, created_at: now, updated_at: now });
        set("jt_demo_picks_" + room, list);
        ping(room);
      },
      listPicks: async (room) => picksOf(room).slice().sort((a, b) => a.updated_at.localeCompare(b.updated_at)),
      subscribe: (room, onChange, onStatus) => {
        const onMsg = (e) => { if (e.data && e.data.room === room) onChange(); };
        const onStore = (e) => { if (e.key === "jt_demo_picks_" + room) onChange(); };
        if (bc) bc.addEventListener("message", onMsg);
        window.addEventListener("storage", onStore);
        setTimeout(() => onStatus && onStatus("DEMO"), 0);
        return () => { if (bc) bc.removeEventListener("message", onMsg); window.removeEventListener("storage", onStore); };
      },
      deletePick: async (room, key, id) => {
        if (rooms()[room] !== key) throw new Error(ERR.NOT_TEACHER);
        set("jt_demo_picks_" + room, picksOf(room).filter((p) => p.id !== id)); ping(room);
      },
      clearRoom: async (room, key) => {
        if (rooms()[room] !== key) throw new Error(ERR.NOT_TEACHER);
        set("jt_demo_picks_" + room, []); ping(room);
      }
    };
  }

  window.TripAPI = configured ? liveApi() : demoApi();

  // 공용 도우미
  window.TripUtil = {
    ls(k, v) {
      try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    },
    randomString(n, alphabet) {
      const a = alphabet || "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const buf = new Uint32Array(n);
      crypto.getRandomValues(buf);
      return Array.from(buf, (x) => a[x % a.length]).join("");
    }
  };
})();
