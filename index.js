require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const emailScrape = require('./routes/emailScrapeRoute');
const path = require('path');
const morgan = require('morgan');




app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }))
app.use(morgan('dev'));

app.use('/results', express.static(path.join(__dirname, 'results')));

const PORT = process.env.PORT || 3000;

app.use('/api', emailScrape)


app.get('/', (req, res) => {
    res.send('Hello World!');
});

// app.listen(PORT, () => {
//     console.log(`Server is running http://localhost:${PORT}`);
// });

app.listen(PORT, () => {
    console.log(`Server is running ${process.env.BACKENd_URL}`);
});
app.timeout = 600000; // 10 minute ka timeout (milliseconds mein)