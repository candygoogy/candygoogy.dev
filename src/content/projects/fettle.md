---
name: Fettle
blurb: Windows check-up, printed as a readable receipt
featured: true
summary: "A free, open-source check-up for Windows PCs. It reads what Windows already knows and prints it as a receipt: a plain-words verdict on every line, the next steps at the top, and the numbers underneath for anyone who wants them."
kind: product
status: live
date: 2026-10-10
version: 1.0.5
repo: fettle-page/fettle
license: MIT
runsOn: Windows 10 and 11 (64-bit)
stack: [Rust, Slint, WebAssembly, Astro, Cloudflare Workers]
story:
  why: "Most people can’t tell whether their PC is healthy. The tools that could tell them show raw numbers for people who already know what they mean. Fettle reads the same data and says what it means: verdicts first, numbers second."
  hard: "Reading disk and TPM health without administrator rights, and making sense of SSD wear values that every maker reports differently. Partway through, I replaced the Tauri desktop app with a native Slint one, and swapped the website’s TypeScript engine for the same Rust code compiled to WebAssembly, checked against the old one on 405 test cases in English and Italian."
  promise: "It only reads. It doesn’t clean, “boost” or change anything, and it sends nothing on its own except an update check you can turn off."
links:
  live: https://fettle.page
  source: https://github.com/fettle-page/fettle
images:
  - light: ./fettle/receipt-light.png
    dark: ./fettle/receipt-dark.png
    alt: "Fettle’s window. On the left, a receipt for an older laptop that says Needs attention, with three next steps and a storage line marked Watch. On the right, the main verdict, a Deep check offer and the Share, Print, Save and Copy buttons."
    caption: "The receipt: a plain verdict on every line, with the next steps at the top."
    phone:
      light: ./fettle/receipt-light-phone.png
      dark: ./fettle/receipt-dark-phone.png
  - light: ./fettle/print-light.png
    dark: ./fettle/print-dark.png
    alt: "Fettle’s print preview: the receipt laid out on an A4 page."
    caption: "The print preview, on an A4 page."
    phone:
      light: ./fettle/print-light-phone.png
      dark: ./fettle/print-dark-phone.png
  - light: ./fettle/share-light.png
    dark: ./fettle/share-dark.png
    alt: "Fettle’s Share view: keep the link for 7 days, 30 days or a year, and an optional password."
    caption: "The Share view."
    phone:
      light: ./fettle/share-light-phone.png
      dark: ./fettle/share-dark-phone.png
page:
  checks:
    - name: Storage
      text: "Wear, errors, temperature and free space, on NVMe and SATA. An optional Deep check reads disk health that needs administrator rights."
    - name: Battery
      text: "How much charge it still holds compared with new, and how many cycles it has done."
    - name: Memory
      text: "Sticks, slots, speed, and whether a second stick would help."
    - name: Windows
      text: "Edition, security updates, Windows 11 readiness, restarts."
    - name: Startup
      text: "Everything that starts with Windows."
    - name: Graphics
      text: "The graphics card and how old its driver is."
  checksNote: "If Fettle couldn’t check something, the receipt says so, and says why."
  uses:
    - text: "Print it, or save it as a PDF. The preview shows the pages exactly as they’ll print, on the paper Windows is set up for."
      shot: 1
    - text: "Share it as a link that lasts 7 days, 30 days or a year, with an optional password, and delete it whenever you like. It opens in any browser, so nobody needs Fettle to read it."
      shot: 2
    - text: "Copy it as formatted text for a forum, Discord or Reddit, so whoever is helping you sees the same receipt. Or save the full report as JSON, with every number Fettle read."
    - text: "Read it in English or Italian, with light, dark and OLED themes. The app, the PDF and the share page all draw the receipt from the same code, so it reads the same everywhere."
  privacy: "Reports leave out serial numbers, the PC’s name, your username, name and email address, the work or school domain, network addresses and the names of servers on your network. Product keys are never read.\n\nA share link uploads the report behind the receipt you see, with those details taken out, and only when you ask. It’s stored in Cloudflare’s EU data centers, expires when you choose, can have a password (stored only as a hash), and can be deleted with a private link.\n\nFettle sends nothing else on its own except an update check, which you can turn off. Its website uses no cookies, no analytics and no third-party requests."
  learned: "That a rewrite isn’t finished until it gives the same answers as the code it replaces. Comparing the two engines is what let me make the switch.\n\nThat a plain verdict is harder to write than a table of numbers, because it has to be right for someone who can’t check it."
---
