import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { S } from './types';
import { CRM_CHECKS_URL, getToken } from '@/lib/adminApi';

type CheckState = { loading: boolean; status: 'idle' | 'ok' | 'err'; message: string };
const idle: CheckState = { loading: false, status: 'idle', message: '' };

function ConnBadge({ state, hasKey }: { state: CheckState; hasKey: boolean }) {
  if (state.status === 'ok') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <Icon name="CheckCircle2" size={11} /> Подключено
    </span>
  );
  if (state.status === 'err') return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
      <Icon name="XCircle" size={11} /> Ошибка
    </span>
  );
  if (!hasKey) return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
      <Icon name="Circle" size={11} /> Не настроено
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Icon name="Clock" size={11} /> Не проверено
    </span>
  );
}

interface Props {
  s: Partial<S>;
  setS: (v: Partial<S>) => void;
}

export default function IntegrationsSecuritySection({ s, setS }: Props) {
  const [zachestnyState, setZachestnyState] = useState<CheckState>(idle);
  const [newdbState, setNewdbState] = useState<CheckState>(idle);
  const [bezopasnoState, setBezopasnoState] = useState<CheckState>(idle);

  const testSecurityKey = async (
    source: 'zachestny' | 'newdb' | 'bezopasno',
    key: string,
    setState: (s: CheckState) => void,
  ) => {
    if (!key.trim()) { setState({ loading: false, status: 'err', message: 'Введите API-ключ' }); return; }
    setState({ loading: true, status: 'idle', message: '' });
    try {
      const r = await fetch(`${CRM_CHECKS_URL}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': getToken() },
        body: JSON.stringify({ check_type: 'ping', sources: [source], api_key: key }),
      });
      const d = await r.json();
      const result = d.results?.[source];
      if (!r.ok || result?.error) {
        setState({ loading: false, status: 'err', message: result?.error || d.error || `HTTP ${r.status}` });
      } else {
        setState({ loading: false, status: 'ok', message: result?.message || 'Ключ работает' });
      }
    } catch (e) {
      setState({ loading: false, status: 'err', message: e instanceof Error ? e.message : 'Ошибка' });
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
      <div className="font-display font-700 text-lg flex items-center gap-2">
        <Icon name="ShieldCheck" size={18} className="text-brand-blue" />
        Проверка безопасности
      </div>
      <p className="text-sm text-muted-foreground">
        API-ключи для проверки компаний, собственников и недвижимости во вкладке «Проверки» CRM.
      </p>

      <div className="space-y-3">
        {/* ЧестныйБизнес */}
        <div className={`rounded-xl border p-4 space-y-2 ${zachestnyState.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30' : zachestnyState.status === 'err' ? 'border-red-300 bg-red-50/30' : 'border-border'}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">ЧестныйБизнес</span>
              <span className="text-xs text-muted-foreground">Проверка компаний и ИП по ИНН</span>
            </div>
            <ConnBadge state={zachestnyState} hasKey={!!s.zachestny_api_key} />
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            type="password"
            placeholder="Введите API-ключ zachestnyibiznesapi.ru"
            value={s.zachestny_api_key || ''}
            onChange={e => { setS({ ...s, zachestny_api_key: e.target.value }); setZachestnyState(idle); }}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              Получить: <a href="https://zachestnyibiznesapi.ru" target="_blank" rel="noreferrer" className="text-brand-blue underline">zachestnyibiznesapi.ru</a> → Личный кабинет → API-ключ
            </div>
            <button
              type="button"
              onClick={() => testSecurityKey('zachestny', s.zachestny_api_key || '', setZachestnyState)}
              disabled={zachestnyState.loading || !s.zachestny_api_key}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40 shrink-0"
            >
              {zachestnyState.loading ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверка...</> : <><Icon name="Zap" size={12} /> Проверить ключ</>}
            </button>
          </div>
          {zachestnyState.status !== 'idle' && (
            <div className={`text-xs flex items-center gap-1.5 ${zachestnyState.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
              <Icon name={zachestnyState.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={12} />
              {zachestnyState.message}
            </div>
          )}
        </div>

        {/* NewDB */}
        <div className={`rounded-xl border p-4 space-y-2 ${newdbState.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30' : newdbState.status === 'err' ? 'border-red-300 bg-red-50/30' : 'border-border'}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">NewDB</span>
              <span className="text-xs text-muted-foreground">Физлица и телефоны</span>
            </div>
            <ConnBadge state={newdbState} hasKey={!!s.newdb_api_key} />
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            type="password"
            placeholder="Введите token newdb.net"
            value={s.newdb_api_key || ''}
            onChange={e => { setS({ ...s, newdb_api_key: e.target.value }); setNewdbState(idle); }}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              Получить: <a href="https://newdb.net" target="_blank" rel="noreferrer" className="text-brand-blue underline">newdb.net</a> → Регистрация → API токен
            </div>
            <button
              type="button"
              onClick={() => testSecurityKey('newdb', s.newdb_api_key || '', setNewdbState)}
              disabled={newdbState.loading || !s.newdb_api_key}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40 shrink-0"
            >
              {newdbState.loading ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверка...</> : <><Icon name="Zap" size={12} /> Проверить ключ</>}
            </button>
          </div>
          {newdbState.status !== 'idle' && (
            <div className={`text-xs flex items-center gap-1.5 ${newdbState.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
              <Icon name={newdbState.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={12} />
              {newdbState.message}
            </div>
          )}
        </div>

        {/* Безопасно.org */}
        <div className={`rounded-xl border p-4 space-y-2 ${bezopasnoState.status === 'ok' ? 'border-emerald-300 bg-emerald-50/30' : bezopasnoState.status === 'err' ? 'border-red-300 bg-red-50/30' : 'border-border'}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Безопасно.org</span>
              <span className="text-xs text-muted-foreground">Комплексная проверка</span>
            </div>
            <ConnBadge state={bezopasnoState} hasKey={!!s.bezopasno_api_key} />
          </div>
          <input
            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            type="password"
            placeholder="Введите API-ключ bezopasno.org"
            value={s.bezopasno_api_key || ''}
            onChange={e => { setS({ ...s, bezopasno_api_key: e.target.value }); setBezopasnoState(idle); }}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">
              Получить: <a href="https://bezopasno.org" target="_blank" rel="noreferrer" className="text-brand-blue underline">bezopasno.org</a> → API → Ключ доступа
            </div>
            <button
              type="button"
              onClick={() => testSecurityKey('bezopasno', s.bezopasno_api_key || '', setBezopasnoState)}
              disabled={bezopasnoState.loading || !s.bezopasno_api_key}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-blue text-brand-blue text-xs font-semibold hover:bg-brand-blue/5 disabled:opacity-40 shrink-0"
            >
              {bezopasnoState.loading ? <><Icon name="Loader2" size={12} className="animate-spin" /> Проверка...</> : <><Icon name="Zap" size={12} /> Проверить ключ</>}
            </button>
          </div>
          {bezopasnoState.status !== 'idle' && (
            <div className={`text-xs flex items-center gap-1.5 ${bezopasnoState.status === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
              <Icon name={bezopasnoState.status === 'ok' ? 'CheckCircle2' : 'AlertCircle'} size={12} />
              {bezopasnoState.message}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
        <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
        <div>Ключи хранятся в защищённой БД и используются только на сервере. Подключите хотя бы один сервис — остальные можно добавить позже.</div>
      </div>
    </div>
  );
}
