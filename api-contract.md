# api-contract.md —— 接口契约（六级单词复习）

> 本文件是前后端之间的「约定书」，也是**第 3 周建表与写接口的唯一依据**。
> 今天只落地 **1 个真实接口**（`GET /cet6/api/health`）；其余业务接口**只登记形状、不实现**。
> 接口从第 2 周页面（`index.html` / `app.js` / `data/words.json` / PRD 第 6 章）的实际数据需求推导而来。

---

## 1. 通用约定

### 1.1 基础地址

| 用途 | 地址 |
| --- | --- |
| 接口基础地址（Base URL） | `https://acknowledge-d9gnqrpy89f1f7d21.service.tcloudbase.com/cet6` |
| 前端页面地址 | `https://acknowledge-d9gnqrpy89f1f7d21-1493626656.tcloudbaseapp.com/cet6/` |
| 环境 ID | `acknowledge-d9gnqrpy89f1f7d21`（上海 ap-shanghai，体验版，到期 2027-03-22） |

> ⚠️ **路径为什么都带 `/cet6` 前缀**：本环境是账号级的，与「今日热搜」(VibeCoding) **共用同一个免费环境**。
> 今日热搜已占用 `/api/health`（函数 `health`），所以本项目所有接口统一走 `/cet6/api/*`（函数 `cet6-health`），两者互不干扰。
>
> ⚠️ 前端页面与接口**不在同一个域名**（`…tcloudbaseapp.com` vs `…service.tcloudbase.com`），属于跨域。
> 前端 `fetch` 调接口前必须先配 CORS —— 今天**不处理**，按计划留到接接口那天。

### 1.2 统一响应约定

所有接口一律返回同一个扁平结构，前端写一套判断即可：

**成功**

```json
{ "ok": true, "...": "该接口自己的业务字段" }
```

**失败**

```json
{ "ok": false, "error": { "code": "INVALID_PARAM", "message": "word 不能为空" } }
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ok` | boolean | 是 | 唯一判据：`true` = 成功，`false` = 失败 |
| `error` | object | 失败时必填 | 失败时的错误体，成功时不出现 |
| `error.code` | string | 是 | 机器可读的错误码（见 1.4） |
| `error.message` | string | 是 | 给人看的一句话说明 |

> 约定：成功时业务数据**直接挂在顶层**（如 `items` / `item` / `stats`），不再套 `data` 壳；
> 失败时只出现 `ok:false` + `error`。

### 1.3 通用规则

- **请求方法**：只读用 `GET`；新增用 `POST`。
- **请求/响应体**：`Content-Type: application/json; charset=utf-8`，UTF-8 编码。
- **时间格式**：日期字段用 `YYYY-MM-DD`（如 `2026-10-09`，"今天/昨天"按**用户本地时区**算）；
  其余时间戳用 **UTC ISO 8601**（如 `2026-10-09T04:12:38.154Z`）。
- **本期无登录**：不传任何用户标识，记录也不分用户（PRD 3.2 明确推迟账号体系）。
  将来加云端同步时再引入 `user_id`，届时本文件先改、后动代码。
- **不做分页**：当前词库仅 12 词，等换正式词库（≥ 300 词）再定分页参数。

### 1.4 错误码与 HTTP 状态码

| `error.code` | HTTP | 含义 | 前端建议处理 |
| --- | --- | --- | --- |
| —（`ok:true`） | 200 / 201 | 成功 | 正常渲染 / 更新进度 |
| `INVALID_PARAM` | 400 | 参数不合法（如 word 缺失） | 提示用户，不写记录 |
| `NOT_FOUND` | 404 | 资源不存在（如 word 不在词库中） | 提示「词库里没有这个词」 |
| `UPSTREAM_FAILED` | 502 | 上游/数据库获取失败 | 显示「错误」状态 + 「重新加载」按钮，顶部与标签仍在 |
| `INTERNAL_ERROR` | 500 | 服务内部错误 | 同上 |

> 说明：错误用**真实 HTTP 状态码**配合 `ok:false`。网关层非业务错误格式不同（没有 `ok` 字段）。

### 1.5 数据表（第 3 周建表依据）

页面当前把数据放在两处：词库 `data/words.json`（只读）、学习/复习记录存浏览器 localStorage
（键 `cet6_learned_v1` / `cet6_reviewed_v1`，结构均为 `{ "单词": "YYYY-MM-DD" }`，见 PRD 6.2）。
接后端后，**三张表**一一对应。

