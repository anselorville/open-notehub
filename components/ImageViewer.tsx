'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'

interface Props {
  src: string
  alt: string
}

export function ImageViewer({ src, alt }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="max-w-full rounded-lg shadow-sm cursor-zoom-in"
        onClick={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 bg-black/90 border-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[90vh] object-contain mx-auto"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
