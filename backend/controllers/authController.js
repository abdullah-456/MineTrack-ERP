const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../models');
const { checkShopAccess } = require('../utils/accessHelpers');

// Helper to generate access token — includes shop context
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.Role.name,
      shop_id: user.shop_id || null,
      branch_id: user.branch_id || null,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

// Helper to generate refresh token
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await db.User.findOne({
      where: { email },
      include: [
        { model: db.Role },
        { model: db.Shop, required: false }
      ]
    });

    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const shopAccess = await checkShopAccess(user);
    if (!shopAccess.allowed) {
      return res.status(403).json({ message: shopAccess.message });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.last_login_at = new Date();
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.Role.name,
        shop_id: user.shop_id,
        shop_name: user.Shop?.name || null,
        branch_id: user.branch_id,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.refresh = async (req, res) => {
  const cookies = req.headers.cookie;
  let refreshToken = null;

  if (cookies) {
    for (let cookie of cookies.split(';')) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'refreshToken') { refreshToken = value; break; }
    }
  }

  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token not found' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await db.User.findByPk(decoded.id, {
      include: [{ model: db.Role }, { model: db.Shop, required: false }]
    });

    if (!user || user.status !== 'active') {
      return res.status(403).json({ message: 'User is disabled or does not exist' });
    }

    const shopAccess = await checkShopAccess(user);
    if (!shopAccess.allowed) {
      return res.status(403).json({ message: shopAccess.message });
    }

    const newAccessToken = generateAccessToken(user);
    return res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

exports.logout = async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  return res.json({ message: 'Logged out successfully' });
};

exports.me = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id, {
      include: [
        {
          model: db.Role,
          include: { model: db.Permission, through: { attributes: [] } }
        },
        { model: db.Shop, required: false }
      ]
    });

    const isSuperAdmin = user.Role.name === 'super_admin';

    const permissions = isSuperAdmin
      ? ['*:*']
      : user.Role.Permissions.map(p => `${p.module}:${p.action}`);

    // Check financial setup state for shop admins
    let setup_completed = true;  // default to true so non-admin roles aren't shown setup modal
    let cash_session_today = true; // default to true so non-admin roles aren't shown check-in

    if (user.shop_id && (user.Role.name === 'admin')) {
      setup_completed = user.Shop?.setup_completed ?? false;

      if (setup_completed) {
        // Check if today's cash session exists
        const today = new Date().toISOString().slice(0, 10);
        const todaySession = await db.CashSession.findOne({
          where: { shop_id: user.shop_id, session_date: today }
        });
        cash_session_today = !!todaySession;
      }
    }

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.Role.name,
        shop_id: user.shop_id,
        shop_name: user.Shop?.name || null,
        branch_id: user.branch_id,
        employee_id: user.employee_id,
      },
      permissions,
      setup_completed,
      cash_session_today,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
