/** Snapshot of what the device can do, gathered once at boot (ARCHITECTURE.md §4). */
export interface DeviceCapabilities {
  webgl2: boolean;
  maxTextureSize: number;
  devicePixelRatio: number;
  reducedMotion: boolean;
  coarsePointer: boolean;
  saveData: boolean;
  /** navigator.deviceMemory in GB when the browser exposes it. */
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  viewportWidth: number;
  viewportHeight: number;
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

/** Creates a throwaway WebGL2 context to probe support, then releases it immediately. */
function probeWebGL2(): { ok: boolean; maxTextureSize: number } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl) return { ok: false, maxTextureSize: 0 };
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { ok: true, maxTextureSize };
  } catch {
    return { ok: false, maxTextureSize: 0 };
  }
}

function media(query: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function detectCapabilities(): DeviceCapabilities {
  const gl = probeWebGL2();
  const nav = navigator as Navigator & NavigatorHints;
  return {
    webgl2: gl.ok,
    maxTextureSize: gl.maxTextureSize,
    devicePixelRatio: window.devicePixelRatio || 1,
    reducedMotion: media('(prefers-reduced-motion: reduce)'),
    coarsePointer: media('(pointer: coarse)'),
    saveData: nav.connection?.saveData === true,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}
