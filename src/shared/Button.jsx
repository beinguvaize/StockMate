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
  // Press feedback, and nothing else.
  //
  // `transition-all` was here, which makes the browser watch every animatable
  // property on every button in the app -- including ones that change for
  // unrelated reasons mid-transition. The properties are named instead.
  //
  // active:scale-[0.97] rather than a hover lift: a button is pressed tens of
  // times a day, which is the tier where motion has to be near-imperceptible
  // or absent. Confirming the press is the purpose; nothing else earns motion
  // here. Never scale(0) -- 0.97 is a press, 0 is a disappearance.
  const baseStyles =
    'inline-flex items-center justify-center font-[800] cursor-pointer group ' +
    'transition-[background-color,border-color,color,box-shadow,opacity,transform] ' +
    'duration-(--dur-press) ease-out ' +
    'active:scale-[0.97] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ' +
    'motion-reduce:transition-none motion-reduce:active:scale-100';
  
  const variants = {
    signature: 'btn-signature',
    amber: 'bg-accent-signature text-white hover:bg-accent-signature-hover shadow-lg shadow-accent-signature/25',
    secondary: 'border border-black/10 text-ink-primary hover:bg-black/5',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20',
    ghost: 'text-muted-foreground hover:text-ink-primary hover:bg-black/5'
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
