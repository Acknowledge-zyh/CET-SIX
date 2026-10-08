/* 「六级单词复习」主视图逻辑 ｜ 按 PRD.md 生成
   职责：
     ① 请求词库 data/words.json（换正式词库时只改 WORDS_URL 一行）
     ② 渲染区块①②③：顶栏进度 / 学习区词卡 / 侧栏统计
     ③ 四种页面状态：加载中 / 成功 / 空 / 错误（只占区块②③，顶部与标签始终可见）
     ④ 学习与复习交互：学会标记、先回想再看释义、复习完成标记
     ⑤ 记录写 localStorage（cet6_learned_v1 / cet6_reviewed_v1），不上传服务器
   明确不做（PRD 3.2）：登录、云端同步、发音、推送、排行、付费 */

// ===== 配置 =====
const WORDS_URL = "data/words.json";       // 词库地址（换正式词库只改这里）
const KEY_LEARNED = "cet6_learned_v1";     // 沿用 v0 的键，老记录不会丢
const KEY_REVIEWED = "cet6_reviewed_v1";   // 新增：复习完成记录

/* ===== 视图路由表（Day 13）=====
   三个独立视图用 hash 路由切换（#/learn、#/review、#/records）。
   选 hash 而不是 history API + 服务端 rewrite 的理由：
     1) 纯静态托管，不需要服务端配合；
     2) 刷新或直接分享链接后仍停在同一视图；
     3) 浏览器前进/后退天然等于「返回上一页」，不用自己维护导航栈；
     4) 零依赖，符合今天「路由库进阶用法不做」的边界。 */
const VIEWS = {
  learn: {
    label: "新单词学习", hash: "#/learn",
    hint: "点「学会了」把单词记入学习记录；它明天会出现在「昨日单词复习」里。",
  },
  review: {
    label: "昨日单词复习", hash: "#/review",
    hint: "这里只显示你昨天学过的词。先自己回想，再点「想起来了」对一下释义。",
  },
  records: {
    label: "学习记录", hash: "#/records",
    hint: "按日期倒序看你的学习痕迹；数据来自本机记录，不上传服务器。",
  },
};

// ===== 运行状态 =====
let wordsData = null;   // 最近一次成功拿到的词库
let currentView = "learn";  // 当前视图：learn / review / records（由 hash 路由决定）
let mode = "new";       // 当前视图对应的词单模式：new=新单词学习 / review=昨日单词复习
let wantSeed = null;    // 是否为 ?demo=seed / ?demo=yesterday / ?demo=all 演示模式（开发调试用）
let navDepth = 0;       // 应用内视图切换次数（>0 时「← 返回」按钮可用）

/* ===== 状态筛选（2026-10-08 新增）=====
   数据对象 = 词卡；筛选条件 = 学习状态。两个标签的状态集合不同，切标签自动回「全部」。
   all=全部 / pending=未学 / today=今天已学 / earlier=之前已学 / todo=还未复习 / done=今天已复习 */
let statusFilter = "all";
const STATUS_OPTIONS = {
  new: [
    { value: "all", label: "全部" },
    { value: "pending", label: "未学" },
    { value: "today", label: "今天已学" },
    { value: "earlier", label: "之前已学" },
  ],
  review: [
    { value: "all", label: "全部" },
    { value: "todo", label: "还未复习" },
    { value: "done", label: "今天已复习" },
  ],
};

// ===== 小工具 =====
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ===== 本地记录读写 =====
function loadMap(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch (e) {
    return {}; // 解析失败按空处理
  }
}

function saveMap(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
    return true;
  } catch (e) {
    // 隐私模式等：提示但不影响浏览（PRD 第 7 节）
    alert("当前浏览器环境不支持保存记录，这次的学习不会被保留。");
    return false;
  }
}

// 词库里的词（去掉重复词，以第一次出现的为准，PRD 第 7 节）
function allWords() {
  if (!wordsData || !wordsData.words) return [];
  const seen = {};
  return wordsData.words.filter(function (w) {
    if (!w || !w.word || seen[w.word]) return false;
    seen[w.word] = true;
    return true;
  });
}

