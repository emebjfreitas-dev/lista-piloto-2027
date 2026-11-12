import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'default',
      size = 'default',
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold tracking-tight rounded-2xl transition-all duration-100 focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] cursor-pointer select-none';

    const variants = {
      default: 'bg-[#1d1d1f] hover:bg-black text-white shadow-xs',
      secondary: 'bg-[#e9e9ef] hover:bg-[#dcdce4] text-[#111827] shadow-2xs',
      outline: 'bg-[#e9e9ef] hover:bg-[#dcdce4] text-[#111827] shadow-2xs',
      ghost: 'hover:bg-black/[0.06] text-[#111827]',
      destructive: 'bg-[#d92d20] hover:bg-[#b42318] text-white shadow-xs',
      success: 'bg-[#005035] hover:bg-[#003824] text-white shadow-xs',
    };

    const sizes = {
      default: 'min-h-[42px] px-4 py-2 text-[13px]',
      sm: 'min-h-[36px] px-3 text-xs rounded-xl',
      lg: 'min-h-[46px] px-6 text-sm rounded-2xl',
      icon: 'h-9 w-9 p-0 rounded-xl',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
