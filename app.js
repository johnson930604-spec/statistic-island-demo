// 統計學習島 STAT ISLAND — 3D 六角群島引擎、全開放＋點燈制進度管理與多面板互動控制器
(function () {
  const DATA = window.STAT_DATA;
  const STORAGE_LIT = "stat-island-lit:v1";
  const STORAGE_CHECKS = "stat-island-checks:v1";
  const STORAGE_ONBOARD = "stat-island-onboarded:v1";
  const STORAGE_CHAR = "stat-island-char:v1";

  // 狀態管理
  let litIslands = new Set();
  let checkedAssumptions = {};
  let selectedIslandId = null;
  let selectedBuildingId = null;
  let activeFilter = null; // { type: 'dim'|'stage'|'lit', value: ... }
  let activeSidebarTab = "islands"; // 'islands' | 'flows'
  let searchQuery = "";

  // 視角與頂部開關
  let timeOfDay = "day"; // 'dawn' | 'day' | 'dusk' | 'night'
  const toggles = {
    tags: true,
    cargo: true,
    flows: true,
    pause: false,
    bird: false,
    log: false
  };

  // 3D 攝影機狀態
  const cam = {
    tx: 0,
    tz: 18,
    curX: 0,
    curZ: 18,
    yaw: 0.45,
    targetYaw: 0.45,
    pitch: 0.68,
    targetPitch: 0.68,
    zoom: 1.0,
    targetZoom: 1.0
  };

  // 學習日誌與知識搬運統計
  const statsLog = {
    departed: 12,
    arrived: 9,
    litCount: 0,
    simRuns: 0,
    feed: []
  };

  // 研究員角色狀態
  let myChar = {
    name: "統計探索者",
    role: DATA.characterOptions.roles[0],
    tool: DATA.characterOptions.tools[0],
    outfitIdx: 0,
    quoteIdx: 0
  };

  // 讀取 localStorage
  function loadPersistedState() {
    try {
      const savedLit = JSON.parse(localStorage.getItem(STORAGE_LIT) || "[]");
      if (Array.isArray(savedLit)) litIslands = new Set(savedLit);
      const savedChecks = JSON.parse(localStorage.getItem(STORAGE_CHECKS) || "{}");
      if (savedChecks && typeof savedChecks === "object") checkedAssumptions = savedChecks;
      const savedChar = JSON.parse(localStorage.getItem(STORAGE_CHAR) || "null");
      if (savedChar && savedChar.name) myChar = { ...myChar, ...savedChar };
    } catch (e) {
      console.warn(e);
    }
    statsLog.litCount = litIslands.size;
  }

  function saveLitState() {
    try {
      localStorage.setItem(STORAGE_LIT, JSON.stringify([...litIslands]));
    } catch (e) {}
  }

  function saveChecksState() {
    try {
      localStorage.setItem(STORAGE_CHECKS, JSON.stringify(checkedAssumptions));
    } catch (e) {}
  }

  // 六角座標轉 3D 世界座標 (Axial Hex q, r -> World x, z)
  const HEX_RADIUS = 30;
  const islandWorldMap = new Map();
  const buildingWorldMap = new Map();

  function computeWorldPositions() {
    DATA.islands.forEach((isl) => {
      const wx = HEX_RADIUS * 1.82 * (isl.q + isl.r * 0.5);
      const wz = HEX_RADIUS * 1.58 * isl.r;
      isl.wx = wx;
      isl.wz = wz;
      islandWorldMap.set(isl.id, isl);

      // 4 棟指標建築環繞六角島中心配置
      const offsets = [
        { dx: -11, dz: -8, h: 12 },
        { dx: 11, dz: -8, h: 14 },
        { dx: -10, dz: 9, h: 11 },
        { dx: 10, dz: 9, h: 13 }
      ];
      isl.items.forEach((item, idx) => {
        const off = offsets[idx % offsets.length];
        item.wx = wx + off.dx;
        item.wz = wz + off.dz;
        item.bh = off.h;
        item.islandId = isl.id;
        buildingWorldMap.set(item.id, item);
      });
    });
  }

  // 建立島際走動的研究員與 2 位彩蛋導師 (高斯 Gauss & 費雪島主 Fisher)
  const walkers = [];
  function initWalkers() {
    DATA.flows.forEach((fl, idx) => {
      walkers.push({
        id: "W-" + fl.id,
        type: "researcher",
        flow: fl,
        t: (idx * 0.19) % 1,
        speed: 0.0014 + (idx % 4) * 0.0003,
        color: DATA.islands.find((x) => x.id === fl.from)?.color || "#db6a41",
        wx: 0,
        wz: 0
      });
    });

    // 彩蛋角色 1：✦ 高斯 Gauss（巡迴各座統計島，點擊直接啟動該島互動統計模擬器）
    walkers.push({
      id: "MENTOR-GAUSS",
      type: "gauss",
      name: "✦ 高斯 Gauss",
      title: "常態與最小平方導師",
      islandIdx: 0,
      t: 0,
      speed: 0.0012,
      wx: 0,
      wz: 0
    });

    // 彩蛋角色 2：✦ 費雪島主 Fisher（統計學習島總設計者，點擊觸發統計名言與點燈進度鼓勵）
    walkers.push({
      id: "MENTOR-FISHER",
      type: "fisher",
      name: "✦ 費雪島主 Fisher",
      title: "ANOVA 與 p 值開創者",
      islandIdx: 5,
      t: 0.4,
      speed: 0.001,
      wx: 0,
      wz: 0
    });
  }

  function pushLog(type, text) {
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8);
    statsLog.feed.unshift({ type, text, ts });
    if (statsLog.feed.length > 24) statsLog.feed.pop();
    renderLogDrawer();
  }

  // 點亮島嶼儀式 (全開放＋點燈制核心回饋)
  window.markIslandLit = function (islandId) {
    const isl = islandWorldMap.get(islandId);
    if (!isl) return;
    const isNew = !litIslands.has(islandId);
    litIslands.add(islandId);
    statsLog.litCount = litIslands.size;
    statsLog.simRuns++;
    saveLitState();

    pushLog(
      "lit",
      `點亮第 ${isl.id} 島【${isl.name}】知識燈塔！（目前點燈 ${litIslands.size} / ${DATA.islands.length} 座）`
    );

    updateStatusBar();
    renderSidebarTree();
    if (selectedIslandId === islandId) {
      if (selectedBuildingId) renderBuildingCard(isl, buildingWorldMap.get(selectedBuildingId));
      else renderIslandCard(isl);
    }
    syncDOMLabelsState();
  };

  // 判斷島嶼是否符合當前底部篩選器
  function isIslandMatched(isl) {
    if (!activeFilter) return true;
    if (activeFilter.type === "dim") {
      return isl.dims.includes(activeFilter.value);
    }
    if (activeFilter.type === "stage") {
      return isl.stage === Number(activeFilter.value);
    }
    if (activeFilter.type === "lit") {
      if (activeFilter.value === "lit") return litIslands.has(isl.id);
      if (activeFilter.value === "unlit") return !litIslands.has(isl.id);
      return true;
    }
    return true;
  }

  // ============================================================================
  // DOM 浮動標籤層 (島嶼膠囊 .island-label、建築圓標 .item-pin、行者名牌 .name-tag)
  // ============================================================================
  const islandLabelEls = new Map();
  const buildingPinEls = new Map();
  const walkerTagEls = new Map();

  function createDOMLabels() {
    const layer = document.getElementById("labels-layer");
    layer.innerHTML = "";

    // 1. 12 座島嶼標籤
    DATA.islands.forEach((isl) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "island-label";
      btn.dataset.id = isl.id;
      btn.innerHTML = `<span class="lamp-dot"></span><strong>${isl.id}</strong><span>${isl.name}</span>`;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.selectIsland(isl.id);
      });
      layer.appendChild(btn);
      islandLabelEls.set(isl.id, btn);
    });

    // 2. 48 棟指標建築圓標
    DATA.islands.forEach((isl) => {
      isl.items.forEach((item) => {
        const pin = document.createElement("button");
        pin.type = "button";
        pin.className = "item-pin";
        pin.dataset.id = item.id;
        pin.innerHTML = `<b>${item.num}</b><span>${item.name}</span>`;
        pin.addEventListener("click", (e) => {
          e.stopPropagation();
          window.selectBuilding(isl.id, item.id);
        });
        layer.appendChild(pin);
        buildingPinEls.set(item.id, pin);
      });
    });

    // 3. 研究員與導師名牌
    walkers.forEach((w) => {
      const tag = document.createElement("button");
      tag.type = "button";
      if (w.type === "gauss") {
        tag.className = "name-tag puma-tag";
        tag.innerHTML = `<i>✦</i><span>高斯 Gauss · 點擊開啟模擬器</span>`;
        tag.addEventListener("click", (e) => {
          e.stopPropagation();
          const curIsl = DATA.islands[w.islandIdx];
          window.selectIsland(curIsl.id);
          window.openSimulator(curIsl.id);
        });
      } else if (w.type === "fisher") {
        tag.className = "name-tag puma-tag lord-tag";
        tag.innerHTML = `<i>✦</i><span>費雪島主 · 點燈進度診斷</span>`;
        tag.addEventListener("click", (e) => {
          e.stopPropagation();
          showFisherMentorToast();
        });
      } else {
        tag.className = "name-tag";
        tag.innerHTML = `<span>${w.flow.role}</span>`;
        tag.addEventListener("click", (e) => {
          e.stopPropagation();
          window.selectFlow(w.flow.id);
        });
      }
      layer.appendChild(tag);
      walkerTagEls.set(w.id, tag);
    });

    syncDOMLabelsState();
  }

  function showFisherMentorToast() {
    const nextUnlit = DATA.islands.find((x) => !litIslands.has(x.id)) || DATA.islands[0];
    window.selectIsland(nextUnlit.id);
    pushLog(
      "arrive",
      `✦ 費雪島主建議：你已點亮 ${litIslands.size}/12 座島，推薦挑戰【${nextUnlit.id} ${nextUnlit.name}】模擬器！`
    );
  }

  function syncDOMLabelsState() {
    DATA.islands.forEach((isl) => {
      const el = islandLabelEls.get(isl.id);
      if (!el) return;
      el.classList.toggle("lit", litIslands.has(isl.id));
      el.classList.toggle("selected", selectedIslandId === isl.id);
      el.classList.toggle("dim", !isIslandMatched(isl));
    });

    DATA.islands.forEach((isl) => {
      isl.items.forEach((item) => {
        const pin = buildingPinEls.get(item.id);
        if (!pin) return;
        // 當選中該島或距離夠近時顯示建築圓標
        const showPin = selectedIslandId === isl.id;
        pin.style.display = showPin ? "inline-flex" : "none";
        pin.classList.toggle("sel", selectedBuildingId === item.id);
      });
    });

    walkers.forEach((w) => {
      const tag = walkerTagEls.get(w.id);
      if (!tag) return;
      if (w.type === "researcher") {
        const cargoSpan = toggles.cargo ? ` · 📦 ${w.flow.cargo}` : "";
        tag.innerHTML = `<span>${w.flow.role}${cargoSpan}</span>`;
      }
    });
  }

  // ============================================================================
  // 左側詳情卡片 (#card)：島嶼總覽卡片 & 建築白話直覺＋關鍵公式＋前提檢查表卡片
  // ============================================================================
  function renderIslandCard(isl) {
    const card = document.getElementById("card");
    const content = document.getElementById("card-content");
    const isLit = litIslands.has(isl.id);

    const relatedFlows = DATA.flows.filter((f) => f.from === isl.id || f.to === isl.id);

    content.innerHTML = `
      <div class="card-head">
        <div class="icon-tile ${isLit ? "lit" : ""}">${isLit ? "✦" : isl.id}</div>
        <div>
          <div class="eyebrow">ISLAND ${isl.id} · ${isl.en}</div>
          <h2>${isl.name}</h2>
        </div>
      </div>

      <div class="pills">
        <span class="pill ${isLit ? "lit-badge" : "unlit-badge"}">
          ${isLit ? "🌟 已點亮知識燈塔" : "⚪ 未點燈（全開放自由探索）"}
        </span>
        ${isl.dims
          .map((d) => {
            const dim = DATA.dimensions[d];
            return `<span class="pill heart" style="--c:${dim.color}"><i></i>${dim.code} ${dim.name.split(" ")[0]}</span>`;
          })
          .join("")}
      </div>

      <blockquote class="vision">${isl.vision}</blockquote>
      <p class="lede">${isl.plain}</p>

      <div class="formula-box">
        <div class="formula-main">${isl.formula.main}</div>
        <div class="formula-vars">${isl.formula.vars}</div>
      </div>

      <button type="button" class="sim-trigger-btn ${isLit ? "completed" : ""}" id="card-open-sim-btn">
        <span>${isLit ? "✦ 已通關點燈 · 再次體驗互動模擬器" : "⚡ 啟動本島「互動統計模擬器」點燈"}</span>
        <span>↗</span>
      </button>

      <h3>本島 4 座指標建築（點擊查看公式與前提檢查）</h3>
      <div class="rows">
        ${isl.items
          .map(
            (item) => `
          <button type="button" class="row" data-bid="${item.id}">
            <span class="dot"></span>
            <span class="nm">${item.num} ${item.name}</span>
            <span class="ph">${item.phase}</span>
            <i>→</i>
          </button>
        `
          )
          .join("")}
      </div>

      <h3>適用前提檢查表（可勾選自我檢核）</h3>
      <div class="checklist">
        ${isl.assumptions
          .map((asmp, idx) => {
            const cid = `${isl.id}-a-${idx}`;
            const checked = checkedAssumptions[cid] ? "checked" : "";
            return `
            <label class="check-item">
              <input type="checkbox" data-cid="${cid}" ${checked}>
              <span>${asmp}</span>
            </label>
          `;
          })
          .join("")}
      </div>

      <h3>實務研究案例</h3>
      <div class="rows">
        ${isl.cases
          .map(
            (c) => `
          <div class="row" style="cursor:default;">
            <span class="dot" style="background:var(--teal)"></span>
            <span class="nm" style="font-weight:600;font-size:12.5px;">${c}</span>
          </div>
        `
          )
          .join("")}
      </div>

      <h3>跨島統計推論知識流 (${relatedFlows.length})</h3>
      <div class="flow-chips">
        ${relatedFlows
          .map((f) => {
            const otherId = f.from === isl.id ? f.to : f.from;
            const otherIsl = islandWorldMap.get(otherId);
            const dir = f.from === isl.id ? "→" : "←";
            return `
            <button type="button" class="flow-chip" data-fid="${f.id}" data-oid="${otherId}">
              <b>${f.id}</b> ${dir} ${otherIsl.id} ${otherIsl.name}（${f.cargo}）
            </button>
          `;
          })
          .join("")}
      </div>
    `;

    card.hidden = false;

    document.getElementById("card-open-sim-btn").addEventListener("click", () => {
      window.openSimulator(isl.id);
    });

    content.querySelectorAll(".row[data-bid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.selectBuilding(isl.id, btn.dataset.bid);
      });
    });

    content.querySelectorAll('input[type="checkbox"][data-cid]').forEach((chk) => {
      chk.addEventListener("change", () => {
        checkedAssumptions[chk.dataset.cid] = chk.checked;
        saveChecksState();
      });
    });

    content.querySelectorAll(".flow-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        window.selectIsland(chip.dataset.oid);
      });
    });
  }

  function renderBuildingCard(isl, item) {
    const card = document.getElementById("card");
    const content = document.getElementById("card-content");
    const isLit = litIslands.has(isl.id);
    const stageIdx = DATA.stages.indexOf(item.phase);

    content.innerHTML = `
      <button type="button" class="btn-secondary" id="back-to-island-btn" style="padding:6px 12px;font-size:12px;margin-bottom:10px;">
        ← 返回【${isl.id} ${isl.name}】島嶼總覽
      </button>

      <div class="card-head">
        <div class="icon-tile ${isLit ? "lit" : ""}">${item.num}</div>
        <div>
          <div class="eyebrow">${isl.id} ${isl.name} · 指標建築</div>
          <h2>${item.name}</h2>
        </div>
      </div>

      <h3>學習階段定位</h3>
      <div class="timeline">
        ${DATA.stages
          .map(
            (st, idx) => `
          <span class="${idx === stageIdx ? "on" : ""}">${st}</span>
        `
          )
          .join("")}
      </div>

      <h3>統計直覺白話解釋</h3>
      <p class="lede" style="background:#fff;padding:12px 14px;border-radius:12px;border:1px solid var(--border);">
        ${item.plain}
      </p>

      <h3>關鍵公式與符號拆解</h3>
      <div class="formula-box">
        <div class="formula-main">${item.formula.main}</div>
        <div class="formula-vars">${item.formula.vars}</div>
      </div>

      <h3>本建築適用前提檢查表</h3>
      <div class="checklist">
        ${item.assumptions
          .map((asmp, idx) => {
            const cid = `${item.id}-b-${idx}`;
            const checked = checkedAssumptions[cid] ? "checked" : "";
            return `
            <label class="check-item">
              <input type="checkbox" data-cid="${cid}" ${checked}>
              <span>${asmp}</span>
            </label>
          `;
          })
          .join("")}
      </div>

      <button type="button" class="sim-trigger-btn ${isLit ? "completed" : ""}" id="bcard-open-sim-btn" style="margin-top:16px;">
        <span>⚡ 進入【${isl.name}】互動統計模擬器驗證直覺</span>
        <span>↗</span>
      </button>

      <h3>同島其他建築快速切換</h3>
      <div class="rows">
        ${isl.items
          .map(
            (other) => `
          <button type="button" class="row" data-bid="${other.id}" style="${
              other.id === item.id ? "border-color:var(--coral);background:var(--coral-light);" : ""
            }">
            <span class="dot"></span>
            <span class="nm">${other.num} ${other.name}</span>
            <span class="ph">${other.phase}</span>
          </button>
        `
          )
          .join("")}
      </div>
    `;

    card.hidden = false;

    document.getElementById("back-to-island-btn").addEventListener("click", () => {
      selectedBuildingId = null;
      renderIslandCard(isl);
      syncDOMLabelsState();
    });

    document.getElementById("bcard-open-sim-btn").addEventListener("click", () => {
      window.openSimulator(isl.id);
    });

    content.querySelectorAll('input[type="checkbox"][data-cid]').forEach((chk) => {
      chk.addEventListener("change", () => {
        checkedAssumptions[chk.dataset.cid] = chk.checked;
        saveChecksState();
      });
    });

    content.querySelectorAll(".row[data-bid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.selectBuilding(isl.id, btn.dataset.bid);
      });
    });
  }

  function renderFlowCard(flow) {
    const card = document.getElementById("card");
    const content = document.getElementById("card-content");
    const fromIsl = islandWorldMap.get(flow.from);
    const toIsl = islandWorldMap.get(flow.to);

    content.innerHTML = `
      <div class="card-head">
        <div class="icon-tile">${flow.id}</div>
        <div>
          <div class="eyebrow">KNOWLEDGE FLOW · 跨島推論知識流</div>
          <h2>${flow.label}</h2>
        </div>
      </div>

      <div class="pills">
        <span class="pill heart"><i></i>擔任角色：${flow.role}</span>
        <span class="pill">📦 傳遞概念：${flow.cargo}</span>
      </div>

      <p class="lede">
        在統計學習島中，<strong>【${fromIsl.id} ${fromIsl.name}】</strong>算出的核心統計量（${flow.cargo}），會由「${flow.role}」沿著跨海知識管線運送至<strong>【${toIsl.id} ${toIsl.name}】</strong>，成為下一階段推論的關鍵養分。
      </p>

      <h3>起點與終點島嶼導覽</h3>
      <div class="rows">
        <button type="button" class="row" data-iid="${fromIsl.id}">
          <span class="dot"></span>
          <span class="nm">起點：${fromIsl.id} ${fromIsl.name}</span>
          <span class="ph">飛往起點島 ↗</span>
        </button>
        <button type="button" class="row" data-iid="${toIsl.id}">
          <span class="dot" style="background:var(--teal)"></span>
          <span class="nm">終點：${toIsl.id} ${toIsl.name}</span>
          <span class="ph">飛往終點島 ↗</span>
        </button>
      </div>
    `;
    card.hidden = false;
    content.querySelectorAll(".row[data-iid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.selectIsland(btn.dataset.iid);
      });
    });
  }

  // 選擇島嶼、建築或知識流並平滑飛行攝影機
  window.selectIsland = function (islandId) {
    const isl = islandWorldMap.get(islandId);
    if (!isl) return;
    selectedIslandId = isl.id;
    selectedBuildingId = null;
    toggles.bird = false;
    syncToggleButtons();

    cam.tx = isl.wx;
    cam.tz = isl.wz;
    cam.targetZoom = 1.48;
    cam.targetPitch = 0.62;

    renderIslandCard(isl);
    renderSidebarTree();
    syncDOMLabelsState();
  };

  window.selectBuilding = function (islandId, buildingId) {
    const isl = islandWorldMap.get(islandId);
    const item = buildingWorldMap.get(buildingId);
    if (!isl || !item) return;
    selectedIslandId = isl.id;
    selectedBuildingId = item.id;
    toggles.bird = false;
    syncToggleButtons();

    cam.tx = item.wx;
    cam.tz = item.wz;
    cam.targetZoom = 1.72;
    cam.targetPitch = 0.56;

    renderBuildingCard(isl, item);
    renderSidebarTree();
    syncDOMLabelsState();
  };

  window.selectFlow = function (flowId) {
    const flow = DATA.flows.find((f) => f.id === flowId);
    if (!flow) return;
    const fromIsl = islandWorldMap.get(flow.from);
    const toIsl = islandWorldMap.get(flow.to);
    if (fromIsl && toIsl) {
      cam.tx = (fromIsl.wx + toIsl.wx) * 0.5;
      cam.tz = (fromIsl.wz + toIsl.wz) * 0.5;
      cam.targetZoom = 1.25;
    }
    renderFlowCard(flow);
  };

  // ============================================================================
  // 右側索引欄 (#sidebar & #tree)
  // ============================================================================
  function renderSidebarTree() {
    const tree = document.getElementById("tree");
    if (!tree) return;
    const q = searchQuery.trim().toLowerCase();

    if (activeSidebarTab === "islands") {
      const html = DATA.islands
        .filter((isl) => {
          if (!q) return true;
          const matchIsl =
            isl.name.toLowerCase().includes(q) ||
            isl.en.toLowerCase().includes(q) ||
            isl.plain.toLowerCase().includes(q);
          const matchBld = isl.items.some(
            (b) => b.name.toLowerCase().includes(q) || b.plain.toLowerCase().includes(q)
          );
          return matchIsl || matchBld;
        })
        .map((isl) => {
          const isLit = litIslands.has(isl.id);
          const isOpen = selectedIslandId === isl.id || q.length > 0;
          return `
          <details class="${selectedIslandId === isl.id ? "current" : ""}" data-id="${isl.id}" ${
            isOpen ? "open" : ""
          }>
            <summary>
              <span class="index">${isl.id}</span>
              <span class="item-name">${isl.name}</span>
              <span class="lamp-pill ${isLit ? "lit" : ""}">${isLit ? "🌟 已點燈" : "4 建築"}</span>
            </summary>
            <div class="children">
              <button type="button" class="island-open" data-act="island" data-iid="${isl.id}">
                飛往【${isl.name}】島嶼總覽 ↗
              </button>
              <button type="button" data-act="sim" data-iid="${isl.id}" style="background:var(--gold-light);color:#8f6000;font-weight:800;">
                ⚡ 啟動本島互動統計模擬器
              </button>
              ${isl.items
                .map(
                  (item) => `
                <button type="button" data-act="bld" data-iid="${isl.id}" data-bid="${item.id}">
                  ${item.num} ${item.name}
                </button>
              `
                )
                .join("")}
            </div>
          </details>
        `;
        })
        .join("");

      tree.innerHTML = html || `<div style="padding:16px;color:var(--muted);">找不到符合「${searchQuery}」的統計概念。</div>`;

      tree.querySelectorAll("button[data-act]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = btn.dataset.act;
          const iid = btn.dataset.iid;
          if (act === "island") window.selectIsland(iid);
          else if (act === "sim") {
            window.selectIsland(iid);
            window.openSimulator(iid);
          } else if (act === "bld") {
            window.selectBuilding(iid, btn.dataset.bid);
          }
        });
      });
    } else {
      // 推論知識流 18 分頁
      const html = DATA.flows
        .filter((f) => {
          if (!q) return true;
          return (
            f.label.toLowerCase().includes(q) ||
            f.cargo.toLowerCase().includes(q) ||
            f.role.toLowerCase().includes(q)
          );
        })
        .map((f) => {
          const fromIsl = islandWorldMap.get(f.from);
          const toIsl = islandWorldMap.get(f.to);
          return `
          <button type="button" class="flow-item" data-fid="${f.id}">
            <div><b>${f.id}</b> ${fromIsl.name} → ${toIsl.name}</div>
            <div class="count">${f.role} ｜ 傳遞：${f.cargo}</div>
          </button>
        `;
        })
        .join("");
      tree.innerHTML = html;
      tree.querySelectorAll(".flow-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          window.selectFlow(btn.dataset.fid);
        });
      });
    }
  }

  function updateStatusBar() {
    const litEl = document.getElementById("st-lit-count");
    if (litEl) litEl.textContent = `${litIslands.size} / ${DATA.islands.length}`;
  }

  function syncToggleButtons() {
    document.querySelectorAll(".tg[data-toggle]").forEach((btn) => {
      const key = btn.dataset.toggle;
      btn.setAttribute("aria-pressed", toggles[key] ? "true" : "false");
    });
  }

  // ============================================================================
  // 學習日誌抽屜 (#log-drawer) 與 研究員角色自訂抽屜 (#char-drawer)
  // ============================================================================
  function renderLogDrawer() {
    const dEl = document.getElementById("log-stat-depart");
    const aEl = document.getElementById("log-stat-arrive");
    const lEl = document.getElementById("log-stat-lit");
    const sEl = document.getElementById("log-stat-sim");
    const listEl = document.getElementById("log-feed-list");
    if (!listEl) return;

    if (dEl) dEl.textContent = statsLog.departed;
    if (aEl) aEl.textContent = statsLog.arrived;
    if (lEl) lEl.textContent = `${litIslands.size} / 12`;
    if (sEl) sEl.textContent = statsLog.simRuns;

    listEl.innerHTML = statsLog.feed
      .map(
        (item) => `
      <li>
        <span class="lp-badge ${item.type}">
          ${item.type === "lit" ? "點燈" : item.type === "arrive" ? "送達" : "啟程"}
        </span>
        <span style="flex:1;">${item.text}</span>
        <span style="color:var(--muted);font-size:11px;">${item.ts}</span>
      </li>
    `
      )
      .join("");
  }

  function renderCharDrawer() {
    const box = document.getElementById("char-drawer-body");
    if (!box) return;
    const opts = DATA.characterOptions;
    const outfit = opts.outfits[myChar.outfitIdx] || opts.outfits[0];

    box.innerHTML = `
      <div style="background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px;text-align:center;margin-bottom:14px;">
        <div style="width:68px;height:68px;border-radius:50%;margin:0 auto 10px;background:${outfit.color};color:#fff;display:grid;place-items:center;font-size:28px;font-weight:900;box-shadow:0 6px 16px rgba(0,0,0,0.15);">
          ☺
        </div>
        <div style="font-size:18px;font-weight:900;">${myChar.name}</div>
        <div style="font-size:12.5px;color:var(--coral);font-weight:800;margin:3px 0;">
          ${myChar.role} · 手持【${myChar.tool}】
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px;">
          已點亮島嶼：<strong>${litIslands.size} / 12 座</strong>
        </div>
        <div style="font-size:12px;background:var(--cream-soft);padding:8px 10px;border-radius:8px;margin-top:10px;font-weight:600;">
          ${opts.quotes[myChar.quoteIdx]}
        </div>
      </div>

      <label style="font-size:12px;font-weight:800;color:var(--muted);">研究員稱呼</label>
      <input type="text" id="char-name-inp" class="search-input" value="${myChar.name}" maxlength="16" style="margin-top:4px;">

      <label style="font-size:12px;font-weight:800;color:var(--muted);">1. 選擇研究身分</label>
      <div class="chip-grid">
        ${opts.roles
          .map(
            (r) => `
          <button type="button" class="chip-btn ${myChar.role === r ? "active" : ""}" data-role="${r}">${r}</button>
        `
          )
          .join("")}
      </div>

      <label style="font-size:12px;font-weight:800;color:var(--muted);">2. 隨身統計裝備</label>
      <div class="chip-grid">
        ${opts.tools
          .map(
            (t) => `
          <button type="button" class="chip-btn ${myChar.tool === t ? "active" : ""}" data-tool="${t}">${t}</button>
        `
          )
          .join("")}
      </div>

      <label style="font-size:12px;font-weight:800;color:var(--muted);">3. 實驗袍配色</label>
      <div class="chip-grid">
        ${opts.outfits
          .map(
            (o, idx) => `
          <button type="button" class="chip-btn ${myChar.outfitIdx === idx ? "active" : ""}" data-outfit="${idx}">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${o.color};margin-right:4px;"></span>${o.name}
          </button>
        `
          )
          .join("")}
      </div>

      <label style="font-size:12px;font-weight:800;color:var(--muted);">4. 座右銘標語</label>
      <div class="chip-grid">
        ${opts.quotes
          .map(
            (q, idx) => `
          <button type="button" class="chip-btn ${myChar.quoteIdx === idx ? "active" : ""}" data-quote="${idx}" style="text-align:left;border-radius:10px;">
            ${q}
          </button>
        `
          )
          .join("")}
      </div>
    `;

    const nameInp = document.getElementById("char-name-inp");
    nameInp.addEventListener("input", () => {
      myChar.name = nameInp.value || "統計探索者";
      localStorage.setItem(STORAGE_CHAR, JSON.stringify(myChar));
    });

    box.querySelectorAll("[data-role]").forEach((b) => {
      b.addEventListener("click", () => {
        myChar.role = b.dataset.role;
        localStorage.setItem(STORAGE_CHAR, JSON.stringify(myChar));
        renderCharDrawer();
      });
    });
    box.querySelectorAll("[data-tool]").forEach((b) => {
      b.addEventListener("click", () => {
        myChar.tool = b.dataset.tool;
        localStorage.setItem(STORAGE_CHAR, JSON.stringify(myChar));
        renderCharDrawer();
      });
    });
    box.querySelectorAll("[data-outfit]").forEach((b) => {
      b.addEventListener("click", () => {
        myChar.outfitIdx = Number(b.dataset.outfit);
        localStorage.setItem(STORAGE_CHAR, JSON.stringify(myChar));
        renderCharDrawer();
      });
    });
    box.querySelectorAll("[data-quote]").forEach((b) => {
      b.addEventListener("click", () => {
        myChar.quoteIdx = Number(b.dataset.quote);
        localStorage.setItem(STORAGE_CHAR, JSON.stringify(myChar));
        renderCharDrawer();
      });
    });
  }

  // ============================================================================
  // 3D 六角群島渲染引擎 (#scene-canvas)
  // ============================================================================
  let canvas, ctx, cw = 1000, ch = 700;

  function project3D(wx, wy, wz) {
    const dx = wx - cam.curX;
    const dz = wz - cam.curZ;

    const cosY = Math.cos(cam.yaw);
    const sinY = Math.sin(cam.yaw);
    const rx = dx * cosY - dz * sinY;
    const rz = dx * sinY + dz * cosY;

    const cosP = Math.cos(cam.pitch);
    const sinP = Math.sin(cam.pitch);
    const cy = wy * cosP - rz * sinP;
    const cz = wy * sinP + rz * cosP + 195;

    if (cz < 20) return null;
    const scale = (540 * cam.zoom) / cz;
    return {
      x: cw * 0.5 + rx * scale,
      y: ch * 0.49 - cy * scale,
      scale,
      depth: cz
    };
  }

  function getSkyPalette() {
    switch (timeOfDay) {
      case "dawn":
        return { top: "#f2c6b6", bot: "#8ab8c2", water: "#6297a3", rim: "#f7d9c4" };
      case "dusk":
        return { top: "#d9896c", bot: "#4e6d82", water: "#436175", rim: "#f5b982" };
      case "night":
        return { top: "#16222f", bot: "#243b4a", water: "#1b313f", rim: "#3a5a70" };
      default:
        return { top: "#a8d5df", bot: "#75aeb8", water: "#639ca8", rim: "#e8f4f7" };
    }
  }

  function drawHexPrism(cx, cz, radius, height, topColor, sideColor, isSelected, isLit) {
    const topPts = [];
    const botPts = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i + Math.PI / 6;
      const vx = cx + radius * Math.cos(ang);
      const vz = cz + radius * Math.sin(ang);
      const pTop = project3D(vx, height, vz);
      const pBot = project3D(vx, 0, vz);
      if (!pTop || !pBot) return;
      topPts.push(pTop);
      botPts.push(pBot);
    }

    // 海面柔和光暈 (已點燈島嶼發金色光環)
    const centerBot = project3D(cx, 0, cz);
    if (centerBot) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i + Math.PI / 6;
        const p = project3D(cx + radius * 1.14 * Math.cos(ang), -0.5, cz + radius * 1.14 * Math.sin(ang));
        if (p) {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.closePath();
      ctx.fillStyle = isLit
        ? "rgba(252, 234, 139, 0.38)"
        : isSelected
        ? "rgba(255, 248, 244, 0.45)"
        : "rgba(255, 255, 255, 0.16)";
      ctx.fill();
      ctx.restore();
    }

    // 繪製六角柱側面
    for (let i = 0; i < 6; i++) {
      const ni = (i + 1) % 6;
      ctx.beginPath();
      ctx.moveTo(topPts[i].x, topPts[i].y);
      ctx.lineTo(topPts[ni].x, topPts[ni].y);
      ctx.lineTo(botPts[ni].x, botPts[ni].y);
      ctx.lineTo(botPts[i].x, botPts[i].y);
      ctx.closePath();
      ctx.fillStyle = sideColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(33,29,29,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 繪製六角柱頂面
    ctx.beginPath();
    topPts.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();
    ctx.strokeStyle = isLit ? "#fcea8b" : isSelected ? "#ffffff" : "rgba(255,255,255,0.45)";
    ctx.lineWidth = isLit || isSelected ? 2.5 : 1.2;
    ctx.stroke();
  }

  function drawBuildingBox(wx, wz, bw, bd, bh, baseY, color, isLit, isSelected) {
    const hw = bw * 0.5;
    const hd = bd * 0.5;
    const corners = [
      { x: wx - hw, z: wz - hd },
      { x: wx + hw, z: wz - hd },
      { x: wx + hw, z: wz + hd },
      { x: wx - hw, z: wz + hd }
    ];
    const topP = corners.map((c) => project3D(c.x, baseY + bh, c.z));
    const botP = corners.map((c) => project3D(c.x, baseY, c.z));
    if (topP.some((p) => !p) || botP.some((p) => !p)) return;

    // 側面
    for (let i = 0; i < 4; i++) {
      const ni = (i + 1) % 4;
      ctx.beginPath();
      ctx.moveTo(topP[i].x, topP[i].y);
      ctx.lineTo(topP[ni].x, topP[ni].y);
      ctx.lineTo(botP[ni].x, botP[ni].y);
      ctx.lineTo(botP[i].x, botP[i].y);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? color : "#dfd1c5";
      ctx.fill();
      ctx.strokeStyle = "rgba(33,29,29,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 屋頂
    ctx.beginPath();
    topP.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = isSelected ? "#db6a41" : isLit ? "#f5b82e" : "#fff8f4";
    ctx.fill();
    ctx.strokeStyle = "rgba(33,29,29,0.25)";
    ctx.stroke();

    // 若已點燈或夜晚模式，繪製發光窗戶與頂部知識光束
    if (isLit || timeOfDay === "night" || timeOfDay === "dusk") {
      const winP = project3D(wx, baseY + bh * 0.55, wz + hd * 0.8);
      if (winP) {
        ctx.fillStyle = isLit ? "#fcea8b" : "rgba(252, 234, 139, 0.5)";
        ctx.beginPath();
        ctx.arc(winP.x, winP.y, Math.max(2, 2.8 * winP.scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function stepSimulation(now) {
    // 平滑攝影機插值
    const targetPitch = toggles.bird ? 1.18 : cam.targetPitch;
    const targetZoom = toggles.bird ? 0.82 : cam.targetZoom;
    cam.curX += (cam.tx - cam.curX) * 0.09;
    cam.curZ += (cam.tz - cam.curZ) * 0.09;
    cam.yaw += (cam.targetYaw - cam.yaw) * 0.09;
    cam.pitch += (targetPitch - cam.pitch) * 0.09;
    cam.zoom += (targetZoom - cam.zoom) * 0.09;

    // 更新研究員與彩蛋導師位置
    if (!toggles.pause) {
      walkers.forEach((w) => {
        if (w.type === "researcher") {
          w.t += w.speed;
          if (w.t >= 1) {
            w.t -= 1;
            statsLog.departed++;
            statsLog.arrived++;
            if (Math.random() < 0.06) {
              const toIsl = islandWorldMap.get(w.flow.to);
              pushLog("arrive", `${w.flow.role}將「${w.flow.cargo}」送抵【${toIsl.name}】`);
            }
          }
          const fromIsl = islandWorldMap.get(w.flow.from);
          const toIsl = islandWorldMap.get(w.flow.to);
          if (fromIsl && toIsl) {
            w.wx = fromIsl.wx + (toIsl.wx - fromIsl.wx) * w.t;
            w.wz = fromIsl.wz + (toIsl.wz - fromIsl.wz) * w.t;
          }
        } else {
          // 高斯與費雪導師沿著 12 座島巡迴
          w.t += w.speed;
          if (w.t >= 1) {
            w.t = 0;
            w.islandIdx = (w.islandIdx + 1) % DATA.islands.length;
          }
          const curIsl = DATA.islands[w.islandIdx];
          const nextIsl = DATA.islands[(w.islandIdx + 1) % DATA.islands.length];
          w.wx = curIsl.wx + (nextIsl.wx - curIsl.wx) * w.t;
          w.wz = curIsl.wz + (nextIsl.wz - curIsl.wz) * w.t;
        }
      });
    }

    // 繪製背景與海面
    const pal = getSkyPalette();
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, pal.top);
    grad.addColorStop(0.55, pal.bot);
    grad.addColorStop(1, pal.water);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    // 海面波紋圓環
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1.2;
    for (let r = 35; r <= 145; r += 35) {
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const p = project3D(Math.cos(ang) * r, -1, Math.sin(ang) * r + 15);
        if (p) {
          if (a === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
    }

    // 1. 繪製跨島統計推論知識流管線 (F1~F18)
    if (toggles.flows) {
      DATA.flows.forEach((f) => {
        const fromIsl = islandWorldMap.get(f.from);
        const toIsl = islandWorldMap.get(f.to);
        if (!fromIsl || !toIsl) return;
        const p1 = project3D(fromIsl.wx, 4.2, fromIsl.wz);
        const p2 = project3D(toIsl.wx, 4.2, toIsl.wz);
        if (!p1 || !p2) return;

        const bothLit = litIslands.has(f.from) && litIslands.has(f.to);
        const isRel = selectedIslandId === f.from || selectedIslandId === f.to;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        const midX = (p1.x + p2.x) * 0.5;
        const midY = (p1.y + p2.y) * 0.5 - 16 * Math.min(p1.scale, p2.scale);
        ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
        ctx.strokeStyle = bothLit
          ? "rgba(252, 234, 139, 0.88)"
          : isRel
          ? "rgba(219, 106, 65, 0.85)"
          : "rgba(255, 248, 244, 0.35)";
        ctx.lineWidth = bothLit || isRel ? 3 : 1.6;
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -(now * 0.025) % 22;
        ctx.stroke();
        ctx.restore();
      });
    }

    // 2. 依深度排序繪製 12 座六角島與島上建築
    const sortedIslands = [...DATA.islands].sort((a, b) => {
      const pa = project3D(a.wx, 0, a.wz);
      const pb = project3D(b.wx, 0, b.wz);
      return (pb ? pb.depth : 0) - (pa ? pa.depth : 0);
    });

    sortedIslands.forEach((isl) => {
      const isLit = litIslands.has(isl.id);
      const isSel = selectedIslandId === isl.id;
      const matched = isIslandMatched(isl);

      ctx.save();
      if (!matched) ctx.globalAlpha = 0.38;

      drawHexPrism(
        isl.wx,
        isl.wz,
        HEX_RADIUS * 0.84,
        4.5,
        isl.color,
        "#4d433e",
        isSel,
        isLit
      );

      // 繪製島中央知識燈塔
      drawBuildingBox(
        isl.wx,
        isl.wz,
        5.5,
        5.5,
        isLit ? 15 : 10,
        4.5,
        isLit ? "#f5b82e" : "#e8dcd1",
        isLit,
        isSel
      );

      // 繪製島上 4 棟指標建築
      isl.items.forEach((item) => {
        drawBuildingBox(
          item.wx,
          item.wz,
          5.2,
          5.2,
          item.bh,
          4.5,
          "#f6ebe1",
          isLit,
          selectedBuildingId === item.id
        );
      });

      ctx.restore();
    });

    // 3. 繪製走動的研究員與導師小人
    walkers.forEach((w) => {
      const p = project3D(w.wx, 5.5, w.wz);
      if (!p) return;
      ctx.save();
      ctx.beginPath();
      const r = w.type === "researcher" ? 4.2 : 6.2;
      ctx.arc(p.x, p.y, Math.max(3, r * p.scale), 0, Math.PI * 2);
      ctx.fillStyle =
        w.type === "gauss" ? "#db6a41" : w.type === "fisher" ? "#6b5b95" : "#fff8f4";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = w.type === "researcher" ? w.color : "#fcea8b";
      ctx.stroke();
      ctx.restore();
    });

    // 4. 更新 DOM 浮動標籤投影位置
    DATA.islands.forEach((isl) => {
      const el = islandLabelEls.get(isl.id);
      if (!el) return;
      const p = project3D(isl.wx, 18, isl.wz);
      if (!p) {
        el.style.display = "none";
      } else {
        el.style.display = "inline-flex";
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
      }

      if (selectedIslandId === isl.id) {
        isl.items.forEach((item) => {
          const pin = buildingPinEls.get(item.id);
          if (!pin) return;
          const bp = project3D(item.wx, item.bh + 7.5, item.wz);
          if (bp) {
            pin.style.display = "inline-flex";
            pin.style.left = `${bp.x}px`;
            pin.style.top = `${bp.y}px`;
          }
        });
      }
    });

    walkers.forEach((w, idx) => {
      const tag = walkerTagEls.get(w.id);
      if (!tag) return;
      // 導師名牌常駐顯示；研究員名牌受「名牌」開關控制，且未選島時僅顯示部分代表或與選中島相關者避免遮擋
      let visible = false;
      if (w.type !== "researcher") {
        visible = true;
      } else if (toggles.tags) {
        if (selectedIslandId) {
          visible = w.flow.from === selectedIslandId || w.flow.to === selectedIslandId;
        } else {
          visible = idx % 5 === 0;
        }
      }
      if (!visible) {
        tag.style.display = "none";
        return;
      }
      const p = project3D(w.wx, 9.5, w.wz);
      if (!p) {
        tag.style.display = "none";
      } else {
        tag.style.display = "inline-flex";
        tag.style.left = `${p.x}px`;
        tag.style.top = `${p.y}px`;
      }
    });

    requestAnimationFrame(stepSimulation);
  }

  // ============================================================================
  // 事件綁定與初始化 (Onboarding、滑鼠拖曳旋轉、縮放、鍵盤快捷鍵、URL ?focus=)
  // ============================================================================
  function initCanvasInteractions() {
    canvas = document.getElementById("scene-canvas");
    ctx = canvas.getContext("2d");

    function resize() {
      const stage = document.getElementById("stage");
      const dpr = window.devicePixelRatio || 1;
      cw = stage.clientWidth;
      ch = stage.clientHeight;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", resize);
    resize();

    let dragging = false;
    let lastX = 0, lastY = 0;

    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (e.shiftKey || e.buttons === 2) {
        cam.targetYaw -= dx * 0.006;
        cam.targetPitch = Math.max(0.35, Math.min(1.2, cam.targetPitch + dy * 0.005));
      } else {
        const cosY = Math.cos(cam.yaw);
        const sinY = Math.sin(cam.yaw);
        const panSpeed = 0.22 / cam.zoom;
        cam.tx -= (dx * cosY + dy * sinY) * panSpeed;
        cam.tz -= (-dx * sinY + dy * cosY) * panSpeed;
      }
    });

    canvas.addEventListener("pointerup", () => {
      dragging = false;
    });

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        cam.targetZoom = Math.max(0.65, Math.min(2.3, cam.targetZoom * factor));
      },
      { passive: false }
    );
  }

  function initUIControls() {
    // 1. 三步驟新手導覽 (#intro-modal)
    const introModal = document.getElementById("intro-modal");
    let introStep = 0;
    const introSteps = [
      {
        eyebrow: "WELCOME TO STAT ISLAND · STEP 1 / 3",
        title: "歡迎來到「統計學習島」3D 互動群島！",
        body: "這是一座採<strong>「全開放 ＋ 點燈制」</strong>設計的統計學探索世界。全島共有 <strong>12 座核心統計六角島、48 棟指標建築、18 條跨島推論知識流</strong>。所有島嶼從一開始就完全開放，你可以依照自己的好奇心自由飛往任何主題！"
      },
      {
        eyebrow: "INTERACTIVE SIMULATOR · STEP 2 / 3",
        title: "親手拉動統計模擬器，點亮 12 座知識燈塔！",
        body: "點擊任一座島嶼或島上的<strong>「✦ 高斯 Gauss」</strong>導師，即可開啟該島專屬的<strong>互動式統計模擬器</strong>（自由調整樣本數 n、標準差、信心水準或迴歸斜率）。完成滑桿實驗與觀念迷思診斷題，就能<strong>點亮該島的黃金燈塔与跨海知識管線</strong>！"
      },
      {
        eyebrow: "DECISION TREE DIAGNOSTIC · STEP 3 / 3",
        title: "不確定該用哪個統計檢定？問問決策樹診斷器！",
        body: "右欄頂端設有<strong>「統計方法決策樹診斷器」</strong>與 <strong>5 大研究情境實戰題</strong>。只要回答研究目的與變數測量尺度，系統就會自動診斷最適合的統計方法，並在答錯時即時解析常見統計迷思，一鍵帶你飛往對應統計島！"
      }
    ];

    function renderIntroStep() {
      const s = introSteps[introStep];
      document.getElementById("intro-eyebrow").textContent = s.eyebrow;
      document.getElementById("intro-title").textContent = s.title;
      document.getElementById("intro-body").innerHTML = s.body;
      document.getElementById("intro-prev-btn").disabled = introStep === 0;
      document.getElementById("intro-next-btn").textContent =
        introStep < introSteps.length - 1 ? "下一步 →" : "開始探索統計學習島 ✦";
    }

    document.getElementById("intro-prev-btn").addEventListener("click", () => {
      if (introStep > 0) {
        introStep--;
        renderIntroStep();
      }
    });
    document.getElementById("intro-next-btn").addEventListener("click", () => {
      if (introStep < introSteps.length - 1) {
        introStep++;
        renderIntroStep();
      } else {
        introModal.hidden = true;
        localStorage.setItem(STORAGE_ONBOARD, "1");
      }
    });
    document.getElementById("intro-skip-btn").addEventListener("click", () => {
      introModal.hidden = true;
      localStorage.setItem(STORAGE_ONBOARD, "1");
    });

    if (!localStorage.getItem(STORAGE_ONBOARD)) {
      introModal.hidden = false;
      renderIntroStep();
    }

    // 2. 頂部時段切換 (清晨 / 白天 / 黃昏 / 夜晚)
    document.querySelectorAll(".time-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        timeOfDay = btn.dataset.time;
        document.body.classList.toggle("night", timeOfDay === "night");
        document.querySelectorAll(".time-btn").forEach((b) => {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
      });
    });

    // 3. 頂部 6 個環境開關 (名牌 / 搬運 / 知識線 / 暫停 / 鳥瞰 / 學習日誌)
    document.querySelectorAll(".tg[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.toggle;
        toggles[k] = !toggles[k];
        syncToggleButtons();
        if (k === "cargo") syncDOMLabelsState();
        if (k === "log") {
          document.getElementById("log-drawer").hidden = !toggles.log;
          renderLogDrawer();
        }
      });
    });

    // 4. 右上角工具列 (☺ 研究員角色 / 診斷器 / 展開收合側欄 / ? 導覽)
    document.getElementById("char-btn").addEventListener("click", () => {
      const dr = document.getElementById("char-drawer");
      dr.hidden = !dr.hidden;
      if (!dr.hidden) renderCharDrawer();
    });
    document.getElementById("char-close-btn").addEventListener("click", () => {
      document.getElementById("char-drawer").hidden = true;
    });
    document.getElementById("log-close-btn").addEventListener("click", () => {
      toggles.log = false;
      document.getElementById("log-drawer").hidden = true;
      syncToggleButtons();
    });

    document.getElementById("help-btn").addEventListener("click", () => {
      introStep = 0;
      renderIntroStep();
      introModal.hidden = false;
    });

    const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
    toggleSidebarBtn.addEventListener("click", () => {
      const app = document.getElementById("app");
      const hidden = app.classList.toggle("sidebar-hidden");
      toggleSidebarBtn.textContent = hidden ? "展開索引" : "收合索引";
      setTimeout(() => window.dispatchEvent(new Event("resize")), 310);
    });

    // 5. 左側卡片關閉按鈕
    document.getElementById("card-close").addEventListener("click", () => {
      document.getElementById("card").hidden = true;
      selectedIslandId = null;
      selectedBuildingId = null;
      syncDOMLabelsState();
    });

    // 6. 右欄「統計方法決策樹診斷器」入口與搜尋、分頁
    document.getElementById("open-dtree-btn").addEventListener("click", () => {
      window.openDecisionTree("tree");
    });

    const searchInp = document.getElementById("search");
    searchInp.addEventListener("input", () => {
      searchQuery = searchInp.value;
      renderSidebarTree();
    });

    document.querySelectorAll(".sidebar-tabs button").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSidebarTab = btn.dataset.tab;
        document.querySelectorAll(".sidebar-tabs button").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        renderSidebarTree();
      });
    });

    // 7. 底部三視角切換面板 (01 點燈進度 / 02 學習階段 / 03 STATS 五大維度)
    document.querySelectorAll(".panel-tabs button").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const pid = tabBtn.dataset.panel;
        document.querySelectorAll(".panel-tabs button").forEach((b) => b.classList.toggle("active", b === tabBtn));
        document.querySelectorAll(".sub-panel").forEach((sp) => {
          sp.classList.toggle("active", sp.id === `panel-${pid}`);
        });
        activeFilter = null;
        document.querySelectorAll(".sub-panel button").forEach((b) => b.classList.remove("active"));
        syncDOMLabelsState();
      });
    });

    document.querySelectorAll(".sub-panel button[data-ftype]").forEach((fBtn) => {
      fBtn.addEventListener("click", () => {
        const ftype = fBtn.dataset.ftype;
        const fval = fBtn.dataset.fval;
        if (activeFilter && activeFilter.type === ftype && activeFilter.value === fval) {
          activeFilter = null;
          fBtn.classList.remove("active");
        } else {
          activeFilter = { type: ftype, value: fval };
          fBtn.parentElement.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
          fBtn.classList.add("active");
        }
        syncDOMLabelsState();
      });
    });

    // 8. 鍵盤快捷鍵
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.key === "Escape") {
        document.getElementById("sim-modal").hidden = true;
        document.getElementById("dtree-modal").hidden = true;
        document.getElementById("intro-modal").hidden = true;
        document.getElementById("card").hidden = true;
        selectedIslandId = null;
        selectedBuildingId = null;
        syncDOMLabelsState();
      } else if (e.key === " ") {
        e.preventDefault();
        toggles.pause = !toggles.pause;
        syncToggleButtons();
      } else if (e.key.toLowerCase() === "r") {
        cam.tx = 0;
        cam.tz = 18;
        cam.targetZoom = 1.0;
        cam.targetYaw = 0.45;
        cam.targetPitch = 0.68;
      }
    });
  }

  // 啟動入口
  window.addEventListener("DOMContentLoaded", () => {
    loadPersistedState();
    computeWorldPositions();
    initWalkers();
    createDOMLabels();
    initCanvasInteractions();
    initUIControls();
    window.initSimulatorEvents();
    window.initDecisionTreeEvents();

    updateStatusBar();
    renderSidebarTree();

    pushLog("depart", "12 座統計六角島與 18 條推論知識流已完成初始化！");
    pushLog("arrive", "✦ 高斯導師與費雪島主已開始巡迴群島，點擊即可互動。");

    // 支援 URL ?focus=07 直接聚焦對應島嶼
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get("focus");
    if (focusId && islandWorldMap.has(focusId)) {
      window.selectIsland(focusId);
    }

    requestAnimationFrame(stepSimulation);
  });
})();
