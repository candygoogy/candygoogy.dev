---
name: tellall
blurb: What an image or a text gives away, and a clean copy
summary: "A free, open-source privacy check for images and copied text. It tells you in plain sentences what they give away and makes a clean copy, on your device."
featured: true
kind: product
status: live
date: 2026-10-28
version: 0.1.1
repo: candygoogy/tellall
license: MIT
runsOn: A web browser, or Node.js 20.19 or later
os: "Web browser, Node.js 20.19 or later"
category: SecurityApplication
stack: [TypeScript, Vite, Cloudflare Workers]
story:
  why: "An image from ChatGPT names who made it, the exact time, and says it’s watermarked. A phone photo can hold the place it was taken, and a copied text can hide characters you can’t see. I wanted to read all of it in plain sentences, and get a clean copy."
  hard: "Cleaning a copy without touching the picture. The copy keeps only what the picture needs, such as its colour profile, so metadata tellall has never seen goes too, and the pixels stay the same byte for byte. In an Ultra HDR photo the gain map is a second picture after the end of the JPEG, so the copy keeps it and cleans it too. In a HEIC every part is found by where it sits in the file, so tellall blanks what it removes and moves nothing. AI labels are signed, and when a clean copy keeps a label that no longer matches the file, tellall says so."
  promise: "It doesn’t guess whether an image is AI: it reads the labels the file carries and tells you what they say. Your files never leave your device, the original is left alone, and the web page never removes AI labels."
links:
  live: https://tellall.candygoogy.dev
  source: https://github.com/candygoogy/tellall
images: []
page:
  checksTitle: What it reads
  usesTitle: How you use it
  bandLink: "What tellall does, and how it handles privacy"
  checks:
    - name: AI labels
      text: "C2PA labels: who signed them, the tool, the time, any watermark claim, and whether the signature matches the file. Also the IPTC tag that says a picture came from AI."
    - name: Place and camera
      text: "Location, camera, lens, serial numbers, dates, and the software that saved the file."
    - name: Tracking IDs
      text: "The IDs that link copies of the same file to each other."
    - name: Names and comments
      text: "Names, captions and comments, and details it finds but can’t name."
    - name: Hidden characters
      text: "Zero-width, tag and variation-selector characters in a text, decoded when they spell something, and direction controls and other invisible formatting."
    - name: Formatted copies
      text: "Response IDs, class names, styles and hidden parts in a formatted copy, and a note on the page address your browser may add to it."
  checksNote: "Images in JPEG, PNG, WebP and HEIC, though WebP labels can be found but not read yet. Texts pasted, piped in, or saved as .txt or .md. Usually harmless characters, such as emoji joiners, are listed but don’t count."
  uses:
    - text: "Drop images on the web page or paste a text, then download a clean copy, several as a zip, or copy the text without its hidden characters."
    - text: "Run npx tellall on a file in a terminal, and npx tellall clean to write a clean copy next to it. When there’s nothing to remove, it writes no copy and says so."
    - text: "Install the agent skill in Claude Code, Codex or Cursor and ask what an image gives away. It explains the result in the same plain words."
    - text: "For a watermark hidden in the pixels, which tellall can’t see, the page links Google’s and OpenAI’s own checkers."
  privacy: "Files never leave your device. The web page reads them in your browser, and its Content Security Policy blocks any upload or connection the page’s code tries. It loads only from its own address, with no third-party scripts, fonts or images, and once loaded it still works with Wi-Fi off.\n\nThe command-line tool reads and writes files on your machine and makes no network requests. Only npx itself downloads the package."
---
