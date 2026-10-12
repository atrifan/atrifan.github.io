// How much of the layout viewport the on-screen keyboard covers. Chrome on Android
// honours `interactive-widget=resizes-content` (app/layout.tsx), so the layout
// shrinks and this is 0. iOS Safari keeps the layout height and only shrinks the
// visual viewport, so the composer is lifted by this many pixels.

export function keyboardInset(v: { layoutHeight: number; visualHeight: number; offsetTop: number }): number {
  const covered = v.layoutHeight - v.visualHeight - v.offsetTop;
  if (!Number.isFinite(covered)) return 0;
  return Math.max(0, Math.round(covered));
}
