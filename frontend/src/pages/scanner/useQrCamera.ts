import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type CameraState = 'idle' | 'starting' | 'active' | 'denied' | 'unsupported' | 'error';

const SCAN_INTERVAL_MS = 300;
const MAX_FRAME_WIDTH = 640;

export function useQrCamera(videoRef: RefObject<HTMLVideoElement | null>, onDetect: (value: string) => void) {
  const [state, setState] = useState<CameraState>('idle');
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef<symbol | null>(null);
  const pausedRef = useRef(false);
  const onDetectRef = useRef(onDetect);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const stop = useCallback((): void => {
    requestRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    const request = Symbol();
    requestRef.current = request;
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const video = videoRef.current;
      if (requestRef.current !== request || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      if (requestRef.current === request) {
        pausedRef.current = false;
        setState('active');
      }
    } catch (error) {
      if (requestRef.current === request) {
        stop();
        setState(error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    }
  }, [stop, videoRef]);

  useEffect(() => {
    if (state !== 'active') return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;

    const timer = setInterval(() => {
      const video = videoRef.current;
      if (pausedRef.current || !video || video.readyState < 2 || !video.videoWidth) return;
      const width = Math.min(MAX_FRAME_WIDTH, video.videoWidth);
      const height = Math.round(video.videoHeight * width / video.videoWidth);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const code = jsQR(frame.data, width, height, { inversionAttempts: 'dontInvert' });
      if (code) {
        pausedRef.current = true;
        onDetectRef.current(code.data);
      }
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state, videoRef]);

  useEffect(() => stop, [stop]);

  function resume(): void {
    pausedRef.current = false;
  }

  return { state, start, resume };
}
