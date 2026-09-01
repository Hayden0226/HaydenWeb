// Media tool definitions and conversion logic.
// Audio/Video conversions run through FFmpeg.wasm in the browser; image
// conversions use native canvas encoding (much lighter than pulling FFmpeg for
// still images).

import { runFFmpeg, getFFmpeg } from './ffmpeg';

export type Category = 'audio' | 'video' | 'image';

export interface ToolOption {
  key: string;
  label: string;
  type: 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  default?: number;
  choices?: { value: string; label: string }[];
  hint?: string;
}

export interface MediaTool {
  id: string;
  category: Category;
  label: string;
  subtitle: string;
  accept: string;
  multiple?: boolean;
  outputExt: string;
  options?: ToolOption[];
  engine: 'ffmpeg' | 'image';
  buildArgs?: (input: string, output: string, opts: Record<string, unknown>) => string[];
  runImage?: (blob: Blob, opts: Record<string, unknown>) => Promise<{ blob: Blob; outputExt: string }>;
}

export interface ConvertResult {
  blobs: Blob[];
  outputNames: string[];
}

// ---- Image helpers (native canvas) -----------------------------------------

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法解码该图片，请确认文件是有效的图片'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('图片编码失败'))),
      type,
      quality
    );
  });
}

async function reencode(
  blob: Blob,
  type: string,
  quality?: number,
  transform?: (canvas: HTMLCanvasElement, img: HTMLImageElement) => void
): Promise<Blob> {
  const img = await decodeImage(blob);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  transform?.(canvas, img);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, type, quality);
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function baseNameOf(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return base || 'converted';
}

function losslessArgs(fmt: string, bitDepth: string, sampleRate: string): string[] {
  if (fmt === 'flac') {
    const sampleFmt = bitDepth === '16' ? 's16' : 's32';
    const extra = bitDepth === '16' ? [] : ['-bits_per_raw_sample', bitDepth];
    return ['-acodec', 'flac', '-sample_fmt', sampleFmt, ...extra, '-ar', sampleRate];
  }
  const codec = bitDepth === '24' ? 'pcm_s24le' : bitDepth === '32' ? 'pcm_s32le' : 'pcm_s16le';
  return ['-acodec', codec, '-ar', sampleRate];
}

// ---- Tool definitions --------------------------------------------------------

const QUALITY = [
  { value: '320', label: '高 (320 kbps)' },
  { value: '192', label: '中 (192 kbps)' },
  { value: '128', label: '低 (128 kbps)' },
];

const JPEG_QUALITY: ToolOption = {
  key: 'quality',
  label: 'JPEG 质量',
  type: 'number',
  min: 0.1,
  max: 1,
  step: 0.05,
  default: 1,
  hint: '0.1–1，越接近 1 越清晰、文件越大；PNG 转 JPEG 时透明背景会变白。',
};

const OUTPUT_FORMAT: ToolOption = {
  key: 'format',
  label: '输出格式',
  type: 'select',
  choices: [
    { value: 'mp3', label: 'MP3' },
    { value: 'wav', label: 'WAV' },
    { value: 'ogg', label: 'OGG' },
    { value: 'flac', label: 'FLAC' },
  ],
  hint: 'MP3 有损体积小、OGG 兼容性好、WAV / FLAC 无损保真但文件更大。',
};

const BIT_DEPTH: ToolOption = {
  key: 'bitDepth',
  label: '位深',
  type: 'select',
  choices: [
    { value: '16', label: '16-bit' },
    { value: '24', label: '24-bit' },
    { value: '32', label: '32-bit' },
  ],
  default: 32,
  hint: '位深越高单点精度越高：16-bit 为 CD 标准，24/32-bit 动态范围更宽、文件更大。',
};

const SAMPLE_RATE: ToolOption = {
  key: 'sampleRate',
  label: '采样率',
  type: 'select',
  choices: [
    { value: '44100', label: '44100 Hz' },
    { value: '48000', label: '48000 Hz' },
    { value: '96000', label: '96000 Hz' },
    { value: '192000', label: '192000 Hz' },
  ],
  default: 192000,
  hint: '采样率越高记录越细腻：44100 Hz 为 CD 标准，96000 / 192000 Hz 适合高解析度音频。',
};

