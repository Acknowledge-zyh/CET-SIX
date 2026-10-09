# 六级单词复习

一个帮助备考大学英语六级（CET-6）的单词复习网站。

- 目标用户：备考六级的学生
- 核心场景：利用碎片时间快速过单词、标记生词、按计划复习

## 状态

主视图已完成（2026-09-23）；三视图 + hash 路由（Day 13，2026-10-08）。
需求见 `PRD.md`（本 PRD 即本页的开发依据）。

## 本地运行

1. 在项目文件夹打开终端，执行：`python -m http.server 8001`
2. 浏览器打开 http://localhost:8001

## 文件

| 文件 | 作用 |
|------|------|
| `PRD.md` | 产品需求文档（做什么、验收标准） |
| `index.html` | 主视图：区块① 顶栏进度 / 区块② 学习区（三视图）/ 区块③ 统计侧栏 |
| `styles.css` | 样式：桌面左右并排、手机纵向堆叠 |
| `app.js` | 逻辑：hash 路由、请求词库、渲染词卡与记录、四种状态、学习与复习记录 |
| `data/words.json` | 词库（12 个六级高频词，换正式词库保持同结构即可） |

## 功能（v1）

- **三个独立视图（Day 13，hash 路由）**：`#/learn` 新单词学习 / `#/review` 昨日单词复习 / `#/records` 学习记录（按日期分组的学习痕迹 + 概览数字）。刷新、直接分享链接都停在同一视图；浏览器前进/后退 = 视图间切换
- **面包屑 + 返回上一页（Day 13 余力）**：视图导航下方显示当前位置；「← 返回」交给浏览器历史；键盘左右方向键可在三个标签间移动焦点（roving tabindex）
- **三级切换**：L1 主视图导航 → L2 视图内状态筛选 → L3 卡片内展开释义
- **新单词学习**：词卡显示单词、音标、释义；点「学会了」记入本机并更新进度
- **昨日单词复习**：只显示昨天学过的词，**释义默认隐藏**，先自己回想再点「想起来了」对答案
- **学习记录**：按日期倒序展示每天学了哪些词、当天复习了几个；没有任何记录时给出路
- **状态筛选**（2026-10-08 新增）：按学习状态缩小词卡列表——新词页「全部 / 未学 / 今天已学 / 之前已学」，复习页「全部 / 还未复习 / 今天已复习」；无结果显示「没有符合这个状态的单词」并给出路；「清除筛选」或切视图恢复完整列表
- **进度统计**：顶栏进度条 + 侧栏四项数字（今天已学 / 昨天学过的词 / 今天已复习 / 累计已学）
- **四种页面状态**：加载中（骨架屏）／成功／空（学完了、昨天没记录、还没有记录——随视图不同）／错误（带重新加载按钮）
- 记录保存在本机浏览器（键 `cet6_learned_v1`、`cet6_reviewed_v1`），换浏览器/换电脑不共享，不需要登录

## 视图路由（Day 13）

地址栏的 `#/视图名` 就是当前视图，是唯一事实来源：

| 地址 | 视图 |
|------|------|
| `#/learn`（默认） | 新单词学习 |
| `#/review` | 昨日单词复习 |
| `#/records` | 学习记录 |

选 hash 路由而不是路由库：纯静态托管不需要服务端配合、刷新/分享链接不丢视图、浏览器前进后退天然可用、零依赖——够用就好。

## 开发调试开关（地址后加参数）

| 参数 | 作用 |
|------|------|
| `#/learn` `#/review` `#/records` | 直接进入某个视图（hash 路由） |
| `?state=loading` | 强制显示加载中 |
| `?state=empty` | 强制显示空状态（空态文案随当前视图变化） |
| `?state=error` | 强制显示错误状态（重试按钮会自动清参回到正常，并保留当前视图） |
| `?demo=seed` | 造一批演示记录（昨天学 4 个、今天学 3 个、今天复习 1 个），方便看复习视图 |
| `?demo=yesterday` | 只造"昨天学 4 个、今天还没学"，用于预览筛选的空结果态 |
| `?demo=all` | 全部词标成今天已学，用于预览「今天的新词都学完啦」真实空态 |
| `?view=records`（或旧参数 `?tab=review`） | 无 hash 时直接进入某视图 |
| `?status=pending\|today\|earlier\|todo\|done` | 直接应用某个状态筛选（与 ?view= 组合使用） |

