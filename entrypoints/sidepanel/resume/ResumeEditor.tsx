import { useMemo, useState } from 'react';
import type { ResumeProfile } from '@/src/profile/resume';
import {
  emptyCertification,
  emptyJobDraft,
  emptySchoolDraft,
  fromDraft,
  toDraft,
  type ResumeDraft,
} from '@/src/profile/resume-draft';
import { saveResumeProfile } from '@/src/profile/storage';
import { CheckboxField, MonthYearField, SelectField, TextField, TextListField } from '../components/fields';
import { saveStatusText, useAutosave } from '../useAutosave';

const PHONE_TYPES = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
] as const;

interface Props {
  initial: ResumeProfile;
  /** Called after each successful save, so the app always knows the latest profile. */
  onSaved?: (profile: ResumeProfile) => void;
}

/** Edit form for the resume profile. Changes are checked and saved automatically. */
export default function ResumeEditor({ initial, onSaved }: Props) {
  const [draft, setDraft] = useState<ResumeDraft>(() => toDraft(initial));

  // Check the draft once per change. A valid result is what autosave writes.
  const result = useMemo(() => fromDraft(draft), [draft]);
  const errors = result.ok ? {} : result.errors;
  const status = useAutosave(result.ok ? result.profile : null, async (profile) => {
    await saveResumeProfile(profile);
    onSaved?.(profile);
  });

  // Change the draft through a copy, so React sees a new object and re-renders.
  const update = (change: (next: ResumeDraft) => void) =>
    setDraft((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });

  const { personal, links } = draft;

  return (
    <div className="editor">
      <p className={`save-status ${status}`} role="status">
        {saveStatusText(status)}
      </p>

      {draft.meta.warnings.length > 0 && (
        <div className="card warn-card">
          <p><strong>Please check</strong></p>
          <ul className="warnings">
            {draft.meta.warnings.map((warning, i) => (
              <li key={i}>
                {warning}{' '}
                <button type="button" className="link-button" onClick={() => update((d) => void d.meta.warnings.splice(i, 1))}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details open>
        <summary>Personal</summary>
        <div className="grid-2">
          <TextField label="First name" value={personal.firstName} onChange={(v) => update((d) => void (d.personal.firstName = v))} error={errors['personal.firstName']} />
          <TextField label="Last name" value={personal.lastName} onChange={(v) => update((d) => void (d.personal.lastName = v))} error={errors['personal.lastName']} />
          <TextField label="Middle name" value={personal.middleName} onChange={(v) => update((d) => void (d.personal.middleName = v))} />
          <TextField label="Preferred name" value={personal.preferredName} onChange={(v) => update((d) => void (d.personal.preferredName = v))} />
        </div>
        <TextField label="Email" type="email" value={personal.email} onChange={(v) => update((d) => void (d.personal.email = v))} error={errors['personal.email']} />
        <div className="grid-phone">
          <TextField label="Code" type="tel" placeholder="+1" value={personal.phone.countryCode} onChange={(v) => update((d) => void (d.personal.phone.countryCode = v))} />
          <TextField label="Phone number" type="tel" value={personal.phone.number} onChange={(v) => update((d) => void (d.personal.phone.number = v))} />
          <SelectField label="Type" value={personal.phone.type} options={PHONE_TYPES} onChange={(v) => update((d) => void (d.personal.phone.type = v))} />
        </div>
        <TextField label="Street address" value={personal.address.line1} onChange={(v) => update((d) => void (d.personal.address.line1 = v))} />
        <div className="grid-2">
          <TextField label="City" value={personal.address.city} onChange={(v) => update((d) => void (d.personal.address.city = v))} />
          <TextField label="State / province" value={personal.address.state} onChange={(v) => update((d) => void (d.personal.address.state = v))} />
          <TextField label="Postal code" value={personal.address.postalCode} onChange={(v) => update((d) => void (d.personal.address.postalCode = v))} />
          <TextField label="Country" value={personal.address.country} onChange={(v) => update((d) => void (d.personal.address.country = v))} />
        </div>
      </details>

      <details open>
        <summary>Links</summary>
        <TextField label="LinkedIn" type="url" placeholder="https://www.linkedin.com/in/…" value={links.linkedin} onChange={(v) => update((d) => void (d.links.linkedin = v))} error={errors['links.linkedin']} />
        <TextField label="GitHub" type="url" placeholder="https://github.com/…" value={links.github} onChange={(v) => update((d) => void (d.links.github = v))} error={errors['links.github']} />
        <TextField label="Portfolio / website" type="url" value={links.portfolio} onChange={(v) => update((d) => void (d.links.portfolio = v))} error={errors['links.portfolio']} />
        <TextListField label="Other links" values={links.other} onChange={(v) => update((d) => void (d.links.other = v))} error={errors['links.other']} />
      </details>

      <details open>
        <summary>Work experience ({draft.workExperience.length})</summary>
        {draft.workExperience.map((job, i) => (
          <div className="entry-card" key={i}>
            <div className="row">
              <strong>{job.title || job.company ? `${job.title}${job.title && job.company ? ' · ' : ''}${job.company}` : `Job ${i + 1}`}</strong>
              <button type="button" className="link-button danger" onClick={() => update((d) => void d.workExperience.splice(i, 1))}>
                Remove
              </button>
            </div>
            <TextField label="Job title" value={job.title} onChange={(v) => update((d) => void (d.workExperience[i]!.title = v))} error={errors[`workExperience.${i}.title`]} />
            <TextField label="Company" value={job.company} onChange={(v) => update((d) => void (d.workExperience[i]!.company = v))} error={errors[`workExperience.${i}.company`]} />
            <TextField label="Location" value={job.location} onChange={(v) => update((d) => void (d.workExperience[i]!.location = v))} />
            <CheckboxField label="I currently work here" checked={job.current} onChange={(v) => update((d) => void (d.workExperience[i]!.current = v))} />
            <div className="grid-2">
              <MonthYearField label="Start" value={job.start} onChange={(v) => update((d) => void (d.workExperience[i]!.start = v))} error={errors[`workExperience.${i}.start.year`]} />
              {!job.current && (
                <MonthYearField label="End" value={job.end} onChange={(v) => update((d) => void (d.workExperience[i]!.end = v))} error={errors[`workExperience.${i}.end.year`]} />
              )}
            </div>
            <TextField label="What you did" multiline value={job.description} onChange={(v) => update((d) => void (d.workExperience[i]!.description = v))} />
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => update((d) => void d.workExperience.push(emptyJobDraft()))}>
          + Add job
        </button>
      </details>

      <details open>
        <summary>Education ({draft.education.length})</summary>
        {draft.education.map((school, i) => (
          <div className="entry-card" key={i}>
            <div className="row">
              <strong>{school.school || `School ${i + 1}`}</strong>
              <button type="button" className="link-button danger" onClick={() => update((d) => void d.education.splice(i, 1))}>
                Remove
              </button>
            </div>
            <TextField label="School" value={school.school} onChange={(v) => update((d) => void (d.education[i]!.school = v))} />
            <div className="grid-2">
              <TextField label="Degree" placeholder="e.g. B.S." value={school.degree} onChange={(v) => update((d) => void (d.education[i]!.degree = v))} />
              <TextField label="Field of study" value={school.fieldOfStudy} onChange={(v) => update((d) => void (d.education[i]!.fieldOfStudy = v))} />
              <TextField label="Start year" value={school.startYear} onChange={(v) => update((d) => void (d.education[i]!.startYear = v))} error={errors[`education.${i}.startYear`]} />
              <TextField label="End year" value={school.endYear} onChange={(v) => update((d) => void (d.education[i]!.endYear = v))} error={errors[`education.${i}.endYear`]} />
            </div>
            <TextField label="GPA" value={school.gpa} onChange={(v) => update((d) => void (d.education[i]!.gpa = v))} />
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => update((d) => void d.education.push(emptySchoolDraft()))}>
          + Add school
        </button>
      </details>

      <details open>
        <summary>Skills and languages</summary>
        <TextListField label="Skills" values={draft.skills} onChange={(v) => update((d) => void (d.skills = v))} />
        <TextListField label="Languages you speak" values={draft.languages} onChange={(v) => update((d) => void (d.languages = v))} />
      </details>

      <details open>
        <summary>Certifications ({draft.certifications.length})</summary>
        {draft.certifications.map((cert, i) => (
          <div className="entry-card" key={i}>
            <div className="row">
              <strong>{cert.name || `Certification ${i + 1}`}</strong>
              <button type="button" className="link-button danger" onClick={() => update((d) => void d.certifications.splice(i, 1))}>
                Remove
              </button>
            </div>
            <TextField label="Name" value={cert.name} onChange={(v) => update((d) => void (d.certifications[i]!.name = v))} />
            <div className="grid-2">
              <TextField label="Issuer" value={cert.issuer} onChange={(v) => update((d) => void (d.certifications[i]!.issuer = v))} />
              <TextField label="Date" value={cert.date} onChange={(v) => update((d) => void (d.certifications[i]!.date = v))} />
            </div>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => update((d) => void d.certifications.push(emptyCertification()))}>
          + Add certification
        </button>
      </details>

      <details open>
        <summary>Summary</summary>
        <TextField label="Professional summary" multiline value={draft.summary} onChange={(v) => update((d) => void (d.summary = v))} />
      </details>
    </div>
  );
}