> **本节与数据库的一致性**
> 下面每张表的「数据库列类型 / 约束」就是 `db/schema.sql` 里**实际建出来**的结构，
> 已在环境 `acknowledge-d9gnqrpy89f1f7d21` 的 CloudBase PostgreSQL 17 上建成，
> 并用 `db/verify.sql` select 验证过（表数据 + `information_schema` 里的约束）。
> **改表结构 = 先改本节，再改 `db/schema.sql`，两边同步；不允许文档一套、库里另一套。**

#### 表 1 `words` —— 词库（只读，由导入维护）

| 字段 | 数据库列类型 | 约束 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `text` | **PK** | 是 | 主键，约定 `w_<单词>`，如 `w_abandon` |
| `word` | `text` | **UNIQUE** + NOT NULL | 是 | 单词（全库唯一），另两张表的外键目标 |
| `phonetic` | `text` | 可为 NULL | 否 | 音标，如 `/əˈbændən/` |
| `meaning` | `text` | NOT NULL | 是 | 中文释义（含词性），如 `v. 放弃；抛弃` |
| `created_at` | `timestamptz` | NOT NULL，default `now()` | 是 | 入库时间 |

#### 表 2 `learn_records` —— 学习记录（对应 localStorage `cet6_learned_v1`）

| 字段 | 数据库列类型 | 约束 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `text` | **PK** | 是 | 主键，如 `lr_01` |
| `word` | `text` | **FK → `words.word`**（ON UPDATE CASCADE / ON DELETE CASCADE）+ NOT NULL | 是 | 单词 |
| `learned_date` | `date` | NOT NULL | 是 | 标记「学会了」的当天日期 |
| `created_at` | `timestamptz` | NOT NULL，default `now()` | 是 | 入库时间 |
| — | — | **UNIQUE (`word`, `learned_date`)** | — | 同一天同一个词只能有一条 |

#### 表 3 `review_records` —— 复习记录（对应 localStorage `cet6_reviewed_v1`）

| 字段 | 数据库列类型 | 约束 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | `text` | **PK** | 是 | 主键，如 `rr_01` |
| `word` | `text` | **FK → `words.word`**（ON UPDATE CASCADE / ON DELETE CASCADE）+ NOT NULL | 是 | 单词 |
| `reviewed_date` | `date` | NOT NULL | 是 | 标记「想起来了」的当天日期 |
| `created_at` | `timestamptz` | NOT NULL，default `now()` | 是 | 入库时间 |
| — | — | **UNIQUE (`word`, `reviewed_date`)** | — | 同一天同一个词只能有一条 |

#### 约束与索引一览（与 `db/schema.sql` 一一对应）

| 名称 | 类型 | 定义 | 为什么 |
| --- | --- | --- | --- |
| `words_pkey` | 主键 | `words(id)` | |
| `words_word_key` | 唯一 | `words(word)` | 它是两张记录表的外键目标，必须唯一，否则关联有歧义 |
| `learn_records_pkey` / `review_records_pkey` | 主键 | `(id)` | |
| `learn_records_word_learned_date_key` | 唯一 | `(word, learned_date)` | 同一天同一个词不重复计进度（PRD F2 / 异常表） |
| `review_records_word_reviewed_date_key` | 唯一 | `(word, reviewed_date)` | 同上 |
| `learn_records_word_fkey` / `review_records_word_fkey` | 外键 | `word → words(word)` `on delete cascade` | 挡住「给词库里不存在的词记进度」 |
| `idx_learn_records_learned_date` | 索引 | `(learned_date desc)` | 学习记录视图按日期倒序分组 |
| `idx_review_records_reviewed_date` | 索引 | `(reviewed_date desc)` | 「今天已复习」按日期筛 |

> 说明：`unique (word, learned_date)` 自带的复合索引已能支撑「按 word 查」与外键校验，
> 所以**不再**单独给 `word` 建索引 —— 不提前造用不到的索引。

#### 命名约定：数据库列名 ↔ 接口字段名

接口 JSON 的字段名**与数据库列名保持一致（统一 `snake_case`）**：
`learned_date` / `reviewed_date` / `created_at` 就是库里那几列，不额外改写成驼峰。
时间字段库内存 `date` / `timestamptz`，出接口时按 1.3 的格式转成字符串
（日期 `YYYY-MM-DD`，时间戳 UTC ISO 8601）。

> 例外：`GET /cet6/api/stats` 里的 `todayLearned` 等是**算出来的聚合数字，不落任何列**，
> 属于展示字段，保持驼峰读起来更顺，不算「与数据库不一致」。

---

## 2. `GET /cet6/api/health` —— 健康检查（✅ 已实现）

**用途**：探活。前端启动时先打一次，判断「后端通不通」；运维也可拿它做监控。不碰数据库、不含业务逻辑。

### 2.1 请求

