'use strict';
// Utilitare comune: escaping HTML, formatare numerică, lucrul cu datele calendaristice.

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const format = (n, digits = 0) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: digits }).format(n);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Text cu litere mici și fără diacritice, pentru comparații tolerante („Măsline” = „masline”). */
const normalize = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
const WEEKDAYS_LONG = ['luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă', 'duminică'];

/** Cheie locală AAAA-LL-ZZ (fără conversie UTC, ca ziua să nu „sară” seara târziu). */
function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Ziua săptămânii în ordine românească: 0 = luni … 6 = duminică. */
const weekdayIndex = (d = new Date()) => (d.getDay() + 6) % 7;

/** Cele 7 date (luni–duminică) ale săptămânii care conține data primită. */
function weekDates(d = new Date()) {
  const monday = addDays(d, -weekdayIndex(d));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = (d = new Date()) => capitalize(new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d));
const shortDate = d => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' }).format(d);
const shortMonth = d => new Intl.DateTimeFormat('ro-RO', { month: 'short' }).format(d);
const clockTime = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const timer = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
