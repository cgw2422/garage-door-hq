import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/cn'

/**
 * Photos are served by /api/files/photos/[id], which checks the session and the
 * tenant before it hands back any bytes. There is no public URL to link to, so
 * Next's optimizer is bypassed (`unoptimized`) and the browser fetches through
 * the authorized route with the session cookie attached.
 */
export interface PhotoSummary {
  id: string
  kind: string
  caption: string | null
}

export function PhotoGrid({
  photos,
  className,
}: {
  photos: PhotoSummary[]
  className?: string
}) {
  return (
    <ul className={cn('grid grid-cols-3 gap-1.5 p-3', className)}>
      {photos.map((photo) => (
        <li key={photo.id}>
          <Link
            href={`/photos/${photo.id}`}
            className="relative block aspect-square overflow-hidden rounded-[--radius-control] bg-surface-sunken"
          >
            <Image
              src={`/api/files/photos/${photo.id}`}
              alt={photo.caption ?? `${photo.kind.toLowerCase()} photo`}
              fill
              unoptimized
              sizes="(max-width: 768px) 33vw, 200px"
              className="object-cover"
            />
            <span className="absolute inset-x-0 bottom-0 bg-navy-950/60 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-white">
              {photo.caption ? photo.caption : photo.kind.replace('_', ' ')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
