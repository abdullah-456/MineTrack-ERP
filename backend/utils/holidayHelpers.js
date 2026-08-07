'use strict';

const db = require('../models');

// Every holiday date that falls within the given YYYY-MM, for this shop —
// exact-date holidays whose `date` falls in the month, plus recurring-yearly
// holidays whose month/day matches (regardless of which year they were
// originally entered against). Returns a Set of 'YYYY-MM-DD' strings.
async function getHolidayDatesForMonth(shopId, month, transaction) {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  const holidays = await db.Holiday.findAll({ where: { shop_id: shopId }, raw: true, transaction });

  const dates = new Set();
  holidays.forEach((h) => {
    if (h.is_recurring_yearly) {
      const hDate = new Date(`${h.date}T00:00:00.000`);
      if (hDate.getMonth() + 1 === mon && hDate.getDate() <= daysInMonth) {
        dates.add(`${month}-${String(hDate.getDate()).padStart(2, '0')}`);
      }
    } else if (h.date >= from && h.date <= to) {
      dates.add(h.date);
    }
  });
  return dates;
}

module.exports = { getHolidayDatesForMonth };
