import Icon from '@/components/ui/icon';

export default function MarketingAdmin() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-blue/10 flex items-center justify-center">
        <Icon name="Megaphone" size={32} className="text-brand-blue" />
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-1">Раздел в разработке</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Здесь скоро появятся маркетинговые инструменты: UTM-метки, рассылки, статистика и отчёты
        </p>
      </div>
    </div>
  );
}