| 项 | 值 |
| --- | --- |
| 方法 | `GET` |
| 路径 | `/cet6/api/health` |
| 请求参数 | 无 |

完整地址：`https://acknowledge-d9gnqrpy89f1f7d21.service.tcloudbase.com/cet6/api/health`

### 2.2 响应字段（HTTP 200）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `ok` | boolean | 固定 `true`，表示服务正常 |
| `service` | string | 服务标识，固定 `"cet6-vocab"` |

### 2.3 成功示例

```bash
curl https://acknowledge-d9gnqrpy89f1f7d21.service.tcloudbase.com/cet6/api/health
```

响应（HTTP 200，2026-10-09 实测）：

```json
{ "ok": true, "service": "cet6-vocab" }
```

### 2.4 实现位置

| 项 | 值 |
| --- | --- |
| 代码 | `cloudfunctions/cet6-health/index.js` |
| 函数名 | `cet6-health`（**事件型**云函数，集成响应格式） |
| 部署 | `tcb fn deploy cet6-health -e <envId> --path /cet6/api/health --runtime Nodejs18.15 --force` |
| 注意 | **不要加 `--httpFn`**（Web 函数的访问路径会报 `400 FUNCTIONS_PARAM_INVALID`） |

---

## 3. 业务接口（占位 · 未实现）

> 以下**均未实现**，只先把形状定下来。接口按第 2 周页面的实际需求推导：
> 「新单词学习」要读词库、写学习记录；「昨日单词复习」要读学习记录、写复习记录；
> 「学习记录」视图要按日期分组读记录；侧栏/顶栏要一组统计数字。

### 3.1 `GET /cet6/api/words` —— 词库列表

对应页面：区块②「新单词学习」的词卡来源（现读本地 `data/words.json`）。

| 项 | 值 |
| --- | --- |
| 方法 | `GET` |
| 路径 | `/cet6/api/words` |
| 请求参数 | 无（本期不分页） |

**响应（HTTP 200）**

```json
{
  "ok": true,
  "items": [
    { "id": "w_abandon", "word": "abandon", "phonetic": "/əˈbændən/", "meaning": "v. 放弃；抛弃" }
  ],
  "updatedAt": "2026-10-09T00:00:00.000Z"
}
```

**错误**：`502 UPSTREAM_FAILED`｜`500 INTERNAL_ERROR`

### 3.2 `GET /cet6/api/learn-records` —— 学习记录读取（列表读取接口）

对应页面：「学习记录」视图（按日期分组）、「昨日单词复习」取昨天学过的词、侧栏统计。

| 项 | 值 |
| --- | --- |
| 方法 | `GET` |
| 路径 | `/cet6/api/learn-records` |
| 请求参数 | `date`（可选，`YYYY-MM-DD`；传了只返回当天记录，不传返回全部供按日期分组）、`word`（可选，查单个词） |

**响应（HTTP 200）**

```json
{
  "ok": true,
  "items": [
    { "id": "lr_01", "word": "abandon", "learned_date": "2026-10-08", "created_at": "2026-10-08T06:20:00.000Z" }
  ],
  "total": 1
}
```

**错误**：`400 INVALID_PARAM`（date 格式非法）｜`500 INTERNAL_ERROR`

### 3.3 `POST /cet6/api/learn-records` —— 新增学习记录

对应页面：「新单词学习」点「学会了」。

| 项 | 值 |
| --- | --- |
| 方法 | `POST` |
| 路径 | `/cet6/api/learn-records` |
| 请求参数（JSON body） | `word`（**必填**，须存在于 `words`）；`learned_date`（可选，默认服务端按用户时区取今天） |

**响应（HTTP 201）**

```json
{ "ok": true, "item": { "id": "lr_02", "word": "abandon", "learned_date": "2026-10-09", "createdAt": "2026-10-09T04:30:00.000Z" } }
```

**幂等约定**：同一天重复标记同一个词，**不报错、不重复计进度**，返回 `HTTP 200` + 已存在的那条记录。

**错误**：`400 INVALID_PARAM`（word 缺失）｜`404 NOT_FOUND`（word 不在词库）｜`500 INTERNAL_ERROR`

### 3.4 `GET /cet6/api/review-records` —— 复习记录读取

对应页面：「昨日单词复习」判断哪些词今天已复习过、侧栏「今天已复习」。

| 项 | 值 |
| --- | --- |
| 方法 | `GET` |
| 路径 | `/cet6/api/review-records` |
| 请求参数 | `date`（可选，`YYYY-MM-DD`）、`word`（可选） |

**响应（HTTP 200）**

```json
{
  "ok": true,
  "items": [
    { "id": "rr_01", "word": "abundant", "reviewed_date": "2026-10-09", "created_at": "2026-10-09T04:35:00.000Z" }
  ],
  "total": 1
}
```

