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
  'mp3-to-wav': 'MP3 是有损格式，高频细节在压缩那一刻就丢了；转 WAV 只是把剩下的数据「解包」成 PCM，丢失的信息不会回来，体积却会大很多。若源文件是低码率 MP3（如 128kbps），转出的 WAV 也只是「大而无当」。把位深 / 采样率调到 16-bit / 44100 Hz 以上并不会增加真实信息，只会让文件更大。',
  'wav-to-mp3': 'WAV 存的是未压缩的 PCM 原始采样数据：CD 音质约 1411 kbps，一分钟约 10 MB；MP3 利用人耳听觉的掩蔽效应做有损压缩，去掉不易察觉的细节来大幅缩小体积。WAV → MP3 是真正的「压缩」：320 kbps 的 MP3 体积通常只有 WAV 的四分之一左右，绝大多数设备上听感与源文件几乎无异，适合日常聆听和网络分享。',
  'wav-to-flac': 'WAV 存的是未压缩的 PCM 原始采样数据，体积巨大；FLAC 是无损压缩（类似音频版 ZIP），解压后与原 WAV 逐位一致、音质零损失。它和 MP3 / OGG 那种有损不同：WAV → FLAC 音质完全不变、体积约省一半，适合归档收藏。位深 / 采样率升格不会增加真实信息，只会让文件更大。',
  'jpg-to-png': 'JPG 是有损格式，适合照片，但压缩会丢失细节，文字 / 线条 / 大面积纯色处容易出现块状伪影；PNG 是无损格式、支持透明通道，适合截图、图标与文字。JPG → PNG 不会让模糊的图变清晰——有损信息早已丢失，只是换了个无损「箱子」、文件通常更大，也无法凭空补出透明背景。',
  'png-to-jpg': 'PNG 是无损格式、支持透明通道，适合截图 / 文字 / 图标；JPG 是有损格式、不支持透明，适合照片。PNG → JPG 会把透明区域变成白色，并因有损压缩引入伪影：文字、线条、UI 截图转后边缘易发糊，照片类原图则几乎看不出差别。质量越低体积越小，但细节丢失越多。',
  'image-resizer': '注意：放大不增加真实细节，超过原分辨率只是插值（更糊 + 更大）。压缩体积应缩小宽度或调低质量。',
  'image-compressor': '注意：质量设为 1（100%）时压缩几乎不生效，体积基本不变。要真正减小体积，请调低质量或选择 WebP。',
  'video-to-images': '注意：默认最多 500 帧会打包成很大的 ZIP。长视频建议把帧数调小（如 30–60），或选 JPG 减小体积。',
};

const TOOL_TIPS: Record<string, string> = {
  'wav-to-mp3': '压缩有损且不可逆：编码后丢失的细节无法恢复，建议先保留原始 WAV 归档；码率也不必超过源文件实际质量——若源只是低码率音频，选 320 kbps 也不会让它变得更好。',
};

