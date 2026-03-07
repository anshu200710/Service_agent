import express from 'express';
import twilio from 'twilio';
import Call from '../models/Call.js';
import { getAIResponse, matchServiceCenter, parseDate, generateGoogleTTS } from '../utils/aiAgent.js';

const router = express.Router();

// ✅ NEW ROUTE: Serve generated Google TTS on the fly
router.get('/tts', async (req, res) => {
  try {
    const text = req.query.text;
    if (!text) return res.status(400).send('Text is required');

    const audioContent = await generateGoogleTTS(text);
    if (!audioContent) {
      return res.status(500).send('Error generating TTS');
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioContent.length
    });
    res.send(audioContent);
  } catch (err) {
    console.error('Error in /tts route:', err);
    res.status(500).send('Server error');
  }
});

// ✅ VOICE SETTINGS - Clear, Warm, Female, Understandable
const VOICE_CONFIG = {
  language: 'hi-IN',
  voice: 'Polly.Aditi',
  engine: 'neural',
  speechRate: '0.85'  // Fallback only
};

// ✅ HELPER: Speak with improved clarity - Using Google TTS
async function sayWithClarity(twimlNode, text, isGather = false) {
  // Format text, stripping out JSON parts or weird characters
  let cleanText = text;
  const stateMatch = cleanText.match(/BOOKING_STATE:\s*(\{[\s\S]*?\})/);
  if (stateMatch) {
    cleanText = cleanText.split('BOOKING_STATE:')[0].trim();
  }
  cleanText = cleanText.replace(/<[^>]*>?/gm, '').replace(/\*/g, '').trim();

  try {
    // Generate text URL for Twilio to load the MP3 stream on the fly
    console.log(`🎙️ Using Google TTS...`);
    const encodedText = encodeURIComponent(cleanText);
    
    // Check if within Twilio URL length limit safely, Twilio handles up to 2048 chars easily
    const audioUrl = `/voice/tts?text=${encodedText}`;
    
    twimlNode.play(audioUrl); 
    return;
  } catch (error) {
    console.warn(`⚠️  Google TTS generation failed, falling back to Polly:`, error.message);
  }

  // ✅ FALLBACK: Use Polly if Google TTS fails unexpectedly
  console.log(`📢 Falling back to Polly.Aditi`);
  if (isGather) {
    twimlNode.say(cleanText, VOICE_CONFIG);
  } else {
    twimlNode.say(cleanText, VOICE_CONFIG);
  }
}

// ✅ HELPER: Send error TwiML response with clear voice
function sendErrorTwiml(res, message) {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(message, VOICE_CONFIG);
  twiml.hangup();
  return res.type('text/xml').send(twiml.toString());
}

/**
 * POST /voice
 * Initial webhook when customer answers the call
 * This is STEP 1 in the call flow
 */
