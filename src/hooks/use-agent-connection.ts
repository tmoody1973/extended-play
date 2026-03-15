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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const sessionIdRef = useRef(sessionId || crypto.randomUUID());

  const getWsUrl = useCallback(() => {
    const base = agentUrl.replace(/\/ws\/?$/, "");
    return `${base}/ws/${userId}/${sessionIdRef.current}`;
  }, [agentUrl, userId]);

  const playAudioBytes = useCallback(async (bytes: Uint8Array) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = 0;
    }
    const ctx = playbackContextRef.current;
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000;
    }
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    // Schedule chunks sequentially — each starts after the previous ends
    const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
  }, []);

  const playAudioBase64 = useCallback(async (b64Data: string) => {
    const binaryStr = atob(b64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    await playAudioBytes(bytes);
  }, [playAudioBytes]);

  const stopPlayback = useCallback(() => {
    playbackContextRef.current?.close();
    playbackContextRef.current = null;
    nextPlayTimeRef.current = 0;
  }, []);

  const connect = useCallback(async () => {
    // Clean up any existing connection first
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) return;
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    // Attach ALL handlers BEFORE awaiting open to avoid missing early messages
    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
      setAgentState("idle");
      wsRef.current = null;
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        setAgentState("agent_speaking");
        await playAudioBytes(new Uint8Array(event.data));
        return;
      }

      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "audio":
          setAgentState("agent_speaking");
          await playAudioBase64(msg.data);
          break;
        case "transcript":
          if (!msg.text?.trim()) break;
          setTranscript({ role: msg.role, text: msg.text });
          if (msg.role === "agent") setAgentState("agent_speaking");
          onEvent(msg);
          break;
        case "interrupted":
          stopPlayback();
          setAgentState("listening");
          onEvent(msg);
          break;
        case "agent_activity":
          setAgentState("agent_thinking");
          onEvent(msg);
          break;
        case "session_expired":
          // Context window full — reconnect with fresh session
          wsRef.current?.close();
          wsRef.current = null;
          sessionIdRef.current = crypto.randomUUID();
          setIsConnected(false);
          // Auto-reconnect after a brief pause
          setTimeout(() => { connect(); }, 300);
          break;
        default:
          onEvent(msg);
          break;
      }
    };

    // Now wait for connection to open
    await new Promise<void>((resolve) => {
      ws.addEventListener("open", () => {
        setIsConnected(true);
        resolve();
      }, { once: true });
      ws.addEventListener("error", () => {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            setIsConnected(true);
            resolve();
          } else {
            setIsConnected(false);
            resolve();
          }
        }, 500);
      }, { once: true });
    });
  }, [getWsUrl, onEvent, playAudioBytes, playAudioBase64, stopPlayback]);

  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    mediaStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(512, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Prefer raw binary, fallback to base64
      try {
        wsRef.current.send(pcm16.buffer);
      } catch {
        const bytes = new Uint8Array(pcm16.buffer);
        let binaryStr = "";
        for (let j = 0; j < bytes.length; j++) {
          binaryStr += String.fromCharCode(bytes[j]);
        }
        const b64 = btoa(binaryStr);
        wsRef.current!.send(JSON.stringify({ type: "audio", data: b64 }));
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setIsRecording(true);
    setAgentState("listening");
  }, [connect]);

  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
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

  const sendImage = useCallback(async (base64Data: string, mimeType: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }
    wsRef.current?.send(JSON.stringify({ type: "image", data: base64Data, mimeType }));
    setAgentState("agent_thinking");
  }, [connect]);

  const disconnect = useCallback(() => {
    stopRecording();
    stopPlayback();
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: "stop" })); } catch {}
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [stopRecording, stopPlayback]);

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
    disconnect,
  };
}
