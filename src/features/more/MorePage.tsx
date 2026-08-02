import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import type { ExternalTool, FirstlineProgress } from '@shared/types/domain';

/**
 * More — business hub (Team Seyda, Journey, Firstline, Invite, Tools, Resources).
 * System preferences live on Settings.
 */
export function MorePage() {
  const { profile } = useAuth();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: firstlineProgress } = useQuery({
    queryKey: ['firstline-progress', profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<FirstlineProgress[]> => {
      const { data, error } = await supabase
        .from('firstline_journey_progress')
        .select('*')
        .order('completed_steps', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: tools } = useQuery({
    queryKey: ['external-tools-more'],
    queryFn: async (): Promise<ExternalTool[]> => {
      const { data, error } = await supabase.from('external_tools').select('*');
      if (error) throw error;
      return data ?? [];
    },
  });

  const createInvite = async () => {
    setBusy(true);
    setCopied(false);
    const { data, error } = await supabase.rpc('create_invite', {});
    setBusy(false);
    if (error || !data?.[0]) {
      setInviteLink(null);
      return;
    }
    setInviteLink(`${window.location.origin}/registrieren?code=${data[0].invite_code}`);
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
  };

  if (!profile) return null;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Business</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Mehr</h1>
      </header>

      <Link to="/team-seyda" className="block">
        <Card className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Team Seyda</p>
            <p className="mt-0.5 text-sm text-muted">Guide — Way to Moon</p>
          </div>
          <span className="text-primary" aria-hidden>
            →
          </span>
        </Card>
      </Link>

      <Link to="/reise" className="block">
        <Card className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Journey</p>
            <p className="mt-0.5 text-sm text-muted">Meilensteine und Wochenrhythmus</p>
          </div>
          <span className="text-primary" aria-hidden>
            →
          </span>
        </Card>
      </Link>

      <Card>
        <p className="font-semibold">Firstline</p>
        <p className="mt-0.5 text-xs text-muted">
          Du siehst den Fortschritt — Inhalte und Daten bleiben privat.
        </p>
        {firstlineProgress && firstlineProgress.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {firstlineProgress.map((fp) => {
              const done = fp.completed_steps >= fp.total_steps;
              return (
                <li key={fp.user_id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{fp.first_name}</span>
                  <span className={`shrink-0 ${done ? 'font-medium text-emerald-600' : 'text-muted'}`}>
                    {done ? 'Reise abgeschlossen ✓' : `Tag ${fp.current_day} von ${fp.total_days}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Noch keine Firstline auf der Reise.</p>
        )}
      </Card>

      <Card>
        <p className="font-semibold">Invite Partner</p>
        <p className="mt-1 text-sm text-muted">
          Persönlicher Einladungslink — Registrierung ordnet Sponsor und Team automatisch zu. 14 Tage
          gültig, einmal verwendbar.
        </p>
        {inviteLink ? (
          <div className="mt-3 space-y-2">
            <p className="break-all rounded-xl bg-bg px-3 py-2 font-mono text-xs">{inviteLink}</p>
            <Button variant="secondary" onClick={copyLink}>
              {copied ? 'Kopiert ✓' : 'Link kopieren'}
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <Button onClick={createInvite} disabled={busy}>
              {busy ? 'Wird erstellt …' : 'Einladungslink erstellen'}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <p className="font-semibold">Tools</p>
        <p className="mt-0.5 text-sm text-muted">Externe Werkzeuge für Gespräche und Follow-ups.</p>
        {tools && tools.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {tools.map((tool) => (
              <li key={tool.key}>
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm font-medium hover:bg-bg"
                >
                  <span>{tool.name}</span>
                  <span className="text-muted" aria-hidden>
                    →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Keine Tools hinterlegt.</p>
        )}
      </Card>

      <Card>
        <p className="font-semibold">Resources</p>
        <p className="mt-1 text-sm text-muted">
          Wissen, Guides und Materialien für dein Leadership.
        </p>
        {profile.role === 'super_admin' ? (
          <Link
            to="/wissen"
            className="mt-3 flex h-12 items-center justify-center rounded-xl border border-line bg-surface px-4 text-base font-semibold text-ink hover:bg-bg"
          >
            Wissensdatenbank
          </Link>
        ) : (
          <Link
            to="/team-seyda"
            className="mt-3 flex h-12 items-center justify-center rounded-xl border border-line bg-surface px-4 text-base font-semibold text-ink hover:bg-bg"
          >
            Team Seyda Guide
          </Link>
        )}
      </Card>
    </div>
  );
}
