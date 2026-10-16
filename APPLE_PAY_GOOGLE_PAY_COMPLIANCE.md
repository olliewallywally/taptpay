# Apple Pay and Google Pay implementation status

This repository does not establish wallet or PCI compliance approval. R7 removed
the placeholder wallet components and fake payment/merchant-validation behavior.
Native Tap to Pay is unavailable and FEATURE_TAP_TO_PAY must remain false.

A provider-hosted checkout may offer wallet methods only after the provider,
merchant configuration, browser/device compatibility and real UAT are verified.
It is not a verified TaptPay native wallet implementation. No generic browser
Payment Request API, branded button, provider certification or successful
synthetic test proves our own data-flow/PCI/SAQ scope or brand approval.

See [the R7 capability release runbook](docs/operations/r7-native-capability-release.md)
and [the current claims matrix](docs/operations/r8-truthfulness-and-release-gates.md).
Future native support needs an approved provider SDK, required entitlements and
identities, a signed native build, actual device/provider tests and separate
release approval. Do not add fabricated tokens, approval results or native stubs.
