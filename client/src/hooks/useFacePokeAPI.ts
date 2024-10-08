import { useEffect, useState } from "react";

import { facePoke } from "../lib/facePoke";

export function useFacePokeAPI() {

   // State for FacePoke
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [interruptMessage, setInterruptMessage] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  // Initialize FacePoke
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsDebugMode(urlParams.get('debug') === 'true');
  }, []);

  // Handle WebSocket interruptions
  useEffect(() => {
    const handleInterruption = (event: CustomEvent) => {
      setInterruptMessage(event.detail.message);
    };

    window.addEventListener('websocketInterruption' as any, handleInterruption);

    return () => {
      window.removeEventListener('websocketInterruption' as any, handleInterruption);
    };
  }, []);

  return {
    facePoke,
    isDebugMode,
    setIsDebugMode,
    interruptMessage,
    isLoading,
    setIsLoading,
  }
}
