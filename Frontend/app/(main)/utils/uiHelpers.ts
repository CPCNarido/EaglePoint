export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const getColorFromStatus = (status: string) => {
  switch (status) {
    case 'Maintenance':
      return '#C62828';
    case 'Occupied':
      return '#A3784E';
    case 'Open':
    case 'OpenTime':
      return '#BF930E';
    case 'Available':
    default:
      return '#2E7D32';
  }
};

export const legendMatchesStatus = (labels: string[], status: string | null) => {
  if (!labels || labels.length === 0 || !status) return false;
  // normalize incoming status to a canonical token for robust matching
  const normalize = (s: string | null) => {
    if (!s) return null;
    const t = String(s).trim().toLowerCase();
    if (t === 'occupied') return 'assigned';
    if (t === 'opentime' || t === 'open time' || t === 'open_time') return 'open';
    if (t === 'specialuse' || t === 'special_use') return 'reserved';
    if (t === 'available' || t === 'assigned' || t === 'open' || t === 'timed' || t === 'reserved' || t === 'maintenance') return t;
    // common fallbacks
    if (t.includes('open')) return 'open';
    if (t.includes('maint')) return 'maintenance';
    if (t.includes('reserve')) return 'reserved';
    if (t.includes('assign') || t.includes('occup')) return 'assigned';
    if (t.includes('time') || t.includes('timed')) return 'timed';
    return t;
  };

  const sNorm = normalize(status);
  if (!sNorm) return false;

  for (const label of labels) {
    const l = String(label).trim().toLowerCase();
    switch (l) {
      case 'available':
        if (sNorm === 'available') return true;
        break;
      case 'assigned':
        if (sNorm === 'assigned') return true;
        break;
      case 'open time session':
      case 'open time':
        if (sNorm === 'open') return true;
        break;
      case 'timed session':
      case 'timed':
        if (sNorm === 'timed' || sNorm === 'assigned') return true;
        break;
      case 'reserved':
        if (sNorm === 'reserved') return true;
        break;
      case 'maintenance':
        if (sNorm === 'maintenance') return true;
        break;
      default:
        break;
    }
  }
  return false;
};

// expo-router treats files under `app/` as routes and warns when a module
// doesn't export a default React component. This file provides only helpers,
// but to silence that warning we add a harmless default export. This
// component is never rendered at runtime.
export default function _UIHelpersPlaceholder() {
  return null;
}
