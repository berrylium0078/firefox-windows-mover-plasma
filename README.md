# Firefox Extension Plasma Desktop Fix

## Description

I'm using KDE + Wayland, but appearantly Firefox has no aware of the virtual desktop system, so I wrote this extension to fix this problem.

What can this extension do:
1. Attach new tabs to the latest focused window that is on the current virtual desktop (& activity).
2. When a window is reopened (shortcut Ctrl+Shift+N), it will be moved back to where it had been before it was closed.

This extension only supports KDE, but forks or pull requests are welcomed.

## Usage

- Clone this repository.
- You can search for 'Plasma Desktop Fix' to install the extension. You can also run `make` to build the `.xpi`.
- Run `sudo make install` to install native messaging host, and `sudo make uninstall` to uninstall.

## How it works

- It employs a native host to manipulate the window system, and listen for events. Implemented with KWinScript and PyQDbus.
- The window id will be shown in the window's title (hidden since Firefox doesn't use the system title bar), in order that the local host can identify them.

- When a tab is created in the wrong window, we can forcefully move it back.
  - A tab is considered to belong to the desktop you was a moment ago. (currently 100ms)
  - However, if you open a new window immediately after switching desktop, such action will be misinterpreted.

## Issues

- May break under intense operations.
- "Open link in new window" might be mistaken and result in "Open in new tab".
- Not well optimized, may have performance issues when there are too many windows.
- Uses Firefox's session API, which is not compatible with other browser.
- Due to Firefox's limitation, can only remember 5 windows (although documentation implies a maximum of 25 sessions).
- Appears that KWinScripts can't listen for a DBus signal. A workaround is to ask for incoming messages periodically (e.g. every 20ms).
