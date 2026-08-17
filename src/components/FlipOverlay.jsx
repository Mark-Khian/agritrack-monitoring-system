import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';
import crmLogo from '../assets/CRM-logo.png';

const FlipOverlay = ({ isPending, isSuccess, title, subtitle }) => {
  if (!isPending && !isSuccess) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex flex-col items-center justify-center text-center px-4">
        
        {/* Flip Container */}
        <div className="flip-container w-28 h-28 mb-6">
          <div className={`flip-inner w-full h-full ${isSuccess ? 'is-flipped' : 'animate-pulse'}`}>
            <div className="flip-front flex items-center justify-center">
              <img src={crmLogo} alt="Loading" className="w-full h-full object-contain drop-shadow-xl" />
            </div>
            <div className="flip-back flex items-center justify-center">
              <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/40">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Text & Dots - Only visible on success */}
        <div 
          className={`flex flex-col items-center transition-all duration-500 ease-out overflow-hidden ${
            isSuccess ? 'opacity-100 max-h-48' : 'opacity-0 max-h-0'
          }`}
        >
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          <p className="text-green-200 text-sm mb-4">{subtitle}</p>
          
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default FlipOverlay;
