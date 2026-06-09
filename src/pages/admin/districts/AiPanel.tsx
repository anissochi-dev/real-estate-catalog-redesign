import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import AiResultGrid, { AiDistrict } from './AiResultGrid';

const DISTRICT_AI_URL = 'https://functions.poehali.dev/eddffe59-b37d-425e-90a3-59d12d44623f';

type AiTab = 'auto' | 'text';

function useSelectable(items: AiDistrict[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setSelected(prev => { const s = new Set(prev); if (s.has(i)) { s.delete(i); } else { s.add(i); } return s; });
  const selectAll = () => setSelected(new Set(items.map((_, i) => i)));
  const deselectAll = () => setSelected(new Set());
  const reset = () => setSelected(new Set());
  return { selected, toggle, selectAll, deselectAll, reset };
}

interface Props {
  onImported: () => void;
  onClose: () => void;
}

export default function AiPanel({ onImported, onClose }: Props) {
  const { refreshToken } = useAuth();

  const [aiTab, setAiTab] = useState<AiTab>('auto');
  const [aiCity, setAiCity] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiDistrict[]>([]);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiSel = useSelectable(aiResult);

  const [textInput, setTextInput] = useState('');
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichResult, setEnrichResult] = useState<AiDistrict[]>([]);
  const [enrichImporting, setEnrichImporting] = useState(false);
  const [enrichError, setEnrichError] = useState('');
  const enrichSel = useSelectable(enrichResult);

  useEffect(() => { if (aiResult.length) aiSel.selectAll(); }, [aiResult]);
  useEffect(() => { if (enrichResult.length) enrichSel.selectAll(); }, [enrichResult]);

  const handleAiSuggest = async () => {
    if (!aiCity.trim()) return;
    setAiLoading(true); setAiError(''); setAiResult([]); aiSel.reset();
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ action: 'suggest', city: aiCity.trim() }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      setAiResult(data.districts || []);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Ошибка');
    } finally { setAiLoading(false); }
  };

  const handleAiImport = async () => {
    const selected = aiResult.filter((_, i) => aiSel.selected.has(i));
    if (!selected.length) return;
    setAiImporting(true); setAiError('');
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ action: 'import', city: aiCity.trim(), districts: selected }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Добавлено: ${data.imported}, пропущено (уже есть): ${data.skipped}`);
      onClose(); await onImported();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally { setAiImporting(false); }
  };

  const handleEnrich = async () => {
    if (!textInput.trim() || !aiCity.trim()) return;
    setEnrichLoading(true); setEnrichError(''); setEnrichResult([]); enrichSel.reset();
    const lines = textInput.split('\n').map(l => l.trim()).filter(Boolean);
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ action: 'enrich', city: aiCity.trim(), names: lines }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      setEnrichResult(data.districts || []);
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : 'Ошибка');
    } finally { setEnrichLoading(false); }
  };

  const handleEnrichImport = async () => {
    const selected = enrichResult.filter((_, i) => enrichSel.selected.has(i));
    if (!selected.length) return;
    setEnrichImporting(true); setEnrichError('');
    try {
      const tok = refreshToken();
      const res = await fetch(DISTRICT_AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Token': tok }, body: JSON.stringify({ action: 'import', city: aiCity.trim(), districts: selected }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Ошибка ${res.status}`);
      toast.success(`Добавлено: ${data.imported}, пропущено (уже есть): ${data.skipped}`);
      onClose(); setEnrichResult([]); setTextInput(''); setAiCity(''); await onImported();
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : 'Ошибка импорта');
    } finally { setEnrichImporting(false); }
  };

  const textLineCount = textInput.split('\n').filter(l => l.trim()).length;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon name="Wand2" size={16} className="text-violet-600" />
        <span className="font-semibold text-sm text-violet-700">Добавление районов через ИИ</span>
        <button type="button" onClick={onClose} className="ml-auto text-violet-400 hover:text-violet-600">
          <Icon name="X" size={16} />
        </button>
      </div>

      <div className="relative max-w-xs">
        <Icon name="Building2" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input type="text" value={aiCity}
          onChange={e => { setAiCity(e.target.value); setAiResult([]); setEnrichResult([]); }}
          placeholder="Город (напр. Краснодар)"
          className="w-full pl-8 pr-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white" />
      </div>

      <div className="flex gap-1 bg-violet-100 rounded-xl p-1 w-fit">
        <button type="button" onClick={() => { setAiTab('auto'); setEnrichResult([]); setEnrichError(''); }}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${aiTab === 'auto' ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}>
          <Icon name="Sparkles" size={13} />
          Авто-поиск
        </button>
        <button type="button" onClick={() => { setAiTab('text'); setAiResult([]); setAiError(''); }}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5 ${aiTab === 'text' ? 'bg-white text-violet-700 shadow-sm' : 'text-violet-500 hover:text-violet-700'}`}>
          <Icon name="List" size={13} />
          Свой список
        </button>
      </div>

      {aiTab === 'auto' && (
        <div className="space-y-3">
          <p className="text-xs text-violet-600">ИИ сам сформирует полный список районов города с описаниями.</p>
          <button type="button" onClick={handleAiSuggest} disabled={aiLoading || !aiCity.trim()}
            className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 transition">
            <Icon name={aiLoading ? 'Loader2' : 'Search'} size={14} className={aiLoading ? 'animate-spin' : ''} />
            {aiLoading ? 'ИИ ищет районы...' : 'Найти районы'}
          </button>
          {aiError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <Icon name="AlertCircle" size={14} /> {aiError}
            </div>
          )}
          {aiResult.length > 0 && (
            <AiResultGrid
              items={aiResult} selected={aiSel.selected} cityName={aiCity}
              onToggle={aiSel.toggle} onSelectAll={aiSel.selectAll} onDeselectAll={aiSel.deselectAll}
              importing={aiImporting} onImport={handleAiImport} error=""
            />
          )}
        </div>
      )}

      {aiTab === 'text' && (
        <div className="space-y-3">
          <p className="text-xs text-violet-600">
            Вставьте названия районов — по одному на строку. ИИ добавит к каждому описание, тип застройки и инфраструктуру на основе своих знаний о городе.
          </p>
          <textarea
            value={textInput}
            onChange={e => { setTextInput(e.target.value); setEnrichResult([]); }}
            rows={7}
            placeholder={'Центральный\nФМР\nЮМР\nКарасунский\nПашковский\nЗападный обход\nСтаврополькая'}
            className="w-full px-3 py-2.5 border border-violet-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white resize-none font-mono leading-relaxed"
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleEnrich} disabled={enrichLoading || !textInput.trim() || !aiCity.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 transition">
              <Icon name={enrichLoading ? 'Loader2' : 'Wand2'} size={14} className={enrichLoading ? 'animate-spin' : ''} />
              {enrichLoading ? 'ИИ анализирует...' : 'Обогатить через ИИ'}
            </button>
            {textLineCount > 0 && (
              <span className="text-xs text-muted-foreground">{textLineCount} районов в списке</span>
            )}
          </div>
          {enrichError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <Icon name="AlertCircle" size={14} /> {enrichError}
            </div>
          )}
          {enrichResult.length > 0 && (
            <AiResultGrid
              items={enrichResult} selected={enrichSel.selected} cityName={aiCity}
              onToggle={enrichSel.toggle} onSelectAll={enrichSel.selectAll} onDeselectAll={enrichSel.deselectAll}
              importing={enrichImporting} onImport={handleEnrichImport} error=""
            />
          )}
        </div>
      )}
    </div>
  );
}