// 各模式下的词单
function wordsLearnedToday() {
  const learned = loadMap(KEY_LEARNED), today = todayStr();
  return allWords().filter((w) => learned[w.word] === today);
}
function wordsOfYesterday() {
  const learned = loadMap(KEY_LEARNED), yd = yesterdayStr();
  return allWords().filter((w) => learned[w.word] === yd);
}
function wordsPending() {
  const learned = loadMap(KEY_LEARNED);
  return allWords().filter((w) => !learned[w.word]);
}

// ===== 状态筛选：判定 / 过滤 / 渲染 =====
// 一个词在当前标签下的学习状态
function statusOf(w) {
  if (mode === "review") {
    return loadMap(KEY_REVIEWED)[w.word] === todayStr() ? "done" : "todo";
  }
  const d = loadMap(KEY_LEARNED)[w.word];
  if (!d) return "pending";
  return d === todayStr() ? "today" : "earlier";
}

function statusLabel(value) {
  const hit = (STATUS_OPTIONS[mode] || []).filter((o) => o.value === value)[0];
  return hit ? hit.label : value;
}

// 结果规则：只保留符合当前状态的词卡；选「全部」时不筛
function applyStatusFilter(list) {
  if (statusFilter === "all") return list;
  return list.filter((w) => statusOf(w) === statusFilter);
}

// 渲染筛选按钮（按当前标签的状态集合，不写死 HTML）
function renderStatusFilter() {
  const box = $("status-chips");
  if (!box) return;
  box.innerHTML = "";
  (STATUS_OPTIONS[mode] || []).forEach((opt) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "status-chip";     // 与侧栏「已学单词」的 .chip 区分，勿混用
    chip.dataset.status = opt.value;
    chip.textContent = opt.label;
    chip.setAttribute("aria-pressed", statusFilter === opt.value ? "true" : "false");
    box.appendChild(chip);
  });
  syncStatusFilterUI();
}

// 只同步选中态（不重建节点，避免键盘焦点丢失）
function syncStatusFilterUI() {
  const chips = document.querySelectorAll("#status-chips .status-chip");
  Array.prototype.forEach.call(chips, (chip) => {
    chip.setAttribute("aria-pressed", chip.dataset.status === statusFilter ? "true" : "false");
  });
  const btn = $("status-clear");
  if (btn) btn.disabled = statusFilter === "all";
}

// 计数（aria-live，读屏可播报）；未筛选时留空保持界面干净
function updateStatusCount(text) {
  const el = $("status-count");
  if (el) el.textContent = text || "";
}

function setStatusFilter(value) {
  statusFilter = value;
  syncStatusFilterUI();
  renderContent();
}

// 恢复规则：回「全部」→ 列表按词库原顺序逐条复原 → 焦点回「全部」按钮
function clearStatusFilter() {
  statusFilter = "all";
  syncStatusFilterUI();
  renderContent();
  const all = document.querySelector('#status-chips .status-chip[data-status="all"]');
  if (all) all.focus();
}

// 筛选空态（数据层空态优先，两者文案不同）：如实说明条件并给出路
function statusEmptyState(total) {
  return renderState("empty", {
    icon: "🔍",
    text: "没有符合这个状态的单词",
    sub: "当前筛选：" + statusLabel(statusFilter) + "；这个范围共 " + total + " 个词。换个状态试试，或点下方按钮看全部",
    actionLabel: "清除筛选",
    onAction: function () { clearStatusFilter(); },
  });
}

// ===== 各视图的「数据层空态」（Day 13）=====
// 与筛选空态区分：数据层空态说明的是"这个视图本来就没有内容"，优先于筛选空态显示
function dataEmptyState(view) {
  if (view === "review") {
    return renderState("empty", {
      icon: "🌙", text: "昨天没有学习记录",
      sub: "今天在「新单词学习」里标记几个，明天它们就会出现在这里",
      actionLabel: "去学新单词", onAction: function () { goView("learn"); },
    });
  }
  if (view === "records") {
    return renderState("empty", {
      icon: "📄", text: "还没有学习记录",
      sub: "在「新单词学习」里点几个「学会了」，这里就会按日期记下来",
      actionLabel: "去学新单词", onAction: function () { goView("learn"); },
    });
  }
  return renderState("empty", {
    icon: "🎉", text: "今天的新词都学完啦", sub: "去「昨日单词复习」把昨天的词再过一遍",
    actionLabel: "去昨日复习", onAction: function () { goView("review"); },
  });
}

