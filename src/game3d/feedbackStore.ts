import { create } from 'zustand';

export type FeedbackEventType =
  | 'action_success'
  | 'action_fail'
  | 'collect_star'
  | 'found_digspot'
  | 'empty_dig';

export interface FeedbackEvent {
  id: number;
  time: number;
  type: FeedbackEventType;
  position: [number, number, number];
  icon?: string;
  text?: string;
  major?: boolean;
  playerIndex?: number;
}

interface FeedbackState {
  events: FeedbackEvent[];
  emitFeedback: (event: Omit<FeedbackEvent, 'id' | 'time'>) => void;
}

const MAX_EVENT_AGE_MS = 4000;

export const useFeedbackStore = create<FeedbackState>((set) => ({
  events: [],
  emitFeedback: (event) =>
    set((state) => {
      const now = Date.now();
      const freshEvents = state.events.filter((entry) => now - entry.time < MAX_EVENT_AGE_MS);
      return {
        events: [
          ...freshEvents,
          {
            ...event,
            id: now + Math.random(),
            time: now
          }
        ]
      };
    })
}));
