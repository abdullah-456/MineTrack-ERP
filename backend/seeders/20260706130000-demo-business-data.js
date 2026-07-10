'use strict';

module.exports = {
  up: async (queryInterface) => {
    const [[shop]] = await queryInterface.sequelize.query(`SELECT id FROM shops LIMIT 1`);
    if (!shop) return;

    const shopId = shop.id;
    const [[branch]] = await queryInterface.sequelize.query(
      `SELECT id FROM branches WHERE shop_id = ${shopId} LIMIT 1`
    );
    const branchId = branch?.id;
    const now = new Date();

    const existing = await queryInterface.sequelize.query(
      `SELECT id FROM suppliers WHERE shop_id = ${shopId} LIMIT 1`
    );
    if (existing[0]?.length) return;

    const [existingCats] = await queryInterface.sequelize.query(`SELECT id, name FROM categories`);
    let catMap = {};
    if (existingCats.length) {
      existingCats.forEach(c => { catMap[c.name] = c.id; });
    } else {
      await queryInterface.bulkInsert('categories', [
        { name: 'Mobile Phones', parent_id: null, parent_category_id: null, created_at: now, updated_at: now },
        { name: 'Laptops', parent_id: null, parent_category_id: null, created_at: now, updated_at: now },
        { name: 'Accessories', parent_id: null, parent_category_id: null, created_at: now, updated_at: now },
      ]);
      const [cats] = await queryInterface.sequelize.query(`SELECT id, name FROM categories`);
      cats.forEach(c => { catMap[c.name] = c.id; });
    }

    // Ensure we have category IDs — use first available if names don't match
    const catIds = Object.values(catMap);
    const phoneCat = catMap['Mobile Phones'] || catIds[0];
    const laptopCat = catMap['Laptops'] || catIds[1] || catIds[0];
    const accCat = catMap['Accessories'] || catIds[2] || catIds[0];

    await queryInterface.bulkInsert('suppliers', [
      {
        shop_id: shopId, supplier_code: 'SUP-0001', company_name: 'Samsung Pakistan', name: 'Samsung Pakistan',
        company: 'Samsung Pakistan',
        contact_person: 'Ali Raza', phone: '042-111222333', email: 'sales@samsung.pk',
        address: 'Gulberg III, Lahore', payment_terms: 'Net 30', credit_limit: 500000,
        status: 'active', created_at: now, updated_at: now,
      },
      {
        shop_id: shopId, supplier_code: 'SUP-0002', company_name: 'Tech Distributors Ltd', name: 'Tech Distributors Ltd',
        company: 'Tech Distributors Ltd',
        contact_person: 'Usman Ahmed', phone: '021-99887766', email: 'orders@techdist.pk',
        address: 'Saddar, Karachi', payment_terms: 'COD', credit_limit: 200000,
        status: 'active', created_at: now, updated_at: now,
      },
    ]);

    const [suppliers] = await queryInterface.sequelize.query(
      `SELECT id FROM suppliers WHERE shop_id = ${shopId}`
    );

    await queryInterface.bulkInsert('products', [
      {
        shop_id: shopId, category_id: phoneCat, sku: 'SKU-00001',
        name: 'Samsung Galaxy A54', brand: 'Samsung', unit: 'Pcs',
        cost_price: 65000, sale_price: 74999, reorder_level: 5, tax_rate: 0,
        status: 'active', created_at: now, updated_at: now,
      },
      {
        shop_id: shopId, category_id: laptopCat, sku: 'SKU-00002',
        name: 'HP Pavilion 15', brand: 'HP', unit: 'Pcs',
        cost_price: 120000, sale_price: 139999, reorder_level: 3, tax_rate: 0,
        status: 'active', created_at: now, updated_at: now,
      },
      {
        shop_id: shopId, category_id: accCat, sku: 'SKU-00003',
        name: 'USB-C Fast Charger 25W', brand: 'Samsung', unit: 'Pcs',
        cost_price: 2500, sale_price: 3499, reorder_level: 10, tax_rate: 0,
        status: 'active', created_at: now, updated_at: now,
      },
    ]);

    const [products] = await queryInterface.sequelize.query(
      `SELECT id, cost_price FROM products WHERE shop_id = ${shopId}`
    );

    if (branchId && products.length) {
      for (const p of products) {
        await queryInterface.bulkInsert('stock', [{
          product_id: p.id, branch_id: branchId,
          quantity_on_hand: p.id === products[0].id ? 15 : p.id === products[1].id ? 8 : 25,
          quantity_reserved: 0, created_at: now, updated_at: now,
        }]);
      }

      await queryInterface.bulkInsert('product_suppliers', [
        {
          product_id: products[0].id, supplier_id: suppliers[0].id,
          purchase_price: products[0].cost_price, preferred_supplier: true,
          status: 'active', currency: 'PKR', created_at: now, updated_at: now,
        },
        {
          product_id: products[1].id, supplier_id: suppliers[1].id,
          purchase_price: products[1].cost_price, preferred_supplier: true,
          status: 'active', currency: 'PKR', created_at: now, updated_at: now,
        },
      ]);
    }

    await queryInterface.bulkInsert('customers', [
      {
        shop_id: shopId, name: 'Hassan Mahmood', phone: '03001234567',
        cnic: '3520212345671', address: 'Model Town, Lahore',
        credit_limit: 50000, current_balance: 0, status: 'active',
        created_at: now, updated_at: now,
      },
      {
        shop_id: shopId, name: 'Fatima Khan', phone: '03211234567',
        address: 'DHA Phase 5, Lahore',
        credit_limit: 25000, current_balance: 5000, status: 'active',
        created_at: now, updated_at: now,
      },
    ]);

    if (branchId) {
      await queryInterface.bulkInsert('employees', [
        {
          shop_id: shopId, branch_id: branchId, name: 'Bilal Hussain',
          designation: 'Sales Manager', phone: '03331234567',
          basic_salary: 45000, hire_date: now, status: 'active',
          created_at: now, updated_at: now,
        },
        {
          shop_id: shopId, branch_id: branchId, name: 'Sana Malik',
          designation: 'Cashier', phone: '03451234567',
          basic_salary: 35000, hire_date: now, status: 'active',
          created_at: now, updated_at: now,
        },
      ]);
    }

    console.log('✅ Demo business data seeded (categories, suppliers, products, stock, customers, employees)');
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('stock', null, {});
    await queryInterface.bulkDelete('product_suppliers', null, {});
    await queryInterface.bulkDelete('sale_items', null, {});
    await queryInterface.bulkDelete('sales', null, {});
    await queryInterface.bulkDelete('products', null, {});
    await queryInterface.bulkDelete('customers', null, {});
    await queryInterface.bulkDelete('employees', null, {});
    await queryInterface.bulkDelete('suppliers', null, {});
    await queryInterface.bulkDelete('categories', null, {});
  },
};
