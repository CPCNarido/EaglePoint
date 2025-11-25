export type ExportParams = {
  baseUrl: string;
  reportType?: string;
  timeRange?: string;
  sessionType?: string;
  bay?: string | number | 'All';
  format?: 'csv' | 'pdf';
};

export async function exportReport(params: ExportParams): Promise<{ ok: boolean; error?: string }> {
  const { baseUrl, reportType = 'full', timeRange = '', sessionType = '', bay = 'All', format = 'csv' } = params;
  try {
    const fileModeUrl = `${baseUrl}/api/admin/reports/export?file=1${format === 'pdf' ? '&format=pdf' : ''}`;
    const body = { reportType, timeRange, sessionType, bay };
    const res = await fetch(fileModeUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

    const contentType = res.headers.get('Content-Type') || '';
    // handle PDF binary responses
    if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
      try {
        let blob: Blob | null = null;
        if (typeof res.arrayBuffer === 'function') {
          const ab = await res.arrayBuffer();
          blob = new Blob([ab], { type: contentType || 'application/pdf' });
        }
        if (!blob) blob = await res.blob().catch(() => null);
        if (blob && typeof window !== 'undefined' && (window as any).URL) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          (a as any).href = url;
          a.download = `report-${reportType}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return { ok: true };
        }
      } catch (_e) { void _e; /* ignore and fallthrough to JSON wrapper */ }
    }
    if (contentType.includes('text/csv') || contentType.includes('application/csv')) {
      // Try to get an ArrayBuffer first (works in most fetch implementations), then build a Blob from it.
      let blob: Blob | null = null;
      try {
        if (typeof res.arrayBuffer === 'function') {
          const ab = await res.arrayBuffer();
          blob = new Blob([ab], { type: contentType || 'text/csv' });
        }
      } catch (_e) { void _e; /* arrayBuffer may not be available in some environments; fallback to blob() */
        blob = null;
      }

      if (!blob) {
        try {
          blob = await res.blob();
        } catch (_e) { void _e; // last resort: try text()
          try {
            const txt = await (res as any).text();
            
            console.log('Export CSV (text fallback):', String(txt).slice(0, 200));
            return { ok: true };
          } catch (_e2) { void _e2; return { ok: false, error: 'Failed reading CSV response' }; }
        }
      }

      try {
        if (typeof window !== 'undefined' && (window as any).URL && blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          (a as any).href = url;
          a.download = `report-${reportType}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          return { ok: true };
        }
      } catch (_e) { void _e; /* ignore and fallback to logging */ }

      // fallback: try to read text from blob if available
      try {
        // @ts-ignore
        if (typeof (blob as any).text === 'function') {
          // @ts-ignore
          const txt = await (blob as any).text();
           
          console.log('Export CSV:', String(txt).slice(0, 200));
          return { ok: true };
        }
      } catch (_e) { void _e; /* ignore */ }
      return { ok: true };
    }

    // fallback: JSON wrapper
    const data = await res.json().catch(() => null);
    const csv = data?.csv;
    if (!csv && !(data && (data.pdf || data.ok))) return { ok: false, error: 'No CSV/PDF returned' };
    // If server returned a PDF in JSON wrapper as base64 (rare), handle it
    if (data?.pdf && typeof data.pdf === 'string' && typeof window !== 'undefined') {
      try {
        const b = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
        const blob = new Blob([b], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        (a as any).href = url;
        a.download = `report-${reportType}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return { ok: true };
      } catch (e) { void e;
        // continue to csv fallback
      }
    }
    if (!csv) return { ok: false, error: 'No CSV returned' };
    try {
      if (typeof window !== 'undefined' && (window as any).URL) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        (a as any).href = url;
        a.download = `report-${reportType}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        return { ok: true };
      }
      } catch (_e) { void _e; /* ignore */ }
    // fallback: log
     
    console.log('Export CSV (fallback):', csv.slice(0, 200));
    return { ok: true };
  } catch (_e: any) {
    void _e;
    return { ok: false, error: String(_e) };
  }
}

// expo-router treats files in `app/` as routes and expects a default export
// React component. This module is a utility, not a page. Provide a small,
// harmless default export so the router doesn't warn during dev bundling.
export default function _ReportExportPlaceholder() {
  return null;
}
