import Icon from '@/components/ui/icon';

interface StatView {
  value: string;
  label: string;
  icon: string;
  deal: string | null;
}

interface HomeStatsBarProps {
  statsView: StatView[];
  onGoCatalog: () => void;
}

export default function HomeStatsBar({ statsView, onGoCatalog }: HomeStatsBarProps) {
  return (
    <section className="bg-white border-b border-border py-3">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsView.map((stat, i) => {
            const clickable = stat.deal !== null;
            const goCatalog = () => { onGoCatalog(); };
            const inner = (
              <>
                <div className="w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center flex-shrink-0">
                  <Icon name={stat.icon} size={16} className="text-brand-blue" />
                </div>
                <div>
                  <h4 className="font-display font-800 text-lg text-brand-blue leading-none flex items-center gap-1">
                    {stat.value}
                    {clickable && <Icon name="ArrowRight" size={12} className="text-brand-blue/60" />}
                  </h4>
                  <h5 className="text-[11px] text-muted-foreground mt-0.5 font-normal">{stat.label}</h5>
                </div>
              </>
            );
            const baseCls = `flex items-center gap-2.5 animate-fade-in-up stagger-${i + 1} text-left p-1.5`;
            if (clickable) {
              return (
                <button key={stat.label} type="button" onClick={goCatalog}
                  className={`${baseCls} hover:bg-muted/40 rounded-lg transition-colors cursor-pointer`}>
                  {inner}
                </button>
              );
            }
            return (
              <div key={stat.label} className={baseCls}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