router.post('/', async (req, res) => {
  try {
    const { CallSid } = req.body;

    console.log('\n' + '='.repeat(70));
    console.log(`📞 [VOICE] STEP 1: Initial call answered`);
    console.log(`   CallSid: ${CallSid}`);
    console.log(`   TTS Engine: 🎙️ Google TTS + Polly fallback`);
    console.log('='.repeat(70));

    if (!CallSid) {
      console.error('❌ Missing CallSid in request');
      return sendErrorTwiml(res, 'System error. Call failed.');
    }

    // ✅ FETCH CALL FROM DATABASE
    console.log('💾 Fetching call record from database...');
    const callDoc = await Call.findOne({ callSid: CallSid });

    if (!callDoc) {
      console.error(`❌ Call not found in database: ${CallSid}`);
      return sendErrorTwiml(res, 'Call information not found. Please try again.');
    }

    console.log(`✅ Call found in database`);
    console.log(`   Customer: ${callDoc.customerName}`);
    console.log(`   Machine: ${callDoc.machineModel} (${callDoc.machineNumber})`);
    console.log(`   Service Type: ${callDoc.serviceType}`);

    // ✅ UPDATE CALL STATUS
    callDoc.status = 'in_progress';
    callDoc.callStartedAt = new Date();
    callDoc.totalTurns = 0;
    callDoc.messages = [];
    await callDoc.save();

    console.log(`✅ Call status updated to 'in_progress'`);

    // ✅ GET AI GREETING (first message, turn = 0)
    console.log(`\n🤖 Generating AI greeting...`);
    const aiResponse = await getAIResponse([], {
      customerName: callDoc.customerName,
      customerPhone: callDoc.customerPhone,
      machineModel: callDoc.machineModel,
      machineNumber: callDoc.machineNumber,
      machineType: callDoc.machineType,
      serviceType: callDoc.serviceType,
      dueDate: callDoc.dueDate
    }, 0);

    if (!aiResponse || !aiResponse.text) {
      console.error('❌ AI response is empty');
      return sendErrorTwiml(res, 'AI service error. Please try again later.');
    }

    console.log(`✅ AI greeting generated`);
    console.log(`   Text: "${aiResponse.text.substring(0, 70)}..."`);

    // ✅ SAVE AI GREETING TO DATABASE
    callDoc.messages.push({
      role: 'assistant',
      text: aiResponse.text,
      timestamp: new Date()
    });
    await callDoc.save();
    console.log(`✅ Greeting saved to database`);

    // ✅ BUILD TWIML RESPONSE WITH GATHER
    const twiml = new twilio.twiml.VoiceResponse();
    const gather = twiml.gather({
      input: 'speech',
      language: 'hi-IN',
      speechTimeout: 'auto', // Stop recording instantly after they finish speaking
      timeout: 5,           // Reduced wait time for initial input
      action: `/voice/process?callSid=${CallSid}`,
      method: 'POST',
      maxSpeechTime: 15,    // Max allowed speech duration
      numDigits: 1
    });

    // ✅ USE ELEVENLABS FOR GREETING
    await sayWithClarity(gather, aiResponse.text, true);

    console.log(`📤 Sending TwiML gather response to Twilio`);
    console.log(`   Voice: 🎙️ Google TTS`);
    console.log(`   Waiting for customer speech...\n`);

    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error(`\n❌ [VOICE] Error in initial webhook:`, error.message);
    console.error(`   Stack:`, error.stack);
    return sendErrorTwiml(res, 'System error. Call failed.');
  }
});

/**
 * POST /voice/process
 * Handle user speech input and continue conversation
 * This is STEP 2-6 in the call flow
 */
