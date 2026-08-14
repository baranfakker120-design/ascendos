import { useEffect, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { useActiveOrganizationProfile } from '@shared/org/useActiveOrganizationProfile';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { useUpdateOrgBranding } from './orgAdminApi';

export function OrgAdminBrandingPage() {
  const { t } = useI18n();
  const { profile, isPending } = useActiveOrganizationProfile();
  const update = useUpdateOrgBranding();
  const b = profile?.branding ?? {};

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [website, setWebsite] = useState('');
  const [supportUrl, setSupportUrl] = useState('');
  const [guideUrl, setGuideUrl] = useState('');
  const [coachDisplayName, setCoachDisplayName] = useState('');
  const [appDisplayName, setAppDisplayName] = useState('');

  useEffect(() => {
    if (!profile) return;
    setDisplayName(typeof b.display_name === 'string' ? b.display_name : '');
    setLogoUrl(typeof b.logoUrl === 'string' ? b.logoUrl : '');
    setPrimaryColor(typeof b.primaryColor === 'string' ? b.primaryColor : '');
    setWebsite(typeof b.website === 'string' ? b.website : '');
    setSupportUrl(typeof b.supportUrl === 'string' ? b.supportUrl : '');
    setGuideUrl(typeof b.guideUrl === 'string' ? b.guideUrl : '');
    setCoachDisplayName(typeof b.coachDisplayName === 'string' ? b.coachDisplayName : '');
    setAppDisplayName(typeof b.app_display_name === 'string' ? b.app_display_name : '');
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- hydrate once per org

  if (isPending && !profile) {
    return (
      <Card>
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </Card>
    );
  }

  const onSave = async () => {
    await update.mutateAsync({
      display_name: displayName.trim(),
      logoUrl: logoUrl.trim(),
      primaryColor: primaryColor.trim(),
      website: website.trim(),
      supportUrl: supportUrl.trim(),
      guideUrl: guideUrl.trim(),
      coachDisplayName: coachDisplayName.trim(),
      app_display_name: appDisplayName.trim(),
    });
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="text-sm text-muted">{t('orgAdmin.branding.hint')}</p>
        <Input
          label={t('orgAdmin.branding.displayName')}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Input
          label={t('orgAdmin.branding.appDisplayName')}
          value={appDisplayName}
          onChange={(e) => setAppDisplayName(e.target.value)}
        />
        <Input
          label={t('orgAdmin.branding.logoUrl')}
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
        />
        <Input
          label={t('orgAdmin.branding.primaryColor')}
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          placeholder="#2563eb"
        />
        <Input
          label={t('orgAdmin.branding.website')}
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        <Input
          label={t('orgAdmin.branding.support')}
          value={supportUrl}
          onChange={(e) => setSupportUrl(e.target.value)}
        />
        <Input
          label={t('orgAdmin.branding.guideUrl')}
          value={guideUrl}
          onChange={(e) => setGuideUrl(e.target.value)}
        />
        <Input
          label={t('orgAdmin.branding.coachDisplayName')}
          value={coachDisplayName}
          onChange={(e) => setCoachDisplayName(e.target.value)}
        />
        {update.isError ? (
          <Alert tone="error">{update.error?.message || t('orgAdmin.saveFailed')}</Alert>
        ) : null}
        {update.isSuccess ? <Alert tone="info">{t('orgAdmin.saved')}</Alert> : null}
        <Button onClick={() => void onSave()} disabled={update.isPending}>
          {update.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {t('orgAdmin.branding.preview')}
        </p>
        <p className="mt-2 text-xl font-bold" style={{ color: primaryColor || undefined }}>
          {displayName || profile?.displayName || t('orgAdmin.activeOrgGeneric')}
        </p>
        <p className="mt-1 text-sm text-muted">
          {coachDisplayName || t('orgAdmin.branding.coachFallback')}
        </p>
      </Card>
    </div>
  );
}
