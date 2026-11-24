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
  
  // No coloured drop shadows. `shadow-lg shadow-accent-signature/25` put an
  // amber glow under an amber button, which is the one place a shadow cannot
  // do its job -- a shadow separates a surface from the one behind it, and a
  // glow in the fill's own hue just smudges the edge it was meant to define.
  // The fill already carries the emphasis.
  const variants = {
    signature: 'btn-signature',
    amber: 'bg-accent-signature text-white hover:bg-accent-signature-hover',
    secondary: 'border border-black/10 text-ink-primary hover:bg-black/[0.04] hover:border-black/20',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-ink-secondary hover:text-ink-primary hover:bg-black/[0.04]'
  };

  // One scale, and the type grows with the control. The old one had a 32px
  // button carrying 10px text and a 48px button carrying 12px, so the larger
  // size looked emptier than the smaller one rather than more important.
  const sizes = {
    sm: 'h-8 px-3.5 text-[11px] rounded-pill',
    md: 'h-10 px-5 text-[13px] rounded-pill',
    lg: 'h-12 px-7 text-sm rounded-pill',
    icon: 'w-9 h-9 rounded-pill'
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
          <Icon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} />
        </div>
      )}
    </button>
  );
};

export default Button;
