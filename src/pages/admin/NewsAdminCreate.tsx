import { useState } from 'react';
import { NEWS_URL } from '@/lib/adminApi';
import Icon from '@/components/ui/icon';
import { toast } from 'sonner';
import SeoHeadingsBlock, { SeoHeadings } from '@/components/admin/SeoHeadingsBlock';
import { AUTO_TOPICS, generateNewsHeadings } from './newsAdminTypes';

interface Props {
  headers: Record<string, string>;
  onCreated: () => void;
  onTabChange: (tab: 'list' | 'create' | 'schedule') => void;
}

export function NewsAdminCreate({ headers, onCreated, onTabChange }: Props) {
  const [form, setForm] = useState({ title: '', summary: '', content: '', image_url: '', source_url: '', source_name: '' });
  const [seoHeadings, setSeoHeadings] = useState<Partial<SeoHeadings>>({});
  const [saving, setSaving] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [runningAuto, setRunningAuto] = useState(false);
  const [autoCount, setAutoCount] = useState(3);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [customTopic, setCustomTopic] = useState('');

  const create = async () => {
    if (!form.title || !form.content) { toast.error('Заполните заголовок и текст'); return; }
    setSaving(true);
    try {
      const gen = generateNewsHeadings(form.title, form.summary);
      const headings = {
        seo_h1: seoHeadings.h1 || gen.h1,
        seo_h2: seoHeadings.h2 || gen.h2,
        seo_h3: seoHeadings.h3 || gen.h3,
        seo_h4: seoHeadings.h4 || gen.h4,
        seo_h5: seoHeadings.h5 || gen.h5,
      };
      const r = await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'create', ...form, ...headings }) });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success('Статья создана');
      setForm({ title: '', summary: '', content: '', image_url: '', source_url: '', source_name: '' });
      setSeoHeadings({});
      onTabChange('list');
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    const topic = customTopic.trim() || selectedTopic;
    setGenerating(true);
    try {
      const r = await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'generate', topic, auto_publish: true }) });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success(`Статья "${d.title}" создана`);
      onCreated();
      onTabChange('list');
    } finally {
      setGenerating(false);
    }
  };

  const runAuto = async () => {
    setRunningAuto(true);
    try {
      const r = await fetch(NEWS_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'run_auto', count: autoCount }) });
      const d = await r.json();
      if (d.error) { toast.error(d.error); return; }
      toast.success(`Сгенерировано статей: ${d.generated}`);
      onCreated();
    } finally {
      setRunningAuto(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Ручная */}
      <div className="bg-white rounded-2xl border border-border p-6 space-y-4">
        <div className="font-display font-700 flex items-center gap-2">
          <Icon name="PenLine" size={18} className="text-brand-blue" />
          Написать вручную
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Заголовок *</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Рынок офисов Краснодара: итоги квартала"
            className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Краткое описание</label>
          <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
            rows={2} placeholder="2-3 предложения о чём статья"
            className="w-full px-3 py-2 border rounded-lg text-sm resize-none" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Текст статьи *</label>
          <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={8} placeholder="Полный текст статьи..."
            className="w-full px-3 py-2 border rounded-lg text-sm resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Ссылка на источник</label>
            <input value={form.source_url} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
              placeholder="https://..."
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Название источника</label>
            <input value={form.source_name} onChange={e => setForm(f => ({ ...f, source_name: e.target.value }))}
              placeholder="ЦБ РФ, Авито, РБК..."
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>
        <SeoHeadingsBlock
          generated={generateNewsHeadings(form.title, form.summary)}
          value={seoHeadings}
          onChange={setSeoHeadings}
        />
        <button onClick={create} disabled={saving || !form.title || !form.content}
          className="btn-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 w-full inline-flex items-center justify-center gap-2">
          {saving ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Save" size={15} />}
          Сохранить
        </button>
      </div>

      {/* Автогенерация */}
      <div className="bg-white rounded-2xl border border-border p-6 space-y-4">
        <div className="font-display font-700 flex items-center gap-2">
          <Icon name="Sparkles" size={18} className="text-brand-orange" />
          Автокопирайтер (YandexGPT)
        </div>
        <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-xl p-3">
          ИИ анализирует рынок коммерческой недвижимости, ключевую ставку ЦБ, данные застройщиков Краснодара и банков, и генерирует профессиональную статью.
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Выбрать тему</label>
          <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="">— Случайная тема —</option>
            {AUTO_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Или своя тема</label>
          <input value={customTopic} onChange={e => setCustomTopic(e.target.value)}
            placeholder="Напишите свою тему..."
            className="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <button onClick={generate} disabled={generating}
          className="w-full px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-orange text-white disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {generating ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Sparkles" size={15} />}
          {generating ? 'Генерация...' : 'Сгенерировать статью'}
        </button>

        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold mb-3">Пакетная генерация</div>
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Статей за раз:</label>
            <input type="number" min={1} max={10} value={autoCount} onChange={e => setAutoCount(+e.target.value)}
              className="w-20 px-2 py-1.5 border rounded-lg text-sm text-center" />
          </div>
          <button onClick={runAuto} disabled={runningAuto}
            className="w-full px-4 py-2 rounded-xl text-sm font-medium bg-purple-600 text-white disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {runningAuto ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Zap" size={15} />}
            {runningAuto ? 'Генерация...' : `Сгенерировать ${autoCount} статей`}
          </button>
        </div>
      </div>
    </div>
  );
}
