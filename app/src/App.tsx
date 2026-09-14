import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import voiceboxLogo from '@/assets/voicebox-logo.png';
import { DictateWindow } from '@/components/DictateWindow/DictateWindow';
import ShinyText from '@/components/ShinyText';
import { TitleBarDragRegion } from '@/components/TitleBarDragRegion';
import { useAutoUpdater } from '@/hooks/useAutoUpdater';
import { useThemeSync } from '@/hooks/useThemeSync';
import { apiClient } from '@/lib/api/client';
import type { HealthResponse } from '@/lib/api/types';
import { useChordSync } from '@/lib/hooks/useChordSync';
import { TOP_SAFE_AREA_PADDING } from '@/lib/constants/ui';
import { cn } from '@/lib/utils/cn';
import { usePlatform } from '@/platform/PlatformContext';
import { router } from '@/router';
import { useLogStore } from '@/stores/logStore';
import {
  getDefaultServerUrl,
  isLoopbackVoiceboxServerUrl,
  useServerStore,
} from '@/stores/serverStore';

function isDictateView(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('view') === 'dictate';
}

function isVoiceboxHealthResponse(health: HealthResponse): boolean {
  return (
    health?.status === 'healthy' &&
    typeof health.model_loaded === 'boolean' &&
    typeof health.gpu_available === 'boolean'
  );
}

function isPortInUseError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('already in use') ||
    msg.includes('port') ||
    msg.includes('EADDRINUSE') ||
    msg.includes('address already in use')
  );
}

const LOADING_MESSAGES = [
  'Warming up tensors...',
  'Calibrating synthesizer engine...',
  'Initializing voice models...',
  'Loading neural networks...',
  'Preparing audio pipelines...',
  'Optimizing waveform generators...',
  'Tuning frequency analyzers...',
  'Building voice embeddings...',
  'Configuring text-to-speech cores...',
  'Syncing audio buffers...',
  'Establishing model connections...',
  'Preprocessing training data...',
  'Validating voice samples...',
  'Compiling inference engines...',
  'Mapping phoneme sequences...',
  'Aligning prosody parameters...',
  'Activating speech synthesis...',
  'Fine-tuning acoustic models...',
  'Preparing voice cloning matrices...',
  'Initializing Qwen TTS framework...',
];

function App() {
  useThemeSync();

  if (isDictateView()) {
    return <DictateWindow />;
  }
  return <MainApp />;
}

