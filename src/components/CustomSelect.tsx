import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface CustomSelectProps {
  id?: string;
  value: string | number;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  menuClassName?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  variant?: 'default' | 'inline';
  size?: 'sm' | 'md' | 'lg';
}

const normalizeSearch = (str: string): string =>
  (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Selecionar...',
  disabled = false,
  ariaLabel,
  className = '',
  menuClassName = '',
  searchable,
  searchPlaceholder = 'Filtrar opções...',
  variant = 'default',
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [menuStyle, setMenuStyle] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpward: boolean;
  }>({
    top: 0,
    left: 0,
    width: 240,
    maxHeight: 288,
    openUpward: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  const normalizedValue = String(value ?? '');
  const selectedOption = useMemo(
    () => options.find((opt) => String(opt.value) === normalizedValue) || null,
    [options, normalizedValue]
  );

  const isSearchable = searchable ?? options.length >= 9;

  const filteredOptions = useMemo(() => {
    if (!isSearchable || !searchQuery.trim()) return options;
    const q = normalizeSearch(searchQuery);
    return options.filter(
      (opt) =>
        normalizeSearch(opt.label).includes(q) ||
        (opt.description && normalizeSearch(opt.description).includes(q))
    );
  }, [options, isSearchable, searchQuery]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    const minMenuWidth = Math.min(vw - margin * 2, Math.max(rect.width, 232));
    const desiredMaxWidth = Math.min(vw - margin * 2, Math.max(minMenuWidth, 380));
    const width = Math.min(desiredMaxWidth, Math.max(rect.width, 260));

    let left = rect.left;
    if (left + width > vw - margin) {
      left = vw - margin - width;
    }
    if (left < margin) {
      left = margin;
    }

    const spaceBelow = vh - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const estimatedHeight = Math.min(340, options.length * 42 + (isSearchable ? 56 : 16));
    const openUpward = spaceBelow < Math.min(220, estimatedHeight) && spaceAbove > spaceBelow;
    const availableSpace = Math.max(150, (openUpward ? spaceAbove : spaceBelow) - 8);
    const maxHeight = Math.min(340, availableSpace);

    if (openUpward) {
      setMenuStyle({
        bottom: vh - rect.top + 6,
        left,
        width,
        maxHeight,
        openUpward: true,
      });
    } else {
      setMenuStyle({
        top: rect.bottom + 6,
        left,
        width,
        maxHeight,
        openUpward: false,
      });
    }
  }, [options.length, isSearchable]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setHighlightedIndex(-1);
      return;
    }

    const activeIdx = filteredOptions.findIndex(
      (opt) => String(opt.value) === normalizedValue && !opt.disabled
    );
    setHighlightedIndex(activeIdx >= 0 ? activeIdx : 0);

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleScrollOrResize = (e: Event) => {
      if (e.type === 'scroll' && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      updateMenuPosition();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('keydown', handleEscape, true);

    const focusTimer = window.setTimeout(() => {
      if (selectedItemRef.current) {
        selectedItemRef.current.scrollIntoView({ block: 'nearest' });
      }
      if (isSearchable && window.matchMedia?.('(pointer: fine)').matches) {
        searchInputRef.current?.focus();
      }
    }, 16);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen, isSearchable, updateMenuPosition]);

  const handleSelectOption = (opt: CustomSelectOption) => {
    if (opt.disabled) return;
    onChange(String(opt.value));
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (e.key === 'ArrowDown') {
        setHighlightedIndex((prev) => {
          let next = prev + 1;
          while (next < filteredOptions.length && filteredOptions[next]?.disabled) next++;
          return next < filteredOptions.length ? next : prev;
        });
      } else if (e.key === 'ArrowUp') {
        setHighlightedIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && filteredOptions[next]?.disabled) next--;
          return next >= 0 ? next : prev;
        });
      }
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        let next = prev + 1;
        while (next < filteredOptions.length && filteredOptions[next]?.disabled) next++;
        return next < filteredOptions.length ? next : 0;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        let next = prev - 1;
        while (next >= 0 && filteredOptions[next]?.disabled) next--;
        return next >= 0 ? next : filteredOptions.length - 1;
      });
    } else if (e.key === 'Enter' && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
      e.preventDefault();
      handleSelectOption(filteredOptions[highlightedIndex]);
    }
  };

  const sizeClass =
    size === 'sm'
      ? 'min-h-[36px] px-2.5 text-xs'
      : size === 'lg'
      ? 'min-h-[46px] px-3.5 text-sm'
      : 'min-h-[40px] px-3 text-xs sm:text-[13px]';

  const variantClass =
    variant === 'inline'
      ? 'bg-transparent hover:bg-white/80 text-slate-950 font-bold rounded-lg shadow-none'
      : 'bg-[#f3f6fb] hover:bg-[#eef3f9] text-slate-950 font-semibold rounded-xl shadow-[0_2px_6px_-2px_rgba(9,15,29,0.06)] hover:shadow-[0_4px_12px_-4px_rgba(9,46,112,0.12)]';

  const activeRingClass = isOpen
    ? variant === 'inline'
      ? 'bg-white shadow-[0_4px_12px_rgba(9,15,29,0.12)]'
      : 'bg-white shadow-[0_6px_18px_-4px_rgba(9,46,112,0.18)]'
    : '';

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex items-center justify-between gap-2 text-left transition-all duration-100 select-none disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer min-w-0 ${sizeClass} ${variantClass} ${activeRingClass} ${className}`}
      >
        <span
          className={`truncate min-w-0 flex-1 ${
            !selectedOption ? 'text-slate-600 font-medium' : ''
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#0f3370]' : 'text-slate-700'
          }`}
        />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel || 'Lista de opções'}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
            style={{
              position: 'fixed',
              top: menuStyle.top,
              bottom: menuStyle.bottom,
              left: menuStyle.left,
              width: menuStyle.width,
              zIndex: 9999,
            }}
            className={`bg-white/98 backdrop-blur-2xl rounded-2xl shadow-[0_20px_50px_rgba(9,15,29,0.22)] overflow-hidden flex flex-col animate-apple-pop ${menuClassName}`}
          >
            {isSearchable && (
              <div className="p-2 bg-[#f3f6fb] shrink-0">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 text-slate-600 absolute left-2.5 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHighlightedIndex(0);
                    }}
                    placeholder={searchPlaceholder}
                    className="w-full min-h-[34px] pl-8 pr-7 rounded-xl bg-white text-xs font-medium text-slate-950 placeholder:text-slate-600 shadow-[0_1px_3px_rgba(9,15,29,0.06)]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-1.5 p-1 text-slate-600 hover:text-slate-950 cursor-pointer"
                      aria-label="Limpar filtro"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div
              style={{ maxHeight: menuStyle.maxHeight }}
              className="overflow-y-auto overscroll-contain p-1.5 space-y-0.5 modal-scroll-body"
            >
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-5 text-center text-xs text-slate-700 font-medium">
                  Nenhuma opção encontrada
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = String(opt.value) === normalizedValue;
                  const isHighlighted = idx === highlightedIndex;
                  return (
                    <button
                      key={`${opt.value}-${idx}`}
                      ref={isSelected ? selectedItemRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => handleSelectOption(opt)}
                      className={`w-full min-h-[38px] px-3 py-2 rounded-xl text-left flex items-center justify-between gap-2.5 transition-colors duration-100 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-[#e8f0fe] text-[#0f3370] font-semibold'
                          : isHighlighted
                          ? 'bg-[#eef3f9] text-slate-950 font-medium'
                          : 'text-slate-900 hover:bg-[#f3f6fb] font-medium'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-xs sm:text-[13px] block leading-snug break-words">
                          {opt.label}
                        </span>
                        {opt.description && (
                          <span className="text-[11px] text-slate-700 block leading-snug mt-0.5 break-words font-normal">
                            {opt.description}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-[#0f3370] shrink-0 stroke-[2]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
