import { useState } from 'react';
import type { UnifiedGame } from '../utils/unified-games';
import type { SteamAchievement, SteamGlobalAchievement } from '../utils/steam';

// The achievement panel uses a translucent near-black so the page shows
// through. Cards are solid; hover glow matches the Games accent (#1c1917).
const PANEL_BG = 'rgba(28,25,23,0.86)';
const PANEL_BORDER = 'rgba(255,255,255,0.14)';
const CARD_BG = '#44403c';
const TRACK_BG = 'rgba(255,255,255,0.14)';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = 'rgba(255,255,255,0.75)';
const PROGRESS_FILL = '#ffffff';

interface AchievementPanelProps {
  game: UnifiedGame;
  achievements: SteamAchievement[];
  global: SteamGlobalAchievement[];
  loading: boolean;
  error: boolean;
  onClose: () => void;
}

type Tab = 'mine' | 'global';

export default function AchievementPanel({ game, achievements, global, loading, error, onClose }: AchievementPanelProps) {
  const [tab, setTab] = useState<Tab>('mine');
  // Tracks which hidden achievements have been revealed by clicking the card,
  // mirroring Steam's library "click to reveal a hidden achievement".
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const unlocked = achievements.filter((a) => a.achieved).length;
  const total = achievements.length;
  const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;
  const globalAvg = global.length > 0 ? Math.round(global.reduce((sum, g) => sum + g.percent, 0) / global.length) : 0;
  const globalByApiname = new Map(global.map((g) => [g.apiname.toLowerCase(), g.percent]));
  // Hidden achievements stay masked as "???" until unlocked or clicked, mirroring Steam.
  const isSecret = (a: SteamAchievement, forceSecret = false) => !!a.hidden && (forceSecret || !a.achieved);

  const toggleReveal = (apiname: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(apiname)) next.delete(apiname);
      else next.add(apiname);
      return next;
    });
  };

  return (
    <div
      className="mt-12 p-6 rounded-xl border"
      style={{ backgroundColor: PANEL_BG, borderColor: PANEL_BORDER }}
    >
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-2xl font-bold" style={{ color: TEXT_PRIMARY }}>{game.name}</h3>
          <div className="text-sm mt-1" style={{ color: TEXT_SECONDARY }}>
            {tab === 'mine'
              ? `成就 ${unlocked}/${total} · 完成度 ${pct}%`
              : `全球成就 · ${total} 项 · 平均解锁率 ${globalAvg}%`}
          </div>
          <div className="h-2 w-64 max-w-full rounded-full overflow-hidden mt-2" style={{ backgroundColor: TRACK_BG }}>
            <div
              className="h-full transition-all"
              style={{ backgroundColor: PROGRESS_FILL, width: `${tab === 'mine' ? pct : globalAvg}%` }}
            />
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm cursor-pointer hover:opacity-80"
            style={{ backgroundColor: CARD_BG, color: TEXT_SECONDARY }}
          >
            ✕ 关闭
          </button>
          <div className="flex gap-2">
            {(['mine', 'global'] as Tab[]).map((value) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className="px-4 py-1.5 rounded-lg text-sm cursor-pointer hover:opacity-80"
                style={
                  tab === value
                    ? { backgroundColor: '#ffffff', color: 'var(--text-primary)', fontWeight: 600 }
                    : { backgroundColor: CARD_BG, color: TEXT_SECONDARY }
                }
              >
                {value === 'mine' ? '我的成就' : '全球成就'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-10" style={{ color: TEXT_SECONDARY }}>正在加载成就…</div>
      )}
      {!loading && error && (
        <div className="text-center py-10" style={{ color: TEXT_SECONDARY }}>成就加载失败，请稍后再试。</div>
      )}
      {!loading && !error && total === 0 && (
        <div className="text-center py-10" style={{ color: TEXT_SECONDARY }}>该游戏暂无可展示的成就数据。</div>
      )}
      {!loading && !error && total > 0 && tab === 'mine' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {achievements.map((a) => {
            const secret = isSecret(a);
            const reveal = revealed.has(a.apiname);
            const masked = secret && !reveal;
            const percent = globalByApiname.get(a.apiname.toLowerCase()) ?? 0;
            const iconSrc = a.achieved ? a.icon : (a.iconGray || a.icon);
            return (
              <div
                key={a.apiname}
                className="group relative transition-all duration-300 hover:scale-[1.06] hover:-translate-y-1.5 cursor-pointer hover:shadow-[0_12px_32px_rgba(28,25,23,0.4)]"
                onClick={() => { if (secret) toggleReveal(a.apiname); }}
              >
                <div
                  className="absolute -inset-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse at 50% 50%, #1c1917, transparent 78%)',
                    filter: 'blur(16px)',
                  }}
                />
                <div
                  className="relative flex gap-3 p-3 rounded-lg h-full"
                  style={{ backgroundColor: CARD_BG, opacity: a.achieved ? 1 : 0.6, minHeight: 88 }}
                >
                  {masked ? (
                    <div
                      className="w-10 h-10 rounded flex-shrink-0 grid place-items-center text-lg font-bold"
                      style={{ backgroundColor: TRACK_BG, color: TEXT_SECONDARY }}
                    >
                      ?
                    </div>
                  ) : iconSrc ? (
                    <img
                      src={iconSrc}
                      alt=""
                      className="w-10 h-10 rounded flex-shrink-0 object-contain"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded flex-shrink-0" style={{ backgroundColor: TRACK_BG }} />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm" style={{ color: a.achieved ? TEXT_PRIMARY : TEXT_SECONDARY }}>
                        {masked ? '？？？' : a.title}
                      </div>
                      <div className="text-[10px] flex-shrink-0" style={{ color: TEXT_SECONDARY }}>
                        全球 {percent.toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-xs mt-0.5 line-clamp-2 min-h-[2rem]" style={{ color: TEXT_SECONDARY }}>
                      {masked ? '隐藏成就，点击查看详情。' : (a.description || 'Steam 未公开该成就的描述。')}
                    </div>
                    <div className="text-xs mt-1 min-h-[1rem]" style={{ color: PROGRESS_FILL }}>
                      {a.achieved && a.unlockTime ? `✓ ${new Date(a.unlockTime * 1000).toLocaleDateString('zh-CN')}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !error && total > 0 && tab === 'global' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {achievements.map((a) => {
            const percent = globalByApiname.get(a.apiname.toLowerCase()) ?? 0;
            const secret = isSecret(a, true);
            const reveal = revealed.has(a.apiname);
            const masked = secret && !reveal;
            const iconSrc = a.achieved ? a.icon : (a.iconGray || a.icon);
            return (
              <div
                key={a.apiname}
                className="group relative transition-all duration-300 hover:scale-[1.06] hover:-translate-y-1.5 cursor-pointer hover:shadow-[0_12px_32px_rgba(28,25,23,0.4)]"
                onClick={() => { if (secret) toggleReveal(a.apiname); }}
              >
                <div
                  className="absolute -inset-3 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse at 50% 50%, #1c1917, transparent 78%)',
                    filter: 'blur(16px)',
                  }}
                />
                <div
                  className="relative flex gap-3 p-3 rounded-lg h-full"
                  style={{ backgroundColor: CARD_BG, minHeight: 88 }}
                >
                  {masked ? (
                    <div
                      className="w-10 h-10 rounded flex-shrink-0 grid place-items-center text-lg font-bold"
                      style={{ backgroundColor: TRACK_BG, color: TEXT_SECONDARY }}
                    >
                      ?
                    </div>
                  ) : iconSrc ? (
                    <img
                      src={iconSrc}
                      alt=""
                      className="w-10 h-10 rounded flex-shrink-0 object-contain"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded flex-shrink-0" style={{ backgroundColor: TRACK_BG }} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>
                        {masked ? '？？？' : a.title}
                      </div>
                      <div className="text-xs flex-shrink-0" style={{ color: TEXT_SECONDARY }}>
                        {percent.toFixed(1)}%
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: TRACK_BG }}>
                      <div
                        className="h-full transition-all"
                        style={{ backgroundColor: PROGRESS_FILL, width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
