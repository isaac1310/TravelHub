import Foundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

// argv: <in.png> <out.webp> <maxWidth> <quality 0..1>
let a = CommandLine.arguments
guard a.count == 5,
      let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil),
      let maxW = Int(a[3]), let q = Double(a[4]) else {
    FileHandle.standardError.write("usage: enc in out maxWidth quality\n".data(using: .utf8)!); exit(2)
}
let scale = min(1.0, Double(maxW) / Double(img.width))
let w = Int((Double(img.width) * scale).rounded()), h = Int((Double(img.height) * scale).rounded())
guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpace(name: CGColorSpace.sRGB)!,
                          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(3) }
ctx.interpolationQuality = .high
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
guard let out = ctx.makeImage() else { exit(4) }
let ext = (a[2] as NSString).pathExtension.lowercased()
let type = (ext == "webp" ? UTType.webP : UTType.jpeg).identifier as CFString
guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, type, 1, nil) else {
    FileHandle.standardError.write("WebP encoding unavailable on this system\n".data(using: .utf8)!); exit(5)
}
CGImageDestinationAddImage(dest, out, [kCGImageDestinationLossyCompressionQuality: q] as CFDictionary)
guard CGImageDestinationFinalize(dest) else { exit(6) }
print("\(a[2]) \(w)x\(h)")
