import Foundation
import Vision
import CoreImage

// usage: faces <image>...   prints: path<TAB>cx<TAB>cy<TAB>h  (0-1, origin top-left)
// for the largest face in each image, or "-" when none is found.
for path in CommandLine.arguments.dropFirst() {
  guard let ci = CIImage(contentsOf: URL(fileURLWithPath: path)) else { print("\(path)\t-"); continue }
  let req = VNDetectFaceRectanglesRequest()
  try? VNImageRequestHandler(ciImage: ci).perform([req])
  guard let f = (req.results ?? []).max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) else { print("\(path)\t-"); continue }
  let b = f.boundingBox
  print(String(format: "%@\t%.4f\t%.4f\t%.4f", path, b.midX, 1 - b.midY, b.height))
}
