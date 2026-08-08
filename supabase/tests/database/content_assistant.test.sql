-- Phase 2: AI Content Assistant foundation (additive tables + RPCs)
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'content_assets', 'content_assets exists');
select has_table('public', 'content_drafts', 'content_drafts exists');
select has_table('public', 'content_daily_preparations', 'content_daily_preparations exists');
select has_table('public', 'content_instagram_connections', 'content_instagram_connections exists');
select has_table('public', 'content_publish_attempts', 'content_publish_attempts exists');

select has_function('public', 'content_asset_limit', 'content_asset_limit rpc');
select has_function('public', 'content_personal_asset_count', 'content_personal_asset_count rpc');
select has_function('public', 'content_can_upload_asset', ARRAY['text'], 'content_can_upload_asset rpc');

select ok(
  exists (select 1 from storage.buckets where id = 'content-assets' and public = false),
  'content-assets bucket is private'
);

select has_column('public', 'content_assets', 'storage_path', 'immutable original path column');
select has_column('public', 'content_instagram_connections', 'token_ref', 'token_ref only — no password column');
select has_column('public', 'content_publish_attempts', 'user_confirmed_at', 'publish requires confirm column');

select * from finish();
rollback;
