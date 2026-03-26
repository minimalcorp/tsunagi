'use client';

import { useState, useMemo, useRef } from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface ComboboxOption {
  value: string;
  label: string;
  group?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowCustomValue?: boolean;
  multiple?: boolean;
  onClear?: () => void;
  showClearButton?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select option',
  disabled = false,
  className = '',
  allowCustomValue = false,
  multiple = false,
  onClear,
  showClearButton = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Normalize value to array for internal use
  const normalizedValue = useMemo(() => (Array.isArray(value) ? value : [value]), [value]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch('');
    }
  };

  // Compute display label
  const displayLabel = useMemo(() => {
    if (multiple) {
      if (normalizedValue.length === 1 && normalizedValue[0] === 'all') {
        const allOption = options.find((opt) => opt.value === 'all');
        return allOption?.label || '';
      }
      const labels = normalizedValue
        .filter((v) => v !== 'all')
        .map((v) => options.find((opt) => opt.value === v)?.label)
        .filter(Boolean)
        .join(', ');
      return labels;
    }
    const labels = normalizedValue
      .map((v) => options.find((opt) => opt.value === v)?.label)
      .filter(Boolean)
      .join(', ');
    return labels;
  }, [normalizedValue, options, multiple]);

  // Group options
  const groupedOptions = useMemo(() => {
    const groups: Record<string, ComboboxOption[]> = {};
    for (const opt of options) {
      const group = opt.group || 'Other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(opt);
    }
    return groups;
  }, [options]);

  const hasGroups = useMemo(() => {
    const keys = Object.keys(groupedOptions);
    return keys.length > 1 || !groupedOptions['Other'];
  }, [groupedOptions]);

  const handleSelect = (selectedValue: string) => {
    if (multiple) {
      const current = [...normalizedValue];
      const idx = current.indexOf(selectedValue);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(selectedValue);
      }
      onChange(current.length > 0 ? current : []);
    } else {
      onChange(selectedValue);
      setOpen(false);
    }
  };

  const handleCustomValue = () => {
    if (allowCustomValue && search && !multiple) {
      onChange(search);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className={`relative ${className}`}>
        <PopoverTrigger
          ref={triggerRef}
          disabled={disabled}
          className={`flex h-9 w-full items-center justify-between pl-3 ${showClearButton ? 'pr-16' : 'pr-10'} border border-input rounded-md text-sm bg-card text-foreground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap text-left shadow-xs`}
        >
          <span className="truncate">
            {displayLabel || <span className="text-muted-foreground">{placeholder}</span>}
          </span>
        </PopoverTrigger>
        {showClearButton && onClear && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer z-10"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start" sideOffset={4}>
        <Command
          filter={(value, search) => {
            const option = options.find((opt) => opt.value === value);
            if (!option) return 0;
            const target = `${option.label} ${option.group || ''}`.toLowerCase();
            if (target.includes(search.toLowerCase())) return 1;
            return 0;
          }}
        >
          <CommandInput
            placeholder={`Search...`}
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && allowCustomValue) {
                handleCustomValue();
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {allowCustomValue && search ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-xs cursor-pointer hover:bg-accent rounded"
                  onClick={handleCustomValue}
                >
                  Use &quot;{search}&quot;
                </button>
              ) : (
                'No options found'
              )}
            </CommandEmpty>
            {hasGroups ? (
              Object.entries(groupedOptions).map(([groupName, groupItems]) => (
                <CommandGroup key={groupName} heading={groupName}>
                  {groupItems.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      data-checked={normalizedValue.includes(opt.value)}
                      onSelect={() => handleSelect(opt.value)}
                    >
                      <span className="truncate">{opt.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            ) : (
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    data-checked={normalizedValue.includes(opt.value)}
                    onSelect={() => handleSelect(opt.value)}
                  >
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