const TOOL_GUIDES: Record<string, { title: string; items: { lead: string; text: string }[] }> = {
  'mp4-to-gif': {
    title: 'GIF 科普：老格式，只为「到处能贴的动图」',
    items: [
      {
        lead: '格式特性',
        text: 'GIF 诞生于 1987 年：单帧最多 256 色、每帧都要完整保存、不会高效压缩视频。它适合短小的表情 / 演示片段，不适合长视频与高清画面。',
      },
      {
        lead: '体积巨大',
        text: '同样内容下，GIF 通常比 MP4 大数倍甚至十几倍；帧率、分辨率、时长任一拉高，体积都会快速膨胀。',
      },
      {
        lead: '帧率建议',
        text: '播放器按帧延迟播放 GIF（浏览器下限约 20ms ≈ 50fps，本工具上限即 50）。太低会明显卡顿，10–30 是常见区间；超过约 30 对观感提升很小，文件与解码负担却成倍上涨，播放反而更卡。',
      },
      {
        lead: '只有 256 色',
        text: '照片、天空渐变等连续色彩容易产生「色带」。本工具已用 palettegen / paletteuse 优化调色板来减轻色带，复杂画面仍可能出现肉眼可见的色块。',
      },
      {
        lead: '实用建议',
        text: '要清晰、体积小的动图，优先输出 MP4 / WebM；GIF 只在需要直接贴进聊天、论坛或旧设备时才值得转。',
      },
    ],
  },
  'gif-to-mp4': {
    title: 'GIF → MP4：为什么转成 MP4 通常更合适',
    items: [
      {
        lead: '编码优势',
        text: 'MP4 用 H.264（本工具即 H.264 + AAC）高效压缩视频，同样内容体积通常比 GIF 小数倍，画质也更稳定，浏览器、手机、社交平台普遍能放。',
      },
      {
        lead: '色彩更多',
        text: 'MP4 支持全彩，不再受 GIF 的 256 色限制；但源 GIF 本身只有 256 色，转 MP4 只是「无损搬进新容器」，不会凭空补回丢失的颜色。',
      },
      {
        lead: '帧率如实',
        text: 'GIF 每帧完整保存、帧率通常不高，转 MP4 只是按原 GIF 的帧画面编码，不会让它变得更流畅；想要顺滑动画，最好回到源视频重新导出。',
      },
      {
        lead: '透明背景',
        text: 'GIF 若有透明背景，转 MP4 时透明部分会被填成纯色（通常是黑底或白底）。需要保留透明请输出 WebM，或用 PNG 序列。',
      },
      {
        lead: '实用建议',
        text: '把 GIF 转成 MP4 适合存档、发到聊天 / 视频平台、投屏展示；若源 GIF 画质一般，转完依旧是那个画质，不会变清晰。',
      },
    ],
  },
  'mp4-to-webm': {
    title: 'MP4 → WebM：VP9 与 Opus 是什么',
    items: [
      {
        lead: 'WebM 容器',
        text: 'WebM 是面向网页的开源容器（源自 Matroska），视频用 VP9、音频用 Opus，浏览器原生支持、无需插件，适合网页嵌入与流媒体。',
      },
      {
        lead: 'VP9 视频编码',
        text: 'Google 开源、免专利费，同码率下通常比 H.264 更清晰、体积更小，尤其适合高分辨率画面；代价是编码更慢、内存占用更高。',
      },
      {
        lead: 'Opus 音频编码',
        text: '开源高压缩音频编码，比 AAC / MP3 更高效，对语音与低码率场景表现尤其好，码率越低优势越明显。',
      },
      {
        lead: '兼容性提醒',
        text: '老浏览器与部分设备（尤其较旧 iOS / Safari）可能不支持 VP9；要最大程度兼容各平台，建议保留 MP4（H.264）。',
      },
      {
        lead: '实用建议',
        text: 'WebM 适合自己站点 / 博客内嵌、开源与无版权顾虑的场景；追求「谁都能播」时选 MP4 更稳妥。',
      },
    ],
  },
  'png-to-webp': {
    title: 'PNG → WebP：现代网页图片格式',
    items: [
      {
        lead: 'WebP 是什么',
        text: 'Google 推出的现代图片格式，同时支持有损与无损压缩，还能带透明通道，同等画质下体积通常比 JPG / PNG 更小。',
      },
      {
        lead: '有损 / 无损',
        text: '有损 WebP 类似 JPG，适合照片；无损 WebP 类似 PNG 且支持透明，适合图标、截图、UI 素材。本工具可调质量：越接近 1 越清晰、文件越大。',
      },
      {
        lead: '为何更适合网页',
        text: '体积小就能加快网页加载、节省流量，现代浏览器（Chrome / Edge / Firefox / Safari 14+）普遍原生支持。',
      },
      {
        lead: '兼容性提示',
        text: '旧版浏览器、老系统内置图片查看器以及部分编辑 / 打印软件支持有限；需要极致兼容时可用 PNG 或 JPG 兜底。',
      },
      {
        lead: '实用建议',
        text: '网页素材优先转 WebP；若源图是照片选有损（质量适中即可），图标 / UI 建议用无损或高质量。',
      },
    ],
  },
  'webm-to-mp4': {
    title: 'WebM → MP4：为什么要转，以及 H.264 / AAC',
    items: [
      {
        lead: 'MP4 是什么',
        text: 'MP4 是最通用的视频容器：视频用 H.264、音频用 AAC（本工具即此组合），几乎被所有设备、浏览器、社交与视频平台原生支持。',
      },
      {
        lead: '为什么转',
        text: 'WebM / VP9 在老浏览器、较旧 iOS / Safari 以及部分设备上支持较差；转成 H.264 后基本「谁都能播」，适合发给别人、上传平台或投屏。',
      },
      {
        lead: '画质与体积',
        text: 'H.264 在同等画质下体积通常略大于 VP9。若源 WebM 码率不高，转完体积可能稍涨，这是为兼容性付出的代价。',
      },
      {
        lead: '有损转有损',
        text: 'VP9 视频、Opus 音频都是已经压缩过的有损数据，再编成 H.264 / AAC 仍是有损转有损：画质不会变好，只会因二次压缩稍有损耗。',
      },
      {
        lead: '实用建议',
        text: '需要到处分享 / 播放时就转 MP4；若只是自己站点内嵌且浏览器都较新，保留 WebM 体积更优。',
      },
    ],
  },
  'jpg-to-webp': {
    title: 'JPG → WebP：更小的照片格式',
    items: [
      {
        lead: 'WebP 是什么',
        text: 'Google 的现代图片格式，支持有损 / 无损压缩、也能带透明；同等画质下体积通常比 JPG 更小，尤其适合网页图片。',
      },
      {
        lead: '有损转有损',
        text: 'JPG 本身已是有损压缩，转成 WebP 属于「有损再压缩」：画质不会变好，但通常能进一步减小体积；细节已丢失的部分不会回来。',
      },
      {
        lead: '质量参数',
        text: '本工具用有损 WebP 并支持调质量：越接近 1 越清晰、文件越大；照片建议适中（如 0.8 左右）在体积与画质间平衡。',
      },
      {
        lead: '兼容性提示',
        text: '现代浏览器（Chrome / Edge / Firefox / Safari 14+）普遍支持；老系统看图器、部分编辑 / 打印软件可能打不开，需要兼容可保留 JPG 或转 PNG。',
      },
      {
        lead: '实用建议',
        text: '网页照片、图库素材优先转 WebP 来压缩体积；若用于打印或老设备，保留 JPG 更保险。',
      },
    ],
  },
  'webp-to-png': {
    title: 'WebP → PNG：无损输出与用途',
    items: [
      {
        lead: '无损失真',
        text: 'PNG 的「无损」指解码后逐像素保存原始数据。WebP 若本来就是无损，转 PNG 不会有损失；若是之前有损压缩过的，丢失的细节也不会回来。',
      },
      {
        lead: 'PNG 特点',
        text: 'PNG 无损、支持透明通道、几乎被所有编辑与查看软件支持，适合图标、截图、文字、UI 素材以及需要再编辑的场景。',
      },
      {
        lead: '体积更大',
        text: 'PNG 面向无损，通常比 WebP 大得多，尤其是照片与渐变画面；这是为了「通用 + 无损」付出的体积代价。',
      },
      {
        lead: '何时适合转',
        text: '需要交给老软件编辑、打印、投稿，或要保留透明并要求无损时，PNG 更稳妥；单纯为了网页压缩则应继续用 WebP。',
      },
    ],
  },
  'video-resizer': {
    title: 'Video Resizer：缩放分辨率前先了解',
    items: [
      {
        lead: '缩放做什么',
        text: '缩放会改变画面的像素分辨率（这里按宽度等比缩放）。取决于你是放大还是缩小，结果完全不同。',
      },
      {
        lead: '放大 ≠ 更清晰',
        text: '超过源分辨率的放大只是插值（软件凭空补像素）：画面不会变清晰，只会更糊、文件更大。不建议超过源视频原始分辨率。',
      },
      {
        lead: '缩小能省体积',
        text: '把大分辨率降到合适宽度会明显减小文件体积，比如 4K 降到 1080p / 720p，适合网页上传与分享；过度缩小则会丢失细节。',
      },
      {
        lead: '比例保持',
        text: '本工具只改宽度、高度按原比例自动伸缩，不会把画面压扁或拉长，放心使用。',
      },
      {
        lead: '实用建议',
        text: '网页 / 聊天发送可考虑 1280 或 720；想要小体积但不糊，先降分辨率再配合较低码率即可。',
      },
    ],
  },
  'video-compressor': {
    title: 'Video Compressor：H.264 与 CRF 怎么调',
    items: [
      {
        lead: '压缩原理',
        text: 'H.264 是有损压缩，用 CRF（恒定质量因子）在「质量」和「文件大小」间取平衡：数字越小越清晰、文件越大；越大越糊、体积越小。',
      },
      {
        lead: '常用档位',
        text: '约 18 接近无损、体积大；23 是质量不错且体积小的日常好选择；26–28 体积很小、细节开始糊。默认 18 压缩效果很有限，真要省空间请调到 23–28。',
      },
      {
        lead: '和 Resizer 的区别',
        text: 'Compressor 保持分辨率、只压码率换体积；Resizer 直接降低分辨率。两者可叠加：先降到 720p 再用 23–28 压缩，体积最小。',
      },
      {
        lead: '有损会累积',
        text: '每次压缩都会损失一些细节，反复转码会叠加劣化；建议保留一份原始文件，压缩版只用于分享。',
      },
      {
        lead: '实用建议',
        text: '网页 / 聊天发送用 23–28；想留素材或继续剪辑就用 18–20 保质量。',
      },
    ],
  },
  'mp3-to-ogg': {
    title: 'MP3 → OGG：说说 Vorbis 编码',
    items: [
      {
        lead: 'OGG 是容器',
        text: 'OGG 只是「打包盒」，不负责压缩；真正干活的是装在里面、类似 MP3 的有损编码——这里就是 Vorbis。',
      },
      {
        lead: 'Vorbis 特点',
        text: '开源、免专利费，同码率下通常比 MP3 略小、听感更稳，适合想摆脱专利限制、或偏开源生态的场景。',
      },
      {
        lead: '有损转有损',
        text: 'MP3 本来就是有损，转 OGG 是「重新编码一次」，听感不会变好；它更像换了个更高效的编码，体积可能再小一点。',
      },
      {
        lead: '兼容性提醒',
        text: 'Windows、Android、大多开源播放器都支持；苹果设备（iPhone / iTunes）原生不支持播放 OGG，介意的话用 MP3 或 AAC。',
      },
      {
        lead: '实用建议',
        text: '想在 Android / 开源设备上省点空间、且不涉及苹果就转 OGG；反之继续保持 MP3 / AAC 用途更广。',
      },
    ],
  },
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
                <label key={option.key} className="flex flex-col">
                  <span className="text-sm block mb-1" style={{ color: 'var(--text-secondary)' }}>{option.label}</span>
                  {option.hint && (
                    <span className="block mb-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                      {option.hint}
                    </span>
                  )}
                  <div className="mt-auto">
                    <OptionControl
                      option={option}
                      value={options[option.key]}
                      onChange={(next) => setOptions((prev) => ({ ...prev, [option.key]: next }))}
                    />
                  </div>
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

          {TOOL_GUIDES[selected.id] && (
            <div
              className="mb-6 p-3 rounded-xl border text-xs leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <p className="flex items-center gap-1.5 font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                💡 {TOOL_GUIDES[selected.id].title}
              </p>
              <ul className="pl-4 space-y-1.5 list-disc">
                {TOOL_GUIDES[selected.id].items.map((item, index) => (
                  <li key={index}>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{item.lead}：</span>
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
