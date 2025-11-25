export type UploadResult = {
  uploadedUrl?: string | null;
  previewUri?: string | null;
  error?: string | null;
};

// Normalize and attempt to upload a provided file/asset. Returns an object
// describing the upload result and a preview URL to display locally if
// upload wasn't performed or failed.
export async function processFileForUpload(file: any, onSealUpload?: (file: any) => Promise<string | null> | null): Promise<UploadResult> {
  if (!file) return { uploadedUrl: null, previewUri: null };

  // If an upload handler is provided, try to produce a payload that the
  // handler can accept (File on web, or { uri, blob, name, type } on
  // native) and call it. If it returns a URL, consider upload successful.
  if (onSealUpload) {
    try {
      // Web File (when running in a browser-like env)
      if (typeof File !== 'undefined' && file instanceof File) {
        const uploaded = await onSealUpload(file);
        if (uploaded) return { uploadedUrl: uploaded };
        return { uploadedUrl: null, error: 'Upload did not return a URL' };
      }

      // Native-like asset with uri property: fetch blob then try to construct a
      // File when possible, otherwise pass an object with blob and metadata.
      if (file && typeof file.uri === 'string') {
    try {
          const resp = await fetch(file.uri);
          const blob = await resp.blob();
          const name = file.fileName || file.name || 'seal.jpg';
          const type = file.type || blob.type || 'image/jpeg';

          let payload: any = null;
          if (typeof File !== 'undefined') {
            try {
              payload = new File([blob], name, { type });
            } catch (_e) { void _e; payload = { uri: file.uri, blob, name, type }; }
          } else {
            payload = { uri: file.uri, blob, name, type };
          }

          const uploaded = await onSealUpload(payload);
          if (uploaded) return { uploadedUrl: uploaded };
          return { uploadedUrl: null, error: 'Upload did not return a URL' };
        } catch (err: any) { const _err = err as any; return { uploadedUrl: null, error: _err?.message ? String(_err.message) : 'Fetch failed' }; }
      }
    } catch (err: any) { const _err = err as any; return { uploadedUrl: null, error: _err?.message ? String(_err.message) : 'Upload failed' }; }
  }

  // No upload handler or upload failed — produce a local preview where
  // possible (browser blob URL or native uri) to display the selected image.
  if (typeof window !== 'undefined' && typeof File !== 'undefined' && file instanceof File) {
    try {
      const url = (window as any).URL.createObjectURL(file);
      return { uploadedUrl: null, previewUri: url };
    } catch (_e) { void _e; return { uploadedUrl: null, previewUri: null, error: 'Failed to create preview' }; }
  }

  if (file && typeof file.uri === 'string') {
    return { uploadedUrl: null, previewUri: file.uri };
  }

  return { uploadedUrl: null, previewUri: null };
}
