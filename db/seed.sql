-- ============================================================================
-- 六级单词复习 · 种子数据（seed.sql）
-- ----------------------------------------------------------------------------
-- 目标库 ：CloudBase PostgreSQL 17 / 环境 acknowledge-d9gnqrpy89f1f7d21
-- 执行方式：node scripts/db-apply.js db/seed.sql
--           （等价于 tcb db execute -e <envId> --sql "$(cat db/seed.sql)"）
-- 前置条件：先执行 db/schema.sql 建好三张表
-- ----------------------------------------------------------------------------
-- 【幂等性说明】重复执行不报错，而且结果完全一致：
--   · words         —— 用 INSERT ... ON CONFLICT (id) DO UPDATE（UPSERT）：词库是参考数据，
--                      有了就更新释义，没有就插入，不会出现第二份
--   · learn_records —— 先删掉本脚本上次插入的行（id 以 seed-lr- 开头），再重新插入
--   · review_records—— 同上（id 以 seed-rr- 开头）
--
--   为什么记录表要「先删再插」而不是 ON CONFLICT DO NOTHING：
--   日期是用 current_date 算出来的（见下），只 DO NOTHING 的话，第二天再跑一次日期就过期了，
--   「昨天学过的词」会查不到数据。先删自己插入的那批、再按今天重算日期，才能保证
--   每次执行后「今天/昨天」的数据都是新鲜的。删除只针对 id 带 seed- 前缀的行，
--   不会碰到任何真实业务数据。
-- ----------------------------------------------------------------------------
-- 【日期为什么用 current_date - N 而不是写死 2026-10-08】
--   页面有「昨天学过的词」「今天已复习」这类按天算的逻辑，写死日期的话过几天种子数据就失效了。
--   用相对日期，任何时候执行种子脚本，数据都落在「今天 / 昨天 / 前天……」上。
-- ----------------------------------------------------------------------------


-- ############################################################################
-- 1) 词库：12 个六级高频词（与 data/words.json 完全一致，方便两边对照）
-- ############################################################################
insert into words (id, word, phonetic, meaning, created_at) values
  ('w_abandon',     'abandon',     '/əˈbændən/',    'v. 放弃；抛弃',        now() - interval '4 days'),
  ('w_abundant',    'abundant',    '/əˈbʌndənt/',   'adj. 丰富的，充裕的',  now() - interval '4 days'),
  ('w_accommodate', 'accommodate', '/əˈkɒmədeɪt/',  'v. 容纳；使适应',      now() - interval '4 days'),
  ('w_acknowledge', 'acknowledge', '/əkˈnɒlɪdʒ/',   'v. 承认；答谢',        now() - interval '4 days'),
  ('w_adequate',    'adequate',    '/ˈædɪkwət/',    'adj. 足够的，适当的',  now() - interval '4 days'),
  ('w_alleviate',   'alleviate',   '/əˈliːvieɪt/',  'v. 减轻，缓解',        now() - interval '4 days'),
  ('w_ambiguous',   'ambiguous',   '/æmˈbɪɡjuəs/',  'adj. 模棱两可的，含糊的', now() - interval '4 days'),
  ('w_anticipate',  'anticipate',  '/ænˈtɪsɪpeɪt/', 'v. 预期，预料',        now() - interval '4 days'),
  ('w_arbitrary',   'arbitrary',   '/ˈɑːbɪtrəri/',  'adj. 任意的；武断的',  now() - interval '4 days'),
  ('w_assess',      'assess',      '/əˈses/',       'v. 评估，评定',        now() - interval '4 days'),
  ('w_compile',     'compile',     '/kəmˈpaɪl/',    'v. 编辑；汇编',        now() - interval '4 days'),
  ('w_deteriorate', 'deteriorate', '/dɪˈtɪəriəreɪt/', 'v. 恶化，变坏',      now() - interval '4 days')
on conflict (id) do update set
  word     = excluded.word,
  phonetic = excluded.phonetic,
  meaning  = excluded.meaning;
-- 注意：故意不更新 created_at —— 词库首次入库时间应保持不变


-- ############################################################################
-- 2) 学习记录：清掉上次的种子行，再按相对日期重新插入（共 10 行）
--    故事线：4 天前学 2 个 → 3 天前学 2 个 → 昨天学 4 个 → 今天学 2 个
--    剩余 2 个词（ambiguous / deteriorate）故意没学，方便「新单词学习」页还有卡可学
-- ############################################################################
delete from review_records where id like 'seed-rr-%';   -- 先删复习（被学习记录间接依赖的顺序更稳）
delete from learn_records  where id like 'seed-lr-%';

insert into learn_records (id, word, learned_date, created_at) values
  -- 4 天前
  ('seed-lr-d4-arbitrary',   'arbitrary',   current_date - 4, now() - interval '4 days'),
  ('seed-lr-d4-assess',      'assess',      current_date - 4, now() - interval '4 days'),
  -- 3 天前
  ('seed-lr-d3-compile',     'compile',     current_date - 3, now() - interval '3 days'),
  ('seed-lr-d3-anticipate',  'anticipate',  current_date - 3, now() - interval '3 days'),
  -- 昨天（4 个：对应页面「昨日单词复习」的词卡来源）
  ('seed-lr-d1-abandon',     'abandon',     current_date - 1, now() - interval '1 day'),
  ('seed-lr-d1-abundant',    'abundant',    current_date - 1, now() - interval '1 day'),
  ('seed-lr-d1-accommodate', 'accommodate', current_date - 1, now() - interval '1 day'),
  ('seed-lr-d1-acknowledge', 'acknowledge', current_date - 1, now() - interval '1 day'),
  -- 今天
  ('seed-lr-d0-adequate',    'adequate',    current_date,     now() - interval '2 hours'),
  ('seed-lr-d0-alleviate',   'alleviate',   current_date,     now() - interval '2 hours');


-- ############################################################################
-- 3) 复习记录：清掉上次的种子行，再重新插入（共 7 行）
--    复习只发生在「学过之后的某一天」——所以下面每个词的复习日期都晚于它的学习日期
-- ############################################################################
insert into review_records (id, word, reviewed_date, created_at) values
  -- 3 天前复习：4 天前学的 arbitrary
  ('seed-rr-d3-arbitrary',   'arbitrary',   current_date - 3, now() - interval '3 days'),
  -- 2 天前复习 3 个
  ('seed-rr-d2-assess',      'assess',      current_date - 2, now() - interval '2 days'),
  ('seed-rr-d2-compile',     'compile',     current_date - 2, now() - interval '2 days'),
  ('seed-rr-d2-anticipate',  'anticipate',  current_date - 2, now() - interval '2 days'),
  -- 今天复习 3 个（复习的是昨天学的那批）→ 侧栏「今天已复习」= 3
  ('seed-rr-d0-abandon',     'abandon',     current_date,     now() - interval '1 hour'),
  ('seed-rr-d0-abundant',    'abundant',    current_date,     now() - interval '1 hour'),
  ('seed-rr-d0-accommodate', 'accommodate', current_date,     now() - interval '1 hour');


-- ============================================================================
-- 执行后自检（跑完可以手工执行 db/verify.sql 看结果）
-- 预期：words 12 行｜learn_records 10 行｜review_records 7 行
--   今天已学 2｜昨天学过 4｜今天已复习 3｜未学（还没学过的词）2
-- ============================================================================