// ===== 学习记录视图（Day 13 新增的第 3 个视图）=====
// 把 cet6_learned_v1 按日期分组，倒序展示：日期 + 当天学的词 + 其中已复习几个
function learnedByDate() {
  const learned = loadMap(KEY_LEARNED);
  const byDate = {};
  allWords().forEach(function (w) {
    const d = learned[w.word];
    if (!d) return;
    (byDate[d] = byDate[d] || []).push(w.word);
  });
  return Object.keys(byDate).sort().reverse().map(function (d) {
    return { date: d, words: byDate[d] };
  });
}

function renderRecords() {
  const groups = learnedByDate();
  if (groups.length === 0) return dataEmptyState("records");

  const reviewed = loadMap(KEY_REVIEWED);
  const today = todayStr();
  const learned = loadMap(KEY_LEARNED);

  const box = document.createElement("div");
  box.className = "records";

  // 概览四数：与侧栏同一套口径，避免两处对不上
  const summary = document.createElement("div");
  summary.className = "record-summary";
  [
    { label: "学习天数", value: groups.length + " 天" },
    { label: "累计已学", value: Object.keys(learned).length + " 词" },
    { label: "今天已学", value: wordsLearnedToday().length + " 词" },
    { label: "今天已复习", value: Object.keys(reviewed).filter(function (k) { return reviewed[k] === today; }).length + " 词" },
  ].forEach(function (item) {
    const cell = document.createElement("div");
    cell.className = "record-cell";
    cell.innerHTML = '<span class="record-cell-label">' + esc(item.label) + "</span>" +
                     '<strong class="record-cell-value">' + esc(item.value) + "</strong>";
    summary.appendChild(cell);
  });
  box.appendChild(summary);

  const list = document.createElement("ul");
  list.className = "record-list";
  groups.forEach(function (g) {
    const li = document.createElement("li");
    li.className = "record-day";

    const doneCount = g.words.filter(function (w) { return reviewed[w] === today; }).length;
    li.innerHTML =
      '<div class="record-head">' +
        '<span class="record-date">' + esc(g.date) + (g.date === today ? "（今天）" : g.date === yesterdayStr() ? "（昨天）" : "") + "</span>" +
        '<span class="record-meta">' + g.words.length + " 个词 · 其中今天复习 " + doneCount + " 个</span>" +
      "</div>";

    const words = document.createElement("ul");
    words.className = "record-words";
    g.words.forEach(function (w) {
      const chip = document.createElement("li");
      chip.className = "chip";
      chip.textContent = w;
      words.appendChild(chip);
    });
    li.appendChild(words);
    list.appendChild(li);
  });
  box.appendChild(list);
  return box;
}

