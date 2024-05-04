const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db'); // Import the database connection
const app = express();

var cron = require('node-cron');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
app.use('/uploads', express.static(__dirname + '/uploads'));
const port = 8000;

var cors = require('cors')
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(cors())
const storage = multer.diskStorage({
    destination: 'uploads/', // Directory where files will be saved
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed.'));
        }
    }
});


// Registration
app.post('/register', async (req, res) => {
    const { mobile, password, name } = req.body;
    var referred = "1"
    const key = uuidv4(mobile);
    console.log(key);
    const checkUsernameQuery = 'SELECT * FROM users WHERE mobile = ?';
    db.query(checkUsernameQuery, [mobile], async (err, result) => {
        if (err) {
            console.error('Error checking username:', err);
            res.status(500).json({ error: 'Failed to signup' });
        } else if (result.length > 0) {
            res.status(200).json({ status: 'fail', message: 'mobile Number already exists' });
        } else {

            var otp = Math.floor(1000 + Math.random() * 9000)
            const createUserQuery = 'INSERT INTO users (unique_id, name, mobile, password, referred, otp) VALUES (?, ?, ?, ?, ?, ?)';
            db.query(createUserQuery, [key, name, mobile, password, referred, otp], (err, result) => {
                if (err) {
                    console.error('Error creating user:', err);
                    res.status(500).json({ error: 'Failed to signup' });
                } else {
                    res.status(201).json({ status: "success", statusCode: '01', message: 'OTP send successfully', otp, mobile });
                }
            });
        }
    })
});
// otp varyfy 

app.post('/otp-verify', async (req, res) => {
    console.log("req.body", req.body)
    var { otp, mobile } = req.body
    try {
        db.query('SELECT unique_id, otp FROM users WHERE users.mobile = ?', [mobile], (err, saveduser) => {
            if (err) {
                return res.status(422).json({ status: "fail", error: err })
            }
            console.log("saveduser, ", saveduser)
            if (saveduser.length === 0) {
                return res.status(422).json({ status: "fail", message: "INVALID Phone number" })
            }
            var user_id = saveduser[0].unique_id
            const users_otp = JSON.stringify(saveduser[0].otp);
            console.log(user_id, "user_id")
            if (users_otp) {
                var userWallet = {
                    user_id: user_id,
                    wallet: 0,
                    status: "Enable",
                }
                db.query('INSERT INTO wallet SET ?', userWallet, async (error, results) => {
                    if (error) {
                        console.log("error", error)
                        return res.status(500).json({ success: false, message: 'wallet Internal server error' });
                    }
                    console.log("results", results.affectedRows)
                    if (results.affectedRows) {
                        return res.status(200).json({ status: "success", message: "OTP verified", unique_id: user_id });
                    } else {
                        return res.status(200).json({ status: "error", message: "INSERT error" });
                    }
                })

            } else {
                return res.status(422).json({ status: "fail", message: "INVALID OTP" })
            }
        })

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
});


// Login
app.post('/login', (req, res) => {
    const { mobile, password } = req.body;
    console.log("req.body", req.body)
    const sql = 'SELECT * FROM users WHERE mobile = ? AND password = ?';
    db.query(sql, [mobile, password], (err, results) => {
        if (err) {
            console.error('Login error: ', err);
            res.status(500).json({ message: 'Login failed' });
        } else {
            if (results.length > 0) {
                var unique_id = results[0].unique_id
                console.log("user_id", unique_id)
                res.json({ status: "success", message: "Login successful", unique_id });
            } else {
                res.status(401).json({ message: 'Invalid credentials' });
            }
        }
    });
});

app.get('/user-profile', (req, res) => {
    const userIdToRetrieve = req.query.user_id;
    db.query('SELECT name, mobile FROM users WHERE unique_id = ?', [userIdToRetrieve], (error, result) => {
        if (error) {
            console.error('Error fetching user profile:', error);
            res.status(500).json({ error: 'Failed to fetch user profile' });
        } else {
            if (result.length === 0) {
                // If no user found, send an appropriate response
                res.status(404).json({ status: 'not found', message: 'User not found' });
            } else {
                const userProfile = { ...result[0] };
                res.status(200).json({ status: 'success', data: userProfile });
            }
        }
    });
});











cron.schedule('*/2 * * * *', async () => {
    var nextTime = await updateToNextTime();
    console.log('Next time:', nextTime);
    const updateQuery = 'UPDATE timer SET nextTime = ?';
    db.query(updateQuery, [nextTime], async (err, result) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }
        if (result.affectedRows === 0) {
            console.log("No time found")
        } else {
            //  const periods_id = await periodsId();
            //  console.log("periods_id", periods_id)
            //   const updateQuerys = 'UPDATE latresult SET akhar1 = ?, akhar2 = ?, number = ? WHERE id = ?';
            calculateResults(async (calcErr, lateResults) => {
                console.log("lateResults--------------------------- 121212", lateResults)
                if (lateResults != null) {
                    console.log("lateResults.RandomMissingNumber", lateResults.RandomMissingNumber);
                    if (calcErr) {
                        console.error('Error calculating results:', calcErr);
                    } else {
                        const updateQuerys = 'UPDATE latresult SET akhar1 = ?, akhar2 = ?, number = ? WHERE id = ?';
                        const { akhar1, akhar2, RandomMissingNumber, totalAmount } = lateResults
                        const values = [akhar1, akhar2, RandomMissingNumber, 1];
                        console.log("values------------------", values);
                        try {
                            const result = await db.query(updateQuerys, values);
                            console.log('Data updated successfully');
                            const insertQuery = 'INSERT INTO resulthistory (number, akhar1, akhar2, amounts) VALUES (?, ?, ?, ?)';
                            const value = [RandomMissingNumber, akhar1, akhar2, totalAmount];
                            db.query(insertQuery, value, (insertErr, insertResult) => {
                                if (insertErr) {
                                    console.error('Error inserting data:', insertErr);
                                } else {
                                    console.log('Data with time inserted successfully');
                                }
                            });
                        } catch (err) {
                            console.error('Error updating data:', err);
                        }
                    }
                } else {
                    console.log('only time updated successfully');
                }
            });


        }
    });

})

