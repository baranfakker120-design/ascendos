-- Phase 8: Org #1 branding parity (display_name + guide URL in data, not FE hardcodes).
-- Repository migration only — do not apply to production without human approval.
-- organizations.name stays "Chogan" (ADR 0007); branding.display_name is the visible brand.

update public.organizations
set branding = coalesce(branding, '{}'::jsonb) || jsonb_build_object(
  'display_name', 'Team Seyda',
  'guideUrl', 'https://teamseydaguide.netlify.app',
  'primaryColor', coalesce(branding->>'primaryColor', '#2563eb')
)
where id = '00000000-0000-0000-0000-000000000001';

-- Neutralize visible onboarding tool name (key + URL stay Org-1 data).
update public.external_tools
set name = 'Onboarding'
where org_id = '00000000-0000-0000-0000-000000000001'
  and key = 'waytomoon'
  and name ilike '%waytomoon%';
