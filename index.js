require('dotenv').config()
const express = require('express');
const app = express();
const cors = require('cors');
const emailScrape = require('./routes/emailScrapeRoute');
const path = require('path');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
// const io = new Server(server, {
//     // cors: { origin: "https://email-scraper-frontend-seven.vercel.app" } 
//     cors: { origin: "http://localhost:5174" } 
// });
const io = new Server(server, {
    cors: { origin: "http://localhost:5174" },
    methods: ["GET", "POST"],
    pingTimeout: 60000, // 1 minute tak wait karega agar data nahi aaya toh disconnect nahi hoga
    pingInterval: 25000
});

// const io = new Server(server, {
//     cors: {
//         origin: "https://email-scraper-frontend-seven.vercel.app",
//         methods: ["GET", "POST"],
//         pingTimeout: 60000, // 1 minute tak wait karega agar data nahi aaya toh disconnect nahi hoga
//         pingInterval: 25000
//     }
// });

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

app.set('socketio', io);

// app.listen(PORT, () => {
//     console.log(`Server is running http://localhost:${PORT}`);
// });

server.listen(PORT, () => {
    console.log(`Server is running ${process.env.BACKENd_URL}`);
});
// app.timeout = 600000; // 10 minute ka timeout (milliseconds mein)
server.timeout = 0;
server.keepAliveTimeout = 60000 * 2;