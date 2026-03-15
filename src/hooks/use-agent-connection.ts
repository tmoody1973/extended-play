"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

export type AgentState = "idle" | "listening" | "agent_thinking" | "agent_speaking";

interface UseAgentConnectionOptions {
  agentUrl: string;
  onEvent: (event: AgentEvent) => void;
  userId?: string;
  sessionId?: string;
}

export function useAgentConnection({
  agentUrl,
  onEvent,
  userId = "default",
  sessionId,
}: UseAgentConnectionOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [transcript, setTranscript] = useState<{ role: string; text: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const sessionIdRef = useRef(sessionId || crypto.randomUUID());

  const getWsUrl = useCallback(() => {
    const base = agentUrl.replace(/\/ws\/?$/, "");
    return `${base}/ws/${userId}/${sessionIdRef.current}`;
  }, [agentUrl, userId]);

  const connect = useCallback(async () => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) return;
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) return; // ignore raw audio

      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "audio":
          // Ignore — we use TTS now, not audio streaming
          break;
        case "transcript":
          if (!msg.text?.trim()) break;
          setTranscript({ role: msg.role, text: msg.text });
          onEvent(msg);
          break;
        case "interrupted":
          onEvent(msg);
          break;
        case "agent_activity":
          setAgentState("agent_thinking");
          onEvent(msg);
          break;
        case "session_expired":
          wsRef.current?.close();
          wsRef.current = null;
          sessionIdRef.current = crypto.randomUUID();
          setIsConnected(false);
          setTimeout(() => { connect(); }, 300);
          break;
        default:
          // show_narration, show_image, show_artist, etc.
          if (msg.type === "show_narration") {
            setAgentState("agent_speaking");
          }
          onEvent(msg);
          break;
      }
    };

    await new Promise<void>((resolve) => {
      ws.addEventListener("open", () => {
        setIsConnected(true);
        resolve();
      }, { once: true });
      ws.addEventListener("error", () => {
        setTimeout(() => {
          setIsConnected(ws.readyState === WebSocket.OPEN);
          resolve();
        }, 500);
      }, { once: true });
    });
  }, [getWsUrl, onEvent]);

  // STT via Web Speech API
  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }

      // Show interim results in the voice bar
      if (interimText) {
        setTranscript({ role: "user", text: interimText });
      }

      // Send final transcription as text message
      if (finalText.trim()) {
        setTranscript({ role: "user", text: finalText.trim() });
        onEvent({ type: "transcript", role: "user", text: finalText.trim() });
        wsRef.current?.send(JSON.stringify({ type: "text", text: finalText.trim() }));
        setAgentState("agent_thinking");
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
      setAgentState("idle");
    };

    recognition.onend = () => {
      // Restart if still in recording mode (browser stops after silence)
      if (isRecording && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* already started */ }
      }
    };

    recognition.start();
    setIsRecording(true);
    setAgentState("listening");
  }, [connect, onEvent, isRecording]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setAgentState("idle");
  }, []);

  const sendText = useCallback(async (text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }
    wsRef.current?.send(JSON.stringify({ type: "text", text }));
    setTranscript({ role: "user", text });
    setAgentState("agent_thinking");
    onEvent({ type: "transcript", role: "user", text });
  }, [connect, onEvent]);

  const sendWalkthrough = useCallback(async (episodeId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }
    wsRef.current?.send(JSON.stringify({ type: "walkthrough", episodeId }));
    setAgentState("agent_thinking");
  }, [connect]);

  const sendImage = useCallback(async (base64Data: string, mimeType: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }
    wsRef.current?.send(JSON.stringify({ type: "image", data: base64Data, mimeType }));
    setAgentState("agent_thinking");
  }, [connect]);

  const disconnect = useCallback(() => {
    stopRecording();
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: "stop" })); } catch {}
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [stopRecording]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    isConnected,
    isRecording,
    agentState,
    transcript,
    connect,
    startRecording,
    stopRecording,
    sendText,
    sendImage,
    sendWalkthrough,
    disconnect,
  };
}
