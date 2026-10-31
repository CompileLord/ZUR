import test from 'node:test';
import assert from 'node:assert/strict';
import { adminErrorField, showFormError, clearFormErrors } from '../src/app/pages/admin-form-feedback.ts';
import { adminSuccessMessage } from '../src/app/pages/admin-flash.ts';
import { renderAdminPage } from '../src/pages/admin/AdminPages.ts';

class FakeEl {
  attrs: Record<string, string> = {};
  classes = new Set<string>();
  children: FakeEl[] = [];
  focused = false;
  removed = false;
  textContent = '';
  tag: string;
  lookup: Record<string, FakeEl | null>;
  constructor(tag: string, lookup: Record<string, FakeEl | null> = {}) { this.tag = tag; this.lookup = lookup; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  removeAttribute(k: string) { delete this.attrs[k]; }
  get classList() { const s = this.classes; return { add: (c: string) => s.add(c), remove: (c: string) => s.delete(c), contains: (c: string) => s.has(c) }; }
  set className(v: string) { this.classes = new Set(v.split(' ')); }
  set id(v: string) { this.attrs.id = v; }
  get id() { return this.attrs.id; }
  get dataset() { const self = this; return new Proxy({}, { set(_, k: string, v) { self.attrs[`data-${k}`] = String(v); return true; } }); }
  closest(sel: string) { return this.lookup[`closest:${sel}`] ?? null; }
  after(el: FakeEl) { this.children.push(el); }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
  querySelector(sel: string) { return this.lookup[sel] ?? null; }
  querySelectorAll(sel: string) {
    if (sel === '[aria-invalid]') return Object.values(this.lookup).filter((e): e is FakeEl => !!e && e.attrs['aria-invalid'] !== undefined);
    return this.children.filter((c) => sel === '[data-field-error]' && c.attrs['data-field-error'] !== undefined);
  }
}

function buildForm() {
  const label = new FakeEl('label');
  const password = new FakeEl('input', { 'closest:label': label });
  const reason = new FakeEl('input', { 'closest:label': new FakeEl('label') });
  const formError = new FakeEl('p');
  formError.classes.add('hidden');
  const form = new FakeEl('form', {
    '[name="currentPassword"]': password,
    '[name="reason"]': reason,
    '.form-error:not([data-field-error])': formError,
  });
  (globalThis as any).document = { createElement: (tag: string) => new FakeEl(tag) };
  return { form: form as any, label, password, reason, formError };
}

test('wrong-password and reason errors are routed to their own field', () => {
  assert.equal(adminErrorField('Password is incorrect.'), 'currentPassword');
  assert.equal(adminErrorField('Current password is required for this administrator action.'), 'currentPassword');
  assert.equal(adminErrorField('Provide a reason between 8 and 1000 characters.'), 'reason');
  assert.equal(adminErrorField('Invalid report status.'), null);
});

test('a field error sits beside its field, marks it invalid and takes focus', () => {
  const { form, label, password, formError } = buildForm();
  showFormError(form, 'Password is incorrect.');
  const message = label.children[0];
  assert.equal(message.textContent, 'Password is incorrect.');
  assert.equal(message.attrs.role, 'alert');
  assert.equal(password.attrs['aria-invalid'], 'true');
  assert.equal(password.attrs['aria-describedby'], message.attrs.id);
  assert.equal(password.focused, true);
  assert.equal(formError.textContent, '');
});

test('a form-level error shows at the form error line and takes focus', () => {
  const { form, formError } = buildForm();
  showFormError(form, 'Invalid report status.');
  assert.equal(formError.textContent, 'Invalid report status.');
  assert.equal(formError.classes.has('hidden'), false);
  assert.equal(formError.attrs.tabindex, '-1');
  assert.equal(formError.focused, true);
});

test('clearing removes field errors and invalid markers', () => {
  const { form, label, password } = buildForm();
  showFormError(form, 'Password is incorrect.');
  const message = label.children[0];
  (form as FakeEl).children.push(message);
  clearFormErrors(form);
  assert.equal(message.removed, true);
  assert.equal(password.attrs['aria-invalid'], undefined);
  assert.equal(password.attrs['aria-describedby'], undefined);
});

test('successful actions have specific status wording', () => {
  assert.equal(adminSuccessMessage('POST', '/api/admin/users/u1/suspend', {}), 'Account suspended.');
  assert.equal(adminSuccessMessage('POST', '/api/admin/users/u1/restore', {}), 'Account restored.');
  assert.equal(adminSuccessMessage('POST', '/api/admin/users/u1/grant-author', {}), 'Author access granted.');
  assert.equal(adminSuccessMessage('POST', '/api/admin/users/u1/revoke-author', {}), 'Author access revoked.');
  assert.equal(adminSuccessMessage('PATCH', '/api/admin/reports/r1', {}), 'Report updated.');
  assert.equal(adminSuccessMessage('POST', '/api/admin/courses/c1/suspension', { suspended: 'true' }), 'Course suspended.');
  assert.equal(adminSuccessMessage('POST', '/api/admin/courses/c1/suspension', { suspended: 'false' }), 'Course restored.');
  assert.equal(adminSuccessMessage('POST', '/api/admin/something-new', {}), 'Change saved.');
});

test('the admin page renders the success notice as a status region above the content', () => {
  const html = renderAdminPage('/admin/reports', { items: [], total: 0, limit: 20, offset: 0 }, undefined, { displayName: 'M', email: 'm@x.test' }, 'Report updated.');
  assert.match(html, /<p class="admin-flash" role="status">[\s\S]*Report updated\.<\/p>/);
  const plain = renderAdminPage('/admin/reports', { items: [], total: 0, limit: 20, offset: 0 });
  assert.doesNotMatch(plain, /admin-flash" role/);
});
