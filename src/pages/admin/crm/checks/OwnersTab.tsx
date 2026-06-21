import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';
import OwnerDetailedChecks from './OwnerDetailedChecks';

interface Props {
  serviceStatus: Record<string, boolean>;
  newdbConnected: boolean;
  prefillName?: string | null;
  onPrefillUsed?: () => void;
  onOpenProperty?: (cadastralNumber: string) => void;
}

export default function OwnersTab({
  newdbConnected,
  prefillName,
  onPrefillUsed,
  onOpenProperty,
}: Props) {
  const { token } = useAuth();

  return (
    <div className="space-y-5">
      {prefillName && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-brand-blue/5 border border-brand-blue/20 text-sm">
          <Icon name="UserSearch" size={15} className="text-brand-blue shrink-0" />
          <span className="text-brand-blue">
            Проверка владельца: <strong>{prefillName}</strong>
          </span>
          {onPrefillUsed && (
            <button onClick={onPrefillUsed} className="ml-auto text-muted-foreground hover:text-foreground">
              <Icon name="X" size={14} />
            </button>
          )}
        </div>
      )}
      <div className="text-sm text-muted-foreground">
        Глубокая проверка по государственным базам данных: ФССП, МВД, ФНС, ЕФРСБ, КАД и другим. Требует данные паспорта или ИНН.
      </div>
      {!newdbConnected && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <Icon name="AlertTriangle" size={17} className="shrink-0 mt-0.5 text-amber-600" />
          <div className="text-sm">
            <div className="font-semibold">NewDB API-ключ не настроен</div>
            <div className="text-amber-800">Перейдите в Настройки → Интеграции → Проверка безопасности.</div>
          </div>
        </div>
      )}
      <OwnerDetailedChecks
        newdbConnected={newdbConnected}
        token={token || ''}
        prefillName={prefillName}
        onPrefillUsed={onPrefillUsed}
        onOpenProperty={onOpenProperty}
      />
    </div>
  );
}