// function periodsId() {
//     const selectQuery = 'SELECT MAX(`period_id`) AS `max_period_id` FROM `periods`';
//     db.query(selectQuery, async (err, results) => {
//         if (err) {
//             console.error('Error querying numbers:', err);
//             return;
//         }
//         console.log("results", results[0].max_period_id)
//         const updatePeri = JSON.parse(results[0].max_period_id) + 1
//         console.log("updatePeri", updatePeri)
//         return updatePeri

//     });
// }




function calculateResults(callback) {
    const currentTime = new Date();
    const twoMinutesAgo = new Date(currentTime - 2 * 60 * 1000); // Two minutes ago

    const createUserQuery = 'SELECT * FROM `numbers` WHERE created_date >= ?';
    db.query(createUserQuery, [twoMinutesAgo], (err, result) => {
        if (err) {
            console.error('Error querying numbers:', err);
            return;
        } if (result.length > 0) {
            const data = result;
            const sumByNumber = {};
            data.forEach(item => {
                const user_id = item.user_id;
                const number = item.number;
                const amount = item.amount;
                if (sumByNumber[number]) {
                    sumByNumber[number] += amount;
                } else {
                    sumByNumber[number] = amount;
                }
            });

            let minAmount = Infinity;
            let minNumber = null;

            for (const number in sumByNumber) {
                if (sumByNumber[number] < minAmount) {
                    minAmount = sumByNumber[number];
                    minNumber = number;
                }
            }

            let totalAmount = 0;
            for (const number in sumByNumber) {
                totalAmount += sumByNumber[number];
            }

            let userid_by_no = [];
            data.forEach(item => {
                if (item.number === minNumber) {
                    userid_by_no.push(item.user_id);
                }
            });

            console.log("sumByNumber", sumByNumber);
            console.log("minNumber", minNumber)
            const allNumbers = Object.keys(sumByNumber).map(Number);
            const maxNumber = Math.max(...allNumbers);
            const missing = [];
            for (let i = 1; i <= maxNumber; i++) {
                if (!allNumbers.includes(i)) {
                    missing.push(i);
                }
            }

            if (totalAmount > 20000) {
                console.log("if  part---------------------------------------------0000")
                const number = minNumber;
                const akhar1 = Math.floor(number / 10);
                const akhar2 = number % 10;
                const originalNumber = akhar2;
                const formattedNumber = originalNumber.toString().repeat(3);
                console.log(formattedNumber);
                console.log("akhar1:", akhar1);
                console.log("akhar2:", formattedNumber);
                var results = {
                    totalAmount: totalAmount,
                    RandomMissingNumber: minNumber,
                    akhar1: akhar1,
                    akhar2: formattedNumber,

                };
                console.log("results ----------------", results)
                console.log("totalAmount", totalAmount)
                const resultNumber = minNumber;
                const filteredData = data.filter(transaction => {
                    return transaction.number === resultNumber && transaction.user_id !== "";
                });
                const resultArray = filteredData.map(transaction => {
                    return {
                        user_id: transaction.user_id,
                        amount: transaction.amount
                    };
                });
                console.log("Result Array------------------------------:", resultArray);
                for (const entry of resultArray) {
                    const user_id = entry.user_id;
                    const additionalAmount = entry.amount * 80;
                    getWalletAmount(user_id)
                        .then(currentAmount => {
                            const newAmount = currentAmount + additionalAmount;
                            updateWalletAmount(user_id, newAmount, additionalAmount, minNumber)
                                .then(updatedWallet => {
                                    console.log(`Updated wallet for user_id: ${user_id} with new amount: ${newAmount}`);
                                })
                                .catch(error => {
                                    console.error("Error updating wallet:", error);
                                });
                        })
                        .catch(error => {
                            console.error("Error retrieving wallet amount:", error);
                        });
                }
                callback(null, results);
            } else {
                const randomSixDigitNumber = generateRandomSixDigitNumber();
                console.log(randomSixDigitNumber);
                console.log("else part---------------------------------------------0000")
                const randomMissingNumber = missing[Math.floor(Math.random() * missing.length)];
                const number = randomMissingNumber;
                const akhar1 = Math.floor(number / 10);
                const akhar2 = number % 10;
                const originalNumber = akhar2;
                const formattedNumber = originalNumber.toString().repeat(3);
                console.log(formattedNumber);
                console.log("akhar1:", akhar1);

                var results = {
                    totalAmount: randomSixDigitNumber,
                    RandomMissingNumber: randomMissingNumber,
                    akhar1: akhar1,
                    akhar2: formattedNumber,

                }
                console.log("results ----------------", results)
                callback(null, results)
            }

        } else {
            console.log("without number  part---------------------------------------------0000")
            const randomSixDigitNumber = generateRandomSixDigitNumber();
            console.log(randomSixDigitNumber);
            const randomMissingNumber = Math.floor(Math.random() * 100) + 1;
            const number = randomMissingNumber;
            const akhar1 = Math.floor(number / 10);
            const akhar2 = number % 10;
            const originalNumber = akhar2;
            const formattedNumber = originalNumber.toString().repeat(3);
            console.log("akhar1:", akhar1);
            console.log("akhar2:", formattedNumber);
            var results = {
                totalAmount: randomSixDigitNumber,
                RandomMissingNumber: randomMissingNumber,
                akhar1: akhar1,
                akhar2: formattedNumber,
            }
            console.log("results ----------------", results)
            callback(null, results)
        }

    });
}




