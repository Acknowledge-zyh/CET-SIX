-- ============================================================================
-- 六级单词复习 · 数据库表结构（schema.sql）
-- ----------------------------------------------------------------------------
-- 目标库 ：CloudBase PostgreSQL 17
--          环境 acknowledge-d9gnqrpy89f1f7d21（上海 ap-shanghai，体验版）
-- 设计依据：api-contract.md 第 1.5 节「数据表（第 3 周建表依据）」
-- 执行方式：tcb db execute -e acknowledge-d9gnqrpy89f1f7d21 --sql "$(cat db/schema.sql)"
-- 幂等性 ：全部 IF NOT EXISTS —— 重复执行不报错、不丢已有数据
-- ----------------------------------------------------------------------------
-- 【今天要掌握的两个问题】
--
-- 1) 两张核心表分别存什么？
--    · learn_records  —— 学习记录：某个词「哪一天被标记为学会了」。
--                        对应页面「新单词学习」点「学会了」，也对应 localStorage 的 cet6_learned_v1
--    · review_records —— 复习记录：某个词「哪一天被标记为想起来了」。
--                        对应页面「昨日单词复习」点「想起来了」，也对应 localStorage 的 cet6_reviewed_v1
--    （另有 words 词库表：只读字典，给上面两张表提供单词与释义，本身不产生业务行为）
--
-- 2) 它们靠哪个字段关联？
--    · learn_records.word  → words.word
--    · review_records.word → words.word
--    两张记录表**互相之间不直接关联**，而是各自通过 word 这个业务唯一键挂到词库上。
--    选 word（而不是自增数字 id）做外键的理由：单词本身就是天然唯一的业务标识，
--    排查数据时看见 'abandon' 就知道是哪条，不需要再去 join 一次 words 表翻译 id。
--    写法：references words(word) —— 外键必须指向被引用表的唯一键（words.word 上是 UNIQUE）。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 表 1｜words —— 词库（只读）
-- ----------------------------------------------------------------------------
create table if not exists words (
  id         text        primary key,                       -- 主键，约定 w_<单词>
  word       text        not null unique,                   -- 单词，全库唯一，也是另两张表的外键目标
  phonetic   text,                                          -- 音标，允许为空
  meaning    text        not null,                           -- 中文释义（含词性）
  created_at timestamptz not null default now()              -- 入库时间
);

comment on table  words            is '词库（只读，由导入维护）：给学习/复习记录提供单词与释义';
comment on column words.id         is '主键。约定格式 w_<单词>，如 w_abandon —— 用可读字符串而不用自增数字，导数据时对得上';
comment on column words.word       is '单词本体，全库唯一（UNIQUE）。之所以唯一：它是「两张记录表关联到词库」的那根绳子，重复会导致关联歧义';
comment on column words.phonetic   is '国际音标，如 /əˈbændən/。可为空（部分词暂无音标），所以不加 not null';
comment on column words.meaning    is '中文释义（含词性），如 v. 放弃；抛弃。词卡上要展示的内容，必填';
comment on column words.created_at is '入库时间。timestamptz（带时区）而不是 text：数据库存时间点、时区信息不丢，接口层再转成 UTC ISO 8601 字符串给前端';


-- ----------------------------------------------------------------------------
-- 表 2｜learn_records —— 学习记录（学会了）
-- ----------------------------------------------------------------------------
create table if not exists learn_records (
  id           text        primary key,                     -- 主键，约定 lr_序号 或 seed-lr-<偏移>-<单词>
  word         text        not null
                           references words(word)           -- ← 关联字段：指向 words.word
                           on update cascade
                           on delete cascade,
  learned_date date        not null,                        -- 标记「学会了」的当天日期（只到天）
  created_at   timestamptz not null default now(),          -- 入库时间
  unique (word, learned_date)                               -- 同一天同一个词只能有一条
);

