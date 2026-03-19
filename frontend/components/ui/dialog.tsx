'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { FiX } from 'react-icons/fi'

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = ({ className = '', ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) => (
  <DialogPrimitive.Overlay
    className={`fixed inset-0 z-50 bg-black/50 transition-opacity data-[state=open]:opacity-100 data-[state=closed]:opacity-0 ${className}`.trim()}
    {...props}
  />
)

const DialogContent = ({
  className = '',
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      className={`fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xl transition-opacity data-[state=open]:opacity-100 data-[state=closed]:opacity-0 ${className}`.trim()}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className='absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:pointer-events-none'
        aria-label='Close'
      >
        <FiX className='size-4' />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
)

const DialogHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col space-y-1.5 text-center sm:text-left ${className}`.trim()} {...props} />
)

const DialogFooter = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`.trim()} {...props} />
)

const DialogTitle = ({ className = '', ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title className={`text-lg font-semibold leading-none tracking-tight text-slate-900 ${className}`.trim()} {...props} />
)

const DialogDescription = ({ className = '', ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description className={`text-sm text-slate-500 ${className}`.trim()} {...props} />
)

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