function generateRandomSixDigitNumber() {
    const min = 10000; // Smallest 6-digit number
    const max = 99999; // Largest 6-digit number
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getWalletAmount(user_id) {
    return new Promise((resolve, reject) => {
        db.query("SELECT wallet FROM wallet WHERE user_id = ?", [user_id], (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result[0].wallet);
            }
        });
        setTimeout(() => {
            resolve(100);
        }, 1000);
    });
}

function updateWalletAmount(user_id, newAmount, additionalAmount, minNumber) {
    return new Promise((resolve, reject) => {
        db.query("UPDATE wallet SET wallet = ? WHERE user_id = ?", [newAmount, user_id], (error, result) => {
            if (error) {
                reject(error);
            } else {
                db.query("INSERT INTO win_history (user_id, win_amount, win_number) VALUES (?, ?, ?)", [user_id, additionalAmount, minNumber], (insertError, insertResult) => {
                    if (insertError) {
                        reject(insertError);
                    } else {
                        resolve(result);
                    }
                });
            }
        });
        setTimeout(() => {
            resolve();
        }, 1000);
    });
}


function updateToNextTime() {
    var currentTime = new Date();
    var nextTime = new Date();
    nextTime.setTime(currentTime.getTime() + (2 * 60 * 1000));
    // Set the time zone to Asia/Kolkata
    var options = { timeZone: 'Asia/Kolkata', hour12: false };
    // var formattedCurrentTime = currentTime.toLocaleTimeString('en-US', options);
    var formattedNextTime = nextTime.toLocaleTimeString('en-US', options);
    return formattedNextTime;
}

