/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Languages, Loader2, Video, VideoOff, Info, AlertCircle, History, Sparkles, Camera, Terminal, Trash2, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Constants ---
const MODEL_NAME = "gemini-2.0-flash";
const ANALYSIS_INTERVAL = 10000; // Increased to 10s to stay within free tier limits
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

export default function App() {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisTimerRef = useRef<number | null>(null);

  // --- State ---
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [transcription, setTranscription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{text: string, time: string}[]>([]);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [logs, setLogs] = useState<{time: string, msg: string, type: 'info' | 'error' | 'success'}[]>([]);
  const [showDebug, setShowDebug] = useState(true);

  // --- Helpers ---
  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 50));
    console.log(`[${type.toUpperCase()}] ${msg}`);
  };

  // --- API Key Verification ---
  useEffect(() => {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      addLog("API Key found in environment", "success");
    } else {
      addLog("API Key is missing from environment!", "error");
      setError("Gemini API Key is missing. Please add it to your environment variables.");
    }
  }, []);

  // --- Test AI Connection ---
  const testAIConnection = async () => {
    addLog("Testing AI connection...", "info");
    setIsModelLoading(true);
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("No API Key");

      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: [{ role: "user", parts: [{ text: "Hello, respond with 'Connection Successful' if you can read this." }] }]
      });
      
      const result = response.text?.trim();
      addLog(`AI Response: ${result}`, "success");
    } catch (err: any) {
      addLog(`AI Test Failed: ${err.message}`, "error");
      setError(`AI Test Failed: ${err.message}`);
    } finally {
      setIsModelLoading(false);
    }
  };

  // --- Camera Setup ---
  const startCamera = async () => {
    addLog("Starting camera...", "info");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: VIDEO_WIDTH }, height: { ideal: VIDEO_HEIGHT } },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        addLog("Camera active", "success");
      }
    } catch (err: any) {
      addLog(`Camera error: ${err.message}`, "error");
      setError(`Camera Error: ${err.message}`);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
      addLog("Camera stopped", "info");
      stopAnalysis();
    }
  };

  // --- Analysis Logic ---
  const analyzeFrame = async () => {
    if (!videoRef.current || !canvasRef.current || !isCameraActive) return;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    setIsModelLoading(true);
    addLog("Analyzing frame...", "info");
    try {
      const context = canvasRef.current.getContext('2d');
      if (!context) return;

      context.drawImage(videoRef.current, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      const base64Image = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];

      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [
              { text: "Look at this image. If you see sign language, translate it into a short English sentence. If not, respond with 'No signs'. Only output the translation." },
              { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]
          }
        ]
      });

      const result = response.text?.trim() || "";
      addLog(`AI Result: ${result}`, result === "No signs" ? "info" : "success");
      
      if (result && result !== "No signs") {
        setTranscription(result);
        setHistory(prev => [{ text: result, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 10));
      }
    } catch (err: any) {
      addLog(`Analysis failed: ${err.message}`, "error");
      if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
        setError("Rate limit exceeded. Auto-analysis has been stopped to save your quota. Please wait a minute before trying again.");
        stopAnalysis();
      }
    } finally {
      setIsModelLoading(false);
    }
  };

  const startAnalysis = () => {
    if (analysisTimerRef.current) return;
    setIsAnalyzing(true);
    analyzeFrame();
    analysisTimerRef.current = window.setInterval(analyzeFrame, ANALYSIS_INTERVAL);
    addLog("Auto-analysis started", "info");
  };

  const stopAnalysis = () => {
    if (analysisTimerRef.current) {
      clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
    setIsAnalyzing(false);
    setIsModelLoading(false);
    addLog("Auto-analysis stopped", "info");
  };

  // --- Lifecycle ---
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      stopAnalysis();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Languages className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none">SignSpeak <span className="text-emerald-500">AI</span></h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black mt-1.5">Debug & Translation Engine</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showDebug ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Terminal className="w-4 h-4" />
            </button>
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all",
              isAnalyzing ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-zinc-900/50 border-zinc-800 text-zinc-500"
            )}>
              <div className={cn("w-2 h-2 rounded-full", isAnalyzing ? "bg-emerald-500 animate-pulse" : "bg-zinc-700")} />
              {isAnalyzing ? "Live" : "Idle"}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Video Feed */}
        <div className="lg:col-span-8 space-y-8">
          <div className="relative aspect-video bg-zinc-900 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl group ring-1 ring-white/5">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover transition-opacity duration-1000",
                isCameraActive ? "opacity-100" : "opacity-0"
              )}
            />
            
            <canvas ref={canvasRef} width={VIDEO_WIDTH} height={VIDEO_HEIGHT} className="hidden" />

            {/* Overlay UI */}
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-8">
              <div className="flex justify-between items-start">
                {isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-2"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">AI Vision Engaged</span>
                  </motion.div>
                )}
              </div>

              <div className="flex justify-center pointer-events-auto">
                <div className="flex items-center gap-3 p-2.5 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-2xl">
                  <button
                    onClick={isCameraActive ? stopCamera : startCamera}
                    className={cn(
                      "p-4 rounded-2xl transition-all active:scale-90",
                      isCameraActive ? "bg-white/5 hover:bg-white/10 text-white" : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
                    )}
                  >
                    {isCameraActive ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                  </button>
                  
                  <div className="w-px h-10 bg-white/10 mx-1" />

                  <button
                    onClick={isAnalyzing ? stopAnalysis : startAnalysis}
                    disabled={!isCameraActive}
                    className={cn(
                      "px-10 py-4 rounded-2xl font-black text-xs flex items-center gap-4 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-[0.15em]",
                      isAnalyzing 
                        ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20" 
                        : "bg-emerald-500 hover:bg-emerald-600 text-black shadow-lg shadow-emerald-500/20"
                    )}
                  >
                    {isModelLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isAnalyzing ? (
                      <>Stop Auto</>
                    ) : (
                      <>Start Auto</>
                    )}
                  </button>

                  {!isAnalyzing && isCameraActive && (
                    <button
                      onClick={analyzeFrame}
                      disabled={isModelLoading}
                      className="p-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all active:scale-90"
                      title="Capture & Translate"
                    >
                      <Camera className="w-6 h-6" />
                    </button>
                  )}
                  
                  <button
                    onClick={testAIConnection}
                    disabled={isModelLoading}
                    className="p-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-2xl transition-all active:scale-90"
                    title="Test AI Connection"
                  >
                    <Play className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* Camera Offline State */}
            {!isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-8 bg-zinc-950/90 backdrop-blur-md">
                <div className="w-24 h-24 rounded-[2rem] bg-zinc-900 flex items-center justify-center border border-white/5 shadow-inner">
                  <VideoOff className="w-12 h-12 text-zinc-700" />
                </div>
                <div className="text-center space-y-3">
                  <p className="text-xl font-bold text-white tracking-tight">Camera is Offline</p>
                </div>
                <button 
                  onClick={startCamera}
                  className="px-8 py-4 bg-emerald-500 text-black font-black rounded-2xl text-xs hover:bg-emerald-400 transition-all active:scale-95 uppercase tracking-widest"
                >
                  Enable Camera
                </button>
              </div>
            )}
          </div>

          {/* Translation Output */}
          <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-10 min-h-[200px] flex flex-col justify-center relative overflow-hidden ring-1 ring-white/5">
            <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500" />
            <div className="flex items-center gap-4 text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-6">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              Interpretation
            </div>
            <AnimatePresence mode="wait">
              <motion.p 
                key={transcription || "empty"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  "text-4xl font-semibold tracking-tight transition-all duration-700 leading-tight",
                  transcription ? "text-white" : "text-zinc-800 italic"
                )}
              >
                {transcription || "Waiting for signs..."}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* Right Column: History & Debug */}
        <div className="lg:col-span-4 space-y-8">
          {/* Error Alert */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-red-500/10 border border-red-500/20 rounded-3xl p-6 flex gap-5 items-start"
              >
                <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-1" />
                <div className="space-y-2">
                  <p className="text-sm font-black text-red-500 uppercase tracking-widest">System Alert</p>
                  <p className="text-xs text-red-400/80 leading-relaxed">{error}</p>
                  <button onClick={() => setError(null)} className="text-[10px] font-bold text-red-400/50 hover:text-red-400 uppercase tracking-widest mt-2">Dismiss</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Debug Console */}
          <AnimatePresence>
            {showDebug && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-black border border-white/10 rounded-[2rem] overflow-hidden flex flex-col h-[300px] ring-1 ring-white/5"
              >
                <div className="p-4 border-b border-white/10 bg-zinc-900/50 flex items-center justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                    <Terminal className="w-3 h-3" />
                    System Console
                  </h3>
                  <button onClick={() => setLogs([])} className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2 custom-scrollbar">
                  {logs.length === 0 && <p className="text-zinc-700 italic">No logs yet...</p>}
                  {logs.map((log, i) => (
                    <div key={i} className={cn(
                      "flex gap-2",
                      log.type === 'error' ? "text-red-400" : log.type === 'success' ? "text-emerald-400" : "text-zinc-500"
                    )}>
                      <span className="opacity-30 shrink-0">[{log.time}]</span>
                      <span className="break-all">{log.msg}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History Panel */}
          <div className="bg-zinc-900/60 border border-white/5 rounded-[2.5rem] overflow-hidden flex flex-col h-[300px] ring-1 ring-white/5">
            <div className="p-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 flex items-center gap-3">
                <History className="w-4 h-4 text-emerald-500" />
                History
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {history.map((item, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <span className="text-[9px] font-black text-emerald-500/50 uppercase tracking-widest block mb-1">{item.time}</span>
                  <p className="text-xs text-zinc-300 leading-relaxed">{item.text}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
