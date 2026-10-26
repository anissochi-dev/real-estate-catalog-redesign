import Icon from '@/components/ui/icon';
import { AnalyzeResult } from './tabAiTypes';

interface Props {
  analyzeResult: AnalyzeResult;
  analyzeTab: 'analysis' | 'description';
  setAnalyzeTab: (t: 'analysis' | 'description') => void;
  analyzeCopied: boolean;
  applying: string | null;
  copyDescription: () => void;
  applyDescription: () => void;
  setAnalyzeResult: (r: AnalyzeResult | null) => void;
  setAnalyzeError: (e: string) => void;
}

export default function TabAiAnalyzeResult({
  analyzeResult, analyzeTab, setAnalyzeTab, analyzeCopied, applying,
  copyDescription, applyDescription, setAnalyzeResult, setAnalyzeError,
}: Props) {
  return (
      <div className="space-y-4">
        {/* Вкладки */}
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
          {([
            { key: 'analysis', label: 'Анализ', icon: 'BarChart2' },
            { key: 'description', label: 'Описание', icon: 'FileText' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setAnalyzeTab(t.key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${analyzeTab === t.key ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon name={t.icon} size={12} /> {t.label}
            </button>
          ))}
        </div>

        {analyzeTab === 'analysis' && (
          <div className="space-y-3">
            {[
              { label: 'Анализ цены', value: analyzeResult.price_analysis, icon: 'TrendingUp' },
              { label: 'Ликвидность', value: analyzeResult.liquidity, icon: 'Zap' },
              { label: 'Инфраструктура района', value: analyzeResult.location_analysis, icon: 'MapPin' },
              { label: 'Анализ объекта', value: analyzeResult.object_analysis, icon: 'Building2' },
            ].map(s => s.value && (
              <div key={s.label} className="bg-muted/30 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-muted-foreground">
                  <Icon name={s.icon} size={12} /> {s.label}
                </div>
                <div className="text-sm leading-relaxed">{s.value}</div>
              </div>
            ))}
            {analyzeResult.broker_recommendations?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-amber-700">
                  <Icon name="Lightbulb" size={12} /> Рекомендации брокеру
                </div>
                <ul className="space-y-1">
                  {analyzeResult.broker_recommendations.map((r, i) => (
                    <li key={i} className="text-sm text-amber-800 flex gap-2"><span className="text-amber-400 shrink-0">•</span>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {analyzeResult.improvements?.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-emerald-700">
                  <Icon name="Wrench" size={12} /> Улучшения объекта
                </div>
                <ul className="space-y-1">
                  {analyzeResult.improvements.map((r, i) => (
                    <li key={i} className="text-sm text-emerald-800 flex gap-2"><span className="text-emerald-400 shrink-0">•</span>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {analyzeResult.utp_titles?.length > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-violet-700">
                  <Icon name="Star" size={12} /> Варианты УТП для названия
                </div>
                <ul className="space-y-1">
                  {analyzeResult.utp_titles.map((u, i) => (
                    <li key={i} className="text-sm text-violet-800 flex gap-2">
                      <span className="text-violet-400 shrink-0">{i + 1}.</span>
                      <span>{u}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {analyzeTab === 'description' && analyzeResult.description && (
          <div className="space-y-3">
            <div className="bg-muted/30 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {analyzeResult.description}
            </div>
            <div className="flex gap-2">
              <button onClick={copyDescription}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition">
                <Icon name={analyzeCopied ? 'Check' : 'Copy'} size={13} className={analyzeCopied ? 'text-emerald-500' : ''} />
                {analyzeCopied ? 'Скопировано' : 'Скопировать'}
              </button>
              <button onClick={applyDescription} disabled={!!applying}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition disabled:opacity-50">
                {applying === 'description' ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Check" size={13} />}
                Применить к объекту
              </button>
            </div>
          </div>
        )}

        <button onClick={() => { setAnalyzeResult(null); setAnalyzeError(''); }}
          className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition">
          Запустить повторно
        </button>
      </div>
  );
}
