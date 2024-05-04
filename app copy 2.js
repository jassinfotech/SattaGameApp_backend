const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db'); // Import the database connection
const app = express();
const nodemailer = require('nodemailer');
var cron = require('node-cron');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
app.use('/uploads', express.static(__dirname + '/uploads'));
const port = 8000;
const signUpMail = require('./signUpHtml');
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
    const { mobile, password, name, userEmail } = req.body;
    var referred = "1"
    const key = uuidv4(mobile);
    console.log(key);
    const checkUsernameQuery = 'SELECT * FROM users WHERE mobile = ? AND userEmail = ?';
    db.query(checkUsernameQuery, [mobile, userEmail], async (err, result) => {
        if (err) {
            console.error('Error checking username:', err);
            res.status(500).json({ error: 'Failed to signup' });
        } else if (result.length > 0) {
            res.status(200).json({ status: 'fail', message: 'mobile Number already exists' });
        } else {

            const otp = generateRandomOTP(); // Generate a new OTP
            const status = await sendOTPEmail(userEmail, otp);
            console.log("status", status)
            const createUserQuery = 'INSERT INTO users (unique_id, name, mobile, password, referred, otp, userEmail, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
            db.query(createUserQuery, [key, name, mobile, password, referred, otp, userEmail, 'Disable'], (err, result) => {
                if (err) {
                    console.error('Error creating user:', err);
                    res.status(500).json({ error: 'Failed to signup' });
                } else {
                    res.status(201).json({ status: "success", statusCode: '01', message: 'OTP and Email sent successfully', mobile, userEmail });
                }
            });
        }
    })
});
// otp varyfy 

app.post('/otp-verify', async (req, res) => {
    console.log("req.body", req.body)
    var { otp, mobile, userEmail } = req.body
    try {
        db.query('SELECT unique_id, otp FROM users WHERE mobile = ? AND userEmail = ?', [mobile, userEmail], (err, saveduser) => {
            if (err) {
                return res.status(422).json({ status: "fail", error: err })
            }
            console.log("saveduser, ", saveduser)
            if (saveduser.length === 0) {
                return res.status(422).json({ status: "fail", message: "INVALID Phone number and Email" })
            }
            var user_id = saveduser[0].unique_id
            const users_otp = JSON.stringify(saveduser[0].otp);
            console.log(user_id, "user_id")
            if (users_otp === otp) {
                const updateOTPQuery = 'UPDATE users SET status = ? WHERE mobile = ? AND userEmail = ?';
                db.query(updateOTPQuery, ["Enable", mobile, userEmail], (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error('Error updating OTP:', updateErr);
                        res.status(500).json({ error: 'Failed to update OTP' });
                    } else {
                        const userWallet = {
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

                    }
                });


            } else {
                return res.status(422).json({ status: "fail", message: "INVALID OTP" })
            }
        })

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
});






app.post('/resend-otp', async (req, res) => {
    const userEmail = req.body.userEmail;
    const mobile = req.body.mobile;
    console.log(" req.body", req.body)
    try {
        const otp = generateRandomOTP();
        const status = await sendOTPEmail(userEmail, otp);
        console.log("status", status)

        const checkUserQuery = 'SELECT * FROM users WHERE mobile = ? AND userEmail = ?';
        db.query(checkUserQuery, [mobile, userEmail], async (err, result) => {
            if (err) {
                console.error('Error checking user:', err);
                res.status(500).json({ error: 'Failed to check user' });
            } else {
                // If the user does not exist, update the OTP
                const updateOTPQuery = 'UPDATE users SET otp = ? WHERE mobile = ? AND userEmail = ?';
                db.query(updateOTPQuery, [otp, mobile, userEmail], (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error('Error updating OTP:', updateErr);
                        res.status(500).json({ error: 'Failed to update OTP' });
                    } else {
                        res.json({ status: 1, message: 'OTP resent successfully' });
                    }
                });
            }
        });
    } catch (error) {
        res.json({ status: 0, message: 'Error resending OTP', error });
    }
});









