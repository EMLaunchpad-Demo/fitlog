/**
 * Live barcode scanning. The camera version is web-only (see
 * barcode-camera.web.tsx), because that is how the app runs on a phone; in a
 * native build the scan screen falls back to typing the number.
 */
export interface BarcodeCameraProps {
  /** Called with the digits of a barcode that passed its check digit. */
  onCode: (code: string) => void;
  paused?: boolean;
}

export const CAMERA_SCANNING = false;

export function BarcodeCamera(_props: BarcodeCameraProps) {
  return null;
}
