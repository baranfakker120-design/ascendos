import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoryCard } from './types';
import { STORY_TYPE_LABELS } from './types';
import './ascend-stories.css';

const SEEN_SLOT = ['ascendos', 'stories-seen', 'v1'].join('.');

function readSeen(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SEEN_SLOT);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSeen(map: Record<string, string>) {
  try {
    localStorage.setItem(SEEN_SLOT, JSON.stringify(map));
  } catch {
    // private mode
  }
}

function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

interface Props {
  stories: StoryCard[];
}

/**
 * Premium Stories bar — motivate / celebrate / inspire.
 * Never shame. Never negative compare.
 */
export function StoriesBar({ stories }: Props) {
  const [seen, setSeen] = useState<Record<string, string>>(() => readSeen());
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const active = useMemo(() => stories, [stories]);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      const next = { ...prev, [id]: new Date().toISOString() };
      writeSeen(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (openIndex === null) return;
    const story = active[openIndex];
    if (story) markSeen(story.id);
  }, [openIndex, active, markSeen]);

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null);
      if (e.key === 'ArrowRight') {
        setOpenIndex((i) => (i === null ? i : Math.min(active.length - 1, i + 1)));
      }
      if (e.key === 'ArrowLeft') {
        setOpenIndex((i) => (i === null ? i : Math.max(0, i - 1)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex, active.length]);

  if (active.length === 0) return null;

  const current = openIndex !== null ? active[openIndex] : null;

  return (
    <section className="ascend-stories" aria-label="Ascend Stories">
      <div className="ascend-stories__track">
        {active.map((story, index) => {
          const isSeen = Boolean(seen[story.id]);
          const ringClass = [
            'ascend-stories__ring',
            isSeen ? 'ascend-stories__ring--seen' : '',
            story.accent === 'ink' ? 'ascend-stories__ring--ink' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={story.id}
              type="button"
              className="ascend-stories__item"
              onClick={() => setOpenIndex(index)}
              aria-label={`${story.title} Story öffnen`}
            >
              <div className={ringClass}>
                <div className="ascend-stories__avatar">
                  {story.mediaUrl && story.mediaKind === 'image' ? (
                    <img src={story.mediaUrl} alt="" />
                  ) : (
                    initials(story.subjectName || story.title)
                  )}
                </div>
              </div>
              <p className="ascend-stories__label">{story.title}</p>
            </button>
          );
        })}
      </div>

      {current && openIndex !== null ? (
        <div className="ascend-stories__viewer" role="dialog" aria-modal="true">
          <div className="ascend-stories__progress">
            {active.map((s, i) => (
              <div key={s.id} className="ascend-stories__progress-seg">
                <div
                  className={`ascend-stories__progress-fill ${
                    i < openIndex
                      ? 'ascend-stories__progress-fill--done'
                      : i === openIndex
                        ? 'ascend-stories__progress-fill--active'
                        : ''
                  }`}
                  onAnimationEnd={() => {
                    if (i === openIndex) {
                      if (openIndex < active.length - 1) setOpenIndex(openIndex + 1);
                      else setOpenIndex(null);
                    }
                  }}
                />
              </div>
            ))}
          </div>
          <div className="ascend-stories__meta">
            <div>
              <p className="ascend-stories__meta-title">{current.authorLabel}</p>
              <p className="ascend-stories__meta-sub">{STORY_TYPE_LABELS[current.type]}</p>
            </div>
            <button
              type="button"
              className="ascend-stories__close"
              aria-label="Schließen"
              onClick={() => setOpenIndex(null)}
            >
              ×
            </button>
          </div>
          <div className="ascend-stories__tap-zones" aria-hidden>
            <button
              type="button"
              onClick={() => setOpenIndex((i) => (i === null ? i : Math.max(0, i - 1)))}
            />
            <button
              type="button"
              onClick={() =>
                setOpenIndex((i) => {
                  if (i === null) return i;
                  if (i < active.length - 1) return i + 1;
                  return null;
                })
              }
            />
          </div>
          <div className="ascend-stories__body">
            <h2 className="ascend-stories__headline">{current.title}</h2>
            <p className="ascend-stories__text">{current.body}</p>
            <p className="ascend-stories__tone">{current.tone}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