## 部署到 CloudBase（公网）

> 本环境与「今日热搜」(VibeCoding) **共用同一个免费 CloudBase 环境**（账号只有一个），
> 所以本项目的**函数名、访问路径、托管目录都带 `cet6` 前缀**，与该项目互不干扰。

| 用途 | 公网地址 |
| --- | --- |
| 前端页面 | `https://acknowledge-d9gnqrpy89f1f7d21-1493626656.tcloudbaseapp.com/cet6/` |
| 健康检查接口 | `https://acknowledge-d9gnqrpy89f1f7d21.service.tcloudbase.com/cet6/api/health` |

### A. 云函数 `/cet6/api/health` —— 从创建到公网访问

1. **写代码**：`cloudfunctions/cet6-health/index.js`（**事件型**云函数 `exports.main`，返回 `{ ok, service }`）
2. **登录 CLI**（首次，本机已登录、凭据在 `~/.cloudbase/auth.json`）：`tcb login`
3. **部署 + 开通 HTTP 访问路径**（一条命令完成）：
   ```
   tcb fn deploy cet6-health -e acknowledge-d9gnqrpy89f1f7d21 --path /cet6/api/health --runtime Nodejs18.15 --force
   ```
4. **验证**：见 C。

### B. 前端 —— 从构建到公网访问

> 本项目是**纯静态**原生页面（不是 React），「构建」= 把静态文件同步进 `dist/`。

1. **同步静态文件**：`node scripts/sync-dist.js`（把 `index.html / styles.css / app.js / data/` 复制进 `dist/`）
2. **部署到 `/cet6/` 子路径**（**不要用 `--prune`**，否则会误删同环境其它项目的文件）：
   ```
   tcb hosting deploy dist /cet6/ -e acknowledge-d9gnqrpy89f1f7d21
   ```
3. **验证**：见 C。

### C. 部署后怎么验证

**云函数**：浏览器打开 `…/cet6/api/health` → 应看到**一段 JSON**（不是网页）：

```json
{ "ok": true, "service": "cet6-vocab" }
```

命令行等价验证：`curl https://…service.tcloudbase.com/cet6/api/health`

**前端**：浏览器打开 `…/cet6/` → 应看到「📘 六级单词复习」页面
（顶栏进度条 + 三个标签〔新单词学习／昨日单词复习／学习记录〕+ 词卡列表 + 右侧统计）；
再开 `…/cet6/#/records` 应直达「学习记录」视图。

### D. 每次改完代码的固定流程

```
node scripts/sync-dist.js                        # ① 同步进 dist/
git add ... && git commit ...                    # ② 提交
git push                                         # ③ 推送
tcb hosting deploy dist /cet6/ -e acknowledge-d9gnqrpy89f1f7d21   # ④ 部署前端
# 改了云函数再补一步：
tcb fn deploy cet6-health -e acknowledge-d9gnqrpy89f1f7d21 --path /cet6/api/health   # ⑤
```

> **接口还没接**：页面目前仍读本地 `data/words.json`、记录存本机 localStorage（`cet6_learned_v1` / `cet6_reviewed_v1`），
> **没有**调用任何接口；跨域（CORS）也**尚未配置**。

### E. 实测踩过的坑（别再踩）

1. `/cet6/api/health` 必须用**事件型云函数** + `--path`（**不要**加 `--httpFn`）；
   `--httpFn` 是 Web 函数，它建的访问路径会报 `400 FUNCTIONS_PARAM_INVALID: FunctionType parameter is invalid`。
2. `tcb hosting deploy dist /cet6/ --verify` 会**误报**「一致性校验失败：missing=/cet6/…」，
   但 `tcb hosting list` 与实际访问 URL 都证明文件其实上传成功了 —— 以这两者为准（子路径部署的校验环节有此问题）。

### F. 接口契约

全部接口（1 实现 + 6 占位）与三张表（`words` / `learn_records` / `review_records`）设计见 **`api-contract.md`** ——
那是第 3 周建表与写接口的唯一依据。
