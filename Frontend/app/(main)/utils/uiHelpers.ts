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
  for (const label of labels) {
    switch (label) {
      case 'Available':
        if (status === 'Available') return true;
        break;
      case 'Assigned':
        if (status === 'Assigned' || status === 'Occupied') return true;
        break;
      case 'Open Time Session':
        if (status === 'Open' || status === 'OpenTime') return true;
        break;
      case 'Maintenance':
        if (status === 'Maintenance') return true;
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