// order-airya

app.post('/place-orders', (req, res) => {
    const { number, amount, userid } = req.body;
    const query = 'SELECT wallet FROM wallet WHERE user_id = ?';

    // Using async/await for cleaner asynchronous code
    db.query(query, [userid], async (err, results) => {
        if (err) {
            console.error('Error querying wallet:', err);
            return res.status(500).json({ error: 'Failed to fetch wallet balance' });
        }
        const wallet = results[0].wallet;
        console.log("wallet---------------------> ", typeof (wallet))
        if (wallet >= amount) { // Changed this to allow equal balances
            const updatedAmount = wallet - amount;
            try {
                // Use promise-based queries for better error handling
                const updatedAmount = wallet - amount;
                console.log("updatedAmount", updatedAmount);
                const description = `Rs.${amount}/ Debit for Account verification Charges`;
                await db.query('INSERT INTO walletsummary (unique_id, amount, type, description, closing_balance, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [userid, amount, "DR", description, updatedAmount, "Success"]
                );

                await db.query('UPDATE wallet SET wallet = ? WHERE user_id = ?', [updatedAmount, userid]);

                await db.query('INSERT INTO numbers (user_id, number, amount ) VALUES (?, ?, ?)', [userid, number, amount]);

                return res.json({ status: "success", statusCode: '01', message: 'Numbers saved successfully' });
            } catch (error) {
                console.error('Error processing order:', error);
                return res.json({ error: 'Failed to process order' });
            }
        } else {
            return res.json({ message: 'Your balance is insufficient. Please recharge now.' });
        }
    });
});


app.get('/next-time', (req, res) => {
    const query = 'SELECT nextTime FROM timer';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }
        if (results.length === 0) {
            res.status(404).json({ error: 'No time found' });
        } else {
            const nextTime = results[0].nextTime;
            res.json({ nextTime });
        }
    });
});

app.get('/win-history', (req, res) => {
    const userIdToRetrieve = req.query.user_id;
    // Execute the SQL query to retrieve the latest win history record for the specified user_id
    db.query('SELECT * FROM win_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userIdToRetrieve], (error, result) => {
        if (error) {
            console.error('Error fetching win history:', error);
            res.status(500).json({ error: 'Failed to fetch win history' });
        } else {
            if (result.length === 0) {
                // If no records found, send an appropriate response
                res.status(404).json({ status: 'not found', message: 'No win history found for the user' });
            } else {
                console.log('Latest win history record for user ID', userIdToRetrieve, ':', result[0].win_amount);
                res.status(200).json({ status: 'success', data: result[0].win_amount });
            }
        }
    });
});


app.get('/win-all-history', (req, res) => {
    const userIdToRetrieve = req.query.user_id;
    // Execute the SQL query to retrieve win history for the specified user_id
    db.query('SELECT * FROM win_history WHERE user_id = ?', [userIdToRetrieve], (error, results) => {
        if (error) {
            console.error('Error fetching win history:', error);
            res.status(500).json({ error: 'Failed to fetch win history' });
        } else {
            res.status(200).json({ status: 'success', data: results });
        }
    });
});



