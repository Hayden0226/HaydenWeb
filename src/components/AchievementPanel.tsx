import { useState } from 'react';
import type { UnifiedGame } from '../utils/unified-games';
import type { SteamAchievement, SteamGlobalAchievement } from '../utils/steam';

// The achievement panel uses the same near-black as the nav "Games" link,
// with white text for contrast.
const PANEL_BG = 'var(--text-primary)';
const PANEL_BORDER = 'rgba(255,255,255,0.14)';
const CARD_BG = 'rgba(255,255,255,0.08)';
const TRACK_BG = 'rgba(255,255,255,0.14)';
const TEXT_PRIMARY = '#ffffff';
const TEXT_SECONDARY = 'rgba(255,255,255,0.75)';
const ACCENT_LIGHT = '#a8d8f2';

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
  const unlocked = achievements.filter((a) => a.achieved).length;
  const total = achievements.length;
  const pct = total > 0 ? Math.round((unlocked / total) * 100) : 0;
  const globalAvg = global.length > 0 ? Math.round(global.reduce((sum, g) => sum + g.percent, 0) / global.length) : 0;
  const globalByApiname = new Map(global.map((g) => [g.apiname.toLowerCase(), g.percent]));
  // Hidden achievements stay masked as "???" until unlocked, mirroring Steam.
  const isSecret = (a: SteamAchievement, forceSecret = false) => !!a.hidden && (forceSecret || !a.achieved);

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
              style={{ backgroundColor: ACCENT_LIGHT, width: `${tab === 'mine' ? pct : globalAvg}%` }}
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
            return (
              <div
                key={a.apiname}
                className="flex gap-3 p-3 rounded-lg"
                style={{ backgroundColor: CARD_BG, opacity: a.achieved ? 1 : 0.6 }}
              >
                {secret ? (
                  <div
                    className="w-10 h-10 rounded flex-shrink-0 grid place-items-center text-lg font-bold"
                    style={{ backgroundColor: TRACK_BG, color: TEXT_SECONDARY }}
                  >
                    ?
                  </div>
                ) : a.icon ? (
                  <img
                    src={a.achieved ? a.icon : (a.iconGray || a.icon)}
                    alt=""
                    className="w-10 h-10 rounded flex-shrink-0 object-contain"
                  />
                ) : (
                  <div className="w-10 h-10 rounded flex-shrink-0" style={{ backgroundColor: TRACK_BG }} />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-sm" style={{ color: a.achieved ? TEXT_PRIMARY : TEXT_SECONDARY }}>
                    {secret ? '？？？' : a.title}
                  </div>
                  {secret ? (
                    <div className="text-xs mt-0.5" style={{ color: TEXT_SECONDARY }}>隐藏成就，解锁后才会显示详情。</div>
                  ) : a.description && (
                    <div className="text-xs mt-0.5 line-clamp-2" style={{ color: TEXT_SECONDARY }}>{a.description}</div>
                  )}
                  {a.achieved && a.unlockTime && (
                    <div className="text-xs mt-1" style={{ color: ACCENT_LIGHT }}>
                      ✓ {new Date(a.unlockTime * 1000).toLocaleDateString('zh-CN')}
                    </div>
                  )}
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
            return (
              <div
                key={a.apiname}
                className="flex gap-3 p-3 rounded-lg"
                style={{ backgroundColor: CARD_BG }}
              >
                {secret ? (
                  <div
                    className="w-10 h-10 rounded flex-shrink-0 grid place-items-center text-lg font-bold"
                    style={{ backgroundColor: TRACK_BG, color: TEXT_SECONDARY }}
                  >
                    ?
                  </div>
                ) : a.icon ? (
                  <img
                    src={a.achieved ? a.icon : (a.iconGray || a.icon)}
                    alt=""
                    className="w-10 h-10 rounded flex-shrink-0 object-contain"
                  />
                ) : (
                  <div className="w-10 h-10 rounded flex-shrink-0" style={{ backgroundColor: TRACK_BG }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>
                      {secret ? '？？？' : a.title}
                    </div>
                    <div className="text-xs flex-shrink-0" style={{ color: TEXT_SECONDARY }}>
                      {percent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: TRACK_BG }}>
                    <div
                      className="h-full transition-all"
                      style={{ backgroundColor: ACCENT_LIGHT, width: `${Math.min(percent, 100)}%` }}
                    />
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
