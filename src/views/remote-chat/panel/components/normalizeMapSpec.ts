// Pure normalizer for map render specs (the ```map``` fence body and the
// RenderBlock {kind:"map"} payload). Mirrors parseChartConfig.ts: tolerant of
// model-authored sloppiness, never throws, returns a clean spec the Leaflet
// renderer can consume directly. NO Leaflet import here — kept pure so it is
// unit-testable in jsdom without a real map.

export interface NormMarker {
  lat: number
  lng: number
  label?: string
  color: string
}

export interface NormZone {
  // Leaflet-ready latlng polygon ([[lat,lng],...]) — when derived from a polygon
  // or from GeoJSON we convert to this so the renderer has one shape to handle…
  polygon?: Array<[number, number]>
  // …but raw GeoJSON is also passed through (renderer uses L.geoJSON for it).
  geojson?: unknown
  color: string
  fillColor: string
  fillOpacity: number
  label?: string
}

export interface NormMapSpec {
  title?: string
  center: [number, number]
  zoom: number
  bbox?: [number, number, number, number] // [south, west, north, east]
  markers: NormMarker[]
  zones: NormZone[]
  // True when we had no usable coordinates at all and fell back to the world view.
  empty: boolean
}

export interface RawMapSpec {
  title?: string
  center?: unknown
  zoom?: unknown
  bbox?: unknown
  markers?: unknown
  zones?: unknown
}

const DEFAULT_COLOR = "#1e88e5"
const WORLD_CENTER: [number, number] = [20, 0]
const WORLD_ZOOM = 2

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : NaN
}

function validLat(n: number): boolean {
  return Number.isFinite(n) && n >= -90 && n <= 90
}
function validLng(n: number): boolean {
  return Number.isFinite(n) && n >= -180 && n <= 180
}

function asLatLng(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const lat = toNum(v[0])
  const lng = toNum(v[1])
  if (!validLat(lat) || !validLng(lng)) return null
  return [lat, lng]
}

function color(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback
}

/** Parse a possibly-string spec (```map fence body) into an object, tolerantly. */
export function parseMapSpec(input: unknown): RawMapSpec | null {
  if (input && typeof input === "object") return input as RawMapSpec
  if (typeof input !== "string") return null
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === "object") return parsed as RawMapSpec
  } catch {
    /* not JSON */
  }
  return null
}

/**
 * Normalize a raw map spec into a renderer-ready spec. Always returns a usable
 * object (never null): with no valid coordinates it falls back to a world view and
 * sets `empty: true`.
 */
export function normalizeMapSpec(input: unknown): NormMapSpec {
  const raw = parseMapSpec(input) ?? {}

  // Markers
  const markers: NormMarker[] = []
  if (Array.isArray(raw.markers)) {
    for (const m of raw.markers) {
      if (!m || typeof m !== "object") continue
      const mm = m as Record<string, unknown>
      const lat = toNum(mm.lat)
      const lng = toNum(mm.lng ?? mm.lon)
      if (!validLat(lat) || !validLng(lng)) continue
      markers.push({
        lat,
        lng,
        label: typeof mm.label === "string" ? mm.label : undefined,
        color: color(mm.color, "#e53935"),
      })
    }
  }

  // Zones — accept a latlng polygon and/or raw GeoJSON.
  const zones: NormZone[] = []
  if (Array.isArray(raw.zones)) {
    for (const z of raw.zones) {
      if (!z || typeof z !== "object") continue
      const zz = z as Record<string, unknown>
      let polygon: Array<[number, number]> | undefined
      if (Array.isArray(zz.polygon)) {
        const pts: Array<[number, number]> = []
        for (const p of zz.polygon) {
          const ll = asLatLng(p)
          if (ll) pts.push(ll)
        }
        if (pts.length >= 3) polygon = pts
      }
      const hasGeo = zz.geojson != null
      if (!polygon && !hasGeo) continue
      const c = color(zz.color, DEFAULT_COLOR)
      const fo = toNum(zz.fillOpacity)
      zones.push({
        polygon,
        geojson: hasGeo ? zz.geojson : undefined,
        color: c,
        fillColor: color(zz.fillColor, c),
        fillOpacity: Number.isFinite(fo) ? Math.min(Math.max(fo, 0), 1) : 0.3,
        label: typeof zz.label === "string" ? zz.label : undefined,
      })
    }
  }

  // bbox [south, west, north, east]
  let bbox: [number, number, number, number] | undefined
  if (Array.isArray(raw.bbox) && raw.bbox.length === 4) {
    const s = toNum(raw.bbox[0])
    const w = toNum(raw.bbox[1])
    const n = toNum(raw.bbox[2])
    const e = toNum(raw.bbox[3])
    if (validLat(s) && validLng(w) && validLat(n) && validLng(e)) {
      bbox = [Math.min(s, n), Math.min(w, e), Math.max(s, n), Math.max(w, e)]
    }
  }

  // Center: explicit → bbox center → first marker → first polygon point → world.
  let center = asLatLng(raw.center)
  if (!center && bbox) center = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
  if (!center && markers.length) center = [markers[0].lat, markers[0].lng]
  if (!center && zones.length && zones[0].polygon) center = zones[0].polygon[0]

  const empty = !center && !bbox && markers.length === 0 && zones.length === 0
  if (!center) center = WORLD_CENTER

  // Zoom: explicit and sane, else default. When a bbox exists the renderer fits to
  // it (zoom is just the fallback / single-point zoom).
  let zoom = WORLD_ZOOM
  const z = toNum(raw.zoom)
  if (isNum(z) && z >= 1 && z <= 19) zoom = z
  else if (bbox || markers.length || zones.length) zoom = 13

  return { title: raw.title, center, zoom, bbox, markers, zones, empty }
}
