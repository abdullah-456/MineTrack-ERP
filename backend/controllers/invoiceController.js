const db = require('../models');
const { Op } = require('sequelize');
const { requireShopId } = require('../utils/shopScope');

// ── Unified Invoice List ─────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const limit = parseInt(req.query.limit, 10) || 100;
    const search = req.query.search || '';
    const type = req.query.type || 'all'; // 'all', 'sale', 'purchase', 'installment', 'return'

    const unifiedList = [];

    // 1. Fetch Sales (Sales Invoices)
    if (type === 'all' || type === 'sale') {
      const saleWhere = { shop_id: shopId };
      if (search) {
        saleWhere.invoice_number = { [Op.like]: `%${search}%` };
      }
      const sales = await db.Sale.findAll({
        where: saleWhere,
        include: [{ model: db.Customer, attributes: ['id', 'name'] }],
        order: [['sale_date', 'DESC']],
        limit,
      });
      sales.forEach(s => {
        unifiedList.push({
          id: `sale-${s.id}`,
          raw_id: s.id,
          invoice_number: s.invoice_number,
          type: 'sale',
          sale_type: s.sale_type,
          date: s.sale_date,
          entity_name: s.Customer?.name || 'Walk-in Customer',
          amount: parseFloat(s.total),
          status: s.status,
        });
      });
    }

    // 2. Fetch Purchase Invoices
    if (type === 'all' || type === 'purchase') {
      const purchaseWhere = {};
      if (search) {
        purchaseWhere.invoice_number = { [Op.like]: `%${search}%` };
      }
      const purchases = await db.PurchaseInvoice.findAll({
        where: purchaseWhere,
        include: [{ model: db.Supplier, where: { shop_id: shopId }, attributes: ['id', 'company_name'] }],
        order: [['invoice_date', 'DESC']],
        limit,
      });
      purchases.forEach(p => {
        unifiedList.push({
          id: `purchase-${p.id}`,
          raw_id: p.id,
          invoice_number: p.invoice_number,
          type: 'purchase',
          sale_type: 'Procurement',
          date: p.invoice_date,
          entity_name: p.Supplier?.company_name || 'Direct Procurement',
          amount: parseFloat(p.amount),
          status: p.status,
        });
      });
    }


    // 4. Fetch Sale Returns (Return Invoices)
    if (type === 'all' || type === 'return') {
      const returnWhere = { shop_id: shopId };
      if (search) {
        returnWhere.return_number = { [Op.like]: `%${search}%` };
      }
      const returns = await db.SaleReturn.findAll({
        where: returnWhere,
        include: [{ model: db.Customer, attributes: ['id', 'name'] }],
        order: [['return_date', 'DESC']],
        limit,
      });
      returns.forEach(r => {
        unifiedList.push({
          id: `return-${r.id}`,
          raw_id: r.id,
          invoice_number: r.return_number,
          type: 'return',
          sale_type: r.return_type === 'refund' ? 'Refund' : 'Exchange',
          date: r.return_date,
          entity_name: r.Customer?.name || 'Walk-in Customer',
          amount: parseFloat(r.returned_value),
          status: r.status,
        });
      });
    }

    // Sort all combined invoices by date descending (latest first)
    unifiedList.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.json({ invoices: unifiedList.slice(0, limit) });
  } catch (error) {
    console.error('listInvoices error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Unified Invoice Detail ───────────────────────────────────
exports.get = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const [type, rawId] = req.params.id.split('-');
    if (!type || !rawId) return res.status(400).json({ message: 'Invalid invoice ID format' });

    if (type === 'sale') {
      const sale = await db.Sale.findOne({
        where: { id: rawId, shop_id: shopId },
        include: [
          { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
          { model: db.Customer, attributes: ['id', 'name', 'phone', 'cnic', 'address'] },
          { model: db.Branch, attributes: ['id', 'name'] },
          { model: db.User, as: 'Cashier', attributes: ['id', 'name'] },
          { model: db.Employee, attributes: ['id', 'name', 'designation'] },
          { model: db.SaleItem, as: 'SaleItems', include: [{ model: db.Product, attributes: ['id', 'name', 'sku'] }] },
          { model: db.Payment, as: 'Payments' },
        ],
      });
      if (!sale) return res.status(404).json({ message: 'Invoice not found' });
      return res.json({ type: 'sale', details: sale });
    }

    if (type === 'purchase') {
      const purchase = await db.PurchaseInvoice.findOne({
        where: { id: rawId },
        include: [
          { model: db.Supplier, where: { shop_id: shopId }, include: [{ model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] }] },
        ],
      });
      if (!purchase) return res.status(404).json({ message: 'Invoice not found' });
      // Attach shop from supplier
      const detail = purchase.toJSON();
      detail.Shop = detail.Supplier?.Shop || null;
      return res.json({ type: 'purchase', details: detail });
    }


    if (type === 'return') {
      const saleReturn = await db.SaleReturn.findOne({
        where: { id: rawId, shop_id: shopId },
        include: [
          { model: db.Shop, attributes: ['id', 'name', 'owner_name', 'email', 'phone', 'address', 'logo_url'] },
          { model: db.Customer, attributes: ['id', 'name', 'phone', 'cnic', 'address'] },
          { model: db.Branch, attributes: ['id', 'name'] },
          { model: db.User, as: 'ProcessedBy', attributes: ['id', 'name'] },
          { model: db.Sale, attributes: ['id', 'invoice_number'] },
          { model: db.SaleReturnItem, as: 'ReturnItems', include: [{ model: db.Product, attributes: ['id', 'name', 'sku'] }] },
        ],
      });
      if (!saleReturn) return res.status(404).json({ message: 'Invoice not found' });
      return res.json({ type: 'return', details: saleReturn });
    }

    return res.status(400).json({ message: 'Unknown invoice type' });
  } catch (error) {
    console.error('getInvoiceDetail error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
