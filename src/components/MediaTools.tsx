import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORY_LABELS as categoryLabels,
  convertWithTool,
  defaultOptions,
  MEDIA_TOOLS,
  type Category,
  type MediaTool,
  type ToolOption,
} from '../utils/media-tools';

type Status = 'idle' | 'loading' | 'processing' | 'done' | 'error';

interface ConvertResult {
  blobs: Blob[];
  names: string[];
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type PreviewKind = 'image' | 'audio' | 'video' | 'other';

function classifyPreview(file: File): PreviewKind {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'wma'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg', 'wmv'].includes(ext)) return 'video';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'].includes(ext)) return 'image';
  return 'other';
}

function classifyOutputName(name: string): PreviewKind {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'wma'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg', 'wmv'].includes(ext)) return 'video';
  return 'other';
}

function AudioPreview({ url, className }: { url: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // 绘制波形：加高容器并在上下留边距，峰值不会被裁切
  useEffect(() => {
    if (!url || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let audioCtx: AudioContext | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const AudioCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;
        audioCtx = new AudioCtor();
        const audioBuf = await audioCtx.decodeAudioData(buf);
        if (cancelled) return;
        const data = audioBuf.getChannelData(0);
        const w = canvas.width;
        const h = canvas.height;
        const step = Math.max(1, Math.floor(data.length / w));
        const pad = Math.ceil(h * 0.15);
        const avail = h - pad * 2;
        const mid = h / 2;
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3b82f6';
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = accent;
        for (let i = 0; i < w; i++) {
          let min = 0;
          let max = 0;
          const start = i * step;
          const end = Math.min(data.length, start + step);
          for (let j = start; j < end; j++) {
            const value = data[j];
            if (value < min) min = value;
            if (value > max) max = value;
          }
          const yTop = mid - max * (avail / 2);
          const yBottom = mid - min * (avail / 2);
          ctx.fillRect(i, Math.max(pad, yTop), 1, Math.max(1, Math.min(h - pad, yBottom) - Math.max(pad, yTop)));
        }
      } catch {
        // 解码失败时静默降级，仍保留 <audio> 播放
      } finally {
        if (audioCtx) audioCtx.close().catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
      if (audioCtx) audioCtx.close().catch(() => undefined);
    };
  }, [url]);

  // 跟随播放进度，让竖条平滑滑动
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setProgress(0);
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTime = () => setProgress(audio.currentTime);
    const onLoaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => setProgress(0);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('seeked', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('seeked', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url]);

  const pct = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;

  return (
    <div className={className}>
      <div className="relative w-full overflow-hidden rounded-lg">
        <canvas ref={canvasRef} width={640} height={128} className="w-full block" style={{ height: '128px' }} />
        <div
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            width: `${pct}%`,
            background: 'color-mix(in srgb, var(--accent) 16%, transparent)',
            transition: 'width 0.1s linear',
          }}
        />
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${pct}%`,
            width: '2px',
            transform: 'translateX(-1px)',
            background: 'var(--accent-fg)',
            boxShadow: '0 0 0 1px rgba(12, 74, 110, 0.4), 0 0 8px rgba(12, 74, 110, 0.5)',
            transition: 'left 0.1s linear',
          }}
        />
      </div>
      <audio
        ref={audioRef}
        controls
        src={url}
        className="w-full"
        style={{ colorScheme: 'light', marginTop: '0.25rem' }}
      />
    </div>
  );
}

function OptionControl({
  option,
  value,
  onChange,
}: {
  option: ToolOption;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  if (option.type === 'select') {
    return (
      <select
        value={String(value ?? option.default ?? '0')}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border outline-none focus:outline-none focus:border-[var(--accent)]"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        {option.choices?.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="number"
      min={option.min}
      max={option.max}
      step={option.step}
      value={Number(value ?? option.default ?? 0)}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className="w-full px-3 py-2 rounded-lg border outline-none focus:outline-none focus:border-[var(--accent)]"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
      }}
    />
  );
}

const TOOL_NOTES: Record<string, string> = {
  'mp3-to-ogg': 'OGG 是「容器格式」，Vorbis 才是装在里面的有损压缩编码（类似 MP3，开源无专利费）。同码率下听感通常略优于 MP3、体积更小；但苹果设备（iPhone / iTunes）原生不支持播放。注意这是有损转有损，音质不会变好，只是换成更高效的格式。',
  'mp3-to-wav': 'MP3 是有损格式，高频细节在压缩那一刻就丢了；转 WAV 只是把剩下的数据「解包」成 PCM，丢失的信息不会回来，体积却会大很多。若源文件是低码率 MP3（如 128kbps），转出的 WAV 也只是「大而无当」。把位深 / 采样率调到 16-bit / 44100 Hz 以上并不会增加真实信息，只会让文件更大。',
  'wav-to-mp3': 'WAV 存的是未压缩的 PCM 原始采样数据：CD 音质约 1411 kbps，一分钟约 10 MB；MP3 利用人耳听觉的掩蔽效应做有损压缩，去掉不易察觉的细节来大幅缩小体积。WAV → MP3 是真正的「压缩」：320 kbps 的 MP3 体积通常只有 WAV 的四分之一左右，绝大多数设备上听感与源文件几乎无异，适合日常聆听和网络分享。',
  'wav-to-flac': 'WAV 存的是未压缩的 PCM 原始采样数据，体积巨大；FLAC 是无损压缩（类似音频版 ZIP），解压后与原 WAV 逐位一致、音质零损失。它和 MP3 / OGG 那种有损不同：WAV → FLAC 音质完全不变、体积约省一半，适合归档收藏。位深 / 采样率升格不会增加真实信息，只会让文件更大。',
  'jpg-to-png': 'JPG 是有损格式，适合照片，但压缩会丢失细节，文字 / 线条 / 大面积纯色处容易出现块状伪影；PNG 是无损格式、支持透明通道，适合截图、图标与文字。JPG → PNG 不会让模糊的图变清晰——有损信息早已丢失，只是换了个无损「箱子」、文件通常更大，也无法凭空补出透明背景。',
  'png-to-jpg': 'PNG 是无损格式、支持透明通道，适合截图 / 文字 / 图标；JPG 是有损格式、不支持透明，适合照片。PNG → JPG 会把透明区域变成白色，并因有损压缩引入伪影：文字、线条、UI 截图转后边缘易发糊，照片类原图则几乎看不出差别。质量越低体积越小，但细节丢失越多。',
  'video-resizer': '注意：放大不会增加真实清晰度。超过原分辨率只是插值放大，画面更糊、文件更大；压缩体积应缩小而非放大。',
  'image-resizer': '注意：放大不增加真实细节，超过原分辨率只是插值（更糊 + 更大）。压缩体积应缩小宽度或调低质量。',
  'video-compressor': '注意：CRF 越小越清晰、文件越大。默认 18 接近无损，压缩效果很小；要真正压缩请调到 23–28（体积明显减小，画质仍可接受）。',
  'image-compressor': '注意：质量设为 1（100%）时压缩几乎不生效，体积基本不变。要真正减小体积，请调低质量或选择 WebP。',
  'video-to-images': '注意：默认最多 500 帧会打包成很大的 ZIP。长视频建议把帧数调小（如 30–60），或选 JPG 减小体积。',
};

const TOOL_TIPS: Record<string, string> = {
  'wav-to-mp3': '压缩有损且不可逆：编码后丢失的细节无法恢复，建议先保留原始 WAV 归档；码率也不必超过源文件实际质量——若源只是低码率音频，选 320 kbps 也不会让它变得更好。',
};

export default function MediaTools() {
  const [category, setCategory] = useState<Category>('audio');
  const [selected, setSelected] = useState<MediaTool | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const file2InputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [previewUrl2, setPreviewUrl2] = useState<string | null>(null);
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  const tools = useMemo(() => MEDIA_TOOLS.filter((tool) => tool.category === category), [category]);

  function chooseTool(tool: MediaTool) {
    setSelected(tool);
    setFile(null);
    setFile2(null);
    setResult(null);
    setStatus('idle');
    setError('');
    setLog([]);
    setProgress(0);
    setOptions(defaultOptions(tool));
  }

  function setInputFile(next: File | null) {
    if (next && selected && next.type && selected.accept !== 'video/*' && selected.accept !== 'image/*' && selected.accept !== 'audio/*,video/*' && selected.accept !== 'audio/*') {
      const accepted = selected.accept.split(',').map((s) => s.trim().toLowerCase());
      const typeOk = accepted.some((a) => a === next.type.toLowerCase() || (a.startsWith('.') && next.name.toLowerCase().endsWith(a)));
      if (!typeOk) {
        setError(`文件类型不匹配，请选择 ${selected.accept} 文件`);
        return;
      }
    }
    setFile(next);
    setResult(null);
    setStatus('idle');
    setError('');
  }

  function setInputFile2(next: File | null) {
    if (next && selected && next.type && selected.accept !== 'video/*' && selected.accept !== 'image/*' && selected.accept !== 'audio/*,video/*' && selected.accept !== 'audio/*') {
      const accepted = selected.accept.split(',').map((s) => s.trim().toLowerCase());
      const typeOk = accepted.some((a) => a === next.type.toLowerCase() || (a.startsWith('.') && next.name.toLowerCase().endsWith(a)));
      if (!typeOk) {
        setError(`文件类型不匹配，请选择 ${selected.accept} 文件`);
        return;
      }
    }
    setFile2(next);
    setResult(null);
    setStatus('idle');
    setError('');
  }

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file2) {
      setPreviewUrl2(null);
      return;
    }
    const url = URL.createObjectURL(file2);
    setPreviewUrl2(url);
    return () => URL.revokeObjectURL(url);
  }, [file2]);

  useEffect(() => {
    if (!result) {
      setResultUrls([]);
      return;
    }
    const urls = result.blobs.map((blob) => URL.createObjectURL(blob));
    setResultUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [result]);

  async function handleConvert() {
    if (!file || !selected) return;
    if (selected.id === 'audio-mixer' && !file2) {
      setError('请选择两段音频后再转换');
      return;
    }
    setStatus('loading');
    setProgress(0);
    setLog([]);
    setError('');
    try {
      const converted = await convertWithTool(
        selected,
        file,
        options,
        (ratio) => {
          setProgress(ratio);
          setStatus('processing');
        },
        (line) => setLog((prev) => [...prev.slice(-40), line]),
        selected.id === 'audio-mixer' ? file2 : null
      );
      setResult({ blobs: converted.blobs, names: converted.outputNames });
      setStatus('done');
      setProgress(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('error');
    }
  }

  const percent = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const isBusy = status === 'loading' || status === 'processing';
  const previewKind = file ? classifyPreview(file) : 'other';
  const requiresTwo = selected?.id === 'audio-mixer';
  const canConvert = !!file && (!requiresTwo || !!file2);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Category tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        {(Object.keys(categoryLabels) as Category[]).map((key) => {
          const active = category === key;
          const count = MEDIA_TOOLS.filter((t) => t.category === key).length;
          const icon = key === 'audio' ? '🎵' : key === 'video' ? '🎬' : '🖼️';
          const title = key === 'audio' ? 'Audio' : key === 'video' ? 'Video' : 'Image';
          const desc = key === 'audio' ? '音频转换' : key === 'video' ? '视频转换' : '图片转换';
          return (
            <button
              key={key}
              onClick={() => {
                setCategory(key);
                setSelected(null);
              }}
              className="flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border transition-all cursor-pointer hover:-translate-y-1 hover:opacity-95 active:scale-[0.98]"
              style={{
                backgroundColor: active
                  ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))'
                  : 'var(--bg-secondary)',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="text-5xl leading-none mb-1">{icon}</span>
              <span className="text-xl font-bold" style={{ color: active ? 'var(--accent)' : 'var(--text-primary)' }}>
                {title}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{desc}</span>
              <span
                className="mt-2 text-xs px-3 py-1 rounded-full border"
                style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {count} 个工具
              </span>
            </button>
          );
        })}
      </div>

      {/* Tool grid */}
      {!selected && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => chooseTool(tool)}
              className="p-4 rounded-xl border text-left transition-all hover:-translate-y-0.5 hover:opacity-90 active:scale-95 cursor-pointer"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
            >
              <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{tool.label}</div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{tool.subtitle}</div>
            </button>
          ))}
        </div>
      )}

      {/* Conversion panel */}
      {selected && (
        <div className="rounded-2xl border p-6 md:p-8" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <button
                onClick={() => { setSelected(null); setResult(null); }}
                className="text-sm mb-2 cursor-pointer hover:underline hover:opacity-80"
                style={{ color: 'var(--accent)' }}
              >
                ← 返回工具列表
              </button>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{selected.label}</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selected.subtitle}</p>
            </div>
            {file && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <span className="text-xl" style={{ color: 'var(--accent)' }}>📎</span>
                <div className="text-right text-sm max-w-[220px]">
                  <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{file.name}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || '未知类型'}</div>
                </div>
              </div>
            )}
          </div>

          {/* File drop zone */}
          {selected.id === 'audio-mixer' && (
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>音频 1（底层，可选伴奏或人声）</p>
          )}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const dropped = e.dataTransfer.files;
              if (!dropped || dropped.length === 0) return;
              setInputFile(dropped[0]);
              if (selected.id === 'audio-mixer' && dropped[1]) setInputFile2(dropped[1]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed p-10 text-center mb-6 cursor-pointer transition-all"
            style={{
              borderColor: isDragging || file ? 'var(--accent)' : 'var(--border)',
              backgroundColor: file ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))' : 'var(--bg-secondary)',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={selected.accept}
              className="hidden"
              onChange={(e) => setInputFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="flex flex-col items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                {previewUrl ? (
                  previewKind === 'video' ? (
                    <video
                      controls
                      src={previewUrl}
                      className="w-full max-h-72 rounded-lg mb-2"
                      style={{ colorScheme: 'light' }}
                    />
                  ) : previewKind === 'audio' ? (
                    <div className="w-full mb-2">
                      <AudioPreview url={previewUrl} className="w-full" />
                    </div>
                  ) : previewKind === 'image' ? (
                    <img src={previewUrl} alt="预览" className="w-28 h-28 object-contain rounded-lg mb-2" />
                  ) : (
                    <div className="text-3xl mb-1">📄</div>
                  )
                ) : (
                  <div className="text-3xl mb-1">📄</div>
                )}
                <div className="font-semibold">{file.name}</div>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || '未知类型'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>点击或拖入新文件替换</div>
              </div>
            ) : (
              <>
                <div className="text-3xl mb-2">📁</div>
                <p style={{ color: 'var(--text-primary)' }}>点击选择文件，或将文件拖到这里</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>支持 {selected.accept}</p>
              </>
            )}
          </div>

          {/* Second file slot for Audio Mixer */}
          {selected.id === 'audio-mixer' && (
            <div className="mb-6">
              <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>音频 2（第二段，叠加在音频 1 之上）</p>
              <div
                onClick={() => file2InputRef.current?.click()}
                className="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all"
                style={{
                  borderColor: file2 ? 'var(--accent)' : 'var(--border)',
                  backgroundColor: file2 ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))' : 'var(--bg-secondary)',
                }}
              >
                <input
                  ref={file2InputRef}
                  type="file"
                  accept={selected.accept}
                  className="hidden"
                  onChange={(e) => setInputFile2(e.target.files?.[0] ?? null)}
                />
                {file2 ? (
                  <div className="flex flex-col items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                    {previewUrl2 && (
                      <div className="w-full mb-1">
                        <AudioPreview url={previewUrl2} className="w-full" />
                      </div>
                    )}
                    <div className="font-semibold">{file2.name}</div>
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {(file2.size / 1024 / 1024).toFixed(2)} MB · {file2.type || '未知类型'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>点击替换</div>
                  </div>
                ) : (
                  <>
                    <div className="text-3xl mb-1">🎵</div>
                    <p style={{ color: 'var(--text-primary)' }}>点击选择第二段音频</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>例如伴奏或人声</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Quality warning */}
          {selected.options && selected.options.length > 0 && (
            <div
              className="mb-6 flex items-start gap-3 p-3 rounded-xl border text-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))',
                borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--border))',
                color: 'var(--text-primary)',
              }}
            >
              <span className="text-lg leading-none">⚠️</span>
              <p className="leading-relaxed">
                默认已用较高质量（高分辨率 / 高帧率 / 高码率），耗时更长、内存占用更大；若转换失败，说明浏览器 FFmpeg 内存爆了，请手动把
                <span className="font-medium" style={{ color: 'var(--accent)' }}> 帧率、px 或 质量 </span>
                调低后重试。
              </p>
            </div>
          )}

          {/* Options */}
          {selected.options && selected.options.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {selected.options
                .filter((option) => {
                  if (selected.category !== 'audio') return true;
                  const fmt = String(options.format ?? '');
                  if (option.key === 'quality') return fmt === 'mp3' || !options.format;
                  if (option.key === 'bitDepth' || option.key === 'sampleRate') return fmt === 'wav' || fmt === 'flac' || !options.format;
                  return true;
                })
                .map((option) => (
                <label key={option.key} className="block">
                  <span className="text-sm block mb-1" style={{ color: 'var(--text-secondary)' }}>{option.label}</span>
                  {option.hint && (
                    <span className="block mb-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                      {option.hint}
                    </span>
                  )}
                  <OptionControl
                    option={option}
                    value={options[option.key]}
                    onChange={(next) => setOptions((prev) => ({ ...prev, [option.key]: next }))}
                  />
                </label>
                ))}
            </div>
          )}

          {/* Audio bit depth / sample rate + lossy科普 */}
          {(() => {
            const sel = selected;
            if (!sel || !sel.options?.some((option) => option.key === 'bitDepth')) return null;
            const fmt = String(options.format ?? '');
            const showBitDepth = fmt === 'wav' || fmt === 'flac' || !fmt;
            const lossyTools = ['audio-cutter', 'audio-converter', 'video-to-audio', 'audio-mixer'];
            const showLossy = lossyTools.includes(sel.id) && showBitDepth;
            if (!showBitDepth && !showLossy) return null;
            return (
              <div
                className="mb-6 p-3 rounded-xl border text-xs leading-relaxed"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {showBitDepth && (
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                      💡 位深与采样率
                    </p>
                    <ul className="pl-4 space-y-1 list-disc">
                      <li>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>位深</span>
                        ：单个采样点的精度，越高越细腻。16-bit 已是 CD 标准；24/32-bit 动态范围更宽，但文件更大。
                      </li>
                      <li>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>采样率</span>
                        ：每秒记录多少个采样点。44100 Hz 即 CD 标准；96000 / 192000 Hz 用于高解析度音频。
                      </li>
                      <li>
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>实用结论</span>
                        ：普通转换用 16-bit / 44100 Hz 就足够，再往上调不会增加真实音频信息，只会让文件更大；高位深的真正价值在于混音处理（如 Audio Mixer）与归档高质量母带。
                      </li>
                    </ul>
                  </div>
                )}
                {showLossy && (
                  <div className={showBitDepth ? 'mt-2.5 pt-2.5 border-t' : ''} style={{ borderColor: 'var(--border)' }}>
                    <p className="flex items-center gap-1.5 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                      ⚠️ 有损转无损 ≠ 音质提升
                    </p>
                    <ul className="pl-4 space-y-1 list-disc">
                      <li>MP3 / AAC / OGG 等有损格式在压缩那一刻就丢掉了高频细节，丢失的信息永远不会回来。</li>
                      <li>把它们转成 WAV / FLAC 只是把「剩余数据」解包成 PCM：体积会大很多，听感却不会变好。</li>
                      <li>低码率 MP3（如 128 kbps）转出的无损文件属于「大而无当」，只在需要统一格式 / 兼容旧设备时才值得转。</li>
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          {TOOL_NOTES[selected.id] && (
            <div
              className="mb-6 flex items-start gap-3 p-3 rounded-xl border text-xs leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="text-base leading-none">💡</span>
              <div>
                <p>{TOOL_NOTES[selected.id]}</p>
                {TOOL_TIPS[selected.id] && (
                  <p className="mt-1 font-semibold" style={{ color: 'var(--text-primary)' }}>
                    ⚠️ {TOOL_TIPS[selected.id]}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Convert button + progress */}
          <button
            onClick={handleConvert}
            disabled={!canConvert || isBusy}
            className="w-full py-3 rounded-xl font-semibold transition-all cursor-pointer hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
          >
            {isBusy ? (status === 'loading' ? '正在加载 FFmpeg 引擎（首次约需 10-30 秒）…' : `转换中 ${percent}%`) : '开始转换'}
          </button>

          {(isBusy || status === 'done') && (
            <div className="mt-4">
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div
                  className="h-full transition-all duration-200"
                  style={{ width: `${percent}%`, backgroundColor: 'var(--accent)' }}
                />
              </div>
            </div>
          )}

          {log.length > 0 && (
            <pre className="mt-4 p-3 rounded-lg text-xs overflow-auto max-h-40" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
              {log.join('\n')}
            </pre>
          )}

          {error && (
            <p className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: '#e5484d' }}>
              {error}
            </p>
          )}

          {status === 'done' && result && (
            <div className="mt-6 p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <p className="mb-4" style={{ color: 'var(--text-primary)' }}>
                ✅ 转换完成（{result.blobs.reduce((sum, blob) => sum + blob.size, 0) / 1024 / 1024 >= 1
                  ? `${(result.blobs.reduce((sum, blob) => sum + blob.size, 0) / 1024 / 1024).toFixed(2)} MB`
                  : `${Math.round(result.blobs.reduce((sum, blob) => sum + blob.size, 0) / 1024)} KB`}）
              </p>
              <div className="flex flex-wrap gap-4">
                {result.blobs.map((blob, index) => {
                  const kind = classifyOutputName(result.names[index]);
                  const url = resultUrls[index];
                  return (
                    <div
                      key={index}
                      className="flex-1 min-w-[260px] max-w-full p-4 rounded-xl border"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    >
                      <div className="mb-3">
                        {url && kind === 'image' && (
                          <img src={url} alt={result.names[index]} className="w-full max-h-72 object-contain rounded-lg" />
                        )}
                        {url && kind === 'audio' && (
                          <div className="w-full">
                            <AudioPreview url={url} className="w-full" />
                          </div>
                        )}
                        {url && kind === 'video' && (
                          <video controls src={url} className="w-full max-h-72 rounded-lg" style={{ backgroundColor: '#000', colorScheme: 'light' }} />
                        )}
                        {kind === 'other' && (
                          <div className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
                            📦 该格式暂不支持预览
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => download(blob, result.names[index])}
                        className="w-full px-4 py-2 rounded-lg font-medium transition-all cursor-pointer hover:opacity-90 active:scale-95"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
                      >
                        ⬇️ 下载 {result.names[index]}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      <p className="text-center mt-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
        🔒 所有转换都在你的浏览器本地完成，文件不会上传到任何服务器。
      </p>
    </div>
  );
}
