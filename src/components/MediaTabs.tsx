import { useState, type ReactNode } from 'react';

export interface MediaTabDef {
  id: string;
  label: string;
}

interface MediaTabsProps {
  tabs: MediaTabDef[];
  groups: Record<string, any[]>;
  renderGrid: (items: any[], activeId: string) => ReactNode;
}

export default function MediaTabs({ tabs, groups, renderGrid }: MediaTabsProps) {
  const [active, setActive] = useState<string>(tabs[0]?.id ?? '');
  const current = groups[active] ?? [];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8">
        {tabs.map(tab => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className="px-4 py-2 rounded-full border transition-colors cursor-pointer"
              style={isActive
                ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--bg-primary)' }
                : { backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
              }
            >
              {tab.label}
              <span className="ml-2 text-xs opacity-80">({(groups[tab.id] || []).length})</span>
            </button>
          );
        })}
      </div>

      {current.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            暂无 {tabs.find(t => t.id === active)?.label ?? '内容'}
          </p>
        </div>
      ) : (
        renderGrid(current, active)
      )}
    </div>
  );
}