export const MEDIA_TOOLS: MediaTool[] = [
  // ---- Audio ----
  {
    id: 'mp3-to-wav',
    category: 'audio',
    label: 'MP3 → WAV',
    subtitle: '无损 PCM 音频',
    accept: '.mp3,audio/mpeg',
    outputExt: 'wav',
    engine: 'ffmpeg',
    options: [BIT_DEPTH, SAMPLE_RATE],
    buildArgs: (input, output, opts) => [
      '-i', input, '-vn', ...losslessArgs('wav', String(opts.bitDepth ?? '16'), String(opts.sampleRate ?? '44100')), output,
    ],
  },
  {
    id: 'wav-to-mp3',
    category: 'audio',
    label: 'WAV → MP3',
    subtitle: '压缩为 MP3',
    accept: '.wav,audio/wav,audio/x-wav',
    outputExt: 'mp3',
    engine: 'ffmpeg',
    options: [
      { key: 'quality', label: '质量', type: 'select', choices: QUALITY, default: 320, hint: '码率越高音质越好、文件越大：320 kbps 是 MP3 上限，192 是体积与音质平衡，128 适合网络传输。' },
    ],
    buildArgs: (input, output, opts) => ['-i', input, '-vn', '-acodec', 'libmp3lame', '-b:a', `${opts.quality ?? 192}k`, output],
  },
  {
    id: 'mp3-to-ogg',
    category: 'audio',
    label: 'MP3 → OGG',
    subtitle: 'Vorbis 编码',
    accept: '.mp3,audio/mpeg',
    outputExt: 'ogg',
    engine: 'ffmpeg',
    buildArgs: (input, output) => ['-i', input, '-vn', '-acodec', 'libvorbis', '-q:a', '5', output],
  },
  {
    id: 'wav-to-flac',
    category: 'audio',
    label: 'WAV → FLAC',
    subtitle: '无损压缩',
    accept: '.wav,audio/wav,audio/x-wav',
    outputExt: 'flac',
    engine: 'ffmpeg',
    options: [BIT_DEPTH, SAMPLE_RATE],
    buildArgs: (input, output, opts) => [
      '-i', input, '-vn', ...losslessArgs('flac', String(opts.bitDepth ?? '16'), String(opts.sampleRate ?? '44100')), output,
    ],
  },
  {
    id: 'video-to-audio',
    category: 'audio',
    label: 'Video → Audio',
    subtitle: '提取视频音轨',
    accept: 'video/*',
    outputExt: 'mp3',
    engine: 'ffmpeg',
    options: [
      { key: 'format', label: '输出格式', type: 'select', choices: [
        { value: 'mp3', label: 'MP3' },
        { value: 'wav', label: 'WAV' },
        { value: 'ogg', label: 'OGG' },
        { value: 'flac', label: 'FLAC' },
      ], default: 0, hint: 'MP3 有损体积小、OGG 兼容性好、WAV / FLAC 无损保真但文件更大。' },
      BIT_DEPTH,
      SAMPLE_RATE,
      { key: 'quality', label: '质量', type: 'select', choices: QUALITY, default: 320, hint: '仅 MP3 生效：码率越高音质越好、文件越大，320 kbps 为 MP3 上限。' },
    ],
    buildArgs: (input, output, opts) => {
      const fmt = String(opts.format ?? 'mp3');
      const bd = String(opts.bitDepth ?? '16');
      const sr = String(opts.sampleRate ?? '44100');
      if (fmt === 'wav' || fmt === 'flac') {
        return ['-i', input, '-vn', ...losslessArgs(fmt, bd, sr), output];
      }
      const codec = fmt === 'ogg' ? 'libvorbis' : 'libmp3lame';
      const extra = fmt === 'ogg' ? ['-q:a', '5'] : ['-b:a', `${opts.quality ?? 192}k`];
      return ['-i', input, '-vn', '-acodec', codec, ...extra, output];
    },
  },
  {
    id: 'audio-cutter',
    category: 'audio',
    label: 'Audio Cutter',
    subtitle: '截取片段',
    accept: 'audio/*,video/*',
    outputExt: 'mp3',
    engine: 'ffmpeg',
    options: [
      { key: 'start', label: '开始 (秒)', type: 'number', min: 0, step: 0.1, default: 0, hint: '片段的起始时间，支持小数，例如 5.5 表示第 5.5 秒。' },
      { key: 'end', label: '结束 (秒)', type: 'number', min: 0, step: 0.1, default: 30, hint: '片段的结束时间，需大于开始时间。' },
      { key: 'format', label: '输出格式', type: 'select', choices: [
        { value: 'mp3', label: 'MP3' },
        { value: 'wav', label: 'WAV' },
      ], default: 0, hint: '截取后输出 MP3（有损、体积小）或 WAV（无损、体积大）。' },
      BIT_DEPTH,
      SAMPLE_RATE,
    ],
    buildArgs: (input, output, opts) => {
      const start = num(opts.start, 0);
      const end = Math.max(num(opts.end, 30), start + 0.1);
      const fmt = String(opts.format ?? 'mp3');
      const bd = String(opts.bitDepth ?? '16');
      const sr = String(opts.sampleRate ?? '44100');
      if (fmt === 'wav') {
        return ['-ss', String(start), '-to', String(end), '-i', input, '-vn', ...losslessArgs('wav', bd, sr), output];
      }
      return ['-ss', String(start), '-to', String(end), '-i', input, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', output];
    },
  },
  {
    id: 'audio-converter',
    category: 'audio',
    label: 'Audio Converter',
    subtitle: '任意音频互转',
    accept: 'audio/*',
    outputExt: 'mp3',
    engine: 'ffmpeg',
    options: [OUTPUT_FORMAT, BIT_DEPTH, SAMPLE_RATE, { key: 'quality', label: '质量', type: 'select', choices: QUALITY, default: 320, hint: '仅 MP3 生效：码率越高音质越好、文件越大，320 kbps 为 MP3 上限。' }],
    buildArgs: (input, output, opts) => {
      const fmt = String(opts.format ?? 'mp3');
      const bd = String(opts.bitDepth ?? '16');
      const sr = String(opts.sampleRate ?? '44100');
      if (fmt === 'wav' || fmt === 'flac') {
        return ['-i', input, '-vn', ...losslessArgs(fmt, bd, sr), output];
      }
      const codec = fmt === 'ogg' ? 'libvorbis' : 'libmp3lame';
      const extra = fmt === 'ogg' ? ['-q:a', '5'] : ['-b:a', `${opts.quality ?? 192}k`];
      return ['-i', input, '-vn', '-acodec', codec, ...extra, output];
    },
  },
  {
    id: 'audio-mixer',
    category: 'audio',
    label: 'Audio Mixer',
    subtitle: '两段音频叠加混音',
    accept: 'audio/*',
    outputExt: 'wav',
    engine: 'ffmpeg',
    options: [BIT_DEPTH, SAMPLE_RATE],
  },

  // ---- Video ----
  {
    id: 'mp4-to-gif',
    category: 'video',
    label: 'MP4 → GIF',
    subtitle: '转 GIF 动图',
    accept: 'video/*',
    outputExt: 'gif',
    engine: 'ffmpeg',
    options: [
      { key: 'fps', label: '帧率', type: 'number', min: 1, max: 50, step: 1, default: 50, hint: '每秒画面数。GIF 建议 10–30：太低会卡顿，过高容易卡顿且文件巨大。' },
      { key: 'width', label: '宽度 (px)', type: 'number', min: 64, max: 3840, step: 16, default: 720, hint: '输出宽度，越小文件越小。4K 源建议 ≤1920，否则浏览器内存吃紧。' },
    ],
    buildArgs: (input, output, opts) => [
      '-i', input,
      '-vf', `fps=${num(opts.fps, 10)},scale=${num(opts.width, 480)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a`,
      '-loop', '0',
      output,
    ],
  },
  {
    id: 'gif-to-mp4',
    category: 'video',
    label: 'GIF → MP4',
    subtitle: 'GIF 转视频',
    accept: '.gif,image/gif',
    outputExt: 'mp4',
    engine: 'ffmpeg',
    buildArgs: (input, output) => ['-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output],
  },
  {
    id: 'mp4-to-webm',
    category: 'video',
    label: 'MP4 → WebM',
    subtitle: 'VP9 + Opus',
    accept: 'video/*',
    outputExt: 'webm',
    engine: 'ffmpeg',
    buildArgs: (input, output) => ['-i', input, '-c:v', 'libvpx', '-b:v', '1M', '-crf', '30', '-c:a', 'libopus', output],
  },
  {
    id: 'webm-to-mp4',
    category: 'video',
    label: 'WebM → MP4',
    subtitle: 'H.264 + AAC',
    accept: 'video/*',
    outputExt: 'mp4',
    engine: 'ffmpeg',
    buildArgs: (input, output) => ['-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', output],
  },
  {
    id: 'video-to-images',
    category: 'video',
    label: 'Video → Images',
    subtitle: '每秒抽帧打包 ZIP',
    accept: 'video/*',
    outputExt: 'zip',
    engine: 'ffmpeg',
    options: [
      { key: 'frames', label: '最多帧数', type: 'number', min: 1, max: 500, step: 1, default: 500, hint: '最多抽取的帧数，按每秒 1 帧抽。长视频建议设小些，避免 ZIP 过大。' },
      { key: 'format', label: '图片格式', type: 'select', choices: [
        { value: 'png', label: 'PNG' },
        { value: 'jpg', label: 'JPG' },
      ], default: 0, hint: 'PNG 无损但体积大，JPG 体积小且有损。' },
    ],
  },
  {
    id: 'video-compressor',
    category: 'video',
    label: 'Video Compressor',
    subtitle: 'H.264 压缩',
    accept: 'video/*',
    outputExt: 'mp4',
    engine: 'ffmpeg',
    options: [
      { key: 'crf', label: '质量 CRF (越小越清晰)', type: 'number', min: 18, max: 51, step: 1, default: 18, hint: '恒定质量因子，数值越小越清晰、文件越大：18 接近无损，28 是常用平衡，51 最糊。' },
    ],
    buildArgs: (input, output, opts) => [
      '-i', input,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(num(opts.crf, 28)),
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart',
      output,
    ],
  },
  {
    id: 'video-resizer',
    category: 'video',
    label: 'Video Resizer',
    subtitle: '缩放分辨率',
    accept: 'video/*',
    outputExt: 'mp4',
    engine: 'ffmpeg',
    options: [
      { key: 'width', label: '宽度 (px)', type: 'number', min: 64, max: 8192, step: 16, default: 1280, hint: '输出宽度，高度按原比例自动缩放。1280 / 1920 是常见清晰度，过大会显著变慢。' },
    ],
    buildArgs: (input, output, opts) => [
      '-i', input,
      '-vf', `scale=${num(opts.width, 1280)}:-2`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart',
      output,
    ],
  },

  // ---- Image ----
  {
    id: 'jpg-to-png',
    category: 'image',
    label: 'JPG → PNG',
    subtitle: '转 PNG',
    accept: 'image/jpeg,image/jpg',
    outputExt: 'png',
    engine: 'image',
    runImage: (blob) => reencode(blob, 'image/png').then((b) => ({ blob: b, outputExt: 'png' })),
  },
  {
    id: 'png-to-jpg',
    category: 'image',
    label: 'PNG → JPG',
    subtitle: '转 JPEG（透明变白）',
    accept: 'image/png',
    outputExt: 'jpg',
    engine: 'image',
    options: [JPEG_QUALITY],
    runImage: (blob, opts) => reencode(blob, 'image/jpeg', num(opts.quality, 0.92)).then((b) => ({ blob: b, outputExt: 'jpg' })),
  },
  {
    id: 'png-to-webp',
    category: 'image',
    label: 'PNG → WebP',
    subtitle: '现代压缩格式',
    accept: 'image/png',
    outputExt: 'webp',
    engine: 'image',
    options: [{ key: 'quality', label: '质量', type: 'number', min: 0.1, max: 1, step: 0.05, default: 1, hint: '0.1–1，越接近 1 越清晰、文件越大。WebP 体积通常比 JPG 小且支持透明。' }],
    runImage: (blob, opts) => reencode(blob, 'image/webp', num(opts.quality, 0.85)).then((b) => ({ blob: b, outputExt: 'webp' })),
  },
  {
    id: 'jpg-to-webp',
    category: 'image',
    label: 'JPG → WebP',
    subtitle: '现代压缩格式',
    accept: 'image/jpeg,image/jpg',
    outputExt: 'webp',
    engine: 'image',
    options: [{ key: 'quality', label: '质量', type: 'number', min: 0.1, max: 1, step: 0.05, default: 1, hint: '0.1–1，越接近 1 越清晰、文件越大。WebP 体积通常比 JPG 小且支持透明。' }],
    runImage: (blob, opts) => reencode(blob, 'image/webp', num(opts.quality, 0.85)).then((b) => ({ blob: b, outputExt: 'webp' })),
  },
  {
    id: 'webp-to-png',
    category: 'image',
    label: 'WebP → PNG',
    subtitle: '无损输出',
    accept: 'image/webp',
    outputExt: 'png',
    engine: 'image',
    runImage: (blob) => reencode(blob, 'image/png').then((b) => ({ blob: b, outputExt: 'png' })),
  },
  {
    id: 'gif-to-png',
    category: 'image',
    label: 'GIF → PNG',
    subtitle: '取第一帧',
    accept: '.gif,image/gif',
    outputExt: 'png',
    engine: 'image',
    runImage: (blob) => reencode(blob, 'image/png').then((b) => ({ blob: b, outputExt: 'png' })),
  },
  {
    id: 'image-compressor',
    category: 'image',
    label: 'Image Compressor',
    subtitle: '压缩图片体积',
    accept: 'image/*',
    outputExt: 'webp',
    engine: 'image',
    options: [
      { key: 'format', label: '输出格式', type: 'select', choices: [
        { value: 'webp', label: 'WebP' },
        { value: 'jpeg', label: 'JPEG' },
        { value: 'png', label: 'PNG' },
      ], default: 0, hint: 'WebP 体积最小、JPEG 通用、PNG 无损但较大。' },
      { key: 'quality', label: '质量', type: 'number', min: 0.1, max: 1, step: 0.05, default: 1, hint: '0.1–1，越低文件越小、画质越糊。要压缩就先调低质量看效果。' },
    ],
    runImage: (blob, opts) => {
      const fmt = String(opts.format ?? 'webp');
      const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'png' ? 'image/png' : 'image/webp';
      return reencode(blob, mime, num(opts.quality, 0.75)).then((b) => ({ blob: b, outputExt: fmt === 'jpeg' ? 'jpg' : fmt }));
    },
  },
  {
    id: 'image-resizer',
    category: 'image',
    label: 'Image Resizer',
    subtitle: '等比缩放',
    accept: 'image/*',
    outputExt: 'webp',
    engine: 'image',
    options: [
      { key: 'width', label: '目标宽度 (px)', type: 'number', min: 16, max: 8192, step: 16, default: 1280, hint: '缩放后的宽度，高度按原比例自动变化。' },
      { key: 'format', label: '输出格式', type: 'select', choices: [
        { value: 'jpeg', label: 'JPEG' },
        { value: 'webp', label: 'WebP' },
      ], default: 0, hint: 'JPEG 通用、WebP 体积更小。' },
      { key: 'quality', label: '质量', type: 'number', min: 0.1, max: 1, step: 0.05, default: 1, hint: '0.1–1，越接近 1 越清晰、文件越大。' },
    ],
    runImage: async (blob, opts) => {
      const width = num(opts.width, 1280);
      const fmt = String(opts.format ?? 'jpeg');
      const mime = fmt === 'webp' ? 'image/webp' : 'image/jpeg';
      const img = await decodeImage(blob);
      const ratio = width / img.naturalWidth;
      const outWidth = Math.max(1, Math.round(img.naturalWidth * ratio));
      const outHeight = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      canvas.getContext('2d')?.drawImage(img, 0, 0, outWidth, outHeight);
      const outBlob = await canvasToBlob(canvas, mime, num(opts.quality, 0.88));
      return { blob: outBlob, outputExt: fmt === 'webp' ? 'webp' : 'jpg' };
    },
  },
  {
    id: 'image-cropper',
    category: 'image',
    label: 'Image Cropper',
    subtitle: '居中裁剪',
    accept: 'image/*',
    outputExt: 'jpeg',
    engine: 'image',
    options: [
      { key: 'width', label: '输出宽度 (px)', type: 'number', min: 16, max: 8192, step: 16, default: 1080, hint: '裁剪后的画布宽度，居中裁剪。' },
      { key: 'height', label: '输出高度 (px)', type: 'number', min: 16, max: 8192, step: 16, default: 1080, hint: '裁剪后的画布高度，居中裁剪。' },
      { key: 'format', label: '输出格式', type: 'select', choices: [
        { value: 'jpeg', label: 'JPEG' },
        { value: 'webp', label: 'WebP' },
        { value: 'png', label: 'PNG' },
      ], default: 0, hint: 'JPEG 通用、WebP 体积更小、PNG 无损。' },
      { key: 'quality', label: '质量', type: 'number', min: 0.1, max: 1, step: 0.05, default: 1, hint: '0.1–1，越接近 1 越清晰、文件越大。' },
    ],
    runImage: async (blob, opts) => {
      const outW = num(opts.width, 1080);
      const outH = num(opts.height, 1080);
      const fmt = String(opts.format ?? 'jpeg');
      const mime = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg';
      const img = await decodeImage(blob);
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      const srcRatio = srcW / srcH;
      const outRatio = outW / outH;
      let cropW: number;
      let cropH: number;
      if (srcRatio > outRatio) {
        cropH = srcH;
        cropW = Math.round(srcH * outRatio);
      } else {
        cropW = srcW;
        cropH = Math.round(srcW / outRatio);
      }
      const sx = Math.round((srcW - cropW) / 2);
      const sy = Math.round((srcH - cropH) / 2);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      canvas.getContext('2d')?.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH);
      const outBlob = await canvasToBlob(canvas, mime, fmt === 'png' ? undefined : num(opts.quality, 0.9));
      return { blob: outBlob, outputExt: fmt === 'jpeg' ? 'jpg' : fmt };
    },
  },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  audio: '🎵 Audio',
  video: '🎬 Video',
  image: '🖼️ Image',
};

// ---- Conversion entry point ---------------------------------------------------

async function convertVideoToImages(
  file: File,
  opts: Record<string, unknown>,
  onProgress: (ratio: number) => void
): Promise<ConvertResult> {
  const JSZip = (await import('jszip')).default;
  const ffmpeg = await getFFmpeg();
  const extMatch = /\.([a-z0-9]+)$/i.exec(file.name);
  const inputName = `input.${extMatch ? extMatch[1].toLowerCase() : 'bin'}`;
  const fmt = String(opts.format ?? 'png');
  const frames = Math.max(1, Math.min(500, num(opts.frames, 500)));
  const pattern = `frame_%03d.${fmt}`;

  await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));

  const progressHandler = (event: { progress: number; time: number }) => {
    onProgress(event.progress);
  };
  ffmpeg.on('progress', progressHandler);
  try {
    const exitCode = await ffmpeg.exec(['-i', inputName, '-vf', 'fps=1', '-frames:v', String(frames), pattern]);
    if (exitCode !== 0) {
      await ffmpeg.deleteFile(inputName).catch(() => undefined);
      throw new Error(`FFmpeg 抽帧失败（退出码 ${exitCode}）`);
    }
  } finally {
    ffmpeg.off('progress', progressHandler);
  }

  const zip = new JSZip();
  let index = 1;
  for (;;) {
    const name = `frame_${String(index).padStart(3, '0')}.${fmt}`;
    try {
      const data = await ffmpeg.readFile(name);
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      zip.file(name, bytes);
      await ffmpeg.deleteFile(name).catch(() => undefined);
    } catch {
      break;
    }
    index += 1;
    if (index > 500) break;
  }

  await ffmpeg.deleteFile(inputName).catch(() => undefined);
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blobs: [blob], outputNames: [`${baseNameOf(file.name)}-frames.zip`] };
}

