import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useSettingsSearchHandoff } from './settings/settingsAnchor';
import { F, XML_URL } from './xml-feeds/shared';
import XmlFeedsListCard from './xml-feeds/XmlFeedsListCard';
import XmlImportCard from './xml-feeds/XmlImportCard';
import XmlMarketFeedCard from './xml-feeds/XmlMarketFeedCard';
import XmlVkFeedCard from './xml-feeds/XmlVkFeedCard';
import XmlFeedEditModal from './xml-feeds/XmlFeedEditModal';
import XmlPlatformLogosCard from './xml-feeds/XmlPlatformLogosCard';
import XmlListingNumberCard from './xml-feeds/XmlListingNumberCard';

export default function XmlFeedsAdmin() {
  const [items, setItems] = useState<F[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<F> | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = () => adminApi.listFeeds().then(d => setItems(d.feeds));
  useEffect(() => { load(); }, []);

  // Если перешли сюда из общего поиска настроек (нашли конкретный фид по имени) —
  // подставляем текст поиска, чтобы список сразу отфильтровался на нужный фид.
  useSettingsSearchHandoff(setSearch);

  const save = async () => {
    if (!editing) return;
    try {
      if (editing.id) await adminApi.updateFeed(editing.id, editing as Record<string, unknown>);
      else await adminApi.createFeed(editing as Record<string, unknown>);
      setEditing(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить фид?')) return;
    await adminApi.deleteFeed(id);
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Скопировано');
  };

  const [regenProgress, setRegenProgress] = useState('');

  // Пересборка порциями: каждый вызов собирает до 10 фидов (≤ 25 с), повторяем, пока не done.
  // first=1 в первом вызове ставит все фиды в очередь. При перегрузке сервера — пауза и повтор.
  const regenerateNow = async () => {
    setRegenerating(true);
    setRegenProgress('Запуск…');
    const token = localStorage.getItem('biznest_token') || '';
    try {
      let first = true;
      let busyRetries = 0;
      for (let step = 0; step < 20; step++) {
        const r = await fetch(`${XML_URL}?action=generate_static${first ? '&first=1' : ''}`, {
          headers: { 'X-Auth-Token': token },
        });
        const d = await r.json().catch(() => ({}));
        if (r.status === 503 || d.busy || d.skipped) {
          if (++busyRetries > 6) { setRegenProgress('Сервер занят — фиды доберутся автоматически'); break; }
          setRegenProgress('Сервер занят, повторяю…');
          await new Promise(res => setTimeout(res, 3000));
          continue;
        }
        if (d.error) { setRegenProgress(d.error); break; }
        first = false;
        busyRetries = 0;
        const total = d.total || 0;
        setRegenProgress(`Собрано ${Math.max(total - (d.remaining || 0), 0)} из ${total}`);
        if (d.done) break;
      }
      await load();
    } finally {
      setRegenerating(false);
      setTimeout(() => setRegenProgress(''), 4000);
    }
  };

  return (
    <div className="space-y-4">
      <XmlPlatformLogosCard />

      <XmlListingNumberCard />

      <XmlFeedsListCard
        items={items}
        search={search}
        setSearch={setSearch}
        regenerating={regenerating}
        regenerateNow={regenerateNow}
        regenProgress={regenProgress}
        setEditing={setEditing}
        del={del}
        copy={copy}
      />

      <XmlImportCard />

      <XmlMarketFeedCard
        items={items}
        load={load}
        regenerating={regenerating}
        regenerateNow={regenerateNow}
        copy={copy}
      />

      <XmlVkFeedCard
        items={items}
        load={load}
        regenerating={regenerating}
        regenerateNow={regenerateNow}
        copy={copy}
      />

      {editing && (
        <XmlFeedEditModal editing={editing} setEditing={setEditing} save={save} />
      )}
    </div>
  );
}