app.get('/user_wallet', (req, res) => {
    const user_id = req.query.user_id;
    console.log("user_id", user_id);
    const query = 'SELECT wallet FROM wallet WHERE user_id = ?';
    db.query(query, [user_id], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }
        if (results.length === 0) {
            res.status(404).json({ error: 'No wallet found for the user' });
        } else {
            const wallet = results[0].wallet;
            res.json({ wallet });
        }
    });
});







app.get('/latest-results', (req, res) => {
    const createUserQuery = 'SELECT * FROM `latresult`';
    db.query(createUserQuery, (err, result) => {
        if (err) {
            console.error('Error querying numbers:', err);
            res.status(500).json({ error: 'Failed to fetch numbers' });
        } else {
            const data = result;
            res.status(200).json({ status: "success", data });
        }
    });
});


app.get('/results-history', (req, res) => {
    const fetchLatest20Query = 'SELECT * FROM `resulthistory` ORDER BY time DESC LIMIT 10';

    db.query(fetchLatest20Query, (err, result) => {
        if (err) {
            console.error('Error querying numbers:', err);
            res.status(500).json({ error: 'Failed to fetch numbers' });
        } else {
            const data = result;
            res.status(200).json({ status: "success", data });
        }
    });
});




// app.get('/get-results', (req, res) => {
//     const createUserQuery = 'SELECT * FROM `numbers`';
//     db.query(createUserQuery, (err, result) => {
//         if (err) {
//             console.error('Error querying numbers:', err);
//             res.status(500).json({ error: 'Failed to fetch numbers' });
//         } else {
//             const data = result;

//             const sumByNumber = {};
//             data.forEach(item => {
//                 const user_id = item.user_id;
//                 const number = item.number;
//                 const amount = item.amount;
//                 if (sumByNumber[number]) {
//                     sumByNumber[number] += amount;
//                 } else {
//                     sumByNumber[number] = amount;
//                 }
//             });

//             let minAmount = Infinity;
//             let minNumber = null;

//             for (const number in sumByNumber) {
//                 if (sumByNumber[number] < minAmount) {
//                     minAmount = sumByNumber[number];
//                     minNumber = number;
//                 }
//             }

//             let totalAmount = 0;
//             for (const number in sumByNumber) {
//                 totalAmount += sumByNumber[number];
//             }

//             let userid_by_no = [];
//             data.forEach(item => {
//                 if (item.number === minNumber) {
//                     userid_by_no.push(item.user_id);
//                 }
//             });

//             console.log("sumByNumber", sumByNumber);

//             const allNumbers = Object.keys(sumByNumber).map(Number);
//             const maxNumber = Math.max(...allNumbers);
//             const missing = [];
//             for (let i = 1; i <= maxNumber; i++) {
//                 if (!allNumbers.includes(i)) {
//                     missing.push(i);
//                 }
//             }
//             console.log("missing", missing);
//             // Select a random number from the missing array
//             const randomMissingNumber = missing[Math.floor(Math.random() * missing.length)];

//             var results = {
//                 totalAmount: totalAmount,
//                 MinimumNumber: minNumber,
//                 MinimumAmount: minAmount,
//                 UserIDsForMinimumNumber: userid_by_no,
//                 RandomMissingNumber: randomMissingNumber,
//             };

//             console.log("Total Amount:", totalAmount);
//             console.log("Number with Minimum Amount:", minNumber);
//             console.log("Minimum Amount:", minAmount);
//             console.log("User IDs for Minimum Number:", userid_by_no);
//             console.log("Random Missing Number:", randomMissingNumber);

//             res.status(200).json({ status: "success", results });
//         }
//     });
// });




// app.get('/get-results', (req, res) => {
//     const createUserQuery = 'SELECT * FROM `numbers`';;
//     db.query(createUserQuery, (err, result) => {
//         if (err) {
//             console.error('Error creating user:', err);
//             res.status(500).json({ error: 'Failed to save numbers' });
//         } else {
//             const data = result
//             const sumByNumber = {};
//             data.forEach(item => {
//                 const user_id = item.user_id;
//                 const number = item.number;
//                 const amount = item.amount;
//                 if (sumByNumber[number]) {
//                     sumByNumber[number] += amount;
//                 } else {
//                     sumByNumber[number] = amount;
//                 }
//             });
//             console.log("sumByNumber", sumByNumber)
//             let minAmount = Infinity;
//             let minNumber = null;

