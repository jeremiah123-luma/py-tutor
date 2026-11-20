// "You hit your cap" pop-up. "Ask for more" logs a request for the admin to review and opens an
// email draft to him in the student's mail app.
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Gauge, Mail } from 'lucide-react';
import { Button } from './primitives';
import { askForMore, type Usage } from '../loop/api';

const money = (n: number) => `$${n.toFixed(2)}`;

export function CapDialog({ open, usage, onClose }: { open: boolean; usage?: Usage; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [draft, setDraft] = useState<{ to: string; subject: string; body: string } | null>(null);
  const monthOut = usage && usage.monthSpent >= usage.budget;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setState('idle');
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line-strong bg-surface p-6 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] data-[state=open]:animate-[pop-in_220ms_var(--ease-out)]">
          <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-accent" aria-hidden="true">
            <Gauge className="size-6" strokeWidth={1.75} />
          </span>
          <Dialog.Title className="mt-4 text-xl font-semibold">You hit your cap</Dialog.Title>
          <Dialog.Description className="mt-2 text-[0.9375rem] text-ink-2">
            {monthOut
              ? 'The class has used this month’s AI budget. It resets on the 1st.'
              : `You’ve used today’s AI help${usage ? ` (${money(usage.allowance + usage.bonus)})` : ''}. It resets tomorrow.`}{' '}
            Check my code, written hints, and Visualize still work.
          </Dialog.Description>

          {state === 'sent' && draft && (
            <div role="status" className="mt-4 rounded-xl bg-surface-2 p-4 text-[0.9375rem]">
              <p className="font-medium">Request saved.</p>
              <p className="mt-1 text-ink-2">
                Your email app should open with a draft to Jeremy. Hit send and Jeremy will review it, usually the same day. If no draft opened, email {draft.to || 'Jeremy'} with the subject “{draft.subject}”.
              </p>
            </div>
          )}
          {state === 'error' && (
            <p role="alert" className="mt-4 text-sm text-err">
              The request didn’t go through. Check your connection and try again.
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="ghost">{state === 'sent' ? 'Done' : 'OK'}</Button>
            </Dialog.Close>
            {state !== 'sent' && !monthOut && (
              <Button
                variant="primary"
                loading={state === 'busy'}
                icon={<Mail className="size-4" strokeWidth={1.75} />}
                onClick={async () => {
                  setState('busy');
                  try {
                    const r = await askForMore();
                    setDraft(r);
                    setState('sent');
                    window.location.href = r.mailto; // opens the mail app with the draft
                  } catch {
                    setState('error');
                  }
                }}
              >
                Ask for more
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
