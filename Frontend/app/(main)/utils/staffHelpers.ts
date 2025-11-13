// Shared staff helpers: role alias detection, active checks, and timestamp formatting
export const isServicemanRole = (role: any): boolean => {
  if (role === null || role === undefined) return false;
  try {
    const s = String(role).toLowerCase().trim();
    // Strictly detect serviceman roles only. "BallHandler" is a separate role
    // and should not be treated as a serviceman.
    return (
      s === 'serviceman' ||
      s === 'servicemen' ||
      s.includes('serviceman')
    );
  } catch (e) {
    return false;
  }
};

export const isStaffActive = (item: any): boolean => {
  if (!item) return false;
  try {
    if (item.online === true) return true;
    if (item.active === true) return true;
    if (item.is_active === true) return true;
    const st = String(item.status ?? '').toLowerCase();
    if (st === 'active') return true;
    return false;
  } catch (e) {
    return false;
  }
};

export const formatTimestamp = (ts: any): string => {
  if (!ts) return '';
  try {
    const d = (ts instanceof Date) ? ts : new Date(String(ts));
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString();
  } catch (e) {
    return String(ts);
  }
};

export default {
  isServicemanRole,
  isStaffActive,
  formatTimestamp,
};
