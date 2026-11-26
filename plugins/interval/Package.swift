// swift-tools-version: 5.9
import PackageDescription

// Local plugin. The package and product name must be "AlloutInterval":
// Capacitor derives it from the npm name "allout-interval".
let package = Package(
    name: "AlloutInterval",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "AlloutInterval",
            targets: ["IntervalPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "IntervalPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/IntervalPlugin")
    ]
)
