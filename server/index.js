const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));

// In-memory cache for working Gemini models per key
const keyModelCache = new Map();

// Official latest Google Gemini Models (priority order)
const LATEST_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

function getUserAIClient(userApiKey) {
  const activeKey = (userApiKey && userApiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!activeKey || !activeKey.trim()) {
    const err = new Error('Gemini API Key required hai. Pehle apni API key enter karein.');
    err.status = 401;
    throw err;
  }
  return new GoogleGenAI({
    apiKey: activeKey.trim(),
    apiVersion: 'v1beta', // Crucial: v1beta is required for Gemini 2.5 and 2.0 models
  });
}

// Generates content using user's key with model prioritization & intelligent fallback
async function generateWithUserKey(params, userApiKey, requestedModel) {
  const cleanKey = (userApiKey && userApiKey.trim()) || (process.env.GEMINI_API_KEY || '').trim();
  const ai = getUserAIClient(cleanKey);
  let lastError;

  // Build model priority list
  const modelsToTry = [];
  if (requestedModel && requestedModel.trim()) {
    modelsToTry.push(requestedModel.trim());
  }
  const cachedModel = keyModelCache.get(cleanKey);
  if (cachedModel && !modelsToTry.includes(cachedModel)) {
    modelsToTry.push(cachedModel);
  }
  for (const m of LATEST_MODELS) {
    if (!modelsToTry.includes(m)) {
      modelsToTry.push(m);
    }
  }

  for (const model of modelsToTry) {
    try {
      const config = { ...(params.config || {}) };
      const response = await ai.models.generateContent({
        ...params,
        config,
        model,
      });

      keyModelCache.set(cleanKey, model);
      return { response, model };
    } catch (err) {
      lastError = err;
      console.warn(`[VivaBot AI] Model '${model}' failed:`, err?.status || err?.code, err?.message?.slice(0, 120));
      if (err.status === 401 || err.status === 403) throw err;
    }
  }

  throw lastError;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

// Helper for parsing PDF and code/text documents
async function parseUploadedBuffer(buffer, mimetype, originalname) {
  const lowerName = (originalname || '').toLowerCase();
  if (mimetype === 'application/pdf' || lowerName.endsWith('.pdf')) {
    try {
      const pdfModule = require('pdf-parse');
      if (typeof pdfModule === 'function') {
        const data = await pdfModule(buffer);
        return data.text || '';
      }
      if (pdfModule && pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        await parser.load();
        const res = await parser.getText();
        const text = typeof res === 'string' ? res : (res?.text || '');
        if (typeof parser.destroy === 'function') {
          try { await parser.destroy(); } catch (_) {}
        }
        return text;
      }
    } catch (pdfErr) {
      console.warn('PDF parsing notice:', pdfErr.message);
    }
  }
  return buffer.toString('utf-8');
}

// Root Status
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'VivaBot AI Examiner Backend',
    mode: 'BYOK (Bring Your Own Key) & Gemini 2.5/2.0 Latest Models',
    version: '2.1.0',
    supportedModels: LATEST_MODELS,
  });
});

// Verify User's Gemini API Key
app.post('/api/verify-key', async (req, res) => {
  const { userApiKey, requestedModel } = req.body;
  const cleanedKey = (userApiKey || '').replace(/['"\s]/g, '').trim();

  if (!cleanedKey) {
    return res.status(401).json({
      error: 'Pehle apni Gemini API key paste karein.',
    });
  }

  try {
    const { response, model } = await generateWithUserKey(
      {
        contents: 'Reply with the single word: READY',
      },
      cleanedKey,
      requestedModel
    );

    res.json({
      success: true,
      message: 'API Key verified successfully!',
      activeModel: model,
      preview: (response.text || 'READY').trim().slice(0, 30),
    });
  } catch (error) {
    console.error('Verify Key Error:', error?.status, error?.message);
    const msg = error.message || '';
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Is key ka free quota limit exceed ho gaya hai (429). Doosri Gmail ID se Google AI Studio mein nayi key banayein.',
      });
    }
    if (error.status === 401 || error.status === 403) {
      return res.status(401).json({
        error: 'API Key invalid ya unauthorized hai. Kripya sahi Google AI Studio key copy karein (AIza...).',
      });
    }
    res.status(400).json({
      error: `Gemini API Error (${error.status || '400'}): ${msg.slice(0, 140)}`,
    });
  }
});

