import { S } from './types';

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
  saved: boolean;
  save: () => void;
}

export default function FooterTab({ s, setS, saved, save }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg">Описание компании в подвале</div>
        <div className="text-xs text-muted-foreground -mt-2">
          Короткий текст под названием компании. Если пусто — показывается текст по умолчанию.
        </div>
        <textarea
          className="w-full px-3 py-2 border rounded-lg text-sm" rows={3}
          placeholder="Коммерческая недвижимость и готовый бизнес..."
          value={s.footer_description || ''}
          onChange={e => setS({ ...s, footer_description: e.target.value })}
        />
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg">Колонка «Каталог»</div>
        <div className="text-xs text-muted-foreground -mt-2">
          Ссылки в левом столбце «Каталог». Каждая строка: <code className="bg-muted px-1 rounded">Название|/путь</code>
        </div>
        <textarea
          className="w-full px-3 py-2 border rounded-lg text-sm font-mono" rows={5}
          placeholder={"Все объекты|/catalog\nНа карте|/map\nЗаявки|/network-tenants"}
          value={s.footer_catalog_links || ''}
          onChange={e => setS({ ...s, footer_catalog_links: e.target.value })}
        />
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="font-display font-700 text-lg">Колонка «Категории»</div>
        <div className="text-xs text-muted-foreground -mt-2">
          Ссылки в правом столбце «Категории». Каждая строка: <code className="bg-muted px-1 rounded">Название|/путь</code>
        </div>
        <textarea
          className="w-full px-3 py-2 border rounded-lg text-sm font-mono" rows={10}
          placeholder={"Офисы|/catalog/office\nТорговые помещения|/catalog/retail\nСклады|/catalog/warehouse"}
          value={s.footer_extra_links || ''}
          onChange={e => setS({ ...s, footer_extra_links: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-3 sticky bottom-4 bg-white p-3 rounded-xl shadow z-20">
        <button onClick={save} className="btn-blue text-white px-6 py-3 rounded-xl font-semibold">Сохранить</button>
        {saved && <span className="text-emerald-600 text-sm">Сохранено</span>}
      </div>
    </div>
  );
}
