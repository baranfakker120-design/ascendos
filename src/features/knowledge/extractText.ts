/**
 * Textextraktion im BROWSER (ADR-029).
 *
 * Warum clientseitig und nicht in der Edge Function:
 * - Die Datei selbst wird nie hochgeladen, nur der extrahierte Text. Es
 *   braucht keinen Storage-Bucket, keine neue RLS-Policy und keine
 *   Änderung an `ingest-knowledge`.
 * - PDF-Parsing ist speicherhungrig. Im Browser des Admins ist das
 *   unkritisch, in einer Edge Function mit harter Laufzeitgrenze nicht.
 *
 * Die Parser werden per dynamischem Import geladen. Dadurch kostet die
 * App-Startzeit nichts, und ein Parser-Fehler betrifft nur die eine
 * Datei — TXT und Markdown funktionieren weiter.
 */

export type SupportedKind = 'pdf' | 'docx' | 'text';

export interface ExtractResult {
  text: string;
  /** Bei PDF die Seitenzahl — nützlich, um leere Scans zu erkennen. */
  pages?: number;
}

export class ExtractError extends Error {
  constructor(
    message: string,
    readonly reason: 'unsupported' | 'empty' | 'parser' | 'encrypted'
  ) {
    super(message);
    this.name = 'ExtractError';
  }
}

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv'];

export function detectKind(file: File): SupportedKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'text';
  // Reiner MIME-Check als Rückfallebene für Dateien ohne Endung.
  if (file.type.startsWith('text/')) return 'text';
  return null;
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Normalisiert extrahierten Text.
 *
 * PDF-Extraktion erzeugt reichlich Layout-Müll: Zeilenumbrüche mitten im
 * Satz, Trennstriche am Zeilenende, dreifache Leerzeilen. Das landet sonst
 * unverändert in den Chunks und verschlechtert die Einbettung, weil der
 * Vektor Formatierung statt Bedeutung abbildet.
 */
export function normalizeText(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      // Silbentrennung am Zeilenende zusammenziehen: "Ver-\ntrieb" -> "Vertrieb"
      .replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
      // Einfacher Umbruch mitten im Satz -> Leerzeichen. Doppelte
      // Umbrüche (Absatzgrenzen) bleiben erhalten.
      .replace(/([^\n])\n(?!\n)/g, '$1 ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

async function extractPdf(file: File): Promise<ExtractResult> {
  // Legacy pdfjs build: iOS/Safari needs Promise.withResolvers polyfill
  // shipped in pdfjs-dist/legacy (modern build throws TypeError on WebKit).
  let pdfjs: typeof import('pdfjs-dist');
  try {
    const { loadPdfjsLegacy } = await import('@shared/pdf/pdfjsLegacy');
    pdfjs = await loadPdfjsLegacy();
  } catch (e) {
    throw new ExtractError(
      `PDF-Parser konnte nicht geladen werden: ${e instanceof Error ? e.message : 'unbekannt'}`,
      'parser'
    );
  }

  const buffer = await file.arrayBuffer();
  // getDocument() erzeugt nur den Ladeauftrag und liest noch nichts.
  // Fehler im Dokument treten erst beim Auflösen von .promise auf,
  // deshalb steht nur das im try-Block.
  //
  // Der Auftrag wird bewusst hier gehalten: destroy() liegt auf
  // PDFDocumentLoadingTask, nicht auf PDFDocumentProxy. Auf dem Proxy
  // war es früher ein Alias und ist entfernt. Der Proxy hat nur
  // cleanup(), und das gibt den Worker nicht frei.
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/password/i.test(msg)) {
      throw new ExtractError('PDF ist passwortgeschützt.', 'encrypted');
    }
    throw new ExtractError(`PDF konnte nicht gelesen werden: ${msg}`, 'parser');
  }

  try {
    const parts: string[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const items = Array.isArray(content?.items) ? content.items : [];
      parts.push(items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    const pages = doc.numPages;

    const text = normalizeText(parts.join('\n\n'));
    if (text.length < 40) {
      // Typischer Fall: ein Scan ohne OCR-Textlayer. Ohne diese Prüfung
      // entstünde ein leeres Dokument, das der Coach später als Wissen
      // behandelt.
      throw new ExtractError(
        `Kein Text gefunden (${pages} Seiten). Vermutlich ein Scan ohne Texterkennung — ` +
          'bitte vorher per OCR durchsuchbar machen.',
        'empty'
      );
    }
    return { text, pages };
  } finally {
    await loadingTask.destroy();
  }
}

async function extractDocx(file: File): Promise<ExtractResult> {
  let mammoth: typeof import('mammoth');
  try {
    mammoth = await import('mammoth');
  } catch (e) {
    throw new ExtractError(
      `Word-Parser konnte nicht geladen werden: ${e instanceof Error ? e.message : 'unbekannt'}`,
      'parser'
    );
  }
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = normalizeText(result.value ?? '');
  if (text.length < 40) throw new ExtractError('Dokument enthält keinen Text.', 'empty');
  return { text };
}

async function extractPlainText(file: File): Promise<ExtractResult> {
  const raw = await file.text();
  const text = normalizeText(raw);
  if (text.length < 40) throw new ExtractError('Datei enthält keinen Text.', 'empty');
  return { text };
}

/** Hauptzugang. Wirft ExtractError mit maschinenlesbarem `reason`. */
export async function extractText(file: File): Promise<ExtractResult> {
  const kind = detectKind(file);
  if (!kind) {
    throw new ExtractError(
      `Format nicht unterstützt (${file.name}). Möglich sind PDF, DOCX, TXT und Markdown.`,
      'unsupported'
    );
  }
  if (kind === 'pdf') return extractPdf(file);
  if (kind === 'docx') return extractDocx(file);
  return extractPlainText(file);
}