// Pre-loaded Sample Projects for instant 1-click viva testing
app.get('/api/samples', (req, res) => {
  const samples = [
    {
      id: 'ecommerce-mern',
      title: 'Full-Stack E-Commerce Platform (MERN + Redis + Stripe)',
      type: 'Project Defense',
      words: 320,
      description: 'Production e-commerce app with JWT auth, MongoDB aggregations, Redis cart caching, and Stripe webhook payment processing.',
      content: `PROJECT REPORT: Scalable MERN E-Commerce Web Application
Architecture:
- Frontend: React 19, Tailwind CSS, Redux Toolkit for state management, Axios with interceptors.
- Backend: Node.js with Express, JWT authentication with HttpOnly cookies, RBAC (Role-Based Access Control).
- Database: MongoDB Atlas with Mongoose schema validation. Indexes added on product categories and slug fields.
- Caching: Redis used for user cart sessions and top-viewed product catalog caching with 15-minute TTL.
- Payments: Stripe API integrated with idempotency keys and secure webhook verification.
- Security: Helmet.js, rate limiting with express-rate-limit (100 req/15 min), sanitized inputs against NoSQL injection.
- Testing & CI/CD: Jest unit tests for payment calculations, Docker containerized deployment on AWS ECS with auto-scaling.
Key Tradeoff: Selected MongoDB over PostgreSQL for flexible product catalog schemas with arbitrary variant attributes.`,
    },
    {
      id: 'cnn-plant-disease',
      title: 'CNN Plant Disease Classifier (PyTorch + Transfer Learning)',
      type: 'Lab / Research Viva',
      words: 290,
      description: 'Deep Learning computer vision system using ResNet-50 and data augmentation to classify 38 crop disease classes.',
      content: `LAB REPORT: Automated Crop Leaf Disease Diagnosis Using Convolutional Neural Networks
Methodology & Implementation:
- Dataset: PlantVillage dataset containing 54,306 images across 14 crop species and 38 disease classes.
- Model Architecture: ResNet-50 pretrained on ImageNet. Replaced final classification layer with Dense(512, ReLU) -> Dropout(0.4) -> Dense(38, Softmax).
- Data Augmentation: Random horizontal/vertical flip, color jitter (brightness 0.2, contrast 0.2), and Affine rotation up to 20 degrees.
- Loss & Optimizer: Categorical Cross-Entropy Loss with Label Smoothing (0.1). AdamW optimizer with initial learning rate 1e-4 and Cosine Annealing LR scheduler.
- Results: Reached 98.4% top-1 accuracy on validation split. Used Grad-CAM heatmaps to verify attention focus on leaf lesion spots rather than background soil.
- Limitations: Model performance degrades by 12% under low-lighting field conditions without daylight normalization.`,
    },
    {
      id: 'microservices-banking',
      title: 'Distributed Core Banking Engine (Java + Spring Boot + Kafka)',
      type: 'Final Year Defense',
      words: 310,
      description: 'Event-driven core banking ledger with Kafka event sourcing, Saga pattern for 2PC distributed transactions, and Docker.',
      content: `CAPSTONE REPORT: High-Throughput Event-Driven Banking Ledger
System Overview:
- Architecture: Microservices architecture with Spring Boot 3.2, Spring Cloud Gateway, and Eureka Service Registry.
- Messaging: Apache Kafka cluster with 3 brokers. Transaction events published to 'account-events' topic with key-based partitioning.
- Transaction Model: Implemented Choreography-based Saga pattern to achieve eventual consistency across Account Service, Fraud Detection Service, and Notification Service, replacing blocking 2-Phase Commit (2PC).
- Ledger Storage: PostgreSQL with optimistic locking (@Version) to prevent double-spending anomalies during concurrent ATM and UPI withdrawals.
- Resilience: Resilience4j Circuit Breaker and retry policies on external payment gateway connectors.
- Observability: Micrometer and Prometheus metrics exported to Grafana dashboards with OpenTelemetry distributed tracing.
- Performance: Benchmarked at 12,500 transactions per second with p99 latency under 48ms under stress testing with Gatling.`,
    },
  ];
  res.json({ success: true, samples });
});

