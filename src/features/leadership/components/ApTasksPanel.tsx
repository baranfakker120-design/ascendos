import { useState } from 'react';
import { useApTasks, useCompleteApTask } from '../leadershipApi';
import './leader-surface.css';

interface ApTasksPanelProps {
  onAwarded?: (ap: number, newTotal: number) => void;
}

export function ApTasksPanel({ onAwarded }: ApTasksPanelProps) {
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
      setError(e instanceof Error ? e.message : 'Aufgabe konnte nicht abgeschlossen werden.');
    }
  };

  return (
    <section className="leader-tasks leader-glass" aria-label="Aufgaben & AP">
      <header>
        <h2>Aufgaben</h2>
        <p>AP nur nach vollständigem Abschluss.</p>
      </header>
      {error ? <p className="leader-tasks__error">{error}</p> : null}
      {flying != null ? (
        <div className="leader-tasks__fly" aria-live="polite">
          +{flying} AP
        </div>
      ) : null}
      <ul className="leader-tasks__list">
        {isPending ? (
          <li>Lade Aufgaben …</li>
        ) : (
          tasks.map((task) => (
            <li key={task.id}>
              <div>
                <p className="leader-tasks__title">{task.title}</p>
                <p className="leader-tasks__meta">
                  +{task.ap} AP · {task.difficulty}
                  {task.repeatable ? '' : ' · einmalig'}
                </p>
              </div>
              <button
                type="button"
                disabled={complete.isPending}
                onClick={() => void onComplete(task.key, task.ap)}
              >
                Erledigt
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
