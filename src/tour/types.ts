export type TourScreen = 'home' | 'lesson';
export interface TourStep {
  id: string;
  screen: TourScreen;
  /** value of a data-tour attribute to spotlight; omit for a centered card with no spotlight */
  target?: string;
  title: string;
  body: string;
  /** where the card sits relative to the target; default 'auto' */
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
}
