// 🎙️ ELEVENLABS TTS SERVICE - Drop-in replacement for Polly
// This gives you 5x better voice quality

import axios from 'axios'; // npm install axios

// ✅ VOICE CONFIG - ElevenLabs
const ELEVENLABS_CONFIG = {
  apiKey: process.env.ELEVENLABS_API_KEY, // Get from elevenlabs.io
  voiceId: '21m00Tcm4TlvDq8ikWAM', // Priya (natural Hindi female)
  // Other options:
  // '3Z7KmBBbA5DL3H3Jvr7l' - Vikram (male, professional)
  // '5Q0Y4lIZmrzKBXzqDzc7' - Aditi (soft female)
  modelId: 'eleven_multilingual_v2', // Multilingual with better quality
  stability: 0.75, // 0-1, higher = more consistent
  similarityBoost: 0.75 // 0-1, higher = more similar to original voice
};

/**
 * ✅ GET AUDIO URL FROM ELEVENLABS
 * Returns a URL that Twilio can play
 */
async function getElevenLabsAudio(text) {
  try {
    if (!ELEVENLABS_CONFIG.apiKey) {
      console.error('❌ ELEVENLABS_API_KEY not set');
      return null;
    }

    console.log(`🎙️ Generating ElevenLabs audio: "${text.substring(0, 50)}..."`);

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_CONFIG.voiceId}`,
      {
        text: text,
        model_id: ELEVENLABS_CONFIG.modelId,
        voice_settings: {
          stability: ELEVENLABS_CONFIG.stability,
          similarity_boost: ELEVENLABS_CONFIG.similarityBoost
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_CONFIG.apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    // Save audio to temp file
    const filename = `/tmp/elevenlabs_${Date.now()}.mp3`;
    const fs = require('fs');
    fs.writeFileSync(filename, response.data);

    console.log(`✅ ElevenLabs audio generated: ${filename}`);
    return filename;

  } catch (error) {
    console.error('❌ ElevenLabs error:', error.message);
    return null;
  }
}

/**
 * ✅ GET STREAMING URL (Better for Twilio - direct play)
 * Returns URL that Twilio plays directly without saving files
 */
async function getElevenLabsStreamUrl(text) {
  try {
    if (!ELEVENLABS_CONFIG.apiKey) {
      console.error('❌ ELEVENLABS_API_KEY not set');
      return null;
    }

    // ElevenLabs has a public API endpoint that returns streaming URL
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_CONFIG.voiceId}/stream`,
      {
        text: text,
        model_id: ELEVENLABS_CONFIG.modelId,
        voice_settings: {
          stability: ELEVENLABS_CONFIG.stability,
          similarity_boost: ELEVENLABS_CONFIG.similarityBoost
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_CONFIG.apiKey,
          'Content-Type': 'application/json'
        }
      }
    );

    // Return the audio data that can be served directly
    return response.data;

  } catch (error) {
    console.error('❌ ElevenLabs stream error:', error.message);
    return null;
  }
}

/**
 * ✅ HELPER: Format text for better TTS
 * ElevenLabs handles this better than Polly, but still optimize
 */
function formatForElevenLabs(text) {
  if (!text) return text;

  let formatted = text
    // Replace Hindi pause markers with natural pauses
    .replace(/\s*\.\s*/g, '. ') // Clean up periods
    .replace(/\s*\?\s*/g, '? ') // Clean up questions
    // Keep text natural - ElevenLabs handles prosody well
    .trim();

  return formatted;
}

export { 
  getElevenLabsAudio, 
  getElevenLabsStreamUrl,
  formatForElevenLabs,
  ELEVENLABS_CONFIG 
};


// ═════════════════════════════════════════════════════════════════════
// 📌 IMPLEMENTATION IN YOUR ROUTES
// ═════════════════════════════════════════════════════════════════════

// BEFORE (Current code using Polly):
// sayWithClarity(gather, aiResponse.text, VOICE_CONFIG, true);

// AFTER (Using ElevenLabs):
// const audioFile = await getElevenLabsAudio(aiResponse.text);
// if (audioFile) {
//   gather.play(audioFile); // Play the better quality audio
// } else {
//   sayWithClarity(gather, aiResponse.text, VOICE_CONFIG, true); // Fallback to Polly
// }


// ═════════════════════════════════════════════════════════════════════
// 🔧 SETUP INSTRUCTIONS
// ═════════════════════════════════════════════════════════════════════

/*
1. INSTALL DEPENDENCIES:
   npm install elevenlabs axios

2. SIGN UP:
   - Go to elevenlabs.io
   - Create free account
   - Get API key from dashboard
   - Add to .env: ELEVENLABS_API_KEY=your_key_here

3. VOICE SELECTION:
   - 21m00Tcm4TlvDq8ikWAM (Priya) - Natural female, recommended for service
   - 3Z7KmBBbA5DL3H3Jvr7l (Vikram) - Professional male
   - 5Q0Y4lIZmrzKBXzqDzc7 (Aditi) - Soft female

4. PRICING:
   - Free tier: 10,000 characters/month
   - Paid: ~$5/month for 100k characters
   - Perfect for your use case

5. TO USE MULTIPLE VOICES:
   Modify getElevenLabsAudio() to accept voiceId parameter:
   
   async function getElevenLabsAudio(text, voiceId = ELEVENLABS_CONFIG.voiceId) {
     // ... same code but use voiceId parameter
   }
   
   Then call with: getElevenLabsAudio(text, '3Z7KmBBbA5DL3H3Jvr7l')
*/