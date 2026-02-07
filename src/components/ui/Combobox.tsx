'use client';

import { Combobox as ArkCombobox, useListCollection } from '@ark-ui/react/combobox';
import { useFilter } from '@ark-ui/react/locale';
import { Portal } from '@ark-ui/react/portal';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useState, useEffect } from 'react';

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
  const { contains } = useFilter({ sensitivity: 'base' });

  const { collection, filter } = useListCollection({
    initialItems: options,
    filter: contains,
  });

  // Manage input value with state
  const [inputValue, setInputValue] = useState('');

  const handleValueChange = (details: { value: string[] }) => {
    // onChange を呼び出すだけで、表示の更新は useEffect に任せる
    // これにより、親コンポーネントで値が正規化された後に正しい表示が適用される
    if (multiple) {
      onChange(details.value);
    } else {
      const newValue = details.value[0];
      if (newValue !== undefined) {
        onChange(newValue);
      }
    }
  };

  const handleInputValueChange = (details: { inputValue: string }) => {
    // ユーザーが入力している時は、入力値を更新してフィルタリング
    setInputValue(details.inputValue);
    filter(details.inputValue);
    if (allowCustomValue && !multiple) {
      onChange(details.inputValue);
    }
  };

  // Sync input value when value prop changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const normalizedValue = Array.isArray(value) ? value : [value];

    // 複数選択モードの場合、親から渡された値を元に表示を更新
    if (multiple) {
      // "all"のみの場合は"All Repositories"のみ表示
      if (normalizedValue.length === 1 && normalizedValue[0] === 'all') {
        const allOption = options.find((opt) => opt.value === 'all');
        setInputValue(allOption?.label || '');
      } else {
        // "all"を除外して、選択されたrepository名のみ表示
        const labels = normalizedValue
          .filter((v) => v !== 'all')
          .map((v) => options.find((opt) => opt.value === v)?.label)
          .filter(Boolean)
          .join(', ');
        setInputValue(labels);
      }
    } else {
      // 単一選択モード
      const labels = normalizedValue
        .map((v) => options.find((opt) => opt.value === v)?.label)
        .filter(Boolean)
        .join(', ');
      setInputValue(labels);
    }
  }, [value, options, multiple]);

  // Normalize value to array
  const normalizedValue = Array.isArray(value) ? value : [value];

  // Group items by group property
  const groupedItems = collection.items.reduce(
    (acc, item) => {
      const group = item.group || 'Other';
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(item);
      return acc;
    },
    {} as Record<string, typeof collection.items>
  );

  const hasGroups = Object.keys(groupedItems).length > 1 || !groupedItems['Other'];

  return (
    <ArkCombobox.Root
      collection={collection}
      value={normalizedValue}
      inputValue={inputValue}
      onValueChange={handleValueChange}
      onInputValueChange={handleInputValueChange}
      positioning={{ sameWidth: true }}
      disabled={disabled}
      allowCustomValue={allowCustomValue}
      openOnClick={true}
      inputBehavior="autohighlight"
      selectionBehavior="preserve"
      multiple={multiple}
      lazyMount
      unmountOnExit
    >
      <ArkCombobox.Control className={`relative ${className}`}>
        <ArkCombobox.Input
          className={`w-full pl-3 ${showClearButton ? 'pr-16' : 'pr-10'} py-2 border border-theme rounded text-theme-fg bg-theme-card disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden text-ellipsis whitespace-nowrap`}
          placeholder={placeholder}
        />
        {showClearButton && onClear && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-fg transition-colors cursor-pointer"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <ArkCombobox.Trigger className="absolute right-2 top-1/2 -translate-y-1/2 text-theme-muted">
          <ChevronsUpDown className="w-4 h-4" />
        </ArkCombobox.Trigger>
      </ArkCombobox.Control>

      <Portal>
        <ArkCombobox.Positioner>
          <ArkCombobox.Content className="bg-theme-card border border-theme rounded shadow-lg mt-1 max-h-60 overflow-auto z-50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out">
            {collection.items.length > 0 ? (
              hasGroups ? (
                <>
                  {Object.entries(groupedItems).map(([groupName, groupItems]) => (
                    <ArkCombobox.ItemGroup key={groupName}>
                      <ArkCombobox.ItemGroupLabel className="px-3 py-1.5 text-xs font-semibold text-theme-muted uppercase">
                        {groupName}
                      </ArkCombobox.ItemGroupLabel>
                      {groupItems.map((item) => (
                        <ArkCombobox.Item
                          key={item.value}
                          item={item}
                          className="px-3 py-2 cursor-pointer hover:bg-theme-hover text-theme-fg flex items-center justify-between"
                        >
                          <ArkCombobox.ItemText>{item.label}</ArkCombobox.ItemText>
                          <ArkCombobox.ItemIndicator>
                            <Check className="w-4 h-4 text-primary" />
                          </ArkCombobox.ItemIndicator>
                        </ArkCombobox.Item>
                      ))}
                    </ArkCombobox.ItemGroup>
                  ))}
                </>
              ) : (
                <ArkCombobox.ItemGroup>
                  {collection.items.map((item) => (
                    <ArkCombobox.Item
                      key={item.value}
                      item={item}
                      className="px-3 py-2 cursor-pointer hover:bg-theme-hover text-theme-fg flex items-center justify-between"
                    >
                      <ArkCombobox.ItemText>{item.label}</ArkCombobox.ItemText>
                      <ArkCombobox.ItemIndicator>
                        <Check className="w-4 h-4 text-primary" />
                      </ArkCombobox.ItemIndicator>
                    </ArkCombobox.Item>
                  ))}
                </ArkCombobox.ItemGroup>
              )
            ) : (
              <div className="px-3 py-2 text-theme-muted text-sm">No options found</div>
            )}
          </ArkCombobox.Content>
        </ArkCombobox.Positioner>
      </Portal>
    </ArkCombobox.Root>
  );
}
