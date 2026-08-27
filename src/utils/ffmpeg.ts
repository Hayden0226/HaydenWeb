// Browser-side FFmpeg loader (FFmpeg.wasm)
// The core is self-hosted under /ffmpeg/ and fetched same-origin first, so it
// keeps working even when third-party CDNs are unreachable. CDNs remain as
// fallbacks.

import { toBlobURL } from '@ffmpeg/util';
import type { FFmpeg } from '@ffmpeg/ffmpeg';

const CORE_VERSION = '0.12.6';

interface CoreSource {
  name: string;
  coreURL: string;
  wasmURL: string;
}

// Order matters: same-origin (self-hosted) files first, then CDN fallbacks.
const SITE_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const CORE_SOURCES: CoreSource[] = [
  {
    name: 'local',
    coreURL: `${SITE_BASE}/ffmpeg/ffmpeg-core.js`,
    wasmURL: `${SITE_BASE}/ffmpeg/ffmpeg-core.wasm`,
  },
  {
    name: 'jsdelivr',
    coreURL: `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`,
    wasmURL: `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`,
  },
  {
    name: 'unpkg',
    coreURL: `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`,
    wasmURL: `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`,
  },
  {
    name: 'jsdelivr-fastly',
    coreURL: `https://fastly.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`,
    wasmURL: `https://fastly.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`,
  },
];

let ffmpegPromise: Promise<FFmpeg> | null = null;

export interface FFmpegProgress {
  /** 0..1 overall progress reported by ffmpeg */
  ratio: number;
  /** time in seconds */
  time?: number;
}

export type FFmpegLogLine = string;

export interface RunFFmpegOptions {
  file: File;
  outputName: string;
  args: (input: string, output: string) => string[];
  onProgress?: (p: FFmpegProgress) => void;
  onLog?: (line: FFmpegLogLine) => void;
}

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) return ffmpegPromise;

  ffmpegPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ffmpeg = new FFmpeg();
    let lastError: unknown = null;

    for (const source of CORE_SOURCES) {
      try {
        const coreURL = await toBlobURL(source.coreURL, 'text/javascript');
        const wasmURL = await toBlobURL(source.wasmURL, 'application/wasm');
        await ffmpeg.load({ coreURL, wasmURL });
        return ffmpeg;
      } catch (error) {
        lastError = error;
        console.warn(`[FFmpeg] failed to load core from ${source.name}`, error);
      }
    }

    ffmpegPromise = null; // allow a later retry
    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to load FFmpeg core from any CDN');
  })();

  return ffmpegPromise;
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : 'bin';
}

/**
 * Run a single FFmpeg conversion with a file input and one named output.
 * Returns the produced output as a Blob.
 */
export async function runFFmpeg(options: RunFFmpegOptions): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const inputName = `input.${extensionOf(options.file.name)}`;
  const data = new Uint8Array(await options.file.arrayBuffer());
  const rawArgs = options.args(inputName, options.outputName);

  await ffmpeg.writeFile(inputName, data);

  const progressHandler = (event: { progress: number; time: number }) => {
    options.onProgress?.({ ratio: event.progress, time: event.time });
  };
  const logHandler = (event: { message: string }) => {
    if (event && typeof event.message === 'string') {
      options.onLog?.(event.message);
    }
  };

  ffmpeg.on('progress', progressHandler);
  ffmpeg.on('log', logHandler);

  try {
    await ffmpeg.exec(rawArgs);
  } finally {
    ffmpeg.off('progress', progressHandler);
    ffmpeg.off('log', logHandler);
  }

  const output = await ffmpeg.readFile(options.outputName);
  await ffmpeg.deleteFile(inputName).catch(() => undefined);
  await ffmpeg.deleteFile(options.outputName).catch(() => undefined);

  const bytes = typeof output === 'string'
    ? new TextEncoder().encode(output)
    : output;
  return new Blob([bytes]);
}
