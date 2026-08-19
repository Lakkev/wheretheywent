/** WebGL2 capability check (MapLibre GL JS v6 requires WebGL2) — §8.4. Pure DOM, no maplibre import. */
export function hasWebGL2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    // some headless/virtual contexts return a context that cannot actually render
    const ok = typeof (gl as WebGL2RenderingContext).getParameter === 'function';
    const ext = (gl as WebGL2RenderingContext).getExtension('WEBGL_lose_context');
    ext?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