// Login
app.post('/login', (req, res) => {
    const { mobile, password } = req.body;
    console.log("req.body", req.body);
    const sql = 'SELECT * FROM users WHERE mobile = ? AND password = ?';
    db.query(sql, [mobile, password], (err, results) => {
        if (err) {
            console.error('Login error: ', err);
            res.status(500).json({ message: 'Login failed' });
        } else {
            if (results.length > 0) {
                const user = results[0];
                console.log("user", user)
                if (user.status === 'Enable') {
                    var unique_id = user.unique_id;
                    console.log("user_id", unique_id);
                    res.json({ status: "success", message: "Login successful", unique_id });
                } else {

                    res.json({ status: 0, message: 'User is disabled' });
                }
            } else {
                res.json({ status: 0, message: 'Invalid credentials' });

            }
        }
    });
});




app.post('/reset-password', async (req, res) => {
    const userEmail = req.body.userEmail;
    console.log(" req.body", req.body)
    try {
        const otp = generateRandomOTP();
        const status = await sendOTPEmail(userEmail, otp);
        console.log("status", status)

        const checkUserQuery = 'SELECT * FROM users WHERE  userEmail = ?';
        db.query(checkUserQuery, [userEmail], async (err, result) => {
            if (err) {
                console.error('Error checking user:', err);
                res.status(500).json({ error: 'Failed to check user' });
            } else {
                // If the user does not exist, update the OTP
                const updateOTPQuery = 'UPDATE users SET otp = ? WHERE  userEmail = ?';
                db.query(updateOTPQuery, [otp, userEmail], (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error('Error updating OTP:', updateErr);
                        res.status(500).json({ error: 'Failed to update OTP' });
                    } else {
                        res.json({ status: 1, message: 'OTP resent successfully' });
                    }
                });
            }
        });
    } catch (error) {
        res.json({ status: 0, message: 'Error resending OTP', error });
    }
});

