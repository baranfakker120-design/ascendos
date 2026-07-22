import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import type { FirstlineProgress } from '@shared/types/domain';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super-Admin',
  leader: 'Leader',
  berater: 'Berater',
};

/**
 * Mehr-Tab (Sprint 1): Profil & Genealogie sichtbar machen und den
 * Einladungs-Kreislauf schließen — jeder Nutzer kann hier Partner
 * einladen. Damit ist der komplette Registrierungs-Loop lauffähig:
 * Invite erstellen -> Link teilen -> Partner registriert sich ->
 * Genealogie entsteht automatisch.
 */
export function MorePage() {
  const { profile, signOut } = useAuth();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: context } = useQuery({
    queryKey: ['profile-context', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const [team, org, sponsor, firstline] = await Promise.all([
        supabase.from('teams').select('name').eq('id', profile!.team_id).single(),
        supabase.from('organizations').select('name').eq('id', profile!.org_id).single(),
        profile!.sponsor_id
          ? supabase
              .from('profiles_public')
              .select('first_name, last_name')
              .eq('id', profile!.sponsor_id)
              .single()
          : Promise.resolve({ data: null }),
        supabase
          .from('profiles_public')
          .select('id', { count: 'exact', head: true })
          .eq('sponsor_id', profile!.id),
      ]);
      return {
        teamName: team.data?.name ?? '—',
        orgName: org.data?.name ?? '—',
        sponsorName: sponsor.data
          ? `${sponsor.data.first_name} ${sponsor.data.last_name}`.trim()
          : null,
        firstlineCount: firstline.count ?? 0,
      };
    },
  });

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
      <h1 className="text-2xl font-bold">Mehr</h1>

      <Card>
        <p className="text-lg font-semibold">
          {profile.first_name} {profile.last_name}
        </p>
        <p className="text-sm text-muted">@{profile.username}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Rolle</dt>
            <dd className="font-medium">{ROLE_LABELS[profile.role] ?? profile.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Team</dt>
            <dd className="font-medium">{context?.teamName ?? '…'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Organisation</dt>
            <dd className="font-medium">{context?.orgName ?? '…'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Sponsor</dt>
            <dd className="font-medium">{context?.sponsorName ?? 'Gründungsmitglied'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Firstline</dt>
            <dd className="font-medium">
              {context ? `${context.firstlineCount} Partner` : '…'}
            </dd>
          </div>
        </dl>
      </Card>

      <Link to="/reise" className="block">
        <Card className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Deine Reise</p>
            <p className="mt-0.5 text-sm text-muted">Meilensteine und Wochenrhythmus</p>
          </div>
          <span className="text-primary">→</span>
        </Card>
      </Link>

      {firstlineProgress && firstlineProgress.length > 0 ? (
        <Card>
          <p className="font-semibold">Deine Firstline auf ihrer Reise</p>
          <p className="mt-0.5 text-xs text-muted">
            Du siehst den Fortschritt — Inhalte und Daten bleiben privat.
          </p>
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
        </Card>
      ) : null}

      <Card>
        <p className="font-semibold">Partner einladen</p>
        <p className="mt-1 text-sm text-muted">
          Erstelle einen persönlichen Einladungslink. Wer sich darüber registriert, wird
          automatisch dir als Sponsor und deinem Team zugeordnet. Der Link ist 14 Tage gültig und
          einmal verwendbar.
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

      <Button variant="secondary" onClick={signOut}>
        Abmelden
      </Button>
    </div>
  );
}
