/* migrations/9999999999999_add_manager_role_to_users.js */
exports.up = (pgm) => {
  // Drop existing check constraint, then add a new one that includes 'manager'
  pgm.sql(`
    ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users
    ADD CONSTRAINT users_role_check CHECK (role IN ('customer','vendor','admin','manager'));
  `);
};

exports.down = (pgm) => {
  // revert back to original (remove manager)
  pgm.sql(`
    ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users
    ADD CONSTRAINT users_role_check CHECK (role IN ('customer','vendor','admin'));
  `);
};
