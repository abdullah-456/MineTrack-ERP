const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Role extends Model {
    static associate(models) {
      Role.hasMany(models.User, { foreignKey: 'role_id' });
      Role.belongsTo(models.Shop, { foreignKey: 'shop_id' });
      Role.belongsToMany(models.Permission, {
        through: 'RolePermission',
        foreignKey: 'role_id',
        otherKey: 'permission_id'
      });
    }
  }
  Role.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    display_name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    // NULL = global/system role (super_admin, admin, accountant, user —
    // shared across the whole platform, as originally seeded). Non-null =
    // a per-shop custom role, or a per-shop "fork" of a global role created
    // the first time that shop's admin edits it (see roleController.js).
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Role',
    tableName: 'roles',
    underscored: true
  });
  return Role;
};
