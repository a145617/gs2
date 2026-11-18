import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, closeDb } from "@/server/db/client";
import { appSettings } from "@/server/db/schema";
import { resetDb } from "./support/db";

describe("データベース接続", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("設定を書き込んで読み出せる", async () => {
    await db.insert(appSettings).values({ key: "hello", value: { n: 1 } });
    const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "hello") });
    expect(row?.value).toEqual({ n: 1 });
  });
});
