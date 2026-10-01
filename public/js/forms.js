'use strict';
// Formulare: validare cu mesaje în română lângă câmp, erori de la server, stare „se salvează”.

function fieldMessage(el) {
  const v = el.validity;
  if (v.valueMissing) {
    if (el.type === 'checkbox') return 'Bifează pentru a continua.';
    if (el.type === 'radio' || el.tagName === 'SELECT') return 'Alege o opțiune.';
    return 'Completează acest câmp.';
  }
  if (v.typeMismatch && el.type === 'email') return 'Introdu o adresă de email validă, de forma nume@exemplu.ro.';
  if (v.badInput) return el.type === 'number' ? 'Introdu un număr.' : 'Valoarea nu este validă.';
  if (v.tooShort) return `Folosește cel puțin ${el.minLength} caractere (acum: ${el.value.length}).`;
  if (v.tooLong) return `Folosește cel mult ${el.maxLength} caractere.`;
  if (v.rangeUnderflow) return `Valoarea minimă este ${el.min.replace('.', ',')}.`;
  if (v.rangeOverflow) return `Valoarea maximă este ${el.max.replace('.', ',')}.`;
  if (v.stepMismatch) return el.step === '1' || !el.step ? 'Introdu un număr întreg.' : 'Folosește cel mult o zecimală.';
  if (v.patternMismatch) return el.dataset.patternMessage || 'Formatul nu este valid.';
  if (v.customError) return el.validationMessage;
  return el.validationMessage || 'Valoarea nu este validă.';
}

function fieldWrapper(el) {
  return el.closest('.field, .check-label, .choice-grid, fieldset') || el.parentElement;
}

function clearFieldError(el) {
  const wrap = fieldWrapper(el);
  wrap?.querySelector(':scope > .field-error')?.remove();
  wrap?.classList.remove('has-error');
  const group = el.type === 'radio' ? el.form?.querySelectorAll(`[name="${el.name}"]`) : [el];
  group?.forEach(x => { x.removeAttribute('aria-invalid'); x.removeAttribute('aria-describedby'); });
}

function showFieldError(form, name, message) {
  const el = form.elements[name] instanceof RadioNodeList ? form.elements[name][0] : form.elements[name];
  if (!el) return null;
  clearFieldError(el);
  const id = `err-${form.id || 'form'}-${name}`;
  const msg = document.createElement('small');
  msg.className = 'field-error';
  msg.id = id;
  msg.textContent = message;
  const wrap = fieldWrapper(el);
  wrap.classList.add('has-error');
  wrap.appendChild(msg);
  const group = el.type === 'radio' ? form.querySelectorAll(`[name="${name}"]`) : [el];
  group.forEach(x => { x.setAttribute('aria-invalid', 'true'); x.setAttribute('aria-describedby', id); });
  return el;
}

function setFormAlert(form, message, kind = 'error') {
  let box = form.querySelector(':scope > .form-alert');
  if (!message) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    form.prepend(box);
  }
  box.className = `form-alert ${kind}`;
  box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  box.textContent = message;
}

function clearFormErrors(form) {
  form.querySelectorAll('.field-error').forEach(n => n.remove());
  form.querySelectorAll('.has-error').forEach(n => n.classList.remove('has-error'));
  form.querySelectorAll('[aria-invalid]').forEach(n => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
  setFormAlert(form, '');
}

/** Validează formularul; afișează mesaje și pune focusul pe primul câmp greșit. */
function validateForm(form) {
  clearFormErrors(form);
  let first = null;
  const seen = new Set();
  for (const el of form.elements) {
    if (!el.willValidate || !el.name || seen.has(el.name)) continue;
    if (!el.checkValidity()) {
      seen.add(el.name);
      showFieldError(form, el.name, fieldMessage(el));
      first ||= el;
    }
  }
  if (first) first.focus();
  return !first;
}

/** Afișează o eroare de la server: pe câmpuri (dacă există) și în caseta formularului. */
function showServerError(form, err) {
  let first = null;
  for (const [name, message] of Object.entries(err.fields || {})) {
    const el = showFieldError(form, name, message);
    first ||= el;
  }
  setFormAlert(form, err.message);
  (first || form.querySelector('.form-alert'))?.focus?.();
}

/** Pune butonul în starea „se încarcă” cât timp rulează `fn`. */
async function withBusy(button, fn, busyLabel = 'Se salvează…') {
  if (!button || button.getAttribute('aria-busy') === 'true') return fn();
  const original = button.innerHTML;
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${esc(busyLabel)}`;
  try {
    return await fn();
  } finally {
    if (button.isConnected) {
      button.removeAttribute('aria-busy');
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}

/** Dezactivează validarea nativă (folosim mesajele noastre) pentru formularele randate. */
function prepareForms(root) {
  root.querySelectorAll('form').forEach(f => { f.noValidate = true; });
}

document.addEventListener('input', e => {
  if (e.target.matches?.('[aria-invalid="true"]')) clearFieldError(e.target);
});
document.addEventListener('change', e => {
  if (e.target.matches?.('[aria-invalid="true"]')) clearFieldError(e.target);
});
