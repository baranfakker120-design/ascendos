import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo, type ReactNode } from 'react';
import { useI18n } from '@shared/i18n';
import type { AppLocale } from '@shared/lib/locale';
import { matchTeachingLine, prepareCoachReading, type TeachingMeta } from './coachReading';
import './coach-markdown.css';

function textFromChildren(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join('');
  if (typeof children === 'object' && 'props' in children) {
    return textFromChildren((children as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

function TeachingCard({ meta, children }: { meta: TeachingMeta; children: ReactNode }) {
  return (
    <aside
      className={`coach-md__card coach-md__card--${meta.kind}`}
      role="note"
      aria-label={meta.label}
    >
      <header className="coach-md__card-head">
        <span className="coach-md__card-mark" aria-hidden>
          {meta.mark}
        </span>
        <span className="coach-md__card-label">{meta.label}</span>
      </header>
      <div className="coach-md__card-body">{children}</div>
    </aside>
  );
}

function componentsForLocale(locale: AppLocale): Components {
  return {
    p({ children }) {
      return <p className="coach-md__p">{children}</p>;
    },
    h1({ children }) {
      return <h2 className="coach-md__h">{children}</h2>;
    },
    h2({ children }) {
      return <h2 className="coach-md__h">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="coach-md__h coach-md__h--sub">{children}</h3>;
    },
    h4({ children }) {
      return <h3 className="coach-md__h coach-md__h--sub">{children}</h3>;
    },
    strong({ children }) {
      return <strong className="coach-md__mark">{children}</strong>;
    },
    em({ children }) {
      return <em className="coach-md__em">{children}</em>;
    },
    ul({ children }) {
      return <ul className="coach-md__ul">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="coach-md__ol">{children}</ol>;
    },
    li({ children }) {
      return <li className="coach-md__li">{children}</li>;
    },
    blockquote({ children }) {
      const text = textFromChildren(children);
      const hit = matchTeachingLine(text, locale);
      if (hit) {
        return (
          <TeachingCard meta={hit.meta}>
            <p>{hit.body || text}</p>
          </TeachingCard>
        );
      }
      return <blockquote className="coach-md__quote">{children}</blockquote>;
    },
    a({ href, children }) {
      if (!href) return <span>{children}</span>;
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="coach-md__a">
          {children}
        </a>
      );
    },
    code({ className, children }) {
      const isBlock = Boolean(className?.includes('language-') || String(children).includes('\n'));
      if (isBlock) {
        return <code className="coach-md__code-block">{children}</code>;
      }
      return <code className="coach-md__code">{children}</code>;
    },
    pre({ children }) {
      return <pre className="coach-md__pre">{children}</pre>;
    },
    hr() {
      return <hr className="coach-md__hr" />;
    },
  };
}

export function CoachMarkdown({
  content,
  animate = false,
}: {
  content: string;
  /** Section stagger only for freshly appended assistant replies. */
  animate?: boolean;
}) {
  const { locale } = useI18n();
  const source = prepareCoachReading(content, locale);
  const components = useMemo(() => componentsForLocale(locale), [locale]);
  return (
    <div className={`coach-md${animate ? ' coach-md--reveal' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
