import Icon from '@/components/ui/icon';

export default function AutoPostingTab() {
  return (
    <div className="max-w-2xl">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-6 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon name="WrenchIcon" fallback="Settings" size={20} className="text-amber-600" />
        </div>
        <div>
          <div className="font-semibold text-amber-900 mb-1">Автопостинг временно недоступен</div>
          <div className="text-sm text-amber-800 leading-relaxed">
            Модуль публикации в соцсети (ВКонтакте, Telegram, Pinterest и др.) находится на техническом обслуживании.
            Функция будет восстановлена в ближайшее время.
          </div>
        </div>
      </div>
    </div>
  );
}
