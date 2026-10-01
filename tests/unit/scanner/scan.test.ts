import { beforeEach, describe, expect, it } from 'vitest';
import { FIELD_ID_ATTR, scanPage } from '@/src/scanner/scan';

// A hand-made page using the patterns Workday forms commonly use (not a real snapshot).
const PAGE = `
<main>
  <h2>My Information</h2>
  <div data-automation-id="formField-legalNameSection_firstName">
    <label for="fn">Given Name(s)<abbr title="required">*</abbr></label>
    <input id="fn" type="text" aria-required="true" value="">
  </div>
  <div data-automation-id="formField-email">
    <span id="em-label">Email Address</span>
    <input type="email" aria-labelledby="em-label" value="a@b.co">
  </div>
  <div data-automation-id="formField-countryPhoneCode">
    <label id="dev-label">Phone Device Type</label>
    <button aria-haspopup="listbox" aria-labelledby="dev-label">Select One</button>
  </div>
  <div data-automation-id="formField-source">
    <label for="src">How Did You Hear About Us? *</label>
    <div><div data-automation-id="selectedItem">LinkedIn</div></div>
    <input id="src" role="combobox" data-automation-id="searchBox">
  </div>
  <h3>Work Experience 2</h3>
  <div data-automation-id="formField-startDate">
    <label>From*</label>
    <div>
      <input data-automation-id="dateSectionMonth-input" value="03">
      <input data-automation-id="dateSectionYear-input" value="2021">
    </div>
  </div>
  <fieldset>
    <legend>Are you legally authorized to work in the US? *</legend>
    <label><input type="radio" name="auth" value="1"> Yes</label>
    <label><input type="radio" name="auth" value="0" checked> No</label>
  </fieldset>
  <label><input type="checkbox"> I agree to the terms</label>
  <textarea aria-label="Cover letter"></textarea>
  <input type="file" style="display:none" data-automation-id="file-upload-input-ref">
  <input type="hidden" name="token" value="x">
  <div hidden><input aria-label="Hidden thing"></div>
</main>`;

describe('scanPage', () => {
  beforeEach(() => {
    document.body.innerHTML = PAGE;
  });

  it('finds each field with its label, type and value', () => {
    const fields = scanPage();
    expect(fields.map((f) => [f.label, f.type, f.currentValue])).toEqual([
      ['Given Name(s)', 'text', ''],
      ['Email Address', 'text', 'a@b.co'],
      ['Phone Device Type', 'select', ''],
      ['How Did You Hear About Us?', 'prompt', 'LinkedIn'],
      ['From', 'date', '03/2021'],
      ['Are you legally authorized to work in the US?', 'radio', 'No'],
      ['I agree to the terms', 'checkbox', ''],
      ['Cover letter', 'textarea', ''],
      ['', 'file', ''],
    ]);
  });

  it('marks required fields and reads radio options and sections', () => {
    const byLabel = Object.fromEntries(scanPage().map((f) => [f.label, f]));
    expect(byLabel['Given Name(s)']!.required).toBe(true);
    expect(byLabel['Email Address']!.required).toBe(false);
    expect(byLabel['How Did You Hear About Us?']!.required).toBe(true);
    expect(byLabel['Are you legally authorized to work in the US?']!.options).toEqual(['Yes', 'No']);
    expect(byLabel['From']!.section).toBe('Work Experience 2');
    expect(byLabel['Given Name(s)']!.section).toBe('My Information');
  });

  it('tags elements so they can be found again, keeping the same id on rescans', () => {
    const first = scanPage();
    const again = scanPage();
    expect(again.map((f) => f.id)).toEqual(first.map((f) => f.id));
    expect(document.querySelector(`[${FIELD_ID_ATTR}="${first[0]!.id}"]`)?.id).toBe('fn');
  });
});
