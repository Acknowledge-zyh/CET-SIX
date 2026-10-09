-- ============================================================================
-- 六级单词复习 · 数据验证（verify.sql）
-- ----------------------------------------------------------------------------
-- 用途：「select 验证」——每张核心表都 select 出至少 5 行，核对业务口径，
--       并查一遍实际建出来的约束（主键 / 外键 / 唯一），与 api-contract.md 第 1.5 节逐条对账。
-- 执行：node scripts/db-snapshot.js
--       （逐条执行下面的语句，在终端打印结果，同时生成 打卡/db-snapshot.html 作为取证页）
--
-- 文件里的 `-- @panel <英文名> | <中文标题>` 是给脚本读的标记：
-- 它把文件切成几块，每块在取证页上是一个可切换的面板。
-- ============================================================================


-- @panel words | 表 1｜words —— 词库（只读字典）
select id, word, phonetic, meaning, created_at
from words
order by word;


-- @panel learn_records | 表 2｜learn_records —— 学习记录（学会了）
select id, word, learned_date, created_at
from learn_records
order by learned_date desc, word;


-- @panel review_records | 表 3｜review_records —— 复习记录（想起来了）
select id, word, reviewed_date, created_at
from review_records
order by reviewed_date desc, word;


-- @panel stats | 业务口径自检 —— 页面上那几个数字从哪来
select
  (select count(*) from words)                                              as "词库总数",
  (select count(*) from learn_records  where learned_date  = current_date)   as "今天已学",
  (select count(*) from learn_records  where learned_date  = current_date-1) as "昨天学过",
  (select count(*) from review_records where reviewed_date = current_date)   as "今天已复习",
  (select count(distinct word) from learn_records)                           as "累计已学",
  (select count(*) from words w where not exists
      (select 1 from learn_records lr where lr.word = w.word))               as "还没学过的词";


-- @panel constraints | 约束一览 —— 主键 / 外键 / 唯一（对应 schema.sql 实际建出来的东西）
select tc.table_name      as "表",
       tc.constraint_type as "约束类型",
       tc.constraint_name as "约束名",
       kcu.column_name    as "涉及列",
       kcu.ordinal_position as "列序号"
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name   = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name in ('words', 'learn_records', 'review_records')
order by tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;


-- @panel schema | 三张表的结构（字段名 / 类型 / 是否可空）
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('words', 'learn_records', 'review_records')
order by table_name, ordinal_position;
