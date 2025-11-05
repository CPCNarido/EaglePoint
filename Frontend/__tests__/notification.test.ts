import { buildNotification } from '../app/lib/notification';

describe('buildNotification', () => {
  test('returns bay type and dynamic remaining when remainingMap has positive ms', () => {
    const notif = { bay: 3 };
    const remaining = { 3: 5 * 60 * 1000 + 2000 }; // 5m 2s
    const built = buildNotification(notif as any, remaining, '');
    expect(built.type).toBe('bay');
    expect(built.body).toMatch(/Bay 3/);
    expect(built.body).toMatch(/5m/);
    expect(built.title).toBe('Bay Notification');
    expect(built.icon).toBeDefined();
    expect(built.severity).toBe('medium');
  });

  test('formats thresholded 10min and 5min messages and maps severities', () => {
    const notif10 = { bay: 3, threshold: 't10' } as any;
    const notif5 = { bay: 3, threshold: 't5' } as any;
    const notif0 = { bay: 3, threshold: 't0' } as any;
    const remaining = { 3: 10 * 60 * 1000 };
    const b10 = buildNotification(notif10, remaining, '');
    expect(b10.body).toBe('Bay 3 has 10mins Remaining');
    expect(b10.severity).toBe('low');

    const remaining5 = { 3: 5 * 60 * 1000 };
    const b5 = buildNotification(notif5, remaining5, '');
    expect(b5.body).toBe('Bay 3 has 5mins Remaining');
    expect(b5.severity).toBe('medium');

    const remaining0 = { 3: 0 };
    const b0 = buildNotification(notif0, remaining0, '');
    expect(b0.body).toBe('Bay 3 time is up');
    expect(['low', 'medium', 'high']).toContain(b0.severity);
  });

  test('falls back to message and infers success type when message contains "success"', () => {
    const notif = { message: 'Changes have been successfully made' };
    const built = buildNotification(notif as any, null, '');
    expect(built.body).toBe('Changes have been successfully made');
    expect(built.type).toBe('success');
    expect(built.title).toBe('Success');
    expect(built.icon).toBeDefined();
    expect(built.severity).toBe('low');
  });

  test('uses provided defaultTitle and defaultMessage when nothing else available', () => {
    const built = buildNotification(null, null, 'Fallback body', { defaultTitle: 'My Title' });
    expect(built.title).toBe('My Title');
    expect(built.body).toBe('Fallback body');
    expect(['success', 'info', 'bay']).toContain(built.type);
    expect(built.icon).toBeDefined();
    expect(['low', 'medium', 'high']).toContain(built.severity);
  });
});
