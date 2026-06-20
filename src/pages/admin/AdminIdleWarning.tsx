import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/icon';

interface Props {
  secondsLeft: number;
  onStay: () => void;
}

export default function AdminIdleWarning({ secondsLeft, onStay }: Props) {
  const { logout } = useAuth();

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in-up">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <Icon name="Clock" size={22} className="text-amber-600" />
        </div>
        <h2 className="font-display font-700 text-lg mb-1">Вы здесь?</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Из-за бездействия сессия будет завершена через{' '}
          <span className="font-semibold text-foreground">{secondsLeft} сек</span>.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => logout()}
            className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
          >
            Выйти
          </button>
          <button
            onClick={onStay}
            className="flex-1 btn-blue text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
          >
            Остаться в админке
          </button>
        </div>
      </div>
    </div>
  );
}
