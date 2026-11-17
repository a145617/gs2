import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createThemePost, getPost, listTagPosts, listThemePosts } from "@/server/services/posts";
import { getCurrentTheme, seedThemePool } from "@/server/services/themes";
import { addComment, listComments } from "@/server/services/social";
import { createReport, listMutes, mute, mutedUserIds, unmute } from "@/server/services/moderation";
import { setSetting, SETTING_KEYS } from "@/server/settings";
import { resetDb } from "./support/db";
import { makeImage, makeUser } from "./support/factories";

const AT = new Date("2026-11-18T09:00:00+09:00");
const meta = { mode: "auto" as const };

describe("通報・ミュート（仕様: 不適切な投稿の通報、特定ユーザーの投稿を表示しないミュート）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
  });
  afterAll(closeDb);

  it("ミュートしたユーザーの投稿は、お題・ハッシュタグの一覧に出なくなり、解除すると戻る", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const theme = await getCurrentTheme(AT);
    await createThemePost(a.viewer, { title: "A", caption: "#猫", tags: "", meta }, await makeImage(), AT);
    await createThemePost(b.viewer, { title: "B", caption: "#猫", tags: "", meta }, await makeImage(), AT);

    const before = await listThemePosts(b.viewer, theme.id, AT, null);
    expect(before.items.map((p) => p.title).sort()).toEqual(["A", "B"]);

    await mute(b.viewer, a.id);
    expect(await mutedUserIds(b.id)).toEqual([a.id]);
    expect((await listMutes(b.viewer)).map((u) => u.id)).toEqual([a.id]);
    expect((await listThemePosts(b.viewer, theme.id, AT, null)).items.map((p) => p.title)).toEqual(["B"]);
    expect((await listTagPosts(b.viewer, "猫", AT, null)).items.map((p) => p.title)).toEqual(["B"]);
    // ミュートは本人だけの設定（ほかの人には影響しない）
    expect((await listThemePosts(a.viewer, theme.id, AT, null)).items).toHaveLength(2);

    await unmute(b.viewer, a.id);
    expect((await listThemePosts(b.viewer, theme.id, AT, null)).items).toHaveLength(2);
    await expect(mute(a.viewer, a.id)).rejects.toMatchObject({ status: 400 });
  });

  it("ミュートしたユーザーのコメントは表示されない", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const c = await makeUser("C");
    const { post } = await createThemePost(a.viewer, { title: "A", caption: "", tags: "", meta }, await makeImage(), AT);
    await createThemePost(b.viewer, { title: "B", caption: "", tags: "", meta }, await makeImage(), AT);
    await createThemePost(c.viewer, { title: "C", caption: "", tags: "", meta }, await makeImage(), AT);
    await addComment(b.viewer, post.id, "Bのコメント", AT);
    await addComment(c.viewer, post.id, "Cのコメント", AT);
    await mute(a.viewer, c.id);
    const list = await listComments(a.viewer, post.id, AT, null, { excludeUserIds: await mutedUserIds(a.id) });
    expect(list.items.map((x) => x.body)).toEqual(["Bのコメント"]);
  });

  it("通報: 自分の投稿は通報できず、同じ投稿を二重に通報できない", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const { post } = await createThemePost(a.viewer, { title: "A", caption: "", tags: "", meta }, await makeImage(), AT);
    await expect(createReport(a.viewer, { targetType: "post", targetId: post.id, reason: "spam", detail: "" })).rejects.toMatchObject({ status: 400 });
    const r = await createReport(b.viewer, { targetType: "post", targetId: post.id, reason: "spam", detail: "宣伝です" });
    expect(r.report.status).toBe("open");
    expect(r.report.targetUserId).toBe(a.id);
    await expect(createReport(b.viewer, { targetType: "post", targetId: post.id, reason: "other", detail: "" })).rejects.toMatchObject({ status: 409 });
  });

  it("通報が一定数（既定3件）集まると、管理者の確認まで自動で非表示になる", async () => {
    const owner = await makeUser("投稿者");
    const { post } = await createThemePost(owner.viewer, { title: "問題の投稿", caption: "", tags: "", meta }, await makeImage(), AT);
    const reporters = [await makeUser("R1"), await makeUser("R2"), await makeUser("R3")];
    const results = [];
    for (const r of reporters) {
      results.push(await createReport(r.viewer, { targetType: "post", targetId: post.id, reason: "inappropriate", detail: "" }));
    }
    expect(results.map((r) => r.autoHidden)).toEqual([false, false, true]);
    // ほかの人からは見えない。投稿者本人には「非表示」として見える
    await expect(getPost(reporters[0].viewer, post.id, AT)).rejects.toMatchObject({ status: 404 });
    expect((await getPost(owner.viewer, post.id, AT)).status).toBe("hidden");
  });

  it("自動非表示の件数は設定で変えられ、0 なら自動では隠さない", async () => {
    await setSetting(SETTING_KEYS.autoHideReports, 0);
    const owner = await makeUser("投稿者");
    const { post } = await createThemePost(owner.viewer, { title: "x", caption: "", tags: "", meta }, await makeImage(), AT);
    for (const name of ["R1", "R2", "R3", "R4"]) {
      const r = await makeUser(name);
      await createReport(r.viewer, { targetType: "post", targetId: post.id, reason: "spam", detail: "" });
    }
    expect((await getPost(owner.viewer, post.id, AT)).status).toBe("visible");
  });

  it("コメントとユーザーも通報できる", async () => {
    const a = await makeUser("A");
    const b = await makeUser("B");
    const { post } = await createThemePost(a.viewer, { title: "A", caption: "", tags: "", meta }, await makeImage(), AT);
    await createThemePost(b.viewer, { title: "B", caption: "", tags: "", meta }, await makeImage(), AT);
    const c = await addComment(b.viewer, post.id, "ひどいコメント", AT);
    const r1 = await createReport(a.viewer, { targetType: "comment", targetId: c.id, reason: "harassment", detail: "" });
    expect(r1.report.targetUserId).toBe(b.id);
    const r2 = await createReport(a.viewer, { targetType: "user", targetId: b.id, reason: "harassment", detail: "" });
    expect(r2.report.targetType).toBe("user");
  });
});
