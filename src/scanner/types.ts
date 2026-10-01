// What the Scanner reports for each box on a Workday page.

export type FieldType =
  | 'text'
  | 'textarea'
  | 'select' // Workday drop-down (button that opens a list) or a native <select>
  | 'prompt' // search-as-you-type box (e.g. "How did you hear about us", skills)
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'file';

export interface FieldDescriptor {
  id: string; // our own id, also written on the element as data-formpilot-id
  label: string;
  helperText: string;
  section: string; // nearest heading, e.g. "Work Experience 2"
  type: FieldType;
  required: boolean;
  currentValue: string; // what is in the box now ('' if empty)
  options: string[]; // choices for radio groups and native selects (Workday drop-downs load theirs on click)
  automationId: string; // Workday's data-automation-id, a hint only
}
