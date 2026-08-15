'use strict';

/**
 * Heavy Machinery module — machine registry + daily fuel/hours/production
 * logs. Controller functions manage their own transactions (like
 * vehicleController/workshopController), so these tests build one isolated
 * throwaway shop per describe block and clean it up in a finally, mirroring
 * workshop.test.js and employeeLedger.test.js.
 */

const db = require('../models');
const { generateMachineCode } = require('../utils/heavyMachineryHelpers');
const {
  createMachinery,
  upsertMachineryLog,
  getMachineryMonthlySummary,
} = require('../controllers/heavyMachineryController');

let dbAvailable = false;
beforeAll(async () => {
  try {
    await db.sequelize.authenticate();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});
afterAll(async () => {
  if (dbAvailable) await db.sequelize.close();
});

const maybe = (name, fn) => test(name, async () => {
  if (!dbAvailable) {
    console.warn(`  skipped (no database): ${name}`);
    return;
  }
  await fn();
});

async function cleanupShop(shopId) {
  const machines = await db.HeavyMachinery.findAll({ where: { shop_id: shopId }, attributes: ['id'] });
  const machineIds = machines.map(m => m.id);
  if (machineIds.length) {
    await db.HeavyMachineryLog.destroy({ where: { heavy_machinery_id: machineIds } });
    await db.HeavyMachinery.destroy({ where: { id: machineIds } });
  }
  await db.Mineral.destroy({ where: { shop_id: shopId } });
  await db.Branch.destroy({ where: { shop_id: shopId } });
  await db.User.destroy({ where: { shop_id: shopId } });
  await db.Shop.destroy({ where: { id: shopId } });
}

async function makeShopWithMine() {
  const shop = await db.Shop.create({
    name: `__machinery_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  });
  const branch = await db.Branch.create({ shop_id: shop.id, name: '__machinery_test_mine', status: 'active' });
  return { shop, branch };
}

function fakeReqRes(params, body, shopId) {
  const res = { statusCode: 200, body: null };
  res.status = function status(code) { this.statusCode = code; return this; };
  res.json = function json(b) { this.body = b; return this; };
  const req = { params, user: { id: 1, shop_id: shopId }, body: { ...body, shop_id: shopId } };
  return { req, res };
}

describe('heavy machinery — code numbering', () => {
  maybe('generateMachineCode continues the sequence per shop, never resets', async () => {
    const { shop } = await makeShopWithMine();
    try {
      const t1 = await db.sequelize.transaction();
      const first = await generateMachineCode(shop.id, t1);
      await db.HeavyMachinery.create({ shop_id: shop.id, machine_code: first, name: '__test_machine_1', status: 'active' }, { transaction: t1 });
      await t1.commit();
      expect(first).toBe(`MCH-${shop.id}-0001`);

      const t2 = await db.sequelize.transaction();
      const second = await generateMachineCode(shop.id, t2);
      await t2.commit();
      expect(second).toBe(`MCH-${shop.id}-0002`);
    } finally {
      await cleanupShop(shop.id);
    }
  });
});

describe('heavy machinery — daily log upsert', () => {
  async function makeMachineFixture() {
    const { shop, branch } = await makeShopWithMine();
    const { req, res } = fakeReqRes({}, { name: '__test_excavator', machine_type: 'Excavator', assigned_branch_id: branch.id }, shop.id);
    await createMachinery(req, res);
    expect(res.statusCode).toBe(201);
    const mineral = await db.Mineral.create({ shop_id: shop.id, name: '__test_coal', unit: 'ton' });
    return { shop, branch, machine: res.body.machine, mineral };
  }

  maybe('saving the same machine+date twice updates in place, not a duplicate row', async () => {
    const { shop, branch, machine } = await makeMachineFixture();
    try {
      const { req: req1, res: res1 } = fakeReqRes(
        { id: String(machine.id) },
        { log_date: '2026-01-05', branch_id: branch.id, working_hours: 8, fuel_consumed: 40, fuel_cost: 8000 },
        shop.id,
      );
      await upsertMachineryLog(req1, res1);
      expect(res1.statusCode).toBe(201);
      const logId = res1.body.log.id;

      const { req: req2, res: res2 } = fakeReqRes(
        { id: String(machine.id) },
        { log_date: '2026-01-05', branch_id: branch.id, working_hours: 6, fuel_consumed: 30, fuel_cost: 6000 },
        shop.id,
      );
      await upsertMachineryLog(req2, res2);
      expect(res2.statusCode).toBe(201);
      expect(res2.body.log.id).toBe(logId);
      expect(parseFloat(res2.body.log.working_hours)).toBe(6);

      const count = await db.HeavyMachineryLog.count({ where: { heavy_machinery_id: machine.id, log_date: '2026-01-05' } });
      expect(count).toBe(1);
    } finally {
      await cleanupShop(shop.id);
    }
  });

  maybe('production_unit auto-fills from the chosen mineral', async () => {
    const { shop, branch, machine, mineral } = await makeMachineFixture();
    try {
      const { req, res } = fakeReqRes(
        { id: String(machine.id) },
        { log_date: '2026-01-06', branch_id: branch.id, mineral_id: mineral.id, production_quantity: 50 },
        shop.id,
      );
      await upsertMachineryLog(req, res);
      expect(res.statusCode).toBe(201);
      expect(res.body.log.production_unit).toBe('ton');
    } finally {
      await cleanupShop(shop.id);
    }
  });

  maybe('monthly summary correctly sums logs and separates months', async () => {
    const { shop, branch, machine } = await makeMachineFixture();
    try {
      const days = [
        { log_date: '2026-01-05', working_hours: 8, fuel_consumed: 40, fuel_cost: 8000 },
        { log_date: '2026-01-10', working_hours: 6, fuel_consumed: 30, fuel_cost: 6000 },
        { log_date: '2026-02-02', working_hours: 5, fuel_consumed: 25, fuel_cost: 5000 },
      ];
      for (const day of days) {
        const { req, res } = fakeReqRes({ id: String(machine.id) }, { ...day, branch_id: branch.id }, shop.id);
        await upsertMachineryLog(req, res);
        expect(res.statusCode).toBe(201);
      }

      const { req: sumReq, res: sumRes } = fakeReqRes({ id: String(machine.id) }, { year: '2026' }, shop.id);
      sumReq.query = { year: '2026' };
      await getMachineryMonthlySummary(sumReq, sumRes);
      expect(sumRes.statusCode).toBe(200);

      const jan = sumRes.body.summary.find(r => r.month === '2026-01');
      const feb = sumRes.body.summary.find(r => r.month === '2026-02');
      expect(parseFloat(jan.working_hours)).toBe(14);
      expect(parseFloat(jan.fuel_consumed)).toBe(70);
      expect(parseFloat(jan.fuel_cost)).toBe(14000);
      expect(parseFloat(feb.working_hours)).toBe(5);
    } finally {
      await cleanupShop(shop.id);
    }
  });
});
