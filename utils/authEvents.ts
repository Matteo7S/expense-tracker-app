type Listener = () => void;

class AuthEventBus {
  private listeners: Map<string, Set<Listener>> = new Map();

  on(event: 'forceLogout', listener: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }

  emit(event: 'forceLogout'): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener();
      } catch (err) {
        console.error('[authEvents] listener error:', err);
      }
    }
  }
}

export const authEvents = new AuthEventBus();
