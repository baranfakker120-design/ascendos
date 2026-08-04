/** True only when Vite is started with VITE_PRESENTATION_CAPTURE=1. */
export function isPresentationCapture(): boolean {
  return import.meta.env.VITE_PRESENTATION_CAPTURE === '1';
}
