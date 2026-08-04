import { useEffect, useId, useState } from 'react';
import { useI18n, type MessageKey } from '@shared/i18n';
import { APP_LOCALES, localeOption, type AppLocale } from '@shared/lib/locale';
import { Button } from '@shared/ui/Button';
import { detectInstallPlatform, isStandaloneDisplayMode, type InstallPlatform } from './platform';
import {
  IllustAdvantages,
  IllustAndroidAdd,
  IllustAndroidConfirm,
  IllustAndroidMenu,
  IllustDone,
  IllustIosAdd,
  IllustIosHome,
  IllustIosScroll,
  IllustIosShare,
  IllustWelcome,
} from './illustrations';
import {
  ONBOARDING_LOCALES,
  guideFamilyFromStep,
  installProgress,
  nextStep,
  prevStep,
  type GuideFamily,
} from './steps';
import {
  markFirstLaunchComplete,
  readFirstLaunchState,
  writeFirstLaunchState,
  type FirstLaunchStep,
} from './storage';
import './first-launch.css';

export type FirstLaunchWizardProps = {
  /** Overlay (first launch) vs in-page (Profile → Hilfe). */
  variant?: 'overlay' | 'page';
  /** Start at welcome when reopening from Hilfe. */
  resetToWelcome?: boolean;
  onFinished?: () => void;
};

const LANG_OPTIONS = ONBOARDING_LOCALES.map(
  (code) => APP_LOCALES.find((l) => l.code === code) ?? localeOption(code)
);

function stepTitleKey(step: FirstLaunchStep): MessageKey | null {
  switch (step) {
    case 'android-1':
      return 'firstLaunch.androidStep1Title';
    case 'android-2':
      return 'firstLaunch.androidStep2Title';
    case 'android-3':
      return 'firstLaunch.androidStep3Title';
    case 'android-4':
      return 'firstLaunch.androidStep4Title';
    case 'ios-1':
      return 'firstLaunch.iosStep1Title';
    case 'ios-2':
      return 'firstLaunch.iosStep2Title';
    case 'ios-3':
      return 'firstLaunch.iosStep3Title';
    case 'ios-4':
      return 'firstLaunch.iosStep4Title';
    case 'ios-5':
      return 'firstLaunch.iosStep5Title';
    default:
      return null;
  }
}

function stepBodyKey(step: FirstLaunchStep): MessageKey | null {
  switch (step) {
    case 'android-1':
      return 'firstLaunch.androidStep1Body';
    case 'android-2':
      return 'firstLaunch.androidStep2Body';
    case 'android-3':
      return 'firstLaunch.androidStep3Body';
    case 'android-4':
      return 'firstLaunch.androidStep4Body';
    case 'ios-1':
      return 'firstLaunch.iosStep1Body';
    case 'ios-2':
      return 'firstLaunch.iosStep2Body';
    case 'ios-3':
      return 'firstLaunch.iosStep3Body';
    case 'ios-4':
      return 'firstLaunch.iosStep4Body';
    case 'ios-5':
      return 'firstLaunch.iosStep5Body';
    default:
      return null;
  }
}

function StepIllustration({ step }: { step: FirstLaunchStep }) {
  const cls = 'fl-illust fl-illust--lg';
  switch (step) {
    case 'android-1':
      return <IllustAndroidMenu className={cls} />;
    case 'android-2':
      return <IllustAndroidAdd className={cls} />;
    case 'android-3':
      return <IllustAndroidConfirm className={cls} />;
    case 'android-4':
    case 'ios-5':
      return <IllustDone className={cls} />;
    case 'ios-1':
      return <IllustIosShare className={cls} />;
    case 'ios-2':
      return <IllustIosScroll className={cls} />;
    case 'ios-3':
      return <IllustIosHome className={cls} />;
    case 'ios-4':
      return <IllustIosAdd className={cls} />;
    default:
      return null;
  }
}

