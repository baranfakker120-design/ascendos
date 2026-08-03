import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';
import './coach-markdown.css';

const URL_PATTERN = /(https?:\/\/[^\s]+[^\s.,;:!?)\]"'])/g;

function textFromChildren(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textFromChildren).join('');
  if (typeof children === 'object' && 'props' in children) {
    return textFromChildren((children as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

type CalloutKind = 'action' | 'tip' | 'important' | 'quote';

function detectCallout(text: string): CalloutKind {
  const t = text.trim();
  if (/^(nächster|naechster)\s+schritt\b/i.test(t)) return 'action';
  if (/^(tipp|hinweis|pro tip)\b/i.test(t)) return 'tip';
  if (/^(wichtig|achtung|merke)\b/i.test(t)) return 'important';
  return 'quote';
}

function calloutLabel(kind: CalloutKind): string | null {
  if (kind === 'action') return 'Nächster Schritt';
  if (kind === 'tip') return 'Tipp';
  if (kind === 'important') return 'Wichtig';
  return null;
}

/** Drop the leading label from blockquote body so the chrome label isn't doubled. */
function CalloutBody({ kind, children }: { kind: CalloutKind; children: ReactNode }) {
  const text = textFromChildren(children).trim();
  const stripped = (() => {
    if (kind === 'action') {
      return text.replace(/^(nächster|naechster)\s+schritt\s*[:—–-]?\s*/i, '').trim();
    }
    if (kind === 'tip') {
      return text.replace(/^(tipp|hinweis|pro tip)\s*[:—–-]?\s*/i, '').trim();
    }
    if (kind === 'important') {
      return text.replace(/^(wichtig|achtung|merke)\s*[:—–-]?\s*/i, '').trim();
    }
    return text;
  })();

  // If stripping only removed the label, render plain text to avoid duplicate chrome.
  if (stripped && stripped !== text) {
    return <p>{stripped}</p>;
  }
  return <>{children}</>;
}

function Callout({ kind, children }: { kind: CalloutKind; children: ReactNode }) {
  const label = calloutLabel(kind);
  return (
    <aside className={`coach-md__callout coach-md__callout--${kind}`} role="note">
      {label ? <span className="coach-md__callout-label">{label}</span> : null}
      <div className="coach-md__callout-body">
        <CalloutBody kind={kind}>{children}</CalloutBody>
      </div>
    </aside>
  );
}

const components: Components = {
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
    return <strong className="coach-md__strong">{children}</strong>;
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
    const kind = detectCallout(text);
    if (kind !== 'quote') {
      return <Callout kind={kind}>{children}</Callout>;
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

/**
 * Autolink plain URLs that models emit without markdown link syntax.
 */
function autolinkPlainUrls(source: string): string {
  return source.replace(URL_PATTERN, (url, _g, offset, full) => {
    const before = full.slice(Math.max(0, offset - 2), offset);
    if (before.endsWith('](') || before.endsWith('(')) return url;
    return `<${url}>`;
  });
}

/**
 * Promote callout lines into blockquotes so they render as premium cards.
 * Works for both fresh Markdown and older plain-text coach replies.
 */
export function promoteCalloutLines(source: string): string {
  return source.replace(
    /^(?:[-*]\s+)?(?:\*\*)?(Nächster Schritt|Naechster Schritt|Tipp|Hinweis|Wichtig|Achtung)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+?)(?:\*\*)?\s*$/gim,
    (_m, label: string, rest: string) => `> **${label}:** ${rest.trim()}`,
  );
}

export function prepareCoachMarkdown(content: string): string {
  return autolinkPlainUrls(promoteCalloutLines(content.trim()));
}

export function CoachMarkdown({ content }: { content: string }) {
  const source = prepareCoachMarkdown(content);
  return (
    <div className="coach-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
