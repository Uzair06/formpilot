import { beforeEach, describe, expect, it } from 'vitest';
import { fillField } from '@/src/filler/fill';
import { scanPage } from '@/src/scanner/scan';

const byLabel = (label: string) => scanPage().find((f) => f.label === label)!;

describe('fillField', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <label for="city">City</label><input id="city">
        <label for="country">Country</label>
        <select id="country"><option value="">Select One</option><option value="us">United States of America</option><option value="in">India</option></select>
        <fieldset><legend>Willing to relocate?</legend>
          <label><input type="radio" name="rel"> Yes</label><label><input type="radio" name="rel"> No</label>
        </fieldset>
        <label><input type="checkbox" id="c"> Text me updates</label>
        <span id="dt">Phone Device Type</span>
        <button id="dd" aria-haspopup="listbox" aria-labelledby="dt">Select One</button>
      </main>`;
    // Fake Workday drop-down: clicking the button adds a list at the end of the page.
    const button = document.getElementById('dd')!;
    button.addEventListener('click', () => {
      const list = document.createElement('ul');
      list.setAttribute('role', 'listbox');
      for (const text of ['Mobile', 'Landline']) {
        const option = document.createElement('li');
        option.setAttribute('role', 'option');
        option.textContent = text;
        option.addEventListener('click', () => {
          button.textContent = text;
          list.remove();
        });
        list.append(option);
      }
      document.body.append(list);
    });
  });

  it('types into text boxes', async () => {
    expect(await fillField(byLabel('City'), 'Santa Clara')).toEqual({ ok: true, value: 'Santa Clara' });
    expect((document.getElementById('city') as HTMLInputElement).value).toBe('Santa Clara');
  });

  it('picks the closest real option in a native select', async () => {
    expect(await fillField(byLabel('Country'), 'United States')).toEqual({ ok: true, value: 'United States of America' });
  });

  it('refuses a value that is not an option and lists the real ones', async () => {
    const result = await fillField(byLabel('Country'), 'Mars');
    expect(result).toEqual({ ok: false, reason: '"Mars" is not one of the choices.', options: ['Select One', 'United States of America', 'India'] });
  });

  it('clicks the matching radio button and tick box', async () => {
    expect(await fillField(byLabel('Willing to relocate?'), 'No')).toEqual({ ok: true, value: 'No' });
    expect(await fillField(byLabel('Text me updates'), 'true')).toEqual({ ok: true, value: 'true' });
    expect((document.getElementById('c') as HTMLInputElement).checked).toBe(true);
  });

  it('opens a Workday-style drop-down and clicks the option', async () => {
    expect(await fillField(byLabel('Phone Device Type'), 'mobile')).toEqual({ ok: true, value: 'Mobile' });
    expect(document.getElementById('dd')!.textContent).toBe('Mobile');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
