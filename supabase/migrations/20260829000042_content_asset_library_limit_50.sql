-- Raise personal content asset library default from 25 → 50.
-- No table/schema changes. Quota helpers + org settings only.
-- Manual carousel max (10) and Autopilot single-image rules are unchanged.

update public.organizations
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('content_asset_limit', 50)
where coalesce(nullif(settings->>'content_asset_limit', '')::integer, 25) = 25;

create or replace function public.content_asset_limit()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    1,
    least(
      500,
      coalesce(
        (
          select nullif(o.settings->>'content_asset_limit', '')::integer
          from public.organizations o
          where o.id = public.current_org_id()
        ),
        50
      )
    )
  );
$$;

revoke all on function public.content_asset_limit() from public;
grant execute on function public.content_asset_limit() to authenticated;
