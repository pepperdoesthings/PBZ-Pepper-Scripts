"""List (and optionally extract single files from) an Unreal .pak without reading the whole file.

usage: python listpak.py <pak> [substring-filter] [--extract <outdir>]

Seeks to the footer at the end of the file, reads only the index, and prints
path + size for every entry whose path contains the filter (case-insensitive).
With --extract, the matching entries are read with seeks and written out.
"""
import os
import struct
import sys
import zlib

MAGIC = 0x5A6F12E1


def read_index(f):
    f.seek(0, 2)
    size = f.tell()
    tail_len = min(size, 4096)
    f.seek(size - tail_len)
    tail = f.read(tail_len)
    at = tail.rfind(struct.pack("<I", MAGIC))
    if at < 0:
        raise SystemExit("no pak footer magic found")
    version, index_off, index_size = struct.unpack("<IQQ", tail[at + 4:at + 24])
    f.seek(index_off)
    return version, f.read(index_size)


class Reader:
    def __init__(self, buf):
        self.b, self.o = buf, 0

    def i32(self):
        v = struct.unpack_from("<i", self.b, self.o)[0]
        self.o += 4
        return v

    def u64(self):
        v = struct.unpack_from("<Q", self.b, self.o)[0]
        self.o += 8
        return v

    def string(self):
        n = self.i32()
        if n < 0:
            s = self.b[self.o:self.o + (-n) * 2 - 2].decode("utf-16")
            self.o += -n * 2
        else:
            s = self.b[self.o:self.o + n - 1].decode()
            self.o += n
        return s


def parse(f):
    version, index = read_index(f)
    r = Reader(index)
    mount = r.string()
    r.i32()  # entry count
    r.u64()  # path hash seed
    if r.i32():  # has path hash index
        r.o += 8 + 8 + 20
    dir_off = dir_size = 0
    if r.i32():  # has full directory index
        dir_off, dir_size = r.u64(), r.u64()
        r.o += 20
    enc_len = r.i32()
    encoded = index[r.o:r.o + enc_len]
    if not dir_size:
        raise SystemExit("pak has no full directory index")
    f.seek(dir_off)
    d = Reader(f.read(dir_size))
    entries = []
    for _ in range(d.i32()):
        dname = d.string()
        for _ in range(d.i32()):
            fname = d.string()
            entries.append((dname + fname, d.i32()))
    return mount, encoded, entries


def decode(encoded, eo):
    bits = struct.unpack_from("<I", encoded, eo)[0]
    q = eo + 4
    nblocks = (bits >> 6) & 0xFFFF
    method = (bits >> 23) & 0x3F

    def num(small):
        nonlocal q
        fmt, n = ("<I", 4) if small else ("<Q", 8)
        v = struct.unpack_from(fmt, encoded, q)[0]
        q += n
        return v

    offset = num(bits & (1 << 31))
    usize = num(bits & (1 << 30))
    csize = num(bits & (1 << 29)) if method else usize
    blocks = [num(True) for _ in range(nblocks)] if method and nblocks else []
    return offset, usize, csize, method, blocks


def read_entry(f, offset, usize, method, blocks):
    if method == 0:
        f.seek(offset + 53)
        return f.read(usize)
    f.seek(offset + 8 + 8 + 8 + 4 + 20 + 4 + 16 * len(blocks) + 1 + 4)
    return b"".join(zlib.decompress(f.read(n)) for n in blocks)


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    out = None
    if "--extract" in args:
        i = args.index("--extract")
        out = args[i + 1]
        del args[i:i + 2]
    pak = args[0]
    needle = args[1].lower() if len(args) > 1 else ""
    with open(pak, "rb") as f:
        mount, encoded, entries = parse(f)
        shown = 0
        for name, eo in entries:
            if needle not in name.lower():
                continue
            offset, usize, csize, method, blocks = decode(encoded, eo)
            print(f"{usize:>10}  m{method}  {name}")
            shown += 1
            if out:
                data = read_entry(f, offset, usize, method, blocks)
                dest = os.path.join(out, (mount + name).replace("../", "").lstrip("/"))
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "wb") as g:
                    g.write(data)
        print(f"-- {shown} of {len(entries)} entries match", file=sys.stderr)


if __name__ == "__main__":
    main()
