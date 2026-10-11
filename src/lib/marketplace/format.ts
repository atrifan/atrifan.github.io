/** Display text for the catalog cards and detail page. Pure. */

function compact(n: number): string {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1000) return `${trim(n / 1000)}k`;
  return String(n);
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

export function formatInstalls(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `${compact(n)} ${n === 1 ? 'install' : 'installs'}`;
}

export function ratingValue(avg: number): string {
  return avg.toFixed(1);
}

export function ratingCountText(count: number): string {
  if (count <= 0) return 'No ratings yet';
  return `${count} ${count === 1 ? 'rating' : 'ratings'}`;
}

export function ratingAriaLabel(avg: number | null, count: number): string {
  if (avg === null || count <= 0) return 'No ratings yet';
  return `Rated ${ratingValue(avg)} out of 5 from ${ratingCountText(count)}`;
}
