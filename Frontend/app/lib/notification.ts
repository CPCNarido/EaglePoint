// Shared notification formatting utilities
// Returns a structured notification object: { title, body, type }
export type NotificationType = 'success' | 'bay' | 'info';

export interface NotificationInput {
  bay?: number;
  message?: string;
  when?: number;
  // allow callers to pass an explicit title if available
  title?: string;
  // threshold indicator: t10 (10m), t5 (5m), t0 (expired)
  threshold?: 't10' | 't5' | 't0';
}

export interface BuiltNotification {
  title: string;
  body: string;
  type: NotificationType;
  // UI hints
  icon?: string;
  severity?: 'low' | 'medium' | 'high';
}

/**
 * Build a notification display object from a lightweight notification input and an optional remaining-times map.
 * - If remainingMap has a positive ms for the bay, the body will show a dynamic "Mm Ss remaining" string.
 * - The `preferredType` or presence of `bay` will influence the returned `type`.
 * - `defaultTitle` and `defaultMessage` are used as fallbacks.
 */
export function buildNotification(
  notification: NotificationInput | null | undefined,
  remainingMap?: Record<number, number> | null,
  defaultMessage = '',
  opts?: { defaultTitle?: string; preferredType?: NotificationType; preferredSeverity?: 'low' | 'medium' | 'high' }
): BuiltNotification {
  try {
    const titleFromInput = notification?.title;
    const bay = notification?.bay;

    // compute body: prioritize threshold-specific formatting if provided
    let body = '';
    const thresh = notification?.threshold;
    if (bay != null && thresh && remainingMap && typeof remainingMap[bay] === 'number') {
      const ms = remainingMap[bay];
      const mins = Math.max(0, Math.ceil(ms / (1000 * 60)));
      if (thresh === 't10' || thresh === 't5') {
        // match requested format: "Bay 3 has 10mins Remaining"
        body = `Bay ${bay} has ${mins}mins Remaining`;
      } else if (thresh === 't0') {
        body = `Bay ${bay} time is up`;
      }
    }

    // fallback to dynamic remaining time when no threshold flag provided
    if (!body && bay != null && remainingMap && typeof remainingMap[bay] === 'number') {
      const ms = remainingMap[bay];
      if (ms > 0) {
        const m = Math.floor(ms / (1000 * 60));
        const s = Math.floor((ms % (1000 * 60)) / 1000);
        body = `Bay ${bay} — ${m}m ${s}s remaining`;
      }
    }

    // if no dynamic remaining time set the message if provided
    if ((!body || body.length === 0) && notification?.message) body = String(notification.message);

    // final fallback
    if (!body) body = defaultMessage ?? '';

    // determine type
    let type: NotificationType = 'info';
    if (opts && opts.preferredType) type = opts.preferredType;
    else if (bay != null) type = 'bay';
    else {
      const low = (body || '').toLowerCase();
      if (low.includes('saved') || low.includes('success') || low.includes('successfully')) type = 'success';
      else type = 'info';
    }

    // determine title
    let title = titleFromInput ?? opts?.defaultTitle ?? '';
    if (!title) {
      if (type === 'bay') title = 'Bay Notification';
      else if (type === 'success') title = 'Success';
      else title = 'Notification';
    }

    // infer UI hints
    let icon: string | undefined = undefined;
    let severity: 'low' | 'medium' | 'high' = 'low';
    switch (type) {
      case 'success':
        icon = 'check-circle';
        severity = 'low';
        break;
      case 'bay':
        icon = 'schedule';
        severity = 'medium';
        break;
      case 'info':
      default:
        icon = 'info';
        severity = 'low';
    }

    // allow threshold to influence severity (t10->low, t5->medium, t0->high)
    if (notification?.threshold) {
      if (notification.threshold === 't10') severity = 'low';
      else if (notification.threshold === 't5') severity = 'medium';
      else if (notification.threshold === 't0') severity = 'high';
    }

    // allow callers to override inferred severity
    if (opts && opts.preferredSeverity) severity = opts.preferredSeverity;

    // If this is a generic 'info' notification (a simple saved/notification message),
    // only show the title — the UI should not display a body for such notifications
    // UNLESS a fallback/default message was explicitly provided by the caller.
    if (type === 'info' && !defaultMessage) {
      body = '';
    }

    return { title, body, type, icon, severity };
  } catch (_e) { void _e; return { title: opts?.defaultTitle ?? 'Notification', body: defaultMessage ?? '', type: opts?.preferredType ?? 'info', icon: 'info', severity: opts?.preferredSeverity ?? 'low' };
  }
}

export default buildNotification;
