import { useState } from 'react';
import { useI18n } from '@shared/i18n';
import { useApTasks, useCompleteApTask } from '../leadershipApi';
import './leader-surface.css';

interface ApTasksPanelProps {
  onAwarded?: (ap: number, newTotal: number) => void;
}

export function ApTasksPanel({ onAwarded }: ApTasksPanelProps) {
  const { t } = useI18n();
  const { data: tasks = [], isPending } = useApTasks();
  const complete = useCompleteApTask();
  const [flying, setFlying] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onComplete = async (key: string, ap: number) => {
    setError(null);
    try {
      const result = await complete.mutateAsync({ taskKey: key });
      setFlying(result.apAwarded || ap);
      onAwarded?.(result.apAwarded, result.newApTotal);
      window.setTimeout(() => setFlying(null), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('leadership.taskFailed'));
    }
  };

  return (
    <section className="leader-tasks leader-glass" aria-label={t('leadership.tasks')}>
      <header>
        <h2>{t('leadership.tasksTitle')}</h2>
        <p>{t('leadership.tasksSub')}</p>
      </header>
      {error ? <p className="leader-tasks__error">{error}</p> : null}
      {flying != null ? (
        <div className="leader-tasks__fly" aria-live="polite">
          +{flying} {t('common.ap')}
        </div>
      ) : null}
      <ul className="leader-tasks__list">
        {isPending ? (
          <li>{t('leadership.tasksLoading')}</li>
        ) : (
          tasks.map((task) => (
            <li key={task.id}>
              <div>
                <p className="leader-tasks__title">{task.title}</p>
                <p className="leader-tasks__meta">
                  +{task.ap} {t('common.ap')} · {task.difficulty}
                  {task.repeatable ? '' : ` · ${t('leadership.once')}`}
                </p>
              </div>
              <button
                type="button"
                disabled={complete.isPending}
                onClick={() => void onComplete(task.key, task.ap)}
              >
                {t('leadership.done')}
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
