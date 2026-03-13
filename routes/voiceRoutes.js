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
  // Before sending to TTS:
  const spokenText = text.split("BOOKING_STATE")[0].trim();



  try {
    // Generate text URL for Twilio to load the MP3 stream on the fly
    console.log(`🎙️ Using Google TTS...`);
    const encodedText = encodeURIComponent(spokenText);
    
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
    twimlNode.say(spokenText, VOICE_CONFIG);
  } else {
    twimlNode.say(spokenText, VOICE_CONFIG);
  }

}

// ✅ PROCESSING LOCKS - Prevent concurrent processing of same call
const processingLocks = new Map();

async function acquireLock(callSid, timeoutMs = 15000) {
  if (processingLocks.has(callSid)) {
    console.warn(`⚠️ Call ${callSid} already processing, skipping duplicate`);
    return false;
  }
  processingLocks.set(callSid, Date.now());
  setTimeout(() => processingLocks.delete(callSid), timeoutMs);
  return true;
}

function releaseLock(callSid) {
  processingLocks.delete(callSid);
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
  const { CallSid } = req.body;

  if (!CallSid) {
    console.error('❌ Missing CallSid in request');
    return sendErrorTwiml(res, 'System error. Call failed.');
  }

  // Prevent double initiation
  if (!(await acquireLock(CallSid))) {
    return res.status(200).send();
  }

  try {
    console.log('\n' + '='.repeat(70));
    console.log(`📞 [VOICE] STEP 1: Call Answered`);
    console.log(`   CallSid: ${CallSid}`);
    console.log('='.repeat(70));

    // ✅ FETCH CALL FROM DATABASE
    const callDoc = await Call.findOne({ callSid: CallSid });
    if (!callDoc) {
      console.error(`❌ Call not found in database: ${CallSid}`);
      return sendErrorTwiml(res, 'Call information not found.');
    }

    // ✅ UPDATE CALL STATUS
    callDoc.status = 'in_progress';
    callDoc.callStartedAt = new Date();
    callDoc.totalTurns = 0;
    await callDoc.save();

    console.log(`✅ Call status updated to 'in_progress' for: ${callDoc.customerName}`);

    // ✅ GET AI GREETING
    const aiResponse = await getAIResponse([], {
      customerName: callDoc.customerName,
      customerPhone: callDoc.customerPhone,
      machineModel: callDoc.machineModel,
      machineNumber: callDoc.machineNumber,
      machineType: callDoc.machineType,
      serviceType: callDoc.serviceType,
      dueDate: callDoc.dueDate
    }, 0);

    // ✅ SAVE AI GREETING TO DATABASE
    callDoc.messages.push({
      role: 'assistant',
      text: aiResponse.text,
      timestamp: new Date()
    });
    await callDoc.save();

    // ✅ BUILD TWIML RESPONSE WITH GATHER
    const twiml = new twilio.twiml.VoiceResponse();
    const gather = twiml.gather({
      input: 'speech',
      language: 'hi-IN',
      speechTimeout: 'auto', 
      timeout: 5,
      action: `/voice/process?callSid=${CallSid}`,
      method: 'POST',
      maxSpeechTime: 15
    });

    await sayWithClarity(gather, aiResponse.text, true);

    console.log(`📤 Sending greeting to: ${callDoc.customerName}`);
    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error(`❌ [VOICE] Error in initial webhook:`, error.message);
    return sendErrorTwiml(res, 'System error. Call failed.');
  } finally {
    releaseLock(CallSid);
  }
});

/**
 * POST /voice/process
 * Handle user speech input and continue conversation
 * This is STEP 2-6 in the call flow
 */
