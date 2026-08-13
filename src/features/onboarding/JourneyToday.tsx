import { useState } from 'react';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { useQuery } from '@tanstack/react-query';
import { scoreJourneyStep } from '@shared/lib/apScoring';
import { displayShareTool, renameWayToMoonLabel } from '@shared/lib/shareToolsDisplay';
import type { ExternalTool, JourneyStep, JourneyStepContent } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button, buttonClassName } from '@shared/ui/Button';
import { ButtonLink } from '@shared/ui/ButtonLink';
import { Card } from '@shared/ui/Card';
import { EnergyCore } from '@shared/ui/EnergyCore';
import { useCompleteStep, useJourneyState } from './journeyApi';

/**
 * Journey-Modus des Heute-Tabs (Sprint 5): In der ersten Woche sieht
 * der neue Partner ausschließlich seine Reise — nie eine leere App.
 * Gerendert über TodayRoute (app/router), nicht vom daily-plan-Feature.
 */
export function JourneyToday() {
  const { t } = useI18n();
  const { profile, membership } = useAuth();
  const { data: state, isPending, isError, refetch } = useJourneyState();
  const complete = useCompleteStep();
  const pendingStepId = complete.isPending ? (complete.variables ?? null) : null;
  const [stepError, setStepError] = useState<string | null>(null);
  const { data: tools } = useQuery({
    queryKey: ['external-tools', membership?.org_id ?? null, 'journey'],
    enabled: Boolean(membership?.org_id),
    queryFn: async (): Promise<ExternalTool[]> => {
      const { data, error } = await supabase.from('external_tools').select('*');
      if (error) throw error;
      return (data ?? []) as ExternalTool[];
    },
    staleTime: 5 * 60_000,
  });

  if (isPending) {
    return <p className="text-sm text-muted">{t('journey.loading')}</p>;
  }

  if (isError || !state?.journey) {
    return (
      <Card>
        <p className="font-medium">{t('journey.loadError')}</p>
        <p className="mt-1 text-sm text-muted">{t('common.connectionHint')}</p>
        <Button className="mt-3" variant="secondary" onClick={() => void refetch()}>
          {t('common.retry')}
        </Button>
      </Card>
    );
  }

  const daySteps = state.steps.filter((s) => s.day_number === state.currentDay);
  const doneToday = daySteps.filter((s) => state.completedStepIds.has(s.id)).length;
  const totalDone = state.completedStepIds.size;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-deep">
          {t('journey.dayOf', { current: state.currentDay, total: state.totalDays })}
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          {profile ? `${profile.first_name}, ` : ''}
          {t('journey.firstWeek')}
        </h1>
        <p className="mt-1 text-sm text-muted">{state.journey.title}</p>
        <EnergyCore
          ap={totalDone}
          currentThreshold={0}
          nextThreshold={state.steps.length}
          showLabel={false}
          size="md"
          className="mt-3"
        />
      </div>

      {stepError ? (
        <Card>
          <p className="text-sm text-muted">{stepError}</p>
        </Card>
      ) : null}

      <ol className="space-y-3">
        {daySteps.map((step) => (
          <JourneyStepCard
            key={step.id}
            step={step}
            done={state.completedStepIds.has(step.id)}
            doneToday={doneToday}
            tools={tools ?? []}
            busy={pendingStepId === step.id}
            onComplete={() => {
              setStepError(null);
              void complete.mutateAsync(step.id).catch(() => {
                setStepError(t('journey.saveFailed'));
              });
            }}
          />
        ))}
      </ol>

      {doneToday === daySteps.length && daySteps.length > 0 ? (
        <Card>
          <p className="font-semibold">{t('journey.dayDone', { day: state.currentDay })}</p>
          <p className="mt-1 text-sm text-muted">
            {state.currentDay < state.totalDays
              ? t('journey.nextDayUnlocked', { day: state.currentDay + 1 })
              : t('journey.weekDone')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function JourneyStepCard({
  step,
  done,
  doneToday,
  tools,
  busy,
  onComplete,
}: {
  step: JourneyStep;
  done: boolean;
  doneToday: number;
  tools: ExternalTool[];
  busy: boolean;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const content = (step.content ?? {}) as JourneyStepContent;
  const rawTool = content.tool_key ? tools.find((tool) => tool.key === content.tool_key) : null;
  const tool = rawTool ? displayShareTool(rawTool) : null;
  const ap = scoreJourneyStep(step.content_type, step.day_number, doneToday);
  const visibleTitle = renameWayToMoonLabel(step.title);
  const visibleBody = content.body ? renameWayToMoonLabel(content.body) : null;

  return (
    <li>
      <Card className={done ? 'opacity-60' : ''}>
        <div className="flex items-start justify-between gap-2">
          <p className={`min-w-0 flex-1 font-semibold ${done ? 'line-through' : ''}`}>
            {visibleTitle}
          </p>
          <ApRewardSticker ap={ap} size="sm" animate={!done} />
        </div>
        {visibleBody ? <p className="mt-1 text-sm text-muted">{visibleBody}</p> : null}

        {!done ? (
          <div className="mt-3 space-y-2">
            {tool ? (
              <a
                href={tool.url}
                target="_blank"
                rel="noreferrer"
                className={buttonClassName({ variant: 'secondary' })}
              >
                <span className="ui-btn__label">{t('journey.openTool', { name: tool.name })}</span>
              </a>
            ) : null}
            {content.link ? (
              <ButtonLink to={content.link} variant="secondary">
                {content.cta ?? t('common.open')}
              </ButtonLink>
            ) : null}
            <Button onClick={onComplete} disabled={busy} aria-busy={busy}>
              {busy
                ? t('today.saving')
                : step.content_type === 'info'
                  ? t('journey.understood')
                  : t('journey.doneCheck')}
            </Button>
          </div>
        ) : null}
      </Card>
    </li>
  );
}
