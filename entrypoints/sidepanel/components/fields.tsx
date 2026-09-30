import { useId, useState, type ReactNode } from 'react';
import type { MonthYearDraft } from '@/src/profile/resume-draft';

// Small building blocks for the edit forms. Each one shows a label, the box, and
// (if given) a red error message under it.

function FieldShell({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="muted small">{hint}</p>}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: 'text' | 'email' | 'tel' | 'url';
  multiline?: boolean;
  placeholder?: string;
}

export function TextField({ label, value, onChange, error, hint, type = 'text', multiline, placeholder }: TextFieldProps) {
  const id = useId();
  const shared = {
    id,
    value,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      {multiline ? (
        <textarea {...shared} rows={4} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...shared} type={type} onChange={(e) => onChange(e.target.value)} />
      )}
    </FieldShell>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  error?: string;
  hint?: string;
}

export function SelectField<T extends string>({ label, value, options, onChange, error, hint }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <select id={id} value={value} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** A list edited as "one item per line" (skills, languages, extra links). */
export function TextListField({ label, values, onChange, error, hint }: { label: string; values: string[]; onChange: (values: string[]) => void; error?: string; hint?: string }) {
  const id = useId();
  // Keep the raw text while typing; otherwise pressing Enter would make an empty line
  // that gets removed straight away, and the cursor would jump.
  const [text, setText] = useState(values.join('\n'));
  return (
    <FieldShell id={id} label={label} error={error} hint={hint ?? 'One per line.'}>
      <textarea
        id={id}
        rows={Math.min(Math.max(values.length + 1, 3), 10)}
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split('\n').map((line) => line.trim()).filter(Boolean));
        }}
      />
    </FieldShell>
  );
}

export function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="field checkbox">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Month drop-down + year box, for job start/end dates. */
export function MonthYearField({ label, value, onChange, error }: { label: string; value: MonthYearDraft; onChange: (value: MonthYearDraft) => void; error?: string }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error}>
      <div className="month-year">
        <select
          aria-label={`${label} month`}
          value={value.month ?? ''}
          onChange={(e) => onChange({ ...value, month: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Month</option>
          {MONTHS.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          id={id}
          aria-label={`${label} year`}
          inputMode="numeric"
          placeholder="Year"
          value={value.year}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange({ ...value, year: e.target.value })}
        />
      </div>
    </FieldShell>
  );
}
