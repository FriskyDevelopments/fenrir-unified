#!/usr/bin/env python3
"""Recover Fenrir Bridge worker files from a readable Git pack.

This exists because the original Google Drive/FileProvider working tree can
leave source files and refs as `compressed,dataless`, while an older nested Git
pack remains locally readable.
"""

from __future__ import annotations

import hashlib
import os
import struct
import sys
import zlib
from functools import lru_cache
from pathlib import Path


DEFAULT_GIT_DIR = Path(
    "/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge/.git"
)
DEFAULT_PACK = (
    DEFAULT_GIT_DIR
    / "objects/pack/pack-64ff648a6efad7e72dfda5a088a902f133763236.pack"
)
DEFAULT_IDX = DEFAULT_PACK.with_suffix(".idx")
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "apps/fenrir-bridge"

TARGETS = {
    "workers/fenrir-gate-router.js",
    "workers/fenrir-stars-payments.js",
}

TYPES = {
    1: "commit",
    2: "tree",
    3: "blob",
    4: "tag",
    6: "ofs-delta",
    7: "ref-delta",
}


def parse_idx(path: Path) -> tuple[dict[str, int], dict[int, str]]:
    data = path.read_bytes()
    if data[:4] != b"\xfftOc":
        raise RuntimeError("only Git idx v2 is supported")

    fanout = struct.unpack(">256I", data[8 : 8 + 1024])
    count = fanout[-1]
    pos = 8 + 1024
    oids = [data[pos + i * 20 : pos + (i + 1) * 20].hex() for i in range(count)]
    pos += 20 * count
    pos += 4 * count
    small_offsets = list(struct.unpack(f">{count}I", data[pos : pos + 4 * count]))
    pos += 4 * count
    large_offsets = list(
        struct.unpack(
            f">{sum(1 for offset in small_offsets if offset & 0x80000000)}Q",
            data[pos : pos + 8 * sum(1 for offset in small_offsets if offset & 0x80000000)],
        )
    )

    offsets: list[int] = []
    for offset in small_offsets:
        if offset & 0x80000000:
            offsets.append(large_offsets[offset & 0x7FFFFFFF])
        else:
            offsets.append(offset)

    return dict(zip(oids, offsets)), {offset: oid for oid, offset in zip(oids, offsets)}


def read_varint(buf: bytes, pos: int) -> tuple[int, int]:
    shift = 0
    value = 0
    while True:
        byte = buf[pos]
        pos += 1
        value |= (byte & 0x7F) << shift
        if not (byte & 0x80):
            return value, pos
        shift += 7


def apply_delta(base: bytes, delta: bytes) -> bytes:
    _, pos = read_varint(delta, 0)
    out_size, pos = read_varint(delta, pos)
    out = bytearray()

    while pos < len(delta):
        command = delta[pos]
        pos += 1
        if command & 0x80:
            copy_offset = 0
            copy_size = 0
            if command & 0x01:
                copy_offset |= delta[pos]
                pos += 1
            if command & 0x02:
                copy_offset |= delta[pos] << 8
                pos += 1
            if command & 0x04:
                copy_offset |= delta[pos] << 16
                pos += 1
            if command & 0x08:
                copy_offset |= delta[pos] << 24
                pos += 1
            if command & 0x10:
                copy_size |= delta[pos]
                pos += 1
            if command & 0x20:
                copy_size |= delta[pos] << 8
                pos += 1
            if command & 0x40:
                copy_size |= delta[pos] << 16
                pos += 1
            if copy_size == 0:
                copy_size = 0x10000
            out += base[copy_offset : copy_offset + copy_size]
        elif command:
            out += delta[pos : pos + command]
            pos += command
        else:
            raise RuntimeError("bad delta command")

    if len(out) != out_size:
        raise RuntimeError(f"delta size mismatch: {len(out)} != {out_size}")

    return bytes(out)


def object_id(kind: str, data: bytes) -> str:
    return hashlib.sha1(f"{kind} {len(data)}\0".encode() + data).hexdigest()


