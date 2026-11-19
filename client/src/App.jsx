import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  Send,
  Play,
  RotateCcw,
  ShieldAlert,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Award,
  BookOpen,
  Flag,
  Bot,
  User,
  Code2,
  Printer,
  KeyRound,
  ExternalLink,
  Lock,
  Check,
} from 'lucide-react';

const TOTAL_QUESTIONS = 5;
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function ScoreRing({ percentage, label, strokeColor }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center bg-slate-950/90 border border-slate-800 rounded-2xl px-5 py-4 print-card">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg className="w-24 h-24 -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="7"
            fill="transparent"
            className="text-slate-800"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke={strokeColor}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <span className="absolute text-xl font-black text-white print-text-dark">
          {percentage}%
        </span>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-1 print-text-muted">
        {label}
      </span>
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [persona, setPersona] = useState('strict');

  // Mandatory BYOK States
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('vivabot_gemini_key') || '');
  const [keyInput, setKeyInput] = useState(() => localStorage.getItem('vivabot_gemini_key') || '');
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [editingKey, setEditingKey] = useState(() => !localStorage.getItem('vivabot_gemini_key'));

  const [vivaStarted, setVivaStarted] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  const [evaluating, setEvaluating] = useState(false);
  const [report, setReport] = useState(null);

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiThinking]);

  const handleVerifyAndSaveKey = async (e) => {
    e.preventDefault();
    const cleaned = keyInput.trim();
    if (!cleaned) {
      setKeyError('Pehle apni Gemini API key paste karein.');
      return;
    }

    setVerifyingKey(true);
    setKeyError('');

    try {
      await axios.post('http://localhost:5000/api/verify-key', {
        userApiKey: cleaned,
      });
      setUserApiKey(cleaned);
      localStorage.setItem('vivabot_gemini_key', cleaned);
      setEditingKey(false);
      setError('');
    } catch (err) {
      setKeyError(err.response?.data?.error || 'API Key verify nahi ho paayi.');
    } finally {
      setVerifyingKey(false);
    }
  };

  const handleRemoveKey = () => {
    setUserApiKey('');
    setKeyInput('');
    localStorage.removeItem('vivabot_gemini_key');
    setEditingKey(true);
    resetAll();
  };

  const speakText = (text) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 1.02;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Aapka browser Voice Mic support nahi karta. Chrome use karein ya type karein.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    window.speechSynthesis?.cancel();
    setIsSpeaking(false);

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setUserAnswer((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!userApiKey) {
      setError('Pehle apni Gemini API Key add karein.');
      return;
    }
    if (!file) {
      setError('Pehle koi assignment PDF ya code file select karein.');
      return;
    }

    const formData = new FormData();
    formData.append('document', file);

    setLoading(true);
    setError('');

    try {
      const res = await axios.post('http://localhost:5000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setParsedData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Backend se connect nahi ho paaya.');
    } finally {
      setLoading(false);
    }
  };

  const startViva = async () => {
    if (!userApiKey) {
      setEditingKey(true);
      return;
    }

    setVivaStarted(true);
    setReport(null);
    setAiThinking(true);
    setChatHistory([]);
    setQuestionCount(1);
    setError('');

    try {
      const res = await axios.post('http://localhost:5000/api/viva', {
        extractedText: parsedData.extractedText,
        persona,
        chatHistory: [],
        questionNumber: 1,
        totalQuestions: TOTAL_QUESTIONS,
        userApiKey,
      });
      setChatHistory([{ role: 'ai', text: res.data.reply }]);
      speakText(res.data.reply);
    } catch (err) {
      setError(err.response?.data?.error || 'Viva start karne mein error aaya.');
      setVivaStarted(false);
    } finally {
      setAiThinking(false);
    }
  };

  const generateFinalReport = async (finalHistory) => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setEvaluating(true);
    try {
      const res = await axios.post('http://localhost:5000/api/evaluate', {
        extractedText: parsedData.extractedText,
        chatHistory: finalHistory,
        persona,
        userApiKey,
      });
      setReport(res.data.report);
    } catch (err) {
      setError(err.response?.data?.error || 'Scorecard generate nahi ho paaya.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleSendAnswer = async (e) => {
    e.preventDefault();
    if (!userAnswer.trim() || aiThinking || evaluating) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const updatedHistory = [...chatHistory, { role: 'user', text: userAnswer.trim() }];
    setChatHistory(updatedHistory);
    setUserAnswer('');

    if (questionCount >= TOTAL_QUESTIONS) {
      await generateFinalReport(updatedHistory);
      return;
    }

    const nextQ = questionCount + 1;
    setAiThinking(true);

    try {
      const res = await axios.post('http://localhost:5000/api/viva', {
        extractedText: parsedData.extractedText,
        persona,
        chatHistory: updatedHistory,
        questionNumber: nextQ,
        totalQuestions: TOTAL_QUESTIONS,
        userApiKey,
      });
      setChatHistory([...updatedHistory, { role: 'ai', text: res.data.reply }]);
      setQuestionCount(nextQ);
      speakText(res.data.reply);
    } catch (err) {
      setError(err.response?.data?.error || 'AI se reply nahi mil paaya.');
    } finally {
      setAiThinking(false);
    }
  };

  const resetAll = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setParsedData(null);
    setFile(null);
    setVivaStarted(false);
    setChatHistory([]);
    setQuestionCount(0);
    setReport(null);
    setError('');
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Top Navbar */}
      <header className="no-print border-b border-indigo-900/40 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-400 to-teal-400 flex items-center justify-center font-black text-slate-950 text-lg shadow-lg shadow-teal-500/20">
              V
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-white">VivaBot</h1>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/30">
                  BYOK Edition
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">AI Assignment & Project Examiner</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {userApiKey && (
              <button
                onClick={() => setEditingKey(!editingKey)}
                className="text-xs font-semibold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 hover:border-emerald-400 cursor-pointer transition"
              >
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                <span>API Key Active</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </button>
            )}

            {vivaStarted && !report && (
              <>
                <button
                  onClick={() => {
                    window.speechSynthesis?.cancel();
                    setIsSpeaking(false);
                    setVoiceEnabled(!voiceEnabled);
                  }}
                  title="Toggle AI Voice"
                  className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:border-teal-500/50 cursor-pointer transition"
                >
                  {voiceEnabled ? <Volume2 className="w-4 h-4 text-teal-400" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-indigo-950/90 border border-indigo-500/50 text-indigo-200">
                  Q {questionCount}/{TOTAL_QUESTIONS}
                </span>
              </>
            )}

            {parsedData && (
              <button
                onClick={resetAll}
                className="text-xs font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 cursor-pointer transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">New File</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-6 py-8 flex-1 flex flex-col">
        {/* MANDATORY API KEY GATE + STEP-BY-STEP GUIDE */}
        {(!userApiKey || editingKey) && (
          <div className="max-w-3xl mx-auto w-full mb-8 bg-slate-900/95 border border-teal-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/40 flex items-center justify-center shrink-0">
                  <KeyRound className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-white">
                    Step 1: Apni Free Gemini API Key Connect Karein
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    VivaBot aapki personal API key par chalta hai—bina key ke viva start nahi hoga.
                  </p>
                </div>
              </div>
              {userApiKey && (
                <button
                  onClick={() => setEditingKey(false)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>

            {/* 3-Step Visual Guide */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                  Step 1
                </span>
                <p className="text-xs font-bold text-white mt-2">Google AI Studio Kholein</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Neeche diye button se apni Gmail ID ke saath login karein.
                </p>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-teal-400 hover:text-teal-300"
                >
                  Get Free Key <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                  Step 2
                </span>
                <p className="text-xs font-bold text-white mt-2">"Create API Key" Dabayein</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Koi bhi project select karke <code className="text-teal-300">AIza...</code> wali key copy karein (100% Free).
                </p>
              </div>

              <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                  Step 3
                </span>
                <p className="text-xs font-bold text-white mt-2">Yahan Paste Karke Activate Karein</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Key sirf aapke browser ke local storage mein safe rehti hai.
                </p>
              </div>
            </div>

            {/* Key Input Form */}
            <form onSubmit={handleVerifyAndSaveKey} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Apni Gemini API Key yahan paste karein (AIzaSy...)"
                  className="flex-1 bg-slate-950 border border-slate-700 focus:border-teal-400 rounded-xl px-4 py-3.5 text-sm text-white outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={verifyingKey}
                  className="px-6 py-3.5 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer transition shrink-0"
                >
                  {verifyingKey ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Verify & Unlock VivaBot
                    </>
                  )}
                </button>
              </div>

              {keyError && (
                <div className="flex items-center gap-2 text-amber-300 bg-amber-950/40 border border-amber-800/60 px-4 py-2.5 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{keyError}</span>
                </div>
              )}

              {userApiKey && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleRemoveKey}
                    className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Remove Saved Key & Lock App
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* VIEW 1: UPLOAD & PERSONA SETUP (Locked until API Key is verified) */}
        {!vivaStarted && (
          <div className={`max-w-3xl mx-auto w-full relative ${!userApiKey ? 'opacity-45 pointer-events-none select-none' : ''}`}>
            {!userApiKey && (
              <div className="mb-4 flex items-center justify-center gap-2 text-xs font-bold text-amber-300 bg-amber-950/50 border border-amber-700/50 py-2.5 px-4 rounded-xl">
                <Lock className="w-4 h-4" />
                Upar Step 1 mein apni Gemini API Key verify karne ke baad neeche file upload unlock hogi.
              </div>
            )}

            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-white sm:text-5xl tracking-tight leading-tight">
                Apne Assignment ko <span className="bg-gradient-to-r from-teal-400 to-indigo-400 bg-clip-text text-transparent">Live Viva</span> mein Badlein
              </h2>
              <p className="mt-3 text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
                Apni lab file, project report (PDF), ya source code upload karein. VivaBot 5 sharp cross-questions poochkar aapki readiness score karega.
              </p>
            </div>

            <div className="bg-slate-900/90 backdrop-blur border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl">
              <label className="group flex flex-col items-center justify-center border-2 border-dashed border-indigo-700/60 hover:border-teal-400 rounded-2xl p-9 cursor-pointer transition bg-slate-950/60 hover:bg-slate-950">
                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                  <UploadCloud className="w-7 h-7 text-teal-400" />
                </div>
                <span className="text-base font-bold text-white">
                  {file ? file.name : 'Click karke PDF, TXT, ya Code File chunein'}
                </span>
                <span className="text-xs text-slate-400 mt-1">
                  Supports .pdf, .txt, .md, .py, .js, .cpp, .java (Max 10MB)
                </span>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.py,.js,.jsx,.cpp,.c,.java"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <div className="mt-7">
                <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">
                  Examiner Persona Chunein:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {[
                    { id: 'friendly', title: 'Friendly Mentor', desc: 'Hints ke saath basic concepts', badge: 'Easy' },
                    { id: 'strict', title: 'Strict External', desc: 'Deep "Why" & Bluff Detector', badge: 'Recommended' },
                    { id: 'rapid', title: 'Rapid-Fire Mode', desc: 'Tez conceptual cross-questions', badge: 'Hard' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setPersona(mode.id)}
                      className={`p-4 rounded-2xl border text-left transition cursor-pointer relative ${
                        persona === mode.id
                          ? 'bg-indigo-950/90 border-teal-400 text-white shadow-lg shadow-teal-500/10'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-teal-300">
                        {mode.badge}
                      </span>
                      <div className="font-bold text-sm mt-2 text-white">{mode.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="mt-5 flex items-center gap-2 text-amber-300 bg-amber-950/40 border border-amber-800/60 px-4 py-3 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!parsedData ? (
                <button
                  onClick={handleUpload}
                  disabled={loading || !userApiKey}
                  className="mt-6 w-full py-4 px-6 rounded-2xl font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-teal-500/20"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Document Analyze Ho Raha Hai...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Extract & Prepare Viva
                    </>
                  )}
                </button>
              ) : (
                <div className="mt-6 bg-slate-950 border border-teal-500/40 rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-teal-400" />
                      <span className="font-bold text-sm text-white">{parsedData.fileName}</span>
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-teal-950 text-teal-300 border border-teal-800">
                      {parsedData.wordCount} words ready
                    </span>
                  </div>
                  <button
                    onClick={startViva}
                    className="w-full py-4 px-6 rounded-2xl font-bold text-white bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-500/25"
                  >
                    <Play className="w-5 h-5" />
                    Start 5-Question Live Viva ({persona.toUpperCase()})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: SPLIT-SCREEN LIVE VIVA ARENA */}
        {vivaStarted && !report && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
                      isSpeaking
                        ? 'bg-teal-500/20 border-teal-400 shadow-lg shadow-teal-500/30 scale-105'
                        : 'bg-indigo-950 border-indigo-700'
                    }`}
                  >
                    <Bot className={`w-6 h-6 ${isSpeaking ? 'text-teal-300 animate-bounce' : 'text-indigo-300'}`} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white capitalize">{persona} Examiner</div>
                    <div className="text-xs text-teal-400 flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isSpeaking ? 'bg-teal-400 animate-ping' : 'bg-emerald-400'
                        }`}
                      />
                      {isSpeaking ? 'Speaking Question...' : aiThinking ? 'Analyzing Answer...' : 'Listening for Answer'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Bluff Detector Engine</span>
                  <span className="flex items-center gap-1 text-amber-400 font-semibold bg-amber-950/50 px-2.5 py-1 rounded-md border border-amber-800/50">
                    <ShieldAlert className="w-3.5 h-3.5" /> Active
                  </span>
                </div>
              </div>

              <div className="hidden lg:flex flex-col flex-1 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 overflow-hidden">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                  <Code2 className="w-4 h-4 text-teal-400" />
                  Submitted Reference
                </div>
                <div className="text-xs font-semibold text-indigo-300 mb-2 truncate">{parsedData.fileName}</div>
                <div className="flex-1 bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 text-xs text-slate-400 overflow-y-auto max-h-[340px] leading-relaxed font-mono">
                  {parsedData.extractedText}
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <FileText className="w-4 h-4 text-teal-400" />
                  <span className="font-semibold">Live Oral Examination</span>
                </div>
                {chatHistory.length >= 2 && (
                  <button
                    onClick={() => generateFinalReport(chatHistory)}
                    disabled={evaluating}
                    className="text-xs font-semibold flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-lg cursor-pointer transition"
                  >
                    <Flag className="w-3.5 h-3.5" /> Finish & Score Now
                  </button>
                )}
              </div>

              <div className="w-full bg-slate-800 h-1.5">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-teal-400 to-emerald-400 h-1.5 transition-all duration-500"
                  style={{ width: `${(questionCount / TOTAL_QUESTIONS) * 100}%` }}
                />
              </div>

              {error && (
                <div className="mx-5 mt-4 flex items-center gap-2 text-amber-300 bg-amber-950/60 border border-amber-700 px-4 py-2.5 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex-1 p-5 overflow-y-auto space-y-4 max-h-[55vh]">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'ai' && (
                      <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-4 h-4 text-teal-400" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed shadow-md ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-none'
                          : 'bg-slate-800/95 border border-slate-700/80 text-slate-100 rounded-bl-none'
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1 font-bold">
                        {msg.role === 'user' ? 'Student' : `Examiner (${persona})`}
                      </div>
                      {msg.text}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 mt-1">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                ))}

                {aiThinking && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-teal-400" />
                    </div>
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-teal-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Examiner agla cross-question taiyar kar raha hai...
                    </div>
                  </div>
                )}

                {evaluating && (
                  <div className="flex justify-center py-6">
                    <div className="bg-indigo-950/90 border border-teal-400/50 rounded-2xl px-6 py-4 text-sm text-teal-300 flex items-center gap-3 shadow-xl">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Viva Complete! Readiness Scorecard & Revision Sheet generate ho rahi hai...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={handleSendAnswer}
                className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-2.5"
              >
                <button
                  type="button"
                  onClick={toggleListening}
                  title="Bolkar jawab dein"
                  className={`p-3.5 rounded-xl border transition cursor-pointer ${
                    isListening
                      ? 'bg-rose-600 border-rose-400 text-white animate-pulse shadow-lg shadow-rose-500/30'
                      : 'bg-slate-900 border-slate-700 text-teal-400 hover:border-teal-400'
                  }`}
                >
                  {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder={
                    isListening
                      ? 'Sun raha hoon... apna jawab bolein'
                      : `Question ${questionCount}/${TOTAL_QUESTIONS} ka jawab likhein ya mic dabayein...`
                  }
                  className="flex-1 bg-slate-900 border border-slate-700 focus:border-teal-400 rounded-xl px-4 py-3.5 text-sm text-white outline-none"
                  disabled={aiThinking || evaluating}
                />

                <button
                  type="submit"
                  disabled={aiThinking || evaluating || !userAnswer.trim()}
                  className="bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 disabled:opacity-40 text-slate-950 font-bold px-5 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer transition"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {questionCount >= TOTAL_QUESTIONS ? 'Finish' : 'Send'}
                  </span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* VIEW 3: FINAL SCORECARD & PRINTABLE CHEAT SHEET */}
        {report && (
          <div className="space-y-6 max-w-4xl mx-auto w-full">
            <div className="bg-gradient-to-br from-indigo-950/90 via-slate-900 to-slate-900 border border-teal-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl print-card">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-teal-400 text-xs font-extrabold uppercase tracking-wider mb-2 print-text-dark">
                    <Award className="w-4 h-4" /> VivaBot Official Readiness Report
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white print-text-dark">
                    Examiner Verdict
                  </h2>
                  <p className="mt-2.5 text-slate-300 text-sm leading-relaxed print-text-muted">
                    {report.verdict}
                  </p>
                  <div className="mt-3 inline-block text-xs font-semibold px-3 py-1 rounded-full bg-slate-950 border border-slate-700 text-indigo-300 print-card">
                    File: {parsedData?.fileName} • Mode: {persona.toUpperCase()}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <ScoreRing
                    percentage={report.readinessScore}
                    label="Readiness"
                    strokeColor="#2dd4bf"
                  />
                  <ScoreRing
                    percentage={report.conceptClarity}
                    label="Clarity"
                    strokeColor="#818cf8"
                  />
                </div>
              </div>
            </div>

            {report.bluffAlerts && report.bluffAlerts.length > 0 && (
              <div className="bg-amber-950/25 border border-amber-700/50 rounded-2xl p-6 print-card">
                <h3 className="text-amber-400 font-bold text-sm uppercase tracking-wider flex items-center gap-2 mb-3 print-text-dark">
                  <ShieldAlert className="w-4 h-4" /> Bluff Detector Alerts (Yahan Examiner Pakad Sakta Hai)
                </h3>
                <ul className="space-y-2 text-sm text-amber-100/90 list-disc pl-5 print-text-muted">
                  {report.bluffAlerts.map((alert, idx) => (
                    <li key={idx}>{alert}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 print-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-base flex items-center gap-2 print-text-dark">
                  <BookOpen className="w-5 h-5 text-teal-400" />
                  Last-Minute Revision Cheat Sheet
                </h3>
                <button
                  onClick={() => window.print()}
                  className="no-print text-xs font-semibold flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl cursor-pointer transition shadow-md"
                >
                  <Printer className="w-3.5 h-3.5" /> Save / Print PDF
                </button>
              </div>

              <div className="space-y-3">
                {report.cheatSheet?.map((item, idx) => (
                  <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 print-card">
                    <div className="text-xs font-bold text-teal-400 mb-1 print-text-dark">
                      Q{idx + 1}: {item.question}
                    </div>
                    <div className="text-sm text-slate-300 leading-relaxed print-text-muted">
                      {item.crispAnswer}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="no-print flex justify-center gap-4 pt-2">
              <button
                onClick={startViva}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm cursor-pointer transition"
              >
                Retake Viva (Same File)
              </button>
              <button
                onClick={resetAll}
                className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm cursor-pointer transition"
              >
                Upload New Assignment
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}