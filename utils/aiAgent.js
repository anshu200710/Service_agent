import Groq from 'groq-sdk';
import textToSpeech from '@google-cloud/text-to-speech';
import path from 'path';

// ✅ GOOGLE TTS INITIALIZATION
let ttsClient = null;
try {
  if (process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_CLIENT_EMAIL) {
    ttsClient = new textToSpeech.TextToSpeechClient({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
      },
      projectId: process.env.GOOGLE_PROJECT_ID,
    });
    console.log('✅ [AI] Google TTS client initialized via environment variables');
  } else {
    ttsClient = new textToSpeech.TextToSpeechClient({
      keyFilename: path.join(process.cwd(), 'utils', 'data.json')
    });
    console.log('✅ [AI] Google TTS client initialized via data.json file');
  }
} catch (error) {
  console.error('❌ [AI] Failed to initialize Google TTS client', error);
}// ✅ SAFE GROQ INITIALIZATION
let groq = null;
let groqInitialized = false;

try {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  
  if (!apiKey) {
    console.error('❌ [AI] GROQ_API_KEY is not set in environment variables');
    console.error('   Please add GROQ_API_KEY to your .env file');
  } else {
    // Initialize Groq client with API key only
    groq = new Groq({ apiKey });
    groqInitialized = true;
    console.log('✅ [AI] Groq client initialized successfully');
    console.log(`   API Key: ${apiKey.substring(0, 10)}...`);
  }
} catch (initError) {
  console.error('❌ [AI] Failed to initialize Groq client:', initError.message);
  console.error('   Error details:', initError);
  groqInitialized = false;
}

// ✅ SERVICE CENTERS DATABASE
const SERVICE_CENTERS = [
  { id: 1, city_name: "AJMER", branch_name: "AJMER", branch_code: "1" },
  { id: 2, city_name: "ALWAR", branch_name: "ALWAR", branch_code: "2" },
  { id: 3, city_name: "BANSWARA", branch_name: "UDAIPUR", branch_code: "7" },
  { id: 4, city_name: "BHARATPUR", branch_name: "ALWAR", branch_code: "2" },
  { id: 5, city_name: "BHILWARA", branch_name: "BHILWARA", branch_code: "3" },
  { id: 6, city_name: "BHIWADI", branch_name: "ALWAR", branch_code: "2" },
  { id: 7, city_name: "DAUSA", branch_name: "JAIPUR", branch_code: "4" },
  { id: 8, city_name: "DHOLPUR", branch_name: "ALWAR", branch_code: "2" },
  { id: 9, city_name: "DUNGARPUR", branch_name: "UDAIPUR", branch_code: "7" },
  { id: 10, city_name: "GONER ROAD", branch_name: "JAIPUR", branch_code: "4" },
  { id: 11, city_name: "JAIPUR", branch_name: "JAIPUR", branch_code: "4" },
  { id: 12, city_name: "JHALAWAR", branch_name: "KOTA", branch_code: "5" },
  { id: 13, city_name: "JHUNJHUNU", branch_name: "SIKAR", branch_code: "6" },
  { id: 14, city_name: "KARAULI", branch_name: "JAIPUR", branch_code: "4" },
  { id: 15, city_name: "KEKRI", branch_name: "AJMER", branch_code: "1" },
  { id: 16, city_name: "KOTA", branch_name: "KOTA", branch_code: "5" },
  { id: 17, city_name: "KOTPUTLI", branch_name: "JAIPUR", branch_code: "4" },
  { id: 18, city_name: "NEEM KA THANA", branch_name: "JAIPUR", branch_code: "4" },
  { id: 19, city_name: "NIMBAHERA", branch_name: "BHILWARA", branch_code: "3" },
  { id: 20, city_name: "PRATAPGARH", branch_name: "BHILWARA", branch_code: "3" },
  { id: 21, city_name: "RAJSAMAND", branch_name: "UDAIPUR", branch_code: "7" },
  { id: 22, city_name: "RAMGANJMANDI", branch_name: "KOTA", branch_code: "5" },
  { id: 23, city_name: "SIKAR", branch_name: "SIKAR", branch_code: "6" },
  { id: 25, city_name: "SUJANGARH", branch_name: "SIKAR", branch_code: "6" },
  { id: 26, city_name: "TONK", branch_name: "JAIPUR", branch_code: "4" },
  { id: 27, city_name: "UDAIPUR", branch_name: "UDAIPUR", branch_code: "7" },
  { id: 28, city_name: "VKIA", branch_name: "JAIPUR", branch_code: "4" }
];

/**
 * ✅ GET AI RESPONSE - Complete conversation flow handler
 * @param {array} messages - Conversation history
 * @param {object} customerData - Customer details from Call database
 * @param {number} turnCount - Current turn number (for safety limit)
 * @returns {object} - { text, intent, extractedData, shouldEnd, nextState }
 */
