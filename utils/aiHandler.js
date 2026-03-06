/**
 * AI Handler - Conversation Intelligence & State Management
 */

// Patterns for detecting confusion
const confusionPatterns = [
  /samajh\s+nahi/i,
  /kya\b/i,
  /phir\s+se\s+bolo/i,
  /repeat/i,
  /dubara/i,
  /ek\s+baar\s+aur/i,
  /slow\s+boliye/i,
  /slowly/i,
  /hindi\s+mein/i,
  /clearly/i,
  /spष्ट/i
];

// Patterns for detecting goodbyes
const goodbyePatterns = [
  /bye/i,
  /goodbye/i,
  /nahin\s+chahiye/i,
  /nahi\s+chahiye/i,
  /nahi\s+hoga/i,
  /mat\s+karo/i,
  /mat\s+karni/i,
  /shukriya/i,
  /theek\s+hai/i,
  /khatam\s+karo/i,
  /hang\s+up/i,
  /kaat\s+do/i
];

// Patterns for detecting repeat requests
const repeatPatterns = [
  /phir\s+se/i,
  /ek\s+baar\s+aur/i,
  /dubara/i,
  /fir\s+se/i,
  /repeat/i
];

// Patterns for silence/no input
const silencePatterns = [
  /^\s*$/,
  /^\.+$/,
  /^silence/i,
  /^no\s+input/i
];

/**
 * Detect if user response indicates confusion
 * @param {string} text - User input text
 * @returns {boolean}
 */
export function detectConfusion(text) {
  if (!text) return false;
  return confusionPatterns.some(pattern => pattern.test(text));
}

/**
 * Detect if user said goodbye or wants to end call
 * @param {string} text - User input text
 * @returns {boolean}
 */
export function detectGoodbye(text) {
  if (!text) return false;
  return goodbyePatterns.some(pattern => pattern.test(text));
}

/**
 * Detect if user is asking for repeat of previous message
 * @param {array} messages - Array of message objects
 * @returns {boolean}
 */
export function detectRepeat(messages) {
  if (!messages || messages.length < 2) return false;
  
  // Find last user message WITHOUT mutating the array
  let lastUserMsg = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserMsg = messages[i];
      break;
    }
  }
  
  if (!lastUserMsg) return false;
  
  return repeatPatterns.some(pattern => pattern.test(lastUserMsg.text));
}

/**
 * Detect silence or no input
 * @param {string} text - User input text
 * @returns {boolean}
 */
export function detectSilence(text) {
  if (!text) return true;
  return silencePatterns.some(pattern => pattern.test(text));
}

/**
 * Detect abusive language
 * @param {string} text - User input text
 * @returns {boolean}
 */
export function detectAbuse(text) {
  if (!text) return false;
  
  const abusePatterns = [
    /chup\s+kar/i,
    /chup/i,
    /badmash/i,
    /gali/i,
    /jhooth/i,
    /harami/i,
    /kamina/i,
  ];
  
  return abusePatterns.some(pattern => pattern.test(text));
}

/**
 * Process conversation and manage state
 * Returns object with AI response and control flags
 * @param {object} callDoc - MongoDB call document
 * @param {string} userText - User's speech input
 * @returns {object} - { shouldEnd, shouldRepeat, reason }
 */
export async function processConversation(callDoc, userText) {
  const messages = callDoc.messages || [];
  const totalTurns = Math.floor(messages.length / 2);

  // Check for silence
  if (detectSilence(userText)) {
    // If multiple silences, suggest rescheduling
    const silenceCount = messages.filter(m => 
      m.role === 'user' && detectSilence(m.text)
    ).length;

    if (silenceCount >= 2) {
      return {
        shouldEnd: true,
        reason: 'multiple_silences',
        message: 'Agar aapko baad mein baat karni hai toh main call reschedule kar sakta hoon.'
      };
    }
  }

  // Check for goodbye
  if (detectGoodbye(userText)) {
    return {
      shouldEnd: true,
      reason: 'user_goodbye',
      message: 'Shukriya aapka samay dene k liye. Aapko sambhall kr call karunga.'
    };
  }

  // Check for abuse
  if (detectAbuse(userText)) {
    return {
      shouldEnd: true,
      reason: 'abusive_language',
      message: 'Aapko pareshan nahi karna chahta. Call disconnect kar deta hoon.'
    };
  }

  // Check maximum turns limit (12 turns = 24 messages)
  if (totalTurns >= 12) {
    return {
      shouldEnd: true,
      reason: 'max_turns_reached',
      message: 'Aapka booking process complete kar dunga. Baad mein confirm kar dunga.'
    };
  }

  // Check if should repeat previous message
  if (detectRepeat(messages)) {
    return {
      shouldRepeat: true,
      reason: 'user_asked_repeat'
    };
  }

  return {
    shouldEnd: false,
    shouldRepeat: false,
    reason: 'continue'
  };
}

/**
 * Update conversation transcript
 * Formats messages into readable transcript
 * @param {object} callDoc - MongoDB call document
 */
export function updateTranscript(callDoc) {
  const messages = callDoc.messages || [];
  
  const transcript = messages.map((msg, index) => {
    const prefix = msg.role === 'user' ? 'Customer' : 'AI';
    return `${prefix}: ${msg.text}`;
  }).join('\n');

  callDoc.conversationTranscript = transcript;
  
  return callDoc;
}

/**
 * Get last customer message for context
 * @param {array} messages - Array of message objects
 * @returns {string}
 */
export function getLastCustomerMessage(messages) {
  if (!messages) return '';
  
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].text;
    }
  }
  
  return '';
}

/**
 * Get last AI message for repeat functionality
 * @param {array} messages - Array of message objects
 * @returns {string}
 */
export function getLastAIMessage(messages) {
  if (!messages) return '';
  
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return messages[i].text;
    }
  }
  
  return '';
}

/**
 * Format messages for AI processing
 * Convert MongoDB messages to format for LLM
 * @param {array} messages - Array of message objects
 * @returns {array}
 */
export function formatMessagesForLLM(messages) {
  if (!messages) return [];
  
  return messages.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.text
  }));
}

export default {
  detectConfusion,
  detectGoodbye,
  detectRepeat,
  detectSilence,
  detectAbuse,
  processConversation,
  updateTranscript,
  getLastCustomerMessage,
  getLastAIMessage,
  formatMessagesForLLM
};
