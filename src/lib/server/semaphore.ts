/**
 * A counting semaphore with a bounded wait and a bounded queue.
 *
 * Pure (no Next, no timers beyond the wait itself) so it can be tested on its
 * own; `render-gate.ts` puts one in front of the filtered-listing render.
 */

export type Release = () => void;

export type SemaphoreStats = {
  max: number;
  active: number;
  waiting: number;
  /** Acquisitions that gave up: queue full or wait timed out. */
  refused: number;
};

type Waiter = { grant: (release: Release) => void; timer: ReturnType<typeof setTimeout> };

export class Semaphore {
  private active = 0;
  private refused = 0;
  private readonly queue: Waiter[] = [];

  constructor(
    private readonly max: number,
    private readonly maxQueue: number = max * 8,
  ) {}

  stats(): SemaphoreStats {
    return { max: this.max, active: this.active, waiting: this.queue.length, refused: this.refused };
  }

  /**
   * Resolves with a release function once a slot is held, or with null when
   * none frees up within `timeoutMs` (or the queue is already full). The
   * release is idempotent: calling it twice frees one slot, once.
   */
  acquire(timeoutMs: number): Promise<Release | null> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    if (this.queue.length >= this.maxQueue || timeoutMs <= 0) {
      this.refused++;
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const waiter: Waiter = {
        grant: (release) => {
          clearTimeout(waiter.timer);
          resolve(release);
        },
        timer: setTimeout(() => {
          const index = this.queue.indexOf(waiter);
          if (index !== -1) this.queue.splice(index, 1);
          this.refused++;
          resolve(null);
        }, timeoutMs),
      };
      this.queue.push(waiter);
    });
  }

  private releaser(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      // The slot passes straight to the next waiter: `active` stays the same.
      if (next) next.grant(this.releaser());
      else this.active--;
    };
  }
}
