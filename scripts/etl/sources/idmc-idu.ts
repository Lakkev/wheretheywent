/**
 * IDMC Internal Displacement Updates (near-real-time, last 180 days) via Helix API (§A.5).
 * 302 → S3 presigned (no CORS) → build-time only. `standard_popup_text` contains raw HTML → sanitized
 * to plain text here; the front end never renders it as HTML.
 */
import { IDMC } from '../config.ts';
import { fetchJson } from '../lib/http.ts';
import { sha256 } from '../lib/atomic.ts';
import type { IduEvent } from '../../../src/lib/types.ts';
import type { CodeRegistry } from '../lib/codes.ts';
import { log } from '../lib/log.ts';

interface IduRaw {
  id: number;
  country: string;
  iso3: string;
  latitude: number | null;
  longitude: number | null;
  displacement_type: string | null;
  figure: number | null;
  displacement_date: string;
  displacement_start_date?: string;
  displacement_end_date?: string;
  standard_popup_text?: string;
  standard_info_text?: string;
  sources?: string;
  source_url?: string;
  created_at: string;
  role?: string;
  locations_name?: string;
}

/** Strip tags, decode the few entities IDMC uses, collapse whitespace. Output is plain text. */
export function sanitizeText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function safeUrl(u: string | undefined): string | null {
  if (!u) return null;
  const s = u.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

export async function fetchIdu(
  reg: CodeRegistry,
): Promise<{ events: IduEvent[]; hash: string; url: string; raw: number }> {
  const raw = await fetchJson<IduRaw[]>(IDMC.iduUrl, { noCache: true });
  if (!Array.isArray(raw)) throw new Error('idu: unexpected payload');
  const events: IduEvent[] = [];
  for (const r of raw) {
    // IDMC may publish multiple "roles" per event; keep the recommended figure rows only
    if (r.role && r.role !== 'Recommended figure') continue;
    const n = reg.normalize(r.iso3);
    const iso3 = n.key && n.matched ? n.key : (r.iso3 ?? '').toUpperCase();
    // Dignity guard (#audit F5): conflict events are snapped to a 0.25° grid (~25 km) so the
    // published map can never serve as a locating device for a named settlement in a war zone.
    const conflict = (r.displacement_type ?? '') === 'Conflict';
    const snap = (v: number) => (conflict ? Math.round(v * 4) / 4 : Math.round(v * 1000) / 1000);
    events.push({
      id: r.id,
      iso3,
      country: r.country ?? '',
      lat: typeof r.latitude === 'number' ? snap(r.latitude) : null,
      lon: typeof r.longitude === 'number' ? snap(r.longitude) : null,
      figure: typeof r.figure === 'number' ? r.figure : null,
      type: r.displacement_type ?? 'Other',
      displacement_date: (r.displacement_date ?? '').slice(0, 10),
      created_at: r.created_at ?? '',
      text: sanitizeText(r.standard_popup_text ?? r.standard_info_text ?? '').slice(0, 500),
      url: safeUrl(r.source_url),
    });
  }
  events.sort((a, b) =>
    b.displacement_date > a.displacement_date
      ? 1
      : b.displacement_date < a.displacement_date
        ? -1
        : b.id - a.id,
  );
  const trimmed = events.slice(0, IDMC.iduMaxEvents);
  if (trimmed.length < events.length)
    log.warn(
      `idu: trimmed ${events.length - trimmed.length} oldest events (cap ${IDMC.iduMaxEvents})`,
    );
  log.info(`idu: ${raw.length} raw → ${trimmed.length} events`);
  return {
    events: trimmed,
    hash: sha256(JSON.stringify(raw.map((r) => r.id).sort())),
    url: IDMC.iduUrl,
    raw: raw.length,
  };
}
