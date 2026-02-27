"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface AgentEvent {
  type: string;
  [key: string]: unknown;
}

interface UseAgentConnectionOptions {
  agentUrl: string;
  onEvent: (event: AgentEvent) => void;
}

export function useAgentConnection({ agentUrl, onEvent }: UseAgentConnectionOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);

  // Connect to agent WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(agentUrl);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "audio") {
        // Play audio response from agent
        await playAudio(msg.data);
      } else if (msg.type === "transcript") {
        setTranscript({ role: msg.role, text: msg.text });
        onEvent(msg);
      } else if (msg.type === "interrupted") {
        // Stop any playing audio
        stopPlayback();
        onEvent(msg);
      } else {
        // Forward all other events (show_artist, highlight_node, etc.)
        onEvent(msg);
      }
    };
  }, [agentUrl, onEvent]);

  // Start recording microphone audio
  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      await connect();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    mediaStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);

    // Use ScriptProcessorNode to capture raw PCM
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      // Convert float32 to int16 PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Base64 encode and send
      const bytes = new Uint8Array(pcm16.buffer);
      const b64 = btoa(String.fromCharCode(...bytes));
      wsRef.current.send(JSON.stringify({ type: "audio", data: b64 }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setIsRecording(true);
  }, [connect]);

  // Stop recording
  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
  }, []);

  // Play PCM audio from agent
  const playAudio = async (b64Data: string) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = playbackContextRef.current;

    const binaryStr = atob(b64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Convert int16 PCM to float32
    const int16 = new Int16Array(bytes.buffer);
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
  };

  const stopPlayback = () => {
    playbackContextRef.current?.close();
    playbackContextRef.current = null;
  };

  // Disconnect on unmount
  const disconnect = useCallback(() => {
    stopRecording();
    stopPlayback();
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
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
    transcript,
    connect,
    startRecording,
    stopRecording,
    disconnect,
  };
}