function MobileConnectionGate() {
  const { t } = useTranslation();
  const serverUrl = useServerStore((state) => state.serverUrl);
  const setServerUrl = useServerStore((state) => state.setServerUrl);
  const setIsConnected = useServerStore((state) => state.setIsConnected);
  const [value, setValue] = useState(serverUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setValue(serverUrl), [serverUrl]);

  async function connect() {
    const url = value.trim().replace(/\/$/, '');
    if (!/^https?:\/\/[^\s/]+(?::\d+)?(?:\/.*)?$/i.test(url)) {
      setError(t('mobileConnection.invalidUrl'));
      return;
    }

    setBusy(true);
    setError(null);
    setServerUrl(url);
    try {
      const health = await apiClient.getHealth();
      if (!isVoiceboxHealthResponse(health)) throw new Error('invalid_voicebox_server');
      setIsConnected(true);
    } catch {
      setIsConnected(false);
      setError(t('mobileConnection.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('min-h-screen bg-background flex items-center justify-center p-5', TOP_SAFE_AREA_PADDING)} dir="rtl">
      <div className="w-full max-w-md rounded-2xl border bg-card/95 p-6 shadow-xl space-y-5">
        <div className="text-center space-y-2">
          <img src={voiceboxLogo} alt="Voicebox" className="mx-auto h-20 w-20 object-contain" />
          <h1 className="text-2xl font-semibold">{t('mobileConnection.title')}</h1>
          <p className="text-sm text-muted-foreground leading-6">{t('mobileConnection.description')}</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="voicebox-server-url" className="text-sm font-medium">{t('mobileConnection.serverUrl')}</label>
          <input
            id="voicebox-server-url"
            dir="ltr"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void connect();
            }}
            placeholder={t('mobileConnection.placeholder')}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-sm text-destructive leading-5">{error}</p>}

        <button
          type="button"
          onClick={() => void connect()}
          disabled={busy}
          className="w-full rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity disabled:opacity-60"
        >
          {busy ? t('mobileConnection.connecting') : t('mobileConnection.connect')}
        </button>

        <p className="text-xs text-muted-foreground leading-5 text-center">{t('mobileConnection.hint')}</p>
      </div>
    </div>
  );
}

function MainApp() {
  const platform = usePlatform();
  const { i18n } = useTranslation();
  const [serverReady, setServerReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const serverStartingRef = useRef(false);
  const mobileClient = import.meta.env.VITE_MOBILE_CLIENT === 'true';
  const mobileConnected = useServerStore((state) => state.isConnected);

  useAutoUpdater({ checkOnMount: true, showToast: true });
  useChordSync();

  useEffect(() => {
    const isArabic = i18n.language.startsWith('ar');
    document.documentElement.lang = isArabic ? 'ar' : i18n.language;
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    document.body.dir = isArabic ? 'rtl' : 'ltr';
  }, [i18n, i18n.language]);

  useEffect(() => {
    if (platform.metadata.isTauri) {
      const keepRunning = useServerStore.getState().keepServerRunningOnClose;
      platform.lifecycle.setKeepServerRunning(keepRunning).catch((error) => {
        console.error('Failed to sync initial setting to Rust:', error);
      });
    }
  }, [platform.metadata.isTauri, platform.lifecycle]);

  useEffect(() => {
    platform.lifecycle.onServerReady = () => setServerReady(true);
  }, [platform.lifecycle]);

  useEffect(() => {
    const unsubscribe = platform.lifecycle.subscribeToServerLogs((entry) => {
      useLogStore.getState().addEntry(entry);
    });
    return unsubscribe;
  }, [platform.lifecycle]);

  useEffect(() => {
    if (mobileClient) {
      setServerReady(true);
      return;
    }

    if (!platform.metadata.isTauri) {
      const serverUrl = getDefaultServerUrl();
      const currentServerUrl = useServerStore.getState().serverUrl;
      if (currentServerUrl !== serverUrl && isLoopbackVoiceboxServerUrl(currentServerUrl)) {
        useServerStore.getState().setServerUrl(serverUrl);
      }
      setServerReady(true);
      return;
    }

    platform.lifecycle.setupWindowCloseHandler().catch((error) => {
      console.error('Failed to setup window close handler:', error);
    });

    if (!import.meta.env?.PROD) {
      console.log('Dev mode: Skipping auto-start of server (run it separately)');
      setServerReady(true);
      window.__voiceboxServerStartedByApp = false;
      return;
    }

    if (serverStartingRef.current) return;
    serverStartingRef.current = true;
    const isRemote = useServerStore.getState().mode === 'remote';
    const customModelsDir = useServerStore.getState().customModelsDir;

    platform.lifecycle
      .startServer(isRemote, customModelsDir)
      .then((serverUrl) => {
        useServerStore.getState().setServerUrl(serverUrl);
        setServerReady(true);
        window.__voiceboxServerStartedByApp = true;
      })
      .catch((error) => {
        console.error('Failed to auto-start server:', error);
        serverStartingRef.current = false;
        window.__voiceboxServerStartedByApp = false;

        if (!isPortInUseError(error)) {
          const msg = error instanceof Error ? error.message : String(error);
          setStartupError(msg);
          return;
        }

        const pollInterval = setInterval(async () => {
          try {
            const health = await apiClient.getHealth();
            if (!isVoiceboxHealthResponse(health)) return;
            clearInterval(pollInterval);
            setServerReady(true);
          } catch {
            // Keep polling.
          }
        }, 2000);

        setTimeout(() => {
          clearInterval(pollInterval);
          serverStartingRef.current = false;
          setStartupError(
            'Could not connect to a Voicebox server within 2 minutes. ' +
              'Please check that the server is running and try again.',
          );
        }, 120_000);
      });

    return () => {
      serverStartingRef.current = false;
    };
  }, [mobileClient, platform.metadata.isTauri, platform.lifecycle]);

  useEffect(() => {
    if (!platform.metadata.isTauri || serverReady) return;
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [serverReady, platform.metadata.isTauri]);

  if (mobileClient && !mobileConnected) {
    return <MobileConnectionGate />;
  }

  if (platform.metadata.isTauri && !serverReady) {
    return (
      <div className={cn('min-h-screen bg-background flex items-center justify-center', TOP_SAFE_AREA_PADDING)}>
        <TitleBarDragRegion />
        <div className="text-center space-y-6">
          <div className="flex justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-48 rounded-full bg-accent/20 blur-3xl" />
            </div>
            <img src={voiceboxLogo} alt="Voicebox" className="w-48 h-48 object-contain animate-fade-in-scale relative z-10" />
          </div>
          {startupError ? (
            <div className="animate-fade-in-delayed max-w-md mx-auto space-y-3">
              <p className="text-lg font-medium text-destructive">Server startup failed</p>
              <p className="text-sm text-muted-foreground">{startupError}</p>
              <button type="button" className="mt-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          ) : (
            <ShinyText text={LOADING_MESSAGES[loadingMessageIndex]} className="text-lg font-medium text-muted-foreground" speed={2} color="hsl(var(--muted-foreground))" shineColor="hsl(var(--foreground))" />
          )}
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

export default App;