app.post('/otp-verify-password', async (req, res) => {
    console.log("req.body", req.body)
    var { otp, userEmail } = req.body
    try {
        db.query('SELECT unique_id, otp FROM users WHERE userEmail = ?', [userEmail], (err, saveduser) => {
            if (err) {
                return res.status(422).json({ status: "fail", error: err })
            }
            console.log("saveduser, ", saveduser)
            if (saveduser.length === 0) {
                return res.status(422).json({ status: "fail", message: "INVALID  Email" })
            }
            var user_id = saveduser[0].unique_id
            const users_otp = JSON.stringify(saveduser[0].otp);

            if (users_otp === otp) {
                return res.status(200).json({ status: 1, message: "OTP verified GO to Login" });
            } else {
                return res.status(422).json({ status: "fail", message: "INVALID OTP" })
            }
        })

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
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



app.post('/set-password', (req, res) => {
    const { userEmail, newPassword } = req.body;
    db.query('SELECT * FROM users WHERE userEmail = ?', [userEmail], (error, results) => {
        if (error) {
            console.error('Error fetching user:', error);
            res.status(500).json({ status: 'error', message: 'Failed to fetch user' });
        } else {
            if (results.length === 0) {
                res.status(404).json({ status: 'not found', message: 'User not found' });
            } else {
                const user = results[0];
                db.query('UPDATE users SET password = ? WHERE userEmail = ?', [newPassword, userEmail], (updateError, updateResults) => {
                    if (updateError) {
                        console.error('Error updating password:', updateError);
                        res.status(500).json({ status: 'error', message: 'Failed to update password' });
                    } else {
                        res.status(200).json({ status: 1, message: 'Password updated successfully' });
                    }
                });
            }
        }
    });
});










cron.schedule('*/2 * * * *', async () => {
    var nextTime = await updateToNextTime();
    console.log('Next time:', nextTime);
    const selectQuery = 'SELECT periods FROM timer WHERE id = ?';
    db.query(selectQuery, [1], async (err, selectResult) => {
        if (err) {
            console.error('Error executing SELECT query:', err);
            res.status(500).json({ error: 'Internal Server Error' });
            return;
        }
        if (selectResult.length === 0) {
            console.log("No record found with id 1");
            return;
        }
        const currentPeriods = parseInt(selectResult[0].periods);
        const newPeriods = currentPeriods + 1;
        const updateQuery = 'UPDATE timer SET nextTime = ?, periods = ? WHERE id = ?';
        db.query(updateQuery, [nextTime, newPeriods, 1], async (err, result) => {
            if (err) {
                console.error('Error executing query:', err);
                res.status(500).json({ error: 'Internal Server Error' });
                return;
            }
            if (result.affectedRows === 0) {
                console.log("No time found");

            } else {

                calculateResults(async (calcErr, lateResults) => {
                    console.log("lateResults--------------------------- 121212", lateResults)
                    if (lateResults != null) {
                        console.log("lateResults.RandomMissingNumber", lateResults.RandomMissingNumber);
                        if (calcErr) {
                            console.error('Error calculating results:', calcErr);
                        } else {
                            const updateQuerys = 'UPDATE latresult SET akhar1 = ?, akhar2 = ?, number = ? WHERE id = ?';
                            const { akhar1, akhar2, RandomMissingNumber, totalAmount, periods } = lateResults
                            const values = [akhar1, akhar2, RandomMissingNumber, 1];
                            console.log("values------------------", values);
                            try {
                                const result = await db.query(updateQuerys, values);
                                console.log('Data updated successfully');
                                const insertQuery = 'INSERT INTO resulthistory (number, akhar1, akhar2, amounts, periods) VALUES (?, ?, ?, ?, ?)';
                                const value = [RandomMissingNumber, akhar1, akhar2, totalAmount, periods];
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



})





// function calculateResults(callback) {
//     const currentTime = new Date();
//     const twoMinutesAgo = new Date(currentTime - 2 * 60 * 1000); // Two minutes ago

//     const createUserQuery = 'SELECT * FROM `numbers` WHERE created_date >= ?';
//     db.query(createUserQuery, [twoMinutesAgo], (err, result) => {
//         if (err) {
//             console.error('Error querying numbers:', err);
//             return;
//         } if (result.length > 0) {
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
//             console.log("minNumber", minNumber)
//             const allNumbers = Object.keys(sumByNumber).map(Number);
//             const maxNumber = Math.max(...allNumbers);
//             const missing = [];
//             for (let i = 1; i <= maxNumber; i++) {
//                 if (!allNumbers.includes(i)) {
//                     missing.push(i);
//                 }
//             }

//             if (totalAmount > 20000) {
//                 console.log("if  part---------------------------------------------0000")
//                 const number = minNumber;
//                 const akhar1 = Math.floor(number / 10);
//                 const akhar2 = number % 10;
//                 const originalNumber = akhar2;
//                 const formattedNumber = originalNumber.toString().repeat(3);
//                 console.log(formattedNumber);
//                 console.log("akhar1:", akhar1);
//                 console.log("akhar2:", formattedNumber);
//                 var results = {
//                     totalAmount: totalAmount,
//                     RandomMissingNumber: minNumber,
//                     akhar1: akhar1,
//                     akhar2: formattedNumber,

//                 };
//                 console.log("results ----------------", results)
//                 console.log("totalAmount", totalAmount)
//                 const resultNumber = minNumber;
//                 const filteredData = data.filter(transaction => {
//                     return transaction.number === resultNumber && transaction.user_id !== "";
//                 });
//                 const resultArray = filteredData.map(transaction => {
//                     return {
//                         user_id: transaction.user_id,
//                         amount: transaction.amount
//                     };
//                 });
//                 console.log("Result Array------------------------------:", resultArray);
//                 for (const entry of resultArray) {
//                     const user_id = entry.user_id;
//                     const additionalAmount = entry.amount * 80;
//                     getWalletAmount(user_id)
//                         .then(currentAmount => {
//                             const newAmount = currentAmount + additionalAmount;
//                             updateWalletAmount(user_id, newAmount, additionalAmount, minNumber)
//                                 .then(updatedWallet => {
//                                     console.log(`Updated wallet for user_id: ${user_id} with new amount: ${newAmount}`);
//                                 })
//                                 .catch(error => {
//                                     console.error("Error updating wallet:", error);
//                                 });
//                         })
//                         .catch(error => {
//                             console.error("Error retrieving wallet amount:", error);
//                         });
//                 }
//                 callback(null, results);
//             } else {
//                 const randomSixDigitNumber = generateRandomSixDigitNumber();
//                 console.log(randomSixDigitNumber);
//                 console.log("else part---------------------------------------------0000")
//                 const randomMissingNumber = missing[Math.floor(Math.random() * missing.length)];
//                 const number = randomMissingNumber;
//                 const akhar1 = Math.floor(number / 10);
//                 const akhar2 = number % 10;
//                 const originalNumber = akhar2;
//                 const formattedNumber = originalNumber.toString().repeat(3);
//                 console.log(formattedNumber);
//                 console.log("akhar1:", akhar1);

//                 var results = {
//                     totalAmount: randomSixDigitNumber,
//                     RandomMissingNumber: randomMissingNumber,
//                     akhar1: akhar1,
//                     akhar2: formattedNumber,

//                 }
//                 console.log("results ----------------", results)
//                 callback(null, results)
//             }

//         } else {
//             console.log("without number  part---------------------------------------------0000")
//             const randomSixDigitNumber = generateRandomSixDigitNumber();
//             console.log(randomSixDigitNumber);
//             const randomMissingNumber = Math.floor(Math.random() * 100) + 1;
//             const number = randomMissingNumber;
//             const akhar1 = Math.floor(number / 10);
//             const akhar2 = number % 10;
//             const originalNumber = akhar2;
//             const formattedNumber = originalNumber.toString().repeat(3);
//             console.log("akhar1:", akhar1);
//             console.log("akhar2:", formattedNumber);
//             var results = {
//                 totalAmount: randomSixDigitNumber,
//                 RandomMissingNumber: randomMissingNumber,
//                 akhar1: akhar1,
//                 akhar2: formattedNumber,
//             }
//             console.log("results ----------------", results)
//             callback(null, results)
//         }

//     });
// }




function calculateResults(callback) {
    const satta = [
        { number: 1, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 2, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 3, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 4, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 5, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 6, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 7, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 8, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 9, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 10, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 11, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 12, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 13, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 14, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 15, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 16, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 17, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 18, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 19, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 20, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 21, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 22, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 23, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 24, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 25, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 26, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 27, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 28, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 29, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 30, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 31, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 32, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 33, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 34, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 35, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 36, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 37, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 38, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 39, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 40, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 41, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 42, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 43, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 44, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 45, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 46, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 47, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 48, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 49, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 50, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 51, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 52, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 53, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 54, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 55, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 56, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 57, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 58, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 59, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 60, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 61, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 62, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 63, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 64, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 65, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 66, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 67, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 68, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 69, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 70, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 71, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 72, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 73, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 74, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 75, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 76, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 77, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 78, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 79, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 80, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 81, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 82, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 83, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 84, amount: 2 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 85, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 86, amount: 2 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 87, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 88, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 89, amount: 2 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 90, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 91, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 92, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 93, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 94, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 95, amount: 5 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 96, amount: 5, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 97, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
        { number: 98, amount: 10 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 99, amount: 7 , periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b"},
        { number: 100, amount: 10, periods:1285, user_id:"4e05767c-72a4-4233-b48b-c9beb44c682b" },
    
    ];





    const currentTime = new Date();
    const twoMinutesAgo = new Date(currentTime - 2 * 60 * 1000); // Two minutes ago

    const createUserQuery = 'SELECT * FROM `numbers` WHERE created_date >= ?';
    db.query(createUserQuery, [twoMinutesAgo], (err, result) => {
        if (err) {
            console.error('Error querying numbers:', err);
            return;
        } if (satta.length > 0) {
            const data = satta;
            const Periods = data[0].periods
            console.log("first------------ Periods--------> ", Periods)
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

            console.log("sumBy==============703============Number", sumByNumber);
            console.log("min ==============704============Number", minNumber)

            console.log("min ==============userid_by_no============Number", userid_by_no)
            const allNumbers = Object.keys(sumByNumber).map(Number);
            const maxNumber = Math.max(...allNumbers);
            const missing = [];
            for (let i = 1; i <= maxNumber; i++) {
                if (!allNumbers.includes(i)) {
                    missing.push(i);
                }
            }
            console.log("missing===============", missing)
            if (!missing) {
                console.log("if  part---------------------------------------------0000" , minNumber)
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
                    periods: Periods,

                };
                console.log("results ----------------732", results)
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
                    const additionalAmount = entry.amount * 85;
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
                    periods: Periods,

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
            
                for (const entry of resultArray) {
                    const user_id = entry.user_id;
                    const additionalAmount = entry.amount * 85;
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
                periods: randomSixDigitNumber,
            }
            console.log("results ----------------", results)
            callback(null, results)
        }

    });
}


function generateRandomSixDigitNumber() {
    const min = 1000; // Smallest 6-digit number
    const max = 9999; // Largest 6-digit number
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
    const { number, amount, userid, periods } = req.body;
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
            try {
                // Use promise-based queries for better error handling
                const updatedAmount = wallet - amount;
                console.log("updatedAmount", updatedAmount);
                const description = `Rs.${amount}/ Debit for Account verification Charges`;
                await db.query('INSERT INTO walletsummary (unique_id, amount, type, description, closing_balance, status, periods) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [userid, amount, "DR", description, updatedAmount, "Success", periods]
                );
                await db.query('UPDATE wallet SET wallet = ? WHERE user_id = ?', [updatedAmount, userid]);
                await db.query('INSERT INTO numbers (user_id, number, amount, periods ) VALUES (?, ?, ?, ?)', [userid, number, amount, periods]);

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





app.post('/withdrawal', async (req, res) => {
    const { user_id, amount, accountno } = req.body;
    console.log("req.body", req.body)
    const checkAccountQuery = 'SELECT * FROM bank_accounts WHERE user_id = ? AND accountno = ?';
    db.query(checkAccountQuery, [user_id, accountno], (error, accountResults) => {
        if (error) {
            console.error('Error checking bank account:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        console.log("accountResults", accountResults)
        if (accountResults.length === 0) {
            return res.status(400).json({ success: 0, message: 'Bank account not found for the user' });
        }

        const { ifsccode, upiid, bank_name, holder_name } = accountResults[0];
        const checkWithdrawalQuery = 'SELECT * FROM withdrawals WHERE user_id = ? AND accountno = ?';
        db.query(checkWithdrawalQuery, [user_id, accountno], (error, withdrawalResults) => {
            if (error) {
                console.error('Error checking withdrawal request:', error);
                return res.status(500).json({ success: 0, message: 'Internal server error' });
            }
            console.log("withdrawalResults", withdrawalResults)

            if (withdrawalResults.length > 0) {
                // There is already a pending or unprocessed withdrawal request for this account
                return res.json({ success: 0, message: 'There is already a pending or unprocessed withdrawal request for this account' });
            }
            const withdrawalQuery = 'INSERT INTO withdrawals (user_id, amount, status, accountno, ifsccode, holder_name, upiid, bank_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
            db.query(withdrawalQuery, [user_id, amount, 'pending', accountno, ifsccode, holder_name, upiid, bank_name], (error, results) => {
                if (error) {
                    console.error('Error creating withdrawal request:', error);
                    return res.json({ success: 0, message: 'Internal server error' });
                }

                if (results.affectedRows) {
                    return res.status(201).json({ status: "success", message: "Withdrawal request created successfully" });
                } else {
                    return res.json({ status: "error", message: "Failed to create withdrawal request" });
                }
            });
        });
    });
});




// Add Bank Account
app.post('/add-bank-account', async (req, res) => {
    console.log("req.body", req.body)
    const { user_id, accountno, ifsccode, username, bankName, upiid } = req.body; // Assuming you send these values in the request body
    try {
        // Insert the bank account details into the database
        const bankAccountQuery = 'INSERT INTO bank_accounts (user_id, accountno, ifsccode, holder_name, bank_name, upiID) VALUES (?, ?, ?, ?, ?, ?)';
        db.query(bankAccountQuery, [user_id, accountno, ifsccode, username, bankName, upiid], (error, results) => {
            if (error) {
                console.error('Error adding bank account:', error);
                return res.status(500).json({ success: false, message: 'Internal server error' });
            }

            if (results.affectedRows) {
                return res.status(201).json({ status: "success", message: "Bank account added successfully" });
            } else {
                return res.status(200).json({ status: "error", message: "Failed to add bank account" });
            }
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
});

// Get Pending Withdrawal Requests
app.get('/get-bank-account', async (req, res) => {
    console.log("req.body ---------------------> ", req.query)
    const { user_id } = req.query;
    try {
        // Fetch the list of pending withdrawal requests from the database
        const sql = 'SELECT * FROM bank_accounts WHERE user_id = ?';
        db.query(sql, [user_id], (err, results) => {
            if (err) {
                console.error('Error fetching pending withdrawal requests:', err);
                return res.status(500).json({ error: 'Error fetching pending withdrawal requests' });
            } else {
                console.log("first", results)
                res.json(results);
            }
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});


// Get Pending Withdrawal Requests
app.get('/pending-withdrawals', async (req, res) => {
    try {
        // Fetch the list of pending withdrawal requests from the database
        const sql = 'SELECT * FROM withdrawals WHERE status = ?';
        db.query(sql, ['pending'], (err, results) => {
            if (err) {
                console.error('Error fetching pending withdrawal requests:', err);
                return res.status(500).json({ error: 'Error fetching pending withdrawal requests' });
            } else {
                res.json(results);
            }
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});


// Reject Withdrawal Request
app.post('/reject-withdrawal', async (req, res) => {
    const { withdrawalId } = req.body; // Assuming you send the withdrawal ID in the request body

    try {
        // Update the status of the withdrawal request to 'rejected' in the database
        const updateQuery = 'UPDATE withdrawals SET status = ? WHERE id = ?';
        db.query(updateQuery, ['rejected', withdrawalId], (err, results) => {
            if (err) {
                console.error('Error rejecting withdrawal request:', err);
                return res.status(500).json({ error: 'Error rejecting withdrawal request' });
            }

            if (results.affectedRows > 0) {
                return res.status(200).json({ status: 'success', message: 'Withdrawal request rejected' });
            } else {
                return res.status(404).json({ status: 'error', message: 'Withdrawal request not found' });
            }
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});



// Complete Withdrawal Request
app.post('/complete-withdrawal', async (req, res) => {
    const { id, amount, user_id } = req.body;
    console.log("req.query", req.body)
    try {
        const query = 'SELECT wallet FROM wallet WHERE user_id = ?';
        db.query(query, [user_id], async (err, results) => {
            if (err) {
                console.error('Error querying wallet:', err);
                return res.status(500).json({ error: 'Failed to fetch wallet balance' });
            }

            if (results.length === 0) {
                return res.status(404).json({ status: 'error', message: 'Wallet not found' });
            }

            const wallet = results[0].wallet;
            console.log("wallet---------------------> ", typeof (wallet))
            const updatedAmount = wallet - amount;
            const description = `Rs.${amount}/ withdrawal for Account verification`;
            await db.query('INSERT INTO withdrawal_history (unique_id, amount, type, description, closing_balance, status) VALUES (?, ?, ?, ?, ?, ?)',
                [user_id, amount, "withdrawal", description, updatedAmount, "Success"]
            );
            await db.query('UPDATE wallet SET wallet = ? WHERE user_id = ?', [updatedAmount, user_id]);

            const updateQuery = 'UPDATE withdrawals SET status = ? WHERE id = ?';
            db.query(updateQuery, ['completed', id], (err, results) => {
                if (err) {
                    console.error('Error completing withdrawal request:', err);
                    return res.status(500).json({ error: 'Error completing withdrawal request' });
                }
                if (results.affectedRows > 0) {
                    return res.status(200).json({ status: 'success', message: 'Withdrawal request completed' });
                } else {
                    return res.status(404).json({ status: 'error', message: 'Withdrawal request not found' });
                }
            });
        })

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});



app.get('/next-time', (req, res) => {
    const query = 'SELECT nextTime, periods FROM timer';
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
            const periods = results[0].periods;
            res.json({ nextTime, periods });
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



app.get('/get_number_list', (req, res) => {
    const { user_id, nextPeriods } = req.query;
    const sqlSelect = 'SELECT number FROM `numbers` WHERE periods = ? AND user_id = ?'; // Replace 'number_column' with the actual name of the column containing the numbers
    db.query(sqlSelect, [nextPeriods, user_id], (err, result) => {
        if (err) {
            console.error('Error fetching numbers:', err);
            res.status(500).json({ error: 'Error fetching numbers' });
        } else {
            const numbers = result.map(row => row.number); // Replace 'number_column' with the actual name of the column containing the numbers
            console.log("Numbers:", numbers);
            res.status(201).json({ message: 'Latest numbers', data: numbers });
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

// Define a function for sending the OTP email
const sendOTPEmail = async (userEmail, otp) => {
    const transporter = nodemailer.createTransport({
        host: 'progame.co.in',
        port: 465,
        secure: true,
        auth: {
            user: 'progame@progame.co.in',
            pass: 'oMHO%k0_Nq6U',
        },
    });

    const signUpHtml = await signUpMail(otp);

    const mailOptions = {
        from: 'progame@progame.co.in',
        to: userEmail,
        subject: 'OTP Verification',
        text: 'Your OTP is ' + otp,
        html: signUpHtml,
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                reject(error);
            } else {
                resolve({ status: 'email sent' });
            }
        });
    });
};

// Update your route handler to use the sendOTPEmail function
app.get('/mail-verify', async (req, res) => {
    const userEmail = req.query.userEmail;

    try {
        const otp = 12345
        await sendOTPEmail(userEmail, otp);
        res.json({ status: 1, message: 'Mail sent successfully' });
    } catch (error) {
        res.json({ status: 0, message: 'Email sent error', error });
    }
});



// app.get('/mail-verifiy', async (req, res) => {
//     console.log("first, ", req.query.userEmail)
//     const userEmail = req.query.userEmail;
//     var otp = Math.floor(1000 + Math.random() * 9000)
//     console.log("random", otp)
//     const transporter = nodemailer.createTransport({
//         host: 'theoceanart.jassinfotech.in',
//         port: 465,
//         secure: true,
//         auth: {
//             user: 'theoceanart@theoceanart.jassinfotech.in',
//             pass: '}#Oey(5H}3zU',
//         },
//     });
//     let signUpHtml = await signUpMail(otp)
//     const mailOptions = {
//         from: 'theoceanart@theoceanart.jassinfotech.in',
//         to: userEmail,
//         subject: 'OTP Verification',
//         text: 'Your OTP is ' + otp,
//         html: signUpHtml,
//     };

//     transporter.sendMail(mailOptions, (error, info) => {
//         if (error) {
//             console.log(error);
//             res.json(`Email sent error : ${error}`)
//         } else {
//             let time = new Date()
//             var expiresIn = new Date().getTime() + 86400000
//             connection.query('INSERT INTO otpverify SET  userEmail = ?, time = ?, expiresIn = ?, otp = ?', [userEmail, time, expiresIn, otp], function (err, results, fields) {
//                 if (err) {
//                     res.json(err);
//                 } else {
//                     res.json({ 'status': 1, message: "Mail send link" })
//                 }

//             })

//         }
//     });
// })


function generateRandomOTP() {
    // Generate a 6-digit random OTP
    return Math.floor(1000 + Math.random() * 9000);
}












app.get('/', (req, res) => {

    res.json("working now");
});





app.listen(port, () => {
    console.log(`Server is  and update time running on port ${port}`);
});