export async function getAIResponse(messages, customerData, turnCount = 0) {
  try {
    // ✅ CHECK IF GROQ IS INITIALIZED
    if (!groqInitialized || !groq) {
      console.error('❌ [AI] Groq client not initialized');
      return {
        text: 'Kshama kijiye, AI service abhi available nahi hai. Baad mein dobara try karenge.',
        intent: 'error',
        extractedData: {
          intent: 'error',
          hasDate: false,
          dateValue: '',
          hasCity: false,
          cityValue: '',
          status: 'pending'
        },
        shouldEnd: true,
        nextState: 'error'
      };
    }

    // ✅ CHECK SAFETY LIMIT (max 12 turns)
    if (turnCount >= 12) {
      console.warn(`⚠️  [AI] Safety limit reached: ${turnCount} turns`);
      return {
        text: 'Dhanyavaad! Aapka booking request store ho gaya. Hum jald contact karenge. Namaste!',
        intent: 'completed',
        extractedData: {
          intent: 'completed',
          status: 'pending',
          hasDate: false,
          dateValue: '',
          hasCity: false,
          cityValue: ''
        },
        shouldEnd: true,
        nextState: 'safety_limit_reached'
      };
    }

    // ✅ BUILD SYSTEM PROMPT WITH CUSTOMER DATA
    const systemPrompt = buildSystemPrompt(customerData);
    
    // Format messages for Groq API
    let formattedMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

    // ✅ HANDLE FIRST MESSAGE: If no messages, add initial prompt
    if (formattedMessages.length === 0) {
      formattedMessages = [{
        role: 'user',
        content: 'Namaste! Please give me the greeting with service details.'
      }];
    }

    // ✅ IMPORTANT: Add system message to the beginning of messages array
    // Groq API doesn't support 'system' parameter, so we add it as a message
    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...formattedMessages
    ];

    console.log(`\n🤖 [AI] Calling Groq API...`);
    console.log(`   Customer: ${customerData.customerName}`);
    console.log(`   Machine: ${customerData.machineModel}`);
    console.log(`   Messages in history: ${formattedMessages.length}`);
    console.log(`   Turn count: ${turnCount}`);

    let response;
    try {
      response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        max_tokens: 150, // Reduced from 512 for much faster response latency
        messages: messagesWithSystem,
        temperature: 0.7
      });

      console.log(`✅ [AI] Groq API response received successfully`);
    } catch (apiError) {
      console.error(`❌ [AI] Groq API error:`, apiError.message);
      
      if (apiError.status === 401 || apiError.status === 403) {
        console.error(`   → Authentication error: Invalid or expired API key`);
        return getErrorResponse('API key invalid. Admin ko notify kar diya jayega.', 'auth_error');
      }
      
      if (apiError.status === 429) {
        console.error(`   → Rate limit exceeded`);
        return getErrorResponse('System busy hai. Baad mein try karenge.', 'rate_limit');
      }
      
      if (apiError.status === 500) {
        console.error(`   → Groq server error`);
        return getErrorResponse('Service down. Baad mein try karenge.', 'server_error');
      }
      
      throw apiError;
    }

    // ✅ EXTRACT AI TEXT FROM RESPONSE
    const aiText = response.choices?.[0]?.message?.content;
    
    if (!aiText || aiText.trim().length === 0) {
      console.error('❌ [AI] Empty response content from Groq');
      return {
        text: 'Samajh nahi aaya. Dobara boliye.',
        intent: 'continue',
        extractedData: {
          intent: 'continue',
          hasDate: false,
          dateValue: '',
          hasCity: false,
          cityValue: '',
          status: 'pending'
        },
        shouldEnd: false,
        nextState: 'continue'
      };
    }

    console.log(`✅ [AI] Response generated: "${aiText.substring(0, 80)}..."`);

    // Parse AI response for booking state
    const parsed = parseAIResponse(aiText);

    return {
      text: parsed.text,
      intent: parsed.intent,
      extractedData: parsed.extractedData,
      shouldEnd: parsed.shouldEnd,
      nextState: parsed.nextState
    };

  } catch (error) {
    console.error(`\n❌ [AI] Unhandled error in getAIResponse:`, error.message);
    console.error(`   Type: ${error.name}`);
    
    return getErrorResponse('Kshama kijiye, system mein issue hai. Baad mein try karenge.', 'unknown_error');
  }
}

/**
 * ✅ HELPER: Generate error response
 */
function getErrorResponse(text, intent = 'error') {
  return {
    text,
    intent,
    extractedData: {
      intent,
      hasDate: false,
      dateValue: '',
      hasCity: false,
      cityValue: '',
      status: 'pending'
    },
    shouldEnd: true,
    nextState: intent
  };
}

