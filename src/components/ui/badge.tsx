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
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold tracking-tight transition-colors duration-100 tabular-nums';

  const variants = {
    default: 'bg-slate-900 text-white',
    secondary: 'bg-slate-100 text-slate-900 font-bold',
    success: 'bg-emerald-100 text-emerald-950 font-bold',
    warning: 'bg-amber-100 text-amber-950 font-bold',
    destructive: 'bg-rose-100 text-rose-950 font-bold',
    outline: 'bg-slate-100 text-slate-900 font-bold',
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
};
