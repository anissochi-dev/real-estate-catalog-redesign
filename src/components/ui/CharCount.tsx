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
    const { max, warnAt, showCount = true, as = 'textarea', className = '', ...rest } = props;

    const value = String(rest.value ?? '');
    const len = value.length;
    const isWarn = warnAt != null && len >= warnAt;
    const isOver = max != null && len > max;

    const countColor = isOver
      ? 'text-red-500'
      : isWarn
      ? 'text-amber-500'
      : 'text-muted-foreground';

    const baseClass = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-none transition ${
      isOver ? 'border-red-400' : ''
    } ${className}`;

    return (
      <div className="relative">
        {as === 'textarea' ? (
          <textarea
            ref={ref as React.Ref<HTMLTextAreaElement>}
            className={baseClass}
            {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            className={baseClass}
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
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
