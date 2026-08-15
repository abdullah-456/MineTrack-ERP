'use strict';

const db = require('../models');

// Every holiday that falls within the given YYYY-MM, for this shop — exact-date
// holidays whose `date` falls in the month, plus recurring-yearly holidays
// whose month/day matches (regardless of which year they were originally
// entered against). Returns a Map of 'YYYY-MM-DD' -> holiday name.
//
// The name travels with the date (not just a Set of dates) so the attendance
// grid can show WHICH holiday a day is — "Eid-ul-Fitr" in a tooltip reads very
// differently from an unexplained "day off" — without a second round trip.
async function getHolidayMapForMonth(shopId, month, transaction) {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const holidays = await db.Holiday.findAll({ where: { shop_id: shopId }, raw: true, transaction });

  const map = new Map();
  holidays.forEach((h) => {
    if (h.is_recurring_yearly) {
      const hDate = new Date(`${h.date}T00:00:00.000`);
      if (hDate.getMonth() + 1 === mon && hDate.getDate() <= daysInMonth) {
        map.set(`${month}-${String(hDate.getDate()).padStart(2, '0')}`, h.name);
      }
    } else if (h.date >= from && h.date <= to) {
      map.set(h.date, h.name);
    }
  });
  return map;
}

// Same dates as getHolidayMapForMonth, without the names — every existing
// caller only ever needed membership, not the label.
async function getHolidayDatesForMonth(shopId, month, transaction) {
  return new Set((await getHolidayMapForMonth(shopId, month, transaction)).keys());
}

module.exports = { getHolidayMapForMonth, getHolidayDatesForMonth };
