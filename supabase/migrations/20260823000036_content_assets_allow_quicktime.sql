-- Allow iPhone MOV / QuickTime uploads in the private content-assets bucket.
-- Client already accepted video/mp4; video/quicktime was missing from Storage allowlist.
-- Append-only: do not edit earlier foundation migrations.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime'
]
where id = 'content-assets';
