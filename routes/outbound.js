// import express from 'express';
// import twilio from 'twilio';
// import Call from '../models/Call.js';
// import dotenv from 'dotenv';

// dotenv.config();

// const router = express.Router();

// /**
//  * Create Twilio client
//  */
// const getTwilioClient = () => {
//   if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
//     throw new Error('Twilio credentials missing');
//   }

//   return twilio(
//     process.env.TWILIO_ACCOUNT_SID,
//     process.env.TWILIO_AUTH_TOKEN
//   );
// };

// // ✅ Validate phone number to E.164 format
// function formatPhoneNumber(phone) {
//   if (!phone) return null;
  
//   // If already E.164
//   if (phone.startsWith('+')) return phone;
  
//   // Remove non-digits
//   const cleaned = phone.replace(/\D/g, '');
  
//   // If 10 digits, add +91 (India)
//   if (cleaned.length === 10) return `+91${cleaned}`;
  
//   // If 12 digits, add +
//   if (cleaned.length === 12) return `+${cleaned}`;
  
//   // Default fallback
//   return `+91${cleaned}`;
// }

// /**
//  * POST /outbound/call
//  * Create outbound call with customer data
//  * 
//  * Request body:
//  * {
//  *   "to": "+918882374849",
//  *   "customerName": "Ramesh Sharma",
//  *   "machineModel": "JCB 3DX",
//  *   "machineNumber": "RJ14AB1234",
//  *   "serviceType": "500 Hour Service",
//  *   "dueDate": "2026-02-28"
//  * }
//  */
// router.post('/call', async (req, res) => {
//   try {
//     console.log('\n' + '='.repeat(70));
//     console.log('📞 [OUTBOUND] New call request');
//     console.log('='.repeat(70));
//     console.log('Body:', req.body);

//     // ✅ VALIDATE REQUEST
//     const { to, customerName, machineModel, machineNumber, serviceType, dueDate } = req.body;

//     if (!to) {
//       console.error('❌ Missing: to (phone number)');
//       return res.status(400).json({ 
//         error: 'Missing required field: to (phone number)' 
//       });
//     }

//     const requiredFields = ['customerName', 'machineModel', 'machineNumber', 'serviceType', 'dueDate'];
//     const missingFields = requiredFields.filter(field => !req.body[field]);

//     if (missingFields.length > 0) {
//       console.error(`❌ Missing fields: ${missingFields.join(', ')}`);
//       return res.status(400).json({
//         error: `Missing required fields: ${missingFields.join(', ')}`
//       });
//     }

//     // ✅ FORMAT PHONE NUMBER
//     const formattedPhone = formatPhoneNumber(to);
//     console.log(`✅ Phone formatted: ${to} → ${formattedPhone}`);

//     // ✅ CREATE CALL DOCUMENT IN DATABASE
//     console.log('\n💾 Creating call document in MongoDB...');

//     const callDoc = new Call({
//       callSid: 'pending', // Will be updated with Twilio SID
//       customerPhone: formattedPhone,
//       customerName: customerName.trim(),
//       machineModel: machineModel.trim(),
//       machineNumber: machineNumber.trim(),
//       serviceType: serviceType.trim(),
//       dueDate: new Date(dueDate),
//       status: 'initiated',
//       outcome: 'pending',
//       booking: {},
//       messages: []
//     });

//     try {
//       await callDoc.save();
//       console.log(`✅ Call document created in DB`);
//       console.log(`   Document ID: ${callDoc._id}`);
//       console.log(`   Customer: ${callDoc.customerName}`);
//       console.log(`   Machine: ${callDoc.machineModel} (${callDoc.machineNumber})`);
//     } catch (dbError) {
//       console.error(`❌ Database error:`, dbError.message);
//       return res.status(500).json({
//         error: 'Failed to save call to database',
//         details: dbError.message
//       });
//     }

//     // ✅ CREATE TWILIO CALL
//     console.log('\n📞 Creating Twilio outbound call...');

//     if (!process.env.TWILIO_PHONE_NUMBER) {
//       console.error('❌ TWILIO_PHONE_NUMBER not configured');
//       return res.status(500).json({
//         error: 'Server configuration error: TWILIO_PHONE_NUMBER not set'
//       });
//     }

//     if (!process.env.TWILIO_WEBHOOK_URL) {
//       console.error('❌ TWILIO_WEBHOOK_URL not configured');
//       return res.status(500).json({
//         error: 'Server configuration error: TWILIO_WEBHOOK_URL not set'
//       });
//     }

//     let twilioCall;
//     try {
//       const client = getTwilioClient();

