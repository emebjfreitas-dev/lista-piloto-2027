import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
}

export const Badge: React.FC<BadgeProps> = ({
  className = '',
  variant = 'default',
  children,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-tight transition-colors tabular-nums';

  const variants = {
    default: 'bg-[#1d1d1f] text-white',
    secondary: 'bg-[#f5f5f7] text-[#1d1d1f] border border-black/[0.04]',
    success: 'bg-[#eaf6ef] text-[#005035] border border-[#005035]/15',
    warning: 'bg-[#fff8e6] text-[#b25e00] border border-[#b25e00]/15',
    destructive: 'bg-[#fff2f2] text-[#ba1a1a] border border-[#ba1a1a]/15',
    outline: 'border border-black/[0.12] text-[#1d1d1f]',
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
};
