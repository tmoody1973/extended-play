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
  const sessionIdRef = useRef(sessionId || crypto.randomUUID());

  const getWsUrl = useCallback(() => {
    const base = agentUrl.replace(/\/ws\/?$/, "");
    return `${base}/ws/${userId}/${sessionIdRef.current}`;
  }, [agentUrl, userId]);

  const playAudioBytes = useCallback(async (bytes: Uint8Array) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
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
    source.start();
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
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
      setAgentState("idle");
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
        default:
          onEvent(msg);
          break;
      }
    };
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
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
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
