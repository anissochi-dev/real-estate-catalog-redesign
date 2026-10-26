import Icon from '@/components/ui/icon';
import { AnalyzeResult } from './tabAiTypes';

interface Props {
  analyzeResult: AnalyzeResult | null;
  analyzeLoading: boolean;
  analyzeError: string;
  runAnalyze: () => void;
}

export default function TabAiAnalyzeIntro({ analyzeResult, analyzeLoading, analyzeError, runAnalyze }: Props) {
  return (
    <>
    {!analyzeResult && !analyzeLoading && (
      <>
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-3">
            <Icon name="Brain" size={24} className="text-violet-500" />
          </div>
          <div className="font-display font-700 text-base mb-1">Полный анализ объекта</div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed max-w-sm mx-auto">
            ИИ проведёт комплексный анализ: сравнение цен с рынком, ликвидность, инфраструктура района, рекомендации брокеру, УТП и готовое описание.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-5 text-left max-w-sm mx-auto">
            {[
              { icon: 'TrendingUp', label: 'Анализ цены и рынка' },
              { icon: 'MapPin', label: 'Инфраструктура района' },
              { icon: 'Zap', label: 'Ликвидность объекта' },
              { icon: 'Star', label: 'Рекомендации и УТП' },
              { icon: 'Wrench', label: 'Улучшения и доработки' },
              { icon: 'FileText', label: 'Готовое описание' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl px-3 py-2">
                <Icon name={f.icon} size={13} className="text-violet-500 shrink-0" />
                {f.label}
              </div>
            ))}
          </div>
        </div>
        {analyzeError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 mb-2">{analyzeError}</div>
        )}
        <button
          onClick={runAnalyze}
          className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-90 transition"
        >
          <Icon name="Sparkles" size={15} />
          Запустить анализ
        </button>
      </>
    )}

    {analyzeLoading && (
      <div className="py-10 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin mx-auto mb-4" />
        <div className="font-display font-700 text-sm mb-1">Анализирую объект...</div>
        <div className="text-xs text-muted-foreground">Сравниваю цены, изучаю район, формирую рекомендации</div>
      </div>
    )}
    </>
  );
}
