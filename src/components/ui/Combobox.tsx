'use client';

import { Combobox as ArkCombobox, createListCollection } from '@ark-ui/react/combobox';
import { Portal } from '@ark-ui/react/portal';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowCustomValue?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select option',
  disabled = false,
  className = '',
  allowCustomValue = false,
}: ComboboxProps) {
  const [inputValue, setInputValue] = useState('');

  const filteredOptions = useMemo(() => {
    if (!inputValue) return options;

    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(inputValue.toLowerCase()) ||
        opt.value.toLowerCase().includes(inputValue.toLowerCase())
    );
  }, [options, inputValue]);

  const collection = useMemo(
    () => createListCollection({ items: filteredOptions }),
    [filteredOptions]
  );

  const items = useMemo(
    () =>
      filteredOptions.map((opt) => ({
        label: opt.label,
        value: opt.value,
      })),
    [filteredOptions]
  );

  const handleValueChange = (details: { value: string[] }) => {
    const newValue = details.value[0] || '';
    onChange(newValue);
    setInputValue(''); // 選択後に入力値をクリア
  };

  const handleInputValueChange = (details: { inputValue: string }) => {
    setInputValue(details.inputValue);
    if (allowCustomValue) {
      onChange(details.inputValue);
    }
  };

  return (
    <ArkCombobox.Root
      collection={collection}
      value={value ? [value] : []}
      onValueChange={handleValueChange}
      onInputValueChange={handleInputValueChange}
      inputValue={inputValue}
      positioning={{ sameWidth: true }}
      disabled={disabled}
      allowCustomValue={allowCustomValue}
      lazyMount
      unmountOnExit
    >
      <ArkCombobox.Control className={`relative ${className}`}>
        <ArkCombobox.Input
          className="w-full pl-3 pr-10 py-2 border border-theme rounded text-theme-fg bg-theme-card disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder={placeholder}
        />
        <ArkCombobox.Trigger className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted">
          <ChevronsUpDown className="w-4 h-4" />
        </ArkCombobox.Trigger>
      </ArkCombobox.Control>

      <Portal>
        <ArkCombobox.Positioner>
          <ArkCombobox.Content className="bg-theme-card border border-theme rounded shadow-lg mt-1 max-h-60 overflow-auto z-50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out">
            {items.length > 0 ? (
              <ArkCombobox.ItemGroup>
                {items.map((item) => (
                  <ArkCombobox.Item
                    key={item.value}
                    item={item}
                    className="px-3 py-2 cursor-pointer hover:bg-theme-hover text-theme-fg flex items-center justify-between data-[highlighted]:bg-theme-hover"
                  >
                    <ArkCombobox.ItemText>{item.label}</ArkCombobox.ItemText>
                    <ArkCombobox.ItemIndicator>
                      <Check className="w-4 h-4 text-primary" />
                    </ArkCombobox.ItemIndicator>
                  </ArkCombobox.Item>
                ))}
              </ArkCombobox.ItemGroup>
            ) : (
              <div className="px-3 py-2 text-theme-muted text-sm">No options found</div>
            )}
          </ArkCombobox.Content>
        </ArkCombobox.Positioner>
      </Portal>
    </ArkCombobox.Root>
  );
}
