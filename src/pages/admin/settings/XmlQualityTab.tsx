import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { XmlQualityResult } from './siteHealthTypes';

interface XmlQualityTabProps {
  xmlQuality: XmlQualityResult | null;
  xmlQualityLoading: boolean;
}

export default function XmlQualityTab({ xmlQuality, xmlQualityLoading }: XmlQualityTabProps) {
  const [showAll, setShowAll] = useState(false);

  const openListing = (id: number) => {
    window.dispatchEvent(new CustomEvent('admin:open-listing', { detail: id }));
  };

  if (!xmlQuality && !xmlQualityLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Icon name="ClipboardCheck" size={32} className="mx-auto mb-3 opacity-30" />
        Нажмите «Проверить» чтобы проанализировать заполненность объектов для экспорта
      </div>
    );
  }

  if (xmlQualityLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <Icon name="Loader2" size={24} className="mx-auto mb-2 animate-spin" />
        Анализ объектов...
      </div>
    );
  }

  if (!xmlQuality) return null;

  return (
    <div className="space-y-4">
      {/* Итоговая статистика */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        xmlQuality.issues_count === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
      }`}>
        <Icon
          name={xmlQuality.issues_count === 0 ? 'CheckCircle2' : 'AlertCircle'}
          size={20}
          className={xmlQuality.issues_count === 0 ? 'text-emerald-500' : 'text-amber-500'}
        />
        <div className="text-sm">
          <div className="font-semibold">
            {xmlQuality.issues_count === 0
              ? `Все ${xmlQuality.total} объектов заполнены полностью`
              : `${xmlQuality.issues_count} из ${xmlQuality.total} объектов требуют доработки`}
          </div>
          {xmlQuality.perfect > 0 && xmlQuality.issues_count > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {xmlQuality.perfect} объектов заполнены полностью
            </div>
          )}
        </div>
      </div>

      {/* Сводка по полям */}
      {xmlQuality.field_summary.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Чего не хватает чаще всего</div>
          <div className="grid gap-1.5">
            {xmlQuality.field_summary.map(f => (
              <div key={f.key} className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border text-sm">
                <div className="flex-1 font-medium">{f.label}</div>
                <div className="text-xs text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">
                  {f.count} объектов
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Список объектов с проблемами */}
      {xmlQuality.issues.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Объекты с незаполненными полями
          </div>
          <div className="grid gap-2">
            {(showAll ? xmlQuality.issues : xmlQuality.issues.slice(0, 10)).map(issue => (
              <div key={issue.id} className="flex flex-col gap-2 px-3 py-2.5 bg-white border border-border rounded-xl text-sm hover:border-brand-blue/40 transition">
                <div className="font-semibold break-words">{issue.title}</div>
                <div className="flex flex-wrap gap-1">
                  {issue.missing.map(m => (
                    <span key={m} className="text-xs px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded">
                      {m}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => openListing(issue.id)}
                  className="self-start flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-blue/10 text-brand-blue text-xs font-semibold hover:bg-brand-blue/20 transition"
                >
                  <Icon name="Pencil" size={12} />
                  Открыть
                </button>
              </div>
            ))}
          </div>
          {xmlQuality.issues.length > 10 && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="mt-2 w-full py-2 text-xs font-semibold text-brand-blue hover:underline"
            >
              {showAll ? 'Скрыть' : `Показать ещё ${xmlQuality.issues.length - 10}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
