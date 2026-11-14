// Measures and repairs the pale margins at the edges of the walk's bundled picture
// (apple/SymphonyOS/SymphonyOS/App/Assets.xcassets/WalkOverlook.imageset/walk-overlook.jpg).
// The picture's size and geometry never change: the art's bands and stops are
// fractions of the image. A repaired margin repeats the nearest clean column (left,
// right) or row (top, bottom).
//
//   swift scripts/repair-walk-overlook-edges.swift measure <jpg>
//   swift scripts/repair-walk-overlook-edges.swift repair <in.jpg> <out.jpg> <left> <right> <top> <bottom> <quality>
//
// `measure` prints, for each edge, the mean brightness (0–255) of its first 16
// columns or rows, beside the mean of the columns or rows 20–40 px inside.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

struct Bitmap {
    let width: Int, height: Int
    var bytes: [UInt8]          // RGBA, 8 bits each, premultiplied (alpha is opaque)
    let space: CGColorSpace

    init(_ url: URL) {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("cannot read \(url.path)") }
        width = image.width; height = image.height
        space = image.colorSpace ?? CGColorSpace(name: CGColorSpace.sRGB)!
        bytes = [UInt8](repeating: 0, count: width * height * 4)
        let ctx = CGContext(data: &bytes, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                            space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    }

    /// Row 0 is the top of the picture.
    func luma(_ x: Int, _ y: Int) -> Double {
        let i = (y * width + x) * 4
        return 0.299 * Double(bytes[i]) + 0.587 * Double(bytes[i + 1]) + 0.114 * Double(bytes[i + 2])
    }
    func column(_ x: Int) -> Double { (0..<height).reduce(0) { $0 + luma(x, $1) } / Double(height) }
    func row(_ y: Int) -> Double { (0..<width).reduce(0) { $0 + luma($1, y) } / Double(width) }

    mutating func copyColumn(from src: Int, to dst: Int) {
        for y in 0..<height { for c in 0..<4 { bytes[(y * width + dst) * 4 + c] = bytes[(y * width + src) * 4 + c] } }
    }
    mutating func copyRow(from src: Int, to dst: Int) {
        for x in 0..<width { for c in 0..<4 { bytes[(dst * width + x) * 4 + c] = bytes[(src * width + x) * 4 + c] } }
    }

    func write(_ url: URL, quality: Double) {
        var data = bytes
        let ctx = CGContext(data: &data, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                            space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let image = ctx.makeImage()!
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
        else { fatalError("cannot write \(url.path)") }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { fatalError("cannot finish \(url.path)") }
    }
}

func measure(_ b: Bitmap) {
    func inside(_ f: (Int) -> Double, _ at: (Int) -> Int) -> Double { (20...40).reduce(0) { $0 + f(at($1)) } / 21 }
    let edges: [(String, (Int) -> Double, (Int) -> Int)] = [
        ("left", b.column, { $0 }), ("right", b.column, { b.width - 1 - $0 }),
        ("top", b.row, { $0 }), ("bottom", b.row, { b.height - 1 - $0 }),
    ]
    print("size \(b.width) x \(b.height)")
    for (name, f, at) in edges {
        let ref = inside(f, at)
        let firsts = (0..<16).map { String(format: "%.1f", f(at($0))) }.joined(separator: " ")
        print("\(name): inside(20–40) \(String(format: "%.1f", ref)) | edge 0…15: \(firsts)")
    }
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "measure" where args.count == 3:
    measure(Bitmap(URL(fileURLWithPath: args[2])))
case "repair" where args.count == 9:
    var b = Bitmap(URL(fileURLWithPath: args[2]))
    let n = args[4...7].map { Int($0)! }
    let (left, right, top, bottom) = (n[0], n[1], n[2], n[3])
    for x in 0..<left { b.copyColumn(from: left, to: x) }
    for x in 0..<right { b.copyColumn(from: b.width - 1 - right, to: b.width - 1 - x) }
    for y in 0..<top { b.copyRow(from: top, to: y) }
    for y in 0..<bottom { b.copyRow(from: b.height - 1 - bottom, to: b.height - 1 - y) }
    b.write(URL(fileURLWithPath: args[3]), quality: Double(args[8])!)
    print("wrote \(args[3])")
default:
    print("usage: measure <jpg> | repair <in> <out> <left> <right> <top> <bottom> <quality>")
    exit(2)
}