comment on table  learn_records              is '学习记录：某个词哪一天被标记为学会了。对应页面「新单词学习」的「学会了」按钮、localStorage 键 cet6_learned_v1';
comment on column learn_records.id           is '主键。用可读字符串（如 lr_01 / seed-lr-d1-abandon），便于人工核对种子数据来自哪里';
comment on column learn_records.word         is '关联字段：指向 words.word（外键）。删词库里的词会级联删除它的记录，不留指向不存在单词的孤儿行';
comment on column learn_records.learned_date is '学习日期，date 类型（只到天，不含时分秒）。用 date 而不是 text：日期能比较、能排序、能算「昨天」；接口层格式化为 YYYY-MM-DD';
comment on column learn_records.created_at   is '记录写入时间，timestamptz。与 learned_date 的区别：前者是「数据库里什么时候写的」，后者是「用户哪一天学的」';


-- ----------------------------------------------------------------------------
-- 表 3｜review_records —— 复习记录（想起来了）
-- ----------------------------------------------------------------------------
create table if not exists review_records (
  id            text        primary key,                    -- 主键，约定 rr_序号 或 seed-rr-<偏移>-<单词>
  word          text        not null
                            references words(word)          -- ← 关联字段：指向 words.word
                            on update cascade
                            on delete cascade,
  reviewed_date date        not null,                       -- 标记「想起来了」的当天日期
  created_at    timestamptz not null default now(),         -- 入库时间
  unique (word, reviewed_date)                              -- 同一天同一个词只能有一条
);

comment on table  review_records               is '复习记录：某个词哪一天被标记为想起来了。对应页面「昨日单词复习」的「想起来了」按钮、localStorage 键 cet6_reviewed_v1';
comment on column review_records.id            is '主键。可读字符串，规则同 learn_records.id';
comment on column review_records.word          is '关联字段：指向 words.word（外键）。与 learn_records.word 指向同一张表，所以「这个词学过没/复习过没」都是围绕它查';
comment on column review_records.reviewed_date is '复习日期，date 类型。侧栏「今天已复习」= count(*) where reviewed_date = 今天';
comment on column review_records.created_at    is '记录写入时间，timestamptz';


-- ----------------------------------------------------------------------------
-- 索引 —— 只为「按日期查/排序」这类真实查询加，不提前造索引
-- ----------------------------------------------------------------------------
-- 学习记录视图要按日期倒序分组、「昨日复习」要按昨天筛 → 给 learned_date 建索引
create index if not exists idx_learn_records_learned_date
  on learn_records (learned_date desc);

-- 侧栏「今天已复习」、复习视图要按日期筛 → 给 reviewed_date 建索引
create index if not exists idx_review_records_reviewed_date
  on review_records (reviewed_date desc);

-- 说明：unique (word, learned_date) 自带一个以 word 打头的复合索引，
-- 已经能支撑「按单词查记录」和「外键校验」，所以不再单独给 word 建索引。


-- ============================================================================
-- 字段类型选型说明（余力加练：为什么这么选）
-- ----------------------------------------------------------------------------
-- | 字段 | 类型 | 为什么 |
-- | --- | --- | --- |
-- | *_records.id / words.id | text | 主键只需要「唯一」，不需要「有序递增」。用可读字符串（w_abandon / lr_01）在导数据、对日志、排查时能直接看懂；代价是比 bigint 占一点空间、插入不需要序列 |
-- | words.word | text | 单词是文本，长度不一，text 在 PostgreSQL 里与 varchar(n) 性能相同，但不设人为上限 |
-- | words.phonetic | text（可空） | 音标可能缺失，允许 NULL；NULL 表示「没有这个信息」，与空字符串 '' 语义不同 |
-- | words.meaning | text not null | 词卡没有释义就没有意义，必须填 |
-- | *_records.learned_date / reviewed_date | date | 业务只关心「哪一天」，用 date 而不是 timestamp：不会因为时分秒不同导致「同一天重复记录」判重失败；也直接支持 current_date 比较 |
-- | *_records.created_at | timestamptz | 记录写入时刻。用 timestamptz 而不是 timestamp：带时区，服务器换时区也不会把历史时间解释错 |
-- | unique (word, 日期) | 约束 | 把「同一天同一个词不重复计进度」这条业务规则交给数据库兜底，接口层写错也写不进重复数据 |
-- | references words(word) | 外键 | 保证记录一定属于词库里真实存在的词；数据库层面挡住「给不存在的词记进度」 |
-- ============================================================================
