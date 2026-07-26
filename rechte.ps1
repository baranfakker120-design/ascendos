$db = docker ps --filter "name=supabase_db" --format "{{.Names}}" | Select-Object -First 1

$sql = @"
select 'authenticated USAGE auf public' as pruefung,
       has_schema_privilege('authenticated','public','USAGE')::text as wert
union all
select 'authenticated USAGE auf tests',
       case when exists(select 1 from pg_namespace where nspname='tests')
            then has_schema_privilege('authenticated','tests','USAGE')::text
            else 'Schema existiert nicht' end
union all
select 'SELECT auf daily_plans',
       has_table_privilege('authenticated','public.daily_plans','SELECT')::text
union all
select 'SELECT auf effective_pipeline_events',
       has_table_privilege('authenticated','public.effective_pipeline_events','SELECT')::text
union all
select 'SELECT auf pipeline_events',
       has_table_privilege('authenticated','public.pipeline_events','SELECT')::text
union all
select 'SELECT auf contacts',
       has_table_privilege('authenticated','public.contacts','SELECT')::text
union all
select 'Objekte in public OHNE SELECT fuer authenticated',
       (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','v')
          and not has_table_privilege('authenticated', c.oid, 'SELECT'))
union all
select 'Davon die ersten zehn',
       coalesce((select string_agg(c.relname, ', ' order by c.relname)
        from (select c2.relname, c2.oid from pg_class c2
              join pg_namespace n2 on n2.oid=c2.relnamespace
              where n2.nspname='public' and c2.relkind in ('r','v')
                and not has_table_privilege('authenticated', c2.oid, 'SELECT')
              limit 10) c), 'keine')
union all
select 'postgres ist Mitglied von authenticated',
       pg_has_role('postgres','authenticated','MEMBER')::text
union all
select 'postgres ist Superuser',
       (select rolsuper::text from pg_roles where rolname='postgres');
"@

$sql | Out-File -FilePath rechte.sql -Encoding utf8 -NoNewline
docker cp rechte.sql "${db}:/tmp/r.sql" | Out-Null
docker exec $db psql -U postgres -d postgres -f /tmp/r.sql