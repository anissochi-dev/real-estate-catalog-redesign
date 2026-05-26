import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

export interface SeoHeadings {
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  h5: string;
}

interface Props {
  generated: SeoHeadings;
  value: Partial<SeoHeadings>;
  onChange: (v: Partial<SeoHeadings>) => void;
}

const LEVELS: { key: keyof SeoHeadings; label: string; hint: string }[] = [
  { key: 'h1', label: 'H1 — главный заголовок страницы', hint: 'Виден в поиске как заголовок объекта' },
  { key: 'h2', label: 'H2 — подзаголовок раздела', hint: 'Уточняет тему для поисковика' },
  { key: 'h3', label: 'H3 — заголовок подраздела', hint: 'Ключевые характеристики' },
  { key: 'h4', label: 'H4 — детальный подзаголовок', hint: 'Параметры и особенности' },
  { key: 'h5', label: 'H5 — вспомогательный заголовок', hint: 'Цена, площадь, адрес' },
];

export default function SeoHeadingsBlock({ generated, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState<Partial<SeoHeadings>>(value);

  useEffect(() => { setOverrides(value); }, [value]);

  const set = (key: keyof SeoHeadings, v: string) => {
    const next = { ...overrides, [key]: v };
    setOverrides(next);
    onChange(next);
  };

  const reset = (key: keyof SeoHeadings) => {
    const next = { ...overrides };
    delete next[key];
    setOverrides(next);
    onChange(next);
  };

  const effective = (key: keyof SeoHeadings) => overrides[key] ?? generated[key];
  const hasOverride = (key: keyof SeoHeadings) => !!overrides[key] && overrides[key] !== generated[key];

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="Heading" size={15} className="text-brand-blue" />
          SEO-заголовки H1–H5
          <span className="text-[10px] font-normal text-muted-foreground px-1.5 py-0.5 bg-white border border-border rounded">
            авто + ручная замена
          </span>
        </div>
        <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={16} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="px-4 py-4 space-y-3 bg-white">
          <p className="text-xs text-muted-foreground">
            Заголовки генерируются автоматически из названия и параметров. Вы можете изменить любой вручную.
          </p>

          {LEVELS.map(({ key, label, hint }) => {
            const val = effective(key);
            const overridden = hasOverride(key);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-foreground">{label}</label>
                  {overridden && (
                    <button
                      type="button"
                      onClick={() => reset(key)}
                      className="text-[10px] text-muted-foreground hover:text-red-500 flex items-center gap-1 transition-colors"
                    >
                      <Icon name="RotateCcw" size={10} /> Сбросить
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    className={`w-full px-3 py-2 border rounded-lg text-sm pr-8 transition-colors ${
                      overridden
                        ? 'border-brand-orange bg-orange-50/50'
                        : 'border-border bg-muted/20'
                    }`}
                    value={val}
                    onChange={e => set(key, e.target.value)}
                    placeholder={generated[key]}
                  />
                  {overridden && (
                    <Icon name="Pencil" size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-orange" />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
