---
name: Owner-controlled restore verification
description: Safe process for verifying encrypted backups when the recovery private key stays on the owner’s computer.
---

Keep the long-lived recovery private key on the owner-controlled machine. For a restore rehearsal, decrypt there, immediately re-encrypt to a short-lived transfer key whose private half exists only in the isolated restore environment, and upload only the transfer ciphertext.

**Why:** This proves that the retained backup is decryptable while preventing the recovery private key or plaintext production dump from being uploaded. The restore environment can stream-decrypt directly into a disposable database and keep production read-only.

**How to apply:** Verify the transfer recipient fingerprint, restore only into an independently identified disposable target, compare schema and count-only fingerprints, then destroy the transfer key, uploaded ciphertext, and owner-side plaintext. Retain only the original recovery-key-encrypted backup.