import React from 'react';

const Button = ({ 
  children, 
  onClick, 
  variant = 'signature', 
  size = 'md', 
  type = 'button', 
  disabled = false, 
  icon: Icon,
  className = '' 
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-[800] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group';
  
  const variants = {
    signature: 'btn-signature',
    secondary: 'border border-black/10 text-ink-primary hover:bg-black/5',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20',
    ghost: 'text-gray-500 hover:text-ink-primary hover:bg-black/5'
  };

  const sizes = {
    sm: 'h-8 px-4 text-[10px] rounded-pill',
    md: 'h-12 px-6 text-xs rounded-pill',
    lg: 'h-14 px-8 text-sm rounded-pill',
    icon: 'w-10 h-10 rounded-pill'
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant] || variants.signature} ${sizes[size]} ${className}`}
    >
      {children}
      {Icon && (
        <div className={variant === 'signature' ? 'icon-nest' : 'ml-2'}>
          <Icon size={size === 'sm' ? 14 : 18} />
        </div>
      )}
    </button>
  );
};

export default Button;
