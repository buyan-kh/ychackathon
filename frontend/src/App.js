import React from 'react';
import Canvas from './components/Canvas';
import { Toaster } from './components/ui/sonner';
import './App.css';

export default function App() {
  return (
    <>
      <Canvas />
      <Toaster position="top-right" />
    </>
  );
}