import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/server/db/client";
import { comments, notifications, posts, reports } from "@/server/db/schema";
import { createThemePost, getHashtag, getPost, listThemePosts, updatePost } from "@/server/services/posts";
import { getCurrentTheme, scheduleTheme, seedThemePool } from "@/server/services/themes";
import { addComment, listComments } from "@/server/services/social";
import { createReport } from "@/server/services/moderation";
import { authenticate } from "@/server/services/users";
import {
  acknowledgeWarning,
  adminDeleteComment,
  adminDeletePost,
  adminDeleteUser,
  adminEditComment,
  adminEditPost,
  adminListPosts,
  adminListReports,
  adminListUsers,
  adminSetCommentStatus,
  adminSetPostStatus,
  adminStats,
  listAuditLogs,
  pendingWarnings,
  resolveReport,
  setUserRole,
  warnUser,
} from "@/server/services/admin";
import {
  createEvent,
  deleteUpcomingEvent,
  endEventNow,
  ensureStartNotifications,
  findCurrentEvent,
  notifyEventStart,
} from "@/server/services/events";
import { resetDb } from "./support/db";
import { makeImage, makeUser } from "./support/factories";

const AT = new Date("2026-11-18T09:00:00+09:00");
const HOUR = 3600_000;
const meta = { mode: "auto" as const };

async function notificationsOf(userId: string, type: string) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId));
  return rows.filter((r) => r.type === type);
}

