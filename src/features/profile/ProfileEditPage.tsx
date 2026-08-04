import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { DRAFT_SCOPES, usePersistedDraft } from '@shared/offline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { RankFrame } from '@shared/ui/RankFrame';
import { AvatarUpload } from './AvatarUpload';
import {
  profileDetailFromAuth,
  useProfileDetail,
  useUpdateProfile,
  type ProfileDetail,
} from './profileApi';

/**
 * Identitätsfelder und Avatar bearbeiten.
 * Username, Rolle, Team, Org, Sponsor: nur Anzeige.
 * Goals: bewusst nicht in dieser Phase.
 */
export function ProfileEditPage() {
  const { t } = useI18n();
  const { profile: authProfile, membership } = useAuth();
  const { data, isPending, isError } = useProfileDetail();

  if (isPending && !data && !authProfile) {
    return <p className="text-sm text-muted">{t('profile.loading')}</p>;
  }

  const detail =
    data ??
    (authProfile
      ? profileDetailFromAuth(authProfile, membership)
      : profileDetailFromAuth(
          {
            id: '',
            first_name: '',
            last_name: '',
            username: '—',
            phone: null,
            country: null,
            language: 'de',
            avatar_url: null,
            org_id: '',
            team_id: '',
            sponsor_id: null,
            role: 'berater',
            goals: {},
            created_at: '',
            updated_at: '',
          },
          null
        ));

  const showLoadBanner =
    (!isPending && (isError || !data)) ||
    detail.loadWarning === 'profile_partial' ||
    detail.loadWarning === 'rank_unavailable';

  return (
    <>
      {showLoadBanner ? (
        <div className="mb-4">
          <Alert tone="error">{t('profile.loadError')}</Alert>
        </div>
      ) : null}
      <ProfileEditForm key={detail.profile.id || 'shell'} data={detail} />
    </>
  );
}

function ProfileEditForm({ data }: { data: ProfileDetail }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshProfile, role: membershipRole } = useAuth();
  const updateProfile = useUpdateProfile();
  const {
    value: { firstName, lastName, phone, country, language },
    patch,
    clear: clearProfileDraft,
  } = usePersistedDraft(DRAFT_SCOPES.profileEdit, {
    firstName: data.profile.first_name,
    lastName: data.profile.last_name,
    phone: data.profile.phone ?? '',
    country: data.profile.country ?? '',
    language: data.profile.language || 'de',
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(data.profile.avatar_url);
  const [error, setError] = useState<string | null>(null);

  const displayName = `${firstName} ${lastName}`.trim() || data.profile.username;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      setError(t('profile.nameRequired'));
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
      await clearProfileDraft();
      navigate('/profil');
    } catch {
      setError(t('profile.saveFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('profile.editTitle')}</h1>
        <Link to="/profil" className="text-sm font-semibold text-accent-deep hover:underline">
          {t('common.back')}
        </Link>
      </div>

      <Card className="flex flex-col items-center gap-4">
        <RankFrame
          frameKey={resolveDisplayFrameKey({
            role: membershipRole,
            rankFrameKey: data.rank.current?.frame_asset ?? null,
            isBeraterDesMonats: data.rank.isBeraterDesMonats,
            equippedFrameKey: data.rank.equippedFrameKey,
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
            equippedFrameKey: data.rank.equippedFrameKey,
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
          label={t('profile.username')}
          value={data.profile.username}
          readOnly
          disabled
          hint={t('profile.usernameFixed')}
        />
        <Input
          label={t('profile.firstName')}
          value={firstName}
          onChange={(e) => patch({ firstName: e.target.value })}
          required
          autoComplete="given-name"
        />
        <Input
          label={t('profile.lastName')}
          value={lastName}
          onChange={(e) => patch({ lastName: e.target.value })}
          required
          autoComplete="family-name"
        />
        <Input
          label={t('profile.phoneOptional')}
          type="tel"
          value={phone}
          onChange={(e) => patch({ phone: e.target.value })}
          autoComplete="tel"
        />
        <Input
          label={t('profile.countryOptional')}
          value={country}
          onChange={(e) => patch({ country: e.target.value })}
          autoComplete="country-name"
        />
        <Input
          label={t('profile.language')}
          value={language}
          onChange={(e) => patch({ language: e.target.value })}
          hint={t('profile.languageHint')}
          autoComplete="language"
        />

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </form>
    </div>
  );
}