//       twilioCall = await client.calls.create({
//         to: formattedPhone,
//         from: process.env.TWILIO_PHONE_NUMBER,
//         url: `${process.env.TWILIO_WEBHOOK_URL}/voice`,
//         method: 'POST',
//         record: true // Optional: record call
//       });

//       console.log(`✅ Twilio call created successfully`);
//       console.log(`   Call SID: ${twilioCall.sid}`);
//       console.log(`   Status: ${twilioCall.status}`);
//       console.log(`   From: ${twilioCall.from}`);
//       console.log(`   To: ${twilioCall.to}`);
//     } catch (twilioError) {
//       console.error(`❌ Twilio error:`, twilioError.message);
      
//       // Delete the call document since Twilio call failed
//       try {
//         await Call.deleteOne({ _id: callDoc._id });
//         console.log(`   Cleaned up: Deleted call document from DB`);
//       } catch (cleanupError) {
//         console.warn(`   Cleanup warning: ${cleanupError.message}`);
//       }

//       return res.status(500).json({
//         error: 'Failed to create Twilio call',
//         details: twilioError.message
//       });
//     }

//     // ✅ UPDATE CALL DOCUMENT WITH TWILIO SID
//     console.log('\n💾 Updating call document with Twilio SID...');

//     try {
//       callDoc.callSid = twilioCall.sid;
//       callDoc.callStartedAt = new Date();
//       await callDoc.save();
//       console.log(`✅ Call document updated`);
//       console.log(`   CallSid: ${callDoc.callSid}`);
//     } catch (updateError) {
//       console.error(`❌ Error updating call document:`, updateError.message);
//       return res.status(500).json({
//         error: 'Call created but failed to update database',
//         details: updateError.message,
//         callSid: twilioCall.sid
//       });
//     }

//     // ✅ RETURN SUCCESS RESPONSE
//     console.log('\n✅ [OUTBOUND] Call request completed successfully\n');

//     return res.json({
//       success: true,
//       message: 'Call initiated successfully',
//       callSid: twilioCall.sid,
//       callId: callDoc._id.toString(),
//       customer: {
//         name: callDoc.customerName,
//         phone: callDoc.customerPhone,
//         machine: {
//           model: callDoc.machineModel,
//           number: callDoc.machineNumber
//         },
//         service: {
//           type: callDoc.serviceType,
//           dueDate: callDoc.dueDate
//         }
//       }
//     });

//   } catch (error) {
//     console.error(`\n❌ [OUTBOUND] Unhandled error:`, error.message);
//     console.error(`   Stack:`, error.stack);

//     return res.status(500).json({
//       error: 'Server error',
//       details: error.message
//     });
//   }
// });

// /**
//  * GET /outbound/status/:callSid
//  * Check status of a call
//  */
// router.get('/status/:callSid', async (req, res) => {
//   try {
//     const { callSid } = req.params;

//     console.log(`\n📊 [STATUS] Checking call: ${callSid}`);

//     const callDoc = await Call.findOne({ callSid });

//     if (!callDoc) {
//       console.error(`❌ Call not found: ${callSid}`);
//       return res.status(404).json({ error: 'Call not found' });
//     }

//     console.log(`✅ Call found`);

//     return res.json({
//       callSid: callDoc.callSid,
//       status: callDoc.status,
//       outcome: callDoc.outcome,
//       customer: callDoc.customerName,
//       machine: `${callDoc.machineModel} (${callDoc.machineNumber})`,
//       booking: callDoc.booking,
//       duration: callDoc.callDurationSeconds,
//       turns: callDoc.totalTurns,
//       messages: callDoc.messages.length
//     });

//   } catch (error) {
//     console.error('Error fetching call status:', error.message);
//     return res.status(500).json({ error: error.message });
//   }
// });

// /**
//  * GET /outbound/calls
//  * Get all calls
//  */
// router.get('/calls', async (req, res) => {
//   try {
//     const calls = await Call.find()
//       .select('callSid customerName machineModel outcome status createdAt')
//       .sort({ createdAt: -1 })
//       .limit(50);

//     return res.json({
//       total: calls.length,
//       calls: calls.map(c => ({
//         callSid: c.callSid,
//         customer: c.customerName,
//         machine: c.machineModel,
//         status: c.status,
//         outcome: c.outcome,
//         createdAt: c.createdAt
//       }))
//     });
//   } catch (error) {
//     console.error('Error fetching calls:', error.message);
//     return res.status(500).json({ error: error.message });
//   }
// });

// export default router;






import express from 'express';
import twilio from 'twilio';
import Call from '../models/Call.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

/**
 * ✅ Initialize Twilio client
 */
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials missing (TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN)');
  }

  return twilio(accountSid, authToken);
};

