
import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FloatingChatProps {
  windowTitle?: string;
  flowId?: string;
  hostUrl?: string;
  apiKey?: string;
  width?: string;
  height?: string;
  startOpen?: boolean;
}

export function FloatingChat({
  windowTitle = "SRPH MIS AI Chat Bot",
  flowId = "d98b0949-3362-46b8-947a-16084bb3a710",
  hostUrl = "https://agent.sec.samsung.net",
  apiKey = "sk-n62VfNKT5pCPJR3TfLD0MPq0nl_b2ZhxBaTQKJ4Di3U",
  width = "400",
  height = "600",
  startOpen = false
}: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(startOpen);
  const [isLoaded, setIsLoaded] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load the Samsung agent chat script
    const script = document.createElement('script');
    script.src = 'https://agent.sec.samsung.net/chat.bundle.min.js';
    script.async = true;
    script.onload = () => {
      setIsLoaded(true);
    };
    document.head.appendChild(script);

    return () => {
      const existingScript = document.querySelector('script[src="https://agent.sec.samsung.net/chat.bundle.min.js"]');
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, []);

  useEffect(() => {
    if (isLoaded && isOpen && chatContainerRef.current) {
      // Clear previous content
      chatContainerRef.current.innerHTML = '';

      // Create the agent-chat element
      const agentChat = document.createElement('agent-chat');
      agentChat.setAttribute('window_title', windowTitle);
      agentChat.setAttribute('flow_id', flowId);
      agentChat.setAttribute('host_url', hostUrl);
      agentChat.setAttribute('width', width);
      agentChat.setAttribute('height', height);
      agentChat.setAttribute('start_open', 'true');
      agentChat.setAttribute('api_key', apiKey);

      chatContainerRef.current.appendChild(agentChat);
    }
  }, [isLoaded, isOpen, windowTitle, flowId, hostUrl, apiKey, width, height]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      {/* Simple Floating Chat Button - positioned above help button */}
      {!isOpen && (
        <div className="fixed bottom-20 right-6 z-50">
          <Button
            onClick={toggleChat}
            className="h-12 w-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
            size="icon"
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Samsung Chat Widget - fullscreen overlay */}
      {isOpen && isLoaded && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="relative bg-white rounded-lg shadow-xl overflow-hidden" style={{ width: `${width}px`, height: `${height}px`, maxWidth: '90vw', maxHeight: '90vh' }}>
            {/* Single close button */}
            <Button
              onClick={toggleChat}
              className="absolute top-2 right-2 z-50 h-8 w-8 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg"
              size="icon"
            >
              <X className="h-4 w-4" />
            </Button>
            {/* Chat container with proper spacing */}
            <div
              ref={chatContainerRef}
              className="w-full h-full"
              style={{ paddingTop: '40px' }}
            />
          </div>
        </div>
      )}

      {/* Loading State */}
      {isOpen && !isLoaded && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-xl">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p>Loading chat...</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
