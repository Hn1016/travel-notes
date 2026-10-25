import L from 'leaflet'

export function circleIcon(color: string, label: string, selected = false): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="tp-marker${selected ? ' tp-marker--selected' : ''}" style="background:${color}">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  })
}

export const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