// ===== 可复用组件 1：词卡 =====
// 新词卡：释义直接显示；复习卡：释义默认隐藏，先回想再点开（PRD F3）
function createWordCard(w, isReview) {
  const learned = loadMap(KEY_LEARNED);
  const reviewed = loadMap(KEY_REVIEWED);
  const today = todayStr();

  const li = document.createElement("li");
  const learnedToday = learned[w.word] === today;
  const reviewedToday = reviewed[w.word] === today;
  li.className = "card" + (isReview ? (reviewedToday ? " done" : "") : (learned[w.word] ? " done" : ""));

  const head =
    '<div class="card-head">' +
      '<span class="card-word">' + esc(w.word) + "</span>" +
      (w.phonetic ? '<span class="card-phonetic">' + esc(w.phonetic) + "</span>" : "") +
    "</div>";

  if (!isReview) {
    // —— 新单词学习 ——
    li.innerHTML = head +
      '<p class="card-meaning">' + esc(w.meaning) + "</p>" +
      '<div class="card-foot"></div>';
    const foot = li.querySelector(".card-foot");
    if (learned[w.word]) {
      const tag = document.createElement("span");
      tag.className = "tag-done";
      tag.textContent = learnedToday ? "✓ 今天已学" : "✓ " + learned[w.word] + " 已学";
      foot.appendChild(tag);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-learn";
      btn.textContent = "学会了";
      btn.addEventListener("click", function () {
        const rec = loadMap(KEY_LEARNED);
        rec[w.word] = todayStr();
        if (!saveMap(KEY_LEARNED, rec)) return;
        // 就地更新这张卡，不整页重画：筛选生效时也让卡片先留在原位，
        // 不然"刚点完学会了它就从当前筛选结果里飞走"，用户会以为没成功
        li.classList.add("done");
        foot.innerHTML = "";
        const tag = document.createElement("span");
        tag.className = "tag-done";
        tag.textContent = "✓ 今天已学";
        foot.appendChild(tag);
        renderTopbar();
        renderStats();
      });
      foot.appendChild(btn);
    }
    return li;
  }

  // —— 昨日单词复习 ——
  li.innerHTML = head +
    '<p class="card-meaning hidden">' + esc(w.meaning) + "</p>" +
    '<div class="card-foot"></div>';
  const meaning = li.querySelector(".card-meaning");
  const foot = li.querySelector(".card-foot");

  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "btn btn-reveal";
  reveal.textContent = "想起来了";
  reveal.addEventListener("click", function () {
    const showing = !meaning.classList.contains("hidden");
    if (showing) {
      // 先收起，不算复习
      meaning.classList.add("hidden");
      reveal.textContent = "想起来了";
      return;
    }
    // 展开释义 = 这次复习完成，记一笔（PRD F3 / 6.2）
    meaning.classList.remove("hidden");
    reveal.textContent = "收起释义";
    const rec = loadMap(KEY_REVIEWED);
    rec[w.word] = todayStr();
    if (saveMap(KEY_REVIEWED, rec)) {
      li.classList.add("done");
      if (tag) tag.classList.remove("hidden");
      renderStats();
      renderTopbar();
    }
  });
  foot.appendChild(reveal);

  const tag = document.createElement("span");
  tag.className = "tag-done" + (reviewedToday ? "" : " hidden");
  tag.textContent = "✓ 今天已复习";
  foot.appendChild(tag);

  return li;
}

// ===== 可复用组件 2：状态视图（加载中 / 空 / 错误）=====
// opts: { icon, text, sub, actionLabel, onAction }
function renderState(kind, opts) {
  opts = opts || {};
  const box = document.createElement("div");
  box.className = "state-block state-" + kind;

  if (kind === "loading") {
    box.innerHTML =
      '<div class="state-icon">⏳</div>' +
      '<p class="state-text">正在加载今天的单词…</p>' +
      '<div class="skeleton-list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
    return box;
  }

  box.innerHTML =
    '<div class="state-icon">' + (opts.icon || "🍃") + "</div>" +
    '<p class="state-text">' + esc(opts.text || "") + "</p>" +
    (opts.sub ? '<p class="state-sub">' + esc(opts.sub) + "</p>" : "");

  if (opts.actionLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn " + (kind === "error" ? "btn-learn" : "btn-ghost");
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", opts.onAction);
    box.appendChild(btn);
  }
  return box;
}

