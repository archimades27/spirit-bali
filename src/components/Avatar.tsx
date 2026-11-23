interface AvatarProps {
  readonly name: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly crown?: boolean;
  readonly className?: string;
}

const HUES = [265, 190, 330, 150, 25, 210, 290, 50] as const;

function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length]!;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Gradient initials avatar; colour is stable per name. */
export function Avatar({ name, size = 'md', crown = false, className = '' }: AvatarProps) {
  return (
    <span
      className={`avatar avatar-${size} ${className}`}
      style={{ ['--hue' as string]: hueFor(name) }}
      aria-hidden="true"
    >
      <span className="avatar-face">{initialsOf(name)}</span>
      {crown && <span className="avatar-crown">♛</span>}
    </span>
  );
}
