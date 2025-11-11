import { processFileForUpload } from '../app/components/splashUploadUtils';

describe('splashUploadUtils', () => {
  beforeEach(() => {
    // reset globals
    (global as any).fetch = undefined;
    (global as any).URL = { createObjectURL: jest.fn(() => 'blob:url'), revokeObjectURL: jest.fn() } as any;
    if (typeof (global as any).window === 'undefined') {
      (global as any).window = { URL: (global as any).URL } as any;
    } else {
      (global as any).window.URL = (global as any).URL;
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (global as any).fetch = undefined;
  });

  test('web File with successful upload handler returns uploadedUrl', async () => {
    // Create a mock File class in the node test environment
    class MockFile {
      name: string;
      type: string | undefined;
      constructor(chunks: any, name: string, opts: any) {
        this.name = name;
        this.type = opts?.type;
      }
    }
    (global as any).File = MockFile as any;

    const file = new (global as any).File(['x'], 'seal.png', { type: 'image/png' });
    const onSealUpload = jest.fn().mockResolvedValue('https://cdn.example/seal.png');

    const res = await processFileForUpload(file, onSealUpload);
    expect(onSealUpload).toHaveBeenCalled();
    expect(res.uploadedUrl).toBe('https://cdn.example/seal.png');
    expect(res.previewUri).toBeUndefined();
  });

  test('web File fallback preview when no upload handler', async () => {
    class MockFile2 {
      name: string;
      type: string | undefined;
      constructor(chunks: any, name: string, opts: any) {
        this.name = name;
        this.type = opts?.type;
      }
    }
    (global as any).File = MockFile2 as any;
    const createSpy = jest.fn(() => 'blob:local');
    (global as any).URL.createObjectURL = createSpy;

    const file = new (global as any).File(['y'], 'seal2.png', { type: 'image/png' });
    const res = await processFileForUpload(file, undefined);
    expect(createSpy).toHaveBeenCalled();
    expect(res.previewUri).toBe('blob:local');
  });

  test('native asset fetches blob and uploads payload', async () => {
    const asset = { uri: 'file://local/image.png', fileName: 'img.png' };
    (global as any).fetch = jest.fn().mockResolvedValue({ blob: async () => ({ type: 'image/png' }) });
    const onSealUpload = jest.fn().mockResolvedValue('https://cdn.example/native.png');

    const res = await processFileForUpload(asset, onSealUpload);
    expect((global as any).fetch).toHaveBeenCalledWith('file://local/image.png');
    expect(onSealUpload).toHaveBeenCalled();
    expect(res.uploadedUrl).toBe('https://cdn.example/native.png');
  });

  test('retry flow: first upload fails then succeeds', async () => {
    class MockFile3 {
      name: string;
      type: string | undefined;
      constructor(chunks: any, name: string, opts: any) {
        this.name = name;
        this.type = opts?.type;
      }
    }
    (global as any).File = MockFile3 as any;

    const file = new (global as any).File(['x'], 'seal.png', { type: 'image/png' });
    const onSealUpload = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('https://cdn.example/retry.png');

    const first = await processFileForUpload(file, onSealUpload);
    expect(first.uploadedUrl).toBeNull();

    const second = await processFileForUpload(file, onSealUpload);
    expect(second.uploadedUrl).toBe('https://cdn.example/retry.png');
    expect(onSealUpload).toHaveBeenCalledTimes(2);
  });
});