describe("管理者（仕様: 任意の投稿・コメントの編集と削除、アカウントへの警告と削除、任意のお題・イベントの開催）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
  });
  afterAll(closeDb);

  it("任意の投稿を編集でき、投稿者にお知らせが届き、操作の記録が残る。一般ユーザーは他人の投稿を編集できない", async () => {
    const admin = await makeUser("管理者", "admin");
    const a = await makeUser("A");
    const b = await makeUser("B");
    const { post } = await createThemePost(a.viewer, { title: "元のタイトル", caption: "#猫 です", tags: "", meta }, await makeImage(), AT);

    await expect(updatePost(b.viewer, post.id, { title: "乗っ取り" }, AT, { asAdmin: true })).rejects.toMatchObject({ status: 403 });

    const edited = await adminEditPost(admin.viewer, post.id, { title: "直したタイトル", caption: "#犬 です" }, AT);
    expect(edited.title).toBe("直したタイトル");
    expect(edited.tags).toEqual(["犬"]);
    expect((await getHashtag("猫"))?.postCount).toBe(0);
    expect((await getHashtag("犬"))?.postCount).toBe(1);
    const row = await db.query.posts.findFirst({ where: eq(posts.id, post.id) });
    expect(row?.editedByAdminAt).toBeTruthy();
    expect(row?.editedAt).toBeNull();
    expect(await notificationsOf(a.id, "post_edited")).toHaveLength(1);

    const logs = await listAuditLogs(null);
    expect(logs.items[0]).toMatchObject({ action: "post.edit", targetType: "post", targetId: post.id });
    expect(logs.items[0].actor?.handle).toBe(admin.handle);
  });

  it("任意の投稿を非表示・復元・削除できる（削除するとハッシュタグの件数も減り、投稿者に理由が届く）", async () => {
    const admin = await makeUser("管理者", "admin");
    const a = await makeUser("A");
    const b = await makeUser("B");
    const theme = await getCurrentTheme(AT);
    const { post } = await createThemePost(a.viewer, { title: "問題の投稿", caption: "#夕焼け", tags: "", meta }, await makeImage(), AT);
    await createThemePost(b.viewer, { title: "Bの投稿", caption: "", tags: "", meta }, await makeImage(), AT);

    await adminSetPostStatus(admin.viewer, post.id, "hidden", "確認中");
    expect((await listThemePosts(b.viewer, theme.id, AT, null)).items.map((p) => p.title)).toEqual(["Bの投稿"]);
    await expect(getPost(b.viewer, post.id, AT)).rejects.toMatchObject({ status: 404 });
    expect((await adminListPosts("", "hidden", null)).items.map((p) => p.id)).toEqual([post.id]);

    await adminSetPostStatus(admin.viewer, post.id, "visible", "");
    expect((await listThemePosts(b.viewer, theme.id, AT, null)).items).toHaveLength(2);

    await adminDeletePost(admin.viewer, post.id, "ガイドライン違反のため");
    expect((await db.query.posts.findFirst({ where: eq(posts.id, post.id) }))?.status).toBe("deleted");
    expect((await getHashtag("夕焼け"))?.postCount).toBe(0);
    const removed = await notificationsOf(a.id, "post_removed");
    expect(removed).toHaveLength(1);
    expect(removed[0].data).toMatchObject({ reason: "ガイドライン違反のため", title: "問題の投稿" });
    await expect(adminSetPostStatus(admin.viewer, post.id, "hidden", "")).rejects.toMatchObject({ status: 404 });
    await expect(adminSetPostStatus(admin.viewer, "not-a-uuid", "hidden", "")).rejects.toMatchObject({ status: 404 });
  });

  it("任意のコメントを編集・非表示・削除でき、コメント数が正しく保たれる", async () => {
    const admin = await makeUser("管理者", "admin");
    const a = await makeUser("A");
    const b = await makeUser("B");
    const { post } = await createThemePost(a.viewer, { title: "A", caption: "", tags: "", meta }, await makeImage(), AT);
    await createThemePost(b.viewer, { title: "B", caption: "", tags: "", meta }, await makeImage(), AT);
    const c1 = await addComment(b.viewer, post.id, "ひどいコメント", AT);
    await addComment(b.viewer, post.id, "ふつうのコメント", AT);
    const count = async () => (await db.query.posts.findFirst({ where: eq(posts.id, post.id) }))?.commentCount;
    expect(await count()).toBe(2);

    const edited = await adminEditComment(admin.viewer, c1.id, "（管理者により修正されました）", AT);
    expect(edited.body).toBe("（管理者により修正されました）");
    expect(await notificationsOf(b.id, "comment_edited")).toHaveLength(1);

    await adminSetCommentStatus(admin.viewer, c1.id, "hidden");
    await adminSetCommentStatus(admin.viewer, c1.id, "hidden"); // 二重に非表示にしても数はずれない
    expect(await count()).toBe(1);
    expect((await listComments(a.viewer, post.id, AT, null)).items.map((c) => c.body)).toEqual(["ふつうのコメント"]);
    await adminSetCommentStatus(admin.viewer, c1.id, "visible");
    expect(await count()).toBe(2);

    await adminDeleteComment(admin.viewer, c1.id, "不適切な表現");
    expect(await count()).toBe(1);
    expect((await db.query.comments.findFirst({ where: eq(comments.id, c1.id) }))?.status).toBe("deleted");
    expect(await notificationsOf(b.id, "comment_removed")).toHaveLength(1);
  });

  it("アカウントへの警告は、本人が確認するまで残り続ける", async () => {
    const admin = await makeUser("管理者", "admin");
    const a = await makeUser("A");
    await expect(warnUser(admin.viewer, a.id, "   ")).rejects.toMatchObject({ status: 400 });
    const w = await warnUser(admin.viewer, a.id, "他の人への攻撃的なコメントはやめてください");
    expect(await pendingWarnings(a.id)).toEqual([expect.objectContaining({ id: w.id, message: "他の人への攻撃的なコメントはやめてください" })]);
    expect(await notificationsOf(a.id, "warning")).toHaveLength(1);
    // 他人は確認済みにできない
    const other = await makeUser("他人");
    await acknowledgeWarning(other.id, w.id);
    expect(await pendingWarnings(a.id)).toHaveLength(1);
    await acknowledgeWarning(a.id, w.id);
    expect(await pendingWarnings(a.id)).toEqual([]);
    expect((await adminListUsers(a.handle, null)).items[0]).toMatchObject({ id: a.id, warnings: 1 });
  });

  it("アカウントを削除すると、ログインできなくなり、投稿・コメントも消えて件数が合う", async () => {
    const admin = await makeUser("管理者", "admin");
    const a = await makeUser("A");
    const b = await makeUser("B");
    const theme = await getCurrentTheme(AT);
    await createThemePost(a.viewer, { title: "Aの投稿", caption: "#海", tags: "", meta }, await makeImage(), AT);
    const { post: bPost } = await createThemePost(b.viewer, { title: "Bの投稿", caption: "#海", tags: "", meta }, await makeImage(), AT);
    await addComment(a.viewer, bPost.id, "Aのコメント", AT);
    await addComment(a.viewer, bPost.id, "Aのコメント2", AT);
    expect((await getHashtag("海"))?.postCount).toBe(2);

    await expect(adminDeleteUser(admin.viewer, admin.id, "")).rejects.toMatchObject({ status: 400 });
    await adminDeleteUser(admin.viewer, a.id, "規約違反");

    await expect(authenticate(a.email, "password1")).rejects.toMatchObject({ status: 401 });
    expect((await listThemePosts(b.viewer, theme.id, AT, null)).items.map((p) => p.title)).toEqual(["Bの投稿"]);
    expect((await getHashtag("海"))?.postCount).toBe(1);
    expect((await db.query.posts.findFirst({ where: eq(posts.id, bPost.id) }))?.commentCount).toBe(0);
    expect((await listComments(b.viewer, bPost.id, AT, null)).items).toEqual([]);
    expect((await adminListUsers("", null)).items.map((u) => u.id)).not.toContain(a.id);
    const logs = await listAuditLogs(null);
    expect(logs.items.find((l) => l.action === "user.delete")).toMatchObject({ targetId: a.id });
  });

  it("通報を処理すると、同じ対象への通報がまとめて閉じられ、通報者にお知らせが届く", async () => {
    const admin = await makeUser("管理者", "admin");
    const a = await makeUser("A");
    const r1 = await makeUser("通報者1");
    const r2 = await makeUser("通報者2");
    const { post } = await createThemePost(a.viewer, { title: "通報される投稿", caption: "", tags: "", meta }, await makeImage(), AT);
    const { post: post2 } = await createThemePost(a.viewer, { title: "問題のない投稿", caption: "", tags: "", meta }, await makeImage(), AT);
    await createReport(r1.viewer, { targetType: "post", targetId: post.id, reason: "spam", detail: "" });
    await createReport(r2.viewer, { targetType: "post", targetId: post.id, reason: "inappropriate", detail: "広告です" });
    await createReport(r1.viewer, { targetType: "post", targetId: post2.id, reason: "other", detail: "" });

    const open = await adminListReports("open", null);
    expect(open.items).toHaveLength(3);
    expect(open.items.find((r) => r.targetId === post.id)?.target).toMatchObject({ title: "通報される投稿", postStatus: "visible" });
    expect((await adminStats()).openReports).toBe(3);

    const { closed } = await resolveReport(admin.viewer, open.items.find((r) => r.targetId === post.id)!.id, "hide", "宣伝のため");
    expect(closed).toBe(2);
    expect((await db.query.posts.findFirst({ where: eq(posts.id, post.id) }))?.status).toBe("hidden");
    expect(await notificationsOf(r1.id, "report_resolved")).toHaveLength(1);
    expect(await notificationsOf(r2.id, "report_resolved")).toHaveLength(1);

    // 問題なし: 通報の件数が戻り、「通報あり」の絞り込みから外れる
    expect((await adminListPosts("", "reported", null)).items.map((p) => p.id)).toContain(post2.id);
    await resolveReport(admin.viewer, open.items.find((r) => r.targetId === post2.id)!.id, "dismiss", "");
    expect((await adminListPosts("", "reported", null)).items.map((p) => p.id)).not.toContain(post2.id);
    expect((await db.query.posts.findFirst({ where: eq(posts.id, post2.id) }))?.status).toBe("visible");
    expect((await adminListReports("open", null)).items).toHaveLength(0);
    expect((await adminListReports("dismissed", null)).items).toHaveLength(1);
    const resolved = await db.select().from(reports).where(and(eq(reports.targetId, post.id), eq(reports.status, "resolved")));
    expect(resolved).toHaveLength(2);

    // アカウントへの通報に「非表示」は使えない
    await createReport(r1.viewer, { targetType: "user", targetId: a.id, reason: "harassment", detail: "" });
    const userReport = (await adminListReports("open", null)).items[0];
    await expect(resolveReport(admin.viewer, userReport.id, "hide", "")).rejects.toMatchObject({ status: 400 });
  });

  it("自分自身の管理者権限は外せない。他のユーザーを管理者にできる", async () => {
    const admin = await makeUser("管理者", "admin");
    const a = await makeUser("A");
    await expect(setUserRole(admin.viewer, admin.id, "user")).rejects.toMatchObject({ status: 400 });
    expect((await setUserRole(admin.viewer, a.id, "admin")).role).toBe("admin");
  });

  it("予約したお題は開始時刻になると今日のお題になり、終了するといつものお題に戻る", async () => {
    const admin = await makeUser("管理者", "admin");
    const daily = await getCurrentTheme(AT);
    const scheduled = await scheduleTheme({
      title: "管理者のお題",
      description: "",
      template: "prism",
      startsAt: new Date(AT.getTime() + HOUR),
      endsAt: new Date(AT.getTime() + 3 * HOUR),
      source: "admin",
      createdById: admin.id,
    });
    expect((await getCurrentTheme(AT)).id).toBe(daily.id);
    expect((await getCurrentTheme(new Date(AT.getTime() + 2 * HOUR))).id).toBe(scheduled.id);
    expect((await getCurrentTheme(new Date(AT.getTime() + 4 * HOUR))).id).toBe(daily.id);
  });

  it("予約したイベントは、開始後の最初のアクセスで1回だけ全員に開始のお知らせが届く。開始前なら取り消せる", async () => {
    const admin = await makeUser("管理者", "admin");
    const a = await makeUser("A");
    const art = { w: 2, h: 2, palette: [{ hex: "#d64545", name: "赤" }], cells: [0, 0, 0, 0] };
    const ev = await createEvent({
      title: "予約のイベント",
      art,
      startsAt: new Date(AT.getTime() + HOUR),
      endsAt: new Date(AT.getTime() + 5 * HOUR),
      source: "admin",
      createdById: admin.id,
    });
    await ensureStartNotifications(AT);
    expect(await notificationsOf(a.id, "event")).toHaveLength(0);
    expect(await findCurrentEvent(AT)).toBeNull();
    await expect(endEventNow(ev.id, AT)).rejects.toMatchObject({ status: 400 });

    const later = new Date(AT.getTime() + 2 * HOUR);
    await ensureStartNotifications(later);
    await ensureStartNotifications(later);
    await notifyEventStart(ev);
    expect(await notificationsOf(a.id, "event")).toHaveLength(1);
    expect((await findCurrentEvent(later))?.id).toBe(ev.id);
    await expect(deleteUpcomingEvent(ev.id, later)).rejects.toMatchObject({ status: 400 });
    await endEventNow(ev.id, later);
    expect(await findCurrentEvent(later)).toBeNull();

    const ev2 = await createEvent({
      title: "取り消すイベント",
      art,
      startsAt: new Date(AT.getTime() + 10 * HOUR),
      endsAt: new Date(AT.getTime() + 20 * HOUR),
      source: "admin",
    });
    await deleteUpcomingEvent(ev2.id, AT);
    await expect(deleteUpcomingEvent(ev2.id, AT)).rejects.toMatchObject({ status: 400 });
  });
});
