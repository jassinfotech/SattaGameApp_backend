const CheckToken = async (db, unique_id) => {
    console.log("unique_id in CheckToken", unique_id);
    return new Promise(async (resolve, reject) => {
      try {
        console.log('unique_id', unique_id);
        db.query('SELECT * FROM users WHERE unique_id = ?', [unique_id], (err, data) => {
          if (err) {
            reject(err); // Reject the promise with the error
          } else {
         console.log("data", data);
           resolve(data[0]); // Resolve the promise with the first row of data
            
          }
        });
      } catch (error) {
        reject(error); // Reject the promise if an exception occurs
      }
    });
  };
  
  module.exports = { CheckToken };
  