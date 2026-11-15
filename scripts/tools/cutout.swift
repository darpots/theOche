import Foundation
import Vision
import CoreImage
import AppKit

// usage: cutout <in> <out.png>
let args = CommandLine.arguments
let input = URL(fileURLWithPath: args[1]), output = URL(fileURLWithPath: args[2])
guard let ci = CIImage(contentsOf: input) else { fatalError("bad image") }
let handler = VNImageRequestHandler(ciImage: ci)
let req = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([req])
guard let result = req.results?.first else { fatalError("no subject") }
// Keep the largest instance (the player)
let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
let outCI = CIImage(cvPixelBuffer: buffer)
let ctx = CIContext()
try ctx.writePNGRepresentation(of: outCI, to: output, format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
print("ok", Int(outCI.extent.width), Int(outCI.extent.height))
