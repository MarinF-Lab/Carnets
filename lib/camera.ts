/**
 * Cámara trasera: elige la cámara principal (con enfoque automático), activa el
 * enfoque continuo y ofrece toque para enfocar y zoom donde el navegador lo permite
 * (Chrome en Android). En iPhone el sistema enfoca solo y estas opciones no existen.
 */

type Caps = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: { min: number; max: number; step?: number };
  pointsOfInterest?: unknown;
  torch?: boolean;
};

export type CameraInfo = {
  stream: MediaStream;
  track: MediaStreamTrack;
  /** Cámaras traseras disponibles (para el botón de cambiar). */
  backCameras: MediaDeviceInfo[];
  deviceId: string | null;
  canFocus: boolean;
  canTapFocus: boolean;
  zoom: { min: number; max: number; step: number } | null;
};

const KEY = "carnets.cameraId";

const RESOLUTION = { width: { ideal: 3840 }, height: { ideal: 2160 } };

function caps(track: MediaStreamTrack): Caps {
  try {
    return (track.getCapabilities?.() ?? {}) as Caps;
  } catch {
    return {};
  }
}

function isBack(d: MediaDeviceInfo) {
  return /back|rear|environment|trasera|traseira|posterior/i.test(d.label);
}

/** Puntaje para elegir la cámara principal entre varias traseras. */
function score(d: MediaDeviceInfo): number {
  const l = d.label.toLowerCase();
  let s = 0;
  if (/ultra|wide|gran angular|tele|depth|profundidad|macro|infrared|ir\b/.test(l)) s -= 10;
  if (/triple|dual/.test(l)) s -= 5; // cámaras virtuales de iPhone
  // Android: "camera2 0, facing back" suele ser la principal.
  const m = l.match(/camera2? ?(\d+)/);
  if (m) s -= Number(m[1]);
  return s;
}

async function open(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: deviceId ? { deviceId: { exact: deviceId }, ...RESOLUTION } : { facingMode: { ideal: "environment" }, ...RESOLUTION },
  });
}

async function setup(stream: MediaStream, backCameras: MediaDeviceInfo[]): Promise<CameraInfo> {
  const track = stream.getVideoTracks()[0];
  const c = caps(track);
  const canFocus = Array.isArray(c.focusMode) && c.focusMode.includes("continuous");
  if (canFocus) {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
  }
  const zoom = c.zoom && c.zoom.max > c.zoom.min ? { min: c.zoom.min, max: c.zoom.max, step: c.zoom.step || 0.1 } : null;
  return {
    stream,
    track,
    backCameras,
    deviceId: track.getSettings().deviceId ?? null,
    canFocus,
    canTapFocus: "pointsOfInterest" in c && Array.isArray(c.focusMode) && c.focusMode.length > 0,
    zoom,
  };
}

/** Abre la cámara trasera. Con deviceId abre esa; si no, la recordada o la principal. */
export async function openBackCamera(deviceId?: string): Promise<CameraInfo> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Sin cámara");
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {}

  let stream: MediaStream;
  try {
    stream = await open(deviceId ?? saved ?? undefined);
  } catch {
    stream = await open(); // la cámara recordada ya no existe
  }

  // Con el permiso concedido ya se ven los nombres de las cámaras.
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  const backCameras = devices.filter((d) => d.kind === "videoinput" && isBack(d));

  // Primera vez en un celular con varias cámaras traseras: cambiar a la principal.
  if (!deviceId && !saved && backCameras.length > 1) {
    const best = [...backCameras].sort((a, b) => score(b) - score(a))[0];
    const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (best && best.deviceId && best.deviceId !== current) {
      stream.getTracks().forEach((t) => t.stop());
      try {
        stream = await open(best.deviceId);
      } catch {
        stream = await open();
      }
    }
  }

  const info = await setup(stream, backCameras);
  if (deviceId && info.deviceId) {
    try {
      localStorage.setItem(KEY, info.deviceId);
    } catch {}
  }
  return info;
}

/** Enfoca en un punto (x, y entre 0 y 1) y luego vuelve al enfoque continuo. */
export async function focusAt(info: CameraInfo, x: number, y: number): Promise<void> {
  if (!info.canTapFocus) return;
  const c = caps(info.track);
  const mode = c.focusMode?.includes("single-shot") ? "single-shot" : "continuous";
  await info.track
    .applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: mode } as MediaTrackConstraintSet] })
    .catch(() => undefined);
  if (mode === "single-shot" && info.canFocus) {
    setTimeout(() => {
      info.track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
    }, 2500);
  }
}

export async function setZoom(info: CameraInfo, value: number): Promise<void> {
  if (!info.zoom) return;
  await info.track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => undefined);
}
