'use strict';

/**
 * Workshops module — parts inventory + job costing. Each helper takes an
 * externally managed transaction (unlike employeeLedgerController's
 * recordAdvance/recordLoan), so these tests build one isolated throwaway
 * shop and commit as they go, mirroring the fixture pattern already used in
 * employeeLedger.test.js and backdating.test.js.
 */

const db = require('../models');
const {
  generateWorkshopJobNumber,
  receiveWorkshopStock,
  consumeWorkshopStock,
  reverseWorkshopStock,
} = require('../utils/workshopHelpers');
const {
  addWorkshopJobItem,
  removeWorkshopJobItem,
  cancelWorkshopJob,
} = require('../controllers/workshopController');

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
  const jobs = await db.WorkshopJob.findAll({ where: { shop_id: shopId }, attributes: ['id'] });
  const jobIds = jobs.map(j => j.id);
  if (jobIds.length) {
    await db.WorkshopJobItem.destroy({ where: { workshop_job_id: jobIds } });
    await db.WorkshopJob.destroy({ where: { id: jobIds } });
  }
  const items = await db.WorkshopItem.findAll({ where: { shop_id: shopId }, attributes: ['id'] });
  const itemIds = items.map(i => i.id);
  if (itemIds.length) {
    await db.WorkshopStockMovement.destroy({ where: { workshop_item_id: itemIds } });
    await db.WorkshopStock.destroy({ where: { workshop_item_id: itemIds } });
    await db.WorkshopItem.destroy({ where: { id: itemIds } });
  }
  await db.Vehicle.destroy({ where: { shop_id: shopId } });
  await db.Employee.destroy({ where: { shop_id: shopId } });
  await db.Branch.destroy({ where: { shop_id: shopId } });
  await db.User.destroy({ where: { shop_id: shopId } });
  await db.Shop.destroy({ where: { id: shopId } });
}