/**
 * ✅ BUILD SYSTEM PROMPT WITH CUSTOMER DETAILS
 */
function buildSystemPrompt(customerData) {
  const serviceCenterList = SERVICE_CENTERS.map(s => s.city_name).join(', ');
  
  let dueDateStr = 'Soon';
  if (customerData.dueDate) {
    try {
      const dueDate = new Date(customerData.dueDate);
      dueDateStr = dueDate.toLocaleDateString('en-IN');
    } catch (e) {
      console.warn('⚠️  Invalid due date:', customerData.dueDate);
    }
  }

  return `You are Priya, a professional JCB service booking assistant for Rajesh Motors.
You speak warm, friendly Hindi/Hinglish naturally. ALWAYS personalize with customer names and details.

═══════════════════════════════════════════════════════════════════════════
CUSTOMER INFORMATION (ALWAYS USE IN RESPONSES):
═══════════════════════════════════════════════════════════════════════════
Name: ${customerData.customerName}
Phone: ${customerData.customerPhone}
Machine: ${customerData.machineModel} (Serial: ${customerData.machineNumber})
Service Type: ${customerData.serviceType}
Service Due: ${dueDateStr}

═══════════════════════════════════════════════════════════════════════════
YOUR CONVERSATION FLOW (Follow Strictly):
═══════════════════════════════════════════════════════════════════════════

IF FIRST MESSAGE (empty conversation):
→ Warm greeting with NAME
→ Mention MACHINE MODEL and NUMBER
→ Say SERVICE TYPE is due
→ Ask if they want to book
Example: "Namaste ${customerData.customerName} ji! Main Priya, Rajesh Motors se. Aapki ${customerData.machineModel} (${customerData.machineNumber}) ki ${customerData.serviceType} due hai. Kya aap book karna chahenge?"

IF CUSTOMER SAYS YES:
→ Ask for preferred service date
→ Accept: "kal", "parso", day names, dates like "16 Feb"
→ Confirm the date

IF CUSTOMER SAYS NO:
→ Offer to reschedule
→ If they decline: End call politely

ONCE DATE IS CONFIRMED:
→ Ask for city/location
→ ONLY accept cities from this list: ${serviceCenterList}
→ Match their city to correct service center

FINAL STEP:
→ Repeat ALL details back
→ Ask final confirmation
→ If YES: "Booking confirm ho gayi! Aapka appointment book ho gaya."
→ If NO: "Kya change karna hai?"

IF CUSTOMER SAYS "ALREADY DONE":
→ Ask when and where
→ Thank them and end call

═══════════════════════════════════════════════════════════════════════════
CRITICAL RULES:
═══════════════════════════════════════════════════════════════════════════
✅ ALWAYS use "${customerData.customerName}" in response (not generic "you")
✅ ALWAYS mention their "${customerData.machineModel}" model
✅ Keep responses SHORT (1-2 Hindi sentences max)
✅ Speak naturally in Hindi/Hinglish
✅ Be warm and professional
✅ Listen carefully to what customer says
✅ Never make assumptions

═══════════════════════════════════════════════════════════════════════════
RESPONSE FORMAT (MANDATORY):
═══════════════════════════════════════════════════════════════════════════
Always end your response with JSON on a new line:
BOOKING_STATE: {"intent":"greeting|asking_date|asking_city|confirming|completed|already_done|declined","hasDate":false,"dateValue":"","hasCity":false,"cityValue":"","status":"pending|confirmed|already_done|declined"}

Example complete response:
"Namaste ${customerData.customerName} ji! Aapki ${customerData.machineModel} ki service book karni hai?"
BOOKING_STATE: {"intent":"greeting","hasDate":false,"dateValue":"","hasCity":false,"cityValue":"","status":"pending"}
`;
}

/**
 * ✅ PARSE AI RESPONSE - Extract state and determine if call should end
 */
