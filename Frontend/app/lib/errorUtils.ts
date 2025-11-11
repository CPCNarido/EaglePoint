// Simple helper to map technical errors to user-friendly titles and messages
export type FriendlyError = {
  type: 'credentials' | 'network' | 'server' | 'timeout' | 'other' | null;
  message: string;
  details?: any;
};

export function mapErrorToFriendly(err: any, fallback?: string): FriendlyError {
  if (!err) return { type: null, message: fallback ?? 'An unknown error occurred.' };

  // If it's a fetch/response object
  if (err?.name === 'AbortError') {
    return { type: 'timeout', message: 'The request took too long. Please try again.' };
  }

  // Common network failure
  if (String(err).toLowerCase().includes('network') || String(err).toLowerCase().includes('failed to fetch') || err?.message === 'Network request failed') {
    return { type: 'network', message: 'Unable to reach the server. Check your internet connection.' };
  }

  // HTTP-like status
  if (typeof err === 'object' && err?.status) {
    const status = Number(err.status);
    if (status === 401 || status === 403) return { type: 'credentials', message: 'Wrong username or password. Please check and try again.' };
    if (status >= 500) return { type: 'server', message: 'Server error. Please try again later.' };
    return { type: 'other', message: `Request failed (${status}). Please try again.` };
  }

  // Error string parsing
  const msg = (err?.message ?? String(err) ?? '').toString();
  if (/401|unauthorized|forbidden/i.test(msg)) return { type: 'credentials', message: 'Wrong username or password. Please check and try again.' };
  if (/timeout|timed out/i.test(msg)) return { type: 'timeout', message: 'The request took too long. Please try again.' };
  if (/network|failed to fetch/i.test(msg)) return { type: 'network', message: 'Unable to reach the server. Check your internet connection.' };
  if (/500|server error/i.test(msg)) return { type: 'server', message: 'Server error. Please try again later.' };

  // Default fallback - keep developer detail in `details` but show simple message
  return { type: 'other', message: fallback ?? 'Something went wrong. Please try again.', details: err };
}

export function friendlyMessageFromThrowable(err: any, fallback?: string) {
  return mapErrorToFriendly(err, fallback);
}