async function makeShopWithMine() {
  const shop = await db.Shop.create({
    name: `__workshop_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  });
  const branch = await db.Branch.create({ shop_id: shop.id, name: '__workshop_test_mine', status: 'active' });
  return { shop, branch };
}

function fakeReqRes(params, body) {
  const res = { statusCode: 200, body: null };
  res.status = function status(code) { this.statusCode = code; return this; };
  res.json = function json(b) { this.body = b; return this; };
  const req = { params, user: { id: 1, shop_id: params.__shopId }, body: { ...body, shop_id: params.__shopId } };
  return { req, res };
}

describe('workshop stock — weighted average cost', () => {
  maybe('repeated stock-in settles on the correct weighted-average cost', async () => {
    const { shop, branch } = await makeShopWithMine();
    try {
      const item = await db.WorkshopItem.create({
        shop_id: shop.id, item_code: 'WSI-TEST-0001', name: '__test_filter', unit: 'pcs', unit_price: 100, status: 'active',
      });

      const t1 = await db.sequelize.transaction();
      await receiveWorkshopStock({ shopId: shop.id, workshopItemId: item.id, branchId: branch.id, quantity: 10, unitCost: 100, transaction: t1 });
      await t1.commit();

      const t2 = await db.sequelize.transaction();
      await receiveWorkshopStock({ shopId: shop.id, workshopItemId: item.id, branchId: branch.id, quantity: 10, unitCost: 200, transaction: t2 });
      await t2.commit();

      const stock = await db.WorkshopStock.findOne({ where: { workshop_item_id: item.id, branch_id: branch.id } });
      // (10*100 + 10*200) / 20 = 150
      expect(parseFloat(stock.avg_cost)).toBe(150);
      expect(parseFloat(stock.quantity_on_hand)).toBe(20);
    } finally {
      await cleanupShop(shop.id);
    }
  });

  maybe('consumeWorkshopStock refuses to go negative', async () => {
    const { shop, branch } = await makeShopWithMine();
    try {
      const item = await db.WorkshopItem.create({
        shop_id: shop.id, item_code: 'WSI-TEST-0002', name: '__test_filter', unit: 'pcs', unit_price: 50, status: 'active',
      });

      const t1 = await db.sequelize.transaction();
      await receiveWorkshopStock({ shopId: shop.id, workshopItemId: item.id, branchId: branch.id, quantity: 5, unitCost: 50, transaction: t1 });
      await t1.commit();

      const t2 = await db.sequelize.transaction();
      await expect(
        consumeWorkshopStock({ workshopItemId: item.id, branchId: branch.id, quantity: 6, refId: null, transaction: t2 })
      ).rejects.toThrow(/insufficient/i);
      await t2.rollback();

      const stock = await db.WorkshopStock.findOne({ where: { workshop_item_id: item.id, branch_id: branch.id } });
      expect(parseFloat(stock.quantity_on_hand)).toBe(5);
    } finally {
      await cleanupShop(shop.id);
    }
  });
});

describe('workshop job items — stock reversal', () => {
  async function makeJobFixture() {
    const { shop, branch } = await makeShopWithMine();
    const vehicle = await db.Vehicle.create({ shop_id: shop.id, vehicle_number: `__test_${Date.now()}`, status: 'active' });
    const item = await db.WorkshopItem.create({
      shop_id: shop.id, item_code: `WSI-TEST-${Date.now()}`, name: '__test_filter', unit: 'pcs', unit_price: 80, status: 'active',
    });
    const t = await db.sequelize.transaction();
    await receiveWorkshopStock({ shopId: shop.id, workshopItemId: item.id, branchId: branch.id, quantity: 20, unitCost: 80, transaction: t });
    const jobNumber = await generateWorkshopJobNumber(shop.id, t);
    const job = await db.WorkshopJob.create({
      shop_id: shop.id, job_number: jobNumber, branch_id: branch.id, vehicle_id: vehicle.id,
      date_in: '2026-01-01', status: 'in_progress', labor_cost: 0, parts_cost: 0, total_cost: 0,
    }, { transaction: t });
    await t.commit();
    return { shop, branch, vehicle, item, job };
  }

  maybe('adding then removing a job part fully reverses stock and job totals', async () => {
    const { shop, branch, item, job } = await makeJobFixture();
    try {
      const { req: addReq, res: addRes } = fakeReqRes(
        { id: String(job.id), __shopId: shop.id },
        { workshop_item_id: item.id, quantity: 5 },
      );
      await addWorkshopJobItem(addReq, addRes);
      expect(addRes.statusCode).toBe(201);
      expect(parseFloat(addRes.body.job.parts_cost)).toBe(400); // 5 * 80
      expect(parseFloat(addRes.body.job.total_cost)).toBe(400);

      let stock = await db.WorkshopStock.findOne({ where: { workshop_item_id: item.id, branch_id: branch.id } });
      expect(parseFloat(stock.quantity_on_hand)).toBe(15);

      const jobItemId = addRes.body.jobItem.id;
      const { req: rmReq, res: rmRes } = fakeReqRes(
        { id: String(job.id), itemId: String(jobItemId), __shopId: shop.id },
        {},
      );
      await removeWorkshopJobItem(rmReq, rmRes);
      expect(rmRes.statusCode).toBe(200);
      expect(parseFloat(rmRes.body.job.parts_cost)).toBe(0);

      stock = await db.WorkshopStock.findOne({ where: { workshop_item_id: item.id, branch_id: branch.id } });
      expect(parseFloat(stock.quantity_on_hand)).toBe(20);
    } finally {
      await cleanupShop(shop.id);
    }
  });

  maybe('cancelling a job reverses all of its consumed stock', async () => {
    const { shop, branch, item, job } = await makeJobFixture();
    try {
      const { req: addReq, res: addRes } = fakeReqRes(
        { id: String(job.id), __shopId: shop.id },
        { workshop_item_id: item.id, quantity: 8 },
      );
      await addWorkshopJobItem(addReq, addRes);
      expect(addRes.statusCode).toBe(201);

      let stock = await db.WorkshopStock.findOne({ where: { workshop_item_id: item.id, branch_id: branch.id } });
      expect(parseFloat(stock.quantity_on_hand)).toBe(12);

      const { req: cancelReq, res: cancelRes } = fakeReqRes({ id: String(job.id), __shopId: shop.id }, {});
      await cancelWorkshopJob(cancelReq, cancelRes);
      expect(cancelRes.statusCode).toBe(200);
      expect(cancelRes.body.job.status).toBe('cancelled');

      stock = await db.WorkshopStock.findOne({ where: { workshop_item_id: item.id, branch_id: branch.id } });
      expect(parseFloat(stock.quantity_on_hand)).toBe(20);
    } finally {
      await cleanupShop(shop.id);
    }
  });
});

describe('reverseWorkshopStock', () => {
  maybe('adds quantity back without touching avg_cost', async () => {
    const { shop, branch } = await makeShopWithMine();
    try {
      const item = await db.WorkshopItem.create({
        shop_id: shop.id, item_code: 'WSI-TEST-0003', name: '__test_filter', unit: 'pcs', unit_price: 60, status: 'active',
      });
      const t1 = await db.sequelize.transaction();
      await receiveWorkshopStock({ shopId: shop.id, workshopItemId: item.id, branchId: branch.id, quantity: 10, unitCost: 60, transaction: t1 });
      await t1.commit();

      const t2 = await db.sequelize.transaction();
      await consumeWorkshopStock({ workshopItemId: item.id, branchId: branch.id, quantity: 4, refId: 999, transaction: t2 });
      await t2.commit();

      const t3 = await db.sequelize.transaction();
      await reverseWorkshopStock({ workshopItemId: item.id, branchId: branch.id, quantity: 4, unitCost: 60, refId: 999, transaction: t3 });
      await t3.commit();

      const stock = await db.WorkshopStock.findOne({ where: { workshop_item_id: item.id, branch_id: branch.id } });
      expect(parseFloat(stock.quantity_on_hand)).toBe(10);
      expect(parseFloat(stock.avg_cost)).toBe(60);
    } finally {
      await cleanupShop(shop.id);
    }
  });
});
