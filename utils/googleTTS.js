import * as ttsLibrary from '@google-cloud/text-to-speech';
import cloudinary from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ✅ INITIALIZE GOOGLE TTS CLIENT
let ttsClient = null;
let ttsInitialized = false;

try {
  const apiKey = process.env.GOOGLE_TTS_API_KEY?.trim();
  
  if (!apiKey) {
    console.error('❌ [TTS] GOOGLE_TTS_API_KEY is not set in environment variables');
  } else {
    const TextToSpeechClient = ttsLibrary.TextToSpeechClient;
    ttsClient = new TextToSpeechClient({
      apiKey: apiKey
    });
    ttsInitialized = true;
    console.log('✅ [TTS] Google Cloud Text-to-Speech client initialized');
    console.log(`   API Key: ${apiKey.substring(0, 15)}...`);
  }
} catch (initError) {
  console.error('❌ [TTS] Failed to initialize Google TTS client:', initError.message);
  console.error('   Stack:', initError.stack);
  ttsInitialized = false;
}

// ✅ INITIALIZE CLOUDINARY
try {
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ [CLOUDINARY] Configured for audio storage');
} catch (error) {
  console.error('❌ [CLOUDINARY] Configuration failed:', error.message);
}

/**
 * ✅ CONVERT TEXT TO SPEECH USING GOOGLE TTS
 * @param {string} text - Text to convert
 * @returns {Promise<string>} - Cloudinary URL of the audio file or null if failed
 */