**错误**：`400 INVALID_PARAM`｜`500 INTERNAL_ERROR`

### 3.5 `POST /cet6/api/review-records` —— 新增复习记录

对应页面：「昨日单词复习」点「想起来了」。

| 项 | 值 |
| --- | --- |
| 方法 | `POST` |
| 路径 | `/cet6/api/review-records` |
| 请求参数（JSON body） | `word`（**必填**）；`reviewed_date`（可选，默认今天） |

**响应（HTTP 201）**

```json
{ "ok": true, "item": { "id": "rr_02", "word": "abundant", "reviewed_date": "2026-10-09", "createdAt": "2026-10-09T04:36:00.000Z" } }
```

**幂等约定**：同一天重复复习同一个词，返回 `HTTP 200` + 已存在记录，不重复计数。

**错误**：`400 INVALID_PARAM`｜`404 NOT_FOUND`｜`500 INTERNAL_ERROR`

### 3.6 `GET /cet6/api/stats` —— 概览统计

对应页面：区块① 顶栏进度（今天已学 X / 共 N）与区块③ 侧栏四项数字。

| 项 | 值 |
| --- | --- |
| 方法 | `GET` |
| 路径 | `/cet6/api/stats` |
| 请求参数 | 无 |

**响应（HTTP 200）**

```json
{
  "ok": true,
  "stats": {
    "todayLearned": 3,
    "yesterdayLearned": 4,
    "todayReviewed": 1,
    "totalLearned": 7,
    "totalWords": 12
  }
}
```

| 字段 | 对应页面 |
| --- | --- |
| `todayLearned` | 顶栏「今天已学」分子 + 侧栏「今天已学」 |
| `yesterdayLearned` | 侧栏「昨天学过的词」= 「昨日复习」标签角标 |
| `todayReviewed` | 侧栏「今天已复习」 |
| `totalLearned` | 侧栏「累计已学」 |
| `totalWords` | 顶栏「今天已学 X / **N**」的分母 |

**错误**：`500 INTERNAL_ERROR`

> 备注：这几个数字也能由前端「词库 + 记录」自行算出；提供 `stats` 接口是为了少请求几次。第 3 周可按实现成本决定做或不做。

---

## 4. 接口总览

| 方法 | 路径 | 用途 | 状态 |
| --- | --- | --- | --- |
| GET | `/cet6/api/health` | 健康检查 | ✅ 已实现 |
| GET | `/cet6/api/words` | 词库列表 | 占位 |
| GET | `/cet6/api/learn-records` | 学习记录读取（列表读取） | 占位 |
| POST | `/cet6/api/learn-records` | 新增学习记录（学会了） | 占位 |
| GET | `/cet6/api/review-records` | 复习记录读取 | 占位 |
| POST | `/cet6/api/review-records` | 新增复习记录（想起来了） | 占位 |
| GET | `/cet6/api/stats` | 概览统计 | 占位（可选） |

### 页面元素 → 接口映射

| 页面元素 | 用到的接口 |
| --- | --- |
| 区块① 顶栏进度「今天已学 X / N」 | `GET /cet6/api/stats`（或 words + learn-records 自算） |
| 区块② 新单词学习（词卡列表） | `GET /cet6/api/words` |
| 区块② 点「学会了」 | `POST /cet6/api/learn-records` |
| 区块② 昨日单词复习（取昨天学过的词） | `GET /cet6/api/learn-records?date=<昨天>` |
| 区块② 点「想起来了」 | `POST /cet6/api/review-records` |
| 区块② 学习记录视图（按日期分组） | `GET /cet6/api/learn-records` + `GET /cet6/api/review-records` |
| 区块③ 侧栏四项统计 | `GET /cet6/api/stats` |

---

## 5. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-10-09 | 首版：登记 3 张表（`words` / `learn_records` / `review_records`）与 7 个接口（1 实现 + 6 占位）；因与环境内其它项目共用环境，路径统一加 `/cet6` 前缀 |
| 2026-10-09（Day 16） | 三张表在 CloudBase PostgreSQL 建成（`db/schema.sql`），种子与 select 验证入库；外键与唯一约束实测生效；接口仍未实现，形状不变 |
| 2026-10-09（Day 17） | **表结构回写**：1.5 节按 `db/schema.sql` 实际 DDL 逐列重写（补上真实列类型 `text`/`date`/`timestamptz`、主键/外键/唯一约束、索引一览），并新增「数据库列名 ↔ 接口字段名」命名约定；接口示例里的 `createdAt` 统一改为 `created_at`，与库列名一致；`db/verify.sql` 增加「约束一览」面板用于对账 |
