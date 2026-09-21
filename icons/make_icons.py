#!/usr/bin/env python3
"""Rasterise icon.svg's shapes to PNG without PIL. Run from the icons/ folder.
Draws the same rings, picots, dots and centre as icon.svg using distance-based anti-aliasing."""
import math, struct, zlib

BG = (0xfb, 0xf3, 0xdc); GOLD = (0xe3, 0xaa, 0x2e); DEEP = (0xb5, 0x7d, 0x17); LEAF = (0x5e, 0x8b, 0x47)
C = 256.0

def ring_cov(px, py, r, w, dash=None):
    dx, dy = px - C, py - C
    d = math.hypot(dx, dy)
    radial = abs(d - r)
    if dash:
        a, b = dash; period = a + b
        s = (math.atan2(dy, dx) % (2 * math.pi)) * r    # arc position, SVG dashes start at 3 o'clock going clockwise (screen y down)
        m = s % period
        tang = 0.0 if m <= a else min(m - a, period - m)  # arc distance to nearest dash end (round caps extend w/2)
        dist = math.hypot(radial, tang)
    else:
        dist = radial
    return max(0.0, min(1.0, w / 2 - dist + 0.5))

def disc_cov(px, py, cx, cy, r):
    return max(0.0, min(1.0, r - math.hypot(px - cx, py - cy) + 0.5))

def rrect_cov(px, py, size, rx):
    # rounded square from (0,0) to (size,size)
    qx = abs(px - size / 2) - (size / 2 - rx)
    qy = abs(py - size / 2) - (size / 2 - rx)
    d = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - rx
    return max(0.0, min(1.0, 0.5 - d))

DOTS = [(C + 126 * math.sin(math.radians(k * 30)), C - 126 * math.cos(math.radians(k * 30))) for k in range(12)]

def shade(px, py):
    layers = [
        (GOLD, ring_cov(px, py, 190, 10, (4, 26))),
        (GOLD, ring_cov(px, py, 150, 6)),
        (GOLD, ring_cov(px, py, 110, 8, (20, 16))),
        (GOLD, ring_cov(px, py, 66, 6)),
        (LEAF, disc_cov(px, py, C, C, 26)),
    ]
    for (cx, cy) in DOTS:
        layers.append((DEEP, disc_cov(px, py, cx, cy, 9)))
    return layers

def render(size, maskable):
    scale = 512 / size
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px, py = (x + 0.5) * scale, (y + 0.5) * scale
            bgcov = 1.0 if maskable else rrect_cov(px, py, 512, 110)
            r, g, b, a = BG[0] * bgcov, BG[1] * bgcov, BG[2] * bgcov, bgcov
            for col, cov in shade(px, py):
                if cov <= 0: continue
                r = col[0] * cov + r * (1 - cov); g = col[1] * cov + g * (1 - cov); b = col[2] * cov + b * (1 - cov)
                a = cov + a * (1 - cov)
            if a > 0: r, g, b = r / a, g / a, b / a  # un-premultiply
            row += bytes((int(round(r)), int(round(g)), int(round(b)), int(round(a * 255))))
        rows.append(b'\x00' + bytes(row))
    return b''.join(rows)

def png(path, size, maskable):
    raw = render(size, maskable)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data); print('wrote', path)

if __name__ == '__main__':
    png('icon-192.png', 192, False)
    png('icon-512.png', 512, False)
    png('icon-512-maskable.png', 512, True)
