import { useState, useRef, useEffect } from 'react';
import { useGameStore } from './store';

export function VirtualJoystick() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const baseRef = useRef<HTMLDivElement>(null);
  const setJoystick = useGameStore(s => s.setJoystick);

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    setActive(true);
    updatePosition(e);
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (active) {
      updatePosition(e);
    }
  };

  const handleEnd = () => {
    setActive(false);
    setPosition({ x: 0, y: 0 });
    setJoystick(0, 0, false);
  };

  const updatePosition = (e: React.TouchEvent | React.MouseEvent) => {
    if (!baseRef.current) return;
    
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    
    const maxDistance = rect.width / 2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > maxDistance) {
      dx = (dx / distance) * maxDistance;
      dy = (dy / distance) * maxDistance;
    }

    setPosition({ x: dx, y: dy });
    
    // Normalize for store (-1 to 1)
    setJoystick(dx / maxDistance, dy / maxDistance, true);
  };

  useEffect(() => {
    const handleMouseUp = () => {
      if (active) handleEnd();
    };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [active]);

  return (
    <div 
      ref={baseRef}
      className="w-32 h-32 bg-white/30 backdrop-blur-md rounded-full border-4 border-white/50 flex items-center justify-center pointer-events-auto touch-none shadow-lg"
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
    >
      <div 
        className="w-16 h-16 bg-blue-500 rounded-full shadow-md border-2 border-white/80 transition-transform duration-75"
        style={{ 
          transform: `translate(${position.x}px, ${position.y}px) scale(${active ? 1.1 : 1})`,
        }}
      />
    </div>
  );
}