// ===== 渲染区块② 学习区 =====
function renderContent() {
  const content = $("content");
  content.innerHTML = "";
  updateStatusCount("");   // 计数每次重画先清空，由下面各分支按需填

  // 开发调试开关：地址后加 ?state=loading|empty|error 可强制预览某种状态
  // 空态文案随当前视图变化（三个视图的空态各不相同，见 dataEmptyState）
  const forced = new URLSearchParams(location.search).get("state");
  if (forced === "loading" || forced === "empty" || forced === "error") {
    if (forced === "empty") {
      content.appendChild(dataEmptyState(currentView));
    } else if (forced === "error") {
      content.appendChild(renderState("error", {
        icon: "⚠️", text: "单词加载失败", sub: "可能是网络问题，点一下重新加载试试",
        actionLabel: "重新加载", onAction: handleRetry,
      }));
    } else {
      content.appendChild(renderState("loading"));
    }
    return;
  }

  if (!wordsData) { content.appendChild(renderState("loading")); return; }

  const words = allWords();
  // 空状态之一：词库本身是空的
  if (words.length === 0) {
    content.appendChild(renderState("empty", {
      icon: "📭", text: "词库还没有单词", sub: "把单词写进 data/words.json，页面就会自动显示",
    }));
    return;
  }

  // 视图③ 学习记录（Day 13）：渲染完再返回，不走词卡分支
  if (currentView === "records") {
    content.appendChild(renderRecords());
    return;
  }

  if (mode === "new") {
    const pending = wordsPending();
    // 空状态之二：今天的词全部学完（PRD 第 7 节）——数据层空态优先于筛选空态
    if (pending.length === 0) {
      content.appendChild(dataEmptyState("learn"));
      return;
    }
    const shown = applyStatusFilter(words);
    // 筛选空态：本次筛选没有结果（与上面两种数据层空态区分开）
    if (shown.length === 0) {
      content.appendChild(statusEmptyState(words.length));
      return;
    }
    const list = document.createElement("ul");
    list.className = "card-list";
    shown.forEach((w) => list.appendChild(createWordCard(w, false)));
    content.appendChild(list);
    updateStatusCount(statusFilter === "all" ? "" : shown.length + " / " + words.length + " 个");
    return;
  }

  // 复习模式
  const reviewWords = wordsOfYesterday();
  // 空状态之三：昨天没有学习记录（PRD 第 7 节）——数据层空态优先于筛选空态
  if (reviewWords.length === 0) {
    content.appendChild(dataEmptyState("review"));
    return;
  }
  const shownReview = applyStatusFilter(reviewWords);
  if (shownReview.length === 0) {
    content.appendChild(statusEmptyState(reviewWords.length));
    return;
  }
  const list = document.createElement("ul");
  list.className = "card-list";
  shownReview.forEach((w) => list.appendChild(createWordCard(w, true)));
  content.appendChild(list);
  updateStatusCount(statusFilter === "all" ? "" : shownReview.length + " / " + reviewWords.length + " 个");
}

// ===== 渲染区块③ 侧栏 =====
function renderStats() {
  const total = allWords().length;
  const todayCount = wordsLearnedToday().length;
  const ydCount = wordsOfYesterday().length;
  const learned = loadMap(KEY_LEARNED);
  const reviewed = loadMap(KEY_REVIEWED), today = todayStr();
  const reviewedToday = Object.keys(reviewed).filter((k) => reviewed[k] === today).length;
  const totalLearned = Object.keys(learned).length;

  $("stat-today").textContent = todayCount + " / " + total;
  $("stat-yesterday").textContent = ydCount + " 词";
  $("stat-reviewed").textContent = reviewedToday + " 词";
  $("stat-total").textContent = totalLearned + " 词";

  // 标签角标：新词 = 还没学的数量；复习 = 昨天学过的数量
  $("badge-new").textContent = wordsPending().length;
  $("badge-review").textContent = ydCount;

  // 已学单词速览（按学习日期倒序，最多 8 个）
  const chips = $("learned-chips");
  chips.innerHTML = "";
  const list = allWords()
    .filter((w) => learned[w.word])
    .sort((a, b) => (learned[a.word] < learned[b.word] ? 1 : -1))
    .slice(0, 8);
  if (list.length === 0) {
    chips.innerHTML = '<li class="chip-empty">还没有学过的单词，从左边开始吧</li>';
  } else {
    list.forEach((w) => {
      const li = document.createElement("li");
      li.className = "chip";
      li.textContent = w.word;
      li.title = "学会于 " + learned[w.word];
      chips.appendChild(li);
    });
  }
}

// ===== 渲染区块① 顶栏进度 =====
function renderTopbar() {
  const total = allWords().length;
  const todayCount = wordsLearnedToday().length;
  const forced = new URLSearchParams(location.search).get("state");
  if (forced) {
    $("progress-count").textContent = "状态预览：" + forced;
    $("progress-bar").style.width = "0%";
    return;
  }
  $("progress-count").textContent = todayCount + " / " + total;
  $("progress-bar").style.width = (total ? Math.round((todayCount / total) * 100) : 0) + "%";
}

