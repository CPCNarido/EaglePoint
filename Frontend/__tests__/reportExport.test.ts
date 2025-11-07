import { exportReport } from '../app/lib/reportExport';

describe('reportExport', () => {
  const baseUrl = 'http://localhost:3000';

  beforeEach(() => {
    // reset mocks
    (global as any).fetch = undefined;
    (global as any).URL = { createObjectURL: jest.fn(() => 'blob:url') } as any;
    // ensure a minimal document exists in node test env
    if (typeof (global as any).document === 'undefined') {
      (global as any).document = { body: { appendChild: () => null } } as any;
    }
    // ensure a window object is present (simulates browser env) so exportReport will attempt blob download path
    if (typeof (global as any).window === 'undefined') {
      (global as any).window = { URL: (global as any).URL } as any;
    } else {
      (global as any).window.URL = (global as any).URL;
    }
    // spy on document.createElement to capture anchor
    (document as any).created = [];
    (document as any).createElement = ((tag: string) => {
      const el: any = { tagName: tag.toUpperCase(), click: jest.fn(), remove: jest.fn(), setAttribute: jest.fn() };
      (document as any).created.push(el);
      return el as any;
    }) as any;
    (document as any).body.appendChild = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (global as any).fetch = undefined;
  });

  test('handles CSV file-mode response and triggers download', async () => {
    const csvText = 'a,b,c\n1,2,3';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (_: string) => 'text/csv' },
      blob: async () => new Blob([csvText], { type: 'text/csv' }),
    });

    const res = await exportReport({ baseUrl, reportType: 'full' });
    expect(res.ok).toBe(true);
    // ensure an anchor was created for download
    expect((document as any).created.length).toBeGreaterThan(0);
  });

  test('handles JSON wrapper with csv field', async () => {
    const csvText = 'x,y\n4,5';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: (_: string) => 'application/json' },
      json: async () => ({ csv: csvText }),
    });

    const res = await exportReport({ baseUrl, reportType: 'overview' });
    expect(res.ok).toBe(true);
    expect((document as any).created.length).toBeGreaterThan(0);
  });

  test('returns error when server responds non-ok', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } });
    const res = await exportReport({ baseUrl, reportType: 'full' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/HTTP 500/);
  });
});
