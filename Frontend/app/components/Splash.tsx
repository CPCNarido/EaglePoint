import React from 'react';
import { View, Text, StyleSheet, ImageBackground, ActivityIndicator, Image, Pressable, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSettings } from '../lib/SettingsProvider';
import { processFileForUpload } from './splashUploadUtils';

export default function Splash({ message = 'Loading System Data...', onClose, sealSource, noOverlayBackground = false, onSealUpload, uploadEndpoint = '/api/upload-seal' }: { message?: string; onClose?: () => void; sealSource?: any; noOverlayBackground?: boolean; onSealUpload?: (file: any) => Promise<string | null> | null; uploadEndpoint?: string }) {
  const settings = useSettings();
  const [previewSource, setPreviewSource] = React.useState<any>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = React.useState(false);
  const [lastFile, setLastFile] = React.useState<any>(null);

  // Prefer the DB-provided seal (sealUrl or sealPath). If neither is present
  // show a simple placeholder — there are only two outcomes now: DB fetch or
  // placeholder. This keeps error handling explicit and minimal for the splash.
  const effectiveSealSource = React.useMemo(() => {
    // 1) If server provided an explicit public URL, use it.
    if (settings?.sealUrl && typeof settings.sealUrl === 'string' && settings.sealUrl.trim().length > 0) {
      const su = String(settings.sealUrl).trim();
      if (su.toLowerCase().startsWith('http://') || su.toLowerCase().startsWith('https://')) {
        return { uri: su } as any;
      }
    }

    // 2) If server provided a path, attempt simple mappings to a usable URI.
    if (settings?.sealPath && typeof settings.sealPath === 'string' && settings.sealPath.trim().length > 0) {
      const sp = String(settings.sealPath).trim();
      if (sp.toLowerCase().startsWith('http://') || sp.toLowerCase().startsWith('https://')) {
        return { uri: sp } as any;
      }
      // server-root path like /uploads/<file>
      if (sp.startsWith('/uploads/')) {
        const parts = sp.split('/');
        const filename = parts.length ? parts[parts.length - 1] : '';
        if (filename) return { uri: `../../../Backend/uploads/${filename}` } as any;
      }
      // repo-relative path already returned by upload (e.g. ../../../Backend/uploads/xyz)
      if (sp.startsWith('..') || sp.startsWith('./')) {
        return { uri: sp } as any;
      }
      // absolute fs paths: extract filename
      const winPathMatch = sp.match(/^[A-Za-z]:\\.*\\([^\\\/]+)$/);
      const posixMatch = sp.match(/^(\/.*\/)?([^\\\/]+)$/);
      if (winPathMatch && winPathMatch[1]) return { uri: `../../../Backend/uploads/${winPathMatch[1]}` } as any;
      if (posixMatch && posixMatch[2]) {
        const fname = posixMatch[2];
        if (fname && fname !== '/') return { uri: `../../../Backend/uploads/${fname}` } as any;
      }
    }

    // 3) Neither DB-provided URL nor path available — show a small placeholder
    // image so the splash still renders predictably.
    return { uri: 'https://via.placeholder.com/88x88/17321d/ffffff?text=Seal' } as any;
  }, [settings?.sealUrl, settings?.sealPath]);

  // Decide which image to show: preview (newly uploaded) takes precedence,
  // otherwise show the configured/current seal.
  const displaySealSource = previewSource ?? effectiveSealSource;

  // Validate image URIs at runtime to avoid malformed request attempts. Allow
  // common relative paths (../, ./) and absolute root paths so the raw backend
  // uploads path (a relative repo path) is accepted as valid.
  const safeDisplaySealSource = React.useMemo(() => {
    try {
      const uri = displaySealSource?.uri;
      if (!uri || typeof uri !== 'string') return displaySealSource;
      const lc = uri.toLowerCase();
      if (
        lc.startsWith('http://') ||
        lc.startsWith('https://') ||
        uri.startsWith('file:') ||
        uri.startsWith('blob:') ||
        uri.startsWith('..') ||
        uri.startsWith('./') ||
        uri.startsWith('/')
      ) {
        return displaySealSource;
      }
      // If the uri is invalid, log and fall back to placeholder to avoid DNS errors
      console.warn('Splash: invalid image uri detected, falling back to placeholder', { uri });
      return { uri: 'https://via.placeholder.com/88x88/17321d/ffffff?text=Seal' } as any;
    } catch (e) {
      return displaySealSource;
    }
  }, [displaySealSource]);

  // Handle file input (web drag/drop or file picker). If an external
  // `onSealUpload` prop is provided, call it and use the returned URL on
  // success. Otherwise fall back to a local blob preview.
  const handleFile = React.useCallback(async (file: any) => {
    if (!file) return;
    setLastFile(file);
    setUploadError(null);
    setUploadSuccess(false);

    console.log('Splash: handleFile called', { file });

    // Choose upload handler: parent-provided or built-in uploader.
    const effectiveUpload = onSealUpload ?? (async (payload: any) => {
      // built-in uploader posts to the configured endpoint
      try {
        // If payload is a File (web)
        const fd = new FormData();
        if (typeof File !== 'undefined' && payload instanceof File) {
          fd.append('file', payload);
        } else if (payload?.blob) {
          fd.append('file', payload.blob, payload.name || 'seal.jpg');
        } else if (payload?.uri && typeof payload.uri === 'string') {
          // try to fetch the uri and append blob
          try {
            const r = await fetch(payload.uri);
            const b = await r.blob();
            fd.append('file', b, payload.name || 'seal.jpg');
          } catch (e) {
            console.warn('Built-in uploader failed to fetch uri payload', e);
            return null;
          }
        } else {
          return null;
        }

  // determine target endpoint: prop override or inferred admin settings seal path
  // Avoid hardcoded IP addresses; prefer current origin when available.
  const inferredBase = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'http://localhost:3000';
  const target = (uploadEndpoint && uploadEndpoint.length > 0) ? uploadEndpoint : `${inferredBase}/api/admin/settings/seal`;

  // Try to include a stored bearer token if available (saved by login flow)
  let authHeader: string | undefined = undefined;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const t = window.localStorage.getItem('authToken');
      if (t) authHeader = `Bearer ${t}`;
    }
  } catch (e) {
    // ignore
  }

  if (!authHeader) {
    try {
      // @ts-ignore - runtime import for optional AsyncStorage
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage').catch(() => null);
      const AsyncStorage = (AsyncStorageModule as any)?.default ?? AsyncStorageModule;
      if (AsyncStorage && AsyncStorage.getItem) {
        const t = await AsyncStorage.getItem('authToken').catch(() => null);
        if (t) authHeader = `Bearer ${t}`;
      }
    } catch (e) {
      // ignore
    }
  }

  const fetchOpts: any = { method: 'POST', body: fd, credentials: 'include' };
  if (authHeader) fetchOpts.headers = { Authorization: authHeader };

  const res = await fetch(target, fetchOpts);
        if (!res.ok) {
          console.warn('Built-in uploader server error', res.status);
          return null;
        }
        const json = await res.json();
        // Backend now returns the persisted repo-relative path as `path`.
        // Fall back to legacy `url` if present for compatibility.
        return json?.path ?? json?.url ?? null;
      } catch (e) {
        console.warn('Built-in uploader error', e);
        return null;
      }
    });

    setUploading(true);
    try {
      const res = await processFileForUpload(file, effectiveUpload);
      if (res.uploadedUrl) {
        setPreviewSource({ uri: res.uploadedUrl });
        setUploadSuccess(true);
        setUploadError(null);
      } else if (res.previewUri) {
        setPreviewSource({ uri: res.previewUri });
      }
      if (res.error) setUploadError(res.error);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('handleFile error', err);
      setUploadError(err?.message ? String(err.message) : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onSealUpload]);

  // Clean up blob URL when component unmounts or previewSource changes.
  React.useEffect(() => {
    return () => {
      try {
        if (previewSource && previewSource.uri && previewSource.uri.startsWith && previewSource.uri.startsWith('blob:')) {
          URL.revokeObjectURL(previewSource.uri);
        }
      } catch (e) {
        // ignore
      }
    };
  }, [previewSource]);

  const retryUpload = React.useCallback(async () => {
    if (!lastFile) return;
    // Re-run handler for last file
    await handleFile(lastFile);
  }, [lastFile, handleFile]);

  const clearPreview = React.useCallback(() => {
    setPreviewSource(null);
    setUploadError(null);
    setUploadSuccess(false);
    setLastFile(null);
  }, []);

  return (
    <ImageBackground
      source={require("../../assets/Login Page/SplashBG.png")}
      style={styles.container}
      imageStyle={{ backgroundColor: 'transparent' }}
      resizeMode="cover"
    >
      <View style={styles.overlayWrapper}>
        {/* Background pressable closes the splash when tapping outside content */}
        <Pressable style={[styles.overlayBackground, noOverlayBackground ? { backgroundColor: 'transparent' } : {}]} onPress={onClose} />
        {/* Foreground content: clicks here should not close the splash */}
        <View style={styles.overlayContent} pointerEvents="box-none">
          <Image source={require('../../assets/General/Logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Eagle Point</Text>
          <Text style={styles.subtitle}>AFPOVAI: Tee Time & Queuing</Text>

        {/* Seal area: on web this supports drag & drop and click-to-pick. */}
        <Pressable
          style={[styles.sealPressable, isDragOver ? styles.sealDragOver : null]}
          onPress={async () => {
            if (Platform.OS === 'web' && typeof document !== 'undefined') {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = () => {
                const file = input.files && input.files[0];
                if (file) handleFile(file);
              };
              input.click();
              return;
            }

            // Native: use expo-image-picker to pick from gallery.
            try {
              const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!permission.granted) {
                // eslint-disable-next-line no-console
                console.warn('Media library permission not granted');
                return;
              }

              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
              } as any);

              // Newer expo returns { cancelled } on old API or { assets } on new
              // api. Normalize.
              const picked = (result as any).assets ? (result as any).assets[0] : (result as any).uri ? { uri: (result as any).uri } : null;
              if (!picked) return;

              // Pass the picked asset to the shared handler which will preview
              // and optionally upload.
              handleFile(picked);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('Image picker failed', err);
            }
          }}
          {...(Platform.OS === 'web' ? {
            onDragOver: (e: any) => { e.preventDefault(); setIsDragOver(true); },
            onDragEnter: (e: any) => { e.preventDefault(); setIsDragOver(true); },
            onDragLeave: (e: any) => { e.preventDefault(); setIsDragOver(false); },
            onDrop: (e: any) => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); }
          } as any : {})}
        >
          <View style={styles.sealWrapper}>
            <Image source={safeDisplaySealSource} style={styles.seal} resizeMode="contain" />
            {uploading ? (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : null}
          </View>
        </Pressable>

        {/* Upload status: show success or error with retry/clear actions */}
        <View style={styles.uploadStatus}>
          {uploadSuccess ? (
            <Text style={styles.statusText}>Seal uploaded successfully</Text>
          ) : null}
          {uploadError ? (
            <View style={styles.statusRow}>
              <Text style={styles.statusTextError}>{uploadError}</Text>
              <Pressable style={styles.retryButton} onPress={retryUpload}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
              <Pressable style={styles.clearButton} onPress={clearPreview}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 18 }} />
        <Text style={styles.message}>{message}</Text>
        {onClose ? <Text style={styles.tapHint}>Tap anywhere to dismiss</Text> : null}
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // Match the intended dark green base used in the design so transparent
  // areas in the PNG blend correctly instead of showing white.
  container: { flex: 1, width: '100%', height: '100%', backgroundColor: '#17321d' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(23,50,29,0.35)' },
  logo: { width: 180, height: 180, marginBottom: 12 },
  title: { color: '#fff', fontSize: 36, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#ddd', fontSize: 14 },
  seal: { width: 95, height: 95, marginTop: 8, marginBottom: 8, borderRadius: 44, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)' },
  message: { color: '#fff', marginTop: 12 },
  tapHint: { color: 'rgba(255,255,255,0.85)', marginTop: 10, fontSize: 12 },
  sealPressable: { borderRadius: 48, overflow: 'hidden' },
  sealDragOver: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)' },
  sealWrapper: { width: 95, height: 95, borderRadius: 44, overflow: 'hidden', position: 'relative' },
  uploadOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 44 },
  uploadStatus: { marginTop: 6, alignItems: 'center' },
  statusText: { color: '#bfffbf', fontSize: 12, marginBottom: 4 },
  statusTextError: { color: '#ffbfbf', fontSize: 12, marginRight: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  retryButton: { marginLeft: 6, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  retryText: { color: '#fff', fontSize: 12 },
  clearButton: { marginLeft: 6, backgroundColor: 'transparent', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  clearText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  overlayWrapper: { flex: 1, width: '100%', height: '100%' },
  overlayBackground: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(23,50,29,0.35)' },
  overlayContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