// Phase 1: File Upload & Text Extraction
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Koi file upload nahi hui hai.' });
    }

    const { originalname, mimetype, buffer } = req.file;
    const extractedText = await parseUploadedBuffer(buffer, mimetype, originalname);
    const cleanedText = (extractedText || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

    if (!cleanedText || cleanedText.length < 30) {
      return res.status(400).json({
        error: 'File mein readable text bahut kam hai. Agar yeh scanned image PDF hai toh searchable text PDF ya code file chunein.',
      });
    }

    const words = cleanedText.split(/\s+/).filter(Boolean);

    res.json({
      success: true,
      fileName: originalname,
      fileSize: (req.file.size / 1024).toFixed(1) + ' KB',
      wordCount: words.length,
      extractedText: cleanedText,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: 'File parse karne mein dikkat aayi: ' + (error.message || '') });
  }
});

// Phase 2: Live AI Viva Examiner
app.post('/api/viva', async (req, res) => {
  const {
    extractedText,
    persona = 'strict',
    languageMode = 'hinglish',
    chatHistory = [],
    questionNumber = 1,
    totalQuestions = 5,
    userApiKey,
    requestedModel,
  } = req.body;

  if (!userApiKey && !process.env.GEMINI_API_KEY) {
    return res.status(401).json({ error: 'Viva start karne ke liye apni Gemini API Key enter karein.' });
  }
  if (!extractedText) {
    return res.status(400).json({ error: 'Document text missing hai.' });
  }

  // Persona tone guidelines
  const personaPrompts = {
    friendly: `You are an encouraging, supportive internal college professor taking a viva.
Tone: Warm, conversational, educational.
Style: Ask clear conceptual questions from the student's submission. If their previous answer was incomplete or hesitant, offer a friendly 1-sentence hint or clarification before leading into the next question.`,
    strict: `You are a strict external university examiner with an active "Bluff Detector" mindset.
Tone: Sharp, analytical, demanding, skeptical.
Style: Dig deep into the "Why", "How", architecture tradeoffs, edge cases, and algorithmic complexity. If the student's answer sounded vague, buzzword-heavy, or memorized without true understanding, call out the bluff in 1 firm sentence and immediately challenge them with a tough technical counter-question.`,
    rapid: `You are conducting a fast-paced Rapid-Fire speed viva.
Tone: Quick, energetic, direct.
Style: Ask ultra-crisp, high-pressure conceptual questions (strictly under 15 words). No fluff. Test instantaneous recall and practical core logic.`,
  };

  // Language mode instructions
  const languageInstruction =
    languageMode === 'hinglish'
      ? `LANGUAGE: Speak in natural Indian campus Hinglish (blend of English technical terms and conversational Hindi, e.g. "Aapne MongoDB select kiya, but why not PostgreSQL? Agar ACID transactions chahiye hote toh kya tradeoff hota?"). Replicate authentic Indian college lab viva ambiance.`
      : `LANGUAGE: Speak in fluent, professional English.`;

  const systemInstruction = `
${personaPrompts[persona] || personaPrompts.strict}

${languageInstruction}

CURRENT PROGRESS: You are addressing Question ${questionNumber} of ${totalQuestions}.

CRITICAL VIVA RULES:
1. Base EVERY question strictly on the STUDENT DOCUMENT below. Target specific libraries, formulas, logic flows, or architectural claims they made.
2. Formulate ONLY ONE crisp question at a time. Never give bulleted questions or multiple questions.
3. Keep your total response length between 2 to 3 sentences maximum:
   - Sentence 1: Direct 1-sentence reaction or critique to the student's previous answer (highlighting what was good or where they bluffed/evaded).
   - Sentence 2-3: The next targeted cross-question.
4. Adapt to the student's previous answers in the chat history. Never ask about the exact same topic twice.

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
            parts: [{ text: `I am ready for the viva. Ask me Question 1 based on my submitted document.` }],
          },
        ];

  try {
    const { response, model } = await generateWithUserKey(
      {
        contents,
        config: {
          systemInstruction,
          temperature: persona === 'rapid' ? 0.3 : 0.65,
        },
      },
      userApiKey,
      requestedModel
    );

    res.json({
      success: true,
      reply: response.text,
      modelUsed: model,
    });
  } catch (error) {
    console.error('Viva Error:', error.status, error.message);
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Aapki API key ka free quota exceed ho gaya hai (429). Doosre Google account se key banayein.',
      });
    }
    res.status(500).json({
      error: `AI Error (${error.status || '500'}): ${(error.message || '').slice(0, 140)}`,
    });
  }
});

// Phase 4: Final Evaluation, Bluff Report & Revision Cheat Sheet
app.post('/api/evaluate', async (req, res) => {
  const {
    extractedText,
    chatHistory = [],
    persona = 'strict',
    userApiKey,
    requestedModel,
  } = req.body;

  if (!userApiKey && !process.env.GEMINI_API_KEY) {
    return res.status(401).json({ error: 'Scorecard generate karne ke liye Gemini API Key required hai.' });
  }

  const transcript = chatHistory
    .map((m) => `${m.role === 'ai' ? 'Examiner' : 'Student'}: ${m.text}`)
    .join('\n\n');

  const prompt = `
You are an expert senior engineering viva evaluator.
Evaluate the student's oral performance based on their submitted document and the full viva dialogue transcript below.

STUDENT DOCUMENT:
"""
${(extractedText || '').slice(0, 10000)}
"""

VIVA TRANSCRIPT (Mode: ${persona}):
"""
${transcript}
"""

Evaluate objectively and output a valid JSON response with this EXACT schema:
{
  "readinessScore": <number between 40 and 98 based on real depth shown>,
  "conceptClarity": <number between 40 and 98>,
  "confidenceLevel": "<'High' | 'Moderate' | 'Needs Practice'>",
  "verdict": "<2-3 sentence candid evaluation summarizing strengths and critical gaps for the real exam>",
  "strengths": [
    "<Key concept or logic the student explained well>"
  ],
  "bluffAlerts": [
    "<Specific moment where the student sounded vague, dodged the question, or showed weak conceptual depth>"
  ],
  "cheatSheet": [
    {
      "question": "<High-probability viva question from their weak or key areas>",
      "crispAnswer": "<2-line razor-sharp answer to memorize before the real viva>",
      "keyConcept": "<1-3 words concept tag>"
    }
  ]
}

CRITICAL: Return ONLY valid JSON. Do not wrap in markdown or backticks if possible, or keep it strict.
`;

  try {
    const { response, model } = await generateWithUserKey(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.35,
        },
      },
      userApiKey,
      requestedModel
    );

    let rawText = response.text || '';
    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    const report = JSON.parse(rawText);
    res.json({ success: true, report, modelUsed: model });
  } catch (error) {
    console.error('Evaluation Error:', error.status, error.message);
    res.status(500).json({
      error: `Scorecard Error (${error.status || '500'}): ${(error.message || '').slice(0, 140)}`,
    });
  }
});

app.listen(PORT, () => {
  console.log(`VivaBot Backend running on http://localhost:${PORT}`);
});
