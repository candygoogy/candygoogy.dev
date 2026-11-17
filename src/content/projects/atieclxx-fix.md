---
name: atieclxx-fix
blurb: Stops AMD’s driver writing 40–55 GB a day to your SSD
summary: "A fix for an AMD Radeon driver bug: atieclxx.exe copies the same file to the system drive about once a second, 40–55 GB a day. It blocks only that copy, with one file permission, so the AMD service and FreeSync keep working. Adrenalin 26.11.1 fixes it for the Radeon RX 7000 series and above."
kind: side
status: live
date: 2026-11-10
version: 1.1.2
repo: candygoogy/atieclxx-fix
license: MIT
runsOn: Windows 10 and 11 with an AMD Radeon card
stack: [PowerShell]
links:
  source: https://github.com/candygoogy/atieclxx-fix
---