/* ===== 视图切换（Day 13：三级切换的 L1）=====
   ① showView(view)：把界面同步到某个视图（不改地址）
   ② goView(view)：用户操作入口——只改 hash，变化后由 onHashChange 统一驱动
   ③ onHashChange()：首次加载、点导航、浏览器前进/后退都汇聚到这里
   为什么这么绕：让"地址栏 = 唯一事实来源"，视图状态就不会和 URL 打架 */
let viewStack = ["learn"];   // 应用内走过的视图顺序，决定「← 返回」是否可用
let selfNav = false;         // 本次 hash 变化是否由应用自己触发

function viewFromHash() {
  const key = (location.hash || "").replace(/^#\/?/, "").trim();
  return Object.prototype.hasOwnProperty.call(VIEWS, key) ? key : "learn";
}

function showView(view) {
  if (!Object.prototype.hasOwnProperty.call(VIEWS, view)) view = "learn";
  currentView = view;
  mode = view === "review" ? "review" : "new";   // 记录视图沿用 new 的词单口径（该视图不筛状态）
  statusFilter = "all";                          // 各视图筛选集合不同，切视图回「全部」，避免残留无效条件

  // L1 导航选中态（tablist）+ roving tabindex，键盘只需停在一个标签上
  document.querySelectorAll("#view-tabs .tab").forEach(function (tab) {
    const on = tab.dataset.view === view;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
  });

  // 面包屑 = 当前位置；筛选栏只属于有列表数据的两个视图
  $("crumb-current").textContent = VIEWS[view].label;
  $("hint").textContent = VIEWS[view].hint;
  $("status-filter").hidden = (view === "records");

  renderStatusFilter();
  renderContent();
  renderTopbar();
}

function syncBackButton() {
  const btn = $("btn-back");
  if (btn) btn.disabled = viewStack.length <= 1;
}

function onHashChange() {
  const next = viewFromHash();
  const last = viewStack[viewStack.length - 1];
  if (selfNav) {
    selfNav = false;
    if (next !== last) viewStack.push(next);
  } else if (viewStack.length > 1 && viewStack[viewStack.length - 2] === next) {
    viewStack.pop();          // 浏览器「后退」回到上一个视图
  } else if (next !== last) {
    viewStack.push(next);     // 前进 / 直接在地址栏改 hash
  }
  showView(next);
  syncBackButton();
}

// 点导航或空态按钮：改 hash（前进/后退因此天然可用），已在该视图则只同步界面
function goView(view) {
  if (!VIEWS[view]) return;
  if (view === currentView) { showView(view); return; }
  selfNav = true;
  location.hash = VIEWS[view].hash;
}

// 「← 返回」：交给浏览器历史，不自己维护导航栈
function goBack() {
  if (viewStack.length <= 1) return;
  history.back();
}

function renderAll() {
  renderTopbar();
  renderStats();
  renderStatusFilter();
  renderContent();
}

// ===== 数据加载：串起四种状态（PRD F5）=====
function loadData() {
  const forced = new URLSearchParams(location.search).get("state");
  if (forced === "loading" || forced === "empty" || forced === "error") {
    renderAll();
    return;
  }

  $("content").innerHTML = "";
  $("content").appendChild(renderState("loading"));

  fetch(WORDS_URL)
    .then((res) => res.json())
    .then((data) => {
      wordsData = data;                       // 先存下来，后面的演示模式也要用
      if (wantSeed) { seedDemo(wantSeed); return; }   // 演示模式：先造点记录再渲染
      renderAll();
    })
    .catch(() => {
      // 错误态：顶部与标签仍在，绝不白屏（PRD 第 7 节）
      $("content").innerHTML = "";
      $("content").appendChild(renderState("error", {
        icon: "⚠️", text: "单词加载失败", sub: "可能是网络问题，点一下重新加载试试",
        actionLabel: "重新加载", onAction: handleRetry,
      }));
    });
}

function handleRetry() {
  if (new URLSearchParams(location.search).get("state")) {
    location.href = location.pathname + location.hash;   // 清掉预览参数回到正常加载，但保留当前视图
    return;
  }
  loadData();
}

// 演示数据：地址后加 ?demo=seed（开发 / 打卡截图用）
// 造出"昨天学了 4 个词、今天学了 3 个、今天复习了 1 个"的记录
// ?demo=yesterday：只造"昨天学过 4 个、今天还没学"，用于预览筛选的空结果态
// ?demo=all：全部词都标成今天已学，用于预览「今天的新词都学完啦」的数据层空态
function seedDemo(kind) {
  const words = (wordsData && wordsData.words) || [];
  const learned = {}, reviewed = {};
  if (kind === "all") {
    words.forEach((w) => { learned[w.word] = todayStr(); });
  } else {
    words.slice(0, 4).forEach((w) => { learned[w.word] = yesterdayStr(); });
    if (kind !== "yesterday") {
      words.slice(4, 7).forEach((w) => { learned[w.word] = todayStr(); });
      reviewed[words[0].word] = todayStr();
    }
  }
  try {
    localStorage.setItem(KEY_LEARNED, JSON.stringify(learned));
    localStorage.setItem(KEY_REVIEWED, JSON.stringify(reviewed));
  } catch (e) { /* 存储不可用时忽略 */ }
  // 清掉地址里的 ?demo=，但保留其它预览参数（?tab= / ?status= / ?state=）与当前视图 hash
  const rest = new URLSearchParams(location.search);
  rest.delete("demo");
  const restStr = rest.toString();
  history.replaceState(null, "", location.pathname + (restStr ? "?" + restStr : "") + location.hash);
  wantSeed = null;
  renderAll();
}

// ===== 事件绑定 =====
// L1 导航：委托绑定一次（重建节点也不用重绑）；方向键在标签间移动焦点（可访问的导航）
$("view-tabs").addEventListener("click", function (e) {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  goView(tab.dataset.view);
});
$("view-tabs").addEventListener("keydown", function (e) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (keys.indexOf(e.key) === -1) return;
  const tabs = Array.prototype.slice.call(document.querySelectorAll("#view-tabs .tab"));
  const idx = tabs.indexOf(document.activeElement);
  if (idx === -1) return;
  e.preventDefault();
  let next = idx;
  if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
  if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
  if (e.key === "Home") next = 0;
  if (e.key === "End") next = tabs.length - 1;
  tabs[next].focus();
  goView(tabs[next].dataset.view);
});
$("btn-back").addEventListener("click", goBack);
window.addEventListener("hashchange", onHashChange);

