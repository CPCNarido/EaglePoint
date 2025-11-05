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
