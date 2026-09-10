import clsx from 'clsx';
import { ICONS, type LucideIcon } from './icons';
import { Loader2, Check, ChevronDown, Square as SquareIcon } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react';

// ------------------------------------------------------------------ icon

export type IconName = keyof typeof ICONS;

/**
 * Render a lucide icon by name. Only the icons Toolbox actually references are
 * bundled (see scripts/generate-icons.mjs), so this stays cheap.
 */
export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.75,
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Component: LucideIcon = ICONS[name] ?? SquareIcon;
  return <Component size={size} className={className} strokeWidth={strokeWidth} aria-hidden />;
}

// ------------------------------------------------------------------ button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background,border-color,color,opacity,box-shadow] duration-100 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-panel hover:bg-ink/88 active:bg-ink/80 shadow-[0_1px_2px_rgba(0,0,0,0.06)]',
  secondary: 'bg-panel text-ink border border-line hover:bg-canvas hover:border-line-strong',
  ghost: 'text-ink-soft hover:bg-ink/6 hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
  subtle: 'bg-ink/5 text-ink hover:bg-ink/10',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[12px]',
  md: 'h-8.5 px-3.5 text-[13px]',
  lg: 'h-10 px-5 text-[14px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  full?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading,
  full,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], full && 'w-full', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 size={size === 'lg' ? 16 : 14} className="animate-spin-slow" aria-hidden />
      ) : (
        icon && <Icon name={icon} size={size === 'lg' ? 16 : 14} />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={14} />}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  className,
  ...rest
}: Omit<ButtonProps, 'children' | 'icon'> & { icon: string; label: string }) {
  const dims = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-10 w-10' : 'h-8.5 w-8.5';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(BUTTON_BASE, BUTTON_VARIANTS[variant], dims, 'p-0', className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  );
}

// ------------------------------------------------------------------ surfaces