async function convertAudioMix(
  file: File,
  file2: File,
  opts: Record<string, unknown>,
  onProgress: (ratio: number) => void,
  onLog?: (line: string) => void
): Promise<ConvertResult> {
  const ffmpeg = await getFFmpeg();
  const extOf = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] || 'wav').toLowerCase();
  const name0 = `in0.${extOf(file.name)}`;
  const name1 = `in1.${extOf(file2.name)}`;
  await ffmpeg.writeFile(name0, new Uint8Array(await file.arrayBuffer()));
  await ffmpeg.writeFile(name1, new Uint8Array(await file2.arrayBuffer()));

  const bd = String(opts.bitDepth ?? '32');
  const sr = String(opts.sampleRate ?? '192000');
  const codec = bd === '24' ? 'pcm_s24le' : bd === '32' ? 'pcm_s32le' : 'pcm_s16le';

  const progressHandler = (event: { progress: number; time: number }) => {
    onProgress(event.progress);
  };
  const logHandler = (event: { message: string }) => {
    if (event && typeof event.message === 'string') onLog?.(event.message);
  };
  ffmpeg.on('progress', progressHandler);
  ffmpeg.on('log', logHandler);

  const outputName = 'mixed.wav';
  let exitCode = 0;
  try {
    exitCode = await ffmpeg.exec([
      '-i', name0, '-i', name1,
      '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0',
      '-vn', '-acodec', codec, '-ar', sr, outputName,
    ]);
  } finally {
    ffmpeg.off('progress', progressHandler);
    ffmpeg.off('log', logHandler);
  }

  await ffmpeg.deleteFile(name0).catch(() => undefined);
  await ffmpeg.deleteFile(name1).catch(() => undefined);
  if (exitCode !== 0) {
    await ffmpeg.deleteFile(outputName).catch(() => undefined);
    throw new Error(`音频叠加失败（退出码 ${exitCode}），请确认两段音频格式有效，或调低位深 / 采样率后重试`);
  }

  const output = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(outputName).catch(() => undefined);
  const bytes = typeof output === 'string' ? new TextEncoder().encode(output) : new Uint8Array(output);
  return { blobs: [new Blob([bytes])], outputNames: [`${baseNameOf(file.name)}-mixed.wav`] };
}

