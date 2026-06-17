import { forwardRef, TextareaHTMLAttributes, InputHTMLAttributes } from 'react';

interface BaseProps {
  max?: number;
  warnAt?: number;
  showCount?: boolean;
}

interface TextareaProps extends BaseProps, TextareaHTMLAttributes<HTMLTextAreaElement> {
  as?: 'textarea';
  rows?: number;
}

interface InputProps extends BaseProps, InputHTMLAttributes<HTMLInputElement> {
  as: 'input';
}

type Props = TextareaProps | InputProps;

const CharCount = forwardRef<HTMLTextAreaElement | HTMLInputElement, Props>(
  (props, ref) => {
    const { max, warnAt, showCount = true, as = 'textarea', className = '', onChange, ...rest } = props;

    const value = String(rest.value ?? '');
    // Обрезаем value до max для отображения
    const displayValue = max != null ? value.slice(0, max) : value;
    const len = displayValue.length;
    const isWarn = warnAt != null && len >= warnAt;
    const isOver = false; // никогда не превышает — обрезаем

    const countColor = isWarn ? 'text-amber-500' : 'text-muted-foreground';

    const baseClass = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none transition ${className}`;

    // Перехватываем onChange и обрезаем до max
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (max != null && e.target.value.length > max) {
        e.target.value = e.target.value.slice(0, max);
      }
      (onChange as React.ChangeEventHandler<typeof e.target>)?.(e as never);
    };

    return (
      <div className="relative">
        {as === 'textarea' ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            className={baseClass}
            maxLength={max}
            {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            value={displayValue}
            onChange={handleChange as React.ChangeEventHandler<HTMLTextAreaElement>}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            className={baseClass}
            maxLength={max}
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
            value={displayValue}
            onChange={handleChange as React.ChangeEventHandler<HTMLInputElement>}
          />
        )}
        {showCount && (
          <div className={`absolute bottom-1.5 right-2.5 text-[10px] select-none pointer-events-none ${countColor}`}>
            {len}{max != null ? `/${max}` : ''}
          </div>
        )}
      </div>
    );
  }
);

CharCount.displayName = 'CharCount';

export default CharCount;