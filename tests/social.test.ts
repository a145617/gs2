import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createThemePost, getPost, listTagPosts } from "@/server/services/posts";
import { seedThemePool } from "@/server/services/themes";
import {
  addComment,
  bookmarkPost,
  deleteComment,
  editComment,
  follow,
  followState,
  likePost,
  listBookmarks,
  listComments,
  listFollowUsers,
  profileCounts,
  unbookmarkPost,
  unfollow,
  unlikePost,
} from "@/server/services/social";
import { listNotifications, markAllRead, unreadCount } from "@/server/services/notifications";
import { resetDb } from "./support/db";
import { makeImage, makeUser } from "./support/factories";

const AT = new Date("2026-11-18T09:00:00+09:00");
const meta = { mode: "auto" as const };

async function setup() {
  const a = await makeUser("A");
  const b = await makeUser("B");
  const { post } = await createThemePost(a.viewer, { title: "Aの空", caption: "#空", tags: "", meta }, await makeImage(), AT);
  // B も投稿して、今日のお題の投稿を見られる状態にする
  await createThemePost(b.viewer, { title: "Bの空", caption: "", tags: "", meta }, await makeImage("#aa3333"), AT);
  return { a, b, post };
}

describe("いいね・ブックマーク・コメント・ハッシュタグ・フォロー（仕様: 一般のSNS同様の機能）", () => {
  beforeEach(async () => {
    await resetDb();
    await seedThemePool();
  });
  afterAll(closeDb);

  it("いいね: 何度押しても1回分、取り消せる。作者にお知らせが届く", async () => {
    const { a, b, post } = await setup();
    expect(await likePost(b.viewer, post.id, AT)).toEqual({ liked: true, count: 1 });
    expect(await likePost(b.viewer, post.id, AT)).toEqual({ liked: true, count: 1 });
    expect((await getPost(b.viewer, post.id, AT)).viewer.liked).toBe(true);
    expect(await unreadCount(a.id)).toBe(1);
    const n = await listNotifications(a.id, null);
    expect(n.items[0]).toMatchObject({ type: "like", actor: { id: b.id }, postId: post.id });
    expect(await unlikePost(b.viewer, post.id)).toEqual({ liked: false, count: 0 });
    expect(await unreadCount(a.id)).toBe(0);
  });

  it("今日のお題に投稿していない人は、いいね・コメントできない", async () => {
    const a = await makeUser("A");
    const c = await makeUser("C");
    const { post } = await createThemePost(a.viewer, { title: "t", caption: "", tags: "", meta }, await makeImage(), AT);
    await expect(likePost(c.viewer, post.id, AT)).rejects.toMatchObject({ status: 403 });
    await expect(addComment(c.viewer, post.id, "すてき", AT)).rejects.toMatchObject({ status: 403 });
  });

  it("ブックマーク: 保存・一覧・解除", async () => {
    const { b, post } = await setup();
    await bookmarkPost(b.viewer, post.id, AT);
    const list = await listBookmarks(b.viewer, AT, null);
    expect(list.items.map((p) => p.id)).toEqual([post.id]);
    expect(list.items[0].viewer.bookmarked).toBe(true);
    await unbookmarkPost(b.viewer, post.id);
    expect((await listBookmarks(b.viewer, AT, null)).items).toHaveLength(0);
  });

  it("コメント: 投稿・一覧・本人の編集・削除（投稿者も削除できる）", async () => {
    const { a, b, post } = await setup();
    const c1 = await addComment(b.viewer, post.id, "きれいな空ですね", AT);
    const c2 = await addComment(b.viewer, post.id, "二つ目", new Date(AT.getTime() + 1000));
    expect((await getPost(a.viewer, post.id, AT)).counts.comments).toBe(2);
    const list = await listComments(a.viewer, post.id, AT, null);
    expect(list.items.map((c) => c.body)).toEqual(["きれいな空ですね", "二つ目"]);
    expect(list.items[0].viewer).toMatchObject({ isMine: false, canEdit: false, canDelete: true });

    await expect(editComment(a.viewer, c1.id, "書き換え", AT)).rejects.toMatchObject({ status: 403 });
    const edited = await editComment(b.viewer, c1.id, "とてもきれい", AT);
    expect(edited.body).toBe("とてもきれい");
    expect(edited.editedAt).not.toBeNull();

    await deleteComment(a.viewer, c2.id); // 投稿者は自分の投稿へのコメントを削除できる
    expect((await listComments(a.viewer, post.id, AT, null)).items).toHaveLength(1);
    expect((await getPost(a.viewer, post.id, AT)).counts.comments).toBe(1);
    expect((await listNotifications(a.id, null)).items.some((n) => n.type === "comment")).toBe(true);
  });

  it("ハッシュタグで投稿を探せる", async () => {
    const { b, post } = await setup();
    const page = await listTagPosts(b.viewer, "空", AT, null);
    expect(page.items.map((p) => p.id)).toEqual([post.id]);
  });

  it("フォロー: フォロー・解除・一覧・数・お知らせ", async () => {
    const { a, b } = await setup();
    await follow(b.viewer, a.id, AT);
    await follow(b.viewer, a.id, AT);
    expect(await followState(b.id, a.id)).toEqual({ following: true, followsMe: false });
    expect(await profileCounts(a.id)).toMatchObject({ followers: 1, following: 0, posts: 1 });
    const followers = await listFollowUsers(a.viewer, a.id, "followers", null);
    expect(followers.items.map((u) => u.id)).toEqual([b.id]);
    expect((await listNotifications(a.id, null)).items[0]).toMatchObject({ type: "follow", actor: { id: b.id } });
    await expect(follow(a.viewer, a.id, AT)).rejects.toMatchObject({ status: 400 });
    await unfollow(b.viewer, a.id);
    expect(await profileCounts(a.id)).toMatchObject({ followers: 0 });
  });

  it("お知らせはすべて既読にできる", async () => {
    const { a, b, post } = await setup();
    await likePost(b.viewer, post.id, AT);
    await follow(b.viewer, a.id, AT);
    expect(await unreadCount(a.id)).toBe(2);
    await markAllRead(a.id);
    expect(await unreadCount(a.id)).toBe(0);
  });
});
