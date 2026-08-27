import { useMemo, useRef, useState } from 'react';
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
        className="w-full px-3 py-2 rounded-lg border outline-none"
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
      className="w-full px-3 py-2 rounded-lg border outline-none"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
      }}
    />
  );
}

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

  const tools = useMemo(() => MEDIA_TOOLS.filter((tool) => tool.category === category), [category]);

  function chooseTool(tool: MediaTool) {
    setSelected(tool);
    setFile(null);
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

  async function handleConvert() {
    if (!file || !selected) return;
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
        (line) => setLog((prev) => [...prev.slice(-40), line])
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

  return (
    <div className="max-w-7xl mx-auto">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-10 justify-center">
        {(Object.keys(categoryLabels) as Category[]).map((key) => {
          const active = category === key;
          const count = MEDIA_TOOLS.filter((t) => t.category === key).length;
          return (
            <button
              key={key}
              onClick={() => {
                setCategory(key);
                setSelected(null);
              }}
              className="px-5 py-2 rounded-full border transition-colors cursor-pointer"
              style={active
                ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--bg-primary)' }
                : { backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {categoryLabels[key]}
              <span className="ml-2 text-xs opacity-80">({count})</span>
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
              className="p-4 rounded-xl border text-left transition-all hover:-translate-y-0.5 cursor-pointer"
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
                className="text-sm mb-2 cursor-pointer hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                ← 返回工具列表
              </button>
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{selected.label}</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selected.subtitle}</p>
            </div>
            {file && (
              <div className="text-right text-sm max-w-[220px] truncate" style={{ color: 'var(--text-secondary)' }}>
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{file.name}</div>
                <div>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            )}
          </div>

          {/* File drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files?.[0] ?? null;
              if (dropped) setInputFile(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed p-10 text-center mb-6 cursor-pointer transition-colors"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={selected.accept}
              className="hidden"
              onChange={(e) => setInputFile(e.target.files?.[0] ?? null)}
            />
            <div className="text-3xl mb-2">📁</div>
            <p style={{ color: 'var(--text-primary)' }}>
              {file ? '点击或拖入新文件替换' : '点击选择文件，或将文件拖到这里'}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              支持 {selected.accept}
            </p>
          </div>

          {/* Options */}
          {selected.options && selected.options.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {selected.options.map((option) => (
                <label key={option.key} className="block">
                  <span className="text-sm block mb-1" style={{ color: 'var(--text-secondary)' }}>{option.label}</span>
                  <OptionControl
                    option={option}
                    value={options[option.key]}
                    onChange={(next) => setOptions((prev) => ({ ...prev, [option.key]: next }))}
                  />
                </label>
              ))}
            </div>
          )}

          {/* Convert button + progress */}
          <button
            onClick={handleConvert}
            disabled={!file || isBusy}
            className="w-full py-3 rounded-xl font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="mb-3" style={{ color: 'var(--text-primary)' }}>
                ✅ 转换完成（{result.blobs.reduce((sum, blob) => sum + blob.size, 0) / 1024 / 1024 >= 1
                  ? `${(result.blobs.reduce((sum, blob) => sum + blob.size, 0) / 1024 / 1024).toFixed(2)} MB`
                  : `${Math.round(result.blobs.reduce((sum, blob) => sum + blob.size, 0) / 1024)} KB`}）
              </p>
              <div className="flex flex-wrap gap-3">
                {result.blobs.map((blob, index) => (
                  <button
                    key={index}
                    onClick={() => download(blob, result.names[index])}
                    className="px-4 py-2 rounded-lg font-medium cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
                  >
                    ⬇️ 下载 {result.names[index]}
                  </button>
                ))}
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
