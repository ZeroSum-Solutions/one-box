import { constants, type BigIntStats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveSiteAuthorityWriteTarget } from "./siteAuthority";

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const NONBLOCK = constants.O_NONBLOCK ?? 0;
const READ_FLAGS = constants.O_RDONLY | NOFOLLOW | NONBLOCK;

function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === code;
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

/** Read an optional bounded regular file without following a replaced final path. */
export async function readOptionalBoundedAuthorityFile(
  filePath: string,
  maxBytes: number,
  label: string,
): Promise<Buffer | undefined> {
  const target = await resolveSiteAuthorityWriteTarget(filePath);
  const initial = await fs.lstat(target, { bigint: true }).catch((error: unknown) => {
    if (isCode(error, "ENOENT")) return undefined;
    throw error;
  });
  if (!initial) return undefined;
  if (
    initial.isSymbolicLink() ||
    !initial.isFile() ||
    initial.nlink > BigInt(1) ||
    initial.size > BigInt(maxBytes)
  ) {
    throw new Error(`${label} must be one bounded regular file: ${path.basename(target)}`);
  }

  let handle;
  try {
    handle = await fs.open(target, READ_FLAGS);
  } catch (cause) {
    throw new Error(`${label} changed before read: ${path.basename(target)}`, { cause });
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink > BigInt(1) ||
      !sameFile(initial, opened) ||
      opened.size !== initial.size ||
      opened.size > BigInt(maxBytes)
    ) {
      throw new Error(`${label} changed before read: ${path.basename(target)}`);
    }
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) {
        throw new Error(`${label} changed while read: ${path.basename(target)}`);
      }
      offset += bytesRead;
    }
    const growthProbe = Buffer.alloc(1);
    const { bytesRead: extraBytesRead } = await handle.read(growthProbe, 0, 1, bytes.length);
    if (extraBytesRead !== 0) {
      throw new Error(`${label} changed while read: ${path.basename(target)}`);
    }
    const after = await handle.stat({ bigint: true });
    if (!sameFile(opened, after) || opened.size !== after.size) {
      throw new Error(`${label} changed while read: ${path.basename(target)}`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}
