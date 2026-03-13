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

    // ✅ CHECK SAFETY LIMIT (max 20 turns)
    if (turnCount >= 20) {
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
        max_tokens: 256, // Increased from 150 to prevent truncation of JSON block
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
  
  // FORCE IST TIME (Current date for the AI)
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const parso = new Date(today);
  parso.setDate(today.getDate() + 2);

  const currentDateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
  const tomorrowStr = tomorrow.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const parsoStr = parso.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return `You are Priya, a professional Indian Voice Agent for Rajesh Motors. 
Speak in a warm, polite Indian service center accent (Hindi/Hinglish).

### 🛑 VOICE AGENT CONVERSATION RULES:

**1. Persona and Tone**
- Address the customer as "${customerData.customerName} ji".
- Keep it natural, like a real Indian service agent. Use words like "Namaste", "Theek hai", "Ji".
- Maintain a helpful but professional tone.

**2. Date Understanding**
- TODAY IS: ${currentDateStr}.
- TOMORROW (Kal) IS: ${tomorrowStr}.
- DAY AFTER TOMORROW (Parso) IS: ${parsoStr}.
- If the user says "Kal", "Parso", or specifies a date, use these references.

**3. City and Branch Validation (CRITICAL)**
- ALLOWED CITIES: ${serviceCenterList}.
- If the customer mentions a city or branch NOT in this list, you MUST say: "Kshama kijiye, ye service center hamare branch city mein nahi aata, kripya apna registered branch city bataye."
- Do NOT proceed to booking summary until a valid city from the list is provided.

**4. Conversation Efficiency**
- Keep the conversation extremely small and snappy.
- Response length: Max 1-2 short sentences. No long speeches.
- Once details are collected, summarize once and confirm.

**5. Required Response Format**
- EVERY response MUST end with exactly this JSON format:
BOOKING_STATE: {
  "intent": "greeting|confirming_service|asking_date|asking_city|summarizing|confirming|completed|already_done|declined",
  "status": "pending|confirmed|already_done|declined",
  "service_date": "DD-MM-YYYY or empty",
  "service_city": "City name or empty"
}

**6. Conversation Flow**
1. Greeting: "Namaste ${customerData.customerName} ji, Rajesh Motors se Priya bol rahi hoon. Aapki ${customerData.machineModel} ki ${customerData.serviceType} due hai. Kya main booking confirm kar doon?"
2. If YES: Ask for Date.
3. After Date: Ask for City (Must be from allowed list).
4. Summary: Once Date and City are known, summarize once: "Humne aapki booking ${customerData.machineModel} ke liye [Date] ko [City] branch par set kar di hai. Kya main ise confirm kar doon?"
5. Completion: If confirmed, thank them and end call.
`;
}


/**
 * ✅ PARSE AI RESPONSE - Extract state and determine if call should end
 */
function parseAIResponse(aiText) {
  let extractedData = {
    intent: 'continue',
    status: 'pending',
    service_date: '',
    service_city: ''
  };

  // Extract BOOKING_STATE JSON from response
  try {
    const stateMatch = aiText.match(/BOOKING_STATE:\s*(\{[\s\S]*?\})/);
    if (stateMatch) {
      const stateJson = JSON.parse(stateMatch[1]);
      extractedData = { ...extractedData, ...stateJson };
      console.log(`✅ [PARSE] State: intent=${extractedData.intent}, status=${extractedData.status}, date=${extractedData.service_date}, city=${extractedData.service_city}`);
    } else {
      console.warn('⚠️  [PARSE] No BOOKING_STATE found in response. Using default state.');
    }
  } catch (parseError) {
    console.warn('⚠️  [PARSE] Failed to parse BOOKING_STATE:', parseError.message);
  }

  // Determine if call should end based on status or intent
  const endStatuses = ['confirmed', 'already_done', 'declined'];
  const endIntents = ['completed'];
  
  let shouldEnd = endStatuses.includes(extractedData.status) || endIntents.includes(extractedData.intent);
  let nextState = extractedData.status !== 'pending' ? extractedData.status : extractedData.intent;

  return {
    text: aiText, // Return FULL text for backend/logs
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

  // 1. Exact match
  for (const center of SERVICE_CENTERS) {
    if (center.city_name.toLowerCase() === text) {
      return center;
    }
  }

  // 2. Common Phonetic/Typo overrides
  const overrides = {
    'jaypur': 'JAIPUR',
    'jaipur': 'JAIPUR',
    'alwar': 'ALWAR',
    'ajmer': 'AJMER',
    'kota': 'KOTA',
    'sikar': 'SIKAR',
    'udaipur': 'UDAIPUR',
    'gauner': 'GONER ROAD',
    'goner': 'GONER ROAD'
  };

  if (overrides[text]) {
    return SERVICE_CENTERS.find(c => c.city_name === overrides[text]);
  }

  // 3. Prefix match (min 3 chars)
  for (const center of SERVICE_CENTERS) {
    const cityName = center.city_name.toLowerCase();
    if (text.length >= 3 && (cityName.startsWith(text.substring(0, 3)) || text.startsWith(cityName.substring(0, 3)))) {
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

  // Use IST for accurate "Today"
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  today.setHours(0, 0, 0, 0);

  const text = dateText.toLowerCase().trim();

  // 1. Tomorrow (kal)
  if (text.includes('kal')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // 2. Day after tomorrow (parso)
  if (text.includes('parso')) {
    const parso = new Date(today);
    parso.setDate(parso.getDate() + 2);
    return parso;
  }

  // 3. Today (aaj)
  if (text.includes('aaj')) {
    return today;
  }

  // 4. Day names
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

  // 5. Numeric Date format: "28/2/2026", "28-02", "28.02"
  const numericMatch = text.match(/(\d{1,2})[\/\-\.](\d{1,2})([\/\-\.](\d{2,4}))?/);
  if (numericMatch) {
    const day = parseInt(numericMatch[1]);
    const month = parseInt(numericMatch[2]) - 1; // 0-indexed
    const yearMatch = numericMatch[4];

    const target = new Date(today);
    target.setDate(day);
    target.setMonth(month);
    if (yearMatch) {
      const year = yearMatch.length === 2 ? 2000 + parseInt(yearMatch) : parseInt(yearMatch);
      target.setFullYear(year);
    }

    if (target < today) {
      target.setFullYear(target.getFullYear() + 1);
    }
    return target;
  }

  // 6. Text Date format: "16 feb", "16 March", "28 Feb"
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const dateMatch = text.match(/(\d{1,2})\s*(tarik|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);

  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const monthText = dateMatch[2].substring(0, 3).toLowerCase();
    const monthIndex = months.indexOf(monthText);

    if (day >= 1 && day <= 31) {
      const target = new Date(today);
      target.setDate(day);
      if (monthIndex !== -1) {
        target.setMonth(monthIndex);
      }

      // If the target date is in the past, move to next year
      if (target < today) {
        target.setFullYear(target.getFullYear() + 1);
      }
      return target;
    }
  }

  // 7. Next month / Next week
  if (text.includes('next') || text.includes('agle') || text.includes('agla')) {
    const target = new Date(today);
    if (text.includes('month') || text.includes('mahina') || text.includes('mahine')) {
      target.setMonth(target.getMonth() + 1);
    } else {
      target.setDate(target.getDate() + 7); // Default next week
    }
    return target;
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

  // Before sending to TTS:
  const spokenText = text.split("BOOKING_STATE")[0].trim();

  const request = {
    input: { text: spokenText },
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