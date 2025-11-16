// screens/GuideAiChatScreen.tsx

import React, { useState, useRef, useEffect } from 'react';
import { Page, Message } from '../../types';
import { Icon } from '../../components/Icon';
import './GuideAiChatScreen.css';

interface GuideAiChatScreenProps {
  setPage: (page: Page) => void;
}

export const GuideAiChatScreen: React.FC<GuideAiChatScreenProps> = ({ setPage }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'AI Assistant',
      text: "Hello! I'm your guide assistant. How can I help you support your user today?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      sender: 'You',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText('');
    setIsLoading(true);

    try {
      // Call backend API (preferred over direct client-side keys)
      const response = await fetch('https://b-smart-glass-aura-vision.onrender.com/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput }),
      });

      const data = await response.json();

      const aiResponse: Message = {
        sender: 'AI Assistant',
        text: data.reply || "Sorry, I couldn't understand that.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('Chat Error:', error);
      const errorMessage: Message = {
        sender: 'AI Assistant',
        text: "I'm sorry, I encountered a server error. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="gac-container">
      <header className="gac-header">
        <button onClick={() => setPage(Page.GUIDE_MAIN)} className="gac-back-button" aria-label="Back">
          <Icon name="arrowLeft" className="gac-back-button-icon" />
        </button>
        <div>
          <h1 className="gac-title">AI Assistant</h1>
        </div>
      </header>

      <main className="gac-chat-container">
        {messages.map((msg, index) => (
          <div key={index} className={`chat-message-row ${msg.sender === 'You' ? 'chat-message-row-user' : ''}`}>
            {msg.sender === 'AI Assistant' && (
              <div className="gac-avatar-ai">
                <Icon name="sparkles" className="gac-avatar-ai-icon" />
              </div>
            )}

            <div className={`chat-message-content ${msg.sender === 'You' ? 'chat-message-content-user' : ''}`}>
              <div className={`chat-message-header ${msg.sender === 'You' ? 'chat-message-header-user' : ''}`}>
                <p className="chat-sender-name">{msg.sender}</p>
                <p className="chat-timestamp">{msg.timestamp}</p>
              </div>
              <p className={`chat-bubble ${msg.sender === 'You' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
                {msg.text}
              </p>
            </div>

            {msg.sender === 'You' && (
              <img src="https://via.placeholder.com/40" alt="User" className="chat-avatar-user" />
            )}
          </div>
        ))}

        {isLoading && (
          <div className="chat-message-row">
            <div className="gac-avatar-ai">
              <Icon name="sparkles" className="gac-avatar-ai-icon" />
            </div>
            <div className="loading-bubble">
              <div className="loading-dots">
                <div className="loading-dot loading-dot-1" />
                <div className="loading-dot loading-dot-2" />
                <div className="loading-dot loading-dot-3" />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      <footer className="gac-footer">
        <div className="gac-input-container">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask for assistance..."
            rows={1}
            className="gac-textarea"
            disabled={isLoading}
            aria-label="Message input"
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !inputText.trim()}
            className="gac-send-button"
            aria-label="Send message"
          >
            <Icon name="paperAirplane" className="gac-send-button-icon" />
          </button>
        </div>
      </footer>
    </div>
  );
};

