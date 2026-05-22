interface DealHeaderData {
  owner_name?: string;
  assignee_name?: string;
  amount?: number;
  commission?: number;
  source?: string;
  notes?: string;
}

interface Props {
  dealDetail: DealHeaderData;
}

export default function DealHeaderInfo({ dealDetail }: Props) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {dealDetail.owner_name && <div><span className="text-muted-foreground">Собственник:</span> <strong>{dealDetail.owner_name}</strong></div>}
        {dealDetail.assignee_name && <div><span className="text-muted-foreground">Ответственный:</span> {dealDetail.assignee_name}</div>}
        {dealDetail.amount && <div><span className="text-muted-foreground">Сумма:</span> <strong>{Number(dealDetail.amount).toLocaleString('ru')} ₽</strong></div>}
        {dealDetail.commission && <div><span className="text-muted-foreground">Комиссия:</span> <strong className="text-green-600">{Number(dealDetail.commission).toLocaleString('ru')} ₽</strong></div>}
        {dealDetail.source && <div><span className="text-muted-foreground">Источник:</span> {dealDetail.source}</div>}
      </div>
      {dealDetail.notes && <div className="bg-muted/40 rounded-xl p-3 text-sm">{dealDetail.notes}</div>}
    </>
  );
}
