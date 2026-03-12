import { Canvas } from '@react-three/fiber';
import { Scene } from './game3d/Scene';
import { useGameStore } from './game3d/store';
import { VirtualJoystick } from './game3d/VirtualJoystick';
import { useState, useEffect } from 'react';

export default function App() {
  const stars = useGameStore(s => s.stars);
  const resetEnvironment = useGameStore(s => s.resetEnvironment);
  const triggerUiAction = useGameStore(s => s.triggerUiAction);
  const isTwoPlayer = useGameStore(s => s.isTwoPlayer);
  const setTwoPlayer = useGameStore(s => s.setTwoPlayer);
  const isNight = useGameStore(s => s.isNight);
  const toggleNight = useGameStore(s => s.toggleNight);

  const [celebrating, setCelebrating] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    if (stars > 0 && stars % 10 === 0 && !celebrating) {
      setCelebrating(true);
      setTimeout(() => {
        setCelebrating(false);
        resetEnvironment();
      }, 4000);
    }
  }, [stars, celebrating, resetEnvironment]);

  const progress = stars % 10;
  const level = Math.floor(stars / 10) + 1;

  return (
    <div className={`w-full h-screen overflow-hidden transition-colors duration-1000 ${isNight ? 'bg-[#0B1026]' : 'bg-[#87CEEB]'}`}>
      <Canvas shadows camera={{ position: [0, 20, 20], fov: 45 }}>
        <Scene />
      </Canvas>
      
      {/* Top UI Overlay */}
      <div className="absolute top-5 left-5 right-5 flex justify-between items-start pointer-events-none">
        
        {/* Title and Toggles */}
        <div className="bg-white/80 backdrop-blur-md text-slate-800 p-4 rounded-3xl shadow-xl pointer-events-auto border-4 border-white">
          <h1 className="text-3xl font-black text-amber-600 mb-3 drop-shadow-sm">🐶 Happy Dog Park</h1>
          <div className="flex gap-3">
            <button 
              onClick={toggleNight}
              className="px-4 py-2 rounded-2xl font-bold text-lg transition-transform hover:scale-105 bg-indigo-500 text-white shadow-md active:scale-95"
            >
              {isNight ? '🌙 Night' : '☀️ Day'}
            </button>
            <button 
              onClick={() => setTwoPlayer(!isTwoPlayer)}
              className={`px-4 py-2 rounded-2xl font-bold text-lg transition-transform hover:scale-105 shadow-md active:scale-95 ${isTwoPlayer ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'}`}
            >
              {isTwoPlayer ? '👥 2 Dogs' : '🐕 1 Dog'}
            </button>
          </div>
        </div>

        {/* Star Progress Bar */}
        <div className="bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-xl border-4 border-amber-300 flex flex-col items-center pointer-events-auto">
          <h2 className="text-2xl font-black text-amber-500 mb-2">Level {level} Dog!</h2>
          <div className="flex gap-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="text-4xl transition-all duration-300" style={{ transform: i < progress ? 'scale(1.2)' : 'scale(1)', opacity: i < progress ? 1 : 0.3 }}>
                {i < progress ? '⭐' : '☆'}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Celebration Overlay */}
      {celebrating && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 bg-white/20 backdrop-blur-sm transition-opacity duration-500">
          <div className="text-center animate-bounce">
            <h1 className="text-8xl font-black text-amber-400 drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] mb-4">
              LEVEL {level}!
            </h1>
            <h2 className="text-4xl font-bold text-white drop-shadow-md mb-6">
              {level === 2 ? "Blue Collar Unlocked!" : level === 3 ? "Gold Collar Unlocked!" : level === 4 ? "Diamond Collar Unlocked!" : "Good Dog!"}
            </h2>
            <div className="text-9xl">🎉 🐕 🎊</div>
          </div>
        </div>
      )}

      {/* Bottom Action Buttons & Joystick */}
      {isTouch ? (
        <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end pointer-events-none">
          
          {/* Left Side: Joystick */}
          <div className="pointer-events-auto">
            <VirtualJoystick />
          </div>

          {/* Right Side: Action Buttons */}
          <div className="flex gap-4 pointer-events-none flex-wrap justify-end max-w-[60%]">
            <button 
              className="pointer-events-auto bg-blue-500 text-white rounded-full w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center text-xl sm:text-2xl font-black border-4 border-white shadow-[0_8px_0_rgb(29,78,216)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(29,78,216)] active:translate-y-2 active:shadow-none transition-all relative"
              onClick={() => triggerUiAction('bark')}
            >
              <span>🗣️</span>
              <span className="text-[10px] sm:text-xs mt-1">Bark</span>
            </button>
            <button 
              className="pointer-events-auto bg-green-500 text-white rounded-full w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center text-xl sm:text-2xl font-black border-4 border-white shadow-[0_8px_0_rgb(21,128,61)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(21,128,61)] active:translate-y-2 active:shadow-none transition-all relative"
              onClick={() => triggerUiAction('dig')}
            >
              <span>🐾</span>
              <span className="text-[10px] sm:text-xs mt-1">Dig</span>
            </button>
            <button 
              className="pointer-events-auto bg-purple-500 text-white rounded-full w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center text-xl sm:text-2xl font-black border-4 border-white shadow-[0_8px_0_rgb(126,34,206)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(126,34,206)] active:translate-y-2 active:shadow-none transition-all relative"
              onClick={() => triggerUiAction('sleep')}
            >
              <span>💤</span>
              <span className="text-[10px] sm:text-xs mt-1">Sleep</span>
            </button>
            <button 
              className="pointer-events-auto bg-amber-700 text-white rounded-full w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center text-xl sm:text-2xl font-black border-4 border-white shadow-[0_8px_0_rgb(146,64,14)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(146,64,14)] active:translate-y-2 active:shadow-none transition-all relative"
              onClick={() => triggerUiAction('poop')}
            >
              <span>💩</span>
              <span className="text-[10px] sm:text-xs mt-1">Poop</span>
            </button>
            <button 
              className="pointer-events-auto bg-red-500 text-white rounded-full w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center text-xl sm:text-2xl font-black border-4 border-white shadow-[0_8px_0_rgb(185,28,28)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(185,28,28)] active:translate-y-2 active:shadow-none transition-all relative"
              onClick={() => triggerUiAction('throw')}
            >
              <span>🎾</span>
              <span className="text-[10px] sm:text-xs mt-1">Throw</span>
            </button>
            <button 
              className="pointer-events-auto bg-orange-500 text-white rounded-full w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center text-xl sm:text-2xl font-black border-4 border-white shadow-[0_8px_0_rgb(194,65,12)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(194,65,12)] active:translate-y-2 active:shadow-none transition-all relative"
              onClick={() => triggerUiAction('interact')}
            >
              <span>🦴</span>
              <span className="text-[10px] sm:text-xs mt-1">Eat</span>
            </button>
            <button 
              className="pointer-events-auto bg-cyan-500 text-white rounded-full w-16 h-16 sm:w-20 sm:h-20 flex flex-col items-center justify-center text-xl sm:text-2xl font-black border-4 border-white shadow-[0_8px_0_rgb(8,145,178)] hover:translate-y-1 hover:shadow-[0_4px_0_rgb(8,145,178)] active:translate-y-2 active:shadow-none transition-all relative"
              onClick={() => triggerUiAction('jump')}
            >
              <span>🦘</span>
              <span className="text-[10px] sm:text-xs mt-1">Jump</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-8 right-8 bg-white/80 backdrop-blur-md p-4 rounded-3xl shadow-xl border-4 border-white pointer-events-auto text-slate-800">
          <h3 className="font-bold text-lg mb-2 border-b-2 border-slate-200 pb-1">Keyboard Controls</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">W A S D</kbd> Move</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Shift</kbd> Run</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Space</kbd> Jump</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">F</kbd> Bark</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">E</kbd> Eat/Drink</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">T</kbd> Throw/Grab</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Q</kbd> Sit</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">C</kbd> Sleep</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">R</kbd> Roll</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">X</kbd> Dig</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Z</kbd> Poop</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">V</kbd> Sniff</div>
          </div>
        </div>
      )}
    </div>
  );
}
