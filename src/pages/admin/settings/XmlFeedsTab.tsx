import Icon from '@/components/ui/icon';
import { XmlResult } from './siteHealthTypes';

interface XmlFeedsTabProps {
  xml: XmlResult | null;
}

export default function XmlFeedsTab({ xml }: XmlFeedsTabProps) {
  if (!xml) return null;

  const realErrors = xml.feeds.filter(f => !f.ok && !f.error?.includes('402'));
  const inactive = xml.feeds.filter(f => !f.ok && f.error?.includes('402'));
  const allInactive = !xml.all_ok && realErrors.length === 0;

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        xml.all_ok ? 'bg-emerald-50 border-emerald-200'
        : allInactive ? 'bg-muted/50 border-border'
        : 'bg-amber-50 border-amber-200'
      }`}>
        <Icon
          name={xml.all_ok ? 'CheckCircle2' : allInactive ? 'Info' : 'AlertCircle'}
          size={20}
          className={xml.all_ok ? 'text-emerald-500' : allInactive ? 'text-muted-foreground' : 'text-amber-500'}
        />
        <div className="text-sm">
          <div className="font-semibold">
            {xml.all_ok ? `Все ${xml.checked} фидов работают`
              : allInactive ? 'Фиды не подключены'
              : 'Есть проблемы в фидах'}
          </div>
          {allInactive && inactive.length > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              XML-фиды для Авито и ЦИАН требуют активации тарифа
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        {xml.feeds.map((f, i) => {
          const is402 = !f.ok && f.error?.includes('402');
          return (
            <div key={i} className={`px-4 py-3 rounded-xl border text-sm ${
              f.ok ? 'bg-emerald-50/50 border-emerald-200'
              : is402 ? 'bg-muted/30 border-border'
              : 'bg-red-50/50 border-red-200'
            }`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Icon
                    name={f.ok ? 'CheckCircle2' : is402 ? 'CircleDashed' : 'XCircle'}
                    size={15}
                    className={f.ok ? 'text-emerald-500' : is402 ? 'text-muted-foreground' : 'text-red-500'}
                  />
                  <span className="font-semibold">{f.name}</span>
                  {is402 && <span className="text-xs text-muted-foreground font-normal">не активирован</span>}
                </div>
                {f.ok && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {f.items !== undefined && <span>{f.items} элементов</span>}
                    {f.size_kb !== undefined && <span>{f.size_kb} КБ</span>}
                    {f.root_tag && <span className="font-mono">&lt;{f.root_tag}&gt;</span>}
                  </div>
                )}
              </div>
              {f.error && !is402 && <div className="text-xs text-red-600 mt-1.5 ml-5">{f.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
