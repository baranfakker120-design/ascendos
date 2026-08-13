-- ============================================================
-- Phase 6: Knowledge + AI Isolation (minimal security fixes)
--
-- WHY THIS MIGRATION (required — not optional refactor):
--
-- 1) coach_convos RLS USING checked only user_id = auth.uid().
--    A multi-org user with x-ascendos-org=A could still SELECT
--    conversations (and via join, messages) belonging to Org B.
--    Those messages would enter the coach AI prompt as history.
--
-- 2) coach_messages RLS inherited the same gap (convo.user_id only).
--
-- 3) match_knowledge allowed is_super_admin() to skip the
--    p_org_id = current_org_id() check. is_super_admin() is
--    org-scoped (active membership), so an Org-A super_admin could
--    pass p_org_id=B without raising. RLS still filtered rows, but
--    Phase 6 requires server-side org validation without relying on
--    a second layer alone. Also filter chunks by c.org_id.
--
-- NO schema column changes. Policies + function body only.
-- Production NOT applied by agent.
-- ============================================================

-- ---------- 1) coach_convos: org-scoped USING ----------
drop policy if exists coach_convos_own on public.coach_convos;
create policy coach_convos_own on public.coach_convos
  for all
  using (
    user_id = auth.uid()
    and org_id = public.current_org_id()
  )
  with check (
    user_id = auth.uid()
    and org_id = public.current_org_id()
  );

-- ---------- 2) coach_messages: via convo + current org ----------
drop policy if exists coach_messages_own on public.coach_messages;
create policy coach_messages_own on public.coach_messages
  for all
  using (
    exists (
      select 1
      from public.coach_convos c
      where c.id = convo_id
        and c.user_id = auth.uid()
        and c.org_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1
      from public.coach_convos c
      where c.id = convo_id
        and c.user_id = auth.uid()
        and c.org_id = public.current_org_id()
    )
  );

-- ---------- 3) match_knowledge: strict org equality + chunk org ----------
create or replace function public.match_knowledge(
  query_embedding extensions.vector(1536),
  p_org_id uuid,
  match_categories text[] default null,
  match_count int default 5,
  min_similarity float default 0.25
)
returns table (doc_id uuid, doc_title text, category text, content text, similarity float)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  -- Client-supplied p_org_id is never trusted: must equal the
  -- membership-resolved current org (header / single-membership).
  if p_org_id is distinct from public.current_org_id() then
    raise exception 'AscendOS: Kein Zugriff auf fremdes Organisationswissen.';
  end if;

  -- Org filter is INSIDE the retrieval query (not global top-K then filter).
  return query
    select d.id, d.title, d.category, c.content,
           1 - (c.embedding <=> query_embedding) as similarity
    from public.knowledge_chunks c
    join public.knowledge_docs d on d.id = c.doc_id
    where c.embedding is not null
      and d.org_id = p_org_id
      and c.org_id = p_org_id
      and (match_categories is null or d.category = any(match_categories))
      and 1 - (c.embedding <=> query_embedding) >= min_similarity
    order by c.embedding <=> query_embedding
    limit match_count;
end;
$$;

comment on function public.match_knowledge(extensions.vector, uuid, text[], int, float) is
  'Phase 6: org-filtered RAG. p_org_id must equal current_org_id(); no super_admin bypass.';

revoke execute on function public.match_knowledge(extensions.vector, uuid, text[], int, float)
  from PUBLIC, anon;
grant execute on function public.match_knowledge(extensions.vector, uuid, text[], int, float)
  to authenticated, service_role;
