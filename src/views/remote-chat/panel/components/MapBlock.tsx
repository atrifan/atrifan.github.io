import { useRef, useEffect } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { normalizeMapSpec } from "./normalizeMapSpec"

// Interactive map rendering via Leaflet + OpenStreetMap raster tiles (keyless).
//
// Two modes:
//  - interactive=false (default, inline chat bubble): a static preview. Dragging,
//    scroll/double-click zoom and zoom controls are DISABLED so a click bubbles up
//    to ExpandableViz, which opens the lightbox. Matches charts' "click to expand".
//  - interactive=true (lightbox): full pan + zoom (drag, wheel, zoom buttons).
//
// We use L.circleMarker (not L.marker) for pins so we don't depend on Leaflet's
// default marker image assets, whose URLs break under bundlers and can't be loaded
// as arbitrary filesystem paths inside a Chrome-extension page anyway.

interface Props {
  spec: unknown
  interactive?: boolean
}

const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function MapBlock({ spec, interactive = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const norm = normalizeMapSpec(spec)

    const map = L.map(el, {
      center: norm.center,
      zoom: norm.zoom,
      // Inline preview: lock interaction so the click reaches ExpandableViz.
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      zoomControl: interactive,
      attributionControl: true,
    })
    mapRef.current = map

    L.tileLayer(OSM_TILES, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map)

    const bounds = L.latLngBounds([])

    // Zones first (so pins draw on top).
    for (const zone of norm.zones) {
      const style = {
        color: zone.color,
        fillColor: zone.fillColor,
        fillOpacity: zone.fillOpacity,
        weight: 2,
      }
      let layer: L.Layer | null = null
      if (zone.polygon) {
        const poly = L.polygon(zone.polygon as L.LatLngExpression[], style)
        bounds.extend(poly.getBounds())
        layer = poly
      } else if (zone.geojson != null) {
        try {
          const gj = L.geoJSON(zone.geojson as GeoJSON.GeoJsonObject, { style: () => style })
          const b = gj.getBounds()
          if (b.isValid()) bounds.extend(b)
          layer = gj
        } catch {
          layer = null
        }
      }
      if (layer) {
        if (zone.label) layer.bindTooltip(zone.label)
        layer.addTo(map)
      }
    }

    // Markers (colored circle markers, no asset dependency).
    for (const m of norm.markers) {
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: m.color,
        fillOpacity: 1,
      })
      if (m.label) marker.bindTooltip(m.label)
      marker.addTo(map)
      bounds.extend([m.lat, m.lng])
    }

    // Fit to content: prefer an explicit bbox, else the union of drawn layers.
    if (norm.bbox) {
      map.fitBounds([
        [norm.bbox[0], norm.bbox[1]],
        [norm.bbox[2], norm.bbox[3]],
      ])
    } else if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] })
    }

    // Leaflet needs a size recalc once it's laid out (esp. in the lightbox).
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    // Also kick once after mount in case ResizeObserver doesn't fire immediately.
    const t = setTimeout(() => map.invalidateSize(), 0)

    return () => {
      clearTimeout(t)
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [spec, interactive])

  return <div className={`map-block${interactive ? " map-block-interactive" : ""}`} ref={containerRef} />
}