export async function convertWithTool(
  tool: MediaTool,
  file: File,
  opts: Record<string, unknown>,
  onProgress: (ratio: number) => void,
  onLog?: (line: string) => void,
  file2?: File | null
): Promise<ConvertResult> {
  if (tool.id === 'audio-mixer') {
    if (!file2) throw new Error('请选择两段音频后再转换');
    return convertAudioMix(file, file2, opts, onProgress, onLog);
  }

  if (tool.id === 'video-to-images') {
    return convertVideoToImages(file, opts, onProgress);
  }

  if (tool.engine === 'image' && tool.runImage) {
    const result = await tool.runImage(file, opts);
    return { blobs: [result.blob], outputNames: [`${baseNameOf(file.name)}.${result.outputExt}`] };
  }

  const fmt = String(opts.format ?? '');
  const ext = ['mp3', 'wav', 'ogg', 'flac'].includes(fmt) ? fmt : tool.outputExt;
  const outputName = `${baseNameOf(file.name)}.${ext}`;
  const blob = await runFFmpeg({
    file,
    outputName,
    args: (input, output) =>
      tool.buildArgs ? tool.buildArgs(input, output, opts) : ['-i', input, output],
    onProgress: (p) => onProgress(p.ratio),
    onLog,
  });
  return { blobs: [blob], outputNames: [outputName] };
}

export function defaultOptions(tool: MediaTool): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const option of tool.options ?? []) {
    if (option.type === 'select') {
      const first = option.choices?.[0]?.value ?? '';
      result[option.key] = String(option.default && option.default > 0 ? option.default : first);
    } else {
      result[option.key] = Number(option.default ?? 0);
    }
  }
  return result;
}
