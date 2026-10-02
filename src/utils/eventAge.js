/** Calendar age on the event date in Costa Rica; birth dates have no timezone. */
function ageAtEvent(birth, event) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const eventDate = new Date(typeof event === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event) ? event + 'T12:00:00-06:00' : event);
  if (Number.isNaN(eventDate.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Costa_Rica', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(eventDate);
  const value = (type) => Number(parts.find(part => part.type === type)?.value);
  return value('year') - year - (value('month') < month || (value('month') === month && value('day') < day) ? 1 : 0);
}

module.exports = { ageAtEvent };