export async function textToSpeech(text) {
  try {
    if (!ttsInitialized || !ttsClient) {
      console.warn('⚠️  [TTS] Google TTS client not initialized - will use Polly fallback');
      return null;
    }

    if (!text || text.trim().length === 0) {
      console.warn('⚠️  [TTS] Empty text provided');
      return null;
    }

    console.log(`\n🎤 [TTS] Converting to Google TTS audio...`);
    console.log(`   Text: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);

    // ✅ BUILD TTS REQUEST
    const request = {
      input: { text: text },
      voice: {
        languageCode: 'hi-IN',
        name: 'hi-IN-Neural2-A',  // Indian female, neural quality
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.9,  // Slightly slower for clarity
        pitch: 0,  // Neutral pitch
        volumeGainDb: 0
      }
    };

    // ✅ CALL GOOGLE TTS API
    let response;
    try {
      [response] = await ttsClient.synthesizeSpeech(request);
    } catch (apiError) {
      console.warn(`⚠️  [TTS] Google API error - switching to Polly fallback`);
      console.warn(`   Reason: ${apiError.message}`);
      return null;
    }
    
    if (!response.audioContent) {
      console.warn('⚠️  [TTS] No audio content in response - using Polly fallback');
      return null;
    }

    console.log(`✅ [TTS] Audio synthesized (${response.audioContent.length} bytes)`);

    // ✅ UPLOAD TO CLOUDINARY
    try {
      console.log(`📤 Uploading to Cloudinary...`);
      
      // Create temp file path
      const filename = `tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`;
      const tempFilePath = path.join(__dirname, '..', 'temp', filename);
      
      // Ensure temp directory exists
      const tempDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Write audio to temp file
      fs.writeFileSync(tempFilePath, response.audioContent, 'binary');

      // Upload to Cloudinary
      const uploadResult = await cloudinary.v2.uploader.upload(tempFilePath, {
        resource_type: 'auto',
        folder: 'service-agent-tts',
        public_id: filename.replace('.mp3', ''),
        format: 'mp3',
        quality: 'auto'
      });

      console.log(`✅ [CLOUDINARY] Audio uploaded`);

      // ✅ CLEANUP TEMP FILE
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.warn(`⚠️  Failed to cleanup temp file`);
      }

      return uploadResult.secure_url;

    } catch (uploadError) {
      console.warn(`⚠️  [TTS] Cloudinary upload failed - using Polly fallback`);
      console.warn(`   Reason: ${uploadError.message}`);
      return null;
    }

  } catch (error) {
    console.warn(`⚠️  [TTS] Unexpected error - falling back to Polly`);
    console.warn(`   Error: ${error.message}`);
    return null;
  }
}

/**
 * ✅ CACHE FOR FREQUENTLY USED MESSAGES
 * Maps text hash to audio URL to avoid re-synthesizing same messages
 */
const audioCache = new Map();

/**
 * ✅ GET OR CREATE AUDIO WITH CACHING
 * @param {string} text - Text to convert
 * @returns {Promise<string>} - Cloudinary URL
 */
export async function getOrCreateAudio(text) {
  if (!text) return null;

  // Create simple hash for caching
  const hash = Buffer.from(text).toString('base64').substring(0, 16);

  // Check cache first
  if (audioCache.has(hash)) {
    console.log(`✅ [CACHE] Using cached audio for: "${text.substring(0, 40)}..."`);
    return audioCache.get(hash);
  }

  // Generate new audio
  const audioUrl = await textToSpeech(text);
  
  if (audioUrl) {
    audioCache.set(hash, audioUrl);
    console.log(`💾 [CACHE] Audio cached for future use`);
  }

  return audioUrl;
}

/**
 * ✅ CREATE TWIML GATHER WITH GOOGLE TTS (WITH POLLY FALLBACK)
 * @param {object} twiml - Twilio VoiceResponse object
 * @param {string} text - Text to speak
 * @param {string} callSid - Current call ID
 * @param {object} options - Additional gather options
 * @returns {Promise<void>}
 */
export async function createGatherWithTTS(twiml, text, callSid, options = {}) {
  try {
    if (!text) {
      console.error('❌ [GATHER] No text provided');
      return;
    }

    const audioUrl = await getOrCreateAudio(text);

    // ✅ PRIMARY: Use Google TTS audio if available
    if (audioUrl) {
      console.log(`✅ [GATHER] Using Google TTS audio`);
      const gather = twiml.gather({
        input: 'speech',
        language: 'hi-IN',
        speechTimeout: 5,
        timeout: 8,
        action: `/voice/process?callSid=${callSid}`,
        method: 'POST',
        maxSpeechTime: 15,
        numDigits: 1,
        ...options
      });
      gather.play(audioUrl);
      return;
    }

    // ✅ FALLBACK: Use Polly.Aditi if Google TTS failed
    console.log(`🔄 [GATHER] Falling back to Polly.Aditi voice`);
    const gather = twiml.gather({
      input: 'speech',
      language: 'hi-IN',
      speechTimeout: 5,
      timeout: 8,
      action: `/voice/process?callSid=${callSid}`,
      method: 'POST',
      maxSpeechTime: 15,
      numDigits: 1,
      ...options
    });
    gather.say(text, {
      language: 'hi-IN',
      voice: 'Polly.Aditi',
      engine: 'neural'
    });

  } catch (error) {
    console.error('❌ [GATHER] Unexpected error:', error.message);
    // Emergency fallback to text
    const gather = twiml.gather({
      input: 'speech',
      language: 'hi-IN',
      speechTimeout: 5,
      timeout: 8,
      action: `/voice/process?callSid=${callSid}`,
      method: 'POST',
      maxSpeechTime: 15,
      numDigits: 1,
      ...options
    });
    gather.say(text, {
      language: 'hi-IN',
      voice: 'Polly.Aditi',
      engine: 'neural'
    });
  }
}

/**
 * ✅ CREATE SAY RESPONSE WITH GOOGLE TTS (WITH POLLY FALLBACK)
 * @param {object} twiml - Twilio VoiceResponse object
 * @param {string} text - Text to speak
 * @returns {Promise<void>}
 */
export async function sayWithTTS(twiml, text) {
  try {
    if (!text) {
      console.error('❌ [SAY] No text provided');
      return;
    }

    const audioUrl = await getOrCreateAudio(text);

    // ✅ PRIMARY: Use Google TTS audio if available
    if (audioUrl) {
      console.log(`✅ [SAY] Playing Google TTS audio`);
      twiml.play(audioUrl);
      return;
    }

    // ✅ FALLBACK: Use Polly.Aditi if Google TTS failed
    console.log(`🔄 [SAY] Falling back to Polly.Aditi voice`);
    twiml.say(text, {
      language: 'hi-IN',
      voice: 'Polly.Aditi',
      engine: 'neural'
    });

  } catch (error) {
    console.error('❌ [SAY] Unexpected error:', error.message);
    // Emergency fallback to Polly text
    twiml.say(text, {
      language: 'hi-IN',
      voice: 'Polly.Aditi',
      engine: 'neural'
    });
  }
}

export default {
  textToSpeech,
  getOrCreateAudio,
  createGatherWithTTS,
  sayWithTTS
};