function ProgressDots({
  step,
  platform,
  override,
}: {
  step: FirstLaunchStep;
  platform: InstallPlatform;
  override: GuideFamily | null;
}) {
  const { t } = useI18n();
  const phases: FirstLaunchStep[] = ['welcome', 'language'];
  if (platform === 'other') phases.push('platform');
  const family = guideFamilyFromStep(step) ?? override ?? (platform === 'ios' ? 'ios' : 'android');
  if (family === 'android') {
    phases.push('android-1', 'android-2', 'android-3', 'android-4');
  } else {
    phases.push('ios-1', 'ios-2', 'ios-3', 'ios-4', 'ios-5');
  }
  phases.push('advantages', 'finish');

  const active = Math.max(
    0,
    phases.findIndex((p) => p === step)
  );

  return (
    <div
      className="fl-progress"
      role="progressbar"
      aria-label={t('firstLaunch.progressLabel')}
      aria-valuenow={active + 1}
      aria-valuemin={1}
      aria-valuemax={phases.length}
    >
      {phases.map((p, i) => (
        <span key={p} className={`fl-progress__dot${i <= active ? ' fl-progress__dot--on' : ''}`} />
      ))}
    </div>
  );
}

export function FirstLaunchWizard({
  variant = 'overlay',
  resetToWelcome = false,
  onFinished,
}: FirstLaunchWizardProps) {
  const { t, locale, setLocale } = useI18n();
  const titleId = useId();
  const [platform] = useState<InstallPlatform>(() => detectInstallPlatform());
  const [standalone] = useState(() => isStandaloneDisplayMode());
  const [override, setOverride] = useState<GuideFamily | null>(() => {
    const s = readFirstLaunchState().step;
    return guideFamilyFromStep(s);
  });
  const [step, setStep] = useState<FirstLaunchStep>(() => {
    if (resetToWelcome) return 'welcome';
    return readFirstLaunchState().step;
  });

  // Persist in-progress step (survives refresh). Completion is separate.
  useEffect(() => {
    const current = readFirstLaunchState();
    writeFirstLaunchState({ ...current, step });
  }, [step]);

  const go = (next: FirstLaunchStep | null) => {
    if (!next) return;
    setStep(next);
  };

  const finish = () => {
    markFirstLaunchComplete({ completed: true, completedAt: null, step: 'finish' });
    onFinished?.();
  };

  const back = prevStep(step, platform, override);
  const forward = nextStep(step, platform, override);
  const progress = installProgress(step);

  const chooseLanguage = (code: AppLocale) => {
    setLocale(code);
  };

  const pickPlatform = (family: GuideFamily) => {
    setOverride(family);
    setStep(family === 'android' ? 'android-1' : 'ios-1');
  };

  const continueFromLanguage = () => {
    go(nextStep('language', platform, override));
  };

  const rootClass = variant === 'page' ? 'fl-root fl-root--page' : 'fl-root';

  return (
    <div
      className={rootClass}
      role="dialog"
      aria-modal={variant === 'overlay'}
      aria-labelledby={titleId}
    >
      <div className="fl-shell">
        <ProgressDots step={step} platform={platform} override={override} />

        <div className="fl-body" key={step}>
          {step === 'welcome' ? (
            <>
              <IllustWelcome className="fl-illust" />
              <h1 id={titleId} className="fl-brand">
                {t('firstLaunch.welcomeTitle')}
              </h1>
              <p className="fl-subtitle">{t('firstLaunch.welcomeSubtitle')}</p>
              <p className="fl-copy">{t('firstLaunch.welcomeBody')}</p>
              <ul className="fl-bullets">
                <li className="fl-bullet">
                  <span className="fl-bullet__mark" aria-hidden />
                  <span>{t('firstLaunch.welcomeOffline')}</span>
                </li>
                <li className="fl-bullet">
                  <span className="fl-bullet__mark" aria-hidden />
                  <span>{t('firstLaunch.welcomePush')}</span>
                </li>
                <li className="fl-bullet">
                  <span className="fl-bullet__mark" aria-hidden />
                  <span>{t('firstLaunch.welcomeNative')}</span>
                </li>
              </ul>
            </>
          ) : null}

          {step === 'language' ? (
            <>
              <h1 id={titleId} className="fl-title">
                {t('firstLaunch.languageTitle')}
              </h1>
              <p className="fl-copy">{t('firstLaunch.languageBody')}</p>
              <div
                className="fl-langs"
                role="radiogroup"
                aria-label={t('firstLaunch.languageTitle')}
              >
                {LANG_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    role="radio"
                    aria-checked={locale === opt.code}
                    className={`fl-lang${locale === opt.code ? ' fl-lang--on' : ''}`}
                    onClick={() => chooseLanguage(opt.code)}
                  >
                    <img src={opt.flag} alt="" draggable={false} />
                    <span>{t(opt.labelKey)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 'platform' ? (
            <>
              <h1 id={titleId} className="fl-title">
                {t('firstLaunch.detectTitle')}
              </h1>
              <p className="fl-copy">{t('firstLaunch.detectBodyOther')}</p>
              <div className="fl-platforms">
                <Button type="button" variant="secondary" onClick={() => pickPlatform('android')}>
                  {t('firstLaunch.platformAndroid')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => pickPlatform('ios')}>
                  {t('firstLaunch.platformIos')}
                </Button>
              </div>
            </>
          ) : null}

          {guideFamilyFromStep(step) ? (
            <>
              <StepIllustration step={step} />
              {progress ? (
                <p className="fl-step-label">
                  {t('firstLaunch.stepOf', { current: progress.current, total: progress.total })}
                </p>
              ) : null}
              <h1 id={titleId} className="fl-title">
                {stepTitleKey(step) ? t(stepTitleKey(step)!) : t('firstLaunch.detectTitle')}
              </h1>
              <p className="fl-copy">
                {stepBodyKey(step)
                  ? t(stepBodyKey(step)!)
                  : platform === 'ios'
                    ? t('firstLaunch.detectBodyIos')
                    : t('firstLaunch.detectBodyAndroid')}
              </p>
            </>
          ) : null}

          {step === 'advantages' ? (
            <>
              <IllustAdvantages className="fl-illust" />
              <h1 id={titleId} className="fl-title">
                {t('firstLaunch.advantagesTitle')}
              </h1>
              <p className="fl-copy">{t('firstLaunch.advantagesBody')}</p>
              <div className="fl-adv">
                <div className="fl-adv__item">
                  <strong>{t('firstLaunch.advOffline')}</strong>
                  <p>{t('firstLaunch.advOfflineBody')}</p>
                </div>
                <div className="fl-adv__item">
                  <strong>{t('firstLaunch.advPush')}</strong>
                  <p>{t('firstLaunch.advPushBody')}</p>
                </div>
                <div className="fl-adv__item">
                  <strong>{t('firstLaunch.advFaster')}</strong>
                  <p>{t('firstLaunch.advFasterBody')}</p>
                </div>
                <div className="fl-adv__item">
                  <strong>{t('firstLaunch.advNative')}</strong>
                  <p>{t('firstLaunch.advNativeBody')}</p>
                </div>
                <div className="fl-adv__item">
                  <strong>{t('firstLaunch.advUpdates')}</strong>
                  <p>{t('firstLaunch.advUpdatesBody')}</p>
                </div>
              </div>
            </>
          ) : null}

          {step === 'finish' ? (
            <>
              <IllustDone className="fl-illust" />
              <h1 id={titleId} className="fl-title">
                {t('firstLaunch.finishTitle')}
              </h1>
              <p className="fl-copy">{t('firstLaunch.finishBody')}</p>
              {standalone ? (
                <p className="fl-copy" style={{ marginTop: '0.5rem' }}>
                  {t('firstLaunch.alreadyInstalledBody')}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className={`fl-actions${back && step !== 'finish' ? ' fl-actions--row' : ''}`}>
          {back && step !== 'finish' ? (
            <Button type="button" variant="secondary" onClick={() => go(back)}>
              {t('common.back')}
            </Button>
          ) : null}

          {step === 'welcome' || (guideFamilyFromStep(step) && forward) || step === 'advantages' ? (
            <Button type="button" onClick={() => go(forward)}>
              {t('firstLaunch.continue')}
            </Button>
          ) : null}

          {step === 'language' ? (
            <Button type="button" onClick={continueFromLanguage}>
              {t('firstLaunch.continue')}
            </Button>
          ) : null}

          {step === 'finish' ? (
            <Button type="button" onClick={finish}>
              {t('firstLaunch.startNow')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