// 状态筛选：chips 委托绑定一次（重建节点也不用重绑）；清除按钮走「恢复规则」
$("status-chips").addEventListener("click", function (e) {
  const chip = e.target.closest(".status-chip");
  if (!chip) return;
  setStatusFilter(chip.dataset.status || "all");
});
$("status-clear").addEventListener("click", clearStatusFilter);

// ===== 启动（Day 13：视图由 hash 决定，地址栏 = 唯一事实来源）=====
const startQuery = new URLSearchParams(location.search);
const demoParam = startQuery.get("demo");
wantSeed = (demoParam === "seed" || demoParam === "yesterday" || demoParam === "all") ? demoParam : null;

// 首屏视图：hash 优先；没带 hash 时兼容 ?view=records / ?tab=review（开发预览用）
const paramView = startQuery.get("view") || (startQuery.get("tab") === "review" ? "review" : null);
const firstView = location.hash
  ? viewFromHash()
  : (paramView && VIEWS[paramView] ? paramView : "learn");
viewStack = [firstView];
// 首屏没带 hash 就补上，保证任何时候地址栏都能看出当前是哪个视图
if (!location.hash) {
  history.replaceState(null, "", location.pathname + location.search + VIEWS[firstView].hash);
}
showView(firstView);
syncBackButton();

// 预览开关：?status=pending|today|earlier|todo|done 直接进入该筛选（与 ?state= / ?demo= 同类）
const startStatus = startQuery.get("status");
if (startStatus && (STATUS_OPTIONS[mode] || []).some((o) => o.value === startStatus)) {
  statusFilter = startStatus;
  syncStatusFilterUI();
  renderContent();
}
loadData();
