const signUpMail = async (otp) => {
    let html = `
        <html>
        <head>
            <style>
                body {
                    background-color: #f2f2f2;
                    margin: 0;
                    font-family: Arial, sans-serif;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #ffffff;
                }
                .header {
                    text-align: center;
                }
                .otp {
                    font-size: 28px;
                    font-weight: bold;
                    margin-top: 20px;
                    text-align: center;
                    color: #ffc107;
                 
                }
                .message {
                    font-size: 16px;
                    text-align: center;
                    margin-top: 20px;
                }
                .list {
                    margin-top: 20px;
                }
                .list-item {
                    margin-bottom: 10px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Verify Your Account</h1>
                </div>
                <div class="otp">
                    Your OTP: ${otp}
                </div>
                <div class="message">
                    <p><strong>MAKE SAFETY YOUR PRIORITY</strong></p>
                    <p>BE SAFE WITH.</p>
                </div>
                <div class="list">
                    <p><strong>Ensure circumspection by:</strong></p>
                    <ul>
                        <li class="list-item">Not sharing passwords with anyone.</li>
                        <li class="list-item">Not making phone calls to any number claiming to be  Support.</li>
                        <li class="list-item">Enabling Two-factor authentication with Google.</li>
                        <li class="list-item">Not sending money to anyone who claims to be a part of   never asks for money for any purpose.</li>
                    </ul>
                </div>
            </div>
        </body>
        </html>
    `;

    return html;
};

module.exports = signUpMail;
