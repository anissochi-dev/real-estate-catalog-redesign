import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { Criteria, CriteriaForm, EMPTY_FORM } from './criteriaTypes';
import CriteriaList from './CriteriaList';
import CriteriaFormModal from './CriteriaForm';

export default function SocialCriteriaPanel({
  token, apiUrl, onRun,
}: { token: string; apiUrl: string; onRun: () => void }) {
  const [criteria, setCriteria] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CriteriaForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [kwInput, setKwInput] = useState('');
  const [kwExInput, setKwExInput] = useState('');

  const post = async (body: object) => {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
      body: JSON.stringify(body),
    }).then(r => r.json());
    return r;
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await post({ action: 'criteria_list' });
      if (!r.error) setCriteria(r.criteria || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setKwInput(''); setKwExInput('');
    setShowForm(true);
  };

  const openEdit = (c: Criteria) => {
    setForm({
      title: c.title,
      platforms: c.platforms || [],
      keywords_include: c.keywords_include || [],
      keywords_exclude: c.keywords_exclude || [],
      deal_types: c.deal_types || [],
      categories: c.categories || [],
      price_min: c.price_min ? String(c.price_min) : '',
      price_max: c.price_max ? String(c.price_max) : '',
      area_min: c.area_min ? String(c.area_min) : '',
      area_max: c.area_max ? String(c.area_max) : '',
      districts: c.districts || [],
      require_price: c.require_price,
      require_area: c.require_area,
      require_phone: c.require_phone,
      require_photo: c.require_photo,
      require_address: c.require_address,
      route_to: c.route_to || 'moderation',
      run_interval_hours: c.run_interval_hours || 6,
      is_active: c.is_active,
    });
    setEditId(c.id);
    setKwInput(''); setKwExInput('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Введите название'); return; }
    if (!form.platforms.length) { toast.error('Выберите хотя бы одну платформу'); return; }
    setSaving(true);
    try {
      const body = {
        action: editId ? 'criteria_edit' : 'criteria_add',
        id: editId,
        ...form,
        price_min: form.price_min ? Number(form.price_min) : null,
        price_max: form.price_max ? Number(form.price_max) : null,
        area_min:  form.area_min  ? Number(form.area_min)  : null,
        area_max:  form.area_max  ? Number(form.area_max)  : null,
      };
      const r = await post(body);
      if (r.error) { toast.error(r.error); return; }
      toast.success(editId ? 'Критерий обновлён' : 'Критерий создан');
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  };

  const handleToggle = async (id: number) => {
    await post({ action: 'criteria_toggle', id });
    load();
  };

  const handleRun = async (id: number) => {
    setRunningId(id);
    try {
      const r = await post({ action: 'criteria_run', id });
      if (r.error) { toast.error(r.error); return; }
      toast.success(`Запущено — найдено ${r.total_saved ?? 0} объявлений`);
      load(); onRun();
    } finally { setRunningId(null); }
  };

  const addKw = (type: 'include' | 'exclude') => {
    const val = type === 'include' ? kwInput.trim() : kwExInput.trim();
    if (!val) return;
    if (type === 'include') {
      setForm(f => ({ ...f, keywords_include: [...f.keywords_include, val] }));
      setKwInput('');
    } else {
      setForm(f => ({ ...f, keywords_exclude: [...f.keywords_exclude, val] }));
      setKwExInput('');
    }
  };

  return (
    <div className="space-y-3">
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Критерии определяют что искать и куда отправлять найденные объявления
        </p>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-xl text-xs font-semibold"
        >
          <Icon name="Plus" size={13} />
          Новый критерий
        </button>
      </div>

      {/* Список критериев */}
      <CriteriaList
        criteria={criteria}
        loading={loading}
        runningId={runningId}
        onNew={openNew}
        onEdit={openEdit}
        onRun={handleRun}
        onToggle={handleToggle}
      />

      {/* Форма создания/редактирования */}
      {showForm && (
        <CriteriaFormModal
          form={form}
          setForm={setForm}
          editId={editId}
          saving={saving}
          kwInput={kwInput}
          kwExInput={kwExInput}
          setKwInput={setKwInput}
          setKwExInput={setKwExInput}
          onAddKw={addKw}
          onSave={handleSave}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}