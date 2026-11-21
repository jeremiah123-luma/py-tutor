import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useScreenReveal } from './pageTransition';

/**
 * A screen that opens in a circle from the point that was tapped (see pageTransition.ts). When it's replaced it
 * stays mounted just long enough for the next screen's circle to cover it, so there's never a blank frame.
 */
export function Reveal({ children }: { children: ReactNode }) {
  const ref = useScreenReveal<HTMLDivElement>();
  return (
    <motion.div ref={ref} data-screen="" className="relative z-[1] min-h-dvh bg-paper" exit={{ opacity: 0, transition: { duration: 0.12, delay: 0.46 } }}>
      {children}
    </motion.div>
  );
}
