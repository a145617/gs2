import sharp from "sharp";
import { demoPhotoById, requireDemoPhoto, DEMO_PHOTOS } from "./demo-photos";

// デバッグ・テスト用の小さな DNG（RAW）ファイル。RAWの読み込み・現像を実機で確認するために配る。
// Unsplash の写真（湖の朝）を、リニアRGB（LinearRaw）・非圧縮・16bit の DNG に変換したもの。
// 現像で露出を上げて確認できるよう少し暗めに記録し、シャッタースピード 1/125・F2.8・ISO200 の撮影情報を付ける
// （撮影情報は RAW 現像の画面の確認用に付けた値で、元の写真の撮影情報ではない）。

export const SAMPLE_DNG_PHOTO_ID = "EB8QZStPYMU";
const W = 600;
const H = 400;

const TYPES = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, RATIONAL: 5, SRATIONAL: 10 } as const;
const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 10: 8 };

type Entry = { tag: number; type: number; values: number[] };

let cache: Promise<Buffer> | null = null;

export function buildSampleDng(): Promise<Buffer> {
  cache ??= build().catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}

async function build(): Promise<Buffer> {
  const photo = demoPhotoById(SAMPLE_DNG_PHOTO_ID) ?? DEMO_PHOTOS[0];
  const { data } = await sharp(await requireDemoPhoto(photo))
    .resize(W, H, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // sRGB（8bit）→ リニア（16bit）。少し暗めに記録する
  const toLin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const pix = new Uint16Array(W * H * 3);
  for (let i = 0; i < pix.length; i++) pix[i] = Math.round(toLin(data[i]) * 0.6 * 65535);

  const entries: Entry[] = [];
  const ascii = (s: string) => [...Buffer.from(`${s}\0`, "ascii")];
  const add = (tag: number, type: number, values: number[]) => entries.push({ tag, type, values });
  const XYZ_TO_SRGB = [3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.204, 1.057];
  const credit = `Photo by ${photo.by} on Unsplash (${photo.url})`.replace(/[^\x20-\x7e]/g, "?");

  add(254, TYPES.LONG, [0]);
  add(256, TYPES.LONG, [W]);
  add(257, TYPES.LONG, [H]);
  add(258, TYPES.SHORT, [16, 16, 16]);
  add(259, TYPES.SHORT, [1]);
  add(262, TYPES.SHORT, [34892]); // LinearRaw
  add(270, TYPES.ASCII, ascii(credit)); // ImageDescription（写真の出典）
  add(271, TYPES.ASCII, ascii("Hitokoma"));
  add(272, TYPES.ASCII, ascii("SampleDNG"));
  add(273, TYPES.LONG, [0]); // StripOffsets（後で埋める）
  add(274, TYPES.SHORT, [1]);
  add(277, TYPES.SHORT, [3]);
  add(278, TYPES.LONG, [H]);
  add(279, TYPES.LONG, [W * H * 6]);
  add(284, TYPES.SHORT, [1]);
  add(33434, TYPES.RATIONAL, [1, 125]); // ExposureTime
  add(33437, TYPES.RATIONAL, [28, 10]); // FNumber
  add(34855, TYPES.SHORT, [200]); // ISO
  add(50706, TYPES.BYTE, [1, 4, 0, 0]);
  add(50707, TYPES.BYTE, [1, 1, 0, 0]);
  add(50708, TYPES.ASCII, ascii("Hitokoma SampleDNG"));
  add(50717, TYPES.LONG, [65535]);
  add(50721, TYPES.SRATIONAL, XYZ_TO_SRGB.flatMap((v) => [Math.round(v * 10000), 10000]));
  add(50728, TYPES.RATIONAL, [1, 1, 1, 1, 1, 1]);
  add(50778, TYPES.SHORT, [21]);
  entries.sort((a, b) => a.tag - b.tag);

  const count = (e: Entry) => (e.type === TYPES.RATIONAL || e.type === TYPES.SRATIONAL ? e.values.length / 2 : e.values.length);
  const byteLen = (e: Entry) => count(e) * SIZE[e.type];

  const ifdOffset = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let extra = ifdOffset + ifdSize;
  const extraOffsets = new Map<Entry, number>();
  for (const e of entries) {
    if (byteLen(e) > 4) {
      extraOffsets.set(e, extra);
      extra += byteLen(e) + (byteLen(e) % 2);
    }
  }
  const dataOffset = extra;
  entries.find((e) => e.tag === 273)!.values = [dataOffset];

  const buf = Buffer.alloc(dataOffset + pix.byteLength);
  buf.write("II", 0, "ascii");
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifdOffset, 4);
  buf.writeUInt16LE(entries.length, ifdOffset);

  const writeValues = (e: Entry, at: number) => {
    let o = at;
    for (const x of e.values) {
      if (e.type === TYPES.BYTE || e.type === TYPES.ASCII) {
        buf.writeUInt8(x, o);
        o += 1;
      } else if (e.type === TYPES.SHORT) {
        buf.writeUInt16LE(x, o);
        o += 2;
      } else if (e.type === TYPES.SRATIONAL) {
        buf.writeInt32LE(x, o);
        o += 4;
      } else {
        buf.writeUInt32LE(x, o);
        o += 4;
      }
    }
  };

  entries.forEach((e, i) => {
    const p = ifdOffset + 2 + i * 12;
    buf.writeUInt16LE(e.tag, p);
    buf.writeUInt16LE(e.type, p + 2);
    buf.writeUInt32LE(count(e), p + 4);
    const off = extraOffsets.get(e);
    if (off !== undefined) {
      buf.writeUInt32LE(off, p + 8);
      writeValues(e, off);
    } else {
      writeValues(e, p + 8);
    }
  });
  buf.writeUInt32LE(0, ifdOffset + 2 + entries.length * 12); // 次のIFD無し
  Buffer.from(pix.buffer).copy(buf, dataOffset);
  return buf;
}