router.post('/process', async (req, res) => {
  const { callSid } = req.query;
  const userInput = (req.body.SpeechResult || '').trim();

  if (!callSid) return sendErrorTwiml(res, 'CallSid missing');

  // Prevent double processing
  if (!(await acquireLock(callSid))) {
    return res.status(200).send(); 
  }

  try {
    const callDoc = await Call.findOne({ callSid });
    if (!callDoc) {
      return sendErrorTwiml(res, 'Call not found');
    }

    console.log('\n' + '='.repeat(70));
    console.log(`🗣️  [PROCESS] User Input: "${userInput || '[SILENCE]'}"`);
    console.log('='.repeat(70));

    // ✅ SAVE USER INPUT (STEP 2) & Handle silence with retries
    if (!userInput) {
      const silenceCount = callDoc.messages.filter(m => m.text === '[SILENCE - No response]').length;
      
      if (silenceCount >= 1) {
        // Second silence - end call
        console.log(`⚠️  Double silence - ending call`);
        const finalMsg = "Theek hai, main aapko baad mein call karwa deti hoon. Dhanyavaad!";
        const twiml = new twilio.twiml.VoiceResponse();
        await sayWithClarity(twiml, finalMsg, false);
        twiml.hangup();
        
        callDoc.messages.push({ role: 'user', text: '[SILENCE - No response]', timestamp: new Date() });
        callDoc.messages.push({ role: 'assistant', text: finalMsg, timestamp: new Date() });
        callDoc.status = 'completed';
        callDoc.outcome = 'declined';
        callDoc.callEndedAt = new Date();
        if (callDoc.callStartedAt) {
          callDoc.callDurationSeconds = Math.round((callDoc.callEndedAt - callDoc.callStartedAt) / 1000);
        }
        await callDoc.save();
        
        return res.type('text/xml').send(twiml.toString());
      } else {
        // First silence - re-prompt
        console.log(`⚠️  Empty user input - customer was silent (first instance)`);
        callDoc.messages.push({ role: 'user', text: '[SILENCE - No response]', timestamp: new Date() });
      }
    } else {
      // Save valid input
      callDoc.messages.push({
        role: 'user',
        text: userInput,
        timestamp: new Date()
      });
      console.log(`✅ User message saved (${userInput.length} chars)`);
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
    if (aiResponse.extractedData.service_date) {
      const parsedDate = parseDate(aiResponse.extractedData.service_date);
      if (parsedDate) {
        // Format to "DD-MM-YYYY" for clear display
        const formattedDate = parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        callDoc.booking.confirmedServiceDate = formattedDate;
        callDoc.booking.confirmedServiceDateISO = parsedDate;
        console.log(`   ✅ Service date extracted: ${formattedDate} (from raw: ${aiResponse.extractedData.service_date})`);
      }
    }

    // Extract and save city if present
    if (aiResponse.extractedData.service_city) {
      const matchedCity = matchServiceCenter(aiResponse.extractedData.service_city);
      if (matchedCity) {
        callDoc.booking.assignedBranchCity = matchedCity.city_name;
        callDoc.booking.assignedBranchName = matchedCity.branch_name;
        callDoc.booking.assignedBranchCode = matchedCity.branch_code;
        console.log(`   ✅ Service center matched: ${matchedCity.city_name} (${matchedCity.branch_name})`);
      }
    }


    // Update outcome if status changed and is a valid enum value
    const validOutcomes = ['confirmed', 'already_done', 'declined'];
    if (aiResponse.extractedData.status && validOutcomes.includes(aiResponse.extractedData.status)) {
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
    if (aiResponse.shouldEnd || aiResponse.extractedData.status === 'confirmed' || aiResponse.extractedData.status === 'already_done' || aiResponse.extractedData.status === 'declined') {
      // Call should end - STEP 5 & 6 COMPLETION
      console.log(`\n✅ [PROCESS] Call completed - Outcome: ${callDoc.outcome}`);

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

    } else {
      // ✅ STEP 5C: CONTINUE CONVERSATION
      console.log(`\n📤 Continuing conversation turn: ${callDoc.totalTurns}`);

      const gather = twiml.gather({
        input: 'speech',
        language: 'hi-IN',
        speechTimeout: 'auto',
        timeout: 5,   // Fixed timeout for subsequent gathers
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
  } finally {
    releaseLock(callSid);
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