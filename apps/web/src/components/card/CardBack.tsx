import { memo } from 'react'
import { cn } from '@/lib/utils'

interface CardBackProps {
  size?: 'xs' | 'sm' | 'md'
}

const sizeClass = {
  xs: 'h-12 w-8',
  sm: 'h-24 w-16',
  md: 'h-32 w-[5.5rem]',
}

function CardBackComponent({ size = 'md' }: CardBackProps) {
  return (
    <div
      aria-label="Face down card"
      data-testid="card-back"
      className={cn('shrink-0 rounded-md border border-border bg-card shadow-sm', sizeClass[size])}
    >
      <svg viewBox="0 0 72 104" role="img" className="h-full w-full">
        <rect x="3" y="3" width="66" height="98" rx="6" fill="white" />
        <rect x="8" y="8" width="56" height="88" rx="4" fill="#1f5f8b" />
        <path d="M16 18h40v68H16z" fill="none" stroke="white" strokeOpacity="0.45" strokeWidth="2" />
        <path
          d="M20 26c10 8 22 8 32 0M20 40c10 8 22 8 32 0M20 54c10 8 22 8 32 0M20 68c10 8 22 8 32 0"
          fill="none"
          stroke="white"
          strokeOpacity="0.5"
          strokeWidth="2"
        />
      </svg>
    </div>
  )
}

export const CardBack = memo(CardBackComponent)
