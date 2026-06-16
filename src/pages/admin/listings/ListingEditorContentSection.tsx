import { useState } from 'react';
import Icon from '@/components/ui/icon';
import CharCount from '@/components/ui/CharCount';
import { Listing, fmtDate } from './types';
import VoiceInputButton, { VoiceFields } from '@/components/admin/VoiceInputButton';

const SECTION_HEADERS = [
  'От собственника! Без комиссий и %!',
  'Общие параметры и назначение',
  'Локация и район',
  'Характеристики объекта',
  'Коммуникации',
  'Финансовые перспективы и доходность',
  'Условия и юридическая чистота',
];

function DescriptionPreview({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
      {text.split('\n').map((line, i) => {
        const isHeader = SECTION_HEADERS.includes(line.trim());
        return (
          <span key={i} className={isHeader ? 'block font-bold mt-2' : 'block'}>
            {line || '\u00A0'}
          </span>
        );
      })}
    </div>
  );
}

interface Props {
  editing: Partial<Listing>;
  setEditing: (l: Partial<Listing>) => void;
  aiLoading: boolean;
  aiTagsLoading: boolean;
  onDescribe: () => void;
  onGenerateTags: () => void;
  errors?: Record<string, boolean>;
  setErrors?: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  onVoiceFields?: (fields: VoiceFields, text: string) => void;
}

export default function ListingEditorContentSection({
  editing, setEditing,
  aiLoading, aiTagsLoading,
  onDescribe, onGenerateTags,
  errors = {}, setErrors,
  onVoiceFields,
}: Props) {
  const [preview, setPreview] = useState(false);
  const [voiceToast, setVoiceToast] = useState('');
  const descLen = (editing.description || '').trim().length;
  const descError = !!errors.description;

  const handleVoiceFields = (fields: VoiceFields, text: string) => {
    const patch: Partial<Listing> = {};
    if (fields.description) patch.description = fields.description;
    else if (text) patch.description = (editing.description ? editing.description + '\n' + text : text);
    if (fields.title && !editing.title) patch.title = fields.title;
    if (fields.category) patch.category = fields.category as Listing['category'];
    if (fields.deal) patch.deal = fields.deal as Listing['deal'];
    if (fields.area) patch.area = fields.area;
    if (fields.price) patch.price = fields.price;
    if (fields.price_unit) patch.price_unit = fields.price_unit as Listing['price_unit'];
    if (fields.floor != null) patch.floor = fields.floor;
    if (fields.floors_total != null) patch.total_floors = fields.floors_total;
    if (fields.ceiling_height) patch.ceiling_height = fields.ceiling_height;
    if (fields.address) patch.address = fields.address;
    if (fields.district) patch.district = fields.district;
    if (fields.condition) patch.condition = fields.condition as Listing['condition'];
    setEditing({ ...editing, ...patch });
    setErrors?.(v => ({ ...v, description: false }));
    onVoiceFields?.(fields, text);
    const filled = Object.keys(patch).filter(k => k !== 'description').length;
    setVoiceToast(filled > 0 ? `Заполнено полей: ${filled + 1}` : 'Описание добавлено');
    setTimeout(() => setVoiceToast(''), 3000);
  };

  return (
    <>
      <div className="space-y-1" data-field-error={descError ? 'true' : undefined}>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold flex items-center gap-1.5">
            Описание *
          </label>
          <div className="flex items-center gap-2">
            {/* Голосовой ввод */}
            <div className="relative flex items-center gap-1">
              <VoiceInputButton
                mode="parse"
                size="sm"
                onFields={handleVoiceFields}
                onText={t => { if (!t) return; }}
              />
              <span className="text-[10px] text-muted-foreground">Голос</span>
              {voiceToast && (
                <span className="absolute -top-7 right-0 text-[11px] bg-emerald-600 text-white px-2 py-0.5 rounded whitespace-nowrap shadow-md z-50">
                  ✓ {voiceToast}
                </span>
              )}
            </div>
            <div className="w-px h-3 bg-border" />
            {descLen > 0 && (
              <button onClick={() => setPreview(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <Icon name={preview ? 'Pencil' : 'Eye'} size={12} />
                {preview ? 'Редактировать' : 'Просмотр'}
              </button>
            )}
            <button onClick={onDescribe} disabled={aiLoading}
              className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
              <Icon name="Sparkles" size={12} />
              {aiLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
            </button>
          </div>
        </div>
        {preview && descLen > 0 ? (
          <div className="px-3 py-2.5 border rounded-lg bg-white min-h-[120px]">
            <DescriptionPreview text={editing.description || ''} />
          </div>
        ) : (
          <div className={descError ? 'rounded-lg ring-2 ring-red-300' : ''}>
            <CharCount as="textarea" rows={6} max={3000} warnAt={2500}
              value={editing.description || ''}
              onChange={e => {
                setEditing({ ...editing, description: (e.target as HTMLTextAreaElement).value });
                if (descError) setErrors?.(v => ({ ...v, description: false }));
              }} />
          </div>
        )}
        {descError && (
          <p className="text-xs text-red-500 mt-0.5">Добавьте описание (минимум 30 символов)</p>
        )}
        {!descError && descLen > 0 && descLen < 30 && (
          <div className="text-[11px] text-amber-600">
            Ещё {30 - descLen} симв. до минимума.
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-semibold">Теги для поиска</label>
          <button onClick={onGenerateTags} disabled={aiTagsLoading}
            className="text-xs text-brand-orange hover:underline inline-flex items-center gap-1">
            <Icon name="Sparkles" size={12} />
            {aiTagsLoading ? 'Генерация...' : 'Сгенерировать ИИ'}
          </button>
        </div>
        <input className="w-full px-3 py-2 border rounded-lg bg-muted/30" readOnly
          placeholder="Теги создаются автоматически на основе данных объекта"
          value={typeof editing.tags === 'string' ? editing.tags : (editing.tags || []).join(', ')} />
        <div className="text-xs text-muted-foreground mt-1">Создаются на основе данных. Кнопка ИИ — пересоздать.</div>
      </div>

      {editing.id && (
        <div className="text-xs text-muted-foreground border-t border-border pt-3">
          Создан: {fmtDate(editing.created_at as string)} ·
          Обновлён: {fmtDate(editing.updated_at as string)}
        </div>
      )}
    </>
  );
}