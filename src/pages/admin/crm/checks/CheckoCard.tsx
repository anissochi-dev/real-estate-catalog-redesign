import Icon from '@/components/ui/icon';
import type { CheckoData } from './checko-types';
import CheckoCardHeader from './CheckoCardHeader';
import CheckoCardDetails from './CheckoCardDetails';
import CheckoCardFinance from './CheckoCardFinance';

export default function CheckoCard({ data }: { data: CheckoData }) {
  if (data.error) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
        <Icon name="AlertCircle" size={15} className="shrink-0" />
        {data.error}
      </div>
    );
  }

  const наим      = data.наименование || data.name || '—';
  const наимПолн  = data.наименование_полное || data.name_full;
  const инн       = data.инн || data.inn;
  const огрн      = data.огрн || data.ogrn;
  const адрес     = data.адрес || data.address;
  const ликвид    = data.ликвидировано ?? data.is_liquidated ?? false;
  const действует = data.действующее ?? data.is_active ?? false;
  const статус    = data.статус || data.status;
  const риски     = data.риски || data.risks || [];

  const statusColor = ликвид
    ? 'bg-red-50 text-red-700 border-red-200'
    : действует
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  const statusIcon = ликвид ? 'XCircle' : действует ? 'CheckCircle2' : 'AlertCircle';

  return (
    <div className="text-sm">
      <CheckoCardHeader
        наим={наим}
        наимПолн={наимПолн}
        статус={статус}
        statusColor={statusColor}
        statusIcon={statusIcon}
        риски={риски}
        data={data}
      />
      <CheckoCardDetails
        data={data}
        инн={инн}
        огрн={огрн}
        адрес={адрес}
      />
      <CheckoCardFinance data={data} />
    </div>
  );
}