/**
 * ✅ Format phone number to E.164 format
 * Handles: 10 digit (Indian), 12 digit, +91 format, etc.
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Already in E.164 format
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, '');
  
  // 10 digits = add +91 (India)
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  
  // 12 digits = add +
  if (cleaned.length === 12) {
    return `+${cleaned}`;
  }

  // Default: assume India with +91
  return `+91${cleaned}`;
}

/**
 * ✅ Validate request payload
 */
function validateCallRequest(body) {
  const errors = [];

  if (!body.to) {
    errors.push('Missing required field: to (phone number)');
  } else if (typeof body.to !== 'string') {
    errors.push('Field "to" must be a string');
  }

  if (!body.customerName) {
    errors.push('Missing required field: customerName');
  } else if (typeof body.customerName !== 'string') {
    errors.push('Field "customerName" must be a string');
  }

  if (!body.machineModel) {
    errors.push('Missing required field: machineModel');
  } else if (typeof body.machineModel !== 'string') {
    errors.push('Field "machineModel" must be a string');
  }

  if (!body.machineNumber) {
    errors.push('Missing required field: machineNumber');
  } else if (typeof body.machineNumber !== 'string') {
    errors.push('Field "machineNumber" must be a string');
  }

  if (!body.serviceType) {
    errors.push('Missing required field: serviceType');
  } else if (typeof body.serviceType !== 'string') {
    errors.push('Field "serviceType" must be a string');
  }

  if (!body.dueDate) {
    errors.push('Missing required field: dueDate');
  } else {
    try {
      new Date(body.dueDate);
    } catch {
      errors.push('Field "dueDate" must be a valid date');
    }
  }

  return errors;
}

/**
 * POST /outbound/call
 * Initiate an outbound call with customer data
 * 
 * Request body:
 * {
 *   "to": "+918882374849",
 *   "customerName": "Ramesh Sharma",
 *   "machineModel": "JCB 3DX",
 *   "machineNumber": "RJ14AB1234",
 *   "serviceType": "500 Hour Service",
 *   "dueDate": "2026-02-28"
 * }
 */
