---
name: Install diff
blurb: What an installer did to your PC, in plain words
featured: true
summary: "A free, open-source command-line tool for Windows. It tells you, in plain words, what an app’s installer did to your PC and what it left behind after you uninstalled it. It only reads."
kind: product
status: live
date: 2026-10-14
version: 1.0.0
repo: fettle-page/idiff
license: MIT
runsOn: Windows 10 and 11 (64-bit)
command: idiff
stack: [Rust]
story:
  why: "Installers can do far more than copy files: add background services with full system rights, schedule daily updaters, start with Windows, open the firewall. Windows doesn’t tell you, and uninstalling often leaves some of it behind."
  hard: "Telling the app’s changes apart from Windows’ own, which keeps working the whole time. A file’s place in the Windows folder proved nothing: well-known apps put their own drivers and services there, and Microsoft signs other companies’ drivers, so only Windows’ own signature counts. Many apps also add themselves to startup only the first time they open, so idiff asks you to open the app once before it looks again."
  promise: "It only reads. It never changes, cleans or removes anything, and it runs only the one command you give it."
links:
  source: https://github.com/fettle-page/idiff
images: []
receipt:
  title: Visual Studio Code 1.141.2, installed and removed
  how: Installed with winget, then uninstalled.
  groups:
    - label: Installed
      lines:
        - "✓ No services, drivers or firewall rules"
        - "· Adds right-click menu entries"
        - '· Adds to PATH: C:\Users\runneradmin\AppData\Local\Programs\Microsoft VS Code\bin'
        - "✓ Files only in your user folder (1.0 GB)"
        - "· Adds a Start menu entry"
        - "· 3 Windows background changes hidden (idiff show --all)"
    - label: After uninstall, no leftovers
      lines:
        - "✓ Nothing left behind"
  caption: Real output from the Receipts Library
  href: https://github.com/fettle-page/idiff/blob/main/receipts/microsoft.visualstudiocode/1.141.2.md
page:
  checks:
    - name: Services and drivers
      text: "New background services and drivers, with how they start and which account they run as."
    - name: Scheduled tasks
      text: "Every scheduled task, hidden ones included, with what it runs and when."
    - name: Startup
      text: "Everything set to start with Windows, and whether it’s turned off in Task Manager."
    - name: Firewall and network
      text: "Firewall rules, the hosts file, the proxy and the network add-ons every program goes through."
    - name: Right-click menu and PATH
      text: "Right-click menu entries for files, folders and drives, and new entries in the PATH."
    - name: Files and shortcuts
      text: "New folders in Program Files, ProgramData and your user folder, with their size, and new desktop and Start menu shortcuts."
    - name: Certificates and antivirus exclusions
      text: "New trusted root certificates, and anything excluded from antivirus scans."
  checksNote: "Windows’ own background changes are hidden but counted. Anything idiff can’t tell apart gets its own section, and if it couldn’t check something, the receipt says why."
  uses:
    - text: "Run an installer through it, open the app once when it asks, and read the receipt: services, scheduled tasks, startup entries, firewall rules and where the files went."
    - text: "After you uninstall, it shows what’s still there: the task that kept running, the folder that stayed behind and how much space it takes."
    - text: "Export a receipt as Markdown, HTML or JSON to attach to a ticket or a forum post. Your user name and PC name are taken out unless you ask for them."
    - text: "Or skip the install: the Receipts Library on GitHub has receipts for popular apps, made by installing each one on a fresh test machine."
      link:
        text: "Receipts Library"
        href: https://github.com/fettle-page/idiff/tree/main/receipts
  privacy: "Nothing is sent anywhere: every run stays on your PC. Exports leave out your user name, full name, PC name, domain, email addresses, profile folders and network addresses, unless you ask for them."
---