//             for (const number in sumByNumber) {
//                 if (sumByNumber[number] < minAmount) {
//                     minAmount = sumByNumber[number];
//                     minNumber = number;
//                 }
//             }
//             let totalAmount = 0;
//             for (const number in sumByNumber) {
//                 totalAmount += sumByNumber[number];
//             }
//             var results = {
//                 totalAmount: totalAmount,
//                 MinimumNumber: minNumber,
//                 MinimumAmount: minAmount
//             }
//             console.log("totalAmount", totalAmount)
//             console.log("Number with Minimum Amount:", minNumber);
//             console.log("Minimum Amount:", minAmount);
//             res.status(201).json({ status: "success", statusCode: '01', results });
//         }
//     })
// });




app.post('/patemadd', upload.single('screen_shot'), (req, res) => {
    const { user_id, amount } = req.body;
    const screen_shot = req.file.filename;

    const sql = 'INSERT INTO recharges (user_id, amount, screen_shot, status) VALUES (?, ?, ?, ?)';
    db.query(sql, [user_id, amount, screen_shot, 'pending'], (err, result) => {
        if (err) {
            console.error('Error inserting data:', err);
            res.status(500).json({ message: 'Error inserting data' });
        } else {
            console.log('Data inserted successfully');
            res.json({ message: 'Data inserted successfully' });
        }
    });
});



app.post('/verifyPaymentRequest', (req, res) => {
    const user_id = req.body.user_id;
    const amount = req.body.amount;
    const sqlSelect = 'SELECT wallet FROM wallet WHERE user_id = ?';
    db.query(sqlSelect, [user_id], (err, result) => {
        if (err) {
            console.error('Error fetching wallet:', err);
            res.status(500).json({ error: 'Error fetching wallet' });
        } else {
            const oldAmount = result[0].wallet;
            const updatedAmount = oldAmount + amount;
            const sqlUpdate = 'UPDATE wallet SET wallet = ? WHERE user_id = ?';
            db.query(sqlUpdate, [updatedAmount, user_id], (err, result) => {
                if (err) {
                    console.error('Error updating wallet:', err);
                    res.status(500).json({ error: 'Error updating wallet' });
                } else {
                    const sqlUpdate = 'UPDATE recharges SET status = ? WHERE user_id = ?';
                    db.query(sqlUpdate, ['success', user_id], (err, result) => {
                        if (err) {
                            console.error('Error updating wallet:', err);
                            res.status(500).json({ error: 'Error updating wallet' });
                        } else {
                            res.json({ message: 'Payment request verified' });
                        }
                    });

                }
            });
        }
    });
});
app.get('/getuser_number', (req, res) => {
    const currentTime = new Date();
    const HalfMinutesAgo = new Date(currentTime - 30 * 1000); // Half a minute ago
    const user_id = req.query.user_id;
    const sqlSelect = 'SELECT * FROM `numbers` WHERE created_date >= ? AND user_id = ?'; // Use AND instead of a comma
    db.query(sqlSelect, [HalfMinutesAgo, user_id], (err, result) => {
        if (err) {
            console.error('Error fetching wallet:', err);
            res.status(500).json({ error: 'Error fetching wallet' });
        } else {
            const data = result;
            res.status(201).json({ message: 'latest number', data });
        }
    });
});



app.get('/getpaymentrequests', (req, res) => {
    const sql = 'SELECT * FROM recharges WHERE status = "pending"';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching payment requests:', err);
            res.status(500).json({ error: 'Error fetching payment requests' });
        } else {
            res.json(results);
        }
    });
});



app.get('/', (req, res) => {

    res.json("working now");
});





app.listen(port, () => {
    console.log(`Server is  and update time running on port ${port}`);
});