export function Card({
  className,
  children,
  padded = true,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={clsx('rounded-card border border-line bg-panel', padded && 'p-4', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  dense,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <section className={clsx('rounded-card border border-line bg-panel', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[12px] text-ink-faint">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={dense ? 'p-3' : 'p-4'}>{children}</div>
    </section>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={clsx('border-0 border-t border-line', className)} />;
}

// ------------------------------------------------------------------ fields

export function Field({
  label,
  hint,
  error,
  children,
  className,
  inline,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  inline?: boolean;
  htmlFor?: string;
}) {
  if (inline) {
    return (
      <div className={clsx('flex items-center justify-between gap-4 py-1.5', className)}>
        <div className="min-w-0">
          {label && (
            <label htmlFor={htmlFor} className="block text-[13px] text-ink">
              {label}
            </label>
          )}
          {hint && <p className="text-[11.5px] text-ink-faint">{hint}</p>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    );
  }
  return (
    <div className={clsx('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-[12px] font-medium text-ink-soft">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11.5px] text-danger">{error}</p>
      ) : (
        hint && <p className="text-[11.5px] text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-lg border border-line bg-panel px-2.5 text-[13px] text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-50';

export function Input({ className, ...rest }: ComponentPropsWithRef<'input'>) {
  return <input className={clsx(CONTROL, 'h-8.5', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentPropsWithRef<'textarea'>) {
  return (
    <textarea
      className={clsx(CONTROL, 'min-h-24 resize-y py-2 font-mono text-[12.5px] leading-[1.55] selectable', className)}
      spellCheck={false}
      {...rest}
    />
  );
}

export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  suffix,
  className,
  ...rest
}: Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange'> & {
  value: number | '';
  onValueChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        className={clsx(CONTROL, 'h-8.5', suffix && 'pr-10', className)}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          onValueChange(Number.isNaN(n) ? 0 : n);
        }}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-ink-faint">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select({
  className,
  options,
  children,
  ...rest
}: ComponentPropsWithRef<'select'> & {
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
}) {
  return (
    <div className="relative">
      <select className={clsx(CONTROL, 'h-8.5 appearance-none pr-8', className)} {...rest}>
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={clsx(
        'relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40',
        checked ? 'bg-ink' : 'bg-line-strong',
      )}
    >
      <span
        className={clsx(
          'absolute top-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <button
        type="button"
        role="checkbox"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={clsx(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors disabled:opacity-40',
          checked ? 'border-ink bg-ink text-panel' : 'border-line-strong bg-panel',
        )}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </button>
      {label && (
        <label htmlFor={id} className="cursor-pointer text-[13px] text-ink">
          {label}
        </label>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: string; title?: string }>;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={clsx('inline-flex rounded-lg border border-line bg-canvas p-[2px]', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title ?? o.label}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[6px] font-medium transition-colors',
            size === 'sm' ? 'h-6 px-2 text-[11.5px]' : 'h-7 px-3 text-[12.5px]',
            value === o.value
              ? 'bg-panel text-ink shadow-[0_1px_2px_rgba(0,0,0,0.07)]'
              : 'text-ink-faint hover:text-ink',
          )}
        >
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.valueAsNumber)}
      className={clsx(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none',
        '[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-panel',
        '[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-line-strong',
        '[&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.2)]',
        className,
      )}
      style={{
        background: `linear-gradient(to right, var(--color-ink) 0%, var(--color-ink) ${pct}%, var(--color-line) ${pct}%, var(--color-line) 100%)`,
      }}
    />
  );
}

export function ColorInput({
  value,
  onChange,
  className,
  allowAlpha,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  allowAlpha?: boolean;
}) {
  // <input type="color"> cannot express alpha, so the text field stays authoritative.
  const swatch = value.length === 9 ? value.slice(0, 7) : value;
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <label className="relative h-8.5 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line">
        <span className="absolute inset-0 checkerboard" />
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(swatch) ? swatch : '#000000'}
          onChange={(e) => onChange(allowAlpha && value.length === 9 ? e.target.value + value.slice(7) : e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono"
        spellCheck={false}
      />
    </div>
  );
}

// ------------------------------------------------------------------ feedback

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warn';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-ink/6 text-ink-soft',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
    warn: 'bg-warn-soft text-warn',
  } as const;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({
  value,
  className,
  indeterminate,
}: {
  value: number | null;
  className?: string;
  indeterminate?: boolean;
}) {
  const showIndeterminate = indeterminate || value === null;
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}>
      {showIndeterminate ? (
        <div className="h-full w-1/4 rounded-full bg-ink animate-indeterminate" />
      ) : (
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-200"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
        />
      )}
    </div>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx('animate-spin-slow text-ink-faint', className)} aria-hidden />;
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'success' | 'warn' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const config = {
    info: { cls: 'border-line bg-canvas text-ink-soft', icon: 'Info' },
    success: { cls: 'border-success/25 bg-success-soft text-success', icon: 'CircleCheck' },
    warn: { cls: 'border-warn/25 bg-warn-soft text-warn', icon: 'TriangleAlert' },
    danger: { cls: 'border-danger/25 bg-danger-soft text-danger', icon: 'CircleAlert' },
  } as const;
  const c = config[tone];
  return (
    <div className={clsx('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px]', c.cls, className)}>
      <Icon name={c.icon} size={15} className="mt-[1px] shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'leading-[1.5]')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon = 'Inbox',
  title,
  description,
  action,
  className,
}: {
  icon?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink/5">
        <Icon name={icon} size={18} className="text-ink-faint" />
      </div>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[12.5px] text-ink-faint">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-canvas px-1 font-sans text-[10.5px] font-medium text-ink-faint">
      {children}
    </kbd>
  );
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 truncate text-[13.5px] font-medium text-ink selectable">{value}</p>
      {hint && <p className="truncate text-[11.5px] text-ink-faint">{hint}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ copy

export function CopyButton({
  value,
  label = 'Copy',
  size = 'sm',
  variant = 'secondary',
  className,
  disabled,
}: {
  value: string | (() => string);
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={disabled}
      icon={copied ? 'Check' : 'Copy'}
      onClick={async () => {
        const text = typeof value === 'function' ? value() : value;
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          /* clipboard blocked — nothing useful to do */
        }
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

// ------------------------------------------------------------------ tabs

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}
const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useMemo(() => ({ value, setValue: onChange }), [value, onChange]);
  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="tablist" className={clsx('flex items-center gap-0.5 border-b border-line', className)}>
      {children}
    </div>
  );
}

export function Tab({ value, children, icon }: { value: string; children: ReactNode; icon?: string }) {
  const ctx = useContext(TabsContext);
  const active = ctx?.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx?.setValue(value)}
      className={clsx(
        'relative inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium transition-colors',
        active ? 'text-ink' : 'text-ink-faint hover:text-ink-soft',
      )}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
      {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" />}
    </button>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(TabsContext);
  if (ctx?.value !== value) return null;
  return (
    <div role="tabpanel" className={clsx('animate-in', className)}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ modal

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6 pt-[12vh]">
      <div className="fixed inset-0 bg-black/25" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={clsx(
          'animate-pop relative w-full rounded-xl border border-line bg-panel shadow-[0_16px_48px_rgba(0,0,0,0.16)] outline-none',
          width,
        )}
      >
        {title && (
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
            <IconButton icon="X" label="Close" size="sm" onClick={onClose} />
          </header>
        )}
        <div className="max-h-[60vh] overflow-y-auto p-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ misc

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('font-mono text-[12px] selectable', className)}>{children}</span>;
}

export function ScrollArea({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('overflow-y-auto overscroll-contain', className)}>{children}</div>;
}
