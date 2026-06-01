import { useEffect, useState } from 'react';
import { NEWS_URL, getToken } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { NewsItem, Schedule } from './newsAdminTypes';
import { NewsAdminList } from './NewsAdminList';
import { NewsAdminCreate } from './NewsAdminCreate';
import { NewsAdminSchedule } from './NewsAdminSchedule';

export default function NewsAdmin() {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token };

  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'list' | 'create' | 'schedule'>('list');
  const [schedule, setSchedule] = useState<Schedule>({ is_enabled: false, run_hour: 9, run_minute: 0, articles_per_run: 3 });
  const [schedSaved, setSchedSaved] = useState(false);

  const loadNews = () => {
    fetch(`${NEWS_URL}?action=admin_list`, { headers })
      .then(r => r.json())
      .then(d => setNews(d.news || []))
      .finally(() => setLoading(false));
  };

  const loadSchedule = () => {
    fetch(`${NEWS_URL}?action=schedule`, { headers })
      .then(r => r.json())
      .then(d => { if (d.schedule && d.schedule.id) setSchedule(d.schedule); });
  };

  useEffect(() => { loadNews(); loadSchedule(); }, []);

  const handleSchedSave = () => {
    setSchedSaved(true);
    setTimeout(() => setSchedSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-700 flex items-center gap-2">
            <Icon name="Newspaper" size={22} className="text-brand-blue" />
            Новости
          </h2>
          <p className="text-sm text-muted-foreground">Автокопирайтер анализирует рынок и публикует статьи</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTab('list')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'list' ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-muted/80'}`}>
            Список
          </button>
          <button onClick={() => setTab('create')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'create' ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-muted/80'}`}>
            + Создать
          </button>
          <button onClick={() => setTab('schedule')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${tab === 'schedule' ? 'bg-brand-blue text-white' : 'bg-muted hover:bg-muted/80'}`}>
            <Icon name="Clock" size={14} className="inline mr-1" />
            Расписание
          </button>
        </div>
      </div>

      {tab === 'list' && (
        <NewsAdminList
          news={news}
          loading={loading}
          headers={headers}
          onNewsChange={setNews}
        />
      )}

      {tab === 'create' && (
        <NewsAdminCreate
          headers={headers}
          onCreated={loadNews}
          onTabChange={setTab}
        />
      )}

      {tab === 'schedule' && (
        <NewsAdminSchedule
          schedule={schedule}
          schedSaved={schedSaved}
          headers={headers}
          onScheduleChange={setSchedule}
          onSave={handleSchedSave}
        />
      )}
    </div>
  );
}
