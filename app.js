/* 六级单词复习 v0 交互逻辑
 * 数据说明：v0 内置 8 个六级高频词作为样本；
 * 学习记录存浏览器 localStorage（键 cet6_learned_v1），
 * 结构：{ 单词: "2026-09-22" }，值为学会当天的日期。
 * 明天的 v1 会把词库抽到 data/words.json。
 */

// ===== 样本词库（v0）=====
const WORDS = [
  { word: "abandon",      phonetic: "/əˈbændən/",    meaning: "v. 放弃；抛弃" },
  { word: "abundant",     phonetic: "/əˈbʌndənt/",   meaning: "adj. 丰富的，充裕的" },
  { word: "accommodate",  phonetic: "/əˈkɒmədeɪt/",  meaning: "v. 容纳；使适应" },
  { word: "acknowledge",  phonetic: "/əkˈnɒlɪdʒ/",   meaning: "v. 承认；答谢" },
  { word: "adequate",     phonetic: "/ˈædɪkwət/",    meaning: "adj. 足够的，适当的" },
  { word: "anticipate",   phonetic: "/ænˈtɪsɪpeɪt/", meaning: "v. 预期，预料" },
  { word: "arbitrary",    phonetic: "/ˈɑːbɪtrəri/",  meaning: "adj. 任意的；武断的" },
  { word: "assess",       phonetic: "/əˈses/",       meaning: "v. 评估，评定" },
];

// ===== 本地存储 =====
const STORE_KEY = "cet6_learned_v1";

function loadLearned() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch (e) {
    return {}; // 存储不可用时按"没学过"处理
  }
}

function saveLearned(obj) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(obj));
    return true;
  } catch (e) {
    alert("浏览器本地存储不可用，学习记录无法保存");
    return false;
  }
}

// 今天 / 昨天的日期字符串（YYYY-MM-DD）
function todayStr()  { return new Date().toISOString().slice(0, 10); }
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ===== 渲染：新单词学习 =====
function renderNewWords() {
  const learned = loadLearned();
  const today = todayStr();
  const list = document.getElementById("new-word-list");
  list.innerHTML = "";

  WORDS.forEach((w) => {
    const li = document.createElement("li");
    li.className = "word-item";
    const learnedToday = learned[w.word] === today;
    li.innerHTML =
      '<span class="word">' + w.word + "</span>" +
      '<span class="phonetic">' + w.phonetic + "</span>" +
      '<div class="meaning">' + w.meaning + "</div>";

    if (learned[w.word]) {
      const tag = document.createElement("span");
      tag.className = "done-tag";
      tag.textContent = learnedToday ? "✓ 今天已学" : "✓ " + learned[w.word] + " 已学";
      li.appendChild(tag);
    } else {
      const btn = document.createElement("button");
      btn.className = "btn btn-learn";
      btn.textContent = "学会了";
      btn.addEventListener("click", function () {
        const rec = loadLearned();
        rec[w.word] = todayStr();
        if (saveLearned(rec)) renderAll();
      });
      li.appendChild(btn);
    }
    list.appendChild(li);
  });
}

// ===== 渲染：昨日复习 =====
function renderReview() {
  const learned = loadLearned();
  const yd = yesterdayStr();
  const list = document.getElementById("review-word-list");
  const emptyTip = document.getElementById("review-empty");
  list.innerHTML = "";

  const reviewWords = WORDS.filter((w) => learned[w.word] === yd);

  if (reviewWords.length === 0) {
    emptyTip.hidden = false;
    return;
  }
  emptyTip.hidden = true;

  reviewWords.forEach((w) => {
    const li = document.createElement("li");
    li.className = "word-item";
    li.innerHTML =
      '<span class="word">' + w.word + "</span>" +
      '<span class="phonetic">' + w.phonetic + "</span>" +
      '<div class="meaning" id="meaning-' + w.word + '" hidden>' + w.meaning + "</div>";

    // 先想，再点「想起来了」展开释义
    const btn = document.createElement("button");
    btn.className = "btn btn-review";
    btn.textContent = "想起来了（展开释义）";
    btn.addEventListener("click", function () {
      const m = document.getElementById("meaning-" + w.word);
      m.hidden = !m.hidden;
      btn.textContent = m.hidden ? "想起来了（展开释义）" : "收起释义";
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// ===== 渲染：底部统计 =====
function renderStats() {
  const learned = loadLearned();
  const yd = yesterdayStr();
  const learnedCount = Object.keys(learned).length;
  const reviewCount = WORDS.filter((w) => learned[w.word] === yd).length;
  document.getElementById("stats").textContent =
    "共 " + WORDS.length + " 词 · 已学 " + learnedCount + " · 待复习 " + reviewCount;
}

// ===== 标签页切换 =====
function setupTabs() {
  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.target).classList.add("active");
    });
  });
}

function renderAll() {
  renderNewWords();
  renderReview();
  renderStats();
}

setupTabs();
renderAll();