router.post('/process', async (req, res) => {
  try {
    const { callSid } = req.query;
    const userInput = req.body.SpeechResult || '';

    console.log('\n' + '='.repeat(70));
    console.log(`🗣️  [PROCESS] Processing user input`);
    console.log(`   CallSid: ${callSid}`);
    console.log(`   Input: "${userInput}"`);
    console.log('='.repeat(70));

    if (!callSid) {
      console.error('❌ Missing callSid in query parameters');
      return sendErrorTwiml(res, 'CallSid missing');
    }

    // ✅ FETCH CALL RECORD
    const callDoc = await Call.findOne({ callSid });
    if (!callDoc) {
      console.error(`❌ Call not found: ${callSid}`);
      return sendErrorTwiml(res, 'Call not found in database');
    }

    // ✅ SAVE USER INPUT (STEP 2)
    if (userInput && userInput.trim()) {
      callDoc.messages.push({
        role: 'user',
        text: userInput.trim(),
        timestamp: new Date()
      });
      console.log(`✅ User message saved (${userInput.length} chars)`);
    } else {
      console.log(`⚠️  Empty user input - customer was silent`);
      callDoc.messages.push({
        role: 'user',
        text: '[SILENCE - No response]',
        timestamp: new Date()
      });
    }

    // Calculate current turn count
    const turnCount = Math.floor(callDoc.messages.length / 2);
    console.log(`📊 Turn count: ${turnCount}/12`);

    // ✅ GET AI RESPONSE (STEP 3)
    console.log(`\n🤖 Getting AI response...`);
    const aiResponse = await getAIResponse(callDoc.messages, {
      customerName: callDoc.customerName,
      customerPhone: callDoc.customerPhone,
      machineModel: callDoc.machineModel,
      machineNumber: callDoc.machineNumber,
      machineType: callDoc.machineType,
      serviceType: callDoc.serviceType,
      dueDate: callDoc.dueDate
    }, turnCount);

    if (!aiResponse || !aiResponse.text) {
      console.error('❌ AI response is empty');
      return sendErrorTwiml(res, 'AI service error');
    }

    console.log(`✅ AI response received`);
    console.log(`   Text: "${aiResponse.text.substring(0, 70)}..."`);
    console.log(`   Intent: ${aiResponse.intent}`);
    console.log(`   Status: ${aiResponse.extractedData.status}`);
    console.log(`   Should end: ${aiResponse.shouldEnd}`);

    // ✅ STEP 4: CHECK FOR BOOKING INTENT
    console.log(`\n📋 Checking for booking data extraction...`);

    // Extract and save date if present
    if (aiResponse.extractedData.hasDate && aiResponse.extractedData.dateValue) {
      const parsedDate = parseDate(aiResponse.extractedData.dateValue);
      if (parsedDate) {
        callDoc.booking.confirmedServiceDate = aiResponse.extractedData.dateValue;
        callDoc.booking.confirmedServiceDateISO = parsedDate;
        console.log(`   ✅ Service date extracted: ${aiResponse.extractedData.dateValue}`);
      }
    }

    // Extract and save city if present
    if (aiResponse.extractedData.hasCity && aiResponse.extractedData.cityValue) {
      const matchedCity = matchServiceCenter(aiResponse.extractedData.cityValue);
      if (matchedCity) {
        callDoc.booking.assignedBranchCity = matchedCity.city_name;
        callDoc.booking.assignedBranchName = matchedCity.branch_name;
        callDoc.booking.assignedBranchCode = matchedCity.branch_code;
        console.log(`   ✅ Service center matched: ${matchedCity.city_name} (${matchedCity.branch_name})`);
      }
    }

    // Update outcome if status changed
    if (aiResponse.extractedData.status && aiResponse.extractedData.status !== 'pending') {
      callDoc.outcome = aiResponse.extractedData.status;
      console.log(`   ✅ Outcome set to: ${aiResponse.extractedData.status}`);
    }

    // ✅ SAVE AI RESPONSE TO MESSAGES
    callDoc.messages.push({
      role: 'assistant',
      text: aiResponse.text,
      timestamp: new Date()
    });

    // ✅ UPDATE CONVERSATION TRANSCRIPT
    callDoc.conversationTranscript = callDoc.messages
      .map(m => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.text}`)
      .join('\n');

    callDoc.totalTurns = Math.floor(callDoc.messages.length / 2);

    // ✅ BUILD TWIML RESPONSE
    const twiml = new twilio.twiml.VoiceResponse();

    // ✅ STEP 5A/B/C: HANDLE DIFFERENT OUTCOMES
    if (aiResponse.shouldEnd) {
      // Call should end - STEP 5 & 6 COMPLETION
      console.log(`\n✅ [PROCESS] Call ending - Status: ${aiResponse.nextState}`);

      // ✅ USE ELEVENLABS FOR FINAL MESSAGE
      await sayWithClarity(twiml, aiResponse.text, false);
      twiml.hangup();

      // ✅ MARK CALL AS COMPLETED
      callDoc.status = 'completed';
      callDoc.callEndedAt = new Date();

      if (callDoc.callStartedAt) {
        callDoc.callDurationSeconds = Math.round(
          (callDoc.callEndedAt - callDoc.callStartedAt) / 1000
        );
      }

      await callDoc.save();

      // ✅ LOG FINAL SUMMARY
      console.log(`\n📊 ═══════════════════════════════════════════════════════════`);
      console.log(`📊 CALL COMPLETED - FINAL SUMMARY`);
      console.log(`📊 ═══════════════════════════════════════════════════════════`);
      console.log(`   Customer: ${callDoc.customerName}`);
      console.log(`   Phone: ${callDoc.customerPhone}`);
      console.log(`   Machine: ${callDoc.machineModel} (${callDoc.machineNumber})`);
      console.log(`   Service Type: ${callDoc.serviceType}`);
      console.log(`   Booked Date: ${callDoc.booking.confirmedServiceDate || 'N/A'}`);
      console.log(`   Service Center: ${callDoc.booking.assignedBranchCity || 'N/A'}`);
      console.log(`   Outcome: ${callDoc.outcome}`);
      console.log(`   Duration: ${callDoc.callDurationSeconds}s`);
      console.log(`   Total Turns: ${callDoc.totalTurns}`);
      console.log(`   Messages: ${callDoc.messages.length}`);
      console.log(`   Completion Reason: ${aiResponse.nextState}`);
      console.log(`   TTS Engine Used: 🎙️ Google TTS`);
      console.log(`📊 ═══════════════════════════════════════════════════════════\n`);

    } else {
      // ✅ STEP 5C: CONTINUE CONVERSATION
      console.log(`\n📤 Continuing conversation (Turn ${callDoc.totalTurns})`);

      const gather = twiml.gather({
        input: 'speech',
        language: 'hi-IN',
        speechTimeout: 'auto', // Instantly capture speech without a 5s silent delay
        timeout: 5,           // Wait max 5 seconds before giving up initially
        action: `/voice/process?callSid=${callSid}`,
        method: 'POST',
        maxSpeechTime: 15,
        numDigits: 1
      });

      // ✅ USE GOOGLE TTS FOR RESPONSE
      await sayWithClarity(gather, aiResponse.text, true);

      console.log(`   Voice: 🎙️ Google TTS`);
      console.log(`   Waiting for next customer response...\n`);
    }

    // Save all changes
    await callDoc.save();
    console.log(`✅ Call record updated in database`);

    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error(`\n❌ [PROCESS] Error processing input:`, error.message);
    console.error(`   Stack:`, error.stack);
    return sendErrorTwiml(res, 'Process error. Call failed.');
  }
});

/**
 * GET /voice/calls/:callSid
 * Check detailed status of a specific call
 */
router.get('/calls/:callSid', async (req, res) => {
  try {
    const { callSid } = req.params;

    console.log(`\n📊 [STATUS] Fetching call details: ${callSid}`);

    const callDoc = await Call.findOne({ callSid });

    if (!callDoc) {
      console.error(`❌ Call not found: ${callSid}`);
      return res.status(404).json({
        error: 'Call not found',
        callSid
      });
    }

    console.log(`✅ Call found`);

    return res.json({
      success: true,
      call: {
        callSid: callDoc.callSid,
        status: callDoc.status,
        outcome: callDoc.outcome,
        customer: {
          name: callDoc.customerName,
          phone: callDoc.customerPhone
        },
        machine: {
          model: callDoc.machineModel,
          number: callDoc.machineNumber,
          type: callDoc.machineType
        },
        service: {
          type: callDoc.serviceType,
          dueDate: callDoc.dueDate
        },
        booking: {
          confirmedDate: callDoc.booking.confirmedServiceDate || null,
          confirmedDateISO: callDoc.booking.confirmedServiceDateISO || null,
          assignedCity: callDoc.booking.assignedBranchCity || null,
          assignedBranch: callDoc.booking.assignedBranchName || null,
          branchCode: callDoc.booking.assignedBranchCode || null
        },
        metrics: {
          startedAt: callDoc.callStartedAt,
          endedAt: callDoc.callEndedAt,
          durationSeconds: callDoc.callDurationSeconds || 0,
          totalTurns: callDoc.totalTurns || 0,
          totalMessages: callDoc.messages.length
        },
        transcript: callDoc.conversationTranscript,
        createdAt: callDoc.createdAt,
        updatedAt: callDoc.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error fetching call details:', error.message);
    return res.status(500).json({
      error: error.message
    });
  }
});

export default router;