class PackReader:
    def __init__(self, pack_path: Path, idx_path: Path) -> None:
        self.pack = pack_path.read_bytes()
        self.oid_to_offset, _ = parse_idx(idx_path)
        if self.pack[:4] != b"PACK":
            raise RuntimeError("invalid pack file")

    def _header(self, offset: int) -> tuple[int, int, int]:
        pos = offset
        byte = self.pack[pos]
        pos += 1
        kind = (byte >> 4) & 7
        size = byte & 0x0F
        shift = 4
        while byte & 0x80:
            byte = self.pack[pos]
            pos += 1
            size |= (byte & 0x7F) << shift
            shift += 7
        return kind, size, pos

    def _decompress(self, pos: int) -> tuple[bytes, int]:
        decomp = zlib.decompressobj()
        data = decomp.decompress(self.pack[pos:])
        used = len(self.pack[pos:]) - len(decomp.unused_data)
        return data, pos + used

    def _ofs_base(self, pos: int, current_offset: int) -> tuple[int, int]:
        byte = self.pack[pos]
        pos += 1
        value = byte & 0x7F
        while byte & 0x80:
            byte = self.pack[pos]
            pos += 1
            value = ((value + 1) << 7) | (byte & 0x7F)
        return current_offset - value, pos

    @lru_cache(maxsize=None)
    def resolve_offset(self, offset: int) -> tuple[str, bytes]:
        kind, _, pos = self._header(offset)
        if kind in (1, 2, 3, 4):
            data, _ = self._decompress(pos)
            return TYPES[kind], data
        if kind == 6:
            base_offset, pos = self._ofs_base(pos, offset)
            delta, _ = self._decompress(pos)
            base_kind, base_data = self.resolve_offset(base_offset)
            return base_kind, apply_delta(base_data, delta)
        if kind == 7:
            base_oid = self.pack[pos : pos + 20].hex()
            delta, _ = self._decompress(pos + 20)
            base_kind, base_data = self.resolve_oid(base_oid)
            return base_kind, apply_delta(base_data, delta)
        raise RuntimeError(f"unknown pack object type {kind}")

    @lru_cache(maxsize=None)
    def resolve_oid(self, oid: str) -> tuple[str, bytes]:
        return self.resolve_offset(self.oid_to_offset[oid])


def parse_tree(data: bytes):
    pos = 0
    while pos < len(data):
        space = data.index(b" ", pos)
        mode = data[pos:space].decode()
        pos = space + 1
        nul = data.index(b"\0", pos)
        name = data[pos:nul].decode()
        pos = nul + 1
        oid = data[pos : pos + 20].hex()
        pos += 20
        yield mode, name, oid


def main() -> int:
    pack_path = Path(os.environ.get("FENRIR_BRIDGE_PACK", DEFAULT_PACK))
    idx_path = Path(os.environ.get("FENRIR_BRIDGE_PACK_IDX", DEFAULT_IDX))
    out_dir = Path(os.environ.get("FENRIR_BRIDGE_OUT", DEFAULT_OUT))

    reader = PackReader(pack_path, idx_path)
    found: dict[str, tuple[str, bytes]] = {}

    def walk_tree(oid: str, prefix: str = "") -> None:
        kind, data = reader.resolve_oid(oid)
        if kind != "tree":
            return
        for mode, name, child_oid in parse_tree(data):
            path = prefix + name
            if path in TARGETS:
                child_kind, child_data = reader.resolve_oid(child_oid)
                found[path] = (child_oid, child_data)
            if mode.startswith("40000") or mode == "040000":
                walk_tree(child_oid, path + "/")

    for oid in reader.oid_to_offset:
        kind, data = reader.resolve_oid(oid)
        if kind != "commit":
            continue
        tree = data.split(b"\n", 1)[0].split()[1].decode()
        walk_tree(tree)

    for path, (oid, data) in sorted(found.items()):
        dest = out_dir / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        print(f"wrote {path} {oid} {len(data)} bytes")

    missing = sorted(TARGETS - set(found))
    for path in missing:
        print(f"missing {path}", file=sys.stderr)

    return 0 if found else 1


if __name__ == "__main__":
    raise SystemExit(main())
