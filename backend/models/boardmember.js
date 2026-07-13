const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BoardMember extends Model {
    static associate(models) {
      BoardMember.belongsTo(models.Shop, { foreignKey: 'shop_id' });
    }
  }
  BoardMember.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    shop_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cnic: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    opening_balance: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
  }, {
    sequelize,
    modelName: 'BoardMember',
    tableName: 'board_members',
    underscored: true,
  });
  return BoardMember;
};
