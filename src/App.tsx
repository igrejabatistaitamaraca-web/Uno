/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { TVView } from './components/TVView.tsx';
import { ControllerView } from './components/ControllerView.tsx';
import { HomeSelector } from './components/HomeSelector.tsx';

type AppMode = 'home' | 'tv' | 'controller';

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [mode, setMode] = useState<AppMode>('home');
  const [roomCode, setRoomCode] = useState<string>('');

  useEffect(() => {
    // Connect with polling first for instant connection through any reverse-proxy / iframe
    const socketInstance = io({
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 25,
      reconnectionDelay: 800,
      timeout: 12000,
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('connect_error', () => {
      // Socket.IO will auto-retry
    });

    setSocket(socketInstance);

    // Check URL parameters for direct deep-linking (e.g. from QR code scan)
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join') || urlParams.get('room');
    const requestedMode = urlParams.get('mode');

    if (joinCode) {
      setRoomCode(joinCode.toUpperCase().trim());
      setMode('controller');
    } else if (requestedMode === 'tv') {
      setMode('tv');
    } else if (requestedMode === 'controller') {
      setMode('controller');
    }

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const handleSelectMode = (newMode: 'tv' | 'controller', code?: string) => {
    if (code) {
      setRoomCode(code.toUpperCase().trim());
    }
    setMode(newMode);

    const newUrl = new URL(window.location.href);
    if (newMode === 'tv') {
      newUrl.searchParams.set('mode', 'tv');
      newUrl.searchParams.delete('join');
    } else if (code) {
      newUrl.searchParams.set('join', code);
      newUrl.searchParams.delete('mode');
    } else {
      newUrl.searchParams.set('mode', 'controller');
      newUrl.searchParams.delete('join');
    }
    window.history.pushState({}, '', newUrl.toString());
  };

  const handleExit = () => {
    setMode('home');
    const newUrl = new URL(window.location.href);
    newUrl.search = '';
    window.history.pushState({}, '', newUrl.toString());
  };

  if (mode === 'tv') {
    return <TVView socket={socket} initialRoomCode={roomCode} onExit={handleExit} />;
  }

  if (mode === 'controller') {
    return (
      <ControllerView
        socket={socket}
        initialRoomCode={roomCode}
        isSocketConnected={isConnected}
        onExit={handleExit}
      />
    );
  }

  return <HomeSelector onSelectMode={handleSelectMode} />;
}
