import { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Txt } from '@/components/ui';
import { isValidBarcode } from '@/lib/barcode';
import { radius, space, useColors } from '@/lib/theme';

import type { BarcodeCameraProps } from './barcode-camera';

export const CAMERA_SCANNING = true;

type Decoder = (canvas: HTMLCanvasElement) => Promise<string | null>;

interface NativeDetector {
  detect(source: HTMLCanvasElement): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * The browser's own BarcodeDetector where it exists (Chrome on Android);
 * everywhere else, including Safari on iPhone, the ZXing decoder in JavaScript.
 * ZXing is loaded on demand so it stays out of the main bundle.
 */
async function makeDecoder(): Promise<Decoder> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const formats = await Native.getSupportedFormats();
      if (formats.includes('ean_13')) {
        const detector = new Native({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        return async (canvas) => (await detector.detect(canvas))[0]?.rawValue ?? null;
      }
    } catch {
      // fall through to ZXing
    }
  }
  const zx = await import('@zxing/library');
  const hints = new Map<unknown, unknown>([
    [
      zx.DecodeHintType.POSSIBLE_FORMATS,
      [zx.BarcodeFormat.EAN_13, zx.BarcodeFormat.EAN_8, zx.BarcodeFormat.UPC_A, zx.BarcodeFormat.UPC_E],
    ],
    [zx.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new zx.MultiFormatReader();
  reader.setHints(hints as Parameters<typeof reader.setHints>[0]);
  return async (canvas) => {
    try {
      const source = new zx.HTMLCanvasElementLuminanceSource(canvas);
      return reader.decode(new zx.BinaryBitmap(new zx.HybridBinarizer(source))).getText();
    } catch {
      return null; // no barcode in this frame
    }
  };
}

export function BarcodeCamera({ onCode, paused }: BarcodeCameraProps) {
  const c = useColors();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCodeRef = useRef(onCode);
  const pausedRef = useRef(paused);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
    pausedRef.current = paused;
  }, [onCode, paused]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);

        const decode = await makeDecoder();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let last = '';
        const tick = async () => {
          if (stopped) return;
          if (!pausedRef.current && video.videoWidth && ctx) {
            // 800 px wide is plenty for a barcode and keeps decoding fast on a phone.
            const scale = Math.min(1, 800 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const code = await decode(canvas);
            if (code && isValidBarcode(code)) {
              // Two identical reads in a row, so one bad frame cannot pick the wrong product.
              if (code === last) onCodeRef.current(code);
              last = code;
            }
          }
          timer = setTimeout(tick, 160);
        };
        tick();
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Geen toegang tot de camera. Sta de camera toe voor deze app in de instellingen van je telefoon, of typ de code hieronder.'
            : 'De camera kon niet starten. Typ de code onder de streepjes hieronder.',
        );
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) {
    return (
      <View style={{ padding: space.lg, borderRadius: radius.lg, backgroundColor: c.cardAlt }}>
        <Txt variant="dim">{error}</Txt>
      </View>
    );
  }

  return (
    <View
      style={{
        aspectRatio: 4 / 3,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: '#000000',
        justifyContent: 'center',
      }}>
      {createElement('video', {
        ref: videoRef,
        muted: true,
        playsInline: true,
        autoPlay: true,
        'aria-label': 'Camerabeeld',
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      })}
      {/* Guide line: hold the barcode across it */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: '8%',
          right: '8%',
          height: 2,
          borderRadius: 1,
          backgroundColor: c.accent,
          opacity: ready ? 0.9 : 0,
        }}
      />
      {!ready ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
          <Txt variant="dim" color="#FFFFFF">
            Camera starten…
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
