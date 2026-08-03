import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared/auth/AuthProvider';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { RankFrame } from '@shared/ui/RankFrame';
import { AvatarUpload } from './AvatarUpload';
import { useProfileDetail, useUpdateProfile } from './profileApi';

/**
 * Identitätsfelder und Avatar bearbeiten.
 * Username, Rolle, Team, Org, Sponsor: nur Anzeige.
 * Goals: bewusst nicht in dieser Phase.
 */
export function ProfileEditPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshProfile, role: membershipRole } = useAuth();
  const { data, isPending, isError } = useProfileDetail();
  const updateProfile = useUpdateProfile();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('de');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!data || hydrated) return;
    setFirstName(data.profile.first_name);
    setLastName(data.profile.last_name);
    setPhone(data.profile.phone ?? '');
    setCountry(data.profile.country ?? '');
    setLanguage(data.profile.language || 'de');
    setAvatarUrl(data.profile.avatar_url);
    setHydrated(true);
  }, [data, hydrated]);

  if (isError) {
    return <p className="text-sm text-muted">Profil konnte nicht geladen werden.</p>;
  }
  if (isPending || !data || !hydrated) {
    return <p className="text-sm text-muted">Profil wird geladen …</p>;
  }

  const displayName = `${firstName} ${lastName}`.trim() || data.profile.username;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setError('Vor- und Nachname sind Pflichtfelder.');
      return;
    }
    try {
      await updateProfile.mutateAsync({
        first_name: first,
        last_name: last,
        phone: phone.trim() || null,
        country: country.trim() || null,
        language: language.trim() || 'de',
      });
      navigate('/profil');
    } catch {
      setError('Speichern fehlgeschlagen. Bitte versuche es erneut.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Profil bearbeiten</h1>
        <Link to="/profil" className="text-sm font-semibold text-accent-deep hover:underline">
          Zurück
        </Link>
      </div>

      <Card className="flex flex-col items-center gap-4">
        <RankFrame
          frameKey={resolveDisplayFrameKey({
            role: membershipRole,
            rankFrameKey: data.rank.current?.frame_asset ?? null,
            isBeraterDesMonats: data.rank.isBeraterDesMonats,
          })}
          src={avatarUrl}
          name={displayName}
          size="lg"
        />
        <AvatarUpload
          userId={data.profile.id}
          name={displayName}
          frameKey={resolveDisplayFrameKey({
            role: membershipRole,
            rankFrameKey: data.rank.current?.frame_asset ?? null,
            isBeraterDesMonats: data.rank.isBeraterDesMonats,
          })}
          onUploaded={(url) => {
            setAvatarUrl(url);
            void queryClient.invalidateQueries({
              queryKey: ['profile-detail', data.profile.id],
            });
            void refreshProfile();
          }}
        />
      </Card>

      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Benutzername"
          value={data.profile.username}
          readOnly
          disabled
          hint="Der Benutzername ist fest und kann nicht geändert werden."
        />
        <Input
          label="Vorname"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          autoComplete="given-name"
        />
        <Input
          label="Nachname"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          autoComplete="family-name"
        />
        <Input
          label="Telefon (optional)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
        <Input
          label="Land (optional)"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          autoComplete="country-name"
        />
        <Input
          label="Sprache"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          hint="Einfacher Textcode, z. B. de oder tr."
          autoComplete="language"
        />

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
      </form>
    </div>
  );
}
