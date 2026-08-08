'use strict';

const db = require('../models');
const { requireShopId } = require('../utils/shopScope');
const { syncExpiryNotifications } = require('../utils/notificationHelpers');

const ATTRIBUTES = [
  'id', 'type', 'source_table', 'source_id', 'module_label', 'owner_label',
  'title', 'message', 'due_date', 'is_read', 'read_at', 'created_at',
];

exports.list = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    await syncExpiryNotifications(shopId);

    const where = { shop_id: shopId };
    if (req.query.unread_only === 'true') where.is_read = false;

    const notifications = await db.Notification.findAll({
      where,
      attributes: ATTRIBUTES,
      order: [['due_date', 'ASC']],
      limit: 100,
    });
    const unread_count = await db.Notification.count({ where: { shop_id: shopId, is_read: false } });

    return res.json({ notifications, unread_count });
  } catch (error) {
    console.error('listNotifications error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.count = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    await syncExpiryNotifications(shopId);
    const unread_count = await db.Notification.count({ where: { shop_id: shopId, is_read: false } });

    return res.json({ unread_count });
  } catch (error) {
    console.error('countNotifications error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    const notification = await db.Notification.findOne({ where: { id: req.params.id, shop_id: shopId } });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    if (!notification.is_read) {
      notification.is_read = true;
      notification.read_at = new Date();
      await notification.save();
    }

    return res.json({ notification });
  } catch (error) {
    console.error('markNotificationRead error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const shopId = requireShopId(req, res);
    if (!shopId) return;

    await db.Notification.update(
      { is_read: true, read_at: new Date() },
      { where: { shop_id: shopId, is_read: false } },
    );

    return res.json({ message: 'All notifications marked read' });
  } catch (error) {
    console.error('markAllNotificationsRead error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
