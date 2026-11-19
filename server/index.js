const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const PREFERRED_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.8-pro',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

function getUserAIClient(userApiKey) {
  if (!userApiKey || !userApiKey.trim()) {
    const err = new Error('Gemini API Key required hai. Pehle apni API key enter karein.');
    err.status = 401;
    throw err;
  }
  return new GoogleGenAI({
    apiKey: userApiKey.trim(),
    apiVersion: 'v1beta',
  });
}

// Auto-discovers working models directly from the user's API key if preferred names return 404
async function generateWithUserKey(params, userApiKey) {
  const ai = getUserAIClient(userApiKey);
  let lastError;

  // 1. Try preferred models first
  for (const model of PREFERRED_MODELS) {
    try {
      const response = await ai.models.generateContent({
        ...params,
        model,
      });
      console.log(`Success with model: ${model}`);
      return response;
    } catch (err) {
      lastError = err;
      if (err.status === 401 || err.status === 403) throw err; // Invalid key, stop immediately
      console.warn(`Model ${model} skipped (${err.status || err.message})`);
    }
  }

  // 2. Dynamically list all models enabled on this API key and pick the best available one
  try {
    const pager = await ai.models.list();
    const availableModels = [];
    for await (const m of pager) {
      const cleanName = m.name.replace('models/', '');
      if (
        cleanName.includes('gemini') &&
        !cleanName.includes('embedding') &&
        !cleanName.includes('imagen') &&
        !cleanName.includes('veo')
      ) {
        availableModels.push(cleanName);
      }
    }

    console.log('Models enabled on your API key:', availableModels);

    for (const model of availableModels) {
      if (PREFERRED_MODELS.includes(model)) continue;
      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
        });
        console.log(`Auto-selected working model: ${model}`);
        return response;
      } catch (err) {
        lastError = err;
      }
    }
  } catch (listErr) {
    console.error('Model list error:', listErr.message);
  }

  throw lastError;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get('/', (req, res) => {
  res.send('VivaBot Backend is Running (Auto-Model Detection + Strict BYOK)!');
});

/// Verify User's Gemini API Key (No strict prefix restriction)
app.post('/api/verify-key', async (req, res) => {
  const { userApiKey } = req.body;
  const cleanedKey = (userApiKey || '').replace(/['"\s]/g, '').trim();

  if (!cleanedKey) {
    return res.status(401).json({
      error: 'Pehle apni API key paste karein.',
    });
  }

  try {
    await generateWithUserKey(
      {
        contents: 'Reply with OK',
      },
      cleanedKey
    );
    res.json({ success: true, message: 'API Key verified successfully!' });
  } catch (error) {
    console.error('Exact Verify Error:', error);
    const msg = error.message || '';
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Is key ka free quota limit exceed ho gaya hai (429). Doosri Gmail ID se key banayein.',
      });
    }
    res.status(401).json({
      error: `Google API Error (${error.status || '400'}): ${msg.slice(0, 140)}`,
    });
  }
});
// Phase 1: File Upload & Text Extraction
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Koi file upload nahi hui hai.' });
    }

    const { originalname, mimetype, buffer } = req.file;
    let extractedText = '';

    if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text;
    } else {
      extractedText = buffer.toString('utf-8');
    }

    const cleanedText = extractedText.replace(/\s+/g, ' ').trim();

    if (!cleanedText || cleanedText.length < 30) {
      return res.status(400).json({
        error: 'File mein readable text bahut kam hai (scanned image PDF ho sakti hai).',
      });
    }

    res.json({
      success: true,
      fileName: originalname,
      wordCount: cleanedText.split(' ').length,
      extractedText: cleanedText,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: 'File parse karne mein dikkat aayi.' });
  }
});

