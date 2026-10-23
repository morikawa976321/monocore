-- ローカル Supabase の /finance 用ダミーデータ(本人の実データではない架空の値)。
-- 開発ユーザー dev@localhost(src/lib/auth/dev-bypass.ts が初回の npm run dev で作る)の finance 2表を全部入れ替える。
-- 使い方:  docker exec -i supabase_db_monocore psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/finance-dummy.sql
-- 本番(--linked)には流さないこと。
begin;

do $$
declare
    uid uuid;
    m date;
    cash bigint := 600000;
    nisa bigint := 300000;
begin
    select id into uid from auth.users where email = 'dev@localhost';
    if uid is null then
        raise exception 'dev@localhost がいない。先に npm run dev で /finance を一度開く';
    end if;

    delete from public.finance_events where user_id = uid;
    delete from public.finance_measurements where user_id = uid;

    -- 実測: 2025-01 〜 2026-09 の 21 か月。Cash は毎月 +20,000 前後、NISA は毎月 +25,000 前後で機械的に増やす
    m := date '2025-01-01';
    while m <= date '2026-09-01' loop
        insert into public.finance_measurements (user_id, month, cash, nisa) values (uid, m, cash, nisa);
        cash := cash + 20000 + (extract(month from m)::int % 3) * 7000 - (case when extract(month from m)::int in (4, 10) then 150000 else 0 end);
        nisa := nisa + 25000 + (extract(month from m)::int % 4) * 3000;
        m := m + interval '1 month';
    end loop;

    -- 計画: 実物とは構成も額も無関係な架空の家計(給与・家賃・ローン・旅行・買い替えなど)
    insert into public.finance_events (user_id, name, start_month, end_month, cash_delta, nisa_delta, memo) values
        (uid, '給与',           date '2025-01-01', date '2030-12-01',  250000, 0,     'ダミー'),
        (uid, '家賃',           date '2025-01-01', date '2030-12-01',  -80000, 0,     'ダミー'),
        (uid, '食費・光熱費',   date '2025-01-01', date '2030-12-01',  -60000, 0,     'ダミー'),
        (uid, '通信',           date '2025-01-01', date '2030-12-01',   -8000, 0,     'ダミー'),
        (uid, 'ローン',         date '2026-01-01', date '2031-12-01',  -20000, 0,     'ダミー'),
        (uid, '積立',           date '2025-01-01', date '2042-03-01',  -30000, 30000, 'ダミー。現金→積立の振替'),
        (uid, 'ボーナス',       date '2026-12-01', null,               300000, 0,     'ダミー'),
        (uid, '旅行',           date '2026-12-01', null,              -200000, 0,     'ダミー'),
        (uid, '家電の買い替え', date '2027-03-01', null,              -120000, 0,     'ダミー'),
        (uid, '車検',           date '2027-06-01', null,               -90000, 0,     'ダミー'),
        (uid, 'ボーナス',       date '2027-06-01', null,               300000, 0,     'ダミー'),
        (uid, '引越し',         date '2027-08-01', null,              -300000, 0,     'ダミー');
end $$;

commit;

select (select count(*) from public.finance_events) as events,
       (select count(*) from public.finance_measurements) as measurements,
       (select max(month) from public.finance_measurements) as latest;
