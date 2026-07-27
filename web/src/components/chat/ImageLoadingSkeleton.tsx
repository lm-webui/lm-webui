/** Minimalist shimmer skeleton for image generation loading state. */
export default function ImageLoadingSkeleton() {
  return (
    <div className="space-y-3 w-full max-w-lg">
      <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
      <div className="aspect-square w-full rounded-xl bg-zinc-200 dark:bg-zinc-700 animate-pulse relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent animate-shimmer" />
      </div>
    </div>
  );
}
