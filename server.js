// import express from 'express';
// import dotenv from 'dotenv';
// dotenv.config();
// import outboundRoutes from './routes/outbound.js';
// import voiceRoutes from './routes/voiceRoutes.js';
// import connectDB from './config/db.js';

// const app = express();
// const PORT = process.env.PORT || 3000;

// console.log('🚀 Starting server...');
// console.log('TWILIO_WEBHOOK_URL:', process.env.TWILIO_WEBHOOK_URL);
// console.log('PORT:', PORT);

// // REQUIRED — Twilio sends POST data as URL-encoded form, not JSON
// app.use(express.urlencoded({ extended: false }));

// // Also add JSON parser for your /call REST endpoint
// app.use(express.json());

// app.use('/outbound', outboundRoutes);
// app.use('/voice', voiceRoutes);

// // Routes
// app.get('/', (req, res) => {
//     res.json({ message: 'Server is running' });
// });

// // Health check
// app.get('/health', (req, res) => {
//   res.json({ 
//     status: 'ok',
//     timestamp: new Date().toISOString(),
//     webhookUrl: process.env.TWILIO_WEBHOOK_URL
//   });
// });

// await connectDB();  // Connect to MongoDB before starting the server

// // Start server
// app.listen(PORT, () => {
//     console.log(`✅ Server is running on port ${PORT}`);
//     console.log(`📞 Webhook URL: ${process.env.TWILIO_WEBHOOK_URL}`);
// });






import express from "express";
import dotenv from "dotenv";
dotenv.config();

import outboundRoutes from "./routes/outbound.js";
import voiceRoutes from "./routes/voiceRoutes.js";
import connectDB from "./config/db.js";

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting server...');
console.log('📞 TWILIO_WEBHOOK_URL:', process.env.TWILIO_WEBHOOK_URL);
console.log('🔌 PORT:', PORT);

// ✅ MIDDLEWARE
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ✅ ROUTES - Mount without path prefix
app.use('/outbound', outboundRoutes);   // ✅ /outbound/call
app.use('/voice', voiceRoutes);         // ✅ /voice (root for voice routes)

// ✅ HEALTH CHECK
app.get('/', (req, res) => {
  res.json({ message: '✅ Server is running' });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    webhookUrl: process.env.TWILIO_WEBHOOK_URL
  });
});

// ✅ CONNECT DB & START
(async () => {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');

    app.listen(PORT, () => {
      console.log(`\n✅ Server running on port ${PORT}`);
      console.log(`📞 Webhook URL: ${process.env.TWILIO_WEBHOOK_URL}/voice`);
      console.log(`📞 Process URL: ${process.env.TWILIO_WEBHOOK_URL}/voice/process`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();