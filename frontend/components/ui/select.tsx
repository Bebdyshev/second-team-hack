'use client'

import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { FiCheck, FiChevronDown } from 'react-icons/fi'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={`flex h-10 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm transition-all data-[placeholder]:text-slate-400 hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${className}`.trim()}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <FiChevronDown className='size-4 text-slate-500' />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={`z-50 min-w-[10rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${className}`.trim()}
      {...props}
    >
      <SelectPrimitive.Viewport className='p-1.5'>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={`relative flex w-full cursor-default select-none items-center rounded-md py-2 pl-8 pr-2 text-sm text-slate-700 outline-none transition-colors focus:bg-slate-100 focus:text-slate-900 ${className}`.trim()}
    {...props}
  >
    <span className='absolute left-2 flex size-4 items-center justify-center'>
      <SelectPrimitive.ItemIndicator>
        <FiCheck className='size-4' />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName
