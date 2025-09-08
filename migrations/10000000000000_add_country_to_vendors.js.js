/* migrations/1000000000000_add_country_to_vendors.js */
exports.up = (pgm) => {
  pgm.addColumn('vendors', {
    country: { type: 'text', notNull: false }
  });
  // optional index for faster country filtering
  pgm.createIndex('vendors', ['country']);
};

exports.down = (pgm) => {
  pgm.dropIndex('vendors', ['country']);
  pgm.dropColumn('vendors', 'country');
};
//pnpm node-pg-migrate up