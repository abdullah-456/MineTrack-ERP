const bcrypt = require('bcryptjs');
const db = require('../models');

// ── GET /api/shops — List all shops (SuperAdmin only)
exports.listShops = async (req, res) => {
  try {
    const shops = await db.Shop.findAll({
      include: [
        { model: db.Branch, attributes: ['id', 'name', 'status'] },
        {
          model: db.User,
          attributes: ['id', 'name', 'email', 'status'],
          include: [{ model: db.Role, attributes: ['name'] }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // Attach counts to each shop
    const result = shops.map(shop => ({
      id:          shop.id,
      name:        shop.name,
      owner_name:  shop.owner_name,
      email:       shop.email,
      phone:       shop.phone,
      address:     shop.address,
      status:      shop.status,
      plan:        shop.plan,
      logo_url:    shop.logo_url,
      created_at:  shop.created_at,
      branches:    shop.Branches?.length  || 0,
      users:       shop.Users?.length     || 0,
      admins:      shop.Users?.filter(u => u.Role?.name === 'admin').length || 0,
    }));

    return res.json({ shops: result });
  } catch (error) {
    console.error('listShops error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/shops/stats — Platform stats for SuperAdmin dashboard
exports.getPlatformStats = async (req, res) => {
  try {
    const totalShops   = await db.Shop.count();
    const activeShops  = await db.Shop.count({ where: { status: 'active' } });
    const totalUsers   = await db.User.count({ where: { shop_id: { [db.Sequelize.Op.ne]: null } } });
    const totalBranches= await db.Branch.count();

    // Recent shops
    const recentShops = await db.Shop.findAll({
      limit: 5,
      order: [['created_at', 'DESC']],
      attributes: ['id', 'name', 'status', 'plan', 'created_at']
    });

    return res.json({
      stats: { totalShops, activeShops, totalUsers, totalBranches },
      recentShops
    });
  } catch (error) {
    console.error('getPlatformStats error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/shops/:id — Get single shop detail
exports.getShop = async (req, res) => {
  try {
    const shop = await db.Shop.findByPk(req.params.id, {
      include: [
        { model: db.Branch },
        {
          model: db.User,
          include: [{ model: db.Role, attributes: ['id', 'name'] }]
        }
      ]
    });

    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    return res.json({ shop });
  } catch (error) {
    console.error('getShop error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/shops — Create new shop + first admin (SuperAdmin only)
exports.createShop = async (req, res) => {
  const {
    name, owner_name, email, phone, address, plan = 'basic',
    // First admin credentials
    admin_name, admin_email, admin_password
  } = req.body;

  // Validate BEFORE opening a transaction so early returns can't leak a handle.
  if (!name || !admin_name || !admin_email || !admin_password) {
    return res.status(400).json({ message: 'Shop name, admin name, email and password are required' });
  }

  const existingUser = await db.User.findOne({ where: { email: admin_email } });
  if (existingUser) {
    return res.status(409).json({ message: 'Admin email already in use' });
  }

  const t = await db.sequelize.transaction();
  try {
    // Create the shop
    const shop = await db.Shop.create({
      name, owner_name, email, phone, address, plan, status: 'active'
    }, { transaction: t });

    // Create a default branch for the shop
    const branch = await db.Branch.create({
      shop_id:    shop.id,
      name:       'Main Branch',
      address:    address || '',
      is_default: true,
      status:     'active'
    }, { transaction: t });

    // Find the admin role
    const adminRole = await db.Role.findOne({ where: { name: 'admin' } });

    // Create the first admin user for this shop
    const hashedPw = await bcrypt.hash(admin_password, 12);
    const adminUser = await db.User.create({
      name:          admin_name,
      email:         admin_email,
      password_hash: hashedPw,
      role_id:       adminRole.id,
      shop_id:       shop.id,
      branch_id:     null, // Admin manages all branches
      status:        'active'
    }, { transaction: t });

    await t.commit();

    return res.status(201).json({
      message: 'Shop created successfully',
      shop: {
        id:   shop.id,
        name: shop.name,
        plan: shop.plan,
        status: shop.status,
        default_branch_id: branch.id,
        admin: { id: adminUser.id, name: adminUser.name, email: adminUser.email }
      }
    });
  } catch (error) {
    await t.rollback();
    console.error('createShop error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/shops/:id — Update shop
exports.updateShop = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shop = await db.Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const { name, owner_name, email, phone, address, status, plan, logo_url } = req.body;
    const previousStatus = shop.status;

    await shop.update({ name, owner_name, email, phone, address, status, plan, logo_url }, { transaction: t });

    if (status === 'suspended' && previousStatus !== 'suspended') {
      // Mark the users we are disabling BECAUSE of the suspension so we can
      // restore exactly them (and not individually-suspended users) later.
      await db.User.update(
        { status: 'disabled', disabled_by_suspension: true },
        { where: { shop_id: shop.id, status: 'active' }, transaction: t }
      );
    }

    if (status === 'active' && previousStatus === 'suspended') {
      await db.User.update(
        { status: 'active', disabled_by_suspension: false },
        { where: { shop_id: shop.id, disabled_by_suspension: true }, transaction: t }
      );
    }

    await t.commit();
    return res.json({ message: 'Shop updated successfully', shop });
  } catch (error) {
    await t.rollback();
    console.error('updateShop error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/shops/:id — Suspend shop and all its users
exports.deleteShop = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const shop = await db.Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    await shop.update({ status: 'suspended' }, { transaction: t });
    await db.User.update(
      { status: 'disabled', disabled_by_suspension: true },
      { where: { shop_id: shop.id, status: 'active' }, transaction: t }
    );

    await t.commit();
    return res.json({ message: 'Shop suspended successfully' });
  } catch (error) {
    await t.rollback();
    console.error('deleteShop error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// ── POST /api/shops/:id/activate — Reactivate a suspended shop
exports.activateShop = async (req, res) => {
  try {
    const shop = await db.Shop.findByPk(req.params.id);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    if (shop.status === 'active') {
      return res.status(400).json({ message: 'Shop is already active' });
    }

    const t = await db.sequelize.transaction();
    try {
      await shop.update({ status: 'active' }, { transaction: t });
      // Restore only the users the suspension disabled.
      await db.User.update(
        { status: 'active', disabled_by_suspension: false },
        { where: { shop_id: shop.id, disabled_by_suspension: true }, transaction: t }
      );
      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
    return res.json({ message: 'Shop activated successfully', shop });
  } catch (error) {
    console.error('activateShop error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
