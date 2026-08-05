import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';
import { useSettingsSearchHandoff } from './settings/settingsAnchor';
import { F, XML_URL } from './xml-feeds/shared';
import XmlFeedsListCard from './xml-feeds/XmlFeedsListCard';
import XmlImportCard from './xml-feeds/XmlImportCard';
import XmlMarketFeedCard from './xml-feeds/XmlMarketFeedCard';
import XmlFeedEditModal from './xml-feeds/XmlFeedEditModal';

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

  const regenerateNow = async () => {
    setRegenerating(true);
    try {
      const token = localStorage.getItem('biznest_token') || '';
      await fetch(`${XML_URL}?action=generate_static`, {
        headers: { 'X-Auth-Token': token },
      });
      await load();
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <XmlFeedsListCard
        items={items}
        search={search}
        setSearch={setSearch}
        regenerating={regenerating}
        regenerateNow={regenerateNow}
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

      {editing && (
        <XmlFeedEditModal editing={editing} setEditing={setEditing} save={save} />
      )}
    </div>
  );
}