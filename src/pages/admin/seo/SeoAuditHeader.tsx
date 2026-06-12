import Icon from '@/components/ui/icon';
import { FixResult } from './seoAuditTypes';

interface Props {
  loading: boolean;
  fixing: boolean;
  fixErr: string;
  fixResult: FixResult | null;
  canFix: boolean;
  missingSeo: number;
  missingFaq: number;
  onLoad: () => void;
  onFixWithAI: () => void;
}

export default function SeoAuditHeader({
  loading, fixing, fixErr, fixResult,
  canFix, missingSeo, missingFaq,
  onLoad, onFixWithAI,
}: Props) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-700 text-lg">SEO-аудит объектов</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Анализ заполненности SEO-полей по всем активным объектам</p>
        </div>
        <div className="flex items-center gap-2">
          {canFix && (
            <button onClick={onFixWithAI} disabled={fixing || loading}
              className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors">
              <Icon name={fixing ? 'Loader2' : 'Wand2'} size={15} className={fixing ? 'animate-spin' : ''} />
              {fixing ? 'Генерирую...' : `Исправить через ИИ${missingFaq > 0 && missingSeo === 0 ? ` (FAQ: ${missingFaq})` : ''}`}
            </button>
          )}
          <button onClick={onLoad} disabled={loading}
            className="btn-blue text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
            <Icon name={loading ? 'Loader2' : 'RefreshCw'} size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>
      </div>

      {fixErr && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <Icon name="AlertCircle" size={16} /> {fixErr}
        </div>
      )}

      {fixing && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 flex items-center gap-3 text-sm text-violet-700">
          <Icon name="Loader2" size={18} className="animate-spin shrink-0" />
          <div>
            <div className="font-semibold">ИИ генерирует SEO и FAQ...</div>
            <div className="text-violet-500 mt-0.5">Это может занять несколько минут</div>
          </div>
        </div>
      )}

      {fixResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-2">
            <Icon name="CheckCircle2" size={18} />
            ИИ успешно заполнил SEO-поля
          </div>
          <div className="flex gap-4 text-sm text-emerald-600">
            <span>Обработано: <strong>{fixResult.processed}</strong></span>
            <span>Пропущено: <strong>{fixResult.skipped}</strong></span>
            {fixResult.errors > 0 && <span className="text-amber-600">Ошибок: <strong>{fixResult.errors}</strong></span>}
          </div>
        </div>
      )}
    </>
  );
}
