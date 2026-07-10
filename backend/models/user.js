const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.belongsTo(models.Role,     { foreignKey: 'role_id' });
      User.belongsTo(models.Employee, { foreignKey: 'employee_id' });
      User.belongsTo(models.Branch,   { foreignKey: 'branch_id' });
      User.belongsTo(models.Shop,     { foreignKey: 'shop_id' });
      User.hasMany(models.AuditLog,   { foreignKey: 'user_id' });
    }
  }
  User.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: true  // null = super_admin (platform level)
    },
    status: {
      type: DataTypes.ENUM('active', 'disabled'),
      defaultValue: 'active'
    },
    disabled_by_suspension: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    underscored: true
  });
  return User;
};
