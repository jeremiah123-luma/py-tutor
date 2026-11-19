import { FileText } from 'lucide-react';

/** Shows the data files a program reads, so file I/O problems are never guesswork. */
export function FilePreview({ files, caption }: { files?: Record<string, string>; caption?: string }) {
  const entries = Object.entries(files ?? {});
  if (!entries.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {caption && <p className="text-sm text-ink-2">{caption}</p>}
      {entries.map(([name, text]) => (
        <figure key={name} className="overflow-hidden rounded-lg border border-line bg-code-bg">
          <figcaption className="flex items-center gap-1.5 border-b border-line px-3 py-1.5 text-xs font-medium text-ink-2">
            <FileText className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {name}
          </figcaption>
          <pre className="max-h-40 overflow-auto px-3 py-2 font-code text-[13px] leading-relaxed whitespace-pre">{text}</pre>
        </figure>
      ))}
    </div>
  );
}

/** Files from the first visible test that has any (falls back to any test). */
export function sampleFiles(tests: { files?: Record<string, string>; hidden?: boolean }[]) {
  return (tests.find((t) => t.files && !t.hidden) ?? tests.find((t) => t.files))?.files;
}