function parseAIResponse(aiText) {
  let text = aiText;
  let extractedData = {
    intent: 'continue',
    hasDate: false,
    dateValue: '',
    hasCity: false,
    cityValue: '',
    status: 'pending'
  };

  // Extract BOOKING_STATE JSON from response
  try {
    const stateMatch = aiText.match(/BOOKING_STATE:\s*(\{[\s\S]*?\})/);
    if (stateMatch) {
      const stateJson = JSON.parse(stateMatch[1]);
      extractedData = { ...extractedData, ...stateJson };
      
      // Remove JSON from displayed text
      text = aiText.split('BOOKING_STATE:')[0].trim();
      
      console.log(`✅ [PARSE] State: intent=${extractedData.intent}, status=${extractedData.status}`);
      
      if (extractedData.hasDate) {
        console.log(`   ✅ Date extracted: ${extractedData.dateValue}`);
      }
      if (extractedData.hasCity) {
        console.log(`   ✅ City extracted: ${extractedData.cityValue}`);
      }
    } else {
      console.warn('⚠️  [PARSE] No BOOKING_STATE found in response');
    }
  } catch (parseError) {
    console.warn('⚠️  [PARSE] Failed to parse BOOKING_STATE:', parseError.message);
    text = aiText;
  }

  // Determine if call should end based on status
  let shouldEnd = false;
  let nextState = 'continuing';

  if (extractedData.status === 'confirmed') {
    shouldEnd = true;
    nextState = 'confirmed';
  } else if (extractedData.status === 'already_done') {
    shouldEnd = true;
    nextState = 'already_done';
  } else if (extractedData.status === 'declined') {
    shouldEnd = true;
    nextState = 'declined';
  } else if (extractedData.intent === 'completed') {
    shouldEnd = true;
    nextState = 'completed';
  }

  return {
    text: text?.trim() || 'Samajh nahi aaya. Dobara boliye.',
    intent: extractedData.intent || 'continue',
    extractedData,
    shouldEnd,
    nextState
  };
}

/**
 * ✅ MATCH CITY WITH SERVICE CENTER
 */
export function matchServiceCenter(cityText) {
  if (!cityText || cityText.trim().length === 0) return null;
  
  const text = cityText.toLowerCase().trim();
  
  // Exact match first
  for (const center of SERVICE_CENTERS) {
    if (center.city_name.toLowerCase() === text) {
      return center;
    }
  }
  
  // Partial match (first 3+ characters)
  for (const center of SERVICE_CENTERS) {
    const cityName = center.city_name.toLowerCase();
    if (text.length >= 3 && cityName.startsWith(text.substring(0, 3))) {
      return center;
    }
  }
  
  // Contains match (last resort)
  for (const center of SERVICE_CENTERS) {
    if (center.city_name.toLowerCase().includes(text)) {
      return center;
    }
  }
  
  return null;
}

/**
 * ✅ PARSE DATE FROM CUSTOMER INPUT
 * Handles: kal, parso, day names, dates
 */
export function parseDate(dateText) {
  if (!dateText || dateText.trim().length === 0) return null;
  
  const today = new Date();
  const text = dateText.toLowerCase().trim();

  // Tomorrow (kal)
  if (text.includes('kal')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // Day after tomorrow (parso)
  if (text.includes('parso')) {
    const parso = new Date(today);
    parso.setDate(parso.getDate() + 2);
    return parso;
  }

  // Day names (Hindi and English)
  const dayMap = {
    'somvar': 1, 'monday': 1,
    'mangalwar': 2, 'tuesday': 2,
    'budhvar': 3, 'wednesday': 3,
    'guruvar': 4, 'thursday': 4,
    'shukrabar': 5, 'friday': 5,
    'shanivar': 6, 'saturday': 6,
    'ravivar': 0, 'sunday': 0
  };

  for (const [day, dayIndex] of Object.entries(dayMap)) {
    if (text.includes(day)) {
      const target = new Date(today);
      const daysAhead = (dayIndex - today.getDay() + 7) % 7;
      target.setDate(target.getDate() + (daysAhead || 7));
      return target;
    }
  }

  // Date format: "16 feb", "16 tarik"
  const dateMatch = text.match(/(\d{1,2})\s*(feb|tarik|jan|march|april|may)/i);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    if (day >= 1 && day <= 31) {
      const date = new Date(today);
      date.setDate(day);
      if (date < today) date.setMonth(date.getMonth() + 1);
      return date;
    }
  }

  // Next week
  if (text.includes('next') || text.includes('agle') || text.includes('agla')) {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek;
  }

  return null;
}

/**
 * ✅ GOOGLE TTS - Generate Audio Buffer
 */
export async function generateGoogleTTS(text) {
  if (!ttsClient) {
    console.warn('⚠️ Google TTS client not initialized');
    return null;
  }
  
  let cleanText = text;
  const stateMatch = text.match(/BOOKING_STATE:\s*(\{[\s\S]*?\})/);
  if (stateMatch) {
    cleanText = text.split('BOOKING_STATE:')[0].trim();
  }
  cleanText = cleanText.replace(/<[^>]*>?/gm, '').replace(/\*/g, '').trim();

  const request = {
    input: { text: cleanText },
    voice: { languageCode: 'hi-IN', name: 'hi-IN-Neural2-D' }, // Warm & Professional
    audioConfig: { audioEncoding: 'MP3', speakingRate: 1.15 }, // Increased speed for snappier responses
  };

  try {
    const [response] = await ttsClient.synthesizeSpeech(request);
    return response.audioContent; 
  } catch (error) {
    console.error('❌ Google TTS Error:', error);
    return null;
  }
}

export default {
  getAIResponse,
  matchServiceCenter,
  parseDate,
  generateGoogleTTS
};