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
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-tight transition-all duration-200 tabular-nums';

  const variants = {
    default: 'bg-[#14428c] text-white',
    secondary: 'bg-[#eef3f9] text-[#0f172a] font-bold',
    success: 'bg-[#ecfdf5] text-[#047857] font-bold',
    warning: 'bg-[#fef3c7] text-[#b45309] font-bold',
    destructive: 'bg-[#fff1f2] text-[#be123c] font-bold',
    outline: 'bg-[#eef3f9] text-[#0f172a] font-bold',
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
};
