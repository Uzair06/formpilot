import { useMemo, useState } from 'react';
import {
  AnswersProfileSchema,
  countUnanswered,
  DISABILITY_LABELS,
  ETHNICITY_LABELS,
  GENDER_LABELS,
  VETERAN_LABELS,
  YES_NO_QUESTIONS,
  type AnswersProfile,
} from '@/src/profile/answers';
import { saveAnswersProfile } from '@/src/profile/storage';
import { RadioGroupField, SelectField, TextField } from '../components/fields';
import { saveStatusText, useAutosave } from '../useAutosave';

// The radio buttons need a text value for "not answered"; storage uses null.
type YesNoChoice = 'yes' | 'no' | 'unanswered';
const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unanswered', label: 'Not answered' },
] as const;

const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as Array<[T, string]>).map(([value, label]) => ({ value, label }));

interface Props {
  initial: AnswersProfile;
  /** Called after each successful save, so the app always knows the latest answers. */
  onSaved?: (answers: AnswersProfile) => void;
}

/** Form for the answers only the user can give. Never filled by AI. Saves automatically. */
export default function AnswersEditor({ initial, onSaved }: Props) {
  const [answers, setAnswers] = useState<AnswersProfile>(() => structuredClone(initial));

  const valid = useMemo(() => {
    const parsed = AnswersProfileSchema.safeParse(answers);
    return parsed.success ? parsed.data : null;
  }, [answers]);
  const status = useAutosave(valid, async (next) => {
    await saveAnswersProfile(next);
    onSaved?.(next);
  });

  const update = (change: (next: AnswersProfile) => void) =>
    setAnswers((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });

  const unanswered = countUnanswered(answers);

  return (
    <div className="editor">
      <p className={`save-status ${status}`} role="status">
        {saveStatusText(status)}
      </p>

      <p className={unanswered ? 'notice' : 'ok'}>
        {unanswered
          ? `${unanswered} ${unanswered === 1 ? 'question is' : 'questions are'} not answered yet. FormPilot will stop and ask you when a form needs ${unanswered === 1 ? 'it' : 'them'}.`
          : 'All set. These answers will be used on application forms.'}
      </p>

      <details open>
        <summary>Work eligibility</summary>
        {YES_NO_QUESTIONS.map(({ key, question, hint }) => (
          <RadioGroupField<YesNoChoice>
            key={key}
            label={question}
            hint={hint}
            value={answers[key] ?? 'unanswered'}
            options={YES_NO_OPTIONS}
            onChange={(choice) => update((a) => void (a[key] = choice === 'unanswered' ? null : choice))}
          />
        ))}
      </details>

      <details open>
        <summary>About this application</summary>
        <TextField
          label="How did you hear about the job?"
          hint="For example: LinkedIn, company website, a referral. FormPilot picks the closest option on the form."
          value={answers.howDidYouHear}
          onChange={(v) => update((a) => void (a.howDidYouHear = v))}
        />
        <TextField
          label="Notice period (optional)"
          placeholder="e.g. 2 weeks"
          value={answers.noticePeriod}
          onChange={(v) => update((a) => void (a.noticePeriod = v))}
        />
        <TextField
          label="Desired salary (optional)"
          hint="Leave empty to skip. FormPilot never makes one up."
          value={answers.desiredSalary}
          onChange={(v) => update((a) => void (a.desiredSalary = v))}
        />
      </details>

      <details open>
        <summary>Voluntary self-identification</summary>
        <p className="muted small">
          These questions are optional on job forms. FormPilot never guesses them: it uses exactly what you pick here, and
          "Decline to self-identify" unless you change it.
        </p>
        <SelectField label="Gender" value={answers.eeo.gender} options={toOptions(GENDER_LABELS)} onChange={(v) => update((a) => void (a.eeo.gender = v))} />
        <SelectField label="Race / ethnicity" value={answers.eeo.ethnicity} options={toOptions(ETHNICITY_LABELS)} onChange={(v) => update((a) => void (a.eeo.ethnicity = v))} />
        <SelectField label="Veteran status" value={answers.eeo.veteran} options={toOptions(VETERAN_LABELS)} onChange={(v) => update((a) => void (a.eeo.veteran = v))} />
        <SelectField label="Disability" value={answers.eeo.disability} options={toOptions(DISABILITY_LABELS)} onChange={(v) => update((a) => void (a.eeo.disability = v))} />
      </details>
    </div>
  );
}
