import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleRefresh } from "@/components/plp/busy-refresh";

afterEach(() => {
  vi.useRealTimers();
});

describe("scheduleRefresh", () => {
  it("refreshes once after the delay", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    scheduleRefresh(refresh, 5_000);
    vi.advanceTimersByTime(4_999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing once cancelled (the component unmounted)", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const cancel = scheduleRefresh(refresh, 5_000);
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
