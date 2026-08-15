const db = require('../models');

// Continuous per-shop sequence — no date segment, never resets. Same pattern
// as the workshop item/job numbers in workshopHelpers.js.
async function generateMachineCode(shopId, transaction) {
  const prefix = `MCH-${shopId}-`;
  const last = await db.HeavyMachinery.findOne({
    where: { shop_id: shopId, machine_code: { [db.Sequelize.Op.like]: `${prefix}%` } },
    order: [['id', 'DESC']],
    transaction,
  });
  let seq = 1;
  if (last?.machine_code) {
    const parts = last.machine_code.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

module.exports = {
  generateMachineCode,
};