router.post('/call', async (req, res) => {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('📞 [OUTBOUND] New call initiation request');
    console.log('='.repeat(70));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // ✅ VALIDATE REQUEST
    const validationErrors = validateCallRequest(req.body);
    if (validationErrors.length > 0) {
      console.error('❌ Validation errors:');
      validationErrors.forEach(err => console.error(`   - ${err}`));
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validationErrors
      });
    }

    const { to, customerName, machineModel, machineNumber, serviceType, dueDate } = req.body;

    // ✅ FORMAT PHONE NUMBER
    const formattedPhone = formatPhoneNumber(to);
    console.log(`✅ Phone formatted: ${to} → ${formattedPhone}`);

    if (!formattedPhone) {
      console.error('❌ Invalid phone number format');
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format'
      });
    }

    // ✅ CREATE CALL DOCUMENT IN MONGODB
    console.log('\n💾 Creating call document in MongoDB...');

    const callDoc = new Call({
      callSid: 'pending',
      customerPhone: formattedPhone,
      customerName: customerName.trim(),
      machineModel: machineModel.trim(),
      machineNumber: machineNumber.trim(),
      machineType: 'JCB',
      serviceType: serviceType.trim(),
      dueDate: new Date(dueDate),
      status: 'initiated',
      outcome: 'pending',
      booking: {},
      messages: [],
      totalTurns: 0
    });

    let savedCall;
    try {
      savedCall = await callDoc.save();
      console.log(`✅ Call document created in MongoDB`);
      console.log(`   Document ID: ${savedCall._id}`);
      console.log(`   Customer: ${savedCall.customerName}`);
      console.log(`   Machine: ${savedCall.machineModel} (${savedCall.machineNumber})`);
    } catch (dbError) {
      console.error(`❌ MongoDB error:`, dbError.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to save call to database',
        details: dbError.message
      });
    }

    // ✅ VALIDATE TWILIO CONFIGURATION
    if (!process.env.TWILIO_PHONE_NUMBER) {
      console.error('❌ TWILIO_PHONE_NUMBER not configured');
      // Cleanup: delete the call document
      await Call.deleteOne({ _id: savedCall._id });
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: TWILIO_PHONE_NUMBER not set'
      });
    }

    if (!process.env.TWILIO_WEBHOOK_URL) {
      console.error('❌ TWILIO_WEBHOOK_URL not configured');
      // Cleanup: delete the call document
      await Call.deleteOne({ _id: savedCall._id });
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: TWILIO_WEBHOOK_URL not set'
      });
    }

    // ✅ CREATE TWILIO CALL
    console.log('\n📞 Creating Twilio outbound call...');

    let twilioCall;
    try {
      const client = getTwilioClient();

      twilioCall = await client.calls.create({
        to: formattedPhone,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${process.env.TWILIO_WEBHOOK_URL}/voice`,
        method: 'POST',
        record: true,
        timeout: 30,
        statusCallback: `${process.env.TWILIO_WEBHOOK_URL}/outbound/status?callId=${savedCall._id}`,
        statusCallbackMethod: 'POST'
      });

      console.log(`✅ Twilio call created successfully`);
      console.log(`   Call SID: ${twilioCall.sid}`);
      console.log(`   Status: ${twilioCall.status}`);
      console.log(`   From: ${twilioCall.from}`);
      console.log(`   To: ${twilioCall.to}`);

    } catch (twilioError) {
      console.error(`❌ Twilio API error:`, twilioError.message);
      
      // Cleanup: delete the call document
      try {
        await Call.deleteOne({ _id: savedCall._id });
        console.log(`   Cleanup: Deleted call document from database`);
      } catch (cleanupError) {
        console.warn(`   Cleanup warning: ${cleanupError.message}`);
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create Twilio call',
        details: twilioError.message
      });
    }

    // ✅ UPDATE CALL DOCUMENT WITH TWILIO SID
    console.log('\n💾 Updating call document with Twilio SID...');

    try {
      savedCall.callSid = twilioCall.sid;
      savedCall.callStartedAt = new Date();
      await savedCall.save();
      console.log(`✅ Call document updated`);
      console.log(`   CallSid: ${savedCall.callSid}`);
    } catch (updateError) {
      console.error(`❌ Error updating call document:`, updateError.message);
      return res.status(500).json({
        success: false,
        error: 'Call created but failed to update database',
        details: updateError.message,
        callSid: twilioCall.sid
      });
    }

    // ✅ SUCCESS RESPONSE
    console.log('\n✅ [OUTBOUND] Call initiated successfully\n');

    return res.json({
      success: true,
      message: 'Call initiated successfully',
      callSid: twilioCall.sid,
      callId: savedCall._id.toString(),
      customer: {
        name: savedCall.customerName,
        phone: savedCall.customerPhone,
        machine: {
          model: savedCall.machineModel,
          number: savedCall.machineNumber
        },
        service: {
          type: savedCall.serviceType,
          dueDate: savedCall.dueDate
        }
      }
    });

  } catch (error) {
    console.error(`\n❌ [OUTBOUND] Unhandled error:`, error.message);
    console.error(`   Stack:`, error.stack);

    return res.status(500).json({
      success: false,
      error: 'Server error',
      details: error.message
    });
  }
});

/**
 * GET /outbound/status/:callSid
 * Check status of a specific call
 */
router.get('/status/:callSid', async (req, res) => {
  try {
    const { callSid } = req.params;

    console.log(`\n📊 [STATUS] Checking call: ${callSid}`);

    const callDoc = await Call.findOne({ callSid });

    if (!callDoc) {
      console.error(`❌ Call not found: ${callSid}`);
      return res.status(404).json({ 
        success: false,
        error: 'Call not found',
        callSid
      });
    }

    console.log(`✅ Call found`);

    return res.json({
      success: true,
      callSid: callDoc.callSid,
      status: callDoc.status,
      outcome: callDoc.outcome,
      customer: callDoc.customerName,
      machine: `${callDoc.machineModel} (${callDoc.machineNumber})`,
      booking: callDoc.booking,
      metrics: callDoc.getCallMetrics()
    });

  } catch (error) {
    console.error('❌ Error fetching call status:', error.message);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /outbound/calls
 * Get all calls with pagination
 */
router.get('/calls', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    console.log(`\n📊 [LIST] Fetching calls (page ${page}, limit ${limit})`);

    const calls = await Call.find()
      .select('callSid customerName machineModel outcome status createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Call.countDocuments();

    console.log(`✅ Found ${calls.length} calls`);

    return res.json({
      success: true,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      calls: calls.map(c => ({
        callSid: c.callSid,
        customer: c.customerName,
        machine: c.machineModel,
        status: c.status,
        outcome: c.outcome,
        createdAt: c.createdAt
      }))
    });

  } catch (error) {
    console.error('❌ Error fetching calls:', error.message);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * GET /outbound/statistics
 * Get call statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    console.log(`\n📊 [STATS] Calculating call statistics`);

    const stats = await Call.getStatistics();

    console.log(`✅ Statistics calculated`);

    return res.json({
      success: true,
      statistics: stats[0] || {
        totalCalls: 0,
        completedCalls: 0,
        confirmedBookings: 0,
        failedCalls: 0,
        averageDuration: 0,
        averageTurns: 0
      }
    });

  } catch (error) {
    console.error('❌ Error calculating statistics:', error.message);
    return res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;