// Phase 2: Live AI Viva Examiner
app.post('/api/viva', async (req, res) => {
  const { extractedText, persona, chatHistory, questionNumber, totalQuestions, userApiKey } = req.body;

  if (!userApiKey || !userApiKey.trim()) {
    return res.status(401).json({ error: 'Viva start karne ke liye apni Gemini API Key enter karein.' });
  }
  if (!extractedText) {
    return res.status(400).json({ error: 'Document text missing hai.' });
  }

  const personaPrompts = {
    friendly:
      'You are a supportive college mentor taking a viva. Ask clear conceptual questions from the student’s document. If their previous answer is incomplete, gently give a tiny hint before asking the next question.',
    strict:
      'You are a strict external university examiner with a "Bluff Detector" mindset. Dig deep into "Why" and "How" of the student’s document. If their previous answer sounds vague or copy-pasted, call it out sharply in 1 sentence and ask a tough counter-question.',
    rapid:
      'You are conducting a fast-paced Rapid-Fire viva. Ask short, direct, high-pressure conceptual questions (under 20 words) based strictly on the document.',
  };

  const systemInstruction = `
${personaPrompts[persona] || personaPrompts.strict}

CURRENT PROGRESS: Asking Question ${questionNumber || 1} of ${totalQuestions || 5}.

RULES:
1. Base ALL questions strictly on the provided STUDENT DOCUMENT below.
2. Ask ONLY ONE crisp question at a time. Never give a list of questions.
3. Keep response concise (max 2-3 sentences: 1 brief reaction to their last answer + 1 next cross-question).
4. Do not repeat topics already asked in chat history.

STUDENT DOCUMENT:
"""
${extractedText.slice(0, 12000)}
"""
`;

  const contents =
    chatHistory && chatHistory.length > 0
      ? chatHistory.map((msg) => ({
          role: msg.role === 'ai' ? 'model' : 'user',
          parts: [{ text: msg.text }],
        }))
      : [
          {
            role: 'user',
            parts: [{ text: 'Start the viva now with Question 1 based on my document.' }],
          },
        ];

  try {
    const response = await generateWithUserKey(
      {
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      },
      userApiKey
    );

    res.json({
      success: true,
      reply: response.text,
    });
  } catch (error) {
    console.error('Viva Error:', error.status, error.message);
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Aapki API key ka free quota exceed ho gaya hai (429). Doosri Gmail ID se key banayein.',
      });
    }
    res.status(500).json({
      error: `AI Error (${error.status || '500'}): ${(error.message || '').slice(0, 120)}`,
    });
  }
});

// Phase 4: Final Evaluation, Bluff Report & Cheat Sheet Generator
app.post('/api/evaluate', async (req, res) => {
  const { extractedText, chatHistory, persona, userApiKey } = req.body;

  if (!userApiKey || !userApiKey.trim()) {
    return res.status(401).json({ error: 'Scorecard generate karne ke liye Gemini API Key required hai.' });
  }

  const transcript = chatHistory
    .map((m) => `${m.role === 'ai' ? 'Examiner' : 'Student'}: ${m.text}`)
    .join('\n');

  const prompt = `
You are evaluating a student's oral viva performance based on their submitted document and the viva transcript below.

STUDENT DOCUMENT:
"""
${extractedText.slice(0, 10000)}
"""

VIVA TRANSCRIPT (Mode: ${persona}):
"""
${transcript}
"""

Return ONLY valid JSON (no markdown code blocks) with this exact structure:
{
  "readinessScore": 78,
  "conceptClarity": 80,
  "confidenceLevel": "Moderate",
  "verdict": "2-sentence honest examiner feedback summarizing strengths and weak spots.",
  "bluffAlerts": [
    "Specific point where the student gave a vague/weak answer or couldn't defend their document"
  ],
  "cheatSheet": [
    {
      "question": "Important viva question from their weak area",
      "crispAnswer": "2-line ideal answer to memorize before the real viva"
    }
  ]
}
`;

  try {
    const response = await generateWithUserKey(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.4,
        },
      },
      userApiKey
    );

    const report = JSON.parse(response.text);
    res.json({ success: true, report });
  } catch (error) {
    console.error('Evaluation Error:', error.status, error.message);
    res.status(500).json({
      error: `Scorecard Error (${error.status || '500'}): ${(error.message || '').slice(0, 120)}`,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});