const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'noorzqwj_app_test',
  password: 't]EPNUt~c^PS',
  database: 'noorzqwj_app_test'
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed: ', err);
  } else {
    console.log('Connected to database');
  }
});

module.exports = db;
