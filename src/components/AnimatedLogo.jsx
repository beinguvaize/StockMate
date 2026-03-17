import React from 'react';

const AnimatedLogo = ({ className = '', size = 40, color = 'currentColor', animated = true }) => {
    return (
        <svg 
            width={size} 
            height={size * 1.15} 
            viewBox="0 0 100 115" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className={`${className} ${animated ? 'animate-logo' : ''}`}
        >
            {/* Inner Hexagon Segments */}
            <path 
                d="M50 5 L90 28 L90 85 L50 108 L10 85 L10 28 Z" 
                stroke={color} 
                strokeWidth="8" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="logo-outline"
                style={{
                  strokeDasharray: 400,
                  strokeDashoffset: animated ? 400 : 0,
                  transition: 'stroke-dashoffset 2s ease-in-out'
                }}
            />
            
            {/* The "S" shape inside the hexagon */}
            <path 
                d="M30 35 H70 L80 50 L70 65 H30 L20 80 L30 95 H70" 
                stroke={color} 
                strokeWidth="10" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="logo-inner"
                style={{
                  strokeDasharray: 300,
                  strokeDashoffset: animated ? 300 : 0,
                  transition: 'stroke-dashoffset 2s ease-in-out 0.5s'
                }}
            />

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes drawLogo {
                    to { stroke-dashoffset: 0; }
                }
                .animate-logo .logo-outline {
                    animation: drawLogo 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .animate-logo .logo-inner {
                    animation: drawLogo 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.5s;
                }
                @keyframes pulseLogo {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(0.98); }
                }
                .animate-logo {
                    animation: pulseLogo 4s ease-in-out infinite 2.5s;
                }
            ` }} />
        </svg>
    );
};

export default AnimatedLogo;
