from pathlib import Path
import argparse

def cell(i):
    return (
        f'<mxCell id="c{i}" value="Node {i}" vertex="1" parent="1">'
        '<mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>'
        '</mxCell>'
    )

def diagram(total_cells):
    # mxGraphModel 自带两个基础 mxCell：id=0 和 id=1
    extra = ''.join(cell(i) for i in range(2, total_cells))
    return (
        '<mxGraphModel><root>'
        '<mxCell id="0"/>'
        '<mxCell id="1" parent="0"/>'
        + extra +
        '</root></mxGraphModel>'
    )

def write_exact_size(path, base, target):
    raw = base.encode("utf-8")
    closing = b"</mxGraphModel>"
    assert raw.endswith(closing)
    padding = target - len(raw) - 7
    if padding < 0:
        raise ValueError("Base XML is larger than target size")
    content = raw[:-len(closing)] + b"<!--" + b"x" * padding + b"-->" + closing
    assert len(content) == target
    path.write_bytes(content)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=".runtime/safety-inputs")
    args = parser.parse_args()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    for total in (9999, 10000, 10001):
        (out / f"cells-{total}.drawio").write_text(
            diagram(total), encoding="utf-8"
        )

    (out / "empty.drawio").write_bytes(b"")
    (out / "valid-small.drawio").write_text(diagram(3), encoding="utf-8")

    for count in (20, 21):
        pages = "".join(
            f'<diagram id="p{i}" name="Page {i}">{diagram(2)}</diagram>'
            for i in range(count)
        )
        (out / f"pages-{count}.drawio").write_text(
            f"<mxfile>{pages}</mxfile>", encoding="utf-8"
        )

    base = diagram(3)
    for size in (2 * 1024 * 1024, 2 * 1024 * 1024 + 1):
        write_exact_size(
            out / f"file-{size}-bytes.drawio", base, size
        )

    print(f"Generated safety cases in {out.resolve()}")
    for path in sorted(out.glob("*.drawio")):
        raw = path.read_bytes()
        cells = raw.count(b"<mxCell ")
        pages = raw.count(b"<diagram ")
        print(
            f"{path.name}: {len(raw)} bytes, "
            f"{cells} mxCell elements, {pages} pages"
        )

if __name__ == "__main__":
    main()
