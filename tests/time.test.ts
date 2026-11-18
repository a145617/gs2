import { describe, expect, it } from "vitest";
import { formatCountdown, nextThemeChange, themeDayKey, themeDayStart } from "@/lib/time";

const jst = (s: string) => new Date(`${s}+09:00`);

describe("お題の日（朝5時切り替え・日本時間）", () => {
  it("朝4:59まではまだ前日のお題、5:00ちょうどから新しいお題", () => {
    expect(themeDayKey(jst("2026-11-18T04:59:59"))).toBe("2026-11-17");
    expect(themeDayKey(jst("2026-11-18T05:00:00"))).toBe("2026-11-18");
    expect(themeDayKey(jst("2026-11-18T23:59:59"))).toBe("2026-11-18");
    expect(themeDayKey(jst("2026-11-19T00:30:00"))).toBe("2026-11-18");
  });

  it("お題の日の開始は JST 5:00、次の切り替えは翌日 5:00", () => {
    expect(themeDayStart("2026-11-18").toISOString()).toBe(jst("2026-11-18T05:00:00").toISOString());
    expect(nextThemeChange(jst("2026-11-18T12:00:00")).toISOString()).toBe(jst("2026-11-19T05:00:00").toISOString());
    expect(nextThemeChange(jst("2026-11-18T03:00:00")).toISOString()).toBe(jst("2026-11-18T05:00:00").toISOString());
  });

  it("月末・年末もまたげる", () => {
    expect(themeDayKey(jst("2027-01-01T04:00:00"))).toBe("2026-12-31");
    expect(nextThemeChange(jst("2026-12-31T23:00:00")).toISOString()).toBe(jst("2027-01-01T05:00:00").toISOString());
  });

  it("残り時間の表示", () => {
    expect(formatCountdown(3 * 3600_000 + 5 * 60_000 + 9_000)).toBe("3:05:09");
    expect(formatCountdown(-5)).toBe("0:00:00");
  });
});
